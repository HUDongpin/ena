import {
  DENSE_SVD_MAX_MATRIX_BYTES,
  DENSE_SVD_MAX_WORK_UNITS,
  estimateDenseSvdBudget,
} from "jena-js/core";
import { deepFreezeV3, snapshotDenseJsonArrayV3, snapshotPlainJsonRecordV3 } from "./canonical-json";
import type {
  BackwardExtentV3,
  ForwardExtentV3,
  StandardWindowTypeV3,
} from "./types";

export const RESOURCE_BUDGET_VERSION_V3 = "open-ena-resource-v3.4" as const;
export const MAX_ESTIMATED_NUMERIC_CELLS_V3 = 25_000_000;
export const MAX_ESTIMATED_WINDOW_VISITS_V3 = 100_000_000;
export const MAX_ESTIMATED_PEAK_BYTES_V3 = 512 * 1024 * 1024;
export const MAX_ESTIMATED_EXPORT_BYTES_V3 = 256 * 1024 * 1024;
export const MAX_ESTIMATED_ROTATION_WORK_UNITS_V3 = DENSE_SVD_MAX_WORK_UNITS;
export const MAX_ESTIMATED_ROTATION_MATRIX_BYTES_ONA_V3 = DENSE_SVD_MAX_MATRIX_BYTES;

/**
 * Versioned allocation proxies calibrated from the 50k-row reviewer probe.
 * These are deliberately conservative admission weights for JavaScript
 * objects, Maps, arrays, and strings; they are not exact engine object sizes.
 */
export const STRUCTURAL_ROW_BYTES_V3 = 4_096;
export const STRUCTURAL_UNIT_BYTES_V3 = 1_024;
export const STRUCTURAL_HORIZON_BYTES_V3 = 2_048;
export const STRUCTURAL_TARGET_BYTES_V3 = 1_024;
export const STRUCTURAL_AGGREGATE_BYTES_V3 = 2_048;
export const STRUCTURAL_RETAINED_ROW_BYTES_V3 = 512;
export const STRUCTURAL_ROW_CODE_BYTES_V3 = 64;
export const STRUCTURAL_DATASET_MULTIPLIER_V3 = 2;

export const MAX_ESTIMATED_STATE_COUNT_V3 = 100_000;
export const MAX_ESTIMATED_STRUCTURAL_BYTES_V3 = 384 * 1024 * 1024;
export const MAX_ESTIMATED_DATASET_BYTES_V3 = 128 * 1024 * 1024;
export const MAX_ESTIMATED_IDENTITY_PAYLOAD_BYTES_V3 = 64 * 1024 * 1024;
export const CANONICAL_IDENTITY_FIELD_WRAPPER_BYTES_V3 = 64;

const CANONICAL_IDENTITY_FIXED_SCALAR_BYTES_V3 = 32;
const CANONICAL_IDENTITY_BYTES_PER_UTF16_UNIT_V3 = 6;
const CANONICAL_IDENTITY_STRING_QUOTES_BYTES_V3 = 2;

export type ResourceEstimateErrorCodeV3 = "INVALID_INPUT" | "UNSAFE_ARITHMETIC";

export class ResourceEstimateErrorV3 extends Error {
  readonly code: ResourceEstimateErrorCodeV3;

  constructor(code: ResourceEstimateErrorCodeV3, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "ResourceEstimateErrorV3";
    this.code = code;
  }
}

function addCanonicalIdentityPayloadBytesV3(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new ResourceEstimateErrorV3(
      "UNSAFE_ARITHMETIC",
      "Canonical identity field payload exceeds safe integer arithmetic.",
    );
  }
  return result;
}

function canonicalIdentityValuePayloadBytesV3(value: unknown): number {
  if (typeof value !== "string") return CANONICAL_IDENTITY_FIXED_SCALAR_BYTES_V3;
  const escapedBytes = value.length * CANONICAL_IDENTITY_BYTES_PER_UTF16_UNIT_V3;
  if (!Number.isSafeInteger(escapedBytes)) {
    throw new ResourceEstimateErrorV3(
      "UNSAFE_ARITHMETIC",
      "Canonical identity string exceeds safe integer arithmetic.",
    );
  }
  return addCanonicalIdentityPayloadBytesV3(
    escapedBytes,
    CANONICAL_IDENTITY_STRING_QUOTES_BYTES_V3,
  );
}

