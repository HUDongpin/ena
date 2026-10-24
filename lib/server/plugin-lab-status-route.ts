import { isLocale } from "@/lib/i18n";
import { resolveOpenEnaRequestOrigin } from "@/lib/open-ena-auth-request";
import { readPluginLabConfiguration, type PluginLabEnvironment } from "@/lib/plugin-lab/config";
import { equalPluginLabAccessHash, hashPluginLabAccessCode, isPluginLabAccessCode, isPluginLabProposalId, issuePluginLabStatusSession, PLUGIN_LAB_STATUS_COOKIE, PLUGIN_LAB_STATUS_MAX_AGE_SECONDS } from "@/lib/plugin-lab/crypto";
import { createProductionPluginLabStore, type PluginLabStore } from "@/lib/plugin-lab/store";
import { createPluginLabRequestSourceRef, readPluginLabBoundedBody } from "@/lib/server/plugin-lab-proposal-route";

import { PLUGIN_LAB_LEGACY_COOKIE, PLUGIN_LAB_RESEARCHER_COOKIE, pluginLabSessionCookie } from "@/lib/plugin-lab/workflow-security";

type Dependencies = { environment?: PluginLabEnvironment; storeFactory?: () => Promise<PluginLabStore | null>; now?: () => number };
function safe(body: string, status: number, headers: HeadersInit = {}) { return new Response(body, { status, headers: { "cache-control": "no-store", ...headers } }); }

export function createPluginLabStatusSessionPostHandler(dependencies: Dependencies = {}) {
  const environment = dependencies.environment ?? process.env; const now = dependencies.now ?? Date.now;
  return async function handle(request: Request) {
    const wantsJson = request.headers.get("accept")?.includes("application/json") === true;
    const respond = (body: string, status: number, headers: HeadersInit = {}) => wantsJson
      ? Response.json({ code: status === 503 ? "service-unavailable" : "invalid-access" }, { status, headers: { "cache-control": "no-store", ...headers } })
      : safe(body, status, headers);
    const origin = resolveOpenEnaRequestOrigin(request.headers, new URL(request.url).origin, environment); if (!origin) return respond("Invalid request origin.", 403);
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/x-www-form-urlencoded") return respond("Proposal access was not accepted.", 403);
    const declared = request.headers.get("content-length"); if (declared && (!/^\d+$/u.test(declared) || Number(declared) > 8_192)) return respond("Proposal access was not accepted.", 403);
    const configuration = readPluginLabConfiguration(environment); if (!configuration) return respond("Plugin Lab is unavailable.", 503);
    let body: string;
    try { body = new TextDecoder("utf-8", { fatal: true }).decode(await readPluginLabBoundedBody(request, 8_192)); }
    catch { return respond("Proposal access was not accepted.", 403); }
    const form = new URLSearchParams(body); const locale = form.get("locale") ?? ""; const proposalId = form.get("proposalId") ?? ""; const accessCode = form.get("accessCode") ?? "";
    if (!isLocale(locale) || !isPluginLabProposalId(proposalId) || !isPluginLabAccessCode(accessCode)) return respond("Proposal access was not accepted.", 403);
    let store: PluginLabStore | null; try { store = await (dependencies.storeFactory?.() ?? createProductionPluginLabStore(environment)); } catch { store = null; } if (!store) return respond("Plugin Lab is unavailable.", 503);
    const scopeRef = createPluginLabRequestSourceRef(request, configuration.secret, "status-source", environment);
    try { if (!await store.consumeRateLimit({ scopeKind: "status-source", scopeRef, limit: 10, windowSeconds: 900 })) return respond("Proposal access was not accepted.", 403); } catch { return respond("Plugin Lab is unavailable.", 503); }
    let stored: string | null; try { stored = await store.accessHashFor(proposalId); } catch { return respond("Plugin Lab is unavailable.", 503); }
    let supplied: string; try { supplied = hashPluginLabAccessCode(proposalId, accessCode, configuration.secret); } catch { return respond("Proposal access was not accepted.", 403); }
    if (!stored || !equalPluginLabAccessHash(stored, supplied)) return respond("Proposal access was not accepted.", 403);
    const token = issuePluginLabStatusSession(proposalId, now(), configuration.secret); const destination = new URL(`/${locale}/plugins/status`, origin);
    const cookie = `${PLUGIN_LAB_STATUS_COOKIE}=${token}; Max-Age=${PLUGIN_LAB_STATUS_MAX_AGE_SECONDS}; Path=/${locale}/plugins/status; HttpOnly; Secure; SameSite=Lax`;
    if (wantsJson) {
      const response = Response.json({ proposalId }, { headers: { "cache-control": "no-store" } });
      response.headers.append("set-cookie", pluginLabSessionCookie(PLUGIN_LAB_LEGACY_COOKIE, token));
      response.headers.append("set-cookie", pluginLabSessionCookie(PLUGIN_LAB_RESEARCHER_COOKIE, "", 0));
      return response;
    }
    return respond("", 303, { location: destination.toString(), "set-cookie": cookie });
  };
}
