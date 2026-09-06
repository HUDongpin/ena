import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import OpenEna3DGroupContrast from "../components/open-ena/OpenEna3DGroupContrast";
import OpenEna3DOrderedResultLayout from "../components/open-ena/OpenEna3DOrderedResultLayout";
import OpenEnaGroupContrast from "../components/open-ena/OpenEnaGroupContrast";
import OpenEnaLongitudinalTrajectory from "../components/open-ena/OpenEnaLongitudinalTrajectory";
import OpenEnaOrderedPlot from "../components/open-ena/OpenEnaOrderedPlot";
import OpenEnaOrderedResultLayout from "../components/open-ena/OpenEnaOrderedResultLayout";
import OpenEnaPlot from "../components/open-ena/OpenEnaPlot";
import { analyzeDataset } from "../lib/open-ena/analyze";
import { buildPairwiseGroupContrast } from "../lib/open-ena/contrasts";
import { parseCsv } from "../lib/open-ena/csv";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";
import { compileOpenEnaOrdered3dPlotSpec, type CompileOpenEnaOrdered3dPlotInput } from "../lib/open-ena/ordered-plot3d";
import { compileOpenEna3dPlotSpec } from "../lib/open-ena/plot3d";
import { SAMPLE_CONFIG, type CanonicalOpenEnaConfig, type OpenEnaConfig, type OpenEnaResult } from "../lib/open-ena/types";

const config: OpenEnaConfig = {
  ...SAMPLE_CONFIG,
  unitColumns: ["unit"],
  conversationColumns: ["conversation"],
  groupColumn: "group",
  codes: ["A", "B", "C"],
  window: "Conversation",
};

function standardFixture() {
  return analyzeDataset(parseCsv([
    "unit,conversation,group,A,B,C",
    "u1,c1,first,1,1,0",
    "u2,c2,first,1,0,1",
    "u3,c3,second,0,1,1",
    "u4,c4,second,1,1,1",
    "",
  ].join("\n"), { name: "task30-visibility.csv", source: "upload" }), config);
}

function standardProps() {
  const result = standardFixture();
  const [xDimension = "SVD1", yDimension = "SVD2", zDimension = "SVD3"] = result.dimensions;
  return {
    result,
    view: "2d" as const,
    groupColumn: "group",
    xDimension,
    yDimension,
    zDimension,
    camera: "isometric" as const,
    showPoints: true,
    showNetworks: true,
    showLabels: true,
    showUnitLabels: true,
    showVariance: true,
    showTrajectories: false,
    edgeScale: 1,
    edgeThreshold: 0,
    pointScale: 1,
    plotZoom: 1,
    flipX: false,
    flipY: false,
    copy: getOpenEnaCopy("en"),
  };
}

const sourceMap = { A: "source/A", B: "source/B", C: "source/C" };
const mixedVisibility = { "source/A": true, "source/B": false, "source/C": true };

function count(markup: string, pattern: RegExp) {
  return markup.match(pattern)?.length ?? 0;
}

