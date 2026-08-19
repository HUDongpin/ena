import type { Row } from "jena-js";
import { rowsToCsv } from "./export";
import {
  JENA_RUNTIME_VERSION,
  sameOpenEnaConfig,
  type OpenEnaConfig,
  type OpenEnaProjectionReference,
  type OpenEnaResult,
  type ParsedDataset,
} from "./types";

export type OpenEnaLongitudinalCohortPolicy = "available" | "complete";
export type OpenEnaTrajectoryModel = "SeparateTrajectory" | "AccumulatedTrajectory";

export interface OpenEnaLongitudinalSettings {
  repeatedEntityColumn: string;
  timeColumn: string;
  /** Explicit period order; it is never inferred by a lexical sort. */
  timeOrder: string[];
  cohortPolicy: OpenEnaLongitudinalCohortPolicy;
  axes: [string, string];
  datasetNormalizedUtf8TextSha256?: string | null;
}

export interface OpenEnaLongitudinalEntityPeriod {
  entityId: string;
  group: string;
  time: string;
  timeIndex: number;
  x: number;
  y: number;
  /** Compact jENA unit-period points collapsed into this participant-period point. */
  sourcePointCount: number;
}

export interface OpenEnaLongitudinalPeriod {
  group: string;
  time: string;
  timeIndex: number;
  /** Stable distinct repeated entities assigned to this group. */
  nTotal: number;
  /** Policy-selected entity-period contributors to this centroid. */
  nUsed: number;
  /** Stable group population minus the policy-selected contributors. */
  nExcluded: number;
  /** Entities observed in this group at this period before cohort filtering. */
  availableEntityCount: number;
  /** Entities in this group observed at every selected ordered period. */
  completeEntityCount: number;
  /** Entities contributing under the selected cohort policy at this period. */
  includedEntityCount: number;
  /** Stable group population minus includedEntityCount. */
  excludedEntityCount: number;
  /** Contributors shared with the immediately preceding period; null for the first period. */
  contributorOverlapWithPrevious: number | null;
  continuityStatus: "start" | "connected" | "missing-period" | "no-contributor-overlap";
  centroid: { x: number; y: number } | null;
  /** Change from the immediately preceding ordered period, or null across a gap. */
  dx: number | null;
  /** Change from the immediately preceding ordered period, or null across a gap. */
  dy: number | null;
  /** Euclidean distance from the immediately preceding ordered period. */
  stepDistance: number | null;
  /** Sum of valid adjacent-period distances; missing periods are never bridged. */
  cumulativeDistance: number;
}

export interface OpenEnaLongitudinalSegment {
  group: string;
  fromTime: string;
  toTime: string;
  fromTimeIndex: number;
  toTimeIndex: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  dx: number;
  dy: number;
  distance: number;
  cumulativeDistance: number;
  contributorOverlapCount: number;
}

export interface OpenEnaLongitudinalGroup {
  name: string;
  /** Distinct policy-selected repeated entities assigned to this group. */
  entityCount: number;
  periods: OpenEnaLongitudinalPeriod[];
  segments: OpenEnaLongitudinalSegment[];
  cumulativeDistance: number;
}

export interface OpenEnaLongitudinalGeometry {
  codes: string[];
  dimensions: string[];
  adjacencyKey: Array<{
    source: string;
    target: string;
    name: string;
    sourceIndex: number;
    targetIndex: number;
  }>;
  rotationColumns: string[];
  rotationMatrix: number[][];
  eigenvalues: number[];
  centerVector: number[];
  variance: Record<string, number>;
  nodes: Array<{ code: string; coordinates: Record<string, number> }>;
}

export interface OpenEnaLongitudinalView {
  repeatedEntityColumn: string;
  timeColumn: string;
  timeOrder: string[];
  timeOrderPolicy: {
    locked: boolean;
    basis: "source-encounter-and-jena-step-order" | "researcher-explicit-order";
  };
  cohortPolicy: OpenEnaLongitudinalCohortPolicy;
  axes: [string, string];
  availableEntityCount: number;
  completeEntityCount: number;
  includedEntityCount: number;
  coordinateExtent: { minX: number; maxX: number; minY: number; maxY: number };
  nodes: Array<{ code: string; x: number; y: number }>;
  entityPeriods: OpenEnaLongitudinalEntityPeriod[];
  periodDiagnostics: OpenEnaLongitudinalPeriod[];
  groups: OpenEnaLongitudinalGroup[];
  configuration: OpenEnaConfig;
  source: {
    datasetName: string;
    source: ParsedDataset["source"];
    rowCount: number;
    columnCount: number;
    normalizedUtf8TextSha256: string | null;
  };
  resultProvenance: {
    analyzedAt: string;
    modelType: OpenEnaTrajectoryModel;
    sourceBindingStatus: "bound" | "not-present";
    projectionReference: OpenEnaProjectionReference | null;
    runtime: "jena-js";
    runtimeVersion: typeof JENA_RUNTIME_VERSION;
  };
  geometry: OpenEnaLongitudinalGeometry;
  createdAt: string;
  boundaries: string[];
}

