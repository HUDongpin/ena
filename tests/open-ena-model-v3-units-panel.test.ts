import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  OpenEnaUnitsPanelV3,
  type OpenEnaUnitsPanelV3Copy,
  type OpenEnaUnitsPreviewV3,
} from "../components/open-ena/model-v3/OpenEnaUnitsPanelV3";
import {
  createModelStateV3,
  modelScientificContextV3,
  modelStateReducerV3 as reduce,
  type ModelStateActionV3,
} from "../components/open-ena/model-v3/model-state";
import { OPEN_ENA_MODEL_FIELD_PATHS_V3 } from "../components/open-ena/model-v3/OpenEnaModelDiagnosticsV3";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";
import { bindResultV3 } from "../lib/open-ena/model-v3/result-binding";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import { validateStandardDraftV3 } from "../lib/open-ena/model-v3/diagnostics";
import type {
  ModelWorkspaceDraftsV3,
  ScalarIdentityV3,
} from "../lib/open-ena/model-v3/types";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";

const datasetSha256 = "a".repeat(64);

function drafts(): ModelWorkspaceDraftsV3 {
  return {
    schemaVersion: 3,
    activeFamily: "standard",
    standard: {
      unitColumns: ["student", "session"],
      horizonColumns: ["turn"],
      groupColumn: "condition",
      codes: ["A", "B", "C"],
      weighting: "frequency",
      model: "EndPoint",
      windowType: "Conversation",
      movingStanza: {
        backward: { kind: "finite", value: 1 },
        forward: { kind: "finite", value: 0 },
        rowOrder: null,
      },
      horizonOrder: null,
      rotation: {
        type: "means",
        centerAlignToOrigin: true,
        negativeLevel: { type: "number", value: 1 },
        positiveLevel: { type: "string", value: "1" },
      },
    },
    ona: {
      unitColumns: ["student"],
      horizonColumns: ["turn"],
      groupColumn: null,
      codes: ["A", "B", "C"],
      backward: { kind: "finite", value: 1 },
      rowOrder: null,
      directionalMask: null,
    },
  };
}

