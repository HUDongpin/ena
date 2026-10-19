import { describe, expect, it } from 'vitest';
import { ena } from '../src/index.js';
import { normalizeVector } from '../src/core/index.js';

const base = {
  rows: [
    { unit: 'u0', conv: 'h', A: 1, B: 1, C: 1 },
    { unit: 'u1', conv: 'h', A: 1, B: 2, C: 4 },
    { unit: 'u2', conv: 'h', A: 1, B: 3, C: 2 },
    { unit: 'u3', conv: 'h', A: 1, B: 1, C: 7 },
  ],
  codes: ['A', 'B', 'C'], units: ['unit'], conversation: ['conv'],
  windowSizeBack: 1, weightBy: 'sum' as const, dimensions: 3,
};

describe('review: finite rotation anchors retain their direction across units', () => {
  for (const scale of [1, Number.MIN_VALUE, 2 ** 1023, Number.MAX_VALUE]) {
    it(`normalizes a finite vector with component scale ${scale}`, () => {
      expect(normalizeVector([scale, scale, 0])).toEqual([
        expect.closeTo(Math.SQRT1_2, 14), expect.closeTo(Math.SQRT1_2, 14), 0,
      ]);
    });
    it(`anchors public spherical projections at component scale ${scale}`, () => {
      const result = ena({ ...base, rotation: { method: 'spherical', params: {
        anchor: [scale, scale, 0], secondaryAnchor: [0, 0, 1],
      } } });
      const first = result.rotation.rotationMatrix.map(row => row[0]!);
      expect(first).toEqual([expect.closeTo(Math.SQRT1_2, 14), expect.closeTo(Math.SQRT1_2, 14), 0]);
      for (let row = 0; row < result.points.length; row += 1) {
        const centered = result.pointsForProjection[row]!;
        const expected = (Number(centered['A & B']) + Number(centered['A & C'])) * Math.SQRT1_2;
        expect(Number(result.points[row]!.SPH1)).toBeCloseTo(expected, 13);
      }
    });
  }
  it('keeps an overflowing-norm secondary anchor as the declared second direction', () => {
    const result = ena({ ...base, rotation: { method: 'spherical', params: {
      anchor: [1, 0, 0], secondaryAnchor: [0, Number.MAX_VALUE, Number.MAX_VALUE],
    } } });
    expect(result.rotation.rotationColumns.slice(0, 2)).toEqual(['SPH1', 'SPH2']);
    expect(result.rotation.rotationMatrix.map(row => row[1]!)).toEqual([
      0, expect.closeTo(Math.SQRT1_2, 14), expect.closeTo(Math.SQRT1_2, 14),
    ]);
  });
});

for (const method of ['mean', 'hena'] as const) {
  it(`keeps ${method} directions finite for representable subnormal edge contrasts`, () => {
    const rotation = method === 'mean'
      ? { method, params: { groups: [['u2', 'u3'], ['u0', 'u1']] as [string[], string[]] } }
      : { method, params: { xVar: 'x' } };
    const result = ena({
      rows: Array.from({ length: 4 }, (_, index) => ({
        unit: `u${index}`, conv: 'h', x: index, A: 1, B: 1, C: (index + 1) * Number.MIN_VALUE,
      })),
      codes: ['A', 'B', 'C'], units: ['unit'], conversation: ['conv'], metadata: ['x'],
      windowSizeBack: 1, weightBy: 'sum', dimensions: 3, rotation,
    });
    const first = result.rotation.rotationMatrix.map(row => row[0]!);
    expect(first).toEqual([0, expect.closeTo(Math.SQRT1_2, 14), expect.closeTo(Math.SQRT1_2, 14)]);
    expect(result.rotation.rotationMatrix.flat().every(Number.isFinite)).toBe(true);
    for (const point of result.points) for (const column of result.rotation.rotationColumns) {
      expect(Number.isFinite(Number(point[column]))).toBe(true);
    }
  });
}
