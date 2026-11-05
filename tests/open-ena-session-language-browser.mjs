import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { tsImport } from "tsx/esm/api";
import { chromium } from "playwright";

const { locales, localeMeta } = await tsImport("../lib/i18n.ts", import.meta.url);
const { getOpenEnaCopy } = await tsImport("../lib/open-ena-i18n.ts", import.meta.url);
const { getOpenEnaCloudCopy } = await tsImport("../lib/open-ena/cloud-copy.ts", import.meta.url);

assert.ok(existsSync("components/open-ena/OpenEnaWorkspaceSession.tsx"), "one stable session owner must pass language to both local and cloud workspaces");
const retention = await readFile("tests/open-ena-ai-interpretation-retention-browser.mjs", "utf8");
const start = retention.indexOf("const entry = `") + "const entry = `".length;
const end = retention.indexOf("\n`;", start);
let entry = retention.slice(start, end).replace("import OpenEnaWorkspace from './components/open-ena/OpenEnaWorkspace';", "import OpenEnaWorkspaceSession from './components/open-ena/OpenEnaWorkspaceSession';");
entry = entry.replace(/createRoot\(document.getElementById\('root'\)\)\.render\([\s\S]*$/u, `
window.cloudBridge = { current: null };
createRoot(document.getElementById('root')).render(<OpenEnaWorkspaceSession initialLocale="en"
  accountId={window.registered ? 'synthetic-account' : undefined} operationOwnerKey={operationOwnerKey}
  initialSource={{ dataset: data, datasetSha256: 'c'.repeat(64), drafts }} worker={worker} cloudBridge={window.cloudBridge} />);
`);
const bundle = await build({ stdin: { contents: entry, loader: "tsx", resolveDir: process.cwd() }, bundle: true, define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" }, format: "iife", platform: "browser", jsx: "automatic", write: false, logLevel: "silent" });
const browser = await chromium.launch({ headless: true });
try {
  for (const registered of [false, true]) {
    const page = await browser.newPage();
    const errors = [], api = [];
    page.setDefaultTimeout(10_000);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith("/api/")) {
        api.push(url.pathname);
        assert.ok(url.pathname.startsWith("/api/open-ena/projects"), "language changes must never dispatch AI");
        return route.fulfill({ contentType: "application/json", body: JSON.stringify({ projects: [], usedBytes: 0, projectCount: 0, limits: { projects: 50, bytes: 209715200, snapshotBytes: 16777216 } }) });
      }
      return route.fulfill({ contentType: "text/html", body: '<!doctype html><div id="root"></div>' });
    });
    await page.goto("http://localhost:31996/en/open-ena");
    await page.evaluate((value) => { window.registered = value; }, registered);
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByTestId("open-ena-workspace-v3").waitFor().catch((error) => { throw new Error(JSON.stringify({ errors, registered, message: error.message })); });
    await page.getByRole("button", { name: "Model", exact: true }).click();
    await page.getByTestId("open-ena-run-model").click();
    await page.waitForFunction(() => window.jobs.length === 1);
    await page.evaluate(() => window.resolveRun(0));
    await page.waitForFunction(() => document.querySelector('[data-testid="open-ena-workspace-v3"]').dataset.resultStatus === "current");
    await page.getByRole("button", { name: "Stats & Export", exact: true }).click();
    await page.getByRole("button", { name: "Non-parametric", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector(".ena-ai-consent input").disabled);
    const originalUrl = page.url();
    await page.evaluate(() => { window.workspaceNode = document.querySelector('[data-testid="open-ena-workspace-v3"]'); });
    let snapshot;
    if (!registered) {
      snapshot = await page.evaluate(async () => JSON.stringify(await window.cloudBridge.current.capture()));
      assert.ok(JSON.parse(snapshot).analysis, "fixture must contain a completed model");
      assert.ok(JSON.parse(snapshot).statisticsReport, "fixture must contain confirmed statistics");
    }
    const picker = page.getByTestId("open-ena-workspace-language");
    assert.deepEqual(await picker.locator("option").evaluateAll((options) => options.map((option) => option.value)), locales);
    for (const locale of locales) {
      const copy = getOpenEnaCopy(locale);
      await page.getByTestId("open-ena-workspace-language").selectOption(locale);
      assert.equal(await page.getByTestId("open-ena-workspace-language").inputValue(), locale);
      const root = page.getByTestId("open-ena-workspace-v3");
      assert.equal(await root.getAttribute("lang"), localeMeta[locale].htmlLang);
      assert.equal(await root.getAttribute("dir"), localeMeta[locale].dir);
      await page.getByRole("button", { name: copy.modes.model, exact: true }).click();
      const model = page.locator(".ena-control-content[data-mode=model]");
      assert.equal(await model.getAttribute("dir"), localeMeta[locale].dir);
      const windows = model.locator('[data-model-tab="windows"]');
      assert.ok((await windows.textContent()).includes(copy.modelV3.tabs.tabs.windows), locale);
      await windows.click();
      assert.equal(await windows.getAttribute("aria-selected"), "true");
      await page.getByRole("button", { name: copy.modes.stats, exact: true }).click();
      const exports = page.getByTestId("open-ena-export-current-analysis");
      assert.ok((await exports.textContent()).includes(copy.modelV3.workspace.artifacts.exportAnalysis), locale);
      await page.getByRole("button", { name: copy.aiInterpretation.title, exact: true }).click();
      assert.ok((await page.locator(".ena-ai-mode-panel").innerText()).includes(copy.aiInterpretation.consentLabel), locale);
      await page.getByRole("button", { name: copy.modes.stats, exact: true }).click();
      assert.equal(page.url(), originalUrl, "language selection must not navigate");
      assert.equal(await page.evaluate(() => document.querySelector('[data-testid="open-ena-workspace-v3"]') === window.workspaceNode), true, "workspace DOM and state must remain mounted");
      assert.equal(await page.getByTestId("open-ena-workspace-v3").getAttribute("data-result-status"), "current");
      assert.equal(await page.evaluate(() => window.jobs.length), 1, "language must not rebuild the model");
      assert.equal(await page.locator('.ena-rail-logout input[name="locale"]').inputValue(), locale);
      const links = await page.locator(".ena-site-navigation a").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
      for (const href of links) if (href?.startsWith("/")) assert.ok(href.startsWith(`/${locale}/`) || href === `/${locale}`, href);
      if (registered) {
        assert.equal(await page.locator(".open-ena-cloud-save").first().textContent(), getOpenEnaCloudCopy(locale).save);
      } else {
        const current = JSON.parse(await page.evaluate(async () => JSON.stringify(await window.cloudBridge.current.capture())));
        const before = JSON.parse(snapshot);
        for (const key of ["dataset", "drafts", "analysis", "presentation", "statisticsReport", "aiInterpretation", "analysisSets", "setComparison", "historicalImports"]) assert.deepEqual(current[key], before[key], `${locale}: ${key} remains unchanged`);
      }
    }
    assert.deepEqual(api, [], "switching language requires no network request");
    await page.getByTestId("open-ena-workspace-language").selectOption("zh-hant");
    await page.reload();
    await page.evaluate((value) => { window.registered = value; }, registered);
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    assert.equal(await page.getByTestId("open-ena-workspace-language").inputValue(), "en", "reload uses initial URL locale");
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Stable session language: local and registered cloud workspace preserve model state without navigation or requests PASS");
} finally { await browser.close(); }
