import assert from "node:assert/strict";
import test from "node:test";
import type { ENASet, Row } from "jena-js";
import { analyzeDataset, buildOpenEnaAnalysisPlan } from "../lib/open-ena/analyze";
import { createDirectionalMask } from "../lib/open-ena/network-config";
import { buildOpenEnaOrderedAudit } from "../lib/open-ena/ordered-audit";
import { buildOpenEnaOrderedResponseNodeSummary } from "../lib/open-ena/ordered-node-summary";
import { SAMPLE_CONFIG, type OpenEnaConfig, type ParsedDataset } from "../lib/open-ena/types";
import { canonicalJsonV3, sha256TextV3 } from "../lib/open-ena/model-v3/canonical-json";
import { decodeCanonicalOnaConfigV3 } from "../lib/open-ena/model-v3/schema";
import { OPEN_ENA_RUNTIME_POLICY_VERSION_V3, OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3 } from "../lib/open-ena/model-v3/types";
import * as publicV3 from "../lib/open-ena/model-v3/index";
import { validateExecutionPlanV3 } from "../lib/open-ena/model-v3/execution-plan";
import { onaExecutionPlanHashPayloadV3 } from "../lib/open-ena/model-v3/ona-adapter";
import { sha256CanonicalJsonV3 } from "../lib/open-ena/model-v3/canonical-json";
import * as bindings from "../lib/open-ena/model-v3/result-binding";
import { createOpenEnaWorkerHost, type OpenEnaWorkerRequest, type OpenEnaWorkerResponse } from "../lib/open-ena/jena.worker";
import { createAccumulationStream, type AccumulationStream } from "jena-js";
import { estimateResultIdentityBytesV3 } from "../lib/open-ena/model-v3/compiler-dataset";
import { countOnaScientificCellsV3 } from "../lib/open-ena/model-v3/ona-result-binding";
import { fitReferenceSourceV3 } from "../lib/open-ena/model-v3/reference-v2";
import { analyzePlanInWorkerV3 } from "../lib/open-ena/client";
import { MAX_ESTIMATED_ROTATION_WORK_UNITS_V3 } from "../lib/open-ena/model-v3/resource-budget";

async function fixture(backward: number = 2, sourceOrder = false) {
  const codes = ["C", "A", "B"];
  const rows: Row[] = [
    { u: "u1", h: "z", t: 1, g: "g1", A: 2, B: 0, C: 1 },
    { u: "u3", h: "a", t: 1, g: "g1", A: 1, B: 1, C: 0 },
    { u: "u2", h: "z", t: 2, g: "g2", A: 0, B: 3, C: 1 },
    { u: "u1", h: "a", t: 2, g: "g1", A: 0, B: 2, C: 2 },
    { u: "u2", h: "m", t: 1, g: "g2", A: 1, B: 0, C: 3 },
  ];
  const headers = Object.keys(rows[0]);
  const csv = `${headers.join(",")}\n${rows.map((row) => headers.map((key) => row[key]).join(",")).join("\n")}\n`;
  const dataset: ParsedDataset = { name: "ona-v3-parity.csv", headers, rows, sizeBytes: new TextEncoder().encode(csv).byteLength, source: "upload" };
  const datasetSha256 = await sha256TextV3(csv);
  const directionalMask = createDirectionalMask(codes);
  directionalMask.enabled[0][1] = false;
  const legacyConfig: OpenEnaConfig = {
    ...SAMPLE_CONFIG, analysisKind: "ona", unitColumns: ["u"], conversationColumns: ["h"], groupColumn: "g", codes,
    model: "EndPoint", window: "MovingStanzaWindow", windowSizeBack: backward, windowSizeForward: 0,
    weightBy: "sum", rotation: "svd", centerAlignToOrigin: true, referenceRotationId: null,
    orderPolicy: sourceOrder ? { kind: "source-row", confirmed: true } : { kind: "columns", columns: ["t"], comparators: { t: "number" } }, directionalMask,
  };
  const configuration = decodeCanonicalOnaConfigV3({
    schemaVersion: 3, analysisFamily: "ona", contracts: { validationContractVersion: OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3, runtimePolicyVersion: OPEN_ENA_RUNTIME_POLICY_VERSION_V3 },
    units: { columns: ["u"], group: { type: "stable-metadata", column: "g" } }, horizons: { columns: ["h"] },
    codes: codes.map((column) => ({ column, displayLabel: column })), model: { type: "EndPoint" }, weighting: { type: "frequency", engineMethod: "sum" },
    window: { type: "MovingStanzaWindow", backward: Number.isFinite(backward) ? { kind: "finite", value: backward } : { kind: "infinity" }, forward: 0,
      rowOrder: sourceOrder ? { kind: "source-order-confirmed", confirmation: { kind: "explicit-researcher-confirmation", analysisFamily: "ona", datasetSha256, rowCount: rows.length, relevantColumns: ["h"], confirmedAt: "2026-09-05T00:00:00.000Z", confirmationVersion: 1 } } : { kind: "columns", keys: [{ column: "t", direction: "ascending", comparator: { type: "number" } }] } },
    rotation: { type: "svd", centerAlignToOrigin: true }, directionalMask,
  });
  return { dataset, datasetSha256, configuration, legacyConfig };
}

test("generic v3 plan boundary round-trips an immutable ONA plan and rederives every source-bound claim", async () => {
  const input = await fixture();
  const plan = await publicV3.buildOnaExecutionPlanV3(input.dataset, input.datasetSha256, input.configuration);
  const serialized: unknown = JSON.parse(canonicalJsonV3(plan));
  const validated = await validateExecutionPlanV3(serialized);
  assert.deepEqual(validated, plan);
  assert.ok(Object.isFrozen(validated) && Object.isFrozen(validated.rows[0].codeValues));
});

