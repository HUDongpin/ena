import assert from "node:assert/strict";
import test from "node:test";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import { bindResultV3 } from "../lib/open-ena/model-v3/result-binding";
import { buildAnalysisBundleV3 } from "../lib/open-ena/analysis-bundle-v3";
import { importOpenEnaArtifactV3, type HistoricalImportV3 } from "../lib/open-ena/model-artifact-imports-v3";
import { parsedDatasetFromSourceProofV3 } from "../lib/open-ena/model-v3/execution-plan";
import { migrateCanonicalConfigurationToDraftV3 } from "../lib/open-ena/model-v3/migration";
import { createWorkspaceStateV3, workspaceReducerV3, type WorkspaceStateV3 } from "../components/open-ena/model-v3/workspace-controller";
import { modelScientificContextV3 } from "../components/open-ena/model-v3/model-state";

const fixture = (async () => {
  const { plan, compiled } = await bindingFixtureV3();
  const result = await bindResultV3(plan, runStandardPlanV3(plan), {
    processedRows: plan.rows.length, maximumBufferedRows: 0, numericCellsAllocated: 120,
    peakBytesObservedOrBounded: 10_240, observationMethod: "exact-counters-and-conservative-byte-bound",
  }, compiled.diagnostics);
  const text = JSON.stringify(await buildAnalysisBundleV3(result));
  const importResult = async (text: string): Promise<HistoricalImportV3> => {
    const value = await importOpenEnaArtifactV3(text);
    assert.equal(value.kind, "historical-result");
    if (value.kind !== "historical-result") throw new Error("Expected actual historical result");
    return value;
  };
  const first = await importResult(text), reimported = await importResult(text), distinctBytes = await importResult(` ${text}`);
  assert.notEqual(first, reimported, "separate import attempts produce separate validated objects");
  assert.equal(first.receivedArtifactSha256, reimported.receivedArtifactSha256);
  assert.notEqual(first.receivedArtifactSha256, distinctBytes.receivedArtifactSha256);
  let current = createWorkspaceStateV3({ dataset: parsedDatasetFromSourceProofV3(plan.sourceProof), datasetSha256: plan.header.datasetSha256, drafts: migrateCanonicalConfigurationToDraftV3(plan.configuration) });
  current = workspaceReducerV3(current, { type: "compiled", value: { context: modelScientificContextV3(current.model), result: compiled, plan, error: null } });
  current = workspaceReducerV3(current, { type: "model", action: { type: "mark-running", context: modelScientificContextV3(current.model), executionPlanSha256: plan.header.executionPlanSha256 } });
  current = workspaceReducerV3(current, { type: "completed", request: current.model.runningRequest!, result, sourceWitness: null });
  assert.equal(current.model.resultStatus, "current");
  return { current, first, reimported, distinctBytes };
})();

function keep(state: WorkspaceStateV3, preview: HistoricalImportV3) {
  return workspaceReducerV3(workspaceReducerV3(state, { type: "preview", value: preview }), { type: "keep-historical", preview });
}
function assertScienceUnchanged(current: WorkspaceStateV3, next: WorkspaceStateV3) {
  for (const key of ["dataset", "model", "raw", "compilation", "references", "sourceWitness", "presetHiddenGroups", "autoRunIntent", "rebuildCue"] as const) {
    assert.equal(next[key], current[key], `${key} must retain its existing ownership`);
  }
  assert.equal(next.model.resultStatus, "current");
  assert.equal(next.model.runStatus, "idle");
}

test("reviewing an already-kept historical artifact and keeping it again is idempotent", async () => {
  const { current, first } = await fixture;
  const saved = keep(current, first), reviewed = keep(saved, first);
  assert.equal(reviewed.historical.length, 1, "revisiting an existing card must not duplicate its React identity");
  assert.equal(reviewed.historical, saved.historical, "retain the first historical store");
  assert.equal(reviewed.historical[0], first);
  assert.equal(reviewed.preview, null);
  assertScienceUnchanged(current, reviewed);
});

test("reimporting identical received bytes retains the first immutable historical entry", async () => {
  const { current, first, reimported } = await fixture;
  const saved = keep(current, first), repeated = keep(saved, reimported);
  assert.equal(repeated.historical.length, 1);
  assert.equal(repeated.historical, saved.historical);
  assert.equal(repeated.historical[0], first, "do not replace the original receipt with a later object");
  assert.equal(repeated.preview, null);
  assertScienceUnchanged(current, repeated);
});

test("distinct received bytes remain separate even when scientific content is identical", async () => {
  const { current, first, distinctBytes } = await fixture;
  const saved = keep(keep(current, first), distinctBytes);
  assert.equal(saved.historical.length, 2);
  assert.deepEqual(saved.historical.map(item => item.receivedArtifactSha256), [first.receivedArtifactSha256, distinctBytes.receivedArtifactSha256]);
  assert.equal(saved.historical[0], first);
  assert.equal(saved.historical[1], distinctBytes);
  assertScienceUnchanged(current, saved);
});

test("old or repeated Keep actions cannot consume another active import preview", async () => {
  const { current, first, distinctBytes } = await fixture;
  const saved = keep(current, first);
  assert.equal(workspaceReducerV3(saved, { type: "keep-historical", preview: first }), saved);
  const nextPreview = workspaceReducerV3(saved, { type: "preview", value: distinctBytes });
  assert.equal(workspaceReducerV3(nextPreview, { type: "keep-historical", preview: first }), nextPreview);
  assert.equal(nextPreview.preview, distinctBytes);
  assertScienceUnchanged(current, nextPreview);
});

test("failed JSON admission and preview cancellation preserve kept entries and live science", async () => {
  const { current, first, distinctBytes } = await fixture;
  const saved = keep(current, first);
  await assert.rejects(importOpenEnaArtifactV3('{"broken":'));
  await assert.rejects(importOpenEnaArtifactV3('{"__proto__":{"polluted":true}}'));
  const cancelled = workspaceReducerV3(workspaceReducerV3(saved, { type: "preview", value: distinctBytes }), { type: "cancel-preview" });
  assert.equal(cancelled.historical, saved.historical);
  assert.equal(cancelled.preview, null);
  assertScienceUnchanged(current, cancelled);
});
