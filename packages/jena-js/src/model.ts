/*
 * Derived from rENA 0.3.1 (GPL-3), (c) the rENA authors: Cody L Marquart,
 * Zachari Swiecki, Wesley Collier, Brendan Eagan, Roman Woodward, and
 * David Williamson Shaffer. This file ports the model/centering/variance semantics
 * of R/ena.make.set.R.
 * TypeScript translation and modifications for jena-js, GPL-3.0-only.
 * See PROVENANCE.md for the upstream NOTICE and version pin.
 */
import type {
  ENAData,
  ENASet,
  MakeSetOptions,
  Matrix,
  NetworkType,
  Row,
  RotationSet
} from './types.js';
import { centerData, meanColumns, multiplyMatrices, sphereNorm, varianceColumns } from './core/matrix.js';
import { assertOrderedSvdBudget } from './core/orderedLimits.js';
import { validateENADataNetworkContract, validateMakeSetOptions } from './core/validate.js';
import { svdRotation } from './rotation/svd.js';
import {
  centroidsAsRows,
  directedNodePositions,
  directedNodePositionsWithGroundResponseAdded,
  fixedNodePositions,
  lwsLeastSquaresPositions,
  nodesAsRows,
  type NodePositionResult
} from './rotation/nodePositions.js';
import {
  rotateByGeneralized,
  rotateByHena,
  rotateByMean,
  rotateByRegression,
  rotateByRegression2,
  rotateBySpherical
} from './rotation/custom.js';

function nonCodePart(row: Row, codeColumns: string[]): Row {
  const codeSet = new Set(codeColumns);
  return Object.fromEntries(Object.entries(row).filter(([key]) => !codeSet.has(key))) as Row;
}

function rowsFromMatrix(baseRows: Row[], codeColumns: string[], columns: string[], matrix: Matrix): Row[] {
  return baseRows.map((row, rowIndex) => ({
    ...nonCodePart(row, codeColumns),
    ...Object.fromEntries(columns.map((column, columnIndex) => [column, matrix[rowIndex]?.[columnIndex] ?? 0]))
  }));
}

function selectMatrixColumns(matrix: Matrix, count: number): Matrix {
  return matrix.map((row) => row.slice(0, count));
}

function rowHasSignal(row: number[]): boolean {
  return row.reduce((sum, value) => sum + value, 0) !== 0;
}

function centerForProjection(lineWeights: Matrix, centerAlignToOrigin: boolean, rotationSet?: RotationSet): { pointsForProjection: Matrix; centerVector: number[] } {
  if (rotationSet) {
    const centerVector = rotationSet.centerVector;
    return {
      centerVector,
      pointsForProjection: lineWeights.map((row) => (centerAlignToOrigin && !rowHasSignal(row)
        ? row.map(() => 0)
        : row.map((value, index) => value - (centerVector[index] ?? 0))))
    };
  }

  if (!centerAlignToOrigin) {
    const centerVector = meanColumns(lineWeights);
    return { pointsForProjection: centerData(lineWeights, centerVector), centerVector };
  }

  const nonZeroRows = lineWeights.filter(rowHasSignal);
  if (nonZeroRows.length === 0) {
    throw new Error('There were no co-occurrences of codes for any of the units within the model as defined.');
  }
  const centerVector = meanColumns(nonZeroRows);
  return {
    centerVector,
    pointsForProjection: lineWeights.map((row) => (rowHasSignal(row) ? row.map((value, index) => value - (centerVector[index] ?? 0)) : row.map(() => 0)))
  };
}

function adjacencyKeysEqual(left: ENAData['adjacencyKey'], right: ENAData['adjacencyKey']): boolean {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => {
    const other = right[index];
    return other?.source === entry.source &&
      other.target === entry.target &&
      other.sourceIndex === entry.sourceIndex &&
      other.targetIndex === entry.targetIndex;
  });
}

function makeRotation(enadata: ENAData, pointsForProjection: Matrix, options: MakeSetOptions): Pick<RotationSet, 'rotationMatrix' | 'rotationColumns' | 'eigenvalues'> {
  if (options.rotationSet) {
    if (!adjacencyKeysEqual(enadata.adjacencyKey, options.rotationSet.adjacencyKey)) {
      throw new Error('Rotation sets must have identical adjacency keys.');
    }
    return {
      rotationMatrix: options.rotationSet.rotationMatrix,
      rotationColumns: options.rotationSet.rotationColumns,
      eigenvalues: options.rotationSet.eigenvalues
    };
  }

  // RotationOptions is a discriminated union, so each branch's params are
  // narrowed at compile time (advisory F-012 — no casts).
  const rotation = options.rotation;
  if (!rotation || rotation.method === 'svd') return svdRotation(pointsForProjection);
  switch (rotation.method) {
    case 'mean':
      return rotateByMean(pointsForProjection, enadata, rotation.params);
    case 'generalized':
      return rotateByGeneralized(pointsForProjection, enadata, rotation.params);
    case 'regression':
      return rotateByRegression(pointsForProjection, enadata, rotation.params);
    case 'regression2':
      return rotateByRegression2(pointsForProjection, enadata, rotation.params);
    case 'hena':
      return rotateByHena(pointsForProjection, enadata, rotation.params);
    case 'spherical':
      return rotateBySpherical(pointsForProjection, enadata, rotation.params ?? {});
  }
}

