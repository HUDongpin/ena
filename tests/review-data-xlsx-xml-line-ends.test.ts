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
const inline = (ref: string, value: string) => `<c r="${ref}" t="inlineStr"><is><t>${value}</t></is></c>`;
async function fixture(values: readonly string[], mode: "inline" | "shared" | "cached" = "inline") {
  const text = "unit,horizon,A,B,C\na,h,1,1,0\nb,h,0,1,1\nc,h,1,0,1\nd,h,1,1,1";
  const source = await prepareTypedCsvSourceV3(text, parseCsv(text, { name: "xml.csv", source: "upload" }), { unit: "text", horizon: "text", A: "number", B: "number", C: "number" }, new Date("2026-10-12T00:00:00Z"));
  const files = unzipSync(new Uint8Array(source.bytes));
  const header = ["unit", "horizon", "A", "B", "C"].map((value, i) => inline("ABCDE"[i] + "1", value)).join("");
  const rows = values.map((value, i) => `<row r="${i+2}">${mode === "inline" ? inline("A"+(i+2), value) : `<c r="A${i+2}" t="${mode === "shared" ? "s" : "str"}">${mode === "cached" ? '<f>"cached"</f>' : ""}<v>${mode === "shared" ? i : value}</v></c>`}${inline("B"+(i+2), "h")}${[[1,1,0],[0,1,1],[1,0,1],[1,1,1]][i%4].map((value,j) => `<c r="${"CDE"[j]}${i+2}"><v>${value}</v></c>`).join("")}</row>`).join("");
  files["xl/worksheets/sheet1.xml"] = strToU8(`<worksheet xmlns="${ns}"><sheetData><row r="1">${header}</row>${rows}</sheetData></worksheet>`);
  files["xl/sharedStrings.xml"] = strToU8(`<sst xmlns="${ns}">${values.map(value => `<si><t>${value}</t></si>`).join("")}</sst>`);
  return zipSync(files).buffer as ArrayBuffer;
}
async function read(values: readonly string[], mode: "inline" | "shared" | "cached" = "inline") {
  const file = new File([await fixture(values, mode)], "line-ends.xlsx");
  return parseXlsx(await file.arrayBuffer(), { name: file.name, source: "upload", sizeBytes: file.size });
}

test("native XML normalizes literal CR and CRLF before parsing inline, shared, or cached strings", async () => {
  const tokens = ["left\rright", "left\r\nright", "left\nright", "left\tend"];
  for (const mode of ["inline", "shared", "cached"] as const) {
    const parsed = await read(tokens, mode);
    assert.deepEqual(parsed.dataset.rows.map(row => row.unit), ["left\nright", "left\nright", "left\nright", "left\tend"], mode);
  }
});

test("XML character references keep CR and CDATA/comment boundaries obey source line ends", async () => {
  const tokens = ["left&#13;right", "<![CDATA[left\r\nright]]>", "left\r<!--split-->\nright", "<![CDATA[literal &#13;]]>"];
  for (const mode of ["inline", "shared", "cached"] as const) {
    const parsed = await read(tokens, mode);
    assert.deepEqual(parsed.dataset.rows.map(row => row.unit), ["left\rright", "left\nright", "left\n\nright", "literal &#13;"], mode);
  }
});

test("XML line-ending spelling cannot create a scientifically distinct Unit", async () => {
  const parsed = await read(["left\rright", "left\nright", "third", "fourth"]);
  const datasetSha256 = await sha256TextV3(parsed.normalizedText);
  const draft: StandardEnaDraftV3 = { unitColumns: ["unit"], horizonColumns: ["horizon"], groupColumn: null, codes: ["A", "B", "C"], weighting: "binary", model: "EndPoint", windowType: "Conversation", movingStanza: { backward: { kind: "finite", value: 1 }, forward: { kind: "finite", value: 0 }, rowOrder: null }, horizonOrder: null, rotation: { type: "svd", centerAlignToOrigin: true } };
  const compileResult = await compileStandardDraftV3(parsed.dataset, datasetSha256, draft);
  assert.equal(compileResult.status, "ready");
  if (compileResult.status !== "ready") throw new Error("Expected ready");
  const plan = await buildStandardExecutionPlanV3({ dataset: parsed.dataset, datasetSha256, compileResult, reference: null });
  const result = runStandardPlanV3(plan);
  assert.equal(result.set.points.length, 3);
  assert.deepEqual(result.set.connectionCounts.map(row => result.set.adjacencyKey.map(edge => row[edge.name])).sort(), [[0,1,0],[1,1,1],[1,1,1]].sort());
});

test("raw CRLF spanning the first 64 KiB XML chunk still becomes one LF", async () => {
  const probe = unzipSync(new Uint8Array(await fixture(["\r\nend", "other", "third", "fourth"])));
  const path = "xl/worksheets/sheet1.xml";
  const offset = strFromU8(probe[path]).indexOf("\r");
  assert.ok(offset > 0 && offset < 65535);
  const prefix = "x".repeat(65535 - offset);
  const bytes = await fixture([prefix + "\r\nend", "other", "third", "fourth"]);
  const source = unzipSync(new Uint8Array(bytes))[path];
  assert.equal(source[65535], 13); assert.equal(source[65536], 10);
  const parsed = await parseXlsx(bytes, { name: "chunk-boundary.xlsx", source: "upload" });
  assert.equal(parsed.dataset.rows[0].unit, prefix + "\nend");
});

test("ESM and CommonJS native readers share XML normalization without decoding CDATA entities", async () => {
  const bytes = await fixture(["left\rright", "left&#13;right", "<![CDATA[CR\rLF\n]]>", "literal &amp;#13;"], "shared");
  const { readSheet } = await import("read-excel-file/browser");
  const commonjs = createRequire(import.meta.url)("read-excel-file/browser") as typeof import("read-excel-file/browser");
  for (const reader of [readSheet, commonjs.readSheet]) {
    const rows = await reader(bytes, { trim: false });
    assert.deepEqual(rows.slice(1).map(row => row[0]), ["left\nright", "left\rright", "CR\nLF\n", "literal &#13;"]);
  }
});
