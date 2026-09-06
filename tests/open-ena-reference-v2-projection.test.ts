import assert from "node:assert/strict";
import { rehashStandardPlanForTestV3 } from "./helpers/open-ena-model-v3-fixture";
import test from "node:test";
import { getOpenEnaCopy, localizeModelDiagnosticV3 } from "../lib/open-ena-i18n";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import { canonicalJsonV3, sha256CanonicalJsonV3 } from "../lib/open-ena/model-v3/canonical-json";
import { compileStandardDraftV3 } from "../lib/open-ena/model-v3/compiler";
import { buildStandardExecutionPlanV3, executionPlanHashPayloadV3, validateExecutionPlanV3 } from "../lib/open-ena/model-v3/execution-plan";
import * as referenceApi from "../lib/open-ena/model-v3/reference-v2";
import { MAX_ESTIMATED_PEAK_BYTES_V3 } from "../lib/open-ena/model-v3/resource-budget";
import { toStandardJenaOptionsV3 } from "../lib/open-ena/model-v3/standard-adapter";
import type { CanonicalRowOrderV3, CanonicalStandardConfigV3, OpenEnaStandardReferenceV2, StandardEnaDraftV3, StandardModelTypeV3, ValidatedReferenceExecutionBindingV3 } from "../lib/open-ena/model-v3/types";
import type { ParsedDataset } from "../lib/open-ena/types";

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
const clone = <T>(input: T): Mutable<T> => structuredClone(input) as Mutable<T>;
const hash = "a".repeat(64);

function draft(): StandardEnaDraftV3 {
  return {
    unitColumns: ["unit"], horizonColumns: ["horizon"], groupColumn: "group", codes: ["A", "B", "C"],
    weighting: "frequency", model: "EndPoint", windowType: "Conversation",
    movingStanza: { backward: { kind: "finite", value: 1 }, forward: { kind: "finite", value: 0 }, rowOrder: null },
    horizonOrder: { kind: "columns", keys: [{ column: "time", direction: "ascending", comparator: { type: "number" } }] },
    rotation: { type: "svd", centerAlignToOrigin: true },
  };
}

function dataset(): ParsedDataset {
  return {
    name: "source.csv", source: "upload", sizeBytes: 2048,
    headers: ["unit", "horizon", "time", "group", "A", "B", "C"],
    rows: [
      { unit: "u1", horizon: "h1", time: 1, group: "Control", A: 1, B: 2, C: 1 },
      { unit: "u2", horizon: "h1", time: 1, group: "Treatment", A: 2, B: 1, C: 3 },
      { unit: "u3", horizon: "h2", time: 2, group: "Control", A: 1, B: 3, C: 1 },
      { unit: "u4", horizon: "h2", time: 2, group: "Treatment", A: 3, B: 1, C: 2 },
      { unit: "u5", horizon: "h3", time: 3, group: "Other", A: 1, B: 1, C: 4 },
    ],
  };
}

async function ready(input = draft(), source = dataset(), digest = hash) {
  const compiled = await compileStandardDraftV3(source, digest, input);
  assert.equal(compiled.status, "ready", compiled.diagnostics.map((entry) => entry.id).join(", "));
  if (compiled.status !== "ready") throw new Error("Fixture must compile");
  return compiled;
}

async function artifact(input = draft(), source = dataset()) {
  const compileResult = await ready(input, source);
  const plan = await buildStandardExecutionPlanV3({ dataset: source, datasetSha256: hash, compileResult, reference: null });
  return referenceApi.buildReferenceV2(await referenceApi.fitReferenceSourceV3(plan), { displayName: "Original alias", currentPlan: plan });
}

async function bind(value: unknown, config: CanonicalStandardConfigV3): Promise<ValidatedReferenceExecutionBindingV3> {
  const api = referenceApi as unknown as Record<string, unknown>;
  assert.equal(typeof api.bindReferenceToTargetV3, "function", "The binding implementation must exist");
  return (api.bindReferenceToTargetV3 as (value: unknown, config: CanonicalStandardConfigV3) => Promise<ValidatedReferenceExecutionBindingV3>)(value, config);
}

