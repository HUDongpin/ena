import {
  canonicalJsonV3,
  deepFreezeV3,
  snapshotDenseJsonArrayV3,
  snapshotPlainJsonRecordV3,
} from "./canonical-json";
import { scalarIdentityV3 } from "./identity";
import { resolveRowOrderV3 } from "./ordering";
import { datasetHashKindFor } from "../types";
import type { ParsedDataset, DatasetHashKind } from "../types";
import type {
  BackwardExtentV3,
  CanonicalHorizonOrderV3,
  CanonicalRowOrderV3,
  DatasetBindingV3,
  ForwardExtentV3,
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

export type ModelDraftPatchV3 =
  | { readonly type: "exclude-code"; readonly code: string }
  | { readonly type: "replace-row-order"; readonly value: CanonicalRowOrderV3 }
  | { readonly type: "replace-horizon-order"; readonly value: CanonicalHorizonOrderV3 }
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
}

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

const own = Object.prototype.hasOwnProperty;
const SAMPLE_LIMIT = 5 as const;
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
  };
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

function assertOrderComparatorShapeV3(value: unknown, label: string): void {
  const comparator = snapshotPlainJsonRecordV3(value, label);
  if (comparator.type === "number") {
    assertExactKeysV3(comparator, ["type"], label);
    return;
  }
  if (comparator.type === "date") {
    assertExactKeysV3(comparator, ["type", "format"], label);
    if (comparator.format !== "YYYY-MM-DD") throw new TypeError(`${label}.format is invalid.`);
    return;
  }
  if (comparator.type === "datetime") {
    assertExactKeysV3(comparator, ["type", "format", "timeZone"], label);
    if (comparator.format !== "ISO-8601" || comparator.timeZone !== "offset-in-value") {
      throw new TypeError(`${label} datetime contract is invalid.`);
    }
    return;
  }
  if (comparator.type === "ordered-category") {
    assertExactKeysV3(comparator, ["type", "levels"], label);
    const levels = snapshotDenseJsonArrayV3(comparator.levels, `${label}.levels`);
    if (levels.length === 0) throw new TypeError(`${label}.levels must be nonempty.`);
    const signatures = levels.map((level, index) => {
      const scalar = snapshotPlainJsonRecordV3(level, `${label}.levels[${index}]`);
      assertExactKeysV3(scalar, ["type", "value"], `${label}.levels[${index}]`);
      const normalized = scalarIdentityV3(scalar.value, `${label}.levels[${index}].value`);
      if (scalar.type !== normalized.type) throw new TypeError(`${label}.levels[${index}] type is inconsistent.`);
      return canonicalJsonV3(normalized);
    });
    if (new Set(signatures).size !== signatures.length) throw new TypeError(`${label}.levels must be distinct.`);
    return;
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
    return;
  }
  throw new TypeError(`${label}.type is unsupported.`);
}

function activeOrderColumnsV3(value: unknown, label: string): string[] {
  if (value === null) return [];
  const policy = snapshotPlainJsonRecordV3(value, label);
  if (policy.kind === "source-order-confirmed") {
    assertExactKeysV3(policy, ["kind", "confirmation"], label);
    canonicalJsonV3(policy.confirmation);
    return [];
  }
  if (policy.kind !== "columns") throw new TypeError(`${label}.kind is unsupported.`);
  assertExactKeysV3(policy, ["kind", "keys"], label);
  const rawKeys = snapshotDenseJsonArrayV3(policy.keys, `${label}.keys`);
  if (rawKeys.length === 0) throw new TypeError(`${label}.keys must be nonempty.`);
  const columns = rawKeys.map((key, index) => {
    const record = snapshotPlainJsonRecordV3(key, `${label}.keys[${index}]`);
    assertExactKeysV3(record, ["column", "direction", "comparator"], `${label}.keys[${index}]`);
    if (typeof record.column !== "string" || record.column.trim().length === 0) {
      throw new TypeError(`${label}.keys[${index}].column must be nonblank.`);
    }
    if (record.direction !== "ascending" && record.direction !== "descending") {
      throw new TypeError(`${label}.keys[${index}].direction is invalid.`);
    }
    assertOrderComparatorShapeV3(record.comparator, `${label}.keys[${index}].comparator`);
    return record.column;
  });
  if (new Set(columns).size !== columns.length) throw new TypeError(`${label} columns must be distinct.`);
  return columns;
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

function identityPrerequisitesValidV3(
  rows: readonly Record<string, unknown>[],
  unitColumns: readonly string[],
  horizonColumns: readonly string[],
): boolean {
  if (unitColumns.length === 0 || horizonColumns.length === 0) return false;
  try {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      for (const [role, columns] of [
        ["Unit", unitColumns],
        ["Horizon", horizonColumns],
      ] as const) {
        for (const column of columns) {
          if (!own.call(row, column)) return false;
          scalarIdentityV3(row[column], `row ${rowIndex} ${role}.${column}`);
        }
      }
    }
  } catch {
    return false;
  }
  return true;
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
  const visitWindow = (indices: readonly number[]): void => {
    candidateWindowCount += 1;
    const present = codes.filter((code) => {
      const values = profileByCode.get(code)!.magnitudes;
      return indices.reduce((sum, rowIndex) => sum + values[rowIndex], 0) > 0;
    });
    for (let leftIndex = 0; leftIndex < present.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < present.length; rightIndex += 1) {
        const left = present[leftIndex];
        const right = present[rightIndex];
        const pair = codeUnitCompareV3(left, right) <= 0 ? `${JSON.stringify(left)}|${JSON.stringify(right)}` : `${JSON.stringify(right)}|${JSON.stringify(left)}`;
        if (edges.has(pair)) continue;
        edges.add(pair);
        degreeByCode.set(left, degreeByCode.get(left)! + 1);
        degreeByCode.set(right, degreeByCode.get(right)! + 1);
      }
    }
  };
  for (const group of groups) {
    if (moving === null) {
      visitWindow(group);
      continue;
    }
    for (let ordinal = 0; ordinal < group.length; ordinal += 1) {
      const start = moving.backward.kind === "infinity"
        ? 0
        : Math.max(0, ordinal - (moving.backward.value - 1));
      const end = moving.forward.kind === "infinity"
        ? group.length - 1
        : Math.min(group.length - 1, ordinal + moving.forward.value);
      visitWindow(group.slice(start, end + 1));
    }
  }
  return { degreeByCode, edgeCount: edges.size, candidateWindowCount };
}