const copy: OpenEnaUnitsPanelV3Copy = {
  units: "Unit fields",
  unitPickerEmpty: "Add a Unit field",
  addRemoveFields: (label) => `Add or remove ${label} fields`,
  removeField: (field, label) => `Remove ${field} from ${label}`,
  counts: "Units and Groups",
  unitCount: (count) => `${count} Units`,
  groupCount: (count) => `${count} Groups`,
  unavailable: "Unavailable for this draft",
  groupStability: "Group stability",
  stableGroup: "Stable within every Unit",
  unstableGroup: "Group changes within at least one Unit",
  group: "Create Sample / Group",
  noGroup: "No Group",
  unavailableGroupField: (field) => `${field} (unavailable current field)`,
  means: "Means contrast",
  negativeLevel: "Negative level",
  positiveLevel: "Positive level",
  noMeansLevel: "No level selected",
  unavailableMeansLevel: (label) => `${label} (unavailable current level)`,
  meansDirection: (negative, positive) => `${negative} to ${positive}`,
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

function identity(
  token: string,
  displayLabel: string,
  column: string,
  value: ScalarIdentityV3,
) {
  return {
    token,
    displayLabel,
    fields: [{ column, value }],
    canonicalJson: JSON.stringify({ fields: [{ column, value }] }),
    sha256: token.padEnd(64, "0").slice(0, 64),
  };
}

function preview(state = createModelStateV3(drafts(), datasetSha256)): OpenEnaUnitsPreviewV3 {
  return {
    availability: "available",
    context: modelScientificContextV3(state),
    units: [
      identity("unit-1", "Unit learner / 01", "student", { type: "string", value: "learner" }),
      identity("unit-2", "Unit learner / 02", "student", { type: "string", value: "learner-2" }),
    ],
    groups: [
      identity("group-number", "Group 1 [number]", "condition", { type: "number", value: 1 }),
      identity("group-string", "Group 1 [string]", "condition", { type: "string", value: "1" }),
      identity("group-boolean", "Group true [boolean]", "condition", { type: "boolean", value: true }),
      identity("group-string-true", "Group true [string]", "condition", { type: "string", value: "true" }),
      identity("group-seven", "Group 7", "condition", { type: "number", value: 7 }),
      identity("group-eight", "Group 8", "condition", { type: "number", value: 8 }),
      identity("group-nine", "Group 9", "condition", { type: "number", value: 9 }),
    ],
    unitGroups: [
      { unitToken: "unit-1", groupToken: "group-number" },
      { unitToken: "unit-2", groupToken: "group-string" },
    ],
    groupStability: { availability: "available", status: "stable" },
  };
}

function props(state = createModelStateV3(drafts(), datasetSha256)) {
  const actions: ModelStateActionV3[] = [];
  return {
    copy,
    groupDisplayCopy: getOpenEnaCopy("en").groupDisplay,
    state,
    fields: { id: (path: string) => `field:${path}` },
    columnOptions: ["student", "session", "turn", "condition"],
    preview: preview(state),
    diagnostics: [],
    localizeDiagnostic: (diagnostic: { id: string }) => ({
      summary: diagnostic.id,
      detail: diagnostic.id,
    }),
    view: "2d" as const,
    hiddenUnitKeys: [],
    dispatch: (action: ModelStateActionV3) => actions.push(action),
    onUnitVisibilityChange: () => {},
    onRevealAllHidden: () => {},
    onSuggestedAction: () => {},
    actions,
  };
}

test("Units renders ordered fields, context-bound counts, all typed Group levels, and semantic field targets", () => {
  const input = props();
  const markup = renderToStaticMarkup(createElement(OpenEnaUnitsPanelV3, input));
  assert.ok(markup.indexOf("student") < markup.indexOf("session"), "Unit field order is preserved");
  assert.match(markup, /2 Units/u);
  assert.match(markup, /7 Groups/u, "the complete declared Group inventory is not capped at six");
  for (const label of [
    "Group 1 [number]",
    "Group 1 [string]",
    "Group true [boolean]",
    "Group true [string]",
    "Group 9",
  ]) assert.match(markup, new RegExp(label.replace(/[\[\]]/gu, "\\$&"), "u"));
  assert.match(markup, /id="field:unitColumns"/u);
  assert.match(markup, /id="field:groupColumn"/u);
  assert.match(markup, /id="field:rotation\.negativeLevel"/u);
  assert.match(markup, /id="field:rotation\.positiveLevel"/u);
  assert.match(markup, new RegExp(`id="field:${OPEN_ENA_MODEL_FIELD_PATHS_V3.meansContrast}"[^>]*tabindex="-1"`, "u"));
  assert.match(markup, /Group 1 \[number\] to Group 1 \[string\]/u);
});

test("Units toolbar exposes four real actions with only Hide/Restore pressed state", () => {
  const markup = renderToStaticMarkup(createElement(OpenEnaUnitsPanelV3, props()));
  for (const label of [
    copy.collapseGroups,
    copy.openGroupOptions,
    copy.hideGroups,
    copy.excludeGroup,
  ]) assert.match(markup, new RegExp(`aria-label="${label}"`, "u"));
  assert.match(markup, /aria-label="Hide all group layers"[^>]*aria-pressed="false"/u);
  assert.doesNotMatch(markup, /aria-label="Collapse all group option panels"[^>]*aria-pressed/u);
  assert.doesNotMatch(markup, /aria-label="Open all group display options"[^>]*aria-pressed/u);
  assert.doesNotMatch(markup, /aria-label="Exclude group configuration"[^>]*aria-pressed/u);
});

test("stale or absent preview evidence is unavailable while a retained plot remains explicitly stale", () => {
  const state = createModelStateV3(drafts(), datasetSha256);
  const stalePreview = preview(state);
  const changed = reduce(state, {
    type: "replace-standard-draft",
    draft: { ...state.drafts.standard, unitColumns: ["session"] },
  });
  const markup = renderToStaticMarkup(createElement(OpenEnaUnitsPanelV3, {
    ...props(changed),
    preview: stalePreview,
  }));
  assert.match(markup, /Unavailable for this draft/u);
  assert.doesNotMatch(markup, />0 Units</u);
  assert.doesNotMatch(markup, /Group 1 \[number\]/u);
});

test("invalid drafts keep missing Group fields and typed Means levels visible instead of selecting fallbacks", () => {
  const state = createModelStateV3({
    ...drafts(),
    standard: {
      ...drafts().standard,
      groupColumn: "removed-condition",
      rotation: {
        type: "means",
        centerAlignToOrigin: true,
        negativeLevel: { type: "number", value: 99 },
        positiveLevel: { type: "string", value: "missing" },
      },
    },
  }, datasetSha256);
  const markup = renderToStaticMarkup(createElement(OpenEnaUnitsPanelV3, props(state)));
  assert.match(markup, /<option value="removed-condition" selected="">removed-condition \(unavailable current field\)<\/option>/u);
  assert.match(markup, /<option value="retained-negative" selected="">\[number\] 99 \(unavailable current level\)<\/option>/u);
  assert.match(markup, /<option value="retained-positive" selected="">\[string\] &quot;missing&quot; \(unavailable current level\)<\/option>/u);
  assert.doesNotMatch(markup, /<option value="" selected="">No Group/u);
  assert.doesNotMatch(markup, /<option value="" selected="">No level selected/u);
});

test("Units renders a real compiler-produced Means diagnostic at the semantic contrast control", () => {
  const state = createModelStateV3({
    ...drafts(),
    standard: {
      ...drafts().standard,
      rotation: {
        type: "means",
        centerAlignToOrigin: true,
        negativeLevel: null,
        positiveLevel: null,
      },
    },
  }, datasetSha256);
  const diagnostics = validateStandardDraftV3({
    name: "units-diagnostic.csv",
    headers: ["student", "session", "turn", "condition", "A", "B", "C"],
    rows: [
      { student: "u1", session: "s1", turn: "t1", condition: 1, A: 1, B: 1, C: 0 },
      { student: "u2", session: "s2", turn: "t1", condition: "1", A: 0, B: 1, C: 1 },
    ],
    sizeBytes: 1,
    source: "upload",
  }, {
    hashKind: "normalized-utf8-csv-text-sha256",
    normalizedTableSha256: datasetSha256,
    rowCount: 2,
    headerSha256: "b".repeat(64),
  }, state.drafts.standard);
  const actual = diagnostics.find((diagnostic) => diagnostic.id === "STANDARD_MEANS_LEVEL_REQUIRED");
  assert.ok(actual);
  assert.equal(actual.fieldPath, "rotation");
  let localizationInput: Record<string, unknown> | undefined;
  const markup = renderToStaticMarkup(createElement(OpenEnaUnitsPanelV3, {
    ...props(state),
    diagnostics: [actual],
    localizeDiagnostic: (input) => {
      localizationInput = input as unknown as Record<string, unknown>;
      return { summary: "Select both Means levels", detail: "Choose two typed levels." };
    },
  }));
  assert.match(markup, /data-diagnostic-id="STANDARD_MEANS_LEVEL_REQUIRED"/u);
  assert.match(markup, /Select both Means levels/u);
  assert.match(markup, new RegExp(`id="field:${OPEN_ENA_MODEL_FIELD_PATHS_V3.meansContrast}"`, "u"));
  assert.deepEqual(Object.keys(localizationInput ?? {}).sort(), ["fieldPath", "id", "scope", "severity"]);
  assert.equal(Object.hasOwn(localizationInput ?? {}, "summary"), false);
  assert.equal(Object.hasOwn(localizationInput ?? {}, "detail"), false);

  const missingLevelState = createModelStateV3({
    ...drafts(),
    standard: {
      ...state.drafts.standard,
      rotation: {
        type: "means",
        centerAlignToOrigin: true,
        negativeLevel: { type: "number", value: 99 },
        positiveLevel: { type: "string", value: "1" },
      },
    },
  }, datasetSha256);
  const missingObservedLevel = validateStandardDraftV3({
    name: "units-diagnostic.csv",
    headers: ["student", "session", "turn", "condition", "A", "B", "C"],
    rows: [
      { student: "u1", session: "s1", turn: "t1", condition: 1, A: 1, B: 1, C: 0 },
      { student: "u2", session: "s2", turn: "t1", condition: "1", A: 0, B: 1, C: 1 },
    ],
    sizeBytes: 1,
    source: "upload",
  }, {
    hashKind: "normalized-utf8-csv-text-sha256",
    normalizedTableSha256: datasetSha256,
    rowCount: 2,
    headerSha256: "b".repeat(64),
  }, missingLevelState.drafts.standard).find((diagnostic) => diagnostic.id === "STANDARD_MEANS_LEVEL_EMPTY");
  assert.ok(missingObservedLevel, "missing observed typed levels come from the real compiler");
  const missingLevelMarkup = renderToStaticMarkup(createElement(OpenEnaUnitsPanelV3, {
    ...props(missingLevelState),
    diagnostics: [missingObservedLevel],
  }));
  assert.match(missingLevelMarkup, /<option value="retained-negative" selected="">\[number\] 99 \(unavailable current level\)<\/option>/u);
  assert.doesNotMatch(missingLevelMarkup, /<option value="" selected="">No level selected/u);

  const missingGroupState = createModelStateV3({
    ...drafts(),
    standard: { ...state.drafts.standard, groupColumn: "removed-condition" },
  }, datasetSha256);
  const missingGroup = validateStandardDraftV3({
    name: "units-diagnostic.csv",
    headers: ["student", "session", "turn", "condition", "A", "B", "C"],
    rows: [
      { student: "u1", session: "s1", turn: "t1", condition: 1, A: 1, B: 1, C: 0 },
      { student: "u2", session: "s2", turn: "t1", condition: "1", A: 0, B: 1, C: 1 },
    ],
    sizeBytes: 1,
    source: "upload",
  }, {
    hashKind: "normalized-utf8-csv-text-sha256",
    normalizedTableSha256: datasetSha256,
    rowCount: 2,
    headerSha256: "b".repeat(64),
  }, missingGroupState.drafts.standard).find((diagnostic) => diagnostic.id === "STANDARD_GROUP_FIELD_MISSING");
  assert.ok(missingGroup, "missing current Group fields come from the real compiler");
  const missingGroupMarkup = renderToStaticMarkup(createElement(OpenEnaUnitsPanelV3, {
    ...props(missingGroupState),
    diagnostics: [missingGroup],
  }));
  assert.match(missingGroupMarkup, /<option value="removed-condition" selected="">removed-condition \(unavailable current field\)<\/option>/u);
});

test("real typed result preserves exact mixed visibility and leaves excluded Means invalid until bounded Undo", async () => {
  const fixture = await bindingFixtureV3(datasetSha256, (_draft, data) => {
    const values: Array<string | number | boolean> = [1, "1", true, "true", 7];
    data.rows.forEach((row, index) => { row.group = values[index]; });
  });
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
  let state = createModelStateV3({ ...drafts(), standard: fixture.plan.configuration.analysis.rotation.type === "svd"
    ? {
        ...drafts().standard,
        unitColumns: fixture.plan.configuration.units.columns,
        groupColumn: fixture.plan.configuration.units.group.type === "stable-metadata"
          ? fixture.plan.configuration.units.group.column
          : null,
        rotation: { type: "svd", centerAlignToOrigin: true },
      }
    : drafts().standard }, datasetSha256);
  state = reduce(state, {
    type: "mark-running",
    executionPlanSha256: fixture.plan.header.executionPlanSha256,
    context: modelScientificContextV3(state),
  });
  assert.ok(state.runningRequest);
  state = reduce(state, { type: "accept-result", result, request: state.runningRequest });

  const tokens = result.executionProvenance.identityDictionary.groups.map((group) => group.token);
  assert.equal(tokens.length, 5);
  state = reduce(state, { type: "set-group-display", groupToken: tokens[0], patch: { showMean: false } });
  state = reduce(state, { type: "set-group-display", groupToken: tokens[1], patch: { showConfidenceIntervals: false } });
  const before = state.display.standard.groups;
  const hidden = reduce(state, { type: "hide-all-groups" });
  assert.equal(hidden.result, result);
  assert.equal(hidden.scientificRevision, state.scientificRevision);
  assert.equal(hidden.display.standard.allGroupsSuppressed, true);
  assert.equal(hidden.display.standard.groups, before, "bulk suppression does not rewrite preferences");
  const restored = reduce(hidden, { type: "restore-group-visibility" });
  assert.deepEqual(restored.display.standard.groups, before);

  const groupEntries = result.executionProvenance.identityDictionary.groups;
  const means = reduce(restored, {
    type: "replace-standard-draft",
    draft: {
      ...restored.drafts.standard,
      rotation: {
        type: "means",
        centerAlignToOrigin: true,
        negativeLevel: groupEntries[0].fields[0].value,
        positiveLevel: groupEntries[1].fields[0].value,
      },
    },
  });
  const excluded = reduce(means, { type: "exclude-group-configuration" });
  assert.equal(excluded.drafts.standard.rotation.type, "means");
  if (excluded.drafts.standard.rotation.type === "means") {
    assert.equal(excluded.drafts.standard.rotation.negativeLevel, null);
    assert.equal(excluded.drafts.standard.rotation.positiveLevel, null);
  }
  assert.equal(excluded.drafts.standard.groupColumn, null);
  assert.deepEqual(excluded.drafts.standard.unitColumns, means.drafts.standard.unitColumns);
  assert.equal(excluded.resultStatus, "stale");
  assert.equal(excluded.result, result);
  const undone = reduce(excluded, { type: "undo-model-edit" });
  assert.deepEqual(undone.drafts.standard, means.drafts.standard);
});