function targetDraft(ref: OpenEnaStandardReferenceV2, model: StandardModelTypeV3 = "EndPoint") {
  const input = draft();
  input.model = model;
  input.codes = ["C", "A", "B"];
  input.rotation = { type: "reference", referenceId: ref.referenceId, expectedContentSha256: ref.contentSha256 };
  return input;
}

async function targetPlan(ref: OpenEnaStandardReferenceV2, model: StandardModelTypeV3 = "EndPoint", source = dataset()) {
  const input = targetDraft(ref, model);
  const compileResult = await ready(input, source, "b".repeat(64));
  return buildStandardExecutionPlanV3({ dataset: source, datasetSha256: "b".repeat(64), compileResult, reference: await bind(ref, compileResult.canonicalConfiguration) });
}

async function rehash(value: Mutable<OpenEnaStandardReferenceV2>) {
  const { displayName: _alias, referenceId: _id, contentSha256: _digest, ...scientific } = value;
  value.source.configurationSha256 = await sha256CanonicalJsonV3(value.source.configuration);
  value.contentSha256 = await sha256CanonicalJsonV3(scientific);
  value.referenceId = `open-ena-standard-ref-v2:${value.contentSha256}`;
  return value;
}

for (const means of [false, true]) for (const model of ["EndPoint", "SeparateTrajectory", "AccumulatedTrajectory"] as const) {
  test(`${means ? "Means" : "SVD"} Endpoint Reference projects ${model} with canonical display reorder`, async () => {
    const sourceDraft = draft();
    if (means) sourceDraft.rotation = { type: "means", centerAlignToOrigin: true, negativeLevel: { type: "string", value: "Control" }, positiveLevel: { type: "string", value: "Treatment" } };
    const ref = await artifact(sourceDraft);
    const target = dataset();
    target.rows = target.rows.slice(0, 3).flatMap((row) => [
      { ...row, unit: `target-${row.unit}`, group: "New group" },
      { ...row, unit: `target-${row.unit}`, group: "New group", horizon: "later", time: 4, C: Number(row.C) + 2 },
    ]);
    const plan = await targetPlan(ref, model, target);
    assert.deepEqual(plan.reference?.basisPermutation, [0, 1, 2], "Canonical Code sorting makes display reorder an identity edge permutation");
    const options = toStandardJenaOptionsV3(plan);
    assert.equal(Object.hasOwn(options, "rotation"), false);
    assert.equal(options.nodePositionMethod, "reference-fixed");
    const result = runStandardPlanV3(await validateExecutionPlanV3(clone(plan)));
    assert.equal(result.projection.type, "reference");
    assert.deepEqual(result.set.rotation, plan.reference?.rotationSet);
    assert.deepEqual(result.projection.centerVector, ref.geometry.centerVector);
    assert.equal(result.meansBinding, null);
    assert.deepEqual(result.projection.estimableAxes, ref.fit.estimableAxes);
    assert.equal(result.projection.targetProjectionRank, result.projection.rank);
    assert.deepEqual(result.populations.fitTokens, []);
    assert.equal(result.populations.targetTokens.length, model === "EndPoint" ? 3 : 6);
    assert.equal(result.populations.imputedStepCount, 0);
    const sourceFit = (result.populations as unknown as { sourceFit: OpenEnaStandardReferenceV2["fit"] }).sourceFit;
    assert.deepEqual(sourceFit, ref.fit);
    await assert.rejects(() => referenceApi.fitReferenceSourceV3(plan), /target-fitted|EndPoint/i);
  });
}

test("Imported Code, edge, matrix-row, center-row and node reorder preserves axis columns and geometry", async () => {
  const original = await artifact();
  const imported = clone(original);
  imported.basis.codes = [original.basis.codes[2], original.basis.codes[0], original.basis.codes[1]];
  const order = [2, 0, 1];
  imported.basis.edges = order.map((index) => clone(original.basis.edges[index]));
  imported.geometry.rotationMatrix = order.map((index) => [...original.geometry.rotationMatrix[index]]);
  imported.geometry.centerVector = order.map((index) => original.geometry.centerVector[index]);
  imported.geometry.nodes = order.map((index) => clone(original.geometry.nodes[index]));
  await rehash(imported);
  const plan = await targetPlan(imported);
  assert.deepEqual(plan.reference?.basisPermutation, [1, 2, 0]);
  assert.deepEqual(plan.reference?.rotationSet.rotationMatrix, original.geometry.rotationMatrix);
  assert.deepEqual(plan.reference?.rotationSet.centerVector, original.geometry.centerVector);
  assert.deepEqual(plan.reference?.rotationSet.rotationColumns, original.geometry.rotationColumns);
  const result = runStandardPlanV3(plan);
  assert.deepEqual(result.set.rotation, plan.reference?.rotationSet);
  for (const [index, node] of result.set.rotation.nodes!.entries()) {
    assert.deepEqual(original.geometry.nodeColumns.map((axis) => node[axis]), original.geometry.nodes[index].coordinates);
  }
});

