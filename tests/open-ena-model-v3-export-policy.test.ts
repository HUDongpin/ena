import assert from "node:assert/strict";
import test from "node:test";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import {
  OPEN_ENA_BUNDLE_SCIENTIFIC_TOLERANCE,
  exportCanonicalConfigV3,
  exportCurrentAnalysisV3,
  exportDraftV3,
  exportReferenceV2,
  exportStaleAuditV3,
} from "../lib/open-ena/export";
import {
  OPEN_ENA_BUNDLE_SCIENTIFIC_TOLERANCE as LEAF_BUNDLE_SCIENTIFIC_TOLERANCE,
} from "../lib/open-ena/legacy-analysis-bundle-parser";
import { bindResultV3 } from "../lib/open-ena/model-v3/result-binding";
import { fitReferenceSourceV3 } from "../lib/open-ena/model-v3/reference-v2";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";
import { createDirectionalMask } from "../lib/open-ena/network-config";
import {
  buildOnaExecutionPlanV3,
  runOnaPlanV3,
} from "../lib/open-ena/model-v3/ona-adapter";
import { bindOnaResultV3 } from "../lib/open-ena/model-v3/ona-result-binding";
import { decodeCanonicalOnaConfigV3 } from "../lib/open-ena/model-v3/schema";
import {
  OPEN_ENA_RUNTIME_POLICY_VERSION_V3,
  OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3,
} from "../lib/open-ena/model-v3/types";

async function boundFixture(hash = "a".repeat(64)) {
  const { plan, compiled } = await bindingFixtureV3(hash);
  const result = await bindResultV3(plan, runStandardPlanV3(plan), {
    processedRows: plan.rows.length,
    maximumBufferedRows: 0,
    numericCellsAllocated: 120,
    peakBytesObservedOrBounded: 10_240,
    observationMethod: "exact-counters-and-conservative-byte-bound",
  }, compiled.diagnostics);
  return { plan, compiled, result };
}

async function onaBoundFixture() {
  const rows = [
    { u: "u1", h: "h1", t: 1, A: 2, B: 0, C: 1 },
    { u: "u2", h: "h1", t: 2, A: 0, B: 3, C: 1 },
    { u: "u1", h: "h2", t: 1, A: 0, B: 2, C: 2 },
  ];
  const codes = ["A", "B", "C"];
  const configuration = decodeCanonicalOnaConfigV3({
    schemaVersion: 3,
    analysisFamily: "ona",
    contracts: {
      validationContractVersion: OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3,
      runtimePolicyVersion: OPEN_ENA_RUNTIME_POLICY_VERSION_V3,
    },
    units: { columns: ["u"], group: { type: "none" } },
    horizons: { columns: ["h"] },
    codes: codes.map((column) => ({ column, displayLabel: column })),
    model: { type: "EndPoint" },
    weighting: { type: "frequency", engineMethod: "sum" },
    window: {
      type: "MovingStanzaWindow",
      backward: { kind: "finite", value: 2 },
      forward: 0,
      rowOrder: {
        kind: "columns",
        keys: [{ column: "t", direction: "ascending", comparator: { type: "number" } }],
      },
    },
    rotation: { type: "svd", centerAlignToOrigin: true },
    directionalMask: createDirectionalMask(codes),
  });
  const plan = await buildOnaExecutionPlanV3({
    rows,
    headers: Object.keys(rows[0]),
    name: "ona-current.csv",
    sizeBytes: 512,
    source: "upload",
  }, "d".repeat(64), configuration);
  const result = await bindOnaResultV3(plan, runOnaPlanV3(plan), {
    processedRows: rows.length,
    maximumRetainedRowsAfterChunk: 0,
    bufferedRowsPeakUpperBound: Math.min(rows.length, plan.header.resourceEstimate.estimatedRetainedWindowRows + 1),
    numericCellsUpperBound: plan.operationalAdmission.totalNumericCells,
    peakBytesUpperBound: plan.operationalAdmission.totalPeakBytes,
    observationMethod: "dimension-bounds-and-chunk-boundary-stream-state",
  });
  return { plan, result };
}

function decoded(bytes: Uint8Array): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

