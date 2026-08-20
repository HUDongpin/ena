import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import OpenEnaDataView from "../components/open-ena/OpenEnaDataView";
import OpenEnaPersistentPlotTools from "../components/open-ena/OpenEnaPersistentPlotTools";

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
  assert.match(markup, /data-ena-plot-tool="text-size"[\s\S]*?type="range"[^>]*min="8"[^>]*max="20"[^>]*step="1"[\s\S]*?type="number"[^>]*min="8"[^>]*max="20"/);
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
  assert.match(markup, /<select[^>]*aria-label="Show units in plot context"[^>]*>/);
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
