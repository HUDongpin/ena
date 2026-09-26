import type { OpenEnaResultTableKey } from "./export";
import type { BoundResultV3 } from "./model-v3/types";

/** Result families researchers compare on Stats & Export. */
export const OPEN_ENA_EXPORT_FAMILIES = ["endpoint", "separate", "accumulated", "ona"] as const;
export type OpenEnaExportFamily = (typeof OPEN_ENA_EXPORT_FAMILIES)[number];

/**
 * Researcher-facing family names shared with teaching-sample disclosures.
 * Stats & Export hints use these same words.
 */
export const OPEN_ENA_EXPORT_FAMILY_NAMES = {
  endpoint: "Endpoint",
  separate: "Separate trajectory",
  accumulated: "Accumulated trajectory",
  ona: "ONA",
} as const satisfies Record<OpenEnaExportFamily, string>;

/** Table, CSV, and related export actions whose applicability depends on the result family. */
export const OPEN_ENA_STATS_EXPORT_ACTIONS = [
  "coordinates-csv",
  "line-weights-csv",
  "connection-counts-csv",
  "trajectory-steps-csv",
  "centroids-csv",
  "node-positions-csv",
  "adjacency-key-csv",
  "ona-aggregate-edges",
  "ona-deidentified-audit",
  "native-statistics",
  "bound-data-view",
  "methods",
  "trajectory-bundle",
  "current-analysis",
  "reference",
  "contrast-json",
  "contrast-edges",
] as const;
export type OpenEnaStatsExportAction = (typeof OPEN_ENA_STATS_EXPORT_ACTIONS)[number];

export const OPEN_ENA_EXPORT_FAMILY_STATUSES = [
  "applies",
  "not-applicable-family",
  "would-be-empty",
  "bound-reference",
] as const;
export type OpenEnaExportFamilyStatus = (typeof OPEN_ENA_EXPORT_FAMILY_STATUSES)[number];

export const OPEN_ENA_EXPORT_BLOCK_REASONS = [
  "not-applicable-family",
  "would-be-empty",
  "requires-rebuild",
  "projection-reference",
  "awaiting-inference",
] as const;
export type OpenEnaExportBlockReason = (typeof OPEN_ENA_EXPORT_BLOCK_REASONS)[number];

export const OPEN_ENA_EXPORT_HINTS = [
  "all-families",
  "trajectory",
  "ona",
  "endpoint-and-trajectory",
  "endpoint",
  "bound-reference",
] as const;
export type OpenEnaExportHint = (typeof OPEN_ENA_EXPORT_HINTS)[number];

export interface OpenEnaExportApplicabilityCopy {
  readonly reasons: Readonly<Record<OpenEnaExportBlockReason, string>>;
  readonly hints: Readonly<Record<OpenEnaExportHint, string>>;
}

export interface OpenEnaExportDisclosure {
  readonly action: OpenEnaStatsExportAction;
  /** Static family matrix, after bound-reference resolution. */
  readonly familyApplies: boolean;
  readonly disabled: boolean;
  readonly reason: OpenEnaExportBlockReason | null;
  readonly hint: OpenEnaExportHint | null;
}

export interface OpenEnaExportDisclosureContext {
  readonly family: OpenEnaExportFamily;
  readonly current: boolean;
  readonly projectionReference?: boolean;
  readonly referenceBound?: boolean;
  /** Known row count for table exports. Null or omitted skips the empty-file overlay. */
  readonly rowCount?: number | null;
  /** False only when the caller knows native inference is not ready. */
  readonly inferenceReady?: boolean;
}

const ALL_APPLY = {
  endpoint: "applies",
  separate: "applies",
  accumulated: "applies",
  ona: "applies",
} as const satisfies Record<OpenEnaExportFamily, OpenEnaExportFamilyStatus>;

const ONA_ONLY = {
  endpoint: "not-applicable-family",
  separate: "not-applicable-family",
  accumulated: "not-applicable-family",
  ona: "applies",
} as const satisfies Record<OpenEnaExportFamily, OpenEnaExportFamilyStatus>;

