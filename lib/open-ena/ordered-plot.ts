import type { Row } from "jena-js";
import {
  buildOpenEnaOrderedNetworkModel,
  type OpenEnaOrderedNetworkEdge,
  type OpenEnaOrderedNetworkNode,
  type OpenEnaOrderedNetworkNodeTotals,
  type OpenEnaOrderedNetworkScope,
} from "./ordered-network-model";
import { canonicalizeOpenEnaConfig } from "./network-config";
import type { OpenEnaConfig, OpenEnaResult } from "./types";

export { buildOpenEnaOrderedNetworkModel } from "./ordered-network-model";

const ZERO_TOLERANCE = 1e-12;

export type OpenEnaOrderedPlotScope = OpenEnaOrderedNetworkScope;

export type OpenEnaOrderedNodeTotals = OpenEnaOrderedNetworkNodeTotals;

export interface OpenEnaOrderedPlotNode extends OpenEnaOrderedNetworkNode {
  x: number;
  y: number;
}

export interface OpenEnaOrderedPlotPoint {
  key: string;
  unit: string;
  group: string | null;
  x: number;
  y: number;
}

export type OpenEnaOrderedPlotEdge = OpenEnaOrderedNetworkEdge;

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

function finiteCoordinate(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be finite.`);
  }
  return value;
}

function finiteNonnegative(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be finite nonnegative.`);
  }
  return value;
}

function rowBelongsToScope(
  row: Row,
  scope: OpenEnaOrderedPlotScope,
  groupColumn: string | null,
) {
  if (scope.kind === "overall") return true;
  return Boolean(groupColumn) && String(row[groupColumn as string] ?? "") === scope.name;
}

function isDenseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) return false;
  }
  return true;
}

function isRowObject(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function directedNodeIntegrityFailure(): never {
  throw new Error(
    "ONA directed node geometry integrity requires one node for every configured code, with dense object rows and unique exact string-code coverage.",
  );
}

function projectedPointIntegrityFailure(): never {
  throw new Error("ONA projected point integrity requires one dense array of non-null object rows.");
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
  const networkModel = buildOpenEnaOrderedNetworkModel({
    result,
    config,
    scope,
    edgeThreshold: input.edgeThreshold,
    ...(input.nodeTotals ? { nodeTotals: input.nodeTotals } : {}),
  });
  const groupColumn = config.groupColumn;
  const selectedGroup = scope.kind === "group"
    ? result.groups.find((group) => group.name === scope.name)
    : null;
  const ungroupedSingleGroupScope = scope.kind === "group"
    && groupColumn === null
    && result.groups.length === 1
    && selectedGroup?.name === scope.name;
  const pointScope: OpenEnaOrderedPlotScope = ungroupedSingleGroupScope
    ? { kind: "overall" }
    : scope;
  const rotationNodes = result.set.rotation.nodes;
  if (!isDenseArray(rotationNodes) || rotationNodes.length !== networkModel.codes.length) {
    directedNodeIntegrityFailure();
  }
  const nodeCoordinates = new Map<string, Row>();
  for (const candidate of rotationNodes) {
    if (!isRowObject(candidate)
      || typeof candidate.code !== "string"
      || candidate.code.length === 0
      || !networkModel.codes.includes(candidate.code)
      || nodeCoordinates.has(candidate.code)) {
      directedNodeIntegrityFailure();
    }
    nodeCoordinates.set(candidate.code, candidate);
  }
  if (nodeCoordinates.size !== networkModel.codes.length
    || networkModel.codes.some((code) => !nodeCoordinates.has(code))) {
    directedNodeIntegrityFailure();
  }
  const nodes = networkModel.nodes.map((networkNode) => {
    const row = nodeCoordinates.get(networkNode.code);
    if (!row) throw new Error(`ONA directed node geometry is missing code “${networkNode.code}”.`);
    return {
      code: networkNode.code,
      codeIndex: networkNode.codeIndex,
      x: finiteCoordinate(row[xDimension], `ONA node “${networkNode.code}” ${xDimension}`),
      y: finiteCoordinate(row[yDimension], `ONA node “${networkNode.code}” ${yDimension}`),
      responseTotal: networkNode.responseTotal,
      radius: networkNode.radius,
    };
  });

  const pointRows = result.set.points;
  if (!isDenseArray(pointRows) || pointRows.some((row) => !isRowObject(row))) {
    projectedPointIntegrityFailure();
  }
  const points = (pointRows as Row[]).flatMap((row, index) => {
    if (!rowBelongsToScope(row, pointScope, groupColumn)) return [];
    const unit = String(row.ENA_UNIT ?? `unit-${index + 1}`);
    return [{
      key: `${unit}:${index}`,
      unit,
      group: groupColumn ? String(row[groupColumn] ?? "") : null,
      x: finiteCoordinate(row[xDimension], `ONA point ${index + 1} ${xDimension}`),
      y: finiteCoordinate(row[yDimension], `ONA point ${index + 1} ${yDimension}`),
    }];
  });
  const xVariance = finiteNonnegative(result.set.variance[xDimension] ?? 0, `ONA variance ${xDimension}`);
  const yVariance = finiteNonnegative(result.set.variance[yDimension] ?? 0, `ONA variance ${yDimension}`);

  return {
    scope: networkModel.scope,
    scopeLabel: scope.kind === "overall" ? "Overall ordered network" : `${scope.name} ordered mean network`,
    scopeColor: selectedGroup?.color ?? "#39736e",
    codes: networkModel.codes,
    nodes,
    points,
    edges: networkModel.edges,
    visibleEdges: networkModel.visibleEdges,
    maximumNormalizedMeanWeight: networkModel.maximumNormalizedMeanWeight,
    weightDefinition: networkModel.weightDefinition,
    nodeSizeDefinition: networkModel.nodeSizeDefinition,
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
  visualScale: number;
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
    input.visualScale,
  ];
  if (values.some((value) => !Number.isFinite(value))
    || input.sourceRadius < 0
    || input.targetRadius < 0
    || input.relativeMagnitude < 0
    || input.relativeMagnitude > 1
    || input.visualScale < 0.1
    || input.visualScale > 4) {
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
  const halfWidth = Math.min(
    34,
    Math.max(1.5, (2.5 + Math.sqrt(input.relativeMagnitude) * 8) * input.visualScale),
  );
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
  const chevronScale = Math.sqrt(input.visualScale);
  const chevronBack = {
    x: chevronTip.x - ux * 9 * chevronScale,
    y: chevronTip.y - uy * 9 * chevronScale,
  };
  const chevronPath = input.showChevron
    ? `M ${pointText({ x: chevronBack.x + nx * 6 * chevronScale, y: chevronBack.y + ny * 6 * chevronScale })} L ${pointText(chevronTip)} L ${pointText({ x: chevronBack.x - nx * 6 * chevronScale, y: chevronBack.y - ny * 6 * chevronScale })}`
    : null;
  return {
    trianglePath: `M ${pointText(apex)} L ${pointText(baseLeft)} L ${pointText(baseRight)} Z`,
    hitPath: `M ${pointText(apex)} L ${pointText(baseCenter)}`,
    chevronPath,
    points: { apex, baseLeft, baseRight, baseCenter, chevronTip },
  };
}
