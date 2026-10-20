import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { parseCsv } from "../lib/open-ena/csv";
import { codedDataFileKind, parseXlsx } from "../lib/open-ena/spreadsheet";
import { formatOpenEnaWorkspaceFailureV3, getOpenEnaCopy } from "../lib/open-ena-i18n";

// Execute the actual asynchronous Workspace methods. This keeps decoding and
// generation ownership testable without replacing them with a helper mirror.
const source = readFileSync(new URL("../components/open-ena/OpenEnaWorkspace.tsx", import.meta.url), "utf8");
const syntax = ts.createSourceFile("OpenEnaWorkspace.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map<string, string>();
function visit(node: ts.Node) {
  if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name
      && ["openCodedData", "cancelSourcePreparation", "OpenEnaKnownWorkspaceFailureV3", "readWorkspaceUtf8File"].includes(node.name.text)) {
    declarations.set(node.name.text, node.getText(syntax));
  }
  ts.forEachChild(node, visit);
}
visit(syntax);
assert.equal(declarations.size, 4);
const executable = ts.transpileModule([...declarations.values()].join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
type Preview = { text: string; dataset: ReturnType<typeof parseCsv>; types: Record<string, string> };
function harness() {
  const generation = { current: 0 };
  const previews: Array<Preview | null> = [];
  const busy: boolean[] = [];
  const dispatches: unknown[] = [];
  const api = runInNewContext(`${executable}\n({read: openCodedData, cancel: cancelSourcePreparation})`, {
    TextDecoder, Object, Error, parseCsv, codedDataFileKind, parseXlsx,
    sourceGeneration: generation,
    dispatch: (action: unknown) => dispatches.push(action),
    setSourceBusy: (value: boolean) => busy.push(value),
    setSourcePreview: (value: Preview | null) => previews.push(value),
    installSource: () => { throw new Error("CSV must not install a scientific source before typing"); },
    setDerivative: () => {}, setOriginalSource: () => {}, setTeachingSampleKind: () => {},
  }) as { read(file: File): Promise<void>; cancel(returnFocus: boolean): void };
  return { ...api, generation, previews, busy, dispatches };
}

const badEncodings: Array<[string, number[]]> = [
  ["lone continuation", [0x80]], ["upper continuation", [0xbf]],
  ["overlong two-byte", [0xc0, 0xaf]], ["truncated two-byte", [0xc2]],
  ["bad continuation", [0xc2, 0x20]], ["truncated three-byte", [0xe2, 0x82]],
  ["overlong three-byte", [0xe0, 0x80, 0xaf]], ["UTF-16 surrogate", [0xed, 0xa0, 0x80]],
  ["truncated four-byte", [0xf0, 0x9f, 0x92]], ["overlong four-byte", [0xf0, 0x80, 0x80, 0xaf]],
  ["above Unicode maximum", [0xf4, 0x90, 0x80, 0x80]], ["invalid leading byte", [0xf5, 0x80, 0x80, 0x80]],
  ["distinct Latin-1 identifiers", [0xe9, 0x2c, 0x31, 0x0a, 0xe8]],
];
for (const [name, bytes] of badEncodings) {
  test(`CSV rejects ${name} before publishing a lossy source preview`, async () => {
    const file = new File(["unit,A\n", Uint8Array.from(bytes), ",1"], "invalid.csv");
    const h = harness();
    await assert.rejects(h.read(file), (error: { failure?: { id?: string } }) => error.failure?.id === "coded-data-invalid-utf8");
    assert.equal(h.previews.length, 0);
    assert.deepEqual(h.busy, [true, false]);
  });
}

const validSources = [
  "unit,A\nascii,1", "unit,A\ncafé,1\ncafè,2\n中文👩‍🔬,3",
  "\ufeffunit,A\nBOM,1", "\ufeff\ufeffunit,A\nsecond-BOM,1",
  'unit,A\r\n"quoted\r\nline",1', "unit,A\nliteral-�,1",
];
for (const [index, text] of validSources.entries()) {
  test(`valid UTF-8 preview keeps existing text and BOM semantics: ${index}`, async () => {
    const file = new File([new TextEncoder().encode(text)], "valid.csv");
    const h = harness(); await h.read(file);
    const baselineText = await file.text();
    assert.equal(h.previews.length, 1);
    assert.equal(h.previews[0]!.text, baselineText);
    assert.deepEqual(h.previews[0]!.dataset, parseCsv(baselineText, { name: file.name, sizeBytes: file.size, source: "upload" }));
    assert.deepEqual(h.busy, [true, false]);
    // Literal U+FFFD is valid Unicode at the decoder/preview boundary. The
    // existing typed-XLSX writer rejects its roundtrip separately; no new typed
    // export support for U+FFFD is asserted by this test.
  });
}

function deferredFile(outcome: "valid" | "malformed" | "read-error") {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const native = new File(["unit,A\n", outcome === "malformed" ? Uint8Array.of(0xe9) : "old", ",1"], "held.csv");
  const failure = new Error("Synthetic read failure");
  const file = {
    name: native.name, size: native.size,
    text: async () => { await held; if (outcome === "read-error") throw failure; return native.text(); },
    arrayBuffer: async () => { await held; if (outcome === "read-error") throw failure; return native.arrayBuffer(); },
  } as File;
  return { file, release, failure };
}
for (const ownership of ["superseded", "cancelled"] as const) {
  for (const outcome of ["valid", "malformed", "read-error"] as const) {
    test(`${ownership} CSV ${outcome} work cannot publish preview or error`, async () => {
      const h = harness(); const deferred = deferredFile(outcome);
      const old = h.read(deferred.file);
      if (ownership === "superseded") await h.read(new File(["unit,A\ncurrent,1"], "current.csv"));
      else h.cancel(false);
      const previewsBefore = [...h.previews]; const busyBefore = [...h.busy];
      deferred.release(); await assert.doesNotReject(old);
      assert.deepEqual(h.previews, previewsBefore);
      assert.deepEqual(h.busy, busyBefore);
      if (ownership === "superseded") assert.equal(h.previews[0]!.dataset.rows[0]!.unit, "current");
      else assert.deepEqual(h.previews, [null]);
    });
  }
}
test("current CSV read failure is retained as a read failure", async () => {
  const h = harness(); const deferred = deferredFile("read-error");
  const pending = h.read(deferred.file); deferred.release();
  await assert.rejects(pending, error => error === deferred.failure);
  assert.equal(h.previews.length, 0); assert.deepEqual(h.busy, [true, false]);
});

test("CSV UTF-8 admission failure has actionable copy in all three locales", () => {
  for (const locale of ["en", "zh-hant", "zh-hans"] as const) {
    const message = formatOpenEnaWorkspaceFailureV3(getOpenEnaCopy(locale).modelV3.workspace, { id: "coded-data-invalid-utf8" });
    assert.match(message, /UTF-8/u);
    assert.ok(locale === "en" ? /Save.*again/u.test(message) : /另存.*重新/u.test(message));
  }
});
