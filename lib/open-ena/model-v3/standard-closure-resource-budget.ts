import { deepFreezeV3, snapshotPlainJsonRecordV3 } from "./canonical-json";
import { MAX_ESTIMATED_EXPORT_BYTES_V3, MAX_ESTIMATED_NUMERIC_CELLS_V3, MAX_ESTIMATED_PEAK_BYTES_V3, MAX_ESTIMATED_ROTATION_WORK_UNITS_V3, MAX_ESTIMATED_STRUCTURAL_BYTES_V3, type StandardResourceEstimateV3 } from "./resource-budget";
import type { CanonicalStandardConfigV3, ReferenceAdmissionV3 } from "./types";

export const STANDARD_OPERATIONAL_BUDGET_VERSION_V3 = "open-ena-standard-operational-v1" as const;
export interface StandardOperationalAdmissionV3 {
  readonly version: typeof STANDARD_OPERATIONAL_BUDGET_VERSION_V3;
  readonly compactScientificCells: number;
  readonly generatedTableKeyBytes: number;
  readonly resultIdentityBytes: number;
  readonly numericSerializationBytes: number;
  readonly metadataSerializationBytes: number;
  readonly closureWorkUnits: number;
  readonly sourceWindowVisits: number;
  readonly sourceProofJsonBytes: number;
  readonly sourceProofSerializationBytes: number;
  readonly stages: { readonly sourceCaptureCells: number; readonly sourceOracleCells: number; readonly algebraCells: number; readonly rankDiagnosticCells: number; readonly bindingCells: number };
  readonly incrementalNumericCells: number;
  readonly incrementalPeakBytes: number;
  readonly incrementalExportBytes: number;
  readonly totalNumericCells: number;
  readonly totalPeakBytes: number;
  readonly totalExportBytes: number;
  readonly totalStructuralBytes: number;
}
export interface ReferenceBoundSerializationAdmissionV3 {
  readonly version: "open-ena-reference-bound-serialization-v1";
  readonly scientificValueOccurrences: number;
  readonly referencePayloadBytes: number;
  readonly incrementalNumericCells: 0;
  readonly incrementalPeakBytes: number;
  readonly incrementalExportBytes: number;
}
export interface StandardPlanSerializationAdmissionV3 {
  readonly version: "open-ena-standard-plan-serialization-v1";
  readonly planJsonBytesUpper: number;
  readonly serializationPeakBytes: number;
}

const OP_FIELDS = ["version", "compactScientificCells", "generatedTableKeyBytes", "resultIdentityBytes", "numericSerializationBytes", "metadataSerializationBytes", "closureWorkUnits", "sourceWindowVisits", "sourceProofJsonBytes", "sourceProofSerializationBytes", "stages", "sourceCaptureCells", "sourceOracleCells", "algebraCells", "rankDiagnosticCells", "bindingCells", "incrementalNumericCells", "incrementalPeakBytes", "incrementalExportBytes", "totalNumericCells", "totalPeakBytes", "totalExportBytes", "totalStructuralBytes"];
const REF_FIELDS = ["version", "scientificValueOccurrences", "referencePayloadBytes", "incrementalNumericCells", "incrementalPeakBytes", "incrementalExportBytes"];
const OLD_REF_FIELDS = ["version", "incrementalNumericCells", "incrementalPeakBytes", "incrementalExportBytes"];
function safe(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`Standard ${label} exceeds safe operational resource arithmetic.`);
  return value;
}
// Fixed ASCII keys:6 bytes/UTF16 unit plus32 each for key/value wrappers;
// safe integer values need at most16 digits. Objects receive64 bytes each.
function controls(keys: readonly string[], objects: number, version: string): number {
  return safe(objects * 64 + keys.reduce((sum, key) => sum + 6 * key.length + 64, 0) + 6 * version.length + 32, "control bytes");
}
const TARGET_CONTROLS = 4 * controls(OP_FIELDS, 2, STANDARD_OPERATIONAL_BUDGET_VERSION_V3);
const REF_VERSION = "open-ena-reference-bound-serialization-v1" as const;
// The old admission appears twice in Bound: p.reference.admission and
// p.resources.referenceAdmission. Reserve two supplemental wrappers as well
// (plan and result), plus the named outer object fields. Never rely on aliases.
const REFERENCE_CONTROLS = 2 * controls(OLD_REF_FIELDS, 1, "1") + 2 * controls(REF_FIELDS, 1, REF_VERSION)
  + controls(["reference", "resources", "referenceAdmission", "referenceSerializationAdmission"], 2, "");

