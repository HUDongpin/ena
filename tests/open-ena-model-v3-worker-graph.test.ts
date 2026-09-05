import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import ts from "typescript";

function runtimeImports(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const paths: string[] = [];
  function add(value: ts.Expression | undefined) {
    if (!value || !ts.isStringLiteral(value) || !value.text.startsWith(".")) return;
    const path = resolve(dirname(file), value.text);
    const resolved = [path, `${path}.ts`, `${path}.tsx`, `${path}/index.ts`].find((candidate) => /\.tsx?$/u.test(candidate) && existsSync(candidate));
    if (resolved) paths.push(resolved);
  }
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const typeOnly = clause?.isTypeOnly || (clause && !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.every((entry) => entry.isTypeOnly));
      if (!typeOnly) add(node.moduleSpecifier);
    } else if (ts.isExportDeclaration(node)) {
      const typeOnly = node.isTypeOnly || (node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.every((entry) => entry.isTypeOnly));
      if (!typeOnly) add(node.moduleSpecifier);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) add(node.arguments[0]);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return paths;
}

test("production worker graph reaches only the pure Reference codec, never browser transport or source owner", () => {
  const reached = new Set<string>();
  function visit(file: string) {
    if (reached.has(file)) return;
    reached.add(file);
    runtimeImports(file).forEach(visit);
  }
  visit(resolve("lib/open-ena/jena.worker.ts"));
  assert.equal(reached.has(resolve("lib/open-ena/client.ts")), false, "worker must not recursively include its browser transport");
  assert.equal(reached.has(resolve("lib/open-ena/model-v3/reference-v2.ts")), false, "source minting owner must stay outside the worker graph");
  assert.equal(reached.has(resolve("lib/open-ena/model-v3/reference-codec-v2.ts")), true);
});
