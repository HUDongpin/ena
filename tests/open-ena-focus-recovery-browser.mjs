import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const projectRoot = process.cwd();
const require = createRequire(`${projectRoot}/package.json`);
const { build } = require("esbuild");
const { chromium } = require("playwright");

const workspaceFixture = await readFile(`${projectRoot}/tests/open-ena-model-v3-workspace-browser.mjs`, "utf8");
const fixture = workspaceFixture.split("const entry = `")[1].split("createRoot(document.getElementById('root'))")[0];
const entry = fixture + `
let root = createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <OpenEnaWorkspace locale="en" initialSource={{dataset:data,datasetSha256:'a'.repeat(64),drafts}} worker={worker}/>
  </React.StrictMode>
);
`;

const bundle = await build({
  stdin: { contents: entry, loader: "tsx", resolveDir: projectRoot },
  bundle: true,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  write: false,
  logLevel: "silent",
});
const css = await readFile(`${projectRoot}/app/globals.css`, "utf8");
const errors = [];
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") return route.abort();
    if (url.pathname === "/ena-mark.svg") {
      return route.fulfill({ contentType: "image/svg+xml", body: await readFile(`${projectRoot}/public/ena-mark.svg`, "utf8") });
    }
    return route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><meta charset="utf-8"><style>${css}</style><div id="root"></div>`,
    });
  });
  await page.goto("http://localhost:32115/");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.getByTestId("open-ena-workspace-v3").waitFor();
  await page.getByRole("button", { name: "Model", exact: true }).click();
  const run = page.getByTestId("open-ena-run-model");
  await run.waitFor();
  await page.waitForFunction(() => {
    const button = document.querySelector("[data-testid=open-ena-run-model]");
    return button instanceof HTMLButtonElement && !button.disabled;
  });
  await run.click();
  await page.waitForFunction(() => window.jobs.length === 1);
  await page.evaluate(() => window.resolveRun(0));
  await page.waitForFunction(() => document.querySelector("[data-testid=open-ena-workspace-v3]").dataset.resultStatus === "current");

  const settingsTrigger = page.getByRole("button", { name: "Plot Settings" });
  await settingsTrigger.waitFor();
  await settingsTrigger.scrollIntoViewIfNeeded();
  await settingsTrigger.focus();
  await page.keyboard.press("Enter");
  const settingsDialog = page.getByRole("dialog", { name: "Plot Settings" });
  await settingsDialog.waitFor();
  const edgeWeight = settingsDialog.getByRole("slider", { name: "Minimum edge weight" });
  await edgeWeight.focus();
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute("aria-label")),
    "Minimum edge weight",
  );
  await page.keyboard.press("Escape");
  await settingsDialog.waitFor({ state: "detached" });
  await page.waitForFunction(() => {
    const active = document.activeElement;
    return active instanceof HTMLElement
      && active.getAttribute("aria-label") === "Plot Settings"
      && active.getAttribute("aria-expanded") === "false";
  });
  assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), "BODY");

  await page.locator(".ena-artifacts-disclosure").scrollIntoViewIfNeeded();
  await page.locator(".ena-artifacts-disclosure > summary").click();
  const capture = page.getByTestId("open-ena-capture-analysis-set");
  await capture.waitFor();
  await page.waitForFunction(() => {
    const button = document.querySelector("[data-testid=open-ena-capture-analysis-set]");
    return button instanceof HTMLButtonElement && !button.disabled;
  });
  await capture.focus();
  await page.keyboard.press("Enter");
  const remove = page.getByRole("button", { name: /^Remove / });
  await remove.waitFor();
  await remove.focus();
  assert.match(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? ""), /^Remove /);
  await page.keyboard.press("Enter");
  await remove.waitFor({ state: "detached" });
  await page.waitForFunction(() => document.activeElement?.id === "open-ena-capture-set");
  assert.equal(await page.getByTestId("open-ena-capture-analysis-set").evaluate((element) => document.activeElement === element), true);
  assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), "BODY");

  assert.deepEqual(errors, []);
  console.log("keyboard focus recovery after Plot Settings Escape and Analysis Set Remove PASS");
} catch (error) {
  console.error("page errors:", errors);
  throw error;
} finally {
  await browser.close();
}
