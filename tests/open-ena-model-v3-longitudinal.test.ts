import assert from "node:assert/strict";
import test from "node:test";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";
import { bindResultV3, scientificResultHashPayloadV3 } from "../lib/open-ena/model-v3/result-binding";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import { buildReferenceV2, fitReferenceSourceV3 } from "../lib/open-ena/model-v3/reference-v2";
import { canonicalJsonV3, sha256CanonicalJsonV3 } from "../lib/open-ena/model-v3/canonical-json";
import { wilcoxonSignedRankTest, friedmanRankTest, mannWhitneyRankTest } from "../lib/open-ena/rank-inference";
import type { IdentityFieldV3 } from "../lib/open-ena/model-v3/identity";
import type { BoundStandardResultV3, OpenEnaStandardReferenceV2 } from "../lib/open-ena/model-v3/types";

type Horizon = readonly IdentityFieldV3[];
const horizon = (value: string | number): Horizon => [{ column: "horizon", value: typeof value === "number" ? { type: "number", value } : { type: "string", value } }];
const group = (value: string) => ({ type: "string" as const, value });
async function api() {
  const view = await import("../lib/open-ena/longitudinal-v3");
  const inference = await import("../lib/open-ena/inference-v2");
  const result = { buildLongitudinalViewV3: view.buildLongitudinalViewV3, reorderLongitudinalViewV3: view.reorderLongitudinalViewV3, buildLongitudinalInferenceInputV3: view.buildLongitudinalInferenceInputV3, runOpenEnaTrajectoryInferenceV3: inference.runOpenEnaTrajectoryInferenceV3, assertOpenEnaTrajectoryInferenceConsumerV3: inference.assertOpenEnaTrajectoryInferenceConsumerV3 };
  for (const [name, fn] of Object.entries(result)) assert.equal(typeof fn, "function", `Task22 must export ${name}`);
  return result;
}
async function fixture(modify?: Parameters<typeof bindingFixtureV3>[1], reference?: OpenEnaStandardReferenceV2, balanced = false) {
  const f = await bindingFixtureV3(reference ? "c".repeat(64) : undefined, (draft, data) => {
    draft.model = "SeparateTrajectory";
    data.rows = Array.from({ length: 6 }, (_, i) => [3, 1, 2].filter((t) => balanced || !((i === 0 && t === 2) || (i === 1 && t === 3) || (i === 5 && t !== 1))).map((t) => ({ unit: `u${i + 1}`, horizon: `h${t}`, time: t, group: i % 2 ? "Treatment" : "Control", A: i + t + 1, B: (i * t) % 4 + 1, C: (i + t * t) % 5 + 1 }))).flat();
    modify?.(draft, data);
  }, reference);
  const result = await bindResultV3(f.plan, runStandardPlanV3(f.plan), { processedRows: f.plan.rows.length, maximumBufferedRows: 0, numericCellsAllocated: 120, peakBytesObservedOrBounded: 10240, observationMethod: "exact-counters-and-conservative-byte-bound" }, f.compiled.diagnostics);
  return { ...f, result };
}
function axes(result: BoundStandardResultV3): [string, string] { return result.executionProvenance.projection.estimableAxes.slice(0, 2) as [string, string]; }
function paired(result: BoundStandardResultV3) { return { axes: axes(result), identityConfirmed: true, request: { kind: "trajectory-paired-periods" as const, group: group("Control"), earlierPeriod: horizon("h1"), laterPeriod: horizon("h3"), cohortPolicy: "pairwise-complete" as const } }; }
function repeated(result: BoundStandardResultV3) { return { axes: axes(result), identityConfirmed: true, request: { kind: "trajectory-repeated-periods" as const, group: group("Control"), periods: [horizon("h1"), horizon("h2"), horizon("h3")], cohortPolicy: "all-period-complete" as const, posthocContrasts: "all-period-pairs" as const } }; }

