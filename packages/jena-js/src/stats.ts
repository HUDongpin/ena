/*
 * Derived from rENA 0.3.1 (GPL-3), (c) the rENA authors: Cody L Marquart,
 * Zachari Swiecki, Wesley Collier, Brendan Eagan, Roman Woodward, and
 * David Williamson Shaffer. This file ports fun_cohens.d (R/cohens.d.R) and
 * ena.correlations (R/ena.correlations.R).
 * TypeScript translation and modifications for jena-js, GPL-3.0-only.
 * See PROVENANCE.md for the upstream NOTICE and version pin.
 */
import type { ENASet, Row, Scalar } from './types.js';
import { cohensD as coreCohensD, combineScaledDeviations, l2Norm, meanColumns, pearsonCorrelation, sampleDeviation, scaledMeanDifference, scaledSampleDeviation, statisticalScale, statisticInUnits } from './core/matrix.js';

export interface DimensionCorrelation {
  dimension: string;
  pearson: number;
  spearman: number;
  pearsonLower: number;
  pearsonUpper: number;
}

export interface GroupSummaryRow {
  group: string;
  n: number;
  means: Record<string, number>;
}

export interface DimensionSummaryRow {
  dimension: string;
  n: number;
  mean: number;
  sd: number;
  variance: number;
  min: number;
  max: number;
}

export interface StatTestRow {
  dimension: string;
  test: 'welch-t' | 'one-way-anova';
  groups: string[];
  statistic: number;
  df?: number;
  dfBetween?: number;
  dfWithin?: number;
}

export interface ENAStatsOptions {
  dims?: Array<number | string>;
  by?: string;
  confLevel?: number;
}

export interface ENAStatsResult {
  dimensions: DimensionSummaryRow[];
  correlations: DimensionCorrelation[];
  groups?: GroupSummaryRow[];
  tests?: StatTestRow[];
}

function dimensionNames(set: ENASet, dims?: Array<number | string>): string[] {
  if (!dims) return set.rotation.rotationColumns.slice(0, 2);
  return dims.map((dim) => (typeof dim === 'number'
    ? set.rotation.rotationColumns[dim - 1] ?? `Dimension${dim}`
    : dim));
}

function values(rows: Row[], column: string): number[] {
  return rows.map((row) => {
    const value = Number(row[column] ?? 0);
    return Number.isFinite(value) ? value : 0;
  });
}

// Stable LSD radix argsort over the IEEE-754 bit patterns (sign-flipped so
// unsigned order equals numeric order): four 16-bit passes, O(n) total. The
// pairwise-difference vectors reach millions of entries for large unit
// counts, where comparator sorts and per-element binary searches dominated
// the correlations budget (advisory F-013 hot spot).
function argsortFloat64(values: Float64Array): Uint32Array {
  const n = values.length;
  const copy = new Float64Array(values);
  const bits = new Uint32Array(copy.buffer);
  // Monotone map to unsigned: negative -> flip all bits, positive -> flip sign.
  for (let i = 0; i < n; i += 1) {
    const hi = bits[2 * i + 1]!;
    if (hi & 0x80000000) {
      bits[2 * i] = ~bits[2 * i]!;
      bits[2 * i + 1] = ~hi;
    } else {
      bits[2 * i + 1] = hi ^ 0x80000000;
    }
  }
  let keyLo = new Uint32Array(n);
  let keyHi = new Uint32Array(n);
  for (let i = 0; i < n; i += 1) {
    keyLo[i] = bits[2 * i]!;
    keyHi[i] = bits[2 * i + 1]!;
  }
  let index = new Uint32Array(n);
  for (let i = 0; i < n; i += 1) index[i] = i;
  let outLo = new Uint32Array(n);
  let outHi = new Uint32Array(n);
  let outIndex = new Uint32Array(n);
  const counts = new Uint32Array(65536);

  for (let pass = 0; pass < 4; pass += 1) {
    const useHi = pass >= 2;
    const shift = (pass % 2) * 16;
    counts.fill(0);
    const source = useHi ? keyHi : keyLo;
    for (let i = 0; i < n; i += 1) {
      const digit = (source[i]! >>> shift) & 0xffff;
      counts[digit] = counts[digit]! + 1;
    }
    let total = 0;
    for (let d = 0; d < 65536; d += 1) {
      const count = counts[d]!;
      counts[d] = total;
      total += count;
    }
    for (let i = 0; i < n; i += 1) {
      const digit = (source[i]! >>> shift) & 0xffff;
      const target = counts[digit]!;
      counts[digit] = target + 1;
      outLo[target] = keyLo[i]!;
      outHi[target] = keyHi[i]!;
      outIndex[target] = index[i]!;
    }
    [keyLo, outLo] = [outLo, keyLo];
    [keyHi, outHi] = [outHi, keyHi];
    [index, outIndex] = [outIndex, index];
  }
  return index;
}

