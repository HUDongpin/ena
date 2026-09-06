import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  OpenEnaHorizonsPanelV3,
  type OpenEnaHorizonsPanelV3Copy,
  type OpenEnaHorizonsPreviewV3,
} from "../components/open-ena/model-v3/OpenEnaHorizonsPanelV3";
import {
  confirmationMatchesContextV3,
  createOrderPolicyEditorRawStateV3,
  OpenEnaOrderPolicyEditorV3,
  orderPolicyFromRawStateV3,
  type OpenEnaOrderPolicyEditorV3Copy,
} from "../components/open-ena/model-v3/OpenEnaOrderPolicyEditorV3";
import {
  createModelStateV3,
  modelScientificContextV3,
  type ModelStateActionV3,
} from "../components/open-ena/model-v3/model-state";
import { validateStandardDraftV3 } from "../lib/open-ena/model-v3/diagnostics";
import { resolveHorizonOrderV3 } from "../lib/open-ena/model-v3/ordering";
import type {
  CanonicalHorizonOrderV3,
  ModelWorkspaceDraftsV3,
  ScalarIdentityV3,
} from "../lib/open-ena/model-v3/types";

const datasetSha256 = "a".repeat(64);

function drafts(model: "EndPoint" | "SeparateTrajectory" | "AccumulatedTrajectory" = "SeparateTrajectory"): ModelWorkspaceDraftsV3 {
  return {
    schemaVersion: 3,
    activeFamily: "standard",
    standard: {
      unitColumns: ["student"],
      horizonColumns: ["week"],
      groupColumn: null,
      codes: ["A", "B", "C"],
      weighting: "frequency",
      model,
      windowType: "Conversation",
      movingStanza: {
        backward: { kind: "finite", value: 1 },
        forward: { kind: "finite", value: 0 },
        rowOrder: null,
      },
      horizonOrder: {
        kind: "columns",
        keys: [{ column: "weekOrder", direction: "ascending", comparator: { type: "number" } }],
      },
      rotation: { type: "svd", centerAlignToOrigin: true },
    },
    ona: {
      unitColumns: ["student"],
      horizonColumns: ["week"],
      groupColumn: null,
      codes: ["A", "B", "C"],
      backward: { kind: "finite", value: 1 },
      rowOrder: null,
      directionalMask: null,
    },
  };
}

function identity(token: string, displayLabel: string, column: string, value: ScalarIdentityV3) {
  return {
    token,
    displayLabel,
    fields: [{ column, value }],
    canonicalJson: JSON.stringify({ fields: [{ column, value }] }),
    sha256: token.padEnd(64, "0").slice(0, 64),
  };
}

const orderCopy: OpenEnaOrderPolicyEditorV3Copy = {
  sortByFields: "Sort by fields",
  useSourceOrder: "Use source order",
  addKey: "Add order key",
  removeKey: (index) => `Remove order key ${index + 1}`,
  moveKeyUp: (index) => `Move order key ${index + 1} up`,
  moveKeyDown: (index) => `Move order key ${index + 1} down`,
  keyLabel: (index) => `Order key ${index + 1}`,
  field: "Field",
  missingField: (field) => `${field} (unavailable current field)`,
  chooseField: "Choose a field",
  direction: "Direction",
  ascending: "Ascending",
  descending: "Descending",
  comparator: "Comparator",
  comparators: {
    number: "Number",
    date: "Date (YYYY-MM-DD)",
    datetime: "Datetime (ISO-8601, offset in value)",
    "ordered-category": "Ordered category",
    text: "Text",
  },
  categoryLevels: "Ordered category levels",
  addCategoryLevel: "Add category level",
  removeCategoryLevel: (index) => `Remove category level ${index + 1}`,
  moveCategoryLevelUp: (index) => `Move category level ${index + 1} up`,
  moveCategoryLevelDown: (index) => `Move category level ${index + 1} down`,
  scalarType: "Value type",
  scalarTypes: { string: "String", number: "Number", boolean: "Boolean" },
  scalarValue: "Value",
  booleanValues: { true: "true", false: "false" },
  textLocale: "Locale",
  textSensitivity: "Sensitivity",
  textSensitivities: { base: "Base", accent: "Accent", case: "Case", variant: "Variant" },
  textNumeric: "Numeric collation",
  invalidEditor: "Complete every active order field before running.",
  sourceStatement: "I confirm the observed source sequence for this exact dataset and field context.",
  reviewSourceStatement: "Review source-order statement",
  acceptSourceStatement: "Accept statement",
  cancelSourceStatement: "Cancel",
  sourceConfirmed: "Source order explicitly confirmed",
  sourceUnconfirmed: "Source order is not confirmed",
  sourceBindingChanged: "The dataset or scientific context changed. Review the statement again.",
  datasetHash: "Dataset",
  rowCount: "Rows",
  relevantFields: "Relevant fields",
  confirmationVersion: "Confirmation version",
  confirmedAt: "Confirmed at",
  unavailable: "Unavailable for this context",
};

