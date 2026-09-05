import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";

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
      : "The dataset binding is invalid",
    detail: "Localized diagnostic detail",
  });
  copy.diagnostics.evidenceTotal = (count) => count + " affected rows";
  copy.diagnostics.evidenceSample = (_sample, index) => "Evidence sample " + (index + 1);
  copy.diagnostics.suggestedAction = () => ({ label: "Exclude Code A", confirmation: "Remove Code A from this model?" });
  let diagnostics = [
    { id: "STANDARD_UNITS_REQUIRED", severity: "error", scope: "units", fieldPath: "unitColumns", summary: "raw", detail: "raw", blocks: ["build-model"] },
    { id: "STANDARD_MEANS_LEVEL_REQUIRED", severity: "warning", scope: "rotation", fieldPath: "rotation.negativeLevel", summary: "raw", detail: "raw", blocks: ["group-inference"] },
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
        React.createElement("input", { id: fields.id(tab === "units" ? "unitColumns" : tab === "horizons" ? "horizonColumns" : tab === "windows" ? "window" : "codes.Code A"), "data-panel-field": tab })),
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
  console.log("Task25 Models v3 tabs browser behavior: PASS");
} finally {
  await browser.close();
}
