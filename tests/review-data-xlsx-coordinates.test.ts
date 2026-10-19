import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import writeXlsxFile from "write-excel-file/universal";
import { parseXlsx } from "../lib/open-ena/spreadsheet";

async function worksheet(rewrite: (xml: string) => string, routing?: (files: Record<string, Uint8Array>) => void) {
  const blob = await writeXlsxFile([
    [{ value: "unit", type: String }, { value: "A", type: String }],
    [{ value: "u1", type: String }, { value: 1, type: Number }],
  ]).toBlob();
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  files["xl/worksheets/sheet1.xml"] = strToU8(rewrite(strFromU8(files["xl/worksheets/sheet1.xml"])));
  routing?.(files);
  const bytes = zipSync(files);
  return Uint8Array.from(bytes).buffer;
}
const options = { name: "coordinate-boundary.xlsx", source: "upload" as const };

test("small sparse worksheet cannot expand beyond the browser row limit before normalization", async () => {
  // Only 20,002 short rows are allocated by the old reader. This reproduces
  // the missing admission without ever trying an unbounded coordinate.
  const bytes = await worksheet((xml) => xml.replace('r="2"', 'r="20002"').replaceAll('r="A2"', 'r="A20002"').replaceAll('r="B2"', 'r="B20002"'));
  await assert.rejects(parseXlsx(bytes, options), /worksheet.*row.*limit/i);
});

test("in-budget sparse rows still preserve the actual data", async () => {
  const bytes = await worksheet((xml) => xml.replace('r="2"', 'r="5"').replaceAll('r="A2"', 'r="A5"').replaceAll('r="B2"', 'r="B5"'));
  assert.deepEqual((await parseXlsx(bytes, options)).dataset.rows, [{ unit: "u1", A: 1 }]);
});

test("unbounded coordinates reject inside a time- and heap-limited child", async () => {
  const bytes = await worksheet((xml) => xml.replace('r="2"', 'r="Infinity"'));
  const child = spawnSync(process.execPath, ["--max-old-space-size=32", "--import", "tsx", "--input-type=module", "-e", `
    import { readFileSync } from "node:fs";
    import { parseXlsx } from "./lib/open-ena/spreadsheet.ts";
    const bytes = Uint8Array.from(Buffer.from(readFileSync(0, "utf8"), "base64")).buffer;
    try { await parseXlsx(bytes, { name: "bounded-child.xlsx", source: "upload" }); process.stdout.write("accepted"); }
    catch (error) { process.stdout.write("rejected:" + error.message); }
  `], { input: Buffer.from(bytes).toString("base64"), encoding: "utf8", timeout: 3000, maxBuffer: 8192 });
  assert.equal(child.error, undefined, "coordinate rejection must finish before the child deadline");
  assert.equal(child.status, 0, "coordinate rejection must not exhaust the bounded child heap");
  assert.match(child.stdout, /rejected:Worksheet row coordinates.*limit/);
});

test("cell coordinates, including entity-encoded and prefixed XML, are admitted before dense expansion", async () => {
  const rowOverflow = await worksheet((xml) => xml.replaceAll('r="A2"', 'r="A20002"'));
  await assert.rejects(parseXlsx(rowOverflow, options), /Worksheet row coordinates.*limit/);
  const columnOverflow = await worksheet((xml) => xml.replaceAll('r="B2"', 'r="IW2"'));
  await assert.rejects(parseXlsx(columnOverflow, options), /Worksheet column coordinates.*limit/);
  const obfuscated = await worksheet((xml) => xml
    .replace('<worksheet ', '<worksheet xmlns:sheet="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ')
    .replaceAll('<row ', '<sheet:row ').replaceAll('</row>', '</sheet:row>')
    .replace('r="2"', 'r="&#50;0002"'));
  await assert.rejects(parseXlsx(obfuscated, options), /Worksheet row coordinates.*limit/);
});

test("preflight follows the actual first worksheet relationship and ignores an unselected sheet", async () => {
  const bytes = await worksheet((xml) => xml, (files) => {
    files["xl/custom/selected.xml"] = files["xl/worksheets/sheet1.xml"];
    files["xl/worksheets/sheet1.xml"] = strToU8(strFromU8(files["xl/worksheets/sheet1.xml"]).replace('r="2"', 'r="20002"'));
    files["xl/_rels/workbook.xml.rels"] = strToU8(strFromU8(files["xl/_rels/workbook.xml.rels"]).replace('Target="worksheets/sheet1.xml"', 'Target="/xl/custom/selected.xml"'));
  });
  assert.deepEqual((await parseXlsx(bytes, options)).dataset.rows, [{ unit: "u1", A: 1 }]);
});

test("the last admitted row coordinate remains valid and dimension claims cannot override it", async () => {
  const bytes = await worksheet((xml) => xml.replace('r="2"', 'r="20001"').replaceAll('r="A2"', 'r="A20001"').replaceAll('r="B2"', 'r="B20001"'));
  assert.deepEqual((await parseXlsx(bytes, options)).dataset.rows, [{ unit: "u1", A: 1 }]);
});

test("implicit empty rows after a sparse explicit row count toward materialization", async () => {
  const bytes = await worksheet((xml) => xml.replace('r="2"', 'r="20001"').replaceAll('r="A2"', 'r="A20001"').replaceAll('r="B2"', 'r="B20001"').replace('</sheetData>', '<row/></sheetData>'));
  await assert.rejects(parseXlsx(bytes, options), /Worksheet row coordinates.*limit/);
});

test("the full 256-column boundary remains supported", async () => {
  const headers = Array.from({ length: 256 }, (_, index) => ({ value: `column ${index + 1}`, type: String }));
  const values = Array.from({ length: 256 }, (_, index) => ({ value: index, type: Number }));
  const bytes = await (await writeXlsxFile([headers, values]).toBlob()).arrayBuffer();
  const parsed = await parseXlsx(bytes, options);
  assert.equal(parsed.dataset.headers.length, 256);
  assert.equal(parsed.dataset.rows[0]["column 256"], 255);
});
