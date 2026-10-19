import { describe, expect, it } from 'vitest';
import { accumulateData, ena, makeSet } from '../src/index.js';
import { svdRotation } from '../src/rotation/svd.js';
import { varianceColumns, varianceProportions } from '../src/core/matrix.js';

function frequencyOptions(scale: number) {
  return {
    rows: [1, 2, 3, 4, 5, 6].map((value, index) => ({
      unit: `u${index}`, horizon: `h${index}`, A: 1, B: 1, C: value * scale,
    })),
    units: ['unit'], conversation: ['horizon'], codes: ['A', 'B', 'C'],
    networkType: 'standard' as const, weightBy: 'sum' as const, dimensions: 3,
  };
}

function orthonormal(matrix: number[][]) {
  const columns = matrix[0]?.length ?? 0;
  for (let i = 0; i < columns; i += 1) for (let j = 0; j < columns; j += 1) {
    const product = matrix.reduce((sum, row) => sum + row[i]! * row[j]!, 0);
    expect(product).toBeCloseTo(i === j ? 1 : 0, 14);
  }
}

describe('review round 2: model geometry survives finite small scales', () => {
  for (const scale of [1e-100, 1e-160, 1e-200, 1e-310]) {
    it(`preserves principal direction and variance shares at ${scale}`, () => {
      const options = frequencyOptions(scale);
      const before = structuredClone(options);
      const result = ena(options);
      const direction = result.rotation.rotationMatrix.map(row => row[0]!);
      expect(Math.abs((direction[1]! + direction[2]!) * Math.SQRT1_2)).toBeCloseTo(1, 14);
      expect(direction[0]).toBeCloseTo(0, 14);
      orthonormal(result.rotation.rotationMatrix);
      expect(Math.abs(Number(result.points[5]!.SVD1) / scale)).toBeCloseTo(2.5 * Math.SQRT2, 12);
      expect(result.variance.SVD1).toBeCloseTo(1, 14);
      expect(Object.values(result.variance).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 14);
      expect(result.rotation.eigenvalues.every(Number.isFinite)).toBe(true);
      if (scale === 1e-160) {
        expect(result.rotation.eigenvalues[0]).toBeGreaterThan(0);
        expect(Math.abs(result.rotation.eigenvalues[0]! - 7e-320)).toBeLessThanOrEqual(Number.MIN_VALUE);
      }
      expect(options).toEqual(before);
    });
  }

  for (const scale of [1e-100, 1e-200, 2 ** -1060, Number.MIN_VALUE]) {
    it(`orders independent principal directions at ${scale} without changing input units`, () => {
      const input = [[scale, 3 * scale], [scale, -3 * scale], [-scale, 3 * scale], [-scale, -3 * scale]];
      const before = structuredClone(input);
      const result = svdRotation(input);
      expect(Math.abs(result.rotationMatrix[1]![0]!)).toBeCloseTo(1, 14);
      expect(Math.abs(result.rotationMatrix[0]![1]!)).toBeCloseTo(1, 14);
      orthonormal(result.rotationMatrix);
      if (scale === 1e-100) {
        expect(result.eigenvalues[0]! / 1e-200).toBeCloseTo(12, 12);
        expect(result.eigenvalues[1]! / 1e-200).toBeCloseTo(4 / 3, 12);
      } else {
        // The true absolute eigenvalues cannot be represented in Float64.
        expect(result.eigenvalues).toEqual([0, 0]);
      }
      expect(input).toEqual(before);
    });
  }

  it('preserves a representable variance share when only its absolute variance underflows', () => {
    const options = frequencyOptions(1);
    options.rows = options.rows.map((row, i) => ({ ...row, A: 1e50, B: 1e-50, C: (i + 1) * 1e-150 }));
    const data = accumulateData(options);
    const reference = structuredClone(ena(frequencyOptions(1e-100)).rotation);
    reference.rotationMatrix = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    reference.centerVector = [1, 0, 0];
    const result = makeSet(data, { rotationSet: reference, dimensions: 3 });
    expect(result.variance.SVD1).toBe(0);
    expect(result.variance.SVD2).toBeCloseTo(1, 14);
    expect(result.variance.SVD3! / 1e-200).toBeCloseTo(1, 12);
  });

  it('does not let a large constant dimension erase a small varying dimension', () => {
    const values = [[Number.MAX_VALUE, 1e-200], [Number.MAX_VALUE, 2e-200], [Number.MAX_VALUE, 3e-200]];
    expect(varianceProportions(values)).toEqual([0, 1]);
  });

  it('keeps ordinary variance fractions on their existing arithmetic path', () => {
    const values = [[0.1, 5, -2], [0.7, 9, -1], [0.3, 6, 4], [-0.2, 2, 7]];
    const variances = varianceColumns(values);
    const total = variances.reduce((sum, value) => sum + value, 0);
    expect(varianceProportions(values)).toEqual(variances.map(value => value / total));
  });

  it('keeps exactly constant Reference targets at zero variance', () => {
    const options = frequencyOptions(1e-200);
    const reference = ena(options).rotation;
    const data = accumulateData({ ...options, rows: options.rows.map(row => ({ ...row, C: 3e-200 })) });
    const result = makeSet(data, { rotationSet: reference, nodePositionMethod: 'reference-fixed', dimensions: 3 });
    expect(Object.values(result.variance)).toEqual([0, 0, 0]);
    expect(result.rotation).toEqual(reference);
  });

  it('keeps resource observations within their existing stage bounds', () => {
    const observed: { stage: string; scratch: number }[] = [];
    let stage = '';
    const options = frequencyOptions(1e-200);
    ena({ ...options, observer: {
      onStage(value) { stage = value; },
      onResources(value) { observed.push({ stage, scratch: value.temporaryNumericCellsBound }); },
    } });
    // n=6, e=3, c=3, d=3. Scaling cannot add an unaccounted n*e clone.
    expect(observed.find(value => value.stage === 'rotate-or-project')!.scratch).toBe(3 * 3 * 3 + 2 * 6 * 3 + 8 * 3);
    expect(observed.some(value => value.stage === 'position-nodes'
      && value.scratch === 2 * 6 * 3 + 2 * 6 * 3 + 3 * 3 + 2 * 3)).toBe(true);
  });
});

