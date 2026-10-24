import { createHash, randomUUID } from "node:crypto";
import { isLocale } from "@/lib/i18n";
import { resolveOpenEnaRequestOrigin } from "@/lib/open-ena-auth-request";
import { createPluginLabProposalId, encryptPluginLabText, isPluginLabProposalId } from "@/lib/plugin-lab/crypto";
import { PLUGIN_LAB_MAX_SERIALIZED_BYTES } from "@/lib/plugin-lab/limits";
import { pluginLabWorkflowIntakeEnabled, readPluginLabMailConfiguration } from "@/lib/plugin-lab/mail";
import { parsePluginProposalSubmission } from "@/lib/plugin-lab/proposal";
import { normalizePluginLabEmail, pluginLabActorRef, pluginLabWorkflowHash } from "@/lib/plugin-lab/workflow-security";
import { createPluginLabRequestSourceRef } from "./plugin-lab-proposal-route";
import { onlyKeys, workflowBody, workflowContext, workflowError, workflowIdempotencyKey, workflowJson, workflowOwner, workflowResearcher, type WorkflowDependencies } from "./plugin-lab-workflow-context";
import { validWorkflowMessage, workflowDetail, workflowNotification, workflowSummary } from "./plugin-lab-workflow-projection";

export function createPluginLabOwnedProposalPostHandler(dependencies: WorkflowDependencies = {}) {
  const environment = dependencies.environment ?? process.env;
  return async (request: Request): Promise<Response> => {
    if (!resolveOpenEnaRequestOrigin(request.headers, new URL(request.url).origin, environment)) return workflowError("invalid-origin", 403);
    if (!pluginLabWorkflowIntakeEnabled(environment)) return workflowError("intake-closed", 503);
    const context = await workflowContext(dependencies);
    if (!context) return workflowError("service-unavailable", 503);
    try {
      const researcher = await workflowResearcher(request, context);
      if (!researcher) return workflowError("verification-required", 401);
      const idempotencyKey = workflowIdempotencyKey(request);
      if (!idempotencyKey) return workflowError("invalid-request", 400);
      const locale = request.headers.get("x-plugin-lab-locale") ?? "en";
      if (!isLocale(locale)) return workflowError("invalid-request", 400);
      let body: Record<string, unknown>;
      try { body = await workflowBody(request, PLUGIN_LAB_MAX_SERIALIZED_BYTES); } catch { return workflowError("invalid-request", 400); }
      if (body.schemaVersion !== 2) return workflowError("invalid-request", 400);
      if (normalizePluginLabEmail(body.email) !== researcher.email) return workflowError("verification-required", 401, { fieldErrors: { email: "verification-required" } });
      let submission;
      try { submission = parsePluginProposalSubmission({ ...body, email: researcher.email }); }
      catch (error) {
        const field = /(?:missing |proposal: )([a-zA-Z]+)(?: is| must| contains|\.)/u.exec(error instanceof Error ? error.message : "")?.[1];
        return workflowError("invalid-proposal", 400, field ? { fieldErrors: { [field]: "invalid-field" } } : {});
      }
      const { configuration, store } = context;
      const proposalId = createPluginLabProposalId();
      const publicText = submission.publicSummary ? JSON.stringify({ title: submission.title, publicSummary: submission.publicSummary }) : null;
      const mail = readPluginLabMailConfiguration(environment)!;
      const created = await store.createOwnedProposal({
        proposalId, emailRef: researcher.emailRef, idempotencyKey,
        requestHash: pluginLabWorkflowHash("submission", JSON.stringify(submission), configuration.secret),
        sourceRef: createPluginLabRequestSourceRef(request, configuration.secret, "submission-source", environment),
        payloadCipher: encryptPluginLabText(JSON.stringify(submission), configuration.encryptionKey, "v1", `proposal-payload:${proposalId}`),
        publicProjectionCipher: publicText ? encryptPluginLabText(publicText, configuration.encryptionKey, "v1", `public-projection:${proposalId}`) : null,
        publicProjectionSha256: publicText ? createHash("sha256").update(publicText).digest("hex") : null,
        track: submission.track, visibility: submission.visibility, submittedLocale: locale,
        actorRef: pluginLabActorRef("researcher", researcher.emailRef, configuration.secret),
        notifications: [
          workflowNotification({ proposalId, email: researcher.email, locale, kind: "received", target: "researcher" }, configuration),
          workflowNotification({ proposalId, email: mail.operatorEmail, locale, kind: "received", target: "operator" }, configuration),
        ],
      });
      if ("conflict" in created) return workflowError("submission-conflict", 409);
      if ("rateLimited" in created) return workflowError("rate-limited", 429, { retryAfter: 3600 });
      return workflowJson({ proposalId: created.proposalId, state: "received", replayed: !created.created }, created.created ? 201 : 200);
    } catch { return workflowError("service-unavailable", 503); }
  };
}

