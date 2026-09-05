import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";
import { tsImport } from "tsx/esm/api";

const { compileOnaDraftV3 } = await tsImport(
  "../lib/open-ena/model-v3/compiler.ts",
  import.meta.url,
);
const { validateStandardDraftV3 } = await tsImport(
  "../lib/open-ena/model-v3/diagnostics.ts",
  import.meta.url,
);

const meansDataset = {
  name: "means-browser.csv",
  headers: ["unit", "horizon", "group", "A", "B", "C"],
  rows: [
    { unit: "u1", horizon: "h1", group: "g1", A: 1, B: 1, C: 0 },
    { unit: "u2", horizon: "h1", group: "g2", A: 0, B: 1, C: 1 },
    { unit: "u3", horizon: "h1", group: "g1", A: 1, B: 0, C: 1 },
  ],
  sizeBytes: 1,
  source: "upload",
};
const meansDraft = {
  unitColumns: ["unit"], horizonColumns: ["horizon"], groupColumn: "group", codes: ["A", "B", "C"],
  weighting: "frequency", model: "EndPoint", windowType: "Conversation",
  movingStanza: { backward: { kind: "finite", value: 1 }, forward: { kind: "finite", value: 0 }, rowOrder: null },
  horizonOrder: null,
  rotation: { type: "means", centerAlignToOrigin: true, negativeLevel: null, positiveLevel: null },
};
const actualMeansDiagnostic = validateStandardDraftV3(
  meansDataset,
  { hashKind: "normalized-utf8-csv-text-sha256", normalizedTableSha256: "a".repeat(64), rowCount: 3, headerSha256: "b".repeat(64) },
  meansDraft,
).find((diagnostic) => diagnostic.id === "STANDARD_MEANS_LEVEL_REQUIRED");
assert.ok(actualMeansDiagnostic);
assert.equal(actualMeansDiagnostic.fieldPath, "rotation");

const onaCodeColumns = ["source.Code[甲]", "B / 特殊", "C::node"];
async function compileActualOnaAllZero(zeroCode) {
  const rows = [1, 2].map((time) => Object.fromEntries([
    ["unit", `u${time}`], ["horizon", "h1"], ["time", time],
    ...onaCodeColumns.map((code, index) => [code, code === zeroCode ? 0 : time + index + 1]),
  ]));
  const result = await compileOnaDraftV3(
    { name: "ona-browser.csv", headers: ["unit", "horizon", "time", ...onaCodeColumns], rows, sizeBytes: 1, source: "upload" },
    "c".repeat(64),
    {
      unitColumns: ["unit"], horizonColumns: ["horizon"], groupColumn: null, codes: onaCodeColumns,
      backward: { kind: "finite", value: 1 },
      rowOrder: { kind: "columns", keys: [{ column: "time", direction: "ascending", comparator: { type: "number" } }] },
      directionalMask: { schemaVersion: 1, codeOrder: onaCodeColumns, enabled: onaCodeColumns.map((_source, sourceIndex) => onaCodeColumns.map((_target, targetIndex) => sourceIndex !== targetIndex)) },
    },
  );
  assert.equal(result.status, "invalid");
  const diagnostic = result.diagnostics.find((entry) => entry.id === "ONA_CODE_ALL_ZERO");
  assert.ok(diagnostic);
  return diagnostic;
}
const actualOnaAllZeroDiagnostics = await Promise.all(onaCodeColumns.slice(0, 2).map(compileActualOnaAllZero));

