import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();
const contrast = readFileSync(join(projectRoot, "components", "open-ena", "OpenEnaGroupContrast.tsx"), "utf8");
const css = readFileSync(join(projectRoot, "app", "globals.css"), "utf8");
const plotStyle = readFileSync(join(projectRoot, "lib", "open-ena", "plot-style.ts"), "utf8");

test("the central Comparison Plot renders one signed Primary-minus-Secondary network", () => {
  assert.match(contrast, /type PlotKind = "comparison" \| "primary" \| "secondary"/);
  assert.match(contrast, /kind\s*===\s*"comparison"[\s\S]*?edge\.signedDifference/);
  assert.match(contrast, /differenceSign\(edge\)/);
  assert.match(contrast, /kind="comparison"/);
  assert.match(contrast, /data-ena-edge-scale-kind=\{signedComparison \? "signed-difference" : "shared-group-mean"\}/);
  assert.match(contrast, /signedComparison \? comparisonScale : groupMeanScale/);
  assert.match(contrast, /Difference scale/);
});

test("signed Primary-minus-Secondary evidence remains available outside the overlaid renderer", () => {
  assert.match(contrast, /edge\.signedDifference/);
  assert.match(contrast, /Strongest signed edge differences/);
  assert.match(contrast, /Primary minus Secondary/);
  assert.match(contrast, /data-ena-difference-edge-scale-max/);
});

test("official-style group contrast plots are plain and keep scientific network edges solid", () => {
  assert.match(plotStyle, /"#3366cc"[\s\S]*?"#dc3912"/);
  assert.doesNotMatch(contrast, /<pattern\b|fill=\{`url\(#/);
  assert.match(contrast, /data-ena-uncertainty-guide="marginal-student-t-95"/);
  assert.match(contrast, /strokeDasharray=\{dash\}/);
  assert.doesNotMatch(contrast, /strokeDasharray[\s\S]{0,420}data-ena-edge=\{edge\.name\}/);
  assert.equal((contrast.match(/strokeWidth=\{magnitude \* 7\.5 \* scaleFactor\}/g) ?? []).length, 2);
  assert.match(contrast, /const codeNodeSize = \(code: string\) => bounded\([\s\S]*?magnitude \* 5 \* scaleFactor[\s\S]*?1,[\s\S]*?20,/);
  assert.match(contrast, /<circle[\s\S]*?r=\{nodeSize\}[\s\S]*?className="ena-set-result-node"[\s\S]*?data-ena-code-node="neutral"/);
  assert.match(css, /\.ena-set-zero-axes line\s*\{[\s\S]*?stroke-width:\s*1;(?:(?!stroke-dasharray)[\s\S])*?\}/);
  assert.match(css, /\.open-ena-group-contrast \.ena-set-result-node\s*\{[\s\S]*?stroke-width:\s*0;/);
  assert.match(css, /\.open-ena-group-contrast \.ena-set-result-label\s*\{[\s\S]*?font-size:\s*calc\(10px \* var\(--ena-plot-text-scale, 1\)\);/);
});

test("official-style plot headings and renderer slots keep the workbench roles explicit", () => {
  assert.match(contrast, /<h3>Comparison Plot<\/h3>/);
  assert.match(contrast, /<h3>Primary Plot<\/h3>/);
  assert.match(contrast, /<h3>Secondary Plot<\/h3>/);
  assert.doesNotMatch(contrast, /<h3>(?:COMPARISON|PRIMARY|SECONDARY) PLOT<\/h3>/);
  assert.match(contrast, /centerMode\?:\s*"plot"\s*\|\s*"data"/);
  assert.match(contrast, /dataView\?:\s*ReactNode/);
  assert.match(contrast, /rightTools\?:\s*ReactNode/);
  assert.doesNotMatch(contrast, /revealedPointGroup|onRevealGroupPoints|nextRevealedPointGroup/);
  assert.match(contrast, /data-ena-point-shape="circle"/);
  assert.match(contrast, /data-ena-point-shape="square"/);
  assert.doesNotMatch(contrast, /activateMeanMarker/);
  assert.match(contrast, /data-testid="open-ena-group-center-surface"/);
  assert.match(contrast, /data-testid="open-ena-group-right-tools"/);
  assert.match(css, /\.ena-set-plot-heading\s*\{[\s\S]*?position:\s*relative;[\s\S]*?z-index:\s*3;/);
  assert.match(css, /\.open-ena-set-comparison-svg,[\s\S]*?z-index:\s*1;/);
});
