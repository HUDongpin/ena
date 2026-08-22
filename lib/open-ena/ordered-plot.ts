import type { Row } from "jena-js";
import { openEnaAnalysisKindFromResult } from "./capabilities";
import {
  canonicalizeOpenEnaConfig,
  validateDirectionalMask,
} from "./network-config";
import type { OpenEnaConfig, OpenEnaResult } from "./types";

const ZERO_TOLERANCE = 1e-12;

export type OpenEnaOrderedPlotScope =
  | { kind: "overall" }
  | { kind: "group"; name: string };

export interface OpenEnaOrderedNodeTotals {
  codeOrder: string[];
  overall: number[];
  groups: Array<{ name: string; totals: number[] }>;
}

export interface OpenEnaOrderedPlotNode {
  code: string;
  codeIndex: number;
  x: number;
  y: number;
  responseTotal: number;
  radius: number;
}

export interface OpenEnaOrderedPlotPoint {
  key: string;
  unit: string;
  group: string | null;
  x: number;
  y: number;
}

export interface OpenEnaOrderedPlotEdge {
  name: string;
  ground: string;
  response: string;
  groundIndex: number;
  responseIndex: number;
  normalizedMeanWeight: number;
  rawAggregateCount: number;
  reverseNormalizedMeanWeight: number;
  relativeMagnitude: number;
  maskEnabled: boolean;
  selfConnection: boolean;
  chevron: boolean;
  visible: boolean;
}

export interface OpenEnaOrderedPlotModel {
  scope: OpenEnaOrderedPlotScope;
  scopeLabel: string;
  scopeColor: string;
  codes: string[];
  nodes: OpenEnaOrderedPlotNode[];
  points: OpenEnaOrderedPlotPoint[];
  edges: OpenEnaOrderedPlotEdge[];
  visibleEdges: OpenEnaOrderedPlotEdge[];
  maximumNormalizedMeanWeight: number;
  weightDefinition: "equal-unit normalized mean" | "group equal-unit normalized mean";
  nodeSizeDefinition: "raw response-code total" | "incoming normalized directed mass (response-total fallback)";
  xDimension: string;
  yDimension: string;
  xVariance: number;
  yVariance: number;
}

function sameStrings(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function finiteNonnegative(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be finite nonnegative.`);
  }
  return value;
}

function finiteCoordinate(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be finite.`);
  }
  return value;
}

function validateNodeTotals(
  totals: OpenEnaOrderedNodeTotals,
  codes: readonly string[],
  scope: OpenEnaOrderedPlotScope,
) {
  if (!sameStrings(totals.codeOrder, codes)) {
    throw new Error("ONA ordered node totals must exactly match the configured code order.");
  }
  const values = scope.kind === "overall"
    ? totals.overall
    : totals.groups.find((group) => group.name === scope.name)?.totals;
  if (!values || values.length !== codes.length) {
    throw new Error("ONA ordered node totals are missing the requested plot scope.");
  }
  return values.map((value, index) => finiteNonnegative(value, `ONA response total ${index + 1}`));
}

function rowBelongsToScope(
  row: Row,
  scope: OpenEnaOrderedPlotScope,
  groupColumn: string | null,
) {
  if (scope.kind === "overall") return true;
  return Boolean(groupColumn) && String(row[groupColumn as string] ?? "") === scope.name;
}

