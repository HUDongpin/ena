import type { Locale } from "../i18n";
import {
  PAIRWISE_MANN_WHITNEY_METHOD,
  type OpenEnaPairwiseContrast,
} from "./contrasts";
import {
  LONGITUDINAL_BOUNDARIES,
  type OpenEnaLongitudinalView,
} from "./longitudinal";
import type { OpenEnaConfig, OpenEnaResult } from "./types";

export const OPEN_ENA_AI_REQUEST_SCHEMA_VERSION = "open-ena-ai-interpretation-request-v1" as const;
export const OPEN_ENA_AI_RESPONSE_SCHEMA_VERSION = "open-ena-ai-interpretation-response-v1" as const;
export const OPEN_ENA_AI_PROMPT_VERSION = "open-ena-aggregate-interpretation-v1" as const;
export const OPEN_ENA_AI_MAX_EDGES = 12;
export const OPEN_ENA_AI_MAX_REQUEST_BYTES = 48 * 1024;
export const OPEN_ENA_AI_MIN_AGGREGATE_N = 3;
export const OPEN_ENA_AI_CONSENT_HEADER = "x-open-ena-ai-consent";
export const OPEN_ENA_AI_CONSENT_VALUE = "reviewed-aggregate-v1";

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
  schemaVersion: typeof OPEN_ENA_AI_REQUEST_SCHEMA_VERSION;
  promptVersion: typeof OPEN_ENA_AI_PROMPT_VERSION;
  locale: OpenEnaAiLocale;
  binding: OpenEnaAiBinding;
  evidence: OpenEnaAiEvidence;
}

export interface OpenEnaAiObservation {
  statement: string;
  evidenceRefs: string[];
}

export interface OpenEnaAiInterpretationResponseV1 {
  schemaVersion: typeof OPEN_ENA_AI_RESPONSE_SCHEMA_VERSION;
  promptVersion: typeof OPEN_ENA_AI_PROMPT_VERSION;
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
}

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

function stableEvidenceKey(evidence: OpenEnaAiEvidence) {
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
    const inference = contrast.inference.rows.map((row, index) => ({
      id: `inference-axis-${index + 1}`,
      axis: boundedLabel(row.dimension, `Inference axis ${index + 1}`),
      method: contrast.inference.method,
      uFirst: finiteOrNull(row.uFirst, `Inference ${index + 1} U`),
      pValueTwoSided: finiteOrNull(row.pValueTwoSided, `Inference ${index + 1} p`),
      rankBiserialFirstVsSecond: finiteOrNull(
        row.rankBiserialFirstVsSecond,
        `Inference ${index + 1} rank-biserial effect`,
      ),
    }));
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

export function buildOpenEnaAiInterpretationRequest(
  input: BuildOpenEnaAiInterpretationRequestInput,
): OpenEnaAiInterpretationRequestV1 {
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
    schemaVersion: OPEN_ENA_AI_REQUEST_SCHEMA_VERSION,
    promptVersion: OPEN_ENA_AI_PROMPT_VERSION,
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
        [PAIRWISE_MANN_WHITNEY_METHOD],
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

export function collectOpenEnaAiEvidenceIds(evidence: OpenEnaAiEvidence) {
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

export function parseOpenEnaAiInterpretationRequest(value: unknown): OpenEnaAiInterpretationRequestV1 {
  const serialized = JSON.stringify(value);
  if (!serialized || new TextEncoder().encode(serialized).byteLength > OPEN_ENA_AI_MAX_REQUEST_BYTES) {
    throw new Error("AI interpretation request exceeds the allowed size.");
  }
  const record = exactRecord(value, ["schemaVersion", "promptVersion", "locale", "binding", "evidence"], "AI request");
  if (record.schemaVersion !== OPEN_ENA_AI_REQUEST_SCHEMA_VERSION) throw new Error("AI request schema version is invalid.");
  if (record.promptVersion !== OPEN_ENA_AI_PROMPT_VERSION) throw new Error("AI prompt version is invalid.");
  const evidence = parseEvidence(record.evidence);
  collectOpenEnaAiEvidenceIds(evidence);
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
    schemaVersion: OPEN_ENA_AI_REQUEST_SCHEMA_VERSION,
    promptVersion: OPEN_ENA_AI_PROMPT_VERSION,
    locale: enumValue(record.locale, ["en", "zh-hant", "zh-hans"], "AI locale"),
    binding,
    evidence,
  };
}

export function parseOpenEnaAiInterpretationResponse(
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
  if (record.schemaVersion !== OPEN_ENA_AI_RESPONSE_SCHEMA_VERSION) throw new Error("AI response schema version is invalid.");
  if (record.promptVersion !== OPEN_ENA_AI_PROMPT_VERSION) throw new Error("AI response prompt version is invalid.");
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
  const validEvidenceIds = expectedRequest ? collectOpenEnaAiEvidenceIds(expectedRequest.evidence) : null;
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
    schemaVersion: OPEN_ENA_AI_RESPONSE_SCHEMA_VERSION,
    promptVersion: OPEN_ENA_AI_PROMPT_VERSION,
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
