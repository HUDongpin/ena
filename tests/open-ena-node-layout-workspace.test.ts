import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import OpenEnaPersistentPlotTools from "../components/open-ena/OpenEnaPersistentPlotTools";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";

const projectRoot = process.cwd();
const noOp = () => undefined;

function source(relativePath: string) {
  return readFileSync(join(projectRoot, relativePath), "utf8");
}

function renderTools(nodeLayoutOverrideCount: number) {
  const copy = getOpenEnaCopy("en");
  return renderToStaticMarkup(createElement(OpenEnaPersistentPlotTools, {
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
    nodeLayoutOverrideCount,
    resetNodeLayoutLabel: copy.plot.resetNodeLayout,
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
    onResetNodeLayout: noOp,
    onReset: noOp,
  }));
}

test("Reset node layout has exact localized copy and remains separate from Reset view", () => {
  const en = getOpenEnaCopy("en").plot;
  const zhHant = getOpenEnaCopy("zh-hant").plot;
  const zhHans = getOpenEnaCopy("zh-hans").plot;

  assert.equal(en.resetNodeLayout, "Reset node layout");
  assert.equal(zhHant.resetNodeLayout, "重設節點配置");
  assert.equal(zhHans.resetNodeLayout, "重置节点布局");
  assert.notEqual(en.resetNodeLayout, en.reset);
  assert.notEqual(zhHant.resetNodeLayout, zhHant.reset);
  assert.notEqual(zhHans.resetNodeLayout, zhHans.reset);
});

test("Reset node layout is disabled without overrides and enabled with one override", () => {
  const disabledMarkup = renderTools(0);
  const enabledMarkup = renderTools(1);

  const disabledButton = disabledMarkup.match(/<button[^>]*data-ena-plot-action="reset-node-layout"[^>]*>/)?.[0] ?? "";
  const enabledButton = enabledMarkup.match(/<button[^>]*data-ena-plot-action="reset-node-layout"[^>]*>/)?.[0] ?? "";
  assert.match(disabledButton, /aria-label="Reset node layout"/);
  assert.match(disabledButton, /disabled=""/);
  assert.match(disabledButton, /data-ena-node-layout-overrides="0"/);
  assert.match(enabledButton, /aria-label="Reset node layout"/);
  assert.doesNotMatch(enabledButton, /disabled=""/);
  assert.match(enabledButton, /data-ena-node-layout-overrides="1"/);
});

test("Workspace owns one fingerprinted layout lifecycle without coupling it to plot recenter", () => {
  const workspace = source("components/open-ena/OpenEnaWorkspace.tsx");

  assert.match(workspace, /createOpenEnaNodeLayoutFingerprint/);
  assert.match(workspace, /createOpenEnaNodeLayoutState/);
  assert.match(workspace, /moveOpenEnaNode/);
  assert.match(workspace, /resetOpenEnaNodeLayout/);
  assert.match(workspace, /const nodeLayoutFingerprint = useMemo/);
  assert.match(workspace, /current\.fingerprint === nodeLayoutFingerprint/);
  assert.match(workspace, /const moveNode = useCallback/);
  assert.match(workspace, /nodeLayoutOverrideCount=\{openEnaNodeLayoutOverrideCount\(activeNodeLayout\)\}/);
  assert.match(workspace, /onResetNodeLayout=\{resetNodeLayout\}/);

  const resetPlot = workspace.match(/function resetPlot\(\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
  assert.ok(resetPlot, "Workspace must retain a dedicated plot-view reset function");
  assert.doesNotMatch(resetPlot, /resetOpenEnaNodeLayout|setNodeLayout/);
});
