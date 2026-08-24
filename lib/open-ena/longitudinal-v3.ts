import {
  adaptFittedJenaTrajectoryResultV2,
  getAnalysisBuildIdentityV2,
  hashAnalysisValueV1,
  type AnalysisExecutionDatasetV2,
  type AnalysisResult,
  type LongitudinalAnalysisBundleV2,
  type LongitudinalExecutionRequestV2,
  type OrderedTrajectoryPeriodV2,
  type RawScalar,
  type TrajectoryBootstrapTaskV2,
  type TrajectoryDisplaySpecV2,
  type TrajectoryInferenceRequestV2,
  type TrajectoryInferenceTaskV2,
  type TrajectoryNetworkOverlayTaskV2,
  type TrajectoryPathTaskV2,
  type TrajectoryRunSpecV2,
} from "j-3dena";
import type { Row } from "jena-js";

import { cloneOpenEnaConfig } from "./network-config";
import {
  datasetHashKindFor,
  sameOpenEnaConfig,
  type OpenEnaConfig,
  type OpenEnaResult,
  type ParsedDataset,
} from "./types";

const SHA256 = /^[a-f0-9]{64}$/u;
const MAX_UI_BOOTSTRAP_REPETITIONS = 500;
const MIN_UI_BOOTSTRAP_REPETITIONS = 200;

export interface OpenEnaLongitudinalInferenceSettingsV3 {
  independentPeriod: Extract<TrajectoryInferenceRequestV2, { kind: "independent-period" }> | null;
  pairedPeriods: Extract<TrajectoryInferenceRequestV2, { kind: "paired-periods" }> | null;
  repeatedPeriods: Extract<TrajectoryInferenceRequestV2, { kind: "repeated-periods" }> | null;
  pathComparison: Extract<TrajectoryInferenceRequestV2, { kind: "path-comparison" }> | null;
}

export interface OpenEnaLongitudinalBootstrapSettingsV3 {
  enabled: boolean;
  repetitions: number;
  confidenceLevel: number;
  seed: number;
  resamplingDesign: TrajectoryBootstrapTaskV2["resamplingDesign"];
  explicitStrataField: string | null;
}

export interface OpenEnaLongitudinalNetworkOverlaySettingsV3 {
  enabled: boolean;
  periodCanonical: string | null;
  groupCanonical: string | null;
}

export interface OpenEnaLongitudinalSettingsV3 {
  schemaVersion: 3;
  sourceBinding: {
    datasetHash: string;
    analyzedAt: string;
    configurationHash: string;
  };
  participantColumns: string[];
  identityConfirmed: boolean;
  identityBindingHash: string | null;
  timeColumn: string;
  orderedPeriods: OrderedTrajectoryPeriodV2[];
  cohortPolicy: "available" | "complete";
  missingValuePolicy: "complete-analytical-rows";
  estimand:
    | { kind: "equal-participant" }
    | { kind: "weighted-participant"; metadataField: string };
  selectedDimensions: [string, string, string];
  inference: OpenEnaLongitudinalInferenceSettingsV3;
  bootstrap: OpenEnaLongitudinalBootstrapSettingsV3;
  networkOverlay: OpenEnaLongitudinalNetworkOverlaySettingsV3;
}

export interface OpenEnaLongitudinalMappingProfileV3 {
  sourceRows: number;
  participants: number;
  participantPeriods: number;
  duplicateRows: number;
  duplicatedParticipantPeriods: number;
  emptyParticipantComponents: number;
  unstableGroupParticipants: number;
  positiveStableNumericMetadata: string[];
  /** Non-null scalar metadata that stays constant across each participant's complete history. */
  stableParticipantMetadata: string[];
}

export interface OpenEnaLongitudinalDisplayInventoryV3 {
  groups: Array<{ canonical: string; display: string }>;
  periods: Array<{ canonical: string; display: string; observed: boolean }>;
}

export interface OpenEnaLongitudinalBindingV3 {
  datasetHash: string;
  specHash: string;
  sourceResultHash: string;
  runId: string;
}

export interface OpenEnaPreparedLongitudinalExecutionV3 {
  request: LongitudinalExecutionRequestV2;
  binding: OpenEnaLongitudinalBindingV3;
  privacy: {
    rawRowsIncluded: false;
    rawParticipantValuesIncluded: false;
    rawUnitValuesIncluded: false;
    payload: "preprojected-coordinates-opaque-participant-group-time-and-task-parameters";
  };
}

type LegacyLongitudinalSettings = {
  repeatedEntityColumns?: string[];
  repeatedEntityColumn?: string;
  identityConfirmed?: boolean;
  timeColumn?: string;
  timeOrder?: string[];
  cohortPolicy?: "available" | "complete";
  axes?: [string, string];
  datasetNormalizedUtf8TextSha256?: string | null;
};

export class OpenEnaLongitudinalV3Error extends Error {
  readonly code: string;
  readonly path: string;

  constructor(code: string, path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "OpenEnaLongitudinalV3Error";
    this.code = code;
    this.path = path;
  }
}

function reject(code: string, path: string, message: string): never {
  throw new OpenEnaLongitudinalV3Error(code, path, message);
}

function scalar(value: unknown, path: string): RawScalar {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    reject("INVALID_SCALAR", path, "must be a string, finite number, boolean, or null");
  }
  if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
    reject("UNSAFE_INTEGER", path, "unsafe integers must be supplied as strings");
  }
  return value;
}

function scalarToken(value: RawScalar): [string, string] {
  if (value === null) return ["null", ""];
  if (typeof value === "string") return ["string", value];
  if (typeof value === "boolean") return ["boolean", value ? "true" : "false"];
  if (Object.is(value, -0)) return ["number", "-0"];
  return ["number", String(value)];
}

function canonicalScalars(values: RawScalar[]): string {
  return JSON.stringify(values.map(scalarToken));
}

function scalarType(value: Exclude<RawScalar, null>): "string" | "number" | "boolean" {
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  return "boolean";
}

