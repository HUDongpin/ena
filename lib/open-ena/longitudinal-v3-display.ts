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
