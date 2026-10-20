import { describe, expect, it } from 'vitest';
import { centerData, meanColumns, skipSphereNorm } from '../src/core/matrix.js';
import { accumulateData, makeSet } from '../src/index.js';

describe('stable scientific column means', () => {
  it('retains cancellation residuals independently of row order', () => {
    for (const values of [[1e16, 1, -1e16], [1e16, -1e16, 1], [1, 1e16, -1e16]]) {
      expect(meanColumns(values.map(value => [value]))).toEqual([1 / 3]);
    }
  });

  it('centers a repeated non-binary constant at zero', () => {
    const value = 1 / Math.sqrt(3);
    const rows = Array.from({ length: 1000 }, () => [value]);
    expect(meanColumns(rows)).toEqual([value]);
    expect(centerData(rows).every(row => row[0] === 0)).toBe(true);
  });

  it('removes the residual mean left by rounding a near-constant population center', () => {
    const value = 1 / Math.sqrt(3), delta = 1e-12;
    const rows = Array.from({ length: 1000 }, (_, index) => [index === 0 ? value + delta : value]);
    const centered = centerData(rows);
    expect(Math.abs(meanColumns(centered)[0]!)).toBeLessThan(delta * Number.EPSILON);
    expect(centered[0]![0]! - centered[1]![0]!).toBe(rows[0]![0]! - rows[1]![0]!);
    // An explicit center is a fixed projection origin, not a request to fit
    // this population's center again.
    expect(centerData(rows, [value])).toEqual(rows.map(row => [row[0]! - value]));
  });

  it('keeps a small group contrast after repeated centering and row permutation', () => {
    const delta = 1e-11;
    const rows = Array.from({ length: 3000 }, (_, index) => {
      const pattern = index < 1500 ? index % 3 : Math.floor((index - 1500) / 500);
      const values = [0, 0, 0];
      values[pattern] = 1;
      if (index === 0) { values[1] = delta; values[2] = delta; }
      return { values, positive: index < 1500 };
    });
    function direction(input: typeof rows) {
      const centered = centerData(centerData(input.map(row => row.values)));
      const positive = meanColumns(centered.filter((_, index) => input[index]!.positive));
      const negative = meanColumns(centered.filter((_, index) => !input[index]!.positive));
      const difference = positive.map((value, index) => value - negative[index]!);
      const length = Math.hypot(...difference);
      return difference.map(value => value / length);
    }
    const original = direction(rows);
    const reordered = direction([...rows].sort((a, b) => b.values[0]! - a.values[0]! || b.values[1]! - a.values[1]!));
    // Subtracting the center rounds each O(1) input by O(epsilon); the
    // direction's unavoidable relative error scales as epsilon / delta.
    const roundingBound = 4 * Number.EPSILON / delta;
    [0, Math.SQRT1_2, Math.SQRT1_2].forEach((expected, index) => {
      expect(Math.abs(original[index]! - expected)).toBeLessThan(roundingBound);
      expect(reordered[index]).toBeCloseTo(original[index]!, 12);
    });
  });

  it('returns representable means even when a finite column sum overflows', () => {
    const max = Number.MAX_VALUE;
    for (const values of [[max, max, -max], [-max, max, max]]) {
      expect(meanColumns(values.map(value => [value]))[0]! / max).toBeCloseTo(1 / 3, 15);
    }
    expect(meanColumns([[max], [max]])).toEqual([max]);
  });

  it('retains small cancellation residuals when retrying an overflowing sum', () => {
    const max = Number.MAX_VALUE;
    for (const residual of [1e-300, 1, 5 * Number.MIN_VALUE, 6 * Number.MIN_VALUE, 100 * Number.MIN_VALUE]) {
      for (const values of [[max, max, -max, -max, residual], [-max, -max, max, max, residual]]) {
        const actual = meanColumns(values.map(value => [value]))[0]!;
        const expected = residual / values.length;
        expect(actual).toBeGreaterThan(0);
        expect(actual / expected).toBeCloseTo(1, 15);
      }
    }
  });

  it('preserves empty, ordinary, subnormal and non-finite mean contracts', () => {
    expect(meanColumns([])).toEqual([]);
    expect(meanColumns([[1, 4], [3, 8]])).toEqual([2, 6]);
    expect(meanColumns([[Number.MIN_VALUE], [Number.MIN_VALUE]])).toEqual([Number.MIN_VALUE]);
    expect(meanColumns([[Infinity], [1]])).toEqual([Infinity]);
    expect(meanColumns([[Infinity], [-Infinity]])[0]).toBeNaN();
  });

  it('preserves a fixed near-constant reference origin, geometry and pairwise contrasts', () => {
    const data = accumulateData({
      rows: Array.from({ length: 1000 }, (_, index) => ({
        unit: String(index), horizon: String(index), A: 1, B: 1, C: index === 0 ? 1 + 1e-12 : 1,
      })),
      units: ['unit'], conversation: ['horizon'], codes: ['A', 'B', 'C'], weightBy: 'sum', window: 'Conversation',
    });
    const fitted = makeSet(data, { dimensions: 3 });
    const reference = structuredClone(fitted.rotation);
    const projected = makeSet(data, { rotationSet: reference, nodePositionMethod: 'reference-fixed', dimensions: 3 });
    expect(projected.rotation).toEqual(reference);
    projected.pointsForProjection.forEach((row, index) => data.codeColumns.forEach((edge, column) => {
      expect(row[edge]).toBe(Number(projected.lineWeights[index]![edge]) - reference.centerVector[column]!);
    }));
    const axes = reference.rotationColumns;
    const separation = Math.hypot(...axes.map(axis => Number(fitted.points[0]![axis]) - Number(fitted.points[1]![axis])));
    axes.forEach(axis => {
      const shift = Number(projected.points[0]![axis]) - Number(fitted.points[0]![axis]);
      expect(Math.abs(shift)).toBeLessThan(8 * Number.EPSILON);
      projected.points.forEach((row, index) => {
        const actualShift = Number(row[axis]) - Number(fitted.points[index]![axis]);
        expect(Math.abs(actualShift - shift)).toBeLessThanOrEqual(32 * Number.EPSILON * separation);
      });
      // A common reference-origin translation does not change variance.
      expect(Math.abs(projected.variance[axis]! - fitted.variance[axis]!)).toBeLessThan(8 * Number.EPSILON);
    });
    expect(projected.variance.SVD1).toBeCloseTo(1, 14);
  });
});

