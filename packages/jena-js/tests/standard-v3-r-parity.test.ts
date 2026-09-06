import { readFileSync } from 'node:fs';
import { lwsLeastSquaresPositions } from '../src/rotation/nodePositions.js';
import { describe, expect, it } from 'vitest';
import { ena, type ENAOptions, type Row } from '../src/index.js';
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
