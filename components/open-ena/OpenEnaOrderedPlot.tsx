import type { Ref } from "react";
import { codeColorFor, type OpenEnaCodeColors } from "@/lib/open-ena/plot-style";
import {
  buildOpenEnaOrderedPlotModel,
  buildOrderedEdgeGlyph,
  type OpenEnaOrderedNodeTotals,
  type OpenEnaOrderedPlotModel,
  type OpenEnaOrderedPlotScope,
} from "@/lib/open-ena/ordered-plot";
import type { OpenEnaConfig, OpenEnaResult } from "@/lib/open-ena/types";

const WIDTH = 920;
const MAIN_HEIGHT = 590;
const COMPACT_HEIGHT = 430;
const PAD_X = 62;
const PAD_Y = 52;

export interface OpenEnaOrderedPlotCopy {
  overallTitle: string;
  groupTitle: string;
  directedNetworkDescription: string;
  normalizedMeanWeight: string;
  rawAggregateCount: string;
  respondedToWith: string;
  selfConnection: string;
  visibleConnections: string;
  noVisibleConnections: string;
  sourceApexLegend: string;
  chevronLegend: string;
  selfDiscLegend: string;
  nodeSizeLabel: string;
  unitsLabel: string;
  groundSourceLabel: string;
  responseTargetLabel: string;
  directionLegendLabel: string;
  flippedLabel: string;
  visibleCellsLabel: string;
}

const DEFAULT_COPY: OpenEnaOrderedPlotCopy = {
  overallTitle: "Overall ordered network",
  groupTitle: "Ordered group mean network",
  directedNetworkDescription: "Directed ONA network; triangle apex is ground/source and triangle base is response/target.",
  normalizedMeanWeight: "normalized mean line weight",
  rawAggregateCount: "raw aggregate count",
  respondedToWith: "responded to {ground} with {response}",
  selfConnection: "self-connection",
  visibleConnections: "Visible directed connections",
  noVisibleConnections: "No directed connections pass the current display threshold.",
  sourceApexLegend: "Triangle apex = ground/source; base = response/target",
  chevronLegend: "Chevron = stronger direction; an exact tie marks both directions",
  selfDiscLegend: "Inner disc = self-connection",
  nodeSizeLabel: "Node size",
  unitsLabel: "units",
  groundSourceLabel: "ground/source",
  responseTargetLabel: "response/target",
  directionLegendLabel: "Ordered network direction legend",
  flippedLabel: "flipped",
  visibleCellsLabel: "visible directed cells",
};

export interface OpenEnaOrderedPlotProps {
  result: OpenEnaResult;
  config: OpenEnaConfig;
  scope: OpenEnaOrderedPlotScope;
  xDimension: string;
  yDimension: string;
  edgeThreshold: number;
  edgeScale: number;
  pointScale: number;
  textScale: number;
  plotZoom: number;
  flipX: boolean;
  flipY: boolean;
  showPoints: boolean;
  showNetworks: boolean;
  showLabels: boolean;
  showUnitLabels: boolean;
  showVariance: boolean;
  compact: boolean;
  codeColors?: OpenEnaCodeColors;
  nodeTotals?: OpenEnaOrderedNodeTotals;
  copy?: Partial<OpenEnaOrderedPlotCopy>;
  svgRef?: Ref<SVGSVGElement>;
}

type ScreenPoint = { x: number; y: number };

