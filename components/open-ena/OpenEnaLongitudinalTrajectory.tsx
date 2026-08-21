import { useId, type Ref } from "react";
import {
  LONGITUDINAL_INDIVIDUAL_MARK_LIMIT,
  type OpenEnaLongitudinalEntityPeriod,
  type OpenEnaLongitudinalView,
} from "@/lib/open-ena/longitudinal";
import {
  JENA_GROUP_COLORS,
  codeColorFor,
  type OpenEnaCodeColors,
} from "@/lib/open-ena/plot-style";

export interface OpenEnaLongitudinalTrajectoryCopy {
  title: string;
  description: string;
  figureAriaLabel: string;
  geometryView: string;
  descriptive: string;
  noEndpointTests: string;
  available: string;
  complete: string;
  availableCount: string;
  completeCount: string;
  includedCount: string;
  excludedCount: string;
  group: string;
  period: string;
  showIndividualPaths: string;
  showGroupPaths: string;
  diagnosticsCaption: string;
  nUsed: string;
  nExcluded: string;
  centroid: string;
  status: string;
  gap: string;
  observed: string;
  noContributorOverlap: string;
  gapRule: string;
  legendAriaLabel: string;
  largerCentroidMarker: string;
  timeDirectionArrow: string;
  flipped: string;
  firstAxis: string;
  secondAxis: string;
  circle: string;
  diamond: string;
  triangle: string;
  square: string;
  cross: string;
  hexagon: string;
  solid: string;
  dashed: string;
  dotted: string;
  dashDot: string;
  shortDashed: string;
  longShortDashed: string;
  marker: string;
  path: string;
  rowsTruncated: string;
  individualMarksSampled: string;
}

export interface OpenEnaLongitudinalTrajectoryProps {
  trajectory: OpenEnaLongitudinalView;
  codeColors?: OpenEnaCodeColors;
  showIndividualPaths: boolean;
  showGroupCentroidPaths: boolean;
  showPoints: boolean;
  showLabels: boolean;
  showVariance: boolean;
  pointScale: number;
  plotZoom: number;
  flipX: boolean;
  flipY: boolean;
  copy?: Partial<OpenEnaLongitudinalTrajectoryCopy>;
  svgRef?: Ref<SVGSVGElement>;
}

type CoordinateExtent = OpenEnaLongitudinalView["coordinateExtent"];
type PlotPoint = { x: number; y: number };

type GroupMarkerShape = "circle" | "diamond" | "triangle" | "square" | "cross" | "hexagon";

const WIDTH = 920;
const HEIGHT = 590;
const PAD_X = 74;
const PAD_Y = 60;
const ZERO_TOLERANCE = 1e-12;
const MAX_LONGITUDINAL_ENTITY_PERIOD_MARKS = LONGITUDINAL_INDIVIDUAL_MARK_LIMIT;
const MAX_LONGITUDINAL_INDIVIDUAL_SEGMENTS = LONGITUDINAL_INDIVIDUAL_MARK_LIMIT;
const MAX_LONGITUDINAL_NODES = 200;
const MAX_LONGITUDINAL_DIAGNOSTIC_ROWS = 600;

