import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_ESTIMATED_EXPORT_BYTES_V3,
  MAX_ESTIMATED_NUMERIC_CELLS_V3,
  MAX_ESTIMATED_PEAK_BYTES_V3,
  MAX_ESTIMATED_ROTATION_WORK_UNITS_V3,
  MAX_ESTIMATED_WINDOW_VISITS_V3,
  RESOURCE_BUDGET_VERSION_V3,
  ResourceEstimateErrorV3,
  estimateOnaResourcesV3,
  estimateStandardResourcesV3,
} from "../lib/open-ena/model-v3/resource-budget";
import type {
  OnaResourceInputV3,
  StandardResourceInputV3,
} from "../lib/open-ena/model-v3/resource-budget";

test("Standard resource estimates use undirected edges and actual Horizon sizes", () => {
  const estimate = estimateStandardResourcesV3({
    rowCount: 6,
    unitCount: 2,
    horizonCount: 2,
    codeCount: 4,
    horizonSizes: [2, 4],
    trajectorySteps: 5,
    windowType: "MovingStanzaWindow",
    backward: { kind: "infinity" },
    forward: { kind: "finite", value: 0 },
    referenceProjection: false,
  });
  assert.equal(estimate.adjacencyDimensions, 6);
  assert.equal(estimate.estimatedWindowVisits, 20);
  assert.equal(estimate.estimatedRetainedWindowRows, 0);
  assert.equal(estimate.estimatedRotationWorkUnits, 396);
  assert.equal(estimate.estimatedRotationMatrixBytes, 1_344);
  assert.equal(estimate.blocked, false);
});

const standardBase: StandardResourceInputV3 = {
  rowCount: 8,
  unitCount: 2,
  horizonCount: 2,
  codeCount: 4,
  horizonSizes: [3, 5],
  trajectorySteps: 5,
  windowType: "MovingStanzaWindow",
  backward: { kind: "finite", value: 1 },
  forward: { kind: "finite", value: 0 },
  referenceProjection: false,
};

for (const testCase of [
  { name: "finite backward one", patch: {}, visits: 8, forwardRows: 0, retainedRows: 0 },
  { name: "finite backward five", patch: { backward: { kind: "finite", value: 5 } }, visits: 34, forwardRows: 0, retainedRows: 7 },
  { name: "finite forward two", patch: { forward: { kind: "finite", value: 2 } }, visits: 24, forwardRows: 2, retainedRows: 4 },
  { name: "infinite backward", patch: { backward: { kind: "infinity" } }, visits: 34, forwardRows: 0, retainedRows: 0 },
  { name: "infinite forward", patch: { forward: { kind: "infinity" } }, visits: 34, forwardRows: 4, retainedRows: 8 },
  {
    name: "both extents infinite",
    patch: { backward: { kind: "infinity" }, forward: { kind: "infinity" } },
    visits: 60,
    forwardRows: 4,
    retainedRows: 8,
  },
  { name: "Conversation coverage", patch: { windowType: "Conversation" }, visits: 34, forwardRows: 5, retainedRows: 0 },
] as const) {
  test(`Standard ${testCase.name} has deterministic window visits`, () => {
    const input = { ...standardBase, ...testCase.patch } as StandardResourceInputV3;
    const before = structuredClone(input);
    const estimate = estimateStandardResourcesV3(input);
    assert.equal(estimate.estimatedWindowVisits, testCase.visits);
    assert.equal(estimate.estimatedForwardBufferRows, testCase.forwardRows);
    assert.equal(estimate.estimatedRetainedWindowRows, testCase.retainedRows);
    assert.deepEqual(input, before);
  });
}

test("Reference projection adds exactly one target-by-edge cell block", () => {
  const withoutReference = estimateStandardResourcesV3(standardBase);
  const withReference = estimateStandardResourcesV3({ ...standardBase, referenceProjection: true });
  assert.equal(withoutReference.estimatedNumericCells, 230);
  assert.equal(withReference.estimatedNumericCells, 260);
  assert.equal(withReference.estimatedNumericCells - withoutReference.estimatedNumericCells, 5 * 6);
});

