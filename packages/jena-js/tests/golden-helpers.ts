import { expect } from "vitest";
import { accumulateData, makeSet } from '../src/index.js';
import type { ENASet, Matrix, Row } from "../src/index.js";

export type Tolerance = { atol: number; rtol: number };

export const POINT_TOLERANCE: Tolerance = { atol: 5e-7, rtol: 0 };
// Historical rENA 0.3.1 acceptance bounds, preserved for its original suite.
// Current Standard node positioning is ridge-free and the v3 suite below
// enforces 1e-10 even for nodes; these legacy bounds are not reused there.
export const NODE_TOLERANCE: Tolerance = { atol: 4e-6, rtol: 2e-6 };

// Shares below this threshold correspond to numerically null directions where
// eigenvector orientation is arbitrary, so those columns are not comparable.
export const NEGLIGIBLE_VARIANCE_SHARE = 1e-9;

export type ProjectionGolden = {
  points: Row[];
  nodes: Row[];
  rotationMatrix: Row[];
  variance: number[];
};

export function codeColumns(codes: string[]): string[] {
  const columns: string[] = [];
  for (let target = 1; target < codes.length; target += 1) {
    for (let source = 0; source < target; source += 1) {
      columns.push(`${codes[source]} & ${codes[target]}`);
    }
  }
  return columns;
}

export function matrixFromRows(rows: Row[], columns: string[]): Matrix {
  return rows.map((row) => columns.map((column) => Number(row[column] ?? 0)));
}

export function expectMatrixClose(actual: Matrix, expected: Matrix, precision = 12) {
  expect(actual.length).toBe(expected.length);
  for (let row = 0; row < expected.length; row += 1) {
    expect(actual[row]?.length).toBe(expected[row]?.length);
    for (let column = 0; column < (expected[row]?.length ?? 0); column += 1) {
      expect(actual[row]?.[column] ?? 0).toBeCloseTo(expected[row]?.[column] ?? 0, precision);
    }
  }
}

// rENA dimension signs are arbitrary (SVD sign indeterminacy), so columns are
// compared up to a per-column sign chosen by the dot product with the golden.
export function columnSign(actual: number[], expected: number[]): number {
  const dot = expected.reduce((total, value, index) => total + value * (actual[index] ?? 0), 0);
  return dot < 0 ? -1 : 1;
}

export function expectProjectedRowsClose(actual: Row[], expected: Row[], columns: string[], tolerance: Tolerance) {
  expect(actual.length).toBe(expected.length);
  for (const column of columns) {
    const actualValues = actual.map((row) => Number(row[column] ?? 0));
    const expectedValues = expected.map((row) => Number(row[column] ?? 0));
    const sign = columnSign(actualValues, expectedValues);
    for (let row = 0; row < expectedValues.length; row += 1) {
      const expectedValue = expectedValues[row] ?? 0;
      const difference = Math.abs((actualValues[row] ?? 0) * sign - expectedValue);
      const bound = tolerance.atol + tolerance.rtol * Math.abs(expectedValue);
      expect(difference, `${column} row ${row}: |${(actualValues[row] ?? 0) * sign} - ${expectedValue}|`).toBeLessThanOrEqual(bound);
    }
  }
}

export function expectStringColumns(actual: Row[], expected: Row[], columns: string[]) {
  expect(actual.length).toBe(expected.length);
  for (let row = 0; row < expected.length; row += 1) {
    for (const column of columns) {
      expect(String(actual[row]?.[column] ?? "")).toBe(String(expected[row]?.[column] ?? ""));
    }
  }
}

export function fixtureRotationColumns(config: { rotationMatrix: Row[] }): string[] {
  const first = config.rotationMatrix[0] ?? {};
  return Object.keys(first).filter((key) => key !== "codes");
}

/**
 * Asserts a jena ENASet against an rENA golden: rotation column names
 * (rENA's rank-retained columns must be a prefix of jena's), projected
 * points and node positions for the displayed dimensions, variance shares
 * over all rotated dimensions, and the rotation matrix column-by-column up
 * to sign wherever the direction carries non-negligible variance.
 */