test("Reference aliases do not change execution-plan identity, complete artifact remains hash checked", async () => {
  const ref = await artifact();
  const renamed = clone(ref);
  renamed.displayName = "Another local alias";
  const first = await targetPlan(ref);
  const second = await targetPlan(renamed);
  assert.equal(first.header.executionPlanSha256, second.header.executionPlanSha256);
  const forged = clone(first);
  const binding = forged.reference as unknown as { artifact: Mutable<OpenEnaStandardReferenceV2> };
  binding.artifact.geometry.nodes[0].coordinates[0] += 1;
  forged.header.executionPlanSha256 = await sha256CanonicalJsonV3(executionPlanHashPayloadV3(forged));
  await assert.rejects(() => validateExecutionPlanV3(forged), /Reference.*SHA|Reference.*hash/i);
});

for (const targetKind of ["single-unit", "identical-targets", "zero-networks"] as const) test(`Reference permits ${targetKind} without source fit guards`, async () => {
  const ref = await artifact();
  const target = dataset();
  target.rows = targetKind === "single-unit" ? [target.rows[0]] : targetKind === "identical-targets"
    ? [target.rows[0], { ...target.rows[0], unit: "another" }]
    : [
      { unit: "a", horizon: "a", time: 1, group: "g", A: 1, B: 0, C: 0 },
      { unit: "b", horizon: "b", time: 2, group: "g", A: 0, B: 1, C: 0 },
      { unit: "c", horizon: "c", time: 3, group: "g", A: 0, B: 0, C: 1 },
    ];
  const plan = await targetPlan(ref, "EndPoint", target);
  const result = runStandardPlanV3(plan);
  assert.equal(result.projection.rank, 0);
  assert.ok(result.diagnostics.some((entry) => entry.id === "STANDARD_REFERENCE_TARGET_DEGENERATE"));
  assert.deepEqual(result.projection.estimableAxes, ref.fit.estimableAxes);
  assert.deepEqual(result.set.rotation, plan.reference?.rotationSet);
  assert.ok(result.set.points.every((row) => ref.geometry.nodeColumns.every((axis) => Number.isFinite(row[axis]))));
  if (targetKind === "zero-networks") assert.ok(result.set.points.every((row) => ref.geometry.nodeColumns.every((axis) => row[axis] === 0)));
});

test("Reference rejects an all-zero selected Code even when target projection could be degenerate", async () => {
  const ref = await artifact();
  const source = dataset();
  source.rows = source.rows.map((row) => ({ ...row, C: 0 }));
  const compiled = await compileStandardDraftV3(source, hash, targetDraft(ref));
  assert.equal(compiled.status, "invalid");
});

test("Reference center policy comes from the source for zero-network targets", async () => {
  const input = draft();
  input.rotation = { type: "svd", centerAlignToOrigin: false };
  const ref = await artifact(input);
  const target = dataset();
  target.rows.push({ unit: "zero", horizon: "alone", time: 5, group: "Other", A: 0, B: 0, C: 0 });
  const plan = await targetPlan(ref, "EndPoint", target);
  const options = toStandardJenaOptionsV3(plan);
  assert.equal(options.centerAlignToOrigin, false);
  const result = runStandardPlanV3(plan);
  const zero = result.set.connectionMatrix.findIndex((row) => row.every((value) => value === 0));
  assert.ok(zero >= 0);
  assert.deepEqual(result.set.codeColumns.map((column) => result.set.pointsForProjection[zero][column]), ref.geometry.centerVector.map((value) => -value));
});

