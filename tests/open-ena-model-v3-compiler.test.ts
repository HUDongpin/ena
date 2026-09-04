import assert from "node:assert/strict";
import test from "node:test";

import {
  compileOnaDraftV3,
  compileStandardDraftV3,
} from "../lib/open-ena/model-v3/compiler";
import * as publicV3 from "../lib/open-ena/model-v3/index";
import {
  MAX_ESTIMATED_DATASET_BYTES_V3,
} from "../lib/open-ena/model-v3/resource-budget";
import {
  decodeCanonicalOnaConfigV3,
  decodeCanonicalStandardConfigV3,
} from "../lib/open-ena/model-v3/schema";
import type {
  OrderedNetworkDraftV3,
  StandardEnaDraftV3,
  StandardModelTypeV3,
  StandardWindowTypeV3,
} from "../lib/open-ena/model-v3/types";
import type {
  OpenEnaCanonicalOnaConfigV3,
  OpenEnaCanonicalStandardConfigV3,
  OpenEnaModelWorkspaceDraftsV3,
  OpenEnaOnaCompileResultV3,
  OpenEnaStandardCompileResultV3,
} from "../lib/open-ena/types";
import type { ParsedDataset } from "../lib/open-ena/types";

const DATASET_SHA256 = "a".repeat(64);
const HEADERS = ["unit", "horizon", "time", "turn", "group", "A", "B", "C"];

function dataset(overrides: Partial<ParsedDataset> = {}): ParsedDataset {
  return {
    name: "compiler-fixture.csv",
    headers: [...HEADERS],
    rows: [
      { unit: "u1", horizon: "h1", time: 1, turn: 1, group: "g1", A: 1, B: 1, C: 0 },
      { unit: "u2", horizon: "h3", time: 1, turn: 2, group: "g2", A: 0, B: 1, C: 1 },
      { unit: "u1", horizon: "h2", time: 2, turn: 1, group: "g1", A: 1, B: 0, C: 1 },
      { unit: "u2", horizon: "h4", time: 2, turn: 2, group: "g2", A: 1, B: 1, C: 0 },
    ] as ParsedDataset["rows"],
    sizeBytes: 512,
    source: "upload",
    ...overrides,
  };
}

const rowOrder: NonNullable<StandardEnaDraftV3["movingStanza"]["rowOrder"]> = {
  kind: "columns",
  keys: [{ column: "turn", direction: "ascending", comparator: { type: "number" } }],
};

const horizonOrder: NonNullable<StandardEnaDraftV3["horizonOrder"]> = {
  kind: "columns",
  keys: [{ column: "time", direction: "ascending", comparator: { type: "number" } }],
};

function standardDraft(overrides: Partial<StandardEnaDraftV3> = {}): StandardEnaDraftV3 {
  return {
    unitColumns: ["unit"],
    horizonColumns: ["horizon"],
    groupColumn: null,
    codes: ["A", "B", "C"],
    weighting: "binary",
    model: "EndPoint",
    windowType: "Conversation",
    movingStanza: {
      backward: { kind: "finite", value: 1 },
      forward: { kind: "finite", value: 0 },
      rowOrder: null,
    },
    horizonOrder: null,
    rotation: { type: "svd", centerAlignToOrigin: true },
    ...overrides,
  };
}

function onaDraft(overrides: Partial<OrderedNetworkDraftV3> = {}): OrderedNetworkDraftV3 {
  return {
    unitColumns: ["unit"],
    horizonColumns: ["horizon"],
    groupColumn: "group",
    codes: ["A", "B", "C"],
    backward: { kind: "finite", value: 2 },
    rowOrder,
    directionalMask: {
      schemaVersion: 1,
      codeOrder: ["A", "B", "C"],
      enabled: [
        [true, true, false],
        [true, true, true],
        [false, true, true],
      ],
    },
    ...overrides,
  };
}

function useLegacyAliases(
  workspace: OpenEnaModelWorkspaceDraftsV3,
  standard: OpenEnaCanonicalStandardConfigV3,
  ona: OpenEnaCanonicalOnaConfigV3,
  standardResult: OpenEnaStandardCompileResultV3,
  onaResult: OpenEnaOnaCompileResultV3,
): void {
  void [workspace, standard, ona, standardResult, onaResult];
}
void useLegacyAliases;

test("an invalid Standard draft has typed diagnostics and no partial canonical configuration", async () => {
  const result = await compileStandardDraftV3(dataset(), DATASET_SHA256, standardDraft({ codes: [] }));
  assert.equal(result.status, "invalid");
  assert.equal(result.canonicalConfiguration, null);
  assert.match(result.draftFingerprint, /^[a-f0-9]{64}$/u);
  assert.equal(result.diagnostics.some((entry) => entry.id === "STANDARD_CODES_TOO_FEW"), true);
  assert.equal("configurationSha256" in result, false);
  assert.equal("resourceEstimate" in result, false);
});

