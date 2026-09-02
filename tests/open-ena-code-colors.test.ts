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

test("Codes rows open the product Color Presets dialog without invalidating the model", () => {
  const workspace = source("components/open-ena/OpenEnaWorkspace.tsx");

  assert.match(workspace, /const \[codeColors, setCodeColors\] = useState/);
  assert.match(workspace, /const \[codeColorCompanions, setCodeColorCompanions\] = useState<Record<string, string>>\(\{\}\)/);
  assert.match(workspace, /const \[activeCodeColor, setActiveCodeColor\] = useState<string \| null>\(null\)/);
  assert.match(
    workspace,
    /const openCodeColorPicker = \(header: string\) => \{\s*setActiveCodeColor\(\(current\) => current === null \? header : current\);\s*\};/,
  );
  assert.match(
    workspace,
    /useEffect\(\(\) => \{\s*if \(activeCodeColor === null \|\| config\.codes\.includes\(activeCodeColor\)\) return;\s*setActiveCodeColor\(null\);\s*\}, \[activeCodeColor, config\.codes\]\);/,
  );
  assert.match(workspace, /import OpenEnaCodeColorPicker from "\.\/OpenEnaCodeColorPicker"/);
  assert.match(workspace, /import \{ openEnaCodeColorPair \} from "@\/lib\/open-ena\/code-color-presets"/);
  assert.match(
    workspace,
    /className="ena-official-code-row"[\s\S]*?className="ena-code-color-control"[\s\S]*?type="button"[\s\S]*?aria-haspopup="dialog"[\s\S]*?aria-expanded=\{activeCodeColor === header\}[\s\S]*?data-ena-code-color-trigger=\{header\}[\s\S]*?data-ena-code-color-primary=\{codeColorFor\(codeColors, header\)\}[\s\S]*?disabled=\{loading \|\| sourceBusy\}[\s\S]*?openCodeColorPicker\(header\)[\s\S]*?className="ena-code-color-swatch"/,
  );
  assert.equal(
    (workspace.match(/data-ena-code-color-primary=\{codeColorFor\(codeColors, header\)\}/g) ?? []).length,
    1,
  );
  assert.doesNotMatch(workspace, /data-ena-code-color=\{/);
  assert.match(workspace, /aria-label=\{copy\.model\.codeColorPicker\.chooseColor\(header\)\}/);
  assert.match(workspace, /title=\{copy\.model\.codeColorPicker\.chooseColor\(header\)\}/);
  assert.equal((workspace.match(/<OpenEnaCodeColorPicker\b/g) ?? []).length, 1);
  assert.match(
    workspace,
    /<OpenEnaCodeColorPicker[\s\S]*?code=\{activeCodeColor\}[\s\S]*?value=\{openEnaCodeColorPair\(codeColorFor\(codeColors, activeCodeColor\), codeColorCompanions\[activeCodeColor\]\)\}[\s\S]*?copy=\{copy\.model\.codeColorPicker\}[\s\S]*?onCancel=\{\(\) => setActiveCodeColor\(null\)\}[\s\S]*?onConfirm=\{\(pair\) => \{\s*const confirmedCode = activeCodeColor;\s*if \(!config\.codes\.includes\(confirmedCode\)\) \{\s*setActiveCodeColor\(null\);\s*return;\s*\}\s*setCodeColors\(\(current\) => updateCodeColor\(current, confirmedCode, pair\.primary\)\);\s*setCodeColorCompanions\(\(current\) => \(\{ \.\.\.current, \[confirmedCode\]: pair\.complementary \}\)\);[\s\S]*?setActiveCodeColor\(null\)[\s\S]*?\}\}/,
  );
  const picker = workspace.match(/<OpenEnaCodeColorPicker[\s\S]*?\n\s*\/>/)?.[0] ?? "";
  assert.doesNotMatch(picker, /updateConfig/, "confirming a color remains presentation-only");
  assert.equal(
    (workspace.match(/setCodeColors\(\{\}\);\s*setCodeColorCompanions\(\{\}\);\s*setActiveCodeColor\(null\);/g) ?? []).length,
    3,
  );
  assert.ok((workspace.match(/setActiveCodeColor\(null\)/g) ?? []).length >= 4);
  assert.match(workspace, /activeCodeColor !== null \? \(\s*<OpenEnaCodeColorPicker/);
  assert.doesNotMatch(workspace, /type="color"/);
  assert.doesNotMatch(workspace, /(?:codeColorCompanions|complementaryColors)=\{/);
  assert.doesNotMatch(
    workspace,
    /buildAnalysisBundle\([\s\S]{0,1200}codeColorCompanions/,
    "companion colors must not enter the scientific or export bundle",
  );
  assert.doesNotMatch(
    workspace,
    /(?:buildAnalysisBundle|downloadJson|rowsToCsv)[\s\S]{0,1200}codeColorCompanions/,
    "companion colors must stay outside every analysis and export path",
  );
});

test("the selected code-color map is passed to every Open ENA network renderer and model bundle", () => {
  const workspace = source("components/open-ena/OpenEnaWorkspace.tsx");
  const workspaceSource = parseTsx(workspace);

  for (const [component, expectedCount] of Object.entries({
    OpenEnaLongitudinalTrajectory: 1,
    OpenEnaGroupContrast: 1,
    OpenEnaPlot: 1,
    MiniNetwork: 1,
    OpenEna3DOrderedResultLayout: 1,
    OpenEnaOrderedResultLayout: 1,
    OpenEna3DGroupContrast: 1,
    OpenEnaInteractive3DPlot: 1,
  })) {
    assertEveryRendererUsesCodeColors(workspaceSource, component, expectedCount);
  }

  assert.throws(
    () => assertEveryRendererUsesCodeColors(
      parseTsx("const Probe = () => <><OpenEna3DOrderedResultLayout /><OpenEnaOrderedResultLayout codeColors={codeColors} /></>;"),
      "OpenEna3DOrderedResultLayout",
      1,
    ),
    /must receive its own direct codeColors/u,
    "a sibling renderer's palette prop must not satisfy this renderer's assertion",
  );

  const analysisBundleCalls = buildAnalysisBundleCalls(workspaceSource);
  assert.equal(analysisBundleCalls.length, 2);
  analysisBundleCalls.forEach((call, index) => {
    assert.equal(call.arguments.length, 5, `analysis bundle ${index + 1} should include its options object`);
    const options = call.arguments[4];
    assert.ok(ts.isObjectLiteralExpression(options), `analysis bundle ${index + 1} options must be an object literal`);
    if (!ts.isObjectLiteralExpression(options)) return;
    assert.ok(hasCodeColorsOption(options), `analysis bundle ${index + 1} must retain codeColors`);
  });
});
