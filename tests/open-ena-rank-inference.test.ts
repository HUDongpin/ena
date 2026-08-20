import assert from "node:assert/strict";
import test from "node:test";
import {
  averageRanks,
  chiSquareUpperTail,
  friedmanRankTest,
  holmAdjustPlanned,
  mannWhitneyRankTest,
  minimumAttainableWilcoxonP,
  normalizeRankValue,
  regularizedGammaQ,
  summarizeType7,
  twoSidedNormalP,
  wilcoxonSignedRankTest,
} from "../lib/open-ena/rank-inference";

function close(actual: number, expected: number, tolerance = 1e-12) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)),
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

test("rank inputs use the locked 12-significant-digit and type-7 summary contract", () => {
  assert.equal(normalizeRankValue(0.1 + 0.2), 0.3);
  assert.equal(normalizeRankValue(0.3), 0.3);
  assert.equal(Object.is(normalizeRankValue(-0), -0), false);
  assert.equal(normalizeRankValue(1.2345678901234), 1.23456789012);

  assert.deepEqual(summarizeType7([1, 2, 3, 4]), {
    median: 2.5,
    q1: 1.75,
    q3: 3.25,
    iqr: 1.5,
  });
});

test("Mann-Whitney tied exact inference uses the inclusive absolute fixed-size tail", () => {
  const result = mannWhitneyRankTest([1, 1], [1, 2, 3]);

  assert.equal(result.status, "available");
  assert.equal(result.reason, null);
  assert.equal(result.nPrimary, 2);
  assert.equal(result.nSecondary, 3);
  assert.equal(result.medianPrimary, 1);
  assert.equal(result.medianSecondary, 2);
  assert.equal(result.uPrimary, 1);
  assert.equal(result.uSecondary, 5);
  close(result.rankBiserialPrimaryVsSecondary ?? 0, -2 / 3);
  assert.equal(result.pValueTwoSided, 0.4);
  assert.notEqual(result.pValueTwoSided, 0.6, "2*min(one-sided tail) is not the locked two-sided definition");
  assert.equal(result.resolvedPMethod, "exact-conditional-rank-permutation");
  assert.equal(result.continuityCorrectionApplied, false);
  assert.deepEqual(result.exactTail, {
    extremeAssignmentCount: "4",
    totalAssignmentCount: "10",
    inclusive: true,
    midP: false,
  });
  assert.equal(result.tieGroupCount, 1);
  assert.equal(result.tiedObservationCount, 3);
  assert.deepEqual(result.warnings, ["small-sample", "discrete-attainable-p", "ties-present"]);
  assert.doesNotMatch(JSON.stringify(result), /primaryValues|secondaryValues|normalizedValues|ranks/);
});

