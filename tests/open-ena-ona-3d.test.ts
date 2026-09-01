import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Row } from "jena-js";
import { OpenEnaCapabilityError } from "../lib/open-ena/capabilities";
import { buildOpenEnaOrderedNetworkModel } from "../lib/open-ena/ordered-network-model";
import {
  DIRECTED_EDGE_WIDTH_BUCKETS,
  EDGE_ENDPOINT_INSET_RATIO,
  RECIPROCAL_LANE_OFFSET_RATIO,
  SELF_LOOP_RADIUS_RATIO,
  SELF_LOOP_SEGMENTS,
  compileOpenEnaOrdered3dPlotSpec,
  type CompileOpenEnaOrdered3dPlotInput,
} from "../lib/open-ena/ordered-plot3d";
import {
  compileOpenEna3dPlotSpec,
  type OpenEna3dPlotSpec,
  type OpenEna3dTrace,
} from "../lib/open-ena/plot3d";
import { openEnaUnitPointStyleAssignments } from "../lib/open-ena/unit-point-style";
import type {
  CanonicalOpenEnaConfig,
  OpenEnaConfig,
  OpenEnaOrderedResponseNodeSummary,
  OpenEnaResult,
} from "../lib/open-ena/types";

const DIMENSIONS = ["SVD1", "SVD2", "SVD3"] as const;
const MAIN_CODES = ["A", "B", "C"];
const DIRECTED_ROLES = new Set([
  "ordered-edge-shaft",
  "ordered-edge-arrowhead",
  "ordered-self-loop-shaft",
  "ordered-self-loop-arrowhead",
]);

interface Fixture {
  result: OpenEnaResult;
  config: OpenEnaConfig;
  nodeTotals?: OpenEnaOrderedResponseNodeSummary;
}

function adjacencyFor(codes: readonly string[]) {
  return codes.flatMap((response, responseIndex) => (
    codes.map((ground, groundIndex) => ({
      source: ground,
      target: response,
      sourceIndex: groundIndex,
      targetIndex: responseIndex,
      name: `${ground} & ${response}`,
    }))
  ));
}

function mainWeight(groupIndex: number, ground: string, response: string) {
  const first: Record<string, number> = {
    "A->A": 0.4,
    "B->A": 0.5,
    "C->A": 0.2,
    "A->B": 0.8,
    "B->B": 0,
    "C->B": 0,
    "A->C": 0.3,
    "B->C": 0.1,
    "C->C": 0.25,
  };
  const second: Record<string, number> = {
    "A->A": 0.2,
    "B->A": 0.7,
    "C->A": 0.1,
    "A->B": 0.6,
    "B->B": 0,
    "C->B": 0,
    "A->C": 0.4,
    "B->C": 0.05,
    "C->C": 0.15,
  };
  return (groupIndex % 2 === 0 ? first : second)[`${ground}->${response}`] ?? 0.12;
}

function nodeCoordinates(codes: readonly string[]) {
  if (codes.length === 3 && codes.every((code, index) => code === MAIN_CODES[index])) {
    return [
      { code: "A", SVD1: -1, SVD2: 0, SVD3: -0.2 },
      { code: "B", SVD1: 1, SVD2: 0.4, SVD3: 0.3 },
      { code: "C", SVD1: 0.1, SVD2: -0.9, SVD3: 0.15 },
    ];
  }
  return codes.map((code, index) => {
    const angle = (index / codes.length) * Math.PI * 2;
    const radius = 1 + index * 0.01;
    return {
      code,
      SVD1: Math.cos(angle) * radius,
      SVD2: Math.sin(angle) * radius,
      SVD3: index / Math.max(1, codes.length - 1) - 0.5,
    };
  });
}