test("ONA source, runtime order, directional basis and resource tampering fail even after plan rehash", async () => {
  const input = await fixture();
  const plan = await publicV3.buildOnaExecutionPlanV3(input.dataset, input.datasetSha256, input.configuration);
  const mutations: Array<(draft: any) => void> = [
    (draft) => { draft.rows[0].codeValues[draft.codeDictionary.codes[0].token] = 9; },
    (draft) => { draft.rows[0].sourceRowIndex = 1; },
    (draft) => { draft.runtimeSourceRowIndices.reverse(); },
    (draft) => { draft.codeDictionary.codes.reverse(); },
    (draft) => { draft.codeDictionary.edges[0].responseIndex = 1; },
    (draft) => { draft.directionalMask.enabled[0][1] = true; },
    (draft) => { draft.header.resourceEstimate.estimatedNumericCells += 1; },
    (draft) => { draft.operationalAdmission.totalNumericCells += 1; },
    (draft) => { draft.operationalAdmission.closureWorkUnits -= 1; },
    (draft) => { draft.operationalAdmission.stages.scientificClosureCells -= 1; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(plan); mutate(changed);
    Object.assign(changed.header, { executionPlanSha256: await sha256CanonicalJsonV3(onaExecutionPlanHashPayloadV3(changed)) });
    await assert.rejects(() => validateExecutionPlanV3(changed), /ONA|family|contract|resource|source|order|mask/i);
  }
});

test("ONA rejects Standard-only fields and preserves true scientific family separation", async () => {
  const input = await fixture();
  const plan = await publicV3.buildOnaExecutionPlanV3(input.dataset, input.datasetSha256, input.configuration);
  for (const mutation of [
    (draft: any) => { draft.reference = {}; },
    (draft: any) => { draft.configuration.model.horizonOrder = input.configuration.window.rowOrder; },
    (draft: any) => { draft.configuration.window.forward = { kind: "finite", value: 1 }; },
    (draft: any) => { draft.configuration.rotation.type = "means"; },
    (draft: any) => { draft.configuration.weighting.type = "binary"; },
    (draft: any) => { draft.configuration.window.type = "Conversation"; },
  ]) {
    const changed = structuredClone(plan); mutation(changed);
    await assert.rejects(() => validateExecutionPlanV3(changed), /ONA|family|contract|shape|forward|Reference|rotation|model|window|weighting/i);
  }
});

test("ONA results bind complete directed science, audit, source summaries and conservative runtime observations", async () => {
  const input = await fixture(Infinity);
  const plan = await publicV3.buildOnaExecutionPlanV3(input.dataset, input.datasetSha256, input.configuration);
  const runtime = publicV3.runOnaPlanV3(plan);
  assert.equal(typeof publicV3.bindOnaResultV3, "function", "ONA result binder must exist");
  const bound = await publicV3.bindOnaResultV3(plan, runtime, {
    processedRows: plan.rows.length, maximumRetainedRowsAfterChunk: 0,
    bufferedRowsPeakUpperBound: 1, numericCellsUpperBound: plan.operationalAdmission.totalNumericCells,
    peakBytesUpperBound: plan.operationalAdmission.totalPeakBytes,
    observationMethod: "dimension-bounds-and-chunk-boundary-stream-state",
  });
  assert.equal(bound.configuration.analysisFamily, "ona");
  assert.equal(bound.set.networkType, "ordered");
  assert.equal(bound.set.functionParams.windowSizeBack, "Infinity");
  assert.equal(bound.set.rawRows.length, 0);
  assert.equal(bound.orderedAudit.edgeValues.length, input.dataset.rows.length);
  assert.equal(bound.capabilityStatus["export-reference"], "blocked");
  assert.equal(bound.capabilityStatus["group-inference"], "blocked");
  assert.equal(bound.capabilityStatus["build-model"], "available");
  assert.equal(bindings.resultMatchesPlanV3(bound, plan), true);
  assert.deepEqual(await bindings.validateBoundResultV3(JSON.parse(canonicalJsonV3(bound)), plan), bound);
  assert.ok(new TextEncoder().encode(canonicalJsonV3(bound)).byteLength <= plan.operationalAdmission.totalExportBytes);
});

function workerHost(onMessage?: (message: OpenEnaWorkerResponse, send: (request: OpenEnaWorkerRequest) => void) => void, create: typeof createAccumulationStream = createAccumulationStream) {
  let listener: (event: { data: OpenEnaWorkerRequest }) => void = () => {};
  const messages: OpenEnaWorkerResponse[] = [], streams: AccumulationStream[] = [];
  const send = (data: OpenEnaWorkerRequest) => listener({ data });
  createOpenEnaWorkerHost({ addEventListener(_type, callback) { listener = callback; }, postMessage(message) { messages.push(message); onMessage?.(message, send); } }, {
    createAccumulationStream(options) { const stream = create(options); streams.push(stream); return stream; },
  });
  return { send, streams, messages, async terminal() {
    const deadline = Date.now() + 3000;
    while (!messages.some((message) => ["error", "cancelled", "result-v3"].includes(message.kind)) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5));
    const terminal = messages.find((message) => ["error", "cancelled", "result-v3"].includes(message.kind));
    assert.ok(terminal, "production ONA worker must terminate"); return terminal;
  } };
}

test("production v3 worker executes isolated ONA once, retaining audits and truthful stage/resource provenance", async () => {
  const input = await fixture();
  const plan = await publicV3.buildOnaExecutionPlanV3(input.dataset, input.datasetSha256, input.configuration);
  const worker = workerHost(); worker.send({ kind: "run-open-ena-plan-v3", id: "ona-real", plan, chunkSize: 2 });
  const terminal = await worker.terminal();
  assert.equal(terminal.kind, "result-v3", terminal.kind === "error" ? terminal.message : "ONA must produce a bound result");
  if (terminal.kind !== "result-v3") return;
  assert.equal(worker.streams.length, 1);
  assert.ok(worker.streams[0].state.isDisposed);
  const result = await bindings.validateBoundResultV3(terminal.result, plan);
  assert.equal(result.orderedAudit.edgeValues.length, input.dataset.rows.length);
  assert.deepEqual([...new Set(worker.messages.flatMap((message) => message.kind === "progress-v3" ? [message.stage] : []))], ["verify-plan", "materialize", "accumulate", "normalize", "center", "rotate-or-project", "position-nodes", "validate-result", "complete"]);
});

test("active ONA cancellation disposes its only stream and publishes no partial result", async () => {
  const input = await fixture();
  const plan = await publicV3.buildOnaExecutionPlanV3(input.dataset, input.datasetSha256, input.configuration);
  const worker = workerHost((message, send) => { if (message.kind === "progress-v3" && message.stage === "accumulate" && message.progress > 0.1) send({ kind: "cancel", id: message.id }); });
  worker.send({ kind: "run-open-ena-plan-v3", id: "ona-cancel", plan, chunkSize: 1 });
  assert.equal((await worker.terminal()).kind, "cancelled");
  assert.equal(worker.streams.length, 1);
  assert.ok(worker.streams[0].state.isDisposed);
  assert.equal(worker.messages.some((message) => message.kind === "result-v3"), false);
});

test("ordered audit duplicate membership uses an indexed Set without changing any evidence", async () => {
  const input = await fixture();
  const set = analyzeDataset(input.dataset, input.legacyConfig).set;
  const expected = buildOpenEnaOrderedAudit(set);
  const original = Array.prototype.includes;
  try {
    Array.prototype.includes = function (value: unknown, start?: number) {
      if (typeof value === "number") throw new Error("quadratic response-row membership scan");
      return original.call(this, value, start);
    };
    assert.deepEqual(buildOpenEnaOrderedAudit(set), expected);
  } finally { Array.prototype.includes = original; }
  set.rowWindowProvenance![1].responseRowIndex = 0;
  assert.throws(() => buildOpenEnaOrderedAudit(set), /unique mapping/);
});