test("Accumulated order is fitted and immutable; Separate filtering retains ordinals and absent steps", async () => {
  const a = await api();
  for (const model of ["SeparateTrajectory", "AccumulatedTrajectory"] as const) {
    const f = await fixture((draft) => { draft.model = model; });
    const ordering = f.result.executionProvenance.ordering.resolvedHorizonOrder;
    assert.equal(ordering.type, "trajectory-horizon-order");
    if (ordering.type !== "trajectory-horizon-order") throw new Error("trajectory required");
    const view = a.buildLongitudinalViewV3(f.result, { requestedOrder: ordering.unitSequences });
    assert.deepEqual(view.unitSequences, ordering.unitSequences);
    const u1 = view.entities.find((e) => e.identity[0].value.value === "u1")!;
    assert.deepEqual(u1.steps.map((step) => step.horizon.identity[0].value.value), ["h1", "h3"]);
    assert.deepEqual(u1.steps.map((step) => step.trajectoryOrdinal), [0, 1]);
    const reversed = ordering.unitSequences.map((entry) => ({ ...entry, steps: [...entry.steps].reverse() }));
    assert.throws(() => a.reorderLongitudinalViewV3(view, reversed), new RegExp(`${model}.*fitted Horizon order`, "i"));
    const filtered = a.buildLongitudinalViewV3(f.result, { displayHorizons: [horizon("h3")] });
    assert.deepEqual(filtered.unitSequences, view.unitSequences);
    assert.deepEqual(filtered.entities.find((e) => e.identity[0].value.value === "u3")!.steps.map((s) => s.trajectoryOrdinal), [2]);
    assert.equal(filtered.entities.find((e) => e.identity[0].value.value === "u6")!.steps.length, 0);
    assert.deepEqual(filtered.comparison, view.comparison);
    assert.deepEqual(filtered.binding, f.result.binding);
  }
});

test("complete cohort and identity availability remain separate from valid unbalanced core and historical view", async () => {
  const a = await api(), f = await fixture();
  const view = a.buildLongitudinalViewV3(f.result, { requiredHorizons: [horizon("h1"), horizon("h2"), horizon("h3")], minimumCompleteUnits: 4 });
  assert.equal(view.comparison.completeUnitCount, 3); assert.equal(view.comparison.incompleteUnitCount, 3);
  assert.equal(view.comparison.status, "blocked"); assert.equal(view.provenance.currentness, "not-established");
  assert.equal(view.provenance.imputedStepCount, 0); assert.equal(f.result.capabilityStatus["build-model"], "available");
  assert.throws(() => a.buildLongitudinalViewV3(f.result, { minimumCompleteUnits: null as unknown as number }), /positive safe integer/i);
  const denied = await a.runOpenEnaTrajectoryInferenceV3(f.result, f.plan, { ...paired(f.result), identityConfirmed: false });
  assert.equal(denied.inference.status, "disabled"); assert.equal(denied.inference.reason, "identity-not-confirmed");
  assert.equal(denied.comparison.completeUnitCount, 3); assert.equal(denied.comparison.identityConfirmed, false);
  assert.equal(await a.assertOpenEnaTrajectoryInferenceConsumerV3(denied, f.result, f.plan, denied.controls), denied);
});

test("actual coordinator independent, pairwise and repeated algorithms use full bound cohorts despite display filter", async () => {
  const a = await api(), f = await fixture();
  const requests = [
    { axes: axes(f.result), identityConfirmed: true, request: { kind: "trajectory-independent-period" as const, period: horizon("h3"), primaryGroup: group("Control"), secondaryGroup: group("Treatment") } },
    paired(f.result), repeated(f.result),
  ];
  for (const controls of requests) {
    const result = await a.runOpenEnaTrajectoryInferenceV3(f.result, f.plan, controls);
    const hidden = await a.runOpenEnaTrajectoryInferenceV3(f.result, f.plan, { ...controls, displayHorizons: [] });
    assert.equal(result.inference.kind, controls.request.kind);
    assert.equal(result.inference.status, "available");
    assert.deepEqual(hidden.inference, result.inference);
    assert.equal(result.kind, "open-ena-trajectory-inference"); assert.deepEqual(result.binding, f.result.binding);
    assert.equal(await a.assertOpenEnaTrajectoryInferenceConsumerV3(result, f.result, f.plan, { ...controls, displayHorizons: [] }), result);
    assert.ok(result.inference.families.length > 0);
    assert.doesNotThrow(() => canonicalJsonV3(result));
    assert.equal(result.context.frameIndexHorizons.length, 3);
    if (result.inference.kind === "trajectory-independent-period") {
      assert.equal(result.inference.ledger?.includedEntityCount, 4);
      assert.equal(result.comparison.minimumCompleteUnits, 1);
      assert.equal(result.comparison.status, "available");
    }
    if (result.inference.kind === "trajectory-paired-periods") {
      assert.equal(result.inference.ledger?.matchedEntityCount, 3);
      const points = f.result.set.points.filter((p) => p.Group === f.plan.identityDictionary.groups.find((g) => g.fields[0].value.value === "Control")!.displayLabel);
      const h1 = f.plan.identityDictionary.horizons.find((h) => h.fields[0].value.value === "h1")!.displayLabel;
      const h3 = f.plan.identityDictionary.horizons.find((h) => h.fields[0].value.value === "h3")!.displayLabel;
      const diffs = points.filter((p) => p.Horizon === h1).map((p) => Number(points.find((q) => q.Unit === p.Unit && q.Horizon === h3)![controls.axes[0]]) - Number(p[controls.axes[0]]));
      assert.equal(result.inference.rows[0].pRaw, wilcoxonSignedRankTest(diffs).pValueTwoSided);
    }
    if (result.inference.kind === "trajectory-repeated-periods") {
      assert.equal(result.inference.ledger?.completeBlockCount, 2); assert.equal(result.inference.ledger?.missingAnySelectedPeriodCount, 1);
      assert.equal(result.inference.followupRows.length, 6); assert.equal(result.inference.families[1].familySizePlanned, 6);
    }
  }
});

