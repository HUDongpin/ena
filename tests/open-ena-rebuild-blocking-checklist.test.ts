import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OpenEnaModelTabsV3, type OpenEnaModelScientificSummaryV3 } from "../components/open-ena/model-v3/OpenEnaModelTabsV3";
import { modelFieldIdV3, type ModelUiDiagnosticV3 } from "../components/open-ena/model-v3/OpenEnaModelDiagnosticsV3";
import { modelRebuildBlockingChecklistV3 } from "../components/open-ena/model-v3/OpenEnaRebuildBlockingChecklistV3";
import type { ModelScientificContextV3 } from "../components/open-ena/model-v3/model-state";
import { validateStandardDraftV3 } from "../lib/open-ena/model-v3/diagnostics";
import type { StandardEnaDraftV3 } from "../lib/open-ena/model-v3/types";
import type { ParsedDataset } from "../lib/open-ena/types";
import { getOpenEnaCopy, openEnaLocalizedLocales } from "../lib/open-ena-i18n";

const projectRoot = process.cwd();

function source(relativePath: string) {
  return readFileSync(join(projectRoot, relativePath), "utf8");
}

const scientificContext: ModelScientificContextV3 = Object.freeze({
  datasetSha256: "a".repeat(64),
  family: "standard",
  scientificRevision: 4,
  draftFingerprint: "model-draft-json-v3:{}",
  executionEpoch: 2,
});

const scientificSummary: OpenEnaModelScientificSummaryV3 = {
  context: scientificContext,
  configuration: {
    family: "standard",
    model: "EndPoint",
    window: "MovingStanzaWindow",
    weighting: "binary",
    rotation: "svd",
  },
  counts: {
    units: { availability: "available", value: 1 },
    horizons: { availability: "available", value: 1 },
    groups: { availability: "unavailable" },
    codes: { availability: "available", value: 3 },
  },
};

function gate(partial: Pick<ModelUiDiagnosticV3, "id" | "scope" | "blocks"> & Partial<ModelUiDiagnosticV3>): ModelUiDiagnosticV3 {
  return {
    severity: "error",
    summary: "compiler text must not render",
    detail: "compiler detail must not render",
    ...partial,
  };
}

test("blocking checklist orders owning controls and omits gates that do not block Rebuild", () => {
  const means: ModelUiDiagnosticV3 = gate({
    id: "STANDARD_MEANS_LEVEL_REQUIRED",
    scope: "rotation",
    fieldPath: "rotation",
    blocks: ["build-model"],
  });
  const items = modelRebuildBlockingChecklistV3({
    family: "standard",
    diagnostics: [
      gate({ id: "STANDARD_GROUP_UNSTABLE_WITHIN_UNIT", severity: "warning", scope: "units", fieldPath: "group.Cohort", blocks: ["group-inference"] }),
      gate({ id: "STANDARD_HORIZONS_REQUIRED", scope: "horizons", fieldPath: "horizonColumns", blocks: ["build-model"] }),
      gate({ id: "STANDARD_CODE_VALUE_INVALID", scope: "codes", fieldPath: "codes.A", blocks: ["build-model"] }),
      gate({ id: "STANDARD_UNITS_REQUIRED", scope: "units", fieldPath: "unitColumns", blocks: ["build-model"] }),
      gate({ id: "STANDARD_DATASET_BINDING_INVALID", scope: "dataset", blocks: ["build-model"] }),
      means,
    ],
    rawBlockers: { backward: true, forward: false, rowOrder: true, horizonOrder: false },
  });
  assert.deepEqual(items.map((item) => item.predicateId), [
    "STANDARD_UNITS_REQUIRED:unitColumns",
    "STANDARD_MEANS_LEVEL_REQUIRED:rotation",
    "STANDARD_HORIZONS_REQUIRED:horizonColumns",
    "raw-backward",
    "raw-row-order",
    "STANDARD_CODE_VALUE_INVALID:codes.A",
    "STANDARD_DATASET_BINDING_INVALID:global",
  ]);
  assert.equal(items.some((item) => item.kind === "diagnostic" && item.diagnostic.id === "STANDARD_GROUP_UNSTABLE_WITHIN_UNIT"), false);
  const meansItem = items.find((item) => item.predicateId === "STANDARD_MEANS_LEVEL_REQUIRED:rotation");
  assert.equal(meansItem?.target?.tab, "units");
  assert.equal(meansItem?.target?.fieldPath, "rotation.meansContrast");
  const rowOrder = items.find((item) => item.predicateId === "raw-row-order");
  assert.equal(rowOrder?.target?.fieldId, modelFieldIdV3("windows", "movingStanza.rowOrder"));
  assert.equal(means.blocks.includes("build-model"), true);
});