/**
 * Conservative UTF-8 upper bound for one selected source field during
 * identity admission, before scalar validation. Non-string source values use
 * a fixed scalar slot; invalid or missing values remain subject to the later
 * identity validator and are not represented as canonical identities here.
 */
export function estimateCanonicalIdentityAdmissionFieldPayloadBytesV3(
  column: string,
  value: unknown,
): number {
  if (typeof column !== "string") {
    throw new ResourceEstimateErrorV3("INVALID_INPUT", "Canonical identity column must be a string.");
  }
  return [
    CANONICAL_IDENTITY_FIELD_WRAPPER_BYTES_V3,
    canonicalIdentityValuePayloadBytesV3(column),
    canonicalIdentityValuePayloadBytesV3(value),
  ].reduce(addCanonicalIdentityPayloadBytesV3, 0);
}

export type ResourceBlockedReasonV3 =
  | "dataset-bytes"
  | "identity-bytes"
  | "state-count"
  | "structural-bytes"
  | "numeric-cells"
  | "window-visits"
  | "rotation-work"
  | "rotation-matrix"
  | "peak-bytes"
  | "export-bytes";

export interface StandardResourceInputV3 {
  readonly rowCount: number;
  readonly unitCount: number;
  readonly horizonCount: number;
  readonly codeCount: number;
  readonly horizonSizes: readonly number[];
  /**
   * Exact scientific window partitions. Conversation uses typed Unit by
   * Horizon partitions; Moving Stanza uses the global typed Horizons.
   */
  readonly windowPartitionSizes: readonly number[];
  readonly trajectorySteps: number;
  readonly windowType: StandardWindowTypeV3;
  readonly backward: BackwardExtentV3;
  readonly forward: ForwardExtentV3;
  readonly referenceProjection: boolean;
  readonly datasetSizeBytes: number;
  readonly identityPayloadBytes: number;
}

export interface OnaResourceInputV3 {
  readonly rowCount: number;
  readonly unitCount: number;
  readonly horizonCount: number;
  readonly codeCount: number;
  readonly horizonSizes: readonly number[];
  readonly backward: BackwardExtentV3;
  readonly datasetSizeBytes: number;
  readonly identityPayloadBytes: number;
}

export interface EarlyStandardResourceInputV3 {
  readonly rowCount: number;
  readonly codeCount: number;
  readonly datasetSizeBytes: number;
  readonly identityPayloadBytes: number;
}

interface ResourceEstimateBaseV3 {
  readonly version: typeof RESOURCE_BUDGET_VERSION_V3;
  readonly analysisFamily: "standard" | "ona";
  readonly rows: number;
  readonly units: number;
  readonly horizons: number;
  readonly windowPartitions: number;
  readonly codes: number;
  readonly adjacencyDimensions: number;
  readonly datasetSizeBytes: number;
  readonly identityPayloadBytes: number;
  readonly aggregateStateUpperBound: number;
  readonly estimatedStateCount: number;
  readonly estimatedStructuralBytes: number;
  readonly estimatedForwardBufferRows: number;
  /** Exact raw moving-window rows retained across all observed Horizons. */
  readonly estimatedRetainedWindowRows: number;
  /** Conservative cell equivalents held by per-Horizon streaming state. */
  readonly estimatedWindowStateCells: number;
  readonly estimatedWindowVisits: number;
  readonly estimatedNumericCells: number;
  readonly estimatedWorkerMaterializationBytes: number;
  readonly estimatedExportBytes: number;
  readonly estimatedPeakBytes: number;
  readonly blocked: boolean;
  readonly blockedReasons: readonly ResourceBlockedReasonV3[];
  readonly estimatedRotationWorkUnits: number;
  readonly estimatedRotationMatrixBytes: number;
}

export interface StandardResourceEstimateV3 extends ResourceEstimateBaseV3 {
  readonly analysisFamily: "standard";
  readonly trajectorySteps: number;
}

export interface OnaResourceEstimateV3 extends ResourceEstimateBaseV3 {
  readonly analysisFamily: "ona";
  readonly endpointNetworks: number;
  readonly directionalMaskCells: number;
}

export interface EarlyStandardResourceEstimateV3 extends ResourceEstimateBaseV3 {
  readonly analysisFamily: "standard";
  readonly admissionStage: "early-envelope";
  readonly trajectorySteps: number;
}

export type ResourceEstimateV3 =
  | StandardResourceEstimateV3
  | OnaResourceEstimateV3
  | EarlyStandardResourceEstimateV3;

