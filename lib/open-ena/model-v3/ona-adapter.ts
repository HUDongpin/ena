import { ena, makeSet, type ENAData, type ENASet, type MakeSetOptions, type Row } from "jena-js";
import type { ENAWorkerOptions } from "jena-js/browser";
import { JENA_RUNTIME_VERSION, JENA_SOURCE_COMMIT, SAMPLE_CONFIG, type OpenEnaConfig, type OpenEnaOrderedAudit, type OpenEnaOrderedResponseNodeSummary, type ParsedDataset } from "../types";
import { buildOpenEnaOrderedAudit } from "../ordered-audit";
import { buildOpenEnaOrderedResponseNodeSummary } from "../ordered-node-summary";
import { canonicalJsonV3, deepFreezeV3, sha256CanonicalJsonV3, snapshotDenseJsonArrayV3, snapshotPlainJsonRecordV3 } from "./canonical-json";
import { captureDatasetBindingV3, compilerDatasetEnvelopeV3, exactOnaResourceEstimateV3, snapshotCompilerDatasetInputV3 } from "./compiler-dataset";
import { buildStandardSourceProofPayloadV3, decodeStandardSourceProofV3, mapRowOrderingV3, parsedDatasetFromSourceProofV3, type ExecutionPlanHeaderV3, type ResolvedExecutionRowOrderingV3, type StandardExecutionRowV3, type StandardSourceProofV3 } from "./execution-plan";
import { buildExecutionIdentityDictionaryV3, createExecutionIdentityResolverV3, resolveExecutionIdentitiesForRowsV3, type ExecutionIdentityDictionaryV3 } from "./identity";
import { runOnaScientificPreflightV3, validateOnaDatasetV3, type OnaCompilerDiagnosticV3 } from "./ona-compiler-preflight";
import { estimateOnaOperationalAdmissionV3, type OnaOperationalAdmissionV3 } from "./ona-resource-budget";
import { estimateOnaResourcesV3, MAX_ESTIMATED_PEAK_BYTES_V3, MAX_ESTIMATED_EXPORT_BYTES_V3, type OnaResourceEstimateV3 } from "./resource-budget";
import { decodeCanonicalOnaConfigV3 } from "./schema";
import { OPEN_ENA_EXECUTION_CONTRACT_VERSION_V3, OPEN_ENA_RUNTIME_POLICY_VERSION_V3, OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3, type CanonicalCodeV3, type CanonicalOnaConfigV3 } from "./types";
import type { CanonicalCodeEntryV3, CodeRepresentationBindingV3 } from "./standard-adapter";

export interface OnaCodeDictionaryV3 {
  readonly codes: readonly CanonicalCodeEntryV3[];
  readonly edges: readonly {
    readonly token: string;
    readonly sourceCodeIdentity: string;
    readonly targetCodeIdentity: string;
    readonly groundIndex: number;
    readonly responseIndex: number;
  }[];
}

export interface OnaAdapterParametersV3 {
  readonly networkType: "ordered";
  readonly unitTokenColumn: "__open_ena_unit_token";
  readonly horizonTokenColumn: "__open_ena_horizon_token";
  readonly groupTokenColumn: "__open_ena_group_token";
  readonly codeTokens: readonly string[];
  readonly model: "EndPoint";
  readonly window: { readonly type: "MovingStanzaWindow"; readonly backward: CanonicalOnaConfigV3["window"]["backward"]; readonly forward: 0 };
  readonly weightBy: "sum";
  readonly rotation: "svd";
  readonly centerAlignToOrigin: true;
  readonly nodePositionMethod: "directed";
  readonly displayDimensions: 3;
}

export interface OnaExecutionPlanHeaderV3 extends Omit<ExecutionPlanHeaderV3, "analysisFamily" | "resourceEstimate"> {
  readonly analysisFamily: "ona";
  readonly resourceEstimate: OnaResourceEstimateV3;
}

