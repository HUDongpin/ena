import test from 'node:test';
import assert from 'node:assert/strict';
import { runNovaClaim } from '../lib/nova/runner';
import { NovaProviderError } from '../lib/nova/provider';
import { hashNovaFiles, type NovaSandboxResult } from '../lib/nova/sandbox';
import { NOVA_SYNTHETIC_CONTEXT } from '../lib/nova/sdk';
import type { NovaClaim, NovaProviderMessage, NovaRunUpdate } from '../lib/nova/types';

const savedFiles=[{path:'README.md',content:'Keep this saved draft.'}];
const savedChecks=[{name:'compile',passed:false,detail:'Saved synthetic check failure.'}];
const tool=(id:string,name:string,args:unknown):NovaProviderMessage=>({role:'assistant',content:null,tool_calls:[{id,type:'function',function:{name,arguments:JSON.stringify(args)}}]});
const protocolError=()=>new NovaProviderError('provider-protocol','Provider response contains invalid JSON.',{reason:'invalid-json',stage:'stream',responseBytes:19,eventCount:1});
function state(){
  const claim:NovaClaim={run:{id:'run',sessionId:'session',status:'planning',model:{key:'qwen-max',provider:'qwen',apiModel:'qwen3.8-max-0902',label:'Qwen',version:'0902',available:true},effort:'low',messageId:'request',baseArtifactId:null,createdAt:'',updatedAt:'',stepCount:0,repairCount:0,draftFiles:savedFiles,draftChecks:savedChecks},session:{id:'session',title:'Draft',locale:'en',createdAt:'',updatedAt:'',messages:[{id:'request',role:'user',content:'Make a blue presenter.',createdAt:''}],runs:[],artifacts:[],expertRequests:[],activeArtifactId:null},ownerRef:'owner',claimToken:'lease',checkpoint:{messages:[],files:savedFiles,stepCount:0,repairCount:0}};
  let active=true;
  const updates:NovaRunUpdate[]=[];
  const store={
    readClaim:async()=>active?structuredClone(claim):null,
    heartbeat:async()=>active,
    applyRunUpdate:async(_id:string,_token:string,update:NovaRunUpdate)=>{
      if(!active)return false;
      updates.push(structuredClone(update));
      if(update.checkpoint)claim.checkpoint=structuredClone(update.checkpoint);
      if(update.status)claim.run.status=update.status;
      return true;
    },
  };
  return {claim,updates,store,cancel(){active=false;}};
}
const sandboxResult=(files:typeof savedFiles):NovaSandboxResult=>({sourceHash:hashNovaFiles(files),fixtureHash:'b'.repeat(64),manifest:{schemaVersion:'open-ena.nova-draft/v1',name:'Synthetic',version:'0.1.0',kind:'presenter',entry:'src/plugin.ts',changesAnalysis:false,networkAccess:false},output:{title:'Synthetic',network:structuredClone(NOVA_SYNTHETIC_CONTEXT.network),exports:['svg']},checks:[{name:'injected',passed:true,detail:'Synthetic test only; no real container execution.'}]});

test('one transient parser failure recovers without repeating completed file/check tools',async()=>{
  const s=state();let requests=0,checks=0;let failedContext='';
  await runNovaClaim(s.claim,s.store,{provider:async options=>{
    requests++;assert.equal(s.claim.checkpoint?.stepCount,requests);
    assert.deepEqual(options.model,s.claim.run.model);assert.equal(options.effort,'low');
    if(requests===1)return tool('write','write_file',{path:'README.md',content:'Revised draft'});
    if(requests===2)return tool('check','check_plugin',{});
    if(requests===3){failedContext=JSON.stringify(options.messages);throw protocolError();}
    assert.equal(requests,4);assert.equal(JSON.stringify(options.messages),failedContext);
    assert.equal(s.claim.checkpoint?.providerRetryCount,1);assert.equal(s.claim.checkpoint?.providerRetryState,'in-flight');
    return tool('complete','complete_draft',{summary:'Checked draft ready.'});
  },sandbox:async files=>{checks++;return sandboxResult(files);}});
  assert.equal(s.updates.at(-1)?.status,'ready');assert.equal(requests,4);assert.equal(checks,1);
  assert.equal(s.claim.checkpoint?.providerRetryState,'spent');
  assert.equal(s.claim.checkpoint?.messages.filter(m=>m.role==='tool'&&m.tool_call_id==='write').length,1);
  assert.equal(s.claim.checkpoint?.messages.filter(m=>m.role==='tool'&&m.tool_call_id==='check').length,1);
  assert.equal(s.updates.filter(u=>u.providerFailure?.retryScheduled).length,1);
});

