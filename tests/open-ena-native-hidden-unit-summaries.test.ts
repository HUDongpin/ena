import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import { bindResultV3 } from "../lib/open-ena/model-v3/result-binding";
import { presentBoundResultV3 } from "../lib/open-ena/bound-presentation-v3";
import { DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS } from "../lib/open-ena/group-display";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";
import OpenEnaPlot from "../components/open-ena/OpenEnaPlot";
import OpenEnaInteractive3DPlot from "../components/open-ena/OpenEnaInteractive3DPlot";
import { compileOpenEna3dPlotSpec } from "../lib/open-ena/plot3d";

async function fixture(twoGroups = false) {
  const f = await bindingFixtureV3(undefined, (_draft, data) => {
    data.rows.forEach((row, index) => { row.group = twoGroups && index > 1 ? "H" : "G"; });
  });
  const bound = await bindResultV3(f.plan, runStandardPlanV3(f.plan), {
    processedRows: f.plan.rows.length, maximumBufferedRows: 0, numericCellsAllocated: 120,
    peakBytesObservedOrBounded: 10240, observationMethod: "exact-counters-and-conservative-byte-bound",
  }, f.compiled.diagnostics);
  const { result } = presentBoundResultV3(bound);
  const group = result.groups[0];
  const hiddenUnit = String(result.set.points[0].ENA_UNIT);
  const axes = result.dimensions;
  assert.equal(axes.length, 3);
  const props = (includeHiddenPoints: boolean) => ({
    result: { ...result, groupPresentation: {
      allSuppressed: false, hiddenUnits: new Set([hiddenUnit]),
      settingsByName: { [group.name]: { ...DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS, includeHiddenPoints } },
    } },
    groupColumn: "Group", view: "2d" as const, xDimension: axes[0], yDimension: axes[1], zDimension: axes[2],
    camera: "isometric" as const, showPoints: true, showNetworks: true, showLabels: true,
    showUnitLabels: false, showVariance: true, showTrajectories: false,
    edgeScale: 1, edgeThreshold: 0, pointScale: 1, plotZoom: 1, flipX: false, flipY: false, copy: getOpenEnaCopy("en"),
  });
  const average = (rows: typeof result.set.points, key: string, include: boolean) => {
    const selected = rows.filter(row => include || String(row.ENA_UNIT) !== hiddenUnit);
    return selected.reduce((sum, row) => sum + Number(row[key]), 0) / selected.length;
  };
  return { bound, result, group, axes, props, average };
}

test("single-group 3D summary follows hidden-Unit inclusion without changing fitted results or frame", async () => {
  const { bound, result, axes, props, average } = await fixture();
  const original = JSON.stringify({ bound, result });
  const included = compileOpenEna3dPlotSpec(props(true));
  const excluded = compileOpenEna3dPlotSpec(props(false));
  for (const [include, spec] of [[true, included], [false, excluded]] as const) {
    const mean = spec.data.find(trace => trace.meta.role === "group-mean")!;
    [mean.x[0], mean.y[0], mean.z[0]].forEach((value, index) => {
      assert.ok(Math.abs(Number(value) - average(result.set.points, axes[index], include)) < 1e-12, `axis ${index}, include=${include}`);
    });
    for (const edge of spec.data.filter(trace => trace.meta.role === "network-edge")) {
      assert.ok(Math.abs(Number(edge.meta.edgeValue) - average(result.set.lineWeights, String(edge.meta.edgeName), include)) < 1e-12);
    }
    assert.equal(spec.data.filter(trace => trace.meta.role === "unit-points").reduce((sum, trace) => sum + trace.x.length, 0), 4);
  }
  assert.deepEqual(excluded.layout.scene, included.layout.scene);
  assert.equal(JSON.stringify({ bound, result }), original);
});

