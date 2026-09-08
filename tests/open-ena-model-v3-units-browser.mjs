import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";
import { tsImport } from "tsx/esm/api";

const { bindingFixtureV3 } = await tsImport(
  "./helpers/open-ena-model-v3-fixture.ts",
  import.meta.url,
);
const { runStandardPlanV3 } = await tsImport(
  "../lib/open-ena/analyze.ts",
  import.meta.url,
);
const { bindResultV3 } = await tsImport(
  "../lib/open-ena/model-v3/result-binding.ts",
  import.meta.url,
);
const { validateStandardDraftV3 } = await tsImport(
  "../lib/open-ena/model-v3/diagnostics.ts",
  import.meta.url,
);

const datasetSha256 = "a".repeat(64);
let standardDraft;
let sourceData;
const fixture = await bindingFixtureV3(datasetSha256, (draft, data) => {
  const groupValues = [1, "1", true, "true", 7];
  data.rows.forEach((row, index) => { row.group = groupValues[index]; });
  draft.rotation = {
    type: "means",
    centerAlignToOrigin: true,
    negativeLevel: { type: "number", value: 1 },
    positiveLevel: { type: "string", value: "1" },
  };
  standardDraft = structuredClone(draft);
  sourceData = structuredClone(data);
});
assert.ok(standardDraft);
assert.ok(sourceData);
const result = await bindResultV3(
  fixture.plan,
  runStandardPlanV3(fixture.plan),
  {
    processedRows: fixture.plan.rows.length,
    maximumBufferedRows: 0,
    numericCellsAllocated: 120,
    peakBytesObservedOrBounded: 10240,
    observationMethod: "exact-counters-and-conservative-byte-bound",
  },
  fixture.compiled.diagnostics,
);
assert.equal(result.executionProvenance.identityDictionary.groups.length, 5);
const actualGroups = result.executionProvenance.identityDictionary.groups;
const numberLabel = actualGroups.find((group) => group.fields[0]?.value.type === "number" && group.fields[0].value.value === 1)?.displayLabel;
const stringLabel = actualGroups.find((group) => group.fields[0]?.value.type === "string" && group.fields[0].value.value === "1")?.displayLabel;
const booleanLabel = actualGroups.find((group) => group.fields[0]?.value.type === "boolean")?.displayLabel;
const stringTrueLabel = actualGroups.find((group) => group.fields[0]?.value.type === "string" && group.fields[0].value.value === "true")?.displayLabel;
assert.ok(numberLabel && stringLabel && booleanLabel && stringTrueLabel);
assert.notEqual(numberLabel, stringLabel);
assert.notEqual(booleanLabel, stringTrueLabel);
const diagnosticBinding = {
  hashKind: "normalized-utf8-csv-text-sha256",
  normalizedTableSha256: datasetSha256,
  rowCount: sourceData.rows.length,
  headerSha256: "b".repeat(64),
};
const missingGroupDraft = { ...standardDraft, groupColumn: "removed-group-source" };
const missingMeansDraft = {
  ...standardDraft,
  rotation: {
    ...standardDraft.rotation,
    negativeLevel: { type: "number", value: 99 },
  },
};
const nullMeansDraft = {
  ...standardDraft,
  rotation: {
    ...standardDraft.rotation,
    negativeLevel: null,
  },
};
const unstableData = structuredClone(sourceData);
unstableData.rows[1].unit = unstableData.rows[0].unit;
const actualUnstableDiagnostic = validateStandardDraftV3(unstableData, {
  ...diagnosticBinding,
  rowCount: unstableData.rows.length,
}, standardDraft).find((diagnostic) => diagnostic.id === "STANDARD_GROUP_UNSTABLE_WITHIN_UNIT");
assert.ok(actualUnstableDiagnostic);
assert.ok(validateStandardDraftV3(sourceData, diagnosticBinding, missingGroupDraft)
  .some((diagnostic) => diagnostic.id === "STANDARD_GROUP_FIELD_MISSING"));
assert.ok(validateStandardDraftV3(sourceData, diagnosticBinding, missingMeansDraft)
  .some((diagnostic) => diagnostic.id === "STANDARD_MEANS_LEVEL_EMPTY"));
assert.ok(validateStandardDraftV3(sourceData, diagnosticBinding, nullMeansDraft)
  .some((diagnostic) => diagnostic.id === "STANDARD_MEANS_LEVEL_REQUIRED"));

