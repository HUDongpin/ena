import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";

const datasetSha256 = "a".repeat(64);
const referenceHash = "b".repeat(64);
const referenceId = `open-ena-standard-ref-v2:${referenceHash}`;

const drafts = {
  schemaVersion: 3,
  activeFamily: "standard",
  standard: {
    unitColumns: ["student"], horizonColumns: ["conversation", "turn"], groupColumn: "condition",
    codes: ["A", "B", "C"], weighting: "frequency", model: "EndPoint",
    windowType: "MovingStanzaWindow",
    movingStanza: {
      backward: { kind: "finite", value: 5 }, forward: { kind: "finite", value: 2 },
      rowOrder: { kind: "columns", keys: [{ column: "time", direction: "ascending", comparator: { type: "number" } }] },
    },
    horizonOrder: null,
    rotation: { type: "svd", centerAlignToOrigin: true },
  },
  ona: {
    unitColumns: ["student"], horizonColumns: ["conversation", "turn"], groupColumn: null,
    codes: ["A", "B", "C"], backward: { kind: "finite", value: 3 },
    rowOrder: { kind: "columns", keys: [{ column: "time", direction: "ascending", comparator: { type: "number" } }] },
    directionalMask: null,
  },
};

const baseOrderCopy = {
  sortByFields: "Sort by fields", useSourceOrder: "Use source order", addKey: "Add order key",
  field: "Field", chooseField: "Choose a field", direction: "Direction", ascending: "Ascending", descending: "Descending",
  comparator: "Comparator", comparators: { number: "Number", date: "Date (YYYY-MM-DD)", datetime: "Datetime (ISO-8601, offset in value)", "ordered-category": "Ordered category", text: "Text" },
  categoryLevels: "Ordered category levels", addCategoryLevel: "Add category level", scalarType: "Value type",
  scalarTypes: { string: "String", number: "Number", boolean: "Boolean" }, scalarValue: "Value",
  booleanValues: { true: "true", false: "false" }, textLocale: "Locale", textSensitivity: "Sensitivity",
  textSensitivities: { base: "Base", accent: "Accent", case: "Case", variant: "Variant" }, textNumeric: "Numeric collation",
  invalidEditor: "Complete every active order field before running.",
  sourceStatement: "I confirm the observed source sequence for this exact dataset and field context.",
  reviewSourceStatement: "Review source-order statement", acceptSourceStatement: "Accept statement", cancelSourceStatement: "Cancel",
  sourceConfirmed: "Source order explicitly confirmed", sourceUnconfirmed: "Source order is not confirmed",
  sourceBindingChanged: "The dataset or scientific context changed. Review the statement again.",
  datasetHash: "Dataset", rowCount: "Rows", relevantFields: "Relevant fields", confirmationVersion: "Confirmation version",
  confirmedAt: "Confirmed at", unavailable: "Unavailable for this context",
};

