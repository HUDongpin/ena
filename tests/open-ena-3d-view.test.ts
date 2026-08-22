import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeDataset } from "../lib/open-ena/analyze";
import { parseCsv } from "../lib/open-ena/csv";
import {
  cameraForPreset,
  compileOpenEna3dPlotSpec,
  type OpenEna3dPlotKind,
} from "../lib/open-ena/plot3d";
import { buildPairwiseGroupContrast } from "../lib/open-ena/contrasts";
import { SAMPLE_CONFIG, type OpenEnaConfig } from "../lib/open-ena/types";

const projectRoot = process.cwd();

const THREE_DIMENSIONAL_CONFIG: OpenEnaConfig = {
  ...SAMPLE_CONFIG,
  unitColumns: ["unit"],
  conversationColumns: ["conversation"],
  groupColumn: "group",
  codes: ["A", "B", "C"],
  window: "Conversation",
};

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
  return analyzeDataset(dataset, THREE_DIMENSIONAL_CONFIG);
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
  const axisShafts = spec.data.filter((trace) => trace.meta.role === "axis");
  const axisArrowheads = spec.data.filter((trace) => trace.meta.role === "axis-arrowhead");
  const axisLabels = spec.data.filter((trace) => trace.meta.role === "axis-label");
  assert.equal(axisShafts.length, 3);
  assert.equal(axisArrowheads.length, 3);
  assert.equal(axisLabels.length, 3);
  assert.deepEqual(axisArrowheads.map((trace) => trace.type), ["cone", "cone", "cone"]);
  assert.deepEqual(axisArrowheads.map((trace) => trace.meta.axis), ["x", "y", "z"]);
  assert.deepEqual(axisArrowheads.map((trace) => trace.meta.dimension), [xDimension, yDimension, zDimension]);
  assert.deepEqual(axisArrowheads.map((trace) => [trace.u, trace.v, trace.w]), [
    [[1], [0], [0]],
    [[0], [1], [0]],
    [[0], [0], [1]],
  ]);
  axisArrowheads.forEach((arrowhead, index) => {
    const shaft = axisShafts[index];
    const label = axisLabels[index];
    assert.ok(shaft);
    assert.ok(label);
    const tip = (arrowhead.x[0] || arrowhead.y[0] || arrowhead.z[0]) as number;
    const shaftEnd = (shaft.x[1] || shaft.y[1] || shaft.z[1]) as number;
    const labelPosition = (label.x[0] || label.y[0] || label.z[0]) as number;
    assert.equal(shaftEnd, tip * 0.88);
    assert.equal(labelPosition, tip * 1.08);
    assert.equal(arrowhead.anchor, "tip");
    assert.equal(arrowhead.sizemode, "absolute");
    assert.equal(arrowhead.sizeref, tip * 0.1);
    assert.deepEqual(arrowhead.colorscale, [
      [0, ["#b91c1c", "#1d4ed8", "#15803d"][index]],
      [1, ["#b91c1c", "#1d4ed8", "#15803d"][index]],
    ]);
    assert.equal(arrowhead.showscale, false);
    assert.equal(arrowhead.hoverinfo, "skip");
    assert.equal(arrowhead.showlegend, false);
    assert.equal(label.text?.[0], [xDimension, yDimension, zDimension][index]);
  });
  assert.equal(spec.layout.scene.xaxis.title.text, xDimension);
  assert.equal(spec.layout.scene.yaxis.title.text, yDimension);
  assert.equal(spec.layout.scene.zaxis.title.text, zDimension);
  assert.equal(spec.layout.scene.xaxis.color, "#b91c1c");
  assert.equal(spec.layout.scene.yaxis.color, "#1d4ed8");
  assert.equal(spec.layout.scene.zaxis.color, "#15803d");
  assert.equal(spec.layout.paper_bgcolor, "#ffffff");
  assert.equal(spec.layout.plot_bgcolor, "#ffffff");
  assert.equal(spec.layout.scene.bgcolor, "#ffffff");
  assert.equal(spec.layout.uirevision, "open-ena-3d-camera-v1");
  assert.equal(spec.config.responsive, true);
  assert.equal(spec.config.scrollZoom, true);
});

