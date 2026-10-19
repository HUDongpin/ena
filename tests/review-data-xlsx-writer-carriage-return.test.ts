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

const draft: StandardEnaDraftV3 = { unitColumns: ["unit"], horizonColumns: ["horizon"], groupColumn: null, codes: ["A", "B", "C"], weighting: "binary", model: "EndPoint", windowType: "Conversation", movingStanza: { backward: { kind: "finite", value: 1 }, forward: { kind: "finite", value: 0 }, rowOrder: null }, horizonOrder: null, rotation: { type: "svd", centerAlignToOrigin: true } };
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
async function prepare(values: string[]) {
  const text = ["unit,horizon,A,B,C", ...values.map((value, i) => `${quote(value)},h,${[[1,1,0],[0,1,1],[1,0,1],[1,1,1]][i % 4].join(",")}`)].join("\n");
  return prepareTypedCsvSourceV3(text, parseCsv(text, { name: "line-ends.csv", source: "upload" }), { unit: "text", horizon: "text", A: "number", B: "number", C: "number" }, new Date("2026-10-12T00:00:00Z"));
}
function xmlLineEnds(bytes: ArrayBuffer) {
  // XML 1.0 §2.11 requires this before parsing markup/character references.
  // A semantic no-op for a correctly serialized document, independently of our reader.
  const entries = unzipSync(new Uint8Array(bytes));
  for (const path of Object.keys(entries)) if (path.endsWith(".xml") || path.endsWith(".rels")) entries[path] = strToU8(strFromU8(entries[path]).replace(/\r\n?/gu, "\n"));
  return zipSync(entries).buffer as ArrayBuffer;
}

test("typed XLSX strings survive standards-required XML line-ending normalization", async () => {
  const values = ["left\rright", "left\nright", "left\r\nright", "left\tright", "left\r\rright", "<&>\r\"tail", "literal &#13;", "😀\r漢字"];
  const source = await prepare(values);
  const parsed = await parseXlsx(xmlLineEnds(source.bytes), { name: "xml-normalized.xlsx", source: "upload" });
  assert.deepEqual(parsed.dataset.rows.map(row => row.unit), values);
});

test("carriage-return and line-feed Units remain distinct in the actual typed derivative", async () => {
  const source = await prepare(["left\rright", "left\nright", "third", "fourth"]);
  const parsed = await parseXlsx(xmlLineEnds(source.bytes), { name: "xml-normalized.xlsx", source: "upload" });
  const datasetSha256 = await sha256TextV3(parsed.normalizedText);
  const compileResult = await compileStandardDraftV3(parsed.dataset, datasetSha256, draft);
  assert.equal(compileResult.status, "ready");
  if (compileResult.status !== "ready") throw new Error("Expected ready");
  const plan = await buildStandardExecutionPlanV3({ dataset: parsed.dataset, datasetSha256, compileResult, reference: null });
  const result = runStandardPlanV3(plan);
  assert.equal(result.set.points.length, 4);
  assert.equal(datasetSha256, source.datasetSha256);
  assert.deepEqual(result.set.connectionCounts.map(row => result.set.adjacencyKey.map(edge => row[edge.name])).sort(), [[1,0,0],[0,0,1],[0,1,0],[1,1,1]].sort());
});

test("ESM and CommonJS writers preserve CR while literal character-reference text stays literal", async () => {
  const { default: esm } = await import("write-excel-file/universal");
  const cjs = createRequire(import.meta.url)("write-excel-file/universal") as { default: typeof esm };
  for (const writer of [esm, cjs.default]) {
    const blob = await writer([["unit"], ["left\rright"], ["left\r\nright"], ["literal &#13;"], ["plain\nline"]]).toBlob();
    const parsed = await parseXlsx(xmlLineEnds(await blob.arrayBuffer()), { name: "line-ends.xlsx", source: "upload" });
    assert.deepEqual(parsed.dataset.rows.map(row => row.unit), ["left\rright", "left\r\nright", "literal &#13;", "plain\nline"]);
  }
});
