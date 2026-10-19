import { describe, expect, it } from 'vitest';
import { ena, type RotationOptions, type Row } from '../src/index.js';
import { designSolve } from '../src/core/index.js';

const rows: Row[] = Array.from({ length: 12 }, (_, index) => ({
  unit: String(index), conv: 'h', x: index - 5,
  A: 1, B: index % 3 + 1, C: (index * index + 2 * index) % 7 + 1,
}));
// Independent 100-digit Decimal OLS from the integer raw products:
// normalize([B,C,B*C]); sum((i-5.5)*weight_i); normalize the slope.
const expectedAxis = [-0.5930643994176985, -0.5130159575691292, 0.6205555941434691];
const expectedProjection = [-0.30960895838123614, 0.15905844240585687, 0.10186724435452912, -0.15528614794506673, 0.15905844240585687, -0.12806430040945105, -0.013239339707760917, -0.18196896189458983, 0.248817363467069, -0.15528614794506673, 0.025835000182790557, 0.248817363467069];

const expectedReverseAxis = [-0.5902078239017569, -0.6671468206860498, -0.45449955363415745];
const expectedReverseProjection = [-0.12253749216277147, 0.04912160565694919, 0.03267135643945409, -0.07869820085331995, 0.04912160565694919, -0.00626891656520714, 0.01737595672762072, -0.05305186859188898, 0.10478619014335057, -0.07869820085331995, -0.018608225741166835, 0.10478619014335057];

function fit(method: 'regression' | 'regression2' | 'generalized' | 'hena', offset: number, scale: number) {
  const rotation: RotationOptions = { method, params: method === 'regression'
    ? { xVar: 'V ~ x' } : method === 'regression2' ? { xVar: 'x ~ V' } : { xVar: 'x' } };
  return ena({
    rows: rows.map(row => ({ ...row, x: (Number(row.x) + offset) * scale })),
    codes: ['A', 'B', 'C'], units: ['unit'], conversation: ['conv'], metadata: ['x'],
    windowSizeBack: 1, weightBy: 'sum', dimensions: 3, rotation,
  });
}

describe('review: regression axes retain predictor affine meaning', () => {
  for (const method of ['regression', 'regression2', 'generalized', 'hena'] as const) {
    for (const [offset, scale] of [[0, 1], [2 ** 30, 1], [2 ** 40, 8], [2 ** 30, -8]]) {
      it(`${method} preserves the signed slope at offset ${offset}, scale ${scale}`, () => {
        const result = fit(method, offset!, scale!);
        const sign = Math.sign(scale!);
        const axis = method === 'regression2' ? expectedReverseAxis : expectedAxis;
        const projections = method === 'regression2' ? expectedReverseProjection : expectedProjection;
        for (let edge = 0; edge < 3; edge += 1) {
          expect(result.rotation.rotationMatrix[edge]![0]).toBeCloseTo(sign * axis[edge]!, 11);
        }
        expect(result.rotation.rotationMatrix.flat().every(Number.isFinite)).toBe(true);
        for (const point of result.points) for (const column of result.rotation.rotationColumns) {
          expect(Number.isFinite(Number(point[column]))).toBe(true);
        }
        const axisName = result.rotation.rotationColumns[0]!;
        result.points.forEach((point, index) => {
          expect(Number(point[axisName])).toBeCloseTo(sign * projections[index]!, 11);
        });
      });
    }
  }
});

// The preconditioner is limited to an unpenalized explicit intercept.
// These controls pin the separate existing penalty/design definitions.

describe('review: intercept centering preserves regression definitions', () => {
  it('retains weighted full-rank multiresponse slopes and restores intercepts', () => {
    const xOrigin = 2 ** 30;
    const zOrigin = -(2 ** 28);
    const source = [[0, 1], [1, -1], [2, 2], [4, 0], [-2, 3]];
    const samples = source.flatMap((row, index) => Array.from({ length: index + 1 }, () => row));
    const design = samples.map(([x, z]) => [1, x! + xOrigin, z! + zOrigin]);
    const response = samples.map(([x, z]) => [2 + 3 * x! - 2 * z!, -4 + 0.5 * x! + z!]);
    for (const order of [design.map((_, index) => index), design.map((_, index) => index).reverse()]) {
      const coefficients = designSolve(order.map(index => design[index]!), order.map(index => response[index]!));
      expect(coefficients[1]![0]).toBeCloseTo(3, 12);
      expect(coefficients[2]![0]).toBeCloseTo(-2, 12);
      expect(coefficients[1]![1]).toBeCloseTo(0.5, 12);
      expect(coefficients[2]![1]).toBeCloseTo(1, 12);
      expect(coefficients[0]![0]! / (2 - 3 * xOrigin + 2 * zOrigin)).toBeCloseTo(1, 13);
      expect(coefficients[0]![1]! / (-4 - 0.5 * xOrigin - zOrigin)).toBeCloseTo(1, 13);
    }
  });

  it('keeps the existing ridge penalty on both intercept and slope', () => {
    const result = designSolve([[1, 0], [1, 1], [1, 2]], [[1], [3], [5]], 1);
    expect(result[0]![0]).toBeCloseTo(1, 14);
    expect(result[1]![0]).toBeCloseTo(5 / 3, 14);
  });

  it('keeps a no-intercept regression in its original coordinates', () => {
    expect(designSolve([[0], [1], [2]], [[1], [3], [5]])[0]![0]).toBeCloseTo(13 / 5, 14);
  });
});
