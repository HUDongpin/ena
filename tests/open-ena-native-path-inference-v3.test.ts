import assert from "node:assert/strict";
import test from "node:test";
import { multiplyMatrices } from "jena-js/core";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";
import { bindResultV3 } from "../lib/open-ena/model-v3/result-binding";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import type { IndependentTrajectoryComparisonInput } from "j-3dena";
import { buildLongitudinalViewV3 } from "../lib/open-ena/longitudinal-bound-v3";

export async function nativePathFixture(modify?: Parameters<typeof bindingFixtureV3>[1], reference?: import("../lib/open-ena/model-v3/types").OpenEnaStandardReferenceV2) {
  const f = await bindingFixtureV3(reference ? "c".repeat(64) : undefined, (draft, data) => {
    draft.model = "SeparateTrajectory";
    draft.codes.push("D"); data.headers.push("D");
    data.rows = Array.from({ length: 8 }, (_, i) => [1, 2, 3].map(t => ({ unit: `PRIVATE-person-${i}`, horizon: `h${t}`, time: t, group: i < 4 ? "Control" : "Treatment", A: i + t + 1, B: (i * t) % 4 + 1, C: (i + t * t) % 5 + 1, D: (i * i + t) % 7 + 1 }))).flat();
    modify?.(draft, data);
  }, reference);
  const result = await bindResultV3(f.plan, runStandardPlanV3(f.plan), { processedRows: f.plan.rows.length, maximumBufferedRows: 0, numericCellsAllocated: 240, peakBytesObservedOrBounded: 20480, observationMethod: "exact-counters-and-conservative-byte-bound" }, f.compiled.diagnostics);
  const controls = { axes: result.executionProvenance.projection.estimableAxes.slice(0, 3) as [string, string, string], identityConfirmed: true, independentGroupsConfirmed: true,
    primaryGroup: { type: "string" as const, value: "Control" }, secondaryGroup: { type: "string" as const, value: "Treatment" },
    horizons: [1, 2, 3].map(t => [{ column: "horizon", value: { type: "string" as const, value: `h${t}` } }]), cohortPolicy: "all-period-complete" as const, repetitions: 500, seed: 2026 };
  return { ...f, result, controls };
}
async function api() {
  const path = "../lib/open-ena/trajectory-path-inference-v3";
  const mod = await import(path).catch(() => ({}));
  assert.equal(typeof mod.runOpenEnaTrajectoryPathInferenceV3, "function", "native path producer must exist");
  return mod as typeof import("../lib/open-ena/trajectory-path-inference-v3");
}

