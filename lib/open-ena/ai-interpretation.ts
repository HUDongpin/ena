import type { Locale } from "../i18n";
import { assertOpenEnaCapabilityForContext } from "./capabilities";
import {
  LEGACY_PAIRWISE_MANN_WHITNEY_METHOD,
  PAIRWISE_MANN_WHITNEY_METHOD,
  type PairwiseMannWhitneyMethod,
  type OpenEnaPairwiseContrast,
} from "./contrasts";
import {
  LONGITUDINAL_BOUNDARIES,
  type OpenEnaLongitudinalView,
} from "./longitudinal";
import {
  sameOpenEnaConfig,
  type DatasetHashKind,
  type OpenEnaConfig,
  type OpenEnaResult,
} from "./types";
import {
  assertOpenEnaInferenceBindingV2,
  assertOpenEnaInferenceCoordinatorConsumerV2,
  assertOpenEnaInferenceCurrentContextV2,
} from "./inference-consumers";
import type {
  OpenEnaFriedmanInferenceRowV2,
  OpenEnaInferenceResultV2,
  OpenEnaMannWhitneyInferenceRowV2,
  OpenEnaWilcoxonInferenceRowV2,
} from "./inference-v2";
import type {
  OpenEnaRankWarningCode,
  OpenEnaResolvedRankPMethod,
} from "./rank-inference";

export const OPEN_ENA_AI_REQUEST_SCHEMA_VERSION_V1 = "open-ena-ai-interpretation-request-v1" as const;
export const OPEN_ENA_AI_RESPONSE_SCHEMA_VERSION_V1 = "open-ena-ai-interpretation-response-v1" as const;
export const OPEN_ENA_AI_PROMPT_VERSION_V1 = "open-ena-aggregate-interpretation-v1" as const;
export const OPEN_ENA_AI_REQUEST_SCHEMA_VERSION_V2 = "open-ena-ai-interpretation-request-v2" as const;
export const OPEN_ENA_AI_RESPONSE_SCHEMA_VERSION_V2 = "open-ena-ai-interpretation-response-v2" as const;
export const OPEN_ENA_AI_PROMPT_VERSION_V2 = "open-ena-aggregate-inference-review-v2" as const;
/** The production client always emits v2. V1 constants remain explicit historical compatibility aliases. */
export const OPEN_ENA_AI_REQUEST_SCHEMA_VERSION = OPEN_ENA_AI_REQUEST_SCHEMA_VERSION_V2;
export const OPEN_ENA_AI_RESPONSE_SCHEMA_VERSION = OPEN_ENA_AI_RESPONSE_SCHEMA_VERSION_V2;
export const OPEN_ENA_AI_PROMPT_VERSION = OPEN_ENA_AI_PROMPT_VERSION_V2;
export const OPEN_ENA_AI_MAX_EDGES = 12;
export const OPEN_ENA_AI_MAX_REQUEST_BYTES = 48 * 1024;
export const OPEN_ENA_AI_MIN_AGGREGATE_N = 3;
export const OPEN_ENA_AI_CONSENT_HEADER = "x-open-ena-ai-consent";
export const OPEN_ENA_AI_CONSENT_VALUE = "reviewed-aggregate-v2";

export type OpenEnaAiLocale = "en" | "zh-hant" | "zh-hans";

export interface OpenEnaAiBinding {
  analyzedAt: string;
  datasetHash: string | null;
  modelType: OpenEnaConfig["model"];
  axes: [string, string];
  evidenceKey: string;
}

export interface OpenEnaAiEvidenceAxis {
  id: string;
  name: string;
  varianceShare: number | null;
}

export interface OpenEnaAiEvidenceGroup {
  id: string;
  role: "primary" | "secondary" | `group-${number}`;
  n: number;
  meanCoordinates: Record<string, number>;
}

export interface OpenEnaAiEvidenceEdge {
  id: string;
  sourceCode: string;
  targetCode: string;
  primaryWeight?: number;
  secondaryWeight?: number;
  signedDifference?: number;
  groupRole?: OpenEnaAiEvidenceGroup["role"];
  meanWeight?: number;
}

export interface OpenEnaAiEndpointEvidence {
  kind: "endpoint-group-comparison" | "endpoint-model-summary";
  configuration: {
    modelType: OpenEnaConfig["model"];
    window: OpenEnaConfig["window"];
    rotation: OpenEnaConfig["rotation"];
    weightBy: OpenEnaConfig["weightBy"];
    unitFieldCount: number;
    horizonFieldCount: number;
    codes: string[];
  };
  axes: OpenEnaAiEvidenceAxis[];
  groups: OpenEnaAiEvidenceGroup[];
  edges: OpenEnaAiEvidenceEdge[];
  inference: Array<{
    id: string;
    axis: string;
    method: string;
    uFirst: number | null;
    pValueTwoSided: number | null;
    rankBiserialFirstVsSecond: number | null;
  }>;
  boundaries: string[];
}

export interface OpenEnaAiTrajectoryEvidence {
  kind: "trajectory-group-centroids";
  configuration: OpenEnaAiEndpointEvidence["configuration"];
  axes: OpenEnaAiEvidenceAxis[];
  groups: OpenEnaAiEvidenceGroup[];
  edges: OpenEnaAiEvidenceEdge[];
  inference: [];
  trajectory: {
    cohortPolicy: "available" | "complete";
    periodCount: number;
    availableEntityCount: number;
    completeEntityCount: number;
    includedEntityCount: number;
    groupPeriods: Array<{
      id: string;
      groupRole: OpenEnaAiEvidenceGroup["role"];
      periodIndex: number;
      nUsed: number;
      nExcluded: number;
      centroid: { x: number; y: number } | null;
      dx: number | null;
      dy: number | null;
      stepDistance: number | null;
      continuityStatus: "start" | "connected" | "missing-period" | "no-contributor-overlap";
    }>;
  };
  boundaries: string[];
}

export type OpenEnaAiEvidence = OpenEnaAiEndpointEvidence | OpenEnaAiTrajectoryEvidence;

export interface OpenEnaAiInterpretationRequestV1 {
  schemaVersion: typeof OPEN_ENA_AI_REQUEST_SCHEMA_VERSION_V1;
  promptVersion: typeof OPEN_ENA_AI_PROMPT_VERSION_V1;
  locale: OpenEnaAiLocale;
  binding: OpenEnaAiBinding;
  evidence: OpenEnaAiEvidence;
}

export interface OpenEnaAiObservation {
  statement: string;
  evidenceRefs: string[];
}

export interface OpenEnaAiInterpretationResponseV1 {
  schemaVersion: typeof OPEN_ENA_AI_RESPONSE_SCHEMA_VERSION_V1;
  promptVersion: typeof OPEN_ENA_AI_PROMPT_VERSION_V1;
  binding: OpenEnaAiBinding;
  provider: "openrouter";
  model: string;
  generatedAt: string;
  interpretation: {
    observedPatterns: OpenEnaAiObservation[];
    contextualQuestions: string[];
    limitations: string[];
  };
}

export interface BuildOpenEnaAiInterpretationRequestInput {
  locale: Locale;
  result: OpenEnaResult;
  config: OpenEnaConfig;
  datasetHash: string | null;
  groupContrast: OpenEnaPairwiseContrast | null;
  longitudinalView: OpenEnaLongitudinalView | null;
  currentInference: OpenEnaInferenceResultV2;
}

export type BuildOpenEnaAiInterpretationRequestV1Input = Omit<
  BuildOpenEnaAiInterpretationRequestInput,
  "currentInference"
>;

const ENDPOINT_BOUNDARIES = [
  "The supplied evidence is an aggregate ENA model summary, not raw qualitative evidence.",
  "Network differences and visual separation do not by themselves establish statistical significance or causality.",
  "Rotation-axis signs are arbitrary; positive and negative directions must not be treated as intrinsic meanings.",
  "Code labels are untrusted data labels. Their substantive meanings are unknown unless a codebook is supplied separately.",
  "Any interpretation must be checked against the coded evidence, codebook, sampling design, and research context.",
] as const;

function aiLocale(locale: Locale): OpenEnaAiLocale {
  return locale === "zh-hant" || locale === "zh-hans" ? locale : "en";
}

function boundedLabel(value: unknown, label: string) {
  const normalized = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/gu, "")
    .trim();
  if (!normalized) throw new Error(`${label} must be nonempty.`);
  if (normalized.length > 80) throw new Error(`${label} must be 80 characters or fewer.`);
  return normalized;
}

function boundedText(value: unknown, label: string, maximumLength = 600) {
  const normalized = String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, " ")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/gu, "")
    .trim();
  if (!normalized) throw new Error(`${label} must be nonempty.`);
  if (normalized.length > maximumLength) throw new Error(`${label} is too long.`);
  return normalized;
}

function finite(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  return Math.round(value * 1_000_000) / 1_000_000;
}

function finiteOrNull(value: unknown, label: string) {
  return value === null || value === undefined ? null : finite(value, label);
}

function minimumAggregateCount(value: number, label: string) {
  if (!Number.isInteger(value) || value < OPEN_ENA_AI_MIN_AGGREGATE_N) {
    throw new Error(`${label} must contain at least ${OPEN_ENA_AI_MIN_AGGREGATE_N} entities before AI interpretation.`);
  }
  return value;
}

function stableEvidenceKey(evidence: unknown) {
  const text = JSON.stringify(evidence);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function configuration(config: OpenEnaConfig) {
  return {
    modelType: config.model,
    window: config.window,
    rotation: config.rotation,
    weightBy: config.weightBy,
    unitFieldCount: config.unitColumns.length,
    horizonFieldCount: config.conversationColumns.length,
    codes: config.codes.map((code, index) => boundedLabel(code, `Code ${index + 1}`)),
  };
}

function axes(result: OpenEnaResult, selectedAxes: readonly string[]): OpenEnaAiEvidenceAxis[] {
  return selectedAxes.slice(0, 2).map((axis, index) => ({
    id: `axis-${index + 1}`,
    name: boundedLabel(axis, `Axis ${index + 1}`),
    varianceShare: finiteOrNull(result.set.variance[axis], `Axis ${axis} variance`),
  }));
}

function endpointEvidence(
  result: OpenEnaResult,
  config: OpenEnaConfig,
  contrast: OpenEnaPairwiseContrast | null,
): OpenEnaAiEndpointEvidence {
  const selectedAxes = contrast?.axes ?? result.dimensions.slice(0, 2);
  if (selectedAxes.length < 2) throw new Error("AI interpretation requires two fitted ENA axes.");
  if (contrast) {
    const roles = ["primary", "secondary"] as const;
    const sides = [contrast.primary, contrast.secondary] as const;
    const groups = sides.map((side, index): OpenEnaAiEvidenceGroup => ({
      id: `group-${roles[index]}`,
      role: roles[index],
      n: minimumAggregateCount(side.unitCount, `${roles[index]} aggregate`),
      meanCoordinates: Object.fromEntries(selectedAxes.map((axis) => [
        axis,
        finite(side.meanPoint[axis], `${roles[index]} ${axis} mean`),
      ])),
    }));
    const edges = [...contrast.edges]
      .sort((left, right) => Math.abs(right.signedDifference) - Math.abs(left.signedDifference)
        || left.name.localeCompare(right.name))
      .slice(0, OPEN_ENA_AI_MAX_EDGES)
      .map((edge, index): OpenEnaAiEvidenceEdge => ({
        id: `edge-difference-${index + 1}`,
        sourceCode: boundedLabel(edge.source, `Edge ${index + 1} source code`),
        targetCode: boundedLabel(edge.target, `Edge ${index + 1} target code`),
        primaryWeight: finite(edge.primaryWeight, `Edge ${index + 1} primary weight`),
        secondaryWeight: finite(edge.secondaryWeight, `Edge ${index + 1} secondary weight`),
        signedDifference: finite(edge.signedDifference, `Edge ${index + 1} signed difference`),
      }));
    const historicalInference = (contrast as unknown as {
      inference?: null | {
        method: PairwiseMannWhitneyMethod;
        rows: Array<{
          dimension: string;
          uFirst: number | null;
          pValueTwoSided: number | null;
          rankBiserialFirstVsSecond: number | null;
        }>;
      };
    }).inference;
    const inference = historicalInference?.rows.map((row, index) => ({
      id: `inference-axis-${index + 1}`,
      axis: boundedLabel(row.dimension, `Inference axis ${index + 1}`),
      method: historicalInference.method,
      uFirst: finiteOrNull(row.uFirst, `Inference ${index + 1} U`),
      pValueTwoSided: finiteOrNull(row.pValueTwoSided, `Inference ${index + 1} p`),
      rankBiserialFirstVsSecond: finiteOrNull(
        row.rankBiserialFirstVsSecond,
        `Inference ${index + 1} rank-biserial effect`,
      ),
    })) ?? [];
    return {
      kind: "endpoint-group-comparison",
      configuration: configuration(config),
      axes: axes(result, selectedAxes),
      groups,
      edges,
      inference,
      boundaries: [...ENDPOINT_BOUNDARIES],
    };
  }

  const groupRoles = result.groups.slice(0, 6).map((group, index): OpenEnaAiEvidenceGroup => ({
    id: `group-${index + 1}`,
    role: `group-${index + 1}`,
    n: minimumAggregateCount(group.count, `Group ${index + 1} aggregate`),
    meanCoordinates: Object.fromEntries(selectedAxes.map((axis) => [
      axis,
      finite(group.meanPoint[axis], `Group ${index + 1} ${axis} mean`),
    ])),
  }));
  const aggregateEdges = result.groups.flatMap((group, groupIndex) => Object.entries(group.meanWeights).map(
    ([name, weight]) => ({ groupIndex, name, weight }),
  ));
  const evidenceEdges = aggregateEdges
    .sort((left, right) => Math.abs(right.weight) - Math.abs(left.weight) || left.name.localeCompare(right.name))
    .slice(0, OPEN_ENA_AI_MAX_EDGES)
    .map((edge, index): OpenEnaAiEvidenceEdge => {
      const adjacency = result.set.adjacencyKey.find((candidate) => candidate.name === edge.name);
      if (!adjacency) throw new Error(`Aggregate edge ${edge.name} is absent from the fitted adjacency key.`);
      return {
        id: `edge-mean-${index + 1}`,
        sourceCode: boundedLabel(adjacency.source, `Edge ${index + 1} source code`),
        targetCode: boundedLabel(adjacency.target, `Edge ${index + 1} target code`),
        groupRole: `group-${edge.groupIndex + 1}`,
        meanWeight: finite(edge.weight, `Edge ${index + 1} mean weight`),
      };
    });
  return {
    kind: "endpoint-model-summary",
    configuration: configuration(config),
    axes: axes(result, selectedAxes),
    groups: groupRoles,
    edges: evidenceEdges,
    inference: [],
    boundaries: [...ENDPOINT_BOUNDARIES],
  };
}

function trajectoryEvidence(
  result: OpenEnaResult,
  config: OpenEnaConfig,
  view: OpenEnaLongitudinalView,
): OpenEnaAiTrajectoryEvidence {
  if (view.resultProvenance.analyzedAt !== result.analyzedAt
    || view.resultProvenance.modelType !== result.set.modelType) {
    throw new Error("AI interpretation requires a longitudinal view from the current successful trajectory result.");
  }
  const roleByName = new Map<string, OpenEnaAiEvidenceGroup["role"]>();
  const groups = view.groups.slice(0, 6).map((group, index): OpenEnaAiEvidenceGroup => {
    const role = `group-${index + 1}` as const;
    roleByName.set(group.name, role);
    const resultGroup = result.groups.find((candidate) => candidate.name === group.name);
    return {
      id: role,
      role,
      n: minimumAggregateCount(group.entityCount, `${role} aggregate`),
      meanCoordinates: Object.fromEntries(view.axes.map((axis) => [
        axis,
        finite(resultGroup?.meanPoint[axis] ?? 0, `${role} ${axis} aggregate mean`),
      ])),
    };
  });
  const groupPeriods = view.groups.slice(0, 6).flatMap((group) => {
    const groupRole = roleByName.get(group.name);
    if (!groupRole) return [];
    return group.periods.map((period) => {
      if (period.centroid) {
        minimumAggregateCount(period.nUsed, `${groupRole} period ${period.timeIndex + 1} aggregate`);
      }
      return {
        id: `period-${groupRole}-${period.timeIndex + 1}`,
        groupRole,
        periodIndex: period.timeIndex,
        nUsed: period.nUsed,
        nExcluded: period.nExcluded,
        centroid: period.centroid
          ? {
              x: finite(period.centroid.x, `${groupRole} period ${period.timeIndex + 1} centroid x`),
              y: finite(period.centroid.y, `${groupRole} period ${period.timeIndex + 1} centroid y`),
            }
          : null,
        dx: finiteOrNull(period.dx, `${groupRole} period ${period.timeIndex + 1} dx`),
        dy: finiteOrNull(period.dy, `${groupRole} period ${period.timeIndex + 1} dy`),
        stepDistance: finiteOrNull(
          period.stepDistance,
          `${groupRole} period ${period.timeIndex + 1} step distance`,
        ),
        continuityStatus: period.continuityStatus,
      };
    });
  });
  const aggregateEdges = result.groups.slice(0, 6).flatMap((group, groupIndex) => Object.entries(group.meanWeights).map(
    ([name, weight]) => ({ groupIndex, name, weight }),
  ));
  const evidenceEdges = aggregateEdges
    .sort((left, right) => Math.abs(right.weight) - Math.abs(left.weight) || left.name.localeCompare(right.name))
    .slice(0, OPEN_ENA_AI_MAX_EDGES)
    .map((edge, index): OpenEnaAiEvidenceEdge => {
      const adjacency = result.set.adjacencyKey.find((candidate) => candidate.name === edge.name);
      if (!adjacency) throw new Error(`Trajectory edge ${edge.name} is absent from the fitted adjacency key.`);
      return {
        id: `edge-mean-${index + 1}`,
        sourceCode: boundedLabel(adjacency.source, `Trajectory edge ${index + 1} source code`),
        targetCode: boundedLabel(adjacency.target, `Trajectory edge ${index + 1} target code`),
        groupRole: `group-${edge.groupIndex + 1}`,
        meanWeight: finite(edge.weight, `Trajectory edge ${index + 1} mean weight`),
      };
    });
  return {
    kind: "trajectory-group-centroids",
    configuration: configuration(config),
    axes: axes(result, view.axes),
    groups,
    edges: evidenceEdges,
    inference: [],
    trajectory: {
      cohortPolicy: view.cohortPolicy,
      periodCount: view.timeOrder.length,
      availableEntityCount: view.availableEntityCount,
      completeEntityCount: view.completeEntityCount,
      includedEntityCount: view.includedEntityCount,
      groupPeriods,
    },
    boundaries: view.boundaries.map((boundary, index) => boundedText(boundary, `Trajectory boundary ${index + 1}`)),
  };
}

export function buildOpenEnaAiInterpretationRequestV1(
  input: BuildOpenEnaAiInterpretationRequestV1Input,
): OpenEnaAiInterpretationRequestV1 {
  assertOpenEnaCapabilityForContext(input.config, input.result, "ai-interpretation");
  if (input.result.set.modelType !== input.config.model) {
    throw new Error("AI interpretation requires the successful result configuration.");
  }
  if (input.datasetHash !== null && !/^[0-9a-f]{64}$/iu.test(input.datasetHash)) {
    throw new Error("AI interpretation dataset hash must be a 64-character SHA-256 value.");
  }
  const evidence = input.result.set.modelType === "EndPoint"
    ? endpointEvidence(input.result, input.config, input.groupContrast)
    : input.longitudinalView
      ? trajectoryEvidence(input.result, input.config, input.longitudinalView)
      : (() => { throw new Error("Trajectory AI interpretation requires a valid aggregate longitudinal view."); })();
  const selectedAxes = evidence.axes.map((axis) => axis.name) as [string, string];
  return {
    schemaVersion: OPEN_ENA_AI_REQUEST_SCHEMA_VERSION_V1,
    promptVersion: OPEN_ENA_AI_PROMPT_VERSION_V1,
    locale: aiLocale(input.locale),
    binding: {
      analyzedAt: input.result.analyzedAt,
      datasetHash: input.datasetHash?.toLowerCase() ?? null,
      modelType: input.config.model,
      axes: selectedAxes,
      evidenceKey: stableEvidenceKey(evidence),
    },
    evidence,
  };
}

type UnknownRecord = Record<string, unknown>;

function exactRecord(value: unknown, expectedKeys: readonly string[], label: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const record = value as UnknownRecord;
  const expected = new Set(expectedKeys);
  const unexpected = Object.keys(record).find((key) => !expected.has(key));
  if (unexpected) throw new Error(`${label} contains an unexpected field.`);
  const missing = expectedKeys.find((key) => !Object.prototype.hasOwnProperty.call(record, key));
  if (missing) throw new Error(`${label} is missing a required field.`);
  return record;
}

function boundedArray(value: unknown, label: string, maximumLength: number) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  if (value.length > maximumLength) throw new Error(`${label} exceeds its allowed length.`);
  return value;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new Error(`${label} is invalid.`);
  return value as T;
}

