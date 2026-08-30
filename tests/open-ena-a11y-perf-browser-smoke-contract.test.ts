import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const smokePath = join(process.cwd(), "tests/open-ena-a11y-perf-browser-smoke.mjs");
const source = readFileSync(smokePath, "utf8");

test("A11Y-01/A11Y-02/PERF-01 smoke uses the real Open ENA workflow and selectors", () => {
  assert.match(source, /getByRole\("textbox", \{ name: "Account name" \}\)/u);
  assert.match(source, /getByRole\("textbox", \{ name: "Password" \}\)/u);
  assert.match(source, /getByRole\("button", \{ name: "Load teaching sample"/u);
  assert.match(source, /getByRole\("button", \{ name: \/\^3D ENA\//u);
  assert.match(source, /getByRole\("button", \{ name: "Download Model"/u);
  assert.doesNotMatch(source, /getByLabel\("Account"\)/u);
  assert.doesNotMatch(source, /analysis-result/u);
});

test("A11Y-01 captures five core sliders from their two real screens without aria-label", () => {
  assert.match(source, /captureSliderScreen\(/u);
  assert.match(source, /Model configuration/u);
  assert.match(source, /getByRole\("tab", \{ name: "Windows"/u);
  assert.match(source, /getByRole\("button", \{ name: "Plot Tools"/u);
  assert.match(source, /Backward span \(includes current row\)/u);
  assert.match(source, /Forward context rows/u);
  assert.match(source, /Edge width/u);
  assert.match(source, /Minimum relative edge/u);
  assert.match(source, /Unit point size/u);
  assert.match(source, /accessibleName/u);
  assert.match(source, /labelText/u);
  assert.match(source, /valueText/u);
  assert.doesNotMatch(source, /getAttribute\("aria-label"\)/u);
  assert.doesNotMatch(source, /aria-label.*slider|slider.*aria-label/u);
});

test("A11Y-02 checks enlarged tab, toolbar, and rail geometry plus stable scientific identity", () => {
  assert.match(source, /fontSize = "200%"/u);
  assert.match(source, /Horizons/u);
  assert.match(source, /Windows/u);
  assert.match(source, /tabOverlaps/u);
  assert.match(source, /2D ENA/u);
  assert.match(source, /3D ENA/u);
  assert.match(source, /Download Model/u);
  assert.match(source, /railLabels/u);
  assert.match(source, /toolbarOverlaps/u);
  assert.match(source, /toolbar overlaps the 3D result surface/u);
  assert.match(source, /scrollIntoView/u);
  assert.match(source, /model tabs are not recoverable inside the viewport/u);
  assert.match(source, /scientificIdentity/u);
  assert.match(source, /deepEqual\(.*scientificIdentity/u);
});

test("PERF-01 installs longtask timing before the 3D click and verifies all three roots and budgets", () => {
  assert.match(source, /PerformanceObserver/u);
  assert.match(source, /longtask/u);
  assert.match(source, /clickStart/u);
  assert.match(source, /comparisonReady/u);
  assert.match(source, /allThreeReady/u);
  assert.match(source, /data-ena-plot-role/u);
  assert.match(source, /data-ena-plot-ready/u);
  assert.match(source, /data-ena-plot-status/u);
  assert.match(source, /must have one unambiguous interactive region/u);
  assert.match(source, /waitForPlotTerminal\(page, comparison, "comparison"\)/u);
  assert.doesNotMatch(source, /element\?\.getAttribute\("data-ena-plot-ready"\) === "true"/u);
  assert.match(source, /largestNewPlotlyScriptChunk/u);
  assert.match(source, /transferSize/u);
  assert.match(source, /decodedBodySize/u);
  assert.match(source, /2200000/u);
  assert.match(source, /800000/u);
  assert.match(source, /1500/u);
  assert.match(source, /5000/u);
  assert.match(source, /entry\.startTime < end && entry\.startTime \+ entry\.duration > start/u);
  assert.match(source, /expectedChunkNames\.includes/u);
  assert.match(source, /scientific identity changed across isolated runs/u);
});

test("smoke owns an isolated production build, performs four runs, writes a summary, and cleans the server", () => {
  assert.match(source, /OPEN_ENA_A11Y_PERF_SMOKE_ARTIFACT_DIR/u);
  assert.match(source, /NEXT_DIST_DIR/u);
  assert.match(source, /npm", \["run", "build"/u);
  assert.match(source, /npm", \["run", "start"/u);
  assert.match(source, /\.next-open-ena-a11y-perf-smoke-/u);
  assert.match(source, /OPEN_ENA_BROWSER_SMOKE_DISABLE_ANALYTICS/u);
  assert.match(source, /redact\(/u);
  assert.match(source, /for \(let run = 0; run < 4; run \+= 1\)/u);
  assert.match(source, /newContext\(/u);
  assert.match(source, /waitForServer\(.*\/en\/open-ena/u);
  assert.match(source, /summary\.json/u);
  assert.match(source, /server\.kill\("SIGTERM"\)/u);
  assert.match(source, /server\.kill\("SIGKILL"\)/u);
  assert.match(source, /restoreOwnedTsconfigMutation\(\)/u);
  assert.match(source, /refusing to overwrite it/u);
});

test("verifier file exists", () => assert.equal(existsSync(smokePath), true));
