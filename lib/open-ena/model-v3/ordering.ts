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
  OrderComparatorV3,
  OrderKeyV3,
  ScalarIdentityV3,
} from "./types";

type SourceRowV3 = Record<string, unknown>;
type ResolvedOrderValueV3 = string | number;

export interface ResolvedRowOrderingV3 {
  type: "within-horizon-order";
  requestedPolicy: CanonicalRowOrderV3;
  mappings: Array<{
    sourceRowIndex: number;
    horizonKey: string;
    orderTuple: ResolvedOrderValueV3[];
    withinHorizonOrdinal: number;
  }>;
  orderedSourceRowIndices: number[];
}

export interface ResolvedHorizonOrderingV3 {
  type: "trajectory-horizon-order";
  horizonTuples: Array<{
    horizonKey: string;
    orderTuple: ResolvedOrderValueV3[];
  }>;
  unitSequences: Array<{
    unitKey: string;
    steps: Array<{
      horizonKey: string;
      trajectoryOrdinal: number;
    }>;
  }>;
  implementationHorizonOrder: string[];
}

interface CompiledOrderKeyV3 {
  key: OrderKeyV3;
  collator: Intl.Collator | null;
  categoryIndex: ReadonlyMap<string, number> | null;
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

function snapshotComparatorV3(
  value: unknown,
  label: string,
): { comparator: OrderComparatorV3; collator: Intl.Collator | null; categoryIndex: ReadonlyMap<string, number> | null } {
  const record = snapshotPlainJsonRecordV3(value, label);
  const type = record.type;
  if (type === "number") {
    assertExactKeysV3(record, ["type"], `${label} number comparator`);
    return { comparator: { type: "number" }, collator: null, categoryIndex: null };
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
    if (record.sensitivity !== "base" && record.sensitivity !== "accent"
      && record.sensitivity !== "case" && record.sensitivity !== "variant") {
      throw new TypeError(`${label}.sensitivity must be base, accent, case, or variant.`);
    }
    if (typeof record.numeric !== "boolean") {
      throw new TypeError(`${label}.numeric must be a boolean.`);
    }
    const comparator: OrderComparatorV3 = {
      type: "text",
      locale: record.locale,
      sensitivity: record.sensitivity,
      numeric: record.numeric,
    };
    return {
      comparator,
      collator: new Intl.Collator(comparator.locale, {
        sensitivity: comparator.sensitivity,
        numeric: comparator.numeric,
        usage: "sort",
      }),
      categoryIndex: null,
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
  if (typeof record.datasetSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(record.datasetSha256)) {
    throw new TypeError(`${label}.datasetSha256 must be a lowercase 64-hex SHA-256 string.`);
  }
  if (typeof record.rowCount !== "number" || !Number.isSafeInteger(record.rowCount)
    || record.rowCount < 0 || record.rowCount !== rowCount) {
    throw new TypeError(`${label}.rowCount must equal the current rows length.`);
  }
  const relevantColumns = snapshotColumnListV3(record.relevantColumns, `${label}.relevantColumns`);
  const relevant = new Set(relevantColumns);
  if (requiredRelevantColumns.some((column) => !relevant.has(column))) {
    throw new TypeError(`${label}.relevantColumns must cover every Horizon identity column.`);
  }
  if (typeof record.confirmedAt !== "string" || !CANONICAL_UTC_TIMESTAMP.test(record.confirmedAt)
    || !Number.isFinite(Date.parse(record.confirmedAt))
    || new Date(record.confirmedAt).toISOString() !== record.confirmedAt) {
    throw new TypeError(`${label}.confirmedAt must be a canonical UTC ISO timestamp ending in Z.`);
  }
  return {
    kind: "explicit-researcher-confirmation",
    datasetSha256: record.datasetSha256,
    rowCount: record.rowCount,
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
  policy: CanonicalRowOrderV3,
): ResolvedRowOrderingV3 {
  const rowRecords = snapshotRowsV3(rows);
  const normalizedHorizonColumns = snapshotColumnListV3(horizonColumns, "horizonColumns");
  const normalizedPolicy = snapshotOrderPolicyV3(policy, rowRecords.length, normalizedHorizonColumns);
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

  const mappings: ResolvedRowOrderingV3["mappings"] = [];
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
  });
}

export function resolveHorizonOrderV3(
  rows: readonly Record<string, unknown>[],
  unitColumns: readonly string[],
  horizonColumns: readonly string[],
  policy: CanonicalHorizonOrderV3,
): ResolvedHorizonOrderingV3 {
  const rowRecords = snapshotRowsV3(rows);
  const normalizedUnitColumns = snapshotColumnListV3(unitColumns, "unitColumns");
  const normalizedHorizonColumns = snapshotColumnListV3(horizonColumns, "horizonColumns");
  const normalizedPolicy = snapshotOrderPolicyV3(policy, rowRecords.length, normalizedHorizonColumns);
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

  const unitSequences: ResolvedHorizonOrderingV3["unitSequences"] = [];
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
  });
}
