import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();

function source(relativePath: string) {
  return readFileSync(join(projectRoot, relativePath), "utf8");
}

const css = source("app/globals.css");
const workspace = source("components/open-ena/OpenEnaWorkspace.tsx");
const contrast = source("components/open-ena/OpenEnaGroupContrast.tsx");
const plot = source("components/open-ena/OpenEnaPlot.tsx");
const tools = source("components/open-ena/OpenEnaPersistentPlotTools.tsx");

test("the one-pixel typography step is scoped to the Open ENA workbench", () => {
  assert.match(
    css,
    /\.open-ena-workbench\s*\{[\s\S]*?--ena-font-step:\s*1px;[\s\S]*?font-size:\s*calc\(1rem \+ var\(--ena-font-step\)\);/,
  );
  assert.doesNotMatch(css, /(?:^|\n)\s*(?::root|html|body)\s*\{[^}]*font-size\s*:/);

  for (const expected of [
    /\.ena-rail-product\s*\{[^}]*font-size:\s*calc\(0\.51rem \+ var\(--ena-font-step, 1px\)\);/,
    /\.ena-panel-heading h2\s*\{[^}]*font-size:\s*calc\(1\.02rem \+ var\(--ena-font-step, 1px\)\);/,
    /\.ena-model-tabs button\s*\{[^}]*font-size:\s*calc\(0\.63rem \+ var\(--ena-font-step, 1px\)\);/,
    /\.ena-compact-toolbar-button\s*\{[^}]*font-size:\s*calc\(0\.63rem \+ var\(--ena-font-step, 1px\)\);/,
    /\.ena-longitudinal-heading h3\s*\{[^}]*font-size:\s*calc\(1rem \+ var\(--ena-font-step, 1px\)\);/,
    /\.ena-data-view-table\s*\{[^}]*font-size:\s*calc\(0\.6rem \+ var\(--ena-font-step, 1px\)\);/,
  ]) {
    assert.match(css, expected);
  }
});

test("live, copied, and exported plot text all receive the same additive pixel", () => {
  assert.match(css, /\.ena-zero-axes text,[\s\S]*?font-size:\s*calc\(12px \+ var\(--ena-font-step, 1px\)\);/);
  assert.match(css, /\.ena-result-label,[\s\S]*?\{[^}]*font-size:\s*calc\(13px \+ var\(--ena-font-step, 1px\)\);/);
  assert.match(css, /\.ena-longitudinal-axis-label\s*\{[^}]*font-size:\s*calc\(13px \+ var\(--ena-font-step, 1px\)\);/);
  assert.match(
    css,
    /\.open-ena-group-contrast \.ena-set-result-label\s*\{[^}]*font-size:\s*calc\(10px \* var\(--ena-plot-text-scale, 1\) \+ var\(--ena-font-step, 1px\)\);/,
  );
  assert.match(
    contrast,
    /\.ena-set-result-label \{[^}]*font-size: calc\(10px \* var\(--ena-plot-text-scale, 1\) \+ var\(--ena-font-step, 1px\)\);/,
  );
  assert.match(workspace, /\.ena-zero-axes text, \.ena-three-axes text \{[^}]*font-size: 13px;/);
  assert.match(workspace, /\.ena-longitudinal-axis-label \{[^}]*font-size: 14px;/);
  assert.equal((plot.match(/fontSize="11\.5"/g) ?? []).length, 3);
  assert.equal((contrast.match(/fontSize="11\.5"/g) ?? []).length, 3);
});

test("Plot Tools reports the shifted 9 to 21 pixel range with a 13 pixel default", () => {
  assert.match(tools, /const textSize = Math\.round\(12 \* textScale \+ 1\);/);
  assert.match(tools, /data-ena-plot-tool="text-size"[\s\S]*?min="9"[\s\S]*?max="21"[\s\S]*?rangeProgressStyle\(textSize, 9, 21\)/);
  assert.match(tools, /\(Number\(event\.target\.value\) - 1\) \/ 12/);
});
