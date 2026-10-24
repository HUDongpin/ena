import { readPluginLabConfiguration, type PluginLabEnvironment } from "@/lib/plugin-lab/config";
import { decryptPluginLabText, verifyPluginLabStatusSession } from "@/lib/plugin-lab/crypto";
import type { WorkflowOwner, WorkflowStore } from "@/lib/plugin-lab/workflow-types";
import { isPluginLabOpaqueToken, normalizePluginLabEmail, pluginLabCookie, pluginLabEmailRef, pluginLabWorkflowHash, PLUGIN_LAB_LEGACY_COOKIE, PLUGIN_LAB_RESEARCHER_COOKIE } from "@/lib/plugin-lab/workflow-security";
import { readPluginLabBoundedBody } from "./plugin-lab-proposal-route";

export type WorkflowDependencies = {
  environment?: PluginLabEnvironment;
  storeFactory?: () => Promise<WorkflowStore | null>;
  now?: () => Date;
  sendCode?: (input: { email: string; code: string; locale: string }) => Promise<void>;
};

export function workflowJson(body: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store, max-age=0", "referrer-policy": "no-referrer", ...headers } });
}

export function workflowError(code: string, status: number, extra: { fieldErrors?: Record<string, string>; retryAfter?: number } = {}) {
  return workflowJson({ code, ...extra }, status, extra.retryAfter ? { "retry-after": String(extra.retryAfter) } : {});
}

export async function workflowBody(request: Request, maxBytes = 16_384): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") throw new TypeError("invalid-body");
  const bytes = await readPluginLabBoundedBody(request, maxBytes);
  const body: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.getPrototypeOf(body) !== Object.prototype) throw new TypeError("invalid-body");
  return body as Record<string, unknown>;
}

export function onlyKeys(body: Record<string, unknown>, keys: string[]) {
  return Object.keys(body).every((key) => keys.includes(key));
}

export async function workflowContext(dependencies: WorkflowDependencies) {
  const environment = dependencies.environment ?? process.env;
  const configuration = readPluginLabConfiguration(environment);
  if (!configuration) return null;
  try {
    const store = dependencies.storeFactory ? await dependencies.storeFactory() : await (await import("@/lib/plugin-lab/workflow-store")).createProductionWorkflowStore(environment);
    return store ? { configuration, store, environment, now: (dependencies.now ?? (() => new Date()))() } : null;
  } catch { return null; }
}

export type WorkflowContext = NonNullable<Awaited<ReturnType<typeof workflowContext>>>;

export async function workflowResearcher(request: Request, context: WorkflowContext) {
  const token = pluginLabCookie(request.headers, PLUGIN_LAB_RESEARCHER_COOKIE);
  if (!isPluginLabOpaqueToken(token)) return null;
  const session = await context.store.readSession(pluginLabWorkflowHash("session", token, context.configuration.secret), context.now);
  if (!session) return null;
  const plaintext = decryptPluginLabText(session.emailCipher, { v1: context.configuration.encryptionKey }, `email-contact:${session.emailRef}`);
  const email = normalizePluginLabEmail(plaintext);
  if (!email || pluginLabEmailRef(email, context.configuration.secret) !== session.emailRef) throw new Error("Invalid researcher session.");
  return { ...session, email };
}

export async function workflowOwner(request: Request, context: WorkflowContext): Promise<WorkflowOwner | null> {
  const researcher = await workflowResearcher(request, context);
  if (researcher) return { emailRef: researcher.emailRef };
  if (pluginLabCookie(request.headers, PLUGIN_LAB_RESEARCHER_COOKIE) !== undefined) return null;
  const legacy = verifyPluginLabStatusSession(pluginLabCookie(request.headers, PLUGIN_LAB_LEGACY_COOKIE), context.now.getTime(), context.configuration.secret);
  return legacy ? { legacyProposalId: legacy.proposalId } : null;
}

export function workflowIdempotencyKey(request: Request) {
  const value = request.headers.get("idempotency-key");
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value) ? value : null;
}
