import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildOpenEnaOrderedPlotModel,
  buildOrderedEdgeGlyph,
  type OpenEnaOrderedNodeTotals,
} from "../lib/open-ena/ordered-plot";
import {
  buildOpenEnaOrderedNetworkModel,
  type OpenEnaOrderedNetworkModel,
} from "../lib/open-ena/ordered-network-model";
import * as unitPointStyleContract from "../lib/open-ena/unit-point-style";
import type { OpenEnaUnitPointStyle } from "../lib/open-ena/unit-point-style";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";
import type { CanonicalOpenEnaConfig, OpenEnaConfig, OpenEnaResult } from "../lib/open-ena/types";

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

function buildSharedFixture(input: {
  result?: OpenEnaResult;
  config?: OpenEnaConfig;
  scope?: { kind: "overall" } | { kind: "group"; name: string };
  edgeThreshold?: number;
  nodeTotals?: OpenEnaOrderedNodeTotals;
} = {}) {
  const fixture = orderedFixture();
  return buildOpenEnaOrderedNetworkModel({
    result: input.result ?? fixture.result,
    config: input.config ?? fixture.config,
    scope: input.scope ?? { kind: "overall" },
    edgeThreshold: input.edgeThreshold ?? 0,
    ...(input.nodeTotals ? { nodeTotals: input.nodeTotals } : {}),
  });
}

function coordinateStrip(model: ReturnType<typeof buildOpenEnaOrderedPlotModel>): OpenEnaOrderedNetworkModel {
  return {
    scope: model.scope,
    codes: model.codes,
    nodes: model.nodes.map((node) => ({
      code: node.code,
      codeIndex: node.codeIndex,
      responseTotal: node.responseTotal,
      radius: node.radius,
    })),
    edges: model.edges,
    visibleEdges: model.visibleEdges,
    maximumNormalizedMeanWeight: model.maximumNormalizedMeanWeight,
    weightDefinition: model.weightDefinition,
    nodeSizeDefinition: model.nodeSizeDefinition,
  };
}

test("the pre-extraction 2D ordered plot model is fully characterized", () => {
  const { result, config } = orderedFixture();
  const model = buildOpenEnaOrderedPlotModel({
    result,
    config,
    scope: { kind: "overall" },
    xDimension: "SVD1",
    yDimension: "SVD2",
    edgeThreshold: 0,
  });
  const mean = {
    aa: (0.1 * 1 + 0.5 * 3) / 4,
    ba: (0.2 * 1 + 0.4 * 3) / 4,
    ca: (0.4 * 1 + 0.2 * 3) / 4,
    ab: (0.8 * 1 + 0.4 * 3) / 4,
    bb: (0.3 * 1 + 0.7 * 3) / 4,
    cb: 0,
    ac: (0.4 * 1 + 0.2 * 3) / 4,
    bc: 0,
    cc: 0,
  };
  const maximum = mean.bb;
  const expectedEdges = [
    { name: "A & A", ground: "A", response: "A", groundIndex: 0, responseIndex: 0, normalizedMeanWeight: mean.aa, rawAggregateCount: 10, reverseNormalizedMeanWeight: mean.aa, relativeMagnitude: mean.aa / maximum, maskEnabled: true, selfConnection: true, chevron: false, visible: true },
    { name: "B & A", ground: "B", response: "A", groundIndex: 1, responseIndex: 0, normalizedMeanWeight: mean.ba, rawAggregateCount: 16, reverseNormalizedMeanWeight: mean.ab, relativeMagnitude: mean.ba / maximum, maskEnabled: true, selfConnection: false, chevron: false, visible: true },
    { name: "C & A", ground: "C", response: "A", groundIndex: 2, responseIndex: 0, normalizedMeanWeight: mean.ca, rawAggregateCount: 0, reverseNormalizedMeanWeight: mean.ac, relativeMagnitude: mean.ca / maximum, maskEnabled: false, selfConnection: false, chevron: true, visible: false },
    { name: "A & B", ground: "A", response: "B", groundIndex: 0, responseIndex: 1, normalizedMeanWeight: mean.ab, rawAggregateCount: 20, reverseNormalizedMeanWeight: mean.ba, relativeMagnitude: mean.ab / maximum, maskEnabled: true, selfConnection: false, chevron: true, visible: true },
    { name: "B & B", ground: "B", response: "B", groundIndex: 1, responseIndex: 1, normalizedMeanWeight: mean.bb, rawAggregateCount: 0, reverseNormalizedMeanWeight: mean.bb, relativeMagnitude: 1, maskEnabled: true, selfConnection: true, chevron: false, visible: true },
    { name: "C & B", ground: "C", response: "B", groundIndex: 2, responseIndex: 1, normalizedMeanWeight: mean.cb, rawAggregateCount: 0, reverseNormalizedMeanWeight: mean.bc, relativeMagnitude: 0, maskEnabled: true, selfConnection: false, chevron: false, visible: false },
    { name: "A & C", ground: "A", response: "C", groundIndex: 0, responseIndex: 2, normalizedMeanWeight: mean.ac, rawAggregateCount: 0, reverseNormalizedMeanWeight: mean.ca, relativeMagnitude: mean.ac / maximum, maskEnabled: true, selfConnection: false, chevron: true, visible: true },
    { name: "B & C", ground: "B", response: "C", groundIndex: 1, responseIndex: 2, normalizedMeanWeight: mean.bc, rawAggregateCount: 0, reverseNormalizedMeanWeight: mean.cb, relativeMagnitude: 0, maskEnabled: true, selfConnection: false, chevron: false, visible: false },
    { name: "C & C", ground: "C", response: "C", groundIndex: 2, responseIndex: 2, normalizedMeanWeight: mean.cc, rawAggregateCount: 0, reverseNormalizedMeanWeight: mean.cc, relativeMagnitude: 0, maskEnabled: true, selfConnection: true, chevron: false, visible: false },
  ];
  const responseTotals = [mean.aa + mean.ba, mean.ab + mean.bb + mean.cb, mean.ac + mean.bc + mean.cc];
  const maximumResponseTotal = Math.max(...responseTotals);

  assert.deepEqual(model, {
    scope: { kind: "overall" },
    scopeLabel: "Overall ordered network",
    scopeColor: "#39736e",
    codes,
    nodes: [
      { code: "A", codeIndex: 0, x: -0.8, y: 0.5, responseTotal: responseTotals[0], radius: 10 + Math.sqrt(responseTotals[0] / maximumResponseTotal) * 12 },
      { code: "B", codeIndex: 1, x: 0.8, y: 0.5, responseTotal: responseTotals[1], radius: 10 + Math.sqrt(responseTotals[1] / maximumResponseTotal) * 12 },
      { code: "C", codeIndex: 2, x: 0, y: -0.8, responseTotal: responseTotals[2], radius: 10 + Math.sqrt(responseTotals[2] / maximumResponseTotal) * 12 },
    ],
    points: [
      { key: "u1:0", unit: "u1", group: "first", x: -0.6, y: 0.2 },
      { key: "u2:1", unit: "u2", group: "second", x: 0.2, y: -0.1 },
      { key: "u3:2", unit: "u3", group: "second", x: 0.4, y: 0.3 },
      { key: "u4:3", unit: "u4", group: "second", x: 0.7, y: -0.2 },
    ],
    edges: expectedEdges,
    visibleEdges: expectedEdges.filter((edge) => edge.visible),
    maximumNormalizedMeanWeight: maximum,
    weightDefinition: "equal-unit normalized mean",
    nodeSizeDefinition: "incoming normalized directed mass (response-total fallback)",
    xDimension: "SVD1",
    yDimension: "SVD2",
    xVariance: 0.6,
    yVariance: 0.3,
  });
  assert.deepEqual(model.visibleEdges.map((edge) => model.edges.indexOf(edge)), [0, 1, 3, 4, 6]);
  for (const edge of model.visibleEdges) assert.strictEqual(edge, model.edges[model.edges.indexOf(edge)]);
});