// Average ranks with ties: argsort once, then a single pass assigning the
// average 1-based rank to each run of equal values.
function ranksTyped(input: Float64Array, overflowDifferences?: Float64Array): Float64Array {
  const n = input.length;
  const order = argsortFloat64(input);
  if (overflowDifferences) {
    // Only unrepresentable differences need a second ordering key. Finite
    // differences, including subnormals, keep their original values and ties.
    let start = 0;
    while (start < n) {
      let end = start + 1;
      const value = input[order[start]!]!;
      while (end < n && input[order[end]!] === value) end += 1;
      if (!Number.isFinite(value)) order.subarray(start, end).sort((left, right) => overflowDifferences[left]! - overflowDifferences[right]!);
      start = end;
    }
  }
  const out = new Float64Array(n);
  let cursor = 0;
  while (cursor < n) {
    const value = input[order[cursor]!]!;
    let end = cursor + 1;
    while (end < n && input[order[end]!]! === value
      && (Number.isFinite(value) || !overflowDifferences || overflowDifferences[order[end]!] === overflowDifferences[order[cursor]!])) end += 1;
    const rank = (cursor + 1 + end) / 2;
    for (let k = cursor; k < end; k += 1) out[order[k]!] = rank;
    cursor = end;
  }
  return out;
}

/**
 * Acklam's rational approximation to the standard normal quantile function
 * used for correlation confidence intervals. Tested against R's qnorm with
 * a 1e-8 relative tolerance, including extreme representable tail probabilities.
 */
export function inverseNormal(p: number): number {
  if (p <= 0 || p >= 1) return Number.NaN;
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const plow = 0.02425;
  const phigh = 1 - plow;
  const horner = (coefficients: number[], x: number) => coefficients.reduce((total, coefficient) => total * x + coefficient, 0);
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    const numerator = horner(c, q);
    const denominator = horner(d, q) * q + 1;
    return numerator / denominator;
  }
  if (p > phigh) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    const numerator = horner(c, q);
    const denominator = horner(d, q) * q + 1;
    return -numerator / denominator;
  }
  const q = p - 0.5;
  const r = q * q;
  const numerator = horner(a, r) * q;
  const denominator = horner(b, r) * r + 1;
  return numerator / denominator;
}

function confidenceInterval(r: number, n: number, confLevel: number): [number, number] {
  if (!Number.isFinite(r) || n <= 3) return [Number.NaN, Number.NaN];
  // Perfect correlation has the Fisher-transform limit +/-Infinity. Clipping
  // finite correlations away from +/-1 can exclude the estimate from its CI.
  const z = Math.atanh(Math.max(-1, Math.min(1, r)));
  const sigma = 1 / Math.sqrt(n - 3);
  // The upper-tail probability may round to one for a valid confidence < 1.
  const q = -inverseNormal((1 - confLevel) / 2);
  return [Math.tanh(z - sigma * q), Math.tanh(z + sigma * q)];
}

function finiteValues(rows: Row[], column: string): number[] {
  return values(rows, column).filter(Number.isFinite);
}