test("single-group 2D centroid, network and accessible summary follow hidden-Unit inclusion", async () => {
  const { bound, result, group, axes, props, average } = await fixture();
  const original = JSON.stringify({ bound, result });
  const frame = [...result.set.rotation.nodes ?? [], ...result.set.points, ...result.groups.map(g => g.meanPoint)];
  const scale = Math.min(776 / (2 * Math.max(...frame.map(row => Math.abs(Number(row[axes[0]]))))),
    474 / (2 * Math.max(...frame.map(row => Math.abs(Number(row[axes[1]]))))));
  for (const include of [true, false]) {
    const svg = renderToStaticMarkup(createElement(OpenEnaPlot, props(include)));
    const centroid = svg.match(/transform="translate\(([^ ]+) ([^)]+)\)" role="img" aria-label="[^"]* mean: square centroid marker"/u);
    assert.ok(centroid);
    assert.ok(Math.abs(Number(centroid[1]) - (460 + scale * average(result.set.points, axes[0], include))) < 1e-9);
    assert.ok(Math.abs(Number(centroid[2]) - (295 - scale * average(result.set.points, axes[1], include))) < 1e-9);
    assert.ok(svg.includes(`${group.name} (n = ${include ? 5 : 4})</th><td>${average(result.set.points, axes[0], include).toFixed(3)}</td><td>${average(result.set.points, axes[1], include).toFixed(3)}</td>`));
    for (const edge of result.set.adjacencyKey) {
      assert.ok(svg.includes(`mean weight ${average(result.set.lineWeights, edge.name, include).toFixed(3)}. Solid network edge.`));
    }
    assert.equal((svg.match(/data-ena-unit-point="true"/gu) ?? []).length, 4);
  }
  assert.equal(JSON.stringify({ bound, result }), original);
});

test("generic 3D accessible summary describes the displayed hidden-Unit summary population", async () => {
  const { bound, result, group, axes, props, average } = await fixture();
  const original = JSON.stringify({ bound, result });
  for (const include of [true, false]) {
    const markup = renderToStaticMarkup(createElement(OpenEnaInteractive3DPlot, props(include)));
    const row = markup.match(/<th scope="row">([^<]+)<\/th><td>([^<]+)<\/td><td>([^<]+)<\/td><td>([^<]+)<\/td>/u);
    assert.ok(row);
    assert.equal(row[1], `${group.name} (n = ${include ? 5 : 4})`);
    axes.forEach((axis, index) => {
      assert.equal(Number(row[index + 2]), average(result.set.points, axis, include));
    });
  }
  assert.equal(JSON.stringify({ bound, result }), original);
});

test("hiding every endpoint Unit omits empty 2D/3D summaries unless hidden Units are included", async () => {
  const { bound, result, props } = await fixture();
  const original = JSON.stringify({ bound, result });
  const canonicalScene = compileOpenEna3dPlotSpec(props(true)).layout.scene;
  for (const include of [false, true]) {
    const input = props(include);
    input.result.groupPresentation.hiddenUnits = new Set(result.set.points.map(row => String(row.ENA_UNIT)));
    const spec = compileOpenEna3dPlotSpec(input);
    assert.equal(spec.data.filter(trace => trace.meta.role === "unit-points").length, 0);
    assert.equal(spec.data.filter(trace => trace.meta.role === "group-mean").length, include ? 1 : 0);
    assert.equal(spec.data.filter(trace => trace.meta.role === "network-edge").length > 0, include);
    assert.deepEqual(spec.layout.scene, canonicalScene);
    const svg = renderToStaticMarkup(createElement(OpenEnaPlot, input));
    assert.equal((svg.match(/data-ena-centroid-shape="square"/gu) ?? []).length, include ? 1 : 0);
    for (const markup of [svg, renderToStaticMarkup(createElement(OpenEnaInteractive3DPlot, input))]) {
      assert.equal(markup.split(`<th scope="row">${result.groups[0].name} (n = `).length - 1, include ? 1 : 0);
      assert.doesNotMatch(markup, /\(n = 0\)<\/th><td>0/u);
    }
  }
  assert.equal(JSON.stringify({ bound, result }), original);
});

test("generic two-group rendering requires both displayed populations for difference edges", async () => {
  const { result, props } = await fixture(true);
  const input = props(false);
  const emptyGroup = result.groups[0].name;
  input.result.groupPresentation.hiddenUnits = new Set(result.set.points
    .filter(row => row.Group === emptyGroup).map(row => String(row.ENA_UNIT)));
  const spec = compileOpenEna3dPlotSpec(input);
  assert.equal(spec.data.filter(trace => trace.meta.role === "network-edge").length, 0);
  assert.equal(spec.data.filter(trace => trace.meta.role === "group-mean").length, 1);
  assert.equal(spec.data.find(trace => trace.meta.role === "group-mean")?.meta.groupName, result.groups[1].name);
  const svg = renderToStaticMarkup(createElement(OpenEnaPlot, input));
  assert.equal((svg.match(/data-ena-edge=/gu) ?? []).length, 0);
  assert.equal((svg.match(/data-ena-centroid-shape="square"/gu) ?? []).length, 1);
});
