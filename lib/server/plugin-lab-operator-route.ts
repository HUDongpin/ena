import { createHmac, timingSafeEqual } from "node:crypto";
import { verifyProductionOpenEnaSessionTokenV2 } from "@/lib/server/open-ena-auth-security-store";
import { OPEN_ENA_SESSION_COOKIE, type OpenEnaAuthEnvironment, type OpenEnaPrincipal } from "@/lib/open-ena-auth";
import { resolveOpenEnaRequestOrigin } from "@/lib/open-ena-auth-request";
import { readPluginLabConfiguration, type PluginLabEnvironment } from "@/lib/plugin-lab/config";
import { createPluginLabAccessCode, encryptPluginLabText, hashPluginLabAccessCode, isPluginLabProposalId } from "@/lib/plugin-lab/crypto";
import { assertPluginProposalTransition, isPluginProposalState } from "@/lib/plugin-lab/proposal";
import { createProductionPluginLabStore, type PluginLabStore } from "@/lib/plugin-lab/store";

type Environment = PluginLabEnvironment & OpenEnaAuthEnvironment;
type Dependencies = {
  environment?: Environment;
  storeFactory?: () => Promise<PluginLabStore | null>;
  verifyOperator?: (token: string | undefined) => Promise<OpenEnaPrincipal | null>;
  now?: () => number;
};

function safe(body: string, status: number, headers: HeadersInit = {}) { return new Response(body, { status, headers: { "cache-control": "no-store", ...headers } }); }
function cookie(headers: Headers, name: string) { for (const segment of (headers.get("cookie") ?? "").split(";")) { const [key, ...rest] = segment.trim().split("="); if (key === name) return rest.join("="); } return undefined; }
function hmac(value: string, secret: string) { return createHmac("sha256", secret).update(value, "utf8").digest("base64url"); }

export function createPluginLabOperatorCsrf(principal: OpenEnaPrincipal, secret: string) {
  return hmac(`ena-plugin-lab-operator-csrf-v1:${principal.jti}:${principal.expiresAtSeconds}`, secret);
}

function validCsrf(supplied: string | null, principal: OpenEnaPrincipal, secret: string) {
  if (!supplied || !/^[A-Za-z0-9_-]{43}$/u.test(supplied)) return false;
  const expected = createPluginLabOperatorCsrf(principal, secret);
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

async function boundedJson(request: Request) {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/u.test(declared) || Number(declared) > 8_192)) throw new TypeError("invalid body");
  const body = await request.text(); if (Buffer.byteLength(body, "utf8") > 8_192) throw new TypeError("invalid body");
  const parsed = JSON.parse(body) as unknown; if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.getPrototypeOf(parsed) !== Object.prototype) throw new TypeError("invalid body");
  return parsed as Record<string, unknown>;
}

async function authority(
  request: Request,
  dependencies: Dependencies,
  environment: Environment,
  secret: string,
): Promise<{ error: Response } | { principal: OpenEnaPrincipal }> {
  const token = cookie(request.headers, OPEN_ENA_SESSION_COOKIE);
  const principal = dependencies.verifyOperator
    ? await dependencies.verifyOperator(token)
    : await verifyProductionOpenEnaSessionTokenV2(token, Date.now(), environment);
  if (!principal) return { error: safe("Operator authentication required.", 401) } as const;
  if (!validCsrf(request.headers.get("x-plugin-lab-csrf"), principal, secret)) return { error: safe("Operator request was not accepted.", 403) } as const;
  return { principal } as const;
}

async function storeFor(dependencies: Dependencies, environment: Environment) {
  try { return await (dependencies.storeFactory?.() ?? createProductionPluginLabStore(environment)); } catch { return null; }
}

