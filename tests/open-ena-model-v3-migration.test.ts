import assert from "node:assert/strict";
import test from "node:test";

import { migrateLegacyOpenEnaConfigToDraftV3 } from "../lib/open-ena/model-v3/migration";
import type { OpenEnaConfig, OpenEnaDirectionalMask } from "../lib/open-ena/types";

function legacy(overrides: Partial<OpenEnaConfig> = {}): OpenEnaConfig {
  return {
    analysisKind: "ena",
    unitColumns: ["school", "student"],
    conversationColumns: ["lesson", "episode"],
    groupColumn: "condition",
    codes: ["A", "B", "C", "D"],
    model: "EndPoint",
    window: "MovingStanzaWindow",
    windowSizeBack: 5,
    windowSizeForward: 2,
    weightBy: "sum",
    rotation: "svd",
    referenceRotationId: null,
    centerAlignToOrigin: false,
    orderPolicy: null,
    directionalMask: null,
    ...overrides,
  };
}

const ONA_MASK: OpenEnaDirectionalMask = {
  schemaVersion: 1,
  codeOrder: ["A", "B", "C", "D"],
  enabled: [
    [true, false, true, true],
    [true, true, false, true],
    [false, true, true, false],
    [true, false, true, true],
  ],
};

function legacyOna(overrides: Partial<OpenEnaConfig> = {}): OpenEnaConfig {
  return legacy({
    analysisKind: "ona",
    model: "EndPoint",
    window: "MovingStanzaWindow",
    windowSizeForward: 0,
    weightBy: "sum",
    rotation: "svd",
    referenceRotationId: null,
    centerAlignToOrigin: true,
    orderPolicy: {
      kind: "columns",
      columns: ["turn"],
      comparators: { turn: "number" },
    },
    directionalMask: ONA_MASK,
    ...overrides,
  });
}

test("legacy Standard migration preserves known scientific fields, maps sum to Frequency, and never auto-runs", () => {
  const input = legacy();
  const before = structuredClone(input);
  const migrated = migrateLegacyOpenEnaConfigToDraftV3(input);
  assert.equal(migrated.schemaVersion, 3);
  assert.equal(migrated.activeFamily, "standard");
  assert.deepEqual(migrated.standard.unitColumns, ["school", "student"]);
  assert.deepEqual(migrated.standard.horizonColumns, ["lesson", "episode"]);
  assert.equal(migrated.standard.groupColumn, "condition");
  assert.deepEqual(migrated.standard.codes, ["A", "B", "C", "D"]);
  assert.equal(migrated.standard.model, "EndPoint");
  assert.equal(migrated.standard.windowType, "MovingStanzaWindow");
  assert.deepEqual(migrated.standard.movingStanza.backward, { kind: "finite", value: 5 });
  assert.deepEqual(migrated.standard.movingStanza.forward, { kind: "finite", value: 2 });
  assert.equal(migrated.standard.weighting, "frequency");
  assert.deepEqual(migrated.standard.rotation, { type: "svd", centerAlignToOrigin: false });
  assert.equal(migrated.autoRun, false);
  assert.equal(migrated.standard.movingStanza.rowOrder, null);
  assert.equal(migrated.requiresReview.includes("row-order"), true);
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(migrated), true);
  assert.equal(Object.isFrozen(migrated.standard.codes), true);
});

test("legacy Conversation EndPoint migration does not invent inactive ordering confirmations", () => {
  const migrated = migrateLegacyOpenEnaConfigToDraftV3(legacy({
    window: "Conversation",
    weightBy: "binary",
  }));
  assert.equal(migrated.standard.windowType, "Conversation");
  assert.equal(migrated.standard.movingStanza.rowOrder, null);
  assert.equal(migrated.standard.horizonOrder, null);
  assert.equal(migrated.standard.weighting, "binary");
  assert.equal(migrated.requiresReview.includes("row-order"), false);
  assert.equal(migrated.requiresReview.includes("horizon-order"), false);
});

test("legacy Moving Stanza trajectory migration requires fresh row and Horizon order review", () => {
  const migrated = migrateLegacyOpenEnaConfigToDraftV3(legacy({
    model: "SeparateTrajectory",
    window: "MovingStanzaWindow",
  }));
  assert.equal(migrated.standard.movingStanza.rowOrder, null);
  assert.equal(migrated.standard.horizonOrder, null);
  assert.equal(migrated.requiresReview.includes("row-order"), true);
  assert.equal(migrated.requiresReview.includes("horizon-order"), true);
});

test("legacy Standard runtime Infinity extents remain explicit portable sentinels", () => {
  const migrated = migrateLegacyOpenEnaConfigToDraftV3(legacy({
    windowSizeBack: Number.POSITIVE_INFINITY,
    windowSizeForward: Number.POSITIVE_INFINITY,
  }));
  assert.deepEqual(migrated.standard.movingStanza.backward, { kind: "infinity" });
  assert.deepEqual(migrated.standard.movingStanza.forward, { kind: "infinity" });
});

