import {
  useId,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";
import type {
  OpenEnaPairwiseContrast,
  OpenEnaPairwiseContrastSide,
} from "@/lib/open-ena/contrasts";
import { JENA_PRIMARY_COLOR, JENA_SECONDARY_COLOR } from "@/lib/open-ena/plot-style";

export interface OpenEnaGroupContrastProps {
  contrast: OpenEnaPairwiseContrast;
  edgeThreshold: number;
  showPoints: boolean;
  showNetworks: boolean;
  showLabels: boolean;
  showUnitLabels: boolean;
  showVariance: boolean;
  edgeScale: number;
  pointScale: number;
  textScale?: number;
  plotZoom: number;
  flipX: boolean;
  flipY: boolean;
  svgRef?: Ref<SVGSVGElement>;
  centerMode?: "plot" | "data";
  dataView?: ReactNode;
  rightTools?: ReactNode;
}

type ContrastEdge = OpenEnaPairwiseContrast["edges"][number];
type ContrastNode = OpenEnaPairwiseContrast["nodes"][number];
type CoordinateExtent = OpenEnaPairwiseContrast["coordinateExtent"];
type PlotKind = "comparison" | "primary" | "secondary";
type GroupRole = "primary" | "secondary";
type ProjectedPoint = { x: number; y: number };

const MAIN_WIDTH = 920;
const MAIN_HEIGHT = 590;
const MINI_WIDTH = 440;
const MINI_HEIGHT = 160;
const MAIN_PADDING = 54;
const MINI_PADDING = 27;
const PRIMARY_COLOR = JENA_PRIMARY_COLOR;
const SECONDARY_COLOR = JENA_SECONDARY_COLOR;
const ZERO_TOLERANCE = 1e-12;

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

function dataNumber(value: number) {
  return Number.isFinite(value) ? String(value) : "0";
}

function formatMultiplier(value: unknown) {
  return bounded(finiteOrZero(value), 0.5, 2, 1).toFixed(2);
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

function buildProjector(
  extent: CoordinateExtent,
  width: number,
  height: number,
  padding: number,
  flipX: boolean,
  flipY: boolean,
) {
  const rawRangeX = extent.maxX - extent.minX;
  const rawRangeY = extent.maxY - extent.minY;
  const rangeX = rawRangeX > ZERO_TOLERANCE ? rawRangeX : 2;
  const rangeY = rawRangeY > ZERO_TOLERANCE ? rawRangeY : 2;
  const centerX = rawRangeX > ZERO_TOLERANCE ? (extent.minX + extent.maxX) / 2 : extent.minX;
  const centerY = rawRangeY > ZERO_TOLERANCE ? (extent.minY + extent.maxY) / 2 : extent.minY;
  const scale = Math.min(
    (width - padding * 2) / (rangeX * 1.12),
    (height - padding * 2) / (rangeY * 1.12),
  );

  return (xValue: unknown, yValue: unknown): ProjectedPoint => {
    const x = finiteNumber(xValue) ?? centerX;
    const y = finiteNumber(yValue) ?? centerY;
    return {
      x: width / 2 + (x - centerX) * scale * (flipX ? -1 : 1),
      y: height / 2 - (y - centerY) * scale * (flipY ? -1 : 1),
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

interface GroupMeanMarkerProps {
  point: ProjectedPoint;
  compact: boolean;
  groupName: string;
  role: GroupRole;
}

function GroupMeanMarker({
  point,
  compact,
  groupName,
  role,
}: GroupMeanMarkerProps) {
  const halfSize = compact ? 7 : 10;
  const color = role === "primary" ? PRIMARY_COLOR : SECONDARY_COLOR;
  const stroke = role === "primary" ? "#173b3a" : "#542d1d";
  const roleLabel = role === "primary" ? "Primary" : "Secondary";
  const label = `${roleLabel} group mean for ${groupName}, square marker`;
  return (
    <g
      transform={`translate(${point.x} ${point.y})`}
      role="img"
      aria-label={label}
      data-ena-mean-marker={`${role}-square`}
      data-ena-summary-marker="true"
      data-ena-group-role={role}
      data-ena-point-shape="square"
      data-ena-marker-size={halfSize * 2}
    >
      <title>{label}</title>
      <rect
        x={-halfSize - 3}
        y={-halfSize - 3}
        width={(halfSize + 3) * 2}
        height={(halfSize + 3) * 2}
        rx="1"
        fill="#ffffff"
        stroke="#ffffff"
        strokeWidth="3"
      />
      <rect
        x={-halfSize}
        y={-halfSize}
        width={halfSize * 2}
        height={halfSize * 2}
        rx="1"
        fill={color}
        stroke={stroke}
        strokeWidth="2"
      />
    </g>
  );
}

function ContrastSvg({
  contrast,
  kind,
  edgeThreshold,
  showPoints,
  showNetworks,
  showLabels,
  showUnitLabels,
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
}: OpenEnaGroupContrastProps & {
  kind: PlotKind;
  comparisonScale: number;
  groupMeanScale: number;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const compact = kind !== "comparison";
  const width = compact ? MINI_WIDTH : MAIN_WIDTH;
  const height = compact ? MINI_HEIGHT : MAIN_HEIGHT;
  const padding = compact ? MINI_PADDING : MAIN_PADDING;
  const { extent, source: extentSource } = resolveExtent(contrast);
  const project = buildProjector(extent, width, height, padding, flipX, flipY);
  const origin = project(0, 0);
  const nodePoints = new Map<string, ProjectedPoint>();
  contrast.nodes.forEach((node) => {
    if (finiteNumber(node.x) !== null && finiteNumber(node.y) !== null) {
      nodePoints.set(node.code, project(node.x, node.y));
    }
  });
  const [xAxis, yAxis] = contrast.axes;
  const xVarianceShare = finiteOrZero(contrast.geometry.variance[xAxis]);
  const yVarianceShare = finiteOrZero(contrast.geometry.variance[yAxis]);
  const xVariance = xVarianceShare * 100;
  const yVariance = yVarianceShare * 100;
  const primaryMean = project(
    meanCoordinate(contrast.primary, xAxis),
    meanCoordinate(contrast.primary, yAxis),
  );
  const secondaryMean = project(
    meanCoordinate(contrast.secondary, xAxis),
    meanCoordinate(contrast.secondary, yAxis),
  );
  const threshold = bounded(edgeThreshold, 0, 1, 0);
  const edgeDenominator = kind === "comparison" ? comparisonScale : groupMeanScale;
  const safeDenominator = Math.max(edgeDenominator, ZERO_TOLERANCE);
  const plottedGroups: Array<{ role: GroupRole; side: OpenEnaPairwiseContrastSide }> = kind === "comparison"
    ? [
        { role: "primary", side: contrast.primary },
        { role: "secondary", side: contrast.secondary },
      ]
    : kind === "primary"
      ? [{ role: "primary", side: contrast.primary }]
      : [{ role: "secondary", side: contrast.secondary }];
  const pointGroups = plottedGroups.map(({ role, side }) => {
    const valid = validPoints(side);
    return { role, side, valid, sampled: sampledPoints(valid) };
  });
  const pointsTotal = plottedGroups.reduce((sum, entry) => sum + entry.side.points.length, 0);
  const pointsValid = pointGroups.reduce((sum, entry) => sum + entry.valid.length, 0);
  const pointsShown = pointGroups.reduce((sum, entry) => sum + entry.sampled.length, 0);
  const scaleFactor = bounded(edgeScale, 0.5, 2, 1);
  const markerScale = bounded(pointScale, 0.5, 2, 1);
  const labelScale = bounded(textScale, 0.8, 1.5, 1);
  const zoom = bounded(plotZoom, 0.6, 2.4, 1);
  const title = kind === "comparison"
    ? `Signed group-network difference, ${contrast.primary.name} minus ${contrast.secondary.name}`
    : kind === "primary"
      ? `${contrast.primary.name} primary group network`
      : `${contrast.secondary.name} secondary group network`;
  const description = kind === "comparison"
    ? `Two-dimensional signed group comparison on ${xAxis} and ${yAxis}. Each connection is drawn once: blue means Primary is stronger, red means Secondary is stronger, and width encodes the absolute Primary-minus-Secondary difference.`
    : `Two-dimensional ${kind} group points and mean network in the fixed full-result coordinate extent and shared group-mean edge scale.`;
  const pointSamplingDescription = pointsShown < pointsValid
    ? ` Rendering ${pointsShown} sampled unit marks from ${pointsValid} valid analytic-unit points.`
    : "";
  const reference = contrast.resultProvenance.projectionReference;
  const referenceId = reference ? safeFigureLabel(reference.referenceId, 30) : null;
  const referenceName = reference ? safeFigureLabel(reference.name, 72) : null;
  const sourceHash = reference?.source.normalizedUtf8TextSha256;
  const referenceToken = referenceId
    ? `ID ${referenceId}${sourceHash ? ` · declared source SHA-256 ${sourceHash.slice(0, 12)}…` : ""}`
    : null;
  const referenceCaveat = reference
    ? "Variance shares describe current data in this fixed basis, not reference-fit explained variance."
    : null;
  const referenceDescription = referenceToken && referenceName && referenceCaveat
    ? ` Projected into fixed reference: ${referenceToken}. Reference: ${referenceName}. ${referenceCaveat}`
    : "";

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
      data-ena-axis-frame="shared-full-result"
      data-ena-axis-x={xAxis}
      data-ena-axis-y={yAxis}
      data-ena-axis-x-variance={dataNumber(xVarianceShare)}
      data-ena-axis-y-variance={dataNumber(yVarianceShare)}
      data-ena-unit-definition={contrast.configuration.unitColumns.join("::")}
      data-ena-horizon-definition={contrast.configuration.conversationColumns.join("::")}
      data-ena-edge-scale-kind={kind === "comparison" ? "signed-difference" : "shared-group-mean"}
      data-ena-edge-scale-max={dataNumber(edgeDenominator)}
      data-ena-signed-difference-scale-max={kind === "comparison" ? dataNumber(comparisonScale) : undefined}
      data-ena-edge-scale-factor={dataNumber(scaleFactor)}
      data-ena-point-scale-factor={dataNumber(markerScale)}
      data-ena-extent-source={extentSource}
      data-ena-coordinate-extent={`${dataNumber(extent.minX)} ${dataNumber(extent.maxX)} ${dataNumber(extent.minY)} ${dataNumber(extent.maxY)}`}
      data-ena-points-total={pointsTotal}
      data-ena-points-valid={pointsValid}
      data-ena-points-shown={pointsShown}
      data-ena-points-dropped={pointsTotal - pointsValid}
      style={{
        transform: `scale(${zoom})`,
        transformOrigin: "center",
        "--ena-plot-text-scale": labelScale,
      } as CSSProperties}
    >
      <title id={titleId}>{`${title}${referenceDescription}`}</title>
      <desc id={descriptionId}>{`${description}${pointSamplingDescription}${referenceDescription}`}</desc>
      <rect width={width} height={height} rx={compact ? 7 : 10} className="ena-set-plot-background" />
      <g className="ena-set-zero-axes" aria-hidden="true">
        <line x1={origin.x} y1={padding / 2} x2={origin.x} y2={height - padding / 2} />
        <line x1={padding / 2} y1={origin.y} x2={width - padding / 2} y2={origin.y} />
        <text x={width - padding / 2} y={Math.max(14, Math.min(height - 8, origin.y - 9))} textAnchor="end">
          {xAxis}{showVariance ? ` · ${xVariance.toFixed(1)}%` : ""}{flipX ? " · flipped" : ""}
        </text>
        <text x={Math.max(8, Math.min(width - 90, origin.x + 9))} y={compact ? 18 : 25}>
          {yAxis}{showVariance ? ` · ${yVariance.toFixed(1)}%` : ""}{flipY ? " · flipped" : ""}
        </text>
      </g>
      {showNetworks ? (
        <g className="ena-set-network-edges">
          {kind === "comparison" ? (
            <g data-ena-network-role="signed-difference">
              {contrast.edges.map((edge) => {
                const start = nodePoints.get(edge.source);
                const end = nodePoints.get(edge.target);
                if (!start || !end) return null;
                const difference = finiteOrZero(edge.signedDifference);
                const magnitude = Math.abs(difference);
                const ratio = magnitude / safeDenominator;
                if (magnitude <= ZERO_TOLERANCE || ratio < threshold) return null;
                const role: GroupRole = difference > 0 ? "primary" : "secondary";
                const sign = difference > 0 ? "positive" : "negative";
                const strongerName = role === "primary" ? contrast.primary.name : contrast.secondary.name;
                const stroke = role === "primary" ? PRIMARY_COLOR : SECONDARY_COLOR;
                const edgeLabel = `${edge.name}: signed Primary-minus-Secondary difference ${formatNumber(difference, true)}; ${strongerName} ${role} group is stronger`;
                return (
                  <line
                    key={edge.name}
                    x1={start.x}
                    y1={start.y}
                    x2={end.x}
                    y2={end.y}
                    stroke={stroke}
                    strokeWidth={(1 + ratio * (compact ? 4 : 6)) * scaleFactor}
                    strokeOpacity={0.38 + Math.min(1, ratio) * 0.58}
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
          ) : plottedGroups.map(({ role, side }) => (
            <g key={role} data-ena-network-role={role}>
              {contrast.edges.map((edge) => {
                const start = nodePoints.get(edge.source);
                const end = nodePoints.get(edge.target);
                if (!start || !end) return null;
                const value = edgeValue(edge, role);
                const magnitude = Math.abs(value);
                const ratio = magnitude / safeDenominator;
                if (magnitude <= ZERO_TOLERANCE || ratio < threshold) return null;
                const stroke = role === "primary" ? PRIMARY_COLOR : SECONDARY_COLOR;
                const edgeLabel = `${edge.name}: ${side.name} ${role} group mean weight ${formatNumber(value)}`;
                return (
                  <line
                    key={`${role}:${edge.name}`}
                    x1={start.x}
                    y1={start.y}
                    x2={end.x}
                    y2={end.y}
                    stroke={stroke}
                    strokeWidth={(1 + ratio * (compact ? 4 : 6)) * scaleFactor}
                    strokeOpacity={0.38 + Math.min(1, ratio) * 0.58}
                    strokeLinecap="round"
                    data-ena-edge={edge.name}
                    data-ena-sign={role}
                    data-ena-network-role={role}
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
      {showPoints ? (
        <g className="ena-set-unit-points" data-ena-point-layer="standard">
          {pointGroups.map(({ role, side, sampled }) => (
            <g
              key={role}
              data-ena-group-role={role}
            >
              {sampled.map(({ point, sourceIndex }, sampleIndex) => {
                const projected = project(point.x, point.y);
                const markerRadius = (compact ? 3.4 : 4.6) * markerScale;
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
                      fill={role === "primary" ? PRIMARY_COLOR : SECONDARY_COLOR}
                      fillOpacity="0.62"
                      stroke="#ffffff"
                      strokeWidth={compact ? 1 : 1.4}
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
          const point = nodePoints.get(node.code);
          if (!point) return null;
          const codeLabel = safeFigureLabel(node.code, 72) || "Unnamed code";
          return (
            <g
              key={node.code}
              transform={`translate(${point.x} ${point.y})`}
              role="img"
              aria-label={`${codeLabel} code node`}
            >
              <title>{`${codeLabel} code node`}</title>
              <circle
                r={compact ? 7 : 9}
                className="ena-set-result-node"
                data-ena-code-node="neutral"
                fill="#ffffff"
                stroke="#4d4d4d"
                strokeWidth="2.5"
              />
              {showLabels ? (
                <text y={compact ? -12 : -16} textAnchor="middle" className="ena-set-result-label">
                  {codeLabel}
                </text>
              ) : null}
            </g>
          );
        })}
      </g>
      {kind === "comparison" || kind === "primary" ? (
        <GroupMeanMarker
          point={primaryMean}
          compact={compact}
          groupName={contrast.primary.name}
          role="primary"
        />
      ) : null}
      {kind === "comparison" || kind === "secondary" ? (
        <GroupMeanMarker
          point={secondaryMean}
          compact={compact}
          groupName={contrast.secondary.name}
          role="secondary"
        />
      ) : null}
      {kind === "comparison" && referenceToken && referenceName && referenceCaveat ? (
        <g className="ena-reference-figure-provenance" role="note" aria-label={referenceDescription.trim()}>
          <rect x="18" y="514" width="884" height="64" rx="8" fill="#f1f7f6" stroke="#c7dbd7" />
          <text x="30" y="532" fill="#334b52" fontSize="10.5" fontWeight="700">{referenceToken}</text>
          <text x="30" y="551" fill="#334b52" fontSize="10.5" fontWeight="700">Reference: {referenceName}</text>
          <text x="30" y="570" fill="#334b52" fontSize="10.5" fontWeight="700">{referenceCaveat}</text>
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
  } = props;
  const titleId = useId();
  const comparisonScale = Math.max(0, finiteOrZero(contrast.edgeScaleDenominators.difference));
  const groupMeanScale = Math.max(0, finiteOrZero(contrast.edgeScaleDenominators.sharedMean));
  const [xAxis, yAxis] = contrast.axes;
  const xVariance = finiteOrZero(contrast.geometry.variance[xAxis]) * 100;
  const yVariance = finiteOrZero(contrast.geometry.variance[yAxis]) * 100;
  const sharedMeanPlotMeta = [
    `Shared scale ${formatNumber(groupMeanScale)}`,
    `scaled ${formatMultiplier(props.edgeScale)}×`,
    ...(showVariance ? [`${xAxis} ${xVariance.toFixed(1)}%`, `${yAxis} ${yVariance.toFixed(1)}%`] : []),
  ].join(" · ");
  const comparisonPlotMeta = [
    `Difference scale ${formatNumber(comparisonScale)}`,
    `scaled ${formatMultiplier(props.edgeScale)}×`,
    ...(showVariance ? [`${xAxis} ${xVariance.toFixed(1)}%`, `${yAxis} ${yVariance.toFixed(1)}%`] : []),
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

  return (
    <section
      className="open-ena-set-comparison open-ena-group-contrast"
      data-testid="open-ena-group-contrast"
      data-ena-dimensions="2"
      data-ena-difference-edge-scale-max={dataNumber(comparisonScale)}
      data-ena-shared-mean-edge-scale-max={dataNumber(groupMeanScale)}
      data-ena-difference-edge-scale-definition={contrast.edgeScaleDenominators.differenceDefinition}
      data-ena-shared-mean-edge-scale-definition={contrast.edgeScaleDenominators.sharedMeanDefinition}
      aria-labelledby={titleId}
    >
      <header className="ena-set-comparison-header">
        <div>
          <p className="ena-set-comparison-kicker">CURRENT ENDPOINT · PAIRWISE · 2D</p>
          <h2 id={titleId}>Primary / Secondary Group Comparison</h2>
        </div>
        <p className="ena-set-reference-id">
          Group column: <code>{contrast.groupColumn}</code> · axes <code>{contrast.axes[0]} × {contrast.axes[1]}</code>
        </p>
      </header>

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
              <header className="ena-set-plot-heading">
                <div>
                  <h3>Comparison Plot</h3>
                  <p>{contrast.primary.name} − {contrast.secondary.name} · signed edge differences</p>
                </div>
                <span>{comparisonPlotMeta}</span>
              </header>
              <ContrastSvg {...props} kind="comparison" comparisonScale={comparisonScale} groupMeanScale={groupMeanScale} />
              {comparisonScale <= ZERO_TOLERANCE ? (
                <p
                  className="ena-sets-compatibility-note"
                  role="status"
                  data-testid="open-ena-group-no-nonzero-differences"
                >
                  No nonzero Primary-minus-Secondary edge differences are present for this selected pair.
                </p>
              ) : null}
              <figcaption>
                Each connection is drawn once as Primary minus Secondary: blue means Primary is stronger, red means Secondary is stronger, and line width is the absolute edge difference. The two side plots retain the complete group-mean networks on their shared mean scale.
                <span className="ena-set-plot-definitions">
                  <strong>Units:</strong> {contrast.configuration.unitColumns.join(" › ")}
                  <strong>Horizon:</strong> {contrast.configuration.conversationColumns.join(" › ")}
                </span>
              </figcaption>
            </figure>
          )}
        </div>

        <div className="ena-set-side-plots" data-ena-workbench-region="right-stack">
          <figure tabIndex={0} aria-label="Primary plot. Scroll horizontally on small screens.">
            <header className="ena-set-plot-heading">
              <div>
                <h3>Primary Plot</h3>
                <p>{contrast.primary.name} · {contrast.primary.unitCount} analytic units</p>
              </div>
              <span>{sharedMeanPlotMeta}</span>
            </header>
            <ContrastSvg {...props} kind="primary" comparisonScale={comparisonScale} groupMeanScale={groupMeanScale} />
          </figure>
          <figure tabIndex={0} aria-label="Secondary plot. Scroll horizontally on small screens.">
            <header className="ena-set-plot-heading">
              <div>
                <h3>Secondary Plot</h3>
                <p>{contrast.secondary.name} · {contrast.secondary.unitCount} analytic units</p>
              </div>
              <span>{sharedMeanPlotMeta}</span>
            </header>
            <ContrastSvg {...props} kind="secondary" comparisonScale={comparisonScale} groupMeanScale={groupMeanScale} />
          </figure>
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
          <i className="ena-set-key-primary-mean" aria-hidden="true" />
          <span><strong>Square summary</strong> · Primary: {contrast.primary.name}</span>
        </li>
        <li data-ena-group-role="secondary" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <i className="ena-set-key-secondary-mean" aria-hidden="true" />
          <span><strong>Square summary</strong> · Secondary: {contrast.secondary.name}</span>
        </li>
        <li data-ena-sign="positive" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <i className="ena-set-key-positive" aria-hidden="true" />
          <span>Solid blue difference: Primary is stronger (+)</span>
        </li>
        <li data-ena-sign="negative" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <i className="ena-set-key-negative" aria-hidden="true" />
          <span>Solid red difference: Secondary is stronger (−)</span>
        </li>
        <li data-ena-sign="equal" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <i className="ena-set-key-equal" aria-hidden="true" />
          <span>Equal mean weight: no difference line drawn</span>
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
