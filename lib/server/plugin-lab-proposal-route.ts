import { createHash, createHmac } from "node:crypto";
import { isLocale } from "@/lib/i18n";
import { resolveOpenEnaRequestOrigin } from "@/lib/open-ena-auth-request";
import { pluginLabProposalIntakeEnabled, readPluginLabConfiguration, type PluginLabEnvironment } from "@/lib/plugin-lab/config";
import { createPluginLabAccessCode, createPluginLabProposalId, encryptPluginLabText, hashPluginLabAccessCode } from "@/lib/plugin-lab/crypto";
import { parsePluginProposalSubmission } from "@/lib/plugin-lab/proposal";
import { createProductionPluginLabStore, type PluginLabStore } from "@/lib/plugin-lab/store";

export const PLUGIN_LAB_PROPOSAL_MAX_REQUEST_BYTES = 64 * 1024;

type Dependencies = { environment?: PluginLabEnvironment; storeFactory?: () => Promise<PluginLabStore | null> };
class BodyTooLarge extends Error {}
class InvalidBody extends Error {}

function safe(body: string, status: number, headers: HeadersInit = {}) { return new Response(body, { status, headers: { "cache-control": "no-store", ...headers } }); }
function declaredLength(headers: Headers) { const raw = headers.get("content-length"); if (raw === null) return null; return /^\d+$/u.test(raw) ? Number(raw) : Number.NaN; }
async function boundedBody(request: Request, maximum: number) {
  const declared = declaredLength(request.headers); if (Number.isNaN(declared)) throw new InvalidBody(); if (declared !== null && declared > maximum) throw new BodyTooLarge();
  if (!request.body) return new Uint8Array(); const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; total += value.byteLength; if (total > maximum) { await reader.cancel().catch(() => undefined); throw new BodyTooLarge(); } chunks.push(value); } } finally { reader.releaseLock(); }
  if (declared !== null && declared !== total) throw new InvalidBody(); const output = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; } return output;
}
export function createPluginLabRequestSourceRef(request: Request, secret: string, purpose: "submission-source" | "status-source") {
  const forwarded = request.headers.get("x-vercel-forwarded-for")
    ?? request.headers.get("x-forwarded-for")
    ?? request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-real-ip");
  const address = forwarded?.split(",", 1)[0]?.trim().toLowerCase();
  const source = address && /^[0-9a-f:.]{3,64}$/u.test(address)
    ? `proxy-address:${address}`
    : `user-agent-fallback:${request.headers.get("user-agent")?.slice(0, 200) ?? "unattributed"}`;
  return createHmac("sha256", secret).update(`ena-plugin-lab-${purpose}:${source}`, "utf8").digest("base64url");
}

export function createPluginLabProposalPostHandler(dependencies: Dependencies = {}) {
  const environment = dependencies.environment ?? process.env;
  return async function handle(request: Request) {
    if (!resolveOpenEnaRequestOrigin(request.headers, new URL(request.url).origin, environment)) return safe("Invalid request origin.", 403);
    const media = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase(); if (media !== "application/json") return safe("Invalid proposal request.", 400);
    const declared = declaredLength(request.headers); if (Number.isNaN(declared)) return safe("Invalid proposal request.", 400); if (declared !== null && declared > PLUGIN_LAB_PROPOSAL_MAX_REQUEST_BYTES) return safe("Proposal request is too large.", 413);
    const configuration = readPluginLabConfiguration(environment); if (!configuration || !pluginLabProposalIntakeEnabled(environment)) return safe("Plugin Lab proposal intake is not enabled.", 503);
    const localeHeader = request.headers.get("x-plugin-lab-locale");
    if (localeHeader !== null && !isLocale(localeHeader)) return safe("Invalid proposal request.", 400);
    const submittedLocale = localeHeader ?? "en";
    let bytes: Uint8Array; try { bytes = await boundedBody(request, PLUGIN_LAB_PROPOSAL_MAX_REQUEST_BYTES); } catch (error) { return error instanceof BodyTooLarge ? safe("Proposal request is too large.", 413) : safe("Invalid proposal request.", 400); }
    let store: PluginLabStore | null; try { store = await (dependencies.storeFactory?.() ?? createProductionPluginLabStore(environment)); } catch { store = null; } if (!store) return safe("Plugin Lab is unavailable.", 503);
    try { if (!await store.consumeRateLimit({ scopeKind: "submission-source", scopeRef: createPluginLabRequestSourceRef(request, configuration.secret, "submission-source"), limit: 5, windowSeconds: 3_600 })) return safe("Too many proposal requests.", 429, { "retry-after": "3600" }); } catch { return safe("Plugin Lab is unavailable.", 503); }
    let raw: unknown; try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return safe("Invalid proposal request.", 400); }
    let submission; try { submission = parsePluginProposalSubmission(raw); } catch (error) { return safe(error instanceof Error ? error.message : "Invalid proposal request.", 400); }
    const emailRef = createHmac("sha256", configuration.secret).update(`ena-plugin-lab-submission-email:${submission.email}`, "utf8").digest("base64url");
    try { if (!await store.consumeRateLimit({ scopeKind: "submission-email", scopeRef: emailRef, limit: 3, windowSeconds: 86_400 })) return safe("Too many proposal requests.", 429, { "retry-after": "86400" }); } catch { return safe("Plugin Lab is unavailable.", 503); }
    const proposalId = createPluginLabProposalId(); const accessCode = createPluginLabAccessCode(); const accessHash = hashPluginLabAccessCode(proposalId, accessCode, configuration.secret);
    const payloadCipher = encryptPluginLabText(JSON.stringify(submission), configuration.encryptionKey, configuration.keyVersion, `proposal-payload:${proposalId}`);
    const publicProjectionPlaintext = JSON.stringify({ title: submission.title, publicSummary: submission.publicSummary });
    const publicProjectionCipher = encryptPluginLabText(publicProjectionPlaintext, configuration.encryptionKey, configuration.keyVersion, `public-projection:${proposalId}`);
    const publicProjectionSha256 = createHash("sha256").update(publicProjectionPlaintext, "utf8").digest("hex");
    try { await store.createProposal({ proposalId, accessHash, payloadCipher, publicProjectionCipher, publicProjectionSha256, track: submission.track, visibility: submission.visibility, submittedLocale }); } catch { return safe("Plugin Lab is unavailable.", 503); }
    return Response.json({ proposalId, accessCode }, { status: 201, headers: { "cache-control": "no-store" } });
  };
}
