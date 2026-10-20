import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../components/plugin-lab/PluginOperatorInbox.tsx", import.meta.url), "utf8");
const syntax = ts.createSourceFile("PluginOperatorInbox.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ["beginOperation", "finishOperation", "transition", "rotate", "requestPublicConsent", "confirmManualEmail", "previewRetention"];
const functions: string[] = [];
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name && names.includes(node.name.text)) functions.push(node.getText(syntax));
  ts.forEachChild(node, visit);
}
visit(syntax);
const script = ts.transpileModule(`${functions.join("\n")}\nglobalThis.handlers = { transition, rotate, requestPublicConsent, confirmManualEmail, previewRetention };`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

test("an old cross-proposal rotation response cannot replace the valid access code shown to the operator", async () => {
  const pending: { proposalId: string; finish: () => void }[] = [];
  const activeCodes = new Map<string, string>();
  let busyId = "";
  let displayed: { proposalId: string; accessCode: string } | null = null;
  const context = {
    busyRef: { current: false }, csrf: "synthetic-only", setError() {},
    setBusyId: (id: string) => { busyId = id; },
    setRotatedCode: (value: typeof displayed) => { displayed = value; },
    fetch: (url: string) => new Promise(resolve => {
      const proposalId = url.split("/").at(-2)!;
      const accessCode = `synthetic-code-${pending.length}`;
      activeCodes.set(proposalId, accessCode);
      pending.push({ proposalId, finish: () => resolve({ ok: true, json: async () => ({ accessCode }) }) });
    }),
    handlers: {} as Record<string, (...args: unknown[]) => Promise<void>>,
  };
  runInNewContext(script, context);
  const firstA = context.handlers.rotate({ proposalId: "A" });
  // Before the fix, B remained enabled while A was pending.
  const firstB = context.handlers.rotate({ proposalId: "B" });
  const oldB = pending.find(request => request.proposalId === "B");
  pending[0].finish(); await firstA;
  assert.equal(busyId, "");
  // A's finally used to erase B's busy state, allowing another B rotation.
  const secondB = context.handlers.rotate({ proposalId: "B" });
  pending.at(-1)!.finish(); await secondB;
  oldB?.finish(); await firstB;
  assert.ok(displayed);
  const code = displayed as { proposalId: string; accessCode: string };
  assert.equal(code.accessCode, activeCodes.get(code.proposalId), "the displayed one-time code must be the currently valid one");
});

for (const followup of ["rotate", "transition", "requestPublicConsent", "confirmManualEmail", "previewRetention"]) {
  test(`operator serializes ${followup} while a replacement access code is pending`, async () => {
    const requests: string[] = [];
    let resolve!: (value: unknown) => void;
    let busyId = "";
    let rotatedCode: unknown = null;
    const response = new Promise(resolvePromise => { resolve = resolvePromise; });
    const context = {
      busyRef: { current: false },
      csrf: "synthetic-only",
      setBusyId: (value: string) => { busyId = value; },
      setError: () => {},
      setRotatedCode: (value: unknown) => { rotatedCode = value; },
      setRetentionPreview: () => {},
      router: { refresh() {} },
      fetch: (url: string) => { requests.push(url); return response; },
      handlers: {} as Record<string, (...args: unknown[]) => Promise<void>>,
    };
    runInNewContext(script, context);
    const first = context.handlers.rotate({ proposalId: "A", state: "received" });
    const second = context.handlers[followup]({ proposalId: "B", state: "received" }, { get: () => "synthetic" });
    assert.equal(requests.length, 1, "a second proposal must not clear or overtake the first operation's busy state / one-time code");
    assert.equal(busyId, "A");
    resolve({ ok: true, json: async () => ({ accessCode: "synthetic-replacement", candidates: [] }) });
    await Promise.all([first, second]);
    assert.equal(busyId, "");
    assert.deepEqual(JSON.parse(JSON.stringify(rotatedCode)), { proposalId: "A", accessCode: "synthetic-replacement" });
    await context.handlers[followup]({ proposalId: "B", state: "received" }, { get: () => "synthetic" });
    assert.equal(requests.length, 2, "the lock must release after completion");
  });
}

test("failed operator requests release the operation lock for an explicit retry", async () => {
  let attempts = 0;
  const context = {
    busyRef: { current: false }, csrf: "synthetic-only", setBusyId() {}, setError() {}, setRotatedCode() {},
    router: { refresh() {} }, fetch: async () => { attempts++; throw new Error("Synthetic offline failure"); },
    handlers: {} as Record<string, (...args: unknown[]) => Promise<void>>,
  };
  runInNewContext(script, context);
  await context.handlers.rotate({ proposalId: "A" });
  await context.handlers.rotate({ proposalId: "A" });
  assert.equal(attempts, 2);
});
