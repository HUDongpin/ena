import { parseCsv } from "../lib/open-ena/csv";
import { SAMPLE_CONFIG } from "../lib/open-ena/types";
import { runOpenEnaInferenceV2 } from "../lib/open-ena/inference-v2";
import { assertOpenEnaInferenceCoordinatorConsumerV2, parseOpenEnaInferenceResultV2 } from "../lib/open-ena/inference-consumers";
import { bindOnaResultV3 } from "../lib/open-ena/model-v3/ona-result-binding";
import { buildOnaExecutionPlanV3, runOnaPlanV3 } from "../lib/open-ena/model-v3/ona-adapter";
import { decodeCanonicalOnaConfigV3 } from "../lib/open-ena/model-v3/schema";
import { createDirectionalMask } from "../lib/open-ena/network-config";
import type { ParsedDataset } from "../lib/open-ena/types";
import { OPEN_ENA_RUNTIME_POLICY_VERSION_V3, OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3 } from "../lib/open-ena/model-v3/types";
import assert from "node:assert/strict";
import test from "node:test";
import { analyzeDataset, runStandardPlanV3 } from "../lib/open-ena/analyze";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";
import { bindResultV3, scientificResultHashPayloadV3 } from "../lib/open-ena/model-v3/result-binding";
import { sha256CanonicalJsonV3 } from "../lib/open-ena/model-v3/canonical-json";
import { buildReferenceV2, fitReferenceSourceV3 } from "../lib/open-ena/model-v3/reference-v2";
import type { BoundStandardResultV3, OpenEnaStandardReferenceV2, ScalarIdentityV3 } from "../lib/open-ena/model-v3/types";
import type { OpenEnaExecutionPlanV3 } from "../lib/open-ena/model-v3/execution-plan";

type Controls = { primaryGroup: ScalarIdentityV3; secondaryGroup: ScalarIdentityV3; axes: [string, string]; hiddenCodes?: string[]; hiddenGroups?: ScalarIdentityV3[] };
async function api() {
  const consumers = await import("../lib/open-ena/inference-consumers");
  const inference = await import("../lib/open-ena/inference-v2");
  const contrasts = await import("../lib/open-ena/contrasts");
  const result = {
    buildInferenceInputV3: consumers.buildInferenceInputV3,
    runOpenEnaInferenceV3: inference.runOpenEnaInferenceV3,
    buildContrastV3: contrasts.buildContrastV3,
    assertOpenEnaInferenceCoordinatorConsumerV3: inference.assertOpenEnaInferenceCoordinatorConsumerV3,
  };
  for (const [name, fn] of Object.entries(result)) assert.equal(typeof fn, "function", `Task21 must export ${name}`);
  return result;
}
async function fixture(modify?: Parameters<typeof bindingFixtureV3>[1], reference?: OpenEnaStandardReferenceV2) {
  const f = await bindingFixtureV3(reference ? "c".repeat(64) : undefined, modify, reference);
  const result = await bindResultV3(f.plan, runStandardPlanV3(f.plan), { processedRows: f.plan.rows.length, maximumBufferedRows: 0, numericCellsAllocated: 120, peakBytesObservedOrBounded: 10240, observationMethod: "exact-counters-and-conservative-byte-bound" }, f.compiled.diagnostics);
  return { ...f, result };
}
function controls(result: BoundStandardResultV3): Controls { return { primaryGroup: { type: "string", value: "Control" }, secondaryGroup: { type: "string", value: "Treatment" }, axes: result.executionProvenance.projection.estimableAxes.slice(0, 2) as [string, string] }; }

test("stale results and missing/invalid independent plans cannot enter inference or contrasts", async () => {
  const a = await api(), f = await fixture(), other = await bindingFixtureV3("b".repeat(64));
  for (const consumer of [a.buildInferenceInputV3, a.runOpenEnaInferenceV3, a.buildContrastV3]) {
    await assert.rejects(() => consumer(f.result, other.plan, controls(f.result)), /stale/i);
    for (const plan of [undefined, null, false, 0, "", {}, f.result.binding]) await assert.rejects(() => consumer(f.result, plan, controls(f.result)), /plan|object|record/i);
  }
});

