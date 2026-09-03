import {
  canonicalJsonV3,
  deepFreezeV3,
  snapshotDenseJsonArrayV3,
  snapshotPlainJsonRecordV3,
} from "./canonical-json";
import { scalarIdentityV3 } from "./identity";
import type {
  CanonicalHorizonOrderV3,
  CanonicalRowOrderV3,
  DatasetBoundConfirmationV3,
  DatasetBindingV3,
  OrderComparatorV3,
  OrderKeyV3,
  ScalarIdentityV3,
} from "./types";

type SourceRowV3 = Record<string, unknown>;
type ResolvedOrderValueV3 = string | number;

export type DeepReadonlyV3<T> = T extends object
  ? { readonly [Key in keyof T]: DeepReadonlyV3<T[Key]> }
  : T;

type ColumnsOrderPolicyV3 = Extract<CanonicalRowOrderV3, { kind: "columns" }>;
type SourceOrderPolicyV3 = Extract<CanonicalRowOrderV3, { kind: "source-order-confirmed" }>;

export interface OrderingResolutionContextV3 {
  readonly analysisFamily: "standard" | "ona";
  readonly confirmationAnalysisFamily: "standard" | "ona";
  readonly datasetBinding: DeepReadonlyV3<DatasetBindingV3>;
}

export interface ResolvedSourceOrderBindingV3 {
  readonly analysisFamily: "standard" | "ona";
  readonly datasetBinding: DeepReadonlyV3<DatasetBindingV3>;
  readonly confirmation: DeepReadonlyV3<DatasetBoundConfirmationV3>;
}

export interface TextCollationBindingV3 {
  readonly column: string;
  readonly requestedLocale: string;
  readonly resolvedLocale: string;
  readonly collation: string;
  readonly sensitivity: "base" | "accent" | "case" | "variant";
  readonly numeric: boolean;
  readonly usage: "sort";
  readonly ignorePunctuation: boolean;
  readonly caseFirst: "upper" | "lower" | "false";
}

export interface ResolvedRowOrderingV3 {
  readonly type: "within-horizon-order";
  readonly requestedPolicy: DeepReadonlyV3<CanonicalRowOrderV3>;
  readonly mappings: ReadonlyArray<{
    readonly sourceRowIndex: number;
    readonly horizonKey: string;
    readonly orderTuple: ReadonlyArray<ResolvedOrderValueV3>;
    readonly withinHorizonOrdinal: number;
  }>;
  readonly orderedSourceRowIndices: ReadonlyArray<number>;
  readonly sourceOrderBinding: DeepReadonlyV3<ResolvedSourceOrderBindingV3> | null;
  readonly textCollationBindings: ReadonlyArray<DeepReadonlyV3<TextCollationBindingV3>>;
}

export interface ResolvedHorizonOrderingV3 {
  readonly type: "trajectory-horizon-order";
  readonly horizonTuples: ReadonlyArray<{
    readonly horizonKey: string;
    readonly orderTuple: ReadonlyArray<ResolvedOrderValueV3>;
  }>;
  readonly unitSequences: ReadonlyArray<{
    readonly unitKey: string;
    readonly steps: ReadonlyArray<{
      readonly horizonKey: string;
      readonly trajectoryOrdinal: number;
    }>;
  }>;
  readonly implementationHorizonOrder: ReadonlyArray<string>;
  readonly sourceOrderBinding: DeepReadonlyV3<ResolvedSourceOrderBindingV3> | null;
  readonly textCollationBindings: ReadonlyArray<DeepReadonlyV3<TextCollationBindingV3>>;
}

interface CompiledOrderKeyV3 {
  key: OrderKeyV3;
  collator: Intl.Collator | null;
  categoryIndex: ReadonlyMap<string, number> | null;
  textCollationBinding: TextCollationBindingV3 | null;
}

interface NormalizedOrderPolicyV3 {
  policy: CanonicalRowOrderV3;
  keys: CompiledOrderKeyV3[] | null;
}

interface ResolvedTupleV3 {
  values: ResolvedOrderValueV3[];
}

interface ResolvedRowV3 extends ResolvedTupleV3 {
  sourceRowIndex: number;
}

interface ResolvedHorizonV3 extends ResolvedTupleV3 {
  horizonKey: string;
}

const own = Object.prototype.hasOwnProperty;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|([+-])(\d{2}):(\d{2}))$/u;
const CANONICAL_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

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

function snapshotColumnListV3(value: unknown, label: string): string[] {
  const snapshot = snapshotDenseJsonArrayV3(value, label);
  if (snapshot.length === 0) throw new TypeError(`${label} must be a nonempty dense list of distinct nonblank strings.`);
  const columns = snapshot.map((column, index) => {
    if (typeof column !== "string" || column.trim().length === 0) {
      throw new TypeError(`${label}[${index}] must be a nonblank string.`);
    }
    return column;
  });
  if (new Set(columns).size !== columns.length) {
    throw new TypeError(`${label} must contain distinct column names.`);
  }
  return columns;
}