const entry = `
  import React from "react";
  import { createRoot } from "react-dom/client";
  import { OpenEnaModelTabsV3 } from "./components/open-ena/model-v3/OpenEnaModelTabsV3";

  const actions = [];
  let revision = 4;
  let datasetSha256 = "${"a".repeat(64)}";
  let family = "standard";
  let draftFingerprint = "model-draft-json-v3:{}";
  let removeActionOnDispatch = false;
  let meansContrastAvailable = true;
  const actualOnaAllZeroDiagnostics = ${JSON.stringify(actualOnaAllZeroDiagnostics)};
  const evidenceInputs = [];
  const copy = ${JSON.stringify({
    tabListLabel: "Model configuration",
    tabs: { units: "Units", horizons: "Horizons", windows: "Windows", codes: "Codes" },
    help: {
      units: { buttonLabel: "About Units settings", heading: "Units help", description: "Choose Unit fields." },
      horizons: { buttonLabel: "About Horizons settings", heading: "Horizons help", description: "Choose Horizon fields." },
      windows: { buttonLabel: "About Windows settings", heading: "Windows help", description: "Choose a Window." },
      codes: { buttonLabel: "About Codes settings", heading: "Codes help", description: "Choose Code fields." },
    },
    status: {
      label: "Model status",
      configuration: { incomplete: "Configuration incomplete", ready: "Configuration ready" },
      result: { none: "No result", running: "Running", current: "Current result", stale: "Stale result", error: "Run error", obsolete: "Obsolete run", cancelled: "Cancelled run" },
    },
    scientificSummary: {
      label: "Scientific configuration",
      fieldLabels: { family: "Family", model: "Model", window: "Window", weighting: "Weighting", rotation: "Rotation", units: "Units count", horizons: "Horizons count", groups: "Groups count", codes: "Codes count" },
      family: { standard: "Standard ENA", ona: "Ordered Network Analysis" },
      model: { EndPoint: "End Point", SeparateTrajectory: "Separate Trajectory", AccumulatedTrajectory: "Accumulated Trajectory" },
      window: { MovingStanzaWindow: "Moving Stanza", Conversation: "Conversation" },
      weighting: { binary: "Binary", frequency: "Frequency", "frequency-sum": "Frequency (sum)" },
      rotation: { svd: "SVD", means: "Means", reference: "Reference" },
      unavailable: "Unavailable",
    },
    diagnostics: {
      label: "Model diagnostics",
      globalLabel: "Global diagnostics",
      scopeLabels: { dataset: "Dataset", units: "Units", horizons: "Horizons", windows: "Windows", codes: "Codes", rotation: "Rotation", reference: "Reference", resources: "Resources", migration: "Migration", model: "Model" },
      severityLabels: { error: "Error", warning: "Warning", information: "Information" },
      evidenceLabel: "Evidence",
      evidenceTruncated: "More evidence is available",
      confirmationTitle: "Confirm scientific change",
      confirmLabel: "Confirm",
      cancelLabel: "Cancel",
    },
  })};
  copy.tabDiagnosticLabel = ({ label, errors, warnings }) => label + ", " + errors + " error and " + warnings + " warning";
  copy.status.summary = ({ configuration, result }) => configuration + ". " + result + ".";
  copy.scientificSummary.count = (value) => String(value);
  copy.diagnostics.localize = (diagnostic) => ({
    summary: diagnostic.id === "STANDARD_UNITS_REQUIRED" ? "Select at least one Unit field"
      : diagnostic.id === "STANDARD_MEANS_LEVEL_REQUIRED" ? "Select both Means levels"
      : diagnostic.id === "STANDARD_CODE_ALL_ZERO" ? "Code A is all zero"
      : diagnostic.id === "ONA_CODE_ALL_ZERO" ? "An ONA Code is all zero"
      : "The dataset binding is invalid",
    detail: "Localized diagnostic detail",
  });
  copy.diagnostics.evidenceTotal = (count) => count + " affected rows";
  copy.diagnostics.evidenceSample = (sample, index) => {
    evidenceInputs.push(sample);
    return sample.codeColumn === undefined ? "Evidence sample " + (index + 1) : "Code column: " + sample.codeColumn;
  };
  copy.diagnostics.suggestedAction = () => ({ label: "Exclude Code A", confirmation: "Remove Code A from this model?" });
  let diagnostics = [
    { id: "STANDARD_UNITS_REQUIRED", severity: "error", scope: "units", fieldPath: "unitColumns", summary: "raw", detail: "raw", blocks: ["build-model"] },
    ${JSON.stringify(actualMeansDiagnostic)},
    { id: "STANDARD_CODE_ALL_ZERO", severity: "error", scope: "codes", fieldPath: "codes.Code A", summary: "raw", detail: "raw", blocks: ["build-model"], evidence: { totalCount: 8, sampleLimit: 5, samples: [{ rowIndex: 1, detail: "raw evidence" }], truncated: true }, suggestedActions: [{ id: "exclude-code", label: "raw action", confirmationText: "raw confirmation", confirmationRequired: true, patch: { type: "exclude-code", code: "Code A" } }] },
    { id: "STANDARD_DATASET_BINDING_INVALID", severity: "error", scope: "dataset", summary: "raw global", detail: "raw global", blocks: ["build-model"] },
  ];
  const root = createRoot(document.getElementById("root"));
  function render() {
    const context = { datasetSha256, family, scientificRevision: revision, draftFingerprint, executionEpoch: 2 };
    root.render(React.createElement(OpenEnaModelTabsV3, {
      copy,
      diagnostics,
      scientificContext: context,
      scientificSummary: {
        context,
        configuration: family === "ona"
          ? { family: "ona", model: "EndPoint", window: "MovingStanzaWindow", weighting: "frequency-sum", rotation: "svd" }
          : { family: "standard", model: "EndPoint", window: "MovingStanzaWindow", weighting: "frequency", rotation: "svd" },
        counts: { units: { availability: "available", value: 1 }, horizons: { availability: "available", value: 1 }, groups: { availability: "unavailable" }, codes: { availability: "available", value: 3 } },
      },
      status: { configurationReadiness: "ready", editorBlocked: false, runStatus: "idle", resultStatus: "stale" },
      renderPanel: (tab, fields) => React.createElement("div", null,
        ...(tab === "units" ? ["unitColumns", ...(meansContrastAvailable ? ["rotation.meansContrast"] : [])] : [tab === "horizons" ? "horizonColumns" : tab === "windows" ? "window" : "codes.Code A"])
          .map((fieldPath) => React.createElement("input", { key: fieldPath, id: fields.id(fieldPath), "data-panel-field": tab, "data-field-path": fieldPath }))),
      onSuggestedAction: (action, admittedContext) => {
        actions.push({ id: action.id, patch: action.patch, revision: admittedContext.scientificRevision });
        if (removeActionOnDispatch) {
          diagnostics = diagnostics.map((diagnostic) => diagnostic.id === "STANDARD_CODE_ALL_ZERO"
            ? { ...diagnostic, suggestedActions: [] }
            : diagnostic);
          render();
        }
      },
    }));
  }
  render();
  window.__task25 = {
    actions,
    changeContext(kind) {
      if (kind === "dataset") datasetSha256 = datasetSha256.startsWith("a") ? "${"b".repeat(64)}" : "${"a".repeat(64)}";
      if (kind === "family") family = family === "standard" ? "ona" : "standard";
      if (kind === "draft") { revision += 1; draftFingerprint += "x"; }
      render();
    },
    setSuggestedActionPresent(present) {
      diagnostics = diagnostics.map((diagnostic) => diagnostic.id === "STANDARD_CODE_ALL_ZERO"
        ? { ...diagnostic, suggestedActions: present ? [{ id: "exclude-code", label: "raw action", confirmationText: "raw confirmation", confirmationRequired: true, patch: { type: "exclude-code", code: "Code A" } }] : [] }
        : diagnostic);
      render();
    },
    confirmRemovesAction() { removeActionOnDispatch = true; },
    showOnaDiagnostic(diagnostic) { family = "ona"; evidenceInputs.length = 0; diagnostics = [diagnostic]; render(); },
    setMeansContrastAvailable(available) { meansContrastAvailable = available; render(); },
    evidenceInputs,
    actualOnaAllZeroDiagnostics,
  };
`;