describe('review round 2: nonzero signed Standard networks', () => {
  const options = {
    rows: [
      { unit: 'u1', horizon: 'h1', A: 1, B: 1, C: 1 },
      { unit: 'u2', horizon: 'h2', A: 1, B: 2, C: 1 },
    ],
    units: ['unit'], conversation: ['horizon'], codes: ['A', 'B', 'C'],
    networkType: 'standard' as const, weightBy: 'sum' as const, dimensions: 3,
    mask: [[1, 1, -1], [1, 1, 0], [-1, 0, 1]],
  };
  it('keeps a balanced signed network in default centering', () => {
    expect(accumulateData(options).connectionMatrix).toEqual([[1, -1, 0], [2, -1, 0]]);
    const actual = ena(options);
    const expected = ena({ ...options, centerAlignToOrigin: false });
    expect(actual.rotation.centerVector).toEqual(expected.rotation.centerVector);
    const distance = Math.hypot(...['SVD1', 'SVD2', 'SVD3'].map(axis => Number(actual.points[0]![axis]) - Number(actual.points[1]![axis])));
    expect(distance).toBeCloseTo(0.3203644860139344, 14);
    expect(actual.variance.SVD1).toBeCloseTo(1, 14);
  });

  it('keeps a balanced signed network when projecting through a fixed origin', () => {
    const data = accumulateData(options);
    const rotationSet = ena({ ...options, centerAlignToOrigin: false }).rotation;
    const actual = makeSet(data, { rotationSet, dimensions: 3 });
    const expected = makeSet(data, { rotationSet, centerAlignToOrigin: false, dimensions: 3 });
    expect(actual.pointsForProjection).toEqual(expected.pointsForProjection);
    expect(actual.points).toEqual(expected.points);
  });

  it('retains truly empty network alignment and constant-network behavior', () => {
    const result = ena({ ...options, rows: [...options.rows, { unit: 'empty', horizon: 'empty', A: 0, B: 0, C: 0 }] });
    expect(['SVD1', 'SVD2', 'SVD3'].map(axis => result.points[2]![axis])).toEqual([0, 0, 0]);
    const constant = ena({ ...options, rows: [options.rows[0]!, { ...options.rows[0]!, unit: 'other', horizon: 'other' }] });
    expect(Object.values(constant.variance)).toEqual([0, 0, 0]);
    expect(constant.points.every(row => ['SVD1', 'SVD2', 'SVD3'].every(axis => row[axis] === 0))).toBe(true);
  });
});
