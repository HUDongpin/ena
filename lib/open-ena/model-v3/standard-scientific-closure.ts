import type { ENASet, RotationSet } from "jena-js";
import { centerData, meanColumns, multiplyMatrices, normalizeVector, sphereNorm, subtractVectors, varianceColumns } from "jena-js/core";
import { fixedNodePositions, lwsLeastSquaresPositions } from "jena-js/rotation";
import { canonicalJsonV3 } from "./canonical-json";
import type { StandardScientificEvidenceV3 } from "./diagnostics";
import type { StandardExecutionPlanV3 } from "./execution-plan";
import type { InternalStandardRunResultV3, SerializableEnaSetV3, StandardMeansBindingV3 } from "./types";

export const STANDARD_SCIENTIFIC_CLOSURE_TOLERANCE_V3 = Object.freeze({ absolute: 1e-10, relative: 1e-9 });
function equal(actual: unknown, expected: number, label: string): void {
  const { absolute, relative } = STANDARD_SCIENTIFIC_CLOSURE_TOLERANCE_V3;
  if (typeof actual !== "number" || !Number.isFinite(actual) || !Number.isFinite(expected)
    || Math.abs(actual - expected) > absolute + relative * Math.max(Math.abs(actual), Math.abs(expected))) throw new TypeError(`Standard scientific derivation rejects inconsistent ${label}.`);
}
function sourceCount(actual: number, expected: number): void {
  const scale = Math.max(Math.abs(actual), Math.abs(expected));
  if (!Number.isFinite(actual) || !Number.isFinite(expected) || actual < 0 || expected < 0 || (actual === 0) !== (expected === 0)
    || (scale !== 0 && Math.abs(actual / scale - expected / scale) > STANDARD_SCIENTIFIC_CLOSURE_TOLERANCE_V3.relative)) throw new TypeError("Standard source-derived aggregate count is inconsistent.");
}
function residual(value: number, scale: number, label: string): void {
  const { absolute, relative } = STANDARD_SCIENTIFIC_CLOSURE_TOLERANCE_V3;
  if (!Number.isFinite(value) || !Number.isFinite(scale) || Math.abs(value) > absolute + relative * Math.abs(scale)) throw new TypeError(`Standard scientific derivation rejects inconsistent ${label}.`);
}

/** Pure native algebra only: no accumulation, eigendecomposition, model fit or
 * replacement axes. The owned caller admits all matrices/work before entry.
 * Source evidence is supplied only by that caller's real readiness invocation.
 */
export function assertStandardScientificClosureV3(plan: StandardExecutionPlanV3, runtime: InternalStandardRunResultV3, pairs: readonly (readonly [string, string | null])[], evidence: StandardScientificEvidenceV3): void {
  const set: ENASet = runtime.set;
  const units = new Map(plan.identityDictionary.units.map((entry) => [entry.token, entry.canonicalJson]));
  const horizons = new Map(plan.identityDictionary.horizons.map((entry) => [entry.token, entry.canonicalJson]));
  const sourceIndex = new Map(evidence.targetKeys.map((key, index) => [canonicalJsonV3(key), index]));
  if (sourceIndex.size !== pairs.length || evidence.targetVectors.length !== pairs.length) throw new TypeError("Standard source-derived analytical population is incomplete.");
  const sourceCodes = new Map(evidence.codeColumns.map((column, index) => [column, index]));
  if (sourceCodes.size !== plan.codeDictionary.codes.length) throw new TypeError("Standard source-derived Code basis is incomplete.");
  const columnPositions = plan.codeDictionary.codes.map((code) => {
    const index = sourceCodes.get(code.sourceColumn);
    if (index === undefined) throw new TypeError("Standard source-derived Code identity is absent.");
    return index;
  });
  const edges = set.adjacencyKey.map((edge) => {
    const left = columnPositions[edge.sourceIndex], right = columnPositions[edge.targetIndex];
    const high = Math.max(left, right), low = Math.min(left, right);
    return high * (high - 1) / 2 + low;
  });
  pairs.forEach(([unit, horizon], index) => {
    const key = { unitKey: units.get(unit), horizonKey: horizon === null ? null : horizons.get(horizon) };
    const source = sourceIndex.get(canonicalJsonV3(key));
    if (source === undefined) throw new TypeError("Standard source-derived Unit/Horizon step is absent.");
    set.connectionMatrix[index].forEach((value, edge) => sourceCount(value, evidence.targetVectors[source][edges[edge]]));
  });
  if (!plan.reference && evidence.intrinsicRank !== runtime.projection.rank) throw new TypeError("Standard source-derived intrinsic rank is inconsistent.");

  assertStandardInternalDerivationsV3(set, runtime.projection, runtime.meansBinding, pairs.map(([unit]) => unit), plan.reference?.rotationSet ?? null);
}

