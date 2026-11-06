// Focused regression for the 2026-11-05 external report, against an isolated build.
// Official synthetic samples only; no model-provider call or external mail send.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { startPluginLabFixture } from "./support/plugin-lab-fixture.mjs";
import { createOpenEnaSessionTokenV2, OPEN_ENA_SESSION_COOKIE } from "../lib/open-ena-auth.ts";

const directory = resolve("output/playwright/report-verification-20261106");
mkdirSync(directory, { recursive: true });
const report = { startedAt: new Date().toISOString(), syntheticOnly: true, checks: [], headers: [], downloads: [], errors: [] };
let fixture, browser, page;
async function check(name, work) {
  await work(); report.checks.push({ name, status: "pass" }); console.log(`PASS ${name}`);
}
async function download(button, filename) {
  const pending = page.waitForEvent("download");
  await button.click(); const result = await pending;
  assert.equal(await result.failure(), null);
  const path = join(directory, filename); await result.saveAs(path);
  const bytes = readFileSync(path);
  report.downloads.push({ filename, bytes: bytes.length });
  return bytes;
}
async function sample(name) {
  await page.getByRole("navigation", { name: "Analysis modes" }).getByRole("button", { name: "Data", exact: true }).click();
  await page.getByRole("button", { name, exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="open-ena-workspace-v3"]')?.getAttribute("data-result-status") === "current");
}
try {
  fixture = await startPluginLabFixture({ evidenceDirectory: directory,
    distDirectory: process.env.OPEN_ENA_REPORT_DIST_DIR || ".next-report-verification-20261106" });
  await check("GET and HEAD include host-only HSTS on redirects, account, 401 and 404", async () => {
    // Use the configured Nova route for 401. Cloud-project availability and
    // method/origin policy are outside this isolated fixture's header check.
    for (const [path, status] of [["/", 307], ["/en/open-ena/account", 200], ["/api/nova/sessions", 401], ["/report-regression-missing", 404]]) {
      for (const method of ["GET", "HEAD"]) {
        const response = await fetch(fixture.origin + path, { method, redirect: "manual" });
        const hsts = response.headers.get("strict-transport-security");
        report.headers.push({ path, method, status: response.status, hsts });
        const expectedStatus = path === "/api/nova/sessions" && method === "HEAD" ? 405 : status;
        assert.equal(response.status, expectedStatus); assert.equal(hsts, "max-age=86400");
        await response.body?.cancel();
      }
    }
  });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1180, height: 757 }, acceptDownloads: true });
  await context.route("**/*", route => new URL(route.request().url()).origin === fixture.origin ? route.continue() : route.abort());
  await context.addCookies([{ name: OPEN_ENA_SESSION_COOKIE, value: createOpenEnaSessionTokenV2(Date.now(), fixture.environment),
    url: fixture.origin, httpOnly: true, secure: true, sameSite: "Lax" }]);
  page = await context.newPage(); page.setDefaultTimeout(20_000);
  page.on("pageerror", error => report.errors.push(error.message));
  page.on("dialog", dialog => dialog.accept());
  await page.goto(`${fixture.origin}/en/open-ena`);
  await page.getByTestId("open-ena-workspace-v3").waitFor();
  await check("official Endpoint builds and exports a parseable model plus SVG and PNG bytes", async () => {
    await sample("Load sample");
    const model = JSON.parse((await download(page.getByRole("button", { name: "Download Model", exact: true }), "endpoint-model.json")).toString());
    assert.equal(model.kind, "open-ena-analysis-bundle"); assert.equal(model.schemaVersion, 3);
    const svg = await download(page.getByRole("button", { name: "Export SVG", exact: true }), "endpoint.svg");
    assert.match(svg.toString(), /<svg\b/u); assert.match(svg.toString(), /<\/svg>/u);
    const png = await download(page.getByRole("button", { name: "Export PNG", exact: true }), "endpoint.png");
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.ok(png.readUInt32BE(16) > 0 && png.readUInt32BE(20) > 0);
  });
  await check("official ONA builds and exports a parseable model", async () => {
    await sample("Load ONA sample");
    const model = JSON.parse((await download(page.getByRole("button", { name: "Download Model", exact: true }), "ona-model.json")).toString());
    assert.equal(model.schemaVersion, 3);
  });
  await sample("Load trajectory sample");
  await download(page.getByRole("button", { name: "Download Model", exact: true }), "trajectory-model.json");
  await page.getByRole("navigation", { name: "Analysis modes" }).getByRole("button", { name: "Stats & Export", exact: true }).click();
  const stats = page.locator(".ena-workspace-stats-v3");
  await stats.getByRole("combobox", { name: /^Trajectory inference design/u }).selectOption("paired");
  await stats.getByRole("checkbox", { name: "I confirm these fitted Units identify the same entities across periods.", exact: true }).check();
  const period = name => stats.getByRole("checkbox", { name: new RegExp(name) });
  const clearPeriods = async () => { for (const name of ["TP1", "TP2", "TP3"]) await period(name).uncheck(); };
  await check("reversed periods show the actual click order and a specific error, then recover", async () => {
    await clearPeriods(); await period("TP3").check(); await period("TP1").check();
    assert.match(await stats.getByTestId("open-ena-selected-period-order").innerText(), /TP3.*→.*TP1/u);
    await stats.getByRole("button", { name: "Run confirmed inference", exact: true }).click();
    const issue = stats.getByRole("alert").filter({ hasText: "The selected periods are reversed" });
    await issue.waitFor(); await issue.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(directory, "period-order-error.png") });
    await clearPeriods(); await period("TP1").check(); await period("TP3").check();
    assert.equal(await page.getByRole("alert").filter({ hasText: "The selected periods are reversed" }).count(), 0);
    await stats.getByRole("button", { name: "Run confirmed inference", exact: true }).click();
    await download(stats.getByRole("button", { name: "Export native statistics", exact: true }), "paired-statistics.json");
  });
  const pathPanel = page.getByTestId("open-ena-native-trajectory-analysis");
  await pathPanel.getByRole("checkbox", { name: "I confirm that the entity histories in these two Groups are independent.", exact: true }).check();
  await pathPanel.getByRole("button", { name: "Run whole-path comparison", exact: true }).click();
  await pathPanel.getByText("Whole-path comparison current", { exact: true }).waitFor();
  await check("Whole-path full-precision cells remain on one line at desktop and narrow widths", async () => {
    const table = pathPanel.getByTestId("open-ena-native-trajectory-path-statistics");
    assert.equal(await table.locator("tbody tr").count(), 14);
    report.pathRows = await table.locator("tbody tr").evaluateAll(rows => rows.map(row => [...row.cells].map(cell => cell.textContent)));
    const scroll = pathPanel.getByRole("region", { name: "Whole-path statistics", exact: true });
    for (const width of [1180, 500]) {
      await page.setViewportSize({ width, height: 757 }); await scroll.scrollIntoViewIfNeeded();
      const layout = await scroll.evaluate(node => ({ clientWidth: node.clientWidth, scrollWidth: node.scrollWidth,
        cells: [...node.querySelectorAll("th,td")].map(cell => { const range = document.createRange(); range.selectNodeContents(cell);
          return { text: cell.textContent, lines: range.getClientRects().length, whiteSpace: getComputedStyle(cell).whiteSpace }; }) }));
      (report.layouts ??= []).push({ width, ...layout });
      assert.ok(layout.scrollWidth > layout.clientWidth);
      assert.ok(layout.cells.every(cell => (!cell.text || cell.lines === 1) && cell.whiteSpace === "nowrap"));
      await scroll.evaluate(node => { node.scrollLeft = 0; }); await scroll.focus(); await page.keyboard.press("ArrowRight");
      await page.waitForFunction(() => document.querySelector(".ena-path-statistics-scroll").scrollLeft > 0);
      await page.screenshot({ path: join(directory, `whole-path-${width}.png`) });
      await scroll.evaluate(node => { node.scrollLeft = Math.min(node.scrollWidth - node.clientWidth, 330); });
      await page.screenshot({ path: join(directory, `whole-path-values-${width}.png`) });
    }
    await download(pathPanel.getByRole("button", { name: "Export trajectory bundle", exact: true }), "trajectory-analysis.zip");
  });
  await check("changed periods retire earlier statistics and disable stale path exports", async () => {
    await period("TP3").uncheck();
    assert.equal(await pathPanel.getByTestId("open-ena-native-trajectory-path-statistics").count(), 0);
    assert.equal(await pathPanel.getByRole("button", { name: "Export trajectory bundle", exact: true }).isDisabled(), true);
    assert.equal(await stats.getByRole("button", { name: /^Export native statistics/u }).isDisabled(), true);
  });
  assert.deepEqual(report.errors, []);
  assert.equal(fixture.messages.length, 0);
  report.status = "pass";
} catch (error) {
  report.status = "fail"; report.failure = error.stack; process.exitCode = 1;
  if (page) { await page.screenshot({ path: join(directory, "failure.png") }).catch(() => {});
    writeFileSync(join(directory, "failure-visible-text.txt"), await page.locator("body").innerText().catch(() => "")); }
  console.error(error);
} finally {
  await browser?.close(); await fixture?.cleanup();
  report.finishedAt = new Date().toISOString();
  writeFileSync(join(directory, "verification.json"), JSON.stringify(report, null, 2));
}