test("a diagnostic that already owns a raw field is not listed twice", () => {
  const items = modelRebuildBlockingChecklistV3({
    family: "ona",
    diagnostics: [
      gate({ id: "ONA_ORDER_INVALID", scope: "windows", fieldPath: "rowOrder", blocks: ["build-model"] }),
    ],
    rawBlockers: { backward: false, forward: false, rowOrder: true, horizonOrder: false },
  });
  assert.deepEqual(items.map((item) => item.predicateId), ["ONA_ORDER_INVALID:rowOrder"]);
  assert.equal(items[0]?.target?.fieldId, modelFieldIdV3("windows", "rowOrder"));
});

test("an admitted model with no build-model gate has an empty checklist", () => {
  const dataset: ParsedDataset = {
    name: "ready.csv",
    headers: ["unit", "horizon", "A", "B", "C"],
    rows: [
      { unit: "u1", horizon: "h1", A: 1, B: 1, C: 0 },
      { unit: "u1", horizon: "h1", A: 0, B: 0, C: 1 },
      { unit: "u2", horizon: "h2", A: 0, B: 1, C: 1 },
    ],
    sizeBytes: 1,
    source: "upload",
  };
  const draft: StandardEnaDraftV3 = {
    unitColumns: ["unit"],
    horizonColumns: ["horizon"],
    groupColumn: null,
    codes: ["A", "B", "C"],
    weighting: "binary",
    model: "EndPoint",
    windowType: "Conversation",
    movingStanza: { backward: { kind: "finite", value: 1 }, forward: { kind: "finite", value: 0 }, rowOrder: null },
    horizonOrder: null,
    rotation: { type: "svd", centerAlignToOrigin: true },
  };
  const diagnostics = validateStandardDraftV3(dataset, {
    hashKind: "normalized-utf8-csv-text-sha256",
    normalizedTableSha256: "a".repeat(64),
    rowCount: dataset.rows.length,
    headerSha256: "c".repeat(64),
  }, draft);
  assert.equal(diagnostics.some((entry) => entry.blocks.includes("build-model")), false);
  assert.deepEqual(modelRebuildBlockingChecklistV3({
    family: "standard",
    diagnostics,
    rawBlockers: { backward: false, forward: false, rowOrder: false, horizonOrder: false },
  }), []);
});

