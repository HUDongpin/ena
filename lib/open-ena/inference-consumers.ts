import type { Scalar } from "jena-js";
import type {
  OpenEnaFriedmanInferenceRowV2,
  OpenEnaInferenceFamilyV2,
  OpenEnaInferenceResultV2,
  OpenEnaInferenceTrajectoryMappingV2,
  OpenEnaMannWhitneyInferenceRowV2,
  OpenEnaWilcoxonInferenceRowV2,
} from "./inference-v2";
import { assertOpenEnaInferenceCoordinatorAuthorityV2 } from "./inference-authority";
import {
  sameOpenEnaConfig,
  type DatasetHashKind,
  type OpenEnaConfig,
} from "./types";

export interface OpenEnaInferenceExpectedBindingV2 {
  analyzedAt: string;
  datasetNormalizedUtf8TextSha256: string;
  datasetHashKind: DatasetHashKind;
  modelType: OpenEnaConfig["model"];
  configuration: OpenEnaConfig;
  axes: readonly [string, string];
  /** Supply this when the consumer has a current longitudinal mapping to bind. */
  trajectoryMapping?: OpenEnaInferenceTrajectoryMappingV2 | null;
}

export interface OpenEnaInferenceProducerContextV2 {
  groupNames: readonly string[];
  groupColumn: string | null;
  trajectoryMapping: OpenEnaInferenceTrajectoryMappingV2 | null;
}

const BINDING_MISMATCH = "Inference consumer binding mismatch.";
const CURRENT_CONTEXT_MISMATCH = "Inference consumer current context mismatch.";
const INFERENCE_JSON_DATA_ERROR =
  "Inference result must be plain JSON data with own enumerable data properties.";
const INFERENCE_JSON_BUDGET_ERROR =
  "Inference result exceeds the bounded plain JSON data budget.";
const MAX_INFERENCE_STRING_LENGTH = 4_096;
const MAX_INFERENCE_ARRAY_LENGTH = 4_096;
const MAX_INFERENCE_JSON_RECORD_OWN_KEYS = 4_096;
const MAX_INFERENCE_JSON_OBJECT_NODES = 32_768;
const MAX_INFERENCE_JSON_OWN_KEYS = 262_144;

function sameAxes(left: readonly string[], right: readonly string[]) {
  return left.length === 2
    && right.length === 2
    && left[0] === right[0]
    && left[1] === right[1];
}

function sameUnknownArrays(left: unknown, right: unknown) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((entry, index) => entry === right[index]);
}

function sameTrajectoryMapping(
  left: OpenEnaInferenceTrajectoryMappingV2 | null,
  right: OpenEnaInferenceTrajectoryMappingV2 | null,
) {
  if (left === null || right === null) return left === right;
  return left.contractVersion === right.contractVersion
    && left.identityConfirmed === right.identityConfirmed
    && left.timeColumn === right.timeColumn
    && sameUnknownArrays(left.repeatedEntityColumns, right.repeatedEntityColumns)
    && sameUnknownArrays(left.timeOrder, right.timeOrder);
}

function trajectoryMappingMatchesRequest(inference: OpenEnaInferenceResultV2) {
  const mapping = inference.binding.trajectoryMapping;
  if (inference.kind === "endpoint-independent") return mapping === null;
  if (mapping === null) return inference.status === "disabled";
  if (inference.binding.modelType !== "SeparateTrajectory"
    && inference.binding.modelType !== "AccumulatedTrajectory") return false;
  if (mapping.contractVersion !== 1
    || mapping.identityConfirmed !== true
    || mapping.repeatedEntityColumns.length === 0
    || new Set(mapping.repeatedEntityColumns).size !== mapping.repeatedEntityColumns.length
    || mapping.repeatedEntityColumns.some((column) => (
      !inference.binding.configuration.unitColumns.includes(column)
    ))
    || (inference.binding.configuration.groupColumn !== null
      && mapping.repeatedEntityColumns.length === 1
      && mapping.repeatedEntityColumns[0] === inference.binding.configuration.groupColumn
      && inference.binding.configuration.unitColumns.some((column) => (
        column !== inference.binding.configuration.groupColumn
      )))
    || mapping.timeOrder.length === 0
    || new Set(mapping.timeOrder).size !== mapping.timeOrder.length
    || !sameUnknownArrays(mapping.repeatedEntityColumns, inference.request.repeatedEntityColumns)
    || mapping.timeColumn !== inference.request.timeColumn
    || !inference.binding.configuration.conversationColumns.includes(mapping.timeColumn)) return false;
  const requestedPeriods = inference.kind === "trajectory-independent-period"
    ? [inference.request.period]
    : inference.kind === "trajectory-paired-periods"
      ? [inference.request.earlierPeriod, inference.request.laterPeriod]
      : inference.request.periods;
  if (requestedPeriods.some((period) => !mapping.timeOrder.includes(period))) return false;
  if (inference.kind === "trajectory-repeated-periods") {
    const indexes = requestedPeriods.map((period) => mapping.timeOrder.indexOf(period));
    return indexes.every((index, position) => position === 0 || index > indexes[position - 1]);
  }
  return true;
}

function assertPlainInferenceJsonData(
  value: unknown,
  state: {
    active: Set<object>;
    validated: Set<object>;
    objectNodeCount: number;
    ownKeyCount: number;
  } = {
    active: new Set<object>(),
    validated: new Set<object>(),
    objectNodeCount: 0,
    ownKeyCount: 0,
  },
  depth = 0,
): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") return;
  if (typeof value !== "object") throw new Error(INFERENCE_JSON_DATA_ERROR);
  if (state.validated.has(value)) return;
  if (depth > 256 || state.active.has(value)) throw new Error(INFERENCE_JSON_DATA_ERROR);

  state.objectNodeCount += 1;
  if (state.objectNodeCount > MAX_INFERENCE_JSON_OBJECT_NODES) {
    throw new Error(INFERENCE_JSON_BUDGET_ERROR);
  }

  const prototype = Object.getPrototypeOf(value);
  const isArray = Array.isArray(value);
  let arrayLength: number | null = null;
  if (isArray) {
    if (prototype !== Array.prototype) throw new Error(INFERENCE_JSON_DATA_ERROR);
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (!lengthDescriptor
      || !("value" in lengthDescriptor)
      || typeof lengthDescriptor.value !== "number"
      || !Number.isSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0
      || lengthDescriptor.enumerable) {
      throw new Error(INFERENCE_JSON_DATA_ERROR);
    }
    arrayLength = lengthDescriptor.value;
    if (arrayLength > MAX_INFERENCE_ARRAY_LENGTH) {
      throw new Error(INFERENCE_JSON_BUDGET_ERROR);
    }
  } else if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(INFERENCE_JSON_DATA_ERROR);
  }

  // Enumerate keys once, enforce the work budget, and only then request each
  // descriptor individually. This avoids materializing a second full
  // descriptors object for hostile multi-megabyte records.
  const keys = Reflect.ownKeys(value);
  const containerOwnKeyLimit = isArray
    ? MAX_INFERENCE_ARRAY_LENGTH + 1
    : MAX_INFERENCE_JSON_RECORD_OWN_KEYS;
  state.ownKeyCount += keys.length;
  if (keys.length > containerOwnKeyLimit
    || state.ownKeyCount > MAX_INFERENCE_JSON_OWN_KEYS) {
    throw new Error(INFERENCE_JSON_BUDGET_ERROR);
  }

  state.active.add(value);
  if (isArray) {
    if (keys.some((key) => typeof key !== "string")
      || keys.length !== (arrayLength as number) + 1) {
      throw new Error(INFERENCE_JSON_DATA_ERROR);
    }
    for (let index = 0; index < (arrayLength as number); index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        throw new Error(INFERENCE_JSON_DATA_ERROR);
      }
      assertPlainInferenceJsonData(descriptor.value, state, depth + 1);
    }
  } else {
    if (keys.some((key) => typeof key !== "string")) {
      throw new Error(INFERENCE_JSON_DATA_ERROR);
    }
    for (const key of keys as string[]) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        throw new Error(INFERENCE_JSON_DATA_ERROR);
      }
      assertPlainInferenceJsonData(descriptor.value, state, depth + 1);
    }
  }

  state.active.delete(value);
  state.validated.add(value);
}

function isDeeplyFrozenOwnData(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value !== "object" || seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined
      && "value" in descriptor
      && isDeeplyFrozenOwnData(descriptor.value, seen);
  });
}

function isDeeplyFrozen(value: unknown): boolean {
  try {
    assertPlainInferenceJsonData(value);
  } catch {
    return false;
  }
  return isDeeplyFrozenOwnData(value);
}

/**
 * Consumer-side fail-closed guard. This compares only immutable result bindings;
 * it never invokes a statistical engine or reconstructs an inference sample.
 */
export function assertOpenEnaInferenceBindingV2(
  inference: OpenEnaInferenceResultV2,
  expected: OpenEnaInferenceExpectedBindingV2,
): asserts inference is OpenEnaInferenceResultV2 {
  if (!isDeeplyFrozen(inference)
    || inference.analyzedAt !== expected.analyzedAt
    || inference.binding.analyzedAt !== expected.analyzedAt
    || inference.binding.dataset.normalizedUtf8TextSha256
      !== expected.datasetNormalizedUtf8TextSha256
    || inference.binding.dataset.hashKind !== expected.datasetHashKind
    || inference.binding.modelType !== expected.modelType
    || !sameOpenEnaConfig(inference.binding.configuration, expected.configuration)
    || !sameAxes(inference.binding.axes, expected.axes)
    || !sameAxes(inference.request.axes, expected.axes)
    || !trajectoryMappingMatchesRequest(inference)
    || (Object.prototype.hasOwnProperty.call(expected, "trajectoryMapping")
      && !sameTrajectoryMapping(
        inference.binding.trajectoryMapping,
        expected.trajectoryMapping ?? null,
      ))) {
    throw new Error(BINDING_MISMATCH);
  }
}

/**
 * Binds one coordinator authority to the consumer's current descriptive
 * result and longitudinal mapping. This is a comparison only; it never
 * reconstructs samples or invokes a statistical engine.
 */