function assertExactKeysV3(record: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} has an invalid shape.`);
  }
}

function nonnegativeSafeIntegerV3(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a nonnegative safe integer.`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function extentV3(value: unknown, label: string, backward: boolean): BackwardExtentV3 | ForwardExtentV3 {
  const record = snapshotPlainJsonRecordV3(value, label);
  if (record.kind === "infinity") {
    assertExactKeysV3(record, ["kind"], label);
    return { kind: "infinity" };
  }
  if (record.kind !== "finite") throw new TypeError(`${label}.kind is invalid.`);
  assertExactKeysV3(record, ["kind", "value"], label);
  const minimum = backward ? 1 : 0;
  const finite = nonnegativeSafeIntegerV3(record.value, `${label}.value`);
  if (finite < minimum) throw new TypeError(`${label}.value must be at least ${minimum}.`);
  return { kind: "finite", value: finite };
}

function safeAddV3(left: number, right: number, label: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw new RangeError(`${label} exceeds safe integer arithmetic.`);
  return result;
}

function safeMultiplyV3(left: number, right: number, label: string): number {
  const result = left * right;
  if (!Number.isSafeInteger(result)) throw new RangeError(`${label} exceeds safe integer arithmetic.`);
  return result;
}

interface StructuralEstimateInputV3 {
  rowCount: number;
  unitCount: number;
  horizonCount: number;
  targetCount: number;
  aggregateStateUpperBound: number;
  retainedRowCount: number;
  codeCount: number;
  datasetSizeBytes: number;
  identityPayloadBytes: number;
}

function structuralEstimateV3(input: StructuralEstimateInputV3): {
  estimatedStateCount: number;
  estimatedStructuralBytes: number;
} {
  const estimatedStateCount = [
    input.rowCount,
    input.unitCount,
    input.horizonCount,
    input.targetCount,
    input.aggregateStateUpperBound,
    input.retainedRowCount,
  ].reduce((total, value) => safeAddV3(total, value, "Structural state count"), 0);
  const rowCodeCells = safeMultiplyV3(input.rowCount, input.codeCount, "Structural row-by-Code cells");
  const components = [
    safeMultiplyV3(input.rowCount, STRUCTURAL_ROW_BYTES_V3, "Structural row bytes"),
    safeMultiplyV3(input.unitCount, STRUCTURAL_UNIT_BYTES_V3, "Structural Unit bytes"),
    safeMultiplyV3(input.horizonCount, STRUCTURAL_HORIZON_BYTES_V3, "Structural Horizon bytes"),
    safeMultiplyV3(input.targetCount, STRUCTURAL_TARGET_BYTES_V3, "Structural target bytes"),
    safeMultiplyV3(
      input.aggregateStateUpperBound,
      STRUCTURAL_AGGREGATE_BYTES_V3,
      "Structural aggregate bytes",
    ),
    safeMultiplyV3(input.retainedRowCount, STRUCTURAL_RETAINED_ROW_BYTES_V3, "Structural retained-row bytes"),
    safeMultiplyV3(rowCodeCells, STRUCTURAL_ROW_CODE_BYTES_V3, "Structural row-by-Code bytes"),
    safeMultiplyV3(input.datasetSizeBytes, STRUCTURAL_DATASET_MULTIPLIER_V3, "Structural dataset bytes"),
    input.identityPayloadBytes,
  ];
  const estimatedStructuralBytes = components.reduce(
    (total, value) => safeAddV3(total, value, "Structural bytes"),
    0,
  );
  return { estimatedStateCount, estimatedStructuralBytes };
}

function snapshotHorizonSizesV3(value: unknown, horizonCount: number, rowCount: number): number[] {
  const input = snapshotDenseJsonArrayV3(value, "resource input.horizonSizes");
  if (input.length !== horizonCount) {
    throw new TypeError("resource input.horizonSizes length must equal horizonCount.");
  }
  let total = 0;
  const sizes = input.map((entry, index) => {
    const size = nonnegativeSafeIntegerV3(entry, `resource input.horizonSizes[${index}]`);
    if (size === 0) throw new TypeError("Observed Horizon sizes must be positive.");
    total = safeAddV3(total, size, "Horizon row total");
    return size;
  });
  if (total !== rowCount) throw new TypeError("Horizon sizes must sum exactly to rowCount.");
  return sizes;
}

