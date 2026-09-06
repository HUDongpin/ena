import { readFileSync } from 'node:fs';
import { lwsLeastSquaresPositions } from '../src/rotation/nodePositions.js';
import { describe, expect, it, vi } from 'vitest';
import * as api from '../src/index.js';
import { ena, type ENAOptions, type ENASet, type Row } from '../src/index.js';
import { expectStrictReferenceParity, expectStrictFrame, expectStrictStandardParity, expectRepeatedSubspaceClose, expectAbsoluteMatrixClose, type StandardGolden } from './golden-helpers.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/goldens/rena-current-standard-v3.generated.json', import.meta.url), 'utf8')) as { input: Row[]; meta: { rENAVersion: string }; configs: Record<string, StandardGolden> };

/** Infinity is a deliberate, field-specific serialization, never generic coercion. */
function optionsFor(golden: typeof fixture.configs[string]): ENAOptions {
  const options = { ...golden.options };
  for (const field of ['windowSizeBack', 'windowSizeForward'] as const) {
    if (options[field] === 'Infinity') options[field] = Infinity;
    expect(typeof options[field]).toBe('number');
  }
  return { rows: fixture.input, ...options } as ENAOptions;
}

describe('pinned official rENA 0.4.4 Standard v3 complete parity', () => {
  it('requires the complete oracle, including all 14 configurations', () => {
    expect(fixture.input).toHaveLength(48);
    expect(Object.keys(fixture.configs)).toHaveLength(14);
    expect(fixture.meta.rENAVersion).toBe('0.4.4');
  });
  for (const [name, golden] of Object.entries(fixture.configs)) {
    it(`matches rows, aggregate counts, weights, center, full geometry and Reference: ${name}`, () => {
      const options = optionsFor(golden);
      const actual = ena(options);
      // R retains all six axes despite dimensions=3. A second materialization
      // requests its declared full output; this does not fit a different model.
      const full = ena({ ...options, dimensions: golden.dimensions.returned });
      expectStrictStandardParity(actual, full, golden, options);
      const target = fixture.configs[name === 'endpointMovingBinary' ? 'endpointMovingFrequency' : 'endpointMovingBinary']!;
      expectStrictReferenceParity(full, golden, target, optionsFor(target));
    });
  }
});

describe('strict comparison controls', () => {
  it('uses absolute tolerances and rejects missing/nonfinite cells', () => {
    expectAbsoluteMatrixClose([[1 + 0.5e-10]], [[1]], 1e-10);
    expect(() => expectAbsoluteMatrixClose([[1 + 2e-10]], [[1]], 1e-10)).toThrow();
    expect(() => expectAbsoluteMatrixClose([[NaN]], [[0]], 1e-10)).toThrow();
    expect(() => expectAbsoluteMatrixClose([[]], [[0]], 1e-10)).toThrow();
  });
  it('accepts a rotated repeated plane and rejects a different plane', () => {
    const c = Math.SQRT1_2;
    const plane = [[1, 0], [0, 1], [0, 0]];
    expectRepeatedSubspaceClose([[c, -c], [c, c], [0, 0]], plane, 1e-8);
    expect(() => expectRepeatedSubspaceClose([[1, 0], [0, 0], [0, 1]], plane, 1e-8)).toThrow();
  });
});

describe('unregularized Standard nodes', () => {
  it('solves a singular design with its minimum-norm nodes', () => {
    const result = lwsLeastSquaresPositions([[1]], [[2]], 2);
    expectAbsoluteMatrixClose(result.nodes, [[2], [2]], 1e-12);
    expectAbsoluteMatrixClose(result.centroids, [[2]], 1e-12);
  });
});

