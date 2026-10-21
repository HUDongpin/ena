import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {cleanupOwnedEphemeralPostgres} from './support/owned-ephemeral-postgres.mjs';
import {createOpenEnaAiInterpretationPostHandler} from '../lib/server/open-ena-ai-interpretation-route';
import {MemoryBillableStore,createPostgresBillableStore} from '../lib/server/open-ena-billable';
import {parseOpenEnaAiInterpretationRequest} from '../lib/open-ena/ai-interpretation';
const project=path.dirname(path.dirname(fileURLToPath(import.meta.url)));process.chdir(project);
const kind=process.argv[2]??'memory',results:any[]=[];let cleanup=async()=>({confirmed:true});let pool:any;
const limits={minuteRequests:30,dailyMicroUsd:10000,monthlyMicroUsd:10000,globalMonthlyMicroUsd:10000,providerMonthlyMicroUsd:10000,maxConcurrency:2,maxReservationMicroUsd:99,longitudinalMaxReservationMicroUsd:99,alertThresholds:[50,80,100]};
if(kind==='postgres'){
 const prefix='ena-r6-owner-';const rootDirectory=mkdtempSync(path.join(tmpdir(),prefix));const dataDirectory=path.join(rootDirectory,'data');let startAttempted=false;
 cleanup=async()=>{if(pool)await pool.end();return {...await cleanupOwnedEphemeralPostgres({rootDirectory,dataDirectory,rootPrefix:prefix,startAttempted}),confirmed:true};};
 try{
  execFileSync('initdb',['--pgdata',dataDirectory,'--auth','trust','--username','postgres','--encoding','UTF8','--no-locale'],{stdio:'pipe',timeout:60000});
  const port=await new Promise<number>((resolve,reject)=>{const server=createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=(server.address() as any).port;server.close(error=>error?reject(error):resolve(port));});});
  startAttempted=true;execFileSync('pg_ctl',['--pgdata',dataDirectory,'--log',path.join(rootDirectory,'postgres.log'),'--options',`-h 127.0.0.1 -p ${port} -c unix_socket_directories=''`,'--wait','start'],{stdio:'pipe',timeout:60000});
  const {Pool}=createRequire(path.join(project,'package.json'))('pg');pool=new Pool({host:'127.0.0.1',port,user:'postgres',database:'postgres',max:4,statement_timeout:5000});
  for(const name of ['001_open_ena_billable.sql','003_open_ena_ai_consent.sql','006_open_ena_billable_leases.sql'])await pool.query(readFileSync(path.join(project,'migrations',name),'utf8'));
 }catch(error){await cleanup();throw error;}
}
const bundle=await build({stdin:{contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';
 import Ai from './components/open-ena/OpenEnaAiInterpretation';
 import {openEnaAiOperationOwnerKey} from './lib/open-ena/ai-operation-owner';
 import {openEnaAiOperationStorageKey,openEnaAiOperationScope} from './lib/open-ena/ai-operation-storage';
 import {interpretationRequest} from './tests/helpers/ai-interpretation-request-v2';import {getOpenEnaCopy} from './lib/open-ena-i18n';
 window.requestFixture=interpretationRequest();window.ownerKey=openEnaAiOperationOwnerKey;
 window.scopeKey=principal=>openEnaAiOperationScope(window.requestFixture,openEnaAiOperationOwnerKey(principal)).key;
 window.legacyV3=openEnaAiOperationStorageKey(window.requestFixture);window.legacyV2='open-ena-ai-operation-v2:'+window.requestFixture.binding.evidenceKey;
 window.prepareStorage?.();let root=createRoot(document.getElementById('root'));
 window.mountAi=(principal='A',remount=false)=>{if(remount){root.unmount();root=createRoot(document.getElementById('root'));}root.render(<Ai operationOwnerKey={openEnaAiOperationOwnerKey(principal)} request={structuredClone(window.requestFixture)} localScientificIdentity='synthetic-local' copy={getOpenEnaCopy('en').aiInterpretation} disabled={false} disabledReason=''/>) };window.mountAi(window.initialOwner??'A');
`,loader:'tsx',resolveDir:project},bundle:true,platform:'browser',format:'iife',jsx:'automatic',write:false,logLevel:'silent'});
const browser=await chromium.launch({headless:true});let cleanupResult;
try{
 for(const scenario of ['stale-tab-cookie','roundtrip-release','roundtrip-success','roundtrip-unknown','token-rotation-reload','hint-cookie-switch','lost-unknown','lost-release','legacy-v2-release','legacy-v3-release','storage-denied','storage-quota-legacy','equivalent-rerender']){
  if(pool)await pool.query('TRUNCATE open_ena_quota_windows,open_ena_spend,open_ena_billable_reservations,open_ena_security_outbox,open_ena_ai_consent_receipts');
  const store=pool?createPostgresBillableStore((sql,params)=>pool.query(sql,params)):new MemoryBillableStore();
  const calls:any[]=[],generations:any[]=[],errors:string[]=[],external:string[]=[];let activePrincipal='';
  const handler=createOpenEnaAiInterpretationPostHandler({verifyPrincipal:token=>{activePrincipal=token?.startsWith('A-')?'A':token?.startsWith('B-')?'B':'';return activePrincipal?{principalRef:activePrincipal}:null;},authConfigurationReady:()=>true,environment:{},providerDescriptor:()=>({provider:'synthetic',model:'fixture'}),parseRequest:parseOpenEnaAiInterpretationRequest,billableStore:store,requireBillable:kind==='postgres',limits,generate:async request=>{
   generations.push({principal:activePrincipal,request});
   const first=generations.length===1;const release=(scenario==='hint-cookie-switch'||scenario==='lost-release')&&first || activePrincipal==='B'&&scenario!=='roundtrip-unknown'&&scenario!=='roundtrip-success'&&generations.length===2;
   if(activePrincipal==='B'&&scenario==='roundtrip-success')return {response:{schemaVersion:'open-ena-ai-interpretation-response-v2',promptVersion:request.promptVersion,binding:request.binding,provider:'deepseek',model:'synthetic-model',generatedAt:'2026-10-01T00:00:00.000Z',interpretation:{observedPatterns:[],contextualQuestions:[],limitations:['Synthetic aggregate evidence only.']}},usage:{promptTokens:1,completionTokens:1,totalTokens:2,costMicroUsd:1},providerDispatched:true};
   throw Object.assign(new Error('synthetic failure'),release?{code:'invalid-configuration',providerDispatched:false}:{code:'upstream-network',providerDispatched:true});
  }});
  const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
  const cookie=(token:string)=>page.context().addCookies([{name:'open-ena-session',value:token,domain:'localhost',path:'/',httpOnly:true}]);await cookie('A-1');
  await page.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(url.origin!=='http://localhost:32168'){external.push(url.href);return route.abort();}if(url.pathname!=='/api/open-ena/ai-interpretation')return route.fulfill({contentType:'text/html',body:'<!doctype html><div id="root"></div>'});const headers=new Headers(await request.allHeaders());headers.set('origin',url.origin);const response=await handler(new Request(url.href,{method:'POST',headers,body:request.postData()}));const body=await response.text();calls.push({id:headers.get('x-open-ena-ai-operation-id'),owner:headers.get('x-open-ena-ai-owner'),principal:activePrincipal,status:response.status,renew:response.headers.get('x-open-ena-ai-retry'),errorCode:JSON.parse(body).errorCode??null});if(scenario.startsWith('lost-')&&calls.length===1)return route.abort('connectionfailed');return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body});});
  await page.goto('http://localhost:32168/');
  await page.evaluate(scenario=>{window.prepareStorage=()=>{const X='aiop-11111111-1111-4111-8111-111111111111';if(scenario==='legacy-v2-release'||scenario==='storage-quota-legacy')sessionStorage.setItem(window.legacyV2,X);if(scenario==='legacy-v3-release')sessionStorage.setItem(window.legacyV3,X);if(scenario==='storage-denied')for(const method of ['getItem','setItem','removeItem'])Storage.prototype[method]=()=>{throw new DOMException('Synthetic denied','SecurityError');};if(scenario==='storage-quota-legacy')Storage.prototype.setItem=()=>{throw new DOMException('Synthetic full','QuotaExceededError');};};},scenario);
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  const assertTerminal=async(n:number)=>{
   await page.locator('[role="alert"][data-ena-ai-recovery="review-request"]').waitFor();
   assert.equal(await page.getByRole('alert').getByRole('button').count(),0,`${scenario}: terminal response has no Retry`);
   assert.equal(await page.locator('.ena-ai-actions button').first().isDisabled(),true,`${scenario}: terminal Generate is disabled`);
   await page.locator('.ena-ai-actions button').first().evaluate(button=>(button as HTMLButtonElement).click());
   assert.equal(calls.length,n,`${scenario}: terminal UI cannot dispatch another request`);
  };
  const settle=async(n:number)=>{
   await page.waitForFunction(()=>document.querySelector('.ena-ai-interpretation')?.getAttribute('aria-busy')==='false');
   assert.equal(calls.length,n);await page.locator('[role=alert],.ena-ai-result').first().waitFor();
   if(calls[n-1].errorCode==='operation-not-retryable'&&!(scenario.startsWith('lost-')&&n===1))await assertTerminal(n);
  };
  const generate=async(n:number)=>{const consent=page.getByRole('checkbox');if(!await consent.isChecked())await consent.check();await page.locator('.ena-ai-actions button').first().click();await settle(n);};
  // A remount reopens the UI but retains owner-scoped operation storage. Use it
  // for lifecycle replay probes after asserting that terminal controls block
  // repeated submissions in the current panel.
  const remount=async(principal='A')=>{await page.evaluate(principal=>window.mountAi(principal,true),principal);await page.waitForFunction(()=>!document.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked);};
  const mount=async(principal:string)=>{await cookie(principal+'-1');await remount(principal);};
  await generate(1);
  if(scenario==='stale-tab-cookie'){
   await remount();await cookie('B-1');await generate(2);assert.equal(calls[1].status,409);assert.equal(calls[1].renew,null);await cookie('A-1');await generate(3);assert.equal(calls[2].id,calls[0].id);assert.equal(calls[2].status,409);assert.equal(generations.length,1);
  }else if(scenario==='hint-cookie-switch'){
   await cookie('B-1');await generate(2);assert.equal(calls[1].status,409);assert.notEqual(calls[1].id,calls[0].id);await cookie('A-1');await generate(3);assert.equal(calls[2].id,calls[1].id);assert.equal(calls[2].status,502);assert.equal(generations.length,2);
  }else if(scenario.startsWith('lost-')){
   await generate(2);assert.equal(calls[1].status,409);assert.equal(calls[1].id,calls[0].id);if(scenario==='lost-unknown')await remount();await generate(3);assert.equal(calls[2].status,scenario==='lost-release'?502:409);assert.equal(generations.length,scenario==='lost-release'?2:1);if(scenario==='lost-unknown')assert.equal(calls[2].id,calls[0].id);
  }else if(scenario==='token-rotation-reload'){
   await cookie('A-rotated');await remount();await generate(2);await page.reload();await page.addScriptTag({content:bundle.outputFiles[0].text});await generate(3);assert.ok(calls.every(call=>call.id===calls[0].id));assert.equal(generations.length,1);
  }else if(scenario==='equivalent-rerender'){
   await page.evaluate(()=>window.mountAi('A'));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await page.getByRole('checkbox').isChecked(),true);await assertTerminal(1);await remount();await generate(2);assert.equal(calls[1].id,calls[0].id);assert.equal(generations.length,1);
  }else{
   await mount('B');await generate(2);const expectedB=scenario==='roundtrip-success'?200:scenario==='roundtrip-unknown'?502:503;assert.equal(calls[1].status,expectedB);
   await mount('A');await generate(3);assert.equal(calls[2].id,calls[0].id);assert.equal(calls[2].status,409);assert.equal(generations.length,2);
   if(scenario!=='roundtrip-unknown'){
    if(scenario.startsWith('legacy-')){await cookie('B-1');await page.reload();await page.evaluate(()=>{window.initialOwner='B';});await page.addScriptTag({content:bundle.outputFiles[0].text});}
    else await mount('B');
    await generate(4);assert.notEqual(calls[3].id,calls[1].id);assert.equal(generations.length,3);
   }
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);results.push({scenario,passed:true,calls,generationCalls:generations.length,errors,external});console.log('PASS',kind,scenario);await page.close();
 }
}finally{await browser.close();cleanupResult=await cleanup();if(process.argv[3])writeFileSync(process.argv[3],JSON.stringify({kind,results,cleanup:cleanupResult},null,2)+'\n');}
assert.equal(results.length,13);console.log('PASS',kind,results.length,'cleanup',cleanupResult.confirmed);
