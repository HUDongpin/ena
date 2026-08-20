import type { Scalar } from "jena-js";
import type {
  OpenEnaFriedmanInferenceRowV2,
  OpenEnaInferenceFamilyV2,
  OpenEnaInferenceResultV2,
  OpenEnaMannWhitneyInferenceRowV2,
  OpenEnaWilcoxonInferenceRowV2,
} from "./inference-v2";
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
}

const BINDING_MISMATCH = "Inference consumer binding mismatch.";

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

function isDeeplyFrozen(value: unknown, seen = new Set<unknown>()): boolean {
  if (value === null || typeof value !== "object" || seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Object.values(value as Record<string, unknown>)
    .every((nested) => isDeeplyFrozen(nested, seen));
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
    || !sameAxes(inference.request.axes, expected.axes)) {
    throw new Error(BINDING_MISMATCH);
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
  const unexpected = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unexpected) throw new Error(`${label} contains an unsupported field.`);
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
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be a string array.`);
  }
}

function nonEmptyString(value: unknown, label: string) {
  if (typeof value !== "string" || value.length === 0 || value.length > 4_096) {
    throw new Error(`${label} must be a bounded non-empty string.`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
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

const RESOLVED_METHODS = new Set([
  "exact-classic",
  "exact-conditional-rank-permutation",
  "normal-approximation-tie-corrected",
  "exact-conditional-sign-flip",
  "normal-approximation-actual-ranks",
  "exact-conditional-period-permutation",
  "chi-square-approximation-tie-corrected",
]);

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
    || !/^\d+$/u.test(value.extremeAssignmentCount)
    || !/^\d+$/u.test(value.totalAssignmentCount)
    || value.inclusive !== true
    || value.midP !== false) {
    throw new Error("Inference exact-tail audit is invalid.");
  }
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
    && (typeof value.resolvedPMethod !== "string" || !RESOLVED_METHODS.has(value.resolvedPMethod))) {
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
  if ((value.pRaw === null) !== (value.pHolm === null)
    || (value.status === "available" && value.pRaw === null)
    || (value.status === "not-estimable" && value.reason === null)) {
    throw new Error("Inference row status and p-values are inconsistent.");
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
  exactKeys(value, ["analyzedAt", "dataset", "modelType", "configuration", "axes"], "Inference binding");
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
  validateStringArray(value.configuration.unitColumns, "Inference unit columns");
  validateStringArray(value.configuration.conversationColumns, "Inference conversation columns");
  validateStringArray(value.configuration.codes, "Inference code columns");
  if (value.configuration.groupColumn !== null) {
    nonEmptyString(value.configuration.groupColumn, "Inference group column");
  }
  if (typeof value.configuration.centerAlignToOrigin !== "boolean") {
    throw new Error("Inference configuration binding is invalid.");
  }
  validateStringArray(value.axes, "Inference binding axes");
  if ((value.axes as unknown[]).length !== 2) throw new Error("Inference binding axes are invalid.");
}

function validateFamilies(value: unknown) {
  if (!Array.isArray(value)) throw new Error("Inference families are invalid.");
  for (const family of value) {
    if (!isRecord(family)) throw new Error("Inference family is invalid.");
    exactKeys(family, ["role", "familyId", "familySizePlanned", "memberIds"], "Inference family");
    if ((family.role !== "comparison" && family.role !== "omnibus" && family.role !== "posthoc")
      || typeof family.familyId !== "string"
      || !/^openena-family-v2-[0-9a-f]{64}$/u.test(family.familyId)
      || !Array.isArray(family.memberIds)
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
    return;
  }
  const countKeys = [
    "candidateEntityCount", "completeBlockCount", "completeBlockCompactPointCount",
    "completeBlockSourcePointCount", "missingAnySelectedPeriodCount",
  ] as const;
  exactKeys(value, [...countKeys, "availableByPeriod"], "Repeated inference ledger");
  for (const key of countKeys) nonNegativeInteger(value[key], `Repeated inference ledger ${key}`);
  if (!Array.isArray(value.availableByPeriod)) throw new Error("Repeated inference ledger periods are invalid.");
  for (const period of value.availableByPeriod) {
    if (!isRecord(period)) throw new Error("Repeated inference ledger period is invalid.");
    validateCountRecord(period, [
      "periodIndex", "availableEntityCount", "availableCompactPointCount", "availableSourcePointCount",
    ], "Repeated inference ledger period");
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
  const families = value.families as Record<string, unknown>[];
  const familyById = new Map(families.map((family) => [family.familyId, family]));
  if (new Set(familyById.keys()).size !== families.length) throw new Error("Inference families are duplicated.");
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
  if (families.some((family) => (family.memberIds as string[]).some((member) => !rowMemberIds.has(member)))) {
    throw new Error("Inference family contains an unknown planned member.");
  }
  if ((value.status === "available") !== parsedRows.some((row) => row.status === "available")
    || (value.status === "available" && value.reason !== null)
    || (value.status === "disabled" && (value.reason === null
      || value.ledger !== null
      || parsedRows.length !== 0
      || families.length !== 0))) {
    throw new Error("Inference overall status is inconsistent.");
  }
  assertNoIndividualEvidence(value);
  return deepFreeze(value as unknown as OpenEnaInferenceResultV2);
}