export function buildOpenEnaOrderedPlotModel(input: {
  result: OpenEnaResult;
  config: OpenEnaConfig;
  scope: OpenEnaOrderedPlotScope;
  xDimension: string;
  yDimension: string;
  edgeThreshold: number;
  nodeTotals?: OpenEnaOrderedNodeTotals;
}): OpenEnaOrderedPlotModel {
  const { result, scope, xDimension, yDimension } = input;
  const config = canonicalizeOpenEnaConfig(input.config);
  if (config.analysisKind !== "ona"
    || openEnaAnalysisKindFromResult(result) !== "ona"
    || result.set.networkType !== "ordered"
    || result.executionProvenance?.networkType !== "ordered"
    || result.executionProvenance.nodePositionMethod !== "directed") {
    throw new Error("The ONA renderer requires one completed directed ordered-network result.");
  }
  if (!sameStrings(result.set.codes, config.codes)) {
    throw new Error("The ONA renderer code order disagrees with the completed configuration.");
  }
  const maskErrors = validateDirectionalMask(config.directionalMask, config.codes);
  if (!config.directionalMask || maskErrors.length > 0) {
    throw new Error(`The ONA renderer requires one valid label-bound p² directional mask. ${maskErrors.join(" ")}`.trim());
  }
  if (!Number.isFinite(input.edgeThreshold) || input.edgeThreshold < 0 || input.edgeThreshold > 1) {
    throw new Error("ONA edge threshold must be finite from zero to one.");
  }
  const size = config.codes.length;
  const edgeCount = size * size;
  if (result.set.adjacencyKey.length !== edgeCount || result.set.codeColumns.length !== edgeCount) {
    throw new Error("ONA adjacency must contain the complete p² response-major, ground-minor edge order.");
  }
  for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
    const groundIndex = edgeIndex % size;
    const responseIndex = Math.floor(edgeIndex / size);
    const edge = result.set.adjacencyKey[edgeIndex];
    if (!edge
      || edge.sourceIndex !== groundIndex
      || edge.targetIndex !== responseIndex
      || edge.source !== config.codes[groundIndex]
      || edge.target !== config.codes[responseIndex]
      || edge.name !== `${edge.source} & ${edge.target}`
      || result.set.codeColumns[edgeIndex] !== edge.name) {
      throw new Error("ONA adjacency must use the complete response-major, ground-minor source/target contract.");
    }
  }

  const groups = result.groups;
  if (groups.length === 0 || groups.some((group) => !Number.isSafeInteger(group.count) || group.count < 1)) {
    throw new Error("ONA plotting requires nonempty groups with positive safe unit counts.");
  }
  const selectedGroup = scope.kind === "group"
    ? groups.find((group) => group.name === scope.name)
    : null;
  if (scope.kind === "group" && !selectedGroup) {
    throw new Error(`ONA group plot scope “${scope.name}” is not present in the completed result.`);
  }
  const totalUnits = groups.reduce((sum, group) => sum + group.count, 0);
  const meanWeight = (edgeName: string) => {
    if (selectedGroup) {
      return finiteNonnegative(selectedGroup.meanWeights[edgeName], `ONA group mean edge “${edgeName}”`);
    }
    let weighted = 0;
    for (const group of groups) {
      const value = finiteNonnegative(group.meanWeights[edgeName], `ONA group mean edge “${edgeName}”`);
      const contribution = value * group.count;
      if (!Number.isFinite(contribution) || !Number.isFinite(weighted + contribution)) {
        throw new Error(`ONA overall mean edge “${edgeName}” exceeds finite arithmetic range.`);
      }
      weighted += contribution;
    }
    return weighted / totalUnits;
  };

  const rawAggregateCount = (edgeName: string) => {
    let total = 0;
    for (const row of result.set.connectionCounts) {
      if (!rowBelongsToScope(row, scope, config.groupColumn)) continue;
      const value = finiteNonnegative(row[edgeName], `ONA raw connection “${edgeName}”`);
      if (!Number.isFinite(total + value)) {
        throw new Error(`ONA raw connection aggregate “${edgeName}” exceeds finite arithmetic range.`);
      }
      total += value;
    }
    return total;
  };

  const weightedEdges = result.set.adjacencyKey.map((edge) => ({
    edge,
    normalizedMeanWeight: meanWeight(edge.name),
    rawAggregateCount: rawAggregateCount(edge.name),
  }));
  const maximumNormalizedMeanWeight = Math.max(
    ZERO_TOLERANCE,
    ...weightedEdges.map(({ normalizedMeanWeight }) => normalizedMeanWeight),
  );
  const byDirection = new Map(weightedEdges.map((entry) => [
    `${entry.edge.sourceIndex}:${entry.edge.targetIndex}`,
    entry.normalizedMeanWeight,
  ]));
  const edges: OpenEnaOrderedPlotEdge[] = weightedEdges.map(({ edge, normalizedMeanWeight, rawAggregateCount }) => {
    const reverseNormalizedMeanWeight = byDirection.get(`${edge.targetIndex}:${edge.sourceIndex}`) ?? 0;
    const maskEnabled = config.directionalMask!.enabled[edge.sourceIndex][edge.targetIndex];
    const selfConnection = edge.sourceIndex === edge.targetIndex;
    const relativeMagnitude = normalizedMeanWeight / maximumNormalizedMeanWeight;
    const chevron = !selfConnection
      && normalizedMeanWeight > ZERO_TOLERANCE
      && normalizedMeanWeight >= reverseNormalizedMeanWeight;
    const visible = maskEnabled
      && normalizedMeanWeight > ZERO_TOLERANCE
      && relativeMagnitude >= input.edgeThreshold;
    return {
      name: edge.name,
      ground: edge.source,
      response: edge.target,
      groundIndex: edge.sourceIndex,
      responseIndex: edge.targetIndex,
      normalizedMeanWeight,
      rawAggregateCount,
      reverseNormalizedMeanWeight,
      relativeMagnitude,
      maskEnabled,
      selfConnection,
      chevron,
      visible,
    };
  });

  const rotationNodes = result.set.rotation.nodes ?? [];
  if (rotationNodes.length !== size) {
    throw new Error("ONA directed node geometry must contain one node for every configured code.");
  }
  const nodeCoordinates = new Map(rotationNodes.map((row) => [String(row.code), row]));
  const responseTotals = input.nodeTotals
    ? validateNodeTotals(input.nodeTotals, config.codes, scope)
    : config.codes.map((_, responseIndex) => edges
        .filter((edge) => edge.responseIndex === responseIndex && edge.maskEnabled)
        .reduce((sum, edge) => sum + edge.normalizedMeanWeight, 0));
  const maximumResponseTotal = Math.max(ZERO_TOLERANCE, ...responseTotals);
  const nodes = config.codes.map((code, codeIndex) => {
    const row = nodeCoordinates.get(code);
    if (!row) throw new Error(`ONA directed node geometry is missing code “${code}”.`);
    const responseTotal = responseTotals[codeIndex];
    return {
      code,
      codeIndex,
      x: finiteCoordinate(row[xDimension], `ONA node “${code}” ${xDimension}`),
      y: finiteCoordinate(row[yDimension], `ONA node “${code}” ${yDimension}`),
      responseTotal,
      radius: 10 + Math.sqrt(responseTotal / maximumResponseTotal) * 12,
    };
  });

  const points = result.set.points.flatMap((row, index) => {
    if (!rowBelongsToScope(row, scope, config.groupColumn)) return [];
    const unit = String(row.ENA_UNIT ?? `unit-${index + 1}`);
    return [{
      key: `${unit}:${index}`,
      unit,
      group: config.groupColumn ? String(row[config.groupColumn] ?? "") : null,
      x: finiteCoordinate(row[xDimension], `ONA point ${index + 1} ${xDimension}`),
      y: finiteCoordinate(row[yDimension], `ONA point ${index + 1} ${yDimension}`),
    }];
  });
  const xVariance = finiteNonnegative(result.set.variance[xDimension] ?? 0, `ONA variance ${xDimension}`);
  const yVariance = finiteNonnegative(result.set.variance[yDimension] ?? 0, `ONA variance ${yDimension}`);

  return {
    scope,
    scopeLabel: scope.kind === "overall" ? "Overall ordered network" : `${scope.name} ordered mean network`,
    scopeColor: selectedGroup?.color ?? "#39736e",
    codes: [...config.codes],
    nodes,
    points,
    edges,
    visibleEdges: edges.filter((edge) => edge.visible),
    maximumNormalizedMeanWeight,
    weightDefinition: scope.kind === "overall" ? "equal-unit normalized mean" : "group equal-unit normalized mean",
    nodeSizeDefinition: input.nodeTotals
      ? "raw response-code total"
      : "incoming normalized directed mass (response-total fallback)",
    xDimension,
    yDimension,
    xVariance,
    yVariance,
  };
}