function snapshotWindowPartitionSizesV3(value: unknown, rowCount: number): number[] {
  const input = snapshotDenseJsonArrayV3(value, "resource input.windowPartitionSizes");
  let total = 0;
  const sizes = input.map((entry, index) => {
    const size = nonnegativeSafeIntegerV3(entry, `resource input.windowPartitionSizes[${index}]`);
    if (size === 0) throw new TypeError("Scientific window partition sizes must be positive.");
    total = safeAddV3(total, size, "Scientific window partition row total");
    return size;
  });
  if (total !== rowCount) {
    throw new TypeError("Scientific window partition sizes must sum exactly to rowCount.");
  }
  return sizes;
}

function coveredExtentV3(
  value: BackwardExtentV3 | ForwardExtentV3,
  horizonSize: number,
  includesCurrent: boolean,
): number {
  if (value.kind === "infinity") return includesCurrent ? horizonSize : Math.max(0, horizonSize - 1);
  return includesCurrent
    ? Math.min(horizonSize, value.value)
    : Math.min(Math.max(0, horizonSize - 1), value.value);
}

function blockedReasonsV3(values: {
  datasetSizeBytes: number;
  identityPayloadBytes: number;
  estimatedStateCount: number;
  estimatedStructuralBytes: number;
  estimatedNumericCells: number;
  estimatedWindowVisits: number;
  estimatedRotationWorkUnits?: number;
  estimatedRotationMatrixBytesOna?: number;
  estimatedPeakBytes: number;
  estimatedExportBytes: number;
}, options: { applyExactStructuralLimits?: boolean } = {}): ResourceBlockedReasonV3[] {
  const applyExactStructuralLimits = options.applyExactStructuralLimits ?? true;
  // Stable admission/construction order: source and identity payloads,
  // structural state, numerical/window work, dense rotation work/storage,
  // then aggregate peak and export payload limits.
  return [
    ...(values.datasetSizeBytes > MAX_ESTIMATED_DATASET_BYTES_V3 ? ["dataset-bytes" as const] : []),
    ...(values.identityPayloadBytes > MAX_ESTIMATED_IDENTITY_PAYLOAD_BYTES_V3 ? ["identity-bytes" as const] : []),
    ...(applyExactStructuralLimits && values.estimatedStateCount > MAX_ESTIMATED_STATE_COUNT_V3
      ? ["state-count" as const]
      : []),
    ...(applyExactStructuralLimits && values.estimatedStructuralBytes > MAX_ESTIMATED_STRUCTURAL_BYTES_V3
      ? ["structural-bytes" as const]
      : []),
    ...(values.estimatedNumericCells > MAX_ESTIMATED_NUMERIC_CELLS_V3 ? ["numeric-cells" as const] : []),
    ...(values.estimatedWindowVisits > MAX_ESTIMATED_WINDOW_VISITS_V3 ? ["window-visits" as const] : []),
    ...((values.estimatedRotationWorkUnits ?? 0) > MAX_ESTIMATED_ROTATION_WORK_UNITS_V3
      ? ["rotation-work" as const]
      : []),
    ...((values.estimatedRotationMatrixBytesOna ?? 0) > MAX_ESTIMATED_ROTATION_MATRIX_BYTES_ONA_V3
      ? ["rotation-matrix" as const]
      : []),
    ...(values.estimatedPeakBytes > MAX_ESTIMATED_PEAK_BYTES_V3 ? ["peak-bytes" as const] : []),
    ...(values.estimatedExportBytes > MAX_ESTIMATED_EXPORT_BYTES_V3 ? ["export-bytes" as const] : []),
  ];
}

