import assert from "node:assert/strict";
import test from "node:test";
import {
  createOpenEnaNodeLayoutFingerprint,
  createOpenEnaNodeLayoutState,
  moveOpenEnaNode,
  openEnaNodeLayoutOverrideCount,
  resetOpenEnaNodeLayout,
  resolveOpenEnaNodeDimensions,
} from "../lib/open-ena/node-layout";

const fingerprintInput = {
  analysisKind: "ena" as const,
  analyzedAt: "2026-09-02T00:00:00.000Z",
  sourceDatasetNormalizedUtf8TextSha256: "a".repeat(64),
  referenceId: null,
  codes: ["Evidence", "Reflection", "Revision"],
  dimensions: ["SVD1", "SVD2", "SVD3"],
  nodePositionMethod: "undirected" as const,
};

test("node layout merges finite dimension overrides without mutating canonical coordinates", () => {
  const canonical = new Map<string, number>([
    ["SVD1", -1],
    ["SVD2", 0.5],
    ["SVD3", 0.25],
  ]);
  const fingerprint = createOpenEnaNodeLayoutFingerprint(fingerprintInput);
  const state = createOpenEnaNodeLayoutState(fingerprint);
  const moved = moveOpenEnaNode(state, fingerprint, "Evidence", new Map([
    ["SVD1", 2],
    ["SVD2", -3],
  ]));

  assert.deepEqual(
    [...resolveOpenEnaNodeDimensions(canonical, moved.positions.get("Evidence")).entries()],
    [["SVD1", 2], ["SVD2", -3], ["SVD3", 0.25]],
  );
  assert.deepEqual([...canonical.entries()], [["SVD1", -1], ["SVD2", 0.5], ["SVD3", 0.25]]);
  assert.equal(openEnaNodeLayoutOverrideCount(moved), 1);
});

test("successive node moves retain untouched fitted dimensions and other code overrides", () => {
  const fingerprint = createOpenEnaNodeLayoutFingerprint(fingerprintInput);
  const initial = createOpenEnaNodeLayoutState(fingerprint);
  const evidenceMoved = moveOpenEnaNode(initial, fingerprint, "Evidence", new Map([["SVD1", 2]]));
  const evidenceMovedAgain = moveOpenEnaNode(evidenceMoved, fingerprint, "Evidence", new Map([["SVD3", -4]]));
  const reflectionMoved = moveOpenEnaNode(evidenceMovedAgain, fingerprint, "Reflection", new Map([["SVD2", 8]]));

  assert.deepEqual([...reflectionMoved.positions.get("Evidence")!.entries()], [["SVD1", 2], ["SVD3", -4]]);
  assert.deepEqual([...reflectionMoved.positions.get("Reflection")!.entries()], [["SVD2", 8]]);
  assert.equal(openEnaNodeLayoutOverrideCount(reflectionMoved), 2);
  assert.equal(initial.positions.size, 0, "the initial state must remain immutable");
});

test("stale, blank, empty, and non-finite node moves are ignored by identity", () => {
  const fingerprint = createOpenEnaNodeLayoutFingerprint(fingerprintInput);
  const state = createOpenEnaNodeLayoutState(fingerprint);

  assert.equal(moveOpenEnaNode(state, "stale", "Evidence", new Map([["SVD1", 4]])), state);
  assert.equal(moveOpenEnaNode(state, fingerprint, " ", new Map([["SVD1", 4]])), state);
  assert.equal(moveOpenEnaNode(state, fingerprint, "Evidence", new Map()), state);
  assert.equal(moveOpenEnaNode(state, fingerprint, "Evidence", new Map([["", 4]])), state);
  assert.equal(moveOpenEnaNode(state, fingerprint, "Evidence", new Map([["SVD1", Number.NaN]])), state);
  assert.equal(moveOpenEnaNode(state, fingerprint, "Evidence", new Map([["SVD1", Number.POSITIVE_INFINITY]])), state);
});

test("layout keys safely support prototype-shaped code and dimension names", () => {
  const fingerprint = createOpenEnaNodeLayoutFingerprint({
    ...fingerprintInput,
    codes: ["__proto__"],
    dimensions: ["constructor", "toString"],
  });
  const moved = moveOpenEnaNode(
    createOpenEnaNodeLayoutState(fingerprint),
    fingerprint,
    "__proto__",
    new Map([["constructor", 7], ["toString", -2]]),
  );

  assert.deepEqual([...moved.positions.get("__proto__")!.entries()], [["constructor", 7], ["toString", -2]]);
});

test("fingerprints are stable for one result and invalidate every scientific identity field", () => {
  const baseline = createOpenEnaNodeLayoutFingerprint(fingerprintInput);
  assert.equal(createOpenEnaNodeLayoutFingerprint({ ...fingerprintInput }), baseline);

  const variants = [
    { ...fingerprintInput, analysisKind: "ona" as const, nodePositionMethod: "directed" as const },
    { ...fingerprintInput, analyzedAt: "2026-09-02T00:00:01.000Z" },
    { ...fingerprintInput, sourceDatasetNormalizedUtf8TextSha256: "b".repeat(64) },
    { ...fingerprintInput, referenceId: "reference-1" },
    { ...fingerprintInput, codes: ["Reflection", "Evidence", "Revision"] },
    { ...fingerprintInput, dimensions: ["SVD1", "SVD3", "SVD2"] },
    { ...fingerprintInput, nodePositionMethod: "directed" as const },
  ];

  for (const variant of variants) {
    assert.notEqual(createOpenEnaNodeLayoutFingerprint(variant), baseline);
  }
});

test("reset clears only presentation overrides and retains the active fingerprint", () => {
  const fingerprint = createOpenEnaNodeLayoutFingerprint(fingerprintInput);
  const initial = createOpenEnaNodeLayoutState(fingerprint);
  assert.equal(resetOpenEnaNodeLayout(initial), initial, "an empty reset should preserve identity");

  const moved = moveOpenEnaNode(initial, fingerprint, "Evidence", new Map([["SVD1", 3]]));
  const reset = resetOpenEnaNodeLayout(moved);
  assert.equal(reset.fingerprint, fingerprint);
  assert.equal(reset.positions.size, 0);
  assert.equal(openEnaNodeLayoutOverrideCount(reset), 0);
  assert.equal(moved.positions.get("Evidence")?.get("SVD1"), 3, "reset must not mutate the previous state");
});
