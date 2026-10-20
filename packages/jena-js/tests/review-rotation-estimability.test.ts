import { describe, expect, it } from 'vitest';
import { ena, type ENAOptions, type RotationOptions, type Row } from '../src/index.js';

const rows: Row[] = Array.from({ length: 12 }, (_, index) => ({
  unit: String(index), conv: 'h', x: index - 5, constant: 1,
  A: 1, B: index % 3 + 1, C: (index * index + 2 * index) % 7 + 1,
}));
const options = {
  rows, codes: ['A', 'B', 'C'], units: ['unit'], conversation: ['conv'],
  metadata: ['x', 'constant'], windowSizeBack: 1, weightBy: 'sum', dimensions: 3,
} satisfies ENAOptions;
const methods = ['regression', 'regression2', 'generalized'] as const;
function rotation(method: typeof methods[number], x = 'x', y?: string): RotationOptions {
  const formula = (name: string) => method === 'regression' ? `V ~ ${name}`
    : method === 'regression2' ? `${name} ~ V` : name;
  return { method, params: { xVar: formula(x), ...(y ? { yVar: formula(y) } : {}) } };
}
function squaredDistance(points: Row[], columns: string[], i: number, j: number): number {
  return columns.reduce((sum, column) => sum + (Number(points[i]![column]) - Number(points[j]![column])) ** 2, 0);
}

describe('review: requested regression directions must be estimable', () => {
  for (const method of methods) {
    it(`${method} rejects a constant first predictor or response on full-rank networks`, () => {
      expect(() => ena({ ...options, rotation: rotation(method, 'constant') }))
        .toThrow(/non-zero rotation vector/);
    });
    it(`${method} rejects a zero second requested direction without returning a named null axis`, () => {
      expect(() => ena({ ...options, rotation: rotation(method, 'x', 'constant') }))
        .toThrow(/non-zero rotation vector/);
    });
    it(`${method} rejects exactly zero association even when the metadata varies`, () => {
      // Each network appears at x = -1 and x = +1, so every covariance is
      // exactly zero while the 12 distinct source networks span all 3 axes.
      const symmetric = rows.flatMap(row => [-1, 1].map(x => ({ ...row, unit: `${row.unit}/${x}`, x })));
      expect(() => ena({ ...options, rows: symmetric, rotation: rotation(method) }))
        .toThrow(/non-zero rotation vector/);
    });
    it(`${method} continues accepting an ordinary non-zero requested direction`, () => {
      const result = ena({ ...options, rotation: rotation(method) });
      const leading = result.rotation.rotationMatrix.map(row => row[0]!);
      expect(Math.hypot(...leading)).toBeCloseTo(1, 14);
      expect(result.rotation.rotationMatrix.flat().every(Number.isFinite)).toBe(true);
    });
  }

  it('uses an affinely full-rank fixture, with SVD preserving its independent raw-network distance', () => {
    // Independent 100-digit Decimal oracle: sphere([B,C,B*C]), then a
    // direct 3x3 determinant of differences from units 0 to units 1,2,3.
    // det = 0.0011201501530802389465332675635649899400..., strictly nonzero.
    // Unit 6 to unit 10 squared distance = 0.19465813230311993747...
    const result = ena({ ...options, rotation: { method: 'svd' } });
    expect(squaredDistance(result.points, result.rotation.rotationColumns, 6, 10))
      .toBeCloseTo(0.19465813230311993, 14);
    expect(Object.values(result.variance).every(share => share > 0)).toBe(true);
  });

  for (const method of ['regression', 'regression2'] as const) {
    it(`${method} preserves documented nonorthogonal parallel x/y directions`, () => {
      const result = ena({ ...options, rotation: rotation(method, 'x', 'x') });
      for (const row of result.rotation.rotationMatrix) expect(row[0]).toBe(row[1]);
      expect(result.rotation.rotationColumns[0]).not.toBe(result.rotation.rotationColumns[1]);
    });
  }

  it('retains the existing HENA rejection of a constant predictor', () => {
    expect(() => ena({ ...options, rotation: { method: 'hena', params: { xVar: 'constant' } } }))
      .toThrow(/non-zero rotation vector/);
  });

  it('retains SVD support for all-zero networks when origin alignment is disabled', () => {
    const zeroRows = rows.map(row => ({ ...row, A: 0, B: 0, C: 0 }));
    const result = ena({ ...options, rows: zeroRows, centerAlignToOrigin: false, rotation: { method: 'svd' } });
    expect(Object.values(result.variance)).toEqual([0, 0, 0]);
    expect(result.points.every(row => result.rotation.rotationColumns.every(column => row[column] === 0))).toBe(true);
  });

  it('retains SVD support for constant nonzero and rank-one centered networks', () => {
    const constantRows = rows.map(row => ({ ...row, A: 1, B: 1, C: 1 }));
    const constant = ena({ ...options, rows: constantRows, rotation: { method: 'svd' } });
    expect(Object.values(constant.variance)).toEqual([0, 0, 0]);
    const rankOneRows = rows.map((row, index) => ({ ...row, A: 1, B: 1, C: index % 2 }));
    const rankOne = ena({ ...options, rows: rankOneRows, rotation: { method: 'svd' } });
    // The two normalized vectors [1,0,0] and [1,1,1]/sqrt(3).
    expect(squaredDistance(rankOne.points, rankOne.rotation.rotationColumns, 0, 1))
      .toBeCloseTo(2 - 2 / Math.sqrt(3), 14);
    expect(rankOne.variance.SVD1).toBeCloseTo(1, 14);
  });
});
