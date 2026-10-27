/** SPDX-License-Identifier: GPL-3.0-only
 * Mulberry32 and type-7 recipes faithfully follow j-3dENA pinned package
 * 0.2.0-implemented-unverified.12 trajectory-statistics.ts. Those functions
 * are internal to the installed public facade and cannot be named-imported.
 * This streaming implementation preserves that Group-first draw order without
 * allocating the SDK's complete plan. This is deterministic JS, not R RNG parity.
 * https://github.com/HUDongpin/j-3dENA
 */
import { captureControlArrayV3 } from "./inference-consumers-v3";
import { deepFreezeV3, snapshotPlainJsonRecordV3 } from "./model-v3/canonical-json";

/** Derived display-summary coordinates only. The caller admits the current bound
 * result before building this population; no fit or scientific hash is changed. */
export interface TrajectoryUncertaintyInputV3 {
  bindingKey: string;
  axes: readonly string[];
  groups: readonly {
    groupKey: string;
    units: readonly {
      unitKey: string;
      steps: readonly { horizonKey: string; centroidKey: string; coordinates: readonly number[] }[];
    }[];
  }[];
}
export interface TrajectoryCentroidIntervalV3 {
  axis: string;
  estimate: number;
  lower: number | null;
  upper: number | null;
  status: "available" | "degenerate" | "unavailable";
  finiteDraws: number;
  reason: null | "insufficient-units" | "insufficient-finite-draws" | "numeric-overflow";
}
export interface TrajectoryUncertaintyResultV3 {
  bindingKey: string;
  axes: readonly string[];
  method: "percentile-bootstrap";
  confidenceLevel: 0.95;
  repetitions: 500;
  seed: 2026;
  centroids: readonly {
    centroidKey: string; groupKey: string; horizonKey: string; n: number;
    axes: readonly TrajectoryCentroidIntervalV3[];
  }[];
}
export const TRAJECTORY_UNCERTAINTY_LIMITS_V3 = Object.freeze({
  maxGroups: 1_000, maxUnits: 10_000, maxSteps: 100_000, maxAxes: 200,
  maxCoordinateCells: 100_000, maxWork: 50_000_000, maxBytes: 64 * 1024 * 1024,
});
const REPETITIONS = 500, SEED = 2026, REQUIRED_FINITE_DRAWS = 400;
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
function record(value: unknown, keys: readonly string[], label: string) {
  const captured = snapshotPlainJsonRecordV3(value, label);
  if (Object.keys(captured).length !== keys.length || Object.keys(captured).some(key => !keys.includes(key))) throw new TypeError(`Exact ${label} fields required`);
  return captured;
}
function budget(value: number, ceiling: number, label: string) {
  if (!Number.isSafeInteger(value) || value > ceiling) throw new TypeError(`Trajectory uncertainty ${label} budget exceeded`);
}

/** Bounded own-data-property capture before asynchronous work. Typed identity
 * keys are opaque: identical display labels never merge Groups or full Units. */