function orderedFixture() {
  const codes = ["A", "B", "C"];
  const adjacencyKey = codes.flatMap((response, responseIndex) => codes.map((ground, groundIndex) => ({
    source: ground,
    target: response,
    sourceIndex: groundIndex,
    targetIndex: responseIndex,
    name: `${ground} & ${response}`,
  })));
  const directionalMask = {
    schemaVersion: 1 as const,
    codeOrder: [...codes],
    enabled: codes.map(() => codes.map(() => true)),
  };
  const orderedConfig: OpenEnaConfig = {
    analysisKind: "ona",
    unitColumns: ["unit"],
    conversationColumns: ["horizon"],
    groupColumn: "group",
    codes,
    model: "EndPoint",
    window: "MovingStanzaWindow",
    windowSizeBack: 2,
    windowSizeForward: 0,
    weightBy: "sum",
    rotation: "svd",
    referenceRotationId: null,
    centerAlignToOrigin: true,
    orderPolicy: { kind: "columns", columns: ["turn"], comparators: { turn: "number" } },
    directionalMask,
  };
  const groups = ["first", "second"].map((name, groupIndex) => ({
    name,
    count: 1,
    pointCount: 1,
    color: groupIndex ? "#218ebf" : "#cc423a",
    meanPoint: { SVD1: groupIndex * 0.08, SVD2: -groupIndex * 0.04, SVD3: groupIndex * 0.02 },
    meanWeights: Object.fromEntries(adjacencyKey.map((edge, edgeIndex) => [
      edge.name,
      0.2 + ((edgeIndex + groupIndex) % 8) * 0.1,
    ])),
  }));
  const nodeTotals = {
    schemaVersion: 1 as const,
    codeOrder: [...codes],
    overallResponseCodeTotals: [5, 4, 3],
    groups: [
      { name: "first", unitCount: 1, responseCodeTotals: [2, 1, 1] },
      { name: "second", unitCount: 1, responseCodeTotals: [3, 3, 2] },
    ],
  };
  const result = {
    set: {
      networkType: "ordered",
      functionParams: { networkType: "ordered" },
      modelType: "EndPoint",
      codes,
      codeColumns: adjacencyKey.map((edge) => edge.name),
      adjacencyKey,
      units: ["unit"],
      conversation: ["horizon"],
      points: [
        { ENA_UNIT: "u1", group: "first", SVD1: -0.72, SVD2: 0.13, SVD3: -0.08 },
        { ENA_UNIT: "u2", group: "second", SVD1: 0.58, SVD2: -0.27, SVD3: 0.24 },
      ],
      lineWeights: [],
      connectionCounts: groups.map((group, groupIndex) => ({
        ENA_UNIT: `u${groupIndex + 1}`,
        group: group.name,
        ...Object.fromEntries(adjacencyKey.map((edge, edgeIndex) => [edge.name, (groupIndex + 1) * (edgeIndex + 1)])),
      })),
      pointsForProjection: [],
      rotation: {
        nodes: [
          { code: "A", SVD1: -1, SVD2: 0, SVD3: -0.2 },
          { code: "B", SVD1: 1, SVD2: 0.4, SVD3: 0.3 },
          { code: "C", SVD1: 0.1, SVD2: -0.9, SVD3: 0.15 },
        ],
        rotationColumns: ["SVD1", "SVD2", "SVD3"],
        rotationMatrix: [],
        eigenvalues: [1, 0.5, 0.25],
        centerVector: [],
      },
      variance: { SVD1: 0.55, SVD2: 0.3, SVD3: 0.15 },
    },
    groups,
    dimensions: ["SVD1", "SVD2", "SVD3"],
    stats: {},
    statsDiagnostics: { correlations: "not-applicable-ordered-network", tests: "not-applicable-ordered-network", correlationUnitLimit: 2_000 },
    analyzedAt: "2026-09-06T00:00:00.000Z",
    projectionReference: null,
    executionProvenance: {
      schemaVersion: 1,
      configuration: structuredClone(orderedConfig) as CanonicalOpenEnaConfig,
      analysisKind: "ona",
      networkType: "ordered",
      nodePositionMethod: "directed",
      directionalMask: structuredClone(directionalMask),
      ordering: {
        requestedPolicy: structuredClone(orderedConfig.orderPolicy!),
        resolvedPolicy: { kind: "columns", columns: ["turn"], comparators: { turn: "number" }, direction: "ascending", missing: "reject", ties: "reject", stable: true },
        responseRowSourceIndices: [0, 1],
      },
    },
  } as unknown as OpenEnaResult;
  return { result, config: orderedConfig, nodeTotals };
}

function ordered3dInput(overrides: Partial<CompileOpenEnaOrdered3dPlotInput> = {}) {
  const fixture = orderedFixture();
  return {
    ...fixture,
    scope: { kind: "overall" as const },
    xDimension: "SVD1",
    yDimension: "SVD2",
    zDimension: "SVD3",
    camera: "isometric" as const,
    showPoints: true,
    showNetworks: true,
    showLabels: true,
    showUnitLabels: true,
    showVariance: true,
    edgeScale: 1,
    edgeThreshold: 0,
    pointScale: 1,
    plotZoom: 1,
    flipX: false,
    flipY: false,
    ...overrides,
  };
}

