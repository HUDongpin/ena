import assert from "node:assert/strict";
import test from "node:test";
import type { IndependentTrajectoryComparisonInput, TrajectoryIdentity } from "j-3dena";
import { compareTrajectoryPaths, getTrajectoryPermutationUnits } from "../lib/open-ena/trajectory-path-statistics-v3";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";
import { bindResultV3 } from "../lib/open-ena/model-v3/result-binding";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import { buildReferenceV2, fitReferenceSourceV3 } from "../lib/open-ena/model-v3/reference-v2";
import { runOpenEnaTrajectoryPathInferenceV3 } from "../lib/open-ena/trajectory-path-inference-v3";

const identity = (name: string, value: string): TrajectoryIdentity => ({ components: [{ name, type: "string", value }] });
const allocations: number[][] = [];
for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) for (let k = j + 1; k < 6; k++) {
  const a = [i, j, k];
  allocations.push([...a, ...[0, 1, 2, 3, 4, 5].filter(n => !a.includes(n))]);
}
function coordinateComparison(values: number[], weights?: number[], options: { startAtZero?: boolean; diagonal?: boolean; reversePlan?: boolean; leadingGap?: boolean } = {}) {
  const size = values.length / 2;
  const permutations = size === 3 ? allocations : [0, 1, 2, 3].flatMap(i => [0, 1, 2, 3].filter(j => j > i).map(j => [i, j, ...[0, 1, 2, 3].filter(k => k !== i && k !== j)]));
  const side = (start: number, namespace: string) => ({ label: namespace, series: {
    namespace, dimensions: ["x", "y", "z"], selectedDimensions: ["x", "y", "z"] as [string, string, string],
    timeOrder: [...(options.leadingGap ? [identity("time", "0")] : []), identity("time", "1"), identity("time", "2")], cohortPolicy: options.leadingGap ? "available" as const : "complete" as const,
    ...(weights ? { estimand: "weighted-participant" as const } : {}),
    points: Array.from({ length: size }, (_, p) => [1, 2].map(t => {
      const value = options.startAtZero && t === 1 ? 0 : values[start + p];
      return { participant: identity("id", String(start + p)), time: identity("time", String(t)), coordinates: [value, options.diagonal ? value : 0, 0], ...(weights ? { weight: weights[start + p] } : {}) };
    })).flat(),
  } });
  const input: IndependentTrajectoryComparisonInput = { design: "independent", sideA: side(0, "A"), sideB: side(size, "B") };
  return compareTrajectoryPaths({ ...input, permutationPlan: { kind: "independent-pool-indices-v1", unitOrder: getTrajectoryPermutationUnits(input).unitOrder, replicates: options.reversePlan ? [...permutations].reverse() : permutations } });
}
// All operands/sums here are safe integers. The common positive scale and
// denominator 3 cancel, so this oracle performs no floating centroid arithmetic.
function exactCoordinateP(integers: number[]) {
  const difference = (order: number[]) => order.slice(3).reduce((s, i) => s + integers[i], 0) - order.slice(0, 3).reduce((s, i) => s + integers[i], 0);
  const observed = Math.abs(difference([0, 1, 2, 3, 4, 5]));
  return (1 + allocations.filter(order => Math.abs(difference(order)) >= observed).length) / 21;
}

test("inclusive permutation tails retain exact dyadic ties at tiny, ordinary and large scales", () => {
  for (const integers of [[7, 9, -2, 2, -6, 11], [-8, 10, 14, -7, 1, 13], [-1, 14, -13, -16, -11, 12]]) {
    for (const scale of [2 ** -800, 1, 2 ** 800]) {
      const comparison = coordinateComparison(integers.map(n => n / 16 * scale));
      for (const row of comparison.tests.filter(row => row.metric === "coordinate:x")) {
        assert.equal(row.pValue, exactCoordinateP(integers));
        assert.equal(row.permutationCount, 20);
      }
    }
  }
});

test("subnormal coordinate and distance tails retain the exact balanced-allocation counts", () => {
  for (const integers of [[0, 0, 0, 0, 1, 1], [7, 9, -2, 2, -6, 11]]) {
    const result = coordinateComparison(integers.map(value => value * Number.MIN_VALUE));
    for (const row of result.tests.filter(row => row.metric === "coordinate:x" || row.metric === "centroid-separation")) {
      assert.equal(row.pValue, exactCoordinateP(integers), row.id);
      assert.equal(row.permutationCount, 20);
    }
  }
  // Starting from zero makes the one-axis path-length contrast equal to the
  // coordinate contrast for these nonnegative integer-valued observations.
  const integers = [0, 0, 0, 0, 1, 1];
  const path = coordinateComparison(integers.map(value => value * Number.MIN_VALUE), undefined, { startAtZero: true });
  for (const row of path.tests.filter(row => row.timeIndex === 1 && row.distanceSpace !== null)) {
    assert.equal(row.pValue, exactCoordinateP(integers), row.id);
    assert.equal(row.permutationCount, 20);
  }
});

