import { assertEndpointMatrix2D, multiplyEndpointMatrix2D, replayEndpointMeansBasis2D, type EndpointLapack2D } from "./endpoint-means-frame-2d-kernel";
import { marginalMeanStudentT95 } from "./uncertainty";

export interface EndpointMeansFrameInput2D {
  points: number[][];
  contrastGroups: number[];
  groupIds: number[];
  fittedBasis: number[][];
  fittedPoints: number[][];
  fittedNodes: number[][];
}
export function computeEndpointMeansFrame2D(input: EndpointMeansFrameInput2D, runtime: EndpointLapack2D) {
  const { points, contrastGroups, groupIds, fittedBasis, fittedPoints, fittedNodes } = input;
  for (const matrix of [points, fittedBasis, fittedPoints, fittedNodes]) assertEndpointMatrix2D(matrix);
  if (fittedBasis.length !== points[0].length || fittedBasis[0].length !== 2
    || fittedPoints.length !== points.length || fittedPoints[0].length !== 2 || fittedNodes[0].length !== 2
    || groupIds.length !== points.length || groupIds.some(id => !Number.isSafeInteger(id) || id < -1)) throw new TypeError("Invalid 2D Means frame dimensions.");
  const basis = replayEndpointMeansBasis2D(points, contrastGroups, runtime);
  const basisSigns = [0, 1].map(j => {
    const dot = basis.reduce((s, row, i) => s + row[j] * fittedBasis[i][j], 0);
    const error = Math.max(...basis.map((row, i) => Math.abs(row[j] - (dot < 0 ? -1 : 1) * fittedBasis[i][j])));
    // Repeated/unstable singular axes may describe a different equally valid
    // basis. Do not claim the display profile applies unless they are collinear.
    if (!Number.isFinite(dot) || Math.abs(Math.abs(dot) - 1) > 1e-7 || error > 1e-7) throw new Error("R-compatible 2D directions are not uniquely aligned with this fitted model.");
    return dot < 0 ? -1 : 1;
  });
  const orientedPoints = fittedPoints.map(row => row.map((v, j) => v * basisSigns[j]));
  const orientedNodes = fittedNodes.map(row => row.map((v, j) => v * basisSigns[j]));
  const ratio = (extreme: (...values: number[]) => number) => Math.abs(Math.max(...[0, 1].map(j => {
    const denominator = extreme(...orientedPoints.map(row => row[j]));
    if (Math.abs(denominator) < 1e-12) throw new Error("2D pre-scaling requires nonzero point extents.");
    return extreme(...orientedNodes.map(row => row[j])) / denominator;
  })));
  const pointScaleFactor = Math.min(ratio(Math.min), ratio(Math.max));
  if (!Number.isFinite(pointScaleFactor) || pointScaleFactor <= 1e-12) throw new Error("2D pre-scaling is not estimable.");
  const allCoordinates = multiplyEndpointMatrix2D(points, basis);
  let maximum = 0;
  // The webENA transport rounds at four decimals before framing. Its frame
  // includes all rotated point columns and group CIs, but not IQR outlier guides.
  const include = (value: number) => { maximum = Math.max(maximum, Math.abs(Number((value * pointScaleFactor).toFixed(4)))); };
  for (const row of allCoordinates) for (const value of row) include(value);
  for (const id of new Set(groupIds.filter(id => id >= 0))) {
    const rows = allCoordinates.filter((_, i) => groupIds[i] === id);
    for (let j = 0; j < allCoordinates[0].length; j++) {
      const interval = marginalMeanStudentT95(rows.map(row => row[j]));
      if (interval.status === "estimable") { include(interval.lower); include(interval.upper); }
    }
  }
  if (!Number.isFinite(maximum) || maximum <= 1e-12) throw new Error("2D frame extent is not estimable.");
  return { profile: "rena-one-contrast-means-lapack-3.12" as const, basisSigns,
    pointScaleFactor, maxPosition: maximum, extremePosition: maximum * 1.2,
    frameAxes: allCoordinates[0].length, transportDecimalPlaces: 4 as const };
}
export type EndpointMeansFrame2D = ReturnType<typeof computeEndpointMeansFrame2D>;