test("Standard SVG and Plotly omit only hidden Code identities and their incident edges", () => {
  const props = standardProps();
  const visibleSvg = renderToStaticMarkup(createElement(OpenEnaPlot, props));
  const hiddenSvg = renderToStaticMarkup(createElement(OpenEnaPlot, {
    ...props,
    showCodeGraph: true,
    codeVisibility: mixedVisibility,
    codeSourceByRenderedCode: sourceMap,
  } as never));
  assert.match(visibleSvg, /data-ena-code="B"/);
  assert.doesNotMatch(hiddenSvg, /data-ena-code="B"/);
  assert.match(hiddenSvg, /data-ena-code="A"/);
  assert.match(hiddenSvg, /data-ena-code="C"/);
  assert.doesNotMatch(hiddenSvg, /data-ena-edge="(?:A &amp; B|B &amp; C)"/);
  assert.match(hiddenSvg, /data-ena-edge="A &amp; C"/);
  assert.ok(count(visibleSvg, /data-ena-unit-point="true"/g) > 0);
  assert.ok(count(visibleSvg, /data-ena-centroid-shape="square"/g) > 0);
  assert.equal(count(hiddenSvg, /data-ena-unit-point="true"/g), count(visibleSvg, /data-ena-unit-point="true"/g));
  assert.equal(count(hiddenSvg, /data-ena-centroid-shape="square"/g), count(visibleSvg, /data-ena-centroid-shape="square"/g));

  const visible3d = compileOpenEna3dPlotSpec(props);
  const hidden3d = compileOpenEna3dPlotSpec({
    ...props,
    showCodeGraph: true,
    codeVisibility: mixedVisibility,
    codeSourceByRenderedCode: sourceMap,
  } as never);
  const codeTrace = hidden3d.data.find((trace) => trace.meta.role === "code-node");
  assert.deepEqual(codeTrace?.text, ["A", "C"]);
  for (const values of [codeTrace?.x, codeTrace?.y, codeTrace?.z, codeTrace?.text, codeTrace?.customdata, codeTrace?.marker?.color]) {
    assert.equal(Array.isArray(values) ? values.length : -1, 2);
  }
  assert.ok(hidden3d.data
    .filter((trace) => trace.meta.role === "network-edge")
    .every((trace) => !String(trace.meta.edgeName).includes("B")));
  assert.deepEqual(hidden3d.layout, visible3d.layout);
  assert.deepEqual(
    hidden3d.data.filter((trace) => ["unit-points", "group-mean", "axis", "axis-arrowhead", "axis-label"].includes(trace.meta.role)),
    visible3d.data.filter((trace) => ["unit-points", "group-mean", "axis", "axis-arrowhead", "axis-label"].includes(trace.meta.role)),
  );
});

test("global suppression preserves Standard frame, units, means, axes, and saved node layout", () => {
  const props = standardProps();
  const nodeLayout = new Map([["A", new Map([[props.xDimension, 0.4], [props.yDimension, -0.2], [props.zDimension, 0.3]])]]);
  const visible = compileOpenEna3dPlotSpec({ ...props, nodeLayout });
  const hidden = compileOpenEna3dPlotSpec({ ...props, nodeLayout, showCodeGraph: false } as never);
  const restored = compileOpenEna3dPlotSpec({ ...props, nodeLayout, showCodeGraph: true } as never);
  assert.equal(hidden.data.some((trace) => trace.meta.role === "code-node" || trace.meta.role === "network-edge"), false);
  assert.deepEqual(hidden.layout, visible.layout);
  assert.deepEqual(restored, visible);
  const restoredCodes = restored.data.find((trace) => trace.meta.role === "code-node");
  const index = restoredCodes?.text?.indexOf("A") ?? -1;
  assert.deepEqual([restoredCodes?.x[index], restoredCodes?.y[index], restoredCodes?.z[index]], [0.4, -0.2, 0.3]);
});

