import assert from "node:assert/strict";
import test from "node:test";
import type { OpenEnaPrincipal } from "@/lib/open-ena-auth";
import { createPluginLabOperatorCsrf } from "@/lib/server/plugin-lab-operator-route";
import { createPluginLabWorkflowOperatorTransitionHandler, readPluginLabWorkflowOperatorInbox } from "@/lib/server/plugin-lab-workflow-operator";
import { encryptPluginLabText, decryptPluginLabText } from "@/lib/plugin-lab/crypto";
import type { WorkflowStore, WorkflowProposalRecord } from "@/lib/plugin-lab/workflow-types";

const key = Buffer.alloc(32, 6);
const environment = { NODE_ENV: "production", OPEN_ENA_PUBLIC_ORIGIN: "https://www.ena.hk", ENA_PLUGIN_LAB_DATABASE_URL: "postgresql://test:test@localhost/test", ENA_PLUGIN_LAB_ENCRYPTION_KEY_V1: key.toString("base64url"), ENA_PLUGIN_LAB_SECRET: "test-workflow-operator-secret-at-least-32" };
const principal: OpenEnaPrincipal = { principalRef: "operator", jti: "11111111-1111-4111-8111-111111111111", issuedAtSeconds: 1800000000, expiresAtSeconds: 1800003600 };
const id = "plg_AAAAAAAAAAAAAAAAAAAAAA";
const submission = { schemaVersion: 2, email: "researcher@example.org", title: "An idea", researchQuestion: "A problem", proposedChange: "A useful solution", referenceLinks: [], dataSafetyConfirmed: true, privacyConsent: true };
const record = { proposalId: id, state: "under-review", payloadCipher: encryptPluginLabText(JSON.stringify(submission), key, "v1", `proposal-payload:${id}`), submittedLocale: "zh-hans", messages: [], notifications: [] } as unknown as WorkflowProposalRecord;
function request(body: unknown, csrf = createPluginLabOperatorCsrf(principal, environment.ENA_PLUGIN_LAB_SECRET)) {
  return new Request(`https://www.ena.hk/api/plugin-lab/operator/proposals/${id}/transition`, { method: "POST", headers: { origin: "https://www.ena.hk", "content-type": "application/json", cookie: "open-ena-session=operator", "x-plugin-lab-csrf": csrf }, body: JSON.stringify(body) });
}

test("workflow operator authority and CSRF are checked before storage", async () => {
  let accessed = false;
  const deps = { environment, storeFactory: async () => { accessed = true; return {} as WorkflowStore; } };
  assert.equal((await createPluginLabWorkflowOperatorTransitionHandler({ ...deps, verifyOperator: async () => null })(request({}), id)).status, 401);
  assert.equal((await createPluginLabWorkflowOperatorTransitionHandler({ ...deps, verifyOperator: async () => principal })(request({}, "wrong"), id)).status, 403);
  assert.equal(accessed, false);
  assert.equal(await readPluginLabWorkflowOperatorInbox("researcher-token", { ...deps, verifyOperator: async () => null }), null);
  assert.equal(accessed, false);
});

test("information requests require researcher-visible text and keep it separate from internal notes", async () => {
  let change: Parameters<WorkflowStore["transition"]>[0] | undefined;
  const handler = createPluginLabWorkflowOperatorTransitionHandler({ environment, verifyOperator: async () => principal, storeFactory: async () => ({ readOwned: async () => record, transition: async (input: NonNullable<typeof change>) => { change = input; return true; } } as unknown as WorkflowStore) });
  const body = { from: "under-review", to: "needs-information", reason: "Internal assessment", researcherMessage: "" };
  assert.equal((await handler(request(body), id)).status, 400);
  assert.equal((await handler(request({ ...body, researcherMessage: "Which time periods are needed?" }), id)).status, 200);
  assert.ok(change?.message);
  assert.equal(decryptPluginLabText(change.message.bodyCipher, { v1: key }, `proposal-message:${id}:${change.message.messageId}`), "Which time periods are needed?");
  assert.doesNotMatch(JSON.stringify(change), /Internal assessment|Which time/u);
  assert.equal(change.notifications.length, 1);
});
