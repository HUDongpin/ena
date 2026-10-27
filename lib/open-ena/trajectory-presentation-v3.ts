import { buildLongitudinalViewV3, type LongitudinalViewV3 } from "./longitudinal-bound-v3";
import { canonicalJsonV3 } from "./model-v3/canonical-json";
import { openEnaGroupUnitKey, resolveOpenEnaGroupDisplayOptions, type OpenEnaGroupDisplaySettingsByGroup } from "./group-display";
import type { BoundStandardResultV3 } from "./model-v3/types";
import type { IdentityFieldV3 } from "./model-v3/identity";
import { groupDisplayNames2D } from "./group-label-layout-2d";
import { trajectoryPeriodColorsV3, type TrajectoryCentroidIntervalV3 } from "./trajectory-style-v3";
import type { TrajectoryUncertaintyInputV3, TrajectoryUncertaintyResultV3 } from "./trajectory-uncertainty-v3";

/** Plot text is a display value, never an identity or a parsed provenance label. */
export function shortHorizonLabelV3(fields: readonly IdentityFieldV3[]): string {
  return fields.map(field => String(field.value.value)).join(" · ");
}

export interface TrajectoryDisplaySettingsV3 {
  showCentroidPaths: boolean;
  endpointsOnly: boolean;
  /** Exact canonical typed Horizon keys; null means all observed Horizons. */
  visibleHorizons: readonly string[] | null;
  /** Composite Group/Unit token keys from the display owner, never labels. */
  hiddenUnitKeys?: readonly string[];
  groupSettingsByToken?: OpenEnaGroupDisplaySettingsByGroup;
  showDirection?: boolean;
  showConfidenceIntervals?: boolean;
}
export interface TrajectoryCentroidV3 {
  key: string; group: string; horizon: string; horizonShortLabel: string; horizonKey: string; n: number;
  point: Record<string, number>; intervals?: Record<string, TrajectoryCentroidIntervalV3>;
}
export interface TrajectoryUncertaintyDisplayV3 {
  populationKey: string;
  status: "pending" | "ready" | "unavailable" | "disabled";
  result?: TrajectoryUncertaintyResultV3;
}
function trajectoryPopulationContextV3(result: BoundStandardResultV3, settings: TrajectoryDisplaySettingsV3) {
  const view = buildLongitudinalViewV3(result);
  const groupKey = (group: LongitudinalViewV3["entities"][number]["group"]) => canonicalJsonV3(group?.identity ?? null);
  const unitTokens = new Map(result.executionProvenance.identityDictionary.units.map((unit) => [unit.canonicalJson, unit.token]));
  const groupTokens = new Map(result.executionProvenance.identityDictionary.groups.map((group) => [canonicalJsonV3(group.fields[0].value), group.token]));
  const hidden = new Set(settings.hiddenUnitKeys ?? []);
  const tokenForGroup = (entity: LongitudinalViewV3["entities"][number]) => groupTokens.get(groupKey(entity.group)) ?? "";
  const isHidden = (entity: LongitudinalViewV3["entities"][number]) => hidden.has(openEnaGroupUnitKey(tokenForGroup(entity), unitTokens.get(entity.key)!));
  const visibleEntities = view.entities.filter((entity) => !isHidden(entity));
  const summaryEntities = view.entities.filter((entity) => !isHidden(entity)
    || resolveOpenEnaGroupDisplayOptions(settings.groupSettingsByToken ?? {}, tokenForGroup(entity)).includeHiddenPoints);
  return { view, groupKey, visibleEntities, summaryEntities };
}

/** Display summaries use observed Units at each Horizon, independently of the
 * complete-case cohort used by the separate path-comparison export. */