const invalidArtifacts: Array<[string, (ref: Mutable<OpenEnaStandardReferenceV2>) => void]> = [
  ["missing Code", (ref) => { ref.basis.codes.pop(); }],
  ["duplicate Code", (ref) => { ref.basis.codes[1] = ref.basis.codes[0]; }],
  ["duplicate edge", (ref) => { ref.basis.edges[1] = ref.basis.edges[0]; }],
  ["unknown edge", (ref) => { ref.basis.edges[1].source.value = "unknown"; }],
  ["weighting", (ref) => { ref.compatibility.weighting = { type: "binary" }; }],
  ["window", (ref) => { ref.compatibility.window.type = "MovingStanzaWindow"; }],
  ["extents", (ref) => { ref.compatibility.window.forward = { kind: "finite", value: 1 }; }],
  ["normalization", (ref) => { (ref.compatibility as unknown as { normalization: string }).normalization = "none"; }],
  ["Unit mapping", (ref) => { ref.compatibility.unitFields = ["renamed-unit"]; }],
  ["Horizon mapping", (ref) => { ref.compatibility.horizonFields = ["renamed-horizon"]; }],
  ["content SHA", (ref) => { ref.geometry.nodes[0].coordinates[0] += 0.01; }],
];
for (const [label, mutate] of invalidArtifacts) test(`Reference fails closed on ${label}`, async () => {
  const ref = await artifact();
  const invalid = clone(ref);
  mutate(invalid);
  const compiled = await ready(targetDraft(ref));
  await assert.rejects(() => bind(invalid, compiled.canonicalConfiguration), /Reference/i);
});

test("Reference rederived binding rejects forged permutation, source fit, center, axes or nodes", async () => {
  const plan = await targetPlan(await artifact());
  for (const change of [
    (ref: Mutable<ValidatedReferenceExecutionBindingV3>) => { ref.basisPermutation.reverse(); },
    (ref: Mutable<ValidatedReferenceExecutionBindingV3>) => { ref.sourceFit = "means"; },
    (ref: Mutable<ValidatedReferenceExecutionBindingV3>) => { ref.rotationSet.centerVector[0] += 0.01; },
    (ref: Mutable<ValidatedReferenceExecutionBindingV3>) => { ref.rotationSet.rotationColumns.reverse(); },
    (ref: Mutable<ValidatedReferenceExecutionBindingV3>) => { ref.rotationSet.nodes![0].SVD1 = 99; },
  ]) {
    const forged = clone(plan);
    change(forged.reference!);
    await rehashStandardPlanForTestV3(forged);
    await assert.rejects(() => validateExecutionPlanV3(forged), /Reference/i);
  }
});

test("Fixed-node centroids are computed from target incidence weights and source coordinates", async () => {
  const plan = await targetPlan(await artifact());
  const result = runStandardPlanV3(plan);
  const nodes = result.set.rotation.nodes!;
  for (const [index, row] of result.set.lineWeights.entries()) {
    const weights = nodes.map(() => 0);
    result.set.adjacencyKey.forEach((edge, edgeIndex) => {
      const value = Number(row[result.set.codeColumns[edgeIndex]]) * 0.5;
      weights[edge.sourceIndex] += value;
      weights[edge.targetIndex] += value;
    });
    const norm = Math.max(0.0001, weights.reduce((sum, value) => sum + Math.abs(value), 0));
    for (const axis of result.projection.fullAxes.slice(0, 3)) {
      const expected = weights.reduce((sum, value, nodeIndex) => sum + value / norm * Number(nodes[nodeIndex][axis]), 0);
      assert.ok(Math.abs(Number(result.set.centroids![index][axis]) - expected) < 1e-12);
    }
  }
  assert.equal(canonicalJsonV3(result.set.rotation), canonicalJsonV3(plan.reference!.rotationSet));
});

