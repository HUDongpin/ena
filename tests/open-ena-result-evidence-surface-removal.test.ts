import assert from "node:assert/strict";
import test from "node:test";
import { workspaceV3Source, moduleSourceV3 } from "./helpers/open-ena-workspace-v3-ui";
test("native Stats omits redundant legacy Result data and Source evidence cards", () => {
  assert.doesNotMatch(workspaceV3Source, /renderResultTables\(|renderSourceEvidence\(/u);
});
test("the reachable bound DataView preserves explicit unavailable source membership and separate global traversal", () => {
  assert.match(workspaceV3Source, /<OpenEnaDataView/u);
  assert.match(workspaceV3Source, /buildDataViewV3\(result, currentPlan\)/u);
  const source = moduleSourceV3("lib/open-ena/data-view-export.ts");
  assert.match(source, /observedSourceRowIndices\] = null/u);
  assert.match(source, /sourceTraversal/u);
  assert.match(workspaceV3Source, /sourceIndexMeaning/u);
});
