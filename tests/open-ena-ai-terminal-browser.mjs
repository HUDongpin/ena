import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";

const bundle = await build({
  stdin: { contents: `
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import Ai from './components/open-ena/OpenEnaAiInterpretation';
    import { openEnaAiOperationOwnerKey } from './lib/open-ena/ai-operation-owner';
    import { openEnaAiOperationScope } from './lib/open-ena/ai-operation-storage';
    import { getOpenEnaCopy } from './lib/open-ena-i18n';
    import { interpretationRequest } from './tests/helpers/ai-interpretation-request-v2';
    const locale = new URL(location.href).searchParams.get('locale') || 'en';
    const copy = getOpenEnaCopy(locale).aiInterpretation;
    window.aiCopy = copy;
    function Harness() {
      const [request, setRequest] = useState(() => interpretationRequest(locale));
      const [owner, setOwner] = useState(() => openEnaAiOperationOwnerKey('terminal-owner'));
      window.changeRequest = () => setRequest(previous => ({...previous, binding: {...previous.binding, datasetHash: 'c'.repeat(64)}}));
      window.changeOwner = () => setOwner(openEnaAiOperationOwnerKey('another-terminal-owner'));
      window.scopeKey = openEnaAiOperationScope(request, owner).key;
      return <Ai request={request} operationOwnerKey={owner} copy={copy} disabled={false} disabledReason=""/>;
    }
    createRoot(document.getElementById('root')).render(<Harness/>);
  `, loader: "tsx", resolveDir: process.cwd() },
  bundle: true, format: "iife", platform: "browser", jsx: "automatic", write: false, logLevel: "silent",
});
const browser = await chromium.launch({ headless: true });
try {
  for (const locale of ["en", "zh-hant", "zh-hans"]) {
    for (const status of [502, 409]) {
      const page = await browser.newPage();
      const requests = [], errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/*", route => {
        if (new URL(route.request().url()).pathname !== "/api/open-ena/ai-interpretation") {
          return route.fulfill({ contentType: "text/html", body: '<!doctype html><div id="root"></div>' });
        }
        requests.push({ id: route.request().headers()["x-open-ena-ai-operation-id"], owner: route.request().headers()["x-open-ena-ai-owner"] });
        return route.fulfill({ status, contentType: "application/json", body: JSON.stringify({
          error: "Raw English provider or ledger failure", failureClass: "network", errorCode: "operation-not-retryable",
        }) });
      });
      await page.goto(`http://localhost:32194/?locale=${locale}`);
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      const copy = await page.evaluate(() => window.aiCopy);
      const generate = page.getByRole("button", { name: copy.generate, exact: true });
      await page.getByRole("checkbox").check();
      await generate.click();
      const alert = page.getByRole("alert");
      await alert.waitFor();
      assert.equal(await alert.getAttribute("data-ena-ai-recovery"), "review-request", `${locale} ${status}: terminal recovery`);
      assert.ok((await alert.innerText()).includes(copy.failureOperationNotRetryable));
      assert.equal((await alert.innerText()).includes("Raw English"), false);
      assert.ok((await alert.innerText()).includes(copy.evidenceBoundary));
      assert.equal(await alert.getByRole("button").count(), 0);
      assert.equal(await generate.isDisabled(), true);
      await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "alert");
      assert.equal(await page.evaluate(() => sessionStorage.getItem(window.scopeKey)), requests[0].id, "terminal recovery retains its operation identity");
      await generate.evaluate(button => button.click());
      assert.equal(requests.length, 1, "terminal UI cannot submit another request");

      await page.evaluate(() => window.changeRequest());
      await alert.waitFor({ state: "detached" });
      assert.equal(await page.getByRole("checkbox").isChecked(), false, "changed request requires review and consent again");
      await page.getByRole("checkbox").check();
      assert.equal(await generate.isDisabled(), false);
      await generate.click();
      await alert.waitFor();
      assert.equal(requests.length, 2);
      assert.notEqual(requests[1].id, requests[0].id, "changed reviewed request has its own operation");

      await page.evaluate(() => window.changeOwner());
      await alert.waitFor({ state: "detached" });
      await page.getByRole("checkbox").check();
      assert.equal(await generate.isDisabled(), false, "terminal state cannot leak to another owner");
      await generate.click();
      await alert.waitFor();
      assert.equal(requests.length, 3);
      assert.notEqual(requests[2].id, requests[1].id);
      assert.deepEqual(errors, []);
      await page.close();
    }
  }

  // A ledger-confirmed release remains usable even if an intermediary retained
  // the terminal error code. The proof must match the submitted operation.
  for (const boundRelease of [true, false]) {
    const page = await browser.newPage();
    const operations = [];
    await page.route("**/*", route => {
      if (new URL(route.request().url()).pathname !== "/api/open-ena/ai-interpretation") {
        return route.fulfill({ contentType: "text/html", body: '<!doctype html><div id="root"></div>' });
      }
      const operation = route.request().headers()["x-open-ena-ai-operation-id"];
      operations.push(operation);
      return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Already processed", errorCode: "operation-not-retryable" }),
        headers: { "x-open-ena-ai-retry": "new-operation", "x-open-ena-ai-operation-id": boundRelease ? operation : "aiop-unrelated-operation" },
      });
    });
    await page.goto("http://localhost:32194/");
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Generate AI interpretation", exact: true }).click();
    const alert = page.getByRole("alert");
    await alert.waitFor();
    assert.equal(await alert.getAttribute("data-ena-ai-recovery"), boundRelease ? "retry" : "review-request");
    if (boundRelease) {
      await alert.getByRole("button", { name: "Retry", exact: true }).click();
      await alert.waitFor();
      assert.equal(operations.length, 2);
      assert.notEqual(operations[0], operations[1]);
    } else {
      assert.equal(await alert.getByRole("button").count(), 0);
      assert.equal(await page.evaluate(() => sessionStorage.getItem(window.scopeKey)), operations[0]);
    }
    await page.close();
  }
  console.log("AI terminal recovery: 3 locales, first failure/replay, retained ID, focused explanation, request/owner reset, bound release PASS");
} finally { await browser.close(); }