test("Standard dense rotation estimates include three E-squared matrices and two N-by-E matrices", () => {
  const estimate = estimateStandardResourcesV3({
    rowCount: 2,
    unitCount: 2,
    horizonCount: 2,
    codeCount: 100,
    horizonSizes: [1, 1],
    trajectorySteps: 2,
    windowType: "Conversation",
    backward: { kind: "finite", value: 1 },
    forward: { kind: "finite", value: 0 },
    referenceProjection: false,
  });
  assert.equal(estimate.adjacencyDimensions, 4_950);
  assert.equal(estimate.estimatedRotationMatrixBytes, 588_218_400);
  assert.equal(estimate.estimatedRotationWorkUnits, 121_336_380_000);
  assert.equal(estimate.blockedReasons.includes("rotation-work"), true);
});

test("Standard rotation work boundary is fixed at the shared dense SVD limit", () => {
  const atLimit = estimateStandardResourcesV3({
    rowCount: 79_990,
    unitCount: 79_990,
    horizonCount: 1,
    codeCount: 5,
    horizonSizes: [79_990],
    trajectorySteps: 79_990,
    windowType: "MovingStanzaWindow",
    backward: { kind: "finite", value: 1 },
    forward: { kind: "finite", value: 0 },
    referenceProjection: false,
  });
  assert.equal(atLimit.adjacencyDimensions, 10);
  assert.equal(atLimit.estimatedRotationWorkUnits, MAX_ESTIMATED_ROTATION_WORK_UNITS_V3);
  assert.equal(atLimit.blockedReasons.includes("rotation-work"), false);

  const aboveLimit = estimateStandardResourcesV3({
    rowCount: 79_991,
    unitCount: 79_991,
    horizonCount: 1,
    codeCount: 5,
    horizonSizes: [79_991],
    trajectorySteps: 79_991,
    windowType: "MovingStanzaWindow",
    backward: { kind: "finite", value: 1 },
    forward: { kind: "finite", value: 0 },
    referenceProjection: false,
  });
  assert.equal(aboveLimit.estimatedRotationWorkUnits, MAX_ESTIMATED_ROTATION_WORK_UNITS_V3 + 100);
  assert.deepEqual(aboveLimit.blockedReasons, ["rotation-work"]);
});

test("Moving retained rows sum across all Horizons and cover streaming telemetry", async () => {
  const { createAccumulationStream } = await import("jena-js");
  const horizonCount = 1_000;
  const rows = Array.from({ length: horizonCount }, (_, index) => ({
    unit: `u${index}`,
    horizon: `h${index}`,
    A: 1,
    B: 1,
    C: 0,
  }));
  const cases = [
    { name: "finite backward", backward: 5, forward: 0 },
    { name: "infinite forward", backward: 1, forward: Number.POSITIVE_INFINITY },
    { name: "finite forward", backward: 2, forward: 2 },
    { name: "both infinite", backward: Number.POSITIVE_INFINITY, forward: Number.POSITIVE_INFINITY },
  ] as const;
  for (const testCase of cases) {
    const stream = createAccumulationStream({
      units: ["unit"],
      conversation: ["horizon"],
      codes: ["A", "B", "C"],
      window: "MovingStanzaWindow",
      windowSizeBack: testCase.backward,
      windowSizeForward: testCase.forward,
      materialization: "model",
    });
    stream.push(rows);
    const runtimePeak = stream.state.activeBufferedRowsPeak;
    stream.finish();
    const estimate = estimateStandardResourcesV3({
      rowCount: horizonCount,
      unitCount: horizonCount,
      horizonCount,
      codeCount: 3,
      horizonSizes: Array.from({ length: horizonCount }, () => 1),
      trajectorySteps: horizonCount,
      windowType: "MovingStanzaWindow",
      backward: Number.isFinite(testCase.backward)
        ? { kind: "finite", value: testCase.backward }
        : { kind: "infinity" },
      forward: Number.isFinite(testCase.forward)
        ? { kind: "finite", value: testCase.forward }
        : { kind: "infinity" },
      referenceProjection: false,
    });
    assert.equal(estimate.estimatedRetainedWindowRows, 1_000, testCase.name);
    assert.equal(estimate.estimatedRetainedWindowRows, runtimePeak, testCase.name);
  }
});