test("the shared ordered-network model has exact dimension-free keys and 2D coordinate-stripped parity", () => {
  const { result, config } = orderedFixture();
  const shared = buildOpenEnaOrderedNetworkModel({
    result,
    config,
    scope: { kind: "overall" },
    edgeThreshold: 0,
  });
  const plot = buildOpenEnaOrderedPlotModel({
    result,
    config,
    scope: { kind: "overall" },
    xDimension: "SVD1",
    yDimension: "SVD2",
    edgeThreshold: 0,
  });

  assert.deepEqual(shared, coordinateStrip(plot));
  assert.deepEqual(Object.keys(shared).sort(), [
    "codes",
    "edges",
    "maximumNormalizedMeanWeight",
    "nodeSizeDefinition",
    "nodes",
    "scope",
    "visibleEdges",
    "weightDefinition",
  ]);
  assert.deepEqual(Object.keys(shared.nodes[0]).sort(), ["code", "codeIndex", "radius", "responseTotal"]);
  assert.deepEqual(Object.keys(shared.edges[0]).sort(), [
    "chevron",
    "ground",
    "groundIndex",
    "maskEnabled",
    "name",
    "normalizedMeanWeight",
    "rawAggregateCount",
    "relativeMagnitude",
    "response",
    "responseIndex",
    "reverseNormalizedMeanWeight",
    "selfConnection",
    "visible",
  ]);
  assert.deepEqual(shared.visibleEdges.map((edge) => shared.edges.indexOf(edge)), [0, 1, 3, 4, 6]);
  const forbiddenKeys = new Set(["x", "y", "z", "points", "dimensions", "dimension", "variance", "xDimension", "yDimension", "zDimension"]);
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      assert.equal(forbiddenKeys.has(key), false, `shared model leaked dimension-dependent key ${key}`);
      visit(nested);
    }
  };
  visit(shared);
});

test("the shared model is invariant to rotation nodes, unit points, dimensions, and variance", () => {
  const { result, config } = orderedFixture();
  const expected = buildOpenEnaOrderedNetworkModel({
    result,
    config,
    scope: { kind: "overall" },
    edgeThreshold: 0.25,
  });
  const dimensionCorrupted = structuredClone(result);
  dimensionCorrupted.set.rotation.nodes = [{ code: "not-a-configured-code", SVD1: Number.NaN }];
  dimensionCorrupted.set.points = [{ ENA_UNIT: "changed", group: "missing", arbitrary: Number.POSITIVE_INFINITY }];
  dimensionCorrupted.set.variance = { SVD1: Number.NEGATIVE_INFINITY };
  dimensionCorrupted.dimensions = ["totally", "different", "axes"];

  assert.deepEqual(buildOpenEnaOrderedNetworkModel({
    result: dimensionCorrupted,
    config,
    scope: { kind: "overall" },
    edgeThreshold: 0.25,
  }), expected);
});

test("shared directed edges preserve response-major indexing, asymmetric masks, reciprocal ties, and self cells", () => {
  const model = buildSharedFixture({ scope: { kind: "group", name: "first" } });
  assert.deepEqual(model.edges.map((edge) => `${edge.ground}->${edge.response}`), [
    "A->A", "B->A", "C->A",
    "A->B", "B->B", "C->B",
    "A->C", "B->C", "C->C",
  ]);
  const cToA = model.edges[2];
  const aToC = model.edges[6];
  assert.deepEqual({
    ground: cToA.ground,
    response: cToA.response,
    groundIndex: cToA.groundIndex,
    responseIndex: cToA.responseIndex,
    weight: cToA.normalizedMeanWeight,
    reverse: cToA.reverseNormalizedMeanWeight,
    maskEnabled: cToA.maskEnabled,
    chevron: cToA.chevron,
    visible: cToA.visible,
  }, {
    ground: "C",
    response: "A",
    groundIndex: 2,
    responseIndex: 0,
    weight: 0.4,
    reverse: 0.4,
    maskEnabled: false,
    chevron: true,
    visible: false,
  });
  assert.deepEqual({
    ground: aToC.ground,
    response: aToC.response,
    groundIndex: aToC.groundIndex,
    responseIndex: aToC.responseIndex,
    weight: aToC.normalizedMeanWeight,
    reverse: aToC.reverseNormalizedMeanWeight,
    maskEnabled: aToC.maskEnabled,
    chevron: aToC.chevron,
    visible: aToC.visible,
  }, {
    ground: "A",
    response: "C",
    groundIndex: 0,
    responseIndex: 2,
    weight: 0.4,
    reverse: 0.4,
    maskEnabled: true,
    chevron: true,
    visible: true,
  });
  assert.deepEqual(model.edges.filter((edge) => edge.selfConnection).map((edge) => edge.name), ["A & A", "B & B", "C & C"]);
  assert.ok(model.edges.filter((edge) => edge.selfConnection).every((edge) => !edge.chevron));
});

