import assert from "node:assert/strict";
import test from "node:test";

import * as compilerV3 from "../lib/open-ena/model-v3/compiler";
import { OPEN_ENA_CAPABILITIES } from "../lib/open-ena/capabilities";
import { buildOpenEnaAnalysisPlan } from "../lib/open-ena/analyze";
import { sha256CanonicalJsonV3 } from "../lib/open-ena/model-v3/canonical-json";
import {
  runOnaScientificPreflightV3,
  validateOnaDatasetV3,
} from "../lib/open-ena/model-v3/ona-compiler-preflight";
import { accumulateDataChunked, EnaNumericalError } from "jena-js";
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
import type { OpenEnaConfig } from "../lib/open-ena/types";

const DATASET_SHA256 = "a".repeat(64);
const HEADERS = ["unit", "horizon", "time", "turn", "group", "A", "B", "C"];
const { compileOnaDraftV3, compileStandardDraftV3 } = compilerV3;

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

async function assertHeaderDigestOperationalFailureV3(
  compile: () => Promise<unknown>,
  sentinel: TypeError,
): Promise<void> {
  const originalCrypto = globalThis.crypto;
  const subtle = originalCrypto.subtle;
  const originalDigest = subtle.digest;
  const originalOwnDigestDescriptor = Object.getOwnPropertyDescriptor(subtle, "digest");
  const orphanedRejections: unknown[] = [];
  const captureOrphanedRejection = (reason: unknown): void => {
    orphanedRejections.push(reason);
  };
  let digestCalls = 0;
  process.on("unhandledRejection", captureOrphanedRejection);
  Object.defineProperty(subtle, "digest", {
    configurable: true,
    value: (...args: Parameters<SubtleCrypto["digest"]>): ReturnType<SubtleCrypto["digest"]> => {
      digestCalls += 1;
      if (digestCalls === 2) return Promise.reject(sentinel);
      return originalDigest.apply(subtle, args);
    },
  });
  try {
    await assert.rejects(compile(), (error) => error === sentinel);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(digestCalls, 2);
    assert.deepEqual(orphanedRejections, []);
  } finally {
    process.off("unhandledRejection", captureOrphanedRejection);
    if (originalOwnDigestDescriptor === undefined) {
      Reflect.deleteProperty(subtle, "digest");
    } else {
      Object.defineProperty(subtle, "digest", originalOwnDigestDescriptor);
    }
    assert.equal(globalThis.crypto, originalCrypto);
    assert.equal(globalThis.crypto.subtle, subtle);
  }
}

function datasetWithHeaderAccessorV3(): { dataset: ParsedDataset; reads: () => number } {
  const input = dataset();
  let reads = 0;
  Object.defineProperty(input.headers, 0, {
    configurable: true,
    enumerable: true,
    get() {
      reads += 1;
      throw new TypeError("header accessor must not execute");
    },
  });
  return { dataset: input, reads: () => reads };
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

test("Standard rethrows asynchronous header crypto TypeErrors but classifies synchronous binding TypeErrors", async () => {
  const sentinel = new TypeError("simulated crypto operational failure");
  await assertHeaderDigestOperationalFailureV3(
    () => compileStandardDraftV3(dataset(), DATASET_SHA256, standardDraft()),
    sentinel,
  );

  const accessor = datasetWithHeaderAccessorV3();
  const result = await compileStandardDraftV3(accessor.dataset, DATASET_SHA256, standardDraft());
  assert.equal(result.status, "invalid");
  assert.deepEqual(result.diagnostics.map((entry) => entry.id), ["STANDARD_DATASET_BINDING_INVALID"]);
  assert.equal(accessor.reads(), 0);
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
    "prepareStandardDraftValidationV3",
    "centeredNetworkRankV3",
    "compilerDatasetEnvelopeV3",
    "datasetBindingV3",
    "snapshotCompilerDatasetV3",
    "captureDatasetBindingV3",
    "snapshotCompilerDatasetInputV3",
    "validateOnaDatasetV3",
    "runOnaScientificPreflightV3",
  ]) {
    assert.equal(keys.includes(internal), false, `internal helper leaked from v3 barrel: ${internal}`);
  }
  // @ts-expect-error Internal snapshot helpers are intentionally absent from the public barrel.
  void publicV3.snapshotPlainJsonRecordV3;
  // @ts-expect-error Early-envelope telemetry cannot be mistaken for a public exact estimate.
  void publicV3.estimateEarlyStandardResourcesV3;
});

async function assertInvalidOna(
  inputDataset: ParsedDataset,
  inputDraft: OrderedNetworkDraftV3,
  expectedId: string,
): Promise<void> {
  const result = await compileOnaDraftV3(inputDataset, DATASET_SHA256, inputDraft);
  assert.equal(result.status, "invalid");
  assert.equal(result.canonicalConfiguration, null);
  assert.equal(result.diagnostics.some((entry) => entry.id === expectedId), true);
}