/** Internal algebra only. No source counts, rank authentication or fit witness is implied. */
export function assertStandardInternalDerivationsV3(
  set: ENASet | SerializableEnaSetV3,
  projection: InternalStandardRunResultV3["projection"],
  meansBinding: StandardMeansBindingV3 | null,
  unitTokens: readonly string[],
  referenceRotation: RotationSet | null,
): void {

  const lineWeights = sphereNorm(set.connectionMatrix);
  const signal = (row: number[]) => row.some((value) => value !== 0);
  const align = projection.centerAlignToOrigin;
  const center = referenceRotation ? referenceRotation.centerVector : meanColumns(align ? lineWeights.filter(signal) : lineWeights);
  const inputs = referenceRotation || align
    ? lineWeights.map((row) => align && !signal(row) ? row.map(() => 0) : row.map((value, edge) => value - center[edge]))
    : centerData(lineWeights, center);
  center.forEach((value, edge) => equal(set.rotation.centerVector[edge], value, "center vector"));
  lineWeights.forEach((row, index) => row.forEach((value, edge) => {
    equal(set.lineWeights[index][set.codeColumns[edge]], value, "sphere-normalized line weight");
    equal(set.pointsForProjection[index][set.codeColumns[edge]], inputs[index][edge], "centered projection input");
  }));
  const coordinates = multiplyMatrices(inputs, set.rotation.rotationMatrix);
  const axes = set.rotation.rotationColumns, displayed = axes.slice(0, 3);
  const energies = axes.map((_axis, axis) => coordinates.reduce((sum, row) => sum + row[axis] ** 2, 0));
  if (!referenceRotation) {
    if (projection.type === "svd") {
      energies.forEach((energy, axis) => equal(set.rotation.eigenvalues[axis], energy / Math.max(1, coordinates.length - 1), "SVD eigenvalue energy"));
    } else {
      // The native Means implementation centers a second time before group
      // means. Only MR1's orientation is fixed; it need not be uncorrelated
      // with residual axes, which are the SVD of its orthogonal complement.
      const centered = centerData(inputs), membership = meansBinding!;
      const positive = new Set(membership.positive.unitTokens), negative = new Set(membership.negative.unitTokens);
      const direction = normalizeVector(subtractVectors(meanColumns(centered.filter((_row, index) => positive.has(unitTokens[index]))), meanColumns(centered.filter((_row, index) => negative.has(unitTokens[index])))));
      direction.forEach((value, edge) => equal(set.rotation.rotationMatrix[edge][0], value, "Means MR1 positive-minus-negative contrast"));
      // Native orthogonalSvd orders the residual spectrum, independently of
      // MR1. Reuse the geometric tolerance so equal/nearly-equal eigenspaces
      // retain their valid basis freedom without refitting or replacing axes.
      for (let axis = 2; axis < energies.length; axis += 1) {
        residual(Math.max(0, energies[axis] - energies[axis - 1]), Math.max(energies[axis], energies[axis - 1]), "Means residual descending energy");
      }
    }
    const start = projection.type === "means" ? 1 : 0;
    for (let left = start; left < axes.length; left += 1) for (let right = left + 1; right < axes.length; right += 1) {
      const product = coordinates.reduce((sum, row) => sum + row[left] * row[right], 0);
      residual(product, Math.sqrt(energies[left] * energies[right]), "residual cross-axis covariance");
    }
  }
  coordinates.forEach((row, index) => displayed.forEach((axis, dimension) => equal(set.points[index][axis], row[dimension], "projected coordinate")));
  const display = coordinates.map((row) => row.slice(0, displayed.length));
  const geometry = referenceRotation
    ? fixedNodePositions(lineWeights, referenceRotation.nodes!.map((node) => displayed.map((axis) => Number(node[axis]))))
    : lwsLeastSquaresPositions(lineWeights, display, set.codes.length);
  geometry.nodes.forEach((row, index) => displayed.forEach((axis, dimension) => equal(set.rotation.nodes![index][axis], row[dimension], "node geometry")));
  geometry.centroids.forEach((row, index) => displayed.forEach((axis, dimension) => equal(set.centroids![index][axis], row[dimension], "incidence centroid")));
  // Match native model.ts exactly, including the Reference-only constant-target
  // override. Tolerance-level rank0 with nonconstant coordinates remains legal.
  const constantReference = referenceRotation !== null && coordinates.every((row) => row.every((value, axis) => value === coordinates[0]?.[axis]));
  const variances = constantReference ? axes.map(() => 0) : varianceColumns(coordinates);
  const total = variances.reduce((sum, value) => sum + value, 0);
  variances.forEach((value, axis) => equal(set.variance[axes[axis]], total === 0 ? 0 : value / total, "full-basis variance"));
}
