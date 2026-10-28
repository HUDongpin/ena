import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

test("3D figure keeps the responsive trajectory legend inside its fullscreen owner", () => {
  const source = readFileSync("components/open-ena/OpenEnaInteractive3DPlot.tsx", "utf8");
  const figureStart = source.indexOf("<figure"), figureEnd = source.indexOf("</figure>", figureStart);
  const figure = source.slice(figureStart, figureEnd);
  assert.match(figure, /ena-trajectory-figure-layout/);
  assert.match(figure, /ena-trajectory-canvas/);
  assert.match(figure, /<OpenEnaTrajectoryLegend\s+trajectory=\{result\.trajectoryPresentation\}\s+groups=\{result\.groups\}\s+locale=\{locale\}/);
});

test("3D PNG copy and fallback download compose a legend before returning the export artifact", () => {
  const source = readFileSync("components/open-ena/OpenEnaInteractive3DPlot.tsx", "utf8");
  const start = source.indexOf("function copyPlotImage()"), end = source.indexOf("function downloadPluginReceipt()", start);
  const copy = source.slice(start, end);
  assert.match(copy, /await appendTrajectoryLegendToPng\(dataUrl, result\.trajectoryPresentation, result\.groups, locale, showPoints\)/);
  assert.match(copy, /if \(!current\(\)\) return null;[\s\S]*return \{ dataUrl: exportedDataUrl, png: pngBlobFromDataUrl\(exportedDataUrl\) \}/);
  assert.ok(copy.indexOf("appendTrajectoryLegendToPng") > copy.indexOf(".toImage("));
  assert.ok(copy.indexOf("appendTrajectoryLegendToPng") < copy.indexOf("pngBlobFromDataUrl(exportedDataUrl)"));
});

test("3D legend layout is a child of its named container and fullscreen owner", () => {
  const source = readFileSync("components/open-ena/OpenEnaInteractive3DPlot.tsx", "utf8");
  const ast = ts.createSourceFile("plot.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let figure: ts.JsxElement | undefined;
  const visit = (node: ts.Node) => { if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === "figure") figure = node; else ts.forEachChild(node, visit); };
  visit(ast); assert.ok(figure);
  const classText = (element: ts.JsxElement) => element.openingElement.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === "className")?.getText(ast) ?? "";
  assert.ok(!classText(figure).includes("ena-trajectory-figure-layout"), "a container query must style a descendant, never its own container");
  const layout = figure.children.find((child): child is ts.JsxElement => ts.isJsxElement(child) && classText(child).includes("ena-trajectory-figure-layout"));
  assert.ok(layout, "canvas and legend need one shared inner layout wrapper");
  assert.ok(layout.children.some(child => ts.isJsxElement(child) && classText(child).includes("ena-trajectory-canvas")));
  assert.match(layout.getText(ast), /<OpenEnaTrajectoryLegend\s/u);
  assert.ok(!layout.getText(ast).includes("open-ena-trajectory-label-summary"), "deferred-label details belong outside the two-column layout");
});
