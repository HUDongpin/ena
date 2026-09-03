import assert from "node:assert/strict";
import test from "node:test";
import {
  OPEN_ENA_EXECUTION_CONTRACT_VERSION_V3,
  OPEN_ENA_RUNTIME_POLICY_VERSION_V3,
  OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3,
  STANDARD_MODEL_TYPES,
  STANDARD_ROTATION_TYPES,
  STANDARD_WINDOW_TYPES,
} from "../lib/open-ena/model-v3/types";
import type {
  CanonicalOnaConfigV3,
  CanonicalStandardAnalysisV3,
  CanonicalStandardConfigV3,
  DatasetBindingV3,
  DatasetBoundConfirmationV3,
  ModelWorkspaceDraftsV3,
  OrderedNetworkDraftV3,
  StandardEnaDraftV3,
} from "../lib/open-ena/model-v3/types";
import type { OpenEnaDirectionalMask } from "../lib/open-ena/types";

test("v3 runtime vocabulary is exact and closed", () => {
  assert.deepEqual(STANDARD_MODEL_TYPES, ["EndPoint", "SeparateTrajectory", "AccumulatedTrajectory"]);
  assert.deepEqual(STANDARD_WINDOW_TYPES, ["MovingStanzaWindow", "Conversation"]);
  assert.deepEqual(STANDARD_ROTATION_TYPES, ["svd", "means", "reference"]);
  assert.equal(OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3, "open-ena-validation-v3.1");
  assert.equal(OPEN_ENA_RUNTIME_POLICY_VERSION_V3, "open-ena-runtime-policy-v3.1");
  assert.equal(OPEN_ENA_EXECUTION_CONTRACT_VERSION_V3, "open-ena-execution-v3.1");
  assert.equal((STANDARD_ROTATION_TYPES as readonly string[]).includes("spherical"), false);
});

const contracts = {
  validation: OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3,
  runtimePolicy: OPEN_ENA_RUNTIME_POLICY_VERSION_V3,
  execution: OPEN_ENA_EXECUTION_CONTRACT_VERSION_V3,
} as const;

const confirmation: DatasetBoundConfirmationV3 = {
  kind: "explicit-researcher-confirmation",
  datasetSha256: "a".repeat(64),
  rowCount: 2,
  relevantColumns: ["date"],
  confirmedAt: "2026-09-03T00:00:00Z",
  confirmationVersion: 1,
};

const rowOrder = {
  kind: "columns",
  keys: [{ column: "date", direction: "ascending", comparator: { kind: "date", format: "YYYY-MM-DD" } }],
} as const;

const mask: OpenEnaDirectionalMask = {
  schemaVersion: 1,
  codeOrder: ["a", "b", "c"],
  enabled: [[true, true, true], [true, true, true], [true, true, true]],
};

const codes = [
  { column: "a", displayLabel: "A" },
  { column: "b", displayLabel: "B" },
  { column: "c", displayLabel: "C" },
] as const;

const standard: CanonicalStandardConfigV3 = {
  schema: 3,
  family: "standard",
  contracts,
  units: { columns: ["student"] },
  group: { kind: "none" },
  horizons: { columns: ["date"] },
  codes,
  weighting: "Binary",
  window: { kind: "MovingStanzaWindow", backward: 2, forward: 0, order: rowOrder },
  analysis: { model: "EndPoint", rotation: { kind: "SVD", center: true } },
};

const ona: CanonicalOnaConfigV3 = {
  schema: 3,
  family: "ona",
  contracts,
  units: { columns: ["student"] },
  group: { kind: "stable-metadata", column: "class" },
  horizons: { columns: ["date"] },
  codes,
  engine: { method: "frequency", engineMethod: "sum" },
  window: { kind: "MovingStanzaWindow", backward: 2 },
  analysis: { model: "EndPoint", rotation: { kind: "SVD", centerAlignToOrigin: true } },
  forward: 0,
  rowOrder,
  directionalMask: mask,
};

const standardDraft: StandardEnaDraftV3 = {
  units: ["student"],
  horizons: ["date"],
  group: null,
  codes: ["a", "b", "c"],
  weighting: "Binary",
  model: "EndPoint",
  window: "MovingStanzaWindow",
  backward: 2,
  forward: 0,
  rowOrder: null,
  horizonOrder: null,
  rotation: { kind: "Means", center: true, groupColumn: null, negativeLevel: null, positiveLevel: null },
};

const orderedDraft: OrderedNetworkDraftV3 = {
  units: ["student"],
  horizons: ["date"],
  group: null,
  codes: ["a", "b", "c"],
  backward: 2,
  rowOrder: null,
  directionalMask: null,
};

const workspace: ModelWorkspaceDraftsV3 = {
  schema: 3,
  activeFamily: "standard",
  standard: standardDraft,
  ona: orderedDraft,
};

const binding: DatasetBindingV3 = {
  hashKind: "normalized-utf8-csv-text-sha256",
  normalizedTableSha256: "b".repeat(64),
  rowCount: 2,
  headerSha256: "c".repeat(64),
};

test("v3 canonical and draft examples are constructible", () => {
  assert.equal(standard.analysis.model, "EndPoint");
  assert.equal(ona.forward, 0);
  assert.equal(workspace.standard.model, "EndPoint");
  assert.equal(binding.rowCount, confirmation.rowCount);
});

// @ts-expect-error Direct trajectory Means rotation is intentionally impossible.
const illegalTrajectoryMeans: CanonicalStandardAnalysisV3 = { model: "SeparateTrajectory", horizonOrder: rowOrder, rotation: { kind: "Means", center: true, groupColumn: "class", negativeLevel: { kind: "exact-string", value: "n" }, positiveLevel: { kind: "exact-string", value: "p" } } };

// @ts-expect-error ONA only permits a zero forward extent.
const illegalOnaForward = { ...ona, forward: 1 } satisfies CanonicalOnaConfigV3;

// @ts-expect-error ONA cannot use a Conversation window.
const illegalOnaConversation = { ...ona, window: { kind: "Conversation" } } satisfies CanonicalOnaConfigV3;

// @ts-expect-error ONA cannot use Reference rotation.
const illegalOnaReference = { ...ona, analysis: { model: "EndPoint", rotation: { kind: "Reference", referenceId: "r", expectedContentSha256: "d" } } } satisfies CanonicalOnaConfigV3;
