import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import OpenEna3DGroupContrast from "../components/open-ena/OpenEna3DGroupContrast";
import OpenEnaInteractive3DPlot, {
  OPEN_ENA_3D_CAMERA_ZOOM_STEP,
  openEna3dFullscreenMode,
  resetOpenEna3dCameraDistance,
  zoomOpenEna3dAspectRatio,
  zoomOpenEna3dCamera,
} from "../components/open-ena/OpenEnaInteractive3DPlot";
import { analyzeDataset } from "../lib/open-ena/analyze";
import {
  openEnaDataViewAvailability,
  openEnaDataViewCenterSurface,
  openEnaDataViewUnavailableCopy,
} from "../lib/open-ena/capabilities";
import { parseCsv } from "../lib/open-ena/csv";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";
import {
  OPEN_ENA_3D_DEFAULT_CAMERA_ZOOM,
  cameraForPreset,
  compileOpenEna3dPlotSpec,
  type OpenEna3dPlotKind,
} from "../lib/open-ena/plot3d";
import { buildPairwiseGroupContrast } from "../lib/open-ena/contrasts";
import {
  DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS,
  deriveOpenEnaGroupDisplay,
  openEnaGroupUnitKey,
} from "../lib/open-ena/group-display";
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

function renderThreeDimensionalGroupContrast(
  centerMode: "plot" | "data",
  dataView?: ReactNode,
) {
  return renderToStaticMarkup(createElement(
    OpenEna3DGroupContrast,
    threeDimensionalGroupContrastProps(centerMode, dataView),
  ));
}

function threeDimensionalGroupContrastProps(
  centerMode: "plot" | "data",
  dataView?: ReactNode,
) {
  const result = threeDimensionalResult();
  const [xDimension = "SVD1", yDimension = "SVD2", zDimension = "SVD3"] = result.dimensions;
  const contrast = buildPairwiseGroupContrast(
    result,
    THREE_DIMENSIONAL_CONFIG,
    "first",
    "second",
    [xDimension, yDimension],
    "2026-08-29T00:00:00.000Z",
  );
  return {
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
    edgeScale: 1,
    edgeThreshold: 0,
    pointScale: 1,
    plotZoom: 1,
    flipX: false,
    flipY: false,
    centerMode,
    dataView,
    copy: getOpenEnaCopy("en"),
  };
}

function genericThreeDimensionalPlotProps(testId = "open-ena-generic-3d") {
  const result = threeDimensionalResult();
  const [xDimension = "SVD1", yDimension = "SVD2", zDimension = "SVD3"] = result.dimensions;
  return {
    result,
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
    testId,
    copy: getOpenEnaCopy("en"),
  };
}

function confidenceReadyThreeDimensionalResult() {
  const rows = ["unit,conversation,group,A,B,C"];
  const patterns = [
    [1, 1, 0],
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, 1],
  ];
  for (const group of ["first", "second"]) {
    patterns.forEach((pattern, index) => {
      rows.push(`${group}-${index + 1},c${index + 1},${group},${pattern.join(",")}`);
    });
  }
  const dataset = parseCsv(`${rows.join("\n")}\n`, {
    name: "three-dimensional-confidence-contract.csv",
    source: "upload",
  });
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
  assert.equal(spec.layout.uirevision, "open-ena-3d-camera-v2");
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
  assert.deepEqual(primary.layout.scene.camera, comparison.layout.scene.camera);
  assert.deepEqual(secondary.layout.scene.camera, comparison.layout.scene.camera);
  assert.equal(comparison.config.displayModeBar, true);
  assert.equal(primary.config.displayModeBar, false);
  assert.equal(secondary.config.scrollZoom, false);
  assert.equal(primary.layout.scene.dragmode, false);
});

