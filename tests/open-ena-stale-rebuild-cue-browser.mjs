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
root.render(<OpenEnaWorkspace locale="en" initialSource={{dataset:data,datasetSha256:'a'.repeat(64),drafts}} worker={worker}/>);
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
const csv = [
  "unit,horizon,group,\"Code 1\",A,B",
  "001,h1,Control,1,2,1",
  "u2,h1,Treatment,2,1,3",
  "u3,h2,Control,1,3,1",
  "u4,h2,Treatment,3,1,2",
  "u5,h3,Other,1,1,4",
].join("\n");
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
  await page.goto("http://localhost:32118/");
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
  await page.waitForFunction(() => document.querySelector("[data-testid=open-ena-workspace-v3]")?.dataset.resultStatus === "current");

  await page.getByRole("button", { name: "Data", exact: true }).click();
  await page.getByLabel("Open coded CSV or XLSX").setInputFiles({
    name: "replaced.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("dialog", { name: "Review CSV source types" }).waitFor();
  for (const column of ["Code 1", "A", "B"]) {
    await page.getByLabel(`Source type: ${column}`, { exact: true }).selectOption("number");
  }
  await page.getByRole("button", { name: "Confirm types and create typed XLSX", exact: true }).click();
  await page.getByTestId("open-ena-stale-rebuild").waitFor();
  assert.equal(await page.getByTestId("open-ena-workspace-v3").getAttribute("data-result-status"), "stale");
  assert.equal(await page.getByTestId("open-ena-workspace-v3").getAttribute("data-ena-rebuild-cue"), "source-replacement");
  assert.equal(await page.getByTestId("open-ena-run-model").getAttribute("data-ena-rebuild-cue"), "source-replacement");
  assert.match(await page.getByTestId("open-ena-stale-rebuild").innerText(), /Source replaced/u);
  assert.equal(await page.evaluate(() => window.jobs.length), 1, "CSV admit must not auto-run");
  await page.waitForFunction(() => {
    const active = document.activeElement;
    return active?.getAttribute("data-testid") === "open-ena-stale-rebuild-run"
      || active?.getAttribute("data-testid") === "open-ena-run-model";
  });
  await page.waitForFunction(() => {
    const button = document.querySelector("[data-testid=open-ena-run-model]");
    return button instanceof HTMLButtonElement && !button.disabled;
  });
  await page.getByTestId("open-ena-stale-rebuild-run").click();
  await page.waitForFunction(() => window.jobs.length === 2);
  assert.equal(await page.evaluate(() => window.jobs.length), 2, "Rebuild now is an explicit researcher action");
  assert.deepEqual(errors, []);
  console.log("CSV admit after a fitted result cues Rebuild/Run without auto-running PASS.");
} finally {
  await browser.close();
}