const DEFAULT_COPY: OpenEnaLongitudinalTrajectoryCopy = {
  title: "Group-centroid longitudinal trajectory",
  description: "This plot uses fixed two-dimensional jENA geometry. Group-period centroids and individual paths are descriptive overlays on the selected axes.",
  figureAriaLabel: "Group-centroid trajectory plot. Scroll horizontally on small screens.",
  geometryView: "Trajectory geometry view",
  descriptive: "Descriptive only",
  noEndpointTests: "No endpoint Mann–Whitney or Welch test is applied to repeated trajectory periods.",
  available: "Available cohort",
  complete: "Complete cohort",
  availableCount: "Available entities",
  completeCount: "Complete entities",
  includedCount: "Included entities",
  excludedCount: "Excluded entities",
  group: "Group",
  period: "Period",
  showIndividualPaths: "Individual paths",
  showGroupPaths: "Group-centroid paths",
  diagnosticsCaption: "Group-by-period centroid diagnostics",
  nUsed: "n used",
  nExcluded: "n excluded",
  centroid: "Centroid",
  status: "Status",
  gap: "Gap",
  observed: "Observed",
  noContributorOverlap: "No shared contributors",
  gapRule: "No segment bridges a missing period or an adjacent transition with zero shared repeated entities.",
  legendAriaLabel: "Longitudinal trajectory legend",
  largerCentroidMarker: "Larger outlined marker = group-period centroid",
  timeDirectionArrow: "Arrow = selected period direction",
  flipped: "flipped",
  firstAxis: "Dimension 1",
  secondAxis: "Dimension 2",
  circle: "circle",
  diamond: "diamond",
  triangle: "triangle",
  square: "square",
  cross: "cross",
  hexagon: "hexagon",
  solid: "solid",
  dashed: "dashed",
  dotted: "dotted",
  dashDot: "dash-dot",
  shortDashed: "short-dashed",
  longShortDashed: "long-short-dashed",
  marker: "marker",
  path: "path",
  rowsTruncated: "Additional period rows are omitted from this on-screen table; use the longitudinal export for the complete diagnostics.",
  individualMarksSampled: "Individual plot marks are sampled: {pointsShown} of {pointsTotal} points and {segmentsShown} of {segmentsTotal} segments are shown. Group-centroid paths remain complete.",
};