export function expectProjectionParity(set: ENASet, config: ProjectionGolden, datasetColumns: string[], displayDimensions: number) {
  const goldenColumns = fixtureRotationColumns(config);
  expect(set.rotation.rotationColumns.slice(0, goldenColumns.length)).toEqual(goldenColumns);

  const displayColumns = goldenColumns.slice(0, displayDimensions);
  expectProjectedRowsClose(set.points, config.points, displayColumns, POINT_TOLERANCE);
  const nodes = set.rotation.nodes ?? [];
  expectStringColumns(nodes, config.nodes, ["code"]);
  expectProjectedRowsClose(nodes, config.nodes, displayColumns, NODE_TOLERANCE);

  // Variance parity is junk-aware: rENA's prcomp keeps min(n, k) columns and
  // its numerically-null trailing directions come from LAPACK's arbitrary
  // null-space basis, which can absorb a real variance share (observed at
  // ~5% on the regression-rotation fixtures — see NUMERICS.md). jena
  // completes those directions orthogonally to the data instead, so shares
  // are compared renormalized over the columns that carry variance on BOTH
  // sides. For SVD/mean rotations no such junk exists and this reduces to a
  // strict per-column check.
  const shares = set.rotation.rotationColumns.map((column) => set.variance[column] ?? 0);
  expect(shares.length).toBeGreaterThanOrEqual(config.variance.length);
  const realIndices: number[] = [];
  for (let index = 0; index < config.variance.length; index += 1) {
    if ((config.variance[index] ?? 0) >= NEGLIGIBLE_VARIANCE_SHARE && (shares[index] ?? 0) >= NEGLIGIBLE_VARIANCE_SHARE) {
      realIndices.push(index);
    }
  }
  expect(realIndices.length, "commonly spanned variance columns").toBeGreaterThanOrEqual(displayDimensions);
  const goldenRealTotal = realIndices.reduce((sum, index) => sum + (config.variance[index] ?? 0), 0);
  const jenaRealTotal = realIndices.reduce((sum, index) => sum + (shares[index] ?? 0), 0);
  for (const index of realIndices) {
    expect((shares[index] ?? 0) / jenaRealTotal, `variance share ${index} (renormalized)`)
      .toBeCloseTo((config.variance[index] ?? 0) / goldenRealTotal, 9);
  }
  for (let index = config.variance.length; index < shares.length; index += 1) {
    expect(Math.abs(shares[index] ?? 0), `extra variance share ${index}`).toBeLessThan(NEGLIGIBLE_VARIANCE_SHARE);
  }

  const jenaRotationRows = new Map<string, number[]>();
  set.rotation.rotationMatrix.forEach((row, index) => {
    jenaRotationRows.set(datasetColumns[index] ?? String(index), row);
  });
  for (let columnIndex = 0; columnIndex < goldenColumns.length; columnIndex += 1) {
    if (!realIndices.includes(columnIndex)) continue;
    const columnName = goldenColumns[columnIndex] ?? "";
    const expectedColumn = config.rotationMatrix.map((row) => Number(row[columnName] ?? 0));
    const actualColumn = config.rotationMatrix.map((row) => {
      const jenaRow = jenaRotationRows.get(String(row.codes ?? ""));
      expect(jenaRow, `rotation row for ${String(row.codes)}`).toBeTruthy();
      return jenaRow?.[columnIndex] ?? 0;
    });
    const sign = columnSign(actualColumn, expectedColumn);
    for (let row = 0; row < expectedColumn.length; row += 1) {
      expect((actualColumn[row] ?? 0) * sign, `rotation ${columnName} row ${row}`).toBeCloseTo(expectedColumn[row] ?? 0, 6);
    }
  }
}

// Current Standard oracle helpers deliberately do not use any legacy tolerance,
// zero filling, variance renormalization, or independently selected table signs.
export function strictMatrix(rows: Row[], columns: string[]): Matrix {
  return rows.map((row, i) => columns.map((column) => {
    const value = row[column];
    expect(typeof value, `row ${i} ${column} must exist and be numeric`).toBe('number');
    expect(Number.isFinite(value), `row ${i} ${column} must be finite`).toBe(true);
    return value as number;
  }));
}

