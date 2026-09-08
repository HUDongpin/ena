import { multiplyMatrices } from "jena-js/core";
import type { IndependentTrajectoryComparisonInput, TrajectoryIdentity, TrajectoryStatisticsLimits } from "j-3dena";
import { compareTrajectoryPaths, getTrajectoryPermutationUnits } from "./trajectory-path-statistics-v3";
import { assertCurrentCapabilityV3, captureControlArrayV3 } from "./inference-consumers-v3";
import { buildLongitudinalViewV3, type HorizonIdentityV3 } from "./longitudinal-bound-v3";
import { canonicalJsonV3, deepFreezeV3, sha256CanonicalJsonV3, snapshotPlainJsonRecordV3 } from "./model-v3/canonical-json";
import { scalarIdentityV3 } from "./model-v3/identity";
import { canonicalJsonByteLengthV3 } from "./model-v3/standard-closure-resource-budget";
import type { BoundStandardResultV3, ScalarIdentityV3 } from "./model-v3/types";

export interface OpenEnaTrajectoryPathControlsV3 {
  axes: readonly [string, string, string];
  /** Researcher confirms each configured full Unit identifies the same entity over time. */
  identityConfirmed: boolean;
  /** Researcher confirms independent entity histories across the two Groups. Not established by labels. */
  independentGroupsConfirmed: boolean;
  primaryGroup: ScalarIdentityV3;
  secondaryGroup: ScalarIdentityV3;
  /** Explicit requested subset/order; every adjacent pair needs fitted precedence. */
  horizons: readonly HorizonIdentityV3[];
  cohortPolicy: "all-period-complete";
  repetitions: number;
  seed: number;
}
// Original pinned algorithm defaults are ceilings for this browser consumer;
// it never raises the original defaults or hard ceilings. Extra work/byte caps
// bound the stored permutation plan and original per-test replicate arrays.
export const NATIVE_PATH_LIMITS_V3 = Object.freeze({ maxPoints: 100_000, maxDimensions: 200, maxPeriods: 1_000, maxParticipants: 50_000, maxCells: 5_000_000, maxResamples: 10_000, maxTests: 10_000,
  maxWork: 50_000_000, maxBytes: 64 * 1024 * 1024 });
