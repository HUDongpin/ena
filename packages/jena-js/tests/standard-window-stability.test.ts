import { describe, expect, it } from 'vitest';
import {
  accumulateData,
  accumulateDataChunked,
  createAccumulationStream,
  refWindowMatrix,
  sphereNorm,
  type AccumulateOptions,
} from '../src/index.js';

const large = { A: 1e8, B: 1e8, C: 0 };
const focal = { A: 1e-9, B: 0, C: 1e-9 };
const zero = { A: 0, B: 0, C: 0 };
const cases = [
  { name: 'finite backward', back: 2, forward: 0, rows: [large, focal], focalIndex: 1 },
  { name: 'infinite backward', back: Infinity, forward: 0, rows: [large, focal], focalIndex: 1 },
  { name: 'finite forward', back: 1, forward: 1, rows: [focal, large], focalIndex: 0 },
  { name: 'infinite forward', back: 1, forward: Infinity, rows: [focal, large], focalIndex: 0 },
  { name: 'both directions', back: 2, forward: 1, rows: [large, focal, zero], focalIndex: 1 },
];

const runners = {
  batch: (options: AccumulateOptions) => accumulateData(options),
  chunked: (options: AccumulateOptions) => accumulateDataChunked({ ...options, chunkSize: 1 }),
  streaming: ({ rows, ...options }: AccumulateOptions) => {
    const stream = createAccumulationStream(options);
    for (const row of rows) stream.push([row]);
    return stream.finish();
  },
  'public matrix helper': (options: AccumulateOptions) => ({
    connectionMatrix: refWindowMatrix(
      options.rows.map((row) => options.codes.map((code) => Number(row[code]))),
      options.windowSizeBack,
      options.windowSizeForward,
      options.weightBy === 'binary',
    ),
  }),
};

describe('Standard moving-window focal contribution stability', () => {
  for (const [runnerName, run] of Object.entries(runners)) {
    for (const weightBy of ['sum', 'binary'] as const) {
      it.each(cases)(`${runnerName} ${weightBy} preserves the small focal network with $name context`, ({ back, forward, rows, focalIndex }) => {
        const result = run({
          rows: rows.map((row, index) => ({ ...row, unit: `u${index}`, horizon: 'h1' })),
          units: ['unit'], conversation: ['horizon'], codes: ['A', 'B', 'C'],
          windowSizeBack: back, windowSizeForward: forward, weightBy,
        });
        // Independent surviving row-pair contributions: large.B * focal.A,
        // large.A * focal.C + focal.A * focal.C, large.B * focal.C.
        // The within-context A*B product must not erase the first cross term.
        const expected = weightBy === 'sum' ? [0.1, 0.1 + 1e-18, 0.1] : [1, 1, 1];
        expect(result.connectionMatrix[focalIndex]).toEqual(expected);
        const normalized = sphereNorm([result.connectionMatrix[focalIndex]!])[0]!;
        for (const coordinate of normalized) expect(coordinate).toBeCloseTo(1 / Math.sqrt(3), 14);
      });
    }
  }
});