test("Mann-Whitney exact and approximation boundaries retain direction and tie multiplicity", () => {
  const legacyTied = mannWhitneyRankTest([1, 2, 2], [2, 3]);
  assert.equal(legacyTied.pValueTwoSided, 0.6);
  assert.equal(legacyTied.exactTail?.extremeAssignmentCount, "6");
  assert.equal(legacyTied.exactTail?.totalAssignmentCount, "10");

  const separated = mannWhitneyRankTest([1, 2, 3, 4], [5, 6, 7, 8]);
  assert.equal(separated.status, "available");
  assert.equal(separated.uPrimary, 0);
  assert.equal(separated.uSecondary, 16);
  assert.equal(separated.rankBiserialPrimaryVsSecondary, -1);
  assert.equal(separated.pValueTwoSided, 1 / 35);
  assert.equal(separated.resolvedPMethod, "exact-classic");

  const first25 = Array.from({ length: 25 }, (_, index) => index + 1);
  const last25 = Array.from({ length: 25 }, (_, index) => index + 26);
  const boundaryExact = mannWhitneyRankTest(first25, last25);
  assert.equal(boundaryExact.resolvedPMethod, "exact-classic");
  assert.deepEqual(boundaryExact.exactTail, {
    extremeAssignmentCount: "2",
    totalAssignmentCount: "126410606437752",
    inclusive: true,
    midP: false,
  });

  const aboveBoundary = mannWhitneyRankTest(first25, [...last25, 51]);
  assert.equal(aboveBoundary.resolvedPMethod, "normal-approximation-tie-corrected");
  assert.equal(aboveBoundary.exactTail, null);
  assert.equal(aboveBoundary.continuityCorrectionApplied, true);
  close(aboveBoundary.z ?? 0, -6.114303242562626);
  close(aboveBoundary.pValueTwoSided ?? 0, 9.697974076284181e-10, 2e-12);
  assert.deepEqual(aboveBoundary.warnings, []);

  const reversed = mannWhitneyRankTest([5, 6, 7, 8], [1, 2, 3, 4]);
  assert.equal(reversed.uPrimary, separated.uSecondary);
  assert.equal(reversed.uSecondary, separated.uPrimary);
  assert.equal(reversed.z, -(separated.z ?? Number.NaN));
  assert.equal(reversed.rankBiserialPrimaryVsSecondary, 1);
  assert.equal(reversed.pValueTwoSided, separated.pValueTwoSided);

  const tiny = mannWhitneyRankTest([1], [2]);
  assert.equal(tiny.status, "available");
  assert.equal(tiny.pValueTwoSided, 1);
  assert.deepEqual(tiny.warnings, ["small-sample", "discrete-attainable-p"]);

  const allTied = mannWhitneyRankTest([1, 1], [1, 1]);
  assert.equal(allTied.status, "not-estimable");
  assert.equal(allTied.reason, "all-values-tied");
  assert.equal(allTied.resolvedPMethod, null);
  assert.equal(allTied.pValueTwoSided, null);
  assert.deepEqual(allTied.warnings, ["small-sample", "ties-present"]);
});

test("Mann-Whitney BigInt DP agrees with full fixed-size enumeration for small tied samples", () => {
  const fixtures = [
    { primary: [1], secondary: [2] },
    { primary: [1, 1], secondary: [1, 2, 3] },
    { primary: [1, 2, 2], secondary: [2, 3] },
    { primary: [-1, 0], secondary: [0, 1, 2] },
    { primary: [0.1 + 0.2, 1], secondary: [0.3, 2] },
  ] as const;

  for (const fixture of fixtures) {
    const result = mannWhitneyRankTest(fixture.primary, fixture.secondary);
    assert.equal(result.status, "available");
    const pooled = [...fixture.primary, ...fixture.secondary].map(normalizeRankValue);
    const ranked = averageRanks(pooled);
    const selectedSize = Math.min(fixture.primary.length, fixture.secondary.length);
    const primaryScore = ranked.doubledRanks
      .slice(0, fixture.primary.length)
      .reduce((sum, rank) => sum + rank, 0);
    const observedScore = fixture.primary.length <= fixture.secondary.length
      ? primaryScore
      : ranked.doubledRanks.reduce((sum, rank) => sum + rank, 0) - primaryScore;
    const center = selectedSize * (pooled.length + 1);
    const distance = Math.abs(observedScore - center);
    let total = 0;
    let extreme = 0;
    const choose = (start: number, remaining: number, score: number) => {
      if (remaining === 0) {
        total += 1;
        if (Math.abs(score - center) >= distance) extreme += 1;
        return;
      }
      for (let index = start; index <= ranked.doubledRanks.length - remaining; index += 1) {
        choose(index + 1, remaining - 1, score + ranked.doubledRanks[index]);
      }
    };
    choose(0, selectedSize, 0);
    assert.equal(result.exactTail?.totalAssignmentCount, String(total));
    assert.equal(result.exactTail?.extremeAssignmentCount, String(extreme));
    assert.equal(result.pValueTwoSided, extreme / total);
  }
});

