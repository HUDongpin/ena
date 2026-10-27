import assert from "node:assert/strict";
import test from "node:test";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import { bindResultV3 } from "../lib/open-ena/model-v3/result-binding";
import { presentBoundResultV3 } from "../lib/open-ena/bound-presentation-v3";
import { compileOpenEna3dPlotSpec, type CompileOpenEna3dPlotInput } from "../lib/open-ena/plot3d";
import { createOpenEnaPluginContextV1 } from "../lib/open-ena/plugins/runtime-context";
import { compileOpenEnaTrusted3dPlugin } from "../lib/open-ena/plugins/runtime-registry";

async function fixture(trajectory = true): Promise<CompileOpenEna3dPlotInput> {
  const f = await bindingFixtureV3();
  const bound = await bindResultV3(f.plan, runStandardPlanV3(f.plan), {
    processedRows: f.plan.rows.length, maximumBufferedRows: 0, numericCellsAllocated: 120,
    peakBytesObservedOrBounded: 10240, observationMethod: "exact-counters-and-conservative-byte-bound",
  }, f.compiled.diagnostics);
  let { result } = presentBoundResultV3(bound);
  const [xDimension, yDimension, zDimension] = result.dimensions;
  if (trajectory) {
    const point = Object.fromEntries(result.dimensions.map(dimension => [dimension, 0]));
    result = { ...result, trajectoryPresentation: {
      points: result.set.points.map(row => ({ unitKey: String(row.Unit), unitLabel: String(row.ENA_UNIT), group: String(row.Group), horizon: String(row.Horizon), horizonShortLabel: String(row.Horizon), horizonKey: String(row.Horizon), ordinal: 1, point: row })),
      horizonStyles: [], showDirection: true, showConfidenceIntervals: true, uncertaintyStatus: "pending",
      paths: [], centroidPaths: [], disclosure: "Synthetic display-only collision fixture",
      centroids: ["TP1", "TP2"].map((horizonShortLabel, index) => ({
        key: `centroid-${index}`, group: result.groups[0].name,
        horizon: `Horizon Period = ${horizonShortLabel}`, horizonShortLabel,
        horizonKey: `horizon-${index}`, n: 8, point,
      })),
    } };
  }
  return {
    result, groupColumn: "Group", xDimension, yDimension, zDimension,
    camera: "isometric", showPoints: true, showNetworks: true, showLabels: true,
    showUnitLabels: false, showVariance: true, showTrajectories: true,
    edgeScale: 1, edgeThreshold: 0, pointScale: 1, plotZoom: 1, flipX: false, flipY: false,
  };
}

test("coincident native trajectory centroids use short measured annotations while full identity remains available", async () => {
  const input = await fixture();
  const before = JSON.stringify(input.result);
  const spec = compileOpenEna3dPlotSpec(input);
  const labels = spec.trajectoryLabelAnnotations!.filter(label => label.role === "centroid");
  assert.deepEqual(labels.map(label => label.text), ["TP1", "TP2"]);
  assert.deepEqual(labels.map(label => label.id), ["centroid:centroid-0", "centroid:centroid-1"]);
  for (const label of labels) {
    const annotation = spec.layout.scene.annotations![label.annotationIndex];
    assert.equal(annotation.text, label.text);
    assert.equal(annotation.ax, 0);
    assert.equal(annotation.ay, 0);
    assert.equal(annotation.showarrow, false, "period labels must not have diagonal leader lines");
    assert.equal(annotation.font.size, 8);
    assert.equal(annotation.opacity, 0, "unmeasured labels must not flash on top of each other");
    assert.deepEqual([annotation.x, annotation.y, annotation.z], [0, 0, 0]);
    assert.match(annotation.hovertext, /Horizon Period = TP[12]/);
    assert.match(annotation.hovertext, /n\s*=\s*8/);
  }
  assert.ok(spec.data.filter(trace => trace.meta.role === "group-mean").every(trace => trace.mode === "markers"));
  assert.equal(JSON.stringify(input.result), before);
});

