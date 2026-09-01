import type { Row } from "jena-js";
import { assertOpenEnaCapabilityForResult } from "./capabilities";
import type { OpenEnaPairwiseContrast, OpenEnaPairwiseContrastSide } from "./contrasts";
import {
  DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS,
  type OpenEnaDerivedGroupDisplay,
  type OpenEnaResolvedGroupDisplaySide,
} from "./group-display";
import { codeColorFor, JENA_GROUP_COLORS, type OpenEnaCodeColors } from "./plot-style";
import {
  resolveOpenEnaNodeDimensions,
  type OpenEnaNodeLayoutPositions,
} from "./node-layout";
import type { CameraPreset, GroupNetwork, OpenEnaResult } from "./types";
import type { OpenEnaUnitPointStyle } from "./unit-point-style";
import { marginalMeanStudentT95 } from "./uncertainty";

export const OPEN_ENA_3D_UI_REVISION = "open-ena-3d-camera-v2";
export const OPEN_ENA_3D_DEFAULT_CAMERA_ZOOM = 1.5;

export const OPEN_ENA_3D_AXIS_COLORS = ["#e00000", "#0000d0", "#15803d"] as const;
const AXIS_COLORS = OPEN_ENA_3D_AXIS_COLORS;
const GROUP_MARKER_SYMBOLS = ["circle", "square", "diamond", "cross", "x", "circle-open"] as const;
const GROUP_MARKER_LABELS = ["circle", "square", "diamond", "cross", "x", "open circle"] as const;
const GROUP_LINE_DASHES = ["solid", "dash", "dot", "dashdot", "longdash", "longdashdot"] as const;

export type OpenEna3dTraceRole =
  | "unit-points"
  | "code-node"
  | "network-edge"
  | "group-mean"
  | "confidence-interval"
  | "trajectory-path"
  | "axis"
  | "axis-arrowhead"
  | "axis-label"
  | "ordered-edge-shaft"
  | "ordered-edge-arrowhead"
  | "ordered-self-loop-shaft"
  | "ordered-self-loop-arrowhead"
  | "ordered-unit-point-overlay";

export type OpenEna3dPlotKind = "comparison" | "primary" | "secondary";

export interface OpenEna3dTraceMeta {
  role: OpenEna3dTraceRole;
  analysisKind?: "ona";
  scope?: "overall" | "primary" | "secondary";
  plotKind?: OpenEna3dPlotKind;
  groupName?: string;
  groupIndex?: number;
  markerSymbol?: string;
  edgeName?: string;
  unitId?: string;
  axis?: "x" | "y" | "z";
  dimension?: string;
  edgeValue?: number;
  edgeScaleDenominator?: number;
  confidenceLevel?: number;
  intervalMethod?: "marginal-student-t-95";
  intervalInterpretation?: "three-separate-marginal-confidence-interval-wireframe";
  jointRegion?: false;
  sampleSize?: number;
  degreesFreedom?: number;
  intervalEdge?: string;
  pointStyle?: OpenEnaUnitPointStyle;
  groupColor?: string;
  ground?: string;
  response?: string;
  groundIndex?: number;
  responseIndex?: number;
  selfConnection?: boolean;
  normalizedMeanWeight?: number;
  rawAggregateCount?: number;
  relativeMagnitude?: number;
  edgeCount?: number;
  orderedEdgeIndices?: number[];
  widthBucket?: number;
}

export interface OpenEna3dMarker {
  color: string | string[];
  size: number | number[];
  symbol?: string;
  opacity?: number;
  line?: { color: string; width: number };
}

export interface OpenEna3dTrace {
  type: "scatter3d" | "cone";
  mode?: string;
  name: string;
  x: Array<number | null>;
  y: Array<number | null>;
  z: Array<number | null>;
  u?: number[];
  v?: number[];
  w?: number[];
  anchor?: "tip";
  sizemode?: "absolute";
  sizeref?: number;
  colorscale?: Array<[number, string]>;
  showscale?: boolean;
  text?: string[];
  customdata?: Array<string | null>;
  textposition?: string;
  textfont?: { color?: string; size?: number };
  marker?: OpenEna3dMarker;
  line?: { color: string; width: number; dash?: (typeof GROUP_LINE_DASHES)[number] };
  hovertemplate?: string;
  hoverinfo?: "skip";
  connectgaps?: boolean;
  legendgroup?: string;
  showlegend?: boolean;
  meta: OpenEna3dTraceMeta;
}

export interface OpenEna3dCamera {
  center: { x: number; y: number; z: number };
  eye: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
  projection: { type: "perspective" | "orthographic" };
}

export interface OpenEna3dAspectRatio {
  x: number;
  y: number;
  z: number;
}

export interface OpenEnaWorkspaceAxes {
  twoD: readonly [string, string] | null;
  threeD: readonly [string, string, string] | null;
}

