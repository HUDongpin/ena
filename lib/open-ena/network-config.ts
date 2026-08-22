import type { Row } from "jena-js";
import type {
  AnalysisKind,
  CanonicalOpenEnaConfig,
  OpenEnaConfig,
  OpenEnaDirectionalMask,
  OpenEnaOrderComparator,
  OpenEnaOrderPolicy,
  OpenEnaResolvedOrderPolicy,
  PortableOpenEnaConfig,
} from "./types";

type ComparableScalar = string | number | boolean;
type TypedScalar = readonly ["string" | "number" | "boolean", ComparableScalar];

const ORDER_COMPARATORS = new Set<OpenEnaOrderComparator>([
  "number",
  "string",
  "boolean",
  "iso-datetime",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function codeLabelErrors(codes: readonly unknown[]): string[] {
  const errors: string[] = [];
  if (codes.some((code) => typeof code !== "string" || code.length === 0)) {
    errors.push("Directional-mask code labels must be non-empty strings.");
  }
  const labels = codes.filter((code): code is string => typeof code === "string");
  if (new Set(labels).size !== labels.length) {
    errors.push("Directional-mask code labels must be unique; duplicate labels are ambiguous.");
  }
  if (labels.some((code) => code.includes(" & "))) {
    errors.push("Directional-mask code labels are ambiguous when they contain the ordered-edge separator “ & ”.");
  }
  return errors;
}

function assertCodeLabels(codes: readonly unknown[]): asserts codes is readonly string[] {
  const errors = codeLabelErrors(codes);
  if (errors.length > 0) throw new Error(errors.join(" "));
}

function cloneOrderPolicy(policy: OpenEnaOrderPolicy | null | undefined): OpenEnaOrderPolicy | null {
  if (policy == null) return null;
  if (policy.kind === "columns") {
    if (!Array.isArray(policy.columns) || policy.columns.length === 0) {
      throw new Error("ONA column ordering requires at least one non-empty order column.");
    }
    if (policy.columns.some((column) => typeof column !== "string" || column.length === 0)) {
      throw new Error("ONA order columns must be non-empty strings.");
    }
    if (new Set(policy.columns).size !== policy.columns.length) {
      throw new Error("ONA order columns must be unique.");
    }
    if (!asRecord(policy.comparators)) {
      throw new Error("ONA column ordering requires an explicit comparator for every order column.");
    }
    const comparatorKeys = Object.keys(policy.comparators);
    if (comparatorKeys.length !== policy.columns.length
      || comparatorKeys.some((column) => !policy.columns.includes(column))) {
      throw new Error("ONA order comparators must exactly match the declared order columns.");
    }
    const comparators = Object.fromEntries(policy.columns.map((column) => {
      const comparator = policy.comparators[column];
      if (!ORDER_COMPARATORS.has(comparator)) {
        throw new Error(`ONA order column “${column}” must declare a supported comparator.`);
      }
      return [column, comparator];
    })) as Record<string, OpenEnaOrderComparator>;
    return { kind: "columns", columns: [...policy.columns], comparators };
  }
  if (policy.kind === "source-row") {
    if (policy.confirmed !== true) {
      throw new Error("Source-row ONA ordering requires explicit confirmed=true acknowledgement.");
    }
    return { kind: "source-row", confirmed: true };
  }
  throw new Error("ONA order policy must use either columns or explicitly confirmed source-row order.");
}

export function analysisKindFor(config: Pick<OpenEnaConfig, "analysisKind">): AnalysisKind {
  if (config.analysisKind === undefined) return "ena";
  if (config.analysisKind === "ena" || config.analysisKind === "ona") return config.analysisKind;
  throw new Error("Open ENA analysisKind must be either “ena” or “ona”; legacy absence means only “ena”.");
}

export function networkTypeFor(config: Pick<OpenEnaConfig, "analysisKind">): "standard" | "ordered" {
  return analysisKindFor(config) === "ona" ? "ordered" : "standard";
}

export function createDirectionalMask(codes: readonly string[]): OpenEnaDirectionalMask {
  assertCodeLabels(codes);
  return {
    schemaVersion: 1,
    codeOrder: [...codes],
    enabled: codes.map(() => codes.map(() => true)),
  };
}

export function validateDirectionalMask(mask: unknown, expectedCodes?: readonly string[]): string[] {
  const errors: string[] = [];
  const record = asRecord(mask);
  if (!record) return ["Directional mask must be an object."];
  if (record.schemaVersion !== 1) errors.push("Directional mask schemaVersion must be 1.");
  if (!Array.isArray(record.codeOrder)) {
    errors.push("Directional mask codeOrder must be an array.");
    return errors;
  }
  errors.push(...codeLabelErrors(record.codeOrder));
  const codeOrder = record.codeOrder.filter((code): code is string => typeof code === "string");
  const size = record.codeOrder.length;
  if (!Array.isArray(record.enabled)) {
    errors.push("Directional mask enabled must be a square boolean matrix.");
  } else {
    if (record.enabled.length !== size) {
      errors.push(`Directional mask must contain ${size} rows for a ${size} by ${size} matrix.`);
    }
    for (let rowIndex = 0; rowIndex < record.enabled.length; rowIndex += 1) {
      const row = record.enabled[rowIndex];
      if (!Array.isArray(row) || row.length !== size) {
        errors.push(`Directional mask row ${rowIndex + 1} must contain ${size} boolean cells.`);
      } else if (row.some((cell) => typeof cell !== "boolean")) {
        errors.push(`Directional mask row ${rowIndex + 1} must contain only boolean cells.`);
      }
    }
  }
  if (expectedCodes) {
    errors.push(...codeLabelErrors(expectedCodes));
    if (expectedCodes.length !== codeOrder.length
      || expectedCodes.some((code, index) => code !== codeOrder[index])) {
      errors.push("Directional mask codeOrder must exactly match the configured code order.");
    }
  }
  return [...new Set(errors)];
}

export function cloneDirectionalMask(mask: OpenEnaDirectionalMask): OpenEnaDirectionalMask {
  const errors = validateDirectionalMask(mask);
  if (errors.length > 0) throw new Error(errors.join(" "));
  return {
    schemaVersion: 1,
    codeOrder: [...mask.codeOrder],
    enabled: mask.enabled.map((row) => [...row]),
  };
}

export function reconcileDirectionalMask(
  mask: OpenEnaDirectionalMask | null | undefined,
  codes: readonly string[],
): OpenEnaDirectionalMask {
  assertCodeLabels(codes);
  if (!mask) return createDirectionalMask(codes);
  const errors = validateDirectionalMask(mask);
  if (errors.length > 0) throw new Error(errors.join(" "));
  const oldIndex = new Map(mask.codeOrder.map((code, index) => [code, index]));
  return {
    schemaVersion: 1,
    codeOrder: [...codes],
    enabled: codes.map((source) => codes.map((target) => {
      const sourceIndex = oldIndex.get(source);
      const targetIndex = oldIndex.get(target);
      return sourceIndex === undefined || targetIndex === undefined
        ? true
        : mask.enabled[sourceIndex][targetIndex];
    })),
  };
}

export function canonicalizeOpenEnaConfig(config: OpenEnaConfig): CanonicalOpenEnaConfig {
  const analysisKind = analysisKindFor(config);
  let orderPolicy: OpenEnaOrderPolicy | null = null;
  let directionalMask: OpenEnaDirectionalMask | null = null;
  if (analysisKind === "ena") {
    if (config.orderPolicy != null) {
      throw new Error("Standard ENA configurations cannot carry an ONA order policy.");
    }
    if (config.directionalMask != null) {
      throw new Error("Standard ENA configurations cannot carry an ONA directional mask.");
    }
  } else {
    orderPolicy = cloneOrderPolicy(config.orderPolicy);
    if (!orderPolicy) throw new Error("ONA requires an explicit order policy.");
    directionalMask = reconcileDirectionalMask(config.directionalMask, config.codes);
  }
  return {
    analysisKind,
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
    orderPolicy,
    directionalMask,
  };
}

export function cloneOpenEnaConfig(config: OpenEnaConfig): CanonicalOpenEnaConfig {
  return canonicalizeOpenEnaConfig(config);
}

export function serializeOpenEnaConfig(config: OpenEnaConfig): PortableOpenEnaConfig {
  const canonical = canonicalizeOpenEnaConfig(config);
  return {
    ...canonical,
    windowSizeBack: canonical.windowSizeBack === Number.POSITIVE_INFINITY
      ? "Infinity"
      : canonical.windowSizeBack,
  };
}

export function deserializeOpenEnaConfig(config: PortableOpenEnaConfig): CanonicalOpenEnaConfig {
  const { windowSizeBack: portableWindowSizeBack, ...rest } = config;
  const windowSizeBack = portableWindowSizeBack === "Infinity"
    ? Number.POSITIVE_INFINITY
    : portableWindowSizeBack;
  if (typeof windowSizeBack !== "number"
    || !(Number.isFinite(windowSizeBack) || windowSizeBack === Number.POSITIVE_INFINITY)) {
    throw new Error("Portable Open ENA windowSizeBack must be a finite number or the explicit “Infinity” sentinel.");
  }
  return canonicalizeOpenEnaConfig({ ...rest, windowSizeBack });
}

export function stableOpenEnaConfigJson(config: OpenEnaConfig): string {
  return JSON.stringify(serializeOpenEnaConfig(config));
}

function sameStrings(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameOrderPolicy(left: OpenEnaOrderPolicy | null, right: OpenEnaOrderPolicy | null) {
  if (left === null || right === null) return left === right;
  if (left.kind !== right.kind) return false;
  if (left.kind === "source-row" && right.kind === "source-row") return true;
  return left.kind === "columns"
    && right.kind === "columns"
    && sameStrings(left.columns, right.columns)
    && left.columns.every((column) => left.comparators[column] === right.comparators[column]);
}

function sameMask(left: OpenEnaDirectionalMask | null, right: OpenEnaDirectionalMask | null) {
  if (left === null || right === null) return left === right;
  return sameStrings(left.codeOrder, right.codeOrder)
    && left.enabled.length === right.enabled.length
    && left.enabled.every((row, index) => (
      row.length === right.enabled[index].length
      && row.every((cell, cellIndex) => cell === right.enabled[index][cellIndex])
    ));
}

export function sameOpenEnaConfig(left: OpenEnaConfig, right: OpenEnaConfig): boolean {
  let canonicalLeft: CanonicalOpenEnaConfig;
  let canonicalRight: CanonicalOpenEnaConfig;
  try {
    canonicalLeft = canonicalizeOpenEnaConfig(left);
    canonicalRight = canonicalizeOpenEnaConfig(right);
  } catch {
    return false;
  }
  return canonicalLeft.analysisKind === canonicalRight.analysisKind
    && canonicalLeft.model === canonicalRight.model
    && canonicalLeft.groupColumn === canonicalRight.groupColumn
    && canonicalLeft.window === canonicalRight.window
    && canonicalLeft.windowSizeBack === canonicalRight.windowSizeBack
    && canonicalLeft.windowSizeForward === canonicalRight.windowSizeForward
    && canonicalLeft.weightBy === canonicalRight.weightBy
    && canonicalLeft.rotation === canonicalRight.rotation
    && canonicalLeft.referenceRotationId === canonicalRight.referenceRotationId
    && canonicalLeft.centerAlignToOrigin === canonicalRight.centerAlignToOrigin
    && sameStrings(canonicalLeft.unitColumns, canonicalRight.unitColumns)
    && sameStrings(canonicalLeft.conversationColumns, canonicalRight.conversationColumns)
    && sameStrings(canonicalLeft.codes, canonicalRight.codes)
    && sameOrderPolicy(canonicalLeft.orderPolicy, canonicalRight.orderPolicy)
    && sameMask(canonicalLeft.directionalMask, canonicalRight.directionalMask);
}

function typedScalar(value: unknown, label: string): TypedScalar {
  if (value === null || value === undefined || value === "") {
    throw new Error(`${label} contains a missing value.`);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${label} values must be finite numbers.`);
    return ["number", value];
  }
  if (typeof value === "string") return ["string", value];
  if (typeof value === "boolean") return ["boolean", value];
  throw new Error(`${label} values must be strings, finite numbers, or booleans.`);
}

function orderTupleKey(tuple: readonly TypedScalar[]) {
  return JSON.stringify(tuple);
}

const CANONICAL_ORDER_NUMBER = /^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u;
const ISO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(?:Z|([+-])(\d{2}):(\d{2}))$/u;

function canonicalNumericString(value: string): number | null {
  if (!CANONICAL_ORDER_NUMBER.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDateTimeValue(value: string): number | null {
  const match = ISO_DATE_TIME.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? 0);
  const offsetHour = Number(match[9] ?? 0);
  const offsetMinute = Number(match[10] ?? 0);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12
    || day < 1 || day > daysInMonth[month - 1]
    || hour < 0 || hour > 23
    || minute < 0 || minute > 59
    || second < 0 || second > 59
    || offsetHour < 0 || offsetHour > 23
    || offsetMinute < 0 || offsetMinute > 59) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function orderScalar(value: unknown, column: string, comparator: OpenEnaOrderComparator): TypedScalar {
  const scalar = typedScalar(value, `ONA order column “${column}”`);
  if (comparator === "number") {
    if (scalar[0] === "number") return scalar;
    if (scalar[0] === "string") {
      const parsed = canonicalNumericString(String(scalar[1]));
      if (parsed !== null) return ["number", parsed];
    }
  } else if (comparator === "boolean") {
    if (scalar[0] === "boolean") return scalar;
    if (scalar[0] === "string" && (scalar[1] === "true" || scalar[1] === "false")) {
      return ["boolean", scalar[1] === "true"];
    }
  } else if (comparator === "iso-datetime") {
    if (scalar[0] === "string" && typeof scalar[1] === "string") {
      const timestamp = isoDateTimeValue(scalar[1]);
      if (timestamp !== null) return ["number", timestamp];
    }
  } else if (comparator === "string" && scalar[0] === "string") {
    return scalar;
  }
  throw new Error(`ONA order column “${column}” contains values incompatible with its resolved ${comparator} comparator.`);
}

/**
 * Build the one canonical identity used for ONA horizons in the application
 * layer. Column labels, scalar types, and values are all bound explicitly;
 * negative zero receives a non-numeric marker because JSON.stringify would
 * otherwise silently serialize it as positive zero.
 */
export function typedTupleIdentity(
  row: Row,
  columns: readonly string[],
  label = "ONA identity column",
): string {
  return JSON.stringify(columns.map((column) => {
    const scalar = typedScalar(row[column], `${label} “${column}”`);
    const value = scalar[0] === "number"
      && typeof scalar[1] === "number"
      && Object.is(scalar[1], -0)
      ? "-0"
      : scalar[1];
    return [column, scalar[0], value];
  }));
}

export function typedHorizonIdentity(row: Row, columns: readonly string[]): string {
  return typedTupleIdentity(row, columns, "ONA horizon column");
}

function compareTyped(left: TypedScalar, right: TypedScalar) {
  if (left[0] !== right[0]) {
    throw new Error("ONA order values must have one comparable scalar type within each horizon and order column; mixed values are rejected.");
  }
  if (left[1] === right[1]) return 0;
  if (left[0] === "boolean") return left[1] === false ? -1 : 1;
  return left[1] < right[1] ? -1 : 1;
}

interface IndexedOrderedRow {
  row: Row;
  sourceIndex: number;
  orderTuple: TypedScalar[];
}

export function orderRowsForOpenEna(
  rows: readonly Row[],
  conversationColumns: readonly string[],
  policy: OpenEnaOrderPolicy,
): {
  rows: Row[];
  sourceIndices: number[];
  resolvedPolicy: OpenEnaResolvedOrderPolicy;
} {
  if (conversationColumns.length === 0) {
    throw new Error("ONA typed horizons require at least one conversation column.");
  }
  if (new Set(conversationColumns).size !== conversationColumns.length
    || conversationColumns.some((column) => typeof column !== "string" || column.length === 0)) {
    throw new Error("ONA conversation columns must be unique non-empty strings.");
  }
  const clonedPolicy = cloneOrderPolicy(policy);
  if (!clonedPolicy) throw new Error("ONA requires an explicit order policy.");
  const comparators = clonedPolicy.kind === "columns" ? clonedPolicy.comparators : {};

  const groups = new Map<string, IndexedOrderedRow[]>();
  rows.forEach((row, sourceIndex) => {
    const horizonKey = typedHorizonIdentity(row, conversationColumns);
    const group = groups.get(horizonKey) ?? [];
    const orderTuple = clonedPolicy.kind === "columns"
      ? clonedPolicy.columns.map((column) => orderScalar(row[column], column, comparators[column]))
      : [];
    group.push({ row, sourceIndex, orderTuple });
    groups.set(horizonKey, group);
  });

  if (clonedPolicy.kind === "source-row") {
    return {
      rows: [...rows],
      sourceIndices: rows.map((_, index) => index),
      resolvedPolicy: { kind: "source-row", confirmed: true, stable: true },
    };
  }

  const ordered: IndexedOrderedRow[] = [];
  for (const group of groups.values()) {
    for (let columnIndex = 0; columnIndex < clonedPolicy.columns.length; columnIndex += 1) {
      const types = new Set(group.map((entry) => entry.orderTuple[columnIndex][0]));
      if (types.size > 1) {
        throw new Error(`ONA order column “${clonedPolicy.columns[columnIndex]}” contains mixed incomparable values within one horizon.`);
      }
    }
    const seenOrderTuples = new Set<string>();
    for (const entry of group) {
      // Numeric -0 and +0 are an ordering tie even though they are distinct
      // horizon identities. The ordinary JSON number encoding intentionally
      // normalizes both here so the configured tie policy remains fail-closed.
      const key = orderTupleKey(entry.orderTuple);
      if (seenOrderTuples.has(key)) {
        throw new Error("ONA column ordering contains a tie within one horizon; add an order column that uniquely resolves every row.");
      }
      seenOrderTuples.add(key);
    }
    group.sort((left, right) => {
      for (let index = 0; index < left.orderTuple.length; index += 1) {
        const comparison = compareTyped(left.orderTuple[index], right.orderTuple[index]);
        if (comparison !== 0) return comparison;
      }
      return left.sourceIndex - right.sourceIndex;
    });
    ordered.push(...group);
  }
  return {
    rows: ordered.map((entry) => entry.row),
    sourceIndices: ordered.map((entry) => entry.sourceIndex),
    resolvedPolicy: {
      kind: "columns",
      columns: [...clonedPolicy.columns],
      comparators,
      direction: "ascending",
      missing: "reject",
      ties: "reject",
      stable: true,
    },
  };
}
