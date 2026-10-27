/** Display-only bounds; no inference cohort or fitted coordinate is changed. */
export type TrajectoryCentroidIntervalV3 =
  | { status: "estimable" | "degenerate"; lower: number; upper: number; sampleSize: number; finiteReplicates: number }
  | { status: "not-estimable"; reason: string; sampleSize: number; finiteReplicates: number };

export interface TrajectoryHorizonStyleV3 { horizonKey: string; label: string; detail: string; color: string }

// Generated with grDevices::hcl.colors(256, "viridis"). The reference takes
// the bright .38–.92 range (.65 for one period). No runtime R dependency.
import { TRAJECTORY_HCL_VIRIDIS_V3 } from "./trajectory-viridis-v3";

export function trajectoryPeriodColorsV3(count: number): string[] {
  if (!Number.isSafeInteger(count) || count < 0 || count > 100_000) throw new RangeError("Invalid Horizon color count");
  return Array.from({ length: count }, (_, index) => {
    const fraction = count === 1 ? .65 : .38 + .54 * index / (count - 1);
    return TRAJECTORY_HCL_VIRIDIS_V3[Math.round(fraction * 255)]!;
  });
}

export function trajectoryHorizonColorV3(trajectory: { horizonStyles?: readonly TrajectoryHorizonStyleV3[] }, horizonKey: string): string {
  return trajectory.horizonStyles?.find(style => style.horizonKey === horizonKey)?.color ?? "#007D97";
}

export const TRAJECTORY_CI_METHOD_NOTE_V3 = "95% pointwise Unit-history bootstrap CI; 500 resamples; seed 2026; fixed ENA coordinates. Per-axis intervals, not a joint confidence region.";

export function trajectoryCentroidDescriptionV3(centroid: {
  group: string; horizon: string; n: number; intervals?: Record<string, TrajectoryCentroidIntervalV3>;
}): string {
  const base = `${centroid.group} · ${centroid.horizon} · observed n = ${centroid.n}`;
  if (!centroid.intervals) return base;
  const value = (n: number) => Number(n.toPrecision(6)).toString();
  const bounds = Object.entries(centroid.intervals).map(([axis, interval]) => interval.status === "not-estimable"
    ? `${axis}: CI unavailable (${interval.reason}; ${interval.finiteReplicates}/500 finite resamples)`
    : `${axis}: [${value(interval.lower)}, ${value(interval.upper)}]${interval.status === "degenerate" ? " (zero width)" : ""}; ${interval.finiteReplicates}/500 finite resamples`);
  return `${base} · ${bounds.join(" · ")} · ${TRAJECTORY_CI_METHOD_NOTE_V3}`;
}