function orderedFixture(options: {
  codes?: string[];
  groupNames?: string[];
  dense?: boolean;
} = {}): Fixture {
  const codes = options.codes ?? [...MAIN_CODES];
  const groupNames = options.groupNames ?? ["first", "second"];
  const adjacencyKey = adjacencyFor(codes);
  const directionalMask = {
    schemaVersion: 1 as const,
    codeOrder: [...codes],
    enabled: codes.map(() => codes.map(() => true)),
  };
  if (!options.dense && codes.length === 3) directionalMask.enabled[0]![2] = false;
  const config: OpenEnaConfig = {
    analysisKind: "ona",
    unitColumns: ["unit"],
    conversationColumns: ["horizon"],
    groupColumn: "group",
    codes: [...codes],
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
    directionalMask,
  };
  const groups = groupNames.map((name, groupIndex) => ({
    name,
    count: 1,
    pointCount: 1,
    color: ["#cc423a", "#218ebf", "#6e55a3", "#b7791f", "#248466", "#a63f72"][groupIndex % 6],
    meanPoint: { SVD1: groupIndex * 0.08, SVD2: -groupIndex * 0.04, SVD3: groupIndex * 0.02 },
    meanWeights: Object.fromEntries(adjacencyKey.map((edge, edgeIndex) => [
      edge.name,
      options.dense
        ? 0.2 + ((edgeIndex + groupIndex) % DIRECTED_EDGE_WIDTH_BUCKETS) * 0.1
        : mainWeight(groupIndex, edge.source, edge.target),
    ])),
  }));
  const points: Row[] = groupNames.map((name, index) => {
    if (groupNames.length === 2 && codes.length === 3) {
      return index === 0
        ? { ENA_UNIT: "u1", group: name, SVD1: -0.72, SVD2: 0.13, SVD3: -0.08 }
        : { ENA_UNIT: "u2", group: name, SVD1: 0.58, SVD2: -0.27, SVD3: 0.24 };
    }
    return {
      ENA_UNIT: `u${index + 1}`,
      group: name,
      SVD1: Math.cos(index + 0.3) * 0.7,
      SVD2: Math.sin(index + 0.3) * 0.7,
      SVD3: (index - groupNames.length / 2) * 0.05,
    };
  });
  const connectionCounts = groupNames.map((name, groupIndex) => ({
    ENA_UNIT: `u${groupIndex + 1}`,
    group: name,
    ...Object.fromEntries(adjacencyKey.map((edge, edgeIndex) => [
      edge.name,
      (groupIndex + 1) * (edgeIndex + 1),
    ])),
  }));
  const result = {
    set: {
      networkType: "ordered",
      functionParams: { networkType: "ordered" },
      modelType: "EndPoint",
      codes: [...codes],
      codeColumns: adjacencyKey.map((edge) => edge.name),
      adjacencyKey,
      units: ["unit"],
      conversation: ["horizon"],
      points,
      lineWeights: [],
      connectionCounts,
      pointsForProjection: [],
      rotation: {
        nodes: nodeCoordinates(codes),
        rotationColumns: [...DIMENSIONS],
        rotationMatrix: [],
        eigenvalues: [1, 0.5, 0.25],
        centerVector: [],
      },
      variance: { SVD1: 0.55, SVD2: 0.3, SVD3: 0.15 },
    },
    groups,
    dimensions: [...DIMENSIONS],
    stats: {},
    statsDiagnostics: {
      correlations: "not-applicable-ordered-network",
      tests: "not-applicable-ordered-network",
      correlationUnitLimit: 2_000,
    },
    analyzedAt: "2026-09-01T00:00:00.000Z",
    projectionReference: null,
    executionProvenance: {
      schemaVersion: 1,
      configuration: structuredClone(config) as CanonicalOpenEnaConfig,
      analysisKind: "ona",
      networkType: "ordered",
      nodePositionMethod: "directed",
      directionalMask: structuredClone(directionalMask),
      ordering: {
        requestedPolicy: structuredClone(config.orderPolicy!),
        resolvedPolicy: {
          kind: "columns",
          columns: ["turn"],
          comparators: { turn: "number" },
          direction: "ascending",
          missing: "reject",
          ties: "reject",
          stable: true,
        },
        responseRowSourceIndices: groupNames.map((_, index) => index),
      },
    },
  } as unknown as OpenEnaResult;
  const nodeTotals = groupNames.length === 2 && codes.length === 3
    ? {
        schemaVersion: 1 as const,
        codeOrder: [...codes],
        overallResponseCodeTotals: [5, 4, 3],
        groups: [
          { name: groupNames[0]!, unitCount: 1, responseCodeTotals: [2, 1, 1] },
          { name: groupNames[1]!, unitCount: 1, responseCodeTotals: [3, 3, 2] },
        ],
      }
    : undefined;
  return { result, config, ...(nodeTotals ? { nodeTotals } : {}) };
}

function compileInput(
  fixture: Fixture,
  overrides: Partial<CompileOpenEnaOrdered3dPlotInput> = {},
): CompileOpenEnaOrdered3dPlotInput {
  return {
    result: fixture.result,
    config: fixture.config,
    scope: { kind: "overall" },
    xDimension: "SVD1",
    yDimension: "SVD2",
    zDimension: "SVD3",
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
    ...(fixture.nodeTotals ? { nodeTotals: fixture.nodeTotals } : {}),
    ...overrides,
  };
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== "object" || seen.has(value as object)) return value;
  seen.add(value as object);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function numberAt(values: Array<number | null> | undefined, index: number) {
  const value = values?.[index];
  assert.equal(typeof value, "number");
  assert.ok(Number.isFinite(value));
  return value as number;
}

function requiredRotationNodes(result: OpenEnaResult) {
  const nodes = result.set.rotation.nodes;
  assert.ok(nodes, "the ONA fixture requires fitted rotation nodes");
  return nodes;
}