for (const centerAlignToOrigin of [true, false]) test(`Actual fixed projection points and target rank use source center policy ${centerAlignToOrigin}`, async () => {
  const input = draft();
  input.rotation = { type: "svd", centerAlignToOrigin };
  const source = dataset();
  source.rows = source.rows.slice(0, 3).map((row, index) => ({ ...row, horizon: String(index), A: index === 2 ? 0 : 1, B: index === 1 ? 0 : 1, C: index === 0 ? 0 : 1 }));
  const ref = await artifact(input, source);
  const target = dataset();
  target.rows = target.rows.slice(0, 3).map((row, index) => ({ ...row, horizon: String(index), A: index === 1 ? 0 : 1, B: index === 2 ? 1 : 0, C: index === 1 ? 1 : 0 }));
  const plan = await targetPlan(ref, "EndPoint", target);
  const result = runStandardPlanV3(plan);
  const reference = plan.reference!;
  const expected = result.set.connectionMatrix.map((network) => {
    const norm = Math.sqrt(network.reduce((sum, value) => sum + value * value, 0));
    const centered = network.map((value, index) => norm === 0 && centerAlignToOrigin ? 0 : (norm === 0 ? 0 : value / norm) - reference.rotationSet.centerVector[index]);
    return reference.rotationSet.rotationColumns.map((_axis, index) => centered.reduce((sum, value, edge) => sum + value * reference.rotationSet.rotationMatrix[edge][index], 0));
  });
  for (const [index, row] of result.set.points.entries()) {
    assert.deepEqual(result.projection.fullAxes.map((axis) => row[axis]), expected[index]);
  }
  assert.equal(result.projection.targetProjectionRank, 1);
  assert.equal(result.projection.rank, 1);
  assert.equal(result.populations.sourceFit?.rank, 2);
  assert.ok(!result.diagnostics.some((entry) => entry.id === "STANDARD_REFERENCE_TARGET_DEGENERATE"));
  const expectedVariances = expected[0].map((_value, index) => {
    const mean = expected.reduce((sum, row) => sum + row[index], 0) / expected.length;
    return expected.reduce((sum, row) => sum + (row[index] - mean) ** 2, 0) / (expected.length - 1);
  });
  const total = expectedVariances.reduce((sum, value) => sum + value, 0);
  expectedVariances.forEach((value, index) => assert.ok(Math.abs(value / total - result.projection.variance[index]) < 1e-12));
  assert.deepEqual(result.projection.estimableAxes, ref.fit.estimableAxes);
  assert.deepEqual(result.set.rotation, reference.rotationSet);
});

test("Zero co-occurrence remains blocking for SVD and Means, and nonblocking only for Reference", async () => {
  const ref = await artifact();
  const source = dataset();
  source.rows = source.rows.slice(0, 3).map((row, index) => ({ ...row, horizon: String(index), A: index === 0 ? 1 : 0, B: index === 1 ? 1 : 0, C: index === 2 ? 1 : 0 }));
  for (const type of ["svd", "means", "reference"] as const) {
    const input = targetDraft(ref);
    if (type === "svd") input.rotation = { type, centerAlignToOrigin: true };
    if (type === "means") input.rotation = { type, centerAlignToOrigin: true, negativeLevel: { type: "string", value: "Control" }, positiveLevel: { type: "string", value: "Treatment" } };
    const compiled = await compileStandardDraftV3(source, hash, input);
    const diagnostic = compiled.diagnostics.find((entry) => entry.id === "STANDARD_NO_GLOBAL_COOCCURRENCE")!;
    assert.equal(diagnostic.blocks.includes("build-model"), type !== "reference");
    assert.equal(compiled.status, type === "reference" ? "ready" : "invalid");
    if (type === "reference") {
      assert.equal(diagnostic.severity, "warning");
      assert.deepEqual(diagnostic.blocks, []);
      assert.match(localizeModelDiagnosticV3(getOpenEnaCopy("en").modelV3, diagnostic).detail, /fixed Reference.*valid projection.*warning/u);
    }
  }
});