export function assertOpenEnaInferenceCurrentContextV2(
  inference: OpenEnaInferenceResultV2,
  context: OpenEnaInferenceProducerContextV2,
): asserts inference is OpenEnaInferenceResultV2 {
  const groupNames = context.groupNames;
  const groupNameSet = new Set(groupNames);
  const mapping = inference.binding.trajectoryMapping;
  if (!Array.isArray(groupNames)
    || groupNames.length > MAX_INFERENCE_ARRAY_LENGTH
    || groupNames.some((group) => (
      typeof group !== "string"
      || group.length === 0
      || group.length > MAX_INFERENCE_STRING_LENGTH
    ))
    || groupNameSet.size !== groupNames.length
    || context.groupColumn !== inference.binding.configuration.groupColumn
    || (context.groupColumn !== null
      && (context.groupColumn.length === 0
        || context.groupColumn.length > MAX_INFERENCE_STRING_LENGTH))) {
    throw new Error(CURRENT_CONTEXT_MISMATCH);
  }

  if (inference.kind === "endpoint-independent") {
    if (mapping !== null || context.trajectoryMapping !== null) {
      throw new Error(CURRENT_CONTEXT_MISMATCH);
    }
  } else if (inference.status === "disabled" && mapping === null) {
    if (context.trajectoryMapping !== null) throw new Error(CURRENT_CONTEXT_MISMATCH);
  } else if (mapping === null
    || context.trajectoryMapping === null
    || !sameTrajectoryMapping(mapping, context.trajectoryMapping)) {
    throw new Error(CURRENT_CONTEXT_MISMATCH);
  }

  if (inference.status === "disabled") return;
  if (inference.kind === "endpoint-independent"
    || inference.kind === "trajectory-independent-period") {
    if (context.groupColumn === null
      || !groupNameSet.has(inference.request.primaryGroup)
      || !groupNameSet.has(inference.request.secondaryGroup)) {
      throw new Error(CURRENT_CONTEXT_MISMATCH);
    }
    return;
  }
  if (context.groupColumn === null) {
    if (inference.request.group !== null) throw new Error(CURRENT_CONTEXT_MISMATCH);
    return;
  }
  if (inference.request.group === null || !groupNameSet.has(inference.request.group)) {
    throw new Error(CURRENT_CONTEXT_MISMATCH);
  }
}

function familyFor(
  families: readonly OpenEnaInferenceFamilyV2[],
  familyId: string,
) {
  return families.find((family) => family.familyId === familyId) ?? null;
}

export interface OpenEnaFlattenedInferenceRowV2 extends Record<string, Scalar> {
  test: "mann-whitney-u" | "wilcoxon-signed-rank" | "friedman";
  axisIndex: number;
  axis: string;
  status: "available" | "not-estimable";
  reason: string | null;
  rowRole: "comparison" | "omnibus" | "posthoc";
  inferenceKind: OpenEnaInferenceResultV2["kind"];
  familyRole: OpenEnaInferenceFamilyV2["role"] | null;
  familyId: string;
  memberId: string;
  familySizePlanned: number;
  pRaw: number | null;
  pHolm: number | null;
}

function commonFlattenedRow(
  inference: OpenEnaInferenceResultV2,
  row: OpenEnaMannWhitneyInferenceRowV2
    | OpenEnaWilcoxonInferenceRowV2
    | OpenEnaFriedmanInferenceRowV2,
  rowRole: OpenEnaFlattenedInferenceRowV2["rowRole"],
) {
  const family = familyFor(inference.families, row.familyId);
  const earlierPeriod = row.test === "wilcoxon-signed-rank"
    ? inference.kind === "trajectory-paired-periods"
      ? inference.scope.earlierPeriod
      : inference.kind === "trajectory-repeated-periods"
        ? inference.scope.periods[row.earlierPeriodIndex] ?? null
        : null
    : null;
  const laterPeriod = row.test === "wilcoxon-signed-rank"
    ? inference.kind === "trajectory-paired-periods"
      ? inference.scope.laterPeriod
      : inference.kind === "trajectory-repeated-periods"
        ? inference.scope.periods[row.laterPeriodIndex] ?? null
        : null
    : null;
  const primaryGroup = inference.kind === "endpoint-independent"
    || inference.kind === "trajectory-independent-period"
    ? inference.scope.primaryGroup
    : null;
  const secondaryGroup = inference.kind === "endpoint-independent"
    || inference.kind === "trajectory-independent-period"
    ? inference.scope.secondaryGroup
    : null;
  const selectedGroup = inference.kind === "trajectory-paired-periods"
    || inference.kind === "trajectory-repeated-periods"
    ? inference.scope.group
    : null;
  const selectedPeriod = inference.kind === "trajectory-independent-period"
    ? inference.scope.period
    : null;

  const base = {
    test: row.test,
    axisIndex: row.axisIndex,
    axis: row.axis,
    status: row.status,
    reason: row.reason,
    rowRole,
    inferenceKind: inference.kind,
    familyRole: family?.role ?? null,
    familyId: row.familyId,
    memberId: row.memberId,
    familySizePlanned: row.familySizePlanned,
    pRaw: row.pRaw,
    pHolm: row.pHolm,
    holmRank: row.holmRank,
    holmMultiplier: row.holmMultiplier,
    resolvedPMethod: row.resolvedPMethod,
    alternative: inference.method.alternative,
    pValueMethod: inference.method.pValueMethod,
    zeroMethod: inference.method.zeroMethod,
    multiplicityCorrection: inference.method.multiplicityCorrection,
    rankPrecisionSignificantDigits: inference.method.rankPrecisionSignificantDigits,
    exactMaxRankedN: inference.method.exactMaxRankedN,
    friedmanExactAssignmentLimit: inference.method.friedmanExactAssignmentLimit,
    continuityCorrection: inference.method.continuityCorrection,
    continuityCorrectionApplied: row.continuityCorrectionApplied,
    tieGroupCount: row.tieGroupCount,
    tiedObservationCount: row.tiedObservationCount,
    tieCorrectionSum: row.tieCorrectionSum,
    warningsJson: JSON.stringify(row.warnings),
    exactExtremeAssignmentCount: row.exactTail?.extremeAssignmentCount ?? null,
    exactTotalAssignmentCount: row.exactTail?.totalAssignmentCount ?? null,
    exactTailInclusive: row.exactTail?.inclusive ?? null,
    exactMidP: row.exactTail?.midP ?? null,
    coordinateSystem: inference.coordinateSystem,
    analysisUnit: inference.scope.analysisUnit,
    primaryGroup,
    secondaryGroup,
    group: selectedGroup,
    period: selectedPeriod,
    earlierPeriod,
    laterPeriod,
  } as const;

  if (row.test === "mann-whitney-u") {
    return {
      ...base,
      nPrimary: row.nPrimary,
      nSecondary: row.nSecondary,
      medianPrimary: row.medianPrimary,
      medianSecondary: row.medianSecondary,
      uPrimary: row.uPrimary,
      uSecondary: row.uSecondary,
      z: row.z,
      rankBiserialPrimaryVsSecondary: row.rankBiserialPrimaryVsSecondary,
      effectDirection: row.effectDirection,
    } satisfies OpenEnaFlattenedInferenceRowV2;
  }
  if (row.test === "friedman") {
    return {
      ...base,
      nComplete: row.nComplete,
      nMissingCompleteBlocks: row.nMissingCompleteBlocks,
      nPeriods: row.nPeriods,
      q: row.q,
      degreesFreedom: row.degreesFreedom,
      kendallsW: row.kendallsW,
      effectDirection: row.effectDirection,
    } satisfies OpenEnaFlattenedInferenceRowV2;
  }
  return {
    ...base,
    earlierPeriodIndex: row.earlierPeriodIndex,
    laterPeriodIndex: row.laterPeriodIndex,
    differenceDirection: row.differenceDirection,
    nMatched: row.nMatched,
    nMissing: row.nMissing,
    nPositive: row.nPositive,
    nNegative: row.nNegative,
    nZero: row.nZero,
    nNonzero: row.nNonzero,
    nRanked: row.nRanked,
    medianDifference: row.medianDifference,
    q1Difference: row.q1Difference,
    q3Difference: row.q3Difference,
    iqrDifference: row.iqrDifference,
    wPositive: row.wPositive,
    wNegative: row.wNegative,
    t: row.t,
    z: row.z,
    rankBiserialLaterVsEarlier: row.rankBiserialLaterVsEarlier,
    minimumAttainablePFormula: row.minimumAttainableTwoSidedP?.formula ?? null,
    minimumAttainablePLog2: row.minimumAttainableTwoSidedP?.log2 ?? null,
    minimumAttainablePNumeric: row.minimumAttainableTwoSidedP?.numeric ?? null,
    effectDirection: row.effectDirection,
  } satisfies OpenEnaFlattenedInferenceRowV2;
}

/** Aggregate-only row normalization for exports, Methods and later AI sanitizers. */
export function flattenOpenEnaInferenceRows(
  inference: OpenEnaInferenceResultV2,
): OpenEnaFlattenedInferenceRowV2[] {
  if (inference.kind === "trajectory-repeated-periods") {
    return [
      ...inference.omnibusRows.map((row) => commonFlattenedRow(inference, row, "omnibus")),
      ...inference.followupRows.map((row) => commonFlattenedRow(inference, row, "posthoc")),
    ];
  }
  return inference.rows.map((row) => commonFlattenedRow(inference, row, "comparison"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string) {
  const allowedSet = new Set(allowed);
  const actual = Object.keys(value);
  if (actual.some((key) => !allowedSet.has(key))) {
    throw new Error(`${label} contains an unsupported field.`);
  }
  if (actual.length !== allowed.length
    || allowed.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) {
    throw new Error(`${label} must contain exactly its required fields.`);
  }
}

function finiteOrNull(value: unknown, label: string) {
  if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error(`${label} must be finite or null.`);
  }
}

function probabilityOrNull(value: unknown) {
  return value === null
    || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1);
}

function validateStringArray(value: unknown, label: string) {
  if (!Array.isArray(value)
    || value.length > MAX_INFERENCE_ARRAY_LENGTH
    || value.some((item) => (
      typeof item !== "string" || item.length > MAX_INFERENCE_STRING_LENGTH
    ))) {
    throw new Error(`${label} must be a bounded string array.`);
  }
}