export interface OpenEnaOrderedGlyphPoint {
  x: number;
  y: number;
}

export interface OpenEnaOrderedEdgeGlyph {
  trianglePath: string;
  hitPath: string;
  chevronPath: string | null;
  points: {
    apex: OpenEnaOrderedGlyphPoint;
    baseLeft: OpenEnaOrderedGlyphPoint;
    baseRight: OpenEnaOrderedGlyphPoint;
    baseCenter: OpenEnaOrderedGlyphPoint;
    chevronTip: OpenEnaOrderedGlyphPoint;
  };
}

function formatted(value: number) {
  const normalized = Math.abs(value) < 1e-9 ? 0 : value;
  return Number(normalized.toFixed(4)).toString();
}

function pointText(point: OpenEnaOrderedGlyphPoint) {
  return `${formatted(point.x)} ${formatted(point.y)}`;
}

export function buildOrderedEdgeGlyph(input: {
  source: OpenEnaOrderedGlyphPoint;
  target: OpenEnaOrderedGlyphPoint;
  sourceRadius: number;
  targetRadius: number;
  relativeMagnitude: number;
  lane: -1 | 1;
  showChevron: boolean;
}): OpenEnaOrderedEdgeGlyph {
  const values = [
    input.source.x,
    input.source.y,
    input.target.x,
    input.target.y,
    input.sourceRadius,
    input.targetRadius,
    input.relativeMagnitude,
  ];
  if (values.some((value) => !Number.isFinite(value))
    || input.sourceRadius < 0
    || input.targetRadius < 0
    || input.relativeMagnitude < 0
    || input.relativeMagnitude > 1) {
    throw new Error("ONA broadcast glyph geometry requires finite bounded inputs.");
  }
  const dx = input.target.x - input.source.x;
  const dy = input.target.y - input.source.y;
  const length = Math.hypot(dx, dy);
  if (!(length > ZERO_TOLERANCE)) {
    throw new Error("ONA broadcast triangles require distinct source and response nodes.");
  }
  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  const laneOffset = 5 * input.lane;
  const apex = {
    x: input.source.x + ux * input.sourceRadius + nx * laneOffset,
    y: input.source.y + uy * input.sourceRadius + ny * laneOffset,
  };
  const baseCenter = {
    x: input.target.x - ux * input.targetRadius + nx * laneOffset,
    y: input.target.y - uy * input.targetRadius + ny * laneOffset,
  };
  const halfWidth = 2.5 + Math.sqrt(input.relativeMagnitude) * 8;
  const baseLeft = {
    x: baseCenter.x + nx * halfWidth,
    y: baseCenter.y + ny * halfWidth,
  };
  const baseRight = {
    x: baseCenter.x - nx * halfWidth,
    y: baseCenter.y - ny * halfWidth,
  };
  const chevronTip = {
    x: apex.x + (baseCenter.x - apex.x) * 0.72,
    y: apex.y + (baseCenter.y - apex.y) * 0.72,
  };
  const chevronBack = {
    x: chevronTip.x - ux * 9,
    y: chevronTip.y - uy * 9,
  };
  const chevronPath = input.showChevron
    ? `M ${pointText({ x: chevronBack.x + nx * 6, y: chevronBack.y + ny * 6 })} L ${pointText(chevronTip)} L ${pointText({ x: chevronBack.x - nx * 6, y: chevronBack.y - ny * 6 })}`
    : null;
  return {
    trianglePath: `M ${pointText(apex)} L ${pointText(baseLeft)} L ${pointText(baseRight)} Z`,
    hitPath: `M ${pointText(apex)} L ${pointText(baseCenter)}`,
    chevronPath,
    points: { apex, baseLeft, baseRight, baseCenter, chevronTip },
  };
}
