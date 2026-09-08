import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const fixturePath = fileURLToPath(new URL('../fixtures/goldens/rena-current-standard-v3.generated.json', import.meta.url));
const scriptPath = fileURLToPath(new URL('../scripts/regen-standard-v3-goldens.R', import.meta.url));
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const expectedCases = [
  'endpointMovingBinary', 'endpointMovingFrequency', 'separateMovingBinary',
  'separateMovingFrequency', 'accumulatedMovingBinary', 'accumulatedMovingFrequency',
  'endpointConversationBinary', 'endpointConversationFrequency', 'separateConversationBinary',
  'separateConversationFrequency', 'accumulatedConversationBinary', 'accumulatedConversationFrequency',
  'endpointMovingMeans', 'endpointConversationMeans',
];

describe('current rENA Standard v3 independent oracle manifest', () => {
  it('ships the independent generator and its pinned artifact manifest', () => {
    expect(existsSync(scriptPath), 'independent R generator').toBe(true);
    expect(existsSync(fixturePath), 'current rENA golden fixture').toBe(true);
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    expect(fixture.meta.rENAVersion).toMatch(/^0\.4\./);
    expect(fixture.meta.packageSource).toBe('https://cran.qe-libs.org');
    expect(fixture.meta.packageArtifactSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(fixture.meta.generatorScriptSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(fixture.meta.generatorScriptSha256).toBe(sha256(readFileSync(scriptPath)));
    expect(fixture.meta.rVersion).toMatch(/^R version/);
    expect(Object.keys(fixture.configs).sort()).toEqual(expectedCases.sort());
    expect(fixture.configs).toHaveProperty('endpointMovingBinary');
    expect(fixture.configs).toHaveProperty('accumulatedConversationFrequency');
  });
});

// These checks validate the oracle's custody and completeness, not jENA parity.
// The official list API currently retains six axes despite dimensions=3.
const readFixture = () => JSON.parse(readFileSync(fixturePath, 'utf8'));
const cases = [
  ['endpointMovingBinary', 'EndPoint', 'binary', 'MovingStanzaWindow', 1, 0, 'svd'],
  ['endpointMovingFrequency', 'EndPoint', 'sum', 'MovingStanzaWindow', 3, 0, 'svd'],
  ['separateMovingBinary', 'SeparateTrajectory', 'binary', 'MovingStanzaWindow', 2, 2, 'svd'],
  ['separateMovingFrequency', 'SeparateTrajectory', 'sum', 'MovingStanzaWindow', 'Infinity', 0, 'svd'],
  ['accumulatedMovingBinary', 'AccumulatedTrajectory', 'binary', 'MovingStanzaWindow', 2, 'Infinity', 'svd'],
  ['accumulatedMovingFrequency', 'AccumulatedTrajectory', 'sum', 'MovingStanzaWindow', 'Infinity', 'Infinity', 'svd'],
  ['endpointConversationBinary', 'EndPoint', 'binary', 'Conversation', 'Infinity', 0, 'svd'],
  ['endpointConversationFrequency', 'EndPoint', 'sum', 'Conversation', 'Infinity', 0, 'svd'],
  ['separateConversationBinary', 'SeparateTrajectory', 'binary', 'Conversation', 'Infinity', 0, 'svd'],
  ['separateConversationFrequency', 'SeparateTrajectory', 'sum', 'Conversation', 'Infinity', 0, 'svd'],
  ['accumulatedConversationBinary', 'AccumulatedTrajectory', 'binary', 'Conversation', 'Infinity', 0, 'svd'],
  ['accumulatedConversationFrequency', 'AccumulatedTrajectory', 'sum', 'Conversation', 'Infinity', 0, 'svd'],
  ['endpointMovingMeans', 'EndPoint', 'binary', 'MovingStanzaWindow', 2, 1, 'mean'],
  ['endpointConversationMeans', 'EndPoint', 'binary', 'Conversation', 'Infinity', 0, 'mean'],
] as const;
const edges = ['A & B', 'A & C', 'B & C', 'A & D', 'B & D', 'C & D'];
type NumericRow = Record<string, number | string>;
const numericColumns = (rows: NumericRow[], columns: readonly string[]) => {
  for (const row of rows) {
    for (const column of columns) {
      expect(typeof row[column], column).toBe('number');
      expect(Number.isFinite(row[column]), column).toBe(true);
    }
  }
};

describe('Standard v3 oracle completeness and scientific shape', () => {
  it('pins the selected stable source and real runtime separately from the development index', () => {
    const { meta } = readFixture();
    expect(meta.rENAVersion).toBe('0.4.4');
    expect(meta.packageArtifactSha256).toBe('2aae98760ea6e304a90fba8efa95f546b61e9aeaf021c5de506b730a5606dc2e');
    expect(meta.packageArtifactUrl).toBe('https://cran.qe-libs.org/src/contrib/rENA_0.4.4.tar.gz');
    expect(meta.packageSourceResolved).toBe('https://qe-libs.org/cran/');
    expect(meta.packageIndexVersionObserved).toBe('0.4.4.9000');
    expect(meta.packageStableVersionObserved).toBe('0.4.4');
    expect(meta.packageInstalledPath).toContain('/task34-rlib/rENA');
    expect(meta.platform).toBe('aarch64-apple-darwin20');
    expect(meta.dependencyVersions).toMatchObject({ rENA: '0.4.4', tma: '0.3.3', libqe: '0.1.2.9002' });
    expect(meta.dependencyProvenance.libqe).toMatchObject({
      version: '0.1.2.9002', developmentBuild: true,
      packageArtifactSha256: '4981e5a1958fd373cc0ed6e48b9b9226d575fe7db9e21f36a45554c811dd2d3a',
    });
    expect(meta.dependencyProvenance.libqe.installedLibrarySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(meta.dependencyProvenance.tma.packageArtifactSha256).toBe('37eb602ffc67018ded88c3f99ff85c989e0674b0c4b09fca449c6c1a8dcca9d2');
    expect(meta.rng).toEqual({ seed: 340044, kind: ['Mersenne-Twister', 'Inversion', 'Rejection'] });
    expect(meta.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(Number.isFinite(Date.parse(meta.generatedAt))).toBe(true);
  });

  it('uses one stable strictly binary coded input for every weighting mode', () => {
    const fixture = readFixture();
    expect(fixture.codes).toEqual(['A', 'B', 'C', 'D']);
    expect(fixture.input).toHaveLength(48);
    expect(fixture.input.map((row: NumericRow) => row.row)).toEqual(Array.from({ length: 48 }, (_, i) => i + 1));
    expect(new Set(fixture.input.map((row: NumericRow) => row.unit)).size).toBe(8);
    expect(new Set(fixture.input.map((row: NumericRow) => row.horizon))).toEqual(new Set(['H1', 'H2', 'H3']));
    for (const row of fixture.input) {
      for (const code of fixture.codes) expect([0, 1]).toContain(row[code]);
      expect(row.group).toBe(['U1', 'U2', 'U3', 'U4'].includes(row.unit) ? 'Positive' : 'Negative');
    }
  });

  it.each(cases)('%s retains exact arguments and complete actual R matrices', (name, model, weightBy, window, back, forward, rotation) => {
    const config = readFixture().configs[name];
    expect(config.options).toMatchObject({
      units: ['unit'], conversation: ['horizon'], codes: ['A', 'B', 'C', 'D'], metadata: ['group'],
      networkType: 'standard', model, weightBy, window, windowSizeBack: back, windowSizeForward: forward,
      dimensions: 3, centerAlignToOrigin: true, includeMeta: true, nodePositionMethod: 'undirected',
      rotation: { method: rotation },
    });
    expect(config.rArguments.accumulate).toMatchObject({
      model, window, 'weight.by': weightBy === 'sum' ? 'base::sum' : 'binary',
      'window.size.back': back, 'window.size.forward': forward, 'as.list': true,
    });
    expect(config.rArguments.makeSet.dimensions).toBe(3);
    expect(config.dimensions).toEqual({ requested: 3, returned: 6 });
    expect(config.rotationColumns).toEqual([rotation === 'mean' ? 'MR1' : 'SVD1', 'SVD2', 'SVD3', 'SVD4', 'SVD5', 'SVD6']);
    const rows = model === 'EndPoint' ? 8 : 24;
    expect(config.rowCounts).toEqual({ input: 48, rowConnections: window === 'Conversation' ? 24 : 48,
      connections: rows, points: rows, trajectories: model === 'EndPoint' ? 0 : 24 });
    expect(config.rowConnectionCounts).toHaveLength(config.rowCounts.rowConnections);
    for (const field of ['connectionCounts', 'lineWeights', 'centeredPoints', 'points', 'unitLabels']) {
      expect(config[field], field).toHaveLength(rows);
    }
    expect(config.trajectories).toHaveLength(config.rowCounts.trajectories);
    for (const field of ['rowConnectionCounts', 'connectionCounts', 'lineWeights', 'centeredPoints']) {
      numericColumns(config[field], edges);
    }
    for (const row of config.connectionCounts) {
      for (const edge of edges) expect(Number.isInteger(row[edge]) && row[edge] >= 0).toBe(true);
    }
    expect(config.rotationMatrix.map((row: NumericRow) => row.codes)).toEqual(edges);
    expect(config.nodes.map((row: NumericRow) => row.code)).toEqual(['A', 'B', 'C', 'D']);
    for (const field of ['points', 'nodes', 'rotationMatrix', 'centroids']) numericColumns(config[field], config.rotationColumns);
    expect(Object.keys(config.variance).sort()).toEqual([...config.rotationColumns].sort());
    const variance = Object.values(config.variance) as number[];
    expect(variance.every(value => Number.isFinite(value) && value >= 0)).toBe(true);
    expect(variance.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    if (rotation === 'mean') {
      const positive = ['U1', 'U2', 'U3', 'U4'];
      const negative = ['U5', 'U6', 'U7', 'U8'];
      expect(config.options.rotation.params.groups).toEqual([[positive, negative]]);
      expect(config.rArguments.makeSet['rotation.params']).toEqual([[positive, negative]]);
      expect(config.meansDirection).toMatchObject({ positive, negative, expression: 'mean(Positive) - mean(Negative)', returnedAxisSign: -1 });
      const mean = (units: string[]) => config.points.filter((row: NumericRow) => units.includes(String(row.unit)))
        .reduce((sum: number, row: NumericRow) => sum + Number(row.MR1), 0) / units.length;
      // Official libqe QR reverses MR1 for these two fixed inputs. Preserve that
      // observed direction; an assumed positive output would falsify the oracle.
      const contrast = mean(positive) - mean(negative);
      expect(contrast).toBeLessThan(0);
      expect(config.meansDirection.returnedMR1Contrast).toBeCloseTo(contrast, 14);
      const canonical = config.canonicalMeansFrame;
      expect(canonical, 'separate fixed Positive-minus-Negative R view').toBeDefined();
      expect(canonical.orientation.multiplier).toBe(-1);
      expect(canonical.orientation.canonicalMR1Contrast).toBeGreaterThan(0);
      expect(canonical.variance).toEqual(config.variance);
      expect(canonical.rotationColumns).toEqual(config.rotationColumns);
      for (const field of ['points', 'nodes', 'rotationMatrix', 'centroids']) {
        expect(canonical[field]).toHaveLength(config[field].length);
        for (let i = 0; i < config[field].length; i++) {
          expect(canonical[field][i]).toEqual({ ...config[field][i], MR1: -config[field][i].MR1 });
        }
      }
      const canonicalMean = (units: string[]) => canonical.points.filter((row: NumericRow) => units.includes(String(row.unit)))
        .reduce((sum: number, row: NumericRow) => sum + Number(row.MR1), 0) / units.length;
      expect(canonicalMean(positive) - canonicalMean(negative)).toBeGreaterThan(0);
    }
  });
});
