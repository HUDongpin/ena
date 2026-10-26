import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createOpenEnaAiInterpretationPostHandler } from '../lib/server/open-ena-ai-interpretation-route';
import { MemoryBillableStore } from '../lib/server/open-ena-billable';
import { parseOpenEnaAiInterpretationRequest } from '../lib/open-ena/ai-interpretation';

process.chdir(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const LEGACY_ID = 'aiop-11111111-1111-4111-8111-111111111111';
const bundle = await build({
  stdin: { contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import Ai from './components/open-ena/OpenEnaAiInterpretation';
    import {openEnaAiOperationOwnerKey} from './lib/open-ena/ai-operation-owner';
    const owner=openEnaAiOperationOwnerKey('synthetic-request-scope');
    import {openEnaAiOperationScope,openEnaAiOperationStore} from './lib/open-ena/ai-operation-storage';
    import {getOpenEnaCopy} from './lib/open-ena-i18n';
    import {interpretationRequest} from './tests/helpers/ai-interpretation-request-v2';
    window.fixtureRequest=interpretationRequest();
    window.reverseFixtureKeys=function reverse(value){return Array.isArray(value) ? value.map(reverse)
      : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([k,v])=>[k,reverse(v)])) : value;};
    let root=createRoot(document.getElementById('root'));
    window.mountAi=(request=window.fixtureRequest,identity=JSON.stringify(request.binding))=>{
      window.currentOperation=()=>openEnaAiOperationStore.read(openEnaAiOperationScope(request,owner));
      root.render(<Ai operationOwnerKey={owner} request={request} localScientificIdentity={identity} copy={getOpenEnaCopy('en').aiInterpretation} disabled={false} disabledReason=''/>);
    };
    window.remountAi=()=>{root.unmount();root=createRoot(document.getElementById('root'));window.mountAi();};
    window.prepareStorage?.(window.fixtureRequest, openEnaAiOperationScope(window.fixtureRequest,owner).key);
    window.mountAi();
  `, loader: 'tsx', resolveDir: process.cwd() },
  bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic', write: false, logLevel: 'silent',
});
const browser = await chromium.launch({ headless: true });
const results: unknown[] = [];
try {
  for (const scenario of ['locale', 'dataset-binding', 'round-trip-evidence', 'storage-unavailable', 'storage-quota',
    'same-wire-local-epoch', 'remount', 'reload', 'reordered', 'hash-case', 'legacy-migration', 'legacy-quota-renewal', 'invalid-legacy', 'invalid-current', 'legacy-quota-roundtrip']) {
    const page = await browser.newPage();
    const errors: string[] = [], external: string[] = [];
    const calls: { operationId: string | null; body: any; status: number }[] = [], generations: unknown[] = [];
    const handler = createOpenEnaAiInterpretationPostHandler({
      verifyPrincipal: () => ({ principalRef: 'synthetic-request-scope' }), authConfigurationReady: () => true, environment: {},
      providerDescriptor: () => ({ provider: 'deepseek', model: 'deepseek-flash' }), parseRequest: parseOpenEnaAiInterpretationRequest,
      billableStore: new MemoryBillableStore(), limits: { minuteRequests: 20, dailyMicroUsd: 10000, monthlyMicroUsd: 10000,
        globalMonthlyMicroUsd: 10000, providerMonthlyMicroUsd: 10000, maxConcurrency: 2, maxReservationMicroUsd: 99,
        longitudinalMaxReservationMicroUsd: 99, alertThresholds: [50, 80, 100] },
      generate: async request => {
        generations.push(request);
        if (scenario === 'legacy-quota-renewal' && generations.length === 1) {
          throw Object.assign(new Error('synthetic pre-dispatch failure'), { code: 'invalid-configuration', providerDispatched: false });
        }
        throw Object.assign(new Error('synthetic known dispatched failure'), { code: 'upstream-network', providerDispatched: true });
      },
    });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== 'http://localhost:32166') { external.push(url.href); return route.abort(); }
      if (url.pathname !== '/api/open-ena/ai-interpretation') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="root"></div>' });
      const headers = new Headers(request.headers());
      headers.set('cookie', 'open-ena-session=synthetic-not-real'); headers.set('origin', url.origin);
      const response = await handler(new Request(url.href, { method: 'POST', headers, body: request.postData() }));
      calls.push({ operationId: headers.get('x-open-ena-ai-operation-id'), body: JSON.parse(request.postData()!), status: response.status });
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
    });
    await page.goto('http://localhost:32166/');
    await page.evaluate(({ scenario, legacyId }) => {
      window.prepareStorage = (request, key) => {
        if (scenario.startsWith('legacy-')) sessionStorage.setItem('open-ena-ai-operation-v2:' + request.binding.evidenceKey, legacyId);
        if (scenario === 'invalid-legacy') sessionStorage.setItem('open-ena-ai-operation-v2:' + request.binding.evidenceKey, 'synthetic malformed ID');
        if (scenario === 'invalid-current') sessionStorage.setItem(key, 'synthetic malformed ID');
        if (scenario === 'storage-unavailable') {
          for (const method of ['getItem', 'setItem', 'removeItem']) Storage.prototype[method] = () => { throw new DOMException('Synthetic denied storage', 'SecurityError'); };
        } else if (scenario === 'storage-quota' || scenario.startsWith('legacy-quota-')) {
          Storage.prototype.setItem = () => { throw new DOMException('Synthetic full storage', 'QuotaExceededError'); };
        }
      };
    }, { scenario, legacyId: LEGACY_ID });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const actions: {explicitNew:boolean;priorOperation:string|null}[]=[];
    const generate = async () => {
      const main=page.locator('.ena-ai-actions button').first();
      const explicitNew=await main.isDisabled();
      const priorOperation=await page.evaluate(()=>window.currentOperation());
      if(explicitNew){
        assert.match(await page.locator('[data-ena-ai-new-generation-warning]').innerText(),/may incur additional charges/);
        await page.getByRole('button',{name:'Generate a new interpretation',exact:true}).click();
      }else await main.click();
      actions.push({explicitNew,priorOperation});
    };
    const waitCalls = async (count: number) => {
      const deadline = Date.now() + 5000;
      while (calls.length < count && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
      assert.equal(calls.length, count, `${scenario}: native API call count`);
      await page.getByRole('alert').waitFor();
    };
    await page.getByRole('checkbox').check(); await generate(); await waitCalls(1);
    // The separate action carries the cost warning and is the only way to replace a settled ID.
    await generate(); await waitCalls(2);
    if (scenario === 'reload') {
      await page.reload(); await page.addScriptTag({ content: bundle.outputFiles[0].text });
    } else if (scenario === 'remount' || scenario === 'legacy-migration') await page.evaluate(() => window.remountAi());
    else await page.evaluate(scenario => {
      let request = structuredClone(window.fixtureRequest);
      if (scenario === 'locale' || scenario === 'legacy-quota-roundtrip') request.locale = 'zh-hant';
      if (scenario === 'dataset-binding') request.binding.datasetHash = 'c'.repeat(64);
      if (scenario === 'hash-case') request.binding.datasetHash = request.binding.datasetHash.toUpperCase();
      if (scenario === 'reordered') {
        request = window.reverseFixtureKeys(request);
      }
      if (['round-trip-evidence', 'storage-unavailable', 'storage-quota'].includes(scenario)) {
        request.evidence.descriptive.groups[0].meanCoordinates['axis-1'] = 0.4;
        let hash = 0x811c9dc5; const text = JSON.stringify(request.evidence);
        for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 0x01000193); }
        request.binding.evidenceKey = 'fnv1a32-' + (hash >>> 0).toString(16).padStart(8, '0');
      }
      window.mountAi(request, scenario === 'same-wire-local-epoch' ? 'different-local-epoch' : undefined);
    }, scenario);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const noAutomaticGeneration = calls.length === 2;
    await page.getByRole('checkbox').check(); await generate(); await waitCalls(3);
    let returnedRequest = null;
    if (['round-trip-evidence', 'storage-unavailable', 'storage-quota', 'legacy-quota-roundtrip'].includes(scenario)) {
      await page.evaluate(() => window.mountAi(window.fixtureRequest));
      await page.waitForFunction(() => !document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked);
      await page.getByRole('checkbox').check(); await generate(); await waitCalls(4);
      returnedRequest = {
        retainedBeforeExplicitAction: actions[3].priorOperation === calls[1].operationId && actions[3].explicitNew,
        replacedAfterExplicitAction: calls[3].operationId !== calls[1].operationId && calls[3].operationId !== calls[2].operationId,
        status: calls[3].status,
      };
    }
    const changed = ['locale', 'dataset-binding', 'round-trip-evidence', 'storage-unavailable', 'storage-quota', 'legacy-quota-roundtrip'].includes(scenario);
    const legacyRenewal = scenario === 'legacy-quota-renewal';
    const currentRetryProtected = legacyRenewal
      ? calls[0].operationId === LEGACY_ID && calls[0].status === 503 && calls[1].operationId !== LEGACY_ID && calls[1].status === 502
      : calls[0].operationId !== calls[1].operationId && calls[0].status === 502 && calls[1].status === 502 && actions[1].explicitNew;
    const requestScopeCorrect = changed
      ? calls[2].operationId !== calls[1].operationId && calls[2].status === 502 && !actions[2].explicitNew
        && generations.length === (returnedRequest ? 4 : 3)
        && (!returnedRequest || returnedRequest.retainedBeforeExplicitAction && returnedRequest.replacedAfterExplicitAction && returnedRequest.status === 502)
      : actions[2].priorOperation === calls[1].operationId && actions[2].explicitNew
        && calls[2].operationId !== calls[1].operationId && calls[2].status === 502 && generations.length === 3;
    const storage = await page.evaluate(() => {
      try { return Object.entries(sessionStorage); } catch { return null; }
    });
    const malformedLegacyUnchanged = scenario !== 'invalid-legacy' || storage?.some(([key,value]) => /^open-ena-ai-operation-v2:fnv1a32-[a-f0-9]{8}$/.test(key) && value === 'synthetic malformed ID');
    const opaqueStorage = storage === null || storage.every(([key, value]) => {
      if (scenario === 'invalid-legacy' && /^open-ena-ai-operation-v2:fnv1a32-[a-f0-9]{8}$/.test(key)) return value === 'synthetic malformed ID';
      if (/^open-ena-ai-operation-v4:[a-f0-9]{64}:[a-f0-9]{64}$/.test(key)) return value === 'closed' || /^aiop-[a-f0-9-]{36}$/.test(value);
      if (/^open-ena-ai-operation-v4:[a-f0-9]{64}:[a-f0-9]{64}:settled-retry$/.test(key)) return value === '' || /^aiop-[a-f0-9-]{36}$/.test(value);
      if (/^open-ena-ai-legacy-claim-v4:[a-f0-9]{64}:[a-f0-9]{64}$/.test(key)) return /^open-ena-ai-operation-v4:[a-f0-9]{64}:[a-f0-9]{64}$/.test(value);
      return scenario.startsWith('legacy-') && /^open-ena-ai-operation-v2:fnv1a32-[a-f0-9]{8}$/.test(key) && value === LEGACY_ID;
    });
    const legacyPreserved = !scenario.startsWith('legacy-') || calls[0].operationId === LEGACY_ID;
    const passed = currentRetryProtected && requestScopeCorrect && noAutomaticGeneration && opaqueStorage && malformedLegacyUnchanged && legacyPreserved && errors.length === 0 && external.length === 0;
    results.push({ scenario, passed, currentRetryProtected, requestScopeCorrect, noAutomaticGeneration, opaqueStorage, malformedLegacyUnchanged, legacyPreserved,
      operations: calls.map(c => c.operationId), statuses: calls.map(c => c.status), actions, generationCalls: generations.length, returnedRequest,
      storageKeys: storage?.map(([key]) => key), errors, external });
    console.log(JSON.stringify(results.at(-1))); await page.close();
  }
} finally { await browser.close(); }
if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(results, null, 2) + '\n');
assert.ok(results.every((result: any) => result.passed), 'Retry identity must belong to the normalized reviewed wire across request changes and browser lifecycle');
