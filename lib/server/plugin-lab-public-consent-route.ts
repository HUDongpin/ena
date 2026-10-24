import { createHmac } from "node:crypto";
import { resolveOpenEnaRequestOrigin } from "@/lib/open-ena-auth-request";
import { readPluginLabConfiguration, type PluginLabEnvironment } from "@/lib/plugin-lab/config";
import { isPluginLabProposalId, PLUGIN_LAB_STATUS_COOKIE, verifyPluginLabStatusSession } from "@/lib/plugin-lab/crypto";
import { createProductionPluginLabStore, type PluginLabStore } from "@/lib/plugin-lab/store";
import { readPluginLabBoundedBody } from "@/lib/server/plugin-lab-proposal-route";
import { isPluginLabOpaqueToken, PLUGIN_LAB_LEGACY_COOKIE, PLUGIN_LAB_RESEARCHER_COOKIE } from "@/lib/plugin-lab/workflow-security";
import { workflowContext, workflowOwner } from "./plugin-lab-workflow-context";
import type { WorkflowStore } from "@/lib/plugin-lab/workflow-types";

type Dependencies = { environment?: PluginLabEnvironment; storeFactory?: () => Promise<PluginLabStore | null>; workflowStoreFactory?: () => Promise<WorkflowStore | null>; now?: () => number };
function safe(body: string, status: number) { return new Response(body, { status, headers: { "cache-control": "no-store" } }); }
function cookie(headers: Headers, name: string) { for (const segment of (headers.get("cookie") ?? "").split(";")) { const [key, ...rest] = segment.trim().split("="); if (key === name) return rest.join("="); } return undefined; }

export function createPluginLabPublicConsentPostHandler(dependencies: Dependencies = {}) {
  const environment = dependencies.environment ?? process.env; const now = dependencies.now ?? Date.now;
  return async function handle(request: Request): Promise<Response> {
    if (!resolveOpenEnaRequestOrigin(request.headers, new URL(request.url).origin, environment)) return safe("Invalid request origin.", 403);
    const configuration = readPluginLabConfiguration(environment); if (!configuration) return safe("Plugin Lab is unavailable.", 503);
    const researcherToken = cookie(request.headers, PLUGIN_LAB_RESEARCHER_COOKIE);
    const sessionToken = cookie(request.headers, PLUGIN_LAB_LEGACY_COOKIE) ?? cookie(request.headers, PLUGIN_LAB_STATUS_COOKIE);
    // A signed-in email identity always wins over stale receipt cookies.
    // Never silently fall back to another identity if that session has expired.
    const session = researcherToken === undefined ? verifyPluginLabStatusSession(sessionToken, now(), configuration.secret) : null;
    if (!session && !isPluginLabOpaqueToken(researcherToken)) return safe("Proposal status authentication required.", 401);
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return safe("Invalid consent request.", 400);
    const declared = request.headers.get("content-length"); if (declared && (!/^\d+$/u.test(declared) || Number(declared) > 2_048)) return safe("Invalid consent request.", 400);
    let body: unknown; try { const bytes = await readPluginLabBoundedBody(request, 2_048); body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return safe("Invalid consent request.", 400); }
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 3
      || !Object.hasOwn(body, "action") || !Object.hasOwn(body, "proposalId") || !Object.hasOwn(body, "publicProjectionSha256")) return safe("Invalid consent request.", 400);
    const { action, proposalId, publicProjectionSha256 } = body as Record<string, unknown>;
    if ((action !== "confirm" && action !== "withdraw") || typeof proposalId !== "string" || !isPluginLabProposalId(proposalId)
      || typeof publicProjectionSha256 !== "string" || !/^[0-9a-f]{64}$/u.test(publicProjectionSha256)) return safe("Invalid consent request.", 400);
    if (session && proposalId !== session.proposalId) return safe("Proposal consent state changed; reload before retrying.", 409);
    let emailActor = "";
    if (!session) {
      const context = await workflowContext({ environment, storeFactory: dependencies.workflowStoreFactory, now: () => new Date(now()) });
      if (!context) return safe("Plugin Lab is unavailable.", 503);
      try {
        const owner = await workflowOwner(request, context);
        if (!owner || !("emailRef" in owner)) return safe("Proposal status authentication required.", 401);
        if (!await context.store.readOwned(proposalId, owner)) return safe("Proposal not found.", 404);
        emailActor = owner.emailRef;
      } catch { return safe("Plugin Lab is unavailable.", 503); }
    }
    let store: PluginLabStore | null; try { store = await (dependencies.storeFactory?.() ?? createProductionPluginLabStore(environment)); } catch { store = null; } if (!store) return safe("Plugin Lab is unavailable.", 503);
    const actorRef = createHmac("sha256", configuration.secret).update(emailActor ? `ena-plugin-lab-proposer-email:${proposalId}:${emailActor}` : `ena-plugin-lab-proposer-status:${proposalId}:${sessionToken}`, "utf8").digest("base64url");
    let changed: boolean; try { changed = await store.setPublicConsent(proposalId, action, actorRef, publicProjectionSha256); } catch { return safe("Plugin Lab is unavailable.", 503); }
    if (!changed) return safe("Proposal consent state changed; reload before retrying.", 409);
    return Response.json({ proposalId, publicConsentStatus: action === "confirm" ? "confirmed" : "withdrawn" }, { headers: { "cache-control": "no-store" } });
  };
}
