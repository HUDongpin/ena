import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildOpenEnaOrderedPlotModel,
  buildOrderedEdgeGlyph,
  type OpenEnaOrderedNodeTotals,
} from "../lib/open-ena/ordered-plot";
import type { OpenEnaConfig, OpenEnaResult } from "../lib/open-ena/types";

const codes = ["A", "B", "C"];
const adjacencyKey = codes.flatMap((response, responseIndex) => (
  codes.map((ground, groundIndex) => ({
    source: ground,
    target: response,
    sourceIndex: groundIndex,
    targetIndex: responseIndex,
    name: `${ground} & ${response}`,
  }))
));

function weights(values: Partial<Record<string, number>>) {
  return Object.fromEntries(adjacencyKey.map((edge) => [edge.name, values[edge.name] ?? 0]));
}

function orderedFixture(): { result: OpenEnaResult; config: OpenEnaConfig } {
  const config: OpenEnaConfig = {
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
    orderPolicy: {
      kind: "columns",
      columns: ["turn"],
      comparators: { turn: "number" },
    },
    directionalMask: {
      schemaVersion: 1,
      codeOrder: codes,
      enabled: [
        [true, true, true],
        [true, true, true],
        [false, true, true],
      ],
    },
  };
  const first = weights({
    "A & A": 0.1,
    "A & B": 0.8,
    "B & A": 0.2,
    "B & B": 0.3,
    "A & C": 0.4,
    "C & A": 0.4,
  });
  const second = weights({
    "A & A": 0.5,
    "A & B": 0.4,
    "B & A": 0.4,
    "B & B": 0.7,
    "A & C": 0.2,
    "C & A": 0.2,
  });
  const connectionRows = [
    { ENA_UNIT: "u1", group: "first", ...weights({ "A & B": 4, "B & A": 1, "A & A": 2 }) },
    { ENA_UNIT: "u2", group: "second", ...weights({ "A & B": 6, "B & A": 3, "A & A": 1 }) },
    { ENA_UNIT: "u3", group: "second", ...weights({ "A & B": 2, "B & A": 5, "A & A": 4 }) },
    { ENA_UNIT: "u4", group: "second", ...weights({ "A & B": 8, "B & A": 7, "A & A": 3 }) },
  ];
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
        { ENA_UNIT: "u1", group: "first", SVD1: -0.6, SVD2: 0.2 },
        { ENA_UNIT: "u2", group: "second", SVD1: 0.2, SVD2: -0.1 },
        { ENA_UNIT: "u3", group: "second", SVD1: 0.4, SVD2: 0.3 },
        { ENA_UNIT: "u4", group: "second", SVD1: 0.7, SVD2: -0.2 },
      ],
      lineWeights: [],
      connectionCounts: connectionRows,
      pointsForProjection: [],
      rotation: {
        nodes: [
          { code: "A", SVD1: -0.8, SVD2: 0.5 },
          { code: "B", SVD1: 0.8, SVD2: 0.5 },
          { code: "C", SVD1: 0, SVD2: -0.8 },
        ],
      },
      variance: { SVD1: 0.6, SVD2: 0.3 },
    },
    groups: [
      { name: "first", count: 1, pointCount: 1, color: "#cc423a", meanPoint: { SVD1: -0.6, SVD2: 0.2 }, meanWeights: first },
      { name: "second", count: 3, pointCount: 3, color: "#218ebf", meanPoint: { SVD1: 0.43, SVD2: 0 }, meanWeights: second },
    ],
    dimensions: ["SVD1", "SVD2"],
    stats: {},
    statsDiagnostics: {
      correlations: "not-applicable-ordered-network",
      tests: "not-applicable-ordered-network",
      correlationUnitLimit: 2_000,
    },
    analyzedAt: "2026-08-22T00:00:00.000Z",
    projectionReference: null,
    executionProvenance: {
      schemaVersion: 1,
      configuration: config,
      analysisKind: "ona",
      networkType: "ordered",
      nodePositionMethod: "directed",
      directionalMask: config.directionalMask,
      ordering: {
        requestedPolicy: config.orderPolicy,
        resolvedPolicy: {
          kind: "columns",
          columns: ["turn"],
          comparators: { turn: "number" },
          direction: "ascending",
          missing: "reject",
          ties: "reject",
          stable: true,
        },
        responseRowSourceIndices: [0, 1, 2, 3],
      },
    },
  } as unknown as OpenEnaResult;
  return { result, config };
}

test("overall ordered plot uses the equal-unit weighted mean and never a two-group subtraction", () => {
  const { result, config } = orderedFixture();
  const model = buildOpenEnaOrderedPlotModel({
    result,
    config,
    scope: { kind: "overall" },
    xDimension: "SVD1",
    yDimension: "SVD2",
    edgeThreshold: 0,
  });

  const aToB = model.edges.find((edge) => edge.ground === "A" && edge.response === "B");
  assert.ok(aToB);
  assert.equal(aToB.normalizedMeanWeight, 0.5, "(1×0.8 + 3×0.4) / 4");
  assert.equal(aToB.rawAggregateCount, 20);
  assert.equal(aToB.chevron, true, "A→B is stronger than B→A in the overall mean");
  assert.equal(model.scopeLabel, "Overall ordered network");
  assert.equal(model.weightDefinition, "equal-unit normalized mean");
});