const copy: OpenEnaHorizonsPanelV3Copy = {
  horizonIdentity: "Horizon identity",
  horizonPickerEmpty: "Add a Horizon field",
  addRemoveFields: (label) => `Add or remove ${label} fields`,
  removeField: (field, label) => `Remove ${field} from ${label}`,
  counts: "Horizon structure counts",
  unitCount: (count) => `${count} Units`,
  horizonCount: (count) => `${count} Horizons`,
  observationCount: (count) => `${count} Unit by Horizon observations`,
  unavailable: "Unavailable for this draft",
  structure: "Unit by Horizon structure",
  structureColumns: { unit: "Unit", horizon: "Horizon", rows: "Source rows" },
  sharedHorizons: (count) => `${count} shared Horizons`,
  noSharedHorizons: "No shared Horizons",
  singleRowObservations: (count) => `${count} single-row observations`,
  extremeObservations: (minimum, maximum) => `Observed rows range from ${minimum} to ${maximum}`,
  boundedRows: (shown, total) => `Showing ${shown} of ${total} observations`,
  trajectoryOrder: "Trajectory step order",
  horizonOrderNotApplicable: "Horizon order is not applicable to End Point; the inactive draft is preserved.",
  onaOrderNotApplicable: "Horizon order is not applicable to ONA End Point.",
  sequences: "Per-Unit sequence preview",
  sequence: (unit, steps) => `${unit}: ${steps}`,
  sequenceUnavailable: "Sequence preview unavailable for this context",
  boundedSequences: (shown, total) => `Showing ${shown} of ${total} Unit sequences`,
  tieAction: "Add tie-breaker order key",
  diagnostics: "Horizon diagnostics",
};

function preview(state = createModelStateV3(drafts(), datasetSha256)): OpenEnaHorizonsPreviewV3 {
  return {
    availability: "available",
    context: modelScientificContextV3(state),
    rowCount: 8,
    units: [
      identity("unit-1", "Student 1", "student", { type: "number", value: 1 }),
      identity("unit-string-1", "Student \"1\"", "student", { type: "string", value: "1" }),
    ],
    horizons: [
      identity("horizon-1", "Week 1", "week", { type: "number", value: 1 }),
      identity("horizon-string-1", "Week \"1\"", "week", { type: "string", value: "1" }),
      identity("horizon-2", "Week 2", "week", { type: "number", value: 2 }),
    ],
    observations: [
      { unitToken: "unit-1", horizonToken: "horizon-1", rowCount: 2 },
      { unitToken: "unit-string-1", horizonToken: "horizon-1", rowCount: 1 },
      { unitToken: "unit-1", horizonToken: "horizon-string-1", rowCount: 4 },
      { unitToken: "unit-1", horizonToken: "horizon-2", rowCount: 1 },
    ],
    resolvedOrder: {
      availability: "available",
      unitSequences: [
        { unitToken: "unit-1", steps: [
          { horizonToken: "horizon-1", trajectoryOrdinal: 0 },
          { horizonToken: "horizon-string-1", trajectoryOrdinal: 1 },
          { horizonToken: "horizon-2", trajectoryOrdinal: 2 },
        ] },
        { unitToken: "unit-string-1", steps: [
          { horizonToken: "horizon-1", trajectoryOrdinal: 0 },
        ] },
      ],
    },
  };
}