function bounded(value: number, minimum: number, maximum: number, fallback: number) {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

function screenPositions(
  model: OpenEnaOrderedPlotModel,
  height: number,
  zoom: number,
  flipX: boolean,
  flipY: boolean,
) {
  const values = [
    ...model.nodes.map((node) => ({ key: `node:${node.code}`, x: node.x, y: node.y })),
    ...model.points.map((point) => ({ key: `point:${point.key}`, x: point.x, y: point.y })),
  ];
  const maximumX = Math.max(1e-9, ...values.map((value) => Math.abs(value.x)));
  const maximumY = Math.max(1e-9, ...values.map((value) => Math.abs(value.y)));
  const scale = Math.min(
    (WIDTH - PAD_X * 2) / (maximumX * 2),
    (height - PAD_Y * 2) / (maximumY * 2),
  ) * bounded(zoom, 0.6, 2.4, 1);
  return new Map<string, ScreenPoint>(values.map((value) => [value.key, {
    x: WIDTH / 2 + value.x * scale * (flipX ? -1 : 1),
    y: height / 2 - value.y * scale * (flipY ? -1 : 1),
  }]));
}

function displayNumber(value: number) {
  if (value === 0) return "0";
  if (Math.abs(value) >= 1e6 || Math.abs(value) < 1e-4) return value.toExponential(4);
  return Number(value.toPrecision(6)).toString();
}

function edgeDescription(
  edge: OpenEnaOrderedPlotModel["edges"][number],
  copy: OpenEnaOrderedPlotCopy,
) {
  return [
    `${edge.ground} ${copy.groundSourceLabel} → ${edge.response} ${copy.responseTargetLabel}`,
    copy.respondedToWith.replace("{ground}", edge.ground).replace("{response}", edge.response),
    `${copy.normalizedMeanWeight} ${displayNumber(edge.normalizedMeanWeight)}`,
    `${copy.rawAggregateCount} ${displayNumber(edge.rawAggregateCount)}`,
    ...(edge.selfConnection ? [copy.selfConnection] : []),
  ].join(" · ");
}

function pointGroupIndex(result: OpenEnaResult, group: string | null) {
  if (group === null) return 0;
  const index = result.groups.findIndex((candidate) => candidate.name === group);
  return index < 0 ? 0 : index;
}

export default function OpenEnaOrderedPlot(props: OpenEnaOrderedPlotProps) {
  const copy = { ...DEFAULT_COPY, ...props.copy };
  const model = buildOpenEnaOrderedPlotModel({
    result: props.result,
    config: props.config,
    scope: props.scope,
    xDimension: props.xDimension,
    yDimension: props.yDimension,
    edgeThreshold: props.edgeThreshold,
    nodeTotals: props.nodeTotals,
  });
  const height = props.compact ? COMPACT_HEIGHT : MAIN_HEIGHT;
  const positions = screenPositions(model, height, props.plotZoom, props.flipX, props.flipY);
  const edgeScale = bounded(props.edgeScale, 0.1, 4, 1);
  const pointScale = bounded(props.pointScale, 0.5, 2, 1);
  const textScale = bounded(props.textScale, 0.5, 2, 1);
  const offDiagonalEdges = model.visibleEdges.filter((edge) => !edge.selfConnection);
  const selfEdges = new Map(model.visibleEdges
    .filter((edge) => edge.selfConnection)
    .map((edge) => [edge.ground, edge]));
  const title = props.scope.kind === "overall" ? copy.overallTitle : `${props.scope.name} · ${copy.groupTitle}`;
  const figureLabel = `${title}. ${copy.directedNetworkDescription}`;

  return (
    <div
      className={`open-ena-ordered-plot${props.compact ? " open-ena-ordered-plot-compact" : ""}`}
      data-testid="open-ena-ordered-plot"
      data-ona-scope={props.scope.kind === "overall" ? "overall" : `group:${props.scope.name}`}
      data-ona-node-size-definition={model.nodeSizeDefinition}
      data-ona-weight-definition={model.weightDefinition}
    >
      <svg
        ref={props.svgRef}
        viewBox={`0 0 ${WIDTH} ${height}`}
        role="img"
        aria-label={figureLabel}
        className="open-ena-ordered-svg"
        style={{ "--ona-text-scale": textScale } as React.CSSProperties}
      >
        <title>{title}</title>
        <desc>
          {copy.directedNetworkDescription} {model.points.length} {copy.unitsLabel}; {model.visibleEdges.length} {copy.visibleCellsLabel}. {copy.nodeSizeLabel}: {model.nodeSizeDefinition}.
        </desc>
        <rect width={WIDTH} height={height} className="ena-set-plot-background ona-plot-background" />
        <g className="ona-zero-axes" aria-hidden="true">
          <line x1={WIDTH / 2} y1={PAD_Y / 2} x2={WIDTH / 2} y2={height - PAD_Y / 2} />
          <line x1={PAD_X / 2} y1={height / 2} x2={WIDTH - PAD_X / 2} y2={height / 2} />
          <text x={WIDTH - 30} y={height / 2 - 10} textAnchor="end">
            {props.xDimension}{props.showVariance ? ` · ${(model.xVariance * 100).toFixed(1)}%` : ""}{props.flipX ? ` · ${copy.flippedLabel}` : ""}
          </text>
          <text x={WIDTH / 2 + 10} y={26}>
            {props.yDimension}{props.showVariance ? ` · ${(model.yVariance * 100).toFixed(1)}%` : ""}{props.flipY ? ` · ${copy.flippedLabel}` : ""}
          </text>
        </g>

        {props.showNetworks ? offDiagonalEdges.map((edge) => {
          const sourceNode = model.nodes[edge.groundIndex];
          const responseNode = model.nodes[edge.responseIndex];
          const source = positions.get(`node:${edge.ground}`);
          const target = positions.get(`node:${edge.response}`);
          if (!sourceNode || !responseNode || !source || !target) return null;
          const glyph = buildOrderedEdgeGlyph({
            source,
            target,
            sourceRadius: sourceNode.radius,
            targetRadius: responseNode.radius,
            relativeMagnitude: edge.relativeMagnitude,
            visualScale: edgeScale,
            // Reversing source/target reverses the normal, so the same lane
            // value places reciprocal triangles on opposite sides.
            lane: 1,
            showChevron: edge.chevron,
          });
          const label = edgeDescription(edge, copy);
          return (
            <g
              key={edge.name}
              className="ona-directed-edge"
              data-ona-ground={edge.ground}
              data-ona-response={edge.response}
            >
              <path
                d={glyph.trianglePath}
                data-ona-edge-glyph="broadcast-triangle"
                data-ona-ground={edge.ground}
                data-ona-response={edge.response}
                fill={model.scopeColor}
                fillOpacity={0.18 + edge.relativeMagnitude * 0.55}
                stroke={model.scopeColor}
                strokeOpacity={0.76}
                strokeWidth={Math.max(0.7, edgeScale)}
              >
                <title>{label}</title>
              </path>
              <path
                d={glyph.hitPath}
                data-ona-edge-hit-target="true"
                data-ona-ground={edge.ground}
                data-ona-response={edge.response}
                aria-hidden="true"
                focusable="false"
                fill="none"
                stroke="transparent"
                strokeWidth={18}
              >
                <title>{label}</title>
              </path>
              {glyph.chevronPath ? (
                <path
                  d={glyph.chevronPath}
                  data-ona-chevron={`${edge.ground}-to-${edge.response}`}
                  fill="none"
                  stroke="#17313a"
                  strokeWidth={2.2 * edgeScale}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pointerEvents="none"
                />
              ) : null}
            </g>
          );
        }) : null}

        {props.showPoints ? model.points.map((point) => {
          const screen = positions.get(`point:${point.key}`);
          if (!screen) return null;
          const groupIndex = pointGroupIndex(props.result, point.group);
          const group = props.result.groups[groupIndex];
          const size = 6.5 * pointScale;
          const label = `${point.unit}${point.group ? ` · ${point.group}` : ""}: ${props.xDimension} ${displayNumber(point.x)}, ${props.yDimension} ${displayNumber(point.y)}`;
          return (
            <g key={point.key} data-ona-unit-point="true" data-ona-point-shape={groupIndex % 2 === 0 ? "circle" : "square"}>
              <title>{label}</title>
              {groupIndex % 2 === 0 ? (
                <circle cx={screen.x} cy={screen.y} r={size} fill={group?.color ?? "#52636a"} stroke="#263740" strokeWidth={1.2} />
              ) : (
                <rect x={screen.x - size} y={screen.y - size} width={size * 2} height={size * 2} rx={1.5} fill={group?.color ?? "#52636a"} stroke="#263740" strokeWidth={1.2} />
              )}
              {props.showUnitLabels ? <text x={screen.x + size + 3} y={screen.y - size - 2} className="ena-set-unit-label">{point.unit}</text> : null}
            </g>
          );
        }) : null}

        {model.nodes.map((node) => {
          const screen = positions.get(`node:${node.code}`);
          if (!screen) return null;
          const self = selfEdges.get(node.code);
          const nodeColor = codeColorFor(props.codeColors, node.code);
          const selfRadius = self
            ? Math.min(
              node.radius * 0.9,
              Math.max(1.5, node.radius * (0.18 + Math.sqrt(self.relativeMagnitude) * 0.42) * Math.sqrt(edgeScale)),
            )
            : 0;
          const selfLabel = self ? edgeDescription(self, copy) : null;
          return (
            <g key={node.code} transform={`translate(${screen.x} ${screen.y})`} className="ona-code-node">
              <circle
                r={node.radius}
                data-ena-code={node.code}
                data-ona-response-total={node.responseTotal}
                fill="#ffffff"
                stroke={nodeColor}
                strokeWidth={5}
              >
                <title>{`${node.code} · ${copy.nodeSizeLabel}: ${displayNumber(node.responseTotal)} (${model.nodeSizeDefinition})`}</title>
              </circle>
              {props.showNetworks && self && selfLabel ? (
                <circle
                  r={selfRadius}
                  data-ona-self-loop={node.code}
                  fill={model.scopeColor}
                  fillOpacity={0.35 + self.relativeMagnitude * 0.6}
                  stroke="#17313a"
                  strokeWidth={1}
                >
                  <title>{`${node.code} ↻ ${node.code} · ${selfLabel}`}</title>
                </circle>
              ) : null}
              {props.showLabels ? <text y={-node.radius - 9} textAnchor="middle" className="ena-set-result-label">{node.code}</text> : null}
            </g>
          );
        })}
      </svg>

      <div className="ona-direction-legend" aria-label={copy.directionLegendLabel}>
        <span>{copy.sourceApexLegend}</span>
        <span>{copy.chevronLegend}</span>
        <span>{copy.selfDiscLegend}</span>
        <span>{copy.nodeSizeLabel}: {model.nodeSizeDefinition}</span>
      </div>
      <details className="ona-visible-edge-summary">
        <summary>{copy.visibleConnections}</summary>
        {model.visibleEdges.length > 0 ? (
          <ol aria-label={copy.visibleConnections}>
            {model.visibleEdges
              .toSorted((left, right) => right.normalizedMeanWeight - left.normalizedMeanWeight)
              .map((edge) => <li key={edge.name}>{edgeDescription(edge, copy)}</li>)}
          </ol>
        ) : <p>{copy.noVisibleConnections}</p>}
      </details>
    </div>
  );
}
