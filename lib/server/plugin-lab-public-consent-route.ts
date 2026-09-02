import { createHmac } from "node:crypto";
import { resolveOpenEnaRequestOrigin } from "@/lib/open-ena-auth-request";
import { readPluginLabConfiguration, type PluginLabEnvironment } from "@/lib/plugin-lab/config";
import { PLUGIN_LAB_STATUS_COOKIE, verifyPluginLabStatusSession } from "@/lib/plugin-lab/crypto";
import { createProductionPluginLabStore, type PluginLabStore } from "@/lib/plugin-lab/store";

type Dependencies = { environment?: PluginLabEnvironment; storeFactory?: () => Promise<PluginLabStore | null>; now?: () => number };
function safe(body: string, status: number) { return new Response(body, { status, headers: { "cache-control": "no-store" } }); }
function cookie(headers: Headers, name: string) { for (const segment of (headers.get("cookie") ?? "").split(";")) { const [key, ...rest] = segment.trim().split("="); if (key === name) return rest.join("="); } return undefined; }

export function createPluginLabPublicConsentPostHandler(dependencies: Dependencies = {}) {
  const environment = dependencies.environment ?? process.env; const now = dependencies.now ?? Date.now;
  return async function handle(request: Request): Promise<Response> {
    if (!resolveOpenEnaRequestOrigin(request.headers, new URL(request.url).origin, environment)) return safe("Invalid request origin.", 403);
    const configuration = readPluginLabConfiguration(environment); if (!configuration) return safe("Plugin Lab is unavailable.", 503);
    const sessionToken = cookie(request.headers, PLUGIN_LAB_STATUS_COOKIE);
    const session = verifyPluginLabStatusSession(sessionToken, now(), configuration.secret);
    if (!session) return safe("Proposal status authentication required.", 401);
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return safe("Invalid consent request.", 400);
    const declared = request.headers.get("content-length"); if (declared && (!/^\d+$/u.test(declared) || Number(declared) > 2_048)) return safe("Invalid consent request.", 400);
    let body: unknown; try { const text = await request.text(); if (Buffer.byteLength(text, "utf8") > 2_048) throw new Error(); body = JSON.parse(text); } catch { return safe("Invalid consent request.", 400); }
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, "action")) return safe("Invalid consent request.", 400);
    const action = (body as { action?: unknown }).action; if (action !== "confirm" && action !== "withdraw") return safe("Invalid consent request.", 400);
    let store: PluginLabStore | null; try { store = await (dependencies.storeFactory?.() ?? createProductionPluginLabStore(environment)); } catch { store = null; } if (!store) return safe("Plugin Lab is unavailable.", 503);
    const actorRef = createHmac("sha256", configuration.secret).update(`ena-plugin-lab-proposer-status:${session.proposalId}:${sessionToken}`, "utf8").digest("base64url");
    let changed: boolean; try { changed = await store.setPublicConsent(session.proposalId, action, actorRef); } catch { return safe("Plugin Lab is unavailable.", 503); }
    if (!changed) return safe("Proposal consent state changed; reload before retrying.", 409);
    return Response.json({ proposalId: session.proposalId, publicConsentStatus: action === "confirm" ? "confirmed" : "withdrawn" }, { headers: { "cache-control": "no-store" } });
  };
}
