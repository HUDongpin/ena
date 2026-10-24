import assert from "node:assert/strict";
import test from "node:test";
import { encryptPluginLabText } from "@/lib/plugin-lab/crypto";
import type { WorkflowStore } from "@/lib/plugin-lab/workflow-types";
import { pluginLabEmailRef, pluginLabWorkflowHash } from "@/lib/plugin-lab/workflow-security";
import { createPluginLabEmailRequestHandler, createPluginLabEmailVerifyHandler, createPluginLabSessionHandler } from "@/lib/server/plugin-lab-email-route";
import { createPluginLabStatusSessionPostHandler } from "@/lib/server/plugin-lab-status-route";
import { hashPluginLabAccessCode } from "@/lib/plugin-lab/crypto";
import type { PluginLabStore } from "@/lib/plugin-lab/store";

export const environment = {
  NODE_ENV: "production", OPEN_ENA_PUBLIC_ORIGIN: "https://www.ena.hk",
  ENA_PLUGIN_LAB_DATABASE_URL: "postgresql://plugin:test@localhost/plugin_test",
  ENA_PLUGIN_LAB_ENCRYPTION_KEY_V1: Buffer.alloc(32, 7).toString("base64url"),
  ENA_PLUGIN_LAB_SECRET: "synthetic-plugin-workflow-test-secret-32",
  ENA_PLUGIN_LAB_SMTP_HOST: "smtp.example.org", ENA_PLUGIN_LAB_SMTP_USER: "test",
  ENA_PLUGIN_LAB_SMTP_PASSWORD: "synthetic", ENA_PLUGIN_LAB_MAIL_FROM: "plugins@example.org",
  ENA_PLUGIN_LAB_OPERATOR_EMAIL: "operator@example.org", ENA_PLUGIN_LAB_WORKER_TOKEN: "synthetic-worker-token-with-32-characters",
  ENA_PLUGIN_LAB_PROPOSALS_ENABLED: "true",
};
const now = new Date("2026-10-24T12:00:00Z");
const email = "researcher@example.org";
const emailRef = pluginLabEmailRef(email, environment.ENA_PLUGIN_LAB_SECRET);
const session = { emailRef, emailCipher: encryptPluginLabText(email, Buffer.alloc(32, 7), "v1", `email-contact:${emailRef}`), expiresAt: new Date(now.getTime() + 1_800_000).toISOString() };

function request(body: unknown, path = "request", origin = "https://www.ena.hk") {
  return new Request(`https://www.ena.hk/api/plugin-lab/email-code/${path}`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
}

test("requesting a code saves a hash, sends a localized email, and never submits a proposal", async () => {
  let challenge: Parameters<WorkflowStore["putChallenge"]>[0] | undefined;
  let sent: { email: string; code: string; locale: string } | undefined;
  const store = { consumeRateLimit: async () => true, putChallenge: async (input: NonNullable<typeof challenge>) => { challenge = input; return true; } } as unknown as WorkflowStore;
  const handler = createPluginLabEmailRequestHandler({ environment, now: () => now, storeFactory: async () => store, sendCode: async (input) => { sent = input; } });
  const response = await handler(request({ email, locale: "zh-hans" }));
  assert.equal(response.status, 202);
  const receipt = await response.json();
  assert.ok(challenge && sent);
  assert.match(sent.code, /^\d{6}$/u);
  assert.equal(challenge.codeHash, pluginLabWorkflowHash("email-code", `${receipt.challengeId}:${sent.code}`, environment.ENA_PLUGIN_LAB_SECRET));
  assert.equal(challenge.expiresAt.getTime() - challenge.now.getTime(), 600_000);
  assert.doesNotMatch(JSON.stringify(receipt), /researcher@example|codeHash|emailCipher/u);
  assert.equal(sent.locale, "zh-hans");
});

test("code request rejects cross-origin traffic and reports SMTP failures without a false success", async () => {
  let invalidated = false;
  const handler = createPluginLabEmailRequestHandler({ environment, now: () => now, storeFactory: async () => ({ consumeRateLimit: async () => true, putChallenge: async () => true, invalidateChallenge: async () => { invalidated = true; } } as unknown as WorkflowStore), sendCode: async () => { throw new Error("secret SMTP diagnostic"); } });
  assert.equal((await handler(request({ email, locale: "en" }, "request", "https://attacker.example"))).status, 403);
  const failed = await handler(request({ email, locale: "en" }));
  assert.equal(failed.status, 503);
  assert.equal(invalidated, true);
  assert.doesNotMatch(await failed.text(), /secret|SMTP diagnostic/u);
});

test("a consumed code creates a researcher cookie only, not an operator session", async () => {
  let verified: Parameters<WorkflowStore["consumeChallenge"]>[0] | undefined;
  const handler = createPluginLabEmailVerifyHandler({ environment, now: () => now, storeFactory: async () => ({ consumeRateLimit: async () => true, consumeChallenge: async (input: NonNullable<typeof verified>) => { verified = input; return session; } } as unknown as WorkflowStore) });
  const response = await handler(request({ challengeId: "A".repeat(43), code: "012345" }, "verify"));
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie")!;
  assert.match(cookie, /ena-plugin-lab-researcher=.*HttpOnly; SameSite=Lax/u);
  assert.match(cookie, /Secure/u);
  assert.doesNotMatch(cookie, /open-ena-session/u);
  assert.equal(verified?.sessionExpiresAt.getTime(), now.getTime() + 1_800_000);
  assert.equal((await response.json()).email, email);
});

test("expired, exhausted and invalid codes share one verification error", async () => {
  const handler = createPluginLabEmailVerifyHandler({ environment, now: () => now, storeFactory: async () => ({ consumeRateLimit: async () => true, consumeChallenge: async () => null } as unknown as WorkflowStore) });
  const response = await handler(request({ challengeId: "A".repeat(43), code: "999999" }, "verify"));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "invalid-code");
  assert.equal(response.headers.get("set-cookie"), null);
});

