import { describe, expect, it } from 'vitest';
import { createAccumulationStream } from '../src/performance.js';
import { makeSet } from '../src/model.js';
import { ena } from '../src/ena.js';

const rows = [
  { u: 'u1', h: 'h1', A: 1, B: 2, C: 1 },
  { u: 'u2', h: 'h2', A: 2, B: 1, C: 3 },
  { u: 'u1', h: 'h1', A: 1, B: 3, C: 1 },
  { u: 'u2', h: 'h2', A: 3, B: 1, C: 2 },
];
const base = { units: ['u'], conversation: ['h'], codes: ['A', 'B', 'C'], weightBy: 'sum' as const, materialization: 'model' as const };

describe('operational Standard worker observations', () => {
  for (const model of ['EndPoint', 'SeparateTrajectory', 'AccumulatedTrajectory'] as const) {
    for (const forward of [0, 1, Infinity]) {
      it(`async finish preserves ${model} forward=${forward} scientific output`, async () => {
        const options = { ...base, model, windowSizeBack: 2, windowSizeForward: forward };
        const sync = createAccumulationStream(options);
        const asyncStream = createAccumulationStream(options);
        sync.push(rows); asyncStream.push(rows);
        const finishAsync = Reflect.get(asyncStream, 'finishAsync');
        expect(typeof finishAsync).toBe('function');
        if (!finishAsync) throw new Error('Expected cancellable finish');
        const result = await finishAsync({ chunkSize: 1, yieldControl: async () => {} });
        expect(result).toEqual(sync.finish());
        expect(asyncStream.state.isDisposed).toBe(true);
      });
    }
  }
  const trajectories = [rows[0]!, { ...rows[1]!, h: 'h1' }, { ...rows[2]!, h: 'h2' }, rows[3]!, { ...rows[0]!, h: 'h3', C: 4 }];
  for (const model of ['EndPoint', 'SeparateTrajectory', 'AccumulatedTrajectory'] as const) {
    for (const window of ['Conversation', 'MovingStanzaWindow'] as const) {
      for (const backward of [2, Infinity]) for (const forward of [0, 1, Infinity]) for (const chunkSize of [1, 3]) {
        it(`shared multi-Horizon parity ${model}/${window}/back=${backward}/forward=${forward}/chunk=${chunkSize}`, async () => {
          const options = { ...base, model, window, windowSizeBack: backward, windowSizeForward: forward };
          const sync = createAccumulationStream(options);
          const streamed = createAccumulationStream(options);
          sync.push(trajectories);
          for (let index = 0; index < trajectories.length; index += chunkSize) streamed.push(trajectories.slice(index, index + chunkSize));
          const expected = sync.finish();
          const actual = await streamed.finishAsync!({ chunkSize, yieldControl: async () => {} });
          expect(actual).toEqual(expected);
          if (model !== 'EndPoint') expect(actual.trajectories?.length).toBe(5);
          expect(streamed.state.isDisposed).toBe(true);
        });
      }
    }
  }
  it('counts manually known persistent numeric slots and guards allocations before commit', () => {
    const observations: { numericCells: number; numericCellsPeak: number }[] = [];
    const stream = createAccumulationStream({ ...base, window: 'Conversation', onResources(state) { observations.push(state); } });
    stream.push(rows.slice(0, 2));
    // Two Endpoint accumulators hold3slots each; two Conversation aggregates
    // each retain a3-Code row plus a3-Code sum vector:2*(3+3+3)=18.
    expect(observations.at(-1)?.numericCells).toBe(18);
    expect(observations.at(-1)?.numericCellsPeak).toBe(18);
    stream.finish();
    // Output connectionCounts and connectionMatrix add2*2*3=12slots.
    expect(observations.at(-1)?.numericCells).toBe(30);
    const fail = createAccumulationStream({ ...base, onResources(state) { if (state.numericCells > 0) throw new Error('pre-allocation rejection'); } });
    expect(() => fail.push(rows)).toThrow('pre-allocation rejection');
    expect(fail.state.isDisposed).toBe(true);
    expect(fail.state.rowsSeen).toBe(0);
  });
  it('cancellation during Infinity flush disposes without returning any result', async () => {
    const stream = createAccumulationStream({ ...base, windowSizeForward: Infinity });
    stream.push(rows);
    const finishAsync = Reflect.get(stream, 'finishAsync');
    expect(typeof finishAsync).toBe('function');
    if (!finishAsync) throw new Error('Expected cancellable finish');
    await expect(finishAsync({ chunkSize: 1, yieldControl: async () => { throw new Error('cancelled'); } })).rejects.toThrow('cancelled');
    expect(stream.state.isDisposed).toBe(true);
  });
  it('captures transient per-row history peaks before eviction, independent of chunks', () => {
    const stream = createAccumulationStream({ ...base, windowSizeBack: 2, windowSizeForward: 1 });
    stream.push([...rows, ...rows]);
    expect(stream.state.activeBufferedRowsPeak).toBe(5);
    stream.dispose();
  });
  it('emits truthful model stages before each corresponding numerical operation', () => {
    const stream = createAccumulationStream({ ...base, window: 'Conversation' });
    stream.push(rows);
    const stages: string[] = [];
    const observed: number[] = [];
    makeSet(stream.finish(), { dimensions: 3, observer: {
      onStage(stage: string) { stages.push(stage); },
      onResources(state: { numericCells: number }) { observed.push(state.numericCells); },
    } } as never);
    expect(stages).toEqual(['normalize', 'center', 'rotate-or-project', 'position-nodes']);
    expect(observed.length).toBeGreaterThan(3);
    expect(observed.every(Number.isSafeInteger)).toBe(true);
  });
  it('the combined API forwards its operational model observer without serializing it', () => {
    const stages: string[] = [];
    const result = ena({ ...base, rows, window: 'Conversation', observer: { onStage(stage) { stages.push(stage); } } });
    expect(stages).toEqual(['normalize', 'center', 'rotate-or-project', 'position-nodes']);
    expect(result.functionParams).not.toHaveProperty('observer');
  });
});