function snapshotRowsV3(rows: unknown): SourceRowV3[] {
  const snapshot = snapshotDenseJsonArrayV3(rows, "rows");
  return snapshot.map((row, rowIndex) => snapshotPlainJsonRecordV3(row, `row ${rowIndex}`));
}

function readOwnDataPropertyV3(row: SourceRowV3, column: string, label: string): unknown {
  if (!own.call(row, column)) {
    throw new TypeError(`${label} is missing required property ${JSON.stringify(column)}.`);
  }
  const descriptor = Object.getOwnPropertyDescriptor(row, column);
  if (descriptor === undefined || !("value" in descriptor)) {
    throw new TypeError(`${label}.${column} must be an own enumerable data property.`);
  }
  return descriptor.value;
}

function scalarIdentityKeyV3(value: ScalarIdentityV3): string {
  return canonicalJsonV3({ type: value.type, value: value.value });
}

function canonicalIdentityKeyV3(row: SourceRowV3, columns: readonly string[], label: string): string {
  const fields = columns.map((column) => ({
    column,
    value: scalarIdentityV3(readOwnDataPropertyV3(row, column, label), `${label}.${column}`),
  }));
  return canonicalJsonV3({ fields });
}

function snapshotScalarIdentityV3(value: unknown, label: string): ScalarIdentityV3 {
  const record = snapshotPlainJsonRecordV3(value, label);
  assertExactKeysV3(record, ["type", "value"], label);
  const scalar = scalarIdentityV3(record.value, `${label}.value`);
  if (record.type !== scalar.type) {
    throw new TypeError(`${label} has an inconsistent declared scalar type.`);
  }
  return scalar;
}

function explicitUnicodeKeywordV3(locale: Intl.Locale, wantedKey: "co" | "kf" | "kn"): string | null {
  const tokens = locale.toString().split("-");
  let unicodeIndex = -1;
  for (let index = 1; index < tokens.length; index += 1) {
    if (tokens[index].length !== 1) continue;
    if (tokens[index] === "x") return null;
    if (tokens[index] === "u") {
      unicodeIndex = index;
      break;
    }
  }
  if (unicodeIndex < 0) return null;
  let index = unicodeIndex + 1;
  while (index < tokens.length && tokens[index].length >= 3) index += 1;
  while (index < tokens.length && tokens[index].length !== 1) {
    const key = tokens[index];
    if (key.length !== 2) return null;
    index += 1;
    const type: string[] = [];
    while (index < tokens.length && tokens[index].length >= 3) {
      type.push(tokens[index]);
      index += 1;
    }
    if (key === wantedKey) return type.length === 0 ? "true" : type.join("-");
  }
  return null;
}

