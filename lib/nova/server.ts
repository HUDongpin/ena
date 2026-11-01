import { timingSafeEqual } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import { isLocale } from "@/lib/i18n";
import { OPEN_ENA_SESSION_COOKIE, type OpenEnaPrincipal } from "@/lib/open-ena-auth";
import { resolveOpenEnaRequestOrigin } from "@/lib/open-ena-auth-request";
import { readPluginLabConfiguration } from "@/lib/plugin-lab/config";
import { pluginLabActorRef, pluginLabCookie, pluginLabWorkflowHash } from "@/lib/plugin-lab/workflow-security";
import { createPluginLabOperatorCsrf } from "@/lib/server/plugin-lab-operator-route";
import { verifyProductionOpenEnaSessionTokenV2 } from "@/lib/server/open-ena-auth-security-store";
import { onlyKeys, workflowBody, workflowContext, workflowError, workflowIdempotencyKey, workflowJson, workflowResearcher, type WorkflowDependencies } from "@/lib/server/plugin-lab-workflow-context";
import { getNovaModels, isNovaEffort, isNovaModelKey, resolveNovaModel } from "./models";
import { createProductionNovaStore, NovaStoreError, type NovaStore, type NovaExpertQuery } from "./store";
import { validateNovaFiles } from "./sdk";
import { novaSandboxConfigured } from "./sandbox";
import { novaIdentityTag } from "./identity";

export interface NovaDependencies extends WorkflowDependencies {
  novaStoreFactory?: () => Promise<NovaStore | null>;
  verifyOperator?: (token: string | undefined) => Promise<OpenEnaPrincipal | null>;
}
type Operation = "models" | "sessions" | "session" | "messages" | "events" | "run" | "artifact" | "restore" | "expert" | "expert-response";
type Params = { id?: string; runId?: string; artifactId?: string; requestId?: string };
const isId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
function validText(value: unknown, max: number): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value); }
function canonical(value: Record<string, unknown>) { return JSON.stringify(Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]))); }
function failure(error: unknown) {
  if (!(error instanceof NovaStoreError)) return workflowError("service-unavailable", 503);
  const code = error.code;
  return workflowError(code, code === "not-found" ? 404 : code === "store-unavailable" ? 503 : code === "session-limit" ? 413 : code.startsWith("invalid-") ? 400 : 409);
}
async function operator(token: string | undefined, dependencies: NovaDependencies) {
  return dependencies.verifyOperator ? dependencies.verifyOperator(token) : verifyProductionOpenEnaSessionTokenV2(token, +(dependencies.now?.() ?? new Date()), dependencies.environment ?? process.env);
}
async function novaStore(dependencies: NovaDependencies) { return dependencies.novaStoreFactory ? dependencies.novaStoreFactory() : createProductionNovaStore(dependencies.environment ?? process.env); }

export async function readNovaOperatorInbox(token: string | undefined, dependencies: NovaDependencies = {}, query: NovaExpertQuery = {}) {
  try {
    const principal = await operator(token, dependencies); if (!principal) return null;
    const configuration = readPluginLabConfiguration(dependencies.environment ?? process.env); if (!configuration) return null;
    const store = await novaStore(dependencies); if (!store) return null;
    return {csrf: createPluginLabOperatorCsrf(principal, configuration.secret), page: await store.listExpertRequests(query)};
  } catch { return null; }
}

