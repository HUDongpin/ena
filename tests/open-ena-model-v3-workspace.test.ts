import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createWorkspaceStateV3, workspaceReducerV3, workspaceDraftExportableV3, workspaceRawBlockersV3 } from "../components/open-ena/model-v3/workspace-controller";
import { modelScientificContextV3 } from "../components/open-ena/model-v3/model-state";
import { exportDraftV3 } from "../lib/open-ena/model-artifact-exports-v3";
import { importOpenEnaArtifactV3 } from "../lib/open-ena/model-artifact-imports-v3";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";
import { migrateCanonicalConfigurationToDraftV3 } from "../lib/open-ena/model-v3/migration";
import { parsedDatasetFromSourceProofV3 } from "../lib/open-ena/model-v3/execution-plan";

async function fixture() {
  const f = await bindingFixtureV3(undefined, (draft) => {
    draft.windowType = "MovingStanzaWindow";
    draft.movingStanza.rowOrder = { kind: "columns", keys: [{ column: "unit", direction: "ascending", comparator: { type: "text", locale: "en-US", sensitivity: "variant", numeric: false } }] };
  });
  const drafts = migrateCanonicalConfigurationToDraftV3(f.plan.configuration);
  return { ...f, state: createWorkspaceStateV3({ dataset: parsedDatasetFromSourceProofV3(f.plan.sourceProof), datasetSha256: f.plan.header.datasetSha256, drafts }) };
}

