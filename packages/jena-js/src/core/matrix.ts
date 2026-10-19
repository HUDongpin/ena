/*
 * Derived from rENA 0.3.1 (GPL-3), (c) the rENA authors: Cody L Marquart,
 * Zachari Swiecki, Wesley Collier, Brendan Eagan, Roman Woodward, and
 * David Williamson Shaffer. This file ports ref_window_df, rows_to_co_occurrences, and
 * fun_sphere_norm from src/ena.cpp.
 * TypeScript translation and modifications for jena-js, GPL-3.0-only.
 * See PROVENANCE.md for the upstream NOTICE and version pin.
 */
import type { AdjacencyKeyEntry, Matrix } from '../types.js';
import { assertFiniteNumbers, assertRectangularMatrix } from './guards.js';

export function cloneMatrix(matrix: Matrix): Matrix {
  return matrix.map((row) => [...row]);
}

export function zeros(rows: number, cols: number): Matrix {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
}

export function combnC2(n: number): Matrix {
  if (!Number.isInteger(n) || n < 0) throw new Error('n must be a non-negative integer.');
  const out: Matrix = [[], []];
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      out[0]?.push(i);
      out[1]?.push(j);
    }
  }
  return out;
}

export function triIndices(length: number, row: -1 | 0 | 1 = -1): Matrix {
  if (!Number.isInteger(length) || length < 0) throw new Error('length must be a non-negative integer.');
  const first: number[] = [];
  const second: number[] = [];
  for (let i = 1; i < length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      first.push(j);
      second.push(i);
    }
  }
  if (row === 0) return [first];
  if (row === 1) return [second];
  return [first, second];
}

export function adjacencyKey(codes: string[]): AdjacencyKeyEntry[] {
  const indices = triIndices(codes.length);
  const sources = indices[0] ?? [];
  const targets = indices[1] ?? [];
  return sources.map((sourceIndex, i) => {
    const targetIndex = targets[i] ?? 0;
    const source = codes[sourceIndex] ?? String(sourceIndex);
    const target = codes[targetIndex] ?? String(targetIndex);
    return {
      source,
      target,
      name: `${source} & ${target}`,
      sourceIndex,
      targetIndex
    } satisfies AdjacencyKeyEntry;
  });
}

/**
 * Full ordered adjacency in column-major matrix order: response/target is the
 * outer loop and ground/source is the inner loop. Thus an edge at matrix row
 * `groundIndex`, column `responseIndex` has flat index
 * `responseIndex * codes.length + groundIndex`.
 */
export function orderedAdjacencyKey(codes: string[]): AdjacencyKeyEntry[] {
  const entries: AdjacencyKeyEntry[] = [];
  for (let responseIndex = 0; responseIndex < codes.length; responseIndex += 1) {
    for (let groundIndex = 0; groundIndex < codes.length; groundIndex += 1) {
      const source = codes[groundIndex] ?? String(groundIndex);
      const target = codes[responseIndex] ?? String(responseIndex);
      entries.push({
        source,
        target,
        // Match the official ONA/R golden header convention. Direction is
        // carried unambiguously by source/target and their indices.
        name: `${source} & ${target}`,
        sourceIndex: groundIndex,
        targetIndex: responseIndex
      });
    }
  }
  return entries;
}

export class StandardProductUnderflowError extends RangeError {
  readonly code = 'STANDARD_PRODUCT_UNDERFLOW';

  constructor(readonly edgeIndex: number) {
    super(`Standard connection product underflow at edge ${edgeIndex}; rescale the Code values before accumulation.`);
    this.name = 'StandardProductUnderflowError';
  }
}

/** Preserve presence in binary mode; frequency mode must not silently lose an edge. */
export function standardConnectionProduct(left: number, right: number, edgeIndex: number, binary: boolean): number {
  const product = left * right;
  if (product === 0 && left !== 0 && right !== 0 && Number.isFinite(left) && Number.isFinite(right)) {
    if (!binary) throw new StandardProductUnderflowError(edgeIndex);
    return (left > 0) === (right > 0) ? Number.MIN_VALUE : -Number.MIN_VALUE;
  }
  return product;
}

