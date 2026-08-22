import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Row } from "jena-js";
import {
  OpenEnaOrderPanel,
  type OpenEnaOrderPanelCopy,
} from "../components/open-ena/OpenEnaOrderPanel";
import * as analysisFamilyModule from "../lib/open-ena/analysis-family";
import {
  beginAnalysisFamilyConfiguration,
  createAnalysisFamilyDrafts,
  type OpenEnaAnalysisFamilyDrafts,
  type OpenEnaAnalysisFamilyTransition,
} from "../lib/open-ena/analysis-family";
import { validateConfig } from "../lib/open-ena/csv";
import {
  buildOpenEnaOrderPreview,
  orderPolicyFromPanelValue,
  type OpenEnaOrderPanelValue,
} from "../lib/open-ena/ona-order-preview";
import {
  SAMPLE_CONFIG,
  type OpenEnaConfig,
  type ParsedDataset,
} from "../lib/open-ena/types";

const rows: Row[] = [
  { unit: "u1", horizon: "h1", turn: 2, A: 0, B: 1 },
  { unit: "u2", horizon: "h2", turn: 1, A: 1, B: 0 },
  { unit: "u1", horizon: "h1", turn: 1, A: 1, B: 0 },
  { unit: "u2", horizon: "h2", turn: 2, A: 0, B: 1 },
];

const panelValue: OpenEnaOrderPanelValue = {
  policyKind: "columns",
  columns: ["turn"],
  comparators: { turn: "number" },
  sourceRowConfirmed: false,
  windowSizeBack: 2,
};

const panelCopy: OpenEnaOrderPanelCopy = {
  title: "Ordered model",
  description: "Configure sequence semantics before analysis.",
  orderPolicyLegend: "Order policy",
  columnsPolicyLabel: "Order columns",
  columnsPolicyDescription: "Use typed comparators.",
  sourceRowPolicyLabel: "Source record order",
  sourceRowPolicyDescription: "Use imported row order only after confirmation.",
  orderColumnsLegend: "Order fields",
  comparatorLabel: "Comparator",
  comparatorPlaceholder: "Choose comparator",
  comparatorLabels: {
    number: "Number",
    string: "Text",
    boolean: "Boolean",
    "iso-datetime": "ISO date-time",
  },
  sourceRowConfirmationLabel: "I confirm source record order is meaningful.",
  windowTitle: "Backward window",
  windowModeLegend: "Window scope",
  finiteWindowLabel: "Finite rows",
  entireHorizonLabel: "Entire horizon",
  windowSizeLabel: "Total stanza rows including current",
  invalidWindowSize: "Enter an integer of at least one.",
  lockedTitle: "Locked ordered contract",
  modelLabel: "Model",
  modelValue: "EndPoint",
  windowTypeLabel: "Window type",
  windowTypeValue: "MovingStanzaWindow",
  forwardLabel: "Forward rows",
  forwardValue: "0",
  weightLabel: "Weight",
  weightValue: "Sum",
  rotationLabel: "Rotation",
  rotationValue: "SVD",
  referenceLabel: "Reference rotation",
  referenceValue: "Unavailable",
  previewTitle: "Per-horizon order preview",
  previewReady: "Preview resolved.",
  previewNeedsConfiguration: "Complete the order policy to preview.",
  previewRejected: "The order policy is not valid for these records.",
  resolvedPolicyTitle: "Resolved policy",
  directionLabel: "Direction",
  directionAscending: "Ascending",
  missingLabel: "Missing values",
  missingReject: "Reject",
  tiesLabel: "Ties",
  tiesReject: "Reject",
  stableLabel: "Stable",
  stableYes: "Yes",
  sourceOrderValue: "Confirmed source record order",
  orderedPositionHeader: "Ordered position",
  sourceRecordHeader: "Source record",
  horizonOrdinalHeader: "Horizon ordinal",
  boundaryHeader: "Boundary",
  unitFieldsHeader: "Unit fields",
  horizonFieldsHeader: "Horizon fields",
  orderFieldsHeader: "Order fields",
  boundarySingle: "Single record",
  boundaryStart: "Start",
  boundaryWithin: "Within",
  boundaryEnd: "End",
  emptyFields: "None",
  previousPage: "Previous page",
  nextPage: "Next page",
  previewRange: "Rows {start}–{end} of {total} · Page {page} of {pages}",
};

