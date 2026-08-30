import assert from "node:assert/strict";
import test from "node:test";
import {
  marginalMeanIntervalPair,
  marginalMeanStudentT95,
  studentTCritical975,
} from "../lib/open-ena/uncertainty";
import * as uncertaintyModule from "../lib/open-ena/uncertainty";

function close(actual: number, expected: number, tolerance = 1e-10) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

test("Student-t 97.5% critical values match authoritative R quantiles", () => {
  const golden = [
    [1, 12.706204736174692],
    [2, 4.302652729749462],
    [3, 3.182446305283708],
    [30, 2.042272456301238],
    [1_000, 1.962339080826408],
  ] as const;
  for (const [degreesFreedom, expected] of golden) {
    close(studentTCritical975(degreesFreedom), expected, 5e-10);
  }
  assert.throws(() => studentTCritical975(0), /positive integer/i);
  assert.throws(() => studentTCritical975(1.5), /positive integer/i);
});

test("marginal mean interval uses sample SD, n−1 degrees of freedom, and Student-t", () => {
  const interval = marginalMeanStudentT95([1, 2, 3, 4]);
  assert.equal(interval.status, "estimable");
  assert.equal(interval.sampleSize, 4);
  assert.equal(interval.degreesFreedom, 3);
  close(interval.mean, 2.5);
  close(interval.sampleStandardDeviation, 1.2909944487358056);
  close(interval.standardError, 0.6454972243679028);
  close(interval.tCritical, 3.182446305283708, 5e-10);
  close(interval.lower, 0.445739743239121);
  close(interval.upper, 4.554260256760879);
});

test("interval pairs explicitly encode marginal-not-joint and endpoint-unit semantics", () => {
  const interval = marginalMeanIntervalPair([
    { x: -1, y: 1 },
    { x: 0, y: 2 },
    { x: 1, y: 4 },
  ], ["SVD1", "SVD2"]);
  assert.equal(interval.method, "marginal-student-t-95");
  assert.equal(interval.confidenceLevel, 0.95);
  assert.equal(interval.estimand, "arithmetic-group-mean");
  assert.equal(interval.observationUnit, "endpoint-analytic-unit");
  assert.equal(interval.interpretation, "two-separate-marginal-confidence-intervals");
  assert.equal(interval.jointRegion, false);
  assert.equal(interval.significanceTest, false);
  assert.equal(interval.xAxis, "SVD1");
  assert.equal(interval.yAxis, "SVD2");
  assert.equal(interval.x.status, "estimable");
  assert.equal(interval.y.status, "estimable");
});

test("too-small, constant, and non-finite samples fail closed without NaN bounds", () => {
  const tooSmall = marginalMeanStudentT95([1]);
  assert.deepEqual(tooSmall, {
    status: "not-estimable",
    method: "marginal-student-t-95",
    confidenceLevel: 0.95,
    sampleSize: 1,
    reason: "insufficient-n",
  });

  const constant = marginalMeanStudentT95([7, 7, 7]);
  assert.equal(constant.status, "not-estimable");
  assert.equal(constant.reason, "zero-or-nonfinite-standard-error");

  const nonFinite = marginalMeanStudentT95([1, Number.POSITIVE_INFINITY, 3]);
  assert.equal(nonFinite.status, "not-estimable");
  assert.doesNotMatch(JSON.stringify(nonFinite), /NaN|Infinity/);
});

test("rENA-compatible outlier display intervals use Type-7 IQR half-width around the arithmetic mean", () => {
  const intervalFunction = (uncertaintyModule as unknown as {
    meanCenteredIqrOutlierInterval?: (values: readonly number[]) => {
      status: string;
      method: string;
      sampleSize: number;
      mean: number;
      firstQuartile: number;
      thirdQuartile: number;
      interquartileRange: number;
      halfWidth: number;
      lower: number;
      upper: number;
    };
  }).meanCenteredIqrOutlierInterval;

  assert.equal(typeof intervalFunction, "function", "the outlier display interval needs an explicit numerical contract");
  const interval = intervalFunction!([-2, 0, 2, 4]);
  assert.equal(interval.status, "estimable");
  assert.equal(interval.method, "rena-mean-centered-1.5-iqr");
  assert.equal(interval.sampleSize, 4);
  close(interval.mean, 1);
  close(interval.firstQuartile, -0.5);
  close(interval.thirdQuartile, 2.5);
  close(interval.interquartileRange, 3);
  close(interval.halfWidth, 4.5);
  close(interval.lower, -3.5);
  close(interval.upper, 5.5);
});

test("outlier display intervals change with the visible-unit population and fail closed for invalid samples", () => {
  const intervalFunction = (uncertaintyModule as unknown as {
    meanCenteredIqrOutlierInterval?: (values: readonly number[]) => {
      status: string;
      sampleSize: number;
      reason?: string;
      mean?: number;
      lower?: number;
      upper?: number;
    };
  }).meanCenteredIqrOutlierInterval;

  assert.equal(typeof intervalFunction, "function");
  const visibleOnly = intervalFunction!([0, 2, 4]);
  assert.equal(visibleOnly.status, "estimable");
  assert.equal(visibleOnly.sampleSize, 3);
  close(visibleOnly.mean!, 2);
  close(visibleOnly.lower!, -1);
  close(visibleOnly.upper!, 5);

  const zeroIqr = intervalFunction!([7, 7, 7]);
  assert.equal(zeroIqr.status, "estimable", "rENA keeps a zero-width display interval on a constant axis");
  close(zeroIqr.mean!, 7);
  close(zeroIqr.lower!, 7);
  close(zeroIqr.upper!, 7);

  assert.deepEqual(intervalFunction!([7]), {
    status: "not-estimable",
    method: "rena-mean-centered-1.5-iqr",
    sampleSize: 1,
    reason: "insufficient-n",
  });
  const nonFinite = intervalFunction!([1, Number.POSITIVE_INFINITY, 3]);
  assert.equal(nonFinite.status, "not-estimable");
  assert.doesNotMatch(JSON.stringify(nonFinite), /NaN|Infinity/);
});

test("outlier interval pairs identify a descriptive mean-centered display box rather than a confidence interval", () => {
  const pairFunction = (uncertaintyModule as unknown as {
    meanCenteredIqrOutlierIntervalPair?: (
      points: ReadonlyArray<{ x: number; y: number }>,
      axes: readonly [string, string],
    ) => Record<string, unknown> & {
      method: string;
      estimand: string;
      observationUnit: string;
      interpretation: string;
      confidenceInterval: boolean;
      significanceTest: boolean;
      xAxis: string;
      yAxis: string;
    };
  }).meanCenteredIqrOutlierIntervalPair;
  assert.equal(typeof pairFunction, "function");
  const pair = pairFunction!([
    { x: -2, y: 10 },
    { x: 0, y: 12 },
    { x: 2, y: 14 },
    { x: 4, y: 16 },
  ], ["MR1", "SVD2"]);
  assert.equal(pair.method, "rena-mean-centered-1.5-iqr");
  assert.equal(pair.estimand, "arithmetic-group-mean");
  assert.equal(pair.observationUnit, "endpoint-analytic-unit");
  assert.equal(pair.interpretation, "two-separate-mean-centered-outlier-display-intervals");
  assert.equal(pair.confidenceInterval, false);
  assert.equal(pair.significanceTest, false);
  assert.equal(pair.xAxis, "MR1");
  assert.equal(pair.yAxis, "SVD2");
});