function stableValues(rows: readonly Row[], column: string): RawScalar[] {
  const seen = new Set<string>();
  const output: RawScalar[] = [];
  rows.forEach((row, index) => {
    const value = scalar(row[column], `dataset.rows[${index}].${column}`);
    if (value === null || (typeof value === "string" && value.length === 0)) return;
    const canonical = canonicalScalars([value]);
    if (!seen.has(canonical)) {
      seen.add(canonical);
      output.push(value);
    }
  });
  return output;
}

function instantOffsetMinutes(value: string): number {
  if (value.endsWith("Z")) return 0;
  const match = value.match(/([+-])(\d{2}):(\d{2})$/u);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

function orderedPeriod(
  value: Exclude<RawScalar, null>,
  timeColumn: string,
  index: number,
): OrderedTrajectoryPeriodV2 {
  const identity = {
    components: [{ name: timeColumn, type: scalarType(value), value }],
  };
  let timeValue: OrderedTrajectoryPeriodV2["value"];
  if (typeof value === "number") {
    timeValue = { type: "numeric-v1", value, unit: "source-time-unit" };
  } else if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    const parsed = Date.parse(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) {
      reject("INVALID_DATE_PERIOD", `orderedPeriods[${index}]`, "is not a real calendar date");
    }
    timeValue = { type: "date-v1", value };
  } else if (
    typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T/u.test(value)
    && /(Z|[+-]\d{2}:\d{2})$/u.test(value)
    && Number.isFinite(Date.parse(value))
  ) {
    timeValue = {
      type: "instant-v1",
      epochMilliseconds: String(Date.parse(value)),
      timeZone: "source-offset",
      offsetMinutes: instantOffsetMinutes(value),
      fold: 0,
      elapsedUnit: "seconds",
    };
  } else {
    timeValue = { type: "ordered-index-v2", index };
  }
  return {
    identity,
    sourceTimeCanonical: canonicalScalars([value]),
    displayLabel: String(value),
    expected: true,
    value: timeValue,
  };
}

function configForHash(config: OpenEnaConfig): Record<string, unknown> {
  return {
    analysisKind: config.analysisKind ?? "ena",
    unitColumns: [...config.unitColumns],
    conversationColumns: [...config.conversationColumns],
    groupColumn: config.groupColumn,
    codes: [...config.codes],
    model: config.model,
    window: config.window,
    windowSizeBack: config.windowSizeBack,
    windowSizeForward: config.windowSizeForward,
    weightBy: config.weightBy,
    rotation: config.rotation,
    referenceRotationId: config.referenceRotationId,
    centerAlignToOrigin: config.centerAlignToOrigin,
    orderPolicy: config.orderPolicy ?? null,
    directionalMask: config.directionalMask ?? null,
  };
}

async function configurationHash(config: OpenEnaConfig): Promise<string> {
  return hashAnalysisValueV1(configForHash(config));
}

function defaultParticipantColumns(config: OpenEnaConfig): string[] {
  const columns = config.unitColumns.filter((column) => column !== config.groupColumn);
  if (columns.length === 0) reject("MISSING_PARTICIPANT_MAPPING", "config.unitColumns", "must contain an entity field outside the group column");
  return columns;
}

function defaultTimeColumn(config: OpenEnaConfig): string {
  const candidate = config.conversationColumns.find((column) => (
    column !== config.groupColumn && !config.unitColumns.includes(column)
  ));
  if (!candidate) reject("MISSING_TIME_MAPPING", "config.conversationColumns", "must contain a time field outside the analytic-unit tuple");
  return candidate;
}

function groupValues(dataset: ParsedDataset, config: OpenEnaConfig): RawScalar[] {
  return config.groupColumn ? stableValues(dataset.rows, config.groupColumn) : ["All units"];
}

function defaultInference(
  groups: RawScalar[],
  periods: OrderedTrajectoryPeriodV2[],
): OpenEnaLongitudinalInferenceSettingsV3 {
  const groupCanonicals = groups.map((value) => canonicalScalars([value]));
  const periodCanonicals = periods.map((period) => period.sourceTimeCanonical);
  const firstGroup = groupCanonicals[0] ?? null;
  const twoGroups = groupCanonicals.length >= 2
    ? [groupCanonicals[0]!, groupCanonicals[1]!] as [string, string]
    : null;
  return {
    independentPeriod: twoGroups && periodCanonicals[0] ? {
      kind: "independent-period",
      groups: twoGroups,
      periodCanonical: periodCanonicals[0],
    } : null,
    pairedPeriods: periodCanonicals.length >= 2 ? {
      kind: "paired-periods",
      group: firstGroup,
      earlierPeriodCanonical: periodCanonicals[0]!,
      laterPeriodCanonical: periodCanonicals.at(-1)!,
      samePhysicalEntityConfirmed: false,
    } : null,
    repeatedPeriods: periodCanonicals.length >= 3 ? {
      kind: "repeated-periods",
      group: firstGroup,
      periodCanonicals,
      samePhysicalEntityConfirmed: false,
    } : null,
    pathComparison: twoGroups ? {
      kind: "path-comparison",
      design: "independent",
      groups: twoGroups,
      repetitions: 500,
      seed: 2026,
      samePhysicalEntityConfirmed: false,
    } : null,
  };
}

