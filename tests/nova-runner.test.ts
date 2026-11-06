import test from 'node:test';
import assert from 'node:assert/strict';
import { runNovaClaim } from '../lib/nova/runner';
import { NOVA_SYNTHETIC_CONTEXT } from '../lib/nova/sdk';
import type { NovaClaim, NovaProviderMessage, NovaRunUpdate } from '../lib/nova/types';
import { hashNovaFiles, type NovaSandboxResult } from '../lib/nova/sandbox';
const manifest={schemaVersion:'open-ena.nova-draft/v1' as const,name:'Draft',version:'0.1.0',kind:'presenter' as const,entry:'src/plugin.ts' as const,changesAnalysis:false as const,networkAccess:false as const};
function fakeStore(){
  const claim: NovaClaim={run:{id:'run',sessionId:'session',status:'planning',model:{key:'qwen-max',provider:'qwen',label:'Qwen',apiModel:'qwen3.8-max-0902',version:'0902',available:true},effort:'low',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),messageId:'m',baseArtifactId:null,stepCount:0,repairCount:0},session:{id:'session',title:'Draft',locale:'en',createdAt:'',updatedAt:'',messages:[{id:'m',role:'user',content:'Rename labels and make nodes blue.',createdAt:''}],runs:[],artifacts:[],expertRequests:[],activeArtifactId:null},ownerRef:'owner',claimToken:'token',checkpoint:null};
  let active=true;const updates:NovaRunUpdate[]=[];
  return {claim,updates,cancel(){active=false;},store:{readClaim:async()=>active?structuredClone(claim):null,heartbeat:async()=>active,applyRunUpdate:async(_id:string,_token:string,update:NovaRunUpdate)=>{if(!active)return false;updates.push(structuredClone(update));if(update.checkpoint)claim.checkpoint=structuredClone(update.checkpoint);if(update.status)claim.run.status=update.status;return true;}}};
}
const call=(id:string,name:string,args:unknown):NovaProviderMessage=>({role:'assistant',content:null,tool_calls:[{id,type:'function',function:{name,arguments:JSON.stringify(args)}}]});
const passed: NovaSandboxResult={manifest,output:{title:'Draft',network:{nodes:NOVA_SYNTHETIC_CONTEXT.network.nodes.map(n=>({...n})),edges:NOVA_SYNTHETIC_CONTEXT.network.edges.map(e=>({...e}))},exports:['svg']},checks:[{name:'synthetic-injected',passed:true,detail:'Synthetic test only'}],sourceHash:'a'.repeat(64),fixtureHash:'b'.repeat(64)};
for (const content of [
  'QA-PUBLIC-20261105-1716：创建一个最小 ENA 摘要面板，只使用内置合成数据，显示 3 个节点和 3 条边的只读统计。面板标题必须明显写 QA TEST。不要网络请求、上传、保存研究数据、发布或修改任何现有项目。直接构建一个可预览的私密草稿。',
  'Show the existing statistics. Do not modify any existing project.',
  'Show the fixture table; do not recompute statistics or change edge weights.',
  '显示已有统计；不要重新计算统计或修改边权。',
]) {
  test(`presentation request reaches the provider without a false expert escalation: ${content}`, async () => {
    const state = fakeStore(); state.claim.session.messages[0].content = content;
    let called = false;
    await runNovaClaim(state.claim, state.store, { provider: async () => {
      called = true; return call('pause', 'ask_user', { question: 'Synthetic provider reached.' });
    } });
    assert.equal(called, true);
    assert.equal(state.updates.some(update => update.expert), false);
  });
}
for (const content of [
  'Do not modify labels, but recompute statistics.',
  '不要修改标签，但重新计算统计。',
  'Do not forget to calculate a confidence interval.',
]) {
  test(`a separate affirmative method request still pauses: ${content}`, async () => {
    const state = fakeStore(); state.claim.session.messages[0].content = content;
    await runNovaClaim(state.claim, state.store, { provider: async () => { throw new Error('Must pause before provider'); } });
    assert.equal(state.updates.at(-1)?.status, 'waiting-expert');
  });
}
test('runner generates files through real tool protocol and produces a checked private artifact',async()=>{
  const state=fakeStore();let turn=0;const responses=[call('1','write_file',{path:'src/plugin.ts',content:'export function buildPlugin(c:any){return {title:"Draft",network:c.network,exports:["svg"]}}'}),call('2','write_file',{path:'manifest.json',content:JSON.stringify(manifest)}),call('3','write_file',{path:'tests/plugin.test.ts',content:'import assert from "node:assert/strict"; assert.ok(true)'}),call('4','check_plugin',{}),call('5','complete_draft',{summary:'Blue draft ready.'})];
  await runNovaClaim(state.claim,state.store,{provider:async()=>responses[turn++],sandbox:async files=>({...passed,sourceHash:hashNovaFiles(files)})});
  const done=state.updates.at(-1)!;assert.equal(done.status,'ready');assert.equal(done.artifact?.status,'draft');assert.ok(done.artifact?.files.some(f=>f.path==='src/plugin.ts'));assert.equal(turn,5);
});
test('runner recovers an unresolved checkpoint tool before making another provider request',async()=>{
  const state=fakeStore();state.claim.checkpoint={messages:[call('pending','write_file',{path:'README.md',content:'Recovered'})],files:[],stepCount:1,repairCount:0};
  await runNovaClaim(state.claim,state.store,{provider:async options=>{assert.ok(options.messages.some(m=>m.role==='tool'&&m.tool_call_id==='pending'));return call('pause','ask_user',{question:'Which title should I use?'});},sandbox:async files=>({...passed,sourceHash:hashNovaFiles(files)})});
  assert.equal(state.updates.at(-1)?.status,'waiting-user');assert.ok(state.claim.checkpoint?.files.some(f=>f.content==='Recovered'));
});
test('runner aborts an in-flight provider after cancellation or lease loss',async()=>{
  const state=fakeStore();let aborted=false;
  await runNovaClaim(state.claim,state.store,{pollIntervalMs:5,provider:async options=>new Promise((_resolve,reject)=>{options.signal.addEventListener('abort',()=>{aborted=true;reject(new Error('aborted'));});state.cancel();}),sandbox:async files=>({...passed,sourceHash:hashNovaFiles(files)})});
  assert.equal(aborted,true);assert.ok(!state.updates.some(u=>u.status==='ready'||u.status==='failed'));
});
test('runner stops at the effort repair cap instead of claiming success',async()=>{
  const state=fakeStore();let count=0;
  await runNovaClaim(state.claim,state.store,{provider:async()=>call(String(count++),'check_plugin',{}),sandbox:async files=>({...passed,sourceHash:hashNovaFiles(files),output:undefined,checks:[{name:'compile',passed:false,detail:'Syntax error'}]})});
  assert.equal(state.updates.at(-1)?.status,'waiting-user');assert.equal(state.claim.checkpoint?.repairCount,2);assert.equal(count,2);
});
test('method changes become an expert request before provider execution',async()=>{
  const state=fakeStore();state.claim.session.messages[0].content='Recalculate the edge weights with a different normalization.';let called=false;
  await runNovaClaim(state.claim,state.store,{provider:async()=>{called=true;return call('a','list_files',{});},sandbox:async files=>({...passed,sourceHash:hashNovaFiles(files)})});
  assert.equal(called,false);assert.equal(state.updates.at(-1)?.status,'waiting-expert');assert.ok(state.updates.at(-1)?.expert);
});
test('runner records its overall wall timeout instead of silently leaving a running lease',async()=>{
  const state=fakeStore();
  await runNovaClaim(state.claim,state.store,{maxWallMs:5,provider:async options=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted')))),sandbox:async files=>({...passed,sourceHash:hashNovaFiles(files)})});
  assert.equal(state.updates.at(-1)?.status,'failed');assert.equal(state.updates.at(-1)?.errorCode,'run-timeout');
});
test('runner rejects a sandbox report for a different source hash',async()=>{
  const state=fakeStore();
  await runNovaClaim(state.claim,state.store,{provider:async()=>call('check','check_plugin',{}),sandbox:async()=>passed});
  assert.equal(state.updates.at(-1)?.status,'failed');assert.equal(state.updates.at(-1)?.errorCode,'sandbox-protocol');
});
for(const content of ['Add a t-test and p-values','Estimate a regression model','Compare groups using ANOVA','Calculate a confidence interval','加入 t 检验和 p 值','估计回归模型','进行显著性检验','進行顯著性檢驗']) {
  test(`method scope gate pauses before provider: ${content}`,async()=>{
    const state=fakeStore();state.claim.session.messages[0].content=content;let called=false;
    await runNovaClaim(state.claim,state.store,{provider:async()=>{called=true;return call('stop','ask_user',{question:'Unavailable'});},sandbox:async files=>({...passed,sourceHash:hashNovaFiles(files)})});
    assert.equal(called,false);assert.equal(state.updates.at(-1)?.status,'waiting-expert');
  });
}
test('checkpoint rebuild retains the originating user requirement after many progress messages',async()=>{
  const state=fakeStore();const original=state.claim.session.messages[0].content;
  for(let i=0;i<65;i++)state.claim.session.messages.push({id:`progress-${i}`,role:'assistant',content:`Completed tool ${i}.`,createdAt:'',runId:'run'});
  state.claim.checkpoint={messages:[],files:[],stepCount:0,repairCount:0};
  await runNovaClaim(state.claim,state.store,{provider:async options=>{assert.ok(options.messages.some(message=>message.role==='user'&&message.content===original));return call('pause','ask_user',{question:'Confirm the chosen title?'});},sandbox:async files=>({...passed,sourceHash:hashNovaFiles(files)})});
  assert.equal(state.updates.at(-1)?.status,'waiting-user');
});
const failingCompile = (files: import('../lib/nova/types').NovaFile[]): NovaSandboxResult => ({...passed,sourceHash:hashNovaFiles(files),output:undefined,checks:[{name:'compile',passed:false,detail:'Synthetic compiler diagnostic: expected a closing brace.'}]});
test('failed compile retains private source and failure checks after the repair limit',async()=>{
  const state=fakeStore();const source='export function buildPlugin(context: unknown) {';let index=0;
  const responses=[call('write-broken','write_file',{path:'src/plugin.ts',content:source}),call('failed-check-1','check_plugin',{}),call('failed-check-2','check_plugin',{})];
  responses[0].reasoning_content='private-provider-reasoning-must-not-leak';
  await runNovaClaim(state.claim,state.store,{provider:async()=>responses[index++],sandbox:async files=>failingCompile(files)});
  const last=state.updates.at(-1)!;
  assert.equal(last.status,'waiting-user');assert.equal(last.files?.find(file=>file.path==='src/plugin.ts')?.content,source);assert.deepEqual(last.checks,failingCompile(last.files!).checks);
  assert.ok(!state.updates.some(update=>update.artifact));assert.ok(!JSON.stringify({files:last.files,checks:last.checks}).includes('private-provider-reasoning-must-not-leak'));
});
test('provider failure after a failed compile preserves the latest files and failure items',async()=>{
  const state=fakeStore();const source='export function buildPlugin() {';let index=0;
  await runNovaClaim(state.claim,state.store,{provider:async()=>{if(index++===0)return call('broken','write_file',{path:'src/plugin.ts',content:source});if(index===2)return call('check','check_plugin',{});throw new Error('Synthetic provider interruption');},sandbox:async files=>failingCompile(files)});
  const last=state.updates.at(-1)!;
  assert.equal(last.status,'failed');assert.equal(last.files?.find(file=>file.path==='src/plugin.ts')?.content,source);assert.equal(last.checks?.find(check=>check.name==='compile')?.passed,false);assert.ok(!last.artifact);
});
test('editing a checked file clears stale failure checks until the new source is checked',async()=>{
  const state=fakeStore();const broken='export function buildPlugin() {',revised='export function buildPlugin(context: any) { return context; }';let index=0;
  const responses=[call('broken','write_file',{path:'src/plugin.ts',content:broken}),call('check','check_plugin',{}),call('revision','write_file',{path:'src/plugin.ts',content:revised}),call('pause','ask_user',{question:'Choose the final title.'})];
  await runNovaClaim(state.claim,state.store,{provider:async()=>responses[index++],sandbox:async files=>failingCompile(files)});
  assert.ok(state.updates.some(update=>update.files?.find(file=>file.path==='src/plugin.ts')?.content===broken&&update.checks?.some(check=>!check.passed)));
  const last=state.updates.at(-1)!;assert.equal(last.status,'waiting-user');assert.equal(last.files?.find(file=>file.path==='src/plugin.ts')?.content,revised);assert.deepEqual(last.checks,[]);
});
test('recovery publishes saved files and retains checks only for the same source',async()=>{
  for(const sameSource of [true,false]){
    const state=fakeStore(),source='saved unfinished TypeScript';
    state.claim.run.draftFiles=[{path:'src/plugin.ts',content:source}];state.claim.run.draftChecks=[{name:'compile',passed:false,detail:'Saved synthetic failure'}];
    state.claim.checkpoint={messages:[],files:[{path:'src/plugin.ts',content:sameSource?source:'newer recovered source'}],stepCount:0,repairCount:0};
    await runNovaClaim(state.claim,state.store,{provider:async()=>call('pause','ask_user',{question:'Choose a title.'}),sandbox:async files=>failingCompile(files)});
    const initial=state.updates[0];assert.equal(initial.files?.[0].content,sameSource?source:'newer recovered source');assert.equal(initial.checks?.length,sameSource?1:0);
  }
});
test('draft check projection cannot drop a failure at the end of a bounded report',async()=>{
  const state=fakeStore();let count=0;
  const checks=Array.from({length:20},(_,index)=>({name:`check-${index}`,passed:true,detail:'Synthetic pass'}));checks.push({name:'last-check',passed:false,detail:'Synthetic failure must stay visible'});
  await runNovaClaim(state.claim,state.store,{provider:async()=>call(`complete-${count++}`,'complete_draft',{summary:'Do not accept a truncated report'}),sandbox:async files=>({...passed,sourceHash:hashNovaFiles(files),checks})});
  assert.equal(state.updates.at(-1)?.status,'waiting-user');assert.equal(state.updates.at(-1)?.checks?.length,21);assert.equal(state.updates.at(-1)?.checks?.at(-1)?.passed,false);assert.ok(!state.updates.some(update=>update.artifact));
});
