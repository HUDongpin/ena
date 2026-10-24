import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";

const bundle = await build({ stdin: { loader: "tsx", resolveDir: process.cwd(), contents: `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Ai from './components/open-ena/OpenEnaAiInterpretation';
import { getOpenEnaCopy } from './lib/open-ena-i18n';
import { openEnaAiOperationOwnerKey } from './lib/open-ena/ai-operation-owner';
import { interpretationRequest } from './tests/helpers/ai-interpretation-request-v2';
const root = createRoot(document.getElementById('root'));
const owner = openEnaAiOperationOwnerKey('synthetic-record-lifecycle-' + window.initialLocale);
window.recordChanges = [];
window.completed = null;
let serial = 0;
function Harness({ saved }) {
  const [locale, setLocale] = useState(window.initialLocale);
  const [science, setScience] = useState('synthetic-science');
  window.setLocale = setLocale;
  window.setScience = setScience;
  window.copy = getOpenEnaCopy(locale).aiInterpretation;
  return <Ai locale={locale} request={interpretationRequest(locale)} copy={window.copy}
    localScientificIdentity={science} operationOwnerKey={owner} disabled={false} disabledReason=""
    savedInterpretation={saved} onInterpretationChange={(value) => { window.completed = value; window.recordChanges.push(value); }} />;
}
window.reopen = () => root.render(<Harness key={++serial} saved={window.completed} />);
window.reopen();
// Ignore AbortSignal at the network boundary so the UI must reject a late success itself.
const nativeFetch = window.fetch;
window.fetch = (url, options) => nativeFetch(url, { ...options, signal: undefined });
` }, bundle: true, format: "iife", platform: "browser", jsx: "automatic", write: false, logLevel: "silent" });
const browser = await chromium.launch({ headless: true });
try {
  for (const initialLocale of ["en", "zh-hans", "zh-hant"]) {
    const page = await browser.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [], operations = [];
    let responseKind = "success", delayedRelease;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", async (route) => {
      if (new URL(route.request().url()).pathname !== "/api/open-ena/ai-interpretation") return route.fulfill({ contentType: "text/html", body: '<!doctype html><div id="root"></div>' });
      const body = route.request().postDataJSON();
      const id = route.request().headers()["x-open-ena-ai-operation-id"];
      operations.push(id);
      const number = operations.length, kind = responseKind;
      if (kind === "delayed") await new Promise((resolve) => { delayedRelease = resolve; });
      if (kind === "failure" || kind === "rate" || kind === "session" || kind === "unknown") {
        return route.fulfill({ status: kind === "rate" ? 429 : kind === "session" ? 401 : kind === "unknown" ? 409 : 503,
          contentType: "application/json", body: JSON.stringify({ error: "Synthetic failure" }),
          headers: kind === "failure" || kind === "rate" ? { "x-open-ena-ai-retry": "new-operation", "x-open-ena-ai-operation-id": id, ...(kind === "rate" ? { "Retry-After": "1" } : {}) } : {} });
      }
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ schemaVersion: "open-ena-ai-interpretation-response-v2",
        promptVersion: body.promptVersion, binding: body.binding, provider: "deepseek", model: "synthetic-lifecycle", generatedAt: "2026-10-24T04:00:00.000Z",
        interpretation: { observedPatterns: [{ statement: `Completed ${body.locale} ${number}`, evidenceRefs: [body.evidence.descriptive.axes[0].id] }],
          contextualQuestions: ["Synthetic question"], limitations: ["Synthetic test only"] } }) });
    });
    await page.goto("http://localhost:31997/en/open-ena");
    await page.evaluate((locale) => { window.initialLocale = locale; }, initialLocale);
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const consent = page.locator(".ena-ai-consent input"), generate = page.locator(".ena-ai-actions button").first();
    const statement = () => page.locator(".ena-ai-result li p").first().textContent();
    await consent.check(); await generate.click();
    await page.locator("[data-ena-ai-record-state=current]").waitFor();
    const first = await statement();
    assert.equal(first, `Completed ${initialLocale} 1`);
    const nextLocale = initialLocale === "en" ? "zh-hans" : "en";
    await page.evaluate((locale) => window.setLocale(locale), nextLocale);
    await page.locator("[data-ena-ai-language-mismatch]").waitFor();
    assert.equal(await statement(), first);
    assert.equal(await page.locator(".ena-ai-result ol").getAttribute("lang"), initialLocale === "en" ? "en-HK" : initialLocale === "zh-hans" ? "zh-Hans-CN" : "zh-Hant-HK");
    assert.equal(await consent.isChecked(), false); assert.equal(await generate.isDisabled(), true);
    assert.equal(operations.length, 1);
    await consent.check(); await generate.click();
    await page.waitForFunction(() => window.recordChanges.length === 2);
    const second = await statement();
    assert.equal(second, `Completed ${nextLocale} 2`);
    assert.equal(await page.locator("[data-ena-ai-language-mismatch]").count(), 0);
    responseKind = "failure";
    await generate.click(); await page.getByRole("alert").waitFor();
    assert.equal(await statement(), second, "failure keeps the last successful record");
    assert.equal(await page.evaluate(() => window.recordChanges.length), 2);
    responseKind = "delayed";
    await page.locator('button[data-ena-ai-recovery="retry"]').click();
    await page.waitForFunction(() => document.querySelector('.ena-ai-interpretation').getAttribute('aria-busy') === 'true');
    while (!delayedRelease) await page.waitForTimeout(10);
    await page.locator(".ena-ai-actions button").nth(1).click();
    delayedRelease(); delayedRelease = undefined;
    await page.waitForTimeout(100);
    assert.equal(await statement(), second, "cancel rejects a late success and preserves the last completed record");
    assert.equal(await page.evaluate(() => window.recordChanges.length), 2);
    await generate.click();
    while (!delayedRelease) await page.waitForTimeout(10);
    await page.evaluate((locale) => window.setLocale(locale), initialLocale);
    await page.locator("[data-ena-ai-language-mismatch]").waitFor();
    delayedRelease(); delayedRelease = undefined;
    await page.waitForTimeout(100);
    assert.equal(await statement(), second, "language changes reject late responses without translating the completed text");
    assert.equal(await page.evaluate(() => window.recordChanges.length), 2);
    assert.equal(await consent.isChecked(), false);
    await page.evaluate((locale) => window.setLocale(locale), nextLocale);
    await consent.check(); await generate.click();
    while (!delayedRelease) await page.waitForTimeout(10);
    await page.evaluate(() => window.setScience("changed-model-parameters"));
    await page.locator("[data-ena-ai-record-state=stale]").waitFor();
    delayedRelease(); delayedRelease = undefined;
    await page.waitForTimeout(100);
    assert.equal(await statement(), second); assert.equal(await consent.isChecked(), false);
    assert.equal(await page.evaluate(() => window.recordChanges.length), 2);
    responseKind = "rate";
    await consent.check(); await generate.click();
    await page.locator("[data-ena-ai-retry-after]").waitFor();
    const rateCount = operations.length;
    assert.equal(await generate.isDisabled(), true);
    assert.equal(await page.locator('button[data-ena-ai-recovery="retry"]').isDisabled(), true);
    await page.waitForTimeout(100);
    assert.equal(operations.length, rateCount, "429 must not retry automatically");
    responseKind = "success";
    await page.waitForFunction(() => !document.querySelector('button[data-ena-ai-recovery="retry"]').disabled);
    await page.locator('button[data-ena-ai-recovery="retry"]').click();
    await page.waitForFunction(() => window.recordChanges.length === 3);
    assert.notEqual(operations[rateCount - 1], operations[rateCount], "release proof permits a new operation after the cooldown");
    const latest = await statement();
    responseKind = "session";
    await generate.click(); await page.locator('a[data-ena-ai-recovery="sign-in"]').waitFor();
    assert.equal(await page.locator('a[data-ena-ai-recovery="sign-in"]').getAttribute("href"), `/${nextLocale}/open-ena`);
    assert.equal(await generate.isDisabled(), true);
    assert.equal(await statement(), latest);
    // Opening a persisted record restores readable history and never restores consent.
    await page.evaluate(() => window.reopen());
    await page.locator("[data-ena-ai-record-state=historical]").waitFor();
    assert.equal(await consent.isChecked(), false); assert.equal(await generate.isDisabled(), true);
    assert.equal(await statement(), latest);
    responseKind = "unknown";
    await consent.check(); await generate.click(); await page.locator("[data-ena-ai-local-recovery]").waitFor();
    const unknownCount = operations.length;
    assert.equal(await page.locator('button[data-ena-ai-recovery="retry"]').count(), 0);
    assert.equal(await generate.isDisabled(), true);
    await page.waitForTimeout(100);
    assert.equal(operations.length, unknownCount, "an unknown operation stays stopped");
    await page.locator("[data-ena-ai-clear]").click();
    assert.equal(await page.locator(".ena-ai-result").count(), 0);
    assert.equal(await page.evaluate(() => window.completed), null);
    assert.equal(await page.locator("[data-ena-ai-local-recovery]").count(), 1, "Clear must not erase operation safeguards");
    await page.evaluate(() => window.reopen());
    assert.equal(await page.locator(".ena-ai-result").count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("AI completed record lifecycle: all locales, replacement, cancel/late response, 429 wait, 401, unknown operation, historical and clear PASS");
} finally { await browser.close(); }
