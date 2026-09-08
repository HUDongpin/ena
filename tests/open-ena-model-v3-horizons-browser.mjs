import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";
import { tsImport } from "tsx/esm/api";

const { canonicalJsonV3 } = await tsImport("../lib/open-ena/model-v3/canonical-json.ts", import.meta.url);
const {
  buildExecutionIdentityDictionaryV3,
  createExecutionIdentityResolverV3,
  resolveExecutionIdentitiesForRowsV3,
} = await tsImport("../lib/open-ena/model-v3/identity.ts", import.meta.url);
const { resolveHorizonOrderV3 } = await tsImport("../lib/open-ena/model-v3/ordering.ts", import.meta.url);
const { validateStandardDraftV3 } = await tsImport("../lib/open-ena/model-v3/diagnostics.ts", import.meta.url);

const datasetSha256 = "a".repeat(64);
const rows = [
  { student: 1, week: 1, weekOrder: 1, tieBreak: "a", A: 1, B: 1, C: 0 },
  { student: 1, week: 1, weekOrder: 1, tieBreak: "b", A: 0, B: 1, C: 1 },
  { student: 1, week: "1", weekOrder: 2, tieBreak: "a", A: 1, B: 0, C: 1 },
  { student: 1, week: 2, weekOrder: 3, tieBreak: "a", A: 1, B: 1, C: 1 },
  { student: "1", week: 1, weekOrder: 1, tieBreak: "a", A: 2, B: 1, C: 0 },
  { student: "1", week: 2, weekOrder: 3, tieBreak: "a", A: 0, B: 2, C: 1 },
];
const orderPolicy = {
  kind: "columns",
  keys: [{ column: "weekOrder", direction: "ascending", comparator: { type: "number" } }],
};
const standardDraft = {
  unitColumns: ["student"], horizonColumns: ["week"], groupColumn: null,
  codes: ["A", "B", "C"], weighting: "frequency", model: "SeparateTrajectory",
  windowType: "Conversation",
  movingStanza: { backward: { kind: "finite", value: 1 }, forward: { kind: "finite", value: 0 }, rowOrder: null },
  horizonOrder: orderPolicy,
  rotation: { type: "svd", centerAlignToOrigin: true },
};
const dataset = {
  name: "horizons-browser.csv", source: "upload", sizeBytes: 1,
  headers: ["student", "week", "weekOrder", "tieBreak", "A", "B", "C"], rows,
};
const binding = {
  hashKind: "normalized-utf8-csv-text-sha256",
  normalizedTableSha256: datasetSha256,
  rowCount: rows.length,
  headerSha256: "b".repeat(64),
};
const dictionary = await buildExecutionIdentityDictionaryV3(rows, ["student"], ["week"], null);
const identityResolver = await createExecutionIdentityResolverV3(dictionary);
const rowIdentities = await resolveExecutionIdentitiesForRowsV3(rows, ["student"], ["week"], null, identityResolver);
const resolved = resolveHorizonOrderV3(rows, ["student"], ["week"], orderPolicy);
const unitTokenByKey = new Map(dictionary.units.map((entry) => [entry.canonicalJson, entry.token]));
const horizonTokenByKey = new Map(dictionary.horizons.map((entry) => [entry.canonicalJson, entry.token]));
const observationsByPair = new Map();
for (const row of rowIdentities) {
  const key = `${row.unitToken}:${row.horizonToken}`;
  const prior = observationsByPair.get(key);
  observationsByPair.set(key, prior
    ? { ...prior, rowCount: prior.rowCount + 1 }
    : { unitToken: row.unitToken, horizonToken: row.horizonToken, rowCount: 1 });
}
const unitSequences = resolved.unitSequences.map((sequence) => ({
  unitToken: unitTokenByKey.get(sequence.unitKey),
  steps: sequence.steps.map((step) => ({
    horizonToken: horizonTokenByKey.get(step.horizonKey),
    trajectoryOrdinal: step.trajectoryOrdinal,
  })),
}));
assert.ok(unitSequences.every((sequence) => sequence.unitToken && sequence.steps.every((step) => step.horizonToken)));

const tiedRows = rows.map((row, index) => index === 2 ? { ...row, weekOrder: 1 } : row);
const tieDiagnostic = validateStandardDraftV3(
  { ...dataset, rows: tiedRows }, binding, standardDraft,
).find((diagnostic) => diagnostic.id === "STANDARD_HORIZON_ORDER_UNRESOLVED_TIE");
assert.ok(tieDiagnostic);
assert.equal(tieDiagnostic.suggestedActions, undefined);