test("Moving compatibility compares semantics while allowing target identities, Group and Horizon order to differ", async () => {
  const input = draft();
  input.windowType = "MovingStanzaWindow";
  input.movingStanza = { backward: { kind: "finite", value: 1 }, forward: { kind: "finite", value: 0 }, rowOrder: { kind: "columns", keys: [{ column: "time", direction: "ascending", comparator: { type: "number" } }] } };
  const source = dataset();
  source.rows = source.rows.map((row, index) => ({ ...row, time: index + 1 }));
  const ref = await artifact(input, source);
  const target = clone(ref.source.configuration);
  target.analysis.rotation = { type: "reference", referenceId: ref.referenceId, expectedContentSha256: ref.contentSha256 };
  const binding = await bind(ref, target);
  assert.equal(binding.sourceFit, "svd");
  const allowed = clone(target);
  allowed.units.group = { type: "none" };
  allowed.codes.reverse();
  allowed.codes[0].displayLabel = "Different presentation";
  allowed.analysis.model = { type: "SeparateTrajectory", horizonOrder: { kind: "columns", keys: [{ column: "later", direction: "descending", comparator: { type: "text", locale: "en", sensitivity: "base", numeric: false } }] } };
  assert.deepEqual((await bind(ref, allowed)).rotationSet, binding.rotationSet);
  const mutations: Array<[string, (config: Mutable<CanonicalStandardConfigV3>) => void]> = [
    ["Units", (config) => { config.units.columns = ["renamed"]; }],
    ["Horizons", (config) => { config.horizons.columns = ["renamed"]; }],
    ["weighting", (config) => { config.weighting = { type: "binary" }; }],
    ["Window", (config) => { config.window = { type: "Conversation" }; }],
    ["backward", (config) => { if (config.window.type === "MovingStanzaWindow") config.window.backward = { kind: "infinity" }; }],
    ["forward", (config) => { if (config.window.type === "MovingStanzaWindow") config.window.forward = { kind: "finite", value: 1 }; }],
    ["row field", (config) => { if (config.window.type === "MovingStanzaWindow" && config.window.rowOrder.kind === "columns") config.window.rowOrder.keys[0].column = "other"; }],
    ["direction", (config) => { if (config.window.type === "MovingStanzaWindow" && config.window.rowOrder.kind === "columns") config.window.rowOrder.keys[0].direction = "descending"; }],
    ["comparator", (config) => { if (config.window.type === "MovingStanzaWindow" && config.window.rowOrder.kind === "columns") config.window.rowOrder.keys[0].comparator = { type: "text", locale: "en", sensitivity: "base", numeric: false }; }],
    ["category levels", (config) => { if (config.window.type === "MovingStanzaWindow" && config.window.rowOrder.kind === "columns") config.window.rowOrder.keys[0].comparator = { type: "ordered-category", levels: [{ type: "number", value: 1 }, { type: "number", value: 2 }] }; }],
    ["missing Code", (config) => { config.codes[0].column = "missing"; }],
  ];
  for (const [label, change] of mutations) {
    const incompatible = clone(target);
    change(incompatible);
    await assert.rejects(() => bind(ref, incompatible), /Reference/i, label);
  }
  // Valid source artifacts with comparator policies absent from the target dataset can still be checked structurally.
  for (const comparator of [
    { type: "text", locale: "en", sensitivity: "variant", numeric: false },
    { type: "ordered-category", levels: [{ type: "number", value: 1 }, { type: "number", value: 2 }] },
    { type: "datetime", format: "ISO-8601", timeZone: "offset-in-value" },
  ] as const) {
    const imported = clone(ref);
    const policy: CanonicalRowOrderV3 = { kind: "columns", keys: [{ column: "time", direction: "ascending", comparator: clone(comparator) }] };
    if (imported.source.configuration.window.type !== "MovingStanzaWindow") throw new Error("Moving fixture");
    imported.source.configuration.window.rowOrder = policy;
    imported.compatibility.window.rowOrder = policy;
    await rehash(imported);
    const matching = clone(imported.source.configuration);
    matching.analysis.rotation = { type: "reference", referenceId: imported.referenceId, expectedContentSha256: imported.contentSha256 };
    await bind(imported, matching);
    if (matching.window.type !== "MovingStanzaWindow" || matching.window.rowOrder.kind !== "columns") throw new Error("Moving fixture");
    const changed = matching.window.rowOrder.keys[0].comparator;
    if (changed.type === "text") changed.locale = "de";
    if (changed.type === "ordered-category") changed.levels.reverse();
    if (changed.type === "datetime") (changed as unknown as { timeZone: string }).timeZone = "UTC";
    await assert.rejects(() => bind(imported, matching), /Reference|timeZone/i);
  }
});

test("Reference rejects rehashed runtime axis names that collide with Unit identity", async () => {
  const ref = clone(await artifact());
  ref.geometry.rotationColumns[0] = "__open_ena_unit_token";
  ref.geometry.nodeColumns[0] = "__open_ena_unit_token";
  ref.fit.estimableAxes[0] = "__open_ena_unit_token";
  await rehash(ref);
  const target = (await ready(targetDraft(ref))).canonicalConfiguration;
  await assert.rejects(() => bind(ref, target), /Reference.*axes/i);
});

