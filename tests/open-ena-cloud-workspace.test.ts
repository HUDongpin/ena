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
import { interpretationRequest } from "./helpers/ai-interpretation-request-v2";
import { captureAnalysisSetV3, compareAnalysisSetsV3 } from "../lib/open-ena/sets-bound-v3";
import { importOpenEnaArtifactV3 } from "../lib/open-ena/model-artifact-imports-v3";
import { buildAnalysisBundleV3 } from "../lib/open-ena/analysis-bundle-v3";
import { runOpenEnaTrajectoryInferenceV3 } from "../lib/open-ena/inference-v2";
import { buildAiInterpretationReviewV3 } from "../lib/open-ena/ai-interpretation";
import { openEnaAiLocalScientificIdentityV3 } from "../lib/open-ena/workspace-consumer-authority-v3";

function savedAi() {
  const request = interpretationRequest("zh-hans");
  return { request, localScientificIdentity: "saved-local-science", auditReceipt: null,
    response: { schemaVersion: "open-ena-ai-interpretation-response-v2" as const,
      promptVersion: "open-ena-aggregate-inference-review-v2" as const, binding: request.binding,
      provider: "deepseek" as const, model: "synthetic-cloud-test", generatedAt: "2026-10-24T04:00:00.000Z",
      interpretation: { observedPatterns: [{ statement: "Saved synthetic interpretation.", evidenceRefs: ["axis-1"] }],
        contextualQuestions: ["What should be reviewed?"], limitations: ["Synthetic storage test only."] } } };
}

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

test("cloud save restores AI evidence, usable comparison sets and original historical imports without running work", async () => {
  const cloud = await import("../lib/open-ena/cloud-workspace");
  const fixture = await standard();
  const first = await captureAnalysisSetV3(fixture.result, fixture.plan, { id: "first", name: "第一组" });
  const second = await captureAnalysisSetV3(fixture.result, fixture.plan, { id: "second", name: "第二组" });
  const comparison = compareAnalysisSetsV3(first, second);
  const originalText = JSON.stringify(await buildAnalysisBundleV3(fixture.result), null, 2) + "\n";
  const historical = await importOpenEnaArtifactV3(originalText);
  const aiInterpretation = savedAi();
  const snapshot = await cloud.captureOpenEnaCloudWorkspace({ state: { ...fixture.state, historical: [historical] },
    currentPlan: fixture.plan, presentation: cloud.defaultOpenEnaCloudPresentation(),
    aiInterpretation, analysisSets: [first, second], setComparison: comparison });
  assert.equal(snapshot.schemaVersion, 2, "new cloud saves must include complete state");
  const restored = await cloud.restoreOpenEnaCloudWorkspace(JSON.stringify(snapshot));
  assert.deepEqual(restored.aiInterpretation, aiInterpretation);
  assert.deepEqual(restored.analysisSets, [first, second]);
  assert.deepEqual(compareAnalysisSetsV3(...restored.analysisSets as [typeof first, typeof second]), comparison);
  assert.deepEqual(restored.setComparison, comparison);
  assert.equal(restored.historical[0].receivedArtifactSha256, historical.receivedArtifactSha256);
  assert.deepEqual(restored.historical[0], historical);
  const state = controller.createWorkspaceStateFromCloud(restored);
  assert.equal(state.historical.length, 1); assert.equal(state.preview, null);
  assert.equal(state.autoRunIntent, null); assert.equal(state.model.runStatus, "idle");
  const again = await cloud.captureOpenEnaCloudWorkspace({ state, currentPlan: restored.compilation!.plan,
    presentation: restored.presentation, aiInterpretation: restored.aiInterpretation,
    analysisSets: restored.analysisSets, setComparison: restored.setComparison });
  assert.deepEqual((await cloud.restoreOpenEnaCloudWorkspace(JSON.stringify(again))).historical, restored.historical);
});

test("cloud schema 1 remains readable with empty additional state", async () => {
  const cloud = await import("../lib/open-ena/cloud-workspace");
  const snapshot = await cloud.captureOpenEnaCloudWorkspace({ state: createWorkspaceStateV3(), currentPlan: null,
    presentation: cloud.defaultOpenEnaCloudPresentation() });
  const legacy = JSON.parse(JSON.stringify(snapshot));
  legacy.schemaVersion = 1;
  for (const key of ["aiInterpretation", "analysisSets", "setComparison", "historicalImports", "integritySha256"]) delete legacy[key];
  legacy.integritySha256 = await sha256CanonicalJsonV3(legacy);
  const restored = await cloud.restoreOpenEnaCloudWorkspace(JSON.stringify(legacy));
  assert.deepEqual(restored.analysisSets, []); assert.deepEqual(restored.historical, []);
  assert.equal(restored.aiInterpretation, null); assert.equal(restored.setComparison, null);
});