describe('frame anti-forgiveness controls', () => {
  for (const name of ['endpointMovingMeans', 'endpointConversationMeans']) {
    it(`rejects reversed MR1 and reversed group roles: ${name}`, () => {
      const golden = fixture.configs[name]!;
      const options = { ...optionsFor(golden), dimensions: golden.dimensions.returned };
      const good = ena(options);
      const frame = golden.canonicalMeansFrame!;
      expectStrictFrame(good, frame, good.codeColumns, true);
      const reversed = structuredClone(good);
      reversed.rotation.rotationMatrix.forEach((row) => { row[0]! *= -1; });
      for (const table of [reversed.points, reversed.rotation.nodes!, reversed.centroids!]) table.forEach((row) => { row.MR1 = -(row.MR1 as number); });
      expect(() => expectStrictFrame(reversed, frame, good.codeColumns, true)).toThrow();
      const wrongGroups = ena({ ...options, rotation: { method: 'mean', params: { groups: [[['U5', 'U6', 'U7', 'U8'], ['U1', 'U2', 'U3', 'U4']]] } } });
      expect(() => expectStrictFrame(wrongGroups, frame, good.codeColumns, true)).toThrow();
    });
  }
  it('rejects unequal-eigenaxis swaps and independent node signs', () => {
    const golden = fixture.configs.endpointMovingBinary!;
    const good = ena({ ...optionsFor(golden), dimensions: golden.dimensions.returned });
    expectStrictFrame(good, golden, good.codeColumns, false);
    const swapped = structuredClone(good);
    swapped.rotation.rotationMatrix.forEach((row) => { [row[0], row[1]] = [row[1]!, row[0]!]; });
    for (const table of [swapped.points, swapped.rotation.nodes!, swapped.centroids!]) table.forEach((row) => { [row.SVD1, row.SVD2] = [row.SVD2!, row.SVD1!]; });
    expect(() => expectStrictFrame(swapped, golden, good.codeColumns, false)).toThrow();
    const badNodes = structuredClone(good);
    badNodes.rotation.nodes!.forEach((row) => { row.SVD1 = -(row.SVD1 as number); });
    expect(() => expectStrictFrame(badNodes, golden, good.codeColumns, false)).toThrow();
    const missingVariance = structuredClone(good);
    delete missingVariance.variance.SVD6;
    expect(() => expectStrictFrame(missingVariance, golden, good.codeColumns, false)).toThrow();
  });
});

describe('repeated block geometry consistency', () => {
  it('uses one repeated-block transform for basis, points, nodes and centroids', () => {
    const golden = fixture.configs.endpointMovingBinary!;
    const source = ena({ ...optionsFor(golden), dimensions: 6 });
    const names = source.rotation.rotationColumns;
    source.variance = Object.fromEntries(names.map((name, i) => [name, [0.4, 0.4, 0.1, 0.06, 0.03, 0.01][i]!]));
    const frame = {
      points: structuredClone(source.points), nodes: structuredClone(source.rotation.nodes!),
      centroids: structuredClone(source.centroids!), rotationColumns: names,
      variance: source.variance,
      rotationMatrix: source.rotation.rotationMatrix.map((row, i) => ({ codes: source.codeColumns[i]!, ...Object.fromEntries(names.map((name, j) => [name, row[j]!])) }))
    };
    const rotated = structuredClone(source);
    const c = Math.SQRT1_2;
    for (const row of rotated.rotation.rotationMatrix) {
      const [x, y] = row as [number, number];
      row[0] = c * (x + y); row[1] = c * (y - x);
    }
    for (const table of [rotated.points, rotated.rotation.nodes!, rotated.centroids!]) for (const row of table) {
      const x = row.SVD1 as number, y = row.SVD2 as number;
      row.SVD1 = c * (x + y); row.SVD2 = c * (y - x);
    }
    expectStrictFrame(rotated, frame, source.codeColumns, false);
    const inconsistent = structuredClone(rotated);
    inconsistent.centroids = source.centroids!;
    expect(() => expectStrictFrame(inconsistent, frame, source.codeColumns, false)).toThrow();
  });
});