test("3D unit observations stay circular while group means use square summary markers", () => {
  const result = threeDimensionalResult();
  const [xDimension = "SVD1", yDimension = "SVD2", zDimension = "SVD3"] = result.dimensions;
  const contrast = buildPairwiseGroupContrast(
    result,
    THREE_DIMENSIONAL_CONFIG,
    "first",
    "second",
    [xDimension, yDimension],
    "2026-08-24T00:00:00.000Z",
  );
  const spec = compileOpenEna3dPlotSpec({
    result,
    contrast,
    plotKind: "comparison",
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
  const means = spec.data.filter((trace) => trace.meta.role === "group-mean");

  assert.equal(means.length, 2);
  assert.deepEqual(means.map((trace) => trace.marker?.symbol), ["square", "square"]);
  assert.deepEqual(means.map((trace) => trace.meta.markerSymbol), ["square", "square"]);
  assert.ok(means.every((trace) => trace.name.endsWith("mean · square")));
  assert.deepEqual(
    spec.data.filter((trace) => trace.meta.role === "unit-points").map((trace) => trace.marker?.symbol),
    ["circle", "circle"],
    "group identity is encoded by color while every analytic-unit observation remains a circle",
  );
});

test("pairwise contrast freezes marginal Student-t intervals for every fitted dimension", () => {
  const result = confidenceReadyThreeDimensionalResult();
  const [xDimension = "SVD1", yDimension = "SVD2"] = result.dimensions;
  const contrast = buildPairwiseGroupContrast(
    result,
    THREE_DIMENSIONAL_CONFIG,
    "first",
    "second",
    [xDimension, yDimension],
    "2026-08-24T00:00:00.000Z",
  );
  type IntervalRecord = Record<string, { status: string; lower?: number; upper?: number }>;
  const primaryIntervals = (contrast.primary as typeof contrast.primary & {
    meanConfidenceIntervalsByDimension?: IntervalRecord;
  }).meanConfidenceIntervalsByDimension;
  const secondaryIntervals = (contrast.secondary as typeof contrast.secondary & {
    meanConfidenceIntervalsByDimension?: IntervalRecord;
  }).meanConfidenceIntervalsByDimension;

  assert.deepEqual(Object.keys(contrast.primary.meanPoint), result.dimensions);
  assert.deepEqual(Object.keys(contrast.secondary.meanPoint), result.dimensions);
  assert.deepEqual(Object.keys(primaryIntervals ?? {}), result.dimensions);
  assert.deepEqual(Object.keys(secondaryIntervals ?? {}), result.dimensions);
  for (const dimension of result.dimensions) {
    assert.equal(primaryIntervals?.[dimension]?.status, "estimable");
    assert.equal(secondaryIntervals?.[dimension]?.status, "estimable");
  }
});

test("3D comparison renders dashed three-axis marginal CI wireframes while compact side plots omit them", () => {
  const result = confidenceReadyThreeDimensionalResult();
  const [xDimension = "SVD1", yDimension = "SVD2", zDimension = "SVD3"] = result.dimensions;
  const contrast = buildPairwiseGroupContrast(
    result,
    THREE_DIMENSIONAL_CONFIG,
    "first",
    "second",
    [xDimension, yDimension],
    "2026-08-24T00:00:00.000Z",
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
  const intervalTraces = comparison.data.filter(
    (trace) => (trace.meta.role as string) === "confidence-interval",
  );

  assert.ok(intervalTraces.length >= 2, "the central 3D comparison must render both groups' CI wireframes");
  assert.deepEqual(
    new Set(intervalTraces.map((trace) => trace.meta.groupName)),
    new Set([contrast.primary.name, contrast.secondary.name]),
  );
  assert.ok(intervalTraces.every((trace) => trace.mode === "lines"));
  assert.ok(intervalTraces.every((trace) => trace.line?.dash === "dash"));
  assert.ok(intervalTraces.every((trace) => trace.showlegend === false));
  assert.equal(
    primary.data.filter((trace) => (trace.meta.role as string) === "confidence-interval").length,
    0,
    "compact group-network side plots stay visually focused on their mean networks",
  );
});

test("3D comparison shares per-unit hiding and independent Mean/CI settings with the 2D presenter", () => {
  const result = confidenceReadyThreeDimensionalResult();
  const [xDimension = "SVD1", yDimension = "SVD2", zDimension = "SVD3"] = result.dimensions;
  const contrast = buildPairwiseGroupContrast(
    result,
    THREE_DIMENSIONAL_CONFIG,
    "first",
    "second",
    [xDimension, yDimension],
    "2026-08-29T04:30:00.000Z",
  );
  const settingsByGroup = {
    first: {
      ...DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS,
      showConfidenceIntervals: false,
    },
    second: { ...DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS },
  };
  const groupDisplay = deriveOpenEnaGroupDisplay({
    result,
    contrast,
    settingsByGroup,
    hiddenUnitKeys: [openEnaGroupUnitKey("first", "first-1")],
  });
  const compile = (display: typeof groupDisplay) => compileOpenEna3dPlotSpec({
    result,
    contrast: display.contrast,
    groupDisplay: display,
    plotKind: "comparison",
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
  } as Parameters<typeof compileOpenEna3dPlotSpec>[0]);
  const ciOff = compile(groupDisplay);
  const fullPopulation = compile(deriveOpenEnaGroupDisplay({
    result,
    contrast,
    settingsByGroup,
    hiddenUnitKeys: [],
  }));
  const pointTraces = ciOff.data.filter((trace) => trace.meta.role === "unit-points");

  assert.deepEqual(pointTraces.map((trace) => trace.x.length), [3, 4]);
  assert.deepEqual(ciOff.layout.scene.xaxis.range, fullPopulation.layout.scene.xaxis.range);
  assert.deepEqual(ciOff.layout.scene.yaxis.range, fullPopulation.layout.scene.yaxis.range);
  assert.deepEqual(ciOff.layout.scene.zaxis.range, fullPopulation.layout.scene.zaxis.range);
  assert.ok(pointTraces.every((trace) => trace.marker?.symbol === "circle"));
  assert.deepEqual(
    ciOff.data.filter((trace) => trace.meta.role === "confidence-interval").map((trace) => trace.meta.groupName),
    Array.from({ length: 6 }, () => "second"),
    "the first group CI is hidden while the second group keeps its six-edge 3D wireframe",
  );
  assert.deepEqual(
    ciOff.data.filter((trace) => trace.meta.role === "group-mean").map((trace) => trace.meta.groupName),
    ["first", "second"],
  );

  const meanOff = compile(deriveOpenEnaGroupDisplay({
    result,
    contrast,
    settingsByGroup: {
      ...settingsByGroup,
      first: { ...settingsByGroup.first, showMean: false, showConfidenceIntervals: true },
    },
    hiddenUnitKeys: [openEnaGroupUnitKey("first", "first-1")],
  }));
  assert.deepEqual(
    meanOff.data.filter((trace) => trace.meta.role === "group-mean").map((trace) => trace.meta.groupName),
    ["second"],
  );
  assert.ok(meanOff.data
    .filter((trace) => trace.meta.role === "confidence-interval")
    .every((trace) => trace.meta.groupName === "second"));
  assert.ok(meanOff.data.every((trace) => String(trace.meta.role) !== "outlier-interval"));

  const primaryPointsOff = compile(deriveOpenEnaGroupDisplay({
    result,
    contrast,
    settingsByGroup: {
      ...settingsByGroup,
      first: { ...settingsByGroup.first, showUnitPoints: false },
    },
    hiddenUnitKeys: [],
  }));
  assert.ok(primaryPointsOff.data
    .filter((trace) => trace.meta.role === "unit-points")
    .every((trace) => trace.meta.groupName === "second"));
  assert.equal(
    primaryPointsOff.data.find((trace) => trace.meta.role === "group-mean" && trace.meta.groupName === "first")?.showlegend,
    true,
    "a group mean must carry the legend when that group's unit trace is not plotted",
  );
});

test("3D display-derived confidence wireframes expand the canonical frame instead of clipping a two-unit summary", () => {
  const result = confidenceReadyThreeDimensionalResult();
  const [xDimension = "SVD1", yDimension = "SVD2", zDimension = "SVD3"] = result.dimensions;
  const contrast = buildPairwiseGroupContrast(
    result,
    THREE_DIMENSIONAL_CONFIG,
    "first",
    "second",
    [xDimension, yDimension],
    "2026-08-30T03:30:00.000Z",
  );
  const hiddenUnitKeys = contrast.primary.unitIds
    .filter((unitId) => !["first-1", "first-4"].includes(unitId))
    .map((unitId) => openEnaGroupUnitKey("first", unitId));
  const display = deriveOpenEnaGroupDisplay({
    result,
    contrast,
    settingsByGroup: {},
    hiddenUnitKeys,
  });
  const spec = compileOpenEna3dPlotSpec({
    result,
    contrast: display.contrast,
    groupDisplay: display,
    plotKind: "comparison",
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
  const primaryWireframe = spec.data.filter((trace) => (
    trace.meta.role === "confidence-interval" && trace.meta.groupName === "first"
  ));
  assert.equal(primaryWireframe.length, 6, "the two-unit display summary must retain its complete CI wireframe");

  const axes = [
    { values: primaryWireframe.flatMap((trace) => trace.x), range: spec.layout.scene.xaxis.range },
    { values: primaryWireframe.flatMap((trace) => trace.y), range: spec.layout.scene.yaxis.range },
    { values: primaryWireframe.flatMap((trace) => trace.z), range: spec.layout.scene.zaxis.range },
  ];
  axes.forEach(({ values, range }) => {
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    assert.ok(range[0] <= minimum, `scene lower bound ${range[0]} clips CI coordinate ${minimum}`);
    assert.ok(range[1] >= maximum, `scene upper bound ${range[1]} clips CI coordinate ${maximum}`);
  });
});

test("3D confidence wireframes have an exact non-visual interval table", () => {
  const result = confidenceReadyThreeDimensionalResult();
  const [xDimension = "SVD1", yDimension = "SVD2", zDimension = "SVD3"] = result.dimensions;
  const contrast = buildPairwiseGroupContrast(
    result,
    THREE_DIMENSIONAL_CONFIG,
    "first",
    "second",
    [xDimension, yDimension],
    "2026-08-24T00:00:00.000Z",
  );
  const markup = renderToStaticMarkup(createElement(OpenEna3DGroupContrast, {
    result,
    contrast,
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
    edgeScale: 1,
    edgeThreshold: 0,
    pointScale: 1,
    plotZoom: 1,
    flipX: false,
    flipY: false,
    centerMode: "plot",
    copy: getOpenEnaCopy("en"),
  }));

  assert.match(markup, /data-ena-3d-confidence-interval-table="true"/);
  assert.equal([...markup.matchAll(/data-ena-3d-confidence-interval-row="true"/gu)].length, 6);
  assert.match(markup, /Separate marginal 95% Student-t confidence intervals/);
  assert.match(markup, /not a joint confidence region or significance test/i);
  assert.match(markup, /endpoint analytic units/i);
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

test("generic 3D ENA plots retain networks and points but fail closed on legacy trajectory flags", () => {
  const result = sixGroupTrajectoryResult();
  const [xDimension = "SVD1", yDimension = "SVD2", zDimension = "SVD3"] = result.dimensions;
  const compile = (showTrajectories: boolean) => compileOpenEna3dPlotSpec({
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
    showTrajectories,
    edgeScale: 1,
    edgeThreshold: 0,
    pointScale: 1,
    plotZoom: 1,
    flipX: false,
    flipY: false,
  });
  const spec = compile(true);
  const pointTraces = spec.data.filter((trace) => trace.meta.role === "unit-points");
  const trajectoryTraces = spec.data.filter((trace) => trace.meta.role === "trajectory-path");

  assert.deepEqual(spec, compile(false), "the read-compatible trajectory flag must be a 3D presenter no-op");
  assert.equal(pointTraces.length, 6);
  assert.deepEqual(
    pointTraces.map((trace) => trace.marker?.symbol),
    ["circle", "square", "diamond", "cross", "x", "circle-open"],
    "generic multi-group 3D keeps a redundant non-color group encoding while pairwise comparison units stay circular",
  );
  assert.equal(new Set(pointTraces.map((trace) => trace.meta.groupName)).size, 6);
  assert.equal(trajectoryTraces.length, 0);
  assert.ok(spec.data.some((trace) => trace.meta.role === "network-edge"));
  assert.ok(spec.data.some((trace) => trace.meta.role === "code-node"));
  assert.ok(spec.data.some((trace) => trace.meta.role === "group-mean"));
  assert.ok(pointTraces.every((trace) => trace.marker?.color !== "#000000"));
});

test("camera presets are explicit display-only orientations and the client plot owns the full interaction lifecycle", () => {
  const cameraPresets = ["isometric", "xy", "xz", "yz", "yx", "zx", "zy"] as const;
  const defaultCamera = cameraForPreset("isometric");
  const previousDistance = Math.hypot(1.45, 1.45, 1.25);
  const currentDistance = Math.hypot(defaultCamera.eye.x, defaultCamera.eye.y, defaultCamera.eye.z);

  assert.equal(OPEN_ENA_3D_DEFAULT_CAMERA_ZOOM, 1.5);
  assert.deepEqual(defaultCamera.eye, { x: 1.45 / 1.5, y: 1.45 / 1.5, z: 1.25 / 1.5 });
  assert.ok(
    Math.abs(previousDistance / currentDistance - OPEN_ENA_3D_DEFAULT_CAMERA_ZOOM) < 1e-12,
    "the default isometric camera must begin at 1.5x visual zoom without changing fitted coordinates",
  );
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
  assert.match(groupContrast3d, /centerMode: "plot" \| "data";/);
  assert.match(groupContrast3d, /dataView\?: ReactNode;/);
  assert.match(groupContrast3d, /data-testid="open-ena-3d-center-surface"/);

  const workspace = readFileSync(
    join(projectRoot, "components", "open-ena", "OpenEnaWorkspace.tsx"),
    "utf8",
  );
  assert.match(workspace, /initialCamera=\{interactive3dCamera\}/);
  assert.match(workspace, /onCameraChange=\{setInteractive3dCamera\}/);
  assert.match(workspace, /initialAspectRatio=\{interactive3dAspectRatio\}/);
  assert.match(workspace, /onAspectRatioChange=\{setInteractive3dAspectRatio\}/);
  assert.match(workspace, /view === "3d" && threeDDimensions && activeGroupContrast && activeGroupDisplay && resultConfig\?\.groupColumn/);
  assert.match(workspace, /<OpenEna3DGroupContrast/);
  assert.match(workspace, /sharedCamera=\{interactive3dCamera\}/);
  assert.match(workspace, /sharedAspectRatio=\{interactive3dAspectRatio\}/);
  assert.match(workspace, /function selectCameraPreset/);
  assert.match(workspace, /function selectAxisDimension/);
  assert.match(workspace, /updateOpenEnaWorkspace3dAxis\(\{/);
  assert.match(workspace, /threeD: threeDDimensions/);
  assert.match(workspace, /setThreeDDimensions\(next\.threeD\)/);
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

test("3D plot mode keeps Comparison, Primary, and Secondary inside one stable center layout", () => {
  const markup = renderThreeDimensionalGroupContrast("plot");

  assert.match(markup, /data-testid="open-ena-3d-center-surface"[^>]*data-ena-center-mode="plot"/);
  assert.match(markup, /data-testid="open-ena-3d-comparison-plot"/);
  assert.match(markup, /data-testid="open-ena-3d-primary-plot"/);
  assert.match(markup, /data-testid="open-ena-3d-secondary-plot"/);
  assert.doesNotMatch(markup, /data-testid="open-ena-3d-data-view"/);
});

test("3D data mode leaves landmark semantics to the provided Data View", () => {
  const markup = renderThreeDimensionalGroupContrast(
    "data",
    createElement(
      "section",
      { "data-testid": "fixture-3d-data-view", "aria-label": "Fixture Data View" },
      createElement("table", null,
        createElement("tbody", null,
          createElement("tr", null, createElement("td", null, "Data record")))),
    ),
  );
  const dataViewCard = markup.match(/<[^>]*data-testid="open-ena-3d-data-view"[^>]*>/)?.[0] ?? "";

  assert.match(markup, /data-testid="open-ena-3d-center-surface"[^>]*data-ena-center-mode="data"/);
  assert.ok(dataViewCard, "data mode must render its center card");
  assert.doesNotMatch(dataViewCard, /\srole=|\saria-label=/);
  assert.match(markup, /data-testid="fixture-3d-data-view"/);
  assert.doesNotMatch(markup, /data-testid="open-ena-3d-comparison-plot"/);
  assert.match(markup, /data-testid="open-ena-3d-primary-plot"/);
  assert.match(markup, /data-testid="open-ena-3d-secondary-plot"/);
});

test("3D data mode fails closed with a status message instead of adding a fallback landmark", () => {
  const markup = renderThreeDimensionalGroupContrast("data");
  const dataViewCard = markup.match(/<[^>]*data-testid="open-ena-3d-data-view"[^>]*>/)?.[0] ?? "";

  assert.ok(dataViewCard, "data mode must retain the center card when its child is unavailable");
  assert.doesNotMatch(dataViewCard, /\srole=|\saria-label=/);
  assert.match(
    markup,
    /<p class="ena-sets-compatibility-note" role="status">Data View is not available for this 3D comparison result\.<\/p>/,
  );
  assert.doesNotMatch(markup, /aria-label="Data View"/);
});

test("Data View availability follows the executable analysis/view state matrix", () => {
  const cases = [
    {
      label: "2D active ENA contrast",
      input: { view: "2d", completedResultKind: "ena", hasActiveGroupContrast: true },
      expected: { enabled: true, reason: null },
    },
    {
      label: "3D active ENA contrast",
      input: { view: "3d", completedResultKind: "ena", hasActiveGroupContrast: true },
      expected: { enabled: true, reason: null },
    },
    {
      label: "2D ONA result",
      input: { view: "2d", completedResultKind: "ona", hasActiveGroupContrast: false },
      expected: { enabled: true, reason: null },
    },
    {
      label: "ordinary 2D ENA",
      input: { view: "2d", completedResultKind: "ena", hasActiveGroupContrast: false },
      expected: { enabled: false, reason: "active-group-contrast-required" },
    },
    {
      label: "ordinary 3D ENA",
      input: { view: "3d", completedResultKind: "ena", hasActiveGroupContrast: false },
      expected: { enabled: false, reason: "active-3d-group-contrast-required" },
    },
  ] as const;

  for (const fixture of cases) {
    assert.deepEqual(openEnaDataViewAvailability(fixture.input), fixture.expected, fixture.label);
  }
});

test("ONA 3D Data View is disabled with explicit supported-view guidance", () => {
  const availability = openEnaDataViewAvailability({
    view: "3d",
    completedResultKind: "ona",
    hasActiveGroupContrast: false,
  });
  assert.deepEqual(availability, {
    enabled: false,
    reason: "ona-three-dimensional-unavailable",
  });

  assert.deepEqual(openEnaDataViewUnavailableCopy(availability.reason), {
    title: "Data View is unavailable in 3D ONA.",
    ariaLabel: "Data View unavailable in 3D ONA. Switch to the supported 2D ONA view.",
  });
});

test("every disabled Data View reason has distinct guidance while enabled state keeps its visible name", () => {
  assert.deepEqual(openEnaDataViewUnavailableCopy("active-group-contrast-required"), {
    title: "Data View requires an active group comparison.",
    ariaLabel: "Data View unavailable. Select two groups for a comparison first.",
  });
  assert.deepEqual(openEnaDataViewUnavailableCopy("active-3d-group-contrast-required"), {
    title: "Data View requires an active 3D group comparison.",
    ariaLabel: "Data View unavailable. Select two groups for a 3D comparison first.",
  });
  assert.equal(openEnaDataViewUnavailableCopy(null), null, "enabled Data View must retain its visible button name");
});

test("all authoritative 3D interaction hints describe five actions including fullscreen", () => {
  const hints = {
    en: getOpenEnaCopy("en").plot.threeDInteractionHint,
    zhHant: getOpenEnaCopy("zh-hant").plot.threeDInteractionHint,
    zhHans: getOpenEnaCopy("zh-hans").plot.threeDInteractionHint,
  };

  assert.equal(
    hints.en,
    "Drag to rotate; scroll or use the five plot actions to zoom in, zoom out, recenter, copy the image, or enter fullscreen. The geometry is descriptive, not inferential.",
  );
  assert.equal(
    hints.zhHant,
    "拖曳以旋轉；滾動或使用五個繪圖操作來放大、縮小、回正、複製圖片或進入全螢幕。此幾何只作描述，不屬推論證據。",
  );
  assert.equal(
    hints.zhHans,
    "拖动以旋转；滚动或使用五个绘图操作来放大、缩小、回正、复制图片或进入全屏。此几何仅作描述，不属于推断证据。",
  );
  Object.values(hints).forEach((hint) => {
    assert.doesNotMatch(hint, /four plot buttons|四個繪圖按鈕|四个绘图按钮/u);
  });
});

test("3D plot controls and action status copy are explicit in English, Traditional Chinese, and Simplified Chinese", () => {
  const en = getOpenEnaCopy("en").plot;
  const zhHant = getOpenEnaCopy("zh-hant").plot;
  const zhHans = getOpenEnaCopy("zh-hans").plot;

  assert.deepEqual({
    comparison: en.threeDComparisonPlot,
    primary: en.threeDPrimaryPlot,
    secondary: en.threeDSecondaryPlot,
    actions: en.threeDPlotActions,
    zoomIn: en.zoomIn,
    zoomOut: en.zoomOut,
    recenter: en.recenter,
    copyImage: en.copyImage,
    fullscreenEnter: en.fullscreenEnter,
    fullscreenExit: en.fullscreenExit,
    fullscreenDialog: en.fullscreenDialog,
    actionUnavailable: en.actionUnavailable,
    copyingImage: en.copyingImage,
    imageCopied: en.imageCopied,
    imageDataCopied: en.imageDataCopied,
    copyUnavailable: en.copyUnavailable,
    fullscreenOpening: en.fullscreenOpening,
    fullscreenFallbackEnabled: en.fullscreenFallbackEnabled,
    fullscreenClosed: en.fullscreenClosed,
    fullscreenExitFailed: en.fullscreenExitFailed,
    fullscreenUnavailable: en.fullscreenUnavailable,
  }, {
    comparison: "Comparison Plot",
    primary: "Primary Plot",
    secondary: "Secondary Plot",
    actions: "3D plot actions",
    zoomIn: "Zoom In",
    zoomOut: "Zoom Out",
    recenter: "Recenter",
    copyImage: "Copy image",
    fullscreenEnter: "Enter Fullscreen",
    fullscreenExit: "Exit Fullscreen",
    fullscreenDialog: "Fullscreen 3D plot",
    actionUnavailable: "3D view action unavailable",
    copyingImage: "Copying image",
    imageCopied: "Image copied",
    imageDataCopied: "Image data copied",
    copyUnavailable: "Copy unavailable",
    fullscreenOpening: "Opening fullscreen",
    fullscreenFallbackEnabled: "Fullscreen fallback enabled",
    fullscreenClosed: "Fullscreen closed",
    fullscreenExitFailed: "Native fullscreen could not close. Press Escape to exit.",
    fullscreenUnavailable: "Fullscreen unavailable",
  });

  assert.deepEqual({
    comparison: zhHant.threeDComparisonPlot,
    primary: zhHant.threeDPrimaryPlot,
    secondary: zhHant.threeDSecondaryPlot,
    actions: zhHant.threeDPlotActions,
    copyImage: zhHant.copyImage,
    fullscreenEnter: zhHant.fullscreenEnter,
    fullscreenExit: zhHant.fullscreenExit,
    fullscreenDialog: zhHant.fullscreenDialog,
    copyingImage: zhHant.copyingImage,
    imageCopied: zhHant.imageCopied,
    fullscreenFallbackEnabled: zhHant.fullscreenFallbackEnabled,
    fullscreenExitFailed: zhHant.fullscreenExitFailed,
  }, {
    comparison: "比較圖",
    primary: "主要圖",
    secondary: "次要圖",
    actions: "3D 繪圖操作",
    copyImage: "複製圖片",
    fullscreenEnter: "進入全螢幕",
    fullscreenExit: "離開全螢幕",
    fullscreenDialog: "全螢幕 3D 圖",
    copyingImage: "正在複製圖片",
    imageCopied: "圖片已複製",
    fullscreenFallbackEnabled: "已啟用全螢幕備用模式",
    fullscreenExitFailed: "原生全螢幕無法關閉。請按 Escape 離開。",
  });

  assert.deepEqual({
    comparison: zhHans.threeDComparisonPlot,
    primary: zhHans.threeDPrimaryPlot,
    secondary: zhHans.threeDSecondaryPlot,
    actions: zhHans.threeDPlotActions,
    copyImage: zhHans.copyImage,
    fullscreenEnter: zhHans.fullscreenEnter,
    fullscreenExit: zhHans.fullscreenExit,
    fullscreenDialog: zhHans.fullscreenDialog,
    copyingImage: zhHans.copyingImage,
    imageCopied: zhHans.imageCopied,
    fullscreenFallbackEnabled: zhHans.fullscreenFallbackEnabled,
    fullscreenExitFailed: zhHans.fullscreenExitFailed,
  }, {
    comparison: "比较图",
    primary: "主要图",
    secondary: "次要图",
    actions: "3D 绘图操作",
    copyImage: "复制图片",
    fullscreenEnter: "进入全屏",
    fullscreenExit: "退出全屏",
    fullscreenDialog: "全屏 3D 图",
    copyingImage: "正在复制图片",
    imageCopied: "图片已复制",
    fullscreenFallbackEnabled: "已启用全屏备用模式",
    fullscreenExitFailed: "原生全屏无法关闭。请按 Escape 退出。",
  });
  assert.notEqual(zhHant.fullscreenEnter, zhHans.fullscreenEnter);
  assert.notEqual(zhHant.copyImage, zhHans.copyImage);
});

test("available Data View keeps the requested data center selected and pressed", () => {
  assert.deepEqual(openEnaDataViewCenterSurface({
    requestedCenterSurface: "data",
    dataViewEnabled: true,
  }), {
    effectiveCenterSurface: "data",
    dataViewPressed: true,
  });
});

test("unavailable Data View resolves a stale data request to plot and unpressed", () => {
  assert.deepEqual(openEnaDataViewCenterSurface({
    requestedCenterSurface: "data",
    dataViewEnabled: false,
  }), {
    effectiveCenterSurface: "plot",
    dataViewPressed: false,
  });
});

test("each 3D paper replaces the Plotly modebar with the same five unframed plot-action logos", () => {
  const interactive = readFileSync(
    join(projectRoot, "components", "open-ena", "OpenEnaInteractive3DPlot.tsx"),
    "utf8",
  );
  const groupContrast3d = readFileSync(
    join(projectRoot, "components", "open-ena", "OpenEna3DGroupContrast.tsx"),
    "utf8",
  );
  const groupContrast2d = readFileSync(
    join(projectRoot, "components", "open-ena", "OpenEnaGroupContrast.tsx"),
    "utf8",
  );
  const icons = readFileSync(
    join(projectRoot, "components", "open-ena", "OpenEnaPlotActionIcon.tsx"),
    "utf8",
  );
  const styles = readFileSync(join(projectRoot, "app", "globals.css"), "utf8");

  assert.deepEqual(
    [...interactive.matchAll(/data-ena-plot-action="([^"]+)"/gu)].map((match) => match[1]),
    ["zoom-in", "zoom-out", "recenter", "copy-image", "fullscreen"],
    "the custom 3D rail must expose exactly the five requested actions in the reference order",
  );
  assert.match(interactive, /data-ena-toolbar-design="unframed-plot-actions"/);
  assert.match(interactive, /displayModeBar = false/);
  assert.match(interactive, /activeCamera\.projection\.type === "orthographic"/);
  assert.match(interactive, /zoomOpenEna3dAspectRatio\(currentAspectRatio\(\), resetAspectRatio\(\), direction\)/);
  assert.match(interactive, /zoomOpenEna3dCamera\(activeCamera, cameraForPreset\(camera\), direction\)/);
  assert.match(interactive, /getAspectratio\?\.\(\)/);
  assert.match(interactive, /"scene\.aspectratio": nextAspectRatio/);
  assert.match(interactive, /resetOpenEna3dCameraDistance\(activeCamera, cameraForPreset\(camera\)\)/);
  assert.match(interactive, /void applyDefaultDisplayDistance\(\)/);
  assert.match(interactive, /data-ena-recenter-behavior="default-distance"/);
  assert.match(groupContrast2d, /onClick=\{\(\) => onZoomChange\(1\)\}/);
  assert.match(interactive, /toImage\(plotRoot,/);
  assert.match(interactive, /const png = pngBlobFromDataUrl\(dataUrl\)/);
  assert.doesNotMatch(interactive, /fetch\(dataUrl\)/);
  assert.match(interactive, /navigator\.clipboard\.write\(\[new ClipboardItem\(\{ "image\/png": png \}\)\]\)/);
  assert.match(interactive, /navigator\.clipboard\.writeText\(dataUrl\)/);
  assert.doesNotMatch(interactive, /querySelectorAll[^\n]*data-ena-plotly-root/);

  assert.equal(
    [...groupContrast3d.matchAll(/<OpenEnaInteractive3DPlot/gu)].length,
    3,
    "Comparison, Primary, and Secondary must each own the shared five-button plot component",
  );
  assert.match(
    groupContrast3d,
    /const sharedPlotProps = \{[\s\S]*?initialCamera: sharedCamera,[\s\S]*?onCameraChange,[\s\S]*?initialAspectRatio: sharedAspectRatio,[\s\S]*?onAspectRatioChange,[\s\S]*?copy,/,
    "all three toolbars must publish camera and orthographic zoom changes into the linked display state",
  );
  assert.match(groupContrast3d, /plotKind="comparison"[\s\S]*?displayModeBar=\{false\}/);
  assert.match(groupContrast2d, /import OpenEnaPlotActionIcon from "\.\/OpenEnaPlotActionIcon"/);
  assert.match(interactive, /import OpenEnaPlotActionIcon from "\.\/OpenEnaPlotActionIcon"/);
  for (const icon of ["zoom-in", "zoom-out", "recenter", "copy", "fullscreen", "exit-fullscreen"] as const) {
    assert.match(icons, new RegExp(`(?:"${icon}"|${icon}): <path d=`));
  }

  assert.match(styles, /\.open-ena-interactive-3d-region \.modebar \{\s*display: none !important;/);
  assert.match(
    styles,
    /\.open-ena-interactive-3d-region \.open-ena-3d-plot-actions button \{[\s\S]*?border: 0;[\s\S]*?border-radius: 50%;[\s\S]*?background: transparent;[\s\S]*?box-shadow: none;/,
    "the requested logos must float directly on the paper without square borders or button boxes",
  );
  assert.match(
    styles,
    /\.open-ena-interactive-3d-region \.open-ena-3d-plot-actions button:hover \{[\s\S]*?border: 0;[\s\S]*?background: transparent;/,
    "hover must change the icon without adding a square frame",
  );
});

test("the five-action 3D triptych renders on every paper and zooms the linked camera without changing orientation", () => {
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
  const markup = renderToStaticMarkup(createElement(OpenEna3DGroupContrast, {
    result,
    contrast,
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
    edgeScale: 1,
    edgeThreshold: 0,
    pointScale: 1,
    plotZoom: 1,
    flipX: false,
    flipY: false,
    centerMode: "plot",
    copy: getOpenEnaCopy("en"),
  }));

  assert.equal([...markup.matchAll(/data-ena-toolbar-design="unframed-plot-actions"/gu)].length, 3);
  assert.deepEqual(
    [...markup.matchAll(/data-ena-plot-toolbar="([^"]+)"/gu)].map((match) => match[1]),
    ["comparison", "primary", "secondary"],
  );
  assert.deepEqual(
    [...markup.matchAll(/data-ena-plot-action="([^"]+)"/gu)].map((match) => match[1]),
    [
      "zoom-in", "zoom-out", "recenter", "copy-image", "fullscreen",
      "zoom-in", "zoom-out", "recenter", "copy-image", "fullscreen",
      "zoom-in", "zoom-out", "recenter", "copy-image", "fullscreen",
    ],
  );

  const camera = cameraForPreset("isometric");
  const zoomedIn = zoomOpenEna3dCamera(camera, camera, "in");
  const zoomedOut = zoomOpenEna3dCamera(camera, camera, "out");
  const distance = (target: typeof camera) => Math.hypot(target.eye.x, target.eye.y, target.eye.z);
  assert.equal(OPEN_ENA_3D_CAMERA_ZOOM_STEP, 1.2);
  assert.ok(Math.abs(distance(camera) / distance(zoomedIn) - 1.2) < 1e-12);
  assert.ok(Math.abs(distance(zoomedOut) / distance(camera) - 1.2) < 1e-12);
  assert.deepEqual(zoomedIn.center, camera.center);
  assert.deepEqual(zoomedIn.up, camera.up);
  assert.deepEqual(zoomedIn.projection, camera.projection);
  assert.deepEqual(zoomedOut.center, camera.center);
  assert.deepEqual(zoomedOut.up, camera.up);
  assert.deepEqual(zoomedOut.projection, camera.projection);
});

test("each 3D fullscreen action owns its complete card while a generic plot owns its figure", () => {
  const markup = renderThreeDimensionalGroupContrast("plot");
  const cardIds: string[] = [];

  for (const role of ["comparison", "primary", "secondary"] as const) {
    const card = new RegExp(
      `<article\\b([^>]*data-testid="open-ena-3d-${role}-plot"[^>]*)>([\\s\\S]*?)<\\/article>`,
      "u",
    ).exec(markup);
    assert.ok(card, `${role} must render as one complete fullscreen card`);
    const targetId = /\bid="([^"]+)"/u.exec(card[1] ?? "")?.[1];
    assert.ok(targetId, `${role} must expose a fullscreen target id on its article`);
    cardIds.push(targetId);
    const cardMarkup = card[0];
    assert.equal([...cardMarkup.matchAll(/data-ena-plot-action="fullscreen"/gu)].length, 1);
    assert.match(cardMarkup, new RegExp(`data-ena-plot-action="fullscreen"[\\s\\S]*?aria-controls="${targetId}"`, "u"));
  }

  assert.equal(new Set(cardIds).size, 3, "the triptych must not share one fullscreen target");

  const genericMarkup = renderToStaticMarkup(createElement(
    OpenEnaInteractive3DPlot,
    genericThreeDimensionalPlotProps(),
  ));
  const genericTargetId = /<figure\b[^>]*\bid="([^"]+)"/u.exec(genericMarkup)?.[1];
  assert.ok(genericTargetId);
  assert.match(
    genericMarkup,
    new RegExp(`data-ena-plot-action="fullscreen"[\\s\\S]*?aria-controls="${genericTargetId}"`, "u"),
  );
});

test("two SSR triptychs have unique IDs and unambiguous fullscreen card ownership", () => {
  const props = threeDimensionalGroupContrastProps("plot");
  const markup = renderToStaticMarkup(createElement(
    "div",
    null,
    createElement(OpenEna3DGroupContrast, { ...props, key: "first" }),
    createElement(OpenEna3DGroupContrast, { ...props, key: "second" }),
  ));
  const ids = [...markup.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1] ?? "");
  const controlledIds = [...markup.matchAll(/\saria-controls="([^"]+)"/gu)].map((match) => match[1] ?? "");
  const fullscreenControlledIds = [...markup.matchAll(
    /<button\b(?=[^>]*data-ena-plot-action="fullscreen")(?=[^>]*aria-controls="([^"]+)")[^>]*>/gu,
  )].map((match) => match[1] ?? "");

  assert.equal(ids.length, new Set(ids).size, "two triptychs must not duplicate any DOM id");
  assert.ok(controlledIds.every((id) => ids.includes(id)), "every triptych aria-controls must resolve in the same tree");
  assert.equal(fullscreenControlledIds.length, 6);
  assert.equal(new Set(fullscreenControlledIds).size, 6, "each card must own one distinct fullscreen target");
});

test("two SSR generic 3D plots remain unique even when callers reuse the same test id", () => {
  const props = genericThreeDimensionalPlotProps("shared-generic-3d-test-id");
  const markup = renderToStaticMarkup(createElement(
    "div",
    null,
    createElement(OpenEnaInteractive3DPlot, { ...props, key: "first" }),
    createElement(OpenEnaInteractive3DPlot, { ...props, key: "second" }),
  ));
  const ids = [...markup.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1] ?? "");
  const controlledIds = [...markup.matchAll(/\saria-controls="([^"]+)"/gu)].map((match) => match[1] ?? "");
  const fullscreenControlledIds = [...markup.matchAll(
    /<button\b(?=[^>]*data-ena-plot-action="fullscreen")(?=[^>]*aria-controls="([^"]+)")[^>]*>/gu,
  )].map((match) => match[1] ?? "");

  assert.equal(ids.length, new Set(ids).size, "generic target and canvas ids must be instance-unique");
  assert.ok(controlledIds.every((id) => ids.includes(id)), "every generic aria-controls must resolve in the same tree");
  assert.equal(fullscreenControlledIds.length, 2);
  assert.equal(new Set(fullscreenControlledIds).size, 2);
});

test("native fullscreen mode requires callable request and exit APIs", () => {
  const callable = () => Promise.resolve();

  assert.equal(openEna3dFullscreenMode({ requestFullscreen: callable, exitFullscreen: callable }), "native");
  assert.equal(openEna3dFullscreenMode({ requestFullscreen: undefined, exitFullscreen: callable }), "fallback");
  assert.equal(openEna3dFullscreenMode({ requestFullscreen: callable, exitFullscreen: undefined }), "fallback");
});

test("the interactive 3D component uses one combined React import", () => {
  const interactive = readFileSync(
    join(projectRoot, "components", "open-ena", "OpenEnaInteractive3DPlot.tsx"),
    "utf8",
  );
  const reactImports = interactive.match(/^import .* from "react";$/gmu) ?? [];

  assert.equal(reactImports.length, 1);
});

test("native fullscreen exit rejection uses localized actionable Escape guidance without claiming exit", () => {
  const interactive = readFileSync(
    join(projectRoot, "components", "open-ena", "OpenEnaInteractive3DPlot.tsx"),
    "utf8",
  );
  const exitBranchStart = interactive.indexOf("if (document.fullscreenElement === target)");
  const exitBranchEnd = interactive.indexOf("void enterFullscreen(target)", exitBranchStart);
  const exitBranch = interactive.slice(exitBranchStart, exitBranchEnd);

  assert.match(exitBranch, /copy\.plot\.fullscreenExitFailed/u);
  assert.doesNotMatch(exitBranch, /Fullscreen exit unavailable/u);
  assert.doesNotMatch(
    exitBranch,
    /enterFallbackFullscreen|setIsFullscreen\(false\)|fullscreenStateRef\.current\s*=\s*false/u,
  );
});

test("3D fullscreen is native-first with a safe single-owner fallback, lifecycle cleanup, focus return, and explicit resize", () => {
  const interactive = readFileSync(
    join(projectRoot, "components", "open-ena", "OpenEnaInteractive3DPlot.tsx"),
    "utf8",
  );
  const styles = readFileSync(join(projectRoot, "app", "globals.css"), "utf8");

  assert.match(interactive, /fullscreenTarget\?:\s*\{[\s\S]*?id:\s*string;[\s\S]*?ref:\s*RefObject<HTMLElement \| null>/u);
  assert.match(interactive, /target\.requestFullscreen\(\)/u);
  assert.match(interactive, /document\.exitFullscreen\(\)/u);
  assert.match(interactive, /isolateOpenEnaFallbackFullscreenOutsideTreeV3/u);
  assert.match(interactive, /nextOpenEnaFallbackFullscreenFocusV3/u);
  assert.match(interactive, /data-fallback-fullscreen/u);
  assert.match(interactive, /querySelectorAll<HTMLElement>/u);
  assert.match(interactive, /event\.key === "Escape"/u);
  assert.match(interactive, /event\.key === "Tab"/u);
  assert.match(interactive, /addEventListener\("focusin"/u);
  assert.match(interactive, /removeEventListener\("focusin"/u);
  assert.match(interactive, /setAttribute\("role", "dialog"\)/u);
  assert.match(interactive, /setAttribute\("aria-modal", "true"\)/u);
  assert.match(interactive, /setAttribute\("aria-label", fallbackFullscreenLabel\)/u);
  assert.match(interactive, /copy\.plot\.fullscreenDialog/u);
  assert.match(interactive, /fullscreenInitiatorRef\.current\?\.focus\(\)/u);
  assert.match(interactive, /requestAnimationFrame\(/u);
  assert.match(interactive, /Plotly\.Plots\.resize\(plotRoot\)/u);
  assert.match(interactive, /cancelAnimationFrame\(/u);
  assert.match(interactive, /removeAttribute\("data-fallback-fullscreen"\)/u);
  for (const eventName of ["fullscreenchange", "fullscreenerror", "keydown"] as const) {
    assert.match(interactive, new RegExp(`addEventListener\\("${eventName}"`, "u"));
    assert.match(interactive, new RegExp(`removeEventListener\\("${eventName}"`, "u"));
  }
  assert.match(interactive, /aria-pressed=\{isFullscreen\}/u);
  assert.match(interactive, /isFullscreen \? copy\.plot\.fullscreenExit : copy\.plot\.fullscreenEnter/u);
  for (const hardcodedActionCopy of [
    "3D view action unavailable",
    "Copying image",
    "Image copied",
    "Image data copied",
    "Copy unavailable",
    "Opening fullscreen",
    "Fullscreen fallback enabled",
    "Fullscreen closed",
    "Fullscreen unavailable",
  ]) {
    assert.equal(
      interactive.includes(`announceAction("${hardcodedActionCopy}")`),
      false,
      `interactive 3D action copy remains hardcoded: ${hardcodedActionCopy}`,
    );
  }
  const fullscreenLogicStart = interactive.indexOf("function scheduleFullscreenResize");
  const fullscreenLogicEnd = interactive.indexOf("return (", fullscreenLogicStart);
  assert.ok(fullscreenLogicStart >= 0 && fullscreenLogicEnd > fullscreenLogicStart);
  assert.doesNotMatch(
    interactive.slice(fullscreenLogicStart, fullscreenLogicEnd),
    /Plotly\.(?:react|relayout)/u,
    "fullscreen changes may resize the existing plot but must not recompute or refit its spec",
  );

  assert.match(styles, /\.open-ena-3d-triptych-panel:fullscreen[\s\S]*?width:\s*100vw;[\s\S]*?height:\s*100dvh;/u);
  assert.match(styles, /data-fallback-fullscreen="true"[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*0;[\s\S]*?z-index:/u);
  assert.match(styles, /grid-template-rows:\s*auto minmax\(0,\s*1fr\);/u);
  assert.match(styles, /data-fallback-fullscreen="true"[\s\S]*?\.open-ena-interactive-3d-summary[\s\S]*?display:\s*none;/u);
  assert.match(styles, /\.open-ena-3d-plot-actions[\s\S]*?flex-direction:\s*column;[\s\S]*?overflow-y:\s*auto;/u);
});

test("orthographic plane zoom changes the visible Plotly aspect ratio and remains bounded around its reset frame", () => {
  const resetAspectRatio = { x: 1, y: 1, z: 1 };
  const zoomedIn = zoomOpenEna3dAspectRatio(resetAspectRatio, resetAspectRatio, "in");
  const zoomedOut = zoomOpenEna3dAspectRatio(resetAspectRatio, resetAspectRatio, "out");

  assert.deepEqual(zoomedIn, { x: 1.2, y: 1.2, z: 1.2 });
  assert.deepEqual(zoomedOut, { x: 1 / 1.2, y: 1 / 1.2, z: 1 / 1.2 });

  let upperBound = resetAspectRatio;
  let lowerBound = resetAspectRatio;
  for (let step = 0; step < 20; step += 1) {
    upperBound = zoomOpenEna3dAspectRatio(upperBound, resetAspectRatio, "in");
    lowerBound = zoomOpenEna3dAspectRatio(lowerBound, resetAspectRatio, "out");
  }
  assert.deepEqual(upperBound, { x: 3, y: 3, z: 3 });
  assert.deepEqual(lowerBound, { x: 0.35, y: 0.35, z: 0.35 });

  const flatCamera = cameraForPreset("xy");
  assert.equal(flatCamera.projection.type, "orthographic");
  assert.deepEqual(flatCamera.eye, { x: 0, y: 0, z: 2.5 });

  const result = threeDimensionalResult();
  const [xDimension = "SVD1", yDimension = "SVD2", zDimension = "SVD3"] = result.dimensions;
  const spec = compileOpenEna3dPlotSpec({
    result,
    groupColumn: "group",
    xDimension,
    yDimension,
    zDimension,
    camera: "xy",
    showPoints: true,
    showNetworks: true,
    showLabels: true,
    showUnitLabels: false,
    showVariance: true,
    showTrajectories: false,
    edgeScale: 1,
    edgeThreshold: 0,
    pointScale: 1,
    plotZoom: 1.4,
    flipX: false,
    flipY: false,
  });
  assert.equal(spec.layout.scene.aspectmode, "manual");
  assert.deepEqual(spec.layout.scene.aspectratio, { x: 1.4, y: 1.4, z: 1.4 });
  assert.deepEqual(spec.layout.scene.camera.eye, flatCamera.eye);
});

test("3D Recenter matches 2D by restoring the default display distance without replacing the current orientation", () => {
  const reference = cameraForPreset("isometric");
  const current = {
    center: { x: 0.15, y: -0.1, z: 0.05 },
    eye: { x: -4, y: 2, z: 1 },
    up: { x: 0, y: 1, z: 0 },
    projection: { type: "perspective" as const },
  };
  const reset = resetOpenEna3dCameraDistance(current, reference);
  const distance = (camera: typeof current | typeof reference) => Math.hypot(
    camera.eye.x,
    camera.eye.y,
    camera.eye.z,
  );

  assert.ok(Math.abs(distance(reset) - distance(reference)) < 1e-12);
  assert.deepEqual(reset.center, current.center);
  assert.deepEqual(reset.up, current.up);
  assert.deepEqual(reset.projection, current.projection);
  assert.ok(reset.eye.x < 0 && reset.eye.y > 0 && reset.eye.z > 0);
  assert.notDeepEqual(reset.eye, reference.eye);
});
