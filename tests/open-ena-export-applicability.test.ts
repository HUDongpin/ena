import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OpenEnaExportApplicabilityNote } from "../components/open-ena/OpenEnaExportApplicabilityNote";
import { OpenEnaResultTablesView } from "../components/open-ena/OpenEnaWorkspace";
import { getOpenEnaCopy, openEnaLocalizedLocales } from "../lib/open-ena-i18n";
import {
  buildOpenEnaResultTableViewModel,
  openEnaResultTableAvailability,
  type OpenEnaResultTableKey,
} from "../lib/open-ena/export";
import {
  OPEN_ENA_EXPORT_BLOCK_REASONS,
  OPEN_ENA_EXPORT_FAMILIES,
  OPEN_ENA_EXPORT_FAMILY_MATRIX,
  OPEN_ENA_EXPORT_HINTS,
  OPEN_ENA_STATS_EXPORT_ACTIONS,
  openEnaExportApplicabilityText,
  openEnaExportDisclosure,
  openEnaExportFamily,
  openEnaResultTableExportAction,
  type OpenEnaExportFamily,
  type OpenEnaExportFamilyStatus,
  type OpenEnaStatsExportAction,
} from "../lib/open-ena/export-applicability";

const EXPECTED_MATRIX: Record<OpenEnaStatsExportAction, Record<OpenEnaExportFamily, OpenEnaExportFamilyStatus>> = {
  "coordinates-csv": { endpoint: "applies", separate: "applies", accumulated: "applies", ona: "applies" },
  "line-weights-csv": { endpoint: "applies", separate: "applies", accumulated: "applies", ona: "applies" },
  "connection-counts-csv": { endpoint: "applies", separate: "applies", accumulated: "applies", ona: "applies" },
  "trajectory-steps-csv": { endpoint: "would-be-empty", separate: "applies", accumulated: "applies", ona: "not-applicable-family" },
  "centroids-csv": { endpoint: "applies", separate: "applies", accumulated: "applies", ona: "applies" },
  "node-positions-csv": { endpoint: "applies", separate: "applies", accumulated: "applies", ona: "applies" },
  "adjacency-key-csv": { endpoint: "applies", separate: "applies", accumulated: "applies", ona: "applies" },
  "ona-aggregate-edges": { endpoint: "not-applicable-family", separate: "not-applicable-family", accumulated: "not-applicable-family", ona: "applies" },
  "ona-deidentified-audit": { endpoint: "not-applicable-family", separate: "not-applicable-family", accumulated: "not-applicable-family", ona: "applies" },
  "native-statistics": { endpoint: "applies", separate: "applies", accumulated: "applies", ona: "not-applicable-family" },
  "bound-data-view": { endpoint: "applies", separate: "applies", accumulated: "applies", ona: "applies" },
  methods: { endpoint: "applies", separate: "applies", accumulated: "applies", ona: "applies" },
  "trajectory-bundle": { endpoint: "not-applicable-family", separate: "applies", accumulated: "applies", ona: "not-applicable-family" },
  "current-analysis": { endpoint: "applies", separate: "applies", accumulated: "applies", ona: "applies" },
  reference: { endpoint: "applies", separate: "bound-reference", accumulated: "bound-reference", ona: "not-applicable-family" },
  "contrast-json": { endpoint: "applies", separate: "not-applicable-family", accumulated: "not-applicable-family", ona: "not-applicable-family" },
  "contrast-edges": { endpoint: "applies", separate: "not-applicable-family", accumulated: "not-applicable-family", ona: "not-applicable-family" },
};

test("export applicability has one family matrix for every Stats export action", () => {
  assert.deepEqual(OPEN_ENA_STATS_EXPORT_ACTIONS, Object.keys(EXPECTED_MATRIX));
  assert.deepEqual(OPEN_ENA_EXPORT_FAMILY_MATRIX, EXPECTED_MATRIX);
  for (const action of OPEN_ENA_STATS_EXPORT_ACTIONS) {
    for (const family of OPEN_ENA_EXPORT_FAMILIES) {
      assert.equal(OPEN_ENA_EXPORT_FAMILY_MATRIX[action][family], EXPECTED_MATRIX[action][family]);
    }
  }
  assert.equal(openEnaExportFamily({ analysisFamily: "ona", modelType: "EndPoint" }), "ona");
  assert.equal(openEnaExportFamily({ analysisFamily: "standard", modelType: "EndPoint" }), "endpoint");
  assert.equal(openEnaExportFamily({ analysisFamily: "standard", modelType: "SeparateTrajectory" }), "separate");
  assert.equal(openEnaExportFamily({ analysisFamily: "standard", modelType: "AccumulatedTrajectory" }), "accumulated");
  assert.equal(openEnaResultTableExportAction("trajectories"), "trajectory-steps-csv");
});

