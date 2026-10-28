import { nativePlotGroupSettingsV3, nativePlotSummaryGroupsV3 } from "./bound-presentation-v3";
import type { OpenEnaContrastPresentation } from "./bound-presentation-v3";
import type { OpenEnaPlotResult } from "./bound-presentation-v3";
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
  openEnaRenderedCodeIsVisible, openEnaRenderedCodeLabel,
  openEnaRenderedEdgeIsVisible,
  type OpenEnaCodeGraphPresentation,
} from "./ordered-plot";
import {
  resolveOpenEnaNodeDimensions,
  type OpenEnaNodeLayoutPositions,
} from "./node-layout";
import type { CameraPreset, GroupNetwork, OpenEnaResult } from "./types";
import type { OpenEnaUnitPointStyle } from "./unit-point-style";
import { marginalMeanStudentT95 } from "./uncertainty";
import { trajectoryCentroidDescriptionV3 } from "./trajectory-style-v3";

export const OPEN_ENA_3D_UI_REVISION = "open-ena-3d-camera-v2";
export const OPEN_ENA_3D_DEFAULT_CAMERA_ZOOM = 1.5;
export const OPEN_ENA_TRAJECTORY_DEFAULT_CAMERA_ZOOM = 1.25;

export const OPEN_ENA_3D_AXIS_COLORS = ["#e00000", "#0000d0", "#15803d"] as const;
const AXIS_COLORS = OPEN_ENA_3D_AXIS_COLORS;
const GROUP_MARKER_SYMBOLS = ["circle", "square", "diamond", "cross", "x", "circle-open"] as const;
const GROUP_MARKER_LABELS = ["circle", "square", "diamond", "cross", "x", "open circle"] as const;
const GROUP_LINE_DASHES = ["solid", "dash", "dot", "dashdot", "longdash", "longdashdot"] as const;

export type OpenEna3dTraceRole =
  | "unit-points"
  | "code-node"
  | "code-label"
  | "network-edge"
  | "group-mean"
  | "confidence-interval"
  | "trajectory-path"
  | "direction-arrow"
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
  intervalMethod?: "marginal-student-t-95" | "unit-history-bootstrap-percentile-95";
  intervalInterpretation?: "three-separate-marginal-confidence-interval-wireframe";
  jointRegion?: false;
  sampleSize?: number;
  degreesFreedom?: number;
  intervalEdge?: string;
  centroidKey?: string;
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
  anchor?: "tip" | "center";
  sizemode?: "absolute" | "raw";
  sizeref?: number;
  colorscale?: Array<[number, string]>;
  showscale?: boolean;
  text?: string[];
  ids?: string[];
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
  visible?: boolean;
  meta: OpenEna3dTraceMeta;
}

/** Display-only annotations. Their x/y/z remain scientific fitted anchors;
 * automatic collision avoidance changes only detached runtime pixel offsets. */
export interface OpenEna3dSceneAnnotation {
  name: string;
  x: number;
  y: number;
  z: number;
  text: string;
  hovertext: string;
  showarrow: boolean;
  arrowhead: 0;
  arrowwidth: number;
  arrowcolor: string;
  ax: number;
  ay: number;
  xanchor: "center";
  yanchor: "middle";
  xshift: 0;
  yshift: 0;
  textangle: 0;
  opacity: number;
  captureevents: boolean;
  borderpad: number;
  borderwidth: number;
  bgcolor: string;
  font: { color: string; size: number };
}

