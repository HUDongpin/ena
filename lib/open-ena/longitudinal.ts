import type { Row } from "jena-js";
import { rowsToCsv } from "./export";
import {
  assertOpenEnaInferenceBindingV2,
  assertOpenEnaInferenceCoordinatorConsumerV2,
  assertOpenEnaInferenceCurrentContextV2,
  flattenOpenEnaInferenceRows,
} from "./inference-consumers";
import type { OpenEnaInferenceResultV2 } from "./inference-v2";
import {
  JENA_RUNTIME_VERSION,
  datasetHashKindFor,
  sameOpenEnaConfig,
  type DatasetHashKind,
  type OpenEnaConfig,
  type OpenEnaProjectionReference,
  type OpenEnaResult,
  type ParsedDataset,
} from "./types";

export type OpenEnaLongitudinalCohortPolicy = "available" | "complete";
export type OpenEnaTrajectoryModel = "SeparateTrajectory" | "AccumulatedTrajectory";

export interface OpenEnaLongitudinalSettingsV2 {
  /** Ordered composite identity fields. Order is part of the identity contract. */
  repeatedEntityColumns: string[];
  /** Inference remains unavailable until the researcher confirms the identity fields. */
  identityConfirmed: boolean;
  timeColumn: string;
  /** Explicit period order; it is never inferred by a lexical sort. */
  timeOrder: string[];
  cohortPolicy: OpenEnaLongitudinalCohortPolicy;
  axes: [string, string];
  datasetNormalizedUtf8TextSha256?: string | null;
}

/** Deliberate v1 Plot-only compatibility input. Migration always clears identity confirmation. */
export interface OpenEnaLongitudinalSettingsV1 {
  repeatedEntityColumn: string;
  timeColumn: string;
  /** Explicit period order; it is never inferred by a lexical sort. */
  timeOrder: string[];
  cohortPolicy: OpenEnaLongitudinalCohortPolicy;
  axes: [string, string];
  datasetNormalizedUtf8TextSha256?: string | null;
}

export type OpenEnaLongitudinalSettings = OpenEnaLongitudinalSettingsV2 | OpenEnaLongitudinalSettingsV1;

interface NormalizedOpenEnaLongitudinalSettings extends OpenEnaLongitudinalSettingsV2 {
  migratedFromV1: boolean;
}

export interface OpenEnaLongitudinalEntityPeriod {
  /** Opaque, derivation-local entity token. It is never exported or rendered. */
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
  repeatedEntityColumns: string[];
  identityConfirmed: boolean;
  /** @deprecated Schema-v1 descriptive export compatibility; use repeatedEntityColumns. */
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
    hashKind?: DatasetHashKind;
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

export type OpenEnaLongitudinalIntegrityCode =
  | "identity-not-confirmed"
  | "identity-columns-invalid"
  | "identity-component-empty"
  | "time-column-invalid"
  | "axes-invalid"
  | "binding-mismatch"
  | "identity-collision"
  | "group-instability"
  | "entity-period-instability"
  | "nonfinite-coordinate"
  | "group-required"
  | "group-invalid"
  | "groups-must-differ"
  | "period-invalid"
  | "periods-must-differ"
  | "at-least-three-periods-required";

const LONGITUDINAL_INTEGRITY_MESSAGES: Record<OpenEnaLongitudinalIntegrityCode, string> = {
  "identity-not-confirmed": "Repeated-entity identity must be confirmed before comparison-frame slicing.",
  "identity-columns-invalid": "Repeated-entity identity columns must be nonempty, unique configured unit columns present in the dataset and cannot consist only of the comparison group.",
  "identity-component-empty": "Repeated-entity identity contains an empty component.",
  "time-column-invalid": "The time mapping must be one configured conversation column present in the dataset.",
  "axes-invalid": "The selected axes are invalid for the successful result.",
  "binding-mismatch": "Longitudinal inputs or configuration do not match the successful result binding.",
  "identity-collision": "Repeated-entity identity maps across incompatible groups.",
  "group-instability": "Repeated entity has an unstable group mapping.",
  "entity-period-instability": "The compact trajectory has an unstable entity-period mapping.",
  "nonfinite-coordinate": "Required coordinate or geometry value is not finite.",
  "group-required": "One configured comparison group must be selected.",
  "group-invalid": "The selected comparison group is invalid for this frame.",
  "groups-must-differ": "Independent comparison groups must be distinct.",
  "period-invalid": "Selected period is invalid for this frame.",
  "periods-must-differ": "Selected periods must be distinct.",
  "at-least-three-periods-required": "Repeated comparison requires at least three ordered periods.",
};

export class OpenEnaLongitudinalIntegrityError extends Error {
  readonly code: OpenEnaLongitudinalIntegrityCode;

