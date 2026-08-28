export interface ImmutableTrajectoryPlotlyInputV3 {
  data: readonly Readonly<Record<string, unknown>>[];
  layout: Readonly<Record<string, unknown>>;
  config: Readonly<Record<string, unknown>>;
}

export interface MutableTrajectoryPlotlyInputV3 {
  data: Array<Record<string, unknown>>;
  layout: Record<string, unknown>;
  config: Record<string, unknown>;
}

export interface TrajectoryPlotlyRangesV3 {
  x: readonly [number, number];
  y: readonly [number, number];
}

const TRAJECTORY_PLOTLY_RANGE_ZOOM_STEP_V3 = 1.2;

function zoomTrajectoryPlotlyRangeV3(
  [start, end]: readonly [number, number],
  direction: "in" | "out",
): [number, number] {
  const center = (start + end) / 2;
  const scale = direction === "in"
    ? 1 / TRAJECTORY_PLOTLY_RANGE_ZOOM_STEP_V3
    : TRAJECTORY_PLOTLY_RANGE_ZOOM_STEP_V3;
  const scaledHalfSpan = ((end - start) / 2) * scale;
  return [center - scaledHalfSpan, center + scaledHalfSpan];
}

export function zoomTrajectoryPlotlyRangesV3(
  current: TrajectoryPlotlyRangesV3,
  direction: "in" | "out",
): TrajectoryPlotlyRangesV3 {
  return {
    x: zoomTrajectoryPlotlyRangeV3(current.x, direction),
    y: zoomTrajectoryPlotlyRangeV3(current.y, direction),
  };
}

export function resetTrajectoryPlotlyRangesV3(
  initial: TrajectoryPlotlyRangesV3,
): TrajectoryPlotlyRangesV3 {
  return {
    x: [...initial.x],
    y: [...initial.y],
  };
}

export function captureInitialTrajectoryPlotlyRangesV3(
  initial: TrajectoryPlotlyRangesV3 | null,
  rendered: TrajectoryPlotlyRangesV3,
): TrajectoryPlotlyRangesV3 {
  return resetTrajectoryPlotlyRangesV3(initial ?? rendered);
}

/**
 * Plotly normalizes traces and layouts in place. The package compiler returns
 * an immutable, hash-bound display spec, so the browser presenter must never
 * pass those objects directly across Plotly's mutation boundary.
 */
export function cloneTrajectoryPlotlyInputV3(
  source: ImmutableTrajectoryPlotlyInputV3,
): MutableTrajectoryPlotlyInputV3 {
  const input = { data: source.data, layout: source.layout, config: source.config };
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(input) as MutableTrajectoryPlotlyInputV3;
  }
  return JSON.parse(JSON.stringify(input)) as MutableTrajectoryPlotlyInputV3;
}

function mutableRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/**
 * Applies a presenter-only narrow-screen layout to an already-cloned Plotly
 * input. This deliberately sits after the immutable package compiler so
 * responsive legend placement cannot alter the scientific envelope or hash.
 */
export function applyCompactTrajectoryPlotlyLayoutV3(
  input: MutableTrajectoryPlotlyInputV3,
  compact: boolean,
): MutableTrajectoryPlotlyInputV3 {
  if (!compact) return input;

  const legend = mutableRecord(input.layout.legend);
  const legendFont = mutableRecord(legend.font);
  const margin = mutableRecord(input.layout.margin);
  input.layout.autosize = true;
  const compactLegend: Record<string, unknown> = {
    ...legend,
    orientation: "v",
    x: 0,
    xanchor: "left",
    y: -0.08,
    yanchor: "top",
    font: { ...legendFont, size: 10 },
    tracegroupgap: 1,
  };
  delete compactLegend.entrywidth;
  delete compactLegend.entrywidthmode;
  input.layout.legend = compactLegend;
  input.layout.margin = {
    ...margin,
    l: 44,
    r: 12,
    t: 52,
    b: 210,
  };
  return input;
}

/**
 * Uses the complete fullscreen Plotly paper for the presenter. The legend is
 * intentionally overlaid inside the paper so Plotly does not reserve a wide
 * blank column beside a square 3D scene. This is a display-only transform of a
 * mutable clone; it cannot change the immutable trajectory result envelope.
 */
export function applyFullscreenTrajectoryPlotlyLayoutV3(
  input: MutableTrajectoryPlotlyInputV3,
  fullscreen: boolean,
): MutableTrajectoryPlotlyInputV3 {
  if (!fullscreen) return input;

  const legend = mutableRecord(input.layout.legend);
  const legendFont = mutableRecord(legend.font);
  const fullscreenLegend: Record<string, unknown> = {
    ...legend,
    orientation: "v",
    x: 0.995,
    xanchor: "right",
    y: 0.995,
    yanchor: "top",
    bgcolor: "rgba(255,255,255,0.82)",
    bordercolor: "rgba(91,111,116,0.28)",
    borderwidth: 1,
    font: { ...legendFont, size: 11 },
    tracegroupgap: 2,
  };
  delete fullscreenLegend.entrywidth;
  delete fullscreenLegend.entrywidthmode;

  input.layout.autosize = true;
  input.layout.legend = fullscreenLegend;
  input.layout.margin = { l: 24, r: 8, t: 28, b: 20 };
  const scene = mutableRecord(input.layout.scene);
  if (Object.keys(scene).length > 0) {
    input.layout.scene = {
      ...scene,
      domain: { x: [0, 1], y: [0, 1] },
    };
  }
  return input;
}