test("Means with one Unit per fitted group is blocked by the bound capability", async () => {
  const a = await api(), f = await fixture((draft, data) => { data.rows = data.rows.slice(0, 2); draft.rotation = { type: "means", centerAlignToOrigin: true, negativeLevel: { type: "string", value: "Control" }, positiveLevel: { type: "string", value: "Treatment" } }; });
  for (const consumer of [a.buildInferenceInputV3, a.runOpenEnaInferenceV3, a.buildContrastV3]) await assert.rejects(() => consumer(f.result, f.plan, { ...controls(f.result), axes: f.result.executionProvenance.projection.fullAxes.slice(0, 2) as [string, string] }), /group-inference.*blocked/i);
});

test("visibility leaves complete scientific contrast and actual coordinator inference invariant", async () => {
  const a = await api(), f = await fixture(), visible = controls(f.result), hidden = { ...visible, hiddenCodes: f.result.configuration.codes.map((code) => code.column), hiddenGroups: [visible.primaryGroup, visible.secondaryGroup] };
  const plain = await a.buildContrastV3(f.result, f.plan, visible), filtered = await a.buildContrastV3(f.result, f.plan, hidden);
  assert.deepEqual(plain.primary, filtered.primary); assert.deepEqual(plain.secondary, filtered.secondary); assert.deepEqual(plain.geometry, filtered.geometry); assert.equal(plain.inference, null);
  const before = await a.runOpenEnaInferenceV3(f.result, f.plan, visible), after = await a.runOpenEnaInferenceV3(f.result, f.plan, hidden);
  assert.deepEqual(before.inference, after.inference); assert.equal(before.inference.status, "available"); assert.equal(await a.assertOpenEnaInferenceCoordinatorConsumerV3(before, f.result, f.plan, before.controls), before);
  await assert.rejects(() => a.assertOpenEnaInferenceCoordinatorConsumerV3(structuredClone(before), f.result, f.plan, before.controls), /authority/i);
  assert.deepEqual(before.binding, f.result.binding); assert.deepEqual(before.configuration, f.result.configuration);
  assert.equal(before.provenance.projectionAuthority, "target-fitted"); assert.equal(before.provenance.varianceMeaning, "fitted-space variance");
  assert.equal(before.inference.ledger?.includedEntityCount, 4); assert.equal(plain.primary.unitCount, 2);
});

test("self-rehashed geometry and forged binding reject at both consumer gates", async () => {
  const a = await api(), f = await fixture();
  for (const mutation of ["coordinates", "weights", "binding"] as const) {
    const forged = structuredClone(f.result);
    if (mutation === "coordinates") forged.set.points[0][controls(f.result).axes[0]] = 99;
    if (mutation === "weights") forged.set.lineWeights[0][forged.set.codeColumns[0]] = 0.9;
    if (mutation === "binding") Object.assign(forged.binding, { configurationSha256: "f".repeat(64) });
    Object.assign(forged.binding, { scientificResultSha256: await sha256CanonicalJsonV3(scientificResultHashPayloadV3(forged)) });
    for (const consumer of [a.buildInferenceInputV3, a.runOpenEnaInferenceV3, a.buildContrastV3]) await assert.rejects(() => consumer(forged, f.plan, controls(f.result)));
  }
});

test("after-call mutation cannot alter captured plan, data, controls, visibility or provenance", async () => {
  const a = await api(), f = await fixture();
  for (const consumer of [a.buildInferenceInputV3, a.runOpenEnaInferenceV3, a.buildContrastV3]) {
    const result = structuredClone(f.result), plan = structuredClone(f.plan), options = controls(f.result);
    const pending = consumer(result, plan, options);
    result.set.points[0][options.axes[0]] = 123; Object.assign(result.binding, { scientificResultSha256: "e".repeat(64) });
    Object.assign(plan.header, { executionPlanSha256: "f".repeat(64) }); options.primaryGroup = options.secondaryGroup; options.axes.reverse(); options.hiddenCodes = ["changed"];
    const accepted = await pending;
    assert.deepEqual(accepted.binding, f.result.binding); assert.deepEqual(accepted.result.set, f.result.set); assert.deepEqual(accepted.controls, { ...controls(f.result), hiddenCodes: [], hiddenGroups: [] });
    assert.ok(Object.isFrozen(accepted)); assert.ok(Object.isFrozen(accepted.result.set.points[0]));
  }
});

