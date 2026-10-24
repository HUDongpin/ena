import assert from "node:assert/strict";
import test from "node:test";
import { encryptPluginLabText } from "@/lib/plugin-lab/crypto";
import { createPluginLabDeliveryHandler } from "@/lib/server/plugin-lab-delivery-route";
import type { ClaimedNotification, WorkflowStore } from "@/lib/plugin-lab/workflow-types";
const key = Buffer.alloc(32, 4);
const env = { ENA_PLUGIN_LAB_DATABASE_URL: "postgresql://test:test@localhost/test", ENA_PLUGIN_LAB_ENCRYPTION_KEY_V1: key.toString("base64url"), ENA_PLUGIN_LAB_SECRET: "synthetic-delivery-secret-at-least-32", ENA_PLUGIN_LAB_WORKER_TOKEN: "synthetic-worker-secret-at-least-32" };
function request(token = env.ENA_PLUGIN_LAB_WORKER_TOKEN) { return new Request("https://www.ena.hk/api/plugin-lab/notifications/deliver", { method: "POST", headers: { authorization: `Bearer ${token}` } }); }
test("delivery authority rejects missing or wrong tokens before storage", async () => {
  let accessed = false;
  const handler = createPluginLabDeliveryHandler({ environment: env, storeFactory: async () => { accessed = true; return null; } });
  assert.equal((await handler(request("wrong"))).status, 401);
  assert.equal(accessed, false);
});
test("delivery settles each lease and returns counts only when SMTP fails", async () => {
  const items = ["one", "two"].map((id) => ({ id, proposalId: "plg_AAAAAAAAAAAAAAAAAAAAAA", recipientCipher: encryptPluginLabText("owner@example.org", key, "v1", `notification-recipient:${id}`), locale: "en", kind: "received", target: "researcher", claimToken: "claim", attempts: 1, leaseExpiresAt: "2030-01-01T00:00:00Z" })) as ClaimedNotification[];
  const settled: Parameters<WorkflowStore["settleNotification"]>[0][] = [];
  const handler = createPluginLabDeliveryHandler({ environment: env, storeFactory: async () => ({ claimNotifications: async () => items, settleNotification: async (input: typeof settled[number]) => { settled.push(input); return true; } } as unknown as WorkflowStore), sendNotification: async (input) => { assert.equal(input.email, "owner@example.org"); if (input.id === "one") throw new Error("private SMTP failure"); } });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { claimed: 2, sent: 1, failed: 1 });
  assert.equal(settled[0].success, false);
  assert.equal(settled[1].success, true);
  assert.doesNotMatch(JSON.stringify(settled), /private SMTP|owner@example/u);
});