test("3D axis arrows keep physical directions when dimensions are remapped or display axes are flipped", () => {
  const result = threeDimensionalResult();
  const [first = "SVD1", second = "SVD2", third = "SVD3"] = result.dimensions;
  const compile = (flipX: boolean, flipY: boolean) => compileOpenEna3dPlotSpec({
    result,
    groupColumn: "group",
    xDimension: second,
    yDimension: third,
    zDimension: first,
    camera: "isometric",
    showPoints: true,
    showNetworks: true,
    showLabels: false,
    showUnitLabels: false,
    showVariance: false,
    showTrajectories: true,
    edgeScale: 1,
    edgeThreshold: 0,
    pointScale: 1,
    plotZoom: 1,
    flipX,
    flipY,
  });
  const standard = compile(false, false);
  const flipped = compile(true, true);
  const structuralTraces = (spec: ReturnType<typeof compileOpenEna3dPlotSpec>) => spec.data.filter(
    (trace) => ["axis", "axis-arrowhead", "axis-label"].includes(trace.meta.role),
  );
  const arrowheads = standard.data.filter((trace) => trace.meta.role === "axis-arrowhead");
  const labels = standard.data.filter((trace) => trace.meta.role === "axis-label");

  assert.deepEqual(arrowheads.map((trace) => trace.meta.dimension), [second, third, first]);
  assert.deepEqual(labels.map((trace) => trace.text), [[second], [third], [first]]);
  assert.deepEqual(arrowheads.map((trace) => [trace.u, trace.v, trace.w]), [
    [[1], [0], [0]],
    [[0], [1], [0]],
    [[0], [0], [1]],
  ]);
  assert.ok(structuralTraces(standard).every((trace) => trace.hoverinfo === "skip" && !trace.customdata));
  assert.deepEqual(structuralTraces(flipped), structuralTraces(standard));
  assert.equal(standard.layout.scene.xaxis.autorange, false);
  assert.equal(standard.layout.scene.yaxis.autorange, false);
  assert.deepEqual(flipped.layout.scene.xaxis.range, [...standard.layout.scene.xaxis.range].reverse());
  assert.deepEqual(flipped.layout.scene.yaxis.range, [...standard.layout.scene.yaxis.range].reverse());
  assert.deepEqual(flipped.layout.scene.zaxis.range, standard.layout.scene.zaxis.range);
});

test("3D pairwise compilation gives Comparison, Primary, and Secondary distinct roles in one fitted frame", () => {
  const result = threeDimensionalResult();
  const [xDimension = "SVD1", yDimension = "SVD2", zDimension = "SVD3"] = result.dimensions;
  const contrast = buildPairwiseGroupContrast(
    result,
    THREE_DIMENSIONAL_CONFIG,
    "second",
    "first",
    [xDimension, yDimension],
    "2026-08-22T00:00:00.000Z",
  );
  const beforeResult = JSON.stringify(result);
  const beforeContrast = JSON.stringify(contrast);
  const compile = (plotKind: OpenEna3dPlotKind) => compileOpenEna3dPlotSpec({
    result,
    contrast,
    plotKind,
    compact: plotKind !== "comparison",
    displayModeBar: plotKind === "comparison",
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
    showTrajectories: false,
    edgeScale: 1,
    edgeThreshold: 0,
    pointScale: 1,
    plotZoom: 1,
    flipX: false,
    flipY: false,
  });
  const comparison = compile("comparison");
  const primary = compile("primary");
  const secondary = compile("secondary");
  const roleGroups = (spec: ReturnType<typeof compileOpenEna3dPlotSpec>, role: string) => spec.data
    .filter((trace) => trace.meta.role === role)
    .map((trace) => trace.meta.groupName);
  const structural = (spec: ReturnType<typeof compileOpenEna3dPlotSpec>) => spec.data
    .filter((trace) => ["code-node", "axis", "axis-arrowhead", "axis-label"].includes(trace.meta.role))
    .map((trace) => ({
      role: trace.meta.role,
      x: trace.x,
      y: trace.y,
      z: trace.z,
      u: trace.u,
      v: trace.v,
      w: trace.w,
      dimension: trace.meta.dimension,
    }));

  assert.equal(JSON.stringify(result), beforeResult, "3D display compilation must not mutate the fitted jENA result");
  assert.equal(JSON.stringify(contrast), beforeContrast, "3D display compilation must not mutate the selected contrast");
  assert.deepEqual(roleGroups(comparison, "unit-points"), ["second", "first"]);
  assert.deepEqual(roleGroups(comparison, "group-mean"), ["second", "first"]);
  assert.deepEqual(roleGroups(primary, "unit-points"), []);
  assert.deepEqual(roleGroups(secondary, "unit-points"), []);
  assert.deepEqual(roleGroups(primary, "group-mean"), []);
  assert.deepEqual(roleGroups(secondary, "group-mean"), []);
  assert.ok(primary.data.filter((trace) => trace.meta.role === "network-edge")
    .every((trace) => trace.meta.groupName === "second"));
  assert.ok(secondary.data.filter((trace) => trace.meta.role === "network-edge")
    .every((trace) => trace.meta.groupName === "first"));
  assert.ok(comparison.data.every((trace) => trace.meta.plotKind === "comparison"));
  assert.ok(primary.data.every((trace) => trace.meta.plotKind === "primary"));
  assert.ok(secondary.data.every((trace) => trace.meta.plotKind === "secondary"));
  assert.deepEqual(structural(primary), structural(comparison));
  assert.deepEqual(structural(secondary), structural(comparison));
  assert.deepEqual(primary.layout.scene.xaxis.range, comparison.layout.scene.xaxis.range);
  assert.deepEqual(primary.layout.scene.yaxis.range, comparison.layout.scene.yaxis.range);
  assert.deepEqual(primary.layout.scene.zaxis.range, comparison.layout.scene.zaxis.range);
  assert.deepEqual(secondary.layout.scene.xaxis.range, comparison.layout.scene.xaxis.range);
  assert.deepEqual(secondary.layout.scene.yaxis.range, comparison.layout.scene.yaxis.range);
  assert.deepEqual(secondary.layout.scene.zaxis.range, comparison.layout.scene.zaxis.range);
  assert.equal(comparison.config.displayModeBar, true);
  assert.equal(primary.config.displayModeBar, false);
  assert.equal(secondary.config.scrollZoom, false);
  assert.equal(primary.layout.scene.dragmode, false);
});

