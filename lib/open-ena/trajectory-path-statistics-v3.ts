/**
 * SPDX-License-Identifier: GPL-3.0-only
 * Faithful independent-path subset of j-3dENA, https://github.com/HUDongpin/j-3dENA.
 * Pinned package 0.2.0-implemented-unverified.12, src/trajectory-statistics.ts
 * (source-map lines 328-1091,1491-1497): normalization, path centroids/distances,
 * independent history pooling, metricDescriptors, permutationTests, holmAdjust.
 * Paired/bootstrap branches are omitted. Cohorts, ordering and RNG are unchanged.
 * Common-frame arithmetic and adaptive inclusive permutation tails follow
 * docs/open-ena-permutation-roundoff-v1.md instead of strict SDK comparisons.
 * This pure numerical port confers NO bound-result, currentness or receipt authority.
 * Original source SHA256: a2bc95586cc1868298a6bc31e9f2d4b8d17fd26bd2ba00055f1972ebdf6cd9e8
 * Installed index.js SHA256: dc84642d3aff7e253b4416071943ccbb379c0a9096a5f2412fd0b4df4458465f
 */
import type { TrajectoryStatisticsLimits, TrajectoryIdentityComponent, TrajectoryIdentity, TrajectoryKey,
  TrajectorySeriesInput, TrajectoryStatisticsPoint, TrajectoryParticipantPeriod, TrajectoryDistanceMetrics,
  TrajectoryPathStatistics, TrajectoryPathPeriodStatistics, TrajectoryStatisticsDiagnostic,
  IndependentTrajectoryComparisonInput, TrajectoryPermutationUnits, TrajectoryComparisonPeriod,
  TrajectoryPermutationTest, TrajectoryComparisonResult } from "j-3dena";

const DEFAULT_LIMITS: TrajectoryStatisticsLimits = Object.freeze({
  maxPoints: 100_000,
  maxDimensions: 200,
  maxPeriods: 1_000,
  maxParticipants: 50_000,
  maxCells: 5_000_000,
  maxResamples: 10_000,
  maxTests: 10_000
});

const HARD_LIMITS: TrajectoryStatisticsLimits = Object.freeze({
  maxPoints: 500_000,
  maxDimensions: 500,
  maxPeriods: 10_000,
  maxParticipants: 200_000,
  maxCells: 100_000_000,
  maxResamples: 100_000,
  maxTests: 100_000
});

export class TrajectoryStatisticsError extends Error {
  readonly code: string;
  readonly path: string;

  constructor(code: string, path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "TrajectoryStatisticsError";
    this.code = code;
    this.path = path;
  }
}

function reject(code: string, path: string, message: string): never {
  throw new TrajectoryStatisticsError(code, path, message);
}

function resolveLimits(input?: Partial<TrajectoryStatisticsLimits>): TrajectoryStatisticsLimits {
  const result = {} as TrajectoryStatisticsLimits;
  for (const key of Object.keys(DEFAULT_LIMITS) as Array<keyof TrajectoryStatisticsLimits>) {
    const value = input?.[key];
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) {
      reject("INVALID_TRAJECTORY_LIMIT", `limits.${key}`, "must be a positive safe integer");
    }
    if (value !== undefined && value > HARD_LIMITS[key]) {
      reject("TRAJECTORY_LIMIT_ABOVE_CEILING", `limits.${key}`, `must not exceed ${HARD_LIMITS[key]}`);
    }
    result[key] = value ?? DEFAULT_LIMITS[key];
  }
  return result;
}

function scalarToken(component: TrajectoryIdentityComponent, path: string): [string, string, string, string] {
  if (typeof component.name !== "string" || component.name.trim() === "") {
    reject("INVALID_IDENTITY_COMPONENT", `${path}.name`, "must be a non-empty string");
  }
  if (component.declaredType !== undefined && (typeof component.declaredType !== "string" || component.declaredType.trim() === "" || component.declaredType.length > 256)) {
    reject("INVALID_IDENTITY_COMPONENT", `${path}.declaredType`, "must be a non-empty string of at most 256 UTF-16 code units when present");
  }
  if (component.type === "string") {
    if (typeof component.value !== "string" || component.value.length === 0) {
      reject("INVALID_IDENTITY_VALUE", `${path}.value`, "must be a non-empty string for a string component");
    }
    return [component.name, "string", component.declaredType ?? "string", component.value];
  }
  if (component.type === "boolean") {
    if (typeof component.value !== "boolean") reject("INVALID_IDENTITY_VALUE", `${path}.value`, "must be boolean");
    return [component.name, "boolean", component.declaredType ?? "boolean", component.value ? "true" : "false"];
  }
  if (component.type !== "number" || typeof component.value !== "number" || !Number.isFinite(component.value)) {
    reject("INVALID_IDENTITY_VALUE", `${path}.value`, "must be a finite number with type number");
  }
  if (Number.isInteger(component.value) && !Number.isSafeInteger(component.value)) {
    reject("UNSAFE_INTEGER_IDENTITY", `${path}.value`, "integer identities above Number.MAX_SAFE_INTEGER must be strings");
  }
  return [component.name, "number", component.declaredType ?? "number", Object.is(component.value, -0) ? "-0" : String(component.value)];
}

function normalizeIdentity(identity: TrajectoryIdentity, path: string): TrajectoryKey {
  if (!identity || !Array.isArray(identity.components) || identity.components.length === 0) {
    reject("INVALID_TRAJECTORY_IDENTITY", path, "must contain at least one typed component");
  }
  const seen = new Set<string>();
  const components = identity.components.map((component, index) => {
    if (!component || typeof component !== "object") reject("INVALID_IDENTITY_COMPONENT", `${path}.components[${index}]`, "must be an object");
    const token = scalarToken(component, `${path}.components[${index}]`);
    if (seen.has(component.name)) reject("DUPLICATE_IDENTITY_COMPONENT", `${path}.components[${index}].name`, "duplicates an earlier component name");
    seen.add(component.name);
    return { component: { ...component }, token };
  });
  return {
    components: components.map((entry) => entry.component),
    canonical: JSON.stringify(components.map((entry) => entry.token)),
    display: components.map((entry) => String(entry.component.value)).join(" · ")
  };
}

function normalizeNamespace(value: string, path: string): string {
  if (typeof value !== "string" || value.trim() === "" || value.length > 256) {
    reject("INVALID_TRAJECTORY_NAMESPACE", path, "must be a non-empty string of at most 256 UTF-16 code units");
  }
  return value;
}

interface NormalizedSeries {
  input: TrajectorySeriesInput;
  namespace: string;
  dimensions: string[];
  selectedDimensions: [string, string, string];
  selectedIndexes: [number, number, number];
  timeOrder: TrajectoryKey[];
  estimand: "equal-participant" | "weighted-participant";
  points: Array<{ participant: TrajectoryKey; time: TrajectoryKey; stratum?: TrajectoryKey; coordinates: number[]; weight: number; rowIndex: number }>;
  limits: TrajectoryStatisticsLimits;
}