test("Wilcoxon signed-rank reproduces the SciPy corn exact golden without leaking differences", () => {
  const result = wilcoxonSignedRankTest([
    6, 8, 14, 16, 23, 24, 28, 29, 41, -48, 49, 56, 60, -67, 75,
  ]);

  assert.equal(result.status, "available");
  assert.equal(result.reason, null);
  assert.equal(result.nMatched, 15);
  assert.equal(result.nMissing, 0);
  assert.equal(result.nPositive, 13);
  assert.equal(result.nNegative, 2);
  assert.equal(result.nZero, 0);
  assert.equal(result.nNonzero, 15);
  assert.equal(result.nRanked, 15);
  assert.equal(result.medianDifference, 24);
  assert.equal(result.q1Difference, 11);
  assert.equal(result.q3Difference, 45);
  assert.equal(result.iqrDifference, 34);
  assert.equal(result.wPositive, 96);
  assert.equal(result.wNegative, 24);
  assert.equal(result.t, 24);
  assert.equal(result.rankBiserialLaterVsEarlier, 0.6);
  assert.equal(result.pValueTwoSided, 0.041259765625);
  assert.equal(result.resolvedPMethod, "exact-classic");
  assert.equal(result.continuityCorrectionApplied, false);
  assert.deepEqual(result.exactTail, {
    extremeAssignmentCount: "1352",
    totalAssignmentCount: "32768",
    inclusive: true,
    midP: false,
  });
  assert.deepEqual(result.minimumAttainableTwoSidedP, {
    formula: "2^(1-nNonzero)",
    log2: -14,
    numeric: 0.00006103515625,
  });
  assert.deepEqual(result.warnings, [
    "discrete-attainable-p",
    "signed-rank-symmetry-assumption",
  ]);
  assert.doesNotMatch(JSON.stringify(result), /differences|absoluteRanks|normalizedValues/);
});