test("typed numeric and textual Group identities remain distinct with exact Unit membership", async () => {
  const a = await api(), f = await fixture((_draft, data) => { data.rows = data.rows.slice(0, 4).map((row, i) => ({ ...row, unit: i < 2 ? (i === 0 ? 1 : "1") : row.unit, group: i % 2 === 0 ? 1 : "1" })); });
  const selected = { ...controls(f.result), primaryGroup: { type: "number", value: 1 } as const, secondaryGroup: { type: "string", value: "1" } as const };
  const contrast = await a.buildContrastV3(f.result, f.plan, selected), inference = await a.runOpenEnaInferenceV3(f.result, f.plan, selected);
  assert.equal(contrast.primary.unitCount, 2); assert.equal(new Set(contrast.primary.unitIds).size, 2); assert.equal(inference.inference.ledger?.includedEntityCount, 4);
  assert.notDeepEqual(inference.controls.primaryGroup, inference.controls.secondaryGroup);
  assert.deepEqual(contrast.primary.unitIds, f.result.set.points.filter((row) => row.Group === f.plan.identityDictionary.groups.find((g) => g.fields[0].value.type === "number")!.displayLabel).map((row) => String(row.ENA_UNIT)));
});

test("Means MR1 retains bound direction and descriptive construction limitation", async () => {
  const a = await api(), f = await fixture((draft) => { draft.rotation = { type: "means", centerAlignToOrigin: true, negativeLevel: { type: "string", value: "Treatment" }, positiveLevel: { type: "string", value: "Control" } }; });
  const inference = await a.runOpenEnaInferenceV3(f.result, f.plan, controls(f.result)), contrast = await a.buildContrastV3(f.result, f.plan, controls(f.result));
  assert.deepEqual(inference.provenance.meansBinding, f.result.executionProvenance.meansBinding); assert.deepEqual(contrast.provenance.meansBinding, inference.provenance.meansBinding);
  assert.match(inference.provenance.interpretation, /descriptive by construction/); assert.match(contrast.provenance.interpretation, /independent confirmation/);
  assert.ok(inference.inference.warnings.includes("mr1-circularity"));
});

test("Reference inference and contrast keep source geometry and target variance meaning", async () => {
  const a = await api(), source = await fixture(), reference = await buildReferenceV2(await fitReferenceSourceV3(source.plan), { displayName: "Inference reference", currentPlan: source.plan });
  const f = await fixture((draft, data) => { draft.rotation = { type: "reference", referenceId: reference.referenceId, expectedContentSha256: reference.contentSha256 }; data.rows[0].B = 7; }, reference);
  const inference = await a.runOpenEnaInferenceV3(f.result, f.plan, controls(f.result)), contrast = await a.buildContrastV3(f.result, f.plan, controls(f.result));
  for (const value of [inference, contrast]) { assert.equal(value.provenance.projectionAuthority, "fixed-reference-target-projection"); assert.equal(value.provenance.varianceMeaning, "target variance along fixed reference axes"); assert.deepEqual(value.binding, f.result.binding); }
  assert.deepEqual(contrast.geometry.rotationMatrix, f.result.set.rotation.rotationMatrix); assert.deepEqual(contrast.geometry.centerVector, reference.geometry.centerVector);
  assert.equal(await a.assertOpenEnaInferenceCoordinatorConsumerV3(inference, f.result, f.plan, inference.controls), inference);
});

test("invalid or ambiguous Group/axis controls reject and endpoint bridge never guesses trajectory steps", async () => {
  const a = await api(), f = await fixture(), good = controls(f.result);
  for (const options of [{ ...good, axes: [good.axes[0], good.axes[0]] }, { ...good, axes: [good.axes[0], "missing"] }, { ...good, primaryGroup: good.secondaryGroup }, { ...good, primaryGroup: { type: "number", value: 1 } }, { ...good, primaryGroup: "Control" }, {}]) {
    for (const consumer of [a.buildInferenceInputV3, a.runOpenEnaInferenceV3, a.buildContrastV3]) await assert.rejects(() => consumer(f.result, f.plan, options as Controls), /axes|Group|group|controls/i);
  }
  const trajectory = await fixture((draft, data) => { draft.model = "SeparateTrajectory"; data.rows = data.rows.flatMap((row) => [row, { ...row, horizon: "later", time: 4, A: row.C, C: row.A }]); });
  for (const consumer of [a.buildInferenceInputV3, a.runOpenEnaInferenceV3, a.buildContrastV3]) await assert.rejects(() => consumer(trajectory.result, trajectory.plan as OpenEnaExecutionPlanV3, controls(trajectory.result)), /endpoint/i);
});