test("disclosure disables inapplicable exports with family, empty, rebuild, projection, and inference reasons", () => {
  const endpointSteps = openEnaExportDisclosure("trajectory-steps-csv", { family: "endpoint", current: true, rowCount: 0 });
  assert.equal(endpointSteps.familyApplies, false);
  assert.equal(endpointSteps.disabled, true);
  assert.equal(endpointSteps.reason, "would-be-empty");

  const onaSteps = openEnaExportDisclosure("trajectory-steps-csv", { family: "ona", current: true });
  assert.equal(onaSteps.reason, "not-applicable-family");
  assert.equal(onaSteps.disabled, true);

  const separateSteps = openEnaExportDisclosure("trajectory-steps-csv", { family: "separate", current: true, rowCount: 4 });
  assert.equal(separateSteps.disabled, false);
  assert.equal(separateSteps.hint, "trajectory");
  assert.equal(separateSteps.reason, null);

  const accumulatedSteps = openEnaExportDisclosure("trajectory-steps-csv", { family: "accumulated", current: true, rowCount: 2 });
  assert.equal(accumulatedSteps.disabled, false);
  assert.equal(accumulatedSteps.hint, "trajectory");

  const staleCoordinates = openEnaExportDisclosure("coordinates-csv", { family: "endpoint", current: false, rowCount: 3 });
  assert.equal(staleCoordinates.familyApplies, true);
  assert.equal(staleCoordinates.disabled, true);
  assert.equal(staleCoordinates.reason, "requires-rebuild");

  const emptyCoordinates = openEnaExportDisclosure("coordinates-csv", { family: "ona", current: true, rowCount: 0 });
  assert.equal(emptyCoordinates.reason, "would-be-empty");
  assert.equal(emptyCoordinates.familyApplies, true);

  const projectedCentroids = openEnaExportDisclosure("centroids-csv", {
    family: "separate",
    current: true,
    projectionReference: true,
    rowCount: 2,
  });
  assert.equal(projectedCentroids.reason, "projection-reference");
  assert.equal(projectedCentroids.disabled, true);

  const onaEdges = openEnaExportDisclosure("ona-aggregate-edges", { family: "endpoint", current: true });
  assert.equal(onaEdges.reason, "not-applicable-family");
  const onaEdgesReady = openEnaExportDisclosure("ona-aggregate-edges", { family: "ona", current: true });
  assert.equal(onaEdgesReady.disabled, false);
  assert.equal(onaEdgesReady.hint, "ona");

  const onaStats = openEnaExportDisclosure("native-statistics", { family: "ona", current: true, inferenceReady: false });
  assert.equal(onaStats.reason, "not-applicable-family");
  const waitingStats = openEnaExportDisclosure("native-statistics", { family: "endpoint", current: true, inferenceReady: false });
  assert.equal(waitingStats.reason, "awaiting-inference");
  assert.equal(waitingStats.familyApplies, true);
  const readyStats = openEnaExportDisclosure("native-statistics", { family: "accumulated", current: true, inferenceReady: true });
  assert.equal(readyStats.disabled, false);
  assert.equal(readyStats.hint, "endpoint-and-trajectory");

  const freshReference = openEnaExportDisclosure("reference", { family: "endpoint", current: true, referenceBound: false });
  assert.equal(freshReference.disabled, false);
  assert.equal(freshReference.hint, "endpoint");
  const unboundTrajectoryReference = openEnaExportDisclosure("reference", { family: "separate", current: true, referenceBound: false });
  assert.equal(unboundTrajectoryReference.reason, "not-applicable-family");
  const boundTrajectoryReference = openEnaExportDisclosure("reference", { family: "accumulated", current: true, referenceBound: true });
  assert.equal(boundTrajectoryReference.disabled, false);
  assert.equal(boundTrajectoryReference.hint, "bound-reference");
  const onaReference = openEnaExportDisclosure("reference", { family: "ona", current: true, referenceBound: true });
  assert.equal(onaReference.reason, "not-applicable-family");

  const methods = openEnaExportDisclosure("methods", { family: "ona", current: false });
  assert.equal(methods.disabled, false);
  assert.equal(methods.hint, "all-families");

  const staleAnalysis = openEnaExportDisclosure("current-analysis", { family: "separate", current: false });
  assert.equal(staleAnalysis.reason, "requires-rebuild");
  const trajectoryContrast = openEnaExportDisclosure("contrast-edges", { family: "separate", current: true });
  assert.equal(trajectoryContrast.reason, "not-applicable-family");
  const endpointContrast = openEnaExportDisclosure("contrast-json", { family: "endpoint", current: true });
  assert.equal(endpointContrast.disabled, false);
  assert.equal(endpointContrast.hint, "endpoint");
});

