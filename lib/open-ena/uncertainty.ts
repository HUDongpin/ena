export const MARGINAL_STUDENT_T_95_METHOD = "marginal-student-t-95" as const;
export const MARGINAL_STUDENT_T_95_CONFIDENCE_LEVEL = 0.95 as const;
export const RENA_MEAN_CENTERED_IQR_OUTLIER_METHOD = "rena-mean-centered-1.5-iqr" as const;

export type OpenEnaMeanCenteredIqrOutlierInterval =
  | {
      status: "estimable";
      method: typeof RENA_MEAN_CENTERED_IQR_OUTLIER_METHOD;
      sampleSize: number;
      mean: number;
      firstQuartile: number;
      thirdQuartile: number;
      interquartileRange: number;
      halfWidth: number;
      lower: number;
      upper: number;
    }
  | {
      status: "not-estimable";
      method: typeof RENA_MEAN_CENTERED_IQR_OUTLIER_METHOD;
      sampleSize: number;
      reason: "insufficient-n" | "non-finite-sample" | "non-finite-summary";
    };

export interface OpenEnaMeanCenteredIqrOutlierIntervalPair {
  method: typeof RENA_MEAN_CENTERED_IQR_OUTLIER_METHOD;
  estimand: "arithmetic-group-mean";
  observationUnit: "endpoint-analytic-unit";
  interpretation: "two-separate-mean-centered-outlier-display-intervals";
  confidenceInterval: false;
  significanceTest: false;
  xAxis: string;
  yAxis: string;
  x: OpenEnaMeanCenteredIqrOutlierInterval;
  y: OpenEnaMeanCenteredIqrOutlierInterval;
}

export type OpenEnaMarginalMeanInterval =
  | {
      status: "estimable";
      method: typeof MARGINAL_STUDENT_T_95_METHOD;
      confidenceLevel: typeof MARGINAL_STUDENT_T_95_CONFIDENCE_LEVEL;
      sampleSize: number;
      degreesFreedom: number;
      mean: number;
      sampleStandardDeviation: number;
      standardError: number;
      tCritical: number;
      lower: number;
      upper: number;
    }
  | {
      status: "not-estimable";
      method: typeof MARGINAL_STUDENT_T_95_METHOD;
      confidenceLevel: typeof MARGINAL_STUDENT_T_95_CONFIDENCE_LEVEL;
      sampleSize: number;
      reason: "insufficient-n" | "zero-or-nonfinite-standard-error";
    };

export interface OpenEnaMarginalMeanIntervalPair {
  method: typeof MARGINAL_STUDENT_T_95_METHOD;
  confidenceLevel: typeof MARGINAL_STUDENT_T_95_CONFIDENCE_LEVEL;
  estimand: "arithmetic-group-mean";
  observationUnit: "endpoint-analytic-unit";
  interpretation: "two-separate-marginal-confidence-intervals";
  jointRegion: false;
  significanceTest: false;
  xAxis: string;
  yAxis: string;
  x: OpenEnaMarginalMeanInterval;
  y: OpenEnaMarginalMeanInterval;
}

const LANCZOS_COEFFICIENTS = [
  676.5203681218851,
  -1259.1392167224028,
  771.3234287776531,
  -176.6150291621406,
  12.507343278686905,
  -0.13857109526572012,
  9.984369578019572e-6,
  1.5056327351493116e-7,
] as const;