const entry = `
  import React, { useState } from "react";
  import { createRoot } from "react-dom/client";
  import { OpenEnaHorizonsPanelV3 } from "./components/open-ena/model-v3/OpenEnaHorizonsPanelV3";
  import { createOrderPolicyEditorRawStateV3 } from "./components/open-ena/model-v3/OpenEnaOrderPolicyEditorV3";
  import { createModelStateV3, modelScientificContextV3, modelStateReducerV3 } from "./components/open-ena/model-v3/model-state";

  const initialDraft = ${JSON.stringify(standardDraft)};
  const dictionary = ${JSON.stringify(dictionary)};
  const observations = ${JSON.stringify([...observationsByPair.values()])};
  const unitSequences = ${JSON.stringify(unitSequences)};
  const actualTieDiagnostic = ${JSON.stringify(tieDiagnostic)};
  const actions = [];
  const blockerEvents = [];
  const baseOrderCopy = ${JSON.stringify({
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
  })};
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
  const baseCopy = ${JSON.stringify({
    horizonIdentity: "Horizon identity", horizonPickerEmpty: "Add a Horizon field", counts: "Horizon structure counts",
    unavailable: "Unavailable for this draft", structure: "Unit by Horizon structure",
    structureColumns: { unit: "Unit", horizon: "Horizon", rows: "Source rows" },
    noSharedHorizons: "No shared Horizons", trajectoryOrder: "Trajectory step order",
    horizonOrderNotApplicable: "Horizon order is not applicable to End Point; the inactive draft is preserved.",
    onaOrderNotApplicable: "Horizon order is not applicable to ONA End Point.", sequences: "Per-Unit sequence preview",
    sequenceUnavailable: "Sequence preview unavailable for this context", tieAction: "Add tie-breaker order key", diagnostics: "Horizon diagnostics",
  })};
  const copy = {
    ...baseCopy,
    addRemoveFields: (label) => "Add or remove " + label + " fields",
    removeField: (field, label) => "Remove " + field + " from " + label,
    unitCount: (count) => count + " Units", horizonCount: (count) => count + " Horizons",
    observationCount: (count) => count + " Unit by Horizon observations",
    sharedHorizons: (count) => count + " shared Horizons",
    singleRowObservations: (count) => count + " single-row observations",
    extremeObservations: (min, max) => "Observed rows range from " + min + " to " + max,
    boundedRows: (shown, total) => "Showing " + shown + " of " + total + " observations",
    sequence: (unit, steps) => unit + ": " + steps,
    boundedSequences: (shown, total) => "Showing " + shown + " of " + total + " Unit sequences",
  };
  const drafts = {
    schemaVersion: 3, activeFamily: "standard", standard: initialDraft,
    ona: { unitColumns: ["student"], horizonColumns: ["week"], groupColumn: null, codes: ["A", "B", "C"], backward: { kind: "finite", value: 1 }, rowOrder: null, directionalMask: null },
  };

  function App() {
    const [state, setState] = useState(() => createModelStateV3(drafts, "${datasetSha256}"));
    const [raw, setRaw] = useState(() => createOrderPolicyEditorRawStateV3(initialDraft.horizonOrder));
    const [mounted, setMounted] = useState(true);
    const [tie, setTie] = useState(false);
    const [blocked, setBlocked] = useState(false);
    const dispatch = (action) => {
      actions.push(action);
      setState((current) => modelStateReducerV3(current, action));
    };
    const onBlocked = (next) => {
      blockerEvents.push(next);
      setBlocked((current) => current === next ? current : next);
    };
    window.__task27 = {
      actions, blockerEvents, raw, state, blocked,
      setMounted, setTie, dispatch,
      externalOrder(value) { dispatch({ type: "replace-standard-draft", draft: { ...state.drafts.standard, horizonOrder: value } }); },
      setModel(model) { dispatch({ type: "replace-standard-draft", draft: { ...state.drafts.standard, model } }); },
    };
    if (!mounted) return React.createElement("p", { id: "unmounted" }, "Horizons unmounted");
    const context = modelScientificContextV3(state);
    const preview = {
      availability: "available", context, rowCount: ${rows.length},
      units: dictionary.units, horizons: dictionary.horizons, observations,
      resolvedOrder: { availability: "available", unitSequences },
    };
    return React.createElement("div", { "data-blocked": String(blocked) }, React.createElement(OpenEnaHorizonsPanelV3, {
      copy, orderCopy, state, fields: { id: (path) => "browser-field:" + path },
      columnOptions: ["student", "week", "weekOrder", "tieBreak", "A", "B", "C"],
      preview, diagnostics: tie ? [actualTieDiagnostic] : [],
      localizeDiagnostic: (diagnostic) => ({ summary: diagnostic.id, detail: diagnostic.id }),
      orderRawState: raw, onOrderRawStateChange: setRaw, onOrderBlockedChange: onBlocked,
      dispatch, now: () => new Date("2026-09-06T01:02:03.004Z"),
    }));
  }
  createRoot(document.getElementById("root")).render(React.createElement(App));
`;