test("backward Infinity retains running state but no raw history across many Horizons", () => {
  const estimate = estimateStandardResourcesV3({
    rowCount: 1_000,
    unitCount: 1_000,
    horizonCount: 1_000,
    codeCount: 3,
    horizonSizes: Array.from({ length: 1_000 }, () => 1),
    trajectorySteps: 1_000,
    windowType: "MovingStanzaWindow",
    backward: { kind: "infinity" },
    forward: { kind: "finite", value: 0 },
    referenceProjection: false,
  });
  assert.equal(estimate.estimatedRetainedWindowRows, 0);
  assert.equal(estimate.estimatedWindowStateCells >= 3_000, true);
  assert.equal(estimate.estimatedWorkerMaterializationBytes > 1_000 * 8 * 16, true);
});

test("Conversation and ONA include per-Horizon state storage without pretending it is raw history", () => {
  const sizes = Array.from({ length: 1_000 }, () => 1);
  const conversation = estimateStandardResourcesV3({
    rowCount: 1_000,
    unitCount: 1_000,
    horizonCount: 1_000,
    codeCount: 3,
    horizonSizes: sizes,
    trajectorySteps: 1_000,
    windowType: "Conversation",
    backward: { kind: "finite", value: 1 },
    forward: { kind: "finite", value: 0 },
    referenceProjection: false,
  });
  assert.equal(conversation.estimatedRetainedWindowRows, 0);
  assert.equal(conversation.estimatedWindowStateCells >= 6_000, true);

  const ona = estimateOnaResourcesV3({
    rowCount: 1_000,
    unitCount: 1_000,
    horizonCount: 1_000,
    codeCount: 3,
    horizonSizes: sizes,
    backward: { kind: "infinity" },
  });
  assert.equal(ona.estimatedRetainedWindowRows, 0);
  assert.equal(ona.estimatedWindowStateCells >= 3_000, true);
  assert.equal(ona.estimatedWorkerMaterializationBytes > 1_000 * 8 * 16, true);
});

test("ONA finite backward history sums across Horizons and covers ordered runtime telemetry", async () => {
  const { createAccumulationStream } = await import("jena-js");
  const horizonCount = 1_000;
  const rows = Array.from({ length: horizonCount }, (_, index) => ({
    unit: `u${index}`,
    horizon: `h${index}`,
    A: 1,
    B: 0,
    C: 0,
  }));
  const stream = createAccumulationStream({
    units: ["unit"],
    conversation: ["horizon"],
    codes: ["A", "B", "C"],
    networkType: "ordered",
    windowSizeBack: 5,
    materialization: "model",
  });
  stream.push(rows);
  const runtimePeak = stream.state.activeBufferedRowsPeak;
  stream.finish();
  const estimate = estimateOnaResourcesV3({
    rowCount: horizonCount,
    unitCount: horizonCount,
    horizonCount,
    codeCount: 3,
    horizonSizes: Array.from({ length: horizonCount }, () => 1),
    backward: { kind: "finite", value: 5 },
  });
  assert.equal(runtimePeak, 1_000);
  assert.equal(estimate.estimatedRetainedWindowRows, runtimePeak);
});

test("resource constants, provenance, output detachment, and deep freezing are fixed", () => {
  assert.deepEqual([
    RESOURCE_BUDGET_VERSION_V3,
    MAX_ESTIMATED_NUMERIC_CELLS_V3,
    MAX_ESTIMATED_WINDOW_VISITS_V3,
    MAX_ESTIMATED_PEAK_BYTES_V3,
    MAX_ESTIMATED_EXPORT_BYTES_V3,
    MAX_ESTIMATED_ROTATION_WORK_UNITS_V3,
  ], [
    "open-ena-resource-v3.2",
    25_000_000,
    100_000_000,
    512 * 1024 * 1024,
    256 * 1024 * 1024,
    8_000_000,
  ]);
  const horizonSizes = [3, 5];
  const estimate = estimateStandardResourcesV3({ ...standardBase, horizonSizes });
  horizonSizes[0] = 8;
  assert.equal(estimate.analysisFamily, "standard");
  assert.equal(estimate.version, "open-ena-resource-v3.2");
  assert.equal(Object.isFrozen(estimate), true);
  assert.equal(Object.isFrozen(estimate.blockedReasons), true);
});