test("Wilcoxon handles Wilcox zeros, floating ties, approximation boundaries, and reversal", () => {
  const allPositive = wilcoxonSignedRankTest([1, 2, 3]);
  assert.equal(allPositive.wPositive, 6);
  assert.equal(allPositive.wNegative, 0);
  assert.equal(allPositive.t, 0);
  assert.equal(allPositive.rankBiserialLaterVsEarlier, 1);
  assert.equal(allPositive.pValueTwoSided, 0.25);
  assert.deepEqual(allPositive.exactTail, {
    extremeAssignmentCount: "2",
    totalAssignmentCount: "8",
    inclusive: true,
    midP: false,
  });

  const zerosAndTies = wilcoxonSignedRankTest([0, 1, -1, 2], { missingPairs: 2 });
  assert.equal(zerosAndTies.nMatched, 4);
  assert.equal(zerosAndTies.nMissing, 2);
  assert.equal(zerosAndTies.nZero, 1);
  assert.equal(zerosAndTies.nNonzero, 3);
  assert.equal(zerosAndTies.wPositive, 4.5);
  assert.equal(zerosAndTies.wNegative, 1.5);
  assert.equal(zerosAndTies.t, 1.5);
  assert.equal(zerosAndTies.rankBiserialLaterVsEarlier, 0.5);
  assert.equal(zerosAndTies.pValueTwoSided, 0.75);
  assert.equal(zerosAndTies.resolvedPMethod, "exact-conditional-sign-flip");
  assert.deepEqual(zerosAndTies.warnings, [
    "small-sample",
    "discrete-attainable-p",
    "ties-present",
    "zero-differences-present",
    "missing-pairs",
    "signed-rank-symmetry-assumption",
  ]);

  const floatingTies = wilcoxonSignedRankTest([
    0.5 - 0.525,
    0.825 - 0.775,
    0.375 - 0.325,
    0.5 - 0.55,
  ]);
  assert.equal(floatingTies.wPositive, 6);
  assert.equal(floatingTies.wNegative, 4);
  assert.equal(floatingTies.t, 4);
  assert.equal(floatingTies.pValueTwoSided, 1);
  assert.equal(floatingTies.tieGroupCount, 1);
  assert.equal(floatingTies.tiedObservationCount, 3);
  assert.equal(floatingTies.resolvedPMethod, "exact-conditional-sign-flip");

  const allZero = wilcoxonSignedRankTest([0, -0, 0]);
  assert.equal(allZero.status, "not-estimable");
  assert.equal(allZero.reason, "all-zero-differences");
  assert.equal(allZero.resolvedPMethod, null);
  assert.equal(allZero.minimumAttainableTwoSidedP, null);
  assert.deepEqual(allZero.warnings, ["small-sample", "zero-differences-present"]);

  const positive50 = Array.from({ length: 50 }, (_, index) => index + 1);
  const boundaryExact = wilcoxonSignedRankTest(positive50);
  assert.equal(boundaryExact.resolvedPMethod, "exact-classic");
  assert.equal(boundaryExact.pValueTwoSided, 1.7763568394002505e-15);
  assert.equal(boundaryExact.exactTail?.totalAssignmentCount, "1125899906842624");

  const aboveBoundary = wilcoxonSignedRankTest([...positive50, 51]);
  assert.equal(aboveBoundary.resolvedPMethod, "normal-approximation-actual-ranks");
  assert.equal(aboveBoundary.continuityCorrectionApplied, true);
  assert.equal(aboveBoundary.exactTail, null);
  close(aboveBoundary.z ?? 0, 6.209921799957451);
  close(aboveBoundary.pValueTwoSided ?? 0, 5.301097466706049e-10, 2e-12);
  assert.deepEqual(aboveBoundary.warnings, ["signed-rank-symmetry-assumption"]);

  const reversed = wilcoxonSignedRankTest(positive50.map((value) => -value));
  assert.equal(reversed.wPositive, boundaryExact.wNegative);
  assert.equal(reversed.wNegative, boundaryExact.wPositive);
  assert.equal(reversed.z, -(boundaryExact.z ?? Number.NaN));
  assert.equal(reversed.rankBiserialLaterVsEarlier, -1);
  assert.equal(reversed.pValueTwoSided, boundaryExact.pValueTwoSided);

  assert.deepEqual(minimumAttainableWilcoxonP(1075), {
    formula: "2^(1-nNonzero)",
    log2: -1074,
    numeric: Number.MIN_VALUE,
  });
  assert.deepEqual(minimumAttainableWilcoxonP(1076), {
    formula: "2^(1-nNonzero)",
    log2: -1075,
    numeric: null,
  });
  const underflowShape = wilcoxonSignedRankTest(Array.from({ length: 1076 }, () => 1));
  assert.equal(underflowShape.minimumAttainableTwoSidedP?.numeric, null);
  assert.equal(underflowShape.minimumAttainableTwoSidedP?.log2, -1075);
});

test("Wilcoxon sign-flip DP agrees with exhaustive small-n sign enumeration", () => {
  const fixtures = [
    [1],
    [1, -2, 3],
    [1, -1, 2],
    [0, 1, -1, 2],
    [0.1 + 0.2, -0.3, 0.6],
  ] as const;

  for (const raw of fixtures) {
    const result = wilcoxonSignedRankTest(raw);
    assert.equal(result.status, "available");
    const normalized = raw.map(normalizeRankValue).filter((difference) => difference !== 0);
    const ranked = averageRanks(normalized.map(Math.abs));
    const observed = ranked.doubledRanks.reduce(
      (sum, rank, index) => sum + (normalized[index] > 0 ? rank : 0),
      0,
    );
    const rankTotal = ranked.doubledRanks.reduce((sum, rank) => sum + rank, 0);
    const distance = Math.abs(2 * observed - rankTotal);
    let extreme = 0;
    const total = 2 ** normalized.length;
    for (let mask = 0; mask < total; mask += 1) {
      let score = 0;
      for (let index = 0; index < normalized.length; index += 1) {
        if ((mask & (1 << index)) !== 0) score += ranked.doubledRanks[index];
      }
      if (Math.abs(2 * score - rankTotal) >= distance) extreme += 1;
    }
    assert.equal(result.exactTail?.totalAssignmentCount, String(total));
    assert.equal(result.exactTail?.extremeAssignmentCount, String(extreme));
    assert.equal(result.pValueTwoSided, extreme / total);
  }
});