test("ONA diagnostic identifiers are stable, exact, and duplicate-free", () => {
  const ONA_COMPILER_DIAGNOSTIC_IDS_V3 = Reflect.get(
    compilerV3,
    "ONA_COMPILER_DIAGNOSTIC_IDS_V3",
  ) as readonly string[] | undefined;
  assert.deepEqual(ONA_COMPILER_DIAGNOSTIC_IDS_V3, [
    "ONA_DATASET_BINDING_INVALID",
    "ONA_DATASET_EMPTY",
    "ONA_DATASET_FIELD_INVALID",
    "ONA_ORDER_INVALID",
    "ONA_GROUP_UNSTABLE",
    "ONA_CODE_ALL_ZERO",
    "ONA_NO_ENABLED_CONNECTION",
    "ONA_NUMERICAL_INVALID",
    "ONA_TARGET_RANK_ZERO",
    "ONA_SVD_ONE_DIMENSIONAL",
    "ONA_DRAFT_INVALID",
    "ONA_RESOURCE_BUDGET_EXCEEDED",
  ]);
  assert.ok(ONA_COMPILER_DIAGNOSTIC_IDS_V3);
  assert.equal(new Set(ONA_COMPILER_DIAGNOSTIC_IDS_V3).size, ONA_COMPILER_DIAGNOSTIC_IDS_V3.length);
  assert.equal(Object.isFrozen(ONA_COMPILER_DIAGNOSTIC_IDS_V3), true);
});

test("ONA fails closed before canonical readiness for empty, unstable-Group, all-zero, and rank-zero targets", async () => {
  await assertInvalidOna(dataset({ rows: [] }), onaDraft(), "ONA_DATASET_EMPTY");

  await assertInvalidOna(dataset({
    rows: [
      { unit: "u1", horizon: "h1", time: 1, turn: 1, group: "g1", A: 1, B: 1, C: 0 },
      { unit: "u1", horizon: "h1", time: 1, turn: 2, group: "g2", A: 0, B: 1, C: 1 },
    ] as ParsedDataset["rows"],
  }), onaDraft(), "ONA_GROUP_UNSTABLE");

  await assertInvalidOna(dataset({
    rows: [
      { unit: "u1", horizon: "h1", time: 1, turn: 1, group: "g1", A: 0, B: 0, C: 0 },
      { unit: "u2", horizon: "h2", time: 2, turn: 1, group: "g2", A: 0, B: 0, C: 0 },
    ] as ParsedDataset["rows"],
  }), onaDraft(), "ONA_CODE_ALL_ZERO");

  await assertInvalidOna(dataset({
    rows: [
      { unit: "u1", horizon: "h1", time: 1, turn: 1, group: "g1", A: 1, B: 1, C: 1 },
    ] as ParsedDataset["rows"],
  }), onaDraft(), "ONA_TARGET_RANK_ZERO");

  await assertInvalidOna(dataset({
    rows: [
      { unit: "u1", horizon: "h1", time: 1, turn: 1, group: "g1", A: 1, B: 1, C: 1 },
      { unit: "u2", horizon: "h2", time: 2, turn: 1, group: "g2", A: 2, B: 2, C: 2 },
    ] as ParsedDataset["rows"],
  }), onaDraft(), "ONA_TARGET_RANK_ZERO");

  await assertInvalidOna(dataset({
    rows: [
      { unit: "u0", horizon: "h0", time: 0, turn: 1, group: "g0", A: 1, B: 0, C: 0 },
      { unit: "u1", horizon: "h1", time: 1, turn: 1, group: "g1", A: 1, B: 1, C: 0 },
      { unit: "u2", horizon: "h2", time: 2, turn: 1, group: "g2", A: 1, B: 0, C: 1 },
    ] as ParsedDataset["rows"],
  }), onaDraft(), "ONA_TARGET_RANK_ZERO");
});

test("ONA rank-one SVD remains ready with a stable one-dimensional warning", async () => {
  const result = await compileOnaDraftV3(dataset({
    rows: [
      { unit: "u1", horizon: "h1", time: 1, turn: 1, group: "g1", A: 1, B: 1, C: 0 },
      { unit: "u2", horizon: "h2", time: 2, turn: 1, group: "g2", A: 1, B: 0, C: 1 },
    ] as ParsedDataset["rows"],
  }), DATASET_SHA256, onaDraft({
    directionalMask: {
      schemaVersion: 1,
      codeOrder: ["A", "B", "C"],
      enabled: Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => true)),
    },
  }));
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.diagnostics.some((entry) => entry.id === "ONA_SVD_ONE_DIMENSIONAL"), true);
  assert.equal(result.capabilityStatus["ai-interpretation"], "blocked");
});

for (const [label, magnitude] of [
  ["overflow", 1e308],
  ["underflow", 1e-308],
] as const) {
  test(`ONA authoritative ordered accumulation rejects ${label} products before readiness`, async () => {
    await assertInvalidOna(dataset({
      rows: [
        { unit: "u1", horizon: "h1", time: 1, turn: 1, group: "g1", A: magnitude, B: 0, C: 1 },
        { unit: "u1", horizon: "h1", time: 1, turn: 2, group: "g1", A: 0, B: magnitude, C: 1 },
        { unit: "u2", horizon: "h2", time: 2, turn: 1, group: "g2", A: 1, B: 1, C: 1 },
      ] as ParsedDataset["rows"],
    }), onaDraft(), "ONA_NUMERICAL_INVALID");
  });
}