function estimateStandardResourcesInternalV3(inputValue: StandardResourceInputV3): StandardResourceEstimateV3 {
  const input = snapshotPlainJsonRecordV3(inputValue, "Standard resource input");
  const standardKeys = [
    "rowCount",
    "unitCount",
    "horizonCount",
    "codeCount",
    "horizonSizes",
    "trajectorySteps",
    "windowType",
    "backward",
    "forward",
    "referenceProjection",
    "datasetSizeBytes",
    "identityPayloadBytes",
  ];
  assertExactKeysV3(
    input,
    [...standardKeys, "windowPartitionSizes"],
    "Standard resource input",
  );
  const rowCount = nonnegativeSafeIntegerV3(input.rowCount, "resource input.rowCount");
  const unitCount = nonnegativeSafeIntegerV3(input.unitCount, "resource input.unitCount");
  const horizonCount = nonnegativeSafeIntegerV3(input.horizonCount, "resource input.horizonCount");
  const codeCount = nonnegativeSafeIntegerV3(input.codeCount, "resource input.codeCount");
  const trajectorySteps = nonnegativeSafeIntegerV3(input.trajectorySteps, "resource input.trajectorySteps");
  const datasetSizeBytes = nonnegativeSafeIntegerV3(input.datasetSizeBytes, "resource input.datasetSizeBytes");
  const identityPayloadBytes = nonnegativeSafeIntegerV3(
    input.identityPayloadBytes,
    "resource input.identityPayloadBytes",
  );
  const horizonSizes = snapshotHorizonSizesV3(input.horizonSizes, horizonCount, rowCount);
  if (input.windowType !== "MovingStanzaWindow" && input.windowType !== "Conversation") {
    throw new TypeError("resource input.windowType is invalid.");
  }
  const backward = extentV3(input.backward, "resource input.backward", true);
  const forward = extentV3(input.forward, "resource input.forward", false);
  if (typeof input.referenceProjection !== "boolean") {
    throw new TypeError("resource input.referenceProjection must be a boolean.");
  }
  const windowPartitionSizes = snapshotWindowPartitionSizesV3(input.windowPartitionSizes, rowCount);
  if (input.windowType === "MovingStanzaWindow"
    && (windowPartitionSizes.length !== horizonSizes.length
      || windowPartitionSizes.some((size, index) => size !== horizonSizes[index]))) {
    throw new TypeError("Moving Stanza scientific window partitions must exactly equal global Horizon sizes.");
  }

  const edgeProduct = safeMultiplyV3(codeCount, Math.max(0, codeCount - 1), "Standard adjacency dimensions");
  const adjacencyDimensions = edgeProduct / 2;
  let estimatedWindowVisits = 0;
  let estimatedForwardBufferRows = 0;
  let estimatedRetainedWindowRows = 0;
  for (const size of windowPartitionSizes) {
    const perRowVisits = input.windowType === "Conversation"
      ? size
      : safeAddV3(
          coveredExtentV3(backward, size, true),
          coveredExtentV3(forward, size, false),
          "Moving window coverage",
        );
    estimatedWindowVisits = safeAddV3(
      estimatedWindowVisits,
      safeMultiplyV3(size, perRowVisits, "Window visits"),
      "Window visits",
    );
    estimatedForwardBufferRows = Math.max(
      estimatedForwardBufferRows,
      input.windowType === "Conversation" ? size : coveredExtentV3(forward, size, false),
    );
    if (input.windowType === "MovingStanzaWindow") {
      let retainedForHorizon: number;
      if (forward.kind === "finite" && forward.value === 0) {
        retainedForHorizon = backward.kind === "infinity"
          ? 0
          : Math.min(size, Math.max(0, backward.value - 1));
      } else if (forward.kind === "infinity" || backward.kind === "infinity") {
        retainedForHorizon = size;
      } else {
        const finiteSpan = safeAddV3(forward.value, backward.value - 1, "Moving retained row span");
        retainedForHorizon = Math.min(size, finiteSpan);
      }
      estimatedRetainedWindowRows = safeAddV3(
        estimatedRetainedWindowRows,
        retainedForHorizon,
        "Retained Moving window rows",
      );
    }
  }

  const aggregateStateUpperBound = windowPartitionSizes.length;
  const structural = structuralEstimateV3({
    rowCount,
    unitCount,
    horizonCount,
    targetCount: trajectorySteps,
    aggregateStateUpperBound,
    retainedRowCount: estimatedRetainedWindowRows,
    codeCount,
    datasetSizeBytes,
    identityPayloadBytes,
  });

  const rawCodeCells = safeMultiplyV3(rowCount, codeCount, "Raw Code cells");
  const trajectoryCells = safeMultiplyV3(trajectorySteps, adjacencyDimensions, "Trajectory cells");
  const denseRotation = estimateDenseSvdBudget(trajectorySteps, adjacencyDimensions);
  const referenceCells = input.referenceProjection ? trajectoryCells : 0;
  const estimatedNumericCells = safeAddV3(
    safeAddV3(rawCodeCells, trajectoryCells, "Numeric cells"),
    safeAddV3(denseRotation.matrixCells, referenceCells, "Numeric cells"),
    "Numeric cells",
  );
  const workerColumns = safeAddV3(codeCount, 5, "Worker columns");
  const movingStateWidth = safeAddV3(
    safeMultiplyV3(2, codeCount, "Moving state Code cells"),
    5,
    "Moving state cells",
  );
  const conversationStateWidth = safeAddV3(
    safeMultiplyV3(2, codeCount, "Conversation state Code cells"),
    5,
    "Conversation state cells",
  );
  const estimatedWindowStateCells = safeMultiplyV3(
    windowPartitionSizes.length,
    input.windowType === "Conversation" ? conversationStateWidth : movingStateWidth,
    "Window state cells",
  );
  const estimatedWorkerMaterializationBytes = safeMultiplyV3(
    safeAddV3(
      safeAddV3(
        safeMultiplyV3(rowCount, workerColumns, "Worker materialization cells"),
        safeMultiplyV3(estimatedRetainedWindowRows, workerColumns, "Retained window cells"),
        "Worker and retained window cells",
      ),
      estimatedWindowStateCells,
      "Worker materialization cells",
    ),
    16,
    "Worker materialization bytes",
  );
  const estimatedExportBytes = safeMultiplyV3(
    safeAddV3(rawCodeCells, trajectoryCells, "Export cells"),
    24,
    "Export bytes",
  );
  const estimatedPeakBytes = safeAddV3(
    safeAddV3(
      safeMultiplyV3(estimatedNumericCells, 8, "Numeric bytes"),
      estimatedWorkerMaterializationBytes,
      "Numeric and worker bytes",
    ),
    structural.estimatedStructuralBytes,
    "Peak bytes",
  );
  const blockedReasons = blockedReasonsV3({
    datasetSizeBytes,
    identityPayloadBytes,
    estimatedStateCount: structural.estimatedStateCount,
    estimatedStructuralBytes: structural.estimatedStructuralBytes,
    estimatedNumericCells,
    estimatedWindowVisits,
    estimatedRotationWorkUnits: denseRotation.workUnits,
    estimatedPeakBytes,
    estimatedExportBytes,
  });
  return deepFreezeV3({
    version: RESOURCE_BUDGET_VERSION_V3,
    analysisFamily: "standard" as const,
    rows: rowCount,
    units: unitCount,
    horizons: horizonCount,
    windowPartitions: windowPartitionSizes.length,
    codes: codeCount,
    adjacencyDimensions,
    datasetSizeBytes,
    identityPayloadBytes,
    aggregateStateUpperBound,
    estimatedStateCount: structural.estimatedStateCount,
    estimatedStructuralBytes: structural.estimatedStructuralBytes,
    trajectorySteps,
    estimatedForwardBufferRows,
    estimatedRetainedWindowRows,
    estimatedWindowStateCells,
    estimatedWindowVisits,
    estimatedRotationWorkUnits: denseRotation.workUnits,
    estimatedRotationMatrixBytes: denseRotation.matrixBytes,
    estimatedNumericCells,
    estimatedWorkerMaterializationBytes,
    estimatedExportBytes,
    estimatedPeakBytes,
    blocked: blockedReasons.length > 0,
    blockedReasons,
  });
}

