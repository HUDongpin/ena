import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";

// The actual component, response parser and browser fetch boundary run against
// synthetic intercepted responses. No server, provider or account is contacted.
const bundle = await build({
  stdin: {
    contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import Ai from './components/open-ena/OpenEnaAiInterpretation';
    import {openEnaAiOperationOwnerKey} from './lib/open-ena/ai-operation-owner';
    const owner=openEnaAiOperationOwnerKey('synthetic-browser-principal');
      import { openEnaAiOperationScope } from './lib/open-ena/ai-operation-storage';
      import { getOpenEnaCopy } from './lib/open-ena-i18n';
      import { interpretationRequest } from './tests/helpers/ai-interpretation-request-v2';
      const request = interpretationRequest();
      window.requestFixture = request;
      window.operationStorageKey = openEnaAiOperationScope(request, owner).key;
      createRoot(document.getElementById('root')).render(
        <Ai operationOwnerKey={owner} request={request} copy={getOpenEnaCopy('en').aiInterpretation} disabled={false}/>
      );
    `,
    loader: "tsx",
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  write: false,
  logLevel: "silent",
});

const browser = await chromium.launch({ headless: true });
const receipts = [];
try {
  for (const scenario of ["uncertain", "pending", "malformed-success", "malformed-json-success", "renewable", "wrong-renewal-id", "success"]) {
    const page = await browser.newPage();
    const operations = [];
    const requestBodies = [];
    const statuses = [];
    const errors = [];
    const externalRequests = [];
    const dispatchedOperations = new Set();
    const heldResponse = Promise.withResolvers();
    const firstSubmitted = Promise.withResolvers();
    let firstProviderPending = false;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== "http://localhost:32129") {
        externalRequests.push(url.href);
        return route.abort();
      }
      if (url.pathname !== "/api/open-ena/ai-interpretation") {
        return route.fulfill({ contentType: "text/html", body: '<!doctype html><div id="root"></div>' });
      }
      const operationId = request.headers()["x-open-ena-ai-operation-id"];
      operations.push(operationId);
      requestBodies.push(request.postData());
      const attempt = operations.length;
      if (attempt === 1) firstSubmitted.resolve();
      let status = 503;
      let headers = {};
      let body = { error: "Synthetic uncertain provider outcome; safe renewal is not authorized." };
      if (["uncertain", "pending", "malformed-success", "malformed-json-success"].includes(scenario)) {
        if (dispatchedOperations.has(operationId)) {
          status = 409;
          body = { error: "This operation has already been submitted." };
        } else {
          dispatchedOperations.add(operationId);
          status = 502;
          if (scenario === "malformed-success" || scenario === "malformed-json-success") {
            status = 200;
            body = scenario === "malformed-success" ? { schemaVersion: "not-a-response" } : "not-json";
          }
          if (scenario === "pending" && attempt === 1) {
            firstProviderPending = true;
            await heldResponse.promise;
            firstProviderPending = false;
          }
        }
      } else if (scenario === "success") {
        dispatchedOperations.add(operationId);
        status = 200;
        const submitted = JSON.parse(request.postData());
        body = {
          schemaVersion: "open-ena-ai-interpretation-response-v2",
          promptVersion: submitted.promptVersion,
          binding: submitted.binding,
          provider: "deepseek",
          model: "synthetic-model",
          generatedAt: "2026-10-01T00:00:00.000Z",
          interpretation: {
            observedPatterns: [],
            contextualQuestions: [],
            limitations: ["Synthetic aggregate evidence cannot establish causality."],
          },
        };
      } else if (attempt === 2) {
        headers = {
          "x-open-ena-ai-retry": "new-operation",
          "x-open-ena-ai-operation-id": scenario === "renewable"
            ? operationId
            : "aiop-00000000-0000-4000-8000-000000000000",
        };
      }
      statuses[attempt - 1] = status;
      // A cancelled first browser request may already be gone when its mocked
      // provider finishes; cancellation intentionally does not erase dispatch.
      await route.fulfill({ status, headers, contentType: "application/json", body: typeof body === "string" ? body : JSON.stringify(body) })
        .catch((error) => { if (!(scenario === "pending" && attempt === 1)) throw error; });
    });

    try {
      await page.goto("http://localhost:32129/");
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await page.getByRole("checkbox").check();
      const generate = page.locator(".ena-ai-actions button").first();
      const storedOperation = () => page.evaluate(() => sessionStorage.getItem(
        window.operationStorageKey,
      ));
      const waitUntilSettled = () => page.waitForFunction(() => (
        document.querySelector(".ena-ai-interpretation")?.getAttribute("aria-busy") === "false"
        && document.querySelector("[role=alert], .ena-ai-result")
      ));
      await generate.click();
      if (scenario === "pending") {
        await page.getByRole("button", { name: "Cancel", exact: true }).waitFor();
        await firstSubmitted.promise;
        assert.equal(operations.length, 1);
        assert.equal(firstProviderPending, true);
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        assert.equal(await storedOperation(), operations[0], "Cancel must preserve the unresolved operation identity");
        await generate.click();
      }
      await waitUntilSettled();
      if (scenario === "success") {
        assert.equal(await storedOperation(), "closed", "a validated successful response closes its operation identity");
        await generate.click();
        await waitUntilSettled();
        assert.equal(operations.length, 2);
        assert.notEqual(operations[0], operations[1], "an explicit generation after success is a new operation");
        assert.equal(dispatchedOperations.size, 2);
      } else {
        if (scenario !== "pending") {
          assert.equal(operations.length, 1, "an error must not dispatch an automatic retry");
          assert.equal(await storedOperation(), operations[0]);
          await page.getByRole("alert").getByRole("button").click();
          await waitUntilSettled();
        }
        assert.equal(operations.length, 2);
        assert.equal(operations[1], operations[0], "the first retry must retain the original operation key");
        assert.equal(await storedOperation(), scenario === "renewable" ? "closed" : operations[0]);
        if (statuses[1] === 409) {
          assert.equal(await page.getByRole("alert").getByRole("button").count(), 0);
          assert.equal(await generate.isDisabled(), true, "an unproven replay cannot be bypassed with Generate");
          assert.equal(operations.length, 2);
          assert.equal(await storedOperation(), operations[0], "stopping retries retains the unresolved identity");
        } else {
          await page.getByRole("alert").getByRole("button").click();
          await waitUntilSettled();
          assert.equal(operations.length, 3);
          if (scenario === "renewable") {
            assert.notEqual(operations[2], operations[0], "only correctly bound safe renewal permits a new operation");
          } else {
            assert.equal(operations[2], operations[0], "mismatched renewal headers preserve the original operation");
          }
        }
        if (scenario === "uncertain" || scenario === "pending") {
          assert.equal(dispatchedOperations.size, 1, "two Retry attempts cannot dispatch a second billable generation");
          if (scenario === "pending") assert.equal(firstProviderPending, true, "duplicate requests stay blocked while the first provider is unresolved");
        }
      }
      assert.equal(new Set(requestBodies).size, 1, "all attempts use the same reviewed request");
      assert.deepEqual(errors, []);
      assert.deepEqual(externalRequests, []);
      receipts.push({ scenario, requestCount: operations.length, dispatchedOperations: dispatchedOperations.size, statuses });
    } finally {
      heldResponse.resolve();
      await page.close();
    }
  }
  console.log(JSON.stringify({ status: "PASS", receipts }, null, 2));
} finally {
  await browser.close();
}