export function createOpenEnaWorkspaceAxes(
  dimensions: readonly string[],
): OpenEnaWorkspaceAxes {
  const uniqueDimensions = dimensions.filter((dimension, index) => (
    dimension.trim().length > 0 && dimensions.indexOf(dimension) === index
  ));
  const x = uniqueDimensions[0];
  if (!x) return { twoD: null, threeD: null };
  const y = uniqueDimensions[1] ?? x;
  return {
    twoD: [x, y],
    threeD: uniqueDimensions.length >= 3
      ? [x, uniqueDimensions[1]!, uniqueDimensions[2]!]
      : null,
  };
}

export function updateOpenEnaWorkspace3dAxis(
  axes: OpenEnaWorkspaceAxes,
  axis: "x" | "y" | "z",
  dimension: string,
  dimensions: readonly string[],
): OpenEnaWorkspaceAxes {
  const twoD: [string, string] | null = axes.twoD ? [...axes.twoD] : null;
  const threeD: [string, string, string] | null = axes.threeD ? [...axes.threeD] : null;
  if (!threeD || !dimension.trim() || !dimensions.includes(dimension)) {
    return { twoD, threeD };
  }
  const axisIndex = { x: 0, y: 1, z: 2 }[axis];
  const previousDimension = threeD[axisIndex];
  if (previousDimension !== dimension) {
    const occupiedIndex = threeD.findIndex((candidate, index) => (
      index !== axisIndex && candidate === dimension
    ));
    threeD[axisIndex] = dimension;
    if (occupiedIndex >= 0) threeD[occupiedIndex] = previousDimension;
  }
  return { twoD, threeD };
}

export function resetOpenEnaWorkspaceAxisSurface(
  axes: OpenEnaWorkspaceAxes,
  surface: "2d" | "3d",
  dimensions: readonly string[],
): OpenEnaWorkspaceAxes {
  const defaults = createOpenEnaWorkspaceAxes(dimensions);
  return surface === "3d"
    ? {
        twoD: axes.twoD ? [...axes.twoD] : null,
        threeD: defaults.threeD ? [...defaults.threeD] : null,
      }
    : {
        twoD: defaults.twoD ? [...defaults.twoD] : null,
        threeD: axes.threeD ? [...axes.threeD] : null,
      };
}

export interface OpenEna3dSceneAxis {
  title: { text: string };
  color: string;
  gridcolor: string;
  zerolinecolor: string;
  showspikes: boolean;
  autorange: false;
  range: [number, number];
}

export interface OpenEna3dPlotLayout {
  autosize: true;
  height: number;
  margin: { l: number; r: number; t: number; b: number };
  paper_bgcolor: string;
  plot_bgcolor: string;
  font: { family: string; color: string; size: number };
  legend: { orientation: "h"; x: number; y: number };
  hoverlabel: { bgcolor: string; font: { color: string } };
  uirevision: typeof OPEN_ENA_3D_UI_REVISION;
  annotations: Array<{
    text: string;
    x: number;
    y: number;
    xref: "paper";
    yref: "paper";
    showarrow: false;
    font: { color: string; size: number };
    xanchor: "left";
  }>;
  scene: {
    xaxis: OpenEna3dSceneAxis;
    yaxis: OpenEna3dSceneAxis;
    zaxis: OpenEna3dSceneAxis;
    camera: OpenEna3dCamera;
    bgcolor: string;
    aspectmode: "cube" | "manual";
    aspectratio?: OpenEna3dAspectRatio;
    dragmode: "orbit" | false;
  };
}

export interface OpenEna3dPlotConfig {
  responsive: true;
  scrollZoom: boolean;
  displaylogo: false;
  displayModeBar: boolean;
  modeBarButtonsToRemove: string[];
  toImageButtonOptions: { format: "png"; filename: string };
}

export interface OpenEna3dPlotSpec {
  data: OpenEna3dTrace[];
  layout: OpenEna3dPlotLayout;
  config: OpenEna3dPlotConfig;
  diagnostics?: { degenerateDimensions: string[] };
}

export interface CompileOpenEna3dPlotInput {
  result: OpenEnaResult;
  /** Selected endpoint contrast used to compile the linked three-plot 3D workbench. */
  contrast?: OpenEnaPairwiseContrast | null;
  groupDisplay?: Pick<OpenEnaDerivedGroupDisplay, "primary" | "secondary" | "hiddenUnitKeys">;
  /** Defaults to comparison so existing single-plot callers keep their behavior. */
  plotKind?: OpenEna3dPlotKind;
  compact?: boolean;
  displayModeBar?: boolean;
  codeColors?: OpenEnaCodeColors;
  groupColumn: string | null;
  xDimension: string;
  yDimension: string;
  zDimension: string;
  camera: CameraPreset;
  showPoints: boolean;
  showNetworks: boolean;
  showLabels: boolean;
  showUnitLabels: boolean;
  showVariance: boolean;
  showTrajectories: boolean;
  edgeScale: number;
  edgeThreshold: number;
  pointScale: number;
  plotZoom: number;
  flipX: boolean;
  flipY: boolean;
  nodeLayout?: OpenEnaNodeLayoutPositions;
}

