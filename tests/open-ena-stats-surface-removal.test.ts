import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const workspace = readFileSync(
  join(process.cwd(), "components/open-ena/OpenEnaWorkspace.tsx"),
  "utf8",
);

const statsStart = workspace.indexOf("function renderStatsPanel()");
const statsEnd = workspace.indexOf("function renderSourceEvidence()", statsStart);
assert.notEqual(statsStart, -1, "OpenEnaWorkspace must define renderStatsPanel");
assert.notEqual(statsEnd, -1, "renderSourceEvidence must follow renderStatsPanel");
const statsPanel = workspace.slice(statsStart, statsEnd);

test("two-group Comparison omits the redundant jENA fitted-model block", () => {
  assert.doesNotMatch(statsPanel, /data-ena-stats-scope="fitted-model"/);
  assert.doesNotMatch(statsPanel, /copy\.stats\.verifiedTests/);
});

test("Stats omits the visible analysis manifest summary while retaining export actions", () => {
  const exportStart = statsPanel.indexOf('data-ena-stats-export="true"');
  const methodsStart = statsPanel.indexOf('className="ena-methods-section"', exportStart);
  assert.notEqual(exportStart, -1, "Stats must retain its export region");
  assert.notEqual(methodsStart, -1, "Stats must retain Methods & Reproducibility");
  const exportActions = statsPanel.slice(exportStart, methodsStart);

  assert.doesNotMatch(exportActions, /ena-manifest-section/);
  assert.doesNotMatch(exportActions, /copy\.stats\.manifest/);
  assert.doesNotMatch(exportActions, /<dl>/);
  assert.doesNotMatch(exportActions, /copy\.stats\.identityExportWarning/);
  assert.match(exportActions, /copy\.stats\.export/);
  assert.match(exportActions, /copy\.stats\.exportBundle/);
  assert.match(exportActions, /buildReferenceRotationPackage/);
});