test("each Standard hard-limit fixture reports the exact fixed reason set", () => {
  const cases: Array<[readonly string[], StandardResourceInputV3]> = [
    [["numeric-cells", "rotation-work", "peak-bytes"], {
      ...standardBase,
      rowCount: 1,
      unitCount: 1,
      horizonCount: 1,
      horizonSizes: [1],
      codeCount: 110,
      trajectorySteps: 1,
    }],
    [["window-visits"], {
      ...standardBase,
      rowCount: 10_001,
      unitCount: 1,
      horizonCount: 1,
      horizonSizes: [10_001],
      codeCount: 3,
      trajectorySteps: 1,
      windowType: "Conversation",
    }],
    [["peak-bytes"], {
      ...standardBase,
      rowCount: 3_600_000,
      unitCount: 1,
      horizonCount: 1,
      horizonSizes: [3_600_000],
      codeCount: 3,
      trajectorySteps: 1,
    }],
    [["export-bytes"], {
      ...standardBase,
      rowCount: 1_200_000,
      unitCount: 1,
      horizonCount: 1,
      horizonSizes: [1_200_000],
      codeCount: 10,
      trajectorySteps: 1,
    }],
  ];
  for (const [reasons, input] of cases) {
    const estimate = estimateStandardResourcesV3(input);
    assert.equal(estimate.blocked, true, reasons.join(","));
    assert.deepEqual(estimate.blockedReasons, reasons, reasons.join(","));
  }
});

test("the exact window-visit limit is allowed and the next Horizon size is blocked", () => {
  const atLimit = estimateStandardResourcesV3({
    ...standardBase,
    rowCount: 10_000,
    unitCount: 1,
    horizonCount: 1,
    horizonSizes: [10_000],
    codeCount: 3,
    trajectorySteps: 1,
    backward: { kind: "infinity" },
  });
  assert.equal(atLimit.estimatedWindowVisits, MAX_ESTIMATED_WINDOW_VISITS_V3);
  assert.equal(atLimit.blockedReasons.includes("window-visits"), false);

  const aboveLimit = estimateStandardResourcesV3({
    ...standardBase,
    rowCount: 10_001,
    unitCount: 1,
    horizonCount: 1,
    horizonSizes: [10_001],
    codeCount: 3,
    trajectorySteps: 1,
    backward: { kind: "infinity" },
  });
  assert.equal(aboveLimit.estimatedWindowVisits, 100_020_001);
  assert.deepEqual(aboveLimit.blockedReasons, ["window-visits"]);
});

test("resource estimates are deterministic safe-integer artifacts and accept frozen inputs", () => {
  const input = Object.freeze({
    ...standardBase,
    horizonSizes: Object.freeze([3, 5]),
    backward: Object.freeze({ kind: "finite" as const, value: 1 }),
    forward: Object.freeze({ kind: "finite" as const, value: 0 }),
  });
  const first = estimateStandardResourcesV3(input);
  const second = estimateStandardResourcesV3(input);
  assert.deepEqual(first, second);
  for (const value of Object.values(first)) {
    if (typeof value === "number") {
      assert.equal(Number.isSafeInteger(value) && value >= 0, true);
    }
  }
});

test("the 4,500-row by 50-Code reviewer case is blocked by dense rotation work", () => {
  const estimate = estimateStandardResourcesV3({
    rowCount: 4_500,
    unitCount: 2,
    horizonCount: 1,
    codeCount: 50,
    horizonSizes: [4_500],
    trajectorySteps: 2,
    windowType: "MovingStanzaWindow",
    backward: { kind: "finite", value: 1 },
    forward: { kind: "finite", value: 0 },
    referenceProjection: false,
  });
  assert.equal(estimate.adjacencyDimensions, 1_225);
  assert.equal(estimate.estimatedWindowVisits, 4_500);
  assert.equal(estimate.estimatedNumericCells, 4_734_225);
  assert.equal(estimate.estimatedRotationWorkUnits, 1_841_266_875);
  assert.deepEqual(estimate.blockedReasons, ["rotation-work"]);
});