function assertSuccessfulTrajectoryBinding(
  result: OpenEnaResult,
  config: OpenEnaConfig,
  dataset: ParsedDataset,
  datasetHash: string,
): void {
  if (!SHA256.test(datasetHash)) reject("INVALID_DATASET_HASH", "datasetHash", "must be a lowercase SHA-256 digest");
  if (config.analysisKind === "ona") reject("UNSUPPORTED_LONGITUDINAL_MODEL", "config.analysisKind", "ordered-network results do not implement the longitudinal trajectory contract");
  if (config.model !== "SeparateTrajectory" && config.model !== "AccumulatedTrajectory") {
    reject("UNSUPPORTED_LONGITUDINAL_MODEL", "config.model", "must be SeparateTrajectory or AccumulatedTrajectory");
  }
  if (result.set.modelType !== config.model) reject("RESULT_CONFIG_MISMATCH", "result.set.modelType", "does not match the successful configuration");
  if (!result.provenanceBinding) reject("MISSING_RESULT_BINDING", "result.provenanceBinding", "is required before a trajectory task can run");
  if (result.provenanceBinding.datasetNormalizedUtf8TextSha256 !== datasetHash
    || !sameOpenEnaConfig(result.provenanceBinding.configuration, config)
    || (result.provenanceBinding.datasetHashKind !== undefined
      && result.provenanceBinding.datasetHashKind !== datasetHashKindFor(dataset))) {
    reject("RESULT_BINDING_MISMATCH", "result.provenanceBinding", "does not match the current dataset/configuration");
  }
  if (result.set.rotation.rotationColumns.length < 3) {
    reject("INSUFFICIENT_DIMENSIONS", "result.set.rotation.rotationColumns", "3D trajectory analysis requires three fitted dimensions");
  }
}

export async function createOpenEnaLongitudinalSettingsV3(input: {
  result: OpenEnaResult;
  config: OpenEnaConfig;
  dataset: ParsedDataset;
  datasetHash: string;
}): Promise<OpenEnaLongitudinalSettingsV3> {
  assertSuccessfulTrajectoryBinding(input.result, input.config, input.dataset, input.datasetHash);
  const participantColumns = defaultParticipantColumns(input.config);
  const timeColumn = defaultTimeColumn(input.config);
  const periods = stableValues(input.dataset.rows, timeColumn).map((value, index) => {
    if (value === null) reject("MISSING_TIME", `dataset.${timeColumn}`, "contains a null period");
    return orderedPeriod(value, timeColumn, index);
  });
  if (periods.length < 2) reject("INSUFFICIENT_PERIODS", `dataset.${timeColumn}`, "requires at least two observed periods");
  const dimensions = input.result.set.rotation.rotationColumns.slice(0, 3) as [string, string, string];
  return {
    schemaVersion: 3,
    sourceBinding: {
      datasetHash: input.datasetHash,
      analyzedAt: input.result.analyzedAt,
      configurationHash: await configurationHash(input.config),
    },
    participantColumns,
    identityConfirmed: false,
    identityBindingHash: null,
    timeColumn,
    orderedPeriods: periods,
    cohortPolicy: "available",
    missingValuePolicy: "complete-analytical-rows",
    estimand: { kind: "equal-participant" },
    selectedDimensions: dimensions,
    inference: defaultInference(groupValues(input.dataset, input.config), periods),
    bootstrap: {
      enabled: true,
      repetitions: 500,
      confidenceLevel: 0.95,
      seed: 2026,
      resamplingDesign: "auto",
      explicitStrataField: null,
    },
    networkOverlay: {
      enabled: false,
      periodCanonical: periods[0]?.sourceTimeCanonical ?? null,
      groupCanonical: null,
    },
  };
}

function participantIdentity(row: Row, columns: readonly string[], rowIndex: number): string {
  return canonicalScalars(columns.map((column) => scalar(row[column], `dataset.rows[${rowIndex}].${column}`)));
}

export function profileOpenEnaLongitudinalMappingV3(
  dataset: ParsedDataset,
  config: OpenEnaConfig,
  settings: Pick<OpenEnaLongitudinalSettingsV3, "participantColumns" | "timeColumn">,
): OpenEnaLongitudinalMappingProfileV3 {
  const participantSet = new Set<string>();
  const participantRows = new Map<string, number[]>();
  const periodRows = new Map<string, number[]>();
  const participantGroups = new Map<string, Set<string>>();
  let emptyParticipantComponents = 0;
  dataset.rows.forEach((row, rowIndex) => {
    const values = settings.participantColumns.map((column) => scalar(row[column], `dataset.rows[${rowIndex}].${column}`));
    if (values.some((value) => value === null || (typeof value === "string" && value.length === 0))) emptyParticipantComponents += 1;
    const participant = canonicalScalars(values);
    participantSet.add(participant);
    const historyIndexes = participantRows.get(participant) ?? [];
    historyIndexes.push(rowIndex);
    participantRows.set(participant, historyIndexes);
    const time = scalar(row[settings.timeColumn], `dataset.rows[${rowIndex}].${settings.timeColumn}`);
    const participantPeriod = JSON.stringify([participant, canonicalScalars([time])]);
    const indexes = periodRows.get(participantPeriod) ?? [];
    indexes.push(rowIndex);
    periodRows.set(participantPeriod, indexes);
    const group = config.groupColumn
      ? canonicalScalars([scalar(row[config.groupColumn], `dataset.rows[${rowIndex}].${config.groupColumn}`)])
      : canonicalScalars(["All units"]);
    const groups = participantGroups.get(participant) ?? new Set<string>();
    groups.add(group);
    participantGroups.set(participant, groups);
  });
  const mapped = new Set([
    ...config.unitColumns,
    ...config.conversationColumns,
    ...config.codes,
    ...(config.groupColumn ? [config.groupColumn] : []),
  ]);
  const positiveStableNumericMetadata = dataset.headers.filter((column) => {
    if (mapped.has(column)) return false;
    return [...periodRows.values()].every((indexes) => {
      const values = indexes.map((index) => dataset.rows[index]?.[column]);
      return values.length > 0
        && values.every((value) => typeof value === "number" && Number.isFinite(value) && value > 0)
        && values.every((value) => Object.is(value, values[0]));
    });
  });
  const stableParticipantMetadata = dataset.headers.filter((column) => {
    if (mapped.has(column)) return false;
    return [...participantRows.values()].every((indexes) => {
      const values = indexes.map((index) => scalar(dataset.rows[index]?.[column], `dataset.rows[${index}].${column}`));
      return values.length > 0
        && values.every((value) => value !== null && !(typeof value === "string" && value.length === 0))
        && values.every((value) => canonicalScalars([value]) === canonicalScalars([values[0]!]))
    });
  });
  return {
    sourceRows: dataset.rows.length,
    participants: participantSet.size,
    participantPeriods: periodRows.size,
    duplicateRows: dataset.rows.length - periodRows.size,
    duplicatedParticipantPeriods: [...periodRows.values()].filter((indexes) => indexes.length > 1).length,
    emptyParticipantComponents,
    unstableGroupParticipants: [...participantGroups.values()].filter((groups) => groups.size > 1).length,
    positiveStableNumericMetadata,
    stableParticipantMetadata,
  };
}

