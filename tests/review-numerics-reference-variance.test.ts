import assert from "node:assert/strict";
import test from "node:test";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import { compileStandardDraftV3 } from "../lib/open-ena/model-v3/compiler";
import { buildStandardExecutionPlanV3 } from "../lib/open-ena/model-v3/execution-plan";
import { bindReferenceToTargetV3, buildReferenceV2, fitReferenceSourceV3 } from "../lib/open-ena/model-v3/reference-v2";
import { bindResultV3, validateBoundResultV3 } from "../lib/open-ena/model-v3/result-binding";
import type { OpenEnaStandardReferenceV2, StandardEnaDraftV3 } from "../lib/open-ena/model-v3/types";
import type { ParsedDataset } from "../lib/open-ena/types";

const sourceHash = "a".repeat(64), targetHash = "b".repeat(64);

function draft(reference?: OpenEnaStandardReferenceV2): StandardEnaDraftV3 {
  return {
    unitColumns: ["unit"], horizonColumns: ["horizon"], groupColumn: null, codes: ["A", "B", "C", "D"],
    weighting: "frequency", model: "EndPoint", windowType: "Conversation",
    movingStanza: { backward: { kind: "finite", value: 1 }, forward: { kind: "finite", value: 0 }, rowOrder: null },
    horizonOrder: { kind: "columns", keys: [{ column: "time", direction: "ascending", comparator: { type: "number" } }] },
    rotation: reference
      ? { type: "reference", referenceId: reference.referenceId, expectedContentSha256: reference.contentSha256 }
      : { type: "svd", centerAlignToOrigin: true },
  };
}

async function compile(dataset: ParsedDataset, hash: string, reference?: OpenEnaStandardReferenceV2) {
  const compiled = await compileStandardDraftV3(dataset, hash, draft(reference));
  assert.equal(compiled.status, "ready", compiled.diagnostics.map(entry => entry.id).join(", "));
  if (compiled.status !== "ready") throw new Error("Expected a ready synthetic Reference fixture");
  const plan = await buildStandardExecutionPlanV3({
    dataset, datasetSha256: hash, compileResult: compiled,
    reference: reference ? await bindReferenceToTargetV3(reference, compiled.canonicalConfiguration) : null,
  });
  return { plan, compiled };
}

async function referenceFixture() {
  const source: ParsedDataset = {
    name: "synthetic-reference.csv", source: "upload", sizeBytes: 2048,
    headers: ["unit", "horizon", "time", "A", "B", "C", "D"],
    rows: [[1, 2, 1], [2, 1, 3], [1, 3, 1], [3, 1, 2], [1, 1, 4]].map(([A, B, C], index) => ({
      unit: `s${index}`, horizon: `h${index}`, time: index, A, B, C, D: 0,
    })),
  };
  // D is a real selected Code, but its isolated horizon creates no D edge.
  source.rows.push({ unit: "s0", horizon: "isolated-D", time: 10, A: 0, B: 0, C: 0, D: 1 });
  const { plan } = await compile(source, sourceHash);
  const reference = await buildReferenceV2(await fitReferenceSourceV3(plan), { displayName: "Synthetic reference", currentPlan: plan });
  assert.equal(reference.fit.rank, 3);
  return { source, reference };
}

for (const constant of [false, true]) {
  test(`Reference binding preserves ${constant ? "zero variance of constant targets" : "tiny variation along the full fixed basis"}`, async () => {
    const { source, reference } = await referenceFixture();
    const target: ParsedDataset = {
      ...source, name: "synthetic-target.csv",
      rows: Array.from({ length: 6 }, (_, index) => ({
        unit: `t${index}`, horizon: `h${index}`, time: index, A: 1, B: 1, C: 0, D: (constant ? 3 : index + 1) * 1e-200,
      })),
    };
    // C stays present without changing any target's co-occurrence geometry.
    for (let index = 0; index < 6; index += 1) {
      target.rows.push({ unit: `t${index}`, horizon: `isolated-C-${index}`, time: 10 + index, A: 0, B: 0, C: 1, D: 0 });
    }
    const { plan, compiled } = await compile(target, targetHash, reference);
    const runtime = runStandardPlanV3(plan);
    assert.equal(runtime.projection.rank, 0, "The existing target rank admission must remain unchanged");
    assert.deepEqual(runtime.set.rotation, plan.reference!.rotationSet);
    assert.deepEqual(runtime.projection.estimableAxes, reference.fit.estimableAxes);
    const shares = Object.values(runtime.set.variance);
    if (constant) assert.deepEqual(shares, [0, 0, 0, 0, 0, 0]);
    else {
      assert.deepEqual(shares.slice(0, 3), [0, 0, 0]);
      assert.ok(Math.abs(shares[3] - 0.5) < 1e-14);
      assert.ok(Math.abs(shares[4] - 0.5) < 1e-14);
      assert.equal(shares[5], 0);
    }
    const bound = await bindResultV3(plan, runtime, {
      processedRows: plan.rows.length, maximumBufferedRows: 0,
      numericCellsAllocated: plan.operationalAdmission.totalNumericCells,
      peakBytesObservedOrBounded: plan.operationalAdmission.totalPeakBytes,
      observationMethod: "exact-counters-and-conservative-byte-bound",
    }, compiled.diagnostics);
    assert.deepEqual(bound.set.variance, runtime.set.variance);
    assert.deepEqual((await validateBoundResultV3(structuredClone(bound), plan)).set.variance, runtime.set.variance);
  });
}