test('persistent protocol failure stops after two requests with safe diagnosis and saved draft',async()=>{
  const s=state();let requests=0;
  await runNovaClaim(s.claim,s.store,{provider:async()=>{requests++;throw protocolError();}});
  assert.equal(requests,2);assert.equal(s.updates.at(-1)?.status,'failed');
  assert.equal(s.updates.at(-1)?.errorCode,'provider-protocol');
  assert.deepEqual(s.updates.at(-1)?.files,savedFiles);assert.deepEqual(s.updates.at(-1)?.checks,savedChecks);
  const failures=s.updates.filter(u=>u.providerFailure).map(u=>u.providerFailure!);
  assert.deepEqual(failures.map(f=>[f.reason,f.stepCount,f.retryScheduled]),[['invalid-json',1,true],['invalid-json',2,false]]);
  assert.ok(s.updates.filter(u=>u.providerFailure&&!u.providerFailure.retryScheduled).every(u=>u.status==='failed'),'the terminal diagnostic and failed state must commit together, preventing another dispatch after reclaim');
  assert.match(s.updates.at(-1)?.message??'',/saved/i);
});

test('a successful intermediate tool does not renew the one-retry allowance',async()=>{
  const s=state();let requests=0;
  await runNovaClaim(s.claim,s.store,{provider:async()=>{requests++;if(requests===2)return tool('list','list_files',{});throw protocolError();}});
  assert.equal(requests,3);assert.equal(s.updates.at(-1)?.status,'failed');
  assert.equal(s.claim.checkpoint?.providerRetryCount,1);
  assert.equal(s.claim.checkpoint?.messages.filter(m=>m.tool_call_id==='list').length,1);
});

for(const code of ['provider-auth','provider-unconfigured','provider-rate-limit','provider-timeout','provider-unavailable','provider-limit','context-limit','cancelled']) {
  test(`no automatic retry for ${code}`,async()=>{
    const s=state();let requests=0;
    await runNovaClaim(s.claim,s.store,{provider:async()=>{requests++;throw new NovaProviderError(code,'Fixed synthetic provider failure.');}});
    assert.equal(requests,1);assert.equal(s.updates.at(-1)?.status,'failed');
  });
}

test('the failed request consumes the last step without extending the effort budget',async()=>{
  const s=state();s.claim.checkpoint!.stepCount=7;let requests=0;
  await runNovaClaim(s.claim,s.store,{provider:async()=>{requests++;throw protocolError();}});
  assert.equal(requests,1);assert.equal(s.claim.checkpoint?.stepCount,8);assert.equal(s.updates.at(-1)?.status,'failed');
  assert.equal(s.updates.find(u=>u.providerFailure)?.providerFailure?.retryScheduled,false);
  assert.equal(s.updates.find(u=>u.providerFailure)?.status,'failed');
});

test('cancellation while committing a retry decision prevents its dispatch and terminal overwrite',async()=>{
  const s=state();let requests=0;const original=s.store.applyRunUpdate;
  s.store.applyRunUpdate=async(id,token,update)=>{if(update.providerFailure?.retryScheduled){s.cancel();return false;}return original(id,token,update);};
  await runNovaClaim(s.claim,s.store,{provider:async()=>{requests++;throw protocolError();}});
  assert.equal(requests,1);assert.ok(!s.updates.some(u=>u.status==='failed'||u.status==='ready'));
});

test('lease loss immediately before retry dispatch prevents a second request',async()=>{
  const s=state();let requests=0;const original=s.store.applyRunUpdate;
  s.store.applyRunUpdate=async(id,token,update)=>{const result=await original(id,token,update);if(update.checkpoint?.providerRetryState==='in-flight')s.cancel();return result;};
  await runNovaClaim(s.claim,s.store,{provider:async()=>{requests++;throw protocolError();}});
  assert.equal(requests,1);assert.ok(!s.updates.some(u=>u.status==='failed'));
});

