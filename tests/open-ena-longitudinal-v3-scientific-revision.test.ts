import assert from "node:assert/strict";
import test from "node:test";

test("a prepared trajectory run is current only at its exact scientific revision and request binding", async () => {
  const longitudinal = await import("../lib/open-ena/longitudinal-v3") as Record<string, unknown>;
  assert.equal(typeof longitudinal.bindOpenEnaLongitudinalScientificRunV3, "function");
  assert.equal(typeof longitudinal.isOpenEnaLongitudinalScientificRunCurrentV3, "function");
  assert.equal(typeof longitudinal.advanceOpenEnaLongitudinalScientificRevisionV3, "function");

  const bind = longitudinal.bindOpenEnaLongitudinalScientificRunV3 as (
    revision: number,
    binding: Record<string, string>,
  ) => unknown;
  const isCurrent = longitudinal.isOpenEnaLongitudinalScientificRunCurrentV3 as (
    identity: unknown,
    revision: number,
    binding: Record<string, string>,
  ) => boolean;
  const advance = longitudinal.advanceOpenEnaLongitudinalScientificRevisionV3 as (
    revision: number,
  ) => number;
  const binding = {
    datasetHash: "a".repeat(64),
    specHash: "b".repeat(64),
    sourceResultHash: "c".repeat(64),
    requestHash: "d".repeat(64),
    runId: "run-a",
  };
  const identity = bind(4, binding);

  assert.equal(isCurrent(identity, 4, binding), true, "remote A -> local A must preserve one exact scientific identity");
  assert.equal(isCurrent(identity, advance(4), binding), false, "editing settings to B must invalidate A");
  assert.equal(
    isCurrent(identity, 4, { ...binding, requestHash: "e".repeat(64) }),
    false,
    "a different request cannot reuse the same revision token",
  );
  assert.throws(
    () => advance(Number.MAX_SAFE_INTEGER),
    /scientific revision capacity/i,
    "revision exhaustion must fail closed instead of reusing a prior identity",
  );
});

test("disable-inference recovery derives from one frozen settings and prepared-request snapshot", async () => {
  const longitudinal = await import("../lib/open-ena/longitudinal-v3") as Record<string, unknown>;
  assert.equal(typeof longitudinal.snapshotOpenEnaLongitudinalSettingsV3, "function");
  assert.equal(typeof longitudinal.withoutOpenEnaLongitudinalInferenceSettingsV3, "function");
  assert.equal(typeof longitudinal.withoutOpenEnaLongitudinalInferencePreparedV3, "function");
  assert.equal(typeof longitudinal.openEnaLongitudinalHeaderDimensionsV3, "function");

  const settings = {
    schemaVersion: 3,
    sourceBinding: { datasetHash: "a".repeat(64), analyzedAt: "2026-08-25T00:00:00.000Z", configurationHash: "b".repeat(64) },
    participantColumns: ["Speaker"],
    identityConfirmed: true,
    identityBindingHash: "c".repeat(64),
    timeColumn: "Period",
    orderedPeriods: [{
      identity: { components: [{ name: "Period", type: "number", value: 1 }], canonical: "period-1", display: "1" },
      sourceTimeCanonical: "period-1",
      displayLabel: "1",
      expected: false,
      value: { type: "ordered-index-v2", index: 0 },
    }],
    cohortPolicy: "available",
    missingValuePolicy: "complete-analytical-rows",
    estimand: { kind: "equal-participant" },
    selectedDimensions: ["A1", "A2", "A3"],
    inference: {
      independentPeriod: { kind: "independent-period", groups: ["g1", "g2"], periodCanonical: "period-1" },
      pairedPeriods: null,
      repeatedPeriods: null,
      pathComparison: { kind: "path-comparison", design: "independent", groups: ["g1", "g2"], repetitions: 500, seed: 991, samePhysicalEntityConfirmed: false },
    },
    bootstrap: { enabled: false, repetitions: 500, confidenceLevel: 0.95, seed: 2026, resamplingDesign: "auto", explicitStrataField: null },
    networkOverlay: { enabled: false, periodCanonical: null, groupCanonical: null },
  };
  const snapshot = (longitudinal.snapshotOpenEnaLongitudinalSettingsV3 as (value: unknown) => typeof settings)(settings);
  settings.selectedDimensions[0] = "B1";
  settings.inference.pathComparison.seed = 123;
  assert.deepEqual(snapshot.selectedDimensions, ["A1", "A2", "A3"]);
  assert.equal(snapshot.inference.pathComparison?.seed, 991);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.inference), true);
  assert.equal(Object.isFrozen(snapshot.orderedPeriods[0]), true);

  const withoutInference = (
    longitudinal.withoutOpenEnaLongitudinalInferenceSettingsV3 as (value: unknown) => typeof settings
  )(snapshot);
  assert.deepEqual(withoutInference, {
    ...structuredClone(snapshot),
    inference: { independentPeriod: null, pairedPeriods: null, repeatedPeriods: null, pathComparison: null },
  });
  assert.deepEqual(
    (longitudinal.openEnaLongitudinalHeaderDimensionsV3 as (
      bundle: unknown,
      current: unknown,
    ) => string[])({ model: { selectedDimensions: ["A1", "A2", "A3"] } }, {
      selectedDimensions: ["B1", "B2", "B3"],
    }),
    ["A1", "A2", "A3"],
  );
});
