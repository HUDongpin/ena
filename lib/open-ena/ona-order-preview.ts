import type { Row } from "jena-js";
import {
  orderRowsForOpenEna,
  typedHorizonIdentity,
} from "./network-config";
import type {
  OpenEnaOrderComparator,
  OpenEnaOrderPolicy,
  OpenEnaResolvedOrderPolicy,
} from "./types";

export interface OpenEnaOrderPanelValue {
  policyKind: "columns" | "source-row";
  /** Kept while source-row is selected so a researcher can return to the column draft. */
  columns: string[];
  comparators: Partial<Record<string, OpenEnaOrderComparator>>;
  /** Kept while columns are selected so source-row acknowledgement is never inferred. */
  sourceRowConfirmed: boolean;
  /** Total stanza rows including the current response, or positive Infinity. */
  windowSizeBack: number;
}

export type OpenEnaOrderPreviewScalar = string | number | boolean | null | undefined;

export interface OpenEnaOrderPreviewField {
  column: string;
  value: OpenEnaOrderPreviewScalar;
  valueType: "string" | "number" | "boolean" | "missing";
}

export interface OpenEnaOrderPreviewRow {
  /** One-based position after canonical within-horizon ordering. */
  orderedPosition: number;
  /** One-based record number in the imported dataset. */
  sourceRecord: number;
  /** Zero-based source index retained for programmatic provenance joins. */
  sourceIndex: number;
  /** One-based horizon order in the canonical preview. */
  horizonOrdinal: number;
  startsHorizon: boolean;
  endsHorizon: boolean;
  unitFields: OpenEnaOrderPreviewField[];
  horizonFields: OpenEnaOrderPreviewField[];
  orderFields: OpenEnaOrderPreviewField[];
}

export interface OpenEnaOrderPreview {
  rows: OpenEnaOrderPreviewRow[];
  horizonCount: number;
  resolvedPolicy: OpenEnaResolvedOrderPolicy;
}

interface BuildOpenEnaOrderPreviewInput {
  rows: readonly Row[];
  unitColumns: readonly string[];
  horizonColumns: readonly string[];
  policy: OpenEnaOrderPolicy;
}

const ORDER_COMPARATORS = new Set<OpenEnaOrderComparator>([
  "number",
  "string",
  "boolean",
  "iso-datetime",
]);

function assertColumns(columns: readonly string[], label: string, allowEmpty: boolean) {
  if ((!allowEmpty && columns.length === 0)
    || columns.some((column) => typeof column !== "string" || column.length === 0)
    || new Set(columns).size !== columns.length) {
    throw new Error(`${label} must contain ${allowEmpty ? "unique non-empty fields" : "at least one unique non-empty field"}.`);
  }
}

export function isOpenEnaOrderPanelValueComplete(value: OpenEnaOrderPanelValue): boolean {
  if (value.policyKind === "source-row") return value.sourceRowConfirmed;
  return value.columns.length > 0
    && new Set(value.columns).size === value.columns.length
    && value.columns.every((column) => (
      column.length > 0 && ORDER_COMPARATORS.has(value.comparators[column] as OpenEnaOrderComparator)
    ));
}

export function orderPolicyFromPanelValue(
  value: OpenEnaOrderPanelValue,
): OpenEnaOrderPolicy {
  if (value.policyKind === "source-row") {
    if (!value.sourceRowConfirmed) {
      throw new Error("Source-record ONA order requires explicit confirmation.");
    }
    return { kind: "source-row", confirmed: true };
  }

  assertColumns(value.columns, "ONA order columns", false);
  const comparators = Object.fromEntries(value.columns.map((column) => {
    const comparator = value.comparators[column];
    if (!comparator || !ORDER_COMPARATORS.has(comparator)) {
      throw new Error(`ONA order column “${column}” requires an explicit comparator.`);
    }
    return [column, comparator];
  })) as Record<string, OpenEnaOrderComparator>;
  return { kind: "columns", columns: [...value.columns], comparators };
}

function previewField(row: Row, column: string): OpenEnaOrderPreviewField {
  const value = row[column];
  if (value === null || value === undefined) {
    return { column, value, valueType: "missing" };
  }
  if (typeof value === "string") return { column, value, valueType: "string" };
  if (typeof value === "number") return { column, value, valueType: "number" };
  if (typeof value === "boolean") return { column, value, valueType: "boolean" };
  throw new Error(`ONA preview field “${column}” must be a scalar value.`);
}

/**
 * Build display provenance around the same canonical ordering function used by
 * execution. This module never implements a second comparator or sort path.
 */
export function buildOpenEnaOrderPreview({
  rows,
  unitColumns,
  horizonColumns,
  policy,
}: BuildOpenEnaOrderPreviewInput): OpenEnaOrderPreview {
  assertColumns(unitColumns, "ONA unit columns", true);
  assertColumns(horizonColumns, "ONA horizon columns", false);

  const ordered = orderRowsForOpenEna(rows, horizonColumns, policy);
  const horizonIdentities = ordered.rows.map((row) => typedHorizonIdentity(row, horizonColumns));
  const horizonOrdinals = new Map<string, number>();
  let nextHorizonOrdinal = 1;
  for (const identity of horizonIdentities) {
    if (!horizonOrdinals.has(identity)) {
      horizonOrdinals.set(identity, nextHorizonOrdinal);
      nextHorizonOrdinal += 1;
    }
  }
  const orderColumns = policy.kind === "columns" ? policy.columns : [];

  return {
    rows: ordered.rows.map((row, index) => ({
      orderedPosition: index + 1,
      sourceRecord: ordered.sourceIndices[index] + 1,
      sourceIndex: ordered.sourceIndices[index],
      horizonOrdinal: horizonOrdinals.get(horizonIdentities[index]) as number,
      startsHorizon: index === 0 || horizonIdentities[index - 1] !== horizonIdentities[index],
      endsHorizon: index === ordered.rows.length - 1
        || horizonIdentities[index + 1] !== horizonIdentities[index],
      unitFields: unitColumns.map((column) => previewField(row, column)),
      horizonFields: horizonColumns.map((column) => previewField(row, column)),
      orderFields: orderColumns.map((column) => previewField(row, column)),
    })),
    horizonCount: horizonOrdinals.size,
    resolvedPolicy: ordered.resolvedPolicy,
  };
}
