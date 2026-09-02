import { isLocale } from "@/lib/i18n";
import { resolveOpenEnaRequestOrigin } from "@/lib/open-ena-auth-request";
import { readPluginLabConfiguration, type PluginLabEnvironment } from "@/lib/plugin-lab/config";
import { equalPluginLabAccessHash, hashPluginLabAccessCode, isPluginLabAccessCode, isPluginLabProposalId, issuePluginLabStatusSession, PLUGIN_LAB_STATUS_COOKIE, PLUGIN_LAB_STATUS_MAX_AGE_SECONDS } from "@/lib/plugin-lab/crypto";
import { createProductionPluginLabStore, type PluginLabStore } from "@/lib/plugin-lab/store";
import { createPluginLabRequestSourceRef } from "@/lib/server/plugin-lab-proposal-route";

type Dependencies = { environment?: PluginLabEnvironment; storeFactory?: () => Promise<PluginLabStore | null>; now?: () => number };
function safe(body: string, status: number, headers: HeadersInit = {}) { return new Response(body, { status, headers: { "cache-control": "no-store", ...headers } }); }

export function createPluginLabStatusSessionPostHandler(dependencies: Dependencies = {}) {
  const environment = dependencies.environment ?? process.env; const now = dependencies.now ?? Date.now;
  return async function handle(request: Request) {
    const origin = resolveOpenEnaRequestOrigin(request.headers, new URL(request.url).origin, environment); if (!origin) return safe("Invalid request origin.", 403);
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/x-www-form-urlencoded") return safe("Proposal access was not accepted.", 403);
    const declared = request.headers.get("content-length"); if (declared && (!/^\d+$/u.test(declared) || Number(declared) > 8_192)) return safe("Proposal access was not accepted.", 403);
    const configuration = readPluginLabConfiguration(environment); if (!configuration) return safe("Plugin Lab is unavailable.", 503);
    let body: string; try { body = await request.text(); } catch { return safe("Proposal access was not accepted.", 403); } if (Buffer.byteLength(body, "utf8") > 8_192) return safe("Proposal access was not accepted.", 403);
    const form = new URLSearchParams(body); const locale = form.get("locale") ?? ""; const proposalId = form.get("proposalId") ?? ""; const accessCode = form.get("accessCode") ?? "";
    if (!isLocale(locale) || !isPluginLabProposalId(proposalId) || !isPluginLabAccessCode(accessCode)) return safe("Proposal access was not accepted.", 403);
    let store: PluginLabStore | null; try { store = await (dependencies.storeFactory?.() ?? createProductionPluginLabStore(environment)); } catch { store = null; } if (!store) return safe("Plugin Lab is unavailable.", 503);
    const scopeRef = createPluginLabRequestSourceRef(request, configuration.secret, "status-source");
    try { if (!await store.consumeRateLimit({ scopeKind: "status-source", scopeRef, limit: 10, windowSeconds: 900 })) return safe("Proposal access was not accepted.", 403); } catch { return safe("Plugin Lab is unavailable.", 503); }
    let stored: string | null; try { stored = await store.accessHashFor(proposalId); } catch { return safe("Plugin Lab is unavailable.", 503); }
    let supplied: string; try { supplied = hashPluginLabAccessCode(proposalId, accessCode, configuration.secret); } catch { return safe("Proposal access was not accepted.", 403); }
    if (!stored || !equalPluginLabAccessHash(stored, supplied)) return safe("Proposal access was not accepted.", 403);
    const token = issuePluginLabStatusSession(proposalId, now(), configuration.secret); const destination = new URL(`/${locale}/plugins/status`, origin);
    const cookie = `${PLUGIN_LAB_STATUS_COOKIE}=${token}; Max-Age=${PLUGIN_LAB_STATUS_MAX_AGE_SECONDS}; Path=/${locale}/plugins/status; HttpOnly; Secure; SameSite=Lax`;
    return safe("", 303, { location: destination.toString(), "set-cookie": cookie });
  };
}
