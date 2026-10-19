import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../components/open-ena/OpenEnaGroupContrast.tsx", import.meta.url), "utf8");
const syntax = ts.createSourceFile("OpenEnaGroupContrast.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const copyFunction = syntax.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "copyPlotImage");
assert.ok(copyFunction);
const script = ts.transpileModule(`${copyFunction.getText(syntax)}\nglobalThis.copy = copyPlotImage;`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

let clickHandlerSource = "";
function findHandler(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(syntax) === "handleCopy") clickHandlerSource = node.initializer!.getText(syntax);
  ts.forEachChild(node, findHandler);
}
findHandler(syntax);
const clickScript = ts.transpileModule(`globalThis.handle = ${clickHandlerSource};`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

test("the actual copy click handler requires consent, acquires one Workspace lease and retires it on unmount", async () => {
  for (const permission of ["absent", "denied", "standalone", "workspace-denied", "workspace"]) {
    let confirmations = 0;
    let copies = 0;
    let captured: (() => boolean) | null = null;
    let scientificCurrent = true;
    const props = permission === "absent" ? {} : {
      onConfirmIdentityBearingExport: () => { confirmations++; return permission !== "denied"; },
      ...(permission.startsWith("workspace") ? { captureImageExport: () => { confirmations++; return permission === "workspace" ? () => scientificCurrent : null; } } : {}),
    };
    const context = {
      props, copyMountedRef: { current: true }, setCopyStatus() {},
      copyPlotImage: async (_button: unknown, lease: () => boolean) => { copies++; captured = lease; return "image"; },
      handle: null as unknown as (button: unknown, kind: string) => void,
    };
    runInNewContext(clickScript, context);
    context.handle({}, "comparison");
    await Promise.resolve();
    assert.equal(confirmations, permission === "absent" ? 0 : 1, "no double confirmation on the Workspace lease path");
    assert.equal(copies, permission === "standalone" || permission === "workspace" ? 1 : 0);
    if (captured) {
      const lease = captured as () => boolean;
      assert.equal(lease(), true);
      context.copyMountedRef.current = false;
      assert.equal(lease(), false, "unmount retires the captured copy");
      context.copyMountedRef.current = true;
      scientificCurrent = false;
      if (permission === "workspace") assert.equal(lease(), false);
    }
  }
});

for (const stage of ["current", "before-start", "decode", "encode", "fallback-stale"] as const) {
  test(`2D identity-bearing copy observes its export lease: ${stage}`, async () => {
    let current = stage !== "before-start";
    let writes = 0;
    let revoked = 0;
    class Svg {
      viewBox = { baseVal: { width: 500, height: 400 } };
      cloneNode() { return { setAttribute() {}, insertBefore() {}, firstChild: null }; }
    }
    const button = { closest: () => ({ querySelector: () => new Svg() }) };
    const context = {
      Blob, Error,
      SVGSVGElement: Svg,
      XMLSerializer: class { serializeToString() { return "<svg>Synthetic Unit 1</svg>"; } },
      Image: class { async decode() { if (stage === "decode") current = false; } },
      document: {
        createElementNS: () => ({}),
        createElement: () => ({
          getContext: () => ({ scale() {}, drawImage() {} }),
          toBlob: (done: (blob: Blob) => void) => { if (stage === "encode" || stage === "fallback-stale") current = false; done(new Blob(["synthetic pixels"])); },
        }),
      },
      window: { devicePixelRatio: 1 },
      URL: { createObjectURL: () => "blob:synthetic", revokeObjectURL: () => { revoked++; } },
      ClipboardItem: stage === "fallback-stale" ? undefined : class {},
      navigator: { clipboard: { write: async () => { writes++; }, writeText: async () => { writes++; } } },
      copy: null as unknown as (button: unknown, isCurrent: () => boolean) => Promise<unknown>,
    };
    runInNewContext(script, context);
    await context.copy(button, () => current).catch(() => {});
    assert.equal(writes, stage === "current" ? 1 : 0, "expired identity-bearing pixels/text must never reach the clipboard");
    if (stage !== "before-start") assert.equal(revoked, 1, "temporary SVG URLs are released on every outcome");
  });
}