export function vectorToUpperTriangle(vector: number[], binary = false): number[] {
  const out: number[] = [];
  for (let i = 1; i < vector.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      out.push(standardConnectionProduct(vector[j] ?? 0, vector[i] ?? 0, out.length, binary));
    }
  }
  return out;
}

export function stringVectorToUpperTriangle(values: string[]): string[] {
  const out: string[] = [];
  for (let i = 1; i < values.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      out.push(`${values[j] ?? ''} & ${values[i] ?? ''}`);
    }
  }
  return out;
}

export function rowsToCoOccurrences(matrix: Matrix, binary = true): Matrix {
  assertRectangularMatrix(matrix);
  assertFiniteNumbers(matrix);
  return matrix.map((row) => {
    const co = vectorToUpperTriangle(row, binary);
    return binary ? co.map((value) => (value > 0 ? 1 : 0)) : co;
  });
}

export function sumColumns(matrix: Matrix): number[] {
  if (matrix.length === 0) return [];
  const width = matrix[0]?.length ?? 0;
  const sums = Array.from({ length: width }, () => 0);
  for (const row of matrix) {
    for (let col = 0; col < width; col += 1) {
      sums[col] = (sums[col] ?? 0) + (row[col] ?? 0);
    }
  }
  return sums;
}

export function meanColumns(matrix: Matrix): number[] {
  if (matrix.length === 0) return [];
  return Array.from({ length: matrix[0]?.length ?? 0 }, (_, column) => {
    let sum = 0;
    let compensation = 0;
    let scale = 0;
    for (const row of matrix) {
      const value = row[column] ?? 0;
      const next = sum + value;
      compensation += Math.abs(sum) >= Math.abs(value)
        ? (sum - next) + value
        : (value - next) + sum;
      sum = next;
      scale = Math.max(scale, Math.abs(value));
    }
    // Neumaier compensation retains small group contrasts and prevents the
    // centering error from growing with the number/order of repeated rows.
    const total = sum + compensation;
    if (Number.isFinite(total)) return total / matrix.length;
    // Keep the existing non-finite-input contract. Finite inputs, however,
    // always have a finite mean even if their intermediate sum overflows.
    if (!Number.isFinite(scale)) return sum / matrix.length;
    // Scale by a power of two based on the population, not its largest
    // value: max-value scaling would erase small cancellation residuals.
    // The extra factor of two leaves headroom in every partial sum.
    const divisor = 2 ** (Math.ceil(Math.log2(matrix.length)) + 1);
    sum = 0;
    compensation = 0;
    let remainderSum = 0;
    let remainderCompensation = 0;
    for (const row of matrix) {
      const original = row[column] ?? 0;
      const value = original / divisor;
      const next = sum + value;
      compensation += Math.abs(sum) >= Math.abs(value)
        ? (sum - next) + value
        : (value - next) + sum;
      sum = next;
      // Power-of-two scaling is exact except at subnormal magnitudes. Keep
      // that division remainder so even a subnormal mean can survive.
      const remainder = original - value * divisor;
      const nextRemainder = remainderSum + remainder;
      remainderCompensation += Math.abs(remainderSum) >= Math.abs(remainder)
        ? (remainderSum - nextRemainder) + remainder
        : (remainder - nextRemainder) + remainderSum;
      remainderSum = nextRemainder;
    }
    const unscaledTotal = (sum + compensation) * divisor;
    // Reconstruct a representable sum before dividing to avoid double
    // rounding its subnormal residual. If only the sum overflows, divide
    // first; the subnormal remainders cannot affect a mean at that scale.
    return Number.isFinite(unscaledTotal)
      ? (unscaledTotal + (remainderSum + remainderCompensation)) / matrix.length
      : ((sum + compensation) / matrix.length) * divisor;
  });
}

export function subtractVectors(a: number[], b: number[]): number[] {
  const length = Math.max(a.length, b.length);
  return Array.from({ length }, (_, i) => (a[i] ?? 0) - (b[i] ?? 0));
}

export function addVectors(a: number[], b: number[]): number[] {
  const length = Math.max(a.length, b.length);
  return Array.from({ length }, (_, i) => (a[i] ?? 0) + (b[i] ?? 0));
}