const CAMERA_PRESETS: Record<CameraPreset, OpenEna3dCamera> = {
  isometric: {
    center: { x: 0, y: 0, z: 0 },
    // Start one modest step closer so codes and network edges use more of all three papers.
    eye: {
      x: 1.45 / OPEN_ENA_3D_DEFAULT_CAMERA_ZOOM,
      y: 1.45 / OPEN_ENA_3D_DEFAULT_CAMERA_ZOOM,
      z: 1.25 / OPEN_ENA_3D_DEFAULT_CAMERA_ZOOM,
    },
    up: { x: 0, y: 0, z: 1 },
    projection: { type: "perspective" },
  },
  xy: {
    center: { x: 0, y: 0, z: 0 },
    eye: { x: 0, y: 0, z: 2.5 },
    up: { x: 0, y: 1, z: 0 },
    projection: { type: "orthographic" },
  },
  xz: {
    center: { x: 0, y: 0, z: 0 },
    eye: { x: 0, y: 2.5, z: 0 },
    up: { x: 0, y: 0, z: 1 },
    projection: { type: "orthographic" },
  },
  yz: {
    center: { x: 0, y: 0, z: 0 },
    eye: { x: 2.5, y: 0, z: 0 },
    up: { x: 0, y: 0, z: 1 },
    projection: { type: "orthographic" },
  },
  yx: {
    center: { x: 0, y: 0, z: 0 },
    eye: { x: 0, y: 0, z: -2.5 },
    up: { x: 1, y: 0, z: 0 },
    projection: { type: "orthographic" },
  },
  zx: {
    center: { x: 0, y: 0, z: 0 },
    eye: { x: 0, y: 2.5, z: 0 },
    up: { x: 1, y: 0, z: 0 },
    projection: { type: "orthographic" },
  },
  zy: {
    center: { x: 0, y: 0, z: 0 },
    eye: { x: -2.5, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    projection: { type: "orthographic" },
  },
};

/** Returns a fresh display-only Plotly camera for the selected preset. */
export function cameraForPreset(preset: CameraPreset): OpenEna3dCamera {
  const camera = CAMERA_PRESETS[preset];
  return {
    center: { ...camera.center },
    eye: { ...camera.eye },
    up: { ...camera.up },
    projection: { ...camera.projection },
  };
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function coordinate(row: Row, dimension: string) {
  return finiteNumber(row[dimension]);
}

function clamp(value: number, minimum: number, maximum: number, fallback: number) {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

function escapeHoverText(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatCoordinate(value: number) {
  return Number.isInteger(value) ? String(value) : value.toPrecision(6).replace(/\.?0+$/u, "");
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function isCssColor(value: unknown): value is string {
  return typeof value === "string" && /^(?:#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([^)]*\)|[a-z]+)$/iu.test(value.trim());
}

function groupColor(group: GroupNetwork, groupIndex: number) {
  if (isCssColor(group.color)) return group.color.trim();
  const paletteIndex = (stableHash(group.name) + groupIndex) % JENA_GROUP_COLORS.length;
  return JENA_GROUP_COLORS[paletteIndex] ?? JENA_GROUP_COLORS[0];
}

function groupIndexForRow(result: OpenEnaResult, groupColumn: string | null, row: Row) {
  if (!groupColumn || result.groups.length < 2) return 0;
  const value = String(row[groupColumn] ?? "");
  const index = result.groups.findIndex((group) => group.name === value);
  return index >= 0 ? index : 0;
}

function pointHover(
  label: string,
  groupName: string,
  point: readonly [number, number, number],
  dimensions: readonly [string, string, string],
) {
  return [
    `<b>${escapeHoverText(label)}</b>`,
    `Group: ${escapeHoverText(groupName)}`,
    `${escapeHoverText(dimensions[0])}: ${formatCoordinate(point[0])}`,
    `${escapeHoverText(dimensions[1])}: ${formatCoordinate(point[1])}`,
    `${escapeHoverText(dimensions[2])}: ${formatCoordinate(point[2])}`,
  ].join("<br>");
}

function edgeWeight(result: OpenEnaResult, edgeName: string) {
  const groups = result.groups;
  if (groups.length === 0) return { value: 0, groupIndex: 0, comparison: false };
  if (groups.length === 1) {
    return { value: Math.abs(groups[0]?.meanWeights[edgeName] ?? 0), groupIndex: 0, comparison: false };
  }
  if (groups.length === 2) {
    const difference = (groups[0]?.meanWeights[edgeName] ?? 0) - (groups[1]?.meanWeights[edgeName] ?? 0);
    return { value: Math.abs(difference), groupIndex: difference >= 0 ? 0 : 1, comparison: true };
  }
  let groupIndex = 0;
  let value = Math.abs(groups[0]?.meanWeights[edgeName] ?? 0);
  for (let index = 1; index < groups.length; index += 1) {
    const candidate = Math.abs(groups[index]?.meanWeights[edgeName] ?? 0);
    if (candidate > value) {
      value = candidate;
      groupIndex = index;
    }
  }
  return { value, groupIndex, comparison: false };
}

export function scaledCamera(preset: CameraPreset, plotZoom: number) {
  const camera = cameraForPreset(preset);
  if (camera.projection.type === "orthographic") return camera;
  const distanceScale = 1 / clamp(plotZoom, 0.35, 3, 1);
  return {
    ...camera,
    eye: {
      x: camera.eye.x * distanceScale,
      y: camera.eye.y * distanceScale,
      z: camera.eye.z * distanceScale,
    },
  };
}

export function displayAspectRatio(preset: CameraPreset, plotZoom: number) {
  if (cameraForPreset(preset).projection.type !== "orthographic") return undefined;
  const scale = clamp(plotZoom, 0.35, 3, 1);
  return { x: scale, y: scale, z: scale } satisfies OpenEna3dAspectRatio;
}

export function axisTraces(
  extent: number,
  dimensions: readonly [string, string, string],
): OpenEna3dTrace[] {
  const safeExtent = Math.max(0.001, Math.abs(extent));
  const shaftExtent = safeExtent * 0.88;
  const labelExtent = safeExtent * 1.08;
  const coneSize = safeExtent * 0.1;
  const directions = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ] as const;
  const physicalAxes = ["x", "y", "z"] as const;
  const axes = dimensions.map((dimension, index) => ({
    dimension,
    direction: directions[index],
    physicalAxis: physicalAxes[index],
    color: AXIS_COLORS[index],
  }));

  const shafts = axes.map(({ dimension, direction, physicalAxis, color }) => ({
    type: "scatter3d",
    mode: "lines",
    name: `${dimension} axis shaft`,
    x: [0, direction[0] * shaftExtent],
    y: [0, direction[1] * shaftExtent],
    z: [0, direction[2] * shaftExtent],
    line: { color, width: 6 },
    hoverinfo: "skip",
    showlegend: false,
    meta: {
      role: "axis",
      axis: physicalAxis,
      dimension,
    },
  }) satisfies OpenEna3dTrace);

  const arrowheads = axes.map(({ dimension, direction, physicalAxis, color }) => ({
    type: "cone",
    name: `${dimension} axis arrowhead`,
    x: [direction[0] * safeExtent],
    y: [direction[1] * safeExtent],
    z: [direction[2] * safeExtent],
    u: [direction[0]],
    v: [direction[1]],
    w: [direction[2]],
    anchor: "tip",
    sizemode: "absolute",
    sizeref: coneSize,
    colorscale: [[0, color], [1, color]],
    showscale: false,
    hoverinfo: "skip",
    showlegend: false,
    meta: {
      role: "axis-arrowhead",
      axis: physicalAxis,
      dimension,
    },
  }) satisfies OpenEna3dTrace);

  const labels = axes.map(({ dimension, direction, physicalAxis, color }) => ({
    type: "scatter3d",
    mode: "text",
    name: `${dimension} axis label`,
    x: [direction[0] * labelExtent],
    y: [direction[1] * labelExtent],
    z: [direction[2] * labelExtent],
    text: [dimension],
    textposition: "middle center",
    textfont: { color, size: 13 },
    hoverinfo: "skip",
    showlegend: false,
    meta: {
      role: "axis-label",
      axis: physicalAxis,
      dimension,
    },
  }) satisfies OpenEna3dTrace);

  return [...shafts, ...arrowheads, ...labels];
}

function confidenceIntervalBoxTraces(
  side: OpenEnaPairwiseContrastSide,
  groupIndex: number,
  dimensions: readonly [string, string, string],
  color: string,
): OpenEna3dTrace[] {
  const stored = side.meanConfidenceIntervalsByDimension;
  const intervals = dimensions.map((dimension) => stored?.[dimension]);
  if (intervals.some((interval) => interval?.status !== "estimable")) return [];
  const [xInterval, yInterval, zInterval] = intervals;
  if (xInterval?.status !== "estimable"
    || yInterval?.status !== "estimable"
    || zInterval?.status !== "estimable") return [];

  type Point3 = readonly [number, number, number];
  const point = (x: number, y: number, z: number): Point3 => [x, y, z];
  const lowerLowerLower = point(xInterval.lower, yInterval.lower, zInterval.lower);
  const upperLowerLower = point(xInterval.upper, yInterval.lower, zInterval.lower);
  const upperUpperLower = point(xInterval.upper, yInterval.upper, zInterval.lower);
  const lowerUpperLower = point(xInterval.lower, yInterval.upper, zInterval.lower);
  const lowerLowerUpper = point(xInterval.lower, yInterval.lower, zInterval.upper);
  const upperLowerUpper = point(xInterval.upper, yInterval.lower, zInterval.upper);
  const upperUpperUpper = point(xInterval.upper, yInterval.upper, zInterval.upper);
  const lowerUpperUpper = point(xInterval.lower, yInterval.upper, zInterval.upper);
  const paths: Array<{ edge: string; points: Point3[] }> = [
    {
      edge: "lower-z-face",
      points: [lowerLowerLower, upperLowerLower, upperUpperLower, lowerUpperLower, lowerLowerLower],
    },
    {
      edge: "upper-z-face",
      points: [lowerLowerUpper, upperLowerUpper, upperUpperUpper, lowerUpperUpper, lowerLowerUpper],
    },
    { edge: "lower-x-lower-y", points: [lowerLowerLower, lowerLowerUpper] },
    { edge: "upper-x-lower-y", points: [upperLowerLower, upperLowerUpper] },
    { edge: "upper-x-upper-y", points: [upperUpperLower, upperUpperUpper] },
    { edge: "lower-x-upper-y", points: [lowerUpperLower, lowerUpperUpper] },
  ];
  const hover = [
    `<b>${escapeHoverText(side.name)} mean uncertainty</b>`,
    `Separate marginal 95% Student-t intervals`,
    `${escapeHoverText(dimensions[0])}: ${formatCoordinate(xInterval.lower)} to ${formatCoordinate(xInterval.upper)}`,
    `${escapeHoverText(dimensions[1])}: ${formatCoordinate(yInterval.lower)} to ${formatCoordinate(yInterval.upper)}`,
    `${escapeHoverText(dimensions[2])}: ${formatCoordinate(zInterval.lower)} to ${formatCoordinate(zInterval.upper)}`,
    `Wireframe Cartesian product; not a joint confidence region or significance test`,
  ].join("<br>");

  return paths.map(({ edge, points }) => ({
    type: "scatter3d",
    mode: "lines",
    name: `${side.name} marginal 95% CI`,
    x: points.map((coordinates) => coordinates[0]),
    y: points.map((coordinates) => coordinates[1]),
    z: points.map((coordinates) => coordinates[2]),
    customdata: points.map(() => hover),
    line: { color, width: 3, dash: "dash" },
    hovertemplate: "%{customdata}<extra></extra>",
    legendgroup: `open-ena-group-${groupIndex}`,
    showlegend: false,
    meta: {
      role: "confidence-interval",
      groupName: side.name,
      groupIndex,
      confidenceLevel: xInterval.confidenceLevel,
      intervalMethod: xInterval.method,
      intervalInterpretation: "three-separate-marginal-confidence-interval-wireframe",
      jointRegion: false,
      sampleSize: xInterval.sampleSize,
      degreesFreedom: xInterval.degreesFreedom,
      intervalEdge: edge,
    },
  }));
}

/**
 * Compiles the already-fitted jENA x/y/z result into Plotly display data.
 * This function neither invokes jENA nor changes any scientific coordinate.
 */
export function compileOpenEna3dPlotSpec(input: CompileOpenEna3dPlotInput): OpenEna3dPlotSpec {
  assertOpenEnaCapabilityForResult(input.result, "3d");
  const result = input.result;
  if ((result.set.networkType ?? "standard") !== "standard") {
    throw new Error("The generic 3D compiler requires one completed Standard ENA result.");
  }
  const {
    contrast = null,
    groupDisplay,
    plotKind = "comparison",
    compact = false,
    displayModeBar = true,
    codeColors,
    groupColumn,
    xDimension,
    yDimension,
    zDimension,
    camera,
    showPoints,
    showNetworks,
    showLabels,
    showUnitLabels,
    showVariance,
    showTrajectories: _legacyShowTrajectories,
    edgeScale,
    edgeThreshold,
    pointScale,
    plotZoom,
    flipX,
    flipY,
    nodeLayout,
  } = input;
  // Preserve the historical input shape while enforcing a strict presenter
  // boundary: generic ENA plots never compile longitudinal trajectory marks.
  void _legacyShowTrajectories;
  const dimensions = [xDimension, yDimension, zDimension] as const;
  const traces: OpenEna3dTrace[] = [];
  const unitLegendGroupIndices = new Set<number>();
  const nodeRows = result.set.rotation.nodes ?? [];
  const displayNodeRows = nodeRows.map((row) => {
    const code = String(row.code ?? "");
    const canonical = new Map(dimensions.map((dimension) => [dimension, coordinate(row, dimension)]));
    const resolved = resolveOpenEnaNodeDimensions(canonical, nodeLayout?.get(code));
    return { ...row, ...Object.fromEntries(resolved) };
  });
  const points = result.set.points;
  const safePointScale = clamp(pointScale, 0.2, 5, 1);
  const safeEdgeScale = clamp(edgeScale, 0.1, 5, 1);
  const safeThreshold = clamp(edgeThreshold, 0, 1, 0);
  const primaryGroupIndex = contrast
    ? result.groups.findIndex((group) => group.name === contrast.primary.name)
    : -1;
  const secondaryGroupIndex = contrast
    ? result.groups.findIndex((group) => group.name === contrast.secondary.name)
    : -1;
  if (contrast && (primaryGroupIndex < 0 || secondaryGroupIndex < 0)) {
    throw new Error("The selected 3D contrast groups must exist in the fitted ENA result.");
  }
  const selectedComparisonGroupIndices = contrast
    ? new Set([primaryGroupIndex, secondaryGroupIndex])
    : null;
  const resolveGroupDisplay = (
    role: "primary" | "secondary",
    side: OpenEnaPairwiseContrastSide,
  ): OpenEnaResolvedGroupDisplaySide => {
    const candidate = groupDisplay?.[role];
    if (candidate?.name === side.name) return candidate;
    return {
      name: side.name,
      settings: { ...DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS },
      totalUnitCount: side.unitIds.length,
      validUnitCount: side.points.filter(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)).length,
      hiddenUnitCount: 0,
      visibleUnitIds: [...side.unitIds],
      summaryUnitIds: [...side.unitIds],
    };
  };
  const displayGroupEntries = contrast
    ? ([
        {
          group: result.groups[primaryGroupIndex] as GroupNetwork,
          groupIndex: primaryGroupIndex,
          side: contrast.primary,
          display: resolveGroupDisplay("primary", contrast.primary),
        },
        {
          group: result.groups[secondaryGroupIndex] as GroupNetwork,
          groupIndex: secondaryGroupIndex,
          side: contrast.secondary,
          display: resolveGroupDisplay("secondary", contrast.secondary),
        },
      ])
    : result.groups.map((group, groupIndex) => ({ group, groupIndex, side: null, display: null }));
  const canonicalConfidenceMagnitudes = contrast
    ? result.groups.flatMap((_group, groupIndex) => dimensions.flatMap((dimension) => {
        const values = points
          .filter((row) => groupIndexForRow(result, groupColumn, row) === groupIndex)
          .map((row) => coordinate(row, dimension));
        const interval = marginalMeanStudentT95(values);
        return interval.status === "estimable"
          ? [Math.abs(interval.lower), Math.abs(interval.upper)]
          : [];
      }))
    : [];
  const displayedConfidenceMagnitudes = contrast && plotKind === "comparison"
    ? ([
        ["primary", contrast.primary],
        ["secondary", contrast.secondary],
      ] as const).flatMap(([role, side]) => {
        const display = resolveGroupDisplay(role, side);
        if (!display.settings.showMean || !display.settings.showConfidenceIntervals) return [];
        return dimensions.flatMap((dimension) => {
          const interval = side.meanConfidenceIntervalsByDimension?.[dimension];
          return interval?.status === "estimable"
            ? [Math.abs(interval.lower), Math.abs(interval.upper)]
            : [];
        });
      })
    : [];

  const coordinateMagnitudes = [
    ...nodeRows.flatMap((row) => dimensions.map((dimension) => Math.abs(coordinate(row, dimension)))),
    ...points.flatMap((row) => dimensions.map((dimension) => Math.abs(coordinate(row, dimension)))),
    ...result.groups.flatMap((group) => dimensions.map((dimension) => Math.abs(finiteNumber(group.meanPoint[dimension])))),
    ...canonicalConfidenceMagnitudes,
    ...displayedConfidenceMagnitudes,
  ];
  const axisExtent = Math.max(0.5, ...coordinateMagnitudes) * 1.15;

  if (showNetworks) {
    const weightedEdges = contrast
      ? contrast.edges.map((contrastEdge) => {
          const edge = result.set.adjacencyKey.find((candidate) => candidate.name === contrastEdge.name);
          if (!edge) {
            throw new Error(`The selected 3D contrast is missing fitted adjacency geometry for ${contrastEdge.name}.`);
          }
          const rawValue = plotKind === "comparison"
            ? contrastEdge.signedDifference
            : plotKind === "primary"
              ? contrastEdge.primaryWeight
              : contrastEdge.secondaryWeight;
          return {
            edge,
            value: Math.abs(rawValue),
            rawValue,
            groupIndex: plotKind === "primary"
              ? primaryGroupIndex
              : plotKind === "secondary"
                ? secondaryGroupIndex
                : rawValue >= 0
                  ? primaryGroupIndex
                  : secondaryGroupIndex,
            comparison: plotKind === "comparison",
          };
        })
      : result.set.adjacencyKey.map((edge) => {
          const weighted = edgeWeight(result, edge.name);
          return { edge, ...weighted, rawValue: weighted.value };
        });
    const maximumEdge = contrast
      ? Math.max(
          1e-12,
          plotKind === "comparison"
            ? contrast.edgeScaleDenominators.difference
            : contrast.edgeScaleDenominators.sharedMean,
        )
      : Math.max(1e-12, ...weightedEdges.map((edge) => edge.value));
    const nodeByCode = new Map(displayNodeRows.map((row) => [String(row.code ?? ""), row]));
    for (const weighted of weightedEdges) {
      if (weighted.value <= 1e-12 || weighted.value / maximumEdge < safeThreshold) continue;
      const source = nodeByCode.get(weighted.edge.source) ?? displayNodeRows[weighted.edge.sourceIndex];
      const target = nodeByCode.get(weighted.edge.target) ?? displayNodeRows[weighted.edge.targetIndex];
      const group = result.groups[weighted.groupIndex];
      if (!source || !target || !group) continue;
      const relativeWeight = weighted.value / maximumEdge;
      const color = groupColor(group, weighted.groupIndex);
      const meaning = weighted.comparison && contrast
        ? `${contrast.primary.name} − ${contrast.secondary.name}: ${formatCoordinate(weighted.rawValue)}; ${group.name} stronger by ${formatCoordinate(weighted.value)}`
        : `${group.name} mean weight ${formatCoordinate(weighted.rawValue)}`;
      const hover = `<b>${escapeHoverText(weighted.edge.source)} ↔ ${escapeHoverText(weighted.edge.target)}</b><br>${escapeHoverText(meaning)}`;
      traces.push({
        type: "scatter3d",
        mode: "lines",
        name: `${weighted.edge.name} · ${group.name}`,
        x: [coordinate(source, xDimension), coordinate(target, xDimension)],
        y: [coordinate(source, yDimension), coordinate(target, yDimension)],
        z: [coordinate(source, zDimension), coordinate(target, zDimension)],
        customdata: [hover, hover],
        line: {
          color,
          width: Math.max(1, (1.2 + relativeWeight * 8) * safeEdgeScale),
        },
        hovertemplate: "%{customdata}<extra></extra>",
        legendgroup: `open-ena-group-${weighted.groupIndex}`,
        showlegend: false,
        meta: {
          role: "network-edge",
          groupName: group.name,
          groupIndex: weighted.groupIndex,
          edgeName: weighted.edge.name,
          edgeValue: weighted.rawValue,
          edgeScaleDenominator: maximumEdge,
        },
      });
    }
  }

  if (showPoints) {
    displayGroupEntries.forEach(({ group, groupIndex, display }) => {
      if (selectedComparisonGroupIndices && (
        plotKind !== "comparison" || !selectedComparisonGroupIndices.has(groupIndex)
      )) return;
      if (display && !display.settings.showUnitPoints) return;
      const visibleUnitIds = display ? new Set(display.visibleUnitIds) : null;
      const selected = points.filter((row) => (
        groupIndexForRow(result, groupColumn, row) === groupIndex
          && (!visibleUnitIds || visibleUnitIds.has(String(row.ENA_UNIT ?? "")))
      ));
      if (selected.length === 0) return;
      const color = groupColor(group, groupIndex);
      const markerSymbol = contrast
        ? "circle"
        : GROUP_MARKER_SYMBOLS[groupIndex % GROUP_MARKER_SYMBOLS.length];
      const markerLabel = contrast
        ? "circle"
        : GROUP_MARKER_LABELS[groupIndex % GROUP_MARKER_LABELS.length];
      unitLegendGroupIndices.add(groupIndex);
      traces.push({
        type: "scatter3d",
        mode: showUnitLabels ? "markers+text" : "markers",
        name: `${group.name} units · ${markerLabel}`,
        x: selected.map((row) => coordinate(row, xDimension)),
        y: selected.map((row) => coordinate(row, yDimension)),
        z: selected.map((row) => coordinate(row, zDimension)),
        text: selected.map((row, index) => String(row.ENA_UNIT ?? `unit-${index + 1}`)),
        customdata: selected.map((row, index) => {
          const label = String(row.ENA_UNIT ?? `unit-${index + 1}`);
          const point = dimensions.map((dimension) => coordinate(row, dimension)) as [number, number, number];
          return pointHover(label, group.name, point, dimensions);
        }),
        textposition: "top center",
        marker: {
          color,
          size: 6 * safePointScale,
          symbol: markerSymbol,
          opacity: 0.68,
          line: { color: "#263740", width: 0.8 },
        },
        hovertemplate: "%{customdata}<extra></extra>",
        legendgroup: `open-ena-group-${groupIndex}`,
        showlegend: true,
        meta: { role: "unit-points", groupName: group.name, groupIndex, markerSymbol },
      });
    });
  }

  if (contrast && plotKind === "comparison") {
    const primaryDisplay = resolveGroupDisplay("primary", contrast.primary);
    const secondaryDisplay = resolveGroupDisplay("secondary", contrast.secondary);
    if (primaryDisplay.settings.showMean && primaryDisplay.settings.showConfidenceIntervals) {
      traces.push(...confidenceIntervalBoxTraces(
        contrast.primary,
        primaryGroupIndex,
        dimensions,
        groupColor(result.groups[primaryGroupIndex] as GroupNetwork, primaryGroupIndex),
      ));
    }
    if (secondaryDisplay.settings.showMean && secondaryDisplay.settings.showConfidenceIntervals) {
      traces.push(...confidenceIntervalBoxTraces(
        contrast.secondary,
        secondaryGroupIndex,
        dimensions,
        groupColor(result.groups[secondaryGroupIndex] as GroupNetwork, secondaryGroupIndex),
      ));
    }
  }

  displayGroupEntries.forEach(({ group, groupIndex, side, display }) => {
    if (selectedComparisonGroupIndices && (
      plotKind !== "comparison" || !selectedComparisonGroupIndices.has(groupIndex)
    )) return;
    if (display && !display.settings.showMean) return;
    const color = groupColor(group, groupIndex);
    const markerSymbol = "square";
    const meanSource = side?.meanPoint ?? group.meanPoint;
    const mean = dimensions.map((dimension) => finiteNumber(meanSource[dimension])) as [number, number, number];
    traces.push({
      type: "scatter3d",
      mode: "markers",
      name: `${group.name} mean · square`,
      x: [mean[0]],
      y: [mean[1]],
      z: [mean[2]],
      customdata: [pointHover(`${group.name} mean`, group.name, mean, dimensions)],
      marker: {
        color,
        size: 12,
        symbol: markerSymbol,
        opacity: 1,
        line: { color: "#ffffff", width: 3 },
      },
      hovertemplate: "%{customdata}<extra></extra>",
      legendgroup: `open-ena-group-${groupIndex}`,
      showlegend: !unitLegendGroupIndices.has(groupIndex),
      meta: { role: "group-mean", groupName: group.name, groupIndex, markerSymbol },
    });
  });

  if (displayNodeRows.length > 0) {
    traces.push({
      type: "scatter3d",
      mode: showLabels ? "markers+text" : "markers",
      name: "Codes",
      x: displayNodeRows.map((row) => coordinate(row, xDimension)),
      y: displayNodeRows.map((row) => coordinate(row, yDimension)),
      z: displayNodeRows.map((row) => coordinate(row, zDimension)),
      text: displayNodeRows.map((row) => String(row.code ?? "")),
      customdata: displayNodeRows.map((row) => {
        const label = String(row.code ?? "");
        const point = dimensions.map((dimension) => coordinate(row, dimension)) as [number, number, number];
        return pointHover(`Code: ${label}`, "Code node", point, dimensions);
      }),
      textposition: "top center",
      textfont: { color: "#263740", size: 12 },
      marker: {
        color: displayNodeRows.map((row) => codeColorFor(codeColors, String(row.code ?? ""))),
        size: 9,
        symbol: "circle",
        opacity: 1,
        line: { color: "#ffffff", width: 1.5 },
      },
      hovertemplate: "%{customdata}<extra></extra>",
      showlegend: false,
      meta: { role: "code-node", markerSymbol: "circle" },
    });
  }

  traces.push(...axisTraces(axisExtent, dimensions));

  const annotations = showVariance
    ? dimensions.map((dimension, index) => ({
        text: `${dimension}: ${(finiteNumber(result.set.variance[dimension]) * 100).toFixed(1)}% variance`,
        x: 0.01,
        y: 1.04 - index * 0.035,
        xref: "paper" as const,
        yref: "paper" as const,
        showarrow: false as const,
        font: { color: AXIS_COLORS[index], size: 11 },
        xanchor: "left" as const,
      }))
    : [];

  const sceneExtent = axisExtent * 1.14;
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
    data: traces.map((trace) => ({
      ...trace,
      meta: { ...trace.meta, plotKind },
    })),
    layout: {
      autosize: true,
      height: compact ? 260 : 590,
      margin: compact
        ? { l: 6, r: 6, t: showVariance ? 54 : 14, b: 18 }
        : { l: 16, r: 16, t: showVariance ? 68 : 28, b: 58 },
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
      annotations,
      scene: {
        xaxis: sceneAxis(xDimension, AXIS_COLORS[0], flipX),
        yaxis: sceneAxis(yDimension, AXIS_COLORS[1], flipY),
        zaxis: sceneAxis(zDimension, AXIS_COLORS[2], false),
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
      displayModeBar,
      modeBarButtonsToRemove: ["sendDataToCloud", "lasso2d", "select2d"],
      toImageButtonOptions: { format: "png", filename: `open-ena-3d-${plotKind}` },
    },
  };
}
