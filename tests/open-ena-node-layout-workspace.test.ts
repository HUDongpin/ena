import { workspaceV3Source as v3, controllerV3Source as owner, renderWorkspaceShellV3 as shell, moduleSourceV3 as moduleV3, functionSourceV3 } from "./helpers/open-ena-workspace-v3-ui";
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

test("Reset label positions has exact localized copy and remains separate from Reset view", () => {
  const en = getOpenEnaCopy("en").plot;
  const zhHant = getOpenEnaCopy("zh-hant").plot;
  const zhHans = getOpenEnaCopy("zh-hans").plot;

  assert.equal(en.resetNodeLayout, "Reset label positions");
  assert.equal(zhHant.resetNodeLayout, "重設標籤位置");
  assert.equal(zhHans.resetNodeLayout, "重置标签位置");
  assert.notEqual(en.resetNodeLayout, en.reset);
  assert.notEqual(zhHant.resetNodeLayout, zhHant.reset);
  assert.notEqual(zhHans.resetNodeLayout, zhHans.reset);
});

test("Reset label positions is disabled without overrides and enabled with one override", () => {
  const disabledMarkup = renderTools(0);
  const enabledMarkup = renderTools(1);

  const disabledButton = disabledMarkup.match(/<button[^>]*data-ena-plot-action="reset-node-layout"[^>]*>/)?.[0] ?? "";
  const enabledButton = enabledMarkup.match(/<button[^>]*data-ena-plot-action="reset-node-layout"[^>]*>/)?.[0] ?? "";
  assert.match(disabledButton, /aria-label="Reset label positions"/);
  assert.match(disabledButton, /disabled=""/);
  assert.match(disabledButton, /data-ena-node-layout-overrides="0"/);
  assert.match(enabledButton, /aria-label="Reset label positions"/);
  assert.doesNotMatch(enabledButton, /disabled=""/);
  assert.match(enabledButton, /data-ena-node-layout-overrides="1"/);
});

test("node layout is result-bound and reset independently from camera and plot scales", () => {

  assert.match(v3, /nodeOverrides.hash === resultHash/);
  assert.match(v3, /onResetNodeLayout=\{\(\) => setNodeOverrides/);
  assert.match(v3, /onReset=\{\(\) => \{ setEdgeScale/);
  assert.match(v3, /setCamera\(cameraForPreset\("isometric"\)\)/);
  assert.match(v3, /codeSourceByRenderedCode/);

});
