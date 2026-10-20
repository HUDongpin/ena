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

// v is ST_Xstring (ECMA-376 Part 1 18.3.1.96 and 22.9.2.19).
// Only cached string cells are decoded. No formula evaluator is involved.
const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const draft: StandardEnaDraftV3 = { unitColumns: ["unit"], horizonColumns: ["horizon"], groupColumn: null, codes: ["A", "B", "C"], weighting: "binary", model: "EndPoint", windowType: "Conversation", movingStanza: { backward: { kind: "finite", value: 1 }, forward: { kind: "finite", value: 0 }, rowOrder: null }, horizonOrder: null, rotation: { type: "svd", centerAlignToOrigin: true } };
const inline = (ref: string, value: string) => `<c r="${ref}" t="inlineStr"><is><t>${value}</t></is></c>`;
async function fixture(values: readonly string[], options: { type?: string; mixed?: boolean; missing?: boolean } = {}) {
  const text = "unit,horizon,A,B,C\na,h,1,1,0\nb,h,0,1,1\nc,h,1,0,1\nd,h,1,1,1";
  const source = await prepareTypedCsvSourceV3(text, parseCsv(text, { name: "base.csv", source: "upload" }), {unit:"text",horizon:"text",A:"number",B:"number",C:"number"}, new Date("2026-10-12T00:00:00Z"));
  const files = unzipSync(new Uint8Array(source.bytes));
  const header = ["unit", "horizon", "A", "B", "C"].map((value, i) => inline("ABCDE"[i]+"1", value)).join("");
  const rows = values.map((value, i) => {
    const ref = "A"+(i+2), type = options.type ?? "str";
    const cell = options.mixed && i===1 ? inline(ref, value) : `<c r="${ref}" t="${type}">${type==="str"?"<f>&quot;synthetic cached value&quot;</f>":""}${options.missing?"":`<v>${value}</v>`}</c>`;
    return `<row r="${i+2}">${cell}${inline("B"+(i+2),"h")}${[[1,1,0],[0,1,1],[1,0,1],[1,1,1]][i%4].map((value,j)=>`<c r="${"CDE"[j]}${i+2}"><v>${value}</v></c>`).join("")}</row>`;
  }).join("");
  files["xl/worksheets/sheet1.xml"] = strToU8(`<worksheet xmlns="${ns}"><sheetData><row r="1">${header}</row>${rows}</sheetData></worksheet>`);
  files["xl/sharedStrings.xml"] = strToU8(`<sst xmlns="${ns}"><si><t>shared-control</t></si></sst>`);
  return zipSync(files).buffer as ArrayBuffer;
}
async function read(values: readonly string[], options?: Parameters<typeof fixture>[1]) {
  return parseXlsx(await fixture(values,options),{name:"cached-xstring.xlsx",source:"upload"});
}

test("cached string values decode once, including protected literals and XML character references", async()=>{
  const values=["left_x000D_right","left&#13;right","_x005F_x000D_","_x005f_x005F_","_xD83D__xDE00_","_xd83d__xde00_","_X000D_","_x123_","_x12G4_","left_x0041_right"];
  assert.deepEqual((await read(values)).dataset.rows.map(row=>row.unit),["left\rright","left\rright","_x000D_","_x005F_","😀","😀","_X000D_","_x123_","_x12G4_","leftAright"]);
});

test("cached and inline CR or C0 are one semantic Unit with the same connection counts",async()=>{
  for(const [encoded,inlineValue] of [["left_x000D_right","left&#13;right"],["left_x0008_right","left_x0008_right"]]){
    const parsed=await read([encoded,inlineValue,"third","fourth"],{mixed:true});
    const datasetSha256=await sha256TextV3(parsed.normalizedText);
    const compileResult=await compileStandardDraftV3(parsed.dataset,datasetSha256,draft);assert.equal(compileResult.status,"ready");if(compileResult.status!=="ready")throw Error("Expected ready");
    const plan=await buildStandardExecutionPlanV3({dataset:parsed.dataset,datasetSha256,compileResult,reference:null});const result=runStandardPlanV3(plan);
    assert.equal(result.set.points.length,3);
    assert.deepEqual(result.set.connectionCounts.map(row=>result.set.adjacencyKey.map(edge=>row[edge.name])).sort(),[[0,1,0],[1,1,1],[1,1,1]].sort());
  }
});

