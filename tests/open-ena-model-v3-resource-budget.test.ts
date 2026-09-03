import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_ESTIMATED_EXPORT_BYTES_V3,
  MAX_ESTIMATED_NUMERIC_CELLS_V3,
  MAX_ESTIMATED_PEAK_BYTES_V3,
  MAX_ESTIMATED_WINDOW_VISITS_V3,
  RESOURCE_BUDGET_VERSION_V3,
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
  { name: "finite backward one", patch: {}, visits: 8, forwardRows: 0 },
  { name: "finite backward five", patch: { backward: { kind: "finite", value: 5 } }, visits: 34, forwardRows: 0 },
  { name: "finite forward two", patch: { forward: { kind: "finite", value: 2 } }, visits: 24, forwardRows: 2 },
  { name: "infinite backward", patch: { backward: { kind: "infinity" } }, visits: 34, forwardRows: 0 },
  { name: "infinite forward", patch: { forward: { kind: "infinity" } }, visits: 34, forwardRows: 4 },
  {
    name: "both extents infinite",
    patch: { backward: { kind: "infinity" }, forward: { kind: "infinity" } },
    visits: 60,
    forwardRows: 4,
  },
  { name: "Conversation coverage", patch: { windowType: "Conversation" }, visits: 34, forwardRows: 5 },
] as const) {
  test(`Standard ${testCase.name} has deterministic window visits`, () => {
    const input = { ...standardBase, ...testCase.patch } as StandardResourceInputV3;
    const before = structuredClone(input);
    const estimate = estimateStandardResourcesV3(input);
    assert.equal(estimate.estimatedWindowVisits, testCase.visits);
    assert.equal(estimate.estimatedForwardBufferRows, testCase.forwardRows);
    assert.deepEqual(input, before);
  });
}

test("Reference projection adds exactly one target-by-edge cell block", () => {
  const withoutReference = estimateStandardResourcesV3(standardBase);
  const withReference = estimateStandardResourcesV3({ ...standardBase, referenceProjection: true });
  assert.equal(withoutReference.estimatedNumericCells, 98);
  assert.equal(withReference.estimatedNumericCells, 128);
  assert.equal(withReference.estimatedNumericCells - withoutReference.estimatedNumericCells, 5 * 6);
});

test("resource constants, provenance, output detachment, and deep freezing are fixed", () => {
  assert.deepEqual([
    RESOURCE_BUDGET_VERSION_V3,
    MAX_ESTIMATED_NUMERIC_CELLS_V3,
    MAX_ESTIMATED_WINDOW_VISITS_V3,
    MAX_ESTIMATED_PEAK_BYTES_V3,
    MAX_ESTIMATED_EXPORT_BYTES_V3,
  ], ["open-ena-resource-v3.1", 25_000_000, 100_000_000, 512 * 1024 * 1024, 256 * 1024 * 1024]);
  const horizonSizes = [3, 5];
  const estimate = estimateStandardResourcesV3({ ...standardBase, horizonSizes });
  horizonSizes[0] = 8;
  assert.equal(estimate.analysisFamily, "standard");
  assert.equal(estimate.version, "open-ena-resource-v3.1");
  assert.equal(Object.isFrozen(estimate), true);
  assert.equal(Object.isFrozen(estimate.blockedReasons), true);
});

test("each Standard hard limit is reported independently", () => {
  const cases: Array<[string, StandardResourceInputV3]> = [
    ["numeric-cells", {
      ...standardBase,
      rowCount: 1,
      unitCount: 1,
      horizonCount: 1,
      horizonSizes: [1],
      codeCount: 110,
      trajectorySteps: 1,
    }],
    ["window-visits", {
      ...standardBase,
      rowCount: 10_001,
      unitCount: 1,
      horizonCount: 1,
      horizonSizes: [10_001],
      codeCount: 3,
      trajectorySteps: 1,
      windowType: "Conversation",
    }],
    ["peak-bytes", {
      ...standardBase,
      rowCount: 3_600_000,
      unitCount: 1,
      horizonCount: 1,
      horizonSizes: [3_600_000],
      codeCount: 3,
      trajectorySteps: 1,
    }],
    ["export-bytes", {
      ...standardBase,
      rowCount: 1_200_000,
      unitCount: 1,
      horizonCount: 1,
      horizonSizes: [1_200_000],
      codeCount: 10,
      trajectorySteps: 1,
    }],
  ];
  for (const [reason, input] of cases) {
    const estimate = estimateStandardResourcesV3(input);
    assert.equal(estimate.blocked, true, reason);
    assert.deepEqual(estimate.blockedReasons, [reason], reason);
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
    assert.throws(() => estimateStandardResourcesV3(malformed as unknown as StandardResourceInputV3));
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
  }), /safe integer|arithmetic/i);
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