export function createPluginLabOperatorTransitionPostHandler(dependencies: Dependencies = {}) {
  const environment = (dependencies.environment ?? process.env) as Environment;
  return async function handle(request: Request, proposalId: string): Promise<Response> {
    if (!resolveOpenEnaRequestOrigin(request.headers, new URL(request.url).origin, environment)) return safe("Invalid request origin.", 403);
    const configuration = readPluginLabConfiguration(environment); if (!configuration) return safe("Plugin Lab is unavailable.", 503);
    const verified = await authority(request, dependencies, environment, configuration.secret); if ("error" in verified) return verified.error;
    if (!isPluginLabProposalId(proposalId) || request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return safe("Invalid operator request.", 400);
    let body: Record<string, unknown>; try { body = await boundedJson(request); } catch { return safe("Invalid operator request.", 400); }
    if (Object.keys(body).length !== 3 || !Object.hasOwn(body, "from") || !Object.hasOwn(body, "to") || !Object.hasOwn(body, "reason")
      || !isPluginProposalState(body.from) || !isPluginProposalState(body.to) || typeof body.reason !== "string") return safe("Invalid operator request.", 400);
    const reason = body.reason.trim(); if (!reason || reason.length > 500 || /[\u0000-\u001f\u007f]/u.test(reason)) return safe("Invalid operator request.", 400);
    try { assertPluginProposalTransition(body.from, body.to); } catch { return safe("Invalid proposal transition.", 400); }
    const messageCode = ({ "under-review": "proposal-under-review", "needs-information": "proposal-needs-information", selected: "proposal-selected", "not-selected": "proposal-not-selected", withdrawn: "proposal-withdrawn", received: "proposal-received" } as const)[body.to];
    const reasonCipher = encryptPluginLabText(reason, configuration.encryptionKey, configuration.keyVersion, `transition-reason:${proposalId}:${body.from}:${body.to}:${messageCode}`);
    const store = await storeFor(dependencies, environment); if (!store) return safe("Plugin Lab is unavailable.", 503);
    const actorRef = hmac(`ena-plugin-lab-operator:${verified.principal.principalRef}`, configuration.secret);
    let changed: boolean; try { changed = await store.transition({ proposalId, from: body.from, to: body.to, actorRef, messageCode, reasonCipher }); } catch { return safe("Plugin Lab is unavailable.", 503); }
    if (!changed) return safe("Proposal state changed; reload before retrying.", 409);
    return Response.json({ proposalId, state: body.to }, { headers: { "cache-control": "no-store" } });
  };
}

export function createPluginLabRotateAccessPostHandler(dependencies: Dependencies = {}) {
  const environment = (dependencies.environment ?? process.env) as Environment;
  return async function handle(request: Request, proposalId: string): Promise<Response> {
    if (!resolveOpenEnaRequestOrigin(request.headers, new URL(request.url).origin, environment)) return safe("Invalid request origin.", 403);
    const configuration = readPluginLabConfiguration(environment); if (!configuration) return safe("Plugin Lab is unavailable.", 503);
    const verified = await authority(request, dependencies, environment, configuration.secret); if ("error" in verified) return verified.error;
    if (!isPluginLabProposalId(proposalId)) return safe("Invalid operator request.", 400);
    let body: Record<string, unknown>; try { body = await boundedJson(request); } catch { return safe("Invalid operator request.", 400); }
    if (Object.keys(body).length !== 1 || body.action !== "rotate") return safe("Invalid operator request.", 400);
    const accessCode = createPluginLabAccessCode(); const accessHash = hashPluginLabAccessCode(proposalId, accessCode, configuration.secret);
    const store = await storeFor(dependencies, environment); if (!store) return safe("Plugin Lab is unavailable.", 503);
    let changed: boolean; try { changed = await store.rotateAccessHash(proposalId, accessHash); } catch { return safe("Plugin Lab is unavailable.", 503); }
    if (!changed) return safe("Proposal state changed; reload before retrying.", 409);
    return Response.json({ proposalId, accessCode }, { headers: { "cache-control": "no-store" } });
  };
}

export function createPluginLabRequestPublicConsentPostHandler(dependencies: Dependencies = {}) {
  const environment = (dependencies.environment ?? process.env) as Environment;
  return async function handle(request: Request, proposalId: string): Promise<Response> {
    if (!resolveOpenEnaRequestOrigin(request.headers, new URL(request.url).origin, environment)) return safe("Invalid request origin.", 403);
    const configuration = readPluginLabConfiguration(environment); if (!configuration) return safe("Plugin Lab is unavailable.", 503);
    const verified = await authority(request, dependencies, environment, configuration.secret); if ("error" in verified) return verified.error;
    if (!isPluginLabProposalId(proposalId)) return safe("Invalid operator request.", 400);
    let body: Record<string, unknown>; try { body = await boundedJson(request); } catch { return safe("Invalid operator request.", 400); }
    if (Object.keys(body).length !== 1 || body.action !== "request") return safe("Invalid operator request.", 400);
    const store = await storeFor(dependencies, environment); if (!store) return safe("Plugin Lab is unavailable.", 503);
    const actorRef = hmac(`ena-plugin-lab-operator:${verified.principal.principalRef}`, configuration.secret);
    let changed: boolean; try { changed = await store.requestPublicConsent(proposalId, actorRef); } catch { return safe("Plugin Lab is unavailable.", 503); }
    if (!changed) return safe("Proposal consent state changed; reload before retrying.", 409);
    return Response.json({ proposalId, publicConsentStatus: "requested", publicModerationStatus: "approved" }, { headers: { "cache-control": "no-store" } });
  };
}

export function createPluginLabConfirmEmailPostHandler(dependencies: Dependencies = {}) {
  const environment = (dependencies.environment ?? process.env) as Environment;
  return async function handle(request: Request, proposalId: string): Promise<Response> {
    if (!resolveOpenEnaRequestOrigin(request.headers, new URL(request.url).origin, environment)) return safe("Invalid request origin.", 403);
    const configuration = readPluginLabConfiguration(environment); if (!configuration) return safe("Plugin Lab is unavailable.", 503);
    const verified = await authority(request, dependencies, environment, configuration.secret); if ("error" in verified) return verified.error;
    if (!isPluginLabProposalId(proposalId) || request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return safe("Invalid operator request.", 400);
    let body: Record<string, unknown>; try { body = await boundedJson(request); } catch { return safe("Invalid operator request.", 400); }
    if (Object.keys(body).length !== 1 || body.action !== "confirm-email") return safe("Invalid operator request.", 400);
    const store = await storeFor(dependencies, environment); if (!store) return safe("Plugin Lab is unavailable.", 503);
    const actorRef = hmac(`ena-plugin-lab-operator:${verified.principal.principalRef}`, configuration.secret);
    let changed: boolean; try { changed = await store.confirmEmail(proposalId, actorRef); } catch { return safe("Plugin Lab is unavailable.", 503); }
    if (!changed) return safe("Email confirmation state changed; reload before retrying.", 409);
    return Response.json({ proposalId, emailConfirmed: true }, { headers: { "cache-control": "no-store" } });
  };
}

export function createPluginLabRetentionPreviewPostHandler(dependencies: Dependencies = {}) {
  const environment = (dependencies.environment ?? process.env) as Environment;
  return async function handle(request: Request): Promise<Response> {
    if (!resolveOpenEnaRequestOrigin(request.headers, new URL(request.url).origin, environment)) return safe("Invalid request origin.", 403);
    const configuration = readPluginLabConfiguration(environment); if (!configuration) return safe("Plugin Lab is unavailable.", 503);
    const verified = await authority(request, dependencies, environment, configuration.secret); if ("error" in verified) return verified.error;
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return safe("Invalid operator request.", 400);
    let body: Record<string, unknown>; try { body = await boundedJson(request); } catch { return safe("Invalid operator request.", 400); }
    if (Object.keys(body).length !== 2 || body.action !== "preview" || typeof body.before !== "string") return safe("Invalid operator request.", 400);
    const beforeMilliseconds = Date.parse(body.before);
    if (!Number.isFinite(beforeMilliseconds) || new Date(beforeMilliseconds).toISOString() !== body.before || beforeMilliseconds > (dependencies.now ?? Date.now)()) return safe("Invalid retention cutoff.", 400);
    const store = await storeFor(dependencies, environment); if (!store) return safe("Plugin Lab is unavailable.", 503);
    let candidates; try { candidates = await store.previewRetention({ before: body.before, limit: 200 }); } catch { return safe("Plugin Lab is unavailable.", 503); }
    return Response.json({ before: body.before, candidates }, { headers: { "cache-control": "no-store" } });
  };
}
