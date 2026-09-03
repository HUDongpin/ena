import assert from "node:assert/strict";
import test from "node:test";
import { STANDARD_MODEL_TYPES, STANDARD_WINDOW_TYPES, STANDARD_ROTATION_TYPES, OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3, OPEN_ENA_RUNTIME_POLICY_VERSION_V3, OPEN_ENA_EXECUTION_CONTRACT_VERSION_V3 } from "../lib/open-ena/model-v3/types";
import type { CanonicalOnaConfigV3, CanonicalRowOrderV3, CanonicalStandardAnalysisV3, CanonicalStandardConfigV3, DatasetBindingV3, ModelWorkspaceDraftsV3, OrderedNetworkDraftV3, StandardEnaDraftV3, BackwardExtentV3, ForwardExtentV3, CanonicalCodeV3, StandardWindowV3 } from "../lib/open-ena/model-v3/types";
import type { OpenEnaDirectionalMask } from "../lib/open-ena/types";

test("v3 runtime vocabulary and contract versions are exact", () => {
  assert.deepEqual(STANDARD_MODEL_TYPES, ["EndPoint", "SeparateTrajectory", "AccumulatedTrajectory"]);
  assert.deepEqual(STANDARD_WINDOW_TYPES, ["MovingStanzaWindow", "Conversation"]);
  assert.deepEqual(STANDARD_ROTATION_TYPES, ["svd", "means", "reference"]);
  assert.equal(OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3, "open-ena-validation-v3.1");
  assert.equal(OPEN_ENA_RUNTIME_POLICY_VERSION_V3, "open-ena-runtime-policy-v3.1");
  assert.equal(OPEN_ENA_EXECUTION_CONTRACT_VERSION_V3, "open-ena-execution-v3.1");
  assert.equal((STANDARD_ROTATION_TYPES as readonly string[]).includes("spherical"), false);
});

const contracts = { validationContractVersion: OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3, runtimePolicyVersion: OPEN_ENA_RUNTIME_POLICY_VERSION_V3 } as const;
const rowOrder: CanonicalRowOrderV3 = { kind: "columns", keys: [{ column: "date", direction: "ascending", comparator: { type: "date", format: "YYYY-MM-DD" } }] };
const finite: BackwardExtentV3 = { kind: "finite", value: 2 };
const infinity: ForwardExtentV3 = { kind: "infinity" };
const codes: [CanonicalCodeV3, CanonicalCodeV3, CanonicalCodeV3] = [{ column: "a", displayLabel: "A" }, { column: "b", displayLabel: "B" }, { column: "c", displayLabel: "C" }];
const mask: OpenEnaDirectionalMask = { schemaVersion: 1, codeOrder: ["a", "b", "c"], enabled: [[true, true, true], [true, true, true], [true, true, true]] };

const standard: CanonicalStandardConfigV3 = {
  schemaVersion: 3, analysisFamily: "standard", contracts,
  units: { columns: ["student"], group: { type: "none" } }, horizons: { columns: ["date"] }, codes,
  weighting: { type: "binary" },
  window: { type: "MovingStanzaWindow", backward: finite, forward: infinity, rowOrder },
  analysis: { model: { type: "EndPoint" }, rotation: { type: "svd", centerAlignToOrigin: true } },
};

const conversationWindow: StandardWindowV3 = { type: "Conversation" };
const endpointSvd: CanonicalStandardAnalysisV3 = { model: { type: "EndPoint" }, rotation: { type: "svd", centerAlignToOrigin: true } };
const endpointMeans: CanonicalStandardAnalysisV3 = { model: { type: "EndPoint" }, rotation: { type: "means", centerAlignToOrigin: true, contrast: { groupColumn: "class", negativeLevel: { type: "string", value: "n" }, positiveLevel: { type: "string", value: "p" } } } };
const endpointReference: CanonicalStandardAnalysisV3 = { model: { type: "EndPoint" }, rotation: { type: "reference", referenceId: "r", expectedContentSha256: "d" } };
const separateSvd: CanonicalStandardAnalysisV3 = { model: { type: "SeparateTrajectory", horizonOrder: rowOrder }, rotation: { type: "svd", centerAlignToOrigin: true } };
const separateReference: CanonicalStandardAnalysisV3 = { model: { type: "SeparateTrajectory", horizonOrder: rowOrder }, rotation: { type: "reference", referenceId: "r", expectedContentSha256: "d" } };
const accumulatedSvd: CanonicalStandardAnalysisV3 = { model: { type: "AccumulatedTrajectory", horizonOrder: rowOrder }, rotation: { type: "svd", centerAlignToOrigin: true } };
const accumulatedReference: CanonicalStandardAnalysisV3 = { model: { type: "AccumulatedTrajectory", horizonOrder: rowOrder }, rotation: { type: "reference", referenceId: "r", expectedContentSha256: "d" } };