test("direction decisions are pairwise, exact ties show both chevrons, and masks stay asymmetric", () => {
  const { result, config } = orderedFixture();
  const model = buildOpenEnaOrderedPlotModel({
    result,
    config,
    scope: { kind: "group", name: "first" },
    xDimension: "SVD1",
    yDimension: "SVD2",
    edgeThreshold: 0,
  });

  const aToB = model.edges.find((edge) => edge.ground === "A" && edge.response === "B");
  const bToA = model.edges.find((edge) => edge.ground === "B" && edge.response === "A");
  const aToC = model.edges.find((edge) => edge.ground === "A" && edge.response === "C");
  const cToA = model.edges.find((edge) => edge.ground === "C" && edge.response === "A");
  assert.equal(aToB?.chevron, true);
  assert.equal(bToA?.chevron, false);
  assert.equal(aToC?.chevron, true);
  assert.equal(cToA?.chevron, true, "an exact reverse tie marks both directions");
  assert.equal(cToA?.maskEnabled, false, "C ground → A response is independently masked");
  assert.equal(aToC?.maskEnabled, true);
  assert.ok(!model.visibleEdges.some((edge) => edge.ground === "C" && edge.response === "A"));
});

test("edge geometry is a source-apex / response-base triangle with a separate keyboard hit path", () => {
  const glyph = buildOrderedEdgeGlyph({
    source: { x: 10, y: 50 },
    target: { x: 110, y: 50 },
    sourceRadius: 10,
    targetRadius: 14,
    relativeMagnitude: 0.5,
    lane: 1,
    showChevron: true,
  });

  assert.match(glyph.trianglePath, /^M 20(?:\.\d+)? 55(?:\.\d+)? L /);
  assert.match(glyph.hitPath, /^M /);
  assert.ok(glyph.chevronPath?.startsWith("M "));
  for (const value of Object.values(glyph.points).flatMap((point) => [point.x, point.y])) {
    assert.ok(Number.isFinite(value));
  }
  assert.throws(() => buildOrderedEdgeGlyph({
    source: { x: 1, y: 1 },
    target: { x: 1, y: 1 },
    sourceRadius: 10,
    targetRadius: 10,
    relativeMagnitude: 1,
    lane: 1,
    showChevron: false,
  }), /distinct source and response nodes/);
});

test("node sizing uses response-code totals when supplied and explicitly labels the fallback statistic", () => {
  const { result, config } = orderedFixture();
  const supplied: OpenEnaOrderedNodeTotals = {
    codeOrder: codes,
    overall: [100, 4, 1],
    groups: [
      { name: "first", totals: [8, 2, 1] },
      { name: "second", totals: [92, 2, 0] },
    ],
  };
  const exact = buildOpenEnaOrderedPlotModel({
    result,
    config,
    scope: { kind: "overall" },
    xDimension: "SVD1",
    yDimension: "SVD2",
    edgeThreshold: 0,
    nodeTotals: supplied,
  });
  assert.equal(exact.nodeSizeDefinition, "raw response-code total");
  assert.ok((exact.nodes.find((node) => node.code === "A")?.radius ?? 0)
    > (exact.nodes.find((node) => node.code === "B")?.radius ?? 0));

  const fallback = buildOpenEnaOrderedPlotModel({
    result,
    config,
    scope: { kind: "overall" },
    xDimension: "SVD1",
    yDimension: "SVD2",
    edgeThreshold: 0,
  });
  assert.equal(fallback.nodeSizeDefinition, "incoming normalized directed mass (response-total fallback)");
});

test("the ordered SVG renders triangles, pair chevrons, self inner discs, raw tooltips, and a keyboard edge list", async () => {
  const { result, config } = orderedFixture();
  const { default: OpenEnaOrderedPlot } = await import("../components/open-ena/OpenEnaOrderedPlot");
  const markup = renderToStaticMarkup(createElement(OpenEnaOrderedPlot, {
    result,
    config,
    scope: { kind: "overall" },
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
    showUnitLabels: false,
    showVariance: true,
    compact: false,
  }));

  assert.match(markup, /data-testid="open-ena-ordered-plot"/);
  assert.match(markup, /data-ona-edge-glyph="broadcast-triangle"/);
  assert.match(markup, /data-ona-ground="A"[^>]*data-ona-response="B"/);
  assert.match(markup, /data-ona-chevron="A-to-B"/);
  assert.match(markup, /data-ona-self-loop="A"/);
  assert.match(markup, /A ground\/source → B response\/target/);
  assert.match(markup, /raw aggregate count 20/);
  assert.match(markup, /aria-label="Visible directed connections"/);
  assert.match(markup, /data-ona-edge-hit-target[^>]*tabindex="0"/);
  assert.doesNotMatch(markup, /<line[^>]*data-ona-ground=/, "self-connections and directed edges must never use a degenerate line glyph");
});

test("malformed ordered adjacency and nonfinite scientific values fail closed", () => {
  const { result, config } = orderedFixture();
  const malformed = structuredClone(result);
  malformed.set.adjacencyKey[2] = {
    ...malformed.set.adjacencyKey[2],
    sourceIndex: 0,
  };
  assert.throws(() => buildOpenEnaOrderedPlotModel({
    result: malformed,
    config,
    scope: { kind: "overall" },
    xDimension: "SVD1",
    yDimension: "SVD2",
    edgeThreshold: 0,
  }), /response-major, ground-minor/);

  const nonfinite = structuredClone(result);
  nonfinite.groups[0].meanWeights["A & B"] = Number.POSITIVE_INFINITY;
  assert.throws(() => buildOpenEnaOrderedPlotModel({
    result: nonfinite,
    config,
    scope: { kind: "group", name: "first" },
    xDimension: "SVD1",
    yDimension: "SVD2",
    edgeThreshold: 0,
  }), /finite nonnegative/);
});