async function boundOna(hash = "d".repeat(64)) {
  const codes = ["A", "B", "C"];
  const directionalMask = createDirectionalMask(codes);
  directionalMask.enabled[0][1] = false;
  const configuration = decodeCanonicalOnaConfigV3({
    schemaVersion: 3,
    analysisFamily: "ona",
    contracts: {
      validationContractVersion: OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3,
      runtimePolicyVersion: OPEN_ENA_RUNTIME_POLICY_VERSION_V3,
    },
    units: { columns: ["unit"], group: { type: "stable-metadata", column: "group" } },
    horizons: { columns: ["horizon"] },
    codes: codes.map((column) => ({ column, displayLabel: column })),
    model: { type: "EndPoint" },
    weighting: { type: "frequency", engineMethod: "sum" },
    window: {
      type: "MovingStanzaWindow",
      backward: { kind: "finite", value: 2 },
      forward: 0,
      rowOrder: {
        kind: "columns",
        keys: [{ column: "time", direction: "ascending", comparator: { type: "number" } }],
      },
    },
    rotation: { type: "svd", centerAlignToOrigin: true },
    directionalMask,
  });
  const dataset: ParsedDataset = {
    name: "ona-methods.csv",
    source: "upload",
    sizeBytes: 512,
    headers: ["unit", "horizon", "time", "group", ...codes],
    rows: [
      { unit: "u1", horizon: "h1", time: 1, group: "g1", A: 2, B: 0, C: 1 },
      { unit: "u2", horizon: "h1", time: 2, group: "g2", A: 0, B: 3, C: 1 },
      { unit: "u1", horizon: "h2", time: 1, group: "g1", A: 0, B: 2, C: 2 },
      { unit: "u3", horizon: "h2", time: 2, group: "g1", A: 1, B: 1, C: 0 },
    ],
  };
  const plan = await buildOnaExecutionPlanV3(dataset, hash, configuration);
  const result = await bindOnaResultV3(plan, runOnaPlanV3(plan), {
    processedRows: dataset.rows.length,
    maximumRetainedRowsAfterChunk: 0,
    bufferedRowsPeakUpperBound: Math.min(dataset.rows.length, plan.header.resourceEstimate.estimatedRetainedWindowRows + 1),
    numericCellsUpperBound: plan.operationalAdmission.totalNumericCells,
    peakBytesUpperBound: plan.operationalAdmission.totalPeakBytes,
    observationMethod: "dimension-bounds-and-chunk-boundary-stream-state",
  });
  return { plan, result };
}


test("ONA remains blocked at every v3 inference/contrast consumer", async () => {
  const a = await api(), f = await boundOna();
  const selected: Controls = { primaryGroup: { type: "string", value: "g1" }, secondaryGroup: { type: "string", value: "g2" }, axes: ["SVD1", "SVD2"] };
  for (const consumer of [a.buildInferenceInputV3, a.runOpenEnaInferenceV3, a.buildContrastV3]) await assert.rejects(() => consumer(f.result, f.plan, selected), /group-inference.*blocked/i);
});

test("one-axis SVD keeps its valid model but reports the two-supported-axis request limit", async () => {
  const a = await api(), f = await fixture((_draft, data) => { data.rows = data.rows.slice(0, 4).map((row, i) => ({ ...row, A: i % 2 ? 2 : 1, B: i % 2 ? 1 : 2, C: 1 })); });
  assert.equal(f.result.executionProvenance.projection.rank, 1);
  assert.equal(f.result.capabilityStatus["build-model"], "available");
  const selected = { ...controls(f.result), axes: f.result.executionProvenance.projection.fullAxes.slice(0, 2) as [string, string] };
  for (const consumer of [a.buildInferenceInputV3, a.runOpenEnaInferenceV3, a.buildContrastV3]) await assert.rejects(() => consumer(f.result, f.plan, selected), /two.*supported.*axes/i);
  assert.equal(f.result.capabilityStatus["build-model"], "available");
});