export interface OpenEna3dLabelAnnotation {
  id: string;
  annotationIndex: number;
  role: "code" | "centroid" | "unit";
  text: string;
  description: string;
  priority: number;
  code?: string;
  /** Manual text preference only. Native annotation x/y/z stay at the
   * scientific node so text dragging never changes Plotly's scene bounds. */
  preferredPosition?: { x: number; y: number; z: number };
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

export function selectOpenEnaWorkspacePlotAxis(
  axes: OpenEnaWorkspaceAxes,
  view: "2d" | "3d",
  axisIndex: number,
  dimension: string,
  dimensions: readonly string[],
): OpenEnaWorkspaceAxes {
  switch (view) {
    case "3d": {
      const axis = (["x", "y", "z"] as const)[axisIndex];
      if (axis === undefined) {
        return {
          twoD: axes.twoD ? [...axes.twoD] : null,
          threeD: axes.threeD ? [...axes.threeD] : null,
        };
      }
      return updateOpenEnaWorkspace3dAxis(axes, axis, dimension, dimensions);
    }
    case "2d": {
      const twoD: [string, string] | null = axes.twoD ? [...axes.twoD] : null;
      const threeD: [string, string, string] | null = axes.threeD ? [...axes.threeD] : null;
      if (
        !twoD
        || (axisIndex !== 0 && axisIndex !== 1)
        || !dimension.trim()
        || !dimensions.includes(dimension)
      ) {
        return { twoD, threeD };
      }
      twoD[axisIndex] = dimension;
      return { twoD, threeD };
    }
    default: {
      const exhaustive: never = view;
      throw new TypeError(`Unsupported plot axis view: ${String(exhaustive)}`);
    }
  }
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
  showlegend?: boolean;
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
    annotations?: OpenEna3dSceneAnnotation[];
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
  trajectoryLabelAnnotations?: OpenEna3dLabelAnnotation[];
}

export interface CompileOpenEna3dPlotInput extends OpenEnaCodeGraphPresentation {
  result: OpenEnaPlotResult;
  /** Selected endpoint contrast used to compile the linked three-plot 3D workbench. */
  contrast?: OpenEnaContrastPresentation | null;
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
  textScale?: number;
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
export function cameraForPreset(preset: CameraPreset, defaultZoom = 1): OpenEna3dCamera {
  const camera = CAMERA_PRESETS[preset];
  const distance = camera.projection.type === "perspective" ? 1 / clamp(defaultZoom, .35, 3, 1) : 1;
  return {
    center: { ...camera.center },
    eye: { x: camera.eye.x * distance, y: camera.eye.y * distance, z: camera.eye.z * distance },
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

export function literalGlText(value: unknown) {
  // The pinned GL vectorizer recognizes these exact tags but does not decode
  // HTML entities. A zero-width separator preserves their visible characters
  // without activating that parser. Keep this encoding in render text only;
  // identities, source labels and SVG hover markup retain their own contracts.
  return String(value ?? "").replace(/<(?=\/?(?:b|i|sup|sub|br)>)/gu, "<\u200b");
}

function formatCoordinate(value: number) {
  return Number.isInteger(value) ? String(value) : Number(value.toPrecision(6)).toString();
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

function groupIndexForRow(result: OpenEnaPlotResult, groupColumn: string | null, row: Row) {
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

function edgeWeight(groups: GroupNetwork[], edgeName: string) {
  if (groups.length === 0) return { value: 0, groupIndex: 0, comparison: false };
  if (groups.length === 1) {
    return { value: Math.abs(groups[0]?.meanWeights[edgeName] ?? 0), groupIndex: 0, comparison: false };
  }
  if (groups.length === 2) {
    if (groups.some(group => group.count === 0)) return { value: 0, groupIndex: 0, comparison: true };
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

export function scaledCamera(preset: CameraPreset, plotZoom: number, defaultZoom = 1) {
  const camera = cameraForPreset(preset, defaultZoom);
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
  colors: readonly [string, string, string] = AXIS_COLORS,
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
    color: colors[index],
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

function confidenceIntervalBoxPaths(intervals: readonly { lower: number; upper: number }[]) {
  const [xInterval, yInterval, zInterval] = intervals;
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
  return paths;
}

function confidenceIntervalBoxTraces(
  side: OpenEnaPairwiseContrastSide,
  groupIndex: number,
  dimensions: readonly [string, string, string],
  color: string,
): OpenEna3dTrace[] {
  const stored = side.meanConfidenceIntervalsByDimension;
  const intervals = dimensions.map((dimension) => stored?.[dimension]);
  const [xInterval, yInterval, zInterval] = intervals;
  if (xInterval?.status !== "estimable"
    || yInterval?.status !== "estimable"
    || zInterval?.status !== "estimable") return [];
  const paths = confidenceIntervalBoxPaths([xInterval, yInterval, zInterval]);
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

function trajectoryConfidenceBoxTraces(
  centroid: NonNullable<OpenEnaPlotResult["trajectoryPresentation"]>["centroids"][number],
  dimensions: readonly [string, string, string],
  color: string,
): OpenEna3dTrace[] {
  const intervals = dimensions.map(dimension => centroid.intervals?.[dimension]);
  const usable = intervals.filter(interval => interval && interval.status !== "not-estimable"
    && Number.isFinite(interval.lower) && Number.isFinite(interval.upper) && interval.lower <= interval.upper);
  if (usable.length !== 3) return [];
  const hover = escapeHoverText(trajectoryCentroidDescriptionV3(centroid));
  return confidenceIntervalBoxPaths(usable as { lower: number; upper: number }[]).map(({ edge, points }) => ({
    type: "scatter3d", mode: "lines", name: `${centroid.group} · ${centroid.horizonShortLabel} pointwise 95% CI`,
    x: points.map(point => point[0]), y: points.map(point => point[1]), z: points.map(point => point[2]),
    customdata: points.map(() => hover), line: { color, width: 1.5, dash: "dot" },
    hovertemplate: "%{customdata}<extra></extra>", showlegend: false,
    meta: { role: "confidence-interval", groupName: centroid.group, centroidKey: centroid.key,
      confidenceLevel: 0.95, intervalMethod: "unit-history-bootstrap-percentile-95",
      intervalInterpretation: "three-separate-marginal-confidence-interval-wireframe", jointRegion: false,
      sampleSize: centroid.n, intervalEdge: edge },
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
    showCodeGraph = true,
    codeVisibility,
    codeSourceByRenderedCode, codeLabelByRenderedCode,
    showUnitLabels,
    showVariance,
    showTrajectories: _legacyShowTrajectories,
    edgeScale,
    edgeThreshold,
    pointScale,
    plotZoom,
    textScale = 1,
    flipX,
    flipY,
    nodeLayout,
  } = input;
  const codePresentation = { showCodeGraph, codeVisibility, codeSourceByRenderedCode, codeLabelByRenderedCode };
  // Preserve the historical input shape while enforcing a strict presenter
  // boundary: a legacy trajectory flag needs an explicit native fitted-sequence layer.
  void _legacyShowTrajectories;
  const dimensions = [xDimension, yDimension, zDimension] as const;
  const traces: OpenEna3dTrace[] = [];
  const unitLegendGroupIndices = new Set<number>();
  const nodeRows = result.set.rotation.nodes ?? [];
  const canonicalNodeByCode = new Map(nodeRows.map(row => [String(row.code ?? ""), row]));
  const labelRows = nodeRows.map((row) => {
    const code = String(row.code ?? "");
    const canonical = new Map(dimensions.map((dimension) => [dimension, coordinate(row, dimension)]));
    const resolved = resolveOpenEnaNodeDimensions(canonical, nodeLayout?.get(code));
    return { ...row, ...Object.fromEntries(resolved) };
  });
  const renderedDisplayNodeRows = nodeRows.filter((row) => (
    openEnaRenderedCodeIsVisible(codePresentation, String(row.code ?? ""))
  ));
  const points = result.set.points;
  const trajectory = result.trajectoryPresentation;
  const trajectoryGroupColor = (name: string) => {
    const index = result.groups.findIndex(group => group.name === name);
    return index >= 0 ? groupColor(result.groups[index], index) : JENA_GROUP_COLORS[0];
  };
  const axisColors = trajectory ? [AXIS_COLORS[0], AXIS_COLORS[1], "#008B00"] as const : AXIS_COLORS;
  const trajectoryAnnotations: OpenEna3dSceneAnnotation[] = [];
  const trajectoryLabelAnnotations: OpenEna3dLabelAnnotation[] = [];
  const labelSize = 12 * clamp(textScale, 0.65, 1.8, 1);
  const addTrajectoryLabel = (
    label: Omit<OpenEna3dLabelAnnotation, "annotationIndex">,
    point: Row,
    color = "#263740",
  ) => {
    const annotationIndex = trajectoryAnnotations.length;
    trajectoryLabelAnnotations.push({ ...label, annotationIndex });
    trajectoryAnnotations.push({
      name: label.id,
      x: coordinate(point, xDimension), y: coordinate(point, yDimension), z: coordinate(point, zDimension),
      text: escapeHoverText(label.text), hovertext: escapeHoverText(label.description),
      showarrow: label.role !== "centroid", arrowhead: 0, arrowwidth: 0.8, arrowcolor: label.role === "code" ? "rgba(0,0,0,0)" : color,
      ax: 0, ay: 0, xanchor: "center", yanchor: "middle", xshift: 0, yshift: 0, textangle: 0,
      opacity: 0, captureevents: false, borderpad: label.role === "centroid" ? 1 : 2, borderwidth: 0,
      bgcolor: "rgba(255,255,255,0.9)", font: { color, size: label.role === "centroid" ? labelSize * 10 / 12 : label.role === "code" ? labelSize * 5 / 6 : labelSize },
    });
  };
  const trajectoryPointKey = (row: Row) => JSON.stringify([row.Unit, row.Horizon]);
  const trajectoryPointsByKey = trajectory ? new Map(trajectory.points.map(point => [trajectoryPointKey(point.point), point])) : null;
  const visibleTrajectoryPoints = trajectoryPointsByKey ? new Set(trajectoryPointsByKey.keys()) : null;
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
  const summaryGroups = contrast ? result.groups : nativePlotSummaryGroupsV3(result);
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
    : summaryGroups.map((group, groupIndex) => ({ group, groupIndex, side: null, display: null }));
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
    ...(trajectory?.showConfidenceIntervals ? trajectory.centroids.flatMap(centroid => {
      const display = nativePlotGroupSettingsV3(result, centroid.group);
      if (!display.showMean || !display.showConfidenceIntervals) return [];
      return dimensions.flatMap(dimension => {
        const interval = centroid.intervals?.[dimension];
        return interval && interval.status !== "not-estimable" && Number.isFinite(interval.lower) && Number.isFinite(interval.upper)
          ? [Math.abs(interval.lower), Math.abs(interval.upper)] : [];
      });
    }) : []),
  ];
  // Keep trajectory framing close to the complete node/interval extent;
  // sceneExtent below still reserves room for axis heads and labels.
  const axisExtent = Math.max(0.5, ...coordinateMagnitudes) * (trajectory ? 1 : 1.15);

  // Draw the uncertainty wireframe before points, cones and labels. Plotly owns
  // axis reversal, so lower/upper remain the fitted-frame scientific bounds.
  if (trajectory?.showConfidenceIntervals) for (const centroid of trajectory.centroids) {
    const display = nativePlotGroupSettingsV3(result, centroid.group);
    if (!display.showMean || !display.showConfidenceIntervals) continue;
    traces.push(...trajectoryConfidenceBoxTraces(centroid, dimensions, trajectoryGroupColor(centroid.group)));
  }

  if (showNetworks && showCodeGraph && !trajectory) {
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
          const weighted = edgeWeight(summaryGroups, edge.name);
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
    const nodeByCode = new Map(nodeRows.map((row) => [String(row.code ?? ""), row]));
    for (const weighted of weightedEdges) {
      if (weighted.value <= 1e-12 || weighted.value / maximumEdge < safeThreshold) continue;
      if (!openEnaRenderedEdgeIsVisible(
        codePresentation,
        weighted.edge.source,
        weighted.edge.target,
      )) continue;
      const source = nodeByCode.get(weighted.edge.source) ?? nodeRows[weighted.edge.sourceIndex];
      const target = nodeByCode.get(weighted.edge.target) ?? nodeRows[weighted.edge.targetIndex];
      const group = result.groups[weighted.groupIndex];
      if (!source || !target || !group) continue;
      const relativeWeight = weighted.value / maximumEdge;
      const color = groupColor(group, weighted.groupIndex);
      const meaning = weighted.comparison && contrast
        ? `${contrast.primary.name} − ${contrast.secondary.name}: ${formatCoordinate(weighted.rawValue)}; ${group.name} stronger by ${formatCoordinate(weighted.value)}`
        : `${group.name} mean weight ${formatCoordinate(weighted.rawValue)}`;
      const hover = `<b>${escapeHoverText(openEnaRenderedCodeLabel(input, weighted.edge.source))} ↔ ${escapeHoverText(openEnaRenderedCodeLabel(input, weighted.edge.target))}</b><br>${escapeHoverText(meaning)}`;
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
      if (!nativePlotGroupSettingsV3(result, group.name).showUnitPoints) return;
      const visibleUnitIds = display ? new Set(display.visibleUnitIds) : null;
      const selected = points.filter((row) => (
        groupIndexForRow(result, groupColumn, row) === groupIndex
          && (!visibleUnitIds || visibleUnitIds.has(String(row.ENA_UNIT ?? "")))
          && !result.groupPresentation?.hiddenUnits.has(String(row.ENA_UNIT))
          && (!visibleTrajectoryPoints || visibleTrajectoryPoints.has(trajectoryPointKey(row)))
      ));
      if (selected.length === 0) return;
      const color = groupColor(group, groupIndex);
      const markerSymbol = trajectory ? "square" : contrast
        ? "circle"
        : GROUP_MARKER_SYMBOLS[groupIndex % GROUP_MARKER_SYMBOLS.length];
      const markerLabel = trajectory ? "square" : contrast
        ? "circle"
        : GROUP_MARKER_LABELS[groupIndex % GROUP_MARKER_LABELS.length];
      unitLegendGroupIndices.add(groupIndex);
      traces.push({
        type: "scatter3d",
        mode: showUnitLabels && !trajectory ? "markers+text" : "markers",
        name: `${escapeHoverText(group.name)} units · ${markerLabel}`,
        x: selected.map((row) => coordinate(row, xDimension)),
        y: selected.map((row) => coordinate(row, yDimension)),
        z: selected.map((row) => coordinate(row, zDimension)),
        text: selected.map((row, index) => literalGlText(row.ENA_UNIT ?? `unit-${index + 1}`)),
        customdata: selected.map((row, index) => {
          const label = String(row.ENA_UNIT ?? `unit-${index + 1}`);
          const point = dimensions.map((dimension) => coordinate(row, dimension)) as [number, number, number];
          const period = trajectoryPointsByKey?.get(trajectoryPointKey(row));
          return pointHover(label, group.name, point, dimensions) + (period ? `<br>${escapeHoverText(period.horizon)}` : "");
        }),
        textposition: "top center",
        marker: {
          color,
          size: 6 * safePointScale,
          symbol: markerSymbol,
          opacity: 0.68,
          line: { color: "#263740", width: trajectory ? 0 : 0.8 },
        },
        hovertemplate: "%{customdata}<extra></extra>",
        legendgroup: `open-ena-group-${groupIndex}`,
        showlegend: true,
        meta: { role: "unit-points", groupName: group.name, groupIndex, markerSymbol },
      });
      if (trajectory && showUnitLabels) selected.forEach((row, index) => {
        const point = trajectoryPointsByKey?.get(trajectoryPointKey(row));
        const label = String(row.ENA_UNIT ?? `unit-${index + 1}`);
        addTrajectoryLabel({
          id: `unit:${JSON.stringify([row.Group, row.Unit, row.Horizon])}`,
          role: "unit", text: label, priority: 100,
          description: `${group.name} · ${label}${point ? ` · ${point.horizon}` : ""}`,
        }, row, color);
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
    if (trajectory || group.count === 0 || !nativePlotGroupSettingsV3(result, group.name).showMean) return;
    const color = groupColor(group, groupIndex);
    const markerSymbol = "square";
    const meanSource = side?.meanPoint ?? group.meanPoint;
    const mean = dimensions.map((dimension) => finiteNumber(meanSource[dimension])) as [number, number, number];
    traces.push({
      type: "scatter3d",
      mode: "markers",
      name: `${escapeHoverText(group.name)} mean · square`,
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

  if (_legacyShowTrajectories && trajectory) for (const path of trajectory.paths) {
    if (!nativePlotGroupSettingsV3(result, path.group).showUnitPoints || result.groupPresentation?.hiddenUnits.has(path.unitLabel)) continue;
    traces.push({ type: "scatter3d", mode: "lines", name: "Observed fitted Unit path",
      x: [coordinate(path.from, xDimension), coordinate(path.to, xDimension)], y: [coordinate(path.from, yDimension), coordinate(path.to, yDimension)], z: [coordinate(path.from, zDimension), coordinate(path.to, zDimension)],
      line: { color: trajectoryGroupColor(path.group), width: 3 }, showlegend: false, hovertemplate: `Fitted ordinals ${path.fromOrdinal} → ${path.toOrdinal}<extra></extra>`, meta: { role: "trajectory-path", groupName: path.group } });
  }
  if (trajectory) {
    for (const path of trajectory.centroidPaths) {
      if (!nativePlotGroupSettingsV3(result, path.from.group).showMean) continue;
      const color = "black";
      traces.push({ type: "scatter3d", mode: "lines", name: "Observed Group centroid path",
        x: [coordinate(path.from.point, xDimension), coordinate(path.to.point, xDimension)], y: [coordinate(path.from.point, yDimension), coordinate(path.to.point, yDimension)], z: [coordinate(path.from.point, zDimension), coordinate(path.to.point, zDimension)],
        line: { color, width: 3 }, showlegend: false, hovertemplate: `${path.sharedContributorCount} actual shared contributors; available-population centroids, not matched change<extra></extra>`, meta: { role: "trajectory-path", groupName: path.from.group } });
      // Same mid-segment cone grammar as the pinned longitudinal renderer;
      // only native observed fitted connectors supply direction and endpoints.
      const from = dimensions.map(axis => coordinate(path.from.point, axis));
      const to = dimensions.map(axis => coordinate(path.to.point, axis));
      const delta = to.map((value, index) => value - from[index]);
      const length = Math.hypot(...delta);
      if (trajectory.showDirection !== false && length > 0) traces.push({ type: "cone", name: "Observed fitted direction",
        x: [from[0] + delta[0] * 0.5], y: [from[1] + delta[1] * 0.5], z: [from[2] + delta[2] * 0.5],
        u: [delta[0] / length], v: [delta[1] / length], w: [delta[2] / length], anchor: "center", sizemode: "absolute", sizeref: Math.min(0.13, length * 0.4),
        colorscale: [[0, color], [1, color]], showscale: false, showlegend: false, hoverinfo: "skip", meta: { role: "direction-arrow", groupName: path.from.group } });
    }
    for (const centroid of trajectory.centroids) {
      if (!nativePlotGroupSettingsV3(result, centroid.group).showMean) continue;
      const description = trajectoryCentroidDescriptionV3(centroid);
      const color = trajectoryGroupColor(centroid.group);
      traces.push({ type: "scatter3d", mode: "markers", name: "Observed Group centroid",
        x: [coordinate(centroid.point, xDimension)], y: [coordinate(centroid.point, yDimension)], z: [coordinate(centroid.point, zDimension)],
        text: [literalGlText(description)], marker: { color, size: 7, symbol: "square", line: { color, width: 0 } }, showlegend: false,
        hovertemplate: `${escapeHoverText(description)}<extra></extra>`, meta: { role: "group-mean", groupName: centroid.group } });
      addTrajectoryLabel({ id: `centroid:${centroid.key}`, role: "centroid", text: centroid.horizonShortLabel,
        description, priority: 350 }, centroid.point);
    }
  }
  if (renderedDisplayNodeRows.length > 0) {
    traces.push({
      type: "scatter3d",
      mode: "markers",
      name: "Codes",
      x: renderedDisplayNodeRows.map((row) => coordinate(row, xDimension)),
      y: renderedDisplayNodeRows.map((row) => coordinate(row, yDimension)),
      z: renderedDisplayNodeRows.map((row) => coordinate(row, zDimension)),
      ids: renderedDisplayNodeRows.map((row) => String(row.code)),
      text: renderedDisplayNodeRows.map((row) => openEnaRenderedCodeLabel(input, String(row.code ?? ""))),
      customdata: renderedDisplayNodeRows.map((row) => {
        const label = openEnaRenderedCodeLabel(input, String(row.code ?? ""));
        const point = dimensions.map((dimension) => coordinate(row, dimension)) as [number, number, number];
        return pointHover(`Code: ${label}`, "Code node", point, dimensions);
      }),
      textposition: "top center",
      textfont: { color: "#263740", size: 12 },
      marker: {
        color: renderedDisplayNodeRows.map((row) => codeColorFor(codeColors, String(row.code ?? ""))),
        size: trajectory ? 3.25 : 9,
        symbol: trajectory ? "circle-open" : "circle",
        opacity: 1,
        line: trajectory ? undefined : { color: "#ffffff", width: 1.5 },
      },
      hovertemplate: "%{customdata}<extra></extra>",
      showlegend: false,
      meta: { role: "code-node", markerSymbol: trajectory ? "circle-open" : "circle" },
    });
  }

  if (showLabels && renderedDisplayNodeRows.length > 0) {
    const labels = labelRows.filter(row => openEnaRenderedCodeIsVisible(codePresentation, String(row.code ?? "")));
    traces.push({
      type: "scatter3d", mode: "text", name: "Code labels",
      ...(trajectory ? { visible: false } : {}),
      x: labels.map(row => coordinate(row, xDimension)),
      y: labels.map(row => coordinate(row, yDimension)),
      z: labels.map(row => coordinate(row, zDimension)),
      ids: labels.map(row => String(row.code)),
      text: labels.map(row => literalGlText(openEnaRenderedCodeLabel(input, String(row.code)))),
      customdata: labels.map(row => escapeHoverText(openEnaRenderedCodeLabel(input, String(row.code)))),
      textposition: "top center", textfont: { color: "#263740", size: 12 },
      hovertemplate: "%{customdata}<extra></extra>", showlegend: false,
      meta: { role: "code-label" },
    });
    if (trajectory) labels.forEach(row => {
      const code = String(row.code);
      const text = openEnaRenderedCodeLabel(input, code);
      const manual = dimensions.some(dimension => nodeLayout?.get(code)?.has(dimension));
      addTrajectoryLabel({ id: `code:${code}`, role: "code", code, text, description: text, priority: manual ? 400 : 300,
        ...(manual ? { preferredPosition: { x: coordinate(row, xDimension), y: coordinate(row, yDimension), z: coordinate(row, zDimension) } } : {}),
      }, canonicalNodeByCode.get(code)!);
    });
  }

  traces.push(...axisTraces(axisExtent, dimensions, axisColors));

  const annotations = showVariance
    ? dimensions.map((dimension, index) => ({
        text: `${dimension}: ${(finiteNumber(result.set.variance[dimension]) * 100).toFixed(1)}% variance`,
        x: 0.01,
        y: 1.04 - index * 0.035,
        xref: "paper" as const,
        yref: "paper" as const,
        showarrow: false as const,
        font: { color: axisColors[index], size: 11 },
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
    ...(trajectory ? { trajectoryLabelAnnotations } : {}),
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
      ...(trajectory ? { showlegend: false } : {}),
      hoverlabel: { bgcolor: "#0f172a", font: { color: "#ffffff" } },
      uirevision: OPEN_ENA_3D_UI_REVISION,
      annotations,
      scene: {
        ...(trajectory ? { annotations: trajectoryAnnotations } : {}),
        xaxis: sceneAxis(xDimension, axisColors[0], flipX),
        yaxis: sceneAxis(yDimension, axisColors[1], flipY),
        zaxis: sceneAxis(zDimension, axisColors[2], false),
        camera: scaledCamera(camera, plotZoom, trajectory ? OPEN_ENA_TRAJECTORY_DEFAULT_CAMERA_ZOOM : 1),
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