export function captureTrajectoryUncertaintyInputV3(input: TrajectoryUncertaintyInputV3): TrajectoryUncertaintyInputV3 {
  const value = record(input, ["bindingKey", "axes", "groups"], "trajectory uncertainty input");
  let characters = 0, units = 0, steps = 0, coordinateCells = 0, largestGroupCentroidCells = 0;
  const text = (value: unknown) => {
    if (typeof value !== "string" || !value.length || value.length > 65_536 || (characters += value.length) > 4_194_304) throw new TypeError("Trajectory uncertainty text budget exceeded");
    return value;
  };
  const bindingKey = text(value.bindingKey);
  const axes = captureControlArrayV3(value.axes, "uncertainty axes", undefined, TRAJECTORY_UNCERTAINTY_LIMITS_V3.maxAxes).map(text);
  if (axes.length < 2 || new Set(axes).size !== axes.length) throw new TypeError("Trajectory uncertainty requires two or more distinct retained axes");
  const groupsSeen = new Set<string>(), centroidOwners = new Map<string, string>();
  const groups = captureControlArrayV3(value.groups, "uncertainty Groups", undefined, TRAJECTORY_UNCERTAINTY_LIMITS_V3.maxGroups).map(entry => {
    const group = record(entry, ["groupKey", "units"], "uncertainty Group"), groupKey = text(group.groupKey);
    if (groupsSeen.has(groupKey)) throw new TypeError("Duplicate typed trajectory Group");
    groupsSeen.add(groupKey);
    const unitsSeen = new Set<string>(), horizons = new Map<string, string>();
    const capturedUnits = captureControlArrayV3(group.units, "uncertainty Units", undefined, TRAJECTORY_UNCERTAINTY_LIMITS_V3.maxUnits).map(entry => {
      budget(++units, TRAJECTORY_UNCERTAINTY_LIMITS_V3.maxUnits, "Unit");
      const unit = record(entry, ["unitKey", "steps"], "uncertainty Unit"), unitKey = text(unit.unitKey);
      if (unitsSeen.has(unitKey)) throw new TypeError("Duplicate full typed Unit inside a Group");
      unitsSeen.add(unitKey);
      const seen = new Set<string>();
      const capturedSteps = captureControlArrayV3(unit.steps, "uncertainty steps", undefined, TRAJECTORY_UNCERTAINTY_LIMITS_V3.maxSteps).map(entry => {
        budget(++steps, TRAJECTORY_UNCERTAINTY_LIMITS_V3.maxSteps, "step");
        budget(coordinateCells += axes.length, TRAJECTORY_UNCERTAINTY_LIMITS_V3.maxCoordinateCells, "coordinate cell");
        const step = record(entry, ["horizonKey", "centroidKey", "coordinates"], "uncertainty step");
        const horizonKey = text(step.horizonKey), centroidKey = text(step.centroidKey);
        if (seen.has(horizonKey)) throw new TypeError("Duplicate Unit Horizon in trajectory uncertainty population");
        seen.add(horizonKey);
        const owner = JSON.stringify([groupKey, horizonKey]);
        if ((centroidOwners.has(centroidKey) && centroidOwners.get(centroidKey) !== owner)
          || (horizons.has(horizonKey) && horizons.get(horizonKey) !== centroidKey)) throw new TypeError("Trajectory centroid key must identify exactly one Group/Horizon");
        centroidOwners.set(centroidKey, owner); horizons.set(horizonKey, centroidKey);
        const coordinates = captureControlArrayV3(step.coordinates, "uncertainty coordinates", axes.length, TRAJECTORY_UNCERTAINTY_LIMITS_V3.maxAxes).map(v => {
          if (typeof v !== "number" || !Number.isFinite(v)) throw new TypeError("Trajectory uncertainty requires finite retained coordinates");
          return v;
        });
        return { horizonKey, centroidKey, coordinates };
      });
      if (!capturedSteps.length) throw new TypeError("Trajectory uncertainty Unit histories must be nonempty");
      return { unitKey, steps: capturedSteps };
    });
    if (!capturedUnits.length) throw new TypeError("Trajectory uncertainty Groups must be nonempty");
    largestGroupCentroidCells = Math.max(largestGroupCentroidCells, horizons.size * axes.length);
    return { groupKey, units: capturedUnits };
  });
  // Conservative double-sized number slots plus row/string/array overhead.
  // Only one Group's centroid replicate matrix is retained at a time.
  budget(16 * REPETITIONS * largestGroupCentroidCells + coordinateCells * 16
    + steps * 256 + characters * 2 + (groups.length * REPETITIONS + units) * 64,
  TRAJECTORY_UNCERTAINTY_LIMITS_V3.maxBytes, "memory");
  budget(REPETITIONS * (2 * coordinateCells + units)
    + centroidOwners.size * axes.length * REPETITIONS * Math.ceil(Math.log2(REPETITIONS)),
  TRAJECTORY_UNCERTAINTY_LIMITS_V3.maxWork, "numerical work");
  return deepFreezeV3({ bindingKey, axes, groups });
}