test("rank-one and ungrouped models retain pure views; ungrouped full-rank paired/repeated inference is supported", async () => {
  const a = await api();
  const one = await fixture((draft, data) => { draft.groupColumn = null; data.rows = data.rows.map((row, i) => ({ ...row, A: i % 2 ? 1 : 2, B: i % 2 ? 2 : 1, C: 1 })); });
  const view = a.buildLongitudinalViewV3(one.result, {});
  assert.equal(one.result.executionProvenance.projection.rank, 1); assert.equal(view.supportedAxes.length, 1);
  assert.equal(view.entities.length, 6); assert.ok(view.entities.every((e) => e.group === null));
  await assert.rejects(() => a.runOpenEnaTrajectoryInferenceV3(one.result, one.plan, { ...paired(one.result), axes: one.result.executionProvenance.projection.fullAxes.slice(0, 2) as [string, string], request: { ...paired(one.result).request, group: null } }), /two.*supported.*axes/i);
  const f = await fixture((draft) => { draft.groupColumn = null; });
  for (const c of [paired(f.result), repeated(f.result)]) {
    const inference = await a.runOpenEnaTrajectoryInferenceV3(f.result, f.plan, { ...c, request: { ...c.request, group: null } });
    assert.ok(inference.inference.families.length > 0); assert.equal(inference.comparison.candidateUnitCount, 6);
  }
});

test("Reference trajectories preserve fixed source geometry, target order/variance and native inference", async () => {
  const a = await api(), source = await fixture((draft) => { draft.model = "EndPoint"; });
  const reference = await buildReferenceV2(await fitReferenceSourceV3(source.plan), { displayName: "Trajectory reference", currentPlan: source.plan });
  const f = await fixture((draft) => { draft.model = "AccumulatedTrajectory"; draft.rotation = { type: "reference", referenceId: reference.referenceId, expectedContentSha256: reference.contentSha256 }; }, reference);
  const view = a.buildLongitudinalViewV3(f.result, {});
  assert.deepEqual(view.geometry.rotationMatrix, reference.geometry.rotationMatrix); assert.deepEqual(view.geometry.centerVector, reference.geometry.centerVector);
  assert.deepEqual(view.variance, f.result.set.variance); assert.equal(view.provenance.reference?.contentSha256, reference.contentSha256);
  assert.equal(view.provenance.varianceMeaning, "target variance along fixed reference axes");
  assert.deepEqual(view.binding, f.result.binding);
  const inference = await a.runOpenEnaTrajectoryInferenceV3(f.result, f.plan, paired(f.result));
  assert.ok(inference.inference.warnings.includes("accumulated-trajectory-path-dependence"));
  assert.equal(await a.assertOpenEnaTrajectoryInferenceConsumerV3(inference, f.result, f.plan, inference.controls), inference);
});