export function scaleVector(vector: number[], scalar: number): number[] {
  return vector.map((value) => value * scalar);
}

export function dot(a: number[], b: number[]): number {
  const length = Math.max(a.length, b.length);
  let total = 0;
  for (let i = 0; i < length; i += 1) total += (a[i] ?? 0) * (b[i] ?? 0);
  return total;
}

interface ScaledL2State {
  scale: number;
  scaledSumSquares: number;
  hasNaN: boolean;
  hasInfinity: boolean;
}

function scaledL2State(vector: number[]): ScaledL2State {
  let scale = 0;
  let scaledSumSquares = 1;
  let hasNaN = false;
  let hasInfinity = false;

  for (const value of vector) {
    if (Number.isNaN(value)) {
      hasNaN = true;
      continue;
    }
    const magnitude = Math.abs(value);
    if (magnitude === Number.POSITIVE_INFINITY) {
      hasInfinity = true;
      continue;
    }
    if (magnitude === 0) continue;

    if (scale < magnitude) {
      const ratio = scale / magnitude;
      scaledSumSquares = 1 + scaledSumSquares * ratio * ratio;
      scale = magnitude;
    } else {
      const ratio = magnitude / scale;
      scaledSumSquares += ratio * ratio;
    }
  }

  return { scale, scaledSumSquares, hasNaN, hasInfinity };
}

export function l2Norm(vector: number[]): number {
  const state = scaledL2State(vector);
  if (state.hasNaN) return Number.NaN;
  if (state.hasInfinity) return Number.POSITIVE_INFINITY;
  return state.scale === 0 ? 0 : state.scale * Math.sqrt(state.scaledSumSquares);
}

/**
 * Expand outer(head + middle + tail) - outer(head) - outer(tail)
 * into its surviving products. Keep the parts separate: adding a small focal
 * row to a large context before subtracting its outer product can erase an
 * entire focal edge, even when that edge's correct value is well represented.
 * Parts are aligned Code vectors; head/tail are the prefixes/suffixes whose
 * within-part products the Standard moving-window semantics exclude.
 */
export function standardWindowConnections(middle: number[], head: number[] | undefined, tail: number[] | undefined, binary: boolean, edgeMask?: number[]): number[] {
  const co: number[] = [];
  for (let target = 1; target < middle.length; target += 1) {
    for (let source = 0; source < target; source += 1) {
      // An excluded edge has no scientific contribution to validate. Nonzero
      // mask weights are still applied once by the accumulation caller.
      if (edgeMask?.[co.length] === 0) {
        co.push(0);
        continue;
      }
      const product = (left: number, right: number) => standardConnectionProduct(left, right, co.length, binary);
      let value = product(middle[source]!, middle[target]!);
      if (head) value += product(head[source]!, middle[target]!) + product(middle[source]!, head[target]!);
      if (tail) value += product(tail[source]!, middle[target]!) + product(middle[source]!, tail[target]!);
      if (head && tail) value += product(head[source]!, tail[target]!) + product(tail[source]!, head[target]!);
      co.push(binary ? (value > 0 ? 1 : 0) : value);
    }
  }
  return co;
}

export function refWindowMatrix(matrix: Matrix, windowSize = 1, windowForward = 0, binary = true): Matrix {
  assertRectangularMatrix(matrix);
  assertFiniteNumbers(matrix);

  const rowCount = matrix.length;
  const out: Matrix = [];
  const infiniteBack = !Number.isFinite(windowSize);
  const infiniteForward = !Number.isFinite(windowForward);

  for (let row = 0; row < rowCount; row += 1) {
    let earliestRow = 0;
    let lastRow = row;

    if (infiniteBack) {
      earliestRow = 0;
    } else if (windowSize === 0) {
      earliestRow = row;
    } else if (row - (windowSize - 1) >= 0) {
      earliestRow = row - (windowSize - 1);
    }

    if (infiniteForward || row + windowForward >= rowCount) {
      lastRow = rowCount - 1;
    } else if (windowForward > 0 && row + windowForward <= rowCount - 1) {
      lastRow = row + windowForward;
    }

    const currRows = matrix.slice(earliestRow, lastRow + 1);
    const currRowCount = currRows.length;
    // Use the requested forward extent for the removed prefix, as in rENA,
    // even when the actual suffix is truncated at the end of the Horizon.
    const requestedHeadRows = windowSize > 1 && row > 0 ? currRowCount - 1 - windowForward : 0;
    const headRows = requestedHeadRows > 0 ? requestedHeadRows : 0;
    const tailRows = windowForward > 0 ? lastRow - row : 0;
    const middleEnd = currRowCount - tailRows;
    out.push(standardWindowConnections(
      sumColumns(currRows.slice(headRows, middleEnd)),
      headRows > 0 ? sumColumns(currRows.slice(0, headRows)) : undefined,
      tailRows > 0 ? sumColumns(currRows.slice(middleEnd)) : undefined,
      binary
    ));
  }

  return out;
}

