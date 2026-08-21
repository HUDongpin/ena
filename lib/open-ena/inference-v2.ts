import {
  OpenEnaLongitudinalIntegrityError,
  sliceLongitudinalIndependentPeriod,
  sliceLongitudinalPairedPeriods,
  sliceLongitudinalRepeatedPeriods,
  type OpenEnaLongitudinalComparisonFrame,
} from "./longitudinal";
import { markOpenEnaInferenceCoordinatorAuthorityV2 } from "./inference-authority";
import {
  OPEN_ENA_RANK_INFERENCE_METHOD,
  friedmanRankTest,
  holmAdjustPlanned,
  mannWhitneyRankTest,
  wilcoxonSignedRankTest,
  type OpenEnaExactTailAudit,
  type OpenEnaMinimumAttainableTwoSidedP,
  type OpenEnaRankWarningCode,
  type OpenEnaResolvedRankPMethod,
} from "./rank-inference";
import {
  sameOpenEnaConfig,
  type DatasetHashKind,
  type OpenEnaConfig,
  type OpenEnaResult,
} from "./types";

export type OpenEnaInferenceRequestV2 =
  | {
      kind: "endpoint-independent";
      primaryGroup: string;
      secondaryGroup: string;
      axes: [string, string];
    }
  | {
      kind: "trajectory-independent-period";
      repeatedEntityColumns: string[];
      timeColumn: string;
      period: string;
      primaryGroup: string;
      secondaryGroup: string;
      axes: [string, string];
    }
  | {
      kind: "trajectory-paired-periods";
      repeatedEntityColumns: string[];
      timeColumn: string;
      group: string | null;
      earlierPeriod: string;
      laterPeriod: string;
      axes: [string, string];
      cohortPolicy: "pairwise-complete";
    }
  | {
      kind: "trajectory-repeated-periods";
      repeatedEntityColumns: string[];
      timeColumn: string;
      group: string | null;
      periods: string[];
      axes: [string, string];
      cohortPolicy: "all-period-complete";
      posthocContrasts: "all-period-pairs";
    };

export type OpenEnaInferenceStatusV2 = "available" | "not-estimable" | "disabled";

export type OpenEnaInferenceReasonCodeV2 =
  | "design-not-confirmed"
  | "identity-not-confirmed"
  | "identity-columns-invalid"
  | "identity-component-empty"
  | "time-column-invalid"
  | "axes-invalid"
  | "group-required"
  | "group-invalid"
  | "groups-must-differ"
  | "period-invalid"
  | "periods-must-differ"
  | "at-least-three-periods-required"
  | "empty-group"
  | "insufficient-ranked-observations"
  | "all-values-tied"
  | "all-zero-differences"
  | "no-complete-blocks";

export type OpenEnaInferenceIntegrityCodeV2 =
  | "binding-mismatch"
  | "identity-collision"
  | "group-instability"
  | "entity-period-instability"
  | "nonfinite-coordinate";

const INTEGRITY_MESSAGES: Record<OpenEnaInferenceIntegrityCodeV2, string> = {
  "binding-mismatch": "Inference inputs do not match the immutable successful-result binding.",
  "identity-collision": "Repeated-entity identity maps across incompatible comparison groups.",
  "group-instability": "Repeated-entity comparison-group membership is unstable.",
  "entity-period-instability": "The compact inference unit mapping is unstable.",
  "nonfinite-coordinate": "A required unflipped model coordinate is not finite.",
};

export class OpenEnaInferenceIntegrityError extends Error {
  readonly code: OpenEnaInferenceIntegrityCodeV2;

  constructor(code: OpenEnaInferenceIntegrityCodeV2) {
    super(INTEGRITY_MESSAGES[code]);
    this.name = "OpenEnaInferenceIntegrityError";
    this.code = code;
  }
}

export interface OpenEnaInferenceCurrentBindingV2 {
  datasetNormalizedUtf8TextSha256: string;
  datasetHashKind: DatasetHashKind;
  configuration: OpenEnaConfig;
}

export interface OpenEnaInferenceCoordinatorInputV2 {
  request: OpenEnaInferenceRequestV2;
  result: OpenEnaResult;
  currentBinding: OpenEnaInferenceCurrentBindingV2;
  comparisonFrame?: OpenEnaLongitudinalComparisonFrame;
}

interface OpenEnaInferenceResultSnapshotV2 {
  analyzedAt: string;
  dimensions: string[];
  groups: Array<{ name: string }>;
  projectionReferenceFitMethod: "svd" | "mean" | null;
  provenanceBinding?: {
    datasetNormalizedUtf8TextSha256: string;
    datasetHashKind?: DatasetHashKind;
    configuration: OpenEnaConfig;
  };
  set: {
    modelType: OpenEnaResult["set"]["modelType"];
    functionParams: Pick<
      OpenEnaResult["set"]["functionParams"],
      "model" | "window" | "windowSizeBack" | "windowSizeForward" | "weightBy"
    >;
    units: string[];
    conversation: string[];
    codes: string[];
    rotation: { codes: string[] };
    points: Array<Record<string, unknown>>;
  };
}

interface OpenEnaInferenceCoordinatorSnapshotV2 {
  request: OpenEnaInferenceRequestV2;
  result: OpenEnaInferenceResultSnapshotV2;
  currentBinding: OpenEnaInferenceCurrentBindingV2;
  comparisonFrame?: OpenEnaLongitudinalComparisonFrame;
}

export const OPEN_ENA_INFERENCE_TRAJECTORY_MAPPING_CONTRACT_VERSION_V2 = 1 as const;

export interface OpenEnaInferenceTrajectoryMappingV2 {
  contractVersion: typeof OPEN_ENA_INFERENCE_TRAJECTORY_MAPPING_CONTRACT_VERSION_V2;
  repeatedEntityColumns: string[];
  identityConfirmed: true;
  timeColumn: string;
  timeOrder: string[];
}

export interface OpenEnaInferenceBindingV2 {
  analyzedAt: string;
  dataset: {
    normalizedUtf8TextSha256: string;
    hashKind: DatasetHashKind;
  };
  modelType: OpenEnaConfig["model"];
  configuration: OpenEnaConfig;
  axes: [string, string];
  /** Null for endpoint or an inference disabled before a trajectory mapping was confirmed. */
  trajectoryMapping: OpenEnaInferenceTrajectoryMappingV2 | null;
}

export const OPEN_ENA_INFERENCE_PROVENANCE_V2 = "ENA.HK post-projection inference" as const;

export interface OpenEnaInferenceFamilyV2 {
  role: "comparison" | "omnibus" | "posthoc";
  familyId: string;
  familySizePlanned: number;
  memberIds: string[];
}

export interface OpenEnaInferenceRowCommonV2 {
  axisIndex: 0 | 1;
  axis: string;
  status: "available" | "not-estimable";
  reason: OpenEnaInferenceReasonCodeV2 | null;
  familyId: string;
  memberId: string;
  familySizePlanned: number;
  pRaw: number | null;
  pHolm: number | null;
  holmRank: number | null;
  holmMultiplier: number | null;
  resolvedPMethod: OpenEnaResolvedRankPMethod | null;
  continuityCorrectionApplied: boolean;
  tieGroupCount: number;
  tiedObservationCount: number;
  tieCorrectionSum: number;
  warnings: OpenEnaRankWarningCode[];
}

export interface OpenEnaEndpointIndependentInferenceLedgerV2 {
  candidateEntityCount: number;
  primaryAvailableCount: number;
  secondaryAvailableCount: number;
  includedEntityCount: number;
  includedAnalyticPointCount: number;
}

export interface OpenEnaTrajectoryIndependentInferenceLedgerV2 {
  candidateEntityCount: number;
  primaryAvailableCount: number;
  secondaryAvailableCount: number;
  includedEntityCount: number;
  includedCompactPointCount: number;
  includedSourcePointCount: number;
}

export interface OpenEnaPairedInferenceLedgerV2 {
  candidateEntityCount: number;
  earlierAvailableCount: number;
  laterAvailableCount: number;
  matchedEntityCount: number;
  earlierOnlyCount: number;
  laterOnlyCount: number;
  missingPairCount: number;
  earlierAvailableCompactPointCount: number;
  laterAvailableCompactPointCount: number;
  earlierAvailableSourcePointCount: number;
  laterAvailableSourcePointCount: number;
  matchedCompactPointCount: number;
  matchedSourcePointCount: number;
  axes: Array<{
    axisIndex: 0 | 1;
    zeroDifferenceCount: number;
    nonzeroDifferenceCount: number;
    rankedCount: number;
  }>;
}