test("source-current admission, live producer custody and scientific context reject stale, forged or cloned data", async () => {
  const a = await api(), f = await fixture(), other = await fixture((_draft, data) => { data.rows[0].A = 99; });
  const c = paired(f.result);
  for (const plan of [null, undefined, false, {}, other.plan]) await assert.rejects(() => a.runOpenEnaTrajectoryInferenceV3(f.result, plan, c));
  const forged = structuredClone(f.result); forged.set.points[0][c.axes[0]] = 99;
  Object.assign(forged.binding, { scientificResultSha256: await sha256CanonicalJsonV3(scientificResultHashPayloadV3(forged)) });
  await assert.rejects(() => a.runOpenEnaTrajectoryInferenceV3(forged, f.plan, c));
  const result = await a.runOpenEnaTrajectoryInferenceV3(f.result, f.plan, c);
  for (const copy of [structuredClone(result), { ...result }, { ...result, inference: result.inference }]) await assert.rejects(() => a.assertOpenEnaTrajectoryInferenceConsumerV3(copy, f.result, f.plan, c), /authority/i);
  await assert.rejects(() => a.assertOpenEnaTrajectoryInferenceConsumerV3(result, other.result, other.plan, c), /binding|stale/i);
  await assert.rejects(() => a.assertOpenEnaTrajectoryInferenceConsumerV3(result, f.result, f.plan, { ...c, request: { ...c.request, laterPeriod: horizon("h2") } }), /context/i);
});

test("controls, result and independent plan are detached before asynchronous work", async () => {
  const a = await api(), f = await fixture();
  for (const consumer of [a.buildLongitudinalInferenceInputV3, a.runOpenEnaTrajectoryInferenceV3]) {
    const c = structuredClone(repeated(f.result)), result = structuredClone(f.result), plan = structuredClone(f.plan);
    const pending = consumer(result, plan, c);
    c.request.periods.reverse(); c.axes.reverse(); c.identityConfirmed = false;
    result.set.points[0][axes(f.result)[0]] = 99; Object.assign(plan.header, { executionPlanSha256: "f".repeat(64) });
    const accepted = await pending;
    assert.deepEqual(accepted.binding, f.result.binding); assert.deepEqual(accepted.controls.request, repeated(f.result).request);
    assert.ok(Object.isFrozen(accepted));
  }
});

test("disjoint tied Horizons keep valid fitted paths and never acquire an invented chronology", async () => {
  const a = await api(), f = await fixture((_draft, data) => { data.rows = data.rows.map((row) => ({ ...row, horizon: `${row.unit}-${row.horizon}` })); });
  const view = a.buildLongitudinalViewV3(f.result, {}); assert.equal(view.entities.length, 6);
  const c = { ...paired(f.result), request: { ...paired(f.result).request, earlierPeriod: horizon("u1-h1"), laterPeriod: horizon("u2-h1") } };
  await assert.rejects(() => a.runOpenEnaTrajectoryInferenceV3(f.result, f.plan, c), /fitted precedence|incomparable|ambiguous/i);
  await assert.rejects(() => a.runOpenEnaTrajectoryInferenceV3(f.result, f.plan, { ...paired(f.result), request: { ...paired(f.result).request, earlierPeriod: horizon("u1-h3"), laterPeriod: horizon("u1-h1") } }), /fitted.*order|precedence/i);
});