function pointAt(trace: OpenEna3dTrace, index: number): [number, number, number] {
  return [numberAt(trace.x, index), numberAt(trace.y, index), numberAt(trace.z, index)];
}

function vectorSubtract(left: readonly number[], right: readonly number[]) {
  return [left[0]! - right[0]!, left[1]! - right[1]!, left[2]! - right[2]!] as const;
}

function dot(left: readonly number[], right: readonly number[]) {
  return left[0]! * right[0]! + left[1]! * right[1]! + left[2]! * right[2]!;
}

function cross(left: readonly number[], right: readonly number[]) {
  return [
    left[1]! * right[2]! - left[2]! * right[1]!,
    left[2]! * right[0]! - left[0]! * right[2]!,
    left[0]! * right[1]! - left[1]! * right[0]!,
  ] as const;
}

function magnitude(value: readonly number[]) {
  return Math.sqrt(dot(value, value));
}

function normalize(value: readonly number[]) {
  const length = magnitude(value);
  assert.ok(length > 0);
  return value.map((coordinate) => coordinate / length) as [number, number, number];
}

function directedTraces(spec: OpenEna3dPlotSpec) {
  return spec.data.filter((trace) => DIRECTED_ROLES.has(trace.meta.role));
}

function renderedEdgeIndices(spec: OpenEna3dPlotSpec, roles: readonly string[]) {
  return spec.data
    .filter((trace) => roles.includes(trace.meta.role))
    .flatMap((trace) => trace.meta.orderedEdgeIndices ?? []);
}

function offDiagonalGeometry(spec: OpenEna3dPlotSpec, edgeIndex: number) {
  const shaft = spec.data.find((trace) => (
    trace.meta.role === "ordered-edge-shaft"
      && trace.meta.orderedEdgeIndices?.includes(edgeIndex)
  ));
  const arrowhead = spec.data.find((trace) => (
    trace.meta.role === "ordered-edge-arrowhead"
      && trace.meta.orderedEdgeIndices?.includes(edgeIndex)
  ));
  assert.ok(shaft);
  assert.ok(arrowhead);
  assert.equal(shaft.meta.widthBucket, arrowhead.meta.widthBucket);
  const shaftPosition = shaft.meta.orderedEdgeIndices!.indexOf(edgeIndex) * 3;
  const arrowPosition = arrowhead.meta.orderedEdgeIndices!.indexOf(edgeIndex);
  return {
    start: pointAt(shaft, shaftPosition),
    shaftEnd: pointAt(shaft, shaftPosition + 1),
    tip: pointAt(arrowhead, arrowPosition),
    direction: [
      numberAt(arrowhead.u, arrowPosition),
      numberAt(arrowhead.v, arrowPosition),
      numberAt(arrowhead.w, arrowPosition),
    ] as [number, number, number],
  };
}

function parseScientificHover(value: string | null | undefined) {
  if (typeof value !== "string") assert.fail("scientific hover text must be present");
  const normalized = value.match(/Normalized mean: ([^<]+)/u)?.[1];
  const raw = value.match(/Raw aggregate: ([^<]+)/u)?.[1];
  assert.ok(normalized);
  assert.ok(raw);
  return { normalized: Number(normalized), raw: Number(raw) };
}

function networkGeometrySnapshot(spec: OpenEna3dPlotSpec) {
  return directedTraces(spec).map((trace) => ({
    role: trace.meta.role,
    bucket: trace.meta.widthBucket,
    edges: trace.meta.orderedEdgeIndices,
    x: trace.x,
    y: trace.y,
    z: trace.z,
    u: trace.u,
    v: trace.v,
    w: trace.w,
    customdata: trace.customdata,
  }));
}

