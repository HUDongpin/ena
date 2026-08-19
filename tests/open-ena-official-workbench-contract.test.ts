import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();

function source(relativePath: string) {
  const absolutePath = join(projectRoot, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

const workspace = source("components/open-ena/OpenEnaWorkspace.tsx");
const copy = source("lib/open-ena-i18n.ts");
const groupContrast = source("components/open-ena/OpenEnaGroupContrast.tsx");
const setComparison = source("components/open-ena/OpenEnaSetComparison.tsx");
const css = source("app/globals.css");

function workspaceSegment(startMarker: string, endMarker: string) {
  const start = workspace.indexOf(startMarker);
  assert.notEqual(start, -1, `OpenEnaWorkspace must include ${startMarker}`);
  const end = workspace.indexOf(endMarker, start);
  assert.notEqual(end, -1, `OpenEnaWorkspace must keep ${endMarker} after ${startMarker}`);
  return workspace.slice(start, end);
}

test("the workbench brand is visibly ENA Hub of Knowledge, never ENA Hong Kong", () => {
  const brand = workspace.match(/<div className="ena-workbench-brand"[\s\S]*?<\/div>/)?.[0] ?? "";

  assert.ok(brand, "the workbench must retain one visible brand block");
  assert.match(brand, /<strong>ENA<\/strong>/, "ENA must be the visible workbench brand name");
  assert.match(brand, /<small>Hub of Knowledge<\/small>/, "Hub of Knowledge is the exact brand subtitle");
  assert.doesNotMatch(workspace, /ENA Hong Kong/i);
});

test("the existing ENA.HK rail labels and icon drawings remain the workspace navigation", () => {
  const iconBlock = workspace.match(/const modeIcons:\s*Record<OpenEnaMode, React\.ReactNode>\s*=\s*\{[\s\S]*?\n\};/)?.[0] ?? "";

  assert.equal((iconBlock.match(/<svg\b/g) ?? []).length, 5, "the five existing rail icons stay local to OpenEnaWorkspace");
  assert.match(iconBlock, /M4 5\.5h16v5H4zm0 8h16v5H4z/, "preserve the current Sets icon artwork");
  assert.match(iconBlock, /M4 5\.5h16v13H4zM4 10h16M9 5\.5v13/, "preserve the current Data icon artwork");
  assert.match(iconBlock, /<circle cx="6" cy="7" r="2\.2"[\s\S]*?<circle cx="18" cy="6" r="2\.2"[\s\S]*?<circle cx="12" cy="18" r="2\.2"/, "preserve the current Model icon artwork");
  assert.match(iconBlock, /M4 19\.5V4\.5M4 19\.5h16[\s\S]*?m6\.5 15 4-4 3 2 5-6/, "preserve the current Plot Tools icon artwork");
  assert.match(iconBlock, /M5 19V11h3v8zm6 0V5h3v14zm6 0V8h3v11z/, "preserve the current Stats & Export icon artwork");
  assert.match(copy, /modes:\s*\{\s*sets:\s*"Sets",\s*data:\s*"Data",\s*model:\s*"Model",\s*plot:\s*"Plot Tools",\s*stats:\s*"Stats & Export"\s*\}/);
  assert.match(workspace, /\{modeIcons\[item\]\}[\s\S]*?<span>\{copy\.modes\[item\]\}<\/span>/);
});

test("the no-result state keeps the official comparison workbench frames and compact context", () => {
  const emptyWorkbench = workspaceSegment(
    'data-testid="open-ena-empty-workbench"',
    "{error ? <div className=\"ena-error-banner\"",
  );

  const expectedOrder = [
    'data-testid="open-ena-empty-comparison-plot"',
    'data-testid="open-ena-empty-primary-plot"',
    'data-testid="open-ena-empty-secondary-plot"',
    'data-testid="open-ena-empty-plot-tools"',
    'data-testid="open-ena-empty-data-view"',
  ];
  let cursor = -1;
  for (const marker of expectedOrder) {
    const position = emptyWorkbench.indexOf(marker);
    assert.ok(position > cursor, `${marker} must be present in official workbench reading order`);
    cursor = position;
  }

  assert.match(emptyWorkbench, />\s*COMPARISON PLOT\s*</);
  assert.match(emptyWorkbench, />\s*PRIMARY PLOT\s*</);
  assert.match(emptyWorkbench, />\s*SECONDARY PLOT\s*</);
  assert.match(emptyWorkbench, /\{persistentPlotTools\}/, "the real disabled Plot Tools surface remains present before a model is built");
  assert.match(emptyWorkbench, />\s*Data View\s*</);
});

test("the empty-state network is one coordinate-declared inline SVG with edges beneath nodes", () => {
  const emptyWorkbench = workspaceSegment(
    'data-testid="open-ena-empty-workbench"',
    "{error ? <div className=\"ena-error-banner\"",
  );
  const inlineSvgs = [...emptyWorkbench.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map((match) => match[0]);

  assert.equal(inlineSvgs.length, 1, "the empty workbench must contain exactly one inline SVG illustration");
  const illustration = inlineSvgs[0];
  assert.match(illustration, /data-testid="open-ena-empty-network"/);
  assert.match(illustration, /viewBox="[\d. -]+"/);

  const edges = [...illustration.matchAll(/<line\b[^>]*\/?\s*>/g)].map((match) => match[0]);
  const nodes = [...illustration.matchAll(/<circle\b[^>]*\/?\s*>/g)].map((match) => match[0]);
  assert.ok(edges.length >= 4, "the network declares at least four connected edges");
  assert.ok(nodes.length >= 4, "the network declares at least four nodes");
  for (const edge of edges) {
    for (const coordinate of ["x1", "y1", "x2", "y2"]) {
      assert.match(edge, new RegExp(`\\b${coordinate}="-?[\\d.]+"`), `every edge declares ${coordinate}`);
    }
  }
  for (const node of nodes) {
    for (const coordinate of ["cx", "cy", "r"]) {
      assert.match(node, new RegExp(`\\b${coordinate}="[\\d.]+"`), `every node declares ${coordinate}`);
    }
  }
  assert.ok(
    illustration.lastIndexOf("<line") < illustration.indexOf("<circle"),
    "all edges must be drawn before node circles so every join is visually clean",
  );
  assert.doesNotMatch(emptyWorkbench, /<(?:span|i)\s+className="[ne]\d+"/, "remove the disconnected absolutely positioned span/i motif");
});

test("loaded results retain the dense main Comparison plus stacked Primary and Secondary plots", () => {
  for (const [name, surface] of [
    ["current-result group contrast", groupContrast],
    ["captured-set comparison", setComparison],
  ] as const) {
    const normalizedSurface = surface.toLowerCase();
    const comparisonPosition = normalizedSurface.indexOf("comparison plot");
    const primaryPosition = normalizedSurface.indexOf("primary plot", comparisonPosition);
    const secondaryPosition = normalizedSurface.indexOf("secondary plot", primaryPosition);
    assert.ok(
      comparisonPosition >= 0 && primaryPosition > comparisonPosition && secondaryPosition > primaryPosition,
      `${name} must keep one dominant Comparison Plot followed by stacked Primary and Secondary plots`,
    );
  }

  assert.match(css, /\.ena-set-comparison-layout\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(0,\s*2fr\)\s*minmax\(270px,\s*1fr\);/);
  assert.match(css, /\.ena-set-side-plots\s*\{[\s\S]*?display:\s*grid;[\s\S]*?gap:\s*10px;/);
  assert.match(css, /\.ena-set-plot-heading\s*\{[\s\S]*?min-height:\s*48px;[\s\S]*?padding:\s*7px 10px;/);
  assert.match(css, /\.ena-set-comparison-kicker,[\s\S]*?\.ena-set-plot-heading h3\s*\{[\s\S]*?font-size:\s*0\.64rem;[\s\S]*?letter-spacing:\s*0\.085em;/);
});
