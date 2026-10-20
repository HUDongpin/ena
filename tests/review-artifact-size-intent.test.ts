import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { importOpenEnaArtifactV3 } from "../lib/open-ena/model-artifact-imports-v3";
import { SAMPLE_CONFIG } from "../lib/open-ena/types";

// Execute the actual file callback and hook's preview callback together; the
// mounted browser proof separately covers React state and visible errors.
const workspace = ts.createSourceFile("workspace.tsx", readFileSync(new URL("../components/open-ena/OpenEnaWorkspace.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const hook = ts.createSourceFile("hook.ts", readFileSync(new URL("../components/open-ena/model-v3/workspace-controller.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const declarations: string[] = [];
let onFile = "", preview = "";
function visitWorkspace(node: ts.Node) {
  if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name && ["readWorkspaceUtf8File", "OpenEnaKnownWorkspaceFailureV3"].includes(node.name.text)) declarations.push(node.getText(workspace));
  if (ts.isArrowFunction(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) && node.getText(workspace).includes('"artifact-too-large"') && node.getText(workspace).includes("controller.preview")) onFile = node.getText(workspace);
  ts.forEachChild(node, visitWorkspace);
}
function visitHook(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(hook) === "preview" && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(hook) === "useCallback") preview = node.initializer.arguments[0].getText(hook);
  ts.forEachChild(node, visitHook);
}
visitWorkspace(workspace); visitHook(hook); assert.ok(onFile && preview);
const executable = ts.transpileModule([...declarations, `const controller = {preview: ${preview}}; const onFile = ${onFile};`].join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
function harness() {
  const previews: unknown[] = [], importGeneration = { current: 0 };
  let pending = false;
  const context = { TextDecoder, Error, Object, Promise, file: undefined as File | undefined, importGeneration, importOpenEnaArtifactV3, setImportPending: (value: boolean) => { pending = value; }, dispatch: (action: { type: string; value?: unknown }) => { if (action.type === "preview") previews.push(action.value); } };
  const invoke = runInNewContext(`${executable}\nonFile`, context) as () => Promise<void>;
  return { previews, get pending() { return pending; }, get generation() { return importGeneration.current; }, read(file: File) { context.file = file; return invoke(); } };
}
const valid = new TextEncoder().encode(JSON.stringify(SAMPLE_CONFIG)).buffer as ArrayBuffer;
function oversized() {
  let reads = 0;
  return { file: { size: 16 * 1024 * 1024 + 1, arrayBuffer: async () => { reads++; return valid; } } as File, get reads() { return reads; } };
}
for (const outcome of ["valid", "read-error", "invalid-json"] as const) test(`oversized new artifact owns intent over old ${outcome}`, async () => {
  const h = harness(); let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  const old = { size: valid.byteLength, arrayBuffer: async () => { await gate; if (outcome === "read-error") throw new Error("old synthetic read failure"); return outcome === "invalid-json" ? new TextEncoder().encode("{").buffer : valid; } } as File;
  const prior = h.read(old).then(() => ({ ok: true }), (error: unknown) => ({ ok: false, error }));
  const newer = oversized(); await assert.rejects(h.read(newer.file), (e: { failure?: { id?: string } }) => e.failure?.id === "artifact-too-large");
  release(); const completion = await prior;
  assert.equal(completion.ok, true, "obsolete reads or parses cannot publish their error");
  assert.deepEqual(h.previews, [], "obsolete successful artifact cannot publish its preview");
  assert.equal(newer.reads, 0); assert.equal(h.pending, false);
});
test("an oversized artifact rejects without reading and keeps an existing preview", async () => {
  const h = harness(); await h.read(new File([valid], "valid.json")); const before = h.previews[0];
  const newer = oversized(); await assert.rejects(h.read(newer.file), (e: { failure?: { id?: string } }) => e.failure?.id === "artifact-too-large");
  assert.equal(newer.reads, 0); assert.equal(h.previews.length, 1); assert.equal(h.previews[0], before);
});
test("the exact inclusive limit still reads the artifact once", async () => {
  const h = harness(); let reads = 0; await h.read({ size: 16 * 1024 * 1024, arrayBuffer: async () => { reads++; return valid; } } as File);
  assert.equal(reads, 1); assert.equal(h.previews.length, 1);
});
test("current read failure preserves its original error", async () => {
  const h = harness(), failure = new Error("current synthetic read failure");
  await assert.rejects(h.read({ size: 1, arrayBuffer: async () => { throw failure; } } as unknown as File), (e) => e === failure);
  assert.deepEqual(h.previews, []);
});
