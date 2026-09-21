import assert from "node:assert/strict";
import { prepareNativeFixtureV3 } from "./helpers/open-ena-native-browser-fixture-v3.mjs";
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
root.render(<OpenEnaWorkspace locale="en" worker={worker}/>);
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
const teachingCsv = await readFile(`${projectRoot}/public/data/academy/ena-design-talk-sample.csv`);
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
    if (url.pathname === "/data/academy/ena-design-talk-sample.csv") {
      return route.fulfill({ contentType: "text/csv; charset=utf-8", body: teachingCsv });
    }
    return route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><meta charset="utf-8"><style>${css}</style><div id="root"></div>`,
    });
  });
  await page.goto("http://localhost:32118/");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.getByTestId("open-ena-workspace-v3").waitFor();
  await page.getByRole("button", { name: "Load sample", exact: true }).click();
  await page.waitForFunction(() => window.jobs.length === 1, null, { timeout: 60000 });
  await page.evaluate(() => window.resolveRun(0));
  await page.waitForFunction(() => document.querySelector("[data-testid=open-ena-workspace-v3]")?.dataset.resultStatus === "current", null, { timeout: 60000 });
  assert.equal(await page.getByTestId("open-ena-workspace-v3").getAttribute("data-ena-rebuild-cue"), null);

  await page.getByRole("button", { name: "Data", exact: true }).click();
  await page.getByLabel("Open coded CSV or XLSX").setInputFiles({
    name: "ena-design-talk-sample.csv",
    mimeType: "text/csv",
    buffer: teachingCsv,
  });
  await page.getByRole("dialog", { name: "Review CSV source types" }).waitFor();
  for (const column of ["goal", "evidence", "strategy", "tradeoff", "revision", "line_number"]) {
    await page.getByLabel(`Source type: ${column}`, { exact: true }).selectOption("number");
  }
  await page.getByRole("button", { name: "Confirm types and create typed XLSX", exact: true }).click();
  await page.getByTestId("open-ena-stale-rebuild").waitFor();
  assert.equal(await page.getByTestId("open-ena-workspace-v3").getAttribute("data-result-status"), "stale");
  assert.equal(await page.getByTestId("open-ena-workspace-v3").getAttribute("data-ena-rebuild-cue"), "source-replacement");
  assert.equal(await page.getByTestId("open-ena-run-model").getAttribute("data-ena-rebuild-cue"), "source-replacement");
  assert.match(await page.getByTestId("open-ena-stale-rebuild").innerText(), /Source replaced|Rebuild now/u);
  assert.equal(await page.evaluate(() => window.jobs.length), 1, "CSV admit must not auto-run");
  await page.waitForFunction(() => {
    const active = document.activeElement;
    return active?.getAttribute("data-testid") === "open-ena-stale-rebuild-run"
      || active?.getAttribute("data-testid") === "open-ena-run-model";
  });
  await page.waitForFunction(() => {
    const button = document.querySelector("[data-testid=open-ena-run-model]");
    return button instanceof HTMLButtonElement && !button.disabled;
  }, null, { timeout: 60000 });
  await page.getByRole("tab", { name: /Units,/ }).click();
  assert.match(await page.getByRole("region", { name: "Unit fields", exact: true }).innerText(), /team_id/);
  await page.getByRole("tab", { name: /Horizons,/ }).click();
  assert.match(await page.getByRole("region", { name: "Horizon identity", exact: true }).innerText(), /conversation_id/);
  await prepareNativeFixtureV3(page, { sourcePreparation: false, units: ["team_id"], horizons: ["conversation_id"], group: "condition", codes: ["goal", "evidence", "strategy", "tradeoff", "revision"], backward: 1 });
  await page.getByTestId("open-ena-stale-rebuild-run").click();
  await page.waitForFunction(() => window.jobs.length === 2);
  assert.equal(await page.evaluate(() => window.jobs.length), 2, "Rebuild now is an explicit researcher action");
  assert.deepEqual(errors, []);
  console.log("Fitted teaching sample then same coded CSV admit keeps mapping and cues Rebuild PASS.");
} finally {
  await browser.close();
}
