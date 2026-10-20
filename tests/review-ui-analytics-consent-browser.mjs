import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const require = createRequire(path.join(root, 'package.json'));
const { build } = require('esbuild');
const { chromium } = require('playwright');
const input = path.join(root, 'components/AnalyticsConsent.tsx');
const source = `import React from 'react';
import { createRoot } from 'react-dom/client';
import AnalyticsConsent from ${JSON.stringify(input)};
import AnalyticsConsentControl from ${JSON.stringify(path.join(root, 'components/AnalyticsConsentControl.tsx'))};
function App(){const[disabled,setDisabled]=React.useState(false);window.setDisabled=setDisabled;return <><AnalyticsConsent disabled={disabled}/><AnalyticsConsentControl copy={{enable:'Enable analytics',disable:'Disable analytics'}}/></>}
const root=createRoot(document.querySelector('#root'));window.unmountAnalytics=()=>root.unmount();root.render(<App/>);`;
const navigation = `export const usePathname=()=>window.location.pathname;export const useSearchParams=()=>new URLSearchParams(window.location.search);export const useParams=()=>({});`;
const compiled = await build({ stdin: { contents: source, loader: 'tsx', resolveDir: root }, bundle: true, nodePaths: [path.join(root, "node_modules")], write: false, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, metafile: true, plugins: [{ name: 'isolated-router', setup(builder) { builder.onResolve({ filter: /^next\/navigation(?:\.js)?$/ }, () => ({ path: 'navigation', namespace: 'review' })); builder.onLoad({ filter: /.*/, namespace: 'review' }, () => ({ contents: navigation })); builder.onResolve({ filter: /^@\// }, args => ({ path: path.join(root, args.path.slice(2) + (args.path.endsWith('analytics-consent') ? '.ts' : '')) })); } }] });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { startedAt: new Date().toISOString(), scope: 'Actual React controls and installed @vercel/analytics SDK; owned synthetic script retains beforeSend callback. No provider traffic.', source: [], checks: [] };
for (const name of Object.keys(compiled.metafile.inputs).filter(name => name !== '<stdin>' && !name.startsWith('review:'))) {
  const bytes = await readFile(path.resolve(root, name));
  report.source.push({ path: name, sha256: hash(bytes), bytes: bytes.length });
}
const browser = await chromium.launch({ headless: true });
try {
  for (const test of ['ordinary-opt-out','failed-storage-opt-out','runtime-disabled','unmounted','failed-storage-opt-out-toggle','synchronous-opt-out','restricted-workspace','sanitize-query','cross-origin']) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const result = { name: test, errors: [], requests: [] };
    page.on('pageerror', error => result.errors.push(error.message));
    try {
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        assert.equal(url.origin, 'http://localhost:32551');
        result.requests.push(url.pathname);
        if (url.pathname === '/_vercel/insights/script.js') return route.fulfill({ contentType: 'text/javascript', body: `window.__analyticsCallbacks=[];const receiver=(kind,callback)=>{if(kind==='beforeSend')window.__analyticsCallbacks.push(callback)};(window.vaq||[]).forEach(args=>receiver(...args));window.va=receiver;` });
        assert.equal(url.pathname, '/en');
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><main id="root"></main>' });
      });
      await page.goto('http://localhost:32551/en');
      await page.evaluate(() => localStorage.setItem('open-ena-analytics-consent-v1','granted'));
      await page.addScriptTag({ content: compiled.outputFiles[0].text });
      await page.waitForFunction(() => window.__analyticsCallbacks?.length > 0);
      const invoke = url => page.evaluate(value => window.__analyticsCallbacks[0]({ type: 'pageview', url: value }), url);
      assert.deepEqual(await invoke('http://localhost:32551/en'), { type:'pageview', url:'http://localhost:32551/en' });
      if (test.includes('opt-out')) {
        if (test === 'synchronous-opt-out') await page.evaluate(() => {
          window.addEventListener('open-ena-analytics-consent-change',() => {window.__immediate=window.__analyticsCallbacks[0]({type:'pageview',url:location.href});});
        });
        if (test.startsWith('failed-storage-opt-out') || test === 'synchronous-opt-out') await page.evaluate(() => {
          const original = Storage.prototype.setItem;
          Storage.prototype.setItem = function(key,value) {
            if (key === 'open-ena-analytics-consent-v1' && value === 'denied') throw new DOMException('Synthetic quota fault','QuotaExceededError');
            return original.call(this,key,value);
          };
        });
        await page.getByRole('button', {name:'Disable analytics'}).click();
        await page.getByRole('button', {name:'Enable analytics'}).waitFor();
        if (test === 'failed-storage-opt-out-toggle') {
          await page.evaluate(()=>window.setDisabled(true));
          await page.waitForFunction(()=>!document.querySelector('script[data-sdkn]'));
          await page.evaluate(()=>window.setDisabled(false));
          await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        }
        result.stored = await page.evaluate(() => localStorage.getItem('open-ena-analytics-consent-v1'));
        result.actual = await invoke('http://localhost:32551/en');
        assert.equal(result.actual, null);
        if(test === 'synchronous-opt-out')assert.equal(await page.evaluate(()=>window.__immediate),null);
        if(test === 'failed-storage-opt-out-toggle'){
          await page.getByRole('button',{name:'Enable analytics'}).click();
          await page.getByRole('button',{name:'Disable analytics'}).waitFor();
          assert.deepEqual(await invoke('http://localhost:32551/en'),{type:'pageview',url:'http://localhost:32551/en'});
        }
      } else if (test === 'runtime-disabled') {
        await page.evaluate(() => window.setDisabled(true));
        await page.waitForFunction(() => !document.querySelector('script[data-sdkn]'));
        result.actual = await invoke('http://localhost:32551/en');
        assert.equal(result.actual, null);
      } else if (test === 'unmounted') {
        await page.evaluate(() => window.unmountAnalytics());
        assert.equal(await invoke('http://localhost:32551/en'),null);
      } else if (test === 'restricted-workspace') {
        await page.evaluate(() => history.replaceState(null,'','/en/open-ena'));
        assert.equal(await invoke('http://localhost:32551/en/open-ena'), null);
      } else if (test === 'sanitize-query') {
        assert.deepEqual(await invoke('http://localhost:32551/en?private=synthetic#synthetic'), {type:'pageview',url:'http://localhost:32551/en'});
      } else assert.equal(await invoke('https://example.invalid/path'),null);
      assert.deepEqual(result.errors, []);
      result.pass = true;
    } catch (error) { result.pass = false; result.failure = String(error.stack || error); }
    finally { await context.close(); result.closed = true; }
    report.checks.push(result);
  }
} finally { await browser.close(); report.browserClosed = true; }
report.finishedAt = new Date().toISOString();
report.passed = report.checks.filter(item => item.pass).length;
report.failed = report.checks.length - report.passed;
if (process.env.OPEN_ENA_REVIEW_REPORT) await writeFile(process.env.OPEN_ENA_REVIEW_REPORT,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,failed:report.failed,checks:report.checks},null,2));
if(report.failed)process.exitCode=1;