function normalizeSeries(input: TrajectorySeriesInput): NormalizedSeries {
  if (!input || typeof input !== "object") reject("INVALID_TRAJECTORY_INPUT", "input", "must be an object");
  const limits = resolveLimits(input.limits);
  const namespace = normalizeNamespace(input.namespace, "input.namespace");
  if (!Array.isArray(input.points) || input.points.length === 0) reject("EMPTY_TRAJECTORY_POINTS", "input.points", "must contain at least one point");
  if (input.points.length > limits.maxPoints) reject("TRAJECTORY_POINT_LIMIT", "input.points", `exceeds maxPoints=${limits.maxPoints}`);
  if (!Array.isArray(input.dimensions) || input.dimensions.length === 0) reject("INVALID_TRAJECTORY_DIMENSIONS", "input.dimensions", "must be non-empty");
  if (input.dimensions.length > limits.maxDimensions) reject("TRAJECTORY_DIMENSION_LIMIT", "input.dimensions", `exceeds maxDimensions=${limits.maxDimensions}`);
  if (input.dimensions.some((dimension) => typeof dimension !== "string" || dimension.trim() === "")) reject("INVALID_TRAJECTORY_DIMENSIONS", "input.dimensions", "must contain non-empty strings");
  if (new Set(input.dimensions).size !== input.dimensions.length) reject("DUPLICATE_TRAJECTORY_DIMENSION", "input.dimensions", "must be unique");
  if (!Array.isArray(input.selectedDimensions) || input.selectedDimensions.length !== 3 || new Set(input.selectedDimensions).size !== 3) {
    reject("INVALID_SELECTED_DIMENSIONS", "input.selectedDimensions", "must contain exactly three distinct dimensions");
  }
  const selectedIndexes = input.selectedDimensions.map((dimension, index) => {
    const found = input.dimensions.indexOf(dimension);
    if (found < 0) reject("UNKNOWN_SELECTED_DIMENSION", `input.selectedDimensions[${index}]`, `${JSON.stringify(dimension)} is not declared`);
    return found;
  }) as [number, number, number];
  if (!Array.isArray(input.timeOrder) || input.timeOrder.length === 0) reject("INVALID_TRAJECTORY_TIME_ORDER", "input.timeOrder", "must be non-empty");
  if (input.timeOrder.length > limits.maxPeriods) reject("TRAJECTORY_PERIOD_LIMIT", "input.timeOrder", `exceeds maxPeriods=${limits.maxPeriods}`);
  const timeOrder = input.timeOrder.map((time, index) => normalizeIdentity(time, `input.timeOrder[${index}]`));
  if (new Set(timeOrder.map((time) => time.canonical)).size !== timeOrder.length) reject("DUPLICATE_TRAJECTORY_TIME", "input.timeOrder", "contains duplicate typed periods");
  if (input.cohortPolicy !== "available" && input.cohortPolicy !== "complete") reject("INVALID_TRAJECTORY_COHORT", "input.cohortPolicy", "must be available or complete");
  const estimand = input.estimand ?? "equal-participant";
  if (estimand !== "equal-participant" && estimand !== "weighted-participant") reject("INVALID_TRAJECTORY_ESTIMAND", "input.estimand", "must be equal-participant or weighted-participant");
  const timeKeys = new Set(timeOrder.map((time) => time.canonical));
  const cells = input.points.length * input.dimensions.length;
  if (!Number.isSafeInteger(cells) || cells > limits.maxCells) reject("TRAJECTORY_CELL_LIMIT", "input.points", `exceeds maxCells=${limits.maxCells}`);
  const points = input.points.map((point, rowIndex) => {
    const participant = normalizeIdentity(point.participant, `input.points[${rowIndex}].participant`);
    const time = normalizeIdentity(point.time, `input.points[${rowIndex}].time`);
    const stratum = point.stratum === undefined ? undefined : normalizeIdentity(point.stratum, `input.points[${rowIndex}].stratum`);
    if (!timeKeys.has(time.canonical)) reject("TRAJECTORY_TIME_ORDER_INCOMPLETE", `input.points[${rowIndex}].time`, "observed period is absent from timeOrder");
    if (!Array.isArray(point.coordinates) || point.coordinates.length !== input.dimensions.length) reject("TRAJECTORY_COORDINATE_SHAPE", `input.points[${rowIndex}].coordinates`, "must align with dimensions");
    const coordinates = point.coordinates.map((value, dimensionIndex) => {
      if (typeof value !== "number" || !Number.isFinite(value)) reject("NON_FINITE_TRAJECTORY_COORDINATE", `input.points[${rowIndex}].coordinates[${dimensionIndex}]`, "must be finite");
      return value;
    });
    if (estimand === "weighted-participant" && (typeof point.weight !== "number" || !Number.isFinite(point.weight) || point.weight <= 0)) {
      reject("INVALID_PARTICIPANT_WEIGHT", `input.points[${rowIndex}].weight`, "must be finite and strictly positive for weighted-participant");
    }
    if (estimand === "equal-participant" && point.weight !== undefined) {
      reject("UNEXPECTED_PARTICIPANT_WEIGHT", `input.points[${rowIndex}].weight`, "must be omitted for equal-participant");
    }
    return { participant, time, ...(stratum ? { stratum } : {}), coordinates, weight: point.weight ?? 1, rowIndex };
  });
  if (new Set(points.map((point) => point.participant.canonical)).size > limits.maxParticipants) {
    reject("TRAJECTORY_PARTICIPANT_LIMIT", "input.points", `exceeds maxParticipants=${limits.maxParticipants}`);
  }
  return {
    input,
    namespace,
    dimensions: [...input.dimensions],
    selectedDimensions: [...input.selectedDimensions],
    selectedIndexes,
    estimand,
    timeOrder,
    points,
    limits
  };
}

function euclidean(delta: number[]): number {
  const result = Math.hypot(...delta);
  if (!Number.isFinite(result)) reject("TRAJECTORY_NUMERIC_OVERFLOW", "trajectory.computation.distance", "Euclidean distance is outside the finite numeric range");
  return result;
}

function subtract(right: number[], left: number[]): number[] {
  return right.map((value, index) => {
    const difference = value - left[index]!;
    if (!Number.isFinite(difference)) reject("TRAJECTORY_NUMERIC_OVERFLOW", `trajectory.computation.delta[${index}]`, "coordinate difference is outside the finite numeric range");
    return difference;
  });
}

function scalarDifference(right: number, left: number, path: string): number {
  const difference = right - left;
  if (!Number.isFinite(difference)) reject("TRAJECTORY_NUMERIC_OVERFLOW", path, "difference is outside the finite numeric range");
  return difference;
}

function compareCanonical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function mean(rows: number[][], dimensions: number): number[] | null {
  if (rows.length === 0) return null;
  return Array.from({ length: dimensions }, (_, index) => {
    // Divide before summing so same-sign finite inputs cannot overflow merely
    // because their unscaled total exceeds Number.MAX_VALUE. Neumaier's
    // correction also retains small residuals across severe cancellation.
    let sum = 0;
    let correction = 0;
    for (const row of rows) {
      const scaled = row[index]! / rows.length;
      const next = sum + scaled;
      if (!Number.isFinite(next)) reject("TRAJECTORY_NUMERIC_OVERFLOW", `trajectory.computation.mean[${index}]`, "centroid accumulation is outside the finite numeric range");
      correction += Math.abs(sum) >= Math.abs(scaled)
        ? (sum - next) + scaled
        : (scaled - next) + sum;
      if (!Number.isFinite(correction)) reject("TRAJECTORY_NUMERIC_OVERFLOW", `trajectory.computation.mean[${index}]`, "centroid correction is outside the finite numeric range");
      sum = next;
    }
    const result = sum + correction;
    if (!Number.isFinite(result)) reject("TRAJECTORY_NUMERIC_OVERFLOW", `trajectory.computation.mean[${index}]`, "centroid is outside the finite numeric range");
    return result;
  });
}