function logGamma(value: number): number {
  if (value < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value);
  }
  const shifted = value - 1;
  let sum = 0.9999999999998099;
  for (const [index, coefficient] of LANCZOS_COEFFICIENTS.entries()) {
    sum += coefficient / (shifted + index + 1);
  }
  const t = shifted + LANCZOS_COEFFICIENTS.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(sum);
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const maximumIterations = 240;
  const epsilon = 3e-14;
  const minimum = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < minimum) d = minimum;
  d = 1 / d;
  let h = d;

  for (let iteration = 1; iteration <= maximumIterations; iteration += 1) {
    const doubled = 2 * iteration;
    let aa = (iteration * (b - iteration) * x) / ((qam + doubled) * (a + doubled));
    d = 1 + aa * d;
    if (Math.abs(d) < minimum) d = minimum;
    c = 1 + aa / c;
    if (Math.abs(c) < minimum) c = minimum;
    d = 1 / d;
    h *= d * c;

    aa = -((a + iteration) * (qab + iteration) * x) / ((a + doubled) * (qap + doubled));
    d = 1 + aa * d;
    if (Math.abs(d) < minimum) d = minimum;
    c = 1 + aa / c;
    if (Math.abs(c) < minimum) c = minimum;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) <= epsilon) return h;
  }
  return h;
}

function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const factor = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b)
    + a * Math.log(x) + b * Math.log1p(-x),
  );
  return x < (a + 1) / (a + b + 2)
    ? (factor * betaContinuedFraction(a, b, x)) / a
    : 1 - (factor * betaContinuedFraction(b, a, 1 - x)) / b;
}

function studentTCdf(value: number, degreesFreedom: number): number {
  if (value === 0) return 0.5;
  const x = degreesFreedom / (degreesFreedom + value * value);
  const tail = 0.5 * regularizedIncompleteBeta(x, degreesFreedom / 2, 0.5);
  return value > 0 ? 1 - tail : tail;
}

const criticalValueCache = new Map<number, number>();

function quantileType7(sortedValues: readonly number[], probability: number) {
  const index = (sortedValues.length - 1) * probability;
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  const lower = sortedValues[lowerIndex]!;
  const upper = sortedValues[upperIndex]!;
  return lower + (upper - lower) * (index - lowerIndex);
}

/**
 * rENA's group outlier display guide: arithmetic mean ± 1.5 × per-axis IQR.
 * This is a plotting interval, not Tukey fences and not automatic exclusion.
 */
export function meanCenteredIqrOutlierInterval(
  values: readonly number[],
): OpenEnaMeanCenteredIqrOutlierInterval {
  if (values.length < 2) {
    return {
      status: "not-estimable",
      method: RENA_MEAN_CENTERED_IQR_OUTLIER_METHOD,
      sampleSize: values.length,
      reason: "insufficient-n",
    };
  }
  if (values.some((value) => !Number.isFinite(value))) {
    return {
      status: "not-estimable",
      method: RENA_MEAN_CENTERED_IQR_OUTLIER_METHOD,
      sampleSize: values.filter((value) => Number.isFinite(value)).length,
      reason: "non-finite-sample",
    };
  }
  const sorted = [...values].sort((left, right) => left - right);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const firstQuartile = quantileType7(sorted, 0.25);
  const thirdQuartile = quantileType7(sorted, 0.75);
  const interquartileRange = thirdQuartile - firstQuartile;
  const halfWidth = interquartileRange * 1.5;
  if (!Number.isFinite(mean) || !Number.isFinite(halfWidth) || halfWidth < 0) {
    return {
      status: "not-estimable",
      method: RENA_MEAN_CENTERED_IQR_OUTLIER_METHOD,
      sampleSize: sorted.length,
      reason: "non-finite-summary",
    };
  }
  return {
    status: "estimable",
    method: RENA_MEAN_CENTERED_IQR_OUTLIER_METHOD,
    sampleSize: sorted.length,
    mean,
    firstQuartile,
    thirdQuartile,
    interquartileRange,
    halfWidth,
    lower: mean - halfWidth,
    upper: mean + halfWidth,
  };
}

