import assert from "node:assert/strict";
import test from "node:test";
import { parseCsv } from "../lib/open-ena/csv";
import { prepareTypedCsvSourceV3 } from "../lib/open-ena/source-preparation-v3";
import { compileOnaDraftV3 } from "../lib/open-ena/model-v3/compiler";
import { buildOnaExecutionPlanV3 } from "../lib/open-ena/model-v3/ona-adapter";
import { estimateOnaOperationalAdmissionV3 } from "../lib/open-ena/model-v3/ona-resource-budget";
import { MAX_ESTIMATED_STRUCTURAL_BYTES_V3 } from "../lib/open-ena/model-v3/resource-budget";
import type { OrderedNetworkDraftV3 } from "../lib/open-ena/model-v3/types";

const codes = ["A", "B", "C"];
const draft: OrderedNetworkDraftV3 = {
  unitColumns: ["unit"], horizonColumns: ["horizon"], groupColumn: null, codes,
  backward: { kind: "finite", value: 1 },
  rowOrder: { kind: "columns", keys: [{ column: "turn", direction: "ascending", comparator: { type: "number" } }] },
  directionalMask: { schemaVersion: 1, codeOrder: codes, enabled: codes.map(() => codes.map(() => true)) },
};

async function compileCsv(labelLength: number) {
  const csv = "unit,horizon,turn,A,B,C\n" + Array.from({ length: 6 }, (_, index) =>
    `${"u".repeat(labelLength)}${index},h,${index},${index % 2 + 1},${(index + 1) % 2 + 1},${index % 3 + 1}`,
  ).join("\n");
  // The real upload parser and explicit typed worksheet preparation preserve
  // identities while converting only the declared order and Code columns.
  // Even the rejected fixture is only 1.8 MB and uses a 6-by-9 model matrix.
  const source = parseCsv(csv, { name: "ona-operational-admission.csv", source: "upload" });
  const { dataset, datasetSha256 } = await prepareTypedCsvSourceV3(csv, source,
    { unit: "text", horizon: "text", turn: "number", A: "number", B: "number", C: "number" },
    new Date("2026-10-11T00:00:00.000Z"));
  const result = await compileOnaDraftV3(dataset, datasetSha256, draft);
  return { dataset, datasetSha256, result, sourceBytes: source.sizeBytes };
}

test("ONA compiler rejects an upload that passes its baseline but exceeds operational serialization admission", async () => {
  const { dataset, result, sourceBytes } = await compileCsv(300_000);
  assert.equal(sourceBytes, 1_800_095);
  assert.equal(dataset.rows.length, 6);
  assert.equal(result.status, "invalid");
  assert.deepEqual(result.diagnostics.map(entry => entry.id), ["ONA_RESOURCE_BUDGET_EXCEEDED"]);
  assert.ok(result.diagnostics[0].blocks.includes("build-model"));
  assert.equal(result.canonicalConfiguration, null);
});

test("ONA compiler keeps ordinary uploaded labels ready for actual plan construction", async () => {
  const { dataset, datasetSha256, result } = await compileCsv(8);
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  const plan = await buildOnaExecutionPlanV3(dataset, datasetSha256, result.canonicalConfiguration);
  assert.deepEqual(plan.header.resourceEstimate, result.resourceEstimate);
  assert.equal(result.capabilityStatus["build-model"], "available");
});

test("ONA compiler agrees with the existing operational cap on nearby admitted and rejected label lengths", async () => {
  // v2 also charges source proof serialization against the unchanged cap.
  const admitted = await compileCsv(240_000);
  assert.equal(admitted.result.status, "ready");
  if (admitted.result.status !== "ready") return;
  const ledger = estimateOnaOperationalAdmissionV3(admitted.dataset, admitted.result.canonicalConfiguration, admitted.result.resourceEstimate);
  assert.ok(ledger.totalStructuralBytes <= MAX_ESTIMATED_STRUCTURAL_BYTES_V3);
  assert.ok(ledger.totalStructuralBytes > 0.95 * MAX_ESTIMATED_STRUCTURAL_BYTES_V3);
  const rejected = await compileCsv(260_000);
  assert.equal(rejected.result.status, "invalid");
  assert.deepEqual(rejected.result.diagnostics.map(entry => entry.id), ["ONA_RESOURCE_BUDGET_EXCEEDED"]);
});