test("legacy Means preserves the selected method but requires researcher direction", () => {
  const migrated = migrateLegacyOpenEnaConfigToDraftV3(legacy({ rotation: "mean" }));
  assert.deepEqual(migrated.standard.rotation, {
    type: "means",
    centerAlignToOrigin: false,
    negativeLevel: null,
    positiveLevel: null,
  });
  assert.equal(migrated.requiresReview.includes("means-direction"), true);
});

test("legacy Reference identity is preserved without inventing a missing content hash", () => {
  const migrated = migrateLegacyOpenEnaConfigToDraftV3(legacy({
    rotation: "reference",
    referenceRotationId: "reference-17",
  }));
  assert.deepEqual(migrated.standard.rotation, {
    type: "reference",
    referenceId: "reference-17",
    expectedContentSha256: null,
  });
  assert.equal(migrated.requiresReview.includes("reference-content-hash"), true);
});

test("legacy ONA migration preserves order, backward extent, mask, and fixed-family isolation", () => {
  const input = legacyOna({
    windowSizeBack: Number.POSITIVE_INFINITY,
    orderPolicy: {
      kind: "columns",
      columns: ["turn", "accepted"],
      comparators: { turn: "number", accepted: "boolean" },
    },
  });
  const before = structuredClone(input);
  const migrated = migrateLegacyOpenEnaConfigToDraftV3(input);
  assert.equal(migrated.activeFamily, "ona");
  assert.deepEqual(migrated.ona.unitColumns, ["school", "student"]);
  assert.deepEqual(migrated.ona.horizonColumns, ["lesson", "episode"]);
  assert.equal(migrated.ona.groupColumn, "condition");
  assert.deepEqual(migrated.ona.codes, ["A", "B", "C", "D"]);
  assert.deepEqual(migrated.ona.backward, { kind: "infinity" });
  assert.deepEqual(migrated.ona.rowOrder, {
    kind: "columns",
    keys: [
      { column: "turn", direction: "ascending", comparator: { type: "number" } },
      {
        column: "accepted",
        direction: "ascending",
        comparator: {
          type: "ordered-category",
          levels: [{ type: "boolean", value: false }, { type: "boolean", value: true }],
        },
      },
    ],
  });
  assert.deepEqual(migrated.ona.directionalMask, ONA_MASK);
  assert.notEqual(migrated.ona.directionalMask, input.directionalMask);
  assert.equal(migrated.autoRun, false);
  assert.equal("model" in migrated.ona, false);
  assert.equal("forward" in migrated.ona, false);
  assert.equal("weighting" in migrated.ona, false);
  assert.equal("rotation" in migrated.ona, false);
  assert.equal("horizonOrder" in migrated.ona, false);
  assert.deepEqual(input, before);
});

test("legacy source-row ONA acknowledgement is not promoted to a dataset-bound v3 confirmation", () => {
  const migrated = migrateLegacyOpenEnaConfigToDraftV3(legacyOna({
    orderPolicy: { kind: "source-row", confirmed: true },
  }));
  assert.equal(migrated.ona.rowOrder, null);
  assert.equal(migrated.requiresReview.includes("row-order"), true);
  assert.equal(migrated.autoRun, false);
});

test("legacy string and ISO datetime ONA comparator intent is retained but collation is review-bound", () => {
  const migrated = migrateLegacyOpenEnaConfigToDraftV3(legacyOna({
    orderPolicy: {
      kind: "columns",
      columns: ["label", "timestamp"],
      comparators: { label: "string", timestamp: "iso-datetime" },
    },
  }));
  assert.deepEqual(migrated.ona.rowOrder, {
    kind: "columns",
    keys: [
      {
        column: "label",
        direction: "ascending",
        comparator: { type: "text", locale: "und", sensitivity: "variant", numeric: false },
      },
      {
        column: "timestamp",
        direction: "ascending",
        comparator: { type: "datetime", format: "ISO-8601", timeZone: "offset-in-value" },
      },
    ],
  });
  assert.equal(migrated.requiresReview.includes("ona-text-collation"), true);
  assert.equal(migrated.autoRun, false);
});

test("missing ONA mask remains missing and explicitly requires review", () => {
  const migrated = migrateLegacyOpenEnaConfigToDraftV3(legacyOna({
    directionalMask: null,
  }));
  assert.equal(migrated.ona.directionalMask, null);
  assert.equal(migrated.requiresReview.includes("ona-directional-mask"), true);
  assert.equal(migrated.autoRun, false);
});

test("legacy migration rejects disguised Standard and ONA family fields instead of normalizing them", () => {
  for (const disguisedOna of [
    legacyOna({ model: "SeparateTrajectory" }),
    legacyOna({ window: "Conversation" }),
    legacyOna({ windowSizeForward: 1 }),
    legacyOna({ weightBy: "binary" }),
    legacyOna({ rotation: "reference", referenceRotationId: "standard-reference" }),
  ]) {
    assert.throws(() => migrateLegacyOpenEnaConfigToDraftV3(disguisedOna), /ONA.*fixed|family/i);
  }

  assert.throws(() => migrateLegacyOpenEnaConfigToDraftV3(legacy({
    analysisKind: "ena",
    orderPolicy: { kind: "columns", columns: ["turn"], comparators: { turn: "number" } },
  })), /Standard.*ONA|family/i);
});
