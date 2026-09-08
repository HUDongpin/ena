import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";
import type { OpenEnaContrastPresentation } from "@/lib/open-ena/bound-presentation-v3";
import type {
  OpenEnaPairwiseContrast,
  OpenEnaPairwiseContrastSide,
} from "@/lib/open-ena/contrasts";
import { readableOpenEnaTextColor } from "@/lib/open-ena/color-contrast";
import {
  DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS,
  type OpenEnaDerivedGroupDisplay,
  type OpenEnaResolvedGroupDisplaySide,
} from "@/lib/open-ena/group-display";
import { codeColorFor, type OpenEnaCodeColors } from "@/lib/open-ena/plot-style";
import type {
  OpenEnaNodeDimensionPosition,
  OpenEnaNodeLayoutPositions,
} from "@/lib/open-ena/node-layout";
import {
  openEnaRenderedCodeIsVisible, openEnaRenderedCodeLabel,
  openEnaRenderedEdgeIsVisible,
  type OpenEnaCodeGraphPresentation,
} from "@/lib/open-ena/ordered-plot";
import {
  marginalMeanIntervalPair,
  meanCenteredIqrOutlierIntervalPair,
  type OpenEnaMeanCenteredIqrOutlierIntervalPair,
  type OpenEnaMarginalMeanIntervalPair,
} from "@/lib/open-ena/uncertainty";
import OpenEnaPlotActionIcon from "./OpenEnaPlotActionIcon";
import OpenEnaSvgDraggableNode from "./OpenEnaSvgDraggableNode";

export interface OpenEnaGroupContrastProps extends OpenEnaCodeGraphPresentation {
  contrast: OpenEnaContrastPresentation;
  codeColors?: OpenEnaCodeColors;
  edgeThreshold: number;
  showPoints: boolean;
  showNetworks: boolean;
  showLabels: boolean;
  showGroupLabels: boolean;
  showUnitLabels: boolean;
  unitCircle?: boolean;
  showVariance: boolean;
  edgeScale: number;
  pointScale: number;
  textScale?: number;
  plotZoom: number;
  plotResetRevision?: number;
  flipX: boolean;
  flipY: boolean;
  svgRef?: Ref<SVGSVGElement>;
  centerMode?: "plot" | "data";
  dataView?: ReactNode;
  rightTools?: ReactNode;
  onSwitchPlots?: () => void;
  onConfirmIdentityBearingExport?: () => boolean;
  nodeLayout?: OpenEnaNodeLayoutPositions;
  onNodeMove?: (code: string, dimensions: OpenEnaNodeDimensionPosition) => void;
  groupDisplay?: Pick<OpenEnaDerivedGroupDisplay, "primary" | "secondary" | "hiddenUnitKeys">;
  uiCopy?: {
    readonly comparisonPlot: string;
    readonly primaryPlot: string;
    readonly secondaryPlot: string;
    readonly dataView: string;
    readonly comparisonAria: string;
    readonly primaryPlotAria: string;
    readonly secondaryPlotAria: string;
    readonly primaryEmptyAria: string;
    readonly secondaryEmptyAria: string;
    readonly emptyGroupPrompt: string;
    readonly toolsTitle: string;
    readonly selectedGroupOrder: string;
    readonly dataViewComparisonRecords: (primary: string, secondary: string) => string;
    readonly dataViewUnavailable: string;
    readonly plotActionsLabel: (plot: string) => string;
    readonly plotActionLabel: (plot: string, action: string) => string;
    readonly zoomIn: string;
    readonly zoomOut: string;
    readonly recenter: string;
    readonly recenterTitle: string;
    readonly copyImage: string;
    readonly copyImageTitle: string;
    readonly panelActionsLabel: (plot: string) => string;
    readonly hidePlot: string;
    readonly showPlot: string;
    readonly removePlot: string;
    readonly switchPlots: string;
    readonly restorePlot: (plot: string) => string;
    readonly copying: string;
    readonly imageCopied: string;
    readonly svgCopied: string;
    readonly copyUnavailable: string;
    readonly copyCancelled: string;
    readonly scaledCaption: (multiplier: string) => string;
    readonly sideScaledDescription: (group: string, multiplier: string) => string;
    readonly comparisonScaledDescription: (groups: readonly string[], multiplier: string) => string;
    readonly sharedScale: (value: string) => string;
    readonly differenceScale: (value: string) => string;
    readonly scaledMultiplier: (value: string) => string;
    readonly signedEdgeDifferences: string;
    readonly groupMeanNetwork: string;
    readonly analyticUnits: (count: number) => string;
    readonly methodBoundary: string;
    readonly confidenceMethodBoundary: string;
    readonly outlierMethodBoundary: string;
    readonly unitsDefinition: string;
    readonly horizonDefinition: string;
    readonly noNonzeroDifferences: string;
  };
}

const DEFAULT_GROUP_CONTRAST_UI_COPY = {
  comparisonPlot: "Comparison Plot",
  primaryPlot: "Primary Plot",
  secondaryPlot: "Secondary Plot",
  dataView: "Data View",
  comparisonAria: "Comparison plot. Scroll horizontally on small screens.",
  primaryPlotAria: "Primary plot. Scroll horizontally on small screens.",
  secondaryPlotAria: "Secondary plot. Scroll horizontally on small screens.",
  primaryEmptyAria: "Primary Plot is empty",
  secondaryEmptyAria: "Secondary Plot is empty",
  emptyGroupPrompt: "Click or hover points in the comparison plot to display networks here",
  toolsTitle: "Plot Tools",
  selectedGroupOrder: "Selected group order",
  dataViewComparisonRecords: (primary: string, secondary: string) => `${primary} and ${secondary} · comparison records`,
  dataViewUnavailable: "Data View is not available for this comparison result.",
  plotActionsLabel: (plot: string) => `${plot} actions`,
  plotActionLabel: (plot: string, action: string) => `${plot}: ${action}`,
  zoomIn: "Zoom In",
  zoomOut: "Zoom Out",
  recenter: "Recenter",
  recenterTitle: "Recenter Plot",
  copyImage: "Copy image",
  copyImageTitle: "Copy plot image to clipboard",
  panelActionsLabel: (plot: string) => `${plot} panel actions`,
  hidePlot: "Hide Plot",
  showPlot: "Show Plot",
  removePlot: "Remove Plot",
  switchPlots: "Switch Plots",
  restorePlot: (plot: string) => `Restore ${plot}`,
  copying: "Copying…",
  imageCopied: "Image copied",
  svgCopied: "SVG copied as text",
  copyUnavailable: "Copy unavailable",
  copyCancelled: "Copy cancelled",
  scaledCaption: (multiplier: string) => `(scaled ${multiplier}x)`,
  sideScaledDescription: (group: string, multiplier: string) => `${group}, scaled ${multiplier} times`,
  comparisonScaledDescription: (groups: readonly string[], multiplier: string) => groups.length === 2
    ? `${groups[0]} minus ${groups[1]}, scaled ${multiplier} times`
    : groups.length === 1 ? `${groups[0]}, scaled ${multiplier} times` : `No selected group network, scaled ${multiplier} times`,
  sharedScale: (value: string) => `Shared scale ${value}`,
  differenceScale: (value: string) => `Difference scale ${value}`,
  scaledMultiplier: (value: string) => `scaled ${value}x`,
  signedEdgeDifferences: "signed edge differences",
  groupMeanNetwork: "group mean network",
  analyticUnits: (count: number) => `${count} analytic units`,
  methodBoundary: "Each connection is drawn once as Primary minus Secondary in the stable color of the stronger selected group; line width is the absolute edge difference. The two side plots retain the displayed group-mean networks on their shared mean scale.",
  confidenceMethodBoundary: "Dashed guides are separate marginal 95% Student-t confidence intervals for the enabled displayed-axis group means; they are not a joint confidence region or a significance test.",
  outlierMethodBoundary: "Short-dashed guides are rENA-compatible mean-centered 1.5 × IQR display intervals; they are not Tukey fences, automatic exclusions, confidence intervals, or tests.",
  unitsDefinition: "Units",
  horizonDefinition: "Horizon",
  noNonzeroDifferences: "No nonzero Primary-minus-Secondary edge differences are present for this selected pair.",
} as const;

type ContrastEdge = OpenEnaPairwiseContrast["edges"][number];
type ContrastNode = OpenEnaPairwiseContrast["nodes"][number];
type CoordinateExtent = OpenEnaPairwiseContrast["coordinateExtent"];
type PlotKind = "comparison" | "primary" | "secondary";
type GroupRole = "primary" | "secondary";
type PlotCopyStatus = "idle" | "copying" | "image-copied" | "svg-copied" | "unavailable" | "cancelled";
type GroupContrastUiCopy = NonNullable<OpenEnaGroupContrastProps["uiCopy"]>;
const RESTORE_HIT_TARGET_SVG_SIZE = 56;
const RESTORE_HIT_TARGET_CSS_SIZE = 33;

function plotCopyStatusLabel(status: PlotCopyStatus, copy: GroupContrastUiCopy) {
  switch (status) {
    case "idle": return "";
    case "copying": return copy.copying;
    case "image-copied": return copy.imageCopied;
    case "svg-copied": return copy.svgCopied;
    case "unavailable": return copy.copyUnavailable;
    case "cancelled": return copy.copyCancelled;
  }
}
type ProjectedPoint = { x: number; y: number };

export function officialEquiUnitCircleNodePositions(
  nodes: Array<{ code: string; x: number; y: number }>,
) {
  const positions = new Map<string, ProjectedPoint>();
  let invalidCoordinate = false;
  const finiteNodes = nodes.flatMap((node, sourceIndex) => {
    const x = finiteNumber(node.x);
    const y = finiteNumber(node.y);
    if (x === null || y === null) {
      invalidCoordinate = true;
      return [];
    }
    positions.set(node.code, { x, y });
    const radius = Math.hypot(x, y);
    return radius > 0 ? [{ node, sourceIndex, x, y, radius }] : [];
  });
  if (invalidCoordinate || finiteNodes.length === 0) return positions;

  const upper = finiteNodes
    .filter(({ y }) => y >= 0)
    .toSorted((left, right) => right.x - left.x || left.sourceIndex - right.sourceIndex);
  const lower = finiteNodes
    .filter(({ y }) => y < 0)
    .toSorted((left, right) => left.x - right.x || left.sourceIndex - right.sourceIndex);
  const ordered = [...upper, ...lower];
  const maximumRadius = Math.max(...finiteNodes.map(({ radius }) => radius));
  const anchor = finiteNodes.find(({ radius }) => radius === maximumRadius) ?? finiteNodes[0];
  const anchorIndex = Math.max(0, ordered.findIndex(({ sourceIndex }) => sourceIndex === anchor.sourceIndex));
  const angleStep = Math.PI * 2 / ordered.length;

  ordered.forEach((_, offset) => {
    const target = ordered[(anchorIndex + offset) % ordered.length];
    const angle = offset * angleStep;
    positions.set(target.node.code, {
      x: anchor.x * Math.cos(angle) - anchor.y * Math.sin(angle),
      y: anchor.x * Math.sin(angle) + anchor.y * Math.cos(angle),
    });
  });
  return positions;
}

export type OpenEnaPlotPanelStatus = "visible" | "hidden" | "removed";
export type OpenEnaPlotPanelState = Record<GroupRole, OpenEnaPlotPanelStatus>;
export type OpenEnaPlotPanelAction = {
  type: "toggle-visibility" | "remove" | "restore";
  plot: GroupRole;
};

export const OPEN_ENA_INITIAL_PLOT_PANEL_STATE: OpenEnaPlotPanelState = {
  primary: "visible",
  secondary: "visible",
};

