import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { chromium } from "playwright";

// Reuse the actual Workspace with only synthetic data and an in-memory worker.
const fixture = await readFile("tests/open-ena-model-v3-workspace-browser.mjs", "utf8");
const entry = fixture.split("const entry = `")[1].split("`;\nconst bundle")[0];
const bundle = await build({ stdin: { contents: entry, loader: "tsx", resolveDir: process.cwd() },
  bundle: true, format: "iife", platform: "browser", jsx: "automatic", write: false, logLevel: "silent" });
const source = await readFile("tests/open-ena-models-v3-browser-smoke.mjs", "utf8");
const start = source.indexOf("async function confirmSourceOrder()");
const helper = start < 0
  ? 'async function confirmSourceOrder() { await page.getByLabel("Use source order", { exact: true }).check(); await button("Review source-order statement").click(); await button("Accept statement").click(); }'
  : source.slice(start, source.indexOf("async function ", start + 1));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.setDefaultTimeout(1500);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => {
    assert.equal(new URL(route.request().url()).origin, "http://localhost:32151");
    return route.fulfill({ contentType: "text/html", body: '<!doctype html><html><body><div id="root"></div></body></html>' });
  });
  await page.goto("http://localhost:32151/");
  await page.addStyleTag({ content: await readFile("app/globals.css", "utf8") });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const button = name => page.getByRole("button", { name, exact: true });
  const tab = name => page.getByRole("tab", { name: new RegExp(`^${name},`) });
  const openDisclosure = async selector => { const disclosure = page.locator(selector); if (!await disclosure.evaluate(node => node.open)) await disclosure.locator(":scope > summary").click(); };
  const confirm = new Function("page", "button", "openDisclosure", `${helper}; return confirmSourceOrder;`)(page, button, openDisclosure);
  await button("Model").click();
  await tab("Windows").click();
  assert.equal(await page.getByLabel("Use source order", { exact: true }).isVisible(), false, "existing typed row order starts collapsed");
  await confirm();
  await page.getByTestId("open-ena-run-model").click();
  await page.waitForFunction(() => window.jobs.length === 1);
  assert.equal(await page.evaluate(() => window.jobs[0].plan.configuration.window.rowOrder.kind), "source-order-confirmed");
  await page.evaluate(() => window.resolveRun(0));
  await page.waitForFunction(() => document.querySelector('[data-testid="open-ena-workspace-v3"]').dataset.resultStatus === "current");
  console.log("Standard existing order: visible confirmation and actual compiler/worker plan PASS");
  await tab("Codes").click();
  await tab("Windows").click();
  assert.equal(await page.getByLabel("Use source order", { exact: true }).isVisible(), false, "returning to Windows collapses the bound row order again");
  await confirm();
  console.log("Standard after Codes roundtrip: confirmation reopens disclosure PASS");
  await tab("Codes").click();
  await page.getByRole("radio", { name: /^Ordered Network Analysis/ }).check();
  await tab("Windows").click();
  assert.equal(await page.locator(".ena-row-order-disclosure").count(), 0, "ONA keeps row order directly visible");
  await confirm();
  assert.equal(await page.getByLabel("Use source order", { exact: true }).isChecked(), true);
  console.log("ONA direct row order: same visible confirmation workflow PASS");
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