function estimateOnaResourcesInternalV3(inputValue: OnaResourceInputV3): OnaResourceEstimateV3 {
  const input = snapshotPlainJsonRecordV3(inputValue, "ONA resource input");
  assertExactKeysV3(input, [
    "rowCount",
    "unitCount",
    "horizonCount",
    "codeCount",
    "horizonSizes",
    "backward",
    "datasetSizeBytes",
    "identityPayloadBytes",
  ], "ONA resource input");
  const rowCount = nonnegativeSafeIntegerV3(input.rowCount, "resource input.rowCount");
  const unitCount = nonnegativeSafeIntegerV3(input.unitCount, "resource input.unitCount");
  const horizonCount = nonnegativeSafeIntegerV3(input.horizonCount, "resource input.horizonCount");
  const codeCount = nonnegativeSafeIntegerV3(input.codeCount, "resource input.codeCount");
  const datasetSizeBytes = nonnegativeSafeIntegerV3(input.datasetSizeBytes, "resource input.datasetSizeBytes");
  const identityPayloadBytes = nonnegativeSafeIntegerV3(
    input.identityPayloadBytes,
    "resource input.identityPayloadBytes",
  );
  const horizonSizes = snapshotHorizonSizesV3(input.horizonSizes, horizonCount, rowCount);
  const backward = extentV3(input.backward, "resource input.backward", true);

  const adjacencyDimensions = safeMultiplyV3(codeCount, codeCount, "ONA adjacency dimensions");
  const directionalMaskCells = adjacencyDimensions;
  let estimatedWindowVisits = 0;
  let estimatedRetainedWindowRows = 0;
  for (const size of horizonSizes) {
    estimatedWindowVisits = safeAddV3(
      estimatedWindowVisits,
      safeMultiplyV3(
        size,
        coveredExtentV3(backward, size, true),
        "ONA window visits",
      ),
      "ONA window visits",
    );
    if (backward.kind === "finite") {
      estimatedRetainedWindowRows = safeAddV3(
        estimatedRetainedWindowRows,
        Math.min(size, Math.max(0, backward.value - 1)),
        "ONA retained window rows",
      );
    }
  }
  const aggregateStateUpperBound = horizonCount;
  const structural = structuralEstimateV3({
    rowCount,
    unitCount,
    horizonCount,
    targetCount: unitCount,
    aggregateStateUpperBound,
    retainedRowCount: estimatedRetainedWindowRows,
    codeCount,
    datasetSizeBytes,
    identityPayloadBytes,
  });
  const rawCodeCells = safeMultiplyV3(rowCount, codeCount, "ONA raw Code cells");
  const endpointCells = safeMultiplyV3(unitCount, adjacencyDimensions, "ONA Endpoint cells");
  const denseRotation = estimateDenseSvdBudget(unitCount, adjacencyDimensions);
  const estimatedNumericCells = safeAddV3(
    safeAddV3(rawCodeCells, endpointCells, "ONA numeric cells"),
    safeAddV3(denseRotation.matrixCells, directionalMaskCells, "ONA numeric cells"),
    "ONA numeric cells",
  );
  const workerColumns = safeAddV3(codeCount, 5, "ONA worker columns");
  const stateWidth = safeAddV3(
    safeMultiplyV3(2, codeCount, "ONA state Code cells"),
    5,
    "ONA state cells",
  );
  const estimatedWindowStateCells = safeMultiplyV3(horizonCount, stateWidth, "ONA window state cells");
  const estimatedWorkerMaterializationBytes = safeMultiplyV3(
    safeAddV3(
      safeAddV3(
        safeMultiplyV3(rowCount, workerColumns, "ONA worker materialization cells"),
        safeMultiplyV3(estimatedRetainedWindowRows, workerColumns, "ONA retained window cells"),
        "ONA worker and retained window cells",
      ),
      estimatedWindowStateCells,
      "ONA worker materialization cells",
    ),
    16,
    "ONA worker materialization bytes",
  );
  const estimatedExportBytes = safeMultiplyV3(
    safeAddV3(rawCodeCells, endpointCells, "ONA export cells"),
    24,
    "ONA export bytes",
  );
  const estimatedPeakBytes = safeAddV3(
    safeAddV3(
      safeMultiplyV3(estimatedNumericCells, 8, "ONA numeric bytes"),
      estimatedWorkerMaterializationBytes,
      "ONA numeric and worker bytes",
    ),
    structural.estimatedStructuralBytes,
    "ONA peak bytes",
  );
  const blockedReasons = blockedReasonsV3({
    datasetSizeBytes,
    identityPayloadBytes,
    estimatedStateCount: structural.estimatedStateCount,
    estimatedStructuralBytes: structural.estimatedStructuralBytes,
    estimatedNumericCells,
    estimatedWindowVisits,
    estimatedRotationWorkUnits: denseRotation.workUnits,
    estimatedRotationMatrixBytesOna: denseRotation.matrixBytes,
    estimatedPeakBytes,
    estimatedExportBytes,
  });
  return deepFreezeV3({
    version: RESOURCE_BUDGET_VERSION_V3,
    analysisFamily: "ona" as const,
    rows: rowCount,
    units: unitCount,
    horizons: horizonCount,
    windowPartitions: horizonCount,
    codes: codeCount,
    adjacencyDimensions,
    datasetSizeBytes,
    identityPayloadBytes,
    aggregateStateUpperBound,
    estimatedStateCount: structural.estimatedStateCount,
    estimatedStructuralBytes: structural.estimatedStructuralBytes,
    endpointNetworks: unitCount,
    directionalMaskCells,
    estimatedRotationWorkUnits: denseRotation.workUnits,
    estimatedRotationMatrixBytes: denseRotation.matrixBytes,
    estimatedForwardBufferRows: 0,
    estimatedRetainedWindowRows,
    estimatedWindowStateCells,
    estimatedWindowVisits,
    estimatedNumericCells,
    estimatedWorkerMaterializationBytes,
    estimatedExportBytes,
    estimatedPeakBytes,
    blocked: blockedReasons.length > 0,
    blockedReasons,
  });
}