function mean(input: number[]): number {
  return input.length === 0 ? Number.NaN : meanColumns(input.map(value => [value]))[0]!;
}

function groupedPointValues(set: ENASet, by: string, dimension: string): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  for (const row of set.points) {
    const key = String((row[by] ?? null) as Scalar);
    const current = groups.get(key) ?? [];
    current.push(Number(row[dimension] ?? 0));
    groups.set(key, current);
  }
  return groups;
}

function welchTTest(dimension: string, groups: Array<[string, number[]]>): StatTestRow | undefined {
  const [left, right] = groups;
  if (!left || !right || groups.length !== 2) return undefined;
  const errors = [scaledSampleDeviation(left[1], Math.sqrt(left[1].length)), scaledSampleDeviation(right[1], Math.sqrt(right[1].length))];
  const denominator = combineScaledDeviations(errors);
  const difference = scaledMeanDifference(left[1], right[1]);
  const statistic = denominator.value === 0 ? Number.NaN : statisticInUnits({ value: difference.value / denominator.value, scale: difference.scale }, denominator.scale);
  const leftError = statisticInUnits(errors[0]!, denominator.scale);
  const rightError = statisticInUnits(errors[1]!, denominator.scale);
  const errorScale = Math.max(leftError, rightError);
  const leftTerm = (leftError / errorScale) ** 2;
  const rightTerm = (rightError / errorScale) ** 2;
  const dfNumerator = (leftTerm + rightTerm) ** 2;
  const dfDenominator = leftTerm ** 2 / (left[1].length - 1) + rightTerm ** 2 / (right[1].length - 1);
  return {
    dimension,
    test: 'welch-t',
    groups: [left[0], right[0]],
    statistic,
    df: dfDenominator === 0 ? Number.NaN : dfNumerator / dfDenominator
  };
}

function oneWayAnova(dimension: string, groups: Array<[string, number[]]>): StatTestRow | undefined {
  const populated = groups.filter((entry) => entry[1].length > 0);
  if (populated.length < 2) return undefined;
  const all = populated.flatMap((entry) => entry[1]);
  const scale = statisticalScale(all) || 1;
  // Use stable contrasts against one actual group mean. Choosing the smallest
  // group bounds all repeated reference scans by the total observation count.
  // A rounded common coordinate origin can erase cancellation residuals before
  // the group means are compared, even when their difference is representable.
  const reference = populated.reduce((smallest, entry) => entry[1].length < smallest.length ? entry[1] : smallest, populated[0]![1]);
  const contrasts = populated.map(([, input]) => statisticInUnits(scaledMeanDifference(input, reference), scale));
  const overallMean = mean(populated.flatMap(([, input], index) => input.map(() => contrasts[index]!)));
  const dfBetween = populated.length - 1;
  const dfWithin = all.length - populated.length;
  const between = l2Norm(populated.map(([, input], index) => Math.sqrt(input.length / dfBetween) * (contrasts[index]! - overallMean)));
  const within = combineScaledDeviations(populated.map(([, input]) => input.length < 2
    ? { value: 0, scale: 1 }
    : scaledSampleDeviation(input, Math.sqrt(dfWithin / (input.length - 1)))));
  const ratio = statisticInUnits({ value: between / within.value, scale }, within.scale);
  const statistic = dfWithin <= 0 || within.value === 0 ? Number.NaN : ratio * ratio;
  return {
    dimension,
    test: 'one-way-anova',
    groups: populated.map((entry) => entry[0]),
    statistic,
    dfBetween,
    dfWithin
  };
}

