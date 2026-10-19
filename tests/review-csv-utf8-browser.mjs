import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright';
process.chdir(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const directory=path.resolve(process.argv[2]??'../browser');await mkdir(directory,{recursive:true});
const fixture=await readFile('tests/open-ena-model-v3-workspace-browser.mjs','utf8');
const rawEntry=fixture.split('const entry = `')[1].split('`;\nconst bundle')[0];
const browser=await chromium.launch({headless:true});
const results=[],errors=[],requests=[];
try{
  for(const locale of ['en','zh-hant','zh-hans']){
    const entry=rawEntry.replace("locale='en'",`locale='${locale}'`);
    const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',platform:'browser',jsx:'automatic',write:false,logLevel:'silent'});
    const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.origin==='http://localhost:32647')return route.fulfill({contentType:url.pathname.endsWith('.svg')?'image/svg+xml':'text/html',body:url.pathname.endsWith('.svg')?'<svg xmlns="http://www.w3.org/2000/svg"/>':'<!doctype html><div id="root"></div>'});
      requests.push(route.request().url());return route.abort();
    });
    await page.goto('http://localhost:32647/');await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.locator('.ena-rail-modes button').nth(0).click();
    const input=page.locator('input[accept^=".csv,.xlsx"]');
    for(const [name,bytes] of [
      ['latin1',Buffer.concat([Buffer.from('unit,A\ncaf'),Buffer.from([0xe9]),Buffer.from(',1\ncaf'),Buffer.from([0xe8]),Buffer.from(',2')])],
      ['truncated',Buffer.concat([Buffer.from('unit,A\n'),Buffer.from([0xf0,0x9f,0x92]),Buffer.from(',1')])],
    ]){
      await input.setInputFiles({name:name+'.csv',mimeType:'text/csv',buffer:bytes});
      await page.getByRole('alert').waitFor();
      const alerts=await page.getByRole('alert').allTextContents();
      assert.equal(alerts.length,1);assert.match(alerts[0],/UTF-8/u);
      assert.equal(await page.getByRole('dialog').count(),0);
      assert.equal(await page.evaluate(()=>window.jobs.length),0);
      assert.equal(await page.locator('.open-ena-workbench').getAttribute('aria-busy'),'false');
      results.push({locale,case:name,accepted:false,alerts,previewCount:0});
    }
    for(const [name,text,expected] of [
      ['unicode','unit,A\ncafé,1\ncafè,2\n中文👩‍🔬,3',['café','cafè','中文👩‍🔬']],
      ['bom','\ufeffunit,A\nBOM,1',['BOM']],
      ['literal-replacement','unit,A\nliteral-�,1',['literal-�']],
    ]){
      await input.setInputFiles({name:name+'.csv',mimeType:'text/csv',buffer:Buffer.from(text)});
      await page.getByRole('dialog').waitFor();
      const preview=await page.getByRole('dialog').textContent();
      for(const label of expected)assert.ok(preview.includes(label));
      assert.equal(await page.getByRole('alert').count(),0);
      results.push({locale,case:name,accepted:'preview only',labels:expected});
    }
    if(locale==='en'){
      await page.evaluate(()=>{
        const native=File.prototype.arrayBuffer;window.pendingCsvBytes=null;
        File.prototype.arrayBuffer=function(){if(!this.name.startsWith('held-'))return native.call(this);return new Promise(resolve=>{window.pendingCsvBytes=()=>native.call(this).then(resolve);});};
      });
      const bad=Buffer.concat([Buffer.from('unit,A\n'),Buffer.from([0xe9]),Buffer.from(',1')]);
      await input.setInputFiles({name:'held-malformed.csv',mimeType:'text/csv',buffer:bad});
      await page.waitForFunction(()=>typeof window.pendingCsvBytes==='function');
      await input.setInputFiles({name:'new-valid.csv',mimeType:'text/csv',buffer:Buffer.from('unit,A\ncurrent,1')});
      await page.waitForFunction(()=>document.querySelector('[role="dialog"]')?.textContent.includes('current'));
      await page.evaluate(()=>window.pendingCsvBytes());
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      assert.equal(await page.getByRole('alert').count(),0);
      assert.ok((await page.getByRole('dialog').textContent()).includes('current'));
      assert.equal(await page.locator('.open-ena-workbench').getAttribute('aria-busy'),'false');
      results.push({locale,case:'superseded-malformed-bytes',accepted:false,currentPreview:'current',alerts:[]});
    }
    await page.screenshot({path:path.join(directory,locale+'.png')});await page.close();
  }
}finally{await browser.close();}
assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
const files=['components/open-ena/OpenEnaWorkspace.tsx','lib/open-ena-i18n.ts','tests/review-csv-utf8-browser.mjs'];
const source=await Promise.all(files.map(async file=>({path:file,sha256:createHash('sha256').update(await readFile(file)).digest('hex')})));
await writeFile(path.join(directory,'report.json'),JSON.stringify({status:'PASS',cases:results.length,results,errors,externalRequests:requests,source,browserClosed:true,limits:['Literal U+FFFD is verified only in source preview; existing typed XLSX roundtrip rejection is unchanged.','No scientific corruption claim; malformed CSV previously failed during typed source conversion.']},null,2)+'\n');
console.log(`PASS ${results.length} mounted Workspace CSV admission/recovery cases`);