const baseCopy = {
  model: "Model",
  models: { EndPoint: "EndPoint", SeparateTrajectory: "Separate Trajectory", AccumulatedTrajectory: "Accumulated Trajectory" },
  window: "Window", movingStanza: "Moving Stanza Window", conversation: "Conversation / Horizon Window",
  conversationExplanation: "All source rows in the same typed Horizon contribute; extent and row order are inactive.",
  backward: "Backward context", forward: "Forward context", finite: "Finite", entireHorizon: "Entire Horizon", finiteValue: "Rows",
  backwardCurrentOnly: "Includes the current row only within its Horizon.",
  backwardInfinite: "Includes the current row and every preceding row within its Horizon.",
  forwardNone: "Adds no following rows.",
  forwardInfinite: "Adds every following row within its Horizon; the current row is excluded from this count.",
  extentErrors: {
    required: "Enter an extent.", integer: "Use a whole decimal integer or Infinity.",
    minimumBackward: "Backward context must be at least 1.", minimumForward: "Forward context must be at least 0.",
    safeInteger: "The extent exceeds the largest safe integer.",
  },
  rowOrder: "Row order", weighting: "Weighting", binary: "Binary",
  binaryHelp: "Binary accepts one consistent 0/1 numeric or false/true Boolean representation per Code.",
  frequency: "Frequency", frequencyHelp: "Frequency accepts finite nonnegative numeric Code values, including decimals.",
  rotation: "Projection & Rotation", svd: "SVD", means: "Means", reference: "Reference",
  centerAlign: "Align target-fitted center to the origin", meansInUnits: "Set the ordered Means contrast in Units.",
  goToMeans: "Open Means contrast in Units",
  meansTrajectoryInvalid: "Direct Means rotation requires EndPoint. The Means selection is preserved.",
  chooseSvd: "Choose SVD", chooseReference: "Choose Reference", returnToEndpoint: "Return to EndPoint",
  referenceSelection: "Reference source", noReference: "No Reference selected",
  referenceRequired: "Choose an owned validated Reference. The Reference selection remains active and Run is blocked.",
  referencePreviewUnavailable: "Current owned Reference evidence is unavailable for this exact context.",
  referenceIncompatible: "The selected Reference is incompatible with this target. The selection is preserved.",
  referenceCompatible: "Compatible with the current target configuration.",
  referenceFacts: "Reference evidence", referenceName: "Source", referenceHash: "Content hash", sourceFit: "Source fit",
  sourceFitMethods: { svd: "Source SVD", means: "Source Means" },
  sourcePopulation: "Source population", sourcePopulations: { "endpoint-units": "Endpoint Units" },
  sourceObservations: "Source observations", basis: "Fixed basis",
  fixedCentering: "Centering is fixed by the source Reference", centeredAtOrigin: "source fit aligned to origin",
  centeredAtSourceMean: "source fit center retained", targetProjection: "Target projection",
  targetProjectionPending: "No current target projection has been adopted.", compatibilityReasons: "Compatibility details",
  resources: "Execution resource preflight",
  resourcesUnavailable: "No current compiler-owned preflight is available for this exact scientific context.",
  resourcesInvalidRaw: "Active raw Window input is invalid, so there is no executable plan or current estimate.",
  resourcesInvalidDraft: "The active draft is invalid, so there is no executable plan or current estimate.",
  resourceStatus: "Current preflight admitted",
  resourceNoTruncation: "Hard caps block execution; they never authorize truncating rows, Codes, windows, or data.",
  onaContract: "Ordered Network Analysis Window contract",
  onaForwardFixed: "Forward context is fixed at 0 for Ordered Network Analysis.",
  onaWeightingFixed: "Frequency weighting is fixed for Ordered Network Analysis.",
  onaModelFixed: "EndPoint is fixed for Ordered Network Analysis.",
  onaRotationFixed: "SVD is fixed for Ordered Network Analysis.",
};

