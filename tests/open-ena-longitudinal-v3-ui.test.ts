import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("../components/open-ena/OpenEnaLongitudinalWorkbenchV3.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../components/open-ena/OpenEnaWorkspace.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("V3 trajectory controls follow the 3DENA scientific workflow order", () => {
  const order = [...component.matchAll(/data-trajectory-step="(\d+)"/gu)].map((match) => Number(match[1]));
  assert.deepEqual(order, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  for (const phrase of [
    "Time / order variable",
    "Entity ID",
    "same physical entity",
    "Displayed trajectory levels",
    "Expected empty period",
    "Complete analytical rows",
    "Full rotation distance",
    "3D / 2D projection",
    "Direction arrows",
    "Participant-history cluster bootstrap",
    "Mean network overlay",
    "Run trajectory analysis",
    "Analysis bundle ZIP",
  ]) assert.match(component, new RegExp(phrase, "i"));
});

test("React presenter consumes the immutable package envelope and contains no scientific arithmetic", () => {
  assert.match(component, /compileTrajectoryPlotlySpec/);
  assert.match(component, /cloneTrajectoryPlotlyInputV3\(spec\)/);
  assert.match(component, /createExportBundle/);
  assert.match(component, /executeOpenEnaLongitudinalPreparedV3/);
  assert.doesNotMatch(component, /Math\.(?:hypot|sqrt|pow)/);
  assert.doesNotMatch(component, /\b(?:mannWhitney|wilcoxonSigned|friedmanRank|holmAdjust|percentile)\s*\(/);
  assert.doesNotMatch(component, /reduce\([^\n]*(?:centroid|distance|pValue|confidence)/i);
});

test("standalone downloads use the exact aggregate files emitted by the 3DENA package", () => {
  assert.match(component, /exported\.files\.find/);
  assert.doesNotMatch(component, /JSON\.stringify\(bundle/);
  assert.doesNotMatch(component, /csvRows\(pathRows\(bundle\)\)/);
  assert.doesNotMatch(component, /csvRows\(inferenceRows\(bundle\)\)/);
  assert.doesNotMatch(component, /csvRows\(bootstrapRows\(bundle\)\)/);
});

test("successful trajectory results use the V3 workbench instead of the legacy render-time derivation", () => {
  assert.match(workspace, /OpenEnaLongitudinalWorkbenchV3/);
  assert.match(workspace, /<OpenEnaLongitudinalWorkbenchV3/);
  assert.match(component, /data-testid="open-ena-longitudinal-v3-workbench"/);
  assert.match(workspace, /trajectory results are executed by the V3 task workbench/i);
});

test("V3 desktop and narrow layouts preserve controls-status-plot-table order without horizontal overflow", () => {
  assert.match(css, /\.ena-longitudinal-v3-workbench\s*\{[^}]*grid-column:\s*2\s*\/\s*4[^}]*overflow:\s*hidden/);
  assert.match(css, /\.ena-longitudinal-v3-layout\s*\{[^}]*grid-template-columns:\s*minmax\(300px,\s*380px\)\s+minmax\(0,\s*1fr\)/);
  assert.match(css, /@media\s*\(max-width:\s*900px\)[\s\S]*?\.ena-longitudinal-v3-layout\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(css, /\.ena-longitudinal-v3-table-wrap\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(css, /@media\s*\(max-width:\s*560px\)[\s\S]*?\.ena-longitudinal-v3-plot-shell\s*\{[^}]*height:\s*535px/);
  assert.match(css, /@media\s*\(max-width:\s*560px\)[\s\S]*?\.ena-longitudinal-v3-plot\s*\{[^}]*height:\s*480px/);
});

test("the plot action toolbar occupies its own row instead of covering the 3D legend", () => {
  assert.match(css, /\.ena-longitudinal-v3-plot-shell\s*\{[^}]*min-height:\s*615px/);
  assert.match(css, /\.ena-longitudinal-v3-plot-actions\s*\{[^}]*position:\s*static[^}]*border-bottom:/);
  assert.match(css, /@media\s*\(max-width:\s*900px\)[\s\S]*?\.ena-longitudinal-v3-plot-shell\s*\{[^}]*height:\s*485px/);
});

test("fullscreen gives the Plotly canvas the remaining dynamic viewport instead of retaining its 560px page height", () => {
  assert.match(css, /\.ena-longitudinal-v3-plot-shell:fullscreen\s*\{[^}]*display:\s*grid[^}]*grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)[^}]*height:\s*100dvh[^}]*overflow:\s*hidden/);
  assert.match(css, /\.ena-longitudinal-v3-plot-shell:fullscreen\s+\.ena-longitudinal-v3-plot\s*\{[^}]*height:\s*100%[^}]*min-height:\s*0/);
  assert.match(component, /document\.addEventListener\("fullscreenchange",\s*resizePlot\)/);
  assert.match(component, /window\.addEventListener\("resize",\s*resizePlot\)/);
});

test("V3 result surfaces include equivalent mapping, path, inference, bootstrap, warning, and provenance tables", () => {
  for (const testId of [
    "open-ena-longitudinal-v3-mapping-audit",
    "open-ena-longitudinal-v3-path-table",
    "open-ena-longitudinal-v3-inference",
    "open-ena-longitudinal-v3-bootstrap",
    "open-ena-longitudinal-v3-warnings",
    "open-ena-longitudinal-v3-provenance",
  ]) assert.match(component, new RegExp(`data-testid="${testId}"`));
});

test("all trajectory camera options preserve the lowercase CameraPreset value", () => {
  assert.match(component, /\(\["isometric", "xy", "xz", "yz", "yx", "zx", "zy"\] as CameraPreset\[\]\)/);
  assert.match(component, /<option key=\{preset\} value=\{preset\}>\{preset\.toUpperCase\(\)\}<\/option>/);
});
