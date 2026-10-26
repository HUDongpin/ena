import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync("scripts/verify-open-ena-ai-live-matrix.ts", "utf8");
const tree = ts.createSourceFile("matrix.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const declaration = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "captureBounded");
assert.ok(declaration);
const js = ts.transpileModule(declaration.getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const capture = runInNewContext(`${js}\ncaptureBounded`, { Uint8Array, OPEN_ENA_AI_MAX_RESPONSE_BYTES: 65_536, setTimeout, clearTimeout }) as (response: Response, timeoutMs: number) => Promise<Uint8Array | null>;

test("matrix response capture stops independently when a rejected HTTP body never ends", async () => {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  const response = new Response(new ReadableStream<Uint8Array>({
    start(value) { controller = value; },
    cancel() { cancelled = true; return new Promise(() => {}); },
  }), { status: 503 });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const outcome = await Promise.race([
      capture(response, 20),
      new Promise(resolve => { timer = setTimeout(() => resolve("unbounded"), 150); }),
    ]);
    assert.equal(outcome, null);
    assert.equal(cancelled, true);
  } finally {
    clearTimeout(timer);
    try { controller!.close(); } catch { /* A bounded capture already cancelled. */ }
  }
});

test("matrix capture preserves exact bounded bytes and rejects oversized input", async () => {
  const bytes = new TextEncoder().encode('{"synthetic":"中文"}');
  assert.deepEqual(await capture(new Response(bytes), 100), bytes);
  assert.equal(await capture(new Response(new Uint8Array(65_537)), 100), null);
});