function snapshotComparatorV3(
  value: unknown,
  label: string,
): {
  comparator: OrderComparatorV3;
  collator: Intl.Collator | null;
  categoryIndex: ReadonlyMap<string, number> | null;
  textCollationBinding: Omit<TextCollationBindingV3, "column"> | null;
} {
  const record = snapshotPlainJsonRecordV3(value, label);
  const type = record.type;
  if (type === "number") {
    assertExactKeysV3(record, ["type"], `${label} number comparator`);
    return {
      comparator: { type: "number" },
      collator: null,
      categoryIndex: null,
      textCollationBinding: null,
    };
  }
  if (type === "date") {
    assertExactKeysV3(record, ["type", "format"], `${label} date comparator`);
    if (record.format !== "YYYY-MM-DD") {
      throw new TypeError(`${label}.format must be YYYY-MM-DD.`);
    }
    return {
      comparator: { type: "date", format: "YYYY-MM-DD" },
      collator: null,
      categoryIndex: null,
      textCollationBinding: null,
    };
  }
  if (type === "datetime") {
    assertExactKeysV3(record, ["type", "format", "timeZone"], `${label} datetime comparator`);
    if (record.format !== "ISO-8601" || record.timeZone !== "offset-in-value") {
      throw new TypeError(`${label} requires ISO-8601 with timeZone offset-in-value.`);
    }
    return {
      comparator: { type: "datetime", format: "ISO-8601", timeZone: "offset-in-value" },
      collator: null,
      categoryIndex: null,
      textCollationBinding: null,
    };
  }
  if (type === "ordered-category") {
    assertExactKeysV3(record, ["type", "levels"], `${label} ordered-category comparator`);
    const rawLevels = snapshotDenseJsonArrayV3(record.levels, `${label}.levels`);
    if (rawLevels.length === 0) throw new TypeError(`${label}.levels must be nonempty.`);
    const levels = rawLevels.map((level, index) => snapshotScalarIdentityV3(level, `${label}.levels[${index}]`));
    const categoryIndex = new Map<string, number>();
    for (let index = 0; index < levels.length; index += 1) {
      const identity = scalarIdentityKeyV3(levels[index]);
      if (categoryIndex.has(identity)) {
        throw new TypeError(`${label}.levels must contain distinct typed identities.`);
      }
      categoryIndex.set(identity, index);
    }
    return {
      comparator: { type: "ordered-category", levels },
      collator: null,
      categoryIndex,
      textCollationBinding: null,
    };
  }
  if (type === "text") {
    assertExactKeysV3(record, ["type", "locale", "sensitivity", "numeric"], `${label} text comparator`);
    if (typeof record.locale !== "string" || record.locale.trim().length === 0) {
      throw new TypeError(`${label}.locale must be a canonical BCP-47 locale.`);
    }
    let canonicalLocales: string[];
    try {
      canonicalLocales = Intl.getCanonicalLocales(record.locale);
    } catch {
      throw new TypeError(`${label}.locale must be a canonical BCP-47 locale.`);
    }
    if (canonicalLocales.length !== 1 || canonicalLocales[0] !== record.locale) {
      throw new TypeError(`${label}.locale must use canonical BCP-47 spelling.`);
    }
    let requestedLocale: Intl.Locale;
    try {
      requestedLocale = new Intl.Locale(record.locale);
    } catch {
      throw new TypeError(`${label}.locale must be a canonical BCP-47 locale.`);
    }
    let supportedLocales: string[];
    try {
      supportedLocales = Intl.Collator.supportedLocalesOf([record.locale], { localeMatcher: "lookup" });
    } catch {
      throw new TypeError(`${label}.locale is not supported by this runtime.`);
    }
    if (supportedLocales.length !== 1 || supportedLocales[0] !== record.locale) {
      throw new TypeError(`${label}.locale is not supported by this runtime.`);
    }
    if (record.sensitivity !== "base" && record.sensitivity !== "accent"
      && record.sensitivity !== "case" && record.sensitivity !== "variant") {
      throw new TypeError(`${label}.sensitivity must be base, accent, case, or variant.`);
    }
    if (typeof record.numeric !== "boolean") {
      throw new TypeError(`${label}.numeric must be a boolean.`);
    }
    const requestedCollationKeyword = explicitUnicodeKeywordV3(requestedLocale, "co");
    const requestedCaseFirstKeyword = explicitUnicodeKeywordV3(requestedLocale, "kf");
    const requestedNumericKeyword = explicitUnicodeKeywordV3(requestedLocale, "kn");
    if (requestedNumericKeyword !== null) {
      if (requestedNumericKeyword !== "true" && requestedNumericKeyword !== "false") {
        throw new TypeError(`${label}.locale contains an unsupported numeric Unicode extension.`);
      }
      const requestedNumeric = requestedNumericKeyword === "true";
      if (requestedLocale.numeric !== requestedNumeric || requestedNumeric !== record.numeric) {
        throw new TypeError(`${label}.locale numeric extension conflicts with comparator.numeric.`);
      }
    }
    const comparator: OrderComparatorV3 = {
      type: "text",
      locale: record.locale,
      sensitivity: record.sensitivity,
      numeric: record.numeric,
    };
    const collator = new Intl.Collator(comparator.locale, {
      sensitivity: comparator.sensitivity,
      numeric: comparator.numeric,
      usage: "sort",
    });
    const resolved = collator.resolvedOptions();
    if (resolved.usage !== "sort" || resolved.sensitivity !== comparator.sensitivity
      || resolved.numeric !== comparator.numeric || typeof resolved.locale !== "string"
      || resolved.locale.length === 0 || typeof resolved.collation !== "string"
      || resolved.collation.length === 0 || typeof resolved.ignorePunctuation !== "boolean"
      || (resolved.caseFirst !== "upper" && resolved.caseFirst !== "lower" && resolved.caseFirst !== "false")) {
      throw new TypeError(`${label} could not resolve the requested collation behavior.`);
    }
    if (requestedCollationKeyword !== null) {
      const requestedCollation = requestedLocale.collation;
      if (requestedCollation === undefined || requestedCollation === "default"
        || requestedCollation === "standard" || requestedCollation !== resolved.collation) {
        throw new TypeError(`${label}.locale collation extension is not honored by this runtime.`);
      }
    }
    if (requestedCaseFirstKeyword !== null) {
      const requestedCaseFirst = requestedLocale.caseFirst;
      if (requestedCaseFirst === undefined || requestedCaseFirst !== resolved.caseFirst) {
        throw new TypeError(`${label}.locale case-first extension is not honored by this runtime.`);
      }
    }
    // This binds the resolved ECMA-402 options used here. Runtime/engine version
    // belongs to later execution provenance; this browser-safe module must not
    // read Node-only process.versions or a user-agent string.
    const textCollationBinding: Omit<TextCollationBindingV3, "column"> = {
      requestedLocale: comparator.locale,
      resolvedLocale: resolved.locale,
      collation: resolved.collation,
      sensitivity: resolved.sensitivity,
      numeric: resolved.numeric,
      usage: resolved.usage,
      ignorePunctuation: resolved.ignorePunctuation,
      caseFirst: resolved.caseFirst,
    };
    return {
      comparator,
      collator,
      categoryIndex: null,
      textCollationBinding,
    };
  }
  throw new TypeError(`${label}.type is not a supported order comparator.`);
}

