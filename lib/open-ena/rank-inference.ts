export const OPEN_ENA_RANK_INFERENCE_METHOD = {
  alternative: "two-sided",
  pValueMethod: "auto-exact-first",
  zeroMethod: "wilcox",
  multiplicityCorrection: "holm",
  rankPrecisionSignificantDigits: 12,
  exactMaxRankedN: 50,
  friedmanExactAssignmentLimit: 1_000_000,
  continuityCorrection: 0.5,
} as const;

export const OPEN_ENA_SMALL_SAMPLE_EFFECTIVE_N = 10 as const;

export type OpenEnaResolvedRankPMethod =
  | "exact-classic"
  | "exact-conditional-rank-permutation"
  | "normal-approximation-tie-corrected"
  | "exact-conditional-sign-flip"
  | "normal-approximation-actual-ranks"
  | "exact-conditional-period-permutation"
  | "chi-square-approximation-tie-corrected";

export type OpenEnaRankWarningCode =
  | "small-sample"
  | "discrete-attainable-p"
  | "ties-present"
  | "zero-differences-present"
  | "missing-pairs"
  | "missing-complete-blocks"
  | "signed-rank-symmetry-assumption"
  | "independent-entity-assumption"
  | "cluster-independence-unverified"
  | "accumulated-trajectory-path-dependence"
  | "arbitrary-axis-sign"
  | "mr1-circularity";

export interface OpenEnaExactTailAudit {
  extremeAssignmentCount: string;
  totalAssignmentCount: string;
  inclusive: true;
  midP: false;
}