function conversationGroupsV3(
  rows: readonly Record<string, unknown>[],
  horizonColumns: readonly string[],
): number[][] {
  const byHorizon = new Map<string, number[]>();
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const key = typedHorizonKeyV3(rows[rowIndex], horizonColumns, rowIndex);
    const indices = byHorizon.get(key) ?? [];
    indices.push(rowIndex);
    byHorizon.set(key, indices);
  }
  return [...byHorizon.entries()]
    .sort(([left], [right]) => codeUnitCompareV3(left, right))
    .map(([, indices]) => indices);
}

function movingGroupsV3(
  rows: readonly Record<string, unknown>[],
  horizonColumns: readonly string[],
  binding: DatasetBindingV3,
  moving: MovingWindowV3,
): number[][] {
  const resolved = resolveRowOrderV3(rows, horizonColumns, moving.rowOrder, {
    analysisFamily: "standard",
    confirmationAnalysisFamily: "standard",
    datasetBinding: binding,
  });
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
        activeRowOrderColumns.push(...activeOrderColumnsV3(moving.rowOrder, "draft.movingStanza.rowOrder"));
      }
    } catch {
      connectivityRowWindowPrerequisitesValid = false;
      moving = null;
      output.push(diagnosticV3({
        id: "STANDARD_ROW_ORDER_INVALID",
        severity: "error",
        scope: "windows",
        fieldPath: "movingStanza.rowOrder",
        summary: "Moving Stanza ordering or extent is invalid.",
        detail: "The candidate window cannot be resolved until its order and finite or Infinity extents are valid.",
        blocks: ["build-model"],
      }));
    }
  }

  const activeHorizonOrderColumns: string[] = [];
  if (modelDraft.model !== "EndPoint") {
    if (modelDraft.horizonOrder === null) {
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
        activeHorizonOrderColumns.push(...activeOrderColumnsV3(modelDraft.horizonOrder, "draft.horizonOrder"));
      } catch {
        output.push(diagnosticV3({
          id: "STANDARD_HORIZON_ORDER_INVALID",
          severity: "error",
          scope: "horizons",
          fieldPath: "horizonOrder",
          summary: "Trajectory Horizon order is invalid.",
          detail: "The active trajectory order policy must have a valid exact structure.",
          blocks: ["build-model"],
        }));
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
        evidence: evidenceV3(analyzed.invalidRows.length, analyzed.invalidRows.map((rowIndex) => ({
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
        evidence: evidenceV3(dataset.rows.length, dataset.rows.map((_, rowIndex) => ({
          rowIndex,
          identity: code,
          detail: "Validated Code value has zero magnitude.",
        }))),
        suggestedActions: [excludeCodeActionV3(code)],
      }));
    }
  }

  const basicPrerequisitesValid = dataset.rows.length > 0
    && distinctNonblankCodes.length >= 3
    && duplicateCodes.length === 0
    && missingCodes.size === 0
    && collidingCodes.size === 0
    && invalidCodes.size === 0
    && profiles.length === uniqueCodes.length
    && profiles.every((profile) => !profile.allZero)
    && identityPrerequisitesValidV3(dataset.rows, modelDraft.unitColumns, modelDraft.horizonColumns);

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
  if (basicPrerequisitesValid && connectivityRowWindowPrerequisitesValid) {
    try {
      if (modelDraft.windowType === "Conversation") {
        connectivity = connectivityFromGroupsV3(
          conversationGroupsV3(dataset.rows, modelDraft.horizonColumns),
          profiles,
          null,
        );
      } else if (moving !== null) {
        connectivity = connectivityFromGroupsV3(
          movingGroupsV3(dataset.rows, modelDraft.horizonColumns, binding, moving),
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

  return finalizeDiagnosticsV3(output);
}