function panelProps(model: "EndPoint" | "SeparateTrajectory" | "AccumulatedTrajectory" = "SeparateTrajectory") {
  const state = createModelStateV3(drafts(model), datasetSha256);
  const actions: ModelStateActionV3[] = [];
  return {
    copy,
    orderCopy,
    state,
    fields: { id: (path: string) => `field:${path}` },
    columnOptions: ["student", "week", "weekOrder", "date", "timestamp", "stage"],
    preview: preview(state),
    diagnostics: [],
    localizeDiagnostic: (diagnostic: { id: string }) => ({ summary: diagnostic.id, detail: diagnostic.id }),
    orderRawState: createOrderPolicyEditorRawStateV3(state.drafts.standard.horizonOrder),
    onOrderRawStateChange: () => {},
    onOrderBlockedChange: () => {},
    dispatch: (action: ModelStateActionV3) => actions.push(action),
    actions,
  };
}

test("Horizons removes unavailable controls and shows typed shared-Horizon structure", () => {
  const markup = renderToStaticMarkup(createElement(OpenEnaHorizonsPanelV3, panelProps()));
  assert.match(markup, /Horizon identity/u);
  assert.match(markup, /Trajectory step order/u);
  assert.match(markup, /1 shared Horizons/u);
  assert.match(markup, /2 single-row observations/u);
  assert.match(markup, /Observed rows range from 1 to 4/u);
  assert.match(markup, /Student 1/u);
  assert.match(markup, /Student &quot;1&quot;/u);
  assert.match(markup, /Week 1/u);
  assert.match(markup, /Week &quot;1&quot;/u);
  assert.doesNotMatch(markup, /Transmodal/u);
  assert.doesNotMatch(markup, /Hide .* horizons|Exclude .* horizons/iu);
});

test("trajectory preview uses bound public tokens and exposes the real horizon field targets", () => {
  const markup = renderToStaticMarkup(createElement(OpenEnaHorizonsPanelV3, panelProps("AccumulatedTrajectory")));
  assert.match(markup, /id="field:horizonColumns"/u);
  assert.match(markup, /id="field:horizonOrder"/u);
  assert.match(markup, /Student 1: Week 1 → Week &quot;1&quot; → Week 2/u);
  assert.match(markup, /Showing 2 of 2 Unit sequences/u);
  assert.doesNotMatch(markup, /unit-1|horizon-1/u, "plan-local identity tokens never become public labels");
});

test("EndPoint preserves inactive horizon-order memory and ONA does not expose trajectory controls", () => {
  const endpoint = panelProps("EndPoint");
  const endpointMarkup = renderToStaticMarkup(createElement(OpenEnaHorizonsPanelV3, endpoint));
  assert.match(endpointMarkup, /Horizon order is not applicable to End Point/u);
  assert.doesNotMatch(endpointMarkup, /Sort by fields/u);
  assert.deepEqual(endpoint.state.drafts.standard.horizonOrder, drafts().standard.horizonOrder);

  const onaState = createModelStateV3({ ...drafts(), activeFamily: "ona" }, datasetSha256);
  const onaMarkup = renderToStaticMarkup(createElement(OpenEnaHorizonsPanelV3, {
    ...panelProps(), state: onaState, preview: { availability: "unavailable" },
  }));
  assert.match(onaMarkup, /Horizon order is not applicable to ONA End Point/u);
  assert.doesNotMatch(onaMarkup, /Trajectory step order/u);
});

