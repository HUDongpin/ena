import { deepFreezeV3 } from "./canonical-json";
import { estimateOnaGeneratedTableKeyBytesV3, estimateResultIdentityBytesV3 } from "./compiler-dataset";
import { MAX_ESTIMATED_EXPORT_BYTES_V3, MAX_ESTIMATED_NUMERIC_CELLS_V3, MAX_ESTIMATED_PEAK_BYTES_V3, MAX_ESTIMATED_ROTATION_WORK_UNITS_V3, MAX_ESTIMATED_STRUCTURAL_BYTES_V3, type OnaResourceEstimateV3 } from "./resource-budget";
import type { CanonicalOnaConfigV3 } from "./types";
import { datasetHashKindFor, type ParsedDataset } from "../types";
import { canonicalJsonByteLengthV3 } from "./standard-closure-resource-budget";

export const ONA_OPERATIONAL_BUDGET_VERSION_V3 = "open-ena-ona-operational-v2" as const;
export const LEGACY_ONA_OPERATIONAL_BUDGET_VERSION_V3 = "open-ena-ona-operational-v1" as const;
/** Same ceiling as the existing ordered-audit extractor, checked before full accumulation. */
export const MAX_ONA_AUDIT_EDGE_CELLS_V3 = 2_000_000;

interface LegacyOnaOperationalAdmissionV3 {
  readonly version: typeof LEGACY_ONA_OPERATIONAL_BUDGET_VERSION_V3;
  readonly compactScientificCells: number;
  readonly resultIdentityBytes: number;
  readonly generatedTableKeyBytes: number;
  readonly numericSerializationBytes: number;
  readonly metadataSerializationBytes: number;
  readonly closureWorkUnits: number;
  readonly stages: {
    readonly sourceCaptureCells: number;
    readonly accumulationCells: number;
    readonly modelCells: number;
    readonly bindingCells: number;
    readonly rankDiagnosticCells: number;
    readonly validationScratchCells: number;
    readonly scientificClosureCells: number;
  };
  readonly incrementalNumericCells: number;
  readonly incrementalPeakBytes: number;
  readonly incrementalExportBytes: number;
  readonly totalNumericCells: number;
  readonly totalPeakBytes: number;
  readonly totalExportBytes: number;
  readonly totalStructuralBytes: number;
}

export type OnaOperationalAdmissionV3 = LegacyOnaOperationalAdmissionV3 | (Omit<LegacyOnaOperationalAdmissionV3, "version"> & {
  readonly version: typeof ONA_OPERATIONAL_BUDGET_VERSION_V3;
  /** Exact canonical UTF8 bytes of the complete hashed source proof. */
  readonly sourceProofJsonBytes: number;
  /** Conservative capture width, including 24-byte numeric scalar charges. */
  readonly sourceProofCaptureBytes: number;
  /** Source capture and canonical text overlap, separate from result metadata. */
  readonly sourceProofSerializationBytes: number;
});

function safe(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`ONA ${label} exceeds safe resource arithmetic.`);
  return value;
}

/**
 * Conservative stage-overlap envelopes, not measured heap or cumulative
 * allocation. The legacy ONA estimate is unchanged; only explicit nonnegative
 * increments are admitted against the same global hard limits.
 * @internal Only validation of an existing v1 plan may select this ledger.
 */
export function estimateLegacyOnaOperationalAdmissionV3(dataset: Pick<ParsedDataset, "rows">, configuration: CanonicalOnaConfigV3, baseline: OnaResourceEstimateV3): LegacyOnaOperationalAdmissionV3 {
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
  // One retained source oracle plus normalized/projection/full-coordinate UE
  // matrices; native directed-node solve, centroid and axis/vector scratch.
  // The earlier two-UE audit conservation phase has already returned here.
  const scientificClosureCells = safe(4 * u * e + 3 * u * c + 3 * c * c + 3 * u * d + 3 * c * d + 2 * u + 8 * c + 8 * e, "scientific closure cells");
  // Independent safe work proxy including the existing orthogonality loop;
  // not exact CPU instructions or a cumulative whole-request operation count.
  const closureWorkUnits = safe(e * e * e + 2 * u * e * e + 4 * u * c * c + 3 * d * c * c * c + 12 * u * e + n * e, "scientific closure work");
  if (closureWorkUnits > MAX_ESTIMATED_ROTATION_WORK_UNITS_V3) throw new TypeError("ONA scientific closure exceeds the fixed work budget.");
  const validationScratchCells = Math.max(accumulationCells, safe(n * c + 4 * u * e + rankDiagnosticCells, "readiness and rank scratch cells"), scientificClosureCells);
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
  return deepFreezeV3({ version: LEGACY_ONA_OPERATIONAL_BUDGET_VERSION_V3, compactScientificCells, resultIdentityBytes, generatedTableKeyBytes: estimateOnaGeneratedTableKeyBytesV3(dataset, configuration), numericSerializationBytes, metadataSerializationBytes, closureWorkUnits,
    stages: { sourceCaptureCells, accumulationCells, modelCells, bindingCells, rankDiagnosticCells, validationScratchCells, scientificClosureCells },
    incrementalNumericCells: totalNumericCells - baseline.estimatedNumericCells,
    incrementalPeakBytes: totalPeakBytes - baseline.estimatedPeakBytes,
    incrementalExportBytes: totalExportBytes - baseline.estimatedExportBytes,
    totalNumericCells, totalPeakBytes, totalExportBytes, totalStructuralBytes });
}

