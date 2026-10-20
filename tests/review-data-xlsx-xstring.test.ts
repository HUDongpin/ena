import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { parseCsv } from "../lib/open-ena/csv";
import { prepareTypedCsvSourceV3 } from "../lib/open-ena/source-preparation-v3";
import { parseXlsx } from "../lib/open-ena/spreadsheet";
import { compileStandardDraftV3 } from "../lib/open-ena/model-v3/compiler";
import { buildStandardExecutionPlanV3 } from "../lib/open-ena/model-v3/execution-plan";
import { sha256TextV3 } from "../lib/open-ena/model-v3/canonical-json";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import type { StandardEnaDraftV3 } from "../lib/open-ena/model-v3/types";

const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const draft: StandardEnaDraftV3 = { unitColumns: ["unit"], horizonColumns: ["horizon"], groupColumn: null, codes: ["A", "B", "C"], weighting: "binary", model: "EndPoint", windowType: "Conversation", movingStanza: { backward: { kind: "finite", value: 1 }, forward: { kind: "finite", value: 0 }, rowOrder: null }, horizonOrder: null, rotation: { type: "svd", centerAlignToOrigin: true } };
const inline = (ref: string, xml: string) => `<c r="${ref}" t="inlineStr"><is>${xml}</is></c>`;
async function prepare(values: readonly string[]) {
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const text = ["unit,horizon,A,B,C", ...values.map((value, i) => `${quote(value)},h,${[[1,1,0],[0,1,1],[1,0,1],[1,1,1]][i%4].join(",")}`)].join("\n");
  return prepareTypedCsvSourceV3(text, parseCsv(text, { name: "xstring.csv", source: "upload" }), { unit: "text", horizon: "text", A: "number", B: "number", C: "number" }, new Date("2026-10-12T00:00:00Z"));
}
async function fixture(strings: readonly string[], mode: "inline" | "shared" = "inline", xml = false) {
  const source = await prepare(["a", "b", "c", "d"]);
  const files = unzipSync(new Uint8Array(source.bytes));
  const values = xml ? strings : strings.map(value => `<t>${value}</t>`);
  const header = ["unit", "horizon", "A", "B", "C"].map((value, i) => inline("ABCDE"[i]+"1", `<t>${value}</t>`)).join("");
  const rows = values.map((value, i) => `<row r="${i+2}">${mode === "inline" ? inline("A"+(i+2), value) : `<c r="A${i+2}" t="s"><v>${i}</v></c>`}${inline("B"+(i+2), "<t>h</t>")}${[[1,1,0],[0,1,1],[1,0,1],[1,1,1]][i%4].map((n,j) => `<c r="${"CDE"[j]}${i+2}"><v>${n}</v></c>`).join("")}</row>`).join("");
  files["xl/worksheets/sheet1.xml"] = strToU8(`<worksheet xmlns="${ns}"><sheetData><row r="1">${header}</row>${rows}</sheetData></worksheet>`);
  files["xl/sharedStrings.xml"] = strToU8(`<sst xmlns="${ns}">${values.map(value => `<si>${value}</si>`).join("")}</sst>`);
  return zipSync(files).buffer as ArrayBuffer;
}
async function read(strings: readonly string[], mode: "inline" | "shared" = "inline", xml = false) {
  const file = new File([await fixture(strings, mode, xml)], "xstring.xlsx");
  return parseXlsx(await file.arrayBuffer(), { name: file.name, source: "upload", sizeBytes: file.size });
}

test("native text decodes ST_Xstring once while preserving protected literal escape tokens", async () => {
  const tokens = ["left_x000D_right", "left_x005F_x000D_right", "_x005f_x005F_", "_xD83D__xDE00_", "_xd83d__xde00_", "_X000D_", "_x123_", "_x12G4_", "_x005F_x005F_x000D_", "left&#13;right"];
  const expected = ["left\rright", "left_x000D_right", "_x005F_", "😀", "😀", "_X000D_", "_x123_", "_x12G4_", "_x005F\r", "left\rright"];
  for (const mode of ["inline", "shared"] as const) assert.deepEqual((await read(tokens, mode)).dataset.rows.map(row => row.unit), expected, mode);
});

test("ST_Xstring decoding belongs to each complete text node, not SAX chunks or concatenated rich runs", async () => {
  const nodes = ["<t>left_x00<!--split-->0D_right</t>", "<t>left<![CDATA[_x000D_]]>right</t>", "<r><t>left_x00</t></r><r><t>0D_right</t></r>", "<r><t>left_x005F_</t></r><r><t>x000D_right</t></r><rPh sb=\"0\" eb=\"1\"><t>ignore_x000D_</t></rPh>", "<t>&#95;x000D_</t>", "<t><![CDATA[&amp;_x000D_]]></t>"];
  const expected = ["left\rright", "left\rright", "left_x000D_right", "left_x000D_right", null, "&amp;\r"];
  for (const mode of ["inline", "shared"] as const) assert.deepEqual((await read(nodes, mode, true)).dataset.rows.map(row => row.unit), expected, mode);
});

test("equivalent escaped and XML-referenced CR cannot create a distinct scientific Unit", async () => {
  const parsed = await read(["left_x000D_right", "left&#13;right", "third", "fourth"]);
  const datasetSha256 = await sha256TextV3(parsed.normalizedText);
  const compileResult = await compileStandardDraftV3(parsed.dataset, datasetSha256, draft);
  assert.equal(compileResult.status, "ready"); if (compileResult.status !== "ready") throw Error("Expected ready");
  const plan = await buildStandardExecutionPlanV3({ dataset: parsed.dataset, datasetSha256, compileResult, reference: null });
  const result = runStandardPlanV3(plan);
  assert.equal(result.set.points.length, 3);
  assert.deepEqual(result.set.connectionCounts.map(row => result.set.adjacencyKey.map(edge => row[edge.name])).sort(), [[0,1,0],[1,1,1],[1,1,1]].sort());
});