export interface OpenEnaLongitudinalPresentationOptions {
  flipX?: boolean;
  flipY?: boolean;
  showIndividualPaths?: boolean;
  showGroupCentroidPaths?: boolean;
  showPoints?: boolean;
  showLabels?: boolean;
  showVariance?: boolean;
  pointScale?: number;
  plotZoom?: number;
}

export const LONGITUDINAL_BOUNDARIES = [
  "Group-centroid trajectories are descriptive geometry in one already-fitted jENA coordinate space; they do not establish statistical significance, development, learning, intervention effects, or causality.",
  "Available cohort means that each period centroid uses the repeated entities observed in that period.",
  "Complete cohort retains only repeated entities observed in every selected ordered period, so the contributor population is constant across periods.",
  "Separate trajectories use the researcher-selected explicit period order. Accumulated trajectories are locked to a source-encounter order that must agree with every analytic unit's fitted jENA step sequence.",
  "Duplicate entity-by-time projected points are first averaged to one equal-weight participant-period point, then participant-period points receive equal weight in each group centroid.",
  "A missing group-period centroid or zero repeated-entity overlap between adjacent centroids creates a discontinuity; no displacement or distance is inferred across that gap.",
  "Endpoint significance and effect-size tests are not applied to repeated trajectory observations.",
  "Raw source rows and row-level co-occurrence records are excluded from longitudinal exports; preserve the exact source CSV and codebook beside the source hash and derived result.",
] as const;

export const LONGITUDINAL_INDIVIDUAL_MARK_LIMIT = 2_000;

interface SourceStepIdentity {
  entityId: string;
  time: string;
  group: string;
}

