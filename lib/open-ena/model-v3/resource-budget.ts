import {
  deepFreezeV3,
  snapshotDenseJsonArrayV3,
  snapshotPlainJsonRecordV3,
} from "./canonical-json";
import type {
  BackwardExtentV3,
  ForwardExtentV3,
  StandardWindowTypeV3,
} from "./types";

export const RESOURCE_BUDGET_VERSION_V3 = "open-ena-resource-v3.1" as const;
export const MAX_ESTIMATED_NUMERIC_CELLS_V3 = 25_000_000;
export const MAX_ESTIMATED_WINDOW_VISITS_V3 = 100_000_000;
export const MAX_ESTIMATED_PEAK_BYTES_V3 = 512 * 1024 * 1024;
export const MAX_ESTIMATED_EXPORT_BYTES_V3 = 256 * 1024 * 1024;

export type ResourceBlockedReasonV3 =
  | "numeric-cells"
  | "window-visits"
  | "peak-bytes"
  | "export-bytes";

export interface StandardResourceInputV3 {
  readonly rowCount: number;
  readonly unitCount: number;
  readonly horizonCount: number;
  readonly codeCount: number;
  readonly horizonSizes: readonly number[];
  readonly trajectorySteps: number;
  readonly windowType: StandardWindowTypeV3;
  readonly backward: BackwardExtentV3;
  readonly forward: ForwardExtentV3;
  readonly referenceProjection: boolean;
}

export interface OnaResourceInputV3 {
  readonly rowCount: number;
  readonly unitCount: number;
  readonly horizonCount: number;
  readonly codeCount: number;
  readonly horizonSizes: readonly number[];
  readonly backward: BackwardExtentV3;
}

interface ResourceEstimateBaseV3 {
  readonly version: typeof RESOURCE_BUDGET_VERSION_V3;
  readonly analysisFamily: "standard" | "ona";
  readonly rows: number;
  readonly units: number;
  readonly horizons: number;
  readonly codes: number;
  readonly adjacencyDimensions: number;
  readonly estimatedForwardBufferRows: number;
  readonly estimatedWindowVisits: number;
  readonly estimatedNumericCells: number;
  readonly estimatedWorkerMaterializationBytes: number;
  readonly estimatedExportBytes: number;
  readonly estimatedPeakBytes: number;
  readonly blocked: boolean;
  readonly blockedReasons: readonly ResourceBlockedReasonV3[];
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

export type ResourceEstimateV3 = StandardResourceEstimateV3 | OnaResourceEstimateV3;

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
  estimatedNumericCells: number;
  estimatedWindowVisits: number;
  estimatedPeakBytes: number;
  estimatedExportBytes: number;
}): ResourceBlockedReasonV3[] {
  return [
    ...(values.estimatedNumericCells > MAX_ESTIMATED_NUMERIC_CELLS_V3 ? ["numeric-cells" as const] : []),
    ...(values.estimatedWindowVisits > MAX_ESTIMATED_WINDOW_VISITS_V3 ? ["window-visits" as const] : []),
    ...(values.estimatedPeakBytes > MAX_ESTIMATED_PEAK_BYTES_V3 ? ["peak-bytes" as const] : []),
    ...(values.estimatedExportBytes > MAX_ESTIMATED_EXPORT_BYTES_V3 ? ["export-bytes" as const] : []),
  ];
}

