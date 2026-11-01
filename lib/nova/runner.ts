import { randomUUID } from 'node:crypto';
import { novaEffortPolicy } from './models';
import { callNovaProvider, NovaProviderError, type NovaProviderOptions } from './provider';
import { hashNovaFiles, runNovaSandbox, NovaSandboxError, type NovaSandboxResult } from './sandbox';
import { NOVA_SYNTHETIC_CONTEXT, validateNovaFile, validateNovaFiles, validateNovaManifest, validateNovaOutput } from './sdk';
import type { NovaStore } from './store';
import type { NovaCheck, NovaClaim, NovaCheckpoint, NovaFile, NovaProviderMessage, NovaRunUpdate } from './types';

type WorkerStore=Pick<NovaStore,'readClaim'|'heartbeat'|'applyRunUpdate'>;
export interface NovaRunnerOptions {
  provider?:(options:NovaProviderOptions)=>Promise<NovaProviderMessage>;
  sandbox?:(files:NovaFile[],options:{signal:AbortSignal})=>Promise<NovaSandboxResult>;
  signal?:AbortSignal;pollIntervalMs?:number;maxWallMs?:number;
}
class LeaseEnded extends Error {}
/** Conservative routing aid, not a proof that every methodological intent is recognized.
 * The fixed output schema and invariant checks remain the enforceable analysis boundary. */