export function meanCenteredIqrOutlierIntervalPair(
  points: ReadonlyArray<{ x: number; y: number }>,
  axes: readonly [string, string],
): OpenEnaMeanCenteredIqrOutlierIntervalPair {
  return {
    method: RENA_MEAN_CENTERED_IQR_OUTLIER_METHOD,
    estimand: "arithmetic-group-mean",
    observationUnit: "endpoint-analytic-unit",
    interpretation: "two-separate-mean-centered-outlier-display-intervals",
    confidenceInterval: false,
    significanceTest: false,
    xAxis: axes[0],
    yAxis: axes[1],
    x: meanCenteredIqrOutlierInterval(points.map(({ x }) => x)),
    y: meanCenteredIqrOutlierInterval(points.map(({ y }) => y)),
  };
}

/** Two-sided 95% Student-t critical value, matching q_t(.975, df). */
export function studentTCritical975(degreesFreedom: number): number {
  if (!Number.isInteger(degreesFreedom) || degreesFreedom < 1) {
    throw new Error("Student-t degrees of freedom must be a positive integer.");
  }
  const cached = criticalValueCache.get(degreesFreedom);
  if (cached !== undefined) return cached;
  let lower = 0;
  let upper = 1;
  while (studentTCdf(upper, degreesFreedom) < 0.975) upper *= 2;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const midpoint = (lower + upper) / 2;
    if (studentTCdf(midpoint, degreesFreedom) < 0.975) lower = midpoint;
    else upper = midpoint;
  }
  const result = (lower + upper) / 2;
  criticalValueCache.set(degreesFreedom, result);
  return result;
}

export function marginalMeanStudentT95(values: readonly number[]): OpenEnaMarginalMeanInterval {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (finiteValues.length < 2 || finiteValues.length !== values.length) {
    return {
      status: "not-estimable",
      method: MARGINAL_STUDENT_T_95_METHOD,
      confidenceLevel: MARGINAL_STUDENT_T_95_CONFIDENCE_LEVEL,
      sampleSize: finiteValues.length,
      reason: "insufficient-n",
    };
  }
  const sampleSize = finiteValues.length;
  const mean = finiteValues.reduce((sum, value) => sum + value, 0) / sampleSize;
  const sumSquaredDeviations = finiteValues.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  const sampleStandardDeviation = Math.sqrt(sumSquaredDeviations / (sampleSize - 1));
  const standardError = sampleStandardDeviation / Math.sqrt(sampleSize);
  const numericalFloor = 16 * Number.EPSILON * Math.max(1, Math.abs(mean));
  if (!Number.isFinite(standardError) || standardError <= numericalFloor) {
    return {
      status: "not-estimable",
      method: MARGINAL_STUDENT_T_95_METHOD,
      confidenceLevel: MARGINAL_STUDENT_T_95_CONFIDENCE_LEVEL,
      sampleSize,
      reason: "zero-or-nonfinite-standard-error",
    };
  }
  const degreesFreedom = sampleSize - 1;
  const tCritical = studentTCritical975(degreesFreedom);
  const halfWidth = tCritical * standardError;
  return {
    status: "estimable",
    method: MARGINAL_STUDENT_T_95_METHOD,
    confidenceLevel: MARGINAL_STUDENT_T_95_CONFIDENCE_LEVEL,
    sampleSize,
    degreesFreedom,
    mean,
    sampleStandardDeviation,
    standardError,
    tCritical,
    lower: mean - halfWidth,
    upper: mean + halfWidth,
  };
}

export function marginalMeanIntervalPair(
  points: ReadonlyArray<{ x: number; y: number }>,
  axes: readonly [string, string],
): OpenEnaMarginalMeanIntervalPair {
  return {
    method: MARGINAL_STUDENT_T_95_METHOD,
    confidenceLevel: MARGINAL_STUDENT_T_95_CONFIDENCE_LEVEL,
    estimand: "arithmetic-group-mean",
    observationUnit: "endpoint-analytic-unit",
    interpretation: "two-separate-marginal-confidence-intervals",
    jointRegion: false,
    significanceTest: false,
    xAxis: axes[0],
    yAxis: axes[1],
    x: marginalMeanStudentT95(points.map(({ x }) => x)),
    y: marginalMeanStudentT95(points.map(({ y }) => y)),
  };
}