test("shared overall and group scopes keep normalized means separate from authoritative raw aggregates", () => {
  const overall = buildSharedFixture();
  const first = buildSharedFixture({ scope: { kind: "group", name: "first" } });
  const second = buildSharedFixture({ scope: { kind: "group", name: "second" } });
  const edge = (model: OpenEnaOrderedNetworkModel) => model.edges.find((candidate) => candidate.name === "A & B");

  assert.deepEqual({ mean: edge(overall)?.normalizedMeanWeight, raw: edge(overall)?.rawAggregateCount }, { mean: 0.5, raw: 20 });
  assert.deepEqual({ mean: edge(first)?.normalizedMeanWeight, raw: edge(first)?.rawAggregateCount }, { mean: 0.8, raw: 4 });
  assert.deepEqual({ mean: edge(second)?.normalizedMeanWeight, raw: edge(second)?.rawAggregateCount }, { mean: 0.4, raw: 16 });
  assert.equal(overall.weightDefinition, "equal-unit normalized mean");
  assert.equal(first.weightDefinition, "group equal-unit normalized mean");
});

test("one synthetic all-units group remains a valid group scope without a group column", () => {
  const { result, config } = orderedFixture();
  const ungroupedConfig = structuredClone(config);
  ungroupedConfig.groupColumn = null;
  const ungroupedResult = structuredClone(result);
  ungroupedResult.groups = [{
    ...ungroupedResult.groups[0],
    name: "all-units",
    count: 4,
    pointCount: 4,
    meanWeights: weights({ "A & B": 0.25 }),
  }];
  ungroupedResult.executionProvenance!.configuration.groupColumn = null;

  const model = buildOpenEnaOrderedNetworkModel({
    result: ungroupedResult,
    config: ungroupedConfig,
    scope: { kind: "group", name: "all-units" },
    edgeThreshold: 0,
  });
  const aToB = model.edges.find((edge) => edge.name === "A & B");
  assert.deepEqual({
    mean: aToB?.normalizedMeanWeight,
    raw: aToB?.rawAggregateCount,
    definition: model.weightDefinition,
  }, {
    mean: 0.25,
    raw: 20,
    definition: "group equal-unit normalized mean",
  });
});

test("threshold visibility is inclusive, tolerance-bounded, and never removes scientific p² edges", () => {
  const equalBoundary = buildSharedFixture({ scope: { kind: "group", name: "first" }, edgeThreshold: 0.5 });
  assert.equal(equalBoundary.edges.length, 9);
  assert.deepEqual(equalBoundary.visibleEdges.map((edge) => edge.name), ["A & B", "A & C"]);
  assert.equal(equalBoundary.edges.find((edge) => edge.name === "A & C")?.relativeMagnitude, 0.5);

  const justAboveBoundary = buildSharedFixture({ scope: { kind: "group", name: "first" }, edgeThreshold: 0.5000000000000001 });
  assert.deepEqual(justAboveBoundary.visibleEdges.map((edge) => edge.name), ["A & B"]);
  const thresholdOne = buildSharedFixture({ scope: { kind: "group", name: "first" }, edgeThreshold: 1 });
  assert.deepEqual(thresholdOne.visibleEdges.map((edge) => edge.name), ["A & B"]);
  assert.equal(thresholdOne.edges.length, 9);

  const { result, config } = orderedFixture();
  const tolerance = structuredClone(result);
  tolerance.groups[0].meanWeights = weights({ "A & A": 1e-12, "A & B": 1e-12 + Number.EPSILON });
  const toleranceModel = buildOpenEnaOrderedNetworkModel({
    result: tolerance,
    config,
    scope: { kind: "group", name: "first" },
    edgeThreshold: 0,
  });
  assert.equal(toleranceModel.edges.find((edge) => edge.name === "A & A")?.visible, false, "ZERO_TOLERANCE itself is not visible");
  assert.equal(toleranceModel.edges.find((edge) => edge.name === "A & B")?.visible, true, "a finite weight just above ZERO_TOLERANCE is visible");

  const allZero = structuredClone(result);
  allZero.groups[0].meanWeights = weights({});
  const zeroModel = buildOpenEnaOrderedNetworkModel({
    result: allZero,
    config,
    scope: { kind: "group", name: "first" },
    edgeThreshold: 0,
  });
  assert.equal(zeroModel.maximumNormalizedMeanWeight, 1e-12);
  assert.equal(zeroModel.edges.length, 9);
  assert.equal(zeroModel.visibleEdges.length, 0);
  assert.ok(zeroModel.edges.every((edge) => edge.relativeMagnitude === 0));

  for (const edgeThreshold of [Number.NaN, Number.NEGATIVE_INFINITY, -Number.EPSILON, 1 + Number.EPSILON, Number.POSITIVE_INFINITY]) {
    assert.throws(() => buildSharedFixture({ edgeThreshold }), /threshold must be finite from zero to one/);
  }
});

test("fallback node mass ignores display threshold, excludes masked incoming edges, and supplied totals override it", () => {
  const thresholdZero = buildSharedFixture({ edgeThreshold: 0 });
  const thresholdOne = buildSharedFixture({ edgeThreshold: 1 });
  assert.deepEqual(thresholdOne.nodes, thresholdZero.nodes);
  assert.equal(thresholdZero.nodes[0].responseTotal, 0.75, "masked C→A is excluded from A incoming fallback mass");

  const { result, config } = orderedFixture();
  const unmaskedConfig = structuredClone(config);
  unmaskedConfig.directionalMask!.enabled[2][0] = true;
  const unmaskedResult = structuredClone(result);
  unmaskedResult.executionProvenance!.configuration = structuredClone(unmaskedConfig) as CanonicalOpenEnaConfig;
  unmaskedResult.executionProvenance!.directionalMask = structuredClone(unmaskedConfig.directionalMask!);
  const unmasked = buildOpenEnaOrderedNetworkModel({
    result: unmaskedResult,
    config: unmaskedConfig,
    scope: { kind: "overall" },
    edgeThreshold: 1,
  });
  assert.equal(unmasked.nodes[0].responseTotal, 1);

  const supplied: OpenEnaOrderedNodeTotals = {
    schemaVersion: 1,
    codeOrder: codes,
    overallResponseCodeTotals: [100, 4, 1],
    groups: [
      { name: "first", unitCount: 1, responseCodeTotals: [8, 2, 1] },
      { name: "second", unitCount: 3, responseCodeTotals: [92, 2, 0] },
    ],
  };
  const exact = buildSharedFixture({ edgeThreshold: 1, nodeTotals: supplied });
  assert.deepEqual(exact.nodes.map((node) => node.responseTotal), [100, 4, 1]);
  assert.equal(exact.nodes[0].radius, 22);
  assert.equal(exact.nodeSizeDefinition, "raw response-code total");
});

