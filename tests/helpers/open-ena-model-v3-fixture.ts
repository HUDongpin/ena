import assert from "node:assert/strict";
import { compileStandardDraftV3 } from "../../lib/open-ena/model-v3/compiler";
import { buildStandardExecutionPlanV3 } from "../../lib/open-ena/model-v3/execution-plan";
import type { OpenEnaStandardReferenceV2, StandardEnaDraftV3 } from "../../lib/open-ena/model-v3/types";
import { bindReferenceToTargetV3 } from "../../lib/open-ena/model-v3/reference-v2";
import type { ParsedDataset } from "../../lib/open-ena/types";
import type { StandardExecutionPlanV3 } from "../../lib/open-ena/model-v3/execution-plan";
import { canonicalJsonByteLengthV3, estimateStandardOperationalAdmissionV3, estimateReferenceBoundSerializationAdmissionV3, estimateStandardPlanSerializationAdmissionV3 } from "../../lib/open-ena/model-v3/standard-closure-resource-budget";
import { sha256CanonicalJsonV3 } from "../../lib/open-ena/model-v3/canonical-json";

/** Small adversarial fixtures deliberately compute hashes independently of the
 * production guarded serializer. Refresh honest derived declarations so the
 * intended deeper source/Reference mutation is what the validator rejects. */
export async function rehashStandardPlanForTestV3(plan: StandardExecutionPlanV3): Promise<void> {
  const { sourceProofSha256: _sourceHash, ...source } = plan.sourceProof;
  Object.assign(plan.sourceProof, { sourceProofSha256: await sha256CanonicalJsonV3(source) });
  Object.assign(plan, {
    operationalAdmission: estimateStandardOperationalAdmissionV3(plan.configuration, plan.header.resourceEstimate, canonicalJsonByteLengthV3(source)),
    referenceSerializationAdmission: plan.reference ? estimateReferenceBoundSerializationAdmissionV3(plan.codeDictionary.codes.length, plan.reference.sourceFit, plan.reference.admission) : null,
  });
  Object.assign(plan, { planSerializationAdmission: estimateStandardPlanSerializationAdmissionV3(plan) });
  const { executionPlanSha256: _planHash, ...header } = plan.header;
  Object.assign(plan.header, { executionPlanSha256: await sha256CanonicalJsonV3({ ...plan, header }) });
}

export async function bindingFixtureV3(hash = "a".repeat(64), modify?: (draft: StandardEnaDraftV3, data: ParsedDataset) => void, reference?: OpenEnaStandardReferenceV2) {
  const data: ParsedDataset = {
    name: "bound.csv", source: "upload", sizeBytes: 2048,
    headers: ["unit", "horizon", "time", "group", "A", "B", "C"],
    rows: [
      { unit: "u1", horizon: "h1", time: 1, group: "Control", A: 1, B: 2, C: 1 },
      { unit: "u2", horizon: "h1", time: 1, group: "Treatment", A: 2, B: 1, C: 3 },
      { unit: "u3", horizon: "h2", time: 2, group: "Control", A: 1, B: 3, C: 1 },
      { unit: "u4", horizon: "h2", time: 2, group: "Treatment", A: 3, B: 1, C: 2 },
      { unit: "u5", horizon: "h3", time: 3, group: "Other", A: 1, B: 1, C: 4 },
    ],
  };
  const draft: StandardEnaDraftV3 = {
    unitColumns: ["unit"], horizonColumns: ["horizon"], groupColumn: "group", codes: ["A", "B", "C"],
    weighting: "frequency", model: "EndPoint", windowType: "Conversation",
    movingStanza: { backward: { kind: "finite", value: 1 }, forward: { kind: "finite", value: 0 }, rowOrder: null },
    horizonOrder: { kind: "columns", keys: [{ column: "time", direction: "ascending", comparator: { type: "number" } }] },
    rotation: { type: "svd", centerAlignToOrigin: true },
  };
  modify?.(draft, data);
  const compiled = await compileStandardDraftV3(data, hash, draft);
  assert.equal(compiled.status, "ready", compiled.diagnostics.map((entry) => entry.id).join(", "));
  if (compiled.status !== "ready") throw new Error("Expected scientific readiness");
  const plan = await buildStandardExecutionPlanV3({ dataset: data, datasetSha256: hash, compileResult: compiled, reference: reference ? await bindReferenceToTargetV3(reference, compiled.canonicalConfiguration) : null });
  return { plan, compiled };
}