test("composite typed Unit/Horizon identities are lossless through actual paired/repeated coordination", async () => {
  const a = await api(), f = await fixture((draft, data) => {
    draft.unitColumns = ["unit", "school"]; draft.horizonColumns = ["horizon", "semester"];
    data.headers.push("school", "semester");
    data.rows = data.rows.map((row) => ({ ...row, unit: row.unit === "u1" ? 1 : row.unit === "u3" ? "1" : row.unit, school: row.unit === "u1" ? "A|B" : "A", horizon: row.horizon === "h1" ? 1 : row.horizon === "h2" ? "1" : "h3", semester: row.horizon === "h3" ? true : "true" }));
  });
  const identities = [1, "1", "h3"].map((value) => f.result.executionProvenance.identityDictionary.horizons.find((h) => h.fields[0].value.value === value)!.fields);
  const view = a.buildLongitudinalViewV3(f.result, { displayHorizons: [identities[0], identities[2]] });
  assert.equal(new Set(view.entities.map((e) => e.key)).size, 6);
  assert.equal(view.entities.find((e) => e.identity[0].value.value === 1)!.identity[1].value.value, "A|B");
  const c = { ...repeated(f.result), request: { ...repeated(f.result).request, periods: identities } };
  const inferred = await a.runOpenEnaTrajectoryInferenceV3(f.result, f.plan, c);
  assert.deepEqual(inferred.context.horizonColumns, ["horizon", "semester"]); assert.deepEqual(inferred.context.unitColumns, ["unit", "school"]);
  assert.deepEqual(new Set(inferred.context.frameIndexHorizons.map((h) => canonicalJsonV3(h))), new Set(identities.map((h) => canonicalJsonV3(h))));
  assert.equal(inferred.inference.kind, "trajectory-repeated-periods");
  if (inferred.inference.kind !== "trajectory-repeated-periods") throw new Error("repeated expected");
  assert.equal(inferred.inference.ledger?.completeBlockCount, 2);
  await assert.rejects(() => a.runOpenEnaTrajectoryInferenceV3(f.result, f.plan, { ...c, request: { ...c.request, periods: [identities[0], identities[0], identities[2]] } }), /distinct/i);
  await assert.rejects(() => a.runOpenEnaTrajectoryInferenceV3(f.result, f.plan, { ...c, request: { ...c.request, periods: [horizon(1), identities[1], identities[2]] } }), /typed Horizons/i);
});

test("Reference rank-zero targets reach genuine not-estimable native results while source Means geometry survives", async () => {
  const a = await api(), source = await fixture((draft) => { draft.model = "EndPoint"; draft.rotation = { type: "means", centerAlignToOrigin: true, negativeLevel: group("Control"), positiveLevel: group("Treatment") }; });
  const reference = await buildReferenceV2(await fitReferenceSourceV3(source.plan), { displayName: "Fixed Means", currentPlan: source.plan });
  const f = await fixture((draft, data) => { draft.rotation = { type: "reference", referenceId: reference.referenceId, expectedContentSha256: reference.contentSha256 }; data.rows = data.rows.map((row) => ({ ...row, A: 1, B: 2, C: 3 })); }, reference, true);
  assert.equal(f.result.executionProvenance.projection.targetProjectionRank, 0);
  const view = a.buildLongitudinalViewV3(f.result, {}), inference = await a.runOpenEnaTrajectoryInferenceV3(f.result, f.plan, paired(f.result));
  assert.deepEqual(view.geometry.rotationMatrix, reference.geometry.rotationMatrix); assert.deepEqual(view.geometry.nodes, f.result.set.rotation.nodes);
  assert.equal(inference.inference.status, "not-estimable"); assert.ok(inference.inference.warnings.includes("mr1-circularity"));
  assert.match(inference.provenance.interpretation, /descriptive by construction/);
  assert.equal(inference.provenance.reference?.source.datasetBinding.normalizedTableSha256, source.result.binding.datasetSha256);
});

test("native Infinity and long typed Horizon/Group labels stay private to the native reader domain", async () => {
  const a = await api(), long = "Long period ".repeat(500), longGroup = "Group ".repeat(900);
  const f = await fixture((draft, data) => {
    draft.windowType = "MovingStanzaWindow"; draft.movingStanza = { backward: { kind: "infinity" }, forward: { kind: "finite", value: 101 }, rowOrder: { kind: "columns", keys: [{ column: "row", direction: "ascending", comparator: { type: "number" } }] } };
    data.headers.push("row"); data.rows = data.rows.map((row, i) => ({ ...row, row: i, horizon: row.horizon === "h2" ? long : row.horizon, group: row.group === "Control" ? longGroup : row.group }));
  });
  const c = { ...repeated(f.result), request: { ...repeated(f.result).request, group: group(longGroup), periods: [horizon("h1"), horizon(long), horizon("h3")] } };
  const inference = await a.runOpenEnaTrajectoryInferenceV3(f.result, f.plan, c);
  assert.equal(inference.configuration.window.type, "MovingStanzaWindow");
  if (inference.configuration.window.type === "MovingStanzaWindow") assert.deepEqual(inference.configuration.window.backward, { kind: "infinity" });
  assert.equal(inference.inference.kind, "trajectory-repeated-periods"); assert.doesNotThrow(() => canonicalJsonV3(inference));
  assert.equal("adapterConfiguration" in inference, false); assert.equal("comparisonFrame" in inference, false); assert.equal("binding" in inference.inference, false);
  assert.equal(await a.assertOpenEnaTrajectoryInferenceConsumerV3(inference, f.result, f.plan, c), inference);
});

