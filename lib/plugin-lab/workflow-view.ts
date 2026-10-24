import type { PluginProposalState, PluginProposalSubmission } from "./proposal";

export interface PluginProposalSummaryView {
  proposalId: string; title: string; state: PluginProposalState; createdAt: string; updatedAt: string;
}
export interface PluginProposalDetailView extends PluginProposalSummaryView {
  submission: PluginProposalSubmission;
  events: readonly { state: PluginProposalState; messageCode: string; recordedAt: string }[];
  messages: readonly { messageId: string; actor: "operator" | "researcher"; text: string; createdAt: string }[];
  publicConsentStatus: "not-requested" | "requested" | "confirmed" | "withdrawn";
  publicPreview?: { title: string; publicSummary: string; publicProjectionSha256: string };
}