function needsExpertReview(text:string):boolean {
  const inferential=/\b(?:t[ -]?tests?|anova|ancova|manova|regression|p[ -]?values?|confidence intervals?|hypothesis test|statistical significance|inferential|permutation test|bootstrap|effect sizes?|causal effects?)\b|[tp]\s*值|[tＴｔ]\s*(?:检验|檢驗)|回归|迴歸|回歸|显著性|顯著性|方差分析|變異數分析|置信区间|信賴區間|假设检验|假設檢驗|置换检验|置換檢驗|效应量|效應量/iu;
  return inferential.test(text) || /(?:change|replace|recalculate|recompute|modify|calculate|compute|estimate|修改|更改|重新计算|重新計算|计算|計算|估计|估計).{0,100}(?:edge weights?|normalization|svd|statistical|statistics|projection|边权|邊權|归一化|歸一化|统计|統計|投影)|(?:edge weights?|normalization|svd|边权|邊權|归一化|歸一化|统计|統計|投影).{0,60}(?:change|replace|recalculate|modify|修改|更改)/iu.test(text);
}
function initialMessages(claim:NovaClaim,files:NovaFile[]):NovaProviderMessage[] {
  const system=`You are Nova, the private Open ENA plugin coding assistant. Write actual runnable TypeScript through tools. Return only a private DRAFT, never publish or change production. Scope: presentation and export on immutable SYNTHETIC fixture data only. Never ingest participant data, install dependencies, use network, change weights/topology, recompute statistics or alter scientific methods. For method/statistical changes request_expert and pause. Expert advice cannot override this SDK boundary. Ask_user only for a genuinely blocking requirement; choose sensible reversible presentation defaults otherwise.
Required files: src/plugin.ts exports a synchronous function buildPlugin(context) (async/Promise/thenable results are rejected); manifest.json; tests/plugin.test.ts; README.md. Optional fixtures/synthetic.json is immutable. Only these paths exist. No package.json, dependencies, imports in plugin, HTML, CSS, browser JS or raw SVG. TypeScript may declare local types or use a typed context parameter. Tests can import assert from node:assert/strict, buildPlugin from ../src/plugin.ts, and context from ../fixtures/synthetic.json; assertions must test the requested presentation and preservation of source values. Container compiles TS; test assertions execute in isolation. Supported assertions: assert/ok, equal/strictEqual, notEqual/notStrictEqual, deepEqual/deepStrictEqual, match, throws, rejects. At least one assertion must execute. No process, require, eval, global host objects, timers, network or runtime imports are available.
Manifest exactly: {"schemaVersion":"open-ena.nova-draft/v1","name":"Descriptive draft name","version":"0.1.0","kind":"presenter","entry":"src/plugin.ts","changesAnalysis":false,"networkAccess":false}. kind can also be exporter.
Output: {title:string,description?:string,network?:{nodes:{id,label,x,y,color}[],edges:{source,target,weight,color,group?}[],legend?:{label,color}[]},table?:{columns:string[],rows:(string|number|null)[][]},exports:("svg"|"csv"|"json")[]}. All colors must be #RRGGBB. No extra fields. Need network or table. SVG requires network; CSV requires table. Preserve exact node IDs and edge source,target,weight,group and all edges; coordinates, labels, colors and order may change. Legend if provided must exactly match fixture group labels. Tables must preserve exact columns and row values (row sorting allowed). Group comparison is visual only, no inferential claims. Trusted renderer provides labels, group colors, SVG/CSV/JSON exports. Show synthetic/draft context in description.
Use list_files/read_file, then write_file for needed files. Always call check_plugin; read check failures and repair within budget. Call complete_draft only after all checks pass on current files. Calling complete_draft revalidates stale checks. Use request_expert for questions outside this boundary. Tool execution is durable; do not repeat completed effects.
Synthetic context: ${JSON.stringify(NOVA_SYNTHETIC_CONTEXT)}
Current files: ${JSON.stringify(files)}
Reply language: ${claim.session.locale}.`;
  const transcript=claim.session.messages.slice(-60);
  const originatingRequest=claim.session.messages.find(message=>message.id===claim.run.messageId);
  if(originatingRequest&&!transcript.some(message=>message.id===originatingRequest.id))transcript.unshift(originatingRequest);
  return [{role:'system',content:system},...transcript.map(message=>({role:message.role==='assistant'?'assistant' as const:'user' as const,content:message.role==='expert'?`Expert guidance (still within presentation/export boundary): ${message.content}`:message.content}))];
}
function pendingTools(messages:NovaProviderMessage[]) {
  for(let index=messages.length-1;index>=0;index--){
    const message=messages[index];
    if(message.role!=='assistant')continue;
    const resolved=new Set(messages.slice(index+1).filter(m=>m.role==='tool').map(m=>m.tool_call_id));
    return (message.tool_calls??[]).filter(call=>!resolved.has(call.id));
  }
  return [];
}
function argumentsObject(raw:string):Record<string,unknown> {
  if(raw.length>120_000)throw new Error('Tool arguments exceed limit');
  const value:unknown=JSON.parse(raw);
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Tool arguments must be an object');
  return value as Record<string,unknown>;
}
function stringArg(args:Record<string,unknown>,key:string,max=4000):string {
  const value=args[key];if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error(`Invalid ${key}`);return value;
}
/** The private UI gets only bounded file/check projections, never provider message context. */
function displayDraftChecks(checks:NovaCheck[]):NovaCheck[] {
  if(checks.length>32)throw new NovaSandboxError('sandbox-protocol','Sandbox check count exceeds its limit');
  return checks.map(check=>({
    name:check.name.replace(/[\u0000-\u001f\u007f]/gu,'').slice(0,120),
    passed:check.passed,
    detail:check.detail.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu,'').slice(0,4000),
  }));
}
/** One leased run, independently executable by a dedicated worker; never imported by a Next.js route. */
export async function runNovaClaim(claim:NovaClaim,store:WorkerStore,options:NovaRunnerOptions={}):Promise<void> {
  if(typeof window!=='undefined')throw new Error('Nova runner is server only');
  const policy=novaEffortPolicy(claim.run.effort);
  const controller=new AbortController();
  const externalAbort=()=>controller.abort();options.signal?.addEventListener('abort',externalAbort,{once:true});
  if(options.signal?.aborted)controller.abort();
  const base=claim.session.artifacts.find(a=>a.id===claim.run.baseArtifactId);
  const fixture={path:'fixtures/synthetic.json',content:JSON.stringify(NOVA_SYNTHETIC_CONTEXT,null,2)};
  const checkpoint:NovaCheckpoint=claim.checkpoint?structuredClone(claim.checkpoint):{messages:[],files:base?.files??[fixture],stepCount:claim.run.stepCount,repairCount:claim.run.repairCount};
  let checked:{hash:string;result:NovaSandboxResult}|undefined;
  let draftFiles:NovaFile[]=[],draftChecks:NovaCheck[]=[];
  let finished=false,polling=false,deadlineExpired=false,lastHeartbeat=Date.now();
  const deadline=setTimeout(()=>{deadlineExpired=true;controller.abort();},Math.min(options.maxWallMs??1_800_000,1_800_000));
  const ensure=async()=>{
    if(controller.signal.aborted)throw new LeaseEnded();
    if(!await store.readClaim(claim.run.id,claim.claimToken)){controller.abort();throw new LeaseEnded();}
  };
  const update=async(value:NovaRunUpdate)=>{
    if(controller.signal.aborted)throw new LeaseEnded();
    const ok=await store.applyRunUpdate(claim.run.id,claim.claimToken,{...value,files:structuredClone(draftFiles),checks:structuredClone(draftChecks),checkpoint:structuredClone(checkpoint),stepCount:checkpoint.stepCount,repairCount:checkpoint.repairCount});
    if(!ok){controller.abort();throw new LeaseEnded();}
  };
  const poll=setInterval(()=>{
    if(polling||finished)return;polling=true;
    void (async()=>{
      try {await ensure();if(Date.now()-lastHeartbeat>=15_000){if(!await store.heartbeat(claim.run.id,claim.claimToken))controller.abort();lastHeartbeat=Date.now();}}
      catch{controller.abort();}finally{polling=false;}
    })();
  },options.pollIntervalMs??1000);
  const check=async()=>{
    await ensure();await update({status:'testing',message:'Checking the TypeScript draft in the isolated sandbox.'});
    const rawResult=await (options.sandbox??runNovaSandbox)(checkpoint.files,{signal:controller.signal});
    const result={...rawResult,checks:displayDraftChecks(rawResult.checks)};
    await ensure();
    const hash=hashNovaFiles(checkpoint.files);
    if(result.sourceHash!==hash)throw new NovaSandboxError('sandbox-protocol','Sandbox source hash does not match the draft');
    if(result.checks.length>0&&result.checks.every(c=>c.passed)&&result.output&&result.manifest){validateNovaOutput(result.output);validateNovaManifest(result.manifest);checked={hash,result};}
    else{checked=undefined;checkpoint.repairCount+=1;}
    draftChecks=result.checks;
    await update({status:'testing'});
    return result;
  };
  try {
    await ensure();draftFiles=checkpoint.files=validateNovaFiles(checkpoint.files);
    if(claim.run.draftFiles&&hashNovaFiles(validateNovaFiles(claim.run.draftFiles))===hashNovaFiles(draftFiles))draftChecks=displayDraftChecks(claim.run.draftChecks??[]);
    if(!checkpoint.messages.length)checkpoint.messages=initialMessages(claim,checkpoint.files);
    const user=claim.session.messages.find(m=>m.id===claim.run.messageId);
    if(user&&needsExpertReview(user.content)&&!claim.session.messages.some(m=>m.role==='expert'&&m.runId===claim.run.id)){
      await update({status:'waiting-expert',message:'This request could change the analysis. I have paused the draft for expert guidance.',expert:{runId:claim.run.id,artifactId:claim.session.activeArtifactId,question:user.content.slice(0,4000),context:'Nova is limited to synthetic presentation/export plugins. Please identify a safe presentation-only scope or explain the required method review.'}});finished=true;return;
    }
    await update({status:'building',message:claim.checkpoint?'Resuming the saved Nova draft.':'Nova is planning the TypeScript draft.'});
    while(!finished){
      await ensure();
      const pending=pendingTools(checkpoint.messages);
      if(!pending.length){
        if(checkpoint.stepCount>=policy.maxSteps){await update({status:'waiting-user',message:'The selected effort step limit was reached. The draft checkpoint is saved; refine the request or resume to continue.'});finished=true;break;}
        checkpoint.stepCount+=1;await update({status:'building'});
        const response=await (options.provider??callNovaProvider)({model:claim.run.model,effort:claim.run.effort,messages:checkpoint.messages,signal:controller.signal});
        await ensure();checkpoint.messages.push(response);
        await update({...(response.content?{message:response.content.slice(0,4000)}:{})});
        if(!response.tool_calls?.length)checkpoint.messages.push({role:'user',content:'Continue using the coding tools. To finish, generate the required files, pass check_plugin, and call complete_draft; otherwise ask_user or request_expert for a concrete blocker.'});
        continue;
      }
      for(const tool of pending){
        await ensure();let result:unknown;let stop:NovaRunUpdate|undefined;
        try {
          const args=argumentsObject(tool.function.arguments);
          switch(tool.function.name){
            case 'list_files': result=checkpoint.files.map(f=>({path:f.path,bytes:Buffer.byteLength(f.content)}));break;
            case 'read_file': {const path=stringArg(args,'path',200);validateNovaFile({path,content:path==='fixtures/synthetic.json'?fixture.content:''});const file=checkpoint.files.find(f=>f.path===path);result=file?{content:file.content}:{error:'File does not exist'};break;}
            case 'write_file': {const file=validateNovaFile({path:args.path,content:args.content});const next=checkpoint.files.filter(f=>f.path!==file.path);next.push(file);draftFiles=checkpoint.files=validateNovaFiles(next);draftChecks=[];checked=undefined;result={written:file.path};break;}
            case 'check_plugin': {const report=await check();result={checks:report.checks};if(checkpoint.repairCount>policy.maxRepairs)stop={status:'waiting-user',message:'The draft still fails its checks after the selected effort repair limit. The files and check results are saved for revision.'};break;}
            case 'ask_user': {const question=stringArg(args,'question');result={paused:'waiting-user'};stop={status:'waiting-user',message:question};break;}
            case 'request_expert': {const question=stringArg(args,'question'),context=stringArg(args,'context');result={paused:'waiting-expert'};stop={status:'waiting-expert',message:'The draft is paused for expert guidance.',expert:{runId:claim.run.id,artifactId:claim.session.activeArtifactId,question,context}};break;}
            case 'complete_draft': {
              const summary=stringArg(args,'summary');
              if(!checked||checked.hash!==hashNovaFiles(checkpoint.files))await check();
              if(!checked){result={error:'Current files must pass check_plugin before completion'};if(checkpoint.repairCount>policy.maxRepairs)stop={status:'waiting-user',message:'The draft reached its repair limit and needs revision.'};break;}
              const report=checked.result;result={completed:true,status:'draft'};
              stop={status:'ready',message:summary,artifact:{id:randomUUID(),runId:claim.run.id,version:claim.session.artifacts.length+1,createdAt:new Date().toISOString(),files:structuredClone(checkpoint.files),manifest:report.manifest!,checks:report.checks,output:report.output!,sourceHash:report.sourceHash,fixtureHash:report.fixtureHash,status:'draft'}};break;
            }
            default:result={error:'Unknown tool'};
          }
        }catch(error){
          if(error instanceof LeaseEnded || error instanceof NovaSandboxError || controller.signal.aborted)throw error;
          result={error:error instanceof SyntaxError?'Invalid tool argument JSON':error instanceof Error?error.message.slice(0,1000):'Tool input rejected'};
        }
        checkpoint.messages.push({role:'tool',tool_call_id:tool.id,content:JSON.stringify(result)});
        // The result and file effects commit together; recovery runs only unresolved tools.
        await update(stop??{status:'building',message:`Completed ${tool.function.name}.`});
        if(stop){finished=true;break;}
      }
    }
  } catch(error) {
    if(deadlineExpired){await store.applyRunUpdate(claim.run.id,claim.claimToken,{status:'failed',errorCode:'run-timeout',message:'Nova reached the worker time limit. The checkpoint is saved.',files:draftFiles,checks:draftChecks,checkpoint,stepCount:checkpoint.stepCount,repairCount:checkpoint.repairCount}).catch(()=>false);return;}
    if(error instanceof LeaseEnded||controller.signal.aborted)return;
    const code=error instanceof NovaProviderError||error instanceof NovaSandboxError?error.code:'runner-failed';
    const message=error instanceof NovaProviderError||error instanceof NovaSandboxError?error.message:'Nova could not complete this run. The checkpoint is saved.';
    await store.applyRunUpdate(claim.run.id,claim.claimToken,{status:'failed',errorCode:code,message,files:draftFiles,checks:draftChecks,checkpoint,stepCount:checkpoint.stepCount,repairCount:checkpoint.repairCount}).catch(()=>false);
  } finally {finished=true;clearInterval(poll);clearTimeout(deadline);options.signal?.removeEventListener('abort',externalAbort);}
}
