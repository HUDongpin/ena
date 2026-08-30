import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const projectRoot = process.cwd();

function source(relativePath: string) {
  return readFileSync(join(projectRoot, relativePath), "utf8");
}

function sourceSegment(value: string, startMarker: string, endMarker: string) {
  const start = value.indexOf(startMarker);
  assert.notEqual(start, -1, `source must include ${startMarker}`);
  const end = value.indexOf(endMarker, start);
  assert.notEqual(end, -1, `source must keep ${endMarker} after ${startMarker}`);
  return value.slice(start, end);
}

function lastSourceSegment(value: string, startMarker: string, endMarker: string) {
  const start = value.lastIndexOf(startMarker);
  assert.notEqual(start, -1, `source must include ${startMarker}`);
  const end = value.indexOf(endMarker, start);
  assert.notEqual(end, -1, `source must keep ${endMarker} after ${startMarker}`);
  return value.slice(start, end);
}

function firstRuleBody(value: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return value.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`, "u"))?.[1] ?? "";
}

const workspace = source("components/open-ena/OpenEnaWorkspace.tsx");
const css = source("app/globals.css");

test("Open ENA range fields explicitly associate the visible label, output, and localized accessible value", async () => {
  const workspaceModule = await import("../components/open-ena/OpenEnaWorkspace");
  const RangeField = Reflect.get(workspaceModule, "OpenEnaRangeField");
  assert.equal(typeof RangeField, "function", "OpenEnaRangeField must own the accessible range contract");

  const markup = renderToStaticMarkup(createElement(
    RangeField as ComponentType<Record<string, unknown>>,
    {
      id: "fixture-edge-width",
      label: "Edge width",
      value: 1,
      formattedValue: "1.0×",
      accessibleValueText: "1.0 times",
      min: 0.1,
      max: 4,
      step: 0.1,
      onChange: () => {},
    },
  ));

  assert.match(markup, /<div class="ena-field ena-range-field">/u);
  assert.match(markup, /<label for="fixture-edge-width">Edge width<\/label>/u);
  assert.match(markup, /<output id="fixture-edge-width-value" for="fixture-edge-width">1\.0×<\/output>/u);
  assert.match(
    markup,
    /<input(?=[^>]*id="fixture-edge-width")(?=[^>]*aria-valuetext="1\.0 times")(?=[^>]*type="range")[^>]*>/u,
  );
  assert.match(markup, /<span><label for="fixture-edge-width">Edge width<\/label><output id="fixture-edge-width-value" for="fixture-edge-width">1\.0×<\/output><\/span>/u);
  assert.doesNotMatch(markup, /aria-label="Edge width"/u);
  assert.doesNotMatch(
    markup,
    /<label class="ena-field ena-range-field">[\s\S]*?<output[\s\S]*?<input[^>]*type="range"/u,
    "an implicit label must not select output as its first labelable descendant",
  );
});

test("workspace-scoped range IDs remain unique when two workspaces are server-rendered", async () => {
  const workspaceModule = await import("../components/open-ena/OpenEnaWorkspace");
  const RangeField = Reflect.get(workspaceModule, "OpenEnaRangeField");
  const props = {
    id: "open-ena-window-back", label: "Back", value: 1, formattedValue: "1",
    accessibleValueText: "1", min: 0, max: 2, step: 1, onChange: () => {},
  };
  const markup = renderToStaticMarkup(createElement("main", null,
    createElement(RangeField as ComponentType<Record<string, unknown>>, { ...props, idPrefix: ":R1:" }),
    createElement(RangeField as ComponentType<Record<string, unknown>>, { ...props, idPrefix: ":R2:" }),
  ));
  const ids = [...markup.matchAll(/id="([^"]*open-ena-window-back)"/gu)].map((match) => match[1]);
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, ids.length, "each workspace must receive a distinct useId prefix");
  assert.match(markup, /<label for=":R1:-open-ena-window-back">/u);
  assert.match(markup, /<output id=":R1:-open-ena-window-back-value" for=":R1:-open-ena-window-back">/u);
});

test("the two Windows ranges and three Plot Tools ranges use the shared accessible field", () => {
  const modelPanel = sourceSegment(workspace, "function renderModelPanel()", "function renderLongitudinalPanel()");
  const plotPanel = sourceSegment(workspace, "function renderPlotPanel()", "function renderAiPanel()");

  assert.equal((modelPanel.match(/<OpenEnaRangeField\b/gu) ?? []).length, 2);
  assert.equal((plotPanel.match(/<OpenEnaRangeField\b/gu) ?? []).length, 3);

  for (const binding of [
    "copy.model.back",
    "copy.model.forward",
    "copy.plot.edgeScale",
    "copy.plot.edgeThreshold",
    "copy.plot.pointScale",
  ]) {
    assert.match(workspace, new RegExp(`label=\\{${binding.replaceAll(".", "\\.")}\\}`, "u"));
  }

  assert.equal((modelPanel.match(/accessibleValueText=/gu) ?? []).length, 2);
  assert.equal((plotPanel.match(/accessibleValueText=/gu) ?? []).length, 3);
  assert.doesNotMatch(modelPanel, /<label className="ena-field ena-range-field">/u);
  assert.doesNotMatch(plotPanel, /<label className="ena-field ena-range-field">/u);
});

test("the Model tablist and desktop rail grow with 200 percent text instead of overlapping or clipping", () => {
  const workbenchRule = firstRuleBody(css, ".open-ena-workbench");
  const gridRule = firstRuleBody(css, ".ena-workbench-grid");
  const tablistRule = firstRuleBody(css, ".ena-model-tabs");
  const railLabelRule = firstRuleBody(css, ".ena-rail-button span");

  assert.match(workbenchRule, /--ena-rail-width:\s*clamp\(65px,\s*4\.0625rem,\s*130px\);/u);
  assert.match(gridRule, /grid-template-columns:\s*var\(--ena-rail-width\)\s+380px\s+minmax\(0,\s*1fr\);/u);
  assert.match(gridRule, /overflow-x:\s*auto;/u);
  assert.match(
    tablistRule,
    /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*5\.25rem\),\s*1fr\)\);/u,
  );
  assert.match(railLabelRule, /max-width:\s*100%;/u);
  assert.match(railLabelRule, /overflow-wrap:\s*anywhere;/u);
});

test("the 1400px toolbar keeps enlarged actions in wrapping normal flow", () => {
  const desktop = lastSourceSegment(css, "@media (min-width: 1400px)", "@media (max-width: 1399px) and (min-width: 901px)");
  const toolbarRule = firstRuleBody(desktop, ".ena-visual-toolbar");
  const headingRule = firstRuleBody(desktop, ".ena-visual-toolbar > div:first-child");
  const actionsRule = firstRuleBody(desktop, ".ena-visual-toolbar-actions");
  const clusterRule = firstRuleBody(desktop, ".ena-analysis-toolbar-cluster");
  const downloadRule = firstRuleBody(desktop, ".ena-download-model-button");
  const viewButtonRule = firstRuleBody(desktop, ".ena-view-toggle button");

  assert.match(toolbarRule, /height:\s*auto;/u);
  assert.match(toolbarRule, /flex-wrap:\s*wrap;/u);
  assert.match(toolbarRule, /position:\s*static;/u);
  assert.match(toolbarRule, /z-index:\s*20;/u);
  assert.match(headingRule, /position:\s*static;/u);
  assert.match(actionsRule, /flex-wrap:\s*wrap;/u);
  assert.match(clusterRule, /position:\s*static;/u);
  assert.match(clusterRule, /height:\s*auto;/u);
  assert.match(clusterRule, /flex-wrap:\s*wrap;/u);
  assert.match(downloadRule, /width:\s*auto;/u);
  assert.match(downloadRule, /min-width:\s*0;/u);
  assert.match(downloadRule, /max-width:\s*none;/u);
  assert.match(downloadRule, /min-height:\s*44px;/u);
  assert.match(downloadRule, /white-space:\s*normal;/u);
  assert.match(viewButtonRule, /min-height:\s*44px;/u);

  assert.doesNotMatch(toolbarRule, /height:\s*44px;/u);
  assert.doesNotMatch(clusterRule, /position:\s*absolute|height:\s*24px/u);
  assert.doesNotMatch(downloadRule, /(?:width|min-width|max-width):\s*138px|min-height:\s*24px/u);
  assert.doesNotMatch(viewButtonRule, /min-height:\s*24px/u);
});
