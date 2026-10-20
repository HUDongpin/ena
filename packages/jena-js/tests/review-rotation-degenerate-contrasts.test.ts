import { describe, expect, it } from 'vitest';
import { ena, type ENAOptions, type GroupSelector, type Row } from '../src/index.js';

const rows: Row[] = Array.from({ length: 12 }, (_, i) => ({
  unit: String(i), conv: 'h', x: i - 5, category: 'only',
  A: 1, B: i % 3 + 1, C: (i * i + 2 * i) % 7 + 1,
}));
const options = {
  rows, codes: ['A', 'B', 'C'], units: ['unit'], conversation: ['conv'],
  metadata: ['x', 'category'], windowSizeBack: 1, weightBy: 'sum', dimensions: 3,
} satisfies ENAOptions;
const pair: [GroupSelector, GroupSelector] = [rows.map((_, i) => i < 6), rows.map((_, i) => i >= 6)];
const independentPair: [GroupSelector, GroupSelector] = [rows.map((_, i) => i % 2 === 0), rows.map((_, i) => i % 2 === 1)];
const expectedAxes = [
  [0.9333163557123426, -0.17987840418569526, -0.31074803276519645],
  [0.2624927299794533, -0.2486859343013749, 0.9323373170631893],
];

describe('review: categorical generalized directions require between-group signal', () => {
  it('rejects a one-level first target instead of labelling the first edge as a generalized axis', () => {
    expect(() => ena({ ...options, rotation: { method: 'generalized', params: { xVar: 'category' } } }))
      .toThrow(/between-group signal/);
  });

  it('rejects a one-level requested second target', () => {
    expect(() => ena({ ...options, rotation: { method: 'generalized', params: { xVar: 'x', yVar: 'category' } } }))
      .toThrow(/between-group signal/);
  });

  it('rejects multiple levels with exactly identical conditional networks', () => {
    // Each full-rank network is duplicated once in each level. Both conditional
    // means equal the total mean, so the between-group scatter is exactly zero.
    const balanced = rows.flatMap(row => ['north', 'south'].map(category => ({ ...row, unit: `${row.unit}/${category}`, category })));
    expect(() => ena({ ...options, rows: balanced, rotation: { method: 'generalized', params: { xVar: 'category' } } }))
      .toThrow(/between-group signal/);
  });

  it('retains a nonzero two-level categorical contrast with its independently calculated direction', () => {
    const grouped = rows.map((row, i) => ({ ...row, category: i < 6 ? 'north' : 'south' }));
    const result = ena({ ...options, rows: grouped, rotation: { method: 'generalized', params: { xVar: 'category' } } });
    const direction = result.rotation.rotationMatrix.map(row => row[0]!);
    const alignment = direction.reduce((sum, value, i) => sum + value * expectedAxes[0]![i]!, 0);
    expect(Math.abs(alignment)).toBeCloseTo(1, 13);
  });

  for (const epsilon of [1e-7, 1e-10]) {
    it(`keeps a small positive between-group signal at perturbation ${epsilon}`, () => {
      const nearlyBalanced = rows.flatMap(row => ['north', 'south'].map(category => ({
        ...row, unit: `${row.unit}/${category}`, category,
        C: Number(row.C) + (category === 'north' ? epsilon : 0),
      })));
      const result = ena({ ...options, rows: nearlyBalanced, rotation: { method: 'generalized', params: { xVar: 'category' } } });
      expect(Math.hypot(...result.rotation.rotationMatrix.map(row => row[0]!))).toBeCloseTo(1, 13);
      expect(result.rotation.rotationMatrix.flat().every(Number.isFinite)).toBe(true);
    });
  }
});

describe('review: repeated Means contrasts cannot define additional axes', () => {
  const repetitions: [string, [GroupSelector, GroupSelector]][] = [
    ['same membership', pair],
    ['reversed membership', [pair[1], pair[0]]],
    ['equivalent labels in a different order', [['5', '4', '3', '2', '1', '0', '0'], ['11', '10', '9', '8', '7', '6']]],
    ['equivalent labels plus an unknown unit', [['0', '1', '2', '3', '4', '5', 'absent'], ['6', '7', '8', '9', '10', '11']]],
  ];
  for (const [name, repeated] of repetitions) {
    it(`rejects ${name} before floating-point residuals become MR2`, () => {
      expect(() => ena({ ...options, rotation: { method: 'mean', params: { groups: [pair, repeated] } } }))
        .toThrow(/repeated or reversed/);
    });
  }
  it('also detects an earlier contrast after an independent intervening pair', () => {
    expect(() => ena({ ...options, rotation: { method: 'mean', params: { groups: [pair, independentPair, [pair[1], pair[0]]] } } }))
      .toThrow(/repeated or reversed/);
  });

  it('keeps one contrast and two independent contrasts with fixed mean-difference signs', () => {
    // Independent Decimal100 group means from raw sphere([B,C,B*C]); the second
    // direction removes the projection of its contrast onto the first direction.
    for (const groups of [[pair], [pair, independentPair]]) {
      const result = ena({ ...options, rotation: { method: 'mean', params: { groups } } });
      for (let axis = 0; axis < groups.length; axis++) {
        result.rotation.rotationMatrix.forEach((row, edge) => expect(row[axis]).toBeCloseTo(expectedAxes[axis]![edge]!, 12));
      }
      expect(result.rotation.rotationMatrix.flat().every(Number.isFinite)).toBe(true);
    }
  });
});