test("Standard inputs, extents, Horizon accounting, and arithmetic fail closed", () => {
  for (const mutate of [
    (input: Record<string, unknown>) => { input.rowCount = -1; },
    (input: Record<string, unknown>) => { input.unitCount = 1.5; },
    (input: Record<string, unknown>) => { input.horizonCount = Number.POSITIVE_INFINITY; },
    (input: Record<string, unknown>) => { input.codeCount = Number.MAX_SAFE_INTEGER + 1; },
    (input: Record<string, unknown>) => { input.trajectorySteps = -1; },
    (input: Record<string, unknown>) => { input.windowType = "other"; },
    (input: Record<string, unknown>) => { input.backward = { kind: "finite", value: 0 }; },
    (input: Record<string, unknown>) => { input.forward = { kind: "finite", value: -1 }; },
    (input: Record<string, unknown>) => { input.referenceProjection = 1; },
    (input: Record<string, unknown>) => { input.extra = true; },
  ]) {
    const malformed = structuredClone(standardBase) as unknown as Record<string, unknown>;
    mutate(malformed);
    assert.throws(
      () => estimateStandardResourcesV3(malformed as unknown as StandardResourceInputV3),
      (error) => error instanceof ResourceEstimateErrorV3 && error.code === "INVALID_INPUT",
    );
  }
  assert.throws(() => estimateStandardResourcesV3({ ...standardBase, horizonCount: 1 }), /length|Horizon/i);
  assert.throws(() => estimateStandardResourcesV3({ ...standardBase, horizonSizes: [2, 5] }), /sum|rowCount/i);
  assert.throws(() => estimateStandardResourcesV3({
    ...standardBase,
    rowCount: 5,
    horizonSizes: [0, 5],
  }), /positive|Horizon/i);
  assert.throws(() => estimateStandardResourcesV3({
    ...standardBase,
    rowCount: 0,
    unitCount: 0,
    horizonCount: 0,
    horizonSizes: [],
    codeCount: Number.MAX_SAFE_INTEGER,
    trajectorySteps: 0,
  }), (error) => error instanceof ResourceEstimateErrorV3 && error.code === "UNSAFE_ARITHMETIC");
});

test("resource estimators preserve unexpected failures instead of misclassifying them", () => {
  const sentinel = new Error("unexpected ownKeys failure");
  const hostile = new Proxy({ ...standardBase }, {
    ownKeys() {
      throw sentinel;
    },
  });
  assert.throws(
    () => estimateStandardResourcesV3(hostile),
    (error) => error === sentinel,
  );
});

test("ONA uses directed p-squared dimensions, stores its mask, and visits backward only", () => {
  const input: OnaResourceInputV3 = {
    rowCount: 6,
    unitCount: 2,
    horizonCount: 2,
    codeCount: 4,
    horizonSizes: [2, 4],
    backward: { kind: "infinity" },
  };
  const before = structuredClone(input);
  const estimate = estimateOnaResourcesV3(input);
  assert.equal(estimate.analysisFamily, "ona");
  assert.equal(estimate.adjacencyDimensions, 16);
  assert.equal(estimate.directionalMaskCells, 16);
  assert.equal(estimate.endpointNetworks, 2);
  assert.equal(estimate.estimatedWindowVisits, 20);
  assert.equal(estimate.estimatedForwardBufferRows, 0);
  assert.equal(estimate.estimatedNumericCells, 328);
  assert.equal(estimate.blocked, false);
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(estimate), true);
  assert.equal(Object.isFrozen(estimate.blockedReasons), true);
});

test("ONA validates backward-only inputs and fails closed on directed arithmetic overflow", () => {
  const valid: OnaResourceInputV3 = {
    rowCount: 6,
    unitCount: 2,
    horizonCount: 2,
    codeCount: 4,
    horizonSizes: [2, 4],
    backward: { kind: "finite", value: 1 },
  };
  assert.equal(estimateOnaResourcesV3(valid).estimatedWindowVisits, 6);
  assert.throws(() => estimateOnaResourcesV3({
    ...valid,
    forward: { kind: "finite", value: 0 },
  } as unknown as OnaResourceInputV3), /shape|forward/i);
  assert.throws(() => estimateOnaResourcesV3({
    ...valid,
    rowCount: 0,
    unitCount: 0,
    horizonCount: 0,
    horizonSizes: [],
    codeCount: Number.MAX_SAFE_INTEGER,
  }), /safe integer|arithmetic/i);
});
