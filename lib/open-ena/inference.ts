import type { OpenEnaResult } from "./types";

export const MANN_WHITNEY_PROVENANCE = "ENA.HK post-projection inference";
export const MANN_WHITNEY_METHOD = "Mann-Whitney U for the first declared group; two-sided normal approximation with average ranks, tie-corrected variance, and a 0.5 continuity correction";
export const MANN_WHITNEY_EFFECT_DEFINITION = "r_rb(first vs second) = 2 * U(first) / (nFirst * nSecond) - 1; positive values indicate higher ranks in the first group";
export const SELECTED_MANN_WHITNEY_METHOD = "Mann-Whitney U for the Primary selected group; two-sided normal approximation with average ranks, tie-corrected variance, and a 0.5 continuity correction";
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

function median(values: readonly number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[midpoint]
    : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

/** Numerical Recipes erfc approximation; adequate for the reported normal approximation. */
function complementaryErrorFunction(value: number) {
  const magnitude = Math.abs(value);
  const t = 1 / (1 + 0.5 * magnitude);
  const approximation = t * Math.exp(
    -magnitude * magnitude
      - 1.26551223
      + t * (1.00002368
        + t * (0.37409196
          + t * (0.09678418
            + t * (-0.18628806
              + t * (0.27886807
                + t * (-1.13520398
                  + t * (1.48851587
                    + t * (-0.82215223
                      + t * 0.17087277)))))))),
  );
  return value >= 0 ? approximation : 2 - approximation;
}

function twoSidedNormalP(z: number) {
  return Math.max(0, Math.min(1, complementaryErrorFunction(Math.abs(z) / Math.SQRT2)));
}

export function mannWhitneyU(firstValues: readonly number[], secondValues: readonly number[]): MannWhitneyEstimate {
  const nFirst = firstValues.length;
  const nSecond = secondValues.length;
  const medianFirst = median(firstValues);
  const medianSecond = median(secondValues);
  if (nFirst === 0 || nSecond === 0) {
    return {
      status: "not-estimable",
      reason: "empty-group",
      nFirst,
      nSecond,
      medianFirst,
      medianSecond,
      uFirst: null,
      uSecond: null,
      z: null,
      pValueTwoSided: null,
      rankBiserialFirstVsSecond: null,
    };
  }

  const ranked = [
    ...firstValues.map((value) => ({ value, group: 0 as const, rank: 0 })),
    ...secondValues.map((value) => ({ value, group: 1 as const, rank: 0 })),
  ].sort((left, right) => left.value - right.value);
  let tieCorrection = 0;
  for (let start = 0; start < ranked.length;) {
    let end = start + 1;
    while (end < ranked.length && ranked[end].value === ranked[start].value) end += 1;
    const averageRank = ((start + 1) + end) / 2;
    for (let index = start; index < end; index += 1) ranked[index].rank = averageRank;
    const tieSize = end - start;
    tieCorrection += tieSize ** 3 - tieSize;
    start = end;
  }

  const rankSumFirst = ranked
    .filter((entry) => entry.group === 0)
    .reduce((sum, entry) => sum + entry.rank, 0);
  const uFirst = rankSumFirst - nFirst * (nFirst + 1) / 2;
  const uSecond = nFirst * nSecond - uFirst;
  const rankBiserialFirstVsSecond = 2 * uFirst / (nFirst * nSecond) - 1;
  const total = nFirst + nSecond;
  const variance = nFirst * nSecond / 12
    * (total + 1 - tieCorrection / (total * (total - 1)));
  if (!(variance > 0) || !Number.isFinite(variance)) {
    return {
      status: "not-estimable",
      reason: "zero-rank-variance",
      nFirst,
      nSecond,
      medianFirst,
      medianSecond,
      uFirst,
      uSecond,
      z: null,
      pValueTwoSided: null,
      rankBiserialFirstVsSecond,
    };
  }

  const expectedU = nFirst * nSecond / 2;
  const continuityDirection = uFirst > expectedU ? 0.5 : uFirst < expectedU ? -0.5 : 0;
  const z = (uFirst - expectedU - continuityDirection) / Math.sqrt(variance);
  return {
    status: "estimable",
    reason: null,
    nFirst,
    nSecond,
    medianFirst,
    medianSecond,
    uFirst,
    uSecond,
    z,
    pValueTwoSided: twoSidedNormalP(z),
    rankBiserialFirstVsSecond,
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
      .map((row) => row[dimension])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
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