const ona: CanonicalOnaConfigV3 = {
  schemaVersion: 3, analysisFamily: "ona", contracts,
  units: { columns: ["student"], group: { type: "stable-metadata", column: "class" } }, horizons: { columns: ["date"] }, codes,
  model: { type: "EndPoint" }, weighting: { type: "frequency", engineMethod: "sum" },
  window: { type: "MovingStanzaWindow", backward: finite, forward: 0, rowOrder },
  rotation: { type: "svd", centerAlignToOrigin: true }, directionalMask: mask,
};

const standardDraft: StandardEnaDraftV3 = {
  unitColumns: ["student"], horizonColumns: ["date"], groupColumn: null, codes: ["a", "b", "c"], weighting: "binary", model: "EndPoint", windowType: "MovingStanzaWindow",
  movingStanza: { backward: finite, forward: infinity, rowOrder: null }, horizonOrder: null,
  rotation: { type: "means", centerAlignToOrigin: true, negativeLevel: null, positiveLevel: null },
};
const orderedDraft: OrderedNetworkDraftV3 = { unitColumns: ["student"], horizonColumns: ["date"], groupColumn: null, codes: ["a", "b", "c"], backward: finite, rowOrder: null, directionalMask: null };
const workspace: ModelWorkspaceDraftsV3 = { schemaVersion: 3, activeFamily: "standard", standard: standardDraft, ona: orderedDraft };
const binding: DatasetBindingV3 = { hashKind: "normalized-utf8-csv-text-sha256", normalizedTableSha256: "a".repeat(64), rowCount: 2, headerSha256: "b".repeat(64) };

test("v3 canonical, draft, workspace, and binding examples are constructible", () => {
  assert.equal(standard.analysis.model.type, "EndPoint"); assert.equal(ona.window.forward, 0); assert.equal(workspace.schemaVersion, 3); assert.equal(binding.rowCount, 2);
});

// @ts-expect-error Direct trajectory Means rotation is impossible.
const illegalTrajectoryMeans: CanonicalStandardAnalysisV3 = { model: { type: "SeparateTrajectory", horizonOrder: rowOrder }, rotation: { type: "means", centerAlignToOrigin: true, contrast: { groupColumn: "class", negativeLevel: { type: "string", value: "n" }, positiveLevel: { type: "string", value: "p" } } } };
// @ts-expect-error ONA forward is exactly zero.
const illegalOnaForward = { ...ona, window: { ...ona.window, forward: 1 } } satisfies CanonicalOnaConfigV3;
// @ts-expect-error ONA permits MovingStanzaWindow only.
const illegalOnaConversation = { ...ona, window: { type: "Conversation" } } satisfies CanonicalOnaConfigV3;
// @ts-expect-error ONA permits SVD only.
const illegalOnaReference = { ...ona, rotation: { type: "reference", referenceId: "r", expectedContentSha256: "d" } } satisfies CanonicalOnaConfigV3;
// @ts-expect-error A canonical Standard config requires at least three Codes.
const illegalTwoCodes = { ...standard, codes: codes.slice(0, 2) } satisfies CanonicalStandardConfigV3;
// @ts-expect-error directionalMask is ONA-only.
const illegalStandardDirectionalMask = { ...standard, directionalMask: mask } satisfies CanonicalStandardConfigV3;
// @ts-expect-error Binary weighting is Standard-only.
const illegalOnaBinary = { ...ona, weighting: { type: "binary" } } satisfies CanonicalOnaConfigV3;
