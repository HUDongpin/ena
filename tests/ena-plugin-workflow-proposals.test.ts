import assert from "node:assert/strict";
import test from "node:test";
import { encryptPluginLabText, decryptPluginLabText } from "@/lib/plugin-lab/crypto";
import { pluginLabEmailRef } from "@/lib/plugin-lab/workflow-security";
import type { WorkflowProposalRecord, WorkflowStore } from "@/lib/plugin-lab/workflow-types";
import { createPluginLabOwnedProposalPostHandler, createPluginLabOwnedProposalGetHandler, createPluginLabOwnedProposalListHandler, createPluginLabReplyHandler } from "@/lib/server/plugin-lab-owned-proposal-route";

const secret = "synthetic-owned-proposal-secret-at-least-32";
const key = Buffer.alloc(32, 8);
const env = { NODE_ENV: "production", OPEN_ENA_PUBLIC_ORIGIN: "https://www.ena.hk", ENA_PLUGIN_LAB_DATABASE_URL: "postgresql://test:test@localhost/test", ENA_PLUGIN_LAB_ENCRYPTION_KEY_V1: key.toString("base64url"), ENA_PLUGIN_LAB_SECRET: secret, ENA_PLUGIN_LAB_PROPOSALS_ENABLED: "true", ENA_PLUGIN_LAB_SMTP_HOST: "smtp.example.org", ENA_PLUGIN_LAB_SMTP_USER: "test", ENA_PLUGIN_LAB_SMTP_PASSWORD: "test", ENA_PLUGIN_LAB_MAIL_FROM: "plugins@example.org", ENA_PLUGIN_LAB_OPERATOR_EMAIL: "operator@example.org", ENA_PLUGIN_LAB_WORKER_TOKEN: "synthetic-worker-token-at-least-32-characters" };
const email = "owner@example.org";
const emailRef = pluginLabEmailRef(email, secret);
const proposalId = "plg_AAAAAAAAAAAAAAAAAAAAAA";
const session = { emailRef, emailCipher: encryptPluginLabText(email, key, "v1", `email-contact:${emailRef}`), expiresAt: "2030-01-01T00:00:00Z" };
const form = { schemaVersion: 2, email, title: "A new view", researchQuestion: "How does learning change?", proposedChange: "Compare two fitted periods.", dataSafetyConfirmed: "yes", privacyConsent: "yes" };

function req(body?: unknown, auth = true, method = "POST") {
  return new Request("https://www.ena.hk/api/plugin-lab/proposals", { method, headers: { origin: "https://www.ena.hk", "content-type": "application/json", "x-plugin-lab-locale": "zh-hans", "idempotency-key": "11111111-1111-4111-8111-111111111111", ...(auth ? { cookie: `ena-plugin-lab-researcher=${"A".repeat(43)}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
function fixture(extra: Partial<WorkflowStore> = {}) {
  return { readSession: async () => session, consumeRateLimit: async () => true, ...extra } as WorkflowStore;
}
function record(): WorkflowProposalRecord {
  return { proposalId, state: "needs-information", createdAt: "2026-10-24T00:00:00Z", updatedAt: "2026-10-24T00:00:00Z", events: [], payloadCipher: encryptPluginLabText(JSON.stringify({ ...form, name: null, affiliation: null, currentGap: "", unchangedBoundary: "", publicSummary: "", privateDetails: "private input", referenceLinks: [], visibility: "private", track: "unsure", dataSafetyConfirmed: true, privacyConsent: true }), key, "v1", `proposal-payload:${proposalId}`), publicProjectionCipher: null, publicProjectionSha256: null, ownerEmailRef: emailRef, submittedLocale: "zh-hans", awaitingReplyReview: false, messages: [], notifications: [], track: "unsure", visibility: "private", emailConfirmed: true, publicConsentStatus: "not-requested", publicModerationStatus: "pending" };
}

test("new submissions require email verification and derive ownership from that session", async () => {
  let stored: Parameters<WorkflowStore["createOwnedProposal"]>[0] | undefined;
  const handler = createPluginLabOwnedProposalPostHandler({ environment: env, storeFactory: async () => fixture({ createOwnedProposal: async (input) => { stored = input; return { proposalId: input.proposalId, created: true }; } }) });
  assert.equal((await handler(req(form, false))).status, 401);
  assert.equal((await handler(req({ ...form, email: "someone@example.org" }))).status, 401);
  const result = await handler(req(form));
  assert.equal(result.status, 201);
  assert.equal(stored?.emailRef, emailRef);
  assert.equal(stored?.publicProjectionCipher, null);
  assert.equal(stored?.notifications.length, 2);
  assert.doesNotMatch(JSON.stringify(stored), /owner@example|private input|Compare two/u);
  assert.equal((await result.json()).accessCode, undefined);
});

test("a replay returns the original reference without making another receipt", async () => {
  const handler = createPluginLabOwnedProposalPostHandler({ environment: env, storeFactory: async () => fixture({ createOwnedProposal: async () => ({ proposalId, created: false }) }) });
  const response = await handler(req(form));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).proposalId, proposalId);
});

test("proposal queries are scoped to the verified owner and never return internal data", async () => {
  let scope: unknown;
  const store = fixture({ readOwned: async (_id, owner) => { scope = owner; return record(); }, listOwned: async (owner) => { assert.equal(owner, emailRef); return [record()]; } });
  const detail = await createPluginLabOwnedProposalGetHandler({ environment: env, storeFactory: async () => store })(req(undefined, true, "GET"), proposalId);
  assert.equal(detail.status, 200);
  assert.deepEqual(scope, { emailRef });
  const body = await detail.json();
  assert.equal(body.proposal.submission.privateDetails, "private input");
  assert.doesNotMatch(JSON.stringify(body), /Cipher|emailRef|actorRef|reason|notification/u);
  const list = await createPluginLabOwnedProposalListHandler({ environment: env, storeFactory: async () => store })(req(undefined, true, "GET"));
  const listing = await list.json();
  assert.equal(listing.proposals[0].title, "A new view");
  assert.doesNotMatch(JSON.stringify(listing), /private input/u);
});

test("reply text is encrypted and submitted with owner scope and an operator notification", async () => {
  let input: Parameters<WorkflowStore["appendReply"]>[0] | undefined;
  const handler = createPluginLabReplyHandler({ environment: env, storeFactory: async () => fixture({ readOwned: async () => record(), appendReply: async (value) => { input = value; return "created"; } }) });
  const response = await handler(req({ text: "We need two semesters." }), proposalId);
  assert.equal(response.status, 201);
  assert.deepEqual(input?.owner, { emailRef });
  assert.equal(input?.notifications[0].target, "operator");
  assert.equal(decryptPluginLabText(input!.bodyCipher, { v1: key }, `proposal-message:${proposalId}:${input!.messageId}`), "We need two semesters.");
  assert.doesNotMatch(JSON.stringify(input), /two semesters/u);
});

test("missing or someone else's proposal returns the same not-found response", async () => {
  const handler = createPluginLabOwnedProposalGetHandler({ environment: env, storeFactory: async () => fixture({ readOwned: async () => null }) });
  assert.equal((await handler(req(undefined, true, "GET"), proposalId)).status, 404);
});
