import { canonicalJsonV3, deepFreezeV3, snapshotPlainJsonRecordV3 } from "./model-v3/canonical-json";
import { scalarIdentityV3, type IdentityFieldV3 } from "./model-v3/identity";
import type { ResolvedExecutionHorizonOrderingV3 } from "./model-v3/execution-plan";
import type { BoundStandardResultV3, ScalarIdentityV3 } from "./model-v3/types";
import { assertCurrentCapabilityV3, boundScientificAdapterV3, captureControlArrayV3 } from "./inference-consumers-v3";
import type { OpenEnaLongitudinalComparisonFrame } from "./longitudinal";
import type { OpenEnaInferenceRequestV2 } from "./inference-v2";

/** All ordered source fields and scalar types participate in Horizon identity. */
export type HorizonIdentityV3 = readonly IdentityFieldV3[];
export interface LongitudinalViewOptionsV3 {
  requestedOrder?: ResolvedExecutionHorizonOrderingV3["unitSequences"];
  displayHorizons?: readonly HorizonIdentityV3[];
  requiredHorizons?: readonly HorizonIdentityV3[];
  minimumCompleteUnits?: number;
}
export type TrajectoryRequestV3 =
  | { kind: "trajectory-independent-period"; period: HorizonIdentityV3; primaryGroup: ScalarIdentityV3; secondaryGroup: ScalarIdentityV3 }
  | { kind: "trajectory-paired-periods"; group: ScalarIdentityV3 | null; earlierPeriod: HorizonIdentityV3; laterPeriod: HorizonIdentityV3; cohortPolicy: "pairwise-complete" }
  | { kind: "trajectory-repeated-periods"; group: ScalarIdentityV3 | null; periods: readonly HorizonIdentityV3[]; cohortPolicy: "all-period-complete"; posthocContrasts: "all-period-pairs" };
export interface OpenEnaTrajectoryControlsV3 {
  axes: readonly [string, string];
  identityConfirmed: boolean;
  request: TrajectoryRequestV3;
  displayHorizons?: readonly HorizonIdentityV3[];
}