const entry = `
  import React, { useState } from "react";
  import { createRoot } from "react-dom/client";
  import { OpenEnaUnitsPanelV3 } from "./components/open-ena/model-v3/OpenEnaUnitsPanelV3";
  import OpenEnaGroupDisplayControls from "./components/open-ena/OpenEnaGroupDisplayControls";
  import { createModelStateV3, modelScientificContextV3, modelStateReducerV3 } from "./components/open-ena/model-v3/model-state";

  const actualResult = ${JSON.stringify(result)};
  const actualDraft = ${JSON.stringify(standardDraft)};
  const actions = [];
  const unitCallbacks = [];
  const unitsCopy = {
    units: "Unit fields",
    unitPickerEmpty: "Add a Unit field",
    addRemoveFields: (label) => "Add or remove " + label,
    removeField: (field, label) => "Remove " + field + " from " + label,
    counts: "Units and Groups",
    unitCount: (count) => count + " Units",
    groupCount: (count) => count + " Groups",
    unavailable: "Unavailable for this draft",
    groupStability: "Group stability",
    stableGroup: "Stable within every Unit",
    unstableGroup: "Group changes within at least one Unit",
    group: "Create Sample / Group",
    noGroup: "No Group",
    unavailableGroupField: (field) => field + " (unavailable current field)",
    means: "Means contrast",
    negativeLevel: "Negative level",
    positiveLevel: "Positive level",
    noMeansLevel: "No level selected",
    unavailableMeansLevel: (label) => label + " (unavailable current level)",
    meansDirection: (negative, positive) => negative + " to " + positive,
    meansUnavailable: "Choose a current, stable Group to select Means levels.",
    meansInvalid: "Means remains selected and needs a Group and two distinct levels.",
    groupToolbar: "Group actions",
    collapseGroups: "Collapse all group option panels",
    openGroupOptions: "Open all group display options",
    groupOptionsUnavailable: "A result with Groups is required.",
    hideGroups: "Hide all group layers",
    restoreGroups: "Restore all group layers",
    excludeGroup: "Exclude group configuration",
    hideUnavailable: "A result for this dataset and family is required.",
    excludeUnavailable: "Choose a Group before excluding it.",
    undoGroupExclusion: "Undo Group exclusion",
    groupExcluded: "Group configuration excluded. The retained result is stale.",
    currentDraftGroups: "Current draft Groups",
    retainedPlotGroups: "Groups from the retained result",
    stalePlotGroups: "These display controls belong to the retained stale result.",
    noPlotGroups: "No result-bound Group display is available.",
    diagnosticLabel: "Group stability diagnostics",
  };
  const groupCopy = {
    title: "Plotted groups and units",
    description: "Display only",
    showAllHiddenLabel: "Show all hidden unit points",
    showAll: (count) => "Show all (" + count + ")",
    visibleCount: (group, visible, total) => group + " · " + visible + " of " + total + " unit points visible",
    displaySettings: (group) => "Display settings for " + group,
    showUnitPoints: "Show unit points",
    showMean: "Show mean",
    showConfidenceIntervals: "Show confidence intervals",
    showOutlierIntervals: "Show outlier intervals",
    includeHiddenPoints: "Include hidden points",
    settingLabel: (setting, group) => setting + " for " + group,
    outlierTwoDBoundary: "2D outlier boundary",
    outlierThreeDBoundary: "3D outlier boundary",
    meanRequiredBoundary: "Mean required",
    intervalRequiresTwoUnits: "Two units required",
    searchUnits: "Search units",
    searchUnitsLabel: (group) => "Search units in " + group,
    unitListWindow: (shown, matching, total) => "Showing " + shown + " of " + matching + " matching units (" + total + " total).",
    unitVisibility: (visible, total) => "Unit visibility · " + visible + "/" + total,
    unitAction: (visible, unit, group) => (visible ? "Hide" : "Show") + " unit " + unit + " in " + group,
    hide: "Hide",
    show: "Show",
    keepOneVisible: "Keep one visible unit",
    derivationError: "Display error",
    hiddenStatus: (count) => count + " units hidden",
    shortcut: "Manage visibility",
  };
  const drafts = {
    schemaVersion: 3,
    activeFamily: "standard",
    standard: actualDraft,
    ona: {
      unitColumns: ["unit"], horizonColumns: ["horizon"], groupColumn: null,
      codes: ["A", "B", "C"], backward: { kind: "finite", value: 1 },
      rowOrder: null, directionalMask: null,
    },
  };
  let accepted = createModelStateV3(drafts, "${datasetSha256}");
  accepted = modelStateReducerV3(accepted, {
    type: "mark-running",
    executionPlanSha256: actualResult.binding.executionPlanSha256,
    context: modelScientificContextV3(accepted),
  });
  accepted = modelStateReducerV3(accepted, {
    type: "accept-result",
    result: actualResult,
    request: accepted.runningRequest,
  });

  function UnitsApp() {
    const [state, setState] = useState(accepted);
    const [groupStability, setGroupStability] = useState({ availability: "available", status: "stable" });
    const dispatch = (action) => {
      actions.push(action);
      setState((current) => modelStateReducerV3(current, action));
    };
    window.__task26Dispatch = dispatch;
    window.__task26State = state;
    window.__task26SetGroupStability = setGroupStability;
    const preview = state.scientificRevision === 0 ? {
      availability: "available",
      context: modelScientificContextV3(state),
      units: actualResult.executionProvenance.identityDictionary.units,
      groups: actualResult.executionProvenance.identityDictionary.groups,
      unitGroups: actualResult.executionProvenance.unitGroups,
      groupStability,
    } : { availability: "unavailable" };
    return React.createElement(OpenEnaUnitsPanelV3, {
      copy: unitsCopy,
      groupDisplayCopy: groupCopy,
      state,
      fields: { id: (path) => "browser-field:" + path },
      columnOptions: ["unit", "horizon", "group", "A", "B", "C"],
      preview,
      diagnostics: groupStability.status === "unstable" ? [${JSON.stringify(actualUnstableDiagnostic)}] : [],
      localizeDiagnostic: (diagnostic) => ({ summary: diagnostic.id, detail: diagnostic.id }),
      view: "2d",
      hiddenUnitKeys: [],
      dispatch,
      onUnitVisibilityChange: (groupToken, unitToken, visible) => unitCallbacks.push({ groupToken, unitToken, visible }),
      onRevealAllHidden: () => {},
    });
  }

  function DisclosureProbe() {
    const manyUnitIds = Array.from({ length: 201 }, (_, index) => "runtime-unit-" + (index + 1));
    const manyUnitLabels = Object.fromEntries(manyUnitIds.map((id, index) => [id, "Display Unit " + (index + 1)]));
    const [groups, setGroups] = useState([{ name: "legacy-a", id: "ga", label: "Group A", color: "#cc423a", unitIds: manyUnitIds, unitLabelsById: manyUnitLabels }]);
    const [command, setCommand] = useState();
    window.__probe = {
      open: () => setCommand((current) => ({ revision: (current?.revision ?? 0) + 1, action: "open-all-options" })),
      collapse: () => setCommand((current) => ({ revision: (current?.revision ?? 0) + 1, action: "collapse-all" })),
      add: () => setGroups((current) => [...current, { name: "legacy-b", id: "gb", label: "Group B", color: "#218ebf", unitIds: ["ub"], unitLabelsById: { ub: "Unit B" } }]),
    };
    return React.createElement("div", { "data-probe": "true" }, React.createElement(OpenEnaGroupDisplayControls, {
      groups, settingsByGroup: {}, hiddenUnitKeys: [], view: "2d", copy: groupCopy,
      disclosureCommand: command,
      onSettingsChange: () => {}, onUnitVisibilityChange: () => {}, onRevealAllHidden: () => {},
    }));
  }

  createRoot(document.getElementById("root")).render(React.createElement(UnitsApp));
  createRoot(document.getElementById("probe")).render(React.createElement(DisclosureProbe));
  window.__task26 = { actions, unitCallbacks };
  window.__task26DraftCases = ${JSON.stringify({ missingGroupDraft, missingMeansDraft, nullMeansDraft })};
`;

