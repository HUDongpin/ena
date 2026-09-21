import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";

// Real React component and fetch boundary; responses are synthetic, with no provider call.
const bundle = await build({
  stdin: { contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import Ai from './components/open-ena/OpenEnaAiInterpretation';
    import { getOpenEnaCopy } from './lib/open-ena-i18n';
    const request = { schemaVersion: 'retry-browser-fixture', promptVersion: 'fixture', locale: 'en', binding: { evidenceKey: 'fixture' }, evidence: {} };
    createRoot(document.getElementById('root')).render(<Ai request={request} copy={getOpenEnaCopy('en').aiInterpretation} disabled={false}/>);
  `, loader: "tsx", resolveDir: process.cwd() },
  bundle: true, format: "iife", platform: "browser", jsx: "automatic", write: false,
});
const browser = await chromium.launch({ headless: true });
try {
  for (const renewable of [true, false]) {
    const page = await browser.newPage();
    const operations = [];
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", async route => {
      if (new URL(route.request().url()).pathname === "/api/open-ena/ai-interpretation") {
        const id = route.request().headers()["x-open-ena-ai-operation-id"];
        operations.push(id);
        return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Synthetic unavailable response" }),
          headers: renewable ? { "x-open-ena-ai-retry": "new-operation", "x-open-ena-ai-operation-id": id } : {} });
      }
      return route.fulfill({ contentType: "text/html", body: '<!doctype html><div id="root"></div>' });
    });
    await page.goto("http://localhost:32119");
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByRole("checkbox").check();
    await page.locator(".ena-ai-actions button").click();
    await page.getByRole("alert").waitFor();
    assert.equal(operations.length, 1, "failure must not automatically dispatch a retry");
    await page.getByRole("alert").getByRole("button").click();
    await page.getByRole("alert").waitFor();
    assert.equal(operations.length, 2);
    assert.match(operations[0], /^aiop-/);
    if (renewable) assert.notEqual(operations[0], operations[1], "confirmed pre-dispatch failure gets a new ID on explicit retry");
    else assert.equal(operations[0], operations[1], "uncertain dispatch retains the same ID");
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("AI explicit retry: renewed confirmed failure, retained uncertain operation, no automatic dispatch PASS");
} finally { await browser.close(); }
