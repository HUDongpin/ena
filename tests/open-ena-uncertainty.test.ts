import assert from "node:assert/strict";
import test from "node:test";
import {
  marginalMeanIntervalPair,
  marginalMeanStudentT95,
  studentTCritical975,
} from "../lib/open-ena/uncertainty";

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