function weightedMean(rows: number[][], weights: number[], dimensions: number): number[] | null {
  if (rows.length === 0) return null;
  if (rows.length !== weights.length) reject("TRAJECTORY_WEIGHT_SHAPE", "trajectory.computation.weightedMean", "rows and weights must align");
  const weightSum = weights.reduce((sum, weight, index) => {
    if (!Number.isFinite(weight) || weight <= 0) reject("INVALID_PARTICIPANT_WEIGHT", `trajectory.computation.weights[${index}]`, "must be finite and strictly positive");
    const next = sum + weight;
    if (!Number.isFinite(next)) reject("TRAJECTORY_NUMERIC_OVERFLOW", "trajectory.computation.weightSum", "is outside the finite numeric range");
    return next;
  }, 0);
  return Array.from({ length: dimensions }, (_, index) => {
    let sum = 0;
    let correction = 0;
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const scaled = rows[rowIndex]![index]! * (weights[rowIndex]! / weightSum);
      const next = sum + scaled;
      if (!Number.isFinite(next)) reject("TRAJECTORY_NUMERIC_OVERFLOW", `trajectory.computation.weightedMean[${index}]`, "centroid accumulation is outside the finite numeric range");
      correction += Math.abs(sum) >= Math.abs(scaled) ? (sum - next) + scaled : (scaled - next) + sum;
      if (!Number.isFinite(correction)) reject("TRAJECTORY_NUMERIC_OVERFLOW", `trajectory.computation.weightedMean[${index}]`, "centroid correction is outside the finite numeric range");
      sum = next;
    }
    const result = sum + correction;
    if (!Number.isFinite(result)) reject("TRAJECTORY_NUMERIC_OVERFLOW", `trajectory.computation.weightedMean[${index}]`, "centroid is outside the finite numeric range");
    return result;
  });
}

function participantCentroid(
  rows: TrajectoryParticipantPeriod[],
  coordinates: (row: TrajectoryParticipantPeriod) => number[],
  dimensions: number,
  estimand: NormalizedSeries["estimand"],
): number[] | null {
  const values = rows.map(coordinates);
  return estimand === "weighted-participant"
    ? weightedMean(values, rows.map((row) => row.participantWeight), dimensions)
    : mean(values, dimensions);
}

function reduceParticipantPeriods(series: NormalizedSeries): TrajectoryParticipantPeriod[] {
  const grouped = new Map<string, { participant: TrajectoryKey; time: TrajectoryKey; rows: typeof series.points }>();
  for (const point of series.points) {
    const key = JSON.stringify([series.namespace, point.participant.canonical, point.time.canonical]);
    const group = grouped.get(key);
    if (group) group.rows.push(point);
    else grouped.set(key, { participant: point.participant, time: point.time, rows: [point] });
  }
  const expected = new Set(series.timeOrder.map((time) => time.canonical));
  const observedByParticipant = new Map<string, Set<string>>();
  for (const group of grouped.values()) {
    const observed = observedByParticipant.get(group.participant.canonical) ?? new Set<string>();
    observed.add(group.time.canonical);
    observedByParticipant.set(group.participant.canonical, observed);
  }
  const complete = new Set([...observedByParticipant.entries()].filter(([, observed]) => [...expected].every((time) => observed.has(time))).map(([participant]) => participant));
  const timeIndex = new Map(series.timeOrder.map((time, index) => [time.canonical, index]));
  return [...grouped.values()]
    .sort((left, right) => compareCanonical(left.participant.canonical, right.participant.canonical) || timeIndex.get(left.time.canonical)! - timeIndex.get(right.time.canonical)!)
    .map((group, index) => {
      const distinctWeights = new Set(group.rows.map((row) => row.weight));
      if (distinctWeights.size !== 1) {
        reject("UNSTABLE_PARTICIPANT_PERIOD_WEIGHT", `input.participantPeriods[${index}].weight`, "must remain constant within a participant-period");
      }
      const fullCoordinates = mean(group.rows.map((row) => row.coordinates), series.dimensions.length)!;
      return {
        index,
        participant: group.participant,
        time: group.time,
        selectedCoordinates: series.selectedIndexes.map((selected) => fullCoordinates[selected]!) as [number, number, number],
        fullCoordinates,
        sourceRowIndexes: group.rows.map((row) => row.rowIndex).sort((a, b) => a - b),
        participantWeight: group.rows[0]!.weight,
        includedInCohort: series.input.cohortPolicy === "available" || complete.has(group.participant.canonical)
      };
    });
}

function distanceMetrics(
  centroids: Array<number[] | null>,
  dimensions: string[]
): TrajectoryDistanceMetrics[] {
  let continuous = true;
  let cumulative = 0;
  return centroids.map((centroid, index) => {
    if (centroid === null) {
      continuous = false;
      return { dimensions: [...dimensions], delta: null, stepDistance: null, cumulativeDistance: null };
    }
    if (index === 0) return { dimensions: [...dimensions], delta: null, stepDistance: 0, cumulativeDistance: 0 };
    const previous = centroids[index - 1];
    if (previous === null || previous === undefined) {
      continuous = false;
      return { dimensions: [...dimensions], delta: null, stepDistance: null, cumulativeDistance: null };
    }
    const delta = subtract(centroid, previous);
    const stepDistance = euclidean(delta);
    if (continuous) {
      const nextCumulative = cumulative + stepDistance;
      if (!Number.isFinite(nextCumulative)) reject("TRAJECTORY_NUMERIC_OVERFLOW", "trajectory.computation.cumulativeDistance", "cumulative path distance is outside the finite numeric range");
      cumulative = nextCumulative;
    }
    return { dimensions: [...dimensions], delta, stepDistance, cumulativeDistance: continuous ? cumulative : null };
  });
}

