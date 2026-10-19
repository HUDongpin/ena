import assert from "node:assert/strict";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import { parseXlsx } from "../lib/open-ena/spreadsheet";
import { compileStandardDraftV3 } from "../lib/open-ena/model-v3/compiler";
import { buildStandardExecutionPlanV3 } from "../lib/open-ena/model-v3/execution-plan";
import { sha256TextV3 } from "../lib/open-ena/model-v3/canonical-json";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import type { StandardEnaDraftV3 } from "../lib/open-ena/model-v3/types";

const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const options = { name: "date-identities.xlsx", source: "upload" as const };
function dateWorkbook(values: readonly string[], mode: "date" | "text" = "date", epoch1904 = false) {
  const cell = (column: string, row: number, value: string, type: string) => `<c r="${column}${row}" t="${type}">${type === "inlineStr" ? `<is><t>${value}</t></is>` : `<v>${value}</v>`}</c>`;
  const header = ["unit", "horizon", "A", "B", "C"].map((v, i) => cell("ABCDE"[i], 1, v, "inlineStr")).join("");
  const rows = values.map((value, i) => `<row r="${i + 2}">${cell("A", i + 2, value, mode === "date" ? "d" : "inlineStr")}${cell("B", i + 2, "h", "inlineStr")}${[[1, 1, 0], [0, 1, 1], [1, 0, 1], [1, 1, 1]][i % 4].map((v, j) => cell("CDE"[j], i + 2, String(v), "n")).join("")}</row>`).join("");
  const files = {
    "xl/workbook.xml": `<workbook xmlns="${ns}" xmlns:r="${rel}"><workbookPr date1904="${epoch1904 ? "1" : "0"}"/><sheets><sheet name="Data" sheetId="1" r:id="r1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/styles.xml": `<styleSheet xmlns="${ns}"/>`,
    "xl/worksheets/sheet1.xml": `<worksheet xmlns="${ns}"><sheetData><row r="1">${header}</row>${rows}</sheetData></worksheet>`,
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([key, value]) => [key, strToU8(value)]))).buffer as ArrayBuffer;
}
const draft: StandardEnaDraftV3 = { unitColumns: ["unit"], horizonColumns: ["horizon"], groupColumn: null, codes: ["A", "B", "C"], weighting: "binary", model: "EndPoint", windowType: "Conversation", movingStanza: { backward: { kind: "finite", value: 1 }, forward: { kind: "finite", value: 0 }, rowOrder: null }, horizonOrder: null, rotation: { type: "svd", centerAlignToOrigin: true } };

test("native date cells reject invalid calendars before rollover can merge scientific Units", async () => {
  for (const value of ["2024-02-30T00:00:00Z", "2023-02-29", "2024-04-31T00:00:00+08:00", "1900-02-29T00:00:00Z"]) {
    await assert.rejects(parseXlsx(dateWorkbook([value, "2024-03-01T00:00:00Z"]), options), /date.*(?:calendar|invalid)|invalid.*date/i, value);
  }
});

test("native date cells cannot erase unsupported precision or import host-local time", async () => {
  for (const value of ["2024-03-01T00:00:00.0001Z", "2024-03-01T00:00:00.1230001Z", "01/02/2024", "2024-03-01T00:00:00", "2024-03-01T00:00:00-00:00"]) {
    await assert.rejects(parseXlsx(dateWorkbook([value]), options), /date.*(?:precision|offset|ISO)|(?:precision|offset|ISO).*date/i, value);
  }
});

test("valid ISO date-only, offset, leap-day and exact-millisecond cells retain expected UTC values", async () => {
  const pairs = [
    ["2024-02-29", "2024-02-29T00:00:00.000Z"],
    ["1900-01-01T00:00:00Z", "1900-01-01T00:00:00.000Z"],
    ["2024-02-29T12:34:56.123Z", "2024-02-29T12:34:56.123Z"],
    ["2024-02-29T12:34:56.123000Z", "2024-02-29T12:34:56.123Z"],
    ["2024-03-01T01:30:00+02:00", "2024-02-29T23:30:00.000Z"],
    ["2024-02-29T23:30:00-02:00", "2024-03-01T01:30:00.000Z"],
    ["2024-02-29T24:00:00Z", "2024-03-01T00:00:00.000Z"],
  ];
  for (const epoch1904 of [false, true]) {
    const parsed = await parseXlsx(dateWorkbook(pairs.map(([source]) => source), "date", epoch1904), options);
    assert.deepEqual(parsed.dataset.rows.map(row => row.unit), pairs.map(([, expected]) => expected), "native ISO dates do not use the numeric date-system epoch");
  }
});

test("date admission preserves distinct valid millisecond identities and literal Text dates", async () => {
  const values = ["2024-03-01T00:00:00.001Z", "2024-03-01T00:00:00.002Z", "2024-03-02T00:00:00Z", "2024-03-03T00:00:00Z"];
  const parsed = await parseXlsx(dateWorkbook(values), options);
  const datasetSha256 = await sha256TextV3(parsed.normalizedText);
  const compiled = await compileStandardDraftV3(parsed.dataset, datasetSha256, draft);
  assert.equal(compiled.status, "ready");
  if (compiled.status !== "ready") throw new Error("Expected ready");
  const plan = await buildStandardExecutionPlanV3({ dataset: parsed.dataset, datasetSha256, compileResult: compiled, reference: null });
  const runtime = runStandardPlanV3(plan);
  assert.equal(runtime.set.points.length, 4);
  assert.deepEqual(runtime.set.connectionCounts.map(row => runtime.set.adjacencyKey.map(edge => row[edge.name])).sort(), [[1, 0, 0], [0, 0, 1], [0, 1, 0], [1, 1, 1]].sort());
  const textValues = ["2024-02-30T00:00:00Z", "01/02/2024", "2024-03-01T00:00:00.0001Z"];
  assert.deepEqual((await parseXlsx(dateWorkbook(textValues, "text"), options)).dataset.rows.map(row => row.unit), textValues);
});

test("date token admission handles XML entity decoding, formatting whitespace and empty dates", async () => {
  const entries = (await import("fflate")).unzipSync(new Uint8Array(dateWorkbook(["2024-02-29T12:34:56.123Z", ""])));
  const path = "xl/worksheets/sheet1.xml";
  let source = new TextDecoder().decode(entries[path]);
  source = source.replace("2024-02-29T12:34:56.123Z", "&#x32;024-02-29T12:34:56.123Z").replaceAll("</c><c", "</c>\n  <c").replaceAll("</row><row", "</row>\n<row");
  entries[path] = strToU8(source);
  const parsed = await parseXlsx(zipSync(entries).buffer as ArrayBuffer, options);
  assert.deepEqual(parsed.dataset.rows.map(row => row.unit), ["2024-02-29T12:34:56.123Z", null]);
});

test("accepted date hashes and ambiguous-date rejection are identical across host time zones", async () => {
  const { execFileSync } = await import("node:child_process");
  const moduleUrl = new URL("../lib/open-ena/spreadsheet.ts", import.meta.url).href;
  const good = Buffer.from(dateWorkbook(["2024-02-29", "2024-03-01T01:30:00+02:00", "2024-02-29T23:30:00-02:00"])).toString("base64");
  const bad = Buffer.from(dateWorkbook(["2024-03-01T00:00:00", "2024-03-01T00:00:00Z"])).toString("base64");
  const script = `import { parseXlsx } from ${JSON.stringify(moduleUrl)};
const convert = (value) => { const bytes = Buffer.from(value, 'base64'); return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); };
const good = await parseXlsx(convert(${JSON.stringify(good)}), {name:'date.xlsx',source:'upload'});
let rejected = false; try { await parseXlsx(convert(${JSON.stringify(bad)}), {name:'date.xlsx',source:'upload'}); } catch(error) { rejected = /explicit offset/.test(String(error)); }
console.log(JSON.stringify({normalizedText:good.normalizedText,rejected}));`;
  const results = ["Etc/UTC", "Asia/Hong_Kong", "America/New_York"].map(TZ => JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { env: { PATH: process.env.PATH, TZ, NODE_ENV: "test" }, encoding: "utf8" })) as { normalizedText: string; rejected: boolean });
  assert.equal(results.every(result => result.rejected), true);
  assert.equal(new Set(results.map(result => result.normalizedText)).size, 1);
});