test("the ONA ledger counts actual full/compact containers and generated table keys with real CSV bytes", async () => {
  const base = await fixture();
  const codes = ["C", "A", "B", "D"], units = 120;
  const rows: Row[] = Array.from({ length: 2 * units }, (_, index) => ({ u: `unit-${Math.floor(index / 2)}`, h: "shared", t: index, g: `group-${Math.floor(index / 2) % 2}`,
    ...Object.fromEntries(codes.map((code, c) => [code, ((index * (c + 3)) % 31 + 1) / 7 + index / 10003])) }));
  const headers = Object.keys(rows[0]), csv = `${headers.join(",")}\n${rows.map((row) => headers.map((key) => row[key]).join(",")).join("\n")}\n`;
  const dataset = { ...base.dataset, headers, rows, sizeBytes: new TextEncoder().encode(csv).byteLength };
  const configuration = decodeCanonicalOnaConfigV3({ ...base.configuration, codes: codes.map((column) => ({ column, displayLabel: column })), directionalMask: createDirectionalMask(codes) });
  const plan = await publicV3.buildOnaExecutionPlanV3(dataset, await sha256TextV3(csv), configuration);
  const runtime = publicV3.runOnaPlanV3(plan), admission = plan.operationalAdmission;
  assert.equal(admission.generatedTableKeyBytes, 64 * (4 * units * 16 + 2 * units * 3 + 4 * 3));
  assert.equal(admission.resultIdentityBytes, estimateResultIdentityBytesV3(dataset, configuration));
  assert.equal(admission.numericSerializationBytes, 192 * admission.compactScientificCells);
  assert.equal(admission.metadataSerializationBytes, 8 * admission.resultIdentityBytes);
  assert.equal(admission.totalStructuralBytes, plan.header.resourceEstimate.estimatedStructuralBytes + admission.metadataSerializationBytes);
  assert.equal(admission.totalPeakBytes, Math.max(plan.header.resourceEstimate.estimatedPeakBytes,
    plan.header.resourceEstimate.estimatedWorkerMaterializationBytes + admission.totalStructuralBytes + 8 * admission.totalNumericCells + admission.numericSerializationBytes));
  assert.equal(plan.sourceProof.dataset.sizeBytes, new TextEncoder().encode(csv).byteLength);
  const full = countOnaScientificCellsV3(runtime.set, runtime.orderedAudit, runtime.orderedResponseNodeSummary);
  const compactSet = { ...runtime.set, rawRows: [], rowConnectionCounts: [], rowWindowProvenance: [], metaData: [] };
  const compact = countOnaScientificCellsV3(compactSet, runtime.orderedAudit, runtime.orderedResponseNodeSummary);
  assert.equal(full - compact, rows.length * (2 * codes.length + codes.length ** 2));
  assert.ok(compact <= admission.compactScientificCells);
  const result = await publicV3.bindOnaResultV3(plan, runtime, { processedRows: rows.length, maximumRetainedRowsAfterChunk: 1,
    bufferedRowsPeakUpperBound: 2, numericCellsUpperBound: admission.totalNumericCells, peakBytesUpperBound: admission.totalPeakBytes, observationMethod: "dimension-bounds-and-chunk-boundary-stream-state" });
  const actualBytes = new TextEncoder().encode(canonicalJsonV3(result)).byteLength;
  assert.ok(actualBytes <= admission.totalExportBytes, `${actualBytes} > ${admission.totalExportBytes}`);
  assert.equal(admission.totalExportBytes, Math.max(plan.header.resourceEstimate.estimatedExportBytes, admission.resultIdentityBytes + 24 * admission.compactScientificCells));
  assert.deepEqual(await bindings.validateBoundResultV3(JSON.parse(canonicalJsonV3(result)), plan), result);
});

test("ONA scientific source values reject nested arrays before their traversal", async () => {
  const input = await fixture(), plan = await publicV3.buildOnaExecutionPlanV3(input.dataset, input.datasetSha256, input.configuration);
  for (const sourceProof of [true, false]) {
    let visited = 0;
    const forbidden = new Proxy([], { ownKeys() { visited += 1; throw new Error("forbidden scientific array traversal"); } });
    const changed = structuredClone(plan);
    const values = sourceProof ? changed.sourceProof.rows[0].values : changed.rows[0].codeValues;
    Object.assign(values, { [sourceProof ? "C" : changed.codeDictionary.codes[0].token]: forbidden });
    await assert.rejects(() => validateExecutionPlanV3(changed));
    assert.equal(visited, 0, "a scientific scalar must reject before any nested array enumeration");
  }
});

test("ONA unknown bound empty tables reject wrong kinds before own-key enumeration", async () => {
  const input = await fixture(), plan = await publicV3.buildOnaExecutionPlanV3(input.dataset, input.datasetSha256, input.configuration);
  const result = await publicV3.bindOnaResultV3(plan, publicV3.runOnaPlanV3(plan), { processedRows: plan.rows.length, maximumRetainedRowsAfterChunk: 1,
    bufferedRowsPeakUpperBound: Math.min(plan.rows.length, plan.header.resourceEstimate.estimatedRetainedWindowRows + 1), numericCellsUpperBound: plan.operationalAdmission.totalNumericCells,
    peakBytesUpperBound: plan.operationalAdmission.totalPeakBytes, observationMethod: "dimension-bounds-and-chunk-boundary-stream-state" });
  let visited = 0;
  const forbidden = new Proxy({}, { ownKeys() { visited += 1; throw new Error("forbidden empty-table object traversal"); } });
  const changed = structuredClone(result); Object.assign(changed.set, { rawRows: forbidden });
  await assert.rejects(() => bindings.validateBoundResultV3(changed, plan));
  assert.equal(visited, 0);
});