function estimateEarlyStandardResourcesInternalV3(
  inputValue: EarlyStandardResourceInputV3,
): EarlyStandardResourceEstimateV3 {
  const input = snapshotPlainJsonRecordV3(inputValue, "Early Standard resource input");
  assertExactKeysV3(
    input,
    ["rowCount", "codeCount", "datasetSizeBytes", "identityPayloadBytes"],
    "Early Standard resource input",
  );
  const rowCount = nonnegativeSafeIntegerV3(input.rowCount, "resource input.rowCount");
  const codeCount = nonnegativeSafeIntegerV3(input.codeCount, "resource input.codeCount");
  const datasetSizeBytes = nonnegativeSafeIntegerV3(input.datasetSizeBytes, "resource input.datasetSizeBytes");
  const identityPayloadBytes = nonnegativeSafeIntegerV3(
    input.identityPayloadBytes,
    "resource input.identityPayloadBytes",
  );
  const structural = structuralEstimateV3({
    rowCount,
    unitCount: rowCount,
    horizonCount: rowCount,
    targetCount: rowCount,
    aggregateStateUpperBound: rowCount,
    retainedRowCount: rowCount,
    codeCount,
    datasetSizeBytes,
    identityPayloadBytes,
  });
  const estimatedPeakBytes = structural.estimatedStructuralBytes;
  const blockedReasons = blockedReasonsV3({
    datasetSizeBytes,
    identityPayloadBytes,
    estimatedStateCount: structural.estimatedStateCount,
    estimatedStructuralBytes: structural.estimatedStructuralBytes,
    estimatedNumericCells: 0,
    estimatedWindowVisits: 0,
    estimatedPeakBytes,
    estimatedExportBytes: 0,
  }, {
    // These counts are deliberately worst-case envelope proxies, not exact
    // typed identities or retained states. Apply them to the aggregate peak
    // gate here; exact state and structural caps run after typed profiling.
    applyExactStructuralLimits: false,
  });
  return deepFreezeV3({
    version: RESOURCE_BUDGET_VERSION_V3,
    analysisFamily: "standard" as const,
    admissionStage: "early-envelope" as const,
    rows: rowCount,
    units: rowCount,
    horizons: rowCount,
    windowPartitions: rowCount,
    codes: codeCount,
    adjacencyDimensions: 0,
    datasetSizeBytes,
    identityPayloadBytes,
    aggregateStateUpperBound: rowCount,
    estimatedStateCount: structural.estimatedStateCount,
    estimatedStructuralBytes: structural.estimatedStructuralBytes,
    trajectorySteps: rowCount,
    estimatedForwardBufferRows: rowCount,
    estimatedRetainedWindowRows: rowCount,
    estimatedWindowStateCells: 0,
    estimatedWindowVisits: 0,
    estimatedNumericCells: 0,
    estimatedWorkerMaterializationBytes: 0,
    estimatedExportBytes: 0,
    estimatedPeakBytes,
    estimatedRotationWorkUnits: 0,
    estimatedRotationMatrixBytes: 0,
    blocked: blockedReasons.length > 0,
    blockedReasons,
  });
}