describe('global sphere normalization', () => {
  it('preserves finite networks when the largest absolute norm overflows', () => {
    const input = [[1.3e308, 1.3e308], [1, 0]];
    const actual = skipSphereNorm(input);
    const scaledSmall = (1 / 1.3e308) / Math.SQRT2;
    expect(actual[0]![0]).toBeCloseTo(Math.SQRT1_2, 15);
    expect(actual[0]![1]).toBeCloseTo(Math.SQRT1_2, 15);
    expect(actual[1]![0]).toBe(scaledSmall);
    expect(actual[1]![0]).toBeGreaterThan(0);
    expect(actual[1]![1]).toBe(0);
    expect(input).toEqual([[1.3e308, 1.3e308], [1, 0]]);
  });

  it('uses the largest row norm, including signs and row permutations', () => {
    const input = [[1.7e308, 0], [-1.3e308, 1.3e308], [1, -1]];
    const actual = skipSphereNorm(input);
    expect(Math.hypot(...actual[1]!)).toBeCloseTo(1, 15);
    expect(actual[0]![0]).toBeCloseTo((1.7 / 1.3) / Math.SQRT2, 15);
    expect(actual[1]![0]).toBeCloseTo(-Math.SQRT1_2, 15);
    expect(skipSphereNorm([...input].reverse())).toEqual([...actual].reverse());
  });

  it('preserves ordinary and tiny globally scaled network magnitudes', () => {
    expect(skipSphereNorm([[3, 4], [0, 2]])).toEqual([[0.6, 0.8], [0, 0.4]]);
    const tiny = skipSphereNorm([[3e-300, 4e-300], [0, 2e-300]]);
    [[0.6, 0.8], [0, 0.4]].forEach((row, index) => row.forEach((value, column) => {
      expect(tiny[index]![column]).toBeCloseTo(value, 15);
    }));
    expect(skipSphereNorm([])).toEqual([]);
    expect(skipSphereNorm([[0, -0]])).toEqual([[0, 0]]);
    expect(skipSphereNorm([[Infinity, 1], [2, 0]])).toEqual([[NaN, 0], [0, 0]]);
    expect(() => skipSphereNorm([[NaN]])).toThrow(/must be a number/);
  });
});