function exact(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  if (Object.keys(value).some((key) => !keys.includes(key))) throw new TypeError(`Unknown ${label} controls`);
}
function captureIdentityControls() {
  let characters = 0;
  const text = (value: unknown): string => {
    if (typeof value !== "string" || value.length === 0) throw new TypeError("Trajectory controls require nonempty strings");
    characters += value.length;
    if (value.length > 65_536 || characters > 1_048_576) throw new TypeError("Trajectory controls string budget exceeded");
    return value;
  };
  const scalar = (input: unknown): ScalarIdentityV3 => {
    const record = snapshotPlainJsonRecordV3(input, "typed trajectory identity");
    const value = scalarIdentityV3(record.value, "trajectory identity");
    if (Object.keys(record).length !== 2 || record.type !== value.type) throw new TypeError("Trajectory controls require an exact typed identity");
    if (value.type === "string") text(value.value);
    return value;
  };
  const identity = (input: unknown): IdentityFieldV3[] => {
    const fields = captureControlArrayV3(input, "Horizon identity fields").map((field) => {
      const record = snapshotPlainJsonRecordV3(field, "Horizon field");
      if (Object.keys(record).length !== 2 || !("column" in record) || !("value" in record)) throw new TypeError("Horizon identity requires exact column/value fields");
      return { column: text(record.column), value: scalar(record.value) };
    });
    if (fields.length === 0 || new Set(fields.map((f) => f.column)).size !== fields.length) throw new TypeError("Horizon identity requires distinct fields");
    return fields;
  };
  const horizons = (input: unknown, label: string, maximumLength?: number) => captureControlArrayV3(input, label, undefined, maximumLength).map(identity);
  return { text, scalar, identity, horizons };
}
function captureViewOptions(input: LongitudinalViewOptionsV3) {
  const record = snapshotPlainJsonRecordV3(input, "longitudinal view options");
  exact(record, ["requestedOrder", "displayHorizons", "requiredHorizons", "minimumCompleteUnits"], "view");
  const c = captureIdentityControls();
  const minimumCompleteUnits = record.minimumCompleteUnits === undefined ? 2 : record.minimumCompleteUnits;
  if (typeof minimumCompleteUnits !== "number" || !Number.isSafeInteger(minimumCompleteUnits) || minimumCompleteUnits < 1) throw new TypeError("minimumCompleteUnits must be a positive safe integer");
  const requestedOrder = record.requestedOrder === undefined ? undefined : captureControlArrayV3(record.requestedOrder, "requested Unit sequences").map((input) => {
    const entry = snapshotPlainJsonRecordV3(input, "requested Unit sequence");
    exact(entry, ["unitToken", "steps"], "requested Unit sequence");
    return { unitToken: c.text(entry.unitToken), steps: captureControlArrayV3(entry.steps, "requested steps").map((input) => {
      const step = snapshotPlainJsonRecordV3(input, "requested step");
      exact(step, ["horizonToken", "trajectoryOrdinal"], "requested step");
      if (!Number.isSafeInteger(step.trajectoryOrdinal) || Number(step.trajectoryOrdinal) < 0) throw new TypeError("Invalid fitted trajectory ordinal");
      return { horizonToken: c.text(step.horizonToken), trajectoryOrdinal: step.trajectoryOrdinal as number };
    }) };
  });
  return {
    requestedOrder,
    displayHorizons: record.displayHorizons === undefined ? undefined : c.horizons(record.displayHorizons, "display Horizons"),
    requiredHorizons: record.requiredHorizons === undefined ? undefined : c.horizons(record.requiredHorizons, "required Horizons"),
    minimumCompleteUnits,
  };
}
function captureTrajectoryControls(input: OpenEnaTrajectoryControlsV3) {
  const record = snapshotPlainJsonRecordV3(input, "trajectory controls");
  exact(record, ["axes", "identityConfirmed", "request", "displayHorizons"], "trajectory");
  const c = captureIdentityControls();
  const axes = captureControlArrayV3(record.axes, "axes", 2).map(c.text) as [string, string];
  if (axes[0] === axes[1]) throw new TypeError("Choose two distinct supported axes");
  if (typeof record.identityConfirmed !== "boolean") throw new TypeError("Trajectory identity confirmation must be explicit");
  const r = snapshotPlainJsonRecordV3(record.request, "trajectory request");
  let request: TrajectoryRequestV3;
  if (r.kind === "trajectory-independent-period") {
    exact(r, ["kind", "period", "primaryGroup", "secondaryGroup"], "independent-period");
    request = { kind: r.kind, period: c.identity(r.period), primaryGroup: c.scalar(r.primaryGroup), secondaryGroup: c.scalar(r.secondaryGroup) };
  } else if (r.kind === "trajectory-paired-periods") {
    exact(r, ["kind", "group", "earlierPeriod", "laterPeriod", "cohortPolicy"], "paired-periods");
    if (r.cohortPolicy !== "pairwise-complete") throw new TypeError("Paired trajectory requires pairwise-complete cohort policy");
    request = { kind: r.kind, group: r.group === null ? null : c.scalar(r.group), earlierPeriod: c.identity(r.earlierPeriod), laterPeriod: c.identity(r.laterPeriod), cohortPolicy: r.cohortPolicy };
  } else if (r.kind === "trajectory-repeated-periods") {
    exact(r, ["kind", "group", "periods", "cohortPolicy", "posthocContrasts"], "repeated-periods");
    if (r.cohortPolicy !== "all-period-complete" || r.posthocContrasts !== "all-period-pairs") throw new TypeError("Repeated trajectory requires all-period-complete and all-period-pairs");
    // Two axes times K(K-1)/2 posthoc pairs must fit the existing 4096-row reader.
    // Admit the count before any identity traversal or statistical computation.
    const periodInputs = captureControlArrayV3(r.periods, "repeated periods", undefined, Math.floor((1 + Math.sqrt(1 + 4 * 4096)) / 2));
    if (periodInputs.length < 3 || periodInputs.length * (periodInputs.length - 1) > 4096) throw new TypeError("Repeated trajectory planned row budget requires at least three periods");
    request = { kind: r.kind, group: r.group === null ? null : c.scalar(r.group), periods: periodInputs.map(c.identity), cohortPolicy: r.cohortPolicy, posthocContrasts: r.posthocContrasts };
  } else throw new TypeError("Unsupported native trajectory request");
  return deepFreezeV3({ axes, identityConfirmed: record.identityConfirmed, request, ...(record.displayHorizons === undefined ? {} : { displayHorizons: c.horizons(record.displayHorizons, "display Horizons") }) });
}
function identityKey(fields: HorizonIdentityV3): string { return canonicalJsonV3({ fields }); }
function trajectoryOrder(result: BoundStandardResultV3): ResolvedExecutionHorizonOrderingV3 {
  if (result.configuration.analysisFamily !== "standard" || result.configuration.analysis.model.type === "EndPoint") throw new TypeError("A bound Standard trajectory result is required");
  const ordering = result.executionProvenance.ordering.resolvedHorizonOrder;
  if (ordering.type !== "trajectory-horizon-order") throw new TypeError("Trajectory result lacks fitted Horizon order");
  return ordering;
}
function retainedAxes(result: BoundStandardResultV3) {
  return result.executionProvenance.projection.estimableAxes.filter((axis) => result.set.points.every((point) => typeof point[axis] === "number" && Number.isFinite(point[axis])) && result.set.rotation.nodes!.every((node) => typeof node[axis] === "number" && Number.isFinite(node[axis])));
}
function projectionProvenance(result: BoundStandardResultV3) {
  const reference = result.executionProvenance.reference?.artifact ?? null;
  return {
    projectionAuthority: reference ? "fixed-reference-target-projection" as const : "target-fitted" as const,
    varianceMeaning: reference ? "target variance along fixed reference axes" as const : "fitted-space variance" as const,
    reference,
    interpretation: reference?.fit.method === "means"
      ? "Means MR1 separation is descriptive by construction and is not independent confirmation. Target comparisons describe coordinates on fixed source axes."
      : "Post-projection trajectory comparisons do not establish causality or verify entity identity or independence.",
  };
}
function observedEntities(result: BoundStandardResultV3) {
  const p = result.executionProvenance, ordering = trajectoryOrder(result);
  const units = new Map(p.identityDictionary.units.map((e) => [e.token, e]));
  const horizons = new Map(p.identityDictionary.horizons.map((e) => [e.canonicalJson, e]));
  const horizonsByToken = new Map(p.identityDictionary.horizons.map((e) => [e.token, e]));
  const groups = new Map(p.identityDictionary.groups.map((e) => [e.token, e]));
  const memberships = new Map(p.unitGroups.map((e) => [e.unitToken, e.groupToken]));
  const points = new Map<string, Map<string, typeof result.set.points[number]>>();
  for (const point of result.set.points) {
    const steps = points.get(String(point.Unit)) ?? new Map();
    if (steps.has(String(point.Horizon))) throw new TypeError("Duplicate bound Unit/Horizon point");
    steps.set(String(point.Horizon), point); points.set(String(point.Unit), steps);
  }
  const entities = ordering.unitSequences.map((sequence) => {
    const unit = units.get(sequence.unitToken);
    if (!unit) throw new TypeError("Unknown fitted Unit identity");
    const membership = memberships.get(unit.token);
    const group = membership ? groups.get(membership)! : null;
    return {
      id: unit.displayLabel, identity: unit.fields, key: unit.canonicalJson,
      group: group ? { identity: group.fields[0].value, label: group.displayLabel } : null,
      steps: sequence.steps.map((step) => {
        const horizon = horizonsByToken.get(step.horizonToken);
        const point = horizon && points.get(unit.displayLabel)?.get(horizon.displayLabel);
        if (!horizon || !point) throw new TypeError("Fitted trajectory step lacks its bound observed point");
        return { horizon: { identity: horizon.fields, label: horizon.displayLabel, key: horizon.canonicalJson }, trajectoryOrdinal: step.trajectoryOrdinal, point };
      }),
    };
  });
  return { entities, horizons, horizonsByToken };
}
function resolveHorizons(identities: readonly HorizonIdentityV3[], horizons: ReturnType<typeof observedEntities>["horizons"]) {
  const entries = identities.map((identity) => {
    const entry = horizons.get(identityKey(identity));
    if (!entry) throw new TypeError("Choose typed Horizons observed in the bound result");
    return entry;
  });
  if (new Set(entries.map((e) => e.canonicalJson)).size !== entries.length) throw new TypeError("Choose distinct typed Horizons");
  return entries;
}
function cohort(entities: ReturnType<typeof observedEntities>["entities"], keys: readonly string[], minimumCompleteUnits: number) {
  const completeUnitIds: string[] = [], incompleteUnitIds: string[] = [];
  for (const entity of entities) {
    const observed = new Set(entity.steps.map((s) => s.horizon.key));
    (keys.every((key) => observed.has(key)) ? completeUnitIds : incompleteUnitIds).push(entity.id);
  }
  return { candidateUnitCount: entities.length, completeUnitCount: completeUnitIds.length, incompleteUnitCount: incompleteUnitIds.length, completeUnitIds, incompleteUnitIds, minimumCompleteUnits, status: completeUnitIds.length >= minimumCompleteUnits ? "available" as const : "blocked" as const };
}
/** Pure presentation derivation for an already admitted bound result, like the
 * bound Methods builder. It supplies no validation, source or current authority.
 * Historical/imported science remains inspectable; computation has a separate
 * strong async gate below. No two-axis or Group prerequisite applies here. */