test("oversized and capture-time growing trajectory arrays reject before excessive traversal", async () => {
  const a = await api(), f = await fixture();
  const fields = ["axes", "periods", "identityFields", "displayHorizons"] as const;
  for (const field of fields) for (const trap of ["ownKeys", "descriptor"] as const) {
    let reads = 0;
    const initial = field === "axes" ? axes(f.result) : field === "identityFields" ? [...horizon("h1")] : field === "displayHorizons" ? [horizon("h1")] : [horizon("h1"), horizon("h2"), horizon("h3")];
    const array = new Proxy(initial, {
      ownKeys(target) { if (trap === "ownKeys") target.length += 1; return Reflect.ownKeys(target); },
      getOwnPropertyDescriptor(target, key) {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
        if (key !== "length") { reads += 1; if (trap === "descriptor" && reads === 1) target.length += 1; }
        return descriptor;
      },
      get() { throw new Error("Ordinary getters must not run"); },
    });
    const c = repeated(f.result);
    const options = field === "axes" ? { ...c, axes: array } : field === "periods" ? { ...c, request: { ...c.request, periods: array } } : field === "identityFields" ? { ...c, request: { ...c.request, periods: [array, horizon("h2"), horizon("h3")] } } : { ...c, displayHorizons: array };
    await assert.rejects(() => a.runOpenEnaTrajectoryInferenceV3(f.result, f.plan, options as Parameters<typeof a.runOpenEnaTrajectoryInferenceV3>[2]), /capture|length|limit|dense/i);
    assert.ok(reads <= (trap === "ownKeys" ? 0 : 1));
  }
  let enumerations = 0;
  const tooMany = new Proxy(new Array(65), { ownKeys(target) { enumerations += 1; return Reflect.ownKeys(target); } });
  await assert.rejects(() => a.runOpenEnaTrajectoryInferenceV3(null, null, { ...repeated(f.result), request: { ...repeated(f.result).request, periods: tooMany } }), /limit|budget/i);
  assert.equal(enumerations, 0);
});

test("controls reject accessors, sparse/extra arrays, unknown fields and string budget without getters", async () => {
  const a = await api(), f = await fixture(), c = repeated(f.result);
  let getters = 0;
  const identity = [{ column: "horizon", value: { type: "string", get value() { getters += 1; return "h1"; } } }];
  for (const options of [
    { ...c, unknown: true }, { ...c, request: { ...c.request, unknown: true } },
    { ...c, request: { ...c.request, periods: [identity, horizon("h2"), horizon("h3")] } },
    { ...c, request: { ...c.request, periods: new Array(3) } },
    { ...c, displayHorizons: [horizon("x".repeat(65_537))] },
  ]) await assert.rejects(() => a.runOpenEnaTrajectoryInferenceV3(f.result, f.plan, options as Parameters<typeof a.runOpenEnaTrajectoryInferenceV3>[2]));
  assert.equal(getters, 0);
});

test("empty all-period-complete cohort reports not-estimable without invalidating the core trajectories", async () => {
  const a = await api(), f = await fixture((_draft, data) => { data.rows = data.rows.filter((row) => row.horizon !== `h${Number(String(row.unit).slice(1)) % 3 + 1}`); });
  const view = a.buildLongitudinalViewV3(f.result, {});
  assert.equal(view.comparison.completeUnitCount, 0); assert.equal(view.comparison.status, "blocked");
  const inference = await a.runOpenEnaTrajectoryInferenceV3(f.result, f.plan, repeated(f.result));
  assert.equal(inference.inference.status, "not-estimable"); assert.equal(inference.inference.reason, "no-complete-blocks");
  assert.equal(inference.comparison.completeUnitCount, 0); assert.equal(inference.comparison.incompleteUnitCount, 3);
  assert.equal(f.result.capabilityStatus["build-model"], "available"); assert.equal(await a.assertOpenEnaTrajectoryInferenceConsumerV3(inference, f.result, f.plan, inference.controls), inference);
});