/** Descriptor-safe fixed scalar envelope only; not proof of exact derivation. */
export function captureStandardOperationalAdmissionV3(input: unknown): StandardOperationalAdmissionV3 {
  const root = snapshotPlainJsonRecordV3(input, "Standard operational admission");
  const stageKeys = ["sourceCaptureCells", "sourceOracleCells", "algebraCells", "rankDiagnosticCells", "bindingCells"];
  const keys = OP_FIELDS.filter((key) => !stageKeys.includes(key));
  const exact = (record: Record<string, unknown>, expected: readonly string[]) => {
    if (Object.keys(record).length !== expected.length || expected.some((key) => !Object.hasOwn(record, key))) throw new TypeError("Standard operational admission has unexpected fields.");
  };
  exact(root, keys);
  if (root.version !== STANDARD_OPERATIONAL_BUDGET_VERSION_V3) throw new TypeError("Standard operational admission version is unsupported.");
  const stages = snapshotPlainJsonRecordV3(root.stages, "Standard operational stages");
  exact(stages, stageKeys);
  for (const [key, value] of Object.entries(stages)) safe(value as number, key);
  for (const [key, value] of Object.entries(root)) if (key !== "version" && key !== "stages") safe(value as number, key);
  return deepFreezeV3({ ...root, stages }) as unknown as StandardOperationalAdmissionV3;
}

/** Exact canonical UTF8 width, without creating a complete JSON text. Cached
 * scalar widths are charged again at EVERY occurrence (including repeated row
 * keys). Inputs are descriptor-safe; the cap stops traversal before encoding.
 */
export function canonicalJsonByteLengthV3(input: unknown, limit = MAX_ESTIMATED_PEAK_BYTES_V3 / 8): number {
  let total = 0;
  const active = new WeakSet<object>(), strings = new Map<string, number>();
  const add = (bytes: number) => { total = safe(total + bytes, "canonical JSON bytes"); if (total > limit) throw new TypeError("Standard source/plan serialization exceeds its byte admission before encoding."); };
  function stringBytes(value: string): number {
    const cached = strings.get(value); if (cached !== undefined) return cached;
    let bytes = 2;
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code === 34 || code === 92 || code === 8 || code === 9 || code === 10 || code === 12 || code === 13) bytes += 2;
      else if (code < 32) bytes += 6;
      else if (code < 128) bytes += 1;
      else if (code < 2048) bytes += 2;
      else if (code >= 0xd800 && code <= 0xdbff) {
        const next = value.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) { bytes += 4; index += 1; } else bytes += 6;
      } else bytes += code >= 0xdc00 && code <= 0xdfff ? 6 : 3;
      if (bytes > limit - total) throw new TypeError("Standard source/plan serialization exceeds its byte admission before encoding.");
    }
    strings.set(value, bytes); return bytes;
  }
  function visit(value: unknown, depth: number): void {
    if (depth > 64) throw new TypeError("Standard serialization nesting exceeds admission.");
    if (typeof value === "string") { add(stringBytes(value)); return; }
    if (value === null) { add(4); return; }
    if (typeof value === "boolean") { add(value ? 4 : 5); return; }
    if (typeof value === "number") { if (!Number.isFinite(value)) throw new TypeError("Standard serialization requires finite numbers."); add(String(Object.is(value, -0) ? 0 : value).length); return; }
    if (typeof value !== "object" || active.has(value)) throw new TypeError("Standard serialization requires acyclic JSON values.");
    active.add(value);
    try {
      if (Array.isArray(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, "length");
        const length = descriptor && "value" in descriptor ? safe(descriptor.value, "JSON array length") : NaN;
        if (!Number.isSafeInteger(length) || length > MAX_ESTIMATED_NUMERIC_CELLS_V3) throw new TypeError("Standard serialization array is not admitted.");
        add(2 + Math.max(0, length - 1));
        for (let index = 0; index < length; index += 1) {
          const entry = Object.getOwnPropertyDescriptor(value, String(index));
          if (!entry || !entry.enumerable || !("value" in entry)) throw new TypeError("Standard serialization array must have dense data entries.");
          visit(entry.value, depth + 1);
        }
        if (Reflect.ownKeys(value).length !== length + 1 || Object.getOwnPropertyDescriptor(value, "length")?.value !== length) throw new TypeError("Standard serialization array changed or has extra keys.");
      } else {
        const record = snapshotPlainJsonRecordV3(value, "Standard serialization object");
        const keys = Object.keys(record); add(2 + Math.max(0, keys.length - 1));
        for (const key of keys) { add(stringBytes(key) + 1); visit(record[key], depth + 1); }
      }
    } finally { active.delete(value); }
  }
  visit(input, 0); return total;
}