test("Reference target rank zero retains fixed supported axes and coordinator degeneracy", async () => {
  const a = await api(), source = await fixture(), reference = await buildReferenceV2(await fitReferenceSourceV3(source.plan), { displayName: "Fixed target degeneration", currentPlan: source.plan });
  const f = await fixture((draft, data) => { draft.rotation = { type: "reference", referenceId: reference.referenceId, expectedContentSha256: reference.contentSha256 }; data.rows = data.rows.map((row) => ({ ...row, A: 1, B: 2, C: 3 })); }, reference);
  assert.equal(f.result.executionProvenance.projection.targetProjectionRank, 0);
  const inference = await a.runOpenEnaInferenceV3(f.result, f.plan, controls(f.result));
  assert.equal(inference.inference.status, "not-estimable");
  assert.ok(inference.inference.rows.every((row) => row.status === "not-estimable"));
  assert.equal(inference.provenance.projectionAuthority, "fixed-reference-target-projection");
  assert.equal(await a.assertOpenEnaInferenceCoordinatorConsumerV3(inference, f.result, f.plan, inference.controls), inference);
  assert.deepEqual((await a.buildContrastV3(f.result, f.plan, controls(f.result))).geometry.rotationMatrix, f.result.set.rotation.rotationMatrix);
});

test("a supported full-basis axis without retained point coordinates is unavailable, never synthesized", async () => {
  const a = await api(), f = await fixture((draft, data) => {
    draft.codes = ["A", "B", "C", "D", "E"]; data.headers.push("D", "E");
    data.rows = data.rows.map((row, i) => ({ ...row, D: i + 1, E: [3, 1, 4, 2, 6][i] }));
  });
  const p = f.result.executionProvenance.projection;
  assert.ok(p.estimableAxes.length > 3);
  const selected = { ...controls(f.result), axes: [p.estimableAxes[0], p.estimableAxes[3]] as [string, string] };
  for (const consumer of [a.buildInferenceInputV3, a.runOpenEnaInferenceV3, a.buildContrastV3]) await assert.rejects(() => consumer(f.result, f.plan, selected), /two.*supported.*axes/i);
});

test("ONA stale currentness is reported before its inference capability gate", async () => {
  const a = await api(), f = await boundOna(), other = await boundOna("e".repeat(64));
  const selected: Controls = { primaryGroup: { type: "string", value: "g1" }, secondaryGroup: { type: "string", value: "g2" }, axes: ["SVD1", "SVD2"] };
  for (const consumer of [a.buildInferenceInputV3, a.runOpenEnaInferenceV3, a.buildContrastV3]) await assert.rejects(() => consumer(f.result, other.plan, selected), /stale/i);
});

test("oversized controls reject before array element/key enumeration and before scientific admission", async () => {
  const a = await api();
  for (const field of ["axes", "hiddenCodes", "hiddenGroups"] as const) {
    let enumerations = 0;
    const oversized = new Proxy(new Array(100_001), { ownKeys(target) { enumerations += 1; return Reflect.ownKeys(target); } });
    const options = { primaryGroup: { type: "string", value: "Control" }, secondaryGroup: { type: "string", value: "Treatment" }, axes: ["SVD1", "SVD2"], [field]: oversized };
    await assert.rejects(() => a.buildInferenceInputV3(null, null, options as Controls), /controls.*(limit|budget|length)/i);
    assert.equal(enumerations, 0, "inadmissible control arrays must not enumerate values or keys");
  }
});

test("large control strings have a separate bounded admission", async () => {
  const a = await api();
  const options: Controls = { primaryGroup: { type: "string", value: "x".repeat(1_048_577) }, secondaryGroup: { type: "string", value: "Treatment" }, axes: ["SVD1", "SVD2"] };
  await assert.rejects(() => a.buildInferenceInputV3(null, null, options), /controls.*(limit|budget)/i);
});

for (const extent of [{ kind: "infinity" }, { kind: "finite", value: 101 }] as const) {
  test(`legal Moving Stanza ${extent.kind} extent reaches a readable real coordinator receipt`, async () => {
    const a = await api(), f = await fixture((draft, data) => {
      data.rows = data.rows.map((row) => ({ ...row, horizon: row.unit }));
      draft.windowType = "MovingStanzaWindow";
      draft.movingStanza = { backward: extent, forward: { kind: "infinity" }, rowOrder: { kind: "columns", keys: [{ column: "time", direction: "ascending", comparator: { type: "number" } }] } };
    });
    const inference = await a.runOpenEnaInferenceV3(f.result, f.plan, controls(f.result));
    assert.deepEqual(inference.configuration, f.result.configuration);
    assert.deepEqual(inference.binding, f.result.binding);
    assert.equal(await a.assertOpenEnaInferenceCoordinatorConsumerV3(inference, f.result, f.plan, inference.controls), inference);
  });
}

