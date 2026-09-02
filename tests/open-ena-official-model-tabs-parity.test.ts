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

test("Model tabs compose the approved official Units, Horizons, Windows, and Codes surfaces", () => {
  assert.match(workspace, /data-ena-official-model-tabs="true"/u);
  assert.match(
    workspace,
    /<OpenEnaOfficialFieldPathEditor[\s\S]*?selectedFields=\{config\.unitColumns\}/u,
  );
  assert.match(
    workspace,
    /<OpenEnaOfficialFieldPathEditor[\s\S]*?selectedFields=\{config\.conversationColumns\}/u,
  );
  for (const panel of ["units", "horizons", "windows", "codes"]) {
    assert.match(
      workspace,
      new RegExp(`data-ena-official-panel="${panel}"`, "u"),
      `${panel} must expose its official-parity panel identity`,
    );
  }
  for (const label of ["Create Sample", "Transmodal", "Standard", "Ordered Network", "Standard Network"]) {
    assert.match(workspace, new RegExp(label, "u"));
  }
  assert.match(workspace, /data-ena-official-horizon-columns="true"/u);
  assert.match(workspace, /data-ena-official-window-settings="true"/u);
  assert.match(workspace, /data-ena-official-code-list="true"/u);
  assert.match(
    workspace,
    /className="ena-model-tab-help" aria-hidden="true"/u,
    "the visual help badge must not change the tab's accessible name",
  );
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
    /\.ena-official-field-path-add\s*\{[^}]*height:\s*30px;[^}]*background:\s*var\(--ena-accent\);/u,
  );
  assert.doesNotMatch(modelParityCss, /#56b09d|rgb\(86,\s*176,\s*157\)/iu);
  assert.match(modelParityCss, /\.ena-official-code-row\s*\{[^}]*min-height:\s*34px;/u);
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