const entry = `
  import React, { useCallback, useState } from "react";
  import { createRoot } from "react-dom/client";
  import { OpenEnaWindowsPanelV3, createWindowsPanelRawStateV3 } from "./components/open-ena/model-v3/OpenEnaWindowsPanelV3";
  import { createModelStateV3, modelScientificContextV3, modelStateReducerV3 } from "./components/open-ena/model-v3/model-state";

  const initialDrafts = ${JSON.stringify(drafts)};
  const baseCopy = ${JSON.stringify(baseCopy)};
  const baseOrderCopy = ${JSON.stringify(baseOrderCopy)};
  const referenceId = ${JSON.stringify(referenceId)};
  const referenceHash = ${JSON.stringify(referenceHash)};
  const blockerEvents = [];
  const actions = [];
  const copy = {
    ...baseCopy,
    backwardFinite: (count) => "Includes the current row and at most " + count + " preceding rows within its Horizon.",
    forwardFinite: (count) => "Adds at most " + count + " following rows within its Horizon; the current row is excluded from this count.",
    unavailableReference: (name) => name + " (unavailable current Reference)",
    referenceCompatibilityReason: (reason) => "Localized " + reason,
    basisSummary: (codes, edges, axes) => codes + " Codes, " + edges + " edges, " + axes + " axes",
    targetProjectionSummary: (rank, variance) => "Target rank " + rank + "; fixed-axis variance " + variance,
    resourceRows: (value) => value + " rows", resourceDimensions: (value) => value + " adjacency dimensions",
    resourceVisits: (value) => value + " estimated window visits", resourcePeak: (value) => value + " estimated peak bytes",
    resourceRotation: (value) => value + " estimated rotation work units",
  };
  const orderCopy = {
    ...baseOrderCopy,
    removeKey: (index) => "Remove order key " + (index + 1),
    moveKeyUp: (index) => "Move order key " + (index + 1) + " up",
    moveKeyDown: (index) => "Move order key " + (index + 1) + " down",
    keyLabel: (index) => "Order key " + (index + 1),
    missingField: (field) => field + " (unavailable current field)",
    removeCategoryLevel: (index) => "Remove category level " + (index + 1),
    moveCategoryLevelUp: (index) => "Move category level " + (index + 1) + " up",
    moveCategoryLevelDown: (index) => "Move category level " + (index + 1) + " down",
  };

  function App() {
    const [state, setState] = useState(() => createModelStateV3(initialDrafts, ${JSON.stringify(datasetSha256)}));
    const [raw, setRaw] = useState(() => createWindowsPanelRawStateV3(initialDrafts));
    const [mounted, setMounted] = useState(true);
    const [blockers, setBlockers] = useState({ backward: false, forward: false, rowOrder: false });
    const [meansVisits, setMeansVisits] = useState(0);
    const dispatch = useCallback((action) => {
      actions.push(action);
      setState((current) => modelStateReducerV3(current, action));
    }, []);
    const onBlockersChange = useCallback((family, next) => {
      blockerEvents.push({ family, ...next });
      setBlockers(next);
      const aggregate = next.backward || next.forward || next.rowOrder;
      setState((current) => modelStateReducerV3(current, {
        type: "set-editor-blocked", family, blocked: aggregate,
      }));
    }, []);
    const scientificContext = modelScientificContextV3(state);
    const draft = state.drafts[state.drafts.activeFamily];
    const standard = state.drafts.standard;
    const selectedReference = standard.rotation.type === "reference" ? standard.rotation : null;
    const selectionInvalid = state.drafts.activeFamily === "standard" && (
      standard.model !== "EndPoint" && standard.rotation.type === "means"
      || selectedReference !== null && (
        selectedReference.referenceId === null
        || selectedReference.expectedContentSha256 === null
        || selectedReference.referenceId === referenceId
      )
    );
    const runDisabled = state.editorBlocked[state.drafts.activeFamily] || selectionInvalid;
    const referencePreview = selectedReference?.referenceId === referenceId
      && selectedReference.expectedContentSha256 === referenceHash
      ? {
          availability: "available", context: scientificContext, referenceId, contentSha256: referenceHash,
          displayName: "Owned incompatible endpoint basis",
          sourceFit: { method: "svd", population: "endpoint-units", observationCount: 12 },
          basis: { codeCount: 3, edgeCount: 3, rotationColumns: ["SVD1", "SVD2", "SVD3"] },
          fixedCentering: { centerAlignToOrigin: true },
          compatibility: { status: "incompatible", reasons: ["weighting"] },
          targetProjection: { status: "not-adopted" },
        }
      : { availability: "unavailable" };
    window.__task28 = {
      state, raw, blockers, blockerEvents, actions, meansVisits, runDisabled,
      setMounted,
      setFamily(family) { dispatch({ type: "set-active-family", family }); },
      startRun() { dispatch({ type: "mark-running", executionPlanSha256: "d".repeat(64), context: modelScientificContextV3(state) }); },
    };
    return React.createElement("main", null,
      React.createElement("button", { id: "run", disabled: runDisabled }, "Run model"),
      mounted ? React.createElement(OpenEnaWindowsPanelV3, {
        copy, orderCopy, state, fields: { id: (path) => "browser-field:" + path },
        columnOptions: ["student", "conversation", "turn", "time", "condition", "A", "B", "C"],
        rawState: raw, onRawStateChange: setRaw, onBlockersChange,
        onNavigateToMeansContrast: () => setMeansVisits((value) => value + 1),
        sourcePreview: { availability: "available", context: scientificContext, rowCount: 8 },
        preflight: null,
        referenceOptions: [{ referenceId, contentSha256: referenceHash, displayName: "Owned incompatible endpoint basis" }],
        referencePreview, dispatch,
        now: () => new Date("2026-09-06T01:02:03.004Z"),
      }) : React.createElement("p", { id: "unmounted" }, "Windows unmounted"),
      React.createElement("output", { id: "active-family" }, state.drafts.activeFamily),
      React.createElement("output", { id: "active-blocked" }, String(state.editorBlocked[state.drafts.activeFamily])),
      React.createElement("output", { id: "run-status" }, state.runStatus),
      React.createElement("output", { id: "typed-window" }, JSON.stringify(draft)),
    );
  }
  createRoot(document.getElementById("root")).render(React.createElement(App));
`;