export interface OnaExecutionPlanV3 {
  readonly header: OnaExecutionPlanHeaderV3;
  readonly configuration: CanonicalOnaConfigV3;
  readonly sourceProof: StandardSourceProofV3;
  readonly identityDictionary: ExecutionIdentityDictionaryV3;
  readonly codeDictionary: OnaCodeDictionaryV3;
  readonly codeRepresentations: readonly CodeRepresentationBindingV3[];
  readonly rows: readonly StandardExecutionRowV3[];
  readonly rowOrdering: ResolvedExecutionRowOrderingV3;
  readonly horizonOrdering: { readonly type: "not-applicable"; readonly reason: "endpoint-model" };
  /** Implementation scheduling, distinct from the within-Horizon proof's lexical storage order. */
  readonly runtimeSourceRowIndices: readonly number[];
  readonly adapterParameters: OnaAdapterParametersV3;
  readonly weighting: { readonly scientific: "frequency"; readonly runtime: "sum" };
  readonly directionalMask: CanonicalOnaConfigV3["directionalMask"];
  readonly reference: null;
  readonly operationalAdmission: OnaOperationalAdmissionV3;
}

export interface InternalOnaRunResultV3 {
  readonly configuration: CanonicalOnaConfigV3;
  readonly executionPlanHeader: OnaExecutionPlanHeaderV3;
  readonly set: ENASet;
  readonly orderedAudit: OpenEnaOrderedAudit;
  readonly orderedResponseNodeSummary: OpenEnaOrderedResponseNodeSummary;
}

function same(left: unknown, right: unknown, label: string): void {
  if (canonicalJsonV3(left) !== canonicalJsonV3(right)) throw new TypeError(`ONA ${label} does not match its canonical contract.`);
}

function arrayLength(value: unknown, label: string): number {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw new TypeError(`ONA ${label} must be a plain array.`);
  const descriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (!descriptor || !("value" in descriptor) || !Number.isSafeInteger(descriptor.value) || descriptor.value < 0) throw new TypeError(`ONA ${label} has invalid length.`);
  return descriptor.value;
}

/** Declared Code order is scientific for ONA because it indexes the mask and SVD basis. */
export function buildOnaCodeDictionaryV3(definitions: readonly CanonicalCodeV3[]): OnaCodeDictionaryV3 {
  const codes = snapshotDenseJsonArrayV3(definitions, "ONA Codes").map((definition, index): CanonicalCodeEntryV3 => {
    const record = snapshotPlainJsonRecordV3(definition, "ONA Code");
    if (Object.keys(record).sort().join(",") !== "column,displayLabel" || typeof record.column !== "string" || !record.column.trim() || typeof record.displayLabel !== "string" || !record.displayLabel.trim()) throw new TypeError("ONA Code definition is invalid.");
    return { token: `__open_ena_code_v3_${String(index).padStart(3, "0")}`, sourceColumn: record.column, displayLabel: record.displayLabel, canonicalIdentity: record.column };
  });
  if (new Set(codes.map((entry) => entry.sourceColumn)).size !== codes.length) throw new TypeError("ONA Code identities must be distinct.");
  return deepFreezeV3({ codes, edges: codes.flatMap((response, responseIndex) => codes.map((ground, groundIndex) => ({
    token: `__open_ena_directed_edge_v3_${String(groundIndex).padStart(3, "0")}_${String(responseIndex).padStart(3, "0")}`,
    sourceCodeIdentity: ground.canonicalIdentity, targetCodeIdentity: response.canonicalIdentity, groundIndex, responseIndex,
  }))) });
}

function adapterParameters(config: CanonicalOnaConfigV3, dictionary: OnaCodeDictionaryV3): OnaAdapterParametersV3 {
  return { networkType: "ordered", unitTokenColumn: "__open_ena_unit_token", horizonTokenColumn: "__open_ena_horizon_token", groupTokenColumn: "__open_ena_group_token",
    codeTokens: dictionary.codes.map((entry) => entry.token), model: "EndPoint", window: { type: "MovingStanzaWindow", backward: config.window.backward, forward: 0 },
    weightBy: "sum", rotation: "svd", centerAlignToOrigin: true, nodePositionMethod: "directed", displayDimensions: 3 };
}