test("Friedman exact inference enumerates within-block period-label assignments", () => {
  const result = friedmanRankTest([
    [1, 2, 3],
    [1, 2, 3],
    [1, 2, 3],
  ]);

  assert.equal(result.status, "available");
  assert.equal(result.reason, null);
  assert.equal(result.nComplete, 3);
  assert.equal(result.nPeriods, 3);
  assert.equal(result.q, 6);
  assert.equal(result.degreesFreedom, 2);
  assert.equal(result.kendallsW, 1);
  assert.equal(result.pValueUpperTail, 1 / 36);
  assert.equal(result.resolvedPMethod, "exact-conditional-period-permutation");
  assert.deepEqual(result.exactTail, {
    extremeAssignmentCount: "6",
    totalAssignmentCount: "216",
    inclusive: true,
    midP: false,
  });
  assert.deepEqual(result.warnings, ["small-sample", "discrete-attainable-p"]);
  assert.doesNotMatch(JSON.stringify(result), /blocks|periodValues|ranks|rankSums/);
});

test("Friedman retains tied-label multiplicity and handles W, all-tied, and missing-block boundaries", () => {
  const tied = friedmanRankTest([
    [1, 1, 2],
    [1, 2, 2],
  ], { missingCompleteBlocks: 1 });
  assert.equal(tied.q, 3);
  assert.equal(tied.degreesFreedom, 2);
  assert.equal(tied.kendallsW, 0.75);
  assert.equal(tied.pValueUpperTail, 2 / 3);
  assert.equal(tied.tieGroupCount, 2);
  assert.equal(tied.tieCorrectionSum, 12);
  assert.deepEqual(tied.exactTail, {
    extremeAssignmentCount: "24",
    totalAssignmentCount: "36",
    inclusive: true,
    midP: false,
  });
  assert.deepEqual(tied.warnings, [
    "small-sample",
    "discrete-attainable-p",
    "ties-present",
    "missing-complete-blocks",
  ]);

  const balanced = friedmanRankTest([
    [1, 2, 3],
    [1, 3, 2],
    [2, 1, 3],
    [2, 3, 1],
    [3, 1, 2],
    [3, 2, 1],
  ]);
  assert.equal(balanced.q, 0);
  assert.equal(balanced.kendallsW, 0);
  assert.equal(balanced.pValueUpperTail, 1);

  const oneBlock = friedmanRankTest([[1, 2, 3]]);
  assert.equal(oneBlock.status, "available");
  assert.equal(oneBlock.q, 2);
  assert.equal(oneBlock.kendallsW, 1);
  assert.equal(oneBlock.pValueUpperTail, 1);

  const allTied = friedmanRankTest([
    [1, 1, 1],
    [2, 2, 2],
  ]);
  assert.equal(allTied.status, "not-estimable");
  assert.equal(allTied.reason, "all-values-tied");
  assert.equal(allTied.resolvedPMethod, null);
  assert.equal(allTied.pValueUpperTail, null);
  assert.deepEqual(allTied.warnings, ["small-sample", "ties-present"]);

  const empty = friedmanRankTest([], { periodCountWhenEmpty: 3, missingCompleteBlocks: 4 });
  assert.equal(empty.reason, "no-complete-blocks");
  assert.equal(empty.degreesFreedom, 2);
  assert.deepEqual(empty.warnings, ["small-sample", "missing-complete-blocks"]);
});