export function expectAbsoluteMatrixClose(actual: Matrix, expected: Matrix, tolerance: number, label = 'matrix'): void {
  expect(Number.isFinite(tolerance) && tolerance >= 0).toBe(true);
  expect(actual.length, `${label} rows`).toBe(expected.length);
  const width = expected[0]?.length ?? 0;
  expected.forEach((row, i) => {
    expect(row.length, `${label} rectangular oracle`).toBe(width);
    expect(actual[i]?.length, `${label} row ${i} width`).toBe(width);
    row.forEach((value, j) => {
      const observed = actual[i]![j]!;
      expect(Number.isFinite(value) && Number.isFinite(observed), `${label}[${i},${j}] finite`).toBe(true);
      expect(Math.abs(observed - value), `${label}[${i},${j}]: |${observed} - ${value}|`).toBeLessThanOrEqual(tolerance);
    });
  });
}

export function projector(basis: Matrix): Matrix {
  return basis.map((left) => basis.map((right) => left.reduce((sum, value, i) => sum + value * right[i]!, 0)));
}

export function expectRepeatedSubspaceClose(actual: Matrix, expected: Matrix, tolerance: number): void {
  expectAbsoluteMatrixClose(actual, actual, 0, 'finite actual basis');
  expectAbsoluteMatrixClose(expected, expected, 0, 'finite expected basis');
  expect(actual.length).toBe(expected.length);
  expect(actual[0]?.length).toBe(expected[0]?.length);
  for (const basis of [actual, expected]) {
    const k = basis[0]!.length;
    const gram = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => basis.reduce((s, row) => s + row[i]! * row[j]!, 0)));
    expectAbsoluteMatrixClose(gram, Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => Number(i === j))), tolerance, 'orthonormal basis');
  }
  expectAbsoluteMatrixClose(projector(actual), projector(expected), tolerance, 'edge-space projector');
}

export interface StandardFrame {
  points: Row[]; nodes: Row[]; centroids: Row[];
  rotationMatrix: Row[]; rotationColumns: string[]; variance: Record<string, number>;
}
export interface StandardGolden extends StandardFrame {
  options: Omit<import('../src/index.js').ENAOptions, 'rows' | 'windowSizeBack' | 'windowSizeForward'> & { windowSizeBack: number | 'Infinity'; windowSizeForward: number | 'Infinity' };
  rowConnectionCounts: Row[]; connectionCounts: Row[]; lineWeights: Row[];
  centeredPoints: Row[]; centerVector: Row; unitLabels: string[]; trajectories: Row[];
  rowCounts: { input: number; rowConnections: number; connections: number; points: number; trajectories: number };
  dimensions: { requested: number; returned: number };
  canonicalMeansFrame?: StandardFrame;
}

function exactFields(actual: Row[], expected: Row[], columns: string[], label: string): void {
  expect(actual.length, `${label} rows`).toBe(expected.length);
  expected.forEach((row, i) => columns.forEach((column) => {
    expect(Object.hasOwn(row, column), `${label} expected ${column}`).toBe(true);
    expect(Object.hasOwn(actual[i]!, column), `${label} actual ${column}`).toBe(true);
    expect(actual[i]![column], `${label}[${i}].${column}`).toEqual(row[column]);
  }));
}

function columns(matrix: Matrix, indices: number[]): Matrix {
  return matrix.map((row) => indices.map((i) => row[i]!));
}
function product(a: Matrix, b: Matrix): Matrix {
  return a.map((row) => Array.from({ length: b[0]!.length }, (_, j) => row.reduce((sum, value, k) => sum + value * b[k]![j]!, 0)));
}
function distances(matrix: Matrix): Matrix {
  return matrix.map((left) => matrix.map((right) => Math.hypot(...left.map((x, i) => x - right[i]!))));
}

