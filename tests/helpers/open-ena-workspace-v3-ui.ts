import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import OpenEnaWorkspace from "../../components/open-ena/OpenEnaWorkspace";
import type { Locale } from "../../lib/i18n";
export const workspaceV3Source = readFileSync("components/open-ena/OpenEnaWorkspace.tsx", "utf8");
export const controllerV3Source = readFileSync("components/open-ena/model-v3/workspace-controller.ts", "utf8");
export function renderWorkspaceShellV3(locale: Locale = "en") {
  return renderToStaticMarkup(createElement(OpenEnaWorkspace, { locale }));
}
export function moduleSourceV3(path: string) { return readFileSync(path, "utf8"); }

export function functionSourceV3(source: string, name: string) {
  const file = ts.createSourceFile("component.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found = "";
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node.getText(file);
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!found) throw new Error(`Missing function ${name}`);
  return found;
}
