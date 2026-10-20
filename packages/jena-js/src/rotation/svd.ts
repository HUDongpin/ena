/*
 * Derived from rENA 0.3.1 (GPL-3), (c) the rENA authors: Cody L Marquart,
 * Zachari Swiecki, Wesley Collier, Brendan Eagan, Roman Woodward, and
 * David Williamson Shaffer. This file ports the SVD rotation of R/ena.svd.R.
 * TypeScript translation and modifications for jena-js, GPL-3.0-only.
 * See PROVENANCE.md for the upstream NOTICE and version pin.
 */
import type { Matrix } from '../types.js';
import { covarianceLike, symmetricJacobiEigen } from '../core/linear.js';
import { statisticalScale } from '../core/matrix.js';

export interface SvdRotationResult {
  rotationMatrix: Matrix;
  rotationColumns: string[];
  eigenvalues: number[];
}

export function svdRotation(pointsForProjection: Matrix): SvdRotationResult {
  let maximum = 0;
  for (const row of pointsForProjection) for (const value of row) maximum = Math.max(maximum, Math.abs(value));
  // Form the Gram matrix in binary units only when its products would lose
  // range. Ordinary fits keep their established arithmetic. Accumulate from
  // the input directly, without an additional rows-by-edges scaled matrix.
  const rescale = maximum > 0 && (maximum < 2 ** -511
    || maximum > Math.sqrt(Number.MAX_VALUE / Math.max(1, pointsForProjection.length)));
  const scale = rescale ? statisticalScale([maximum]) : 1;
  const width = pointsForProjection[0]?.length ?? 0;
  const covariance = rescale
    ? Array.from({ length: width }, (_, left) => Array.from({ length: width }, (_, right) => {
      let total = 0;
      for (const row of pointsForProjection) total += (row[left]! / scale) * (row[right]! / scale);
      return total;
    }))
    : covarianceLike(pointsForProjection);
  const eigen = symmetricJacobiEigen(covariance);
  const divisor = Math.max(1, pointsForProjection.length - 1);
  // Absolute eigenvalues may legitimately round to zero even though their
  // directions and dimensionless explained-variance shares are representable.
  const eigenvalues = eigen.eigenvalues.map((value) => ((value / divisor) * scale) * scale);
  return {
    rotationMatrix: eigen.eigenvectors,
    rotationColumns: eigen.eigenvalues.map((_value, index) => `SVD${index + 1}`),
    eigenvalues
  };
}
