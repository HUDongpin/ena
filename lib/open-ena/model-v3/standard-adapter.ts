import type { Row } from "jena-js";
import { deepFreezeV3, snapshotDenseJsonArrayV3, snapshotPlainJsonRecordV3 } from "./canonical-json";
import type { CanonicalCodeV3, CanonicalStandardConfigV3 } from "./types";

const CODE_TOKEN_PREFIX_V3 = "__open_ena_code_v3_";
const EDGE_TOKEN_PREFIX_V3 = "__open_ena_edge_v3_";

export interface CanonicalCodeEntryV3 {
  readonly token: string;
  readonly sourceColumn: string;
  readonly displayLabel: string;
  readonly canonicalIdentity: string;
}

export interface CanonicalStandardEdgeEntryV3 {
  readonly token: string;
  readonly sourceCodeIdentity: string;
  readonly targetCodeIdentity: string;
}

export interface StandardCodeDictionaryV3 {
  readonly codes: readonly CanonicalCodeEntryV3[];
  readonly edges: readonly CanonicalStandardEdgeEntryV3[];
}

export interface CodeRepresentationBindingV3 {
  readonly runtimeToken: string;
  readonly sourceColumn: string;
  readonly sourceRepresentation: "numeric-binary" | "boolean-binary" | "frequency";
  readonly runtimeRepresentation: "number";
}

type StandardWeightingV3 = CanonicalStandardConfigV3["weighting"];
type BinarySourceRepresentationV3 = "numeric-binary" | "boolean-binary";

function exactKeysV3(
  record: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} has an invalid shape.`);
  }
}

function ownEnumerableDataValueV3(
  value: object,
  key: string,
  label: string,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) {
    throw new TypeError(`${label} is missing an own data property.`);
  }
  if (!descriptor.enumerable || !("value" in descriptor)) {
    throw new TypeError(`${label} must be an own enumerable data property, not an accessor.`);
  }
  return descriptor.value;
}

function assertPlainRecordV3(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain row object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain row object.`);
  }
}

function captureCodeSourceColumnV3(value: unknown, index: number): string {
  const label = `Code dictionary definitions[${index}]`;
  assertPlainRecordV3(value, label);
  const column = ownEnumerableDataValueV3(value, "column", `${label}.column`);
  if (typeof column !== "string" || column.trim().length === 0) {
    throw new TypeError(`${label}.column must be a nonblank string.`);
  }
  return column;
}

function captureCanonicalCodeDefinitionV3(
  value: unknown,
  index: number,
  sourceColumn: string,
): CanonicalCodeV3 {
  const label = `Code dictionary definitions[${index}]`;
  const record = snapshotPlainJsonRecordV3(value, label);
  exactKeysV3(record, ["column", "displayLabel"], label);
  if (record.column !== sourceColumn) {
    throw new TypeError(`${label}.column changed during descriptor capture.`);
  }
  if (typeof record.displayLabel !== "string" || record.displayLabel.trim().length === 0) {
    throw new TypeError(`${label}.displayLabel must be a nonblank string.`);
  }
  return { column: sourceColumn, displayLabel: record.displayLabel };
}

function compareUtf16CodeUnitsV3(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

function compareUtf8V3(encoder: TextEncoder, left: string, right: string): number {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = a[index] - b[index];
    if (difference !== 0) return difference;
  }
  const lengthDifference = a.length - b.length;
  if (lengthDifference !== 0) return lengthDifference;
  // TextEncoder replaces lone surrogates. This exact-code-unit fallback keeps
  // distinct source labels deterministic without normalizing their identities.
  return compareUtf16CodeUnitsV3(left, right);
}

function tokenOrdinalV3(index: number): string {
  return String(index).padStart(3, "0");
}

function weightingTypeV3(weighting: StandardWeightingV3): StandardWeightingV3["type"] {
  const record = snapshotPlainJsonRecordV3(weighting, "Standard weighting");
  exactKeysV3(record, ["type"], "Standard weighting");
  if (record.type !== "binary" && record.type !== "frequency") {
    throw new TypeError("Standard weighting.type must be binary or frequency.");
  }
  return record.type;
}

function sourceCodeValueV3(row: Row, sourceColumn: string, weighting: StandardWeightingV3["type"]): unknown {
  const label = `${weighting === "binary" ? "Binary" : "Frequency"} Code “${sourceColumn}”`;
  assertPlainRecordV3(row, label);
  return ownEnumerableDataValueV3(row, sourceColumn, label);
}