test("coherently rehashed alternate science cannot borrow the current source binding", async () => {
  const a = await api(), current = await fixture(), alternate = await fixture((_draft, data) => { data.rows[0].B = 7; });
  const forged = structuredClone(current.result);
  Object.assign(forged, { set: alternate.result.set });
  Object.assign(forged.executionProvenance, { projection: alternate.result.executionProvenance.projection });
  Object.assign(forged.binding, { scientificResultSha256: await sha256CanonicalJsonV3(scientificResultHashPayloadV3(forged)) });
  const { resultMatchesPlanV3 } = await import("../lib/open-ena/model-v3/result-binding");
  assert.equal(resultMatchesPlanV3(forged, current.plan), true, "cheap currentness alone does not authenticate alternate science");
  for (const consumer of [a.buildInferenceInputV3, a.runOpenEnaInferenceV3, a.buildContrastV3]) await assert.rejects(() => consumer(forged, current.plan, controls(current.result)), /source|closure|count|normalized|vector/i);
});

test("public Code aliases keep source names separate from reserved row identity columns", async () => {
  const a = await api(), f = await fixture((draft, data) => {
    draft.codes = ["Unit", "Group", "Horizon"];
    data.headers = ["unit", "horizon", "time", "group", ...draft.codes];
    data.rows = data.rows.map(({ A, B, C, ...row }) => ({ ...row, Unit: A, Group: B, Horizon: C }));
  });
  const inference = await a.runOpenEnaInferenceV3(f.result, f.plan, controls(f.result));
  assert.deepEqual(inference.result.set.codes, f.result.set.codes);
  assert.deepEqual(inference.configuration.codes.map((code) => code.column), ["Unit", "Group", "Horizon"]);
  assert.equal(inference.inference.ledger?.includedEntityCount, 4);
  assert.equal(await a.assertOpenEnaInferenceCoordinatorConsumerV3(inference, f.result, f.plan, inference.controls), inference);
  const contrast = await a.buildContrastV3(f.result, f.plan, { ...controls(f.result), hiddenCodes: f.result.configuration.codes.map((code) => code.column) });
  assert.deepEqual(contrast.result.set.connectionMatrix, f.result.set.connectionMatrix);
  assert.deepEqual(contrast.geometry.rotationMatrix, f.result.set.rotation.rotationMatrix);
});

test("Reference fitted with Means retains source construction provenance without target refitting", async () => {
  const a = await api(), source = await fixture((draft) => { draft.rotation = { type: "means", centerAlignToOrigin: true, negativeLevel: { type: "string", value: "Treatment" }, positiveLevel: { type: "string", value: "Control" } }; });
  const reference = await buildReferenceV2(await fitReferenceSourceV3(source.plan), { displayName: "Means source", currentPlan: source.plan });
  const f = await fixture((draft, data) => { draft.rotation = { type: "reference", referenceId: reference.referenceId, expectedContentSha256: reference.contentSha256 }; data.rows[0].C = 5; }, reference);
  const inference = await a.runOpenEnaInferenceV3(f.result, f.plan, controls(f.result));
  assert.equal(inference.provenance.meansBinding, null);
  assert.deepEqual(inference.provenance.reference?.fit.means, reference.fit.means);
  assert.match(inference.provenance.interpretation, /descriptive by construction/);
  assert.ok(inference.inference.warnings.includes("mr1-circularity"));
  assert.equal(await a.assertOpenEnaInferenceCoordinatorConsumerV3(inference, f.result, f.plan, inference.controls), inference);
  assert.deepEqual(inference.result.set.rotation.rotationMatrix, f.result.set.rotation.rotationMatrix);
});

test("long typed Group identities remain losslessly bound through the coordinator receipt", async () => {
  const a = await api(), name = "Control" + "x".repeat(5_000);
  const f = await fixture((_draft, data) => { data.rows = data.rows.map((row) => ({ ...row, group: row.group === "Control" ? name : row.group })); });
  const selected = { ...controls(f.result), primaryGroup: { type: "string", value: name } as const };
  const inference = await a.runOpenEnaInferenceV3(f.result, f.plan, selected);
  assert.deepEqual(inference.controls.primaryGroup, selected.primaryGroup);
  assert.deepEqual(inference.result.executionProvenance.identityDictionary, f.result.executionProvenance.identityDictionary);
  assert.equal(inference.inference.ledger?.includedEntityCount, 4);
  assert.equal(await a.assertOpenEnaInferenceCoordinatorConsumerV3(inference, f.result, f.plan, inference.controls), inference);
});