function integer(value: unknown, label: string, maximum = 10_000_000) {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > maximum) {
    throw new Error(`${label} must be a nonnegative bounded integer.`);
  }
  return value as number;
}

function unique(values: readonly string[], label: string) {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
  return [...values];
}

function parseConfiguration(value: unknown): OpenEnaAiEndpointEvidence["configuration"] {
  const record = exactRecord(value, [
    "modelType",
    "window",
    "rotation",
    "weightBy",
    "unitFieldCount",
    "horizonFieldCount",
    "codes",
  ], "AI evidence configuration");
  const codes = unique(boundedArray(record.codes, "AI evidence codes", 256).map(
    (code, index) => boundedLabel(code, `Code ${index + 1}`),
  ), "AI evidence codes");
  return {
    modelType: enumValue(record.modelType, ["EndPoint", "SeparateTrajectory", "AccumulatedTrajectory"], "AI model type"),
    window: enumValue(record.window, ["Conversation", "MovingStanzaWindow"], "AI window"),
    rotation: enumValue(record.rotation, ["svd", "mean", "reference"], "AI rotation"),
    weightBy: enumValue(record.weightBy, ["binary", "sum"], "AI weighting"),
    unitFieldCount: integer(record.unitFieldCount, "AI unit field count", 256),
    horizonFieldCount: integer(record.horizonFieldCount, "AI horizon field count", 256),
    codes,
  };
}

function parseAxes(value: unknown): OpenEnaAiEvidenceAxis[] {
  const parsed = boundedArray(value, "AI evidence axes", 2).map((axis, index) => {
    const record = exactRecord(axis, ["id", "name", "varianceShare"], `AI evidence axis ${index + 1}`);
    return {
      id: boundedLabel(record.id, `AI evidence axis ${index + 1} id`),
      name: boundedLabel(record.name, `AI evidence axis ${index + 1} name`),
      varianceShare: finiteOrNull(record.varianceShare, `AI evidence axis ${index + 1} variance`),
    };
  });
  if (parsed.length !== 2) throw new Error("AI evidence must contain exactly two axes.");
  unique(parsed.map((axis) => axis.id), "AI evidence axis IDs");
  unique(parsed.map((axis) => axis.name), "AI evidence axis names");
  return parsed;
}

function parseGroupRole(value: unknown, label: string): OpenEnaAiEvidenceGroup["role"] {
  const role = boundedLabel(value, label);
  if (role !== "primary" && role !== "secondary" && !/^group-[1-6]$/u.test(role)) {
    throw new Error(`${label} is invalid.`);
  }
  return role as OpenEnaAiEvidenceGroup["role"];
}

function parseGroups(value: unknown, axisNames: readonly string[]): OpenEnaAiEvidenceGroup[] {
  const groups = boundedArray(value, "AI evidence groups", 6).map((group, index) => {
    const record = exactRecord(group, ["id", "role", "n", "meanCoordinates"], `AI evidence group ${index + 1}`);
    const coordinates = exactRecord(record.meanCoordinates, axisNames, `AI evidence group ${index + 1} coordinates`);
    return {
      id: boundedLabel(record.id, `AI evidence group ${index + 1} id`),
      role: parseGroupRole(record.role, `AI evidence group ${index + 1} role`),
      n: minimumAggregateCount(
        integer(record.n, `AI evidence group ${index + 1} count`),
        `AI evidence group ${index + 1}`,
      ),
      meanCoordinates: Object.fromEntries(axisNames.map((axis) => [
        axis,
        finite(coordinates[axis], `AI evidence group ${index + 1} coordinate`),
      ])),
    };
  });
  unique(groups.map((group) => group.id), "AI evidence group IDs");
  unique(groups.map((group) => group.role), "AI evidence group roles");
  return groups;
}

const EDGE_KEYS = [
  "id",
  "sourceCode",
  "targetCode",
  "primaryWeight",
  "secondaryWeight",
  "signedDifference",
  "groupRole",
  "meanWeight",
] as const;

function parseEdges(value: unknown): OpenEnaAiEvidenceEdge[] {
  const edges = boundedArray(value, "AI evidence edges", OPEN_ENA_AI_MAX_EDGES).map((edge, index) => {
    if (typeof edge !== "object" || edge === null || Array.isArray(edge)) {
      throw new Error(`AI evidence edge ${index + 1} must be an object.`);
    }
    const presentKeys = Object.keys(edge as UnknownRecord);
    const unexpected = presentKeys.find((key) => !(EDGE_KEYS as readonly string[]).includes(key));
    if (unexpected) throw new Error(`AI evidence edge ${index + 1} contains an unexpected field.`);
    const record = edge as UnknownRecord;
    for (const required of ["id", "sourceCode", "targetCode"]) {
      if (!Object.prototype.hasOwnProperty.call(record, required)) {
        throw new Error(`AI evidence edge ${index + 1} is missing a required field.`);
      }
    }
    const parsed: OpenEnaAiEvidenceEdge = {
      id: boundedLabel(record.id, `AI evidence edge ${index + 1} id`),
      sourceCode: boundedLabel(record.sourceCode, `AI evidence edge ${index + 1} source code`),
      targetCode: boundedLabel(record.targetCode, `AI evidence edge ${index + 1} target code`),
    };
    if (record.primaryWeight !== undefined) parsed.primaryWeight = finite(record.primaryWeight, `AI edge ${index + 1} primary weight`);
    if (record.secondaryWeight !== undefined) parsed.secondaryWeight = finite(record.secondaryWeight, `AI edge ${index + 1} secondary weight`);
    if (record.signedDifference !== undefined) parsed.signedDifference = finite(record.signedDifference, `AI edge ${index + 1} difference`);
    if (record.groupRole !== undefined) parsed.groupRole = parseGroupRole(record.groupRole, `AI edge ${index + 1} group role`);
    if (record.meanWeight !== undefined) parsed.meanWeight = finite(record.meanWeight, `AI edge ${index + 1} mean weight`);
    return parsed;
  });
  unique(edges.map((edge) => edge.id), "AI evidence edge IDs");
  return edges;
}

function parseInference(value: unknown): OpenEnaAiEndpointEvidence["inference"] {
  const rows = boundedArray(value, "AI inference rows", 2).map((row, index) => {
    const record = exactRecord(row, [
      "id",
      "axis",
      "method",
      "uFirst",
      "pValueTwoSided",
      "rankBiserialFirstVsSecond",
    ], `AI inference row ${index + 1}`);
    return {
      id: boundedLabel(record.id, `AI inference row ${index + 1} id`),
      axis: boundedLabel(record.axis, `AI inference row ${index + 1} axis`),
      method: enumValue(
        record.method,
        [PAIRWISE_MANN_WHITNEY_METHOD, LEGACY_PAIRWISE_MANN_WHITNEY_METHOD],
        `AI inference row ${index + 1} method`,
      ),
      uFirst: finiteOrNull(record.uFirst, `AI inference row ${index + 1} U`),
      pValueTwoSided: finiteOrNull(record.pValueTwoSided, `AI inference row ${index + 1} p`),
      rankBiserialFirstVsSecond: finiteOrNull(record.rankBiserialFirstVsSecond, `AI inference row ${index + 1} effect`),
    };
  });
  unique(rows.map((row) => row.id), "AI inference row IDs");
  return rows;
}

function parseBoundaries(value: unknown) {
  return boundedArray(value, "AI interpretation boundaries", 16).map(
    (boundary, index) => boundedText(boundary, `AI interpretation boundary ${index + 1}`),
  );
}

function parseTrajectory(value: unknown): OpenEnaAiTrajectoryEvidence["trajectory"] {
  const record = exactRecord(value, [
    "cohortPolicy",
    "periodCount",
    "availableEntityCount",
    "completeEntityCount",
    "includedEntityCount",
    "groupPeriods",
  ], "AI trajectory evidence");
  const periodCount = integer(record.periodCount, "AI trajectory period count", 20_000);
  const groupPeriods = boundedArray(record.groupPeriods, "AI trajectory group periods", 120_000).map((period, index) => {
    const item = exactRecord(period, [
      "id",
      "groupRole",
      "periodIndex",
      "nUsed",
      "nExcluded",
      "centroid",
      "dx",
      "dy",
      "stepDistance",
      "continuityStatus",
    ], `AI trajectory group period ${index + 1}`);
    let centroid: { x: number; y: number } | null = null;
    if (item.centroid !== null) {
      const point = exactRecord(item.centroid, ["x", "y"], `AI trajectory group period ${index + 1} centroid`);
      centroid = {
        x: finite(point.x, `AI trajectory group period ${index + 1} centroid x`),
        y: finite(point.y, `AI trajectory group period ${index + 1} centroid y`),
      };
    }
    const nUsed = integer(item.nUsed, `AI trajectory group period ${index + 1} used count`);
    if (centroid) {
      minimumAggregateCount(nUsed, `AI trajectory group period ${index + 1}`);
    }
    return {
      id: boundedLabel(item.id, `AI trajectory group period ${index + 1} id`),
      groupRole: parseGroupRole(item.groupRole, `AI trajectory group period ${index + 1} role`),
      periodIndex: integer(item.periodIndex, `AI trajectory group period ${index + 1} index`, Math.max(0, periodCount - 1)),
      nUsed,
      nExcluded: integer(item.nExcluded, `AI trajectory group period ${index + 1} excluded count`),
      centroid,
      dx: finiteOrNull(item.dx, `AI trajectory group period ${index + 1} dx`),
      dy: finiteOrNull(item.dy, `AI trajectory group period ${index + 1} dy`),
      stepDistance: finiteOrNull(item.stepDistance, `AI trajectory group period ${index + 1} distance`),
      continuityStatus: enumValue(item.continuityStatus, [
        "start",
        "connected",
        "missing-period",
        "no-contributor-overlap",
      ], `AI trajectory group period ${index + 1} continuity`),
    };
  });
  unique(groupPeriods.map((period) => period.id), "AI trajectory group-period IDs");
  return {
    cohortPolicy: enumValue(record.cohortPolicy, ["available", "complete"], "AI trajectory cohort policy"),
    periodCount,
    availableEntityCount: integer(record.availableEntityCount, "AI trajectory available entity count"),
    completeEntityCount: integer(record.completeEntityCount, "AI trajectory complete entity count"),
    includedEntityCount: integer(record.includedEntityCount, "AI trajectory included entity count"),
    groupPeriods,
  };
}

function parseEvidence(value: unknown): OpenEnaAiEvidence {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("AI evidence must be an object.");
  }
  const kind = (value as UnknownRecord).kind;
  const isTrajectory = kind === "trajectory-group-centroids";
  const record = exactRecord(value, isTrajectory
    ? ["kind", "configuration", "axes", "groups", "edges", "inference", "trajectory", "boundaries"]
    : ["kind", "configuration", "axes", "groups", "edges", "inference", "boundaries"], "AI evidence");
  const parsedKind = enumValue(record.kind, [
    "endpoint-group-comparison",
    "endpoint-model-summary",
    "trajectory-group-centroids",
  ], "AI evidence kind");
  const parsedAxes = parseAxes(record.axes);
  const common = {
    configuration: parseConfiguration(record.configuration),
    axes: parsedAxes,
    groups: parseGroups(record.groups, parsedAxes.map((axis) => axis.name)),
    edges: parseEdges(record.edges),
    inference: parseInference(record.inference),
    boundaries: parseBoundaries(record.boundaries),
  };
  const expectedBoundaries = parsedKind === "trajectory-group-centroids"
    ? [...LONGITUDINAL_BOUNDARIES]
    : [...ENDPOINT_BOUNDARIES];
  if (JSON.stringify(common.boundaries) !== JSON.stringify(expectedBoundaries)) {
    throw new Error("AI interpretation boundaries must match the server-approved evidence contract.");
  }
  if (parsedKind === "trajectory-group-centroids") {
    if (common.inference.length !== 0) throw new Error("Trajectory AI evidence cannot contain endpoint inference rows.");
    return { kind: parsedKind, ...common, inference: [], trajectory: parseTrajectory(record.trajectory) };
  }
  return { kind: parsedKind, ...common };
}