function binaryCodeValueV3(
  row: Row,
  sourceColumn: string,
): { value: number; representation: BinarySourceRepresentationV3 } {
  const value = sourceCodeValueV3(row, sourceColumn, "binary");
  if (typeof value === "boolean") {
    return { value: value ? 1 : 0, representation: "boolean-binary" };
  }
  if (typeof value === "number" && (value === 0 || value === 1)) {
    return {
      value: Object.is(value, -0) ? 0 : value,
      representation: "numeric-binary",
    };
  }
  throw new TypeError(`Binary Code “${sourceColumn}” is not 0/1 or Boolean.`);
}

function frequencyCodeValueV3(row: Row, sourceColumn: string): number {
  const value = sourceCodeValueV3(row, sourceColumn, "frequency");
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TypeError(
      `Frequency Code “${sourceColumn}” is not a finite non-negative number.`,
    );
  }
  return Object.is(value, -0) ? 0 : value;
}

export function buildCanonicalCodeEntriesV3(
  definitions: readonly CanonicalCodeV3[],
): readonly CanonicalCodeEntryV3[] {
  const captured = snapshotDenseJsonArrayV3(definitions, "Code dictionary definitions");
  const sourceColumns = captured.map(captureCodeSourceColumnV3);
  if (new Set(sourceColumns).size !== sourceColumns.length) {
    throw new TypeError("Code dictionary definitions must have distinct source columns.");
  }
  const definitionsSnapshot = captured.map((definition, index) => {
    return captureCanonicalCodeDefinitionV3(definition, index, sourceColumns[index]);
  });
  const encoder = new TextEncoder();
  const ordered = [...definitionsSnapshot].sort((left, right) => {
    return compareUtf8V3(encoder, left.column, right.column);
  });
  return deepFreezeV3(ordered.map((definition, index) => ({
    token: `${CODE_TOKEN_PREFIX_V3}${tokenOrdinalV3(index)}`,
    sourceColumn: definition.column,
    displayLabel: definition.displayLabel,
    canonicalIdentity: definition.column,
  })));
}

export function buildStandardCodeDictionaryV3(
  definitions: readonly CanonicalCodeV3[],
): StandardCodeDictionaryV3 {
  const codes = buildCanonicalCodeEntriesV3(definitions);
  const edges: CanonicalStandardEdgeEntryV3[] = [];
  for (let targetIndex = 0; targetIndex < codes.length; targetIndex += 1) {
    for (let sourceIndex = 0; sourceIndex < targetIndex; sourceIndex += 1) {
      edges.push({
        token: `${EDGE_TOKEN_PREFIX_V3}${tokenOrdinalV3(sourceIndex)}_${tokenOrdinalV3(targetIndex)}`,
        sourceCodeIdentity: codes[sourceIndex].canonicalIdentity,
        targetCodeIdentity: codes[targetIndex].canonicalIdentity,
      });
    }
  }
  return deepFreezeV3({ codes, edges });
}

export function materializeStandardCodesV3(
  row: Row,
  weighting: StandardWeightingV3,
  dictionary: StandardCodeDictionaryV3,
): Readonly<Record<string, number>> {
  const type = weightingTypeV3(weighting);
  const materialized: Record<string, number> = {};
  for (const code of dictionary.codes) {
    materialized[code.token] = type === "binary"
      ? binaryCodeValueV3(row, code.sourceColumn).value
      : frequencyCodeValueV3(row, code.sourceColumn);
  }
  return deepFreezeV3(materialized);
}

export function buildCodeRepresentationBindingsV3(
  rows: readonly Row[],
  weighting: StandardWeightingV3,
  dictionary: StandardCodeDictionaryV3,
): readonly CodeRepresentationBindingV3[] {
  const capturedRows = snapshotDenseJsonArrayV3(rows, "Standard Code representation rows");
  if (capturedRows.length === 0) {
    throw new TypeError("Standard Code representation binding requires at least one row.");
  }
  const type = weightingTypeV3(weighting);
  const bindings = dictionary.codes.map((code): CodeRepresentationBindingV3 => {
    if (type === "frequency") {
      for (const row of capturedRows) {
        frequencyCodeValueV3(row as Row, code.sourceColumn);
      }
      return {
        runtimeToken: code.token,
        sourceColumn: code.sourceColumn,
        sourceRepresentation: "frequency",
        runtimeRepresentation: "number",
      };
    }

    let sourceRepresentation: BinarySourceRepresentationV3 | null = null;
    for (const row of capturedRows) {
      const current = binaryCodeValueV3(row as Row, code.sourceColumn).representation;
      if (sourceRepresentation === null) {
        sourceRepresentation = current;
      } else if (sourceRepresentation !== current) {
        throw new TypeError(
          `Binary Code “${code.sourceColumn}” has mixed numeric and Boolean representations.`,
        );
      }
    }
    return {
      runtimeToken: code.token,
      sourceColumn: code.sourceColumn,
      sourceRepresentation: sourceRepresentation!,
      runtimeRepresentation: "number",
    };
  });
  return deepFreezeV3(bindings);
}