const identityCases: Array<{ name: string; rows: (set: ENASet) => Row[]; field: string }> = [
  { name: 'aggregate Unit', rows: (set) => set.connectionCounts, field: 'unit' },
  { name: 'weight Unit', rows: (set) => set.lineWeights, field: 'unit' },
  { name: 'centered ENA_UNIT', rows: (set) => set.pointsForProjection, field: 'ENA_UNIT' },
  { name: 'point Unit', rows: (set) => set.points, field: 'unit' },
  { name: 'point ENA_UNIT', rows: (set) => set.points, field: 'ENA_UNIT' },
  { name: 'centroid label', rows: (set) => set.centroids!, field: 'unit' },
  { name: 'trajectory Unit', rows: (set) => set.trajectories!, field: 'unit' },
  { name: 'trajectory ENA_UNIT', rows: (set) => set.trajectories!, field: 'ENA_UNIT' },
  { name: 'trajectory Horizon', rows: (set) => set.trajectories!, field: 'horizon' },
  { name: 'node Code', rows: (set) => set.rotation.nodes!, field: 'code' }
];
const identityMutations: Array<{ name: string; apply: (row: Row, field: string) => void }> = [
  { name: 'wrong', apply: (row, field) => { row[field] = 'WRONG'; } },
  { name: 'missing', apply: (row, field) => { delete row[field]; } },
  { name: 'wrong type', apply: (row, field) => { row[field] = 1; } }
];

function parityInputs(name: string) {
  const golden = fixture.configs[name]!;
  const options = optionsFor(golden);
  return { golden, options, actual: ena(options), full: ena({ ...options, dimensions: golden.dimensions.returned }) };
}

describe('typed identities on requested and complete tables', () => {
  for (const name of ['separateMovingBinary', 'separateConversationBinary']) {
    for (const view of ['actual', 'full'] as const) for (const identity of identityCases) {
      it(`rejects wrong, missing and type-changed ${view} ${identity.name}: ${name}`, () => {
        const good = parityInputs(name);
        for (const mutation of identityMutations) {
          const changed = structuredClone(good[view]);
          mutation.apply(identity.rows(changed)[0]!, identity.field);
          expect(() => expectStrictStandardParity(view === 'actual' ? changed : good.actual, view === 'full' ? changed : good.full, good.golden, good.options), mutation.name).toThrow();
        }
      });
    }
    for (const view of ['actual', 'full'] as const) {
      it(`rejects spoofed Horizon fields and tuple reordering in ${view}: ${name}`, () => {
        const good = parityInputs(name);
        for (const table of ['connectionCounts', 'lineWeights', 'pointsForProjection', 'points'] as const) {
          const changed = structuredClone(good[view]);
          // A compact row has no Horizon field, even one copied from the
          // right trajectory row: schema expansion must happen in the helper.
          changed[table][0]!.horizon = changed.trajectories![0]!.horizon!;
          expect(() => expectStrictStandardParity(view === 'actual' ? changed : good.actual, view === 'full' ? changed : good.full, good.golden, good.options)).toThrow();
        }
        const reordered = structuredClone(good[view]);
        [reordered.trajectories![0], reordered.trajectories![1]] = [reordered.trajectories![1]!, reordered.trajectories![0]!];
        expect(() => expectStrictStandardParity(view === 'actual' ? reordered : good.actual, view === 'full' ? reordered : good.full, good.golden, good.options)).toThrow();
      });
    }
  }
});

describe('requested coordinate completeness', () => {
  for (const name of ['endpointMovingBinary', 'endpointMovingMeans']) {
    for (const table of ['nodes', 'centroids'] as const) {
      it(`rejects corrupt, absent, nonfinite and extra requested ${table} coordinates: ${name}`, () => {
        const good = parityInputs(name);
        const axis = good.full.rotation.rotationColumns[0]!;
        for (const mutation of [
          (row: Row) => { row[axis] = 999; },
          (row: Row) => { delete row[axis]; },
          (row: Row) => { row[axis] = NaN; },
          (row: Row) => { row[good.full.rotation.rotationColumns[3]!] = 0; }
        ]) {
          const changed = structuredClone(good.actual);
          mutation((table === 'nodes' ? changed.rotation.nodes! : changed.centroids!)[0]!);
          expect(() => expectStrictStandardParity(changed, good.full, good.golden, good.options)).toThrow();
        }
      });
    }
  }
});