function validateOrderedMakeSetPhase(enadata: ENAData, options: MakeSetOptions): void {
  if (enadata.networkType !== 'ordered') return;

  if (options.rotationSet !== undefined) {
    throw new Error(
      'Ordered makeSet does not accept rotationSet in the descriptive SVD-only phase.'
    );
  }

  const rotationMethod = options.rotation?.method;
  if (rotationMethod !== undefined && rotationMethod !== 'svd') {
    throw new Error(
      'Ordered makeSet supports only the default or explicit "svd" rotation in the ' +
      `descriptive SVD-only phase; got "${rotationMethod}".`
    );
  }

  if (options.nodePositionMethod === 'undirected') {
    throw new Error(
      'Ordered network analysis requires a directed node position method; got "undirected". ' +
      'Omit nodePositionMethod to use "directed".'
    );
  }
  if (options.nodePositionMethod === 'directed-ground-response') {
    throw new Error(
      'Ordered ENAData supports nodePositionMethod "directed"; ' +
      '"directed-ground-response" requires explicitly paired ground/response rows.'
    );
  }

  assertOrderedSvdBudget(enadata.connectionMatrix.length, enadata.codeColumns.length);
}

function makeNodePositions(
  lineWeights: Matrix,
  points: Matrix,
  codeCount: number,
  networkType: NetworkType,
  options: MakeSetOptions
): NodePositionResult {
  const method = options.nodePositionMethod ?? (networkType === 'ordered' ? 'directed' : 'undirected');
  if (networkType === 'ordered' && method === 'undirected') {
    throw new Error(
      'Ordered network analysis requires a directed node position method; got "undirected". ' +
      'Omit nodePositionMethod to use "directed".'
    );
  }
  if (networkType === 'ordered' && method === 'directed-ground-response') {
    throw new Error(
      'Ordered ENAData supports nodePositionMethod "directed"; ' +
      '"directed-ground-response" requires explicitly paired ground/response rows.'
    );
  }
  if (method !== 'undirected') {
    // Directed solvers require full n*n adjacency vectors and must never be
    // applied to standard upper-triangle ENA data (advisory F-003).
    const width = lineWeights[0]?.length ?? 0;
    if (width !== codeCount * codeCount) {
      throw new Error(
        `nodePositionMethod "${method}" requires a directed adjacency (${codeCount * codeCount} columns for ${codeCount} codes), ` +
        `but this model is undirected (${width} upper-triangle columns). Use nodePositionMethod: "undirected".`
      );
    }
  }
  switch (method) {
    case 'reference-fixed':
      throw new Error('Reference fixed nodes must use the validated projection-only path.');
    case 'undirected':
      return lwsLeastSquaresPositions(lineWeights, points, codeCount);
    case 'directed':
      return directedNodePositions(lineWeights, points);
    case 'directed-ground-response':
      return directedNodePositionsWithGroundResponseAdded(lineWeights, points);
  }
}

