import assert from "node:assert/strict";
import test from "node:test";
import {
  captureTrajectoryUncertaintyInputV3,
  computeTrajectoryUncertaintyV3,
  createTrajectoryBootstrapRandomV3,
  trajectoryCentroidIntervalV3,
} from "../lib/open-ena/trajectory-uncertainty-v3";

function fixture(dimensions = 2) {
  return { bindingKey: "binding-A", axes: ["x", "y", "z"].slice(0, dimensions), groups: [{ groupKey: "typed-group-A", units: [0, 3, 12].map((x, index) => ({
    unitKey: `typed-unit-${index}`, steps: [0, 1].map(h => ({ horizonKey: `h${h}`, centroidKey: `a-h${h}`, coordinates: [x + h * 10, 2 * x + h * 20, 3 * x].slice(0, dimensions) })),
  })) }] };
}
const type7 = (values: number[], probability: number) => {
  const sorted = [...values].sort((a, b) => a - b), position = (sorted.length - 1) * probability;
  return sorted[Math.floor(position)] * (1 - (position % 1)) + sorted[Math.ceil(position)] * (position % 1);
};

test("B500 seed2026 returns deterministic type7 intervals without recentering", () => {
  const input = fixture(), actual = computeTrajectoryUncertaintyV3(input);
  assert.deepEqual(computeTrajectoryUncertaintyV3(input), actual);
  assert.equal(actual.repetitions, 500); assert.equal(actual.seed, 2026); assert.equal(actual.confidenceLevel, 0.95);
  const x = actual.centroids[0].axes[0];
  assert.equal(x.estimate, 5); assert.equal(x.lower, 0); assert.equal(x.upper, 12);
  assert.notEqual(x.estimate - x.lower!, x.upper! - x.estimate);
});

test("seed2026 agrees with fixed pinned Mulberry32 first history draw indices", () => {
  const random = createTrajectoryBootstrapRandomV3();
  assert.deepEqual(Array.from({ length: 5 }, () => Array.from({ length: 3 }, () => Math.floor(random() * 3))), [[1, 0, 1], [1, 0, 0], [2, 2, 0], [0, 0, 1], [1, 0, 0]]);
});

test("one full-history multiplicity preserves cross-Horizon and cross-axis covariance", () => {
  const result = computeTrajectoryUncertaintyV3(fixture());
  const first = result.centroids[0].axes, second = result.centroids[1].axes;
  assert.equal(second[0].lower, first[0].lower! + 10);
  assert.equal(second[0].upper, first[0].upper! + 10);
  assert.equal(first[1].lower, first[0].lower! * 2);
  assert.equal(first[1].upper, first[0].upper! * 2);
});

test("nontrivial seeded percentile oracle verifies shared whole-history draws", () => {
  const input = fixture(3);
  input.groups[0].units = Array.from({ length: 17 }, (_, i) => {
    const x = i * i + 5 * i;
    return { unitKey: `u${String(i).padStart(2, "0")}`, steps: [0, 1].map(h => ({ horizonKey: `h${h}`, centroidKey: `a-h${h}`, coordinates: [x + h * 10, 2 * x + h * 20, 3 * x] })) };
  });
  const result = computeTrajectoryUncertaintyV3(input), first = result.centroids[0].axes, second = result.centroids[1].axes;
  // Fixed oracle generated independently with uint32 Python arithmetic and the
  // pinned Mulberry32 recipe, then direct sampled-list means and type-7 sorting.
  assert.equal(first[0].estimate, 128);
  assert.equal(first[0].lower, 79.05882352941177);
  assert.equal(first[0].upper, 181.79411764705878);
  for (const bound of ["lower", "upper"] as const) {
    assert.ok(Math.abs(second[0][bound]! - first[0][bound]! - 10) < 1e-10);
    assert.ok(Math.abs(first[1][bound]! - 2 * first[0][bound]!) < 1e-10);
    assert.ok(Math.abs(first[2][bound]! - 3 * first[0][bound]!) < 1e-10);
  }
  input.groups[0].units.reverse();
  assert.deepEqual(computeTrajectoryUncertaintyV3(input), result);
});

test("rank2 and rank3 use identical draws on their shared retained axes", () => {
  const two = computeTrajectoryUncertaintyV3(fixture(2)), three = computeTrajectoryUncertaintyV3(fixture(3));
  for (let index = 0; index < two.centroids.length; index++) assert.deepEqual(two.centroids[index].axes, three.centroids[index].axes.slice(0, 2));
});

test("same Unit keys in different typed Groups remain separate strata", () => {
  const input = structuredClone(fixture());
  const group = structuredClone(input.groups[0]);
  group.groupKey = "typed-group-B";
  for (const unit of group.units) for (const step of unit.steps) { step.centroidKey = step.centroidKey.replace("a-", "b-"); step.coordinates = step.coordinates.map(v => v + 1000); }
  input.groups.push(group);
  const result = computeTrajectoryUncertaintyV3(input);
  assert.equal(result.centroids.length, 4);
  for (const centroid of result.centroids.filter(c => c.groupKey === "typed-group-B")) assert.ok(centroid.axes.every(a => a.lower! >= 1000));
  for (const centroid of result.centroids.filter(c => c.groupKey === "typed-group-A")) assert.ok(centroid.axes.every(a => a.upper! < 100));
});

