import { useState } from "react";
import { nativePlotGroupSettingsV3, nativePlotSummaryGroupsV3 } from "@/lib/open-ena/bound-presentation-v3";
import type { OpenEnaPlotResult } from "@/lib/open-ena/bound-presentation-v3";
import type { Row } from "jena-js";
import type { OpenEnaCopy } from "@/lib/open-ena-i18n";
import type {
  OpenEnaNodeDimensionPosition,
  OpenEnaNodeLayoutPositions,
} from "@/lib/open-ena/node-layout";
import {
  openEnaRenderedCodeIsVisible, openEnaRenderedCodeLabel,
  openEnaRenderedEdgeIsVisible,
  type OpenEnaCodeGraphPresentation,
} from "@/lib/open-ena/ordered-plot";
import { codeColorFor, type OpenEnaCodeColors } from "@/lib/open-ena/plot-style";
import type { CameraPreset, GroupNetwork, OpenEnaResult, OpenEnaView } from "@/lib/open-ena/types";
import OpenEnaSvgDraggableNode from "./OpenEnaSvgDraggableNode";
import { useSvgTrajectoryLabels, type SvgTrajectoryLabel } from "./useSvgTrajectoryLabels";

interface OpenEnaPlotProps extends OpenEnaCodeGraphPresentation {
  result: OpenEnaPlotResult;
  codeColors?: OpenEnaCodeColors;
  groupColumn: string | null;
  view: OpenEnaView;
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
  textScale?: number;
  plotZoom: number;
  flipX: boolean;
  flipY: boolean;
  nodeLayout?: OpenEnaNodeLayoutPositions;
  onNodeMove?: (code: string, dimensions: OpenEnaNodeDimensionPosition) => void;
  copy: OpenEnaCopy;
  svgRef?: React.Ref<SVGSVGElement>;
}

type Positioned = { key: string; x: number; y: number; z: number; label: string; row?: Row };
type ScreenPoint = { x: number; y: number; depth: number };

const WIDTH = 920;
const HEIGHT = 590;
const PAD_X = 72;
const PAD_Y = 58;

type GroupMarkerShape = "circle" | "square" | "triangle" | "diamond" | "cross" | "hexagon";

export const GROUP_VISUAL_ENCODINGS = [
  { key: "circle-solid", markerShape: "circle", markerLabel: "circle", trajectoryLabel: "solid" },
  { key: "square-solid", markerShape: "square", markerLabel: "square", trajectoryLabel: "solid" },
  { key: "triangle-solid", markerShape: "triangle", markerLabel: "triangle", trajectoryLabel: "solid" },
  { key: "diamond-solid", markerShape: "diamond", markerLabel: "diamond", trajectoryLabel: "solid" },
  { key: "cross-solid", markerShape: "cross", markerLabel: "cross", trajectoryLabel: "solid" },
  { key: "hexagon-solid", markerShape: "hexagon", markerLabel: "hexagon", trajectoryLabel: "solid" },
] as const satisfies ReadonlyArray<{
  key: string;
  markerShape: GroupMarkerShape;
  markerLabel: string;
  trajectoryLabel: string;
}>;
export function getGroupVisualEncoding(groupIndex: number) {
  const safeIndex = Number.isFinite(groupIndex) ? Math.max(0, Math.trunc(groupIndex)) : 0;
  return GROUP_VISUAL_ENCODINGS[safeIndex % GROUP_VISUAL_ENCODINGS.length];
}

function groupEncodingDescription(groupName: string, groupIndex: number) {
  const encoding = getGroupVisualEncoding(groupIndex);
  return `${groupName}: ${encoding.markerLabel} marker`;
}