test("applicability copy exists in every localized workbench locale and disabled export controls render the reason", () => {
  const english = getOpenEnaCopy("en").modelV3.workspace.stats.exportApplicability;
  for (const locale of openEnaLocalizedLocales) {
    const copy = getOpenEnaCopy(locale).modelV3.workspace.stats.exportApplicability;
    for (const reason of OPEN_ENA_EXPORT_BLOCK_REASONS) {
      assert.equal(typeof copy.reasons[reason], "string");
      assert.ok(copy.reasons[reason].trim().length > 0, `${locale} ${reason}`);
    }
    for (const hint of OPEN_ENA_EXPORT_HINTS) {
      assert.ok(copy.hints[hint].trim().length > 0, `${locale} ${hint}`);
    }
    if (locale !== "en") {
      assert.notEqual(copy.reasons["not-applicable-family"], english.reasons["not-applicable-family"]);
      assert.notEqual(copy.reasons["would-be-empty"], english.reasons["would-be-empty"]);
      assert.notEqual(copy.reasons["requires-rebuild"], english.reasons["requires-rebuild"]);
      assert.notEqual(copy.hints.trajectory, english.hints.trajectory);
    }
  }
  assert.notEqual(
    getOpenEnaCopy("zh-hant").modelV3.workspace.stats.exportApplicability.reasons["would-be-empty"],
    getOpenEnaCopy("zh-hans").modelV3.workspace.stats.exportApplicability.reasons["would-be-empty"],
  );
  assert.equal(
    getOpenEnaCopy("es").modelV3.workspace.stats.exportApplicability.reasons["not-applicable-family"],
    english.reasons["not-applicable-family"],
  );

  for (const locale of openEnaLocalizedLocales) {
    const copy = getOpenEnaCopy(locale).modelV3.workspace.stats.exportApplicability;
    const blocked = openEnaExportDisclosure("trajectory-steps-csv", { family: "endpoint", current: true });
    const reason = openEnaExportApplicabilityText(blocked, copy);
    const blockedHtml = renderToStaticMarkup(createElement(OpenEnaExportApplicabilityNote, {
      id: `${locale}-blocked`,
      action: blocked.action,
      text: reason,
      reason: blocked.reason,
      familyApplies: blocked.familyApplies,
    }));
    assert.match(blockedHtml, new RegExp(`id="${locale}-blocked"`));
    assert.match(blockedHtml, /data-export-action="trajectory-steps-csv"/);
    assert.match(blockedHtml, /data-export-applicability-reason="would-be-empty"/);
    assert.match(blockedHtml, /data-export-family-applies="false"/);
    assert.ok(blockedHtml.includes(reason));

    const ready = openEnaExportDisclosure("trajectory-steps-csv", { family: "separate", current: true, rowCount: 2 });
    const hint = openEnaExportApplicabilityText(ready, copy);
    const readyHtml = renderToStaticMarkup(createElement(OpenEnaExportApplicabilityNote, {
      id: `${locale}-ready`,
      action: ready.action,
      text: hint,
      reason: ready.reason,
      familyApplies: ready.familyApplies,
    }));
    assert.match(readyHtml, /data-export-applicability-reason="applicable"/);
    assert.match(readyHtml, /data-export-family-applies="true"/);
    assert.ok(readyHtml.includes(hint));
  }
});

