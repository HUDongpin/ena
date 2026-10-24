import { randomUUID, timingSafeEqual } from "node:crypto";
import { OPEN_ENA_SESSION_COOKIE, type OpenEnaPrincipal } from "@/lib/open-ena-auth";
import { resolveOpenEnaRequestOrigin } from "@/lib/open-ena-auth-request";
import { readPluginLabConfiguration } from "@/lib/plugin-lab/config";
import { encryptPluginLabText, isPluginLabProposalId } from "@/lib/plugin-lab/crypto";
import { assertPluginProposalTransition, isPluginProposalState } from "@/lib/plugin-lab/proposal";
import { pluginLabActorRef, pluginLabCookie } from "@/lib/plugin-lab/workflow-security";
import { verifyProductionOpenEnaSessionTokenV2 } from "./open-ena-auth-security-store";
import { createPluginLabOperatorCsrf } from "./plugin-lab-operator-route";
import { onlyKeys, workflowBody, workflowContext, workflowError, workflowJson, type WorkflowDependencies } from "./plugin-lab-workflow-context";
import { validWorkflowMessage, workflowDetail, workflowNotification, workflowSubmission } from "./plugin-lab-workflow-projection";

type Dependencies = WorkflowDependencies & { verifyOperator?: (token: string | undefined) => Promise<OpenEnaPrincipal | null> };

async function operator(token: string | undefined, dependencies: Dependencies) {
  return dependencies.verifyOperator ? dependencies.verifyOperator(token) : verifyProductionOpenEnaSessionTokenV2(token, (dependencies.now?.() ?? new Date()).getTime(), dependencies.environment ?? process.env);
}

export async function readPluginLabWorkflowOperatorInbox(token: string | undefined, dependencies: Dependencies = {}) {
  try {
    const principal = await operator(token, dependencies);
    if (!principal) return null;
    const context = await workflowContext(dependencies);
    if (!context) return null;
    const records = await context.store.listOperator();
    return { csrf: createPluginLabOperatorCsrf(principal, context.configuration.secret), records: records.map((record) => {
      const detail = workflowDetail(record, context.configuration);
      return { ...detail, track: record.track, visibility: record.visibility, emailConfirmed: record.emailConfirmed,
        publicModerationStatus: record.publicModerationStatus, awaitingReplyReview: record.awaitingReplyReview, notifications: record.notifications };
    }) };
  } catch { return null; }
}

export function createPluginLabWorkflowOperatorTransitionHandler(dependencies: Dependencies = {}) {
  const environment = dependencies.environment ?? process.env;
  return async (request: Request, proposalId: string): Promise<Response> => {
    if (!resolveOpenEnaRequestOrigin(request.headers, new URL(request.url).origin, environment)) return workflowError("invalid-origin", 403);
    const configuration = readPluginLabConfiguration(environment);
    if (!configuration) return workflowError("service-unavailable", 503);
    try {
      const principal = await operator(pluginLabCookie(request.headers, OPEN_ENA_SESSION_COOKIE), dependencies);
      if (!principal) return workflowError("operator-required", 401);
      const csrf = request.headers.get("x-plugin-lab-csrf");
      const expected = createPluginLabOperatorCsrf(principal, configuration.secret);
      if (!csrf || !/^[A-Za-z0-9_-]{43}$/u.test(csrf) || !timingSafeEqual(Buffer.from(csrf), Buffer.from(expected))) return workflowError("invalid-origin", 403);
      if (!isPluginLabProposalId(proposalId)) return workflowError("not-found", 404);
      let body: Record<string, unknown>;
      try { body = await workflowBody(request, 32_768); } catch { return workflowError("invalid-request", 400); }
      if (!onlyKeys(body, ["from", "to", "reason", "researcherMessage"]) || !isPluginProposalState(body.from) || !isPluginProposalState(body.to)
        || typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 500 || /[\u0000-\u001f\u007f]/u.test(body.reason)) return workflowError("invalid-request", 400);
      const message = body.researcherMessage === undefined || body.researcherMessage === "" ? "" : body.researcherMessage;
      if ((message !== "" && !validWorkflowMessage(message)) || (["needs-information", "not-selected"].includes(body.to) && message === "")) return workflowError("message-required", 400, { fieldErrors: { researcherMessage: "invalid-field" } });
      try { assertPluginProposalTransition(body.from, body.to); } catch { return workflowError("invalid-transition", 400); }
      const context = await workflowContext(dependencies);
      if (!context) return workflowError("service-unavailable", 503);
      const record = await context.store.readOwned(proposalId, { legacyProposalId: proposalId });
      if (!record) return workflowError("not-found", 404);
      const submission = workflowSubmission(record, configuration);
      const messageId = randomUUID();
      const messageCode = `proposal-${body.to}`;
      const changed = await context.store.transition({
        proposalId, from: body.from, to: body.to,
        actorRef: pluginLabActorRef("operator", principal.principalRef, configuration.secret),
        reasonCipher: encryptPluginLabText(body.reason.trim(), configuration.encryptionKey, "v1", `transition-reason:${proposalId}:${body.from}:${body.to}:${messageCode}`),
        ...(typeof message === "string" && message ? { message: { messageId, bodyCipher: encryptPluginLabText(message.trim(), configuration.encryptionKey, "v1", `proposal-message:${proposalId}:${messageId}`) } } : {}),
        notifications: [workflowNotification({ proposalId, email: submission.email, locale: record.submittedLocale, kind: "status", target: "researcher" }, configuration)],
      });
      return changed ? workflowJson({ proposalId, state: body.to }) : workflowError("state-conflict", 409);
    } catch { return workflowError("service-unavailable", 503); }
  };
}