export function reduceOpenEnaPlotPanelState(
  state: OpenEnaPlotPanelState,
  action: OpenEnaPlotPanelAction,
): OpenEnaPlotPanelState {
  const current = state[action.plot];
  const next = action.type === "toggle-visibility"
    ? current === "visible" ? "hidden" : current === "hidden" ? "visible" : "removed"
    : action.type === "remove"
      ? "removed"
      : "visible";
  return next === current ? state : { ...state, [action.plot]: next };
}

type OpenEnaPanelRoles = Record<GroupRole, GroupRole | null>;

const MAIN_WIDTH = 920;
const MAIN_HEIGHT = 723;
const MINI_WIDTH = 440;
const MINI_HEIGHT = 223;
// Total square-camera inset after the SVG paper's CSS border/padding is
// applied. These values reproduce webENA's Sigma axis endpoints at 1920×813.
const MAIN_PADDING = 39;
const MINI_PADDING = 32;
// webENA binds colors to the fitted group identity, not to the mutable
// Primary/Secondary display role. Keep this presentation palette local to the
// official comparison workbench; the generic jENA plots retain their own
// palette contract.
const WEB_ENA_GROUP_COLORS = [
  "#cc423a", "#218ebf", "#56bd7c", "#ef691b", "#9d5dbb", "#fbc848",
  "#d0386c", "#f18e9f", "#9a9eab", "#ff8c39", "#346b88",
] as const;
const PRIMARY_COLOR = WEB_ENA_GROUP_COLORS[0];
const SECONDARY_COLOR = WEB_ENA_GROUP_COLORS[1];
const ZERO_TOLERANCE = 1e-12;
const GROUP_CAPTION_BACKGROUND = "#edf1f2";

type PlotZoomState = Record<PlotKind, number>;

export const MAX_PAIRWISE_RENDERED_POINTS_PER_GROUP = 2_000;

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function finiteOrZero(value: unknown) {
  return finiteNumber(value) ?? 0;
}

function bounded(value: number, minimum: number, maximum: number, fallback: number) {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

function officialEdgeOpacity(
  magnitude: number,
  minimum: number,
  maximum: number,
) {
  if (maximum - minimum <= ZERO_TOLERANCE) return 1;
  return 0.3 + (magnitude - minimum) / (maximum - minimum) * 0.7;
}

function safeUnitLabel(value: unknown) {
  const normalized = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (!normalized) return "Unnamed unit";
  return normalized.length > 51 ? `${normalized.slice(0, 50)}…` : normalized;
}

function safeFigureLabel(value: unknown, maximumLength: number) {
  const normalized = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (normalized.length <= maximumLength) return normalized;
  return `${normalized.slice(0, Math.max(1, maximumLength - 1))}…`;
}

function formatNumber(value: unknown, signed = false) {
  const safeValue = finiteOrZero(value);
  if (Math.abs(safeValue) < 0.0005) return "0.000";
  const magnitude = Math.abs(safeValue).toFixed(3);
  if (!signed) return safeValue < 0 ? `−${magnitude}` : magnitude;
  return safeValue > 0 ? `+${magnitude}` : `−${magnitude}`;
}

function officialAxisLabel(axis: string) {
  return axis === "MR1" ? "GMR1" : axis;
}

function dataNumber(value: number) {
  return Number.isFinite(value) ? String(value) : "0";
}

function boundedZoom(value: number) {
  return bounded(value, 0.6, 2.4, 1);
}

async function copyPlotImage(button: HTMLButtonElement) {
  const svg = button.closest("figure")?.querySelector<SVGSVGElement>("svg[data-ena-plot-kind]");
  if (!(svg instanceof SVGSVGElement)) throw new Error("Plot image is unavailable.");
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const viewBox = svg.viewBox.baseVal;
  const width = Math.max(1, viewBox.width || svg.clientWidth || MAIN_WIDTH);
  const height = Math.max(1, viewBox.height || svg.clientHeight || MAIN_HEIGHT);
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = `
    text { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }
    .ena-set-plot-background { fill: #fff; }
    .ena-set-zero-axes line { stroke: #333; stroke-width: 0.5; }
    .ena-set-axis-endpoint { fill: #333; }
    .ena-set-zero-axes text { fill: #4d4d4d; font-size: calc(12px * var(--ena-plot-text-scale, 1) + var(--ena-font-step, 1px)); font-weight: 690; }
    .ena-set-result-node { fill: #4d4d4d; stroke: #4d4d4d; stroke-width: 0; }
    .ena-set-result-label { fill: #111; paint-order: normal; stroke: none; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: calc(10px * var(--ena-plot-text-scale, 1) + var(--ena-font-step, 1px)); font-weight: 600; }
    .ena-set-group-label { fill: #111; paint-order: normal; stroke: none; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: calc(10px * var(--ena-plot-text-scale, 1) + var(--ena-font-step, 1px)); font-weight: 600; }
    .ena-set-unit-label { fill: #263740; paint-order: stroke; stroke: #fff; stroke-linejoin: round; stroke-width: 4px; font-weight: 700; }
    .ena-set-unit-label { font-size: calc(8px * var(--ena-plot-text-scale, 1) + var(--ena-font-step, 1px)); }
  `;
  clone.insertBefore(style, clone.firstChild);
  const serialized = new XMLSerializer().serializeToString(clone);
  const sourceBlob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  const objectUrl = URL.createObjectURL(sourceBlob);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    await image.decode();
    const scale = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Plot image canvas is unavailable.");
    context.scale(scale, scale);
    context.drawImage(image, 0, 0, width, height);
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Plot image encoding failed.")), "image/png");
    });
    if (typeof ClipboardItem === "function" && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      return "image" as const;
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(serialized);
      return "svg-text" as const;
    } else {
      throw new Error("Clipboard access is unavailable.");
    }
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function formatMultiplier(value: unknown) {
  return bounded(finiteOrZero(value), 0.5, 2, 1).toFixed(2);
}

function formatOfficialMultiplier(value: unknown) {
  return bounded(finiteOrZero(value), 0.5, 2, 1).toFixed(1);
}

function validExtent(value: CoordinateExtent | undefined): value is CoordinateExtent {
  return Boolean(
    value
    && finiteNumber(value.minX) !== null
    && finiteNumber(value.maxX) !== null
    && finiteNumber(value.minY) !== null
    && finiteNumber(value.maxY) !== null
    && value.minX <= value.maxX
    && value.minY <= value.maxY,
  );
}

function derivedExtent(contrast: OpenEnaContrastPresentation): CoordinateExtent {
  const validPoints = [
    ...contrast.nodes,
    ...contrast.primary.points,
    ...contrast.secondary.points,
  ].filter((point) => finiteNumber(point.x) !== null && finiteNumber(point.y) !== null);
  const xs = validPoints.map((point) => point.x);
  const ys = validPoints.map((point) => point.y);
  return {
    minX: xs.length ? Math.min(...xs) : -1,
    maxX: xs.length ? Math.max(...xs) : 1,
    minY: ys.length ? Math.min(...ys) : -1,
    maxY: ys.length ? Math.max(...ys) : 1,
  };
}

function resolveExtent(contrast: OpenEnaContrastPresentation) {
  const runtimeExtent = contrast.coordinateExtent;
  return validExtent(runtimeExtent)
    ? { extent: runtimeExtent, source: "full-result" as const }
    : { extent: derivedExtent(contrast), source: "derived-selected-points-and-nodes" as const };
}

function resolveOfficialPlotFrame(
  contrast: OpenEnaContrastPresentation,
  extent: CoordinateExtent,
) {
  const frame = contrast.officialPlotFrame;
  if (frame
    && finiteNumber(frame.pointScaleFactor) !== null
    && frame.pointScaleFactor > ZERO_TOLERANCE
    && finiteNumber(frame.maxPosition) !== null
    && frame.maxPosition > ZERO_TOLERANCE
    && finiteNumber(frame.extremePosition) !== null
    && frame.extremePosition > ZERO_TOLERANCE) {
    return frame;
  }
  const maxPosition = Math.max(
    Math.abs(extent.minX),
    Math.abs(extent.maxX),
    Math.abs(extent.minY),
    Math.abs(extent.maxY),
    1,
  );
  return {
    source: "webena-points-rotated-scaled" as const,
    pointScaleFactor: 1,
    maxPosition,
    extremePosition: maxPosition * 1.2,
  };
}

function buildProjector(
  extremePosition: number,
  width: number,
  height: number,
  padding: number,
  flipX: boolean,
  flipY: boolean,
  centerOffsetX = 0,
  centerOffsetY = 0,
) {
  const extreme = Math.max(Math.abs(extremePosition), ZERO_TOLERANCE);
  const scale = Math.min(width - padding, height - padding) / (extreme * 2);

  const project = (xValue: unknown, yValue: unknown): ProjectedPoint => {
    const x = finiteNumber(xValue) ?? 0;
    const y = finiteNumber(yValue) ?? 0;
    return {
      x: width / 2 + centerOffsetX + x * scale * (flipX ? -1 : 1),
      y: height / 2 + centerOffsetY - y * scale * (flipY ? -1 : 1),
    };
  };
  const invert = (point: ProjectedPoint): ProjectedPoint => ({
    x: (point.x - width / 2 - centerOffsetX) / (scale * (flipX ? -1 : 1)),
    y: -(point.y - height / 2 - centerOffsetY) / (scale * (flipY ? -1 : 1)),
  });
  return { project, invert };
}

function clientPointInContrastSvg(target: SVGGElement, clientX: number, clientY: number) {
  const svg = target.ownerSVGElement;
  const matrix = svg?.getScreenCTM();
  if (!svg || !matrix) return null;
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const resolved = point.matrixTransform(matrix.inverse());
  return Number.isFinite(resolved.x) && Number.isFinite(resolved.y)
    ? { x: resolved.x, y: resolved.y }
    : null;
}

function validPoints(side: OpenEnaPairwiseContrastSide) {
  return side.points.filter((point) => finiteNumber(point.x) !== null && finiteNumber(point.y) !== null);
}

function sampledPoints<T>(points: readonly T[]) {
  if (points.length <= MAX_PAIRWISE_RENDERED_POINTS_PER_GROUP) {
    return points.map((point, sourceIndex) => ({ point, sourceIndex }));
  }
  return Array.from({ length: MAX_PAIRWISE_RENDERED_POINTS_PER_GROUP }, (_, sampleIndex) => {
    const sourceIndex = Math.round(
      sampleIndex * (points.length - 1) / (MAX_PAIRWISE_RENDERED_POINTS_PER_GROUP - 1),
    );
    return { point: points[sourceIndex], sourceIndex };
  });
}

function meanCoordinate(
  side: OpenEnaPairwiseContrastSide,
  axis: string,
) {
  return finiteOrZero(side.meanPoint[axis]);
}

function edgeValue(edge: ContrastEdge, role: GroupRole) {
  return role === "primary" ? finiteOrZero(edge.primaryWeight) : finiteOrZero(edge.secondaryWeight);
}

function differenceSign(edge: ContrastEdge) {
  const difference = finiteOrZero(edge.signedDifference);
  if (Math.abs(difference) <= ZERO_TOLERANCE || edge.stronger === "equal") return "equal" as const;
  return difference > 0 ? "positive" as const : "negative" as const;
}

function groupColor(
  contrast: OpenEnaContrastPresentation,
  side: OpenEnaPairwiseContrastSide,
  role: GroupRole,
) {
  const declaredIndex = contrast.declaredGroups?.findIndex((group) => group.name === side.name) ?? -1;
  return (declaredIndex >= 0 ? WEB_ENA_GROUP_COLORS[declaredIndex % WEB_ENA_GROUP_COLORS.length] : undefined)
    ?? side.color
    ?? (role === "primary" ? PRIMARY_COLOR : SECONDARY_COLOR);
}

function groupCaptionColor(
  contrast: OpenEnaContrastPresentation,
  side: OpenEnaPairwiseContrastSide,
  role: GroupRole,
) {
  return readableOpenEnaTextColor(groupColor(contrast, side, role), GROUP_CAPTION_BACKGROUND);
}

