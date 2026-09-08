import assert from "node:assert/strict";
import test from "node:test";
import { parseCsv } from "../lib/open-ena/csv";
import { readFile } from "node:fs/promises";
import { prepareTeachingSampleV3, SAMPLE_SOURCE_DESCRIPTORS_V3 } from "../lib/open-ena/sample-source-v3";
import { parseDeclaredSourceCellV3, prepareTypedCsvSourceV3, previewSourceTypesV3 } from "../lib/open-ena/source-preparation-v3";
import { parseXlsx } from "../lib/open-ena/spreadsheet";
import { sha256TextV3 } from "../lib/open-ena/model-v3/canonical-json";
import { compileStandardDraftV3 } from "../lib/open-ena/model-v3/compiler";
import { buildStandardExecutionPlanV3 } from "../lib/open-ena/model-v3/execution-plan";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";

test("CSV source typing is explicit and creates reuploadable typed XLSX bytes", async () => {
  const api = await import("../lib/open-ena/source-preparation-v3").catch(() => null);
  assert.ok(api, "explicit source-preparation boundary must exist");
  const text = 'id,order,A,B,C,note\n001,1,1,0,1,=1+1\n9007199254740993,2,0,1,1,text';
  const source = parseCsv(text, { name: "typed.csv", source: "upload" });
  const declarations = { id: "text", order: "number", A: "number", B: "number", C: "number", note: "text" } as const;
  const result = await api.prepareTypedCsvSourceV3(text, source, declarations, new Date("2026-09-06T00:00:00.000Z"));
  assert.equal(result.dataset.rows[0].id, "001");
  assert.equal(result.dataset.rows[1].id, "9007199254740993");
  assert.equal(result.dataset.rows[0].note, "=1+1");
  assert.equal(result.dataset.rows[0].A, 1);
  assert.equal(result.dataset.hashKind, "canonical-first-xlsx-worksheet-v1-sha256");
  assert.ok(result.bytes.byteLength > 0);
  assert.equal(result.receipt.derivative.bytesSha256, (await import("node:crypto")).createHash("sha256").update(new Uint8Array(result.bytes)).digest("hex"));
  const reuploaded = await parseXlsx(result.bytes, { name: "downloaded.xlsx", source: "upload" });
  assert.equal(await sha256TextV3(reuploaded.normalizedText), result.datasetSha256);
  assert.deepEqual(reuploaded.dataset.rows, result.dataset.rows);
});

test("explicit source conversion preserves missing values and rejects corrupt, mixed and precision-losing tokens", () => {
  for (const value of ["", " 1", "+1", "01", "1junk", "1e400", "1e-4000", "9007199254740993", "false", "Infinity", "NaN"]) {
    assert.throws(() => parseDeclaredSourceCellV3(value, "number"), TypeError, value);
  }
  assert.equal(parseDeclaredSourceCellV3(null, "number"), null);
  assert.equal(parseDeclaredSourceCellV3("0.125", "number"), 0.125);
  assert.equal(parseDeclaredSourceCellV3("-1", "number"), -1, "typing does not clean invalid scientific negatives");
  assert.equal(parseDeclaredSourceCellV3("false", "boolean"), false);
  assert.throws(() => parseDeclaredSourceCellV3("0", "boolean"));
  assert.throws(() => parseDeclaredSourceCellV3("true", "number"));
  assert.equal(parseDeclaredSourceCellV3("9007199254740993", "text"), "9007199254740993");
});

test("bounded error samples retain truthful per-column invalid state", () => {
  const rows = Array.from({ length: 25 }, (_value, index) => ({ first: `bad-${index}`, later: index === 24 ? "also-bad" : "1" }));
  const preview = previewSourceTypesV3({ name: "errors.csv", headers: ["first", "later"], rows, sizeBytes: 1, source: "upload" }, { first: "number", later: "number" });
  assert.equal(preview.errors.length, 20, "global evidence remains bounded");
  assert.equal(preview.columns[0].errorCount, 25);
  assert.equal(preview.columns[1].errorCount, 1);
  assert.deepEqual(preview.columns[1].errorCodes, ["number-token-required"]);
});

for (const kind of ["endpoint", "trajectory"] as const) test(`the actual ${kind} CSV teaching file reaches the strict native model through a genuine typed source`, async () => {
  const text = await readFile(`public${SAMPLE_SOURCE_DESCRIPTORS_V3[kind].url}`, "utf8");
  const prepared = await prepareTeachingSampleV3(text, kind, new Date("2026-09-06T00:00:00.000Z"));
  const compiled = await compileStandardDraftV3(prepared.dataset, prepared.datasetSha256, prepared.drafts.standard);
  assert.equal(compiled.status, "ready", compiled.diagnostics.map((entry) => entry.id).join(", "));
  if (compiled.status !== "ready") return;
  const plan = await buildStandardExecutionPlanV3({ dataset: prepared.dataset, datasetSha256: prepared.datasetSha256, compileResult: compiled, reference: null });
  const runtime = runStandardPlanV3(plan);
  assert.ok(runtime.set.points.length > 0);
  assert.equal(plan.header.datasetHashKind, "canonical-first-xlsx-worksheet-v1-sha256");
  assert.equal(plan.header.datasetSha256, prepared.datasetSha256);
  assert.notEqual(prepared.datasetSha256, SAMPLE_SOURCE_DESCRIPTORS_V3[kind].sha256);
  if (kind === "trajectory") assert.equal(plan.horizonOrdering.type, "trajectory-horizon-order");
  await assert.rejects(prepareTeachingSampleV3(text + "\n", kind, new Date()));
});