test("UI-side mask canonicalization remains compatible while stale execution provenance fails closed", () => {
  const { result, config } = orderedFixture();
  const reorderedUiConfig = structuredClone(config);
  reorderedUiConfig.directionalMask = {
    schemaVersion: 1,
    codeOrder: ["C", "A", "B"],
    enabled: [
      [true, false, true],
      [true, true, true],
      [true, true, true],
    ],
  };
  assert.deepEqual(
    buildOpenEnaOrderedNetworkModel({ result, config: reorderedUiConfig, scope: { kind: "overall" }, edgeThreshold: 0 }),
    buildOpenEnaOrderedNetworkModel({ result, config, scope: { kind: "overall" }, edgeThreshold: 0 }),
  );

  const staleProvenance = structuredClone(result);
  staleProvenance.executionProvenance!.directionalMask = structuredClone(reorderedUiConfig.directionalMask);
  staleProvenance.executionProvenance!.configuration.directionalMask = structuredClone(reorderedUiConfig.directionalMask);
  assert.throws(() => buildOpenEnaOrderedNetworkModel({
    result: staleProvenance,
    config: reorderedUiConfig,
    scope: { kind: "overall" },
    edgeThreshold: 0,
  }), /execution provenance/i);
});

test("shared provenance requires canonical ONA, ordered directed execution, aligned mask, and aligned order", () => {
  const fixture = orderedFixture();
  const invoke = (result: OpenEnaResult, config: OpenEnaConfig = fixture.config) => buildOpenEnaOrderedNetworkModel({
    result,
    config,
    scope: { kind: "overall" },
    edgeThreshold: 0,
  });

  const standardConfig = structuredClone(fixture.config);
  standardConfig.analysisKind = "ena";
  standardConfig.orderPolicy = null;
  standardConfig.directionalMask = null;
  assert.throws(() => invoke(fixture.result, standardConfig), /ordered-network|directed ordered-network/i);
  const malformedMaskConfig = structuredClone(fixture.config);
  malformedMaskConfig.directionalMask!.enabled[0].pop();
  assert.throws(() => invoke(fixture.result, malformedMaskConfig), /directional mask/i);

  const cases: Array<[string, (candidate: OpenEnaResult) => void]> = [
    ["missing execution provenance", (candidate) => { delete candidate.executionProvenance; }],
    ["wrong analysis kind", (candidate) => { candidate.executionProvenance!.analysisKind = "ena"; }],
    ["wrong network type", (candidate) => { candidate.executionProvenance!.networkType = "standard"; }],
    ["wrong node method", (candidate) => { candidate.executionProvenance!.nodePositionMethod = "undirected"; }],
    ["wrong configuration", (candidate) => { candidate.executionProvenance!.configuration.windowSizeBack = 99; }],
    ["missing ordering", (candidate) => { candidate.executionProvenance!.ordering = null; }],
    ["stale requested order", (candidate) => {
      candidate.executionProvenance!.ordering!.requestedPolicy = { kind: "source-row", confirmed: true };
    }],
    ["stale resolved order", (candidate) => {
      const resolved = candidate.executionProvenance!.ordering!.resolvedPolicy;
      if (resolved.kind === "columns") resolved.columns = ["stale-turn"];
    }],
    ["empty source-index permutation", (candidate) => {
      candidate.executionProvenance!.ordering!.responseRowSourceIndices = [];
    }],
    ["sparse source-index permutation", (candidate) => {
      candidate.executionProvenance!.ordering!.responseRowSourceIndices = new Array(4);
    }],
    ["duplicate source-index permutation", (candidate) => {
      candidate.executionProvenance!.ordering!.responseRowSourceIndices = [0, 0, 2, 3];
    }],
    ["out-of-range source-index permutation", (candidate) => {
      candidate.executionProvenance!.ordering!.responseRowSourceIndices = [0, 1, 2, 4];
    }],
    ["missing execution mask", (candidate) => { candidate.executionProvenance!.directionalMask = null; }],
    ["stale execution mask cell", (candidate) => {
      candidate.executionProvenance!.directionalMask!.enabled[2][0] = true;
    }],
    ["stale configuration mask cell", (candidate) => {
      candidate.executionProvenance!.configuration.directionalMask!.enabled[2][0] = true;
    }],
  ];
  for (const [label, mutate] of cases) {
    const candidate = structuredClone(fixture.result);
    mutate(candidate);
    assert.throws(() => invoke(candidate), /execution provenance|directed ordered-network/i, label);
  }

  const runtimeKind = structuredClone(fixture.result);
  runtimeKind.set.networkType = "standard";
  runtimeKind.set.functionParams.networkType = "standard";
  assert.throws(() => invoke(runtimeKind), /ordered-network|runtime network|provenance/i);
});

test("shared adjacency rejects incomplete, transposed, mislabeled, and stale code-column p² contracts", () => {
  const fixture = orderedFixture();
  const invoke = (result: OpenEnaResult) => buildOpenEnaOrderedNetworkModel({
    result,
    config: fixture.config,
    scope: { kind: "overall" },
    edgeThreshold: 0,
  });
  const cases: Array<[string, (candidate: OpenEnaResult) => void]> = [
    ["missing adjacency cell", (candidate) => { candidate.set.adjacencyKey.pop(); }],
    ["missing code column", (candidate) => { candidate.set.codeColumns.pop(); }],
    ["swapped response-major cells", (candidate) => {
      [candidate.set.adjacencyKey[2], candidate.set.adjacencyKey[6]] = [candidate.set.adjacencyKey[6], candidate.set.adjacencyKey[2]];
    }],
    ["transposed source and target", (candidate) => {
      candidate.set.adjacencyKey[2] = {
        ...candidate.set.adjacencyKey[2],
        source: "A",
        target: "C",
        sourceIndex: 0,
        targetIndex: 2,
        name: "A & C",
      };
      candidate.set.codeColumns[2] = "A & C";
    }],
    ["wrong source label", (candidate) => { candidate.set.adjacencyKey[2].source = "X"; }],
    ["wrong edge name", (candidate) => { candidate.set.adjacencyKey[2].name = "C -> A"; }],
    ["wrong code column", (candidate) => { candidate.set.codeColumns[2] = "A & C"; }],
    ["missing reciprocal disguised as duplicate", (candidate) => {
      candidate.set.adjacencyKey[2] = { ...candidate.set.adjacencyKey[6] };
      candidate.set.codeColumns[2] = candidate.set.adjacencyKey[2].name;
    }],
  ];
  for (const [label, mutate] of cases) {
    const candidate = structuredClone(fixture.result);
    mutate(candidate);
    assert.throws(() => invoke(candidate), /p²|response-major, ground-minor|source\/target contract/i, label);
  }

  const staleCodeOrder = structuredClone(fixture.result);
  staleCodeOrder.set.codes = ["C", "B", "A"];
  assert.throws(() => invoke(staleCodeOrder), /code order/i);
});

