import { describe, expect, it } from "vitest";
import {
  DENSE_SVD_FLOAT64_BYTES,
  estimateDenseSvdBudget,
} from "../src/core/denseSvdBudget.js";

describe("checked dense SVD resource estimates", () => {
  it("computes the exact matrices and work retained by the dense SVD path", () => {
    expect(estimateDenseSvdBudget(2, 4_950)).toEqual({
      matrixCells: 73_527_300,
      matrixBytes: 588_218_400,
      workUnits: 121_336_380_000,
    });
    expect(DENSE_SVD_FLOAT64_BYTES).toBe(8);
  });

  it("preserves exact and one-over work boundaries", () => {
    expect(estimateDenseSvdBudget(700, 100).workUnits).toBe(8_000_000);
    expect(estimateDenseSvdBudget(701, 100).workUnits).toBe(8_010_000);
  });

  it("preserves exact and one-over matrix boundaries", () => {
    expect(estimateDenseSvdBudget(320, 128).matrixBytes).toBe(1_048_576);
    expect(estimateDenseSvdBudget(321, 128).matrixBytes).toBe(1_050_624);
  });

  it("fails closed before unsafe integer arithmetic can round", () => {
    expect(() => estimateDenseSvdBudget(Number.MAX_SAFE_INTEGER, 2)).toThrow(/safe integer/i);
    expect(() => estimateDenseSvdBudget(1, Number.MAX_SAFE_INTEGER)).toThrow(/safe integer/i);
    expect(() => estimateDenseSvdBudget(1.5, 2)).toThrow(/nonnegative safe integer/i);
  });
});
