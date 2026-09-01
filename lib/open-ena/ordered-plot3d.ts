import type { Row } from "jena-js";
import {
  buildOpenEnaOrderedNetworkModel,
  type OpenEnaOrderedNetworkEdge,
} from "./ordered-network-model";
import {
  OPEN_ENA_3D_AXIS_COLORS,
  OPEN_ENA_3D_UI_REVISION,
  axisTraces,
  displayAspectRatio,
  scaledCamera,
  type OpenEna3dPlotSpec,
  type OpenEna3dSceneAxis,
  type OpenEna3dTrace,
  type OpenEna3dTraceMeta,
} from "./plot3d";
import { codeColorFor, JENA_GROUP_COLORS, type OpenEnaCodeColors } from "./plot-style";
import type {
  OpenEnaOrderedNodeTotals,
  OpenEnaOrderedPlotScope,
} from "./ordered-plot";
import {
  openEnaUnitPointGlyphColors,
  openEnaUnitPointStyleAssignments,
  type OpenEnaUnitPointStyle,
} from "./unit-point-style";
import type { CameraPreset, OpenEnaConfig, OpenEnaResult } from "./types";

export const DIRECTED_EDGE_WIDTH_BUCKETS = 8;
export const RECIPROCAL_LANE_OFFSET_RATIO = 0.018;
export const EDGE_ENDPOINT_INSET_RATIO = 0.025;
export const SELF_LOOP_RADIUS_RATIO = 0.055;
export const SELF_LOOP_SEGMENTS = 24;

const ZERO_TOLERANCE = 1e-12;
const OVERALL_COLOR = "#39736e";

type Point3 = readonly [number, number, number];
type MutablePoint3 = [number, number, number];
type OrderedPresentationScope = "overall" | "primary" | "secondary";
type DirectedTraceRole =
  | "ordered-edge-shaft"
  | "ordered-edge-arrowhead"
  | "ordered-self-loop-shaft"
  | "ordered-self-loop-arrowhead";

interface PositionedOrderedEdge {
  edge: OpenEnaOrderedNetworkEdge;
  edgeIndex: number;
  widthBucket: number;
  hover: string;
}

interface PositionedOffDiagonalEdge extends PositionedOrderedEdge {
  start: MutablePoint3;
  shaftEnd: MutablePoint3;
  tip: MutablePoint3;
  direction: MutablePoint3;
}

interface PositionedSelfLoop extends PositionedOrderedEdge {
  points: MutablePoint3[];
  tip: MutablePoint3;
  tangent: MutablePoint3;
}

export interface CompileOpenEnaOrdered3dPlotInput {
  result: OpenEnaResult;
  config: OpenEnaConfig;
  scope: OpenEnaOrderedPlotScope;
  xDimension: string;
  yDimension: string;
  zDimension: string;
  camera: CameraPreset;
  showPoints: boolean;
  showNetworks: boolean;
  showLabels: boolean;
  showUnitLabels: boolean;
  showVariance: boolean;
  edgeScale: number;
  edgeThreshold: number;
  pointScale: number;
  plotZoom: number;
  flipX: boolean;
  flipY: boolean;
  compact?: boolean;
  codeColors?: OpenEnaCodeColors;
  nodeTotals?: OpenEnaOrderedNodeTotals;
}

function isDenseArray(value: unknown, expectedLength?: number): value is unknown[] {
  if (!Array.isArray(value) || (expectedLength !== undefined && value.length !== expectedLength)) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) return false;
  }
  return true;
}