test("the versioned native trajectory sample shares Period Horizons while preserving per-Unit Conversation counts", async () => {
  const { bindResultV3 } = await import("../lib/open-ena/model-v3/result-binding");
  const { presentBoundResultV3 } = await import("../lib/open-ena/bound-presentation-v3");
  const text = await readFile("public/data/academy/ena-2d-trajectory-teaching-sample.csv", "utf8");
  const prepared = await prepareTeachingSampleV3(text, "trajectory", new Date("2026-09-06T00:00:00.000Z"));
  assert.deepEqual(prepared.drafts.standard.horizonColumns, ["Period"]);
  assert.deepEqual(prepared.drafts.standard.unitColumns, ["Group", "Speaker"]);
  const results: Array<{ result: Awaited<ReturnType<typeof bindResultV3>>; observations: Array<{ key: string; point: Record<string, unknown>; counts: unknown[]; weights: unknown[] }>; axes: string[] }> = [];
  for (const horizonColumns of [["Group", "Speaker", "Period"], ["Period"]]) {
    const compiled = await compileStandardDraftV3(prepared.dataset, prepared.datasetSha256, { ...prepared.drafts.standard, horizonColumns });
    if (compiled.status !== "ready") throw new Error(compiled.diagnostics.map((value) => value.id).join(","));
    const plan = await buildStandardExecutionPlanV3({ dataset: prepared.dataset, datasetSha256: prepared.datasetSha256, compileResult: compiled, reference: null });
    const result = await bindResultV3(plan, runStandardPlanV3(plan), { processedRows: plan.rows.length, maximumBufferedRows: 0, numericCellsAllocated: 120, peakBytesObservedOrBounded: 10240, observationMethod: "exact-counters-and-conservative-byte-bound" }, compiled.diagnostics);
    const periods = new Map(result.executionProvenance.identityDictionary.horizons.map((value) => [value.displayLabel, value.fields.find((field) => field.column === "Period")!.value.value]));
    const observations = result.set.points.map((point, index) => ({ key: JSON.stringify([point.Unit, periods.get(String(point.Horizon))]), point, counts: result.set.adjacencyKey.map((edge) => result.set.connectionCounts[index][edge.name]), weights: result.set.adjacencyKey.map((edge) => result.set.lineWeights[index][edge.name]) })).sort((a, b) => a.key.localeCompare(b.key));
    results.push({ result, observations, axes: presentBoundResultV3(result).result.dimensions });
  }
  assert.equal(results[0].result.executionProvenance.identityDictionary.horizons.length, 18);
  assert.equal(results[1].result.executionProvenance.identityDictionary.horizons.length, 3);
  assert.equal(results[1].observations.length, 18);
  assert.notEqual(results[0].result.binding.configurationSha256, results[1].result.binding.configurationSha256);
  assert.deepEqual(results[0].axes, ["SVD1", "SVD2", "SVD3"]);
  assert.deepEqual(results[1].axes, results[0].axes);
  for (let index = 0; index < results[0].observations.length; index++) {
    const a = results[0].observations[index], b = results[1].observations[index];
    assert.equal(a.key, b.key); assert.deepEqual(a.counts, b.counts); assert.deepEqual(a.weights, b.weights);
    for (const axis of results[0].axes) assert.ok(Math.abs(Number(a.point[axis]) - Number(b.point[axis])) < 1e-12, "direct retained-coordinate comparison without sign alignment");
  }
  const a = results[0].result, b = results[1].result;
  for (const axis of a.executionProvenance.projection.estimableAxes) {
    const column = a.set.rotation.rotationColumns.indexOf(axis);
    for (let edge = 0; edge < a.set.rotation.rotationMatrix.length; edge++) assert.ok(Math.abs(a.set.rotation.rotationMatrix[edge][column] - b.set.rotation.rotationMatrix[edge][column]) < 1e-12);
    assert.ok(Math.abs(a.set.variance[axis] - b.set.variance[axis]) < 1e-12);
  }
  // Least-squares node placement is less numerically stable than projected
  // observations. Record a 1e-6 absolute display tolerance, without aligning,
  // reflecting or comparing the unidentifiable zero-eigenvalue nullspace.
  for (let node = 0; node < a.set.rotation.nodes!.length; node++) for (const axis of results[0].axes)
    assert.ok(Math.abs(Number(a.set.rotation.nodes![node][axis]) - Number(b.set.rotation.nodes![node][axis])) < 1e-6);
});