test("normal analysis export requires a current result and stale results export only as audit", async () => {
  const stale = await boundFixture("a".repeat(64));
  const current = await boundFixture("b".repeat(64));
  await assert.rejects(
    () => exportCurrentAnalysisV3(stale.result, current.plan),
    /stale.*audit/i,
  );
  const audit = await exportStaleAuditV3(stale.result, current.compiled.draftFingerprint);
  assert.equal(audit.kind, "open-ena-stale-audit");
  assert.equal(audit.executable, false);
  assert.match(audit.filename, /\.STALE-/u);
  assert.deepEqual(decoded(audit.bytes).integrity, audit.integrity);
});

test("invalid drafts export only as non-executable, detached JSON data", async () => {
  const invalidDraft = {
    unitColumns: ["unit"], horizonColumns: ["horizon"], groupColumn: null,
    codes: [], weighting: "frequency", model: "EndPoint", windowType: "Conversation",
    movingStanza: { backward: { kind: "finite", value: 1 }, forward: { kind: "finite", value: 0 }, rowOrder: null },
    horizonOrder: null, rotation: { type: "means", centerAlignToOrigin: true, negativeLevel: null, positiveLevel: null },
  };
  const snapshot = structuredClone(invalidDraft);
  const artifact = await exportDraftV3(invalidDraft);
  assert.equal(artifact.kind, "open-ena-draft");
  assert.equal(artifact.executable, false);
  assert.match(artifact.filename, /\.open-ena-draft\.v3\.json$/u);
  assert.deepEqual(invalidDraft, snapshot);
  assert.deepEqual(decoded(artifact.bytes).draft, snapshot);
  await assert.rejects(
    () => exportDraftV3({ ...invalidDraft, bad: Number.POSITIVE_INFINITY }),
    /finite|JSON/i,
  );
});

test("draft export accepts only exact Standard or ONA draft grammar without requiring readiness", async () => {
  const invalidStandard = {
    unitColumns: [], horizonColumns: [], groupColumn: null, codes: [],
    weighting: "frequency", model: "SeparateTrajectory", windowType: "Conversation",
    movingStanza: { backward: { kind: "finite", value: 1 }, forward: { kind: "finite", value: 0 }, rowOrder: null },
    horizonOrder: null,
    rotation: { type: "means", centerAlignToOrigin: true, negativeLevel: null, positiveLevel: null },
  };
  const standard = await exportDraftV3(invalidStandard);
  assert.equal(standard.analysisFamily, "standard");
  assert.deepEqual(decoded(standard.bytes).draft, invalidStandard);

  const invalidOna = {
    unitColumns: [], horizonColumns: [], groupColumn: null, codes: [],
    backward: { kind: "infinity" }, rowOrder: null, directionalMask: null,
  };
  const ona = await exportDraftV3(invalidOna);
  assert.equal(ona.analysisFamily, "ona");
  assert.deepEqual(decoded(ona.bytes).draft, invalidOna);

  for (const unsupported of [
    true,
    [],
    null,
    { model: "TMA" },
    { analysisFamily: "ona", codes: [] },
    { ...invalidStandard, backward: { kind: "infinity" } },
  ]) {
    await assert.rejects(() => exportDraftV3(unsupported), /draft|shape|family|object/i);
  }
});

test("canonical configuration export accepts only an actual compiler-owned ready result", async () => {
  const { compiled } = await boundFixture();
  const artifact = await exportCanonicalConfigV3(compiled);
  assert.equal(artifact.kind, "open-ena-canonical-config");
  assert.equal(artifact.family, "Standard");
  assert.equal(artifact.executable, true);
  assert.match(artifact.filename, /\.standard-ena-config\.v3\.json$/u);
  assert.match(artifact.integrity.canonicalPayloadSha256, /^[a-f0-9]{64}$/u);
  await assert.rejects(
    () => exportCanonicalConfigV3(structuredClone(compiled)),
    /compiler-owned|compiled/i,
  );
});

test("current Standard analysis export keeps bundle bytes bound to the independent plan and detached", async () => {
  const { plan, result } = await boundFixture();
  const before = structuredClone(result);
  const artifact = await exportCurrentAnalysisV3(result, plan);
  assert.equal(artifact.kind, "open-ena-analysis-bundle");
  assert.equal(artifact.family, "Standard");
  assert.match(artifact.filename, /\.standard-ena-analysis\.v3\.json$/u);
  assert.deepEqual(result, before);
  assert.equal(decoded(artifact.bytes).kind, "open-ena-analysis-bundle");
});