describe('Reference target identity rejection', () => {
  for (const name of ['separateMovingBinary', 'separateConversationBinary']) {
    it(`accepts the source-bound expanded target identity: ${name}`, () => {
      const source = parityInputs('endpointMovingBinary');
      const target = fixture.configs[name]!;
      expectStrictReferenceParity(source.full, source.golden, target, optionsFor(target));
    });
    it(`rejects spoofed compact Horizon and reordered Reference tuples: ${name}`, () => {
      const source = parityInputs('endpointMovingBinary');
      const target = fixture.configs[name]!;
      const original = api.makeSet;
      const mutations: Array<(set: ENASet) => void> = [
        ...(['connectionCounts', 'lineWeights', 'pointsForProjection', 'points'] as const).map((table) => (set: ENASet) => { set[table][0]!.horizon = set.trajectories![0]!.horizon!; }),
        (set) => { [set.trajectories![0], set.trajectories![1]] = [set.trajectories![1]!, set.trajectories![0]!]; }
      ];
      for (const mutate of mutations) {
        const spy = vi.spyOn(api, 'makeSet').mockImplementation((...args: Parameters<typeof api.makeSet>) => {
          const result = original(...args); mutate(result); return result;
        });
        try {
          expect(() => expectStrictReferenceParity(source.full, source.golden, target, optionsFor(target))).toThrow();
        } finally { spy.mockRestore(); }
      }
    });
    for (const identity of identityCases) {
      it(`rejects wrong, missing and type-changed Reference ${identity.name}: ${name}`, () => {
        const source = parityInputs('endpointMovingBinary');
        const target = fixture.configs[name]!;
        const original = api.makeSet;
        for (const mutation of identityMutations) {
          // Only the comparator test intercepts the returned projection. The
          // real accumulation/projection still runs; production is untouched.
          const spy = vi.spyOn(api, 'makeSet').mockImplementation((...args: Parameters<typeof api.makeSet>) => {
            const result = original(...args);
            mutation.apply(identity.rows(result)[0]!, identity.field);
            return result;
          });
          try {
            expect(() => expectStrictReferenceParity(source.full, source.golden, target, optionsFor(target)), mutation.name).toThrow();
          } finally {
            spy.mockRestore();
          }
        }
      });
    }
  }
});

describe('requested geometry has one absolute R allowance', () => {
  for (const name of ['endpointMovingBinary', 'endpointMovingMeans']) {
    for (const table of ['nodes', 'centroids'] as const) {
      it(`rejects composed tolerance for ${table}: ${name}`, () => {
        const { golden, options, actual, full } = parityInputs(name);
        const frame = golden.canonicalMeansFrame ?? golden;
        const axis = frame.rotationColumns[0]!;
        const dot = full.rotation.rotationMatrix.reduce((sum, row, i) => sum + row[0]! * (frame.rotationMatrix[i]![axis] as number), 0);
        const sign = options.rotation?.method === 'mean' ? 1 : dot < 0 ? -1 : 1;
        const requestedRows = table === 'nodes' ? actual.rotation.nodes! : actual.centroids!;
        const fullRows = table === 'nodes' ? full.rotation.nodes! : full.centroids!;
        const expected = frame[table][0]![axis] as number;
        fullRows[0]![axis] = sign * (expected + 0.8e-10);
        requestedRows[0]![axis] = fullRows[0]![axis]!;
        // A shared prefix inside the one R allowance remains admissible.
        expectStrictStandardParity(actual, full, golden, options);
        requestedRows[0]![axis] = sign * (expected + 1.6e-10);
        expect(Math.abs(sign * (requestedRows[0]![axis] as number) - expected)).toBeGreaterThan(1e-10);
        expect(() => expectStrictStandardParity(actual, full, golden, options)).toThrow();
      });
    }
  }
});
