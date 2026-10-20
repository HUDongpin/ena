import assert from "node:assert/strict";
import test from "node:test";
import writeXlsxFile from "write-excel-file/universal";
import { parseXlsx, datasetFromSpreadsheetRows, type SpreadsheetCell } from "../lib/open-ena/spreadsheet";

const options = { name: "shared-string-expansion.xlsx", source: "upload" as const };
const MAX_BYTES = 5 * 1024 * 1024;
const encoder = new TextEncoder();
function canonicalCell(value: SpreadsheetCell) {
  if (value === null) return ["null"];
  if (value instanceof Date) return ["string", value.toISOString()];
  if (typeof value === "number") return ["number", Object.is(value, -0) ? "-0" : String(value)];
  if (typeof value === "boolean") return ["boolean", value ? "true" : "false"];
  return ["string", value];
}
function expectedText(headers: string[], rows: SpreadsheetCell[][]) {
  return `open-ena-tabular-v1\n${JSON.stringify({ headers, rows: rows.map((row) => row.map(canonicalCell)) })}\n`;
}

test("XLSX shared strings are charged at every use before complete canonical encoding", async (t) => {
  const headers = Array.from({ length: 8 }, (_, index) => `column${index}`);
  const value = "shared text ".repeat(683);
  const rows = Array.from({ length: 100 }, () => headers.map(() => value));
  const blob = await writeXlsxFile([
    headers.map((value) => ({ type: String, value })),
    ...rows.map((row) => row.map((value) => ({ type: String, value }))),
  ]).toBlob();
  const bytes = await blob.arrayBuffer();
  assert.ok(bytes.byteLength < 32_768, "the fixture is a small valid XLSX with shared strings");
  assert.ok(value.length * rows.length * headers.length > MAX_BYTES, "logical canonical values exceed 5 MiB");
  const stringify = JSON.stringify;
  let completeEncodings = 0;
  t.mock.method(JSON, "stringify", function (input: unknown, ...args: unknown[]) {
    if (input && typeof input === "object" && "headers" in input && "rows" in input) {
      completeEncodings += 1;
      throw new Error("controlled fault: complete worksheet serialization started before admission");
    }
    return Reflect.apply(stringify, JSON, [input, ...args]);
  });
  const failure = await parseXlsx(bytes, options).then(() => null, (error: unknown) => error);
  assert.equal(completeEncodings, 0, "do not allocate the oversized canonical text to discover it is oversized");
  assert.match(String(failure), /expands beyond the 5 MB browser limit/);
});

test("canonical spreadsheet admission retains the exact inclusive UTF-8 byte boundary", () => {
  const headers = ["unit"];
  const fixedBytes = encoder.encode(expectedText(headers, [[""]])).byteLength;
  for (const [token, width] of [["x", 1], ["漢😀", 7], ["\u0000", 6], ["\ud800", 6]] as const) {
    const available = MAX_BYTES - fixedBytes;
    const exact = token.repeat(Math.floor(available / width)) + "x".repeat(available % width);
    assert.equal(encoder.encode(expectedText(headers, [[exact]])).byteLength, MAX_BYTES);
    assert.equal(datasetFromSpreadsheetRows([headers, [exact]], options).rows[0].unit, exact);
    assert.throws(() => datasetFromSpreadsheetRows([headers, [exact + "x"]], options), /expands beyond the 5 MB browser limit/);
  }
});

test("admission preserves canonical bytes for typed values, escapes and Unicode", async (t) => {
  const stringify = JSON.stringify;
  let lastCanonicalText = "";
  t.mock.method(JSON, "stringify", function (input: unknown, ...args: unknown[]) {
    const text = Reflect.apply(stringify, JSON, [input, ...args]);
    if (input && typeof input === "object" && "headers" in input && "rows" in input) lastCanonicalText = `open-ena-tabular-v1\n${text}\n`;
    return text;
  });
  const headers = ["unit", "quoted\"\\", "emoji😀", "number", "negative-zero", "bool", "blank", "date"];
  const date = new Date("2024-01-02T03:04:05.000Z");
  const rows: SpreadsheetCell[][] = [["u1", 'a"b\\c\t\r\n', "漢😀", 1e-200, -0, true, null, date]];
  const direct = datasetFromSpreadsheetRows([headers, ...rows], options);
  assert.equal(lastCanonicalText, expectedText(headers, rows));
  assert.deepEqual(direct.rows[0], Object.fromEntries(headers.map((header, index) => [header, rows[0][index] instanceof Date ? date.toISOString() : rows[0][index]])));
  const surrogates = "x\ud800\udc00y\ud800z\udfff";
  assert.equal(datasetFromSpreadsheetRows([["unit"], [surrogates]], options).rows[0].unit, surrogates);
  assert.equal(lastCanonicalText, expectedText(["unit"], [[surrogates]]));
  const xlsxHeaders = ["unit", "quoted\"\\", "emoji😀", "number", "bool"];
  const xlsxRows = [["u1", 'a"b\\c\t\n', "漢😀", 1e-200, true]];
  const blob = await writeXlsxFile([
    xlsxHeaders.map((value) => ({ type: String, value })),
    ...xlsxRows.map((row) => row.map((value) => typeof value === "number" ? { type: Number, value } : typeof value === "boolean" ? { type: Boolean, value } : { type: String, value })),
  ]).toBlob();
  const result = await parseXlsx(await blob.arrayBuffer(), options);
  assert.equal(result.normalizedText, expectedText(xlsxHeaders, xlsxRows));
});