test("native path preserves pinned independent 500/2026 whole-history algorithm and finite Holm family", async () => {
  const a = await api(), f = await nativePathFixture();
  const { compareTrajectoryPaths, getTrajectoryPermutationUnits, holmAdjust } = await import("../lib/open-ena/trajectory-path-statistics-v3");
  const actual = await a.runOpenEnaTrajectoryPathInferenceV3(f.result, f.plan, f.controls);
  const view = buildLongitudinalViewV3(f.result), identity = (fields: readonly import("../lib/open-ena/model-v3/identity").IdentityFieldV3[]) => ({ components: fields.map(x => ({ name: x.column, type: x.value.type, value: x.value.value })) });
  const full = multiplyMatrices(f.result.set.pointsForProjection.map(r => f.result.set.codeColumns.map(c => Number(r[c]))), f.result.set.rotation.rotationMatrix);
  const byStep = new Map(f.result.set.points.map((r,i)=>[JSON.stringify([r.Unit,r.Horizon]),full[i]]));
  const series = (group: string, namespace: string) => ({ namespace, dimensions: [...f.result.executionProvenance.projection.fullAxes], selectedDimensions: f.controls.axes, timeOrder: f.controls.horizons.map(identity), cohortPolicy: "complete" as const,
    points: view.entities.filter(e => e.group?.identity.value === group).flatMap(e => e.steps.map(s => ({ participant: identity(e.identity), time: identity(s.horizon.identity), coordinates: byStep.get(JSON.stringify([s.point.Unit,s.point.Horizon]))! }))) });
  const input: IndependentTrajectoryComparisonInput = { design: "independent", sideA: { label: "Control", series: series("Control", "native-group-A") }, sideB: { label: "Treatment", series: series("Treatment", "native-group-B") } };
  const unitOrder = getTrajectoryPermutationUnits(input).unitOrder;
  // Independent copy of the original public workflow seed/shuffle recipe.
  let state = 2026;
  const random = () => { let t = state = (state + 0x6D2B79F5) >>> 0; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const replicates = Array.from({ length: 500 }, () => { const indexes = unitOrder.map((_, i) => i); for (let i = indexes.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [indexes[i], indexes[j]] = [indexes[j], indexes[i]]; } return indexes; });
  const expected = compareTrajectoryPaths({ ...input, permutationPlan: { kind: "independent-pool-indices-v1", unitOrder, replicates } });
  assert.deepEqual(actual.inference.tests, expected.tests);
  assert.deepEqual(actual.inference.periods, expected.periods);
  assert.equal(actual.inference.tests.length, 23);
  assert.equal(actual.inference.direction, "B-minus-A");
  assert.deepEqual(actual.inference.tests.map(t => t.holmAdjustedPValue), holmAdjust(actual.inference.tests.map(t => t.pValue)));
  for (const t of actual.inference.tests) { assert.equal(t.permutationCount, 500); assert.ok(t.pValue >= 1 / 501 && t.pValue <= 1); assert.ok(Number.isFinite(t.holmAdjustedPValue)); }
  assert.equal(await a.assertOpenEnaTrajectoryPathInferenceConsumerV3(actual, f.result, f.plan, f.controls), actual);
});

test("native path rejects imported/cloned authority, tampering, stale plans and changed controls", async () => {
  const a = await api(), f = await nativePathFixture(), value = await a.runOpenEnaTrajectoryPathInferenceV3(f.result, f.plan, f.controls);
  await assert.rejects(a.assertOpenEnaTrajectoryPathInferenceConsumerV3(structuredClone(value), f.result, f.plan, f.controls), /authority/);
  assert.throws(() => { value.inference.tests[0].pValue = 0; }, TypeError);
  await assert.rejects(a.assertOpenEnaTrajectoryPathInferenceConsumerV3(value, f.result, f.plan, { ...f.controls, seed: 3 }), /controls|context/);
  const other = await nativePathFixture((_d, data) => { data.rows[0].A = 77; });
  await assert.rejects(a.runOpenEnaTrajectoryPathInferenceV3(f.result, other.plan, f.controls), /stale|binding/);
  await assert.rejects(a.assertOpenEnaTrajectoryPathInferenceConsumerV3(value, other.result, other.plan, f.controls), /binding|stale/);
});

test("complete-history policy reports excluded missing steps and refuses incomparable selected chronology", async () => {
  const a = await api(), f = await nativePathFixture((_d, data) => { data.rows = data.rows.filter(r => !(r.unit === "PRIVATE-person-0" && r.horizon === "h2")); });
  const value = await a.runOpenEnaTrajectoryPathInferenceV3(f.result, f.plan, f.controls);
  assert.deepEqual(value.cohort.primary, { candidateUnits: 4, completeUnits: 3, excludedIncompleteUnits: 1 });
  assert.equal(value.inference.sideA.participantPeriods.filter(p => p.participant.components[0].value === "PRIVATE-person-0").length, 2);
  await assert.rejects(a.runOpenEnaTrajectoryPathInferenceV3(f.result, f.plan, { ...f.controls, horizons: [...f.controls.horizons].reverse() }), /precedence|chronology/);
  const diamond = await nativePathFixture((_d, data) => { data.rows = data.rows.filter(r => r.horizon === "h1" || (Number(String(r.unit).split("-").at(-1)) % 2 ? r.horizon === "h2" : r.horizon === "h3")); });
  await assert.rejects(a.runOpenEnaTrajectoryPathInferenceV3(diamond.result, diamond.plan, diamond.controls), /precedence|chronology/);
});

test("control and resource admission happens before computation; capture survives caller mutation", async () => {
  const a = await api(), f = await nativePathFixture();
  for (const patch of [{ identityConfirmed: false }, { independentGroupsConfirmed: false }, { repetitions: 100001 }, { seed: -1 }, { axes: [f.controls.axes[0], f.controls.axes[0], f.controls.axes[2]] }, { axes: ["fabricated", ...f.controls.axes.slice(1)] }, { cohortPolicy: "available" }]) {
    await assert.rejects(a.runOpenEnaTrajectoryPathInferenceV3(f.result, f.plan, { ...f.controls, ...patch } as typeof f.controls));
  }
  let invoked = 0;
  const controls = { ...f.controls, get seed() { invoked++; return 1; } };
  await assert.rejects(a.runOpenEnaTrajectoryPathInferenceV3(f.result, f.plan, controls), /accessor|data property/); assert.equal(invoked, 0);
  const copy = structuredClone(f.controls), pending = a.runOpenEnaTrajectoryPathInferenceV3(f.result, f.plan, copy); copy.seed = 9; copy.horizons.reverse();
  const value = await pending; assert.equal(value.controls.seed, 2026); assert.deepEqual(value.controls.horizons, f.controls.horizons);
  await assert.rejects(a.assertOpenEnaTrajectoryPathInferenceConsumerV3(value, f.result, f.plan, copy), /controls|context|chronology/);
});

test("independent local numerical port matches callable pinned public execution on identical fitted histories", async () => {
  const { analyzeDataset, bindOpenEnaResultProvenance } = await import("../lib/open-ena/analyze");
  const { createOpenEnaLongitudinalSettingsV3, buildOpenEnaLongitudinalExecutionRequestV3 } = await import("../lib/open-ena/longitudinal-v3");
  const { executeLongitudinalAnalysisV2, verifyLongitudinalAnalysisBundleV2 } = await import("j-3dena");
  const { compareTrajectoryPaths } = await import("../lib/open-ena/trajectory-path-statistics-v3");
  const { createNativePathPermutationPlanV3 } = await api();
  const dataset: import("../lib/open-ena/types").ParsedDataset = { name: "public-oracle.csv", source: "upload", sizeBytes: 999, headers: ["Group", "Speaker", "Period", "A", "B", "C", "D"],
    rows: Array.from({ length: 8 }, (_, i) => [1, 2, 3].map(t => ({ Group: i < 4 ? "A" : "B", Speaker: `p${i}`, Period: t, A: i + t + 1, B: (i * t) % 4 + 1, C: (i + t * t) % 5 + 1, D: (i * i + t) % 7 + 1 }))).flat() };
  const config: import("../lib/open-ena/types").OpenEnaConfig = { analysisKind: "ena", unitColumns: ["Group", "Speaker"], conversationColumns: ["Group", "Speaker", "Period"], groupColumn: "Group", codes: ["A", "B", "C", "D"], model: "SeparateTrajectory", window: "Conversation", windowSizeBack: 1, windowSizeForward: 0, weightBy: "sum", rotation: "svd", referenceRotationId: null, centerAlignToOrigin: true };
  const hash = "6".repeat(64), fitted = bindOpenEnaResultProvenance(analyzeDataset(dataset, config), dataset, hash, config);
  const settings = await createOpenEnaLongitudinalSettingsV3({ result: fitted, config, dataset, datasetHash: hash });
  settings.cohortPolicy = "complete";
  const prepared = await buildOpenEnaLongitudinalExecutionRequestV3({ result: fitted, config, dataset, datasetHash: hash, settings, runId: "native-path-independent-oracle", executionTarget: "node-service" });
  const bundle = await executeLongitudinalAnalysisV2(prepared.request); await verifyLongitudinalAnalysisBundleV2(bundle);
  assert.equal(bundle.pathComparisons.length, 1);
  const expected = bundle.pathComparisons[0].result;
  assert.ok(expected); assert.equal(expected.tests.length, 23);
  const series = (s: typeof expected.sideA) => ({ namespace: s.namespace, dimensions: s.dimensions, selectedDimensions: s.selectedDimensions, timeOrder: s.periods.map(p => ({ components: p.time.components })), cohortPolicy: s.cohortPolicy,
    points: s.participantPeriods.map(p => ({ participant: { components: p.participant.components }, time: { components: p.time.components }, coordinates: p.fullCoordinates })) });
  // Actual SDK output carries the identical normalized fitted histories; no
  // fabricated legacy receipt, altered geometry or internal-runtime eval.
  assert.equal(expected.sideA.summary.duplicateRows, 0);
  const input: IndependentTrajectoryComparisonInput = { design: "independent", sideA: { label: "A", series: series(expected.sideA) }, sideB: { label: "B", series: series(expected.sideB) } };
  const plan = createNativePathPermutationPlanV3(input, 500, 2026);
  const actual = compareTrajectoryPaths({ ...input, permutationPlan: plan });
  assert.deepEqual(actual.permutation.unitOrder, expected.permutation.unitOrder);
  assert.deepEqual(actual.periods, expected.periods);
  assert.deepEqual(actual.tests, expected.tests);
});

test("native full coordinates use exact retained edge order, support Reference source axes at zero target rank", async () => {
  const a = await api(), { buildReferenceV2, fitReferenceSourceV3 } = await import("../lib/open-ena/model-v3/reference-v2");
  const source = await nativePathFixture(draft => { draft.model = "EndPoint"; });
  const reference = await buildReferenceV2(await fitReferenceSourceV3(source.plan), { displayName: "Source reference", currentPlan: source.plan });
  const f = await nativePathFixture((draft, data) => { draft.rotation = { type: "reference", referenceId: reference.referenceId, expectedContentSha256: reference.contentSha256 }; data.rows = data.rows.map(r => ({...r,A:1,B:2,C:3,D:4})); }, reference);
  assert.equal(f.result.executionProvenance.projection.targetProjectionRank, 0);
  const value = await a.runOpenEnaTrajectoryPathInferenceV3(f.result,f.plan,f.controls);
  assert.deepEqual(value.context.reference, f.result.executionProvenance.reference);
  assert.deepEqual(value.context.geometry, f.result.set.rotation);
  assert.deepEqual(value.context.projection.variance, f.result.executionProvenance.projection.variance);
  assert.equal(value.provenance.projectionAuthority,"fixed-reference-target-projection");
  assert.equal(value.inference.sideA.dimensions.length,reference.geometry.rotationColumns.length);
  // Independent scalar dot-product oracle in the retained edge order, with
  // point-prefix and selected/full distance checks. No projection helper used.
  const dot = f.result.set.pointsForProjection.map(row => f.result.set.rotation.rotationColumns.map((_, axis) => { let x=0; for(let edge=0;edge<f.result.set.codeColumns.length;edge++)x+=Number(row[f.result.set.codeColumns[edge]])*f.result.set.rotation.rotationMatrix[edge][axis];return x; }));
  for(let i=0;i<dot.length;i++)for(let axis=0;axis<3;axis++)assert.ok(Math.abs(dot[i][axis]-Number(f.result.set.points[i][f.controls.axes[axis]]))<1e-12);
  for(const side of [value.inference.sideA,value.inference.sideB])for(const row of side.participantPeriods)assert.deepEqual(row.fullCoordinates,dot[0]);
  for(const p of value.inference.periods){assert.equal(p.fullCentroidSeparation,0);assert.equal(p.selectedCentroidSeparation,0);}
  assert.ok(value.inference.tests.every(t=>t.pValue===1&&t.holmAdjustedPValue===1));
});

test("typed Group scalar collisions and composite Unit tuples remain distinct whole histories",async()=>{
  const a=await api(), f=await nativePathFixture((draft,data)=>{draft.unitColumns=["unit","part"];data.headers.push("part");data.rows=data.rows.map((r)=>{const i=Number(String(r.unit).split("-").at(-1));return {...r,unit:i===0?"a.b":i===1?"a":r.unit,part:i===0?"c":i===1?"b.c":"part",group:i<4?1:"1"};});});
  const controls={...f.controls,primaryGroup:{type:"number" as const,value:1},secondaryGroup:{type:"string" as const,value:"1"}};
  const value=await a.runOpenEnaTrajectoryPathInferenceV3(f.result,f.plan,controls);
  assert.equal(value.inference.permutation.unitOrder.length,8);
  assert.equal(new Set(value.inference.sideA.participantPeriods.map(p=>p.participant.canonical)).size,4);
  assert.ok(value.inference.sideA.participantPeriods.every(p=>p.participant.components.length===2));
  assert.equal(value.cohort.primary.completeUnits,4);assert.equal(value.cohort.secondary.completeUnits,4);
  await assert.rejects(a.runOpenEnaTrajectoryPathInferenceV3(f.result,f.plan,{...controls,secondaryGroup:controls.primaryGroup}),/distinct typed/);
});

test("downstream work ceilings and complete-cohort refusal preserve a valid bound core",async()=>{
  const a=await api(),f=await nativePathFixture();
  const huge=Array.from({length:1000},(_,i)=>[{column:"horizon",value:{type:"string" as const,value:`h${i}`}}]);
  await assert.rejects(a.runOpenEnaTrajectoryPathInferenceV3(f.result,f.plan,{...f.controls,horizons:huge}),/budget/);
  const sparse=await nativePathFixture((_d,data)=>{data.rows=data.rows.filter(r=>r.group==="Treatment"||r.unit==="PRIVATE-person-0"||r.horizon!=="h2");});
  assert.equal(sparse.result.configuration.analysis.model.type,"SeparateTrajectory");
  await assert.rejects(a.runOpenEnaTrajectoryPathInferenceV3(sparse.result,sparse.plan,sparse.controls),/two complete/);
});

test("native nonconstant full-space centroids and distances agree with independent scalar algebra",async()=>{
  const a=await api(),f=await nativePathFixture(),value=await a.runOpenEnaTrajectoryPathInferenceV3(f.result,f.plan,f.controls),s=f.result.set;
  const coords=s.pointsForProjection.map(row=>s.rotation.rotationColumns.map((_,axis)=>{let v=0;for(let edge=0;edge<s.codeColumns.length;edge++)v+=Number(row[s.codeColumns[edge]])*s.rotation.rotationMatrix[edge][axis];return v;}));
  const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);
  const dictionary=f.result.executionProvenance.identityDictionary;
  const groups=["Control","Treatment"].map(g=>dictionary.groups.find(e=>e.fields[0].value.value===g)!.displayLabel);
  const horizons=[1,2,3].map(t=>dictionary.horizons.find(e=>e.fields[0].value.value===`h${t}`)!.displayLabel);
  const centers=groups.map(g=>horizons.map(h=>{const rows=s.points.flatMap((r,i)=>r.Group===g&&r.Horizon===h?[coords[i]]:[]);return coords[0].map((_,axis)=>rows.reduce((n,r)=>n+r[axis],0)/rows.length);}));
  for(let i=0;i<s.points.length;i++)for(let j=0;j<3;j++)close(coords[i][j],Number(s.points[i][f.controls.axes[j]]));
  for(let t=0;t<3;t++){const p=value.inference.periods[t];for(let j=0;j<coords[0].length;j++){close(p.fullCentroidA![j],centers[0][t][j]);close(p.fullCentroidB![j],centers[1][t][j]);}const delta=centers[1][t].map((x,j)=>x-centers[0][t][j]);close(p.fullCentroidSeparation!,Math.sqrt(delta.reduce((n,x)=>n+x*x,0)));close(p.selectedCentroidSeparation!,Math.sqrt(delta.slice(0,3).reduce((n,x)=>n+x*x,0)));if(t>0){const distance=(g:number)=>Math.sqrt(centers[g][t].reduce((n,x,j)=>n+(x-centers[g][t-1][j])**2,0));close(p.fullStepDistanceDifference!,distance(1)-distance(0));}}
});