export interface OpenEnaRepeatedInferenceLedgerV2 {
  candidateEntityCount: number;
  availableByPeriod: Array<{
    periodIndex: number;
    availableEntityCount: number;
    availableCompactPointCount: number;
    availableSourcePointCount: number;
  }>;
  completeBlockCount: number;
  completeBlockCompactPointCount: number;
  completeBlockSourcePointCount: number;
  missingAnySelectedPeriodCount: number;
}

export interface OpenEnaMannWhitneyInferenceRowV2 extends OpenEnaInferenceRowCommonV2 {
  test: "mann-whitney-u";
  effectDirection: "positive-primary-higher-ranks";
  nPrimary: number;
  nSecondary: number;
  medianPrimary: number | null;
  medianSecondary: number | null;
  uPrimary: number | null;
  uSecondary: number | null;
  z: number | null;
  rankBiserialPrimaryVsSecondary: number | null;
  exactTail: OpenEnaExactTailAudit | null;
}

export interface OpenEnaWilcoxonInferenceRowV2 extends OpenEnaInferenceRowCommonV2 {
  test: "wilcoxon-signed-rank";
  effectDirection: "positive-later-higher";
  earlierPeriodIndex: number;
  laterPeriodIndex: number;
  differenceDirection: "later-minus-earlier";
  nMatched: number;
  nMissing: number;
  nPositive: number;
  nNegative: number;
  nZero: number;
  nNonzero: number;
  nRanked: number;
  medianDifference: number | null;
  q1Difference: number | null;
  q3Difference: number | null;
  iqrDifference: number | null;
  wPositive: number | null;
  wNegative: number | null;
  t: number | null;
  z: number | null;
  rankBiserialLaterVsEarlier: number | null;
  exactTail: OpenEnaExactTailAudit | null;
  minimumAttainableTwoSidedP: OpenEnaMinimumAttainableTwoSidedP | null;
}

export interface OpenEnaFriedmanInferenceRowV2 extends OpenEnaInferenceRowCommonV2 {
  test: "friedman";
  effectDirection: "non-directional";
  nComplete: number;
  nMissingCompleteBlocks: number;
  nPeriods: number;
  q: number | null;
  degreesFreedom: number | null;
  kendallsW: number | null;
  exactTail: OpenEnaExactTailAudit | null;
}

interface OpenEnaInferenceResultBaseV2<Request extends OpenEnaInferenceRequestV2, Scope, Ledger> {
  schemaVersion: 2;
  kind: Request["kind"];
  analyzedAt: string;
  request: Request;
  binding: OpenEnaInferenceBindingV2;
  coordinateSystem: "unflipped-model-coordinates";
  provenance: typeof OPEN_ENA_INFERENCE_PROVENANCE_V2;
  method: typeof OPEN_ENA_RANK_INFERENCE_METHOD;
  status: OpenEnaInferenceStatusV2;
  reason: OpenEnaInferenceReasonCodeV2 | null;
  scope: Scope;
  ledger: Ledger | null;
  families: OpenEnaInferenceFamilyV2[];
  warnings: OpenEnaRankWarningCode[];
}

export type OpenEnaEndpointInferenceResultV2 = OpenEnaInferenceResultBaseV2<
  Extract<OpenEnaInferenceRequestV2, { kind: "endpoint-independent" }>,
  {
    design: "independent-endpoint-groups";
    analysisUnit: "endpoint-analytic-unit";
    temporalScope: "endpoint-common-period-not-verified";
    primaryGroup: string;
    secondaryGroup: string;
  },
  OpenEnaEndpointIndependentInferenceLedgerV2
> & { rows: OpenEnaMannWhitneyInferenceRowV2[] };

export type OpenEnaTrajectoryIndependentInferenceResultV2 = OpenEnaInferenceResultBaseV2<
  Extract<OpenEnaInferenceRequestV2, { kind: "trajectory-independent-period" }>,
  {
    design: "independent-groups-at-one-period";
    analysisUnit: "compact-entity-period-point";
    timeColumn: string;
    period: string;
    primaryGroup: string;
    secondaryGroup: string;
  },
  OpenEnaTrajectoryIndependentInferenceLedgerV2
> & { rows: OpenEnaMannWhitneyInferenceRowV2[] };

export type OpenEnaTrajectoryPairedInferenceResultV2 = OpenEnaInferenceResultBaseV2<
  Extract<OpenEnaInferenceRequestV2, { kind: "trajectory-paired-periods" }>,
  {
    design: "same-entities-at-two-periods";
    analysisUnit: "repeated-entity";
    timeColumn: string;
    group: string | null;
    earlierPeriod: string;
    laterPeriod: string;
    differenceDirection: "later-minus-earlier";
    cohortPolicy: "pairwise-complete";
  },
  OpenEnaPairedInferenceLedgerV2
> & { rows: OpenEnaWilcoxonInferenceRowV2[] };

export type OpenEnaTrajectoryRepeatedInferenceResultV2 = OpenEnaInferenceResultBaseV2<
  Extract<OpenEnaInferenceRequestV2, { kind: "trajectory-repeated-periods" }>,
  {
    design: "same-entities-at-repeated-periods";
    analysisUnit: "repeated-entity";
    timeColumn: string;
    group: string | null;
    periods: string[];
    cohortPolicy: "all-period-complete";
    posthocContrasts: "all-period-pairs";
  },
  OpenEnaRepeatedInferenceLedgerV2
> & {
  omnibusRows: OpenEnaFriedmanInferenceRowV2[];
  followupRows: OpenEnaWilcoxonInferenceRowV2[];
};

export type OpenEnaInferenceResultV2 =
  | OpenEnaEndpointInferenceResultV2
  | OpenEnaTrajectoryIndependentInferenceResultV2
  | OpenEnaTrajectoryPairedInferenceResultV2
  | OpenEnaTrajectoryRepeatedInferenceResultV2;

const WARNING_ORDER: readonly OpenEnaRankWarningCode[] = [
  "small-sample",
  "discrete-attainable-p",
  "ties-present",
  "zero-differences-present",
  "missing-pairs",
  "missing-complete-blocks",
  "signed-rank-symmetry-assumption",
  "independent-entity-assumption",
  "cluster-independence-unverified",
  "accumulated-trajectory-path-dependence",
  "arbitrary-axis-sign",
  "mr1-circularity",
];

function cloneConfig(config: OpenEnaConfig): OpenEnaConfig {
  return {
    unitColumns: [...config.unitColumns],
    conversationColumns: [...config.conversationColumns],
    groupColumn: config.groupColumn,
    codes: [...config.codes],
    model: config.model,
    window: config.window,
    windowSizeBack: config.windowSizeBack,
    windowSizeForward: config.windowSizeForward,
    weightBy: config.weightBy,
    rotation: config.rotation,
    referenceRotationId: config.referenceRotationId,
    centerAlignToOrigin: config.centerAlignToOrigin,
  };
}

function cloneRequest<Request extends OpenEnaInferenceRequestV2>(request: Request): Request {
  switch (request.kind) {
    case "endpoint-independent":
      return {
        kind: request.kind,
        primaryGroup: request.primaryGroup,
        secondaryGroup: request.secondaryGroup,
        axes: [...request.axes],
      } as Request;
    case "trajectory-independent-period":
      return {
        kind: request.kind,
        repeatedEntityColumns: [...request.repeatedEntityColumns],
        timeColumn: request.timeColumn,
        period: request.period,
        primaryGroup: request.primaryGroup,
        secondaryGroup: request.secondaryGroup,
        axes: [...request.axes],
      } as Request;
    case "trajectory-paired-periods":
      return {
        kind: request.kind,
        repeatedEntityColumns: [...request.repeatedEntityColumns],
        timeColumn: request.timeColumn,
        group: request.group,
        earlierPeriod: request.earlierPeriod,
        laterPeriod: request.laterPeriod,
        axes: [...request.axes],
        cohortPolicy: request.cohortPolicy,
      } as Request;
    case "trajectory-repeated-periods":
      return {
        kind: request.kind,
        repeatedEntityColumns: [...request.repeatedEntityColumns],
        timeColumn: request.timeColumn,
        group: request.group,
        periods: [...request.periods],
        axes: [...request.axes],
        cohortPolicy: request.cohortPolicy,
        posthocContrasts: request.posthocContrasts,
      } as Request;
  }
}