test("weighting-domain and unresolved row-order gates stay scientific and become navigable checklist items", () => {
  const dataset: ParsedDataset = {
    name: "blocked-admit.csv",
    headers: ["unit", "horizon", "turn", "A", "B", "C"],
    rows: [
      { unit: "u", horizon: "h", turn: 1, A: 2, B: 1, C: 0 },
      { unit: "u", horizon: "h", turn: 1, A: 0, B: 0, C: 1 },
    ],
    sizeBytes: 1,
    source: "upload",
  };
  const draft: StandardEnaDraftV3 = {
    unitColumns: ["unit"],
    horizonColumns: ["horizon"],
    groupColumn: null,
    codes: ["A", "B", "C"],
    weighting: "binary",
    model: "EndPoint",
    windowType: "MovingStanzaWindow",
    movingStanza: {
      backward: { kind: "finite", value: 1 },
      forward: { kind: "finite", value: 0 },
      rowOrder: { kind: "columns", keys: [{ column: "turn", direction: "ascending", comparator: { type: "number" } }] },
    },
    horizonOrder: null,
    rotation: { type: "svd", centerAlignToOrigin: true },
  };
  const diagnostics = validateStandardDraftV3(dataset, {
    hashKind: "normalized-utf8-csv-text-sha256",
    normalizedTableSha256: "a".repeat(64),
    rowCount: dataset.rows.length,
    headerSha256: "c".repeat(64),
  }, draft);
  const weighting = diagnostics.find((entry) => entry.id === "STANDARD_CODE_VALUE_INVALID");
  const rowOrder = diagnostics.find((entry) => entry.id === "STANDARD_ROW_ORDER_INVALID" || entry.id === "STANDARD_ROW_ORDER_REQUIRED");
  assert.ok(weighting);
  assert.ok(rowOrder);
  assert.equal(weighting.blocks.includes("build-model"), true);
  assert.equal(rowOrder.blocks.includes("build-model"), true);
  const items = modelRebuildBlockingChecklistV3({ family: "standard", diagnostics });
  const predicates = items.map((item) => item.predicateId);
  const rowAt = predicates.indexOf(`${rowOrder.id}:${rowOrder.fieldPath ?? "global"}`);
  const codeAt = predicates.indexOf(`${weighting.id}:${weighting.fieldPath ?? "global"}`);
  assert.ok(rowAt >= 0 && codeAt > rowAt, predicates.join(","));
  assert.equal(items[rowAt]?.target?.fieldId, modelFieldIdV3("windows", "movingStanza.rowOrder"));
  assert.equal(items[codeAt]?.target?.fieldId, modelFieldIdV3("codes", "codes.A"));
  assert.equal(items.every((item) => item.kind === "raw" || item.diagnostic.blocks.includes("build-model")), true);
});

test("blocked Model tabs render an ordered checklist and a ready model omits it", () => {
  const copy = getOpenEnaCopy("en").modelV3.tabs;
  const blocked = renderToStaticMarkup(createElement(OpenEnaModelTabsV3, {
    copy,
    diagnostics: [
      gate({ id: "STANDARD_GROUP_UNSTABLE_WITHIN_UNIT", severity: "warning", scope: "units", fieldPath: "group.Cohort", blocks: ["group-inference"] }),
      gate({ id: "STANDARD_CODE_VALUE_INVALID", scope: "codes", fieldPath: "codes.A", blocks: ["build-model"] }),
      gate({ id: "STANDARD_ROW_ORDER_INVALID", scope: "windows", fieldPath: "movingStanza.rowOrder", blocks: ["build-model"] }),
      gate({ id: "STANDARD_DATASET_BINDING_INVALID", scope: "dataset", blocks: ["build-model"] }),
    ],
    rawBlockers: { backward: true, forward: false, rowOrder: true, horizonOrder: true },
    scientificContext,
    scientificSummary,
    status: { configurationReadiness: "incomplete", editorBlocked: true, runStatus: "idle", resultStatus: "stale" },
    renderPanel: () => null,
    onSuggestedAction: () => undefined,
    actions: createElement("button", { "data-testid": "run-marker" }, "Run"),
  }));
  const checklistAt = blocked.indexOf('data-testid="open-ena-rebuild-blocking-checklist"');
  const runAt = blocked.indexOf("run-marker");
  const diagnosticsAt = blocked.indexOf("ena-model-diagnostics");
  assert.ok(checklistAt > 0 && checklistAt < runAt && runAt < diagnosticsAt);
  const checklist = blocked.slice(checklistAt, runAt);
  assert.match(checklist, /<ol>/u);
  assert.deepEqual([...checklist.matchAll(/data-unmet-predicate="([^"]+)"/gu)].map((match) => match[1]), [
    "raw-horizon-order",
    "raw-backward",
    "STANDARD_ROW_ORDER_INVALID:movingStanza.rowOrder",
    "STANDARD_CODE_VALUE_INVALID:codes.A",
    "STANDARD_DATASET_BINDING_INVALID:global",
  ]);
  assert.match(checklist, new RegExp(`href="#${modelFieldIdV3("windows", "movingStanza.backward")}"`, "u"));
  assert.match(checklist, new RegExp(`href="#${modelFieldIdV3("horizons", "horizonOrder")}"`, "u"));
  assert.match(checklist, new RegExp(`href="#${modelFieldIdV3("codes", "codes.A")}"`, "u"));
  assert.match(checklist, /data-unmet-predicate="STANDARD_DATASET_BINDING_INVALID:global">Dataset binding is invalid<\/li>/u);
  assert.doesNotMatch(checklist, /STANDARD_GROUP_UNSTABLE_WITHIN_UNIT|compiler text must not render|Historical geometry|Source replaced/u);
  assert.match(checklist, /Code values violate the selected weighting domain/u);
  assert.match(checklist, /The row order cannot be resolved/u);
  assert.match(checklist, /Resolve the Horizon order\./u);
  assert.doesNotMatch(checklist, /data-unmet-predicate="raw-row-order"/u);

  const ready = renderToStaticMarkup(createElement(OpenEnaModelTabsV3, {
    copy,
    diagnostics: [
      gate({ id: "STANDARD_GROUP_UNSTABLE_WITHIN_UNIT", severity: "warning", scope: "units", fieldPath: "group.Cohort", blocks: ["group-inference"] }),
    ],
    rawBlockers: { backward: false, forward: false, rowOrder: false, horizonOrder: false },
    scientificContext,
    scientificSummary,
    status: { configurationReadiness: "ready", editorBlocked: false, runStatus: "idle", resultStatus: "current" },
    renderPanel: () => null,
    onSuggestedAction: () => undefined,
  }));
  assert.doesNotMatch(ready, /open-ena-rebuild-blocking-checklist/u);
  assert.match(ready, /ena-model-diagnostics/u);
});

