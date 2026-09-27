import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { chromium } from "playwright";

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import OpenEnaWorkspace from './components/open-ena/OpenEnaWorkspace';
import { exportDraftV3 } from './lib/open-ena/model-artifact-exports-v3';
import { runStandardPlanV3 } from './lib/open-ena/analyze';
import { bindResultV3 } from './lib/open-ena/model-v3/result-binding';
import { compileStandardDraftV3 } from './lib/open-ena/model-v3/compiler';
import { migrateCanonicalConfigurationToDraftV3 } from './lib/open-ena/model-v3/migration';
import { parsedDatasetFromSourceProofV3 } from './lib/open-ena/model-v3/execution-plan';
const groups = ['Control', 'Treatment', 'Other'];
const patterns = [[1,0,0,1],[0,1,1,0],[1,1,0,0],[0,0,1,1],[1,0,1,0],[0,1,0,1],[1,1,1,0],[0,1,1,1],[1,0,1,1]];
const rows = [];
let patternIndex = 0;
for (const group of groups) for (const unit of [1, 2, 3]) for (const horizon of ['h1', 'h2', 'h3']) {
  const pattern = patterns[patternIndex % patterns.length];
  patternIndex += 1;
  rows.push({ unit: group + unit, horizon, group, A: pattern[0], B: pattern[1], C: pattern[2], D: pattern[3] });
}
const data = { name: 'retention.xlsx', source: 'upload', sizeBytes: 4096, headers: ['unit', 'horizon', 'group', 'A', 'B', 'C', 'D'], rows };
const order = { kind: 'columns', keys: [{ column: 'unit', direction: 'ascending', comparator: { type: 'text', locale: 'en-US', sensitivity: 'variant', numeric: false } }] };
const modelType = window.__openEnaRetentionModel || 'EndPoint';
const standard = { unitColumns: ['unit'], horizonColumns: ['horizon'], groupColumn: 'group', codes: ['A', 'B', 'C', 'D'], weighting: 'frequency', model: modelType, windowType: 'MovingStanzaWindow', movingStanza: { backward: { kind: 'finite', value: 1 }, forward: { kind: 'finite', value: 0 }, rowOrder: order }, horizonOrder: null, rotation: { type: 'svd', centerAlignToOrigin: true } };
const drafts = { schemaVersion: 3, activeFamily: 'standard', standard, ona: { unitColumns: ['unit'], horizonColumns: ['horizon'], groupColumn: 'group', codes: ['D', 'C', 'B', 'A'], backward: { kind: 'finite', value: 1 }, rowOrder: order, directionalMask: { schemaVersion: 1, codeOrder: ['D', 'C', 'B', 'A'], enabled: [[true, false, true, true], [true, true, false, true], [false, true, true, false], [true, false, true, true]] } } };
window.jobs = [];
window.missingReferenceDraft = async () => new TextDecoder().decode((await exportDraftV3({ ...standard, model: 'EndPoint', rotation: { type: 'reference', referenceId: 'missing-reference', expectedContentSha256: 'd'.repeat(64) } })).bytes);
const worker = (plan, options) => new Promise((resolve) => { window.jobs.push({ plan, signal: options.signal, resolve }); });
window.resolveRun = async (index) => {
  const job = window.jobs[index], plan = job.plan;
  const result = await bindResultV3(plan, runStandardPlanV3(plan), { processedRows: plan.rows.length, maximumBufferedRows: 0, numericCellsAllocated: 240, peakBytesObservedOrBounded: 20480, observationMethod: 'exact-counters-and-conservative-byte-bound' }, (await compileStandardDraftV3(parsedDatasetFromSourceProofV3(plan.sourceProof), plan.header.datasetSha256, migrateCanonicalConfigurationToDraftV3(plan.configuration).standard)).diagnostics);
  job.result = result;
  job.resolve({ result, sourceWitness: null });
};
createRoot(document.getElementById('root')).render(<OpenEnaWorkspace locale="en" initialSource={{ dataset: data, datasetSha256: 'c'.repeat(64), drafts }} worker={worker} />);
`;

const bundle = await build({
  stdin: { contents: entry, loader: "tsx", resolveDir: process.cwd(), sourcefile: "open-ena-ai-interpretation-retention-browser.tsx" },
  bundle: true,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  write: false,
  logLevel: "silent",
});
const script = bundle.outputFiles[0].text;
const mark = await readFile("public/ena-mark.svg", "utf8");

function syntheticResponse(body) {
  const evidenceId = body?.evidence?.descriptive?.axes?.[0]?.id;
  if (typeof evidenceId !== "string" || !body?.binding) {
    throw new Error("Synthetic AI response requires the posted v2 binding and an evidence id.");
  }
  return {
    schemaVersion: "open-ena-ai-interpretation-response-v2",
    promptVersion: "open-ena-aggregate-inference-review-v2",
    binding: body.binding,
    provider: "deepseek",
    model: "synthetic-review",
    generatedAt: "2026-09-27T06:00:00.000Z",
    interpretation: {
      observedPatterns: [{
        statement: "Synthetic aggregate pattern for workspace retention.",
        evidenceRefs: [evidenceId],
      }],
      contextualQuestions: ["Which aggregate comparison should be checked next?"],
      limitations: ["This synthetic response only exercises workspace retention."],
    },
  };
}

async function aiState(page) {
  return page.evaluate(() => {
    const result = document.querySelector(".ena-ai-result");
    const consent = document.querySelector(".ena-ai-consent input");
    const generate = document.querySelector(".ena-ai-actions button");
    const evidenceKey = [...document.querySelectorAll(".ena-ai-provenance div")].find((row) => row.querySelector("dt")?.textContent === "Evidence key")?.querySelector("dd")?.textContent ?? "";
    return {
      text: result?.innerText ?? "",
      evidenceKey,
      consent: consent instanceof HTMLInputElement ? consent.checked : false,
      generateDisabled: !(generate instanceof HTMLButtonElement) || generate.disabled,
    };
  });
}

async function openWorkspace(browser, { model = "EndPoint", failOnce = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(90_000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => void dialog.accept());
  let fetches = 0;
  await page.addInitScript((nextModel) => { window.__openEnaRetentionModel = nextModel; }, model);
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/open-ena/ai-interpretation") {
      fetches += 1;
      if (failOnce && fetches === 1) {
        const id = route.request().headers()["x-open-ena-ai-operation-id"];
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Synthetic unavailable response" }),
          headers: { "x-open-ena-ai-retry": "new-operation", "x-open-ena-ai-operation-id": id },
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(syntheticResponse(route.request().postDataJSON())),
      });
    }
    if (url.hostname !== "localhost") return route.abort();
    if (url.pathname === "/ena-mark.svg") return route.fulfill({ contentType: "image/svg+xml", body: mark });
    return route.fulfill({ contentType: "text/html", body: '<!doctype html><div id="root"></div>' });
  });
  await page.goto("http://localhost:31993/");
  await page.addScriptTag({ content: script });
  await page.getByTestId("open-ena-workspace-v3").waitFor();
  return { page, errors, fetchCount: () => fetches };
}

async function buildModel(page) {
  await page.getByRole("button", { name: "Model", exact: true }).click();
  const run = page.getByTestId("open-ena-run-model");
  await page.waitForFunction(() => {
    const button = document.querySelector("[data-testid=open-ena-run-model]");
    return button instanceof HTMLButtonElement && !button.disabled;
  });
  const jobsBefore = await page.evaluate(() => window.jobs.length);
  await run.click();
  await page.waitForFunction((count) => window.jobs.length === count, jobsBefore + 1);
  await page.evaluate((index) => window.resolveRun(index), jobsBefore);
  await page.waitForFunction(() => document.querySelector("[data-testid=open-ena-workspace-v3]")?.dataset.resultStatus === "current");
  return jobsBefore + 1;
}

async function chooseNonDefaultAxis(page) {
  await page.getByRole("button", { name: "Plot Tools", exact: true }).click();
  const plot = page.locator(".ena-workspace-plot-v3");
  const axis2 = plot.getByRole("combobox", { name: "Axis 2", exact: true });
  const dimensions = (await axis2.locator("option").allTextContents()).map((text) => text.trim()).filter((text) => text && text !== "Unavailable");
  assert.ok(dimensions.length >= 3, `a non-default inference axis needs three fitted dimensions, saw ${dimensions.join(", ") || "none"}`);
  await axis2.selectOption({ label: dimensions[2] });
  assert.equal(await axis2.inputValue(), dimensions[2]);
  return dimensions;
}

async function labeledCheckboxes(scope, excludedText) {
  const boxes = scope.getByRole("checkbox");
  const count = await boxes.count();
  const matches = [];
  for (let index = 0; index < count; index += 1) {
    const box = boxes.nth(index);
    const name = (await box.evaluate((node) => node.closest("label")?.innerText ?? "")).replace(/\s+/g, " ").trim();
    if (!name.includes(excludedText)) matches.push(box);
  }
  return matches;
}

async function runInferenceAndGenerate(page, { failOnce = false } = {}) {
  await page.getByRole("button", { name: "Stats & Export", exact: true }).click();
  const stats = page.locator(".ena-workspace-stats-v3");
  if (await stats.getByRole("combobox", { name: "Trajectory inference design" }).count()) {
    const identity = stats.getByRole("checkbox", { name: "I confirm these fitted Units identify the same entities across periods." });
    if (await identity.isChecked()) await identity.uncheck();
    const periods = await labeledCheckboxes(stats, "confirm these fitted Units");
    assert.ok(periods.length >= 1, "trajectory inference needs a fitted period");
    for (const period of periods) {
      if (await period.isChecked()) await period.uncheck();
    }
    await periods[0].check();
  }
  const infer = page.getByRole("button", { name: "Run confirmed inference", exact: true });
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent === "Run confirmed inference" && !button.disabled));
  await infer.click();
  await page.getByRole("button", { name: "AI-assisted interpretation", exact: true }).click();
  await page.waitForFunction(() => {
    const box = document.querySelector(".ena-ai-consent input");
    return box instanceof HTMLInputElement && !box.disabled;
  });
  await page.locator(".ena-ai-consent input").check();
  await page.getByRole("button", { name: "Generate AI interpretation", exact: true }).click();
  if (failOnce) {
    const alert = page.getByRole("alert");
    await alert.waitFor();
    await alert.getByRole("button", { name: "Retry" }).click();
  }
  await page.locator(".ena-ai-result").waitFor();
  const state = await aiState(page);
  assert.match(state.text, /Synthetic aggregate pattern for workspace retention/);
  assert.ok(state.evidenceKey.length > 0);
  assert.equal(state.consent, true);
  return state;
}

async function setRange(locator, value) {
  await locator.evaluate((node, next) => {
    const prototype = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
    prototype?.set?.call(node, String(next));
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

const browser = await chromium.launch({ headless: true });
try {
  const endpoint = await openWorkspace(browser);
  const { page } = endpoint;
  await buildModel(page);
  const dimensions = await chooseNonDefaultAxis(page);
  const retained = await runInferenceAndGenerate(page);
  assert.equal(endpoint.fetchCount(), 1);

  const plot = page.locator(".ena-workspace-plot-v3");
  const axis2 = () => plot.getByRole("combobox", { name: "Axis 2", exact: true });
  const assertRetained = async (label) => {
    await page.getByRole("button", { name: "Plot Tools", exact: true }).click();
    assert.equal(await axis2().inputValue(), dimensions[2], `${label} must leave the confirmed 2D inference axes unchanged`);
    assert.deepEqual(await aiState(page), retained, `${label} must retain the interpretation, evidence key, and consent`);
    assert.equal(endpoint.fetchCount(), 1, `${label} must not request another interpretation`);
  };

  await page.getByRole("button", { name: "Plot Tools", exact: true }).click();
  await plot.locator(".ena-restored-view-toggle").getByRole("button", { name: "2D", exact: true }).click();
  await setRange(plot.getByRole("slider", { name: "Zoom", exact: true }), 1.4);
  await setRange(plot.getByRole("slider", { name: "Edge threshold", exact: true }), 0.2);
  await setRange(plot.getByRole("slider", { name: "Edge scale", exact: true }), 1.6);
  await setRange(plot.getByRole("slider", { name: "Point scale", exact: true }), 1.3);
  await plot.getByRole("checkbox", { name: "Flip X", exact: true }).check();
  await plot.getByRole("checkbox", { name: "Flip Y", exact: true }).check();
  await plot.getByRole("checkbox", { name: "Points", exact: true }).uncheck();
  await plot.getByRole("checkbox", { name: "Networks", exact: true }).uncheck();
  await plot.getByRole("checkbox", { name: "Code labels", exact: true }).uncheck();
  const tools = page.getByTestId("open-ena-persistent-plot-tools");
  await tools.getByRole("switch", { name: "Unit circle", exact: true }).click();
  await setRange(tools.getByRole("slider", { name: "Text Size", exact: true }), 16);
  await assertRetained("view, zoom, flip, threshold, scale, label, point, network, unit circle, and text size");

  await tools.getByRole("button", { name: "Plot Settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Plot Settings" });
  await settings.getByRole("button", { name: "Reset all plot tools", exact: true }).click();
  await settings.getByRole("button", { name: "Close Plot Settings", exact: true }).click();
  await assertRetained("Plot Tools Reset");
  assert.equal(await page.getByTestId("open-ena-preset-inference-axes-notice").count(), 0);

  await page.locator("details.ena-artifacts-disclosure > summary").click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export presentation preset", exact: true }).click();
  const original = JSON.parse(await readFile(await (await downloadPromise).path(), "utf8"));
  const confirmedAxes = [await plot.getByRole("combobox", { name: "Axis 1", exact: true }).inputValue(), await axis2().inputValue()];
  assert.deepEqual(original.dimensions, confirmedAxes);
  const withheld = dimensions.find((dimension) => dimension !== confirmedAxes[0] && dimension !== confirmedAxes[1]);
  assert.ok(withheld, "preset notice needs a fitted dimension that is not a current inference axis");
  const mismatched = { ...original, dimensions: [confirmedAxes[0], withheld] };
  const presetInput = page.getByLabel("Review presentation preset");
  const applyPreset = () => page.getByRole("button", { name: "Apply matching presentation preset", exact: true });
  await presetInput.setInputFiles({ name: "mismatched-preset.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(mismatched)) });
  await applyPreset().click();
  await page.getByTestId("open-ena-preset-inference-axes-notice").waitFor();
  assert.match(await page.getByTestId("open-ena-preset-inference-axes-notice").innerText(), new RegExp(withheld.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  await assertRetained("a presentation preset whose 2D dimensions differ");

  await presetInput.setInputFiles({ name: "matching-preset.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(original)) });
  await applyPreset().click();
  await page.waitForFunction(() => !document.querySelector("[data-testid=open-ena-preset-inference-axes-notice]"));
  await assertRetained("a presentation preset whose 2D dimensions already match");

  const threeDimensional = { ...original, dimensions: dimensions.slice(0, 3) };
  await presetInput.setInputFiles({ name: "three-d-preset.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(threeDimensional)) });
  await applyPreset().click();
  await page.waitForFunction(() => document.querySelector(".ena-restored-view-toggle button[aria-pressed=true]")?.textContent === "3D");
  assert.equal(await page.getByTestId("open-ena-preset-inference-axes-notice").count(), 0);
  await plot.locator(".ena-camera-fieldset").getByRole("radio", { name: "X-Y plane", exact: true }).check();
  await plot.getByRole("combobox", { name: "Axis 1", exact: true }).selectOption({ label: dimensions[2] });
  await plot.locator(".ena-restored-view-toggle").getByRole("button", { name: "2D", exact: true }).click();
  await assertRetained("3D preset dimensions, camera, and 3D axis selection");

  const assertCleared = async (label) => {
    const cleared = await aiState(page);
    assert.equal(cleared.text, "", `${label} must clear the interpretation`);
    assert.equal(cleared.evidenceKey, "", `${label} must clear the evidence key`);
    assert.equal(cleared.consent, false, `${label} must clear consent`);
    assert.equal(cleared.generateDisabled, true, `${label} must disable Generate`);
    assert.equal(endpoint.fetchCount(), 1, `${label} must not request another interpretation`);
  };
  await page.getByText("Comparison exports", { exact: true }).click();
  await page.getByRole("button", { name: "Switch Plots", exact: true }).click();
  await assertCleared("Switch Plots");
  const primary = plot.getByRole("combobox", { name: "Primary group", exact: true });
  const secondary = plot.getByRole("combobox", { name: "Secondary group", exact: true });
  const selected = new Set([await primary.inputValue(), await secondary.inputValue()]);
  const unused = await primary.locator("option").evaluateAll((nodes, taken) => nodes.find((node) => node.value && !taken.includes(node.value))?.value ?? "", [...selected]);
  assert.ok(unused, "a third group is required for an explicit group change");
  await primary.selectOption(unused);
  await assertCleared("primary group change");
  await axis2().selectOption({ label: dimensions[1] });
  await assertCleared("2D inference axis change");
  await page.getByRole("button", { name: "Model", exact: true }).click();
  await page.getByRole("tab", { name: /Codes,/ }).click();
  await page.getByRole("button", { name: "Exclude all selected Codes", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-testid=open-ena-workspace-v3]")?.dataset.resultStatus === "stale");
  await assertCleared("excluding codes");
  assert.deepEqual(endpoint.errors, []);
  await page.close();

  const trajectory = await openWorkspace(browser, { model: "SeparateTrajectory" });
  await buildModel(trajectory.page);
  const trajectoryRetained = await runInferenceAndGenerate(trajectory.page);
  assert.equal(trajectory.fetchCount(), 1);
  await trajectory.page.getByRole("button", { name: "Plot Tools", exact: true }).click();
  const trajectoryPlot = trajectory.page.locator(".ena-workspace-plot-v3");
  await trajectoryPlot.getByRole("checkbox", { name: "Show Group centroid paths", exact: true }).uncheck();
  await trajectoryPlot.getByRole("checkbox", { name: "Show endpoints only (display)", exact: true }).check();
  const horizonDisplay = trajectoryPlot.getByRole("checkbox", { name: /^Display / });
  assert.ok(await horizonDisplay.count() >= 2);
  await horizonDisplay.first().uncheck();
  assert.deepEqual(await aiState(trajectory.page), trajectoryRetained);
  assert.equal(trajectory.fetchCount(), 1, "trajectory display options must not request another interpretation");
  await trajectory.page.getByRole("button", { name: "Stats & Export", exact: true }).click();
  const trajectoryStats = trajectory.page.locator(".ena-workspace-stats-v3");
  await trajectoryStats.getByRole("combobox", { name: "Trajectory inference design" }).selectOption("paired");
  const trajectoryCleared = async (label) => {
    const cleared = await aiState(trajectory.page);
    assert.equal(cleared.text, "", label);
    assert.equal(cleared.consent, false, label);
    assert.equal(cleared.generateDisabled, true, label);
    assert.equal(trajectory.fetchCount(), 1, label);
  };
  await trajectoryCleared("trajectory design change");
  const trajectoryPeriods = await labeledCheckboxes(trajectoryStats, "confirm these fitted Units");
  assert.ok(trajectoryPeriods.length >= 2, "period change needs a second fitted horizon");
  await trajectoryPeriods[1].check();
  await trajectoryCleared("trajectory period change");
  await trajectoryStats.getByRole("checkbox", { name: "I confirm these fitted Units identify the same entities across periods." }).check();
  await trajectoryCleared("trajectory identity confirmation");
  assert.deepEqual(trajectory.errors, []);
  await trajectory.page.close();

  const recovery = await openWorkspace(browser, { failOnce: true });
  const jobs = await buildModel(recovery.page);
  const recovered = await runInferenceAndGenerate(recovery.page, { failOnce: true });
  assert.match(recovered.text, /Synthetic aggregate pattern for workspace retention/);
  assert.equal(recovery.fetchCount(), 2);
  await recovery.page.getByRole("button", { name: "Data", exact: true }).click();
  const draft = await recovery.page.evaluate(() => window.missingReferenceDraft());
  await recovery.page.getByLabel("Import configuration, result or Reference").setInputFiles({
    name: "missing-reference.json",
    mimeType: "application/json",
    buffer: Buffer.from(draft),
  });
  await recovery.page.getByRole("button", { name: "Replace configuration", exact: true }).click();
  await recovery.page.getByRole("button", { name: "Model", exact: true }).click();
  const failed = recovery.page.getByRole("alert").filter({ hasText: "The requested operation failed. Review the current configuration and try again." });
  await failed.waitFor();
  assert.equal(await recovery.page.getByTestId("open-ena-run-model").isDisabled(), true);
  const blocked = await aiState(recovery.page);
  assert.equal(blocked.text, "");
  assert.equal(blocked.consent, false);
  assert.equal(blocked.generateDisabled, true);
  assert.equal(recovery.fetchCount(), 2);
  assert.equal(await recovery.page.evaluate(() => window.jobs.length), jobs);
  await recovery.page.getByRole("tab", { name: /Windows,/ }).click();
  await recovery.page.getByTestId("open-ena-model-v3-windows-panel").getByLabel("Projection & Rotation").selectOption("svd");
  await recovery.page.waitForFunction(() => {
    const button = document.querySelector("[data-testid=open-ena-run-model]");
    return button instanceof HTMLButtonElement && !button.disabled;
  });
  await recovery.page.waitForFunction(() => ![...document.querySelectorAll("[role=alert]")].some((node) => node.textContent?.includes("The requested operation failed")));
  assert.equal(await recovery.page.evaluate(() => window.jobs.length), jobs, "repairing Projection & Rotation must not auto-run");
  const restored = await aiState(recovery.page);
  assert.equal(restored.text, "");
  assert.equal(restored.consent, false);
  assert.equal(restored.generateDisabled, true);
  assert.equal(recovery.fetchCount(), 2);
  assert.deepEqual(recovery.errors, []);
  await recovery.page.close();
  console.log("Workspace AI retention: presentation keeps one interpretation; scientific edits clear it; failure retry and missing Reference recovery PASS");
} finally {
  await browser.close();
}
