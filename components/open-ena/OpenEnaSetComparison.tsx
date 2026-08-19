import { useId, type Ref } from "react";
import { JENA_PRIMARY_COLOR, JENA_SECONDARY_COLOR } from "@/lib/open-ena/plot-style";
import type { OpenEnaSharedComparison } from "@/lib/open-ena/sets";

interface OpenEnaSetComparisonProps {
  comparison: OpenEnaSharedComparison;
  edgeThreshold: number;
  showPoints: boolean;
  showNetworks: boolean;
  showLabels: boolean;
  showUnitLabels: boolean;
  edgeScale: number;
  pointScale: number;
  plotZoom: number;
  flipX: boolean;
  flipY: boolean;
  svgRef?: Ref<SVGSVGElement>;
}

type ComparisonEdge = OpenEnaSharedComparison["edges"][number];
type ComparisonNode = OpenEnaSharedComparison["nodes"][number];
type PlotKind = "difference" | "primary" | "secondary";
type ProjectedPoint = { x: number; y: number };

const MAIN_WIDTH = 920;
const MAIN_HEIGHT = 590;
const MINI_WIDTH = 440;
const MINI_HEIGHT = 280;
const PLOT_PADDING = 54;

const PRIMARY_COLOR = JENA_PRIMARY_COLOR;
const SECONDARY_COLOR = JENA_SECONDARY_COLOR;
const EQUAL_COLOR = "#64748b";
export const MAX_SHARED_SET_RENDERED_POINTS_PER_SIDE = 2_000;

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function boundedThreshold(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function meanCoordinate(
  meanPoint: OpenEnaSharedComparison["primary"]["meanPoint"],
  axis: string,
  index: 0 | 1,
) {
  const unknownPoint: unknown = meanPoint;
  if (Array.isArray(unknownPoint)) return finiteNumber(unknownPoint[index]);
  if (unknownPoint && typeof unknownPoint === "object") {
    return finiteNumber((unknownPoint as Record<string, unknown>)[axis]);
  }
  return 0;
}

function edgeValue(edge: ComparisonEdge, kind: PlotKind) {
  if (kind === "primary") return finiteNumber(edge.primaryWeight);
  if (kind === "secondary") return finiteNumber(edge.secondaryWeight);
  return finiteNumber(edge.signedDifference);
}

function edgeSign(edge: ComparisonEdge) {
  const difference = finiteNumber(edge.signedDifference);
  if (Math.abs(difference) <= 1e-12 || edge.stronger === "equal") return "equal" as const;
  return difference > 0 ? "positive" as const : "negative" as const;
}

function formatNumber(value: unknown, signed = false) {
  const safeValue = finiteNumber(value);
  if (Math.abs(safeValue) < 0.0005) return "0.000";
  const magnitude = Math.abs(safeValue).toFixed(3);
  if (!signed) return safeValue < 0 ? `−${magnitude}` : magnitude;
  return safeValue > 0 ? `+${magnitude}` : `−${magnitude}`;
}

function dataScaleValue(value: number) {
  return Number.isFinite(value) ? String(value) : "0";
}

function safeUnitLabel(value: unknown) {
  const normalized = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (!normalized) return "Unnamed unit";
  return normalized.length > 48 ? `${normalized.slice(0, 47)}…` : normalized;
}

function sampledPoints<T>(points: T[]) {
  if (points.length <= MAX_SHARED_SET_RENDERED_POINTS_PER_SIDE) {
    return points.map((point, sourceIndex) => ({ point, sourceIndex }));
  }
  return Array.from({ length: MAX_SHARED_SET_RENDERED_POINTS_PER_SIDE }, (_, sampleIndex) => {
    const sourceIndex = Math.round(
      sampleIndex * (points.length - 1) / (MAX_SHARED_SET_RENDERED_POINTS_PER_SIDE - 1),
    );
    return { point: points[sourceIndex], sourceIndex };
  });
}

function buildProjector(
  comparison: OpenEnaSharedComparison,
  width: number,
  height: number,
  flipX: boolean,
  flipY: boolean,
) {
  const [xAxis, yAxis] = comparison.axes;
  const xValues = [
    ...comparison.nodes.map((node) => finiteNumber(node.x)),
    ...comparison.primary.points.map((point) => finiteNumber(point.x)),
    ...comparison.secondary.points.map((point) => finiteNumber(point.x)),
    meanCoordinate(comparison.primary.meanPoint, xAxis, 0),
    meanCoordinate(comparison.secondary.meanPoint, xAxis, 0),
  ];
  const yValues = [
    ...comparison.nodes.map((node) => finiteNumber(node.y)),
    ...comparison.primary.points.map((point) => finiteNumber(point.y)),
    ...comparison.secondary.points.map((point) => finiteNumber(point.y)),
    meanCoordinate(comparison.primary.meanPoint, yAxis, 1),
    meanCoordinate(comparison.secondary.meanPoint, yAxis, 1),
  ];
  const xExtent = Math.max(1e-9, ...xValues.map((value) => Math.abs(value))) * 1.12;
  const yExtent = Math.max(1e-9, ...yValues.map((value) => Math.abs(value))) * 1.12;
  const scale = Math.min(
    (width - PLOT_PADDING * 2) / (xExtent * 2),
    (height - PLOT_PADDING * 2) / (yExtent * 2),
  );

  return (x: unknown, y: unknown): ProjectedPoint => ({
    x: width / 2 + finiteNumber(x) * scale * (flipX ? -1 : 1),
    y: height / 2 - finiteNumber(y) * scale * (flipY ? -1 : 1),
  });
}

function PrimaryMeanMarker({ point, compact }: { point: ProjectedPoint; compact: boolean }) {
  const radius = compact ? 7 : 10;
  return (
    <g
      transform={`translate(${point.x} ${point.y})`}
      role="img"
      aria-label="Primary-set mean, circle marker"
      data-ena-mean-marker="primary-circle"
    >
      <title>Primary-set mean, circle marker</title>
      <circle r={radius + 3} fill="#ffffff" stroke="#ffffff" strokeWidth="4" />
      <circle r={radius} fill={PRIMARY_COLOR} stroke="#173b3a" strokeWidth="2" />
    </g>
  );
}

function SecondaryMeanMarker({ point, compact }: { point: ProjectedPoint; compact: boolean }) {
  const radius = compact ? 8 : 11;
  return (
    <g
      transform={`translate(${point.x} ${point.y})`}
      role="img"
      aria-label="Secondary-set mean, diamond marker"
      data-ena-mean-marker="secondary-diamond"
    >
      <title>Secondary-set mean, diamond marker</title>
      <path
        d={`M 0 ${-radius - 3} L ${radius + 3} 0 L 0 ${radius + 3} L ${-radius - 3} 0 Z`}
        fill="#ffffff"
        stroke="#ffffff"
        strokeWidth="3"
      />
      <path
        d={`M 0 ${-radius} L ${radius} 0 L 0 ${radius} L ${-radius} 0 Z`}
        fill={SECONDARY_COLOR}
        stroke="#542d1d"
        strokeWidth="2"
      />
    </g>
  );
}

function NetworkSvg({
  comparison,
  kind,
  edgeThreshold,
  showPoints,
  showNetworks,
  showLabels,
  showUnitLabels,
  edgeScale,
  pointScale,
  plotZoom,
  flipX,
  flipY,
  svgRef,
  sharedScale,
}: OpenEnaSetComparisonProps & {
  kind: PlotKind;
  sharedScale: number;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const compact = kind !== "difference";
  const width = compact ? MINI_WIDTH : MAIN_WIDTH;
  const height = compact ? MINI_HEIGHT : MAIN_HEIGHT;
  const project = buildProjector(comparison, width, height, flipX, flipY);
  const nodePoints = new Map<string, ProjectedPoint>();
  comparison.nodes.forEach((node) => nodePoints.set(node.code, project(node.x, node.y)));
  const [xAxis, yAxis] = comparison.axes;
  const primaryMean = project(
    meanCoordinate(comparison.primary.meanPoint, xAxis, 0),
    meanCoordinate(comparison.primary.meanPoint, yAxis, 1),
  );
  const secondaryMean = project(
    meanCoordinate(comparison.secondary.meanPoint, xAxis, 0),
    meanCoordinate(comparison.secondary.meanPoint, yAxis, 1),
  );
  const threshold = boundedThreshold(edgeThreshold);
  const scaleDenominator = Math.max(sharedScale, 1e-12);
  const visibleEdges = comparison.edges.filter((edge) => {
    const magnitude = Math.abs(edgeValue(edge, kind));
    return magnitude > 1e-12 && magnitude / scaleDenominator >= threshold;
  });
  const plottedSets = kind === "difference"
    ? ([
        { role: "primary" as const, set: comparison.primary },
        { role: "secondary" as const, set: comparison.secondary },
      ])
    : kind === "primary"
      ? [{ role: "primary" as const, set: comparison.primary }]
      : [{ role: "secondary" as const, set: comparison.secondary }];
  const sampledSets = plottedSets.map(({ role, set }) => ({
    role,
    set,
    sampled: sampledPoints(set.points),
  }));
  const pointsShown = sampledSets.reduce((sum, entry) => sum + entry.sampled.length, 0);
  const pointsTotal = plottedSets.reduce((sum, entry) => sum + entry.set.points.length, 0);
  const title = kind === "difference"
    ? `Signed network difference, ${comparison.primary.name} minus ${comparison.secondary.name}`
    : kind === "primary"
      ? `${comparison.primary.name} primary network`
      : `${comparison.secondary.name} secondary network`;
  const description = kind === "difference"
    ? `Two-dimensional shared-reference comparison on ${xAxis} and ${yAxis}. Positive edges mean ${comparison.primary.name} is stronger. Negative edges mean ${comparison.secondary.name} is stronger.`
    : `Two-dimensional ${kind} unit points and mean network in the same reference geometry and absolute edge scale as the comparison plot.`;

  return (
    <svg
      ref={kind === "difference" ? svgRef : undefined}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-labelledby={`${titleId} ${descriptionId}`}
      className={compact ? "open-ena-set-mini-svg" : "open-ena-set-comparison-svg"}
      data-testid={kind === "difference"
        ? "open-ena-shared-difference-plot"
        : kind === "primary"
          ? "open-ena-primary-plot"
          : "open-ena-secondary-plot"}
      data-ena-edge-scale-max={dataScaleValue(sharedScale)}
      data-ena-plot-kind={kind}
      data-ena-points-shown={pointsShown}
      data-ena-points-total={pointsTotal}
      style={{ transform: `scale(${Math.min(2.4, Math.max(0.6, plotZoom))})`, transformOrigin: "center" }}
    >
      <title id={titleId}>{title}</title>
      <desc id={descriptionId}>{description}</desc>
      <defs>
        <pattern id={`${titleId}-grid`} width={compact ? 28 : 44} height={compact ? 28 : 44} patternUnits="userSpaceOnUse">
          <path
            d={`M ${compact ? 28 : 44} 0 L 0 0 0 ${compact ? 28 : 44}`}
            fill="none"
            stroke="#dce8e6"
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect width={width} height={height} rx={compact ? 7 : 10} className="ena-set-plot-background" />
      <rect width={width} height={height} rx={compact ? 7 : 10} fill={`url(#${titleId}-grid)`} opacity="0.62" />
      <g className="ena-set-zero-axes" aria-hidden="true">
        <line x1={width / 2} y1={22} x2={width / 2} y2={height - 22} />
        <line x1={22} y1={height / 2} x2={width - 22} y2={height / 2} />
        <text x={width - 27} y={height / 2 - 10} textAnchor="end">
          {xAxis}{flipX ? " · flipped" : ""}
        </text>
        <text x={width / 2 + 10} y={compact ? 18 : 25}>
          {yAxis}{flipY ? " · flipped" : ""}
        </text>
      </g>
      {showNetworks ? <g className="ena-set-network-edges">
        {visibleEdges.map((edge) => {
          const source = nodePoints.get(edge.source);
          const target = nodePoints.get(edge.target);
          if (!source || !target) return null;
          const value = edgeValue(edge, kind);
          const magnitude = Math.abs(value);
          const ratio = magnitude / scaleDenominator;
          const sign = kind === "difference" ? edgeSign(edge) : kind;
          const stroke = sign === "positive" || sign === "primary"
            ? PRIMARY_COLOR
            : sign === "negative" || sign === "secondary"
              ? SECONDARY_COLOR
              : EQUAL_COLOR;
          const edgeLabel = kind === "difference"
            ? `${edge.name}: signed difference ${formatNumber(value, true)}; ${edge.stronger === "equal" ? "equal mean weights" : `${edge.stronger === "primary" ? comparison.primary.name : comparison.secondary.name} stronger`}`
            : `${edge.name}: ${kind} mean weight ${formatNumber(value)}`;
          return (
            <line
              key={edge.name}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke={stroke}
              strokeWidth={(1.4 + ratio * (compact ? 8 : 11)) * Math.max(0.5, edgeScale)}
              strokeOpacity={0.48 + ratio * 0.5}
              strokeLinecap="round"
              data-ena-edge={edge.name}
              data-ena-sign={sign}
              aria-label={edgeLabel}
            >
              <title>{edgeLabel}</title>
            </line>
          );
        })}
      </g> : null}
      {showPoints ? <g className="ena-set-unit-points">
        {sampledSets.flatMap(({ role, set, sampled }) => sampled.map(({ point: unitPoint, sourceIndex }, sampleIndex) => {
          const point = project(unitPoint.x, unitPoint.y);
          const sourceLabel = safeUnitLabel(unitPoint.sourceUnitId);
          const accessibleLabel = showUnitLabels
            ? `${set.name} unit ${sourceLabel}`
            : `${role === "primary" ? "Primary" : "Secondary"} unit point ${sourceIndex + 1}`;
          const pointKey = `${role}:${sampleIndex}`;
          return (
            <g
              key={pointKey}
              transform={`translate(${point.x} ${point.y})`}
              role="img"
              aria-label={accessibleLabel}
              data-ena-unit-point="true"
              data-ena-set-role={role}
              data-ena-point-shape={role === "primary" ? "circle" : "diamond"}
              data-ena-point-key={pointKey}
            >
              <title>{accessibleLabel}</title>
              {role === "primary" ? (
                <circle
                  r={(compact ? 3.4 : 4.6) * Math.max(0.5, pointScale)}
                  fill={PRIMARY_COLOR}
                  fillOpacity="0.54"
                  stroke="#174e49"
                  strokeWidth={compact ? 1 : 1.4}
                />
              ) : (
                <path
                  d={(() => {
                    const size = (compact ? 4 : 5.4) * Math.max(0.5, pointScale);
                    return `M 0 ${-size} L ${size} 0 L 0 ${size} L ${-size} 0 Z`;
                  })()}
                  fill="#ffffff"
                  fillOpacity="0.9"
                  stroke={SECONDARY_COLOR}
                  strokeWidth={compact ? 1.4 : 1.8}
                />
              )}
              {showUnitLabels ? (
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
        }))}
      </g> : null}
      <g className="ena-set-network-nodes">
        {comparison.nodes.map((node: ComparisonNode) => {
          const point = nodePoints.get(node.code);
          if (!point) return null;
          return (
            <g key={node.code} transform={`translate(${point.x} ${point.y})`}>
              <circle r={compact ? 8 : 12} className="ena-set-result-node" />
              {showLabels ? (
                <text y={compact ? -14 : -20} textAnchor="middle" className="ena-set-result-label">
                  {node.code}
                </text>
              ) : null}
            </g>
          );
        })}
      </g>
      {kind === "difference" || kind === "primary" ? <PrimaryMeanMarker point={primaryMean} compact={compact} /> : null}
      {kind === "difference" || kind === "secondary" ? <SecondaryMeanMarker point={secondaryMean} compact={compact} /> : null}
    </svg>
  );
}

export default function OpenEnaSetComparison(props: OpenEnaSetComparisonProps) {
  const { comparison, edgeThreshold, showNetworks } = props;
  const titleId = useId();
  const sharedScale = Math.max(
    0,
    ...comparison.edges.flatMap((edge) => [
      Math.abs(finiteNumber(edge.primaryWeight)),
      Math.abs(finiteNumber(edge.secondaryWeight)),
      Math.abs(finiteNumber(edge.signedDifference)),
    ]),
  );
  const threshold = boundedThreshold(edgeThreshold);
  const denominator = Math.max(sharedScale, 1e-12);
  const strongestDifferences = (showNetworks ? comparison.edges : [])
    .filter((edge) => Math.abs(finiteNumber(edge.signedDifference)) > 1e-12)
    .filter((edge) => Math.abs(finiteNumber(edge.signedDifference)) / denominator >= threshold)
    .toSorted((left, right) => Math.abs(finiteNumber(right.signedDifference)) - Math.abs(finiteNumber(left.signedDifference)))
    .slice(0, 10);

  return (
    <section
      className="open-ena-set-comparison"
      data-testid="open-ena-set-comparison"
      data-ena-dimensions="2"
      aria-labelledby={titleId}
    >
      <header className="ena-set-comparison-header">
        <div>
          <p className="ena-set-comparison-kicker">SHARED REFERENCE · 2D</p>
          <h2 id={titleId}>Primary / secondary network comparison</h2>
        </div>
        <p className="ena-set-reference-id">
          Reference geometry: <code>{comparison.referenceId}</code>
        </p>
      </header>

      <div className="ena-set-comparison-layout">
        <figure className="ena-set-main-plot">
          <header className="ena-set-plot-heading">
            <div>
              <h3>COMPARISON PLOT</h3>
              <p>{comparison.primary.name} − {comparison.secondary.name}</p>
            </div>
            <span>Shared absolute scale · {formatNumber(sharedScale)}</span>
          </header>
          <NetworkSvg {...props} kind="difference" sharedScale={sharedScale} />
          <figcaption>
            Signed edge weights are primary minus secondary in one fixed two-dimensional reference geometry.
          </figcaption>
        </figure>

        <div className="ena-set-side-plots">
          <figure>
            <header className="ena-set-plot-heading">
              <div>
                <h3>PRIMARY PLOT</h3>
                <p>{comparison.primary.name}</p>
              </div>
              <span>{comparison.primary.unitCount} analytic units</span>
            </header>
            <NetworkSvg {...props} kind="primary" sharedScale={sharedScale} />
          </figure>
          <figure>
            <header className="ena-set-plot-heading">
              <div>
                <h3>SECONDARY PLOT</h3>
                <p>{comparison.secondary.name}</p>
              </div>
              <span>{comparison.secondary.unitCount} analytic units</span>
            </header>
            <NetworkSvg {...props} kind="secondary" sharedScale={sharedScale} />
          </figure>
        </div>
      </div>

      <div className="ena-set-signed-legend" role="list" aria-label="Signed difference and mean-marker legend">
        <span role="listitem" data-ena-sign="positive">
          <i className="ena-set-key-positive" aria-hidden="true" />
          Solid positive (+), blue: {comparison.primary.name} stronger
        </span>
        <span role="listitem" data-ena-sign="negative">
          <i className="ena-set-key-negative" aria-hidden="true" />
          Solid negative (−), red: {comparison.secondary.name} stronger
        </span>
        <span role="listitem" data-ena-sign="equal">
          <i className="ena-set-key-equal" aria-hidden="true" />
          Equal: no signed difference
        </span>
        <span role="listitem">
          <i className="ena-set-key-primary-mean" aria-hidden="true" />
          Circle: primary mean
        </span>
        <span role="listitem">
          <i className="ena-set-key-secondary-mean" aria-hidden="true" />
          Diamond: secondary mean
        </span>
      </div>

      <div className="ena-set-difference-table" role="region" aria-label="Strongest signed edge differences" tabIndex={0}>
        <p>
          Threshold uses {(threshold * 100).toFixed(0)}% of the shared absolute edge scale ({formatNumber(sharedScale)}).
          Positive values are {comparison.primary.name} minus {comparison.secondary.name}; no significance is implied.
        </p>
        <table>
          <caption>Strongest signed edge differences</caption>
          <thead>
            <tr>
              <th scope="col">Connection</th>
              <th scope="col">Primary weight</th>
              <th scope="col">Secondary weight</th>
              <th scope="col">Signed difference</th>
              <th scope="col">Stronger set</th>
            </tr>
          </thead>
          <tbody>
            {strongestDifferences.length ? strongestDifferences.map((edge) => (
              <tr key={edge.name}>
                <th scope="row">{edge.name}</th>
                <td>{formatNumber(edge.primaryWeight)}</td>
                <td>{formatNumber(edge.secondaryWeight)}</td>
                <td data-ena-sign={edgeSign(edge)}>{formatNumber(edge.signedDifference, true)}</td>
                <td>
                  {edge.stronger === "primary"
                    ? comparison.primary.name
                    : edge.stronger === "secondary"
                      ? comparison.secondary.name
                      : "Equal"}
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={5}>No non-zero differences meet the current threshold.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