test("trajectory Code and optional Unit labels share annotations and respect display scale and visibility", async () => {
  const input = await fixture();
  const baseline = compileOpenEna3dPlotSpec(input);
  assert.ok(baseline.trajectoryLabelAnnotations!.some(label => label.role === "code"));
  assert.ok(!baseline.trajectoryLabelAnnotations!.some(label => label.role === "unit"));
  const scaled = compileOpenEna3dPlotSpec({ ...input, showUnitLabels: true, textScale: 1.5 });
  assert.ok(scaled.trajectoryLabelAnnotations!.some(label => label.role === "unit"));
  assert.ok(scaled.layout.scene.annotations!.every(annotation => annotation.font.size === (annotation.name.startsWith("unit:") ? 18 : annotation.name.startsWith("centroid:") ? 12 : 15)));
  assert.ok(scaled.data.filter(trace => trace.meta.role === "unit-points").every(trace => trace.mode === "markers"));
  const withoutCodes = compileOpenEna3dPlotSpec({ ...input, showLabels: false });
  assert.ok(!withoutCodes.trajectoryLabelAnnotations!.some(label => label.role === "code"));
  assert.equal(withoutCodes.trajectoryLabelAnnotations!.filter(label => label.role === "centroid").length, 2);
});

test("manual Code positions remain separate from scientific annotation anchors and native scene bounds", async () => {
  const input = await fixture();
  const before = compileOpenEna3dPlotSpec(input);
  const code = String(input.result.set.rotation.nodes![0].code);
  const after = compileOpenEna3dPlotSpec({ ...input, nodeLayout: new Map([[code, new Map([[input.xDimension, 0.25], [input.yDimension, -0.5], [input.zDimension, 0.75]])]]) });
  const label = after.trajectoryLabelAnnotations!.find(candidate => candidate.code === code)!;
  const annotation = after.layout.scene.annotations![label.annotationIndex];
  const original = before.layout.scene.annotations![label.annotationIndex];
  assert.deepEqual([annotation.x, annotation.y, annotation.z], [original.x, original.y, original.z]);
  assert.deepEqual(label.preferredPosition, { x: 0.25, y: -0.5, z: 0.75 });
  assert.deepEqual(after.data.filter(trace => trace.meta.role !== "code-label"), before.data.filter(trace => trace.meta.role !== "code-label"));
  assert.deepEqual(after.layout.scene, before.layout.scene, "manual text movement must not affect Plotly annotation-derived dataScale or clipping");
});

test("endpoint plots keep their existing rendering contract", async () => {
  const spec = compileOpenEna3dPlotSpec(await fixture(false));
  assert.equal(spec.trajectoryLabelAnnotations, undefined);
  assert.equal(spec.layout.scene.annotations, undefined);
  assert.ok(spec.data.some(trace => trace.meta.role === "code-label" && trace.mode === "text"));
});

test("native trajectory Code dots are smaller while their identities and hover labels remain intact", async () => {
  const input = await fixture();
  const node = compileOpenEna3dPlotSpec({ ...input, showLabels: false }).data.find(trace => trace.meta.role === "code-node")!;
  assert.equal(node.marker?.size, 5.5);
  assert.equal(node.mode, "markers");
  assert.equal(node.ids?.length, input.result.set.rotation.nodes!.length);
  assert.equal(node.customdata?.length, node.ids?.length);
  assert.ok(node.customdata?.every(text => text?.includes("Code:")));
  assert.equal(node.hovertemplate, "%{customdata}<extra></extra>");
  const endpoint = compileOpenEna3dPlotSpec(await fixture(false)).data.find(trace => trace.meta.role === "code-node")!;
  assert.equal(endpoint.marker?.size, 9, "endpoint dots retain their existing size");
});

test("the trusted plugin's sanitized snapshot retains native trajectory label identities and short text", async () => {
  const input = await fixture();
  const before = JSON.stringify(input.result);
  const context = createOpenEnaPluginContextV1({ result: input.result, selectedDimensions: [input.xDimension, input.yDimension, input.zDimension], stale: false });
  const direct = compileOpenEna3dPlotSpec(input);
  const throughPlugin = compileOpenEnaTrusted3dPlugin("ena-hk/3d-ena", context, input, []);
  assert.deepEqual(throughPlugin.trajectoryLabelAnnotations, direct.trajectoryLabelAnnotations);
  assert.deepEqual(throughPlugin.layout.scene.annotations, direct.layout.scene.annotations);
  assert.equal(JSON.stringify(input.result), before);
});
