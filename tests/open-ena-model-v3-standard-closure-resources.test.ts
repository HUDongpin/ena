import assert from "node:assert/strict";
import test from "node:test";
import { Session } from "node:inspector/promises";
import { canonicalJsonV3, sha256CanonicalJsonV3 } from "../lib/open-ena/model-v3/canonical-json";
import { validateExecutionPlanV3 } from "../lib/open-ena/model-v3/execution-plan";
import { compileStandardDraftV3 } from "../lib/open-ena/model-v3/compiler";
import { validateStandardDraftV3 } from "../lib/open-ena/model-v3/diagnostics";
import { canonicalJsonByteLengthV3, estimateStandardOperationalAdmissionV3, estimateReferenceBoundSerializationAdmissionV3, estimateStandardPlanSerializationAdmissionV3, assertCombinedStandardResourcesV3 } from "../lib/open-ena/model-v3/standard-closure-resource-budget";
import { buildReferenceV2, fitReferenceSourceV3 } from "../lib/open-ena/model-v3/reference-v2";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";
import type { ParsedDataset } from "../lib/open-ena/types";
import type { StandardEnaDraftV3 } from "../lib/open-ena/model-v3/types";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import { bindResultV3, scientificResultHashPayloadV3, validateBoundResultV3 } from "../lib/open-ena/model-v3/result-binding";

test("source and full-plan budgets charge every repeated long Code key before JSON encoding", async () => {
  const { plan, compiled } = await bindingFixtureV3(undefined, (draft, data) => {
    const rename = new Map(draft.codes.map((code) => [code, code.repeat(3000)]));
    draft.codes = draft.codes.map((code) => rename.get(code)!);
    data.headers = data.headers.map((key) => rename.get(key) ?? key);
    const source = data.rows;
    data.rows = Array.from({ length: 1000 }, (_, index) => Object.fromEntries(Object.entries(source[index % source.length]).map(([key, value]) => [rename.get(key) ?? key, value])));
    data.sizeBytes = 20_000;
  });
  const { sourceProofSha256: _hash, ...source } = plan.sourceProof;
  const actualSourceBytes = Buffer.byteLength(canonicalJsonV3(source));
  const actualPlanBytes = Buffer.byteLength(canonicalJsonV3(plan));
  assert.ok(actualPlanBytes > 9_000_000, "small uploaded source expands through repeated field names");
  assert.equal(compiled.operationalAdmission.sourceProofJsonBytes, actualSourceBytes);
  assert.equal(plan.operationalAdmission.sourceProofSerializationBytes, 8 * actualSourceBytes);
  assert.ok(plan.planSerializationAdmission.planJsonBytesUpper >= actualPlanBytes);
  assert.ok(plan.planSerializationAdmission.planJsonBytesUpper - actualPlanBytes < 32, "fixed-width self wrapper is tight and nonrecursive");
  assert.equal(canonicalJsonV3((await validateExecutionPlanV3(plan)).operationalAdmission), canonicalJsonV3(compiled.operationalAdmission));
});

test("JSON byte counter handles repeated aliases, escapes and paired or unpaired Unicode surrogates", () => {
  for (const value of ["中", "😀", "\ud800", "\udc00", "\ud800\udc00", "\u2028\u2029", "\u0000\b\n\t\r\f\"\\"]) {
    const shared = { [value.repeat(11)]: [value, -0, 1e-300, 1e300] };
    const input = { first: shared, second: shared, third: [shared] };
    const actual = Buffer.byteLength(canonicalJsonV3(input));
    assert.equal(canonicalJsonByteLengthV3(input, actual), actual);
    assert.throws(() => canonicalJsonByteLengthV3(input, actual - 1), /serialization|admission/i);
  }
});

test("unknown plans reject forged operational and serialization declarations before hashing", async () => {
  const { plan } = await bindingFixtureV3();
  for (const field of ["closureWorkUnits", "sourceProofJsonBytes", "generatedTableKeyBytes", "totalPeakBytes"] as const) {
    const forged = structuredClone(plan);
    Object.assign(forged.operationalAdmission, { [field]: 0 });
    const { executionPlanSha256: _hash, ...header } = forged.header;
    Object.assign(forged.header, { executionPlanSha256: await sha256CanonicalJsonV3({ ...forged, header }) });
    await assert.rejects(() => validateExecutionPlanV3(forged), /admission|serialization/i);
  }
  const forged = structuredClone(plan);
  Object.assign(forged.planSerializationAdmission, { planJsonBytesUpper: 1, serializationPeakBytes: 8 });
  await assert.rejects(() => validateExecutionPlanV3(forged), /serialization admission/i);
});

