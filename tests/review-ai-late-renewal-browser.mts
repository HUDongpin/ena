import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { cleanupOwnedEphemeralPostgres } from './support/owned-ephemeral-postgres.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const scriptProject = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const serverProject = process.argv[6] ?? scriptProject;
const { createOpenEnaAiInterpretationPostHandler } = await import(path.join(serverProject,'lib/server/open-ena-ai-interpretation-route.ts'));
const { MemoryBillableStore, createPostgresBillableStore } = await import(path.join(serverProject,'lib/server/open-ena-billable.ts'));
import { parseOpenEnaAiInterpretationRequest } from '../lib/open-ena/ai-interpretation';
const project = process.argv[2] ?? path.dirname(path.dirname(fileURLToPath(import.meta.url)));
process.chdir(project);
const bundle = await build({stdin:{contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import Ai from './components/open-ena/OpenEnaAiInterpretation';
    import {openEnaAiOperationOwnerKey} from './lib/open-ena/ai-operation-owner';
    const owner=openEnaAiOperationOwnerKey('synthetic-principal-A');
import {getOpenEnaCopy} from './lib/open-ena-i18n';
import {interpretationRequest} from './tests/helpers/ai-interpretation-request-v2';
let root=createRoot(document.getElementById('root'));
window.mountAi=(identity='synthetic-local')=>root.render(<Ai operationOwnerKey={owner} request={interpretationRequest()} localScientificIdentity={identity} copy={getOpenEnaCopy('en').aiInterpretation} disabled={false} disabledReason=''/>);
window.remountAi=()=>{root.unmount();root=createRoot(document.getElementById('root'));window.mountAi();};
window.mountAi();
`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',platform:'browser',jsx:'automatic',write:false,logLevel:'silent'});
const storeKind=process.argv[5]??'memory';
let cleanup = async()=>({confirmed:true});
let postgresProofAssertions=0;
const limits={minuteRequests:20,dailyMicroUsd:10000,monthlyMicroUsd:10000,globalMonthlyMicroUsd:10000,providerMonthlyMicroUsd:10000,maxConcurrency:2,maxReservationMicroUsd:99,longitudinalMaxReservationMicroUsd:99,alertThresholds:[50,80,100]};
let store = new MemoryBillableStore();
if(storeKind==='postgres') {
 const prefix='ena-r5-release-';const rootDirectory=mkdtempSync(path.join(tmpdir(),prefix));const dataDirectory=path.join(rootDirectory,'data');let startAttempted=false;let pool;
 cleanup=async()=>{if(pool)await pool.end();return {...await cleanupOwnedEphemeralPostgres({rootDirectory,dataDirectory,rootPrefix:prefix,startAttempted}),confirmed:true};};
 try {
 execFileSync('initdb',['--pgdata',dataDirectory,'--auth','trust','--username','postgres','--encoding','UTF8','--no-locale'],{stdio:'pipe',timeout:60000});
 const port=await new Promise<number>((resolve,reject)=>{const listener=createServer();listener.once('error',reject);listener.listen(0,'127.0.0.1',()=>{const port=(listener.address() as any).port;listener.close(error=>error?reject(error):resolve(port));});});
 startAttempted=true;execFileSync('pg_ctl',['--pgdata',dataDirectory,'--log',path.join(rootDirectory,'postgres.log'),'--options',`-h 127.0.0.1 -p ${port} -c unix_socket_directories=''`,'--wait','start'],{stdio:'pipe',timeout:60000});
 const {Pool}=createRequire(path.join(scriptProject,'package.json'))('pg');pool=new Pool({host:'127.0.0.1',port,user:'postgres',database:'postgres',max:4,statement_timeout:5000});
 for(const name of ['001_open_ena_billable.sql','003_open_ena_ai_consent.sql','006_open_ena_billable_leases.sql'])await pool.query(readFileSync(path.join(scriptProject,'migrations',name),'utf8'));
 store=createPostgresBillableStore((sql,params)=>pool.query(sql,params));
 if(store.isReleasedOperation) {
  const same=(actual,expected)=>{assert.equal(actual,expected);postgresProofAssertions++;};
  const owner={principalRef:'proof-A',resource:'ai-interpretation',idempotencyKey:'proof-X'};
  same(await store.isReleasedOperation(owner),false);
  const reservation=await store.reserve({...owner,microUsd:99,limits});assert.ok(reservation);
  same(await store.isReleasedOperation(owner),false);await store.release(reservation);
  same(await store.isReleasedOperation(owner),true);
  for(const changed of [{...owner,principalRef:'proof-B'},{...owner,resource:'longitudinal'},{...owner,idempotencyKey:'proof-Y'}])same(await store.isReleasedOperation(changed),false);
  await store.settle(reservation,99,true);same(await store.isReleasedOperation(owner),true);
  const replay=await store.reserveDetailed({...owner,microUsd:99,limits});same(replay.ok,false);same(replay.reason,'idempotency-replayed');
  await pool.query('UPDATE open_ena_billable_reservations SET dispatched=true WHERE id=$1',[reservation.id]);same(await store.isReleasedOperation(owner),false);
  await pool.query('TRUNCATE open_ena_quota_windows,open_ena_spend,open_ena_billable_reservations,open_ena_security_outbox,open_ena_ai_consent_receipts');
 }
 } catch(error) {await cleanup();throw error;}
}
let quotaCalls=0; const consumeQuota=store.consumeQuota.bind(store); store.consumeQuota=async (...args)=>{quotaCalls++;return consumeQuota(...args);};
const generations: unknown[] = [], calls: {id: string | null; status: number; retry: string|null}[] = [];
const handler = createOpenEnaAiInterpretationPostHandler({
 verifyPrincipal:token=>token==='synthetic-principal-A'||token==='synthetic-principal-B'?{principalRef:token}:null,authConfigurationReady:()=>true,environment:{},providerDescriptor:()=>({provider:'synthetic',model:'fixture'}),
 parseRequest:parseOpenEnaAiInterpretationRequest,billableStore:store,requireBillable:storeKind==='postgres',limits,
 generate:async request=>{generations.push(request);throw Object.assign(new Error('synthetic provider failure'),generations.length===1?{code:'invalid-configuration',providerDispatched:false}:{code:'upstream-network',providerDispatched:true});},
});
const scenario=process.argv[4]??'cancel';
const browser=await chromium.launch({headless:true});let result;
try{
 const page=await browser.newPage();
 await page.context().addCookies([{name:'open-ena-session',value:'synthetic-principal-A',domain:'localhost',path:'/',httpOnly:true}]);
 const errors: string[]=[],external: string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!=='http://localhost:32167'){external.push(url.href);return route.abort();}
  if(url.pathname!=='/api/open-ena/ai-interpretation')return route.fulfill({contentType:'text/html',body:'<!doctype html><div id="root"></div>'});
  const headers=new Headers(await request.allHeaders());headers.set('origin',url.origin);
  const response=await handler(new Request(url.href,{method:'POST',headers,body:request.postData()}));
  calls.push({id:headers.get('x-open-ena-ai-operation-id'),status:response.status,retry:response.headers.get('x-open-ena-ai-retry')});
  return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
 });
 await page.goto('http://localhost:32167/');
 await page.evaluate(()=>{
  const nativeFetch=window.fetch.bind(window);let attempt=0;
  window.fetch=async(...args)=>{
   const response=await nativeFetch(...args);attempt++;
   if(attempt===1){const parsed=response.json();response.json=async()=>{const payload=await parsed;await new Promise(resolve=>{window.releaseOldRenewal=resolve;});return payload;};}
   return response;
  };
 });
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 const generate=()=>page.locator('.ena-ai-actions button').first().click();
 await page.getByRole('checkbox').check();await generate();
 await page.waitForFunction(()=>typeof window.releaseOldRenewal==='function');
 if(scenario==='remount') {await page.evaluate(()=>window.remountAi());await page.getByRole('checkbox').check();}
 else if(scenario==='local-epoch') {await page.evaluate(()=>window.mountAi('synthetic-next'));await page.getByRole('checkbox').check();}
 else await page.getByRole('button',{name:'Cancel',exact:true}).click();
 if(scenario==='principal-change')await page.context().addCookies([{name:'open-ena-session',value:'synthetic-principal-B',domain:'localhost',path:'/',httpOnly:true}]);
 await generate();
 await page.getByRole('alert').waitFor();
 const beforeRelease=await page.getByRole('alert').textContent();
 await page.evaluate(()=>window.releaseOldRenewal());
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const afterRelease=await page.getByRole('alert').textContent();
 if(scenario==='principal-change'){
  assert.equal(await page.getByRole('alert').getByRole('button').count(),0);
  assert.equal(await page.locator('.ena-ai-actions button').first().isDisabled(),true);
 }else{
  await page.getByRole('alert').getByRole('button').click();
  const deadline=Date.now()+5000;while(calls.length<3&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
 }
 await page.getByRole('alert').waitFor();
 const operationChecks = scenario==='principal-change'
  ? calls.length===2&&calls[0].status===503&&calls[1].status===409&&calls.every(call=>call.id===calls[0].id)&&generations.length===1&&quotaCalls===1&&calls.slice(1).every(call=>call.retry===null)
  : calls.length===3&&calls[0].status===503&&calls[1].status===409&&calls[0].id===calls[1].id&&calls[2].status===502&&calls[2].id!==calls[1].id&&generations.length===2;
 result={passed:operationChecks&&beforeRelease===afterRelease&&errors.length===0&&external.length===0,
  project,serverProject,storeKind,postgresProofAssertions,scenario,calls,quotaCalls,generationCalls:generations.length,staleErrorNotAdopted:beforeRelease===afterRelease,errors,external};
 console.log(JSON.stringify(result));
}finally{await browser.close();const cleanupResult=await cleanup();if(result)result.cleanup=cleanupResult;}
if(process.argv[3])await writeFile(process.argv[3],JSON.stringify(result,null,2)+'\n');
assert.ok(result.passed,'A server-confirmed release of X must retire X without adopting its obsolete error or blocking the next explicit retry');
