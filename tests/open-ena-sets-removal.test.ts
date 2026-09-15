import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();

function source(relativePath: string) {
  return readFileSync(join(projectRoot, relativePath), "utf8");
}

const workspace = source("components/open-ena/OpenEnaWorkspace.tsx");
const copy = source("lib/open-ena-i18n.ts");
const types = source("lib/open-ena/types.ts");

test("Open ENA removes the Sets rail entry and opens on Data", () => {
  assert.match(
    types,
    /export type OpenEnaMode = "data" \| "model" \| "plot" \| "stats" \| "ai";/,
  );
  assert.doesNotMatch(types, /OpenEnaMode[^;]*"sets"/);
  assert.doesNotMatch(workspace, /^\s{2}sets:\s*\(/m, "the Sets rail logo must be removed");
  assert.match(workspace, /useState<OpenEnaMode>\("data"\)/, "Data becomes the initial mode");
  assert.doesNotMatch(copy, /modes:\s*\{\s*sets:/, "localized rail labels must not expose Sets");
});

test("Open ENA removes the Sets panel and captured-set comparison interface", () => {
  assert.doesNotMatch(workspace, /function renderSetsPanel\(/);
  assert.doesNotMatch(workspace, /import OpenEnaSetComparison/);
  assert.doesNotMatch(workspace, /<OpenEnaSetComparison/);
  assert.doesNotMatch(workspace, />Captured sets</);
});

test("Artifacts keep analysis-set capture and remove focus tokens without restoring the Sets rail", () => {
  assert.match(workspace, /id="open-ena-sets-heading"/);
  assert.match(workspace, /id="open-ena-capture-set"/);
  assert.match(workspace, /id=\{`open-ena-set-remove-\$\{set\.id\}`\}/);
  assert.match(workspace, /nextAnalysisSetRemovalFocusId/);
  assert.match(workspace, /removeCapturedAnalysisSet/);
  assert.match(workspace, /scheduleOpenEnaDomFocusRestore/);
});