function groupDisplaySide(
  groupDisplay: OpenEnaGroupContrastProps["groupDisplay"],
  role: GroupRole,
  side: OpenEnaPairwiseContrastSide,
): OpenEnaResolvedGroupDisplaySide {
  const candidate = groupDisplay?.[role];
  if (candidate?.name === side.name) return candidate;
  const pointUnitIds = side.points.map(({ unitId }) => unitId);
  return {
    name: side.name,
    settings: { ...DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS },
    totalUnitCount: side.points.length,
    validUnitCount: validPoints(side).length,
    hiddenUnitCount: 0,
    visibleUnitIds: pointUnitIds,
    summaryUnitIds: pointUnitIds,
  };
}

function confidenceIntervals(
  side: OpenEnaPairwiseContrastSide,
  axes: readonly [string, string],
): OpenEnaMarginalMeanIntervalPair {
  const stored = side.meanConfidenceIntervals;
  return stored && stored.xAxis === axes[0] && stored.yAxis === axes[1]
    ? stored
    : marginalMeanIntervalPair(side.points, axes);
}

function outlierIntervals(
  side: OpenEnaPairwiseContrastSide,
  axes: readonly [string, string],
): OpenEnaMeanCenteredIqrOutlierIntervalPair {
  const stored = side.outlierIntervals;
  return stored && stored.xAxis === axes[0] && stored.yAxis === axes[1]
    ? stored
    : meanCenteredIqrOutlierIntervalPair(side.points, axes);
}

function confidenceGuideIsEstimable(
  side: OpenEnaPairwiseContrastSide,
  axes: readonly [string, string],
) {
  const interval = confidenceIntervals(side, axes);
  return interval.x.status === "estimable" && interval.y.status === "estimable";
}

function outlierGuideIsEstimable(
  side: OpenEnaPairwiseContrastSide,
  axes: readonly [string, string],
) {
  const interval = outlierIntervals(side, axes);
  return interval.x.status === "estimable" && interval.y.status === "estimable";
}

interface GroupMeanMarkerProps {
  point: ProjectedPoint;
  compact: boolean;
  groupName: string;
  role: GroupRole;
  color: string;
  showLabel: boolean;
  restoreLabel?: string | null;
  restoreSlot?: GroupRole;
  restoreHitTargetScale?: number;
  onRestore?: () => void;
}

function GroupMeanMarker({
  point,
  compact: _compact,
  groupName,
  role,
  color,
  showLabel,
  restoreLabel,
  restoreSlot,
  restoreHitTargetScale = 1,
  onRestore,
}: GroupMeanMarkerProps) {
  const halfSize = 5.75;
  const roleLabel = role === "primary" ? "Primary" : "Secondary";
  const label = restoreLabel ?? `${roleLabel} group mean for ${groupName}, square marker`;
  const interactive = Boolean(restoreLabel && onRestore);
  return (
    <g
      transform={`translate(${point.x} ${point.y})`}
      role={interactive ? "button" : "img"}
      tabIndex={interactive ? 0 : undefined}
      aria-label={label}
      onClick={interactive ? onRestore : undefined}
      onKeyDown={interactive ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onRestore?.();
        }
      } : undefined}
      data-ena-mean-marker={`${role}-square`}
      data-ena-summary-marker="true"
      data-ena-group-role={role}
      data-ena-restore-panel={interactive ? restoreLabel : undefined}
      data-ena-restore-slot={interactive ? restoreSlot : undefined}
      data-ena-point-shape="square"
      data-ena-marker-size={halfSize * 2}
    >
      <title>{label}</title>
      {interactive ? (
        <rect
          x={-RESTORE_HIT_TARGET_SVG_SIZE / 2}
          y={-RESTORE_HIT_TARGET_SVG_SIZE / 2}
          width={RESTORE_HIT_TARGET_SVG_SIZE}
          height={RESTORE_HIT_TARGET_SVG_SIZE}
          transform={`scale(${restoreHitTargetScale})`}
          fill="transparent"
          pointerEvents="all"
          data-ena-restore-hit-target="true"
          data-ena-restore-hit-target-scale={dataNumber(restoreHitTargetScale)}
        />
      ) : null}
      <rect
        x={-halfSize}
        y={-halfSize}
        width={halfSize * 2}
        height={halfSize * 2}
        rx="1"
        fill={color}
      />
      {showLabel ? (
        <text
          x={halfSize + 3}
          y="3"
          textAnchor="start"
          className="ena-set-group-label"
          aria-hidden="true"
        >
          {safeFigureLabel(groupName, 72)}
        </text>
      ) : null}
    </g>
  );
}

interface ConfidenceGuideProps {
  side: OpenEnaPairwiseContrastSide;
  role: GroupRole;
  axes: readonly [string, string];
  project: (x: number, y: number) => ProjectedPoint;
  color: string;
}

function ConfidenceGuide({ side, role, axes, project, color }: ConfidenceGuideProps) {
  const intervals = confidenceIntervals(side, axes);
  const x = intervals.x;
  const y = intervals.y;
  if (x.status !== "estimable" || y.status !== "estimable") {
    const reason = x.status === "not-estimable" && x.reason === "insufficient-n"
      || y.status === "not-estimable" && y.reason === "insufficient-n"
      ? "insufficient-n"
      : "zero-or-nonfinite-standard-error";
    return (
      <desc
        data-ena-uncertainty-status="not-estimable"
        data-ena-group-role={role}
        data-ena-uncertainty-reason={reason}
      >
        {`${side.name} marginal 95% Student-t mean intervals are not estimable (${reason}).`}
      </desc>
    );
  }

  const cornerPoints = [
    project(x.lower, y.lower),
    project(x.lower, y.upper),
    project(x.upper, y.lower),
    project(x.upper, y.upper),
  ];
  const left = Math.min(...cornerPoints.map(({ x: screenX }) => screenX));
  const right = Math.max(...cornerPoints.map(({ x: screenX }) => screenX));
  const top = Math.min(...cornerPoints.map(({ y: screenY }) => screenY));
  const bottom = Math.max(...cornerPoints.map(({ y: screenY }) => screenY));
  const mean = project(x.mean, y.mean);
  const meanXStart = project(x.lower, y.mean);
  const meanXEnd = project(x.upper, y.mean);
  const meanYStart = project(x.mean, y.lower);
  const meanYEnd = project(x.mean, y.upper);
  const dash = "10,10,5,10";
  const handleSize = 3.9;
  const handleHalf = handleSize / 2;
  const label = `${side.name}: two separate marginal 95% Student-t confidence intervals for the arithmetic endpoint-unit group mean; not a joint confidence region or significance test.`;
  const lines = [
    { role: "top", x1: left, y1: top, x2: right, y2: top },
    { role: "right", x1: right, y1: top, x2: right, y2: bottom },
    { role: "bottom", x1: right, y1: bottom, x2: left, y2: bottom },
    { role: "left", x1: left, y1: bottom, x2: left, y2: top },
    { role: "mean-x", x1: meanXStart.x, y1: meanXStart.y, x2: meanXEnd.x, y2: meanXEnd.y },
    { role: "mean-y", x1: meanYStart.x, y1: meanYStart.y, x2: meanYEnd.x, y2: meanYEnd.y },
  ] as const;
  const handles = [
    { position: "top-left", x: left, y: top },
    { position: "top-center", x: mean.x, y: top },
    { position: "top-right", x: right, y: top },
    { position: "middle-left", x: left, y: mean.y },
    { position: "middle-right", x: right, y: mean.y },
    { position: "bottom-left", x: left, y: bottom },
    { position: "bottom-center", x: mean.x, y: bottom },
    { position: "bottom-right", x: right, y: bottom },
  ] as const;

  return (
    <g
      role="img"
      aria-label={label}
      data-ena-uncertainty-guide="marginal-student-t-95"
      data-ena-uncertainty-status="estimable"
      data-ena-group-role={role}
      data-ena-confidence-level="0.95"
      data-ena-estimand="arithmetic-group-mean"
      data-ena-observation-unit="endpoint-analytic-unit"
      data-ena-interval-interpretation="two-separate-marginal-confidence-intervals"
      data-ena-joint-region="false"
      data-ena-significance-test="false"
      data-ena-sample-size={x.sampleSize}
      data-ena-degrees-freedom={x.degreesFreedom}
      data-ena-t-critical={dataNumber(x.tCritical)}
      data-ena-x-standard-error={dataNumber(x.standardError)}
      data-ena-y-standard-error={dataNumber(y.standardError)}
      data-ena-x-mean={dataNumber(x.mean)}
      data-ena-y-mean={dataNumber(y.mean)}
      data-ena-x-lower={dataNumber(x.lower)}
      data-ena-x-upper={dataNumber(x.upper)}
      data-ena-y-lower={dataNumber(y.lower)}
      data-ena-y-upper={dataNumber(y.upper)}
    >
      <title>{label}</title>
      {lines.map((line) => (
        <line
          key={line.role}
          data-ena-interval-line={line.role}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke={color}
          strokeWidth="1"
          strokeDasharray={dash}
          fill="none"
          aria-hidden="true"
        />
      ))}
      {handles.map((handle) => (
        <rect
          key={handle.position}
          data-ena-interval-handle={handle.position}
          x={handle.x - handleHalf}
          y={handle.y - handleHalf}
          width={handleSize}
          height={handleSize}
          fill={color}
          aria-hidden="true"
        />
      ))}
    </g>
  );
}

function OutlierGuide({ side, role, axes, project, color }: ConfidenceGuideProps) {
  const intervals = outlierIntervals(side, axes);
  const x = intervals.x;
  const y = intervals.y;
  if (x.status !== "estimable" || y.status !== "estimable") {
    const reason = x.status === "not-estimable" ? x.reason : y.status === "not-estimable" ? y.reason : "not-estimable";
    return (
      <desc
        data-ena-outlier-status="not-estimable"
        data-ena-group-role={role}
        data-ena-outlier-reason={reason}
      >
        {`${side.name} mean-centered 1.5 × IQR display intervals are not estimable (${reason}).`}
      </desc>
    );
  }

  const corners = [
    project(x.lower, y.lower),
    project(x.lower, y.upper),
    project(x.upper, y.lower),
    project(x.upper, y.upper),
  ];
  const left = Math.min(...corners.map(({ x: screenX }) => screenX));
  const right = Math.max(...corners.map(({ x: screenX }) => screenX));
  const top = Math.min(...corners.map(({ y: screenY }) => screenY));
  const bottom = Math.max(...corners.map(({ y: screenY }) => screenY));
  const boxWidth = Math.max(0, right - left);
  const boxHeight = Math.max(0, bottom - top);
  const xDegenerate = boxWidth <= 1e-9;
  const yDegenerate = boxHeight <= 1e-9;
  const label = `${side.name}: rENA-compatible mean-centered 1.5 × IQR display intervals on each axis; not Tukey fences, automatic exclusion, a confidence interval, or a significance test.`;
  return (
    <g
      role="img"
      aria-label={label}
      data-ena-outlier-guide="rena-mean-centered-1.5-iqr"
      data-ena-outlier-status="estimable"
      data-ena-group-role={role}
      data-ena-estimand="arithmetic-group-mean"
      data-ena-observation-unit="endpoint-analytic-unit"
      data-ena-interval-interpretation="two-separate-mean-centered-outlier-display-intervals"
      data-ena-confidence-interval="false"
      data-ena-significance-test="false"
      data-ena-sample-size={x.sampleSize}
      data-ena-x-mean={dataNumber(x.mean)}
      data-ena-y-mean={dataNumber(y.mean)}
      data-ena-x-iqr={dataNumber(x.interquartileRange)}
      data-ena-y-iqr={dataNumber(y.interquartileRange)}
      data-ena-x-lower={dataNumber(x.lower)}
      data-ena-x-upper={dataNumber(x.upper)}
      data-ena-y-lower={dataNumber(y.lower)}
      data-ena-y-upper={dataNumber(y.upper)}
    >
      <title>{label}</title>
      {!xDegenerate && !yDegenerate ? (
        <rect
          x={left}
          y={top}
          width={boxWidth}
          height={boxHeight}
          fill="none"
          stroke={color}
          strokeWidth="1.25"
          strokeDasharray="5,1"
          data-ena-outlier-box="mean-centered-iqr"
          aria-hidden="true"
        />
      ) : xDegenerate && !yDegenerate ? (
        <line
          x1={left}
          y1={top}
          x2={left}
          y2={bottom}
          stroke={color}
          strokeWidth="1.25"
          strokeDasharray="5,1"
          data-ena-outlier-degenerate-axis="x"
          aria-hidden="true"
        />
      ) : !xDegenerate && yDegenerate ? (
        <line
          x1={left}
          y1={top}
          x2={right}
          y2={top}
          stroke={color}
          strokeWidth="1.25"
          strokeDasharray="5,1"
          data-ena-outlier-degenerate-axis="y"
          aria-hidden="true"
        />
      ) : (
        <circle
          cx={left}
          cy={top}
          r="2.5"
          fill="none"
          stroke={color}
          strokeWidth="1.25"
          data-ena-outlier-degenerate-axis="both"
          aria-hidden="true"
        />
      )}
      {corners.map((corner, index) => (
        <rect
          key={index}
          x={corner.x - 1.75}
          y={corner.y - 1.75}
          width="3.5"
          height="3.5"
          fill={color}
          data-ena-outlier-handle={index + 1}
          aria-hidden="true"
        />
      ))}
    </g>
  );
}