const bundle = await build({
  stdin: {
    contents: entry,
    loader: "tsx",
    resolveDir: new URL("..", import.meta.url).pathname,
    sourcefile: "task28-windows-browser-harness.tsx",
  },
  bundle: true,
  format: "iife",
  platform: "browser",
  write: false,
  logLevel: "silent",
});

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });

  const panel = page.getByTestId("open-ena-model-v3-windows-panel");
  await panel.waitFor();
  assert.equal(await panel.locator(".ena-model-windows-v3-resources").isVisible(), false, "resource details start collapsed in the restored workbench");
  await panel.locator("summary").filter({ hasText: /^Execution resource preflight$/u }).click();
  await page.evaluate(() => document.getElementById("browser-field:resources").focus());
  assert.equal(await page.evaluate(() => document.activeElement?.id), "browser-field:resources", "resource diagnostics have a real focus target");
  const run = page.getByRole("button", { name: "Run model" });
  await page.waitForFunction(() => window.__task28.state.editorBlocked.standard === false);
  assert.equal(await run.isDisabled(), false);
  await panel.getByLabel("Binary", { exact: true }).check();
  await page.waitForFunction(() => window.__task28.state.drafts.standard.weighting === "binary");
  await panel.getByLabel("Frequency", { exact: true }).check();
  await page.waitForFunction(() => window.__task28.state.drafts.standard.weighting === "frequency");
  await panel.getByLabel("Align target-fitted center to the origin").uncheck();
  await page.waitForFunction(() => window.__task28.state.drafts.standard.rotation.centerAlignToOrigin === false);

  const backward = panel.getByRole("group", { name: "Backward context" });
  const forward = panel.getByRole("group", { name: "Forward context" });
  assert.equal(await panel.locator(".ena-model-order-v3-key").nth(0).locator("select").nth(0).inputValue(), "time", "explicit row order accepts a non-Horizon eligible field");
  const backwardInput = backward.getByLabel("Rows");
  const forwardInput = forward.getByLabel("Rows");
  await page.evaluate(() => window.__task28.startRun());
  await backwardInput.fill("");
  await page.waitForFunction(() => window.__task28.blockers.backward && window.__task28.state.editorBlocked.standard);
  assert.equal(await page.getByText("Enter an extent.", { exact: true }).count(), 1);
  assert.equal(await page.evaluate(() => window.__task28.state.drafts.standard.movingStanza.backward.value), 5, "invalid raw text retains the last valid typed extent");
  assert.equal(await page.locator("#run-status").textContent(), "obsolete", "active raw invalidity obsoletes an admitted run");
  assert.equal(await run.isDisabled(), true);

  await forwardInput.fill("-1");
  await page.waitForFunction(() => window.__task28.blockers.backward && window.__task28.blockers.forward);
  await backwardInput.fill("7");
  await page.waitForFunction(() => !window.__task28.blockers.backward && window.__task28.blockers.forward);
  assert.equal(await run.isDisabled(), true, "repairing backward cannot clear forward invalidity");
  await forwardInput.fill("2");
  await page.waitForFunction(() => !window.__task28.blockers.backward && !window.__task28.blockers.forward && !window.__task28.state.editorBlocked.standard);

  await backwardInput.fill("9007199254740991");
  await page.waitForFunction(() => window.__task28.state.drafts.standard.movingStanza.backward.value === Number.MAX_SAFE_INTEGER);
  assert.equal(await backwardInput.inputValue(), "9007199254740991", "finite input is not clamped to a legacy slider or Horizon size");
  await backward.getByLabel("Entire Horizon").check();
  await forward.getByLabel("Entire Horizon").check();
  await page.waitForFunction(() => window.__task28.state.drafts.standard.movingStanza.backward.kind === "infinity" && window.__task28.state.drafts.standard.movingStanza.forward.kind === "infinity");
  assert.deepEqual(await page.evaluate(() => ({
    backward: window.__task28.state.drafts.standard.movingStanza.backward,
    forward: window.__task28.state.drafts.standard.movingStanza.forward,
  })), { backward: { kind: "infinity" }, forward: { kind: "infinity" } });
  await backward.getByLabel("Finite").check();
  await forward.getByLabel("Finite").check();
  await page.waitForFunction(() => window.__task28.state.drafts.standard.movingStanza.backward.value === Number.MAX_SAFE_INTEGER && window.__task28.state.drafts.standard.movingStanza.forward.value === 2);
  assert.equal(await backward.getByLabel("Rows").inputValue(), "9007199254740991", "finite draft text survives Entire Horizon mode");

  await forward.getByLabel("Rows").fill("1.5");
  await page.waitForFunction(() => window.__task28.blockers.forward);
  await panel.getByLabel("Window").selectOption("Conversation");
  await panel.getByText(/All source rows in the same typed Horizon contribute/u).waitFor();
  await page.waitForFunction(() => !window.__task28.state.editorBlocked.standard);
  assert.equal(await run.isDisabled(), false, "inactive Moving Stanza raw errors do not block Conversation");
  assert.equal(await page.evaluate(() => window.__task28.raw.standard.forward.finiteText), "1.5");
  await panel.getByLabel("Window").selectOption("MovingStanzaWindow");
  await page.waitForFunction(() => window.__task28.state.editorBlocked.standard);
  assert.equal(await panel.getByRole("group", { name: "Forward context" }).getByLabel("Rows").inputValue(), "1.5");

  await page.evaluate(() => window.__task28.setMounted(false));
  await page.locator("#unmounted").waitFor();
  assert.equal(await page.evaluate(() => window.__task28.state.editorBlocked.standard), true, "unmount does not clear an active blocker");
  await page.evaluate(() => window.__task28.setMounted(true));
  await panel.waitFor();
  assert.equal(await panel.getByRole("group", { name: "Forward context" }).getByLabel("Rows").inputValue(), "1.5");
  await panel.getByRole("group", { name: "Forward context" }).getByLabel("Rows").fill("2");
  await page.waitForFunction(() => !window.__task28.state.editorBlocked.standard);

  await panel.locator(".ena-row-order-disclosure > summary").click();
  await panel.getByRole("button", { name: "Add order key" }).click();
  await page.waitForFunction(() => window.__task28.blockers.rowOrder);
  await panel.getByRole("group", { name: "Backward context" }).getByLabel("Rows").fill("");
  await page.waitForFunction(() => window.__task28.blockers.backward && window.__task28.blockers.rowOrder);
  await panel.getByRole("group", { name: "Backward context" }).getByLabel("Rows").fill("1");
  await page.waitForFunction(() => !window.__task28.blockers.backward && window.__task28.blockers.rowOrder);
  assert.equal(await run.isDisabled(), true, "repairing an extent cannot clear a separate row-order error");
  const keyRows = panel.locator(".ena-model-order-v3-key");
  await keyRows.nth(1).getByRole("button", { name: "Remove order key 2" }).click();
  await page.waitForFunction(() => !window.__task28.state.editorBlocked.standard);

  await panel.getByLabel("Use source order").check();
  await page.waitForFunction(() => window.__task28.blockers.rowOrder && window.__task28.state.drafts.standard.movingStanza.rowOrder === null);
  await panel.getByRole("button", { name: "Review source-order statement" }).click();
  const sourceDialog = panel.getByRole("dialog", { name: "Review source-order statement" });
  assert.equal(await sourceDialog.getByText("conversation → turn", { exact: true }).count(), 1, "row order binds precisely the ordered Horizon fields");
  await sourceDialog.getByRole("button", { name: "Accept statement" }).click();
  await page.waitForFunction(() => !window.__task28.blockers.rowOrder && window.__task28.state.drafts.standard.movingStanza.rowOrder?.kind === "source-order-confirmed");
  const rowConfirmation = await page.evaluate(() => window.__task28.state.drafts.standard.movingStanza.rowOrder.confirmation);
  assert.equal(rowConfirmation.analysisFamily, "standard");
  assert.deepEqual(rowConfirmation.relevantColumns, ["conversation", "turn"]);
  assert.equal(rowConfirmation.rowCount, 8);

  await panel.getByLabel("Projection & Rotation").selectOption("means");
  await panel.getByRole("button", { name: "Open Means contrast in Units" }).click();
  assert.equal(await page.evaluate(() => window.__task28.meansVisits), 1);
  await panel.getByLabel("Model").selectOption("SeparateTrajectory");
  await panel.getByText(/Direct Means rotation requires EndPoint/u).waitFor();
  assert.equal(await panel.getByLabel("Projection & Rotation").inputValue(), "means");
  assert.equal(await run.isDisabled(), true);
  await panel.getByRole("button", { name: "Return to EndPoint" }).click();
  await page.waitForFunction(() => window.__task28.state.drafts.standard.model === "EndPoint");
  assert.equal(await panel.getByLabel("Projection & Rotation").inputValue(), "means", "explicit model repair preserves Means");
  await panel.getByLabel("Model").selectOption("AccumulatedTrajectory");
  await page.waitForFunction(() => window.__task28.state.drafts.standard.model === "AccumulatedTrajectory" && window.__task28.state.drafts.standard.rotation.type === "means");
  await panel.getByRole("button", { name: "Return to EndPoint" }).click();

  await panel.getByLabel("Projection & Rotation").selectOption("reference");
  assert.equal(await panel.getByLabel("Reference source").inputValue(), "");
  assert.equal(await run.isDisabled(), true);
  await panel.getByLabel("Reference source").selectOption({ label: "Owned incompatible endpoint basis" });
  await panel.getByText(/selected Reference is incompatible/u).waitFor();
  assert.equal(await panel.getByLabel("Projection & Rotation").inputValue(), "reference");
  assert.equal(await run.isDisabled(), true, "incompatible Reference remains selected and blocks the harness Run boundary");
  assert.equal(await panel.getByText(/No current target projection has been adopted/u).count(), 1);

  await page.evaluate(() => window.__task28.setFamily("ona"));
  await panel.getByText("Ordered Network Analysis Window contract", { exact: true }).waitFor();
  await page.waitForFunction(() => window.__task28.state.editorBlocked.ona === false);
  assert.equal(await panel.getByRole("group", { name: "Backward context" }).getByLabel("Rows").inputValue(), "3");
  assert.equal(await panel.getByText(/Forward context is fixed at 0/u).count(), 1);
  assert.equal(await panel.getByLabel("Model").count(), 0);
  await panel.getByRole("group", { name: "Backward context" }).getByLabel("Rows").fill("-1");
  await page.waitForFunction(() => window.__task28.state.editorBlocked.ona);
  await page.evaluate(() => window.__task28.setFamily("standard"));
  await panel.getByLabel("Model").waitFor();
  assert.equal(await panel.getByLabel("Projection & Rotation").inputValue(), "reference");
  assert.equal(await page.evaluate(() => window.__task28.raw.ona.backward.finiteText), "-1");
  await page.evaluate(() => window.__task28.setFamily("ona"));
  await panel.getByRole("group", { name: "Backward context" }).getByLabel("Rows").waitFor();
  assert.equal(await panel.getByRole("group", { name: "Backward context" }).getByLabel("Rows").inputValue(), "-1", "ONA raw memory is independent and restored");

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  console.log("Open ENA Models v3 Windows actual-component browser gate passed.");
} finally {
  await browser.close();
}
