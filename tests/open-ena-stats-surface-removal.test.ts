import assert from "node:assert/strict";
import test from "node:test";
import { workspaceV3Source, moduleSourceV3 } from "./helpers/open-ena-workspace-v3-ui";
test("native Comparison does not revive automatic fitted-model tests or a redundant manifest preamble", () => {
  assert.doesNotMatch(workspaceV3Source, /data-ena-stats-scope="fitted-model"|ena-manifest-section|result\.stats\.tests/u);
  assert.match(workspaceV3Source, /OpenEnaNativeStatsPanelV3/u);
});
test("native exports and bound Methods remain separate from the statistics view state", () => {
  assert.match(workspaceV3Source, /exportNativeStatisticsV3/u);
  assert.match(workspaceV3Source, /exportCurrentAnalysisV3/u);
  assert.match(workspaceV3Source, /exportReferenceV2/u);
  assert.match(workspaceV3Source, /navigator\.clipboard\.writeText\(buildMethodsReportV3\(result\)\)/u);
  assert.doesNotMatch(moduleSourceV3("components/open-ena/model-v3/OpenEnaNativeStatsPanelV3.tsx"), /buildAnalysisBundle|exportReferenceV2/u);
});