test("normal analysis export requires one actual independent plan and accepts current Standard and ONA plans", async () => {
  const standard = await boundFixture();
  const current = exportCurrentAnalysisV3 as (result: unknown, plan?: unknown) => Promise<unknown>;
  await assert.rejects(() => current(standard.result), /plan|execution|current/i);
  for (const invalid of [undefined, null, false, 0, "", {}]) {
    await assert.rejects(() => current(standard.result, invalid), /plan|execution|current/i);
  }
  await assert.doesNotReject(() => exportCurrentAnalysisV3(standard.result, standard.plan));
  const ona = await onaBoundFixture();
  const exported = await exportCurrentAnalysisV3(ona.result, ona.plan);
  assert.equal(exported.family, "ONA");
  assert.match(exported.filename, /\.ona-analysis\.v3\.json$/u);
});

test("legacy bundle parser tolerance remains available from the public export facade", () => {
  assert.equal(
    OPEN_ENA_BUNDLE_SCIENTIFIC_TOLERANCE,
    LEAF_BUNDLE_SCIENTIFIC_TOLERANCE,
  );
});

test("Reference export delegates fresh fits to the private witness owner", async () => {
  const { plan, result } = await boundFixture();
  const sourceWitness = await fitReferenceSourceV3(plan);
  const artifact = await exportReferenceV2(result, {
    sourceWitness,
    currentPlan: plan,
    displayName: "Owned fit",
  });
  assert.equal(artifact.kind, "open-ena-standard-reference-rotation");
  assert.match(artifact.filename, /\.standard-ena-reference\.v2\.json$/u);
  assert.equal(decoded(artifact.bytes).displayName, "Owned fit");
  await assert.rejects(
    () => exportReferenceV2(result, { currentPlan: plan }),
    /witness/i,
  );
});

test("Reference export captures one coherent current plan before both consumers", async () => {
  const { plan, result } = await boundFixture();
  const other = await boundFixture("b".repeat(64));
  const sourceWitness = await fitReferenceSourceV3(plan);
  let rootOwnKeys = 0;
  const changingPlan = new Proxy(plan, {
    ownKeys(target) {
      rootOwnKeys += 1;
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(target, property) {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, property);
      if (property === "header" && descriptor && "value" in descriptor && rootOwnKeys > 2) {
        return { ...descriptor, value: other.plan.header };
      }
      return descriptor;
    },
  });
  const artifact = await exportReferenceV2(result, {
    sourceWitness,
    currentPlan: changingPlan,
    displayName: "Single capture",
  });
  assert.equal(decoded(artifact.bytes).displayName, "Single capture");
  assert.equal(rootOwnKeys, 2, "the coherent plan intake performs its documented double descriptor check once");
});

test("Reference-projected Endpoint downloads its exact original artifact and never mints", async () => {
  const source = await boundFixture();
  const sourceWitness = await fitReferenceSourceV3(source.plan);
  const exported = await exportReferenceV2(source.result, {
    sourceWitness,
    currentPlan: source.plan,
    displayName: "Original source",
  });
  const original = decoded(exported.bytes);
  const targetFixture = await bindingFixtureV3("c".repeat(64), (draft) => {
    draft.rotation = {
      type: "reference",
      referenceId: original.referenceId as string,
      expectedContentSha256: original.contentSha256 as string,
    };
  }, original as never);
  const targetPlan = targetFixture.plan;
  const projected = await bindResultV3(targetPlan, runStandardPlanV3(targetPlan), {
    processedRows: targetPlan.rows.length,
    maximumBufferedRows: 0,
    numericCellsAllocated: 120,
    peakBytesObservedOrBounded: 10_240,
    observationMethod: "exact-counters-and-conservative-byte-bound",
  }, targetFixture.compiled.diagnostics);
  const downloaded = await exportReferenceV2(projected);
  assert.deepEqual(decoded(downloaded.bytes), projected.executionProvenance.reference?.artifact);
});
