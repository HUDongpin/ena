import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { createExportBundle, executeLongitudinalAnalysisV2 } from "j-3dena";
import * as csvDownloads from "../lib/open-ena/csv-download";
import { openEnaTrajectoryDisplaySpecV3 } from "../lib/open-ena/longitudinal-v3";
import { validOpenEnaLongitudinalRequestV3 } from "./helpers/open-ena-longitudinal-v3-fixture";

function boundary(filename: string, name: string) {
  const source = readFileSync(filename, "utf8");
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration = "";
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) declaration = node.getText(tree);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(declaration);
  const js = ts.transpileModule(declaration, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const captured: Blob[] = [];
  const download = runInNewContext(`${js}\n${name}`, {
    ...csvDownloads, Blob, Uint8Array,
    URL: { createObjectURL: (blob: Blob) => { captured.push(blob); return "blob:synthetic"; }, revokeObjectURL() {} },
    document: { createElement: () => ({ click() {} }) },
    window: { setTimeout() {} }, setTimeout() {},
  });
  return { download, captured };
}

test("SDK trajectory CSV downloads add one BOM without modifying ZIP members", async () => {
  const bundle = await executeLongitudinalAnalysisV2(await validOpenEnaLongitudinalRequestV3(20, 200));
  const exported = await createExportBundle(bundle, { displaySpec: openEnaTrajectoryDisplaySpecV3(bundle) });
  const { download, captured } = boundary("components/open-ena/OpenEnaLongitudinalWorkbenchV3.tsx", "downloadBlob");
  for (const file of exported.files) {
    const before = file.bytes.slice();
    download(file.path, file.bytes, file.mediaType);
    const saved = new Uint8Array(await captured.at(-1)!.arrayBuffer());
    if (csvDownloads.isCsvDownloadMediaType(file.mediaType)) {
      assert.deepEqual([...saved.slice(0, 3)], [0xef, 0xbb, 0xbf], file.path);
      assert.equal(captured.at(-1)!.type, csvDownloads.CSV_DOWNLOAD_MEDIA_TYPE);
      assert.deepEqual(saved.slice(3), before, file.path);
    } else assert.deepEqual(saved, before);
    assert.deepEqual(file.bytes, before, "the SDK's canonical bytes remain unchanged");
  }
  const zip = exported.bytes.slice();
  download(exported.fileName, exported.bytes, "application/zip");
  assert.deepEqual(new Uint8Array(await captured.at(-1)!.arrayBuffer()), zip);
});

test("native trajectory CSV downloads preserve Unicode bytes and avoid a duplicate signature", async () => {
  const { download, captured } = boundary("components/open-ena/model-v3/OpenEnaTrajectoryAnalysisPanelV3.tsx", "save");
  const text = "单元,群組\r\n学生甲,甲組\r\n";
  for (const contents of [text, `\ufeff${text}`]) {
    const input = new TextEncoder().encode(contents);
    const before = input.slice();
    download(input, "text/csv", "trajectory-inference.csv");
    const saved = new Uint8Array(await captured.at(-1)!.arrayBuffer());
    assert.deepEqual([...saved.slice(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.deepEqual(saved.slice(3), new TextEncoder().encode(text));
    assert.equal(captured.at(-1)!.type, csvDownloads.CSV_DOWNLOAD_MEDIA_TYPE);
    assert.deepEqual(input, before);
  }
  const zip = Uint8Array.of(0x50, 0x4b, 3, 4, 0xff);
  download(zip, "application/zip", "trajectory.zip");
  assert.deepEqual(new Uint8Array(await captured.at(-1)!.arrayBuffer()), zip);
});
