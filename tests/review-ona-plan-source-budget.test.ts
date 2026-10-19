import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { compileOnaDraftV3 } from "../lib/open-ena/model-v3/compiler";
import { buildOnaExecutionPlanV3 } from "../lib/open-ena/model-v3/ona-adapter";
import { onaSourceBudgetFixture } from "./helpers/review-ona-source-budget-fixture";
import { onaExecutionPlanHashPayloadV3, validateOnaExecutionPlanV3, runOnaPlanV3 } from "../lib/open-ena/model-v3/ona-adapter";
import { bindOnaResultV3 } from "../lib/open-ena/model-v3/ona-result-binding";
import { validateBoundResultV3 } from "../lib/open-ena/model-v3/result-binding";
import { buildAnalysisBundleV3, parseAnalysisBundleV3 } from "../lib/open-ena/analysis-bundle-v3";
import { canonicalJsonV3, sha256CanonicalJsonV3 } from "../lib/open-ena/model-v3/canonical-json";

for (const kind of ["short", "ascii-wide", "unicode-wide", "wide-codes", "long-name"] as const) test(`ONA ready plan and actual result round-trip with ${kind} source metadata`, async () => {
  const fixture = await onaSourceBudgetFixture(kind);
  assert.equal(fixture.compiled.status, "ready");
  const plan = await fixture.plan();
  assert.equal(canonicalJsonV3(await validateOnaExecutionPlanV3(plan)), canonicalJsonV3(plan));
  const a = plan.operationalAdmission;
  assert.equal(a.version, "open-ena-ona-operational-v2");
  if (a.version !== "open-ena-ona-operational-v2") throw new Error("New plans must carry source admission");
  assert.equal(a.sourceProofJsonBytes, Buffer.byteLength(canonicalJsonV3(plan.sourceProof)));
  assert.ok(a.sourceProofCaptureBytes > a.sourceProofJsonBytes);
  assert.equal(a.sourceProofSerializationBytes, 8 * a.sourceProofCaptureBytes);
  const result = await bindOnaResultV3(plan, runOnaPlanV3(plan), { processedRows: plan.rows.length, maximumRetainedRowsAfterChunk: 0, bufferedRowsPeakUpperBound: 1, numericCellsUpperBound: a.totalNumericCells, peakBytesUpperBound: a.totalPeakBytes, observationMethod: "dimension-bounds-and-chunk-boundary-stream-state" });
  assert.deepEqual(await validateBoundResultV3(result, plan), result);
  const bundle = await buildAnalysisBundleV3(result, { expectedPlan: plan });
  assert.deepEqual(await parseAnalysisBundleV3(canonicalJsonV3(bundle), { expectedPlan: plan }), bundle);
});

test("fixed pre-fix v1 plan, bound result and portable artifact retain hashes and meaning", async () => {
  const { plan, result, bundle } = JSON.parse(readFileSync(new URL("./fixtures/open-ena/review-ona-operational-v1.json", import.meta.url), "utf8"));
  assert.equal(plan.operationalAdmission.version, "open-ena-ona-operational-v1");
  assert.equal(canonicalJsonV3(await validateOnaExecutionPlanV3(plan)), canonicalJsonV3(plan));
  assert.deepEqual(await validateBoundResultV3(result, plan), result);
  assert.deepEqual(await parseAnalysisBundleV3(canonicalJsonV3(bundle)), bundle);
  assert.deepEqual(await parseAnalysisBundleV3(canonicalJsonV3(bundle), { expectedPlan: plan }), bundle);
});

test("ONA plan rejects an unknown budget version and rehashed under-declaration", async () => {
  const plan = await (await onaSourceBudgetFixture()).plan();
  for (const mutate of [(p: typeof plan) => Object.assign(p.operationalAdmission, { version: "open-ena-ona-operational-v999" }), (p: typeof plan) => Object.assign(p.operationalAdmission, { totalExportBytes: p.operationalAdmission.totalExportBytes - 1 }), (p: typeof plan) => Object.assign(p.operationalAdmission, { sourceProofJsonBytes: 0 }), (p: typeof plan) => Object.assign(p.operationalAdmission, { sourceProofCaptureBytes: 0 }), (p: typeof plan) => Object.assign(p.operationalAdmission, { sourceProofSerializationBytes: 0 })]) {
    const changed = structuredClone(plan); mutate(changed);
    Object.assign(changed.header, { executionPlanSha256: await sha256CanonicalJsonV3(onaExecutionPlanHashPayloadV3(changed)) });
    await assert.rejects(() => validateOnaExecutionPlanV3(changed));
  }
});

test("ONA source accounting preserves JSON escaping and rejects oversized source metadata at compiler and builder", async () => {
  const f = await onaSourceBudgetFixture();
  if (f.compiled.status !== "ready") throw new Error("fixture must be admitted");
  f.dataset.name = 'quote"\\nul\u0000lone\ud800emoji😀.xlsx';
  const plan = await buildOnaExecutionPlanV3(f.dataset, f.datasetSha256, f.compiled.canonicalConfiguration);
  if (plan.operationalAdmission.version !== "open-ena-ona-operational-v2") throw new Error("current admission required");
  assert.equal(plan.operationalAdmission.sourceProofJsonBytes, Buffer.byteLength(canonicalJsonV3(plan.sourceProof)));
  assert.equal(canonicalJsonV3(await validateOnaExecutionPlanV3(plan)), canonicalJsonV3(plan));
  f.dataset.name = "未".repeat(16_777_216) + ".xlsx";
  const rejected = await compileOnaDraftV3(f.dataset, f.datasetSha256, f.draft);
  assert.equal(rejected.status, "invalid");
  assert.deepEqual(rejected.diagnostics.map(d => d.id), ["ONA_RESOURCE_BUDGET_EXCEEDED"]);
  await assert.rejects(() => buildOnaExecutionPlanV3(f.dataset, f.datasetSha256, f.compiled.canonicalConfiguration!), /budget|admission/);
});