const bundle = await build({
  stdin: {
    contents: entry,
    loader: "tsx",
    resolveDir: new URL("..", import.meta.url).pathname,
    sourcefile: "task25-browser-harness.tsx",
  },
  bundle: true,
  format: "iife",
  platform: "browser",
  write: false,
});

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent('<main><div id="root"></div></main>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const tabs = page.getByRole("tab");
  await tabs.nth(3).waitFor();
  assert.equal(await tabs.count(), 4);
  assert.equal(await page.locator("button button").count(), 0);
  assert.equal(await page.locator('[role="tab"][tabindex="0"]').count(), 1);

  await page.locator('[data-model-tab="units"]').focus();
  for (const [key, expected] of [["ArrowRight", "horizons"], ["ArrowDown", "windows"], ["ArrowLeft", "horizons"], ["ArrowUp", "units"], ["End", "codes"], ["Home", "units"]]) {
    await page.keyboard.press(key);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-model-tab")), expected);
  }

  const help = page.getByRole("button", { name: "About Units settings" });
  await help.click();
  const helpDialog = page.getByRole("dialog", { name: "Units help" });
  await helpDialog.waitFor();
  assert.equal(await helpDialog.getAttribute("aria-describedby"), "ena-model-help-units-description");
  assert.equal(await helpDialog.getAttribute("aria-modal"), null);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "About Units settings");

  await page.locator('[data-model-tab="windows"]').click();
  const meansLink = page.getByRole("link", { name: "Select both Means levels" });
  await meansLink.click();
  assert.equal(await page.locator('[role="tab"][aria-selected="true"]').getAttribute("data-model-tab"), "units");
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-field-path") === "rotation.meansContrast");

  await meansLink.click();
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-field-path") === "rotation.meansContrast");

  await page.locator('[data-model-tab="windows"]').click();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-model-tab")), "units", "a consumed diagnostic request must not replay on a keyboard revisit");
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-model-tab")), "horizons");

  await page.evaluate(() => {
    document.querySelector('[data-diagnostic-scope="rotation"] a')?.click();
    document.querySelector('[data-model-tab="windows"]')?.click();
  });
  await page.locator('[data-model-tab="windows"]').focus();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-model-tab")), "units", "an explicit user tab change must cancel an obsolete focus request");

  await page.locator('[data-model-tab="windows"]').click();
  await page.evaluate(() => window.__task25.setMeansContrastAvailable(false));
  await meansLink.click();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.locator('[data-model-tab="windows"]').click();
  await page.evaluate(() => window.__task25.setMeansContrastAvailable(true));
  await page.locator('[data-model-tab="windows"]').focus();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-model-tab")), "units", "a missing target must consume rather than defer its request");
  await meansLink.click();
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-field-path") === "rotation.meansContrast");

  await page.getByRole("link", { name: "Code A is all zero" }).click();
  assert.equal(await page.locator('[data-model-tab="codes"]').getAttribute("aria-selected"), "true");
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-panel-field") === "codes");
  assert.equal(await page.locator('[data-diagnostic-scope="dataset"] a').count(), 0);
  assert.equal(await page.getByText("8 affected rows").count(), 1);
  assert.equal(await page.getByText("More evidence is available").count(), 1);
  assert.equal(await page.getByText("raw evidence").count(), 0);

  const actionButton = page.getByRole("button", { name: "Exclude Code A" });
  await actionButton.click();
  const confirm = page.getByRole("button", { name: "Confirm" });
  const cancel = page.getByRole("button", { name: "Cancel" });
  await confirm.focus();
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Cancel", "Tab must wrap inside the modal confirmation");
  await cancel.focus();
  await page.keyboard.press("Shift+Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Confirm", "Shift+Tab must wrap inside the modal confirmation");
  await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(() => window.__task25.actions.length), 0);
  await page.waitForFunction(() => document.activeElement?.textContent === "Exclude Code A");

  await actionButton.click();
  await page.getByRole("button", { name: "Cancel" }).click();
  assert.equal(await page.evaluate(() => window.__task25.actions.length), 0);

  await actionButton.click();
  await page.evaluate(() => window.__task25.changeContext("dataset"));
  await page.getByRole("dialog", { name: "Confirm scientific change" }).waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => window.__task25.actions.length), 0);
  await page.waitForFunction(() => document.activeElement?.textContent === "Exclude Code A");

  await actionButton.click();
  await page.evaluate(() => window.__task25.changeContext("family"));
  await page.getByRole("dialog", { name: "Confirm scientific change" }).waitFor({ state: "detached" });
  assert.equal(await page.getByRole("button", { name: "Exclude Code A" }).count(), 0, "Standard actions must not remain available in ONA");
  assert.equal(await page.evaluate(() => window.__task25.actions.length), 0);
  await page.evaluate(() => window.__task25.changeContext("family"));
  await page.getByRole("button", { name: "Exclude Code A" }).waitFor();

  await page.getByRole("button", { name: "Exclude Code A" }).click();
  await page.evaluate(() => window.__task25.changeContext("draft"));
  await page.getByRole("dialog", { name: "Confirm scientific change" }).waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => window.__task25.actions.length), 0);
  await page.waitForFunction(() => document.activeElement?.textContent === "Exclude Code A");

  await actionButton.click();
  await page.evaluate(() => window.__task25.setSuggestedActionPresent(false));
  await page.getByRole("dialog", { name: "Confirm scientific change" }).waitFor({ state: "detached" });
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-panel-field") === "codes");
  assert.equal(await page.evaluate(() => window.__task25.actions.length), 0);

  await page.evaluate(() => window.__task25.setSuggestedActionPresent(true));
  const restoredActionButton = page.getByRole("button", { name: "Exclude Code A" });
  await restoredActionButton.waitFor();
  await restoredActionButton.click();
  await page.evaluate(() => window.__task25.confirmRemovesAction());
  await page.getByRole("button", { name: "Confirm" }).click();
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-panel-field") === "codes");
  assert.deepEqual(await page.evaluate(() => window.__task25.actions), [{ id: "exclude-code", patch: { type: "exclude-code", code: "Code A" }, revision: 5 }]);
  assert.equal(await page.getByRole("button", { name: "Exclude Code A" }).count(), 0);
  assert.equal(await page.evaluate(() => window.__task25.actions.length), 1);

  const onaObservations = [];
  for (let index = 0; index < 2; index += 1) {
    await page.evaluate((fixtureIndex) => window.__task25.showOnaDiagnostic(window.__task25.actualOnaAllZeroDiagnostics[fixtureIndex]), index);
    await page.getByRole("link", { name: "An ONA Code is all zero" }).waitFor();
    onaObservations.push({
      text: await page.locator(".ena-model-diagnostics").innerText(),
      samples: await page.evaluate(() => window.__task25.evidenceInputs),
    });
  }
  assert.deepEqual(onaObservations[0].samples, [{ codeColumn: onaCodeColumns[0] }]);
  assert.deepEqual(onaObservations[1].samples, [{ codeColumn: onaCodeColumns[1] }]);
  assert.notEqual(onaObservations[0].text, onaObservations[1].text);
  assert.equal(onaObservations.some((observation) => /Code "|is all zero\./u.test(observation.text)), false);
  console.log("Task25 Models v3 tabs browser behavior: PASS");
} finally {
  await browser.close();
}
