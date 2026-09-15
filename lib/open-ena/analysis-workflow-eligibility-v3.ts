import { canonicalJsonV3 } from "./model-v3/canonical-json";
import { MAX_RETAINED_ANALYSIS_SETS } from "./sets";

export const ANALYSIS_SET_CAPTURE_PREDICATE_IDS_V3 = [
  "current-result",
  "standard-family",
  "endpoint-model",
  "two-retained-dimensions",
  "retention-capacity",
] as const;
export type AnalysisSetCapturePredicateIdV3 =
  (typeof ANALYSIS_SET_CAPTURE_PREDICATE_IDS_V3)[number];

export const ANALYSIS_SET_COMPARE_PREDICATE_IDS_V3 = [
  "two-captured-sets",
  "same-basis-geometry",
] as const;
export type AnalysisSetComparePredicateIdV3 =
  (typeof ANALYSIS_SET_COMPARE_PREDICATE_IDS_V3)[number];

export const WHOLE_PATH_PREDICATE_IDS_V3 = [
  "current-result",
  "distinct-groups",
  "three-supported-axes",
  "identity-confirmed",
  "independent-groups-confirmed",
  "two-ordered-horizons",
] as const;
export type WholePathPredicateIdV3 = (typeof WHOLE_PATH_PREDICATE_IDS_V3)[number];

export interface AnalysisSetCaptureEligibilityInputV3 {
  readonly current: boolean;
  readonly standardFamily: boolean;
  readonly endpointModel: boolean;
  readonly retainedDimensionCount: number;
  readonly retainedSetCount: number;
}

export interface AnalysisSetSameBasisV3 {
  readonly id: string;
  readonly referenceSource: unknown;
  readonly geometry: unknown;
}

export interface WholePathAdmissionFactsV3 {
  readonly current: boolean;
  readonly identityConfirmed: boolean;
  readonly independentGroupsConfirmed: boolean;
  readonly distinctGroups: boolean;
  readonly axes: readonly string[];
  readonly horizonCount: number;
}

export interface WorkflowEligibilityV3<Id extends string> {
  readonly eligible: boolean;
  readonly unmet: readonly Id[];
}

function eligibility<Id extends string>(unmet: readonly Id[]): WorkflowEligibilityV3<Id> {
  return { eligible: unmet.length === 0, unmet };
}

/** UI admission for captureAnalysisSetV3. Does not mint geometry or weaken EndPoint-only capture. */
export function analysisSetCaptureEligibilityV3(
  input: AnalysisSetCaptureEligibilityInputV3,
): WorkflowEligibilityV3<AnalysisSetCapturePredicateIdV3> {
  const unmet: AnalysisSetCapturePredicateIdV3[] = [];
  if (!input.current) unmet.push("current-result");
  if (!input.standardFamily) unmet.push("standard-family");
  if (!input.endpointModel) unmet.push("endpoint-model");
  if (input.retainedDimensionCount < 2) unmet.push("two-retained-dimensions");
  if (input.retainedSetCount >= MAX_RETAINED_ANALYSIS_SETS) unmet.push("retention-capacity");
  return eligibility(unmet);
}

export function analysisSetsShareCompatibleGeometryV3(
  primary: AnalysisSetSameBasisV3,
  secondary: AnalysisSetSameBasisV3,
): boolean {
  return (
    canonicalJsonV3(primary.referenceSource) === canonicalJsonV3(secondary.referenceSource)
    && canonicalJsonV3(primary.geometry) === canonicalJsonV3(secondary.geometry)
  );
}

/** UI admission for compareAnalysisSetsV3. Same-basis remains required even before two sets exist. */
export function analysisSetCompareEligibilityV3(
  sets: readonly AnalysisSetSameBasisV3[],
): WorkflowEligibilityV3<AnalysisSetComparePredicateIdV3> {
  const primary = sets.at(-2);
  const secondary = sets.at(-1);
  const unmet: AnalysisSetComparePredicateIdV3[] = [];
  if (!primary || !secondary || primary.id === secondary.id) unmet.push("two-captured-sets");
  if (
    !primary
    || !secondary
    || primary.id === secondary.id
    || !analysisSetsShareCompatibleGeometryV3(primary, secondary)
  ) unmet.push("same-basis-geometry");
  return eligibility(unmet);
}

export function wholePathAdmissionEligibilityV3(
  facts: WholePathAdmissionFactsV3,
): WorkflowEligibilityV3<WholePathPredicateIdV3> {
  const unmet: WholePathPredicateIdV3[] = [];
  if (!facts.current) unmet.push("current-result");
  if (!facts.distinctGroups) unmet.push("distinct-groups");
  if (new Set(facts.axes).size !== 3) unmet.push("three-supported-axes");
  if (!facts.identityConfirmed) unmet.push("identity-confirmed");
  if (!facts.independentGroupsConfirmed) unmet.push("independent-groups-confirmed");
  if (facts.horizonCount < 2) unmet.push("two-ordered-horizons");
  return eligibility(unmet);
}

export function analysisSetCapturePredicateLabelV3(
  id: AnalysisSetCapturePredicateIdV3,
  copy: Readonly<Record<AnalysisSetCapturePredicateIdV3, string>>,
): string {
  switch (id) {
    case "current-result":
    case "standard-family":
    case "endpoint-model":
    case "two-retained-dimensions":
    case "retention-capacity":
      return copy[id];
    default: {
      const exhaustive: never = id;
      throw new TypeError(`Unknown analysis-set capture predicate: ${String(exhaustive)}`);
    }
  }
}

export function analysisSetComparePredicateLabelV3(
  id: AnalysisSetComparePredicateIdV3,
  copy: Readonly<Record<AnalysisSetComparePredicateIdV3, string>>,
): string {
  switch (id) {
    case "two-captured-sets":
    case "same-basis-geometry":
      return copy[id];
    default: {
      const exhaustive: never = id;
      throw new TypeError(`Unknown analysis-set compare predicate: ${String(exhaustive)}`);
    }
  }
}

export function wholePathPredicateLabelV3(
  id: WholePathPredicateIdV3,
  copy: Readonly<Record<WholePathPredicateIdV3, string>>,
): string {
  switch (id) {
    case "current-result":
    case "distinct-groups":
    case "three-supported-axes":
    case "identity-confirmed":
    case "independent-groups-confirmed":
    case "two-ordered-horizons":
      return copy[id];
    default: {
      const exhaustive: never = id;
      throw new TypeError(`Unknown whole-path predicate: ${String(exhaustive)}`);
    }
  }
}