function runtimeOrder(config: CanonicalOnaConfigV3, rows: readonly StandardExecutionRowV3[], ordering: ResolvedExecutionRowOrderingV3): number[] {
  if (config.window.rowOrder.kind === "source-order-confirmed") return rows.map((row) => row.sourceRowIndex);
  const orderedByHorizon = new Map<string, number[]>();
  for (const sourceRowIndex of ordering.orderedSourceRowIndices) {
    const horizon = rows[sourceRowIndex].horizonToken;
    const indices = orderedByHorizon.get(horizon) ?? [];
    indices.push(sourceRowIndex); orderedByHorizon.set(horizon, indices);
  }
  return [...new Set(rows.map((row) => row.horizonToken))].flatMap((horizon) => orderedByHorizon.get(horizon)!);
}

export function onaExecutionPlanHashPayloadV3(plan: OnaExecutionPlanV3): Omit<OnaExecutionPlanV3, "header"> & { header: Omit<OnaExecutionPlanHeaderV3, "executionPlanSha256"> } {
  const { executionPlanSha256: _hash, ...header } = plan.header;
  return { ...plan, header };
}

export async function buildOnaExecutionPlanV3(datasetValue: ParsedDataset, datasetSha256: string, configurationValue: CanonicalOnaConfigV3): Promise<OnaExecutionPlanV3> {
  const envelope = compilerDatasetEnvelopeV3(datasetValue);
  const rawConfiguration = snapshotPlainJsonRecordV3(configurationValue, "ONA configuration");
  const n = arrayLength(envelope.rows, "dataset rows"), c = arrayLength(rawConfiguration.codes, "configuration Codes");
  // No Code/row enumeration before this dimension-only lower-bound admission.
  const early = estimateOnaResourcesV3({ rowCount: n, unitCount: n ? 1 : 0, horizonCount: n ? 1 : 0, codeCount: c, horizonSizes: n ? [n] : [], backward: { kind: "finite", value: 1 }, datasetSizeBytes: envelope.sizeBytes, identityPayloadBytes: 0 });
  if (early.blocked || n * c * c > 2_000_000) throw new TypeError("ONA plan exceeds the pre-materialization resource budget.");
  const configuration = decodeCanonicalOnaConfigV3(rawConfiguration);
  const capture = captureDatasetBindingV3(envelope, datasetSha256);
  // Settle hashing even if synchronous capture rejects hostile source data.
  const bindingOutcome = capture.bindingPromise.then((binding) => ({ binding }), (error: unknown) => ({ error }));
  const dataset = snapshotCompilerDatasetInputV3(envelope, capture.provisionalBinding);
  const outcome = await bindingOutcome;
  if ("error" in outcome) throw outcome.error;
  const binding = outcome.binding;
  if (await sha256CanonicalJsonV3(dataset.headers) !== binding.headerSha256) throw new TypeError("ONA source headers changed during capture.");
  const prepared = validateOnaDatasetV3(dataset, binding, configuration);
  if (!prepared.ordering || prepared.diagnostics.some((entry) => entry.severity === "error")) throw new TypeError(`ONA dataset is not executable: ${prepared.diagnostics.map((entry) => entry.id).join(", ")}`);
  const resourceEstimate = exactOnaResourceEstimateV3(dataset, configuration);
  const operationalAdmission = estimateOnaOperationalAdmissionV3(dataset, configuration, resourceEstimate);
  const scientific = runOnaScientificPreflightV3(dataset, configuration, prepared.ordering);
  if (scientific.diagnostics.some((entry) => entry.severity === "error")) throw new TypeError(`ONA scientific readiness failed: ${scientific.diagnostics.map((entry) => entry.id).join(", ")}`);
  const groupColumn = configuration.units.group.type === "stable-metadata" ? configuration.units.group.column : null;
  const identityDictionary = await buildExecutionIdentityDictionaryV3(dataset.rows, configuration.units.columns, configuration.horizons.columns, groupColumn);
  const resolver = await createExecutionIdentityResolverV3(identityDictionary);
  const rowIdentities = await resolveExecutionIdentitiesForRowsV3(dataset.rows, configuration.units.columns, configuration.horizons.columns, groupColumn, resolver);
  const codeDictionary = buildOnaCodeDictionaryV3(configuration.codes);
  const rowOrdering = mapRowOrderingV3(prepared.ordering, new Map(identityDictionary.horizons.map((entry) => [entry.canonicalJson, entry.token])));
  const tuples = new Map(rowOrdering.mappings.map((mapping) => [mapping.sourceRowIndex, mapping.orderTuple]));
  const rows: StandardExecutionRowV3[] = rowIdentities.map((identity) => ({ ...identity,
    codeValues: Object.fromEntries(codeDictionary.codes.map((code) => {
      const value = dataset.rows[identity.sourceRowIndex][code.sourceColumn];
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new TypeError("ONA Code must be a finite nonnegative number.");
      return [code.token, value];
    })), rowOrderTuple: tuples.get(identity.sourceRowIndex)!,
  }));
  const proof = buildStandardSourceProofPayloadV3(dataset, binding, configuration);
  const plan: OnaExecutionPlanV3 = {
    header: { schemaVersion: 3, analysisFamily: "ona", validationContractVersion: OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3, runtimePolicyVersion: OPEN_ENA_RUNTIME_POLICY_VERSION_V3,
      executionContractVersion: OPEN_ENA_EXECUTION_CONTRACT_VERSION_V3, datasetSha256, datasetHashKind: binding.hashKind, rowCount: rows.length, headerSha256: binding.headerSha256,
      datasetBinding: binding, configurationSha256: await sha256CanonicalJsonV3(configuration), executionPlanSha256: "", runtimeVersion: JENA_RUNTIME_VERSION, algorithmBuildSha: JENA_SOURCE_COMMIT, resourceEstimate },
    configuration, sourceProof: { ...proof, sourceProofSha256: await sha256CanonicalJsonV3(proof) }, identityDictionary, codeDictionary,
    codeRepresentations: codeDictionary.codes.map((code) => ({ runtimeToken: code.token, sourceColumn: code.sourceColumn, sourceRepresentation: "frequency", runtimeRepresentation: "number" })),
    rows, rowOrdering, horizonOrdering: { type: "not-applicable", reason: "endpoint-model" }, runtimeSourceRowIndices: runtimeOrder(configuration, rows, rowOrdering),
    adapterParameters: adapterParameters(configuration, codeDictionary), weighting: { scientific: "frequency", runtime: "sum" }, directionalMask: configuration.directionalMask, reference: null, operationalAdmission,
  };
  return deepFreezeV3({ ...plan, header: { ...plan.header, executionPlanSha256: await sha256CanonicalJsonV3(onaExecutionPlanHashPayloadV3(plan)) } });
}