export function buildLongitudinalViewV3(input: BoundStandardResultV3, options: LongitudinalViewOptionsV3 = {}) {
  const controls = captureViewOptions(options);
  const result = structuredClone(input);
  const ordering = trajectoryOrder(result);
  if (controls.requestedOrder !== undefined && canonicalJsonV3(controls.requestedOrder) !== canonicalJsonV3(ordering.unitSequences)) throw new TypeError(`${result.configuration.analysis.model.type} must preserve the fitted Horizon order; refit to change scientific order`);
  const { entities, horizons } = observedEntities(result);
  const required = controls.requiredHorizons === undefined ? [...horizons.values()] : resolveHorizons(controls.requiredHorizons, horizons);
  if (!required.length) throw new TypeError("A comparison requires at least one observed Horizon");
  const display = controls.displayHorizons === undefined ? null : new Set(resolveHorizons(controls.displayHorizons, horizons).map((e) => e.canonicalJson));
  return deepFreezeV3({
    schemaVersion: 3 as const, kind: "open-ena-bound-longitudinal-view" as const,
    result, binding: result.binding, configuration: result.configuration, unitSequences: ordering.unitSequences,
    entities: entities.map((e) => ({ ...e, steps: display === null ? e.steps : e.steps.filter((s) => display.has(s.horizon.key)) })),
    supportedAxes: retainedAxes(result), geometry: result.set.rotation, variance: result.set.variance,
    comparison: { ...cohort(entities, required.map((e) => e.canonicalJson), controls.minimumCompleteUnits), requiredHorizons: required.map((e) => e.fields) },
    provenance: { ...projectionProvenance(result), currentness: "not-established" as const, imputedStepCount: 0 as const, cohortMeaning: "Downstream complete-case availability does not determine core trajectory validity. Display filters do not change the cohort or fitted ordinals." },
    displayHorizons: controls.displayHorizons ?? null,
  });
}
export type LongitudinalViewV3 = ReturnType<typeof buildLongitudinalViewV3>;
export function reorderLongitudinalViewV3(view: LongitudinalViewV3, requestedOrder: ResolvedExecutionHorizonOrderingV3["unitSequences"]) {
  return buildLongitudinalViewV3(view.result, { requestedOrder, ...(view.displayHorizons === null ? {} : { displayHorizons: view.displayHorizons }), requiredHorizons: view.comparison.requiredHorizons, minimumCompleteUnits: view.comparison.minimumCompleteUnits });
}

