import { buildLongitudinalViewV3, type LongitudinalViewV3 } from "./longitudinal-bound-v3";
import { canonicalJsonV3 } from "./model-v3/canonical-json";
import { openEnaGroupUnitKey, resolveOpenEnaGroupDisplayOptions, type OpenEnaGroupDisplaySettingsByGroup } from "./group-display";
import type { BoundStandardResultV3 } from "./model-v3/types";

export interface TrajectoryDisplaySettingsV3 {
  showCentroidPaths: boolean;
  endpointsOnly: boolean;
  /** Exact canonical typed Horizon keys; null means all observed Horizons. */
  visibleHorizons: readonly string[] | null;
  /** Composite Group/Unit token keys from the display owner, never labels. */
  hiddenUnitKeys?: readonly string[];
  groupSettingsByToken?: OpenEnaGroupDisplaySettingsByGroup;
}
export function buildTrajectoryPresentationV3(result: BoundStandardResultV3, settings: TrajectoryDisplaySettingsV3) {
  const view = buildLongitudinalViewV3(result);
  type Step = LongitudinalViewV3["entities"][number]["steps"][number];
  const groupKey = (group: LongitudinalViewV3["entities"][number]["group"]) => canonicalJsonV3(group?.identity ?? null);
  const unitTokens = new Map(result.executionProvenance.identityDictionary.units.map((unit) => [unit.canonicalJson, unit.token]));
  const groupTokens = new Map(result.executionProvenance.identityDictionary.groups.map((group) => [canonicalJsonV3(group.fields[0].value), group.token]));
  const hidden = new Set(settings.hiddenUnitKeys ?? []);
  const tokenForGroup = (entity: LongitudinalViewV3["entities"][number]) => groupTokens.get(groupKey(entity.group)) ?? "";
  const isHidden = (entity: LongitudinalViewV3["entities"][number]) => hidden.has(openEnaGroupUnitKey(tokenForGroup(entity), unitTokens.get(entity.key)!));
  const visibleEntities = view.entities.filter((entity) => !isHidden(entity));
  const summaryEntities = view.entities.filter((entity) => !isHidden(entity)
    || resolveOpenEnaGroupDisplayOptions(settings.groupSettingsByToken ?? {}, tokenForGroup(entity)).includeHiddenPoints);
  const visibleHorizons = settings.visibleHorizons === null ? null : new Set(settings.visibleHorizons);
  const visible = (step: Step) => visibleHorizons === null || visibleHorizons.has(step.horizon.key);
  const points = visibleEntities.flatMap((entity) => entity.steps.filter((step, index) => visible(step) && (!settings.endpointsOnly || index === entity.steps.length - 1)).map((step) => ({
    unitKey: entity.key, unitLabel: entity.id, group: entity.group?.label ?? "All Units", horizon: step.horizon.label, horizonKey: step.horizon.key,
    ordinal: step.trajectoryOrdinal, point: step.point,
  })));
  const paths = settings.endpointsOnly ? [] : visibleEntities.flatMap((entity) => entity.steps.slice(1).flatMap((step, index) => {
    const previous = entity.steps[index];
    return visible(previous) && visible(step) ? [{ unitKey: entity.key, unitLabel: entity.id, group: entity.group?.label ?? "All Units", from: previous.point, to: step.point,
      fromOrdinal: previous.trajectoryOrdinal, toOrdinal: step.trajectoryOrdinal }] : [];
  }));
  const populations = new Map<string, { key: string; group: string; horizon: string; horizonKey: string; units: Set<string>; points: Step["point"][] }>();
  for (const entity of summaryEntities) for (const step of (settings.endpointsOnly ? entity.steps.slice(-1) : entity.steps)) {
    const key = canonicalJsonV3([groupKey(entity.group), step.horizon.key]);
    const population = populations.get(key) ?? { key, group: entity.group?.label ?? "All Units", horizon: step.horizon.label, horizonKey: step.horizon.key, units: new Set(), points: [] };
    population.units.add(entity.key); population.points.push(step.point); populations.set(key, population);
  }
  const centroids = [...populations.values()].filter((population) => visibleHorizons === null || visibleHorizons.has(population.horizonKey)).map((population) => ({
    key: population.key, group: population.group, horizon: population.horizon, horizonKey: population.horizonKey, n: population.units.size,
    point: Object.fromEntries(view.supportedAxes.map((axis) => [axis, population.points.reduce((sum, point) => sum + Number(point[axis]), 0) / population.points.length])),
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
  return { points, paths, centroids: settings.showCentroidPaths ? centroids : [],
    centroidPaths: settings.showCentroidPaths && !settings.endpointsOnly ? [...connectors.values()].map(({ from, to, contributors }) => ({ from, to, sharedContributorCount: contributors.size })) : [],
    disclosure: "Observed fitted steps retain their original ordinals. Group centroids average the selected display-summary Units observed at each Horizon; paths require actual shared contributors along fitted Unit steps. Missing or filtered steps are not imputed or bridged. Display filtering does not change inference cohorts or the fitted frame." };
}
