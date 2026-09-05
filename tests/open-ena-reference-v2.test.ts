import assert from "node:assert/strict";
import test from "node:test";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import { sha256CanonicalJsonV3 } from "../lib/open-ena/model-v3/canonical-json";
import { compileStandardDraftV3 } from "../lib/open-ena/model-v3/compiler";
import { exactStandardResourceEstimateV3 } from "../lib/open-ena/model-v3/compiler-dataset";
import { buildStandardExecutionPlanV3, validateExecutionPlanV3, type StandardExecutionPlanV3 } from "../lib/open-ena/model-v3/execution-plan";
import type { StandardEnaDraftV3 } from "../lib/open-ena/model-v3/types";
import type { ParsedDataset } from "../lib/open-ena/types";

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
function clone<T>(value: T): Mutable<T> { return structuredClone(value) as Mutable<T>; }

async function api() {
  const path = "../lib/open-ena/model-v3/reference-v2";
  const loaded = await import(path).catch(() => null);
  assert.ok(loaded, "Task 13 Reference v2 module must exist");
  return loaded as typeof import("../lib/open-ena/model-v3/reference-v2");
}

function draft(means = false): StandardEnaDraftV3 {
  return {
    unitColumns: ["unit"], horizonColumns: ["horizon"], groupColumn: "group",
    codes: ["A", "B", "C"], weighting: "frequency", model: "EndPoint", windowType: "Conversation",
    movingStanza: { backward: { kind: "finite", value: 1 }, forward: { kind: "finite", value: 0 }, rowOrder: null },
    horizonOrder: { kind: "columns", keys: [{ column: "time", direction: "ascending", comparator: { type: "number" } }] },
    rotation: means
      ? { type: "means", centerAlignToOrigin: true, negativeLevel: { type: "string", value: "Control" }, positiveLevel: { type: "string", value: "Treatment" } }
      : { type: "svd", centerAlignToOrigin: true },
  };
}

