import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeDataset } from "../lib/open-ena/analyze";
import { parseCsv } from "../lib/open-ena/csv";
import {
  cameraForPreset,
  compileOpenEna3dPlotSpec,
} from "../lib/open-ena/plot3d";
import { SAMPLE_CONFIG } from "../lib/open-ena/types";

const projectRoot = process.cwd();

function threeDimensionalResult() {
  const dataset = parseCsv(
    [
      "unit,conversation,group,A,B,C",
      "u1,c1,first,1,1,0",
      "u2,c2,first,1,0,1",
      "u3,c3,second,0,1,1",
      "u4,c4,second,1,1,1",
      "",
    ].join("\n"),
    { name: "three-dimensional-contract.csv", source: "upload" },
  );
  return analyzeDataset(dataset, {
    ...SAMPLE_CONFIG,
    unitColumns: ["unit"],
    conversationColumns: ["conversation"],
    groupColumn: "group",
    codes: ["A", "B", "C"],
    window: "Conversation",
  });
}

function sixGroupTrajectoryResult() {
  const rows = ["unit,conversation,group,A,B,C"];
  for (let index = 0; index < 6; index += 1) {
    rows.push(`u${index + 1},c1,g${index + 1},1,1,0`);
    rows.push(`u${index + 1},c2,g${index + 1},0,1,1`);
  }
  const dataset = parseCsv(`${rows.join("\n")}\n`, {
    name: "six-group-3d-trajectories.csv",
    source: "upload",
  });
  return analyzeDataset(dataset, {
    ...SAMPLE_CONFIG,
    unitColumns: ["unit"],
    conversationColumns: ["conversation"],
    groupColumn: "group",
    codes: ["A", "B", "C"],
    model: "SeparateTrajectory",
    window: "Conversation",
    windowSizeForward: 0,
  });
}

test("the 3D compiler selects retained x/y/z coordinates without refitting or mutating the jENA result", () => {
  const result = threeDimensionalResult();
  const before = JSON.stringify(result);
  const [xDimension = "SVD1", yDimension = "SVD2", zDimension = "SVD3"] = result.dimensions;
  const spec = compileOpenEna3dPlotSpec({
    result,
    groupColumn: "group",
    xDimension,
    yDimension,
    zDimension,
    camera: "isometric",
    showPoints: true,
    showNetworks: true,
    showLabels: true,
    showUnitLabels: false,
    showVariance: true,
    showTrajectories: true,
    edgeScale: 1,
    edgeThreshold: 0,
    pointScale: 1,
    plotZoom: 1,
    flipX: false,
    flipY: false,
  });
  const pointTraces = spec.data.filter((trace) => trace.meta?.role === "unit-points");
  const renderedZ = pointTraces.flatMap((trace) => trace.z ?? []);
  const expectedZ = result.set.points.map((row) => Number(row[zDimension] ?? 0));

  assert.equal(JSON.stringify(result), before, "display compilation must not mutate or refit the scientific result");
  assert.ok(pointTraces.length >= 2, "grouped unit points should retain separate stable visual encodings");
  assert.deepEqual([...renderedZ].sort((a, b) => Number(a) - Number(b)), [...expectedZ].sort((a, b) => a - b));
  assert.ok(spec.data.some((trace) => trace.meta?.role === "code-node"));
  assert.ok(spec.data.some((trace) => trace.meta?.role === "network-edge"));
  assert.ok(spec.data.some((trace) => trace.meta?.role === "group-mean"));
  assert.equal(spec.layout.scene.xaxis.title.text, xDimension);
  assert.equal(spec.layout.scene.yaxis.title.text, yDimension);
  assert.equal(spec.layout.scene.zaxis.title.text, zDimension);
  assert.equal(spec.layout.scene.xaxis.color, "#b91c1c");
  assert.equal(spec.layout.scene.yaxis.color, "#1d4ed8");
  assert.equal(spec.layout.scene.zaxis.color, "#15803d");
  assert.equal(spec.layout.uirevision, "open-ena-3d-camera-v1");
  assert.equal(spec.config.responsive, true);
  assert.equal(spec.config.scrollZoom, true);
});

test("3D trajectories retain six stable non-color group encodings and all three fitted coordinates", () => {
  const result = sixGroupTrajectoryResult();
  const [xDimension = "SVD1", yDimension = "SVD2", zDimension = "SVD3"] = result.dimensions;
  const spec = compileOpenEna3dPlotSpec({
    result,
    groupColumn: "group",
    xDimension,
    yDimension,
    zDimension,
    camera: "isometric",
    showPoints: true,
    showNetworks: true,
    showLabels: true,
    showUnitLabels: false,
    showVariance: true,
    showTrajectories: true,
    edgeScale: 1,
    edgeThreshold: 0,
    pointScale: 1,
    plotZoom: 1,
    flipX: false,
    flipY: false,
  });
  const pointTraces = spec.data.filter((trace) => trace.meta.role === "unit-points");
  const trajectoryTraces = spec.data.filter((trace) => trace.meta.role === "trajectory-path");

  assert.equal(pointTraces.length, 6);
  assert.equal(new Set(pointTraces.map((trace) => trace.marker?.symbol)).size, 6);
  assert.equal(new Set(pointTraces.map((trace) => trace.meta.groupName)).size, 6);
  assert.equal(trajectoryTraces.length, 6);
  assert.ok(trajectoryTraces.every((trace) => trace.z.length === 2));
});

test("camera presets are explicit display-only orientations and the client plot owns the full interaction lifecycle", () => {
  assert.notDeepEqual(cameraForPreset("isometric"), cameraForPreset("xy"));
  assert.notDeepEqual(cameraForPreset("xy"), cameraForPreset("xz"));
  assert.notDeepEqual(cameraForPreset("xz"), cameraForPreset("yz"));

  const source = readFileSync(
    join(projectRoot, "components", "open-ena", "OpenEnaInteractive3DPlot.tsx"),
    "utf8",
  );
  assert.match(source, /import\("plotly\.js-dist-min"\)/);
  assert.match(source, /Plotly\.react\(/);
  assert.match(source, /Plotly\.purge\(/);
  assert.match(source, /"plotly_relayout"/);
  assert.match(source, /onCameraChange\?\.\(nextCamera\)/);
  assert.match(source, /initialCameraRef/);
  assert.match(source, /new ResizeObserver\(/);
  assert.match(source, /data-testid="open-ena-interactive-3d-plot"/);
  assert.match(source, /data-ena-dimensions="3"/);
  assert.match(source, /data-ena-interactive-camera="true"/);
  assert.match(source, /role="region"/);
  assert.match(source, /tabIndex=\{0\}/);

  const workspace = readFileSync(
    join(projectRoot, "components", "open-ena", "OpenEnaWorkspace.tsx"),
    "utf8",
  );
  assert.match(workspace, /initialCamera=\{interactive3dCamera\}/);
  assert.match(workspace, /onCameraChange=\{setInteractive3dCamera\}/);
  assert.match(workspace, /function selectCameraPreset/);
});