export function refWindowLag(matrix: Matrix, windowSize = 0): Matrix {
  assertRectangularMatrix(matrix);
  assertFiniteNumbers(matrix);
  const out: Matrix = [];
  for (let row = 0; row < matrix.length; row += 1) {
    const start = Math.max(0, row - (windowSize - 1));
    out.push(sumColumns(matrix.slice(start, row + 1)));
  }
  return out;
}

export function sphereNorm(matrix: Matrix): Matrix {
  assertRectangularMatrix(matrix);
  assertFiniteNumbers(matrix);
  return matrix.map((row) => {
    const state = scaledL2State(row);
    if (state.hasInfinity) {
      return row.map((value) => value / Number.POSITIVE_INFINITY);
    }
    if (state.scale === 0) return row.map(() => 0);
    const scaledNorm = Math.sqrt(state.scaledSumSquares);
    return row.map((value) => (value / state.scale) / scaledNorm);
  });
}

export function skipSphereNorm(matrix: Matrix): Matrix {
  assertRectangularMatrix(matrix);
  assertFiniteNumbers(matrix);
  const largest = matrix.reduce((max, row) => Math.max(max, l2Norm(row)), 0);
  if (largest === 0) return matrix.map((row) => row.map(() => 0));
  if (!Number.isFinite(largest)) {
    const scale = matrix.reduce((max, row) => row.reduce((value, entry) => Math.max(value, Math.abs(entry)), max), 0);
    if (Number.isFinite(scale)) {
      // A finite row can have an unrepresentable absolute norm. A shared
      // scale preserves relative row magnitudes without forming that norm.
      const scaledNorm = matrix.reduce((max, row) => Math.max(max, l2Norm(row.map(value => value / scale))), 0);
      return matrix.map(row => row.map(value => (value / scale) / scaledNorm));
    }
  }
  return matrix.map((row) => row.map((value) => value / largest));
}

export function centerData(matrix: Matrix, centerVector?: number[]): Matrix {
  assertRectangularMatrix(matrix);
  assertFiniteNumbers(matrix);
  const center = centerVector ?? meanColumns(matrix);
  const centered = matrix.map((row) => row.map((value, columnIndex) => value - (center[columnIndex] ?? 0)));
  if (centerVector === undefined) {
    // A rounded O(1) center can leave an O(epsilon) common offset in nearly
    // constant data. Remove it at the scale of the deviations, where their
    // mean is representable; otherwise SVD mistakes the offset for variance.
    // Explicit centers belong to fixed projections and must stay unchanged.
    const residual = meanColumns(centered);
    for (const row of centered) for (let column = 0; column < row.length; column += 1) {
      const correction = residual[column] ?? 0;
      if (Number.isFinite(correction)) row[column] = row[column]! - correction;
    }
  }
  return centered;
}

export function transpose(matrix: Matrix): Matrix {
  if (matrix.length === 0) return [];
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  const out = zeros(cols, rows);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const outRow = out[col];
      if (outRow) outRow[row] = matrix[row]?.[col] ?? 0;
    }
  }
  return out;
}

