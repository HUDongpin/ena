import { describe, expect, it } from 'vitest';
import { accumulateData, accumulateDataChunked, createAccumulationStream, refWindowMatrix, rowsToCoOccurrences, vectorToUpperTriangle, type AccumulateOptions } from '../src/index.js';
import { rowsToCoOccurrencesTyped } from '../src/performance.js';

const options = (overrides: Partial<AccumulateOptions> = {}): AccumulateOptions => ({
  rows: [{ unit: 'private-unit', horizon: 'private-horizon', A: 1e-162, B: 1e-162, C: 1e-161 }],
  units: ['unit'], conversation: ['horizon'], codes: ['A', 'B', 'C'], weightBy: 'sum', ...overrides,
});
const runners = {
  batch: accumulateData,
  chunked: (o: AccumulateOptions) => accumulateDataChunked({ ...o, chunkSize: 1, materialization: 'model' }),
  streaming: ({ rows, ...o }: AccumulateOptions) => { const stream = createAccumulationStream(o); for (const row of rows) stream.push([row]); return stream.finish(); },
};

describe('Standard connection underflow boundary', () => {
  for (const [name, run] of Object.entries(runners)) {
    for (const window of ['Conversation', 'MovingStanzaWindow'] as const) {
      it(`${name} ${window} rejects partial positive underflow`, () => {
        expect(() => run(options({ window }))).toThrow(/underflow/i);
      });
      it(`${name} ${window} retains representable positive subnormals`, () => {
        const result = run(options({ window, rows: [{ unit: 'u', horizon: 'h', A: 1e-160, B: 1e-160, C: 1e-159 }] }));
        expect(result.connectionMatrix[0]).toEqual([1e-320, 1e-319, 1e-319]);
      });
      it(`${name} ${window} does not compute excluded zero-mask edges`, () => {
        const result = run(options({ window, mask: [[1, 0, 1], [0, 1, 1], [1, 1, 1]] }));
        expect(result.connectionMatrix[0]).toEqual([0, 1e-323, 1e-323]);
      });
    }
    for (const forward of [0, 1, Infinity]) {
      it(`${name} rejects an underflowing cross-row contribution with forward ${forward}`, () => {
        const rows = [{ unit: 'u1', horizon: 'h', A: 1e-200, B: 0, C: 0 }, { unit: 'u2', horizon: 'h', A: 0, B: 1e-200, C: 1 }];
        expect(() => run(options({ rows, windowSizeBack: 2, windowSizeForward: forward }))).toThrow(/underflow/i);
      });
    }
  }
  it('rejects partial underflow through public numerical entry points', () => {
    const row = [1e-162, 1e-162, 1e-161];
    for (const run of [() => vectorToUpperTriangle(row), () => rowsToCoOccurrences([row], false), () => refWindowMatrix([row], 1, 0, false), () => rowsToCoOccurrencesTyped({ data: Float64Array.from(row), rows: 1, cols: 3 }, false)]) {
      expect(run).toThrow(/underflow/i);
    }
  });
  it('preserves binary presence without relying on an underflowed magnitude', () => {
    const row = [1e-200, 1e-200, 1e-200];
    expect(rowsToCoOccurrences([row])).toEqual([[1, 1, 1]]);
    expect(refWindowMatrix([row])).toEqual([[1, 1, 1]]);
    expect(Array.from(rowsToCoOccurrencesTyped({ data: Float64Array.from(row), rows: 1, cols: 3 }).data)).toEqual([1, 1, 1]);
    expect(accumulateData(options({ weightBy: 'binary' })).connectionMatrix).toEqual([[1, 1, 1]]);
  });
});