test("cached string escape decoding waits for the whole v element across every comment and CDATA split",async()=>{
  const token="_x000D_",values:string[]=[],expected:string[]=[];
  for(let split=1;split<token.length;split++){
    values.push(`left${token.slice(0,split)}<!--split-->${token.slice(split)}right`,`left<![CDATA[${token.slice(0,split)}]]>${token.slice(split)}right`);
    expected.push("left\rright","left\rright");
  }
  values.push("left&#95;x000D_right","left<![CDATA[&amp;_x000D_]]>right");expected.push("left\rright","left&amp;\rright");
  assert.deepEqual((await read(values)).dataset.rows.map(row=>row.unit),expected);
});

test("cached strings preserve XML line-ending normalization before Xstring decoding",async()=>{
  assert.deepEqual((await read(["left\rright","left\r\nright","left<![CDATA[\r]]>right","left&#13;right","left_x000D_right"])).dataset.rows.map(row=>row.unit),["left\nright","left\nright","left\nright","left\rright","left\rright"]);
});

test("cached escaped surrogate pairs preserve Unicode and isolated surrogates fail closed",async()=>{
  assert.deepEqual((await read(["left_xD83D__xDE00_right","left_x005F_xD800_right"])).dataset.rows.map(row=>row.unit),["left😀right","left_xD800_right"]);
  for(const token of ["_xD800_","_xDC00_","_xDC00__xD800_","_xD800__xD800_"])await assert.rejects(read(["left"+token+"right"]),/invalid Unicode/u);
});

test("cached decoded C0 values retain native scalar semantics",async()=>{
  assert.deepEqual((await read(["left_x0000_right","left_x0008_right","left_x001F_right","left_x0009_right","left_x000A_right"])).dataset.rows.map(row=>row.unit),["left\0right","left\bright","left\u001fright","left\tright","left\nright"]);
});

test("cached value absence and empty strings retain their existing admission behavior",async()=>{
  assert.equal((await read([""],{missing:true})).dataset.rows[0].unit,null);
  assert.equal((await read([""])).dataset.rows[0].unit,null);
});

test("numeric, shared-index and date values never acquire string escape interpretation",async()=>{
  for(const [type,value] of [["n","_x0031_"],["s","_x0030_"],["d","2024-01-0_x0031_"],["b","_x0031_"]])await assert.rejects(read([value],{type}));
  assert.equal((await read(["1"],{type:"n"})).dataset.rows[0].unit,1);
  assert.equal((await read(["0"],{type:"s"})).dataset.rows[0].unit,"shared-control");
  assert.equal((await read(["1"],{type:"b"})).dataset.rows[0].unit,true);
  assert.equal((await read(["2024-01-01"],{type:"d"})).dataset.rows[0].unit,"2024-01-01T00:00:00.000Z");
});

test("cached string tokens split across every real 64 KiB XML chunk boundary decode once",async()=>{
  const probe=unzipSync(new Uint8Array(await fixture(["left_x000D_right"]))),path="xl/worksheets/sheet1.xml";
  const offset=strFromU8(probe[path]).indexOf("_x000D_");
  for(let split=1;split<7;split++){
    const prefix="z".repeat(65536-split-offset),bytes=await fixture([prefix+"left_x000D_right"]);
    assert.equal(strFromU8(unzipSync(new Uint8Array(bytes))[path]).indexOf("_x000D_"),65536-split);
    assert.ok((await parseXlsx(bytes,{name:"cached-chunk.xlsx",source:"upload"})).dataset.rows[0].unit===prefix+"left\rright",`Boundary ${split}: complete cached value must match`);
  }
});

test("cached string ESM and CommonJS readers agree with the same single-pass contract",async()=>{
  const bytes=await fixture(["left_x000D_right","_x005F_x000D_","_xD83D__xDE00_"]);
  const {readSheet}=await import("read-excel-file/browser");const cjs=createRequire(import.meta.url)("read-excel-file/browser") as typeof import("read-excel-file/browser");
  for(const reader of [readSheet,cjs.readSheet])assert.deepEqual((await reader(bytes,{trim:false})).slice(1).map(row=>row[0]),["left\rright","_x000D_","😀"]);
});
