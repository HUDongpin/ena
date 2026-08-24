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
  input.layout.legend = {
    ...legend,
    orientation: "h",
    x: 0,
    xanchor: "left",
    y: -0.12,
    yanchor: "top",
    font: { ...legendFont, size: 9 },
    entrywidth: 138,
    entrywidthmode: "pixels",
    tracegroupgap: 2,
  };
  input.layout.margin = {
    ...margin,
    l: 44,
    r: 12,
    t: 52,
    b: 168,
  };
  return input;
}
