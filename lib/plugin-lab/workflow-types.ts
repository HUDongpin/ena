import type { PluginLabCiphertextV1 } from "./crypto";
import type { PluginProposalState, PluginProposalTrack, PluginProposalVisibility } from "./proposal";
import type { PluginLabOperatorRecord } from "./store";

export type WorkflowOwner = { emailRef: string } | { legacyProposalId: string };

export interface ResearcherSession {
  emailRef: string;
  /** Bound to email-contact:<emailRef>, independent of challenge/session rotation. */
  emailCipher: PluginLabCiphertextV1;
  expiresAt: string;
}

export interface WorkflowMessage {
  messageId: string;
  actor: "operator" | "researcher";
  bodyCipher: PluginLabCiphertextV1;
  createdAt: string;
}

export interface PendingNotification {
  id: string;
  proposalId: string;
  kind: "received" | "status" | "reply";
  /** Bound to notification-recipient:<id>; plaintext never enters SQL. */
  recipientCipher: PluginLabCiphertextV1;
  locale: string;
  target: "researcher" | "operator";
}

export interface WorkflowNotificationSummary {
  id: string;
  kind: PendingNotification["kind"];
  target: PendingNotification["target"];
  status: "pending" | "sending" | "sent" | "failed";
  attempts: number;
  createdAt: string;
  sentAt: string | null;
}

export interface ClaimedNotification extends PendingNotification {
  attempts: number;
  claimToken: string;
  leaseExpiresAt: string;
}

export interface WorkflowProposalRecord extends Omit<PluginLabOperatorRecord, "publicProjectionCipher" | "publicProjectionSha256"> {
  publicProjectionCipher: PluginLabCiphertextV1 | null;
  publicProjectionSha256: string | null;
  ownerEmailRef: string | null;
  submittedLocale: string;
  awaitingReplyReview: boolean;
  messages: readonly WorkflowMessage[];
  notifications: readonly WorkflowNotificationSummary[];
}

export interface CreateOwnedProposalInput {
  proposalId: string;
  emailRef: string;
  payloadCipher: PluginLabCiphertextV1;
  sourceRef: string;
  publicProjectionCipher: PluginLabCiphertextV1 | null;
  publicProjectionSha256: string | null;
  track: PluginProposalTrack;
  visibility: PluginProposalVisibility;
  submittedLocale: string;
  idempotencyKey: string;
  requestHash: string;
  actorRef: string;
  notifications: readonly PendingNotification[];
}

export interface WorkflowStore {
  consumeRateLimit(input: { scopeKind: string; scopeRef: string; limit: number; windowSeconds: number }): Promise<boolean>;
  putChallenge(input: { challengeId: string; emailRef: string; emailCipher: PluginLabCiphertextV1; codeHash: string; locale: string; now: Date; expiresAt: Date }): Promise<boolean>;
  consumeChallenge(input: { challengeId: string; codeHash: string; now: Date; sessionHash: string; sessionExpiresAt: Date }): Promise<ResearcherSession | null>;
  invalidateChallenge(challengeId: string): Promise<void>;
  readSession(sessionHash: string, now: Date): Promise<ResearcherSession | null>;
  revokeSession(sessionHash: string): Promise<void>;
  createOwnedProposal(input: CreateOwnedProposalInput): Promise<{ proposalId: string; created: boolean } | { conflict: true } | { rateLimited: true }>;
  listOwned(emailRef: string): Promise<readonly WorkflowProposalRecord[]>;
  readOwned(proposalId: string, owner: WorkflowOwner): Promise<WorkflowProposalRecord | null>;
  listOperator(): Promise<readonly WorkflowProposalRecord[]>;
  appendReply(input: { proposalId: string; owner: WorkflowOwner; messageId: string; bodyCipher: PluginLabCiphertextV1; actorRef: string; idempotencyKey: string; requestHash: string; notifications: readonly PendingNotification[] }): Promise<"created" | "replayed" | "conflict">;
  transition(input: { proposalId: string; from: PluginProposalState; to: PluginProposalState; actorRef: string; reasonCipher: PluginLabCiphertextV1; message?: { messageId: string; bodyCipher: PluginLabCiphertextV1 }; notifications: readonly PendingNotification[] }): Promise<boolean>;
  attachOwner(proposalId: string, emailRef: string): Promise<boolean>;
  claimNotifications(limit: number, now: Date): Promise<readonly ClaimedNotification[]>;
  settleNotification(input: { id: string; claimToken: string; success: boolean; now: Date; errorCode?: string }): Promise<boolean>;
}
