import { workspaceV3Source as v3, controllerV3Source as owner, renderWorkspaceShellV3 as shell, moduleSourceV3 as moduleV3, functionSourceV3 } from "./helpers/open-ena-workspace-v3-ui";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import * as ts from "typescript";

const projectRoot = process.cwd();

function source(path: string) {
  return readFileSync(join(projectRoot, path), "utf8");
}

type OpenEnaJsxOpeningElement = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

function parseTsx(sourceText: string) {
  return ts.createSourceFile("OpenEnaWorkspace.tsx", sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function jsxOpenings(sourceFile: ts.SourceFile, tagName: string) {
  const openings: Array<{ node: OpenEnaJsxOpeningElement; fragment: string }> = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
      && node.tagName.getText(sourceFile) === tagName
    ) {
      openings.push({ node, fragment: node.getText(sourceFile) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return openings;
}

function hasDirectCodeColorsAttribute(opening: OpenEnaJsxOpeningElement) {
  return opening.attributes.properties.some((property) => (
    ts.isJsxAttribute(property)
    && ts.isIdentifier(property.name)
    && property.name.text === "codeColors"
    && property.initializer !== undefined
    && ts.isJsxExpression(property.initializer)
    && property.initializer.expression !== undefined
    && ts.isIdentifier(property.initializer.expression)
    && property.initializer.expression.text === "codeColors"
  ));
}

function assertEveryRendererUsesCodeColors(sourceFile: ts.SourceFile, tagName: string, expectedCount: number) {
  const openings = jsxOpenings(sourceFile, tagName);
  assert.equal(openings.length, expectedCount, `${tagName} should render ${expectedCount} time(s)`);
  openings.forEach(({ node, fragment }, index) => {
    assert.ok(
      hasDirectCodeColorsAttribute(node),
      `${tagName} invocation ${index + 1} must receive its own direct codeColors={codeColors} attribute; found ${fragment}`,
    );
  });
}

function buildAnalysisBundleCalls(sourceFile: ts.SourceFile) {
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === "buildAnalysisBundle"
    ) {
      calls.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return calls;
}

function hasCodeColorsOption(options: ts.ObjectLiteralExpression) {
  return options.properties.some((property) => (
    (ts.isShorthandPropertyAssignment(property) && property.name.text === "codeColors")
    || (
      ts.isPropertyAssignment(property)
      && property.name.getText() === "codeColors"
      && ts.isIdentifier(property.initializer)
      && property.initializer.text === "codeColors"
    )
  ));
}

test("code colors default to black and accept only six-digit hexadecimal palette values", async () => {
  const plotStyle = await import("../lib/open-ena/plot-style") as typeof import("../lib/open-ena/plot-style") & {
    DEFAULT_CODE_COLOR?: string;
    codeColorFor?: (colors: Readonly<Record<string, string>>, code: string) => string;
    updateCodeColor?: (
      colors: Readonly<Record<string, string>>,
      code: string,
      color: string,
    ) => Record<string, string>;
  };

  assert.equal(plotStyle.DEFAULT_CODE_COLOR, "#000000");
  assert.equal(typeof plotStyle.codeColorFor, "function");
  assert.equal(typeof plotStyle.updateCodeColor, "function");
  if (!plotStyle.codeColorFor || !plotStyle.updateCodeColor) return;

  assert.equal(plotStyle.codeColorFor({}, "goal"), "#000000");
  assert.deepEqual(plotStyle.updateCodeColor({}, "goal", "#12AB34"), { goal: "#12ab34" });
  assert.equal(plotStyle.codeColorFor({ goal: "not-a-color" }, "goal"), "#000000");
});

test("Code color confirmation is bound to the active editor family without a scientific edit", () => {

  assert.match(v3, /OpenEnaCodeColorPicker/);
  assert.match(v3, /modelState.display\[family\].codeColors/);
  assert.match(owner, /case "confirm-code-color"[\s\S]*?sameScientificContextV3/);
  assert.match(owner, /set-code-color/);
  assert.match(v3, /activeColorIntent.context/);

});

test("every native network renderer receives explicit SOURCE-to-public Code presentation mapping", () => {

  assert.match(v3, /codeSourceByRenderedCode: renderedSource/);
  assert.match(v3, /codeLabelByRenderedCode: presentation\?\.codeLabelByRenderedCode/);
  for (const name of ["OpenEnaPlot", "OpenEnaInteractive3DPlot", "OpenEnaGroupContrast", "OpenEna3DGroupContrast", "OpenEnaOrderedResultLayout", "OpenEna3DOrderedResultLayout"]) assert.ok(v3.includes(`<${name} {...plotProps}`), name);
  assert.doesNotMatch(v3, /buildAnalysisBundle\(/);

});
