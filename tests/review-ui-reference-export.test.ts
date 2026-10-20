import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Execute the real JSX handler against a deferred export. This keeps the
// asynchronous UI contract covered even when Chromium is unavailable.
const source = readFileSync(new URL("../components/open-ena/OpenEnaWorkspace.tsx", import.meta.url), "utf8");
const syntax = ts.createSourceFile("OpenEnaWorkspace.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handlerSource = "";
function visit(node: ts.Node) {
  if (ts.isJsxElement(node) && node.children.some(child => ts.isJsxExpression(child)
    && child.expression?.getText(syntax) === "result?.binding.referenceId ? workspaceCopy.artifacts.reexportReference : workspaceCopy.artifacts.exportReference")) {
    const attribute = node.openingElement.attributes.properties.find(property => ts.isJsxAttribute(property) && property.name.getText(syntax) === "onClick");
    if (attribute && ts.isJsxAttribute(attribute) && attribute.initializer && ts.isJsxExpression(attribute.initializer)) {
      handlerSource = attribute.initializer.expression!.getText(syntax);
    }
  }
  ts.forEachChild(node, visit);
}
visit(syntax);
assert.ok(handlerSource, "Locate the actual Reference export click handler");

for (const scenario of ["unchanged", "display-only", "scientific-edit", "edit-and-undo", "new-result", "new-plan", "unmount", "disallowed-family"] as const) {
  test(`Reference export rechecks current authority after hashing: ${scenario}`, async () => {
    const result = { binding: { scientificResultSha256: "synthetic-result" } };
    const currentPlan = { header: { executionPlanSha256: "synthetic-plan" } };
    const mounted = { current: true };
    const latest = { current: { current: true, currentPlan, state: { model: { result } } } };
    let resolve!: (descriptor: unknown) => void;
    const exportPromise = new Promise(resolvePromise => { resolve = resolvePromise; });
    const downloads: unknown[] = [];
    let exportCalls = 0;
    let completion: Promise<void> | undefined;
    const handler = runInNewContext(`(${handlerSource})`, {
      result, currentPlan, latest, mounted,
      referenceDisclosure: { disabled: scenario === "disallowed-family" },
      state: { sourceWitness: { synthetic: true } },
      dataset: { name: "synthetic.xlsx" },
      workspaceCopy: { artifacts: { referenceDisplayName: "Synthetic Reference" } },
      exportReferenceV2: () => { exportCalls += 1; return exportPromise; },
      saveDescriptor: (descriptor: unknown) => downloads.push(descriptor),
      attempt: (work: () => Promise<void>) => { completion = work(); return completion; },
    }) as () => void;
    handler();
    assert.ok(completion, "The real handler began an asynchronous export");
    if (scenario === "scientific-edit" || scenario === "edit-and-undo") latest.current.current = false;
    if (scenario === "new-result") latest.current.state.model.result = { binding: { scientificResultSha256: "new-result" } };
    if (scenario === "new-plan") latest.current.currentPlan = { header: { executionPlanSha256: "new-plan" } };
    if (scenario === "unmount") mounted.current = false;
    const descriptor = { filename: "synthetic-reference.json" };
    resolve(descriptor);
    await completion;
    assert.equal(exportCalls, scenario === "disallowed-family" ? 0 : 1);
    assert.equal(downloads.length, scenario === "unchanged" || scenario === "display-only" ? 1 : 0);
    if (downloads.length) assert.equal(downloads[0], descriptor);
  });
}
