// Run after npm run build: npm run test:browser:account-language
// The owned loopback fixture never sends mail to an external service.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { startPluginLabFixture } from "./support/plugin-lab-fixture.mjs";
import { getOpenEnaCloudCopy } from "../lib/open-ena/cloud-copy.ts";
import { localeMeta, locales } from "../lib/i18n.ts";

const directory = resolve(process.env.OPEN_ENA_ACCOUNT_LANGUAGE_ARTIFACT_DIR ?? "output/playwright/account-language");
mkdirSync(directory, { recursive: true });
const report = { status: "running", checks: [], syntheticOnly: true };
const contexts = [];
let fixture, browser;
async function check(name, action) {
  try { await action(); report.checks.push({ name, status: "pass" }); console.log(`PASS ${name}`); }
  catch (error) { report.checks.push({ name, status: "fail", message: error.message }); process.exitCode = 1; console.log(`FAIL ${name}: ${error.message}`); }
}
async function newPage(path, viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport });
  contexts.push(context);
  await context.route("**/*", route => new URL(route.request().url()).origin === fixture.origin ? route.continue() : route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(8_000);
  await page.goto(`${fixture.origin}${path}`);
  return page;
}
async function focusIs(page, locator) {
  const selector = await locator.evaluate(el => {
    const scope = el.closest(".desktop-language") ? ".desktop-language" : ".mobile-locales";
    if (el.matches(".language-button")) return `${scope} .language-button`;
    if (el.matches(".menu-button")) return ".menu-button";
    return `${scope} .language-option[href="${el.getAttribute("href")}"]`;
  });
  try { await page.waitForFunction(selector => document.querySelector(selector) === document.activeElement, selector, { timeout: 3_000 }); }
  catch (error) {
    const actual = await page.evaluate(() => ({ tag: document.activeElement?.tagName, href: document.activeElement?.getAttribute("href"), text: document.activeElement?.textContent?.slice(0,100) }));
    throw new Error(`Expected focus at ${selector}; actual ${JSON.stringify(actual)}`, { cause: error });
  }
}
async function accountLanguage(page, locale, mode) {
  const query = mode === "reset" ? "?mode=reset" : "";
  await page.locator(".desktop-language .language-button").click();
  await page.locator(`.desktop-language .language-option[href='/${locale}/open-ena/account${query}']`).click();
  await page.waitForURL(`${fixture.origin}/${locale}/open-ena/account${query}`);
  const copy = getOpenEnaCloudCopy(locale);
  await page.getByRole("heading", { name: mode === "reset" ? copy.resetTitle : copy.registerTitle, exact: true }).waitFor();
}
try {
  fixture = await startPluginLabFixture({ evidenceDirectory: directory });
  browser = await chromium.launch({ headless: true });
  await check("password recovery and registration keep their mode through language changes and reload", async () => {
    const page = await newPage("/en/open-ena/account");
    const requests = [];
    page.on("request", r => { if (r.method() === "POST") requests.push(r.url()); });
    await page.getByRole("button", { name: getOpenEnaCloudCopy("en").recover, exact: true }).click();
    assert.equal(new URL(page.url()).searchParams.get("mode"), "reset", "Recovery must update the current URL");
    for (const locale of ["zh-hans", "zh-hant", "en"]) await accountLanguage(page, locale, "reset");
    await page.reload();
    await page.getByRole("heading", { name: getOpenEnaCloudCopy("en").resetTitle, exact: true }).waitFor();
    await page.getByRole("button", { name: getOpenEnaCloudCopy("en").register, exact: true }).click();
    assert.equal(new URL(page.url()).searchParams.has("mode"), false, "Registration must remove the recovery mode");
    await accountLanguage(page, "zh-hans", "register");
    await page.reload();
    await page.getByRole("heading", { name: getOpenEnaCloudCopy("zh-hans").registerTitle, exact: true }).waitFor();
    await page.getByRole("button", { name: getOpenEnaCloudCopy("zh-hans").recover, exact: true }).click();
    await accountLanguage(page, "zh-hant", "reset");
    await page.screenshot({ path: join(directory, "recovery-after-language.png"), fullPage: false });
    assert.deepEqual(requests, [], "Changing mode or language must not submit an account request");
  });
  await check("language menu supports arrows, Home/End and keyboard activation while preserving query filters", async () => {
    const page = await newPage("/en/academy?track=modeling&page=2");
    const root = page.locator(".desktop-language");
    const trigger = root.locator(".language-button:not([disabled])");
    const options = root.locator(".language-option");
    await trigger.focus();
    await trigger.press("ArrowDown");
    await focusIs(page, options.nth(0));
    assert.equal(await trigger.getAttribute("aria-expanded"), "true");
    assert.equal(await trigger.getAttribute("aria-controls"), await root.getByRole("listbox").getAttribute("id"));
    assert.equal(await root.locator('.language-option[tabindex="0"]').count(), 1);
    await page.keyboard.press("ArrowDown"); await focusIs(page, options.nth(1));
    await page.keyboard.press("ArrowUp"); await focusIs(page, options.nth(0));
    await page.keyboard.press("ArrowUp"); await focusIs(page, options.nth(locales.length - 1));
    await page.keyboard.press("Home"); await focusIs(page, options.nth(0));
    await page.keyboard.press("End"); await focusIs(page, options.nth(locales.length - 1));
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForURL(`${fixture.origin}/zh-hans/academy?track=modeling&page=2`);
    await trigger.getByText(localeMeta["zh-hans"].label, { exact: true }).waitFor();
    await trigger.press("Space");
    await focusIs(page, options.nth(2));
    await page.keyboard.press("Home");
    await page.keyboard.press("Space");
    await page.waitForURL(`${fixture.origin}/en/academy?track=modeling&page=2`);
  });
  await check("Escape restores trigger focus and Tab/outside clicks close without stealing focus", async () => {
    const page = await newPage("/en/academy");
    const root = page.locator(".desktop-language");
    const trigger = root.locator(".language-button:not([disabled])");
    const menu = root.locator(".language-menu");
    await trigger.click();
    await root.locator(".language-option").first().focus();
    await page.keyboard.press("Escape");
    await focusIs(page, trigger);
    assert.equal(await menu.isVisible(), false);
    await trigger.press("Enter");
    await page.keyboard.press("Tab");
    assert.equal(await menu.isVisible(), false);
    assert.equal(await page.evaluate(() => Boolean(document.activeElement?.getClientRects().length) && !document.activeElement?.closest(".language-switcher")), true);
    await trigger.press("ArrowUp");
    await page.keyboard.press("Shift+Tab");
    await focusIs(page, trigger);
    assert.equal(await menu.isVisible(), false);
    await trigger.click();
    await trigger.click();
    await focusIs(page, trigger);
    assert.equal(await menu.isVisible(), false, "Clicking an open trigger closes it");
    await trigger.click();
    const search = page.getByRole("searchbox");
    await search.click();
    assert.equal(await search.evaluate(el => el === document.activeElement), true);
    assert.equal(await menu.isVisible(), false);
  });
  await check("mobile language keyboard navigation restores visible focus after closing either menu", async () => {
    const page = await newPage("/en/academy", { width: 390, height: 844 });
    const mobileMenu = page.locator(".menu-button");
    await mobileMenu.click();
    const root = page.locator(".mobile-locales");
    const trigger = root.locator(".language-button:not([disabled])");
    await trigger.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await focusIs(page, root.locator(".language-option").nth(1));
    await page.keyboard.press("Escape");
    await focusIs(page, trigger);
    assert.equal(await mobileMenu.getAttribute("aria-expanded"), "true", "Escape closes only the language list");
    await trigger.press("Enter");
    await page.keyboard.press("Enter"); // Activate the current language without changing page.
    await focusIs(page, mobileMenu);
    assert.equal(await mobileMenu.getAttribute("aria-expanded"), "false");
    await mobileMenu.click(); await trigger.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.screenshot({ path: join(directory, "mobile-language-focus.png"), fullPage: false });
  });
} catch (error) {
  process.exitCode = 1;
  report.checks.push({ name: "browser runtime", status: "fail", message: error.message });
} finally {
  for (const cleanup of [...contexts.map(c => () => c.close()), () => browser?.close(), () => fixture?.cleanup()]) {
    try { await cleanup(); }
    catch (error) { process.exitCode = 1; report.checks.push({ name: "cleanup", status: "fail", message: error.message }); }
  }
  report.status = process.exitCode ? "fail" : "pass";
  writeFileSync(join(directory, "report.json"), JSON.stringify(report, null, 2));
}