test("Reference binding and plan capture detach caller data before hashing awaits", async () => {
  const ref = clone(await artifact());
  const config = clone((await ready(targetDraft(ref))).canonicalConfiguration);
  const bindingPromise = bind(ref, config);
  ref.geometry.nodes[0].coordinates[0] = 999;
  config.units.columns[0] = "changed-after-call";
  const binding = await bindingPromise;
  assert.notEqual(binding.artifact.geometry.nodes[0].coordinates[0], 999);
  const source = dataset();
  const compileResult = await ready(targetDraft(binding.artifact));
  const caller = clone(binding);
  const promise = buildStandardExecutionPlanV3({ dataset: source, datasetSha256: hash, compileResult, reference: caller });
  caller.rotationSet.centerVector[0] = 999;
  caller.artifact.geometry.nodes[0].coordinates[0] = 999;
  source.rows[0].A = 999;
  const plan = await promise;
  assert.notEqual(plan.reference?.rotationSet.centerVector[0], 999);
  const mutablePlan = clone(plan);
  const validation = validateExecutionPlanV3(mutablePlan);
  mutablePlan.reference!.rotationSet.rotationMatrix[0][0] = 999;
  mutablePlan.sourceProof.rows[0].values.A = 999;
  assert.deepEqual((await validation).reference, plan.reference);
});

test("Reference admission ledger is deterministic and cannot be forged", async () => {
  const plan = await targetPlan(await artifact());
  const binding = plan.reference!;
  assert.ok(binding.admission.incrementalNumericCells >= binding.rotationSet.rotationMatrix.length ** 2 * 8);
  assert.ok(binding.admission.incrementalPeakBytes > binding.admission.incrementalExportBytes);
  for (const key of ["incrementalNumericCells", "incrementalPeakBytes", "incrementalExportBytes"] as const) {
    const forged = clone(plan);
    forged.reference!.admission[key] = 0;
    await rehashStandardPlanForTestV3(forged);
    await assert.rejects(() => validateExecutionPlanV3(forged), /Reference admission/i);
  }
});

test("Combined Reference and target budget rejects before target rows and Reference matrix traversal", async () => {
  const plan = clone(await targetPlan(await artifact()));
  plan.header.resourceEstimate.estimatedPeakBytes = MAX_ESTIMATED_PEAK_BYTES_V3;
  let traversals = 0;
  const guard = <T extends object>(value: T) => new Proxy(value, { ownKeys() { traversals += 1; throw new Error("Premature scientific traversal"); } });
  plan.reference!.artifact.geometry.rotationMatrix = guard(plan.reference!.artifact.geometry.rotationMatrix);
  plan.rows = guard(plan.rows);
  plan.sourceProof.rows = guard(plan.sourceProof.rows);
  await assert.rejects(() => validateExecutionPlanV3(plan), /Reference.*combined|combined.*resource/i);
  assert.equal(traversals, 0);
});

test("Reference coherent descriptor capture rejects changing node coordinates", async () => {
  const ref = clone(await artifact());
  let reads = 0;
  const coordinates = ref.geometry.nodes[0].coordinates;
  ref.geometry.nodes[0].coordinates = new Proxy(coordinates, {
    getOwnPropertyDescriptor(target, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
      if (key === "0" && descriptor) return { ...descriptor, value: ++reads === 1 ? descriptor.value : 999 };
      return descriptor;
    },
  });
  await assert.rejects(() => bind(ref, (ref.source.configuration as CanonicalStandardConfigV3)), /Reference.*changed/i);
});

test("Reference matrix length growth is rejected before enumerating the oversized array", async () => {
  const ref = clone(await artifact());
  const target = (await ready(targetDraft(ref))).canonicalConfiguration;
  let lengthReads = 0;
  let enumerations = 0;
  ref.geometry.rotationMatrix = new Proxy(ref.geometry.rotationMatrix, {
    getOwnPropertyDescriptor(value, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (key === "length" && descriptor) return { ...descriptor, value: ++lengthReads === 1 ? 3 : 100_001 };
      return descriptor;
    },
    ownKeys(value) { enumerations += 1; return Reflect.ownKeys(value); },
  });
  await assert.rejects(() => bind(ref, target), /Reference|resource|length/i);
  assert.equal(enumerations, 0, "length admission must reject before array enumeration");
});

