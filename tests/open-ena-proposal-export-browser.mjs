// Focused regression checks against an owned production build and local services.
// Run: npm run build && npm run test:browser:proposal-export
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { startPluginLabFixture, mailText } from "./support/plugin-lab-fixture.mjs";
import { createOpenEnaSessionTokenV2, OPEN_ENA_SESSION_COOKIE } from "../lib/open-ena-auth.ts";
import { getPluginWorkflowCopy } from "../lib/plugin-lab/workflow-i18n.ts";
import { getPluginLabCopy } from "../lib/plugin-lab/i18n.ts";
import { getOpenEnaCopy } from "../lib/open-ena-i18n.ts";

const directory = resolve(process.env.OPEN_ENA_PRIORITY_FIXES_ARTIFACT_DIR ?? "output/playwright/priority-fixes");
mkdirSync(directory, { recursive: true });
const report = { status: "running", syntheticOnly: true, checks: [] };
let fixture, browser;
const contexts = [];
async function check(name, action) {
  try { await action(); report.checks.push({ name, status: "pass" }); console.log(`PASS ${name}`); }
  catch (error) { report.checks.push({ name, status: "fail", message: error.message }); console.log(`FAIL ${name}: ${error.message}`); process.exitCode = 1; }
}
async function pageFor(path, authenticated = false) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  contexts.push(context);
  await context.route("**/*", route => new URL(route.request().url()).origin === fixture.origin ? route.continue() : route.abort());
  if (authenticated) await context.addCookies([{ name: OPEN_ENA_SESSION_COOKIE, value: createOpenEnaSessionTokenV2(Date.now(), fixture.environment), url: fixture.origin, httpOnly: true, secure: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  await page.goto(`${fixture.origin}${path}`);
  return page;
}
async function language(page, locale) {
  await page.locator(".desktop-language .language-button").click();
  await page.locator(`.desktop-language .language-option[href='/${locale}/plugins/propose']`).click();
  await page.waitForURL(`${fixture.origin}/${locale}/plugins/propose`);
  await page.getByRole("heading", { name: getPluginLabCopy(locale).propose, exact: true }).waitFor();
}
const draft = {
  title: "Synthetic proposal / 合成提案",
  researchQuestion: "How do synthetic discussion networks change across lessons?\n保留第二行。",
  proposedChange: "Show aligned network views for each synthetic lesson.",
  name: "Synthetic Researcher", affiliation: "Synthetic Lab", currentGap: "Current gap",
  unchangedBoundary: "Keep the fitted space", privateDetails: "Synthetic private draft text",
  referenceLinks: "https://example.org/paper", publicSummary: "Synthetic public summary",
};
async function fillDraft(page, email) {
  await page.locator(".plugin-extra-details summary").click();
  await page.locator('input[name="visibility"][value="public-after-review"]').check();
  for (const [field, value] of Object.entries(draft)) await page.locator(`#plugin-${field}`).fill(value);
  await page.locator("#plugin-email").fill(email);
  await page.locator("#plugin-track").selectOption("academic");
  await page.locator("#plugin-dataSafetyConfirmed").check();
  await page.locator("#plugin-privacyConsent").check();
}
async function assertDraft(page, email) {
  for (const [field, value] of Object.entries(draft)) assert.equal(await page.locator(`#plugin-${field}`).inputValue(), value, `Preserve ${field}`);
  assert.equal(await page.locator("#plugin-email").inputValue(), email);
  assert.equal(await page.locator("#plugin-track").inputValue(), "academic");
  assert.equal(await page.locator('input[name="visibility"]:checked').inputValue(), "public-after-review");
  assert.equal(await page.locator("#plugin-dataSafetyConfirmed").isChecked(), true);
  assert.equal(await page.locator("#plugin-privacyConsent").isChecked(), true);
}
async function verifyEmail(page, email) {
  const copy = getPluginWorkflowCopy("en");
  const response = page.waitForResponse(r => r.url().endsWith("/api/plugin-lab/email-code/request"));
  await page.getByRole("button", { name: copy.sendCode, exact: true }).click();
  assert.equal((await response).status(), 202);
  const message = fixture.messages.findLast(m => m.recipients.includes(email));
  assert.ok(message?.secure);
  const code = /\b(\d{6})\b/u.exec(mailText(message))?.[1];
  assert.ok(code);
  await page.locator("#plugin-email-code").fill(code);
  await page.getByRole("button", { name: copy.verifyEmail, exact: true }).click();
  await page.getByText(`✓ ${copy.verified}`, { exact: true }).waitFor();
}
try {
  fixture = await startPluginLabFixture({ evidenceDirectory: directory });
  browser = await chromium.launch({ headless: true });
  await check("proposal fields survive language navigation without browser persistence or submission", async () => {
    const page = await pageFor("/en/plugins/propose");
    let posts = 0;
    page.on("request", r => { if (r.method() === "POST") posts++; });
    await fillDraft(page, "draft@example.org");
    for (const locale of ["zh-hans", "zh-hant", "en"]) { await language(page, locale); await assertDraft(page, "draft@example.org"); }
    assert.equal(posts, 0, "Language navigation must not submit or send mail");
    const persisted = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
    assert.equal(persisted.includes(draft.privateDetails), false);
    assert.equal(persisted.includes("draft@example.org"), false);
    await page.screenshot({ path: join(directory, "proposal-retained.png"), fullPage: false });
    const isolated = await pageFor("/en/plugins/propose");
    assert.equal(await isolated.locator("#plugin-title").inputValue(), "", "A different browser context must not receive the draft");
    await page.reload();
    assert.equal(await page.locator("#plugin-title").inputValue(), "", "Draft is memory-only, not persisted across reload");
  });
  await check("an uncertain proposal keeps its lock and retry identity across language navigation", async () => {
    const page = await pageFor("/en/plugins/propose");
    await fillDraft(page, "retry-language@example.org");
    await verifyEmail(page, "retry-language@example.org");
    const attempts = [];
    let releaseFirstResponse;
    const firstResponseGate = new Promise(resolve => { releaseFirstResponse = resolve; });
    let firstWriteCommitted;
    const committed = new Promise(resolve => { firstWriteCommitted = resolve; });
    await page.route("**/api/plugin-lab/proposals", async route => {
      attempts.push({ key: route.request().headers()["idempotency-key"], body: route.request().postData() });
      const response = await route.fetch();
      if (attempts.length === 1) {
        assert.equal(response.status(), 201);
        firstWriteCommitted();
        await firstResponseGate;
        await route.abort("failed");
      }
      else await route.fulfill({ response });
    });
    await page.getByRole("button", { name: getPluginWorkflowCopy("en").submit, exact: true }).click();
    try {
      await committed;
      await language(page, "zh-hant");
      await assertDraft(page, "retry-language@example.org");
      assert.equal(await page.locator("#plugin-title").isDisabled(), true, "The in-flight submission remains locked");
      assert.equal(await page.locator('.plugin-proposal-form button[type="submit"]').isDisabled(), true);
    } finally { releaseFirstResponse(); }
    await page.getByRole("button", { name: getPluginWorkflowCopy("zh-hant").retrySubmission, exact: true }).waitFor();
    await language(page, "zh-hans");
    await assertDraft(page, "retry-language@example.org");
    assert.equal(await page.locator("#plugin-title").isDisabled(), true);
    assert.equal(await page.locator("#plugin-email").getAttribute("readonly"), "");
    await page.getByRole("button", { name: getPluginWorkflowCopy("zh-hans").retrySubmission, exact: true }).click();
    await page.locator(".plugin-receipt code").waitFor();
    const proposalId = await page.locator(".plugin-receipt code").innerText();
    assert.deepEqual(attempts[1], attempts[0]);
    assert.equal((await fixture.database.query("SELECT count(*)::int AS count FROM ena_plugin_proposals")).rows[0].count, 1);
    await language(page, "zh-hant");
    assert.equal(await page.locator(".plugin-receipt code").innerText(), proposalId, "A completed receipt cannot become a second submission");
    // Leaving a completed proposal starts a fresh form when the researcher returns.
    await page.locator(".desktop-nav a[href='/zh-hant/plugins']").click();
    await page.waitForURL(`${fixture.origin}/zh-hant/plugins`);
    await page.getByRole("link", { name: getPluginLabCopy("zh-hant").propose, exact: true }).click();
    await page.locator("#plugin-title").waitFor();
    assert.equal(await page.locator("#plugin-title").inputValue(), "");
  });
  await check("Data View disables SVG/PNG with a localized explanation and plot return restores downloads", async () => {
    const page = await pageFor("/en/open-ena", true);
    let confirmations = 0;
    page.on("dialog", async dialog => { confirmations++; await dialog.accept(); });
    for (const [sample, locale, dataset] of [["Load sample", "en", "ena-design-talk-sample.typed.xlsx"], ["Load trajectory sample", "zh-hans", "ena-2d-trajectory-teaching-sample.typed.xlsx"], ["Load ONA sample", "zh-hant", "ena-design-talk-sample.typed.xlsx"]]) {
      await page.getByTestId("open-ena-workspace-language").selectOption("en");
      await page.getByRole("button", { name: "Data", exact: true }).click();
      await page.getByRole("button", { name: sample, exact: true }).click();
      await page.locator(".ena-visual-toolbar").getByText(dataset, { exact: true }).waitFor();
      await page.waitForFunction(() => document.querySelector('[data-testid="open-ena-workspace-v3"]')?.getAttribute("data-result-status") === "current");
      await page.getByTestId("open-ena-workspace-language").selectOption(locale);
      const copy = getOpenEnaCopy(locale).modelV3.workspace;
      const svg = page.getByRole("button", { name: copy.toolbar.exportSvg, exact: true });
      const png = page.getByRole("button", { name: copy.toolbar.exportPng, exact: true });
      await page.waitForFunction(label => [...document.querySelectorAll("button")].some(b => b.textContent === label && !b.disabled), copy.toolbar.exportSvg);
      await page.getByTestId("open-ena-data-view-toggle").click();
      assert.equal(await svg.isDisabled(), true, `${sample}: SVG is unavailable while Data View replaces the plot`);
      assert.equal(await png.isDisabled(), true, `${sample}: PNG is unavailable while Data View replaces the plot`);
      const note = page.getByRole("note").filter({ hasText: copy.toolbar.returnToPlotForImageExport });
      await note.waitFor();
      assert.equal(await svg.getAttribute("aria-describedby"), await note.getAttribute("id"));
      assert.equal(await png.getAttribute("aria-describedby"), await note.getAttribute("id"));
      if (locale === "zh-hans") await page.screenshot({ path: join(directory, "data-view-export-disabled.png"), fullPage: false });
      await page.getByTestId("open-ena-data-view-toggle").click();
      for (const [button, extension] of [[svg, ".svg"], [png, ".png"]]) {
        assert.equal(await button.isEnabled(), true);
        const download = page.waitForEvent("download");
        await button.click();
        const file = await download;
        assert.ok(file.suggestedFilename().endsWith(extension));
        assert.equal(await file.failure(), null);
        await file.saveAs(join(directory, `${locale}-plot${extension}`));
        const bytes = readFileSync(join(directory, `${locale}-plot${extension}`));
        assert.ok(bytes.length > 1000, "The image download contains rendered content");
        if (extension === ".svg") assert.match(bytes.toString("utf8"), /<svg\b/u);
        else assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
      }
    }
    assert.equal(confirmations, 6, "Each enabled image export retains its identity confirmation");
  });
} catch (error) {
  process.exitCode = 1;
  report.checks.push({ name: "browser runtime", status: "fail", message: error.message });
} finally {
  for (const cleanup of [...contexts.map(context => () => context.close()), () => browser?.close(), () => fixture?.cleanup()]) {
    try { await cleanup(); }
    catch (error) { process.exitCode = 1; report.checks.push({ name: "owned runtime cleanup", status: "fail", message: error.message }); }
  }
  report.status = process.exitCode ? "fail" : "pass";
  writeFileSync(join(directory, "report.json"), JSON.stringify(report, null, 2));
}