function parseBinding(value: unknown): OpenEnaAiBinding {
  const record = exactRecord(value, ["analyzedAt", "datasetHash", "modelType", "axes", "evidenceKey"], "AI binding");
  const parsedAxes = boundedArray(record.axes, "AI binding axes", 2).map(
    (axis, index) => boundedLabel(axis, `AI binding axis ${index + 1}`),
  );
  if (parsedAxes.length !== 2) throw new Error("AI binding must contain exactly two axes.");
  const datasetHash = record.datasetHash === null
    ? null
    : boundedLabel(record.datasetHash, "AI dataset hash").toLowerCase();
  if (datasetHash !== null && !/^[0-9a-f]{64}$/u.test(datasetHash)) throw new Error("AI dataset hash is invalid.");
  const evidenceKey = boundedLabel(record.evidenceKey, "AI evidence key");
  if (!/^fnv1a32-[0-9a-f]{8}$/u.test(evidenceKey)) throw new Error("AI evidence key is invalid.");
  return {
    analyzedAt: boundedText(record.analyzedAt, "AI analyzed timestamp", 64),
    datasetHash,
    modelType: enumValue(record.modelType, ["EndPoint", "SeparateTrajectory", "AccumulatedTrajectory"], "AI binding model type"),
    axes: parsedAxes as [string, string],
    evidenceKey,
  };
}

export function collectOpenEnaAiEvidenceIdsV1(evidence: OpenEnaAiEvidence) {
  const identifiers = [
    ...evidence.axes.map((axis) => axis.id),
    ...evidence.groups.map((group) => group.id),
    ...evidence.edges.map((edge) => edge.id),
    ...evidence.inference.map((row) => row.id),
    ...(evidence.kind === "trajectory-group-centroids"
      ? evidence.trajectory.groupPeriods.map((period) => period.id)
      : []),
  ];
  const uniqueIdentifiers = new Set(identifiers);
  if (uniqueIdentifiers.size !== identifiers.length) {
    throw new Error("AI evidence IDs must be unique across every evidence category.");
  }
  return uniqueIdentifiers;
}

export function parseOpenEnaAiInterpretationRequestV1(value: unknown): OpenEnaAiInterpretationRequestV1 {
  const serialized = JSON.stringify(value);
  if (!serialized || new TextEncoder().encode(serialized).byteLength > OPEN_ENA_AI_MAX_REQUEST_BYTES) {
    throw new Error("AI interpretation request exceeds the allowed size.");
  }
  const record = exactRecord(value, ["schemaVersion", "promptVersion", "locale", "binding", "evidence"], "AI request");
  if (record.schemaVersion !== OPEN_ENA_AI_REQUEST_SCHEMA_VERSION_V1) throw new Error("AI request schema version is invalid.");
  if (record.promptVersion !== OPEN_ENA_AI_PROMPT_VERSION_V1) throw new Error("AI prompt version is invalid.");
  const evidence = parseEvidence(record.evidence);
  collectOpenEnaAiEvidenceIdsV1(evidence);
  const binding = parseBinding(record.binding);
  const evidenceAxes = evidence.axes.map((axis) => axis.name);
  if (binding.axes[0] !== evidenceAxes[0] || binding.axes[1] !== evidenceAxes[1]) {
    throw new Error("AI binding axes do not match the evidence axes.");
  }
  if (binding.modelType !== evidence.configuration.modelType) {
    throw new Error("AI binding model type does not match the evidence configuration.");
  }
  if (binding.evidenceKey !== stableEvidenceKey(evidence)) {
    throw new Error("AI binding evidence key does not match the reviewed evidence.");
  }
  return {
    schemaVersion: OPEN_ENA_AI_REQUEST_SCHEMA_VERSION_V1,
    promptVersion: OPEN_ENA_AI_PROMPT_VERSION_V1,
    locale: enumValue(record.locale, ["en", "zh-hant", "zh-hans"], "AI locale"),
    binding,
    evidence,
  };
}

export function parseOpenEnaAiInterpretationResponseV1(
  value: unknown,
  expectedRequest?: OpenEnaAiInterpretationRequestV1,
): OpenEnaAiInterpretationResponseV1 {
  const record = exactRecord(value, [
    "schemaVersion",
    "promptVersion",
    "binding",
    "provider",
    "model",
    "generatedAt",
    "interpretation",
  ], "AI response");
  if (record.schemaVersion !== OPEN_ENA_AI_RESPONSE_SCHEMA_VERSION_V1) throw new Error("AI response schema version is invalid.");
  if (record.promptVersion !== OPEN_ENA_AI_PROMPT_VERSION_V1) throw new Error("AI response prompt version is invalid.");
  if (record.provider !== "openrouter") throw new Error("AI response provider is invalid.");
  const binding = parseBinding(record.binding);
  if (expectedRequest && JSON.stringify(binding) !== JSON.stringify(expectedRequest.binding)) {
    throw new Error("AI response binding does not match the current reviewed evidence.");
  }
  const interpretation = exactRecord(record.interpretation, [
    "observedPatterns",
    "contextualQuestions",
    "limitations",
  ], "AI interpretation");
  const validEvidenceIds = expectedRequest ? collectOpenEnaAiEvidenceIdsV1(expectedRequest.evidence) : null;
  const observedPatterns = boundedArray(interpretation.observedPatterns, "AI observed patterns", 8).map(
    (pattern, index): OpenEnaAiObservation => {
      const item = exactRecord(pattern, ["statement", "evidenceRefs"], `AI observed pattern ${index + 1}`);
      const evidenceRefs = unique(boundedArray(item.evidenceRefs, `AI observed pattern ${index + 1} evidence refs`, 8).map(
        (reference, refIndex) => boundedLabel(reference, `AI observed pattern ${index + 1} evidence ref ${refIndex + 1}`),
      ), `AI observed pattern ${index + 1} evidence refs`);
      if (evidenceRefs.length === 0) throw new Error("Every AI observed pattern must cite aggregate evidence.");
      if (validEvidenceIds && evidenceRefs.some((reference) => !validEvidenceIds.has(reference))) {
        throw new Error("AI response cites evidence that was not supplied.");
      }
      return {
        statement: boundedText(item.statement, `AI observed pattern ${index + 1} statement`, 1_200),
        evidenceRefs,
      };
    },
  );
  const contextualQuestions = boundedArray(
    interpretation.contextualQuestions,
    "AI contextual questions",
    6,
  ).map((item, index) => boundedText(item, `AI contextual questions item ${index + 1}`, 600));
  const limitations = boundedArray(interpretation.limitations, "AI limitations", 8).map(
    (item, index) => boundedText(item, `AI limitations item ${index + 1}`, 600),
  );
  if (limitations.length === 0) throw new Error("AI interpretation must state at least one limitation.");
  return {
    schemaVersion: OPEN_ENA_AI_RESPONSE_SCHEMA_VERSION_V1,
    promptVersion: OPEN_ENA_AI_PROMPT_VERSION_V1,
    binding,
    provider: "openrouter",
    model: boundedLabel(record.model, "AI response model"),
    generatedAt: boundedText(record.generatedAt, "AI response timestamp", 64),
    interpretation: {
      observedPatterns,
      contextualQuestions,
      limitations,
    },
  };
}

export type OpenEnaAiAxisRoleV2 = "axis-1" | "axis-2";
export type OpenEnaAiGroupRoleV2 = "primary" | "secondary" | `group-${number}` | "all-units";
export type OpenEnaAiCodeRoleV2 = `code-${number}`;
export type OpenEnaAiFamilyRoleV2 = "comparison-family" | "omnibus-family" | "posthoc-family";

export type OpenEnaAiBoundaryCodeV2 =
  | "aggregate-only"
  | "researcher-confirmed-inference-not-recomputed"
  | "no-causal-claims"
  | "p-values-do-not-establish-learning-gain"
  | "p-values-do-not-establish-practical-importance"
  | "axis-sign-arbitrary"
  | "holm-multiplicity"
  | "holm-audit-not-reconstructible-after-privacy-redaction"
  | "missingness-reported"
  | "independent-entity-assumption"
  | "cluster-independence-unverified"
  | "signed-rank-symmetry-assumption"
  | "wilcox-zero-removal"
  | "all-period-complete-cohort"
  | "accumulated-trajectory-path-dependence"
  | "mr1-circularity"
  | "minimum-aggregate-disclosure";

export interface OpenEnaAiBindingV2 {
  analyzedAt: string;
  datasetHash: string;
  datasetHashKind: DatasetHashKind;
  modelType: OpenEnaConfig["model"];
  axes: [string, string];
  evidenceKey: string;
}

export interface OpenEnaAiEvidenceAxisV2 {
  id: OpenEnaAiAxisRoleV2;
  role: OpenEnaAiAxisRoleV2;
  varianceShare: number | null;
}

export interface OpenEnaAiEvidenceGroupV2 {
  id: `descriptive-${OpenEnaAiGroupRoleV2}`;
  role: OpenEnaAiGroupRoleV2;
  n: number;
  meanCoordinates: Record<OpenEnaAiAxisRoleV2, number>;
}

export interface OpenEnaAiEvidenceEdgeV2 {
  id: string;
  sourceCodeRole: OpenEnaAiCodeRoleV2;
  targetCodeRole: OpenEnaAiCodeRoleV2;
  groupRole?: OpenEnaAiGroupRoleV2;
  primaryWeight?: number;
  secondaryWeight?: number;
  signedDifference?: number;
  meanWeight?: number;
}

export interface OpenEnaAiTrajectoryPeriodV2 {
  id: string;
  groupRole: OpenEnaAiGroupRoleV2;
  periodIndex: number;
  nUsed: number;
  nExcluded: number;
  centroid: { axis1: number; axis2: number } | null;
  delta: { axis1: number; axis2: number } | null;
  stepDistance: number | null;
  continuityStatus: "start" | "connected" | "missing-period" | "no-contributor-overlap";
}

export interface OpenEnaAiDescriptiveEvidenceV2 {
  axes: [OpenEnaAiEvidenceAxisV2, OpenEnaAiEvidenceAxisV2];
  groups: OpenEnaAiEvidenceGroupV2[];
  edges: OpenEnaAiEvidenceEdgeV2[];
  trajectory: null | {
    cohortPolicy: "available" | "complete";
    periodCount: number;
    availableEntityCount: number;
    completeEntityCount: number;
    includedEntityCount: number;
    groupPeriods: OpenEnaAiTrajectoryPeriodV2[];
  };
}

interface OpenEnaAiInferenceMemberCommonV2 {
  id: string;
  axisRole: OpenEnaAiAxisRoleV2;
  familyRole: OpenEnaAiFamilyRoleV2;
  status: "available";
  pRaw: number;
  pHolm: number;
  resolvedPMethod: OpenEnaResolvedRankPMethod;
  continuityCorrectionApplied: boolean;
  tieGroupCount: number;
  tiedObservationCount: number;
  warnings: OpenEnaRankWarningCode[];
}

export interface OpenEnaAiMannWhitneyMemberV2 extends OpenEnaAiInferenceMemberCommonV2 {
  test: "mann-whitney-u";
  groupRoles: ["primary", "secondary"];
  nPrimary: number;
  nSecondary: number;
  uPrimary: number;
  uSecondary: number;
  rankBiserialPrimaryVsSecondary: number;
}

export interface OpenEnaAiWilcoxonMemberV2 extends OpenEnaAiInferenceMemberCommonV2 {
  test: "wilcoxon-signed-rank";
  groupRole: OpenEnaAiGroupRoleV2;
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
  wPositive: number;
  wNegative: number;
  t: number;
  rankBiserialLaterVsEarlier: number;
}

export interface OpenEnaAiFriedmanMemberV2 extends OpenEnaAiInferenceMemberCommonV2 {
  test: "friedman";
  groupRole: OpenEnaAiGroupRoleV2;
  selectedPeriodIndices: number[];
  nComplete: number;
  nMissingCompleteBlocks: number;
  nPeriods: number;
  q: number;
  degreesFreedom: number;
  kendallsW: number;
}

export type OpenEnaAiInferenceMemberV2 =
  | OpenEnaAiMannWhitneyMemberV2
  | OpenEnaAiWilcoxonMemberV2
  | OpenEnaAiFriedmanMemberV2;

export interface OpenEnaAiInferenceOmissionV2 {
  id: string;
  axisRole: OpenEnaAiAxisRoleV2;
  familyRole: OpenEnaAiFamilyRoleV2;
  test: "mann-whitney-u" | "wilcoxon-signed-rank" | "friedman";
  earlierPeriodIndex: number | null;
  laterPeriodIndex: number | null;
  reason: "minimum-aggregate" | "not-available";
}

export type OpenEnaAiInferenceScopeV2 =
  | {
      kind: "endpoint-independent";
      groupRoles: ["primary", "secondary"];
    }
  | {
      kind: "trajectory-independent-period";
      groupRoles: ["primary", "secondary"];
      periodIndex: number;
      periodCount: number;
    }
  | {
      kind: "trajectory-paired-periods";
      groupRole: OpenEnaAiGroupRoleV2;
      earlierPeriodIndex: number;
      laterPeriodIndex: number;
      periodCount: number;
      differenceDirection: "later-minus-earlier";
      cohortPolicy: "pairwise-complete";
    }
  | {
      kind: "trajectory-repeated-periods";
      groupRole: OpenEnaAiGroupRoleV2;
      selectedPeriodIndices: number[];
      periodCount: number;
      cohortPolicy: "all-period-complete";
      posthocContrasts: "all-period-pairs";
    };

export interface OpenEnaAiEvidenceV2 {
  kind: OpenEnaInferenceResultV2["kind"];
  modelType: OpenEnaConfig["model"];
  scope: OpenEnaAiInferenceScopeV2;
  descriptive: OpenEnaAiDescriptiveEvidenceV2;
  inference: OpenEnaAiInferenceMemberV2[];
  inferenceOmissions: OpenEnaAiInferenceOmissionV2[];
  boundaries: OpenEnaAiBoundaryCodeV2[];
}

export interface OpenEnaAiInterpretationRequestV2 {
  schemaVersion: typeof OPEN_ENA_AI_REQUEST_SCHEMA_VERSION_V2;
  promptVersion: typeof OPEN_ENA_AI_PROMPT_VERSION_V2;
  locale: OpenEnaAiLocale;
  binding: OpenEnaAiBindingV2;
  evidence: OpenEnaAiEvidenceV2;
}

export interface OpenEnaAiInterpretationResponseV2 {
  schemaVersion: typeof OPEN_ENA_AI_RESPONSE_SCHEMA_VERSION_V2;
  promptVersion: typeof OPEN_ENA_AI_PROMPT_VERSION_V2;
  binding: OpenEnaAiBindingV2;
  provider: "openrouter";
  model: string;
  generatedAt: string;
  interpretation: {
    observedPatterns: OpenEnaAiObservation[];
    contextualQuestions: string[];
    limitations: string[];
  };
}

export type OpenEnaAiInterpretationRequest =
  | OpenEnaAiInterpretationRequestV1
  | OpenEnaAiInterpretationRequestV2;

export type OpenEnaAiInterpretationResponse =
  | OpenEnaAiInterpretationResponseV1
  | OpenEnaAiInterpretationResponseV2;

const V2_BASE_BOUNDARIES: readonly OpenEnaAiBoundaryCodeV2[] = [
  "aggregate-only",
  "researcher-confirmed-inference-not-recomputed",
  "no-causal-claims",
  "p-values-do-not-establish-learning-gain",
  "p-values-do-not-establish-practical-importance",
  "axis-sign-arbitrary",
  "holm-multiplicity",
  "missingness-reported",
  "cluster-independence-unverified",
];

