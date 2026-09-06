import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createWindowsPanelRawStateV3,
  OpenEnaWindowsPanelV3,
  parseWindowExtentInputV3,
  windowFieldBlockersV3,
  type OpenEnaReferenceSelectionPreviewV3,
  type OpenEnaWindowsPanelV3Copy,
} from "../components/open-ena/model-v3/OpenEnaWindowsPanelV3";
import type { OpenEnaOrderPolicyEditorV3Copy } from "../components/open-ena/model-v3/OpenEnaOrderPolicyEditorV3";
import { modelDiagnosticFieldTargetV3 } from "../components/open-ena/model-v3/OpenEnaModelDiagnosticsV3";
import {
  createModelStateV3,
  modelScientificContextV3,
  type ModelStateActionV3,
} from "../components/open-ena/model-v3/model-state";
import { compileOnaDraftV3, compileStandardDraftV3 } from "../lib/open-ena/model-v3/compiler";
import type {
  ModelWorkspaceDraftsV3,
  StandardEnaDraftV3,
} from "../lib/open-ena/model-v3/types";
import type { ParsedDataset } from "../lib/open-ena/types";

const datasetSha256 = "a".repeat(64);

function drafts(): ModelWorkspaceDraftsV3 {
  return {
    schemaVersion: 3,
    activeFamily: "standard",
    standard: {
      unitColumns: ["student"],
      horizonColumns: ["conversation", "turn"],
      groupColumn: "condition",
      codes: ["A", "B", "C"],
      weighting: "frequency",
      model: "EndPoint",
      windowType: "MovingStanzaWindow",
      movingStanza: {
        backward: { kind: "finite", value: 5 },
        forward: { kind: "finite", value: 2 },
        rowOrder: {
          kind: "columns",
          keys: [{ column: "turn", direction: "ascending", comparator: { type: "number" } }],
        },
      },
      horizonOrder: null,
      rotation: { type: "svd", centerAlignToOrigin: true },
    },
    ona: {
      unitColumns: ["student"],
      horizonColumns: ["conversation", "turn"],
      groupColumn: null,
      codes: ["A", "B", "C"],
      backward: { kind: "finite", value: 3 },
      rowOrder: {
        kind: "columns",
        keys: [{ column: "turn", direction: "ascending", comparator: { type: "number" } }],
      },
      directionalMask: null,
    },
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

const copy: OpenEnaWindowsPanelV3Copy = {
  model: "Model",
  models: {
    EndPoint: "EndPoint",
    SeparateTrajectory: "Separate Trajectory",
    AccumulatedTrajectory: "Accumulated Trajectory",
  },
  window: "Window",
  movingStanza: "Moving Stanza Window",
  conversation: "Conversation / Horizon Window",
  conversationExplanation: "All source rows in the same typed Horizon contribute; extent and row order are inactive.",
  backward: "Backward context",
  forward: "Forward context",
  finite: "Finite",
  entireHorizon: "Entire Horizon",
  finiteValue: "Rows",
  backwardCurrentOnly: "Includes the current row only within its Horizon.",
  backwardFinite: (preceding) => `Includes the current row and at most ${preceding} preceding rows within its Horizon.`,
  backwardInfinite: "Includes the current row and every preceding row within its Horizon.",
  forwardNone: "Adds no following rows.",
  forwardFinite: (following) => `Adds at most ${following} following rows within its Horizon; the current row is excluded from this count.`,
  forwardInfinite: "Adds every following row within its Horizon; the current row is excluded from this count.",
  extentErrors: {
    required: "Enter an extent.",
    integer: "Use a whole decimal integer or Infinity.",
    minimumBackward: "Backward context must be at least 1.",
    minimumForward: "Forward context must be at least 0.",
    safeInteger: "The extent exceeds the largest safe integer.",
  },
  rowOrder: "Row order",
  weighting: "Weighting",
  binary: "Binary",
  binaryHelp: "Binary accepts one consistent 0/1 numeric or false/true Boolean representation per Code.",
  frequency: "Frequency",
  frequencyHelp: "Frequency accepts finite nonnegative numeric Code values, including decimals.",
  rotation: "Projection & Rotation",
  svd: "SVD",
  means: "Means",
  reference: "Reference",
  centerAlign: "Align target-fitted center to the origin",
  meansInUnits: "Set the ordered Means contrast in Units.",
  goToMeans: "Open Means contrast in Units",
  meansTrajectoryInvalid: "Direct Means rotation requires EndPoint. The Means selection is preserved.",
  chooseSvd: "Choose SVD",
  chooseReference: "Choose Reference",
  returnToEndpoint: "Return to EndPoint",
  referenceSelection: "Reference source",
  noReference: "No Reference selected",
  unavailableReference: (name) => `${name} (unavailable current Reference)`,
  referenceRequired: "Choose an owned validated Reference. The Reference selection remains active and Run is blocked.",
  referencePreviewUnavailable: "Current owned Reference evidence is unavailable for this exact context.",
  referenceIncompatible: "The selected Reference is incompatible with this target. The selection is preserved.",
  referenceCompatible: "Compatible with the current target configuration.",
  referenceFacts: "Reference evidence",
  referenceName: "Source",
  referenceHash: "Content hash",
  sourceFit: "Source fit",
  sourceFitMethods: { svd: "Source SVD", means: "Source Means" },
  sourcePopulation: "Source population",
  sourcePopulations: { "endpoint-units": "Endpoint Units" },
  sourceObservations: "Source observations",
  basis: "Fixed basis",
  basisSummary: (codes, edges, axes) => `${codes} Codes, ${edges} edges, ${axes} axes`,
  fixedCentering: "Centering is fixed by the source Reference",
  centeredAtOrigin: "source fit aligned to origin",
  centeredAtSourceMean: "source fit center retained",
  targetProjection: "Target projection",
  targetProjectionPending: "No current target projection has been adopted.",
  targetProjectionSummary: (rank, variance) => `Target rank ${rank}; fixed-axis variance ${variance}`,
  compatibilityReasons: "Compatibility details",
  referenceCompatibilityReason: (reason) => `Localized ${reason}`,
  resources: "Execution resource preflight",
  resourcesUnavailable: "No current compiler-owned preflight is available for this exact scientific context.",
  resourcesInvalidRaw: "Active raw Window input is invalid, so there is no executable plan or current estimate.",
  resourcesInvalidDraft: "The active draft is invalid, so there is no executable plan or current estimate.",
  resourceStatus: "Current preflight admitted",
  resourceRows: (value) => `${value} rows`,
  resourceDimensions: (value) => `${value} adjacency dimensions`,
  resourceVisits: (value) => `${value} estimated window visits`,
  resourcePeak: (value) => `${value} estimated peak bytes`,
  resourceRotation: (value) => `${value} estimated rotation work units`,
  resourceNoTruncation: "Hard caps block execution; they never authorize truncating rows, Codes, windows, or data.",
  onaContract: "Ordered Network Analysis Window contract",
  onaForwardFixed: "Forward context is fixed at 0 for Ordered Network Analysis.",
  onaWeightingFixed: "Frequency weighting is fixed for Ordered Network Analysis.",
  onaModelFixed: "EndPoint is fixed for Ordered Network Analysis.",
  onaRotationFixed: "SVD is fixed for Ordered Network Analysis.",
};

function panelProps(input = drafts()) {
  const state = createModelStateV3(input, datasetSha256);
  const actions: ModelStateActionV3[] = [];
  return {
    copy,
    orderCopy,
    state,
    fields: { id: (path: string) => `field:${path}` },
    columnOptions: ["student", "conversation", "turn", "time", "condition", "A", "B", "C"],
    rawState: createWindowsPanelRawStateV3(input),
    onRawStateChange: () => {},
    onBlockersChange: () => {},
    onNavigateToMeansContrast: () => {},
    sourcePreview: {
      availability: "available" as const,
      context: modelScientificContextV3(state),
      rowCount: 5,
    },
    preflight: null,
    referenceOptions: [],
    referencePreview: { availability: "unavailable" as const },
    dispatch: (action: ModelStateActionV3) => actions.push(action),
    actions,
  };
}

test("strict extent parsing admits only exact safe integers or the tagged Infinity sentinel", () => {
  for (const value of ["", " ", "-1", "1.5", "1e2", "+1", "NaN", "infinity", "9007199254740992"]) {
    assert.equal(parseWindowExtentInputV3(value, "backward").status, "invalid", value);
  }
  assert.equal(parseWindowExtentInputV3("0", "backward").status, "invalid");
  assert.deepEqual(parseWindowExtentInputV3("1", "backward"), {
    status: "valid", extent: { kind: "finite", value: 1 },
  });
  assert.deepEqual(parseWindowExtentInputV3("9007199254740991", "backward"), {
    status: "valid", extent: { kind: "finite", value: Number.MAX_SAFE_INTEGER },
  });
  assert.deepEqual(parseWindowExtentInputV3("0", "forward"), {
    status: "valid", extent: { kind: "finite", value: 0 },
  });
  assert.equal(parseWindowExtentInputV3("-0", "forward").status, "invalid");
  assert.deepEqual(parseWindowExtentInputV3("Infinity", "forward"), {
    status: "valid", extent: { kind: "infinity" },
  });
});

test("raw Windows state preserves independent Standard and ONA extents and row-order memory", () => {
  const raw = createWindowsPanelRawStateV3(drafts());
  assert.deepEqual(raw.standard.backward, { mode: "finite", finiteText: "5" });
  assert.deepEqual(raw.standard.forward, { mode: "finite", finiteText: "2" });
  assert.equal(raw.standard.rowOrder.rows[0]?.column, "turn");
  assert.deepEqual(raw.ona.backward, { mode: "finite", finiteText: "3" });
  assert.equal(raw.ona.rowOrder.rows[0]?.column, "turn");
  assert.notEqual(raw.standard.rowOrder, raw.ona.rowOrder);

  const infinityDrafts = drafts();
  infinityDrafts.standard.movingStanza.backward = { kind: "infinity" };
  infinityDrafts.standard.movingStanza.forward = { kind: "infinity" };
  const infinityRaw = createWindowsPanelRawStateV3(infinityDrafts).standard;
  assert.deepEqual(infinityRaw.backward, { mode: "infinity", finiteText: "" });
  assert.deepEqual(infinityRaw.forward, { mode: "infinity", finiteText: "" });
  assert.equal(infinityRaw.rowOrder.rows[0]?.column, "turn");
});

test("Standard Windows exposes all six Model by Window choices and the complete parameter set", () => {
  const markup = renderToStaticMarkup(createElement(OpenEnaWindowsPanelV3, panelProps()));
  for (const label of [
    "EndPoint", "Separate Trajectory", "Accumulated Trajectory",
    "Moving Stanza Window", "Conversation / Horizon Window",
    "Backward context", "Forward context", "Binary", "Frequency", "SVD", "Means", "Reference",
  ]) assert.match(markup, new RegExp(label, "u"), label);
  assert.match(markup, /Includes the current row and at most 4 preceding rows within its Horizon/u);
  assert.match(markup, /Adds at most 2 following rows within its Horizon; the current row is excluded/u);
  assert.match(markup, /field:movingStanza\.rowOrder/u);
  assert.match(markup, /conversation.*turn/u, "row-order confirmation uses ordered Horizon fields only");
  assert.doesNotMatch(markup, /student →|condition →|A →|Transmodal/u);
});

test("explicit row order accepts eligible non-Horizon fields while source receipts retain only ordered Horizon fields", async () => {
  const input = drafts();
  input.standard.horizonColumns = ["conversation"];
  input.standard.movingStanza.rowOrder = {
    kind: "columns",
    keys: [{ column: "time", direction: "ascending", comparator: { type: "number" } }],
  };
  input.ona.horizonColumns = ["conversation"];
  input.ona.rowOrder = input.standard.movingStanza.rowOrder;
  input.ona.directionalMask = {
    schemaVersion: 1,
    codeOrder: ["A", "B", "C"],
    enabled: [
      [true, true, false],
      [true, true, true],
      [false, true, true],
    ],
  };
  const props = panelProps(input);
  assert.equal(windowFieldBlockersV3(
    props.state,
    props.rawState,
    props.sourcePreview,
    props.columnOptions,
  ).rowOrder, false);
  const standardMarkup = renderToStaticMarkup(createElement(OpenEnaWindowsPanelV3, props));
  assert.match(standardMarkup, /<option value="time" selected="">time<\/option>/u);
  assert.doesNotMatch(standardMarkup, /Complete every active order field before running/u);

  const data: ParsedDataset = {
    name: "non-horizon-order.csv", source: "upload", sizeBytes: 256,
    headers: props.columnOptions,
    rows: [
      { student: "u1", conversation: "h1", turn: "a", time: 1, condition: "Control", A: 1, B: 1, C: 0 },
      { student: "u1", conversation: "h1", turn: "b", time: 2, condition: "Control", A: 0, B: 1, C: 1 },
      { student: "u2", conversation: "h2", turn: "a", time: 1, condition: "Treatment", A: 1, B: 0, C: 1 },
      { student: "u2", conversation: "h2", turn: "b", time: 2, condition: "Treatment", A: 1, B: 1, C: 1 },
    ],
  };
  const standard = await compileStandardDraftV3(data, datasetSha256, input.standard);
  assert.equal(standard.status, "ready", standard.diagnostics.map((entry) => entry.id).join(", "));
  const ona = await compileOnaDraftV3(data, datasetSha256, input.ona);
  assert.equal(ona.status, "ready", ona.diagnostics.map((entry) => entry.id).join(", "));

  input.activeFamily = "ona";
  const onaProps = panelProps(input);
  assert.equal(windowFieldBlockersV3(
    onaProps.state,
    onaProps.rawState,
    onaProps.sourcePreview,
    onaProps.columnOptions,
  ).rowOrder, false);
  const onaMarkup = renderToStaticMarkup(createElement(OpenEnaWindowsPanelV3, onaProps));
  assert.match(onaMarkup, /<option value="time" selected="">time<\/option>/u);
});

test("Conversation retains the distinct scientific type while hiding inactive extent and row-order controls", () => {
  const input = drafts();
  input.standard.windowType = "Conversation";
  input.standard.movingStanza.backward = { kind: "infinity" };
  input.standard.movingStanza.forward = { kind: "infinity" };
  const markup = renderToStaticMarkup(createElement(OpenEnaWindowsPanelV3, panelProps(input)));
  assert.match(markup, /All source rows in the same typed Horizon contribute/u);
  assert.doesNotMatch(markup, /Backward context|Forward context|Row order/u);
  assert.deepEqual(input.standard.movingStanza.backward, { kind: "infinity" });
  assert.deepEqual(input.standard.movingStanza.forward, { kind: "infinity" });
});

test("boundary extent copy distinguishes included backward current row from excluded forward current row", () => {
  const input = drafts();
  input.standard.movingStanza.backward = { kind: "finite", value: 1 };
  input.standard.movingStanza.forward = { kind: "finite", value: 0 };
  const markup = renderToStaticMarkup(createElement(OpenEnaWindowsPanelV3, panelProps(input)));
  assert.match(markup, /Includes the current row only within its Horizon/u);
  assert.match(markup, /Adds no following rows/u);
});

test("ONA Windows shows only its editable backward and ordered fixed contract", () => {
  const input = drafts();
  input.activeFamily = "ona";
  const markup = renderToStaticMarkup(createElement(OpenEnaWindowsPanelV3, panelProps(input)));
  assert.match(markup, /Ordered Network Analysis Window contract/u);
  assert.match(markup, /Backward context/u);
  assert.match(markup, /Finite/u);
  assert.match(markup, /Entire Horizon/u);
  assert.match(markup, /Row order/u);
  assert.match(markup, /Forward context is fixed at 0/u);
  assert.match(markup, /Frequency weighting is fixed/u);
  assert.match(markup, /EndPoint is fixed/u);
  assert.match(markup, /SVD is fixed/u);
  for (const field of ["model", "weighting", "rotation", "window.forward"]) {
    assert.match(markup, new RegExp(`id="field:${field}" tabindex="-1"`, "u"), field);
  }
  assert.doesNotMatch(markup, /Conversation \/ Horizon|Separate Trajectory|Accumulated Trajectory|Binary|Means|Reference source|Forward context<\/legend>/u);
});

test("Windows diagnostics resolve to focusable Task28 field IDs", () => {
  assert.equal(modelDiagnosticFieldTargetV3("standard", "weighting")?.fieldId, "ena-model-field-windows-00007700006500006900006700006800007400006900006e000067");
  assert.equal(modelDiagnosticFieldTargetV3("standard", "rotation.centerAlignToOrigin")?.tab, "windows");
  assert.equal(modelDiagnosticFieldTargetV3("ona", "backward")?.tab, "windows");
  assert.deepEqual(modelDiagnosticFieldTargetV3("standard", "resources"), {
    tab: "windows",
    fieldPath: "resources",
    fieldId: "ena-model-field-windows-00007200006500007300006f000075000072000063000065000073",
  });
  const markup = renderToStaticMarkup(createElement(OpenEnaWindowsPanelV3, panelProps()));
  assert.match(markup, /id="field:resources" tabindex="-1" aria-label="Execution resource preflight"/u);
});

test("trajectory Means remains selected and shows explicit resolutions plus real Units navigation", () => {
  const input = drafts();
  input.standard.model = "SeparateTrajectory";
  input.standard.rotation = {
    type: "means", centerAlignToOrigin: false,
    negativeLevel: { type: "string", value: "Control" },
    positiveLevel: { type: "string", value: "Treatment" },
  };
  const markup = renderToStaticMarkup(createElement(OpenEnaWindowsPanelV3, panelProps(input)));
  assert.match(markup, /<option value="means" selected="">Means<\/option>/u);
  assert.match(markup, /Direct Means rotation requires EndPoint/u);
  assert.match(markup, /id="field:rotation" aria-invalid="true" aria-describedby="field:rotation\.conflict"/u);
  assert.match(markup, /Choose SVD/u);
  assert.match(markup, /Choose Reference/u);
  assert.match(markup, /Return to EndPoint/u);
  assert.match(markup, /Open Means contrast in Units/u);
});

test("Reference preview separates source fit, fixed basis and centering from compatibility and target projection", () => {
  const input = drafts();
  const referenceId = "open-ena-standard-ref-v2:" + "b".repeat(64);
  const contentSha256 = "b".repeat(64);
  input.standard.rotation = {
    type: "reference",
    referenceId,
    expectedContentSha256: contentSha256,
  };
  const props = panelProps(input);
  const referencePreview = {
    availability: "available",
    context: modelScientificContextV3(props.state),
    referenceId,
    contentSha256,
    displayName: "Owned endpoint basis",
    sourceFit: { method: "means", population: "endpoint-units", observationCount: 48 },
    basis: { codeCount: 3, edgeCount: 3, rotationColumns: ["MR1", "SVD2", "SVD3"] },
    fixedCentering: { centerAlignToOrigin: false },
    compatibility: { status: "compatible", reasons: [] },
    targetProjection: { status: "available", rank: 2, variance: [0.7, 0.3, 0] },
  } satisfies Extract<OpenEnaReferenceSelectionPreviewV3, { availability: "available" }>;
  const markup = renderToStaticMarkup(createElement(OpenEnaWindowsPanelV3, {
    ...props,
    referenceOptions: [{
      referenceId: referencePreview.referenceId,
      contentSha256: referencePreview.contentSha256,
      displayName: referencePreview.displayName,
    }],
    referencePreview,
  }));
  assert.match(markup, /Owned endpoint basis/u);
  assert.match(markup, /Source Means/u);
  assert.match(markup, /Endpoint Units/u);
  assert.match(markup, /48/u);
  assert.match(markup, /3 Codes, 3 edges, 3 axes/u);
  assert.match(markup, /source fit center retained/u);
  assert.match(markup, /Compatible with the current target/u);
  assert.match(markup, /Target rank 2; fixed-axis variance 0\.7, 0\.3, 0/u);
  assert.match(markup, new RegExp("b{12}…", "u"));
  assert.doesNotMatch(markup, new RegExp("<dd>b{64}</dd>", "u"), "the displayed digest is bounded");
});

test("an unavailable selected Reference stays visible and invalid without an SVD fallback", () => {
  const input = drafts();
  input.standard.rotation = {
    type: "reference",
    referenceId: "missing-reference",
    expectedContentSha256: "c".repeat(64),
  };
  const markup = renderToStaticMarkup(createElement(OpenEnaWindowsPanelV3, panelProps(input)));
  assert.match(markup, /<option value="reference" selected="">Reference<\/option>/u);
  assert.match(markup, /missing-reference \(unavailable current Reference\)/u);
  assert.match(markup, /value="__open_ena_current_reference__" disabled="" selected=""/u);
  assert.match(markup, /id="field:reference" aria-invalid="true" aria-describedby="field:reference\.error"/u);
  assert.match(markup, /id="field:reference\.error" role="alert"/u);
  assert.match(markup, /Current owned Reference evidence is unavailable/u);
  assert.doesNotMatch(markup, /<option value="svd" selected/u);
});

test("resource preview accepts only a current compiler-owned ready result and never authorizes truncation", async () => {
  const input = drafts();
  const data: ParsedDataset = {
    name: "resource.csv", source: "upload", sizeBytes: 256,
    headers: ["student", "conversation", "turn", "condition", "A", "B", "C"],
    rows: [
      { student: "u1", conversation: "h1", turn: 1, condition: "Control", A: 1, B: 1, C: 0 },
      { student: "u1", conversation: "h1", turn: 2, condition: "Control", A: 0, B: 1, C: 1 },
      { student: "u2", conversation: "h2", turn: 1, condition: "Treatment", A: 1, B: 0, C: 1 },
      { student: "u2", conversation: "h2", turn: 2, condition: "Treatment", A: 1, B: 1, C: 1 },
    ],
  };
  const compiled = await compileStandardDraftV3(data, datasetSha256, input.standard);
  assert.equal(compiled.status, "ready");
  if (compiled.status !== "ready") throw new Error("Expected a ready resource fixture");
  const props = panelProps(input);
  const markup = renderToStaticMarkup(createElement(OpenEnaWindowsPanelV3, {
    ...props,
    preflight: { context: modelScientificContextV3(props.state), result: compiled },
  }));
  assert.match(markup, /Current preflight admitted/u);
  assert.match(markup, /4 rows/u);
  assert.match(markup, /3 adjacency dimensions/u);
  assert.match(markup, /4 estimated window visits/u);
  assert.match(markup, new RegExp(`${compiled.resourceEstimate.estimatedPeakBytes} estimated peak bytes`, "u"));
  assert.match(markup, new RegExp(`${compiled.resourceEstimate.estimatedRotationWorkUnits} estimated rotation work units`, "u"));
  assert.match(markup, /never authorize truncating rows, Codes, windows, or data/u);

  const copied = structuredClone(compiled);
  const copiedMarkup = renderToStaticMarkup(createElement(OpenEnaWindowsPanelV3, {
    ...props,
    preflight: { context: modelScientificContextV3(props.state), result: copied },
  }));
  assert.match(copiedMarkup, /No current compiler-owned preflight is available/u);
  assert.doesNotMatch(copiedMarkup, /Current preflight admitted/u);
});

test("real compiler keeps incompatible Means and incomplete Reference drafts invalid without fallback", async () => {
  const data: ParsedDataset = {
    name: "windows.csv", source: "upload", sizeBytes: 256,
    headers: ["student", "conversation", "turn", "condition", "A", "B", "C"],
    rows: [
      { student: "u1", conversation: "h1", turn: 1, condition: "Control", A: 1, B: 1, C: 0 },
      { student: "u1", conversation: "h2", turn: 2, condition: "Control", A: 0, B: 1, C: 1 },
      { student: "u2", conversation: "h1", turn: 1, condition: "Treatment", A: 1, B: 0, C: 1 },
      { student: "u2", conversation: "h2", turn: 2, condition: "Treatment", A: 1, B: 1, C: 1 },
    ],
  };
  const means: StandardEnaDraftV3 = {
    ...drafts().standard,
    model: "SeparateTrajectory",
    windowType: "Conversation",
    horizonOrder: {
      kind: "columns",
      keys: [{ column: "turn", direction: "ascending", comparator: { type: "number" } }],
    },
    rotation: {
      type: "means", centerAlignToOrigin: true,
      negativeLevel: { type: "string", value: "Control" },
      positiveLevel: { type: "string", value: "Treatment" },
    },
  };
  const meansResult = await compileStandardDraftV3(data, datasetSha256, means);
  assert.equal(means.rotation.type, "means");
  assert.equal(meansResult.status, "invalid");
  assert.ok(meansResult.diagnostics.some((entry) => entry.id === "STANDARD_MEANS_REQUIRES_ENDPOINT"));

  const reference: StandardEnaDraftV3 = {
    ...means,
    rotation: { type: "reference", referenceId: "incompatible-owned-reference", expectedContentSha256: null },
  };
  const referenceResult = await compileStandardDraftV3(data, datasetSha256, reference);
  assert.equal(reference.rotation.type, "reference");
  assert.equal(referenceResult.status, "invalid");
  assert.ok(referenceResult.diagnostics.some((entry) => entry.scope === "reference"));
});