function snapshotOrderKeyV3(value: unknown, index: number): CompiledOrderKeyV3 {
  const label = `order policy keys[${index}]`;
  const record = snapshotPlainJsonRecordV3(value, label);
  assertExactKeysV3(record, ["column", "direction", "comparator"], label);
  if (typeof record.column !== "string" || record.column.trim().length === 0) {
    throw new TypeError(`${label}.column must be a nonblank string.`);
  }
  if (record.direction !== "ascending" && record.direction !== "descending") {
    throw new TypeError(`${label}.direction must be ascending or descending.`);
  }
  const compiled = snapshotComparatorV3(record.comparator, `${label}.comparator`);
  return {
    key: {
      column: record.column,
      direction: record.direction,
      comparator: compiled.comparator,
    },
    collator: compiled.collator,
    categoryIndex: compiled.categoryIndex,
    textCollationBinding: compiled.textCollationBinding === null
      ? null
      : { column: record.column, ...compiled.textCollationBinding },
  };
}

function normalizedRowCountV3(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a nonnegative safe integer.`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function lowercaseSha256V3(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new TypeError(`${label} must be a lowercase 64-hex SHA-256 string.`);
  }
  return value;
}

function snapshotResolutionContextV3(
  value: unknown,
  currentRowCount: number,
): {
  analysisFamily: "standard" | "ona";
  confirmationAnalysisFamily: "standard" | "ona";
  datasetBinding: DatasetBindingV3;
} {
  const context = snapshotPlainJsonRecordV3(value, "ordering resolution context");
  assertExactKeysV3(
    context,
    ["analysisFamily", "confirmationAnalysisFamily", "datasetBinding"],
    "ordering resolution context",
  );
  if (context.analysisFamily !== "standard" && context.analysisFamily !== "ona") {
    throw new TypeError("ordering resolution context.analysisFamily must be standard or ona.");
  }
  if (context.confirmationAnalysisFamily !== "standard" && context.confirmationAnalysisFamily !== "ona") {
    throw new TypeError("ordering resolution context.confirmationAnalysisFamily must be standard or ona.");
  }
  if (context.analysisFamily !== context.confirmationAnalysisFamily) {
    throw new Error("Source-order confirmation has expired because the analysis family changed.");
  }
  const binding = snapshotPlainJsonRecordV3(
    context.datasetBinding,
    "ordering resolution context.datasetBinding",
  );
  assertExactKeysV3(
    binding,
    ["hashKind", "normalizedTableSha256", "rowCount", "headerSha256"],
    "ordering resolution context.datasetBinding",
  );
  if (binding.hashKind !== "normalized-utf8-text-sha256"
    && binding.hashKind !== "normalized-utf8-csv-text-sha256"
    && binding.hashKind !== "canonical-first-xlsx-worksheet-v1-sha256") {
    throw new TypeError("ordering resolution context.datasetBinding.hashKind is unsupported.");
  }
  const rowCount = normalizedRowCountV3(
    binding.rowCount,
    "ordering resolution context.datasetBinding.rowCount",
  );
  if (rowCount !== currentRowCount) {
    throw new TypeError("ordering resolution context.datasetBinding.rowCount must equal the current rows length.");
  }
  return {
    analysisFamily: context.analysisFamily,
    confirmationAnalysisFamily: context.confirmationAnalysisFamily,
    datasetBinding: {
      hashKind: binding.hashKind,
      normalizedTableSha256: lowercaseSha256V3(
        binding.normalizedTableSha256,
        "ordering resolution context.datasetBinding.normalizedTableSha256",
      ),
      rowCount,
      headerSha256: lowercaseSha256V3(
        binding.headerSha256,
        "ordering resolution context.datasetBinding.headerSha256",
      ),
    },
  };
}

function snapshotConfirmationV3(
  value: unknown,
  rowCount: number,
  requiredRelevantColumns: readonly string[],
): DatasetBoundConfirmationV3 {
  const label = "source-order confirmation";
  const record = snapshotPlainJsonRecordV3(value, label);
  assertExactKeysV3(
    record,
    ["kind", "datasetSha256", "rowCount", "relevantColumns", "confirmedAt", "confirmationVersion"],
    label,
  );
  if (record.kind !== "explicit-researcher-confirmation") {
    throw new TypeError(`${label}.kind must be explicit-researcher-confirmation.`);
  }
  if (record.confirmationVersion !== 1) {
    throw new TypeError(`${label}.confirmationVersion must be 1.`);
  }
  const datasetSha256 = lowercaseSha256V3(record.datasetSha256, `${label}.datasetSha256`);
  const confirmedRowCount = normalizedRowCountV3(record.rowCount, `${label}.rowCount`);
  if (confirmedRowCount !== rowCount) {
    throw new TypeError(`${label}.rowCount must equal the current rows length.`);
  }
  const relevantColumns = snapshotColumnListV3(record.relevantColumns, `${label}.relevantColumns`);
  if (relevantColumns.length !== requiredRelevantColumns.length
    || relevantColumns.some((column, index) => column !== requiredRelevantColumns[index])) {
    throw new TypeError(`${label}.relevantColumns must exactly match the current ordered identity columns.`);
  }
  if (typeof record.confirmedAt !== "string" || !CANONICAL_UTC_TIMESTAMP.test(record.confirmedAt)
    || !Number.isFinite(Date.parse(record.confirmedAt))
    || new Date(record.confirmedAt).toISOString() !== record.confirmedAt) {
    throw new TypeError(`${label}.confirmedAt must be a canonical UTC ISO timestamp ending in Z.`);
  }
  return {
    kind: "explicit-researcher-confirmation",
    datasetSha256,
    rowCount: confirmedRowCount,
    relevantColumns,
    confirmedAt: record.confirmedAt,
    confirmationVersion: 1,
  };
}

function snapshotOrderPolicyV3(
  value: unknown,
  rowCount: number,
  requiredRelevantColumns: readonly string[],
): NormalizedOrderPolicyV3 {
  const record = snapshotPlainJsonRecordV3(value, "order policy");
  if (record.kind === "columns") {
    assertExactKeysV3(record, ["kind", "keys"], "columns order policy");
    const rawKeys = snapshotDenseJsonArrayV3(record.keys, "order policy keys");
    if (rawKeys.length === 0) throw new TypeError("order policy keys must be nonempty.");
    const keys = rawKeys.map((key, index) => snapshotOrderKeyV3(key, index));
    const columns = keys.map((key) => key.key.column);
    if (new Set(columns).size !== columns.length) {
      throw new TypeError("order policy key columns must be distinct.");
    }
    const normalizedKeys = keys.map((key) => key.key);
    const [first, ...rest] = normalizedKeys;
    return {
      policy: { kind: "columns", keys: [first, ...rest] },
      keys,
    };
  }
  if (record.kind === "source-order-confirmed") {
    assertExactKeysV3(record, ["kind", "confirmation"], "source-order-confirmed policy");
    return {
      policy: {
        kind: "source-order-confirmed",
        confirmation: snapshotConfirmationV3(record.confirmation, rowCount, requiredRelevantColumns),
      },
      keys: null,
    };
  }
  throw new TypeError("order policy.kind must be columns or source-order-confirmed.");
}

function bindSourceOrderV3(
  policy: CanonicalRowOrderV3,
  context: {
    analysisFamily: "standard" | "ona";
    confirmationAnalysisFamily: "standard" | "ona";
    datasetBinding: DatasetBindingV3;
  } | null,
  requireStandardFamily: boolean,
): ResolvedSourceOrderBindingV3 | null {
  if (policy.kind === "columns") return null;
  if (context === null) {
    throw new TypeError("A trusted ordering resolution context is required for source-order-confirmed policy.");
  }
  if (context.analysisFamily !== context.confirmationAnalysisFamily) {
    throw new Error("Source-order confirmation has expired because the analysis family changed.");
  }
  if (requireStandardFamily && context.analysisFamily !== "standard") {
    throw new TypeError("Trajectory Horizon source order requires the standard analysis family.");
  }
  if (policy.confirmation.datasetSha256 !== context.datasetBinding.normalizedTableSha256) {
    throw new Error("Source-order confirmation does not match the current dataset hash binding.");
  }
  if (policy.confirmation.rowCount !== context.datasetBinding.rowCount) {
    throw new Error("Source-order confirmation rowCount does not match the current dataset binding.");
  }
  return {
    analysisFamily: context.analysisFamily,
    datasetBinding: {
      hashKind: context.datasetBinding.hashKind,
      normalizedTableSha256: context.datasetBinding.normalizedTableSha256,
      rowCount: context.datasetBinding.rowCount,
      headerSha256: context.datasetBinding.headerSha256,
    },
    confirmation: {
      kind: policy.confirmation.kind,
      datasetSha256: policy.confirmation.datasetSha256,
      rowCount: policy.confirmation.rowCount,
      relevantColumns: [...policy.confirmation.relevantColumns],
      confirmedAt: policy.confirmation.confirmedAt,
      confirmationVersion: policy.confirmation.confirmationVersion,
    },
  };
}

function textCollationBindingsV3(keys: readonly CompiledOrderKeyV3[] | null): TextCollationBindingV3[] {
  if (keys === null) return [];
  const bindings: TextCollationBindingV3[] = [];
  for (const key of keys) {
    if (key.textCollationBinding !== null) {
      bindings.push({
        column: key.textCollationBinding.column,
        requestedLocale: key.textCollationBinding.requestedLocale,
        resolvedLocale: key.textCollationBinding.resolvedLocale,
        collation: key.textCollationBinding.collation,
        sensitivity: key.textCollationBinding.sensitivity,
        numeric: key.textCollationBinding.numeric,
        usage: key.textCollationBinding.usage,
        ignorePunctuation: key.textCollationBinding.ignorePunctuation,
        caseFirst: key.textCollationBinding.caseFirst,
      });
    }
  }
  return bindings;
}

function daysInMonthV3(year: number, month: number): number {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

function parseCalendarDateV3(value: ScalarIdentityV3, column: string): string {
  if (value.type !== "string") {
    throw new TypeError(`Order column ${JSON.stringify(column)} requires a YYYY-MM-DD date string.`);
  }
  const match = DATE_PATTERN.exec(value.value);
  if (match === null) {
    throw new TypeError(`Order column ${JSON.stringify(column)} must match YYYY-MM-DD.`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonthV3(year, month)) {
    throw new TypeError(`Order column ${JSON.stringify(column)} is not a valid calendar date.`);
  }
  return value.value;
}

function epochDayV3(year: number, month: number, day: number): number {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return Math.trunc(date.getTime() / 86_400_000);
}

function parseDateTimeV3(value: ScalarIdentityV3, column: string): string {
  if (value.type !== "string") {
    throw new TypeError(`Order column ${JSON.stringify(column)} requires an ISO-8601 datetime string with an explicit offset.`);
  }
  const match = DATETIME_PATTERN.exec(value.value);
  if (match === null) {
    throw new TypeError(`Order column ${JSON.stringify(column)} requires ISO-8601 with an explicit offset.`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);
  const nanoseconds = (match[7] ?? "").padEnd(9, "0");
  if (month < 1 || month > 12 || day < 1 || day > daysInMonthV3(year, month)) {
    throw new TypeError(`Order column ${JSON.stringify(column)} is not a valid datetime calendar date.`);
  }
  if (hour > 23 || minute > 59 || second > 59) {
    throw new TypeError(`Order column ${JSON.stringify(column)} is not a valid datetime clock time.`);
  }
  let offsetMinutes = 0;
  if (match[8] !== "Z") {
    const offsetHour = Number(match[10]);
    const offsetMinute = Number(match[11]);
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) {
      throw new TypeError(`Order column ${JSON.stringify(column)} has an invalid datetime offset.`);
    }
    if (match[9] === "-" && offsetHour === 0 && offsetMinute === 0) {
      throw new TypeError(`Order column ${JSON.stringify(column)} has an invalid datetime negative-zero offset.`);
    }
    const sign = match[9] === "+" ? 1 : -1;
    offsetMinutes = sign * (offsetHour * 60 + offsetMinute);
  }
  const epochSecond = epochDayV3(year, month, day) * 86_400
    + hour * 3_600 + minute * 60 + second - offsetMinutes * 60;
  const utc = new Date(epochSecond * 1_000).toISOString();
  if (!/^\d{4}-/u.test(utc)) {
    throw new TypeError(`Order column ${JSON.stringify(column)} resolves outside the supported four-digit datetime range.`);
  }
  return `${utc.slice(0, 19)}.${nanoseconds}Z`;
}

function resolveOrderValueV3(row: SourceRowV3, compiled: CompiledOrderKeyV3): ResolvedOrderValueV3 {
  const { key } = compiled;
  const scalar = scalarIdentityV3(
    readOwnDataPropertyV3(row, key.column, "row order"),
    `Order column ${JSON.stringify(key.column)}`,
  );
  switch (key.comparator.type) {
    case "number":
      if (scalar.type !== "number") {
        throw new TypeError(`Order column ${JSON.stringify(key.column)} requires finite numbers.`);
      }
      return scalar.value;
    case "date":
      return parseCalendarDateV3(scalar, key.column);
    case "datetime":
      return parseDateTimeV3(scalar, key.column);
    case "ordered-category": {
      const index = compiled.categoryIndex?.get(scalarIdentityKeyV3(scalar));
      if (index === undefined) {
        throw new TypeError(`Order column ${JSON.stringify(key.column)} has an unknown category.`);
      }
      return index;
    }
    case "text":
      if (scalar.type !== "string") {
        throw new TypeError(`Order column ${JSON.stringify(key.column)} requires text.`);
      }
      return scalar.value;
    default:
      throw new TypeError("Unsupported order comparator.");
  }
}

function resolveTupleV3(row: SourceRowV3, keys: readonly CompiledOrderKeyV3[]): ResolvedTupleV3 {
  return { values: keys.map((key) => resolveOrderValueV3(row, key)) };
}

function compareResolvedTuplesV3(
  left: readonly ResolvedOrderValueV3[],
  right: readonly ResolvedOrderValueV3[],
  keys: readonly CompiledOrderKeyV3[],
): number {
  for (let index = 0; index < keys.length; index += 1) {
    const compiled = keys[index];
    const leftValue = left[index];
    const rightValue = right[index];
    let delta: number;
    if (compiled.key.comparator.type === "text") {
      delta = Math.sign(compiled.collator!.compare(leftValue as string, rightValue as string));
    } else {
      delta = leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
    }
    if (delta !== 0) return compiled.key.direction === "ascending" ? delta : -delta;
  }
  return 0;
}

function resolvedTupleSignatureV3(tuple: readonly ResolvedOrderValueV3[]): string {
  return canonicalJsonV3(tuple);
}

export function resolveRowOrderV3(
  rows: readonly Record<string, unknown>[],
  horizonColumns: readonly string[],
  policy: ColumnsOrderPolicyV3,
  context?: OrderingResolutionContextV3,
): ResolvedRowOrderingV3;
export function resolveRowOrderV3(
  rows: readonly Record<string, unknown>[],
  horizonColumns: readonly string[],
  policy: SourceOrderPolicyV3,
  context: OrderingResolutionContextV3,
): ResolvedRowOrderingV3;
export function resolveRowOrderV3(
  rows: readonly Record<string, unknown>[],
  horizonColumns: readonly string[],
  policy: CanonicalRowOrderV3,
  context: OrderingResolutionContextV3,
): ResolvedRowOrderingV3;
export function resolveRowOrderV3(
  rows: readonly Record<string, unknown>[],
  horizonColumns: readonly string[],
  policy: CanonicalRowOrderV3,
  context?: OrderingResolutionContextV3,
): ResolvedRowOrderingV3 {
  const rowRecords = snapshotRowsV3(rows);
  const normalizedHorizonColumns = snapshotColumnListV3(horizonColumns, "horizonColumns");
  const normalizedPolicy = snapshotOrderPolicyV3(policy, rowRecords.length, normalizedHorizonColumns);
  const normalizedContext = context === undefined
    ? null
    : snapshotResolutionContextV3(context, rowRecords.length);
  const sourceOrderBinding = bindSourceOrderV3(normalizedPolicy.policy, normalizedContext, false);
  const textCollationBindings = textCollationBindingsV3(normalizedPolicy.keys);
  const groups = new Map<string, ResolvedRowV3[]>();

  for (let sourceRowIndex = 0; sourceRowIndex < rowRecords.length; sourceRowIndex += 1) {
    const row = rowRecords[sourceRowIndex];
    const horizonKey = canonicalIdentityKeyV3(row, normalizedHorizonColumns, `row ${sourceRowIndex} Horizon`);
    const group = groups.get(horizonKey) ?? [];
    const tuple = normalizedPolicy.keys === null
      ? { values: [] }
      : resolveTupleV3(row, normalizedPolicy.keys);
    group.push({ sourceRowIndex, values: tuple.values });
    groups.set(horizonKey, group);
  }

  const mappings: Array<ResolvedRowOrderingV3["mappings"][number]> = [];
  const horizonKeys = [...groups.keys()].sort(codeUnitCompareV3);
  for (const horizonKey of horizonKeys) {
    const group = groups.get(horizonKey)!;
    if (normalizedPolicy.keys !== null) {
      group.sort((left, right) => compareResolvedTuplesV3(left.values, right.values, normalizedPolicy.keys!));
      for (let index = 1; index < group.length; index += 1) {
        if (compareResolvedTuplesV3(group[index - 1].values, group[index].values, normalizedPolicy.keys) === 0) {
          throw new Error(`Within-Horizon row order has an unresolved tie in ${horizonKey}.`);
        }
      }
    }
    for (let withinHorizonOrdinal = 0; withinHorizonOrdinal < group.length; withinHorizonOrdinal += 1) {
      const entry = group[withinHorizonOrdinal];
      mappings.push({
        sourceRowIndex: entry.sourceRowIndex,
        horizonKey,
        orderTuple: normalizedPolicy.keys === null ? [withinHorizonOrdinal] : [...entry.values],
        withinHorizonOrdinal,
      });
    }
  }

  return deepFreezeV3({
    type: "within-horizon-order",
    requestedPolicy: normalizedPolicy.policy,
    mappings,
    orderedSourceRowIndices: mappings.map((entry) => entry.sourceRowIndex),
    sourceOrderBinding,
    textCollationBindings,
  });
}

export function resolveHorizonOrderV3(
  rows: readonly Record<string, unknown>[],
  unitColumns: readonly string[],
  horizonColumns: readonly string[],
  policy: ColumnsOrderPolicyV3,
  context?: OrderingResolutionContextV3,
): ResolvedHorizonOrderingV3;
export function resolveHorizonOrderV3(
  rows: readonly Record<string, unknown>[],
  unitColumns: readonly string[],
  horizonColumns: readonly string[],
  policy: SourceOrderPolicyV3,
  context: OrderingResolutionContextV3,
): ResolvedHorizonOrderingV3;
export function resolveHorizonOrderV3(
  rows: readonly Record<string, unknown>[],
  unitColumns: readonly string[],
  horizonColumns: readonly string[],
  policy: CanonicalHorizonOrderV3,
  context: OrderingResolutionContextV3,
): ResolvedHorizonOrderingV3;
export function resolveHorizonOrderV3(
  rows: readonly Record<string, unknown>[],
  unitColumns: readonly string[],
  horizonColumns: readonly string[],
  policy: CanonicalHorizonOrderV3,
  context?: OrderingResolutionContextV3,
): ResolvedHorizonOrderingV3 {
  const rowRecords = snapshotRowsV3(rows);
  const normalizedUnitColumns = snapshotColumnListV3(unitColumns, "unitColumns");
  const normalizedHorizonColumns = snapshotColumnListV3(horizonColumns, "horizonColumns");
  const requiredRelevantColumns = [...new Set([...normalizedUnitColumns, ...normalizedHorizonColumns])];
  const normalizedPolicy = snapshotOrderPolicyV3(policy, rowRecords.length, requiredRelevantColumns);
  const normalizedContext = context === undefined
    ? null
    : snapshotResolutionContextV3(context, rowRecords.length);
  const sourceOrderBinding = bindSourceOrderV3(normalizedPolicy.policy, normalizedContext, true);
  const textCollationBindings = textCollationBindingsV3(normalizedPolicy.keys);
  const horizons = new Map<string, ResolvedHorizonV3>();
  const tupleSignatures = new Map<string, string>();
  const horizonsByUnit = new Map<string, Set<string>>();
  let nextFirstAppearanceOrdinal = 0;

  for (let rowIndex = 0; rowIndex < rowRecords.length; rowIndex += 1) {
    const row = rowRecords[rowIndex];
    const unitKey = canonicalIdentityKeyV3(row, normalizedUnitColumns, `row ${rowIndex} Unit`);
    const horizonKey = canonicalIdentityKeyV3(row, normalizedHorizonColumns, `row ${rowIndex} Horizon`);
    let resolvedHorizon = horizons.get(horizonKey);
    if (normalizedPolicy.keys === null) {
      if (resolvedHorizon === undefined) {
        resolvedHorizon = { horizonKey, values: [nextFirstAppearanceOrdinal] };
        nextFirstAppearanceOrdinal += 1;
        horizons.set(horizonKey, resolvedHorizon);
      }
    } else {
      const tuple = resolveTupleV3(row, normalizedPolicy.keys);
      const signature = resolvedTupleSignatureV3(tuple.values);
      const priorSignature = tupleSignatures.get(horizonKey);
      if (priorSignature !== undefined && priorSignature !== signature) {
        throw new Error(`Horizon order tuple is unstable for ${horizonKey}.`);
      }
      if (resolvedHorizon === undefined) {
        resolvedHorizon = { horizonKey, values: tuple.values };
        horizons.set(horizonKey, resolvedHorizon);
        tupleSignatures.set(horizonKey, signature);
      }
    }
    const observed = horizonsByUnit.get(unitKey) ?? new Set<string>();
    observed.add(horizonKey);
    horizonsByUnit.set(unitKey, observed);
  }

  const unitSequences: Array<ResolvedHorizonOrderingV3["unitSequences"][number]> = [];
  const unitKeys = [...horizonsByUnit.keys()].sort(codeUnitCompareV3);
  for (const unitKey of unitKeys) {
    const steps = [...horizonsByUnit.get(unitKey)!].map((horizonKey) => horizons.get(horizonKey)!);
    if (normalizedPolicy.keys === null) {
      steps.sort((left, right) => (left.values[0] as number) - (right.values[0] as number));
    } else {
      steps.sort((left, right) => compareResolvedTuplesV3(left.values, right.values, normalizedPolicy.keys!));
      for (let index = 1; index < steps.length; index += 1) {
        if (compareResolvedTuplesV3(steps[index - 1].values, steps[index].values, normalizedPolicy.keys) === 0) {
          throw new Error(`STANDARD_HORIZON_ORDER_UNRESOLVED_TIE:${unitKey}`);
        }
      }
    }
    unitSequences.push({
      unitKey,
      steps: steps.map((step, trajectoryOrdinal) => ({
        horizonKey: step.horizonKey,
        trajectoryOrdinal,
      })),
    });
  }

  const implementationHorizonOrder = [...horizons.keys()].sort(codeUnitCompareV3);
  return deepFreezeV3({
    type: "trajectory-horizon-order",
    horizonTuples: implementationHorizonOrder.map((horizonKey) => ({
      horizonKey,
      orderTuple: [...horizons.get(horizonKey)!.values],
    })),
    unitSequences,
    implementationHorizonOrder,
    sourceOrderBinding,
    textCollationBindings,
  });
}