test("sign-out revokes the opaque session and clears researcher and legacy cookies", async () => {
  let revoked = "";
  const handler = createPluginLabSessionHandler({ environment, storeFactory: async () => ({ revokeSession: async (hash: string) => { revoked = hash; } } as WorkflowStore) });
  const response = await handler(new Request("https://www.ena.hk/api/plugin-lab/session", { method: "DELETE", headers: { origin: "https://www.ena.hk", cookie: `ena-plugin-lab-researcher=${"A".repeat(43)}` } }));
  assert.equal(response.status, 200);
  assert.equal(revoked, pluginLabWorkflowHash("session", "A".repeat(43), environment.ENA_PLUGIN_LAB_SECRET));
  assert.match(response.headers.get("set-cookie")!, /Max-Age=0/u);
});

test("earlier receipts can establish scoped legacy access without leaving the page", async () => {
  const id = "plg_AAAAAAAAAAAAAAAAAAAAAA";
  const code = "B".repeat(43);
  const handler = createPluginLabStatusSessionPostHandler({ environment, storeFactory: async () => ({ consumeRateLimit: async () => true, accessHashFor: async () => hashPluginLabAccessCode(id, code, environment.ENA_PLUGIN_LAB_SECRET) } as unknown as PluginLabStore) });
  const response = await handler(new Request("https://www.ena.hk/api/plugin-lab/status-session", { method: "POST", headers: { origin: "https://www.ena.hk", "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: new URLSearchParams({ proposalId: id, accessCode: code, locale: "zh-hans" }) }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).proposalId, id);
  assert.match(response.headers.get("set-cookie")!, /ena-plugin-lab-legacy=/u);
  assert.doesNotMatch(response.headers.get("set-cookie")!, new RegExp(code, "u"));
});

test("a pre-update HTML status form establishes access for the new status screen", async () => {
  const id = "plg_AAAAAAAAAAAAAAAAAAAAAA";
  const code = "B".repeat(43);
  const handler = createPluginLabStatusSessionPostHandler({ environment, storeFactory: async () => ({ consumeRateLimit: async () => true, accessHashFor: async () => hashPluginLabAccessCode(id, code, environment.ENA_PLUGIN_LAB_SECRET) } as unknown as PluginLabStore) });
  const response = await handler(new Request("https://www.ena.hk/api/plugin-lab/status-session", { method: "POST", headers: { origin: "https://www.ena.hk", "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ proposalId: id, accessCode: code, locale: "zh-hans" }) }));
  assert.equal(response.status, 303);
  assert.ok(response.headers.getSetCookie().some((value) => value.startsWith("ena-plugin-lab-legacy=")));
  assert.ok(response.headers.getSetCookie().some((value) => value.startsWith("ena-plugin-lab-researcher=;") && value.includes("Max-Age=0")));
});