test("typed scalar Group collision, exact statistics and full native family context stay bound", async () => {
  const a = await api(), f = await fixture((_draft, data) => { data.rows = data.rows.map((row) => ({ ...row, group: row.group === "Control" ? 1 : "1" })); });
  const primary = { type: "number" as const, value: 1 }, secondary = { type: "string" as const, value: "1" };
  const c = { axes: axes(f.result), identityConfirmed: true, request: { kind: "trajectory-independent-period" as const, period: horizon("h1"), primaryGroup: primary, secondaryGroup: secondary } };
  const result = await a.runOpenEnaTrajectoryInferenceV3(f.result, f.plan, c);
  assert.equal(result.inference.kind, "trajectory-independent-period");
  if (result.inference.kind !== "trajectory-independent-period") throw new Error("independent required");
  assert.equal(result.inference.ledger?.includedEntityCount, 6);
  const dictionary = f.result.executionProvenance.identityDictionary;
  const h = dictionary.horizons.find((e) => e.fields[0].value.value === "h1")!.displayLabel;
  const samples = [primary, secondary].map((g) => f.result.set.points.filter((p) => p.Horizon === h && p.Group === dictionary.groups.find((e) => e.fields[0].value.type === g.type)!.displayLabel).map((p) => Number(p[c.axes[0]])));
  assert.equal(result.inference.rows[0].pRaw, mannWhitneyRankTest(samples[0], samples[1]).pValueTwoSided);
  const changed = await a.runOpenEnaTrajectoryInferenceV3(f.result, f.plan, { ...c, request: { ...c.request, period: horizon("h2") } });
  assert.notEqual(result.inference.families[0].familyId, changed.inference.families[0].familyId);
  assert.equal(result.scientificContextSha256, await sha256CanonicalJsonV3(result.context));
  const r = { ...repeated(f.result), request: { ...repeated(f.result).request, group: primary } };
  const repeat = await a.runOpenEnaTrajectoryInferenceV3(f.result, f.plan, r);
  if (repeat.inference.kind !== "trajectory-repeated-periods") throw new Error("repeated required");
  const groupLabel = dictionary.groups.find((g) => g.fields[0].value.type === "number")!.displayLabel;
  const ids = repeat.comparison.completeUnitIds;
  const blocks = ids.map((id) => r.request.periods.map((fields) => {
    const horizonLabel = dictionary.horizons.find((h) => canonicalJsonV3(h.fields) === canonicalJsonV3(fields))!.displayLabel;
    return Number(f.result.set.points.find((p) => p.Unit === id && p.Group === groupLabel && p.Horizon === horizonLabel)![r.axes[0]]);
  }));
  assert.equal(repeat.inference.omnibusRows[0].pRaw, friedmanRankTest(blocks).pValueUpperTail);
});

test("a legal wide composite Horizon is preserved without borrowing the legacy source-column limit", async () => {
  const a = await api(), extraColumns = Array.from({ length: 256 }, (_, i) => `boundary${i}`);
  const f = await fixture((draft, data) => {
    draft.horizonColumns = ["horizon", ...extraColumns]; data.headers.push(...extraColumns);
    data.rows = data.rows.map((row) => ({ ...row, ...Object.fromEntries(extraColumns.map((column) => [column, 0])) }));
  });
  const view = a.buildLongitudinalViewV3(f.result, {});
  assert.equal(view.entities[0].steps[0].horizon.identity.length, 257);
  const periods = ["h1", "h2", "h3"].map((period) => f.result.executionProvenance.identityDictionary.horizons.find((h) => h.fields[0].value.value === period)!.fields);
  const c = { ...repeated(f.result), request: { ...repeated(f.result).request, periods } };
  const inference = await a.runOpenEnaTrajectoryInferenceV3(f.result, f.plan, c);
  assert.equal(inference.inference.kind, "trajectory-repeated-periods"); assert.equal(inference.inference.status, "available");
  assert.deepEqual(inference.context.horizonColumns, ["horizon", ...extraColumns]);
  assert.deepEqual(inference.controls.request, c.request);
  assert.equal(await a.assertOpenEnaTrajectoryInferenceConsumerV3(inference, f.result, f.plan, c), inference);
});