interface PlotActionToolbarProps {
  kind: PlotKind;
  zoom: number;
  onZoomChange: (next: number) => void;
  onCopy: (button: HTMLButtonElement, kind: PlotKind) => void;
  copyStatus: string;
  copy: GroupContrastUiCopy;
}

function PlotActionToolbar({
  kind,
  zoom,
  onZoomChange,
  onCopy,
  copyStatus,
  copy,
}: PlotActionToolbarProps) {
  const plotName = kind === "comparison" ? copy.comparisonPlot : kind === "primary" ? copy.primaryPlot : copy.secondaryPlot;
  return (
    <div
      className="ena-official-plot-actions"
      role="group"
      aria-label={copy.plotActionsLabel(plotName)}
      data-ena-plot-toolbar={kind}
    >
      <button
        type="button"
        data-ena-plot-action="zoom-in"
        aria-label={copy.plotActionLabel(plotName, copy.zoomIn)}
        title={copy.zoomIn}
        disabled={zoom >= 2.4}
        onClick={() => onZoomChange(boundedZoom(zoom + 0.2))}
      >
        <OpenEnaPlotActionIcon name="zoom-in" />
      </button>
      <button
        type="button"
        data-ena-plot-action="zoom-out"
        aria-label={copy.plotActionLabel(plotName, copy.zoomOut)}
        title={copy.zoomOut}
        disabled={zoom <= 0.6}
        onClick={() => onZoomChange(boundedZoom(zoom - 0.2))}
      >
        <OpenEnaPlotActionIcon name="zoom-out" />
      </button>
      <button
        type="button"
        data-ena-plot-action="recenter"
        aria-label={copy.plotActionLabel(plotName, copy.recenter)}
        title={copy.recenterTitle}
        onClick={() => onZoomChange(1)}
      >
        <OpenEnaPlotActionIcon name="recenter" />
      </button>
      <button
        type="button"
        data-ena-plot-action="copy-image"
        aria-label={copy.plotActionLabel(plotName, copy.copyImage)}
        title={copy.copyImageTitle}
        onClick={(event) => onCopy(event.currentTarget, kind)}
      >
        <OpenEnaPlotActionIcon name="copy" />
      </button>
      <span className="ena-plot-copy-status" role="status" aria-live="polite">{copyStatus}</span>
    </div>
  );
}

interface PlotPanelActionToolbarProps {
  plot: GroupRole;
  state: OpenEnaPlotPanelStatus;
  onToggleVisibility: () => void;
  onRemove: () => void;
  onSwitchPlots?: () => void;
  copy: GroupContrastUiCopy;
}

function PlotPanelActionToolbar({
  plot,
  state: panelState,
  onToggleVisibility,
  onRemove,
  onSwitchPlots,
  copy,
}: PlotPanelActionToolbarProps) {
  const plotName = plot === "primary" ? copy.primaryPlot : copy.secondaryPlot;
  const visibilityLabel = panelState === "hidden" ? copy.showPlot : copy.hidePlot;
  return (
    <div
      className="ena-official-panel-actions"
      role="group"
      aria-label={copy.panelActionsLabel(plotName)}
      data-ena-panel-toolbar={plot}
    >
      {plot === "secondary" && onSwitchPlots ? (
        <button
          type="button"
          data-ena-panel-action="switch-plots"
          aria-label={copy.switchPlots}
          title={copy.switchPlots}
          onClick={onSwitchPlots}
        >
          <OpenEnaPlotActionIcon name="switch" />
        </button>
      ) : null}
      <button
        type="button"
        data-ena-panel-action="toggle-visibility"
        aria-label={visibilityLabel}
        title={visibilityLabel}
        aria-pressed={panelState === "hidden"}
        onClick={onToggleVisibility}
      >
        <OpenEnaPlotActionIcon name={panelState === "hidden" ? "show" : "hide"} />
      </button>
      <button
        type="button"
        data-ena-panel-action="remove"
        aria-label={copy.removePlot}
        title={copy.removePlot}
        onClick={onRemove}
      >
        <OpenEnaPlotActionIcon name="remove" />
      </button>
    </div>
  );
}