export function toOnaJenaOptionsV3(plan: OnaExecutionPlanV3): ENAWorkerOptions {
  const config = decodeCanonicalOnaConfigV3(plan.configuration);
  if (plan.header.analysisFamily !== "ona" || plan.reference !== null) throw new TypeError("ONA adapter rejects a different family or Reference.");
  same(plan.directionalMask, config.directionalMask, "directional mask");
  same(plan.codeDictionary, buildOnaCodeDictionaryV3(config.codes), "declared Code/edge order");
  same(plan.adapterParameters, adapterParameters(config, plan.codeDictionary), "adapter parameters");
  same(plan.runtimeSourceRowIndices, runtimeOrder(config, plan.rows, plan.rowOrdering), "runtime row schedule");
  const p = plan.adapterParameters;
  return { rows: plan.runtimeSourceRowIndices.map((index): Row => {
    const row = plan.rows[index];
    return { [p.unitTokenColumn]: row.unitToken, [p.horizonTokenColumn]: row.horizonToken, ...(row.groupToken === null ? {} : { [p.groupTokenColumn]: row.groupToken }), ...row.codeValues };
  }), units: [p.unitTokenColumn], conversation: [p.horizonTokenColumn], metadata: config.units.group.type === "none" ? [] : [p.groupTokenColumn], codes: [...p.codeTokens],
    networkType: "ordered", model: "EndPoint", window: "MovingStanzaWindow", windowSizeBack: p.window.backward.kind === "infinity" ? Infinity : p.window.backward.value, windowSizeForward: 0,
    weightBy: "sum", rotation: { method: "svd" }, centerAlignToOrigin: true, nodePositionMethod: "directed", dimensions: 3, includeMeta: true,
    mask: plan.directionalMask.enabled.map((row) => row.map((enabled) => enabled ? 1 : 0)) };
}