test("missing Horizons use available sampled histories without imputation", () => {
  const input = structuredClone(fixture());
  input.groups[0].units[2].steps.pop();
  const result = computeTrajectoryUncertaintyV3(input);
  const horizon = result.centroids.find(c => c.horizonKey === "h1")!;
  assert.equal(horizon.n, 2); assert.equal(horizon.axes[0].estimate, 11.5);
  assert.ok(horizon.axes[0].finiteDraws < 500); assert.ok(horizon.axes[0].finiteDraws >= 400);
  assert.equal(horizon.axes[0].lower, 10); assert.equal(horizon.axes[0].upper, 13);
});

test("singleton intervals are unavailable and constant samples remain zero-width", () => {
  const input = structuredClone(fixture()); input.groups[0].units = input.groups[0].units.slice(0, 1);
  const singleton = computeTrajectoryUncertaintyV3(input).centroids[0].axes[0];
  assert.equal(singleton.status, "unavailable"); assert.equal(singleton.reason, "insufficient-units"); assert.equal(singleton.lower, null);
  const same = structuredClone(fixture());
  for (const unit of same.groups[0].units) for (const step of unit.steps) step.coordinates = [4, 4];
  const constant = computeTrajectoryUncertaintyV3(same).centroids[0].axes[0];
  assert.equal(constant.status, "degenerate"); assert.equal(constant.estimate, 4); assert.equal(constant.lower, 4); assert.equal(constant.upper, 4);
});

test("type7 interpolates fixed draws and requires at least 400 finite replicates", () => {
  const draws = Array.from({ length: 500 }, (_, i) => i);
  const interval = trajectoryCentroidIntervalV3("x", 50, 3, draws);
  assert.equal(interval.lower, type7(draws, 0.025)); assert.equal(interval.upper, type7(draws, 0.975));
  const unavailable = trajectoryCentroidIntervalV3("x", 2, 3, [...draws.slice(0, 399), ...Array(101).fill(NaN)]);
  assert.equal(unavailable.status, "unavailable"); assert.equal(unavailable.finiteDraws, 399); assert.equal(unavailable.reason, "insufficient-finite-draws");
  assert.equal(trajectoryCentroidIntervalV3("x", 2, 3, [...draws.slice(0, 400), ...Array(100).fill(NaN)]).status, "available");
});

test("capture freezes detached histories and rejects accessors and duplicate Unit Horizons", () => {
  const source = structuredClone(fixture()), captured = captureTrajectoryUncertaintyInputV3(source);
  source.groups[0].units[0].steps[0].coordinates[0] = 123;
  assert.equal(captured.groups[0].units[0].steps[0].coordinates[0], 0);
  assert.ok(Object.isFrozen(captured.groups[0].units[0].steps[0].coordinates));
  const duplicate = structuredClone(fixture()); duplicate.groups[0].units[0].steps.push(duplicate.groups[0].units[0].steps[0]);
  assert.throws(() => captureTrajectoryUncertaintyInputV3(duplicate), /duplicate.*Horizon/i);
  let accessed = false;
  Object.defineProperty(source, "axes", { get() { accessed = true; return ["x", "y"]; }, enumerable: true });
  assert.throws(() => captureTrajectoryUncertaintyInputV3(source), /accessor/i); assert.equal(accessed, false);
});

test("numerical budgets reject oversized workloads before computing draws", () => {
  const input = structuredClone(fixture());
  input.groups[0].units = Array.from({ length: 10_001 }, (_, i) => ({ unitKey: `u${i}`, steps: [{ horizonKey: "h", centroidKey: "c", coordinates: [i, i] }] }));
  assert.throws(() => computeTrajectoryUncertaintyV3(input), /budget|limit/i);
  const sparse = structuredClone(fixture()); sparse.groups[0].units[0].steps[0].coordinates = new Array(2);
  assert.throws(() => computeTrajectoryUncertaintyV3(sparse), /dense|captured|data/i);
});

test("independent memory and arithmetic budgets stop otherwise valid populations", () => {
  const memory = fixture();
  memory.groups[0].units = [0, 1].map(x => ({ unitKey: `u${x}`, steps: Array.from({ length: 5000 }, (_, h) => ({ horizonKey: `h${h}`, centroidKey: `c${h}`, coordinates: [x, x] })) }));
  assert.throws(() => computeTrajectoryUncertaintyV3(memory), /memory budget/i);
  const work = fixture(); work.axes = Array.from({ length: 10 }, (_, i) => `a${i}`);
  work.groups[0].units = Array.from({ length: 10_000 }, (_, x) => ({ unitKey: `u${x}`, steps: [{ horizonKey: "h", centroidKey: "c", coordinates: work.axes.map(() => x) }] }));
  assert.throws(() => computeTrajectoryUncertaintyV3(work), /work budget/i);
});

test("floating constant samples retain zero width and numerical overflow is unavailable", () => {
  const input = fixture();
  for (const unit of input.groups[0].units) for (const step of unit.steps) step.coordinates = [0.1, 0.1];
  const constant = computeTrajectoryUncertaintyV3(input).centroids[0].axes[0];
  assert.equal(constant.estimate, (0.1 + 0.1 + 0.1) / 3);
  assert.equal(constant.lower, 0.1); assert.equal(constant.upper, 0.1); assert.equal(constant.status, "degenerate");
  for (const unit of input.groups[0].units) for (const step of unit.steps) step.coordinates = [Number.MAX_VALUE, Number.MAX_VALUE];
  const overflow = computeTrajectoryUncertaintyV3(input).centroids[0].axes[0];
  assert.equal(overflow.status, "unavailable"); assert.equal(overflow.reason, "numeric-overflow"); assert.equal(overflow.lower, null);
});