test("ONA rejects a mask with no enabled directed connection", async () => {
  await assertInvalidOna(dataset(), onaDraft({
    directionalMask: {
      schemaVersion: 1,
      codeOrder: ["A", "B", "C"],
      enabled: Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => false)),
    },
  }), "ONA_NO_ENABLED_CONNECTION");
});

test("ONA hard resource admission happens before ordered SVD identifiability", async () => {
  const codes = Array.from({ length: 12 }, (_, index) => `C${index}`);
  const headers = ["unit", "horizon", "turn", ...codes];
  const rows = Array.from({ length: 244 }, (_, index) => ({
    unit: `u${index}`,
    horizon: "shared",
    turn: index,
    ...Object.fromEntries(codes.map((code) => [code, 1])),
  })) as ParsedDataset["rows"];
  const result = await compileOnaDraftV3(
    dataset({ headers, rows, sizeBytes: 32_000 }),
    DATASET_SHA256,
    onaDraft({
      groupColumn: null,
      codes,
      rowOrder: {
        kind: "columns",
        keys: [{ column: "turn", direction: "ascending", comparator: { type: "number" } }],
      },
      directionalMask: {
        schemaVersion: 1,
        codeOrder: codes,
        enabled: codes.map(() => codes.map(() => true)),
      },
    }),
  );
  assert.equal(result.status, "invalid");
  assert.equal(result.canonicalConfiguration, null);
  assert.deepEqual(result.diagnostics.map((entry) => entry.id), ["ONA_RESOURCE_BUDGET_EXCEEDED"]);
});

test("ONA malformed normalized digests are classified as dataset binding diagnostics", async () => {
  for (const digest of ["A".repeat(64), "a".repeat(63), `${"a".repeat(63)}z`]) {
    const result = await compileOnaDraftV3(dataset(), digest, onaDraft());
    assert.equal(result.status, "invalid");
    assert.equal(result.canonicalConfiguration, null);
    assert.deepEqual(result.diagnostics.map(({ id, scope }) => ({ id, scope })), [{
      id: "ONA_DATASET_BINDING_INVALID",
      scope: "dataset",
    }]);
  }
});

test("ONA rethrows asynchronous header crypto TypeErrors but classifies synchronous binding TypeErrors", async () => {
  const sentinel = new TypeError("simulated crypto operational failure");
  await assertHeaderDigestOperationalFailureV3(
    () => compileOnaDraftV3(dataset(), DATASET_SHA256, onaDraft()),
    sentinel,
  );

  const accessor = datasetWithHeaderAccessorV3();
  const result = await compileOnaDraftV3(accessor.dataset, DATASET_SHA256, onaDraft());
  assert.equal(result.status, "invalid");
  assert.deepEqual(result.diagnostics.map((entry) => entry.id), ["ONA_DATASET_BINDING_INVALID"]);
  assert.equal(accessor.reads(), 0);
});

function descriptorChangingDataset(): ParsedDataset {
  const sourceRows = [
    { unit: "u1", horizon: "h1", time: 1, turn: 1, A: 1, B: 1, C: 0 },
    { unit: "u1", horizon: "h2", time: 2, turn: 1, A: 0, B: 1, C: 1 },
    { unit: "u2", horizon: "h3", time: 1, turn: 1, A: 1, B: 0, C: 1 },
    { unit: "u2", horizon: "h4", time: 2, turn: 1, A: 1, B: 1, C: 0 },
  ];
  const rows = sourceRows.map((source) => {
    const captures = new Map<PropertyKey, number>();
    return new Proxy(source, {
      get() {
        throw new Error("ordinary caller-row get is forbidden");
      },
      getOwnPropertyDescriptor(target, key) {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
        if (descriptor === undefined || !("value" in descriptor)) return descriptor;
        const count = captures.get(key) ?? 0;
        captures.set(key, count + 1);
        if (count < 2 || (key !== "unit" && key !== "horizon")) return descriptor;
        return { ...descriptor, value: key === "unit" ? "collapsed-unit" : "collapsed-horizon" };
      },
    });
  });
  return dataset({
    headers: ["unit", "horizon", "time", "turn", "A", "B", "C"],
    rows: rows as ParsedDataset["rows"],
  });
}

test("Standard exact resources use the same coherent row snapshot validated by diagnostics", async () => {
  const result = await compileStandardDraftV3(
    descriptorChangingDataset(),
    DATASET_SHA256,
    standardDraft({ groupColumn: null }),
  );
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.resourceEstimate.units, 2);
  assert.equal(result.resourceEstimate.horizons, 4);
  assert.equal(result.resourceEstimate.trajectorySteps, 2);
});

