/** Number of bytes in each numeric cell retained by the dense Float64 SVD path. */
export const DENSE_SVD_FLOAT64_BYTES = 8;

/** Measured fixed work boundary shared by ordered and Standard dense SVD preflights. */
export const DENSE_SVD_MAX_WORK_UNITS = 8_000_000;

/** Existing ordered dense-matrix safety boundary, retained for compatibility. */
export const DENSE_SVD_MAX_MATRIX_BYTES = 1024 * 1024;

export interface DenseSvdBudgetEstimate {
  /** Covariance, Jacobi clone/eigenvectors, normalized rows, and centered rows. */
  readonly matrixCells: number;
  readonly matrixBytes: number;
  /** Dense covariance plus Jacobi eigensolver proxy: N*E^2 + E^3. */
  readonly workUnits: number;
}

function nonnegativeSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a nonnegative safe integer; got ${String(value)}.`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function checkedAdd(left: number, right: number, label: string): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} exceeds safe integer arithmetic.`);
  }
  return value;
}

function checkedMultiply(left: number, right: number, label: string): number {
  const value = left * right;
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} exceeds safe integer arithmetic.`);
  }
  return value;
}

/**
 * Estimates the live dense storage and deterministic work proxy for the
 * covariance/Jacobi SVD implementation without performing rounded arithmetic.
 */
export function estimateDenseSvdBudget(
  targetCountValue: number,
  edgeCountValue: number,
): DenseSvdBudgetEstimate {
  const targetCount = nonnegativeSafeInteger(targetCountValue, "Dense SVD targetCount");
  const edgeCount = nonnegativeSafeInteger(edgeCountValue, "Dense SVD edgeCount");
  const edgeSquared = checkedMultiply(edgeCount, edgeCount, "Dense SVD E-squared");
  const threeEdgeSquared = checkedMultiply(3, edgeSquared, "Dense SVD square matrix cells");
  const targetEdgeCells = checkedMultiply(targetCount, edgeCount, "Dense SVD target-edge cells");
  const twoTargetEdgeCells = checkedMultiply(2, targetEdgeCells, "Dense SVD normalized and centered cells");
  const matrixCells = checkedAdd(threeEdgeSquared, twoTargetEdgeCells, "Dense SVD matrix cells");
  const matrixBytes = checkedMultiply(DENSE_SVD_FLOAT64_BYTES, matrixCells, "Dense SVD matrix bytes");
  const covarianceWork = checkedMultiply(targetCount, edgeSquared, "Dense SVD covariance work");
  const jacobiWork = checkedMultiply(edgeSquared, edgeCount, "Dense SVD Jacobi work");
  const workUnits = checkedAdd(covarianceWork, jacobiWork, "Dense SVD work units");
  return Object.freeze({ matrixCells, matrixBytes, workUnits });
}