export function openEnaLongitudinalDisplayInventoryV3(
  dataset: ParsedDataset,
  config: OpenEnaConfig,
  settings: Pick<OpenEnaLongitudinalSettingsV3, "orderedPeriods" | "timeColumn">,
): OpenEnaLongitudinalDisplayInventoryV3 {
  const observedPeriods = new Set(stableValues(dataset.rows, settings.timeColumn).map((value) => canonicalScalars([value])));
  return {
    groups: groupValues(dataset, config).map((value) => ({
      canonical: canonicalScalars([value]),
      display: String(value),
    })),
    periods: settings.orderedPeriods.map((period) => ({
      canonical: period.sourceTimeCanonical,
      display: period.displayLabel,
      observed: observedPeriods.has(period.sourceTimeCanonical),
    })),
  };
}

export function changeOpenEnaLongitudinalTimeColumnV3(
  settings: OpenEnaLongitudinalSettingsV3,
  dataset: ParsedDataset,
  config: OpenEnaConfig,
  timeColumn: string,
): OpenEnaLongitudinalSettingsV3 {
  if (!config.conversationColumns.includes(timeColumn) || config.unitColumns.includes(timeColumn)) {
    reject("INVALID_TIME_MAPPING", "timeColumn", "must be a fitted conversation-only field");
  }
  const orderedPeriods = stableValues(dataset.rows, timeColumn).map((value, index) => {
    if (value === null) reject("MISSING_TIME", `dataset.${timeColumn}`, "contains a null period");
    return orderedPeriod(value, timeColumn, index);
  });
  const next = clearOpenEnaLongitudinalIdentityConfirmationV3(settings);
  next.timeColumn = timeColumn;
  next.orderedPeriods = orderedPeriods;
  next.inference = defaultInference(groupValues(dataset, config), orderedPeriods);
  next.networkOverlay.periodCanonical = orderedPeriods[0]?.sourceTimeCanonical ?? null;
  return next;
}

export function createExpectedOpenEnaLongitudinalPeriodV3(
  label: string,
  timeColumn: string,
  index: number,
  reference?: OrderedTrajectoryPeriodV2,
): OrderedTrajectoryPeriodV2 {
  const trimmed = label.trim();
  if (!trimmed) reject("INVALID_EXPECTED_PERIOD", "label", "must be non-empty");
  let sourceValue: Exclude<RawScalar, null> = trimmed;
  if (reference?.value.type === "numeric-v1" || reference?.value.type === "difftime-v1") {
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) reject("INVALID_EXPECTED_PERIOD", "label", "must be a finite number matching the observed time semantics");
    sourceValue = numeric;
  }
  const period = orderedPeriod(sourceValue, timeColumn, index);
  if (reference?.value.type === "numeric-v1" && period.value.type === "numeric-v1") {
    period.value.unit = reference.value.unit;
  } else if (reference?.value.type === "difftime-v1" && typeof sourceValue === "number") {
    period.value = {
      type: "difftime-v1",
      value: sourceValue,
      unit: reference.value.unit,
      elapsedUnit: reference.value.elapsedUnit,
    };
  } else if (reference?.value.type === "ordered-index-v2") {
    period.value = { type: "ordered-index-v2", index };
  }
  period.sourceTimeCanonical = `expected:${canonicalScalars([sourceValue])}`;
  period.expected = true;
  return period;
}

async function identityBindingHash(
  settings: OpenEnaLongitudinalSettingsV3,
  context: { result: OpenEnaResult; config: OpenEnaConfig; datasetHash: string },
): Promise<string> {
  return hashAnalysisValueV1({
    datasetHash: context.datasetHash,
    analyzedAt: context.result.analyzedAt,
    configuration: configForHash(context.config),
    participantColumns: settings.participantColumns,
    timeColumn: settings.timeColumn,
    groupColumn: context.config.groupColumn,
  });
}

export async function confirmOpenEnaLongitudinalIdentityV3(
  settings: OpenEnaLongitudinalSettingsV3,
  context: { result: OpenEnaResult; config: OpenEnaConfig; datasetHash: string },
): Promise<OpenEnaLongitudinalSettingsV3> {
  const binding = await identityBindingHash(settings, context);
  return {
    ...structuredClone(settings),
    identityConfirmed: true,
    identityBindingHash: binding,
    inference: {
      independentPeriod: settings.inference.independentPeriod
        ? structuredClone(settings.inference.independentPeriod)
        : null,
      pairedPeriods: settings.inference.pairedPeriods
        ? { ...structuredClone(settings.inference.pairedPeriods), samePhysicalEntityConfirmed: true }
        : null,
      repeatedPeriods: settings.inference.repeatedPeriods
        ? { ...structuredClone(settings.inference.repeatedPeriods), samePhysicalEntityConfirmed: true }
        : null,
      pathComparison: settings.inference.pathComparison
        ? {
            ...structuredClone(settings.inference.pathComparison),
            samePhysicalEntityConfirmed: settings.inference.pathComparison.design === "paired",
          }
        : null,
    },
  };
}

function reorderLegacyPeriods(
  defaults: OrderedTrajectoryPeriodV2[],
  order: readonly string[] | undefined,
): OrderedTrajectoryPeriodV2[] {
  if (!order || order.length === 0) return defaults;
  const byLabel = new Map(defaults.map((period) => [period.displayLabel, period]));
  if (new Set(order).size !== order.length || order.some((label) => !byLabel.has(label))) return defaults;
  const reordered = order.map((label) => structuredClone(byLabel.get(label)!));
  return reordered.length === defaults.length ? reordered : defaults;
}