test("checklist copy is localized and stays outside historical-geometry messaging", () => {
  const english = getOpenEnaCopy("en").modelV3.tabs.blockingChecklist;
  const traditional = getOpenEnaCopy("zh-hant").modelV3.tabs.blockingChecklist;
  const simplified = getOpenEnaCopy("zh-hans").modelV3.tabs.blockingChecklist;
  assert.equal(english.title, "Unmet prerequisites");
  assert.match(english.description, /Rebuild and Run stay blocked/u);
  assert.doesNotMatch(`${english.title} ${english.description}`, /Historical geometry|Source replaced/u);
  assert.equal(traditional.title, "未滿足的前置條件");
  assert.equal(simplified.title, "未满足的前置条件");
  assert.equal(traditional.raw.rowOrder, "請處理資料列順序。");
  assert.equal(simplified.raw.horizonOrder, "请处理视域顺序。");
  assert.equal(traditional.raw.backward, "請完成向後情境範圍。");
  assert.equal(simplified.raw.forward, "请完成向前上下文范围。");
  for (const locale of openEnaLocalizedLocales) {
    const checklist = getOpenEnaCopy(locale).modelV3.tabs.blockingChecklist;
    assert.equal(JSON.stringify(checklist).includes("undefined"), false, locale);
  }
  assert.notEqual(traditional.description, english.description);
  assert.notEqual(simplified.description, english.description);

  const workspace = source("components/open-ena/OpenEnaWorkspace.tsx");
  const checklistSource = source("components/open-ena/model-v3/OpenEnaRebuildBlockingChecklistV3.tsx");
  const calloutAt = workspace.indexOf("ena-stale-rebuild-callout");
  const callout = workspace.slice(calloutAt, workspace.indexOf("</div>", calloutAt));
  assert.ok(calloutAt > 0);
  assert.match(callout, /sourceReplacementNotice/u);
  assert.doesNotMatch(callout, /rebuild-blocking-checklist|blockingChecklist|historicalGeometry/u);
  assert.match(workspace, /modelState\.resultStatus === "stale" \? workspaceCopy\.result\.historicalGeometry : workspaceCopy\.result\.boundGeometry/u);
  assert.match(workspace, /if \(controller\.canRun\) \{\s*controller\.run\(\);/u);
  assert.match(workspace, /focusRebuildBlockingChecklist/u);
  assert.doesNotMatch(checklistSource, /historicalGeometry|sourceReplacementNotice|Historical geometry/u);
});
