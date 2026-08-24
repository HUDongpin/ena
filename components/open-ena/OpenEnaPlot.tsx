import type { Row } from "jena-js";
import type { OpenEnaCopy } from "@/lib/open-ena-i18n";
import { codeColorFor, type OpenEnaCodeColors } from "@/lib/open-ena/plot-style";
import type { CameraPreset, GroupNetwork, OpenEnaResult, OpenEnaView } from "@/lib/open-ena/types";

interface OpenEnaPlotProps {
  result: OpenEnaResult;
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
  plotZoom: number;
  flipX: boolean;
  flipY: boolean;
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
) {
  const projected = items.map((item) => (view === "3d" ? project3d(item, camera) : { u: item.x, v: item.y, depth: 0 }));
  const uMax = Math.max(1e-9, ...projected.map((item) => Math.abs(item.u)));
  const vMax = Math.max(1e-9, ...projected.map((item) => Math.abs(item.v)));
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
  return lookup;
}

export function passesEdgeThreshold(value: number, maximum: number, threshold: number) {
  return value > 1e-12 && value / Math.max(maximum, 1e-12) >= threshold;
}

function edgeWeight(groups: GroupNetwork[], edgeName: string) {
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
}: {
  result: OpenEnaResult;
  codeColors?: OpenEnaCodeColors;
  group: GroupNetwork;
  xDimension: string;
  yDimension: string;
  label: string;
  maxNetworkWeight: number;
  edgeThreshold: number;
}) {
  const nodes = (result.set.rotation.nodes ?? []).map((row) => ({
    x: numberValue(row, xDimension),
    y: numberValue(row, yDimension),
    z: 0,
    key: `node-${String(row.code)}`,
    label: String(row.code),
  }));
  const positions = screenProjector(nodes, "2d", "xy");
  const strongestEdges = result.set.adjacencyKey
    .map((edge) => ({ name: edge.name, value: Math.abs(group.meanWeights[edge.name] ?? 0) }))
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
      {nodes.map((node) => {
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
            <text y="-24" textAnchor="middle" className="ena-mini-label">{node.label}</text>
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
  showUnitLabels,
  showVariance,
  showTrajectories: _legacyShowTrajectories,
  edgeScale,
  edgeThreshold,
  pointScale,
  plotZoom,
  flipX,
  flipY,
  copy,
  svgRef,
}: OpenEnaPlotProps) {
  const nodes = (result.set.rotation.nodes ?? []).map((row) => ({
    x: numberValue(row, xDimension),
    y: numberValue(row, yDimension),
    z: numberValue(row, zDimension),
    key: `node-${String(row.code)}`,
    label: String(row.code),
    row,
  }));
  const unitPoints = result.set.points.map((row, index) => ({
    x: numberValue(row, xDimension),
    y: numberValue(row, yDimension),
    z: numberValue(row, zDimension),
    key: `unit-${index}`,
    label: `unit-${index}-${String(row.ENA_UNIT ?? index)}`,
    row,
  }));
  const meanPoints = result.groups.map((group, index) => ({
    x: group.meanPoint[xDimension] ?? 0,
    y: group.meanPoint[yDimension] ?? 0,
    z: group.meanPoint[zDimension] ?? 0,
    key: `mean-${index}`,
    label: `mean-${index}`,
  }));
  const positions = screenProjector(
    [...nodes, ...unitPoints, ...meanPoints],
    view,
    camera,
    plotZoom,
    flipX,
    flipY,
  );
  // Kept in the public prop shape so historical settings can still be read.
  // Generic ENA presenters never render longitudinal paths; those belong only
  // to the versioned trajectory workbench.
  void _legacyShowTrajectories;
  const edgeValues = result.set.adjacencyKey.map((edge) => edgeWeight(result.groups, edge.name).value);
  const maxEdge = Math.max(1e-9, ...edgeValues);
  const varianceX = (result.set.variance[xDimension] ?? 0) * 100;
  const varianceY = (result.set.variance[yDimension] ?? 0) * 100;
  const varianceZ = (result.set.variance[zDimension] ?? 0) * 100;
  const isComparison = result.groups.length === 2;
  const strongestEdges = result.set.adjacencyKey
    .map((edge) => ({ edge, ...edgeWeight(result.groups, edge.name) }))
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
              {xDimension}{showVariance ? ` · ${varianceX.toFixed(1)}%` : ""}{flipX ? " · flipped" : ""}
            </text>
            <text x={WIDTH / 2 + 12} y={30}>
              {yDimension}{showVariance ? ` · ${varianceY.toFixed(1)}%` : ""}{flipY ? " · flipped" : ""}
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

        {showNetworks && result.set.adjacencyKey.map((edge) => {
          const source = positions.get(`node-${edge.source}`);
          const target = positions.get(`node-${edge.target}`);
          const weighted = edgeWeight(result.groups, edge.name);
          if (!source || !target || !weighted.group || !passesEdgeThreshold(weighted.value, maxEdge, edgeThreshold)) return null;
          const relative = weighted.value / maxEdge;
          const edgeLabel = isComparison
            ? `${edge.name}: ${weighted.group.name} stronger by ${weighted.value.toFixed(3)}`
            : `${edge.name}: ${weighted.group.name} mean weight ${weighted.value.toFixed(3)}`;
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
              aria-label={`${edgeLabel}. Solid network edge.`}
            >
              <title>{`${edgeLabel}. Solid network edge.`}</title>
            </line>
          );
        })}

        {showPoints && unitPoints.map((unit) => {
          const point = positions.get(unit.key);
          if (!point || !unit.row) return null;
          const group = groupColumn
            ? result.groups.find((item) => item.name === String(unit.row?.[groupColumn])) ?? result.groups[0]
            : result.groups[0];
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
              {showUnitLabels ? (
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
          const group = result.groups[index];
          if (!point || !group) return null;
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

        {nodes.map((node) => {
          const point = positions.get(node.key);
          if (!point) return null;
          const nodeColor = codeColorFor(codeColors, node.label);
          return (
            <g key={node.label} transform={`translate(${point.x} ${point.y})`} filter="url(#ena-node-shadow)">
              <circle
                r={view === "3d" ? Math.max(11, 14 + point.depth * 2) : 14}
                className="ena-result-node"
                data-ena-code={node.label}
                fill={nodeColor}
                stroke={nodeColor}
                style={{ fill: nodeColor, stroke: nodeColor }}
              />
              {showLabels ? <text y="-23" textAnchor="middle" className="ena-result-label">{node.label}</text> : null}
            </g>
          );
        })}
        {referenceFigureNote ? (
          <g className="ena-reference-figure-provenance" role="note" aria-label={referenceFigureNote}>
            <rect x="18" y="512" width="884" height="64" rx="8" fill="#ffffff" fillOpacity="0.94" stroke="#8aa8a5" />
            <text x="30" y="530" fill="#334b52" fontSize="11.5" fontWeight="700">{referenceToken}</text>
            <text x="30" y="549" fill="#334b52" fontSize="11.5" fontWeight="700">{referenceFigureName}</text>
            <text x="30" y="568" fill="#334b52" fontSize="11.5" fontWeight="700">{referenceFigureCaveat}</text>
          </g>
        ) : null}
      </svg>
      <div className="open-ena-legend" aria-label="Plot legend">
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
        <span aria-label="Group means use square centroid markers.">
          <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
            <rect x="2" y="2" width="11" height="11" fill="#52636a" stroke="#fff" strokeWidth="2.5" />
          </svg>
          Square marker = group mean
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
            {result.groups.map((group) => (
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
              <th>Edge</th>
              <th>{isComparison ? copy.workspace.strongerGroup : copy.workspace.groups}</th>
              <th>{isComparison ? copy.workspace.difference : copy.workspace.meanWeight}</th>
            </tr>
          </thead>
          <tbody>
            {strongestEdges.map(({ edge, group, value }) => (
              <tr key={edge.name}><th scope="row">{edge.name}</th><td>{group?.name}</td><td>{value.toFixed(3)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
      <figcaption>{view === "3d" ? copy.workspace.threeDNote : copy.workspace.methodNote}</figcaption>
    </figure>
  );
}