export function multiplyMatrices(a: Matrix, b: Matrix): Matrix {
  assertRectangularMatrix(a, 'a');
  assertRectangularMatrix(b, 'b');
  const aRows = a.length;
  const aCols = a[0]?.length ?? 0;
  const bRows = b.length;
  const bCols = b[0]?.length ?? 0;
  if (aCols !== bRows) throw new Error(`Matrix dimensions do not align: ${aRows}x${aCols} times ${bRows}x${bCols}.`);
  const out = zeros(aRows, bCols);
  for (let i = 0; i < aRows; i += 1) {
    for (let j = 0; j < bCols; j += 1) {
      let total = 0;
      for (let k = 0; k < aCols; k += 1) total += (a[i]?.[k] ?? 0) * (b[k]?.[j] ?? 0);
      const outRow = out[i];
      if (outRow) outRow[j] = total;
    }
  }
  return out;
}

export function varianceColumns(matrix: Matrix): number[] {
  if (matrix.length < 2) return (matrix[0] ?? []).map(() => 0);
  const means = meanColumns(matrix);
  const sums = Array.from({ length: means.length }, () => 0);
  for (const row of matrix) {
    for (let col = 0; col < means.length; col += 1) {
      sums[col] = (sums[col] ?? 0) + Math.pow((row[col] ?? 0) - (means[col] ?? 0), 2);
    }
  }
  return sums.map((sum) => sum / (matrix.length - 1));
}

/** A power-of-two scale preserves represented differences near a common offset. */
export function statisticalScale(input: ArrayLike<number>): number {
  let maximum = 0;
  for (let i = 0; i < input.length; i += 1) maximum = Math.max(maximum, Math.abs(input[i]!));
  if (maximum === 0) return 0;
  if (!Number.isFinite(maximum)) return maximum;
  // Math.log2(MAX_VALUE) rounds to 1024 although 2**1024 is not finite.
  return 2 ** Math.min(1023, Math.floor(Math.log2(maximum)));
}

export interface ScaledStatistic {
  value: number;
  scale: number;
}

/** Restore binary units without overflowing the scale ratio itself. */
export function statisticInUnits(statistic: ScaledStatistic, units: number): number {
  let value = statistic.value;
  if (value === 0) return 0;
  let exponent = Math.log2(statistic.scale) - Math.log2(units);
  if (!Number.isFinite(exponent)) return Number.NaN;
  while (exponent > 1023) { value *= 2 ** 1023; exponent -= 1023; }
  while (exponent < -1022) { value *= 2 ** -1022; exponent += 1022; }
  return value * 2 ** exponent;
}

/** Keep the rounded mean and its residual in common binary units. */
function meanParts(input: number[], scale: number): [number, number] {
  const scaled = input.map(value => [value / scale]);
  const average = meanColumns(scaled)[0]!;
  let sum = 0;
  let compensation = 0;
  for (const [value] of scaled) {
    const difference = value! - average;
    // TwoDiff retains what a rounded subtraction loses: subtracting a small
    // mean from a large observation must not create a false residual mean.
    const virtualAverage = value! - difference;
    const error = (value! - (difference + virtualAverage)) + (virtualAverage - average);
    for (const part of [difference, error]) {
      const next = sum + part;
      compensation += Math.abs(sum) >= Math.abs(part) ? (sum - next) + part : (part - next) + sum;
      sum = next;
    }
  }
  return [average, (sum + compensation) / input.length];
}

/** Compare both terms before rounding away a small between-group contrast. */
export function scaledMeanDifference(left: number[], right: number[]): ScaledStatistic {
  if (left.length === 0 || right.length === 0) return { value: Number.NaN, scale: 1 };
  const scale = Math.max(statisticalScale(left), statisticalScale(right)) || 1;
  const [leftMean, leftResidual] = meanParts(left, scale);
  const [rightMean, rightResidual] = meanParts(right, scale);
  let sum = 0;
  let compensation = 0;
  for (const part of [leftMean, -rightMean, leftResidual, -rightResidual]) {
    const next = sum + part;
    compensation += Math.abs(sum) >= Math.abs(part) ? (sum - next) + part : (part - next) + sum;
    sum = next;
  }
  return { value: sum + compensation, scale };
}

/** Keep the deviation in binary units until a dimensionless ratio is formed. */
export function scaledSampleDeviation(input: number[], divisor = 1): ScaledStatistic {
  if (input.length < 2) return { value: Number.NaN, scale: 1 };
  const scale = statisticalScale(input) || 1;
  const anchor = input[0]! / scale;
  const offsets = input.map(value => value / scale - anchor);
  const average = meanColumns(offsets.map(value => [value]))[0]!;
  return { value: l2Norm(offsets.map(value => value - average)) / Math.sqrt(input.length - 1) / divisor, scale };
}

