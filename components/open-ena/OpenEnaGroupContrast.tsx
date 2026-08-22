import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";
import type {
  OpenEnaPairwiseContrast,
  OpenEnaPairwiseContrastSide,
} from "@/lib/open-ena/contrasts";
import { codeColorFor, type OpenEnaCodeColors } from "@/lib/open-ena/plot-style";
import {
  marginalMeanIntervalPair,
  type OpenEnaMarginalMeanIntervalPair,
} from "@/lib/open-ena/uncertainty";
import OpenEnaPlotActionIcon from "./OpenEnaPlotActionIcon";

export interface OpenEnaGroupContrastProps {
  contrast: OpenEnaPairwiseContrast;
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
}

type ContrastEdge = OpenEnaPairwiseContrast["edges"][number];
type ContrastNode = OpenEnaPairwiseContrast["nodes"][number];
type CoordinateExtent = OpenEnaPairwiseContrast["coordinateExtent"];
type PlotKind = "comparison" | "primary" | "secondary";
type GroupRole = "primary" | "secondary";
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

function derivedExtent(contrast: OpenEnaPairwiseContrast): CoordinateExtent {
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

function resolveExtent(contrast: OpenEnaPairwiseContrast) {
  const runtimeExtent = contrast.coordinateExtent;
  return validExtent(runtimeExtent)
    ? { extent: runtimeExtent, source: "full-result" as const }
    : { extent: derivedExtent(contrast), source: "derived-selected-points-and-nodes" as const };
}

function resolveOfficialPlotFrame(
  contrast: OpenEnaPairwiseContrast,
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

  return (xValue: unknown, yValue: unknown): ProjectedPoint => {
    const x = finiteNumber(xValue) ?? 0;
    const y = finiteNumber(yValue) ?? 0;
    return {
      x: width / 2 + centerOffsetX + x * scale * (flipX ? -1 : 1),
      y: height / 2 + centerOffsetY - y * scale * (flipY ? -1 : 1),
    };
  };
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
  contrast: OpenEnaPairwiseContrast,
  side: OpenEnaPairwiseContrastSide,
  role: GroupRole,
) {
  const declaredIndex = contrast.declaredGroups?.findIndex((group) => group.name === side.name) ?? -1;
  return (declaredIndex >= 0 ? WEB_ENA_GROUP_COLORS[declaredIndex % WEB_ENA_GROUP_COLORS.length] : undefined)
    ?? side.color
    ?? (role === "primary" ? PRIMARY_COLOR : SECONDARY_COLOR);
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

interface GroupMeanMarkerProps {
  point: ProjectedPoint;
  compact: boolean;
  groupName: string;
  role: GroupRole;
  color: string;
  showLabel: boolean;
  restoreLabel?: string | null;
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
      data-ena-point-shape="square"
      data-ena-marker-size={halfSize * 2}
    >
      <title>{label}</title>
      {interactive ? (
        <rect
          x="-12"
          y="-12"
          width="24"
          height="24"
          fill="transparent"
          pointerEvents="all"
          data-ena-restore-hit-target="true"
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

interface PlotActionToolbarProps {
  kind: PlotKind;
  zoom: number;
  onZoomChange: (next: number) => void;
  onCopy: (button: HTMLButtonElement, kind: PlotKind) => void;
  copyStatus: string;
}

function PlotActionToolbar({
  kind,
  zoom,
  onZoomChange,
  onCopy,
  copyStatus,
}: PlotActionToolbarProps) {
  const plotName = kind === "comparison" ? "Comparison" : kind === "primary" ? "Primary" : "Secondary";
  return (
    <div
      className="ena-official-plot-actions"
      role="group"
      aria-label={`${plotName} Plot actions`}
      data-ena-plot-toolbar={kind}
    >
      <button
        type="button"
        data-ena-plot-action="zoom-in"
        aria-label={`${plotName} Plot: Zoom In`}
        title="Zoom In"
        disabled={zoom >= 2.4}
        onClick={() => onZoomChange(boundedZoom(zoom + 0.2))}
      >
        <OpenEnaPlotActionIcon name="zoom-in" />
      </button>
      <button
        type="button"
        data-ena-plot-action="zoom-out"
        aria-label={`${plotName} Plot: Zoom Out`}
        title="Zoom Out"
        disabled={zoom <= 0.6}
        onClick={() => onZoomChange(boundedZoom(zoom - 0.2))}
      >
        <OpenEnaPlotActionIcon name="zoom-out" />
      </button>
      <button
        type="button"
        data-ena-plot-action="recenter"
        aria-label={`${plotName} Plot: Recenter`}
        title="Recenter Plot"
        onClick={() => onZoomChange(1)}
      >
        <OpenEnaPlotActionIcon name="recenter" />
      </button>
      <button
        type="button"
        data-ena-plot-action="copy-image"
        aria-label={`${plotName} Plot: Copy image`}
        title="Copy plot image to clipboard"
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
}

function PlotPanelActionToolbar({
  plot,
  state: panelState,
  onToggleVisibility,
  onRemove,
  onSwitchPlots,
}: PlotPanelActionToolbarProps) {
  const visibilityLabel = panelState === "hidden" ? "Show Plot" : "Hide Plot";
  return (
    <div
      className="ena-official-panel-actions"
      role="group"
      aria-label={`${plot === "primary" ? "Primary" : "Secondary"} Plot panel actions`}
      data-ena-panel-toolbar={plot}
    >
      {plot === "secondary" && onSwitchPlots ? (
        <button
          type="button"
          data-ena-panel-action="switch-plots"
          aria-label="Switch Plots"
          title="Switch Plots"
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
        aria-label="Remove Plot"
        title="Remove Plot"
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
  restorePanelForRole?: Partial<Record<GroupRole, { label: string; onRestore: () => void }>>;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const viewportId = useId();
  const compact = kind !== "comparison";
  const width = compact ? MINI_WIDTH : MAIN_WIDTH;
  const height = compact ? MINI_HEIGHT : MAIN_HEIGHT;
  const viewportClipId = `ena-${kind}-${viewportId.replace(/[^a-zA-Z0-9_-]/gu, "")}-viewport`;
  const padding = compact ? MINI_PADDING : MAIN_PADDING;
  const { extent, source: extentSource } = resolveExtent(contrast);
  const officialFrame = resolveOfficialPlotFrame(contrast, extent);
  const project = buildProjector(
    officialFrame.extremePosition,
    width,
    height,
    padding,
    flipX,
    flipY,
    compact ? -0.75 : -0.25,
    compact ? -0.5 : -1,
  );
  const projectEvidence = (xValue: number, yValue: number) => project(
    xValue * officialFrame.pointScaleFactor,
    yValue * officialFrame.pointScaleFactor,
  );
  const origin = project(0, 0);
  const horizontalStart = project(-officialFrame.extremePosition, 0);
  const horizontalEnd = project(officialFrame.extremePosition, 0);
  const verticalStart = project(0, officialFrame.extremePosition);
  const verticalEnd = project(0, -officialFrame.extremePosition);
  const nodePoints = new Map<string, ProjectedPoint>();
  const modelNodePoints = unitCircle
    ? officialEquiUnitCircleNodePositions(contrast.nodes)
    : new Map(contrast.nodes.flatMap((node) => (
      finiteNumber(node.x) !== null && finiteNumber(node.y) !== null
        ? [[node.code, { x: node.x, y: node.y }] as const]
        : []
    )));
  modelNodePoints.forEach((point, code) => nodePoints.set(code, project(point.x, point.y)));
  const [xAxis, yAxis] = contrast.axes;
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
  const comparisonGroups: Array<{ role: GroupRole; side: OpenEnaPairwiseContrastSide }> = [
    { role: "primary", side: contrast.primary },
    { role: "secondary", side: contrast.secondary },
  ];
  const roleEntry = (role: GroupRole) => role === "primary" ? comparisonGroups[0] : comparisonGroups[1];
  const activeNetworkRoles = kind === "comparison"
    ? networkRoles ?? ["primary", "secondary"]
    : [sideRole ?? (kind === "primary" ? "primary" : "secondary")];
  const plottedGroups = activeNetworkRoles.map(roleEntry);
  const signedComparison = kind === "comparison" && activeNetworkRoles.length === 2;
  const edgeDenominator = signedComparison ? comparisonScale : groupMeanScale;
  const safeDenominator = Math.max(edgeDenominator, ZERO_TOLERANCE);
  const sourcePointGroups = (kind === "comparison" ? comparisonGroups : plottedGroups).map(({ role, side }) => {
    const valid = validPoints(side);
    return { role, side, valid, sampled: sampledPoints(valid) };
  });
  // webENA's side cards isolate each mean network. Analytic-unit observations
  // and group-summary squares belong to the central Comparison figure only.
  const pointGroups = kind === "comparison" ? sourcePointGroups : [];
  const pointsTotal = (kind === "comparison" ? comparisonGroups : plottedGroups)
    .reduce((sum, entry) => sum + entry.side.points.length, 0);
  const pointsValid = sourcePointGroups.reduce((sum, entry) => sum + entry.valid.length, 0);
  const pointsShown = pointGroups.reduce((sum, entry) => sum + entry.sampled.length, 0);
  const scaleFactor = bounded(edgeScale, 0.1, 4, 1);
  const markerScale = bounded(pointScale, 0.5, 2, 1);
  const labelScale = bounded(textScale, 8 / 12, 20 / 12, 1);
  const zoom = bounded(plotZoom, 0.6, 2.4, 1);
  const activeNames = plottedGroups.map(({ side }) => side.name);
  const title = signedComparison
    ? `Signed group-network difference, ${activeNames[0]} minus ${activeNames[1]}`
    : activeNames.length === 1
      ? `${activeNames[0]} group network`
      : "No group network selected";
  const description = signedComparison
    ? `Two-dimensional signed group comparison on ${xAxisLabel} and ${yAxisLabel}. Each connection is drawn once in the stable color of the stronger selected group; width encodes the absolute Primary-minus-Secondary difference. Dashed guides show separate marginal 95% Student-t confidence intervals for each arithmetic group mean, not a joint region or significance test.`
    : `Two-dimensional selected group mean network in the fixed full-result coordinate extent and shared group-mean edge scale.`;
  const pointSamplingDescription = pointsShown < pointsValid
    ? ` Rendering ${pointsShown} sampled unit marks from ${pointsValid} valid analytic-unit points.`
    : "";
  const reference = contrast.resultProvenance.projectionReference;
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
      ref={kind === "comparison" ? svgRef : undefined}
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
      data-ena-points-shown={pointsShown}
      data-ena-points-dropped={pointsTotal - pointsValid}
      data-ena-plot-zoom={dataNumber(zoom)}
      style={{
        "--ena-plot-text-scale": labelScale,
      } as CSSProperties}
    >
      <title id={titleId}>{`${title}${referenceDescription}`}</title>
      <desc id={descriptionId}>{`${description}${pointSamplingDescription}${referenceDescription}`}</desc>
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
      {showNetworks ? (
        <g className="ena-set-network-edges">
          {signedComparison ? (
            <g data-ena-network-role="signed-difference">
              {contrast.edges.map((edge) => {
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
                const edgeLabel = `${edge.name}: signed Primary-minus-Secondary difference ${formatNumber(difference, true)}; ${strongerName} ${role} group is stronger`;
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
                const start = nodePoints.get(edge.source);
                const end = nodePoints.get(edge.target);
                if (!start || !end) return null;
                const value = edgeValue(edge, role);
                const magnitude = Math.abs(value);
                const ratio = magnitude / safeDenominator;
                if (magnitude <= ZERO_TOLERANCE || ratio < threshold) return null;
                const stroke = groupColor(contrast, side, role);
                const edgeLabel = `${edge.name}: ${side.name} ${role} group mean weight ${formatNumber(value)}`;
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
      {kind === "comparison" ? comparisonGroups.map(({ role, side }) => (
        <ConfidenceGuide
          key={`confidence:${side.name}`}
          side={side}
          role={role}
          axes={contrast.axes}
          project={projectEvidence}
          color={groupColor(contrast, side, role)}
        />
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
        {contrast.nodes.map((node: ContrastNode) => {
          if (unitCircle && !connectedCodes.has(node.code)) return null;
          const point = nodePoints.get(node.code);
          if (!point) return null;
          const codeLabel = safeFigureLabel(node.code, 72) || "Unnamed code";
          const nodeSize = codeNodeSize(node.code);
          const nodeColor = codeColorFor(codeColors, node.code);
          return (
            <g
              key={node.code}
              transform={`translate(${point.x} ${point.y})`}
              role="img"
              aria-label={`${codeLabel} code node`}
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
            </g>
          );
        })}
      </g>
      {kind === "comparison" ? comparisonGroups.map(({ role, side }) => {
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
  const initialZoom = boundedZoom(props.plotZoom);
  const [panelZooms, setPanelZooms] = useState<PlotZoomState>({
    comparison: initialZoom,
    primary: initialZoom,
    secondary: initialZoom,
  });
  const [copyStatus, setCopyStatus] = useState<Record<PlotKind, string>>({
    comparison: "",
    primary: "",
    secondary: "",
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
      focusAfterRender('[aria-label="Restore Secondary Plot"]');
      return;
    }
    setPanelRoles((current) => ({ ...current, [plot]: null }));
    setPanelStates((current) => reduceOpenEnaPlotPanelState(current, { type: "remove", plot }));
    focusAfterRender(`[aria-label="Restore ${plot === "primary" ? "Primary" : "Secondary"} Plot"]`);
  };

  const restorePrimaryPlotLabel = panelStates.primary === "removed" ? "Restore Primary Plot" : null;
  const restorePrimaryPlot = (role: GroupRole) => {
    const action: OpenEnaPlotPanelAction = { type: "restore", plot: "primary" };
    setPanelRoles((current) => ({ ...current, primary: role }));
    setPanelStates((current) => reduceOpenEnaPlotPanelState(current, action));
    focusAfterRender('[data-ena-panel-role="primary"]');
  };
  const restoreSecondaryPlotLabel = panelStates.secondary === "removed" ? "Restore Secondary Plot" : null;
  const restoreSecondaryPlot = (role: GroupRole) => {
    const action: OpenEnaPlotPanelAction = { type: "restore", plot: "secondary" };
    setPanelRoles((current) => ({ ...current, secondary: role }));
    setPanelStates((current) => reduceOpenEnaPlotPanelState(current, action));
    focusAfterRender('[data-ena-panel-role="secondary"]');
  };

  const restorePanelForRole: Partial<Record<GroupRole, { label: string; onRestore: () => void }>> = {};
  for (const role of ["primary", "secondary"] as const) {
    if (restorePrimaryPlotLabel) {
      restorePanelForRole[role] = {
        label: restorePrimaryPlotLabel,
        onRestore: () => restorePrimaryPlot(role),
      };
    } else if (restoreSecondaryPlotLabel && panelRoles.primary !== role) {
      restorePanelForRole[role] = {
        label: restoreSecondaryPlotLabel,
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
  };

  const updatePanelZoom = (kind: PlotKind, next: number) => {
    setPanelZooms((current) => ({ ...current, [kind]: boundedZoom(next) }));
  };
  const handleCopy = (button: HTMLButtonElement, kind: PlotKind) => {
    setCopyStatus((current) => ({ ...current, [kind]: "Copying…" }));
    void copyPlotImage(button).then(
      (format) => setCopyStatus((current) => ({
        ...current,
        [kind]: format === "image" ? "Image copied" : "SVG copied as text",
      })),
      () => setCopyStatus((current) => ({ ...current, [kind]: "Copy unavailable" })),
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
    `Shared scale ${formatNumber(groupMeanScale)}`,
    `scaled ${formatMultiplier(props.edgeScale)}x`,
    ...(showVariance ? [`${xAxisLabel} ${xVariance.toFixed(1)}%`, `${yAxisLabel} ${yVariance.toFixed(1)}%`] : []),
  ].join(" · ");
  const comparisonPlotMeta = [
    `Difference scale ${formatNumber(comparisonScale)}`,
    `scaled ${formatMultiplier(props.edgeScale)}x`,
    ...(showVariance ? [`${xAxisLabel} ${xVariance.toFixed(1)}%`, `${yAxisLabel} ${yVariance.toFixed(1)}%`] : []),
  ].join(" · ");
  const threshold = bounded(edgeThreshold, 0, 1, 0);
  const denominator = Math.max(comparisonScale, ZERO_TOLERANCE);
  const strongestDifferences = (showNetworks ? contrast.edges : [])
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
  const comparisonAccessibleLabel = comparisonNames.length === 2
    ? `${comparisonNames[0]} minus ${comparisonNames[1]}, scaled ${formatOfficialMultiplier(props.edgeScale)} times`
    : comparisonNames.length === 1
      ? `${comparisonNames[0]}, scaled ${formatOfficialMultiplier(props.edgeScale)} times`
      : `No selected group network, scaled ${formatOfficialMultiplier(props.edgeScale)} times`;

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
      aria-label="Primary / Secondary Group Comparison"
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
              aria-label="Data View"
            >
              <header className="ena-set-plot-heading">
                <div>
                  <h3>Data View</h3>
                  <p>{contrast.primary.name} and {contrast.secondary.name} · comparison records</p>
                </div>
                <span>{xAxis} × {yAxis}</span>
              </header>
              {dataView ?? (
                <p className="ena-sets-compatibility-note" role="status">
                  Data View is not available for this comparison result.
                </p>
              )}
            </section>
          ) : (
            <figure className="ena-set-main-plot" tabIndex={0} aria-label="Comparison plot. Scroll horizontally on small screens.">
              <header className="ena-set-plot-heading ena-group-contrast-plot-heading">
                <div>
                  <h3>Comparison Plot</h3>
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
                          style={{ color: groupColor(contrast, side, role) }}
                        >
                          {side.name}
                        </span>,
                      ];
                    })}
                    <span className="ena-set-scale-caption"> (scaled {formatOfficialMultiplier(props.edgeScale)}x)</span>
                    <span className="sr-only"> · {activeNetworkRoles.length === 2 ? "signed edge differences" : "group mean network"}</span>
                  </p>
                </div>
                <div className="ena-set-plot-heading-tools">
                  <span>{comparisonPlotMeta}</span>
                  <PlotActionToolbar
                    kind="comparison"
                    zoom={panelZooms.comparison}
                    onZoomChange={(next) => updatePanelZoom("comparison", next)}
                    onCopy={handleCopy}
                    copyStatus={copyStatus.comparison}
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
                  No nonzero Primary-minus-Secondary edge differences are present for this selected pair.
                </p>
              ) : null}
              <figcaption>
                <span className="sr-only ena-set-method-boundary">
                  Each connection is drawn once as Primary minus Secondary in the stable color of the stronger selected group; line width is the absolute edge difference. The two side plots retain the complete group-mean networks on their shared mean scale. Dashed guides are separate marginal 95% Student-t confidence intervals for the two displayed-axis group means; they are not a joint confidence region or a significance test.
                </span>
                <span className="ena-set-plot-definitions">
                  <span><strong>Units:</strong> {contrast.configuration.unitColumns.join(" › ")}</span>
                  <span><strong>Horizon:</strong> {contrast.configuration.conversationColumns.join(" › ")}</span>
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
              aria-label="Primary plot. Scroll horizontally on small screens."
              data-ena-panel-role="primary"
              data-ena-panel-state={panelStates.primary}
            >
              <header className="ena-set-plot-heading ena-group-contrast-plot-heading">
                <div>
                  <h3>Primary Plot</h3>
                  <p
                    className="ena-set-series-caption"
                    aria-label={`${primaryPanelSide.name}, scaled ${formatOfficialMultiplier(props.edgeScale)} times`}
                  >
                    <span
                      className="ena-set-series-primary"
                      style={{ color: groupColor(contrast, primaryPanelSide, panelRoles.primary) }}
                    >
                      {primaryPanelSide.name}
                    </span>
                    <span className="ena-set-scale-caption"> (scaled {formatOfficialMultiplier(props.edgeScale)}x)</span>
                    <span className="sr-only">{primaryPanelSide.name} · {primaryPanelSide.unitCount} analytic units</span>
                  </p>
                </div>
                <div className="ena-set-plot-heading-tools">
                  <PlotPanelActionToolbar
                    plot="primary"
                    state={panelStates.primary}
                    onToggleVisibility={() => togglePanelVisibility("primary")}
                    onRemove={() => removePanel("primary")}
                  />
                  <span>{sharedMeanPlotMeta}</span>
                  <PlotActionToolbar
                    kind="primary"
                    zoom={panelZooms.primary}
                    onZoomChange={(next) => updatePanelZoom("primary", next)}
                    onCopy={handleCopy}
                    copyStatus={copyStatus.primary}
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
            <section className="ena-empty-side-plot" data-ena-panel-role="primary" data-ena-panel-state="removed" aria-label="Primary Plot is empty">
              <header className="ena-set-plot-heading ena-group-contrast-plot-heading"><h3>Primary Plot</h3></header>
              <div className="ena-empty-side-plot-prompt"><OpenEnaPlotActionIcon name="restore" /><p>Click or hover points in the comparison plot to display networks here</p></div>
            </section>
          )}
          {panelStates.secondary !== "removed" && secondaryPanelSide && panelRoles.secondary ? (
            <figure
              tabIndex={0}
              aria-label="Secondary plot. Scroll horizontally on small screens."
              data-ena-panel-role="secondary"
              data-ena-panel-state={panelStates.secondary}
            >
              <header className="ena-set-plot-heading ena-group-contrast-plot-heading">
                <div>
                  <h3>Secondary Plot</h3>
                  <p
                    className="ena-set-series-caption"
                    aria-label={`${secondaryPanelSide.name}, scaled ${formatOfficialMultiplier(props.edgeScale)} times`}
                  >
                    <span
                      className="ena-set-series-secondary"
                      style={{ color: groupColor(contrast, secondaryPanelSide, panelRoles.secondary) }}
                    >
                      {secondaryPanelSide.name}
                    </span>
                    <span className="ena-set-scale-caption"> (scaled {formatOfficialMultiplier(props.edgeScale)}x)</span>
                    <span className="sr-only">{secondaryPanelSide.name} · {secondaryPanelSide.unitCount} analytic units</span>
                  </p>
                </div>
                <div className="ena-set-plot-heading-tools">
                  <PlotPanelActionToolbar
                    plot="secondary"
                    state={panelStates.secondary}
                    onSwitchPlots={onSwitchPlots ? handleSwitchPlots : undefined}
                    onToggleVisibility={() => togglePanelVisibility("secondary")}
                    onRemove={() => removePanel("secondary")}
                  />
                  <span>{sharedMeanPlotMeta}</span>
                  <PlotActionToolbar
                    kind="secondary"
                    zoom={panelZooms.secondary}
                    onZoomChange={(next) => updatePanelZoom("secondary", next)}
                    onCopy={handleCopy}
                    copyStatus={copyStatus.secondary}
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
            <section className="ena-empty-side-plot" data-ena-panel-role="secondary" data-ena-panel-state="removed" aria-label="Secondary Plot is empty">
              <header className="ena-set-plot-heading ena-group-contrast-plot-heading"><h3>Secondary Plot</h3></header>
              <div className="ena-empty-side-plot-prompt"><OpenEnaPlotActionIcon name="restore" /><p>Click or hover points in the comparison plot to display networks here</p></div>
            </section>
          )}
          {rightTools ? (
            <section
              className="ena-set-right-tools"
              data-testid="open-ena-group-right-tools"
              role="region"
              aria-label="Plot Tools"
            >
              {rightTools}
            </section>
          ) : null}
        </div>
      </div>

      <ol
        className="ena-set-signed-legend"
        aria-label="Selected group order"
        data-ena-legend-order="primary-secondary"
        style={{ listStyle: "none", margin: 0, paddingInlineStart: 4 }}
      >
        <li data-ena-group-role="primary" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <i
            className="ena-set-key-primary-mean"
            aria-hidden="true"
            style={{ background: groupColor(contrast, contrast.primary, "primary"), borderColor: "#263740" }}
          />
          <span><strong>Square summary</strong> · Primary: {contrast.primary.name}</span>
        </li>
        <li data-ena-group-role="secondary" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <i
            className="ena-set-key-secondary-mean"
            aria-hidden="true"
            style={{ background: groupColor(contrast, contrast.secondary, "secondary"), borderColor: "#263740" }}
          />
          <span><strong>Square summary</strong> · Secondary: {contrast.secondary.name}</span>
        </li>
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
        <li data-ena-interval-legend="marginal-student-t-95" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <i
            className="ena-set-key-confidence"
            aria-hidden="true"
            style={{ borderColor: groupColor(contrast, contrast.primary, "primary") }}
          />
          <span>Dashed guides: separate marginal 95% Student-t intervals for each group mean; not a joint region or test</span>
        </li>
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
                <th scope="row">{edge.name}</th>
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