test("compiler captures draft, dataset root, and header-hash input before its first await", async () => {
  const rootInput = dataset();
  const rootDraft = standardDraft();
  const rootPromise = compileStandardDraftV3(rootInput, DATASET_SHA256, rootDraft);
  rootInput.name = "replacement.xlsx";
  rootInput.headers = ["replacement"];
  rootInput.rows = [];
  rootInput.sizeBytes = MAX_ESTIMATED_DATASET_BYTES_V3 + 1;
  rootDraft.codes = [];
  const capturedRoot = await rootPromise;
  assert.equal(capturedRoot.status, "ready");

  const headerInput = dataset();
  const headerPromise = compileOnaDraftV3(headerInput, DATASET_SHA256, onaDraft());
  headerInput.headers[2] = "unused-renamed-time";
  const capturedHeader = await headerPromise;
  assert.equal(capturedHeader.status, "ready");
  if (capturedHeader.status !== "ready") return;
  assert.equal(capturedHeader.resourceEstimate.units, 2);
  assert.equal(capturedHeader.resourceEstimate.horizons, 4);
});

test("Standard compiler atomically captures existing row contents before its first await", async () => {
  const original = dataset();
  const invocationDraft = standardDraft({
    windowType: "MovingStanzaWindow",
    movingStanza: {
      backward: { kind: "finite", value: 1 },
      forward: { kind: "finite", value: 0 },
      rowOrder: {
        kind: "source-order-confirmed",
        confirmation: {
          kind: "explicit-researcher-confirmation",
          analysisFamily: "standard",
          datasetSha256: DATASET_SHA256,
          rowCount: original.rows.length,
          relevantColumns: ["horizon"],
          confirmedAt: "2026-09-04T00:00:00.000Z",
          confirmationVersion: 1,
        },
      },
    },
  });
  const expected = await compileStandardDraftV3(
    structuredClone(original),
    DATASET_SHA256,
    invocationDraft,
  );
  assert.equal(expected.status, "ready");
  if (expected.status !== "ready") return;

  const pending = compileStandardDraftV3(original, DATASET_SHA256, invocationDraft);
  for (const row of original.rows) {
    Object.assign(row, {
      unit: "collapsed-unit",
      horizon: "collapsed-horizon",
      group: "mutated-group",
      time: 99,
      turn: 99,
      A: 1,
      B: 1,
      C: 1,
    });
  }
  const actual = await pending;
  assert.equal(actual.status, "ready");
  if (actual.status !== "ready") return;
  assert.equal(actual.draftFingerprint, expected.draftFingerprint);
  assert.equal(actual.configurationSha256, expected.configurationSha256);
  assert.deepEqual(actual.canonicalConfiguration, expected.canonicalConfiguration);
  assert.deepEqual(actual.diagnostics, expected.diagnostics);
  assert.deepEqual(actual.resourceEstimate, expected.resourceEstimate);
  assert.equal(actual.resourceEstimate.units, 2);
  assert.equal(actual.resourceEstimate.horizons, 4);
});

test("ONA compiler atomically captures existing row contents before its first await", async () => {
  const original = dataset();
  const expected = await compileOnaDraftV3(structuredClone(original), DATASET_SHA256, onaDraft());
  assert.equal(expected.status, "ready");
  if (expected.status !== "ready") return;

  const pending = compileOnaDraftV3(original, DATASET_SHA256, onaDraft());
  for (const row of original.rows) {
    Object.assign(row, {
      unit: "collapsed-unit",
      horizon: "collapsed-horizon",
      group: "mutated-group",
      time: 99,
      turn: 99,
      A: 1,
      B: 1,
      C: 1,
    });
  }
  const actual = await pending;
  assert.equal(actual.status, "ready");
  if (actual.status !== "ready") return;
  assert.equal(actual.draftFingerprint, expected.draftFingerprint);
  assert.equal(actual.configurationSha256, expected.configurationSha256);
  assert.deepEqual(actual.canonicalConfiguration, expected.canonicalConfiguration);
  assert.deepEqual(actual.diagnostics, expected.diagnostics);
  assert.deepEqual(actual.resourceEstimate, expected.resourceEstimate);
  assert.equal(actual.resourceEstimate.units, 2);
  assert.equal(actual.resourceEstimate.horizons, 4);
});

test("ONA exact resources and scientific preflight share one coherent detached row snapshot", async () => {
  const result = await compileOnaDraftV3(
    descriptorChangingDataset(),
    DATASET_SHA256,
    onaDraft({ groupColumn: null }),
  );
  assert.equal(result.status, "ready", result.diagnostics.map((entry) => entry.id).join(", "));
  if (result.status !== "ready") return;
  assert.equal(result.resourceEstimate.units, 2);
  assert.equal(result.resourceEstimate.horizons, 4);
  assert.equal(result.resourceEstimate.endpointNetworks, 2);
});

test("Conversation compiler resources use Unit-by-Horizon partitions without changing global Horizon count", async () => {
  const rowCount = 10_001;
  const rows = Array.from({ length: rowCount }, (_, index) => ({
    unit: `u${index}`,
    horizon: "shared",
    A: 1,
    B: 1,
    C: 1,
  })) as ParsedDataset["rows"];
  const result = await compileStandardDraftV3(
    dataset({
      headers: ["unit", "horizon", "A", "B", "C"],
      rows,
      sizeBytes: 1_000_000,
    }),
    DATASET_SHA256,
    standardDraft({
      rotation: {
        type: "reference",
        referenceId: "fixed-reference",
        expectedContentSha256: "b".repeat(64),
      },
    }),
  );
  assert.equal(result.status, "ready", result.diagnostics.map((entry) => entry.id).join(", "));
  if (result.status !== "ready") return;
  assert.equal(result.resourceEstimate.units, rowCount);
  assert.equal(result.resourceEstimate.horizons, 1);
  assert.equal(result.resourceEstimate.windowPartitions, rowCount);
  assert.equal(result.resourceEstimate.estimatedWindowVisits, rowCount);
});

