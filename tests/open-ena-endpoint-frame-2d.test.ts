import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import { bindResultV3 } from "../lib/open-ena/model-v3/result-binding";
import { prepareEndpointMeansFrame2DV3, supportsEndpointMeansFrame2D, applyEndpointMeansFrame2D, endpointMeansFrameReceipt2D } from "../lib/open-ena/endpoint-means-frame-2d-v3";
import { presentRetainedEndpointContrastV3 } from "../lib/open-ena/bound-presentation-v3";
import { computeEndpointMeansFrame2D } from "../lib/open-ena/endpoint-means-frame-2d-compute";
import { instantiateEndpointLapack2D } from "../lib/open-ena/endpoint-means-frame-2d-kernel";

const assets = () => Promise.all(["blas", "lapack"].map(name => readFile(new URL(`../public/open-ena-2d-lapack/${name}.wasm`, import.meta.url))));
async function fixture(hash = "a".repeat(64), means = true) {
  const f = await bindingFixtureV3(hash, draft => {
    draft.codes = ["C", "A", "B"];
    if (means) draft.rotation = { type: "means", centerAlignToOrigin: true, negativeLevel: { type: "string", value: "Control" }, positiveLevel: { type: "string", value: "Treatment" } };
  });
  const result = await bindResultV3(f.plan, runStandardPlanV3(f.plan), {
    processedRows: f.plan.rows.length, maximumBufferedRows: 0, numericCellsAllocated: 120, peakBytesObservedOrBounded: 10240,
    observationMethod: "exact-counters-and-conservative-byte-bound",
  }, f.compiled.diagnostics);
  return { ...f, result };
}

test("2D Means direction replay matches 120 independent signed R oracles, including row and code permutations", async () => {
  const api = await import("../lib/open-ena/endpoint-means-frame-2d-kernel").catch(() => null);
  assert.equal(typeof api?.instantiateEndpointLapack2D, "function");
  assert.equal(typeof api?.replayEndpointMeansDirections2D, "function");
  const data = JSON.parse(await readFile(new URL("./fixtures/open-ena-means-directions-r.json", import.meta.url), "utf8"));
  const [blas, lapack] = await Promise.all(["blas", "lapack"].map(name => readFile(new URL(`../public/open-ena-2d-lapack/${name}.wasm`, import.meta.url))));
  const runtime = await api!.instantiateEndpointLapack2D(blas, lapack);
  for (const item of data.cases) {
    const actual = api!.replayEndpointMeansDirections2D(item.points, item.groups, runtime);
    const error = Math.max(...actual.flatMap((row: number[], i: number) => row.map((value, j) => Math.abs(value - item.expected[i][j]))));
    assert.ok(error < 1e-8, `${item.id}: signed error ${error}; post-hoc sign alignment is forbidden`);
  }
});

test("frame replay restores original row/code order, retains other groups, and never mutates science", async () => {
  const { plan, result } = await fixture();
  const before = JSON.stringify(result);
  const input = await prepareEndpointMeansFrame2DV3(result, plan);
  assert.deepEqual(input.contrastGroups, [-1, 1, -1, 1, 0]);
  const [blas, lapack] = await assets();
  const frame = computeEndpointMeansFrame2D(input, await instantiateEndpointLapack2D(blas, lapack));
  assert.ok(frame.pointScaleFactor > 0 && frame.maxPosition > 0);
  assert.equal(frame.frameAxes, 3);
  assert.equal(JSON.stringify(result), before);
  const groups = result.executionProvenance.identityDictionary.groups;
  const base = presentRetainedEndpointContrastV3(result, groups.find(g => g.fields[0].value.value === "Control")!.token, groups.find(g => g.fields[0].value.value === "Treatment")!.token, result.set.rotation.rotationColumns.slice(0, 2))!;
  const extended = structuredClone(base);
  const interval = Object.values(extended.primary.meanConfidenceIntervalsByDimension!)[0];
  if (interval.status !== "estimable") throw new Error("Expected an estimable interval");
  interval.upper = 100;
  const displayed = applyEndpointMeansFrame2D(extended, frame);
  const receipt = endpointMeansFrameReceipt2D(displayed, frame);
  assert.equal(receipt.baseReplayFrame?.maxPosition, frame.maxPosition);
  assert.equal(receipt.displayFrame?.maxPosition, displayed.officialPlotFrame?.maxPosition);
  assert.ok(receipt.displayFrame!.maxPosition > frame.maxPosition);
  const codeMap = new Map(result.executionProvenance.labels.codes.map(c => [c.column, c.sourceColumn]));
  const expectedEdges = [["C", "A"], ["C", "B"], ["A", "B"]].map(pair => result.set.adjacencyKey.find(edge => [codeMap.get(edge.source), codeMap.get(edge.target)].sort().join() === [...pair].sort().join())!.name);
  const firstUnit = result.executionProvenance.identityDictionary.units.find(unit => unit.fields[0].value.value === "u1")!.displayLabel;
  const firstRow = result.set.pointsForProjection.find(row => row.ENA_UNIT === firstUnit)!;
  assert.deepEqual(input.points[0], expectedEdges.map(edge => firstRow[edge]));
  const mismatched = structuredClone(input); mismatched.fittedBasis[0][0] += 0.1;
  assert.throws(() => computeEndpointMeansFrame2D(mismatched, { rightSvd: x => Array.from({ length: x[0].length }, (_, i) => Array.from({ length: x[0].length }, (_, j) => i === j ? 1 : 0)) }), /aligned/);
});

test("2D frame preparation rejects stale and non-Means plans", async () => {
  const f = await fixture(), other = await fixture("b".repeat(64)), svd = await fixture("c".repeat(64), false);
  await assert.rejects(() => prepareEndpointMeansFrame2DV3(f.result, other.plan), /stale/i);
  assert.equal(supportsEndpointMeansFrame2D(svd.result), false);
  await assert.rejects(() => prepareEndpointMeansFrame2DV3(svd.result, svd.plan), /Means/);
});

test("pinned LAPACK rejects modified assets and unsafe inputs, then can run again", async () => {
  const [blas, lapack] = await assets();
  const altered = new Uint8Array(blas); altered[altered.length - 1] ^= 1;
  await assert.rejects(() => instantiateEndpointLapack2D(altered, lapack), /integrity/);
  const runtime = await instantiateEndpointLapack2D(blas, lapack);
  for (const value of [[[1, NaN], [2, 3]], [[1], [2, 3]], Array.from({ length: 1001 }, () => Array(256).fill(1))]) assert.throws(() => runtime.rightSvd(value), /bounded/);
  assert.equal(runtime.rightSvd([[1, 2], [3, 4], [5, 6]]).length, 2);
});
