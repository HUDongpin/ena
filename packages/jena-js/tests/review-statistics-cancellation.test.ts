import { describe, expect, it } from 'vitest';
import { cohensD, ena, enaStats, type ENASet } from '../src/index.js';

const epsilon = 2 ** -60;
const permutations = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
function relative(actual: number, expected: number) {
  expect(Number.isFinite(actual)).toBe(true);
  expect(Math.abs(actual / expected - 1)).toBeLessThan(2e-12);
}
function statistics(groups: number[][]) {
  const rows = groups.flatMap((group, groupIndex) => group.map((value, index) => ({
    unit: `${groupIndex}:${index}`, horizon: `${groupIndex}:${index}`, group: String(groupIndex),
    A: 1, B: 1, C: index + 1, coordinate: value,
  })));
  const set: ENASet = ena({ rows, units: ['unit'], conversation: ['horizon'], metadata: ['group'],
    codes: ['A', 'B', 'C'], weightBy: 'sum', dimensions: 3 });
  set.points = set.points.map((row, index) => ({ ...row, SVD1: rows[index]!.coordinate }));
  return enaStats(set, { dims: ['SVD1'], by: 'group' }).tests![0]!;
}

describe('review: group contrasts retain small cancellation residuals', () => {
  for (const scale of [2 ** -600, 1, 2 ** 600]) {
    it(`preserves Cohen's d and Welch t under row permutations at scale ${scale}`, () => {
      const left = [1, -1, epsilon].map(value => value * scale);
      const right = [1, -1, 2 * epsilon].map(value => value * scale);
      // Each sample SD rounds to scale. Their exact means differ by e*scale/3.
      for (const order of permutations) {
        const x = order.map(index => left[index]!);
        const y = order.map(index => right[index]!);
        relative(cohensD(x, y), epsilon / 3);
        const result = statistics([x, y]);
        relative(result.statistic, -epsilon / Math.sqrt(6));
        expect(result.df).toBeCloseTo(4, 12);
      }
    });
    it(`preserves ANOVA between-group variance under row permutations at scale ${scale}`, () => {
      const groups = [1, 2, 3].map(multiplier => [1, -1, multiplier * epsilon].map(value => value * scale));
      // Means e/3, 2e/3, e give MS_between=e²/3; MS_within rounds to 1.
      for (const order of permutations) {
        const result = statistics(groups.map(group => order.map(index => group[index]!)));
        relative(result.statistic, epsilon * epsilon / 3);
        expect(result.dfBetween).toBe(2);
        expect(result.dfWithin).toBe(6);
      }
    });
  }
  it('retains cancellation contrasts with unequal sample sizes and group ordering', () => {
    const left = [1, -1, epsilon];
    const right = [1, -1, 1, -1, 4 * epsilon];
    relative(cohensD(left, right), 7 * epsilon / 15);
    const welch = statistics([left, right]);
    relative(welch.statistic, -7 * epsilon / (2 * Math.sqrt(30)));
    expect(welch.df).toBeCloseTo(256 / 59, 12);
    for (const groups of [[left, right, [0, 0]], [[0, 0], right, left], [right, left, [0, 0]]]) {
      relative(statistics(groups).statistic, 217 * epsilon * epsilon / 360);
    }
  });
  it('retains a sub-ulp mean contrast in broadly spread positive coordinates', () => {
    const e = Number.EPSILON;
    // Both separately rounded means are 1; the exact contrast is e/3.
    relative(cohensD([0, 1, 2], [0, 1 + e, 2]), e / 3);
    relative(statistics([[0, 1, 2], [0, 1 + e, 2]]).statistic, -e / Math.sqrt(6));
  });
});
