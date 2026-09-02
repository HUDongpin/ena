import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { analyzeDataset } from "@/lib/open-ena/analyze";
import { parseCsv } from "@/lib/open-ena/csv";
import { compileOpenEna3dPlotSpec } from "@/lib/open-ena/plot3d";
import {
  OPEN_ENA_RUNTIME_PLUGIN_REGISTRY,
  OpenEnaPluginRuntimeError,
  compileOpenEnaTrusted3dPlugin,
  createOpenEna3dPresenterSnapshotV1,
  openEnaRuntimePluginAvailability,
  parseOpenEnaDisabledPluginIds,
} from "@/lib/open-ena/plugins/runtime-registry";
import { createOpenEnaPluginContextV1 } from "@/lib/open-ena/plugins/runtime-context";
import { SAMPLE_CONFIG, type OpenEnaConfig } from "@/lib/open-ena/types";

const projectRoot = process.cwd();
const config: OpenEnaConfig = {
  ...SAMPLE_CONFIG,
  unitColumns: ["unit"], conversationColumns: ["conversation"], groupColumn: "group",
  codes: ["A", "B", "C"], window: "Conversation",
};

function fixture() {
  const dataset = parseCsv([
    "unit,conversation,group,A,B,C",
    "u1,c1,first,1,1,0", "u2,c2,first,1,0,1",
    "u3,c3,second,0,1,1", "u4,c4,second,1,1,1", "",
  ].join("\n"), { name: "plugin-runtime.csv", source: "upload" });
  return analyzeDataset(dataset, config);
}

function compilerInput() {
  const result = fixture(); const [xDimension = "SVD1", yDimension = "SVD2", zDimension = "SVD3"] = result.dimensions;
  return {
    result, groupColumn: "group", xDimension, yDimension, zDimension,
    camera: "isometric" as const, showPoints: true, showNetworks: true, showLabels: true,
    showUnitLabels: false, showVariance: true, showTrajectories: false, edgeScale: 1,
    edgeThreshold: 0, pointScale: 1, plotZoom: 1, flipX: false, flipY: false,
  };
}

test("runtime context is deeply frozen metadata and contains no fitted rows or execution authority", () => {
  const input = compilerInput();
  const context = createOpenEnaPluginContextV1({ result: input.result, config, selectedDimensions: [input.xDimension, input.yDimension, input.zDimension], stale: false });
  assert.ok(Object.isFrozen(context));
  assert.ok(Object.isFrozen(context.dimensions));
  assert.ok(Object.isFrozen(input.result));
  assert.ok(Object.isFrozen(input.result.set.points));
  assert.throws(() => { (input.result.set.points[0] as Record<string, unknown>).SVD1 = 999; }, TypeError);
  assert.equal(context.analysisKind, "ena");
  assert.equal(context.modelType, "EndPoint");
  assert.equal(context.minimumDataTier, "D2");
  assert.equal(context.resultSchemaVersion, 2);
  assert.ok(context.capabilities.includes("3d"));
  assert.ok(Object.isFrozen(context.scientificResult));
  const serialized = JSON.stringify(context);
  assert.doesNotMatch(serialized, /"(?:rawRows|rowConnectionCounts|metaData|cookie|database|fetch|sourceText)"/iu);
});

test("the dispatched 3D presenter snapshot is deeply frozen and excludes raw source rows", () => {
  const input = compilerInput();
  const parentBefore = JSON.stringify(input.result);
  const snapshot = createOpenEna3dPresenterSnapshotV1(input);
  const serialized = JSON.stringify(snapshot);
  assert.match(serialized, /"points"/u);
  assert.doesNotMatch(serialized, /rawRows|rowConnectionCounts|metaData|connectionCounts/u);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.result.points));
  assert.throws(() => { (snapshot.result.points[0] as Record<string, unknown>).SVD1 = 999; }, TypeError);
  assert.equal(JSON.stringify(input.result), parentBefore);
});