test("roundoff allowance does not merge genuinely distinct nearby permutations at any scale", () => {
  const q = 2 ** 30;
  for (const integers of [[7 * q, 9 * q, -2 * q, 2 * q, -6 * q, 11 * q + 1], [0, 0, 0, 1, 1, 1]]) {
    for (const scale of [2 ** -800, 1, 2 ** 800]) {
      const comparison = coordinateComparison(integers.map(n => n / q / 16 * scale));
      for (const row of comparison.tests.filter(row => row.metric === "coordinate:x")) assert.equal(row.pValue, exactCoordinateP(integers));
    }
  }
});

test("exact small contrasts remain distinct with a common origin or wide cancelling scatter", () => {
  const d = 2 ** -47;
  for (const offset of [0, 1]) {
    const result = coordinateComparison([offset, offset, offset + d, offset + d]);
    for (const row of result.tests.filter(row => row.metric === "coordinate:x" || row.metric === "centroid-separation")) {
      assert.equal(row.observed, d); assert.equal(row.pValue, 3 / 7);
    }
  }
  const residual = 2 ** -48;
  const result = coordinateComparison([1, -1, 1 + residual, -1 + residual]);
  for (const row of result.tests.filter(row => row.metric === "coordinate:x" || row.metric === "centroid-separation")) {
    assert.equal(row.observed, residual); assert.equal(row.pValue, 5 / 7);
  }
});

test("genuine small step and cumulative differences survive rational and irrational path lengths", () => {
  const d = 2 ** -48;
  for (const diagonal of [false, true]) for (const scale of [2 ** -800, 1, 2 ** 800]) {
    const result = coordinateComparison([1, -1, 1 + d, -1 + d].map(x => x * scale), undefined, { startAtZero: true, diagonal });
    for (const row of result.tests.filter(row => row.timeIndex === 1 && row.distanceSpace !== null)) {
      const expected = d * scale * (diagonal ? Math.SQRT2 : 1);
      assert.ok(Math.abs(row.observed / expected - 1) < 4 * Number.EPSILON);
      assert.equal(row.pValue, 5 / 7, row.id);
    }
  }
});

test("observed statistics and inclusive counts do not depend on permutation order", () => {
  for (const values of [[1, 1, 1 + 2 ** -47, 1 + 2 ** -47], [1, -1, 1 + 2 ** -48, -1 + 2 ** -48], [7, 9, -2, 2, -6, 11]]) {
    for (const startAtZero of [false, true]) {
      const a = coordinateComparison(values, undefined, { startAtZero, diagonal: true });
      const b = coordinateComparison(values, undefined, { startAtZero, diagonal: true, reversePlan: true });
      assert.deepEqual(a.periods, b.periods); assert.deepEqual(a.tests, b.tests);
    }
  }
});

test("an unavailable early period does not prevent a later adjacent step", () => {
  const result = coordinateComparison([1, -1, 1 + 2 ** -48, -1 + 2 ** -48], undefined, { startAtZero: true, diagonal: true, leadingGap: true });
  assert.equal(result.periods[0].fullCentroidSeparation, null);
  assert.equal(result.periods[1].fullStepDistanceDifference, null);
  assert.equal(result.periods[2].fullCumulativeDistanceDifference, null);
  const steps = result.tests.filter(row => row.metric === "step-distance-difference");
  assert.equal(steps.length, 2);
  for (const row of steps) { assert.equal(row.timeIndex, 2); assert.equal(row.pValue, 5 / 7); }
  assert.ok(!result.tests.some(row => row.metric === "cumulative-distance-difference"));
});

test("exact comparison scratch stays within the existing 64 MiB ceiling", () => {
  const side = (namespace: string) => ({ label: namespace, series: {
    namespace, dimensions: ["x", "y", "z"], selectedDimensions: ["x", "y", "z"] as [string, string, string],
    timeOrder: Array.from({ length: 1000 }, (_, i) => identity("time", String(i))), cohortPolicy: "available" as const,
    points: [0, 1].map(i => ({ participant: identity("id", String(i)), time: identity("time", "0"), coordinates: [i, 0, 0] })),
  } });
  assert.throws(() => compareTrajectoryPaths({ design: "independent", sideA: side("A"), sideB: side("B") }), /comparison scratch exceeds 64 MiB/);
});