function cloneComparisonFrame(
  frame: OpenEnaLongitudinalComparisonFrame,
): OpenEnaLongitudinalComparisonFrame {
  return {
    kind: frame.kind,
    coordinateSystem: frame.coordinateSystem,
    binding: {
      analyzedAt: frame.binding.analyzedAt,
      datasetNormalizedUtf8TextSha256: frame.binding.datasetNormalizedUtf8TextSha256,
      datasetHashKind: frame.binding.datasetHashKind,
      modelType: frame.binding.modelType,
      configuration: cloneConfig(frame.binding.configuration),
      axes: [...frame.binding.axes],
    },
    repeatedEntityColumns: [...frame.repeatedEntityColumns],
    identityConfirmed: frame.identityConfirmed,
    eligibility: { ...frame.eligibility },
    timeColumn: frame.timeColumn,
    timeOrder: [...frame.timeOrder],
    axes: [...frame.axes],
    groups: frame.groups.map((group) => ({ ...group })),
    points: frame.points.map((point) => ({
      entityToken: point.entityToken,
      group: { ...point.group },
      time: point.time,
      timeIndex: point.timeIndex,
      x: point.x,
      y: point.y,
      sourcePointCount: point.sourcePointCount,
    })),
  };
}

function snapshotCoordinatorInput(
  input: OpenEnaInferenceCoordinatorInputV2,
): OpenEnaInferenceCoordinatorSnapshotV2 {
  const request = cloneRequest(input.request);
  const currentConfiguration = cloneConfig(input.currentBinding.configuration);
  const pointColumns = new Set<string>(["ENA_UNIT", ...request.axes]);
  if (currentConfiguration.groupColumn) pointColumns.add(currentConfiguration.groupColumn);
  const snapshot: OpenEnaInferenceCoordinatorSnapshotV2 = {
    request,
    result: {
      analyzedAt: input.result.analyzedAt,
      dimensions: [...input.result.dimensions],
      groups: input.result.groups.map((group) => ({ name: group.name })),
      projectionReferenceFitMethod: input.result.projectionReference?.fit.method ?? null,
      ...(input.result.provenanceBinding
        ? {
            provenanceBinding: {
              datasetNormalizedUtf8TextSha256:
                input.result.provenanceBinding.datasetNormalizedUtf8TextSha256,
              datasetHashKind: input.result.provenanceBinding.datasetHashKind,
              configuration: cloneConfig(input.result.provenanceBinding.configuration),
            },
          }
        : {}),
      set: {
        modelType: input.result.set.modelType,
        functionParams: {
          model: input.result.set.functionParams.model,
          window: input.result.set.functionParams.window,
          windowSizeBack: input.result.set.functionParams.windowSizeBack,
          windowSizeForward: input.result.set.functionParams.windowSizeForward,
          weightBy: input.result.set.functionParams.weightBy,
        },
        units: [...input.result.set.units],
        conversation: [...input.result.set.conversation],
        codes: [...input.result.set.codes],
        rotation: { codes: [...input.result.set.rotation.codes] },
        points: input.result.set.points.map((point) => Object.fromEntries(
          [...pointColumns].map((column) => {
            const value = point[column];
            return [column, value !== null && typeof value === "object" ? null : value];
          }),
        )),
      },
    },
    currentBinding: {
      datasetNormalizedUtf8TextSha256:
        input.currentBinding.datasetNormalizedUtf8TextSha256,
      datasetHashKind: input.currentBinding.datasetHashKind,
      configuration: currentConfiguration,
    },
    ...(input.comparisonFrame
      ? { comparisonFrame: cloneComparisonFrame(input.comparisonFrame) }
      : {}),
  };
  return deepFreeze(snapshot);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function sameOrdered(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function warningUnion(...groups: readonly (readonly OpenEnaRankWarningCode[])[]) {
  const included = new Set(groups.flat());
  return WARNING_ORDER.filter((warning) => included.has(warning));
}

function canonicalIso(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function normalizedHash(value: string) {
  return /^[0-9a-f]{64}$/iu.test(value) ? value.toLowerCase() : null;
}

function validHashKind(value: unknown): value is DatasetHashKind {
  return value === "normalized-utf8-text-sha256"
    || value === "normalized-utf8-csv-text-sha256"
    || value === "canonical-first-xlsx-worksheet-v1-sha256";
}

function finiteCoordinate(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new OpenEnaInferenceIntegrityError("nonfinite-coordinate");
  }
  return value;
}

function sumSourcePointCounts(points: readonly { sourcePointCount: number }[]) {
  let total = 0;
  for (const point of points) {
    total += point.sourcePointCount;
    if (!Number.isSafeInteger(total) || total < 0) {
      throw new OpenEnaInferenceIntegrityError("entity-period-instability");
    }
  }
  return total;
}

function requestAxesAreValid(
  result: OpenEnaInferenceResultSnapshotV2,
  axes: readonly string[],
) {
  return Array.isArray(axes) && axes.length === 2 && axes[0] !== axes[1]
    && axes.every((axis) => typeof axis === "string" && result.dimensions.includes(axis));
}

function validateBinding(input: OpenEnaInferenceCoordinatorSnapshotV2): OpenEnaInferenceBindingV2 {
  const { result, currentBinding, request } = input;
  const currentHash = normalizedHash(currentBinding.datasetNormalizedUtf8TextSha256);
  const provenance = result.provenanceBinding;
  const provenanceHash = provenance
    ? normalizedHash(provenance.datasetNormalizedUtf8TextSha256)
    : null;
  const expectedWindowSizeBack = currentBinding.configuration.window === "Conversation"
    ? Number.POSITIVE_INFINITY
    : currentBinding.configuration.windowSizeBack;
  const expectedWindowSizeForward = currentBinding.configuration.window === "Conversation"
    ? 0
    : currentBinding.configuration.windowSizeForward;
  if (!currentHash || !provenance || !provenanceHash || currentHash !== provenanceHash
    || !validHashKind(currentBinding.datasetHashKind)
    || !provenance.datasetHashKind
    || !validHashKind(provenance.datasetHashKind)
    || provenance.datasetHashKind !== currentBinding.datasetHashKind
    || !sameOpenEnaConfig(provenance.configuration, currentBinding.configuration)
    || result.set.modelType !== currentBinding.configuration.model
    || result.set.functionParams.model !== currentBinding.configuration.model
    || result.set.functionParams.window !== currentBinding.configuration.window
    || result.set.functionParams.windowSizeBack !== expectedWindowSizeBack
    || result.set.functionParams.windowSizeForward !== expectedWindowSizeForward
    || result.set.functionParams.weightBy !== currentBinding.configuration.weightBy
    || !sameOrdered(result.set.units, currentBinding.configuration.unitColumns)
    || !sameOrdered(result.set.conversation, currentBinding.configuration.conversationColumns)
    || !sameOrdered(result.set.codes, currentBinding.configuration.codes)
    || !sameOrdered(result.set.rotation.codes, currentBinding.configuration.codes)
    || !canonicalIso(result.analyzedAt)) {
    throw new OpenEnaInferenceIntegrityError("binding-mismatch");
  }
  const resultGroupNames = result.groups.map((group) => group.name);
  if (resultGroupNames.some((name) => typeof name !== "string" || name.length === 0)
    || new Set(resultGroupNames).size !== resultGroupNames.length) {
    throw new OpenEnaInferenceIntegrityError("group-instability");
  }
  return {
    analyzedAt: result.analyzedAt,
    dataset: {
      normalizedUtf8TextSha256: currentHash,
      hashKind: currentBinding.datasetHashKind,
    },
    modelType: currentBinding.configuration.model,
    configuration: cloneConfig(currentBinding.configuration),
    axes: [...request.axes],
    trajectoryMapping: null,
  };
}

function withValidatedTrajectoryMapping(
  binding: OpenEnaInferenceBindingV2,
  frame: OpenEnaLongitudinalComparisonFrame,
): OpenEnaInferenceBindingV2 {
  return deepFreeze({
    ...binding,
    trajectoryMapping: {
      contractVersion: OPEN_ENA_INFERENCE_TRAJECTORY_MAPPING_CONTRACT_VERSION_V2,
      repeatedEntityColumns: [...frame.repeatedEntityColumns],
      identityConfirmed: true as const,
      timeColumn: frame.timeColumn,
      timeOrder: [...frame.timeOrder],
    },
  });
}

function designWarnings(
  binding: OpenEnaInferenceBindingV2,
  axis: string,
  result: OpenEnaInferenceResultSnapshotV2,
): OpenEnaRankWarningCode[] {
  const warnings: OpenEnaRankWarningCode[] = [
    "independent-entity-assumption",
    "cluster-independence-unverified",
    "arbitrary-axis-sign",
  ];
  if (binding.modelType === "AccumulatedTrajectory") {
    warnings.push("accumulated-trajectory-path-dependence");
  }
  const meanDerived = binding.configuration.rotation === "mean"
    || (binding.configuration.rotation === "reference"
      && result.projectionReferenceFitMethod === "mean");
  if (meanDerived && /^(?:G?MR1)$/iu.test(axis)) {
    warnings.push("mr1-circularity");
  }
  return warningUnion(warnings);
}

async function sha256(value: unknown) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new OpenEnaInferenceIntegrityError("binding-mismatch");
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

interface FamilyIdentityScope {
  binding: OpenEnaInferenceBindingV2;
  design: OpenEnaInferenceRequestV2["kind"];
  axisIndexes: number[];
  groupIndexes: number[];
  periodIndexes: number[];
}

function canonicalIdentityBinding(binding: OpenEnaInferenceBindingV2) {
  const configuration = binding.configuration;
  return {
    analyzedAt: binding.analyzedAt,
    dataset: {
      normalizedUtf8TextSha256: binding.dataset.normalizedUtf8TextSha256,
      hashKind: binding.dataset.hashKind,
    },
    modelType: binding.modelType,
    configuration: {
      unitColumns: [...configuration.unitColumns],
      conversationColumns: [...configuration.conversationColumns],
      groupColumn: configuration.groupColumn,
      codes: [...configuration.codes],
      model: configuration.model,
      window: configuration.window,
      windowSizeBack: configuration.windowSizeBack,
      windowSizeForward: configuration.windowSizeForward,
      weightBy: configuration.weightBy,
      rotation: configuration.rotation,
      referenceRotationId: configuration.referenceRotationId,
      centerAlignToOrigin: configuration.centerAlignToOrigin,
    },
    axes: [...binding.axes],
    trajectoryMapping: binding.trajectoryMapping
      ? {
          contractVersion: binding.trajectoryMapping.contractVersion,
          repeatedEntityColumns: [...binding.trajectoryMapping.repeatedEntityColumns],
          identityConfirmed: binding.trajectoryMapping.identityConfirmed,
          timeColumn: binding.trajectoryMapping.timeColumn,
          timeOrder: [...binding.trajectoryMapping.timeOrder],
        }
      : null,
  };
}

async function familyIdentity(
  role: OpenEnaInferenceFamilyV2["role"],
  scope: FamilyIdentityScope,
) {
  return `openena-family-v2-${await sha256({
    contract: "open-ena-rank-inference-v2",
    method: OPEN_ENA_RANK_INFERENCE_METHOD,
    role,
    binding: canonicalIdentityBinding(scope.binding),
    design: scope.design,
    axisIndexes: scope.axisIndexes,
    groupIndexes: scope.groupIndexes,
    periodIndexes: scope.periodIndexes,
  })}`;
}

async function memberIdentity(
  familyId: string,
  role: "axis" | "axis-period-pair",
  axisIndex: number,
  earlierPeriodIndex?: number,
  laterPeriodIndex?: number,
) {
  return `openena-member-v2-${await sha256({
    contract: "open-ena-rank-inference-member-v2",
    familyId,
    role,
    axisIndex,
    ...(earlierPeriodIndex === undefined ? {} : { earlierPeriodIndex }),
    ...(laterPeriodIndex === undefined ? {} : { laterPeriodIndex }),
  })}`;
}

function mapLongitudinalError(error: unknown): OpenEnaInferenceReasonCodeV2 {
  if (!(error instanceof OpenEnaLongitudinalIntegrityError)) throw error;
  if (error.code === "binding-mismatch"
    || error.code === "identity-collision"
    || error.code === "group-instability"
    || error.code === "entity-period-instability"
    || error.code === "nonfinite-coordinate") {
    throw new OpenEnaInferenceIntegrityError(error.code);
  }
  return error.code;
}

function requestIdentityIsValid(
  request: Exclude<OpenEnaInferenceRequestV2, { kind: "endpoint-independent" }>,
  configuration: OpenEnaConfig,
) {
  const structurallyValid = Array.isArray(request.repeatedEntityColumns)
    && request.repeatedEntityColumns.length > 0
    && request.repeatedEntityColumns.every((column) => (
      typeof column === "string" && column.length > 0 && configuration.unitColumns.includes(column)
    ))
    && new Set(request.repeatedEntityColumns).size === request.repeatedEntityColumns.length;
  if (!structurallyValid) return false;
  return !(configuration.groupColumn
    && request.repeatedEntityColumns.length === 1
    && request.repeatedEntityColumns[0] === configuration.groupColumn
    && configuration.unitColumns.some((column) => column !== configuration.groupColumn));
}

function validateFrameBinding(
  frame: OpenEnaLongitudinalComparisonFrame | undefined,
  request: Exclude<OpenEnaInferenceRequestV2, { kind: "endpoint-independent" }>,
  binding: OpenEnaInferenceBindingV2,
  result: OpenEnaInferenceResultSnapshotV2,
) {
  if (!frame || frame.kind !== "open-ena-longitudinal-comparison-frame"
    || frame.coordinateSystem !== "unflipped-model-coordinates"
    || frame.binding.analyzedAt !== binding.analyzedAt
    || frame.binding.datasetNormalizedUtf8TextSha256?.toLowerCase()
      !== binding.dataset.normalizedUtf8TextSha256
    || frame.binding.datasetHashKind !== binding.dataset.hashKind
    || frame.binding.modelType !== binding.modelType
    || !sameOpenEnaConfig(frame.binding.configuration, binding.configuration)
    || !sameOrdered(frame.axes, binding.axes)
    || !sameOrdered(frame.binding.axes, binding.axes)
    || !sameOrdered(frame.repeatedEntityColumns, request.repeatedEntityColumns)
    || frame.timeColumn !== request.timeColumn) {
    throw new OpenEnaInferenceIntegrityError("binding-mismatch");
  }
  if (new Set(frame.groups.map((group) => group.name)).size !== frame.groups.length
    || new Set(frame.groups.map((group) => group.index)).size !== frame.groups.length
    || frame.groups.some((group) => !Number.isSafeInteger(group.index) || group.index < 0)) {
    throw new OpenEnaInferenceIntegrityError("group-instability");
  }
  const expectedGroupNames = binding.configuration.groupColumn
    ? result.groups.map((group) => group.name).sort((left, right) => (
        left < right ? -1 : left > right ? 1 : 0
      ))
    : ["All units"];
  if (frame.groups.length !== expectedGroupNames.length
    || frame.groups.some((group, index) => (
      group.name !== expectedGroupNames[index]
      || group.index !== index
      || group.role !== (binding.configuration.groupColumn ? "configured-group" : "all-units")
    ))) {
    throw new OpenEnaInferenceIntegrityError("group-instability");
  }
  if (new Set(frame.timeOrder).size !== frame.timeOrder.length) {
    throw new OpenEnaInferenceIntegrityError("entity-period-instability");
  }
  const frameGroupByName = new Map(frame.groups.map((group) => [group.name, group]));
  const timeIndexByName = new Map(frame.timeOrder.map((time, index) => [time, index]));
  const groupNameByToken = new Map<string, string>();
  const timeIndexesByToken = new Map<string, Set<number>>();
  for (const point of frame.points) {
    if (typeof point.entityToken !== "string"
      || point.entityToken.length === 0
      || !Number.isSafeInteger(point.sourcePointCount)
      || point.sourcePointCount < 1
      || timeIndexByName.get(point.time) !== point.timeIndex) {
      throw new OpenEnaInferenceIntegrityError("entity-period-instability");
    }
    finiteCoordinate(point.x);
    finiteCoordinate(point.y);
    const stableGroup = frameGroupByName.get(point.group.name);
    if (!stableGroup
      || stableGroup.index !== point.group.index
      || stableGroup.role !== point.group.role) {
      throw new OpenEnaInferenceIntegrityError("group-instability");
    }
    const priorGroupName = groupNameByToken.get(point.entityToken);
    if (priorGroupName !== undefined && priorGroupName !== point.group.name) {
      throw new OpenEnaInferenceIntegrityError("identity-collision");
    }
    groupNameByToken.set(point.entityToken, point.group.name);
    const observedTimeIndexes = timeIndexesByToken.get(point.entityToken) ?? new Set<number>();
    if (observedTimeIndexes.has(point.timeIndex)) {
      throw new OpenEnaInferenceIntegrityError("entity-period-instability");
    }
    observedTimeIndexes.add(point.timeIndex);
    timeIndexesByToken.set(point.entityToken, observedTimeIndexes);
  }
  return frame;
}

function overallStatus(rows: readonly OpenEnaInferenceRowCommonV2[]) {
  return rows.some((row) => row.status === "available") ? "available" as const : "not-estimable" as const;
}

function overallReason(
  rows: readonly OpenEnaInferenceRowCommonV2[],
  preferred?: OpenEnaInferenceReasonCodeV2,
) {
  if (rows.some((row) => row.status === "available")) return null;
  if (preferred) return preferred;
  const reasons = [...new Set(rows.map((row) => row.reason).filter((reason) => reason !== null))];
  return reasons.length === 1 ? reasons[0] : "insufficient-ranked-observations";
}

function finalizeHolmFamily<Row extends OpenEnaInferenceRowCommonV2>(
  role: OpenEnaInferenceFamilyV2["role"],
  familyId: string,
  rows: Row[],
) {
  const adjusted = holmAdjustPlanned(rows.map((row) => ({
    memberId: row.memberId,
    pRaw: row.pRaw,
  })));
  for (let index = 0; index < rows.length; index += 1) {
    rows[index].pHolm = adjusted[index].pHolm;
    rows[index].familySizePlanned = adjusted[index].familySizePlanned;
    rows[index].holmRank = adjusted[index].holmRank;
    rows[index].holmMultiplier = adjusted[index].holmMultiplier;
  }
  return {
    role,
    familyId,
    familySizePlanned: rows.length,
    memberIds: rows.map((row) => row.memberId),
  } satisfies OpenEnaInferenceFamilyV2;
}

function commonResultFields<Request extends OpenEnaInferenceRequestV2>(
  request: Request,
  binding: OpenEnaInferenceBindingV2,
): {
  schemaVersion: 2;
  kind: Request["kind"];
  analyzedAt: string;
  request: Request;
  binding: OpenEnaInferenceBindingV2;
  coordinateSystem: "unflipped-model-coordinates";
  provenance: typeof OPEN_ENA_INFERENCE_PROVENANCE_V2;
  method: typeof OPEN_ENA_RANK_INFERENCE_METHOD;
} {
  return {
    schemaVersion: 2 as const,
    kind: request.kind as Request["kind"],
    analyzedAt: binding.analyzedAt,
    request: cloneRequest(request),
    binding,
    coordinateSystem: "unflipped-model-coordinates" as const,
    provenance: OPEN_ENA_INFERENCE_PROVENANCE_V2,
    method: { ...OPEN_ENA_RANK_INFERENCE_METHOD },
  };
}

function endpointScope(request: Extract<OpenEnaInferenceRequestV2, { kind: "endpoint-independent" }>) {
  return {
    design: "independent-endpoint-groups" as const,
    analysisUnit: "endpoint-analytic-unit" as const,
    temporalScope: "endpoint-common-period-not-verified" as const,
    primaryGroup: request.primaryGroup,
    secondaryGroup: request.secondaryGroup,
  };
}

function disabledEndpoint(
  request: Extract<OpenEnaInferenceRequestV2, { kind: "endpoint-independent" }>,
  binding: OpenEnaInferenceBindingV2,
  reason: OpenEnaInferenceReasonCodeV2,
): OpenEnaEndpointInferenceResultV2 {
  return deepFreeze({
    ...commonResultFields(request, binding),
    status: "disabled" as const,
    reason,
    scope: endpointScope(request),
    ledger: null,
    families: [],
    rows: [],
    warnings: [],
  });
}

function endpointSamples(
  result: OpenEnaInferenceResultSnapshotV2,
  groupColumn: string,
  primaryGroup: string,
  secondaryGroup: string,
  axes: [string, string],
) {
  const primary: Array<[number, number]> = [];
  const secondary: Array<[number, number]> = [];
  const configuredGroups = new Set(result.groups.map((group) => group.name));
  const groupByUnit = new Map<string, string>();
  for (const point of result.set.points) {
    const groupValue = point[groupColumn] === null || point[groupColumn] === undefined
      ? ""
      : String(point[groupColumn]);
    if (!configuredGroups.has(groupValue)) {
      throw new OpenEnaInferenceIntegrityError("group-instability");
    }
    const unit = point.ENA_UNIT === null || point.ENA_UNIT === undefined
      ? ""
      : String(point.ENA_UNIT);
    if (!unit) throw new OpenEnaInferenceIntegrityError("entity-period-instability");
    const priorGroup = groupByUnit.get(unit);
    if (priorGroup !== undefined) {
      throw new OpenEnaInferenceIntegrityError(
        priorGroup === groupValue ? "entity-period-instability" : "identity-collision",
      );
    }
    groupByUnit.set(unit, groupValue);
    const coordinates: [number, number] = [
      finiteCoordinate(point[axes[0]]),
      finiteCoordinate(point[axes[1]]),
    ];
    const role = groupValue === primaryGroup
      ? "primary" as const
      : groupValue === secondaryGroup
        ? "secondary" as const
        : null;
    if (role === "primary") primary.push(coordinates);
    else if (role === "secondary") secondary.push(coordinates);
  }
  return { primary, secondary };
}

function mannWhitneyRow(
  axisIndex: 0 | 1,
  axis: string,
  familyId: string,
  memberId: string,
  primary: readonly number[],
  secondary: readonly number[],
  extraWarnings: readonly OpenEnaRankWarningCode[],
): OpenEnaMannWhitneyInferenceRowV2 {
  let estimate;
  try {
    estimate = mannWhitneyRankTest(primary, secondary);
  } catch (error) {
    if (error instanceof Error && error.message === "nonfinite-coordinate") {
      throw new OpenEnaInferenceIntegrityError("nonfinite-coordinate");
    }
    throw error;
  }
  return {
    test: "mann-whitney-u",
    effectDirection: "positive-primary-higher-ranks",
    axisIndex,
    axis,
    status: estimate.status,
    reason: estimate.reason,
    familyId,
    memberId,
    familySizePlanned: 0,
    pRaw: estimate.pValueTwoSided,
    pHolm: null,
    holmRank: null,
    holmMultiplier: null,
    resolvedPMethod: estimate.resolvedPMethod,
    continuityCorrectionApplied: estimate.continuityCorrectionApplied,
    tieGroupCount: estimate.tieGroupCount,
    tiedObservationCount: estimate.tiedObservationCount,
    tieCorrectionSum: estimate.tieCorrectionSum,
    warnings: warningUnion(estimate.warnings, extraWarnings),
    nPrimary: estimate.nPrimary,
    nSecondary: estimate.nSecondary,
    medianPrimary: estimate.medianPrimary,
    medianSecondary: estimate.medianSecondary,
    uPrimary: estimate.uPrimary,
    uSecondary: estimate.uSecondary,
    z: estimate.z,
    rankBiserialPrimaryVsSecondary: estimate.rankBiserialPrimaryVsSecondary,
    exactTail: estimate.exactTail ? { ...estimate.exactTail } : null,
  };
}

async function coordinateEndpoint(
  input: OpenEnaInferenceCoordinatorSnapshotV2,
  request: Extract<OpenEnaInferenceRequestV2, { kind: "endpoint-independent" }>,
  binding: OpenEnaInferenceBindingV2,
): Promise<OpenEnaEndpointInferenceResultV2> {
  if (binding.modelType !== "EndPoint") {
    return disabledEndpoint(request, binding, "design-not-confirmed");
  }
  const groupColumn = binding.configuration.groupColumn;
  if (!groupColumn) return disabledEndpoint(request, binding, "group-required");
  if (request.primaryGroup === request.secondaryGroup) {
    return disabledEndpoint(request, binding, "groups-must-differ");
  }
  const canonicalGroupNames = input.result.groups.map((group) => group.name).sort((left, right) => (
    left < right ? -1 : left > right ? 1 : 0
  ));
  const primaryGroupIndex = canonicalGroupNames.indexOf(request.primaryGroup);
  const secondaryGroupIndex = canonicalGroupNames.indexOf(request.secondaryGroup);
  if (primaryGroupIndex < 0 || secondaryGroupIndex < 0) {
    return disabledEndpoint(request, binding, "group-invalid");
  }
  const samples = endpointSamples(
    input.result,
    groupColumn,
    request.primaryGroup,
    request.secondaryGroup,
    request.axes,
  );
  const identityScope: FamilyIdentityScope = {
    binding,
    design: request.kind,
    axisIndexes: request.axes.map((axis) => input.result.dimensions.indexOf(axis)),
    groupIndexes: [primaryGroupIndex, secondaryGroupIndex],
    periodIndexes: [],
  };
  const familyId = await familyIdentity("comparison", identityScope);
  const memberIds = await Promise.all([0, 1].map((axisIndex) => (
    memberIdentity(familyId, "axis", axisIndex)
  )));
  const rows = ([0, 1] as const).map((axisIndex) => mannWhitneyRow(
    axisIndex,
    request.axes[axisIndex],
    familyId,
    memberIds[axisIndex],
    samples.primary.map((coordinates) => coordinates[axisIndex]),
    samples.secondary.map((coordinates) => coordinates[axisIndex]),
    designWarnings(binding, request.axes[axisIndex], input.result),
  ));
  const family = finalizeHolmFamily("comparison", familyId, rows);
  return deepFreeze({
    ...commonResultFields(request, binding),
    status: overallStatus(rows),
    reason: overallReason(rows),
    scope: endpointScope(request),
    ledger: {
      candidateEntityCount: samples.primary.length + samples.secondary.length,
      primaryAvailableCount: samples.primary.length,
      secondaryAvailableCount: samples.secondary.length,
      includedEntityCount: samples.primary.length + samples.secondary.length,
      includedAnalyticPointCount: samples.primary.length + samples.secondary.length,
    },
    families: [family],
    rows,
    warnings: warningUnion(...rows.map((row) => row.warnings)),
  });
}

function trajectoryIndependentScope(
  request: Extract<OpenEnaInferenceRequestV2, { kind: "trajectory-independent-period" }>,
) {
  return {
    design: "independent-groups-at-one-period" as const,
    analysisUnit: "compact-entity-period-point" as const,
    timeColumn: request.timeColumn,
    period: request.period,
    primaryGroup: request.primaryGroup,
    secondaryGroup: request.secondaryGroup,
  };
}

function disabledTrajectoryIndependent(
  request: Extract<OpenEnaInferenceRequestV2, { kind: "trajectory-independent-period" }>,
  binding: OpenEnaInferenceBindingV2,
  reason: OpenEnaInferenceReasonCodeV2,
): OpenEnaTrajectoryIndependentInferenceResultV2 {
  return deepFreeze({
    ...commonResultFields(request, binding),
    status: "disabled" as const,
    reason,
    scope: trajectoryIndependentScope(request),
    ledger: null,
    families: [],
    rows: [],
    warnings: [],
  });
}

async function coordinateTrajectoryIndependent(
  input: OpenEnaInferenceCoordinatorSnapshotV2,
  request: Extract<OpenEnaInferenceRequestV2, { kind: "trajectory-independent-period" }>,
  binding: OpenEnaInferenceBindingV2,
): Promise<OpenEnaTrajectoryIndependentInferenceResultV2> {
  if (binding.modelType !== "SeparateTrajectory" && binding.modelType !== "AccumulatedTrajectory") {
    return disabledTrajectoryIndependent(request, binding, "design-not-confirmed");
  }
  if (!requestIdentityIsValid(request, binding.configuration)) {
    return disabledTrajectoryIndependent(request, binding, "identity-columns-invalid");
  }
  if (!binding.configuration.conversationColumns.includes(request.timeColumn)) {
    return disabledTrajectoryIndependent(request, binding, "time-column-invalid");
  }
  const frame = validateFrameBinding(input.comparisonFrame, request, binding, input.result);
  if (!frame.identityConfirmed || !frame.eligibility.eligible) {
    return disabledTrajectoryIndependent(request, binding, "identity-not-confirmed");
  }
  binding = withValidatedTrajectoryMapping(binding, frame);
  let slice;
  try {
    slice = sliceLongitudinalIndependentPeriod(frame, request);
  } catch (error) {
    return disabledTrajectoryIndependent(request, binding, mapLongitudinalError(error));
  }
  const primary = slice.rows.filter((row) => row.groupRole === "primary");
  const secondary = slice.rows.filter((row) => row.groupRole === "secondary");
  const primaryGroupIndex = frame.groups.find((group) => group.name === request.primaryGroup)?.index ?? -1;
  const secondaryGroupIndex = frame.groups.find((group) => group.name === request.secondaryGroup)?.index ?? -1;
  const periodIndex = frame.timeOrder.indexOf(request.period);
  const identityScope: FamilyIdentityScope = {
    binding,
    design: request.kind,
    axisIndexes: request.axes.map((axis) => input.result.dimensions.indexOf(axis)),
    groupIndexes: [primaryGroupIndex, secondaryGroupIndex],
    periodIndexes: [periodIndex],
  };
  const familyId = await familyIdentity("comparison", identityScope);
  const memberIds = await Promise.all([0, 1].map((axisIndex) => (
    memberIdentity(familyId, "axis", axisIndex)
  )));
  const rows = ([0, 1] as const).map((axisIndex) => {
    const coordinate = axisIndex === 0 ? "x" as const : "y" as const;
    return mannWhitneyRow(
      axisIndex,
      request.axes[axisIndex],
      familyId,
      memberIds[axisIndex],
      primary.map((row) => finiteCoordinate(row[coordinate])),
      secondary.map((row) => finiteCoordinate(row[coordinate])),
      designWarnings(binding, request.axes[axisIndex], input.result),
    );
  });
  const family = finalizeHolmFamily("comparison", familyId, rows);
  return deepFreeze({
    ...commonResultFields(request, binding),
    status: overallStatus(rows),
    reason: overallReason(rows),
    scope: trajectoryIndependentScope(request),
    ledger: {
      ...slice.ledger,
      includedCompactPointCount: slice.rows.length,
      includedSourcePointCount: sumSourcePointCounts(slice.rows),
    },
    families: [family],
    rows,
    warnings: warningUnion(...rows.map((row) => row.warnings)),
  });
}

function trajectoryPairedScope(
  request: Extract<OpenEnaInferenceRequestV2, { kind: "trajectory-paired-periods" }>,
) {
  return {
    design: "same-entities-at-two-periods" as const,
    analysisUnit: "repeated-entity" as const,
    timeColumn: request.timeColumn,
    group: request.group,
    earlierPeriod: request.earlierPeriod,
    laterPeriod: request.laterPeriod,
    differenceDirection: "later-minus-earlier" as const,
    cohortPolicy: "pairwise-complete" as const,
  };
}

function disabledTrajectoryPaired(
  request: Extract<OpenEnaInferenceRequestV2, { kind: "trajectory-paired-periods" }>,
  binding: OpenEnaInferenceBindingV2,
  reason: OpenEnaInferenceReasonCodeV2,
): OpenEnaTrajectoryPairedInferenceResultV2 {
  return deepFreeze({
    ...commonResultFields(request, binding),
    status: "disabled" as const,
    reason,
    scope: trajectoryPairedScope(request),
    ledger: null,
    families: [],
    rows: [],
    warnings: [],
  });
}

function wilcoxonRow(
  axisIndex: 0 | 1,
  axis: string,
  familyId: string,
  memberId: string,
  earlierPeriodIndex: number,
  laterPeriodIndex: number,
  rawDifferences: readonly number[],
  missingPairs: number,
  extraWarnings: readonly OpenEnaRankWarningCode[],
): OpenEnaWilcoxonInferenceRowV2 {
  let estimate;
  try {
    estimate = wilcoxonSignedRankTest(rawDifferences, { missingPairs });
  } catch (error) {
    if (error instanceof Error && error.message === "nonfinite-coordinate") {
      throw new OpenEnaInferenceIntegrityError("nonfinite-coordinate");
    }
    throw error;
  }
  return {
    test: "wilcoxon-signed-rank",
    effectDirection: "positive-later-higher",
    axisIndex,
    axis,
    status: estimate.status,
    reason: estimate.reason,
    familyId,
    memberId,
    familySizePlanned: 0,
    pRaw: estimate.pValueTwoSided,
    pHolm: null,
    holmRank: null,
    holmMultiplier: null,
    resolvedPMethod: estimate.resolvedPMethod,
    continuityCorrectionApplied: estimate.continuityCorrectionApplied,
    tieGroupCount: estimate.tieGroupCount,
    tiedObservationCount: estimate.tiedObservationCount,
    tieCorrectionSum: estimate.tieCorrectionSum,
    warnings: warningUnion(estimate.warnings, extraWarnings),
    earlierPeriodIndex,
    laterPeriodIndex,
    differenceDirection: "later-minus-earlier",
    nMatched: estimate.nMatched,
    nMissing: estimate.nMissing,
    nPositive: estimate.nPositive,
    nNegative: estimate.nNegative,
    nZero: estimate.nZero,
    nNonzero: estimate.nNonzero,
    nRanked: estimate.nRanked,
    medianDifference: estimate.medianDifference,
    q1Difference: estimate.q1Difference,
    q3Difference: estimate.q3Difference,
    iqrDifference: estimate.iqrDifference,
    wPositive: estimate.wPositive,
    wNegative: estimate.wNegative,
    t: estimate.t,
    z: estimate.z,
    rankBiserialLaterVsEarlier: estimate.rankBiserialLaterVsEarlier,
    exactTail: estimate.exactTail ? { ...estimate.exactTail } : null,
    minimumAttainableTwoSidedP: estimate.minimumAttainableTwoSidedP
      ? { ...estimate.minimumAttainableTwoSidedP }
      : null,
  };
}

async function coordinateTrajectoryPaired(
  input: OpenEnaInferenceCoordinatorSnapshotV2,
  request: Extract<OpenEnaInferenceRequestV2, { kind: "trajectory-paired-periods" }>,
  binding: OpenEnaInferenceBindingV2,
): Promise<OpenEnaTrajectoryPairedInferenceResultV2> {
  if (binding.modelType !== "SeparateTrajectory" && binding.modelType !== "AccumulatedTrajectory") {
    return disabledTrajectoryPaired(request, binding, "design-not-confirmed");
  }
  if (request.cohortPolicy !== "pairwise-complete") {
    return disabledTrajectoryPaired(request, binding, "design-not-confirmed");
  }
  if (!requestIdentityIsValid(request, binding.configuration)) {
    return disabledTrajectoryPaired(request, binding, "identity-columns-invalid");
  }
  if (!binding.configuration.conversationColumns.includes(request.timeColumn)) {
    return disabledTrajectoryPaired(request, binding, "time-column-invalid");
  }
  const frame = validateFrameBinding(input.comparisonFrame, request, binding, input.result);
  if (!frame.identityConfirmed || !frame.eligibility.eligible) {
    return disabledTrajectoryPaired(request, binding, "identity-not-confirmed");
  }
  binding = withValidatedTrajectoryMapping(binding, frame);
  let slice;
  try {
    slice = sliceLongitudinalPairedPeriods(frame, request);
  } catch (error) {
    return disabledTrajectoryPaired(request, binding, mapLongitudinalError(error));
  }
  const earlierPeriodIndex = frame.timeOrder.indexOf(request.earlierPeriod);
  const laterPeriodIndex = frame.timeOrder.indexOf(request.laterPeriod);
  const groupIndex = frame.groups.find((group) => (
    group.name === (request.group ?? "All units")
  ))?.index ?? -1;
  const identityScope: FamilyIdentityScope = {
    binding,
    design: request.kind,
    axisIndexes: request.axes.map((axis) => input.result.dimensions.indexOf(axis)),
    groupIndexes: [groupIndex],
    periodIndexes: [earlierPeriodIndex, laterPeriodIndex],
  };
  const familyId = await familyIdentity("comparison", identityScope);
  const memberIds = await Promise.all([0, 1].map((axisIndex) => (
    memberIdentity(familyId, "axis", axisIndex)
  )));
  const missingPairCount = slice.ledger.candidateEntityCount - slice.ledger.matchedEntityCount;
  const selectedGroupName = request.group ?? "All units";
  const earlierAvailablePoints = frame.points.filter((point) => (
    point.group.name === selectedGroupName && point.time === request.earlierPeriod
  ));
  const laterAvailablePoints = frame.points.filter((point) => (
    point.group.name === selectedGroupName && point.time === request.laterPeriod
  ));
  const rows = ([0, 1] as const).map((axisIndex) => {
    const coordinate = axisIndex === 0 ? "x" as const : "y" as const;
    const rawDifferences = slice.pairs.map((pair) => {
      const earlier = finiteCoordinate(pair.earlier[coordinate]);
      const later = finiteCoordinate(pair.later[coordinate]);
      const difference = later - earlier;
      if (!Number.isFinite(difference)) {
        throw new OpenEnaInferenceIntegrityError("nonfinite-coordinate");
      }
      return difference;
    });
    return wilcoxonRow(
      axisIndex,
      request.axes[axisIndex],
      familyId,
      memberIds[axisIndex],
      earlierPeriodIndex,
      laterPeriodIndex,
      rawDifferences,
      missingPairCount,
      designWarnings(binding, request.axes[axisIndex], input.result),
    );
  });
  const family = finalizeHolmFamily("comparison", familyId, rows);
  return deepFreeze({
    ...commonResultFields(request, binding),
    status: overallStatus(rows),
    reason: overallReason(rows),
    scope: trajectoryPairedScope(request),
    ledger: {
      candidateEntityCount: slice.ledger.candidateEntityCount,
      earlierAvailableCount: slice.ledger.earlierAvailableCount,
      laterAvailableCount: slice.ledger.laterAvailableCount,
      matchedEntityCount: slice.ledger.matchedEntityCount,
      earlierOnlyCount: slice.ledger.earlierOnlyCount,
      laterOnlyCount: slice.ledger.laterOnlyCount,
      missingPairCount,
      earlierAvailableCompactPointCount: earlierAvailablePoints.length,
      laterAvailableCompactPointCount: laterAvailablePoints.length,
      earlierAvailableSourcePointCount: sumSourcePointCounts(earlierAvailablePoints),
      laterAvailableSourcePointCount: sumSourcePointCounts(laterAvailablePoints),
      matchedCompactPointCount: slice.pairs.length * 2,
      matchedSourcePointCount: sumSourcePointCounts(slice.pairs.flatMap((pair) => [
        pair.earlier,
        pair.later,
      ])),
      axes: rows.map((row) => ({
        axisIndex: row.axisIndex,
        zeroDifferenceCount: row.nZero,
        nonzeroDifferenceCount: row.nNonzero,
        rankedCount: row.nRanked,
      })),
    },
    families: [family],
    rows,
    warnings: warningUnion(...rows.map((row) => row.warnings)),
  });
}

function trajectoryRepeatedScope(
  request: Extract<OpenEnaInferenceRequestV2, { kind: "trajectory-repeated-periods" }>,
) {
  return {
    design: "same-entities-at-repeated-periods" as const,
    analysisUnit: "repeated-entity" as const,
    timeColumn: request.timeColumn,
    group: request.group,
    periods: [...request.periods],
    cohortPolicy: "all-period-complete" as const,
    posthocContrasts: "all-period-pairs" as const,
  };
}

function disabledTrajectoryRepeated(
  request: Extract<OpenEnaInferenceRequestV2, { kind: "trajectory-repeated-periods" }>,
  binding: OpenEnaInferenceBindingV2,
  reason: OpenEnaInferenceReasonCodeV2,
): OpenEnaTrajectoryRepeatedInferenceResultV2 {
  return deepFreeze({
    ...commonResultFields(request, binding),
    status: "disabled" as const,
    reason,
    scope: trajectoryRepeatedScope(request),
    ledger: null,
    families: [],
    omnibusRows: [],
    followupRows: [],
    warnings: [],
  });
}

function friedmanRow(
  axisIndex: 0 | 1,
  axis: string,
  familyId: string,
  memberId: string,
  completeBlocks: readonly (readonly number[])[],
  missingCompleteBlocks: number,
  periodCountWhenEmpty: number,
  extraWarnings: readonly OpenEnaRankWarningCode[],
): OpenEnaFriedmanInferenceRowV2 {
  let estimate;
  try {
    estimate = friedmanRankTest(completeBlocks, {
      missingCompleteBlocks,
      periodCountWhenEmpty,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "nonfinite-coordinate") {
      throw new OpenEnaInferenceIntegrityError("nonfinite-coordinate");
    }
    if (error instanceof Error && error.message === "entity-period-instability") {
      throw new OpenEnaInferenceIntegrityError("entity-period-instability");
    }
    throw error;
  }
  return {
    test: "friedman",
    effectDirection: "non-directional",
    axisIndex,
    axis,
    status: estimate.status,
    reason: estimate.reason,
    familyId,
    memberId,
    familySizePlanned: 0,
    pRaw: estimate.pValueUpperTail,
    pHolm: null,
    holmRank: null,
    holmMultiplier: null,
    resolvedPMethod: estimate.resolvedPMethod,
    continuityCorrectionApplied: false,
    tieGroupCount: estimate.tieGroupCount,
    tiedObservationCount: estimate.tiedObservationCount,
    tieCorrectionSum: estimate.tieCorrectionSum,
    warnings: warningUnion(estimate.warnings, extraWarnings),
    nComplete: estimate.nComplete,
    nMissingCompleteBlocks: estimate.nMissingCompleteBlocks,
    nPeriods: estimate.nPeriods,
    q: estimate.q,
    degreesFreedom: estimate.degreesFreedom,
    kendallsW: estimate.kendallsW,
    exactTail: estimate.exactTail ? { ...estimate.exactTail } : null,
  };
}

async function coordinateTrajectoryRepeated(
  input: OpenEnaInferenceCoordinatorSnapshotV2,
  request: Extract<OpenEnaInferenceRequestV2, { kind: "trajectory-repeated-periods" }>,
  binding: OpenEnaInferenceBindingV2,
): Promise<OpenEnaTrajectoryRepeatedInferenceResultV2> {
  if (binding.modelType !== "SeparateTrajectory" && binding.modelType !== "AccumulatedTrajectory") {
    return disabledTrajectoryRepeated(request, binding, "design-not-confirmed");
  }
  if (request.cohortPolicy !== "all-period-complete"
    || request.posthocContrasts !== "all-period-pairs") {
    return disabledTrajectoryRepeated(request, binding, "design-not-confirmed");
  }
  if (!requestIdentityIsValid(request, binding.configuration)) {
    return disabledTrajectoryRepeated(request, binding, "identity-columns-invalid");
  }
  if (!binding.configuration.conversationColumns.includes(request.timeColumn)) {
    return disabledTrajectoryRepeated(request, binding, "time-column-invalid");
  }
  const frame = validateFrameBinding(input.comparisonFrame, request, binding, input.result);
  if (!frame.identityConfirmed || !frame.eligibility.eligible) {
    return disabledTrajectoryRepeated(request, binding, "identity-not-confirmed");
  }
  binding = withValidatedTrajectoryMapping(binding, frame);
  let slice;
  try {
    slice = sliceLongitudinalRepeatedPeriods(frame, request);
  } catch (error) {
    return disabledTrajectoryRepeated(request, binding, mapLongitudinalError(error));
  }
  const groupIndex = frame.groups.find((group) => (
    group.name === (request.group ?? "All units")
  ))?.index ?? -1;
  const selectedPeriodIndexes = request.periods.map((period) => frame.timeOrder.indexOf(period));
  const identityScope: FamilyIdentityScope = {
    binding,
    design: request.kind,
    axisIndexes: request.axes.map((axis) => input.result.dimensions.indexOf(axis)),
    groupIndexes: [groupIndex],
    periodIndexes: selectedPeriodIndexes,
  };
  const [omnibusFamilyId, posthocFamilyId] = await Promise.all([
    familyIdentity("omnibus", identityScope),
    familyIdentity("posthoc", identityScope),
  ]);
  const omnibusMemberIds = await Promise.all([0, 1].map((axisIndex) => (
    memberIdentity(omnibusFamilyId, "axis", axisIndex)
  )));
  const missingCompleteBlocks = slice.ledger.missingAnySelectedPeriodCount;
  const missingWarning: OpenEnaRankWarningCode[] = missingCompleteBlocks > 0
    ? ["missing-complete-blocks"]
    : [];
  const omnibusRows = ([0, 1] as const).map((axisIndex) => {
    const coordinate = axisIndex === 0 ? "x" as const : "y" as const;
    const completeBlocks = slice.blocks.map((block) => block.periods.map((period) => (
      finiteCoordinate(period[coordinate])
    )));
    return friedmanRow(
      axisIndex,
      request.axes[axisIndex],
      omnibusFamilyId,
      omnibusMemberIds[axisIndex],
      completeBlocks,
      missingCompleteBlocks,
      request.periods.length,
      warningUnion(
        designWarnings(binding, request.axes[axisIndex], input.result),
        missingWarning,
      ),
    );
  });

  const periodPairs: Array<[number, number]> = [];
  for (let earlier = 0; earlier < request.periods.length; earlier += 1) {
    for (let later = earlier + 1; later < request.periods.length; later += 1) {
      periodPairs.push([earlier, later]);
    }
  }
  const followupMemberIds = await Promise.all(([0, 1] as const).flatMap((axisIndex) => (
    periodPairs.map(([earlier, later]) => memberIdentity(
      posthocFamilyId,
      "axis-period-pair",
      axisIndex,
      earlier,
      later,
    ))
  )));
  let memberCursor = 0;
  const followupRows: OpenEnaWilcoxonInferenceRowV2[] = [];
  for (const axisIndex of [0, 1] as const) {
    const coordinate = axisIndex === 0 ? "x" as const : "y" as const;
    for (const [earlier, later] of periodPairs) {
      const rawDifferences = slice.blocks.map((block) => {
        const earlierCoordinate = finiteCoordinate(block.periods[earlier][coordinate]);
        const laterCoordinate = finiteCoordinate(block.periods[later][coordinate]);
        const difference = laterCoordinate - earlierCoordinate;
        if (!Number.isFinite(difference)) {
          throw new OpenEnaInferenceIntegrityError("nonfinite-coordinate");
        }
        return difference;
      });
      followupRows.push(wilcoxonRow(
        axisIndex,
        request.axes[axisIndex],
        posthocFamilyId,
        followupMemberIds[memberCursor],
        earlier,
        later,
        rawDifferences,
        0,
        warningUnion(
          designWarnings(binding, request.axes[axisIndex], input.result),
          missingWarning,
        ),
      ));
      if (slice.ledger.completeBlockCount === 0) {
        followupRows[followupRows.length - 1].reason = "no-complete-blocks";
      }
      memberCursor += 1;
    }
  }
  const omnibusFamily = finalizeHolmFamily("omnibus", omnibusFamilyId, omnibusRows);
  const posthocFamily = finalizeHolmFamily("posthoc", posthocFamilyId, followupRows);
  const status = overallStatus(omnibusRows);
  return deepFreeze({
    ...commonResultFields(request, binding),
    status,
    reason: overallReason(
      omnibusRows,
      slice.ledger.completeBlockCount === 0 ? "no-complete-blocks" : undefined,
    ),
    scope: trajectoryRepeatedScope(request),
    ledger: {
      candidateEntityCount: slice.ledger.candidateEntityCount,
      availableByPeriod: slice.ledger.availableByPeriod.map((entry) => ({
        periodIndex: entry.periodIndex,
        availableEntityCount: entry.availableEntityCount,
        availableCompactPointCount: frame.points.filter((point) => (
          point.group.name === (request.group ?? "All units") && point.timeIndex === entry.periodIndex
        )).length,
        availableSourcePointCount: sumSourcePointCounts(frame.points.filter((point) => (
          point.group.name === (request.group ?? "All units") && point.timeIndex === entry.periodIndex
        ))),
      })),
      completeBlockCount: slice.ledger.completeBlockCount,
      completeBlockCompactPointCount: slice.blocks.length * request.periods.length,
      completeBlockSourcePointCount: sumSourcePointCounts(slice.blocks.flatMap((block) => block.periods)),
      missingAnySelectedPeriodCount: slice.ledger.missingAnySelectedPeriodCount,
    },
    families: [omnibusFamily, posthocFamily],
    omnibusRows,
    followupRows,
    warnings: warningUnion(
      ...omnibusRows.map((row) => row.warnings),
      ...followupRows.map((row) => row.warnings),
    ),
  });
}

async function coordinateOpenEnaInferenceV2(
  snapshot: OpenEnaInferenceCoordinatorSnapshotV2,
  binding: OpenEnaInferenceBindingV2,
): Promise<OpenEnaInferenceResultV2> {
  if (!requestAxesAreValid(snapshot.result, snapshot.request.axes)) {
    switch (snapshot.request.kind) {
      case "endpoint-independent":
        return disabledEndpoint(snapshot.request, binding, "axes-invalid");
      case "trajectory-independent-period":
        return disabledTrajectoryIndependent(snapshot.request, binding, "axes-invalid");
      case "trajectory-paired-periods":
        return disabledTrajectoryPaired(snapshot.request, binding, "axes-invalid");
      case "trajectory-repeated-periods":
        return disabledTrajectoryRepeated(snapshot.request, binding, "axes-invalid");
    }
  }
  switch (snapshot.request.kind) {
    case "endpoint-independent":
      return coordinateEndpoint(snapshot, snapshot.request, binding);
    case "trajectory-independent-period":
      return coordinateTrajectoryIndependent(snapshot, snapshot.request, binding);
    case "trajectory-paired-periods":
      return coordinateTrajectoryPaired(snapshot, snapshot.request, binding);
    case "trajectory-repeated-periods":
      return coordinateTrajectoryRepeated(snapshot, snapshot.request, binding);
  }
}

export async function runOpenEnaInferenceV2(
  input: OpenEnaInferenceCoordinatorInputV2,
): Promise<OpenEnaInferenceResultV2> {
  const snapshot = snapshotCoordinatorInput(input);
  const binding = validateBinding(snapshot);
  if (snapshot.request.kind === "endpoint-independent"
    && snapshot.comparisonFrame !== undefined) {
    throw new OpenEnaInferenceIntegrityError("binding-mismatch");
  }
  return markOpenEnaInferenceCoordinatorAuthorityV2(
    await coordinateOpenEnaInferenceV2(snapshot, binding),
  );
}