/** Only equal-variance blocks may mix; MR1 is always a fixed singleton. */
export function expectStrictFrame(actual: ENASet, expected: StandardFrame, edges: string[], fixedMeans: boolean): Matrix {
  const names = expected.rotationColumns;
  expect(actual.rotation.rotationColumns).toEqual(names);
  expect(actual.rotation.rotationMatrix.length).toBe(edges.length);
  expect(expected.rotationMatrix.map((row) => row.codes)).toEqual(edges);
  const a = actual.rotation.rotationMatrix;
  const b = strictMatrix(expected.rotationMatrix, names);
  expectAbsoluteMatrixClose(a, a, 0, 'full rotation shape');
  expect(a[0]!.length).toBe(names.length);
  expect(Object.keys(expected.variance).sort()).toEqual([...names].sort());
  const actualVariance = names.map((name) => actual.variance[name]!);
  const expectedVariance = names.map((name) => expected.variance[name]!);
  expect(Object.keys(actual.variance)).toEqual(names);
  expectAbsoluteMatrixClose([actualVariance], [expectedVariance], 1e-10, 'full unrenormalized variance');
  const transform = names.map(() => names.map(() => 0));
  const tables: Array<[string, Matrix, Matrix]> = [
    ['points', strictMatrix(actual.points, names), strictMatrix(expected.points, names)],
    ['nodes', strictMatrix(actual.rotation.nodes!, names), strictMatrix(expected.nodes, names)],
    ['centroids', strictMatrix(actual.centroids!, names), strictMatrix(expected.centroids, names)]
  ];
  exactFields(actual.rotation.nodes!, expected.nodes, ['code'], 'nodes');
  for (let start = 0; start < names.length;) {
    let end = start + 1;
    // A 1e-12 relative spectral equality threshold is distinct from the 1e-8
    // basis comparison bound: close but unequal axes must never be swapped.
    const spectralScale = Math.max(...expectedVariance.map(Math.abs), Number.MIN_VALUE);
    if (!(fixedMeans && start === 0)) {
      while (end < names.length && Math.abs(expectedVariance[end]! - expectedVariance[start]!) <= spectralScale * 1e-12) end++;
    }
    const indices = Array.from({ length: end - start }, (_, i) => start + i);
    const ab = columns(a, indices), bb = columns(b, indices);
    if (indices.length === 1) {
      const sign = fixedMeans && start === 0 ? 1 : columnSign(ab.map((row) => row[0]!), bb.map((row) => row[0]!));
      transform[start]![start] = sign;
      expectAbsoluteMatrixClose(ab.map((row) => [row[0]! * sign]), bb, 1e-8, `rotation ${names[start]}`);
      for (const [label, observed, oracle] of tables) {
        expectAbsoluteMatrixClose(columns(observed, indices).map((row) => [row[0]! * sign]), columns(oracle, indices), 1e-10, `${label} ${names[start]}`);
      }
    } else {
      expectRepeatedSubspaceClose(ab, bb, 1e-8);
      const change = indices.map((i) => indices.map((j) => a.reduce((sum, row, k) => sum + row[i]! * b[k]![j]!, 0)));
      indices.forEach((i, p) => indices.forEach((j, q) => { transform[i]![j] = change[p]![q]!; }));
      for (const [label, observed, oracle] of tables) {
        const ac = columns(observed, indices), bc = columns(oracle, indices);
        expectAbsoluteMatrixClose(distances(ac), distances(bc), 1e-10, `${label} repeated projected distances`);
        // Same block transform from the edge basis must explain every table.
        expectAbsoluteMatrixClose(product(ac, change), bc, 1e-10, `${label} repeated frame`);
      }
    }
    start = end;
  }
  return transform;
}