const MAX_CONFIGURATION_COLUMNS = 256;
const MAX_CONFIGURATION_CODES = 30;

function validateUniqueBoundedStringArray(
  value: unknown,
  label: string,
  minimumLength: number,
  maximumLength: number,
) {
  validateStringArray(value, label);
  const items = value as string[];
  if (items.length < minimumLength
    || items.length > maximumLength
    || new Set(items).size !== items.length
    || items.some((item) => item.length === 0 || item.length > MAX_INFERENCE_STRING_LENGTH)) {
    throw new Error(`${label} must contain unique bounded strings.`);
  }
}

function nonEmptyString(value: unknown, label: string) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_INFERENCE_STRING_LENGTH) {
    throw new Error(`${label} must be a bounded non-empty string.`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
}

function windowInteger(value: unknown, label: string) {
  if (typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < 0
    || value > 100) {
    throw new Error(`${label} must be a safe integer from 0 to 100.`);
  }
}

const WARNING_CODES = new Set([
  "small-sample",
  "discrete-attainable-p",
  "ties-present",
  "zero-differences-present",
  "missing-pairs",
  "missing-complete-blocks",
  "signed-rank-symmetry-assumption",
  "independent-entity-assumption",
  "cluster-independence-unverified",
  "accumulated-trajectory-path-dependence",
  "arbitrary-axis-sign",
  "mr1-circularity",
]);

const REASON_CODES = new Set([
  "design-not-confirmed",
  "identity-not-confirmed",
  "identity-columns-invalid",
  "identity-component-empty",
  "time-column-invalid",
  "axes-invalid",
  "group-required",
  "group-invalid",
  "groups-must-differ",
  "period-invalid",
  "periods-must-differ",
  "at-least-three-periods-required",
  "empty-group",
  "insufficient-ranked-observations",
  "all-values-tied",
  "all-zero-differences",
  "no-complete-blocks",
]);

const RESOLVED_METHODS_BY_TEST = {
  "mann-whitney-u": new Set([
    "exact-classic",
    "exact-conditional-rank-permutation",
    "normal-approximation-tie-corrected",
  ]),
  "wilcoxon-signed-rank": new Set([
    "exact-classic",
    "exact-conditional-sign-flip",
    "normal-approximation-actual-ranks",
  ]),
  friedman: new Set([
    "exact-conditional-period-permutation",
    "chi-square-approximation-tie-corrected",
  ]),
} as const;

const INFERENCE_ROW_STATE_ERROR =
  "Inference row status, p-values, or method audit are inconsistent.";
const INFERENCE_RESOLVED_METHOD_AUDIT_ERROR =
  "Inference resolved p method, exact-tail, and continuity audit are inconsistent.";
const INFERENCE_ROW_REASON_ERROR =
  "Inference row not-estimable reason is inconsistent with its rank test.";
const INFERENCE_OVERALL_REASON_ERROR =
  "Inference overall reason does not match its planned rows.";
const INFERENCE_AVAILABLE_STATISTICS_ERROR =
  "Inference available row statistics are incomplete.";
const INFERENCE_ROW_COUNT_ERROR =
  "Inference row count audit is inconsistent.";
const INFERENCE_LEDGER_AUDIT_ERROR =
  "Inference inclusion ledger audit is inconsistent.";
const INFERENCE_EXACT_FIRST_ERROR =
  "Inference resolved p method is inconsistent with exact-first audit.";
const INFERENCE_MINIMUM_P_ERROR =
  "Inference Wilcoxon minimum attainable p audit is inconsistent with nNonzero.";
const INFERENCE_EXACT_TAIL_ERROR =
  "Inference exact-tail counts and raw p-value are inconsistent.";
const INFERENCE_HOLM_AUDIT_ERROR =
  "Inference Holm family adjustment audit is inconsistent.";

function validateWarnings(value: unknown, label: string) {
  validateStringArray(value, label);
  if ((value as string[]).some((warning) => !WARNING_CODES.has(warning))) {
    throw new Error(`${label} contains an unsupported warning code.`);
  }
}

function validateReason(value: unknown) {
  if (value !== null && (typeof value !== "string" || !REASON_CODES.has(value))) {
    throw new Error("Inference reason code is invalid.");
  }
}

const COMMON_RESULT_KEYS = [
  "schemaVersion", "kind", "analyzedAt", "request", "binding", "coordinateSystem",
  "provenance", "method", "status", "reason", "scope", "ledger", "families", "warnings",
] as const;
const COMMON_ROW_KEYS = [
  "test", "axisIndex", "axis", "status", "reason", "familyId", "memberId",
  "familySizePlanned", "pRaw", "pHolm", "holmRank", "holmMultiplier", "resolvedPMethod",
  "continuityCorrectionApplied", "tieGroupCount", "tiedObservationCount", "tieCorrectionSum",
  "warnings", "effectDirection", "exactTail",
] as const;
const MW_ROW_KEYS = [
  ...COMMON_ROW_KEYS, "nPrimary", "nSecondary", "medianPrimary", "medianSecondary", "uPrimary",
  "uSecondary", "z", "rankBiserialPrimaryVsSecondary",
] as const;
const WILCOXON_ROW_KEYS = [
  ...COMMON_ROW_KEYS, "earlierPeriodIndex", "laterPeriodIndex", "differenceDirection", "nMatched",
  "nMissing", "nPositive", "nNegative", "nZero", "nNonzero", "nRanked", "medianDifference",
  "q1Difference", "q3Difference", "iqrDifference", "wPositive", "wNegative", "t", "z",
  "rankBiserialLaterVsEarlier", "minimumAttainableTwoSidedP",
] as const;
const FRIEDMAN_ROW_KEYS = [
  ...COMMON_ROW_KEYS, "nComplete", "nMissingCompleteBlocks", "nPeriods", "q", "degreesFreedom",
  "kendallsW",
] as const;

function validateExactTail(value: unknown) {
  if (value === null) return;
  if (!isRecord(value)) throw new Error("Inference exact-tail audit is invalid.");
  exactKeys(value, ["extremeAssignmentCount", "totalAssignmentCount", "inclusive", "midP"], "Inference exact-tail audit");
  if (typeof value.extremeAssignmentCount !== "string"
    || typeof value.totalAssignmentCount !== "string"
    || value.extremeAssignmentCount.length === 0
    || value.totalAssignmentCount.length === 0
    || value.extremeAssignmentCount.length > MAX_INFERENCE_STRING_LENGTH
    || value.totalAssignmentCount.length > MAX_INFERENCE_STRING_LENGTH
    || !/^\d+$/u.test(value.extremeAssignmentCount)
    || !/^\d+$/u.test(value.totalAssignmentCount)
    || value.inclusive !== true
    || value.midP !== false) {
    throw new Error("Inference exact-tail audit is invalid.");
  }
}

type OpenEnaAggregateRankTest =
  | "mann-whitney-u"
  | "wilcoxon-signed-rank"
  | "friedman";

function finiteNumberFields(
  row: Record<string, unknown>,
  fields: readonly string[],
) {
  return fields.every((field) => (
    typeof row[field] === "number" && Number.isFinite(row[field])
  ));
}

function rowHasTies(row: Record<string, unknown>) {
  const tieGroupCount = row.tieGroupCount as number;
  const tiedObservationCount = row.tiedObservationCount as number;
  const tieCorrectionSum = row.tieCorrectionSum as number;
  const noTies = tieGroupCount === 0
    && tiedObservationCount === 0
    && tieCorrectionSum === 0;
  const coherentTies = tieGroupCount > 0
    && tiedObservationCount >= 2 * tieGroupCount
    && tieCorrectionSum >= 6 * tieGroupCount;
  if (!noTies && !coherentTies) throw new Error(INFERENCE_EXACT_FIRST_ERROR);
  return coherentTies;
}

function combinationCount(total: number, selected: number) {
  const size = Math.min(selected, total - selected);
  let count = BigInt(1);
  for (let index = 1; index <= size; index += 1) {
    count = count * BigInt(total - size + index) / BigInt(index);
  }
  return count;
}

function factorialCount(value: number) {
  let count = BigInt(1);
  for (let factor = 2; factor <= value; factor += 1) count *= BigInt(factor);
  return count;
}

function powerCountWithinLimit(base: bigint, exponent: number, limit: bigint) {
  let count = BigInt(1);
  for (let index = 0; index < exponent; index += 1) {
    count *= base;
    if (count > limit) return null;
  }
  return count;
}

function expectedResolvedMethod(
  row: Record<string, unknown>,
  test: OpenEnaAggregateRankTest,
  hasTies: boolean,
) {
  if (test === "mann-whitney-u") {
    const rankedN = (row.nPrimary as number) + (row.nSecondary as number);
    return rankedN <= 50
      ? hasTies ? "exact-conditional-rank-permutation" : "exact-classic"
      : "normal-approximation-tie-corrected";
  }
  if (test === "wilcoxon-signed-rank") {
    const rankedN = row.nNonzero as number;
    return rankedN <= 50
      ? !hasTies && row.nZero === 0 ? "exact-classic" : "exact-conditional-sign-flip"
      : "normal-approximation-actual-ranks";
  }
  const assignmentLimit = BigInt(1_000_000);
  const assignmentCount = powerCountWithinLimit(
    factorialCount(row.nPeriods as number),
    row.nComplete as number,
    assignmentLimit,
  );
  return assignmentCount !== null
    ? "exact-conditional-period-permutation"
    : "chi-square-approximation-tie-corrected";
}

function expectedExactAssignmentTotal(
  row: Record<string, unknown>,
  test: OpenEnaAggregateRankTest,
) {
  if (test === "mann-whitney-u") {
    const nPrimary = row.nPrimary as number;
    const nSecondary = row.nSecondary as number;
    return combinationCount(nPrimary + nSecondary, Math.min(nPrimary, nSecondary));
  }
  if (test === "wilcoxon-signed-rank") {
    return BigInt(1) << BigInt(row.nNonzero as number);
  }
  const count = powerCountWithinLimit(
    factorialCount(row.nPeriods as number),
    row.nComplete as number,
    BigInt(1_000_000),
  );
  if (count === null) throw new Error(INFERENCE_EXACT_TAIL_ERROR);
  return count;
}

function validateNotEstimableReason(
  row: Record<string, unknown>,
  test: OpenEnaAggregateRankTest,
) {
  if (row.status !== "not-estimable") return;
  const reason = row.reason;
  const valid = test === "mann-whitney-u"
    ? reason === "empty-group" || reason === "all-values-tied"
    : test === "wilcoxon-signed-rank"
      ? reason === "insufficient-ranked-observations"
        || reason === "all-zero-differences"
        || reason === "no-complete-blocks"
      : reason === "no-complete-blocks"
        || reason === "insufficient-ranked-observations"
        || reason === "all-values-tied";
  if (!valid) throw new Error(INFERENCE_ROW_REASON_ERROR);
}

function validateRowCounts(
  row: Record<string, unknown>,
  test: OpenEnaAggregateRankTest,
) {
  if (test === "mann-whitney-u") {
    const nPrimary = row.nPrimary as number;
    const nSecondary = row.nSecondary as number;
    if ((row.status === "available" && (nPrimary === 0 || nSecondary === 0))
      || (row.reason === "empty-group" && nPrimary > 0 && nSecondary > 0)
      || (row.reason === "all-values-tied" && (nPrimary === 0 || nSecondary === 0))) {
      throw new Error(INFERENCE_ROW_COUNT_ERROR);
    }
    return;
  }
  if (test === "wilcoxon-signed-rank") {
    const nMatched = row.nMatched as number;
    const nPositive = row.nPositive as number;
    const nNegative = row.nNegative as number;
    const nZero = row.nZero as number;
    const nNonzero = row.nNonzero as number;
    const nRanked = row.nRanked as number;
    if (nMatched !== nPositive + nNegative + nZero
      || nNonzero !== nPositive + nNegative
      || nRanked !== nNonzero
      || (row.status === "available" && nNonzero === 0)
      || (row.reason === "insufficient-ranked-observations" && nMatched !== 0)
      || (row.reason === "all-zero-differences"
        && (nMatched === 0 || nZero !== nMatched || nNonzero !== 0))) {
      throw new Error(INFERENCE_ROW_COUNT_ERROR);
    }
    return;
  }
  const nComplete = row.nComplete as number;
  const nPeriods = row.nPeriods as number;
  if ((row.status === "available" && (nComplete === 0 || nPeriods < 3))
    || (row.reason === "no-complete-blocks" && nComplete !== 0)
    || (row.reason === "insufficient-ranked-observations"
      && (nComplete === 0 || nPeriods >= 3))
    || (row.reason === "all-values-tied" && nComplete === 0)) {
    throw new Error(INFERENCE_ROW_COUNT_ERROR);
  }
}

function validateAvailableStatistics(
  row: Record<string, unknown>,
  test: OpenEnaAggregateRankTest,
) {
  if (row.status !== "available") return;
  const fields = test === "mann-whitney-u"
    ? [
        "medianPrimary", "medianSecondary", "uPrimary", "uSecondary", "z",
        "rankBiserialPrimaryVsSecondary",
      ]
    : test === "wilcoxon-signed-rank"
      ? [
          "medianDifference", "q1Difference", "q3Difference", "iqrDifference",
          "wPositive", "wNegative", "t", "z", "rankBiserialLaterVsEarlier",
        ]
      : ["q", "degreesFreedom", "kendallsW"];
  if (!finiteNumberFields(row, fields)) {
    throw new Error(INFERENCE_AVAILABLE_STATISTICS_ERROR);
  }
}

function validateMinimumAttainableP(row: Record<string, unknown>) {
  if (row.test !== "wilcoxon-signed-rank" || row.status !== "available") return;
  const audit = row.minimumAttainableTwoSidedP;
  const nNonzero = row.nNonzero as number;
  const expectedLog2 = 1 - nNonzero;
  const expectedNumeric = nNonzero <= 1_075 ? 2 ** expectedLog2 : null;
  if (!isRecord(audit)
    || audit.formula !== "2^(1-nNonzero)"
    || audit.log2 !== expectedLog2
    || audit.numeric !== expectedNumeric
    || (audit.numeric !== null
      && (typeof audit.numeric !== "number" || audit.numeric <= 0 || audit.numeric > 1))) {
    throw new Error(INFERENCE_MINIMUM_P_ERROR);
  }
}

function validateExactTailArithmetic(
  row: Record<string, unknown>,
  test: OpenEnaAggregateRankTest,
) {
  if (row.status !== "available"
    || typeof row.resolvedPMethod !== "string"
    || !row.resolvedPMethod.startsWith("exact-")) return;
  const audit = row.exactTail;
  if (!isRecord(audit)
    || typeof audit.extremeAssignmentCount !== "string"
    || typeof audit.totalAssignmentCount !== "string") {
    throw new Error(INFERENCE_EXACT_TAIL_ERROR);
  }
  const extreme = BigInt(audit.extremeAssignmentCount);
  const total = BigInt(audit.totalAssignmentCount);
  const maximumSafeCount = BigInt(Number.MAX_SAFE_INTEGER);
  if (extreme <= BigInt(0)
    || total <= BigInt(0)
    || extreme > total
    || extreme > maximumSafeCount
    || total > maximumSafeCount
    || total !== expectedExactAssignmentTotal(row, test)
    || row.pRaw !== Number(extreme) / Number(total)) {
    throw new Error(INFERENCE_EXACT_TAIL_ERROR);
  }
}

function validateRowSemanticAudit(
  row: Record<string, unknown>,
  test: OpenEnaAggregateRankTest,
) {
  validateNotEstimableReason(row, test);
  validateRowCounts(row, test);
  validateAvailableStatistics(row, test);
  const hasTies = rowHasTies(row);
  if (row.status === "available"
    && row.resolvedPMethod !== expectedResolvedMethod(row, test, hasTies)) {
    throw new Error(INFERENCE_EXACT_FIRST_ERROR);
  }
  validateMinimumAttainableP(row);
  validateExactTailArithmetic(row, test);
}

function validateRow(value: unknown, expectedTest: "mann-whitney-u" | "wilcoxon-signed-rank" | "friedman") {
  if (!isRecord(value) || value.test !== expectedTest) throw new Error("Inference result row is invalid.");
  exactKeys(
    value,
    expectedTest === "mann-whitney-u"
      ? MW_ROW_KEYS
      : expectedTest === "wilcoxon-signed-rank"
        ? WILCOXON_ROW_KEYS
        : FRIEDMAN_ROW_KEYS,
    "Inference result row",
  );
  if ((value.axisIndex !== 0 && value.axisIndex !== 1)
    || typeof value.axis !== "string"
    || value.axis.length === 0
    || value.axis.length > MAX_INFERENCE_STRING_LENGTH
    || (value.status !== "available" && value.status !== "not-estimable")
    || typeof value.familyId !== "string"
    || !/^openena-family-v2-[0-9a-f]{64}$/u.test(value.familyId)
    || typeof value.memberId !== "string"
    || !/^openena-member-v2-[0-9a-f]{64}$/u.test(value.memberId)
    || typeof value.familySizePlanned !== "number"
    || !Number.isSafeInteger(value.familySizePlanned)
    || value.familySizePlanned < 1
    || typeof value.continuityCorrectionApplied !== "boolean"
    || !Array.isArray(value.warnings)) {
    throw new Error("Inference result row is invalid.");
  }
  validateReason(value.reason);
  validateWarnings(value.warnings, "Inference row warnings");
  if (value.resolvedPMethod !== null
    && (typeof value.resolvedPMethod !== "string"
      || !RESOLVED_METHODS_BY_TEST[expectedTest].has(value.resolvedPMethod))) {
    throw new Error("Inference resolved p method is invalid.");
  }
  for (const key of ["tieGroupCount", "tiedObservationCount", "tieCorrectionSum"] as const) {
    nonNegativeInteger(value[key], `Inference ${key}`);
  }
  for (const key of ["pRaw", "pHolm", "holmRank", "holmMultiplier"] as const) finiteOrNull(value[key], `Inference ${key}`);
  if (!probabilityOrNull(value.pRaw) || !probabilityOrNull(value.pHolm)) {
    throw new Error("Inference p-values must be between zero and one.");
  }
  validateExactTail(value.exactTail);
  const numericFields = expectedTest === "mann-whitney-u"
    ? ["medianPrimary", "medianSecondary", "uPrimary", "uSecondary", "z", "rankBiserialPrimaryVsSecondary"]
    : expectedTest === "friedman"
      ? ["q", "degreesFreedom", "kendallsW"]
      : [
          "medianDifference", "q1Difference", "q3Difference", "iqrDifference", "wPositive",
          "wNegative", "t", "z", "rankBiserialLaterVsEarlier",
        ];
  for (const key of numericFields) finiteOrNull(value[key], `Inference ${key}`);
  const countFields = expectedTest === "mann-whitney-u"
    ? ["nPrimary", "nSecondary"]
    : expectedTest === "friedman"
      ? ["nComplete", "nMissingCompleteBlocks", "nPeriods"]
      : [
          "earlierPeriodIndex", "laterPeriodIndex", "nMatched", "nMissing", "nPositive", "nNegative",
          "nZero", "nNonzero", "nRanked",
        ];
  for (const key of countFields) nonNegativeInteger(value[key], `Inference ${key}`);
  if ((expectedTest === "mann-whitney-u" && value.effectDirection !== "positive-primary-higher-ranks")
    || (expectedTest === "friedman" && value.effectDirection !== "non-directional")
    || (expectedTest === "wilcoxon-signed-rank"
      && (value.effectDirection !== "positive-later-higher"
        || value.differenceDirection !== "later-minus-earlier"))) {
    throw new Error("Inference effect direction is invalid.");
  }
  const resolvedPMethod = typeof value.resolvedPMethod === "string"
    ? value.resolvedPMethod
    : null;
  const exactPMethod = resolvedPMethod?.startsWith("exact-") ?? false;
  const continuityCorrectedApproximation = resolvedPMethod === "normal-approximation-tie-corrected"
    || resolvedPMethod === "normal-approximation-actual-ranks";
  const uncorrectedApproximation = resolvedPMethod === "chi-square-approximation-tie-corrected";
  if ((value.pRaw === null) !== (value.pHolm === null)
    || (value.status === "available" && (
      value.reason !== null
      || value.pRaw === null
      || value.resolvedPMethod === null
      || (expectedTest === "wilcoxon-signed-rank"
        && value.minimumAttainableTwoSidedP === null)
    ))
    || (value.status === "not-estimable" && (
      value.reason === null
      || value.pRaw !== null
      || value.pHolm !== null
      || value.resolvedPMethod !== null
      || value.holmRank !== null
      || value.holmMultiplier !== null
      || value.exactTail !== null
      || value.continuityCorrectionApplied !== false
      || (expectedTest === "wilcoxon-signed-rank"
        && value.minimumAttainableTwoSidedP !== null)
    ))) {
    throw new Error(INFERENCE_ROW_STATE_ERROR);
  }
  if (value.status === "available" && (
    (exactPMethod && (
      value.exactTail === null
      || value.continuityCorrectionApplied !== false
    ))
    || (!exactPMethod
      && resolvedPMethod !== null
      && value.exactTail !== null)
    || (continuityCorrectedApproximation
      && value.continuityCorrectionApplied !== true)
    || (uncorrectedApproximation
      && value.continuityCorrectionApplied !== false)
  )) {
    throw new Error(INFERENCE_RESOLVED_METHOD_AUDIT_ERROR);
  }
  if (value.pRaw !== null
    && (typeof value.holmRank !== "number"
      || !Number.isSafeInteger(value.holmRank)
      || value.holmRank < 1
      || typeof value.holmMultiplier !== "number"
      || !Number.isSafeInteger(value.holmMultiplier)
      || value.holmMultiplier < 1)) {
    throw new Error("Inference Holm audit is invalid.");
  }
  if (expectedTest === "wilcoxon-signed-rank" && value.minimumAttainableTwoSidedP !== null) {
    if (!isRecord(value.minimumAttainableTwoSidedP)) {
      throw new Error("Inference minimum attainable p audit is invalid.");
    }
    exactKeys(
      value.minimumAttainableTwoSidedP,
      ["formula", "log2", "numeric"],
      "Inference minimum attainable p audit",
    );
    if (value.minimumAttainableTwoSidedP.formula !== "2^(1-nNonzero)") {
      throw new Error("Inference minimum attainable p audit is invalid.");
    }
    if (typeof value.minimumAttainableTwoSidedP.log2 !== "number"
      || !Number.isFinite(value.minimumAttainableTwoSidedP.log2)) {
      throw new Error("Inference minimum attainable p audit is invalid.");
    }
    finiteOrNull(value.minimumAttainableTwoSidedP.numeric, "Inference minimum attainable p");
  }
}

function validateRequest(value: unknown, kind: OpenEnaInferenceResultV2["kind"]) {
  if (!isRecord(value) || value.kind !== kind) throw new Error("Inference request is invalid.");
  const keys = kind === "endpoint-independent"
    ? ["kind", "primaryGroup", "secondaryGroup", "axes"]
    : kind === "trajectory-independent-period"
      ? ["kind", "repeatedEntityColumns", "timeColumn", "period", "primaryGroup", "secondaryGroup", "axes"]
      : kind === "trajectory-paired-periods"
        ? ["kind", "repeatedEntityColumns", "timeColumn", "group", "earlierPeriod", "laterPeriod", "axes", "cohortPolicy"]
        : ["kind", "repeatedEntityColumns", "timeColumn", "group", "periods", "axes", "cohortPolicy", "posthocContrasts"];
  exactKeys(value, keys, "Inference request");
  validateStringArray(value.axes, "Inference axes");
  (value.axes as string[]).forEach((axis) => nonEmptyString(axis, "Inference axis"));
  if ((value.axes as unknown[]).length !== 2
    || new Set(value.axes as string[]).size !== 2) throw new Error("Inference axes are invalid.");
  if (kind === "endpoint-independent") {
    nonEmptyString(value.primaryGroup, "Inference primary group");
    nonEmptyString(value.secondaryGroup, "Inference secondary group");
    return;
  }
  validateStringArray(value.repeatedEntityColumns, "Inference identity columns");
  if ((value.repeatedEntityColumns as string[]).length === 0
    || new Set(value.repeatedEntityColumns as string[]).size !== (value.repeatedEntityColumns as string[]).length) {
    throw new Error("Inference identity columns are invalid.");
  }
  nonEmptyString(value.timeColumn, "Inference time column");
  if (kind === "trajectory-independent-period") {
    nonEmptyString(value.period, "Inference period");
    nonEmptyString(value.primaryGroup, "Inference primary group");
    nonEmptyString(value.secondaryGroup, "Inference secondary group");
    return;
  }
  if (value.group !== null) nonEmptyString(value.group, "Inference group");
  if (kind === "trajectory-paired-periods") {
    nonEmptyString(value.earlierPeriod, "Inference earlier period");
    nonEmptyString(value.laterPeriod, "Inference later period");
    if (value.cohortPolicy !== "pairwise-complete") throw new Error("Inference cohort policy is invalid.");
    return;
  }
  validateStringArray(value.periods, "Inference periods");
  if ((value.periods as string[]).length < 3
    || new Set(value.periods as string[]).size !== (value.periods as string[]).length
    || value.cohortPolicy !== "all-period-complete"
    || value.posthocContrasts !== "all-period-pairs") {
    throw new Error("Repeated inference request is invalid.");
  }
}

function validateBinding(value: unknown) {
  if (!isRecord(value)) throw new Error("Inference binding is invalid.");
  exactKeys(
    value,
    ["analyzedAt", "dataset", "modelType", "configuration", "axes", "trajectoryMapping"],
    "Inference binding",
  );
  if (!("trajectoryMapping" in value)) throw new Error("Inference binding is incomplete.");
  if (!isRecord(value.dataset)) throw new Error("Inference dataset binding is invalid.");
  exactKeys(value.dataset, ["normalizedUtf8TextSha256", "hashKind"], "Inference dataset binding");
  if (typeof value.dataset.normalizedUtf8TextSha256 !== "string"
    || !/^[0-9a-f]{64}$/u.test(value.dataset.normalizedUtf8TextSha256)
    || (value.dataset.hashKind !== "normalized-utf8-text-sha256"
      && value.dataset.hashKind !== "normalized-utf8-csv-text-sha256"
      && value.dataset.hashKind !== "canonical-first-xlsx-worksheet-v1-sha256")
    || !isRecord(value.configuration)) {
    throw new Error("Inference binding is invalid.");
  }
  if (typeof value.analyzedAt !== "string"
    || !Number.isFinite(Date.parse(value.analyzedAt))
    || new Date(Date.parse(value.analyzedAt)).toISOString() !== value.analyzedAt
    || (value.modelType !== "EndPoint"
      && value.modelType !== "SeparateTrajectory"
      && value.modelType !== "AccumulatedTrajectory")) {
    throw new Error("Inference binding is invalid.");
  }
  exactKeys(value.configuration, [
    "unitColumns", "conversationColumns", "groupColumn", "codes", "model", "window",
    "windowSizeBack", "windowSizeForward", "weightBy", "rotation", "referenceRotationId",
    "centerAlignToOrigin",
  ], "Inference configuration binding");
  for (const required of [
    "unitColumns", "conversationColumns", "groupColumn", "codes", "model", "window",
    "windowSizeBack", "windowSizeForward", "weightBy", "rotation", "centerAlignToOrigin",
  ]) {
    if (!(required in value.configuration)) throw new Error("Inference configuration binding is incomplete.");
  }
  validateUniqueBoundedStringArray(
    value.configuration.unitColumns,
    "Inference unit columns",
    1,
    MAX_CONFIGURATION_COLUMNS,
  );
  validateUniqueBoundedStringArray(
    value.configuration.conversationColumns,
    "Inference conversation columns",
    1,
    MAX_CONFIGURATION_COLUMNS,
  );
  validateUniqueBoundedStringArray(
    value.configuration.codes,
    "Inference code columns",
    3,
    MAX_CONFIGURATION_CODES,
  );
  windowInteger(value.configuration.windowSizeBack, "Inference backward window");
  windowInteger(value.configuration.windowSizeForward, "Inference forward window");
  if ((value.configuration.model !== "EndPoint"
      && value.configuration.model !== "SeparateTrajectory"
      && value.configuration.model !== "AccumulatedTrajectory")
    || (value.configuration.window !== "MovingStanzaWindow"
      && value.configuration.window !== "Conversation")
    || (value.configuration.weightBy !== "binary" && value.configuration.weightBy !== "sum")
    || (value.configuration.rotation !== "svd"
      && value.configuration.rotation !== "mean"
      && value.configuration.rotation !== "reference")) {
    throw new Error("Inference configuration binding contains an unsupported model policy.");
  }
  if (value.configuration.rotation === "reference") {
    nonEmptyString(value.configuration.referenceRotationId, "Inference reference rotation ID");
    if (value.configuration.model !== "EndPoint") {
      throw new Error("Inference reference rotation configuration requires an endpoint model.");
    }
  } else if (value.configuration.referenceRotationId !== null) {
    throw new Error("Inference non-reference rotation configuration cannot retain a reference rotation ID.");
  }
  if (value.configuration.rotation === "mean" && value.configuration.model !== "EndPoint") {
    throw new Error("Inference mean rotation configuration requires an endpoint model.");
  }
  if (value.configuration.groupColumn !== null) {
    nonEmptyString(value.configuration.groupColumn, "Inference group column");
  }
  if (typeof value.configuration.centerAlignToOrigin !== "boolean") {
    throw new Error("Inference configuration binding is invalid.");
  }
  validateStringArray(value.axes, "Inference binding axes");
  if ((value.axes as unknown[]).length !== 2) throw new Error("Inference binding axes are invalid.");
  (value.axes as string[]).forEach((axis) => nonEmptyString(axis, "Inference binding axis"));
  if (value.trajectoryMapping !== null) {
    if (!isRecord(value.trajectoryMapping)) {
      throw new Error("Inference trajectory mapping is invalid.");
    }
    exactKeys(value.trajectoryMapping, [
      "contractVersion", "repeatedEntityColumns", "identityConfirmed", "timeColumn", "timeOrder",
    ], "Inference trajectory mapping");
    validateStringArray(
      value.trajectoryMapping.repeatedEntityColumns,
      "Inference trajectory identity columns",
    );
    validateStringArray(value.trajectoryMapping.timeOrder, "Inference trajectory time order");
    const repeatedEntityColumns = value.trajectoryMapping.repeatedEntityColumns as string[];
    const timeOrder = value.trajectoryMapping.timeOrder as string[];
    const unitColumns = value.configuration.unitColumns as string[];
    const conversationColumns = value.configuration.conversationColumns as string[];
    const groupColumn = value.configuration.groupColumn as string | null;
    if (value.trajectoryMapping.contractVersion !== 1
      || value.trajectoryMapping.identityConfirmed !== true
      || repeatedEntityColumns.length === 0
      || new Set(repeatedEntityColumns).size !== repeatedEntityColumns.length
      || repeatedEntityColumns.some((column) => column.length === 0 || column.length > 4_096)
      || repeatedEntityColumns.some((column) => !unitColumns.includes(column))
      || (groupColumn !== null
        && repeatedEntityColumns.length === 1
        && repeatedEntityColumns[0] === groupColumn
        && unitColumns.some((column) => column !== groupColumn))
      || typeof value.trajectoryMapping.timeColumn !== "string"
      || value.trajectoryMapping.timeColumn.length === 0
      || value.trajectoryMapping.timeColumn.length > 4_096
      || !conversationColumns.includes(value.trajectoryMapping.timeColumn)
      || timeOrder.length === 0
      || new Set(timeOrder).size !== timeOrder.length
      || timeOrder.some((period) => period.length === 0 || period.length > 4_096)) {
      throw new Error("Inference trajectory mapping is invalid.");
    }
  }
}

function validateFamilies(value: unknown) {
  if (!Array.isArray(value) || value.length > MAX_INFERENCE_ARRAY_LENGTH) {
    throw new Error("Inference families are invalid.");
  }
  for (const family of value) {
    if (!isRecord(family)) throw new Error("Inference family is invalid.");
    exactKeys(family, ["role", "familyId", "familySizePlanned", "memberIds"], "Inference family");
    if ((family.role !== "comparison" && family.role !== "omnibus" && family.role !== "posthoc")
      || typeof family.familyId !== "string"
      || !/^openena-family-v2-[0-9a-f]{64}$/u.test(family.familyId)
      || !Array.isArray(family.memberIds)
      || family.memberIds.length > MAX_INFERENCE_ARRAY_LENGTH
      || family.memberIds.some((member) => typeof member !== "string")
      || family.memberIds.some((member) => !/^openena-member-v2-[0-9a-f]{64}$/u.test(member))
      || new Set(family.memberIds).size !== family.memberIds.length
      || family.familySizePlanned !== family.memberIds.length) {
      throw new Error("Inference family is invalid.");
    }
  }
}

function validateMethod(value: unknown) {
  if (!isRecord(value)) throw new Error("Inference method policy is invalid.");
  exactKeys(value, [
    "alternative", "pValueMethod", "zeroMethod", "multiplicityCorrection",
    "rankPrecisionSignificantDigits", "exactMaxRankedN", "friedmanExactAssignmentLimit",
    "continuityCorrection",
  ], "Inference method policy");
  if (value.alternative !== "two-sided"
    || value.pValueMethod !== "auto-exact-first"
    || value.zeroMethod !== "wilcox"
    || value.multiplicityCorrection !== "holm"
    || value.rankPrecisionSignificantDigits !== 12
    || value.exactMaxRankedN !== 50
    || value.friedmanExactAssignmentLimit !== 1_000_000
    || value.continuityCorrection !== 0.5) {
    throw new Error("Inference method policy is invalid.");
  }
}

function validateScope(value: unknown, kind: OpenEnaInferenceResultV2["kind"]) {
  if (!isRecord(value)) throw new Error("Inference scope is invalid.");
  const keys = kind === "endpoint-independent"
    ? ["design", "analysisUnit", "temporalScope", "primaryGroup", "secondaryGroup"]
    : kind === "trajectory-independent-period"
      ? ["design", "analysisUnit", "timeColumn", "period", "primaryGroup", "secondaryGroup"]
      : kind === "trajectory-paired-periods"
        ? ["design", "analysisUnit", "timeColumn", "group", "earlierPeriod", "laterPeriod", "differenceDirection", "cohortPolicy"]
        : ["design", "analysisUnit", "timeColumn", "group", "periods", "cohortPolicy", "posthocContrasts"];
  exactKeys(value, keys, "Inference scope");
  if (kind === "endpoint-independent") {
    if (value.design !== "independent-endpoint-groups"
      || value.analysisUnit !== "endpoint-analytic-unit"
      || value.temporalScope !== "endpoint-common-period-not-verified") {
      throw new Error("Inference scope is invalid.");
    }
  } else if (kind === "trajectory-independent-period") {
    if (value.design !== "independent-groups-at-one-period"
      || value.analysisUnit !== "compact-entity-period-point") {
      throw new Error("Inference scope is invalid.");
    }
  } else if (kind === "trajectory-paired-periods") {
    if (value.design !== "same-entities-at-two-periods"
      || value.analysisUnit !== "repeated-entity"
      || value.differenceDirection !== "later-minus-earlier"
      || value.cohortPolicy !== "pairwise-complete") {
      throw new Error("Inference scope is invalid.");
    }
  } else if (value.design !== "same-entities-at-repeated-periods"
    || value.analysisUnit !== "repeated-entity"
    || value.cohortPolicy !== "all-period-complete"
    || value.posthocContrasts !== "all-period-pairs") {
    throw new Error("Inference scope is invalid.");
  }
}

function validateCountRecord(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
) {
  exactKeys(value, keys, label);
  for (const key of keys) nonNegativeInteger(value[key], `${label} ${key}`);
}

function validateLedger(value: unknown, kind: OpenEnaInferenceResultV2["kind"]) {
  if (value === null) return;
  if (!isRecord(value)) throw new Error("Inference ledger is invalid.");
  if (kind === "endpoint-independent") {
    validateCountRecord(value, [
      "candidateEntityCount", "primaryAvailableCount", "secondaryAvailableCount",
      "includedEntityCount", "includedAnalyticPointCount",
    ], "Endpoint inference ledger");
    return;
  }
  if (kind === "trajectory-independent-period") {
    validateCountRecord(value, [
      "candidateEntityCount", "primaryAvailableCount", "secondaryAvailableCount", "includedEntityCount",
      "includedCompactPointCount", "includedSourcePointCount",
    ], "Independent-period inference ledger");
    return;
  }
  if (kind === "trajectory-paired-periods") {
    const countKeys = [
      "candidateEntityCount", "earlierAvailableCount", "laterAvailableCount", "matchedEntityCount",
      "earlierOnlyCount", "laterOnlyCount", "missingPairCount", "earlierAvailableCompactPointCount",
      "laterAvailableCompactPointCount", "earlierAvailableSourcePointCount", "laterAvailableSourcePointCount",
      "matchedCompactPointCount", "matchedSourcePointCount",
    ] as const;
    exactKeys(value, [...countKeys, "axes"], "Paired inference ledger");
    for (const key of countKeys) nonNegativeInteger(value[key], `Paired inference ledger ${key}`);
    if (!Array.isArray(value.axes) || value.axes.length !== 2) throw new Error("Paired inference ledger axes are invalid.");
    for (const axis of value.axes) {
      if (!isRecord(axis)) throw new Error("Paired inference ledger axis is invalid.");
      validateCountRecord(axis, ["axisIndex", "zeroDifferenceCount", "nonzeroDifferenceCount", "rankedCount"], "Paired inference ledger axis");
      if (axis.axisIndex !== 0 && axis.axisIndex !== 1) throw new Error("Paired inference ledger axis is invalid.");
    }
    const axisIndexes = value.axes.map((axis) => (axis as Record<string, unknown>).axisIndex);
    if (new Set(axisIndexes).size !== 2
      || !axisIndexes.includes(0)
      || !axisIndexes.includes(1)) {
      throw new Error("Paired inference ledger axes are invalid.");
    }
    return;
  }
  const countKeys = [
    "candidateEntityCount", "completeBlockCount", "completeBlockCompactPointCount",
    "completeBlockSourcePointCount", "missingAnySelectedPeriodCount",
  ] as const;
  exactKeys(value, [...countKeys, "availableByPeriod"], "Repeated inference ledger");
  for (const key of countKeys) nonNegativeInteger(value[key], `Repeated inference ledger ${key}`);
  if (!Array.isArray(value.availableByPeriod)
    || value.availableByPeriod.length > MAX_INFERENCE_ARRAY_LENGTH) {
    throw new Error("Repeated inference ledger periods are invalid.");
  }
  for (const period of value.availableByPeriod) {
    if (!isRecord(period)) throw new Error("Repeated inference ledger period is invalid.");
    validateCountRecord(period, [
      "periodIndex", "availableEntityCount", "availableCompactPointCount", "availableSourcePointCount",
    ], "Repeated inference ledger period");
  }
}

function validateLedgerSemanticAudit(
  kind: OpenEnaInferenceResultV2["kind"],
  ledger: Record<string, unknown>,
  rows: readonly Record<string, unknown>[],
  request: Record<string, unknown>,
) {
  if (kind === "endpoint-independent") {
    const mannWhitneyRows = rows.filter((row) => row.test === "mann-whitney-u");
    const primary = ledger.primaryAvailableCount as number;
    const secondary = ledger.secondaryAvailableCount as number;
    const included = primary + secondary;
    if (ledger.candidateEntityCount !== included
      || ledger.includedEntityCount !== included
      || ledger.includedAnalyticPointCount !== included
      || mannWhitneyRows.some((row) => (
        row.nPrimary !== primary || row.nSecondary !== secondary
      ))) {
      throw new Error(INFERENCE_LEDGER_AUDIT_ERROR);
    }
    return;
  }

  if (kind === "trajectory-independent-period") {
    const primary = ledger.primaryAvailableCount as number;
    const secondary = ledger.secondaryAvailableCount as number;
    const included = primary + secondary;
    if ((ledger.candidateEntityCount as number) < included
      || ledger.includedEntityCount !== included
      || ledger.includedCompactPointCount !== included
      || (ledger.includedSourcePointCount as number) < included
      || rows.some((row) => row.nPrimary !== primary || row.nSecondary !== secondary)) {
      throw new Error(INFERENCE_LEDGER_AUDIT_ERROR);
    }
    return;
  }

  if (kind === "trajectory-paired-periods") {
    const candidate = ledger.candidateEntityCount as number;
    const earlierAvailable = ledger.earlierAvailableCount as number;
    const laterAvailable = ledger.laterAvailableCount as number;
    const matched = ledger.matchedEntityCount as number;
    const earlierOnly = ledger.earlierOnlyCount as number;
    const laterOnly = ledger.laterOnlyCount as number;
    const missing = candidate - matched;
    const axes = ledger.axes as Record<string, unknown>[];
    if (matched > earlierAvailable
      || matched > laterAvailable
      || earlierOnly !== earlierAvailable - matched
      || laterOnly !== laterAvailable - matched
      || candidate < earlierAvailable + laterAvailable - matched
      || ledger.missingPairCount !== missing
      || ledger.earlierAvailableCompactPointCount !== earlierAvailable
      || ledger.laterAvailableCompactPointCount !== laterAvailable
      || (ledger.earlierAvailableSourcePointCount as number) < earlierAvailable
      || (ledger.laterAvailableSourcePointCount as number) < laterAvailable
      || ledger.matchedCompactPointCount !== 2 * matched
      || (ledger.matchedSourcePointCount as number) < 2 * matched
      || rows.some((row) => row.nMatched !== matched || row.nMissing !== missing)
      || axes.some((axis) => {
        const row = rows.find((candidateRow) => candidateRow.axisIndex === axis.axisIndex);
        return !row
          || axis.zeroDifferenceCount !== row.nZero
          || axis.nonzeroDifferenceCount !== row.nNonzero
          || axis.rankedCount !== row.nRanked;
      })) {
      throw new Error(INFERENCE_LEDGER_AUDIT_ERROR);
    }
    return;
  }

  const periods = request.periods as string[];
  const periodCount = periods.length;
  const candidate = ledger.candidateEntityCount as number;
  const complete = ledger.completeBlockCount as number;
  const missing = ledger.missingAnySelectedPeriodCount as number;
  const availableByPeriod = ledger.availableByPeriod as Record<string, unknown>[];
  const omnibusRows = rows.filter((row) => row.test === "friedman");
  const followupRows = rows.filter((row) => row.test === "wilcoxon-signed-rank");
  if (candidate !== complete + missing
    || ledger.completeBlockCompactPointCount !== complete * periodCount
    || (ledger.completeBlockSourcePointCount as number) < complete * periodCount
    || availableByPeriod.some((period) => (
      (period.availableEntityCount as number) < complete
      || period.availableCompactPointCount !== period.availableEntityCount
      || (period.availableSourcePointCount as number) < (period.availableCompactPointCount as number)
    ))
    || omnibusRows.some((row) => (
      row.nComplete !== complete || row.nMissingCompleteBlocks !== missing
    ))
    || followupRows.some((row) => row.nMatched !== complete || row.nMissing !== 0)) {
    throw new Error(INFERENCE_LEDGER_AUDIT_ERROR);
  }
}

function validateLongitudinalReasonContext(
  kind: OpenEnaInferenceResultV2["kind"],
  ledger: Record<string, unknown>,
  rows: readonly Record<string, unknown>[],
) {
  if (kind === "trajectory-paired-periods"
    && rows.some((row) => row.reason === "no-complete-blocks")) {
    throw new Error(INFERENCE_ROW_REASON_ERROR);
  }
  if (kind !== "trajectory-repeated-periods") return;
  const noCompleteBlocks = ledger.completeBlockCount === 0;
  if (rows.some((row) => (
    noCompleteBlocks
      ? row.reason !== "no-complete-blocks"
      : row.reason === "no-complete-blocks"
  ))) {
    throw new Error(INFERENCE_ROW_REASON_ERROR);
  }
}

function expectedOverallReason(
  rows: readonly Record<string, unknown>[],
  preferred?: string,
) {
  if (rows.some((row) => row.status === "available")) return null;
  if (preferred) return preferred;
  const reasons = [...new Set(rows.map((row) => row.reason).filter((reason) => reason !== null))];
  return reasons.length === 1 ? reasons[0] : "insufficient-ranked-observations";
}

function validateOverallSemanticAudit(
  result: Record<string, unknown>,
  kind: OpenEnaInferenceResultV2["kind"],
  rows: readonly Record<string, unknown>[],
  ledger: Record<string, unknown>,
) {
  const determinantRows = kind === "trajectory-repeated-periods"
    ? rows.filter((row) => row.test === "friedman")
    : rows;
  const expectedStatus = determinantRows.some((row) => row.status === "available")
    ? "available"
    : "not-estimable";
  const preferred = kind === "trajectory-repeated-periods"
    && ledger.completeBlockCount === 0
    ? "no-complete-blocks"
    : undefined;
  if (result.status !== expectedStatus
    || result.reason !== expectedOverallReason(determinantRows, preferred)) {
    throw new Error(INFERENCE_OVERALL_REASON_ERROR);
  }
}

function validateHolmSemanticAudit(
  families: readonly Record<string, unknown>[],
  rows: readonly Record<string, unknown>[],
) {
  for (const family of families) {
    const familyRows = rows.filter((row) => row.familyId === family.familyId);
    const ordered = familyRows
      .map((row) => ({ row, effectiveP: row.pRaw === null ? 1 : row.pRaw as number }))
      .sort((left, right) => left.effectiveP - right.effectiveP
        || (left.row.memberId as string).localeCompare(right.row.memberId as string));
    let runningMaximum = 0;
    for (let index = 0; index < ordered.length; index += 1) {
      const { row, effectiveP } = ordered[index];
      const multiplier = ordered.length - index;
      runningMaximum = Math.min(1, Math.max(runningMaximum, multiplier * effectiveP));
      const nullMember = row.pRaw === null;
      if (row.familySizePlanned !== ordered.length
        || row.pHolm !== (nullMember ? null : runningMaximum)
        || row.holmRank !== (nullMember ? null : index + 1)
        || row.holmMultiplier !== (nullMember ? null : multiplier)) {
        throw new Error(INFERENCE_HOLM_AUDIT_ERROR);
      }
    }
  }
}

function assertNoIndividualEvidence(value: unknown, seen = new Set<unknown>()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) assertNoIndividualEvidence(item, seen);
    return;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (/^(?:entityToken|entityId|points|pairs|blocks|differences|pairedDifferences)$/u.test(key)) {
      throw new Error("Inference result contains forbidden individual evidence.");
    }
    assertNoIndividualEvidence(nested, seen);
  }
}

