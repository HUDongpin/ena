import assert from "node:assert/strict";
import test from "node:test";
import { zipSync, unzipSync, strToU8 } from "fflate";
import { parseXlsx } from "../lib/open-ena/spreadsheet";
import { compileStandardDraftV3 } from "../lib/open-ena/model-v3/compiler";
import { buildStandardExecutionPlanV3 } from "../lib/open-ena/model-v3/execution-plan";
import { sha256TextV3 } from "../lib/open-ena/model-v3/canonical-json";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import type { StandardEnaDraftV3 } from "../lib/open-ena/model-v3/types";

const options = { name: "unicode-identities.xlsx", source: "upload" as const };
const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const xml = '<?xml version="1.0" encoding="UTF-8"?>';
function workbook(input: { strings?: string | Uint8Array; sheet?: string | Uint8Array; routing?: string | Uint8Array; paths?: string | Uint8Array; styles?: Uint8Array; customPaths?: boolean; extras?: Record<string, Uint8Array> } = {}) {
  const strings = ["unit", "horizon", "A", "B", "C", "café", "cafè", "u3", "u4", "h"];
  const rows = [
    '<row r="1">' + strings.slice(0, 5).map((_, i) => `<c r="${"ABCDE"[i]}1" t="s"><v>${i}</v></c>`).join("") + '</row>',
    ...[[5, 1, 1, 0], [6, 0, 1, 1], [7, 1, 0, 1], [8, 1, 1, 1]].map(([id, a, b, c], i) => `<row r="${i + 2}"><c r="A${i + 2}" t="s"><v>${id}</v></c><c r="B${i + 2}" t="s"><v>9</v></c>${[a,b,c].map((v,j) => `<c r="${"CDE"[j]}${i+2}"><v>${v}</v></c>`).join("")}</row>`),
  ];
  const stringsPath = input.customPaths ? "xl/custom/words.xml" : "xl/sharedStrings.xml";
  const stylesPath = input.customPaths ? "xl/custom/looks.xml" : "xl/styles.xml";
  const entries: Record<string, Uint8Array> = {};
  const add = (path: string, value: string | Uint8Array) => { entries[path] = typeof value === "string" ? strToU8(value) : value; };
  add("xl/workbook.xml", input.routing ?? `${xml}<workbook xmlns="${ns}" xmlns:r="${rel}"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  add("xl/_rels/workbook.xml.rels", input.paths ?? `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/>${input.customPaths ? `<Relationship Id="rId2" Type="${rel}/sharedStrings" Target="/xl/custom/words.xml"/><Relationship Id="rId3" Type="${rel}/styles" Target="custom/looks.xml"/>` : ""}</Relationships>`);
  add("xl/worksheets/sheet1.xml", input.sheet ?? `${xml}<worksheet xmlns="${ns}"><sheetData>${rows.join("")}</sheetData></worksheet>`);
  add(stringsPath, input.strings ?? `${xml}<sst xmlns="${ns}">${strings.map(v=>`<si><t>${v}</t></si>`).join("")}</sst>`);
  if (input.styles) add(stylesPath, input.styles);
  return zipSync({ ...entries, ...input.extras }).buffer as ArrayBuffer;
}
function sharedStringsWithBytes(bytes: readonly number[]) {
  const prefix = strToU8(`${xml}<sst xmlns="${ns}">${["unit", "horizon", "A", "B", "C"].map(v=>`<si><t>${v}</t></si>`).join("")}<si><t>caf`);
  const suffix = strToU8('</t></si><si><t>cafè</t></si><si><t>u3</t></si><si><t>u4</t></si><si><t>h</t></si></sst>');
  return new Uint8Array([...prefix, ...bytes, ...suffix]);
}
const draft: StandardEnaDraftV3 = { unitColumns: ["unit"], horizonColumns: ["horizon"], groupColumn: null, codes: ["A", "B", "C"], weighting: "binary", model: "EndPoint", windowType: "Conversation", movingStanza: { backward: { kind: "finite", value: 1 }, forward: { kind: "finite", value: 0 }, rowOrder: null }, horizonOrder: null, rotation: { type: "svd", centerAlignToOrigin: true } };

test("native XLSX rejects malformed shared-string UTF-8 before replacing scientific identities", async () => {
  for (const bytes of [[0xe9], [0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80], [0x80], [0xe2, 0x82]]) {
    await assert.rejects(parseXlsx(workbook({ strings: sharedStringsWithBytes(bytes) }), options), /UTF-8/i, `invalid bytes ${bytes.join(",")}`);
  }
});

test("worksheet and relationship-selected metadata receive the same UTF-8 admission", async () => {
  const malformed = new Uint8Array([...strToU8(`${xml}<worksheet xmlns="${ns}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>unit</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>caf`), 0xe9, ...strToU8('</t></is></c></row></sheetData></worksheet>')]);
  await assert.rejects(parseXlsx(workbook({ sheet: malformed }), options), /UTF-8/i);
  await assert.rejects(parseXlsx(workbook({ customPaths: true, strings: sharedStringsWithBytes([0xe9]) }), options), /UTF-8/i);
  const styles = new Uint8Array([...strToU8(`${xml}<styleSheet xmlns="${ns}"><!--`),0xe9,...strToU8('--></styleSheet>')]);
  await assert.rejects(parseXlsx(workbook({ customPaths: true, styles }), options), /UTF-8/i);
});

