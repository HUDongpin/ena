import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";
import writeXlsxFile from "write-excel-file/universal";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

// Real browser parsing, using only bounded synthetic workbooks and intercepted requests.
const original = new Uint8Array(await (await writeXlsxFile([
  ["unit", "number", "boolean"].map(value => ({ value, type: String })),
  [{ value: "001", type: String }, { value: 0.125, type: Number }, { value: true, type: Boolean }],
  [{ value: "合成", type: String }, { value: 2, type: Number }, { value: false, type: Boolean }],
]).toBlob()).arrayBuffer());
const files = unzipSync(original);
files["xl/worksheets/sheet1.xml"] = strToU8(strFromU8(files["xl/worksheets/sheet1.xml"]).replace('r="B2"', 'r="IW2"'));
const beyondColumnLimit = zipSync(files);
const mismatchedDirectory = Uint8Array.from(original);
new DataView(mismatchedDirectory.buffer).setUint16(mismatchedDirectory.length - 22 + 10, 0, true);

const bundle = await build({
  stdin: { contents: "import { parseXlsx } from './lib/open-ena/spreadsheet'; window.parseSynthetic = async bytes => { try { const parsed = await parseXlsx(Uint8Array.from(bytes).buffer, {name:'synthetic.xlsx',source:'upload'}); return {rows:parsed.dataset.rows}; } catch(error) { return {error:error.message}; } };", loader: "ts", resolveDir: process.cwd() },
  bundle: true, format: "iife", platform: "browser", write: false, logLevel: "silent",
});
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => {
    assert.equal(new URL(route.request().url()).origin, "http://localhost:32148");
    return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Synthetic XLSX regression</title>" });
  });
  await page.goto("http://localhost:32148/");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const parse = bytes => page.evaluate(bytes => window.parseSynthetic(bytes), Array.from(bytes));
  assert.deepEqual((await parse(original)).rows, [
    { unit: "001", number: 0.125, boolean: true },
    { unit: "合成", number: 2, boolean: false },
  ]);
  assert.match((await parse(beyondColumnLimit)).error, /Worksheet column coordinates.*limit/);
  assert.match((await parse(mismatchedDirectory)).error, /invalid or multi-disk ZIP directory/);
  assert.deepEqual(errors, []);
  console.log("Chromium XLSX admission: typed and Unicode roundtrip, coordinate boundary, and ZIP count consistency PASS");
} finally { await browser.close(); }