export function enaCorrelations(set: ENASet, dims?: Array<number | string>, confLevel = 0.95): DimensionCorrelation[] {
  if (!set.centroids) throw new Error('ENA set does not include centroids.');
  const names = dimensionNames(set, dims);
  const n = set.points.length;
  const pairCount = (n * (n - 1)) / 2;

  return names.map((dimension) => {
    const pointValues = Float64Array.from(values(set.points, dimension));
    const centroidValues = Float64Array.from(values(set.centroids ?? [], dimension));
    // Fill typed difference vectors by index instead of materializing pair
    // tuples (advisory F-013: object pairs dominated time and memory for
    // large unit counts; pair count is still O(n^2) — see the documented
    // limits).
    const pointDiff = new Float64Array(pairCount);
    const centroidDiff = new Float64Array(pairCount);
    let cursor = 0;
    for (let i = 0; i < n; i += 1) {
      const pi = pointValues[i]!;
      const ci = centroidValues[i]!;
      for (let j = i + 1; j < n; j += 1) {
        pointDiff[cursor] = pi - pointValues[j]!;
        centroidDiff[cursor] = ci - centroidValues[j]!;
        cursor += 1;
      }
    }
    const halvedOverflowDifferences = (input: Float64Array, original: Float64Array): Float64Array | undefined => {
      if (!original.some(value => !Number.isFinite(value))) return undefined;
      const output = new Float64Array(pairCount);
      let index = 0;
      for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) {
        output[index++] = input[i]! / 2 - input[j]! / 2;
      }
      return output;
    };
    // A difference between finite coordinates can exceed MAX_VALUE. Halving
    // once is sufficient for Pearson; Spearman uses it only to distinguish
    // overflowing distances, preserving all still-representable ranks.
    const pointHalfDiff = halvedOverflowDifferences(pointValues, pointDiff);
    const centroidHalfDiff = halvedOverflowDifferences(centroidValues, centroidDiff);
    const pearson = pearsonCorrelation(pointHalfDiff ?? pointDiff, centroidHalfDiff ?? centroidDiff);
    const spearman = pearsonCorrelation(ranksTyped(pointDiff, pointHalfDiff), ranksTyped(centroidDiff, centroidHalfDiff));
    const [pearsonLower, pearsonUpper] = confidenceInterval(pearson, pairCount, confLevel);
    return { dimension, pearson, spearman, pearsonLower, pearsonUpper };
  });
}

export function cohensD(x: number[], y: number[]): number {
  return coreCohensD(x, y);
}

export function dimensionSummary(set: ENASet, dims?: Array<number | string>): DimensionSummaryRow[] {
  return dimensionNames(set, dims).map((dimension) => {
    const vals = finiteValues(set.points, dimension);
    const sd = sampleDeviation(vals);
    let min = Infinity;
    let max = -Infinity;
    // The public API can fit more points than an engine accepts as call arguments.
    for (const value of vals) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    return {
      dimension,
      n: vals.length,
      mean: mean(vals),
      sd,
      variance: sd * sd,
      min: vals.length === 0 ? Number.NaN : min,
      max: vals.length === 0 ? Number.NaN : max
    };
  });
}

export function groupSummary(set: ENASet, by: string, dims?: Array<number | string>): GroupSummaryRow[] {
  const names = dimensionNames(set, dims);
  const groups = new Map<string, Row[]>();
  for (const row of set.points) {
    const key = String((row[by] ?? null) as Scalar);
    const current = groups.get(key);
    if (current) current.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.entries()].map(([group, rows]) => ({
    group,
    n: rows.length,
    means: Object.fromEntries(names.map((dimension) => {
      const vals = values(rows, dimension);
      return [dimension, mean(vals)];
    }))
  }));
}

export function enaStats(set: ENASet, options: ENAStatsOptions = {}): ENAStatsResult {
  const dimensions = dimensionSummary(set, options.dims);
  const correlations = enaCorrelations(set, options.dims, options.confLevel ?? 0.95);
  if (!options.by) return { dimensions, correlations };
  const groups = groupSummary(set, options.by, options.dims);
  const tests = dimensionNames(set, options.dims).flatMap((dimension) => {
    const grouped = [...groupedPointValues(set, options.by ?? '', dimension).entries()];
    const test = grouped.length === 2 ? welchTTest(dimension, grouped) : oneWayAnova(dimension, grouped);
    return test ? [test] : [];
  });
  return { dimensions, correlations, groups, tests };
}
