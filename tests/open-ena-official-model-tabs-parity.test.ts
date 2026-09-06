import { workspaceV3Source as v3, controllerV3Source as owner, renderWorkspaceShellV3 as shell, moduleSourceV3 as moduleV3, functionSourceV3 } from "./helpers/open-ena-workspace-v3-ui";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const projectRoot = process.cwd();
const workspace = readFileSync(
  join(projectRoot, "components", "open-ena", "OpenEnaWorkspace.tsx"),
  "utf8",
);
const css = readFileSync(join(projectRoot, "app", "globals.css"), "utf8");
const controlsPath = join(
  projectRoot,
  "components",
  "open-ena",
  "OpenEnaOfficialModelControls.tsx",
);

test("Workspace composes the accepted four Models panels with typed context and durable raw owners", () => {

  assert.match(v3, /<OpenEnaModelTabsV3 .*scientificContext=\{context\}/);
  for (const name of ["Units", "Horizons", "Windows", "Codes"]) assert.ok(v3.includes(`<OpenEna${name}PanelV3`));
  assert.match(v3, /rawState=\{state.raw.windows\}/);
  assert.match(v3, /state.raw.horizonOrder/);

});
test("the compact parity CSS uses official geometry with Open ENA Baby Blue tokens", () => {
  const marker = "/* Open ENA official Model parity controls. */";
  const endMarker = "/* End Open ENA official Model parity controls. */";
  const start = css.indexOf(marker);
  const end = css.indexOf(endMarker, start + marker.length);
  assert.notEqual(start, -1, "the official Model parity CSS marker must exist");
  assert.notEqual(end, -1, "the official Model parity CSS end marker must exist");
  const modelParityCss = css.slice(start, end);

  assert.doesNotMatch(css, /--ena-model-tab-stage-height:\s*380px/u);
  assert.match(
    modelParityCss,
    /\.ena-model-tabs\s*\{[^}]*border-top:\s*0;/u,
    "the Model tabs must not leave a gray inset above their active indicator",
  );
  assert.match(
    modelParityCss,
    /\.ena-model-control-content \.ena-panel-heading\s*\{[^}]*border-bottom:\s*0;/u,
    "the Model heading must not leave a gray separator above the active indicator",
  );
  assert.match(modelParityCss, /\.ena-model-tabs button\s*\{[^}]*min-height:\s*34px;/u);
  assert.match(
    modelParityCss,
    /\.ena-model-tabs button\[aria-selected="true"\]\s*\{[^}]*color:\s*var\(--ena-accent-strong\);/u,
  );
  assert.match(
    modelParityCss,
    /\.ena-model-tabs button\[aria-selected="true"\]::before\s*\{[^}]*background:\s*var\(--ena-accent\);/u,
  );
  assert.match(
    modelParityCss,
    /\.ena-official-field-path\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*40px;[^}]*gap:\s*0;[^}]*padding:\s*0\s+0\s+0\s+4px;/u,
    "the add control must own the complete 40px trailing surface without gray gutters",
  );
  assert.match(
    modelParityCss,
    /\.ena-official-field-path-add\s*\{[^}]*width:\s*40px;[^}]*height:\s*30px;[^}]*background:\s*var\(--ena-accent\);/u,
  );
  assert.doesNotMatch(modelParityCss, /#56b09d|rgb\(86,\s*176,\s*157\)/iu);
  assert.match(modelParityCss, /\.ena-official-code-row\s*\{[^}]*min-height:\s*34px;/u);
  assert.match(modelParityCss, /\.ena-model-tabs\s*\{[^}]*padding-top:\s*0;/u);
  assert.match(modelParityCss, /\.ena-model-tabs button::before\s*\{[^}]*top:\s*0;/u);
  assert.doesNotMatch(modelParityCss.match(/\.ena-model-tabs\s*\{[^}]*\}/u)?.[0] ?? "", /padding-top:\s*[1-9]/u);
  assert.match(modelParityCss, /\.ena-official-icon-button\s*\{[^}]*(?:min-width|width):\s*32px;[^}]*(?:min-height|height):\s*32px;/u);
  assert.match(modelParityCss, /\.ena-official-icon-button:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--ena-accent-strong\);/u);
  assert.match(modelParityCss, /\.ena-model-toolbar\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;/u);
  assert.match(modelParityCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.ena-model-control-content \*[\s\S]*?transition-duration:\s*0\.01ms/u);
});

test("shared official controls expose real disclosure and switch semantics", async () => {
  assert.equal(existsSync(controlsPath), true, "the shared official Model controls module must exist");
  const module = await import("../components/open-ena/OpenEnaOfficialModelControls").catch(() => null);
  assert.ok(module, "the shared official Model controls module must import");

  const FieldEditor = module.OpenEnaOfficialFieldPathEditor as unknown as ComponentType<Record<string, unknown>>;
  const fieldMarkup = renderToStaticMarkup(createElement(FieldEditor, {
    label: "Unit identity",
    selectedFields: ["Group", "Name"],
    options: ["Group", "Lesson", "Name"],
    onChange: () => {},
  }));
  assert.match(fieldMarkup, /data-ena-official-field-path="true"/u);
  assert.match(fieldMarkup, /aria-label="Add or remove Unit identity fields"/u);
  assert.match(fieldMarkup, /aria-expanded="false"/u);
  assert.match(fieldMarkup, /aria-label="Remove Group from Unit identity"/u);
  assert.match(fieldMarkup, />Group</u);
  assert.match(fieldMarkup, />Name</u);

  const TwoEndedSwitch = module.OpenEnaOfficialTwoEndedSwitch as unknown as ComponentType<Record<string, unknown>>;
  const switchMarkup = renderToStaticMarkup(createElement(TwoEndedSwitch, {
    label: "Horizon method",
    startLabel: "Transmodal",
    endLabel: "Standard",
    endSelected: true,
    disabled: true,
    boundary: "Open ENA currently supports the Standard horizon method.",
  }));
  assert.match(switchMarkup, /role="switch"/u);
  assert.match(switchMarkup, /aria-checked="true"/u);
  assert.match(switchMarkup, /disabled=""/u);
  assert.match(switchMarkup, /Open ENA currently supports the Standard horizon method\./u);
});
