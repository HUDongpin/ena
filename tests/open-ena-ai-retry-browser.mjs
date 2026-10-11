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

  function syntheticInterpretation(body) {
    if (!body?.binding || body.schemaVersion !== "open-ena-ai-interpretation-request-v2") {
      throw new Error("Synthetic success requires the posted v2 request.");
    }
    return {
      schemaVersion: "open-ena-ai-interpretation-response-v2",
      promptVersion: body.promptVersion,
      binding: body.binding,
      provider: "deepseek",
      model: "synthetic-review",
      generatedAt: "2026-09-27T06:00:00.000Z",
      interpretation: {
        observedPatterns: [{
          statement: "Synthetic aggregate pattern for focus restoration.",
          evidenceRefs: ["axis-1"],
        }],
        contextualQuestions: ["Which aggregate comparison should be checked next?"],
        limitations: ["This synthetic response only exercises focus restoration."],
      },
    };
  }
  const focusHarness = await build({
    stdin: { contents: `
      import React, { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import Ai from './components/open-ena/OpenEnaAiInterpretation';
      import { getOpenEnaCopy } from './lib/open-ena-i18n';
      import { interpretationRequest } from './tests/helpers/ai-interpretation-request-v2';
      const initial = interpretationRequest();
      const replacement = {
        ...initial,
        binding: { ...initial.binding, analyzedAt: "2026-08-22T10:00:00.000Z" },
      };
      function Harness() {
        const [request, setRequest] = useState(initial);
        const [panelDisabled, setPanelDisabled] = useState(false);
        window.__setAiRequest = (next) => {
          const resolved = next === undefined ? replacement : next;
          setRequest(resolved);
          setPanelDisabled(resolved === null);
        };
        return <Ai request={request} copy={getOpenEnaCopy('en').aiInterpretation} disabled={panelDisabled} disabledReason="Current result required"/>;
      }
      createRoot(document.getElementById('root')).render(<Harness />);
    `, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, format: "iife", platform: "browser", jsx: "automatic", write: false,
  });
  const focusDocument = '<!doctype html><div id="root"></div><button id="outside-panel" type="button">Outside</button>';

  async function focusDiagnostic(page) {
    return page.evaluate(() => ({
      activeTag: document.activeElement?.tagName ?? null,
      activeText: document.activeElement?.textContent?.trim().slice(0, 160) ?? "",
      activeId: document.activeElement?.id ?? "",
      inside: Boolean(document.querySelector(".ena-ai-interpretation")?.contains(document.activeElement)),
      busy: document.querySelector(".ena-ai-interpretation")?.getAttribute("aria-busy") ?? null,
      alert: document.querySelector("[role=alert]")?.textContent?.trim().slice(0, 300) ?? "",
      result: Boolean(document.querySelector(".ena-ai-result")),
    }));
  }

  const successPage = await browser.newPage();
  const successErrors = [];
  successPage.on("pageerror", (error) => successErrors.push(error.message));
  await successPage.route("**/*", async (route) => {
    if (new URL(route.request().url()).pathname === "/api/open-ena/ai-interpretation") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(syntheticInterpretation(route.request().postDataJSON())),
      });
    }
    return route.fulfill({ contentType: "text/html", body: focusDocument });
  });
  await successPage.goto("http://localhost:32119");
  await successPage.addScriptTag({ content: focusHarness.outputFiles[0].text });
  await successPage.getByRole("checkbox").check();
  const successGenerate = successPage.getByRole("button", { name: "Generate AI interpretation", exact: true });
  await successGenerate.focus();
  await successPage.keyboard.press("Enter");
  try {
    await successPage.waitForFunction(() => {
      const heading = document.querySelector(".ena-ai-result h4");
      return heading instanceof HTMLElement
        && heading.tabIndex === -1
        && document.activeElement === heading;
    });
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${JSON.stringify(await focusDiagnostic(successPage))}`);
  }
  assert.notEqual(await successPage.evaluate(() => document.activeElement?.tagName), "BODY", "a successful keyboard generation must not leave focus on the document body");
  assert.equal(
    await successPage.evaluate(() => document.querySelector(".ena-ai-interpretation")?.contains(document.activeElement)),
    true,
    "restored focus must stay inside the interpretation panel",
  );
  assert.deepEqual(successErrors, []);
  await successPage.close();

  async function openKeyboardSuccessPage() {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", async (route) => {
      if (new URL(route.request().url()).pathname === "/api/open-ena/ai-interpretation") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(syntheticInterpretation(route.request().postDataJSON())),
        });
      }
      return route.fulfill({ contentType: "text/html", body: focusDocument });
    });
    await page.goto("http://localhost:32119");
    await page.addScriptTag({ content: focusHarness.outputFiles[0].text });
    await page.getByRole("checkbox").check();
    const generate = page.getByRole("button", { name: "Generate AI interpretation", exact: true });
    await generate.focus();
    await page.keyboard.press("Enter");
    try {
      await page.waitForFunction(() => {
        const heading = document.querySelector(".ena-ai-result h4");
        return heading instanceof HTMLElement
          && heading.tabIndex === -1
          && document.activeElement === heading;
      });
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}\n${JSON.stringify(await focusDiagnostic(page))}`);
    }
    return { page, errors };
  }

  const replacedFocus = await openKeyboardSuccessPage();
  await replacedFocus.page.evaluate(() => { window.__setAiRequest(); });
  try {
    await replacedFocus.page.waitForFunction(() => {
      const panel = document.querySelector(".ena-ai-interpretation");
      const consent = document.querySelector(".ena-ai-consent input");
      return consent instanceof HTMLInputElement
        && !consent.disabled
        && document.activeElement === consent
        && panel?.contains(document.activeElement)
        && !document.querySelector(".ena-ai-result");
    });
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${JSON.stringify(await focusDiagnostic(replacedFocus.page))}`);
  }
  assert.notEqual(
    await replacedFocus.page.evaluate(() => document.activeElement?.tagName),
    "BODY",
    "invalidating a focused result must not drop focus on the document body",
  );
  assert.equal(
    await replacedFocus.page.evaluate(() => document.activeElement === document.querySelector(".ena-ai-consent input")),
    true,
    "a replaced request must move focus to the consent control when Generate is disabled",
  );
  assert.deepEqual(replacedFocus.errors, []);
  await replacedFocus.page.close();

  const removedFocus = await openKeyboardSuccessPage();
  await removedFocus.page.evaluate(() => { window.__setAiRequest(null); });
  try {
    await removedFocus.page.waitForFunction(() => {
      const panel = document.querySelector(".ena-ai-interpretation");
      return document.activeElement === panel
        && panel?.getAttribute("tabindex") === "-1"
        && !document.querySelector(".ena-ai-result");
    });
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${JSON.stringify(await focusDiagnostic(removedFocus.page))}`);
  }
  assert.notEqual(
    await removedFocus.page.evaluate(() => document.activeElement?.tagName),
    "BODY",
    "clearing the reviewed request must not drop focus on the document body",
  );
  assert.equal(
    await removedFocus.page.evaluate(() => document.querySelector(".ena-ai-interpretation")?.contains(document.activeElement)),
    true,
    "focus must remain inside the panel after the reviewed request is cleared",
  );
  assert.deepEqual(removedFocus.errors, []);
  await removedFocus.page.close();

  const outsideIdentity = await openKeyboardSuccessPage();
  await outsideIdentity.page.locator("#outside-panel").focus();
  await outsideIdentity.page.evaluate(() => { window.__setAiRequest(); });
  await outsideIdentity.page.waitForFunction(() => !document.querySelector(".ena-ai-result"));
  assert.equal(
    await outsideIdentity.page.evaluate(() => document.activeElement?.id),
    "outside-panel",
    "invalidating a result must not pull focus back into the panel",
  );
  assert.deepEqual(outsideIdentity.errors, []);
  await outsideIdentity.page.close();

  const outsideSuccessPage = await browser.newPage();
  const outsideSuccessErrors = [];
  let releaseOutsideSuccess = () => {};
  const outsideSuccessReleased = new Promise((resolve) => { releaseOutsideSuccess = resolve; });
  outsideSuccessPage.on("pageerror", (error) => outsideSuccessErrors.push(error.message));
  await outsideSuccessPage.route("**/*", async (route) => {
    if (new URL(route.request().url()).pathname === "/api/open-ena/ai-interpretation") {
      await outsideSuccessReleased;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(syntheticInterpretation(route.request().postDataJSON())),
      });
    }
    return route.fulfill({ contentType: "text/html", body: focusDocument });
  });
  await outsideSuccessPage.goto("http://localhost:32119");
  await outsideSuccessPage.addScriptTag({ content: focusHarness.outputFiles[0].text });
  await outsideSuccessPage.getByRole("checkbox").check();
  const outsideSuccessGenerate = outsideSuccessPage.getByRole("button", { name: "Generate AI interpretation", exact: true });
  await outsideSuccessGenerate.focus();
  await outsideSuccessPage.keyboard.press("Enter");
  await outsideSuccessPage.waitForFunction(() => {
    const active = document.activeElement;
    return document.querySelector(".ena-ai-interpretation")?.getAttribute("aria-busy") === "true"
      && active instanceof HTMLButtonElement
      && active.textContent?.trim() === "Cancel";
  });
  await outsideSuccessPage.locator("#outside-panel").focus();
  releaseOutsideSuccess();
  await outsideSuccessPage.locator(".ena-ai-result").waitFor();
  assert.equal(await outsideSuccessPage.evaluate(() => document.activeElement?.id), "outside-panel", "a completed generation must not pull focus back from outside the panel");
  assert.deepEqual(outsideSuccessErrors, []);
  await outsideSuccessPage.close();

  const cancelPage = await browser.newPage();
  const cancelErrors = [];
  let releaseCancel = () => {};
  const cancelReleased = new Promise((resolve) => { releaseCancel = resolve; });
  cancelPage.on("pageerror", (error) => cancelErrors.push(error.message));
  await cancelPage.route("**/*", async (route) => {
    if (new URL(route.request().url()).pathname === "/api/open-ena/ai-interpretation") {
      await cancelReleased;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ interpretation: "CANCELLED_RESULT_MUST_NOT_ATTACH" }),
      });
    }
    return route.fulfill({ contentType: "text/html", body: focusDocument });
  });
  await cancelPage.goto("http://localhost:32119");
  await cancelPage.addScriptTag({ content: bundle.outputFiles[0].text });
  await cancelPage.getByRole("checkbox").check();
  const cancelGenerate = cancelPage.getByRole("button", { name: "Generate AI interpretation", exact: true });
  await cancelGenerate.focus();
  await cancelPage.keyboard.press("Enter");
  await cancelPage.waitForFunction(() => {
    const active = document.activeElement;
    return active instanceof HTMLButtonElement && active.textContent?.trim() === "Cancel";
  });
  await cancelPage.keyboard.press("Enter");
  try {
    await cancelPage.waitForFunction(() => {
      const active = document.activeElement;
      return active instanceof HTMLButtonElement
        && active.textContent?.trim() === "Generate AI interpretation"
        && !active.disabled;
    });
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${JSON.stringify(await focusDiagnostic(cancelPage))}`);
  }
  assert.notEqual(await cancelPage.evaluate(() => document.activeElement?.tagName), "BODY", "keyboard cancel must not leave focus on the document body");
  releaseCancel();
  await cancelPage.waitForTimeout(80);
  assert.equal(await cancelPage.getByText("CANCELLED_RESULT_MUST_NOT_ATTACH").count(), 0);
  assert.equal(await cancelPage.getByRole("alert").count(), 0, "a cancelled request must not surface a late error");
  assert.equal(
    await cancelPage.evaluate(() => document.activeElement?.textContent?.trim()),
    "Generate AI interpretation",
    "a late response after cancel must not move focus again",
  );
  assert.deepEqual(cancelErrors, []);
  await cancelPage.close();

  const identityPage = await browser.newPage();
  const identityErrors = [];
  let releaseIdentity = () => {};
  const identityReleased = new Promise((resolve) => { releaseIdentity = resolve; });
  identityPage.on("pageerror", (error) => identityErrors.push(error.message));
  await identityPage.route("**/*", async (route) => {
    if (new URL(route.request().url()).pathname === "/api/open-ena/ai-interpretation") {
      await identityReleased;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(syntheticInterpretation(route.request().postDataJSON())),
      });
    }
    return route.fulfill({ contentType: "text/html", body: focusDocument });
  });
  await identityPage.goto("http://localhost:32119");
  await identityPage.addScriptTag({ content: focusHarness.outputFiles[0].text });
  await identityPage.getByRole("checkbox").check();
  const identityGenerate = identityPage.getByRole("button", { name: "Generate AI interpretation", exact: true });
  await identityGenerate.focus();
  await identityPage.keyboard.press("Enter");
  await identityPage.waitForFunction(() => document.activeElement?.textContent?.trim() === "Cancel");
  await identityPage.evaluate(() => { window.__setAiRequest(); });
  try {
    await identityPage.waitForFunction(() => {
      const panel = document.querySelector(".ena-ai-interpretation");
      const consent = document.querySelector(".ena-ai-consent input");
      return document.activeElement === consent
        && panel?.contains(document.activeElement)
        && panel?.getAttribute("aria-busy") === "false";
    });
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${JSON.stringify(await focusDiagnostic(identityPage))}`);
  }
  assert.notEqual(await identityPage.evaluate(() => document.activeElement?.tagName), "BODY", "aborting for a new request must not leave focus on the document body");
  assert.equal(await identityPage.locator(".ena-ai-result").count(), 0, "an in-flight interpretation must not attach after the request changes");
  assert.equal(await identityPage.getByRole("checkbox").isChecked(), false, "the new request still requires its own consent");
  releaseIdentity();
  await identityPage.waitForTimeout(80);
  assert.equal(await identityPage.locator(".ena-ai-result").count(), 0);
  assert.equal(
    await identityPage.evaluate(() => document.activeElement === document.querySelector(".ena-ai-consent input")),
    true,
    "a late response after an identity change must not move focus again",
  );
  assert.deepEqual(identityErrors, []);
  await identityPage.close();

  const missingBoundary = "The computed ENA model results are still valid. Only the AI interpretation is missing.";
  const retainedBoundary = "The ENA model results remain valid. This new AI interpretation attempt failed; the interpretation shown below is from an earlier request for the same evidence.";
  const replayError = "This AI generation operation was already processed.";

  async function withIdempotentAi(decide) {
    const page = await browser.newPage();
    const errors = [];
    const operations = [];
    const statuses = [];
    const consumed = new Set();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname !== "/api/open-ena/ai-interpretation") {
        return route.fulfill({ contentType: "text/html", body: focusDocument });
      }
      const id = route.request().headers()["x-open-ena-ai-operation-id"];
      operations.push(id);
      if (consumed.has(id)) {
        statuses.push(409);
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ error: replayError }),
        });
      }
      const decision = await decide({
        route,
        attempt: operations.length,
        consume: () => consumed.add(id),
      });
      statuses.push(decision.status ?? 0);
      if (decision.abort) return route.abort("failed");
      return route.fulfill({
        status: decision.status,
        contentType: "application/json",
        headers: decision.headers,
        body: typeof decision.body === "string" ? decision.body : JSON.stringify(decision.body),
      });
    });
    await page.goto("http://localhost:32119");
    await page.addScriptTag({ content: focusHarness.outputFiles[0].text });
    await page.getByRole("checkbox").check();
    return { page, errors, operations, statuses };
  }

  function successDecision(route) {
    return {
      status: 200,
      body: syntheticInterpretation(route.request().postDataJSON()),
    };
  }

  const consumedFailures = [
    {
      name: "server-invalid-output",
      status: 502,
      body: { error: "The AI interpretation provider request failed.", failureClass: "invalid-output" },
    },
    {
      name: "client-parse-schema",
      status: 200,
      body: { schemaVersion: "not-a-response" },
    },
    {
      name: "client-parse-json",
      status: 200,
      body: "not-json",
    },
    {
      name: "unavailable-after-dispatch",
      status: 503,
      body: { error: "AI interpretation is temporarily unavailable.", failureClass: "unavailable" },
    },
    {
      name: "rate-limit-after-dispatch",
      status: 429,
      body: {
        error: "The AI interpretation provider is rate limited. Please try again later.",
        failureClass: "unavailable",
      },
    },
    {
      name: "network-after-dispatch",
      status: 502,
      body: { error: "The AI interpretation provider request failed.", failureClass: "network" },
    },
    {
      name: "timeout-after-dispatch",
      status: 504,
      body: { error: "The AI interpretation provider timed out.", failureClass: "network" },
    },
  ];
  for (const item of consumedFailures) {
    const session = await withIdempotentAi(async ({ route, attempt, consume }) => {
      if (attempt === 1) {
        consume();
        return { status: item.status, body: item.body };
      }
      return successDecision(route);
    });
    await session.page.getByRole("button", { name: "Generate AI interpretation", exact: true }).click();
    const alert = session.page.getByRole("alert");
    await alert.waitFor();
    assert.equal(session.operations.length, 1, `${item.name} must not dispatch a retry by itself`);
    assert.equal(await session.page.locator(".ena-ai-result").count(), 0, item.name);
    assert.equal(
      (await alert.locator("[data-ena-ai-evidence-boundary='results-remain-valid']").innerText()).trim(),
      missingBoundary,
      `${item.name} without a prior interpretation keeps the missing-interpretation boundary`,
    );
    assert.equal(await alert.locator("[data-ena-ai-evidence-boundary='previous-interpretation-retained']").count(), 0, item.name);
    await alert.getByRole("button", { name: "Retry" }).click();
    await session.page.locator(".ena-ai-result").waitFor();
    assert.equal(session.operations.length, 2, `${item.name} retry sends one request`);
    assert.notEqual(session.operations[0], session.operations[1], `${item.name} retry must send a new operation id`);
    assert.equal(session.statuses.includes(409), false, `${item.name} retry must not replay the consumed id`);
    assert.equal(session.statuses.at(-1), 200, item.name);
    assert.equal(await session.page.getByRole("alert").count(), 0, item.name);
    assert.deepEqual(session.errors, [], item.name);
    await session.page.close();
  }

  const preReserveFailures = [
    {
      name: "pre-reserve-503",
      status: 503,
      body: { error: "AI interpretation is temporarily unavailable." },
    },
    {
      name: "pre-reserve-429",
      status: 429,
      body: { error: "Too many AI interpretation requests. Please try again later." },
    },
  ];
  for (const item of preReserveFailures) {
    const session = await withIdempotentAi(async ({ route, attempt }) => {
      if (attempt === 1) return { status: item.status, body: item.body };
      return successDecision(route);
    });
    await session.page.getByRole("button", { name: "Generate AI interpretation", exact: true }).click();
    await session.page.getByRole("alert").getByRole("button", { name: "Retry" }).click();
    await session.page.locator(".ena-ai-result").waitFor();
    assert.equal(session.operations.length, 2, item.name);
    assert.equal(session.operations[0], session.operations[1], `${item.name} keeps the unconsumed operation id`);
    assert.deepEqual(session.statuses, [item.status, 200], item.name);
    assert.deepEqual(session.errors, [], item.name);
    await session.page.close();
  }

  const thrownFetch = await withIdempotentAi(async ({ route, attempt }) => {
    if (attempt === 1) return { abort: true };
    return successDecision(route);
  });
  await thrownFetch.page.getByRole("button", { name: "Generate AI interpretation", exact: true }).click();
  await thrownFetch.page.getByRole("alert").getByRole("button", { name: "Retry" }).click();
  await thrownFetch.page.locator(".ena-ai-result").waitFor();
  assert.equal(thrownFetch.operations[0], thrownFetch.operations[1], "a fetch that threw before a response reuses the operation id");
  assert.equal(thrownFetch.statuses.at(-1), 200);
  assert.equal(thrownFetch.statuses.includes(409), false);
  assert.deepEqual(thrownFetch.errors, []);
  await thrownFetch.page.close();

  const thrownAfterReserve = await withIdempotentAi(async ({ route, attempt, consume }) => {
    if (attempt === 1) {
      consume();
      return { abort: true };
    }
    return successDecision(route);
  });
  await thrownAfterReserve.page.getByRole("button", { name: "Generate AI interpretation", exact: true }).click();
  const thrownAlert = thrownAfterReserve.page.getByRole("alert");
  await thrownAlert.waitFor();
  await thrownAlert.getByRole("button", { name: "Retry" }).click();
  await thrownAfterReserve.page.getByText(replayError).waitFor();
  assert.equal(thrownAfterReserve.operations[0], thrownAfterReserve.operations[1], "an unknown network failure must not mint a second billable id");
  assert.equal(thrownAfterReserve.statuses[1], 409);
  await thrownAfterReserve.page.getByRole("alert").getByRole("button", { name: "Retry" }).click();
  await thrownAfterReserve.page.locator(".ena-ai-result").waitFor();
  assert.equal(thrownAfterReserve.operations.length, 3);
  assert.notEqual(thrownAfterReserve.operations[2], thrownAfterReserve.operations[0]);
  assert.equal(thrownAfterReserve.statuses[2], 200);
  assert.deepEqual(thrownAfterReserve.errors, []);
  await thrownAfterReserve.page.close();

  const retained = await withIdempotentAi(async ({ route, attempt, consume }) => {
    consume();
    if (attempt === 1) {
      const body = syntheticInterpretation(route.request().postDataJSON());
      body.interpretation.observedPatterns[0].statement = "Earlier aggregate pattern retained for the same evidence.";
      return { status: 200, body };
    }
    return {
      status: 502,
      body: { error: "The AI interpretation provider request failed.", failureClass: "invalid-output" },
    };
  });
  const retainedGenerate = retained.page.getByRole("button", { name: "Generate AI interpretation", exact: true });
  await retainedGenerate.click();
  await retained.page.locator(".ena-ai-result").waitFor();
  await retainedGenerate.click();
  const retainedAlert = retained.page.getByRole("alert");
  await retainedAlert.waitFor();
  assert.equal(retained.operations.length, 2);
  assert.notEqual(retained.operations[0], retained.operations[1], "regeneration after success uses a new operation id");
  assert.equal(retained.statuses.includes(409), false);
  assert.match(await retainedAlert.innerText(), /could not be used as an interpretation/);
  assert.equal(
    (await retainedAlert.locator("[data-ena-ai-evidence-boundary='previous-interpretation-retained']").innerText()).trim(),
    retainedBoundary,
  );
  assert.equal(await retainedAlert.locator("[data-ena-ai-evidence-boundary='results-remain-valid']").count(), 0);
  assert.doesNotMatch(await retainedAlert.innerText(), /Only the AI interpretation is missing/);
  assert.equal(
    (await retained.page.locator("[data-ena-ai-retained-interpretation='previous']").innerText()).trim(),
    "Previous interpretation",
  );
  assert.match(await retained.page.locator(".ena-ai-result").innerText(), /Earlier aggregate pattern retained for the same evidence/);
  assert.deepEqual(retained.errors, []);
  await retained.page.close();

  const generateDouble = await browser.newPage();
  const generateDoubleOps = [];
  let releaseGenerateDouble = () => {};
  const generateDoubleReleased = new Promise((resolve) => { releaseGenerateDouble = resolve; });
  await generateDouble.route("**/*", async (route) => {
    if (new URL(route.request().url()).pathname === "/api/open-ena/ai-interpretation") {
      generateDoubleOps.push(route.request().headers()["x-open-ena-ai-operation-id"]);
      await generateDoubleReleased;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Synthetic unavailable response" }),
      });
    }
    return route.fulfill({ contentType: "text/html", body: focusDocument });
  });
  await generateDouble.goto("http://localhost:32119");
  await generateDouble.addScriptTag({ content: focusHarness.outputFiles[0].text });
  await generateDouble.getByRole("checkbox").check();
  await generateDouble.evaluate(() => {
    const button = document.querySelector(".ena-ai-actions button");
    button.click();
    button.click();
  });
  await generateDouble.waitForFunction(() => document.querySelector(".ena-ai-interpretation")?.getAttribute("aria-busy") === "true");
  await generateDouble.waitForTimeout(80);
  assert.equal(generateDoubleOps.length, 1, "double click on Generate sends exactly one request");
  releaseGenerateDouble();
  await generateDouble.getByRole("alert").waitFor();
  await generateDouble.close();

  const generateEnter = await browser.newPage();
  const generateEnterOps = [];
  let releaseGenerateEnter = () => {};
  const generateEnterReleased = new Promise((resolve) => { releaseGenerateEnter = resolve; });
  await generateEnter.route("**/*", async (route) => {
    if (new URL(route.request().url()).pathname === "/api/open-ena/ai-interpretation") {
      generateEnterOps.push(route.request().headers()["x-open-ena-ai-operation-id"]);
      await generateEnterReleased;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Synthetic unavailable response" }),
      });
    }
    return route.fulfill({ contentType: "text/html", body: focusDocument });
  });
  await generateEnter.goto("http://localhost:32119");
  await generateEnter.addScriptTag({ content: focusHarness.outputFiles[0].text });
  await generateEnter.getByRole("checkbox").check();
  const generateEnterButton = generateEnter.getByRole("button", { name: "Generate AI interpretation", exact: true });
  await generateEnterButton.focus();
  await generateEnter.keyboard.down("Enter");
  await generateEnter.keyboard.down("Enter");
  await generateEnter.waitForFunction(() => document.querySelector(".ena-ai-interpretation")?.getAttribute("aria-busy") === "true");
  await generateEnter.waitForTimeout(80);
  assert.equal(generateEnterOps.length, 1, "Enter repeat on Generate sends exactly one request");
  await generateEnter.keyboard.up("Enter");
  releaseGenerateEnter();
  await generateEnter.getByRole("alert").waitFor();
  await generateEnter.close();

  const retryDouble = await withIdempotentAi(async ({ route, attempt, consume }) => {
    if (attempt === 1) {
      consume();
      return {
        status: 502,
        body: { error: "The AI interpretation provider request failed.", failureClass: "invalid-output" },
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
    return successDecision(route);
  });
  await retryDouble.page.getByRole("button", { name: "Generate AI interpretation", exact: true }).click();
  await retryDouble.page.getByRole("alert").waitFor();
  await retryDouble.page.evaluate(() => {
    const button = document.querySelector("button[data-ena-ai-recovery='retry']");
    button.click();
    button.click();
  });
  await retryDouble.page.locator(".ena-ai-result").waitFor();
  assert.equal(retryDouble.operations.length, 2, "double click on Retry sends exactly one new request");
  assert.notEqual(retryDouble.operations[0], retryDouble.operations[1]);
  assert.equal(retryDouble.statuses.includes(409), false);
  assert.deepEqual(retryDouble.errors, []);
  await retryDouble.page.close();

  let releaseRetryEnter = () => {};
  const retryEnterReleased = new Promise((resolve) => { releaseRetryEnter = resolve; });
  const retryEnter = await withIdempotentAi(async ({ route, attempt, consume }) => {
    if (attempt === 1) {
      consume();
      return {
        status: 502,
        body: { error: "The AI interpretation provider request failed.", failureClass: "invalid-output" },
      };
    }
    await retryEnterReleased;
    return successDecision(route);
  });
  await retryEnter.page.getByRole("button", { name: "Generate AI interpretation", exact: true }).click();
  const retryEnterButton = retryEnter.page.getByRole("alert").getByRole("button", { name: "Retry" });
  await retryEnterButton.waitFor();
  await retryEnterButton.focus();
  await retryEnter.page.keyboard.down("Enter");
  await retryEnter.page.keyboard.down("Enter");
  await retryEnter.page.waitForFunction(() => document.querySelector(".ena-ai-interpretation")?.getAttribute("aria-busy") === "true");
  await retryEnter.page.waitForTimeout(80);
  assert.equal(retryEnter.operations.length, 2, "Enter repeat on Retry sends exactly one new request");
  assert.notEqual(retryEnter.operations[0], retryEnter.operations[1]);
  await retryEnter.page.keyboard.up("Enter");
  releaseRetryEnter();
  await retryEnter.page.locator(".ena-ai-result").waitFor();
  assert.equal(retryEnter.statuses.includes(409), false);
  assert.deepEqual(retryEnter.errors, []);
  await retryEnter.page.close();

  console.log("AI explicit retry: renewed confirmed failure, retained uncertain operation, auth-required uses sign-in, classed recovery copy, single in-flight retry, stale result dropped, sign-in keeps this document, Enter retries once, focus and busy state restored, success and cancel restore focus, settled failure renews once, retained interpretation boundary PASS");
} finally { await browser.close(); }