function analyzeNormalizedSeries(series: NormalizedSeries): TrajectoryPathStatistics {
  const participantPeriods = reduceParticipantPeriods(series);
  const periods = series.timeOrder.map((time, index) => {
    const rawRows = series.points.filter((point) => point.time.canonical === time.canonical);
    const allParticipantPeriods = participantPeriods.filter((point) => point.time.canonical === time.canonical);
    const used = allParticipantPeriods.filter((point) => point.includedInCohort);
    const fullCentroid = participantCentroid(used, (point) => point.fullCoordinates, series.dimensions.length, series.estimand);
    const selectedCentroid = fullCentroid === null ? null : series.selectedIndexes.map((selected) => fullCentroid[selected]!) as [number, number, number];
    return {
      index,
      time,
      selectedCentroid,
      fullCentroid,
      nRows: rawRows.length,
      nTotal: allParticipantPeriods.length,
      nUsed: used.length,
      nDuplicateRows: rawRows.length - allParticipantPeriods.length,
      nCohortExcluded: allParticipantPeriods.length - used.length
    };
  });
  const selectedMetrics = distanceMetrics(periods.map((period) => period.selectedCentroid), series.selectedDimensions);
  const fullMetrics = distanceMetrics(periods.map((period) => period.fullCentroid), series.dimensions);
  const outputPeriods: TrajectoryPathPeriodStatistics[] = periods.map((period, index) => ({
    ...period,
    selected3d: selectedMetrics[index]!,
    fullSpace: fullMetrics[index]!
  }));
  const participantCount = new Set(participantPeriods.map((point) => point.participant.canonical)).size;
  const duplicateRows = outputPeriods.reduce((sum, period) => sum + period.nDuplicateRows, 0);
  const diagnostics: TrajectoryStatisticsDiagnostic[] = [];
  if (duplicateRows > 0) diagnostics.push({ code: "DUPLICATE_PARTICIPANT_PERIOD_ROWS", severity: "info", message: "Duplicate rows were averaged before centroid calculation." });
  if (outputPeriods.some((period) => period.nUsed === 0)) diagnostics.push({ code: "MISSING_TRAJECTORY_PERIOD", severity: "warning", message: "At least one requested period has no usable centroid; paths do not bridge gaps." });
  if (series.input.cohortPolicy === "available") {
    const signatures = outputPeriods.map((period) => participantPeriods.filter((point) => point.includedInCohort && point.time.canonical === period.time.canonical).map((point) => point.participant.canonical).sort().join("\u0000"));
    if (new Set(signatures).size > 1) diagnostics.push({ code: "CHANGING_AVAILABLE_COHORT", severity: "warning", message: "Participant composition changes across requested periods." });
  }
  return deepFreeze({
    schemaVersion: "3dena.trajectory-path-statistics.v1",
    namespace: series.namespace,
    cohortPolicy: series.input.cohortPolicy,
    estimand: series.estimand,
    dimensions: [...series.dimensions],
    selectedDimensions: [...series.selectedDimensions],
    distanceSemantics: {
      selected3d: "euclidean-selected-three-dimensions",
      fullSpace: "euclidean-all-declared-dimensions"
    },
    participantPeriods,
    periods: outputPeriods,
    diagnostics,
    summary: {
      inputRows: series.points.length,
      participants: participantCount,
      participantPeriods: participantPeriods.length,
      periods: series.timeOrder.length,
      duplicateRows
    },
    resolvedLimits: { ...series.limits }
  });
}

function analyzeTrajectoryPath(input: TrajectorySeriesInput): TrajectoryPathStatistics {
  return analyzeNormalizedSeries(normalizeSeries(input));
}

function assertComparable(left: NormalizedSeries, right: NormalizedSeries): void {
  if (JSON.stringify(left.dimensions) !== JSON.stringify(right.dimensions)) reject("INCOMPATIBLE_TRAJECTORY_DIMENSIONS", "input.sideB.series.dimensions", "must exactly match side A order");
  if (JSON.stringify(left.selectedDimensions) !== JSON.stringify(right.selectedDimensions)) reject("INCOMPATIBLE_SELECTED_DIMENSIONS", "input.sideB.series.selectedDimensions", "must exactly match side A");
  if (JSON.stringify(left.timeOrder.map((time) => time.canonical)) !== JSON.stringify(right.timeOrder.map((time) => time.canonical))) reject("INCOMPATIBLE_TRAJECTORY_TIME", "input.sideB.series.timeOrder", "must exactly match side A typed order");
  if (left.input.cohortPolicy !== right.input.cohortPolicy) reject("INCOMPATIBLE_COHORT_POLICY", "input.sideB.series.cohortPolicy", "must match side A");
  if (left.estimand !== right.estimand) reject("INCOMPATIBLE_TRAJECTORY_ESTIMAND", "input.sideB.series.estimand", "must match side A");
}





interface ComparisonData {
  left: NormalizedSeries;
  right: NormalizedSeries;
  pathA: TrajectoryPathStatistics;
  pathB: TrajectoryPathStatistics;
  unitOrder: string[];
  sideACount: number | null;
  independentUnits?: Array<{ key: string; periods: TrajectoryParticipantPeriod[] }>;
}

function buildComparisonData(input: IndependentTrajectoryComparisonInput): ComparisonData {
  if (!input || input.design !== "independent") reject("INVALID_COMPARISON_DESIGN", "input.design", "this native numerical port supports independent paths only");
  if (typeof input.sideA?.label !== "string" || input.sideA.label.trim() === "" || typeof input.sideB?.label !== "string" || input.sideB.label.trim() === "") reject("INVALID_COMPARISON_LABEL", "input.sideA.label", "both sides require non-empty labels");
  const left = normalizeSeries(input.sideA.series);
  const right = normalizeSeries(input.sideB.series);
  assertComparable(left, right);
  const pathA = analyzeNormalizedSeries(left);
  const pathB = analyzeNormalizedSeries(right);

  if (left.namespace === right.namespace) reject("INDEPENDENT_NAMESPACE_COLLISION", "input.sideB.series.namespace", "independent sides must use distinct namespaces");
  const sideAUnits = groupParticipantPeriods(pathA.participantPeriods, left.namespace);
  const sideBUnits = groupParticipantPeriods(pathB.participantPeriods, right.namespace);
  const units = [...sideAUnits, ...sideBUnits].sort((a, b) => compareCanonical(a.key, b.key));
  return {
    left,
    right,
    pathA,
    pathB,
    unitOrder: units.map((unit) => unit.key),
    sideACount: sideAUnits.length,
    independentUnits: units
  };
}

function groupParticipantPeriods(rows: TrajectoryParticipantPeriod[], namespace: string): Array<{ key: string; periods: TrajectoryParticipantPeriod[] }> {
  const groups = new Map<string, TrajectoryParticipantPeriod[]>();
  for (const row of rows.filter((entry) => entry.includedInCohort)) {
    const key = JSON.stringify([namespace, row.participant.canonical]);
    const current = groups.get(key) ?? [];
    current.push(row);
    groups.set(key, current);
  }
  return [...groups.entries()].map(([key, periods]) => ({ key, periods }));
}

export function getTrajectoryPermutationUnits(input: IndependentTrajectoryComparisonInput): TrajectoryPermutationUnits {
  const data = buildComparisonData(input);
  return { design: input.design, unitOrder: [...data.unitOrder], sideACount: data.sideACount };
}

interface CentroidPairRow {
  time: TrajectoryKey;
  selectedA: number[] | null;
  selectedB: number[] | null;
  fullA: number[] | null;
  fullB: number[] | null;
  nA: number;
  nB: number;
  nMatched: number | null;
}

function baseCentroidRows(data: ComparisonData, design: "independent"): CentroidPairRow[] {

  return data.left.timeOrder.map((time) => {
    const a = data.pathA.participantPeriods.filter((row) => row.includedInCohort && row.time.canonical === time.canonical);
    const b = data.pathB.participantPeriods.filter((row) => row.includedInCohort && row.time.canonical === time.canonical);
    return {
      time,
      selectedA: participantCentroid(a, (row) => row.selectedCoordinates, 3, data.left.estimand),
      selectedB: participantCentroid(b, (row) => row.selectedCoordinates, 3, data.right.estimand),
      fullA: participantCentroid(a, (row) => row.fullCoordinates, data.left.dimensions.length, data.left.estimand),
      fullB: participantCentroid(b, (row) => row.fullCoordinates, data.left.dimensions.length, data.right.estimand),
      nA: a.length,
      nB: b.length,
      nMatched: null
    };
  });
}

