import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync(
  new URL("../components/open-ena/OpenEnaOrderedResultLayout.tsx", import.meta.url),
  "utf8",
);

test("ONA result layout preserves the official four-region research surface without pairwise subtraction", () => {
  assert.match(layout, /className="open-ena-set-comparison open-ena-ordered-result-layout"/);
  const center = layout.indexOf('data-ena-workbench-region="center"');
  const right = layout.indexOf('data-ena-workbench-region="right-stack"');
  assert.ok(center >= 0 && right > center, "center must precede the persistent right stack");
  assert.match(layout, /data-testid="open-ena-ordered-center-surface"/);
  assert.match(layout, /data-testid="open-ena-ordered-right-tools"/);
  assert.doesNotMatch(layout, /buildPairwiseGroupContrast|signedDifference|Primary\s*minus\s*Secondary|primary\s*-\s*secondary/i);
});

test("Data View replaces only the ONA center while descriptive group plots and tools remain outside that branch", () => {
  assert.match(layout, /centerMode === "data"[\s\S]*?dataView/);
  const centerConditional = layout.match(/centerMode === "data"[\s\S]*?<\/div>\s*<div\s+className="ena-set-side-plots"/)?.[0] ?? "";
  assert.ok(centerConditional, "the center conditional must end before the right stack begins");
  assert.match(layout, /scope=\{\{ kind: "overall" \}\}/);
  assert.match(layout, /scope=\{\{ kind: "group", name: primaryGroup\.name \}\}/);
  assert.match(layout, /scope=\{\{ kind: "group", name: secondaryGroup\.name \}\}/);
  assert.match(layout, /\{rightTools\}/);
});

test("ONA headings are semantically ordered and never call the center a comparison plot", () => {
  assert.match(layout, /<h3>\{copy\.overallPlot\}<\/h3>/);
  assert.match(layout, /<h3>\{copy\.primaryPlot\}<\/h3>/);
  assert.match(layout, /<h3>\{copy\.secondaryPlot\}<\/h3>/);
  assert.match(layout, /<h3>\{copy\.dataView\}<\/h3>/);
  assert.doesNotMatch(layout, /<h3>Comparison Plot<\/h3>/);
});