test("result-table export control renders disabled with the family reason and keeps an applicable hint", () => {
  const tables = {
    coordinates: [{ unit: "u1" }],
    lineWeights: [],
    connectionCounts: [],
    trajectories: [],
    centroids: [],
    nodePositions: [],
    adjacencyKey: [],
  } as const;
  const renderExport = (family: OpenEnaExportFamily, key: OpenEnaResultTableKey, current: boolean, projectionReference = false) => {
    const availability = openEnaResultTableAvailability({
      modelType: family === "separate" || family === "accumulated" ? "SeparateTrajectory" : "EndPoint",
      projectionReference,
    });
    const rowCounts = {
      coordinates: tables.coordinates.length,
      lineWeights: 0,
      connectionCounts: 0,
      trajectories: family === "separate" ? 2 : 0,
      centroids: projectionReference ? 0 : 1,
      nodePositions: 1,
      adjacencyKey: 1,
    };
    const model = buildOpenEnaResultTableViewModel({
      selectedKey: key,
      tables,
      rowCounts,
      availability,
      copy: getOpenEnaCopy("en").resultTables,
    });
    const disclosure = openEnaExportDisclosure(openEnaResultTableExportAction(key), {
      family,
      current,
      projectionReference,
      rowCount: rowCounts[key],
    });
    const copy = getOpenEnaCopy("zh-hant").modelV3.workspace.stats.exportApplicability;
    const noted = {
      ...model,
      export: {
        ...model.export,
        disabled: model.export.disabled || disclosure.disabled || !current,
        applicabilityNote: openEnaExportApplicabilityText(disclosure, copy),
        applicabilityNoteId: "export-note",
        applicabilityReason: disclosure.reason,
        applicabilityAction: disclosure.action,
        applicabilityFamilyApplies: disclosure.familyApplies,
      },
    };
    return renderToStaticMarkup(createElement(OpenEnaResultTablesView, {
      model: noted,
      rovingKey: key,
      onRovingKeyChange: () => {},
      onSelect: () => {},
      onExport: () => {},
    }));
  };

  const endpointSteps = renderExport("endpoint", "trajectories", true);
  const endpointButton = endpointSteps.match(/<button[^>]*data-testid="open-ena-result-table-export"[^>]*>/u)?.[0] ?? "";
  assert.match(endpointButton, /\sdisabled(?:=|\s|>)/u);
  assert.match(endpointButton, /aria-describedby="export-note"/u);
  assert.match(endpointSteps, /data-export-action="trajectory-steps-csv"/u);
  assert.match(endpointSteps, /data-export-applicability-reason="would-be-empty"/u);
  assert.ok(endpointSteps.includes("此匯出在此模型族下會是空檔。"));

  const separateSteps = renderExport("separate", "trajectories", true);
  const separateButton = separateSteps.match(/<button[^>]*data-testid="open-ena-result-table-export"[^>]*>/u)?.[0] ?? "";
  assert.doesNotMatch(separateButton, /\sdisabled(?:=|\s|>)/u);
  assert.match(separateSteps, /data-export-applicability-reason="applicable"/u);
  assert.ok(separateSteps.includes("適用於分離軌跡與累積軌跡結果。"));

  const staleCoordinates = renderExport("endpoint", "coordinates", false);
  const staleButton = staleCoordinates.match(/<button[^>]*data-testid="open-ena-result-table-export"[^>]*>/u)?.[0] ?? "";
  assert.match(staleButton, /\sdisabled(?:=|\s|>)/u);
  assert.match(staleCoordinates, /data-export-applicability-reason="requires-rebuild"/u);
  assert.ok(staleCoordinates.includes("需要重新建立目前結果。"));
});

test("workspace export controls read the shared applicability disclosure", () => {
  const workspace = readFileSync("components/open-ena/OpenEnaWorkspace.tsx", "utf8");
  assert.match(workspace, /openEnaExportDisclosure\(/u);
  assert.match(workspace, /openEnaResultTableExportAction\(resultTable\)/u);
  assert.match(workspace, /<OpenEnaExportApplicabilityNote/u);
  assert.match(workspace, /action="native-statistics"/u);
  assert.match(workspace, /exportNativeStatisticsV3\(activeInference, result, currentPlan, controls!\)/u);
  assert.match(workspace, /if \(!current \|\| resultTableViewModel\.export\.disabled\) return;/u);
  const downloadModel = workspace.match(/<button type="button" className="ena-download-model-button ena-compact-toolbar-button"[^>]*>/u)?.[0] ?? "";
  assert.match(downloadModel, /aria-describedby=\{currentAnalysisNote \? currentAnalysisNoteId : undefined\}/u);
  assert.doesNotMatch(downloadModel, /aria-label/u);
});