test("shared groups, normalized means, raw counts, and fallback additions fail closed on invalid arithmetic", () => {
  const fixture = orderedFixture();
  const invoke = (
    result: OpenEnaResult,
    config: OpenEnaConfig = fixture.config,
    scope: { kind: "overall" } | { kind: "group"; name: string } = { kind: "overall" },
  ) => buildOpenEnaOrderedNetworkModel({ result, config, scope, edgeThreshold: 0 });
  const cases: Array<[string, (candidate: OpenEnaResult) => void, RegExp]> = [
    ["empty groups", (candidate) => { candidate.groups = []; }, /nonempty groups/],
    ["zero count", (candidate) => { candidate.groups[0].count = 0; }, /positive safe unit counts/],
    ["fractional count", (candidate) => { candidate.groups[0].count = 1.5; }, /positive safe unit counts/],
    ["unsafe count", (candidate) => { candidate.groups[0].count = Number.MAX_SAFE_INTEGER + 1; }, /positive safe unit counts/],
    ["unsafe total count", (candidate) => {
      candidate.groups[0].count = Number.MAX_SAFE_INTEGER;
      candidate.groups[1].count = Number.MAX_SAFE_INTEGER;
    }, /unit count total|arithmetic range/],
    ["nonfinite mean", (candidate) => { candidate.groups[0].meanWeights["A & B"] = Number.POSITIVE_INFINITY; }, /finite nonnegative/],
    ["negative mean", (candidate) => { candidate.groups[0].meanWeights["A & B"] = -1; }, /finite nonnegative/],
    ["nonfinite raw", (candidate) => { candidate.set.connectionCounts[0]["A & B"] = Number.NaN; }, /finite nonnegative/],
    ["negative raw", (candidate) => { candidate.set.connectionCounts[0]["A & B"] = -1; }, /finite nonnegative/],
    ["raw overflow", (candidate) => {
      candidate.set.connectionCounts[0]["A & B"] = Number.MAX_VALUE;
      candidate.set.connectionCounts[1]["A & B"] = Number.MAX_VALUE;
    }, /exceeds finite arithmetic range/],
  ];
  for (const [label, mutate, expected] of cases) {
    const candidate = structuredClone(fixture.result);
    mutate(candidate);
    assert.throws(() => invoke(candidate), expected, label);
  }

  const fallbackOverflow = structuredClone(fixture.result);
  fallbackOverflow.groups[0].meanWeights = weights({
    "A & A": Number.MAX_VALUE,
    "B & A": Number.MAX_VALUE,
  });
  assert.throws(
    () => invoke(fallbackOverflow, fixture.config, { kind: "group", name: "first" }),
    /incoming normalized directed mass.*finite arithmetic range/i,
  );

  assert.throws(() => invoke(fixture.result, fixture.config, { kind: "group", name: "missing" }), /not present/);
  const groupWithoutColumnConfig = structuredClone(fixture.config);
  groupWithoutColumnConfig.groupColumn = null;
  const groupWithoutColumnResult = structuredClone(fixture.result);
  groupWithoutColumnResult.executionProvenance!.configuration.groupColumn = null;
  assert.throws(() => invoke(groupWithoutColumnResult, groupWithoutColumnConfig, { kind: "group", name: "first" }), /group column|scope/i);
});

test("ordered response-node summaries reject schema, code, group, unit-count, value, and sum corruption", () => {
  const valid: OpenEnaOrderedNodeTotals = {
    schemaVersion: 1,
    codeOrder: codes,
    overallResponseCodeTotals: [100, 4, 1],
    groups: [
      { name: "first", unitCount: 1, responseCodeTotals: [8, 2, 1] },
      { name: "second", unitCount: 3, responseCodeTotals: [92, 2, 0] },
    ],
  };
  const cases: Array<[string, (candidate: OpenEnaOrderedNodeTotals) => void]> = [
    ["schema", (candidate) => { (candidate as { schemaVersion: number }).schemaVersion = 2; }],
    ["code order", (candidate) => { candidate.codeOrder = ["C", "B", "A"]; }],
    ["missing group", (candidate) => { candidate.groups.pop(); }],
    ["duplicate group", (candidate) => { candidate.groups[1].name = "first"; }],
    ["unit count", (candidate) => { candidate.groups[0].unitCount = 2; }],
    ["group length", (candidate) => { candidate.groups[0].responseCodeTotals.pop(); }],
    ["nonfinite group total", (candidate) => { candidate.groups[0].responseCodeTotals[0] = Number.NaN; }],
    ["negative overall", (candidate) => { candidate.overallResponseCodeTotals[0] = -1; }],
    ["sparse overall", (candidate) => { candidate.overallResponseCodeTotals = new Array(codes.length); }],
    ["sum mismatch", (candidate) => { candidate.overallResponseCodeTotals[0] = 101; }],
  ];
  for (const [label, mutate] of cases) {
    const candidate = structuredClone(valid);
    mutate(candidate);
    assert.throws(() => buildSharedFixture({ nodeTotals: candidate }), /node totals|response total|grouped response total|ordered node overall totals/i, label);
  }
});

test("builders do not mutate result or config and the 2D wrapper still rejects bad selected coordinates", () => {
  const { result, config } = orderedFixture();
  const resultBefore = structuredClone(result);
  const configBefore = structuredClone(config);
  buildOpenEnaOrderedNetworkModel({ result, config, scope: { kind: "overall" }, edgeThreshold: 0.25 });
  buildOpenEnaOrderedPlotModel({
    result,
    config,
    scope: { kind: "overall" },
    xDimension: "SVD1",
    yDimension: "SVD2",
    edgeThreshold: 0.25,
  });
  assert.deepEqual(result, resultBefore);
  assert.deepEqual(config, configBefore);

  const missingNode = structuredClone(result);
  missingNode.set.rotation.nodes!.pop();
  assert.throws(() => buildOpenEnaOrderedPlotModel({
    result: missingNode,
    config,
    scope: { kind: "overall" },
    xDimension: "SVD1",
    yDimension: "SVD2",
    edgeThreshold: 0,
  }), /one node|missing code/);
  const nonfiniteNode = structuredClone(result);
  nonfiniteNode.set.rotation.nodes![0].SVD1 = Number.NaN;
  assert.throws(() => buildOpenEnaOrderedPlotModel({
    result: nonfiniteNode,
    config,
    scope: { kind: "overall" },
    xDimension: "SVD1",
    yDimension: "SVD2",
    edgeThreshold: 0,
  }), /node.*SVD1.*finite/i);
  const missingPoint = structuredClone(result);
  delete missingPoint.set.points[0].SVD2;
  assert.throws(() => buildOpenEnaOrderedPlotModel({
    result: missingPoint,
    config,
    scope: { kind: "overall" },
    xDimension: "SVD1",
    yDimension: "SVD2",
    edgeThreshold: 0,
  }), /point 1 SVD2 must be finite/i);
});

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