interface MutableEntityPeriod {
  entityId: string;
  group: string;
  time: string;
  timeIndex: number;
  xTotal: number;
  yTotal: number;
  sourcePointCount: number;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneConfig(config: OpenEnaConfig): OpenEnaConfig {
  return {
    ...config,
    unitColumns: [...config.unitColumns],
    conversationColumns: [...config.conversationColumns],
    codes: [...config.codes],
  };
}

function normalized(value: unknown) {
  return String(value ?? "");
}

function merged(row: Row, columns: readonly string[]) {
  return columns.map((column) => normalized(row[column])).join("::");
}

function exactStepKey(row: Row, config: OpenEnaConfig) {
  return JSON.stringify([
    ...config.unitColumns.map((column) => normalized(row[column])),
    ...config.conversationColumns.map((column) => normalized(row[column])),
  ]);
}

function entityPeriodKey(entityId: string, time: string) {
  return JSON.stringify([entityId, time]);
}

function individualSegmentCount(periods: readonly OpenEnaLongitudinalEntityPeriod[]) {
  const byEntity = new Map<string, OpenEnaLongitudinalEntityPeriod[]>();
  periods.forEach((period) => {
    const entries = byEntity.get(period.entityId);
    if (entries) entries.push(period);
    else byEntity.set(period.entityId, [period]);
  });
  let count = 0;
  byEntity.forEach((entries) => {
    entries.sort((left, right) => left.timeIndex - right.timeIndex);
    for (let index = 1; index < entries.length; index += 1) {
      if (entries[index].timeIndex === entries[index - 1].timeIndex + 1
        && entries[index].group === entries[index - 1].group) count += 1;
    }
  });
  return count;
}

function finite(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite coordinate or geometry value.`);
  }
  return value;
}

function canonicalTime(value: string, label: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`${label} must be a canonical ISO timestamp.`);
  }
  return value;
}

function compareStrings(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameOrderedValues(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validateHash(value: string | null | undefined, label: string) {
  if (value !== null && value !== undefined && !/^[0-9a-f]{64}$/iu.test(value)) {
    throw new Error(`${label} must be a 64-character SHA-256 value.`);
  }
  return value?.toLowerCase() ?? null;
}

function buildGeometry(result: OpenEnaResult): OpenEnaLongitudinalGeometry {
  const dimensions = [...result.dimensions];
  if (new Set(dimensions).size !== dimensions.length || dimensions.length < 2) {
    throw new Error("The trajectory result must expose at least two unique projected dimensions.");
  }
  return {
    codes: [...result.set.rotation.codes],
    dimensions,
    adjacencyKey: result.set.adjacencyKey.map((edge) => ({
      source: edge.source,
      target: edge.target,
      name: edge.name,
      sourceIndex: edge.sourceIndex,
      targetIndex: edge.targetIndex,
    })),
    rotationColumns: [...result.set.rotation.rotationColumns],
    rotationMatrix: result.set.rotation.rotationMatrix.map((row) => row.map((value) => finite(value, "Rotation matrix value"))),
    eigenvalues: result.set.rotation.eigenvalues.map((value) => finite(value, "Rotation eigenvalue")),
    centerVector: result.set.rotation.centerVector.map((value) => finite(value, "Rotation center value")),
    variance: Object.fromEntries(dimensions.map((dimension) => [
      dimension,
      finite(result.set.variance[dimension], `Result variance ${dimension}`),
    ])),
    nodes: result.set.rotation.codes.map((code) => {
      const node = result.set.rotation.nodes?.find((candidate) => normalized(candidate.code) === code);
      if (!node) throw new Error(`The trajectory result geometry is missing the node for code ${code}.`);
      return {
        code,
        coordinates: Object.fromEntries(dimensions.map((dimension) => [
          dimension,
          finite(node[dimension], `Node ${code} ${dimension}`),
        ])),
      };
    }),
  };
}

function validateInputs(
  result: OpenEnaResult,
  config: OpenEnaConfig,
  dataset: ParsedDataset,
  settings: OpenEnaLongitudinalSettings,
) {
  if ((result.set.modelType !== "SeparateTrajectory" && result.set.modelType !== "AccumulatedTrajectory")
    || (config.model !== "SeparateTrajectory" && config.model !== "AccumulatedTrajectory")) {
    throw new Error("Longitudinal group-centroid analysis requires a successful SeparateTrajectory or AccumulatedTrajectory jENA result.");
  }
  if (result.set.modelType !== config.model) {
    throw new Error("The successful trajectory result model does not match the supplied configuration.");
  }
  const expectedWindowSizeBack = config.window === "Conversation"
    ? Number.POSITIVE_INFINITY
    : config.windowSizeBack;
  const expectedWindowSizeForward = config.window === "Conversation" ? 0 : config.windowSizeForward;
  if (!sameOrderedValues(result.set.units, config.unitColumns)
    || !sameOrderedValues(result.set.conversation, config.conversationColumns)
    || !sameOrderedValues(result.set.codes, config.codes)
    || result.set.functionParams.model !== config.model
    || result.set.functionParams.window !== config.window
    || result.set.functionParams.windowSizeBack !== expectedWindowSizeBack
    || result.set.functionParams.windowSizeForward !== expectedWindowSizeForward
    || result.set.functionParams.weightBy !== config.weightBy) {
    throw new Error("The successful jENA trajectory result does not match the supplied successful-result configuration.");
  }
  if (result.provenanceBinding && !sameOpenEnaConfig(result.provenanceBinding.configuration, config)) {
    throw new Error("The trajectory result provenance binding does not match the supplied successful-result configuration.");
  }
  if (!settings.repeatedEntityColumn || !config.unitColumns.includes(settings.repeatedEntityColumn)) {
    throw new Error("Longitudinal analysis is unavailable: the repeated-entity mapping must be one configured unit column.");
  }
  if (!settings.timeColumn || !config.conversationColumns.includes(settings.timeColumn)) {
    throw new Error("Longitudinal analysis is unavailable: the time/order mapping must be one configured conversation column.");
  }
  if (!dataset.headers.includes(settings.repeatedEntityColumn)) {
    throw new Error("The source dataset is missing the configured repeated-entity mapping column.");
  }
  if (!dataset.headers.includes(settings.timeColumn)) {
    throw new Error("The source dataset is missing the configured time/order mapping column.");
  }
  if (config.groupColumn && !dataset.headers.includes(config.groupColumn)) {
    throw new Error("The source dataset is missing the configured comparison-group column.");
  }
  const axes = settings.axes;
  if (!Array.isArray(axes) || axes.length !== 2 || axes[0] === axes[1]
    || axes.some((axis) => !result.dimensions.includes(axis))) {
    throw new Error("Longitudinal analysis requires two distinct axes from the successful trajectory result.");
  }
  if (!Array.isArray(settings.timeOrder) || settings.timeOrder.length < 2
    || settings.timeOrder.some((time) => typeof time !== "string" || time.length === 0)
    || new Set(settings.timeOrder).size !== settings.timeOrder.length) {
    throw new Error("The explicit time order must contain at least two unique, nonempty periods.");
  }
  if (settings.cohortPolicy !== "available" && settings.cohortPolicy !== "complete") {
    throw new Error("The cohort policy must be available or complete.");
  }
  if (config.codes.length !== result.set.rotation.codes.length
    || config.codes.some((code, index) => code !== result.set.rotation.codes[index])) {
    throw new Error("The supplied successful-result configuration does not match the trajectory geometry code order.");
  }
  canonicalTime(result.analyzedAt, "The trajectory result analysis time");
}

function sourceStepIdentities(
  sourceRows: Row[],
  config: OpenEnaConfig,
  settings: OpenEnaLongitudinalSettings,
) {
  const byStep = new Map<string, SourceStepIdentity>();
  const groupByEntity = new Map<string, string>();
  const observedTimes = new Set<string>();
  const observedTimeOrder: string[] = [];
  const analyticUnitTimeOrder = new Map<string, string[]>();
  for (const [index, row] of sourceRows.entries()) {
    const entityId = normalized(row[settings.repeatedEntityColumn]);
    const time = normalized(row[settings.timeColumn]);
    const group = config.groupColumn ? normalized(row[config.groupColumn]) : "All units";
    if (!entityId) throw new Error(`Source row ${index + 1} has an empty repeated-entity value.`);
    if (!time) throw new Error(`Source row ${index + 1} has an empty time/order value.`);
    if (!group) throw new Error(`Source row ${index + 1} has an empty comparison-group value.`);
    if (!observedTimes.has(time)) observedTimeOrder.push(time);
    observedTimes.add(time);
    const priorGroup = groupByEntity.get(entityId);
    if (priorGroup !== undefined && priorGroup !== group) {
      throw new Error(`One repeated entity changes comparison group at source row ${index + 1}; identifiers and group values are omitted.`);
    }
    groupByEntity.set(entityId, group);

    const key = exactStepKey(row, config);
    const prior = byStep.get(key);
    if (prior && (prior.entityId !== entityId || prior.time !== time || prior.group !== group)) {
      throw new Error("One compact unit-conversation identity maps to changing entity, time, or group values.");
    }
    if (!prior) {
      const analyticUnit = merged(row, config.unitColumns);
      const unitTimes = analyticUnitTimeOrder.get(analyticUnit) ?? [];
      unitTimes.push(time);
      analyticUnitTimeOrder.set(analyticUnit, unitTimes);
    }
    byStep.set(key, { entityId, time, group });
  }
  if (!byStep.size) throw new Error("Longitudinal analysis requires source rows with repeated-entity and time mappings.");
  const orderedTimes = new Set(settings.timeOrder);
  if (orderedTimes.size !== observedTimes.size
    || [...observedTimes].some((time) => !orderedTimes.has(time))) {
    throw new Error("The explicit time order must include every observed period exactly once and cannot introduce unknown periods.");
  }
  return { byStep, groupByEntity, observedTimes, observedTimeOrder, analyticUnitTimeOrder };
}

function compactEntityPeriods(
  result: OpenEnaResult,
  config: OpenEnaConfig,
  settings: OpenEnaLongitudinalSettings,
  byStep: Map<string, SourceStepIdentity>,
) {
  const trajectoryRows = result.set.trajectories;
  if (!trajectoryRows || trajectoryRows.length === 0 || trajectoryRows.length !== result.set.points.length) {
    throw new Error("The compact jENA trajectory result must contain exactly one trajectory identity row per projected point.");
  }
  const timeIndex = new Map(settings.timeOrder.map((time, index) => [time, index]));
  const seenSteps = new Set<string>();
  const mutable = new Map<string, MutableEntityPeriod>();
  for (let index = 0; index < trajectoryRows.length; index += 1) {
    const trajectory = trajectoryRows[index];
    const point = result.set.points[index];
    const key = exactStepKey(trajectory, config);
    if (seenSteps.has(key)) {
      throw new Error("The compact jENA trajectory result contains a duplicate unit-conversation point identity.");
    }
    seenSteps.add(key);
    const source = byStep.get(key);
    if (!source) {
      throw new Error("One compact jENA trajectory point has no exact source unit-conversation mapping.");
    }
    const expectedUnit = merged(trajectory, config.unitColumns);
    if (normalized(trajectory.ENA_UNIT) !== expectedUnit || normalized(point.ENA_UNIT) !== expectedUnit) {
      throw new Error("A compact jENA trajectory point does not preserve its exact composite analytic-unit identity.");
    }
    if (normalized(trajectory[settings.repeatedEntityColumn]) !== source.entityId
      || normalized(trajectory[settings.timeColumn]) !== source.time) {
      throw new Error("A compact jENA trajectory point does not match its repeated-entity or time mapping.");
    }
    if (config.groupColumn) {
      const trajectoryGroup = normalized(trajectory[config.groupColumn]);
      const pointGroup = normalized(point[config.groupColumn]);
      if (trajectoryGroup !== source.group || pointGroup !== source.group) {
        throw new Error("A compact jENA trajectory point does not preserve its stable entity group mapping.");
      }
    }
    const indexForTime = timeIndex.get(source.time);
    if (indexForTime === undefined) {
      throw new Error(`Compact trajectory period ${source.time} is absent from the explicit time order.`);
    }
    for (const dimension of result.dimensions) {
      finite(point[dimension], `Projected point ${index + 1} ${dimension} coordinate`);
    }
    const x = finite(point[settings.axes[0]], `Projected point ${index + 1} ${settings.axes[0]} coordinate`);
    const y = finite(point[settings.axes[1]], `Projected point ${index + 1} ${settings.axes[1]} coordinate`);
    const collapsedKey = entityPeriodKey(source.entityId, source.time);
    const current = mutable.get(collapsedKey);
    if (current) {
      if (current.group !== source.group || current.timeIndex !== indexForTime) {
        throw new Error("One entity-period maps to changing group or time identities.");
      }
      current.xTotal += x;
      current.yTotal += y;
      current.sourcePointCount += 1;
    } else {
      mutable.set(collapsedKey, {
        entityId: source.entityId,
        group: source.group,
        time: source.time,
        timeIndex: indexForTime,
        xTotal: x,
        yTotal: y,
        sourcePointCount: 1,
      });
    }
  }
  if (seenSteps.size !== byStep.size || [...byStep.keys()].some((key) => !seenSteps.has(key))) {
    throw new Error("The source and compact jENA trajectory results must describe the same unit-conversation identities.");
  }
  return [...mutable.values()].map((period): OpenEnaLongitudinalEntityPeriod => ({
    entityId: period.entityId,
    group: period.group,
    time: period.time,
    timeIndex: period.timeIndex,
    x: period.xTotal / period.sourcePointCount,
    y: period.yTotal / period.sourcePointCount,
    sourcePointCount: period.sourcePointCount,
  }));
}

function orderedGroups(
  result: OpenEnaResult,
  config: OpenEnaConfig,
  groupByEntity: Map<string, string>,
) {
  if (!config.groupColumn) return ["All units"];
  const groups = result.groups.map((group) => group.name);
  if (groups.length === 0 || new Set(groups).size !== groups.length) {
    throw new Error("The trajectory result must expose unique comparison groups.");
  }
  const sourceGroups = new Set(groupByEntity.values());
  if (sourceGroups.size !== groups.length || groups.some((group) => !sourceGroups.has(group))) {
    throw new Error("The source entity groups do not match the successful jENA trajectory result groups.");
  }
  return groups;
}

function buildGroupSummaries(
  groupNames: string[],
  allPeriods: OpenEnaLongitudinalEntityPeriod[],
  includedPeriods: OpenEnaLongitudinalEntityPeriod[],
  groupByEntity: Map<string, string>,
  completeEntities: Set<string>,
  includedEntities: Set<string>,
  timeOrder: string[],
) {
  const groups: OpenEnaLongitudinalGroup[] = [];
  const flatPeriods: OpenEnaLongitudinalPeriod[] = [];
  for (const groupName of groupNames) {
    const groupEntities = new Set(
      [...groupByEntity].filter(([, group]) => group === groupName).map(([entity]) => entity),
    );
    const groupComplete = new Set([...completeEntities].filter((entity) => groupByEntity.get(entity) === groupName));
    const groupIncluded = new Set([...includedEntities].filter((entity) => groupByEntity.get(entity) === groupName));
    const periods: OpenEnaLongitudinalPeriod[] = [];
    const segments: OpenEnaLongitudinalSegment[] = [];
    let cumulativeDistance = 0;
    for (let timeIndex = 0; timeIndex < timeOrder.length; timeIndex += 1) {
      const time = timeOrder[timeIndex];
      const availableRows = allPeriods.filter((period) => period.group === groupName && period.time === time);
      const usedRows = includedPeriods.filter((period) => period.group === groupName && period.time === time);
      const availableEntityCount = new Set(availableRows.map((period) => period.entityId)).size;
      const includedEntityCount = new Set(usedRows.map((period) => period.entityId)).size;
      const centroid = usedRows.length
        ? {
            x: usedRows.reduce((sum, period) => sum + period.x, 0) / usedRows.length,
            y: usedRows.reduce((sum, period) => sum + period.y, 0) / usedRows.length,
          }
        : null;
      const previous = periods[timeIndex - 1];
      const usedEntityIds = new Set(usedRows.map((period) => period.entityId));
      const previousUsedEntityIds = timeIndex > 0
        ? new Set(includedPeriods
            .filter((period) => period.group === groupName && period.time === timeOrder[timeIndex - 1])
            .map((period) => period.entityId))
        : null;
      const contributorOverlapWithPrevious = previousUsedEntityIds
        ? [...usedEntityIds].filter((entityId) => previousUsedEntityIds.has(entityId)).length
        : null;
      const continuityStatus: OpenEnaLongitudinalPeriod["continuityStatus"] = timeIndex === 0
        ? "start"
        : !centroid || !previous?.centroid
          ? "missing-period"
          : contributorOverlapWithPrevious === 0
            ? "no-contributor-overlap"
            : "connected";
      const connected = continuityStatus === "connected";
      const dx = connected && centroid && previous?.centroid ? centroid.x - previous.centroid.x : null;
      const dy = connected && centroid && previous?.centroid ? centroid.y - previous.centroid.y : null;
      const stepDistance = dx !== null && dy !== null ? Math.hypot(dx, dy) : null;
      if (stepDistance !== null) cumulativeDistance += stepDistance;
      const excludedEntityCount = groupEntities.size - includedEntityCount;
      const period: OpenEnaLongitudinalPeriod = {
        group: groupName,
        time,
        timeIndex,
        nTotal: groupEntities.size,
        nUsed: includedEntityCount,
        nExcluded: excludedEntityCount,
        availableEntityCount,
        completeEntityCount: groupComplete.size,
        includedEntityCount,
        excludedEntityCount,
        contributorOverlapWithPrevious,
        continuityStatus,
        centroid,
        dx,
        dy,
        stepDistance,
        cumulativeDistance,
      };
      periods.push(period);
      flatPeriods.push(period);
      if (centroid && previous?.centroid && dx !== null && dy !== null && stepDistance !== null) {
        segments.push({
          group: groupName,
          fromTime: previous.time,
          toTime: time,
          fromTimeIndex: previous.timeIndex,
          toTimeIndex: timeIndex,
          x1: previous.centroid.x,
          y1: previous.centroid.y,
          x2: centroid.x,
          y2: centroid.y,
          dx,
          dy,
          distance: stepDistance,
          cumulativeDistance,
          contributorOverlapCount: contributorOverlapWithPrevious ?? 0,
        });
      }
    }
    groups.push({
      name: groupName,
      entityCount: groupIncluded.size,
      periods,
      segments,
      cumulativeDistance,
    });
  }
  return { groups, periodDiagnostics: flatPeriods };
}

export function buildLongitudinalGroupCentroidView(
  result: OpenEnaResult,
  config: OpenEnaConfig,
  dataset: ParsedDataset,
  settings: OpenEnaLongitudinalSettings,
  createdAt = new Date().toISOString(),
): OpenEnaLongitudinalView {
  validateInputs(result, config, dataset, settings);
  canonicalTime(createdAt, "The longitudinal view creation time");
  const bindingHash = validateHash(
    result.provenanceBinding?.datasetNormalizedUtf8TextSha256,
    "The trajectory result provenance source hash",
  );
  const settingsHash = validateHash(
    settings.datasetNormalizedUtf8TextSha256,
    "The longitudinal source hash",
  );
  if (bindingHash && !settingsHash) {
    throw new Error("The longitudinal source hash is required to verify the successful trajectory result provenance binding.");
  }
  if (bindingHash && settingsHash && bindingHash !== settingsHash) {
    throw new Error("The longitudinal source hash does not match the successful trajectory result provenance binding.");
  }
  const { rows: sourceRows } = dataset;
  const { byStep, groupByEntity, observedTimeOrder, analyticUnitTimeOrder } = sourceStepIdentities(sourceRows, config, settings);
  const modelType = result.set.modelType as OpenEnaTrajectoryModel;
  const timeOrderPolicy: OpenEnaLongitudinalView["timeOrderPolicy"] = modelType === "AccumulatedTrajectory"
    ? { locked: true, basis: "source-encounter-and-jena-step-order" }
    : { locked: false, basis: "researcher-explicit-order" };
  if (modelType === "AccumulatedTrajectory"
    && (settings.timeOrder.length !== observedTimeOrder.length
      || settings.timeOrder.some((time, index) => time !== observedTimeOrder[index]))) {
    throw new Error("Accumulated trajectory time order is locked to the source encounter and jENA step order and cannot be changed after fitting.");
  }
  if (modelType === "AccumulatedTrajectory") {
    const orderIndex = new Map(observedTimeOrder.map((time, index) => [time, index]));
    const incompatibleUnit = [...analyticUnitTimeOrder.values()].some((times) => times.some((time, index) => (
      index > 0 && (orderIndex.get(time) ?? -1) <= (orderIndex.get(times[index - 1]) ?? -1)
    )));
    if (incompatibleUnit) {
      throw new Error("Accumulated trajectory periods do not share one source encounter order across analytic units; identifiers are omitted.");
    }
  }
  const allEntityPeriods = compactEntityPeriods(result, config, settings, byStep);
  const timesByEntity = new Map<string, Set<string>>();
  for (const period of allEntityPeriods) {
    const times = timesByEntity.get(period.entityId) ?? new Set<string>();
    times.add(period.time);
    timesByEntity.set(period.entityId, times);
  }
  const allEntities = new Set(allEntityPeriods.map((period) => period.entityId));
  const completeEntities = new Set(
    [...allEntities].filter((entity) => settings.timeOrder.every((time) => timesByEntity.get(entity)?.has(time))),
  );
  if (settings.cohortPolicy === "complete" && completeEntities.size === 0) {
    throw new Error("Longitudinal analysis is unavailable: no eligible complete-cohort repeated entity is observed in every selected ordered period.");
  }
  const includedEntities = settings.cohortPolicy === "complete" ? completeEntities : allEntities;
  const includedPeriods = allEntityPeriods
    .filter((period) => includedEntities.has(period.entityId))
    .sort((left, right) => left.timeIndex - right.timeIndex || compareStrings(left.group, right.group) || compareStrings(left.entityId, right.entityId));
  const groupNames = orderedGroups(result, config, groupByEntity);
  const { groups, periodDiagnostics } = buildGroupSummaries(
    groupNames,
    allEntityPeriods,
    includedPeriods,
    groupByEntity,
    completeEntities,
    includedEntities,
    settings.timeOrder,
  );
  const geometry = buildGeometry(result);
  const nodes = geometry.nodes.map((node) => ({
    code: node.code,
    x: node.coordinates[settings.axes[0]],
    y: node.coordinates[settings.axes[1]],
  }));
  const fullCoordinates = [
    ...result.set.points.map((point, index) => ({
      x: finite(point[settings.axes[0]], `Projected point ${index + 1} ${settings.axes[0]} coordinate`),
      y: finite(point[settings.axes[1]], `Projected point ${index + 1} ${settings.axes[1]} coordinate`),
    })),
    ...nodes,
  ];
  if (!fullCoordinates.length) {
    throw new Error("The successful trajectory result has no finite projected point or node geometry.");
  }
  return {
    repeatedEntityColumn: settings.repeatedEntityColumn,
    timeColumn: settings.timeColumn,
    timeOrder: [...settings.timeOrder],
    timeOrderPolicy,
    cohortPolicy: settings.cohortPolicy,
    axes: [...settings.axes],
    availableEntityCount: allEntities.size,
    completeEntityCount: completeEntities.size,
    includedEntityCount: includedEntities.size,
    coordinateExtent: {
      minX: Math.min(...fullCoordinates.map(({ x }) => x)),
      maxX: Math.max(...fullCoordinates.map(({ x }) => x)),
      minY: Math.min(...fullCoordinates.map(({ y }) => y)),
      maxY: Math.max(...fullCoordinates.map(({ y }) => y)),
    },
    nodes,
    entityPeriods: includedPeriods,
    periodDiagnostics,
    groups,
    configuration: cloneConfig(config),
    source: {
      datasetName: dataset.name,
      source: dataset.source,
      rowCount: sourceRows.length,
      columnCount: dataset.headers.length,
      normalizedUtf8TextSha256: bindingHash ?? settingsHash,
    },
    resultProvenance: {
      analyzedAt: result.analyzedAt,
      modelType,
      sourceBindingStatus: result.provenanceBinding ? "bound" : "not-present",
      projectionReference: result.projectionReference ? cloneJson(result.projectionReference) : null,
      runtime: "jena-js",
      runtimeVersion: JENA_RUNTIME_VERSION,
    },
    geometry,
    createdAt,
    boundaries: [...LONGITUDINAL_BOUNDARIES],
  };
}

export function buildLongitudinalGroupCentroidExport(
  view: OpenEnaLongitudinalView,
  presentationOptions?: OpenEnaLongitudinalPresentationOptions,
) {
  const finiteOr = (value: number | undefined, fallback: number) => (
    typeof value === "number" && Number.isFinite(value) ? value : fallback
  );
  const presentation = presentationOptions
    ? {
        selectedAxes: [...view.axes] as [string, string],
        flipX: presentationOptions.flipX ?? false,
        flipY: presentationOptions.flipY ?? false,
        showIndividualPaths: presentationOptions.showIndividualPaths ?? true,
        showGroupCentroidPaths: presentationOptions.showGroupCentroidPaths ?? true,
        showPoints: presentationOptions.showPoints ?? true,
        showLabels: presentationOptions.showLabels ?? true,
        showVariance: presentationOptions.showVariance ?? true,
        pointScale: finiteOr(presentationOptions.pointScale, 1),
        plotZoom: finiteOr(presentationOptions.plotZoom, 1),
        statisticsCoordinateSystem: "unflipped model coordinates" as const,
        sampling: {
          strategy: "deterministic-stratified-by-group" as const,
          individualPointLimit: LONGITUDINAL_INDIVIDUAL_MARK_LIMIT,
          individualPointTotal: view.entityPeriods.length,
          individualPointShown: presentationOptions.showPoints === false
            ? 0
            : Math.min(view.entityPeriods.length, LONGITUDINAL_INDIVIDUAL_MARK_LIMIT),
          individualSegmentLimit: LONGITUDINAL_INDIVIDUAL_MARK_LIMIT,
          individualSegmentTotal: individualSegmentCount(view.entityPeriods),
          individualSegmentShown: presentationOptions.showIndividualPaths === false
            ? 0
            : Math.min(individualSegmentCount(view.entityPeriods), LONGITUDINAL_INDIVIDUAL_MARK_LIMIT),
          groupCentroidPathsComplete: true,
        },
      }
    : null;
  return {
    schemaVersion: 1 as const,
    kind: "open-ena-longitudinal-group-centroids" as const,
    app: "ENA.HK Open ENA" as const,
    runtime: "jena-js" as const,
    runtimeVersion: JENA_RUNTIME_VERSION,
    settings: {
      repeatedEntityColumn: view.repeatedEntityColumn,
      timeColumn: view.timeColumn,
      timeOrder: [...view.timeOrder],
      timeOrderPolicy: { ...view.timeOrderPolicy },
      cohortPolicy: view.cohortPolicy,
      axes: [...view.axes] as [string, string],
    },
    source: cloneJson(view.source),
    configuration: cloneConfig(view.configuration),
    resultProvenance: cloneJson(view.resultProvenance),
    geometry: cloneJson(view.geometry),
    coordinateExtent: { ...view.coordinateExtent },
    nodes: cloneJson(view.nodes),
    summary: {
      availableEntityCount: view.availableEntityCount,
      completeEntityCount: view.completeEntityCount,
      includedEntityCount: view.includedEntityCount,
      groups: view.groups.map((group) => ({
        name: group.name,
        entityCount: group.entityCount,
        cumulativeDistance: group.cumulativeDistance,
      })),
    },
    periodDiagnostics: cloneJson(view.periodDiagnostics),
    groups: cloneJson(view.groups),
    inference: null,
    privacy: {
      rawSourceRowsIncluded: false,
      repeatedEntityIdentifiersIncluded: false,
      entityPeriodCoordinatesIncluded: false,
      note: "The derived export contains group-period summaries and fitted geometry, not repeated-entity identifiers or entity-period coordinates.",
    },
    presentation,
    createdAt: view.createdAt,
    boundaries: [...view.boundaries],
  };
}

export function longitudinalPeriodRowsToCsv(view: OpenEnaLongitudinalView) {
  const timeOrderJson = JSON.stringify(view.timeOrder);
  const configurationJson = JSON.stringify(view.configuration);
  const geometryJson = JSON.stringify(view.geometry);
  const projectionReferenceJson = JSON.stringify(view.resultProvenance.projectionReference);
  const boundariesJson = JSON.stringify(view.boundaries);
  return rowsToCsv(view.periodDiagnostics.map((period) => ({
    group: period.group,
    time: period.time,
    timeIndex: period.timeIndex,
    nTotal: period.nTotal,
    nUsed: period.nUsed,
    nExcluded: period.nExcluded,
    availableEntityCount: period.availableEntityCount,
    completeEntityCount: period.completeEntityCount,
    includedEntityCount: period.includedEntityCount,
    excludedEntityCount: period.excludedEntityCount,
    contributorOverlapWithPrevious: period.contributorOverlapWithPrevious,
    continuityStatus: period.continuityStatus,
    centroidX: period.centroid?.x ?? null,
    centroidY: period.centroid?.y ?? null,
    dx: period.dx,
    dy: period.dy,
    stepDistance: period.stepDistance,
    cumulativeDistance: period.cumulativeDistance,
    repeatedEntityColumn: view.repeatedEntityColumn,
    timeColumn: view.timeColumn,
    cohortPolicy: view.cohortPolicy,
    timeOrderJson,
    timeOrderLocked: view.timeOrderPolicy.locked,
    timeOrderBasis: view.timeOrderPolicy.basis,
    xAxis: view.axes[0],
    yAxis: view.axes[1],
    sourceDatasetName: view.source.datasetName,
    sourceDatasetNormalizedUtf8TextSha256: view.source.normalizedUtf8TextSha256,
    sourceBindingStatus: view.resultProvenance.sourceBindingStatus,
    modelType: view.resultProvenance.modelType,
    runtime: view.resultProvenance.runtime,
    runtimeVersion: view.resultProvenance.runtimeVersion,
    analyzedAt: view.resultProvenance.analyzedAt,
    createdAt: view.createdAt,
    configurationJson,
    geometryJson,
    projectionReferenceJson,
    boundariesJson,
  })));
}