function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(value: number, minimum: number, maximum: number, fallback: number) {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

function strictCoordinate(row: Row, dimension: string, label: string) {
  if (!Object.hasOwn(row, dimension)) {
    throw new Error(`${label} is missing fitted dimension ${dimension}.`);
  }
  const value = row[dimension];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} ${dimension} must be finite.`);
  }
  return value;
}

function selectedVariance(result: OpenEnaResult, dimension: string) {
  if (!Object.hasOwn(result.set.variance, dimension)) {
    throw new Error(`ONA variance ${dimension} is missing from the completed fitted result.`);
  }
  const value = result.set.variance[dimension];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`ONA variance ${dimension} must be finite nonnegative.`);
  }
  return value;
}

function countExact(values: readonly string[], expected: string) {
  return values.reduce((count, value) => count + Number(value === expected), 0);
}

function validateSelectedDimensions(
  result: OpenEnaResult,
  dimensions: readonly [string, string, string],
) {
  if (dimensions.some((dimension) => dimension.trim().length === 0)) {
    throw new Error("ONA 3D dimensions must be nonempty.");
  }
  if (new Set(dimensions).size !== dimensions.length) {
    throw new Error("ONA 3D dimensions must be pairwise distinct.");
  }
  if (!isDenseArray(result.dimensions)
    || result.dimensions.some((dimension) => typeof dimension !== "string")) {
    throw new Error("ONA completed dimensions must be one dense string array.");
  }
  const rotationColumns = result.set.rotation.rotationColumns;
  if (!isDenseArray(rotationColumns)
    || rotationColumns.some((dimension) => typeof dimension !== "string")) {
    throw new Error("ONA fitted rotation dimensions must be one dense string array.");
  }
  for (const dimension of dimensions) {
    if (countExact(result.dimensions, dimension) !== 1) {
      throw new Error(`ONA selected dimension ${dimension} must occur exactly once in the completed dimensions.`);
    }
    if (countExact(rotationColumns, dimension) !== 1) {
      throw new Error(`ONA selected dimension ${dimension} must occur exactly once in the fitted rotation dimensions.`);
    }
  }
}

function escapeHoverText(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formattedNumber(value: number) {
  return Object.is(value, -0) ? "0" : String(value);
}

function add(left: Point3, right: Point3): MutablePoint3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtract(left: Point3, right: Point3): MutablePoint3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function scale(value: Point3, scalar: number): MutablePoint3 {
  return [value[0] * scalar, value[1] * scalar, value[2] * scalar];
}

function dot(left: Point3, right: Point3) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: Point3, right: Point3): MutablePoint3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function vectorLength(value: Point3) {
  return Math.sqrt(dot(value, value));
}

function normalized(value: Point3, label: string): MutablePoint3 {
  const length = vectorLength(value);
  if (!Number.isFinite(length) || length <= ZERO_TOLERANCE) {
    throw new Error(`${label} requires one finite nonzero direction.`);
  }
  const result = scale(value, 1 / length);
  if (result.some((coordinate) => !Number.isFinite(coordinate))) {
    throw new Error(`${label} produced nonfinite geometry.`);
  }
  return result;
}

function leastAlignedAxis(direction: Point3): MutablePoint3 {
  const alignments = direction.map((coordinate) => Math.abs(coordinate));
  let selected = 0;
  for (let index = 1; index < alignments.length; index += 1) {
    if (alignments[index]! < alignments[selected]!) selected = index;
  }
  return selected === 0 ? [1, 0, 0] : selected === 1 ? [0, 1, 0] : [0, 0, 1];
}

function canonicalLaneNormal(
  sourceIndex: number,
  responseIndex: number,
  nodeCoordinates: readonly Point3[],
) {
  const lowIndex = Math.min(sourceIndex, responseIndex);
  const highIndex = Math.max(sourceIndex, responseIndex);
  const low = nodeCoordinates[lowIndex];
  const high = nodeCoordinates[highIndex];
  if (!low || !high) throw new Error("ONA reciprocal lane geometry is missing one code node.");
  const canonicalDirection = normalized(subtract(high, low), "ONA canonical reciprocal lane");
  return normalized(
    cross(canonicalDirection, leastAlignedAxis(canonicalDirection)),
    "ONA canonical reciprocal lane normal",
  );
}

function presentationScope(
  result: OpenEnaResult,
  scope: OpenEnaOrderedPlotScope,
): OrderedPresentationScope {
  if (scope.kind === "overall") return "overall";
  if (scope.presentationRole) return scope.presentationRole;
  const groupIndex = result.groups.findIndex((group) => group.name === scope.name);
  return groupIndex <= 0 ? "primary" : "secondary";
}

function scopeTitle(scope: OrderedPresentationScope) {
  return scope === "overall" ? "Overall" : scope === "primary" ? "Primary" : "Secondary";
}

function edgeHover(edge: OpenEnaOrderedNetworkEdge, scope: OrderedPresentationScope) {
  return [
    `<b>${escapeHoverText(edge.ground)} → ${escapeHoverText(edge.response)}</b>`,
    "Direction: ground/source → response/target",
    `Scope: ${scopeTitle(scope)}`,
    `Normalized mean: ${formattedNumber(edge.normalizedMeanWeight)}`,
    `Raw aggregate: ${formattedNumber(edge.rawAggregateCount)}`,
  ].join("<br>");
}

function pointHover(
  unit: string,
  groupName: string,
  coordinates: Point3,
  dimensions: readonly [string, string, string],
) {
  return [
    `<b>${escapeHoverText(unit)}</b>`,
    `Group: ${escapeHoverText(groupName)}`,
    `${escapeHoverText(dimensions[0])}: ${formattedNumber(coordinates[0])}`,
    `${escapeHoverText(dimensions[1])}: ${formattedNumber(coordinates[1])}`,
    `${escapeHoverText(dimensions[2])}: ${formattedNumber(coordinates[2])}`,
  ].join("<br>");
}

function codeHover(
  code: string,
  coordinates: Point3,
  responseTotal: number,
  dimensions: readonly [string, string, string],
) {
  return [
    `<b>Code: ${escapeHoverText(code)}</b>`,
    `${escapeHoverText(dimensions[0])}: ${formattedNumber(coordinates[0])}`,
    `${escapeHoverText(dimensions[1])}: ${formattedNumber(coordinates[1])}`,
    `${escapeHoverText(dimensions[2])}: ${formattedNumber(coordinates[2])}`,
    `Response total: ${formattedNumber(responseTotal)}`,
  ].join("<br>");
}

function scopeColor(result: OpenEnaResult, scope: OpenEnaOrderedPlotScope) {
  if (scope.kind === "overall") return OVERALL_COLOR;
  const groupIndex = result.groups.findIndex((group) => group.name === scope.name);
  const group = result.groups[groupIndex];
  if (!group) throw new Error(`ONA group plot scope “${scope.name}” is missing its fitted group.`);
  return typeof group.color === "string" && group.color.trim().length > 0
    ? group.color.trim()
    : JENA_GROUP_COLORS[groupIndex % JENA_GROUP_COLORS.length] ?? JENA_GROUP_COLORS[0];
}

function groupColor(result: OpenEnaResult, groupIndex: number) {
  const group = result.groups[groupIndex];
  if (!group) throw new Error("ONA unit-point group is missing from the fitted result.");
  return typeof group.color === "string" && group.color.trim().length > 0
    ? group.color.trim()
    : JENA_GROUP_COLORS[groupIndex % JENA_GROUP_COLORS.length] ?? JENA_GROUP_COLORS[0];
}

function widthBucket(relativeMagnitude: number) {
  if (!Number.isFinite(relativeMagnitude) || relativeMagnitude <= 0 || relativeMagnitude > 1 + Number.EPSILON) {
    throw new Error("ONA visible edge relative magnitude must be finite within (0, 1].");
  }
  return Math.min(
    DIRECTED_EDGE_WIDTH_BUCKETS - 1,
    Math.floor(relativeMagnitude * DIRECTED_EDGE_WIDTH_BUCKETS),
  );
}

function bucketRepresentative(bucket: number) {
  return (bucket + 1) / DIRECTED_EDGE_WIDTH_BUCKETS;
}

function singleEdgeMeta(entries: readonly PositionedOrderedEdge[]) {
  if (entries.length !== 1) return {};
  const [{ edge }] = entries;
  return {
    ground: edge.ground,
    response: edge.response,
    groundIndex: edge.groundIndex,
    responseIndex: edge.responseIndex,
    selfConnection: edge.selfConnection,
    normalizedMeanWeight: edge.normalizedMeanWeight,
    rawAggregateCount: edge.rawAggregateCount,
    relativeMagnitude: edge.relativeMagnitude,
  };
}

function directedMeta(
  role: DirectedTraceRole,
  scope: OrderedPresentationScope,
  bucket: number,
  entries: readonly PositionedOrderedEdge[],
): OpenEna3dTraceMeta {
  return {
    role,
    analysisKind: "ona",
    scope,
    widthBucket: bucket,
    edgeCount: entries.length,
    orderedEdgeIndices: entries.map((entry) => entry.edgeIndex),
    ...singleEdgeMeta(entries),
  };
}

function markerGlyph(style: Exclude<OpenEnaUnitPointStyle, "solid">) {
  return {
    "inner-ring": "○",
    "center-dot": "•",
    "horizontal-bar": "━",
    plus: "+",
    cross: "×",
  }[style];
}

function validateFittedRows(
  result: OpenEnaResult,
  codes: readonly string[],
  dimensions: readonly [string, string, string],
) {
  const rotationNodes = result.set.rotation.nodes;
  if (!isDenseArray(rotationNodes, codes.length)) {
    throw new Error("ONA directed node geometry integrity requires dense exact code coverage.");
  }
  const rowByCode = new Map<string, Row>();
  for (const candidate of rotationNodes) {
    if (!isRow(candidate)
      || typeof candidate.code !== "string"
      || candidate.code.length === 0
      || !codes.includes(candidate.code)
      || rowByCode.has(candidate.code)) {
      throw new Error("ONA directed node geometry integrity requires unique exact string-code coverage.");
    }
    rowByCode.set(candidate.code, candidate);
  }
  if (rowByCode.size !== codes.length || codes.some((code) => !rowByCode.has(code))) {
    throw new Error("ONA directed node geometry integrity requires one node for every configured code.");
  }
  const nodeCoordinates = codes.map((code) => {
    const row = rowByCode.get(code);
    if (!row) throw new Error(`ONA directed node geometry is missing code “${code}”.`);
    return dimensions.map((dimension) => (
      strictCoordinate(row, dimension, `ONA node “${code}”`)
    )) as MutablePoint3;
  });

  const pointRows = result.set.points;
  if (!isDenseArray(pointRows) || pointRows.some((row) => !isRow(row))) {
    throw new Error("ONA projected point integrity requires one dense array of object rows.");
  }
  const pointCoordinates = (pointRows as Row[]).map((row, pointIndex) => (
    dimensions.map((dimension) => (
      strictCoordinate(row, dimension, `ONA point ${pointIndex + 1}`)
    )) as MutablePoint3
  ));
  return { nodeCoordinates, pointRows: pointRows as Row[], pointCoordinates };
}

function offDiagonalPosition(
  entry: PositionedOrderedEdge,
  nodeCoordinates: readonly Point3[],
  visibleDirections: ReadonlySet<string>,
  sceneExtent: number,
): PositionedOffDiagonalEdge {
  const source = nodeCoordinates[entry.edge.groundIndex];
  const target = nodeCoordinates[entry.edge.responseIndex];
  if (!source || !target) throw new Error("ONA visible edge is missing one fitted code-node coordinate.");
  const targetMinusSource = subtract(target, source);
  const length = vectorLength(targetMinusSource);
  if (!Number.isFinite(length) || length <= ZERO_TOLERANCE) {
    throw new Error(`ONA visible edge ${entry.edge.ground} → ${entry.edge.response} has coincident fitted nodes and no nonzero direction.`);
  }
  const direction = normalized(targetMinusSource, `ONA visible edge ${entry.edge.ground} → ${entry.edge.response}`);
  const endpointInset = Math.min(sceneExtent * EDGE_ENDPOINT_INSET_RATIO, length * 0.2);
  const reverseVisible = visibleDirections.has(`${entry.edge.responseIndex}:${entry.edge.groundIndex}`);
  const laneNormal = canonicalLaneNormal(entry.edge.groundIndex, entry.edge.responseIndex, nodeCoordinates);
  const laneSign = entry.edge.groundIndex < entry.edge.responseIndex ? 1 : -1;
  const laneOffset = reverseVisible
    ? scale(laneNormal, sceneExtent * RECIPROCAL_LANE_OFFSET_RATIO * laneSign)
    : [0, 0, 0] as MutablePoint3;
  const start = add(add(source, scale(direction, endpointInset)), laneOffset);
  const tip = add(add(target, scale(direction, -endpointInset)), laneOffset);
  const available = dot(subtract(tip, start), direction);
  if (!Number.isFinite(available) || available <= ZERO_TOLERANCE) {
    throw new Error(`ONA visible edge ${entry.edge.ground} → ${entry.edge.response} has no finite inset span.`);
  }
  const coneClearance = Math.min(sceneExtent * 0.035, available * 0.25);
  const shaftEnd = add(tip, scale(direction, -coneClearance));
  if (vectorLength(subtract(shaftEnd, start)) <= ZERO_TOLERANCE) {
    throw new Error(`ONA visible edge ${entry.edge.ground} → ${entry.edge.response} has a zero-length shaft after endpoint inset.`);
  }
  return { ...entry, start, shaftEnd, tip, direction };
}

function selfLoopPosition(
  entry: PositionedOrderedEdge,
  nodeCoordinates: readonly Point3[],
  centroid: Point3,
  sceneExtent: number,
): PositionedSelfLoop {
  const node = nodeCoordinates[entry.edge.groundIndex];
  if (!node) throw new Error("ONA self-connection is missing its fitted code-node coordinate.");
  const radial = subtract(node, centroid);
  const fallbackAxes: readonly MutablePoint3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const planeNormal = vectorLength(radial) > ZERO_TOLERANCE
    ? normalized(radial, `ONA self-connection ${entry.edge.ground}`)
    : [...(fallbackAxes[entry.edge.groundIndex % fallbackAxes.length] ?? fallbackAxes[0]!)] as MutablePoint3;
  const localU = normalized(
    cross(planeNormal, leastAlignedAxis(planeNormal)),
    `ONA self-connection ${entry.edge.ground} local-u`,
  );
  const localV = normalized(
    cross(planeNormal, localU),
    `ONA self-connection ${entry.edge.ground} local-v`,
  );
  const radius = sceneExtent * SELF_LOOP_RADIUS_RATIO;
  if (!Number.isFinite(radius) || radius <= ZERO_TOLERANCE) {
    throw new Error("ONA self-connection radius must be finite and nonzero.");
  }
  const endpointInset = sceneExtent * EDGE_ENDPOINT_INSET_RATIO;
  const center = add(node, scale(localU, endpointInset + radius));
  const uniquePoints = Array.from({ length: SELF_LOOP_SEGMENTS }, (_, segmentIndex) => {
    const angle = (segmentIndex / SELF_LOOP_SEGMENTS) * Math.PI * 2;
    return add(
      add(center, scale(localU, radius * Math.cos(angle))),
      scale(localV, radius * Math.sin(angle)),
    );
  });
  const firstPoint = uniquePoints[0];
  if (!firstPoint) throw new Error("ONA self-connection requires at least one loop segment.");
  const points = [...uniquePoints, [...firstPoint] as MutablePoint3];
  const arrowAngle = Math.PI * 7 / 4;
  const tip = add(
    add(center, scale(localU, radius * Math.cos(arrowAngle))),
    scale(localV, radius * Math.sin(arrowAngle)),
  );
  const tangent = normalized(
    add(scale(localU, -Math.sin(arrowAngle)), scale(localV, Math.cos(arrowAngle))),
    `ONA self-connection ${entry.edge.ground} tangent`,
  );
  return { ...entry, points, tip, tangent };
}

function compileDirectedTraces(input: {
  offDiagonal: readonly PositionedOffDiagonalEdge[];
  selfLoops: readonly PositionedSelfLoop[];
  scope: OrderedPresentationScope;
  color: string;
  sceneExtent: number;
  edgeScale: number;
}) {
  const offBuckets = Array.from({ length: DIRECTED_EDGE_WIDTH_BUCKETS }, () => [] as PositionedOffDiagonalEdge[]);
  const loopBuckets = Array.from({ length: DIRECTED_EDGE_WIDTH_BUCKETS }, () => [] as PositionedSelfLoop[]);
  for (const entry of input.offDiagonal) offBuckets[entry.widthBucket]!.push(entry);
  for (const entry of input.selfLoops) loopBuckets[entry.widthBucket]!.push(entry);

  const lineWidth = (bucket: number) => (
    input.edgeScale * (1.25 + 5.75 * bucketRepresentative(bucket))
  );
  const coneSize = (bucket: number) => (
    input.sceneExtent * input.edgeScale * (0.012 + 0.018 * bucketRepresentative(bucket))
  );

  const offShafts = offBuckets.flatMap((entries, bucket): OpenEna3dTrace[] => {
    if (entries.length === 0) return [];
    const x: Array<number | null> = [];
    const y: Array<number | null> = [];
    const z: Array<number | null> = [];
    const customdata: Array<string | null> = [];
    for (const entry of entries) {
      x.push(entry.start[0], entry.shaftEnd[0], null);
      y.push(entry.start[1], entry.shaftEnd[1], null);
      z.push(entry.start[2], entry.shaftEnd[2], null);
      customdata.push(entry.hover, entry.hover, null);
    }
    return [{
      type: "scatter3d",
      mode: "lines",
      name: `Directed edges · width ${bucket + 1}`,
      x,
      y,
      z,
      customdata,
      line: { color: input.color, width: lineWidth(bucket) },
      hovertemplate: "%{customdata}<extra></extra>",
      connectgaps: false,
      showlegend: false,
      meta: directedMeta("ordered-edge-shaft", input.scope, bucket, entries),
    }];
  });
  const offArrowheads = offBuckets.flatMap((entries, bucket): OpenEna3dTrace[] => {
    if (entries.length === 0) return [];
    return [{
      type: "cone",
      name: `Directed edge arrows · width ${bucket + 1}`,
      x: entries.map((entry) => entry.tip[0]),
      y: entries.map((entry) => entry.tip[1]),
      z: entries.map((entry) => entry.tip[2]),
      u: entries.map((entry) => entry.direction[0]),
      v: entries.map((entry) => entry.direction[1]),
      w: entries.map((entry) => entry.direction[2]),
      customdata: entries.map((entry) => entry.hover),
      anchor: "tip",
      sizemode: "absolute",
      sizeref: coneSize(bucket),
      colorscale: [[0, input.color], [1, input.color]],
      showscale: false,
      hovertemplate: "%{customdata}<extra></extra>",
      showlegend: false,
      meta: directedMeta("ordered-edge-arrowhead", input.scope, bucket, entries),
    }];
  });
  const loopShafts = loopBuckets.flatMap((entries, bucket): OpenEna3dTrace[] => {
    if (entries.length === 0) return [];
    const x: Array<number | null> = [];
    const y: Array<number | null> = [];
    const z: Array<number | null> = [];
    const customdata: Array<string | null> = [];
    for (const entry of entries) {
      for (const point of entry.points) {
        x.push(point[0]);
        y.push(point[1]);
        z.push(point[2]);
        customdata.push(entry.hover);
      }
      x.push(null);
      y.push(null);
      z.push(null);
      customdata.push(null);
    }
    return [{
      type: "scatter3d",
      mode: "lines",
      name: `Self-connections · width ${bucket + 1}`,
      x,
      y,
      z,
      customdata,
      line: { color: input.color, width: lineWidth(bucket) },
      hovertemplate: "%{customdata}<extra></extra>",
      connectgaps: false,
      showlegend: false,
      meta: directedMeta("ordered-self-loop-shaft", input.scope, bucket, entries),
    }];
  });
  const loopArrowheads = loopBuckets.flatMap((entries, bucket): OpenEna3dTrace[] => {
    if (entries.length === 0) return [];
    return [{
      type: "cone",
      name: `Self-connection arrows · width ${bucket + 1}`,
      x: entries.map((entry) => entry.tip[0]),
      y: entries.map((entry) => entry.tip[1]),
      z: entries.map((entry) => entry.tip[2]),
      u: entries.map((entry) => entry.tangent[0]),
      v: entries.map((entry) => entry.tangent[1]),
      w: entries.map((entry) => entry.tangent[2]),
      customdata: entries.map((entry) => entry.hover),
      anchor: "tip",
      sizemode: "absolute",
      sizeref: coneSize(bucket),
      colorscale: [[0, input.color], [1, input.color]],
      showscale: false,
      hovertemplate: "%{customdata}<extra></extra>",
      showlegend: false,
      meta: directedMeta("ordered-self-loop-arrowhead", input.scope, bucket, entries),
    }];
  });
  return [...offShafts, ...offArrowheads, ...loopShafts, ...loopArrowheads];
}

function compileUnitTraces(input: {
  result: OpenEnaResult;
  config: OpenEnaConfig;
  scope: OpenEnaOrderedPlotScope;
  presentationScope: OrderedPresentationScope;
  pointRows: readonly Row[];
  pointCoordinates: readonly Point3[];
  dimensions: readonly [string, string, string];
  showUnitLabels: boolean;
  pointScale: number;
}) {
  const assignments = openEnaUnitPointStyleAssignments(input.result.groups.map((group) => group.name));
  const entries = input.result.groups
    .map((group, groupIndex) => ({ group, groupIndex }))
    .filter(({ group }) => input.scope.kind === "overall" || group.name === input.scope.name)
    .sort((left, right) => left.group.name < right.group.name ? -1 : left.group.name > right.group.name ? 1 : 0);
  const traces: OpenEna3dTrace[] = [];
  for (const { group, groupIndex } of entries) {
    const selectedIndices = input.pointRows.flatMap((row, pointIndex) => {
      const belongs = input.config.groupColumn === null && input.result.groups.length === 1
        ? true
        : String(row[input.config.groupColumn ?? ""] ?? "") === group.name;
      return belongs ? [pointIndex] : [];
    });
    if (selectedIndices.length === 0) continue;
    const color = groupColor(input.result, groupIndex);
    const pointStyle = assignments.get(group.name) ?? "solid";
    const coordinates = selectedIndices.map((pointIndex) => input.pointCoordinates[pointIndex]!);
    const units = selectedIndices.map((pointIndex) => String(input.pointRows[pointIndex]?.ENA_UNIT ?? `unit-${pointIndex + 1}`));
    const baseMeta: OpenEna3dTraceMeta = {
      role: "unit-points",
      analysisKind: "ona",
      scope: input.presentationScope,
      groupName: group.name,
      groupIndex,
      groupColor: color,
      markerSymbol: "circle",
      pointStyle,
    };
    traces.push({
      type: "scatter3d",
      mode: input.showUnitLabels ? "markers+text" : "markers",
      name: `${groupIndex + 1}. ${group.name} units · ${pointStyle}`,
      x: coordinates.map((point) => point[0]),
      y: coordinates.map((point) => point[1]),
      z: coordinates.map((point) => point[2]),
      text: units,
      customdata: coordinates.map((point, pointIndex) => (
        pointHover(units[pointIndex]!, group.name, point, input.dimensions)
      )),
      textposition: "top center",
      marker: {
        color,
        size: 6 * input.pointScale,
        symbol: "circle",
        opacity: 0.68,
        line: { color: "#263740", width: 0.8 },
      },
      hovertemplate: "%{customdata}<extra></extra>",
      legendgroup: `open-ena-ordered-group-${groupIndex}`,
      showlegend: true,
      meta: baseMeta,
    });
    if (pointStyle === "solid") continue;
    const glyphColors = openEnaUnitPointGlyphColors(color);
    traces.push({
      type: "scatter3d",
      mode: "text",
      name: `${group.name} ${pointStyle} overlay`,
      x: coordinates.map((point) => point[0]),
      y: coordinates.map((point) => point[1]),
      z: coordinates.map((point) => point[2]),
      text: coordinates.map(() => markerGlyph(pointStyle)),
      textposition: "middle center",
      textfont: { color: glyphColors.foreground, size: Math.max(8, 9 * input.pointScale) },
      hoverinfo: "skip",
      legendgroup: `open-ena-ordered-group-${groupIndex}`,
      showlegend: false,
      meta: {
        ...baseMeta,
        role: "ordered-unit-point-overlay",
      },
    });
  }
  return traces;
}

/**
 * Compiles one already-fitted ordered-network result into deterministic Plotly data.
 * It only adapts retained fitted coordinates and the one shared ordered science model.
 */
export function compileOpenEnaOrdered3dPlotSpec(
  input: CompileOpenEnaOrdered3dPlotInput,
): OpenEna3dPlotSpec {
  const {
    result,
    config,
    scope,
    xDimension,
    yDimension,
    zDimension,
    camera,
    showPoints,
    showNetworks,
    showLabels,
    showUnitLabels,
    showVariance,
    edgeScale,
    edgeThreshold,
    pointScale,
    plotZoom,
    flipX,
    flipY,
    compact = false,
    codeColors,
    nodeTotals,
  } = input;
  const dimensions = [xDimension, yDimension, zDimension] as const;
  validateSelectedDimensions(result, dimensions);
  const variance = dimensions.map((dimension) => selectedVariance(result, dimension)) as MutablePoint3;
  const model = buildOpenEnaOrderedNetworkModel({
    result,
    config,
    scope,
    edgeThreshold,
    ...(nodeTotals ? { nodeTotals } : {}),
  });
  const fitted = validateFittedRows(result, model.codes, dimensions);
  const coordinateMagnitudes = [
    ...fitted.nodeCoordinates.flatMap((point) => point.map((coordinate) => Math.abs(coordinate))),
    ...fitted.pointCoordinates.flatMap((point) => point.map((coordinate) => Math.abs(coordinate))),
  ];
  const axisExtent = Math.max(0.5, ...coordinateMagnitudes) * 1.15;
  const sceneExtent = axisExtent * 1.14;
  const safePointScale = clamp(pointScale, 0.2, 5, 1);
  const safeEdgeScale = clamp(edgeScale, 0.1, 5, 1);
  const resolvedScope = presentationScope(result, scope);
  const resolvedScopeColor = scopeColor(result, scope);
  const centroid = [0, 1, 2].map((axis) => (
    fitted.nodeCoordinates.reduce((sum, point) => sum + point[axis]!, 0)
      / fitted.nodeCoordinates.length
  )) as MutablePoint3;
  const visibleDirections = new Set(model.visibleEdges.map((edge) => (
    `${edge.groundIndex}:${edge.responseIndex}`
  )));
  const positioned = model.visibleEdges.map((edge): PositionedOrderedEdge => ({
    edge,
    edgeIndex: model.edges.indexOf(edge),
    widthBucket: widthBucket(edge.relativeMagnitude),
    hover: edgeHover(edge, resolvedScope),
  }));
  if (positioned.some((entry) => entry.edgeIndex < 0)) {
    throw new Error("ONA visible edges must retain their canonical shared-model identity.");
  }
  const offDiagonal = positioned
    .filter((entry) => !entry.edge.selfConnection)
    .map((entry) => offDiagonalPosition(entry, fitted.nodeCoordinates, visibleDirections, sceneExtent));
  const selfLoops = positioned
    .filter((entry) => entry.edge.selfConnection)
    .map((entry) => selfLoopPosition(entry, fitted.nodeCoordinates, centroid, sceneExtent));

  const traces: OpenEna3dTrace[] = [];
  if (showNetworks) {
    traces.push(...compileDirectedTraces({
      offDiagonal,
      selfLoops,
      scope: resolvedScope,
      color: resolvedScopeColor,
      sceneExtent,
      edgeScale: safeEdgeScale,
    }));
  }
  if (showPoints) {
    traces.push(...compileUnitTraces({
      result,
      config,
      scope,
      presentationScope: resolvedScope,
      pointRows: fitted.pointRows,
      pointCoordinates: fitted.pointCoordinates,
      dimensions,
      showUnitLabels,
      pointScale: safePointScale,
    }));
  }
  traces.push({
    type: "scatter3d",
    mode: showLabels ? "markers+text" : "markers",
    name: "Codes",
    x: fitted.nodeCoordinates.map((point) => point[0]),
    y: fitted.nodeCoordinates.map((point) => point[1]),
    z: fitted.nodeCoordinates.map((point) => point[2]),
    text: model.nodes.map((node) => node.code),
    customdata: model.nodes.map((node, nodeIndex) => (
      codeHover(node.code, fitted.nodeCoordinates[nodeIndex]!, node.responseTotal, dimensions)
    )),
    textposition: "top center",
    textfont: { color: "#263740", size: 12 },
    marker: {
      color: model.nodes.map((node) => codeColorFor(codeColors, node.code)),
      size: model.nodes.map((node) => node.radius * safePointScale),
      symbol: "circle",
      opacity: 1,
      line: { color: "#ffffff", width: 1.5 },
    },
    hovertemplate: "%{customdata}<extra></extra>",
    showlegend: false,
    meta: {
      role: "code-node",
      analysisKind: "ona",
      scope: resolvedScope,
      markerSymbol: "circle",
    },
  });
  traces.push(...axisTraces(axisExtent, dimensions).map((trace) => ({
    ...trace,
    meta: { ...trace.meta, analysisKind: "ona" as const, scope: resolvedScope },
  })));

  const degenerateDimensions = dimensions.filter((_, index) => variance[index] === 0);
  const varianceAnnotations = showVariance
    ? dimensions.map((dimension, index) => ({
        text: `${dimension}: ${(variance[index]! * 100).toFixed(1)}% variance`,
        x: 0.01,
        y: 1.04 - index * 0.035,
        xref: "paper" as const,
        yref: "paper" as const,
        showarrow: false as const,
        font: { color: OPEN_ENA_3D_AXIS_COLORS[index], size: 11 },
        xanchor: "left" as const,
      }))
    : [];
  const degenerateAnnotations = degenerateDimensions.map((dimension, index) => ({
    text: `${dimension} has 0.0% fitted variance; exact fitted coordinates are retained, so the selected 3D view may be planar.`,
    x: 0.01,
    y: (showVariance ? 0.92 : 1.04) - index * 0.035,
    xref: "paper" as const,
    yref: "paper" as const,
    showarrow: false as const,
    font: { color: "#64748b", size: 11 },
    xanchor: "left" as const,
  }));
  const sceneAxis = (dimension: string, color: string, reversed: boolean): OpenEna3dSceneAxis => ({
    title: { text: dimension },
    color,
    gridcolor: "#dbe9e7",
    zerolinecolor: "#64748b",
    showspikes: false,
    autorange: false,
    range: reversed ? [sceneExtent, -sceneExtent] : [-sceneExtent, sceneExtent],
  });
  const aspectratio = displayAspectRatio(camera, plotZoom);

  return {
    data: traces,
    layout: {
      autosize: true,
      height: compact ? 260 : 590,
      margin: compact
        ? { l: 6, r: 6, t: showVariance || degenerateDimensions.length > 0 ? 54 : 14, b: 18 }
        : { l: 16, r: 16, t: showVariance || degenerateDimensions.length > 0 ? 68 : 28, b: 58 },
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#ffffff",
      font: {
        family: '"Helvetica Neue", Helvetica, Arial, sans-serif',
        color: "#334b52",
        size: 12,
      },
      legend: { orientation: "h", x: 0, y: -0.12 },
      hoverlabel: { bgcolor: "#0f172a", font: { color: "#ffffff" } },
      uirevision: OPEN_ENA_3D_UI_REVISION,
      annotations: [...varianceAnnotations, ...degenerateAnnotations],
      scene: {
        xaxis: sceneAxis(xDimension, OPEN_ENA_3D_AXIS_COLORS[0], flipX),
        yaxis: sceneAxis(yDimension, OPEN_ENA_3D_AXIS_COLORS[1], flipY),
        zaxis: sceneAxis(zDimension, OPEN_ENA_3D_AXIS_COLORS[2], false),
        camera: scaledCamera(camera, plotZoom),
        bgcolor: "#ffffff",
        aspectmode: aspectratio ? "manual" : "cube",
        ...(aspectratio ? { aspectratio } : {}),
        dragmode: compact ? false : "orbit",
      },
    },
    config: {
      responsive: true,
      scrollZoom: !compact,
      displaylogo: false,
      displayModeBar: true,
      modeBarButtonsToRemove: ["sendDataToCloud", "lasso2d", "select2d"],
      toImageButtonOptions: { format: "png", filename: `open-ena-ona-3d-${resolvedScope}` },
    },
    diagnostics: { degenerateDimensions },
  };
}