export function createNovaApiHandler(operation: Operation, dependencies: NovaDependencies = {}) {
  const environment = dependencies.environment ?? process.env;
  return async (request: Request, params: Params = {}): Promise<Response> => {
    const post = request.method === "POST";
    if (!(operation === "sessions" ? ["GET", "POST"] : ["messages", "run", "restore", "expert", "expert-response"].includes(operation) ? ["POST"] : ["GET"]).includes(request.method)) return workflowError("method-not-allowed", 405);
    if (post && !resolveOpenEnaRequestOrigin(request.headers, new URL(request.url).origin, environment)) return workflowError("invalid-origin", 403);
    try {
      if (operation === "models") {
        const models = getNovaModels(environment); const runtimeConfigured = novaSandboxConfigured(environment);
        return workflowJson({models, enabled: environment.ENA_NOVA_ENABLED === "true" && readPluginLabConfiguration(environment) !== null && runtimeConfigured && models.some(model => model.available), runtimeConfigured});
      }
      if (operation !== "sessions" && !isId(params.id)) return workflowError("not-found", 404);
      if (operation === "run" && !isId(params.runId) || ["artifact", "restore"].includes(operation) && !isId(params.artifactId) || operation === "expert-response" && !isId(params.requestId)) return workflowError("not-found", 404);
      const context = await workflowContext(dependencies); if (!context) return workflowError("service-unavailable", 503);
      let ownerRef: string, actorRef: string | undefined;
      if (operation === "expert-response") {
        const principal = await operator(pluginLabCookie(request.headers, OPEN_ENA_SESSION_COOKIE), dependencies);
        if (!principal) return workflowError("operator-required", 401);
        const csrf = request.headers.get("x-plugin-lab-csrf"), expected = createPluginLabOperatorCsrf(principal, context.configuration.secret);
        if (!csrf || !/^[A-Za-z0-9_-]{43}$/u.test(csrf) || !timingSafeEqual(Buffer.from(csrf), Buffer.from(expected))) return workflowError("invalid-csrf", 403);
        actorRef = pluginLabActorRef("operator", principal.principalRef, context.configuration.secret); ownerRef = actorRef;
      } else {
        // Deliberately never use workflowOwner: legacy receipt tokens do not establish a Nova account.
        const researcher = await workflowResearcher(request, context); if (!researcher) return workflowError("researcher-required", 401);
        const expectedIdentity = await novaIdentityTag(researcher.email);
        const suppliedIdentity = request.headers.get("x-nova-identity");
        if (!suppliedIdentity || !/^[0-9a-f]{64}$/u.test(suppliedIdentity)
          || !timingSafeEqual(Buffer.from(expectedIdentity), Buffer.from(suppliedIdentity))) return workflowError("identity-mismatch", 401);
        ownerRef = researcher.emailRef;
      }
      if (!await context.store.consumeRateLimit({scopeKind: post ? "nova-write" : "nova-read", scopeRef: ownerRef, limit: post ? 20 : 180, windowSeconds: 60})) return workflowError("rate-limited", 429, {retryAfter: 60});
      const store = await novaStore(dependencies); if (!store) return workflowError("service-unavailable", 503);
      if (!post) {
        if (operation === "sessions") return workflowJson({sessions: await store.listSessions(ownerRef)});
        if (operation === "events") {
          const input = new URL(request.url).searchParams.get("after") ?? "0";
          if (!/^\d{1,15}$/u.test(input) || !Number.isSafeInteger(Number(input))) return workflowError("invalid-cursor", 400);
          const result = await store.readEvents(params.id!, ownerRef, Number(input)); return result ? workflowJson(result) : workflowError("not-found", 404);
        }
        const session = await store.readSession(params.id!, ownerRef); if (!session) return workflowError("not-found", 404);
        if (operation === "artifact") {
          const artifact = session.artifacts.find(item => item.id === params.artifactId); if (!artifact) return workflowError("not-found", 404);
          if (new URL(request.url).searchParams.get("download") !== "1") return workflowJson({artifact});
          const files = Object.fromEntries(validateNovaFiles(artifact.files).map(file => [file.path, strToU8(file.content)]));
          files["nova-receipt.json"] = strToU8(JSON.stringify({schemaVersion: "open-ena.nova-bundle/v1", status: "draft", sourceHash: artifact.sourceHash, fixtureHash: artifact.fixtureHash, checks: artifact.checks, output: artifact.output, manifest: artifact.manifest}, null, 2));
          return new Response(new Uint8Array(zipSync(files)), {headers: {"content-type": "application/zip", "content-disposition": `attachment; filename="nova-draft-${artifact.id}.zip"`, "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer"}});
        }
        return workflowJson({session});
      }
      const idempotencyKey = workflowIdempotencyKey(request); if (!idempotencyKey) return workflowError("invalid-idempotency-key", 400);
      let body: Record<string, unknown>; try { body = await workflowBody(request, 32_768); } catch { return workflowError("invalid-request", 400); }
      const requestHash = pluginLabWorkflowHash("nova-request", `${request.method}:${operation}:${params.id ?? ""}:${params.runId ?? ""}:${params.artifactId ?? ""}:${params.requestId ?? ""}:${canonical(body)}`, context.configuration.secret);
      const mutation = {ownerRef, idempotencyKey, requestHash, now: context.now};
      const input = {...mutation, sessionId: params.id!};
      if (operation === "sessions") {
        if (!onlyKeys(body, ["locale", "title"]) || !isLocale(body.locale as string) || body.title !== undefined && !validText(body.title, 120)) return workflowError("invalid-request", 400);
        return workflowJson({session: await store.createSession({...mutation, locale: body.locale as string, ...(typeof body.title === "string" ? {title: body.title.trim()} : {})})}, 201);
      }
      if (operation === "messages") {
        if (!onlyKeys(body, ["content", "modelKey", "effort"]) || !validText(body.content, 12_000) || !isNovaModelKey(body.modelKey) || !isNovaEffort(body.effort)) return workflowError("invalid-request", 400);
        const model = resolveNovaModel(body.modelKey, environment); if (!model.available) return workflowError(model.unavailableReason ?? "model-unavailable", 503);
        if (!novaSandboxConfigured(environment)) return workflowError("runtime-not-configured", 503);
        return workflowJson(await store.appendMessage({...input, content: body.content.trim(), model, effort: body.effort}), 202);
      }
      if (operation === "run") {
        if (!onlyKeys(body, ["action"]) || !["cancel", "resume", "retry"].includes(String(body.action))) return workflowError("invalid-request", 400);
        if (body.action !== "cancel") {
          if (!novaSandboxConfigured(environment)) return workflowError("runtime-not-configured", 503);
          const session = await store.readSession(input.sessionId, ownerRef); const run = session?.runs.find(item => item.id === params.runId); if (!run) return workflowError("not-found", 404);
          const model = resolveNovaModel(run.model.key, environment); if (!model.available) return workflowError(model.unavailableReason ?? "model-unavailable", 503);
        }
        return workflowJson({session: await store.controlRun({...input, runId: params.runId!, action: body.action as "cancel" | "resume" | "retry"})});
      }
      if (operation === "restore") {
        if (!onlyKeys(body, [])) return workflowError("invalid-request", 400);
        return workflowJson({session: await store.restoreArtifact({...input, artifactId: params.artifactId!})});
      }
      if (operation === "expert") {
        if (!onlyKeys(body, ["question", "runId", "artifactId"]) || !validText(body.question, 6_000) || !isId(body.runId)
          || !(body.artifactId === null || isId(body.artifactId))) return workflowError("invalid-request", 400);
        return workflowJson({session: await store.requestExpert({...input, question: body.question.trim(), runId: body.runId, artifactId: body.artifactId as string | null})}, 202);
      }
      if (operation === "expert-response") {
        if (!onlyKeys(body, ["runId", "artifactId", "response"]) || !isId(body.runId) || !(body.artifactId === null || isId(body.artifactId)) || !validText(body.response, 6_000)) return workflowError("invalid-request", 400);
        return workflowJson({session: await store.respondExpert({...input, requestId: params.requestId!, runId: body.runId, artifactId: body.artifactId as string | null, response: body.response.trim(), actorRef: actorRef!})});
      }
      return workflowError("not-found", 404);
    } catch (error) { return failure(error); }
  };
}
