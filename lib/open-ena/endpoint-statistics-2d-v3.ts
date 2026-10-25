import { cohensD, enaCorrelations } from "jena-js";
import { combineScaledDeviations, meanColumns, sampleDeviation, scaledMeanDifference, scaledSampleDeviation, statisticInUnits } from "jena-js/core";
import { AUTO_CORRELATION_UNIT_LIMIT } from "./analyze";
import { assertCurrentCapabilityV3, boundScientificAdapterV3, buildInferenceInputV3, captureControlArrayV3, type OpenEnaEndpointControlsV3 } from "./inference-consumers-v3";
import { captureExecutionPlanInputV3, type StandardExecutionPlanV3 } from "./model-v3/execution-plan";
import type { BoundStandardResultV3 } from "./model-v3/types";
import { deepFreezeV3 } from "./model-v3/canonical-json";
import { studentTTwoSidedP } from "./uncertainty";

const finite = (value: number): number | null => Number.isFinite(value) ? value : null;

/** Separate, current-model 2D diagnostics. Does not alter the model bundle,
 * the core jENA correlations API, trajectory statistics, or ONA. */
export async function calculateEndpointGoodness2DV3(input: unknown, independentPlan: unknown, requestedAxes: readonly string[]) {
  const plan = captureExecutionPlanInputV3(independentPlan);
  const axes = captureControlArrayV3(requestedAxes, "2D goodness axes", 2);
  if (axes.some(axis => typeof axis !== "string") || axes[0] === axes[1]) throw new TypeError("Choose two distinct supported axes.");
  const validated = await assertCurrentCapabilityV3(input, plan, "build-model");
  if (validated.configuration.analysisFamily !== "standard" || validated.configuration.analysis.model.type !== "EndPoint") {
    throw new TypeError("2D goodness requires a Standard EndPoint model.");
  }
  const result = validated as BoundStandardResultV3;
  const dimensions = axes as [string, string];
  const supported = result.executionProvenance.projection.estimableAxes;
  if (dimensions.some(axis => !supported.includes(axis) || !result.set.points.every(p => typeof p[axis] === "number" && Number.isFinite(p[axis])))) {
    throw new TypeError("2D goodness requires supported retained coordinates.");
  }
  const common = { schemaVersion: 1, kind: "open-ena-endpoint-goodness-2d", executable: false,
    binding: result.binding, axes: dimensions, unitCount: result.set.points.length,
    method: "rENA signed pairwise differences in first-source Unit order", unitLimit: AUTO_CORRELATION_UNIT_LIMIT } as const;
  if (common.unitCount > AUTO_CORRELATION_UNIT_LIMIT) return deepFreezeV3({ ...common, status: "unavailable" as const, rows: [] });

  // The runtime groups/sorts canonical identities. webENA's signed pairwise
  // differences use source Unit order, so reorder points AND centroids together.
  const sourcePlan = plan as StandardExecutionPlanV3;
  const names = new Map(sourcePlan.identityDictionary.units.map(unit => [unit.token, unit.displayLabel]));
  const firstSourceRow = new Map<string, number>();
  for (const row of sourcePlan.rows) {
    const name = names.get(row.unitToken)!;
    firstSourceRow.set(name, Math.min(firstSourceRow.get(name) ?? Infinity, row.sourceRowIndex));
  }
  const set = boundScientificAdapterV3(result, dimensions).set;
  if (set.points.some(point => !firstSourceRow.has(String(point.ENA_UNIT)))) throw new TypeError("Goodness lost source Unit identity.");
  const order = set.points.map((_, index) => index).sort((a, b) => firstSourceRow.get(String(set.points[a].ENA_UNIT))! - firstSourceRow.get(String(set.points[b].ENA_UNIT))!);
  const ordered = { ...set, points: order.map(index => set.points[index]), centroids: order.map(index => set.centroids![index]) };
  const rows = enaCorrelations(ordered, dimensions).map(row => ({
    axis: row.dimension, pearson: finite(row.pearson), spearman: finite(row.spearman),
    status: Number.isFinite(row.pearson) && Number.isFinite(row.spearman) ? "available" as const : "not-estimable" as const,
  }));
  return deepFreezeV3({ ...common, status: "available" as const, rows });
}

function welchRow(axis: string, primary: number[], secondary: number[]) {
  const summary = {
    axis, nPrimary: primary.length, nSecondary: secondary.length,
    meanPrimary: primary.length ? finite(meanColumns(primary.map(v => [v]))[0]) : null,
    meanSecondary: secondary.length ? finite(meanColumns(secondary.map(v => [v]))[0]) : null,
    sdPrimary: finite(sampleDeviation(primary)), sdSecondary: finite(sampleDeviation(secondary)),
  };
  const unavailable = { ...summary, status: "not-estimable" as const, t: null, df: null, p: null, cohensD: null };
  if (primary.length < 2 || secondary.length < 2) return unavailable;
  // Reuse jENA's stable scaled moments; only the post-model p tail is added here.
  const errors = [scaledSampleDeviation(primary, Math.sqrt(primary.length)), scaledSampleDeviation(secondary, Math.sqrt(secondary.length))];
  const denominator = combineScaledDeviations(errors), difference = scaledMeanDifference(primary, secondary);
  if (denominator.value === 0) return unavailable;
  const t = statisticInUnits({ value: difference.value / denominator.value, scale: difference.scale }, denominator.scale);
  const leftError = statisticInUnits(errors[0], denominator.scale), rightError = statisticInUnits(errors[1], denominator.scale);
  const scale = Math.max(leftError, rightError), left = (leftError / scale) ** 2, right = (rightError / scale) ** 2;
  const df = (left + right) ** 2 / (left ** 2 / (primary.length - 1) + right ** 2 / (secondary.length - 1));
  if (!Number.isFinite(t) || !Number.isFinite(df) || df <= 0) return unavailable;
  return { ...summary, status: "available" as const, t, df, p: studentTTwoSidedP(t, df), cohensD: finite(cohensD(primary, secondary)) };
}

export async function calculateEndpointWelch2DV3(input: unknown, independentPlan: unknown, options: OpenEnaEndpointControlsV3) {
  const admitted = await buildInferenceInputV3(input, independentPlan, options);
  const points = admitted.result.set.points;
  const primary = points.filter(p => p.Group === admitted.groupSelection.primary);
  const secondary = points.filter(p => p.Group === admitted.groupSelection.secondary);
  return deepFreezeV3({ schemaVersion: 1, kind: "open-ena-endpoint-welch-2d", executable: false,
    binding: admitted.binding, controls: admitted.controls, groupSelection: admitted.groupSelection,
    coordinateDecimalPlaces: 4,
    method: "Welch unequal-variance two-sided t test on webENA-compatible four-decimal coordinates; unadjusted p; absolute pooled-SD Cohen d; original model precision retained",
    rows: admitted.controls.axes.map(axis => welchRow(axis,
      primary.map(p => Number(Number(p[axis]).toFixed(4))), secondary.map(p => Number(Number(p[axis]).toFixed(4))))),
  });
}

export type EndpointGoodness2DV3 = Awaited<ReturnType<typeof calculateEndpointGoodness2DV3>>;
export type EndpointWelch2DV3 = Awaited<ReturnType<typeof calculateEndpointWelch2DV3>>;
