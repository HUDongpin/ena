import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';
import {chromium} from 'playwright';
process.chdir(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const fixture=await readFile('tests/open-ena-model-v3-workspace-browser.mjs','utf8');
const entry=fixture.split('const entry = `')[1].split('`;\nconst bundle')[0];
const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',platform:'browser',jsx:'automatic',write:false,logLevel:'silent'});
const browser=await chromium.launch({headless:true});
const results=[];
try {
 for(const scenario of ['source-parse-superseded','source-read-superseded','artifact-read-cancelled','artifact-read-superseded','source-parse-current','source-read-current','artifact-read-current','sample-fetch-superseded','sample-fetch-current','typing-digest-cancelled','typing-digest-current']){
  const page=await browser.newPage();const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
  await page.route('http://localhost:32157/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><div id="root"></div>'}));
  await page.goto('http://localhost:32157/');await page.addScriptTag({content:bundle.outputFiles[0].text});

  if(scenario.startsWith('sample')||scenario.startsWith('typing')){
   await page.getByRole('button',{name:'Model',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('[data-testid="open-ena-run-model"]')?.disabled===false);
   await page.getByRole('button',{name:'Data',exact:true}).click();
   const sourceInput=page.getByLabel('Open coded CSV or XLSX',{exact:true});
   if(scenario.startsWith('sample')){
    await page.evaluate(()=>{window.releaseFailure=null;window.fetch=()=>new Promise((resolve,reject)=>{window.releaseFailure=()=>reject(new TypeError('Synthetic sample transport failure'));});});
    await page.getByRole('button',{name:'Load sample',exact:true}).click();
   }else{
    await sourceInput.setInputFiles({name:'typed.csv',mimeType:'text/csv',buffer:Buffer.from('unit,A\nfresh,1')});
    await page.getByRole('dialog').waitFor();
    await page.evaluate(()=>{window.releaseFailure=null;const native=crypto.subtle.digest.bind(crypto.subtle);let pending=true;crypto.subtle.digest=(...args)=>{if(!pending)return native(...args);pending=false;return new Promise((resolve,reject)=>{window.releaseFailure=()=>reject(new DOMException('Synthetic digest failure','OperationError'));});};});
    await page.getByRole('button',{name:'Confirm types and create typed XLSX',exact:true}).click();
   }
   await page.waitForFunction(()=>typeof window.releaseFailure==='function');
   if(scenario.endsWith('-superseded')){
    await sourceInput.setInputFiles({name:'new-valid.csv',mimeType:'text/csv',buffer:Buffer.from('unit,A\nnew,1')});await page.getByRole('dialog').waitFor();
   }else if(scenario.endsWith('-cancelled'))await page.getByRole('button',{name:'Cancel source preparation',exact:true}).click();
   await page.evaluate(()=>window.releaseFailure());
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const alerts=await page.getByRole('alert').allTextContents();const expected=scenario.endsWith('-current')?1:0;
   results.push({scenario,expectedAlerts:expected,actualAlerts:alerts.length,alerts,pageErrors,passed:alerts.length===expected&&pageErrors.length===0});
   console.log(JSON.stringify(results.at(-1)));await page.close();continue;
  }
  const draft=await page.evaluate(()=>window.fixtureDraft());
  await page.evaluate(()=>{
   window.pendingRead=null;
   for(const method of ['text','arrayBuffer']){
    const native=File.prototype[method];
    File.prototype[method]=function(){if(!this.name.startsWith('held-'))return native.call(this);return new Promise((resolve,reject)=>{window.pendingRead={resolve:()=>native.call(this).then(resolve),reject:()=>reject(new DOMException('Synthetic device read failure','NotReadableError'))};});};
   }
  });
  const source=scenario.startsWith('source');
  const input=source?page.getByLabel('Open coded CSV or XLSX', {exact:true}):page.getByLabel('Import configuration, result or Reference');
  const malformed=scenario.includes('-parse-');
  await input.setInputFiles({name:source?'held-invalid.csv':'held-invalid.json',mimeType:source?'text/csv':'application/json',buffer:Buffer.from(source?(malformed?'unit,A\nu1,"unterminated':'unit,A\nu1,1'):draft)});
  await page.waitForFunction(()=>window.pendingRead!==null);
  if(scenario.endsWith('-superseded')){
   await input.setInputFiles({name:source?'new-valid.csv':'new-valid.json',mimeType:source?'text/csv':'application/json',buffer:Buffer.from(source?'unit,A\nfresh,1':draft)});
   if(source)await page.getByRole('dialog').waitFor();else await page.getByTestId('ena-import-preview-v3').waitFor();
  } else if(scenario.endsWith('-cancelled'))await page.getByRole('button',{name:'Cancel pending import',exact:true}).click();
  await page.evaluate(malformed=>malformed?window.pendingRead.resolve():window.pendingRead.reject(),malformed);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const alerts=await page.getByRole('alert').allTextContents();
  const expected=scenario.endsWith('-current')?1:0;
  results.push({scenario,expectedAlerts:expected,actualAlerts:alerts.length,alerts,pageErrors,passed:alerts.length===expected&&pageErrors.length===0});
  console.log(JSON.stringify(results.at(-1)));await page.close();
 }
}finally{await browser.close();}
if (process.argv[2]) await writeFile(process.argv[2],JSON.stringify(results,null,2)+'\n');
assert.ok(results.every(row=>row.passed),'Only the active import intent may publish an error');
