import { describe, expect, it } from 'vitest';
import { accumulateData, dimensionSummary, ena, type ENASet } from '../src/index.js';

function fitAlternatingUnits(count: number): ENASet {
  return ena({
    rows: Array.from({ length: count }, (_, index) => ({
      unit: String(index), horizon: 'h', A: 1, B: index % 2,
    })),
    units: ['unit'], conversation: ['horizon'], codes: ['A', 'B'],
    dimensions: 1, windowSizeBack: 1, centerAlignToOrigin: false,
  });
}

describe('review: public inputs do not depend on argument-count limits', () => {
  it('summarizes a successfully fitted public ENA model with 150,000 units', () => {
    const count = 150_000;
    const set = fitAlternatingUnits(count);
    expect(set.points).toHaveLength(count);
    expect(set.adjacencyKey).toHaveLength(1);
    const [summary] = dimensionSummary(set, ['SVD1']);
    // One-row windows produce the one-edge vectors 0 and 1. Centering
    // around their mean gives +/-1/2, independently of the SVD sign.
    expect(summary!.n).toBe(count);
    expect(summary!.min).toBe(-0.5);
    expect(summary!.max).toBe(0.5);
    expect(summary!.mean).toBe(0);
    expect(summary!.variance).toBeCloseTo(count / (4 * (count - 1)), 14);
    expect(summary!.sd).toBeCloseTo(Math.sqrt(count / (4 * (count - 1))), 14);
  }, 10_000);

  it('accumulates 150,000 SeparateTrajectory steps without an argument-list expansion', () => {
    const count = 150_000;
    const result = accumulateData({
      rows: Array.from({ length: count }, (_, index) => ({
        unit: 'u', horizon: String(index), A: 1, B: index % 2,
      })),
      units: ['unit'], conversation: ['horizon'], codes: ['A', 'B'],
      model: 'SeparateTrajectory', windowSizeBack: 1,
    });
    expect(result.connectionMatrix).toHaveLength(count);
    expect(result.trajectories).toHaveLength(count);
    // Each distinct step has one row: the sole A-B count is exactly B.
    // Check every step and its order without deriving the oracle from a fit.
    let mismatches = 0;
    for (let index = 0; index < count; index += 1) {
      if (result.connectionMatrix[index]?.[0] !== index % 2
        || result.trajectories?.[index]?.horizon !== String(index)) mismatches += 1;
    }
    expect(mismatches).toBe(0);
  }, 10_000);

  it('keeps the existing empty-coordinate summary', () => {
    const set = fitAlternatingUnits(2);
    set.points = [];
    const [summary] = dimensionSummary(set);
    expect(summary!.n).toBe(0);
    expect(summary!.min).toBeNaN();
    expect(summary!.max).toBeNaN();
    expect(summary!.mean).toBeNaN();
  });

  it('keeps existing non-finite normalization and finite extrema', () => {
    const set = fitAlternatingUnits(2);
    for (const coordinates of [[2, Number.NaN, Infinity, -Infinity],
      [Number.MAX_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE]]) {
      set.points = coordinates.map(SVD1 => ({ SVD1 }));
      const [summary] = dimensionSummary(set);
      const normalized = coordinates.map(value => Number.isFinite(value) ? value : 0);
      expect(summary!.n).toBe(coordinates.length);
      expect(summary!.min).toBe(Math.min(...normalized));
      expect(summary!.max).toBe(Math.max(...normalized));
    }
  });

  it('retains Math.min/Math.max signed-zero behavior in either row order', () => {
    const set = fitAlternatingUnits(2);
    for (const coordinates of [[0, -0], [-0, 0], [0, 0], [-0, -0]]) {
      set.points = set.points.map((row, index) => ({ ...row, SVD1: coordinates[index]! }));
      const [summary] = dimensionSummary(set);
      expect(Object.is(summary!.min, Math.min(...coordinates))).toBe(true);
      expect(Object.is(summary!.max, Math.max(...coordinates))).toBe(true);
    }
  });
});
