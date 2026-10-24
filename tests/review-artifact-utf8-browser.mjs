import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const fixture=await readFile('tests/open-ena-model-v3-workspace-browser.mjs','utf8');
const entry=fixture.split('const entry = `')[1].split('`;\nconst bundle')[0]+`
import {SAMPLE_CONFIG} from './lib/open-ena/types';
import {buildPresentationArtifactV3} from './lib/open-ena/presentation-artifact-v3';
window.fixtureArtifactForUtf8=async(kind)=> {
 if(kind==='legacy')return JSON.stringify({...SAMPLE_CONFIG,unitColumns:['Café']});
 if(kind==='reference')return JSON.stringify(await buildReferenceV2(await fitReferenceSourceV3(window.jobs[0].plan),{displayName:'Café Reference',currentPlan:window.jobs[0].plan}));
 if(kind==='preset')return JSON.stringify({...buildPresentationArtifactV3(window.jobs[0].result,{hiddenCodes:[],hiddenGroups:[],codeColors:{},nodeOverrides:[],dimensions:['SVD1','SVD2']}),hiddenGroups:[{type:'string',value:'Café'}]});
 return new TextDecoder().decode((await exportDraftV3({...standard,unitColumns:['Café']})).bytes);
};`;
const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',platform:'browser',jsx:'automatic',write:false,logLevel:'silent'});
const directory=process.argv[2]??'../native-red';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true});const reports=[];const errors=[];const blocked=[];
try{
 for(const kind of ['legacy','reference','draft','preset']){
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{if(route.request().url()==='http://localhost:32557/unified-home/logo-open-ena-mark.svg')return route.fulfill({contentType:'image/svg+xml',body:await readFile('public/unified-home/logo-open-ena-mark.svg')});if(route.request().url()==='http://localhost:32557/')return route.fulfill({contentType:'text/html',body:'<!doctype html><div id="root"></div>'});blocked.push(route.request().url());return route.abort();});
  await page.goto('http://localhost:32557/');await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.getByRole('button',{name:'Model',exact:true}).click();
  const run=page.getByTestId('open-ena-run-model');await page.waitForFunction(()=>document.querySelector('[data-testid="open-ena-run-model"]')?.disabled===false);
  await run.click();await page.waitForFunction(()=>window.jobs.length===1);await page.evaluate(()=>window.resolveRun(0));await page.waitForFunction(()=>document.querySelector('[data-testid="open-ena-workspace-v3"]').dataset.resultStatus==='current');
  await page.locator('.ena-artifacts-disclosure > summary').click();
  const text=await page.evaluate(kind=>window.fixtureArtifactForUtf8(kind),kind);const pos=text.indexOf('é');assert.ok(pos>=0);
  const buffer=Buffer.concat([Buffer.from(text.slice(0,pos)),Buffer.from([0xe9]),Buffer.from(text.slice(pos+1))]);assert.throws(()=>new TextDecoder('utf-8',{fatal:true}).decode(buffer));
  if(kind!=='preset')await page.getByRole('button',{name:'Data',exact:true}).click();
  const input=kind==='preset'?page.getByLabel('Review presentation preset',{exact:true}):page.getByLabel('Import configuration, result or Reference',{exact:true});
  await input.setInputFiles({name:`corrupt-${kind}.json`,mimeType:'application/json',buffer});
  await page.waitForFunction(()=>document.querySelector('[data-testid="ena-import-preview-v3"]')||document.querySelector('[role="dialog"]')||document.querySelector('[role="alert"]'));
  const preview=kind==='preset'?page.getByRole('dialog',{name:'Presentation preset preview',exact:true}):page.getByTestId('ena-import-preview-v3');
  const accepted=await preview.count()>0;const alerts=await page.getByRole('alert').allTextContents();let adopted=null;
  if(accepted&&kind==='legacy'){
   await page.getByRole('button',{name:'Replace configuration',exact:true}).click();
   const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Export draft',exact:true}).click()]);
   const exported=JSON.parse(await readFile(await download.path(),'utf8'));adopted=exported.draft.unitColumns;
  }
  if(accepted&&kind==='reference'){
   await page.getByRole('button',{name:'Add Reference',exact:true}).click();
   await page.getByRole('button',{name:'Model',exact:true}).click();await page.getByRole('tab',{name:/Windows,/}).click();
   // Registry visibility is observable once the user chooses Reference rotation.
   const rotation=page.getByRole('combobox').filter({has:page.locator('option[value="reference"]')});
   if(await rotation.count())await rotation.selectOption('reference');
   adopted=await page.locator('option').allTextContents();
  }
  if(accepted&&kind==='preset'){
   await page.getByRole('button',{name:'Apply matching presentation preset',exact:true}).click();adopted={alerts:await page.getByRole('alert').allTextContents(),previewStillPresent:await preview.count()>0};
  }
  reports.push({kind,strictUtf8Rejected:true,accepted,adopted,alerts,paidOrWorkerCalls:await page.evaluate(()=>window.jobs.length),passed:!accepted&&alerts.length>0});
  await page.screenshot({path:`${directory}/${kind}.png`});await page.close();
 }
}finally{await browser.close();const sources=await Promise.all(['components/open-ena/OpenEnaWorkspace.tsx','components/open-ena/model-v3/workspace-controller.ts','tests/review-artifact-utf8-browser.mjs'].map(async path=>({path,sha256:createHash('sha256').update(await readFile(path)).digest('hex')})));await writeFile(`${directory}/report.json`,JSON.stringify({reports,errors,blocked,sources,browserClosed:true},null,2));}
assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);assert.ok(reports.every(x=>x.passed),'Malformed UTF-8 artifacts must reject before preview/adoption');