test("edge geometry is a source-apex / response-base triangle whose presentation scale changes the filled glyph", () => {
  const glyph = buildOrderedEdgeGlyph({
    source: { x: 10, y: 50 },
    target: { x: 110, y: 50 },
    sourceRadius: 10,
    targetRadius: 14,
    relativeMagnitude: 0.5,
    visualScale: 1,
    lane: 1,
    showChevron: true,
  });

  assert.match(glyph.trianglePath, /^M 20(?:\.\d+)? 55(?:\.\d+)? L /);
  assert.match(glyph.hitPath, /^M /);
  assert.ok(glyph.chevronPath?.startsWith("M "));
  for (const value of Object.values(glyph.points).flatMap((point) => [point.x, point.y])) {
    assert.ok(Number.isFinite(value));
  }
  const small = buildOrderedEdgeGlyph({
    source: { x: 10, y: 50 },
    target: { x: 110, y: 50 },
    sourceRadius: 10,
    targetRadius: 14,
    relativeMagnitude: 0.5,
    visualScale: 0.5,
    lane: 1,
    showChevron: true,
  });
  const large = buildOrderedEdgeGlyph({
    source: { x: 10, y: 50 },
    target: { x: 110, y: 50 },
    sourceRadius: 10,
    targetRadius: 14,
    relativeMagnitude: 0.5,
    visualScale: 2,
    lane: 1,
    showChevron: true,
  });
  assert.notEqual(small.trianglePath, large.trianglePath);
  assert.notEqual(small.chevronPath, large.chevronPath);
  assert.ok(
    Math.hypot(
      large.points.baseLeft.x - large.points.baseRight.x,
      large.points.baseLeft.y - large.points.baseRight.y,
    ) > Math.hypot(
      small.points.baseLeft.x - small.points.baseRight.x,
      small.points.baseLeft.y - small.points.baseRight.y,
    ),
  );
  assert.throws(() => buildOrderedEdgeGlyph({
    source: { x: 1, y: 1 },
    target: { x: 1, y: 1 },
    sourceRadius: 10,
    targetRadius: 10,
    relativeMagnitude: 1,
    visualScale: 1,
    lane: 1,
    showChevron: false,
  }), /distinct source and response nodes/);
});