test("unknown bound results reject actual excess text before complete scientific hashing", async () => {
  const { plan, compiled } = await bindingFixtureV3();
  const result = structuredClone(await bindResultV3(plan, runStandardPlanV3(plan), { processedRows: 5, maximumBufferedRows: 0, numericCellsAllocated: 120, peakBytesObservedOrBounded: 10240, observationMethod: "exact-counters-and-conservative-byte-bound" }, compiled.diagnostics));
  Object.assign(result.configuration, { excessText: "x".repeat(plan.operationalAdmission.totalExportBytes + 1) });
  Object.assign(result.binding, { scientificResultSha256: await sha256CanonicalJsonV3(scientificResultHashPayloadV3(result)) });
  await assert.rejects(() => validateBoundResultV3(result, plan), /serialization.*admission|export bytes/i);
});

test("Reference geometry and its JSON-occurrence supplement remain independent exact ledgers", async () => {
  for (const fit of ["svd", "means"] as const) {
    const { plan: source } = await bindingFixtureV3(undefined, (draft) => {
      if (fit === "means") draft.rotation = { type: "means", centerAlignToOrigin: true, negativeLevel: { type: "string", value: "Control" }, positiveLevel: { type: "string", value: "Treatment" } };
    });
    const reference = await buildReferenceV2(await fitReferenceSourceV3(source), { displayName: "Bound ledger", currentPlan: source });
    const { plan } = await bindingFixtureV3("b".repeat(64), (draft) => { draft.rotation = { type: "reference", referenceId: reference.referenceId, expectedContentSha256: reference.contentSha256 }; }, reference);
    const c = plan.codeDictionary.codes.length, e = c * (c - 1) / 2, d = Math.min(3, e), f = fit === "svd" ? e : 0;
    const old = plan.reference!.admission, supplement = plan.referenceSerializationAdmission!;
    assert.deepEqual(supplement, estimateReferenceBoundSerializationAdmissionV3(c, fit, old));
    assert.equal(supplement.scientificValueOccurrences, 3 * e * e + 6 * e + 3 * f + 3 * c * d);
    assert.equal(supplement.incrementalNumericCells, 0);
    assert.equal(supplement.incrementalPeakBytes, 8 * supplement.referencePayloadBytes);
    assert.equal(supplement.incrementalExportBytes, supplement.referencePayloadBytes - old.incrementalExportBytes);
    const combined = assertCombinedStandardResourcesV3(plan.operationalAdmission, old, supplement, plan.planSerializationAdmission);
    assert.equal(combined.estimatedNumericCells, plan.operationalAdmission.totalNumericCells + old.incrementalNumericCells);
    assert.equal(combined.estimatedPeakBytes, plan.operationalAdmission.totalPeakBytes + old.incrementalPeakBytes + supplement.incrementalPeakBytes + plan.planSerializationAdmission.serializationPeakBytes);
    const forged = structuredClone(plan);
    Object.assign(forged.reference!.admission, { incrementalExportBytes: 1 });
    Object.assign(forged, { referenceSerializationAdmission: estimateReferenceBoundSerializationAdmissionV3(c, fit, forged.reference!.admission) });
    Object.assign(forged, { planSerializationAdmission: estimateStandardPlanSerializationAdmissionV3(forged) });
    await assert.rejects(() => validateExecutionPlanV3(forged), /Reference admission/i);
  }
});