function capabilityDataset(): ParsedDataset {
  return dataset({
    headers: ["unit", "horizon", "time", "group", "A", "B", "C"],
    rows: [
      { unit: "u1", horizon: "u1-h1", time: 1, group: "g1", A: 1, B: 1, C: 0 },
      { unit: "u1", horizon: "u1-h2", time: 2, group: "g1", A: 1, B: 0, C: 1 },
      { unit: "u2", horizon: "u2-h1", time: 1, group: "g2", A: 0, B: 1, C: 1 },
      { unit: "u2", horizon: "u2-h2", time: 2, group: "g2", A: 1, B: 1, C: 0 },
      { unit: "u3", horizon: "u3-h1", time: 1, group: "g1", A: 1, B: 0, C: 1 },
      { unit: "u3", horizon: "u3-h2", time: 2, group: "g1", A: 0, B: 1, C: 1 },
    ] as ParsedDataset["rows"],
  });
}

const allCapabilities = [
  "build-model",
  "export-current-model",
  "export-reference",
  "group-inference",
  "trajectory-inference",
  "longitudinal-comparison",
  "ai-interpretation",
] as const;

function assertCompleteCapabilities(
  actual: Readonly<Record<(typeof allCapabilities)[number], "available" | "blocked">>,
  expected: Readonly<Record<(typeof allCapabilities)[number], "available" | "blocked">>,
): void {
  assert.deepEqual(Object.keys(actual).sort(), [...allCapabilities].sort());
  assert.deepEqual(actual, expected);
  assert.equal(Object.isFrozen(actual), true);
}

test("capability status merges intrinsic Standard family, model, rotation, and Group boundaries", async () => {
  const endpoint = await compileStandardDraftV3(capabilityDataset(), DATASET_SHA256, standardDraft());
  assert.equal(endpoint.status, "ready");
  if (endpoint.status !== "ready") return;
  assertCompleteCapabilities(endpoint.capabilityStatus, {
    "build-model": "available",
    "export-current-model": "available",
    "export-reference": "available",
    "group-inference": "blocked",
    "trajectory-inference": "blocked",
    "longitudinal-comparison": "blocked",
    "ai-interpretation": "available",
  });

  const endpointWithGroup = await compileStandardDraftV3(
    capabilityDataset(),
    DATASET_SHA256,
    standardDraft({ groupColumn: "group" }),
  );
  assert.equal(endpointWithGroup.status, "ready");
  if (endpointWithGroup.status !== "ready") return;
  assertCompleteCapabilities(endpointWithGroup.capabilityStatus, {
    "build-model": "available",
    "export-current-model": "available",
    "export-reference": "available",
    "group-inference": "available",
    "trajectory-inference": "blocked",
    "longitudinal-comparison": "blocked",
    "ai-interpretation": "available",
  });

  const reference = await compileStandardDraftV3(capabilityDataset(), DATASET_SHA256, standardDraft({
    groupColumn: "group",
    rotation: {
      type: "reference",
      referenceId: "fixed-reference",
      expectedContentSha256: "b".repeat(64),
    },
  }));
  assert.equal(reference.status, "ready");
  if (reference.status !== "ready") return;
  assertCompleteCapabilities(reference.capabilityStatus, {
    "build-model": "available",
    "export-current-model": "available",
    "export-reference": "blocked",
    "group-inference": "available",
    "trajectory-inference": "blocked",
    "longitudinal-comparison": "blocked",
    "ai-interpretation": "available",
  });

  const trajectory = await compileStandardDraftV3(capabilityDataset(), DATASET_SHA256, standardDraft({
    groupColumn: "group",
    model: "SeparateTrajectory",
    horizonOrder,
  }));
  assert.equal(trajectory.status, "ready", trajectory.diagnostics.map((entry) => entry.id).join(", "));
  if (trajectory.status !== "ready") return;
  assertCompleteCapabilities(trajectory.capabilityStatus, {
    "build-model": "available",
    "export-current-model": "available",
    "export-reference": "blocked",
    "group-inference": "available",
    "trajectory-inference": "available",
    "longitudinal-comparison": "available",
    "ai-interpretation": "available",
  });

  const accumulatedWithoutGroup = await compileStandardDraftV3(
    capabilityDataset(),
    DATASET_SHA256,
    standardDraft({
      model: "AccumulatedTrajectory",
      horizonOrder,
    }),
  );
  assert.equal(accumulatedWithoutGroup.status, "ready");
  if (accumulatedWithoutGroup.status !== "ready") return;
  assertCompleteCapabilities(accumulatedWithoutGroup.capabilityStatus, {
    "build-model": "available",
    "export-current-model": "available",
    "export-reference": "blocked",
    "group-inference": "blocked",
    "trajectory-inference": "available",
    "longitudinal-comparison": "available",
    "ai-interpretation": "available",
  });

  const trajectoryReference = await compileStandardDraftV3(
    capabilityDataset(),
    DATASET_SHA256,
    standardDraft({
      groupColumn: "group",
      model: "SeparateTrajectory",
      horizonOrder,
      rotation: {
        type: "reference",
        referenceId: "fixed-reference",
        expectedContentSha256: "b".repeat(64),
      },
    }),
  );
  assert.equal(trajectoryReference.status, "ready");
  if (trajectoryReference.status !== "ready") return;
  assertCompleteCapabilities(trajectoryReference.capabilityStatus, {
    "build-model": "available",
    "export-current-model": "available",
    "export-reference": "blocked",
    "group-inference": "available",
    "trajectory-inference": "available",
    "longitudinal-comparison": "available",
    "ai-interpretation": "available",
  });
});

