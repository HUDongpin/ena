import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import { bindResultV3 } from "../lib/open-ena/model-v3/result-binding";
import { presentBoundResultV3, presentRetainedEndpointContrastV3, presentBoundGroupDisplayV3 } from "../lib/open-ena/bound-presentation-v3";
import { DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS } from "../lib/open-ena/group-display";
import { compileOpenEna3dPlotSpec } from "../lib/open-ena/plot3d";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";
import OpenEnaGroupContrast from "../components/open-ena/OpenEnaGroupContrast";
import OpenEnaInteractive3DPlot from "../components/open-ena/OpenEnaInteractive3DPlot";

async function fixture() {
  const f = await bindingFixtureV3(undefined, (_, data) => {
    data.rows.forEach((row, index) => { row.group = index < 2 ? "G" : "H"; });
  });
  const bound = await bindResultV3(f.plan, runStandardPlanV3(f.plan), {
    processedRows: f.plan.rows.length, maximumBufferedRows: 0, numericCellsAllocated: 120,
    peakBytesObservedOrBounded: 10240, observationMethod: "exact-counters-and-conservative-byte-bound",
  }, f.compiled.diagnostics);
  const { result } = presentBoundResultV3(bound);
  const [primary, secondary] = bound.executionProvenance.identityDictionary.groups;
  const contrast = presentRetainedEndpointContrastV3(bound, primary.token, secondary.token, result.dimensions.slice(0, 2))!;
  const keys = (token: string) => bound.executionProvenance.unitGroups.filter(unit => unit.groupToken === token)
    .map(unit => JSON.stringify([token, unit.unitToken]));
  const props = (display: ReturnType<typeof presentBoundGroupDisplayV3>) => ({
    result, contrast: display.contrast, groupDisplay: display, groupColumn: "Group",
    xDimension: result.dimensions[0], yDimension: result.dimensions[1], zDimension: result.dimensions[2],
    camera: "isometric" as const, showPoints: true, showNetworks: true, showLabels: true,
    showUnitLabels: false, showGroupLabels: true, showVariance: true, showTrajectories: false,
    edgeScale: 1, edgeThreshold: 0, pointScale: 1, plotZoom: 1, flipX: false, flipY: false,
    copy: getOpenEnaCopy("en"),
  });
  return { bound, result, contrast, primary, secondary, keys, props };
}

test("empty pairwise display populations omit their network and undefined differences in 2D and 3D", async () => {
  const f = await fixture(), original = JSON.stringify({ bound: f.bound, result: f.result, contrast: f.contrast });
  const baseline = presentBoundGroupDisplayV3(f.contrast, {}, [], false);
  for (const emptyRoles of [["primary"], ["secondary"], ["primary", "secondary"]] as const) {
    const hidden = emptyRoles.flatMap(role => f.keys(f[role].token));
    const display = presentBoundGroupDisplayV3(f.contrast, {}, hidden, false);
    const input = f.props(display);
    for (const role of ["primary", "secondary"] as const) {
      const empty = (emptyRoles as readonly string[]).includes(role);
      assert.equal(display[role].summaryUnitIds.length === 0, empty);
      if (empty) {
        assert.equal(display.contrast[role].unitCount, 0);
        assert.equal(display[role].settings.showMean, false);
        assert.ok(Object.values(display.contrast[role].meanWeights).every(value => value === 0));
      }
      const spec = compileOpenEna3dPlotSpec({ ...input, plotKind: role });
      assert.equal(spec.data.some(trace => trace.meta.role === "network-edge"), !empty);
      const canonical = compileOpenEna3dPlotSpec({ ...f.props(baseline), plotKind: role });
      assert.deepEqual(spec.layout.scene, canonical.layout.scene, "display filtering preserves the fitted coordinate frame");
      const accessible = renderToStaticMarkup(createElement(OpenEnaInteractive3DPlot, { ...input, plotKind: role }));
      assert.equal(accessible.includes(`<th scope="row">${display.contrast[role].name} (n = `), !empty);
    }
    const comparison = compileOpenEna3dPlotSpec({ ...input, plotKind: "comparison" });
    assert.equal(comparison.data.filter(trace => trace.meta.role === "network-edge").length, 0);
    const markup = renderToStaticMarkup(createElement(OpenEnaGroupContrast, input));
    const plots = [...markup.matchAll(/<svg\b[^>]*data-ena-plot-kind="(comparison|primary|secondary)"[^>]*>([\s\S]*?)<\/svg>/gu)];
    assert.equal(plots.length, 3);
    for (const [, role, svg] of plots) {
      const empty = role === "comparison" || (emptyRoles as readonly string[]).includes(role);
      assert.equal(svg.includes("data-ena-edge="), !empty, `${role} network availability`);
    }
    assert.equal(JSON.stringify({ bound: f.bound, result: f.result, contrast: f.contrast }), original);
  }
});

test("Include Hidden restores pairwise summary networks without revealing hidden Unit marks", async () => {
  const f = await fixture(), hidden = f.keys(f.primary.token);
  const canonical = presentBoundGroupDisplayV3(f.contrast, {}, [], false);
  for (const include of [false, true, false, true]) {
    const display = presentBoundGroupDisplayV3(f.contrast, {
      [f.primary.token]: { ...DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS, includeHiddenPoints: include },
    }, hidden, false);
    const comparison = compileOpenEna3dPlotSpec({ ...f.props(display), plotKind: "comparison" });
    assert.equal(display.primary.visibleUnitIds.length, 0);
    assert.equal(display.primary.summaryUnitIds.length, include ? f.contrast.primary.unitCount : 0);
    assert.equal(comparison.data.some(trace => trace.meta.role === "network-edge"), include);
    if (include) {
      assert.deepEqual(display.contrast.primary.meanWeights, canonical.contrast.primary.meanWeights);
      assert.deepEqual(display.contrast.primary.meanPoint, canonical.contrast.primary.meanPoint);
      assert.deepEqual(display.contrast.edges, canonical.contrast.edges);
    }
  }
});

test("3D side accessibility describes the displayed subset rather than the canonical full group", async () => {
  const f = await fixture();
  const display = presentBoundGroupDisplayV3(f.contrast, {}, f.keys(f.primary.token).slice(0, 1), false);
  const markup = renderToStaticMarkup(createElement(OpenEnaInteractive3DPlot, { ...f.props(display), plotKind: "primary" }));
  assert.ok(markup.includes(`<th scope="row">${display.contrast.primary.name} (n = 1)</th>`));
  for (const axis of f.result.dimensions) assert.ok(markup.includes(`<td>${display.contrast.primary.meanPoint[axis]}</td>`));
});