test("Friedman locks exact-assignment thresholds and R chi-square df=2/df=3 tails", () => {
  const sameOrder3 = (count: number) => Array.from({ length: count }, () => [1, 2, 3]);
  const exactDf2 = friedmanRankTest(sameOrder3(7));
  assert.equal(exactDf2.q, 14);
  assert.equal(exactDf2.kendallsW, 1);
  assert.equal(exactDf2.resolvedPMethod, "exact-conditional-period-permutation");
  assert.equal(exactDf2.exactTail?.totalAssignmentCount, "279936");
  assert.equal(exactDf2.exactTail?.extremeAssignmentCount, "6");
  assert.equal(exactDf2.pValueUpperTail, 1 / 46656);

  const approximateDf2 = friedmanRankTest(sameOrder3(8));
  assert.equal(approximateDf2.q, 16);
  assert.equal(approximateDf2.degreesFreedom, 2);
  assert.equal(approximateDf2.kendallsW, 1);
  assert.equal(approximateDf2.resolvedPMethod, "chi-square-approximation-tie-corrected");
  assert.equal(approximateDf2.exactTail, null);
  close(approximateDf2.pValueUpperTail ?? 0, 0.00033546262790251185);
  assert.deepEqual(approximateDf2.warnings, ["small-sample"]);

  const sameOrder4 = (count: number) => Array.from({ length: count }, () => [1, 2, 3, 4]);
  const exactDf3 = friedmanRankTest(sameOrder4(4));
  assert.equal(exactDf3.q, 12);
  assert.equal(exactDf3.degreesFreedom, 3);
  assert.equal(exactDf3.resolvedPMethod, "exact-conditional-period-permutation");
  assert.equal(exactDf3.exactTail?.totalAssignmentCount, "331776");
  assert.equal(exactDf3.exactTail?.extremeAssignmentCount, "24");
  assert.equal(exactDf3.pValueUpperTail, 1 / 13824);

  const approximateDf3 = friedmanRankTest(sameOrder4(5));
  assert.equal(approximateDf3.q, 15);
  assert.equal(approximateDf3.degreesFreedom, 3);
  assert.equal(approximateDf3.kendallsW, 1);
  assert.equal(approximateDf3.resolvedPMethod, "chi-square-approximation-tie-corrected");
  close(approximateDf3.pValueUpperTail ?? 0, 0.0018166489665723214);
  assert.deepEqual(approximateDf3.warnings, ["small-sample"]);
});

test("empty Friedman inference requires a non-negative safe-integer period count", () => {
  const invalidPeriodCounts = [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ];
  for (const periodCountWhenEmpty of invalidPeriodCounts) {
    assert.throws(
      () => friedmanRankTest([], { periodCountWhenEmpty }),
      /Friedman period count must be a non-negative safe integer/,
    );
  }
});

test("Holm is standard, monotone, order-invariant, and retains planned unavailable members", () => {
  const standard = holmAdjustPlanned([
    { memberId: "a", pRaw: 0.01 },
    { memberId: "b", pRaw: 0.04 },
    { memberId: "c", pRaw: 0.03 },
    { memberId: "d", pRaw: 0.2 },
  ]);
  assert.deepEqual(standard.map((member) => member.pHolm), [0.04, 0.09, 0.09, 0.2]);
  const sorted = [...standard].sort((left, right) => (left.pRaw ?? 1) - (right.pRaw ?? 1));
  for (let index = 1; index < sorted.length; index += 1) {
    assert.ok((sorted[index].pHolm ?? 1) >= (sorted[index - 1].pHolm ?? 0));
  }

  const planned = [
    { memberId: "axis-a", pRaw: 0.01 },
    { memberId: "axis-b", pRaw: null },
    { memberId: "axis-c", pRaw: 0.04 },
  ] as const;
  const adjusted = holmAdjustPlanned(planned);
  assert.deepEqual(adjusted, [
    { memberId: "axis-a", pRaw: 0.01, pHolm: 0.03, familySizePlanned: 3, holmRank: 1, holmMultiplier: 3 },
    { memberId: "axis-b", pRaw: null, pHolm: null, familySizePlanned: 3, holmRank: null, holmMultiplier: null },
    { memberId: "axis-c", pRaw: 0.04, pHolm: 0.08, familySizePlanned: 3, holmRank: 2, holmMultiplier: 2 },
  ]);

  const reordered = holmAdjustPlanned([planned[2], planned[0], planned[1]]);
  assert.deepEqual(
    Object.fromEntries(reordered.map((member) => [member.memberId, member.pHolm])),
    Object.fromEntries(adjusted.map((member) => [member.memberId, member.pHolm])),
  );
});