export function buildOnaResponseNodeSummaryV3(plan: OnaExecutionPlanV3, rows: readonly Row[]): OpenEnaOrderedResponseNodeSummary {
  const codes = plan.codeDictionary.codes.map((entry) => entry.token);
  const config: OpenEnaConfig = { ...SAMPLE_CONFIG, analysisKind: "ona", codes, unitColumns: [plan.adapterParameters.unitTokenColumn], conversationColumns: [plan.adapterParameters.horizonTokenColumn],
    groupColumn: plan.configuration.units.group.type === "none" ? null : plan.adapterParameters.groupTokenColumn,
    directionalMask: { ...plan.directionalMask, codeOrder: codes } };
  const result = buildOpenEnaOrderedResponseNodeSummary(rows, config);
  if (!result) throw new TypeError("ONA runtime requires response-node evidence.");
  return result;
}

function result(plan: OnaExecutionPlanV3, set: ENASet, rows: readonly Row[]): InternalOnaRunResultV3 {
  const orderedAudit = buildOpenEnaOrderedAudit(set);
  if (!orderedAudit) throw new TypeError("ONA runtime requires full ordered audit evidence.");
  return { configuration: plan.configuration, executionPlanHeader: plan.header, set, orderedAudit, orderedResponseNodeSummary: buildOnaResponseNodeSummaryV3(plan, rows) };
}

/** Internal synchronous entry for a constructed/validated ONA plan, never a draft. */
export function runOnaPlanV3(plan: OnaExecutionPlanV3): InternalOnaRunResultV3 {
  const options = toOnaJenaOptionsV3(plan);
  return result(plan, ena(options), options.rows);
}

/** Worker streams exactly once; this stage only fits and extracts existing ONA evidence. */
export function completeOnaPlanFromAccumulationV3(plan: OnaExecutionPlanV3, data: ENAData, rows: readonly Row[], observer?: MakeSetOptions["observer"]): InternalOnaRunResultV3 {
  const p = plan.adapterParameters;
  const set = makeSet(data, { dimensions: p.displayDimensions, rotation: { method: p.rotation }, centerAlignToOrigin: true, nodePositionMethod: p.nodePositionMethod, ...(observer ? { observer } : {}) });
  return result(plan, set, rows);
}

export function verifyOnaScientificReadinessV3(plan: OnaExecutionPlanV3): readonly OnaCompilerDiagnosticV3[] {
  return verifyOnaScientificEvidenceV3(plan).diagnostics;
}

/**
 * Reuses the existing model-only readiness accumulation. Only the U×E matrix
 * escapes this scope; its duplicate connectionCounts table is not retained.
 * Preflight groups Horizons lexically, so prove its own first-seen Unit order
 * before comparing against the separately recorded legacy runtime schedule.
 */
export function verifyOnaScientificEvidenceV3(plan: OnaExecutionPlanV3): {
  readonly diagnostics: readonly OnaCompilerDiagnosticV3[];
  readonly unitTokens: readonly string[];
  readonly connectionMatrix: number[][];
} {
  const dataset = parsedDatasetFromSourceProofV3(plan.sourceProof);
  const prepared = validateOnaDatasetV3(dataset, plan.header.datasetBinding, plan.configuration);
  if (!prepared.ordering || prepared.diagnostics.some((entry) => entry.severity === "error")) throw new TypeError("ONA source proof is not scientifically executable.");
  const scientific = runOnaScientificPreflightV3(dataset, plan.configuration, prepared.ordering);
  if (scientific.diagnostics.some((entry) => entry.severity === "error")) throw new TypeError("ONA source proof fails scientific readiness.");
  if (!scientific.model) throw new TypeError("ONA readiness did not retain its authoritative model-only target.");
  const unitTokens = [...new Set(prepared.ordering.orderedSourceRowIndices.map((index) => plan.rows[index].unitToken))];
  if (unitTokens.length !== scientific.model.connectionMatrix.length) throw new TypeError("ONA readiness Unit order differs from its authoritative target.");
  return { diagnostics: scientific.diagnostics, unitTokens, connectionMatrix: scientific.model.connectionMatrix };
}

