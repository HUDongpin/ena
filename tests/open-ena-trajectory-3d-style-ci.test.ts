import assert from "node:assert/strict";
import test from "node:test";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import { bindResultV3 } from "../lib/open-ena/model-v3/result-binding";
import { presentBoundResultV3 } from "../lib/open-ena/bound-presentation-v3";
import { compileOpenEna3dPlotSpec, type CompileOpenEna3dPlotInput } from "../lib/open-ena/plot3d";
import { DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS } from "../lib/open-ena/group-display";

async function fixture(): Promise<CompileOpenEna3dPlotInput> {
  const f = await bindingFixtureV3();
  const bound = await bindResultV3(f.plan, runStandardPlanV3(f.plan), {
    processedRows: f.plan.rows.length, maximumBufferedRows: 0, numericCellsAllocated: 120,
    peakBytesObservedOrBounded: 10240, observationMethod: "exact-counters-and-conservative-byte-bound",
  }, f.compiled.diagnostics);
  const { result } = presentBoundResultV3(bound);
  const [xDimension, yDimension, zDimension] = result.dimensions;
  const group = result.groups[0].name;
  const intervals = Object.fromEntries(result.dimensions.map((dimension, index) => [dimension, {
    status: "estimable" as const, lower: -10 - index, upper: 20 + index, sampleSize: 8, finiteReplicates: 500,
  }]));
  const centroids = ["T1", "T2"].map((label, index) => ({
    key: `centroid-${index}`, group, horizon: `Horizon = ${label}`, horizonShortLabel: label,
    horizonKey: `horizon-${index}`, n: 8,
    point: Object.fromEntries(result.dimensions.map((dimension, axis) => [dimension, index * [3, 4, 0][axis]])),
    intervals,
  }));
  return {
    result: { ...result, groups: result.groups.map((entry, index) => ({ ...entry, color: index === 0 ? "#CC2277" : entry.color })),
      trajectoryPresentation: Object.assign({
        points: result.set.points.map((row, index) => ({ unitKey: String(row.Unit), unitLabel: String(row.ENA_UNIT), group: String(row.Group),
          horizon: String(row.Horizon), horizonShortLabel: String(row.Horizon), horizonKey: `horizon-${index % 2}`, ordinal: index + 1, point: row })),
        paths: [], centroids, centroidPaths: [{ from: centroids[0], to: centroids[1], sharedContributorCount: 8 }],
        disclosure: "Synthetic display fixture",
      }, { horizonStyles: [
        { horizonKey: "horizon-0", label: "T1", detail: "Horizon = T1", color: "#22A884" },
        { horizonKey: "horizon-1", label: "T2", detail: "Horizon = T2", color: "#FDE725" },
      ], showDirection: true, showConfidenceIntervals: true, uncertaintyStatus: "ready" as const }),
    },
    groupColumn: "Group", xDimension, yDimension, zDimension,
    camera: "isometric", showPoints: true, showNetworks: true, showLabels: false,
    showUnitLabels: false, showVariance: true, showTrajectories: true,
    edgeScale: 1, edgeThreshold: 0, pointScale: 1, plotZoom: 1, flipX: false, flipY: false,
  };
}

test("3D trajectories encode period fill and Group outlines without changing fitted coordinates", async () => {
  const input = await fixture(), before = JSON.stringify(input.result);
  const spec = compileOpenEna3dPlotSpec(input);
  const centroids = spec.data.filter(trace => trace.meta.role === "group-mean");
  assert.deepEqual(centroids.map(trace => trace.marker?.color), ["#22A884", "#FDE725"]);
  assert.ok(centroids.every(trace => trace.marker?.symbol === "square" && trace.marker.line?.color === "#CC2277"));
  const path = spec.data.find(trace => trace.meta.role === "trajectory-path")!;
  assert.deepEqual(path.line, { color: "black", width: 3 });
  const units = spec.data.filter(trace => trace.meta.role === "unit-points");
  assert.ok(units.every(trace => trace.marker?.symbol === "circle" && trace.marker.opacity === 0.88 && trace.marker.line?.color === "#ffffff"));
  assert.ok(units.every(trace => Array.isArray(trace.marker?.color) && trace.marker.color.every(color => ["#22A884", "#FDE725"].includes(color))));
  const code = spec.data.find(trace => trace.meta.role === "code-node")!;
  assert.equal(code.marker?.symbol, "circle-open");
  assert.equal(code.marker?.size, 5.5);
  assert.equal(spec.layout.scene.zaxis.color, "#008B00");
  assert.equal(JSON.stringify(input.result), before);
});

test("3D direction cones sit at 62 percent with normalized vectors and optional visibility", async () => {
  const input = await fixture();
  const cone = compileOpenEna3dPlotSpec(input).data.find(trace => trace.meta.role === "direction-arrow")!;
  assert.ok([cone.x[0], cone.y[0], cone.z[0]].every((value, index) => Math.abs(value! - [1.86, 2.48, 0][index]) < 1e-12));
  assert.deepEqual([cone.u?.[0], cone.v?.[0], cone.w?.[0]], [0.6, 0.8, 0]);
  assert.equal(cone.anchor, "center");
  assert.equal(cone.sizeref, 0.13);
  assert.deepEqual(cone.colorscale, [[0, "black"], [1, "black"]]);
  Object.assign(input.result.trajectoryPresentation!, { showDirection: false });
  assert.ok(!compileOpenEna3dPlotSpec(input).data.some(trace => trace.meta.role === "direction-arrow"));
  assert.equal(compileOpenEna3dPlotSpec(input).data.find(trace => trace.meta.role === "trajectory-path")?.line?.color, "black", "turning arrows off keeps main paths black");
  Object.assign(input.result.trajectoryPresentation!, { showDirection: true });
  const path = input.result.trajectoryPresentation!.centroidPaths[0];
  Object.assign(path, { to: path.from });
  assert.ok(!compileOpenEna3dPlotSpec(input).data.some(trace => trace.meta.role === "direction-arrow"));
});