test("warning thresholds and the seven resolved method literals remain closed", () => {
  const tenPerGroup = mannWhitneyRankTest(
    Array.from({ length: 10 }, (_, index) => index),
    Array.from({ length: 10 }, (_, index) => index + 20),
  );
  assert.deepEqual(tenPerGroup.warnings, ["discrete-attainable-p"]);

  const tenPaired = wilcoxonSignedRankTest(Array.from({ length: 10 }, (_, index) => index + 1));
  assert.deepEqual(tenPaired.warnings, [
    "discrete-attainable-p",
    "signed-rank-symmetry-assumption",
  ]);

  const tenBlocks = friedmanRankTest(Array.from({ length: 10 }, () => [1, 2, 3]));
  assert.deepEqual(tenBlocks.warnings, []);

  const resolvedMethods = new Set([
    mannWhitneyRankTest([1, 2], [3, 4]).resolvedPMethod,
    mannWhitneyRankTest([1, 1], [1, 2, 3]).resolvedPMethod,
    mannWhitneyRankTest(
      Array.from({ length: 25 }, (_, index) => index),
      Array.from({ length: 26 }, (_, index) => index + 30),
    ).resolvedPMethod,
    wilcoxonSignedRankTest([0, 1, -1]).resolvedPMethod,
    wilcoxonSignedRankTest(Array.from({ length: 51 }, (_, index) => index + 1)).resolvedPMethod,
    friedmanRankTest([[1, 2, 3]]).resolvedPMethod,
    friedmanRankTest(Array.from({ length: 8 }, () => [1, 2, 3])).resolvedPMethod,
  ]);
  assert.deepEqual(resolvedMethods, new Set([
    "exact-classic",
    "exact-conditional-rank-permutation",
    "normal-approximation-tie-corrected",
    "exact-conditional-sign-flip",
    "normal-approximation-actual-ranks",
    "exact-conditional-period-permutation",
    "chi-square-approximation-tie-corrected",
  ]));
});

test("rank helpers preserve average-rank ties and high-precision distribution tails", () => {
  assert.deepEqual(summarizeType7([5]), { median: 5, q1: 5, q3: 5, iqr: 0 });
  assert.deepEqual(summarizeType7([1, 3]), { median: 2, q1: 1.5, q3: 2.5, iqr: 1 });
  assert.deepEqual(summarizeType7([1, 2, 9]), { median: 2, q1: 1.5, q3: 5.5, iqr: 4 });
  assert.equal(normalizeRankValue(1.2345678901234e-20), 1.23456789012e-20);
  assert.throws(() => normalizeRankValue(Number.NaN), /nonfinite-coordinate/);

  assert.deepEqual(averageRanks([40, 10, 10, 30]), {
    ranks: [4, 1.5, 1.5, 3],
    doubledRanks: [8, 3, 3, 6],
    tieGroupCount: 1,
    tiedObservationCount: 2,
    tieCorrectionSum: 6,
  });

  close(twoSidedNormalP(0), 1);
  close(twoSidedNormalP(1.959963984540054), 0.05);
  close(twoSidedNormalP(3), 0.0026997960632601913);
  close(twoSidedNormalP(8), 1.244192114854348e-15, 2e-12);
  close(chiSquareUpperTail(16, 2), 0.00033546262790251185);
  close(chiSquareUpperTail(15, 3), 0.0018166489665723214);
});

test("regularized gamma rejects every non-finite shape parameter", () => {
  for (const shape of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(
      () => regularizedGammaQ(shape, 1),
      /regularizedGammaQ requires shape > 0 and x >= 0/,
    );
  }
});
