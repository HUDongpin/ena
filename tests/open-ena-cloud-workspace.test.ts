import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import { bindResultV3 } from "../lib/open-ena/model-v3/result-binding";
import { compileOnaDraftV3 } from "../lib/open-ena/model-v3/compiler";
import { buildOnaExecutionPlanV3, runOnaPlanV3 } from "../lib/open-ena/model-v3/ona-adapter";
import { bindOnaResultV3 } from "../lib/open-ena/model-v3/ona-result-binding";
import { createDirectionalMask } from "../lib/open-ena/network-config";
import { createWorkspaceStateV3, emptyWorkspaceDraftsV3 } from "../components/open-ena/model-v3/workspace-controller";
import { canonicalJsonV3, sha256CanonicalJsonV3 } from "../lib/open-ena/model-v3/canonical-json";
import type { ParsedDataset } from "../lib/open-ena/types";
import type { StandardEnaDraftV3, OrderedNetworkDraftV3 } from "../lib/open-ena/model-v3/types";
import * as controller from "../components/open-ena/model-v3/workspace-controller";

async function standard() {
  let dataset!: ParsedDataset, draft!: StandardEnaDraftV3;
  const { plan, compiled } = await bindingFixtureV3("a".repeat(64), (d, data) => { dataset = structuredClone(data); draft = structuredClone(d); });
  const result = await bindResultV3(plan, runStandardPlanV3(plan), { processedRows: plan.rows.length, maximumBufferedRows: 0,
    numericCellsAllocated: 120, peakBytesObservedOrBounded: 10_240, observationMethod: "exact-counters-and-conservative-byte-bound" }, compiled.diagnostics);
  const initial = createWorkspaceStateV3({ dataset, datasetSha256: "a".repeat(64), drafts: { ...emptyWorkspaceDraftsV3(), standard: draft } });
  return { dataset, plan, result, state: { ...initial, model: { ...initial.model, result, resultStatus: "current" as const } } };
}

test("cloud workspace round trips source, both drafts, current Standard result and presentation", async () => {
  assert.ok(existsSync(new URL("../lib/open-ena/cloud-workspace.ts", import.meta.url)), "cloud workspace codec must exist");
  const cloud = await import("../lib/open-ena/cloud-workspace");
  const fixture = await standard();
  const presentation = { ...cloud.defaultOpenEnaCloudPresentation(), mode: "plot" as const, edgeScale: 2, view: "3d" as const,
    primaryGroupName: fixture.result.executionProvenance.identityDictionary.groups[0].token };
  const snapshot = await cloud.captureOpenEnaCloudWorkspace({ state: fixture.state, currentPlan: fixture.plan, presentation });
  const restored = await cloud.restoreOpenEnaCloudWorkspace(JSON.stringify(snapshot));
  assert.deepEqual(restored.dataset, { ...fixture.dataset, hashKind: "normalized-utf8-csv-text-sha256" });
  assert.deepEqual(restored.drafts, fixture.state.model.drafts);
  assert.equal(restored.result?.binding.scientificResultSha256, fixture.result.binding.scientificResultSha256);
  assert.equal(restored.resultStatus, "current"); assert.ok(restored.compilation?.plan);
  assert.equal(restored.presentation.edgeScale, 2); assert.equal(restored.presentation.view, "3d");
  assert.equal(cloud.isRestoredOpenEnaCloudWorkspace(restored), true);
  assert.equal(cloud.isRestoredOpenEnaCloudWorkspace(JSON.parse(JSON.stringify(restored))), false, "parsed data must not forge validated restore authority");
  assert.equal(typeof controller.createWorkspaceStateFromCloud, "function");
  const state = controller.createWorkspaceStateFromCloud(restored);
  assert.equal(state.model.runStatus, "idle"); assert.equal(state.model.runningRequest, null); assert.equal(state.autoRunIntent, null);
  assert.equal(state.model.resultStatus, "current"); assert.equal(state.model.result?.binding.scientificResultSha256, fixture.result.binding.scientificResultSha256);
  assert.throws(() => controller.createWorkspaceStateFromCloud(JSON.parse(JSON.stringify(restored))));
});

test("stale results stay stale and modified source never acquires current-result authority", async () => {
  assert.ok(existsSync(new URL("../lib/open-ena/cloud-workspace.ts", import.meta.url)));
  const cloud = await import("../lib/open-ena/cloud-workspace");
  const fixture = await standard();
  const snapshot = await cloud.captureOpenEnaCloudWorkspace({ state: { ...fixture.state,
    model: { ...fixture.state.model, resultStatus: "stale" } }, currentPlan: null, presentation: cloud.defaultOpenEnaCloudPresentation() });
  assert.equal((await cloud.restoreOpenEnaCloudWorkspace(JSON.stringify(snapshot))).resultStatus, "stale");
  const tampered = structuredClone(snapshot);
  tampered.dataset!.cells[0][4] = 99;
  await assert.rejects(cloud.restoreOpenEnaCloudWorkspace(JSON.stringify(tampered)), /integrity|hash/iu);
  const misleading = structuredClone(snapshot);
  misleading.resultStatus = "current";
  misleading.dataset!.cells[0][4] = 99;
  misleading.dataset!.tableSha256 = await sha256CanonicalJsonV3({ headers: misleading.dataset!.headers, cells: misleading.dataset!.cells });
  const { integritySha256: _ignored, ...payload } = misleading;
  misleading.integritySha256 = await sha256CanonicalJsonV3(payload);
  assert.equal((await cloud.restoreOpenEnaCloudWorkspace(JSON.stringify(misleading))).resultStatus, "stale");
});

