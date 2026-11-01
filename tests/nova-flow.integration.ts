/**
 * Real PostgreSQL API -> queue -> runner -> artifact integration.
 * Provider replies and container execution results are deterministic SYNTHETIC injections.
 * No paid model, SMTP send, Docker execution, or generated code execution occurs here.
 * Run explicitly: node --import tsx --test tests/nova-flow.integration.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { strFromU8, unzipSync } from 'fflate';
import { createNovaApiHandler, readNovaOperatorInbox, type NovaDependencies } from '../lib/nova/server';
import { createNovaStore } from '../lib/nova/store';
import { runNovaClaim } from '../lib/nova/runner';
import { hashNovaFiles, novaFixtureHash, runNovaSandbox } from '../lib/nova/sandbox';
import { NOVA_SYNTHETIC_CONTEXT, validateNovaOutput } from '../lib/nova/sdk';
import { novaIdentityTag } from '../lib/nova/identity';
import { createWorkflowStore } from '../lib/plugin-lab/workflow-store';
import { encryptPluginLabText } from '../lib/plugin-lab/crypto';
import { pluginLabEmailRef, pluginLabWorkflowHash } from '../lib/plugin-lab/workflow-security';
import { readPluginLabConfiguration } from '../lib/plugin-lab/config';
import { createOpenEnaSessionTokenV2, verifyOpenEnaSessionTokenV2 } from '../lib/open-ena-auth';
import { createPluginLabOperatorCsrf } from '../lib/server/plugin-lab-operator-route';
import { invalidateProductionOpenEnaAuthSecurityStore } from '../lib/server/open-ena-auth-security-store';
import type { NovaClaim, NovaDraftManifest, NovaEvent, NovaFile, NovaPluginOutput, NovaProviderMessage, NovaRun, NovaSession } from '../lib/nova/types';
import type { NovaProviderOptions } from '../lib/nova/provider';
import { cleanupOwnedEphemeralPostgres } from './support/owned-ephemeral-postgres.mjs';

type Operation = Parameters<typeof createNovaApiHandler>[0];
type RouteParams = NonNullable<Parameters<ReturnType<typeof createNovaApiHandler>>[1]>;
const ORIGIN = 'https://nova.integration.invalid';
const EMAIL = 'synthetic-researcher@example.invalid';
const OTHER_EMAIL = 'synthetic-other@example.invalid';
const SOURCE_V1 = `// Initial synthetic draft; generated code is NEVER executed by this integration test.
export function buildPlugin(context: any) {
  return { title: "Synthetic draft v1", network: { ...context.network,
    edges: context.network.edges.map((edge: any) => ({ ...edge, color: edge.group === "Group A" ? "#2455aa" : "#c4873f" })),
    legend: [{ label: "Group A", color: "#2455aa" }, { label: "Group B", color: "#c4873f" }]
  }, table: context.table, exports: ["svg", "csv", "json"] };
}`;
const SOURCE_V2 = `// Revised synthetic draft; values and both group edge sets remain unchanged.
export function buildPlugin(context: any) {
  return { title: "Synthetic draft v2", network: { ...context.network,
    nodes: context.network.nodes.map((node: any) => ({ ...node, label: node.id === "evidence" ? "Supporting evidence" : node.label })),
    edges: context.network.edges.map((edge: any) => ({ ...edge, color: edge.group === "Group A" ? "#7845aa" : "#c4873f" })),
    legend: [{ label: "Group A", color: "#7845aa" }, { label: "Group B", color: "#c4873f" }]
  }, table: context.table, exports: ["svg", "csv", "json"] };
}`;
const SOURCE_V3 = SOURCE_V2.replace('Revised synthetic draft', 'Expert-guided presentation-only synthetic draft').replace('Synthetic draft v2', 'Synthetic draft v3');
const MANIFEST: NovaDraftManifest = {schemaVersion:'open-ena.nova-draft/v1', name:'Synthetic group comparison', version:'0.1.0', kind:'presenter', entry:'src/plugin.ts', changesAnalysis:false, networkAccess:false};
const GENERATED_TESTS = `import assert from "node:assert/strict";
import { buildPlugin } from "../src/plugin.ts";
import context from "../fixtures/synthetic.json";
const output = buildPlugin(context);
assert.equal(output.network.edges.length, 12);
assert.deepEqual(output.network.edges.map((edge: any) => edge.weight), context.network.edges.map(edge => edge.weight));`;

function tool(id: string, name: string, args: unknown): NovaProviderMessage {
  return {role:'assistant', content:null, tool_calls:[{id, type:'function', function:{name, arguments:JSON.stringify(args)}}]};
}
function output(version: number): NovaPluginOutput {
  const network = structuredClone(NOVA_SYNTHETIC_CONTEXT.network);
  const color = version === 1 ? '#2455aa' : '#7845aa';
  network.edges = network.edges.map(edge=>({...edge, color:edge.group==='Group A'?color:'#c4873f'}));
  network.legend = [{label:'Group A',color},{label:'Group B',color:'#c4873f'}];
  if (version > 1) network.nodes = network.nodes.map(node=>({...node,label:node.id==='evidence'?'Supporting evidence':node.label}));
  return validateNovaOutput({title:`Synthetic draft v${version}`,description:'Synthetic integration fixture; injected provider/container results, no scientific approval.',network,table:structuredClone(NOVA_SYNTHETIC_CONTEXT.table),exports:['svg','csv','json']});
}
function deterministicProvider(responses: NovaProviderMessage[], inspect?: (options: NovaProviderOptions, index: number)=>Promise<void> | void) {
  let index = 0;
  return async (options: NovaProviderOptions) => {
    assert.equal(options.signal.aborted,false);
    assert.ok(index < responses.length, 'Runner must not invent an extra provider turn');
    await inspect?.(options,index);
    return structuredClone(responses[index++]);
  };
}
function toolResult(messages: NovaProviderMessage[], id: string): Record<string, unknown> {
  const result = messages.find(message=>message.role==='tool'&&message.tool_call_id===id);
  assert.ok(result?.content, `Persisted tool result ${id} is required`);
  return JSON.parse(result.content) as Record<string,unknown>;
}
async function bounded<T>(promise: Promise<T>, milliseconds = 5000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise,new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error('Synthetic flow synchronization timed out')),milliseconds);})]); }
  finally { if(timer)clearTimeout(timer); }
}

test('Nova flow persists real API/queue/version/expert/ZIP state with synthetic provider and sandbox injection', {timeout:60000}, async t => {
  const prefix='ena-nova-flow-test-';
  const rootDirectory=mkdtempSync(join(tmpdir(),prefix)),dataDirectory=join(rootDirectory,'data');
  let pool:Pool|undefined,startAttempted=false;
  try {
    execFileSync('initdb',['--pgdata',dataDirectory,'--auth','trust','--username','postgres','--encoding','UTF8','--no-locale'],{stdio:'pipe',timeout:60000});
    const port=await new Promise<number>((resolve,reject)=>{const server=createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=(server.address() as {port:number}).port;server.close(error=>error?reject(error):resolve(port));});});
    startAttempted=true;
    execFileSync('pg_ctl',['--pgdata',dataDirectory,'--log',join(rootDirectory,'postgres.log'),'--options',`-h 127.0.0.1 -p ${port} -c unix_socket_directories=''`,'--wait','start'],{stdio:'pipe',timeout:60000});
    pool=new Pool({host:'127.0.0.1',port,user:'postgres',database:'postgres',max:8,statement_timeout:5000});
    const db=pool;
    for(const migration of ['002_open_ena_auth_security.sql','005_ena_plugin_lab.sql','011_ena_plugin_workflow.sql','012_nova_code.sql'])await db.query(readFileSync(new URL(`../migrations/${migration}`,import.meta.url),'utf8'));
    const environment={
      NODE_ENV:'test',OPEN_ENA_PUBLIC_ORIGIN:ORIGIN,
      ENA_PLUGIN_LAB_DATABASE_URL:`postgresql://postgres@127.0.0.1:${port}/postgres`,ENA_PLUGIN_LAB_ENCRYPTION_KEY_V1:Buffer.alloc(32,19).toString('base64url'),ENA_PLUGIN_LAB_SECRET:'synthetic-flow-secret-not-a-production-credential',
      ENA_NOVA_ENABLED:'true',ENA_NOVA_QWEN_API_KEY:'synthetic-key-never-sent',ENA_NOVA_SANDBOX_IMAGE:`sha256:${'d'.repeat(64)}`,ENA_NOVA_SANDBOX_RUNTIME:'runsc',
      OPEN_ENA_AUTH_DATABASE_URL:`postgresql://postgres@127.0.0.1:${port}/postgres`,OPEN_ENA_USERNAME:'synthetic-operator',OPEN_ENA_PASSWORD:'synthetic-test-password-only',OPEN_ENA_SESSION_SECRET:'synthetic-operator-session-secret-not-production',OPEN_ENA_ACCOUNT_ID:'synthetic-nova-flow-operator',
    };
    const configuration=readPluginLabConfiguration(environment);assert.ok(configuration);
    const store=createNovaStore(db,configuration),workflow=createWorkflowStore(db);
    // Both factories return REAL PostgreSQL stores. Authentication/rate limits are not mocked.
    const dependencies:NovaDependencies={environment,storeFactory:async()=>workflow,novaStoreFactory:async()=>store};
    async function verifiedResearcher(email:string) {
      const ownerRef=pluginLabEmailRef(email,configuration!.secret),token=randomBytes(32).toString('base64url'),now=new Date(),challengeId=randomUUID();
      const codeHash=createHash('sha256').update(`synthetic-verification:${email}`).digest('hex');
      assert.equal(await workflow.putChallenge({challengeId,emailRef:ownerRef,emailCipher:encryptPluginLabText(email,configuration!.encryptionKey,'v1',`email-contact:${ownerRef}`),codeHash,locale:'en',now,expiresAt:new Date(+now+600000)}),true);
      assert.ok(await workflow.consumeChallenge({challengeId,codeHash,now,sessionHash:pluginLabWorkflowHash('session',token,configuration!.secret),sessionExpiresAt:new Date(+now+1800000)}));
      return {ownerRef,token,identity:await novaIdentityTag(email)};
    }
    const researcher=await verifiedResearcher(EMAIL),other=await verifiedResearcher(OTHER_EMAIL);
    const operatorToken=createOpenEnaSessionTokenV2(Date.now(),environment);
    const operatorPrincipal=verifyOpenEnaSessionTokenV2(operatorToken,Date.now(),environment);assert.ok(operatorPrincipal);
    const csrf=createPluginLabOperatorCsrf(operatorPrincipal,configuration.secret);
    async function api(operation:Operation,path:string,body?:unknown,params:RouteParams={},options:{other?:boolean;operator?:boolean;idempotencyKey?:string}={}) {
      const identity=options.other?other:researcher,post=body!==undefined;
      const headers:Record<string,string>=options.operator?{cookie:`open-ena-session=${operatorToken}`,'x-plugin-lab-csrf':csrf}:{cookie:`ena-plugin-lab-researcher=${identity.token}`,'x-nova-identity':identity.identity};
      if(post)Object.assign(headers,{origin:ORIGIN,'content-type':'application/json','idempotency-key':options.idempotencyKey??randomUUID()});
      return createNovaApiHandler(operation,dependencies)(new Request(`${ORIGIN}${path}`,{method:post?'POST':'GET',headers,...(post?{body:JSON.stringify(body)}:{})}),params);
    }
    async function session(id:string):Promise<NovaSession> {
      const response=await api('session',`/api/nova/sessions/${id}`,undefined,{id});assert.equal(response.status,200);assert.match(response.headers.get('cache-control')!,/private, no-store/);
      return (await response.json() as {session:NovaSession}).session;
    }
    async function send(id:string,content:string):Promise<NovaRun> {
      const response=await api('messages',`/api/nova/sessions/${id}/messages`,{content,modelKey:'qwen-max',effort:'medium'},{id});assert.equal(response.status,202);
      return (await response.json() as {run:NovaRun}).run;
    }
    function syntheticSandbox(expectedSource:string,expectedOutput:NovaPluginOutput) {
      return async (files:NovaFile[],options:{signal:AbortSignal}) => {
        assert.equal(files.find(file=>file.path==='src/plugin.ts')?.content,expectedSource);
        assert.equal(files.find(file=>file.path==='tests/plugin.test.ts')?.content,GENERATED_TESTS);
        // Only the container command/result is injected. Path/manifest/shape/hash checks remain real.
        return runNovaSandbox(files,{...options,env:environment,execute:async()=>({code:0,stdout:JSON.stringify({status:'ok',output:expectedOutput,generatedTests:true}),stderr:''})});
      };
    }
    const created=await api('sessions','/api/nova/sessions',{locale:'en',title:'Synthetic PostgreSQL end-to-end flow'});assert.equal(created.status,201);
    const id=(await created.json() as {session:NovaSession}).session.id;
    let firstArtifactId='',secondArtifactId='',cursorAfterFirst=0,cursorAfterRevision=0;

    await t.test('first requirement becomes persisted files, checks and private artifact through the real runner',async()=>{
      const requirement='Build a two-group presenter with blue Group A, visible labels and SVG export.';
      const run=await send(id,requirement),claim=await store.claimNextRun();assert.ok(claim);assert.equal(claim.run.id,run.id);
      const responses=[tool('v1-list','list_files',{}),tool('v1-plugin','write_file',{path:'src/plugin.ts',content:SOURCE_V1}),tool('v1-manifest','write_file',{path:'manifest.json',content:JSON.stringify(MANIFEST)}),tool('v1-tests','write_file',{path:'tests/plugin.test.ts',content:GENERATED_TESTS}),tool('v1-readme','write_file',{path:'README.md',content:'Synthetic integration draft. Injected provider and container results; no live execution or scientific acceptance.'}),tool('v1-check','check_plugin',{}),tool('v1-complete','complete_draft',{summary:'Synthetic draft v1 is ready for private review.'})];
      await runNovaClaim(claim,store,{provider:deterministicProvider(responses,async(options,index)=>{
        assert.ok(options.messages.some(message=>message.role==='user'&&message.content===requirement));
        if(index===5){const persisted=await store.readClaim(claim.run.id,claim.claimToken);assert.equal(persisted?.checkpoint?.files.find(file=>file.path==='src/plugin.ts')?.content,SOURCE_V1);assert.equal(toolResult(persisted!.checkpoint!.messages,'v1-plugin').written,'src/plugin.ts');}
      }),sandbox:syntheticSandbox(SOURCE_V1,output(1))});
      const saved=await session(id);assert.equal(saved.runs[0].status,'ready');assert.equal(saved.artifacts.length,1);
      const artifact=saved.artifacts[0];firstArtifactId=artifact.id;
      assert.equal(artifact.version,1);assert.equal(artifact.runId,run.id);assert.equal(saved.activeArtifactId,artifact.id);assert.equal(artifact.status,'draft');
      assert.equal(artifact.files.find(file=>file.path==='src/plugin.ts')?.content,SOURCE_V1);assert.equal(artifact.sourceHash,hashNovaFiles(artifact.files));assert.equal(artifact.fixtureHash,novaFixtureHash());
      assert.deepEqual(artifact.output,output(1));assert.ok(artifact.checks.every(check=>check.passed));assert.ok(artifact.checks.some(check=>check.detail.includes('injected synthetic')));
      const events=await api('events',`/api/nova/sessions/${id}/events?after=0`,undefined,{id});assert.equal(events.status,200);
      const page=await events.json() as {events:NovaEvent[];cursor:number};assert.ok(page.events.some(event=>event.type==='artifact'&&event.runId===run.id));cursorAfterFirst=page.cursor;assert.ok(cursorAfterFirst>0);
    });

    await t.test('second user revision reads the prior source and saves a new immutable version',async()=>{
      const requirement='Change Group A to purple and rename Evidence to Supporting evidence, keeping the same data.';
      const run=await send(id,requirement),claim=await store.claimNextRun();assert.ok(claim);assert.equal(claim.run.baseArtifactId,firstArtifactId);
      const responses=[tool('v2-read','read_file',{path:'src/plugin.ts'}),tool('v2-plugin','write_file',{path:'src/plugin.ts',content:SOURCE_V2}),tool('v2-manifest','write_file',{path:'manifest.json',content:JSON.stringify({...MANIFEST,version:'0.2.0'})}),tool('v2-check','check_plugin',{}),tool('v2-complete','complete_draft',{summary:'Synthetic purple revision is ready.'})];
      await runNovaClaim(claim,store,{provider:deterministicProvider(responses,(options,index)=>{
        assert.ok(options.messages.some(message=>message.role==='user'&&message.content===requirement));
        if(index===1)assert.equal(toolResult(options.messages,'v2-read').content,SOURCE_V1);
      }),sandbox:syntheticSandbox(SOURCE_V2,output(2))});
      const saved=await session(id);assert.equal(saved.artifacts.length,2);assert.deepEqual(saved.artifacts.map(artifact=>artifact.version),[1,2]);assert.equal(saved.runs.at(-1)?.id,run.id);assert.equal(saved.runs.at(-1)?.status,'ready');
      assert.equal(saved.artifacts[0].id,firstArtifactId);assert.equal(saved.artifacts[0].files.find(file=>file.path==='src/plugin.ts')?.content,SOURCE_V1);
      const revised=saved.artifacts[1];secondArtifactId=revised.id;assert.notEqual(revised.sourceHash,saved.artifacts[0].sourceHash);assert.equal(revised.files.find(file=>file.path==='src/plugin.ts')?.content,SOURCE_V2);assert.equal(saved.activeArtifactId,revised.id);assert.deepEqual(revised.output,output(2));
      const page=await (await api('events',`/api/nova/sessions/${id}/events?after=${cursorAfterFirst}`,undefined,{id})).json() as {events:NovaEvent[];cursor:number};
      assert.ok(page.events.length>0);assert.ok(page.events.every(event=>event.cursor>cursorAfterFirst));assert.equal(page.events.filter(event=>event.type==='artifact'&&event.runId===run.id).length,1);cursorAfterRevision=page.cursor;
    });

    await t.test('API cancellation aborts active work and fences a stale artifact commit in PostgreSQL',async()=>{
      const run=await send(id,'Try another presentation color.'),claim=await store.claimNextRun();assert.ok(claim);assert.equal(claim.run.id,run.id);
      let started!:()=>void;const providerStarted=new Promise<void>(resolve=>{started=resolve;});let observedAbort=false;
      const controller=new AbortController();
      const work=runNovaClaim(claim,store,{signal:controller.signal,pollIntervalMs:10,provider:async options=>new Promise((_resolve,reject)=>{options.signal.addEventListener('abort',()=>{observedAbort=true;reject(new DOMException('Synthetic cancellation','AbortError'));},{once:true});started();}),sandbox:async()=>{throw new Error('Cancelled run must never reach sandbox');}});
      try {
        await bounded(providerStarted);
        const cancelled=await api('run',`/api/nova/sessions/${id}/runs/${run.id}`,{action:'cancel'},{id,runId:run.id});assert.equal(cancelled.status,200);
        await bounded(work);assert.equal(observedAbort,true);
      }finally{controller.abort();await work;}
      const before=await session(id);assert.equal(before.runs.at(-1)?.status,'cancelled');assert.equal(before.artifacts.length,2);
      assert.equal(await store.applyRunUpdate(run.id,claim.claimToken,{status:'ready',artifact:{...before.artifacts[1],id:randomUUID(),runId:run.id,version:99}}),false);
      assert.equal(await store.readClaim(run.id,claim.claimToken),null);assert.equal((await session(id)).artifacts.length,2);
      const page=await (await api('events',`/api/nova/sessions/${id}/events?after=${cursorAfterRevision}`,undefined,{id})).json() as {events:NovaEvent[]};assert.ok(page.events.some(event=>event.runId===run.id&&event.detail==='run-cancelled'));
    });

    await t.test('exact expert reply resumes the same saved draft, while stale identity and replay are handled',async()=>{
      const run=await send(id,'Add a t-test and p-values to this comparison.'),claim=await store.claimNextRun();assert.ok(claim);let providerCalled=false;
      await runNovaClaim(claim,store,{provider:async()=>{providerCalled=true;throw new Error('Method gate must precede provider');},sandbox:syntheticSandbox(SOURCE_V2,output(2))});
      let saved=await session(id);assert.equal(providerCalled,false);assert.equal(saved.runs.at(-1)?.status,'waiting-expert');assert.equal(saved.artifacts.length,2);
      const request=saved.expertRequests.at(-1)!;assert.equal(request.runId,run.id);assert.equal(request.artifactId,secondArtifactId);assert.equal(request.status,'requested');
      const inbox=await readNovaOperatorInbox(operatorToken,dependencies);assert.ok(inbox);assert.equal(inbox.page.requests.find(item=>item.request.id===request.id)?.artifact?.id,secondArtifactId);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM ena_nova_notifications WHERE request_id=$1',[request.id])).rows[0].n,1);
      const reply='Keep the existing immutable weights. Continue with presentation colors and descriptive labels only; do not add inferential results.';
      const path=`/api/nova/operator/sessions/${id}/expert/${request.id}`,params={id,requestId:request.id};
      const stale=await api('expert-response',path,{runId:run.id,artifactId:firstArtifactId,response:reply},params,{operator:true});assert.equal(stale.status,409);assert.equal((await stale.json()).code,'stale-expert-request');
      const receipt=randomUUID(),body={runId:run.id,artifactId:secondArtifactId,response:reply};
      const accepted=await api('expert-response',path,body,params,{operator:true,idempotencyKey:receipt});assert.equal(accepted.status,200);
      const continuation=await store.claimNextRun();assert.ok(continuation);assert.equal(continuation.run.id,run.id);assert.equal(continuation.checkpoint?.messages.length,0);assert.equal(continuation.checkpoint?.files.find(file=>file.path==='src/plugin.ts')?.content,SOURCE_V2);
      const responses=[tool('v3-read','read_file',{path:'src/plugin.ts'}),tool('v3-plugin','write_file',{path:'src/plugin.ts',content:SOURCE_V3}),tool('v3-check','check_plugin',{}),tool('v3-complete','complete_draft',{summary:'Synthetic presentation-only continuation is ready.'})];
      await runNovaClaim(continuation,store,{provider:deterministicProvider(responses,(options,index)=>{
        assert.ok(options.messages.some(message=>message.role==='user'&&message.content?.includes(reply)),'Exact persisted expert reply must enter rebuilt provider context');
        if(index===1)assert.equal(toolResult(options.messages,'v3-read').content,SOURCE_V2);
      }),sandbox:syntheticSandbox(SOURCE_V3,output(3))});
      saved=await session(id);assert.equal(saved.runs.at(-1)?.id,run.id);assert.equal(saved.runs.at(-1)?.status,'ready');assert.deepEqual(saved.artifacts.map(artifact=>artifact.version),[1,2,3]);assert.equal(saved.artifacts[2].runId,run.id);assert.equal(saved.expertRequests.at(-1)?.response,reply);
      const replay=await api('expert-response',path,body,params,{operator:true,idempotencyKey:receipt});assert.equal(replay.status,200);
      const afterReplay=await session(id);assert.equal(afterReplay.artifacts.length,3);assert.equal(afterReplay.runs.length,4);assert.equal(afterReplay.messages.filter(message=>message.role==='expert'&&message.content===reply).length,1);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM ena_nova_notifications WHERE request_id=$1',[request.id])).rows[0].n,1,'No real mail is sent and replay cannot duplicate the outbox');
    });

    await t.test('owned ZIP API contains actual persisted source, fixture, output and provenance while another verified account is denied',async()=>{
      const saved=await session(id),artifact=saved.artifacts.at(-1)!;
      const path=`/api/nova/sessions/${id}/artifacts/${artifact.id}?download=1`,params={id,artifactId:artifact.id};
      assert.equal((await api('artifact',path,undefined,params,{other:true})).status,404);
      assert.equal((await api('events',`/api/nova/sessions/${id}/events`,undefined,{id},{other:true})).status,404);
      const response=await api('artifact',path,undefined,params);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/zip');assert.match(response.headers.get('content-disposition')!,/^attachment;/);
      const files=unzipSync(new Uint8Array(await response.arrayBuffer()));
      assert.deepEqual(Object.keys(files).sort(),[...artifact.files.map(file=>file.path),'nova-receipt.json'].sort());
      assert.equal(strFromU8(files['src/plugin.ts']),SOURCE_V3);assert.deepEqual(JSON.parse(strFromU8(files['fixtures/synthetic.json'])),NOVA_SYNTHETIC_CONTEXT);
      const receipt=JSON.parse(strFromU8(files['nova-receipt.json']));assert.equal(receipt.status,'draft');assert.equal(receipt.sourceHash,hashNovaFiles(artifact.files));assert.equal(receipt.fixtureHash,novaFixtureHash());assert.deepEqual(receipt.output,output(3));assert.deepEqual(receipt.checks,artifact.checks);assert.equal(receipt.manifest.changesAnalysis,false);assert.equal(receipt.manifest.networkAccess,false);
      const old=await api('artifact',`/api/nova/sessions/${id}/artifacts/${firstArtifactId}?download=1`,undefined,{id,artifactId:firstArtifactId});assert.equal(old.status,200);assert.equal(strFromU8(unzipSync(new Uint8Array(await old.arrayBuffer()))['src/plugin.ts']),SOURCE_V1);
      let after=0;const events:NovaEvent[]=[];
      for(let pageIndex=0;pageIndex<10;pageIndex++){
        const page=await (await api('events',`/api/nova/sessions/${id}/events?after=${after}`,undefined,{id})).json() as {events:NovaEvent[];cursor:number};
        if(!page.events.length)break;assert.ok(page.events.every(event=>event.cursor>after));events.push(...page.events);after=page.cursor;
      }
      assert.equal(new Set(events.map(event=>event.cursor)).size,events.length);assert.equal(events.filter(event=>event.detail==='artifact-created').length,3);
      const stored=JSON.stringify((await db.query('SELECT document_cipher FROM ena_nova_sessions WHERE session_id=$1',[id])).rows);
      assert.ok(!stored.includes(SOURCE_V1));assert.ok(!stored.includes(EMAIL));assert.ok(!stored.includes('Supporting evidence'));
      assert.equal((await db.query('SELECT count(*)::int AS n FROM ena_nova_notifications WHERE status=\'sent\'')).rows[0].n,0,'This integration suite must not send real email');
    });

    await t.test('private API exposes unfinished failure evidence and clears it when the source changes',async()=>{
      const run=await send(id,'Try a different descriptive label layout.'),claim=await store.claimNextRun();assert.ok(claim);assert.equal(claim.run.id,run.id);
      const broken='export function buildPlugin(context: unknown) {';
      const responses=[tool('failed-source','write_file',{path:'src/plugin.ts',content:broken}),tool('compile-1','check_plugin',{}),tool('compile-2','check_plugin',{}),tool('compile-3','check_plugin',{})];
      responses[0].reasoning_content='SYNTHETIC_PRIVATE_REASONING_MUST_NOT_ENTER_SESSION_API';
      await runNovaClaim(claim,store,{provider:deterministicProvider(responses),sandbox:async(files,options)=>runNovaSandbox(files,{...options,env:environment,execute:async()=>({code:0,stdout:JSON.stringify({status:'error',stage:'compile',detail:'Synthetic compiler failure: closing brace required.'}),stderr:''})})});
      const failed=await session(id),unfinished=failed.runs.at(-1)!;
      assert.equal(unfinished.status,'waiting-user');assert.equal(unfinished.draftFiles?.find(file=>file.path==='src/plugin.ts')?.content,broken);
      assert.equal(unfinished.draftChecks?.find(check=>check.name==='compile')?.passed,false);assert.match(unfinished.draftChecks!.find(check=>check.name==='compile')!.detail,/Synthetic compiler failure/);
      assert.equal(failed.artifacts.length,3,'An unsuccessful source must not become a ready artifact');
      assert.ok(!JSON.stringify(failed).includes('SYNTHETIC_PRIVATE_REASONING_MUST_NOT_ENTER_SESSION_API'));
      const revision=await send(id,'Repair the unfinished source and ask me to choose a title.'),recovery=await store.claimNextRun();assert.ok(recovery);assert.equal(recovery.run.id,revision.id);assert.equal(recovery.checkpoint?.files.find(file=>file.path==='src/plugin.ts')?.content,broken);
      const changed=SOURCE_V3+'\n// Unchecked recovery edit.';
      await runNovaClaim(recovery,store,{provider:deterministicProvider([tool('repaired-source','write_file',{path:'src/plugin.ts',content:changed}),tool('choose-title','ask_user',{question:'Choose the title for this unchecked draft.'})]),sandbox:async()=>{throw new Error('Revised source has not been checked yet');}});
      const revised=await session(id),latest=revised.runs.at(-1)!;
      assert.equal(latest.status,'waiting-user');assert.equal(latest.draftFiles?.find(file=>file.path==='src/plugin.ts')?.content,changed);assert.deepEqual(latest.draftChecks,[]);assert.equal(revised.artifacts.length,3);
      assert.equal(revised.runs.find(item=>item.id===run.id)?.draftChecks?.find(check=>check.name==='compile')?.passed,false,'Historical failed run evidence remains tied to its old source');
    });
  } finally {
    invalidateProductionOpenEnaAuthSecurityStore();
    await pool?.end();
    await cleanupOwnedEphemeralPostgres({rootDirectory,dataDirectory,rootPrefix:prefix,startAttempted});
  }
});