test("scientific hash failures retain their contract error instead of becoming stale diagnostics", async () => {
  const a = await api(), f = await fixture(), corrupt = structuredClone(f.result);
  Object.assign(corrupt.binding, { scientificResultSha256: "e".repeat(64) });
  for (const consumer of [a.buildInferenceInputV3, a.runOpenEnaInferenceV3, a.buildContrastV3]) await assert.rejects(() => consumer(corrupt, f.plan, controls(f.result)), (error: unknown) => {
    assert.ok(error instanceof TypeError);
    assert.match(error.message, /scientific result SHA-256/i);
    assert.doesNotMatch(error.message, /stale/i);
    return true;
  });
});

test("native v3 envelopes serialize exact Infinity policy and keep legacy adapters private", async () => {
  const a = await api(), f = await fixture((draft, data) => {
    data.rows = data.rows.map((row) => ({ ...row, horizon: row.unit }));
    draft.windowType = "MovingStanzaWindow";
    draft.movingStanza = { backward: { kind: "infinity" }, forward: { kind: "infinity" }, rowOrder: { kind: "columns", keys: [{ column: "time", direction: "ascending", comparator: { type: "number" } }] } };
  });
  const inference = await a.runOpenEnaInferenceV3(f.result, f.plan, controls(f.result));
  assert.equal(Reflect.get(inference, "schemaVersion"), 3);
  assert.equal(Reflect.get(inference, "kind"), "open-ena-endpoint-inference");
  assert.equal(Reflect.get(inference, "adapterConfiguration"), undefined);
  assert.equal(Reflect.get(inference.inference, "binding"), undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(inference)).configuration, f.result.configuration);
  await assert.rejects(() => a.assertOpenEnaInferenceCoordinatorConsumerV3(JSON.parse(JSON.stringify(inference)), f.result, f.plan, controls(f.result)), /authority/i);
});

test("v3 consumer rejects forged envelopes, borrowed statistics, stale results and changed scientific controls", async () => {
  const a = await api(), f = await fixture(), other = await fixture((_draft, data) => { data.rows[0].B = 7; });
  const first = await a.runOpenEnaInferenceV3(f.result, f.plan, controls(f.result));
  const second = await a.runOpenEnaInferenceV3(other.result, other.plan, controls(other.result));
  for (const forged of [{ ...first }, { ...second, inference: first.inference }, { ...first, binding: other.result.binding }, first.inference]) {
    await assert.rejects(() => a.assertOpenEnaInferenceCoordinatorConsumerV3(forged, f.result, f.plan, controls(f.result)), /authority/i);
  }
  await assert.rejects(() => a.assertOpenEnaInferenceCoordinatorConsumerV3(first, other.result, other.plan, controls(other.result)), /stale|binding/i);
  await assert.rejects(() => a.assertOpenEnaInferenceCoordinatorConsumerV3(first, f.result, f.plan, { ...controls(f.result), axes: [...controls(f.result).axes].reverse() as [string, string] }), /controls|context/i);
  assert.equal(await a.assertOpenEnaInferenceCoordinatorConsumerV3(first, f.result, f.plan, { ...controls(f.result), hiddenCodes: f.result.configuration.codes.map((code) => code.column) }), first);
  const plan = structuredClone(f.plan), result = structuredClone(f.result), selection = controls(f.result);
  const pending = a.assertOpenEnaInferenceCoordinatorConsumerV3(first, result, plan, selection);
  Object.assign(plan.header, { executionPlanSha256: "e".repeat(64) }); result.set.points[0][selection.axes[0]] = 999; selection.axes.reverse();
  assert.equal(await pending, first);
});