function GroupMarkerGlyph({
  shape,
  x,
  y,
  size,
  fill,
  stroke,
  strokeWidth,
  filter,
}: {
  shape: GroupMarkerShape;
  x: number;
  y: number;
  size: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  filter?: string;
}) {
  const common = { fill, stroke, strokeWidth, filter };
  if (shape === "circle") return <circle cx={x} cy={y} r={size} {...common} />;
  if (shape === "square") return (
    <rect x={x - size} y={y - size} width={size * 2} height={size * 2} rx={Math.max(1, size * 0.15)} {...common} />
  );
  if (shape === "triangle") return (
    <path d={`M ${x} ${y - size} L ${x + size * 0.92} ${y + size * 0.72} L ${x - size * 0.92} ${y + size * 0.72} Z`} {...common} />
  );
  if (shape === "diamond") return (
    <path d={`M ${x} ${y - size} L ${x + size} ${y} L ${x} ${y + size} L ${x - size} ${y} Z`} {...common} />
  );
  if (shape === "cross") {
    const arm = size * 0.36;
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

function numberValue(row: Row, field: string) {
  const value = row[field];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function project3d(item: Positioned, camera: CameraPreset) {
  if (camera === "xy") return { u: item.x, v: item.y, depth: item.z };
  if (camera === "xz") return { u: item.x, v: item.z, depth: item.y };
  if (camera === "yz") return { u: item.y, v: item.z, depth: item.x };
  return {
    u: (item.x - item.y) * 0.72,
    v: item.z * 0.82 - (item.x + item.y) * 0.33,
    depth: (item.x + item.y) * 0.22 + item.z * 0.4,
  };
}

function screenProjector(
  items: Positioned[],
  view: OpenEnaView,
  camera: CameraPreset,
  plotZoom = 1,
  flipX = false,
  flipY = false,
  frameItems: Positioned[] = items,
) {
  const projected = items.map((item) => (view === "3d" ? project3d(item, camera) : { u: item.x, v: item.y, depth: 0 }));
  const projectedFrame = frameItems.map((item) => (
    view === "3d" ? project3d(item, camera) : { u: item.x, v: item.y, depth: 0 }
  ));
  const uMax = Math.max(1e-9, ...projectedFrame.map((item) => Math.abs(item.u)));
  const vMax = Math.max(1e-9, ...projectedFrame.map((item) => Math.abs(item.v)));
  const scale = Math.min((WIDTH - PAD_X * 2) / (uMax * 2), (HEIGHT - PAD_Y * 2) / (vMax * 2)) * plotZoom;
  const depthMax = Math.max(1e-9, ...projected.map((item) => Math.abs(item.depth)));
  const lookup = new Map<string, ScreenPoint>();
  items.forEach((item, index) => {
    const point = projected[index];
    lookup.set(item.key, {
      x: WIDTH / 2 + point.u * scale * (flipX ? -1 : 1),
      y: HEIGHT / 2 - point.v * scale * (flipY ? -1 : 1),
      depth: point.depth / depthMax,
    });
  });
  return {
    positions: lookup,
    inverse2d: (x: number, y: number) => view === "2d" ? {
      x: (x - WIDTH / 2) / (scale * (flipX ? -1 : 1)),
      y: -(y - HEIGHT / 2) / (scale * (flipY ? -1 : 1)),
    } : null,
  };
}

function clientPointInSvg(target: SVGGElement, clientX: number, clientY: number) {
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

export function passesEdgeThreshold(value: number, maximum: number, threshold: number) {
  return value > 1e-12 && value / Math.max(maximum, 1e-12) >= threshold;
}

function edgeWeight(groups: GroupNetwork[], edgeName: string) {
  // An empty display cohort has no mean to subtract from the other group.
  if (groups.length === 2 && groups.some(group => group.count === 0)) {
    return { value: 0, group: undefined, direction: "single" as const };
  }
  if (groups.length === 1) {
    return { value: Math.abs(groups[0]?.meanWeights[edgeName] ?? 0), group: groups[0], direction: "single" as const };
  }
  if (groups.length > 2) {
    const strongest = groups.reduce((best, group) => (
      Math.abs(group.meanWeights[edgeName] ?? 0) > Math.abs(best?.meanWeights[edgeName] ?? 0) ? group : best
    ), groups[0]);
    return { value: Math.abs(strongest?.meanWeights[edgeName] ?? 0), group: strongest, direction: "single" as const };
  }
  const difference = (groups[0]?.meanWeights[edgeName] ?? 0) - (groups[1]?.meanWeights[edgeName] ?? 0);
  return {
    value: Math.abs(difference),
    group: difference >= 0 ? groups[0] : groups[1],
    direction: difference >= 0 ? "first" as const : "second" as const,
  };
}

export function MiniNetwork({
  result,
  codeColors,
  group,
  xDimension,
  yDimension,
  label,
  maxNetworkWeight,
  edgeThreshold,
  showCodeGraph = true,
  codeVisibility,
  codeSourceByRenderedCode, codeLabelByRenderedCode,
}: {
  result: OpenEnaPlotResult;
  codeColors?: OpenEnaCodeColors;
  group: GroupNetwork;
  xDimension: string;
  yDimension: string;
  label: string;
  maxNetworkWeight: number;
  edgeThreshold: number;
} & OpenEnaCodeGraphPresentation) {
  const presentation = { showCodeGraph, codeVisibility, codeSourceByRenderedCode, codeLabelByRenderedCode };
  const nodes = (result.set.rotation.nodes ?? []).map((row) => ({
    x: numberValue(row, xDimension),
    y: numberValue(row, yDimension),
    z: 0,
    key: `node-${String(row.code)}`,
    label: String(row.code),
  }));
  const positions = screenProjector(nodes, "2d", "xy").positions;
  const strongestEdges = result.set.adjacencyKey
    .filter((edge) => openEnaRenderedEdgeIsVisible(presentation, edge.source, edge.target))
    .map((edge) => ({ name: `${openEnaRenderedCodeLabel(presentation, edge.source)} ↔ ${openEnaRenderedCodeLabel(presentation, edge.target)}`, value: Math.abs(group.meanWeights[edge.name] ?? 0) }))
    .filter((edge) => passesEdgeThreshold(edge.value, maxNetworkWeight, edgeThreshold))
    .sort((left, right) => right.value - left.value)
    .slice(0, 3)
    .map((edge) => `${edge.name} ${edge.value.toFixed(3)}`)
    .join(", ");
  const accessibleLabel = strongestEdges
    ? `${label}. Strongest edges: ${strongestEdges}.`
    : `${label}. No non-zero edges.`;

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={accessibleLabel} className="open-ena-mini-svg">
      <rect width={WIDTH} height={HEIGHT} rx="18" className="ena-plot-background" />
      {result.set.adjacencyKey.map((edge) => {
        if (!openEnaRenderedEdgeIsVisible(presentation, edge.source, edge.target)) return null;
        const source = positions.get(`node-${edge.source}`);
        const target = positions.get(`node-${edge.target}`);
        const weight = Math.abs(group.meanWeights[edge.name] ?? 0);
        if (!source || !target || !passesEdgeThreshold(weight, maxNetworkWeight, edgeThreshold)) return null;
        return (
          <line
            key={edge.name}
            x1={source.x}
            y1={source.y}
            x2={target.x}
            y2={target.y}
            stroke={group.color}
            strokeWidth={2 + (weight / maxNetworkWeight) * 13}
            strokeOpacity={0.28 + (weight / maxNetworkWeight) * 0.56}
            strokeLinecap="round"
          />
        );
      })}
      {nodes.filter((node) => openEnaRenderedCodeIsVisible(presentation, node.label)).map((node) => {
        const point = positions.get(node.key);
        if (!point) return null;
        return (
          <g key={node.label} transform={`translate(${point.x} ${point.y})`}>
            <circle
              r="16"
              data-ena-code={node.label}
              fill={codeColorFor(codeColors, node.label)}
              stroke={group.color}
              strokeWidth="6"
            />
            <text y="-24" textAnchor="middle" className="ena-mini-label">{openEnaRenderedCodeLabel(presentation, node.label)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function OpenEnaPlot({
  result,
  codeColors,
  groupColumn,
  view,
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
  textScale = 1,
  plotZoom,
  flipX,
  flipY,
  nodeLayout,
  onNodeMove,
  copy,
  svgRef,
}: OpenEnaPlotProps) {
  const [activeLabelId, setActiveLabelId] = useState<string | null>(null);
  const codePresentation = { showCodeGraph, codeVisibility, codeSourceByRenderedCode, codeLabelByRenderedCode };
  const canonicalNodes = (result.set.rotation.nodes ?? []).map((row) => ({
    x: numberValue(row, xDimension),
    y: numberValue(row, yDimension),
    z: numberValue(row, zDimension),
    key: `node-${String(row.code)}`,
    label: String(row.code),
    row,
  }));
  const labelNodes = canonicalNodes.map((node) => {
    const override = nodeLayout?.get(node.label);
    return {
      ...node,
      key: `label-${node.label}`,
      x: override?.get(xDimension) ?? node.x,
      y: override?.get(yDimension) ?? node.y,
      z: override?.get(zDimension) ?? node.z,
    };
  });
  const unitPoints = result.set.points.map((row, index) => ({
    x: numberValue(row, xDimension),
    y: numberValue(row, yDimension),
    z: numberValue(row, zDimension),
    key: `unit-${index}`,
    label: `unit-${index}-${String(row.ENA_UNIT ?? index)}`,
    row,
  }));
  const summaryGroups = nativePlotSummaryGroupsV3(result);
  const groupMeanPoints = (groups: GroupNetwork[]) => groups.map((group, index) => ({
    x: group.meanPoint[xDimension] ?? 0,
    y: group.meanPoint[yDimension] ?? 0,
    z: group.meanPoint[zDimension] ?? 0,
    key: `mean-${index}`,
    label: `mean-${index}`,
  }));
  const meanPoints = groupMeanPoints(summaryGroups);
  const trajectory = result.trajectoryPresentation;
  const trajectoryCentroids = (trajectory?.centroids ?? []).map((centroid, index) => ({ key: `trajectory-centroid-${index}`, label: centroid.horizon,
    x: Number(centroid.point[xDimension]), y: Number(centroid.point[yDimension]), z: Number(centroid.point[zDimension] ?? 0) }));
  const trajectoryPointKey = (row: Row) => JSON.stringify([row.Unit, row.Horizon]);
  const trajectoryPointPositions = new Map(unitPoints.map((point) => [trajectoryPointKey(point.row), point.key]));
  const visibleTrajectoryPoints = trajectory ? new Set(trajectory.points.map((point) => trajectoryPointKey(point.point))) : null;
  const projection = screenProjector(
    [...canonicalNodes, ...labelNodes, ...unitPoints, ...meanPoints, ...trajectoryCentroids],
    view,
    camera,
    plotZoom,
    flipX,
    flipY,
    [...canonicalNodes, ...unitPoints, ...groupMeanPoints(result.groups)],
  );
  const positions = projection.positions;
  // Kept in the public prop shape so historical settings can still be read.
  // A legacy flag alone cannot manufacture trajectories. Native fitted-sequence
  // presentation is supplied explicitly by the bound Workspace.
  void _legacyShowTrajectories;
  const edgeValues = result.set.adjacencyKey.map((edge) => edgeWeight(summaryGroups, edge.name).value);
  const maxEdge = Math.max(1e-9, ...edgeValues);
  const varianceX = (result.set.variance[xDimension] ?? 0) * 100;
  const varianceY = (result.set.variance[yDimension] ?? 0) * 100;
  const varianceZ = (result.set.variance[zDimension] ?? 0) * 100;
  const axisLabelX = `${xDimension}${showVariance ? ` · ${varianceX.toFixed(1)}%` : ""}${flipX ? ` · ${copy.modelV3.workspace.plot.flippedLabel}` : ""}`;
  const axisLabelY = `${yDimension}${showVariance ? ` · ${varianceY.toFixed(1)}%` : ""}${flipY ? ` · ${copy.modelV3.workspace.plot.flippedLabel}` : ""}`;
  const isComparison = result.groups.length === 2;
  const strongestEdges = result.set.adjacencyKey
    .filter((edge) => openEnaRenderedEdgeIsVisible(codePresentation, edge.source, edge.target))
    .map((edge) => ({ edge, ...edgeWeight(summaryGroups, edge.name) }))
    .filter((item) => item.group && passesEdgeThreshold(item.value, maxEdge, edgeThreshold))
    .sort((left, right) => right.value - left.value)
    .slice(0, 5);
  const safeReferenceName = result.projectionReference?.name
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/gu, " ");
  const referenceName = safeReferenceName
    ? safeReferenceName.length > 72
      ? `${safeReferenceName.slice(0, 69)}…`
      : safeReferenceName
    : null;
  const referenceSourceHash = result.projectionReference?.source.normalizedUtf8TextSha256;
  const safeReferenceId = result.projectionReference?.referenceId
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/gu, " ");
  const referenceToken = result.projectionReference
    ? `ID ${safeReferenceId?.slice(-28)}${referenceSourceHash ? ` · declared analyzed-table SHA-256 ${referenceSourceHash.slice(0, 12)}…` : ""}`
    : null;
  const referenceFigureName = result.projectionReference ? `Reference: ${referenceName}` : null;
  const referenceFigureCaveat = result.projectionReference
    ? "Variance shares describe current data in this fixed basis, not reference-fit explained variance."
    : null;
  const referenceFigureNote = referenceToken && referenceFigureName && referenceFigureCaveat
    ? `Projected into fixed reference: ${referenceToken}. ${referenceFigureName}. ${referenceFigureCaveat}`
    : null;

  const labelScale = Number.isFinite(textScale) ? Math.max(8 / 12, Math.min(20 / 12, textScale)) : 1;
  const trajectoryLabels: SvgTrajectoryLabel[] = [];
  const labelObstacles: { x: number; y: number; width: number; height: number }[] = [];
  if (trajectory) {
    for (const node of canonicalNodes.filter((item) => openEnaRenderedCodeIsVisible(codePresentation, item.label))) {
      const point = positions.get(node.key)!;
      labelObstacles.push({ x: point.x - 11, y: point.y - 11, width: 22, height: 22 });
      if (!showLabels) continue;
      const labelPoint = positions.get(`label-${node.label}`)!;
      const text = openEnaRenderedCodeLabel(codePresentation, node.label);
      trajectoryLabels.push({ id: `code:${node.label}`, kind: "code", code: node.label, text, detail: `${text} code node`, anchor: point,
        fontSize: 14 * labelScale, priority: nodeLayout?.has(node.label) ? 100 : 80,
        preferredOffset: { x: labelPoint.x - point.x, y: labelPoint.y - point.y - 30 } });
    }
    for (const [index, centroid] of trajectory.centroids.entries()) {
      if (!nativePlotGroupSettingsV3(result, centroid.group).showMean) continue;
      const point = positions.get(`trajectory-centroid-${index}`)!;
      labelObstacles.push({ x: point.x - 5.5, y: point.y - 5.5, width: 11, height: 11 });
      trajectoryLabels.push({ id: `centroid:${centroid.key}`, kind: "centroid", text: centroid.horizonShortLabel,
        detail: `${centroid.group} · ${centroid.horizon} · observed n = ${centroid.n}`, anchor: point, fontSize: 13 * labelScale, priority: 60,
        preferredOffset: { x: 28, y: -22 } });
    }
    if (showPoints) for (const unit of unitPoints) {
      const point = positions.get(unit.key)!;
      if (!visibleTrajectoryPoints?.has(trajectoryPointKey(unit.row))) continue;
      const group = groupColumn ? result.groups.find((item) => item.name === String(unit.row[groupColumn])) ?? result.groups[0] : result.groups[0];
      if (!nativePlotGroupSettingsV3(result, group?.name ?? "").showUnitPoints || result.groupPresentation?.hiddenUnits.has(String(unit.row.ENA_UNIT))) continue;
      const radius = 7.5 * pointScale + 2;
      labelObstacles.push({ x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2 });
      if (showUnitLabels) trajectoryLabels.push({ id: `unit:${trajectoryPointKey(unit.row)}`, kind: "unit", text: String(unit.row.ENA_UNIT ?? ""),
        detail: `${String(unit.row.ENA_UNIT ?? "")} · ${String(unit.row.Horizon ?? "")} · ${group?.name ?? ""}`, anchor: point,
        fontSize: 11 * labelScale, priority: 20, preferredOffset: { x: radius + 14, y: -radius - 12 } });
    }
  }
  const labelFrameKey = JSON.stringify([result.analyzedAt, result.boundPresentation?.binding, xDimension, yDimension, zDimension, flipX, flipY, plotZoom, axisLabelX, axisLabelY]);
  const trajectoryLayout = useSvgTrajectoryLabels(trajectoryLabels, { x: 10, y: 10, width: WIDTH - 20, height: referenceFigureNote ? 492 : HEIGHT - 20 }, labelObstacles, labelFrameKey, activeLabelId);
  const trajectoryTextStyle = (label: SvgTrajectoryLabel) => ({ fontFamily: "Arial, Helvetica, sans-serif", fontSize: `${label.fontSize}px`, fontWeight: label.kind === "code" ? 700 : 600, fill: "#263740", stroke: "none" } as const);

  return (
    <figure className="open-ena-plot-figure" tabIndex={0} aria-label={`${copy.workspace.comparison}. Scroll horizontally on small screens.`}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-labelledby="open-ena-plot-title open-ena-plot-description"
        className="open-ena-main-svg"
      >
        <title id="open-ena-plot-title">{`${copy.workspace.comparison}, ${view === "2d" ? copy.views.twoD : copy.views.threeD}${referenceFigureNote ? ` — ${referenceFigureNote}` : ""}`}</title>
        <desc id="open-ena-plot-description">
          {new Set(result.set.points.map((row) => String(row.ENA_UNIT ?? ""))).size} {copy.workspace.units.toLowerCase()}, {result.set.points.length} projected points, {result.groups.length} {copy.workspace.groups.toLowerCase()}, {result.set.codes.length} {copy.workspace.codes.toLowerCase()}.
          {" Group encodings: "}{result.groups.map((group, index) => groupEncodingDescription(group.name, index)).join("; ")}.
          {referenceFigureNote ? ` ${referenceFigureNote}` : ""}
        </desc>
        <defs>
          <pattern id="ena-grid" width="46" height="46" patternUnits="userSpaceOnUse">
            <path d="M 46 0 L 0 0 0 46" fill="none" stroke="#dbe9e7" strokeWidth="1" />
          </pattern>
          <filter id="ena-node-shadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#0f172a" floodOpacity="0.14" />
          </filter>
          <marker id="ena-axis-arrow" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L7,3 z" fill="#64748b" />
          </marker>
        </defs>
        <rect width={WIDTH} height={HEIGHT} rx="18" className="ena-plot-background" />
        <rect width={WIDTH} height={HEIGHT} rx="18" fill="url(#ena-grid)" opacity={view === "2d" ? 0.72 : 0.28} />

        {view === "2d" ? (
          <g className="ena-zero-axes">
            <line x1={WIDTH / 2} y1={PAD_Y / 2} x2={WIDTH / 2} y2={HEIGHT - PAD_Y / 2} />
            <line x1={PAD_X / 2} y1={HEIGHT / 2} x2={WIDTH - PAD_X / 2} y2={HEIGHT / 2} />
            <text x={WIDTH - 34} y={HEIGHT / 2 - 12} textAnchor="end">
              {axisLabelX}
            </text>
            <text x={WIDTH / 2 + 12} y={30}>
              {axisLabelY}
            </text>
          </g>
        ) : (
          <g className="ena-three-axes" aria-hidden="true">
            {camera === "isometric" ? (
              <>
                <line x1={WIDTH / 2} y1={HEIGHT / 2} x2={WIDTH - 110} y2={HEIGHT / 2 + 75} markerEnd="url(#ena-axis-arrow)" />
                <line x1={WIDTH / 2} y1={HEIGHT / 2} x2={150} y2={HEIGHT / 2 + 75} markerEnd="url(#ena-axis-arrow)" />
                <line x1={WIDTH / 2} y1={HEIGHT / 2} x2={WIDTH / 2} y2={72} markerEnd="url(#ena-axis-arrow)" />
                <text x={WIDTH - 96} y={HEIGHT / 2 + 98}>{xDimension} · {varianceX.toFixed(1)}%</text>
                <text x={128} y={HEIGHT / 2 + 98}>{yDimension} · {varianceY.toFixed(1)}%</text>
                <text x={WIDTH / 2 + 13} y={62}>{zDimension} · {varianceZ.toFixed(1)}%</text>
              </>
            ) : (
              <>
                <line x1={WIDTH / 2} y1={HEIGHT / 2} x2={WIDTH - 90} y2={HEIGHT / 2} markerEnd="url(#ena-axis-arrow)" />
                <line x1={WIDTH / 2} y1={HEIGHT / 2} x2={WIDTH / 2} y2={72} markerEnd="url(#ena-axis-arrow)" />
                <text x={WIDTH - 80} y={HEIGHT / 2 - 13} textAnchor="end">
                  {camera === "yz" ? yDimension : xDimension} · {(camera === "yz" ? varianceY : varianceX).toFixed(1)}%
                </text>
                <text x={WIDTH / 2 + 13} y={62}>
                  {camera === "xy" ? yDimension : zDimension} · {(camera === "xy" ? varianceY : varianceZ).toFixed(1)}%
                </text>
                <text x={WIDTH - 80} y={HEIGHT - 24} textAnchor="end">
                  depth: {camera === "xy" ? zDimension : camera === "xz" ? yDimension : xDimension}
                </text>
              </>
            )}
          </g>
        )}

        {showNetworks && !trajectory && !result.groupPresentation?.allSuppressed && result.set.adjacencyKey.map((edge) => {
          if (!openEnaRenderedEdgeIsVisible(codePresentation, edge.source, edge.target)) return null;
          const source = positions.get(`node-${edge.source}`);
          const target = positions.get(`node-${edge.target}`);
          const weighted = edgeWeight(summaryGroups, edge.name);
          if (!source || !target || !weighted.group || !passesEdgeThreshold(weighted.value, maxEdge, edgeThreshold)) return null;
          const relative = weighted.value / maxEdge;
          const edgeLabel = isComparison
            ? `${openEnaRenderedCodeLabel(codePresentation, edge.source)} ↔ ${openEnaRenderedCodeLabel(codePresentation, edge.target)}: ${weighted.group.name} stronger by ${weighted.value.toFixed(3)}`
            : `${openEnaRenderedCodeLabel(codePresentation, edge.source)} ↔ ${openEnaRenderedCodeLabel(codePresentation, edge.target)}: ${weighted.group.name} mean weight ${weighted.value.toFixed(3)}`;
          return (
            <line
              key={edge.name}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke={weighted.group.color}
              strokeWidth={(1.5 + relative * 10) * edgeScale}
              strokeOpacity={0.86 + relative * 0.14}
            strokeLinecap="round"
            data-ena-edge={edge.name}
            aria-label={`${edgeLabel}. Solid network edge.`}
            >
              <title>{`${edgeLabel}. Solid network edge.`}</title>
            </line>
          );
        })}

        {_legacyShowTrajectories && trajectory?.paths.map((path, index) => {
          if (!nativePlotGroupSettingsV3(result, path.group).showUnitPoints || result.groupPresentation?.hiddenUnits.has(path.unitLabel)) return null;
          const from = positions.get(trajectoryPointPositions.get(trajectoryPointKey(path.from)) ?? "");
          const to = positions.get(trajectoryPointPositions.get(trajectoryPointKey(path.to)) ?? "");
          return from && to ? <line key={index} className="ena-individual-trajectory-path" data-ena-trajectory-path="true" data-from-ordinal={path.fromOrdinal} data-to-ordinal={path.toOrdinal} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="black" opacity={0.4} strokeWidth={1.5} /> : null;
        })}
        {trajectory?.centroidPaths.map((path, index) => {
          if (!nativePlotGroupSettingsV3(result, path.from.group).showMean) return null;
          const from = positions.get(`trajectory-centroid-${trajectory.centroids.findIndex((point) => point.key === path.from.key)}`);
          const to = positions.get(`trajectory-centroid-${trajectory.centroids.findIndex((point) => point.key === path.to.key)}`);
          if (!from || !to) return null;
          const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
          const tip = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
          const ux = length ? dx / length : 0, uy = length ? dy / length : 0;
          return <g key={index}><line className="ena-group-centroid-path" data-ena-centroid-path="true" x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="black" strokeWidth={3}><title>{`${path.from.horizon} → ${path.to.horizon}; ${path.sharedContributorCount} observed shared contributors. Available-population centroids; not a matched change estimate.`}</title></line>
            {length > 0 && <polygon data-ena-trajectory-direction="true" points={`${tip.x},${tip.y} ${tip.x - ux * 9 - uy * 4.5},${tip.y - uy * 9 + ux * 4.5} ${tip.x - ux * 9 + uy * 4.5},${tip.y - uy * 9 - ux * 4.5}`} fill="black" />}</g>;
        })}
        {trajectory?.centroids.map((centroid, index) => {
          if (!nativePlotGroupSettingsV3(result, centroid.group).showMean) return null;
          const point = positions.get(`trajectory-centroid-${index}`);
          return point ? <g key={centroid.key} data-ena-trajectory-centroid="true" tabIndex={0} role="img" aria-label={`${centroid.group} · ${centroid.horizon} · observed n = ${centroid.n}`}><rect x={point.x - 3.5} y={point.y - 3.5} width={7} height={7} fill="black" /><title>{`${centroid.group} · ${centroid.horizon} · observed n = ${centroid.n}`}</title></g> : null;
        })}
        {showPoints && unitPoints.map((unit) => {
          const point = positions.get(unit.key);
          if (!point || !unit.row || (visibleTrajectoryPoints && !visibleTrajectoryPoints.has(trajectoryPointKey(unit.row)))) return null;
          const group = groupColumn
            ? result.groups.find((item) => item.name === String(unit.row?.[groupColumn])) ?? result.groups[0]
            : result.groups[0];
          if (!nativePlotGroupSettingsV3(result, group?.name ?? "").showUnitPoints || result.groupPresentation?.hiddenUnits.has(String(unit.row.ENA_UNIT))) return null;
          const groupIndex = Math.max(0, result.groups.findIndex((item) => item.name === group?.name));
          const encoding = getGroupVisualEncoding(groupIndex);
          const markSize = (view === "3d" ? Math.max(5.5, 7.5 + point.depth * 1.2) : 7.5) * pointScale;
          const title = `${String(unit.row.ENA_UNIT)} · ${group?.name ?? ""}: ${xDimension} ${unit.x.toFixed(3)}, ${yDimension} ${unit.y.toFixed(3)}${view === "3d" ? `, ${zDimension} ${unit.z.toFixed(3)}` : ""}`;
          return (
            <g
              key={unit.label}
              role="img"
              aria-label={`${title}. ${encoding.markerLabel} marker.`}
              data-ena-group-shape={encoding.markerShape}
              data-ena-unit-point="true"
            >
              <title>{`${title}. ${encoding.markerLabel} marker.`}</title>
              <GroupMarkerGlyph
                shape={encoding.markerShape}
                x={point.x}
                y={point.y}
                size={markSize}
                fill={group?.color ?? "#39736e"}
                stroke="#263740"
                strokeWidth={1.5}
              />
              {showUnitLabels && !trajectory ? (
                <text
                  x={point.x + markSize + 4}
                  y={point.y - markSize - 2}
                  className="ena-unit-label"
                >
                  {String(unit.row.ENA_UNIT ?? "")}
                </text>
              ) : null}
            </g>
          );
        })}

        {meanPoints.map((mean, index) => {
          const point = positions.get(mean.key);
          const group = summaryGroups[index];
          if (trajectory || !point || !group || group.count === 0 || !nativePlotGroupSettingsV3(result, group.name).showMean) return null;
          return (
            <g
              key={mean.label}
              transform={`translate(${point.x} ${point.y})`}
              role="img"
              aria-label={`${group.name} mean: square centroid marker`}
              data-ena-group-shape="square"
              data-ena-centroid-shape="square"
            >
              <title>{`${group.name} mean: square centroid marker.`}</title>
              <GroupMarkerGlyph
                shape="square"
                x={0}
                y={0}
                size={12}
                fill={group.color}
                stroke="#fff"
                strokeWidth={3}
                filter="url(#ena-node-shadow)"
              />
              <text
                x={index % 2 === 0 ? -15 : 15}
                y={index % 2 === 0 ? -15 : 25}
                textAnchor={index % 2 === 0 ? "end" : "start"}
                className="ena-mean-label"
              >
                {group.name} mean
              </text>
            </g>
          );
        })}

        {canonicalNodes.filter((node) => openEnaRenderedCodeIsVisible(codePresentation, node.label)).map((node) => {
          const point = positions.get(node.key);
          if (!point) return null;
          const nodeColor = codeColorFor(codeColors, node.label);
          const labelPoint = positions.get(`label-${node.label}`)!;
          const labelNode = labelNodes.find(label => label.label === node.label)!;

          const toDimensions = (clientX: number, clientY: number, target: SVGGElement) => {
            const screen = clientPointInSvg(target, clientX, clientY);
            const fitted = screen ? projection.inverse2d(screen.x, screen.y) : null;
            return fitted ? new Map([
              [xDimension, fitted.x],
              [yDimension, fitted.y],
            ]) : null;
          };
          return (
            <g
              key={node.label}
              transform={`translate(${point.x} ${point.y})`}
              filter="url(#ena-node-shadow)"
              data-ena-code-node-position={node.label}
              tabIndex={trajectory ? 0 : undefined}
              role={trajectory ? "img" : undefined}
              aria-label={trajectory ? openEnaRenderedCodeLabel(codePresentation, node.label) : undefined}
            >
              {trajectory ? <title>{openEnaRenderedCodeLabel(codePresentation, node.label)}</title> : null}
              <circle
                r={trajectory && view === "2d" ? 8 : view === "3d" ? Math.max(11, 14 + point.depth * 2) : 14}
                className="ena-result-node"
                data-ena-code={node.label}
                fill={nodeColor}
                stroke={nodeColor}
                style={{ fill: nodeColor, stroke: nodeColor }}
              />
              {showLabels && !trajectory ? (
                <OpenEnaSvgDraggableNode
                  code={node.label}
                  position={new Map([[xDimension, labelNode.x], [yDimension, labelNode.y]])}
                  offset={{ x: labelPoint.x - point.x, y: labelPoint.y - point.y }}
                  disabled={view !== "2d" || !onNodeMove}
                  toDimensions={toDimensions}
                  onNodeMove={onNodeMove ?? (() => {})}
                >
                  <text y="-23" textAnchor="middle" className="ena-result-label">{openEnaRenderedCodeLabel(codePresentation, node.label)}</text>
                </OpenEnaSvgDraggableNode>
              ) : null}

            </g>
          );
        })}
        {trajectory ? <g ref={trajectoryLayout.layerRef} data-ena-trajectory-label-layer="true">
          <g visibility="hidden" aria-hidden="true" pointerEvents="none">
            {trajectoryLabels.map((label) => <text key={label.id} data-ena-label-measure={label.id} x={0} y={0} style={trajectoryTextStyle(label)}>{label.text}</text>)}
          </g>
          {trajectoryLabels.map((label) => {
            const placement = trajectoryLayout.placements.get(label.id)!;
            const metric = trajectoryLayout.metrics.get(label.id)!;
            const lineEnd = { x: Math.max(placement.x, Math.min(placement.x + placement.width, label.anchor.x)), y: Math.max(placement.y, Math.min(placement.y + placement.height, label.anchor.y)) };
            const labelText = <text data-ena-layout-label={label.id} x={placement.x + metric.baselineX} y={placement.y + metric.baselineY} style={trajectoryTextStyle(label)}>{label.text}</text>;
            // Drag starts at the displayed anchor, including automatic displacement.
            // Saved anchors still describe only labels; fitted node coordinates stay fixed.
            const displayAnchor = projection.inverse2d(placement.x + placement.width / 2, placement.y + placement.height / 2 + 30);
            return <g key={label.id} data-ena-label-box="true" data-label-id={label.id} data-label-visible={placement.visible}
              data-label-x={placement.x} data-label-y={placement.y} data-label-width={placement.width} data-label-height={placement.height}
              visibility={placement.visible ? "visible" : "hidden"} tabIndex={placement.visible ? 0 : undefined} role="img" aria-label={label.detail}
              onFocus={() => setActiveLabelId(label.id)} onBlur={() => setActiveLabelId(current => current === label.id ? null : current)}>
              <title>{label.detail}</title>
              {placement.visible && Math.hypot(lineEnd.x - label.anchor.x, lineEnd.y - label.anchor.y) > 9
                ? <line data-ena-label-leader="true" x1={label.anchor.x} y1={label.anchor.y} x2={lineEnd.x} y2={lineEnd.y} stroke="#7c8a91" strokeWidth={0.8} pointerEvents="none" /> : null}
              <rect x={placement.x} y={placement.y} width={placement.width} height={placement.height} rx={2} fill="#fff" fillOpacity={0.94} pointerEvents="none" />
              {label.code && displayAnchor ? <OpenEnaSvgDraggableNode code={label.code} position={new Map([[xDimension, displayAnchor.x], [yDimension, displayAnchor.y]])}
                offset={{ x: 0, y: 0 }} disabled={view !== "2d" || !onNodeMove} onNodeMove={onNodeMove ?? (() => {})}
                toDimensions={(clientX, clientY, target) => { const point = clientPointInSvg(target, clientX, clientY); const resolved = point ? projection.inverse2d(point.x, point.y) : null; return resolved ? new Map([[xDimension, resolved.x], [yDimension, resolved.y]]) : null; }}>
                {labelText}
              </OpenEnaSvgDraggableNode> : labelText}
            </g>;
          })}
        </g> : null}
        {referenceFigureNote ? (
          <g className="ena-reference-figure-provenance" role="note" aria-label={referenceFigureNote}>
            <rect x="18" y="512" width="884" height="64" rx="8" fill="#ffffff" fillOpacity="0.94" stroke="#8aa8a5" />
            <text x="30" y="530" fill="#334b52" fontSize="11.5" fontWeight="700">{referenceToken}</text>
            <text x="30" y="549" fill="#334b52" fontSize="11.5" fontWeight="700">{referenceFigureName}</text>
            <text x="30" y="568" fill="#334b52" fontSize="11.5" fontWeight="700">{referenceFigureCaveat}</text>
          </g>
        ) : null}
      </svg>
      {trajectory ? <details data-ena-trajectory-label-details="true"><summary>{copy.workspace.plotLabels}</summary><p>{copy.workspace.plotLabelsHelp}</p>
        <ul>{trajectoryLabels.map((label) => <li key={label.id} tabIndex={0} data-ena-label-detail-id={label.id}
          onFocus={() => setActiveLabelId(label.id)} onBlur={() => setActiveLabelId(current => current === label.id ? null : current)}>
          {label.detail}{!trajectoryLayout.placements.get(label.id)?.visible ? ` — ${copy.workspace.deferredPlotLabel}` : ""}</li>)}</ul>
      </details> : null}
      <div className="open-ena-legend" aria-label={copy.modelV3.workspace.plot.legendAria}>
        {result.groups.map((group, index) => {
          const encoding = getGroupVisualEncoding(index);
          return (
            <span
              key={group.name}
              aria-label={`${groupEncodingDescription(group.name, index)}. ${group.count} analytic units.`}
            >
              <svg
                width="39"
                height="14"
                viewBox="0 0 39 14"
                aria-hidden="true"
                data-ena-group-shape={encoding.markerShape}
              >
                <GroupMarkerGlyph
                  shape={encoding.markerShape}
                  x={7}
                  y={7}
                  size={5}
                  fill={group.color}
                  stroke="#263740"
                  strokeWidth={1.2}
                />
                <line
                  x1="17"
                  y1="7"
                  x2="38"
                  y2="7"
                  stroke={group.color}
                  strokeWidth="2.5"
                />
              </svg>
              {group.name} ({group.count})
            </span>
          );
        })}
        <span aria-label={copy.modelV3.workspace.plot.squareCentroidLegend}>
          <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
            <rect x="2" y="2" width="11" height="11" fill="#52636a" stroke="#fff" strokeWidth="2.5" />
          </svg>
          {copy.modelV3.workspace.plot.squareCentroidLegendText}
        </span>
      </div>
      <details className="ena-result-summary">
        <summary>{copy.workspace.accessibleSummary}</summary>
        <p>
          {xDimension}: {varianceX.toFixed(1)}% · {yDimension}: {varianceY.toFixed(1)}%
          {view === "3d" ? ` · ${zDimension}: ${varianceZ.toFixed(1)}%` : ""}
        </p>
        <h3>{copy.workspace.groupMeans}</h3>
        <table>
          <thead><tr><th>{copy.workspace.groups}</th><th>{xDimension}</th><th>{yDimension}</th>{view === "3d" ? <th>{zDimension}</th> : null}</tr></thead>
          <tbody>
            {summaryGroups.filter(group => group.count > 0).map((group) => (
              <tr key={group.name}>
                <th scope="row">{group.name} (n = {group.count})</th>
                <td>{(group.meanPoint[xDimension] ?? 0).toFixed(3)}</td>
                <td>{(group.meanPoint[yDimension] ?? 0).toFixed(3)}</td>
                {view === "3d" ? <td>{(group.meanPoint[zDimension] ?? 0).toFixed(3)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
        <h3>{isComparison ? copy.workspace.strongestDifferences : copy.workspace.strongestConnections}</h3>
        <table>
          <thead>
            <tr>
              <th>{copy.modelV3.workspace.plot.edgeColumn}</th>
              <th>{isComparison ? copy.workspace.strongerGroup : copy.workspace.groups}</th>
              <th>{isComparison ? copy.workspace.difference : copy.workspace.meanWeight}</th>
            </tr>
          </thead>
          <tbody>
            {strongestEdges.map(({ edge, group, value }) => (
              <tr key={edge.name}><th scope="row">{openEnaRenderedCodeLabel(codePresentation, edge.source)} ↔ {openEnaRenderedCodeLabel(codePresentation, edge.target)}</th><td>{group?.name}</td><td>{value.toFixed(3)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
      <figcaption>{view === "3d" ? copy.workspace.threeDNote : copy.workspace.methodNote}</figcaption>
    </figure>
  );
}