test("a valid Conversation EndPoint compiles without row order into an immutable decoded clone", async () => {
  const inputDataset = dataset();
  const inputDraft = standardDraft();
  const beforeDataset = structuredClone(inputDataset);
  const beforeDraft = structuredClone(inputDraft);
  const result = await compileStandardDraftV3(inputDataset, DATASET_SHA256, inputDraft);
  assert.equal(result.status, "ready");
  if (result.status !== "ready") throw new Error("expected ready Standard compilation");
  assert.equal(result.canonicalConfiguration.window.type, "Conversation");
  assert.equal("rowOrder" in result.canonicalConfiguration.window, false);
  assert.match(result.configurationSha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(decodeCanonicalStandardConfigV3(result.canonicalConfiguration), result.canonicalConfiguration);
  assert.notEqual(result.canonicalConfiguration.codes, inputDraft.codes);
  assert.equal(Object.isFrozen(result.canonicalConfiguration), true);
  assert.equal(Object.isFrozen(result.canonicalConfiguration.codes), true);
  assert.equal(Object.isFrozen(result.canonicalConfiguration.codes[0]), true);
  assert.equal(Object.isFrozen(result.resourceEstimate), true);
  assert.equal("admissionStage" in result.resourceEstimate, false);
  assert.deepEqual(inputDataset, beforeDataset);
  assert.deepEqual(inputDraft, beforeDraft);
  assert.throws(() => {
    (result.canonicalConfiguration.codes as Array<{ column: string }>)[0].column = "changed";
  }, TypeError);
});

test("Standard compilation is deterministic and fingerprints the complete draft", async () => {
  const first = await compileStandardDraftV3(dataset(), DATASET_SHA256, standardDraft());
  const second = await compileStandardDraftV3(dataset(), DATASET_SHA256, standardDraft());
  const changed = await compileStandardDraftV3(
    dataset(),
    DATASET_SHA256,
    standardDraft({ weighting: "frequency" }),
  );
  assert.equal(first.status, "ready");
  assert.equal(second.status, "ready");
  assert.equal(changed.status, "ready");
  if (first.status !== "ready" || second.status !== "ready" || changed.status !== "ready") {
    throw new Error("expected ready deterministic Standard compilations");
  }
  assert.equal(first.configurationSha256, second.configurationSha256);
  assert.equal(first.draftFingerprint, second.draftFingerprint);
  assert.notEqual(first.configurationSha256, changed.configurationSha256);
  assert.notEqual(first.draftFingerprint, changed.draftFingerprint);
});

for (const [model, windowType] of [
  ["EndPoint", "MovingStanzaWindow"],
  ["EndPoint", "Conversation"],
  ["SeparateTrajectory", "MovingStanzaWindow"],
  ["SeparateTrajectory", "Conversation"],
  ["AccumulatedTrajectory", "MovingStanzaWindow"],
  ["AccumulatedTrajectory", "Conversation"],
] as const satisfies ReadonlyArray<readonly [StandardModelTypeV3, StandardWindowTypeV3]>) {
  test(`Standard ${model} with ${windowType} compiles under the six-combination contract`, async () => {
    const result = await compileStandardDraftV3(dataset(), DATASET_SHA256, standardDraft({
      model,
      windowType,
      movingStanza: {
        backward: { kind: "finite", value: 2 },
        forward: { kind: "infinity" },
        rowOrder,
      },
      horizonOrder: model === "EndPoint" ? null : horizonOrder,
    }));
    assert.equal(result.status, "ready", result.diagnostics.map((entry) => entry.id).join(", "));
    if (result.status !== "ready") return;
    assert.equal(result.canonicalConfiguration.analysis.model.type, model);
    assert.equal(result.canonicalConfiguration.window.type, windowType);
    if (result.canonicalConfiguration.window.type === "MovingStanzaWindow") {
      assert.deepEqual(result.canonicalConfiguration.window.forward, { kind: "infinity" });
    }
  });
}

test("resource admission and malformed dataset bindings fail closed", async () => {
  const oversized = await compileStandardDraftV3(
    dataset({ sizeBytes: MAX_ESTIMATED_DATASET_BYTES_V3 + 1 }),
    DATASET_SHA256,
    standardDraft(),
  );
  assert.equal(oversized.status, "invalid");
  assert.equal(oversized.canonicalConfiguration, null);
  assert.equal(oversized.diagnostics.some((entry) => entry.id === "RESOURCE_BUDGET_EXCEEDED"), true);

  const badSha = await compileStandardDraftV3(dataset(), "A".repeat(64), standardDraft());
  assert.equal(badSha.status, "invalid");
  assert.equal(badSha.canonicalConfiguration, null);
  assert.deepEqual(badSha.diagnostics.map((entry) => entry.id), ["STANDARD_DATASET_BINDING_INVALID"]);

  const badHashKind = await compileStandardDraftV3(
    dataset({ hashKind: "sha1" as ParsedDataset["hashKind"] }),
    DATASET_SHA256,
    standardDraft(),
  );
  assert.equal(badHashKind.status, "invalid");
  assert.equal(badHashKind.canonicalConfiguration, null);
  assert.deepEqual(badHashKind.diagnostics.map((entry) => entry.id), ["STANDARD_DATASET_BINDING_INVALID"]);
});

test("ready Standard results expose only exact resource counts and capability status", async () => {
  const result = await compileStandardDraftV3(dataset(), DATASET_SHA256, standardDraft());
  assert.equal(result.status, "ready");
  if (result.status !== "ready") throw new Error("expected ready Standard compilation");
  assert.equal(result.resourceEstimate.rows, 4);
  assert.equal(result.resourceEstimate.units, 2);
  assert.equal(result.resourceEstimate.horizons, 4);
  assert.equal(result.resourceEstimate.codes, 3);
  assert.equal(result.resourceEstimate.trajectorySteps, 2);
  assert.equal(result.resourceEstimate.analysisFamily, "standard");
  assert.equal("admissionStage" in result.resourceEstimate, false);
  assert.equal(result.capabilityStatus["build-model"], "available");
  assert.equal(result.capabilityStatus["export-current-model"], "available");
});

test("ONA compilation enforces the fixed backward-only directed family contract", async () => {
  const inputDataset = dataset();
  const inputDraft = onaDraft({ backward: { kind: "infinity" } });
  const beforeDataset = structuredClone(inputDataset);
  const beforeDraft = structuredClone(inputDraft);
  const result = await compileOnaDraftV3(inputDataset, DATASET_SHA256, inputDraft);
  assert.equal(result.status, "ready", result.diagnostics.map((entry) => entry.id).join(", "));
  if (result.status !== "ready") throw new Error("expected ready ONA compilation");
  assert.deepEqual(decodeCanonicalOnaConfigV3(result.canonicalConfiguration), result.canonicalConfiguration);
  assert.deepEqual(result.canonicalConfiguration.window.backward, { kind: "infinity" });
  assert.equal(result.canonicalConfiguration.window.forward, 0);
  assert.deepEqual(result.canonicalConfiguration.model, { type: "EndPoint" });
  assert.deepEqual(result.canonicalConfiguration.weighting, { type: "frequency", engineMethod: "sum" });
  assert.deepEqual(result.canonicalConfiguration.rotation, { type: "svd", centerAlignToOrigin: true });
  assert.equal(result.canonicalConfiguration.analysisFamily, "ona");
  assert.equal("analysis" in result.canonicalConfiguration, false);
  assert.equal("horizonOrder" in result.canonicalConfiguration, false);
  assert.equal("reference" in result.canonicalConfiguration, false);
  assert.equal(result.resourceEstimate.analysisFamily, "ona");
  assert.equal("admissionStage" in result.resourceEstimate, false);
  assert.equal(Object.isFrozen(result.canonicalConfiguration.directionalMask.enabled), true);
  assert.deepEqual(inputDataset, beforeDataset);
  assert.deepEqual(inputDraft, beforeDraft);
});

test("ONA compilation rejects missing fixed-contract fields and disguised Standard semantics", async () => {
  const noOrder = await compileOnaDraftV3(dataset(), DATASET_SHA256, onaDraft({ rowOrder: null }));
  assert.equal(noOrder.status, "invalid");
  assert.equal(noOrder.canonicalConfiguration, null);

  const disguised = {
    ...onaDraft(),
    model: "SeparateTrajectory",
    forward: { kind: "finite", value: 2 },
    weighting: "binary",
  } as unknown as OrderedNetworkDraftV3;
  const leaked = await compileOnaDraftV3(dataset(), DATASET_SHA256, disguised);
  assert.equal(leaked.status, "invalid");
  assert.equal(leaked.canonicalConfiguration, null);
});

test("the v3 barrel exposes curated APIs without internal snapshots or early-envelope telemetry", () => {
  const keys = Object.keys(publicV3);
  for (const expected of [
    "compileStandardDraftV3",
    "compileOnaDraftV3",
    "migrateLegacyOpenEnaConfigToDraftV3",
    "validateStandardDraftV3",
    "estimateStandardResourcesV3",
    "estimateOnaResourcesV3",
    "decodeCanonicalStandardConfigV3",
    "decodeCanonicalOnaConfigV3",
  ]) {
    assert.equal(keys.includes(expected), true, `missing curated v3 export ${expected}`);
  }
  for (const internal of [
    "snapshotPlainJsonRecordV3",
    "snapshotDenseJsonArrayV3",
    "estimateEarlyStandardResourcesV3",
    "estimateCanonicalIdentityAdmissionFieldPayloadBytesV3",
  ]) {
    assert.equal(keys.includes(internal), false, `internal helper leaked from v3 barrel: ${internal}`);
  }
  // @ts-expect-error Internal snapshot helpers are intentionally absent from the public barrel.
  void publicV3.snapshotPlainJsonRecordV3;
  // @ts-expect-error Early-envelope telemetry cannot be mistaken for a public exact estimate.
  void publicV3.estimateEarlyStandardResourcesV3;
});