export function sampleDeviation(input: number[], divisor = 1): number {
  const result = scaledSampleDeviation(input, divisor);
  return result.value * result.scale;
}

/** Pooled deviations share only their units, never their centering origin. */
export function combineScaledDeviations(parts: ScaledStatistic[]): ScaledStatistic {
  const scale = parts.reduce((largest, part) => part.value === 0 ? largest : Math.max(largest, part.scale), 0) || 1;
  return { value: l2Norm(parts.map(part => statisticInUnits(part, scale))), scale };
}

/** Variance fractions need not lose range when the absolute variances do. */
export function varianceProportions(matrix: Matrix): number[] {
  const variances = varianceColumns(matrix);
  const total = variances.reduce((sum, value) => sum + value, 0);
  const losesRange = !Number.isFinite(total) || variances.some((value, column) =>
    (value > 0 && value < 2 ** -1022)
      || (value === 0 && matrix.some(row => row[column] !== matrix[0]?.[column])));
  if (!losesRange) return variances.map(value => total === 0 ? 0 : value / total);

  // Keep only O(columns) state. Per-column origins preserve close represented
  // differences; constant large columns cannot suppress a small varying one.
  const deviations = variances.map((_value, column): ScaledStatistic => {
    let maximum = 0;
    for (const row of matrix) maximum = Math.max(maximum, Math.abs(row[column]!));
    const scale = statisticalScale([maximum]) || 1;
    const anchor = matrix[0]![column]! / scale;
    let sum = 0;
    let compensation = 0;
    for (const row of matrix) {
      const offset = row[column]! / scale - anchor;
      const next = sum + offset;
      compensation += Math.abs(sum) >= Math.abs(offset) ? (sum - next) + offset : (offset - next) + sum;
      sum = next;
    }
    const mean = (sum + compensation) / matrix.length;
    let squares = 0;
    for (const row of matrix) squares += (row[column]! / scale - anchor - mean) ** 2;
    return { value: Math.sqrt(squares / (matrix.length - 1)), scale };
  });
  const combined = combineScaledDeviations(deviations);
  return deviations.map(value => combined.value === 0 ? 0
    : (statisticInUnits(value, combined.scale) / combined.value) ** 2);
}

export function pearsonCorrelation(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) throw new Error('Vectors must have equal length.');
  if (a.length < 2) return Number.NaN;
  // Subtract an anchor in exact binary-scaled units before averaging. Raw
  // max-value division would round away the differences of near-constant
  // vectors; squaring unscaled differences would underflow or overflow.
  const scaleA = statisticalScale(a);
  const scaleB = statisticalScale(b);
  const anchorA = a[0]! / scaleA;
  const anchorB = b[0]! / scaleB;
  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < a.length; i += 1) {
    meanA += a[i]! / scaleA - anchorA;
    meanB += b[i]! / scaleB - anchorB;
  }
  meanA /= a.length;
  meanB /= b.length;
  let numerator = 0;
  let denomA = 0;
  let denomB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const da = (a[i]! / scaleA - anchorA) - meanA;
    const db = (b[i]! / scaleB - anchorB) - meanB;
    numerator += da * db;
    denomA += da * da;
    denomB += db * db;
  }
  const denom = Math.sqrt(denomA) * Math.sqrt(denomB);
  return denom === 0 ? Number.NaN : Math.max(-1, Math.min(1, numerator / denom));
}

export function cohensD(x: number[], y: number[]): number {
  const lx = x.length - 1;
  const ly = y.length - 1;
  if (lx <= 0 || ly <= 0) return Number.NaN;
  const common = combineScaledDeviations([
    scaledSampleDeviation(x, Math.sqrt((lx + ly) / lx)),
    scaledSampleDeviation(y, Math.sqrt((lx + ly) / ly)),
  ]);
  const difference = scaledMeanDifference(x, y);
  return Math.abs(statisticInUnits({ value: difference.value / common.value, scale: difference.scale }, common.scale));
}
