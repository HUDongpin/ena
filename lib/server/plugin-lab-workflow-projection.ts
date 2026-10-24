import { createHash, randomUUID } from "node:crypto";
import { decryptPluginLabText, encryptPluginLabText } from "@/lib/plugin-lab/crypto";
import type { PluginLabConfiguration } from "@/lib/plugin-lab/config";
import { parseStoredPluginProposalSubmission } from "@/lib/plugin-lab/proposal";
import type { PendingNotification, WorkflowProposalRecord } from "@/lib/plugin-lab/workflow-types";
import type { PluginProposalDetailView, PluginProposalSummaryView } from "@/lib/plugin-lab/workflow-view";

export function workflowSubmission(record: WorkflowProposalRecord, configuration: PluginLabConfiguration) {
  return parseStoredPluginProposalSubmission(JSON.parse(decryptPluginLabText(record.payloadCipher, { v1: configuration.encryptionKey }, `proposal-payload:${record.proposalId}`)));
}

export function workflowSummary(record: WorkflowProposalRecord, configuration: PluginLabConfiguration): PluginProposalSummaryView {
  const { title } = workflowSubmission(record, configuration);
  return { proposalId: record.proposalId, title, state: record.state, createdAt: record.createdAt, updatedAt: record.updatedAt };
}

export function workflowDetail(record: WorkflowProposalRecord, configuration: PluginLabConfiguration): PluginProposalDetailView {
  const view: PluginProposalDetailView = {
    ...workflowSummary(record, configuration), submission: workflowSubmission(record, configuration), events: record.events,
    messages: record.messages.map((message) => ({ messageId: message.messageId, actor: message.actor, createdAt: message.createdAt, text: decryptPluginLabText(message.bodyCipher, { v1: configuration.encryptionKey }, `proposal-message:${record.proposalId}:${message.messageId}`) })),
    publicConsentStatus: record.publicConsentStatus as PluginProposalDetailView["publicConsentStatus"],
  };
  if (record.state === "selected" && record.visibility === "public-after-review" && record.emailConfirmed && record.publicModerationStatus === "approved"
    && ["requested", "confirmed"].includes(record.publicConsentStatus) && record.publicProjectionCipher && record.publicProjectionSha256) {
    const raw = decryptPluginLabText(record.publicProjectionCipher, { v1: configuration.encryptionKey }, `public-projection:${record.proposalId}`);
    if (createHash("sha256").update(raw).digest("hex") !== record.publicProjectionSha256) throw new Error("Public summary binding mismatch.");
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || !("title" in value) || !("publicSummary" in value) || typeof value.title !== "string" || typeof value.publicSummary !== "string" || !value.publicSummary.trim()) throw new Error("Invalid public summary.");
    view.publicPreview = { title: value.title, publicSummary: value.publicSummary, publicProjectionSha256: record.publicProjectionSha256 };
  }
  return view;
}

export function workflowNotification(input: { proposalId: string; email: string; locale: string; kind: PendingNotification["kind"]; target: PendingNotification["target"] }, configuration: PluginLabConfiguration): PendingNotification {
  const id = randomUUID();
  return { id, proposalId: input.proposalId, kind: input.kind, locale: input.locale, target: input.target,
    recipientCipher: encryptPluginLabText(input.email, configuration.encryptionKey, "v1", `notification-recipient:${id}`) };
}

export function validWorkflowMessage(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 5000
    && !/[\u0000-\u001f\u007f]/u.test(value.replace(/\r?\n/gu, ""))
    && !/\b(?:password|passwd|api[_ -]?key|secret|bearer|access[_ -]?token)\s*[:=]\s*\S+/iu.test(value);
}
