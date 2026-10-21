import type { Row, Scalar } from "jena-js";
import type { ParsedDataset } from "./types";
import { canonicalJsonByteLengthV3 } from "./model-v3/standard-closure-resource-budget";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 20_000;
const MAX_COLUMNS = 256;
const MAX_HEADER_CHARACTERS = 256;
const MAX_XLSX_ARCHIVE_ENTRIES = 4_096;
const MAX_XLSX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNATURE = 0x07064b50;

export type CodedDataFileKind = "csv" | "xlsx";
export type SpreadsheetCell = string | number | boolean | Date | null;

type SpreadsheetOptions = {
  name: string;
  sizeBytes?: number;
  source: ParsedDataset["source"];
};

type NormalizedSpreadsheet = {
  dataset: ParsedDataset;
  normalizedText: string;
};

export function codedDataFileKind(name: string): CodedDataFileKind {
  const normalized = name.trim().toLowerCase();
  if (normalized.endsWith(".csv")) return "csv";
  if (normalized.endsWith(".xlsx")) return "xlsx";
  throw new Error("Open a CSV or XLSX coded-data file. Legacy XLS files are not supported.");
}

function normalizeCell(value: unknown, rowNumber: number, columnNumber: number, requireUnicode: boolean): Scalar {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    // Native XLSX text must be valid Unicode; direct row helpers retain their
    // existing JavaScript string contract. In Unicode mode a valid pair is one
    // code point outside this range.
    // Validate after rich runs concatenate, preserving pairs split across runs.
    if (requireUnicode && /[\uD800-\uDFFF]/u.test(value)) throw new Error(`Worksheet row ${rowNumber}, column ${columnNumber} contains invalid Unicode.`);
    return value.trim() === "" ? null : value;
  }
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Worksheet row ${rowNumber}, column ${columnNumber} must contain a finite number.`);
    }
    return value;
  }
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) {
      throw new Error(`Worksheet row ${rowNumber}, column ${columnNumber} contains an invalid date.`);
    }
    return value.toISOString();
  }
  throw new Error(`Worksheet row ${rowNumber}, column ${columnNumber} contains an unsupported cell value.`);
}

function hasValue(value: Scalar) {
  return value !== null;
}

function canonicalCell(value: Scalar) {
  if (value === null) return ["null"];
  if (typeof value === "string") return ["string", value];
  if (typeof value === "number") return ["number", Object.is(value, -0) ? "-0" : String(value)];
  return ["boolean", value ? "true" : "false"];
}

function assertSafeXlsxArchive(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  const minimumEocdBytes = 22;
  const maximumCommentBytes = 0xffff;
  let eocdOffset = -1;
  for (
    let offset = view.byteLength - minimumEocdBytes;
    offset >= Math.max(0, view.byteLength - minimumEocdBytes - maximumCommentBytes);
    offset -= 1
  ) {
    if (view.getUint32(offset, true) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error("The XLSX workbook could not be read. Open a valid .xlsx file.");
  }

  // The reader uses the per-disk entry count, and switches to ZIP64 when a
  // locator is present even without ordinary-record sentinel values. Admit
  // exactly the directory it will decompress, rather than a competing claim.
  const diskNumber = view.getUint16(eocdOffset + 4, true);
  const directoryDisk = view.getUint16(eocdOffset + 6, true);
  const diskEntryCount = view.getUint16(eocdOffset + 8, true);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  const directoryBytes = view.getUint32(eocdOffset + 12, true);
  const directoryOffset = view.getUint32(eocdOffset + 16, true);
  if (entryCount === 0xffff || diskEntryCount === 0xffff
    || directoryBytes === 0xffffffff || directoryOffset === 0xffffffff
    || (eocdOffset >= 20 && view.getUint32(eocdOffset - 20, true) === ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNATURE)) {
    throw new Error("ZIP64 XLSX workbooks are not supported by this browser workspace.");
  }
  if (diskNumber !== 0 || directoryDisk !== 0 || diskEntryCount !== entryCount) {
    throw new Error("The XLSX workbook has an invalid or multi-disk ZIP directory.");
  }
  if (entryCount > MAX_XLSX_ARCHIVE_ENTRIES) {
    throw new Error(`The XLSX archive contains more than ${MAX_XLSX_ARCHIVE_ENTRIES.toLocaleString()} entries.`);
  }
  if (directoryOffset + directoryBytes > eocdOffset || directoryOffset + directoryBytes > view.byteLength) {
    throw new Error("The XLSX workbook has an invalid ZIP directory.");
  }

  let offset = directoryOffset;
  let totalUncompressedBytes = 0;
  const memberNames = new Set<string>();
  const utf8Names = new TextDecoder();
  for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
    if (offset + 46 > eocdOffset || view.getUint32(offset, true) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error("The XLSX workbook has an invalid ZIP directory entry.");
    }
    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedBytes = view.getUint32(offset + 20, true);
    const uncompressedBytes = view.getUint32(offset + 24, true);
    if (uncompressedBytes === 0xffffffff) {
      throw new Error("ZIP64 XLSX workbooks are not supported by this browser workspace.");
    }
    totalUncompressedBytes += uncompressedBytes;
    if (totalUncompressedBytes > MAX_XLSX_UNCOMPRESSED_BYTES) {
      throw new Error("The XLSX archive expands beyond the 64 MB browser safety limit.");
    }
    // Stored entries are copied using compressedBytes, without an output
    // buffer sized by uncompressedBytes. Their two sizes must be identical.
    if (compressionMethod === 0 && compressedBytes !== uncompressedBytes) {
      throw new Error("The XLSX workbook has an inconsistent stored ZIP directory entry.");
    }
    const filenameBytes = view.getUint16(offset + 28, true);
    const extraBytes = view.getUint16(offset + 30, true);
    const commentBytes = view.getUint16(offset + 32, true);
    const nextOffset = offset + 46 + filenameBytes + extraBytes + commentBytes;
    if (nextOffset > directoryOffset + directoryBytes) {
      throw new Error("The XLSX workbook has an invalid ZIP directory entry length.");
    }
    // fflate keys members by decoded central-directory name. Reject duplicate
    // keys before either the synchronous preflight or asynchronous reader can
    // pick a different payload for the same worksheet or routing document.
    const encodedName = new Uint8Array(buffer, offset + 46, filenameBytes);
    let name = "";
    if (view.getUint16(offset + 8, true) & 0x0800) name = utf8Names.decode(encodedName);
    else for (const byte of encodedName) name += String.fromCharCode(byte);
    if (memberNames.has(name)) throw new Error("The XLSX workbook has a duplicate ZIP member name.");
    memberNames.add(name);
    offset = nextOffset;
  }
  if (offset !== directoryOffset + directoryBytes) {
    throw new Error("The XLSX workbook has an inconsistent ZIP directory.");
  }
}

function normalizeSpreadsheetRows(
  worksheetRows: SpreadsheetCell[][],
  options: SpreadsheetOptions,
  requireUnicode = false,
): NormalizedSpreadsheet {
  const sizeBytes = options.sizeBytes ?? 0;
  if (sizeBytes > MAX_FILE_BYTES) {
    throw new Error("CSV and XLSX files must be 5 MB or smaller.");
  }

  // Keep the original 1-based worksheet row. Blank-row filtering must not
  // renumber the overflow error, which is raised after this filter.
  const records = worksheetRows
    .map((values, rowIndex) => ({
      worksheetRow: rowIndex + 1,
      values: values.map((value, columnIndex) => normalizeCell(value, rowIndex + 1, columnIndex + 1, requireUnicode)),
    }))
    .filter((record) => record.values.some(hasValue));

  if (records.length < 2) {
    throw new Error("The first XLSX worksheet needs a header and at least one data row.");
  }

  const headerValues = records[0].values;
  if (headerValues.length > MAX_COLUMNS) {
    throw new Error(`This browser release supports up to ${MAX_COLUMNS} columns per worksheet.`);
  }
  const headers = headerValues.map((value) => String(value ?? "").trim());
  if (headers.some((header) => header.length === 0)) {
    throw new Error("Every XLSX worksheet column needs a header.");
  }
  if (headers.some((header) => header.length > MAX_HEADER_CHARACTERS)) {
    throw new Error(`XLSX worksheet column headers must be ${MAX_HEADER_CHARACTERS} characters or fewer.`);
  }
  if (new Set(headers).size !== headers.length) {
    throw new Error("XLSX worksheet column headers must be unique.");
  }

  const dataRecords = records.slice(1);
  if (dataRecords.length > MAX_ROWS) {
    throw new Error(`This browser release supports up to ${MAX_ROWS.toLocaleString()} rows per run.`);
  }

  const rows: Row[] = dataRecords.map((record) => {
    if (record.values.slice(headers.length).some(hasValue)) {
      throw new Error(`Worksheet row ${record.worksheetRow} has more cells than the ${headers.length}-column header.`);
    }
    return Object.fromEntries(headers.map((header, columnIndex) => [header, record.values[columnIndex] ?? null]));
  });

  // Shared XLSX strings may occur in many cells. Charge every occurrence
  // before producing the complete hash text, so a small valid archive cannot
  // allocate an oversized canonical string merely to discover its byte size.
  const prefix = "open-ena-tabular-v1\n";
  const canonicalRows: ReturnType<typeof canonicalCell>[][] = [];
  try {
    let remainingBytes = MAX_FILE_BYTES - prefix.length - 1
      - canonicalJsonByteLengthV3({ headers, rows: [] }, MAX_FILE_BYTES);
    for (const row of rows) {
      const cells = headers.map((header) => canonicalCell(row[header]));
      if (canonicalRows.length > 0) remainingBytes -= 1; // row separator
      remainingBytes -= canonicalJsonByteLengthV3(cells, remainingBytes);
      canonicalRows.push(cells);
    }
  } catch {
    throw new Error("The analyzed XLSX worksheet expands beyond the 5 MB browser limit.");
  }
  const normalizedText = `${prefix}${JSON.stringify({ headers, rows: canonicalRows })}\n`;

  return {
    dataset: {
      name: options.name,
      headers,
      rows,
      sizeBytes,
      source: options.source,
      hashKind: "canonical-first-xlsx-worksheet-v1-sha256",
    },
    normalizedText,
  };
}

export function datasetFromSpreadsheetRows(
  rows: SpreadsheetCell[][],
  options: SpreadsheetOptions,
): ParsedDataset {
  return normalizeSpreadsheetRows(rows, options).dataset;
}

export async function parseXlsx(
  buffer: ArrayBuffer,
  options: SpreadsheetOptions,
): Promise<NormalizedSpreadsheet> {
  const sizeBytes = options.sizeBytes ?? buffer.byteLength;
  if (sizeBytes > MAX_FILE_BYTES) {
    throw new Error("CSV and XLSX files must be 5 MB or smaller.");
  }
  assertSafeXlsxArchive(buffer);

  try {
    // Load the XLSX reader only when a workbook is actually selected. CSV
    // researchers do not pay the spreadsheet parser's download cost.
    const { readSheet } = await import("read-excel-file/browser");
    const { assertXlsxCoordinateAdmission } = await import("./xlsx-coordinate-admission");
    assertXlsxCoordinateAdmission(buffer, { rows: MAX_ROWS + 1, columns: MAX_COLUMNS });
    const rows = await readSheet(buffer, { trim: false });
    return normalizeSpreadsheetRows(rows as SpreadsheetCell[][], { ...options, sizeBytes }, true);
  } catch (error) {
    if (error instanceof Error && /(?:5 MB|header|column|row|cell|finite|unsupported|date)/i.test(error.message)) {
      throw error;
    }
    throw new Error("The XLSX workbook could not be read. Open a valid .xlsx file whose first worksheet contains coded data.");
  }
}