export async function migrateOpenEnaLongitudinalSettingsV3(
  value: unknown,
  context: { result: OpenEnaResult; config: OpenEnaConfig; dataset: ParsedDataset; datasetHash: string },
): Promise<OpenEnaLongitudinalSettingsV3> {
  if (value && typeof value === "object" && (value as { schemaVersion?: unknown }).schemaVersion === 3) {
    const candidate = structuredClone(value as OpenEnaLongitudinalSettingsV3);
    candidate.identityConfirmed = false;
    candidate.identityBindingHash = null;
    if (candidate.inference.pairedPeriods) candidate.inference.pairedPeriods.samePhysicalEntityConfirmed = false;
    if (candidate.inference.repeatedPeriods) candidate.inference.repeatedPeriods.samePhysicalEntityConfirmed = false;
    if (candidate.inference.pathComparison) candidate.inference.pathComparison.samePhysicalEntityConfirmed = false;
    return candidate;
  }
  const defaults = await createOpenEnaLongitudinalSettingsV3(context);
  if (!value || typeof value !== "object") return defaults;
  const legacy = value as LegacyLongitudinalSettings;
  const participantColumns = Array.isArray(legacy.repeatedEntityColumns)
    ? legacy.repeatedEntityColumns.filter((column) => context.config.unitColumns.includes(column))
    : legacy.repeatedEntityColumn && context.config.unitColumns.includes(legacy.repeatedEntityColumn)
      ? [legacy.repeatedEntityColumn]
      : defaults.participantColumns;
  const legacyAxes = legacy.axes?.filter((axis) => context.result.set.rotation.rotationColumns.includes(axis)) ?? [];
  const selectedDimensions = [
    ...legacyAxes,
    ...context.result.set.rotation.rotationColumns.filter((axis) => !legacyAxes.includes(axis)),
  ].slice(0, 3) as [string, string, string];
  return {
    ...defaults,
    participantColumns: participantColumns.length > 0 ? participantColumns : defaults.participantColumns,
    identityConfirmed: false,
    identityBindingHash: null,
    timeColumn: legacy.timeColumn && context.config.conversationColumns.includes(legacy.timeColumn)
      ? legacy.timeColumn
      : defaults.timeColumn,
    orderedPeriods: reorderLegacyPeriods(defaults.orderedPeriods, legacy.timeOrder),
    cohortPolicy: legacy.cohortPolicy === "complete" ? "complete" : "available",
    selectedDimensions,
  };
}

function opaqueKey(
  columns: string[],
  values: RawScalar[],
  canonical: string,
  display: string,
): AnalysisResult["points"][number]["id"] {
  return { columns: [...columns], values: [...values], canonical, display };
}

async function pseudonymizeSourceResult(
  result: AnalysisResult,
  datasetHash: string,
  runSpecFields: Pick<OpenEnaLongitudinalSettingsV3, "participantColumns" | "timeColumn">,
  groupColumn: string | null,
): Promise<AnalysisResult> {
  const copy = structuredClone(result);
  const participantCanonicals = [...new Set(copy.points.map((point) => point.participantLabel.canonical))];
  const unitCanonicals = [...new Set(copy.points.map((point) => point.unit.canonical))];
  const stepCanonicals = [...new Set(copy.points.map((point) => point.step?.canonical ?? point.id.canonical))];
  const tokenMap = async (values: string[], namespace: string) => new Map(await Promise.all(values.map(async (value, index) => [
    value,
    `${namespace}-${index + 1}-${(await hashAnalysisValueV1({ datasetHash, namespace, value })).slice(0, 20)}`,
  ] as const)));
  const participantTokens = await tokenMap(participantCanonicals, "participant");
  const unitTokens = await tokenMap(unitCanonicals, "unit");
  const stepTokens = await tokenMap(stepCanonicals, "step");
  copy.points = copy.points.map((point) => {
    const participantToken = participantTokens.get(point.participantLabel.canonical)!;
    const unitToken = unitTokens.get(point.unit.canonical)!;
    const stepToken = stepTokens.get(point.step?.canonical ?? point.id.canonical)!;
    const participantValues = point.participantLabel.columns.map((_, index) => (
      index === 0 ? participantToken : "@opaque-component"
    ));
    let unitTokenPlaced = false;
    const unitValues = point.unit.columns.map((column) => {
      if (groupColumn && column === groupColumn) return point.group?.value ?? "All units";
      if (!unitTokenPlaced) {
        unitTokenPlaced = true;
        return unitToken;
      }
      return "@opaque-unit-component";
    });
    let stepTokenPlaced = false;
    const stepColumns = point.step?.columns ?? [runSpecFields.timeColumn];
    const stepValues = stepColumns.map((column) => {
      if (column === runSpecFields.timeColumn) return point.time?.value ?? null;
      if (!stepTokenPlaced) {
        stepTokenPlaced = true;
        return stepToken;
      }
      return "@opaque-step-component";
    });
    const unit = opaqueKey(point.unit.columns, unitValues, `opaque-unit:${unitToken}`, "Opaque unit");
    const step = opaqueKey(stepColumns, stepValues, `opaque-step:${stepToken}`, "Opaque step");
    const id = opaqueKey(
      [...unit.columns, ...step.columns],
      [...unit.values, ...step.values],
      `opaque-point:${unitToken}:${stepToken}`,
      "Opaque fitted point",
    );
    return {
      ...point,
      id,
      unit,
      participantLabel: opaqueKey(
        point.participantLabel.columns,
        participantValues,
        `opaque-participant:${participantToken}`,
        "Opaque participant",
      ),
      step,
    };
  });
  copy.accumulation.modelCounts.rowKeys = copy.points.map((point) => structuredClone(point.id));
  copy.accumulation.rowCounts = { rowKeys: [], columns: [...copy.accumulation.rowCounts.columns], values: [] };
  if (copy.trajectory) {
    copy.trajectory.participantPeriods = [];
    copy.trajectory.centroids = [];
    copy.trajectory.paths = copy.trajectory.paths.map((path) => ({
      group: structuredClone(path.group),
      steps: path.steps.map((step) => ({ time: structuredClone(step.time), centroidIndex: null })),
    }));
  }
  copy.summary.participantPeriods = 0;
  copy.summary.trajectoryCentroids = 0;
  copy.summary.units = new Set(copy.points.map((point) => point.unit.canonical)).size;
  return copy;
}

