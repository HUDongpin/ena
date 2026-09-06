import { workspaceV3Source as v3, controllerV3Source as owner, renderWorkspaceShellV3 as shell, moduleSourceV3 as moduleV3, functionSourceV3 } from "./helpers/open-ena-workspace-v3-ui";
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

test("compact rail retains the ENA mark, Open ENA identity and runtime", () => {

  const markup = shell();
  assert.equal((markup.match(/data-ena-rail-brand="true"/g) ?? []).length, 1);
  assert.match(markup, /src="\/ena-mark.svg"/);
  assert.match(markup, />OPEN ENA</);
  assert.match(markup, /data-ena-rail-version="true"/);

});

test("the five original inline rail icons remain in Data-to-AI order", () => {

  const rail = shell().match(/<nav class="ena-tool-rail"[\s\S]*?<\/nav>/)?.[0] ?? "";
  assert.equal((rail.match(/class="ena-rail-button"/g) ?? []).length, 5);
  assert.equal((rail.match(/<svg /g) ?? []).length, 5);
  assert.ok(rail.indexOf('aria-label="Stats &amp; Export"') < rail.indexOf('aria-label="AI-assisted interpretation"'));

});

test("the empty workbench retains comparison and two side frames with persistent plot tools", () => {

  const markup = shell();
  for (const id of ["open-ena-empty-workbench", "open-ena-empty-comparison-plot", "open-ena-empty-primary-plot", "open-ena-empty-secondary-plot", "open-ena-empty-plot-tools", "open-ena-empty-data-view"]) assert.ok(markup.includes(`data-testid="${id}"`), id);

});

test("the empty-state network is a connected SVG with edges beneath its four nodes", () => {

  const network = shell().match(/<svg[^>]*data-testid="open-ena-empty-network"[\s\S]*?<\/svg>/)?.[0] ?? "";
  assert.match(network, /viewBox="0 0 200 135"/);
  assert.equal((network.match(/<circle /g) ?? []).length, 4);
  assert.equal((network.match(/<line /g) ?? []).length, 5);
  assert.ok(network.lastIndexOf("<line ") < network.indexOf("<circle "));

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
  assert.match(css, /\.ena-set-comparison-kicker,[\s\S]*?\.ena-set-plot-heading h3\s*\{[\s\S]*?font-size:\s*calc\(0\.64rem \+ var\(--ena-font-step, 1px\)\);[\s\S]*?letter-spacing:\s*0\.085em;/);
});