export function createPluginLabOwnedProposalListHandler(dependencies: WorkflowDependencies = {}) {
  return async (request: Request): Promise<Response> => {
    const context = await workflowContext(dependencies);
    if (!context) return workflowError("service-unavailable", 503);
    try {
      const owner = await workflowOwner(request, context);
      if (!owner) return workflowError("verification-required", 401);
      const records = "emailRef" in owner ? await context.store.listOwned(owner.emailRef) : [await context.store.readOwned(owner.legacyProposalId, owner)].filter((value) => value !== null);
      return workflowJson({ access: "emailRef" in owner ? "email" : "legacy", proposals: records.map((record) => workflowSummary(record, context.configuration)) });
    } catch { return workflowError("service-unavailable", 503); }
  };
}

export function createPluginLabOwnedProposalGetHandler(dependencies: WorkflowDependencies = {}) {
  return async (request: Request, proposalId: string): Promise<Response> => {
    const context = await workflowContext(dependencies);
    if (!context) return workflowError("service-unavailable", 503);
    try {
      const owner = await workflowOwner(request, context);
      if (!owner) return workflowError("verification-required", 401);
      if (!isPluginLabProposalId(proposalId)) return workflowError("not-found", 404);
      const record = await context.store.readOwned(proposalId, owner);
      return record ? workflowJson({ proposal: workflowDetail(record, context.configuration) }) : workflowError("not-found", 404);
    } catch { return workflowError("service-unavailable", 503); }
  };
}

export function createPluginLabReplyHandler(dependencies: WorkflowDependencies = {}) {
  const environment = dependencies.environment ?? process.env;
  return async (request: Request, proposalId: string): Promise<Response> => {
    if (!resolveOpenEnaRequestOrigin(request.headers, new URL(request.url).origin, environment)) return workflowError("invalid-origin", 403);
    const context = await workflowContext(dependencies);
    if (!context) return workflowError("service-unavailable", 503);
    try {
      const owner = await workflowOwner(request, context);
      if (!owner) return workflowError("verification-required", 401);
      if (!isPluginLabProposalId(proposalId)) return workflowError("not-found", 404);
      const idempotencyKey = workflowIdempotencyKey(request);
      if (!idempotencyKey) return workflowError("invalid-request", 400);
      let body: Record<string, unknown>;
      try { body = await workflowBody(request, 32_768); } catch { return workflowError("invalid-request", 400); }
      if (!onlyKeys(body, ["text"]) || !validWorkflowMessage(body.text)) return workflowError("invalid-reply", 400, { fieldErrors: { text: "invalid-field" } });
      const record = await context.store.readOwned(proposalId, owner);
      if (!record) return workflowError("not-found", 404);
      const operatorEmail = normalizePluginLabEmail(environment.ENA_PLUGIN_LAB_OPERATOR_EMAIL);
      if (!operatorEmail) return workflowError("service-unavailable", 503);
      const { configuration, store } = context;
      const messageId = randomUUID();
      const result = await store.appendReply({
        proposalId, owner, messageId, idempotencyKey,
        requestHash: pluginLabWorkflowHash("reply", body.text.trim(), configuration.secret),
        bodyCipher: encryptPluginLabText(body.text.trim(), configuration.encryptionKey, "v1", `proposal-message:${proposalId}:${messageId}`),
        actorRef: pluginLabActorRef("researcher", "emailRef" in owner ? owner.emailRef : owner.legacyProposalId, configuration.secret),
        notifications: [workflowNotification({ proposalId, email: operatorEmail, locale: record.submittedLocale, kind: "reply", target: "operator" }, configuration)],
      });
      if (result === "conflict") return workflowError("reply-conflict", 409);
      return workflowJson({ proposalId, state: "under-review", replayed: result === "replayed" }, result === "created" ? 201 : 200);
    } catch { return workflowError("service-unavailable", 503); }
  };
}