function comparisonPeriods(rows: CentroidPairRow[]): TrajectoryComparisonPeriod[] {
  const selectedStepA = distanceMetrics(rows.map((row) => row.selectedA), ["x", "y", "z"]);
  const selectedStepB = distanceMetrics(rows.map((row) => row.selectedB), ["x", "y", "z"]);
  const fullStepA = distanceMetrics(rows.map((row) => row.fullA), []);
  const fullStepB = distanceMetrics(rows.map((row) => row.fullB), []);
  return rows.map((row, index) => {
    const selectedDifference = row.selectedA && row.selectedB ? subtract(row.selectedB, row.selectedA) as [number, number, number] : null;
    const fullDifference = row.fullA && row.fullB ? subtract(row.fullB, row.fullA) : null;
    const selectedA = selectedStepA[index]!.stepDistance;
    const selectedB = selectedStepB[index]!.stepDistance;
    const selectedCumulativeA = selectedStepA[index]!.cumulativeDistance;
    const selectedCumulativeB = selectedStepB[index]!.cumulativeDistance;
    const fullA = fullStepA[index]!.stepDistance;
    const fullB = fullStepB[index]!.stepDistance;
    const fullCumulativeA = fullStepA[index]!.cumulativeDistance;
    const fullCumulativeB = fullStepB[index]!.cumulativeDistance;
    return {
      index,
      time: row.time,
      selectedCentroidA: row.selectedA as [number, number, number] | null,
      selectedCentroidB: row.selectedB as [number, number, number] | null,
      selectedDifference,
      fullCentroidA: row.fullA,
      fullCentroidB: row.fullB,
      fullDifference,
      selectedCentroidSeparation: selectedDifference ? euclidean(selectedDifference) : null,
      fullCentroidSeparation: fullDifference ? euclidean(fullDifference) : null,
      selectedStepDistanceA: selectedA,
      selectedStepDistanceB: selectedB,
      selectedStepDistanceDifference: selectedA !== null && selectedB !== null ? scalarDifference(selectedB, selectedA, `comparison.periods[${index}].selectedStepDistanceDifference`) : null,
      selectedCumulativeDistanceA: selectedCumulativeA,
      selectedCumulativeDistanceB: selectedCumulativeB,
      selectedCumulativeDistanceDifference: selectedCumulativeA !== null && selectedCumulativeB !== null ? scalarDifference(selectedCumulativeB, selectedCumulativeA, `comparison.periods[${index}].selectedCumulativeDistanceDifference`) : null,
      fullStepDistanceA: fullA,
      fullStepDistanceB: fullB,
      fullStepDistanceDifference: fullA !== null && fullB !== null ? scalarDifference(fullB, fullA, `comparison.periods[${index}].fullStepDistanceDifference`) : null,
      fullCumulativeDistanceA: fullCumulativeA,
      fullCumulativeDistanceB: fullCumulativeB,
      fullCumulativeDistanceDifference: fullCumulativeA !== null && fullCumulativeB !== null ? scalarDifference(fullCumulativeB, fullCumulativeA, `comparison.periods[${index}].fullCumulativeDistanceDifference`) : null,
      nAUsed: row.nA,
      nBUsed: row.nB,
      nMatched: row.nMatched
    };
  });
}

interface MetricDescriptor {
  id: string;
  timeIndex: number;
  metric: string;
  distanceSpace: "selected-3d" | "full-space" | null;
  tail: "two-sided" | "upper";
  observed: number;
}

function metricDescriptors(periods: TrajectoryComparisonPeriod[], selectedDimensions: [string, string, string]): MetricDescriptor[] {
  const output: MetricDescriptor[] = [];
  for (const period of periods) {
    period.selectedDifference?.forEach((value, dimensionIndex) => output.push({
      id: `t${period.index}:coordinate:${selectedDimensions[dimensionIndex]}`,
      timeIndex: period.index,
      metric: `coordinate:${selectedDimensions[dimensionIndex]}`,
      distanceSpace: null,
      tail: "two-sided",
      observed: value
    }));
    if (period.selectedCentroidSeparation !== null) output.push({ id: `t${period.index}:centroid-separation:selected`, timeIndex: period.index, metric: "centroid-separation", distanceSpace: "selected-3d", tail: "upper", observed: period.selectedCentroidSeparation });
    if (period.fullCentroidSeparation !== null) output.push({ id: `t${period.index}:centroid-separation:full`, timeIndex: period.index, metric: "centroid-separation", distanceSpace: "full-space", tail: "upper", observed: period.fullCentroidSeparation });
    if (period.index > 0 && period.selectedStepDistanceDifference !== null) output.push({ id: `t${period.index}:step-distance:selected`, timeIndex: period.index, metric: "step-distance-difference", distanceSpace: "selected-3d", tail: "two-sided", observed: period.selectedStepDistanceDifference });
    if (period.index > 0 && period.fullStepDistanceDifference !== null) output.push({ id: `t${period.index}:step-distance:full`, timeIndex: period.index, metric: "step-distance-difference", distanceSpace: "full-space", tail: "two-sided", observed: period.fullStepDistanceDifference });
    if (period.index > 0 && period.selectedCumulativeDistanceDifference !== null) output.push({ id: `t${period.index}:cumulative-distance:selected`, timeIndex: period.index, metric: "cumulative-distance-difference", distanceSpace: "selected-3d", tail: "two-sided", observed: period.selectedCumulativeDistanceDifference });
    if (period.index > 0 && period.fullCumulativeDistanceDifference !== null) output.push({ id: `t${period.index}:cumulative-distance:full`, timeIndex: period.index, metric: "cumulative-distance-difference", distanceSpace: "full-space", tail: "two-sided", observed: period.fullCumulativeDistanceDifference });
  }
  return output;
}

function metricMap(periods: TrajectoryComparisonPeriod[], selectedDimensions: [string, string, string]): Map<string, number> {
  return new Map(metricDescriptors(periods, selectedDimensions).map((metric) => [metric.id, metric.observed]));
}

function validateUnitOrder(actual: string[], expected: string[], path: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) reject("PERMUTATION_UNIT_ORDER_MISMATCH", path, "must exactly match getTrajectoryPermutationUnits()");
}

function validateIndexList(indexes: number[], size: number, path: string, requirePermutation: boolean): void {
  if (!Array.isArray(indexes) || indexes.some((index) => !Number.isSafeInteger(index) || index < 0 || index >= size)) reject("INVALID_PERMUTATION_INDEX", path, `indexes must be safe integers in [0, ${size})`);
  if (new Set(indexes).size !== indexes.length) reject("DUPLICATE_PERMUTATION_INDEX", path, "must not repeat indexes");
  if (requirePermutation && indexes.length !== size) reject("INCOMPLETE_PERMUTATION", path, "must contain every unit index exactly once");
}

function permutedCentroidRows(data: ComparisonData, input: IndependentTrajectoryComparisonInput, replicate: number[]): CentroidPairRow[] {

  const aIndexes = new Set(replicate.slice(0, data.sideACount!));
  const sideA = data.independentUnits!.filter((_, index) => aIndexes.has(index)).flatMap((unit) => unit.periods);
  const sideB = data.independentUnits!.filter((_, index) => !aIndexes.has(index)).flatMap((unit) => unit.periods);
  return data.left.timeOrder.map((time) => {
    const a = sideA.filter((row) => row.time.canonical === time.canonical);
    const b = sideB.filter((row) => row.time.canonical === time.canonical);
    return {
      time,
      selectedA: participantCentroid(a, (row) => row.selectedCoordinates, 3, data.left.estimand),
      selectedB: participantCentroid(b, (row) => row.selectedCoordinates, 3, data.right.estimand),
      fullA: participantCentroid(a, (row) => row.fullCoordinates, data.left.dimensions.length, data.left.estimand),
      fullB: participantCentroid(b, (row) => row.fullCoordinates, data.left.dimensions.length, data.right.estimand),
      nA: a.length,
      nB: b.length,
      nMatched: null,
    };
  });
}