/** Exact pinned mulberry32-uint32-v1 recipe; [0,1), no R RNG parity claim. */
export function createTrajectoryBootstrapRandomV3(seed = SEED): () => number {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new TypeError("Bootstrap seed must be uint32");
  let state = seed >>> 0;
  return () => {
    state = state + 1831565813 >>> 0;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function percentile(ordered: readonly number[], probability: number): number {
  const position = (ordered.length - 1) * probability, lower = Math.floor(position), upper = Math.ceil(position);
  if (lower === upper) return ordered[lower];
  const fraction = position - lower;
  return ordered[lower] * (1 - fraction) + ordered[upper] * fraction;
}

/** Type-7 marginal percentile interval. Retains the supplied exact centroid;
 * the bootstrap bounds are never recentered or widened for display. */
export function trajectoryCentroidIntervalV3(axis: string, estimate: number, n: number, draws: readonly number[]): TrajectoryCentroidIntervalV3 {
  if (draws.length !== REPETITIONS) throw new TypeError("Trajectory uncertainty requires exactly 500 bootstrap draws");
  const finite = draws.filter(Number.isFinite);
  const base = { axis, estimate, finiteDraws: finite.length };
  const reason = n < 2 ? "insufficient-units" : !Number.isFinite(estimate) ? "numeric-overflow"
    : finite.length < REQUIRED_FINITE_DRAWS ? "insufficient-finite-draws" : null;
  if (reason) return { ...base, lower: null, upper: null, status: "unavailable", reason };
  finite.sort((a, b) => a - b);
  const lower = percentile(finite, 0.025), upper = percentile(finite, 0.975);
  if (!Number.isFinite(lower) || !Number.isFinite(upper)) return { ...base, lower: null, upper: null, status: "unavailable", reason: "numeric-overflow" };
  return { ...base, lower, upper, status: lower === upper ? "degenerate" : "available", reason: null };
}

/** Sample full histories within fixed Group strata in the existing fitted
 * frame. One Unit multiplicity is shared by every observed Horizon and axis. */
export function computeTrajectoryUncertaintyV3(input: TrajectoryUncertaintyInputV3): TrajectoryUncertaintyResultV3 {
  const captured = captureTrajectoryUncertaintyInputV3(input);
  const groups = [...captured.groups].sort((a, b) => compare(a.groupKey, b.groupKey));
  const centroids: TrajectoryUncertaintyResultV3["centroids"][number][] = [];
  const random = createTrajectoryBootstrapRandomV3();
  for (const group of groups) {
    const histories = [...group.units].sort((a, b) => compare(a.unitKey, b.unitKey));
    const multiplicities = new Uint32Array(histories.length);
    const populations = new Map<string, { horizonKey: string; n: number; sums: number[]; min: number[]; max: number[]; draws: number[][]; drawSums: number[]; drawN: number }>();
    // Original-order accumulation preserves existing display centroid estimates.
    for (const unit of group.units) for (const step of unit.steps) {
      let p = populations.get(step.centroidKey);
      if (!p) { p = { horizonKey: step.horizonKey, n: 0, sums: captured.axes.map(() => 0), min: captured.axes.map(() => Infinity), max: captured.axes.map(() => -Infinity), draws: captured.axes.map(() => []), drawSums: captured.axes.map(() => 0), drawN: 0 }; populations.set(step.centroidKey, p); }
      p.n++;
      step.coordinates.forEach((value, i) => { p.sums[i] += value; p.min[i] = Math.min(p.min[i], value); p.max[i] = Math.max(p.max[i], value); });
    }
    for (let replicate = 0; replicate < REPETITIONS; replicate++) {
      multiplicities.fill(0);
      for (let draw = 0; draw < histories.length; draw++) multiplicities[Math.floor(random() * histories.length)]++;
      for (const p of populations.values()) { p.drawN = 0; p.drawSums.fill(0); }
      for (let index = 0; index < histories.length; index++) {
        const multiplicity = multiplicities[index];
        if (!multiplicity) continue;
        for (const step of histories[index].steps) {
          const p = populations.get(step.centroidKey)!; p.drawN += multiplicity;
          step.coordinates.forEach((value, i) => { p.drawSums[i] += value * multiplicity; });
        }
      }
      for (const p of populations.values()) for (let axis = 0; axis < captured.axes.length; axis++) {
        p.draws[axis].push(!p.drawN ? NaN : p.min[axis] === p.max[axis] ? p.min[axis] : p.drawSums[axis] / p.drawN);
      }
    }
    for (const [centroidKey, p] of populations) centroids.push({ centroidKey, groupKey: group.groupKey, horizonKey: p.horizonKey, n: p.n,
      axes: captured.axes.map((axis, i) => trajectoryCentroidIntervalV3(axis, p.sums[i] / p.n, p.n, p.draws[i])) });
  }
  return deepFreezeV3({ bindingKey: captured.bindingKey, axes: captured.axes, method: "percentile-bootstrap", confidenceLevel: 0.95, repetitions: 500, seed: 2026, centroids });
}
