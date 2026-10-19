import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { parseCsv } from "../lib/open-ena/csv";
import { prepareTypedCsvSourceV3 } from "../lib/open-ena/source-preparation-v3";
import { parseXlsx } from "../lib/open-ena/spreadsheet";

const expected = [["unit", "A", "B", "C"], ["a", 1, 1, 0], ["b", 0, 1, 1], ["c", 1, 0, 1]];
async function workbooks() {
  const text = "unit,A,B,C\na,1,1,0\nb,0,1,1\nc,1,0,1";
  const source = await prepareTypedCsvSourceV3(text, parseCsv(text, { name: "optional.csv", source: "upload" }), { unit: "text", A: "number", B: "number", C: "number" }, new Date("2026-10-12T00:00:00Z"));
  const entries = unzipSync(new Uint8Array(source.bytes));
  // This known ASCII fixture converts all seven shared strings to inline text,
  // leaving no cell that depends on either optional metadata part.
  const strings = ["unit", "A", "B", "C", "a", "b", "c"];
  entries["xl/worksheets/sheet1.xml"] = strToU8(strFromU8(entries["xl/worksheets/sheet1.xml"]).replace(/<c r="([A-D][1-4])" t="s"><v>([0-6])<\/v><\/c>/gu,
    (_all, coordinate: string, index: string) => `<c r="${coordinate}" t="inlineStr"><is><t>${strings[Number(index)]}</t></is></c>`));
  assert.equal(/\st="s"|\ss="/u.test(strFromU8(entries["xl/worksheets/sheet1.xml"])), false);
  return [[], ["styles"], ["sharedStrings"], ["styles", "sharedStrings"]].map(missing => {
    const files = { ...entries };
    for (const name of missing) {
      delete files[`xl/${name}.xml`];
      files["xl/_rels/workbook.xml.rels"] = strToU8(strFromU8(files["xl/_rels/workbook.xml.rels"]).replace(new RegExp(`<Relationship [^>]+Type="[^"]+/${name}"[^>]*/>`, "u"), ""));
      files["[Content_Types].xml"] = strToU8(strFromU8(files["[Content_Types].xml"]).replace(new RegExp(`<Override [^>]+PartName="/xl/${name}\\.xml"/>`, "u"), ""));
    }
    return { missing, bytes: zipSync(files).buffer as ArrayBuffer };
  });
}

test("native XLSX imports the same typed rows with either or both optional metadata parts absent", async () => {
  const normalized = [];
  for (const { missing, bytes } of await workbooks()) {
    const file = new File([bytes], "optional-metadata.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const parsed = await parseXlsx(await file.arrayBuffer(), { name: file.name, source: "upload", sizeBytes: file.size });
    assert.deepEqual([parsed.dataset.headers, ...parsed.dataset.rows.map(row => parsed.dataset.headers.map(key => row[key]))], expected, JSON.stringify(missing));
    normalized.push(parsed.normalizedText);
  }
  assert.equal(new Set(normalized).size, 1);
});

test("browser ESM and CommonJS entries share the corrected optional-metadata reader", async () => {
  const { readSheet } = await import("read-excel-file/browser");
  const commonjs = createRequire(import.meta.url)("read-excel-file/browser") as typeof import("read-excel-file/browser");
  const fixture = (await workbooks()).at(-1)!;
  assert.deepEqual(await readSheet(fixture.bytes, { trim: false }), expected);
  assert.deepEqual(await commonjs.readSheet(fixture.bytes, { trim: false }), expected);
});
