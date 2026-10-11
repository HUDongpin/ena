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
  const page = await browser.newPage();
  const operations = [];
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    if (new URL(route.request().url()).pathname === "/api/open-ena/ai-interpretation") {
      operations.push(route.request().headers()["x-open-ena-ai-operation-id"]);
      return route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Authentication required." }),
      });
    }
    return route.fulfill({ contentType: "text/html", body: '<!doctype html><div id="root"></div>' });
  });
  await page.goto("http://localhost:32119");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.getByRole("checkbox").check();
  await page.locator(".ena-ai-actions button").click();
  const alert = page.getByRole("alert");
  await alert.waitFor();
  assert.equal(operations.length, 1, "an authentication failure must not automatically dispatch a retry");
  assert.match(await alert.innerText(), /Sign in again/);
  assert.equal(await alert.getByRole("button", { name: "Retry" }).count(), 0);
  const signIn = alert.getByRole("link", { name: "Sign in again" });
  assert.equal(await signIn.getAttribute("target"), "_blank");
  assert.match(await signIn.getAttribute("rel") ?? "", /\bnoopener\b/);
  assert.match(await signIn.getAttribute("rel") ?? "", /\bnoreferrer\b/);
  const signInHref = await signIn.evaluate((element) => element.href);
  const currentUrl = new URL(page.url());
  const openedUrl = new URL(signInHref);
  assert.equal(openedUrl.pathname, currentUrl.pathname);
  assert.equal(openedUrl.search, currentUrl.search);
  const urlBefore = page.url();
  const previewBefore = await page.locator("pre").textContent();
  const popupPromise = page.waitForEvent("popup");
  await signIn.click();
  const popup = await popupPromise;
  assert.equal(page.url(), urlBefore, "sign-in must not replace the current analysis document");
  assert.equal(await page.locator("pre").textContent(), previewBefore, "sign-in must keep the reviewed request on this page");
  assert.equal(await page.getByRole("alert").count(), 1, "the failure and evidence boundary must stay on this page");
  assert.equal(operations.length, 1, "session recovery must not submit another AI generation");
  assert.deepEqual(errors, []);
  await popup.close();
  await page.close();

  const boundary = "The computed ENA model results are still valid. Only the AI interpretation is missing.";
  const classCases = [
    {
      name: "unavailable",
      status: 503,
      body: { error: "Synthetic unavailable response" },
      failureClass: "unavailable",
      message: "AI interpretation is temporarily unavailable or rate limited. Wait a moment, then retry this request.",
      hidden: "Synthetic unavailable response",
      retry: true,
    },
    {
      name: "rate-limited",
      status: 429,
      body: { error: "The AI interpretation provider is rate limited. Please try again later." },
      failureClass: "unavailable",
      message: "AI interpretation is temporarily unavailable or rate limited. Wait a moment, then retry this request.",
      hidden: "Please try again later.",
      retry: true,
    },
    {
      name: "timeout",
      status: 504,
      body: { error: "The AI interpretation provider timed out." },
      failureClass: "network",
      message: "The AI interpretation request did not finish because the network failed or the request timed out. Check your connection, then retry this request.",
      hidden: "The AI interpretation provider timed out.",
      retry: true,
    },
    {
      name: "provider-network",
      status: 502,
      body: { error: "The AI interpretation provider request failed.", failureClass: "network" },
      failureClass: "network",
      message: "The AI interpretation request did not finish because the network failed or the request timed out. Check your connection, then retry this request.",
      hidden: "The AI interpretation provider request failed.",
      retry: true,
    },
    {
      name: "invalid-output",
      status: 502,
      body: { error: "The AI interpretation provider request failed.", failureClass: "invalid-output" },
      failureClass: "invalid-output",
      message: "The model returned output that could not be used as an interpretation. Retry this request to ask for a new interpretation.",
      hidden: "The AI interpretation provider request failed.",
      retry: true,
    },
    {
      name: "session",
      status: 401,
      body: { error: "Authentication required.", failureClass: "session" },
      failureClass: "session",
      message: "Your Open ENA session is missing or no longer valid. Sign in again, then return to generate an interpretation.",
      hidden: "Authentication required.",
      retry: false,
    },
  ];
  for (const item of classCases) {
    const failurePage = await browser.newPage();
    const pageErrors = [];
    failurePage.on("pageerror", (error) => pageErrors.push(error.message));
    await failurePage.route("**/*", async (route) => {
      if (new URL(route.request().url()).pathname === "/api/open-ena/ai-interpretation") {
        return route.fulfill({
          status: item.status,
          contentType: "application/json",
          body: JSON.stringify(item.body),
        });
      }
      return route.fulfill({ contentType: "text/html", body: '<!doctype html><div id="root"></div>' });
    });
    await failurePage.goto("http://localhost:32119");
    await failurePage.addScriptTag({ content: bundle.outputFiles[0].text });
    await failurePage.getByRole("checkbox").check();
    await failurePage.locator(".ena-ai-actions button").click();
    const failureAlert = failurePage.getByRole("alert");
    await failureAlert.waitFor();
    const failureText = await failureAlert.innerText();
    assert.match(failureText, new RegExp(item.message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), item.name);
    assert.match(failureText, new RegExp(boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), item.name);
    assert.equal(failureText.includes(item.hidden), false, `${item.name} must not show the raw server message`);
    assert.equal(await failureAlert.getAttribute("data-ena-ai-failure-class"), item.failureClass, item.name);
    assert.equal(await failureAlert.locator("[data-ena-ai-evidence-boundary='results-remain-valid']").count(), 1, item.name);
    assert.equal(await failureAlert.getByRole("button", { name: "Retry" }).count(), item.retry ? 1 : 0, item.name);
    assert.equal(await failureAlert.getByRole("link", { name: "Sign in again" }).count(), item.retry ? 0 : 1, item.name);
    assert.deepEqual(pageErrors, [], item.name);
    await failurePage.close();
  }

  const duplicatePage = await browser.newPage();
  const duplicateErrors = [];
  const duplicateOperations = [];
  duplicatePage.on("pageerror", (error) => duplicateErrors.push(error.message));
  await duplicatePage.route("**/*", async (route) => {
    if (new URL(route.request().url()).pathname === "/api/open-ena/ai-interpretation") {
      duplicateOperations.push(route.request().headers()["x-open-ena-ai-operation-id"]);
      if (duplicateOperations.length === 1) {
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Synthetic unavailable response" }),
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Synthetic unavailable response" }),
      });
    }
    return route.fulfill({ contentType: "text/html", body: '<!doctype html><div id="root"></div>' });
  });
  await duplicatePage.goto("http://localhost:32119");
  await duplicatePage.addScriptTag({ content: bundle.outputFiles[0].text });
  await duplicatePage.getByRole("checkbox").check();
  await duplicatePage.locator(".ena-ai-actions button").click();
  await duplicatePage.getByRole("alert").waitFor();
  await duplicatePage.evaluate(() => {
    const button = document.querySelector("button[data-ena-ai-recovery='retry']");
    if (!button) throw new Error("retry button missing");
    button.click();
    const second = document.querySelector("button[data-ena-ai-recovery='retry']");
    if (second && !second.disabled) second.click();
  });
  const duplicateDeadline = Date.now() + 350;
  while (Date.now() < duplicateDeadline) {
    assert.ok(duplicateOperations.length <= 2, "a second click during retry must not send another request");
    await duplicatePage.waitForTimeout(20);
  }
  assert.equal(duplicateOperations.length, 2, "one explicit retry sends exactly one request");
  assert.deepEqual(duplicateErrors, []);
  await duplicatePage.close();

  const harness = await build({
    stdin: { contents: `
      import React, { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import Ai from './components/open-ena/OpenEnaAiInterpretation';
      import { getOpenEnaCopy } from './lib/open-ena-i18n';
      const initial = { schemaVersion: 'retry-browser-fixture', promptVersion: 'fixture', locale: 'en', binding: { evidenceKey: 'evidence-a' }, evidence: { id: 'a' } };
      function Harness() {
        const [request, setRequest] = useState(initial);
        window.__setAiRequest = setRequest;
        return <Ai request={request} copy={getOpenEnaCopy('en').aiInterpretation} disabled={false} disabledReason="Current result required"/>;
      }
      createRoot(document.getElementById('root')).render(<Harness />);
    `, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, format: "iife", platform: "browser", jsx: "automatic", write: false,
  });
  const stalePage = await browser.newPage();
  const staleErrors = [];
  const staleBodies = [];
  let releaseStale = () => {};
  const staleReleased = new Promise((resolve) => { releaseStale = resolve; });
  stalePage.on("pageerror", (error) => staleErrors.push(error.message));
  await stalePage.route("**/*", async (route) => {
    if (new URL(route.request().url()).pathname === "/api/open-ena/ai-interpretation") {
      staleBodies.push(route.request().postData() ?? "");
      await staleReleased;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ interpretation: "STALE_RESULT_MUST_NOT_ATTACH" }),
      });
    }
    return route.fulfill({ contentType: "text/html", body: '<!doctype html><div id="root"></div>' });
  });
  await stalePage.goto("http://localhost:32119");
  await stalePage.addScriptTag({ content: harness.outputFiles[0].text });
  await stalePage.getByRole("checkbox").check();
  await stalePage.locator(".ena-ai-actions button").click();
  const staleStarted = Date.now();
  while (staleBodies.length < 1) {
    if (Date.now() - staleStarted > 5000) throw new Error("the in-flight retry was not sent");
    await stalePage.waitForTimeout(20);
  }
  await stalePage.evaluate(() => {
    window.__setAiRequest({
      schemaVersion: "retry-browser-fixture",
      promptVersion: "fixture",
      locale: "en",
      binding: { evidenceKey: "evidence-b" },
      evidence: { id: "b" },
    });
  });
  releaseStale();
  await stalePage.waitForTimeout(100);
  assert.match(staleBodies[0], /evidence-a/);
  assert.equal(staleBodies.length, 1, "changing evidence must not send a replacement AI request");
  assert.equal(await stalePage.locator(".ena-ai-result").count(), 0, "a late interpretation must not attach to newer evidence");
  assert.equal(await stalePage.getByText("STALE_RESULT_MUST_NOT_ATTACH").count(), 0);
  assert.equal(await stalePage.getByRole("alert").count(), 0, "a late failure for old evidence must not attach to newer evidence");
  assert.equal(await stalePage.getByRole("checkbox").isChecked(), false, "newer evidence still requires its own consent");
  assert.match(await stalePage.locator("pre").textContent() ?? "", /evidence-b/);
  assert.deepEqual(staleErrors, []);
  await stalePage.close();

  const keyboardPage = await browser.newPage();
  const keyboardErrors = [];
  const keyboardOperations = [];
  let releaseKeyboard = () => {};
  const keyboardReleased = new Promise((resolve) => { releaseKeyboard = resolve; });
  keyboardPage.on("pageerror", (error) => keyboardErrors.push(error.message));
  await keyboardPage.route("**/*", async (route) => {
    if (new URL(route.request().url()).pathname === "/api/open-ena/ai-interpretation") {
      keyboardOperations.push(route.request().headers()["x-open-ena-ai-operation-id"]);
      if (keyboardOperations.length === 1) {
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Synthetic unavailable response" }),
        });
      }
      await keyboardReleased;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Synthetic unavailable response" }),
      });
    }
    return route.fulfill({ contentType: "text/html", body: '<!doctype html><div id="root"></div><button id="outside-panel" type="button">Outside</button>' });
  });
  await keyboardPage.goto("http://localhost:32119");
  await keyboardPage.addScriptTag({ content: bundle.outputFiles[0].text });
  await keyboardPage.getByRole("checkbox").check();
  await keyboardPage.locator(".ena-ai-actions button").click();
  await keyboardPage.getByRole("alert").waitFor();
  assert.equal(keyboardOperations.length, 1);
  const retryButton = keyboardPage.getByRole("alert").getByRole("button", { name: "Retry" });
  await retryButton.focus();
  await keyboardPage.keyboard.press("Enter");
  await keyboardPage.waitForFunction(() => {
    const panel = document.querySelector(".ena-ai-interpretation");
    const active = document.activeElement;
    return panel?.getAttribute("aria-busy") === "true"
      && active instanceof HTMLButtonElement
      && active.textContent?.trim() === "Cancel";
  });
  await keyboardPage.waitForTimeout(80);
  assert.equal(keyboardOperations.length, 2, "Enter on Retry sends exactly one request");
  assert.equal(
    await keyboardPage.locator(".ena-ai-interpretation").getAttribute("aria-busy"),
    "true",
    "the panel must stay busy while that single retry is in flight",
  );
  releaseKeyboard();
  await keyboardPage.waitForFunction(() => {
    const panel = document.querySelector(".ena-ai-interpretation");
    const active = document.activeElement;
    return panel?.getAttribute("aria-busy") === "false"
      && active instanceof HTMLButtonElement
      && active.getAttribute("data-ena-ai-recovery") === "retry";
  });
  assert.deepEqual(keyboardErrors, []);
  await keyboardPage.close();

  const outsidePage = await browser.newPage();
  const outsideErrors = [];
  let releaseOutside = () => {};
  const outsideReleased = new Promise((resolve) => { releaseOutside = resolve; });
  outsidePage.on("pageerror", (error) => outsideErrors.push(error.message));
  await outsidePage.route("**/*", async (route) => {
    if (new URL(route.request().url()).pathname === "/api/open-ena/ai-interpretation") {
      await outsideReleased;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Synthetic unavailable response" }),
      });
    }
    return route.fulfill({ contentType: "text/html", body: '<!doctype html><div id="root"></div><button id="outside-panel" type="button">Outside</button>' });
  });
  await outsidePage.goto("http://localhost:32119");
  await outsidePage.addScriptTag({ content: bundle.outputFiles[0].text });
  await outsidePage.getByRole("checkbox").check();
  const outsideGenerate = outsidePage.locator(".ena-ai-actions button");
  await outsideGenerate.focus();
  await outsideGenerate.click();
  await outsidePage.waitForFunction(() => document.querySelector(".ena-ai-interpretation")?.getAttribute("aria-busy") === "true");
  await outsidePage.locator("#outside-panel").focus();
  releaseOutside();
  await outsidePage.getByRole("alert").waitFor();
  assert.equal(await outsidePage.evaluate(() => document.activeElement?.id), "outside-panel", "a retry must not pull focus back from outside the panel");
  assert.equal(await outsidePage.locator(".ena-ai-interpretation").getAttribute("aria-busy"), "false");
  assert.deepEqual(outsideErrors, []);
  await outsidePage.close();

  console.log("AI explicit retry: renewed confirmed failure, retained uncertain operation, auth-required uses sign-in, classed recovery copy, single in-flight retry, stale result dropped, sign-in keeps this document, Enter retries once, focus and busy state restored PASS");
} finally { await browser.close(); }