for (const [name, vectors, rank, expectedWarnings] of [
  ["singleton", [[1, 1, 1]], 0, ["ONA_TARGET_RANK_ZERO"]],
  ["identical Units", [[1, 1, 1], [1, 1, 1]], 0, ["ONA_TARGET_RANK_ZERO"]],
  ["mixed zero-network Unit", [[1, 1, 1], [1, 0, 0], [0, 1, 1]], 1, ["ONA_ZERO_NETWORK_UNITS", "ONA_SVD_ONE_DIMENSIONAL"]],
  ["seven near-tolerance identical Units", Array.from({ length: 7 }, () => [1.1, 2.2, 3.3]), 0, ["ONA_TARGET_RANK_ZERO"]],
] as const) {
  test(`ONA preserves legacy descriptive ${name} without inventing estimable dimensions`, async () => {
    const input = await fixture(1);
    input.dataset.rows = vectors.map(([A, B, C], index) => ({ u: `u${index}`, h: `h${index}`, t: 1, g: "unused", A, B, C }));
    const config = { ...input.legacyConfig, groupColumn: null, directionalMask: createDirectionalMask(input.legacyConfig.codes) };
    const configuration = decodeCanonicalOnaConfigV3({ ...input.configuration, units: { columns: ["u"], group: { type: "none" } }, directionalMask: config.directionalMask });
    const legacy = analyzeDataset(input.dataset, config), legacyPlan = buildOpenEnaAnalysisPlan(input.dataset, config);
    const plan = await publicV3.buildOnaExecutionPlanV3(input.dataset, input.datasetSha256, configuration);
    if (vectors.length === 7) {
      assert.equal(plan.operationalAdmission.stages.accumulationCells, 729);
      assert.ok(63 + 189 + 252 <= plan.operationalAdmission.stages.accumulationCells, "native endpoint-finalization overlap must fit its named phase");
    }
    const runtime = publicV3.runOnaPlanV3(plan), restored = sourceRestoredSet(runtime.set, plan);
    for (const field of ["connectionCounts", "lineWeights", "pointsForProjection", "points", "centroids", "rotation", "variance"] as const) assert.deepEqual(restored[field], legacy.set[field], `${name}: ${field}`);
    assert.deepEqual({ ...runtime.orderedAudit, codeOrder: config.codes }, buildOpenEnaOrderedAudit(legacy.set));
    assert.deepEqual({ ...runtime.orderedResponseNodeSummary, codeOrder: config.codes }, buildOpenEnaOrderedResponseNodeSummary(legacyPlan.options.rows, config));
    const worker = workerHost(); worker.send({ kind: "run-open-ena-plan-v3", id: name, plan, chunkSize: 1 });
    const terminal = await worker.terminal();
    assert.equal(terminal.kind, "result-v3", terminal.kind === "error" ? terminal.message : name);
    if (terminal.kind !== "result-v3") return;
    const result = await bindings.validateBoundResultV3(terminal.result, plan);
    assert.equal(result.executionProvenance.projection.rank, rank);
    assert.equal(result.executionProvenance.projection.estimableAxes.length, rank);
    assert.deepEqual(result.executionProvenance.diagnostics.map((entry) => entry.id), expectedWarnings);
    assert.equal(result.capabilityStatus["build-model"], "available");
    assert.equal(result.capabilityStatus["export-current-model"], "available");
    assert.equal(result.capabilityStatus["group-inference"], "blocked");
    assert.deepEqual(result.set.variance, legacy.set.variance);
  });
}

test("typed composite Units and Group collisions stay distinct without appending Group to Unit identity", async () => {
  const input = await fixture();
  input.dataset.headers.push("part");
  const identities: Array<[number | string, string, number | string]> = [[1, "x.y", 1], ["1", "x.y", "1"], ["1.x", "y", 1]];
  input.dataset.rows = identities.map(([u, part, g], index) => ({ u, part, g, h: "shared", t: index, A: index + 1, B: 4 - index, C: 0.5 + index }));
  const configuration = decodeCanonicalOnaConfigV3({ ...input.configuration, units: { columns: ["u", "part"], group: { type: "stable-metadata", column: "g" } } });
  const plan = await publicV3.buildOnaExecutionPlanV3(input.dataset, input.datasetSha256, configuration);
  assert.equal(plan.identityDictionary.units.length, 3);
  assert.equal(plan.identityDictionary.groups.length, 2);
  assert.ok(plan.identityDictionary.units.every((entry) => entry.fields.length === 2 && entry.fields.every((field) => field.column !== "g")));
  const runtime = publicV3.runOnaPlanV3(plan);
  assert.equal(runtime.set.connectionCounts.length, 3);
  assert.equal(runtime.orderedResponseNodeSummary.groups.length, 2);
  assert.deepEqual(runtime.orderedResponseNodeSummary.groups.map((group) => group.unitCount).sort(), [1, 2]);
  const worker = workerHost(); worker.send({ kind: "run-open-ena-plan-v3", id: "typed", plan, chunkSize: 1 });
  const terminal = await worker.terminal(); assert.equal(terminal.kind, "result-v3", terminal.kind === "error" ? terminal.message : "typed ONA");
  if (terminal.kind === "result-v3") {
    const result = await bindings.validateBoundResultV3(terminal.result, plan);
    assert.equal(new Set(result.orderedResponseNodeSummary.groups.map((group) => group.name)).size, 2);
    assert.equal(new Set(result.set.unitLabels).size, 3);
  }
  await assert.rejects(() => fitReferenceSourceV3(plan), /Standard|shape|Reference|configuration/i);
});

test("a rehashed ONA result cannot enable a masked direction in aggregate or audit evidence", async () => {
  const input = await fixture(), plan = await publicV3.buildOnaExecutionPlanV3(input.dataset, input.datasetSha256, input.configuration);
  const result = await publicV3.bindOnaResultV3(plan, publicV3.runOnaPlanV3(plan), { processedRows: plan.rows.length, maximumRetainedRowsAfterChunk: 1,
    bufferedRowsPeakUpperBound: Math.min(plan.rows.length, plan.header.resourceEstimate.estimatedRetainedWindowRows + 1), numericCellsUpperBound: plan.operationalAdmission.totalNumericCells,
    peakBytesUpperBound: plan.operationalAdmission.totalPeakBytes, observationMethod: "dimension-bounds-and-chunk-boundary-stream-state" });
  const forbiddenEdge = plan.codeDictionary.edges.findIndex((edge) => !plan.directionalMask.enabled[edge.groundIndex][edge.responseIndex]);
  for (const audit of [false, true]) {
    const changed = structuredClone(result);
    if (audit) changed.orderedAudit.edgeValues[0][forbiddenEdge] = 1;
    else { changed.set.connectionCounts[0][changed.set.codeColumns[forbiddenEdge]] = 1; changed.set.connectionMatrix[0][forbiddenEdge] = 1; }
    Object.assign(changed.binding, { scientificResultSha256: await sha256CanonicalJsonV3(bindings.scientificResultHashPayloadV3(changed)) });
    await assert.rejects(() => bindings.validateBoundResultV3(changed, plan), /mask|disabled|direction/i);
  }
});