function wrapResourceEstimateErrorV3(error: unknown): never {
  if (error instanceof ResourceEstimateErrorV3) throw error;
  if (error instanceof RangeError) {
    throw new ResourceEstimateErrorV3("UNSAFE_ARITHMETIC", error.message, error);
  }
  if (error instanceof TypeError) {
    throw new ResourceEstimateErrorV3("INVALID_INPUT", error.message, error);
  }
  throw error;
}

export function estimateStandardResourcesV3(inputValue: StandardResourceInputV3): StandardResourceEstimateV3 {
  try {
    return estimateStandardResourcesInternalV3(inputValue);
  } catch (error) {
    return wrapResourceEstimateErrorV3(error);
  }
}

export function estimateOnaResourcesV3(inputValue: OnaResourceInputV3): OnaResourceEstimateV3 {
  try {
    return estimateOnaResourcesInternalV3(inputValue);
  } catch (error) {
    return wrapResourceEstimateErrorV3(error);
  }
}

export function estimateEarlyStandardResourcesV3(
  inputValue: EarlyStandardResourceInputV3,
): EarlyStandardResourceEstimateV3 {
  try {
    return estimateEarlyStandardResourcesInternalV3(inputValue);
  } catch (error) {
    return wrapResourceEstimateErrorV3(error);
  }
}