export function buildTrajectoryUncertaintyPopulationV3(result: BoundStandardResultV3, settings: TrajectoryDisplaySettingsV3) {
  const { view, groupKey, summaryEntities } = trajectoryPopulationContextV3(result, settings);
  const groups = new Map<string, { groupKey: string; units: Array<TrajectoryUncertaintyInputV3["groups"][number]["units"][number]> }>();
  for (const entity of summaryEntities) {
    const key = groupKey(entity.group);
    const group = groups.get(key) ?? { groupKey: key, units: [] };
    group.units.push({ unitKey: entity.key, steps: (settings.endpointsOnly ? entity.steps.slice(-1) : entity.steps).map(step => ({
      horizonKey: step.horizon.key, centroidKey: canonicalJsonV3([key, step.horizon.key]),
      coordinates: view.supportedAxes.map(axis => Number(step.point[axis])),
    })) });
    groups.set(key, group);
  }
  const ordered = [...groups.values()].sort((a, b) => a.groupKey < b.groupKey ? -1 : a.groupKey > b.groupKey ? 1 : 0);
  ordered.forEach(group => group.units.sort((a, b) => a.unitKey < b.unitKey ? -1 : a.unitKey > b.unitKey ? 1 : 0));
  const axes = [...view.supportedAxes];
  // Contents are authenticated by the result binding. The remaining key binds
  // the actual display-summary membership, not unrelated display switches.
  const populationKey = canonicalJsonV3({ binding: result.binding, axes, endpointsOnly: settings.endpointsOnly,
    groups: ordered.map(group => [group.groupKey, group.units.map(unit => [unit.unitKey, unit.steps.map(step => step.horizonKey)])]) });
  return { populationKey, axes, groups: ordered };
}

