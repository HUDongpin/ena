import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const projectRoot = process.cwd();
const require = createRequire(`${projectRoot}/package.json`);
const { build } = require("esbuild");
const { chromium } = require("playwright");

// Keep the actual Workspace, import, compiler, Reference binding, and execution
// plan pipeline. Only the final numerical worker is held so both progress
// surfaces remain visible and an unexpected execution can be counted.
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import OpenEnaWorkspace from './components/open-ena/OpenEnaWorkspace';
import { exportDraftV3 } from './lib/open-ena/model-artifact-exports-v3';
import { compileStandardDraftV3 } from './lib/open-ena/model-v3/compiler';
import { migrateCanonicalConfigurationToDraftV3 } from './lib/open-ena/model-v3/migration';
import { parsedDatasetFromSourceProofV3 } from './lib/open-ena/model-v3/execution-plan';
window.jobs = [];
window.fixtureMissingReferenceDraft = async () => {
  const plan = window.jobs[0].plan;
  const drafts = migrateCanonicalConfigurationToDraftV3(plan.configuration);
  const draft = { ...drafts.standard, rotation: {
    type: 'reference', referenceId: 'missing-reference', expectedContentSha256: 'b'.repeat(64),
  } };
  const compiled = await compileStandardDraftV3(
    parsedDatasetFromSourceProofV3(plan.sourceProof), plan.header.datasetSha256, draft,
  );
  const buildBlockers = compiled.diagnostics.filter(d => d.blocks.includes('build-model')).map(d => d.id);
  if (compiled.status !== 'ready' || buildBlockers.length !== 0) {
    throw new Error('Missing Reference fixture must compile ready without Build blockers: ' + JSON.stringify({ status: compiled.status, buildBlockers }));
  }
  return { status: compiled.status, buildBlockers,
    text: new TextDecoder().decode((await exportDraftV3(draft)).bytes) };
};
const worker = (plan, options) => new Promise(resolve => {
  window.jobs.push({ plan, signal: options.signal, resolve });
});
createRoot(document.getElementById('root')).render(<OpenEnaWorkspace locale="en" worker={worker}/>);
`;

const bundle = await build({
  stdin: { contents: entry, loader: "tsx", resolveDir: projectRoot },
  bundle: true, format: "iife", platform: "browser", jsx: "automatic",
  write: false, logLevel: "silent",
});
const css = await readFile(`${projectRoot}/app/globals.css`, "utf8");
const teachingCsv = await readFile(`${projectRoot}/public/data/academy/ena-design-talk-sample.csv`);
const errors = [];
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  // Playwright fulfills every request; this URL does not require a listening server.
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") return route.abort();
    if (url.pathname === "/data/academy/ena-design-talk-sample.csv") {
      return route.fulfill({ contentType: "text/csv; charset=utf-8", body: teachingCsv });
    }
    if (url.pathname === "/ena-mark.svg") {
      return route.fulfill({ contentType: "image/svg+xml", body: await readFile(`${projectRoot}/public/ena-mark.svg`, "utf8") });
    }
    return route.fulfill({ contentType: "text/html; charset=utf-8",
      body: `<!doctype html><meta charset="utf-8"><style>${css}</style><div id="root"></div>` });
  });
  await page.goto("http://localhost:32119/");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.getByRole("button", { name: "Load sample", exact: true }).click();
  await page.waitForFunction(() => window.jobs.length === 1, null, { timeout: 60000 });

  const fixture = await page.evaluate(() => window.fixtureMissingReferenceDraft());
  assert.equal(fixture.status, "ready", "fixture uses the real compiler and reaches plan preparation");
  assert.deepEqual(fixture.buildBlockers, [], "the missing Reference is a plan failure, not a compiler diagnostic");
  await page.getByRole("button", { name: "Data", exact: true }).click();
  await page.getByLabel("Import configuration, result or Reference").setInputFiles({
    name: "missing-reference-draft.json", mimeType: "application/json", buffer: Buffer.from(fixture.text),
  });
  await page.getByRole("button", { name: "Replace configuration", exact: true }).click();
  await page.getByRole("button", { name: "Model", exact: true }).click();
  const operationFailure = page.getByRole("alert").filter({ hasText: "The requested operation failed. Review the current configuration and try again." });
  await operationFailure.waitFor({ state: "visible", timeout: 60000 });
  await page.waitForFunction(() => window.jobs[0].signal.aborted === true);

  const progressIds = ["open-ena-teaching-sample-progress", "open-ena-teaching-sample-progress-center"];
  for (const id of progressIds) {
    const gates = page.getByTestId(id).locator('[data-progress-step="gates"]');
    assert.equal(await gates.getAttribute("data-done"), "false", `${id}: a failed execution plan must not clear Build gates`);
    assert.doesNotMatch(await gates.innerText(), /No remaining Build gates/, `${id}: do not claim that Build is ready`);
    assert.doesNotMatch(await gates.innerText(), /Checking admission gates/, `${id}: a settled failure is not pending`);
    assert.match(await gates.innerText(), /Build is blocked\. Review the model settings and any reported error\./);
  }
  const run = page.getByTestId("open-ena-run-model");
  assert.equal(await run.isDisabled(), true, "Build remains disabled after the real Reference binding failure");
  assert.equal(await page.evaluate(() => window.jobs.length), 1, "failed plan cannot reach the numerical worker");

  await page.getByRole("tab", { name: /Windows,/ }).click();
  await page.getByLabel("Projection & Rotation").selectOption("svd");
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-testid="open-ena-run-model"]');
    return button instanceof HTMLButtonElement && !button.disabled;
  }, null, { timeout: 60000 });
  await operationFailure.waitFor({ state: "hidden" });
  for (const id of progressIds) {
    const gates = page.getByTestId(id).locator('[data-progress-step="gates"]');
    assert.equal(await gates.getAttribute("data-done"), "true", `${id}: an executable SVD plan clears the gates`);
    assert.match(await gates.innerText(), /No remaining Build gates/);
    assert.equal(await gates.locator('[data-unmet-predicate="execution-plan"]').count(), 0);
  }
  assert.equal(await page.evaluate(() => window.jobs.length), 1, "repair after importing a draft must not auto-run");
  await run.click();
  await page.waitForFunction(() => window.jobs.length === 2);
  assert.equal(await page.evaluate(() => window.jobs[1].plan.configuration.analysis.rotation.type), "svd");
  assert.deepEqual(errors, []);
  console.log("Teaching sample Workspace: real ready compilation + missing Reference plan failure keeps both gates incomplete; SVD recovery enables explicit Build PASS.");
} finally {
  await browser.close();
}
