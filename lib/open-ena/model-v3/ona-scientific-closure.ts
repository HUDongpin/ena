import type { ENASet, Matrix } from "jena-js";
import { meanColumns, multiplyMatrices, sphereNorm, varianceColumns } from "jena-js/core";
import { directedNodePositions } from "jena-js/rotation";

/** Same numerical comparison policy as the existing closed ONA bundle oracle. */
export const ONA_SCIENTIFIC_CLOSURE_TOLERANCE_V3 = Object.freeze({ absolute: 1e-10, relative: 1e-9 });

type ScientificSet = Pick<ENASet, "connectionMatrix" | "codeColumns" | "lineWeights" | "pointsForProjection" | "points" | "centroids" | "rotation" | "variance">;

function assertEqual(actual: unknown, expected: number, label: string): void {
  const { absolute, relative } = ONA_SCIENTIFIC_CLOSURE_TOLERANCE_V3;
  if (typeof actual !== "number" || !Number.isFinite(actual) || !Number.isFinite(expected)
    || Math.abs(actual - expected) > absolute + relative * Math.max(Math.abs(actual), Math.abs(expected))) {
    throw new TypeError(`ONA scientific derivation rejects inconsistent ${label}.`);
  }
}

function assertResidual(value: number, scale: number, label: string): void {
  const { absolute, relative } = ONA_SCIENTIFIC_CLOSURE_TOLERANCE_V3;
  if (!Number.isFinite(value) || !Number.isFinite(scale)
    || Math.abs(value) > absolute + relative * Math.abs(scale)) {
    throw new TypeError(`ONA scientific derivation rejects inconsistent ${label}.`);
  }
}

function assertSourceAggregate(actual: number, expected: number): void {
  // Raw source counts have no absolute tolerance floor: both subnormal signal
  // and near-MAX finite counts retain their scale and exact zero pattern.
  const scale = Math.max(Math.abs(actual), Math.abs(expected));
  if (!Number.isFinite(actual) || !Number.isFinite(expected) || actual < 0 || expected < 0
    || (actual === 0) !== (expected === 0)
    || (scale !== 0 && Math.abs(actual / scale - expected / scale) > ONA_SCIENTIFIC_CLOSURE_TOLERANCE_V3.relative)) {
    throw new TypeError("ONA scientific derivation rejects inconsistent source-derived Unit aggregate.");
  }
}

function tokenIndex(tokens: readonly string[], label: string): Map<string, number> {
  const index = new Map(tokens.map((token, ordinal) => [token, ordinal]));
  if (index.size !== tokens.length) throw new TypeError(`ONA ${label} contains duplicate Unit identities.`);
  return index;
}

/**
 * This nested phase owns only two U×E matrices. Its arrays are unreachable when
 * it returns, before normalization/projection/node geometry is constructed.
 * Contributions are scaled per Unit/edge, so no cross-Unit or near-MAX_VALUE
 * total can overflow. This proves conservation, not a second source-window run.
 */
function assertAuditConservation(
  counts: Matrix,
  unitTokens: readonly string[],
  audit: readonly (readonly number[])[],
  auditUnitTokens: readonly string[],
): void {
  const index = tokenIndex(unitTokens, "runtime population");
  const e = counts[0]?.length ?? 0;
  const sums = counts.map(() => Array<number>(e).fill(0));
  const corrections = counts.map(() => Array<number>(e).fill(0));
  if (audit.length !== auditUnitTokens.length) throw new TypeError("ONA audit/source Unit mapping is incomplete.");
  audit.forEach((row, responseIndex) => {
    const unit = index.get(auditUnitTokens[responseIndex]);
    if (unit === undefined || row.length !== e) throw new TypeError("ONA audit has an unknown Unit or directed edge basis.");
    row.forEach((value, edge) => {
      if (!Number.isFinite(value) || value < 0) throw new TypeError("ONA audit contributions must be finite and nonnegative.");
      const count = counts[unit][edge];
      if (count === 0) {
        if (value !== 0) throw new TypeError("ONA audit conservation contradicts a zero Unit aggregate.");
        return;
      }
      const normalized = value / count;
      if (!Number.isFinite(normalized)) throw new TypeError("ONA audit conservation exceeds its finite Unit aggregate.");
      const previous = sums[unit][edge], next = previous + normalized;
      corrections[unit][edge] += Math.abs(previous) >= Math.abs(normalized)
        ? (previous - next) + normalized : (normalized - next) + previous;
      sums[unit][edge] = next;
    });
  });
  counts.forEach((row, unit) => row.forEach((count, edge) => {
    assertEqual(sums[unit][edge] + corrections[unit][edge], count === 0 ? 0 : 1, "per-Unit audit conservation");
  }));
}