test("capability diagnostics can only add blocks to intrinsic Standard availability", async () => {
  const rankOne = await compileStandardDraftV3(dataset(), DATASET_SHA256, standardDraft());
  assert.equal(rankOne.status, "ready");
  if (rankOne.status !== "ready") return;
  assert.equal(rankOne.diagnostics.some((entry) => entry.id === "STANDARD_SVD_ONE_DIMENSIONAL"), true);
  assert.equal(rankOne.capabilityStatus["ai-interpretation"], "blocked");
  assert.equal(rankOne.capabilityStatus["trajectory-inference"], "blocked");

  const singletonMeans = await compileStandardDraftV3(
    capabilityDataset(),
    DATASET_SHA256,
    standardDraft({
      groupColumn: "group",
      rotation: {
        type: "means",
        centerAlignToOrigin: true,
        negativeLevel: { type: "string", value: "g1" },
        positiveLevel: { type: "string", value: "g2" },
      },
    }),
  );
  assert.equal(singletonMeans.status, "ready");
  if (singletonMeans.status !== "ready") return;
  assert.equal(singletonMeans.diagnostics.some((entry) => (
    entry.id === "STANDARD_MEANS_LEVEL_EMPTY" && entry.severity === "warning"
  )), true);
  assert.equal(singletonMeans.capabilityStatus["group-inference"], "blocked");
  assert.equal(singletonMeans.capabilityStatus["export-reference"], "available");

  const balancedMeansRows = [
    { unit: "u1", horizon: "h1", group: "g1", A: 1, B: 1, C: 0 },
    { unit: "u2", horizon: "h2", group: "g1", A: 1, B: 0, C: 1 },
    { unit: "u3", horizon: "h3", group: "g2", A: 0, B: 1, C: 1 },
    { unit: "u4", horizon: "h4", group: "g2", A: 1, B: 1, C: 1 },
  ] as ParsedDataset["rows"];
  const balancedMeans = await compileStandardDraftV3(
    dataset({
      headers: ["unit", "horizon", "group", "A", "B", "C"],
      rows: balancedMeansRows,
    }),
    DATASET_SHA256,
    standardDraft({
      groupColumn: "group",
      rotation: {
        type: "means",
        centerAlignToOrigin: true,
        negativeLevel: { type: "string", value: "g1" },
        positiveLevel: { type: "string", value: "g2" },
      },
    }),
  );
  assert.equal(balancedMeans.status, "ready", balancedMeans.diagnostics.map((entry) => entry.id).join(", "));
  if (balancedMeans.status !== "ready") return;
  assert.equal(balancedMeans.capabilityStatus["group-inference"], "available");
  assert.equal(balancedMeans.capabilityStatus["export-reference"], "available");
});

test("ONA capability status exactly preserves its descriptive-only family boundary", async () => {
  const result = await compileOnaDraftV3(dataset(), DATASET_SHA256, onaDraft());
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assertCompleteCapabilities(result.capabilityStatus, {
    "build-model": "available",
    "export-current-model": "available",
    "export-reference": OPEN_ENA_CAPABILITIES.ona.referenceRotation ? "available" : "blocked",
    "group-inference": OPEN_ENA_CAPABILITIES.ona.inference ? "available" : "blocked",
    "trajectory-inference": OPEN_ENA_CAPABILITIES.ona.trajectory ? "available" : "blocked",
    "longitudinal-comparison": OPEN_ENA_CAPABILITIES.ona.trajectory ? "available" : "blocked",
    "ai-interpretation": OPEN_ENA_CAPABILITIES.ona.aiInterpretation ? "available" : "blocked",
  });
});