/** Count a complete source proof without retaining another N-row object graph or
 * allocating its serialized text. Each selected row key is charged again, even
 * when a Code name is repeated. Unselected headers and the dataset name still
 * belong to the proof and therefore cannot be inferred from selected identities.
 */
function sourceProofSerializationV3(dataset: ParsedDataset, configuration: CanonicalOnaConfigV3) {
  const selected = new Set([...configuration.units.columns, ...configuration.horizons.columns, ...configuration.codes.map(code => code.column)]);
  if (configuration.units.group.type === "stable-metadata") selected.add(configuration.units.group.column);
  if (configuration.window.rowOrder.kind === "columns") for (const key of configuration.window.rowOrder.keys) selected.add(key.column);
  const selectedColumns = [...selected].sort();
  const limit = MAX_ESTIMATED_STRUCTURAL_BYTES_V3 / 8;
  const skeleton = { schemaVersion: 1, dataset: { name: dataset.name, source: dataset.source, hashKind: datasetHashKindFor(dataset), normalizedTableSha256: "0".repeat(64), externalHashVerification: "provenance-only-no-normalized-table-preimage", rowCount: dataset.rows.length, sizeBytes: dataset.sizeBytes }, headers: dataset.headers, selectedColumns, rows: [], sourceProofSha256: "0".repeat(64) };
  let sourceProofJsonBytes = canonicalJsonByteLengthV3(skeleton, limit);
  for (const [sourceRowIndex, row] of dataset.rows.entries()) {
    const values = Object.create(null) as Record<string, unknown>;
    for (const column of selectedColumns) {
      const descriptor = Object.getOwnPropertyDescriptor(row, column);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw new TypeError("ONA source serialization requires captured data properties.");
      values[column] = descriptor.value;
    }
    sourceProofJsonBytes = safe(sourceProofJsonBytes + (sourceRowIndex ? 1 : 0) + canonicalJsonByteLengthV3({ sourceRowIndex, values }, limit - sourceProofJsonBytes), "source proof JSON bytes");
  }
  // captureOnaJsonV3 charges every number at 24 bytes, every Boolean at 5,
  // and one extra comma per container. Charge every selected scalar at the
  // numeric maximum in addition to its exact JSON width, plus all wrappers.
  const sourceProofCaptureBytes = safe(sourceProofJsonBytes + 24 * (dataset.rows.length * (selectedColumns.length + 1) + 3)
    + dataset.rows.length * (selectedColumns.length + 4) + dataset.headers.length + selectedColumns.length + 32, "source proof capture bytes");
  return { sourceProofJsonBytes, sourceProofCaptureBytes, sourceProofSerializationBytes: safe(8 * sourceProofCaptureBytes, "source proof serialization bytes") };
}

/** Current admission shared by compiler and builder before scientific preflight.
 * Existing scientific limits remain fixed; source proof serialization overlaps
 * the result/identity envelope instead of borrowing its unrelated spare bytes.
 */
export function estimateOnaOperationalAdmissionV3(dataset: ParsedDataset, configuration: CanonicalOnaConfigV3, baseline: OnaResourceEstimateV3): OnaOperationalAdmissionV3 {
  const legacy = estimateLegacyOnaOperationalAdmissionV3(dataset, configuration, baseline);
  const source = sourceProofSerializationV3(dataset, configuration);
  const totalStructuralBytes = safe(legacy.totalStructuralBytes + source.sourceProofSerializationBytes, "structural bytes");
  const totalPeakBytes = safe(legacy.totalPeakBytes + source.sourceProofSerializationBytes, "peak bytes");
  const totalExportBytes = safe(legacy.totalExportBytes + source.sourceProofCaptureBytes, "export bytes");
  if (totalPeakBytes > MAX_ESTIMATED_PEAK_BYTES_V3 || totalExportBytes > MAX_ESTIMATED_EXPORT_BYTES_V3 || totalStructuralBytes > MAX_ESTIMATED_STRUCTURAL_BYTES_V3) throw new TypeError("ONA source serialization exceeds the fixed resource budget.");
  return deepFreezeV3({ ...legacy, version: ONA_OPERATIONAL_BUDGET_VERSION_V3, ...source, totalStructuralBytes, totalPeakBytes, totalExportBytes,
    incrementalPeakBytes: totalPeakBytes - baseline.estimatedPeakBytes, incrementalExportBytes: totalExportBytes - baseline.estimatedExportBytes });
}
