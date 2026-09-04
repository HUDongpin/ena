import { describe, expect, it } from "vitest";

import {
  EnaNumericalError,
  accumulateDataChunked,
} from "../src/index.js";
import type {
  AccumulateOptions,
  EnaNumericalErrorCode,
  Row,
} from "../src/index.js";

const orderedCodes: readonly EnaNumericalErrorCode[] = [
  "ORDERED_CONNECTION_NONFINITE",
  "ORDERED_PRODUCT_UNDERFLOW",
  "ORDERED_MASK_UNDERFLOW",
  "ORDERED_UNIT_AGGREGATION_NONFINITE",
];
void orderedCodes;

function options(rows: Row[], overrides: Partial<AccumulateOptions> = {}): AccumulateOptions {
  return {
    rows,
    units: ["unit"],
    conversation: ["horizon"],
    codes: ["A", "B"],
    networkType: "ordered",
    model: "EndPoint",
    window: "MovingStanzaWindow",
    windowSizeBack: 1,
    windowSizeForward: 0,
    weightBy: "sum",
    ...overrides,
  };
}

function capture(rows: Row[], overrides: Partial<AccumulateOptions> = {}): EnaNumericalError {
  let thrown: unknown;
  try {
    accumulateDataChunked({ ...options(rows, overrides), chunkSize: 1, materialization: "model" });
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(EnaNumericalError);
  return thrown as EnaNumericalError;
}

describe("ordered runtime typed numerical errors", () => {
  it("classifies a non-finite derived connection", () => {
    const thrown = capture([
      { unit: "u1", horizon: "h1", A: Number.MAX_VALUE, B: 0 },
      { unit: "u1", horizon: "h1", A: 0, B: 2 },
    ], { windowSizeBack: 2 });
    expect(thrown.code).toBe("ORDERED_CONNECTION_NONFINITE");
    expect(thrown.sourceCode).toBe("A");
    expect(thrown.targetCode).toBe("B");
  });

  it("classifies a positive ordered product underflow", () => {
    const thrown = capture([
      { unit: "u1", horizon: "h1", A: 1e-200, B: 1e-200 },
    ]);
    expect(thrown.code).toBe("ORDERED_PRODUCT_UNDERFLOW");
  });

  it("classifies a positive directional-mask underflow", () => {
    const thrown = capture([
      { unit: "u1", horizon: "h1", A: 1, B: 1 },
    ], { mask: [[1, Number.MIN_VALUE], [1, 1]] });
    expect(thrown.code).toBe("ORDERED_MASK_UNDERFLOW");
  });

  it("classifies a non-finite Unit aggregate", () => {
    const thrown = capture(Array.from({ length: 3 }, () => ({
      unit: "u1",
      horizon: "h1",
      A: Number.MAX_VALUE,
      B: 1,
    })));
    expect(thrown.code).toBe("ORDERED_UNIT_AGGREGATION_NONFINITE");
  });

  it("keeps namespace/schema failures outside the numerical error contract", () => {
    let thrown: unknown;
    try {
      accumulateDataChunked({
        ...options([{ unit: "u1", horizon: "h1", A: 1, B: 1, "A & B": 0 }]),
        materialization: "model",
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(EnaNumericalError);
  });
});
