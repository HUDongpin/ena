import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { cleanupOwnedEphemeralPostgres } from "./support/owned-ephemeral-postgres.mjs";
import type { NovaModel, NovaArtifactVersion } from "../lib/nova/types";
import { NOVA_SYNTHETIC_CONTEXT } from "../lib/nova/sdk";
const owner = "A".repeat(43), other = "B".repeat(43);
const config = { databaseUrl: "postgresql://localhost/test", encryptionKey: Buffer.alloc(32, 3), keyVersion: "v1" as const, secret: "s".repeat(40) };
const model: NovaModel = { key: "qwen-max", provider: "qwen", label: "Qwen Max", apiModel: "test", version: "test", available: true };
const now = new Date("2026-11-01T01:00:00Z"), later = (s: number) => new Date(+now + s * 1000);
const mutation = () => ({ ownerRef: owner, idempotencyKey: randomUUID(), requestHash: "a".repeat(64), now });
test("Nova PostgreSQL ownership, replay, leases and expert workflow", async t => {
  assert.equal(existsSync(new URL("../migrations/012_nova_code.sql", import.meta.url)), true, "Nova durable migration must exist");
  const { createNovaStore } = await import("../lib/nova/store");
  const prefix = "ena-nova-test-", rootDirectory = mkdtempSync(join(tmpdir(), prefix)), dataDirectory = join(rootDirectory, "data");
  let pool: Pool | undefined, startAttempted = false;
  try {
    execFileSync("initdb", ["--pgdata", dataDirectory, "--auth", "trust", "--username", "postgres", "--encoding", "UTF8", "--no-locale"], { stdio: "pipe" });
    const port = await new Promise<number>((resolve, reject) => { const server = createServer(); server.once("error", reject); server.listen(0, "127.0.0.1", () => { const port = (server.address() as { port: number }).port; server.close(e => e ? reject(e) : resolve(port)); }); });
    startAttempted = true;
    execFileSync("pg_ctl", ["--pgdata", dataDirectory, "--log", join(rootDirectory, "postgres.log"), "--options", `-h 127.0.0.1 -p ${port} -c unix_socket_directories=''`, "--wait", "start"], { stdio: "pipe" });
    pool = new Pool({ host: "127.0.0.1", port, user: "postgres", database: "postgres", max: 12 });
    const db = pool;
    const sql = readFileSync(new URL("../migrations/012_nova_code.sql", import.meta.url), "utf8"); await db.query(sql); await db.query(sql);
    const store = createNovaStore(db, config);
    const input = { ...mutation(), locale: "en", title: "Private research" };
    const session = await store.createSession(input);
    await t.test("idempotency binds owner, action and body and content is encrypted", async () => {
      const copies = await Promise.all(Array.from({length: 5}, () => store.createSession(input)));
      assert.ok(copies.every(s => s.id === session.id));
      await assert.rejects(store.createSession({...input, requestHash: "b".repeat(64)}), { code: "idempotency-conflict" });
      assert.equal(await store.readSession(session.id, other), null);
      assert.equal((await store.listSessions(other)).length, 0);
      assert.doesNotMatch(JSON.stringify((await db.query("SELECT * FROM ena_nova_sessions")).rows), /Private research/);
      await assert.rejects(db.query("DELETE FROM ena_nova_receipts"));
    });
    const message = { ...mutation(), sessionId: session.id, content: "Build a presenter", model, effort: "medium" as const };
    await assert.rejects(store.appendMessage({...message,idempotencyKey:input.idempotencyKey}), {code:"idempotency-conflict"});
    const started = await store.appendMessage(message);
    await t.test("one active run and replay never duplicate a message", async () => {
      assert.equal((await store.appendMessage(message)).run.id, started.run.id);
      await assert.rejects(store.appendMessage({...message, idempotencyKey: randomUUID()}), { code: "run-active" });
      await assert.rejects(store.appendMessage({...message, ownerRef: other}), { code: "not-found" });
      assert.equal((await store.readSession(session.id, owner))?.messages.length, 1);
    });
    const claims = await Promise.all(Array.from({length: 5}, () => store.claimNextRun(now)));
    const claim = claims.find(Boolean)!;
    await t.test("queue leasing is exclusive and cancel fences a stale worker", async () => {
      assert.equal(claims.filter(Boolean).length, 1);
      assert.equal(await store.heartbeat(claim.run.id, "wrong", now), false);
      const checkpoint = { messages: [{role:"assistant" as const,content:null,reasoning_content:"private-worker-reasoning-never-projected"}], files: [{path: "src/plugin.ts", content: "draft under construction"}], stepCount: 1, repairCount: 0 };
      const failedChecks=[{name:"compile",passed:false,detail:"Synthetic TypeScript syntax error"}];
      assert.equal(await store.applyRunUpdate(claim.run.id, claim.claimToken, {status: "building", checkpoint,files:checkpoint.files,checks:failedChecks}, later(1)), true);
      for(const checks of [[{name:"compile",passed:"yes",detail:"Invalid"}],Array.from({length:33},()=>failedChecks[0]),[{...failedChecks[0],reasoning:"not a public check field"}],[{...failedChecks[0],detail:"x".repeat(4001)}]]) {
        await assert.rejects(store.applyRunUpdate(claim.run.id,claim.claimToken,{checks:checks as never},later(1)),{code:"invalid-draft-checks"});
      }
      await assert.rejects(store.applyRunUpdate(claim.run.id,claim.claimToken,{files:[{path:"../escape.ts",content:"No"}]},later(1)),{code:"invalid-draft-files"});
      await store.controlRun({...mutation(), sessionId: session.id, runId: claim.run.id, action: "cancel", now: later(2)});
      assert.equal(await store.applyRunUpdate(claim.run.id, claim.claimToken, {status: "ready", message: "stale",files:[{path:"src/plugin.ts",content:"stale replacement"}],checks:[{name:"compile",passed:true,detail:"Stale success"}]}, later(3)), false);
      assert.equal(await store.readClaim(claim.run.id, claim.claimToken, later(3)), null);
      const reloaded=await store.readSession(session.id,owner);
      assert.equal(reloaded?.runs[0].status,"cancelled");
      assert.deepEqual(reloaded?.runs[0].draftFiles,checkpoint.files);
      assert.deepEqual(reloaded?.runs[0].draftChecks,failedChecks);
      assert.doesNotMatch(JSON.stringify(reloaded),/private-worker-reasoning-never-projected|reasoning_content/);
    });
    await t.test("recovery preserves checkpoints and rotates fencing tokens", async () => {
      await store.controlRun({...mutation(), sessionId: session.id, runId: claim.run.id, action: "resume", now: later(4)});
      const resumed = (await store.claimNextRun(later(5)))!;
      assert.equal(resumed.checkpoint?.stepCount, 0);
      assert.equal(resumed.checkpoint?.files[0]?.content, "draft under construction");
      const recovered = (await store.claimNextRun(later(66)))!;
      assert.notEqual(recovered.claimToken, resumed.claimToken);
      assert.equal(await store.applyRunUpdate(resumed.run.id, resumed.claimToken, {status: "ready"}, later(67)), false);
      assert.equal(await store.applyRunUpdate(recovered.run.id, recovered.claimToken, {status: "waiting-expert", expert: {runId: recovered.run.id, artifactId: null, question: "Validate method", context: "Needs scientific review"}}, later(67)), true);
      const expert = (await store.listExpertRequests()).requests[0];
      assert.equal(expert.request.status, "requested");
      assert.equal(expert.draftFiles[0]?.content,"draft under construction");
      assert.equal(expert.draftChecks[0]?.passed,false);
      assert.doesNotMatch(JSON.stringify(expert),/private-worker-reasoning-never-projected|reasoning_content/);
      await assert.rejects(store.respondExpert({...mutation(), sessionId: session.id, requestId: expert.request.id, runId: randomUUID(), artifactId: null, response: "Wrong run", actorRef: "C".repeat(43), now: later(68)}), {code: "stale-expert-request"});
      await store.respondExpert({...mutation(), sessionId: session.id, requestId: expert.request.id, runId: recovered.run.id, artifactId: null, response: "Use presenter boundary", actorRef: "C".repeat(43), now: later(68)});
      assert.equal((await store.readSession(session.id, owner))?.runs[0].status, "queued");
      const continuation = (await store.claimNextRun(later(69)))!;
      assert.equal(continuation.checkpoint?.files[0]?.content, "draft under construction");
      assert.equal(continuation.checkpoint?.messages.length, 0);
      assert.equal(continuation.checkpoint?.stepCount, 0);
      await store.applyRunUpdate(continuation.run.id, continuation.claimToken, {status: "waiting-user"}, later(70));
      const answer = await store.appendMessage({...mutation(),sessionId:session.id,content:"Make labels blue",model,effort:"medium",now:later(71)});
      assert.equal(answer.run.draftFiles?.[0]?.content,"draft under construction");
      assert.equal(answer.run.draftChecks?.[0]?.passed,false);
      const answerClaim = (await store.claimNextRun(later(72)))!;
      assert.equal(answerClaim.run.id,answer.run.id);
      assert.equal(answerClaim.checkpoint?.files[0]?.content,"draft under construction");
      await store.applyRunUpdate(answerClaim.run.id,answerClaim.claimToken,{status:"ready"},later(73));
      const events = await store.readEvents(session.id, owner, 0);
      assert.ok(events && events.events.length > 4);
      assert.equal(await store.readEvents(session.id, other, 0), null);
      await assert.rejects(db.query("UPDATE ena_nova_events SET detail='changed'"));
    });
    await t.test("abandoned worker leases stop after three claims", async () => {
      const s=await store.createSession({...mutation(),locale:"en"}); await store.appendMessage({...mutation(),sessionId:s.id,content:"Lease test",model,effort:"low"});
      const first=(await store.claimNextRun(later(100)))!; assert.ok(first);
      assert.ok(await store.claimNextRun(later(161))); assert.ok(await store.claimNextRun(later(222))); assert.equal(await store.claimNextRun(later(283)),null);
      assert.equal((await store.readSession(s.id,owner))?.runs[0].errorCode,"worker-recovery-exhausted");
    });
    await t.test("restoring an immutable draft invalidates pending expert approval", async () => {
      const s=await store.createSession({...mutation(),locale:"en"}); await store.appendMessage({...mutation(),sessionId:s.id,content:"Artifact test",model,effort:"low"});
      const claim=(await store.claimNextRun(later(290)))!;
      const artifact: NovaArtifactVersion={id:randomUUID(),runId:claim.run.id,version:1,createdAt:later(291).toISOString(),files:[{path:"src/plugin.ts",content:"export default function present(){ return {}; }"}],manifest:{schemaVersion:"open-ena.nova-draft/v1",name:"Synthetic presenter",version:"0.0.1",kind:"presenter",entry:"src/plugin.ts",changesAnalysis:false,networkAccess:false},checks:[{name:"synthetic-check",passed:true,detail:"Synthetic test only"}],output:{title:"Synthetic",network:{nodes:NOVA_SYNTHETIC_CONTEXT.network.nodes.map(n=>({...n})),edges:NOVA_SYNTHETIC_CONTEXT.network.edges.map(e=>({...e}))},exports:["svg"]},sourceHash:"a".repeat(64),fixtureHash:"b".repeat(64),status:"draft"};
      await store.applyRunUpdate(claim.run.id,claim.claimToken,{status:"ready",artifact},later(291));
      const pending=await store.requestExpert({...mutation(),sessionId:s.id,runId:claim.run.id,artifactId:artifact.id,question:"Review this draft",now:later(292)});
      assert.equal((await store.listExpertRequests()).requests.find(item=>item.sessionId===s.id)?.artifact?.id,artifact.id);
      const restored=await store.restoreArtifact({...mutation(),sessionId:s.id,artifactId:artifact.id,now:later(293)});
      assert.equal(restored.artifacts.length,2); assert.equal(restored.artifacts[0].id,artifact.id);
      assert.notEqual(restored.activeArtifactId,artifact.id); assert.equal(restored.artifacts[1].restoredFrom,artifact.id); assert.equal(restored.artifacts[1].status,"draft");
      assert.equal(restored.expertRequests[0].status,"superseded"); assert.equal(restored.runs[0].status,"cancelled");
      for(const displayed of [{runId:claim.run.id,artifactId:artifact.id},{runId:randomUUID(),artifactId:restored.activeArtifactId},{runId:claim.run.id,artifactId:null}]) {
        await assert.rejects(store.requestExpert({...mutation(),sessionId:s.id,...displayed,question:"Question about the displayed snapshot",now:later(294)}),{code:"stale-expert-request"});
      }
      assert.equal((await store.readSession(s.id,owner))?.expertRequests.length,1,"stale manual requests must not enqueue another review");
      await assert.rejects(store.respondExpert({...mutation(),sessionId:s.id,requestId:pending.expertRequests[0].id,runId:claim.run.id,artifactId:artifact.id,response:"Old approval",actorRef:"C".repeat(43)}),{code:"stale-expert-request"});
    });
    await t.test("expert outbox leases exhaust visibly without any SMTP send", async () => {
      const s=await store.createSession({...mutation(),locale:"en"}); await store.appendMessage({...mutation(),sessionId:s.id,content:"Expert retry test",model,effort:"low"});
      const claim=(await store.claimNextRun(later(300)))!;
      await store.applyRunUpdate(claim.run.id,claim.claimToken,{status:"waiting-expert",expert:{runId:claim.run.id,artifactId:null,question:"Method review",context:"Synthetic"}},later(301));
      for(let i=0;i<5;i++){const jobs=await store.claimNotifications(20,later(302+i*121)); assert.equal(jobs.filter(job=>job.sessionId===s.id).length,1);}
      assert.equal((await store.claimNotifications(20,later(908))).length,0);
      assert.equal((await store.readSession(s.id,owner))?.expertRequests[0].notificationStatus,"failed");
    });
    await t.test("pending expert requests survive unrelated activity and every pending/history page is reachable", async () => {
      for(let i=0;i<201;i++) await store.createSession({...mutation(),ownerRef:["X","Y","Z"][Math.floor(i/100)].repeat(43),locale:"en",now:later(1000+i)});
      for(let i=0;i<3;i++) {
        const s=await store.createSession({...mutation(),locale:"en",title:`Paged expert ${i}`,now:later(1300+i)});
        await store.appendMessage({...mutation(),sessionId:s.id,content:"Presenter",model,effort:"low",now:later(1300+i)});
        const claim=(await store.claimNextRun(later(1300+i)))!;
        await store.applyRunUpdate(claim.run.id,claim.claimToken,{status:"waiting-expert",expert:{runId:claim.run.id,artifactId:null,question:`Page ${i}`,context:"Synthetic"}},later(1300+i));
      }
      const first=await store.listExpertRequests({view:"pending",limit:2});
      assert.ok(Array.isArray(first.requests),"expert inbox must return a bounded cursor page");
      assert.equal(first.requests.length,2); assert.notEqual(first.nextCursor,null);
      const second=await store.listExpertRequests({view:"pending",limit:2,after:first.nextCursor!});
      assert.equal(second.requests.length,2); assert.equal(second.nextCursor,null);
      const all=[...first.requests,...second.requests];
      assert.equal(new Set(all.map(item=>item.request.id)).size,4);
      assert.ok(all.some(item=>item.request.question==="Method review"),"old pending request remains visible after 201 newer unrelated sessions");
      assert.ok(all.every(item=>item.request.status==="requested"));
      const history=await store.listExpertRequests({view:"history",limit:1});
      assert.equal(history.requests.length,1); assert.notEqual(history.nextCursor,null);
      const historyNext=await store.listExpertRequests({view:"history",limit:1,after:history.nextCursor!});
      assert.equal(historyNext.requests.length,1); assert.notEqual(history.requests[0].request.id,historyNext.requests[0].request.id);
      assert.ok([...history.requests,...historyNext.requests].every(item=>item.request.status!=="requested"));
      await assert.rejects(store.listExpertRequests({view:"pending",limit:51}),{code:"invalid-request"});
    });
    await t.test("different idempotency keys cannot race past the owner's 100-session quota", async () => {
      const quotaOwner="Q".repeat(43);
      for(let i=0;i<99;i++) await store.createSession({...mutation(),ownerRef:quotaOwner,locale:"en"});
      // Force competing count/insert transactions to overlap, without mocking PostgreSQL.
      await db.query(`CREATE FUNCTION nova_test_slow_quota_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.owner_ref=repeat('Q',43) THEN PERFORM pg_sleep(0.1); END IF; RETURN NEW; END $$; CREATE TRIGGER nova_test_quota_latency BEFORE INSERT ON ena_nova_sessions FOR EACH ROW EXECUTE FUNCTION nova_test_slow_quota_insert()`);
      try {
        const inputs=Array.from({length:12},()=>({...mutation(),ownerRef:quotaOwner,locale:"en"}));
        const results=await Promise.allSettled(inputs.map(input=>store.createSession(input)));
        assert.equal(results.filter(result=>result.status==="fulfilled").length,1);
        assert.ok(results.filter(result=>result.status==="rejected").every(result=>result.status==="rejected"&&result.reason.code==="session-limit"));
        assert.equal((await db.query("SELECT count(*)::int AS n FROM ena_nova_sessions WHERE owner_ref=$1",[quotaOwner])).rows[0].n,100);
        const winningIndex=results.findIndex(result=>result.status==="fulfilled");
        assert.equal((await store.createSession(inputs[winningIndex])).id,(results[winningIndex] as PromiseFulfilledResult<{id:string}>).value.id,"replay still succeeds at quota");
      } finally {await db.query("DROP TRIGGER nova_test_quota_latency ON ena_nova_sessions; DROP FUNCTION nova_test_slow_quota_insert()");}
    });
    await t.test("provider diagnosis and retry state survive reclaim; explicit attempts reset the allowance and deadline", async () => {
      const s=await store.createSession({...mutation(),locale:"en",now:later(2000)});
      await store.appendMessage({...mutation(),sessionId:s.id,content:"Reliable presenter",model,effort:"low",now:later(2000)});
      const first=(await store.claimNextRun(later(2001)))!;
      const checkpoint={messages:[{role:"user" as const,content:"Private checkpoint message"}],files:[{path:"README.md",content:"Keep this draft"}],stepCount:1,repairCount:0,providerRetryCount:1 as const,providerRetryState:"scheduled" as const,attemptDeadlineAt:+later(2600)};
      const diagnostic={reason:"invalid-json" as const,stage:"stream" as const,responseBytes:44,eventCount:1,stepCount:1,retryScheduled:true};
      await store.applyRunUpdate(first.run.id,first.claimToken,{status:"building",checkpoint,files:checkpoint.files,providerFailure:{...diagnostic,payload:"must-never-persist"} as never},later(2002));
      const read=(await store.readSession(s.id,owner))!;
      assert.deepEqual(read.runs[0].providerFailure,diagnostic);
      assert.doesNotMatch(JSON.stringify(read),/must-never-persist|Private checkpoint message/);
      const events=await store.readEvents(s.id,owner,0);
      assert.ok(events?.events.some(e=>e.detail==="provider-invalid-json"));
      assert.ok(events?.events.some(e=>e.detail==="provider-retry-scheduled"));
      for(const invalid of [{...diagnostic,reason:"private-upstream-payload"},{...diagnostic,retryScheduled:"yes"},{...diagnostic,stepCount:9},{...diagnostic,responseBytes:-1}]) {
        await assert.rejects(store.applyRunUpdate(first.run.id,first.claimToken,{providerFailure:invalid as never},later(2003)),{code:"invalid-provider-failure"});
      }
      const recovered=(await store.claimNextRun(later(2062)))!;
      assert.deepEqual(recovered.checkpoint,checkpoint);
      await store.applyRunUpdate(recovered.run.id,recovered.claimToken,{status:"failed"},later(2063));
      for(const [index,action] of (["resume","retry"] as const).entries()) {
        const at=2070+index*10;
        const reset=await store.controlRun({...mutation(),sessionId:s.id,runId:first.run.id,action,now:later(at)});
        assert.equal(reset.runs[0].providerFailure,undefined);
        const next=(await store.claimNextRun(later(at+1)))!;
        assert.equal(next.checkpoint?.providerRetryCount,undefined);assert.equal(next.checkpoint?.providerRetryState,undefined);assert.equal(next.checkpoint?.attemptDeadlineAt,undefined);
        assert.deepEqual(next.checkpoint?.files,checkpoint.files);
        await store.applyRunUpdate(next.run.id,next.claimToken,{status:"failed",checkpoint,providerFailure:diagnostic},later(at+2));
      }
      await store.controlRun({...mutation(),sessionId:s.id,runId:first.run.id,action:"resume",now:later(2100)});
      const expertClaim=(await store.claimNextRun(later(2101)))!;
      await store.applyRunUpdate(expertClaim.run.id,expertClaim.claimToken,{status:"waiting-expert",checkpoint,providerFailure:diagnostic,expert:{runId:first.run.id,artifactId:null,question:"Synthetic scope review",context:"Synthetic"}},later(2102));
      const request=(await store.readSession(s.id,owner))!.expertRequests[0];
      const answered=await store.respondExpert({...mutation(),sessionId:s.id,requestId:request.id,runId:first.run.id,artifactId:null,response:"Continue presentation only",actorRef:"C".repeat(43),now:later(2103)});
      assert.equal(answered.runs[0].providerFailure,undefined);
      const continuation=(await store.claimNextRun(later(2104)))!;
      assert.equal(continuation.checkpoint?.providerRetryCount,undefined);assert.equal(continuation.checkpoint?.attemptDeadlineAt,undefined);
      await store.applyRunUpdate(continuation.run.id,continuation.claimToken,{status:"waiting-user",checkpoint,providerFailure:diagnostic},later(2105));
      const userAnswer=await store.appendMessage({...mutation(),sessionId:s.id,content:"Use blue",model,effort:"low",now:later(2106)});
      assert.equal(userAnswer.run.providerFailure,undefined);
      const userClaim=(await store.claimNextRun(later(2107)))!;
      assert.equal(userClaim.checkpoint?.providerRetryCount,undefined);assert.equal(userClaim.checkpoint?.providerRetryState,undefined);assert.equal(userClaim.checkpoint?.attemptDeadlineAt,undefined);
      assert.deepEqual(userClaim.checkpoint?.files,checkpoint.files);
      await store.applyRunUpdate(userClaim.run.id,userClaim.claimToken,{status:"failed"},later(2108));
    });
  } finally { await pool?.end(); await cleanupOwnedEphemeralPostgres({rootDirectory, dataDirectory, rootPrefix: prefix, startAttempted}); }
});