function datasetColumnType(dataset: ParsedDataset, column: string): "string" | "number" | "boolean" | "mixed" | "null" {
  const kinds = new Set(dataset.rows.map((row) => row[column] === null || row[column] === undefined ? "null" : typeof row[column]));
  const nonNull = [...kinds].filter((kind) => kind !== "null");
  if (nonNull.length === 0) return "null";
  if (nonNull.length > 1) return "mixed";
  const kind = nonNull[0];
  return kind === "string" || kind === "number" || kind === "boolean" ? kind : "mixed";
}

function datasetReceipt(
  dataset: ParsedDataset,
  datasetHash: string,
  config: OpenEnaConfig,
  settings: OpenEnaLongitudinalSettingsV3,
  specHash: string,
): AnalysisExecutionDatasetV2["receipt"] {
  return {
    schemaVersion: "3dena.dataset-receipt.v1",
    sha256: datasetHash,
    byteLength: dataset.sizeBytes,
    format: /\.xlsx$/iu.test(dataset.name) ? "xlsx" : /\.xls$/iu.test(dataset.name) ? "xls" : "csv",
    sheet: /\.xlsx?$/iu.test(dataset.name) ? { index: 0, name: "first-worksheet" } : null,
    rows: dataset.rows.length,
    columns: dataset.headers.length,
    schema: {
      schemaVersion: "3dena.dataset-schema.v1",
      headers: [...dataset.headers],
      columns: dataset.headers.map((name) => {
        const roles = [
          ...(config.unitColumns.includes(name) ? ["unit" as const] : []),
          ...(config.conversationColumns.includes(name) ? ["conversation" as const] : []),
          ...(settings.participantColumns.includes(name) ? ["unit" as const] : []),
          ...(name === settings.timeColumn ? ["time" as const] : []),
          ...(config.codes.includes(name) ? ["code" as const] : []),
          ...(name === config.groupColumn ? ["group" as const] : []),
          ...(settings.estimand.kind === "weighted-participant" && name === settings.estimand.metadataField
            ? ["metadata" as const]
            : []),
          ...(settings.bootstrap.resamplingDesign === "explicit-strata" && name === settings.bootstrap.explicitStrataField
            ? ["metadata" as const]
            : []),
        ];
        return { name, inferredType: datasetColumnType(dataset, name), roles: roles.length ? [...new Set(roles)] : ["unmapped" as const] };
      }),
    },
    limits: {
      schemaVersion: "3dena.dataset-limits.v1",
      maxFileBytes: 250_000_000,
      maxWorksheets: 1,
      maxRows: 250_000,
      maxColumns: 2_000,
      maxCells: 10_000_000,
    },
    warnings: [],
    activationIdentity: `open-ena:${datasetHash}:${specHash}`,
  };
}

function validateSettings(
  settings: OpenEnaLongitudinalSettingsV3,
  result: OpenEnaResult,
  config: OpenEnaConfig,
  dataset: ParsedDataset,
): void {
  if (settings.schemaVersion !== 3) reject("INVALID_SETTINGS_VERSION", "settings.schemaVersion", "must be 3");
  if (settings.participantColumns.length === 0
    || new Set(settings.participantColumns).size !== settings.participantColumns.length
    || settings.participantColumns.some((column) => !config.unitColumns.includes(column))) {
    reject("INVALID_PARTICIPANT_MAPPING", "settings.participantColumns", "must be distinct fitted unit columns");
  }
  if (!config.conversationColumns.includes(settings.timeColumn)
    || config.unitColumns.includes(settings.timeColumn)
    || !dataset.headers.includes(settings.timeColumn)) {
    reject("INVALID_TIME_MAPPING", "settings.timeColumn", "must be a fitted conversation-only field");
  }
  if (settings.orderedPeriods.length < 2) reject("INSUFFICIENT_PERIODS", "settings.orderedPeriods", "must contain at least two ordered periods");
  if (settings.selectedDimensions.length !== 3
    || new Set(settings.selectedDimensions).size !== 3
    || settings.selectedDimensions.some((dimension) => !result.set.rotation.rotationColumns.includes(dimension))) {
    reject("INVALID_DIMENSIONS", "settings.selectedDimensions", "must contain three distinct fitted rotation dimensions");
  }
  if (settings.bootstrap.enabled && (
    !Number.isSafeInteger(settings.bootstrap.repetitions)
    || settings.bootstrap.repetitions < MIN_UI_BOOTSTRAP_REPETITIONS
    || settings.bootstrap.repetitions > MAX_UI_BOOTSTRAP_REPETITIONS
  )) reject("INVALID_UI_BOOTSTRAP_REPETITIONS", "settings.bootstrap.repetitions", "must be an integer from 200 through 500");
  if (settings.estimand.kind === "weighted-participant") {
    const profile = profileOpenEnaLongitudinalMappingV3(dataset, config, settings);
    if (!profile.positiveStableNumericMetadata.includes(settings.estimand.metadataField)) {
      reject("INVALID_WEIGHT_FIELD", "settings.estimand.metadataField", "must be positive numeric and constant within every participant-period");
    }
  }
  if (settings.bootstrap.resamplingDesign === "explicit-strata") {
    const profile = profileOpenEnaLongitudinalMappingV3(dataset, config, settings);
    if (!settings.bootstrap.explicitStrataField
      || !profile.stableParticipantMetadata.includes(settings.bootstrap.explicitStrataField)) {
      reject("INVALID_STRATA_FIELD", "settings.bootstrap.explicitStrataField", "must be non-null and constant across every participant's complete history");
    }
  } else if (settings.bootstrap.explicitStrataField !== null) {
    reject("UNEXPECTED_STRATA_FIELD", "settings.bootstrap.explicitStrataField", "must be null unless explicit-strata is selected");
  }
}

