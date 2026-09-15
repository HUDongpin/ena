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
for (const row of data.rows) row.group = 'CancelPointerGroup-' + row.group;
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
  await page.goto("http://localhost:32112/");
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
  await page.getByTestId("open-ena-group-contrast").waitFor();
  const scientificBefore = await page.evaluate(() => JSON.stringify(window.jobs[0].result));

  await page.getByRole("tab", { name: /Windows,/ }).click();
  const backward = page.getByRole("group", { name: "Backward context", exact: true }).getByLabel("Rows");
  await backward.fill("2");
  await page.waitForFunction(() => document.querySelector("[data-testid=open-ena-workspace-v3]")?.dataset.resultStatus === "stale");
  assert.equal(await page.locator("[data-ena-panel-action=remove]").count() > 0, true, "group-contrast Remove Plot remains after the result goes stale");

  await page.getByTestId("open-ena-run-model").click();
  await page.waitForFunction(() => window.jobs.length === 2);
  const cancel = page.getByTestId("open-ena-cancel-run");
  await cancel.waitFor();
  assert.equal(await cancel.getAttribute("type"), "button");
  assert.equal(await page.evaluate(() => window.jobs[1].signal.aborted), false);

  const hit = await cancel.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const top = document.elementFromPoint(x, y);
    const interceptingAction = top?.closest?.("[data-ena-panel-action], [data-ena-plot-action]");
    return {
      ownsHit: element === top || element.contains(top),
      interceptingAction: interceptingAction?.getAttribute("data-ena-panel-action")
        ?? interceptingAction?.getAttribute("data-ena-plot-action")
        ?? null,
      cancel: { x: box.x, y: box.y, width: box.width, height: box.height },
    };
  });
  assert.equal(hit.ownsHit, true, `Cancel pointer target is intercepted: ${JSON.stringify(hit)}`);
  assert.notEqual(hit.interceptingAction, "remove", "Remove Plot must not sit on the Cancel hit target during rebuild");

  await cancel.click({ force: false });
  await page.waitForFunction(() => window.jobs[1]?.signal?.aborted === true);
  assert.equal(await page.getByTestId("open-ena-workspace-v3").getAttribute("data-run-status"), "cancelled");
  assert.equal(await page.getByTestId("open-ena-workspace-v3").getAttribute("data-result-status"), "stale");
  assert.equal(await page.evaluate((before) => JSON.stringify(window.jobs[0].result) === before, scientificBefore), true);
  assert.equal(await page.getByTestId("open-ena-cancel-run").count(), 0);

  const remove = page.locator('[data-ena-panel-toolbar="secondary"] [data-ena-panel-action="remove"]');
  await remove.click({ force: false });
  await page.waitForFunction(() => document.querySelector('[data-ena-restore-slot="secondary"]'));
  await page.locator('[data-ena-restore-slot="secondary"]').first().press("Enter");
  await page.waitForFunction(() => document.querySelector('[data-ena-panel-toolbar="secondary"] [data-ena-panel-action="remove"]'));

  await page.getByTestId("open-ena-run-model").click();
  await page.waitForFunction(() => window.jobs.length === 3);
  const keyboardCancel = page.getByTestId("open-ena-cancel-run");
  await keyboardCancel.waitFor();
  await keyboardCancel.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.jobs[2]?.signal?.aborted === true);
  assert.equal(await page.getByTestId("open-ena-workspace-v3").getAttribute("data-run-status"), "cancelled");
  assert.equal(await page.evaluate((before) => JSON.stringify(window.jobs[0].result) === before, scientificBefore), true);

  const fallbackHit = await page.evaluate(() => {
    const panel = document.querySelector(".ena-control-panel");
    if (!(panel instanceof HTMLElement)) return { hitDialog: false, reason: "missing-panel" };
    const overlay = document.createElement("div");
    overlay.className = "ena-code-color-dialog";
    overlay.setAttribute("data-ena-dialog-fallback", "true");
    panel.appendChild(overlay);
    const top = document.elementFromPoint(2, 2);
    return {
      hitDialog: top === overlay,
      tag: top?.tagName ?? null,
      className: typeof top?.className === "string" ? top.className : null,
      fallback: top instanceof Element ? top.getAttribute("data-ena-dialog-fallback") : null,
    };
  });
  assert.equal(
    fallbackHit.hitDialog,
    true,
    `code-color fallback overlay must own viewport (2, 2) from inside the control panel: ${JSON.stringify(fallbackHit)}`,
  );

  assert.deepEqual(errors, []);
  console.log("rebuild Cancel pointer hit-target and keyboard preservation PASS");
} catch (error) {
  console.error("page errors:", errors);
  throw error;
} finally {
  await browser.close();
}