const bundle = await build({
  stdin: {
    contents: entry,
    loader: "tsx",
    resolveDir: new URL("..", import.meta.url).pathname,
    sourcefile: "task26-units-browser-harness.tsx",
  },
  bundle: true,
  format: "iife",
  platform: "browser",
  write: false,
  logLevel: "silent",
});

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.setContent('<main><div id="root"></div><div id="probe"></div></main>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });

  const panel = page.getByTestId("open-ena-model-v3-units-panel");
  await panel.waitFor();
  const groups = panel.locator(".ena-group-display-group");
  assert.equal(await groups.count(), 5);
  assert.equal(await panel.getByText("5 Groups", { exact: true }).count(), 1);
  assert.equal(await panel.getByText(numberLabel, { exact: true }).count() > 0, true);
  assert.equal(await panel.getByText(stringLabel, { exact: true }).count() > 0, true);
  assert.equal(await panel.locator("option").filter({ hasText: booleanLabel }).count(), 2);
  assert.equal(await panel.locator("option").filter({ hasText: stringTrueLabel }).count(), 2);

  await page.locator('[id="browser-field:rotation.meansContrast"]').focus();
  assert.equal(await page.evaluate(() => document.activeElement?.id), "browser-field:rotation.meansContrast");

  const negativeMeans = panel.locator('[id="browser-field:rotation.negativeLevel"]');
  const positiveMeans = panel.locator('[id="browser-field:rotation.positiveLevel"]');
  for (const stability of [
    { availability: "unavailable" },
    { availability: "available", status: "unstable" },
  ]) {
    await page.evaluate((next) => window.__task26SetGroupStability(next), stability);
    await page.waitForFunction(() => document.querySelector('[id="browser-field:rotation.negativeLevel"]')?.disabled === true);
    assert.notEqual(await negativeMeans.inputValue(), "");
    assert.notEqual(await positiveMeans.inputValue(), "");
    const reasonId = await negativeMeans.getAttribute("aria-describedby");
    assert.ok(reasonId, "disabled negative Means select needs a reason");
    assert.equal(await positiveMeans.getAttribute("aria-describedby"), reasonId);
    assert.equal(await page.locator(`#${reasonId}`).textContent(), "Choose a current, stable Group to select Means levels.");
    assert.match(await panel.getByRole("group", { name: "Means contrast" }).textContent(), / to /u);
  }
  await page.evaluate(() => window.__task26SetGroupStability({ availability: "available", status: "stable" }));
  await page.waitForFunction(() => document.querySelector('[id="browser-field:rotation.negativeLevel"]')?.disabled === false);

  await panel.getByRole("button", { name: "Open all group display options" }).click();
  await page.waitForFunction(() => Array.from(document.querySelectorAll('#root .ena-group-display-group')).every((node) => node.open));
  assert.equal((await page.evaluate(() => window.__task26.actions.length)), 0, "disclosure commands do not dispatch science or display actions");
  const firstNested = groups.first().locator(".ena-group-display-units");
  await firstNested.locator("summary").click();
  assert.equal(await firstNested.evaluate((node) => node.open), true);
  const firstMean = groups.first().locator('input[aria-label^="Show mean for"]');
  await firstMean.uncheck();
  assert.equal(await firstMean.isChecked(), false);

  await panel.getByRole("button", { name: "Collapse all group option panels" }).click();
  await page.waitForFunction(() => Array.from(document.querySelectorAll('#root .ena-group-display-group')).every((node) => !node.open));
  assert.equal(await firstNested.evaluate((node) => node.open), true, "nested Unit disclosure is preserved");
  assert.equal(await firstMean.isChecked(), false, "checkbox preference is preserved");
  await panel.getByRole("button", { name: "Open all group display options" }).click();
  await groups.first().locator(":scope > summary").click();
  assert.equal(await groups.first().evaluate((node) => node.open), false);
  await panel.getByRole("button", { name: "Open all group display options" }).click();
  await page.waitForFunction(() => document.querySelector('#root .ena-group-display-group')?.open === true);
  assert.equal(await groups.first().evaluate((node) => node.open), true, "a repeated revised command reopens a manually closed Group");

  const hide = panel.getByRole("button", { name: "Hide all group layers" });
  assert.equal(await hide.isDisabled(), false);
  await hide.click();
  const restore = panel.getByRole("button", { name: "Restore all group layers" });
  assert.equal(await restore.getAttribute("aria-pressed"), "true");
  await restore.click();
  assert.equal(await panel.getByRole("button", { name: "Hide all group layers" }).getAttribute("aria-pressed"), "false");
  assert.equal(await firstMean.isChecked(), false, "exact group preferences survive hide/restore");

  await groups.first().locator('input[aria-label^="Include hidden points for"]').check();
  const firstUnitAction = groups.first().getByRole("button", { name: /Hide unit/u }).first();
  await firstUnitAction.click();
  const unitCallback = await page.evaluate(() => window.__task26.unitCallbacks.at(-1));
  assert.match(unitCallback.groupToken, /^__open_ena_group_v3_/u);
  assert.match(unitCallback.unitToken, /^__open_ena_unit_v3_/u);
  assert.equal(unitCallback.visible, false);

  await panel.getByRole("button", { name: "Exclude group configuration" }).click();
  await panel.getByRole("button", { name: "Undo Group exclusion" }).waitFor();
  assert.equal(await panel.locator('[id="browser-field:groupColumn"]').inputValue(), "");
  assert.equal(await panel.getByText("Means remains selected and needs a Group and two distinct levels.", { exact: true }).count(), 1);
  assert.equal(await panel.getByText("These display controls belong to the retained stale result.", { exact: true }).count(), 1);
  assert.equal(await groups.count(), 5, "retained stale plot Groups remain displayable");
  await panel.getByRole("button", { name: "Undo Group exclusion" }).click();
  assert.equal(await panel.locator('[id="browser-field:groupColumn"]').inputValue(), "group");

  await page.evaluate(() => window.__task26Dispatch({
    type: "replace-standard-draft",
    draft: window.__task26DraftCases.missingGroupDraft,
  }));
  const groupSelect = panel.locator('[id="browser-field:groupColumn"]');
  await page.waitForFunction(() => window.__task26State.drafts.standard.groupColumn === "removed-group-source");
  assert.equal(await groupSelect.inputValue(), "removed-group-source");
  assert.equal(await groupSelect.locator("option:checked").textContent(), "removed-group-source (unavailable current field)");

  await page.evaluate(() => window.__task26Dispatch({
    type: "replace-standard-draft",
    draft: window.__task26DraftCases.missingMeansDraft,
  }));
  const negativeSelect = panel.locator('[id="browser-field:rotation.negativeLevel"]');
  await page.waitForFunction(() => window.__task26State.drafts.standard.rotation.negativeLevel?.value === 99);
  assert.equal(await negativeSelect.inputValue(), "retained-negative");
  assert.equal(await negativeSelect.locator("option:checked").textContent(), "[number] 99 (unavailable current level)");

  await page.evaluate(() => window.__task26Dispatch({
    type: "replace-standard-draft",
    draft: window.__task26DraftCases.nullMeansDraft,
  }));
  await page.waitForFunction(() => window.__task26State.drafts.standard.rotation.negativeLevel === null);
  assert.equal(await negativeSelect.inputValue(), "");
  assert.equal(await negativeSelect.locator("option:checked").textContent(), "No level selected");

  await page.evaluate(() => window.__task26Dispatch({ type: "set-active-family", family: "ona" }));
  await page.waitForFunction(() => window.__task26State.drafts.activeFamily === "ona");
  assert.equal(await panel.locator('[id="browser-field:groupColumn"]').inputValue(), "");
  await panel.locator('[id="browser-field:groupColumn"]').selectOption("group");
  await page.waitForFunction(() => window.__task26State.drafts.ona.groupColumn === "group");
  const onaAction = await page.evaluate(() => window.__task26.actions.at(-1));
  assert.equal(onaAction.type, "replace-ona-draft");
  assert.equal(onaAction.draft.groupColumn, "group");
  assert.equal(Object.hasOwn(onaAction.draft, "rotation"), false);
  assert.equal(await panel.getByRole("group", { name: "Means contrast" }).count(), 0);

  const probe = page.locator('[data-probe="true"]');
  await page.evaluate(() => window.__probe.open());
  await page.waitForFunction(() => document.querySelector('[data-probe="true"] .ena-group-display-group')?.open === true);
  await probe.locator(".ena-group-display-units > summary").click();
  const search = probe.getByRole("searchbox", { name: "Search units in Group A" });
  await search.fill("Display Unit 201");
  assert.equal(await probe.getByRole("button", { name: "Hide unit Display Unit 201 in Group A" }).count(), 1);
  assert.equal(await probe.getByText("runtime-unit-201", { exact: true }).count(), 0, "search and rendering use labels rather than stable IDs");
  await probe.locator(".ena-group-display-group").first().locator(":scope > summary").click();
  await page.evaluate(() => window.__probe.add());
  await page.waitForFunction(() => document.querySelectorAll('[data-probe="true"] .ena-group-display-group').length === 2);
  const probeGroups = probe.locator(".ena-group-display-group");
  assert.equal(await probeGroups.first().evaluate((node) => node.open), false, "inventory reconciliation preserves an existing manual choice");
  assert.equal(await probeGroups.nth(1).evaluate((node) => node.open), true, "a new Group follows the latest disclosure command");

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  console.log("Open ENA Models v3 Units actual-component browser gate passed.");
} finally {
  await browser.close();
}
