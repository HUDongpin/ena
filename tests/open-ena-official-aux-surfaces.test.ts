import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import OpenEnaDataView from "../components/open-ena/OpenEnaDataView";
import OpenEnaPersistentPlotTools from "../components/open-ena/OpenEnaPersistentPlotTools";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";

const projectRoot = process.cwd();

function source(relativePath: string) {
  return readFileSync(join(projectRoot, relativePath), "utf8");
}

const noOp = () => undefined;

test("persistent Plot Tools expose every controlled visual setting with accessible state", () => {
  const markup = renderToStaticMarkup(createElement(OpenEnaPersistentPlotTools, {
    edgeScale: 1.4,
    edgeThreshold: 0.25,
    pointScale: 0.8,
    showLabels: true,
    showGroupLabels: true,
    showUnitLabels: false,
    showPoints: true,
    unitCircle: false,
    flipX: true,
    flipY: false,
    plotZoom: 1.2,
    onEdgeScaleChange: noOp,
    onEdgeThresholdChange: noOp,
    onPointScaleChange: noOp,
    onShowLabelsChange: noOp,
    onShowGroupLabelsChange: noOp,
    onShowUnitLabelsChange: noOp,
    onShowPointsChange: noOp,
    onUnitCircleChange: noOp,
    onFlipXChange: noOp,
    onFlipYChange: noOp,
    onPlotZoomChange: noOp,
    onReset: noOp,
    settingsOpen: false,
    onSettingsOpenChange: noOp,
  }));

  assert.match(markup, /data-testid="open-ena-persistent-plot-tools"/);
  assert.match(markup, /aria-label="Plot Tools"/);
  for (const accessibleName of [
    "Plot Settings",
    "Edge Weights",
    "Reset Edge Weights",
    "Text Size",
    "Reset Text Size",
    "Code labels",
    "Unit circle",
    "Axis direction",
  ]) {
    assert.match(markup, new RegExp(`aria-label="${accessibleName}`));
  }
  assert.match(markup, /aria-label="Plot Settings"[^>]*aria-expanded="false"/);
  assert.match(markup, /data-ena-plot-tool="edge-scale"[\s\S]*?type="range"[^>]*min="0\.1"[^>]*max="4"[^>]*step="0\.1"[\s\S]*?type="number"[^>]*min="0\.1"[^>]*max="4"/);
  assert.match(markup, /data-ena-plot-tool="text-size"[\s\S]*?type="range"[^>]*min="9"[^>]*max="21"[^>]*step="1"[\s\S]*?type="number"[^>]*min="9"[^>]*max="21"/);
  assert.match(markup, /data-ena-plot-tool="text-size"[\s\S]*?type="range"[^>]*aria-label="Text Size"/);
  assert.match(markup, /aria-valuetext="13 pixels"/);
  assert.match(markup, /data-ena-plot-tool="code-labels"[\s\S]*?role="switch"[^>]*aria-label="Code labels"[^>]*aria-checked="true"/);
  assert.match(markup, /data-ena-plot-tool="unit-circle"[\s\S]*?role="switch"[^>]*aria-label="Unit circle"[^>]*aria-checked="false"/);
  assert.doesNotMatch(
    markup.match(/data-ena-plot-tool="unit-circle"[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? "",
    /onShowPointsChange|Unit points/,
    "the official Unit circle control must not masquerade as analytic-unit visibility",
  );
  assert.match(markup, />Flip X-Axis<\/button>/);
  assert.match(markup, /aria-pressed="true"[\s\S]*?>Flip X-Axis/);
  assert.match(markup, /aria-pressed="false"[\s\S]*?>Flip Y-Axis/);

  const frequent = markup.match(/data-ena-plot-tools-surface="frequent"[\s\S]*?<\/div>/)?.[0] ?? "";
  assert.doesNotMatch(frequent, /Minimum edge weight|Scale unit circles|Unit labels|Plot zoom/);
});

test("official Plot Settings sheet contains the less-frequent jENA controls without duplicating the frequent surface", () => {
  const markup = renderToStaticMarkup(createElement(OpenEnaPersistentPlotTools, {
    edgeScale: 1,
    edgeThreshold: 0.25,
    pointScale: 0.8,
    textScale: 1,
    showLabels: true,
    showGroupLabels: true,
    showUnitLabels: false,
    showPoints: true,
    unitCircle: false,
    flipX: false,
    flipY: false,
    plotZoom: 1.2,
    onEdgeScaleChange: noOp,
    onEdgeThresholdChange: noOp,
    onPointScaleChange: noOp,
    onTextScaleChange: noOp,
    onShowLabelsChange: noOp,
    onShowGroupLabelsChange: noOp,
    onShowUnitLabelsChange: noOp,
    onShowPointsChange: noOp,
    onUnitCircleChange: noOp,
    onFlipXChange: noOp,
    onFlipYChange: noOp,
    onPlotZoomChange: noOp,
    onReset: noOp,
    settingsOpen: true,
    onSettingsOpenChange: noOp,
  }));

  assert.match(markup, /role="dialog"[^>]*aria-label="Plot Settings"/);
  assert.match(markup, /aria-label="Close Plot Settings"/);
  for (const accessibleName of [
    "Minimum edge weight",
    "Scale unit circles",
    "Group labels",
    "Unit points",
    "Unit labels",
    "Plot zoom",
    "Reset all plot tools",
  ]) {
    assert.match(markup, new RegExp(`aria-label="${accessibleName}`));
  }
});

test("ordered Plot Tools retain meaningful presentation controls and remove ENA-only affordances", () => {
  const markup = renderToStaticMarkup(createElement(OpenEnaPersistentPlotTools, {
    analysisKind: "ona",
    title: "Tune the directed ONA view",
    edgeScale: 1,
    edgeThreshold: 0,
    pointScale: 1,
    textScale: 1,
    showLabels: true,
    showGroupLabels: true,
    showUnitLabels: false,
    showPoints: true,
    unitCircle: false,
    flipX: false,
    flipY: false,
    plotZoom: 1,
    onEdgeScaleChange: noOp,
    onEdgeThresholdChange: noOp,
    onPointScaleChange: noOp,
    onTextScaleChange: noOp,
    onShowLabelsChange: noOp,
    onShowGroupLabelsChange: noOp,
    onShowUnitLabelsChange: noOp,
    onShowPointsChange: noOp,
    onUnitCircleChange: noOp,
    onFlipXChange: noOp,
    onFlipYChange: noOp,
    onPlotZoomChange: noOp,
    onReset: noOp,
    settingsOpen: true,
    onSettingsOpenChange: noOp,
  }));

  assert.match(markup, /data-analysis-kind="ona"/);
  assert.match(markup, /aria-label="Tune the directed ONA view"/);
  assert.match(markup, /data-ena-plot-tool="unit-points"/);
  assert.match(markup, /data-ena-plot-tool="unit-labels"/);
  assert.doesNotMatch(markup, /data-ena-plot-tool="unit-circle"/);
  assert.doesNotMatch(markup, /data-ena-plot-tool="group-labels"/);
});

test("ordered Plot Tools consume complete Traditional and Simplified Chinese visible and accessible copy", () => {
  for (const locale of ["zh-hant", "zh-hans"] as const) {
    const onaCopy = getOpenEnaCopy(locale).ona;
    const markup = renderToStaticMarkup(createElement(OpenEnaPersistentPlotTools, {
      analysisKind: "ona",
      title: onaCopy.presenter.title,
      copy: onaCopy.plotTools,
      edgeScale: 1.4,
      edgeThreshold: 0.25,
      pointScale: 0.8,
      textScale: 1,
      showLabels: true,
      showGroupLabels: true,
      showUnitLabels: false,
      showPoints: true,
      unitCircle: false,
      flipX: true,
      flipY: false,
      plotZoom: 1.2,
      onEdgeScaleChange: noOp,
      onEdgeThresholdChange: noOp,
      onPointScaleChange: noOp,
      onTextScaleChange: noOp,
      onShowLabelsChange: noOp,
      onShowGroupLabelsChange: noOp,
      onShowUnitLabelsChange: noOp,
      onShowPointsChange: noOp,
      onUnitCircleChange: noOp,
      onFlipXChange: noOp,
      onFlipYChange: noOp,
      onPlotZoomChange: noOp,
      onReset: noOp,
      settingsOpen: true,
      onSettingsOpenChange: noOp,
    }));

    for (const localizedText of [
      onaCopy.plotTools.plotSettings,
      onaCopy.plotTools.scaleEdgeWeights,
      onaCopy.plotTools.textSize,
      onaCopy.plotTools.codeLabels,
      onaCopy.plotTools.axisDirection,
      onaCopy.plotTools.flipXAxis,
      onaCopy.plotTools.flipYAxis,
      onaCopy.plotTools.networkGraph,
      onaCopy.plotTools.minimumEdgeWeight,
      onaCopy.plotTools.plottedPoints,
      onaCopy.plotTools.unitPoints,
      onaCopy.plotTools.scaleUnitCircles,
      onaCopy.plotTools.unitLabels,
      onaCopy.plotTools.advanced,
      onaCopy.plotTools.plotZoom,
      onaCopy.plotTools.fit,
      onaCopy.plotTools.resetAll,
      onaCopy.plotTools.on,
      onaCopy.plotTools.off,
    ]) {
      assert.ok(markup.includes(localizedText), `${locale} Plot Tools must render ${localizedText}`);
    }

    for (const localizedAccessibleName of [
      onaCopy.plotTools.edgeWeights,
      onaCopy.plotTools.edgeWeightsValue,
      onaCopy.plotTools.resetEdgeWeights,
      onaCopy.plotTools.textSizeControl,
      onaCopy.plotTools.textSizeValue,
      onaCopy.plotTools.resetTextSize,
      onaCopy.plotTools.closePlotSettings,
      onaCopy.plotTools.zoomOut,
      onaCopy.plotTools.zoomIn,
      onaCopy.plotTools.resetAllPlotTools,
      onaCopy.plotTools.settingLabel(onaCopy.plotTools.codeLabels),
      onaCopy.plotTools.enableLabel(onaCopy.plotTools.codeLabels),
      onaCopy.plotTools.disableLabel(onaCopy.plotTools.codeLabels),
      onaCopy.plotTools.timesValue("1.4"),
      onaCopy.plotTools.pixelsValue(13),
      onaCopy.plotTools.minimumEdgeWeightValue(25),
      onaCopy.plotTools.fitPlotValue("1.2"),
    ]) {
      assert.ok(markup.includes(localizedAccessibleName), `${locale} Plot Tools must expose ${localizedAccessibleName}`);
    }
    for (const localizedTitle of [
      onaCopy.plotTools.plotSettings,
      onaCopy.plotTools.resetEdgeWeights,
      onaCopy.plotTools.resetTextSize,
      onaCopy.plotTools.close,
    ]) {
      assert.ok(markup.includes(`title="${localizedTitle}"`), `${locale} Plot Tools must expose title ${localizedTitle}`);
    }

    for (const englishLeak of [
      "Plot Settings",
      "Scale edge weights",
      "Text size",
      "Code labels",
      "Axis direction",
      "Flip X-Axis",
      "Flip Y-Axis",
      "Network Graph",
      "Minimum edge weight",
      "Plotted Points",
      "Unit points",
      "Scale unit circles",
      "Unit labels",
      "Advanced",
      "Plot zoom",
      "Zoom out",
      "Zoom in",
      "Reset all",
      'title="Reset Edge Weights"',
      'title="Reset Text Size"',
      'title="Close"',
      "Enable ",
      "Disable ",
      ">On<",
      ">Off<",
      " times",
      " pixels",
      " percent of the strongest edge",
      "current zoom",
    ]) {
      assert.ok(!markup.includes(englishLeak), `${locale} Plot Tools must not leak ${englishLeak}`);
    }
  }
});

test("ONA workspace routes locale copy for directed-space chrome and plot tools", () => {
  const workspace = source("components/open-ena/OpenEnaWorkspace.tsx");

  assert.match(workspace, /copy=\{completedResultKind === "ona" \? copy\.ona\.plotTools : undefined\}/);
  for (const key of [
    "directedSpace",
    "twoD",
    "downloadBundle",
    "staleTitle",
    "staleDescription",
    "rebuilding",
    "cancel",
    "statsKicker",
  ]) {
    assert.match(workspace, new RegExp(`copy\\.ona\\.workspace\\.${key}`));
  }
  assert.match(workspace, /copy\.ona\.unavailable\.inference/);
  assert.match(workspace, /copy\.ona\.unavailable\.groupContrast/);
  assert.match(workspace, /copy\.ona\.dataView\.missingDatasetBinding/);
  assert.match(workspace, /copy\.ona\.unavailable\.reference/);

  for (const englishLiteral of [
    "p² directed space",
    "2D ONA",
    "Download ONA bundle",
    "The directed ONA view remains bound to the last successful ordered model. Rebuild to apply the pending controls.",
    "Rebuilding ordered network with jENA",
    "ONA · descriptive",
    "ONA is descriptive-only in this release; inferential tests are not available.",
    "ONA group networks are descriptive means; pairwise subtraction is unavailable.",
    "ONA Data View requires the analyzed dataset SHA-256 binding.",
    "Reference rotation is unavailable for ONA. Return to the Standard ENA family before importing a reference.",
  ]) {
    assert.ok(!workspace.includes(englishLiteral), `ONA Workspace must not hard-code ${englishLiteral}`);
  }

  const enCopy = getOpenEnaCopy("en").ona.workspace;
  const zhHantCopy = getOpenEnaCopy("zh-hant").ona.workspace;
  const zhHansCopy = getOpenEnaCopy("zh-hans").ona.workspace;
  assert.equal(enCopy.twoD, "2D ONA");
  assert.equal(zhHantCopy.twoD, "2D ONA");
  assert.equal(zhHansCopy.twoD, "2D ONA");
  assert.notEqual(zhHantCopy.directedSpace, enCopy.directedSpace);
  assert.notEqual(zhHansCopy.directedSpace, enCopy.directedSpace);
  assert.notEqual(zhHantCopy.downloadBundle, enCopy.downloadBundle);
  assert.notEqual(zhHansCopy.downloadBundle, enCopy.downloadBundle);
  assert.notEqual(zhHantCopy.statsKicker, enCopy.statsKicker);
  assert.notEqual(zhHansCopy.statsKicker, enCopy.statsKicker);
});

test("persistent Plot Tools source wires controlled values exclusively through callbacks", () => {
  const component = source("components/open-ena/OpenEnaPersistentPlotTools.tsx");

  for (const callback of [
    "onEdgeScaleChange",
    "onEdgeThresholdChange",
    "onPointScaleChange",
    "onShowLabelsChange",
    "onShowUnitLabelsChange",
    "onShowPointsChange",
    "onUnitCircleChange",
    "onFlipXChange",
    "onFlipYChange",
    "onPlotZoomChange",
    "onReset",
    "onSettingsOpenChange",
  ]) {
    assert.match(component, new RegExp(`${callback}\\s*[:(]`), `${callback} must be part of the public controlled API`);
  }
  assert.doesNotMatch(component, /\buseState\b/, "the component stays stateless");
});

test("Data View owns a contained center table while preserving plot context controls", () => {
  const markup = renderToStaticMarkup(createElement(OpenEnaDataView, {
    columns: [
      { key: "goal", label: "Goal", kind: "code", align: "right" },
      { key: "unit", label: "Unit", kind: "metadata" },
      { key: "conversation", label: "Conversation", kind: "metadata" },
      { key: "evidence", label: "Evidence", kind: "code", align: "right" },
    ],
    rows: [
      { id: "record-a", values: { unit: "A", conversation: "baseline", goal: 2, evidence: 1 } },
      { id: "record-b", values: { unit: "B", conversation: "scaffolded", goal: 0, evidence: 3 } },
    ],
    context: "comparison",
    onContextChange: noOp,
    onReturnToComparison: noOp,
    onExportCsv: noOp,
  }));

  assert.match(markup, /data-testid="open-ena-data-view"/);
  assert.match(markup, /aria-label="Data View center surface"/);
  assert.match(markup, /background-color:#212121;color:#ffffff/);
  assert.match(markup, /aria-label="Return to Comparison Plot"[^>]*>Return to Comparison<\/button>/);
  assert.match(markup, /<select[^>]*aria-label="Show units in"[^>]*>/);
  assert.match(markup, /<option value="comparison" selected="">Comparison<\/option>/);
  assert.match(markup, /<output aria-live="polite">2 Data View records<\/output>/);
  assert.match(markup, /aria-label="Export Data View records as CSV"/);
  assert.match(markup, /data-testid="open-ena-data-view-scroll" style="max-height:min\(64vh, 680px\);overflow:auto;overscroll-behavior:contain"/);
  assert.match(markup, /<table[^>]*aria-label="Data View records"/);
  assert.match(markup, /<th scope="colgroup" colSpan="2">Metadata<\/th><th scope="colgroup" colSpan="2">Codes<\/th>/);
  assert.ok(markup.indexOf(">Unit</th>") < markup.indexOf(">Goal</th>"), "metadata columns are presented before code columns");
  assert.match(markup, /<th scope="row"[^>]*>A<\/th>/);
  assert.match(markup, /data-record-id="record-b"/);
});

test("Data View paginates both rows and variable columns within a bounded DOM surface", () => {
  const columns = [
    { key: "unit", label: "Unit", kind: "metadata" as const },
    ...Array.from({ length: 70 }, (_, index) => ({
      key: `edge:${index}`,
      label: `Edge ${index}`,
      kind: "directed-edge" as const,
    })),
  ];
  const rows = Array.from({ length: 250 }, (_, rowIndex) => ({
    id: `record-${rowIndex}`,
    values: Object.fromEntries([
      ["unit", `u${rowIndex}`],
      ...Array.from({ length: 70 }, (__, columnIndex) => [`edge:${columnIndex}`, rowIndex + columnIndex]),
    ]),
  }));
  const markup = renderToStaticMarkup(createElement(OpenEnaDataView, {
    columns,
    rows,
    context: "comparison",
    onContextChange: noOp,
    onReturnToComparison: noOp,
    onExportCsv: noOp,
  }));

  assert.match(markup, /data-testid="open-ena-data-view-pagination"/);
  assert.match(markup, /data-total-rows="250"/);
  assert.match(markup, /data-visible-rows="100"/);
  assert.match(markup, /data-total-variable-columns="70"/);
  assert.match(markup, /data-visible-variable-columns="32"/);
  assert.equal((markup.match(/data-record-id=/g) ?? []).length, 100);
  assert.equal((markup.match(/data-view-variable-column=/g) ?? []).length, 32);
});

test("Data View describes supplied rows conservatively and has a semantic empty state", () => {
  const markup = renderToStaticMarkup(createElement(OpenEnaDataView, {
    columns: [{ key: "unit", label: "Unit", kind: "metadata" }],
    rows: [],
    context: "primary",
    onContextChange: noOp,
    onReturnToComparison: noOp,
    onExportCsv: noOp,
  }));
  const component = source("components/open-ena/OpenEnaDataView.tsx");

  assert.match(markup, /0 Data View records/);
  assert.match(markup, /<button[^>]*disabled=""[^>]*aria-label="Export Data View records as CSV"/);
  assert.match(markup, /<p role="status">No Data View records match this context\.<\/p>/);
  assert.doesNotMatch(component, /\braw(?:-|\s)+(?:data|row|record)s?\b/i);
  assert.doesNotMatch(component, /\bsource rows?\b/i);
});
