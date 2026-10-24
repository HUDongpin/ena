import assert from "node:assert/strict";
import test from "node:test";
import { createPluginLabPublicConsentPostHandler } from "@/lib/server/plugin-lab-public-consent-route";
import { encryptPluginLabText, issuePluginLabStatusSession, PLUGIN_LAB_STATUS_COOKIE } from "@/lib/plugin-lab/crypto";
import { pluginLabEmailRef } from "@/lib/plugin-lab/workflow-security";
import type { WorkflowStore } from "@/lib/plugin-lab/workflow-types";
import type { PluginLabStore } from "@/lib/plugin-lab/store";
const key = Buffer.alloc(32, 9);
const secret = "synthetic-consent-secret-at-least-32-characters";
const environment = { OPEN_ENA_PUBLIC_ORIGIN: "https://www.ena.hk", ENA_PLUGIN_LAB_DATABASE_URL: "postgresql://test:test@localhost/test", ENA_PLUGIN_LAB_ENCRYPTION_KEY_V1: key.toString("base64url"), ENA_PLUGIN_LAB_SECRET: secret };
const id = "plg_AAAAAAAAAAAAAAAAAAAAAA";
const ref = pluginLabEmailRef("owner@example.org", secret);
const session = { emailRef: ref, emailCipher: encryptPluginLabText("owner@example.org", key, "v1", `email-contact:${ref}`), expiresAt: "2030-01-01T00:00:00Z" };
function request() { return new Request("https://www.ena.hk/zh-hans/plugins/status/consent", { method: "POST", headers: { origin: "https://www.ena.hk", "content-type": "application/json", cookie: `ena-plugin-lab-researcher=${"A".repeat(43)}` }, body: JSON.stringify({ proposalId: id, action: "confirm", publicProjectionSha256: "b".repeat(64) }) }); }

test("verified email owners can decide exact public-summary consent", async () => {
  let updated = false;
  const handler = createPluginLabPublicConsentPostHandler({ environment, workflowStoreFactory: async () => ({ readSession: async () => session, readOwned: async (_id: string, owner: unknown) => { assert.deepEqual(owner, { emailRef: ref }); return { proposalId: id }; } } as unknown as WorkflowStore), storeFactory: async () => ({ setPublicConsent: async () => { updated = true; return true; } } as unknown as PluginLabStore) });
  assert.equal((await handler(request())).status, 200);
  assert.equal(updated, true);
});

test("another email cannot approve someone else's public summary", async () => {
  let updated = false;
  const handler = createPluginLabPublicConsentPostHandler({ environment, workflowStoreFactory: async () => ({ readSession: async () => session, readOwned: async () => null } as unknown as WorkflowStore), storeFactory: async () => ({ setPublicConsent: async () => { updated = true; return true; } } as unknown as PluginLabStore) });
  assert.equal((await handler(request())).status, 404);
  assert.equal(updated, false);
});

test("a stale legacy cookie cannot override an active email identity", async () => {
  const staleId = "plg_BBBBBBBBBBBBBBBBBBBBBB";
  const handler = createPluginLabPublicConsentPostHandler({ environment, workflowStoreFactory: async () => ({ readSession: async () => session, readOwned: async (proposalId: string) => proposalId === id ? { proposalId } : null } as unknown as WorkflowStore), storeFactory: async () => ({ setPublicConsent: async () => true } as unknown as PluginLabStore) });
  const req = request();
  req.headers.set("cookie", `${req.headers.get("cookie")}; ${PLUGIN_LAB_STATUS_COOKIE}=${issuePluginLabStatusSession(staleId, Date.now(), secret)}`);
  assert.equal((await handler(req)).status, 200);
});