test("2D Group contrast filters Code graph while keeping points, means, intervals, and frame", () => {
  const props = standardProps();
  const contrast = buildPairwiseGroupContrast(
    props.result,
    config,
    "first",
    "second",
    [props.xDimension, props.yDimension],
    "2026-09-06T00:00:00.000Z",
  );
  const estimableContrast = structuredClone(contrast);
  Object.assign(estimableContrast.primary, {
    points: [
      { unitId: "u1", group: "first", x: -0.8, y: -0.4 },
      { unitId: "u2", group: "first", x: -0.2, y: 0.5 },
    ],
  });
  Object.assign(estimableContrast.secondary, {
    points: [
      { unitId: "u3", group: "second", x: 0.2, y: -0.6 },
      { unitId: "u4", group: "second", x: 0.9, y: 0.3 },
    ],
  });
  delete (estimableContrast.primary as { meanConfidenceIntervals?: unknown }).meanConfidenceIntervals;
  delete (estimableContrast.secondary as { meanConfidenceIntervals?: unknown }).meanConfidenceIntervals;
  const common = {
    contrast: estimableContrast,
    edgeThreshold: 0,
    showPoints: true,
    showNetworks: true,
    showLabels: true,
    showGroupLabels: true,
    showUnitLabels: true,
    showVariance: true,
    edgeScale: 1,
    pointScale: 1,
    plotZoom: 1,
    flipX: false,
    flipY: false,
  };
  const visible = renderToStaticMarkup(createElement(OpenEnaGroupContrast, common));
  const hidden = renderToStaticMarkup(createElement(OpenEnaGroupContrast, {
    ...common,
    codeVisibility: mixedVisibility,
    codeSourceByRenderedCode: sourceMap,
  } as never));
  assert.doesNotMatch(hidden, /data-ena-code="B"/);
  assert.doesNotMatch(hidden, /data-ena-edge="(?:A &amp; B|B &amp; C)"/);
  assert.match(hidden, /data-ena-edge="A &amp; C"/);
  for (const pattern of [/data-ena-unit-point="true"/g, /data-ena-mean-marker=/g, /data-ena-interval-line=/g, /ena-set-zero-axes/g]) {
    assert.ok(count(visible, pattern) > 0, `visible fixture must exercise ${pattern.source}`);
    assert.equal(count(hidden, pattern), count(visible, pattern));
  }
});

test("longitudinal suppression preserves trajectories, centroid marks, axes, and period labels", () => {
  const trajectory = {
    status: "available",
    reason: null,
    axes: ["SVD1", "SVD2"],
    coordinateExtent: { minX: -1, maxX: 1, minY: -1, maxY: 1 },
    nodes: [
      { code: "A", x: -0.7, y: 0.3 },
      { code: "B", x: 0.1, y: 0.8 },
      { code: "C", x: 0.7, y: -0.4 },
    ],
    entityPeriods: [
      { entityId: "u1", group: "first", time: "T1", timeIndex: 0, x: -0.4, y: 0.1, sourcePointCount: 1 },
      { entityId: "u1", group: "first", time: "T2", timeIndex: 1, x: 0.2, y: 0.4, sourcePointCount: 1 },
    ],
    groups: [{
      name: "first",
      entityCount: 1,
      periods: [
        { group: "first", time: "T1", timeIndex: 0, nTotal: 1, nUsed: 1, nExcluded: 0, centroid: { x: -0.4, y: 0.1 }, dx: null, dy: null, stepDistance: null, cumulativeDistance: 0 },
        { group: "first", time: "T2", timeIndex: 1, nTotal: 1, nUsed: 1, nExcluded: 0, centroid: { x: 0.2, y: 0.4 }, dx: 0.6, dy: 0.3, stepDistance: 0.67, cumulativeDistance: 0.67 },
      ],
      segments: [{ group: "first", fromTime: "T1", toTime: "T2", fromTimeIndex: 0, toTimeIndex: 1, x1: -0.4, y1: 0.1, x2: 0.2, y2: 0.4, dx: 0.6, dy: 0.3, distance: 0.67, cumulativeDistance: 0.67 }],
      cumulativeDistance: 0.67,
    }],
    periodDiagnostics: [],
    timeOrder: ["T1", "T2"],
    cohortPolicy: "available",
    availableEntityCount: 1,
    completeEntityCount: 1,
    includedEntityCount: 1,
    geometry: { variance: { SVD1: 0.6, SVD2: 0.4 } },
    provenance: {},
  };
  const common = {
    trajectory,
    showIndividualPaths: true,
    showGroupCentroidPaths: true,
    showPoints: true,
    showLabels: true,
    showVariance: true,
    pointScale: 1,
    plotZoom: 1,
    flipX: false,
    flipY: false,
  };
  const visible = renderToStaticMarkup(createElement(OpenEnaLongitudinalTrajectory, common as never));
  const hidden = renderToStaticMarkup(createElement(OpenEnaLongitudinalTrajectory, {
    ...common,
    showCodeGraph: false,
  } as never));
  assert.doesNotMatch(hidden, /data-ena-code=/);
  assert.doesNotMatch(hidden, /ena-longitudinal-node-label/);
  for (const pattern of [/ena-individual-trajectory-path/g, /ena-group-centroid-path/g, /data-ena-group-centroid="true"/g, /ena-longitudinal-period-label/g, /ena-longitudinal-axis-label/g]) {
    assert.ok(count(visible, pattern) > 0, `visible fixture must exercise ${pattern.source}`);
    assert.equal(count(hidden, pattern), count(visible, pattern));
  }
});

