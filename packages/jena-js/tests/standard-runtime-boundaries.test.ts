import { describe, expect, it } from "vitest";

import {
  EnaNumericalError,
  accumulateData,
  accumulateDataChunked,
} from "../src/index.js";
import type { AccumulateOptions, ENAData, Row } from "../src/index.js";

type MaterializationMode = "full" | "model";

function runStandard(options: AccumulateOptions, materialization: MaterializationMode): ENAData {
  return materialization === "full"
    ? accumulateData(options)
    : accumulateDataChunked({ ...options, chunkSize: 1, materialization: "model" });
}

function captureStandardError(operation: () => unknown): EnaNumericalError {
  let thrown: unknown;
  try {
    operation();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(EnaNumericalError);
  return thrown as EnaNumericalError;
}

function options(rows: Row[], overrides: Partial<AccumulateOptions> = {}): AccumulateOptions {
  return {
    rows,
    units: ["unit"],
    conversation: ["horizon"],
    codes: ["A", "B"],
    model: "EndPoint",
    window: "MovingStanzaWindow",
    windowSizeBack: 1,
    windowSizeForward: 0,
    weightBy: "sum",
    ...overrides,
  };
}

describe("Standard runtime numerical boundaries", () => {
  it.each(["full", "model"] as const)(
    "fails at the derived edge when a raw Frequency product is non-finite in %s materialization",
    (materialization) => {
      const thrown = captureStandardError(() => runStandard(options([
        { unit: "u1", horizon: "h1", A: 1e308, B: 1e308 },
      ]), materialization));
      expect(thrown.code).toBe("STANDARD_CONNECTION_NONFINITE");
      expect(thrown.edgeIndex).toBe(0);
      expect(thrown.sourceCode).toBe("A");
      expect(thrown.targetCode).toBe("B");
      expect(thrown.message).not.toContain("u1");
      expect(thrown.message).not.toContain("h1");
    },
  );

  it.each([
    ["EndPoint", "full"],
    ["EndPoint", "model"],
    ["SeparateTrajectory", "full"],
    ["SeparateTrajectory", "model"],
  ] as const)(
    "fails when finite focal connections overflow a %s accumulator in %s materialization",
    (model, materialization) => {
      const thrown = captureStandardError(() => runStandard(options([
        { unit: "u1", horizon: "h1", A: 1e154, B: 1e154 },
        { unit: "u1", horizon: "h1", A: 1e154, B: 1e154 },
      ], { model }), materialization));
      expect(thrown.code).toBe("STANDARD_ACCUMULATION_NONFINITE");
      expect(thrown.edgeIndex).toBe(0);
      expect(thrown.sourceCode).toBe("A");
      expect(thrown.targetCode).toBe("B");
    },
  );

  it.each(["full", "model"] as const)(
    "rejects a non-finite Conversation product in %s materialization",
    (materialization) => {
      const thrown = captureStandardError(() => runStandard(options([
        { unit: "u1", horizon: "h1", A: 1e308, B: 1e308 },
      ], { window: "Conversation" }), materialization));
      expect(thrown.code).toBe("STANDARD_CONNECTION_NONFINITE");
    },
  );

  it.each(["full", "model"] as const)(
    "rejects a Connection produced from an overflowing Conversation Code aggregate in %s materialization",
    (materialization) => {
      const thrown = captureStandardError(() => runStandard(options([
        { unit: "u1", horizon: "h1", A: 1e308, B: 1 },
        { unit: "u1", horizon: "h1", A: 1e308, B: 1 },
      ], { window: "Conversation" }), materialization));
      expect(thrown.code).toBe("STANDARD_CONNECTION_NONFINITE");
    },
  );

  it.each(["full", "model"] as const)(
    "rejects finite Conversation connections whose Endpoint aggregate overflows in %s materialization",
    (materialization) => {
      const thrown = captureStandardError(() => runStandard(options([
        { unit: "u1", horizon: "h1", A: 1e154, B: 1e154 },
        { unit: "u1", horizon: "h2", A: 1e154, B: 1e154 },
      ], { window: "Conversation" }), materialization));
      expect(thrown.code).toBe("STANDARD_ACCUMULATION_NONFINITE");
    },
  );

  it.each([
    ["MovingStanzaWindow", "full"],
    ["MovingStanzaWindow", "model"],
    ["Conversation", "full"],
    ["Conversation", "model"],
  ] as const)(
    "rejects an overflowing AccumulatedTrajectory running step for %s in %s materialization",
    (window, materialization) => {
      const thrown = captureStandardError(() => runStandard(options([
        { unit: "u1", horizon: "h1", A: 1e154, B: 1e154 },
        { unit: "u1", horizon: "h2", A: 1e154, B: 1e154 },
      ], { model: "AccumulatedTrajectory", window }), materialization));
      expect(thrown.code).toBe("STANDARD_ACCUMULATION_NONFINITE");
      expect(thrown.edgeIndex).toBe(0);
      expect(thrown.message).toContain("model accumulation");
    },
  );

  it.each(["full", "model"] as const)(
    "preserves an extreme but finite Frequency connection in %s materialization",
    (materialization) => {
      const result = runStandard(options([
        { unit: "u1", horizon: "h1", A: Number.MAX_VALUE / 2, B: 1 },
      ]), materialization);
      expect(result.connectionCounts[0]?.[result.codeColumns[0] ?? ""]).toBe(Number.MAX_VALUE / 2);
    },
  );

  it.each(["full", "model"] as const)(
    "permits an exactly maximum-finite Endpoint aggregate in %s materialization",
    (materialization) => {
      const result = runStandard(options([
        { unit: "u1", horizon: "h1", A: Number.MAX_VALUE / 2, B: 1 },
        { unit: "u1", horizon: "h1", A: Number.MAX_VALUE / 2, B: 1 },
      ]), materialization);
      expect(result.connectionCounts[0]?.[result.codeColumns[0] ?? ""]).toBe(Number.MAX_VALUE);
    },
  );

  it.each([
    ["MovingStanzaWindow", "full"],
    ["MovingStanzaWindow", "model"],
    ["Conversation", "full"],
    ["Conversation", "model"],
  ] as const)(
    "preserves Binary thresholding when its pre-threshold %s product overflows in %s materialization",
    (window, materialization) => {
      const result = runStandard(options([
        { unit: "u1", horizon: "h1", A: 1e308, B: 1e308 },
      ], { weightBy: "binary", window }), materialization);
      expect(result.connectionMatrix).toEqual([[1]]);
    },
  );

  it("model materialization does not retain the 4,500 by 1,225 row-edge surface", () => {
    const codes = Array.from({ length: 50 }, (_, index) => `C${index.toString().padStart(2, "0")}`);
    const rows: Row[] = Array.from({ length: 4_500 }, (_, rowIndex) => ({
      unit: `u${rowIndex % 2}`,
      horizon: "h1",
      ...Object.fromEntries(codes.map((code, codeIndex) => [code, (rowIndex + codeIndex) % 2])),
    }));
    const result = accumulateDataChunked({
      rows,
      units: ["unit"],
      conversation: ["horizon"],
      codes,
      model: "EndPoint",
      window: "MovingStanzaWindow",
      windowSizeBack: 1,
      windowSizeForward: 0,
      weightBy: "binary",
      materialization: "model",
      chunkSize: 128,
    });
    expect(result.codeColumns).toHaveLength(1_225);
    expect(result.connectionCounts).toHaveLength(2);
    expect(result.connectionMatrix).toHaveLength(2);
    expect(result.rawRows).toEqual([]);
    expect(result.rowConnectionCounts).toEqual([]);
  });
});
