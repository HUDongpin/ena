import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceStateV3, createWorkspaceStateFromCloud, emptyWorkspaceDraftsV3, workspaceReducerV3, type WorkspaceStateV3 } from "../components/open-ena/model-v3/workspace-controller";
import type { ParsedDataset } from "../lib/open-ena/types";
import { modelScientificContextV3, type ModelStateActionV3 } from "../components/open-ena/model-v3/model-state";

const dataset: ParsedDataset = {
  name: "two-groups.csv", source: "upload", sizeBytes: 100,
  headers: ["Group", "Name", "A", "B", "C"],
  rows: [
    { Group: "Experimental", Name: "one", A: 1, B: 1, C: 0 },
    { Group: "Control", Name: "one", A: 0, B: 1, C: 1 },
    { Group: "Experimental", Name: "two", A: 1, B: 0, C: 1 },
    { Group: "Control", Name: "two", A: 1, B: 1, C: 1 },
  ],
};
function fresh(data = dataset) {
  return workspaceReducerV3(createWorkspaceStateV3(), { type: "install-source", dataset: data, datasetSha256: "a".repeat(64) });
}
function mapGroups(state: WorkspaceStateV3, units = ["Group", "Name"]) {
  return workspaceReducerV3(state, { type: "model", action: { type: "replace-standard-draft", draft: { ...state.model.drafts.standard, unitColumns: units, groupColumn: "Group" } } });
}
test("a fresh two-group endpoint defaults to Means in first-source group order", () => {
  const state = mapGroups(fresh());
  assert.deepEqual(state.model.drafts.standard.rotation, {
    type: "means", centerAlignToOrigin: true,
    negativeLevel: { type: "string", value: "Experimental" },
    positiveLevel: { type: "string", value: "Control" },
  });
});
test("an explicitly imported SVD draft is never replaced by automatic Means", () => {
  const state = mapGroups(createWorkspaceStateV3({ dataset, datasetSha256: "a".repeat(64), drafts: emptyWorkspaceDraftsV3() }));
  assert.equal(state.model.drafts.standard.rotation.type, "svd");
});
test("a cloud-restored explicit SVD choice remains authoritative after field edits", async () => {
  const cloud = await import("../lib/open-ena/cloud-workspace");
  const empty = emptyWorkspaceDraftsV3();
  const drafts = { ...empty, standard: { ...empty.standard, unitColumns: ["Group", "Name"], horizonColumns: ["Name"], groupColumn: "Group", codes: ["A", "B", "C"], windowType: "Conversation" as const } };
  const original = createWorkspaceStateV3({ dataset, datasetSha256: "a".repeat(64), drafts });
  const snapshot = await cloud.captureOpenEnaCloudWorkspace({ state: original, currentPlan: null, presentation: cloud.defaultOpenEnaCloudPresentation() });
  const restored = await cloud.restoreOpenEnaCloudWorkspace(JSON.stringify(snapshot));
  const state = createWorkspaceStateFromCloud(restored);
  assert.equal(state.defaultEndpointRotationPending, false);
  assert.equal(mapGroups(state).model.drafts.standard.rotation.type, "svd");
});
test("an explicit SVD choice before Group mapping is preserved", () => {
  let state = fresh();
  state = workspaceReducerV3(state, { type: "model", action: { type: "replace-standard-draft", draft: state.model.drafts.standard, intent: "rotation" } as ModelStateActionV3 });
  assert.equal(mapGroups(state).model.drafts.standard.rotation.type, "svd");
});
test("a later manual SVD choice survives other model edits", () => {
  let state = mapGroups(fresh());
  state = workspaceReducerV3(state, { type: "model", action: { type: "replace-standard-draft", draft: { ...state.model.drafts.standard, rotation: { type: "svd", centerAlignToOrigin: true } } } });
  state = workspaceReducerV3(state, { type: "model", action: { type: "set-codes", codes: ["A", "B", "C"] } });
  assert.equal(state.model.drafts.standard.rotation.type, "svd");
});
test("automatic Means requires exactly two complete, Unit-stable groups", () => {
  for (const rows of [dataset.rows.map((r, i) => ({ ...r, Group: i === 0 ? "" : r.Group })), [...dataset.rows, { ...dataset.rows[0], Group: "Third" }]]) {
    assert.equal(mapGroups(fresh({ ...dataset, rows })).model.drafts.standard.rotation.type, "svd");
  }
  assert.equal(mapGroups(fresh(), ["Name"]).model.drafts.standard.rotation.type, "svd");
});
test("automatic Means preserves typed group identities", () => {
  const rows = dataset.rows.map(r => ({ ...r, Group: r.Group === "Experimental" ? 1 : "1" }));
  const state = mapGroups(fresh({ ...dataset, rows }));
  const rotation = state.model.drafts.standard.rotation;
  assert.equal(rotation.type, "means");
  if (rotation.type === "means") {
    assert.deepEqual(rotation.negativeLevel, { type: "number", value: 1 });
    assert.deepEqual(rotation.positiveLevel, { type: "string", value: "1" });
  }
});
test("source replacement resolves a pending default before a build captures its context", () => {
  let state = mapGroups(fresh({ ...dataset, rows: dataset.rows.filter(row => row.Group === "Experimental") }));
  state = workspaceReducerV3(state, { type: "model", action: { type: "replace-standard-draft", draft: { ...state.model.drafts.standard, windowType: "Conversation" } } });
  assert.equal(state.model.drafts.standard.rotation.type, "svd");
  state = workspaceReducerV3(state, { type: "install-source", dataset, datasetSha256: "b".repeat(64) });
  assert.equal(state.model.drafts.standard.rotation.type, "means");
  const context = modelScientificContextV3(state.model);
  state = workspaceReducerV3(state, { type: "model", action: { type: "mark-running", context, executionPlanSha256: "c".repeat(64) } });
  assert.equal(state.model.runStatus, "running");
  assert.equal(state.model.scientificRevision, context.scientificRevision);
  assert.equal(state.model.runningRequest?.draftFingerprint, context.draftFingerprint);
});
test("runtime and display actions never consume a pending rotation default", () => {
  let state = mapGroups(fresh({ ...dataset, rows: dataset.rows.filter(row => row.Group === "Experimental") }));
  state = workspaceReducerV3(state, { type: "model", action: { type: "replace-standard-draft", draft: { ...state.model.drafts.standard, windowType: "Conversation" } } });
  // Represents a pending default whose data is now eligible, before a scientific edit.
  state = { ...state, dataset };
  state = workspaceReducerV3(state, { type: "model", action: { type: "hide-all-groups" } });
  assert.equal(state.model.drafts.standard.rotation.type, "svd");
  const context = modelScientificContextV3(state.model);
  state = workspaceReducerV3(state, { type: "model", action: { type: "mark-running", context, executionPlanSha256: "c".repeat(64) } });
  assert.equal(state.model.runStatus, "running");
  assert.equal(state.model.drafts.standard.rotation.type, "svd");
});