test("node sizing uses response-code totals when supplied and explicitly labels the fallback statistic", () => {
  const { result, config } = orderedFixture();
  const supplied: OpenEnaOrderedNodeTotals = {
    schemaVersion: 1,
    codeOrder: codes,
    overallResponseCodeTotals: [100, 4, 1],
    groups: [
      { name: "first", unitCount: 1, responseCodeTotals: [8, 2, 1] },
      { name: "second", unitCount: 3, responseCodeTotals: [92, 2, 0] },
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

test("the ordered SVG renders scaled triangles, pair chevrons, self inner discs, raw tooltips, and one external edge-list stop", async () => {
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
  assert.match(markup, /<svg[^>]*role="group"[^>]*class="open-ena-ordered-svg"/);
  assert.match(markup, /data-ona-edge-glyph="broadcast-triangle"/);
  assert.match(markup, /data-ona-ground="A"[^>]*data-ona-response="B"/);
  assert.match(markup, /data-ona-chevron="A-to-B"/);
  assert.match(markup, /data-ona-self-loop="A"/);
  assert.match(markup, /A ground\/source → B response\/target/);
  assert.match(markup, /raw aggregate count 20/);
  assert.match(markup, /aria-label="Visible directed connections"/);
  assert.match(markup, /data-ona-edge-hit-target="true"[^>]*aria-hidden="true"/);
  assert.doesNotMatch(markup, /data-ona-edge-hit-target[^>]*tabindex=/);
  assert.doesNotMatch(markup, /data-ona-self-loop[^>]*tabindex=/);
  assert.doesNotMatch(markup, /<li[^>]*tabindex=/);
  assert.doesNotMatch(markup, /<line[^>]*data-ona-ground=/, "self-connections and directed edges must never use a degenerate line glyph");

  const compactMarkup = renderToStaticMarkup(createElement(OpenEnaOrderedPlot, {
    result,
    config,
    scope: { kind: "group", name: "first" },
    xDimension: "SVD1",
    yDimension: "SVD2",
    edgeThreshold: 0,
    edgeScale: 2,
    pointScale: 1,
    textScale: 1,
    plotZoom: 1,
    flipX: true,
    flipY: false,
    showPoints: false,
    showNetworks: true,
    showLabels: true,
    showUnitLabels: false,
    showVariance: false,
    compact: true,
    copy: {
      groundSourceLabel: "來源",
      responseTargetLabel: "回應",
      directionLegendLabel: "順序網絡方向圖例",
      flippedLabel: "已翻轉",
    },
  }));
  assert.match(compactMarkup, /aria-label="順序網絡方向圖例"/);
  assert.match(compactMarkup, /A 來源 → B 回應/);
  assert.match(compactMarkup, /SVD1 · 已翻轉/);
  assert.match(compactMarkup, /<svg[^>]*viewBox="0 0 920 430"/);
  assert.doesNotMatch(compactMarkup, /data-ona-unit-shape-legend="true"/);
  assert.match(compactMarkup, /<details[^>]*class="ona-visible-edge-summary"/);
});

test("six ONA groups use circle markers with stable non-color inner styles and an accessible numbered legend", async () => {
  const { result, config } = orderedFixture();
  const { default: OpenEnaOrderedPlot } = await import("../components/open-ena/OpenEnaOrderedPlot");
  const groupNames = ["zeta", "alpha", "echo", "bravo", "delta", "charlie"];
  const sixGroupResult = structuredClone(result);
  sixGroupResult.groups = groupNames.map((name, index) => ({
    ...sixGroupResult.groups[index % sixGroupResult.groups.length],
    name,
    count: 1,
    pointCount: 1,
    color: "#52636a",
  }));
  sixGroupResult.set.points = groupNames.map((group, index) => ({
    ENA_UNIT: `unit-${index + 1}`,
    group,
    SVD1: -0.75 + index * 0.3,
    SVD2: index % 2 === 0 ? -0.25 : 0.25,
  }));

  const render = (candidate: OpenEnaResult) => renderToStaticMarkup(createElement(OpenEnaOrderedPlot, {
    result: candidate,
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
  const styleMap = (markup: string) => new Map(
    [...markup.matchAll(/data-ona-unit-point="true"[^>]*data-ona-group="([^"]+)"[^>]*data-ona-point-shape="circle"[^>]*data-ona-point-style="([^"]+)"/g)]
      .map((match) => [match[1], match[2]]),
  );

  const markup = render(sixGroupResult);
  const reordered = structuredClone(sixGroupResult);
  reordered.groups.reverse();
  const reorderedMarkup = render(reordered);
  const mapping = styleMap(markup);
  const exportTarget = markup.match(/<svg[^>]*class="open-ena-ordered-svg"[^>]*>[\s\S]*?<\/svg>/)?.[0];

  assert.equal(mapping.size, 6);
  assert.equal(new Set(mapping.values()).size, 6, "six groups must remain distinguishable without color");
  assert.deepEqual(styleMap(reorderedMarkup), mapping, "group-name-to-style mapping must ignore result group order");
  const pointGroups = [...markup.matchAll(/<g[^>]*data-ona-unit-point="true"[^>]*>([\s\S]*?)<\/g>/g)];
  assert.equal(pointGroups.length, 6);
  for (const pointGroup of pointGroups) {
    const wrapper = pointGroup[0].match(/^<g[^>]*>/)?.[0] ?? "";
    assert.match(wrapper, /data-ona-point-shape="circle"/);
    assert.match(wrapper, /data-ona-point-style="(?:solid|inner-ring|center-dot|horizontal-bar|plus|cross)"/);
    assert.match(wrapper, /role="img"/);
    assert.match(wrapper, /aria-label="[^"]*unit-[1-6][^"]*group[^"]*horizontal axis[^"]*vertical axis[^"]*"/i);
    assert.match(pointGroup[1], /^<title>[^<]+<\/title>/, "the wrapper title must be its first accessible description child");
    assert.equal(pointGroup[1].match(/<(circle|line|path|rect|polygon)\b/)?.[1], "circle", "the first graphic element must be the analytic-unit outer circle");
    assert.doesNotMatch(pointGroup[1], /<(?:rect|polygon)\b/, "unit marker glyphs may not use rect or polygon");
  }
  assert.ok(exportTarget, "the plot must expose its main SVG export target");
  assert.match(exportTarget, /^<svg[^>]*viewBox="0 0 920 682"/);
  assert.match(exportTarget, /role="list"[^>]*class="ona-unit-shape-legend-svg"[^>]*data-ona-unit-shape-legend="true"[^>]*aria-label="units"/);
  const sortedGroupNames = [...groupNames].sort((left, right) => left.localeCompare(right));
  const englishStyleNames = getOpenEnaCopy("en").ona.plot.pointStyleNames;
  for (const [index, group] of sortedGroupNames.entries()) {
    const style = mapping.get(group) as OpenEnaUnitPointStyle | undefined;
    assert.ok(style);
    const legendEntry = exportTarget.match(new RegExp(`<g[^>]*data-ona-group-legend="${group}"[^>]*data-ona-point-shape="circle"[^>]*data-ona-point-style="${style}"[^>]*>[\\s\\S]*?<\\/g>`))?.[0];
    assert.ok(legendEntry, `${group} legend entry must be nested in the exported SVG`);
    assert.match(legendEntry, /<circle\b[^>]*fill="#52636a"/, "each exported legend entry must include its marker example and color");
    assert.match(legendEntry, new RegExp(`<desc>[^<]*${group}[^<]*color #52636a[^<]*${englishStyleNames[style]}[^<]*<\\/desc>`));
    assert.match(legendEntry, new RegExp(`<text[^>]*>[\\s\\S]*?<tspan[^>]*>${index + 1}\\. ${group}<\\/tspan>[\\s\\S]*?<\\/text>`), "legend must visibly number the stable group order");
  }
  assert.equal((markup.match(/data-ona-unit-shape-legend="true"/g) ?? []).length, 1, "the exported SVG legend must be authoritative, not duplicated externally");
});

test("the existing two-group ONA fixture renders both analytic-unit groups as circles", async () => {
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

  const pointWrappers = [...markup.matchAll(/<g[^>]*data-ona-unit-point="true"[^>]*>/g)].map((match) => match[0]);
  assert.equal(pointWrappers.length, 4);
  assert.deepEqual(new Set(pointWrappers.map((wrapper) => wrapper.match(/data-ona-group="([^"]+)"/)?.[1])), new Set(["first", "second"]));
  for (const wrapper of pointWrappers) {
    assert.match(wrapper, /data-ona-point-shape="circle"/);
    assert.match(wrapper, /data-ona-point-style="(?:solid|inner-ring|center-dot|horizontal-bar|plus|cross)"/);
  }
  const pointGroups = [...markup.matchAll(/<g[^>]*data-ona-unit-point="true"[^>]*>([\s\S]*?)<\/g>/g)];
  assert.equal(pointGroups.length, 4);
  for (const pointGroup of pointGroups) {
    assert.match(pointGroup[1], /^<title>[^<]+<\/title>/);
    assert.equal(pointGroup[1].match(/<(circle|line|path|rect|polygon)\b/)?.[1], "circle");
  }
});

test("unit point style assignments are deterministic for empty, duplicate, reordered, cycling, case, and Unicode names", () => {
  const assignments = unitPointStyleContract.openEnaUnitPointStyleAssignments;
  assert.deepEqual([...assignments([])], []);
  const names = ["中文", "alpha", "Alpha", "éclair", "zeta", "bravo", "charlie", "delta", "echo", "foxtrot", "alpha"];
  const expected = [...assignments(names)];
  assert.equal(expected.length, 10, "duplicate group names must be removed");
  assert.deepEqual([...assignments([...names].reverse())], expected, "input order must not affect assignments");
  assert.deepEqual(expected.map(([name]) => name), ["Alpha", "alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "zeta", "éclair", "中文"]);
  assert.equal(expected[0]?.[1], "solid");
  assert.equal(expected[6]?.[1], "solid", "the seventh sorted group must cycle to the first style");
});

function relativeLuminance(hex: string) {
  const normalized = hex.slice(1);
  const channels = [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255);
  return channels.map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  )).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrastRatio(left: string, right: string) {
  const [lighter, darker] = [relativeLuminance(left), relativeLuminance(right)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

test("unit point inner glyph colors remain contrast-safe on default, white, near-white, dark, and shorthand fills", () => {
  const glyphColors = Reflect.get(unitPointStyleContract, "openEnaUnitPointGlyphColors") as unknown;
  assert.equal(typeof glyphColors, "function", "the shared style module must export a contrast-safe glyph-color resolver");
  if (typeof glyphColors !== "function") return;
  for (const fill of ["#d27448", "#39736e", "#ffffff", "#f8f9fa", "#111827", "#ABC"]) {
    const colors = glyphColors(fill) as { foreground: string; halo: string | null };
    assert.match(colors.foreground, /^#[0-9a-f]{6}$/i);
    const normalizedFill = fill.length === 4
      ? `#${[...fill.slice(1)].map((value) => value.repeat(2)).join("")}`
      : fill;
    assert.ok(contrastRatio(normalizedFill, colors.foreground) >= 4.5, `${fill} must have high-contrast inner glyphs`);
  }
  const fallback = glyphColors("var(--unknown-color)") as { foreground: string; halo: string | null };
  assert.match(fallback.foreground, /^#[0-9a-f]{6}$/i);
  assert.match(fallback.halo ?? "", /^#[0-9a-f]{6}$/i, "unparseable fills need a dual-contrast fallback");
});

test("SSR legend contract preserves graphemes and declares bounded SVG widths and dynamic rows for twelve diverse group names", async () => {
  const { result, config } = orderedFixture();
  const { default: OpenEnaOrderedPlot } = await import("../components/open-ena/OpenEnaOrderedPlot");
  const names = [
    "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
    "MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM",
    "Latin中文Mixed文本WWMM研究群組",
    "Emoji🙂🚀🧠📊repeated🙂🚀group",
    "Punctuation.,;:!?—()[]group",
    "Combining café résumé cöoperate group",
    "Advanced collaborative epistemic reasoning cohort alpha",
    "以協作知識建構為核心的第一研究群組",
    "面向人工智能协作学习的第二研究组",
    "多語言協作探究與論證學習群組",
    "多语言协作探究与论证学习组",
    "資料驅動的共同調節學習研究群組",
  ];
  const manyGroups = structuredClone(result);
  manyGroups.groups = names.map((name, index) => ({
    ...manyGroups.groups[index % manyGroups.groups.length],
    name,
    count: 1,
    pointCount: 1,
  }));
  manyGroups.set.points = names.map((group, index) => ({
    ENA_UNIT: `long-unit-${index + 1}`,
    group,
    SVD1: -0.8 + (index % 6) * 0.3,
    SVD2: -0.45 + Math.floor(index / 6) * 0.9,
  }));
  const markup = renderToStaticMarkup(createElement(OpenEnaOrderedPlot, {
    result: manyGroups,
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
  const exportTarget = markup.match(/<svg[^>]*class="open-ena-ordered-svg"[^>]*>[\s\S]*?<\/svg>/)?.[0] ?? "";
  const exportHeight = Number(exportTarget.match(/viewBox="0 0 920 ([0-9.]+)"/)?.[1]);
  assert.ok(exportHeight > 742, "wrapped rows must grow beyond the old fixed four-row legend height");
  const entries = [...exportTarget.matchAll(/<g[^>]*data-ona-group-legend="([^"]+)"[^>]*data-ona-legend-row="([0-9]+)"[^>]*data-ona-legend-line-count="([0-9]+)"[^>]*transform="translate\(([0-9.]+) ([0-9.]+)\)"[^>]*>([\s\S]*?)<\/g>/g)];
  assert.equal(entries.length, 12);
  assert.deepEqual(new Set(entries.map((entry) => Number(entry[2]))), new Set([0, 1, 2, 3]));
  const rows = new Map<number, { y: number; maximumLines: number }>();
  for (const [group, row, lineCount, x, y, body] of entries.map((entry) => entry.slice(1))) {
    assert.ok(Number(x) >= 0 && Number(x) < 920, `${group} must stay within the SVG width`);
    assert.ok(Number(y) > 590, `${group} row ${row} must remain below the plotting area`);
    const textMatch = body.match(/<text[^>]*data-ona-legend-label="[^"]+"[^>]*data-ona-legend-max-width="([0-9.]+)"[^>]*>([\s\S]*?)<\/text>/);
    assert.ok(textMatch, `${group} must declare its available SVG text width`);
    const maximumWidth = Number(textMatch[1]);
    const lines = [...textMatch[2].matchAll(/<tspan[^>]*textLength="([0-9.]+)"[^>]*lengthAdjust="spacingAndGlyphs"[^>]*>([^<]*)<\/tspan>/g)]
      .map((match) => ({ declaredWidth: Number(match[1]), text: match[2] }));
    assert.equal(lines.length, Number(lineCount));
    for (const line of lines) {
      assert.ok(line.declaredWidth > 0 && line.declaredWidth <= maximumWidth, `${group} tspan must declare a hard SVG width within its column`);
      assert.doesNotMatch(line.text, /^\p{Mark}/u, `${group} must not split a combining mark from its grapheme`);
    }
    const number = [...names].sort((left, right) => left < right ? -1 : left > right ? 1 : 0).indexOf(group) + 1;
    assert.equal(lines.map((line) => line.text).join(""), `${number}. ${group}`, "wrapped tspans must preserve every grapheme in the complete visible numbered group name");
    const rowIndex = Number(row);
    const current = rows.get(rowIndex);
    rows.set(rowIndex, {
      y: Number(y),
      maximumLines: Math.max(current?.maximumLines ?? 0, Number(lineCount)),
    });
  }
  const orderedRows = [...rows.entries()].sort(([left], [right]) => left - right);
  for (let index = 1; index < orderedRows.length; index += 1) {
    const previous = orderedRows[index - 1][1];
    const current = orderedRows[index][1];
    assert.ok(current.y - previous.y >= Math.max(30, previous.maximumLines * 16 + 8), "legend rows must use the preceding row's maximum wrapped-line height");
  }
});

test("ordered point and legend metadata use human-readable localized copy without implementation slugs", async () => {
  const { result, config } = orderedFixture();
  const { default: OpenEnaOrderedPlot } = await import("../components/open-ena/OpenEnaOrderedPlot");
  const locales = [
    { locale: "en" as const, expected: /Analytic unit|Group|horizontal axis|vertical axis/ },
    { locale: "zh-hant" as const, expected: /分析單位|群組|橫軸|縱軸/ },
    { locale: "zh-hans" as const, expected: /分析单位|组|横轴|纵轴/ },
  ];
  for (const { locale, expected } of locales) {
    const copy = getOpenEnaCopy(locale).ona.plot;
    const localizedStyles = Object.values(copy.pointStyleNames);
    assert.equal(localizedStyles.length, 6);
    assert.equal(new Set(localizedStyles).size, 6);
    assert.doesNotMatch(localizedStyles.join(" "), /inner-ring|center-dot|horizontal-bar/);
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
      copy,
    }));
    const metadata = [...markup.matchAll(/aria-label="([^"]*)"|<(?:title|desc)>([^<]*)<\/(?:title|desc)>/g)]
      .map((match) => match[1] ?? match[2] ?? "")
      .join("\n");
    assert.match(metadata, expected);
    assert.doesNotMatch(metadata, /inner-ring|center-dot|horizontal-bar/);
    if (locale !== "en") assert.doesNotMatch(metadata, /\b(?:Unit|Group|color|point style|circle marker)\b/i);
  }
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