test("order editor renders every comparator contract, explicit direction, missing choices, and source receipt facts", () => {
  const context = {
    scientificContext: modelScientificContextV3(createModelStateV3(drafts(), datasetSha256)),
    rowCount: 7,
    relevantColumns: ["student", "week"],
  };
  const policies: CanonicalHorizonOrderV3[] = [
    { kind: "columns", keys: [{ column: "n", direction: "ascending", comparator: { type: "number" } }] },
    { kind: "columns", keys: [{ column: "d", direction: "descending", comparator: { type: "date", format: "YYYY-MM-DD" } }] },
    { kind: "columns", keys: [{ column: "dt", direction: "ascending", comparator: { type: "datetime", format: "ISO-8601", timeZone: "offset-in-value" } }] },
    { kind: "columns", keys: [{ column: "stage", direction: "ascending", comparator: { type: "ordered-category", levels: [{ type: "number", value: 1 }, { type: "string", value: "1" }, { type: "boolean", value: true }] } }] },
    { kind: "columns", keys: [{ column: "removed", direction: "descending", comparator: { type: "text", locale: "zh-Hant-HK", sensitivity: "variant", numeric: true } }] },
  ];
  const markup = policies.map((value) => renderToStaticMarkup(createElement(OpenEnaOrderPolicyEditorV3, {
    label: "Trajectory step order",
    fieldId: "field:horizonOrder",
    copy: orderCopy,
    value,
    rawState: createOrderPolicyEditorRawStateV3(value),
    columnOptions: ["n", "d", "dt", "stage"],
    confirmationContext: context,
    onChange: () => {},
    onRawStateChange: () => {},
    onBlockedChange: () => {},
  }))).join("\n");
  for (const label of ["Number", "Date (YYYY-MM-DD)", "Datetime (ISO-8601, offset in value)", "Ordered category", "Text"]) {
    assert.match(markup, new RegExp(label.replace(/[()]/gu, "\\$&"), "u"));
  }
  assert.match(markup, /Ascending/u);
  assert.match(markup, /Descending/u);
  assert.match(markup, /removed \(unavailable current field\)/u);
  assert.match(markup, /zh-Hant-HK/u);
  assert.match(markup, /value="1"/u);
  assert.match(markup, /value="true" selected/u);
});

test("actual resolver permits shared time across Units and repeated rows in one Unit/Horizon, but diagnoses tied distinct Horizons", () => {
  const binding = { hashKind: "normalized-utf8-csv-text-sha256" as const, normalizedTableSha256: datasetSha256, rowCount: 4, headerSha256: "b".repeat(64) };
  const policy: CanonicalHorizonOrderV3 = {
    kind: "columns",
    keys: [{ column: "weekOrder", direction: "ascending", comparator: { type: "number" } }],
  };
  const legalRows = [
    { student: "u1", week: "w1", weekOrder: 1, A: 1, B: 1, C: 1 },
    { student: "u1", week: "w1", weekOrder: 1, A: 1, B: 1, C: 1 },
    { student: "u2", week: "w1", weekOrder: 1, A: 1, B: 1, C: 1 },
    { student: "u2", week: "w2", weekOrder: 2, A: 1, B: 1, C: 1 },
  ];
  assert.doesNotThrow(() => resolveHorizonOrderV3(legalRows, ["student"], ["week"], policy));
  const legalDiagnostics = validateStandardDraftV3(
    { name: "legal.csv", source: "upload", sizeBytes: 1, headers: ["student", "week", "weekOrder", "A", "B", "C"], rows: legalRows },
    binding,
    { ...drafts().standard, horizonOrder: policy },
  );
  assert.equal(legalDiagnostics.some((entry) => entry.severity === "error" && entry.scope === "horizons"), false);
  assert.ok(legalDiagnostics.some((entry) => entry.id === "STANDARD_HORIZON_SHARED_BY_MULTIPLE_UNITS"));

  const tiedRows = legalRows.map((row, index) => index === 1 ? { ...row, week: "w3" } : row);
  const tiedDiagnostics = validateStandardDraftV3(
    { name: "tied.csv", source: "upload", sizeBytes: 1, headers: ["student", "week", "weekOrder", "A", "B", "C"], rows: tiedRows },
    binding,
    { ...drafts().standard, horizonOrder: policy },
  );
  const tie = tiedDiagnostics.find((entry) => entry.id === "STANDARD_HORIZON_ORDER_UNRESOLVED_TIE");
  assert.ok(tie);
  assert.equal(tie.fieldPath, "horizonOrder");
  assert.equal(tie.scope, "horizons");
  assert.deepEqual(tie.suggestedActions, undefined, "the actual producer offers no fabricated tie-breaker patch");
});