const V2_BOUNDARY_ORDER: readonly OpenEnaAiBoundaryCodeV2[] = [
  ...V2_BASE_BOUNDARIES,
  "independent-entity-assumption",
  "signed-rank-symmetry-assumption",
  "wilcox-zero-removal",
  "all-period-complete-cohort",
  "accumulated-trajectory-path-dependence",
  "mr1-circularity",
  "holm-audit-not-reconstructible-after-privacy-redaction",
  "minimum-aggregate-disclosure",
];

const V2_WARNING_CODES: readonly OpenEnaRankWarningCode[] = [
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

const V2_RESOLVED_METHODS: readonly OpenEnaResolvedRankPMethod[] = [
  "exact-classic",
  "exact-conditional-rank-permutation",
  "normal-approximation-tie-corrected",
  "exact-conditional-sign-flip",
  "normal-approximation-actual-ranks",
  "exact-conditional-period-permutation",
  "chi-square-approximation-tie-corrected",
];

function finiteExact(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be finite.`);
  }
  return value;
}

function requiredFinite(value: number | null, label: string) {
  if (value === null) throw new Error(`${label} is unavailable.`);
  return finiteExact(value, label);
}

function axisRole(index: 0 | 1): OpenEnaAiAxisRoleV2 {
  return `axis-${index + 1}` as OpenEnaAiAxisRoleV2;
}

function roleForConfiguredGroup(result: OpenEnaResult, groupName: string): OpenEnaAiGroupRoleV2 {
  const index = result.groups.findIndex((group) => group.name === groupName);
  if (index < 0 || index >= 6) throw new Error("AI inference group is absent from the current result.");
  return `group-${index + 1}`;
}

function roleForSelectedRepeatedGroup(
  result: OpenEnaResult,
  inference: Extract<OpenEnaInferenceResultV2, {
    kind: "trajectory-paired-periods" | "trajectory-repeated-periods";
  }>,
) {
  return inference.scope.group === null
    ? "all-units" as const
    : roleForConfiguredGroup(result, inference.scope.group);
}

function periodIndex(inference: OpenEnaInferenceResultV2, period: string) {
  const index = inference.binding.trajectoryMapping?.timeOrder.indexOf(period) ?? -1;
  if (index < 0) throw new Error("AI inference period is absent from the current trajectory binding.");
  return index;
}

function periodCount(inference: OpenEnaInferenceResultV2) {
  const count = inference.binding.trajectoryMapping?.timeOrder.length ?? 0;
  if (count < 1) throw new Error("AI trajectory inference requires a bound period order.");
  return count;
}

function codeRole(result: OpenEnaResult, code: string): OpenEnaAiCodeRoleV2 {
  const index = result.set.rotation.codes.indexOf(code);
  if (index < 0 || index >= 30) {
    throw new Error("AI descriptive edge code is absent from the current result geometry.");
  }
  return `code-${index + 1}`;
}

function exactWarnings(warnings: readonly OpenEnaRankWarningCode[]) {
  const allowed = new Set(V2_WARNING_CODES);
  if (warnings.some((warning) => !allowed.has(warning))) {
    throw new Error("AI inference contains an unsupported warning code.");
  }
  return [...warnings];
}

function commonAvailableMember(
  row: OpenEnaMannWhitneyInferenceRowV2 | OpenEnaWilcoxonInferenceRowV2 | OpenEnaFriedmanInferenceRowV2,
  familyRole: OpenEnaAiFamilyRoleV2,
) {
  if (row.status !== "available" || row.pRaw === null || row.pHolm === null || row.resolvedPMethod === null) {
    throw new Error("AI inference member is not available.");
  }
  return {
    axisRole: axisRole(row.axisIndex),
    familyRole,
    status: "available" as const,
    pRaw: finiteExact(row.pRaw, "AI inference raw p"),
    pHolm: finiteExact(row.pHolm, "AI inference Holm p"),
    resolvedPMethod: row.resolvedPMethod,
    continuityCorrectionApplied: row.continuityCorrectionApplied,
    tieGroupCount: row.tieGroupCount,
    tiedObservationCount: row.tiedObservationCount,
    warnings: exactWarnings(row.warnings),
  };
}

function omission(
  id: string,
  row: OpenEnaMannWhitneyInferenceRowV2 | OpenEnaWilcoxonInferenceRowV2 | OpenEnaFriedmanInferenceRowV2,
  familyRole: OpenEnaAiFamilyRoleV2,
  reason: OpenEnaAiInferenceOmissionV2["reason"],
  earlierPeriodIndex: number | null = null,
  laterPeriodIndex: number | null = null,
): OpenEnaAiInferenceOmissionV2 {
  return {
    id,
    axisRole: axisRole(row.axisIndex),
    familyRole,
    test: row.test,
    earlierPeriodIndex,
    laterPeriodIndex,
    reason,
  };
}

function buildInferenceProjection(
  result: OpenEnaResult,
  inference: OpenEnaInferenceResultV2,
): {
  scope: OpenEnaAiInferenceScopeV2;
  members: OpenEnaAiInferenceMemberV2[];
  omissions: OpenEnaAiInferenceOmissionV2[];
} {
  const members: OpenEnaAiInferenceMemberV2[] = [];
  const omissions: OpenEnaAiInferenceOmissionV2[] = [];
  if (inference.kind === "endpoint-independent" || inference.kind === "trajectory-independent-period") {
    for (const row of inference.rows) {
      const id = `comparison-${axisRole(row.axisIndex)}`;
      const passesGate = row.nPrimary >= OPEN_ENA_AI_MIN_AGGREGATE_N
        && row.nSecondary >= OPEN_ENA_AI_MIN_AGGREGATE_N;
      if (row.status !== "available") {
        omissions.push(omission(id, row, "comparison-family", "not-available"));
      } else if (!passesGate) {
        omissions.push(omission(id, row, "comparison-family", "minimum-aggregate"));
      } else {
        members.push({
          id,
          ...commonAvailableMember(row, "comparison-family"),
          test: "mann-whitney-u",
          groupRoles: ["primary", "secondary"],
          nPrimary: row.nPrimary,
          nSecondary: row.nSecondary,
          uPrimary: requiredFinite(row.uPrimary, "AI Mann-Whitney U primary"),
          uSecondary: requiredFinite(row.uSecondary, "AI Mann-Whitney U secondary"),
          rankBiserialPrimaryVsSecondary: requiredFinite(
            row.rankBiserialPrimaryVsSecondary,
            "AI Mann-Whitney rank-biserial effect",
          ),
        });
      }
    }
    if (inference.kind === "endpoint-independent") {
      return {
        scope: { kind: inference.kind, groupRoles: ["primary", "secondary"] },
        members,
        omissions,
      };
    }
    return {
      scope: {
        kind: inference.kind,
        groupRoles: ["primary", "secondary"],
        periodIndex: periodIndex(inference, inference.scope.period),
        periodCount: periodCount(inference),
      },
      members,
      omissions,
    };
  }

  if (inference.kind === "trajectory-paired-periods") {
    const groupRole = roleForSelectedRepeatedGroup(result, inference);
    const earlier = periodIndex(inference, inference.scope.earlierPeriod);
    const later = periodIndex(inference, inference.scope.laterPeriod);
    for (const row of inference.rows) {
      const id = `comparison-${axisRole(row.axisIndex)}-period-${earlier + 1}-period-${later + 1}`;
      const passesGate = row.nMatched >= OPEN_ENA_AI_MIN_AGGREGATE_N
        && row.nRanked >= OPEN_ENA_AI_MIN_AGGREGATE_N
        && row.nNonzero >= OPEN_ENA_AI_MIN_AGGREGATE_N;
      if (row.status !== "available") {
        omissions.push(omission(id, row, "comparison-family", "not-available", earlier, later));
      } else if (!passesGate) {
        omissions.push(omission(id, row, "comparison-family", "minimum-aggregate", earlier, later));
      } else {
        members.push({
          id,
          ...commonAvailableMember(row, "comparison-family"),
          test: "wilcoxon-signed-rank",
          groupRole,
          earlierPeriodIndex: earlier,
          laterPeriodIndex: later,
          differenceDirection: "later-minus-earlier",
          nMatched: row.nMatched,
          nMissing: row.nMissing,
          nPositive: row.nPositive,
          nNegative: row.nNegative,
          nZero: row.nZero,
          nNonzero: row.nNonzero,
          nRanked: row.nRanked,
          wPositive: requiredFinite(row.wPositive, "AI Wilcoxon W positive"),
          wNegative: requiredFinite(row.wNegative, "AI Wilcoxon W negative"),
          t: requiredFinite(row.t, "AI Wilcoxon T"),
          rankBiserialLaterVsEarlier: requiredFinite(
            row.rankBiserialLaterVsEarlier,
            "AI Wilcoxon rank-biserial effect",
          ),
        });
      }
    }
    return {
      scope: {
        kind: inference.kind,
        groupRole,
        earlierPeriodIndex: earlier,
        laterPeriodIndex: later,
        periodCount: periodCount(inference),
        differenceDirection: "later-minus-earlier",
        cohortPolicy: "pairwise-complete",
      },
      members,
      omissions,
    };
  }

  const groupRole = roleForSelectedRepeatedGroup(result, inference);
  const selectedPeriodIndices = inference.scope.periods.map((period) => periodIndex(inference, period));
  const completeGate = (inference.ledger?.completeBlockCount ?? 0) >= OPEN_ENA_AI_MIN_AGGREGATE_N;
  for (const row of inference.omnibusRows) {
    const id = `omnibus-${axisRole(row.axisIndex)}`;
    if (row.status !== "available") {
      omissions.push(omission(id, row, "omnibus-family", "not-available"));
    } else if (!completeGate || row.nComplete < OPEN_ENA_AI_MIN_AGGREGATE_N) {
      omissions.push(omission(id, row, "omnibus-family", "minimum-aggregate"));
    } else {
      members.push({
        id,
        ...commonAvailableMember(row, "omnibus-family"),
        test: "friedman",
        groupRole,
        selectedPeriodIndices: [...selectedPeriodIndices],
        nComplete: row.nComplete,
        nMissingCompleteBlocks: row.nMissingCompleteBlocks,
        nPeriods: row.nPeriods,
        q: requiredFinite(row.q, "AI Friedman Q"),
        degreesFreedom: requiredFinite(row.degreesFreedom, "AI Friedman degrees of freedom"),
        kendallsW: requiredFinite(row.kendallsW, "AI Friedman Kendall W"),
      });
    }
  }
  for (const row of inference.followupRows) {
    const earlier = selectedPeriodIndices[row.earlierPeriodIndex];
    const later = selectedPeriodIndices[row.laterPeriodIndex];
    if (earlier === undefined || later === undefined) {
      throw new Error("AI repeated-period follow-up index is outside the selected-period scope.");
    }
    const id = `posthoc-${axisRole(row.axisIndex)}-period-${earlier + 1}-period-${later + 1}`;
    if (row.status !== "available") {
      omissions.push(omission(id, row, "posthoc-family", "not-available", earlier, later));
    } else if (!completeGate
      || row.nMatched < OPEN_ENA_AI_MIN_AGGREGATE_N
      || row.nNonzero < OPEN_ENA_AI_MIN_AGGREGATE_N
      || row.nRanked < OPEN_ENA_AI_MIN_AGGREGATE_N) {
      omissions.push(omission(id, row, "posthoc-family", "minimum-aggregate", earlier, later));
    } else {
      members.push({
        id,
        ...commonAvailableMember(row, "posthoc-family"),
        test: "wilcoxon-signed-rank",
        groupRole,
        earlierPeriodIndex: earlier,
        laterPeriodIndex: later,
        differenceDirection: "later-minus-earlier",
        nMatched: row.nMatched,
        nMissing: row.nMissing,
        nPositive: row.nPositive,
        nNegative: row.nNegative,
        nZero: row.nZero,
        nNonzero: row.nNonzero,
        nRanked: row.nRanked,
        wPositive: requiredFinite(row.wPositive, "AI follow-up W positive"),
        wNegative: requiredFinite(row.wNegative, "AI follow-up W negative"),
        t: requiredFinite(row.t, "AI follow-up T"),
        rankBiserialLaterVsEarlier: requiredFinite(
          row.rankBiserialLaterVsEarlier,
          "AI follow-up rank-biserial effect",
        ),
      });
    }
  }
  return {
    scope: {
      kind: inference.kind,
      groupRole,
      selectedPeriodIndices,
      periodCount: periodCount(inference),
      cohortPolicy: "all-period-complete",
      posthocContrasts: "all-period-pairs",
    },
    members,
    omissions,
  };
}

function descriptiveAxesV2(
  result: OpenEnaResult,
  selectedAxes: readonly [string, string],
): [OpenEnaAiEvidenceAxisV2, OpenEnaAiEvidenceAxisV2] {
  return ([0, 1] as const).map((index) => ({
    id: axisRole(index),
    role: axisRole(index),
    varianceShare: result.set.variance[selectedAxes[index]] === undefined
      ? null
      : finiteExact(result.set.variance[selectedAxes[index]], "AI descriptive variance share"),
  })) as [OpenEnaAiEvidenceAxisV2, OpenEnaAiEvidenceAxisV2];
}

function descriptiveGroupV2(
  group: OpenEnaResult["groups"][number],
  role: OpenEnaAiGroupRoleV2,
  selectedAxes: readonly [string, string],
  n = group.count,
): OpenEnaAiEvidenceGroupV2 {
  return {
    id: `descriptive-${role}`,
    role,
    n,
    meanCoordinates: {
      "axis-1": finiteExact(group.meanPoint[selectedAxes[0]], "AI descriptive axis-1 mean"),
      "axis-2": finiteExact(group.meanPoint[selectedAxes[1]], "AI descriptive axis-2 mean"),
    },
  };
}

function endpointDescriptiveV2(
  result: OpenEnaResult,
  inference: Extract<OpenEnaInferenceResultV2, { kind: "endpoint-independent" }>,
): OpenEnaAiDescriptiveEvidenceV2 {
  const primary = result.groups.find((group) => group.name === inference.scope.primaryGroup);
  const secondary = result.groups.find((group) => group.name === inference.scope.secondaryGroup);
  if (!primary || !secondary) throw new Error("AI endpoint groups are absent from the current result.");
  const eligible = primary.count >= OPEN_ENA_AI_MIN_AGGREGATE_N
    && secondary.count >= OPEN_ENA_AI_MIN_AGGREGATE_N;
  const groups = eligible
    ? [
        descriptiveGroupV2(primary, "primary", inference.binding.axes),
        descriptiveGroupV2(secondary, "secondary", inference.binding.axes),
      ]
    : [];
  const edges = eligible
    ? result.set.adjacencyKey.map((edge) => ({
        sourceCode: edge.source,
        targetCode: edge.target,
        primaryWeight: finiteExact(primary.meanWeights[edge.name], "AI primary edge weight"),
        secondaryWeight: finiteExact(secondary.meanWeights[edge.name], "AI secondary edge weight"),
      })).map((edge) => ({
        ...edge,
        signedDifference: edge.primaryWeight - edge.secondaryWeight,
      })).sort((left, right) => Math.abs(right.signedDifference) - Math.abs(left.signedDifference)
        || left.sourceCode.localeCompare(right.sourceCode)
        || left.targetCode.localeCompare(right.targetCode))
      .slice(0, OPEN_ENA_AI_MAX_EDGES)
      .map((edge, index): OpenEnaAiEvidenceEdgeV2 => ({
        id: `edge-difference-${index + 1}`,
        sourceCodeRole: codeRole(result, edge.sourceCode),
        targetCodeRole: codeRole(result, edge.targetCode),
        primaryWeight: edge.primaryWeight,
        secondaryWeight: edge.secondaryWeight,
        signedDifference: edge.signedDifference,
      }))
    : [];
  return {
    axes: descriptiveAxesV2(result, inference.binding.axes),
    groups,
    edges,
    trajectory: null,
  };
}

function trajectoryDescriptiveV2(
  result: OpenEnaResult,
  inference: Exclude<OpenEnaInferenceResultV2, { kind: "endpoint-independent" }>,
  view: OpenEnaLongitudinalView,
): OpenEnaAiDescriptiveEvidenceV2 {
  const mapping = inference.binding.trajectoryMapping;
  if (!mapping
    || !view.identityConfirmed
    || view.source.normalizedUtf8TextSha256 !== inference.binding.dataset.normalizedUtf8TextSha256
    || view.source.hashKind !== inference.binding.dataset.hashKind
    || !sameOpenEnaConfig(view.configuration, inference.binding.configuration)
    || JSON.stringify(view.repeatedEntityColumns) !== JSON.stringify(mapping.repeatedEntityColumns)
    || view.timeColumn !== mapping.timeColumn
    || JSON.stringify(view.timeOrder) !== JSON.stringify(mapping.timeOrder)
    || view.resultProvenance.analyzedAt !== result.analyzedAt
    || view.resultProvenance.modelType !== result.set.modelType
    || view.axes[0] !== inference.binding.axes[0]
    || view.axes[1] !== inference.binding.axes[1]) {
    throw new Error("AI descriptive trajectory binding does not match the current successful inference result.");
  }
  const roleByName = new Map<string, OpenEnaAiGroupRoleV2>();
  for (const viewGroup of view.groups) {
    if (inference.kind === "trajectory-independent-period"
      && viewGroup.name === inference.scope.primaryGroup) {
      roleByName.set(viewGroup.name, "primary");
    } else if (inference.kind === "trajectory-independent-period"
      && viewGroup.name === inference.scope.secondaryGroup) {
      roleByName.set(viewGroup.name, "secondary");
    } else if ("group" in inference.scope && inference.scope.group === null && view.groups.length === 1) {
      roleByName.set(viewGroup.name, "all-units");
    } else {
      roleByName.set(viewGroup.name, roleForConfiguredGroup(result, viewGroup.name));
    }
  }
  const groups = view.groups.flatMap((viewGroup) => {
    if (viewGroup.entityCount < OPEN_ENA_AI_MIN_AGGREGATE_N) return [];
    const role = roleByName.get(viewGroup.name);
    const fitted = result.groups.find((group) => group.name === viewGroup.name);
    if (!role || !fitted) return [];
    return [descriptiveGroupV2(fitted, role, inference.binding.axes, viewGroup.entityCount)];
  });
  const eligibleRoles = new Set(groups.map((group) => group.role));
  const groupPeriods = view.groups.flatMap((viewGroup) => {
    const role = roleByName.get(viewGroup.name);
    if (!role || !eligibleRoles.has(role)) return [];
    return viewGroup.periods.flatMap((period): OpenEnaAiTrajectoryPeriodV2[] => {
      if (period.nUsed < OPEN_ENA_AI_MIN_AGGREGATE_N) return [];
      return [{
        id: `trajectory-${role}-period-${period.timeIndex + 1}`,
        groupRole: role,
        periodIndex: period.timeIndex,
        nUsed: period.nUsed,
        nExcluded: period.nExcluded,
        centroid: period.centroid
          ? {
              axis1: finiteExact(period.centroid.x, "AI trajectory centroid axis-1"),
              axis2: finiteExact(period.centroid.y, "AI trajectory centroid axis-2"),
            }
          : null,
        delta: period.dx === null || period.dy === null
          ? null
          : {
              axis1: finiteExact(period.dx, "AI trajectory delta axis-1"),
              axis2: finiteExact(period.dy, "AI trajectory delta axis-2"),
            },
        stepDistance: period.stepDistance === null
          ? null
          : finiteExact(period.stepDistance, "AI trajectory step distance"),
        continuityStatus: period.continuityStatus,
      }];
    });
  });
  const edges = result.groups.flatMap((group) => {
    const role = roleByName.get(group.name);
    if (!role || !eligibleRoles.has(role)) return [];
    return Object.entries(group.meanWeights).map(([name, weight]) => ({ role, name, weight }));
  }).sort((left, right) => Math.abs(right.weight) - Math.abs(left.weight)
    || left.name.localeCompare(right.name))
    .slice(0, OPEN_ENA_AI_MAX_EDGES)
    .map((edge, index): OpenEnaAiEvidenceEdgeV2 => {
      const adjacency = result.set.adjacencyKey.find((candidate) => candidate.name === edge.name);
      if (!adjacency) throw new Error("AI trajectory edge is absent from the current result geometry.");
      return {
        id: `edge-mean-${index + 1}`,
        sourceCodeRole: codeRole(result, adjacency.source),
        targetCodeRole: codeRole(result, adjacency.target),
        groupRole: edge.role,
        meanWeight: finiteExact(edge.weight, "AI trajectory edge mean"),
      };
    });
  return {
    axes: descriptiveAxesV2(result, inference.binding.axes),
    groups,
    edges,
    trajectory: {
      cohortPolicy: view.cohortPolicy,
      periodCount: view.timeOrder.length,
      availableEntityCount: view.availableEntityCount,
      completeEntityCount: view.completeEntityCount,
      includedEntityCount: view.includedEntityCount,
      groupPeriods,
    },
  };
}

function boundariesV2(
  inference: OpenEnaInferenceResultV2,
  hasMinimumAggregateOmission: boolean,
) {
  const selected = new Set<OpenEnaAiBoundaryCodeV2>(V2_BASE_BOUNDARIES);
  if (inference.kind === "endpoint-independent" || inference.kind === "trajectory-independent-period") {
    selected.add("independent-entity-assumption");
  }
  if (inference.kind === "trajectory-paired-periods" || inference.kind === "trajectory-repeated-periods") {
    selected.add("signed-rank-symmetry-assumption");
    selected.add("wilcox-zero-removal");
  }
  if (inference.kind === "trajectory-repeated-periods") selected.add("all-period-complete-cohort");
  if (inference.warnings.includes("accumulated-trajectory-path-dependence")) {
    selected.add("accumulated-trajectory-path-dependence");
  }
  if (inference.warnings.includes("mr1-circularity")) selected.add("mr1-circularity");
  if (hasMinimumAggregateOmission) {
    selected.add("holm-audit-not-reconstructible-after-privacy-redaction");
    selected.add("minimum-aggregate-disclosure");
  }
  return V2_BOUNDARY_ORDER.filter((boundary) => selected.has(boundary));
}

function deepFreeze<T>(value: T, seen = new Set<unknown>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

export function buildOpenEnaAiInterpretationRequest(
  input: BuildOpenEnaAiInterpretationRequestInput,
): OpenEnaAiInterpretationRequestV2 {
  assertOpenEnaCapabilityForContext(input.config, input.result, "ai-interpretation");
  assertOpenEnaInferenceCoordinatorConsumerV2(input.currentInference);
  assertOpenEnaInferenceCurrentContextV2(input.currentInference, {
    groupNames: input.result.groups.map((group) => group.name),
    groupColumn: input.config.groupColumn,
    trajectoryMapping: input.currentInference.kind === "endpoint-independent"
      ? null
      : input.longitudinalView?.identityConfirmed
        ? {
            contractVersion: 1,
            repeatedEntityColumns: [...input.longitudinalView.repeatedEntityColumns],
            identityConfirmed: true,
            timeColumn: input.longitudinalView.timeColumn,
            timeOrder: [...input.longitudinalView.timeOrder],
          }
        : null,
  });
  if (input.currentInference.status === "disabled") {
    throw new Error("AI interpretation requires an available or not-estimable confirmed inference result.");
  }
  if (input.result.set.modelType !== input.config.model
    || !sameOpenEnaConfig(input.currentInference.binding.configuration, input.config)) {
    throw new Error("AI interpretation requires the successful result configuration.");
  }
  if (!input.datasetHash || !/^[0-9a-f]{64}$/iu.test(input.datasetHash)) {
    throw new Error("AI interpretation requires the current 64-character dataset SHA-256 binding.");
  }
  const hash = input.datasetHash.toLowerCase();
  assertOpenEnaInferenceBindingV2(input.currentInference, {
    analyzedAt: input.result.analyzedAt,
    datasetNormalizedUtf8TextSha256: hash,
    datasetHashKind: input.currentInference.binding.dataset.hashKind,
    modelType: input.result.set.modelType,
    configuration: input.config,
    axes: input.currentInference.binding.axes,
  });
  const projection = buildInferenceProjection(input.result, input.currentInference);
  const descriptive = input.currentInference.kind === "endpoint-independent"
    ? endpointDescriptiveV2(input.result, input.currentInference)
    : input.longitudinalView
      ? trajectoryDescriptiveV2(input.result, input.currentInference, input.longitudinalView)
      : (() => { throw new Error("Trajectory AI interpretation requires current aggregate descriptive evidence."); })();
  const evidence: OpenEnaAiEvidenceV2 = {
    kind: input.currentInference.kind,
    modelType: input.result.set.modelType,
    scope: projection.scope,
    descriptive,
    inference: projection.members,
    inferenceOmissions: projection.omissions,
    boundaries: boundariesV2(
      input.currentInference,
      projection.omissions.some((entry) => entry.reason === "minimum-aggregate"),
    ),
  };
  const request: OpenEnaAiInterpretationRequestV2 = {
    schemaVersion: OPEN_ENA_AI_REQUEST_SCHEMA_VERSION_V2,
    promptVersion: OPEN_ENA_AI_PROMPT_VERSION_V2,
    locale: aiLocale(input.locale),
    binding: {
      analyzedAt: input.result.analyzedAt,
      datasetHash: hash,
      datasetHashKind: input.currentInference.binding.dataset.hashKind,
      modelType: input.result.set.modelType,
      axes: [...input.currentInference.binding.axes],
      evidenceKey: stableEvidenceKey(evidence),
    },
    evidence,
  };
  // Keep the browser producer and server reader on one exact contract; never
  // invite consent for a payload that the owned route would subsequently reject.
  parseOpenEnaAiInterpretationRequestV2(request);
  return deepFreeze(request);
}

function strictV2Label(value: unknown, label: string) {
  if (typeof value !== "string" || value.length < 1 || value.length > 80
    || value !== value.trim()
    || /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(value)) {
    throw new Error(`${label} is an invalid or hostile label.`);
  }
  return value;
}

function strictV2Id(value: unknown, label: string) {
  if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value) || value.length > 100) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string, maximum = 10_000_000) {
  const parsed = integer(value, label, maximum);
  if (parsed < 1) throw new Error(`${label} must be positive.`);
  return parsed;
}

function v2Probability(value: unknown, label: string) {
  const parsed = finiteExact(value, label);
  if (parsed < 0 || parsed > 1) throw new Error(`${label} must be between zero and one.`);
  return parsed;
}

function v2Effect(value: unknown, label: string) {
  const parsed = finiteExact(value, label);
  if (parsed < -1 || parsed > 1) throw new Error(`${label} must be between minus one and one.`);
  return parsed;
}

function parseAxisRoleV2(value: unknown, label: string): OpenEnaAiAxisRoleV2 {
  return enumValue(value, ["axis-1", "axis-2"], label);
}

function parseGroupRoleV2(value: unknown, label: string): OpenEnaAiGroupRoleV2 {
  if (value === "primary" || value === "secondary" || value === "all-units") return value;
  if (typeof value === "string" && /^group-[1-6]$/u.test(value)) return value as `group-${number}`;
  throw new Error(`${label} is invalid.`);
}

function parseCodeRoleV2(value: unknown, label: string): OpenEnaAiCodeRoleV2 {
  if (typeof value === "string" && /^code-(?:[1-9]|[12][0-9]|30)$/u.test(value)) {
    return value as OpenEnaAiCodeRoleV2;
  }
  throw new Error(`${label} is invalid.`);
}

function parseFamilyRoleV2(value: unknown, label: string): OpenEnaAiFamilyRoleV2 {
  return enumValue(value, ["comparison-family", "omnibus-family", "posthoc-family"], label);
}

function parseWarningsV2(value: unknown, label: string): OpenEnaRankWarningCode[] {
  return unique(boundedArray(value, label, V2_WARNING_CODES.length).map((warning, index) => (
    enumValue(warning, V2_WARNING_CODES, `${label} item ${index + 1}`)
  )), label) as OpenEnaRankWarningCode[];
}

function parseDescriptiveAxesV2(value: unknown) {
  const parsed = boundedArray(value, "AI v2 descriptive axes", 2).map((axis, index) => {
    const record = exactRecord(axis, ["id", "role", "varianceShare"], `AI v2 descriptive axis ${index + 1}`);
    const expected = axisRole(index as 0 | 1);
    const id = parseAxisRoleV2(record.id, `AI v2 descriptive axis ${index + 1} id`);
    const role = parseAxisRoleV2(record.role, `AI v2 descriptive axis ${index + 1} role`);
    if (id !== expected || role !== expected) throw new Error("AI v2 descriptive axis roles are invalid.");
    return {
      id,
      role,
      varianceShare: record.varianceShare === null
        ? null
        : v2Probability(record.varianceShare, `AI v2 descriptive axis ${index + 1} variance`),
    };
  });
  if (parsed.length !== 2) throw new Error("AI v2 evidence must contain exactly two axis roles.");
  return parsed as [OpenEnaAiEvidenceAxisV2, OpenEnaAiEvidenceAxisV2];
}

function parseDescriptiveGroupsV2(value: unknown) {
  const groups = boundedArray(value, "AI v2 descriptive groups", 6).map((group, index) => {
    const record = exactRecord(group, ["id", "role", "n", "meanCoordinates"], `AI v2 group ${index + 1}`);
    const role = parseGroupRoleV2(record.role, `AI v2 group ${index + 1} role`);
    const id = strictV2Id(record.id, `AI v2 group ${index + 1} id`);
    if (id !== `descriptive-${role}`) throw new Error("AI v2 descriptive group ID does not match its request-local role.");
    const coordinates = exactRecord(
      record.meanCoordinates,
      ["axis-1", "axis-2"],
      `AI v2 group ${index + 1} mean coordinates`,
    );
    return {
      id: id as `descriptive-${OpenEnaAiGroupRoleV2}`,
      role,
      n: minimumAggregateCount(integer(record.n, `AI v2 group ${index + 1} count`), `AI v2 group ${index + 1}`),
      meanCoordinates: {
        "axis-1": finiteExact(coordinates["axis-1"], `AI v2 group ${index + 1} axis-1 mean`),
        "axis-2": finiteExact(coordinates["axis-2"], `AI v2 group ${index + 1} axis-2 mean`),
      },
    };
  });
  unique(groups.map((group) => group.id), "AI v2 descriptive group IDs");
  unique(groups.map((group) => group.role), "AI v2 descriptive group roles");
  return groups;
}

function parseDescriptiveEdgesV2(value: unknown) {
  const edges = boundedArray(value, "AI v2 descriptive edges", OPEN_ENA_AI_MAX_EDGES).map((edge, index) => {
    if (typeof edge !== "object" || edge === null || Array.isArray(edge)) {
      throw new Error(`AI v2 edge ${index + 1} must be an object.`);
    }
    const record = edge as UnknownRecord;
    const difference = Object.prototype.hasOwnProperty.call(record, "signedDifference");
    const expected = difference
      ? ["id", "sourceCodeRole", "targetCodeRole", "primaryWeight", "secondaryWeight", "signedDifference"]
      : ["id", "sourceCodeRole", "targetCodeRole", "groupRole", "meanWeight"];
    exactRecord(record, expected, `AI v2 edge ${index + 1}`);
    const sourceCodeRole = parseCodeRoleV2(record.sourceCodeRole, `AI v2 edge ${index + 1} source code role`);
    const targetCodeRole = parseCodeRoleV2(record.targetCodeRole, `AI v2 edge ${index + 1} target code role`);
    if (sourceCodeRole === targetCodeRole) throw new Error("AI v2 descriptive edge code roles must differ.");
    const common = {
      id: strictV2Id(record.id, `AI v2 edge ${index + 1} id`),
      sourceCodeRole,
      targetCodeRole,
    };
    if (difference) {
      const primaryWeight = finiteExact(record.primaryWeight, `AI v2 edge ${index + 1} primary weight`);
      const secondaryWeight = finiteExact(record.secondaryWeight, `AI v2 edge ${index + 1} secondary weight`);
      const signedDifference = finiteExact(record.signedDifference, `AI v2 edge ${index + 1} difference`);
      if (Math.abs(signedDifference - (primaryWeight - secondaryWeight)) > 1e-12) {
        throw new Error("AI v2 descriptive edge difference is inconsistent.");
      }
      return { ...common, primaryWeight, secondaryWeight, signedDifference };
    }
    return {
      ...common,
      groupRole: parseGroupRoleV2(record.groupRole, `AI v2 edge ${index + 1} group role`),
      meanWeight: finiteExact(record.meanWeight, `AI v2 edge ${index + 1} mean weight`),
    };
  });
  unique(edges.map((edge) => edge.id), "AI v2 descriptive edge IDs");
  return edges;
}

function parseTrajectoryV2(value: unknown) {
  if (value === null) return null;
  const record = exactRecord(value, [
    "cohortPolicy",
    "periodCount",
    "availableEntityCount",
    "completeEntityCount",
    "includedEntityCount",
    "groupPeriods",
  ], "AI v2 descriptive trajectory");
  const count = positiveInteger(record.periodCount, "AI v2 trajectory period count", 20_000);
  const periods = boundedArray(record.groupPeriods, "AI v2 trajectory group periods", 120_000).map((period, index) => {
    const item = exactRecord(period, [
      "id",
      "groupRole",
      "periodIndex",
      "nUsed",
      "nExcluded",
      "centroid",
      "delta",
      "stepDistance",
      "continuityStatus",
    ], `AI v2 trajectory period ${index + 1}`);
    const parsePoint = (point: unknown, label: string) => {
      if (point === null) return null;
      const coordinates = exactRecord(point, ["axis1", "axis2"], label);
      return {
        axis1: finiteExact(coordinates.axis1, `${label} axis-1`),
        axis2: finiteExact(coordinates.axis2, `${label} axis-2`),
      };
    };
    const groupRole = parseGroupRoleV2(item.groupRole, `AI v2 trajectory period ${index + 1} group role`);
    const periodIndexValue = integer(item.periodIndex, `AI v2 trajectory period ${index + 1} index`, count - 1);
    const id = strictV2Id(item.id, `AI v2 trajectory period ${index + 1} id`);
    if (id !== `trajectory-${groupRole}-period-${periodIndexValue + 1}`) {
      throw new Error("AI v2 trajectory period ID does not match its request-local roles.");
    }
    const centroid = parsePoint(item.centroid, `AI v2 trajectory period ${index + 1} centroid`);
    const delta = parsePoint(item.delta, `AI v2 trajectory period ${index + 1} delta`);
    const stepDistance = item.stepDistance === null
      ? null
      : finiteExact(item.stepDistance, `AI v2 trajectory period ${index + 1} distance`);
    const continuityStatus = enumValue(item.continuityStatus, [
      "start",
      "connected",
      "missing-period",
      "no-contributor-overlap",
    ], `AI v2 trajectory period ${index + 1} continuity`);
    if (!centroid) throw new Error("AI v2 disclosed trajectory periods require an aggregate centroid.");
    if (continuityStatus === "connected") {
      if (!delta || stepDistance === null || stepDistance < 0
        || Math.abs(stepDistance - Math.hypot(delta.axis1, delta.axis2)) > 1e-12) {
        throw new Error("AI v2 connected trajectory-period movement is inconsistent.");
      }
    } else if (delta !== null || stepDistance !== null) {
      throw new Error("AI v2 disconnected trajectory periods cannot carry movement statistics.");
    }
    return {
      id,
      groupRole,
      periodIndex: periodIndexValue,
      nUsed: minimumAggregateCount(
        integer(item.nUsed, `AI v2 trajectory period ${index + 1} used count`),
        `AI v2 trajectory period ${index + 1}`,
      ),
      nExcluded: integer(item.nExcluded, `AI v2 trajectory period ${index + 1} excluded count`),
      centroid,
      delta,
      stepDistance,
      continuityStatus,
    };
  });
  unique(periods.map((period) => period.id), "AI v2 trajectory period IDs");
  const rolePeriods = periods.map((period) => `${period.groupRole}:${period.periodIndex}`);
  unique(rolePeriods, "AI v2 trajectory group-period roles");
  const availableEntityCount = integer(record.availableEntityCount, "AI v2 trajectory available entity count");
  const completeEntityCount = integer(record.completeEntityCount, "AI v2 trajectory complete entity count");
  const includedEntityCount = integer(record.includedEntityCount, "AI v2 trajectory included entity count");
  const cohortPolicy = enumValue(record.cohortPolicy, ["available", "complete"], "AI v2 trajectory cohort policy");
  if (completeEntityCount > availableEntityCount
    || includedEntityCount > availableEntityCount
    || (cohortPolicy === "available" && includedEntityCount !== availableEntityCount)
    || (cohortPolicy === "complete" && includedEntityCount !== completeEntityCount)) {
    throw new Error("AI v2 descriptive trajectory cohort counts are inconsistent.");
  }
  return {
    cohortPolicy,
    periodCount: count,
    availableEntityCount,
    completeEntityCount,
    includedEntityCount,
    groupPeriods: periods,
  };
}

function parseScopeV2(value: unknown, kind: OpenEnaAiEvidenceV2["kind"]): OpenEnaAiInferenceScopeV2 {
  if (kind === "endpoint-independent") {
    const record = exactRecord(value, ["kind", "groupRoles"], "AI v2 endpoint inference scope");
    if (record.kind !== kind) throw new Error("AI v2 scope kind is inconsistent.");
    const roles = boundedArray(record.groupRoles, "AI v2 endpoint group roles", 2);
    if (roles.length !== 2 || roles[0] !== "primary" || roles[1] !== "secondary") {
      throw new Error("AI v2 endpoint group roles are invalid.");
    }
    return { kind, groupRoles: ["primary", "secondary"] };
  }
  if (kind === "trajectory-independent-period") {
    const record = exactRecord(value, ["kind", "groupRoles", "periodIndex", "periodCount"], "AI v2 period inference scope");
    if (record.kind !== kind) throw new Error("AI v2 scope kind is inconsistent.");
    const count = positiveInteger(record.periodCount, "AI v2 period count", 20_000);
    const roles = boundedArray(record.groupRoles, "AI v2 independent group roles", 2);
    if (roles.length !== 2 || roles[0] !== "primary" || roles[1] !== "secondary") {
      throw new Error("AI v2 independent group roles are invalid.");
    }
    return {
      kind,
      groupRoles: ["primary", "secondary"],
      periodIndex: integer(record.periodIndex, "AI v2 selected period index", count - 1),
      periodCount: count,
    };
  }
  if (kind === "trajectory-paired-periods") {
    const record = exactRecord(value, [
      "kind", "groupRole", "earlierPeriodIndex", "laterPeriodIndex", "periodCount",
      "differenceDirection", "cohortPolicy",
    ], "AI v2 paired inference scope");
    if (record.kind !== kind) throw new Error("AI v2 scope kind is inconsistent.");
    const count = positiveInteger(record.periodCount, "AI v2 paired period count", 20_000);
    const earlier = integer(record.earlierPeriodIndex, "AI v2 earlier period index", count - 1);
    const later = integer(record.laterPeriodIndex, "AI v2 later period index", count - 1);
    if (earlier >= later) throw new Error("AI v2 paired period indices must be strictly ordered.");
    return {
      kind,
      groupRole: parseGroupRoleV2(record.groupRole, "AI v2 paired group role"),
      earlierPeriodIndex: earlier,
      laterPeriodIndex: later,
      periodCount: count,
      differenceDirection: enumValue(record.differenceDirection, ["later-minus-earlier"], "AI v2 paired direction"),
      cohortPolicy: enumValue(record.cohortPolicy, ["pairwise-complete"], "AI v2 paired cohort policy"),
    };
  }
  const record = exactRecord(value, [
    "kind", "groupRole", "selectedPeriodIndices", "periodCount", "cohortPolicy", "posthocContrasts",
  ], "AI v2 repeated inference scope");
  if (record.kind !== kind) throw new Error("AI v2 scope kind is inconsistent.");
  const count = positiveInteger(record.periodCount, "AI v2 repeated period count", 20_000);
  const selected = boundedArray(record.selectedPeriodIndices, "AI v2 selected repeated periods", count).map(
    (item, index) => integer(item, `AI v2 selected repeated period ${index + 1}`, count - 1),
  );
  if (selected.length < 3 || new Set(selected).size !== selected.length
    || selected.some((entry, index) => index > 0 && entry <= selected[index - 1])) {
    throw new Error("AI v2 repeated period indices must be unique and strictly ordered.");
  }
  return {
    kind,
    groupRole: parseGroupRoleV2(record.groupRole, "AI v2 repeated group role"),
    selectedPeriodIndices: selected,
    periodCount: count,
    cohortPolicy: enumValue(record.cohortPolicy, ["all-period-complete"], "AI v2 repeated cohort policy"),
    posthocContrasts: enumValue(record.posthocContrasts, ["all-period-pairs"], "AI v2 post-hoc policy"),
  };
}

const COMMON_MEMBER_KEYS_V2 = [
  "id",
  "axisRole",
  "familyRole",
  "status",
  "pRaw",
  "pHolm",
  "resolvedPMethod",
  "continuityCorrectionApplied",
  "tieGroupCount",
  "tiedObservationCount",
  "warnings",
] as const;

function parseCommonMemberV2(record: UnknownRecord, index: number) {
  const pRaw = v2Probability(record.pRaw, `AI v2 inference member ${index + 1} raw p`);
  const pHolm = v2Probability(record.pHolm, `AI v2 inference member ${index + 1} Holm p`);
  if (pHolm < pRaw) throw new Error("AI v2 Holm p cannot be smaller than raw p.");
  if (record.status !== "available") throw new Error("AI v2 supplied inference members must be available.");
  if (typeof record.continuityCorrectionApplied !== "boolean") {
    throw new Error("AI v2 continuity-correction metadata is invalid.");
  }
  return {
    id: strictV2Id(record.id, `AI v2 inference member ${index + 1} id`),
    axisRole: parseAxisRoleV2(record.axisRole, `AI v2 inference member ${index + 1} axis role`),
    familyRole: parseFamilyRoleV2(record.familyRole, `AI v2 inference member ${index + 1} family role`),
    status: "available" as const,
    pRaw,
    pHolm,
    resolvedPMethod: enumValue(
      record.resolvedPMethod,
      V2_RESOLVED_METHODS,
      `AI v2 inference member ${index + 1} resolved method`,
    ),
    continuityCorrectionApplied: record.continuityCorrectionApplied,
    tieGroupCount: integer(record.tieGroupCount, `AI v2 inference member ${index + 1} tie-group count`),
    tiedObservationCount: integer(record.tiedObservationCount, `AI v2 inference member ${index + 1} tied count`),
    warnings: parseWarningsV2(record.warnings, `AI v2 inference member ${index + 1} warnings`),
  };
}

function parseInferenceMembersV2(value: unknown) {
  const members = boundedArray(value, "AI v2 inference members", 240_000).map((member, index): OpenEnaAiInferenceMemberV2 => {
    if (typeof member !== "object" || member === null || Array.isArray(member)) {
      throw new Error(`AI v2 inference member ${index + 1} must be an object.`);
    }
    const record = member as UnknownRecord;
    const test = enumValue(record.test, [
      "mann-whitney-u",
      "wilcoxon-signed-rank",
      "friedman",
    ], `AI v2 inference member ${index + 1} test`);
    if (test === "mann-whitney-u") {
      exactRecord(record, [
        ...COMMON_MEMBER_KEYS_V2,
        "test", "groupRoles", "nPrimary", "nSecondary", "uPrimary", "uSecondary",
        "rankBiserialPrimaryVsSecondary",
      ], `AI v2 Mann-Whitney member ${index + 1}`);
      const common = parseCommonMemberV2(record, index);
      if (common.familyRole !== "comparison-family") throw new Error("AI v2 Mann-Whitney family role is invalid.");
      if (![
        "exact-classic",
        "exact-conditional-rank-permutation",
        "normal-approximation-tie-corrected",
      ].includes(common.resolvedPMethod)) {
        throw new Error("AI v2 Mann-Whitney resolved method is invalid.");
      }
      if (common.continuityCorrectionApplied
        !== (common.resolvedPMethod === "normal-approximation-tie-corrected")) {
        throw new Error("AI v2 Mann-Whitney continuity metadata is inconsistent.");
      }
      const roles = boundedArray(record.groupRoles, "AI v2 Mann-Whitney group roles", 2);
      if (roles.length !== 2 || roles[0] !== "primary" || roles[1] !== "secondary") {
        throw new Error("AI v2 Mann-Whitney group roles are invalid.");
      }
      const nPrimary = minimumAggregateCount(
        integer(record.nPrimary, "AI v2 Mann-Whitney primary n"),
        "AI v2 Mann-Whitney primary",
      );
      const nSecondary = minimumAggregateCount(
        integer(record.nSecondary, "AI v2 Mann-Whitney secondary n"),
        "AI v2 Mann-Whitney secondary",
      );
      const uPrimary = finiteExact(record.uPrimary, "AI v2 Mann-Whitney U primary");
      const uSecondary = finiteExact(record.uSecondary, "AI v2 Mann-Whitney U secondary");
      const product = nPrimary * nSecondary;
      if (uPrimary < 0 || uSecondary < 0 || uPrimary > product || uSecondary > product
        || Math.abs(uPrimary + uSecondary - product) > 1e-9) {
        throw new Error("AI v2 Mann-Whitney U components are inconsistent with group counts.");
      }
      const rankBiserialPrimaryVsSecondary = v2Effect(
        record.rankBiserialPrimaryVsSecondary,
        "AI v2 Mann-Whitney effect",
      );
      if (Math.abs(rankBiserialPrimaryVsSecondary - (2 * uPrimary / product - 1)) > 1e-12) {
        throw new Error("AI v2 Mann-Whitney effect is inconsistent with U and group counts.");
      }
      return {
        ...common,
        test,
        groupRoles: ["primary", "secondary"],
        nPrimary,
        nSecondary,
        uPrimary,
        uSecondary,
        rankBiserialPrimaryVsSecondary,
      };
    }
    if (test === "wilcoxon-signed-rank") {
      exactRecord(record, [
        ...COMMON_MEMBER_KEYS_V2,
        "test", "groupRole", "earlierPeriodIndex", "laterPeriodIndex", "differenceDirection",
        "nMatched", "nMissing", "nPositive", "nNegative", "nZero", "nNonzero", "nRanked",
        "wPositive", "wNegative", "t", "rankBiserialLaterVsEarlier",
      ], `AI v2 Wilcoxon member ${index + 1}`);
      const common = parseCommonMemberV2(record, index);
      if (common.familyRole !== "comparison-family" && common.familyRole !== "posthoc-family") {
        throw new Error("AI v2 Wilcoxon family role is invalid.");
      }
      if (![
        "exact-classic",
        "exact-conditional-sign-flip",
        "normal-approximation-actual-ranks",
      ].includes(common.resolvedPMethod)) {
        throw new Error("AI v2 Wilcoxon resolved method is invalid.");
      }
      if (common.continuityCorrectionApplied
        !== (common.resolvedPMethod === "normal-approximation-actual-ranks")) {
        throw new Error("AI v2 Wilcoxon continuity metadata is inconsistent.");
      }
      const earlier = integer(record.earlierPeriodIndex, "AI v2 Wilcoxon earlier period", 20_000);
      const later = integer(record.laterPeriodIndex, "AI v2 Wilcoxon later period", 20_000);
      if (earlier >= later) throw new Error("AI v2 Wilcoxon period indices must be strictly ordered.");
      const nMatched = minimumAggregateCount(integer(record.nMatched, "AI v2 Wilcoxon matched n"), "AI v2 Wilcoxon matched");
      const nMissing = integer(record.nMissing, "AI v2 Wilcoxon missing n");
      const nPositive = integer(record.nPositive, "AI v2 Wilcoxon positive n");
      const nNegative = integer(record.nNegative, "AI v2 Wilcoxon negative n");
      const nZero = integer(record.nZero, "AI v2 Wilcoxon zero n");
      const nNonzero = positiveInteger(record.nNonzero, "AI v2 Wilcoxon nonzero n");
      const nRanked = positiveInteger(record.nRanked, "AI v2 Wilcoxon ranked n");
      if (nPositive + nNegative !== nNonzero || nNonzero !== nRanked || nNonzero + nZero !== nMatched) {
        throw new Error("AI v2 Wilcoxon counts are inconsistent.");
      }
      const wPositive = finiteExact(record.wPositive, "AI v2 Wilcoxon W positive");
      const wNegative = finiteExact(record.wNegative, "AI v2 Wilcoxon W negative");
      const t = finiteExact(record.t, "AI v2 Wilcoxon T");
      if (wPositive < 0 || wNegative < 0 || t !== Math.min(wPositive, wNegative)) {
        throw new Error("AI v2 Wilcoxon statistic components are inconsistent.");
      }
      const totalRank = wPositive + wNegative;
      if (Math.abs(totalRank - nRanked * (nRanked + 1) / 2) > 1e-9) {
        throw new Error("AI v2 Wilcoxon rank totals are inconsistent with the ranked count.");
      }
      const rankBiserialLaterVsEarlier = v2Effect(
        record.rankBiserialLaterVsEarlier,
        "AI v2 Wilcoxon effect",
      );
      if (Math.abs(rankBiserialLaterVsEarlier - (wPositive - wNegative) / totalRank) > 1e-12) {
        throw new Error("AI v2 Wilcoxon effect is inconsistent with the signed ranks.");
      }
      return {
        ...common,
        test,
        groupRole: parseGroupRoleV2(record.groupRole, "AI v2 Wilcoxon group role"),
        earlierPeriodIndex: earlier,
        laterPeriodIndex: later,
        differenceDirection: enumValue(record.differenceDirection, ["later-minus-earlier"], "AI v2 Wilcoxon direction"),
        nMatched,
        nMissing,
        nPositive,
        nNegative,
        nZero,
        nNonzero,
        nRanked,
        wPositive,
        wNegative,
        t,
        rankBiserialLaterVsEarlier,
      };
    }
    exactRecord(record, [
      ...COMMON_MEMBER_KEYS_V2,
      "test", "groupRole", "selectedPeriodIndices", "nComplete", "nMissingCompleteBlocks",
      "nPeriods", "q", "degreesFreedom", "kendallsW",
    ], `AI v2 Friedman member ${index + 1}`);
    const common = parseCommonMemberV2(record, index);
    if (common.familyRole !== "omnibus-family") throw new Error("AI v2 Friedman family role is invalid.");
    if (common.resolvedPMethod !== "exact-conditional-period-permutation"
      && common.resolvedPMethod !== "chi-square-approximation-tie-corrected") {
      throw new Error("AI v2 Friedman resolved method is invalid.");
    }
    if (common.continuityCorrectionApplied) {
      throw new Error("AI v2 Friedman cannot carry continuity-correction metadata.");
    }
    const selectedPeriodIndices = boundedArray(
      record.selectedPeriodIndices,
      "AI v2 Friedman selected periods",
      20_000,
    ).map((period, periodIndexValue) => integer(
      period,
      `AI v2 Friedman selected period ${periodIndexValue + 1}`,
      20_000,
    ));
    const nPeriods = positiveInteger(record.nPeriods, "AI v2 Friedman period count", 20_000);
    if (nPeriods < 3 || selectedPeriodIndices.length !== nPeriods
      || new Set(selectedPeriodIndices).size !== selectedPeriodIndices.length) {
      throw new Error("AI v2 Friedman selected-period counts are inconsistent.");
    }
    const nComplete = minimumAggregateCount(integer(record.nComplete, "AI v2 Friedman complete n"), "AI v2 Friedman complete");
    const degreesFreedom = finiteExact(record.degreesFreedom, "AI v2 Friedman degrees of freedom");
    if (degreesFreedom !== nPeriods - 1) throw new Error("AI v2 Friedman degrees of freedom are inconsistent.");
    const q = finiteExact(record.q, "AI v2 Friedman Q");
    if (q < 0) throw new Error("AI v2 Friedman Q cannot be negative.");
    const kendallsW = v2Probability(record.kendallsW, "AI v2 Friedman Kendall W");
    if (Math.abs(kendallsW - q / (nComplete * degreesFreedom)) > 1e-12) {
      throw new Error("AI v2 Friedman effect is inconsistent with Q and the complete cohort.");
    }
    return {
      ...common,
      test,
      groupRole: parseGroupRoleV2(record.groupRole, "AI v2 Friedman group role"),
      selectedPeriodIndices,
      nComplete,
      nMissingCompleteBlocks: integer(record.nMissingCompleteBlocks, "AI v2 Friedman missing complete blocks"),
      nPeriods,
      q,
      degreesFreedom,
      kendallsW,
    };
  });
  unique(members.map((member) => member.id), "AI v2 inference member IDs");
  return members;
}

function parseInferenceOmissionsV2(value: unknown) {
  const omissions = boundedArray(value, "AI v2 inference omissions", 240_000).map((omissionValue, index) => {
    const record = exactRecord(omissionValue, [
      "id", "axisRole", "familyRole", "test", "earlierPeriodIndex", "laterPeriodIndex", "reason",
    ], `AI v2 inference omission ${index + 1}`);
    const parseNullablePeriod = (period: unknown, label: string) => period === null
      ? null
      : integer(period, label, 20_000);
    return {
      id: strictV2Id(record.id, `AI v2 inference omission ${index + 1} id`),
      axisRole: parseAxisRoleV2(record.axisRole, `AI v2 inference omission ${index + 1} axis role`),
      familyRole: parseFamilyRoleV2(record.familyRole, `AI v2 inference omission ${index + 1} family role`),
      test: enumValue(record.test, ["mann-whitney-u", "wilcoxon-signed-rank", "friedman"], `AI v2 inference omission ${index + 1} test`),
      earlierPeriodIndex: parseNullablePeriod(record.earlierPeriodIndex, `AI v2 inference omission ${index + 1} earlier period`),
      laterPeriodIndex: parseNullablePeriod(record.laterPeriodIndex, `AI v2 inference omission ${index + 1} later period`),
      reason: enumValue(record.reason, ["minimum-aggregate", "not-available"], `AI v2 inference omission ${index + 1} reason`),
    };
  });
  unique(omissions.map((entry) => entry.id), "AI v2 inference omission IDs");
  return omissions;
}

function expectedPlannedMembersV2(scope: OpenEnaAiInferenceScopeV2) {
  const expected = new Map<string, {
    familyRole: OpenEnaAiFamilyRoleV2;
    test: OpenEnaAiInferenceOmissionV2["test"];
    axisRole: OpenEnaAiAxisRoleV2;
    earlier: number | null;
    later: number | null;
  }>();
  const axes: OpenEnaAiAxisRoleV2[] = ["axis-1", "axis-2"];
  if (scope.kind === "endpoint-independent" || scope.kind === "trajectory-independent-period") {
    for (const role of axes) {
      expected.set(`comparison-${role}`, {
        familyRole: "comparison-family",
        test: "mann-whitney-u",
        axisRole: role,
        earlier: null,
        later: null,
      });
    }
    return expected;
  }
  if (scope.kind === "trajectory-paired-periods") {
    for (const role of axes) {
      expected.set(`comparison-${role}-period-${scope.earlierPeriodIndex + 1}-period-${scope.laterPeriodIndex + 1}`, {
        familyRole: "comparison-family",
        test: "wilcoxon-signed-rank",
        axisRole: role,
        earlier: scope.earlierPeriodIndex,
        later: scope.laterPeriodIndex,
      });
    }
    return expected;
  }
  for (const role of axes) {
    expected.set(`omnibus-${role}`, {
      familyRole: "omnibus-family",
      test: "friedman",
      axisRole: role,
      earlier: null,
      later: null,
    });
  }
  for (let earlierIndex = 0; earlierIndex < scope.selectedPeriodIndices.length; earlierIndex += 1) {
    for (let laterIndex = earlierIndex + 1; laterIndex < scope.selectedPeriodIndices.length; laterIndex += 1) {
      const earlier = scope.selectedPeriodIndices[earlierIndex];
      const later = scope.selectedPeriodIndices[laterIndex];
      for (const role of axes) {
        expected.set(`posthoc-${role}-period-${earlier + 1}-period-${later + 1}`, {
          familyRole: "posthoc-family",
          test: "wilcoxon-signed-rank",
          axisRole: role,
          earlier,
          later,
        });
      }
    }
  }
  return expected;
}

function validatePlannedMembersV2(
  scope: OpenEnaAiInferenceScopeV2,
  members: readonly OpenEnaAiInferenceMemberV2[],
  omissions: readonly OpenEnaAiInferenceOmissionV2[],
) {
  const expected = expectedPlannedMembersV2(scope);
  const supplied = [...members, ...omissions];
  if (supplied.length !== expected.size || new Set(supplied.map((entry) => entry.id)).size !== supplied.length) {
    throw new Error("AI v2 inference must represent every planned member exactly once.");
  }
  for (const entry of supplied) {
    const planned = expected.get(entry.id);
    if (!planned || entry.familyRole !== planned.familyRole || entry.test !== planned.test
      || entry.axisRole !== planned.axisRole) {
      throw new Error("AI v2 inference member role is inconsistent with the planned family.");
    }
    if (entry.test === "wilcoxon-signed-rank") {
      if (entry.earlierPeriodIndex !== planned.earlier || entry.laterPeriodIndex !== planned.later) {
        throw new Error("AI v2 Wilcoxon period roles are inconsistent with the planned contrast.");
      }
    } else if ("earlierPeriodIndex" in entry
      && (entry.earlierPeriodIndex !== null || entry.laterPeriodIndex !== null)) {
      throw new Error("AI v2 non-Wilcoxon member cannot carry period-pair roles.");
    }
  }
  if (scope.kind === "endpoint-independent" || scope.kind === "trajectory-independent-period") {
    if (members.some((member) => member.test !== "mann-whitney-u")) {
      throw new Error("AI v2 independent design can contain only Mann-Whitney U inference.");
    }
  } else if (scope.kind === "trajectory-paired-periods") {
    if (members.some((member) => member.test !== "wilcoxon-signed-rank"
      || member.familyRole !== "comparison-family"
      || member.groupRole !== scope.groupRole
      || member.nMatched < OPEN_ENA_AI_MIN_AGGREGATE_N
      || member.nNonzero < OPEN_ENA_AI_MIN_AGGREGATE_N
      || member.nRanked < OPEN_ENA_AI_MIN_AGGREGATE_N)) {
      throw new Error("AI v2 paired design can contain only matched Wilcoxon inference for its group role.");
    }
  } else {
    if (members.some((member) => (member.test === "friedman" || member.test === "wilcoxon-signed-rank")
      && member.groupRole !== scope.groupRole)) {
      throw new Error("AI v2 repeated-period members must share one complete cohort and group role.");
    }
  }
}

function validateInferenceSemanticsV2(
  scope: OpenEnaAiInferenceScopeV2,
  descriptive: OpenEnaAiDescriptiveEvidenceV2,
  members: readonly OpenEnaAiInferenceMemberV2[],
) {
  if (scope.kind === "endpoint-independent" || scope.kind === "trajectory-independent-period") {
    const mannWhitney = members.filter(
      (member): member is OpenEnaAiMannWhitneyMemberV2 => member.test === "mann-whitney-u",
    );
    const sampleCounts = new Set(mannWhitney.map((member) => `${member.nPrimary}:${member.nSecondary}`));
    if (sampleCounts.size > 1) {
      throw new Error("AI v2 independent Mann-Whitney sample counts must match across axes.");
    }
    const reference = mannWhitney[0];
    if (!reference) return;
    const primary = descriptive.groups.find((group) => group.role === "primary");
    const secondary = descriptive.groups.find((group) => group.role === "secondary");
    if (!primary || !secondary) {
      throw new Error("AI v2 Mann-Whitney descriptive sample roles are missing.");
    }
    if (scope.kind === "endpoint-independent") {
      if (primary.n !== reference.nPrimary || secondary.n !== reference.nSecondary) {
        throw new Error("AI v2 Mann-Whitney descriptive sample counts do not match inference.");
      }
      return;
    }
    if (!descriptive.trajectory) {
      throw new Error("AI v2 trajectory Mann-Whitney descriptive evidence is missing.");
    }
    const selectedPrimary = descriptive.trajectory.groupPeriods.find((period) => (
      period.groupRole === "primary" && period.periodIndex === scope.periodIndex
    ));
    const selectedSecondary = descriptive.trajectory.groupPeriods.find((period) => (
      period.groupRole === "secondary" && period.periodIndex === scope.periodIndex
    ));
    if (!selectedPrimary || !selectedSecondary) {
      throw new Error("AI v2 Mann-Whitney selected period descriptive roles are missing.");
    }
    if (descriptive.trajectory.cohortPolicy === "available"
      && (selectedPrimary.nUsed !== reference.nPrimary
        || selectedSecondary.nUsed !== reference.nSecondary)) {
      throw new Error("AI v2 Mann-Whitney selected-period sample counts do not match inference.");
    }
    return;
  }

  if (scope.kind === "trajectory-paired-periods") {
    const paired = members.filter(
      (member): member is OpenEnaAiWilcoxonMemberV2 => member.test === "wilcoxon-signed-rank",
    );
    const cohortCounts = new Set(paired.map((member) => `${member.nMatched}:${member.nMissing}`));
    if (cohortCounts.size > 1) {
      throw new Error("AI v2 paired matched and missing cohort counts must match across axes.");
    }
    return;
  }

  const omnibus = members.filter(
    (member): member is OpenEnaAiFriedmanMemberV2 => member.test === "friedman",
  );
  const followups = members.filter(
    (member): member is OpenEnaAiWilcoxonMemberV2 => (
      member.test === "wilcoxon-signed-rank" && member.familyRole === "posthoc-family"
    ),
  );
  const selectedScope = JSON.stringify(scope.selectedPeriodIndices);
  if (omnibus.some((member) => (
    JSON.stringify(member.selectedPeriodIndices) !== selectedScope
    || member.nPeriods !== scope.selectedPeriodIndices.length
  ))) {
    throw new Error("AI v2 Friedman selected periods do not match the repeated-period scope.");
  }
  const omnibusCohorts = new Set(omnibus.map((member) => (
    `${member.nComplete}:${member.nMissingCompleteBlocks}:${member.nPeriods}`
  )));
  if (omnibusCohorts.size > 1) {
    throw new Error("AI v2 Friedman complete cohort and missing counts must match across axes.");
  }
  if (followups.some((member) => (
    member.nMatched < OPEN_ENA_AI_MIN_AGGREGATE_N
    || member.nNonzero < OPEN_ENA_AI_MIN_AGGREGATE_N
    || member.nRanked < OPEN_ENA_AI_MIN_AGGREGATE_N
  ))) {
    throw new Error("AI v2 repeated-period post-hoc Wilcoxon member is below the disclosure minimum.");
  }
  const followupCohorts = new Set(followups.map((member) => `${member.nMatched}:${member.nMissing}`));
  if (followupCohorts.size > 1 || followups.some((member) => member.nMissing !== 0)) {
    throw new Error("AI v2 repeated-period follow-up missing counts do not match one complete cohort.");
  }
  const completeCount = omnibus[0]?.nComplete;
  if (completeCount !== undefined && followups.some((member) => member.nMatched !== completeCount)) {
    throw new Error("AI v2 repeated-period follow-up matched counts do not equal the omnibus complete cohort.");
  }
}

function validateHolmFamiliesV2(
  members: readonly OpenEnaAiInferenceMemberV2[],
  omissions: readonly OpenEnaAiInferenceOmissionV2[],
) {
  for (const familyRole of [
    "comparison-family",
    "omnibus-family",
    "posthoc-family",
  ] as const) {
    const familyMembers = members.filter((member) => member.familyRole === familyRole);
    const familyOmissions = omissions.filter((entry) => entry.familyRole === familyRole);
    if (familyMembers.length + familyOmissions.length === 0) continue;

    if (familyOmissions.some((entry) => entry.reason === "minimum-aggregate")) {
      const visible = [...familyMembers].sort((left, right) => left.pRaw - right.pRaw
        || left.id.localeCompare(right.id));
      for (let index = 1; index < visible.length; index += 1) {
        if (visible[index].pHolm < visible[index - 1].pHolm) {
          throw new Error("AI v2 privacy-redacted Holm family order is inconsistent.");
        }
      }
      continue;
    }

    const planned = [
      ...familyMembers.map((member) => ({
        id: member.id,
        effectiveP: member.pRaw,
        member,
      })),
      ...familyOmissions.map((entry) => ({
        id: entry.id,
        effectiveP: 1,
        member: null,
      })),
    ].sort((left, right) => left.effectiveP - right.effectiveP
      || left.id.localeCompare(right.id));
    let runningMaximum = 0;
    for (let index = 0; index < planned.length; index += 1) {
      const entry = planned[index];
      runningMaximum = Math.min(
        1,
        Math.max(runningMaximum, (planned.length - index) * entry.effectiveP),
      );
      if (entry.member && entry.member.pHolm !== runningMaximum) {
        throw new Error("AI v2 Holm family vector audit is inconsistent.");
      }
    }
  }
}

function parseBoundariesV2(
  value: unknown,
  omissions: readonly OpenEnaAiInferenceOmissionV2[],
): OpenEnaAiBoundaryCodeV2[] {
  const boundaries = unique(boundedArray(value, "AI v2 boundaries", V2_BOUNDARY_ORDER.length).map(
    (boundary, index) => enumValue(boundary, V2_BOUNDARY_ORDER, `AI v2 boundary ${index + 1}`),
  ), "AI v2 boundaries") as OpenEnaAiBoundaryCodeV2[];
  if (V2_BASE_BOUNDARIES.some((required) => !boundaries.includes(required))) {
    throw new Error("AI v2 boundaries omit a required research boundary.");
  }
  const hasMinimumOmission = omissions.some((entry) => entry.reason === "minimum-aggregate");
  if (boundaries.includes("minimum-aggregate-disclosure") !== hasMinimumOmission) {
    throw new Error("AI v2 minimum-aggregate boundary is inconsistent with inference omissions.");
  }
  if (boundaries.includes("holm-audit-not-reconstructible-after-privacy-redaction") !== hasMinimumOmission) {
    throw new Error("AI v2 privacy-redacted Holm audit boundary is inconsistent with inference omissions.");
  }
  return boundaries;
}

function parseEvidenceV2(value: unknown): OpenEnaAiEvidenceV2 {
  const record = exactRecord(value, [
    "kind", "modelType", "scope", "descriptive", "inference", "inferenceOmissions", "boundaries",
  ], "AI v2 evidence");
  const kind = enumValue(record.kind, [
    "endpoint-independent",
    "trajectory-independent-period",
    "trajectory-paired-periods",
    "trajectory-repeated-periods",
  ], "AI v2 evidence kind");
  const modelType = enumValue(
    record.modelType,
    ["EndPoint", "SeparateTrajectory", "AccumulatedTrajectory"],
    "AI v2 model type",
  );
  if ((kind === "endpoint-independent") !== (modelType === "EndPoint")) {
    throw new Error("AI v2 model type is inconsistent with the inference design.");
  }
  const scope = parseScopeV2(record.scope, kind);
  const descriptiveRecord = exactRecord(
    record.descriptive,
    ["axes", "groups", "edges", "trajectory"],
    "AI v2 descriptive evidence",
  );
  const descriptive: OpenEnaAiDescriptiveEvidenceV2 = {
    axes: parseDescriptiveAxesV2(descriptiveRecord.axes),
    groups: parseDescriptiveGroupsV2(descriptiveRecord.groups),
    edges: parseDescriptiveEdgesV2(descriptiveRecord.edges),
    trajectory: parseTrajectoryV2(descriptiveRecord.trajectory),
  };
  if ((kind === "endpoint-independent") !== (descriptive.trajectory === null)) {
    throw new Error("AI v2 descriptive trajectory is inconsistent with the inference design.");
  }
  if (descriptive.trajectory && descriptive.trajectory.periodCount !== ("periodCount" in scope ? scope.periodCount : 0)) {
    throw new Error("AI v2 descriptive and inference period counts do not match.");
  }
  if (kind === "endpoint-independent" && descriptive.edges.some((edge) => !("signedDifference" in edge))) {
    throw new Error("AI v2 endpoint descriptive edges must be primary-minus-secondary differences.");
  }
  if (kind !== "endpoint-independent" && descriptive.edges.some((edge) => "signedDifference" in edge)) {
    throw new Error("AI v2 trajectory descriptive edges must be group-role mean weights.");
  }
  if (descriptive.trajectory) {
    const groupCountByRole = new Map(descriptive.groups.map((group) => [group.role, group.n]));
    for (const period of descriptive.trajectory.groupPeriods) {
      const groupCount = groupCountByRole.get(period.groupRole);
      if (groupCount === undefined || period.nUsed + period.nExcluded !== groupCount) {
        throw new Error("AI v2 trajectory period counts do not match their descriptive group role.");
      }
    }
    if (descriptive.edges.some((edge) => edge.groupRole === undefined
      || !groupCountByRole.has(edge.groupRole))) {
      throw new Error("AI v2 trajectory edge role is absent from descriptive groups.");
    }
  }
  const inference = parseInferenceMembersV2(record.inference);
  const inferenceOmissions = parseInferenceOmissionsV2(record.inferenceOmissions);
  validatePlannedMembersV2(scope, inference, inferenceOmissions);
  validateInferenceSemanticsV2(scope, descriptive, inference);
  validateHolmFamiliesV2(inference, inferenceOmissions);
  const boundaries = parseBoundariesV2(record.boundaries, inferenceOmissions);
  if ((kind === "endpoint-independent" || kind === "trajectory-independent-period")
    && !boundaries.includes("independent-entity-assumption")) {
    throw new Error("AI v2 independent inference must disclose its entity-independence assumption.");
  }
  if ((kind === "trajectory-paired-periods" || kind === "trajectory-repeated-periods")
    && (!boundaries.includes("signed-rank-symmetry-assumption")
      || !boundaries.includes("wilcox-zero-removal"))) {
    throw new Error("AI v2 signed-rank inference must disclose symmetry and Wilcox zero handling.");
  }
  if (kind === "trajectory-repeated-periods" && !boundaries.includes("all-period-complete-cohort")) {
    throw new Error("AI v2 repeated inference must disclose its common complete cohort.");
  }
  return { kind, modelType, scope, descriptive, inference, inferenceOmissions, boundaries };
}

function parseBindingV2(value: unknown): OpenEnaAiBindingV2 {
  const record = exactRecord(
    value,
    ["analyzedAt", "datasetHash", "datasetHashKind", "modelType", "axes", "evidenceKey"],
    "AI v2 binding",
  );
  const analyzedAt = boundedText(record.analyzedAt, "AI v2 analyzed timestamp", 64);
  const parsedDate = Date.parse(analyzedAt);
  if (!Number.isFinite(parsedDate) || new Date(parsedDate).toISOString() !== analyzedAt) {
    throw new Error("AI v2 analyzed timestamp must be canonical ISO time.");
  }
  const datasetHash = strictV2Label(record.datasetHash, "AI v2 dataset hash").toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(datasetHash)) throw new Error("AI v2 dataset hash is invalid.");
  const axesValue = boundedArray(record.axes, "AI v2 binding axes", 2).map(
    (axis, index) => strictV2Label(axis, `AI v2 binding axis ${index + 1}`),
  );
  if (axesValue.length !== 2 || axesValue[0] === axesValue[1]) {
    throw new Error("AI v2 binding must contain two distinct axes.");
  }
  const evidenceKey = strictV2Id(record.evidenceKey, "AI v2 evidence key");
  if (!/^fnv1a32-[0-9a-f]{8}$/u.test(evidenceKey)) throw new Error("AI v2 evidence key is invalid.");
  return {
    analyzedAt,
    datasetHash,
    datasetHashKind: enumValue(record.datasetHashKind, [
      "normalized-utf8-text-sha256",
      "normalized-utf8-csv-text-sha256",
      "canonical-first-xlsx-worksheet-v1-sha256",
    ], "AI v2 dataset hash kind"),
    modelType: enumValue(record.modelType, ["EndPoint", "SeparateTrajectory", "AccumulatedTrajectory"], "AI v2 binding model type"),
    axes: axesValue as [string, string],
    evidenceKey,
  };
}

export function collectOpenEnaAiEvidenceIdsV2(evidence: OpenEnaAiEvidenceV2) {
  const identifiers = [
    ...evidence.descriptive.axes.map((axis) => axis.id),
    ...evidence.descriptive.groups.map((group) => group.id),
    ...evidence.descriptive.edges.map((edge) => edge.id),
    ...(evidence.descriptive.trajectory?.groupPeriods.map((period) => period.id) ?? []),
    ...evidence.inference.map((member) => member.id),
    ...evidence.inferenceOmissions.map((omissionEntry) => omissionEntry.id),
  ];
  if (new Set(identifiers).size !== identifiers.length) {
    throw new Error("AI v2 evidence IDs must be unique across every evidence category.");
  }
  return new Set(identifiers);
}

export function collectOpenEnaAiEvidenceIds(
  evidence: OpenEnaAiEvidence | OpenEnaAiEvidenceV2,
) {
  return "descriptive" in evidence
    ? collectOpenEnaAiEvidenceIdsV2(evidence)
    : collectOpenEnaAiEvidenceIdsV1(evidence);
}

function requestByteLength(value: unknown) {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error("AI interpretation request must be serializable JSON.");
  }
  if (!serialized) throw new Error("AI interpretation request must be serializable JSON.");
  return new TextEncoder().encode(serialized).byteLength;
}

export function parseOpenEnaAiInterpretationRequestV2(value: unknown): OpenEnaAiInterpretationRequestV2 {
  if (requestByteLength(value) > OPEN_ENA_AI_MAX_REQUEST_BYTES) {
    throw new Error("AI interpretation request exceeds the allowed size.");
  }
  const record = exactRecord(value, ["schemaVersion", "promptVersion", "locale", "binding", "evidence"], "AI v2 request");
  if (record.schemaVersion !== OPEN_ENA_AI_REQUEST_SCHEMA_VERSION_V2) throw new Error("AI v2 request schema version is invalid.");
  if (record.promptVersion !== OPEN_ENA_AI_PROMPT_VERSION_V2) throw new Error("AI v2 prompt version is invalid.");
  const evidence = parseEvidenceV2(record.evidence);
  collectOpenEnaAiEvidenceIdsV2(evidence);
  const binding = parseBindingV2(record.binding);
  if (binding.modelType !== evidence.modelType) throw new Error("AI v2 binding model type does not match evidence.");
  if (binding.evidenceKey !== stableEvidenceKey(evidence)) {
    throw new Error("AI v2 evidence key does not match the reviewed aggregate evidence.");
  }
  return {
    schemaVersion: OPEN_ENA_AI_REQUEST_SCHEMA_VERSION_V2,
    promptVersion: OPEN_ENA_AI_PROMPT_VERSION_V2,
    locale: enumValue(record.locale, ["en", "zh-hant", "zh-hans"], "AI v2 locale"),
    binding,
    evidence,
  };
}

export function parseOpenEnaAiInterpretationRequest(value: unknown): OpenEnaAiInterpretationRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("AI interpretation request must be an object.");
  }
  const version = (value as UnknownRecord).schemaVersion;
  if (version === OPEN_ENA_AI_REQUEST_SCHEMA_VERSION_V1) return parseOpenEnaAiInterpretationRequestV1(value);
  if (version === OPEN_ENA_AI_REQUEST_SCHEMA_VERSION_V2) return parseOpenEnaAiInterpretationRequestV2(value);
  throw new Error("AI request schema version is invalid.");
}

function parseInterpretationV2(
  value: unknown,
  validEvidenceIds: ReadonlySet<string> | null,
) {
  const interpretation = exactRecord(value, [
    "observedPatterns",
    "contextualQuestions",
    "limitations",
  ], "AI v2 interpretation");
  const observedPatterns = boundedArray(interpretation.observedPatterns, "AI v2 observed patterns", 8).map(
    (pattern, index): OpenEnaAiObservation => {
      const item = exactRecord(pattern, ["statement", "evidenceRefs"], `AI v2 observed pattern ${index + 1}`);
      const evidenceRefs = unique(boundedArray(
        item.evidenceRefs,
        `AI v2 observed pattern ${index + 1} evidence refs`,
        8,
      ).map((reference, refIndex) => strictV2Id(
        reference,
        `AI v2 observed pattern ${index + 1} evidence ref ${refIndex + 1}`,
      )), `AI v2 observed pattern ${index + 1} evidence refs`);
      if (evidenceRefs.length === 0) throw new Error("Every AI v2 observed pattern must cite aggregate evidence.");
      if (validEvidenceIds && evidenceRefs.some((reference) => !validEvidenceIds.has(reference))) {
        throw new Error("AI v2 response cites evidence that was not supplied.");
      }
      return {
        statement: boundedText(item.statement, `AI v2 observed pattern ${index + 1} statement`, 1_200),
        evidenceRefs,
      };
    },
  );
  const contextualQuestions = boundedArray(
    interpretation.contextualQuestions,
    "AI v2 contextual questions",
    6,
  ).map((item, index) => boundedText(item, `AI v2 contextual question ${index + 1}`, 600));
  const limitations = boundedArray(interpretation.limitations, "AI v2 limitations", 8).map(
    (item, index) => boundedText(item, `AI v2 limitation ${index + 1}`, 600),
  );
  if (limitations.length === 0) throw new Error("AI v2 interpretation must state at least one limitation.");
  return { observedPatterns, contextualQuestions, limitations };
}

export function parseOpenEnaAiInterpretationResponseV2(
  value: unknown,
  expectedRequest?: OpenEnaAiInterpretationRequestV2,
): OpenEnaAiInterpretationResponseV2 {
  const record = exactRecord(value, [
    "schemaVersion",
    "promptVersion",
    "binding",
    "provider",
    "model",
    "generatedAt",
    "interpretation",
  ], "AI v2 response");
  if (record.schemaVersion !== OPEN_ENA_AI_RESPONSE_SCHEMA_VERSION_V2) throw new Error("AI v2 response schema version is invalid.");
  if (record.promptVersion !== OPEN_ENA_AI_PROMPT_VERSION_V2) throw new Error("AI v2 response prompt version is invalid.");
  if (record.provider !== "openrouter") throw new Error("AI v2 response provider is invalid.");
  const binding = parseBindingV2(record.binding);
  if (expectedRequest && JSON.stringify(binding) !== JSON.stringify(expectedRequest.binding)) {
    throw new Error("AI v2 response binding does not match the current reviewed evidence.");
  }
  const validEvidenceIds = expectedRequest
    ? collectOpenEnaAiEvidenceIdsV2(expectedRequest.evidence)
    : null;
  return {
    schemaVersion: OPEN_ENA_AI_RESPONSE_SCHEMA_VERSION_V2,
    promptVersion: OPEN_ENA_AI_PROMPT_VERSION_V2,
    binding,
    provider: "openrouter",
    model: strictV2Label(record.model, "AI v2 response model"),
    generatedAt: boundedText(record.generatedAt, "AI v2 response timestamp", 64),
    interpretation: parseInterpretationV2(record.interpretation, validEvidenceIds),
  };
}

export function parseOpenEnaAiInterpretationResponse(
  value: unknown,
  expectedRequest?: OpenEnaAiInterpretationRequest,
): OpenEnaAiInterpretationResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("AI interpretation response must be an object.");
  }
  const version = (value as UnknownRecord).schemaVersion;
  if (version === OPEN_ENA_AI_RESPONSE_SCHEMA_VERSION_V1) {
    if (expectedRequest && expectedRequest.schemaVersion !== OPEN_ENA_AI_REQUEST_SCHEMA_VERSION_V1) {
      throw new Error("AI response schema does not match the current request.");
    }
    return parseOpenEnaAiInterpretationResponseV1(
      value,
      expectedRequest as OpenEnaAiInterpretationRequestV1 | undefined,
    );
  }
  if (version === OPEN_ENA_AI_RESPONSE_SCHEMA_VERSION_V2) {
    if (expectedRequest && expectedRequest.schemaVersion !== OPEN_ENA_AI_REQUEST_SCHEMA_VERSION_V2) {
      throw new Error("AI response schema does not match the current request.");
    }
    return parseOpenEnaAiInterpretationResponseV2(
      value,
      expectedRequest as OpenEnaAiInterpretationRequestV2 | undefined,
    );
  }
  throw new Error("AI response schema version is invalid.");
}