  constructor(code: OpenEnaLongitudinalIntegrityCode) {
    super(LONGITUDINAL_INTEGRITY_MESSAGES[code]);
    this.name = "OpenEnaLongitudinalIntegrityError";
    this.code = code;
  }
}

export interface OpenEnaLongitudinalComparisonFrameBinding {
  analyzedAt: string;
  datasetNormalizedUtf8TextSha256: string | null;
  datasetHashKind?: DatasetHashKind;
  modelType: OpenEnaTrajectoryModel;
  configuration: OpenEnaConfig;
  axes: [string, string];
}

export interface OpenEnaLongitudinalComparisonGroup {
  role: "configured-group" | "all-units";
  index: number;
  name: string;
}

export interface OpenEnaLongitudinalComparisonPoint {
  entityToken: string;
  group: OpenEnaLongitudinalComparisonGroup;
  time: string;
  timeIndex: number;
  x: number;
  y: number;
  sourcePointCount: number;
}

export interface OpenEnaLongitudinalComparisonFrame {
  kind: "open-ena-longitudinal-comparison-frame";
  coordinateSystem: "unflipped-model-coordinates";
  binding: OpenEnaLongitudinalComparisonFrameBinding;
  repeatedEntityColumns: string[];
  identityConfirmed: boolean;
  eligibility: {
    eligible: boolean;
    reason: "identity-not-confirmed" | null;
  };
  timeColumn: string;
  timeOrder: string[];
  axes: [string, string];
  groups: OpenEnaLongitudinalComparisonGroup[];
  points: OpenEnaLongitudinalComparisonPoint[];
}

export interface OpenEnaLongitudinalIndependentLedger {
  candidateEntityCount: number;
  primaryAvailableCount: number;
  secondaryAvailableCount: number;
  includedEntityCount: number;
}

export interface OpenEnaLongitudinalIndependentSlice {
  kind: "trajectory-independent-period";
  period: string;
  rows: Array<OpenEnaLongitudinalComparisonPoint & { groupRole: "primary" | "secondary" }>;
  ledger: OpenEnaLongitudinalIndependentLedger;
}

export interface OpenEnaLongitudinalPairedLedger {
  candidateEntityCount: number;
  earlierAvailableCount: number;
  laterAvailableCount: number;
  matchedEntityCount: number;
  earlierOnlyCount: number;
  laterOnlyCount: number;
  zeroDifferenceCountByAxis: { x: number; y: number };
}

export interface OpenEnaLongitudinalPairedPoint {
  time: string;
  timeIndex: number;
  x: number;
  y: number;
  sourcePointCount: number;
}

export interface OpenEnaLongitudinalPairedSlice {
  kind: "trajectory-paired-periods";
  earlierPeriod: string;
  laterPeriod: string;
  pairs: Array<{
    entityToken: string;
    earlier: OpenEnaLongitudinalPairedPoint;
    later: OpenEnaLongitudinalPairedPoint;
  }>;
  ledger: OpenEnaLongitudinalPairedLedger;
}

export interface OpenEnaLongitudinalRepeatedLedger {
  candidateEntityCount: number;
  availableByPeriod: Array<{
    period: string;
    periodIndex: number;
    availableEntityCount: number;
  }>;
  completeBlockCount: number;
  missingAnySelectedPeriodCount: number;
}

export interface OpenEnaLongitudinalRepeatedSlice {
  kind: "trajectory-repeated-periods";
  periods: string[];
  blocks: Array<{
    entityToken: string;
    periods: OpenEnaLongitudinalPairedPoint[];
  }>;
  ledger: OpenEnaLongitudinalRepeatedLedger;
}

export interface OpenEnaLongitudinalDerivation {
  view: OpenEnaLongitudinalView;
  comparisonFrame: OpenEnaLongitudinalComparisonFrame;
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
  "Raw source rows and row-level co-occurrence records are excluded from longitudinal exports; preserve the exact source coded-data file and codebook beside the analyzed-table hash, hashKind, and derived result.",
] as const;

export const LONGITUDINAL_INDIVIDUAL_MARK_LIMIT = 2_000;

export function inferLongitudinalMappingDefaults(config: OpenEnaConfig) {
  const repeatedEntityColumn = config.unitColumns.find((column) => column !== config.groupColumn) ?? "";
  const unitColumns = new Set(config.unitColumns);
  const timeColumn = config.conversationColumns.find((column) => (
    column !== config.groupColumn
    && column !== repeatedEntityColumn
    && !unitColumns.has(column)
  )) ?? config.conversationColumns.find((column) => (
    column !== config.groupColumn && column !== repeatedEntityColumn
  )) ?? "";
  return { repeatedEntityColumn, timeColumn };
}

interface SourceStepIdentity {
  entityToken: string;
  identityComponents: string[];
  time: string;
  group: string;
}

interface MutableEntityPeriod {
  entityToken: string;
  group: string;
  time: string;
  timeIndex: number;
  xValues: number[];
  yValues: number[];
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

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function normalized(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

function normalizedIdentityComponent(value: unknown) {
  return normalized(value).normalize("NFC");
}

function mergedJenaValue(row: Row, columns: readonly string[]) {
  return columns.map((column) => normalized(row[column])).join("::");
}

function canonicalColumns(row: Row, columns: readonly string[]) {
  return JSON.stringify(columns.map((column) => [column, normalized(row[column])]));
}

function normalizeSettings(settings: OpenEnaLongitudinalSettings): NormalizedOpenEnaLongitudinalSettings {
  if ("repeatedEntityColumns" in settings) {
    return {
      repeatedEntityColumns: Array.isArray(settings.repeatedEntityColumns)
        ? [...settings.repeatedEntityColumns]
        : [],
      identityConfirmed: settings.identityConfirmed === true,
      timeColumn: settings.timeColumn,
      timeOrder: [...settings.timeOrder],
      cohortPolicy: settings.cohortPolicy,
      axes: [...settings.axes],
      datasetNormalizedUtf8TextSha256: settings.datasetNormalizedUtf8TextSha256,
      migratedFromV1: false,
    };
  }
  return {
    repeatedEntityColumns: [settings.repeatedEntityColumn],
    identityConfirmed: false,
    timeColumn: settings.timeColumn,
    timeOrder: [...settings.timeOrder],
    cohortPolicy: settings.cohortPolicy,
    axes: [...settings.axes],
    datasetNormalizedUtf8TextSha256: settings.datasetNormalizedUtf8TextSha256,
    migratedFromV1: true,
  };
}

function deterministicMean(values: readonly number[]) {
  if (values.length === 0) return Number.NaN;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered.reduce((sum, value) => sum + value, 0) / ordered.length;
}

function exactStepKey(row: Row, config: OpenEnaConfig) {
  return canonicalColumns(row, [...config.unitColumns, ...config.conversationColumns]);
}

function entityPeriodKey(entityToken: string, time: string) {
  return JSON.stringify([entityToken, time]);
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

function finite(value: unknown, _label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new OpenEnaLongitudinalIntegrityError("nonfinite-coordinate");
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
  settings: NormalizedOpenEnaLongitudinalSettings,
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
    throw new OpenEnaLongitudinalIntegrityError("binding-mismatch");
  }
  if (result.provenanceBinding && !sameOpenEnaConfig(result.provenanceBinding.configuration, config)) {
    throw new OpenEnaLongitudinalIntegrityError("binding-mismatch");
  }
  if (result.provenanceBinding?.datasetHashKind
    && result.provenanceBinding.datasetHashKind !== datasetHashKindFor(dataset)) {
    throw new OpenEnaLongitudinalIntegrityError("binding-mismatch");
  }
  if (!Array.isArray(settings.repeatedEntityColumns)
    || settings.repeatedEntityColumns.length === 0
    || settings.repeatedEntityColumns.some((column) => typeof column !== "string" || column.length === 0)
    || new Set(settings.repeatedEntityColumns).size !== settings.repeatedEntityColumns.length
    || settings.repeatedEntityColumns.some((column) => !config.unitColumns.includes(column))
    || settings.repeatedEntityColumns.some((column) => !dataset.headers.includes(column))) {
    throw new OpenEnaLongitudinalIntegrityError("identity-columns-invalid");
  }
  if (config.groupColumn
    && settings.repeatedEntityColumns.length === 1
    && settings.repeatedEntityColumns[0] === config.groupColumn) {
    throw new OpenEnaLongitudinalIntegrityError("identity-columns-invalid");
  }
  if (!settings.timeColumn || !config.conversationColumns.includes(settings.timeColumn)) {
    throw new OpenEnaLongitudinalIntegrityError("time-column-invalid");
  }
  if (config.groupColumn && settings.timeColumn === config.groupColumn) {
    throw new OpenEnaLongitudinalIntegrityError("time-column-invalid");
  }
  if (settings.repeatedEntityColumns.includes(settings.timeColumn)) {
    throw new OpenEnaLongitudinalIntegrityError("time-column-invalid");
  }
  if (!dataset.headers.includes(settings.timeColumn)) {
    throw new OpenEnaLongitudinalIntegrityError("time-column-invalid");
  }
  if (config.groupColumn && !dataset.headers.includes(config.groupColumn)) {
    throw new Error("The source dataset is missing the configured comparison-group column.");
  }
  const axes = settings.axes;
  if (!Array.isArray(axes) || axes.length !== 2 || axes[0] === axes[1]
    || axes.some((axis) => !result.dimensions.includes(axis))) {
    throw new OpenEnaLongitudinalIntegrityError("axes-invalid");
  }
  if (!Array.isArray(settings.timeOrder) || settings.timeOrder.length < 1
    || settings.timeOrder.some((time) => typeof time !== "string" || time.length === 0)
    || new Set(settings.timeOrder).size !== settings.timeOrder.length) {
    throw new Error("The explicit time order must contain at least one unique, nonempty period.");
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
  settings: NormalizedOpenEnaLongitudinalSettings,
) {
  const byStep = new Map<string, SourceStepIdentity>();
  const groupByEntity = new Map<string, string>();
  const tokenByCanonicalIdentity = new Map<string, string>();
  const observedTimes = new Set<string>();
  const observedTimeOrder: string[] = [];
  const analyticUnitTimeOrder = new Map<string, string[]>();
  for (const [index, row] of sourceRows.entries()) {
    const group = config.groupColumn ? normalized(row[config.groupColumn]) : "All units";
    if (!group.trim()) throw new OpenEnaLongitudinalIntegrityError("group-instability");
    const identityComponents = settings.repeatedEntityColumns.map((column) => normalizedIdentityComponent(row[column]));
    if (identityComponents.some((component) => component.trim().length === 0)) {
      throw new OpenEnaLongitudinalIntegrityError("identity-component-empty");
    }
    const identityPairs = settings.repeatedEntityColumns.map((column, columnIndex) => (
      [column, identityComponents[columnIndex]]
    ));
    if (config.groupColumn
      && config.unitColumns.includes(config.groupColumn)
      && !settings.repeatedEntityColumns.includes(config.groupColumn)) {
      identityPairs.unshift([config.groupColumn, normalizedIdentityComponent(group)]);
    }
    const canonicalIdentity = JSON.stringify(
      identityPairs,
    );
    let entityToken = tokenByCanonicalIdentity.get(canonicalIdentity);
    if (!entityToken) {
      entityToken = `entity-${String(tokenByCanonicalIdentity.size + 1).padStart(6, "0")}`;
      tokenByCanonicalIdentity.set(canonicalIdentity, entityToken);
    }
    const time = normalized(row[settings.timeColumn]);
    if (!time.trim()) throw new OpenEnaLongitudinalIntegrityError("time-column-invalid");
    if (!observedTimes.has(time)) observedTimeOrder.push(time);
    observedTimes.add(time);
    const priorGroup = groupByEntity.get(entityToken);
    if (priorGroup !== undefined && priorGroup !== group) {
      throw new OpenEnaLongitudinalIntegrityError("identity-collision");
    }
    groupByEntity.set(entityToken, group);

    const key = exactStepKey(row, config);
    const prior = byStep.get(key);
    if (prior && (prior.entityToken !== entityToken || prior.time !== time || prior.group !== group)) {
      throw new OpenEnaLongitudinalIntegrityError("entity-period-instability");
    }
    if (!prior) {
      const analyticUnit = canonicalColumns(row, config.unitColumns);
      const unitTimes = analyticUnitTimeOrder.get(analyticUnit) ?? [];
      unitTimes.push(time);
      analyticUnitTimeOrder.set(analyticUnit, unitTimes);
    }
    byStep.set(key, { entityToken, identityComponents: [...identityComponents], time, group });
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
  settings: NormalizedOpenEnaLongitudinalSettings,
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
      throw new OpenEnaLongitudinalIntegrityError("entity-period-instability");
    }
    seenSteps.add(key);
    const source = byStep.get(key);
    if (!source) {
      throw new OpenEnaLongitudinalIntegrityError("entity-period-instability");
    }
    const trajectoryUnit = normalized(trajectory.ENA_UNIT);
    const expectedUnit = mergedJenaValue(trajectory, config.unitColumns);
    if (!trajectoryUnit
      || trajectoryUnit !== expectedUnit
      || normalized(point.ENA_UNIT) !== expectedUnit) {
      throw new OpenEnaLongitudinalIntegrityError("entity-period-instability");
    }
    const trajectoryIdentityComponents = settings.repeatedEntityColumns.map((column) => (
      normalizedIdentityComponent(trajectory[column])
    ));
    if (!sameOrderedValues(trajectoryIdentityComponents, source.identityComponents)
      || normalized(trajectory[settings.timeColumn]) !== source.time) {
      throw new OpenEnaLongitudinalIntegrityError("entity-period-instability");
    }
    if (config.groupColumn) {
      const trajectoryGroup = normalized(trajectory[config.groupColumn]);
      const pointGroup = normalized(point[config.groupColumn]);
      if (trajectoryGroup !== source.group || pointGroup !== source.group) {
        throw new OpenEnaLongitudinalIntegrityError("group-instability");
      }
    }
    const indexForTime = timeIndex.get(source.time);
    if (indexForTime === undefined) {
      throw new OpenEnaLongitudinalIntegrityError("entity-period-instability");
    }
    for (const dimension of result.dimensions) {
      finite(point[dimension], `Projected point ${index + 1} ${dimension} coordinate`);
    }
    const x = finite(point[settings.axes[0]], `Projected point ${index + 1} ${settings.axes[0]} coordinate`);
    const y = finite(point[settings.axes[1]], `Projected point ${index + 1} ${settings.axes[1]} coordinate`);
    const collapsedKey = entityPeriodKey(source.entityToken, source.time);
    const current = mutable.get(collapsedKey);
    if (current) {
      if (current.group !== source.group || current.timeIndex !== indexForTime) {
        throw new OpenEnaLongitudinalIntegrityError("entity-period-instability");
      }
      current.xValues.push(x);
      current.yValues.push(y);
    } else {
      mutable.set(collapsedKey, {
        entityToken: source.entityToken,
        group: source.group,
        time: source.time,
        timeIndex: indexForTime,
        xValues: [x],
        yValues: [y],
      });
    }
  }
  if (seenSteps.size !== byStep.size || [...byStep.keys()].some((key) => !seenSteps.has(key))) {
    throw new OpenEnaLongitudinalIntegrityError("entity-period-instability");
  }
  return [...mutable.values()].map((period): OpenEnaLongitudinalEntityPeriod => ({
    entityId: period.entityToken,
    group: period.group,
    time: period.time,
    timeIndex: period.timeIndex,
    x: deterministicMean(period.xValues),
    y: deterministicMean(period.yValues),
    sourcePointCount: period.xValues.length,
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
            x: deterministicMean(usedRows.map((period) => period.x)),
            y: deterministicMean(usedRows.map((period) => period.y)),
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

function buildComparisonFrame(
  result: OpenEnaResult,
  config: OpenEnaConfig,
  dataset: ParsedDataset,
  settings: NormalizedOpenEnaLongitudinalSettings,
  allEntityPeriods: readonly OpenEnaLongitudinalEntityPeriod[],
  groupNames: readonly string[],
  datasetNormalizedUtf8TextSha256: string | null,
): OpenEnaLongitudinalComparisonFrame {
  const stableGroupNames = [...groupNames].sort(compareStrings);
  const groups = stableGroupNames.map((name, index): OpenEnaLongitudinalComparisonGroup => ({
    role: config.groupColumn ? "configured-group" : "all-units",
    index,
    name,
  }));
  const groupByName = new Map(groups.map((group) => [group.name, group]));
  const points = allEntityPeriods
    .map((period): OpenEnaLongitudinalComparisonPoint => {
      const group = groupByName.get(period.group);
      if (!group) throw new OpenEnaLongitudinalIntegrityError("group-instability");
      return {
        entityToken: period.entityId,
        group: { ...group },
        time: period.time,
        timeIndex: period.timeIndex,
        x: finite(period.x, "Comparison-frame x coordinate"),
        y: finite(period.y, "Comparison-frame y coordinate"),
        sourcePointCount: period.sourcePointCount,
      };
    })
    .sort((left, right) => (
      left.timeIndex - right.timeIndex
      || left.group.index - right.group.index
      || compareStrings(left.entityToken, right.entityToken)
    ));
  return deepFreeze({
    kind: "open-ena-longitudinal-comparison-frame",
    coordinateSystem: "unflipped-model-coordinates",
    binding: {
      analyzedAt: result.analyzedAt,
      datasetNormalizedUtf8TextSha256,
      datasetHashKind: datasetHashKindFor(dataset),
      modelType: result.set.modelType as OpenEnaTrajectoryModel,
      configuration: cloneConfig(config),
      axes: [...settings.axes] as [string, string],
    },
    repeatedEntityColumns: [...settings.repeatedEntityColumns],
    identityConfirmed: settings.identityConfirmed,
    eligibility: settings.identityConfirmed
      ? { eligible: true, reason: null }
      : { eligible: false, reason: "identity-not-confirmed" },
    timeColumn: settings.timeColumn,
    timeOrder: [...settings.timeOrder],
    axes: [...settings.axes] as [string, string],
    groups,
    points,
  });
}

export function buildLongitudinalDerivation(
  result: OpenEnaResult,
  config: OpenEnaConfig,
  dataset: ParsedDataset,
  settings: OpenEnaLongitudinalSettings,
  createdAt = new Date().toISOString(),
): OpenEnaLongitudinalDerivation {
  const resolvedSettings = normalizeSettings(settings);
  validateInputs(result, config, dataset, resolvedSettings);
  canonicalTime(createdAt, "The longitudinal view creation time");
  const bindingHash = validateHash(
    result.provenanceBinding?.datasetNormalizedUtf8TextSha256,
    "The trajectory result provenance analyzed-table hash",
  );
  const settingsHash = validateHash(
    resolvedSettings.datasetNormalizedUtf8TextSha256,
    "The longitudinal analyzed-table hash",
  );
  if (bindingHash && !settingsHash) {
    throw new OpenEnaLongitudinalIntegrityError("binding-mismatch");
  }
  if (bindingHash && settingsHash && bindingHash !== settingsHash) {
    throw new OpenEnaLongitudinalIntegrityError("binding-mismatch");
  }
  const { rows: sourceRows } = dataset;
  const { byStep, groupByEntity, observedTimeOrder, analyticUnitTimeOrder } = sourceStepIdentities(
    sourceRows,
    config,
    resolvedSettings,
  );
  const modelType = result.set.modelType as OpenEnaTrajectoryModel;
  const timeOrderPolicy: OpenEnaLongitudinalView["timeOrderPolicy"] = modelType === "AccumulatedTrajectory"
    ? { locked: true, basis: "source-encounter-and-jena-step-order" }
    : { locked: false, basis: "researcher-explicit-order" };
  if (modelType === "AccumulatedTrajectory"
    && (resolvedSettings.timeOrder.length !== observedTimeOrder.length
      || resolvedSettings.timeOrder.some((time, index) => time !== observedTimeOrder[index]))) {
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
  const allEntityPeriods = compactEntityPeriods(result, config, resolvedSettings, byStep);
  const groupNames = orderedGroups(result, config, groupByEntity);
  const comparisonFrame = buildComparisonFrame(
    result,
    config,
    dataset,
    resolvedSettings,
    allEntityPeriods,
    groupNames,
    bindingHash ?? settingsHash,
  );
  const timesByEntity = new Map<string, Set<string>>();
  for (const period of allEntityPeriods) {
    const times = timesByEntity.get(period.entityId) ?? new Set<string>();
    times.add(period.time);
    timesByEntity.set(period.entityId, times);
  }
  const allEntities = new Set(allEntityPeriods.map((period) => period.entityId));
  const completeEntities = new Set(
    [...allEntities].filter((entity) => resolvedSettings.timeOrder.every((time) => timesByEntity.get(entity)?.has(time))),
  );
  const includedEntities = resolvedSettings.cohortPolicy === "complete" ? completeEntities : allEntities;
  const includedPeriods = allEntityPeriods
    .filter((period) => includedEntities.has(period.entityId))
    .sort((left, right) => left.timeIndex - right.timeIndex || compareStrings(left.group, right.group) || compareStrings(left.entityId, right.entityId));
  const { groups, periodDiagnostics } = buildGroupSummaries(
    groupNames,
    allEntityPeriods,
    includedPeriods,
    groupByEntity,
    completeEntities,
    includedEntities,
    resolvedSettings.timeOrder,
  );
  const geometry = buildGeometry(result);
  const nodes = geometry.nodes.map((node) => ({
    code: node.code,
    x: node.coordinates[resolvedSettings.axes[0]],
    y: node.coordinates[resolvedSettings.axes[1]],
  }));
  const fullCoordinates = [
    ...result.set.points.map((point, index) => ({
      x: finite(point[resolvedSettings.axes[0]], `Projected point ${index + 1} ${resolvedSettings.axes[0]} coordinate`),
      y: finite(point[resolvedSettings.axes[1]], `Projected point ${index + 1} ${resolvedSettings.axes[1]} coordinate`),
    })),
    ...nodes,
  ];
  if (!fullCoordinates.length) {
    throw new Error("The successful trajectory result has no finite projected point or node geometry.");
  }
  const view: OpenEnaLongitudinalView = {
    repeatedEntityColumns: [...resolvedSettings.repeatedEntityColumns],
    identityConfirmed: resolvedSettings.identityConfirmed,
    repeatedEntityColumn: resolvedSettings.repeatedEntityColumns[0],
    timeColumn: resolvedSettings.timeColumn,
    timeOrder: [...resolvedSettings.timeOrder],
    timeOrderPolicy,
    cohortPolicy: resolvedSettings.cohortPolicy,
    axes: [...resolvedSettings.axes],
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
      hashKind: dataset.hashKind,
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
  return { view, comparisonFrame };
}

export function buildLongitudinalGroupCentroidView(
  result: OpenEnaResult,
  config: OpenEnaConfig,
  dataset: ParsedDataset,
  settings: OpenEnaLongitudinalSettings,
  createdAt = new Date().toISOString(),
): OpenEnaLongitudinalView {
  const resolvedSettings = normalizeSettings(settings);
  if (resolvedSettings.timeOrder.length < 2) {
    throw new OpenEnaLongitudinalIntegrityError("period-invalid");
  }
  return buildLongitudinalDerivation(result, config, dataset, settings, createdAt).view;
}

function assertComparisonFrame(frame: OpenEnaLongitudinalComparisonFrame) {
  if (frame.kind !== "open-ena-longitudinal-comparison-frame"
    || frame.coordinateSystem !== "unflipped-model-coordinates"
    || !sameOrderedValues(frame.axes, frame.binding.axes)
    || !frame.binding.configuration.conversationColumns.includes(frame.timeColumn)
    || frame.repeatedEntityColumns.some((column) => !frame.binding.configuration.unitColumns.includes(column))) {
    throw new OpenEnaLongitudinalIntegrityError("binding-mismatch");
  }
  if (!frame.identityConfirmed || !frame.eligibility.eligible) {
    throw new OpenEnaLongitudinalIntegrityError("identity-not-confirmed");
  }
  const groupNames = new Set(frame.groups.map((group) => group.name));
  const timeIndex = new Map(frame.timeOrder.map((time, index) => [time, index]));
  for (const point of frame.points) {
    finite(point.x, "Comparison-frame x coordinate");
    finite(point.y, "Comparison-frame y coordinate");
    if (!groupNames.has(point.group.name)
      || point.group.index !== frame.groups.find((group) => group.name === point.group.name)?.index) {
      throw new OpenEnaLongitudinalIntegrityError("group-instability");
    }
    if (timeIndex.get(point.time) !== point.timeIndex) {
      throw new OpenEnaLongitudinalIntegrityError("entity-period-instability");
    }
  }
}

function comparisonPeriodIndex(frame: OpenEnaLongitudinalComparisonFrame, period: string) {
  const index = frame.timeOrder.indexOf(period);
  if (index < 0) throw new OpenEnaLongitudinalIntegrityError("period-invalid");
  return index;
}

function comparisonGroupName(frame: OpenEnaLongitudinalComparisonFrame, group: string | null) {
  const grouped = Boolean(frame.binding.configuration.groupColumn);
  if (!grouped) {
    if (group !== null && group !== "All units") {
      throw new OpenEnaLongitudinalIntegrityError("group-invalid");
    }
    return "All units";
  }
  if (group === null) throw new OpenEnaLongitudinalIntegrityError("group-required");
  if (!frame.groups.some((candidate) => candidate.name === group)) {
    throw new OpenEnaLongitudinalIntegrityError("group-invalid");
  }
  return group;
}

function uniquePointsByToken(points: readonly OpenEnaLongitudinalComparisonPoint[]) {
  const byToken = new Map<string, OpenEnaLongitudinalComparisonPoint>();
  for (const point of points) {
    if (byToken.has(point.entityToken)) {
      throw new OpenEnaLongitudinalIntegrityError("entity-period-instability");
    }
    byToken.set(point.entityToken, point);
  }
  return byToken;
}

function compareComparisonPoints(
  left: OpenEnaLongitudinalComparisonPoint,
  right: OpenEnaLongitudinalComparisonPoint,
) {
  return left.timeIndex - right.timeIndex
    || left.group.index - right.group.index
    || left.x - right.x
    || left.y - right.y
    || compareStrings(left.entityToken, right.entityToken);
}

export function sliceLongitudinalIndependentPeriod(
  frame: OpenEnaLongitudinalComparisonFrame,
  request: {
    period: string;
    primaryGroup: string;
    secondaryGroup: string;
  },
): OpenEnaLongitudinalIndependentSlice {
  assertComparisonFrame(frame);
  const periodIndex = comparisonPeriodIndex(frame, request.period);
  if (request.primaryGroup === request.secondaryGroup) {
    throw new OpenEnaLongitudinalIntegrityError("groups-must-differ");
  }
  const primaryGroup = comparisonGroupName(frame, request.primaryGroup);
  const secondaryGroup = comparisonGroupName(frame, request.secondaryGroup);
  const primary = [...uniquePointsByToken(frame.points.filter((point) => (
    point.timeIndex === periodIndex && point.group.name === primaryGroup
  ))).values()];
  const secondary = [...uniquePointsByToken(frame.points.filter((point) => (
    point.timeIndex === periodIndex && point.group.name === secondaryGroup
  ))).values()];
  const primaryTokens = new Set(primary.map((point) => point.entityToken));
  if (secondary.some((point) => primaryTokens.has(point.entityToken))) {
    throw new OpenEnaLongitudinalIntegrityError("identity-collision");
  }
  const candidates = new Set(frame.points
    .filter((point) => point.group.name === primaryGroup || point.group.name === secondaryGroup)
    .map((point) => point.entityToken));
  const rows = [
    ...primary.map((point) => ({ ...point, group: { ...point.group }, groupRole: "primary" as const })),
    ...secondary.map((point) => ({ ...point, group: { ...point.group }, groupRole: "secondary" as const })),
  ].sort((left, right) => (
    compareStrings(left.groupRole, right.groupRole) || compareComparisonPoints(left, right)
  ));
  return deepFreeze({
    kind: "trajectory-independent-period",
    period: request.period,
    rows,
    ledger: {
      candidateEntityCount: candidates.size,
      primaryAvailableCount: primary.length,
      secondaryAvailableCount: secondary.length,
      includedEntityCount: rows.length,
    },
  });
}

function asPairedPoint(point: OpenEnaLongitudinalComparisonPoint): OpenEnaLongitudinalPairedPoint {
  return {
    time: point.time,
    timeIndex: point.timeIndex,
    x: point.x,
    y: point.y,
    sourcePointCount: point.sourcePointCount,
  };
}

export function sliceLongitudinalPairedPeriods(
  frame: OpenEnaLongitudinalComparisonFrame,
  request: {
    group: string | null;
    earlierPeriod: string;
    laterPeriod: string;
  },
): OpenEnaLongitudinalPairedSlice {
  assertComparisonFrame(frame);
  if (request.earlierPeriod === request.laterPeriod) {
    throw new OpenEnaLongitudinalIntegrityError("periods-must-differ");
  }
  const earlierIndex = comparisonPeriodIndex(frame, request.earlierPeriod);
  const laterIndex = comparisonPeriodIndex(frame, request.laterPeriod);
  const group = comparisonGroupName(frame, request.group);
  const groupPoints = frame.points.filter((point) => point.group.name === group);
  const candidates = new Set(groupPoints.map((point) => point.entityToken));
  const earlier = uniquePointsByToken(groupPoints.filter((point) => point.timeIndex === earlierIndex));
  const later = uniquePointsByToken(groupPoints.filter((point) => point.timeIndex === laterIndex));
  const matchedTokens = [...earlier.keys()]
    .filter((token) => later.has(token))
    .sort((leftToken, rightToken) => {
      const leftEarlier = earlier.get(leftToken)!;
      const rightEarlier = earlier.get(rightToken)!;
      const pointOrder = compareComparisonPoints(leftEarlier, rightEarlier);
      if (pointOrder !== 0) return pointOrder;
      return compareComparisonPoints(later.get(leftToken)!, later.get(rightToken)!);
    });
  const pairs = matchedTokens.map((entityToken) => ({
    entityToken,
    earlier: asPairedPoint(earlier.get(entityToken)!),
    later: asPairedPoint(later.get(entityToken)!),
  }));
  const zeroDifferenceCountByAxis = {
    x: pairs.filter((pair) => pair.later.x - pair.earlier.x === 0).length,
    y: pairs.filter((pair) => pair.later.y - pair.earlier.y === 0).length,
  };
  return deepFreeze({
    kind: "trajectory-paired-periods",
    earlierPeriod: request.earlierPeriod,
    laterPeriod: request.laterPeriod,
    pairs,
    ledger: {
      candidateEntityCount: candidates.size,
      earlierAvailableCount: earlier.size,
      laterAvailableCount: later.size,
      matchedEntityCount: pairs.length,
      earlierOnlyCount: [...earlier.keys()].filter((token) => !later.has(token)).length,
      laterOnlyCount: [...later.keys()].filter((token) => !earlier.has(token)).length,
      zeroDifferenceCountByAxis,
    },
  });
}

export function sliceLongitudinalRepeatedPeriods(
  frame: OpenEnaLongitudinalComparisonFrame,
  request: {
    group: string | null;
    periods: readonly string[];
  },
): OpenEnaLongitudinalRepeatedSlice {
  assertComparisonFrame(frame);
  if (request.periods.length < 3) {
    throw new OpenEnaLongitudinalIntegrityError("at-least-three-periods-required");
  }
  if (new Set(request.periods).size !== request.periods.length) {
    throw new OpenEnaLongitudinalIntegrityError("periods-must-differ");
  }
  const periodIndexes = request.periods.map((period) => comparisonPeriodIndex(frame, period));
  if (periodIndexes.some((periodIndex, index) => index > 0 && periodIndex <= periodIndexes[index - 1])) {
    throw new OpenEnaLongitudinalIntegrityError("period-invalid");
  }
  const group = comparisonGroupName(frame, request.group);
  const groupPoints = frame.points.filter((point) => point.group.name === group);
  const candidates = new Set(groupPoints.map((point) => point.entityToken));
  const byPeriod = periodIndexes.map((periodIndex) => uniquePointsByToken(
    groupPoints.filter((point) => point.timeIndex === periodIndex),
  ));
  const completeTokens = [...candidates]
    .filter((token) => byPeriod.every((points) => points.has(token)))
    .sort((leftToken, rightToken) => {
      for (const points of byPeriod) {
        const pointOrder = compareComparisonPoints(points.get(leftToken)!, points.get(rightToken)!);
        if (pointOrder !== 0) return pointOrder;
      }
      return compareStrings(leftToken, rightToken);
    });
  const blocks = completeTokens.map((entityToken) => ({
    entityToken,
    periods: byPeriod.map((points) => asPairedPoint(points.get(entityToken)!)),
  }));
  return deepFreeze({
    kind: "trajectory-repeated-periods",
    periods: [...request.periods],
    blocks,
    ledger: {
      candidateEntityCount: candidates.size,
      availableByPeriod: request.periods.map((period, index) => ({
        period,
        periodIndex: periodIndexes[index],
        availableEntityCount: byPeriod[index].size,
      })),
      completeBlockCount: blocks.length,
      missingAnySelectedPeriodCount: candidates.size - blocks.length,
    },
  });
}

export function buildLongitudinalGroupCentroidExport(
  view: OpenEnaLongitudinalView,
  presentationOptions?: OpenEnaLongitudinalPresentationOptions,
  inference: OpenEnaInferenceResultV2 | null = null,
) {
  if (inference) {
    parseBoundLongitudinalInference(view, inference);
  }
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
    schemaVersion: 2 as const,
    kind: "open-ena-longitudinal-group-centroids" as const,
    app: "ENA.HK Open ENA" as const,
    runtime: "jena-js" as const,
    runtimeVersion: JENA_RUNTIME_VERSION,
    settings: {
      repeatedEntityColumns: [...view.repeatedEntityColumns],
      identityConfirmed: view.identityConfirmed,
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
    inference,
    inferenceDiagnostics: inference
      ? {
          status: inference.status,
          reason: inference.reason,
          ledger: inference.ledger,
          families: inference.families,
          warnings: inference.warnings,
        }
      : null,
    privacy: {
      rawSourceRowsIncluded: false,
      entityTokensIncluded: false,
      entityValuesIncluded: false,
      pairedDifferencesIncluded: false,
      entityPeriodCoordinatesIncluded: false,
      note: "The derived export contains aggregate group-period geometry and aggregate inference only; it excludes repeated-entity values, opaque tokens, paired differences, entity-period coordinates, and raw source rows.",
    },
    presentation,
    createdAt: view.createdAt,
    boundaries: [...view.boundaries],
  };
}

function parseBoundLongitudinalInference(
  view: OpenEnaLongitudinalView,
  inference: OpenEnaInferenceResultV2,
) {
  const authoritativeInference = assertOpenEnaInferenceCoordinatorConsumerV2(inference);
  if (authoritativeInference.kind === "endpoint-independent"
    || !view.identityConfirmed
    || !Array.isArray(view.repeatedEntityColumns)
    || view.repeatedEntityColumns.length === 0
    || !view.source.normalizedUtf8TextSha256
    || !view.source.hashKind) {
    throw new Error("Inference consumer binding mismatch.");
  }
  const trajectoryMapping = {
    contractVersion: 1 as const,
    repeatedEntityColumns: [...view.repeatedEntityColumns],
    identityConfirmed: true as const,
    timeColumn: view.timeColumn,
    timeOrder: [...view.timeOrder],
  };
  assertOpenEnaInferenceCurrentContextV2(authoritativeInference, {
    groupNames: view.groups.map((group) => group.name),
    groupColumn: view.configuration.groupColumn,
    trajectoryMapping,
  });
  assertOpenEnaInferenceBindingV2(authoritativeInference, {
    analyzedAt: view.resultProvenance.analyzedAt,
    datasetNormalizedUtf8TextSha256: view.source.normalizedUtf8TextSha256,
    datasetHashKind: view.source.hashKind,
    modelType: view.resultProvenance.modelType,
    configuration: view.configuration,
    axes: view.axes,
    trajectoryMapping,
  });
  return authoritativeInference;
}

export function longitudinalPeriodRowsToCsv(view: OpenEnaLongitudinalView) {
  const repeatedEntityColumnsJson = JSON.stringify(view.repeatedEntityColumns);
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
    repeatedEntityColumnsJson,
    identityConfirmed: view.identityConfirmed,
    timeColumn: view.timeColumn,
    cohortPolicy: view.cohortPolicy,
    timeOrderJson,
    timeOrderLocked: view.timeOrderPolicy.locked,
    timeOrderBasis: view.timeOrderPolicy.basis,
    xAxis: view.axes[0],
    yAxis: view.axes[1],
    sourceDatasetName: view.source.datasetName,
    sourceDatasetHashKind: view.source.hashKind ?? null,
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

/** Separate aggregate inference CSV; descriptive geometry remains in the period CSV. */
export function longitudinalInferenceRowsToCsv(
  view: OpenEnaLongitudinalView,
  inference: OpenEnaInferenceResultV2,
) {
  return rowsToCsv(flattenOpenEnaInferenceRows(
    parseBoundLongitudinalInference(view, inference),
  ));
}
