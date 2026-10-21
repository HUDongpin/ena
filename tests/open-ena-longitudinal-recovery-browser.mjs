import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import { chromium } from "playwright";

const rootPath = process.cwd();
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import OpenEnaLongitudinalWorkbenchV3, {getOpenEnaLongitudinalV3Copy} from './components/open-ena/OpenEnaLongitudinalWorkbenchV3';
import { analyzeDataset, bindOpenEnaResultProvenance } from './lib/open-ena/analyze';
const dataset = {
 name:'synthetic-trajectory.csv', headers:['Group','Speaker','Period','A','B','C','D'],
 rows:[
  {Group:'A',Speaker:'a1',Period:1,A:1,B:1,C:0,D:0},
  {Group:'A',Speaker:'a1',Period:2,A:0,B:1,C:1,D:0},
  {Group:'A',Speaker:'a1',Period:3,A:0,B:0,C:1,D:1},
  {Group:'B',Speaker:'b1',Period:1,A:1,B:0,C:1,D:1},
  {Group:'B',Speaker:'b1',Period:2,A:1,B:1,C:0,D:1},
  {Group:'B',Speaker:'b1',Period:3,A:0,B:1,C:0,D:1},
 ], sizeBytes:512, source:'upload', hashKind:'normalized-utf8-csv-text-sha256',
};
const config = {
 analysisKind:'ena', unitColumns:['Group','Speaker'], conversationColumns:['Group','Speaker','Period'],
 groupColumn:'Group', codes:['A','B','C','D'], model:'SeparateTrajectory', window:'Conversation',
 windowSizeBack:5, windowSizeForward:0, weightBy:'binary', rotation:'svd', referenceRotationId:null,
 centerAlignToOrigin:true,
};
const datasetHash = '7'.repeat(64);
const result = bindOpenEnaResultProvenance(analyzeDataset(dataset,config),dataset,datasetHash,config);
window.preparations = [];
window.executions = [];
window.completedPreparations = 0;
window.holdPreparation = false;
window.remoteConfirmation = false;
let root;
window.mountWorkbench = () => {
 root = createRoot(document.getElementById('root'));
 root.render(<OpenEnaLongitudinalWorkbenchV3 locale={window.testLocale} result={result} config={config}
  dataset={dataset} datasetHash={datasetHash} modelResultStale={false} analysisControlsMode="plot"/>);
};
window.unmountWorkbench = () => root.unmount();
window.copy = getOpenEnaLongitudinalV3Copy(window.testLocale);
window.localRequests = [];
window.clockNow = Date.now();
Date.now = () => window.clockNow;
window.mountWorkbench();
`;

// Real component, preparation and HTTP client; a large synthetic row receipt
// selects remote routing. Only HTTP responses and the local executor are controlled.
const bundle = await build({
  stdin: { contents: entry, loader: "tsx", resolveDir: rootPath },
  bundle: true, format: "iife", platform: "browser", jsx: "automatic", write: false, logLevel: "silent",
  plugins: [{ name: "trajectory-recovery-boundaries", setup(plugin) {
    plugin.onResolve({ filter: /^@\/lib\/open-ena\/longitudinal-v3(-client)?$/ }, ({path}) => ({path, namespace:"recovery-test"}));
    plugin.onLoad({ filter: /./, namespace:"recovery-test" }, ({path}) => {
      const real = `${rootPath}/lib/open-ena/${path.endsWith("-client") ? "longitudinal-v3-client" : "longitudinal-v3"}.ts`;
      const contents = path.endsWith("-client") ? `