test("3D CI renders 12 unfilled dashed edges per centroid beneath points and fits all interval endpoints", async () => {
  const input = await fixture(), before = JSON.stringify(input.result);
  const spec = compileOpenEna3dPlotSpec(input);
  const boxes = spec.data.filter(trace => trace.meta.role === "confidence-interval");
  assert.equal(boxes.reduce((edges, trace) => edges + trace.x.length - 1, 0), 24);
  assert.ok(boxes.every(trace => trace.type === "scatter3d" && trace.mode === "lines" && trace.line?.dash === "dot" && trace.line.color === "#CC2277"));
  assert.ok(boxes.every(trace => trace.hovertemplate?.includes("customdata") && trace.customdata?.some(text => text?.includes("bootstrap"))));
  const lastBox = Math.max(...boxes.map(trace => spec.data.indexOf(trace)));
  assert.ok(spec.data.findIndex(trace => trace.meta.role === "unit-points") > lastBox);
  assert.ok(spec.data.findIndex(trace => trace.meta.role === "group-mean") > lastBox);
  assert.ok(spec.data.findIndex(trace => trace.meta.role === "direction-arrow") > lastBox);
  for (const [index, axis] of (["x", "y", "z"] as const).entries()) {
    assert.equal(Math.min(...boxes.flatMap(trace => trace[axis] as number[])), -10 - index);
    assert.equal(Math.max(...boxes.flatMap(trace => trace[axis] as number[])), 20 + index);
    assert.ok(spec.layout.scene[`${axis}axis`].range[1] > 20 + index);
  }
  const flipped = compileOpenEna3dPlotSpec({ ...input, flipX: true, flipY: true });
  assert.deepEqual(flipped.data, spec.data, "axis reversal must preserve all fitted points and CI bounds");
  assert.deepEqual(flipped.layout.scene.xaxis.range, [...spec.layout.scene.xaxis.range].reverse());
  assert.deepEqual(flipped.layout.scene.yaxis.range, [...spec.layout.scene.yaxis.range].reverse());
  assert.ok(spec.trajectoryLabelAnnotations?.every(label => label.description.includes("bootstrap")));
  assert.equal(JSON.stringify(input.result), before);
});

test("3D CI omits unavailable axes and disabled intervals while allowing an honest degenerate wireframe", async () => {
  const input = await fixture();
  Object.assign(input.result.trajectoryPresentation!, { showConfidenceIntervals: false });
  assert.ok(!compileOpenEna3dPlotSpec(input).data.some(trace => trace.meta.role === "confidence-interval"));
  Object.assign(input.result.trajectoryPresentation!, { showConfidenceIntervals: true });
  const intervals = (input.result.trajectoryPresentation!.centroids[0] as unknown as { intervals: Record<string, unknown> }).intervals;
  intervals[input.xDimension] = { status: "not-estimable", reason: "fewer-than-two-units", sampleSize: 1, finiteReplicates: 0 };
  assert.ok(!compileOpenEna3dPlotSpec(input).data.some(trace => trace.meta.role === "confidence-interval"));
  intervals[input.xDimension] = { status: "degenerate", lower: 0, upper: 0, sampleSize: 8, finiteReplicates: 500 };
  const boxes = compileOpenEna3dPlotSpec(input).data.filter(trace => trace.meta.role === "confidence-interval");
  assert.ok(boxes.length > 0);
  assert.ok(boxes.every(trace => trace.x.every(value => value === 0)));
});

test("3D per-Group CI visibility gates both wireframes and expanded axis extents", async () => {
  const input = await fixture();
  const settingsByName = Object.fromEntries(input.result.groups.map(group => [group.name, { ...DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS, showConfidenceIntervals: false }]));
  input.result = { ...input.result, groupPresentation: { allSuppressed: false, settingsByName, hiddenUnits: new Set() } };
  const hidden = compileOpenEna3dPlotSpec(input);
  assert.ok(!hidden.data.some(trace => trace.meta.role === "confidence-interval"));
  assert.ok(hidden.data.some(trace => trace.meta.role === "group-mean"));
  input.result.trajectoryPresentation!.showConfidenceIntervals = false;
  const off = compileOpenEna3dPlotSpec(input);
  assert.deepEqual(hidden.layout.scene.xaxis.range, off.layout.scene.xaxis.range);
  assert.deepEqual(hidden.layout.scene.yaxis.range, off.layout.scene.yaxis.range);
  assert.deepEqual(hidden.layout.scene.zaxis.range, off.layout.scene.zaxis.range);
  input.result.trajectoryPresentation!.showConfidenceIntervals = true;
  settingsByName[input.result.groups[0].name].showConfidenceIntervals = true;
  assert.ok(compileOpenEna3dPlotSpec(input).data.some(trace => trace.meta.role === "confidence-interval"));
  input.result = { ...input.result, groupPresentation: { ...input.result.groupPresentation!, allSuppressed: true } };
  assert.ok(!compileOpenEna3dPlotSpec(input).data.some(trace => ["confidence-interval", "group-mean", "trajectory-path", "direction-arrow", "unit-points"].includes(trace.meta.role)));
});