test("source confirmations expire on family, hash, row count, field membership, or field order changes", () => {
  const scientificContext = modelScientificContextV3(createModelStateV3(drafts(), datasetSha256));
  const context = { scientificContext, rowCount: 8, relevantColumns: ["student", "week"] };
  const confirmation = {
    kind: "explicit-researcher-confirmation" as const,
    analysisFamily: "standard" as const,
    datasetSha256,
    rowCount: 8,
    relevantColumns: ["student", "week"],
    confirmedAt: "2026-09-06T01:02:03.004Z",
    confirmationVersion: 1 as const,
  };
  assert.equal(confirmationMatchesContextV3(confirmation, context), true);
  assert.equal(confirmationMatchesContextV3(confirmation, { ...context, rowCount: 9 }), false);
  assert.equal(confirmationMatchesContextV3(confirmation, { ...context, relevantColumns: ["week", "student"] }), false);
  assert.equal(confirmationMatchesContextV3(confirmation, { ...context, relevantColumns: ["student", "week", "turn"] }), false);
  assert.equal(confirmationMatchesContextV3(confirmation, {
    ...context,
    scientificContext: { ...scientificContext, datasetSha256: "b".repeat(64) },
  }), false);
  assert.equal(confirmationMatchesContextV3(confirmation, {
    ...context,
    scientificContext: { ...scientificContext, family: "ona" },
  }), false);
});

test("raw text locale stays blocked until the real schema accepts its canonical spelling", () => {
  const policy: CanonicalHorizonOrderV3 = {
    kind: "columns",
    keys: [{ column: "label", direction: "ascending", comparator: { type: "text", locale: "en-US", sensitivity: "variant", numeric: false } }],
  };
  const raw = createOrderPolicyEditorRawStateV3(policy);
  const noncanonical = {
    ...raw,
    rows: raw.rows.map((row) => ({ ...row, textLocale: "en-us" })),
  };
  assert.equal(orderPolicyFromRawStateV3(noncanonical, ["label"]), null);
  assert.deepEqual(orderPolicyFromRawStateV3(raw, ["label"]), policy);
});

