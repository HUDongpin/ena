import {
  canonicalJsonV3,
  deepFreezeV3,
  snapshotDenseJsonArrayV3,
  snapshotPlainJsonRecordV3,
} from "./canonical-json";
import { accumulateData, sphereNorm } from "jena-js";
import type { Row } from "jena-js";
import { svdRotation } from "jena-js/rotation";
import { scalarIdentityV3 } from "./identity";
import { OrderingDomainErrorV3, resolveHorizonOrderV3, resolveRowOrderV3 } from "./ordering";
import {
  MAX_ESTIMATED_EXPORT_BYTES_V3,
  MAX_ESTIMATED_NUMERIC_CELLS_V3,
  MAX_ESTIMATED_PEAK_BYTES_V3,
  MAX_ESTIMATED_WINDOW_VISITS_V3,
  estimateStandardResourcesV3,
} from "./resource-budget";
import type { StandardResourceEstimateV3 } from "./resource-budget";
import { datasetHashKindFor } from "../types";
import type { ParsedDataset, DatasetHashKind } from "../types";
import type {
  BackwardExtentV3,
  CanonicalHorizonOrderV3,
  CanonicalRowOrderV3,
  DatasetBindingV3,
  ForwardExtentV3,
  OrderComparatorV3,
  OrderKeyV3,
  ScalarIdentityV3,
  StandardEnaDraftV3,
  StandardModelTypeV3,
} from "./types";

export type ModelCapabilityV3 =
  | "build-model"
  | "export-current-model"
  | "export-reference"
  | "group-inference"
  | "trajectory-inference"
  | "longitudinal-comparison"
  | "ai-interpretation";

export const MODEL_DIAGNOSTIC_IDS_V3 = Object.freeze([
  "STANDARD_DATASET_BINDING_INVALID",
  "STANDARD_UNITS_REQUIRED",
  "STANDARD_HORIZONS_REQUIRED",
  "STANDARD_IDENTITY_MISSING",
  "STANDARD_IDENTITY_VALUE_UNSUPPORTED",
  "STANDARD_CODES_TOO_FEW",
  "STANDARD_CODES_DUPLICATE_SELECTION",
  "STANDARD_CODE_FIELD_MISSING",
  "STANDARD_CODE_ROLE_COLLISION",
  "STANDARD_CODE_VALUE_INVALID",
  "STANDARD_CODE_ALL_ZERO",
  "STANDARD_CODE_ISOLATED",
  "STANDARD_CODE_DUPLICATE_PROFILE",
  "STANDARD_NO_GLOBAL_COOCCURRENCE",
  "STANDARD_GROUP_FIELD_MISSING",
  "STANDARD_GROUP_UNSTABLE_WITHIN_UNIT",
  "STANDARD_HORIZON_SHARED_BY_MULTIPLE_UNITS",
  "STANDARD_ROW_ORDER_REQUIRED",
  "STANDARD_ROW_ORDER_INVALID",
  "STANDARD_HORIZON_ORDER_REQUIRED",
  "STANDARD_HORIZON_ORDER_INVALID",
  "STANDARD_HORIZON_ORDER_UNRESOLVED_TIE",
  "STANDARD_SOURCE_ORDER_CONFIRMATION_STALE",
  "STANDARD_MEANS_REQUIRES_ENDPOINT",
  "STANDARD_MEANS_GROUP_REQUIRED",
  "STANDARD_MEANS_LEVEL_REQUIRED",
  "STANDARD_MEANS_LEVEL_EMPTY",
  "STANDARD_MEANS_IDENTICAL",
  "STANDARD_TRAJECTORY_HAS_NO_PATH",
  "STANDARD_TRAJECTORY_SINGLE_STEP_UNITS",
  "STANDARD_TARGET_RANK_ZERO",
  "STANDARD_SVD_ONE_DIMENSIONAL",
  "STANDARD_REFERENCE_MISSING",
  "STANDARD_REFERENCE_INCOMPATIBLE",
  "STANDARD_REFERENCE_TARGET_DEGENERATE",
  "STANDARD_OUTPUT_NONFINITE",
  "RESOURCE_BUDGET_EXCEEDED",
] as const);

export type ModelDiagnosticIdV3 = typeof MODEL_DIAGNOSTIC_IDS_V3[number];

export const MODEL_SUGGESTED_ACTION_IDS_V3 = Object.freeze([
  "exclude-code",
  "replace-row-order",
  "replace-horizon-order",
  "select-endpoint",
  "select-svd",
  "select-reference",
  "clear-group",
] as const);

export type ModelSuggestedActionIdV3 = typeof MODEL_SUGGESTED_ACTION_IDS_V3[number];
export type ModelDiagnosticSeverityV3 = "error" | "warning" | "information";
export type ModelDiagnosticScopeV3 =
  | "dataset"
  | "units"
  | "horizons"
  | "windows"
  | "codes"
  | "rotation"
  | "reference"
  | "resources"
  | "migration";

export interface ModelEvidenceSampleV3 {
  readonly rowIndex?: number;
  readonly identity?: string;
  readonly detail: string;
}

export interface ModelEvidenceV3 {
  readonly totalCount: number;
  readonly sampleLimit: 5;
  readonly samples: readonly ModelEvidenceSampleV3[];
  readonly truncated: boolean;
}

export type ModelDeepReadonlyV3<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? { readonly [Index in keyof T]: ModelDeepReadonlyV3<T[Index]> }
    : T extends object
      ? { readonly [Key in keyof T]: ModelDeepReadonlyV3<T[Key]> }
      : T;

export type ModelDraftPatchV3 =
  | { readonly type: "exclude-code"; readonly code: string }
  | { readonly type: "replace-row-order"; readonly value: ModelDeepReadonlyV3<CanonicalRowOrderV3> }
  | { readonly type: "replace-horizon-order"; readonly value: ModelDeepReadonlyV3<CanonicalHorizonOrderV3> }
  | { readonly type: "select-model"; readonly value: StandardModelTypeV3 }
  | { readonly type: "select-rotation"; readonly value: "svd" | "reference" }
  | { readonly type: "clear-group" };

export interface ModelSuggestedActionV3 {
  readonly id: ModelSuggestedActionIdV3;
  readonly label: string;
  readonly confirmationText: string;
  readonly confirmationRequired: true;
  readonly patch: ModelDraftPatchV3;
}

export interface ModelDiagnosticV3 {
  readonly id: ModelDiagnosticIdV3;
  readonly severity: ModelDiagnosticSeverityV3;
  readonly scope: ModelDiagnosticScopeV3;
  readonly fieldPath?: string;
  readonly summary: string;
  readonly detail: string;
  readonly blocks: readonly ModelCapabilityV3[];
  readonly evidence?: ModelEvidenceV3;
  readonly suggestedActions?: readonly ModelSuggestedActionV3[];
}

type DiagnosticInputV3 = Omit<ModelDiagnosticV3, "blocks"> & {
  blocks?: readonly ModelCapabilityV3[];
};

interface DatasetSnapshotV3 {
  name: string;
  headers: string[];
  rows: Array<Record<string, unknown>>;
  sizeBytes: number;
  source: "sample" | "upload";
  hashKind: DatasetHashKind;
}

interface DraftSnapshotV3 {
  unitColumns: string[];
  horizonColumns: string[];
  groupColumn: string | null;
  codes: string[];
  weighting: "binary" | "frequency";
  model: StandardModelTypeV3;
  windowType: "MovingStanzaWindow" | "Conversation";
  movingStanza: unknown;
  horizonOrder: unknown;
  rotation: RotationSnapshotV3;
}

type RotationSnapshotV3 =
  | { type: "svd"; centerAlignToOrigin: boolean }
  | {
      type: "means";
      centerAlignToOrigin: boolean;
      negativeLevel: ScalarIdentityV3 | null;
      positiveLevel: ScalarIdentityV3 | null;
    }
  | { type: "reference"; referenceId: unknown; expectedContentSha256: unknown };

interface NormalizedCodeProfileV3 {
  code: string;
  magnitudes: number[];
  signature: string;
  allZero: boolean;
}

interface ConnectivityV3 {
  degreeByCode: Map<string, number>;
  edgeCount: number;
  candidateWindowCount: number;
}

interface MovingWindowV3 {
  backward: BackwardExtentV3;
  forward: ForwardExtentV3;
  rowOrder: CanonicalRowOrderV3;
}

interface IdentityValidationV3 {
  diagnostics: ModelDiagnosticV3[];
  valid: boolean;
}

interface ScientificNetworksV3 {
  endpointByUnit: Map<string, number[]>;
  targetVectors: number[][];
  rawJenaValuesFinite: boolean;
}

const own = Object.prototype.hasOwnProperty;
const SAMPLE_LIMIT = 5 as const;
// Means use compensated summation, so replication count is not a scientific
// source of uncertainty. This fixed per-dimension allowance covers arithmetic
// in centering and the subsequent SVD covariance while keeping a diagnosis
// invariant when an observation population is repeated.
const NUMERICAL_ZERO_ULPS_PER_DIMENSION_V3 = 8;
const LOWERCASE_SHA256 = /^[a-f0-9]{64}$/u;
const DIAGNOSTIC_RANK = new Map<ModelDiagnosticIdV3, number>(
  MODEL_DIAGNOSTIC_IDS_V3.map((id, index) => [id, index]),
);