test('cancellation while awaiting the final lease check prevents provider dispatch',async()=>{
  const s=state(),controller=new AbortController();let requests=0,reads=0;
  const read=s.store.readClaim;
  s.store.readClaim=async()=>{if(++reads===3)controller.abort();return read();};
  await runNovaClaim(s.claim,s.store,{signal:controller.signal,provider:async()=>{requests++;return tool('pause','ask_user',{question:'Must not run'});}});
  assert.equal(requests,0);assert.ok(!s.updates.some(u=>u.status==='failed'||u.status==='ready'));
});

test('scheduled retry recovers once and commits spent response before running its tool',async()=>{
  const s=state();let requests=0;
  const messages:NovaProviderMessage[]=[{role:'user',content:'Saved provider context'}];
  Object.assign(s.claim.checkpoint!,{messages,stepCount:1,providerRetryCount:1,providerRetryState:'scheduled',attemptDeadlineAt:Date.now()+60000});
  await runNovaClaim(s.claim,s.store,{provider:async options=>{
    requests++;assert.equal(s.claim.checkpoint?.providerRetryState,'in-flight');assert.deepEqual(options.messages,messages);
    return tool('pause','ask_user',{question:'Choose a title.'});
  }});
  assert.equal(requests,1);assert.equal(s.updates.at(-1)?.status,'waiting-user');
  const responseCommit=s.updates.findIndex(u=>u.checkpoint?.messages.some(m=>m.tool_calls?.some(t=>t.id==='pause')));
  const toolCommit=s.updates.findIndex(u=>u.checkpoint?.messages.some(m=>m.tool_call_id==='pause'));
  assert.ok(responseCommit>=0&&toolCommit>responseCommit);assert.equal(s.updates[responseCommit].checkpoint?.providerRetryState,'spent');
});

test('an interrupted in-flight retry is not re-dispatched after worker recovery',async()=>{
  const s=state();let requests=0;
  Object.assign(s.claim.checkpoint!,{providerRetryCount:1,providerRetryState:'in-flight',attemptDeadlineAt:Date.now()+60000});
  await runNovaClaim(s.claim,s.store,{provider:async()=>{requests++;return tool('pause','ask_user',{question:'Unexpected'});}});
  assert.equal(requests,0);assert.equal(s.updates.at(-1)?.errorCode,'provider-retry-interrupted');
  assert.deepEqual(s.updates.at(-1)?.files,savedFiles);assert.deepEqual(s.updates.at(-1)?.checks,savedChecks);
});

test('a spent allowance remains spent when another worker reclaims the run',async()=>{
  const s=state();let requests=0;Object.assign(s.claim.checkpoint!,{providerRetryCount:1,providerRetryState:'spent'});
  await runNovaClaim(s.claim,s.store,{provider:async()=>{requests++;throw protocolError();}});
  assert.equal(requests,1);assert.equal(s.updates.at(-1)?.status,'failed');
});

test('expired persisted attempt deadline stops recovery with the saved files and checks',async()=>{
  const s=state();let requests=0;Object.assign(s.claim.checkpoint!,{attemptDeadlineAt:Date.now()-1,providerRetryCount:1,providerRetryState:'scheduled'});
  await runNovaClaim(s.claim,s.store,{provider:async()=>{requests++;return tool('pause','ask_user',{question:'Unexpected'});}});
  assert.equal(requests,0);assert.equal(s.updates.at(-1)?.errorCode,'run-timeout');
  assert.deepEqual(s.updates.at(-1)?.files,savedFiles);assert.deepEqual(s.updates.at(-1)?.checks,savedChecks);
});

test('wall deadline reached by the first failure prevents its retry',async()=>{
  const s=state();let requests=0;
  await runNovaClaim(s.claim,s.store,{maxWallMs:5,provider:async()=>{requests++;await new Promise(resolve=>setTimeout(resolve,15));throw protocolError();}});
  assert.equal(requests,1);assert.equal(s.updates.at(-1)?.errorCode,'run-timeout');
});
