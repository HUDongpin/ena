import type { Scalar } from "jena-js";
import { parseCsv } from "./csv";
import { parseXlsx } from "./spreadsheet";
import { canonicalJsonV3, sha256TextV3 } from "./model-v3/canonical-json";
import type { ParsedDataset } from "./types";

export type SourceColumnTypeV3 = "text" | "number" | "boolean";
export type SourceTypeDeclarationsV3 = Readonly<Record<string, SourceColumnTypeV3>>;
export const SOURCE_TYPING_POLICY_V3 = "explicit-csv-typed-xlsx-v1";
export const SOURCE_TYPING_EXPLANATION_V3 = "Text preserves identifiers and literal formula-looking text. Number accepts complete JSON decimal numbers without spaces or a plus sign; overflow, nonzero underflow and unsafe integers reject. Fractions use IEEE 754 rounding. Boolean accepts only literal true or false. Missing cells remain missing. Confirm creates a separate typed XLSX source; Code selection never converts values.";

export function parseDeclaredSourceCellV3(value: Scalar, type: SourceColumnTypeV3): Scalar {
  if (value === null) return null;
  if (typeof value !== "string") throw new TypeError("CSV preparation requires literal source text cells.");
  if (type === "text") return value;
  if (type === "boolean") {
    if (value === "true") return true;
    if (value === "false") return false;
    throw new TypeError("Boolean requires literal true or false.");
  }
  if (type !== "number" || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u.test(value))
    throw new TypeError("Number requires a complete JSON decimal token.");
  const number = JSON.parse(value) as number;
  const mantissa = value.split(/[eE]/u)[0];
  if (!Number.isFinite(number) || (number === 0 && /[1-9]/u.test(mantissa))
    || (Number.isInteger(number) && !Number.isSafeInteger(number)))
    throw new TypeError("Number overflows, underflows or loses integer precision.");
  return number;
}

export function previewSourceTypesV3(dataset: ParsedDataset, declarations: SourceTypeDeclarationsV3) {
  if (Object.keys(declarations).length !== dataset.headers.length || dataset.headers.some((column) => !Object.hasOwn(declarations, column)))
    throw new TypeError("Declare exactly one type for every source column.");
  let errorCount = 0;
  const errors: { row: number; column: string; reason: string }[] = [];
  const columns = dataset.headers.map((column) => {
    const type = declarations[column];
    if (!["text", "number", "boolean"].includes(type)) throw new TypeError("Unknown source type.");
    let nullCount = 0;
    const mapping = new Map<string, Set<string>>();
    const examples: { before: Scalar; after: Scalar | "invalid" }[] = [];
    dataset.rows.forEach((row, index) => {
      const value = row[column];
      try {
        const parsed = parseDeclaredSourceCellV3(value, type);
        if (parsed === null) nullCount++;
        else { const key = canonicalJsonV3(parsed), previous = mapping.get(key) ?? new Set(); previous.add(canonicalJsonV3(value)); mapping.set(key, previous); }
        if (examples.length < 3) examples.push({ before: value, after: parsed });
      } catch (error) {
        errorCount++;
        if (errors.length < 20) errors.push({ row: index + 1, column, reason: error instanceof Error ? error.message : String(error) });
        if (examples.length < 3) examples.push({ before: value, after: "invalid" });
      }
    });
    return { column, type, nullCount, examples, identityCollisionCount: [...mapping.values()].filter((values) => values.size > 1).length };
  });
  return { columns, errors, errorCount };
}

export async function prepareTypedCsvSourceV3(text: string, input: ParsedDataset, declarations: SourceTypeDeclarationsV3, confirmedAt: Date) {
  // Reparse actual source bytes before any await; caller memory cannot replace
  // the declared CSV. The independent derivative is the scientific dataset.
  const source = parseCsv(text, { name: input.name, source: input.source, sizeBytes: new TextEncoder().encode(text).byteLength });
  if (canonicalJsonV3([source.headers, source.rows]) !== canonicalJsonV3([input.headers, input.rows])) throw new TypeError("CSV source preview changed.");
  const types = { ...declarations };
  const preview = previewSourceTypesV3(source, types);
  if (preview.errorCount) throw new TypeError(`Source typing has ${preview.errorCount} invalid cells.`);
  const confirmation = confirmedAt.toISOString();
  const rows = source.rows.map((row) => Object.fromEntries(source.headers.map((column) => [column, parseDeclaredSourceCellV3(row[column], types[column])])));
  const { default: writeXlsxFile } = await import("write-excel-file/universal");
  const blob = await writeXlsxFile([source.headers, ...rows.map((row) => source.headers.map((column) => {
    const value = row[column];
    return value === null ? null : { value, type: typeof value === "string" ? String : typeof value === "boolean" ? Boolean : Number };
  }))]).toBlob();
  const bytes = await blob.arrayBuffer();
  const name = source.name.replace(/\.csv$/iu, "") + ".typed.xlsx";
  const normalized = await parseXlsx(bytes, { name, source: source.source, sizeBytes: bytes.byteLength });
  if (canonicalJsonV3([normalized.dataset.headers, normalized.dataset.rows]) !== canonicalJsonV3([source.headers, rows]))
    throw new TypeError("Typed worksheet roundtrip changed source cells or their declared types.");
  const datasetSha256 = await sha256TextV3(normalized.normalizedText);
  const bytesSha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { bytes, dataset: normalized.dataset, datasetSha256,
    receipt: { kind: "open-ena-source-derivation", version: 1, policy: SOURCE_TYPING_POLICY_V3,
      original: { name: source.name, algorithm: "SHA-256", utf8TextSha256: await sha256TextV3(text) },
      declarations: types, serializer: "write-excel-file@4.1.1", reader: "read-excel-file@9.3.5", confirmedAt: confirmation,
      derivative: { name, algorithm: "SHA-256", bytesSha256, sizeBytes: bytes.byteLength, hashKind: normalized.dataset.hashKind, normalizedTableSha256: datasetSha256 },
      meaning: "Explicit source preparation receipt; scientific binding describes the actual typed worksheet, not authentication of the transformation or original CSV." } };
}