test("ONA compiler isolates reserved source headers, typed identity displays, and edge-like Code names", async () => {
  const reservedCodes = ["ENA_UNIT", "TRAJ_UNIT", "A", "B", "A & B", "B & C", "C"];
  const safeCodes = reservedCodes.map((_code, index) => `SAFE_${index}`);
  const rowValues = [
    [1, 1, 0, 0, 0, 1, 0],
    [0, 1, 1, 0, 0, 0, 1],
    [0, 0, 1, 1, 0, 1, 0],
    [0, 0, 0, 1, 1, 0, 1],
    [1, 0, 0, 0, 1, 1, 0],
    [1, 0, 1, 0, 1, 0, 1],
  ];
  const unitParts = [
    ["x::y", "z"],
    ["x", "y::z"],
    ["u2", "v2"],
    ["u3", "v3"],
    ["u4", "v4"],
    ["u5", "v5"],
  ];
  const horizonParts = [
    ["h::i", "j"],
    ["h", "i::j"],
    ["h2", "p2"],
    ["h3", "p3"],
    ["h4", "p4"],
    ["h5", "p5"],
  ];
  const fixtureFor = (codes: readonly string[]): ParsedDataset => ({
    name: "ona-plan-token-fixture.csv",
    headers: ["Unit", "Unit part", "Horizon", "Horizon part", "Group", "turn", ...codes],
    rows: rowValues.map((values, rowIndex) => ({
      Unit: unitParts[rowIndex][0],
      "Unit part": unitParts[rowIndex][1],
      Horizon: horizonParts[rowIndex][0],
      "Horizon part": horizonParts[rowIndex][1],
      Group: rowIndex % 2 === 0 ? "g1" : "g2",
      turn: rowIndex + 1,
      ...Object.fromEntries(codes.map((code, codeIndex) => [code, values[codeIndex]])),
    })) as ParsedDataset["rows"],
    sizeBytes: 1_024,
    source: "upload",
  });
  const draftFor = (codes: string[]): OrderedNetworkDraftV3 => ({
    unitColumns: ["Unit", "Unit part"],
    horizonColumns: ["Horizon", "Horizon part"],
    groupColumn: "Group",
    codes,
    backward: { kind: "finite", value: 1 },
    rowOrder: {
      kind: "columns",
      keys: [{ column: "turn", direction: "ascending", comparator: { type: "number" } }],
    },
    directionalMask: {
      schemaVersion: 1,
      codeOrder: codes,
      enabled: codes.map(() => codes.map(() => true)),
    },
  });

  const reservedDataset = fixtureFor(reservedCodes);
  const safeDataset = fixtureFor(safeCodes);
  const reserved = await compileOnaDraftV3(reservedDataset, DATASET_SHA256, draftFor(reservedCodes));
  const safe = await compileOnaDraftV3(safeDataset, DATASET_SHA256, draftFor(safeCodes));
  assert.equal(reserved.status, "ready", reserved.diagnostics.map((entry) => entry.id).join(", "));
  assert.equal(safe.status, "ready", safe.diagnostics.map((entry) => entry.id).join(", "));
  if (reserved.status !== "ready" || safe.status !== "ready") return;

  const modelFor = async (input: ParsedDataset, draft: OrderedNetworkDraftV3) => {
    const compiled = await compileOnaDraftV3(input, DATASET_SHA256, draft);
    assert.equal(compiled.status, "ready");
    if (compiled.status !== "ready") throw new Error("expected ready ONA compilation");
    const binding = {
      hashKind: "normalized-utf8-csv-text-sha256" as const,
      normalizedTableSha256: DATASET_SHA256,
      rowCount: input.rows.length,
      headerSha256: await sha256CanonicalJsonV3(input.headers),
    };
    const prepared = validateOnaDatasetV3(input, binding, compiled.canonicalConfiguration);
    assert.ok(prepared.ordering);
    const scientific = runOnaScientificPreflightV3(input, compiled.canonicalConfiguration, prepared.ordering);
    assert.ok(scientific.model);
    return scientific.model;
  };
  const reservedModel = await modelFor(reservedDataset, draftFor(reservedCodes));
  const safeModel = await modelFor(safeDataset, draftFor(safeCodes));
  assert.deepEqual(reservedModel.connectionMatrix, safeModel.connectionMatrix);
  assert.deepEqual(
    reservedModel.adjacencyKey.map(({ sourceIndex, targetIndex }) => ({ sourceIndex, targetIndex })),
    safeModel.adjacencyKey.map(({ sourceIndex, targetIndex }) => ({ sourceIndex, targetIndex })),
  );
  assert.deepEqual(
    reservedModel.adjacencyKey.map(({ source, target }) => ({ source, target })),
    reservedCodes.flatMap((target) => reservedCodes.map((source) => ({ source, target }))),
  );
  const restoredNames = reservedModel.adjacencyKey.map((entry) => entry.name);
  assert.equal(new Set(restoredNames).size, restoredNames.length);
  assert.deepEqual(
    Object.keys(reservedModel.connectionCounts[0] ?? {}).sort(),
    [...restoredNames].sort(),
  );
  assert.doesNotMatch(JSON.stringify(reservedModel), /__OPEN_ENA_V3_/u);
});

test("ONA numerical classification maps only ordered EnaNumericalError instances and rethrows unknown errors", async () => {
  const internals = await import("../lib/open-ena/model-v3/ona-compiler-preflight");
  assert.equal(typeof internals.onaNumericalDiagnosticV3, "function");
  if (typeof internals.onaNumericalDiagnosticV3 !== "function") return;
  const sentinel = new Error("programming failure");
  assert.throws(
    () => internals.onaNumericalDiagnosticV3(sentinel),
    (error) => error === sentinel,
  );
  const standardError = new EnaNumericalError({
    code: "STANDARD_CONNECTION_NONFINITE",
    edgeIndex: 0,
    sourceCode: "A",
    targetCode: "B",
    value: Number.POSITIVE_INFINITY,
  });
  assert.throws(
    () => internals.onaNumericalDiagnosticV3(standardError),
    (error) => error === standardError,
  );
});