const TRAJECTORY_ONLY = {
  endpoint: "not-applicable-family",
  separate: "applies",
  accumulated: "applies",
  ona: "not-applicable-family",
} as const satisfies Record<OpenEnaExportFamily, OpenEnaExportFamilyStatus>;

const ENDPOINT_ONLY = {
  endpoint: "applies",
  separate: "not-applicable-family",
  accumulated: "not-applicable-family",
  ona: "not-applicable-family",
} as const satisfies Record<OpenEnaExportFamily, OpenEnaExportFamilyStatus>;

const ENDPOINT_AND_TRAJECTORY = {
  endpoint: "applies",
  separate: "applies",
  accumulated: "applies",
  ona: "not-applicable-family",
} as const satisfies Record<OpenEnaExportFamily, OpenEnaExportFamilyStatus>;

/**
 * Single family matrix for Stats & Export actions.
 * `would-be-empty` is the Endpoint trajectory-step case: the file has no rows.
 * `bound-reference` applies only when this result already carries a Reference.
 */
export const OPEN_ENA_EXPORT_FAMILY_MATRIX: Readonly<Record<OpenEnaStatsExportAction, Readonly<Record<OpenEnaExportFamily, OpenEnaExportFamilyStatus>>>> = {
  "coordinates-csv": ALL_APPLY,
  "line-weights-csv": ALL_APPLY,
  "connection-counts-csv": ALL_APPLY,
  "trajectory-steps-csv": {
    endpoint: "would-be-empty",
    separate: "applies",
    accumulated: "applies",
    ona: "not-applicable-family",
  },
  "centroids-csv": ALL_APPLY,
  "node-positions-csv": ALL_APPLY,
  "adjacency-key-csv": ALL_APPLY,
  "ona-aggregate-edges": ONA_ONLY,
  "ona-deidentified-audit": ONA_ONLY,
  "native-statistics": ENDPOINT_AND_TRAJECTORY,
  "bound-data-view": ALL_APPLY,
  "methods": ALL_APPLY,
  "trajectory-bundle": TRAJECTORY_ONLY,
  "current-analysis": ALL_APPLY,
  reference: {
    endpoint: "applies",
    separate: "bound-reference",
    accumulated: "bound-reference",
    ona: "not-applicable-family",
  },
  "contrast-json": ENDPOINT_ONLY,
  "contrast-edges": ENDPOINT_ONLY,
};

const REQUIRES_CURRENT_RESULT: Readonly<Record<OpenEnaStatsExportAction, boolean>> = {
  "coordinates-csv": true,
  "line-weights-csv": true,
  "connection-counts-csv": true,
  "trajectory-steps-csv": true,
  "centroids-csv": true,
  "node-positions-csv": true,
  "adjacency-key-csv": true,
  "ona-aggregate-edges": true,
  "ona-deidentified-audit": true,
  "native-statistics": true,
  "bound-data-view": true,
  methods: false,
  "trajectory-bundle": true,
  "current-analysis": true,
  reference: true,
  "contrast-json": true,
  "contrast-edges": true,
};

const RESULT_TABLE_EXPORT_ACTION = {
  coordinates: "coordinates-csv",
  lineWeights: "line-weights-csv",
  connectionCounts: "connection-counts-csv",
  trajectories: "trajectory-steps-csv",
  centroids: "centroids-csv",
  nodePositions: "node-positions-csv",
  adjacencyKey: "adjacency-key-csv",
} as const satisfies Record<OpenEnaResultTableKey, OpenEnaStatsExportAction>;

export function openEnaResultTableExportAction(key: OpenEnaResultTableKey): OpenEnaStatsExportAction {
  switch (key) {
    case "coordinates":
    case "lineWeights":
    case "connectionCounts":
    case "trajectories":
    case "centroids":
    case "nodePositions":
    case "adjacencyKey":
      return RESULT_TABLE_EXPORT_ACTION[key];
    default: {
      const exhaustive: never = key;
      throw new TypeError(`Unhandled result table ${String(exhaustive)}`);
    }
  }
}