test("order preview delegates canonical sorting and exposes source, horizon, field, and policy provenance", () => {
  const preview = buildOpenEnaOrderPreview({
    rows,
    unitColumns: ["unit"],
    horizonColumns: ["horizon"],
    policy: orderPolicyFromPanelValue(panelValue),
  });

  assert.deepEqual(preview.rows.map((row) => row.orderedPosition), [1, 2, 3, 4]);
  assert.deepEqual(preview.rows.map((row) => row.sourceRecord), [3, 1, 2, 4]);
  assert.deepEqual(preview.rows.map((row) => row.horizonOrdinal), [1, 1, 2, 2]);
  assert.deepEqual(preview.rows.map((row) => [row.startsHorizon, row.endsHorizon]), [
    [true, false],
    [false, true],
    [true, false],
    [false, true],
  ]);
  assert.deepEqual(preview.rows[0].unitFields, [
    { column: "unit", value: "u1", valueType: "string" },
  ]);
  assert.deepEqual(preview.rows[0].horizonFields, [
    { column: "horizon", value: "h1", valueType: "string" },
  ]);
  assert.deepEqual(preview.rows[0].orderFields, [
    { column: "turn", value: 1, valueType: "number" },
  ]);
  assert.deepEqual(preview.resolvedPolicy, {
    kind: "columns",
    columns: ["turn"],
    comparators: { turn: "number" },
    direction: "ascending",
    missing: "reject",
    ties: "reject",
    stable: true,
  });
});

test("order preview paginates the legal input instead of materializing every row in the DOM", () => {
  const rows = Array.from({ length: 250 }, (_, turn): Row => ({
    unit: "u1",
    horizon: "h1",
    turn,
    A: 1,
    B: 0,
  }));
  const markup = renderToStaticMarkup(createElement(OpenEnaOrderPanel, {
    value: panelValue,
    onChange: () => undefined,
    rows,
    unitColumns: ["unit"],
    horizonColumns: ["horizon"],
    columnOptions: [{ value: "turn", label: "turn" }],
    copy: panelCopy,
  }));

  assert.match(markup, /data-testid="open-ena-order-preview-pagination"/);
  assert.match(markup, /data-total-rows="250"/);
  assert.match(markup, /data-visible-rows="100"/);
  assert.equal((markup.match(/data-order-preview-row=/g) ?? []).length, 100);
  assert.match(markup, /Rows 1–100 of 250 · Page 1 of 3/);
});

test("order policy and preview fail closed for unconfirmed source order, missing values, and ties", () => {
  assert.throws(
    () => orderPolicyFromPanelValue({ ...panelValue, policyKind: "source-row" }),
    /explicit confirmation/i,
  );

  const confirmed = orderPolicyFromPanelValue({
    ...panelValue,
    policyKind: "source-row",
    sourceRowConfirmed: true,
  });
  assert.deepEqual(confirmed, { kind: "source-row", confirmed: true });

  assert.throws(
    () => buildOpenEnaOrderPreview({
      rows: [{ unit: "u", horizon: "h", turn: "" }],
      unitColumns: ["unit"],
      horizonColumns: ["horizon"],
      policy: orderPolicyFromPanelValue(panelValue),
    }),
    /missing value/i,
  );
  assert.throws(
    () => buildOpenEnaOrderPreview({
      rows: [
        { unit: "u", horizon: "h", turn: 1 },
        { unit: "u", horizon: "h", turn: "1.0" },
      ],
      unitColumns: ["unit"],
      horizonColumns: ["horizon"],
      policy: orderPolicyFromPanelValue(panelValue),
    }),
    /tie within one horizon/i,
  );
});

test("order preview preserves typed horizon identity and rejects comparator-incompatible values", () => {
  const typedHorizons = buildOpenEnaOrderPreview({
    rows: [
      { unit: "u", horizon: 1, turn: 1 },
      { unit: "u", horizon: "1", turn: 1 },
    ],
    unitColumns: ["unit"],
    horizonColumns: ["horizon"],
    policy: orderPolicyFromPanelValue(panelValue),
  });
  assert.equal(typedHorizons.horizonCount, 2);
  assert.deepEqual(typedHorizons.rows.map((row) => row.horizonOrdinal), [1, 2]);
  assert.deepEqual(typedHorizons.rows.map((row) => row.startsHorizon), [true, true]);

  assert.throws(
    () => buildOpenEnaOrderPreview({
      rows: [{ unit: "u", horizon: "h", turn: "first" }],
      unitColumns: ["unit"],
      horizonColumns: ["horizon"],
      policy: orderPolicyFromPanelValue(panelValue),
    }),
    /incompatible with its resolved number comparator/i,
  );
});

test("order panel renders explicit policy, per-horizon preview, window horizon choice, and locked method contract", () => {
  const props = {
    value: panelValue,
    onChange: () => undefined,
    rows,
    unitColumns: ["unit"],
    horizonColumns: ["horizon"],
    columnOptions: [{ value: "turn", label: "Turn" }],
    copy: panelCopy,
  };
  const markup = renderToStaticMarkup(createElement(OpenEnaOrderPanel, props));

  assert.match(markup, /Order columns/u);
  assert.match(markup, /Source record order/u);
  assert.match(markup, /Entire horizon/u);
  assert.match(markup, /Total stanza rows including current/u);
  assert.match(markup, /Locked ordered contract/u);
  assert.match(markup, /EndPoint/u);
  assert.match(markup, /MovingStanzaWindow/u);
  assert.match(markup, /Per-horizon order preview/u);
  assert.match(markup, /Source record/u);
  assert.match(markup, />3</u, "preview must expose the original source record number");

  const invalidWindowMarkup = renderToStaticMarkup(createElement(OpenEnaOrderPanel, {
    ...props,
    value: { ...panelValue, windowSizeBack: Number.NEGATIVE_INFINITY },
  }));
  assert.match(invalidWindowMarkup, /aria-invalid="true"/u);
  assert.match(invalidWindowMarkup, /Enter an integer of at least one\./u);
});