/** Sparse DAG from fitted facts. Queue order serializes otherwise incomparable
 * vertices solely for private frame indexes; it is never chronology evidence. */
function fittedPrecedence(order: ResolvedExecutionHorizonOrderingV3) {
  const edges = new Map(order.horizonTuples.map((e) => [e.horizonToken, new Set<string>()]));
  const incoming = new Map(order.horizonTuples.map((e) => [e.horizonToken, 0]));
  for (const unit of order.unitSequences) for (let i = 1; i < unit.steps.length; i += 1) {
    const from = unit.steps[i - 1].horizonToken, to = unit.steps[i].horizonToken;
    if (!edges.get(from)!.has(to)) { edges.get(from)!.add(to); incoming.set(to, incoming.get(to)! + 1); }
  }
  const queue = [...incoming.keys()].filter((key) => incoming.get(key) === 0), indexes: string[] = [];
  for (let i = 0; i < queue.length; i += 1) {
    const key = queue[i]; indexes.push(key);
    for (const next of edges.get(key)!) { incoming.set(next, incoming.get(next)! - 1); if (incoming.get(next) === 0) queue.push(next); }
  }
  if (indexes.length !== edges.size) throw new TypeError("Fitted Horizon precedence is inconsistent");
  const precedes = (from: string, to: string) => {
    const pending = [from], seen = new Set([from]);
    for (let i = 0; i < pending.length; i += 1) for (const next of edges.get(pending[i])!) {
      if (next === to) return true;
      if (!seen.has(next)) { seen.add(next); pending.push(next); }
    }
    return false;
  };
  return { indexes, precedes };
}