for (const [orderKind, backward] of [
  ["columns", 2],
  ["columns", Number.POSITIVE_INFINITY],
  ["source-row", 2],
  ["source-row", Number.POSITIVE_INFINITY],
] as const) {
  test(`v3 ONA preflight matches legacy authoritative accumulation for ${orderKind} order and ${String(backward)} backward`, async () => {
    const input = dataset({
      headers: ["unit", "horizon", "turn", "A", "B", "C"],
      rows: [
        { unit: "u1", horizon: "h1", turn: 2, A: 1, B: 0, C: 1 },
        { unit: "u1", horizon: "h1", turn: 1, A: 0, B: 1, C: 1 },
        { unit: "u2", horizon: "h2", turn: 1, A: 1, B: 1, C: 0 },
        { unit: "u2", horizon: "h2", turn: 2, A: 0, B: 1, C: 1 },
        { unit: "u3", horizon: "h3", turn: 1, A: 1, B: 0, C: 1 },
        { unit: "u3", horizon: "h3", turn: 2, A: 1, B: 1, C: 0 },
      ] as ParsedDataset["rows"],
    });
    const enabled = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => true));
    const legacyOrder = orderKind === "columns"
      ? { kind: "columns" as const, columns: ["turn"], comparators: { turn: "number" as const } }
      : { kind: "source-row" as const, confirmed: true as const };
    const legacyConfig: OpenEnaConfig = {
      analysisKind: "ona",
      unitColumns: ["unit"],
      conversationColumns: ["horizon"],
      groupColumn: null,
      codes: ["A", "B", "C"],
      model: "EndPoint",
      window: "MovingStanzaWindow",
      windowSizeBack: backward,
      windowSizeForward: 0,
      weightBy: "sum",
      rotation: "svd",
      referenceRotationId: null,
      centerAlignToOrigin: true,
      orderPolicy: legacyOrder,
      directionalMask: { schemaVersion: 1, codeOrder: ["A", "B", "C"], enabled },
    };
    const v3Order = orderKind === "columns"
      ? rowOrder
      : {
          kind: "source-order-confirmed" as const,
          confirmation: {
            kind: "explicit-researcher-confirmation" as const,
            analysisFamily: "ona" as const,
            datasetSha256: DATASET_SHA256,
            rowCount: input.rows.length,
            relevantColumns: ["horizon"],
            confirmedAt: "2026-09-04T00:00:00.000Z",
            confirmationVersion: 1 as const,
          },
        };
    const compiled = await compileOnaDraftV3(input, DATASET_SHA256, onaDraft({
      groupColumn: null,
      backward: backward === Number.POSITIVE_INFINITY
        ? { kind: "infinity" }
        : { kind: "finite", value: backward },
      rowOrder: v3Order,
      directionalMask: { schemaVersion: 1, codeOrder: ["A", "B", "C"], enabled },
    }));
    assert.equal(compiled.status, "ready", compiled.diagnostics.map((entry) => entry.id).join(", "));
    if (compiled.status !== "ready") return;
    const binding = {
      hashKind: "normalized-utf8-csv-text-sha256" as const,
      normalizedTableSha256: DATASET_SHA256,
      rowCount: input.rows.length,
      headerSha256: await sha256CanonicalJsonV3(input.headers),
    };
    const prepared = validateOnaDatasetV3(input, binding, compiled.canonicalConfiguration);
    assert.ok(prepared.ordering);
    const v3 = runOnaScientificPreflightV3(input, compiled.canonicalConfiguration, prepared.ordering);
    assert.ok(v3.model);

    const legacyPlan = buildOpenEnaAnalysisPlan(input, legacyConfig);
    const legacy = accumulateDataChunked({
      ...legacyPlan.options,
      includeMeta: false,
      materialization: "model",
      chunkSize: input.rows.length,
    });
    assert.deepEqual(v3.model.connectionMatrix, legacy.connectionMatrix);
    assert.deepEqual(v3.model.connectionCounts, legacy.connectionCounts);
    assert.deepEqual(v3.model.adjacencyKey, legacy.adjacencyKey);
    assert.deepEqual(
      prepared.ordering.orderedSourceRowIndices,
      legacyPlan.executionProvenance.ordering?.responseRowSourceIndices,
    );
  });
}

test("malformed direct compiler inputs intentionally reject without minting fingerprints or canonical output", async () => {
  await assert.rejects(
    compileStandardDraftV3(dataset(), DATASET_SHA256, {
      ...standardDraft(),
      unexpectedScientificField: true,
    } as unknown as StandardEnaDraftV3),
    TypeError,
  );
  let getterCalls = 0;
  const malicious = onaDraft() as OrderedNetworkDraftV3 & { model?: string };
  Object.defineProperty(malicious, "model", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "SeparateTrajectory";
    },
  });
  await assert.rejects(compileOnaDraftV3(dataset(), DATASET_SHA256, malicious), TypeError);
  assert.equal(getterCalls, 0);
});