test("the actual workspace delegates Models to v3 and retires flat scientific execution", () => {
  const source = readFileSync("components/open-ena/OpenEnaWorkspace.tsx", "utf8");
  assert.match(source, /OpenEnaModelTabsV3/u);
  assert.doesNotMatch(source, /analyzeDatasetInWorker|runOpenEnaInferenceV2|officialComparisonRotation|function updateConfig/u);
  assert.doesNotMatch(source, /label="Horizon method"|label="Window horizon method"|title="Horizon-level hiding is not available/u);
});

test("active raw blockers survive family/tab-unmount equivalents; repairing one never clears another", async () => {
  let { state } = await fixture();
  const raw = { ...state.raw.windows, standard: { ...state.raw.windows.standard, backward: { mode: "finite" as const, finiteText: "" }, forward: { mode: "finite" as const, finiteText: "1.5" } } };
  state = workspaceReducerV3(state, { type: "windows-raw", value: raw });
  assert.equal(state.model.editorBlocked.standard, true);
  assert.equal(workspaceDraftExportableV3(state), false);
  state = workspaceReducerV3(state, { type: "model", action: { type: "set-editor-blocked", family: "standard", blocked: false } });
  assert.equal(state.model.editorBlocked.standard, true, "a child false cannot clear the synchronous ledger");
  state = workspaceReducerV3(state, { type: "windows-raw", value: { ...raw, standard: { ...raw.standard, forward: { mode: "finite", finiteText: "0" } } } });
  assert.equal(workspaceRawBlockersV3(state).backward, true);
  assert.equal(state.model.editorBlocked.standard, true);
  state = workspaceReducerV3(state, { type: "model", action: { type: "replace-standard-draft", draft: { ...state.model.drafts.standard, windowType: "Conversation" } } });
  assert.equal(state.model.editorBlocked.standard, false, "inactive MovingStanza memory does not block Conversation");
  state = workspaceReducerV3(state, { type: "model", action: { type: "set-active-family", family: "ona" } });
  state = workspaceReducerV3(state, { type: "model", action: { type: "set-active-family", family: "standard" } });
  assert.equal(state.raw.windows.standard.backward.finiteText, "");
  state = workspaceReducerV3(state, { type: "model", action: { type: "replace-standard-draft", draft: { ...state.model.drafts.standard, windowType: "MovingStanzaWindow" } } });
  assert.equal(state.model.editorBlocked.standard, true);
});

test("raw edit obsoletes the reducer-owned request before any late result adoption; display edits preserve it", async () => {
  let { state, plan } = await fixture();
  state = workspaceReducerV3(state, { type: "model", action: { type: "mark-running", context: modelScientificContextV3(state.model), executionPlanSha256: plan.header.executionPlanSha256 } });
  const request = state.model.runningRequest!;
  assert.ok(request);
  state = workspaceReducerV3(state, { type: "model", action: { type: "hide-all-codes" } });
  assert.equal(state.model.runningRequest, request);
  assert.equal(state.model.runStatus, "running");
  state = workspaceReducerV3(state, { type: "windows-raw", value: { ...state.raw.windows, standard: { ...state.raw.windows.standard, backward: { mode: "finite", finiteText: "broken" } } } });
  assert.equal(state.model.runStatus, "obsolete");
  assert.notEqual(state.model.executionEpoch, request.executionEpoch);
});

test("preview Cancel and hostile import leave all scientific stores unchanged; accept replaces only its family without running", async () => {
  let { state } = await fixture();
  const original = state;
  const artifact = await exportDraftV3({ ...state.model.drafts.standard, codes: [] });
  const preview = await importOpenEnaArtifactV3(new TextDecoder().decode(artifact.bytes));
  state = workspaceReducerV3(state, { type: "preview", value: preview });
  state = workspaceReducerV3(state, { type: "cancel-preview" });
  assert.equal(state.model, original.model); assert.equal(state.references, original.references);
  await assert.rejects(importOpenEnaArtifactV3('{"__proto__":{"polluted":true}}'));
  assert.equal(state.model, original.model);
  state = workspaceReducerV3(state, { type: "preview", value: preview });
  state = workspaceReducerV3(state, { type: "accept-draft-preview", preview });
  assert.deepEqual(state.model.drafts.standard.codes, []);
  assert.equal(state.model.drafts.ona, original.model.drafts.ona);
  assert.equal(state.model.runStatus, "idle"); assert.equal(state.model.runningRequest, null);
  assert.equal(workspaceDraftExportableV3(state), true, "typed incomplete Codes remain exportable");
});

test("same-hash source re-adoption expires compilation and the exact in-flight request", async () => {
  const f = await fixture();
  let state = workspaceReducerV3(f.state, { type: "compiled", value: { context: modelScientificContextV3(f.state.model), result: f.compiled, plan: f.plan, error: null } });
  const original = modelScientificContextV3(state.model);
  state = workspaceReducerV3(state, { type: "model", action: { type: "mark-running", context: original, executionPlanSha256: f.plan.header.executionPlanSha256 } });
  const request = state.model.runningRequest!;
  state = workspaceReducerV3(state, { type: "install-source", dataset: { ...state.dataset!, name: "same-normalized-content.xlsx", sizeBytes: state.dataset!.sizeBytes + 1 }, datasetSha256: state.model.datasetSha256, drafts: state.model.drafts });
  assert.equal(state.model.runStatus, "obsolete");
  assert.ok(state.model.scientificRevision > request.scientificRevision);
  assert.ok(state.model.executionEpoch > request.executionEpoch);
  assert.equal(state.compilation, null);
  assert.notDeepEqual(modelScientificContextV3(state.model), original);
});

test("sample auto-run and color confirmations are exact-context one-shot intents", async () => {
  const f = await fixture();
  let state = workspaceReducerV3(f.state, { type: "install-source", dataset: f.state.dataset!, datasetSha256: f.state.model.datasetSha256, drafts: f.state.model.drafts, autoRun: true });
  assert.deepEqual(state.autoRunIntent, modelScientificContextV3(state.model));
  const intent = modelScientificContextV3(state.model);
  state = workspaceReducerV3(state, { type: "model", action: { type: "hide-all-codes" } });
  assert.deepEqual(state.autoRunIntent, intent, "presentation preserves the explicit sample science");
  state = workspaceReducerV3(state, { type: "model", action: { type: "exclude-code", code: "A" } });
  assert.equal(state.autoRunIntent, null);
  const before = state;
  state = workspaceReducerV3(state, { type: "confirm-code-color", context: intent, code: "A", color: "#ff0000" });
  assert.equal(state, before, "late color confirmation does not restore an excluded Code or cross family/context");
});

test("Workspace has a durable reducer-owned raw editor and worker lifecycle", async () => {
  const controller = await import("../components/open-ena/model-v3/workspace-controller").catch(() => null);
  assert.ok(controller, "the native Workspace controller must exist");
  assert.equal(typeof controller.useOpenEnaWorkspaceV3, "function");
  assert.equal(typeof controller.workspaceReducerV3, "function");
});

test("preset adoption is atomic display state and preserves science, requests, and underlying Group preferences", async () => {
  const f = await fixture();
  const { bindResultV3 } = await import("../lib/open-ena/model-v3/result-binding");
  const { runStandardPlanV3 } = await import("../lib/open-ena/analyze");
  const result = await bindResultV3(f.plan, runStandardPlanV3(f.plan), { processedRows: f.plan.rows.length, maximumBufferedRows: 0, numericCellsAllocated: 120, peakBytesObservedOrBounded: 10240, observationMethod: "exact-counters-and-conservative-byte-bound" }, f.compiled.diagnostics);
  let state = workspaceReducerV3(f.state, { type: "model", action: { type: "mark-running", context: modelScientificContextV3(f.state.model), executionPlanSha256: f.plan.header.executionPlanSha256 } });
  state = workspaceReducerV3(state, { type: "completed", request: state.model.runningRequest!, result, sourceWitness: null });
  const group = result.executionProvenance.identityDictionary.groups[0].token;
  state = workspaceReducerV3(state, { type: "model", action: { type: "set-group-display", groupToken: group, patch: { showMean: false, showOutlierIntervals: true } } });
  const before = state;
  const action = { type: "apply-display-preset" as const, context: modelScientificContextV3(state.model), resultHash: result.binding.scientificResultSha256, codeVisibility: { A: false, B: true, C: true }, codeColors: { A: "#123456" }, hiddenGroupTokens: [group] };
  state = workspaceReducerV3(state, action);
  assert.equal(state.model.result, before.model.result);
  assert.equal(state.model.drafts, before.model.drafts);
  assert.equal(state.model.scientificRevision, before.model.scientificRevision);
  assert.equal(state.model.executionEpoch, before.model.executionEpoch);
  assert.equal(state.model.runningRequest, before.model.runningRequest);
  assert.deepEqual(state.model.display.standard.groups, before.model.display.standard.groups);
  assert.deepEqual(state.presetHiddenGroups?.tokens, [group]);
  assert.equal(state.model.display.standard.codeVisibility.A, false);
  const changed = workspaceReducerV3(state, { type: "model", action: { type: "exclude-code", code: "A" } });
  assert.equal(workspaceReducerV3(changed, action), changed, "late application cannot cross a scientific edit");
  assert.equal(workspaceReducerV3(changed, { ...action, context: modelScientificContextV3(changed.model) }), changed, "even a new intent cannot apply missing SOURCE Code controls");
});