test("concurrent native and legacy calls preserve isolated reader domains and full binding family identities", async () => {
  const a = await api();
  const first = await fixture((draft, data) => {
    data.rows = data.rows.map((row) => ({ ...row, horizon: row.unit }));
    draft.windowType = "MovingStanzaWindow";
    draft.movingStanza = { backward: { kind: "infinity" }, forward: { kind: "infinity" }, rowOrder: { kind: "columns", keys: [{ column: "time", direction: "ascending", comparator: { type: "number" } }] } };
  });
  const second = await fixture((draft, data) => {
    data.rows = data.rows.map((row) => ({ ...row, horizon: row.unit })); data.rows[0].B = 7;
    draft.windowType = "MovingStanzaWindow";
    draft.movingStanza = { backward: { kind: "finite", value: 101 }, forward: { kind: "infinity" }, rowOrder: { kind: "columns", keys: [{ column: "time", direction: "ascending", comparator: { type: "number" } }] } };
  });
  const sameTime = structuredClone(second.result); Object.assign(sameTime, { createdAt: first.result.createdAt });
  const dataset = parseCsv("unit,horizon,group,A,B,C\np1,h1,Primary,1,1,0\np2,h2,Primary,1,0,1\ns1,h3,Secondary,0,1,1\ns2,h4,Secondary,1,1,1\n", { name: "legacy.csv", source: "upload" });
  const configuration = { ...SAMPLE_CONFIG, unitColumns: ["unit"], conversationColumns: ["horizon"], groupColumn: "group", codes: ["A", "B", "C"], window: "Conversation" as const };
  const analyzed = analyzeDataset(dataset, configuration);
  const currentBinding = { configuration, datasetNormalizedUtf8TextSha256: "a".repeat(64), datasetHashKind: "normalized-utf8-csv-text-sha256" as const };
  const legacyResult = { ...analyzed, provenanceBinding: currentBinding };
  const [nativeOne, nativeTwo, legacy] = await Promise.all([
    a.runOpenEnaInferenceV3(first.result, first.plan, controls(first.result)),
    a.runOpenEnaInferenceV3(sameTime, second.plan, controls(sameTime)),
    runOpenEnaInferenceV2({ result: legacyResult, currentBinding, request: { kind: "endpoint-independent", primaryGroup: "Primary", secondaryGroup: "Secondary", axes: analyzed.dimensions.slice(0, 2) as [string, string] } }),
  ]);
  assert.notEqual(nativeOne.inference.families[0].familyId, nativeTwo.inference.families[0].familyId);
  const checked = await Promise.all([
    a.assertOpenEnaInferenceCoordinatorConsumerV3(nativeOne, first.result, first.plan, nativeOne.controls),
    a.assertOpenEnaInferenceCoordinatorConsumerV3(nativeTwo, sameTime, second.plan, nativeTwo.controls),
  ]);
  assert.deepEqual(checked, [nativeOne, nativeTwo]);
  assert.equal(assertOpenEnaInferenceCoordinatorConsumerV2(legacy), legacy);
  for (const extent of [Infinity, 101]) {
    const changed = structuredClone(legacy); changed.binding.configuration.windowSizeBack = extent;
    assert.throws(() => parseOpenEnaInferenceResultV2(changed), /window.*0 to 100/i);
  }
  const oversized = structuredClone(legacy);
  if (oversized.kind !== "endpoint-independent") throw new Error("Expected endpoint");
  oversized.request.primaryGroup = "x".repeat(5_000);
  assert.throws(() => parseOpenEnaInferenceResultV2(oversized), /bounded non-empty string/i);
});

test("hidden Code controls use canonical source identities even when a source name collides with a public alias", async () => {
  const a = await api(), f = await fixture((draft, data) => {
    draft.codes = ["Code 2", "B", "C"];
    data.headers = ["unit", "horizon", "time", "group", ...draft.codes];
    data.rows = data.rows.map(({ A, ...row }) => ({ ...row, "Code 2": A }));
  });
  const mapping = f.result.executionProvenance.labels.codes.find((code) => code.sourceColumn === "Code 2")!;
  assert.notEqual(mapping.column, "Code 2");
  assert.ok(f.result.set.codes.includes("Code 2"));
  const visible = await a.buildContrastV3(f.result, f.plan, controls(f.result));
  const hidden = await a.buildContrastV3(f.result, f.plan, { ...controls(f.result), hiddenCodes: ["Code 2"] });
  assert.deepEqual(hidden.controls.hiddenCodes, ["Code 2"]);
  assert.deepEqual(hidden.primary, visible.primary);
  await assert.rejects(() => a.buildContrastV3(f.result, f.plan, { ...controls(f.result), hiddenCodes: ["Code 1"] }), /visibility.*canonical.*Code/i);
});