const GROUP_ENCODINGS = [
  { markerShape: "circle", markerCopy: "circle", lineStyle: "solid", lineCopy: "solid" },
  { markerShape: "diamond", markerCopy: "diamond", lineStyle: "solid", lineCopy: "solid" },
  { markerShape: "triangle", markerCopy: "triangle", lineStyle: "solid", lineCopy: "solid" },
  { markerShape: "square", markerCopy: "square", lineStyle: "solid", lineCopy: "solid" },
  { markerShape: "cross", markerCopy: "cross", lineStyle: "solid", lineCopy: "solid" },
  { markerShape: "hexagon", markerCopy: "hexagon", lineStyle: "solid", lineCopy: "solid" },
] as const satisfies ReadonlyArray<{
  markerShape: GroupMarkerShape;
  markerCopy: keyof OpenEnaLongitudinalTrajectoryCopy;
  lineStyle: string;
  lineCopy: keyof OpenEnaLongitudinalTrajectoryCopy;
}>;

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function bounded(value: number, minimum: number, maximum: number, fallback: number) {
  return finiteNumber(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

function boundedCount(value: unknown) {
  return finiteNumber(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function safeText(value: unknown, maximumLength = 72, fallback = "—") {
  const normalized = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (!normalized) return fallback;
  return normalized.length > maximumLength ? `${normalized.slice(0, maximumLength - 1)}…` : normalized;
}

function samplingDisclosure(
  template: string,
  values: { pointsShown: number; pointsTotal: number; segmentsShown: number; segmentsTotal: number },
) {
  return template.replace(
    /\{(pointsShown|pointsTotal|segmentsShown|segmentsTotal)\}/gu,
    (_, key: keyof typeof values) => String(values[key]),
  );
}

function validExtent(value: CoordinateExtent | undefined): value is CoordinateExtent {
  return Boolean(
    value
      && finiteNumber(value.minX)
      && finiteNumber(value.maxX)
      && finiteNumber(value.minY)
      && finiteNumber(value.maxY)
      && value.minX <= value.maxX
      && value.minY <= value.maxY,
  );
}

function deriveSafeExtent(view: OpenEnaLongitudinalView): CoordinateExtent {
  if (validExtent(view.coordinateExtent)) return view.coordinateExtent;
  const points = [
    ...view.nodes,
    ...view.entityPeriods,
    ...view.groups.flatMap((group) => group.periods.flatMap((period) => period.centroid ? [period.centroid] : [])),
  ].filter((point) => finiteNumber(point.x) && finiteNumber(point.y));
  if (!points.length) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function buildProjector(
  extent: CoordinateExtent,
  plotZoom: number,
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
    (WIDTH - PAD_X * 2) / (rangeX * 1.12),
    (HEIGHT - PAD_Y * 2) / (rangeY * 1.12),
  ) * bounded(plotZoom, 0.55, 2.4, 1);

  return (xValue: unknown, yValue: unknown): PlotPoint => {
    const x = finiteNumber(xValue) ? xValue : centerX;
    const y = finiteNumber(yValue) ? yValue : centerY;
    return {
      x: WIDTH / 2 + (x - centerX) * scale * (flipX ? -1 : 1),
      y: HEIGHT / 2 - (y - centerY) * scale * (flipY ? -1 : 1),
    };
  };
}

function deterministicStratifiedSample<T>(
  items: readonly T[],
  maximum: number,
  stratum: (item: T) => string,
) {
  if (items.length <= maximum) return items.map((item, sourceIndex) => ({ item, sourceIndex }));
  const buckets = new Map<string, Array<{ item: T; sourceIndex: number }>>();
  items.forEach((item, sourceIndex) => {
    const key = stratum(item);
    const bucket = buckets.get(key);
    if (bucket) bucket.push({ item, sourceIndex });
    else buckets.set(key, [{ item, sourceIndex }]);
  });
  const entries = [...buckets.values()];
  const quotas = entries.map(() => 0);
  let remaining = maximum;
  while (remaining > 0) {
    let assigned = false;
    entries.forEach((bucket, index) => {
      if (remaining > 0 && quotas[index] < bucket.length) {
        quotas[index] += 1;
        remaining -= 1;
        assigned = true;
      }
    });
    if (!assigned) break;
  }
  return entries.flatMap((bucket, index) => {
    const quota = quotas[index];
    if (quota <= 0) return [];
    if (quota >= bucket.length) return bucket;
    return Array.from({ length: quota }, (_, sampleIndex) => (
      bucket[Math.round(sampleIndex * (bucket.length - 1) / Math.max(1, quota - 1))]
    ));
  }).sort((left, right) => left.sourceIndex - right.sourceIndex);
}

function getEncoding(index: number) {
  return GROUP_ENCODINGS[Math.max(0, Math.trunc(index)) % GROUP_ENCODINGS.length];
}

function MarkerGlyph({
  shape,
  x,
  y,
  size,
  fill,
  stroke,
  strokeWidth,
}: {
  shape: GroupMarkerShape;
  x: number;
  y: number;
  size: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
}) {
  const common = { fill, stroke, strokeWidth, vectorEffect: "non-scaling-stroke" as const };
  if (shape === "circle") return <circle cx={x} cy={y} r={size} {...common} />;
  if (shape === "diamond") return (
    <path d={`M ${x} ${y - size} L ${x + size} ${y} L ${x} ${y + size} L ${x - size} ${y} Z`} {...common} />
  );
  if (shape === "triangle") return (
    <path d={`M ${x} ${y - size} L ${x + size * 0.92} ${y + size * 0.72} L ${x - size * 0.92} ${y + size * 0.72} Z`} {...common} />
  );
  if (shape === "square") return (
    <rect x={x - size} y={y - size} width={size * 2} height={size * 2} rx={Math.max(1, size * 0.12)} {...common} />
  );
  if (shape === "cross") {
    const arm = size * 0.34;
    return (
      <path
        d={`M ${x - arm} ${y - size} L ${x + arm} ${y - size} L ${x + arm} ${y - arm} L ${x + size} ${y - arm} L ${x + size} ${y + arm} L ${x + arm} ${y + arm} L ${x + arm} ${y + size} L ${x - arm} ${y + size} L ${x - arm} ${y + arm} L ${x - size} ${y + arm} L ${x - size} ${y - arm} L ${x - arm} ${y - arm} Z`}
        {...common}
      />
    );
  }
  return (
    <path
      d={`M ${x} ${y - size} L ${x + size * 0.87} ${y - size * 0.5} L ${x + size * 0.87} ${y + size * 0.5} L ${x} ${y + size} L ${x - size * 0.87} ${y + size * 0.5} L ${x - size * 0.87} ${y - size * 0.5} Z`}
      {...common}
    />
  );
}

function validEntityPeriods(periods: readonly OpenEnaLongitudinalEntityPeriod[]) {
  return periods
    .map((period, sourceIndex) => ({ period, sourceIndex }))
    .filter(({ period }) => (
      finiteNumber(period.x)
      && finiteNumber(period.y)
      && finiteNumber(period.timeIndex)
    ));
}

function individualSegments(periods: readonly OpenEnaLongitudinalEntityPeriod[]) {
  const byEntity = new Map<string, Array<{ period: OpenEnaLongitudinalEntityPeriod; sourceIndex: number }>>();
  validEntityPeriods(periods).forEach((entry) => {
    const identity = String(entry.period.entityId ?? "");
    const existing = byEntity.get(identity);
    if (existing) existing.push(entry);
    else byEntity.set(identity, [entry]);
  });

  const segments: Array<{
    from: OpenEnaLongitudinalEntityPeriod;
    to: OpenEnaLongitudinalEntityPeriod;
    sourceIndex: number;
  }> = [];
  byEntity.forEach((entries) => {
    entries.sort((left, right) => (
      left.period.timeIndex - right.period.timeIndex || left.sourceIndex - right.sourceIndex
    ));
    for (let index = 1; index < entries.length; index += 1) {
      const from = entries[index - 1];
      const to = entries[index];
      if (
        to.period.timeIndex === from.period.timeIndex + 1
        && to.period.group === from.period.group
      ) {
        segments.push({ from: from.period, to: to.period, sourceIndex: from.sourceIndex });
      }
    }
  });
  return segments.sort((left, right) => left.sourceIndex - right.sourceIndex);
}

function varianceForAxis(view: OpenEnaLongitudinalView, axis: string) {
  const variance = view.geometry?.variance?.[axis];
  return finiteNumber(variance) && variance >= 0 ? variance : null;
}

function formatVariance(value: number | null) {
  return value === null ? null : `${(value * 100).toFixed(1)}%`;
}

function formatCoordinate(point: PlotPoint | null) {
  if (!point || !finiteNumber(point.x) || !finiteNumber(point.y)) return "—";
  return `${point.x.toFixed(3)}, ${point.y.toFixed(3)}`;
}

export default function OpenEnaLongitudinalTrajectory({
  trajectory,
  codeColors,
  showIndividualPaths,
  showGroupCentroidPaths,
  showPoints,
  showLabels,
  showVariance,
  pointScale,
  plotZoom,
  flipX,
  flipY,
  copy,
  svgRef,
}: OpenEnaLongitudinalTrajectoryProps) {
  const strings = {
    ...DEFAULT_COPY,
    ...copy,
    nUsed: copy?.nUsed ?? copy?.includedCount ?? DEFAULT_COPY.nUsed,
    nExcluded: copy?.nExcluded ?? copy?.excludedCount ?? DEFAULT_COPY.nExcluded,
  };
  const view = trajectory;
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/gu, "") || "ena-longitudinal";
  const titleId = `${reactId}-title`;
  const descriptionId = `${reactId}-description`;
  const clipId = `${reactId}-clip`;
  const extent = deriveSafeExtent(view);
  const project = buildProjector(extent, plotZoom, flipX, flipY);
  const origin = project(0, 0);
  const groupLookup = new Map(view.groups.map((group, index) => [group.name, index]));
  const finitePeriods = validEntityPeriods(view.entityPeriods);
  const sampledPeriods = deterministicStratifiedSample(
    finitePeriods,
    MAX_LONGITUDINAL_ENTITY_PERIOD_MARKS,
    (entry) => entry.period.group,
  );
  const allIndividualSegments = individualSegments(view.entityPeriods);
  const sampledIndividualSegments = deterministicStratifiedSample(
    allIndividualSegments,
    MAX_LONGITUDINAL_INDIVIDUAL_SEGMENTS,
    (segment) => segment.from.group,
  );
  const centroidPeriods = view.groups.flatMap((group, groupIndex) => (
    group.periods
      .filter((period) => period.centroid && finiteNumber(period.centroid.x) && finiteNumber(period.centroid.y))
      .map((period, periodIndex) => ({ group, groupIndex, period, periodIndex }))
  ));
  const renderedCentroidPeriods = centroidPeriods.map((item, sourceIndex) => ({ item, sourceIndex }));
  const centroidSegments = view.groups.flatMap((group, groupIndex) => (
    group.segments
      .filter((segment) => (
        segment.toTimeIndex === segment.fromTimeIndex + 1
        && finiteNumber(segment.x1)
        && finiteNumber(segment.y1)
        && finiteNumber(segment.x2)
        && finiteNumber(segment.y2)
      ))
      .map((segment, segmentIndex) => ({ group, groupIndex, segment, segmentIndex }))
  ));
  const renderedCentroidSegments = centroidSegments.map((item, sourceIndex) => ({ item, sourceIndex }));
  const individualMarksAreSampled = (
    (showPoints && sampledPeriods.length < finitePeriods.length)
    || (showIndividualPaths && sampledIndividualSegments.length < allIndividualSegments.length)
  );
  const individualSamplingDisclosure = samplingDisclosure(strings.individualMarksSampled, {
    pointsShown: showPoints ? sampledPeriods.length : 0,
    pointsTotal: showPoints ? finitePeriods.length : 0,
    segmentsShown: showIndividualPaths ? sampledIndividualSegments.length : 0,
    segmentsTotal: showIndividualPaths ? allIndividualSegments.length : 0,
  });
  const svgDescription = individualMarksAreSampled
    ? `${strings.description} ${individualSamplingDisclosure}`
    : strings.description;
  const diagnosticRows = view.periodDiagnostics.length
    ? view.periodDiagnostics
    : view.groups.flatMap((group) => group.periods);
  const visibleDiagnosticRows = diagnosticRows.slice(0, MAX_LONGITUDINAL_DIAGNOSTIC_ROWS);
  const nodeMarks = view.nodes
    .filter((node) => finiteNumber(node.x) && finiteNumber(node.y))
    .slice(0, MAX_LONGITUDINAL_NODES);
  const pointRadius = bounded(pointScale, 0.5, 2.4, 1) * 4.2;
  const cohortLabel = view.cohortPolicy === "complete" ? strings.complete : strings.available;
  const xAxis = safeText(view.axes?.[0], 48, strings.firstAxis);
  const yAxis = safeText(view.axes?.[1], 48, strings.secondAxis);
  const xVariance = showVariance ? formatVariance(varianceForAxis(view, view.axes?.[0])) : null;
  const yVariance = showVariance ? formatVariance(varianceForAxis(view, view.axes?.[1])) : null;
  const xAxisLabel = [xAxis, xVariance, flipX ? strings.flipped : null].filter(Boolean).join(" · ");
  const yAxisLabel = [yAxis, yVariance, flipY ? strings.flipped : null].filter(Boolean).join(" · ");

  return (
    <figure
      className="open-ena-longitudinal-trajectory"
      data-testid="open-ena-longitudinal-trajectory"
      data-ena-dimensions="2"
      data-ena-flip-x={String(flipX)}
      data-ena-flip-y={String(flipY)}
      data-ena-plot-zoom={String(bounded(plotZoom, 0.55, 2.4, 1))}
      data-ena-coordinate-extent-source="fixed-longitudinal-view"
      data-ena-entity-marks-total={String(view.entityPeriods.length)}
      data-ena-entity-marks-shown={String(showPoints ? sampledPeriods.length : 0)}
      data-ena-individual-segments-total={String(showIndividualPaths ? allIndividualSegments.length : 0)}
      data-ena-individual-segments-shown={String(showIndividualPaths ? sampledIndividualSegments.length : 0)}
      data-ena-centroid-marks-total={String(centroidPeriods.length)}
      data-ena-centroid-marks-shown={String(showGroupCentroidPaths ? renderedCentroidPeriods.length : 0)}
      data-ena-centroid-segments-total={String(centroidSegments.length)}
      data-ena-centroid-segments-shown={String(showGroupCentroidPaths ? renderedCentroidSegments.length : 0)}
      tabIndex={0}
      aria-label={strings.figureAriaLabel}
    >
      <figcaption className="ena-longitudinal-heading">
        <span>{strings.geometryView}</span>
        <h3>{strings.title}</h3>
        <p>{strings.description}</p>
        <div className="ena-longitudinal-badges" aria-label={`${cohortLabel}. ${strings.descriptive}.`}>
          <strong>{cohortLabel}</strong>
          <strong>{strings.descriptive}</strong>
        </div>
      </figcaption>

      <dl className="ena-longitudinal-counts">
        <div><dt>{strings.availableCount}</dt><dd>{boundedCount(view.availableEntityCount)}</dd></div>
        <div><dt>{strings.completeCount}</dt><dd>{boundedCount(view.completeEntityCount)}</dd></div>
        <div><dt>{strings.includedCount}</dt><dd>{boundedCount(view.includedEntityCount)}</dd></div>
      </dl>

      <div className="ena-longitudinal-svg-wrap">
        <svg
          ref={svgRef}
          className="open-ena-longitudinal-svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-labelledby={`${titleId} ${descriptionId}`}
          data-ena-individual-paths={String(showIndividualPaths)}
          data-ena-group-centroid-paths={String(showGroupCentroidPaths)}
        >
          <title id={titleId}>{strings.title}</title>
          <desc id={descriptionId}>{svgDescription}</desc>
          <metadata data-ena-sampling-strategy="deterministic-stratified-by-group">
            {JSON.stringify({
              individualPoints: {
                total: showPoints ? finitePeriods.length : 0,
                shown: showPoints ? sampledPeriods.length : 0,
              },
              individualSegments: {
                total: showIndividualPaths ? allIndividualSegments.length : 0,
                shown: showIndividualPaths ? sampledIndividualSegments.length : 0,
              },
              groupCentroidPathsComplete: true,
            })}
          </metadata>
          <defs>
            <clipPath id={clipId}>
              <rect x={PAD_X} y={PAD_Y} width={WIDTH - PAD_X * 2} height={HEIGHT - PAD_Y * 2} rx="12" />
            </clipPath>
            {showGroupCentroidPaths ? view.groups.map((group, groupIndex) => {
              const color = JENA_GROUP_COLORS[groupIndex % JENA_GROUP_COLORS.length];
              return (
                <marker
                  key={`arrow-${groupIndex}`}
                  id={`${reactId}-arrow-${groupIndex}`}
                  viewBox="0 0 10 10"
                  refX="8.5"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 Z" fill={color} />
                </marker>
              );
            }) : null}
          </defs>
          <rect width={WIDTH} height={HEIGHT} rx="18" className="ena-longitudinal-background" />
          <g clipPath={`url(#${clipId})`} aria-hidden="true">
            <line x1={PAD_X} y1={origin.y} x2={WIDTH - PAD_X} y2={origin.y} className="ena-longitudinal-axis" />
            <line x1={origin.x} y1={PAD_Y} x2={origin.x} y2={HEIGHT - PAD_Y} className="ena-longitudinal-axis" />

            {showIndividualPaths && sampledIndividualSegments.map(({ item: itemSegment, sourceIndex }) => {
              const { from, to } = itemSegment;
              const groupIndex = groupLookup.get(from.group) ?? 0;
              const encoding = getEncoding(groupIndex);
              const color = JENA_GROUP_COLORS[groupIndex % JENA_GROUP_COLORS.length];
              const fromPoint = project(from.x, from.y);
              const toPoint = project(to.x, to.y);
              return (
                <line
                  key={`individual-segment-${sourceIndex}`}
                  className="ena-individual-trajectory-path"
                  x1={fromPoint.x}
                  y1={fromPoint.y}
                  x2={toPoint.x}
                  y2={toPoint.y}
                  stroke={color}
                  data-ena-group-index={groupIndex}
                  data-ena-group-shape={encoding.markerShape}
                  data-ena-line-style={encoding.lineStyle}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}

            {showGroupCentroidPaths && renderedCentroidSegments.map(({ item: entry, sourceIndex }) => {
              const { groupIndex, segment } = entry;
              const encoding = getEncoding(groupIndex);
              const color = JENA_GROUP_COLORS[groupIndex % JENA_GROUP_COLORS.length];
              const from = project(segment.x1, segment.y1);
              const to = project(segment.x2, segment.y2);
              return (
                <line
                  key={`centroid-segment-${sourceIndex}`}
                  className="ena-group-centroid-path"
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={color}
                  markerEnd={`url(#${reactId}-arrow-${groupIndex})`}
                  data-ena-group-index={groupIndex}
                  data-ena-group-shape={encoding.markerShape}
                  data-ena-line-style={encoding.lineStyle}
                  data-ena-from-time={safeText(segment.fromTime, 48)}
                  data-ena-to-time={safeText(segment.toTime, 48)}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}

            {showPoints && sampledPeriods.map(({ item: entry, sourceIndex }) => {
              const { period } = entry;
              const groupIndex = groupLookup.get(period.group) ?? 0;
              const encoding = getEncoding(groupIndex);
              const color = JENA_GROUP_COLORS[groupIndex % JENA_GROUP_COLORS.length];
              const point = project(period.x, period.y);
              return (
                <g
                  key={`individual-point-${sourceIndex}`}
                  data-ena-individual-point="true"
                  data-ena-group-index={groupIndex}
                  data-ena-group-shape={encoding.markerShape}
                  aria-label={`${strings.showIndividualPaths}, ${safeText(period.group, 48)}, ${safeText(period.time, 48)}`}
                >
                  <MarkerGlyph
                    shape={encoding.markerShape}
                    x={point.x}
                    y={point.y}
                    size={pointRadius}
                    fill={color}
                    stroke="#ffffff"
                    strokeWidth={1.4}
                  />
                </g>
              );
            })}

            {showGroupCentroidPaths && renderedCentroidPeriods.map(({ item: entry, sourceIndex }) => {
              const { groupIndex, period } = entry;
              if (!period.centroid) return null;
              const encoding = getEncoding(groupIndex);
              const color = JENA_GROUP_COLORS[groupIndex % JENA_GROUP_COLORS.length];
              const point = project(period.centroid.x, period.centroid.y);
              const groupName = safeText(period.group, 48);
              const timeName = safeText(period.time, 48);
              return (
                <g
                  key={`centroid-point-${sourceIndex}`}
                  data-ena-group-centroid="true"
                  data-ena-group-index={groupIndex}
                  data-ena-group-shape={encoding.markerShape}
                  aria-label={`${groupName}, ${timeName}, ${strings.centroid}`}
                >
                  <MarkerGlyph
                    shape={encoding.markerShape}
                    x={point.x}
                    y={point.y}
                    size={pointRadius * 2.15}
                    fill="#ffffff"
                    stroke={color}
                    strokeWidth={3}
                  />
                  <MarkerGlyph
                    shape={encoding.markerShape}
                    x={point.x}
                    y={point.y}
                    size={pointRadius * 1.1}
                    fill={color}
                    stroke="#ffffff"
                    strokeWidth={1}
                  />
                  {showLabels ? (
                    <text x={point.x + 12} y={point.y - 12} className="ena-longitudinal-period-label">
                      {timeName}
                    </text>
                  ) : null}
                </g>
              );
            })}

            {nodeMarks.map((node, nodeIndex) => {
              const point = project(node.x, node.y);
              const nodeColor = codeColorFor(codeColors, node.code);
              return (
                <g key={`node-${nodeIndex}`} className="ena-longitudinal-node">
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="10"
                    fill="#ffffff"
                    stroke={nodeColor}
                    style={{ fill: "#ffffff", stroke: nodeColor }}
                  />
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="3.2"
                    data-ena-code={node.code}
                    fill={nodeColor}
                    stroke={nodeColor}
                    style={{ fill: nodeColor, stroke: nodeColor }}
                  />
                  {showLabels ? (
                    <text x={point.x} y={point.y - 17} textAnchor="middle">{safeText(node.code, 64)}</text>
                  ) : null}
                </g>
              );
            })}
          </g>
          <text x={WIDTH - PAD_X} y={HEIGHT - 22} textAnchor="end" className="ena-longitudinal-axis-label">
            {xAxisLabel}
          </text>
          <text
            x="22"
            y={PAD_Y}
            textAnchor="start"
            transform={`rotate(-90 22 ${PAD_Y})`}
            className="ena-longitudinal-axis-label"
          >
            {yAxisLabel}
          </text>
        </svg>
      </div>

      <ul className="ena-longitudinal-legend" aria-label={strings.legendAriaLabel}>
        {view.groups.map((group, groupIndex) => {
          const encoding = getEncoding(groupIndex);
          return (
            <li key={`legend-${groupIndex}`}>
              <span
                className="ena-longitudinal-legend-swatch"
                data-shape={encoding.markerShape}
                data-line-style={encoding.lineStyle}
                data-ena-group-shape={encoding.markerShape}
                data-ena-line-style={encoding.lineStyle}
                style={{ color: JENA_GROUP_COLORS[groupIndex % JENA_GROUP_COLORS.length] }}
                aria-hidden="true"
              />
              <span>
                {safeText(group.name, 64)}: {strings[encoding.markerCopy]} {strings.marker}
                {showIndividualPaths || showGroupCentroidPaths ? `, ${strings[encoding.lineCopy]} ${strings.path}` : ""}
              </span>
            </li>
          );
        })}
        {showGroupCentroidPaths ? <li>{strings.largerCentroidMarker}</li> : null}
        {showGroupCentroidPaths ? <li>{strings.timeDirectionArrow}</li> : null}
      </ul>

      <p className="ena-longitudinal-gap-note">{strings.gapRule}</p>
      {individualMarksAreSampled ? (
        <p className="ena-longitudinal-table-note" role="status">{individualSamplingDisclosure}</p>
      ) : null}
      <p className="ena-longitudinal-inference-note">
        <strong>{strings.descriptive}.</strong> {strings.noEndpointTests}
      </p>

      <div className="ena-longitudinal-table-wrap">
        <table className="ena-longitudinal-table">
          <caption>{strings.diagnosticsCaption}</caption>
          <thead>
            <tr>
              <th scope="col">{strings.group} · {strings.period}</th>
              <th scope="col">{strings.nUsed}</th>
              <th scope="col">{strings.nExcluded}</th>
              <th scope="col">{strings.status}</th>
              <th scope="col">{strings.centroid}</th>
            </tr>
          </thead>
          <tbody>
            {visibleDiagnosticRows.map((period, rowIndex) => {
              const hasCentroid = Boolean(
                period.centroid
                && finiteNumber(period.centroid.x)
                && finiteNumber(period.centroid.y),
              );
              return (
                <tr key={`period-row-${rowIndex}`} data-period-index={boundedCount(period.timeIndex)}>
                  <th scope="row">{safeText(period.group, 48)} · {safeText(period.time, 48)}</th>
                  <td>{boundedCount(period.nUsed)}</td>
                  <td>{boundedCount(period.nExcluded)}</td>
                  <td>{period.continuityStatus === "no-contributor-overlap"
                    ? strings.noContributorOverlap
                    : hasCentroid ? strings.observed : strings.gap}</td>
                  <td>{formatCoordinate(period.centroid)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {diagnosticRows.length > visibleDiagnosticRows.length ? (
        <p className="ena-longitudinal-table-note">{strings.rowsTruncated}</p>
      ) : null}
    </figure>
  );
}