/**
 * Pure algebraic closure using the supplied full SVD basis. This performs no
 * accumulation, eigendecomposition, statistical fit or axis replacement. The
 * small native directed-node solve is the same derivation used by legacy ONA
 * import validation. Caller admits all dimensions, scratch and work first.
 */
export function assertOnaScientificClosureV3(input: {
  readonly set: ScientificSet;
  readonly runtimeUnitTokens: readonly string[];
  readonly sourceUnitTokens: readonly string[];
  readonly sourceConnectionMatrix: Matrix;
  readonly auditEdgeValues: readonly (readonly number[])[];
  readonly auditUnitTokens: readonly string[];
}): void {
  const { set } = input;
  const sourceIndex = tokenIndex(input.sourceUnitTokens, "source readiness population");
  if (input.sourceConnectionMatrix.length !== input.runtimeUnitTokens.length) throw new TypeError("ONA source aggregate population is incomplete.");
  set.connectionMatrix.forEach((row, unit) => {
    const source = sourceIndex.get(input.runtimeUnitTokens[unit]);
    if (source === undefined) throw new TypeError("ONA result Unit is absent from source readiness evidence.");
    const expected = input.sourceConnectionMatrix[source];
    if (expected.length !== row.length) throw new TypeError("ONA source aggregate edge dimensions differ.");
    row.forEach((actual, edge) => assertSourceAggregate(actual, expected[edge]));
  });
  assertAuditConservation(set.connectionMatrix, input.runtimeUnitTokens, input.auditEdgeValues, input.auditUnitTokens);

  assertOnaInternalDerivationsV3(set);
}

/** Checks supplied geometry algebra only; source and audit conservation stay in the caller above. */
export function assertOnaInternalDerivationsV3(set: ScientificSet): void {

  const lineWeights = sphereNorm(set.connectionMatrix);
  const nonzero = lineWeights.filter((row) => row.some((value) => value !== 0));
  if (!nonzero.length) throw new TypeError("ONA scientific derivation requires enabled network signal.");
  const center = meanColumns(nonzero);
  const projectionInputs = lineWeights.map((row) => row.some((value) => value !== 0)
    ? row.map((value, edge) => value - center[edge]) : row.map(() => 0));
  lineWeights.forEach((row, unit) => row.forEach((expected, edge) => {
    assertEqual(set.lineWeights[unit][set.codeColumns[edge]], expected, "sphere-normalized line weight");
    assertEqual(set.pointsForProjection[unit][set.codeColumns[edge]], projectionInputs[unit][edge], "centered projection input");
  }));
  center.forEach((expected, edge) => assertEqual(set.rotation.centerVector[edge], expected, "center vector"));

  const coordinates = multiplyMatrices(projectionInputs, set.rotation.rotationMatrix);
  const axes = set.rotation.rotationColumns, displayed = axes.slice(0, 3);
  const energies = axes.map((_axis, axis) => coordinates.reduce((sum, row) => sum + row[axis] ** 2, 0));
  for (let left = 0; left < axes.length; left += 1) {
    assertEqual(set.rotation.eigenvalues[left], energies[left] / Math.max(1, coordinates.length - 1), "SVD eigenvalue energy");
    for (let right = left + 1; right < axes.length; right += 1) {
      const product = coordinates.reduce((sum, row) => sum + row[left] * row[right], 0);
      assertResidual(product, Math.sqrt(energies[left] * energies[right]), "SVD cross-axis residual");
    }
  }
  coordinates.forEach((row, unit) => displayed.forEach((axis, ordinal) => assertEqual(set.points[unit][axis], row[ordinal], "projected coordinate")));

  const geometry = directedNodePositions(lineWeights, coordinates.map((row) => row.slice(0, displayed.length)));
  geometry.nodes.forEach((row, code) => displayed.forEach((axis, ordinal) => assertEqual(set.rotation.nodes?.[code]?.[axis], row[ordinal], "directed node geometry")));
  geometry.centroids.forEach((row, unit) => displayed.forEach((axis, ordinal) => assertEqual(set.centroids?.[unit]?.[axis], row[ordinal], "directed centroid")));

  // Exactly the native runtime variance path: rank-zero does not imply zero
  // normalized variance when repeated floating-point means differ at roundoff.
  const variances = varianceColumns(coordinates);
  const total = variances.reduce((sum, value) => sum + value, 0);
  axes.forEach((axis, ordinal) => assertEqual(set.variance[axis], total === 0 ? 0 : variances[ordinal] / total, "full-basis variance share"));
}
