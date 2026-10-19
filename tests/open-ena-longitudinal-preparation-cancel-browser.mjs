import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";

const rootPath = process.cwd();
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import OpenEnaLongitudinalWorkbenchV3 from './components/open-ena/OpenEnaLongitudinalWorkbenchV3';
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
 root.render(<OpenEnaLongitudinalWorkbenchV3 locale="en" result={result} config={config}
  dataset={dataset} datasetHash={datasetHash} modelResultStale={false} analysisControlsMode="plot"/>);
};
window.unmountWorkbench = () => root.unmount();
window.mountWorkbench();
`;

// Keep the real preparation/validation and component. Only its asynchronous
// completion timing and execution boundary are controlled; no Worker or fetch
// is permitted by this credential-free browser fixture.
const bundle = await build({
  stdin: { contents: entry, loader: "tsx", resolveDir: rootPath },
  bundle: true, format: "iife", platform: "browser", jsx: "automatic", write: false, logLevel: "silent",
  plugins: [{
    name: "controlled-trajectory-boundaries",
    setup(plugin) {
      plugin.onResolve({ filter: /^@\/lib\/open-ena\/longitudinal-v3(-client)?$/ }, ({ path }) => ({ path, namespace: "trajectory-test" }));
      plugin.onLoad({ filter: /./, namespace: "trajectory-test" }, ({ path }) => {
        const real = `${rootPath}/lib/open-ena/${path.endsWith("-client") ? "longitudinal-v3-client" : "longitudinal-v3"}.ts`;
        const contents = path.endsWith("-client") ? `
export * from ${JSON.stringify(real)};
import { estimateOpenEnaLongitudinalExecutionV3, OpenEnaLongitudinalExecutionClientErrorV3 } from ${JSON.stringify(real)};
export async function executeOpenEnaLongitudinalPreparedV3(request, options) {
 const execution = {request, signal:options.signal};
 window.executions.push(execution);
 if (window.remoteConfirmation) throw new OpenEnaLongitudinalExecutionClientErrorV3(
  'REMOTE_CONFIRMATION_REQUIRED','Synthetic confirmation gate',estimateOpenEnaLongitudinalExecutionV3(request),
  {canContinueLocally:true,canDisableInference:true});
 return new Promise((resolve,reject) => {
  execution.resolve = resolve;
  options.signal.addEventListener('abort',() => reject(new DOMException('Cancelled','AbortError')),{once:true});
 });
}
` : `
export * from ${JSON.stringify(real)};
import * as real from ${JSON.stringify(real)};
async function prepare(kind, input) {
 try {
  if (window.holdPreparation) await new Promise((resolve,reject) => window.preparations.push({kind,resolve,reject}));
  return await real[kind](input);
 } finally { window.completedPreparations += 1; }
}
export const buildOpenEnaLongitudinalExecutionRequestV3 = input => prepare('buildOpenEnaLongitudinalExecutionRequestV3',input);
export const withoutOpenEnaLongitudinalInferencePreparedV3 = input => prepare('withoutOpenEnaLongitudinalInferencePreparedV3',input);
`;
        return { contents, loader: "js", resolveDir: rootPath };
      });
    },
  }],
});

const browser = await chromium.launch({ headless: true });
const failures = [];
try {
  for (const branch of ["run", "without-inference"]) {
    for (const action of ["cancel", "unmount"]) {
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) => route.fulfill({ contentType: "text/html", body: '<!doctype html><html><body><main id="root"></main></body></html>' }));
      await page.goto("http://localhost:31995/");
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      const status = () => page.locator('.ena-longitudinal-v3-run-status > [data-state]').getAttribute("data-state");
      await page.waitForFunction(() => document.querySelector('[data-state="ready"]'));
      if (branch === "without-inference") {
        await page.evaluate(() => { window.remoteConfirmation = true; });
        await page.getByRole("button", { name: "Run trajectory analysis", exact: true }).click();
        await page.waitForFunction(() => document.querySelector('[data-state="remote-confirmation"]'));
      }
      const previousExecutions = await page.evaluate(() => window.executions.length);
      const previousCompletions = await page.evaluate(() => window.completedPreparations);
      await page.evaluate(() => { window.holdPreparation = true; window.remoteConfirmation = false; });
      await page.getByRole("button", { name: branch === "run" ? "Run trajectory analysis" : "Run without inference", exact: true }).click();
      await page.waitForFunction(() => window.preparations.length === 1);
      assert.equal(await status(), "preparing");
      if (action === "cancel") {
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        assert.equal(await status(), "ready", "Cancel restores readiness before preparation finishes");
      } else await page.evaluate(() => window.unmountWorkbench());
      await page.evaluate(() => window.preparations[0].resolve());
      await page.waitForFunction((count) => window.completedPreparations > count, previousCompletions);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      try {
        assert.equal(await page.evaluate(() => window.executions.length), previousExecutions,
          `${branch}/${action}: obsolete preparation must never start execution`);
        if (action === "cancel") {
          assert.equal(await status(), "ready", "obsolete completion cannot replace the ready state");
          await page.evaluate(() => { window.holdPreparation = false; });
          await page.getByRole("button", { name: "Run trajectory analysis", exact: true }).click();
          await page.waitForFunction((count) => window.executions.length > count, previousExecutions);
          assert.equal(await status(), "running", "a fresh explicit run remains usable after cancellation");
          assert.equal(await page.evaluate(() => window.executions.at(-1).signal.aborted), false);
          await page.getByRole("button", { name: "Cancel", exact: true }).click();
          assert.equal(await page.evaluate(() => window.executions.at(-1).signal.aborted), true,
            "Cancel still aborts an already-started execution");
          assert.equal(await status(), "ready");
        }
        assert.deepEqual(errors, []);
      } catch (error) { failures.push(error.message); }
      await page.close();
    }
  }
  assert.deepEqual(failures, []);
  console.log("Trajectory preparation cancellation and unmount suppress late execution in both preparation paths.");
} finally {
  await browser.close();
}