test("display-only recompilation reuses one frozen scientific binding instead of recloning fitted tables", () => {
  const input = compilerInput();
  const context = createOpenEnaPluginContextV1({ result: input.result, config, selectedDimensions: [input.xDimension, input.yDimension, input.zDimension], stale: false });
  const first = createOpenEna3dPresenterSnapshotV1(input, context);
  const second = createOpenEna3dPresenterSnapshotV1({ ...input, camera: "xy", showLabels: false }, context);
  assert.equal(first.result.points, context.scientificResult.points);
  assert.equal(second.result.points, context.scientificResult.points);
  assert.equal(first.result.adjacencyKey, second.result.adjacencyKey);
  assert.notEqual(first.display.camera, second.display.camera);
});

test("3D ENA registry adapter produces the exact existing PlotSpec without mutating the result", () => {
  const input = compilerInput(); const before = JSON.stringify(input.result);
  const context = createOpenEnaPluginContextV1({ result: input.result, config, selectedDimensions: [input.xDimension, input.yDimension, input.zDimension], stale: false });
  const legacy = compileOpenEna3dPlotSpec(input);
  const plugin = compileOpenEnaTrusted3dPlugin("ena-hk/3d-ena", context, input, []);
  assert.deepEqual(plugin, legacy);
  assert.equal(JSON.stringify(input.result), before);
});

test("plugin availability fails closed for unknown, disabled, stale, incompatible, and underspecified contexts", () => {
  const input = compilerInput();
  const context = createOpenEnaPluginContextV1({ result: input.result, config, selectedDimensions: [input.xDimension, input.yDimension, input.zDimension], stale: false });
  assert.deepEqual(openEnaRuntimePluginAvailability("ena-hk/3d-ena", context, []), { enabled: true, reasonCode: null });
  assert.deepEqual(openEnaRuntimePluginAvailability("ena-hk/3d-ena", { ...context, stale: true }, []), { enabled: false, reasonCode: "result-stale" });
  assert.deepEqual(openEnaRuntimePluginAvailability("ena-hk/3d-ena", { ...context, dimensions: [input.xDimension, input.yDimension] }, []), { enabled: false, reasonCode: "dimensions-insufficient" });
  assert.deepEqual(openEnaRuntimePluginAvailability("ena-hk/3d-ena", { ...context, schemaVersion: "invalid" as never }, []), { enabled: false, reasonCode: "contract-incompatible" });
  assert.deepEqual(openEnaRuntimePluginAvailability("ena-hk/3d-ena", { ...context, coreApiVersion: "invalid" as never }, []), { enabled: false, reasonCode: "contract-incompatible" });
  assert.deepEqual(openEnaRuntimePluginAvailability("ena-hk/3d-ena", { ...context, resultSchemaVersion: 1 as never }, []), { enabled: false, reasonCode: "result-schema-incompatible" });
  assert.deepEqual(openEnaRuntimePluginAvailability("ena-hk/3d-ena", { ...context, capabilities: [] }, []), { enabled: false, reasonCode: "capability-incompatible" });
  assert.deepEqual(openEnaRuntimePluginAvailability("ena-hk/3d-ena", context, ["ena-hk/3d-ena"]), { enabled: false, reasonCode: "plugin-disabled" });
  assert.deepEqual(openEnaRuntimePluginAvailability("missing/plugin", context, []), { enabled: false, reasonCode: "plugin-unknown" });
  assert.throws(() => compileOpenEnaTrusted3dPlugin("missing/plugin", context, input, []), OpenEnaPluginRuntimeError);
});

test("the runtime registry is a one-plugin compile-time allowlist and disabled IDs accept known exact names only", () => {
  assert.deepEqual(Object.keys(OPEN_ENA_RUNTIME_PLUGIN_REGISTRY), ["ena-hk/3d-ena"]);
  assert.deepEqual(parseOpenEnaDisabledPluginIds(" ena-hk/3d-ena,unknown/plugin,ena-hk/3d-ena "), ["ena-hk/3d-ena"]);
  assert.deepEqual(parseOpenEnaDisabledPluginIds(undefined), []);
});

test("the interactive presenter routes standard 3D compilation through the trusted registry", () => {
  const source = readFileSync(join(projectRoot, "components", "open-ena", "OpenEnaInteractive3DPlot.tsx"), "utf8");
  assert.match(source, /compileOpenEnaTrusted3dPlugin\(\s*"ena-hk\/3d-ena"/u);
  assert.doesNotMatch(source, /return compileOpenEna3dPlotSpec\(/u);
});