const bundle = await build({
  stdin: {
    contents: entry,
    loader: "tsx",
    resolveDir: new URL("..", import.meta.url).pathname,
    sourcefile: "task27-horizons-browser-harness.tsx",
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
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.setContent('<main><div id="root"></div></main>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });

  const panel = page.getByTestId("open-ena-model-v3-horizons-panel");
  await panel.waitFor();
  assert.equal(await panel.getByText("2 shared Horizons", { exact: true }).count(), 1);
  assert.equal(await panel.getByText(/\[student:number\(1\)\]/u).count() > 0, true);
  assert.equal(await panel.getByText(/\[student:string\("1"\)\]/u).count() > 0, true);
  assert.equal(await panel.getByText(/\[week:number\(1\)\]/u).count() > 0, true);
  assert.equal(await panel.getByText(/\[week:string\("1"\)\]/u).count() > 0, true);
  assert.equal(await panel.getByText(/__open_ena_(unit|horizon)_v3_/u).count(), 0);

  await panel.getByRole("button", { name: "Add order key" }).click();
  let keyRows = panel.locator(".ena-model-order-v3-key");
  await keyRows.nth(1).locator("select").nth(0).selectOption("tieBreak");
  await keyRows.nth(1).press("Alt+ArrowUp");
  keyRows = panel.locator(".ena-model-order-v3-key");
  assert.equal(await keyRows.nth(0).locator("select").nth(0).inputValue(), "tieBreak");
  assert.deepEqual((await page.evaluate(() => window.__task27.state.drafts.standard.horizonOrder.keys.map((key) => key.column))), ["tieBreak", "weekOrder"]);

  await panel.getByLabel("Use source order").check();
  assert.equal(await page.evaluate(() => window.__task27.state.drafts.standard.horizonOrder), null);
  await panel.getByLabel("Sort by fields").check();
  assert.deepEqual((await page.evaluate(() => window.__task27.state.drafts.standard.horizonOrder.keys.map((key) => key.column))), ["tieBreak", "weekOrder"], "returning to columns immediately republishes retained valid keys");

  keyRows = panel.locator(".ena-model-order-v3-key");
  await keyRows.nth(0).locator("select").nth(2).selectOption("text");
  const localeInput = keyRows.nth(0).getByLabel("Locale");
  await localeInput.fill("en-us");
  await page.waitForFunction(() => window.__task27.blocked === true);
  assert.notEqual(await page.evaluate(() => window.__task27.state.drafts.standard.horizonOrder.keys[0].comparator.locale), "en-us");
  await localeInput.fill("en-US");
  await page.waitForFunction(() => window.__task27.state.drafts.standard.horizonOrder.keys[0].comparator.locale === "en-US" && window.__task27.blocked === false);

  await keyRows.nth(1).locator("select").nth(0).selectOption("tieBreak");
  await page.waitForFunction(() => document.querySelector("#root > div")?.dataset.blocked === "true");
  assert.deepEqual((await page.evaluate(() => window.__task27.state.drafts.standard.horizonOrder.keys.map((key) => key.column))), ["tieBreak", "weekOrder"], "invalid raw text cannot replace the last valid schema value");
  await page.evaluate(() => window.__task27.setMounted(false));
  await page.locator("#unmounted").waitFor();
  assert.equal(await page.evaluate(() => window.__task27.blocked), true, "unmount performs no blocker cleanup");
  await page.evaluate(() => window.__task27.setMounted(true));
  await panel.waitFor();
  keyRows = panel.locator(".ena-model-order-v3-key");
  assert.equal(await keyRows.nth(0).locator("select").nth(0).inputValue(), "tieBreak");
  assert.equal(await keyRows.nth(1).locator("select").nth(0).inputValue(), "tieBreak");

  await page.evaluate(() => window.__task27.setModel("EndPoint"));
  await panel.getByText(/not applicable to End Point/u).waitFor();
  await page.waitForFunction(() => window.__task27.blocked === false);
  assert.deepEqual(await page.evaluate(() => window.__task27.raw.rows.map((row) => row.column)), ["tieBreak", "tieBreak"]);
  await page.evaluate(() => window.__task27.setModel("SeparateTrajectory"));
  await page.waitForFunction(() => window.__task27.blocked === true);
  await page.evaluate(() => window.__task27.dispatch({ type: "set-active-family", family: "ona" }));
  await panel.getByText(/not applicable to ONA End Point/u).waitFor();
  await page.waitForFunction(() => window.__task27.blocked === false);
  assert.deepEqual(await page.evaluate(() => window.__task27.raw.rows.map((row) => row.column)), ["tieBreak", "tieBreak"]);
  await page.evaluate(() => window.__task27.dispatch({ type: "set-active-family", family: "standard" }));
  await page.waitForFunction(() => window.__task27.blocked === true);

  await panel.getByLabel("Use source order").check();
  await panel.getByRole("button", { name: "Review source-order statement" }).click();
  const beforeCancel = await page.evaluate(() => window.__task27.actions.length);
  const sourceDialog = panel.getByRole("dialog", { name: "Review source-order statement" });
  assert.equal(await sourceDialog.evaluate((element) => element.open), true);
  assert.equal(await sourceDialog.locator("button").evaluateAll((buttons) => buttons.includes(document.activeElement)), true);
  await sourceDialog.press("Escape");
  assert.equal(await page.evaluate(() => window.__task27.actions.length), beforeCancel);
  await page.waitForFunction(() => document.activeElement?.textContent === "Review source-order statement");

  await panel.getByRole("button", { name: "Review source-order statement" }).click();
  await page.evaluate(() => window.__task27.externalOrder({ kind: "columns", keys: [{ column: "weekOrder", direction: "descending", comparator: { type: "number" } }] }));
  await panel.getByRole("button", { name: "Accept statement" }).click();
  await panel.getByRole("alert").filter({ hasText: "scientific context changed" }).waitFor();
  assert.equal(await page.evaluate(() => window.__task27.state.drafts.standard.horizonOrder.kind), "columns", "a stale open statement cannot overwrite a newer draft");

  await panel.getByRole("button", { name: "Review source-order statement" }).click();
  await panel.getByRole("button", { name: "Accept statement" }).click();
  await panel.getByText(/Source order explicitly confirmed/u).waitFor();
  const confirmation = await page.evaluate(() => window.__task27.state.drafts.standard.horizonOrder.confirmation);
  assert.deepEqual(Object.keys(confirmation).sort(), ["analysisFamily", "confirmationVersion", "confirmedAt", "datasetSha256", "kind", "relevantColumns", "rowCount"].sort());
  assert.equal(confirmation.analysisFamily, "standard");
  assert.equal(confirmation.datasetSha256, datasetSha256);
  assert.equal(confirmation.rowCount, rows.length);
  assert.deepEqual(confirmation.relevantColumns, ["student", "week"]);
  assert.equal(confirmation.confirmedAt, "2026-09-06T01:02:03.004Z");

  await page.evaluate(() => window.__task27.setTie(true));
  const tieButton = panel.getByRole("button", { name: "Add tie-breaker order key" });
  await tieButton.click();
  assert.equal(await page.evaluate(() => document.activeElement?.id), "browser-field:horizonOrder");
  assert.equal(await panel.locator('[data-diagnostic-id="STANDARD_HORIZON_ORDER_UNRESOLVED_TIE"]').count(), 1);
  assert.equal(await page.evaluate(() => window.__task27.raw.mode), "columns");
  assert.equal(await page.evaluate(() => window.__task27.raw.rows.length > 0), true);
  assert.equal(await page.evaluate(() => window.__task27.state.drafts.standard.horizonOrder), null, "opening explicit tie-breaker editing does not fabricate a scientific key");
  await page.waitForFunction(() => window.__task27.blocked === true);

  await panel.getByRole("button", { name: "Add or remove Horizon identity fields" }).click();
  await panel.getByLabel("weekOrder", { exact: true }).check();
  await page.waitForFunction(() => window.__task27.state.drafts.standard.horizonColumns.join(",") === "week,weekOrder");
  const fieldAction = await page.evaluate(() => window.__task27.actions.at(-1));
  assert.equal(fieldAction.type, "replace-standard-draft");
  assert.deepEqual(fieldAction.draft.horizonColumns, ["week", "weekOrder"]);

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  console.log("Open ENA Models v3 Horizons actual-component browser gate passed.");
} finally {
  await browser.close();
}