const ONA_PLAN_KEYS = ["header", "configuration", "sourceProof", "identityDictionary", "codeDictionary", "codeRepresentations", "rows", "rowOrdering", "horizonOrdering", "runtimeSourceRowIndices", "adapterParameters", "weighting", "directionalMask", "reference", "operationalAdmission"];

function exactKeys(record: Record<string, unknown>, keys: readonly string[], label: string): void {
  same(Object.keys(record).sort(), [...keys].sort(), `${label} shape`);
}

function integer(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new TypeError(`ONA ${label} must be a nonnegative safe integer.`);
  return value;
}

/** JSON bytes without allocating an encoded string or invoking a getter. */
function stringBytes(value: string): number {
  let bytes = 2;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 34 || code === 92 || code === 8 || code === 9 || code === 10 || code === 12 || code === 13) bytes += 2;
    else if (code < 32) bytes += 6;
    else if (code < 128) bytes += 1;
    else if (code < 2048) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) { bytes += 4; index += 1; }
    else if (code >= 0xd800 && code <= 0xdfff) bytes += 6;
    else bytes += 3;
  }
  return bytes;
}

/**
 * Detached, bounded JSON capture shared by the ONA plan/result boundaries.
 * Array length admission occurs before own-key enumeration; fixed parents are
 * read twice coherently and reused, never dereferenced a third time after await.
 */