export function buildTrajectoryPresentationV3(result: BoundStandardResultV3, settings: TrajectoryDisplaySettingsV3, uncertainty?: TrajectoryUncertaintyDisplayV3) {
  const { view, groupKey, visibleEntities, summaryEntities } = trajectoryPopulationContextV3(result, settings);
  type Step = LongitudinalViewV3["entities"][number]["steps"][number];
  const populationKey = buildTrajectoryUncertaintyPopulationV3(result, settings).populationKey;
  const currentUncertainty = uncertainty?.populationKey === populationKey ? uncertainty : undefined;
  const uncertaintyByCentroid = new Map(currentUncertainty?.status === "ready" ? currentUncertainty.result?.centroids.map(centroid => [centroid.centroidKey, centroid]) : []);
  const horizonOrder = result.executionProvenance.ordering.resolvedHorizonOrder;
  const dictionary = result.executionProvenance.identityDictionary.horizons;
  const horizons = horizonOrder.type === "trajectory-horizon-order"
    ? horizonOrder.implementationHorizonOrder.map(token => dictionary.find(horizon => horizon.token === token)!).filter(Boolean)
    : [...dictionary];
  const periodColors = trajectoryPeriodColorsV3(horizons.length);
  const horizonStyles = horizons.map((horizon, index) => ({ horizonKey: horizon.canonicalJson,
    label: shortHorizonLabelV3(horizon.fields), detail: horizon.displayLabel, color: periodColors[index] }));
  const visibleHorizons = settings.visibleHorizons === null ? null : new Set(settings.visibleHorizons);
  const visible = (step: Step) => visibleHorizons === null || visibleHorizons.has(step.horizon.key);
  const points = visibleEntities.flatMap((entity) => entity.steps.filter((step, index) => visible(step) && (!settings.endpointsOnly || index === entity.steps.length - 1)).map((step) => ({
    unitKey: entity.key, unitLabel: entity.id, group: entity.group?.label ?? "All Units", horizon: step.horizon.label, horizonShortLabel: shortHorizonLabelV3(step.horizon.identity), horizonKey: step.horizon.key,
    ordinal: step.trajectoryOrdinal, point: step.point,
  })));
  const paths = settings.endpointsOnly ? [] : visibleEntities.flatMap((entity) => entity.steps.slice(1).flatMap((step, index) => {
    const previous = entity.steps[index];
    return visible(previous) && visible(step) ? [{ unitKey: entity.key, unitLabel: entity.id, group: entity.group?.label ?? "All Units", from: previous.point, to: step.point,
      fromOrdinal: previous.trajectoryOrdinal, toOrdinal: step.trajectoryOrdinal }] : [];
  }));
  const populations = new Map<string, { key: string; group: string; horizon: string; horizonShortLabel: string; horizonKey: string; units: Set<string>; points: Step["point"][] }>();
  for (const entity of summaryEntities) for (const step of (settings.endpointsOnly ? entity.steps.slice(-1) : entity.steps)) {
    const key = canonicalJsonV3([groupKey(entity.group), step.horizon.key]);
    const population = populations.get(key) ?? { key, group: entity.group?.label ?? "All Units", horizon: step.horizon.label, horizonShortLabel: shortHorizonLabelV3(step.horizon.identity), horizonKey: step.horizon.key, units: new Set(), points: [] };
    population.units.add(entity.key); population.points.push(step.point); populations.set(key, population);
  }
  const centroids: TrajectoryCentroidV3[] = [...populations.values()].filter((population) => visibleHorizons === null || visibleHorizons.has(population.horizonKey)).map((population) => ({
    key: population.key, group: population.group, horizon: population.horizon, horizonShortLabel: population.horizonShortLabel, horizonKey: population.horizonKey, n: population.units.size,
    point: Object.fromEntries(view.supportedAxes.map((axis) => [axis, population.points.reduce((sum, point) => sum + Number(point[axis]), 0) / population.points.length])),
    intervals: uncertaintyByCentroid.has(population.key) ? Object.fromEntries(uncertaintyByCentroid.get(population.key)!.axes.map(interval => [interval.axis,
      interval.status === "unavailable" ? { status: "not-estimable", reason: interval.reason ?? "unavailable", sampleSize: population.units.size, finiteReplicates: interval.finiteDraws }
        : { status: interval.status === "degenerate" ? "degenerate" : "estimable", lower: interval.lower!, upper: interval.upper!, sampleSize: population.units.size, finiteReplicates: interval.finiteDraws },
    ])) as Record<string, TrajectoryCentroidIntervalV3> : undefined,
  }));
  const byKey = new Map(centroids.map((centroid) => [centroid.key, centroid]));
  const connectors = new Map<string, { from: typeof centroids[number]; to: typeof centroids[number]; contributors: Set<string> }>();
  // Only edges actually traversed by an observed Unit establish continuity.
  // Dictionary and topological-index adjacency never become chronology.
  for (const entity of summaryEntities) for (let index = 1; index < entity.steps.length; index++) {
    const fromKey = canonicalJsonV3([groupKey(entity.group), entity.steps[index - 1].horizon.key]);
    const toKey = canonicalJsonV3([groupKey(entity.group), entity.steps[index].horizon.key]);
    const from = byKey.get(fromKey), to = byKey.get(toKey);
    if (!from || !to) continue;
    const key = canonicalJsonV3([fromKey, toKey]);
    const connector = connectors.get(key) ?? { from, to, contributors: new Set() };
    connector.contributors.add(entity.key); connectors.set(key, connector);
  }
  const legend: { groupLabels?: Readonly<Record<string, string>> } = { groupLabels: groupDisplayNames2D(result.executionProvenance.identityDictionary.groups) };
  return { points, paths, horizonStyles, ...legend, showDirection: settings.showDirection ?? true,
    showConfidenceIntervals: settings.showConfidenceIntervals ?? true,
    uncertaintyStatus: (settings.showConfidenceIntervals === false ? "disabled" : currentUncertainty?.status ?? "pending") as TrajectoryUncertaintyDisplayV3["status"],
    centroids: settings.showCentroidPaths ? centroids : [],
    centroidPaths: settings.showCentroidPaths && !settings.endpointsOnly ? [...connectors.values()].map(({ from, to, contributors }) => ({ from, to, sharedContributorCount: contributors.size })) : [],
    disclosure: "Observed fitted steps retain their original ordinals. Group centroids average the selected display-summary Units observed at each Horizon; paths require actual shared contributors along fitted Unit steps. Missing or filtered steps are not imputed or bridged. Display filtering does not change inference cohorts or the fitted frame." };
}
