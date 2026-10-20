import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { chromium } from "playwright";

// Real Workspace + its stylesheet, synthetic source, no server or external calls.
const fixture = await readFile("tests/open-ena-model-v3-workspace-browser.mjs", "utf8");
const entry = fixture.split("const entry = `")[1].split("`;\nconst bundle")[0];
const bundles = new Map();
for (const state of ["empty", "loaded"]) {
  const contents = state === "empty" ? entry.replace("initialSource={{dataset:data,datasetSha256:'a'.repeat(64),drafts}}", "") : entry;
  const bundle = await build({ stdin: { contents, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, format: "iife", platform: "browser", jsx: "automatic", write: false, logLevel: "silent" });
  bundles.set(state, bundle.outputFiles[0].text);
}
const css = await readFile("app/globals.css", "utf8");
const source = await readFile("tests/open-ena-models-v3-browser-smoke.mjs", "utf8");
const contract = source.slice(source.indexOf("async function workspaceModeStyleContract("), source.indexOf("async function allWorkspaceModeStyles("));
const browser = await chromium.launch({ headless: true });
try {
  for (const state of ["empty", "loaded"]) for (const width of [1440, 1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => {
      assert.equal(new URL(route.request().url()).origin, "http://localhost:32149");
      return route.fulfill({ contentType: "text/html", body: '<!doctype html><html><body><div id="root"></div></body></html>' });
    });
    await page.goto("http://localhost:32149/");
    await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: bundles.get(state) });
    const mode = name => page.getByRole("navigation", { name: "Analysis modes" }).getByRole("button", { name, exact: true }).click();
    if (state === "loaded") {
      await mode("Model");
      await page.getByTestId("open-ena-run-model").click();
      await page.waitForFunction(() => window.jobs.length === 1);
      await page.evaluate(() => window.resolveRun(0));
      await page.waitForFunction(() => document.querySelector('[data-testid="open-ena-workspace-v3"]').dataset.resultStatus === "current");
    }
    await mode("Plot Tools");
    const metrics = await page.locator(".ena-restored-view-toggle button").evaluateAll(buttons => buttons.map(node => {
      const style = getComputedStyle(node), box = node.getBoundingClientRect(), range = document.createRange();
      range.selectNodeContents(node);
      const label = range.getBoundingClientRect();
      return { text: node.textContent, width: box.width, height: box.height, minHeight: style.minHeight,
        padding: [style.paddingLeft, style.paddingRight], labelInset: [label.left - box.left, box.right - label.right],
        labelHeight: label.height, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
    }));
    console.log(JSON.stringify({ state, viewport: width, metrics }));
    const receipt = {};
    const openDisclosure = async selector => { const disclosure = page.locator(selector); if (!await disclosure.evaluate(node => node.open)) await disclosure.locator(":scope > summary").click(); };
    const run = new Function("page", "assert", "receipt", "mode", "openDisclosure", "shot", `${contract}; return workspaceModeStyleContract;`)(page, assert, receipt, mode, openDisclosure, async () => {});
    for (const name of ["Data", "Model", "Plot Tools", "Stats & Export", "AI"]) {
      try { await run(state, name); } catch (error) { console.log(JSON.stringify(receipt.workspaceModeStyleChecks.at(-1))); throw error; }
    }
    await mode("Plot Tools");
    const segment = page.locator(".ena-restored-view-toggle button").first();
    const isViewToggle = await segment.evaluate(node => node.closest(".ena-view-toggle") !== null);
    await segment.evaluate(node => { node.style.minHeight = "20px"; node.style.height = "20px"; });
    await assert.rejects(run("undersized mutation", "Plot Tools"), isViewToggle ? /view toggle height/u : /segmented button lacks a usable hit area/u);
    await segment.evaluate(node => { node.style.cssText = "font-size:500px;overflow:hidden;white-space:nowrap;min-width:0;width:60px;max-width:60px;flex:none"; });
    await assert.rejects(run("clipped-label mutation", "Plot Tools"), isViewToggle ? /view toggle clips or crowds its label/u : /segmented button clips or crowds its label/u);
    await segment.evaluate(node => node.removeAttribute("style"));
    const ordinary = page.locator('.ena-workspace-controls-v3:visible button:not([class]):not([role="tab"]):not([role="switch"])').filter({ hasText: "Reset node positions" }).first();
    assert.equal(await ordinary.count(), 1, "exercise the unchanged spacing rule on an ordinary button");
    await ordinary.evaluate(node => { node.style.paddingLeft = "0px"; });
    await assert.rejects(run("ordinary-spacing mutation", "Plot Tools"), /native button lacks usable spacing/u);
    await ordinary.evaluate(node => node.removeAttribute("style"));
    assert.deepEqual(errors, []);
    console.log(`${state} ${width}: all five mode style contracts PASS; undersized, clipped-label and ordinary-spacing mutations rejected`);
    await page.close();
  }
} finally { await browser.close(); }