export function openEnaExportFamily(input: {
  analysisFamily: "standard" | "ona";
  modelType: "EndPoint" | "SeparateTrajectory" | "AccumulatedTrajectory";
}): OpenEnaExportFamily {
  if (input.analysisFamily === "ona") return "ona";
  switch (input.modelType) {
    case "EndPoint":
      return "endpoint";
    case "SeparateTrajectory":
      return "separate";
    case "AccumulatedTrajectory":
      return "accumulated";
    default: {
      const exhaustive: never = input.modelType;
      throw new TypeError(`Unhandled model type ${String(exhaustive)}`);
    }
  }
}

export function openEnaExportFamilyFromResult(result: BoundResultV3 | null | undefined): OpenEnaExportFamily | null {
  if (!result) return null;
  if (result.configuration.analysisFamily === "ona") return "ona";
  return openEnaExportFamily({
    analysisFamily: "standard",
    modelType: result.configuration.analysis.model.type,
  });
}

function applicabilityHint(action: OpenEnaStatsExportAction, status: OpenEnaExportFamilyStatus): OpenEnaExportHint {
  switch (action) {
    case "trajectory-steps-csv":
    case "trajectory-bundle":
      return "trajectory";
    case "ona-aggregate-edges":
    case "ona-deidentified-audit":
      return "ona";
    case "native-statistics":
      return "endpoint-and-trajectory";
    case "reference":
      return status === "bound-reference" ? "bound-reference" : "endpoint";
    case "contrast-json":
    case "contrast-edges":
      return "endpoint";
    case "coordinates-csv":
    case "line-weights-csv":
    case "connection-counts-csv":
    case "centroids-csv":
    case "node-positions-csv":
    case "adjacency-key-csv":
    case "bound-data-view":
    case "methods":
    case "current-analysis":
      return "all-families";
    default: {
      const exhaustive: never = action;
      throw new TypeError(`Unhandled export action ${String(exhaustive)}`);
    }
  }
}

function isResultTableExport(action: OpenEnaStatsExportAction): boolean {
  switch (action) {
    case "coordinates-csv":
    case "line-weights-csv":
    case "connection-counts-csv":
    case "trajectory-steps-csv":
    case "centroids-csv":
    case "node-positions-csv":
    case "adjacency-key-csv":
      return true;
    case "ona-aggregate-edges":
    case "ona-deidentified-audit":
    case "native-statistics":
    case "bound-data-view":
    case "methods":
    case "trajectory-bundle":
    case "current-analysis":
    case "reference":
    case "contrast-json":
    case "contrast-edges":
      return false;
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

function blocked(
  action: OpenEnaStatsExportAction,
  familyApplies: boolean,
  reason: OpenEnaExportBlockReason,
): OpenEnaExportDisclosure {
  return { action, familyApplies, disabled: true, reason, hint: null };
}

export function openEnaExportDisclosure(
  action: OpenEnaStatsExportAction,
  context: OpenEnaExportDisclosureContext,
): OpenEnaExportDisclosure {
  const status = OPEN_ENA_EXPORT_FAMILY_MATRIX[action][context.family];
  if (status === "not-applicable-family" || status === "would-be-empty") {
    return blocked(action, false, status);
  }
  if (status === "bound-reference" && !context.referenceBound) {
    return blocked(action, false, "not-applicable-family");
  }
  if (action === "centroids-csv" && context.projectionReference) {
    return blocked(action, true, "projection-reference");
  }
  if (REQUIRES_CURRENT_RESULT[action] && !context.current) {
    return blocked(action, true, "requires-rebuild");
  }
  if (isResultTableExport(action) && context.rowCount === 0) {
    return blocked(action, true, "would-be-empty");
  }
  if (action === "native-statistics" && context.inferenceReady === false) {
    return blocked(action, true, "awaiting-inference");
  }
  return {
    action,
    familyApplies: true,
    disabled: false,
    reason: null,
    hint: applicabilityHint(action, status),
  };
}

export function openEnaExportApplicabilityText(
  disclosure: Pick<OpenEnaExportDisclosure, "reason" | "hint">,
  copy: OpenEnaExportApplicabilityCopy,
): string {
  if (disclosure.reason) return copy.reasons[disclosure.reason];
  if (disclosure.hint) return copy.hints[disclosure.hint];
  return "";
}