test("ONA result restoration retains directed science without rerunning the model", async () => {
  assert.ok(existsSync(new URL("../lib/open-ena/cloud-workspace.ts", import.meta.url)));
  const cloud = await import("../lib/open-ena/cloud-workspace");
  const fixture = await standard(), dataset = structuredClone(fixture.dataset);
  dataset.rows.forEach((row, i) => { row.time = i + 1; });
  const drafts = emptyWorkspaceDraftsV3();
  const ona: OrderedNetworkDraftV3 = { ...drafts.ona, unitColumns: ["unit"], horizonColumns: ["horizon"], groupColumn: "group", codes: ["A", "B", "C"], directionalMask: createDirectionalMask(["A", "B", "C"]),
    backward: { kind: "finite" as const, value: 2 }, rowOrder: { kind: "columns" as const, keys: [{ column: "time", direction: "ascending" as const, comparator: { type: "number" as const } }] } };
  const compiled = await compileOnaDraftV3(dataset, "b".repeat(64), ona);
  assert.equal(compiled.status, "ready", compiled.diagnostics.map((d) => d.id).join(", ")); if (compiled.status !== "ready") throw new Error("Fixture must be ready");
  const plan = await buildOnaExecutionPlanV3(dataset, "b".repeat(64), compiled.canonicalConfiguration);
  const result = await bindOnaResultV3(plan, runOnaPlanV3(plan), { processedRows: dataset.rows.length, maximumRetainedRowsAfterChunk: 0,
    bufferedRowsPeakUpperBound: Math.min(dataset.rows.length, plan.header.resourceEstimate.estimatedRetainedWindowRows + 1),
    numericCellsUpperBound: plan.operationalAdmission.totalNumericCells, peakBytesUpperBound: plan.operationalAdmission.totalPeakBytes,
    observationMethod: "dimension-bounds-and-chunk-boundary-stream-state" });
  const state = createWorkspaceStateV3({ dataset, datasetSha256: "b".repeat(64), drafts: { ...drafts, activeFamily: "ona", ona } });
  const snapshot = await cloud.captureOpenEnaCloudWorkspace({ state: { ...state, model: { ...state.model, result, resultStatus: "current" } }, currentPlan: plan,
    presentation: cloud.defaultOpenEnaCloudPresentation() });
  const restored = await cloud.restoreOpenEnaCloudWorkspace(JSON.stringify(snapshot));
  assert.equal(restored.resultStatus, "current"); assert.equal(restored.result?.configuration.analysisFamily, "ona");
  assert.equal(canonicalJsonV3(restored.result), canonicalJsonV3(result));
});

test("empty drafts can be saved and invalid or oversized envelopes are rejected", async () => {
  assert.ok(existsSync(new URL("../lib/open-ena/cloud-workspace.ts", import.meta.url)));
  const cloud = await import("../lib/open-ena/cloud-workspace");
  const snapshot = await cloud.captureOpenEnaCloudWorkspace({ state: createWorkspaceStateV3(), currentPlan: null,
    presentation: cloud.defaultOpenEnaCloudPresentation() });
  const restored = await cloud.restoreOpenEnaCloudWorkspace(JSON.stringify(snapshot));
  assert.equal(restored.dataset, null); assert.equal(restored.result, null); assert.equal(restored.compilation, null);
  await assert.rejects(cloud.restoreOpenEnaCloudWorkspace('{"kind":"open-ena-cloud-project","kind":"forged"}'));
  await assert.rejects(cloud.restoreOpenEnaCloudWorkspace(JSON.stringify({ ...snapshot, schemaVersion: 999 })));
  const bad = { ...snapshot, presentation: { ...snapshot.presentation, textScale: -1 } };
  const { integritySha256: _ignored, ...payload } = bad;
  bad.integritySha256 = await sha256CanonicalJsonV3(payload);
  await assert.rejects(cloud.restoreOpenEnaCloudWorkspace(JSON.stringify(bad)));
});

test("cloud save refuses unresolved visible model text instead of saving the previous typed value", async () => {
  const cloud = await import("../lib/open-ena/cloud-workspace");
  const fixture = await standard();
  const edited = controller.workspaceReducerV3(fixture.state, { type: "windows-raw", value: {
    ...fixture.state.raw.windows,
    standard: { ...fixture.state.raw.windows.standard, backward: { mode: "finite", finiteText: "-" } },
  } });
  assert.equal(controller.workspaceDraftExportableV3(edited), false);
  await assert.rejects(cloud.captureOpenEnaCloudWorkspace({ state: edited, currentPlan: fixture.plan,
    presentation: cloud.defaultOpenEnaCloudPresentation() }), /unfinished-model-input/);
});
