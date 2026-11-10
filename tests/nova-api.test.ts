import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";
import { encryptPluginLabText } from "../lib/plugin-lab/crypto";
import { pluginLabEmailRef } from "../lib/plugin-lab/workflow-security";
import type { WorkflowStore } from "../lib/plugin-lab/workflow-types";
import { NovaStoreError, type NovaStore } from "../lib/nova/store";
const env = { ENA_PLUGIN_LAB_DATABASE_URL: "postgresql://localhost/test", ENA_PLUGIN_LAB_ENCRYPTION_KEY_V1: Buffer.alloc(32, 7).toString("base64url"), ENA_PLUGIN_LAB_SECRET: "s".repeat(40), ENA_NOVA_ENABLED: "true", ENA_NOVA_QWEN_API_KEY: "synthetic-test-key", ENA_NOVA_SANDBOX_IMAGE: `sha256:${"a".repeat(64)}`, ENA_NOVA_SANDBOX_RUNTIME: "runsc" };
const email = "researcher@example.invalid", owner = pluginLabEmailRef(email, env.ENA_PLUGIN_LAB_SECRET), id = randomUUID();
const identityTag = createHash("sha256").update(`nova-identity:v1:${email}`).digest("hex");
const request = (path: string, body?: unknown, headers: Record<string, string> = {}) => new Request(`https://nova.example${path}`, {method: body === undefined ? "GET" : "POST", headers: {cookie: `ena-plugin-lab-researcher=${"a".repeat(43)}`, "x-nova-identity": identityTag, ...(body === undefined ? {} : {origin: "https://nova.example", "content-type": "application/json", "idempotency-key": randomUUID()}), ...headers}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
test("Nova API uses verified researcher identity and bounded authenticated mutations", async t => {
  assert.equal(existsSync(new URL("../lib/nova/server.ts", import.meta.url)), true, "Nova route service exists");
  const { createNovaApiHandler } = await import("../lib/nova/server");
  let calls = 0;
  const workflow = {readSession: async () => ({ emailRef: owner, emailCipher: encryptPluginLabText(email, Buffer.alloc(32, 7), "v1", `email-contact:${owner}`), expiresAt: "2026-12-01T00:00:00Z" }), consumeRateLimit: async () => true} as unknown as WorkflowStore;
  const store = {listSessions: async (ref: string) => {assert.equal(ref, owner); return [];}, readSession: async (_id: string, ref: string) => {assert.equal(ref, owner); return null;}, createSession: async (input: {ownerRef: string}) => {calls++; assert.equal(input.ownerRef, owner); return {id};}, appendMessage: async () => {calls++; return {};}} as unknown as NovaStore;
  const deps = {environment: env, storeFactory: async () => workflow, novaStoreFactory: async () => store};
  await t.test("legacy proposal receipt cannot authorize a Nova account", async () => {
    const response = await createNovaApiHandler("sessions", deps)(request("/api/nova/sessions", undefined, {cookie: "ena-plugin-lab-legacy=legacy"}));
    assert.equal(response.status, 401); assert.equal((await response.json()).code, "researcher-required");
  });
  await t.test("private list and ownership projection", async () => {
    const response = await createNovaApiHandler("sessions", deps)(request("/api/nova/sessions"));
    assert.equal(response.status, 200); assert.match(response.headers.get("cache-control")!, /private, no-store/); assert.deepEqual(await response.json(), {sessions: []});
    assert.equal((await createNovaApiHandler("session", deps)(request(`/api/nova/sessions/${id}`), {id})).status, 404);
  });
  await t.test("a cookie switch cannot read or submit a draft owned by the previous identity", async () => {
    for (const tag of ["", "b".repeat(64)]) {
      const get = await createNovaApiHandler("sessions", deps)(request("/api/nova/sessions", undefined, {"x-nova-identity": tag}));
      assert.equal(get.status, 401); assert.equal((await get.json()).code, "identity-mismatch");
      const post = await createNovaApiHandler("sessions", deps)(request("/api/nova/sessions", {locale:"en"}, {"x-nova-identity": tag}));
      assert.equal(post.status, 401); assert.equal((await post.json()).code, "identity-mismatch");
    }
    assert.equal(calls, 0);
  });
  await t.test("origin, idempotency, extra upload fields and content bounds reject before mutation", async () => {
    const handle = createNovaApiHandler("sessions", deps);
    assert.equal((await handle(request("/api/nova/sessions", {locale: "en"}, {origin: "https://evil.example"}))).status, 403);
    assert.equal((await handle(request("/api/nova/sessions", {locale: "en"}, {"idempotency-key": "bad"}))).status, 400);
    assert.equal((await handle(request("/api/nova/sessions", {locale: "en", data: "upload"}))).status, 400);
    assert.equal((await createNovaApiHandler("messages", deps)(request("/api/nova/sessions/x/messages", {content: "x".repeat(20000), modelKey: "qwen-max", effort: "medium"}), {id})).status, 400);
    assert.equal(calls, 0);
  });
  await t.test("valid session creation uses owner identity", async () => {
    assert.equal((await createNovaApiHandler("sessions", deps)(request("/api/nova/sessions", {locale: "en", title: "Test"}))).status, 201); assert.equal(calls, 1);
  });
  await t.test("session renames accept only a bounded, single-line title and use the verified owner", async () => {
    let renames = 0;
    const renameStore: NovaStore = { ...store, renameSession: async input => {
      renames++;
      assert.equal(input.ownerRef, owner);
      assert.equal(input.sessionId, id);
      assert.equal(input.title, "改名");
      return { id, title: input.title } as Awaited<ReturnType<NovaStore["renameSession"]>>;
    }};
    const handle = createNovaApiHandler("session", { ...deps, novaStoreFactory: async () => renameStore });
    const path = `/api/nova/sessions/${id}`;
    for (const body of [{}, { title: "   " }, { title: "a\nb" }, { title: "x".repeat(121) }, { title: "ok", ownerRef: "other" }]) {
      assert.equal((await handle(request(path, body), { id })).status, 400);
    }
    assert.equal(renames, 0);
    const response = await handle(request(path, { title: "  改名 " }), { id });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { session: { id, title: "改名" } });
    assert.equal(renames, 1);
  });
  await t.test("unconfigured models and unavailable sandbox fail explicitly", async () => {
    const body = {content: "Build a presenter", modelKey: "qwen-max", effort: "medium"};
    const response = await createNovaApiHandler("messages", {...deps, environment: {...env, ENA_NOVA_QWEN_API_KEY: ""}})(request(`/api/nova/sessions/${id}/messages`, body), {id});
    assert.equal(response.status, 503); assert.equal((await response.json()).code, "provider-not-configured");
    const noRuntime = await createNovaApiHandler("messages", {...deps, environment: {...env, ENA_NOVA_SANDBOX_IMAGE: ""}})(request(`/api/nova/sessions/${id}/messages`, body), {id});
    assert.equal(noRuntime.status, 503); assert.equal((await noRuntime.json()).code, "runtime-not-configured"); assert.equal(calls, 1);
  });
  await t.test("rate limits reject without invoking mutation", async () => {
    const limited = {...workflow, consumeRateLimit: async () => false};
    const response = await createNovaApiHandler("sessions", {...deps, storeFactory: async () => limited})(request("/api/nova/sessions", {locale: "en"}));
    assert.equal(response.status, 429); assert.equal(calls, 1);
  });
});

test("Nova artifact downloads are owned draft ZIPs with checks and no executable response content", async () => {
  const {createNovaApiHandler}=await import("../lib/nova/server"); const artifactId=randomUUID();
  const artifact={id:artifactId,files:[{path:"src/plugin.ts",content:"export default function present() { return {}; }"}],sourceHash:"a".repeat(64),fixtureHash:"b".repeat(64),status:"draft",checks:[],output:{title:"Synthetic"},manifest:{name:"Synthetic"}};
  const workflow={readSession:async()=>({emailRef:owner,emailCipher:encryptPluginLabText(email,Buffer.alloc(32,7),"v1",`email-contact:${owner}`),expiresAt:"2026-12-01T00:00:00Z"}),consumeRateLimit:async()=>true} as unknown as WorkflowStore;
  const store={readSession:async(_id:string,ref:string)=>{assert.equal(ref,owner);return {artifacts:[artifact]};}} as unknown as NovaStore;
  const response=await createNovaApiHandler("artifact",{environment:env,storeFactory:async()=>workflow,novaStoreFactory:async()=>store})(request(`/api/nova/sessions/${id}/artifacts/${artifactId}?download=1`),{id,artifactId});
  assert.equal(response.status,200); assert.equal(response.headers.get("content-type"),"application/zip"); assert.match(response.headers.get("content-disposition")!,/^attachment;/);
  const files=unzipSync(new Uint8Array(await response.arrayBuffer())); assert.equal(strFromU8(files["src/plugin.ts"]),artifact.files[0].content);
  assert.equal(JSON.parse(strFromU8(files["nova-receipt.json"])).status,"draft");
});

test("manual expert requests require the displayed run and artifact and preserve stale-request conflicts", async () => {
  const {createNovaApiHandler}=await import("../lib/nova/server"); const runId=randomUUID(),artifactId=randomUUID();
  const workflow={readSession:async()=>({emailRef:owner,emailCipher:encryptPluginLabText(email,Buffer.alloc(32,7),"v1",`email-contact:${owner}`),expiresAt:"2026-12-01T00:00:00Z"}),consumeRateLimit:async()=>true} as unknown as WorkflowStore;
  let calls=0; let received: {runId:string;artifactId:string|null}|undefined;
  const store={requestExpert:async(input:{runId:string;artifactId:string|null})=>{calls++;received=input;throw new NovaStoreError("stale-expert-request");}} as unknown as NovaStore;
  const handle=createNovaApiHandler("expert",{environment:env,storeFactory:async()=>workflow,novaStoreFactory:async()=>store});
  const url=`/api/nova/sessions/${id}/expert`;
  for(const body of [{question:"Review this"},{question:"Review this",runId:"bad",artifactId},{question:"Review this",runId,artifactId:"bad"}]) assert.equal((await handle(request(url,body),{id})).status,400);
  assert.equal(calls,0);
  for(const displayedArtifact of [artifactId,null]) {
    const response=await handle(request(url,{question:"Review displayed version",runId,artifactId:displayedArtifact}),{id});
    assert.equal(response.status,409); assert.equal((await response.json()).code,"stale-expert-request");
    assert.equal(received?.runId,runId); assert.equal(received?.artifactId,displayedArtifact);
  }
});