export async function buildOpenEnaLongitudinalExecutionRequestV3(input: {
  result: OpenEnaResult;
  config: OpenEnaConfig;
  dataset: ParsedDataset;
  datasetHash: string;
  settings: OpenEnaLongitudinalSettingsV3;
  runId: string;
  executionTarget: LongitudinalExecutionRequestV2["execution"]["target"];
}): Promise<OpenEnaPreparedLongitudinalExecutionV3> {
  assertSuccessfulTrajectoryBinding(input.result, input.config, input.dataset, input.datasetHash);
  validateSettings(input.settings, input.result, input.config, input.dataset);
  if (input.settings.sourceBinding.datasetHash !== input.datasetHash
    || input.settings.sourceBinding.analyzedAt !== input.result.analyzedAt
    || input.settings.sourceBinding.configurationHash !== await configurationHash(input.config)) {
    reject("STALE_SETTINGS", "settings.sourceBinding", "does not match the current successful result");
  }
  if (input.settings.identityConfirmed) {
    const expectedIdentityBinding = await identityBindingHash(input.settings, input);
    if (input.settings.identityBindingHash !== expectedIdentityBinding) {
      reject("STALE_IDENTITY_CONFIRMATION", "settings.identityBindingHash", "must be reconfirmed after any data or mapping change");
    }
  }
  const metadataColumns = [
    ...(input.settings.estimand.kind === "weighted-participant" ? [input.settings.estimand.metadataField] : []),
    ...(input.settings.bootstrap.resamplingDesign === "explicit-strata" && input.settings.bootstrap.explicitStrataField
      ? [input.settings.bootstrap.explicitStrataField]
      : []),
  ].filter((column, index, values) => values.indexOf(column) === index);
  const adapted = adaptFittedJenaTrajectoryResultV2({
    set: input.result.set,
    sourceRows: input.dataset.rows,
    mapping: {
      unitColumns: [...input.config.unitColumns],
      conversationColumns: [...input.config.conversationColumns],
      participantColumns: [...input.settings.participantColumns],
      timeColumn: input.settings.timeColumn,
      groupColumn: input.config.groupColumn,
      metadataColumns,
    },
    configuration: {
      model: input.config.model as "SeparateTrajectory" | "AccumulatedTrajectory",
      window: input.config.window,
      weightBy: input.config.weightBy,
      windowSizeBack: input.config.window === "Conversation" ? Number.POSITIVE_INFINITY : input.config.windowSizeBack,
      windowSizeForward: input.config.window === "Conversation" ? 0 : input.config.windowSizeForward,
      centerAlignToOrigin: input.config.centerAlignToOrigin,
      rotationMethod: input.config.rotation,
    },
    inputColumns: [...input.dataset.headers],
  });
  const scientificSource = await pseudonymizeSourceResult(
    adapted,
    input.datasetHash,
    input.settings,
    input.config.groupColumn,
  );
  const sourceResultHash = await hashAnalysisValueV1(scientificSource);
  const observedTimes = new Set(scientificSource.trajectory?.timeOrder.map((time) => time.canonical) ?? []);
  const requestedObserved = input.settings.orderedPeriods.filter((period) => observedTimes.has(period.sourceTimeCanonical));
  if (requestedObserved.length !== observedTimes.size
    || [...observedTimes].some((canonical) => !requestedObserved.some((period) => period.sourceTimeCanonical === canonical))) {
    reject("PERIOD_BINDING_MISMATCH", "settings.orderedPeriods", "must include each fitted observed period exactly once; expected empty periods may be added explicitly");
  }
  const runSpec: TrajectoryRunSpecV2 = {
    schemaVersion: "3dena.trajectory-run-spec.v2",
    sourceResultHash,
    participantColumns: [...input.settings.participantColumns],
    timeColumn: input.settings.timeColumn,
    groupColumn: input.config.groupColumn,
    orderedPeriods: structuredClone(input.settings.orderedPeriods),
    selectedDimensions: [...input.settings.selectedDimensions],
    cohortPolicy: input.settings.cohortPolicy,
    missingValuePolicy: "complete-analytical-rows",
    estimand: structuredClone(input.settings.estimand),
  };
  const specHash = await hashAnalysisValueV1(runSpec);
  const build = getAnalysisBuildIdentityV2();
  if (!build.bound) reject("UNBOUND_SDK_BUILD", "j-3dena", "the consumed package has no injected build identity");
  const executionDataset: AnalysisExecutionDatasetV2 = {
    schemaVersion: "3dena.analysis-execution-dataset.v2",
    receipt: datasetReceipt(input.dataset, input.datasetHash, input.config, input.settings, specHash),
    specHash,
    buildId: build.buildId,
    sourceResult: { sourceKind: "raw-jena", hash: sourceResultHash, result: scientificSource },
  };
  const pathTask: TrajectoryPathTaskV2 = {
    schemaVersion: "3dena.trajectory-path-task.v2",
    kind: "trajectory-path-v2",
    datasetHash: input.datasetHash,
    specHash,
    runId: input.runId,
    runSpec,
  };
  const inferenceRequests = Object.values(input.settings.inference).filter((request): request is TrajectoryInferenceRequestV2 => request !== null).map((request) => {
    if (request.kind === "paired-periods" || request.kind === "repeated-periods") {
      return { ...structuredClone(request), samePhysicalEntityConfirmed: input.settings.identityConfirmed };
    }
    if (request.kind === "path-comparison") {
      return {
        ...structuredClone(request),
        samePhysicalEntityConfirmed: request.design === "paired" && input.settings.identityConfirmed,
      };
    }
    return structuredClone(request);
  });
  const inferenceTask: TrajectoryInferenceTaskV2 | undefined = inferenceRequests.length ? {
    schemaVersion: "3dena.trajectory-inference-task.v2",
    kind: "trajectory-inference-v2",
    datasetHash: input.datasetHash,
    specHash,
    sourceResultHash,
    runId: input.runId,
    requests: inferenceRequests,
    adjustment: "holm",
  } : undefined;
  const bootstrapTask: TrajectoryBootstrapTaskV2 | undefined = input.settings.bootstrap.enabled ? {
    schemaVersion: "3dena.trajectory-bootstrap-task.v2",
    kind: "trajectory-bootstrap-v2",
    datasetHash: input.datasetHash,
    specHash,
    sourceResultHash,
    runId: input.runId,
    repetitions: input.settings.bootstrap.repetitions,
    confidenceLevel: input.settings.bootstrap.confidenceLevel,
    seed: input.settings.bootstrap.seed,
    resamplingDesign: input.settings.bootstrap.resamplingDesign,
    explicitStrataField: input.settings.bootstrap.explicitStrataField,
    interval: "pointwise-percentile-linear-type7",
    rotationPolicy: "fixed-same-fit-projection",
  } : undefined;
  const networkOverlayTask: TrajectoryNetworkOverlayTaskV2 | undefined = input.settings.networkOverlay.enabled
    && input.settings.networkOverlay.periodCanonical ? {
      schemaVersion: "3dena.trajectory-network-overlay-task.v2",
      kind: "trajectory-network-overlay-v2",
      datasetHash: input.datasetHash,
      specHash,
      sourceResultHash,
      runId: input.runId,
      requests: [{
        periodCanonical: input.settings.networkOverlay.periodCanonical,
        groupCanonical: input.settings.networkOverlay.groupCanonical,
      }],
    } : undefined;
  const request: LongitudinalExecutionRequestV2 = {
    dataset: executionDataset,
    pathTask,
    ...(inferenceTask ? { inferenceTask } : {}),
    ...(bootstrapTask ? { bootstrapTask } : {}),
    ...(networkOverlayTask ? { networkOverlayTask } : {}),
    execution: {
      target: input.executionTarget,
      jenaVersion: build.jenaVersion,
      jenaCommit: build.jenaCommit,
      jenaTarballIntegrity: build.jenaTarballIntegrity,
      sdkVersion: build.sdkVersion,
      buildId: build.buildId,
      seed: input.settings.bootstrap.seed,
    },
  };
  return {
    request,
    binding: { datasetHash: input.datasetHash, specHash, sourceResultHash, runId: input.runId },
    privacy: {
      rawRowsIncluded: false,
      rawParticipantValuesIncluded: false,
      rawUnitValuesIncluded: false,
      payload: "preprojected-coordinates-opaque-participant-group-time-and-task-parameters",
    },
  };
}

