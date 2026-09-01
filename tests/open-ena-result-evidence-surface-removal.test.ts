import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const workspace = readFileSync(
  join(process.cwd(), "components/open-ena/OpenEnaWorkspace.tsx"),
  "utf8",
);

const statsStart = workspace.indexOf("function renderStatsPanel()");
const sourceEvidenceDefinition = workspace.indexOf("function renderSourceEvidence()", statsStart);
assert.notEqual(statsStart, -1, "OpenEnaWorkspace must define renderStatsPanel");
assert.notEqual(sourceEvidenceDefinition, -1, "source-evidence data logic must remain available");
const statsPanel = workspace.slice(statsStart, sourceEvidenceDefinition);

test("Stats omits the Result data and Source evidence disclosure cards", () => {
  assert.doesNotMatch(statsPanel, /\{renderResultTables\(\)\}/);
  assert.doesNotMatch(statsPanel, /\{renderSourceEvidence\(\)\}/);
});

test("removing the cards does not delete their underlying local data helpers", () => {
  assert.match(workspace, /function renderResultTables\(\)/);
  assert.match(workspace, /function renderSourceEvidence\(\)/);
  assert.match(workspace, /filterSourceEvidence/);
  assert.match(workspace, /buildOpenEnaResultTableViewModel/);
});