export * from ${JSON.stringify(real)};
import {executeOpenEnaLongitudinalPreparedV3 as execute} from ${JSON.stringify(real)};
export const executeOpenEnaLongitudinalPreparedV3 = (request, options) => execute(request, {
 ...options, nodeExecutor: async localRequest => {
  window.localRequests.push(localRequest);
  return new Promise((resolve,reject) => options.signal.addEventListener('abort',
   () => reject(new DOMException('Cancelled','AbortError')), {once:true}));
 }
});` : `
export * from ${JSON.stringify(real)};
import * as real from ${JSON.stringify(real)};
const large = prepared => {
 const next = structuredClone(prepared);
 next.request.dataset.receipt.rows = 500000;
 next.request.dataset.receipt.limits.maxRows = 500000;
 next.request.dataset.receipt.limits.maxCells = 500000 * next.request.dataset.receipt.columns;
 return next;
};
export const buildOpenEnaLongitudinalExecutionRequestV3 = async input => large(await real.buildOpenEnaLongitudinalExecutionRequestV3(input));
export const withoutOpenEnaLongitudinalInferencePreparedV3 = async input => large(await real.withoutOpenEnaLongitudinalInferencePreparedV3(input));`;
      return {contents,loader:"js",resolveDir:rootPath};
    });
  }}],
});
const browser = await chromium.launch({headless:true});
const receipts = [];
try {
  for (const locale of ["en","zh-hans","zh-hant"]) {
    for (const [httpStatus,code,copyKey] of [
      [401,"AUTHENTICATION_REQUIRED","remoteAuthRequired"],
      [429,"RATE_LIMITED","remoteRateLimitedWait"],
      [503,"BILLING_UNAVAILABLE","remoteBillingUnavailable"],
      [503,"REMOTE_SERVICE_UNAVAILABLE","remoteServiceUnavailable"],
      [400,"PRIVACY_BOUNDARY_VIOLATION","remotePrivacyRejected"],
      [400,"INVALID_LONGITUDINAL_TASK","remoteTaskRejected"],
      [403,"INVALID_REQUEST_ORIGIN","remoteOriginRejected"],
    ]) {
      const page = await browser.newPage();
      const errors = [];
      const submissions = [];
      page.on("pageerror",error => errors.push(error.message));
      await page.route("**/*", async route => {
        if (route.request().method() === "POST") {
          submissions.push(route.request().postDataJSON());
          await route.fulfill({status:httpStatus,contentType:"application/json",
            headers:code === "RATE_LIMITED" ? {"retry-after":"30"} : {},
            body:JSON.stringify({error:{code,message:"UNSAFE_SERVER_TEXT"}})});
        } else await route.fulfill({contentType:"text/html",body:'<!doctype html><main id="root"></main>'});
      });
      await page.goto("http://localhost:31995/");
      await page.evaluate(value => { window.testLocale=value; },locale);
      await page.addScriptTag({content:bundle.outputFiles[0].text});
      await page.waitForFunction(() => document.querySelector('[data-state="ready"]'));
      const copy = await page.evaluate(() => Object.fromEntries(Object.entries(window.copy).filter(([,value]) => typeof value === "string")));
      const button = name => page.getByRole("button",{name,exact:true});
      const state = expected => page.waitForFunction(value => document.querySelector(`[data-state="${value}"]`),expected);
      await button(copy.run).click();
      await state("remote-confirmation");
      assert.equal(submissions.length,0,"confirmation must not dispatch");
      await button(copy.confirmRemote).click();
      await state("remote-recovery");
      assert.equal(submissions.length,1);
      const alert = page.locator('.ena-longitudinal-v3-remote[role="alert"]');
      assert.equal((await alert.textContent()).includes("UNSAFE_SERVER_TEXT"),false);
      if (code !== "RATE_LIMITED") assert.ok((await alert.textContent()).includes(copy[copyKey]));
      if (httpStatus === 401) {
        const link = page.getByRole("link",{name:copy.signInAgain,exact:true});
        assert.equal(await link.getAttribute("href"),`/${locale}/open-ena`);
        assert.equal(await link.getAttribute("target"),"_blank");
        assert.equal(await button(copy.retryRemote).count(),0);
        assert.equal(await button(copy.run).isDisabled(),true);
        await button(copy.resumeAfterSignIn).click();
        await page.waitForFunction(() => document.querySelector('[data-state="remote-recovery"]'));
        assert.equal(submissions.length,2,"only explicit post-login action starts another attempt");
        assert.deepEqual(submissions[1].request,submissions[0].request,"post-login retry preserves scientific task");
      } else if (httpStatus === 429) {
        assert.equal(await button(copy.retryRemote).isDisabled(),true);
        await button(copy.run).click();
        await state("remote-recovery");
        assert.equal(submissions.length,1,"primary Run cannot bypass cooldown");
        await page.getByRole("radio",{name:copy.complete,exact:true}).check();
        await button(copy.run).click();
        await state("remote-recovery");
        assert.equal(submissions.length,1,"scientific edits cannot bypass cooldown");
        await button(copy.disableHeavy).click();
        await state("remote-recovery");
        assert.equal(submissions.length,1,"removing inference cannot bypass remaining memory-based remote routing");
        await page.evaluate(() => {window.clockNow += 31_000;});
        await page.waitForFunction(label => {
          const control=[...document.querySelectorAll('button')].find(el => el.textContent===label);
          return control && !control.disabled;
        },copy.retryRemote);
        assert.equal(submissions.length,1,"cooldown expiry must not submit automatically");
        await button(copy.retryRemote).click();
        await state("remote-recovery");
        assert.equal(submissions.length,2,"expired cooldown permits one explicit submission");
      } else {
        assert.equal(await button(copy.retryRemote).count(),0);
        assert.equal(await button(copy.run).isDisabled(),true,"same rejected task has no primary retry bypass");
      }
      const beforeLocal = submissions.length;
      await button(copy.continueLocal).click();
      await page.waitForFunction(() => window.localRequests.length===1);
      const local = await page.evaluate(() => window.localRequests[0]);
      const remote = submissions.at(-1).request;
      assert.deepEqual({...local,execution:{...local.execution,target:"persistent-compute-service"}},remote,
        "continue locally preserves the exact pending scientific request");
      assert.equal(submissions.length,beforeLocal);
      await button(copy.cancel).click();
      await state("ready");
      if (httpStatus === 429) {
        await button(copy.run).click();
        await state("remote-recovery");
        assert.equal(submissions.length,beforeLocal,"local cancellation does not clear cooldown");
      }
      assert.deepEqual(errors,[]);
      receipts.push({locale,httpStatus,code,submissions:submissions.length,localRequestPreserved:true,status:"pass"});
      await page.close();
    }
  }
  await mkdir("output/review-regressions/longitudinal-recovery",{recursive:true});
  await writeFile("output/review-regressions/longitudinal-recovery/receipt.json",JSON.stringify({status:"pass",synthetic:true,cases:receipts},null,2));
  console.log(`${receipts.length} localized trajectory recovery journeys passed, including cooldown admission and immutable local continuation.`);
} finally { await browser.close(); }