export function estimateStandardPlanSerializationAdmissionV3(input: unknown): StandardPlanSerializationAdmissionV3 {
  const root = snapshotPlainJsonRecordV3(input, "Standard plan serialization");
  const header = snapshotPlainJsonRecordV3(root.header, "Standard plan serialization header");
  const { planSerializationAdmission: _self, ...withoutSelf } = root;
  const body = { ...withoutSelf, header: { ...header, executionPlanSha256: "0".repeat(64) } };
  const version = "open-ena-standard-plan-serialization-v1" as const;
  // Charge the self-description at maximum safe integer widths. Its values do
  // not feed back into this fixed CONTROL, so no self-referential hash/size.
  const wrapper = canonicalJsonByteLengthV3({ planSerializationAdmission: { version, planJsonBytesUpper: Number.MAX_SAFE_INTEGER, serializationPeakBytes: Number.MAX_SAFE_INTEGER } });
  const planJsonBytesUpper = safe(canonicalJsonByteLengthV3(body) + wrapper - 1, "plan JSON upper bytes");
  return deepFreezeV3({ version, planJsonBytesUpper, serializationPeakBytes: safe(8 * planJsonBytesUpper, "plan serialization peak bytes") });
}

export function standardClosureWorkUnitsV3(baseline: StandardResourceEstimateV3, method: CanonicalStandardConfigV3["analysis"]["rotation"]["type"]): number {
  const t = baseline.trajectorySteps, c = baseline.codes, e = baseline.adjacencyDimensions, d = Math.min(3, e);
  const work = safe(e ** 3 + 2 * t * e * e + 4 * t * c * c + 3 * d * c ** 3 + 20 * t * e + 8 * t * c * d
    + (method === "reference" ? t * e * e + e ** 3 : 0), "scientific closure work");
  if (work > MAX_ESTIMATED_ROTATION_WORK_UNITS_V3) throw new TypeError("Standard scientific closure exceeds the fixed work budget.");
  return work;
}

/** Separate, conservative phase-overlap admission. Baseline v3.5 is unchanged.
 * The sum deliberately overlaps readiness, algebra and rank scratch; it is
 * neither measured heap nor cumulative allocator traffic/CPU instructions.
 */
export function estimateStandardOperationalAdmissionV3(config: CanonicalStandardConfigV3, baseline: StandardResourceEstimateV3, sourceProofJsonBytes: number): StandardOperationalAdmissionV3 {
  const n = baseline.rows, t = baseline.trajectorySteps, c = baseline.codes, e = baseline.adjacencyDimensions, d = Math.min(3, e);
  const method = config.analysis.rotation.type, reference = method === "reference";
  if (baseline.analysisFamily !== "standard" || baseline.blocked || c !== config.codes.length || e !== c * (c - 1) / 2) throw new TypeError("Standard operational admission requires its exact admitted baseline.");
  const compactScientificCells = safe(4 * t * e + 2 * t * d + (reference ? 2 * e : c * d + e * e + 5 * e), "compact scientific cells");
  const sourceCaptureCells = safe(6 * n * c, "source capture cells");
  const sourceOracleCells = safe(baseline.estimatedNumericCells + 2 * n * c + 2 * t * e, "source oracle cells");
  const nodeCells = reference ? t * c + c * d : 2 * t * c + (d + 1) * c * c + d * t + 5 * d * c;
  const algebraCells = safe(4 * t * e + 2 * t * d + 8 * e + nodeCells + (method === "means" ? t * e + 8 * e : 0), "algebra cells");
  const rankDiagnosticCells = reference ? safe(2 * t * e + 4 * e * e + 8 * e, "fixed projection diagnostic cells") : 0;
  const bindingCells = safe(sourceCaptureCells + 4 * compactScientificCells + sourceOracleCells + algebraCells + rankDiagnosticCells, "binding cells");
  const totalNumericCells = Math.max(baseline.estimatedNumericCells, bindingCells);
  const generatedTableKeyBytes = safe(64 * (3 * t * e + 2 * t * d + c * d + e), "generated table-key bytes");
  const resultIdentityBytes = safe(baseline.resultIdentityBytes + generatedTableKeyBytes + TARGET_CONTROLS, "result identity bytes");
  const metadataSerializationBytes = safe(8 * resultIdentityBytes, "metadata serialization bytes");
  const numericSerializationBytes = safe(192 * compactScientificCells, "numeric serialization bytes");
  // Baseline structural already contains3I0. Adding8I is intentionally
  // conservative: four UTF16 child/join/comparison texts, also covering the
  // smaller complete text + UTF8/WebCrypto-buffer overlap, without rope claims.
  const sourceProofSerializationBytes = safe(8 * safe(sourceProofJsonBytes, "source proof JSON bytes"), "source proof serialization bytes");
  const totalStructuralBytes = safe(baseline.estimatedStructuralBytes + metadataSerializationBytes + sourceProofSerializationBytes, "structural bytes");
  const totalPeakBytes = Math.max(baseline.estimatedPeakBytes, safe(baseline.estimatedWorkerMaterializationBytes + totalStructuralBytes + 8 * totalNumericCells + numericSerializationBytes, "peak bytes"));
  const totalExportBytes = Math.max(baseline.estimatedExportBytes, safe(resultIdentityBytes + 24 * compactScientificCells, "export bytes"));
  const closureWorkUnits = standardClosureWorkUnitsV3(baseline, method);
  assertCombinedStandardResourcesV3({ totalNumericCells, totalPeakBytes, totalExportBytes, totalStructuralBytes });
  return deepFreezeV3({ version: STANDARD_OPERATIONAL_BUDGET_VERSION_V3, compactScientificCells, generatedTableKeyBytes, resultIdentityBytes, numericSerializationBytes, metadataSerializationBytes, closureWorkUnits, sourceWindowVisits: baseline.estimatedWindowVisits, sourceProofJsonBytes, sourceProofSerializationBytes,
    stages: { sourceCaptureCells, sourceOracleCells, algebraCells, rankDiagnosticCells, bindingCells },
    incrementalNumericCells: totalNumericCells - baseline.estimatedNumericCells, incrementalPeakBytes: totalPeakBytes - baseline.estimatedPeakBytes, incrementalExportBytes: totalExportBytes - baseline.estimatedExportBytes,
    totalNumericCells, totalPeakBytes, totalExportBytes, totalStructuralBytes });
}