const algorithmLimits: TrajectoryStatisticsLimits = { maxPoints: NATIVE_PATH_LIMITS_V3.maxPoints, maxDimensions: NATIVE_PATH_LIMITS_V3.maxDimensions, maxPeriods: NATIVE_PATH_LIMITS_V3.maxPeriods, maxParticipants: NATIVE_PATH_LIMITS_V3.maxParticipants, maxCells: NATIVE_PATH_LIMITS_V3.maxCells, maxResamples: NATIVE_PATH_LIMITS_V3.maxResamples, maxTests: NATIVE_PATH_LIMITS_V3.maxTests };
function exact(record: Record<string, unknown>, keys: readonly string[], label: string) {
  if (Object.keys(record).length !== keys.length || Object.keys(record).some(k => !keys.includes(k))) throw new TypeError(`Exact ${label} controls required`);
}
/** Detached bounded capture, also usable by export before its first await. */
export function captureOpenEnaTrajectoryPathControlsV3(input: OpenEnaTrajectoryPathControlsV3): OpenEnaTrajectoryPathControlsV3 {
  const c = snapshotPlainJsonRecordV3(input, "path controls");
  exact(c, ["axes", "identityConfirmed", "independentGroupsConfirmed", "primaryGroup", "secondaryGroup", "horizons", "cohortPolicy", "repetitions", "seed"], "path");
  if (c.identityConfirmed !== true || c.independentGroupsConfirmed !== true) throw new TypeError("Path inference requires explicit physical identity and independent Group histories confirmation");
  if (c.cohortPolicy !== "all-period-complete") throw new TypeError("Native path inference requires explicit all-period-complete cohort policy");
  if (typeof c.repetitions !== "number" || !Number.isSafeInteger(c.repetitions) || c.repetitions < 1 || c.repetitions > algorithmLimits.maxResamples) throw new TypeError("Path repetitions exceed admitted permutation limit");
  if (typeof c.seed !== "number" || !Number.isSafeInteger(c.seed) || c.seed < 0 || c.seed > 0xffffffff) throw new TypeError("Path seed must be an unsigned 32-bit integer");
  let chars = 0;
  const text = (v: unknown) => { if (typeof v !== "string" || !v.length || v.length > 65_536 || (chars += v.length) > 1_048_576) throw new TypeError("Path control text budget exceeded"); return v; };
  const scalar = (v: unknown): ScalarIdentityV3 => { const r = snapshotPlainJsonRecordV3(v, "typed identity"); exact(r, ["type", "value"], "identity"); const s = scalarIdentityV3(r.value, "path identity"); if (s.type !== r.type) throw new TypeError("Path requires exact typed identity"); if (s.type === "string") text(s.value); return s; };
  const axes = captureControlArrayV3(c.axes, "path axes", 3).map(text) as [string, string, string];
  if (new Set(axes).size !== 3) throw new TypeError("Path inference requires three distinct supported axes");
  const horizons = captureControlArrayV3(c.horizons, "path Horizons", undefined, algorithmLimits.maxPeriods).map(v => {
    const fields = captureControlArrayV3(v, "Horizon fields").map(v => { const r = snapshotPlainJsonRecordV3(v, "Horizon field"); exact(r, ["column", "value"], "Horizon field"); return { column: text(r.column), value: scalar(r.value) }; });
    if (!fields.length || new Set(fields.map(f => f.column)).size !== fields.length) throw new TypeError("Path Horizons require distinct typed source fields"); return fields;
  });
  if (horizons.length < 2 || new Set(horizons.map(h => canonicalJsonV3(h))).size !== horizons.length) throw new TypeError("Path comparison requires at least two distinct Horizons");
  return deepFreezeV3({ axes, horizons, primaryGroup: scalar(c.primaryGroup), secondaryGroup: scalar(c.secondaryGroup), identityConfirmed: true, independentGroupsConfirmed: true, cohortPolicy: c.cohortPolicy, repetitions: c.repetitions, seed: c.seed });
}
function identity(fields: HorizonIdentityV3): TrajectoryIdentity { return { components: fields.map(f => ({ name: f.column, type: f.value.type, value: f.value.value })) }; }
function boundProduct(label: string, ceiling: number, ...counts: number[]) {
  const value = counts.reduce((a, b) => a * b, 1);
  if (!Number.isSafeInteger(value) || value > ceiling) throw new TypeError(`Native path ${label} budget exceeded`);
  return value;
}
async function captureInput(resultInput: unknown, plan: unknown, options: OpenEnaTrajectoryPathControlsV3) {
  const controls = captureOpenEnaTrajectoryPathControlsV3(options);
  const validated = await assertCurrentCapabilityV3(resultInput, plan, "trajectory-inference");
  if (validated.configuration.analysisFamily !== "standard" || validated.configuration.analysis.model.type === "EndPoint") throw new TypeError("Native path inference requires a bound Standard trajectory");
  const result = validated as BoundStandardResultV3, p = result.executionProvenance, dimensions = [...p.projection.fullAxes], limits = NATIVE_PATH_LIMITS_V3;
  const order = p.ordering.resolvedHorizonOrder;
  if (order.type !== "trajectory-horizon-order") throw new TypeError("Native path requires fitted Horizon order");
  const points = result.set.points.length, units = p.identityDictionary.units.length, periods = controls.horizons.length, tests = 9 * periods - 4;
  boundProduct("points", limits.maxPoints, points); boundProduct("dimensions", limits.maxDimensions, dimensions.length); boundProduct("participants", limits.maxParticipants, units); boundProduct("tests", limits.maxTests, tests);
  boundProduct("coordinate cells", limits.maxCells, points, dimensions.length);
  const planCells = boundProduct("permutation plan cells", limits.maxCells, units, controls.repetitions);
  const testCells = boundProduct("permutation test cells", limits.maxCells, tests, controls.repetitions);
  boundProduct("work", limits.maxWork, controls.repetitions, Math.max(1, points), periods, dimensions.length + 3);
  const sourceBytes = canonicalJsonByteLengthV3(result);
  boundProduct("bytes", limits.maxBytes, 4 * sourceBytes + 16 * (planCells + testCells) + points * (dimensions.length + 3) * 32);
  const supportedAxes = p.projection.estimableAxes.filter(a => dimensions.includes(a) && result.set.points.every(pt => typeof pt[a] === "number" && Number.isFinite(pt[a])) && result.set.rotation.nodes!.every(pt => typeof pt[a] === "number" && Number.isFinite(pt[a])));
  if (controls.axes.some(a => !supportedAxes.includes(a))) throw new TypeError("Path inference requires three actual supported axes and complete retained full coordinates");
  // The bound display table retains three axes. Recover the full fitted basis
  // with the same multiplication used by Standard scientific closure; no fit,
  // recentering, source-row access or Reference registration occurs here.
  boundProduct("fixed projection work", limits.maxWork, points, dimensions.length, result.set.codeColumns.length);
  const fullCoordinates = multiplyMatrices(result.set.pointsForProjection.map(row => result.set.codeColumns.map(c => row[c] as number)), result.set.rotation.rotationMatrix);
  const coordinatesByStep = new Map(result.set.points.map((row, i) => [canonicalJsonV3([row.Unit, row.Horizon]), fullCoordinates[i]]));
  const horizonMap = new Map(p.identityDictionary.horizons.map(h => [h.canonicalJson, h]));
  const selected = controls.horizons.map(h => { const entry = horizonMap.get(canonicalJsonV3({ fields: h })); if (!entry) throw new TypeError("Unknown typed fitted Horizon"); return entry; });
  // Reachability in the actual fitted per-Unit adjacency DAG. Serialized total
  // Horizon order never provides evidence that incomparable periods are ordered.
  const edges = new Map(order.horizonTuples.map(h => [h.horizonToken, new Set<string>()]));
  for (const u of order.unitSequences) for (let i = 1; i < u.steps.length; i++) edges.get(u.steps[i - 1].horizonToken)!.add(u.steps[i].horizonToken);
  for (let i = 1; i < selected.length; i++) {
    const pending = [selected[i - 1].token], seen = new Set(pending);
    for (let j = 0; j < pending.length; j++) for (const next of edges.get(pending[j])!) if (!seen.has(next)) { seen.add(next); pending.push(next); }
    if (!seen.has(selected[i].token)) throw new TypeError("Selected path chronology requires fitted precedence; reversed or incomparable Horizons reject");
  }
  const groups = new Map(p.identityDictionary.groups.map(g => [canonicalJsonV3(g.fields[0].value), g]));
  const primary = groups.get(canonicalJsonV3(controls.primaryGroup)), secondary = groups.get(canonicalJsonV3(controls.secondaryGroup));
  if (!primary || !secondary || primary.token === secondary.token) throw new TypeError("Choose two distinct typed fitted Groups");
  const view = buildLongitudinalViewV3(result, { requiredHorizons: controls.horizons });
  const selectedKeys = new Set(selected.map(h => h.canonicalJson));
  const groupInput = (group: typeof primary, namespace: string) => {
    const entities = view.entities.filter(e => e.group && canonicalJsonV3(e.group.identity) === canonicalJsonV3(group.fields[0].value));
    const complete = entities.filter(e => { const keys = new Set(e.steps.map(s => s.horizon.key)); return selected.every(h => keys.has(h.canonicalJson)); });
    if (complete.length < 2) throw new TypeError("Path comparison requires at least two complete independent histories in each Group; core trajectory validity is unchanged");
    return { cohort: { candidateUnits: entities.length, completeUnits: complete.length, excludedIncompleteUnits: entities.length - complete.length }, side: { label: group.displayLabel, series: {
      namespace, dimensions, selectedDimensions: [...controls.axes] as [string, string, string], timeOrder: controls.horizons.map(identity), cohortPolicy: "complete" as const, limits: algorithmLimits,
      points: entities.flatMap(e => e.steps.filter(s => selectedKeys.has(s.horizon.key)).map(s => ({ participant: identity(e.identity), time: identity(s.horizon.identity), coordinates: coordinatesByStep.get(canonicalJsonV3([s.point.Unit, s.point.Horizon]))! }))),
    } } };
  };
  const a = groupInput(primary, "native-group-A"), b = groupInput(secondary, "native-group-B");
  const comparison: IndependentTrajectoryComparisonInput = { design: "independent", sideA: a.side, sideB: b.side };
  return deepFreezeV3({ result, binding: result.binding, controls, dimensions, supportedAxes, comparison, cohort: { primary: a.cohort, secondary: b.cohort },
    context: { controls, dimensions, fittedOrder: order, geometry: result.set.rotation, variance: result.set.variance, projection: p.projection, reference: p.reference, populations: p.populations },
    provenance: { projectionAuthority: p.reference ? "fixed-reference-target-projection" as const : "target-fitted" as const, varianceMeaning: p.reference ? "target variance along fixed reference axes" : "fitted-space variance", currentness: "independent-plan-validated", imputedStepCount: 0, orderAuthority: "fitted-per-Unit-precedence", interpretation: (p.reference?.artifact.fit.method === "means" ? "Means MR1 separation is descriptive by construction and is not independent confirmation; target comparisons use fixed source axes. " : "") + "Independent whole-participant-history permutations assume the researcher-confirmed full Unit identities and independence across Groups. B-minus-A; complete histories across requested Horizons; display filters do not change the cohort. Post-projection comparisons do not establish causality." } });
}
/** Original j-3dENA createPermutationPlanV2 independent Mulberry32/Fisher-Yates recipe. */
export function createNativePathPermutationPlanV3(input: IndependentTrajectoryComparisonInput, repetitions: number, seed: number) {
  if (!Number.isSafeInteger(repetitions) || repetitions < 1 || repetitions > algorithmLimits.maxResamples || !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new TypeError("Invalid native path permutation controls");
  const units = getTrajectoryPermutationUnits(input);
  boundProduct("permutation plan cells", algorithmLimits.maxCells, units.unitOrder.length, repetitions);
  let state = seed >>> 0;
  const random = () => { state = state + 1831565813 >>> 0; let value = state; value = Math.imul(value ^ value >>> 15, value | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61); return ((value ^ value >>> 14) >>> 0) / 4294967296; };
  return { kind: "independent-pool-indices-v1" as const, unitOrder: units.unitOrder, replicates: Array.from({ length: repetitions }, () => { const indexes = units.unitOrder.map((_, i) => i); for (let i = indexes.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [indexes[i], indexes[j]] = [indexes[j], indexes[i]]; } return indexes; }) };
}
const receipts = new WeakMap<object, { binding: string; context: string; output: string }>();
export async function runOpenEnaTrajectoryPathInferenceV3(result: unknown, independentPlan: unknown, controls: OpenEnaTrajectoryPathControlsV3) {
  const input = await captureInput(result, independentPlan, controls);
  const permutationPlan = createNativePathPermutationPlanV3(input.comparison, input.controls.repetitions, input.controls.seed);
  const inference = compareTrajectoryPaths({ ...input.comparison, permutationPlan });
  if (!inference.tests.length || inference.tests.some(t => t.permutationCount !== input.controls.repetitions || !Number.isFinite(t.pValue) || !Number.isFinite(t.holmAdjustedPValue))) throw new TypeError("Native path comparison did not produce the complete requested permutation family");
  const context = canonicalJsonV3(input.context), output = canonicalJsonV3(inference);
  const envelope = deepFreezeV3({ schemaVersion: 3 as const, kind: "open-ena-trajectory-path-inference" as const, result: input.result, binding: input.binding, controls: input.controls, context: input.context, cohort: input.cohort, provenance: input.provenance,
    scientificContextSha256: await sha256CanonicalJsonV3(input.context), permutationPlanSha256: await sha256CanonicalJsonV3(permutationPlan), inference });
  receipts.set(envelope, { binding: canonicalJsonV3(input.binding), context, output });
  return envelope;
}
export type OpenEnaTrajectoryPathInferenceResultV3 = Awaited<ReturnType<typeof runOpenEnaTrajectoryPathInferenceV3>>;
/** Check-only: no imported envelope, forged field or clone can mint a receipt. */
export async function assertOpenEnaTrajectoryPathInferenceConsumerV3(value: unknown, currentResult: unknown, independentPlan: unknown, controls: OpenEnaTrajectoryPathControlsV3): Promise<OpenEnaTrajectoryPathInferenceResultV3> {
  const receipt = value !== null && typeof value === "object" ? receipts.get(value) : undefined;
  if (!receipt) throw new TypeError("Native path inference consumer authority mismatch");
  const current = await captureInput(currentResult, independentPlan, controls);
  if (canonicalJsonV3(current.binding) !== receipt.binding) throw new TypeError("stale native path scientific binding");
  if (canonicalJsonV3(current.context) !== receipt.context) throw new TypeError("Native path scientific controls/context mismatch");
  const envelope = value as OpenEnaTrajectoryPathInferenceResultV3;
  if (canonicalJsonV3(envelope.inference) !== receipt.output) throw new TypeError("Native path output integrity mismatch");
  return envelope;
}