test("compiler rejects excessive repeated source text before its source proof hash", async () => {
  let dataset!: ParsedDataset, draft!: StandardEnaDraftV3;
  await bindingFixtureV3(undefined, (capturedDraft, capturedData) => { dataset = capturedData; draft = capturedDraft; });
  const rename = new Map(draft.codes.map((code) => [code, code.repeat(10_000)]));
  draft.codes = draft.codes.map((code) => rename.get(code)!);
  dataset.headers = dataset.headers.map((key) => rename.get(key) ?? key);
  const source = dataset.rows;
  dataset.rows = Array.from({ length: 2500 }, (_, index) => Object.fromEntries(Object.entries(source[index % source.length]).map(([key, value]) => [rename.get(key) ?? key, value])));
  dataset.sizeBytes = 20_000;
  const inspector = new Session();
  inspector.connect();
  try {
    await inspector.post("Profiler.enable");
    await inspector.post("Profiler.startPreciseCoverage", { callCount: true, detailed: true });
    const result = await compileStandardDraftV3(dataset, "a".repeat(64), draft);
    assert.equal(result.status, "invalid");
    assert.ok(result.diagnostics.some((entry) => entry.id === "RESOURCE_BUDGET_EXCEEDED"));
    const coverage = await inspector.post("Profiler.takePreciseCoverage");
    const calls = coverage.result.flatMap((script) => script.url.endsWith("/model-v3/diagnostics.ts") ? script.functions.filter((entry) => entry.functionName === "scientificNetworksV3") : []);
    assert.equal(calls.reduce((sum, entry) => sum + entry.ranges[0].count, 0), 0, "full source/closure admission must precede the source-network and rank allocations");
  } finally {
    await inspector.post("Profiler.stopPreciseCoverage");
    inspector.disconnect();
  }
});

for (const boundary of ["compiler", "diagnostics"] as const) {
  test(`${boundary} requires actual operational admission despite a prior scientific blocker`, async () => {
    let dataset!: ParsedDataset, draft!: StandardEnaDraftV3;
    await bindingFixtureV3(undefined, (capturedDraft, capturedData) => { dataset = capturedData; draft = capturedDraft; });
    for (const oversized of [false, true]) {
      const source = structuredClone(dataset), configuration = structuredClone(draft);
      if (oversized) {
        const rename = new Map(configuration.codes.map((code) => [code, code.repeat(10_000)]));
        configuration.codes = configuration.codes.map((code) => rename.get(code)!);
        source.headers = source.headers.map((key) => rename.get(key) ?? key);
        source.sizeBytes = 20_000;
        source.rows = Array.from({ length: 2500 }, (_, index) => ({
          unit: `u${index}`, horizon: "h1", time: 1, group: index % 2 ? "Control" : "Treatment",
          ...Object.fromEntries(configuration.codes.map((code, column) => [code, index % 3 === column ? 1 : 0])),
        }));
      }
      const binding = { hashKind: "normalized-utf8-csv-text-sha256" as const, normalizedTableSha256: "a".repeat(64), rowCount: source.rows.length, headerSha256: await sha256CanonicalJsonV3(source.headers) };
      const inspector = new Session();
      inspector.connect();
      try {
        await inspector.post("Profiler.enable");
        await inspector.post("Profiler.startPreciseCoverage", { callCount: true, detailed: true });
        const diagnostics = boundary === "compiler"
          ? (await compileStandardDraftV3(source, binding.normalizedTableSha256, configuration)).diagnostics
          : validateStandardDraftV3(source, binding, configuration);
        const coverage = await inspector.post("Profiler.takePreciseCoverage");
        const calls = (name: string) => coverage.result.flatMap((script) => script.url.includes("/model-v3/") ? script.functions.filter((entry) => entry.functionName === name) : []).reduce((sum, entry) => sum + entry.ranges[0].count, 0);
        if (oversized) {
          assert.ok(diagnostics.some((entry) => entry.id === "STANDARD_NO_GLOBAL_COOCCURRENCE"), "retain the original scientific classification");
          assert.equal(calls("scientificNetworksV3"), 0, "blocked source cannot bypass mandatory admission");
          assert.equal(calls("admitStandardDraftScienceV3"), 1);
          assert.ok(diagnostics.some((entry) => entry.id === "RESOURCE_BUDGET_EXCEEDED"));
        } else {
          assert.equal(diagnostics.some((entry) => entry.blocks.includes("build-model")), false);
          assert.equal(calls("admitStandardDraftScienceV3"), 1);
          assert.equal(calls("scientificNetworksV3"), 1, "admitted valid control still computes its real evidence once");
        }
      } finally {
        await inspector.post("Profiler.stopPreciseCoverage");
        inspector.disconnect();
      }
    }
  });
}
