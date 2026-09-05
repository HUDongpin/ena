import assert from "node:assert/strict";
import test from "node:test";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import {
  exportCanonicalConfigV3,
  exportCurrentAnalysisV3,
  exportDraftV3,
  exportReferenceV2,
  exportStaleAuditV3,
} from "../lib/open-ena/export";
import { bindResultV3 } from "../lib/open-ena/model-v3/result-binding";
import { fitReferenceSourceV3 } from "../lib/open-ena/model-v3/reference-v2";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";

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