export function estimateStandardResourcesV3(inputValue: StandardResourceInputV3): StandardResourceEstimateV3 {
  const input = snapshotPlainJsonRecordV3(inputValue, "Standard resource input");
  assertExactKeysV3(input, [
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
  ], "Standard resource input");
  const rowCount = nonnegativeSafeIntegerV3(input.rowCount, "resource input.rowCount");
  const unitCount = nonnegativeSafeIntegerV3(input.unitCount, "resource input.unitCount");
  const horizonCount = nonnegativeSafeIntegerV3(input.horizonCount, "resource input.horizonCount");
  const codeCount = nonnegativeSafeIntegerV3(input.codeCount, "resource input.codeCount");
  const trajectorySteps = nonnegativeSafeIntegerV3(input.trajectorySteps, "resource input.trajectorySteps");
  const horizonSizes = snapshotHorizonSizesV3(input.horizonSizes, horizonCount, rowCount);
  if (input.windowType !== "MovingStanzaWindow" && input.windowType !== "Conversation") {
    throw new TypeError("resource input.windowType is invalid.");
  }
  const backward = extentV3(input.backward, "resource input.backward", true);
  const forward = extentV3(input.forward, "resource input.forward", false);
  if (typeof input.referenceProjection !== "boolean") {
    throw new TypeError("resource input.referenceProjection must be a boolean.");
  }

  const edgeProduct = safeMultiplyV3(codeCount, Math.max(0, codeCount - 1), "Standard adjacency dimensions");
  const adjacencyDimensions = edgeProduct / 2;
  let estimatedWindowVisits = 0;
  let estimatedForwardBufferRows = 0;
  for (const size of horizonSizes) {
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
  }

  const rawCodeCells = safeMultiplyV3(rowCount, codeCount, "Raw Code cells");
  const trajectoryCells = safeMultiplyV3(trajectorySteps, adjacencyDimensions, "Trajectory cells");
  const covarianceCells = safeMultiplyV3(adjacencyDimensions, adjacencyDimensions, "Covariance cells");
  const referenceCells = input.referenceProjection ? trajectoryCells : 0;
  const estimatedNumericCells = safeAddV3(
    safeAddV3(rawCodeCells, trajectoryCells, "Numeric cells"),
    safeAddV3(covarianceCells, referenceCells, "Numeric cells"),
    "Numeric cells",
  );
  const workerColumns = safeAddV3(codeCount, 5, "Worker columns");
  const estimatedWorkerMaterializationBytes = safeMultiplyV3(
    safeAddV3(
      safeMultiplyV3(rowCount, workerColumns, "Worker materialization cells"),
      safeMultiplyV3(estimatedForwardBufferRows, workerColumns, "Forward buffer cells"),
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
    safeMultiplyV3(estimatedNumericCells, 8, "Numeric bytes"),
    estimatedWorkerMaterializationBytes,
    "Peak bytes",
  );
  const blockedReasons = blockedReasonsV3({
    estimatedNumericCells,
    estimatedWindowVisits,
    estimatedPeakBytes,
    estimatedExportBytes,
  });
  return deepFreezeV3({
    version: RESOURCE_BUDGET_VERSION_V3,
    analysisFamily: "standard" as const,
    rows: rowCount,
    units: unitCount,
    horizons: horizonCount,
    codes: codeCount,
    adjacencyDimensions,
    trajectorySteps,
    estimatedForwardBufferRows,
    estimatedWindowVisits,
    estimatedNumericCells,
    estimatedWorkerMaterializationBytes,
    estimatedExportBytes,
    estimatedPeakBytes,
    blocked: blockedReasons.length > 0,
    blockedReasons,
  });
}

export function estimateOnaResourcesV3(inputValue: OnaResourceInputV3): OnaResourceEstimateV3 {
  const input = snapshotPlainJsonRecordV3(inputValue, "ONA resource input");
  assertExactKeysV3(input, [
    "rowCount",
    "unitCount",
    "horizonCount",
    "codeCount",
    "horizonSizes",
    "backward",
  ], "ONA resource input");
  const rowCount = nonnegativeSafeIntegerV3(input.rowCount, "resource input.rowCount");
  const unitCount = nonnegativeSafeIntegerV3(input.unitCount, "resource input.unitCount");
  const horizonCount = nonnegativeSafeIntegerV3(input.horizonCount, "resource input.horizonCount");
  const codeCount = nonnegativeSafeIntegerV3(input.codeCount, "resource input.codeCount");
  const horizonSizes = snapshotHorizonSizesV3(input.horizonSizes, horizonCount, rowCount);
  const backward = extentV3(input.backward, "resource input.backward", true);

  const adjacencyDimensions = safeMultiplyV3(codeCount, codeCount, "ONA adjacency dimensions");
  const directionalMaskCells = adjacencyDimensions;
  let estimatedWindowVisits = 0;
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
  }
  const rawCodeCells = safeMultiplyV3(rowCount, codeCount, "ONA raw Code cells");
  const endpointCells = safeMultiplyV3(unitCount, adjacencyDimensions, "ONA Endpoint cells");
  const covarianceCells = safeMultiplyV3(adjacencyDimensions, adjacencyDimensions, "ONA covariance cells");
  const estimatedNumericCells = safeAddV3(
    safeAddV3(rawCodeCells, endpointCells, "ONA numeric cells"),
    safeAddV3(covarianceCells, directionalMaskCells, "ONA numeric cells"),
    "ONA numeric cells",
  );
  const workerColumns = safeAddV3(codeCount, 5, "ONA worker columns");
  const estimatedWorkerMaterializationBytes = safeMultiplyV3(
    safeMultiplyV3(rowCount, workerColumns, "ONA worker materialization cells"),
    16,
    "ONA worker materialization bytes",
  );
  const estimatedExportBytes = safeMultiplyV3(
    safeAddV3(rawCodeCells, endpointCells, "ONA export cells"),
    24,
    "ONA export bytes",
  );
  const estimatedPeakBytes = safeAddV3(
    safeMultiplyV3(estimatedNumericCells, 8, "ONA numeric bytes"),
    estimatedWorkerMaterializationBytes,
    "ONA peak bytes",
  );
  const blockedReasons = blockedReasonsV3({
    estimatedNumericCells,
    estimatedWindowVisits,
    estimatedPeakBytes,
    estimatedExportBytes,
  });
  return deepFreezeV3({
    version: RESOURCE_BUDGET_VERSION_V3,
    analysisFamily: "ona" as const,
    rows: rowCount,
    units: unitCount,
    horizons: horizonCount,
    codes: codeCount,
    adjacencyDimensions,
    endpointNetworks: unitCount,
    directionalMaskCells,
    estimatedForwardBufferRows: 0,
    estimatedWindowVisits,
    estimatedNumericCells,
    estimatedWorkerMaterializationBytes,
    estimatedExportBytes,
    estimatedPeakBytes,
    blocked: blockedReasons.length > 0,
    blockedReasons,
  });
}