export function isOpenEnaLongitudinalBundleStaleV3(
  bundle: LongitudinalAnalysisBundleV2,
  binding: OpenEnaLongitudinalBindingV3,
): boolean {
  return bundle.identity.datasetHash !== binding.datasetHash
    || bundle.identity.specHash !== binding.specHash
    || bundle.identity.sourceResultHash !== binding.sourceResultHash
    || bundle.identity.runId !== binding.runId;
}

export function openEnaTrajectoryDisplaySpecV3(
  bundle: LongitudinalAnalysisBundleV2,
  options: Partial<Omit<TrajectoryDisplaySpecV2, "schemaVersion">> = {},
): TrajectoryDisplaySpecV2 {
  const projection = options.projection ?? "3d";
  const displayedGroups = options.displayedGroups ?? bundle.paths.map((path) => path.group.canonical);
  return {
    schemaVersion: "3dena.trajectory-display-spec.v2",
    projection,
    displayedGroups: [...displayedGroups],
    traces: {
      participants: true,
      individualPaths: false,
      centroids: true,
      paths: true,
      directionArrows: true,
      networkOverlay: bundle.networkOverlays.some((entry) => entry.status === "available"),
      labels: true,
      ...options.traces,
      // Trajectory presenters intentionally never draw confidence intervals.
      // Static 3D ENA group-comparison plots own the visual CI grammar; the
      // longitudinal bootstrap remains available only in numerical tables and
      // exports.
      uncertainty: false,
    },
    axisFlips: options.axisFlips ? [...options.axisFlips] : [false, false, false],
    camera: options.camera === undefined
      ? projection === "3d"
        ? {
            eye: { x: 1.35, y: 1.35, z: 1.2 },
            center: { x: 0, y: 0, z: 0 },
            up: { x: 0, y: 0, z: 1 },
          }
        : null
      : structuredClone(options.camera),
    style: {
      participantSize: 5,
      participantOpacity: 0.42,
      centroidSize: 7,
      pathWidth: 5,
      ...options.style,
    },
  };
}

export function cloneOpenEnaLongitudinalSettingsV3(
  settings: OpenEnaLongitudinalSettingsV3,
): OpenEnaLongitudinalSettingsV3 {
  return structuredClone(settings);
}

export function clearOpenEnaLongitudinalIdentityConfirmationV3(
  settings: OpenEnaLongitudinalSettingsV3,
): OpenEnaLongitudinalSettingsV3 {
  const next = structuredClone(settings);
  next.identityConfirmed = false;
  next.identityBindingHash = null;
  if (next.inference.pairedPeriods) next.inference.pairedPeriods.samePhysicalEntityConfirmed = false;
  if (next.inference.repeatedPeriods) next.inference.repeatedPeriods.samePhysicalEntityConfirmed = false;
  if (next.inference.pathComparison) next.inference.pathComparison.samePhysicalEntityConfirmed = false;
  return next;
}

export function cloneOpenEnaLongitudinalConfigV3(config: OpenEnaConfig): OpenEnaConfig {
  return cloneOpenEnaConfig(config);
}