test("ONA 2D and every shared layout pane hide mixed Codes, directed edges, arrows, and self-loops", () => {
  const fixture = orderedFixture();
  const common = {
    ...fixture,
    scope: { kind: "overall" as const },
    xDimension: "SVD1",
    yDimension: "SVD2",
    edgeThreshold: 0,
    edgeScale: 1,
    pointScale: 1,
    textScale: 1,
    plotZoom: 1,
    flipX: false,
    flipY: false,
    showPoints: true,
    showNetworks: true,
    showLabels: true,
    showUnitLabels: true,
    showVariance: true,
    compact: false,
  };
  const visible = renderToStaticMarkup(createElement(OpenEnaOrderedPlot, common));
  const hidden = renderToStaticMarkup(createElement(OpenEnaOrderedPlot, {
    ...common,
    codeVisibility: mixedVisibility,
    codeSourceByRenderedCode: sourceMap,
  }));
  assert.doesNotMatch(hidden, /data-ena-code="B"|data-ona-code-node-position="B"/);
  assert.doesNotMatch(hidden, /data-ona-ground="B"|data-ona-response="B"|data-ona-self-loop="B"|data-ona-chevron="(?:B-to-|[^\"]+-to-B)/);
  assert.match(hidden, /data-ena-code="A"/);
  assert.match(hidden, /data-ena-code="C"/);
  assert.ok(count(visible, /data-ona-unit-point="true"/g) > 0);
  assert.ok(count(visible, /ona-zero-axes/g) > 0);
  assert.equal(count(hidden, /data-ona-unit-point="true"/g), count(visible, /data-ona-unit-point="true"/g));
  assert.equal(count(hidden, /ona-zero-axes/g), count(visible, /ona-zero-axes/g));

  const layout = renderToStaticMarkup(createElement(OpenEnaOrderedResultLayout, {
    ...common,
    primaryGroupName: "first",
    secondaryGroupName: "second",
    centerMode: "plot",
    codeVisibility: mixedVisibility,
    codeSourceByRenderedCode: sourceMap,
  }));
  assert.equal(count(layout, /data-ena-code="B"/g), 0);
  assert.equal(count(layout, /data-ena-code="A"/g), 3);
  assert.equal(count(layout, /data-ena-code="C"/g), 3);
});

test("ONA 3D filters every directed layer and Code trace in lockstep without changing frame or units", () => {
  const visible = compileOpenEnaOrdered3dPlotSpec(ordered3dInput());
  const hidden = compileOpenEnaOrdered3dPlotSpec(ordered3dInput({
    codeVisibility: mixedVisibility,
    codeSourceByRenderedCode: sourceMap,
  }));
  const codeTrace = hidden.data.find((trace) => trace.meta.role === "code-node")!;
  assert.deepEqual(codeTrace.text, ["A", "C"]);
  for (const values of [codeTrace.x, codeTrace.y, codeTrace.z, codeTrace.text, codeTrace.customdata, codeTrace.marker?.color, codeTrace.marker?.size]) {
    assert.equal(Array.isArray(values) ? values.length : -1, 2);
  }
  const directedRoles = new Set(["ordered-edge-shaft", "ordered-edge-arrowhead", "ordered-self-loop-shaft", "ordered-self-loop-arrowhead"]);
  assert.ok(hidden.data.filter((trace) => directedRoles.has(trace.meta.role)).every((trace) => (
    trace.meta.ground !== "B" && trace.meta.response !== "B"
  )));
  assert.deepEqual(hidden.layout, visible.layout);
  assert.deepEqual(
    hidden.data.filter((trace) => ["unit-points", "axis", "axis-arrowhead", "axis-label"].includes(trace.meta.role)),
    visible.data.filter((trace) => ["unit-points", "axis", "axis-arrowhead", "axis-label"].includes(trace.meta.role)),
  );
});

test("ONA 3D hide and restore returns exact moved Code and directed geometry", () => {
  const nodeLayout = new Map([["A", new Map([["SVD1", 2.25], ["SVD2", -1.75], ["SVD3", 0.8]])]]);
  const visible = compileOpenEnaOrdered3dPlotSpec(ordered3dInput({ nodeLayout }));
  const hidden = compileOpenEnaOrdered3dPlotSpec(ordered3dInput({ nodeLayout, showCodeGraph: false }));
  const restored = compileOpenEnaOrdered3dPlotSpec(ordered3dInput({ nodeLayout, showCodeGraph: true }));
  const directedRoles = new Set(["ordered-edge-shaft", "ordered-edge-arrowhead", "ordered-self-loop-shaft", "ordered-self-loop-arrowhead"]);
  assert.equal(hidden.data.some((trace) => trace.meta.role === "code-node" || directedRoles.has(trace.meta.role)), false);
  assert.deepEqual(hidden.layout, visible.layout);
  assert.deepEqual(restored, visible);
  const codeTrace = restored.data.find((trace) => trace.meta.role === "code-node")!;
  const index = codeTrace.text!.indexOf("A");
  assert.deepEqual([codeTrace.x[index], codeTrace.y[index], codeTrace.z[index]], [2.25, -1.75, 0.8]);
});

test("Standard 3D comparison, primary, and secondary compiler branches share per-Code suppression", () => {
  const props = standardProps();
  const contrast = buildPairwiseGroupContrast(
    props.result,
    config,
    "first",
    "second",
    [props.xDimension, props.yDimension],
    "2026-09-06T00:00:00.000Z",
  );
  for (const plotKind of ["comparison", "primary", "secondary"] as const) {
    const input = {
      ...props,
      contrast,
      plotKind,
      codeVisibility: mixedVisibility,
      codeSourceByRenderedCode: sourceMap,
    };
    const spec = compileOpenEna3dPlotSpec(input);
    const baseline = compileOpenEna3dPlotSpec({ ...input, codeVisibility: undefined, codeSourceByRenderedCode: undefined });
    assert.deepEqual(spec.data.find((trace) => trace.meta.role === "code-node")?.text, ["A", "C"]);
    assert.ok(spec.data.filter((trace) => trace.meta.role === "network-edge").every((trace) => !String(trace.meta.edgeName).includes("B")));
    assert.deepEqual(
      spec.data.filter((trace) => trace.meta.role !== "code-node" && trace.meta.role !== "network-edge"),
      baseline.data.filter((trace) => trace.meta.role !== "code-node" && trace.meta.role !== "network-edge"),
    );
    assert.ok(spec.data.some((trace) => trace.meta.role === "axis"));
  }
});

test("3D Group contrast and all three ONA layout panes thread the same presentation boundary", () => {
  const props = standardProps();
  const contrast = buildPairwiseGroupContrast(
    props.result,
    config,
    "first",
    "second",
    [props.xDimension, props.yDimension],
    "2026-09-06T00:00:00.000Z",
  );
  const groupMarkup = renderToStaticMarkup(createElement(OpenEna3DGroupContrast, {
    result: props.result,
    contrast,
    groupColumn: "group",
    xDimension: props.xDimension,
    yDimension: props.yDimension,
    zDimension: props.zDimension,
    camera: "isometric",
    showPoints: true,
    showNetworks: true,
    showLabels: true,
    showUnitLabels: true,
    showVariance: true,
    edgeScale: 1,
    edgeThreshold: 0,
    pointScale: 1,
    plotZoom: 1,
    flipX: false,
    flipY: false,
    centerMode: "plot",
    codeVisibility: mixedVisibility,
    codeSourceByRenderedCode: sourceMap,
    copy: props.copy,
  }));
  assert.equal(count(groupMarkup, /data-ena-code-node-count="2"/g), 1, "the progressively mounted Comparison scene is already filtered");

  const fixture = orderedFixture();
  const orderedMarkup = renderToStaticMarkup(createElement(OpenEna3DOrderedResultLayout, {
    ...fixture,
    primaryGroupName: "first",
    secondaryGroupName: "second",
    centerMode: "plot",
    xDimension: "SVD1",
    yDimension: "SVD2",
    zDimension: "SVD3",
    camera: "isometric",
    edgeThreshold: 0,
    edgeScale: 1,
    pointScale: 1,
    plotZoom: 1,
    flipX: false,
    flipY: false,
    showPoints: true,
    showNetworks: true,
    showLabels: true,
    showUnitLabels: true,
    showVariance: true,
    codeVisibility: mixedVisibility,
    codeSourceByRenderedCode: sourceMap,
    copy: props.copy,
  }));
  assert.equal(count(orderedMarkup, /data-ena-code-node-count="2"/g), 3, "overall, Primary, and Secondary ONA scenes share the filter");
});

test("visibility mapping is complete, collision-safe, and own-property-safe", () => {
  const props = standardProps();
  const collidingMap = { A: "B", B: "A", C: "__proto__" };
  const visibility = Object.assign(Object.create(null) as Record<string, boolean>, {
    A: true,
    B: false,
  });
  Object.defineProperty(visibility, "__proto__", { value: false, enumerable: true });
  const spec = compileOpenEna3dPlotSpec({
    ...props,
    codeVisibility: visibility,
    codeSourceByRenderedCode: collidingMap,
  });
  assert.deepEqual(spec.data.find((trace) => trace.meta.role === "code-node")?.text, ["B"]);
  assert.throws(() => compileOpenEna3dPlotSpec({
    ...props,
    codeVisibility: visibility,
    codeSourceByRenderedCode: { A: "B", B: "A" },
  }), /mapping.*missing.*C/i);
  assert.throws(() => compileOpenEna3dPlotSpec({
    ...props,
    showCodeGraph: false,
    codeSourceByRenderedCode: { A: "B", B: "A" },
  }), /mapping.*missing.*C/i);
});

test("existing network and label preferences remain independent beneath Code visibility", () => {
  const props = standardProps();
  const noNetworks = compileOpenEna3dPlotSpec({ ...props, showNetworks: false, showLabels: true });
  assert.equal(noNetworks.data.some((trace) => trace.meta.role === "network-edge"), false);
  assert.equal(noNetworks.data.find((trace) => trace.meta.role === "code-node")?.mode, "markers+text");
  const noLabels = compileOpenEna3dPlotSpec({ ...props, showNetworks: true, showLabels: false });
  assert.ok(noLabels.data.some((trace) => trace.meta.role === "network-edge"));
  assert.equal(noLabels.data.find((trace) => trace.meta.role === "code-node")?.mode, "markers");
});