function dataset(): ParsedDataset {
  return {
    name: "reference.csv", source: "upload", sizeBytes: 2048,
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

async function planFor(input = draft(), source = dataset(), hash = "a".repeat(64)): Promise<StandardExecutionPlanV3> {
  const compiled = await compileStandardDraftV3(source, hash, input);
  assert.equal(compiled.status, "ready", compiled.diagnostics.map((entry) => entry.id).join(", "));
  if (compiled.status !== "ready") throw new Error("Expected ready plan");
  return buildStandardExecutionPlanV3({ dataset: source, datasetSha256: hash, compileResult: compiled, reference: null });
}

async function reference(means = false) {
  const mod = await api();
  const plan = await planFor(draft(means));
  const source = await mod.fitReferenceSourceV3(plan);
  return { mod, plan, source, artifact: await mod.buildReferenceV2(source, { displayName: "Fit", currentPlan: plan }) };
}

test("Reference v2 identity is content-addressed and ignores the display alias", async () => {
  const { mod, plan, source, artifact } = await reference();
  const second = await mod.buildReferenceV2(source, { displayName: "Second", currentPlan: plan });
  assert.equal(artifact.contentSha256, second.contentSha256);
  assert.equal(artifact.referenceId, `open-ena-standard-ref-v2:${artifact.contentSha256}`);
  assert.equal(second.displayName, "Second");
  const { displayName: _alias, referenceId: _id, contentSha256: _hash, ...scientific } = artifact;
  assert.equal(await sha256CanonicalJsonV3(scientific), artifact.contentSha256);
});

test("Reference v2 rejects non-orthonormal or non-finite geometry before hash mismatch", async () => {
  const { mod, artifact } = await reference();
  const matrix = clone(artifact);
  matrix.geometry.rotationMatrix[0][0] = 2;
  await assert.rejects(() => mod.decodeReferenceV2(matrix), /orthonormal/i);
  const center = clone(artifact);
  center.geometry.centerVector[0] = Number.NaN;
  await assert.rejects(() => mod.decodeReferenceV2(center), /finite/i);
});

test("a current witness is required independently of an internally consistent stale fit", async () => {
  const { mod, plan, source } = await reference();
  const changed = await planFor(draft(), dataset(), "b".repeat(64));
  await assert.rejects(() => mod.buildReferenceV2(source, { displayName: "Stale", currentPlan: changed }), /current|stale/i);
  await assert.rejects(() => mod.buildReferenceV2(source, { displayName: "Missing" } as never), /current/i);
  await assert.rejects(() => mod.buildReferenceV2(runStandardPlanV3(plan) as never, { displayName: "Mutable", currentPlan: plan }), /witness|target-fitted/i);
  await assert.rejects(() => mod.buildReferenceV2(structuredClone(source), { displayName: "Clone", currentPlan: plan }), /witness|target-fitted/i);
});

test("Reference decoder accepts a standalone artifact and returns detached deeply frozen geometry", async () => {
  const { mod, artifact, plan } = await reference();
  const imported = clone(artifact);
  imported.displayName = "Imported alias";
  const decoded = await mod.decodeReferenceV2(imported);
  assert.equal(decoded.contentSha256, artifact.contentSha256);
  assert.equal(decoded.displayName, "Imported alias");
  assert.notEqual(decoded.geometry.rotationMatrix, imported.geometry.rotationMatrix);
  assert.ok(Object.isFrozen(decoded.geometry.rotationMatrix[0]));
  imported.geometry.rotationMatrix[0][0] = 999;
  assert.notEqual(decoded.geometry.rotationMatrix[0][0], 999);
  await assert.rejects(() => mod.buildReferenceV2(decoded as never, { displayName: "Launder", currentPlan: plan }), /witness|target-fitted/i);
});

for (const model of ["SeparateTrajectory", "AccumulatedTrajectory"] as const) {
  test(`${model} cannot mint a Reference source witness`, async () => {
    const mod = await api();
    const input = draft();
    input.model = model;
    const source = dataset();
    source.rows = source.rows.flatMap((row) => [row, { ...row, horizon: "later", time: 4, A: Number(row.A) + 1 }]);
    const plan = await planFor(input, source);
    await assert.rejects(() => mod.fitReferenceSourceV3(plan), /EndPoint/i);
  });
}

test("SVD and Means artifacts retain actual source provenance, full basis, and fixed nodes", async () => {
  for (const means of [false, true]) {
    const { artifact, plan, mod } = await reference(means);
    const result = runStandardPlanV3(plan);
    assert.equal(artifact.source.configurationSha256, plan.header.configurationSha256);
    assert.equal(artifact.source.executionPlanSha256, plan.header.executionPlanSha256);
    assert.equal(artifact.source.sourceProofSha256, plan.sourceProof.sourceProofSha256);
    assert.deepEqual(artifact.geometry.rotationMatrix, result.set.rotation.rotationMatrix);
    assert.deepEqual(artifact.geometry.centerVector, result.projection.centerVector);
    assert.deepEqual(artifact.geometry.rotationColumns, result.projection.fullAxes);
    assert.equal(artifact.fit.rank, result.projection.rank);
    assert.deepEqual(artifact.fit.estimableAxes, result.projection.estimableAxes);
    assert.deepEqual(artifact.fit.variance, result.projection.variance);
    assert.equal(artifact.fit.observationCount, 5);
    assert.equal(artifact.fit.method, means ? "means" : "svd");
    assert.equal(artifact.geometry.nodes.length, 3);
    assert.equal(Object.hasOwn(artifact.source, "rows"), false);
    assert.equal(JSON.stringify(artifact).includes("__open_ena_unit_v3_"), false);
    assert.deepEqual((await mod.decodeReferenceV2(artifact)).geometry, artifact.geometry);
  }
});

type Artifact = Awaited<ReturnType<typeof reference>>["artifact"];
async function rehash(artifact: Mutable<Artifact>): Promise<Mutable<Artifact>> {
  const { displayName: _alias, referenceId: _id, contentSha256: _hash, ...scientific } = artifact;
  artifact.contentSha256 = await sha256CanonicalJsonV3(scientific);
  artifact.referenceId = `open-ena-standard-ref-v2:${artifact.contentSha256}`;
  return artifact;
}

test("SVD decoder rejects rehashed rank three when only one eigenvalue supports a coordinate", async () => {
  const { mod, artifact } = await reference();
  assert.equal(artifact.fit.rank, 3);
  const overstated = clone(artifact);
  overstated.geometry.eigenvalues = [artifact.geometry.eigenvalues[0], 0, 0];
  overstated.fit.variance = [1, 0, 0];
  overstated.fit.rank = 3;
  overstated.fit.estimableAxes = [...artifact.geometry.rotationColumns];
  await rehash(overstated);
  await assert.rejects(() => mod.decodeReferenceV2(overstated), /rank.*eigenvalue|eigenvalue.*rank/i);
});

test("SVD decoder rejects rehashed rank one when three eigenvalues support coordinates", async () => {
  const { mod, artifact } = await reference();
  assert.equal(artifact.fit.rank, 3);
  const understated = clone(artifact);
  understated.fit.rank = 1;
  understated.fit.estimableAxes = [artifact.geometry.rotationColumns[0]];
  await rehash(understated);
  await assert.rejects(() => mod.decodeReferenceV2(understated), /rank.*eigenvalue|eigenvalue.*rank/i);
});

test("SVD decoder rejects rehashed small unordered eigenvalues that put a zero axis in the estimable prefix", async () => {
  const { mod, artifact } = await reference();
  const unordered = clone(artifact);
  unordered.geometry.eigenvalues = [1e-12, 0, 5e-10];
  unordered.fit.variance = [1 / 501, 0, 500 / 501];
  unordered.fit.rank = 2;
  unordered.fit.estimableAxes = ["SVD1", "SVD2"];
  await rehash(unordered);
  await assert.rejects(() => mod.decodeReferenceV2(unordered), /ordered eigenvalues/i);
});

test("SVD import rank uses the rounding floor and a strict greater-than threshold", async () => {
  const { mod, artifact } = await reference();
  const floor = (8 * Number.EPSILON * 3) ** 2;
  for (const [second, expectedRank] of [[floor * 0.5, 1], [floor, 1], [floor * 2, 2]] as const) {
    const imported = clone(artifact);
    imported.geometry.eigenvalues = [1e-20, second, 0];
    const total = imported.geometry.eigenvalues.reduce((sum, value) => sum + value, 0);
    imported.fit.variance = imported.geometry.eigenvalues.map((value) => value / total);
    imported.fit.rank = expectedRank;
    imported.fit.estimableAxes = imported.geometry.rotationColumns.slice(0, expectedRank);
    await rehash(imported);
    assert.equal((await mod.decodeReferenceV2(imported)).fit.rank, expectedRank);
    imported.fit.rank = expectedRank === 1 ? 2 : 1;
    imported.fit.estimableAxes = imported.geometry.rotationColumns.slice(0, imported.fit.rank);
    await rehash(imported);
    await assert.rejects(() => mod.decodeReferenceV2(imported), /rank.*eigenvalue|eigenvalue.*rank/i);
  }
});

test("Means decoder rejects rehashed zero-MR1 variance despite valid residual variance", async () => {
  const { mod, artifact } = await reference(true);
  const changed = clone(artifact);
  changed.fit.variance = [0, 1, 0];
  changed.fit.estimableAxes = ["MR1", "SVD2"];
  changed.fit.rank = 1;
  await rehash(changed);
  await assert.rejects(() => mod.decodeReferenceV2(changed), /MR1.*positive|positive.*MR1/i);
});

for (const perturbation of [0, 1e-7]) test(`SVD Reference preserves valid rank-one full geometry with perturbation ${perturbation}`, async () => {
  const mod = await api();
  const source = dataset();
  source.rows = [
    { unit: "c1", horizon: "h1", time: 1, group: "Control", A: 1, B: 1, C: 1 },
    { unit: "c2", horizon: "h2", time: 2, group: "Control", A: 1, B: 2, C: 3 },
    { unit: "t1", horizon: "h3", time: 3, group: "Treatment", A: 1, B: 1, C: 1 + perturbation },
    { unit: "t2", horizon: "h4", time: 4, group: "Treatment", A: 1, B: 2, C: 3 + perturbation },
  ];
  const plan = await planFor(draft(), source);
  const result = runStandardPlanV3(plan);
  assert.equal(result.projection.rank, 1);
  const artifact = await mod.buildReferenceV2(await mod.fitReferenceSourceV3(plan), { displayName: "Rank one", currentPlan: plan });
  assert.equal(artifact.fit.rank, 1);
  assert.deepEqual(artifact.fit.estimableAxes, ["SVD1"]);
  assert.deepEqual(artifact.geometry.rotationMatrix, result.set.rotation.rotationMatrix);
  assert.equal(artifact.geometry.rotationColumns.length, 3);
  if (perturbation !== 0) assert.ok(artifact.geometry.eigenvalues.slice(1).some((value) => value > 0), "positive subthreshold eigenvalues do not increase numerical rank");
  assert.deepEqual(await mod.decodeReferenceV2(artifact), artifact);
});

test("Means Reference retains a genuine positive MR1 variance below the residual relative threshold", async () => {
  const mod = await api();
  const source = dataset();
  const epsilon = 1e-8;
  source.rows = [
    { unit: "control", horizon: "h1", time: 1, group: "Control", A: 1, B: 1 - epsilon, C: 1 + epsilon },
    { unit: "treatment", horizon: "h2", time: 2, group: "Treatment", A: 1, B: 1 + epsilon, C: 1 - epsilon },
    { unit: "other1", horizon: "h3", time: 3, group: "Other", A: 1, B: 1, C: 1 },
    { unit: "other2", horizon: "h4", time: 4, group: "Other", A: 1, B: 2, C: 2 },
    { unit: "other3", horizon: "h5", time: 5, group: "Other", A: 1, B: 3, C: 3 },
  ];
  const plan = await planFor(draft(true), source);
  const result = runStandardPlanV3(plan);
  const variance = result.projection.variance;
  assert.ok(variance[0] > 0 && variance[0] < Math.max(...variance) * 1e-12);
  const artifact = await mod.buildReferenceV2(await mod.fitReferenceSourceV3(plan), { displayName: "Small MR1", currentPlan: plan });
  assert.deepEqual(artifact.fit.variance, variance);
  assert.ok(artifact.fit.estimableAxes.includes("MR1"));
  assert.deepEqual(artifact.geometry.rotationMatrix, result.set.rotation.rotationMatrix);
  assert.equal(artifact.geometry.rotationColumns.length, 3);
  assert.deepEqual(await mod.decodeReferenceV2(artifact), artifact);
});

const mutations: Array<[string, (value: Mutable<Artifact>) => void, RegExp]> = [
  ["duplicate Codes", (value) => { value.basis.codes[1] = value.basis.codes[0]; }, /Code/i],
  ["incomplete edges", (value) => { value.basis.edges.pop(); }, /edge/i],
  ["duplicate undirected edge", (value) => { value.basis.edges[1] = { source: value.basis.edges[0].target, target: value.basis.edges[0].source }; }, /edge/i],
  ["self edge", (value) => { value.basis.edges[0].target = value.basis.edges[0].source; }, /edge/i],
  ["duplicate axes", (value) => { value.geometry.rotationColumns[1] = value.geometry.rotationColumns[0]; }, /axes/i],
  ["nonsquare matrix", (value) => { value.geometry.rotationMatrix[0].pop(); }, /rotation/i],
  ["negative center", (value) => { value.geometry.centerVector[0] = -0.1; }, /center/i],
  ["center outside sphere", (value) => { value.geometry.centerVector.fill(0.9); }, /center/i],
  ["zero center", (value) => { value.geometry.centerVector.fill(0); }, /center/i],
  ["missing node", (value) => { value.geometry.nodes.pop(); }, /node/i],
  ["duplicate node", (value) => { value.geometry.nodes[1] = value.geometry.nodes[0]; }, /node/i],
  ["invented node axis", (value) => { value.geometry.nodeColumns[0] = "fake"; }, /node/i],
  ["negative eigenvalue", (value) => { value.geometry.eigenvalues[0] = -1; }, /eigenvalue/i],
  ["SVD eigenvalue variance mismatch", (value) => { value.geometry.eigenvalues[0] *= 2; }, /eigenvalue/i],
  ["invalid intrinsic rank", (value) => { value.fit.rank = 4; }, /rank/i],
  ["invalid estimable axes", (value) => { value.fit.estimableAxes = []; }, /estimable/i],
  ["invented fit population", (value) => { value.fit.observationCount = 6; }, /observation/i],
  ["runtime drift", (value) => { value.source.runtime.runtimeVersion = "unknown"; }, /runtime/i],
  ["build drift", (value) => { value.source.runtime.algorithmBuildSha = "b".repeat(40); }, /build/i],
  ["malformed source hash", (value) => { value.source.executionPlanSha256 = "unknown"; }, /SHA-256/i],
  ["coercible dataset hash kind", (value) => { Object.assign(value.source.datasetBinding, { hashKind: [value.source.datasetBinding.hashKind] }); }, /hash kind/i],
  ["weighting mismatch", (value) => { value.compatibility.weighting.type = "binary"; }, /compatibility/i],
  ["Unit field mismatch", (value) => { value.compatibility.unitFields[0] = "renamed"; }, /compatibility/i],
  ["Horizon field mismatch", (value) => { value.compatibility.horizonFields[0] = "renamed"; }, /compatibility/i],
  ["extra scientific key", (value) => { Object.assign(value.geometry, { fallback: "svd" }); }, /exact keys/i],
];
for (const [name, mutate, pattern] of mutations) {
  test(`strict decoder rejects ${name} even after content hash is recomputed`, async () => {
    const { mod, artifact } = await reference();
    const changed = clone(artifact);
    mutate(changed);
    await rehash(changed);
    await assert.rejects(() => mod.decodeReferenceV2(changed), pattern);
  });
}

test("hash and exact-key rejection includes ID tampering, altered fixed nodes, and download metadata", async () => {
  const { mod, artifact } = await reference();
  const id = clone(artifact);
  id.referenceId += "x";
  await assert.rejects(() => mod.decodeReferenceV2(id), /ID/i);
  const node = clone(artifact);
  node.geometry.nodes[0].coordinates[0] += 0.01;
  await assert.rejects(() => mod.decodeReferenceV2(node), /content SHA-256/i);
  await assert.rejects(() => mod.decodeReferenceV2({ ...artifact, downloadedAt: "now" }), /exact keys/i);
});

test("Means decoder validates ordered contrast metadata and disjoint counts", async () => {
  const { mod, artifact } = await reference(true);
  for (const mutate of [
    (value: Mutable<Artifact>) => { value.fit.means!.negativeCount = 0; },
    (value: Mutable<Artifact>) => { value.fit.means!.positiveCount = 5; },
    (value: Mutable<Artifact>) => { value.fit.means!.positiveLevel = value.fit.means!.negativeLevel; },
    (value: Mutable<Artifact>) => { value.geometry.eigenvalues = [1, 0, 0]; },
  ]) {
    const changed = clone(artifact);
    mutate(changed);
    await rehash(changed);
    await assert.rejects(() => mod.decodeReferenceV2(changed), /Means|count|contrast/i);
  }
  const sameLevels = clone(artifact);
  const rotation = sameLevels.source.configuration.analysis.rotation;
  if (rotation.type !== "means") throw new Error("Expected Means source");
  rotation.contrast.positiveLevel = rotation.contrast.negativeLevel;
  sameLevels.fit.means!.positiveLevel = rotation.contrast.negativeLevel;
  sameLevels.source.configurationSha256 = await sha256CanonicalJsonV3(sameLevels.source.configuration);
  await rehash(sameLevels);
  await assert.rejects(() => mod.decodeReferenceV2(sameLevels), /distinct|contrast/i);
});

test("ONA, TMA, projected Endpoint, and imported artifacts cannot become fresh source witnesses", async () => {
  const { mod, artifact, plan } = await reference();
  for (const family of ["ONA", "TMA"]) {
    await assert.rejects(() => mod.decodeReferenceV2({ ...artifact, family }), /Standard/i);
    await assert.rejects(() => mod.fitReferenceSourceV3({ ...plan, header: { ...plan.header, analysisFamily: family.toLowerCase() } }));
  }
  const projected = clone(plan);
  projected.configuration.analysis.rotation = { type: "reference", referenceId: artifact.referenceId, expectedContentSha256: artifact.contentSha256 };
  await assert.rejects(() => mod.fitReferenceSourceV3(projected), /Reference|reference/i);
  assert.deepEqual(await mod.decodeReferenceV2(artifact), artifact, "the original standalone artifact remains downloadable without minting");
});

test("admission rejects impossible Code and matrix arrays before enumeration or accessors", async () => {
  const { mod, artifact } = await reference();
  let ownKeys = 0;
  const huge = new Proxy(new Array(100_000), { ownKeys() { ownKeys += 1; throw new Error("must not enumerate"); } });
  await assert.rejects(() => mod.decodeReferenceV2({ ...artifact, basis: { ...artifact.basis, codes: huge } }), /resource budget/i);
  assert.equal(ownKeys, 0);
  const hugeMatrixRow = new Proxy(new Array(100_000), { ownKeys() { ownKeys += 1; throw new Error("must not enumerate"); } });
  await assert.rejects(() => mod.decodeReferenceV2({ ...artifact, geometry: { ...artifact.geometry, rotationMatrix: [hugeMatrixRow, [0, 1, 0], [0, 0, 1]] } }), /rotation|resource budget/i);
  assert.equal(ownKeys, 0);
  let getterCalls = 0;
  const accessor = clone(artifact);
  Object.defineProperty(accessor.geometry.rotationMatrix[0], "0", { enumerable: true, get() { getterCalls += 1; return 1; } });
  await assert.rejects(() => mod.decodeReferenceV2(accessor), /accessor|data property/i);
  assert.equal(getterCalls, 0);
});

test("decoder snapshots caller-owned data before hashing awaits", async () => {
  const { mod, artifact } = await reference();
  const input = clone(artifact);
  const pending = mod.decodeReferenceV2(input);
  input.geometry.rotationMatrix[0][0] = 100;
  input.displayName = "Late mutation";
  const decoded = await pending;
  assert.deepEqual(decoded, artifact);
});

test("witness and current-plan validation each capture before their async boundary", async () => {
  const mod = await api();
  const plan = await planFor();
  const input = clone(plan);
  const pending = mod.fitReferenceSourceV3(input);
  input.sourceProof.rows[0].values.A = 999;
  const witness = await pending;
  const current = clone(plan);
  const minted = mod.buildReferenceV2(witness, { displayName: "Fit", currentPlan: current });
  current.sourceProof.rows[0].values.A = 999;
  assert.equal((await minted).source.executionPlanSha256, plan.header.executionPlanSha256);
});

test("Moving compatibility preserves policy structure and effective extents, excluding dataset confirmation identity", async () => {
  const mod = await api();
  const input = draft();
  input.windowType = "MovingStanzaWindow";
  const source = dataset();
  source.rows.forEach((row, index) => { row.time = index + 1; });
  input.movingStanza.rowOrder = { kind: "columns", keys: [{ column: "time", direction: "descending", comparator: { type: "number" } }] };
  const plan = await planFor(input, source);
  const artifact = await mod.buildReferenceV2(await mod.fitReferenceSourceV3(plan), { displayName: "Moving", currentPlan: plan });
  assert.deepEqual(artifact.compatibility.window.rowOrder, input.movingStanza.rowOrder);
  assert.deepEqual(artifact.compatibility.window.backward, { kind: "finite", value: 1 });
  input.movingStanza.rowOrder = { kind: "source-order-confirmed", confirmation: {
    kind: "explicit-researcher-confirmation", analysisFamily: "standard", datasetSha256: "a".repeat(64), rowCount: source.rows.length,
    relevantColumns: ["horizon"], confirmedAt: "2026-09-05T00:00:00.000Z", confirmationVersion: 1,
  } };
  const confirmed = await planFor(input, source);
  const confirmedArtifact = await mod.buildReferenceV2(await mod.fitReferenceSourceV3(confirmed), { displayName: "Confirmed", currentPlan: confirmed });
  assert.deepEqual(confirmedArtifact.compatibility.window.rowOrder, { kind: "source-order-confirmed" });
  const staleConfirmation = clone(confirmedArtifact);
  const window = staleConfirmation.source.configuration.window;
  assert.equal(window.type, "MovingStanzaWindow");
  if (window.type !== "MovingStanzaWindow" || window.rowOrder.kind !== "source-order-confirmed") throw new Error("Expected confirmed window");
  window.rowOrder.confirmation.datasetSha256 = "b".repeat(64);
  staleConfirmation.source.configurationSha256 = await sha256CanonicalJsonV3(staleConfirmation.source.configuration);
  await rehash(staleConfirmation);
  await assert.rejects(() => mod.decodeReferenceV2(staleConfirmation), /confirmation/i);
});

async function rehashPlan(plan: Mutable<StandardExecutionPlanV3>): Promise<void> {
  const { sourceProofSha256: _proofHash, ...proof } = plan.sourceProof;
  plan.sourceProof.sourceProofSha256 = await sha256CanonicalJsonV3(proof);
  const { executionPlanSha256: _planHash, ...header } = plan.header;
  plan.header.executionPlanSha256 = await sha256CanonicalJsonV3({ ...plan, header });
}

test("owned source factory reruns scientific readiness on a coherent all-zero selected Code replacement", async () => {
  const mod = await api();
  const source = dataset();
  source.headers.push("D");
  source.rows.forEach((row, index) => { row.D = index + 1; });
  const input = draft();
  input.codes.push("D");
  const plan = clone(await planFor(input, source));
  plan.sourceProof.rows.forEach((row) => { row.values.A = 0; });
  const token = plan.codeDictionary.codes.find((entry) => entry.sourceColumn === "A")!.token;
  plan.rows.forEach((row) => { row.codeValues[token] = 0; });
  await rehashPlan(plan);
  await validateExecutionPlanV3(plan);
  assert.ok(runStandardPlanV3(plan).projection.rank > 0, "runtime rank guard alone does not detect an all-zero selected Code");
  await assert.rejects(() => mod.fitReferenceSourceV3(plan), /STANDARD_CODE_ALL_ZERO/);
});

test("owned SVD source rejects coherent Unit-unstable Group metadata", async () => {
  const mod = await api();
  const source = dataset();
  source.rows.push({ ...source.rows[0] });
  const plan = clone(await planFor(draft(), source));
  const proofRow = plan.sourceProof.rows.find((row) => row.sourceRowIndex === 5)!;
  proofRow.values.group = "Treatment";
  const groupToken = plan.identityDictionary.groups.find((entry) => entry.fields[0].value.value === "Treatment")!.token;
  plan.rows.find((row) => row.sourceRowIndex === 5)!.groupToken = groupToken;
  source.rows[5].group = "Treatment";
  plan.header.resourceEstimate = clone(exactStandardResourceEstimateV3(source, plan.configuration));
  await rehashPlan(plan);
  await validateExecutionPlanV3(plan);
  assert.ok(runStandardPlanV3(plan).projection.rank > 0);
  await assert.rejects(() => mod.fitReferenceSourceV3(plan), /STANDARD_GROUP_UNSTABLE/);
});

for (const means of [false, true]) test(`four Codes retain full six-column ${means ? "Means" : "SVD"} basis and only actual node coordinates`, async () => {
  const mod = await api();
  const input = draft(means);
  input.codes = ["C", "D", "A", "B"];
  const source = dataset();
  source.headers.push("D");
  source.rows.forEach((row, index) => { row.D = index + 1; });
  const plan = await planFor(input, source);
  const result = runStandardPlanV3(plan);
  const artifact = await mod.buildReferenceV2(await mod.fitReferenceSourceV3(plan), { displayName: "Six axes", currentPlan: plan });
  assert.deepEqual(artifact.geometry.rotationMatrix, result.set.rotation.rotationMatrix);
  assert.equal(artifact.geometry.rotationColumns.length, 6);
  assert.equal(artifact.geometry.rotationMatrix.length, 6);
  assert.equal(artifact.geometry.nodeColumns.length, 3);
  assert.ok(artifact.geometry.nodes.every((node) => node.coordinates.length === 3));
  assert.ok(artifact.fit.rank < 6);
  assert.deepEqual(artifact.fit.estimableAxes, result.projection.estimableAxes);
  assert.equal(artifact.fit.rank, result.projection.rank);
  assert.deepEqual(artifact.basis.codes.map((entry) => entry.value), ["A", "B", "C", "D"]);
  const originalNodes = new Map(result.set.rotation.nodes!.map((row) => [String(row.code), row]));
  for (const node of artifact.geometry.nodes) {
    const token = plan.codeDictionary.codes.find((entry) => entry.sourceColumn === node.code.value)!.token;
    assert.deepEqual(node.coordinates, artifact.geometry.nodeColumns.map((axis) => originalNodes.get(token)![axis]));
  }
});

test("metadata contracts may have more than 256 field names within the existing byte budget", async () => {
  const mod = await api();
  const input = draft();
  const source = dataset();
  for (let index = 0; index < 270; index += 1) {
    const column = `unit_field_${index}`;
    input.unitColumns.push(column);
    source.headers.push(column);
    source.rows.forEach((row) => { row[column] = row.unit; });
  }
  const plan = await planFor(input, source);
  const artifact = await mod.buildReferenceV2(await mod.fitReferenceSourceV3(plan), { displayName: "Many fields", currentPlan: plan });
  assert.equal(artifact.compatibility.unitFields.length, 271);
  assert.deepEqual((await mod.decodeReferenceV2(artifact)).compatibility.unitFields, input.unitColumns);
});