test("weighted ambiguous coordinate and separation tails agree with independent exact rational enumeration", () => {
  const q = 2 ** 48, coordinates = [q, -q, q + 1, -q + 1], weights = [1, 3, 2, 4];
  const allocations = [0, 1, 2, 3].flatMap(i => [0, 1, 2, 3].filter(j => j > i).map(j => [i, j, ...[0, 1, 2, 3].filter(k => k !== i && k !== j)]));
  const contrast = (order: number[]) => {
    const side = (ids: number[]) => ({ sum: ids.reduce((n, i) => n + BigInt(coordinates[i]) * BigInt(weights[i]), BigInt(0)), weight: ids.reduce((n, i) => n + BigInt(weights[i]), BigInt(0)) });
    const a = side(order.slice(0, 2)), b = side(order.slice(2));
    const numerator = b.sum * a.weight - a.sum * b.weight;
    return { numerator: numerator < BigInt(0) ? -numerator : numerator, denominator: a.weight * b.weight };
  };
  const observed = contrast([0, 1, 2, 3]);
  const expected = (1 + allocations.filter(order => { const candidate = contrast(order); return candidate.numerator * observed.denominator >= observed.numerator * candidate.denominator; }).length) / 7;
  for (const scale of [2 ** -800, 1, 2 ** 800]) {
    const result = coordinateComparison(coordinates.map(value => value / q * scale), weights);
    for (const row of result.tests.filter(row => row.metric === "coordinate:x" || row.metric === "centroid-separation")) assert.equal(row.pValue, expected);
  }
  const stepContrast = (order: number[]) => {
    const side = (ids: number[]) => { const sum = ids.reduce((n, i) => n + BigInt(coordinates[i]) * BigInt(weights[i]), BigInt(0)); return { sum: sum < BigInt(0) ? -sum : sum, weight: ids.reduce((n, i) => n + BigInt(weights[i]), BigInt(0)) }; };
    const a = side(order.slice(0, 2)), b = side(order.slice(2));
    const value = b.sum * a.weight - a.sum * b.weight;
    return { numerator: value < BigInt(0) ? -value : value, denominator: a.weight * b.weight };
  };
  const observedStep = stepContrast([0, 1, 2, 3]);
  const expectedStep = (1 + allocations.filter(order => { const candidate = stepContrast(order); return candidate.numerator * observedStep.denominator >= observedStep.numerator * candidate.denominator; }).length) / 7;
  const path = coordinateComparison(coordinates.map(value => value / q), weights, { startAtZero: true, diagonal: true });
  for (const row of path.tests.filter(row => row.metric === "step-distance-difference" || row.metric === "cumulative-distance-difference")) assert.equal(row.pValue, expectedStep);
});

test("native full-space permutation probabilities remain one under a fitted orthonormal reference", async () => {
  const source = await bindingFixtureV3("d".repeat(64), (draft, data) => {
    draft.codes.push("D"); data.headers.push("D");
    data.rows = Array.from({ length: 10 }, (_, i) => ({ unit: `s${i}`, horizon: "h1", time: 1, group: i < 5 ? "Control" : "Treatment", A: i + 1, B: (i * 3) % 7 + 1, C: (i * i) % 5 + 1, D: (i * 7) % 11 + 1 }));
  });
  const reference = await buildReferenceV2(await fitReferenceSourceV3(source.plan), { displayName: "Synthetic rotated reference", currentPlan: source.plan });
  const pairs = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
  for (const allocation of [[0, 1, 2], [0, 1, 5]]) {
    const f = await bindingFixtureV3(undefined, (draft, data) => {
      draft.model = "SeparateTrajectory";
      draft.rotation = { type: "reference", referenceId: reference.referenceId, expectedContentSha256: reference.contentSha256 };
      draft.codes.push("D"); data.headers.push("D");
      data.rows = pairs.flatMap((_, i) => [1, 2, 3].map(t => ({ unit: `p${i}`, horizon: `h${t}`, time: t, group: allocation.includes(i) ? "Control" : "Treatment", ...Object.fromEntries(["A", "B", "C", "D"].map((c, j) => [c, pairs[(i + t - 1) % pairs.length].includes(j) ? 1 : 0])) })));
    }, reference);
    const result = await bindResultV3(f.plan, runStandardPlanV3(f.plan), { processedRows: 18, maximumBufferedRows: 0, numericCellsAllocated: 240, peakBytesObservedOrBounded: 20480, observationMethod: "exact-counters-and-conservative-byte-bound" }, f.compiled.diagnostics);
    const before = JSON.stringify(result);
    const inference = await runOpenEnaTrajectoryPathInferenceV3(result, f.plan, {
      axes: result.executionProvenance.projection.estimableAxes.slice(0, 3) as [string, string, string], identityConfirmed: true, independentGroupsConfirmed: true,
      primaryGroup: { type: "string", value: "Control" }, secondaryGroup: { type: "string", value: "Treatment" },
      horizons: [1, 2, 3].map(t => [{ column: "horizon", value: { type: "string", value: `h${t}` } }]), cohortPolicy: "all-period-complete", repetitions: 500, seed: 2026,
    });
    // Each history is one edge-space basis vector. Every balanced allocation
    // has +/-1/3 contrast components, preserved by common centering/rotation.
    // Cycling the six basis vectors also preserves the pooled centroid at
    // every Horizon: complementary groups have opposite displacement vectors,
    // hence identical step/cumulative lengths for every history permutation.
    const rows = inference.inference.tests.filter(row => row.distanceSpace === "full-space");
    assert.equal(rows.length, 7);
    for (const row of rows) {
      const expected = row.metric === "centroid-separation" ? Math.sqrt(2 / 3) : 0;
      assert.ok(Math.abs(row.observed - expected) < 1e-14);
      assert.equal(row.pValue, 1); assert.equal(row.holmAdjustedPValue, 1); assert.equal(row.permutationCount, 500);
    }
    assert.equal(JSON.stringify(result), before);
  }
});
