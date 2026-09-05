import { describe, expect, it } from 'vitest';
import * as core from '../src/core/index.js';
import { accumulateData } from '../src/index.js';

const extents = [
  [1, 0],
  [5, 0],
  [2, 2],
  [Infinity, 0],
  [2, Infinity],
  [Infinity, Infinity]
] as const;

describe('Standard v3 inclusive Horizon window membership', () => {
  it.each(extents)('backward %s, forward %s matches every row of the independent oracle', (backward, forward) => {
    expect(core.windowBoundsForRow).toBeTypeOf('function');
    for (const horizonLength of [1, 3, 7]) {
      const horizonIndices = Array.from({ length: horizonLength }, (_, index) => index);
      for (const current of horizonIndices) {
        // This oracle comes directly from the approved inclusive-window contract.
        // Do not generate expected membership with the production helper.
        const first = backward === Infinity ? 0 : Math.max(0, current - (backward - 1));
        const last = forward === Infinity ? horizonLength - 1 : Math.min(horizonLength - 1, current + forward);
        const expected = horizonIndices.filter((index) => first <= index && index <= last);
        const actual = core.windowBoundsForRow(current, horizonLength, backward, forward);
        const observed = Array.from({ length: actual.last - actual.first + 1 }, (_, index) => actual.first + index);
        expect(observed).toEqual(expected);
        expect(observed).toContain(current);
        expect(observed.every((index) => index >= 0 && index < horizonLength)).toBe(true);
      }
    }
  });

  it('retains the existing jENA backward-zero current-row compatibility', () => {
    expect(core.windowBoundsForRow).toBeTypeOf('function');
    expect(core.windowBoundsForRow(2, 4, 0, 0)).toEqual({ first: 2, last: 2 });
  });
});

describe('Standard forward-window rENA 0.3.1 literal anchors', () => {
  // Independently obtained from installed rENA 0.3.1:
  // getFromNamespace('ref_window_df', 'rENA')(data.frame(
  //   A=c(1,0,0,1), B=c(0,1,0,0), C=c(0,0,1,0)), back, forward, FALSE)
  // These literals deliberately retain requested-forward prefix subtraction.
  const cases = [
    { back: 3, forward: 2, expected: [[1, 1, 0], [2, 1, 1], [2, 2, 1], [1, 1, 1]] },
    { back: 2, forward: Infinity, expected: [[1, 1, 0], [2, 1, 1], [1, 1, 1], [0, 1, 0]] },
    { back: Infinity, forward: Infinity, expected: [[1, 1, 0], [2, 1, 1], [2, 2, 1], [2, 2, 1]] }
  ];
  it.each(cases)('backward $back, forward $forward preserves the pinned row contributions', ({ back, forward, expected }) => {
    const data = accumulateData({
      rows: ([[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 0, 0]] as const).map(([A, B, C]) => ({ unit: 'u1', horizon: 'h1', A, B, C })),
      units: ['unit'], conversation: ['horizon'], codes: ['A', 'B', 'C'],
      networkType: 'standard', window: 'MovingStanzaWindow', windowSizeBack: back, windowSizeForward: forward, weightBy: 'sum'
    });
    expect(data.rowConnectionCounts.map((row) => data.codeColumns.map((column) => row[column]))).toEqual(expected);
  });
});