export function captureOnaJsonV3(value: unknown, options: {
  readonly byteLimit: number;
  readonly structuralLimit: number;
  readonly records?: ReadonlyMap<object, Record<string, unknown>>;
  readonly arrayBound?: (path: string) => { maximum: number; exact?: boolean } | undefined;
  readonly recordKeys?: (path: string) => readonly string[] | undefined;
  readonly scalarKind?: (path: string) => "number" | "source" | undefined;
}): unknown {
  let bytes = 0, storage = 0;
  const active = new WeakSet<object>();
  const charge = (encoded: number, retained: number) => {
    bytes += encoded; storage += retained;
    if (!Number.isSafeInteger(bytes) || !Number.isSafeInteger(storage) || bytes > options.byteLimit || storage > options.structuralLimit) throw new TypeError("ONA input exceeds admitted capture resources.");
  };
  const visit = (input: unknown, path: string): unknown => {
    const scalar = options.scalarKind?.(path);
    if (scalar && (scalar === "number" ? typeof input !== "number" || !Number.isFinite(input) : typeof input !== "string" && typeof input !== "boolean" && (typeof input !== "number" || !Number.isFinite(input)))) throw new TypeError(`ONA ${path} must be a finite scientific scalar.`);
    const expectedArray = options.arrayBound?.(path);
    if (expectedArray && !Array.isArray(input)) throw new TypeError(`ONA ${path} must be an array.`);
    if (input === null || typeof input === "boolean") { charge(5, 8); return input; }
    if (typeof input === "string") { const width = stringBytes(input); charge(width, 2 * input.length + 8); return input; }
    if (typeof input === "number") {
      if (!Number.isFinite(input)) throw new TypeError("ONA JSON numbers must be finite; only known window fields may use the explicit Infinity literal.");
      charge(24, 8); return Object.is(input, -0) ? 0 : input;
    }
    if (typeof input !== "object" || active.has(input)) throw new TypeError("ONA input must be acyclic finite plain JSON data.");
    active.add(input);
    try {
      if (Array.isArray(input)) {
        const length = arrayLength(input, path), bound = expectedArray;
        if (bound && (bound.exact ? length !== bound.maximum : length > bound.maximum)) throw new TypeError(`ONA ${path} has inconsistent scientific cardinality.`);
        // The output slots alone must fit before any input indices are visited.
        if (length * 8 + storage > options.structuralLimit || length * 2 + bytes > options.byteLimit) throw new TypeError(`ONA ${path} exceeds pre-traversal array admission.`);
        if (arrayLength(input, path) !== length) throw new TypeError(`ONA ${path}.length changed during capture.`);
        const ownKeys = Reflect.ownKeys(input);
        if (ownKeys.length !== length + 1) throw new TypeError(`ONA ${path} must be dense without extra properties.`);
        const entries = new Array<unknown>(length);
        for (const key of ownKeys) {
          if (key === "length") continue; // Already admitted twice; never read it a third time.
          if (typeof key !== "string" || !/^(0|[1-9]\d*)$/u.test(key) || Number(key) >= length) throw new TypeError(`ONA ${path} contains a non-index key.`);
          const descriptor = Object.getOwnPropertyDescriptor(input, key);
          if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw new TypeError(`ONA ${path}[${key}] must be an own data property.`);
          entries[Number(key)] = descriptor.value;
        }
        charge(length + 2, length * 8 + 24);
        return entries.map((entry, index) => visit(entry, `${path}[${index}]`));
      }
      const known = options.records?.get(input);
      const record = known ?? snapshotPlainJsonRecordV3(input, `ONA ${path}`);
      const expectedKeys = options.recordKeys?.(path);
      if (expectedKeys) exactKeys(record, expectedKeys, path);
      if (!known) {
        const next = snapshotPlainJsonRecordV3(input, `ONA ${path}`);
        exactKeys(next, Object.keys(record), path);
        for (const key of Object.keys(record)) if (!Object.is(record[key], next[key])) throw new TypeError(`ONA ${path}.${key} changed during capture.`);
      }
      charge(2, 64);
      const output: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(record)) {
        charge(stringBytes(key) + 2, 2 * key.length + 16);
        Object.defineProperty(output, key, { value: visit(entry, `${path}.${key}`), enumerable: true, configurable: true, writable: true });
      }
      return output;
    } finally { active.delete(input); }
  };
  return visit(value, "$");
}