test("ONA early plan admission rejects impossible Code/audit cardinalities before array enumeration", async () => {
  const input = await fixture(), plan = await publicV3.buildOnaExecutionPlanV3(input.dataset, input.datasetSha256, input.configuration);
  let visited = 0;
  const impossible = new Proxy(new Array(1000), { ownKeys() { visited += 1; throw new Error("impossible Code enumeration"); } });
  const changed = structuredClone(plan); Object.assign(changed.configuration, { codes: impossible });
  await assert.rejects(() => validateExecutionPlanV3(changed), /resource|budget|rotation/i);
  assert.equal(visited, 0);
});

test("ONA runtime allocation overruns are terminal and dispose without a result", async () => {
  const input = await fixture(), plan = await publicV3.buildOnaExecutionPlanV3(input.dataset, input.datasetSha256, input.configuration);
  const worker = workerHost(undefined, (options) => createAccumulationStream({ ...options, onResources(state) { options.onResources?.({ ...state, numericCells: 25_000_001 }); } }));
  worker.send({ kind: "run-open-ena-plan-v3", id: "ona-overrun", plan, chunkSize: 1 });
  const terminal = await worker.terminal(); assert.equal(terminal.kind, "error");
  assert.match(terminal.kind === "error" ? terminal.message : "", /resource upper bound/);
  assert.ok(worker.streams.every((stream) => stream.state.isDisposed));
  assert.equal(worker.messages.some((message) => message.kind === "result-v3"), false);
});

test("ONA cancellation during asynchronous finalization retains no partial science", async () => {
  const input = await fixture(Infinity), plan = await publicV3.buildOnaExecutionPlanV3(input.dataset, input.datasetSha256, input.configuration);
  const worker = workerHost(undefined, (options) => {
    const stream = createAccumulationStream(options), finish = stream.finishAsync;
    assert.ok(finish);
    stream.finishAsync = (control) => finish.call(stream, { ...control, yieldControl: async () => {
      worker.send({ kind: "cancel", id: "ona-flush" }); await control.yieldControl();
    } });
    return stream;
  });
  worker.send({ kind: "run-open-ena-plan-v3", id: "ona-flush", plan, chunkSize: 1 });
  assert.equal((await worker.terminal()).kind, "cancelled");
  assert.ok(worker.streams[0].state.isDisposed);
  assert.equal(worker.messages.some((message) => message.kind === "result-v3"), false);
});