export async function buildLongitudinalInferenceInputV3(input: unknown, independentPlan: unknown, options: OpenEnaTrajectoryControlsV3) {
  const controls = captureTrajectoryControls(options);
  const validated = await assertCurrentCapabilityV3(input, independentPlan, "trajectory-inference");
  if (validated.configuration.analysisFamily !== "standard") throw new TypeError("Trajectory inference requires Standard");
  const result = validated as BoundStandardResultV3, ordering = trajectoryOrder(result), supportedAxes = retainedAxes(result);
  if (controls.axes.some((axis) => !supportedAxes.includes(axis))) throw new TypeError("This request requires two distinct supported axes with retained coordinates");
  const observed = observedEntities(result), dictionary = result.executionProvenance.identityDictionary;
  if (dictionary.horizons.length > 4096 || dictionary.groups.length > 4096) throw new TypeError("Native trajectory inference mapping exceeds the existing aggregate array budget");
  if (controls.displayHorizons !== undefined) resolveHorizons(controls.displayHorizons, observed.horizons);
  const request = controls.request;
  const selected = resolveHorizons(request.kind === "trajectory-independent-period" ? [request.period] : request.kind === "trajectory-paired-periods" ? [request.earlierPeriod, request.laterPeriod] : request.periods, observed.horizons);
  const dag = fittedPrecedence(ordering);
  if (request.kind !== "trajectory-independent-period" && selected.some((entry, i) => i > 0 && !dag.precedes(selected[i - 1].token, entry.token))) throw new TypeError("Selected chronology requires fitted precedence; reversed or incomparable Horizons cannot redefine fitted Horizon order");
  const groups = new Map(dictionary.groups.map((e) => [canonicalJsonV3(e.fields[0].value), e]));
  const selectedGroup = (identity: ScalarIdentityV3) => {
    const group = groups.get(canonicalJsonV3(identity));
    if (!group) throw new TypeError("Choose a typed Group in the bound result");
    return group;
  };
  const selectedGroups = request.kind === "trajectory-independent-period"
    ? [selectedGroup(request.primaryGroup), selectedGroup(request.secondaryGroup)]
    : request.group === null ? [] : [selectedGroup(request.group)];
  if (request.kind === "trajectory-independent-period" && selectedGroups[0].token === selectedGroups[1].token) throw new TypeError("Choose two distinct typed Groups");
  if (request.kind !== "trajectory-independent-period" && (result.configuration.units.group.type === "none" ? request.group !== null : request.group === null)) throw new TypeError("Paired/repeated inference needs a configured typed Group, or null for an ungrouped model");
  const labels = new Set(selectedGroups.map((g) => g.displayLabel));
  const entities = observed.entities.filter((e) => labels.size === 0 || (e.group !== null && labels.has(e.group.label)));
  // Existing rank routines require an observed sample/block, then assess
  // ties and zero differences themselves. Do not invent a variance-based n=2
  // gate around the nonparametric coordinator.
  const comparison = cohort(entities, selected.map((e) => e.canonicalJson), 1);
  const groupAvailability = selectedGroups.map((g) => ({ identity: g.fields[0].value, ...cohort(entities.filter((e) => e.group?.label === g.displayLabel), selected.map((e) => e.canonicalJson), 1) }));
  const countAvailable = request.kind === "trajectory-independent-period" ? groupAvailability.every((g) => g.status === "available") : comparison.status === "available";
  return deepFreezeV3({
    result, binding: result.binding, configuration: result.configuration, controls, supportedAxes,
    provenance: { ...projectionProvenance(result), currentness: "independent-plan-validated" as const, imputedStepCount: 0 as const, orderAuthority: "fitted-per-Unit-precedence" as const, frameIndexMeaning: "Topological linearization for private indexing only; incomparable Horizon index order is implementation-only." },
    comparison: { ...comparison, status: countAvailable ? "available" as const : "blocked" as const, groupAvailability, identityConfirmed: controls.identityConfirmed, requiredHorizons: selected.map((e) => e.fields), cohortPolicy: request.kind === "trajectory-independent-period" ? "available-at-period" as const : request.cohortPolicy, availabilityMeaning: "Observed cohort counts only; identity confirmation and axis-specific degeneracy remain separate." },
    // Native identities remain on this public context; row aliases are private.
    context: { request, axes: controls.axes, identityConfirmed: controls.identityConfirmed, unitColumns: result.configuration.units.columns, horizonColumns: result.configuration.horizons.columns, unitSequences: ordering.unitSequences, frameIndexHorizons: dag.indexes.map((token) => observed.horizonsByToken.get(token)!.fields) },
  });
}
export type LongitudinalInferenceInputV3 = Awaited<ReturnType<typeof buildLongitudinalInferenceInputV3>>;

