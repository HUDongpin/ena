import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createOpenEnaTextDownloadBlob } from "../lib/open-ena/download";
import { rowsToCsv } from "../lib/open-ena/export";
import { parseCsv } from "../lib/open-ena/csv";

const text = rowsToCsv([{ "參與者": "中文 café 👩‍🔬", "A → B": 1.5 }]);
for (const type of ["text/csv", "text/csv;charset=utf-8", "text/csv; charset=us-ascii"]) {
  test(`CSV download normalizes ${type} and preserves Unicode after its UTF-8 signature`, async () => {
    const blob = createOpenEnaTextDownloadBlob(text, type);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.equal(blob.type, "text/csv;charset=utf-8");
    assert.equal(new TextDecoder().decode(bytes.slice(3)), text);
    assert.equal(text.startsWith("\ufeff"), false, "serializer stays BOM-free");
    const parsed = parseCsv(new TextDecoder().decode(bytes), { name: "download.csv", sizeBytes: bytes.length, source: "upload" });
    assert.equal(parsed.headers[0], "參與者");
    assert.equal(parsed.rows[0]["參與者"], "中文 café 👩‍🔬");
  });
}
test("an existing CSV BOM is not duplicated, and non-CSV downloads retain exact bytes", async () => {
  assert.equal(new TextDecoder("utf-8", { ignoreBOM: true }).decode(await createOpenEnaTextDownloadBlob(`\ufeff${text}`, "text/csv").arrayBuffer()), `\ufeff${text}`);
  for (const type of ["application/json", "image/svg+xml;charset=utf-8", "text/markdown"]) {
    const blob = createOpenEnaTextDownloadBlob(text, type);
    assert.equal(blob.type, type);
    assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), new TextEncoder().encode(text));
  }
});

// Execute the native panel's actual save boundary; the ZIP and its hash-bound
// members must not be changed when the standalone CSV download is fixed.
const source = readFileSync(new URL("../components/open-ena/model-v3/OpenEnaTrajectoryAnalysisPanelV3.tsx", import.meta.url), "utf8");
const syntax = ts.createSourceFile("panel.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let saveSource = "";
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "save") saveSource = node.getText(syntax);
  ts.forEachChild(node, visit);
}
visit(syntax);
assert.ok(saveSource, "native trajectory download boundary exists");
const executable = ts.transpileModule(saveSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

test("standalone native trajectory CSV download has a BOM while the ZIP bytes stay exact", async () => {
  const captured: Blob[] = [];
  const save = runInNewContext(`${executable}\nsave`, {
    Blob, Uint8Array, TextDecoder, createOpenEnaTextDownloadBlob,
    URL: { createObjectURL: (blob: Blob) => { captured.push(blob); return "blob:synthetic-download"; }, revokeObjectURL: () => {} },
    document: { createElement: () => ({ click: () => {} }) }, setTimeout: () => {},
  }) as (bytes: Uint8Array, type: string, filename: string) => void;
  const csvBytes = new TextEncoder().encode(text);
  save(csvBytes, "text/csv;charset=utf-8", "trajectory.csv");
  assert.deepEqual([...new Uint8Array(await captured[0].arrayBuffer()).slice(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(captured[0].type, "text/csv;charset=utf-8");
  assert.equal(new TextDecoder().decode(await captured[0].arrayBuffer()), text);
  const zip = Uint8Array.of(0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0x80);
  save(zip, "application/zip", "trajectory.zip");
  assert.deepEqual(new Uint8Array(await captured[1].arrayBuffer()), zip);
  assert.equal(captured[1].type, "application/zip");
  assert.deepEqual(csvBytes, new TextEncoder().encode(text), "original CSV bytes are not mutated");
});