export function makeSet(enadata: ENAData, options: MakeSetOptions = {}): ENASet {
  validateENADataNetworkContract(enadata);
  validateMakeSetOptions(options);
  validateOrderedMakeSetPhase(enadata, options);
  const dimensions = options.dimensions ?? 2;
  const centerAlignToOrigin = options.centerAlignToOrigin ?? true;
  const n = enadata.connectionMatrix.length;
  const e = enadata.codeColumns.length;
  const c = enadata.codes.length;
  const d = Math.min(dimensions, e);
  // Matrices/tables here are actual retained numeric slots, counted once by
  // ownership. Scratch bounds describe dense helper overlap, never heap bytes.
  let retained = 2 * n * e + enadata.rawRows.length * c + enadata.rowConnectionCounts.length * e;
  const observe = (scratch = 0): void => options.observer?.onResources?.({ numericCells: retained, temporaryNumericCellsBound: scratch });
  options.observer?.onStage?.('normalize');
  observe(n * e);
  const lineWeightsMatrix = sphereNorm(enadata.connectionMatrix);
  retained += n * e;
  options.observer?.onStage?.('center');
  observe(n * e + e);
  const { pointsForProjection, centerVector } = centerForProjection(lineWeightsMatrix, centerAlignToOrigin, options.rotationSet);
  retained += n * e + (options.rotationSet ? 0 : e);
  options.observer?.onStage?.('rotate-or-project');
  // Means additionally retains centered/deflated residual networks and the
  // leading-axis completion basis while SVD decomposes its residual covariance.
  observe(options.rotation?.method === 'mean' ? 6 * e * e + 4 * n * e + 8 * e : 3 * e * e + 2 * n * e + 8 * e);
  const rotationResult = makeRotation(enadata, pointsForProjection, options);
  if (!options.rotationSet) retained += rotationResult.rotationMatrix.reduce((sum, row) => sum + row.length, 0) + rotationResult.eigenvalues.length;
  const dimCount = Math.min(dimensions, rotationResult.rotationColumns.length);
  const dimensionNames = rotationResult.rotationColumns.slice(0, dimCount);
  let fixedNodes: Matrix | undefined;
  if (options.nodePositionMethod === 'reference-fixed') {
    const reference = options.rotationSet!;
    if ((enadata.networkType ?? 'standard') !== 'standard'
      || !Array.isArray(reference.codes) || reference.codes.length !== enadata.codes.length
      || !Array.isArray(reference.nodes) || reference.nodes.length !== enadata.codes.length) {
      throw new Error('Reference fixed nodes require Standard data and complete identity-aligned Code nodes.');
    }
    for (let index = 0; index < enadata.codes.length; index += 1) {
      if (!Object.hasOwn(reference.codes, index) || reference.codes[index] !== enadata.codes[index]) {
        throw new Error('Reference fixed nodes require a dense identity-aligned Code array.');
      }
      if (!Object.hasOwn(reference.nodes, index)) throw new Error('Reference fixed nodes require a dense node array.');
    }
    fixedNodes = reference.nodes.map((node, index) => {
      if (node === null || typeof node !== 'object' || node.code !== enadata.codes[index]) throw new Error('Reference fixed node Code identities must match runtime order exactly.');
      for (const axis of reference.rotationColumns) {
        if (Object.hasOwn(node, axis) && (typeof node[axis] !== 'number' || !Number.isFinite(node[axis]))) {
          throw new Error('Reference fixed node coordinates must be finite for every supplied rotation axis.');
        }
      }
      return dimensionNames.map((axis) => {
        const value = node[axis];
        if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Reference fixed node coordinates must be complete and finite.');
        return value;
      });
    });
    retained += c * dimCount;
  }
  // rENA projects onto the full rotation matrix (ena.make.set.R: points <-
  // points.for.projection %*% rotation.matrix) and normalizes variance across
  // ALL rotated dimensions; only display output is truncated to `dimensions`.
  const fullPointsMatrix = multiplyMatrices(pointsForProjection, rotationResult.rotationMatrix);
  const pointsMatrix = selectMatrixColumns(fullPointsMatrix, dimCount);
  retained += n * (e + dimCount);
  options.observer?.onStage?.('position-nodes');
  observe(2 * n * c + 3 * c * c + n + 4 * c + (n + c) * d);
  const nodePositionResult = fixedNodes !== undefined ? fixedNodePositions(lineWeightsMatrix, fixedNodes) : makeNodePositions(
    lineWeightsMatrix,
    pointsMatrix,
    enadata.codes.length,
    enadata.networkType ?? 'standard',
    options
  );
  retained += n * c + n * dimCount + (fixedNodes ? 0 : c * dimCount);
  observe(2 * n * e + 2 * n * dimCount + c * dimCount + 2 * e);
  // Exact constant Reference targets have zero variance; repeated-sum rounding
  // must not become a normalized 100% axis when projection permits rank zero.
  const constantReference = fixedNodes !== undefined && fullPointsMatrix.every((row) => row.every((value, index) => value === fullPointsMatrix[0]?.[index]));
  const variances = constantReference ? rotationResult.rotationColumns.map(() => 0) : varianceColumns(fullPointsMatrix);
  const varianceTotal = variances.reduce((sum, value) => sum + value, 0);
  const variance = Object.fromEntries(rotationResult.rotationColumns.map((name, index) => [name, varianceTotal === 0 ? 0 : (variances[index] ?? 0) / varianceTotal]));

  const rotation: RotationSet = {
    codes: enadata.codes,
    adjacencyKey: enadata.adjacencyKey,
    rotationMatrix: rotationResult.rotationMatrix,
    rotationColumns: rotationResult.rotationColumns,
    eigenvalues: rotationResult.eigenvalues,
    centerVector,
    nodes: options.rotationSet?.nodes ?? nodesAsRows(enadata.codes, nodePositionResult.nodes, dimensionNames)
  };

  const result: ENASet = {
    ...enadata,
    lineWeights: rowsFromMatrix(enadata.connectionCounts, enadata.codeColumns, enadata.codeColumns, lineWeightsMatrix),
    pointsForProjection: rowsFromMatrix(enadata.connectionCounts, enadata.codeColumns, enadata.codeColumns, pointsForProjection),
    points: rowsFromMatrix(enadata.connectionCounts, enadata.codeColumns, dimensionNames, pointsMatrix),
    rotation,
    variance,
    centroids: centroidsAsRows(enadata.unitLabels, nodePositionResult.centroids, dimensionNames)
  };
  retained += 2 * n * e + 2 * n * dimCount + (options.rotationSet ? 0 : c * dimCount) + 2 * e;
  observe();
  return result;
}

export function projectIn(enadata: ENAData, by: RotationSet | ENASet, options: Omit<MakeSetOptions, 'rotationSet'> = {}): ENASet {
  if (enadata.networkType === 'ordered') {
    throw new Error(
      'projectIn does not support ordered ENAData in the descriptive SVD-only phase.'
    );
  }
  const rotationSet = 'rotation' in by ? by.rotation : by;
  return makeSet(enadata, { ...options, rotationSet });
}