test("A four-Code Reference preserves all six axes while projecting the first three fixed node coordinates", async () => {
  const input = draft();
  input.codes.push("D");
  const source = dataset();
  source.headers.push("D");
  source.rows = source.rows.map((row, index) => ({ ...row, D: index + 1 }));
  const ref = await artifact(input, source);
  input.rotation = { type: "reference", referenceId: ref.referenceId, expectedContentSha256: ref.contentSha256 };
  const compileResult = await ready(input, source);
  const plan = await buildStandardExecutionPlanV3({ dataset: source, datasetSha256: hash, compileResult, reference: await bind(ref, compileResult.canonicalConfiguration) });
  const result = runStandardPlanV3(plan);
  assert.equal(result.projection.fullAxes.length, 6);
  assert.equal(result.projection.variance.length, 6);
  assert.equal(result.set.rotation.rotationMatrix.length, 6);
  assert.deepEqual(result.set.rotation, plan.reference!.rotationSet);
  assert.deepEqual(result.populations.sourceFit, ref.fit);
  assert.ok(result.set.rotation.nodes!.every((node) => Object.keys(node).length === 4));
});

test("Moving source-order confirmations may bind another target dataset and schedule all three Standard models", async () => {
  const input = draft();
  input.windowType = "MovingStanzaWindow";
  input.movingStanza.rowOrder = { kind: "source-order-confirmed", confirmation: {
    kind: "explicit-researcher-confirmation", analysisFamily: "standard", datasetSha256: hash, rowCount: 5,
    relevantColumns: ["horizon"], confirmedAt: "2026-09-05T00:00:00.000Z", confirmationVersion: 1,
  } };
  const ref = await artifact(input);
  const target = dataset();
  target.rows = target.rows.map((row, index) => ({ ...row, unit: "same-real-unit", group: "Different", horizon: `target-${index}`, time: index }));
  for (const model of ["EndPoint", "SeparateTrajectory", "AccumulatedTrajectory"] as const) {
    const targetInput = clone(input);
    targetInput.model = model;
    targetInput.rotation = { type: "reference", referenceId: ref.referenceId, expectedContentSha256: ref.contentSha256 };
    if (targetInput.movingStanza.rowOrder?.kind !== "source-order-confirmed") throw new Error("Confirmation fixture");
    targetInput.movingStanza.rowOrder.confirmation.datasetSha256 = "b".repeat(64);
    const compileResult = await ready(targetInput, target, "b".repeat(64));
    const plan = await buildStandardExecutionPlanV3({ dataset: target, datasetSha256: "b".repeat(64), compileResult, reference: await bind(ref, compileResult.canonicalConfiguration) });
    const result = runStandardPlanV3(await validateExecutionPlanV3(plan));
    assert.deepEqual(result.set.rotation, plan.reference!.rotationSet);
    assert.equal(result.populations.targetTokens.length, model === "EndPoint" ? 1 : 5);
    assert.deepEqual(result.populations.sourceFit, ref.fit);
  }
});

test("Mismatched target Code count is rejected before Code enumeration and quadratic edge construction", async () => {
  const ref = await artifact();
  const config = clone((await ready(targetDraft(ref))).canonicalConfiguration);
  let enumerations = 0;
  const mismatchedCodes = clone(config.codes);
  mismatchedCodes.push(...Array.from({ length: 9 }, (_unused, index) => ({ column: `code-${index}`, displayLabel: `code-${index}` })));
  config.codes = new Proxy(mismatchedCodes, {
    ownKeys(value) { enumerations += 1; return Reflect.ownKeys(value); },
  });
  await assert.rejects(() => bind(ref, config), /Reference.*Code/i);
  assert.equal(enumerations, 0);
});

test("Three identical fixed target coordinates have exactly zero measured variance", async () => {
  const ref = await artifact();
  const source = dataset();
  source.rows = [0, 1, 2].map((index) => ({ ...source.rows[0], unit: `same-${index}` }));
  const result = runStandardPlanV3(await targetPlan(ref, "EndPoint", source));
  assert.equal(result.projection.targetProjectionRank, 0);
  assert.deepEqual(result.projection.variance, [0, 0, 0]);
});