test("controlled raw state round-trips every canonical comparator without adding UI row IDs to science", () => {
  const comparators: CanonicalHorizonOrderV3[] = [
    { kind: "columns", keys: [{ column: "number", direction: "descending", comparator: { type: "number" } }] },
    { kind: "columns", keys: [{ column: "date", direction: "ascending", comparator: { type: "date", format: "YYYY-MM-DD" } }] },
    { kind: "columns", keys: [{ column: "datetime", direction: "descending", comparator: { type: "datetime", format: "ISO-8601", timeZone: "offset-in-value" } }] },
    { kind: "columns", keys: [{ column: "category", direction: "ascending", comparator: { type: "ordered-category", levels: [
      { type: "number", value: 1 }, { type: "string", value: "1" }, { type: "boolean", value: true },
    ] } }] },
    { kind: "columns", keys: [{ column: "text", direction: "ascending", comparator: { type: "text", locale: "zh-Hant-HK", sensitivity: "accent", numeric: true } }] },
  ];
  for (const policy of comparators) {
    assert.equal(policy.kind, "columns");
    if (policy.kind !== "columns") throw new Error("Expected columns policy fixture");
    const result = orderPolicyFromRawStateV3(createOrderPolicyEditorRawStateV3(policy), [policy.keys[0].column]);
    assert.deepEqual(result, policy);
    assert.equal(JSON.stringify(result).includes("order-key"), false);
    assert.equal(JSON.stringify(result).includes("order-level"), false);
  }
  const category = createOrderPolicyEditorRawStateV3(comparators[3]);
  assert.equal(orderPolicyFromRawStateV3({
    ...category,
    rows: category.rows.map((row) => ({
      ...row,
      categoryLevels: [...row.categoryLevels, { ...row.categoryLevels[0], id: "duplicate-ui-row" }],
    })),
  }, ["category"]), null, "typed duplicate levels block rather than silently collapsing");
});

test("source confirmation renders the exact receipt binding without exposing UI-only scope fields", () => {
  const state = createModelStateV3(drafts(), datasetSha256);
  const value: CanonicalHorizonOrderV3 = {
    kind: "source-order-confirmed",
    confirmation: {
      kind: "explicit-researcher-confirmation",
      analysisFamily: "standard",
      datasetSha256,
      rowCount: 8,
      relevantColumns: ["student", "week"],
      confirmedAt: "2026-09-06T01:02:03.004Z",
      confirmationVersion: 1,
    },
  };
  const markup = renderToStaticMarkup(createElement(OpenEnaOrderPolicyEditorV3, {
    label: "Trajectory step order",
    fieldId: "field:horizonOrder",
    copy: orderCopy,
    value,
    rawState: createOrderPolicyEditorRawStateV3(value),
    columnOptions: ["student", "week"],
    confirmationContext: {
      scientificContext: modelScientificContextV3(state),
      rowCount: 8,
      relevantColumns: ["student", "week"],
    },
    onChange: () => {}, onRawStateChange: () => {}, onBlockedChange: () => {},
  }));
  assert.match(markup, new RegExp(`${datasetSha256.slice(0, 12)}…`, "u"));
  assert.doesNotMatch(markup, new RegExp(datasetSha256, "u"));
  assert.match(markup, /student → week/u);
  assert.match(markup, /<dd>8<\/dd>/u);
  assert.match(markup, /Confirmation version<\/dt><dd>1/u);
  assert.match(markup, /2026-09-06T01:02:03\.004Z/u);
  assert.doesNotMatch(markup, /scope/u);
});

test("Horizon diagnostics use safe localization metadata and the real tie exposes only explicit editing", () => {
  const localized: unknown[] = [];
  const diagnostic = {
    id: "STANDARD_HORIZON_ORDER_UNRESOLVED_TIE" as const,
    severity: "error" as const,
    scope: "horizons" as const,
    fieldPath: "horizonOrder",
    summary: "raw compiler summary must not render",
    detail: "raw compiler detail must not render",
    blocks: ["build-model" as const],
  };
  const markup = renderToStaticMarkup(createElement(OpenEnaHorizonsPanelV3, {
    ...panelProps(),
    diagnostics: [diagnostic],
    localizeDiagnostic: (input: unknown) => {
      localized.push(input);
      return { summary: "Localized tie", detail: "Choose another explicit key." };
    },
  }));
  assert.deepEqual(localized, [{
    id: diagnostic.id,
    severity: "error",
    scope: "horizons",
    fieldPath: "horizonOrder",
  }]);
  assert.match(markup, /Localized tie/u);
  assert.match(markup, /Add tie-breaker order key/u);
  assert.doesNotMatch(markup, /raw compiler/u);
});
