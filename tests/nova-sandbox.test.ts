import test from 'node:test';
import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { buildNovaSandboxCommand, novaSandboxConfigured, runNovaSandbox } from '../lib/nova/sandbox';
import { NOVA_SYNTHETIC_CONTEXT } from '../lib/nova/sdk';
const env={ENA_NOVA_SANDBOX_IMAGE:`sha256:${'a'.repeat(64)}`};
const files=[{path:'src/plugin.ts',content:'export function buildPlugin(context: any) { return { title:"Draft", network: context.network, exports:["svg"] }; }'},{path:'manifest.json',content:JSON.stringify({schemaVersion:'open-ena.nova-draft/v1',name:'Draft',version:'0.1.0',kind:'presenter',entry:'src/plugin.ts',changesAnalysis:false,networkAccess:false})},{path:'tests/plugin.test.ts',content:'import assert from "node:assert/strict"; assert.equal(1,1);'}];
test('sandbox requires immutable image and an explicitly secure runtime without fallback',()=>{
  assert.equal(novaSandboxConfigured({}),false);assert.equal(novaSandboxConfigured({...env,ENA_NOVA_SANDBOX_RUNTIME:'runc'}),false);assert.equal(novaSandboxConfigured(env),true);
  const args=buildNovaSandboxCommand('/tmp/nova-test','nova-test',env);
  for(const flag of ['--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--runtime=runsc','--user=65532:65532','--pids-limit=64','--memory=256m','--cpus=1']) assert.ok(args.includes(flag),flag);
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
test('sandbox job stays readable to its non-root guest under worker umask 0077',async()=>{
  const previousUmask=process.umask(0o077);
  try {
    let inspected=false;
    await runNovaSandbox(files,{env,signal:new AbortController().signal,execute:async(args)=>{
      const mount=args.find(arg=>arg.startsWith('type=bind,source='));
      assert.ok(mount);
      const directory=/^type=bind,source=(.+),target=\/job,readonly$/.exec(mount)?.[1];
      assert.ok(directory);
      assert.ok(args.includes('--user=65532:65532'));
      const observed:Record<string,string>={};
      for(const path of ['.','src','tests','fixtures','src/plugin.ts','manifest.json','tests/plugin.test.ts','fixtures/synthetic.json']) {
        observed[path]=((await stat(join(directory,path))).mode&0o777).toString(8).padStart(4,'0');
      }
      assert.deepEqual(observed,{'.':'0755',src:'0755',tests:'0755',fixtures:'0755','src/plugin.ts':'0444','manifest.json':'0444','tests/plugin.test.ts':'0444','fixtures/synthetic.json':'0444'},'Only the read-only synthetic job tree must be traversable/readable by guest UID 65532.');
      inspected=true;
      return {code:0,stdout:JSON.stringify({status:'error',stage:'compile',detail:'Synthetic permission-inspection executor; no generated code was executed.'}),stderr:''};
    }});
    assert.equal(inspected,true);
  } finally {process.umask(previousUmask);}
});
