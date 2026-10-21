import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createExportBundle, executeLongitudinalAnalysisV2 } from "j-3dena";
import { createOpenEnaTextDownloadBlob } from "../lib/open-ena/download";
import { openEnaTrajectoryDisplaySpecV3 } from "../lib/open-ena/longitudinal-v3";
import { validOpenEnaLongitudinalRequestV3 } from "./helpers/open-ena-longitudinal-v3-fixture";

// Run the component's actual browser-download boundary with the SDK's actual
// exported bytes. Internal CSV/JSON members and the original ZIP remain exact.
const source = readFileSync(new URL("../components/open-ena/OpenEnaLongitudinalWorkbenchV3.tsx", import.meta.url), "utf8");
const syntax = ts.createSourceFile("workbench.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let boundarySource = "";
ts.forEachChild(syntax, node => {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "downloadBlob") boundarySource = node.getText(syntax);
});
assert.ok(boundarySource);
const executable = ts.transpileModule(boundarySource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

test("SDK trajectory CSV byte exports get a UTF-8 BOM only at download", async () => {
  const bundle = await executeLongitudinalAnalysisV2(await validOpenEnaLongitudinalRequestV3(20, 200));
  const exported = await createExportBundle(bundle, { displaySpec: openEnaTrajectoryDisplaySpecV3(bundle) });
  const captured: Blob[] = [];
  const download = runInNewContext(`${executable}\ndownloadBlob`, {
    Blob, Uint8Array, TextDecoder, createOpenEnaTextDownloadBlob,
    URL: { createObjectURL: (blob: Blob) => { captured.push(blob); return "blob:synthetic-download"; }, revokeObjectURL: () => {} },
    document: { createElement: () => ({ click: () => {} }) },
    window: { setTimeout: () => {} },
  }) as (name: string, bytes: Uint8Array, type: string) => void;
  for (const file of exported.files) {
    const before = file.bytes.slice();
    download(file.path, file.bytes, file.mediaType);
    const saved = new Uint8Array(await captured.at(-1)!.arrayBuffer());
    if (file.mediaType === "text/csv") {
      assert.deepEqual([...saved.slice(0, 3)], [0xef, 0xbb, 0xbf], file.path);
      assert.equal(captured.at(-1)!.type, "text/csv;charset=utf-8");
      assert.deepEqual(saved.slice(3), before, file.path);
    } else assert.deepEqual(saved, before, file.path);
    assert.deepEqual(file.bytes, before, "hash-bound SDK members are unchanged");
  }
  const zipBefore = exported.bytes.slice();
  download(exported.fileName, exported.bytes, "application/zip");
  assert.deepEqual(new Uint8Array(await captured.at(-1)!.arrayBuffer()), zipBefore);
});
