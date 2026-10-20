import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { parseCsv } from "../lib/open-ena/csv";
import { prepareTypedCsvSourceV3 } from "../lib/open-ena/source-preparation-v3";
import { parseXlsx } from "../lib/open-ena/spreadsheet";

const text = "unit,A,B,C\nleft,1,1,0\nright,0,1,1\nthird,1,0,1\nfourth,1,1,1";
const expected = [["unit", "A", "B", "C"], ["left", 1, 1, 0], ["right", 0, 1, 1], ["third", 1, 0, 1], ["fourth", 1, 1, 1]];
async function workbook(edit: (xml: string) => string) {
  const source = await prepareTypedCsvSourceV3(text, parseCsv(text, { name: "prelude.csv", source: "upload" }), { unit: "text", A: "number", B: "number", C: "number" }, new Date("2026-10-12T00:00:00Z"));
  const entries = unzipSync(new Uint8Array(source.bytes));
  entries["xl/worksheets/sheet1.xml"] = strToU8(edit(strFromU8(entries["xl/worksheets/sheet1.xml"])));
  return zipSync(entries).buffer as ArrayBuffer;
}
function preludeAt(closingOffset: number) {
  return (xml: string) => {
    const boundary = xml.indexOf("<sheetData>") + "<sheetData>".length - 1;
    const changed = xml.replace("<sheetData>", " ".repeat(closingOffset - boundary) + "<sheetData>");
    assert.equal(changed.indexOf("<sheetData>") + "<sheetData>".length - 1, closingOffset);
    // All bytes before the tag are ASCII: this is the exact first 64 KiB boundary.
    assert.equal(strToU8(changed.slice(0, closingOffset)).length, closingOffset);
    return changed;
  };
}
async function read(bytes: ArrayBuffer) {
  const file = new File([bytes], "prelude.xlsx");
  return parseXlsx(await file.arrayBuffer(), { name: file.name, source: "upload", sizeBytes: file.size });
}

test("valid worksheet formatting before sheetData spans the exact first XML chunk boundary", async () => {
  const control = await read(await workbook(xml => xml));
  for (const offset of [65534, 65535, 65536, 65537, 131072, 600000]) {
    const parsed = await read(await workbook(preludeAt(offset)));
    assert.equal(parsed.normalizedText, control.normalizedText, `sheetData closes at byte ${offset}`);
    assert.deepEqual([parsed.dataset.headers, ...parsed.dataset.rows.map(row => parsed.dataset.headers.map(key => row[key]))], expected);
  }
});

test("ESM and CommonJS readers retain data after a large valid XML comment", async () => {
  const bytes = await workbook(xml => xml.replace("<sheetData>", "<!--" + "comment ".repeat(10000) + "--><sheetData>"));
  const { readSheet } = await import("read-excel-file/browser");
  const commonjs = createRequire(import.meta.url)("read-excel-file/browser") as typeof import("read-excel-file/browser");
  assert.deepEqual(await readSheet(bytes, { trim: false }), expected);
  assert.deepEqual(await commonjs.readSheet(bytes, { trim: false }), expected);
});

test("the chunk guard preserves rejection for missing, empty, and truncated sheetData", async () => {
  for (const transform of [
    (xml: string) => xml.replace(/<sheetData>[\s\S]*?<\/sheetData>/u, " ".repeat(80000)),
    (xml: string) => xml.replace(/<sheetData>[\s\S]*?<\/sheetData>/u, " ".repeat(80000) + "<sheetData/>"),
    (xml: string) => xml.replace("<sheetData>", " ".repeat(80000) + "<sheetData").slice(0, -10),
  ]) await assert.rejects(async () => read(await workbook(transform)));
});