function codeUnitCompareV3(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function assertExactKeysV3(record: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(record).sort(codeUnitCompareV3);
  const wanted = [...expected].sort(codeUnitCompareV3);
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} has an invalid shape.`);
  }
}

function snapshotStringArrayV3(
  value: unknown,
  label: string,
  options: { nonblank: boolean; distinct: boolean },
): string[] {
  const input = snapshotDenseJsonArrayV3(value, label);
  const result = input.map((entry, index) => {
    if (typeof entry !== "string" || (options.nonblank && entry.trim().length === 0)) {
      throw new TypeError(`${label}[${index}] must be ${options.nonblank ? "a nonblank" : "a"} string.`);
    }
    return entry;
  });
  if (options.distinct && new Set(result).size !== result.length) {
    throw new TypeError(`${label} must contain distinct strings.`);
  }
  return result;
}

function snapshotDatasetAndBindingV3(
  datasetValue: unknown,
  bindingValue: unknown,
): { dataset: DatasetSnapshotV3; binding: DatasetBindingV3 } {
  const source = snapshotPlainJsonRecordV3(datasetValue, "dataset");
  const expectedDatasetKeys = own.call(source, "hashKind")
    ? ["name", "headers", "rows", "sizeBytes", "source", "hashKind"]
    : ["name", "headers", "rows", "sizeBytes", "source"];
  assertExactKeysV3(source, expectedDatasetKeys, "dataset");
  if (typeof source.name !== "string" || source.name.trim().length === 0) {
    throw new TypeError("dataset.name must be a nonblank string.");
  }
  if (typeof source.sizeBytes !== "number" || !Number.isFinite(source.sizeBytes) || source.sizeBytes < 0) {
    throw new TypeError("dataset.sizeBytes must be a finite nonnegative number.");
  }
  if (source.source !== "sample" && source.source !== "upload") {
    throw new TypeError("dataset.source must be sample or upload.");
  }
  const headers = snapshotStringArrayV3(source.headers, "dataset.headers", { nonblank: true, distinct: true });
  const rawRows = snapshotDenseJsonArrayV3(source.rows, "dataset.rows");
  const rows = rawRows.map((row, index) => snapshotPlainJsonRecordV3(row, `dataset.rows[${index}]`));
  let hashKind: DatasetHashKind | undefined;
  if (own.call(source, "hashKind")) {
    if (!isHashKindV3(source.hashKind)) throw new TypeError("dataset.hashKind is unsupported.");
    hashKind = source.hashKind;
  }
  const resolvedHashKind = datasetHashKindFor({
    name: source.name,
    ...(hashKind === undefined ? {} : { hashKind }),
  });

  const bindingRecord = snapshotPlainJsonRecordV3(bindingValue, "dataset binding");
  assertExactKeysV3(
    bindingRecord,
    ["hashKind", "normalizedTableSha256", "rowCount", "headerSha256"],
    "dataset binding",
  );
  if (!isHashKindV3(bindingRecord.hashKind)) throw new TypeError("dataset binding.hashKind is unsupported.");
  if (resolvedHashKind !== bindingRecord.hashKind) {
    throw new TypeError("dataset binding.hashKind does not match dataset.hashKind.");
  }
  if (typeof bindingRecord.normalizedTableSha256 !== "string"
    || !LOWERCASE_SHA256.test(bindingRecord.normalizedTableSha256)) {
    throw new TypeError("dataset binding.normalizedTableSha256 must be a lowercase SHA-256 digest.");
  }
  if (typeof bindingRecord.headerSha256 !== "string" || !LOWERCASE_SHA256.test(bindingRecord.headerSha256)) {
    throw new TypeError("dataset binding.headerSha256 must be a lowercase SHA-256 digest.");
  }
  if (typeof bindingRecord.rowCount !== "number" || !Number.isSafeInteger(bindingRecord.rowCount)
    || bindingRecord.rowCount < 0 || bindingRecord.rowCount !== rows.length) {
    throw new TypeError("dataset binding.rowCount must equal the current rows length.");
  }
  const binding: DatasetBindingV3 = {
    hashKind: bindingRecord.hashKind,
    normalizedTableSha256: bindingRecord.normalizedTableSha256,
    rowCount: Object.is(bindingRecord.rowCount, -0) ? 0 : bindingRecord.rowCount,
    headerSha256: bindingRecord.headerSha256,
  };
  const dataset: DatasetSnapshotV3 = {
    name: source.name,
    headers,
    rows,
    sizeBytes: Object.is(source.sizeBytes, -0) ? 0 : source.sizeBytes,
    source: source.source,
    hashKind: resolvedHashKind,
  };
  return { dataset, binding };
}

function isHashKindV3(value: unknown): value is DatasetHashKind {
  return value === "normalized-utf8-text-sha256"
    || value === "normalized-utf8-csv-text-sha256"
    || value === "canonical-first-xlsx-worksheet-v1-sha256";
}

function snapshotDraftV3(value: unknown): DraftSnapshotV3 {
  const record = snapshotPlainJsonRecordV3(value, "Standard ENA draft");
  assertExactKeysV3(record, [
    "unitColumns", "horizonColumns", "groupColumn", "codes", "weighting", "model",
    "windowType", "movingStanza", "horizonOrder", "rotation",
  ], "Standard ENA draft");
  const unitColumns = snapshotStringArrayV3(record.unitColumns, "draft.unitColumns", { nonblank: true, distinct: true });
  const horizonColumns = snapshotStringArrayV3(record.horizonColumns, "draft.horizonColumns", { nonblank: true, distinct: true });
  const codes = snapshotStringArrayV3(record.codes, "draft.codes", { nonblank: false, distinct: false });
  if (record.groupColumn !== null
    && (typeof record.groupColumn !== "string" || record.groupColumn.trim().length === 0)) {
    throw new TypeError("draft.groupColumn must be null or a nonblank string.");
  }
  if (record.weighting !== "binary" && record.weighting !== "frequency") {
    throw new TypeError("draft.weighting must be binary or frequency.");
  }
  if (record.model !== "EndPoint" && record.model !== "SeparateTrajectory"
    && record.model !== "AccumulatedTrajectory") {
    throw new TypeError("draft.model is unsupported.");
  }
  if (record.windowType !== "MovingStanzaWindow" && record.windowType !== "Conversation") {
    throw new TypeError("draft.windowType is unsupported.");
  }
  const rotation = snapshotRotationV3(record.rotation);
  return {
    unitColumns,
    horizonColumns,
    groupColumn: record.groupColumn,
    codes,
    weighting: record.weighting,
    model: record.model,
    windowType: record.windowType,
    movingStanza: record.movingStanza,
    horizonOrder: record.horizonOrder,
    rotation,
  };
}

function snapshotScalarIdentityInputV3(value: unknown, label: string): ScalarIdentityV3 {
  const record = snapshotPlainJsonRecordV3(value, label);
  assertExactKeysV3(record, ["type", "value"], label);
  const scalar = scalarIdentityV3(record.value, `${label}.value`);
  if (record.type !== scalar.type) throw new TypeError(`${label}.type is inconsistent with its value.`);
  return scalar;
}

function snapshotRotationV3(value: unknown): RotationSnapshotV3 {
  const record = snapshotPlainJsonRecordV3(value, "draft.rotation");
  if (record.type === "svd") {
    assertExactKeysV3(record, ["type", "centerAlignToOrigin"], "draft.rotation");
    if (typeof record.centerAlignToOrigin !== "boolean") {
      throw new TypeError("draft.rotation.centerAlignToOrigin must be Boolean.");
    }
    return { type: "svd", centerAlignToOrigin: record.centerAlignToOrigin };
  }
  if (record.type === "means") {
    assertExactKeysV3(
      record,
      ["type", "centerAlignToOrigin", "negativeLevel", "positiveLevel"],
      "draft.rotation",
    );
    if (typeof record.centerAlignToOrigin !== "boolean") {
      throw new TypeError("draft.rotation.centerAlignToOrigin must be Boolean.");
    }
    return {
      type: "means",
      centerAlignToOrigin: record.centerAlignToOrigin,
      negativeLevel: record.negativeLevel === null
        ? null
        : snapshotScalarIdentityInputV3(record.negativeLevel, "draft.rotation.negativeLevel"),
      positiveLevel: record.positiveLevel === null
        ? null
        : snapshotScalarIdentityInputV3(record.positiveLevel, "draft.rotation.positiveLevel"),
    };
  }
  if (record.type === "reference") {
    assertExactKeysV3(record, ["type", "referenceId", "expectedContentSha256"], "draft.rotation");
    return {
      type: "reference",
      referenceId: record.referenceId,
      expectedContentSha256: record.expectedContentSha256,
    };
  }
  throw new TypeError("draft.rotation.type is unsupported.");
}

function diagnosticV3(input: DiagnosticInputV3): ModelDiagnosticV3 {
  return {
    ...input,
    blocks: [...(input.blocks ?? [])],
    ...(input.evidence === undefined ? {} : {
      evidence: {
        totalCount: input.evidence.totalCount,
        sampleLimit: 5,
        samples: input.evidence.samples.map((sample) => ({ ...sample })),
        truncated: input.evidence.truncated,
      },
    }),
    ...(input.suggestedActions === undefined ? {} : {
      suggestedActions: input.suggestedActions.map((action) => ({
        ...action,
        patch: { ...action.patch },
      })),
    }),
  };
}

function evidenceV3(totalCount: number, samples: readonly ModelEvidenceSampleV3[]): ModelEvidenceV3 {
  const bounded = samples.slice(0, SAMPLE_LIMIT).map((sample) => ({ ...sample }));
  return {
    totalCount,
    sampleLimit: SAMPLE_LIMIT,
    samples: bounded,
    truncated: totalCount > bounded.length,
  };
}

function excludeCodeActionV3(code: string): ModelSuggestedActionV3 {
  return {
    id: "exclude-code",
    label: `Exclude Code “${code}”`,
    confirmationText: `Exclude Code “${code}” from the scientific model configuration? This changes the model and invalidates current results.`,
    confirmationRequired: true,
    patch: { type: "exclude-code", code },
  };
}

function datasetBindingInvalidDiagnosticV3(): ModelDiagnosticV3 {
  return diagnosticV3({
    id: "STANDARD_DATASET_BINDING_INVALID",
    severity: "error",
    scope: "dataset",
    fieldPath: "dataset",
    summary: "The dataset binding is invalid.",
    detail: "The dataset structure and trusted digest binding must be validated again before model construction.",
    blocks: ["build-model"],
    evidence: evidenceV3(1, [{ detail: "Dataset or binding validation failed." }]),
  });
}

function finalizeDiagnosticsV3(output: ModelDiagnosticV3[]): readonly ModelDiagnosticV3[] {
  output.sort((left, right) => {
    const rankDelta = DIAGNOSTIC_RANK.get(left.id)! - DIAGNOSTIC_RANK.get(right.id)!;
    if (rankDelta !== 0) return rankDelta;
    const pathDelta = codeUnitCompareV3(left.fieldPath ?? "", right.fieldPath ?? "");
    if (pathDelta !== 0) return pathDelta;
    return codeUnitCompareV3(left.detail, right.detail);
  });
  return deepFreezeV3(output);
}

function snapshotComparatorForResolverV3(value: unknown, label: string): OrderComparatorV3 {
  const comparator = snapshotPlainJsonRecordV3(value, label);
  if (comparator.type === "number") {
    assertExactKeysV3(comparator, ["type"], label);
    return { type: "number" };
  }
  if (comparator.type === "date") {
    assertExactKeysV3(comparator, ["type", "format"], label);
    if (comparator.format !== "YYYY-MM-DD") throw new TypeError(`${label}.format is invalid.`);
    return { type: "date", format: "YYYY-MM-DD" };
  }
  if (comparator.type === "datetime") {
    assertExactKeysV3(comparator, ["type", "format", "timeZone"], label);
    if (comparator.format !== "ISO-8601" || comparator.timeZone !== "offset-in-value") {
      throw new TypeError(`${label} datetime contract is invalid.`);
    }
    return { type: "datetime", format: "ISO-8601", timeZone: "offset-in-value" };
  }
  if (comparator.type === "text") {
    assertExactKeysV3(comparator, ["type", "locale", "sensitivity", "numeric"], label);
    if (typeof comparator.locale !== "string" || comparator.locale.trim().length === 0
      || Intl.getCanonicalLocales(comparator.locale)[0] !== comparator.locale) {
      throw new TypeError(`${label}.locale must be canonical.`);
    }
    if (comparator.sensitivity !== "base" && comparator.sensitivity !== "accent"
      && comparator.sensitivity !== "case" && comparator.sensitivity !== "variant") {
      throw new TypeError(`${label}.sensitivity is invalid.`);
    }
    if (typeof comparator.numeric !== "boolean") throw new TypeError(`${label}.numeric must be Boolean.`);
    return {
      type: "text",
      locale: comparator.locale,
      sensitivity: comparator.sensitivity,
      numeric: comparator.numeric,
    };
  }
  if (comparator.type === "ordered-category") {
    assertExactKeysV3(comparator, ["type", "levels"], label);
    const levels = snapshotDenseJsonArrayV3(comparator.levels, `${label}.levels`).map((level, index) => (
      snapshotScalarIdentityInputV3(level, `${label}.levels[${index}]`)
    ));
    const [first, ...rest] = levels;
    if (first === undefined) throw new TypeError(`${label}.levels must be nonempty.`);
    if (new Set(levels.map((level) => canonicalJsonV3(level))).size !== levels.length) {
      throw new TypeError(`${label}.levels must be distinct.`);
    }
    return { type: "ordered-category", levels: [first, ...rest] };
  }
  throw new TypeError(`${label}.type is unsupported.`);
}

function snapshotOrderPolicyForResolverV3(value: unknown, label: string): CanonicalRowOrderV3 {
  const policy = snapshotPlainJsonRecordV3(value, label);
  if (policy.kind === "columns") {
    assertExactKeysV3(policy, ["kind", "keys"], label);
    const rawKeys = snapshotDenseJsonArrayV3(policy.keys, `${label}.keys`);
    if (rawKeys.length === 0) throw new TypeError(`${label}.keys must be nonempty.`);
    const keys = rawKeys.map((key, index): OrderKeyV3 => {
      const record = snapshotPlainJsonRecordV3(key, `${label}.keys[${index}]`);
      assertExactKeysV3(record, ["column", "direction", "comparator"], `${label}.keys[${index}]`);
      if (typeof record.column !== "string" || record.column.trim().length === 0) {
        throw new TypeError(`${label}.keys[${index}].column must be nonblank.`);
      }
      if (record.direction !== "ascending" && record.direction !== "descending") {
        throw new TypeError(`${label}.keys[${index}].direction is invalid.`);
      }
      return {
        column: record.column,
        direction: record.direction,
        comparator: snapshotComparatorForResolverV3(
          record.comparator,
          `${label}.keys[${index}].comparator`,
        ),
      };
    });
    if (new Set(keys.map((key) => key.column)).size !== keys.length) {
      throw new TypeError(`${label}.keys must use distinct columns.`);
    }
    const [first, ...rest] = keys;
    return { kind: "columns", keys: [first!, ...rest] };
  }
  if (policy.kind === "source-order-confirmed") {
    assertExactKeysV3(policy, ["kind", "confirmation"], label);
    const confirmation = snapshotPlainJsonRecordV3(policy.confirmation, "source-order confirmation");
    assertExactKeysV3(
      confirmation,
      ["kind", "analysisFamily", "datasetSha256", "rowCount", "relevantColumns", "confirmedAt", "confirmationVersion"],
      "source-order confirmation",
    );
    if (confirmation.kind !== "explicit-researcher-confirmation"
      || (confirmation.analysisFamily !== "standard" && confirmation.analysisFamily !== "ona")
      || typeof confirmation.datasetSha256 !== "string"
      || typeof confirmation.rowCount !== "number"
      || typeof confirmation.confirmedAt !== "string"
      || confirmation.confirmationVersion !== 1) {
      throw new TypeError("source-order confirmation has an invalid shape.");
    }
    const relevantColumns = snapshotStringArrayV3(
      confirmation.relevantColumns,
      "source-order confirmation.relevantColumns",
      { nonblank: true, distinct: true },
    );
    return {
      kind: "source-order-confirmed",
      confirmation: {
        kind: "explicit-researcher-confirmation",
        analysisFamily: confirmation.analysisFamily,
        datasetSha256: confirmation.datasetSha256,
        rowCount: confirmation.rowCount,
        relevantColumns,
        confirmedAt: confirmation.confirmedAt,
        confirmationVersion: 1,
      },
    };
  }
  throw new TypeError(`${label}.kind is unsupported.`);
}

function snapshotExtentV3(value: unknown, label: string, backward: boolean): BackwardExtentV3 | ForwardExtentV3 {
  const record = snapshotPlainJsonRecordV3(value, label);
  if (record.kind === "infinity") {
    assertExactKeysV3(record, ["kind"], label);
    return { kind: "infinity" };
  }
  if (record.kind !== "finite") throw new TypeError(`${label}.kind is invalid.`);
  assertExactKeysV3(record, ["kind", "value"], label);
  const minimum = backward ? 1 : 0;
  if (typeof record.value !== "number" || !Number.isSafeInteger(record.value) || record.value < minimum) {
    throw new TypeError(`${label}.value must be a safe integer greater than or equal to ${minimum}.`);
  }
  return { kind: "finite", value: Object.is(record.value, -0) ? 0 : record.value };
}

function snapshotMovingWindowV3(value: unknown): MovingWindowV3 | null {
  const record = snapshotPlainJsonRecordV3(value, "draft.movingStanza");
  assertExactKeysV3(record, ["backward", "forward", "rowOrder"], "draft.movingStanza");
  if (record.rowOrder === null) return null;
  const backward = snapshotExtentV3(record.backward, "draft.movingStanza.backward", true);
  const forward = snapshotExtentV3(record.forward, "draft.movingStanza.forward", false);
  // The Task 4 resolver performs the authoritative semantic snapshot/validation.
  const policy = record.rowOrder as CanonicalRowOrderV3;
  return { backward, forward, rowOrder: policy };
}

function analyzeCodeProfileV3(
  rows: readonly Record<string, unknown>[],
  code: string,
  weighting: "binary" | "frequency",
): { profile: NormalizedCodeProfileV3 | null; invalidRows: number[] } {
  const invalidRows: number[] = [];
  const magnitudes: number[] = [];
  const typedValues: Array<{ type: "number" | "boolean"; value: number | boolean }> = [];
  const binaryKinds = new Set<"number" | "boolean">();
  const numericRows: number[] = [];
  const booleanRows: number[] = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!own.call(row, code)) {
      invalidRows.push(rowIndex);
      continue;
    }
    const value = row[code];
    if (weighting === "binary") {
      if (typeof value === "number" && (value === 0 || value === 1)) {
        const normalized = Object.is(value, -0) ? 0 : value;
        binaryKinds.add("number");
        numericRows.push(rowIndex);
        magnitudes.push(normalized);
        typedValues.push({ type: "number", value: normalized });
      } else if (typeof value === "boolean") {
        binaryKinds.add("boolean");
        booleanRows.push(rowIndex);
        magnitudes.push(value ? 1 : 0);
        typedValues.push({ type: "boolean", value });
      } else {
        invalidRows.push(rowIndex);
      }
    } else if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      const normalized = Object.is(value, -0) ? 0 : value;
      magnitudes.push(normalized);
      typedValues.push({ type: "number", value: normalized });
    } else {
      invalidRows.push(rowIndex);
    }
  }
  if (weighting === "binary" && binaryKinds.size > 1) {
    invalidRows.push(...numericRows, ...booleanRows);
  }
  if (invalidRows.length > 0) return { profile: null, invalidRows: [...new Set(invalidRows)].sort((a, b) => a - b) };
  return {
    profile: {
      code,
      magnitudes,
      signature: canonicalJsonV3(typedValues),
      allZero: magnitudes.length > 0 && magnitudes.every((value) => value === 0),
    },
    invalidRows: [],
  };
}

function typedHorizonKeyV3(
  row: Record<string, unknown>,
  columns: readonly string[],
  rowIndex: number,
): string {
  if (columns.length === 0) throw new TypeError("Horizon identity columns are required.");
  const fields = columns.map((column) => {
    if (!own.call(row, column)) throw new TypeError(`row ${rowIndex} is missing Horizon identity.`);
    return { column, value: scalarIdentityV3(row[column], `row ${rowIndex}.${column}`) };
  });
  return canonicalJsonV3({ fields });
}

function connectivityFromGroupsV3(
  groups: readonly (readonly number[])[],
  profiles: readonly NormalizedCodeProfileV3[],
  moving: Pick<MovingWindowV3, "backward" | "forward"> | null,
): ConnectivityV3 {
  const codes = profiles.map((profile) => profile.code);
  const profileByCode = new Map(profiles.map((profile) => [profile.code, profile]));
  const degreeByCode = new Map(codes.map((code) => [code, 0]));
  const edges = new Set<string>();
  let candidateWindowCount = 0;
  for (const group of groups) {
    // One prefix per Code turns arbitrary finite/Infinity range-presence checks
    // into O(1), avoiding O(P*N^2) rescans for wide Moving Stanza windows.
    const positivePrefixByCode = new Map<string, number[]>();
    for (const code of codes) {
      const values = profileByCode.get(code)!.magnitudes;
      const prefix = new Array<number>(group.length + 1);
      prefix[0] = 0;
      for (let ordinal = 0; ordinal < group.length; ordinal += 1) {
        prefix[ordinal + 1] = prefix[ordinal] + (values[group[ordinal]] > 0 ? 1 : 0);
      }
      positivePrefixByCode.set(code, prefix);
    }
    const visitedRanges = new Set<string>();
    const visitRange = (start: number, end: number): void => {
      candidateWindowCount += 1;
      const rangeKey = `${start}:${end}`;
      if (visitedRanges.has(rangeKey)) return;
      visitedRanges.add(rangeKey);
      for (let leftIndex = 0; leftIndex < codes.length; leftIndex += 1) {
        const left = codes[leftIndex];
        const leftPrefix = positivePrefixByCode.get(left)!;
        if (leftPrefix[end + 1] - leftPrefix[start] === 0) continue;
        for (let rightIndex = leftIndex + 1; rightIndex < codes.length; rightIndex += 1) {
          const right = codes[rightIndex];
          const rightPrefix = positivePrefixByCode.get(right)!;
          if (rightPrefix[end + 1] - rightPrefix[start] === 0) continue;
          const orderedPair = codeUnitCompareV3(left, right) <= 0 ? [left, right] : [right, left];
          const pair = canonicalJsonV3(orderedPair);
          if (edges.has(pair)) continue;
          edges.add(pair);
          degreeByCode.set(left, degreeByCode.get(left)! + 1);
          degreeByCode.set(right, degreeByCode.get(right)! + 1);
        }
      }
    };
    if (moving === null) {
      visitRange(0, group.length - 1);
      continue;
    }
    for (let ordinal = 0; ordinal < group.length; ordinal += 1) {
      const start = moving.backward.kind === "infinity"
        ? 0
        : Math.max(0, ordinal - (moving.backward.value - 1));
      const end = moving.forward.kind === "infinity"
        ? group.length - 1
        : Math.min(group.length - 1, ordinal + moving.forward.value);
      visitRange(start, end);
    }
  }
  return { degreeByCode, edgeCount: edges.size, candidateWindowCount };
}

function conversationGroupsV3(
  rows: readonly Record<string, unknown>[],
  unitColumns: readonly string[],
  horizonColumns: readonly string[],
): number[][] {
  const byUnitHorizon = new Map<string, number[]>();
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const unitKey = identityKeyV3(rows[rowIndex], unitColumns, rowIndex, "Unit");
    const horizonKey = typedHorizonKeyV3(rows[rowIndex], horizonColumns, rowIndex);
    const key = canonicalJsonV3([unitKey, horizonKey]);
    const indices = byUnitHorizon.get(key) ?? [];
    indices.push(rowIndex);
    byUnitHorizon.set(key, indices);
  }
  return [...byUnitHorizon.entries()]
    .sort(([left], [right]) => codeUnitCompareV3(left, right))
    .map(([, indices]) => indices);
}

function movingGroupsV3(
  resolved: ReturnType<typeof resolveRowOrderV3>,
): number[][] {
  const byHorizon = new Map<string, number[]>();
  for (const mapping of resolved.mappings) {
    const group = byHorizon.get(mapping.horizonKey) ?? [];
    group.push(mapping.sourceRowIndex);
    byHorizon.set(mapping.horizonKey, group);
  }
  return [...byHorizon.entries()]
    .sort(([left], [right]) => codeUnitCompareV3(left, right))
    .map(([, indices]) => indices);
}

function identityKeyV3(
  row: Record<string, unknown>,
  columns: readonly string[],
  rowIndex: number,
  role: "Unit" | "Horizon",
): string {
  const fields = columns.map((column) => ({
    column,
    value: scalarIdentityV3(row[column], `row ${rowIndex} ${role}.${column}`),
  }));
  return canonicalJsonV3({ fields });
}

function validateIdentityRoleV3(
  rows: readonly Record<string, unknown>[],
  headers: ReadonlySet<string>,
  columns: readonly string[],
  role: "Unit" | "Horizon",
): IdentityValidationV3 {
  const scope = role === "Unit" ? "units" as const : "horizons" as const;
  const requiredId = role === "Unit" ? "STANDARD_UNITS_REQUIRED" as const : "STANDARD_HORIZONS_REQUIRED" as const;
  if (columns.length === 0) {
    return {
      valid: false,
      diagnostics: [diagnosticV3({
        id: requiredId,
        severity: "error",
        scope,
        fieldPath: role === "Unit" ? "unitColumns" : "horizonColumns",
        summary: `${role} identity fields are required.`,
        detail: `Select at least one ${role} identity field before model construction.`,
        blocks: ["build-model"],
      })],
    };
  }
  const diagnostics: ModelDiagnosticV3[] = [];
  let valid = true;
  for (const column of columns) {
    if (!headers.has(column)) {
      valid = false;
      diagnostics.push(diagnosticV3({
        id: "STANDARD_IDENTITY_MISSING",
        severity: "error",
        scope,
        fieldPath: `${role === "Unit" ? "unitColumns" : "horizonColumns"}.${column}`,
        summary: `${role} identity field “${column}” is missing.`,
        detail: `The selected ${role} identity field is absent from the current dataset header.`,
        blocks: ["build-model"],
        evidence: evidenceV3(1, [{ detail: `Selected ${role} identity field is absent from the header.` }]),
      }));
      continue;
    }
    const missingRows: number[] = [];
    const unsupportedRows: number[] = [];
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      if (!own.call(row, column) || row[column] === null || row[column] === undefined || row[column] === "") {
        missingRows.push(rowIndex);
        continue;
      }
      try {
        scalarIdentityV3(row[column], `row ${rowIndex} ${role}.${column}`);
      } catch {
        unsupportedRows.push(rowIndex);
      }
    }
    if (missingRows.length > 0) {
      valid = false;
      diagnostics.push(diagnosticV3({
        id: "STANDARD_IDENTITY_MISSING",
        severity: "error",
        scope,
        fieldPath: `${role === "Unit" ? "unitColumns" : "horizonColumns"}.${column}`,
        summary: `${role} identity values are missing.`,
        detail: `Every row must have a typed value for the selected ${role} identity field.`,
        blocks: ["build-model"],
        evidence: evidenceV3(missingRows.length, missingRows.slice(0, SAMPLE_LIMIT).map((rowIndex) => ({
          rowIndex,
          detail: `Missing ${role} identity value.`,
        }))),
      }));
    }
    if (unsupportedRows.length > 0) {
      valid = false;
      diagnostics.push(diagnosticV3({
        id: "STANDARD_IDENTITY_VALUE_UNSUPPORTED",
        severity: "error",
        scope,
        fieldPath: `${role === "Unit" ? "unitColumns" : "horizonColumns"}.${column}`,
        summary: `${role} identity values use an unsupported type.`,
        detail: `${role} identities must be nonempty strings, finite numbers, or booleans; values are never coerced.`,
        blocks: ["build-model"],
        evidence: evidenceV3(unsupportedRows.length, unsupportedRows.slice(0, SAMPLE_LIMIT).map((rowIndex) => ({
          rowIndex,
          detail: `Unsupported ${role} identity value.`,
        }))),
      }));
    }
  }
  return { diagnostics, valid };
}

function validateGroupV3(
  rows: readonly Record<string, unknown>[],
  headers: ReadonlySet<string>,
  unitColumns: readonly string[],
  groupColumn: string | null,
  unitIdentityValid: boolean,
): IdentityValidationV3 & { groupByUnit: Map<string, ScalarIdentityV3> } {
  const diagnostics: ModelDiagnosticV3[] = [];
  const groupByUnit = new Map<string, ScalarIdentityV3>();
  if (groupColumn === null) return { diagnostics, valid: true, groupByUnit };
  if (!headers.has(groupColumn)) {
    diagnostics.push(diagnosticV3({
      id: "STANDARD_GROUP_FIELD_MISSING",
      severity: "error",
      scope: "units",
      fieldPath: `group.${groupColumn}`,
      summary: `Group field “${groupColumn}” is missing.`,
      detail: "The selected Group metadata field is absent from the current dataset header.",
      blocks: ["build-model"],
      evidence: evidenceV3(1, [{ detail: "Selected Group field is absent from the header." }]),
    }));
    return { diagnostics, valid: false, groupByUnit };
  }
  const missingRows: number[] = [];
  const unsupportedRows: number[] = [];
  const unstableRows: number[] = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!own.call(row, groupColumn) || row[groupColumn] === null
      || row[groupColumn] === undefined || row[groupColumn] === "") {
      missingRows.push(rowIndex);
      continue;
    }
    let group: ScalarIdentityV3;
    try {
      group = scalarIdentityV3(row[groupColumn], `row ${rowIndex} Group.${groupColumn}`);
    } catch {
      unsupportedRows.push(rowIndex);
      continue;
    }
    if (!unitIdentityValid) continue;
    const unitKey = identityKeyV3(row, unitColumns, rowIndex, "Unit");
    const prior = groupByUnit.get(unitKey);
    if (prior !== undefined && canonicalJsonV3(prior) !== canonicalJsonV3(group)) unstableRows.push(rowIndex);
    else groupByUnit.set(unitKey, group);
  }
  if (missingRows.length > 0) {
    diagnostics.push(diagnosticV3({
      id: "STANDARD_GROUP_FIELD_MISSING",
      severity: "error",
      scope: "units",
      fieldPath: `group.${groupColumn}`,
      summary: "Group values are missing.",
      detail: "Every row must have a typed value for the selected Group field.",
      blocks: ["build-model"],
      evidence: evidenceV3(missingRows.length, missingRows.slice(0, SAMPLE_LIMIT).map((rowIndex) => ({
        rowIndex,
        detail: "Missing Group value.",
      }))),
    }));
  }
  if (unsupportedRows.length > 0) {
    diagnostics.push(diagnosticV3({
      id: "STANDARD_IDENTITY_VALUE_UNSUPPORTED",
      severity: "error",
      scope: "units",
      fieldPath: `group.${groupColumn}`,
      summary: "Group values use an unsupported type.",
      detail: "Group values must be nonempty strings, finite numbers, or booleans; values are never coerced.",
      blocks: ["build-model"],
      evidence: evidenceV3(unsupportedRows.length, unsupportedRows.slice(0, SAMPLE_LIMIT).map((rowIndex) => ({
        rowIndex,
        detail: "Unsupported Group value.",
      }))),
    }));
  }
  if (unstableRows.length > 0 && missingRows.length === 0 && unsupportedRows.length === 0) {
    diagnostics.push(diagnosticV3({
      id: "STANDARD_GROUP_UNSTABLE_WITHIN_UNIT",
      severity: "error",
      scope: "units",
      fieldPath: `group.${groupColumn}`,
      summary: "Group membership is unstable within a Unit.",
      detail: "Each typed Unit must map to exactly one typed Group value.",
      blocks: ["build-model"],
      evidence: evidenceV3(unstableRows.length, unstableRows.slice(0, SAMPLE_LIMIT).map((rowIndex) => ({
        rowIndex,
        detail: "This row changes its Unit's Group membership.",
      }))),
    }));
  }
  return {
    diagnostics,
    valid: missingRows.length === 0 && unsupportedRows.length === 0 && unstableRows.length === 0,
    groupByUnit,
  };
}

function sharedHorizonDiagnosticV3(
  rows: readonly Record<string, unknown>[],
  unitColumns: readonly string[],
  horizonColumns: readonly string[],
): ModelDiagnosticV3 | null {
  const unitsByHorizon = new Map<string, Set<string>>();
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const horizonKey = identityKeyV3(rows[rowIndex], horizonColumns, rowIndex, "Horizon");
    const unitKey = identityKeyV3(rows[rowIndex], unitColumns, rowIndex, "Unit");
    const units = unitsByHorizon.get(horizonKey) ?? new Set<string>();
    units.add(unitKey);
    unitsByHorizon.set(horizonKey, units);
  }
  const sharedCounts = [...unitsByHorizon.values()]
    .filter((units) => units.size > 1)
    .map((units) => units.size)
    .sort((left, right) => left - right);
  if (sharedCounts.length === 0) return null;
  return diagnosticV3({
    id: "STANDARD_HORIZON_SHARED_BY_MULTIPLE_UNITS",
    severity: "information",
    scope: "horizons",
    fieldPath: "horizonColumns",
    summary: "Some Horizons are shared by multiple Units.",
    detail: "Shared typed Horizon identities are legal and do not merge distinct Unit trajectories.",
    blocks: [],
    evidence: evidenceV3(sharedCounts.length, sharedCounts.slice(0, SAMPLE_LIMIT).map((unitCount) => ({
      detail: `Shared Horizon observed for ${unitCount} typed Units.`,
    }))),
  });
}

function orderFailureDiagnosticV3(
  kind: "row" | "horizon",
  error: unknown,
): ModelDiagnosticV3 {
  if (error instanceof OrderingDomainErrorV3 && error.code === "SOURCE_CONFIRMATION_STALE") {
    return diagnosticV3({
      id: "STANDARD_SOURCE_ORDER_CONFIRMATION_STALE",
      severity: "error",
      scope: kind === "row" ? "windows" : "horizons",
      fieldPath: kind === "row" ? "movingStanza.rowOrder" : "horizonOrder",
      summary: "Source-order confirmation is stale or invalid.",
      detail: "The confirmation must exactly bind the current Standard analysis family, dataset, row count, and ordered active identity fields.",
      blocks: ["build-model"],
    });
  }
  if (kind === "horizon" && error instanceof OrderingDomainErrorV3 && error.code === "HORIZON_TIE") {
    return diagnosticV3({
      id: "STANDARD_HORIZON_ORDER_UNRESOLVED_TIE",
      severity: "error",
      scope: "horizons",
      fieldPath: "horizonOrder",
      summary: "Trajectory Horizon order contains an unresolved tie.",
      detail: "The configured comparator tuple must uniquely order every distinct Horizon observed by each Unit.",
      blocks: ["build-model"],
    });
  }
  return diagnosticV3({
    id: kind === "row" ? "STANDARD_ROW_ORDER_INVALID" : "STANDARD_HORIZON_ORDER_INVALID",
    severity: "error",
    scope: kind === "row" ? "windows" : "horizons",
    fieldPath: kind === "row" ? "movingStanza.rowOrder" : "horizonOrder",
    summary: kind === "row" ? "Moving Stanza row order is invalid." : "Trajectory Horizon order is invalid.",
    detail: kind === "row"
      ? "The authoritative within-Horizon resolver rejected the active row-order policy or values."
      : "The authoritative trajectory resolver rejected the active Horizon-order policy or values.",
    blocks: ["build-model"],
  });
}

function zeroVectorV3(width: number): number[] {
  return Array.from({ length: width }, () => 0);
}

function addVectorV3(target: number[], source: readonly number[]): void {
  for (let index = 0; index < target.length; index += 1) target[index] += source[index] ?? 0;
}

const DIAGNOSTIC_UNIT_FIELD_V3 = "__open_ena_diagnostic_unit_v3";
const DIAGNOSTIC_HORIZON_FIELD_V3 = "__open_ena_diagnostic_horizon_v3";

function syntheticTokensV3(keys: readonly string[], prefix: string): {
  tokenByKey: Map<string, string>;
  keyByToken: Map<string, string>;
} {
  const distinct = [...new Set(keys)].sort(codeUnitCompareV3);
  const tokenByKey = new Map<string, string>();
  const keyByToken = new Map<string, string>();
  distinct.forEach((key, index) => {
    const token = `${prefix}${index.toString(36).padStart(8, "0")}`;
    tokenByKey.set(key, token);
    keyByToken.set(token, key);
  });
  return { tokenByKey, keyByToken };
}

function diagnosticRowsForJenaV3(
  rows: readonly Record<string, unknown>[],
  unitColumns: readonly string[],
  horizonColumns: readonly string[],
  profiles: readonly NormalizedCodeProfileV3[],
  sourceOrder: readonly number[],
): {
  rows: Row[];
  codeFields: string[];
  unitKeyByToken: Map<string, string>;
  horizonKeyByToken: Map<string, string>;
} {
  const unitKeys = rows.map((row, rowIndex) => identityKeyV3(row, unitColumns, rowIndex, "Unit"));
  const horizonKeys = rows.map((row, rowIndex) => identityKeyV3(row, horizonColumns, rowIndex, "Horizon"));
  const units = syntheticTokensV3(unitKeys, "u");
  const horizons = syntheticTokensV3(horizonKeys, "h");
  const codeFields = profiles.map((_profile, index) => `__open_ena_diagnostic_code_v3_${index.toString(36)}`);
  const syntheticRows = sourceOrder.map((sourceRowIndex): Row => ({
    [DIAGNOSTIC_UNIT_FIELD_V3]: units.tokenByKey.get(unitKeys[sourceRowIndex])!,
    [DIAGNOSTIC_HORIZON_FIELD_V3]: horizons.tokenByKey.get(horizonKeys[sourceRowIndex])!,
    ...Object.fromEntries(codeFields.map((field, codeIndex) => (
      [field, profiles[codeIndex].magnitudes[sourceRowIndex] ?? 0]
    ))),
  }));
  return {
    rows: syntheticRows,
    codeFields,
    unitKeyByToken: units.keyByToken,
    horizonKeyByToken: horizons.keyByToken,
  };
}

function scientificNetworksV3(
  rows: readonly Record<string, unknown>[],
  unitColumns: readonly string[],
  horizonColumns: readonly string[],
  profiles: readonly NormalizedCodeProfileV3[],
  weighting: "binary" | "frequency",
  windowType: "MovingStanzaWindow" | "Conversation",
  moving: MovingWindowV3 | null,
  resolvedRowOrder: ReturnType<typeof resolveRowOrderV3> | null,
  model: StandardModelTypeV3,
  horizonOrdering: ReturnType<typeof resolveHorizonOrderV3> | null,
): ScientificNetworksV3 {
  if (windowType === "MovingStanzaWindow" && (moving === null || resolvedRowOrder === null)) {
    throw new TypeError("Resolved Moving Stanza order is required.");
  }
  if (model !== "EndPoint" && horizonOrdering === null) {
    throw new TypeError("Resolved trajectory Horizon order is required.");
  }
  const sourceOrder = windowType === "MovingStanzaWindow"
    ? resolvedRowOrder!.orderedSourceRowIndices
    : rows.map((_row, index) => index);
  const synthetic = diagnosticRowsForJenaV3(
    rows,
    unitColumns,
    horizonColumns,
    profiles,
    sourceOrder,
  );
  const common = {
    rows: synthetic.rows,
    units: [DIAGNOSTIC_UNIT_FIELD_V3],
    conversation: [DIAGNOSTIC_HORIZON_FIELD_V3],
    codes: synthetic.codeFields,
    weightBy: weighting === "binary" ? "binary" as const : "sum" as const,
    window: windowType,
    windowSizeBack: moving?.backward.kind === "infinity"
      ? Number.POSITIVE_INFINITY
      : moving?.backward.value ?? 1,
    windowSizeForward: moving?.forward.kind === "infinity"
      ? Number.POSITIVE_INFINITY
      : moving?.forward.value ?? 0,
  };
  if (model === "EndPoint") {
    const accumulated = accumulateData({ ...common, model: "EndPoint" });
    // jENA's connectionMatrix is a presentation matrix: its numeric() helper
    // maps non-finite connectionCounts values to zero. Diagnostics must retain
    // the exact raw accumulator values so the single finite-output gate below
    // can fail closed instead of accepting that sanitization.
    const rawVectors = accumulated.connectionCounts.map((row) => (
      rawJenaConnectionVectorV3(row, accumulated.codeColumns)
    ));
    const endpointByUnit = new Map<string, number[]>();
    accumulated.connectionCounts.forEach((row, index) => {
      const token = String(row[DIAGNOSTIC_UNIT_FIELD_V3] ?? "");
      const unitKey = synthetic.unitKeyByToken.get(token);
      if (unitKey === undefined) throw new Error("jENA diagnostic Unit token was not recognized.");
      endpointByUnit.set(unitKey, [...(rawVectors[index] ?? [])]);
    });
    return {
      endpointByUnit,
      targetVectors: rawVectors.map((vector) => [...vector]),
      rawJenaValuesFinite: accumulated.rowConnectionCounts.length > 0
        && rawJenaConnectionRowsFiniteV3(accumulated.rowConnectionCounts, accumulated.codeColumns)
        && rawVectors.every((vector) => vector.every(Number.isFinite)),
    };
  }

  const separated = accumulateData({ ...common, model: "SeparateTrajectory" });
  const rawStepVectors = separated.connectionCounts.map((row) => (
    rawJenaConnectionVectorV3(row, separated.codeColumns)
  ));
  const stepByUnit = new Map<string, Map<string, number[]>>();
  rawStepVectors.forEach((vector, index) => {
    const trajectory = separated.trajectories?.[index];
    const unitToken = String(trajectory?.[DIAGNOSTIC_UNIT_FIELD_V3] ?? "");
    const horizonToken = String(trajectory?.[DIAGNOSTIC_HORIZON_FIELD_V3] ?? "");
    const unitKey = synthetic.unitKeyByToken.get(unitToken);
    const horizonKey = synthetic.horizonKeyByToken.get(horizonToken);
    if (unitKey === undefined || horizonKey === undefined) {
      throw new Error("jENA diagnostic trajectory token was not recognized.");
    }
    const byHorizon = stepByUnit.get(unitKey) ?? new Map<string, number[]>();
    byHorizon.set(horizonKey, [...vector]);
    stepByUnit.set(unitKey, byHorizon);
  });
  if (model === "SeparateTrajectory") {
    return {
      endpointByUnit: new Map(),
      targetVectors: rawStepVectors.map((vector) => [...vector]),
      rawJenaValuesFinite: separated.rowConnectionCounts.length > 0
        && rawJenaConnectionRowsFiniteV3(separated.rowConnectionCounts, separated.codeColumns)
        && rawStepVectors.every((vector) => vector.every(Number.isFinite)),
    };
  }
  const edgeWidth = profiles.length * (profiles.length - 1) / 2;
  const targetVectors: number[][] = [];
  for (const sequence of horizonOrdering!.unitSequences) {
    const running = zeroVectorV3(edgeWidth);
    for (const step of sequence.steps) {
      addVectorV3(running, stepByUnit.get(sequence.unitKey)?.get(step.horizonKey) ?? zeroVectorV3(edgeWidth));
      targetVectors.push([...running]);
    }
  }
  return {
    endpointByUnit: new Map(),
    targetVectors,
    rawJenaValuesFinite: separated.rowConnectionCounts.length > 0
      && rawJenaConnectionRowsFiniteV3(separated.rowConnectionCounts, separated.codeColumns)
      && rawStepVectors.every((vector) => vector.every(Number.isFinite)),
  };
}

function rawJenaConnectionVectorV3(row: Row | undefined, codeColumns: readonly string[]): number[] {
  return codeColumns.map((column) => {
    const descriptor = row === undefined ? undefined : Object.getOwnPropertyDescriptor(row, column);
    if (descriptor === undefined || !("value" in descriptor) || typeof descriptor.value !== "number") {
      return Number.NaN;
    }
    return descriptor.value;
  });
}

function rawJenaConnectionRowsFiniteV3(rows: readonly Row[], codeColumns: readonly string[]): boolean {
  for (const row of rows) {
    for (const column of codeColumns) {
      const descriptor = Object.getOwnPropertyDescriptor(row, column);
      if (descriptor === undefined || !("value" in descriptor)
        || typeof descriptor.value !== "number" || !Number.isFinite(descriptor.value)) {
        return false;
      }
    }
  }
  return true;
}

function vectorHasSignalV3(vector: readonly number[]): boolean {
  return vector.some((value) => value !== 0);
}

function scientificNetworksFiniteV3(networks: ScientificNetworksV3): boolean {
  if (!networks.rawJenaValuesFinite) return false;
  for (const vector of networks.endpointByUnit.values()) {
    if (!vector.every(Number.isFinite)) return false;
  }
  return networks.targetVectors.every((vector) => vector.every(Number.isFinite));
}

function meanVectorV3(vectors: readonly (readonly number[])[]): number[] {
  const width = vectors[0]?.length ?? 0;
  if (vectors.length === 0) return zeroVectorV3(width);
  return Array.from({ length: width }, (_, column) => {
    let sum = 0;
    let compensation = 0;
    for (const vector of vectors) {
      const value = vector[column] ?? 0;
      const next = sum + value;
      compensation += Math.abs(sum) >= Math.abs(value)
        ? (sum - next) + value
        : (value - next) + sum;
      sum = next;
    }
    return (sum + compensation) / vectors.length;
  });
}

function numericalZeroToleranceV3(scale: number, dimension: number): number {
  return NUMERICAL_ZERO_ULPS_PER_DIMENSION_V3
    * Number.EPSILON
    * Math.max(1, dimension)
    * Math.max(1, scale);
}

function vectorsExactlyEqualV3(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function vectorNearZeroV3(vector: readonly number[], scale: number, termCount: number): boolean {
  const tolerance = numericalZeroToleranceV3(scale, termCount);
  return vector.every((value) => Math.abs(value) <= tolerance);
}

function maximumAbsoluteValueV3(vectors: readonly (readonly number[])[]): number {
  let largest = 0;
  for (const vector of vectors) {
    for (const value of vector) largest = Math.max(largest, Math.abs(value));
  }
  return largest;
}

function centeredRankV3(vectors: readonly number[][], centerAlignToOrigin: boolean): number {
  if (vectors.length === 0) return 0;
  const normalized = sphereNorm(vectors.map((vector) => [...vector]));
  const first = normalized[0];
  if (first !== undefined && normalized.every((vector) => vectorsExactlyEqualV3(first, vector))) return 0;
  const centerPopulation = centerAlignToOrigin ? normalized.filter(vectorHasSignalV3) : normalized;
  if (centerPopulation.length === 0) return 0;
  const center = meanVectorV3(centerPopulation);
  const centered = normalized.map((vector) => (
    centerAlignToOrigin && !vectorHasSignalV3(vector)
      ? vector.map(() => 0)
      : vector.map((value, index) => value - (center[index] ?? 0))
  ));
  const inputScale = maximumAbsoluteValueV3(normalized);
  const centeredScale = maximumAbsoluteValueV3(centered);
  const vectorDimension = normalized[0]?.length ?? 0;
  if (centeredScale <= numericalZeroToleranceV3(
    inputScale,
    vectorDimension,
  )) return 0;
  const eigenvalues = svdRotation(centered).eigenvalues;
  const leading = eigenvalues[0] ?? 0;
  if (leading === 0) return 0;
  const roundingFloor = numericalZeroToleranceV3(
    inputScale,
    vectorDimension,
  ) ** 2;
  const threshold = Math.max(Number.MIN_VALUE, leading * 1e-12, roundingFloor);
  return eigenvalues.filter((value) => value > threshold).length;
}

function zeroObservationDiagnosticV3(vectors: readonly number[][]): ModelDiagnosticV3 | null {
  const zeroCount = vectors.filter((vector) => !vectorHasSignalV3(vector)).length;
  if (zeroCount === 0) return null;
  return diagnosticV3({
    id: "STANDARD_TARGET_RANK_ZERO",
    severity: "error",
    scope: "rotation",
    fieldPath: "rotation",
    summary: "At least one analytical observation has a zero network.",
    detail: "A zero analytical observation has rank zero and blocks target-fitted SVD or Means even when other observations vary.",
    blocks: ["build-model"],
    evidence: evidenceV3(zeroCount, Array.from(
      { length: Math.min(zeroCount, SAMPLE_LIMIT) },
      () => ({ detail: "Analytical observation has an all-zero scientific network." }),
    )),
  });
}

function rankDiagnosticV3(
  rank: number,
  rotation: RotationSnapshotV3,
  targetCount: number,
): ModelDiagnosticV3 | null {
  const targetSamples = Array.from(
    { length: Math.min(targetCount, SAMPLE_LIMIT) },
    () => ({ detail: "Target observation participates in the centered-rank preflight." }),
  );
  if (targetCount === 0) {
    return diagnosticV3({
      id: "STANDARD_TARGET_RANK_ZERO",
      severity: "error",
      scope: "rotation",
      fieldPath: "rotation",
      summary: "The target fitting population has no analytical observations.",
      detail: "SVD, direct Means, and Reference projection require at least one real analytical observation; an empty target cannot be projected as a degenerate network.",
      blocks: ["build-model"],
      evidence: evidenceV3(0, []),
    });
  }
  if (rank === 0) {
    if (rotation.type === "reference") {
      return diagnosticV3({
        id: "STANDARD_REFERENCE_TARGET_DEGENERATE",
        severity: "warning",
        scope: "reference",
        fieldPath: "rotation",
        summary: "The Reference target is degenerate.",
        detail: "The centered target has rank zero; fixed Reference axes may still project it, but no target variation is available.",
        blocks: [],
        evidence: evidenceV3(targetCount, targetSamples),
      });
    }
    return diagnosticV3({
      id: "STANDARD_TARGET_RANK_ZERO",
      severity: "error",
      scope: "rotation",
      fieldPath: "rotation",
      summary: "The target fitting population has rank zero.",
      detail: "SVD and direct Means fitting require variation among sphere-normalized target networks.",
      blocks: ["build-model"],
      evidence: evidenceV3(targetCount, targetSamples),
    });
  }
  if (rank === 1 && rotation.type === "svd") {
    return diagnosticV3({
      id: "STANDARD_SVD_ONE_DIMENSIONAL",
      severity: "warning",
      scope: "rotation",
      fieldPath: "rotation",
      summary: "The fitted SVD target is one-dimensional.",
      detail: "SVD1 is estimable, but the application cannot invent a meaningful ENA2 axis.",
      blocks: ["ai-interpretation"],
      evidence: evidenceV3(targetCount, targetSamples),
    });
  }
  return null;
}

function referenceFieldsDiagnosticV3(rotation: RotationSnapshotV3): ModelDiagnosticV3 | null {
  if (rotation.type !== "reference") return null;
  const referenceIdValid = typeof rotation.referenceId === "string" && rotation.referenceId.trim().length > 0;
  const digestValid = typeof rotation.expectedContentSha256 === "string"
    && LOWERCASE_SHA256.test(rotation.expectedContentSha256);
  if (referenceIdValid && digestValid) return null;
  return diagnosticV3({
    id: "STANDARD_REFERENCE_MISSING",
    severity: "error",
    scope: "reference",
    fieldPath: "rotation",
    summary: "Reference rotation identity is incomplete or invalid.",
    detail: "Select a nonblank Reference ID with its exact lowercase 64-hex content SHA-256 before projection.",
    blocks: ["build-model"],
    evidence: evidenceV3(1, [{ detail: "Reference ID or expected content digest is missing or malformed." }]),
  });
}

function meansMembershipPrerequisitesV3(
  rotation: Extract<RotationSnapshotV3, { type: "means" }>,
  groupColumn: string | null,
  groupByUnit: ReadonlyMap<string, ScalarIdentityV3>,
): { diagnostics: ModelDiagnosticV3[]; ready: boolean } {
  if (groupColumn === null) {
    return {
      ready: false,
      diagnostics: [diagnosticV3({
        id: "STANDARD_MEANS_GROUP_REQUIRED",
        severity: "error",
        scope: "rotation",
        fieldPath: "groupColumn",
        summary: "Direct Means rotation requires a Group field.",
        detail: "Select a Unit-stable typed Group field and then choose an ordered negative-to-positive contrast.",
        blocks: ["build-model"],
      })],
    };
  }
  if (rotation.negativeLevel === null || rotation.positiveLevel === null) {
    return {
      ready: false,
      diagnostics: [diagnosticV3({
        id: "STANDARD_MEANS_LEVEL_REQUIRED",
        severity: "error",
        scope: "rotation",
        fieldPath: "rotation",
        summary: "Direct Means rotation requires two selected Group levels.",
        detail: "Choose explicit typed negative and positive levels; the MR1 direction is positive mean minus negative mean.",
        blocks: ["build-model"],
      })],
    };
  }
  const negativeKey = canonicalJsonV3(rotation.negativeLevel);
  const positiveKey = canonicalJsonV3(rotation.positiveLevel);
  const observedKeys = new Set([...groupByUnit.values()].map((group) => canonicalJsonV3(group)));
  const selected = [
    { name: "negative", key: negativeKey, fieldPath: "rotation.negativeLevel" },
    { name: "positive", key: positiveKey, fieldPath: "rotation.positiveLevel" },
  ] as const;
  const diagnostics: ModelDiagnosticV3[] = [];
  for (const level of selected) {
    if (observedKeys.has(level.key)) continue;
    diagnostics.push(diagnosticV3({
      id: "STANDARD_MEANS_LEVEL_EMPTY",
      severity: "error",
      scope: "rotation",
      fieldPath: level.fieldPath,
      summary: `The selected ${level.name} Means level is absent.`,
      detail: "The selected typed Group level has zero observed Units in the current dataset.",
      blocks: ["build-model"],
      evidence: evidenceV3(0, []),
    }));
  }
  if (diagnostics.length > 0) return { diagnostics, ready: false };
  if (negativeKey === positiveKey) {
    return {
      ready: false,
      diagnostics: [diagnosticV3({
        id: "STANDARD_MEANS_IDENTICAL",
        severity: "error",
        scope: "rotation",
        fieldPath: "rotation",
        summary: "The selected Group levels are identical.",
        detail: "Negative and positive must identify two distinct typed Group levels before MR1 can be fitted.",
        blocks: ["build-model"],
      })],
    };
  }
  return { diagnostics: [], ready: true };
}

function meansDiagnosticsV3(
  rotation: Extract<RotationSnapshotV3, { type: "means" }>,
  groupColumn: string | null,
  groupByUnit: ReadonlyMap<string, ScalarIdentityV3>,
  endpointByUnit: ReadonlyMap<string, number[]>,
): ModelDiagnosticV3[] {
  if (groupColumn === null) {
    return [diagnosticV3({
      id: "STANDARD_MEANS_GROUP_REQUIRED",
      severity: "error",
      scope: "rotation",
      fieldPath: "groupColumn",
      summary: "Direct Means rotation requires a Group field.",
      detail: "Select a Unit-stable typed Group field and then choose an ordered negative-to-positive contrast.",
      blocks: ["build-model"],
    })];
  }
  const output: ModelDiagnosticV3[] = [];
  if (rotation.negativeLevel === null || rotation.positiveLevel === null) {
    output.push(diagnosticV3({
      id: "STANDARD_MEANS_LEVEL_REQUIRED",
      severity: "error",
      scope: "rotation",
      fieldPath: "rotation",
      summary: "Direct Means rotation requires two selected Group levels.",
      detail: "Choose explicit typed negative and positive levels; the MR1 direction is positive mean minus negative mean.",
      blocks: ["build-model"],
    }));
    return output;
  }
  const negativeKey = canonicalJsonV3(rotation.negativeLevel);
  const positiveKey = canonicalJsonV3(rotation.positiveLevel);
  const unitsFor = (key: string): string[] => [...endpointByUnit.keys()]
    .filter((unitKey) => {
      const group = groupByUnit.get(unitKey);
      return group !== undefined && canonicalJsonV3(group) === key;
    });
  const negativeUnits = unitsFor(negativeKey);
  const positiveUnits = unitsFor(positiveKey);
  const selected = [
    { name: "negative", units: negativeUnits, fieldPath: "rotation.negativeLevel" },
    { name: "positive", units: positiveUnits, fieldPath: "rotation.positiveLevel" },
  ] as const;
  let eligible = true;
  for (const level of selected) {
    const nonZeroCount = level.units.filter((unitKey) => vectorHasSignalV3(endpointByUnit.get(unitKey) ?? [])).length;
    if (level.units.length === 0 || nonZeroCount === 0) {
      eligible = false;
      const evidenceTotal = level.units.length;
      output.push(diagnosticV3({
        id: "STANDARD_MEANS_LEVEL_EMPTY",
        severity: "error",
        scope: "rotation",
        fieldPath: level.fieldPath,
        summary: `The selected ${level.name} Means level is not eligible.`,
        detail: "Each selected typed Group level must contain at least one Unit with a non-zero Endpoint network.",
        blocks: ["build-model"],
        evidence: evidenceV3(evidenceTotal, Array.from(
          { length: Math.min(evidenceTotal, SAMPLE_LIMIT) },
          () => ({ detail: `${level.units.length} Unit(s) belong to this level; ${nonZeroCount} have a non-zero Endpoint network.` }),
        )),
      }));
    }
  }
  if (!eligible) return output;

  const normalizedByUnit = new Map<string, number[]>();
  const unitKeys = [...endpointByUnit.keys()];
  const normalized = sphereNorm(unitKeys.map((unitKey) => [...endpointByUnit.get(unitKey)!]));
  unitKeys.forEach((unitKey, index) => normalizedByUnit.set(unitKey, normalized[index]));
  const negativeMean = meanVectorV3(negativeUnits.map((unitKey) => normalizedByUnit.get(unitKey)!));
  const positiveMean = meanVectorV3(positiveUnits.map((unitKey) => normalizedByUnit.get(unitKey)!));
  const direction = positiveMean.map((value, index) => value - (negativeMean[index] ?? 0));
  const meanScale = maximumAbsoluteValueV3([negativeMean, positiveMean]);
  if (negativeKey === positiveKey
    || vectorNearZeroV3(
      direction,
      meanScale,
      direction.length,
    )) {
    const selectedUnitCount = negativeUnits.length + positiveUnits.length;
    output.push(diagnosticV3({
      id: "STANDARD_MEANS_IDENTICAL",
      severity: "error",
      scope: "rotation",
      fieldPath: "rotation",
      summary: "The selected Group means are identical.",
      detail: "The positive-minus-negative mean direction has zero length, so MR1 cannot be fitted.",
      blocks: ["build-model"],
      evidence: evidenceV3(selectedUnitCount, Array.from(
        { length: Math.min(selectedUnitCount, SAMPLE_LIMIT) },
        () => ({ detail: "Selected typed groups have the same sphere-normalized Endpoint mean." }),
      )),
    }));
    return output;
  }

  for (const level of selected) {
    if (level.units.length !== 1) continue;
    // The fixed registry has no separate small-Means-group ID. Here
    // LEVEL_EMPTY refers precisely to the empty within-group variance sample
    // (zero residual degrees of freedom), not to empty descriptive membership.
    output.push(diagnosticV3({
      id: "STANDARD_MEANS_LEVEL_EMPTY",
      severity: "warning",
      scope: "rotation",
      fieldPath: level.fieldPath,
      summary: `The selected ${level.name} Means level has no within-group variance sample.`,
      detail: "Its one eligible Unit permits descriptive Means rotation, but group inference requiring within-group variance is not estimable.",
      blocks: ["group-inference"],
      evidence: evidenceV3(1, [{ detail: "One eligible Unit gives zero within-group variance degrees of freedom." }]),
    }));
  }
  return output;
}

function trajectoryShapeDiagnosticV3(
  rows: readonly Record<string, unknown>[],
  unitColumns: readonly string[],
  horizonColumns: readonly string[],
): ModelDiagnosticV3 | null {
  const horizonsByUnit = new Map<string, Set<string>>();
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const unitKey = identityKeyV3(rows[rowIndex], unitColumns, rowIndex, "Unit");
    const horizonKey = identityKeyV3(rows[rowIndex], horizonColumns, rowIndex, "Horizon");
    const horizons = horizonsByUnit.get(unitKey) ?? new Set<string>();
    horizons.add(horizonKey);
    horizonsByUnit.set(unitKey, horizons);
  }
  const stepCounts = [...horizonsByUnit.values()].map((horizons) => horizons.size).sort((left, right) => left - right);
  if (!stepCounts.some((count) => count >= 2)) {
    return diagnosticV3({
      id: "STANDARD_TRAJECTORY_HAS_NO_PATH",
      severity: "error",
      scope: "horizons",
      fieldPath: "horizonOrder",
      summary: "The trajectory target has no path.",
      detail: "At least one typed Unit must have two or more distinct observed Horizons; steps are never imputed.",
      blocks: ["build-model"],
      evidence: evidenceV3(stepCounts.length, stepCounts.slice(0, SAMPLE_LIMIT).map((count) => ({
        detail: `Observed Unit has ${count} distinct Horizon step(s).`,
      }))),
    });
  }
  const singleCount = stepCounts.filter((count) => count === 1).length;
  if (singleCount === 0) return null;
  return diagnosticV3({
    id: "STANDARD_TRAJECTORY_SINGLE_STEP_UNITS",
    severity: "warning",
    scope: "horizons",
    fieldPath: "horizonOrder",
    summary: "Some Units have only one observed trajectory step.",
    detail: "These Units are retained without imputing a path; inference must account for the uneven observed step counts.",
    blocks: [],
    evidence: evidenceV3(singleCount, Array.from(
      { length: Math.min(singleCount, SAMPLE_LIMIT) },
      () => ({ detail: "Observed Unit has exactly one distinct Horizon step." }),
    )),
  });
}

function standardResourceShapeV3(
  rows: readonly Record<string, unknown>[],
  unitColumns: readonly string[],
  horizonColumns: readonly string[],
  model: StandardModelTypeV3,
  resolvedHorizonOrder: ReturnType<typeof resolveHorizonOrderV3> | null,
): { unitCount: number; horizonSizes: number[]; trajectorySteps: number } {
  const unitKeys = new Set<string>();
  const horizonSizesByKey = new Map<string, number>();
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    unitKeys.add(identityKeyV3(rows[rowIndex], unitColumns, rowIndex, "Unit"));
    const horizonKey = identityKeyV3(rows[rowIndex], horizonColumns, rowIndex, "Horizon");
    horizonSizesByKey.set(horizonKey, (horizonSizesByKey.get(horizonKey) ?? 0) + 1);
  }
  const horizonSizes = [...horizonSizesByKey.entries()]
    .sort(([left], [right]) => codeUnitCompareV3(left, right))
    .map(([, size]) => size);
  const trajectorySteps = model === "EndPoint"
    ? unitKeys.size
    : resolvedHorizonOrder!.unitSequences.reduce((total, sequence) => total + sequence.steps.length, 0);
  return { unitCount: unitKeys.size, horizonSizes, trajectorySteps };
}

function resourceBudgetDiagnosticV3(
  estimate: StandardResourceEstimateV3 | null,
): ModelDiagnosticV3 {
  const metrics = estimate === null ? null : {
    "numeric-cells": {
      value: estimate.estimatedNumericCells,
      limit: MAX_ESTIMATED_NUMERIC_CELLS_V3,
    },
    "window-visits": {
      value: estimate.estimatedWindowVisits,
      limit: MAX_ESTIMATED_WINDOW_VISITS_V3,
    },
    "peak-bytes": {
      value: estimate.estimatedPeakBytes,
      limit: MAX_ESTIMATED_PEAK_BYTES_V3,
    },
    "export-bytes": {
      value: estimate.estimatedExportBytes,
      limit: MAX_ESTIMATED_EXPORT_BYTES_V3,
    },
  } as const;
  const reasons = estimate?.blockedReasons ?? [];
  const samples: ModelEvidenceSampleV3[] = estimate === null
    ? [{ identity: "unsafe-arithmetic", detail: "The resource estimate could not be represented as exact nonnegative safe integers." }]
    : reasons.slice(0, SAMPLE_LIMIT).map((reason) => ({
        identity: reason,
        detail: `Estimated ${reason} ${metrics![reason].value} exceeds the fixed limit ${metrics![reason].limit}.`,
      }));
  return diagnosticV3({
    id: "RESOURCE_BUDGET_EXCEEDED",
    severity: "error",
    scope: "resources",
    fieldPath: "resources",
    summary: "The exact model configuration exceeds the fixed resource budget.",
    detail: "No rows, Codes, extents, or Horizons were reduced automatically; revise the configuration explicitly before model construction or export.",
    blocks: ["build-model", "export-current-model", "export-reference"],
    evidence: evidenceV3(estimate === null ? 1 : reasons.length, samples),
  });
}

export function validateStandardDraftV3(
  datasetValue: ParsedDataset,
  bindingValue: DatasetBindingV3,
  draftValue: StandardEnaDraftV3,
): readonly ModelDiagnosticV3[] {
  let trusted: { dataset: DatasetSnapshotV3; binding: DatasetBindingV3 };
  try {
    trusted = snapshotDatasetAndBindingV3(datasetValue, bindingValue);
  } catch {
    return finalizeDiagnosticsV3([datasetBindingInvalidDiagnosticV3()]);
  }
  const modelDraft = snapshotDraftV3(draftValue);
  const { dataset, binding } = trusted;
  const output: ModelDiagnosticV3[] = [];
  const headerSet = new Set(dataset.headers);

  const unitValidation = validateIdentityRoleV3(
    dataset.rows,
    headerSet,
    modelDraft.unitColumns,
    "Unit",
  );
  const horizonValidation = validateIdentityRoleV3(
    dataset.rows,
    headerSet,
    modelDraft.horizonColumns,
    "Horizon",
  );
  output.push(...unitValidation.diagnostics, ...horizonValidation.diagnostics);
  const groupValidation = validateGroupV3(
    dataset.rows,
    headerSet,
    modelDraft.unitColumns,
    modelDraft.groupColumn,
    unitValidation.valid,
  );
  output.push(...groupValidation.diagnostics);
  const identityAndGroupPrerequisitesValid = unitValidation.valid
    && horizonValidation.valid
    && groupValidation.valid;
  if (unitValidation.valid && horizonValidation.valid) {
    const shared = sharedHorizonDiagnosticV3(
      dataset.rows,
      modelDraft.unitColumns,
      modelDraft.horizonColumns,
    );
    if (shared !== null) output.push(shared);
  }

  const nonblankCodes = modelDraft.codes.filter((code) => code.trim().length > 0);
  const uniqueCodes = [...new Set(modelDraft.codes)].sort(codeUnitCompareV3);
  const distinctNonblankCodes = [...new Set(nonblankCodes)];
  const duplicateCodes: string[] = [];
  const seenCodes = new Set<string>();
  for (const code of nonblankCodes) {
    if (seenCodes.has(code)) duplicateCodes.push(code);
    else seenCodes.add(code);
  }
  if (distinctNonblankCodes.length < 3) {
    output.push(diagnosticV3({
      id: "STANDARD_CODES_TOO_FEW",
      severity: "error",
      scope: "codes",
      fieldPath: "codes",
      summary: "Select at least three distinct Codes.",
      detail: "Standard ENA requires at least three distinct, nonblank selected Code definitions; an empty selection remains empty.",
      blocks: ["build-model"],
      evidence: evidenceV3(distinctNonblankCodes.length, distinctNonblankCodes
        .sort(codeUnitCompareV3)
        .map((code) => ({ identity: code, detail: "Distinct selected Code." }))),
    }));
  }
  if (duplicateCodes.length > 0) {
    output.push(diagnosticV3({
      id: "STANDARD_CODES_DUPLICATE_SELECTION",
      severity: "error",
      scope: "codes",
      fieldPath: "codes",
      summary: "Code selections contain duplicates.",
      detail: "Every selected Code definition must be distinct before model construction.",
      blocks: ["build-model"],
      evidence: evidenceV3(duplicateCodes.length, duplicateCodes
        .sort(codeUnitCompareV3)
        .map((code) => ({ identity: code, detail: "Repeated selected Code definition." }))),
    }));
  }

  let moving: MovingWindowV3 | null = null;
  let resolvedRowOrder: ReturnType<typeof resolveRowOrderV3> | null = null;
  let connectivityRowWindowPrerequisitesValid = true;
  const activeRowOrderColumns: string[] = [];
  if (modelDraft.windowType === "MovingStanzaWindow") {
    try {
      moving = snapshotMovingWindowV3(modelDraft.movingStanza);
      if (moving === null) {
        connectivityRowWindowPrerequisitesValid = false;
        output.push(diagnosticV3({
          id: "STANDARD_ROW_ORDER_REQUIRED",
          severity: "error",
          scope: "windows",
          fieldPath: "movingStanza.rowOrder",
          summary: "Moving Stanza row order is required.",
          detail: "Choose explicit order fields or explicitly confirm source order before resolving the scientific window.",
          blocks: ["build-model"],
        }));
      } else {
        moving = {
          ...moving,
          rowOrder: snapshotOrderPolicyForResolverV3(
            moving.rowOrder,
            "draft.movingStanza.rowOrder",
          ),
        };
        if (moving.rowOrder.kind === "columns") {
          activeRowOrderColumns.push(...moving.rowOrder.keys.map((key) => key.column));
          if (moving.rowOrder.keys.some((key) => !headerSet.has(key.column))) {
            throw new TypeError("Moving Stanza row-order fields must exist in the current dataset header.");
          }
        }
        try {
          resolvedRowOrder = resolveRowOrderV3(dataset.rows, modelDraft.horizonColumns, moving.rowOrder, {
            analysisFamily: "standard",
            confirmationAnalysisFamily: "standard",
            datasetBinding: binding,
          });
        } catch (error) {
          if (unitValidation.valid && horizonValidation.valid
            || (error instanceof OrderingDomainErrorV3
              && error.code === "SOURCE_CONFIRMATION_STALE")) throw error;
        }
      }
    } catch (error) {
      connectivityRowWindowPrerequisitesValid = false;
      moving = null;
      output.push(orderFailureDiagnosticV3("row", error));
    }
  }

  let resolvedHorizonOrder: ReturnType<typeof resolveHorizonOrderV3> | null = null;
  let horizonOrderPrerequisitesValid = true;
  const activeHorizonOrderColumns: string[] = [];
  if (modelDraft.model !== "EndPoint") {
    if (modelDraft.horizonOrder === null) {
      horizonOrderPrerequisitesValid = false;
      output.push(diagnosticV3({
        id: "STANDARD_HORIZON_ORDER_REQUIRED",
        severity: "error",
        scope: "horizons",
        fieldPath: "horizonOrder",
        summary: "Trajectory Horizon order is required.",
        detail: "A trajectory model requires explicit Horizon order fields or explicitly confirmed source order.",
        blocks: ["build-model"],
      }));
    } else {
      try {
        const horizonPolicy = snapshotOrderPolicyForResolverV3(modelDraft.horizonOrder, "draft.horizonOrder");
        if (horizonPolicy.kind === "columns") {
          activeHorizonOrderColumns.push(...horizonPolicy.keys.map((key) => key.column));
          if (horizonPolicy.keys.some((key) => !headerSet.has(key.column))) {
            throw new TypeError("Trajectory Horizon-order fields must exist in the current dataset header.");
          }
        }
        try {
          resolvedHorizonOrder = resolveHorizonOrderV3(
            dataset.rows,
            modelDraft.unitColumns,
            modelDraft.horizonColumns,
            horizonPolicy,
            {
              analysisFamily: "standard",
              confirmationAnalysisFamily: "standard",
              datasetBinding: binding,
            },
          );
        } catch (error) {
          if (unitValidation.valid && horizonValidation.valid
            || (error instanceof OrderingDomainErrorV3
              && error.code === "SOURCE_CONFIRMATION_STALE")) throw error;
        }
      } catch (error) {
        horizonOrderPrerequisitesValid = false;
        output.push(orderFailureDiagnosticV3("horizon", error));
      }
    }
  }

  const roles = new Map<string, Set<string>>();
  const addRole = (column: string, role: string): void => {
    const assigned = roles.get(column) ?? new Set<string>();
    assigned.add(role);
    roles.set(column, assigned);
  };
  for (const column of modelDraft.unitColumns) addRole(column, "Unit identity");
  for (const column of modelDraft.horizonColumns) addRole(column, "Horizon identity");
  if (modelDraft.groupColumn !== null) addRole(modelDraft.groupColumn, "Group metadata");
  for (const column of activeRowOrderColumns) addRole(column, "active Moving Stanza row order");
  for (const column of activeHorizonOrderColumns) addRole(column, "active trajectory Horizon order");

  const missingCodes = new Set<string>();
  const collidingCodes = new Set<string>();
  for (const code of uniqueCodes) {
    if (!headerSet.has(code)) {
      missingCodes.add(code);
      output.push(diagnosticV3({
        id: "STANDARD_CODE_FIELD_MISSING",
        severity: "error",
        scope: "codes",
        fieldPath: `codes.${code}`,
        summary: `Code “${code}” is missing.`,
        detail: "The selected Code field is not present in the current dataset header.",
        blocks: ["build-model"],
        evidence: evidenceV3(1, [{ identity: code, detail: "Selected Code is absent from the header." }]),
        suggestedActions: [excludeCodeActionV3(code)],
      }));
      continue;
    }
    const assignedRoles = [...(roles.get(code) ?? [])].sort(codeUnitCompareV3);
    if (assignedRoles.length > 0) {
      collidingCodes.add(code);
      output.push(diagnosticV3({
        id: "STANDARD_CODE_ROLE_COLLISION",
        severity: "error",
        scope: "codes",
        fieldPath: `codes.${code}`,
        summary: `Code “${code}” has an active structural role.`,
        detail: "A selected Code cannot also serve as an active Unit, Horizon, Group, row-order, or Horizon-order field.",
        blocks: ["build-model"],
        evidence: evidenceV3(assignedRoles.length, assignedRoles.map((role) => ({
          identity: code,
          detail: `Selected Code is also the ${role} field.`,
        }))),
      }));
    }
  }

  const invalidCodes = new Set<string>();
  const profiles: NormalizedCodeProfileV3[] = [];
  for (const code of uniqueCodes) {
    if (missingCodes.has(code) || collidingCodes.has(code)) continue;
    const analyzed = analyzeCodeProfileV3(dataset.rows, code, modelDraft.weighting);
    if (analyzed.profile === null) {
      invalidCodes.add(code);
      output.push(diagnosticV3({
        id: "STANDARD_CODE_VALUE_INVALID",
        severity: "error",
        scope: "codes",
        fieldPath: `codes.${code}`,
        summary: `Code “${code}” is incompatible with ${modelDraft.weighting} weighting.`,
        detail: modelDraft.weighting === "binary"
          ? "Binary values must use one consistent representation per Code: only numeric 0/1 or only Boolean false/true; values are never coerced."
          : "Frequency values must be finite, nonnegative numbers; values are never coerced.",
        blocks: ["build-model"],
        evidence: evidenceV3(analyzed.invalidRows.length, analyzed.invalidRows
          .slice(0, SAMPLE_LIMIT)
          .map((rowIndex) => ({
            rowIndex,
            identity: code,
            detail: `Invalid ${modelDraft.weighting} Code value.`,
          }))),
      }));
      continue;
    }
    profiles.push(analyzed.profile);
    if (analyzed.profile.allZero) {
      output.push(diagnosticV3({
        id: "STANDARD_CODE_ALL_ZERO",
        severity: "error",
        scope: "codes",
        fieldPath: `codes.${code}`,
        summary: `Code “${code}” is all zero.`,
        detail: "An all-zero Code cannot form a scientific connection and blocks model construction.",
        blocks: ["build-model"],
        evidence: evidenceV3(dataset.rows.length, dataset.rows
          .slice(0, SAMPLE_LIMIT)
          .map((_, rowIndex) => ({
            rowIndex,
            identity: code,
            detail: "Validated Code value has zero magnitude.",
          }))),
        suggestedActions: [excludeCodeActionV3(code)],
      }));
    }
  }

  const scientificFieldPrerequisitesValid = distinctNonblankCodes.length >= 3
    && duplicateCodes.length === 0
    && missingCodes.size === 0
    && collidingCodes.size === 0
    && invalidCodes.size === 0
    && profiles.length === uniqueCodes.length
    && profiles.every((profile) => !profile.allZero)
    && identityAndGroupPrerequisitesValid;
  const profileByCode = new Map(profiles.map((profile) => [profile.code, profile]));
  const profilesInDraftOrder = modelDraft.codes
    .map((code) => profileByCode.get(code))
    .filter((profile): profile is NormalizedCodeProfileV3 => profile !== undefined);
  const basicPrerequisitesValid = dataset.rows.length > 0 && scientificFieldPrerequisitesValid;
  const rowOrderReady = modelDraft.windowType === "Conversation" || resolvedRowOrder !== null;
  const horizonOrderReady = modelDraft.model === "EndPoint" || resolvedHorizonOrder !== null;
  let resourceBlocked = false;
  if (scientificFieldPrerequisitesValid && rowOrderReady && horizonOrderReady) {
    try {
      const shape = standardResourceShapeV3(
        dataset.rows,
        modelDraft.unitColumns,
        modelDraft.horizonColumns,
        modelDraft.model,
        resolvedHorizonOrder,
      );
      const estimate = estimateStandardResourcesV3({
        rowCount: dataset.rows.length,
        unitCount: shape.unitCount,
        horizonCount: shape.horizonSizes.length,
        codeCount: profilesInDraftOrder.length,
        horizonSizes: shape.horizonSizes,
        trajectorySteps: shape.trajectorySteps,
        windowType: modelDraft.windowType,
        backward: modelDraft.windowType === "MovingStanzaWindow"
          ? moving!.backward
          : { kind: "finite", value: 1 },
        forward: modelDraft.windowType === "MovingStanzaWindow"
          ? moving!.forward
          : { kind: "finite", value: 0 },
        referenceProjection: modelDraft.rotation.type === "reference",
      });
      if (estimate.blocked) {
        resourceBlocked = true;
        output.push(resourceBudgetDiagnosticV3(estimate));
      }
    } catch {
      resourceBlocked = true;
      output.push(resourceBudgetDiagnosticV3(null));
    }
  }

  if (basicPrerequisitesValid) {
    const duplicateProfiles = new Map<string, string[]>();
    for (const profile of profiles.filter((entry) => !entry.allZero)) {
      const matches = duplicateProfiles.get(profile.signature) ?? [];
      matches.push(profile.code);
      duplicateProfiles.set(profile.signature, matches);
    }
    for (const group of [...duplicateProfiles.values()]
      .map((codes) => codes.sort(codeUnitCompareV3))
      .filter((codes) => codes.length > 1)
      .sort((left, right) => codeUnitCompareV3(left[0], right[0]))) {
      const [original, ...duplicates] = group;
      for (const code of duplicates) {
        output.push(diagnosticV3({
          id: "STANDARD_CODE_DUPLICATE_PROFILE",
          severity: "warning",
          scope: "codes",
          fieldPath: `codes.${code}`,
          summary: `Code “${code}” duplicates another Code profile.`,
          detail: `Code “${code}” has the exact same validated typed source vector as Code “${original}”.`,
          blocks: [],
          evidence: evidenceV3(group.length, group.map((member) => ({
            identity: member,
            detail: "Member of this exact typed profile group.",
          }))),
          suggestedActions: [excludeCodeActionV3(code)],
        }));
      }
    }
  }

  let connectivity: ConnectivityV3 | null = null;
  if (basicPrerequisitesValid && connectivityRowWindowPrerequisitesValid && !resourceBlocked) {
    try {
      if (modelDraft.windowType === "Conversation") {
        connectivity = connectivityFromGroupsV3(
          conversationGroupsV3(dataset.rows, modelDraft.unitColumns, modelDraft.horizonColumns),
          profiles,
          null,
        );
      } else if (moving !== null && resolvedRowOrder !== null) {
        connectivity = connectivityFromGroupsV3(
          movingGroupsV3(resolvedRowOrder),
          profiles,
          moving,
        );
      }
    } catch {
      connectivity = null;
      if (modelDraft.windowType === "MovingStanzaWindow"
        && !output.some((entry) => entry.id === "STANDARD_ROW_ORDER_INVALID"
          || entry.id === "STANDARD_ROW_ORDER_REQUIRED")) {
        output.push(diagnosticV3({
          id: "STANDARD_ROW_ORDER_INVALID",
          severity: "error",
          scope: "windows",
          fieldPath: "movingStanza.rowOrder",
          summary: "Moving Stanza row order could not be resolved.",
          detail: "Ordering ties, missing identities, stale source confirmation, or invalid order values must be resolved first.",
          blocks: ["build-model"],
        }));
      }
    }
  }

  if (connectivity !== null) {
    for (const profile of [...profiles].sort((left, right) => codeUnitCompareV3(left.code, right.code))) {
      if (profile.allZero || connectivity.degreeByCode.get(profile.code) !== 0) continue;
      output.push(diagnosticV3({
        id: "STANDARD_CODE_ISOLATED",
        severity: "warning",
        scope: "codes",
        fieldPath: `codes.${profile.code}`,
        summary: `Code “${profile.code}” is isolated in the candidate network.`,
        detail: "This is a strong scientific warning, but the Code is retained because isolation may be substantively meaningful.",
        blocks: [],
        evidence: evidenceV3(1, [{ identity: profile.code, detail: "Candidate scientific-window degree is zero." }]),
        suggestedActions: [excludeCodeActionV3(profile.code)],
      }));
    }
    if (connectivity.edgeCount === 0) {
      output.push(diagnosticV3({
        id: "STANDARD_NO_GLOBAL_COOCCURRENCE",
        severity: "error",
        scope: "codes",
        fieldPath: "codes",
        summary: "The candidate network has no global co-occurrence edge.",
        detail: "No pair of selected Codes is jointly present under the resolved candidate scientific window.",
        blocks: ["build-model"],
        evidence: evidenceV3(connectivity.candidateWindowCount, Array.from(
          { length: Math.min(connectivity.candidateWindowCount, SAMPLE_LIMIT) },
          (_, index) => ({ identity: `window-${index + 1}`, detail: "Resolved candidate window contains no Code pair." }),
        )),
      }));
    }
  }

  const trajectoryMeansInvalid = modelDraft.model !== "EndPoint" && modelDraft.rotation.type === "means";
  if (trajectoryMeansInvalid) {
    output.push(diagnosticV3({
      id: "STANDARD_MEANS_REQUIRES_ENDPOINT",
      severity: "error",
      scope: "rotation",
      fieldPath: "rotation",
      summary: "Direct Means rotation requires EndPoint.",
      detail: "Keep the selected Means rotation visible and choose EndPoint, or explicitly choose a supported SVD or Reference rotation.",
      blocks: ["build-model"],
    }));
  }
  const referenceInvalid = referenceFieldsDiagnosticV3(modelDraft.rotation);
  if (referenceInvalid !== null) output.push(referenceInvalid);
  let meansMembershipReady = true;
  if (modelDraft.model === "EndPoint" && modelDraft.rotation.type === "means"
    && identityAndGroupPrerequisitesValid) {
    const membership = meansMembershipPrerequisitesV3(
      modelDraft.rotation,
      modelDraft.groupColumn,
      groupValidation.groupByUnit,
    );
    output.push(...membership.diagnostics);
    meansMembershipReady = membership.ready;
  }

  const rotationShapeReady = !trajectoryMeansInvalid && referenceInvalid === null
    && meansMembershipReady;
  let networks: ScientificNetworksV3 | null = null;
  const emptyTargetReady = dataset.rows.length === 0
    && scientificFieldPrerequisitesValid
    && rowOrderReady
    && horizonOrderReady
    && !trajectoryMeansInvalid
    && referenceInvalid === null;
  if (emptyTargetReady) {
    const rankDiagnostic = rankDiagnosticV3(0, modelDraft.rotation, 0);
    if (rankDiagnostic !== null) output.push(rankDiagnostic);
  } else if (scientificFieldPrerequisitesValid && rowOrderReady && horizonOrderReady
    && rotationShapeReady && !resourceBlocked) {
    networks = scientificNetworksV3(
      dataset.rows,
      modelDraft.unitColumns,
      modelDraft.horizonColumns,
      profilesInDraftOrder,
      modelDraft.weighting,
      modelDraft.windowType,
      moving,
      resolvedRowOrder,
      modelDraft.model,
      resolvedHorizonOrder,
    );
    if (networks !== null && !scientificNetworksFiniteV3(networks)) {
      output.push(diagnosticV3({
        id: "STANDARD_OUTPUT_NONFINITE",
        severity: "error",
        scope: "rotation",
        fieldPath: "rotation",
        summary: "Scientific network accumulation produced a non-finite value.",
        detail: "Finite source values overflowed during exact window accumulation; model construction cannot continue safely.",
        blocks: ["build-model"],
      }));
      networks = null;
    } else if (networks !== null) {
      let numericalPrerequisitesReady = true;
      if (modelDraft.rotation.type === "means") {
        const meansDiagnostics = meansDiagnosticsV3(
          modelDraft.rotation,
          modelDraft.groupColumn,
          groupValidation.groupByUnit,
          networks.endpointByUnit,
        );
        output.push(...meansDiagnostics);
        numericalPrerequisitesReady = !meansDiagnostics.some((entry) => entry.severity === "error");
      }
      if (modelDraft.rotation.type !== "reference" && numericalPrerequisitesReady) {
        const zeroObservation = zeroObservationDiagnosticV3(networks.targetVectors);
        if (zeroObservation !== null) {
          output.push(zeroObservation);
          numericalPrerequisitesReady = false;
        }
      }
      if (numericalPrerequisitesReady) {
        const centerAlignToOrigin = modelDraft.rotation.type === "reference"
          ? true
          : modelDraft.rotation.centerAlignToOrigin;
        const rank = centeredRankV3(networks.targetVectors, centerAlignToOrigin);
        const rankDiagnostic = rankDiagnosticV3(
          rank,
          modelDraft.rotation,
          networks.targetVectors.length,
        );
        if (rankDiagnostic !== null) output.push(rankDiagnostic);
      }
    }
  }

  if (modelDraft.model !== "EndPoint"
    && scientificFieldPrerequisitesValid
    && horizonOrderPrerequisitesValid
    && resolvedHorizonOrder !== null) {
    const shape = trajectoryShapeDiagnosticV3(
      dataset.rows,
      modelDraft.unitColumns,
      modelDraft.horizonColumns,
    );
    if (shape !== null) output.push(shape);
  }

  return finalizeDiagnosticsV3(output);
}