export function expectStrictStandardParity(actual: ENASet, full: ENASet, golden: StandardGolden, options: import('../src/index.js').ENAOptions): void {
  const edges = actual.codeColumns;
  expect(edges).toEqual(codeColumns(options.codes));
  expect(actual.rawRows.length).toBe(golden.rowCounts.input);
  expect(actual.rowConnectionCounts.length).toBe(golden.rowCounts.rowConnections);
  expect(actual.connectionCounts.length).toBe(golden.rowCounts.connections);
  expect(actual.points.length).toBe(golden.rowCounts.points);
  expect(actual.trajectories?.length ?? 0).toBe(golden.rowCounts.trajectories);
  // R keeps different optional metadata in row counts according to its window
  // implementation; compare all supplied R columns, with exact typed values.
  for (let i = 0; i < golden.rowConnectionCounts.length; i++) {
    exactFields([actual.rowConnectionCounts[i]!], [golden.rowConnectionCounts[i]!], Object.keys(golden.rowConnectionCounts[i]!), `row counts ${i}`);
  }
  exactFields(actual.connectionCounts, golden.connectionCounts, Object.keys(golden.connectionCounts[0]!), 'aggregate counts');
  if (options.window === 'Conversation' && options.model !== 'EndPoint') {
    // ena.accumulate.data.R adds units.by to conversations.by. ena.set.R
    // cbinds units + conversation, yielding the duplicate unit.1 column in
    // this one-Unit fixture. Expand jENA's typed tuple; never strip labels.
    expect(options.units).toEqual(['unit']);
    expect(options.conversation).toEqual(['horizon']);
    const expanded: Row[] = actual.trajectories!.map((row) => ({ ...row, 'unit.1': row.unit! }));
    exactFields(expanded, golden.trajectories, ['unit', 'ENA_UNIT', 'horizon', 'unit.1'], 'R Conversation tuple');
    expect(actual.unitLabels).toEqual(actual.trajectories!.map((row) => `${row.ENA_UNIT}::${row.horizon}`));
    expect(golden.unitLabels).toEqual(expanded.map((row) => `${row.ENA_UNIT}::${row.horizon}::${row['unit.1']}`));
  } else {
    expect(actual.unitLabels).toEqual(golden.unitLabels);
    if (golden.trajectories.length) exactFields(actual.trajectories!, golden.trajectories, Object.keys(golden.trajectories[0]!), 'trajectories');
  }
  expect(golden.centroids.map((row) => row.unit)).toEqual(golden.unitLabels);
  expect(actual.centroids!.map((row) => row.unit)).toEqual(actual.unitLabels);
  exactFields(actual.points, golden.points, ['unit', 'ENA_UNIT'], 'point Units');
  if (golden.trajectories.length) exactFields(golden.points, golden.trajectories, Object.keys(golden.trajectories[0]!), 'point trajectory tuple');
  for (const [label, observed, oracle] of [
    ['lineWeights', actual.lineWeights, golden.lineWeights],
    ['centered edge vectors', actual.pointsForProjection, golden.centeredPoints]
  ] as const) expectAbsoluteMatrixClose(strictMatrix(observed, edges), strictMatrix(oracle, edges), 1e-10, label);
  expectAbsoluteMatrixClose([actual.rotation.centerVector], strictMatrix([golden.centerVector], edges), 1e-10, 'center');
  expect(actual.rotation).toEqual({ ...full.rotation, nodes: actual.rotation.nodes });
  expect(actual.variance).toEqual(full.variance);
  const frame = golden.canonicalMeansFrame ?? golden;
  const names = frame.rotationColumns;
  expect(names.length).toBe(golden.dimensions.returned);
  expectAbsoluteMatrixClose(strictMatrix(actual.points, names.slice(0, golden.dimensions.requested)), strictMatrix(full.points, names.slice(0, golden.dimensions.requested)), 0, 'display prefix');
  expectStrictFrame(full, frame, edges, options.rotation?.method === 'mean');
}