test("3D Comparison uses signed differences while side plots share one mean-network denominator", () => {
  const result = threeDimensionalResult();
  const [xDimension = "SVD1", yDimension = "SVD2", zDimension = "SVD3"] = result.dimensions;
  const contrast = buildPairwiseGroupContrast(
    result,
    THREE_DIMENSIONAL_CONFIG,
    "first",
    "second",
    [xDimension, yDimension],
    "2026-08-22T00:00:00.000Z",
  );
  const common = {
    result,
    contrast,
    groupColumn: "group",
    xDimension,
    yDimension,
    zDimension,
    camera: "isometric" as const,
    showPoints: true,
    showNetworks: true,
    showLabels: true,
    showUnitLabels: false,
    showVariance: true,
    showTrajectories: false,
    edgeScale: 1,
    edgeThreshold: 0,
    pointScale: 1,
    plotZoom: 1,
    flipX: false,
    flipY: false,
  };
  const comparison = compileOpenEna3dPlotSpec({ ...common, plotKind: "comparison" });
  const primary = compileOpenEna3dPlotSpec({ ...common, plotKind: "primary", compact: true });
  const secondary = compileOpenEna3dPlotSpec({ ...common, plotKind: "secondary", compact: true });
  const edges = (spec: ReturnType<typeof compileOpenEna3dPlotSpec>) => spec.data
    .filter((trace) => trace.meta.role === "network-edge");
  const contrastEdgeByName = new Map(contrast.edges.map((edge) => [edge.name, edge]));

  edges(comparison).forEach((trace) => {
    const expected = contrastEdgeByName.get(trace.meta.edgeName ?? "");
    assert.ok(expected);
    assert.equal(trace.meta.edgeValue, expected.signedDifference);
    assert.equal(trace.meta.edgeScaleDenominator, Math.max(1e-12, contrast.edgeScaleDenominators.difference));
    assert.equal(trace.meta.groupName, expected.signedDifference >= 0 ? contrast.primary.name : contrast.secondary.name);
  });
  edges(primary).forEach((trace) => {
    const expected = contrastEdgeByName.get(trace.meta.edgeName ?? "");
    assert.ok(expected);
    assert.equal(trace.meta.edgeValue, expected.primaryWeight);
    assert.equal(trace.meta.edgeScaleDenominator, Math.max(1e-12, contrast.edgeScaleDenominators.sharedMean));
  });
  edges(secondary).forEach((trace) => {
    const expected = contrastEdgeByName.get(trace.meta.edgeName ?? "");
    assert.ok(expected);
    assert.equal(trace.meta.edgeValue, expected.secondaryWeight);
    assert.equal(trace.meta.edgeScaleDenominator, Math.max(1e-12, contrast.edgeScaleDenominators.sharedMean));
  });
  assert.deepEqual(
    new Set(edges(primary).map((trace) => trace.meta.edgeScaleDenominator)),
    new Set(edges(secondary).map((trace) => trace.meta.edgeScaleDenominator)),
  );
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
  const cameraPresets = ["isometric", "xy", "xz", "yz", "yx", "zx", "zy"] as const;
  assert.equal(
    new Set(cameraPresets.map((preset) => JSON.stringify(cameraForPreset(preset)))).size,
    cameraPresets.length,
    "all seven reference camera positions must produce distinct Plotly cameras",
  );
  assert.equal(cameraForPreset("isometric").projection.type, "perspective");
  for (const preset of cameraPresets.slice(1)) {
    assert.equal(cameraForPreset(preset).projection.type, "orthographic");
  }

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
  assert.match(source, /getCamera\?\.\(\)/);
  assert.match(source, /onCameraChange\?\.\(runtimeCamera\)/);
  assert.match(source, /new ResizeObserver\(/);
  assert.match(source, /Promise\.resolve\(Plotly\.Plots\.resize\(plotRoot\)\)\.catch/);
  assert.match(source, /testId = plotKind === "comparison"/);
  assert.match(source, /data-ena-dimensions="3"/);
  assert.match(source, /data-ena-interactive-camera="true"/);
  assert.match(source, /role="region"/);
  assert.match(source, /tabIndex=\{0\}/);
  assert.match(source, /Plotly\.relayout\(/);
  assert.match(source, /controlledCameraKey/);

  const groupContrast3d = readFileSync(
    join(projectRoot, "components", "open-ena", "OpenEna3DGroupContrast.tsx"),
    "utf8",
  );
  assert.match(groupContrast3d, /data-testid="open-ena-3d-group-contrast"/);
  assert.match(groupContrast3d, /data-testid="open-ena-3d-comparison-plot"/);
  assert.match(groupContrast3d, /data-testid="open-ena-3d-primary-plot"/);
  assert.match(groupContrast3d, /data-testid="open-ena-3d-secondary-plot"/);
  assert.match(groupContrast3d, /<h3>Comparison Plot <small>3D<\/small><\/h3>/);
  assert.match(groupContrast3d, /<h3>Primary Plot <small>3D<\/small><\/h3>/);
  assert.match(groupContrast3d, /<h3>Secondary Plot <small>3D<\/small><\/h3>/);
  assert.match(groupContrast3d, /plotKind="comparison"/);
  assert.match(groupContrast3d, /plotKind="primary"/);
  assert.match(groupContrast3d, /plotKind="secondary"/);
  assert.match(groupContrast3d, /displayModeBar=\{false\}/);

  const workspace = readFileSync(
    join(projectRoot, "components", "open-ena", "OpenEnaWorkspace.tsx"),
    "utf8",
  );
  assert.match(workspace, /initialCamera=\{interactive3dCamera\}/);
  assert.match(workspace, /onCameraChange=\{setInteractive3dCamera\}/);
  assert.match(workspace, /view === "3d" && activeGroupContrast && resultConfig\?\.groupColumn/);
  assert.match(workspace, /<OpenEna3DGroupContrast/);
  assert.match(workspace, /sharedCamera=\{interactive3dCamera\}/);
  assert.match(workspace, /function selectCameraPreset/);
  assert.match(workspace, /function selectAxisDimension/);
  assert.match(workspace, /setters\[occupiedAxis\]\(previousDimension\)/);
  assert.match(workspace, /data-testid="open-ena-3d-display-controls"/);
  assert.match(workspace, /data-testid="open-ena-3d-camera-position"/);
  assert.match(workspace, /open-ena-3d-axis-\$\{axis\}/);
  assert.match(workspace, /\["isometric", copy\.plot\.default3dCamera\]/);
  assert.match(workspace, /\["yx", copy\.plot\.yx\]/);
  assert.match(workspace, /\["zx", copy\.plot\.zx\]/);
  assert.match(workspace, /\["zy", copy\.plot\.zy\]/);

  const styles = readFileSync(join(projectRoot, "app", "globals.css"), "utf8");
  assert.match(styles, /\.ena-visual-workspace\[data-ena-view="3d"\][\s\S]*?background: #fff;/);
  assert.match(styles, /\.open-ena-interactive-3d-region[\s\S]*?background: #fff;/);
  assert.match(styles, /\.open-ena-interactive-3d-canvas[\s\S]*?background: #fff;/);
  assert.match(styles, /\.open-ena-3d-triptych-layout[\s\S]*?grid-template-columns: minmax\(0, 2fr\) minmax\(290px, 1fr\)/);
  assert.match(styles, /\.open-ena-3d-triptych-sides[\s\S]*?grid-template-rows: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*?\.open-ena-3d-triptych-sides[\s\S]*?grid-template-columns: 1fr/);
});