test("valid Unicode retains four independently expected units and connection counts", async () => {
  const parsed = await parseXlsx(workbook(), options);
  assert.deepEqual(parsed.dataset.rows.map(row => row.unit), ["café", "cafè", "u3", "u4"]);
  const datasetSha256 = await sha256TextV3(parsed.normalizedText);
  const compiled = await compileStandardDraftV3(parsed.dataset, datasetSha256, draft);
  assert.equal(compiled.status, "ready");
  if (compiled.status !== "ready") throw new Error("Expected ready");
  const plan = await buildStandardExecutionPlanV3({ dataset: parsed.dataset, datasetSha256, compileResult: compiled, reference: null });
  const runtime = runStandardPlanV3(plan);
  assert.equal(runtime.set.points.length, 4);
  const actualCounts = runtime.set.connectionCounts.map(row => runtime.set.adjacencyKey.map(edge => row[edge.name])).sort();
  assert.deepEqual(actualCounts, [[1, 0, 0], [0, 0, 1], [0, 1, 0], [1, 1, 1]].sort());
});

test("multibyte UTF-8 crossing validation chunks and irrelevant binary payloads stay admitted", async () => {
  // Position each multibyte scalar across a 64 KiB validation boundary.
  for (const scalar of ["é", "漢", "😀"]) {
    for (const offset of [65534, 65535, 65536]) {
      const prefixLength = new TextDecoder().decode(sharedStringsWithBytes([])).indexOf("</t></si><si><t>cafè");
      const padding = "x".repeat(offset - prefixLength);
      const strings = sharedStringsWithBytes([...strToU8(padding + scalar + "tail")]);
      assert.deepEqual(strings.subarray(offset, offset + strToU8(scalar).length), strToU8(scalar));
      const bytes = workbook({ strings, extras: { "xl/media/image1.jpeg": new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), "xl/worksheets/unused.xml": new Uint8Array([0xff]) } });
      const parsed = await parseXlsx(bytes, options);
      assert.equal(parsed.dataset.rows[0].unit, "caf" + padding + scalar + "tail");
    }
  }
  const validReplacement = await parseXlsx(workbook({ strings: sharedStringsWithBytes([...strToU8("\ufffd")]) }), options);
  assert.equal(validReplacement.dataset.rows[0].unit, "caf\ufffd", "a literal valid replacement character is not a decoding error");
});


test("UTF-8 BOMs survive and malformed workbook routing rejects before reader replacement", async () => {
  const entries = unzipSync(new Uint8Array(workbook()));
  for (const path of Object.keys(entries)) entries[path] = new Uint8Array([0xef, 0xbb, 0xbf, ...entries[path]]);
  const parsed = await parseXlsx(zipSync(entries).buffer as ArrayBuffer, options);
  assert.deepEqual(parsed.dataset.rows.map(row => row.unit), ["café", "cafè", "u3", "u4"]);
  for (const path of ["xl/workbook.xml", "xl/_rels/workbook.xml.rels"]) {
    const corrupt = unzipSync(new Uint8Array(workbook()));
    corrupt[path] = new Uint8Array([...strToU8("<!--"), 0xe9, ...strToU8("-->"), ...corrupt[path]]);
    await assert.rejects(parseXlsx(zipSync(corrupt).buffer as ArrayBuffer, options), /UTF-8/i);
  }
  const truncated = unzipSync(new Uint8Array(workbook()));
  truncated["xl/sharedStrings.xml"] = new Uint8Array([...truncated["xl/sharedStrings.xml"], 0xe2, 0x82]);
  await assert.rejects(parseXlsx(zipSync(truncated).buffer as ArrayBuffer, options), /UTF-8/i, "finish() must reject a trailing incomplete code point");
});
