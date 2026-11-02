import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { OpenEnaPrincipal } from "../lib/open-ena-auth";
import { createPluginLabOperatorCsrf } from "../lib/server/plugin-lab-operator-route";
import { createNovaApiHandler, readNovaOperatorInbox } from "../lib/nova/server";
import { NovaStoreError, type NovaStore } from "../lib/nova/store";
import type { WorkflowStore } from "../lib/plugin-lab/workflow-types";
const environment = { NODE_ENV: "production", OPEN_ENA_PUBLIC_ORIGIN: "https://www.ena.hk", ENA_PLUGIN_LAB_DATABASE_URL: "postgresql://localhost/test", ENA_PLUGIN_LAB_ENCRYPTION_KEY_V1: Buffer.alloc(32, 6).toString("base64url"), ENA_PLUGIN_LAB_SECRET: "test-workflow-operator-secret-at-least-32", ENA_PLUGIN_LAB_SMTP_HOST: "smtp.example.invalid", ENA_PLUGIN_LAB_SMTP_PORT: "587", ENA_PLUGIN_LAB_SMTP_USER: "sender", ENA_PLUGIN_LAB_SMTP_PASSWORD: "test-password", ENA_PLUGIN_LAB_MAIL_FROM: "plugins@example.invalid", ENA_PLUGIN_LAB_OPERATOR_EMAIL: "operator@example.invalid", ENA_PLUGIN_LAB_WORKER_TOKEN: "worker".repeat(8) };
const principal: OpenEnaPrincipal = {principalRef: "operator", jti: randomUUID(), issuedAtSeconds: 1800000000, expiresAtSeconds: 1800003600};
const id = randomUUID(), requestId = randomUUID(), runId = randomUUID();
function request(body: unknown, csrf = createPluginLabOperatorCsrf(principal, environment.ENA_PLUGIN_LAB_SECRET)) { return new Request(`https://www.ena.hk/api/nova/operator/sessions/${id}/expert/${requestId}`, {method: "POST", headers: {origin: "https://www.ena.hk", "content-type": "application/json", cookie: "open-ena-session=operator", "x-plugin-lab-csrf": csrf, "idempotency-key": randomUUID()}, body: JSON.stringify(body)}); }
test("Nova expert responses require operator authority, CSRF and exact candidate identity", async () => {
  let accessed = 0, received: unknown;
  const store = {respondExpert: async (input: unknown) => {received = input; throw new NovaStoreError("stale-expert-request");}} as unknown as NovaStore;
  const deps = {environment, storeFactory: async () => ({consumeRateLimit: async () => true}) as unknown as WorkflowStore, novaStoreFactory: async () => {accessed++; return store;}};
  const body = {runId, artifactId: null, response: "Use a presenter without changing the analysis."};
  assert.equal((await createNovaApiHandler("expert-response", {...deps, verifyOperator: async () => null})(request(body), {id,requestId})).status, 401);
  assert.equal((await createNovaApiHandler("expert-response", {...deps, verifyOperator: async () => principal})(request(body,"wrong"), {id,requestId})).status, 403);
  assert.equal(accessed, 0);
  assert.equal(await readNovaOperatorInbox("researcher", {...deps, verifyOperator: async () => null}), null);
  const handle = createNovaApiHandler("expert-response", {...deps, verifyOperator: async () => principal});
  assert.equal((await handle(request({...body, internalNote: "private"}), {id,requestId})).status, 400);
  const stale = await handle(request(body), {id,requestId}); assert.equal(stale.status,409); assert.equal((await stale.json()).code,"stale-expert-request");
  assert.deepEqual((received as {response: string}).response,body.response); assert.doesNotMatch(JSON.stringify(received),/internalNote/);
});
test("Nova expert mail reuses the bounded sender and contains only an authenticated inbox reference", async () => {
  const mail = await import("../lib/plugin-lab/mail");
  assert.equal(typeof mail.sendNovaExpertNotificationEmail, "function", "Nova notification sender exists");
  let content: {to: string; text: string; subject: string} | undefined;
  await mail.sendNovaExpertNotificationEmail({id: randomUUID(), requestId, sessionId: id, locale: "en"}, environment, async input => {content = input; return {accepted: [environment.ENA_PLUGIN_LAB_OPERATOR_EMAIL], rejected: []};});
  assert.equal(content?.to, environment.ENA_PLUGIN_LAB_OPERATOR_EMAIL); assert.match(content!.subject,/Nova/); assert.match(content!.text,/https:\/\/www\.ena\.hk\/en\/plugins\/operator/);
  assert.doesNotMatch(content!.text,/token=|Use a presenter|Build a presenter/);
});
test("Nova notification drain authenticates worker and settles accepted or failed sends", async () => {
  assert.equal(existsSync(new URL("../lib/nova/notifications.ts",import.meta.url)),true,"Nova delivery handler exists");
  const {createNovaDeliveryHandler} = await import("../lib/nova/notifications");
  let sends = 0; const settlements: boolean[] = [];
  const store = {claimNotifications: async () => [{id: randomUUID(),sessionId:id,requestId,locale:"en",claimToken:randomUUID(),attempts:1}], settleNotification: async (input: {success: boolean}) => {settlements.push(input.success);return true;}} as unknown as NovaStore;
  const deps = {environment,novaStoreFactory: async()=>store,sendNotification: async()=>{sends++;}};
  const url = "https://www.ena.hk/api/nova/notifications/deliver";
  assert.equal((await createNovaDeliveryHandler(deps)(new Request(url,{method:"POST"}))).status,401); assert.equal(sends,0);
  const authorized = ()=>new Request(url,{method:"POST",headers:{authorization:`Bearer ${environment.ENA_PLUGIN_LAB_WORKER_TOKEN}`}});
  assert.deepEqual(await (await createNovaDeliveryHandler(deps)(authorized())).json(),{claimed:1,sent:1,failed:0});
  assert.deepEqual(await (await createNovaDeliveryHandler({...deps,sendNotification:async()=>{throw new Error("synthetic transport failure");}})(authorized())).json(),{claimed:1,sent:0,failed:1});
  assert.deepEqual(settlements,[true,false]);
});
