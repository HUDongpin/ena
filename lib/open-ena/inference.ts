import type { OpenEnaResult } from "./types";
import { assertOpenEnaCapabilityForResult } from "./capabilities";
import {
  mannWhitneyRankTest,
  type OpenEnaExactTailAudit,
  type OpenEnaRankWarningCode,
  type OpenEnaResolvedRankPMethod,
} from "./rank-inference";

export const MANN_WHITNEY_PROVENANCE = "ENA.HK post-projection inference";
export const MANN_WHITNEY_METHOD = "Mann-Whitney U for the first declared group; two-sided auto exact-first inference with 12-significant-digit average ranks, fixed-size exact rank permutations through total N=50, and a tie-corrected normal approximation with a 0.5 continuity correction above that boundary";
export const MANN_WHITNEY_EFFECT_DEFINITION = "r_rb(first vs second) = 2 * U(first) / (nFirst * nSecond) - 1; positive values indicate higher ranks in the first group";
export const SELECTED_MANN_WHITNEY_METHOD = "Mann-Whitney U for the Primary selected group; two-sided auto exact-first inference with 12-significant-digit average ranks, fixed-size exact rank permutations through total N=50, and a tie-corrected normal approximation with a 0.5 continuity correction above that boundary";
export const SELECTED_MANN_WHITNEY_EFFECT_DEFINITION = "r_rb(Primary vs Secondary) = 2 * U(Primary) / (nPrimary * nSecondary) - 1; positive values indicate higher ranks in the Primary selected group";

export type MannWhitneyNotEstimableReason = "empty-group" | "zero-rank-variance";
export type EndpointMannWhitneyDisabledReason =
  | "endpoint-only"
  | "comparison-group-required"
  | "exactly-two-groups-required";

export interface MannWhitneyEstimate {
  status: "estimable" | "not-estimable";
  reason: MannWhitneyNotEstimableReason | null;
  nFirst: number;
  nSecond: number;
  medianFirst: number | null;
  medianSecond: number | null;
  /** U for the first group in the declared group order. */
  uFirst: number | null;
  /** Complementary U for the second group. */
  uSecond: number | null;
  z: number | null;
  pValueTwoSided: number | null;
  /** 2 * U(first) / (nFirst * nSecond) - 1. */
  rankBiserialFirstVsSecond: number | null;
  resolvedPMethod: OpenEnaResolvedRankPMethod | null;
  continuityCorrectionApplied: boolean;
  exactTail: OpenEnaExactTailAudit | null;
  warnings: OpenEnaRankWarningCode[];
}

export interface MannWhitneyDimensionRow extends MannWhitneyEstimate {
  dimension: string;
}

export interface EndpointMannWhitneyInference {
  status: "available" | "disabled";
  reason: EndpointMannWhitneyDisabledReason | null;
  provenance: typeof MANN_WHITNEY_PROVENANCE;
  method: typeof MANN_WHITNEY_METHOD | typeof SELECTED_MANN_WHITNEY_METHOD;
  effectDefinition: typeof MANN_WHITNEY_EFFECT_DEFINITION | typeof SELECTED_MANN_WHITNEY_EFFECT_DEFINITION;
  groupOrder: [string, string] | null;
  multiplicityCorrection: "none";
  rows: MannWhitneyDimensionRow[];
}

export function mannWhitneyU(firstValues: readonly number[], secondValues: readonly number[]): MannWhitneyEstimate {
  const result = mannWhitneyRankTest(firstValues, secondValues);
  return {
    status: result.status === "available" ? "estimable" : "not-estimable",
    reason: result.reason === "all-values-tied" ? "zero-rank-variance" : result.reason,
    nFirst: result.nPrimary,
    nSecond: result.nSecondary,
    medianFirst: result.medianPrimary,
    medianSecond: result.medianSecondary,
    uFirst: result.uPrimary,
    uSecond: result.uSecondary,
    z: result.z,
    pValueTwoSided: result.pValueTwoSided,
    rankBiserialFirstVsSecond: result.rankBiserialPrimaryVsSecondary,
    resolvedPMethod: result.resolvedPMethod,
    continuityCorrectionApplied: result.continuityCorrectionApplied,
    exactTail: result.exactTail ? { ...result.exactTail } : null,
    warnings: [...result.warnings],
  };
}

function disabled(reason: EndpointMannWhitneyDisabledReason): EndpointMannWhitneyInference {
  return {
    status: "disabled",
    reason,
    provenance: MANN_WHITNEY_PROVENANCE,
    method: MANN_WHITNEY_METHOD,
    effectDefinition: MANN_WHITNEY_EFFECT_DEFINITION,
    groupOrder: null,
    multiplicityCorrection: "none",
    rows: [],
  };
}

export function buildEndpointMannWhitney(
  result: OpenEnaResult,
  groupColumn: string | null,
  dimensions: readonly string[],
  selectedGroupOrder?: readonly [string, string],
): EndpointMannWhitneyInference {
  assertOpenEnaCapabilityForResult(result, "inference");
  if (result.set.modelType !== "EndPoint") return disabled("endpoint-only");
  if (!groupColumn) return disabled("comparison-group-required");
  if (!selectedGroupOrder && result.groups.length !== 2) return disabled("exactly-two-groups-required");

  const availableGroups = new Set(result.groups.map((group) => group.name));
  const groupOrder: [string, string] = selectedGroupOrder
    ? [selectedGroupOrder[0], selectedGroupOrder[1]]
    : [result.groups[0].name, result.groups[1].name];
  if (groupOrder[0] === groupOrder[1]
    || !availableGroups.has(groupOrder[0])
    || !availableGroups.has(groupOrder[1])) {
    return disabled("exactly-two-groups-required");
  }
  const visibleDimensions = [...new Set(dimensions)];
  const rows = visibleDimensions.map((dimension): MannWhitneyDimensionRow => {
    const valuesFor = (group: string) => result.set.points
      .filter((row) => String(row[groupColumn] ?? "") === group)
      .map((row) => {
        const value = row[dimension];
        if (typeof value !== "number" || !Number.isFinite(value)) {
          throw new Error("nonfinite-coordinate");
        }
        return value;
      });
    return {
      dimension,
      ...mannWhitneyU(valuesFor(groupOrder[0]), valuesFor(groupOrder[1])),
    };
  });

  return {
    status: "available",
    reason: null,
    provenance: MANN_WHITNEY_PROVENANCE,
    method: selectedGroupOrder ? SELECTED_MANN_WHITNEY_METHOD : MANN_WHITNEY_METHOD,
    effectDefinition: selectedGroupOrder ? SELECTED_MANN_WHITNEY_EFFECT_DEFINITION : MANN_WHITNEY_EFFECT_DEFINITION,
    groupOrder,
    multiplicityCorrection: "none",
    rows,
  };
}
