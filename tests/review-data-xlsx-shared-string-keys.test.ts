import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { parseCsv } from "../lib/open-ena/csv";
import { parseXlsx } from "../lib/open-ena/spreadsheet";
import { prepareTypedCsvSourceV3, previewSourceTypesV3, type SourceTypeDeclarationsV3 } from "../lib/open-ena/source-preparation-v3";

const inheritedNames = Object.getOwnPropertyNames(Object.prototype);
const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
async function prepare(label: string, position: "header" | "value") {
  const headers = [position === "header" ? label : "unit", "A", "B", "C"];
  const values = [position === "value" ? label : "u1", 1, 2, 3];
  const csv = [headers, values].map(row => row.map(quote).join(",")).join("\n");
  const dataset = parseCsv(csv, { name: "shared-string-keys.csv", source: "upload" });
  const declarations: SourceTypeDeclarationsV3 = Object.fromEntries(headers.map((header, index) => [header, index === 0 ? "text" : "number"]));
  assert.equal(previewSourceTypesV3(dataset, declarations).errorCount, 0);
  const prepared = await prepareTypedCsvSourceV3(csv, dataset, declarations, new Date("2026-10-12T00:00:00Z"));
  assert.deepEqual(prepared.dataset.headers, headers);
  assert.deepEqual(headers.map(header => prepared.dataset.rows[0][header]), values);
  const reloaded = await parseXlsx(prepared.bytes, { name: "reloaded.xlsx", source: "upload", sizeBytes: prepared.bytes.byteLength });
  assert.deepEqual(reloaded.dataset.rows, prepared.dataset.rows);
  assert.deepEqual(reloaded.dataset.headers, headers);
}
for (const name of inheritedNames) for (const position of ["header", "value"] as const) {
  test(`typed CSV preserves Object.prototype string ${JSON.stringify(name)} as ${position}`, async () => {
    await prepare(name, position);
  });
}

test("ordinary, numeric-looking and near-matching shared strings retain their existing roundtrip", async () => {
  for (const name of ["prototype", "0", "1", "01", "4294967294", "4294967295", "ordinary", "__proto__ suffix", "constructor suffix", "toString\r_x0041_"]) {
    await prepare(name, "header");
    await prepare(name, "value");
  }
});

type SharedStrings = { getSharedStrings(): string[]; findOrCreateSharedString(value: string): number };
for (const distribution of ["modules", "commonjs"]) {
  test(`${distribution} shared-string dictionary assigns finite integer indices and deduplicates all inherited names`, async () => {
    const url = new URL(`../node_modules/write-excel-file/${distribution}/xlsx/initializeSharedStrings.js`, import.meta.url);
    const module = distribution === "commonjs" ? createRequire(import.meta.url)(url.pathname) : await import(url.href);
    const dictionary = (module.default ?? module)() as SharedStrings;
    const strings = ["ordinary", ...inheritedNames, "0", "4294967295", "prototype", "toString\r_x0041_"];
    const before = Object.getOwnPropertyDescriptors(Object.prototype);
    strings.forEach((value, index) => {
      assert.equal(dictionary.findOrCreateSharedString(value), index);
      assert.equal(dictionary.findOrCreateSharedString(value), index);
    });
    assert.deepEqual(dictionary.getSharedStrings(), strings);
    assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype), before);
  });
}
