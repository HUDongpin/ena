import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNovaSandboxCommand, novaSandboxConfigured, runNovaSandbox } from '../lib/nova/sandbox';
import { NOVA_SYNTHETIC_CONTEXT } from '../lib/nova/sdk';
const env={ENA_NOVA_SANDBOX_IMAGE:`sha256:${'a'.repeat(64)}`};
const files=[{path:'src/plugin.ts',content:'export function buildPlugin(context: any) { return { title:"Draft", network: context.network, exports:["svg"] }; }'},{path:'manifest.json',content:JSON.stringify({schemaVersion:'open-ena.nova-draft/v1',name:'Draft',version:'0.1.0',kind:'presenter',entry:'src/plugin.ts',changesAnalysis:false,networkAccess:false})},{path:'tests/plugin.test.ts',content:'import assert from "node:assert/strict"; assert.equal(1,1);'}];
test('sandbox requires immutable image and an explicitly secure runtime without fallback',()=>{
  assert.equal(novaSandboxConfigured({}),false);assert.equal(novaSandboxConfigured({...env,ENA_NOVA_SANDBOX_RUNTIME:'runc'}),false);assert.equal(novaSandboxConfigured(env),true);
  const args=buildNovaSandboxCommand('/tmp/nova-test','nova-test',env);
  for(const flag of ['--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--runtime=runsc','--user=65532:65532','--pids-limit=32','--memory=256m','--cpus=1']) assert.ok(args.includes(flag),flag);
  assert.ok(args.includes('type=bind,source=/tmp/nova-test,target=/job,readonly')); assert.ok(!args.some(a=>a.includes('secret')));
});
test('host independently rejects analysis changes even when generated process claims success',async()=>{
  const output={title:'Draft',network:{nodes:[...NOVA_SYNTHETIC_CONTEXT.network.nodes],edges:NOVA_SYNTHETIC_CONTEXT.network.edges.map(edge=>({...edge,weight:Number(edge.weight)}))},exports:['svg']}; output.network.edges[0].weight=999;
  const result=await runNovaSandbox(files,{env,signal:new AbortController().signal,execute:async()=>({code:0,stdout:JSON.stringify({status:'ok',output,generatedTests:true}),stderr:''})});
  assert.equal(result.checks.every(c=>c.passed),false);assert.equal(result.output,undefined);
});
test('synthetic injected container result passes host checks and records source/fixture hashes',async()=>{
  const result=await runNovaSandbox(files,{env,signal:new AbortController().signal,execute:async()=>({code:0,stdout:JSON.stringify({status:'ok',output:{title:'Draft',network:NOVA_SYNTHETIC_CONTEXT.network,exports:['svg']},generatedTests:true}),stderr:''})});
  assert.ok(result.checks.every(c=>c.passed)); assert.equal(result.sourceHash.length,64);assert.equal(result.fixtureHash.length,64);assert.ok(result.checks.some(c=>c.detail.includes('injected synthetic')));
});
test('sandbox rejects cancellation before starting a process',async()=>{
  const controller=new AbortController();controller.abort();let called=false;
  await assert.rejects(runNovaSandbox(files,{env,signal:controller.signal,execute:async()=>{called=true;return {code:0,stdout:'',stderr:''};}}), /cancel/i);
  assert.equal(called,false);
});