test("the ordered ONA 3D compiler exposes the frozen constants and one shared-model dependency", () => {
  assert.equal(DIRECTED_EDGE_WIDTH_BUCKETS, 8);
  assert.equal(RECIPROCAL_LANE_OFFSET_RATIO, 0.018);
  assert.equal(EDGE_ENDPOINT_INSET_RATIO, 0.025);
  assert.equal(SELF_LOOP_RADIUS_RATIO, 0.055);
  assert.equal(SELF_LOOP_SEGMENTS, 24);

  const source = readFileSync(new URL("../lib/open-ena/ordered-plot3d.ts", import.meta.url), "utf8");
  assert.equal(source.match(/\bbuildOpenEnaOrderedNetworkModel\s*\(/gu)?.length, 1);
  for (const forbidden of [
    "meanWeights",
    "connectionCounts",
    "adjacencyKey",
    "directionalMask",
    "orderedAudit",
    "analyzeDataset",
    "buildPairwiseGroupContrast",
    "runOpenEnaInference",
    "jena.worker",
  ]) {
    assert.equal(source.includes(forbidden), false, `ordered compiler must not read or reproduce ${forbidden}`);
  }
});

test("deep-frozen fitted inputs compile without mutation and repeated calls are deterministic", () => {
  const fixture = orderedFixture();
  const resultBefore = structuredClone(fixture.result);
  const configBefore = structuredClone(fixture.config);
  const totalsBefore = structuredClone(fixture.nodeTotals!);
  deepFreeze(fixture.result);
  deepFreeze(fixture.config);
  deepFreeze(fixture.nodeTotals!);

  const first = compileOpenEnaOrdered3dPlotSpec(compileInput(fixture));
  const second = compileOpenEnaOrdered3dPlotSpec(compileInput(fixture));

  assert.deepEqual(second, first);
  assert.deepEqual(fixture.result, resultBefore);
  assert.deepEqual(fixture.config, configBefore);
  assert.deepEqual(fixture.nodeTotals, totalsBefore);
  assert.deepEqual(first.diagnostics, { degenerateDimensions: [] });
  assert.ok(first.data.every((trace) => trace.meta.analysisKind === "ona" && trace.meta.scope === "overall"));
});

test("unit and code-node traces retain exact fitted XYZ while six stable point styles use circular bases and noninteractive overlays", () => {
  const groupNames = ["zeta", "alpha", "mu", "beta", "omega", "delta"];
  const fixture = orderedFixture({ groupNames });
  const spec = compileOpenEnaOrdered3dPlotSpec(compileInput(fixture, { showNetworks: false }));
  const baseTraces = spec.data.filter((trace) => trace.meta.role === "unit-points");
  const overlayTraces = spec.data.filter((trace) => trace.meta.role === "ordered-unit-point-overlay");
  const assignments = openEnaUnitPointStyleAssignments(groupNames);

  assert.deepEqual(baseTraces.map((trace) => trace.meta.groupName), [...groupNames].sort());
  assert.equal(baseTraces.length, 6);
  assert.ok(baseTraces.every((trace) => (
    trace.marker?.symbol === "circle"
      && trace.showlegend === true
      && trace.meta.markerSymbol === "circle"
      && trace.meta.pointStyle === assignments.get(trace.meta.groupName!)
      && trace.name.includes(String((trace.meta.groupIndex ?? -1) + 1))
  )));
  assert.equal(overlayTraces.length, 5, "solid points need no overlay; the other five stable styles do");
  for (const overlay of overlayTraces) {
    const base = baseTraces.find((trace) => trace.meta.groupName === overlay.meta.groupName);
    assert.ok(base);
    assert.deepEqual([overlay.x, overlay.y, overlay.z], [base.x, base.y, base.z]);
    assert.equal(overlay.hoverinfo, "skip");
    assert.equal(overlay.showlegend, false);
    assert.equal(overlay.customdata, undefined);
  }
  for (const base of baseTraces) {
    const groupName = base.meta.groupName!;
    const expected = fixture.result.set.points.filter((row) => row.group === groupName);
    assert.deepEqual(base.x, expected.map((row) => row.SVD1));
    assert.deepEqual(base.y, expected.map((row) => row.SVD2));
    assert.deepEqual(base.z, expected.map((row) => row.SVD3));
  }

  const nodeTrace = spec.data.find((trace) => trace.meta.role === "code-node");
  assert.ok(nodeTrace);
  const nodes = requiredRotationNodes(fixture.result);
  assert.deepEqual(nodeTrace.text, fixture.config.codes);
  assert.deepEqual(nodeTrace.x, nodes.map((row) => row.SVD1));
  assert.deepEqual(nodeTrace.y, nodes.map((row) => row.SVD2));
  assert.deepEqual(nodeTrace.z, nodes.map((row) => row.SVD3));
  assert.ok(Array.isArray(nodeTrace.marker?.size));
  assert.equal((nodeTrace.marker?.size as number[]).length, fixture.config.codes.length);
});

test("overall, primary, and secondary specs copy every rendered scientific field from the shared p-squared model without inferential marks or wording", () => {
  const fixture = orderedFixture();
  const scopes = [
    { scope: { kind: "overall" } as const, metadataScope: "overall" as const },
    { scope: { kind: "group", name: "first", presentationRole: "primary" } as const, metadataScope: "primary" as const },
    { scope: { kind: "group", name: "second", presentationRole: "secondary" } as const, metadataScope: "secondary" as const },
  ];

  for (const { scope, metadataScope } of scopes) {
    const model = buildOpenEnaOrderedNetworkModel({
      result: fixture.result,
      config: fixture.config,
      scope,
      edgeThreshold: 0,
      nodeTotals: fixture.nodeTotals,
    });
    const spec = compileOpenEnaOrdered3dPlotSpec(compileInput(fixture, { scope }));
    const shaftIndices = renderedEdgeIndices(spec, ["ordered-edge-shaft", "ordered-self-loop-shaft"]);
    const coneIndices = renderedEdgeIndices(spec, ["ordered-edge-arrowhead", "ordered-self-loop-arrowhead"]);
    const expectedIndices = model.visibleEdges.map((edge) => model.edges.indexOf(edge));
    assert.deepEqual([...shaftIndices].sort((a, b) => a - b), expectedIndices);
    assert.deepEqual([...coneIndices].sort((a, b) => a - b), expectedIndices);
    assert.ok(spec.data.every((trace) => trace.meta.analysisKind === "ona" && trace.meta.scope === metadataScope));
    assert.equal(spec.data.some((trace) => trace.meta.role === "group-mean" || trace.meta.role === "confidence-interval"), false);

    for (const edge of model.visibleEdges) {
      const edgeIndex = model.edges.indexOf(edge);
      const shaft = spec.data.find((trace) => (
        (trace.meta.role === "ordered-edge-shaft" || trace.meta.role === "ordered-self-loop-shaft")
          && trace.meta.orderedEdgeIndices?.includes(edgeIndex)
      ));
      assert.ok(shaft);
      const position = shaft.meta.orderedEdgeIndices!.indexOf(edgeIndex)
        * (edge.selfConnection ? SELF_LOOP_SEGMENTS + 2 : 3);
      const hover = shaft.customdata?.[position];
      assert.match(String(hover), new RegExp(`${edge.ground}.*(?:→|&rarr;).*${edge.response}`, "u"));
      const science = parseScientificHover(hover);
      assert.equal(science.normalized, edge.normalizedMeanWeight);
      assert.equal(science.raw, edge.rawAggregateCount);
      if (shaft.meta.edgeCount === 1) {
        assert.equal(shaft.meta.ground, edge.ground);
        assert.equal(shaft.meta.response, edge.response);
        assert.equal(shaft.meta.groundIndex, edge.groundIndex);
        assert.equal(shaft.meta.responseIndex, edge.responseIndex);
        assert.equal(shaft.meta.selfConnection, edge.selfConnection);
        assert.equal(shaft.meta.normalizedMeanWeight, edge.normalizedMeanWeight);
        assert.equal(shaft.meta.rawAggregateCount, edge.rawAggregateCount);
        assert.equal(shaft.meta.relativeMagnitude, edge.relativeMagnitude);
      }
    }

    assert.doesNotMatch(
      JSON.stringify(spec),
      /subtraction|difference|stronger group|confidence interval|effect size|p-value|p value|inference|causal/iu,
    );
  }
});

test("off-diagonal cones point ground-to-response with target insets and stable opposite reciprocal lanes", () => {
  const fixture = orderedFixture();
  const spec = compileOpenEnaOrdered3dPlotSpec(compileInput(fixture));
  const model = buildOpenEnaOrderedNetworkModel({
    result: fixture.result,
    config: fixture.config,
    scope: { kind: "overall" },
    edgeThreshold: 0,
    nodeTotals: fixture.nodeTotals,
  });
  const aToBIndex = model.edges.findIndex((edge) => edge.ground === "A" && edge.response === "B");
  const bToAIndex = model.edges.findIndex((edge) => edge.ground === "B" && edge.response === "A");
  const aToB = offDiagonalGeometry(spec, aToBIndex);
  const bToA = offDiagonalGeometry(spec, bToAIndex);
  const nodeByCode = new Map(requiredRotationNodes(fixture.result).map((row) => [String(row.code), [row.SVD1, row.SVD2, row.SVD3] as number[]]));
  const a = nodeByCode.get("A")!;
  const b = nodeByCode.get("B")!;
  const aToBVector = vectorSubtract(b, a);
  const unitDirection = normalize(aToBVector);
  const sceneExtent = Math.abs(spec.layout.scene.xaxis.range[1]);
  const expectedInset = sceneExtent * EDGE_ENDPOINT_INSET_RATIO;

  assert.ok(dot(aToB.direction, aToBVector) > 0);
  assert.ok(dot(bToA.direction, vectorSubtract(a, b)) > 0);
  assert.equal((spec.data.find((trace) => trace.meta.role === "ordered-edge-arrowhead")?.anchor), "tip");
  assert.ok(Math.abs(dot(vectorSubtract(aToB.start, a), unitDirection) - expectedInset) < 1e-10);
  assert.ok(Math.abs(dot(vectorSubtract(b, aToB.tip), unitDirection) - expectedInset) < 1e-10);
  assert.ok(magnitude(vectorSubtract(aToB.shaftEnd, aToB.start)) > 0);

  const lowToHighBase = a.map((coordinate, index) => coordinate + unitDirection[index]! * expectedInset);
  const highToLowDirection = unitDirection.map((coordinate) => -coordinate);
  const highToLowBase = b.map((coordinate, index) => coordinate + highToLowDirection[index]! * expectedInset);
  const laneA = vectorSubtract(aToB.start, lowToHighBase);
  const laneB = vectorSubtract(bToA.start, highToLowBase);
  assert.ok(magnitude(laneA) > 0);
  assert.ok(magnitude(laneB) > 0);
  assert.ok(dot(laneA, laneB) < 0);
  assert.ok(Math.abs(magnitude(laneA) - sceneExtent * RECIPROCAL_LANE_OFFSET_RATIO) < 1e-10);
  assert.ok(Math.abs(magnitude(laneB) - sceneExtent * RECIPROCAL_LANE_OFFSET_RATIO) < 1e-10);
});

test("diagonal cells render only as deterministic closed coplanar 24-segment loops with tangent cones independent of camera", () => {
  const fixture = orderedFixture();
  const isometric = compileOpenEnaOrdered3dPlotSpec(compileInput(fixture, { camera: "isometric" }));
  const xy = compileOpenEnaOrdered3dPlotSpec(compileInput(fixture, { camera: "xy" }));
  const model = buildOpenEnaOrderedNetworkModel({
    result: fixture.result,
    config: fixture.config,
    scope: { kind: "overall" },
    edgeThreshold: 0,
    nodeTotals: fixture.nodeTotals,
  });
  const diagonalIndex = model.edges.findIndex((edge) => edge.ground === "A" && edge.response === "A");
  assert.equal(renderedEdgeIndices(isometric, ["ordered-edge-shaft"]).includes(diagonalIndex), false);
  const loop = isometric.data.find((trace) => (
    trace.meta.role === "ordered-self-loop-shaft"
      && trace.meta.orderedEdgeIndices?.includes(diagonalIndex)
  ));
  const arrow = isometric.data.find((trace) => (
    trace.meta.role === "ordered-self-loop-arrowhead"
      && trace.meta.orderedEdgeIndices?.includes(diagonalIndex)
  ));
  assert.ok(loop);
  assert.ok(arrow);
  const loopPosition = loop.meta.orderedEdgeIndices!.indexOf(diagonalIndex) * (SELF_LOOP_SEGMENTS + 2);
  const points = Array.from({ length: SELF_LOOP_SEGMENTS + 1 }, (_, offset) => pointAt(loop, loopPosition + offset));
  assert.deepEqual(points[0], points.at(-1));
  assert.equal(loop.x[loopPosition + SELF_LOOP_SEGMENTS + 1], null);
  const firstVector = vectorSubtract(points[1]!, points[0]!);
  const secondVector = vectorSubtract(points[2]!, points[0]!);
  const planeNormal = normalize(cross(firstVector, secondVector));
  assert.ok(points.every((point) => Math.abs(dot(vectorSubtract(point, points[0]!), planeNormal)) < 1e-9));
  const center = [0, 1, 2].map((axis) => (
    points.slice(0, SELF_LOOP_SEGMENTS).reduce((sum, point) => sum + point[axis]!, 0) / SELF_LOOP_SEGMENTS
  ));
  const arrowPosition = arrow.meta.orderedEdgeIndices!.indexOf(diagonalIndex);
  const tip = pointAt(arrow, arrowPosition);
  const tangent = [numberAt(arrow.u, arrowPosition), numberAt(arrow.v, arrowPosition), numberAt(arrow.w, arrowPosition)];
  assert.ok(magnitude(tangent) > 0);
  assert.ok(Math.abs(dot(vectorSubtract(tip, center), tangent)) < 1e-9);
  assert.deepEqual(networkGeometrySnapshot(xy), networkGeometrySnapshot(isometric));
  assert.notDeepEqual(xy.layout.scene.camera, isometric.layout.scene.camera);
});

test("mask, zero tolerance, and threshold only hide scene marks while display controls leave scientific geometry and inputs unchanged", () => {
  const fixture = orderedFixture();
  const before = structuredClone(fixture.result);
  const model = buildOpenEnaOrderedNetworkModel({
    result: fixture.result,
    config: fixture.config,
    scope: { kind: "overall" },
    edgeThreshold: 0.35,
    nodeTotals: fixture.nodeTotals,
  });
  const baseline = compileOpenEnaOrdered3dPlotSpec(compileInput(fixture, { edgeThreshold: 0.35 }));
  const displayVariant = compileOpenEnaOrdered3dPlotSpec(compileInput(fixture, {
    edgeThreshold: 0.35,
    edgeScale: 2.2,
    pointScale: 1.7,
    plotZoom: 1.8,
    flipX: true,
    flipY: true,
    camera: "yz",
  }));
  const expected = model.visibleEdges.map((edge) => model.edges.indexOf(edge));
  assert.equal(model.edges.length, fixture.config.codes.length ** 2);
  assert.deepEqual(
    renderedEdgeIndices(baseline, ["ordered-edge-shaft", "ordered-self-loop-shaft"]).sort((a, b) => a - b),
    expected,
  );
  assert.deepEqual(networkGeometrySnapshot(displayVariant), networkGeometrySnapshot(baseline));
  assert.notDeepEqual(displayVariant.data.map((trace) => trace.line?.width), baseline.data.map((trace) => trace.line?.width));
  assert.notDeepEqual(
    displayVariant.data.find((trace) => trace.meta.role === "code-node")?.marker?.size,
    baseline.data.find((trace) => trace.meta.role === "code-node")?.marker?.size,
  );
  assert.deepEqual(fixture.result, before);
  assert.deepEqual(displayVariant.layout.scene.xaxis.range, [...baseline.layout.scene.xaxis.range].reverse());
  assert.deepEqual(displayVariant.layout.scene.yaxis.range, [...baseline.layout.scene.yaxis.range].reverse());
  assert.notDeepEqual(displayVariant.layout.scene.camera, baseline.layout.scene.camera);
});

test("a dense 30-code p-squared ONA stays within 32 directed traces and represents every visible cell once per shaft and cone", () => {
  const codes = Array.from({ length: 30 }, (_, index) => `C${String(index + 1).padStart(2, "0")}`);
  const fixture = orderedFixture({ codes, groupNames: ["all"], dense: true });
  const spec = compileOpenEnaOrdered3dPlotSpec(compileInput(fixture, { showPoints: false }));
  const directed = directedTraces(spec);
  const shafts = directed.filter((trace) => trace.meta.role.endsWith("shaft"));
  const cones = directed.filter((trace) => trace.meta.role.endsWith("arrowhead"));

  assert.ok(directed.length <= 32, `directed trace budget exceeded: ${directed.length}`);
  assert.equal(shafts.reduce((sum, trace) => sum + (trace.meta.edgeCount ?? 0), 0), 900);
  assert.equal(cones.reduce((sum, trace) => sum + (trace.meta.edgeCount ?? 0), 0), 900);
  assert.deepEqual(
    renderedEdgeIndices(spec, ["ordered-edge-shaft", "ordered-self-loop-shaft"]).sort((a, b) => a - b),
    Array.from({ length: 900 }, (_, index) => index),
  );
  assert.deepEqual(
    renderedEdgeIndices(spec, ["ordered-edge-arrowhead", "ordered-self-loop-arrowhead"]).sort((a, b) => a - b),
    Array.from({ length: 900 }, (_, index) => index),
  );
});

test("malformed axes, fitted coordinates, node coverage, variance, scientific order, provenance, masks, and coincident directions fail closed", () => {
  const base = orderedFixture();
  const compile = (fixture: Fixture, overrides: Partial<CompileOpenEnaOrdered3dPlotInput> = {}) => (
    compileOpenEnaOrdered3dPlotSpec(compileInput(fixture, overrides))
  );
  assert.throws(() => compile(base, { yDimension: "SVD1" }), /distinct|axis|dimension/i);
  assert.throws(() => compile(base, { zDimension: "unknown" }), /dimension/i);
  assert.throws(() => compile(base, { xDimension: "" }), /nonempty|dimension/i);

  const malformed: Array<[string, (fixture: Fixture) => void, RegExp]> = [
    ["missing node coordinate", (fixture) => { delete requiredRotationNodes(fixture.result)[0]!.SVD3; }, /node.*SVD3|coordinate/i],
    ["nonfinite node coordinate", (fixture) => { requiredRotationNodes(fixture.result)[0]!.SVD3 = Number.NaN; }, /node.*SVD3|finite/i],
    ["missing point coordinate", (fixture) => { delete fixture.result.set.points[0]!.SVD2; }, /point.*SVD2|coordinate/i],
    ["nonfinite point coordinate", (fixture) => { fixture.result.set.points[0]!.SVD2 = Number.POSITIVE_INFINITY; }, /point.*SVD2|finite/i],
    ["duplicate node code", (fixture) => { requiredRotationNodes(fixture.result)[1]!.code = "A"; }, /node.*coverage|geometry integrity|unique/i],
    ["missing node row", (fixture) => { requiredRotationNodes(fixture.result).pop(); }, /node.*coverage|geometry integrity/i],
    ["missing variance", (fixture) => { delete fixture.result.set.variance.SVD3; }, /variance.*SVD3|variance/i],
    ["nonfinite variance", (fixture) => { fixture.result.set.variance.SVD3 = Number.NaN; }, /variance.*SVD3|finite/i],
    ["wrong completed code order", (fixture) => { fixture.result.set.codes.reverse(); }, /code order|configuration|provenance/i],
    ["broken p-squared order", (fixture) => { fixture.result.set.adjacencyKey.pop(); }, /p²|adjacency|response-major/i],
    ["stale provenance", (fixture) => { fixture.result.executionProvenance!.nodePositionMethod = "undirected"; }, /provenance|ordered-network run/i],
    ["invalid mask", (fixture) => { fixture.config.directionalMask!.enabled.pop(); }, /mask|directional/i],
    ["coincident visible off-diagonal nodes", (fixture) => {
      const nodes = requiredRotationNodes(fixture.result);
      const source = nodes[0]!;
      const target = nodes[1]!;
      target.SVD1 = source.SVD1;
      target.SVD2 = source.SVD2;
      target.SVD3 = source.SVD3;
    }, /coincident|nonzero|direction/i],
    ["sparse node rows", (fixture) => { delete requiredRotationNodes(fixture.result)[1]; }, /dense|node.*integrity|coverage/i],
    ["sparse point rows", (fixture) => { delete fixture.result.set.points[1]; }, /dense|point.*integrity/i],
  ];
  for (const [label, mutate, pattern] of malformed) {
    const fixture = orderedFixture();
    mutate(fixture);
    assert.throws(() => compile(fixture), pattern, label);
  }

  const missingRotationDimension = orderedFixture();
  missingRotationDimension.result.set.rotation.rotationColumns = ["SVD1", "SVD2"];
  assert.throws(() => compile(missingRotationDimension), /rotation.*dimension|SVD3/i);
});

test("a zero-variance third dimension preserves exact planar coordinates and emits structured diagnostics plus an English annotation", () => {
  const fixture = orderedFixture();
  for (const row of requiredRotationNodes(fixture.result)) row.SVD3 = 0;
  for (const row of fixture.result.set.points) row.SVD3 = 0;
  fixture.result.set.variance.SVD3 = 0;
  const spec = compileOpenEnaOrdered3dPlotSpec(compileInput(fixture, { showVariance: false }));
  const pointTraces = spec.data.filter((trace) => trace.meta.role === "unit-points");
  const nodeTrace = spec.data.find((trace) => trace.meta.role === "code-node");

  assert.deepEqual(spec.diagnostics, { degenerateDimensions: ["SVD3"] });
  assert.ok(spec.layout.annotations.some((annotation) => /SVD3.*0(?:\.0)?%.*planar/i.test(annotation.text)));
  assert.ok(pointTraces.flatMap((trace) => trace.z).every((value) => value === 0));
  assert.ok(nodeTrace?.z.every((value) => value === 0));
});

test("overall and group scopes share full fitted axis ranges while flips change only layout ranges", () => {
  const fixture = orderedFixture();
  const overall = compileOpenEnaOrdered3dPlotSpec(compileInput(fixture));
  const primary = compileOpenEnaOrdered3dPlotSpec(compileInput(fixture, {
    scope: { kind: "group", name: "first", presentationRole: "primary" },
  }));
  const secondary = compileOpenEnaOrdered3dPlotSpec(compileInput(fixture, {
    scope: { kind: "group", name: "second", presentationRole: "secondary" },
  }));
  const flipped = compileOpenEnaOrdered3dPlotSpec(compileInput(fixture, { flipX: true, flipY: true }));
  const ranges = (spec: OpenEna3dPlotSpec) => [
    spec.layout.scene.xaxis.range,
    spec.layout.scene.yaxis.range,
    spec.layout.scene.zaxis.range,
  ];

  assert.deepEqual(ranges(primary), ranges(overall));
  assert.deepEqual(ranges(secondary), ranges(overall));
  assert.deepEqual(flipped.data, overall.data);
  assert.deepEqual(flipped.layout.scene.xaxis.range, [...overall.layout.scene.xaxis.range].reverse());
  assert.deepEqual(flipped.layout.scene.yaxis.range, [...overall.layout.scene.yaxis.range].reverse());
  assert.deepEqual(flipped.layout.scene.zaxis.range, overall.layout.scene.zaxis.range);
});

test("generic standard-ENA 3D compilation still rejects ONA before legacy input access and retains an explicit ordered-kind backstop", () => {
  const fixture = orderedFixture();
  assert.throws(
    () => compileOpenEna3dPlotSpec({ result: fixture.result } as never),
    (error) => error instanceof OpenEnaCapabilityError
      && error.code === "ona-feature-not-verified"
      && error.feature === "3d",
  );

  const source = readFileSync(new URL("../lib/open-ena/plot3d.ts", import.meta.url), "utf8");
  const capabilityGuard = source.indexOf('assertOpenEnaCapabilityForResult(input.result, "3d")');
  const standardGuard = source.indexOf('(result.set.networkType ?? "standard") !== "standard"');
  assert.ok(capabilityGuard >= 0);
  assert.ok(standardGuard > capabilityGuard, "the explicit standard-kind backstop must follow the existing capability guard");
});