export function holmAdjust(pValues: number[]): number[] {
  pValues.forEach((value, index) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) reject("INVALID_P_VALUE", `pValues[${index}]`, "must be finite in [0, 1]");
  });
  const ordered = pValues.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value || a.index - b.index);
  const adjusted = Array.from({ length: pValues.length }, () => 0);
  let running = 0;
  ordered.forEach((entry, rank) => {
    running = Math.max(running, Math.min(1, entry.value * (pValues.length - rank)));
    adjusted[entry.index] = running;
  });
  return adjusted;
}

/** Conservative additional live scratch for common-frame rows, time indexes,
 * and exact original/current-allocation caches. Includes weighted binary64
 * integer widths; no cache is retained across candidate allocations. */
export function trajectoryPermutationScratchBytes(points: number, dimensions: number, periods: number, tests: number): number {
  return points * ((dimensions + 3) * 16 + 128) + periods * dimensions * 4096 + tests * 8192;
}

/** One common midpoint per coordinate, across both groups and all periods.
 * Translating before centroid arithmetic removes an irrelevant large origin
 * without removing real movement between periods. Midpoints cannot overflow. */
function translatedComparisonData(original: ComparisonData): { data: ComparisonData; origin: number[] } {
  const dimensions = original.left.dimensions.length;
  const minimum = Array<number>(dimensions).fill(Infinity), maximum = Array<number>(dimensions).fill(-Infinity);
  for (const unit of original.independentUnits!) for (const row of unit.periods) row.fullCoordinates.forEach((value, i) => {
    minimum[i] = Math.min(minimum[i]!, value); maximum[i] = Math.max(maximum[i]!, value);
  });
  const origin = minimum.map((value, i) => Number.isFinite(value) ? value / 2 + maximum[i]! / 2 : 0);
  const translated = new Map<TrajectoryParticipantPeriod, TrajectoryParticipantPeriod>();
  const row = (point: TrajectoryParticipantPeriod) => {
    if (!point.includedInCohort) return point;
    let value = translated.get(point);
    if (!value) {
      const fullCoordinates = subtract(point.fullCoordinates, origin);
      value = { ...point, fullCoordinates, selectedCoordinates: original.left.selectedIndexes.map(i => fullCoordinates[i]!) as [number, number, number] };
      translated.set(point, value);
    }
    return value;
  };
  const path = (input: TrajectoryPathStatistics) => {
    const participantPeriods = input.participantPeriods.map(row);
    const periods = input.periods.map(period => {
      const used = participantPeriods.filter(p => p.includedInCohort && p.time.canonical === period.time.canonical);
      const fullCentroid = participantCentroid(used, p => p.fullCoordinates, dimensions, input.estimand);
      return { ...period, fullCentroid, selectedCentroid: fullCentroid === null ? null : original.left.selectedIndexes.map(i => fullCentroid[i]!) as [number, number, number] };
    });
    const selected = distanceMetrics(periods.map(p => p.selectedCentroid), input.selectedDimensions);
    const full = distanceMetrics(periods.map(p => p.fullCentroid), input.dimensions);
    return { ...input, participantPeriods, periods: periods.map((p, i) => ({ ...p, selected3d: selected[i]!, fullSpace: full[i]! })) };
  };
  return { origin, data: { ...original, pathA: path(original.pathA), pathB: path(original.pathB),
    independentUnits: original.independentUnits!.map(unit => ({ ...unit, periods: unit.periods.map(row) })) } };
}

/** Exact dyadic means and squared norms, with bounded root intervals.
 * Observed statistics are resolved once; candidate work is adaptive.
 * Every finite double is an integer multiple of 2^-1074. The common factor
 * cancels from comparisons, including weighted ratios; no rounding threshold
 * can turn an exactly distinct coordinate contrast into a tie. */