test("order-column click survives rerender and unlocks execution only after its comparator is chosen", () => {
  type WorkflowTransition = (
    drafts: OpenEnaAnalysisFamilyDrafts,
    currentConfig: OpenEnaConfig,
    value: OpenEnaOrderPanelValue,
  ) => OpenEnaAnalysisFamilyTransition & {
    panelValue: OpenEnaOrderPanelValue;
    executable: boolean;
  };
  const transitionOrderPanel = (analysisFamilyModule as typeof analysisFamilyModule & {
    transitionOpenEnaOrderPanelValue?: WorkflowTransition;
  }).transitionOpenEnaOrderPanelValue;
  assert.equal(
    typeof transitionOrderPanel,
    "function",
    "the Workspace order form needs one pure transition that retains partial UI state",
  );

  const workflowRows: Row[] = [
    { unit: "u1", horizon: "h1", Lesson: " Lesson 1", A: 1, B: 0, C: 1 },
    { unit: "u1", horizon: "h1", Lesson: " Lesson 2", A: 0, B: 1, C: 0 },
  ];
  const dataset: ParsedDataset = {
    name: "ordered-workflow.csv",
    headers: ["unit", "horizon", "Lesson", "A", "B", "C"],
    rows: workflowRows,
    sizeBytes: 1,
    source: "upload",
  };
  const enaConfig: OpenEnaConfig = {
    ...SAMPLE_CONFIG,
    analysisKind: "ena",
    unitColumns: ["unit"],
    conversationColumns: ["horizon"],
    groupColumn: null,
    codes: ["A", "B", "C"],
    orderPolicy: null,
    directionalMask: null,
  };
  const drafts = createAnalysisFamilyDrafts(enaConfig);
  const begun = beginAnalysisFamilyConfiguration(drafts, enaConfig, "ona");
  const afterLessonClick = transitionOrderPanel!(begun.drafts, begun.activeConfig, {
    policyKind: "columns",
    columns: ["Lesson"],
    comparators: {},
    sourceRowConfirmed: false,
    windowSizeBack: 2,
  });

  assert.equal(afterLessonClick.executable, false);
  assert.equal(afterLessonClick.activeConfig.orderPolicy, null);
  assert.deepEqual(afterLessonClick.panelValue.columns, ["Lesson"]);
  assert.deepEqual(afterLessonClick.panelValue.comparators, {});
  assert.equal(afterLessonClick.panelValue.windowSizeBack, 2);
  assert.equal(afterLessonClick.activeConfig.windowSizeBack, 2);
  assert.deepEqual(afterLessonClick.activeConfig.unitColumns, ["unit"]);
  assert.deepEqual(afterLessonClick.activeConfig.conversationColumns, ["horizon"]);
  assert.deepEqual(afterLessonClick.activeConfig.codes, ["A", "B", "C"]);
  assert.match(validateConfig(dataset, afterLessonClick.activeConfig).join(" "), /explicit order policy/i);

  const rerendered = renderToStaticMarkup(createElement(OpenEnaOrderPanel, {
    value: afterLessonClick.panelValue,
    onChange: () => undefined,
    rows: workflowRows,
    unitColumns: ["unit"],
    horizonColumns: ["horizon"],
    columnOptions: [{ value: "Lesson", label: "Lesson" }],
    copy: panelCopy,
  }));
  assert.match(rerendered, /type="checkbox" checked=""[^>]*\/><span>Lesson<\/span>/u);
  assert.match(rerendered, /<select id="open-ena-order-Lesson-comparator"/u);

  const afterStringComparator = transitionOrderPanel!(
    afterLessonClick.drafts,
    afterLessonClick.activeConfig,
    {
      ...afterLessonClick.panelValue,
      comparators: { Lesson: "string" },
    },
  );
  assert.equal(afterStringComparator.executable, true);
  assert.deepEqual(afterStringComparator.panelValue.columns, ["Lesson"]);
  assert.deepEqual(afterStringComparator.activeConfig.orderPolicy, {
    kind: "columns",
    columns: ["Lesson"],
    comparators: { Lesson: "string" },
  });
  assert.deepEqual(validateConfig(dataset, afterStringComparator.activeConfig), []);
});