/** Internal faithful adapter. No caller frame, aliases-as-source metadata, new
 * source registration, re-accumulation or fit is accepted. */
export function trajectoryScientificAdapterV3(input: LongitudinalInferenceInputV3) {
  const { result, controls } = input, adapted = boundScientificAdapterV3(result, input.supportedAxes);
  const observed = observedEntities(result), dag = fittedPrecedence(trajectoryOrder(result));
  const timeOrder = dag.indexes.map((key) => observed.horizonsByToken.get(key)!.displayLabel), timeIndexes = new Map(timeOrder.map((label, i) => [label, i]));
  const grouped = result.configuration.units.group.type !== "none";
  const groups = (grouped ? adapted.groups.map((g) => g.name).sort() : ["All units"]).map((name, index) => ({ name, index, role: grouped ? "configured-group" as const : "all-units" as const }));
  const groupsByLabel = new Map(groups.map((g) => [g.name, g]));
  const binding = { analyzedAt: result.createdAt, datasetNormalizedUtf8TextSha256: input.binding.datasetSha256, datasetHashKind: input.binding.datasetHashKind, modelType: result.configuration.analysis.model.type as "SeparateTrajectory" | "AccumulatedTrajectory", configuration: adapted.adapterConfiguration, axes: [...controls.axes] as [string, string] };
  const frame: OpenEnaLongitudinalComparisonFrame = {
    kind: "open-ena-longitudinal-comparison-frame", coordinateSystem: "unflipped-model-coordinates", binding,
    repeatedEntityColumns: [...adapted.set.units], timeColumn: "Horizon", timeOrder, axes: [...controls.axes], identityConfirmed: controls.identityConfirmed,
    eligibility: { eligible: controls.identityConfirmed, reason: controls.identityConfirmed ? null : "identity-not-confirmed" }, groups,
    points: observed.entities.flatMap((entity, index) => entity.steps.map((step) => ({ entityToken: `bound-unit-${index}`, group: groupsByLabel.get(entity.group?.label ?? "All units")!, time: step.horizon.label, timeIndex: timeIndexes.get(step.horizon.label)!, x: step.point[controls.axes[0]] as number, y: step.point[controls.axes[1]] as number, sourcePointCount: 1 }))),
  };
  const label = (fields: HorizonIdentityV3) => observed.horizons.get(identityKey(fields))!.displayLabel;
  const groupIndex = new Map(result.executionProvenance.identityDictionary.groups.map((g) => [canonicalJsonV3(g.fields[0].value), g.displayLabel]));
  const groupLabel = (identity: ScalarIdentityV3 | null) => identity === null ? null : groupIndex.get(canonicalJsonV3(identity))!;
  const common = { repeatedEntityColumns: frame.repeatedEntityColumns, timeColumn: frame.timeColumn, axes: [...controls.axes] as [string, string] }, r = controls.request;
  const request: Exclude<OpenEnaInferenceRequestV2, { kind: "endpoint-independent" }> = r.kind === "trajectory-independent-period"
    ? { ...common, kind: r.kind, primaryGroup: groupLabel(r.primaryGroup)!, secondaryGroup: groupLabel(r.secondaryGroup)!, period: label(r.period) }
    : r.kind === "trajectory-paired-periods"
      ? { ...common, kind: r.kind, group: groupLabel(r.group), earlierPeriod: label(r.earlierPeriod), laterPeriod: label(r.laterPeriod), cohortPolicy: r.cohortPolicy }
      : { ...common, kind: r.kind, group: groupLabel(r.group), periods: r.periods.map(label), cohortPolicy: r.cohortPolicy, posthocContrasts: r.posthocContrasts };
  return { adapted, frame, request };
}