test("cloud AI capture is detached and rejects mismatched response evidence", async () => {
  const cloud = await import("../lib/open-ena/cloud-workspace");
  const aiInterpretation = savedAi();
  const input = { state: createWorkspaceStateV3(), currentPlan: null,
    presentation: cloud.defaultOpenEnaCloudPresentation(), aiInterpretation };
  const pending = cloud.captureOpenEnaCloudWorkspace(input);
  aiInterpretation.response.interpretation.observedPatterns[0].statement = "Changed after Save";
  const restored = await cloud.restoreOpenEnaCloudWorkspace(JSON.stringify(await pending));
  assert.equal(restored.aiInterpretation?.response.interpretation.observedPatterns[0].statement, "Saved synthetic interpretation.");
  aiInterpretation.response = { ...aiInterpretation.response, binding: { ...aiInterpretation.response.binding, evidenceKey: "fnv1a32-00000000" } };
  await assert.rejects(cloud.captureOpenEnaCloudWorkspace(input), /binding|evidence/i);
});

test("corrupt comparison bundles and historical imports fail restoration atomically", async () => {
  const cloud = await import("../lib/open-ena/cloud-workspace");
  const fixture = await standard();
  const first = await captureAnalysisSetV3(fixture.result, fixture.plan);
  const snapshot = await cloud.captureOpenEnaCloudWorkspace({ state: fixture.state, currentPlan: fixture.plan,
    presentation: cloud.defaultOpenEnaCloudPresentation(), analysisSets: [first] });
  assert.equal(snapshot.schemaVersion, 2);
  async function rehash(value: Record<string, unknown>) {
    delete value.integritySha256; value.integritySha256 = await sha256CanonicalJsonV3(value); return JSON.stringify(value);
  }
  const corrupt = JSON.parse(JSON.stringify(snapshot));
  corrupt.analysisSets[0].analysis.manifest.scientificResultSha256 = "f".repeat(64);
  await assert.rejects(cloud.restoreOpenEnaCloudWorkspace(await rehash(corrupt)));
  const badImport = JSON.parse(JSON.stringify(snapshot));
  badImport.historicalImports = ['{"schemaVersion":999,"kind":"open-ena-analysis-bundle"}'];
  await assert.rejects(cloud.restoreOpenEnaCloudWorkspace(await rehash(badImport)));
  const badSelection = JSON.parse(JSON.stringify(snapshot));
  badSelection.setComparison = { primaryId: first.id, secondaryId: "missing", axes: ["SVD1", "SVD2"] };
  await assert.rejects(cloud.restoreOpenEnaCloudWorkspace(await rehash(badSelection)));
});

test("a valid large trajectory AI source identity survives cloud saving within the project budget", async () => {
  const cloud = await import("../lib/open-ena/cloud-workspace");
  const { plan, compiled } = await bindingFixtureV3(undefined, (draft, data) => {
    draft.model = "SeparateTrajectory"; data.rows = [];
    for (let unit = 0; unit < 300; unit++) for (let horizon = 1; horizon <= 8; horizon++) {
      data.rows.push({ unit: `u${unit}`, horizon, time: horizon, group: unit % 2 ? "Control" : "Treatment",
        A: ((unit + horizon) % 3) + 1, B: ((unit * horizon) % 4) + 1, C: ((unit + 2 * horizon) % 5) + 1 });
    }
  });
  const result = await bindResultV3(plan, runStandardPlanV3(plan), { processedRows: plan.rows.length,
    maximumBufferedRows: 0, numericCellsAllocated: plan.operationalAdmission.totalNumericCells,
    peakBytesObservedOrBounded: plan.operationalAdmission.totalPeakBytes,
    observationMethod: "exact-counters-and-conservative-byte-bound" }, compiled.diagnostics);
  const controls = { axes: result.executionProvenance.projection.estimableAxes.slice(0, 2) as [string, string], identityConfirmed: true,
    request: { kind: "trajectory-independent-period" as const, primaryGroup: { type: "string" as const, value: "Control" },
      secondaryGroup: { type: "string" as const, value: "Treatment" }, period: [{ column: "horizon", value: { type: "number" as const, value: 2 } }] } };
  const inference = await runOpenEnaTrajectoryInferenceV3(result, plan, controls);
  const review = await buildAiInterpretationReviewV3(result, plan, { locale: "en", inference, controls });
  const localScientificIdentity = openEnaAiLocalScientificIdentityV3(review)!;
  assert.ok(localScientificIdentity.length > 128 * 1024);
  const aiInterpretation = { ...savedAi(), request: review.request, localScientificIdentity,
    response: { ...savedAi().response, binding: review.request.binding } };
  const snapshot = await cloud.captureOpenEnaCloudWorkspace({ state: createWorkspaceStateV3(), currentPlan: null,
    presentation: cloud.defaultOpenEnaCloudPresentation(), aiInterpretation });
  const restored = await cloud.restoreOpenEnaCloudWorkspace(JSON.stringify(snapshot));
  assert.deepEqual(restored.aiInterpretation, aiInterpretation);
});