export function captureOnaExecutionPlanInputV3(input: unknown): unknown {
  const records = new Map<object, Record<string, unknown>>();
  const read = (value: unknown, label: string) => {
    const first = snapshotPlainJsonRecordV3(value, `ONA ${label}`);
    const second = snapshotPlainJsonRecordV3(value, `ONA ${label}`);
    exactKeys(second, Object.keys(first), label);
    for (const key of Object.keys(first)) if (!Object.is(first[key], second[key])) throw new TypeError(`ONA ${label} changed during admission.`);
    records.set(value as object, second); return second;
  };
  const root = read(input, "plan"); exactKeys(root, ONA_PLAN_KEYS, "plan");
  const header = read(root.header, "header"), config = read(root.configuration, "configuration");
  if (header.analysisFamily !== "ona" || config.analysisFamily !== "ona" || root.reference !== null) throw new TypeError("ONA plan has a different family or forbidden Reference.");
  const n = integer(header.rowCount, "row count"), c = arrayLength(config.codes, "configuration Codes"), e = c * c;
  const proof = read(root.sourceProof, "source proof"), dataset = read(proof.dataset, "source dataset");
  const size = integer(dataset.sizeBytes, "dataset bytes");
  const early = estimateOnaResourcesV3({ rowCount: n, unitCount: n ? 1 : 0, horizonCount: n ? 1 : 0, codeCount: c, horizonSizes: n ? [n] : [], backward: { kind: "finite", value: 1 }, datasetSizeBytes: size, identityPayloadBytes: 0 });
  if (early.blocked || n * e > 2_000_000) throw new TypeError("ONA plan exceeds pre-traversal resource admission.");
  const admission = read(root.operationalAdmission, "operational admission");
  const byteLimit = integer(admission.totalExportBytes, "export admission"), structuralLimit = integer(admission.totalPeakBytes, "peak admission");
  if (byteLimit > MAX_ESTIMATED_EXPORT_BYTES_V3 || structuralLimit > MAX_ESTIMATED_PEAK_BYTES_V3) throw new TypeError("ONA plan exceeds a fixed resource hard limit.");
  const bound = (path: string): { maximum: number; exact?: boolean } | undefined => {
    if (["$.rows", "$.sourceProof.rows", "$.runtimeSourceRowIndices", "$.rowOrdering.mappings", "$.rowOrdering.orderedSourceRowIndices"].includes(path)) return { maximum: n, exact: true };
    if (["$.configuration.codes", "$.codeDictionary.codes", "$.codeRepresentations", "$.adapterParameters.codeTokens", "$.directionalMask.codeOrder", "$.configuration.directionalMask.codeOrder", "$.directionalMask.enabled", "$.configuration.directionalMask.enabled"].includes(path) || /^\$\.(configuration\.)?directionalMask\.enabled\[\d+\]$/u.test(path)) return { maximum: c, exact: true };
    if (path === "$.codeDictionary.edges") return { maximum: e, exact: true };
    if (/^\$\.identityDictionary\.(units|horizons|groups)$/u.test(path)) return { maximum: n };
    return undefined;
  };
  const codeTokens = Array.from({ length: c }, (_, index) => `__open_ena_code_v3_${String(index).padStart(3, "0")}`);
  return captureOnaJsonV3(input, { byteLimit, structuralLimit, records, arrayBound: bound,
    scalarKind(path) {
      if (/^\$\.rows\[\d+\]\.codeValues\./u.test(path)) return "number";
      if (/^\$\.sourceProof\.rows\[\d+\]\.values\./u.test(path)) return "source";
      return undefined;
    },
    recordKeys(path) {
      if (/^\$\.rows\[\d+\]$/u.test(path)) return ["sourceRowIndex", "unitToken", "horizonToken", "groupToken", "codeValues", "rowOrderTuple"];
      if (/^\$\.rows\[\d+\]\.codeValues$/u.test(path)) return codeTokens;
      if (/^\$\.sourceProof\.rows\[\d+\]$/u.test(path)) return ["sourceRowIndex", "values"];
      if (path === "$.configuration.model") return ["type"];
      if (path === "$.configuration.rotation") return ["type", "centerAlignToOrigin"];
      if (path === "$.configuration.weighting") return ["type", "engineMethod"];
      if (path === "$.configuration.window") return ["type", "backward", "forward", "rowOrder"];
      return undefined;
    },
  });
}

/** Reconstruct every plan claim from one detached selected-source proof. */
export async function validateOnaExecutionPlanV3(input: unknown): Promise<OnaExecutionPlanV3> {
  const captured = captureOnaExecutionPlanInputV3(input);
  const record = snapshotPlainJsonRecordV3(captured, "ONA captured plan");
  const configuration = decodeCanonicalOnaConfigV3(record.configuration);
  const header = snapshotPlainJsonRecordV3(record.header, "ONA captured header");
  if (typeof header.datasetSha256 !== "string" || typeof header.headerSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(header.datasetSha256) || !/^[a-f0-9]{64}$/u.test(header.headerSha256)) throw new TypeError("ONA header hashes must be lowercase SHA-256.");
  const bindingValue = snapshotPlainJsonRecordV3(header.datasetBinding, "ONA dataset binding");
  const binding = { hashKind: header.datasetHashKind as OnaExecutionPlanHeaderV3["datasetHashKind"], normalizedTableSha256: header.datasetSha256, rowCount: integer(header.rowCount, "row count"), headerSha256: header.headerSha256 };
  same(bindingValue, binding, "dataset/header binding");
  const source = decodeStandardSourceProofV3(record.sourceProof, configuration, binding, binding.rowCount);
  const rebuilt = await buildOnaExecutionPlanV3(parsedDatasetFromSourceProofV3(source), binding.normalizedTableSha256, configuration);
  same(captured, rebuilt, "complete source-derived execution plan");
  return rebuilt;
}
