import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";

const rootPath = process.cwd();
const bundle = await build({
  stdin: { contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import Workbench, { getOpenEnaLongitudinalV3Copy } from './components/open-ena/OpenEnaLongitudinalWorkbenchV3';
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
    const locale = new URL(location.href).searchParams.get('locale') || 'en';
    window.trajectoryCopy = getOpenEnaLongitudinalV3Copy(locale);
    window.localRuns = [];
    window.holdPreparation = true;
    const root = createRoot(document.getElementById('root'));
    window.rerender = () => root.render(<Workbench locale={locale} result={result} config={config}
      dataset={dataset} datasetHash={datasetHash} modelResultStale={false}
      analysisControls={null} analysisControlsMode="plot"/>);
    window.rerender();
  `, loader: "tsx", resolveDir: rootPath },
  bundle: true, format: "iife", platform: "browser", jsx: "automatic", write: false, logLevel: "silent",
  plugins: [{
    name: "bounded-trajectory-fixture",
    setup(plugin) {
      plugin.onResolve({ filter: /^@\/lib\/open-ena\/longitudinal-v3(-client)?$/ }, ({ path }) => ({ path, namespace: "trajectory-test" }));
      plugin.onLoad({ filter: /./, namespace: "trajectory-test" }, ({ path }) => {
        const real = `${rootPath}/lib/open-ena/${path.endsWith("-client") ? "longitudinal-v3-client" : "longitudinal-v3"}.ts`;
        // The component and remote execution client are real. A conservative
        // receipt selects remote admission without building a huge dataset.
        // Only preparation timing and local execution are held by the fixture.
        return { contents: path.endsWith("-client") ? `
          export * from ${JSON.stringify(real)};
          import { executeOpenEnaLongitudinalPreparedV3 as execute } from ${JSON.stringify(real)};
          export function executeOpenEnaLongitudinalPreparedV3(request, options) {
            const remoteSized = structuredClone(request);
            remoteSized.dataset.receipt.rows = 500000;
            remoteSized.dataset.receipt.limits.maxRows = 500000;
            remoteSized.dataset.receipt.limits.maxCells = 500000 * remoteSized.dataset.receipt.columns;
            return execute(remoteSized, {
              ...options,
              nodeExecutor: localRequest => new Promise((resolve, reject) => {
                window.localRuns.push(localRequest);
                options.signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), {once:true});
              }),
            });
          }
        ` : `
          export * from ${JSON.stringify(real)};
          import { buildOpenEnaLongitudinalExecutionRequestV3 as prepare } from ${JSON.stringify(real)};
          export async function buildOpenEnaLongitudinalExecutionRequestV3(input) {
            if (window.holdPreparation) await new Promise(resolve => { window.releasePreparation = resolve; });
            return prepare(input);
          }
        `, loader: "js", resolveDir: rootPath };
      });
    },
  }],
});

const browser = await chromium.launch({ headless: true });
try {
  for (const locale of ["en", "zh-hans", "zh-hant"]) {
    for (const [httpStatus, code] of [[401, "AUTHENTICATION_REQUIRED"], [429, "RATE_LIMITED"], [400, "INVALID_LONGITUDINAL_TASK"], [403, "INVALID_REQUEST_ORIGIN"], [503, "REMOTE_SERVICE_UNAVAILABLE"]]) {
      const page = await browser.newPage();
      const requests = [], errors = [];
      let releaseResponse;
      const responseGate = new Promise(resolve => { releaseResponse = resolve; });
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/*", async route => {
        if (new URL(route.request().url()).pathname !== "/api/open-ena/longitudinal") {
          return route.fulfill({ contentType: "text/html", body: '<!doctype html><main id="root"></main>' });
        }
        requests.push(route.request().postDataJSON());
        if (requests.length === 1) await responseGate;
        return route.fulfill({
          status: httpStatus, contentType: "application/json",
          headers: httpStatus === 429 ? { "retry-after": "60" } : {},
          body: JSON.stringify({ error: { code, message: "Private server prose must not appear" } }),
        });
      });
      await page.goto(`http://localhost:32195/?locale=${locale}`);
      await page.clock.install();
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      const copy = await page.evaluate(() => window.trajectoryCopy);
      const statusLabel = page.locator(".ena-longitudinal-v3-run-status > strong");
      const waitForState = async state => {
        await page.locator(`.ena-longitudinal-v3-run-status > [data-state="${state}"]`).waitFor({ state: "attached" });
        assert.equal(await statusLabel.innerText(), copy.workbenchStatus[state], `${locale}/${httpStatus}/${state}`);
      };
      await waitForState("ready");
      await page.getByRole("button", { name: copy.run, exact: true }).click();
      await waitForState("preparing");
      await page.waitForFunction(() => typeof window.releasePreparation === "function");
      await page.evaluate(() => { window.holdPreparation = false; window.releasePreparation(); });
      await waitForState("remote-confirmation");
      assert.equal(requests.length, 0, "remote admission still requires explicit confirmation");
      await page.getByRole("button", { name: copy.confirmRemote, exact: true }).click();
      await waitForState("running");
      releaseResponse();
      await waitForState("remote-recovery");
      const recovery = page.locator(".ena-longitudinal-v3-remote");
      assert.equal(requests.length, 1);
      assert.equal((await recovery.innerText()).includes("Private server prose"), false);
      const retry = recovery.getByRole("button", { name: copy.retryRemote, exact: true });
      if (httpStatus === 401) {
        const signIn = recovery.locator('[data-trajectory-recovery="sign-in"]');
        assert.equal(await signIn.getAttribute("target"), "_blank");
        assert.equal(await signIn.getAttribute("rel"), "noopener noreferrer");
        assert.equal(await signIn.getAttribute("href"), `/?locale=${locale}`);
        assert.ok((await recovery.innerText()).includes(copy.remoteSessionExpired));
        assert.equal(await retry.count(), 0);
      } else if (httpStatus === 400 || httpStatus === 403) {
        assert.equal(await retry.count(), 0);
        assert.ok((await recovery.innerText()).includes(httpStatus === 403 ? copy.remoteForbidden : copy.remoteRequestInvalid));
      } else {
        if (httpStatus === 429) {
          assert.equal(await retry.isDisabled(), true);
          await page.clock.fastForward(30_000);
          await page.evaluate(() => window.rerender());
          assert.equal(await retry.isDisabled(), true, "rerender must not reset or bypass the wait");
          const secondsRemaining = Number((await recovery.innerText()).match(/\d+/)?.[0]);
          assert.ok(secondsRemaining > 0 && secondsRemaining <= 30);
          assert.equal(requests.length, 1);
          // Run/Recompute is a separate entry to the same remote submission.
          // It must retain the server wait even after replacing the recovery UI.
          await page.getByRole("button", { name: copy.run, exact: true }).click();
          await waitForState("remote-confirmation");
          await page.getByRole("button", { name: copy.confirmRemote, exact: true }).click();
          await waitForState("remote-recovery");
          assert.equal(requests.length, 1, "Run → Confirm remote must not bypass the outstanding Retry-After");
          assert.equal(await retry.isDisabled(), true);
          assert.ok(Number((await recovery.innerText()).match(/\d+/)?.[0]) <= secondsRemaining,
            "alternate entry must not reset the received deadline");
          await recovery.getByRole("button", { name: copy.continueLocal, exact: true }).click();
          await waitForState("running");
          await page.waitForFunction(() => window.localRuns.length === 1);
          await page.getByRole("button", { name: copy.cancel, exact: true }).click();
          await waitForState("ready");
          await page.getByRole("button", { name: copy.run, exact: true }).click();
          await waitForState("remote-confirmation");
          await page.getByRole("button", { name: copy.confirmRemote, exact: true }).click();
          await waitForState("remote-recovery");
          assert.equal(requests.length, 1, "cancelling a local recovery must retain the server wait");
          await page.clock.fastForward(31_000);
          await page.waitForFunction(() => !Array.from(document.querySelectorAll('.ena-longitudinal-v3-remote button')).find(button => button.textContent === window.trajectoryCopy.retryRemote)?.disabled);
          assert.equal(requests.length, 1, "an expired wait must not retry automatically");
        }
        assert.equal(await retry.isDisabled(), false);
        await retry.click();
        await waitForState("remote-recovery");
        assert.equal(requests.length, 2);
        assert.deepEqual(requests[1].request, requests[0].request, "explicit retry reuses the same immutable scientific task");
        assert.notEqual(requests[1].executionAttemptId, requests[0].executionAttemptId);
        if (httpStatus === 429) {
          await recovery.getByRole("button", { name: copy.disableHeavy, exact: true }).click();
          await waitForState("remote-confirmation");
          await page.getByRole("button", { name: copy.confirmRemote, exact: true }).click();
          await waitForState("remote-recovery");
          assert.equal(requests.length, 2, "removing inference cannot bypass a renewed server wait");
        }
      }
      const remoteCalls = requests.length;
      const previousLocalRuns = await page.evaluate(() => window.localRuns.length);
      await recovery.getByRole("button", { name: copy.continueLocal, exact: true }).click();
      await waitForState("running");
      await page.waitForFunction(previous => window.localRuns.length === previous + 1, previousLocalRuns);
      assert.equal(requests.length, remoteCalls, "local recovery must not submit another remote request");
      await page.getByRole("button", { name: copy.cancel, exact: true }).click();
      await waitForState("ready");
      assert.deepEqual(errors, []);
      await page.close();
    }
  }
  console.log("Trajectory status and explicit HTTP recovery passed for 15 Chromium locale/status scenarios.");
} finally {
  await browser.close();
}