export function normalizeRankValue(value: number): number {
  if (!Number.isFinite(value)) throw new Error("nonfinite-coordinate");
  const rounded = Number(value.toPrecision(OPEN_ENA_RANK_INFERENCE_METHOD.rankPrecisionSignificantDigits));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function type7Quantile(sortedValues: readonly number[], probability: number): number | null {
  if (sortedValues.length === 0) return null;
  const h = (sortedValues.length - 1) * probability;
  const lowerIndex = Math.floor(h);
  const upperIndex = Math.ceil(h);
  const lower = sortedValues[lowerIndex];
  const upper = sortedValues[upperIndex];
  return lower + (h - lowerIndex) * (upper - lower);
}

export interface OpenEnaType7Summary {
  median: number | null;
  q1: number | null;
  q3: number | null;
  iqr: number | null;
}

export interface OpenEnaAverageRanks {
  ranks: number[];
  doubledRanks: number[];
  tieGroupCount: number;
  tiedObservationCount: number;
  tieCorrectionSum: number;
}

export function summarizeType7(values: readonly number[]): OpenEnaType7Summary {
  const sorted = values.map(normalizeRankValue).sort((left, right) => left - right);
  const median = type7Quantile(sorted, 0.5);
  const q1 = type7Quantile(sorted, 0.25);
  const q3 = type7Quantile(sorted, 0.75);
  return {
    median,
    q1,
    q3,
    iqr: q1 === null || q3 === null ? null : q3 - q1,
  };
}

export function averageRanks(values: readonly number[]): OpenEnaAverageRanks {
  const ordered = values
    .map((value, index) => ({ value: normalizeRankValue(value), index }))
    .sort((left, right) => left.value - right.value || left.index - right.index);
  const ranks = Array<number>(ordered.length);
  let tieGroupCount = 0;
  let tiedObservationCount = 0;
  let tieCorrectionSum = 0;
  for (let start = 0; start < ordered.length;) {
    let end = start + 1;
    while (end < ordered.length && ordered[end].value === ordered[start].value) end += 1;
    const averageRank = ((start + 1) + end) / 2;
    for (let index = start; index < end; index += 1) ranks[ordered[index].index] = averageRank;
    const tieSize = end - start;
    if (tieSize > 1) {
      tieGroupCount += 1;
      tiedObservationCount += tieSize;
      tieCorrectionSum += tieSize ** 3 - tieSize;
    }
    start = end;
  }
  return {
    ranks,
    doubledRanks: ranks.map((rank) => Math.round(rank * 2)),
    tieGroupCount,
    tiedObservationCount,
    tieCorrectionSum,
  };
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
  return 0.5 * Math.log(2 * Math.PI)
    + (shifted + 0.5) * Math.log(t)
    - t
    + Math.log(sum);
}

function unitInterval(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function regularizedGammaQ(shape: number, x: number): number {
  if (!Number.isFinite(shape) || shape <= 0 || Number.isNaN(x) || x < 0) {
    throw new Error("regularizedGammaQ requires shape > 0 and x >= 0");
  }
  if (x === 0) return 1;
  if (x === Number.POSITIVE_INFINITY) return 0;
  const epsilon = 1e-15;
  const maximumIterations = 10_000;
  const minimum = 1e-300;
  const logScale = -x + shape * Math.log(x) - logGamma(shape);

  if (x < shape + 1) {
    let term = 1 / shape;
    let sum = term;
    let denominator = shape;
    for (let iteration = 1; iteration <= maximumIterations; iteration += 1) {
      denominator += 1;
      term *= x / denominator;
      sum += term;
      if (Math.abs(term) <= Math.abs(sum) * epsilon) break;
    }
    return unitInterval(1 - sum * Math.exp(logScale));
  }

  let b = x + 1 - shape;
  let c = 1 / minimum;
  let d = 1 / Math.max(Math.abs(b), minimum);
  if (b < 0) d = -d;
  let fraction = d;
  for (let iteration = 1; iteration <= maximumIterations; iteration += 1) {
    const coefficient = -iteration * (iteration - shape);
    b += 2;
    d = coefficient * d + b;
    if (Math.abs(d) < minimum) d = minimum;
    c = b + coefficient / c;
    if (Math.abs(c) < minimum) c = minimum;
    d = 1 / d;
    const delta = d * c;
    fraction *= delta;
    if (Math.abs(delta - 1) <= epsilon) break;
  }
  return unitInterval(Math.exp(logScale) * fraction);
}

export function twoSidedNormalP(z: number): number {
  if (Number.isNaN(z)) throw new Error("Normal statistic must not be NaN.");
  if (!Number.isFinite(z)) return 0;
  return regularizedGammaQ(0.5, z * z / 2);
}

export function chiSquareUpperTail(statistic: number, degreesFreedom: number): number {
  if (!Number.isFinite(statistic) || statistic < 0
    || !Number.isFinite(degreesFreedom) || degreesFreedom <= 0) {
    throw new Error("Chi-square statistic and degrees of freedom must be finite and non-negative/positive.");
  }
  return regularizedGammaQ(degreesFreedom / 2, statistic / 2);
}

function probabilityFromCounts(extreme: bigint, total: bigint): number {
  if (total <= BigInt(0) || total > BigInt(Number.MAX_SAFE_INTEGER)
    || extreme < BigInt(0) || extreme > total) {
    throw new Error("Exact assignment counts exceed the supported safe ratio range.");
  }
  return Number(extreme) / Number(total);
}

export function fixedSizeRankPermutationTail(
  doubledRanks: readonly number[],
  selectedSize: number,
  observedDoubledRankSum: number,
): OpenEnaExactTailAudit & { pValue: number } {
  if (!Number.isInteger(selectedSize) || selectedSize < 0 || selectedSize > doubledRanks.length
    || !Number.isInteger(observedDoubledRankSum)
    || doubledRanks.some((rank) => !Number.isInteger(rank) || rank <= 0)) {
    throw new Error("Fixed-size rank permutation inputs must be positive integer doubled ranks and a valid size.");
  }
  const distributions = Array.from({ length: selectedSize + 1 }, () => new Map<number, bigint>());
  distributions[0].set(0, BigInt(1));
  let processed = 0;
  for (const rank of doubledRanks) {
    processed += 1;
    for (let picked = Math.min(selectedSize, processed); picked >= 1; picked -= 1) {
      for (const [score, count] of distributions[picked - 1]) {
        const nextScore = score + rank;
        distributions[picked].set(
          nextScore,
          (distributions[picked].get(nextScore) ?? BigInt(0)) + count,
        );
      }
    }
  }
  const nullCenter = selectedSize * (doubledRanks.length + 1);
  const observedDistance = Math.abs(observedDoubledRankSum - nullCenter);
  let total = BigInt(0);
  let extreme = BigInt(0);
  for (const [score, count] of distributions[selectedSize]) {
    total += count;
    if (Math.abs(score - nullCenter) >= observedDistance) extreme += count;
  }
  return {
    extremeAssignmentCount: extreme.toString(),
    totalAssignmentCount: total.toString(),
    inclusive: true,
    midP: false,
    pValue: probabilityFromCounts(extreme, total),
  };
}

export interface OpenEnaMannWhitneyResult {
  status: "available" | "not-estimable";
  reason: "empty-group" | "all-values-tied" | null;
  nPrimary: number;
  nSecondary: number;
  medianPrimary: number | null;
  medianSecondary: number | null;
  uPrimary: number | null;
  uSecondary: number | null;
  z: number | null;
  pValueTwoSided: number | null;
  rankBiserialPrimaryVsSecondary: number | null;
  resolvedPMethod: OpenEnaResolvedRankPMethod | null;
  continuityCorrectionApplied: boolean;
  tieGroupCount: number;
  tiedObservationCount: number;
  tieCorrectionSum: number;
  exactTail: OpenEnaExactTailAudit | null;
  warnings: OpenEnaRankWarningCode[];
}

function mannWhitneyWarnings(
  nPrimary: number,
  nSecondary: number,
  exact: boolean,
  hasTies: boolean,
): OpenEnaRankWarningCode[] {
  const warnings: OpenEnaRankWarningCode[] = [];
  if (nPrimary < OPEN_ENA_SMALL_SAMPLE_EFFECTIVE_N
    || nSecondary < OPEN_ENA_SMALL_SAMPLE_EFFECTIVE_N) warnings.push("small-sample");
  if (exact) warnings.push("discrete-attainable-p");
  if (hasTies) warnings.push("ties-present");
  return warnings;
}

export function mannWhitneyRankTest(
  primaryValues: readonly number[],
  secondaryValues: readonly number[],
): OpenEnaMannWhitneyResult {
  const primary = primaryValues.map(normalizeRankValue);
  const secondary = secondaryValues.map(normalizeRankValue);
  const nPrimary = primary.length;
  const nSecondary = secondary.length;
  const medianPrimary = summarizeType7(primary).median;
  const medianSecondary = summarizeType7(secondary).median;
  if (nPrimary === 0 || nSecondary === 0) {
    return {
      status: "not-estimable",
      reason: "empty-group",
      nPrimary,
      nSecondary,
      medianPrimary,
      medianSecondary,
      uPrimary: null,
      uSecondary: null,
      z: null,
      pValueTwoSided: null,
      rankBiserialPrimaryVsSecondary: null,
      resolvedPMethod: null,
      continuityCorrectionApplied: false,
      tieGroupCount: 0,
      tiedObservationCount: 0,
      tieCorrectionSum: 0,
      exactTail: null,
      warnings: mannWhitneyWarnings(nPrimary, nSecondary, false, false),
    };
  }

  const pooled = [...primary, ...secondary];
  const ranked = averageRanks(pooled);
  const rankSumPrimary = ranked.ranks
    .slice(0, nPrimary)
    .reduce((sum, rank) => sum + rank, 0);
  const uPrimary = rankSumPrimary - nPrimary * (nPrimary + 1) / 2;
  const uSecondary = nPrimary * nSecondary - uPrimary;
  const rankBiserialPrimaryVsSecondary = 2 * uPrimary / (nPrimary * nSecondary) - 1;
  const total = nPrimary + nSecondary;
  const variance = nPrimary * nSecondary / 12
    * (total + 1 - ranked.tieCorrectionSum / (total * (total - 1)));
  if (!(variance > 0) || !Number.isFinite(variance)) {
    return {
      status: "not-estimable",
      reason: "all-values-tied",
      nPrimary,
      nSecondary,
      medianPrimary,
      medianSecondary,
      uPrimary,
      uSecondary,
      z: null,
      pValueTwoSided: null,
      rankBiserialPrimaryVsSecondary,
      resolvedPMethod: null,
      continuityCorrectionApplied: false,
      tieGroupCount: ranked.tieGroupCount,
      tiedObservationCount: ranked.tiedObservationCount,
      tieCorrectionSum: ranked.tieCorrectionSum,
      exactTail: null,
      warnings: mannWhitneyWarnings(nPrimary, nSecondary, false, ranked.tieGroupCount > 0),
    };
  }

  const expectedU = nPrimary * nSecondary / 2;
  const continuityDirection = Math.sign(uPrimary - expectedU) * OPEN_ENA_RANK_INFERENCE_METHOD.continuityCorrection;
  const z = (uPrimary - expectedU - continuityDirection) / Math.sqrt(variance);
  const useExact = total <= OPEN_ENA_RANK_INFERENCE_METHOD.exactMaxRankedN;
  let exactTail: OpenEnaExactTailAudit | null = null;
  let pValueTwoSided: number;
  let resolvedPMethod: OpenEnaResolvedRankPMethod;
  if (useExact) {
    const selectPrimary = nPrimary <= nSecondary;
    const observedDoubledRankSum = selectPrimary
      ? ranked.doubledRanks.slice(0, nPrimary).reduce((sum, rank) => sum + rank, 0)
      : ranked.doubledRanks.slice(nPrimary).reduce((sum, rank) => sum + rank, 0);
    const exact = fixedSizeRankPermutationTail(
      ranked.doubledRanks,
      Math.min(nPrimary, nSecondary),
      observedDoubledRankSum,
    );
    exactTail = {
      extremeAssignmentCount: exact.extremeAssignmentCount,
      totalAssignmentCount: exact.totalAssignmentCount,
      inclusive: true,
      midP: false,
    };
    pValueTwoSided = exact.pValue;
    resolvedPMethod = ranked.tieGroupCount === 0
      ? "exact-classic"
      : "exact-conditional-rank-permutation";
  } else {
    pValueTwoSided = twoSidedNormalP(z);
    resolvedPMethod = "normal-approximation-tie-corrected";
  }

  return {
    status: "available",
    reason: null,
    nPrimary,
    nSecondary,
    medianPrimary,
    medianSecondary,
    uPrimary,
    uSecondary,
    z,
    pValueTwoSided,
    rankBiserialPrimaryVsSecondary,
    resolvedPMethod,
    continuityCorrectionApplied: !useExact,
    tieGroupCount: ranked.tieGroupCount,
    tiedObservationCount: ranked.tiedObservationCount,
    tieCorrectionSum: ranked.tieCorrectionSum,
    exactTail,
    warnings: mannWhitneyWarnings(nPrimary, nSecondary, useExact, ranked.tieGroupCount > 0),
  };
}

export function signFlipRankTail(
  doubledAbsoluteRanks: readonly number[],
  observedPositiveDoubledRankSum: number,
): OpenEnaExactTailAudit & { pValue: number } {
  if (!Number.isInteger(observedPositiveDoubledRankSum)
    || doubledAbsoluteRanks.some((rank) => !Number.isInteger(rank) || rank <= 0)) {
    throw new Error("Sign-flip inputs must be positive integer doubled ranks.");
  }
  const distribution = new Map<number, bigint>([[0, BigInt(1)]]);
  for (const rank of doubledAbsoluteRanks) {
    const additions = [...distribution.entries()];
    for (const [score, count] of additions) {
      const nextScore = score + rank;
      distribution.set(nextScore, (distribution.get(nextScore) ?? BigInt(0)) + count);
    }
  }
  const totalRank = doubledAbsoluteRanks.reduce((sum, rank) => sum + rank, 0);
  const observedDistance = Math.abs(2 * observedPositiveDoubledRankSum - totalRank);
  let total = BigInt(0);
  let extreme = BigInt(0);
  for (const [score, count] of distribution) {
    total += count;
    if (Math.abs(2 * score - totalRank) >= observedDistance) extreme += count;
  }
  return {
    extremeAssignmentCount: extreme.toString(),
    totalAssignmentCount: total.toString(),
    inclusive: true,
    midP: false,
    pValue: probabilityFromCounts(extreme, total),
  };
}

export interface OpenEnaMinimumAttainableTwoSidedP {
  formula: "2^(1-nNonzero)";
  log2: number;
  numeric: number | null;
}

export function minimumAttainableWilcoxonP(
  nNonzero: number,
): OpenEnaMinimumAttainableTwoSidedP | null {
  if (!Number.isInteger(nNonzero) || nNonzero < 0) {
    throw new Error("Wilcoxon nNonzero must be a non-negative integer.");
  }
  if (nNonzero === 0) return null;
  return {
    formula: "2^(1-nNonzero)",
    log2: 1 - nNonzero,
    numeric: nNonzero <= 1075 ? 2 ** (1 - nNonzero) : null,
  };
}

export interface OpenEnaWilcoxonSignedRankResult {
  status: "available" | "not-estimable";
  reason: "insufficient-ranked-observations" | "all-zero-differences" | null;
  nMatched: number;
  nMissing: number;
  nPositive: number;
  nNegative: number;
  nZero: number;
  nNonzero: number;
  nRanked: number;
  medianDifference: number | null;
  q1Difference: number | null;
  q3Difference: number | null;
  iqrDifference: number | null;
  wPositive: number | null;
  wNegative: number | null;
  t: number | null;
  z: number | null;
  pValueTwoSided: number | null;
  rankBiserialLaterVsEarlier: number | null;
  resolvedPMethod: OpenEnaResolvedRankPMethod | null;
  continuityCorrectionApplied: boolean;
  tieGroupCount: number;
  tiedObservationCount: number;
  tieCorrectionSum: number;
  exactTail: OpenEnaExactTailAudit | null;
  minimumAttainableTwoSidedP: OpenEnaMinimumAttainableTwoSidedP | null;
  warnings: OpenEnaRankWarningCode[];
}

function wilcoxonWarnings(
  nNonzero: number,
  exact: boolean,
  hasTies: boolean,
  hasZeros: boolean,
  hasMissing: boolean,
  available: boolean,
): OpenEnaRankWarningCode[] {
  const warnings: OpenEnaRankWarningCode[] = [];
  if (nNonzero < OPEN_ENA_SMALL_SAMPLE_EFFECTIVE_N) warnings.push("small-sample");
  if (available && exact) warnings.push("discrete-attainable-p");
  if (hasTies) warnings.push("ties-present");
  if (hasZeros) warnings.push("zero-differences-present");
  if (hasMissing) warnings.push("missing-pairs");
  if (available) warnings.push("signed-rank-symmetry-assumption");
  return warnings;
}

export function wilcoxonSignedRankTest(
  rawDifferencesLaterMinusEarlier: readonly number[],
  options: { missingPairs?: number } = {},
): OpenEnaWilcoxonSignedRankResult {
  const nMissing = options.missingPairs ?? 0;
  if (!Number.isInteger(nMissing) || nMissing < 0) {
    throw new Error("Wilcoxon missing-pair count must be a non-negative integer.");
  }
  const differences = rawDifferencesLaterMinusEarlier.map(normalizeRankValue);
  const nMatched = differences.length;
  const nPositive = differences.filter((difference) => difference > 0).length;
  const nNegative = differences.filter((difference) => difference < 0).length;
  const nZero = nMatched - nPositive - nNegative;
  const nonzero = differences.filter((difference) => difference !== 0);
  const nNonzero = nonzero.length;
  const summary = summarizeType7(differences);

  if (nNonzero === 0) {
    const reason = nMatched === 0 ? "insufficient-ranked-observations" : "all-zero-differences";
    return {
      status: "not-estimable",
      reason,
      nMatched,
      nMissing,
      nPositive,
      nNegative,
      nZero,
      nNonzero,
      nRanked: 0,
      medianDifference: summary.median,
      q1Difference: summary.q1,
      q3Difference: summary.q3,
      iqrDifference: summary.iqr,
      wPositive: null,
      wNegative: null,
      t: null,
      z: null,
      pValueTwoSided: null,
      rankBiserialLaterVsEarlier: null,
      resolvedPMethod: null,
      continuityCorrectionApplied: false,
      tieGroupCount: 0,
      tiedObservationCount: 0,
      tieCorrectionSum: 0,
      exactTail: null,
      minimumAttainableTwoSidedP: null,
      warnings: wilcoxonWarnings(0, false, false, nZero > 0, nMissing > 0, false),
    };
  }

  const ranked = averageRanks(nonzero.map(Math.abs));
  let wPositive = 0;
  let wNegative = 0;
  for (let index = 0; index < nonzero.length; index += 1) {
    if (nonzero[index] > 0) wPositive += ranked.ranks[index];
    else wNegative += ranked.ranks[index];
  }
  const totalRank = wPositive + wNegative;
  const t = Math.min(wPositive, wNegative);
  const rankBiserialLaterVsEarlier = (wPositive - wNegative) / totalRank;
  const expectedWPositive = totalRank / 2;
  const variance = ranked.ranks.reduce((sum, rank) => sum + rank * rank, 0) / 4;
  const correctionDirection = Math.sign(wPositive - expectedWPositive)
    * OPEN_ENA_RANK_INFERENCE_METHOD.continuityCorrection;
  const z = (wPositive - expectedWPositive - correctionDirection) / Math.sqrt(variance);
  const useExact = nNonzero <= OPEN_ENA_RANK_INFERENCE_METHOD.exactMaxRankedN;
  let exactTail: OpenEnaExactTailAudit | null = null;
  let pValueTwoSided: number;
  let resolvedPMethod: OpenEnaResolvedRankPMethod;
  if (useExact) {
    const observedPositiveDoubledRankSum = Math.round(wPositive * 2);
    const exact = signFlipRankTail(ranked.doubledRanks, observedPositiveDoubledRankSum);
    exactTail = {
      extremeAssignmentCount: exact.extremeAssignmentCount,
      totalAssignmentCount: exact.totalAssignmentCount,
      inclusive: true,
      midP: false,
    };
    pValueTwoSided = exact.pValue;
    resolvedPMethod = ranked.tieGroupCount === 0 && nZero === 0
      ? "exact-classic"
      : "exact-conditional-sign-flip";
  } else {
    pValueTwoSided = twoSidedNormalP(z);
    resolvedPMethod = "normal-approximation-actual-ranks";
  }

  return {
    status: "available",
    reason: null,
    nMatched,
    nMissing,
    nPositive,
    nNegative,
    nZero,
    nNonzero,
    nRanked: nNonzero,
    medianDifference: summary.median,
    q1Difference: summary.q1,
    q3Difference: summary.q3,
    iqrDifference: summary.iqr,
    wPositive,
    wNegative,
    t,
    z,
    pValueTwoSided,
    rankBiserialLaterVsEarlier,
    resolvedPMethod,
    continuityCorrectionApplied: !useExact,
    tieGroupCount: ranked.tieGroupCount,
    tiedObservationCount: ranked.tiedObservationCount,
    tieCorrectionSum: ranked.tieCorrectionSum,
    exactTail,
    minimumAttainableTwoSidedP: minimumAttainableWilcoxonP(nNonzero),
    warnings: wilcoxonWarnings(
      nNonzero,
      useExact,
      ranked.tieGroupCount > 0,
      nZero > 0,
      nMissing > 0,
      true,
    ),
  };
}

export interface OpenEnaFriedmanRankResult {
  status: "available" | "not-estimable";
  reason: "no-complete-blocks" | "insufficient-ranked-observations" | "all-values-tied" | null;
  nComplete: number;
  nMissingCompleteBlocks: number;
  nPeriods: number;
  q: number | null;
  degreesFreedom: number | null;
  kendallsW: number | null;
  pValueUpperTail: number | null;
  resolvedPMethod: OpenEnaResolvedRankPMethod | null;
  tieGroupCount: number;
  tiedObservationCount: number;
  tieCorrectionSum: number;
  exactTail: OpenEnaExactTailAudit | null;
  warnings: OpenEnaRankWarningCode[];
}

function factorialBigInt(value: number): bigint {
  let result = BigInt(1);
  for (let factor = 2; factor <= value; factor += 1) result *= BigInt(factor);
  return result;
}

function cappedAssignmentCount(factorial: bigint, exponent: number, limit: bigint): bigint {
  let result = BigInt(1);
  for (let index = 0; index < exponent; index += 1) {
    result *= factorial;
    if (result > limit) return limit + BigInt(1);
  }
  return result;
}

function weightedRankPermutations(doubledRanks: readonly number[]) {
  const counts = new Map<number, number>();
  for (const rank of doubledRanks) counts.set(rank, (counts.get(rank) ?? 0) + 1);
  const distinct = [...counts.keys()].sort((left, right) => left - right);
  const multiplicity = [...counts.values()].reduce(
    (product, count) => product * factorialBigInt(count),
    BigInt(1),
  );
  const permutations: Array<{ scores: number[]; multiplicity: bigint }> = [];
  const current = Array<number>(doubledRanks.length);
  const visit = (position: number) => {
    if (position === current.length) {
      permutations.push({ scores: [...current], multiplicity });
      return;
    }
    for (const rank of distinct) {
      const remaining = counts.get(rank) ?? 0;
      if (remaining === 0) continue;
      counts.set(rank, remaining - 1);
      current[position] = rank;
      visit(position + 1);
      counts.set(rank, remaining);
    }
  };
  visit(0);
  return permutations;
}

function friedmanScore(doubledRankSums: readonly number[], nComplete: number, nPeriods: number): number {
  const center = nComplete * (nPeriods + 1);
  return doubledRankSums.reduce((sum, rankSum) => sum + (rankSum - center) ** 2, 0);
}

function exactFriedmanTail(
  doubledRanksByBlock: readonly (readonly number[])[],
  observedDoubledRankSums: readonly number[],
): OpenEnaExactTailAudit & { pValue: number } {
  const nPeriods = observedDoubledRankSums.length;
  let states = new Map<string, { sums: number[]; count: bigint }>([[
    Array(nPeriods).fill(0).join(","),
    { sums: Array(nPeriods).fill(0), count: BigInt(1) },
  ]]);
  for (const blockRanks of doubledRanksByBlock) {
    const permutations = weightedRankPermutations(blockRanks);
    const next = new Map<string, { sums: number[]; count: bigint }>();
    for (const state of states.values()) {
      for (const permutation of permutations) {
        const sums = state.sums.map((sum, index) => sum + permutation.scores[index]);
        const key = sums.join(",");
        const count = state.count * permutation.multiplicity;
        const existing = next.get(key);
        if (existing) existing.count += count;
        else next.set(key, { sums, count });
      }
    }
    states = next;
  }
  const observedScore = friedmanScore(
    observedDoubledRankSums,
    doubledRanksByBlock.length,
    nPeriods,
  );
  let total = BigInt(0);
  let extreme = BigInt(0);
  for (const state of states.values()) {
    total += state.count;
    if (friedmanScore(state.sums, doubledRanksByBlock.length, nPeriods) >= observedScore) {
      extreme += state.count;
    }
  }
  return {
    extremeAssignmentCount: extreme.toString(),
    totalAssignmentCount: total.toString(),
    inclusive: true,
    midP: false,
    pValue: probabilityFromCounts(extreme, total),
  };
}

function friedmanWarnings(
  nComplete: number,
  exact: boolean,
  hasTies: boolean,
  hasMissing: boolean,
  available: boolean,
): OpenEnaRankWarningCode[] {
  const warnings: OpenEnaRankWarningCode[] = [];
  if (nComplete < OPEN_ENA_SMALL_SAMPLE_EFFECTIVE_N) warnings.push("small-sample");
  if (available && exact) warnings.push("discrete-attainable-p");
  if (hasTies) warnings.push("ties-present");
  if (hasMissing) warnings.push("missing-complete-blocks");
  return warnings;
}

export function friedmanRankTest(
  completeBlocksByPeriod: readonly (readonly number[])[],
  options: { missingCompleteBlocks?: number; periodCountWhenEmpty?: number } = {},
): OpenEnaFriedmanRankResult {
  const nComplete = completeBlocksByPeriod.length;
  const nMissingCompleteBlocks = options.missingCompleteBlocks ?? 0;
  if (!Number.isInteger(nMissingCompleteBlocks) || nMissingCompleteBlocks < 0) {
    throw new Error("Friedman missing-complete-block count must be a non-negative integer.");
  }
  const periodCountWhenEmpty = options.periodCountWhenEmpty === undefined
    ? 0
    : options.periodCountWhenEmpty;
  if (!Number.isSafeInteger(periodCountWhenEmpty) || periodCountWhenEmpty < 0) {
    throw new Error("Friedman period count must be a non-negative safe integer.");
  }
  const nPeriods = nComplete > 0
    ? completeBlocksByPeriod[0].length
    : periodCountWhenEmpty;
  if (nComplete === 0) {
    return {
      status: "not-estimable",
      reason: "no-complete-blocks",
      nComplete,
      nMissingCompleteBlocks,
      nPeriods,
      q: null,
      degreesFreedom: nPeriods >= 1 ? nPeriods - 1 : null,
      kendallsW: null,
      pValueUpperTail: null,
      resolvedPMethod: null,
      tieGroupCount: 0,
      tiedObservationCount: 0,
      tieCorrectionSum: 0,
      exactTail: null,
      warnings: friedmanWarnings(0, false, false, nMissingCompleteBlocks > 0, false),
    };
  }
  if (nPeriods < 3) {
    return {
      status: "not-estimable",
      reason: "insufficient-ranked-observations",
      nComplete,
      nMissingCompleteBlocks,
      nPeriods,
      q: null,
      degreesFreedom: nPeriods >= 1 ? nPeriods - 1 : null,
      kendallsW: null,
      pValueUpperTail: null,
      resolvedPMethod: null,
      tieGroupCount: 0,
      tiedObservationCount: 0,
      tieCorrectionSum: 0,
      exactTail: null,
      warnings: friedmanWarnings(nComplete, false, false, nMissingCompleteBlocks > 0, false),
    };
  }
  if (completeBlocksByPeriod.some((block) => block.length !== nPeriods)) {
    throw new Error("entity-period-instability");
  }

  const doubledRanksByBlock: number[][] = [];
  const observedDoubledRankSums = Array<number>(nPeriods).fill(0);
  let tieGroupCount = 0;
  let tiedObservationCount = 0;
  let tieCorrectionSum = 0;
  for (const block of completeBlocksByPeriod) {
    const normalized = block.map(normalizeRankValue);
    const ranked = averageRanks(normalized);
    doubledRanksByBlock.push(ranked.doubledRanks);
    for (let period = 0; period < nPeriods; period += 1) {
      observedDoubledRankSums[period] += ranked.doubledRanks[period];
    }
    tieGroupCount += ranked.tieGroupCount;
    tiedObservationCount += ranked.tiedObservationCount;
    tieCorrectionSum += ranked.tieCorrectionSum;
  }

  const denominator = nComplete * nPeriods * (nPeriods + 1)
    - tieCorrectionSum / (nPeriods - 1);
  if (!(denominator > 0) || !Number.isFinite(denominator)) {
    return {
      status: "not-estimable",
      reason: "all-values-tied",
      nComplete,
      nMissingCompleteBlocks,
      nPeriods,
      q: null,
      degreesFreedom: nPeriods - 1,
      kendallsW: null,
      pValueUpperTail: null,
      resolvedPMethod: null,
      tieGroupCount,
      tiedObservationCount,
      tieCorrectionSum,
      exactTail: null,
      warnings: friedmanWarnings(
        nComplete,
        false,
        tieGroupCount > 0,
        nMissingCompleteBlocks > 0,
        false,
      ),
    };
  }

  const score = friedmanScore(observedDoubledRankSums, nComplete, nPeriods);
  const q = 3 * score / denominator;
  const degreesFreedom = nPeriods - 1;
  const kendallsW = Math.max(0, Math.min(1, q / (nComplete * degreesFreedom)));
  const factorial = factorialBigInt(nPeriods);
  const assignmentLimit = BigInt(OPEN_ENA_RANK_INFERENCE_METHOD.friedmanExactAssignmentLimit);
  const assignmentCount = cappedAssignmentCount(factorial, nComplete, assignmentLimit);
  const useExact = assignmentCount <= assignmentLimit;
  let exactTail: OpenEnaExactTailAudit | null = null;
  let pValueUpperTail: number;
  let resolvedPMethod: OpenEnaResolvedRankPMethod;
  if (useExact) {
    const exact = exactFriedmanTail(doubledRanksByBlock, observedDoubledRankSums);
    exactTail = {
      extremeAssignmentCount: exact.extremeAssignmentCount,
      totalAssignmentCount: exact.totalAssignmentCount,
      inclusive: true,
      midP: false,
    };
    pValueUpperTail = exact.pValue;
    resolvedPMethod = "exact-conditional-period-permutation";
  } else {
    pValueUpperTail = chiSquareUpperTail(q, degreesFreedom);
    resolvedPMethod = "chi-square-approximation-tie-corrected";
  }

  return {
    status: "available",
    reason: null,
    nComplete,
    nMissingCompleteBlocks,
    nPeriods,
    q,
    degreesFreedom,
    kendallsW,
    pValueUpperTail,
    resolvedPMethod,
    tieGroupCount,
    tiedObservationCount,
    tieCorrectionSum,
    exactTail,
    warnings: friedmanWarnings(
      nComplete,
      useExact,
      tieGroupCount > 0,
      nMissingCompleteBlocks > 0,
      true,
    ),
  };
}

export interface OpenEnaPlannedHolmMember {
  memberId: string;
  pRaw: number | null;
}

export interface OpenEnaPlannedHolmResult extends OpenEnaPlannedHolmMember {
  pHolm: number | null;
  familySizePlanned: number;
  holmRank: number | null;
  holmMultiplier: number | null;
}

export function holmAdjustPlanned(
  members: readonly OpenEnaPlannedHolmMember[],
): OpenEnaPlannedHolmResult[] {
  const identifiers = new Set<string>();
  for (const member of members) {
    if (!member.memberId || identifiers.has(member.memberId)) {
      throw new Error("Holm member IDs must be nonempty and unique.");
    }
    identifiers.add(member.memberId);
    if (member.pRaw !== null
      && (!Number.isFinite(member.pRaw) || member.pRaw < 0 || member.pRaw > 1)) {
      throw new Error("Holm raw p-values must be null or finite values in [0, 1].");
    }
  }
  const familySizePlanned = members.length;
  const ordered = members
    .map((member, originalIndex) => ({
      ...member,
      originalIndex,
      effectiveP: member.pRaw ?? 1,
    }))
    .sort((left, right) => left.effectiveP - right.effectiveP
      || left.memberId.localeCompare(right.memberId));
  const byOriginalIndex = Array<OpenEnaPlannedHolmResult>(familySizePlanned);
  let runningMaximum = 0;
  for (let index = 0; index < ordered.length; index += 1) {
    const member = ordered[index];
    const multiplier = familySizePlanned - index;
    runningMaximum = Math.min(1, Math.max(runningMaximum, multiplier * member.effectiveP));
    byOriginalIndex[member.originalIndex] = {
      memberId: member.memberId,
      pRaw: member.pRaw,
      pHolm: member.pRaw === null ? null : runningMaximum,
      familySizePlanned,
      holmRank: member.pRaw === null ? null : index + 1,
      holmMultiplier: member.pRaw === null ? null : multiplier,
    };
  }
  return byOriginalIndex;
}