test("the shared v3 client validates real ONA delivery and terminates its owned worker", async () => {
  const input = await fixture(), plan = await publicV3.buildOnaExecutionPlanV3(input.dataset, input.datasetSha256, input.configuration);
  const original = globalThis.Worker;
  const instances: LoopbackWorker[] = [];
  class LoopbackWorker {
    onmessage: ((event: MessageEvent<OpenEnaWorkerResponse>) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    terminated = false;
    listener: (event: { data: OpenEnaWorkerRequest }) => void = () => {};
    constructor() {
      instances.push(this);
      createOpenEnaWorkerHost({ addEventListener: (_type, callback) => { this.listener = callback; }, postMessage: (message) => {
        queueMicrotask(() => { if (!this.terminated) this.onmessage?.({ data: message } as MessageEvent<OpenEnaWorkerResponse>); });
      } });
    }
    postMessage(data: OpenEnaWorkerRequest) { this.listener({ data }); }
    terminate() { this.terminated = true; }
  }
  globalThis.Worker = LoopbackWorker as unknown as typeof Worker;
  try {
    const result = await analyzePlanInWorkerV3(plan);
    assert.equal(result.configuration.analysisFamily, "ona");
    assert.equal(result.orderedAudit.edgeValues.length, plan.rows.length);
    assert.equal(result.binding.executionPlanSha256, plan.header.executionPlanSha256);
    assert.equal(instances.length, 1); assert.equal(instances[0].terminated, true);
  } finally { globalThis.Worker = original; }
});

test("ONA result admission checks exact Unit, edge, Code and axis dimensions before enumeration", async () => {
  const input = await fixture(), plan = await publicV3.buildOnaExecutionPlanV3(input.dataset, input.datasetSha256, input.configuration);
  const result = await publicV3.bindOnaResultV3(plan, publicV3.runOnaPlanV3(plan), { processedRows: plan.rows.length, maximumRetainedRowsAfterChunk: 1,
    bufferedRowsPeakUpperBound: Math.min(plan.rows.length, plan.header.resourceEstimate.estimatedRetainedWindowRows + 1), numericCellsUpperBound: plan.operationalAdmission.totalNumericCells,
    peakBytesUpperBound: plan.operationalAdmission.totalPeakBytes, observationMethod: "dimension-bounds-and-chunk-boundary-stream-state" });
  for (const field of ["connectionCounts", "connectionMatrix-row", "nodes", "rotationColumns", "eigenvalues", "centerVector"]) {
    let visited = 0;
    const length = field === "connectionCounts" ? plan.identityDictionary.units.length + 1 : field === "nodes" ? plan.codeDictionary.codes.length + 1 : plan.codeDictionary.edges.length + 1;
    const impossible = new Proxy(new Array(length), { ownKeys() { visited += 1; throw new Error(`unexpected ${field} enumeration`); } });
    const changed = structuredClone(result);
    if (field === "connectionCounts") Object.assign(changed.set, { connectionCounts: impossible });
    else if (field === "connectionMatrix-row") Object.assign(changed.set.connectionMatrix, { 0: impossible });
    else Object.assign(changed.set.rotation, { [field]: impossible });
    await assert.rejects(() => bindings.validateBoundResultV3(changed, plan));
    assert.equal(visited, 0, field);
  }
});

test("ONA binding/import ledger separately includes rank and readiness scratch before diagnostics allocate", async () => {
  const input = await fixture(), plan = await publicV3.buildOnaExecutionPlanV3(input.dataset, input.datasetSha256, input.configuration);
  const a = plan.operationalAdmission, n = plan.rows.length, u = plan.identityDictionary.units.length, c = plan.codeDictionary.codes.length, e = c * c;
  assert.equal(a.stages.rankDiagnosticCells, 4 * e * e + 4 * u * e + 8 * e);
  const d = Math.min(3, e);
  assert.equal(a.stages.scientificClosureCells, 4 * u * e + 3 * u * c + 3 * c * c + 3 * u * d + 3 * c * d + 2 * u + 8 * c + 8 * e);
  assert.equal(a.closureWorkUnits, e ** 3 + 2 * u * e * e + 4 * u * c * c + 3 * d * c ** 3 + 12 * u * e + n * e);
  assert.equal(a.stages.validationScratchCells, Math.max(a.stages.accumulationCells, n * c + 4 * u * e + a.stages.rankDiagnosticCells, a.stages.scientificClosureCells));
  assert.equal(a.stages.bindingCells, 4 * n * c + 4 * a.compactScientificCells + n * e + a.stages.validationScratchCells);
  const runtime = publicV3.runOnaPlanV3(plan);
  let visited = 0;
  runtime.set.connectionMatrix = new Proxy(runtime.set.connectionMatrix, { get(target, key, receiver) {
    if (key === "map") { visited += 1; throw new Error("rank diagnostic allocated before admission"); }
    return Reflect.get(target, key, receiver);
  } });
  const changed = { ...plan, operationalAdmission: { ...a, totalNumericCells: 1, stages: { ...a.stages, bindingCells: 1 } } };
  await assert.rejects(() => publicV3.bindOnaResultV3(changed, runtime, { processedRows: n, maximumRetainedRowsAfterChunk: 1,
    bufferedRowsPeakUpperBound: Math.min(n, plan.header.resourceEstimate.estimatedRetainedWindowRows + 1), numericCellsUpperBound: 1,
    peakBytesUpperBound: a.totalPeakBytes, observationMethod: "dimension-bounds-and-chunk-boundary-stream-state" }), /budget|admission|resource/i);
  assert.equal(visited, 0, "rank matrices must not be allocated after a failed pre-diagnostic admission");
});

test("escaped ONA identity metadata fits its explicit text envelope and oversized labels fail without truncation", async () => {
  const input = await fixture();
  input.dataset.rows = input.dataset.rows.map((row) => ({ ...row, u: `${row.u}:"\\\u0000字`.repeat(25), g: `${row.g}:"\\\u2028`.repeat(20) }));
  const headers = input.dataset.headers;
  const csvValue = (value: unknown) => `"${String(value).replaceAll('"', '""')}"`;
  const csv = `${headers.map(csvValue).join(",")}\n${input.dataset.rows.map((row) => headers.map((key) => csvValue(row[key])).join(",")).join("\n")}\n`;
  input.dataset.sizeBytes = new TextEncoder().encode(csv).byteLength;
  const plan = await publicV3.buildOnaExecutionPlanV3(input.dataset, await sha256TextV3(csv), input.configuration);
  const worker = workerHost(); worker.send({ kind: "run-open-ena-plan-v3", id: "escaped", plan, chunkSize: 1 });
  const terminal = await worker.terminal(); assert.equal(terminal.kind, "result-v3", terminal.kind === "error" ? terminal.message : "escaped metadata");
  if (terminal.kind === "result-v3") {
    const result = await bindings.validateBoundResultV3(terminal.result, plan);
    assert.ok(new TextEncoder().encode(canonicalJsonV3(result)).byteLength <= plan.operationalAdmission.totalExportBytes);
    assert.equal(plan.operationalAdmission.metadataSerializationBytes, 8 * plan.operationalAdmission.resultIdentityBytes);
  }
  const oversized = decodeCanonicalOnaConfigV3({ ...input.configuration, codes: input.configuration.codes.map((code) => ({ ...code, displayLabel: '"\\'.repeat(500_000) })) });
  const beforeRows = input.dataset.rows.length;
  await assert.rejects(() => publicV3.buildOnaExecutionPlanV3(input.dataset, input.datasetSha256, oversized), /resource|budget/i);
  assert.equal(input.dataset.rows.length, beforeRows);
  assert.equal(oversized.codes.length, 3);
  assert.equal(oversized.codes[0].displayLabel.length, 1_000_000);
});

async function refreshClosureDatasetHash(dataset: ParsedDataset): Promise<string> {
  const csv = `${dataset.headers.join(",")}\n${dataset.rows.map((row) => dataset.headers.map((key) => row[key]).join(",")).join("\n")}\n`;
  dataset.sizeBytes = new TextEncoder().encode(csv).byteLength;
  return sha256TextV3(csv);
}

async function closureFixture() {
  const input = await fixture(1);
  input.dataset.rows = [[1, 2, 3], [3, 1, 2], [2, 3, 1]].map(([A, B, C], index) => ({ u: `u${index}`, h: `h${index}`, t: 1, g: "unused", A, B, C }));
  input.datasetSha256 = await refreshClosureDatasetHash(input.dataset);
  const configuration = decodeCanonicalOnaConfigV3({ ...input.configuration, units: { columns: ["u"], group: { type: "none" } }, directionalMask: createDirectionalMask(input.configuration.codes.map((code) => code.column)) });
  const plan = await publicV3.buildOnaExecutionPlanV3(input.dataset, input.datasetSha256, configuration);
  const result = await publicV3.bindOnaResultV3(plan, publicV3.runOnaPlanV3(plan), { processedRows: 3, maximumRetainedRowsAfterChunk: 0, bufferedRowsPeakUpperBound: 1,
    numericCellsUpperBound: plan.operationalAdmission.totalNumericCells, peakBytesUpperBound: plan.operationalAdmission.totalPeakBytes, observationMethod: "dimension-bounds-and-chunk-boundary-stream-state" });
  return { input, configuration, plan, result };
}

test("source aggregate comparison preserves tiny positive scale and rejects a hundred-order forged rescaling", async () => {
  const { input, configuration } = await closureFixture();
  input.dataset.rows = input.dataset.rows.map((row) => ({ ...row, A: Number(row.A) * 1e-100, B: Number(row.B) * 1e-100, C: Number(row.C) * 1e-100 }));
  input.datasetSha256 = await refreshClosureDatasetHash(input.dataset);
  const plan = await publicV3.buildOnaExecutionPlanV3(input.dataset, input.datasetSha256, configuration);
  const result = await publicV3.bindOnaResultV3(plan, publicV3.runOnaPlanV3(plan), { processedRows: 3, maximumRetainedRowsAfterChunk: 0, bufferedRowsPeakUpperBound: 1,
    numericCellsUpperBound: plan.operationalAdmission.totalNumericCells, peakBytesUpperBound: plan.operationalAdmission.totalPeakBytes, observationMethod: "dimension-bounds-and-chunk-boundary-stream-state" });
  await bindings.validateBoundResultV3(result, plan);
  const changed = structuredClone(result);
  changed.set.connectionMatrix.forEach((row, unit) => row.forEach((value, edge) => {
    row[edge] = value * 1e100; changed.set.connectionCounts[unit][changed.set.codeColumns[edge]] = row[edge];
  }));
  changed.orderedAudit.edgeValues.forEach((row) => row.forEach((value, edge) => { row[edge] = value * 1e100; }));
  Object.assign(changed.binding, { scientificResultSha256: await sha256CanonicalJsonV3(bindings.scientificResultHashPayloadV3(changed)) });
  await assert.rejects(() => bindings.validateBoundResultV3(changed, plan), /source.*aggregate/i);
});

test("combined closure work is checked before any orthogonality iteration", async () => {
  const { plan } = await closureFixture(), runtime = publicV3.runOnaPlanV3(plan);
  const changed = { ...plan, operationalAdmission: { ...plan.operationalAdmission, closureWorkUnits: MAX_ESTIMATED_ROTATION_WORK_UNITS_V3 + 1 } };
  let iterations = 0;
  runtime.set.rotation.rotationMatrix = new Proxy(runtime.set.rotation.rotationMatrix, { get(target, key, receiver) {
    if (key === Symbol.iterator && ++iterations > 1) throw new Error("orthogonality loop started before work admission");
    return Reflect.get(target, key, receiver);
  } });
  await assert.rejects(() => publicV3.bindOnaResultV3(changed, runtime, { processedRows: 3, maximumRetainedRowsAfterChunk: 0, bufferedRowsPeakUpperBound: 1,
    numericCellsUpperBound: plan.operationalAdmission.totalNumericCells, peakBytesUpperBound: plan.operationalAdmission.totalPeakBytes, observationMethod: "dimension-bounds-and-chunk-boundary-stream-state" }), /work budget/);
  assert.ok(iterations <= 1);
});

test("combined closure work rejects an otherwise admitted ONA baseline before scientific preflight", async () => {
  const { input, configuration } = await closureFixture(), codeNames = Array.from({ length: 14 }, (_, index) => `node${index}`);
  input.dataset.rows = Array.from({ length: 10 }, (_, index) => ({ u: `u${index}`, h: `h${index}`, t: 1,
    ...Object.fromEntries(codeNames.map((code) => [code, 1e-200])),
  }));
  input.dataset.headers = ["u", "h", "t", ...codeNames];
  input.datasetSha256 = await refreshClosureDatasetHash(input.dataset);
  const oversized = decodeCanonicalOnaConfigV3({ ...configuration, codes: codeNames.map((column) => ({ column, displayLabel: column })), directionalMask: createDirectionalMask(codeNames) });
  const baseline = publicV3.estimateOnaResourcesV3({ rowCount: 10, unitCount: 10, horizonCount: 10, codeCount: 14, horizonSizes: Array(10).fill(1),
    backward: { kind: "finite", value: 1 }, datasetSizeBytes: input.dataset.sizeBytes, identityPayloadBytes: 0 });
  assert.equal(baseline.blocked, false);
  // If preflight reached accumulation, these source products would underflow.
  await assert.rejects(() => publicV3.buildOnaExecutionPlanV3(input.dataset, input.datasetSha256, oversized), /scientific closure exceeds the fixed work budget/);
});

for (const rowsPerUnit of [1, 2]) {
  test(`near-MAX finite Unit aggregates conserve ${rowsPerUnit}-row audits without cross-Unit overflow`, async () => {
    const { input, configuration } = await closureFixture();
    const magnitude = rowsPerUnit === 1 ? 1.3e154 : 1e154;
    input.dataset.rows = Array.from({ length: 3 }, (_, unit) => Array.from({ length: rowsPerUnit }, (_, turn) => ({
      u: `u${unit}`, h: `h${unit}`, t: turn + 1, g: "unused", A: magnitude, B: magnitude, C: unit + 1,
    }))).flat();
    input.datasetSha256 = await refreshClosureDatasetHash(input.dataset);
    const legacy = analyzeDataset(input.dataset, { ...input.legacyConfig, groupColumn: null, directionalMask: configuration.directionalMask });
    const plan = await publicV3.buildOnaExecutionPlanV3(input.dataset, input.datasetSha256, configuration);
    const runtime = publicV3.runOnaPlanV3(plan), restored = sourceRestoredSet(runtime.set, plan);
    for (const field of ["connectionCounts", "lineWeights", "pointsForProjection", "points", "centroids", "rotation"] as const) assert.deepEqual(restored[field], legacy.set[field], field);
    assert.deepEqual(runtime.set.connectionMatrix, legacy.set.connectionMatrix);
    assert.deepEqual(runtime.set.variance, legacy.set.variance);
    assert.deepEqual({ ...runtime.orderedAudit, codeOrder: input.legacyConfig.codes }, buildOpenEnaOrderedAudit(legacy.set));
    const largeEdge = plan.codeDictionary.edges.findIndex((edge) => edge.groundIndex === 1 && edge.responseIndex === 2);
    assert.ok(runtime.set.connectionMatrix.every((row) => Number.isFinite(row[largeEdge]) && row[largeEdge] > Number.MAX_VALUE / 3));
    assert.equal(runtime.set.connectionMatrix.reduce((sum, row) => sum + row[largeEdge], 0), Infinity, "an unnecessary cross-Unit sum would overflow");
    const worker = workerHost(); worker.send({ kind: "run-open-ena-plan-v3", id: `near-max-${rowsPerUnit}`, plan, chunkSize: 1 });
    const terminal = await worker.terminal(); assert.equal(terminal.kind, "result-v3", terminal.kind === "error" ? terminal.message : "near-MAX finite result");
    if (terminal.kind === "result-v3") {
      const bound = await bindings.validateBoundResultV3(terminal.result, plan);
      assert.deepEqual(bound.set.connectionMatrix, legacy.set.connectionMatrix);
      assert.deepEqual(bound.set.variance, legacy.set.variance);
      assert.deepEqual(bound.orderedAudit.edgeValues, runtime.orderedAudit.edgeValues);
    }
  });
}

for (const kind of ["eigenvalue energy", "non-eigen orthonormal basis"] as const) {
  test(`ONA closure rejects rehashed ${kind}`, async () => {
    const { plan, result } = await closureFixture(), changed = structuredClone(result);
    if (kind === "eigenvalue energy") changed.set.rotation.eigenvalues[0] += 1;
    else for (const row of changed.set.rotation.rotationMatrix) {
      const first = row[0], last = row[row.length - 1];
      row[0] = (first + last) / Math.sqrt(2); row[row.length - 1] = (last - first) / Math.sqrt(2);
    }
    Object.assign(changed.binding, { scientificResultSha256: await sha256CanonicalJsonV3(bindings.scientificResultHashPayloadV3(changed)) });
    await assert.rejects(() => bindings.validateBoundResultV3(changed, plan), /eigenvalue energy|cross-axis/i);
  });
}

test("a complete alternate model with preserved response totals cannot replace source-bound Unit aggregates", async () => {
  const { input, configuration, plan, result } = await closureFixture();
  const alternate = { ...input.dataset, rows: input.dataset.rows.map((row) => ({ ...row })) };
  const first = alternate.rows[0].B; alternate.rows[0].B = alternate.rows[1].B; alternate.rows[1].B = first;
  const alternatePlan = await publicV3.buildOnaExecutionPlanV3(alternate, await refreshClosureDatasetHash(alternate), configuration);
  const alternateResult = await publicV3.bindOnaResultV3(alternatePlan, publicV3.runOnaPlanV3(alternatePlan), result.executionProvenance.resources.observed);
  assert.deepEqual(alternateResult.orderedResponseNodeSummary, result.orderedResponseNodeSummary);
  const changed = { ...structuredClone(result), set: alternateResult.set, orderedAudit: alternateResult.orderedAudit };
  Object.assign(changed.binding, { scientificResultSha256: await sha256CanonicalJsonV3(bindings.scientificResultHashPayloadV3(changed)) });
  await assert.rejects(() => bindings.validateBoundResultV3(changed, plan), /source.*aggregate/i);
});

for (const field of ["points", "lineWeights", "centerVector", "audit", "centroids", "nodes", "variance", "pointsForProjection"] as const) {
  test(`rehashed ONA ${field} tampering cannot bypass scientific derivation closure`, async () => {
    const { plan, result } = await closureFixture();
    const changed = structuredClone(result);
    if (field === "points" || field === "centroids") changed.set[field]![0].SVD1 = Number(changed.set[field]![0].SVD1) + 123;
    else if (field === "lineWeights" || field === "pointsForProjection") changed.set[field][0]["Connection 2"] = Number(changed.set[field][0]["Connection 2"]) + 123;
    else if (field === "centerVector") changed.set.rotation.centerVector[0] += 123;
    else if (field === "audit") changed.orderedAudit.edgeValues[0][1] += 123;
    else if (field === "nodes") changed.set.rotation.nodes![0].SVD1 = Number(changed.set.rotation.nodes![0].SVD1) + 123;
    else changed.set.variance.SVD1 += 123;
    Object.assign(changed.binding, { scientificResultSha256: await sha256CanonicalJsonV3(bindings.scientificResultHashPayloadV3(changed)) });
    await assert.rejects(() => bindings.validateBoundResultV3(changed, plan), /scientific|deriv|audit|conserv|source|projection|variance|node|center|normal/i);
  });
}

// Restore scientific aliases only through their exact dictionaries. Numeric
// arrays are never rounded, sorted, sign-flipped or projected again by the oracle.
function sourceRestoredSet(set: ENASet, plan: Awaited<ReturnType<typeof publicV3.buildOnaExecutionPlanV3>>): ENASet {
  const unit = new Map(plan.identityDictionary.units.map((entry) => [entry.token, entry]));
  const code = new Map(plan.codeDictionary.codes.map((entry) => [entry.token, entry.sourceColumn]));
  const edge = new Map(set.adjacencyKey.map((entry) => [entry.name, `${code.get(entry.source)} & ${code.get(entry.target)}`]));
  const groups = new Map(plan.identityDictionary.groups.map((entry) => [entry.token, entry.fields[0].value.value]));
  const restoreRow = (row: Row): Row => {
    const output: Row = {};
    for (const [key, value] of Object.entries(row)) {
      if (key === "__open_ena_unit_token") {
        for (const field of unit.get(String(value))!.fields) output[field.column] = field.value.value;
      } else if (key === "__open_ena_group_token") output[plan.configuration.units.group.type === "stable-metadata" ? plan.configuration.units.group.column : "g"] = groups.get(String(value))!;
      else if (key === "ENA_UNIT" || key === "unit") output[key] = unit.get(String(value))!.fields.map((field) => String(field.value.value)).join(".");
      else output[edge.get(key) ?? key] = value;
    }
    return output;
  };
  const adjacencyKey = set.adjacencyKey.map((entry) => ({ ...entry, source: code.get(entry.source)!, target: code.get(entry.target)!, name: edge.get(entry.name)! }));
  return { ...set, connectionCounts: set.connectionCounts.map(restoreRow), lineWeights: set.lineWeights.map(restoreRow), pointsForProjection: set.pointsForProjection.map(restoreRow), points: set.points.map(restoreRow), centroids: set.centroids?.map(restoreRow),
    rotation: { ...set.rotation, codes: set.rotation.codes.map((value) => code.get(value)!), adjacencyKey, nodes: set.rotation.nodes?.map((node) => ({ ...node, code: code.get(String(node.code))! })) } };
}

for (const backward of [2, Infinity]) for (const sourceOrder of [false, true]) {
  test(`ONA v3 preserves exact legacy science, audit and declared Code order: backward=${backward}, source=${sourceOrder}`, async () => {
    const input = await fixture(backward, sourceOrder);
    const legacy = analyzeDataset(input.dataset, input.legacyConfig);
    const legacyPlan = buildOpenEnaAnalysisPlan(input.dataset, input.legacyConfig);
    assert.equal(typeof publicV3.buildOnaExecutionPlanV3, "function", "ONA execution-plan builder must exist");
    const plan = await publicV3.buildOnaExecutionPlanV3(input.dataset, input.datasetSha256, input.configuration);
    const current = publicV3.runOnaPlanV3(plan);
    const restored = sourceRestoredSet(current.set, plan);
    for (const field of ["connectionCounts", "lineWeights", "pointsForProjection", "points", "centroids", "rotation"] as const) assert.deepEqual(restored[field], legacy.set[field], field);
    assert.deepEqual(current.set.connectionMatrix, legacy.set.connectionMatrix);
    assert.deepEqual(current.set.variance, legacy.set.variance);
    assert.deepEqual({ ...current.orderedAudit, codeOrder: input.legacyConfig.codes }, buildOpenEnaOrderedAudit(legacy.set));
    const groups = new Map(plan.identityDictionary.groups.map((entry) => [entry.token, String(entry.fields[0].value.value)]));
    const restoredSummary = { ...current.orderedResponseNodeSummary, codeOrder: input.legacyConfig.codes,
      groups: current.orderedResponseNodeSummary.groups.map((group) => ({ ...group, name: groups.get(group.name)! })).sort((a, b) => a.name.localeCompare(b.name)) };
    assert.deepEqual(restoredSummary, buildOpenEnaOrderedResponseNodeSummary(legacyPlan.options.rows, input.legacyConfig));
    assert.deepEqual(plan.runtimeSourceRowIndices, legacyPlan.executionProvenance.ordering!.responseRowSourceIndices);
    assert.deepEqual(plan.codeDictionary.codes.map((entry) => entry.sourceColumn), ["C", "A", "B"]);
    assert.equal(plan.codeDictionary.edges.length, 9);
    assert.equal(canonicalJsonV3(plan.directionalMask), canonicalJsonV3(input.configuration.directionalMask));
  });
}
