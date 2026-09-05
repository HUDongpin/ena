import { deepFreezeV3 } from "./canonical-json";
import { estimateOnaGeneratedTableKeyBytesV3, estimateResultIdentityBytesV3 } from "./compiler-dataset";
import { MAX_ESTIMATED_EXPORT_BYTES_V3, MAX_ESTIMATED_NUMERIC_CELLS_V3, MAX_ESTIMATED_PEAK_BYTES_V3, MAX_ESTIMATED_STRUCTURAL_BYTES_V3, type OnaResourceEstimateV3 } from "./resource-budget";
import type { CanonicalOnaConfigV3 } from "./types";
import type { ParsedDataset } from "../types";

export const ONA_OPERATIONAL_BUDGET_VERSION_V3 = "open-ena-ona-operational-v1" as const;
/** Same ceiling as the existing ordered-audit extractor, checked before full accumulation. */
export const MAX_ONA_AUDIT_EDGE_CELLS_V3 = 2_000_000;

export interface OnaOperationalAdmissionV3 {
  readonly version: typeof ONA_OPERATIONAL_BUDGET_VERSION_V3;
  readonly compactScientificCells: number;
  readonly resultIdentityBytes: number;
  readonly generatedTableKeyBytes: number;
  readonly numericSerializationBytes: number;
  readonly metadataSerializationBytes: number;
  readonly stages: {
    readonly sourceCaptureCells: number;
    readonly accumulationCells: number;
    readonly modelCells: number;
    readonly bindingCells: number;
    readonly rankDiagnosticCells: number;
    readonly validationScratchCells: number;
  };
  readonly incrementalNumericCells: number;
  readonly incrementalPeakBytes: number;
  readonly incrementalExportBytes: number;
  readonly totalNumericCells: number;
  readonly totalPeakBytes: number;
  readonly totalExportBytes: number;
  readonly totalStructuralBytes: number;
}

function safe(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`ONA ${label} exceeds safe resource arithmetic.`);
  return value;
}

/**
 * Conservative stage-overlap envelopes, not measured heap or cumulative
 * allocation. The legacy ONA estimate is unchanged; only explicit nonnegative
 * increments are admitted against the same global hard limits.
 */
export function estimateOnaOperationalAdmissionV3(dataset: Pick<ParsedDataset, "rows">, configuration: CanonicalOnaConfigV3, baseline: OnaResourceEstimateV3): OnaOperationalAdmissionV3 {
  const n = baseline.rows, c = baseline.codes, e = baseline.adjacencyDimensions;
  const u = baseline.units, h = baseline.horizons, r = baseline.estimatedRetainedWindowRows, d = Math.min(3, e);
  if (baseline.analysisFamily !== "ona" || baseline.blocked || e !== c * c || n !== dataset.rows.length || c !== configuration.codes.length) throw new TypeError("ONA operational admission requires its exact admitted family baseline.");
  if (safe(n * e, "audit edge cells") > MAX_ONA_AUDIT_EDGE_CELLS_V3) throw new TypeError("ONA ordered audit exceeds its pre-allocation edge-cell budget.");
  // Four Unit×edge tables, points/centroids, complete basis/eigen/center/variance,
  // nodes, row audit edges, and at most U group response totals plus overall.
  const compactScientificCells = safe(4 * u * e + 2 * u * d + e * e + 3 * e + c * d + n * e + (u + 1) * c, "compact scientific cells");
  const sourceCaptureCells = safe(6 * n * c + 3 * e, "source capture cells");
  // Ordered expansion lengths cannot exceed their source additions: at most
  //2N Code insert/delete contributions and N Unit-edge contributions. Raw and
  // row-edge tables plus audit extraction are counted separately.
  // Two retained Endpoint vectors plus the existing finishInternals4UE
  // output-table/matrix scratch overlap must coexist before stream disposal.
  const accumulationCells = safe(7 * n * c + 2 * r * c + 2 * h * c + 2 * n * e + 6 * u * e + 4 * e, "accumulation cells");
  const retainedModel = safe(7 * u * e + n * c + n * e + e * e + 4 * e + 4 * u * d + u * c + 2 * c * d, "retained model cells");
  const modelScratch = safe(3 * e * e + 4 * u * e + 10 * e + 2 * u * c + 3 * c * c + u + 4 * c + 3 * u * d + 2 * c * d, "model scratch cells");
  const modelCells = safe(3 * n * c + retainedModel + modelScratch, "model phase cells");
  // Owned plan capture, full synchronous input, transformed/detached/reversed
  // compact results. The extra N×E retains optional full row-edge input.
  // Rank diagnostics retain normalized/centered/transposed inputs and the
  // covariance, Jacobi copy, working eigenvectors and reordered output basis.
  const rankDiagnosticCells = safe(4 * e * e + 4 * u * e + 8 * e, "rank diagnostic cells");
  const validationScratchCells = Math.max(accumulationCells, safe(n * c + 4 * u * e + rankDiagnosticCells, "readiness and rank scratch cells"));
  const bindingCells = safe(4 * n * c + 4 * compactScientificCells + n * e + validationScratchCells, "binding cells");
  const totalNumericCells = Math.max(baseline.estimatedNumericCells, sourceCaptureCells, accumulationCells, modelCells, bindingCells);
  const resultIdentityBytes = estimateResultIdentityBytesV3(dataset, configuration);
  // Recursive child strings, join/template output and one serialized comparison
  // peer can retain four complete UTF16 texts. This also contains the smaller
  // single-string plus UTF8 buffer overlap during WebCrypto hashing.
  const metadataSerializationBytes = safe(8 * resultIdentityBytes, "metadata serialization bytes");
  const numericSerializationBytes = safe(192 * compactScientificCells, "numeric serialization bytes");
  const totalStructuralBytes = safe(baseline.estimatedStructuralBytes + metadataSerializationBytes, "structural bytes");
  const totalPeakBytes = Math.max(baseline.estimatedPeakBytes, safe(baseline.estimatedWorkerMaterializationBytes + totalStructuralBytes + 8 * totalNumericCells + numericSerializationBytes, "peak bytes"));
  const totalExportBytes = Math.max(baseline.estimatedExportBytes, safe(resultIdentityBytes + 24 * compactScientificCells, "export bytes"));
  if (totalNumericCells > MAX_ESTIMATED_NUMERIC_CELLS_V3 || totalPeakBytes > MAX_ESTIMATED_PEAK_BYTES_V3 || totalExportBytes > MAX_ESTIMATED_EXPORT_BYTES_V3 || totalStructuralBytes > MAX_ESTIMATED_STRUCTURAL_BYTES_V3) throw new TypeError("ONA operational admission exceeds the fixed resource budget.");
  return deepFreezeV3({ version: ONA_OPERATIONAL_BUDGET_VERSION_V3, compactScientificCells, resultIdentityBytes, generatedTableKeyBytes: estimateOnaGeneratedTableKeyBytesV3(dataset, configuration), numericSerializationBytes, metadataSerializationBytes,
    stages: { sourceCaptureCells, accumulationCells, modelCells, bindingCells, rankDiagnosticCells, validationScratchCells },
    incrementalNumericCells: totalNumericCells - baseline.estimatedNumericCells,
    incrementalPeakBytes: totalPeakBytes - baseline.estimatedPeakBytes,
    incrementalExportBytes: totalExportBytes - baseline.estimatedExportBytes,
    totalNumericCells, totalPeakBytes, totalExportBytes, totalStructuralBytes });
}