function deepFreeze<T>(value: T, seen = new Set<unknown>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

/** Strict aggregate inference reader used by schema-v2 result-bundle parsing. */
export function parseOpenEnaInferenceResultV2(value: unknown): OpenEnaInferenceResultV2 {
  assertPlainInferenceJsonData(value);
  if (!isRecord(value) || value.schemaVersion !== 2) throw new Error("Inference result schema v2 is required.");
  const kind = value.kind;
  if (kind !== "endpoint-independent"
    && kind !== "trajectory-independent-period"
    && kind !== "trajectory-paired-periods"
    && kind !== "trajectory-repeated-periods") {
    throw new Error("Inference result kind is unsupported.");
  }
  exactKeys(
    value,
    kind === "trajectory-repeated-periods"
      ? [...COMMON_RESULT_KEYS, "omnibusRows", "followupRows"]
      : [...COMMON_RESULT_KEYS, "rows"],
    "Inference result",
  );
  validateRequest(value.request, kind);
  if (kind === "trajectory-repeated-periods") {
    if (!Array.isArray(value.omnibusRows)
      || !Array.isArray(value.followupRows)
      || value.omnibusRows.length > MAX_INFERENCE_ARRAY_LENGTH
      || value.followupRows.length > MAX_INFERENCE_ARRAY_LENGTH) {
      throw new Error("Repeated inference rows exceed the bounded aggregate row budget.");
    }
    const periodCount = ((value.request as Record<string, unknown>).periods as string[]).length;
    const plannedFollowupCount = periodCount * (periodCount - 1);
    if (!Number.isSafeInteger(plannedFollowupCount)
      || plannedFollowupCount > MAX_INFERENCE_ARRAY_LENGTH) {
      throw new Error("Repeated inference exceeds the bounded aggregate row budget.");
    }
  } else if (!Array.isArray(value.rows)
    || value.rows.length > MAX_INFERENCE_ARRAY_LENGTH) {
    throw new Error("Inference rows exceed the bounded aggregate row budget.");
  }
  validateBinding(value.binding);
  validateFamilies(value.families);
  validateWarnings(value.warnings, "Inference warnings");
  validateMethod(value.method);
  validateScope(value.scope, kind);
  validateLedger(value.ledger, kind);
  validateReason(value.reason);
  if (value.coordinateSystem !== "unflipped-model-coordinates"
    || value.provenance !== "ENA.HK post-projection inference"
    || typeof value.analyzedAt !== "string"
    || !Number.isFinite(Date.parse(value.analyzedAt))
    || new Date(Date.parse(value.analyzedAt)).toISOString() !== value.analyzedAt
    || (value.status !== "available" && value.status !== "not-estimable" && value.status !== "disabled")) {
    throw new Error("Inference result metadata is invalid.");
  }
  const parsedRows: Record<string, unknown>[] = [];
  if (kind === "trajectory-repeated-periods") {
    if (!Array.isArray(value.omnibusRows) || !Array.isArray(value.followupRows)) {
      throw new Error("Repeated inference rows are invalid.");
    }
    value.omnibusRows.forEach((row) => validateRow(row, "friedman"));
    value.followupRows.forEach((row) => validateRow(row, "wilcoxon-signed-rank"));
    parsedRows.push(...value.omnibusRows as Record<string, unknown>[], ...value.followupRows as Record<string, unknown>[]);
  } else {
    if (!Array.isArray(value.rows)) throw new Error("Inference rows are invalid.");
    const test = kind === "trajectory-paired-periods" ? "wilcoxon-signed-rank" : "mann-whitney-u";
    value.rows.forEach((row) => validateRow(row, test));
    parsedRows.push(...value.rows as Record<string, unknown>[]);
  }
  if (kind !== "trajectory-repeated-periods" && value.status !== "disabled") {
    const axisIndexes = parsedRows.map((row) => row.axisIndex);
    if (parsedRows.length !== 2 || new Set(axisIndexes).size !== 2
      || !axisIndexes.includes(0) || !axisIndexes.includes(1)) {
      throw new Error("Inference comparison row axis cardinality is invalid.");
    }
  } else if (kind === "trajectory-repeated-periods" && value.status !== "disabled") {
    const omnibusRows = value.omnibusRows as Record<string, unknown>[];
    const omnibusAxisIndexes = omnibusRows.map((row) => row.axisIndex);
    if (omnibusRows.length !== 2 || new Set(omnibusAxisIndexes).size !== 2
      || !omnibusAxisIndexes.includes(0) || !omnibusAxisIndexes.includes(1)) {
      throw new Error("Friedman omnibus row axis cardinality is invalid.");
    }
    const periods = (value.request as Record<string, unknown>).periods as string[];
    const expectedFollowupKeys = new Set<string>();
    for (const axisIndex of [0, 1]) {
      for (let earlierPeriodIndex = 0; earlierPeriodIndex < periods.length; earlierPeriodIndex += 1) {
        for (let laterPeriodIndex = earlierPeriodIndex + 1; laterPeriodIndex < periods.length; laterPeriodIndex += 1) {
          expectedFollowupKeys.add(`${axisIndex}:${earlierPeriodIndex}:${laterPeriodIndex}`);
        }
      }
    }
    const followupRows = value.followupRows as Record<string, unknown>[];
    const actualFollowupKeys = followupRows.map((row) => (
      `${row.axisIndex}:${row.earlierPeriodIndex}:${row.laterPeriodIndex}`
    ));
    if (actualFollowupKeys.length !== expectedFollowupKeys.size
      || new Set(actualFollowupKeys).size !== actualFollowupKeys.length
      || actualFollowupKeys.some((key) => !expectedFollowupKeys.has(key))) {
      throw new Error("Wilcoxon all-period-pairs follow-up row cardinality is invalid.");
    }
  }
  const request = value.request as Record<string, unknown>;
  const binding = value.binding as Record<string, unknown>;
  const scope = value.scope as Record<string, unknown>;
  const bindingAxes = binding.axes as string[];
  const requestAxes = request.axes as string[];
  if (value.analyzedAt !== binding.analyzedAt
    || !sameAxes(bindingAxes, requestAxes)
    || (binding.configuration as Record<string, unknown>).model !== binding.modelType
    || parsedRows.some((row) => row.axis !== requestAxes[row.axisIndex as number])) {
    throw new Error("Inference result binding and rows are inconsistent.");
  }
  const scopeMatchesRequest = kind === "endpoint-independent"
    ? scope.primaryGroup === request.primaryGroup && scope.secondaryGroup === request.secondaryGroup
    : kind === "trajectory-independent-period"
      ? scope.timeColumn === request.timeColumn
        && scope.period === request.period
        && scope.primaryGroup === request.primaryGroup
        && scope.secondaryGroup === request.secondaryGroup
      : kind === "trajectory-paired-periods"
        ? scope.timeColumn === request.timeColumn
          && scope.group === request.group
          && scope.earlierPeriod === request.earlierPeriod
          && scope.laterPeriod === request.laterPeriod
          && scope.cohortPolicy === request.cohortPolicy
        : scope.timeColumn === request.timeColumn
          && scope.group === request.group
          && sameUnknownArrays(scope.periods, request.periods)
          && scope.cohortPolicy === request.cohortPolicy
          && scope.posthocContrasts === request.posthocContrasts;
  if (!scopeMatchesRequest) throw new Error("Inference request and scope are inconsistent.");
  if (!trajectoryMappingMatchesRequest(value as unknown as OpenEnaInferenceResultV2)) {
    throw new Error("Inference trajectory mapping is inconsistent.");
  }
  if (value.status !== "disabled") {
    if (value.ledger === null) {
      throw new Error("Non-disabled inference requires an aggregate inclusion ledger.");
    }
    const modelType = binding.modelType;
    if ((kind === "endpoint-independent" && modelType !== "EndPoint")
      || (kind !== "endpoint-independent" && modelType === "EndPoint")) {
      throw new Error("Inference design and model are inconsistent.");
    }
    if ((kind === "endpoint-independent" || kind === "trajectory-independent-period")
      && request.primaryGroup === request.secondaryGroup) {
      throw new Error("Independent inference groups must be distinct.");
    }
    if (kind === "trajectory-paired-periods") {
      if (request.earlierPeriod === request.laterPeriod) {
        throw new Error("Paired inference periods must be distinct.");
      }
      const mapping = binding.trajectoryMapping as Record<string, unknown>;
      const timeOrder = mapping.timeOrder as string[];
      const earlierPeriodIndex = timeOrder.indexOf(request.earlierPeriod as string);
      const laterPeriodIndex = timeOrder.indexOf(request.laterPeriod as string);
      if (parsedRows.some((row) => (
        row.earlierPeriodIndex !== earlierPeriodIndex
        || row.laterPeriodIndex !== laterPeriodIndex
      ))) {
        throw new Error("Paired inference row period indexes are inconsistent.");
      }
    }
    if (kind === "trajectory-repeated-periods") {
      const periods = request.periods as string[];
      const omnibusRows = value.omnibusRows as Record<string, unknown>[];
      if (omnibusRows.some((row) => (
        row.nPeriods !== periods.length
        || row.degreesFreedom !== periods.length - 1
      ))) {
        throw new Error("Friedman period metadata is inconsistent.");
      }
      const availableByPeriod = (value.ledger as Record<string, unknown>).availableByPeriod as Array<Record<string, unknown>>;
      const availablePeriodIndexes = availableByPeriod.map((period) => period.periodIndex);
      const timeOrder = ((binding.trajectoryMapping as Record<string, unknown>).timeOrder as string[]);
      const expectedPeriodIndexes = periods.map((period) => timeOrder.indexOf(period));
      if (availablePeriodIndexes.length !== periods.length
        || availablePeriodIndexes.some((periodIndex, index) => (
          typeof periodIndex !== "number"
          || !Number.isSafeInteger(periodIndex)
          || periodIndex !== expectedPeriodIndexes[index]
        ))) {
        throw new Error("Repeated inference ledger period cardinality is invalid.");
      }
    }
    for (const row of parsedRows) {
      validateRowSemanticAudit(row, row.test as OpenEnaAggregateRankTest);
    }
    const aggregateLedger = value.ledger as Record<string, unknown>;
    validateLedgerSemanticAudit(kind, aggregateLedger, parsedRows, request);
    validateLongitudinalReasonContext(kind, aggregateLedger, parsedRows);
    validateOverallSemanticAudit(value, kind, parsedRows, aggregateLedger);
  }
  const families = value.families as Record<string, unknown>[];
  const familyById = new Map(families.map((family) => [family.familyId, family]));
  if (new Set(familyById.keys()).size !== families.length) throw new Error("Inference families are duplicated.");
  if (value.status !== "disabled") {
    if (kind !== "trajectory-repeated-periods") {
      if (families.length !== 1
        || families[0].role !== "comparison"
        || families[0].familySizePlanned !== 2) {
        throw new Error("Inference comparison family cardinality is invalid.");
      }
    } else {
      const omnibusFamilies = families.filter((family) => family.role === "omnibus");
      const posthocFamilies = families.filter((family) => family.role === "posthoc");
      const periodCount = ((value.request as Record<string, unknown>).periods as string[]).length;
      const posthocSize = 2 * periodCount * (periodCount - 1) / 2;
      if (families.length !== 2
        || omnibusFamilies.length !== 1
        || posthocFamilies.length !== 1
        || omnibusFamilies[0].familySizePlanned !== 2
        || posthocFamilies[0].familySizePlanned !== posthocSize) {
        throw new Error("Repeated inference planned family cardinality is invalid.");
      }
    }
  }
  for (const row of parsedRows) {
    const family = familyById.get(row.familyId);
    const expectedFamilyRole = kind !== "trajectory-repeated-periods"
      ? "comparison"
      : row.test === "friedman" ? "omnibus" : "posthoc";
    if (!family
      || family.role !== expectedFamilyRole
      || row.familySizePlanned !== family.familySizePlanned
      || !(family.memberIds as string[]).includes(row.memberId as string)) {
      throw new Error("Inference row family membership is invalid.");
    }
  }
  const rowMemberIds = new Set(parsedRows.map((row) => row.memberId));
  if (rowMemberIds.size !== parsedRows.length) {
    throw new Error("Inference rows contain a duplicate planned member.");
  }
  if (families.some((family) => (family.memberIds as string[]).some((member) => !rowMemberIds.has(member)))) {
    throw new Error("Inference family contains an unknown planned member.");
  }
  if (value.status !== "disabled") {
    validateHolmSemanticAudit(families, parsedRows);
  } else if (value.reason === null
      || value.ledger !== null
      || parsedRows.length !== 0
      || families.length !== 0) {
    throw new Error("Inference overall status is inconsistent.");
  }
  assertNoIndividualEvidence(value);
  return deepFreeze(value as unknown as OpenEnaInferenceResultV2);
}

/**
 * Producer-only authority gate. Strict schema parsing deliberately remains a
 * separate reader contract so valid imported v2 JSON stays readable, while an
 * imported or cloned value cannot be reused as the current coordinator result
 * by exports, Methods, CSV, or AI consumers.
 */
export function assertOpenEnaInferenceCoordinatorConsumerV2(
  value: unknown,
): OpenEnaInferenceResultV2 {
  const parsed = parseOpenEnaInferenceResultV2(value);
  if (parsed !== value) throw new Error("Inference consumer authority mismatch.");
  assertOpenEnaInferenceCoordinatorAuthorityV2(parsed);
  return parsed;
}
