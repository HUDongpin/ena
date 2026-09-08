import assert from "node:assert/strict";
import test from "node:test";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import { bindResultV3 } from "../lib/open-ena/model-v3/result-binding";
import { presentBoundResultV3, type OpenEnaPlotResult } from "../lib/open-ena/bound-presentation-v3";
import { buildTrajectoryPresentationV3 } from "../lib/open-ena/trajectory-presentation-v3";
import { compileOpenEna3dPlotSpec, type CompileOpenEna3dPlotInput } from "../lib/open-ena/plot3d";
import { createOpenEnaPluginContextV1 } from "../lib/open-ena/plugins/runtime-context";
import * as runtime from "../lib/open-ena/plugins/runtime-registry";
import { createOpenEnaPluginRunReceiptV1 } from "../lib/open-ena/plugins/run-receipt";
import { OPEN_ENA_PLUGIN_CATALOG } from "../lib/open-ena/plugins/catalog";

const pluginId = "ena-hk/3d-ena";
const manifest = OPEN_ENA_PLUGIN_CATALOG.find(entry => entry.pluginId === pluginId)!;
async function fixture() {
  const f = await bindingFixtureV3("a".repeat(64), (draft, data) => {
    draft.model = "SeparateTrajectory";
    draft.rotation = { type: "svd", centerAlignToOrigin: false };
    data.rows = data.rows.slice(0, 4).flatMap((row, i) => [1, 2, 3, 4].map(h => ({
      ...row, horizon: h, time: h, A: ((i + h) % 3) + 1, B: ((i * h) % 4) + 1, C: ((i + 2 * h) % 5) + 1,
    })));
  });
  const bound = await bindResultV3(f.plan, runStandardPlanV3(f.plan), {
    processedRows: f.plan.rows.length, maximumBufferedRows: 0, numericCellsAllocated: 120,
    peakBytesObservedOrBounded: 10240, observationMethod: "exact-counters-and-conservative-byte-bound",
  }, f.compiled.diagnostics);
  const presentation = presentBoundResultV3(bound);
  const result = { ...presentation.result, trajectoryPresentation: buildTrajectoryPresentationV3(bound, {
    showCentroidPaths: true, endpointsOnly: false, visibleHorizons: null, hiddenUnitKeys: [], groupSettingsByToken: {},
  }) };
  assert.equal(result.dimensions.length, 3);
  return { bound, result, config: presentation.config };
}
function input(result: OpenEnaPlotResult): CompileOpenEna3dPlotInput {
  return { result, groupColumn: "Group", xDimension: result.dimensions[0], yDimension: result.dimensions[1], zDimension: result.dimensions[2],
    camera: "isometric", showPoints: true, showNetworks: true, showLabels: true, showUnitLabels: false,
    showVariance: true, showTrajectories: true, edgeScale: 1, edgeThreshold: 0, pointScale: 1, plotZoom: 1, flipX: false, flipY: false };
}

test("native plugin metadata preserves native source, configuration and Reference binding without inventing legacy provenance", async () => {
  const f = await fixture();
  const context = createOpenEnaPluginContextV1({ result: f.result, selectedDimensions: f.result.dimensions, stale: false });
  assert.equal(context.resultSchemaVersion, 3);
  assert.equal(context.scientificResult.sourceDatasetSha256, f.bound.binding.datasetSha256);
  assert.deepEqual(context.scientificResult.native?.binding, f.bound.binding);
  assert.deepEqual(context.scientificResult.native?.configuration, f.bound.configuration);
  assert.deepEqual(context.scientificResult.native?.projection, f.bound.executionProvenance.projection);
  assert.equal(context.scientificResult.configuration, null, "the native configuration is not represented as a lossy legacy configuration");
  assert.equal(context.scientificResult.projectionReference, null);
  assert.doesNotMatch(JSON.stringify(context), /"(?:rawRows|rowConnectionCounts|metaData|cookie|database|fetch|sourceText)"/iu);
  assert.ok(Object.isFrozen(context.scientificResult.native!.configuration));
});

for (const hidden of [false, true]) test(`native plugin renders the same trajectory and group visibility as the core presenter (hidden=${hidden})`, async () => {
  const f = await fixture();
  const result = { ...f.result, groupPresentation: { allSuppressed: hidden, settingsByName: {}, hiddenUnits: new Set<string>() } };
  const args = input(result);
  const context = createOpenEnaPluginContextV1({ result, selectedDimensions: result.dimensions, stale: false });
  const expected = compileOpenEna3dPlotSpec(args);
  const actual = runtime.compileOpenEnaTrusted3dPlugin(pluginId, context, args, []);
  assert.deepEqual(actual, expected);
});

test("native hidden-unit sets survive the immutable presenter boundary", async () => {
  const f = await fixture();
  const result = { ...f.result, groupPresentation: { allSuppressed: false, settingsByName: {}, hiddenUnits: new Set([String(f.result.set.points[0].ENA_UNIT)]) } };
  const args = input(result);
  const context = createOpenEnaPluginContextV1({ result, selectedDimensions: result.dimensions, stale: false });
  const snapshot = runtime.createOpenEna3dPresenterSnapshotV1(args, context);
  assert.ok(Object.isFrozen(snapshot.result.groupPresentation?.hiddenUnits));
  assert.deepEqual(runtime.compileOpenEnaTrusted3dPlugin(pluginId, context, args, []), compileOpenEna3dPlotSpec(args));
});

test("stale native geometry remains viewable through the historical presenter while plugin dispatch stays forbidden", async () => {
  const f = await fixture();
  const context = createOpenEnaPluginContextV1({ result: f.result, selectedDimensions: f.result.dimensions, stale: true });
  const args = input(f.result);
  assert.throws(() => runtime.compileOpenEnaTrusted3dPlugin(pluginId, context, args, []), { code: "result-stale" });
  assert.equal(typeof runtime.compileOpenEnaHistorical3dDisplay, "function");
  assert.deepEqual(runtime.compileOpenEnaHistorical3dDisplay(pluginId, context, args, []), compileOpenEna3dPlotSpec(args));
  assert.throws(() => runtime.compileOpenEnaHistorical3dDisplay(pluginId, context, args, [pluginId]), { code: "plugin-disabled" });
  assert.throws(() => runtime.compileOpenEnaHistorical3dDisplay(pluginId, context, { ...args, result: { ...f.result } }, []), { code: "scientific-result-changed" });
});

test("a native plugin receipt retains its source binding and rejects an expired lease before and after hashing", async () => {
  const f = await fixture();
  const context = createOpenEnaPluginContextV1({ result: f.result, selectedDimensions: f.result.dimensions, stale: false });
  const receiptInput = { manifest, parentScientificResult: context.scientificResult, currentScientificResult: context.scientificResult,
    output: compileOpenEna3dPlotSpec(input(f.result)), settings: { axes: f.result.dimensions, camera: "isometric", flipX: false, flipY: false } };
  const receipt = await createOpenEnaPluginRunReceiptV1({ ...receiptInput, isCurrent: () => true });
  assert.equal(receipt.parentResultBindingSha256, receipt.postPluginResultBindingSha256);
  await assert.rejects(createOpenEnaPluginRunReceiptV1({ ...receiptInput, isCurrent: () => false }), /current|stale|expired/i);
  let current = true;
  const pending = createOpenEnaPluginRunReceiptV1({ ...receiptInput, isCurrent: () => current });
  current = false;
  await assert.rejects(pending, /current|stale|expired/i);
});