function ContrastSvg({
  contrast,
  codeColors,
  kind,
  edgeThreshold,
  showPoints,
  showNetworks,
  showLabels,
  showCodeGraph = true,
  codeVisibility,
  codeSourceByRenderedCode, codeLabelByRenderedCode,
  showGroupLabels,
  showUnitLabels,
  unitCircle = false,
  showVariance,
  edgeScale,
  pointScale,
  textScale = 1,
  plotZoom,
  flipX,
  flipY,
  svgRef,
  groupDisplay,
  nodeLayout,
  onNodeMove,
  comparisonScale,
  groupMeanScale,
  networkRoles,
  sideRole,
  restorePanelForRole,
}: OpenEnaGroupContrastProps & {
  kind: PlotKind;
  comparisonScale: number;
  groupMeanScale: number;
  networkRoles?: GroupRole[];
  sideRole?: GroupRole;
  restorePanelForRole?: Partial<Record<GroupRole, { label: string; slot: GroupRole; onRestore: () => void }>>;
}) {
  const comparisonSvgRef = useRef<SVGSVGElement | null>(null);
  const [svgScreenScale, setSvgScreenScale] = useState(1);
  const bindSvgRef = useCallback((node: SVGSVGElement | null) => {
    comparisonSvgRef.current = node;
    if (kind !== "comparison" || !svgRef) return;
    if (typeof svgRef === "function") {
      const cleanup = svgRef(node);
      if (node && typeof cleanup === "function") {
        return () => {
          if (comparisonSvgRef.current === node) comparisonSvgRef.current = null;
          cleanup();
        };
      }
      return;
    }
    svgRef.current = node;
  }, [kind, svgRef]);
  useLayoutEffect(() => {
    if (kind !== "comparison") return;
    const svg = comparisonSvgRef.current;
    if (!svg) return;
    const measure = () => {
      const matrix = svg.getScreenCTM();
      if (!matrix) return;
      const next = Math.min(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d));
      if (!Number.isFinite(next) || next <= 0) return;
      setSvgScreenScale((current) => Math.abs(current - next) < 0.0001 ? current : next);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(svg);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [kind]);
  const titleId = useId();
  const descriptionId = useId();
  const viewportId = useId();
  const compact = kind !== "comparison";
  const codePresentation = {
    showCodeGraph,
    codeVisibility,
    codeSourceByRenderedCode, codeLabelByRenderedCode,
  };
  const width = compact ? MINI_WIDTH : MAIN_WIDTH;
  const height = compact ? MINI_HEIGHT : MAIN_HEIGHT;
  const viewportClipId = `ena-${kind}-${viewportId.replace(/[^a-zA-Z0-9_-]/gu, "")}-viewport`;
  const padding = compact ? MINI_PADDING : MAIN_PADDING;
  const { extent, source: extentSource } = resolveExtent(contrast);
  const officialFrame = resolveOfficialPlotFrame(contrast, extent);
  const projector = buildProjector(
    officialFrame.extremePosition,
    width,
    height,
    padding,
    flipX,
    flipY,
    compact ? -0.75 : -0.25,
    compact ? -0.5 : -1,
  );
  const project = projector.project;
  const projectEvidence = (xValue: number, yValue: number) => project(
    xValue * officialFrame.pointScaleFactor,
    yValue * officialFrame.pointScaleFactor,
  );
  const origin = project(0, 0);
  const horizontalStart = project(-officialFrame.extremePosition, 0);
  const horizontalEnd = project(officialFrame.extremePosition, 0);
  const verticalStart = project(0, officialFrame.extremePosition);
  const verticalEnd = project(0, -officialFrame.extremePosition);
  const [xAxis, yAxis] = contrast.axes;
  const nodePoints = new Map<string, ProjectedPoint>();
  const baseModelNodePoints = unitCircle
    ? officialEquiUnitCircleNodePositions(contrast.nodes)
    : new Map(contrast.nodes.flatMap((node) => (
      finiteNumber(node.x) !== null && finiteNumber(node.y) !== null
        ? [[node.code, { x: node.x, y: node.y }] as const]
        : []
    )));
  const modelNodePoints = new Map([...baseModelNodePoints].map(([code, point]) => {
    const override = nodeLayout?.get(code);
    return [code, {
      x: override?.get(xAxis) ?? point.x,
      y: override?.get(yAxis) ?? point.y,
    }] as const;
  }));
  modelNodePoints.forEach((point, code) => nodePoints.set(code, project(point.x, point.y)));
  const xAxisLabel = officialAxisLabel(xAxis);
  const yAxisLabel = officialAxisLabel(yAxis);
  const xVarianceShare = finiteOrZero(contrast.geometry.variance[xAxis]);
  const yVarianceShare = finiteOrZero(contrast.geometry.variance[yAxis]);
  const xVariance = xVarianceShare * 100;
  const yVariance = yVarianceShare * 100;
  const primaryMean = projectEvidence(
    meanCoordinate(contrast.primary, xAxis),
    meanCoordinate(contrast.primary, yAxis),
  );
  const secondaryMean = projectEvidence(
    meanCoordinate(contrast.secondary, xAxis),
    meanCoordinate(contrast.secondary, yAxis),
  );
  const threshold = bounded(edgeThreshold, 0, 1, 0);
  const comparisonGroups: Array<{
    role: GroupRole;
    side: OpenEnaPairwiseContrastSide;
    display: OpenEnaResolvedGroupDisplaySide;
  }> = [
    { role: "primary", side: contrast.primary, display: groupDisplaySide(groupDisplay, "primary", contrast.primary) },
    { role: "secondary", side: contrast.secondary, display: groupDisplaySide(groupDisplay, "secondary", contrast.secondary) },
  ];
  const roleEntry = (role: GroupRole) => role === "primary" ? comparisonGroups[0] : comparisonGroups[1];
  const activeNetworkRoles = kind === "comparison"
    ? networkRoles ?? ["primary", "secondary"]
    : [sideRole ?? (kind === "primary" ? "primary" : "secondary")];
  const plottedGroups = activeNetworkRoles.map(roleEntry);
  const signedComparison = kind === "comparison" && activeNetworkRoles.length === 2;
  const edgeDenominator = signedComparison ? comparisonScale : groupMeanScale;
  const safeDenominator = Math.max(edgeDenominator, ZERO_TOLERANCE);
  const sourcePointGroups = (kind === "comparison" ? comparisonGroups : plottedGroups).map(({ role, side, display }) => {
    const valid = validPoints(side);
    const visibleUnitIds = new Set(display.visibleUnitIds);
    const visible = display.settings.showUnitPoints
      ? valid.filter((point) => visibleUnitIds.has(point.unitId))
      : [];
    return {
      role,
      side,
      display,
      valid,
      visible,
      totalCount: groupDisplay ? display.totalUnitCount : side.points.length,
      validCount: groupDisplay ? display.validUnitCount : valid.length,
      sampled: sampledPoints(visible),
    };
  });
  // webENA's side cards isolate each mean network. Analytic-unit observations
  // and group-summary squares belong to the central Comparison figure only.
  const pointGroups = kind === "comparison" ? sourcePointGroups : [];
  const pointsTotal = sourcePointGroups.reduce((sum, entry) => sum + entry.totalCount, 0);
  const pointsValid = sourcePointGroups.reduce((sum, entry) => sum + entry.validCount, 0);
  const pointsHidden = sourcePointGroups.reduce((sum, entry) => (
    sum + Math.max(0, entry.validCount - entry.visible.length)
  ), 0);
  const pointsEligible = showPoints && kind === "comparison"
    ? pointGroups.reduce((sum, entry) => sum + entry.visible.length, 0)
    : 0;
  const pointsShown = showPoints
    ? pointGroups.reduce((sum, entry) => sum + entry.sampled.length, 0)
    : 0;
  const scaleFactor = bounded(edgeScale, 0.1, 4, 1);
  const markerScale = bounded(pointScale, 0.5, 2, 1);
  const labelScale = bounded(textScale, 8 / 12, 20 / 12, 1);
  const zoom = bounded(plotZoom, 0.6, 2.4, 1);
  const toNodeDimensions = (clientX: number, clientY: number, target: SVGGElement) => {
    const screen = clientPointInContrastSvg(target, clientX, clientY);
    if (!screen) return null;
    const unzoomed = {
      x: width / 2 + (screen.x - width / 2) / zoom,
      y: height / 2 + (screen.y - height / 2) / zoom,
    };
    const fitted = projector.invert(unzoomed);
    return new Map([[xAxis, fitted.x], [yAxis, fitted.y]]);
  };
  const activeNames = plottedGroups.map(({ side }) => side.name);
  const shownConfidenceGroups = comparisonGroups.filter(({ side, display }) => (
    display.settings.showMean
      && display.settings.showConfidenceIntervals
      && confidenceGuideIsEstimable(side, contrast.axes)
  ));
  const shownOutlierGroups = comparisonGroups.filter(({ side, display }) => (
    display.settings.showMean
      && display.settings.showOutlierIntervals
      && outlierGuideIsEstimable(side, contrast.axes)
  ));
  const title = signedComparison
    ? `Signed group-network difference, ${activeNames[0]} minus ${activeNames[1]}`
    : activeNames.length === 1
      ? `${activeNames[0]} group network`
      : "No group network selected";
  const description = signedComparison
    ? `Two-dimensional signed group comparison on ${xAxisLabel} and ${yAxisLabel}. Each connection is drawn once in the stable color of the stronger selected group; width encodes the absolute Primary-minus-Secondary difference.${shownConfidenceGroups.length ? " Dashed guides show separate marginal 95% Student-t confidence intervals for each displayed arithmetic group mean, not a joint region or significance test." : ""}${shownOutlierGroups.length ? " Short-dashed boxes show rENA-compatible mean-centered 1.5 × IQR display intervals; they are not Tukey fences, confidence intervals, automatic exclusions, or tests." : ""}`
    : `Two-dimensional selected group mean network in the fixed full-result coordinate extent and shared group-mean edge scale.`;
  const pointSamplingDescription = pointsShown < pointsEligible
    ? ` Rendering ${pointsShown} sampled unit marks from ${pointsEligible} visible analytic-unit points.`
    : "";
  const pointVisibilityDescription = kind !== "comparison"
    ? ""
    : !showPoints && pointsValid > 0
      ? " Unit point marks are hidden by the global Plot Tools setting."
      : pointsHidden > 0
        ? ` ${pointsHidden} analytic-unit mark${pointsHidden === 1 ? " is" : "s are"} hidden by group or unit display controls.`
        : "";
  const reference = contrast.resultProvenance?.projectionReference;
  const referenceId = reference ? safeFigureLabel(reference.referenceId, 30) : null;
  const referenceName = reference ? safeFigureLabel(reference.name, 72) : null;
  const sourceHash = reference?.source.normalizedUtf8TextSha256;
  const referenceToken = referenceId
    ? `ID ${referenceId}${sourceHash ? ` · declared analyzed-table SHA-256 ${sourceHash.slice(0, 12)}…` : ""}`
    : null;
  const referenceCaveat = reference
    ? "Variance shares describe current data in this fixed basis, not reference-fit explained variance."
    : null;
  const referenceDescription = referenceToken && referenceName && referenceCaveat
    ? ` Projected into fixed reference: ${referenceToken}. Reference: ${referenceName}. ${referenceCaveat}`
    : "";
  const plottedEdgeMagnitude = (edge: ContrastEdge) => signedComparison
    ? Math.abs(
      finiteOrZero(edge.signedDifference)
        * ((activeNetworkRoles[0] ?? "primary") === "primary" ? 1 : -1),
    )
    : Math.abs(edgeValue(edge, activeNetworkRoles[0] ?? "primary"));
  const visibleEdgeMagnitudes = contrast.edges
    .map(plottedEdgeMagnitude)
    .filter((magnitude) => magnitude > ZERO_TOLERANCE && magnitude / safeDenominator >= threshold);
  const minimumVisibleEdge = visibleEdgeMagnitudes.length > 0
    ? Math.min(...visibleEdgeMagnitudes)
    : 0;
  const maximumVisibleEdge = visibleEdgeMagnitudes.length > 0
    ? Math.max(...visibleEdgeMagnitudes)
    : 0;
  const connectedCodes = new Set<string>();
  if (unitCircle) {
    contrast.edges.forEach((edge) => {
      const magnitude = plottedEdgeMagnitude(edge);
      if (magnitude <= ZERO_TOLERANCE || magnitude / safeDenominator < threshold) return;
      connectedCodes.add(edge.source);
      connectedCodes.add(edge.target);
    });
  }
  const codeNodeSize = (code: string) => bounded(
    contrast.edges.reduce((strength, edge) => {
      if (edge.source !== code && edge.target !== code) return strength;
      const magnitude = plottedEdgeMagnitude(edge);
      if (magnitude <= ZERO_TOLERANCE || magnitude / safeDenominator < threshold) return strength;
      return strength + magnitude * 5 * scaleFactor;
    }, 0),
    1,
    20,
    1,
  );

  return (
    <svg
      ref={kind === "comparison" ? bindSvgRef : undefined}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-labelledby={`${titleId} ${descriptionId}`}
      className={compact ? "open-ena-set-mini-svg" : "open-ena-set-comparison-svg"}
      data-testid={kind === "comparison"
        ? "open-ena-group-comparison-plot"
        : kind === "primary"
          ? "open-ena-group-primary-plot"
          : "open-ena-group-secondary-plot"}
      data-ena-plot-kind={kind}
      data-ena-plotted-group-roles={plottedGroups.map(({ role }) => role).join(" ")}
      data-ena-axis-frame="official-symmetric-max-position"
      data-ena-node-position-mode={unitCircle ? "equiunitcircle" : "optimal"}
      data-ena-axis-x={xAxis}
      data-ena-axis-y={yAxis}
      data-ena-axis-x-variance={dataNumber(xVarianceShare)}
      data-ena-axis-y-variance={dataNumber(yVarianceShare)}
      data-ena-unit-definition={contrast.configuration.unitColumns.join("::")}
      data-ena-horizon-definition={contrast.configuration.conversationColumns.join("::")}
      data-ena-edge-scale-kind={signedComparison ? "signed-difference" : "shared-group-mean"}
      data-ena-edge-scale-max={dataNumber(edgeDenominator)}
      data-ena-signed-difference-scale-max={signedComparison ? dataNumber(comparisonScale) : undefined}
      data-ena-edge-scale-factor={dataNumber(scaleFactor)}
      data-ena-point-scale-factor={dataNumber(markerScale)}
      data-ena-official-point-position-scale={dataNumber(officialFrame.pointScaleFactor)}
      data-ena-official-max-position={dataNumber(officialFrame.maxPosition)}
      data-ena-official-extreme-position={dataNumber(officialFrame.extremePosition)}
      data-ena-extent-source={extentSource}
      data-ena-coordinate-extent={`${dataNumber(extent.minX)} ${dataNumber(extent.maxX)} ${dataNumber(extent.minY)} ${dataNumber(extent.maxY)}`}
      data-ena-points-total={pointsTotal}
      data-ena-points-valid={pointsValid}
      data-ena-points-hidden={pointsHidden}
      data-ena-points-shown={pointsShown}
      data-ena-points-dropped={pointsTotal - pointsValid}
      data-ena-plot-zoom={dataNumber(zoom)}
      style={{
        "--ena-plot-text-scale": labelScale,
      } as CSSProperties}
    >
      <title id={titleId}>{`${title}${referenceDescription}`}</title>
      <desc id={descriptionId}>{`${description}${pointVisibilityDescription}${pointSamplingDescription}${referenceDescription}`}</desc>
      <defs>
        <clipPath id={viewportClipId} clipPathUnits="userSpaceOnUse">
          <rect x={0} y={0} width={width} height={height} />
        </clipPath>
      </defs>
      <rect width={width} height={height} rx={compact ? 7 : 10} className="ena-set-plot-background" />
      <g data-ena-plot-viewport="true" clipPath={`url(#${viewportClipId})`}>
      <g
        data-ena-plot-content="true"
        data-ena-plot-zoom-layer="true"
        transform={`translate(${width / 2} ${height / 2}) scale(${zoom}) translate(${-width / 2} ${-height / 2})`}
      >
      <g className="ena-set-zero-axes" aria-hidden="true">
        <line x1={verticalStart.x} y1={verticalStart.y} x2={verticalEnd.x} y2={verticalEnd.y} />
        <line x1={horizontalStart.x} y1={horizontalStart.y} x2={horizontalEnd.x} y2={horizontalEnd.y} />
        {[verticalStart, verticalEnd, horizontalStart, horizontalEnd].map((endpoint, index) => (
          <circle
            key={`axis-endpoint:${index}`}
            className="ena-set-axis-endpoint"
            r={1.5}
            cx={endpoint.x}
            cy={endpoint.y}
            data-ena-axis-endpoint="true"
          />
        ))}
        {!compact ? (
          <>
            <text
              className="ena-set-axis-label ena-set-axis-label-x"
              x={0}
              y={Math.max(16, Math.min(height - 35, origin.y + 10))}
              textAnchor="start"
            >
              <title>{`${xAxisLabel}${showVariance ? ` · ${xVariance.toFixed(1)}%` : ""}${flipX ? " · flipped" : ""}`}</title>
              <tspan x={0}>{xAxisLabel}{flipX ? " · flipped" : ""}</tspan>
              {showVariance ? <tspan x={0} dy="15">({xVariance.toFixed(2)}%)</tspan> : null}
            </text>
            <text
              className="ena-set-axis-label ena-set-axis-label-y"
              x={Math.max(8, Math.min(width - 90, origin.x + 5))}
              y={10}
            >
              <title>{`${yAxisLabel}${showVariance ? ` · ${yVariance.toFixed(1)}%` : ""}${flipY ? " · flipped" : ""}`}</title>
              <tspan x={Math.max(8, Math.min(width - 90, origin.x + 5))}>{yAxisLabel}{flipY ? " · flipped" : ""}</tspan>
              {showVariance ? (
                <tspan x={Math.max(8, Math.min(width - 90, origin.x + 5))} dy="15">
                  ({yVariance.toFixed(2)}%)
                </tspan>
              ) : null}
            </text>
          </>
        ) : null}
      </g>
      {showNetworks && codePresentation.showCodeGraph !== false ? (
        <g className="ena-set-network-edges">
          {signedComparison ? (
            <g data-ena-network-role="signed-difference">
              {contrast.edges.map((edge) => {
                if (!openEnaRenderedEdgeIsVisible(codePresentation, edge.source, edge.target)) return null;
                const start = nodePoints.get(edge.source);
                const end = nodePoints.get(edge.target);
                if (!start || !end) return null;
                const firstRole = activeNetworkRoles[0] ?? "primary";
                const secondRole = activeNetworkRoles[1] ?? "secondary";
                const difference = finiteOrZero(edge.signedDifference) * (firstRole === "primary" ? 1 : -1);
                const magnitude = Math.abs(difference);
                const ratio = magnitude / safeDenominator;
                if (magnitude <= ZERO_TOLERANCE || ratio < threshold) return null;
                const role: GroupRole = difference > 0 ? "primary" : "secondary";
                const strongerSourceRole = difference > 0 ? firstRole : secondRole;
                const sign = difference > 0 ? "positive" : "negative";
                const strongerSide = strongerSourceRole === "primary" ? contrast.primary : contrast.secondary;
                const strongerName = strongerSide.name;
                const stroke = groupColor(contrast, strongerSide, strongerSourceRole);
                const edgeLabel = `${openEnaRenderedCodeLabel(codePresentation, edge.source)} ↔ ${openEnaRenderedCodeLabel(codePresentation, edge.target)}: signed Primary-minus-Secondary difference ${formatNumber(difference, true)}; ${strongerName} ${role} group is stronger`;
                return (
                  <line
                    key={edge.name}
                    x1={start.x}
                    y1={start.y}
                    x2={end.x}
                    y2={end.y}
                    stroke={stroke}
                    strokeWidth={magnitude * 7.5 * scaleFactor}
                    strokeOpacity={officialEdgeOpacity(magnitude, minimumVisibleEdge, maximumVisibleEdge)}
                    strokeLinecap="round"
                    data-ena-edge={edge.name}
                    data-ena-sign={sign}
                    data-ena-network-role={role}
                    data-ena-signed-difference={dataNumber(difference)}
                    aria-label={edgeLabel}
                  >
                    <title>{edgeLabel}</title>
                  </line>
                );
              })}
            </g>
          ) : plottedGroups.map(({ role, side }, displayedIndex) => (
            <g key={role} data-ena-network-role={role}>
              {contrast.edges.map((edge) => {
                if (!openEnaRenderedEdgeIsVisible(codePresentation, edge.source, edge.target)) return null;
                const start = nodePoints.get(edge.source);
                const end = nodePoints.get(edge.target);
                if (!start || !end) return null;
                const value = edgeValue(edge, role);
                const magnitude = Math.abs(value);
                const ratio = magnitude / safeDenominator;
                if (magnitude <= ZERO_TOLERANCE || ratio < threshold) return null;
                const stroke = groupColor(contrast, side, role);
                const edgeLabel = `${openEnaRenderedCodeLabel(codePresentation, edge.source)} ↔ ${openEnaRenderedCodeLabel(codePresentation, edge.target)}: ${side.name} ${role} group mean weight ${formatNumber(value)}`;
                return (
                  <line
                    key={`${role}:${edge.name}`}
                    x1={start.x}
                    y1={start.y}
                    x2={end.x}
                    y2={end.y}
                    stroke={stroke}
                    strokeWidth={magnitude * 7.5 * scaleFactor}
                    strokeOpacity={officialEdgeOpacity(magnitude, minimumVisibleEdge, maximumVisibleEdge)}
                    strokeLinecap="round"
                    data-ena-edge={edge.name}
                    data-ena-sign={displayedIndex === 0 ? "primary" : "secondary"}
                    data-ena-network-role={displayedIndex === 0 ? "primary" : "secondary"}
                    aria-label={edgeLabel}
                  >
                    <title>{edgeLabel}</title>
                  </line>
                );
              })}
            </g>
          ))}
        </g>
      ) : null}
      {kind === "comparison" ? comparisonGroups.map(({ role, side, display }) => (
        display.settings.showMean && display.settings.showConfidenceIntervals ? (
          <ConfidenceGuide
            key={`confidence:${side.name}`}
            side={side}
            role={role}
            axes={contrast.axes}
            project={projectEvidence}
            color={groupColor(contrast, side, role)}
          />
        ) : null
      )) : null}
      {kind === "comparison" ? comparisonGroups.map(({ role, side, display }) => (
        display.settings.showMean && display.settings.showOutlierIntervals ? (
          <OutlierGuide
            key={`outlier:${side.name}`}
            side={side}
            role={role}
            axes={contrast.axes}
            project={projectEvidence}
            color={groupColor(contrast, side, role)}
          />
        ) : null
      )) : null}
      {showPoints && kind === "comparison" ? (
        <g className="ena-set-unit-points" data-ena-point-layer="standard">
          {pointGroups.map(({ role, side, sampled }) => (
            <g
              key={role}
              data-ena-group-role={role}
            >
              {sampled.map(({ point, sourceIndex }, sampleIndex) => {
                const projected = projectEvidence(point.x, point.y);
                const markerRadius = 3.85 * markerScale;
                const sourceLabel = showUnitLabels ? safeUnitLabel(point.unitId) : null;
                const accessibleLabel = sourceLabel
                  ? `${side.name} unit ${sourceLabel}`
                  : `${role === "primary" ? "Primary" : "Secondary"} unit point ${sourceIndex + 1}`;
                const pointKey = `${role}:${sampleIndex}`;
                return (
                  <g
                    key={pointKey}
                    transform={`translate(${projected.x} ${projected.y})`}
                    role="img"
                    aria-label={accessibleLabel}
                    data-ena-unit-point="true"
                    data-ena-group-role={role}
                    data-ena-point-shape="circle"
                    data-ena-marker-size={dataNumber(markerRadius)}
                    data-ena-point-key={pointKey}
                  >
                    <title>{accessibleLabel}</title>
                    <circle
                      r={markerRadius}
                      fill={groupColor(contrast, side, role)}
                    />
                    {sourceLabel ? (
                      <text
                        x={role === "primary" ? 6 : -6}
                        y={role === "primary" ? -6 : 10}
                        textAnchor={role === "primary" ? "start" : "end"}
                        className="ena-set-unit-label"
                      >
                        {sourceLabel}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </g>
          ))}
        </g>
      ) : null}
      <g className="ena-set-network-nodes">
        {contrast.nodes
          .filter((node: ContrastNode) => openEnaRenderedCodeIsVisible(codePresentation, node.code))
          .map((node: ContrastNode) => {
          if (unitCircle && !connectedCodes.has(node.code)) return null;
          const point = nodePoints.get(node.code);
          if (!point) return null;
          const codeLabel = safeFigureLabel(openEnaRenderedCodeLabel(codePresentation, node.code), 72) || "Unnamed code";
          const nodeSize = codeNodeSize(node.code);
          const nodeColor = codeColorFor(codeColors, node.code);
          return (
            <g
              key={node.code}
              transform={`translate(${point.x} ${point.y})`}
              role="img"
              aria-label={`${codeLabel} code node`}
            >
              <OpenEnaSvgDraggableNode
                code={node.code}
                radius={nodeSize}
                disabled={!onNodeMove}
                toDimensions={toNodeDimensions}
                onNodeMove={onNodeMove ?? (() => {})}
              >
                <title>{`${codeLabel} code node`}</title>
                <circle
                  r={nodeSize}
                  className="ena-set-result-node"
                  data-ena-code-node="neutral"
                  data-ena-code-node-size={dataNumber(nodeSize)}
                  data-ena-code={node.code}
                  fill={nodeColor}
                  stroke={nodeColor}
                  style={{ fill: nodeColor, stroke: nodeColor }}
                />
                {showLabels ? (
                  <text x={nodeSize + 3} y="3" textAnchor="start" className="ena-set-result-label">
                    {codeLabel}
                  </text>
                ) : null}
              </OpenEnaSvgDraggableNode>
            </g>
          );
        })}
      </g>
      {kind === "comparison" ? comparisonGroups.map(({ role, side, display }) => {
        if (!display.settings.showMean) return null;
        const restore = kind === "comparison" ? restorePanelForRole?.[role] : undefined;
        return (
          <GroupMeanMarker
            key={`mean:${role}`}
            point={role === "primary" ? primaryMean : secondaryMean}
            compact={compact}
            groupName={side.name}
            role={role}
            color={groupColor(contrast, side, role)}
            showLabel={showGroupLabels}
            restoreLabel={restore?.label}
            restoreSlot={restore?.slot}
            restoreHitTargetScale={RESTORE_HIT_TARGET_CSS_SIZE / (RESTORE_HIT_TARGET_SVG_SIZE * zoom * svgScreenScale)}
            onRestore={restore?.onRestore}
          />
        );
      }) : null}
      </g>
      </g>
      {kind === "comparison" && referenceToken && referenceName && referenceCaveat ? (
        <g className="ena-reference-figure-provenance" role="note" aria-label={referenceDescription.trim()}>
          <rect x="18" y="514" width="884" height="64" rx="8" fill="#f1f7f6" stroke="#c7dbd7" />
          <text x="30" y="532" fill="#334b52" fontSize="11.5" fontWeight="700">{referenceToken}</text>
          <text x="30" y="551" fill="#334b52" fontSize="11.5" fontWeight="700">Reference: {referenceName}</text>
          <text x="30" y="570" fill="#334b52" fontSize="11.5" fontWeight="700">{referenceCaveat}</text>
        </g>
      ) : null}
    </svg>
  );
}

export default function OpenEnaGroupContrast(props: OpenEnaGroupContrastProps) {
  const {
    contrast,
    edgeThreshold,
    showNetworks,
    showVariance,
    centerMode = "plot",
    dataView,
    rightTools,
    onSwitchPlots,
  } = props;
  const uiCopy = props.uiCopy ?? DEFAULT_GROUP_CONTRAST_UI_COPY;
  const initialZoom = boundedZoom(props.plotZoom);
  const [panelZooms, setPanelZooms] = useState<PlotZoomState>({
    comparison: initialZoom,
    primary: initialZoom,
    secondary: initialZoom,
  });
  const [copyStatus, setCopyStatus] = useState<Record<PlotKind, PlotCopyStatus>>({
    comparison: "idle",
    primary: "idle",
    secondary: "idle",
  });
  const [panelStates, setPanelStates] = useState<OpenEnaPlotPanelState>(OPEN_ENA_INITIAL_PLOT_PANEL_STATE);
  const [panelRoles, setPanelRoles] = useState<OpenEnaPanelRoles>({
    primary: "primary",
    secondary: "secondary",
  });
  const panelPairKey = [contrast.primary.name, contrast.secondary.name].toSorted().join("\u001f");
  const previousPanelPairKey = useRef(panelPairKey);

  useEffect(() => {
    if (previousPanelPairKey.current === panelPairKey) return;
    previousPanelPairKey.current = panelPairKey;
    setPanelStates(OPEN_ENA_INITIAL_PLOT_PANEL_STATE);
    setPanelRoles({ primary: "primary", secondary: "secondary" });
  }, [panelPairKey]);

  useEffect(() => {
    const next = boundedZoom(props.plotZoom);
    setPanelZooms({ comparison: next, primary: next, secondary: next });
  }, [props.plotResetRevision, props.plotZoom]);

  const focusAfterRender = (selector: string) => {
    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(selector);
      target?.focus();
    });
  };

  const togglePanelVisibility = (plot: GroupRole) => {
    setPanelStates((current) => reduceOpenEnaPlotPanelState(current, {
      type: "toggle-visibility",
      plot,
    }));
  };

  const removePanel = (plot: GroupRole) => {
    if (plot === "primary" && panelRoles.secondary && panelStates.secondary !== "removed") {
      setPanelRoles({ primary: panelRoles.secondary, secondary: null });
      setPanelStates({
        primary: panelStates.secondary === "hidden" ? "hidden" : "visible",
        secondary: "removed",
      });
      focusAfterRender('[data-ena-restore-slot="secondary"]');
      return;
    }
    setPanelRoles((current) => ({ ...current, [plot]: null }));
    setPanelStates((current) => reduceOpenEnaPlotPanelState(current, { type: "remove", plot }));
    focusAfterRender(`[data-ena-restore-slot="${plot}"]`);
  };

  const restorePrimaryPlotLabel = panelStates.primary === "removed" ? uiCopy.restorePlot(uiCopy.primaryPlot) : null;
  const restorePrimaryPlot = (role: GroupRole) => {
    const action: OpenEnaPlotPanelAction = { type: "restore", plot: "primary" };
    setPanelRoles((current) => ({ ...current, primary: role }));
    setPanelStates((current) => reduceOpenEnaPlotPanelState(current, action));
    focusAfterRender('[data-ena-panel-role="primary"]');
  };
  const restoreSecondaryPlotLabel = panelStates.secondary === "removed" ? uiCopy.restorePlot(uiCopy.secondaryPlot) : null;
  const restoreSecondaryPlot = (role: GroupRole) => {
    const action: OpenEnaPlotPanelAction = { type: "restore", plot: "secondary" };
    setPanelRoles((current) => ({ ...current, secondary: role }));
    setPanelStates((current) => reduceOpenEnaPlotPanelState(current, action));
    focusAfterRender('[data-ena-panel-role="secondary"]');
  };

  const restorePanelForRole: Partial<Record<GroupRole, { label: string; slot: GroupRole; onRestore: () => void }>> = {};
  for (const role of ["primary", "secondary"] as const) {
    if (restorePrimaryPlotLabel) {
      restorePanelForRole[role] = {
        label: restorePrimaryPlotLabel,
        slot: "primary",
        onRestore: () => restorePrimaryPlot(role),
      };
    } else if (restoreSecondaryPlotLabel && panelRoles.primary !== role) {
      restorePanelForRole[role] = {
        label: restoreSecondaryPlotLabel,
        slot: "secondary",
        onRestore: () => restoreSecondaryPlot(role),
      };
    }
  }

  const handleSwitchPlots = () => {
    // Remove/restore can temporarily place the contrast's secondary group in
    // the Primary card (and vice versa). The Workspace owns the authoritative
    // ordered pair, so normalize the local card-role mapping before asking it
    // to swap that pair. Otherwise a second local reversal leaves the figure
    // caption out of sync with Stats and the exported comparison direction.
    setPanelRoles({ primary: "primary", secondary: "secondary" });
    onSwitchPlots?.();
    focusAfterRender('[data-ena-panel-action="switch-plots"]');
  };

  const updatePanelZoom = (kind: PlotKind, next: number) => {
    setPanelZooms((current) => ({ ...current, [kind]: boundedZoom(next) }));
  };
  const handleCopy = (button: HTMLButtonElement, kind: PlotKind) => {
    if (!props.onConfirmIdentityBearingExport) {
      setCopyStatus((current) => ({ ...current, [kind]: "unavailable" }));
      return;
    }
    let confirmed = false;
    try {
      confirmed = props.onConfirmIdentityBearingExport();
    } catch {
      setCopyStatus((current) => ({ ...current, [kind]: "unavailable" }));
      return;
    }
    if (!confirmed) {
      setCopyStatus((current) => ({ ...current, [kind]: "cancelled" }));
      return;
    }
    setCopyStatus((current) => ({ ...current, [kind]: "copying" }));
    void copyPlotImage(button).then(
      (format) => setCopyStatus((current) => ({
        ...current,
        [kind]: format === "image" ? "image-copied" : "svg-copied",
      })),
      () => setCopyStatus((current) => ({ ...current, [kind]: "unavailable" })),
    );
  };
  const comparisonScale = Math.max(0, finiteOrZero(contrast.edgeScaleDenominators.difference));
  const groupMeanScale = Math.max(0, finiteOrZero(contrast.edgeScaleDenominators.sharedMean));
  const [xAxis, yAxis] = contrast.axes;
  const xVariance = finiteOrZero(contrast.geometry.variance[xAxis]) * 100;
  const yVariance = finiteOrZero(contrast.geometry.variance[yAxis]) * 100;
  const xAxisLabel = officialAxisLabel(xAxis);
  const yAxisLabel = officialAxisLabel(yAxis);
  const sharedMeanPlotMeta = [
    uiCopy.sharedScale(formatNumber(groupMeanScale)),
    uiCopy.scaledMultiplier(formatMultiplier(props.edgeScale)),
    ...(showVariance ? [`${xAxisLabel} ${xVariance.toFixed(1)}%`, `${yAxisLabel} ${yVariance.toFixed(1)}%`] : []),
  ].join(" · ");
  const comparisonPlotMeta = [
    uiCopy.differenceScale(formatNumber(comparisonScale)),
    uiCopy.scaledMultiplier(formatMultiplier(props.edgeScale)),
    ...(showVariance ? [`${xAxisLabel} ${xVariance.toFixed(1)}%`, `${yAxisLabel} ${yVariance.toFixed(1)}%`] : []),
  ].join(" · ");
  const threshold = bounded(edgeThreshold, 0, 1, 0);
  const denominator = Math.max(comparisonScale, ZERO_TOLERANCE);
  const strongestDifferences = (showNetworks && props.showCodeGraph !== false ? contrast.edges : [])
    .filter((edge) => openEnaRenderedEdgeIsVisible(props, edge.source, edge.target))
    .filter((edge) => Math.abs(finiteOrZero(edge.signedDifference)) > ZERO_TOLERANCE)
    .filter((edge) => Math.abs(finiteOrZero(edge.signedDifference)) / denominator >= threshold)
    .toSorted((left, right) => (
      Math.abs(finiteOrZero(right.signedDifference)) - Math.abs(finiteOrZero(left.signedDifference))
    ))
    .slice(0, 10);
  const sideForRole = (role: GroupRole | null) => role === "primary"
    ? contrast.primary
    : role === "secondary"
      ? contrast.secondary
      : null;
  const activeNetworkRoles = ([
    panelStates.primary !== "removed" ? panelRoles.primary : null,
    panelStates.secondary !== "removed" ? panelRoles.secondary : null,
  ].filter((role): role is GroupRole => Boolean(role)));
  const primaryPanelSide = sideForRole(panelRoles.primary);
  const secondaryPanelSide = sideForRole(panelRoles.secondary);
  const sidePlotCount = Number(panelStates.primary !== "removed") + Number(panelStates.secondary !== "removed");
  const comparisonNames = activeNetworkRoles.map((role) => sideForRole(role)?.name).filter(Boolean) as string[];
  const comparisonAccessibleLabel = uiCopy.comparisonScaledDescription(comparisonNames, formatOfficialMultiplier(props.edgeScale));
  const primaryGroupDisplay = groupDisplaySide(props.groupDisplay, "primary", contrast.primary);
  const secondaryGroupDisplay = groupDisplaySide(props.groupDisplay, "secondary", contrast.secondary);
  const displaySides = [
    { side: contrast.primary, display: primaryGroupDisplay },
    { side: contrast.secondary, display: secondaryGroupDisplay },
  ];
  const confidenceGuideNames = displaySides.filter(({ side, display }) => (
    display.settings.showMean
      && display.settings.showConfidenceIntervals
      && confidenceGuideIsEstimable(side, contrast.axes)
  )).map(({ side }) => side.name);
  const outlierGuideNames = displaySides.filter(({ side, display }) => (
    display.settings.showMean
      && display.settings.showOutlierIntervals
      && outlierGuideIsEstimable(side, contrast.axes)
  )).map(({ side }) => side.name);
  const anyConfidenceGuideShown = confidenceGuideNames.length > 0;
  const anyOutlierGuideShown = outlierGuideNames.length > 0;

  return (
    <section
      className="open-ena-set-comparison open-ena-group-contrast"
      data-testid="open-ena-group-contrast"
      data-ena-dimensions="2"
      data-ena-difference-edge-scale-max={dataNumber(comparisonScale)}
      data-ena-shared-mean-edge-scale-max={dataNumber(groupMeanScale)}
      data-ena-difference-edge-scale-definition={contrast.edgeScaleDenominators.differenceDefinition}
      data-ena-shared-mean-edge-scale-definition={contrast.edgeScaleDenominators.sharedMeanDefinition}
      data-ena-center-mode={centerMode}
      aria-label={uiCopy.comparisonAria}
    >
      <div className="ena-set-comparison-layout">
        <div
          data-testid="open-ena-group-center-surface"
          data-ena-center-mode={centerMode}
          data-ena-workbench-region="center"
          style={{ minWidth: 0 }}
        >
          {centerMode === "data" ? (
            <section
              className="ena-set-main-plot"
              data-testid="open-ena-group-data-view"
              role="region"
              aria-label={uiCopy.dataView}
            >
              <header className="ena-set-plot-heading">
                <div>
                  <h3>{uiCopy.dataView}</h3>
                  <p>{uiCopy.dataViewComparisonRecords(contrast.primary.name, contrast.secondary.name)}</p>
                </div>
                <span>{xAxis} × {yAxis}</span>
              </header>
              {dataView ?? (
                <p className="ena-sets-compatibility-note" role="status">
                  {uiCopy.dataViewUnavailable}
                </p>
              )}
            </section>
          ) : (
            <figure className="ena-set-main-plot" tabIndex={0} aria-label={uiCopy.comparisonAria}>
              <header className="ena-set-plot-heading ena-group-contrast-plot-heading">
                <div>
                  <h3>{uiCopy.comparisonPlot}</h3>
                  <p
                    className="ena-set-series-caption"
                    aria-label={comparisonAccessibleLabel}
                  >
                    {activeNetworkRoles.map((role, index) => {
                      const side = sideForRole(role)!;
                      return [
                        index > 0 ? <span key={`separator:${role}`} aria-hidden="true"> − </span> : null,
                        <span
                          key={`series:${role}`}
                          className={index === 0 ? "ena-set-series-primary" : "ena-set-series-secondary"}
                          data-ena-series-color={groupColor(contrast, side, role)}
                          style={{ color: groupCaptionColor(contrast, side, role) }}
                        >
                          {side.name}
                        </span>,
                      ];
                    })}
                    <span className="ena-set-scale-caption"> {uiCopy.scaledCaption(formatOfficialMultiplier(props.edgeScale))}</span>
                    <span className="sr-only"> · {activeNetworkRoles.length === 2 ? uiCopy.signedEdgeDifferences : uiCopy.groupMeanNetwork}</span>
                  </p>
                </div>
                <div className="ena-set-plot-heading-tools">
                  <span>{comparisonPlotMeta}</span>
                  <PlotActionToolbar
                    kind="comparison"
                    zoom={panelZooms.comparison}
                    onZoomChange={(next) => updatePanelZoom("comparison", next)}
                    onCopy={handleCopy}
                    copyStatus={plotCopyStatusLabel(copyStatus.comparison, uiCopy)}
                    copy={uiCopy}
                  />
                </div>
              </header>
              <ContrastSvg
                {...props}
                plotZoom={panelZooms.comparison}
                kind="comparison"
                comparisonScale={comparisonScale}
                groupMeanScale={groupMeanScale}
                networkRoles={activeNetworkRoles}
                restorePanelForRole={restorePanelForRole}
              />
              {activeNetworkRoles.length === 2 && comparisonScale <= ZERO_TOLERANCE ? (
                <p
                  className="ena-sets-compatibility-note"
                  role="status"
                  data-testid="open-ena-group-no-nonzero-differences"
                >
                  {uiCopy.noNonzeroDifferences}
                </p>
              ) : null}
              <figcaption>
                <span className="sr-only ena-set-method-boundary">
                  {uiCopy.methodBoundary}
                  {anyConfidenceGuideShown ? ` ${uiCopy.confidenceMethodBoundary}` : ""}
                  {anyOutlierGuideShown ? ` ${uiCopy.outlierMethodBoundary}` : ""}
                </span>
                <span className="ena-set-plot-definitions">
                  <span><strong>{uiCopy.unitsDefinition}:</strong> {contrast.configuration.unitColumns.join(" › ")}</span>
                  <span><strong>{uiCopy.horizonDefinition}:</strong> {contrast.configuration.conversationColumns.join(" › ")}</span>
                </span>
              </figcaption>
            </figure>
          )}
        </div>

        <div
          className="ena-set-side-plots"
          data-ena-workbench-region="right-stack"
          data-ena-side-plot-count={sidePlotCount}
        >
          {panelStates.primary !== "removed" && primaryPanelSide && panelRoles.primary ? (
            <figure
              tabIndex={0}
              aria-label={uiCopy.primaryPlotAria}
              data-ena-panel-role="primary"
              data-ena-panel-state={panelStates.primary}
            >
              <header className="ena-set-plot-heading ena-group-contrast-plot-heading">
                <div>
                  <h3>{uiCopy.primaryPlot}</h3>
                  <p
                    className="ena-set-series-caption"
                    aria-label={uiCopy.sideScaledDescription(primaryPanelSide.name, formatOfficialMultiplier(props.edgeScale))}
                  >
                    <span
                      className="ena-set-series-primary"
                      data-ena-series-color={groupColor(contrast, primaryPanelSide, panelRoles.primary)}
                      style={{ color: groupCaptionColor(contrast, primaryPanelSide, panelRoles.primary) }}
                    >
                      {primaryPanelSide.name}
                    </span>
                    <span className="ena-set-scale-caption"> {uiCopy.scaledCaption(formatOfficialMultiplier(props.edgeScale))}</span>
                    <span className="sr-only">{primaryPanelSide.name} · {uiCopy.analyticUnits(primaryPanelSide.unitCount)}</span>
                  </p>
                </div>
                <div className="ena-set-plot-heading-tools">
                  <PlotPanelActionToolbar
                    plot="primary"
                    state={panelStates.primary}
                    onToggleVisibility={() => togglePanelVisibility("primary")}
                    onRemove={() => removePanel("primary")}
                    copy={uiCopy}
                  />
                  <span>{sharedMeanPlotMeta}</span>
                  <PlotActionToolbar
                    kind="primary"
                    zoom={panelZooms.primary}
                    onZoomChange={(next) => updatePanelZoom("primary", next)}
                    onCopy={handleCopy}
                    copyStatus={plotCopyStatusLabel(copyStatus.primary, uiCopy)}
                    copy={uiCopy}
                  />
                </div>
              </header>
              <ContrastSvg
                {...props}
                plotZoom={panelZooms.primary}
                kind="primary"
                sideRole={panelRoles.primary}
                comparisonScale={comparisonScale}
                groupMeanScale={groupMeanScale}
              />
            </figure>
          ) : (
            <section className="ena-empty-side-plot" data-ena-panel-role="primary" data-ena-panel-state="removed" aria-label={uiCopy.primaryEmptyAria}>
              <header className="ena-set-plot-heading ena-group-contrast-plot-heading"><h3>{uiCopy.primaryPlot}</h3></header>
              <div className="ena-empty-side-plot-prompt"><OpenEnaPlotActionIcon name="restore" /><p>{uiCopy.emptyGroupPrompt}</p></div>
            </section>
          )}
          {panelStates.secondary !== "removed" && secondaryPanelSide && panelRoles.secondary ? (
            <figure
              tabIndex={0}
              aria-label={uiCopy.secondaryPlotAria}
              data-ena-panel-role="secondary"
              data-ena-panel-state={panelStates.secondary}
            >
              <header className="ena-set-plot-heading ena-group-contrast-plot-heading">
                <div>
                  <h3>{uiCopy.secondaryPlot}</h3>
                  <p
                    className="ena-set-series-caption"
                    aria-label={uiCopy.sideScaledDescription(secondaryPanelSide.name, formatOfficialMultiplier(props.edgeScale))}
                  >
                    <span
                      className="ena-set-series-secondary"
                      data-ena-series-color={groupColor(contrast, secondaryPanelSide, panelRoles.secondary)}
                      style={{ color: groupCaptionColor(contrast, secondaryPanelSide, panelRoles.secondary) }}
                    >
                      {secondaryPanelSide.name}
                    </span>
                    <span className="ena-set-scale-caption"> {uiCopy.scaledCaption(formatOfficialMultiplier(props.edgeScale))}</span>
                    <span className="sr-only">{secondaryPanelSide.name} · {uiCopy.analyticUnits(secondaryPanelSide.unitCount)}</span>
                  </p>
                </div>
                <div className="ena-set-plot-heading-tools">
                  <PlotPanelActionToolbar
                    plot="secondary"
                    state={panelStates.secondary}
                    onSwitchPlots={onSwitchPlots ? handleSwitchPlots : undefined}
                    onToggleVisibility={() => togglePanelVisibility("secondary")}
                    onRemove={() => removePanel("secondary")}
                    copy={uiCopy}
                  />
                  <span>{sharedMeanPlotMeta}</span>
                  <PlotActionToolbar
                    kind="secondary"
                    zoom={panelZooms.secondary}
                    onZoomChange={(next) => updatePanelZoom("secondary", next)}
                    onCopy={handleCopy}
                    copyStatus={plotCopyStatusLabel(copyStatus.secondary, uiCopy)}
                    copy={uiCopy}
                  />
                </div>
              </header>
              <ContrastSvg
                {...props}
                plotZoom={panelZooms.secondary}
                kind="secondary"
                sideRole={panelRoles.secondary}
                comparisonScale={comparisonScale}
                groupMeanScale={groupMeanScale}
              />
            </figure>
          ) : (
            <section className="ena-empty-side-plot" data-ena-panel-role="secondary" data-ena-panel-state="removed" aria-label={uiCopy.secondaryEmptyAria}>
              <header className="ena-set-plot-heading ena-group-contrast-plot-heading"><h3>{uiCopy.secondaryPlot}</h3></header>
              <div className="ena-empty-side-plot-prompt"><OpenEnaPlotActionIcon name="restore" /><p>{uiCopy.emptyGroupPrompt}</p></div>
            </section>
          )}
          {rightTools ? (
            <section
              className="ena-set-right-tools"
              data-testid="open-ena-group-right-tools"
              role="region"
              aria-label={uiCopy.toolsTitle}
            >
              {rightTools}
            </section>
          ) : null}
        </div>
      </div>

      <ol
        className="ena-set-signed-legend"
        aria-label={uiCopy.selectedGroupOrder}
        data-ena-legend-order="primary-secondary"
        style={{ listStyle: "none", margin: 0, paddingInlineStart: 4 }}
      >
        {primaryGroupDisplay.settings.showMean ? (
        <li data-ena-group-role="primary" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <i
            className="ena-set-key-primary-mean"
            aria-hidden="true"
            style={{ background: groupColor(contrast, contrast.primary, "primary"), borderColor: "#263740" }}
          />
          <span><strong>Square summary</strong> · Primary: {contrast.primary.name}</span>
        </li>
        ) : null}
        {secondaryGroupDisplay.settings.showMean ? (
        <li data-ena-group-role="secondary" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <i
            className="ena-set-key-secondary-mean"
            aria-hidden="true"
            style={{ background: groupColor(contrast, contrast.secondary, "secondary"), borderColor: "#263740" }}
          />
          <span><strong>Square summary</strong> · Secondary: {contrast.secondary.name}</span>
        </li>
        ) : null}
        <li data-ena-sign="positive" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <i
            className="ena-set-key-positive"
            aria-hidden="true"
            style={{ borderTopColor: groupColor(contrast, contrast.primary, "primary") }}
          />
          <span>Solid {contrast.primary.name} color: Primary is stronger (+)</span>
        </li>
        <li data-ena-sign="negative" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <i
            className="ena-set-key-negative"
            aria-hidden="true"
            style={{ borderTopColor: groupColor(contrast, contrast.secondary, "secondary") }}
          />
          <span>Solid {contrast.secondary.name} color: Secondary is stronger (−)</span>
        </li>
        <li data-ena-sign="equal" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <i className="ena-set-key-equal" aria-hidden="true" />
          <span>Equal mean weight: no difference line drawn</span>
        </li>
        {anyConfidenceGuideShown ? (
        <li data-ena-interval-legend="marginal-student-t-95" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <i
            className="ena-set-key-confidence"
            aria-hidden="true"
            style={{ borderColor: groupColor(contrast, contrast.primary, "primary") }}
          />
          <span>Dashed guides: separate marginal 95% Student-t intervals for {confidenceGuideNames.join(" and ")}; not a joint region or test</span>
        </li>
        ) : null}
        {anyOutlierGuideShown ? (
        <li data-ena-interval-legend="rena-mean-centered-1.5-iqr" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <i
            className="ena-set-key-outlier"
            aria-hidden="true"
          />
          <span>Short-dashed guides: rENA-compatible mean-centered 1.5 × IQR display intervals for {outlierGuideNames.join(" and ")}; not automatic exclusion or a test</span>
        </li>
        ) : null}
      </ol>

      <p className="ena-set-reference-id" style={{ maxWidth: "100%", textAlign: "start", paddingBlock: 4 }}>
        Comparison denominator: {contrast.edgeScaleDenominators.differenceDefinition} ({formatNumber(comparisonScale)}).
        {" "}Side-panel denominator: {contrast.edgeScaleDenominators.sharedMeanDefinition} ({formatNumber(groupMeanScale)}).
      </p>

      <div className="ena-set-difference-table" role="region" aria-label="Strongest signed edge differences" tabIndex={0}>
        <p>
          Threshold uses {(threshold * 100).toFixed(0)}% of the comparison signed-difference scale ({formatNumber(comparisonScale)}).
          Signed difference is Primary minus Secondary: positive values are {contrast.primary.name} minus {contrast.secondary.name}.
          This descriptive comparison does not imply significance.
        </p>
        <table>
          <caption>Strongest signed edge differences</caption>
          <thead>
            <tr>
              <th scope="col">Connection</th>
              <th scope="col">Primary weight</th>
              <th scope="col">Secondary weight</th>
              <th scope="col">Signed difference</th>
              <th scope="col">Stronger group</th>
            </tr>
          </thead>
          <tbody>
            {strongestDifferences.length ? strongestDifferences.map((edge) => (
              <tr key={edge.name}>
                <th scope="row">{props.codeLabelByRenderedCode ? `${openEnaRenderedCodeLabel(props, edge.source)} ↔ ${openEnaRenderedCodeLabel(props, edge.target)}` : edge.name}</th>
                <td>{formatNumber(edge.primaryWeight)}</td>
                <td>{formatNumber(edge.secondaryWeight)}</td>
                <td data-ena-sign={differenceSign(edge)}>{formatNumber(edge.signedDifference, true)}</td>
                <td>{edge.stronger === "primary" ? contrast.primary.name : edge.stronger === "secondary" ? contrast.secondary.name : "Equal"}</td>
              </tr>
            )) : (
              <tr><td colSpan={5}>No signed edge differences meet the current network threshold.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