function exactMetricTail(data: ComparisonData) {
  const zero = BigInt(0), one = BigInt(1), extraBits = BigInt(128);
  const buffer = new DataView(new ArrayBuffer(8));
  const integer = (value: number) => {
    buffer.setFloat64(0, value);
    const bits = buffer.getBigUint64(0), exponent = Number((bits >> BigInt(52)) & BigInt(2047));
    const fraction = bits & ((BigInt(1) << BigInt(52)) - BigInt(1));
    const magnitude = exponent === 0 ? fraction : ((BigInt(1) << BigInt(52)) | fraction) << BigInt(exponent - 1);
    return bits >> BigInt(63) ? -magnitude : magnitude;
  };
  const originalA = new Set(data.pathA.participantPeriods.filter(p => p.includedInCohort).map(p => JSON.stringify([data.left.namespace, p.participant.canonical])));
  const originalIndexes = new Set(data.unitOrder.flatMap((key, i) => originalA.has(key) ? [i] : []));
  const pointsByTime = data.independentUnits!.map(unit => new Map(unit.periods.map(point => [point.time.canonical, point])));
  interface ExactMeans { sumA: bigint[]; sumB: bigint[]; weightA: bigint; weightB: bigint }
  interface ExactStep { low: bigint; high: bigint; cumulativeLow: bigint; cumulativeHigh: bigint }
  interface ExactScore { numerator: bigint; denominator: bigint; low: bigint; high: bigint; value: number }
  const cache = () => ({ means: new Map<number, ExactMeans>(), steps: new Map<string, ExactStep[]>(), scores: new Map<string, ExactScore>() });
  const sqrtFloor = (n: bigint) => {
    if (n < BigInt(2)) return n;
    let root = one << BigInt(Math.ceil(n.toString(2).length / 2));
    for (;;) { const next = (root + n / root) >> one; if (next >= root) return root; root = next; }
  };
  const sqrtInterval = (numerator: bigint, denominator: bigint) => {
    const scaled = numerator << (BigInt(2) * extraBits), root = sqrtFloor(scaled / denominator);
    return { low: root, high: root * root * denominator === scaled ? root : root + one };
  };
  const asNumber = (value: bigint) => {
    const negative = value < zero, magnitude = negative ? -value : value;
    const shift = Math.max(0, magnitude.toString(2).length - 1022);
    const exponent = shift - 1074 - Number(extraBits), first = Math.max(-1022, exponent);
    return (negative ? -1 : 1) * (Number(magnitude >> BigInt(shift)) * 2 ** first) * 2 ** (exponent - first);
  };
  const contrast = (metric: MetricDescriptor, sideA: Set<number>, computed: ReturnType<typeof cache>): ExactScore => {
    const cached = computed.scores.get(metric.id);
    if (cached) return cached;
    const save = (score: ExactScore) => { computed.scores.set(metric.id, score); return score; };
    const axes = metric.distanceSpace === null ? [data.left.dimensions.indexOf(metric.metric.slice("coordinate:".length))]
      : metric.distanceSpace === "selected-3d" ? data.left.selectedIndexes : data.left.dimensions.map((_, i) => i);
    const means = (timeIndex: number) => {
      let full = computed.means.get(timeIndex);
      if (!full) {
      const time = data.left.timeOrder[timeIndex]!.canonical;
      const sumA = data.left.dimensions.map(() => zero), sumB = data.left.dimensions.map(() => zero);
      let weightA = zero, weightB = zero;
      pointsByTime.forEach((points, index) => {
        const point = points.get(time);
        if (!point) return;
        const weight = data.left.estimand === "weighted-participant" ? integer(point.participantWeight) : one;
        const sums = sideA.has(index) ? sumA : sumB;
        point.fullCoordinates.forEach((value, i) => { sums[i]! += integer(value) * weight; });
        if (sideA.has(index)) weightA += weight; else weightB += weight;
      });
      full = { sumA, sumB, weightA, weightB };
      computed.means.set(timeIndex, full);
      }
      return { ...full, sumA: axes.map(i => full!.sumA[i]!), sumB: axes.map(i => full!.sumB[i]!) };
    };
    if (metric.metric === "step-distance-difference" || metric.metric === "cumulative-distance-difference") {
      const steps = computed.steps.get(metric.distanceSpace!) ?? [{ low: zero, high: zero, cumulativeLow: zero, cumulativeHigh: zero }];
      computed.steps.set(metric.distanceSpace!, steps);
      for (let time = steps.length; time <= metric.timeIndex; time++) {
        let low = zero, high = zero;
        const previous = means(time - 1);
        const current = means(time);
        // A missing early period invalidates cumulative distance, but must not
        // prevent a later adjacent step. Float metric admission preserves nulls.
        if (previous.weightA === zero || previous.weightB === zero || current.weightA === zero || current.weightB === zero) {
          steps.push({ low: zero, high: zero, cumulativeLow: zero, cumulativeHigh: zero });
          continue;
        }
        const norm = (now: bigint[], before: bigint[], nowWeight: bigint, beforeWeight: bigint) => ({
          numerator: now.reduce((sum, value, i) => { const delta = value * beforeWeight - before[i]! * nowWeight; return sum + delta * delta; }, zero),
          denominator: (nowWeight * beforeWeight) ** BigInt(2),
        });
        const a = norm(current.sumA, previous.sumA, current.weightA, previous.weightA);
        const b = norm(current.sumB, previous.sumB, current.weightB, previous.weightB);
        // Equal rational squared norms have exactly equal roots, even when
        // irrational. Preserve that identity before subtracting intervals.
        if (a.numerator * b.denominator !== b.numerator * a.denominator) {
          const ai = sqrtInterval(a.numerator, a.denominator), bi = sqrtInterval(b.numerator, b.denominator);
          low += bi.low - ai.high; high += bi.high - ai.low;
        }
        steps.push({ low, high, cumulativeLow: steps[time - 1]!.cumulativeLow + low, cumulativeHigh: steps[time - 1]!.cumulativeHigh + high });
      }
      const step = steps[metric.timeIndex]!;
      const low = metric.metric === "step-distance-difference" ? step.low : step.cumulativeLow;
      const high = metric.metric === "step-distance-difference" ? step.high : step.cumulativeHigh;
      const absoluteLow = low <= zero && high >= zero ? zero : (low < zero ? -high : low);
      const absoluteHigh = (low < zero ? -low : low) > (high < zero ? -high : high) ? (low < zero ? -low : low) : (high < zero ? -high : high);
      return save({ numerator: zero, denominator: one, low: absoluteLow, high: absoluteHigh, value: asNumber((low + high) / BigInt(2)) });
    }
    const { sumA, sumB, weightA, weightB } = means(metric.timeIndex);
    const differences = axes.map((_, i) => sumB[i]! * weightA - sumA[i]! * weightB);
    const denominator = weightA * weightB;
    if (metric.distanceSpace === null) return save({ numerator: differences[0]! < zero ? -differences[0]! : differences[0]!, denominator,
      low: zero, high: zero, value: asNumber((differences[0]! << extraBits) / denominator) });
    const numerator = differences.reduce((sum, value) => sum + value * value, zero), squaredDenominator = denominator * denominator;
    return save({ numerator, denominator: squaredDenominator, low: zero, high: zero, value: asNumber(sqrtInterval(numerator, squaredDenominator).low) });
  };
  const observed = cache();
  let priorReplicate: number[] | undefined, candidateCache = cache(), candidateIndexes = new Set<number>();
  return { observed: (metric: MetricDescriptor) => contrast(metric, originalIndexes, observed).value,
    compare: (metric: MetricDescriptor, replicate: number[]) => {
    if (replicate !== priorReplicate) { priorReplicate = replicate; candidateCache = cache(); candidateIndexes = new Set(replicate.slice(0, data.sideACount!)); }
    const target = contrast(metric, originalIndexes, observed);
    const isPath = metric.metric === "step-distance-difference" || metric.metric === "cumulative-distance-difference";
    if (isPath ? target.low === zero && target.high === zero : target.numerator === zero) return { extreme: true, observed: target.value };
    const candidate = contrast(metric, candidateIndexes, candidateCache);
    if (metric.metric === "step-distance-difference" || metric.metric === "cumulative-distance-difference") {
      return { extreme: candidate.high >= target.low, observed: target.value };
    }
    const left = candidate.numerator * target.denominator, right = target.numerator * candidate.denominator;
    if (left >= right) return { extreme: true, observed: target.value };
    if (metric.distanceSpace === null) return { extreme: false, observed: target.value };
    // Exact squared norms remove cancellation/mean/norm arithmetic errors.
    // A relative allowance remains for fitted-rotation precision; it scales
    // with the actual separation, never with an unrelated origin or scatter.
    const dimensions = metric.distanceSpace === "selected-3d" ? 3 : data.left.dimensions.length;
    return { extreme: ((right - left) << BigInt(52)) <= BigInt(32 + 4 * dimensions) * right, observed: target.value };
  } };
}

/** Comparison-only forward-roundoff allowance, in the metric's own units.
 * Compensated means still round their per-row divisions and final subtraction.
 * Use the contributing coordinates, not a cancelled near-zero statistic, as
 * the scale. No absolute floor or unrelated dimension affects coordinate tests.
 * See the versioned policy for the operation budgets and unchanged estimands. */
function permutationRoundoffAllowances(data: ComparisonData, metrics: MetricDescriptor[]): number[] {
  const dimensionCount = data.left.dimensions.length;
  const scales = data.left.timeOrder.map(() => Array<number>(dimensionCount).fill(0));
  const timeIndexes = new Map(data.left.timeOrder.map((time, index) => [time.canonical, index]));
  for (const path of [data.pathA, data.pathB]) for (const row of path.participantPeriods) {
    if (!row.includedInCohort) continue;
    const scale = scales[timeIndexes.get(row.time.canonical)!]!;
    row.fullCoordinates.forEach((value, index) => { scale[index] = Math.max(scale[index]!, Math.abs(value)); });
  }
  // Equal-participant means use compensated summation. Weighted means also
  // have a sequential weight denominator, whose error grows with pool size.
  const meanOperations = 32 + (data.left.estimand === "weighted-participant" ? 2 * data.unitOrder.length : 0);
  const coordinateErrors = scales.map(scale => scale.map(value => value * (meanOperations * Number.EPSILON)));
  const distances = (indexes: number[]) => {
    // Scale before hypot: a finite error allowance must not overflow merely
    // because the unscaled coordinate norm exceeds the representable range.
    const errors = scales.map(scale => Math.hypot(...indexes.map(index => scale[index]! * ((meanOperations + 4 * indexes.length) * Number.EPSILON))));
    let cumulative = 0;
    return errors.map((separation, time) => {
      const step = time === 0 ? 0 : 2 * (separation + errors[time - 1]!);
      cumulative += step;
      return { separation, step, cumulative: cumulative * (time + 1) };
    });
  };
  const selected = distances(data.left.selectedIndexes), full = distances(Array.from({ length: dimensionCount }, (_, i) => i));
  return metrics.map(metric => {
    if (metric.distanceSpace === null) {
      const axis = data.left.dimensions.indexOf(metric.metric.slice("coordinate:".length));
      return coordinateErrors[metric.timeIndex]![axis]!;
    }
    const error = (metric.distanceSpace === "selected-3d" ? selected : full)[metric.timeIndex]!;
    const allowance = metric.metric === "centroid-separation" ? error.separation
      : metric.metric === "step-distance-difference" ? error.step : error.cumulative;
    if (!Number.isFinite(allowance)) reject("TRAJECTORY_NUMERIC_OVERFLOW", "comparison.roundoffAllowance", "permutation comparison uncertainty exceeds the finite numeric range");
    return allowance;
  });
}