/** Fixed source Reference, with an exact unordered-edge permutation and no fit. */
export function expectStrictReferenceParity(source: ENASet, sourceGolden: StandardGolden, targetGolden: StandardGolden, targetOptions: import('../src/index.js').ENAOptions): void {
  const frame = sourceGolden.canonicalMeansFrame ?? sourceGolden;
  const change = expectStrictFrame(source, frame, source.codeColumns, sourceGolden.options.rotation?.method === 'mean');
  const target = accumulateData({ ...targetOptions, codes: [...targetOptions.codes].reverse() });
  const permutation = target.adjacencyKey.map((edge) => {
    const matches = source.adjacencyKey.flatMap((candidate, i) => (
      (candidate.source === edge.source && candidate.target === edge.target)
      || (candidate.source === edge.target && candidate.target === edge.source) ? [i] : []
    ));
    expect(matches).toHaveLength(1);
    return matches[0]!;
  });
  expect(new Set(permutation).size).toBe(source.codeColumns.length);
  const originalSource = structuredClone(source.rotation);
  const rotationSet = {
    ...source.rotation, codes: target.codes, adjacencyKey: target.adjacencyKey,
    rotationMatrix: permutation.map((i) => [...source.rotation.rotationMatrix[i]!]),
    centerVector: permutation.map((i) => source.rotation.centerVector[i]!),
    nodes: target.codes.map((code) => {
      const matches = source.rotation.nodes!.filter((row) => row.code === code);
      expect(matches).toHaveLength(1);
      return { ...matches[0]! };
    })
  };
  const stages: string[] = [];
  const projected = makeSet(target, { dimensions: frame.rotationColumns.length, rotationSet, nodePositionMethod: 'reference-fixed', observer: { onStage: (stage) => stages.push(stage) } });
  expect(stages).toEqual(['normalize', 'center', 'rotate-or-project', 'position-nodes']);
  expect(source.rotation).toEqual(originalSource);
  expect(projected.rotation.rotationMatrix).toBe(rotationSet.rotationMatrix);
  expect(projected.rotation.nodes).toBe(rotationSet.nodes);
  expect(projected.rotation.centerVector).toBe(rotationSet.centerVector);
  expectAbsoluteMatrixClose(strictMatrix(projected.connectionCounts, target.codeColumns), strictMatrix(targetGolden.connectionCounts, source.codeColumns).map((row) => permutation.map((i) => row[i]!)), 0, 'Reference permuted counts');
  const weights = strictMatrix(targetGolden.lineWeights, source.codeColumns);
  const center = strictMatrix([sourceGolden.centerVector], source.codeColumns)[0]!;
  const centered = weights.map((row) => row.map((value, i) => value - center[i]!));
  expectAbsoluteMatrixClose(strictMatrix(projected.lineWeights, target.codeColumns), weights.map((row) => permutation.map((i) => row[i]!)), 1e-10, 'Reference permuted weights');
  expectAbsoluteMatrixClose(strictMatrix(projected.pointsForProjection, target.codeColumns), centered.map((row) => permutation.map((i) => row[i]!)), 1e-10, 'Reference source-centered vectors');
  const expectedPoints = product(centered, strictMatrix(frame.rotationMatrix, frame.rotationColumns));
  expectAbsoluteMatrixClose(product(strictMatrix(projected.points, frame.rotationColumns), change), expectedPoints, 1e-10, 'Reference fixed-source points');
  const expectedNodes = target.codes.map((code) => frame.nodes.find((row) => row.code === code)!);
  expectAbsoluteMatrixClose(product(strictMatrix(projected.rotation.nodes!, frame.rotationColumns), change), strictMatrix(expectedNodes, frame.rotationColumns), 1e-10, 'Reference fixed-source nodes');
  // Derive incidence centroids from the R target weights and R source nodes.
  const nodeWeights = weights.map((row) => {
    const incident = source.codes.map(() => 0);
    source.adjacencyKey.forEach((edge, i) => {
      incident[edge.sourceIndex]! += row[i]! * 0.5;
      incident[edge.targetIndex]! += row[i]! * 0.5;
    });
    const total = Math.max(0.0001, incident.reduce((sum, value) => sum + Math.abs(value), 0));
    return incident.map((value) => value / total);
  });
  expectAbsoluteMatrixClose(product(strictMatrix(projected.centroids!, frame.rotationColumns), change), product(nodeWeights, strictMatrix(frame.nodes, frame.rotationColumns)), 1e-10, 'Reference incidence centroids');
  // Full target variance in the fixed source frame, independently from R tables.
  const variances = frame.rotationColumns.map((_, j) => {
    const mean = expectedPoints.reduce((sum, row) => sum + row[j]!, 0) / expectedPoints.length;
    return expectedPoints.reduce((sum, row) => sum + (row[j]! - mean) ** 2, 0) / (expectedPoints.length - 1);
  });
  const total = variances.reduce((sum, value) => sum + value, 0);
  expectAbsoluteMatrixClose([frame.rotationColumns.map((name) => projected.variance[name]!)], [variances.map((value) => total === 0 ? 0 : value / total)], 1e-10, 'Reference full variance');
}