/** Accept only an independently derived old ledger for final authority.
 * A caller declaration may be used provisionally before bounded codec capture,
 * but must be exactly rederived before scientific serialization or hashing.
 */
export function estimateReferenceBoundSerializationAdmissionV3(codes: number, method: "svd" | "means", admission: ReferenceAdmissionV3): ReferenceBoundSerializationAdmissionV3 {
  const c = safe(codes, "Reference Codes"), e = safe(c * (c - 1) / 2, "Reference edges"), d = Math.min(3, e), f = method === "svd" ? e : 0;
  const r = safe(admission.incrementalExportBytes, "Reference binding export bytes");
  const scientificValueOccurrences = safe(3 * e * e + 6 * e + 3 * f + 3 * c * d, "Reference scientific JSON occurrences");
  const referencePayloadBytes = safe(4 * r + 32 * e + REFERENCE_CONTROLS, "Reference bound payload bytes");
  return deepFreezeV3({ version: REF_VERSION, scientificValueOccurrences, referencePayloadBytes, incrementalNumericCells: 0,
    incrementalPeakBytes: safe(8 * referencePayloadBytes, "Reference serialization overlap"), incrementalExportBytes: Math.max(0, referencePayloadBytes - r) });
}

export function assertCombinedStandardResourcesV3(target: Pick<StandardOperationalAdmissionV3, "totalNumericCells" | "totalPeakBytes" | "totalExportBytes" | "totalStructuralBytes">, reference?: ReferenceAdmissionV3 | null, supplement?: ReferenceBoundSerializationAdmissionV3 | null, planSerialization?: StandardPlanSerializationAdmissionV3 | null) {
  const estimatedNumericCells = safe(target.totalNumericCells + (reference?.incrementalNumericCells ?? 0), "combined numeric cells");
  const estimatedPeakBytes = safe(target.totalPeakBytes + (reference?.incrementalPeakBytes ?? 0) + (supplement?.incrementalPeakBytes ?? 0) + (planSerialization?.serializationPeakBytes ?? 0), "combined peak bytes");
  const estimatedExportBytes = safe(target.totalExportBytes + (reference?.incrementalExportBytes ?? 0) + (supplement?.incrementalExportBytes ?? 0), "combined export bytes");
  // Conservatively count all supplemental Reference text (including numerical
  // geometry text) against the unchanged structural ceiling too.
  const structural = safe(target.totalStructuralBytes + (supplement?.incrementalPeakBytes ?? 0) + (planSerialization?.serializationPeakBytes ?? 0), "combined structural bytes");
  if (estimatedNumericCells > MAX_ESTIMATED_NUMERIC_CELLS_V3 || estimatedPeakBytes > MAX_ESTIMATED_PEAK_BYTES_V3 || estimatedExportBytes > MAX_ESTIMATED_EXPORT_BYTES_V3 || structural > MAX_ESTIMATED_STRUCTURAL_BYTES_V3) throw new TypeError("Standard combined resource admission exceeds the fixed resource budget.");
  return { estimatedNumericCells, estimatedPeakBytes, estimatedExportBytes };
}