function permutationTests(data: ComparisonData, input: IndependentTrajectoryComparisonInput, observedPeriods: TrajectoryComparisonPeriod[], original: ComparisonData): TrajectoryPermutationTest[] {
  const plan = input.permutationPlan;
  if (!plan) return [];
  validateUnitOrder(plan.unitOrder, data.unitOrder, "input.permutationPlan.unitOrder");
  const limit = Math.min(data.left.limits.maxResamples, data.right.limits.maxResamples);
  if (!Array.isArray(plan.replicates) || plan.replicates.length === 0 || plan.replicates.length > limit) reject("INVALID_PERMUTATION_PLAN", "input.permutationPlan.replicates", `must contain 1..${limit} replicates`);
  if (input.design === "independent" && plan.kind !== "independent-pool-indices-v1") reject("PERMUTATION_DESIGN_MISMATCH", "input.permutationPlan.kind", "independent comparison requires independent-pool-indices-v1");
  plan.replicates.forEach((replicate, index) => validateIndexList(replicate, data.unitOrder.length, `input.permutationPlan.replicates[${index}]`, input.design === "independent"));
  const observed = metricDescriptors(observedPeriods, data.left.selectedDimensions);
  if (observed.length > Math.min(data.left.limits.maxTests, data.right.limits.maxTests)) reject("TRAJECTORY_TEST_LIMIT", "comparison.tests", "exceeds configured maxTests");
  const roundoff = permutationRoundoffAllowances(data, observed);
  const exactTail = exactMetricTail(original);
  // Fix every threshold before looking at the first replicate. This also
  // makes the exported observed statistic independent of permutation order.
  for (const metric of observed) {
    metric.observed = exactTail.observed(metric);
    const period = observedPeriods[metric.timeIndex]!;
    if (metric.distanceSpace === null) {
      const axis = metric.metric.slice("coordinate:".length);
      period.selectedDifference![data.left.selectedDimensions.indexOf(axis)] = metric.observed;
      period.fullDifference![data.left.dimensions.indexOf(axis)] = metric.observed;
    } else if (metric.metric === "centroid-separation") {
      if (metric.distanceSpace === "selected-3d") period.selectedCentroidSeparation = metric.observed;
      else period.fullCentroidSeparation = metric.observed;
    } else if (metric.metric === "step-distance-difference") {
      if (metric.distanceSpace === "selected-3d") period.selectedStepDistanceDifference = metric.observed;
      else period.fullStepDistanceDifference = metric.observed;
    } else {
      if (metric.distanceSpace === "selected-3d") period.selectedCumulativeDistanceDifference = metric.observed;
      else period.fullCumulativeDistanceDifference = metric.observed;
    }
  }
  const counts = observed.map(() => 0), extreme = observed.map(() => 0);
  for (const replicate of plan.replicates) {
    const map = metricMap(comparisonPeriods(permutedCentroidRows(data, input, replicate)), data.left.selectedDimensions);
    observed.forEach((metric, index) => {
      const value = map.get(metric.id);
      if (value === undefined || !Number.isFinite(value)) return;
      counts[index]! += 1;
      const threshold = metric.tail === "upper" ? metric.observed : Math.abs(metric.observed);
      const score = metric.tail === "upper" ? value : Math.abs(value);
      // A subnormal relative-error bound cannot cover absolute underflow
      // rounding. Use exact arithmetic in that regime; this is a dispatch
      // decision, not an absolute statistical tie tolerance.
      const ambiguous = roundoff[index]! < 2 ** -1022
        || Math.abs(threshold - score) <= roundoff[index]!;
      if (ambiguous ? exactTail.compare(metric, replicate).extreme : score >= threshold) extreme[index]! += 1;
    });
  }
  const raw = observed.map((_, index) => (1 + extreme[index]!) / (1 + counts[index]!));
  const adjusted = holmAdjust(raw);
  return observed.map((metric, index) => ({
    ...metric,
    pValue: raw[index]!,
    holmAdjustedPValue: adjusted[index]!,
    permutationCount: counts[index]!
  }));
}

export function compareTrajectoryPaths(input: IndependentTrajectoryComparisonInput): TrajectoryComparisonResult {
  const original = buildComparisonData(input);
  const points = original.independentUnits!.reduce((count, unit) => count + unit.periods.length, 0);
  const scratchBytes = trajectoryPermutationScratchBytes(points, original.left.dimensions.length, original.left.timeOrder.length, 9 * original.left.timeOrder.length - 4);
  if (scratchBytes > 64 * 1024 * 1024) reject("TRAJECTORY_BYTE_LIMIT", "comparison.scratch", "comparison scratch exceeds 64 MiB");
  const { data, origin } = translatedComparisonData(original);
  const rows = baseCentroidRows(data, input.design);
  const periods = comparisonPeriods(rows);
  const tests = permutationTests(data, input, periods, original);
  const restore = (values: number[] | null, selected = false) => values === null ? null : values.map((value, i) => value + origin[selected ? data.left.selectedIndexes[i]! : i]!);
  const restorePath = (path: TrajectoryPathStatistics, prior: TrajectoryPathStatistics) => ({ ...path, participantPeriods: prior.participantPeriods,
    periods: path.periods.map(p => ({ ...p, fullCentroid: restore(p.fullCentroid), selectedCentroid: restore(p.selectedCentroid, true) as [number, number, number] | null })) });
  const diagnostics: TrajectoryStatisticsDiagnostic[] = [];
  if (periods.some((period) => period.nAUsed < 2 || period.nBUsed < 2)) diagnostics.push({ code: "DEGENERATE_COMPARISON_GROUP", severity: "warning", message: "At least one comparison slice has fewer than two participant clusters." });
  if (!input.permutationPlan) diagnostics.push({ code: "PERMUTATION_NOT_REQUESTED", severity: "info", message: "No p-values were computed because no caller-bound permutation plan was supplied." });
  return deepFreeze({
    schemaVersion: "3dena.trajectory-comparison.v1",
    design: input.design,
    direction: "B-minus-A",
    pairedId: null,
    sideA: restorePath(data.pathA, original.pathA),
    sideB: restorePath(data.pathB, original.pathB),
    periods: periods.map(p => ({ ...p, fullCentroidA: restore(p.fullCentroidA), fullCentroidB: restore(p.fullCentroidB),
      selectedCentroidA: restore(p.selectedCentroidA, true) as [number, number, number] | null,
      selectedCentroidB: restore(p.selectedCentroidB, true) as [number, number, number] | null })),
    tests,
    permutation: {
      status: input.permutationPlan ? "complete" : "not-requested",
      planKind: input.permutationPlan?.kind ?? null,
      unitOrder: [...data.unitOrder],
      replicateCount: input.permutationPlan?.replicates.length ?? 0,
      rngParityClaim: false
    },
    diagnostics
  });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