test("typed writer shields source escape-looking text without converting its literal meaning", async () => {
  const values = ["left_x000D_right", "left\rright", "_x005F_", "_x005F_x000D_", "_x0000_", "_xd83d__xde00_", "_X000D_", "literal &#13;"];
  const prepared = await prepare(values);
  const xml = strFromU8(unzipSync(new Uint8Array(prepared.bytes))["xl/sharedStrings.xml"]);
  for (const encoded of ["left_x005F_x000D_right", "left&#13;right", "_x005F_x005F_", "_x005F_x005F_x005F_x000D_", "_x005F_x0000_", "_x005F_xd83d__x005F_xde00_", "_X000D_", "literal &amp;#13;"]) assert.ok(xml.includes(`<t>${encoded}</t>`), encoded);
  assert.deepEqual(prepared.dataset.rows.map(row => row.unit), values);
});

test("ESM and CommonJS text readers agree on escape shielding", async () => {
  const bytes = await fixture(["left_x000D_right", "_x005F_x000D_", "third", "fourth"], "shared");
  const { readSheet } = await import("read-excel-file/browser");
  const commonjs = createRequire(import.meta.url)("read-excel-file/browser") as typeof import("read-excel-file/browser");
  for (const reader of [readSheet, commonjs.readSheet]) assert.deepEqual((await reader(bytes, { trim: false })).slice(1).map(row => row[0]), ["left\rright", "_x000D_", "third", "fourth"]);
});

test("Unicode admission preserves complete surrogate pairs and rejects isolated escaped surrogates", async () => {
  for (const mode of ["inline", "shared"] as const) {
    assert.equal((await read(["<r><t>left_xD83D_</t></r><r><t>_xDE00_right</t></r>"], mode, true)).dataset.rows[0].unit, "left😀right");
    for (const token of ["left_xD800_right", "left_xDC00_right", "_xDC00__xD800_", "_xD800__xD800_"]) await assert.rejects(read([token], mode), /invalid Unicode/u);
  }
});

test("decoded C0 text retains existing scalar semantics while typed C0 writing still rejects", async () => {
  for (const mode of ["inline", "shared"] as const) {
    const tokens = ["left_x0000_right", "left_x0008_right", "left_x001F_right", "left_x0009_right", "left_x000A_right"];
    assert.deepEqual((await read(tokens, mode)).dataset.rows.map(row => row.unit), ["left\0right", "left\bright", "left\u001fright", "left\tright", "left\nright"]);
  }
  for (const value of ["left\0right", "left\bright", "left\u001fright"]) await assert.rejects(prepare([value]), /roundtrip changed/u);
});

test("every token split across comments or CDATA decodes once, but separate rich runs stay independent", async () => {
  const token = "_x000D_", nodes: string[] = [], expected: string[] = [];
  for (let split = 1; split < token.length; split++) {
    const first = token.slice(0, split), second = token.slice(split);
    nodes.push(`<t>left${first}<!--split-->${second}right</t>`, `<t>left<![CDATA[${first}]]>${second}right</t>`, `<r><t>left${first}</t></r><r><t>${second}right</t></r>`);
    expected.push("left\rright", "left\rright", "left_x000D_right");
  }
  for (const mode of ["inline", "shared"] as const) assert.deepEqual((await read(nodes, mode, true)).dataset.rows.map(row => row.unit), expected);
});

test("each escape-token position across the real 64 KiB XML boundary retains its value", async () => {
  for (const mode of ["inline", "shared"] as const) {
    const path = mode === "inline" ? "xl/worksheets/sheet1.xml" : "xl/sharedStrings.xml";
    const probe = unzipSync(new Uint8Array(await fixture(["left_x000D_right"], mode)));
    const tokenOffset = strFromU8(probe[path]).indexOf("_x000D_");
    for (let split = 1; split < 7; split++) {
      const prefix = "z".repeat(65536 - split - tokenOffset);
      const bytes = await fixture([prefix + "left_x000D_right"], mode);
      const xml = unzipSync(new Uint8Array(bytes))[path];
      assert.equal(strFromU8(xml).indexOf("_x000D_"), 65536 - split);
      assert.equal(String.fromCharCode(xml[65536]), "_x000D_"[split]);
      const parsed = await parseXlsx(bytes, { name: "chunk-xstring.xlsx", source: "upload" });
      assert.equal(parsed.dataset.rows[0].unit, prefix + "left\rright");
    }
  }
});

test("decoded headers enforce uniqueness and malformed Unicode in unused shared strings stays unused", async () => {
  const files = unzipSync(new Uint8Array(await fixture(["ok"], "shared")));
  files["xl/sharedStrings.xml"] = strToU8(strFromU8(files["xl/sharedStrings.xml"]).replace("</sst>", "<si><t>_xD800_</t></si></sst>"));
  assert.equal((await parseXlsx(zipSync(files).buffer as ArrayBuffer, { name: "unused.xlsx", source: "upload" })).dataset.rows[0].unit, "ok");
  files["xl/worksheets/sheet1.xml"] = strToU8(strFromU8(files["xl/worksheets/sheet1.xml"]).replace("<t>unit</t>", "<t>unit_x000D_x</t>").replace("<t>horizon</t>", "<t>unit&#13;x</t>"));
  await assert.rejects(parseXlsx(zipSync(files).buffer as ArrayBuffer, { name: "duplicate-header.xlsx", source: "upload" }), /headers must be unique/u);
});
