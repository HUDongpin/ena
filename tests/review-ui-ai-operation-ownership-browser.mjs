import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
process.chdir(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const bundle = await build({stdin:{contents:`
import React from 'react';
import {createRoot} from 'react-dom/client';
import Ai from './components/open-ena/OpenEnaAiInterpretation';
    import {openEnaAiOperationOwnerKey} from './lib/open-ena/ai-operation-owner';
    const owner=openEnaAiOperationOwnerKey('synthetic-browser-principal');
import {openEnaAiOperationScope} from './lib/open-ena/ai-operation-storage';
import {getOpenEnaCopy} from './lib/open-ena-i18n';
import {interpretationRequest} from './tests/helpers/ai-interpretation-request-v2';
window.fixtureRequest=interpretationRequest();
window.fixtureStorageKey=openEnaAiOperationScope(window.fixtureRequest,owner).key;
let root=createRoot(document.getElementById('root'));
window.mountAi=(identity='synthetic-native-A')=>root.render(<Ai operationOwnerKey={owner} request={window.fixtureRequest} localScientificIdentity={identity} copy={getOpenEnaCopy('en').aiInterpretation} disabled={false} disabledReason=''/>);
window.remountAi=()=>{root.unmount();root=createRoot(document.getElementById('root'));window.mountAi();};
window.mountAi();
`,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',platform:'browser',jsx:'automatic',write:false,logLevel:'silent'});
const browser=await chromium.launch({headless:true});
const results=[];
try {
 for (const transition of ['cancel','identity-change','unmount-remount']) {
  const page=await browser.newPage();const errors=[];const external=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
   if(route.request().url()==='http://localhost:32165/') return route.fulfill({contentType:'text/html',body:'<!doctype html><div id="root"></div>'});
   external.push(route.request().url());return route.abort();
  });
  await page.goto('http://localhost:32165/');await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.evaluate(()=>{
   window.operationRequests=[];window.releaseOldFailure=null;
   window.fetch=async(input,init)=>{
    if(String(input)!=='/api/open-ena/ai-interpretation')throw Error('Unexpected transport');
    const id=new Headers(init.headers).get('x-open-ena-ai-operation-id');
    window.operationRequests.push({id,body:init.body});
    const attempt=window.operationRequests.length;
    if(attempt===3)return new Promise(()=>{}); // a newer outcome remains unknown
    const response=new Response(JSON.stringify({error:'Synthetic pre-dispatch failure'}),{status:503,headers:{'content-type':'application/json',...(attempt<3?{'x-open-ena-ai-retry':'new-operation','x-open-ena-ai-operation-id':id}:{})}});
    if(attempt===1){
     const parsed=response.json();
     response.json=async()=>{const payload=await parsed;await new Promise(resolve=>{window.releaseOldFailure=resolve;});return payload;};
    }
    return response;
   };
  });
  const generate=()=>page.locator('.ena-ai-actions button').first().click();
  const stored=()=>page.evaluate(()=>sessionStorage.getItem(window.fixtureStorageKey));
  await page.getByRole('checkbox').check();await generate();
  await page.waitForFunction(()=>typeof window.releaseOldFailure==='function');
  if(transition==='cancel')await page.getByRole('button',{name:'Cancel',exact:true}).click();
  else if(transition==='identity-change')await page.evaluate(()=>window.mountAi('synthetic-native-B'));
  else await page.evaluate(()=>window.remountAi());
  await page.getByRole('checkbox').check();await generate();
  await page.getByRole('alert').waitFor();
  const afterCurrentRenewal=await stored();
  await page.getByRole('alert').getByRole('button').click();
  await page.waitForFunction(()=>window.operationRequests.length===3);
  const newerId=await stored();
  await page.evaluate(()=>window.releaseOldFailure());
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const afterOldFailure=await stored();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.evaluate(()=>window.remountAi());
  await page.getByRole('checkbox').check();await generate();
  await page.getByRole('alert').waitFor();
  const requests=await page.evaluate(()=>window.operationRequests);
  const finalStoredId=await stored();
  const controls=afterCurrentRenewal==='closed'&&requests[0].id===requests[1].id&&requests[2].id!==requests[1].id&&newerId===requests[2].id;
  const passed=controls&&afterOldFailure===newerId&&requests[3].id===newerId&&finalStoredId===newerId&&new Set(requests.map(r=>r.body)).size===1&&errors.length===0&&external.length===0;
  results.push({transition,passed,controls,afterCurrentRenewal,newerId,afterOldFailure,requests:requests.map(r=>r.id),finalStoredId,identicalReviewedPayloads:new Set(requests.map(r=>r.body)).size===1,errors,external});
  console.log(JSON.stringify(results.at(-1)));await page.close();
 }
}finally{await browser.close();}
if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(results,null,2)+'\n');
assert.ok(results.every(result=>result.passed),'An obsolete response must not clear a newer unresolved operation or change the next retry identity');
