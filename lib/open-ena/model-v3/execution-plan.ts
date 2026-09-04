import type { RotationSet } from "jena-js";

import {
  canonicalJsonV3,
  deepFreezeV3,
  sha256CanonicalJsonV3,
  snapshotDenseJsonArrayV3,
  snapshotPlainJsonRecordV3,
} from "./canonical-json";
import type { ReadyStandardCompileResultV3 } from "./compiler";
import {
  compilerDatasetEnvelopeV3,
  exactStandardResourceEstimateV3,
  snapshotCompilerDatasetInputV3,
} from "./compiler-dataset";
import {
  MODEL_DIAGNOSTIC_IDS_V3,
} from "./diagnostics";
import type {
  ModelCapabilityV3,
  ModelDiagnosticV3,
} from "./diagnostics";
import {
  buildExecutionIdentityDictionaryV3,
  scalarIdentityV3,
  validateExecutionIdentityDictionaryV3,
} from "./identity";
import type {
  ExecutionIdentityDictionaryV3,
} from "./identity";
import {
  resolveHorizonOrderV3,
  resolveRowOrderV3,
} from "./ordering";
import type {
  ResolvedSourceOrderBindingV3,
  ResolvedHorizonOrderingV3 as SourceResolvedHorizonOrderingV3,
  ResolvedRowOrderingV3 as SourceResolvedRowOrderingV3,
  TextCollationBindingV3,
} from "./ordering";
import {
  RESOURCE_BUDGET_VERSION_V3,
  estimateStandardResourcesV3,
} from "./resource-budget";
import type { StandardResourceEstimateV3 } from "./resource-budget";
import { decodeCanonicalStandardConfigV3 } from "./schema";
import {
  buildCodeRepresentationBindingsV3,
  buildStandardCodeDictionaryV3,
  materializeStandardCodesV3,
} from "./standard-adapter";
import type {
  CodeRepresentationBindingV3,
  StandardCodeDictionaryV3,
} from "./standard-adapter";
import {
  OPEN_ENA_EXECUTION_CONTRACT_VERSION_V3,
  OPEN_ENA_RUNTIME_POLICY_VERSION_V3,
  OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3,
} from "./types";
import type {
  BackwardExtentV3,
  CanonicalRowOrderV3,
  CanonicalStandardConfigV3,
  DatasetBindingV3,
  ForwardExtentV3,
  StandardModelTypeV3,
  ValidatedReferenceExecutionBindingV3,
} from "./types";
import {
  datasetHashKindFor,
  JENA_RUNTIME_VERSION,
  JENA_SOURCE_COMMIT,
} from "../types";
import type { DatasetHashKind, ParsedDataset } from "../types";

const LOWERCASE_SHA256_V3 = /^[a-f0-9]{64}$/u;
const LOWERCASE_GIT_SHA_V3 = /^[a-f0-9]{40}$/u;
const CODE_TOKEN_PATTERN_V3 = /^__open_ena_code_v3_\d{3,}$/u;
const UNIT_TOKEN_PATTERN_V3 = /^__open_ena_unit_v3_\d{6,}$/u;
const HORIZON_TOKEN_PATTERN_V3 = /^__open_ena_horizon_v3_\d{6,}$/u;
const GROUP_TOKEN_PATTERN_V3 = /^__open_ena_group_v3_\d{6,}$/u;
const own = Object.prototype.hasOwnProperty;

const MODEL_CAPABILITIES_V3: readonly ModelCapabilityV3[] = Object.freeze([
  "build-model",
  "export-current-model",
  "export-reference",
  "group-inference",
  "trajectory-inference",
  "longitudinal-comparison",
  "ai-interpretation",
]);

const DIAGNOSTIC_SEVERITIES_V3 = new Set(["error", "warning", "information"]);
const DIAGNOSTIC_SCOPES_V3 = new Set([
  "dataset",
  "units",
  "horizons",
  "windows",
  "codes",
  "rotation",
  "reference",
  "resources",
  "migration",
]);
const DIAGNOSTIC_IDS_V3 = new Set<string>(MODEL_DIAGNOSTIC_IDS_V3);

type ResolvedOrderValueV3 = string | number;

export type NotApplicableOrderingV3 =
  | { readonly type: "not-applicable"; readonly reason: "conversation-window" }
  | { readonly type: "not-applicable"; readonly reason: "endpoint-model" };

export interface ResolvedExecutionRowOrderingV3 {
  readonly type: "within-horizon-order";
  readonly requestedPolicy: CanonicalRowOrderV3;
  readonly mappings: ReadonlyArray<{
    readonly sourceRowIndex: number;
    readonly horizonToken: string;
    readonly orderTuple: readonly ResolvedOrderValueV3[];
    readonly withinHorizonOrdinal: number;
  }>;
  readonly orderedSourceRowIndices: readonly number[];
  readonly sourceOrderBinding: ResolvedSourceOrderBindingV3 | null;
  readonly textCollationBindings: readonly TextCollationBindingV3[];
}

export interface ResolvedExecutionHorizonOrderingV3 {
  readonly type: "trajectory-horizon-order";
  readonly requestedPolicy: CanonicalRowOrderV3;
  readonly horizonTuples: ReadonlyArray<{
    readonly horizonToken: string;
    readonly orderTuple: readonly ResolvedOrderValueV3[];
  }>;
  readonly unitSequences: ReadonlyArray<{
    readonly unitToken: string;
    readonly steps: ReadonlyArray<{
      readonly horizonToken: string;
      readonly trajectoryOrdinal: number;
    }>;
  }>;
  readonly implementationHorizonOrder: readonly string[];
  readonly sourceOrderBinding: ResolvedSourceOrderBindingV3 | null;
  readonly textCollationBindings: readonly TextCollationBindingV3[];
}

export interface StandardExecutionRowV3 {
  readonly sourceRowIndex: number;
  readonly unitToken: string;
  readonly horizonToken: string;
  readonly groupToken: string | null;
  readonly codeValues: Readonly<Record<string, number>>;
  readonly rowOrderTuple?: readonly ResolvedOrderValueV3[];
  readonly horizonOrderTuple?: readonly ResolvedOrderValueV3[];
}

export interface StandardAdapterParametersV3 {
  readonly networkType: "standard";
  readonly unitTokenColumn: "__open_ena_unit_token";
  readonly horizonTokenColumn: "__open_ena_horizon_token";
  readonly codeTokens: readonly string[];
  readonly model: StandardModelTypeV3;
  readonly window:
    | { readonly type: "Conversation" }
    | {
        readonly type: "MovingStanzaWindow";
        readonly backward: BackwardExtentV3;
        readonly forward: ForwardExtentV3;
      };
  readonly weightBy: "binary" | "sum";
  readonly displayDimensions: 3;
}

export interface ExecutionPlanHeaderV3 {
  readonly schemaVersion: 3;
  readonly validationContractVersion: typeof OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3;
  readonly runtimePolicyVersion: typeof OPEN_ENA_RUNTIME_POLICY_VERSION_V3;
  readonly executionContractVersion: typeof OPEN_ENA_EXECUTION_CONTRACT_VERSION_V3;
  readonly analysisFamily: "standard";
  readonly datasetSha256: string;
  readonly datasetHashKind: DatasetHashKind;
  readonly rowCount: number;
  readonly headerSha256: string;
  readonly datasetBinding: DatasetBindingV3;
  readonly configurationSha256: string;
  readonly executionPlanSha256: string;
  readonly runtimeVersion: typeof JENA_RUNTIME_VERSION;
  readonly algorithmBuildSha: typeof JENA_SOURCE_COMMIT;
  readonly resourceEstimate: StandardResourceEstimateV3;
}

export interface StandardExecutionPlanV3 {
  readonly header: ExecutionPlanHeaderV3;
  readonly configuration: CanonicalStandardConfigV3;
  readonly identityDictionary: ExecutionIdentityDictionaryV3;
  readonly codeDictionary: StandardCodeDictionaryV3;
  readonly codeRepresentations: readonly CodeRepresentationBindingV3[];
  readonly rows: readonly StandardExecutionRowV3[];
  readonly rowOrdering: ResolvedExecutionRowOrderingV3 | NotApplicableOrderingV3;
  readonly horizonOrdering: ResolvedExecutionHorizonOrderingV3 | NotApplicableOrderingV3;
  readonly adapterParameters: StandardAdapterParametersV3;
  readonly weighting: {
    readonly scientific: "binary" | "frequency";
    readonly runtime: "binary" | "sum";
  };
  readonly reference: ValidatedReferenceExecutionBindingV3 | null;
}

export type OpenEnaExecutionPlanV3 = StandardExecutionPlanV3;
export type { ValidatedReferenceExecutionBindingV3 } from "./types";

type PromiseOutcomeV3<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: unknown };

function settlePromiseV3<T>(promise: Promise<T>): Promise<PromiseOutcomeV3<T>> {
  return promise.then(
    (value) => ({ ok: true, value }),
    (error: unknown) => ({ ok: false, error }),
  );
}

function outcomeValueV3<T>(outcome: PromiseOutcomeV3<T>): T {
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}

function codeUnitCompareV3(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function exactKeysV3(record: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(record).sort(codeUnitCompareV3);
  const wanted = [...expected].sort(codeUnitCompareV3);
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} has an invalid shape.`);
  }
}

function exactOptionalKeysV3(
  record: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): void {
  const keys = Object.keys(record);
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !own.call(record, key)) || keys.some((key) => !allowed.has(key))) {
    throw new TypeError(`${label} has an invalid shape.`);
  }
}

function snapshotJsonValueV3(value: unknown): unknown {
  return JSON.parse(canonicalJsonV3(value)) as unknown;
}

function plainRecordV3(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  return value as Record<string, unknown>;
}

function denseArrayV3(value: unknown, label: string): unknown[] {
  return snapshotDenseJsonArrayV3(value, label);
}

function lowercaseSha256V3(value: unknown, label: string): string {
  if (typeof value !== "string" || !LOWERCASE_SHA256_V3.test(value)) {
    throw new TypeError(`${label} must be a lowercase 64-hex SHA-256 digest.`);
  }
  return value;
}

function nonblankStringV3(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a nonblank string.`);
  }
  return value;
}

function nonnegativeSafeIntegerV3(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a nonnegative safe integer.`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function finiteNumberV3(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite.`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function datasetHashKindV3(value: unknown, label: string): DatasetHashKind {
  if (value === "normalized-utf8-text-sha256"
    || value === "normalized-utf8-csv-text-sha256"
    || value === "canonical-first-xlsx-worksheet-v1-sha256") return value;
  throw new TypeError(`${label} is unsupported.`);
}

function datasetBindingV3(value: unknown, label: string): DatasetBindingV3 {
  const record = plainRecordV3(value, label);
  exactKeysV3(record, ["hashKind", "normalizedTableSha256", "rowCount", "headerSha256"], label);
  return {
    hashKind: datasetHashKindV3(record.hashKind, `${label}.hashKind`),
    normalizedTableSha256: lowercaseSha256V3(record.normalizedTableSha256, `${label}.normalizedTableSha256`),
    rowCount: nonnegativeSafeIntegerV3(record.rowCount, `${label}.rowCount`),
    headerSha256: lowercaseSha256V3(record.headerSha256, `${label}.headerSha256`),
  };
}

const STANDARD_RESOURCE_KEYS_V3 = [
  "version",
  "analysisFamily",
  "rows",
  "units",
  "horizons",
  "windowPartitions",
  "codes",
  "adjacencyDimensions",
  "datasetSizeBytes",
  "identityPayloadBytes",
  "aggregateStateUpperBound",
  "estimatedStateCount",
  "estimatedStructuralBytes",
  "estimatedForwardBufferRows",
  "estimatedRetainedWindowRows",
  "estimatedWindowStateCells",
  "estimatedWindowVisits",
  "estimatedNumericCells",
  "estimatedWorkerMaterializationBytes",
  "estimatedExportBytes",
  "estimatedPeakBytes",
  "blocked",
  "blockedReasons",
  "estimatedRotationWorkUnits",
  "estimatedRotationMatrixBytes",
  "trajectorySteps",
] as const;

function standardResourceEstimateV3(value: unknown, label: string): StandardResourceEstimateV3 {
  const record = plainRecordV3(value, label);
  exactKeysV3(record, STANDARD_RESOURCE_KEYS_V3, label);
  if (record.version !== RESOURCE_BUDGET_VERSION_V3 || record.analysisFamily !== "standard") {
    throw new TypeError(`${label} has an unsupported resource contract.`);
  }
  const blockedReasons = denseArrayV3(record.blockedReasons, `${label}.blockedReasons`);
  if (record.blocked !== false || blockedReasons.length !== 0) {
    throw new TypeError(`${label} must be an admitted, unblocked Standard estimate.`);
  }
  const integers = STANDARD_RESOURCE_KEYS_V3.filter((key) => ![
    "version", "analysisFamily", "blocked", "blockedReasons",
  ].includes(key));
  const result: Record<string, unknown> = {
    version: RESOURCE_BUDGET_VERSION_V3,
    analysisFamily: "standard",
  };
  for (const key of integers) result[key] = nonnegativeSafeIntegerV3(record[key], `${label}.${key}`);
  result.blocked = false;
  result.blockedReasons = [];
  return result as unknown as StandardResourceEstimateV3;
}

function diagnosticV3(value: unknown, index: number): ModelDiagnosticV3 {
  const label = `compileResult.diagnostics[${index}]`;
  const record = plainRecordV3(value, label);
  exactOptionalKeysV3(
    record,
    ["id", "severity", "scope", "summary", "detail", "blocks"],
    ["fieldPath", "evidence", "suggestedActions"],
    label,
  );
  if (typeof record.id !== "string" || !DIAGNOSTIC_IDS_V3.has(record.id)) {
    throw new TypeError(`${label}.id is unsupported.`);
  }
  if (typeof record.severity !== "string" || !DIAGNOSTIC_SEVERITIES_V3.has(record.severity)) {
    throw new TypeError(`${label}.severity is unsupported.`);
  }
  if (record.severity === "error") throw new TypeError("A ready compile result cannot contain error diagnostics.");
  if (typeof record.scope !== "string" || !DIAGNOSTIC_SCOPES_V3.has(record.scope)) {
    throw new TypeError(`${label}.scope is unsupported.`);
  }
  nonblankStringV3(record.summary, `${label}.summary`);
  nonblankStringV3(record.detail, `${label}.detail`);
  if (own.call(record, "fieldPath")) nonblankStringV3(record.fieldPath, `${label}.fieldPath`);
  const blocks = denseArrayV3(record.blocks, `${label}.blocks`);
  const normalizedBlocks = blocks.map((block, blockIndex) => {
    if (typeof block !== "string" || !MODEL_CAPABILITIES_V3.includes(block as ModelCapabilityV3)) {
      throw new TypeError(`${label}.blocks[${blockIndex}] is unsupported.`);
    }
    return block as ModelCapabilityV3;
  });
  if (new Set(normalizedBlocks).size !== normalizedBlocks.length) {
    throw new TypeError(`${label}.blocks must not contain duplicates.`);
  }
  if (normalizedBlocks.includes("build-model")) {
    throw new TypeError("A ready compile result cannot block model construction.");
  }
  if (own.call(record, "evidence")) {
    const evidence = plainRecordV3(record.evidence, `${label}.evidence`);
    exactKeysV3(evidence, ["totalCount", "sampleLimit", "samples", "truncated"], `${label}.evidence`);
    const totalCount = nonnegativeSafeIntegerV3(evidence.totalCount, `${label}.evidence.totalCount`);
    if (evidence.sampleLimit !== 5 || typeof evidence.truncated !== "boolean") {
      throw new TypeError(`${label}.evidence has an unsupported bounded-evidence contract.`);
    }
    const samples = denseArrayV3(evidence.samples, `${label}.evidence.samples`);
    if (samples.length > 5 || samples.length > totalCount
      || evidence.truncated !== (totalCount > samples.length)) {
      throw new TypeError(`${label}.evidence has inconsistent sample counts.`);
    }
    for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
      const sample = plainRecordV3(samples[sampleIndex], `${label}.evidence.samples[${sampleIndex}]`);
      exactOptionalKeysV3(sample, ["detail"], ["rowIndex", "identity"], `${label}.evidence.samples[${sampleIndex}]`);
      nonblankStringV3(sample.detail, `${label}.evidence.samples[${sampleIndex}].detail`);
      if (own.call(sample, "rowIndex")) {
        nonnegativeSafeIntegerV3(sample.rowIndex, `${label}.evidence.samples[${sampleIndex}].rowIndex`);
      }
      if (own.call(sample, "identity")) {
        nonblankStringV3(sample.identity, `${label}.evidence.samples[${sampleIndex}].identity`);
      }
    }
  }
  if (own.call(record, "suggestedActions")) {
    const actions = denseArrayV3(record.suggestedActions, `${label}.suggestedActions`);
    for (let actionIndex = 0; actionIndex < actions.length; actionIndex += 1) {
      const action = plainRecordV3(actions[actionIndex], `${label}.suggestedActions[${actionIndex}]`);
      exactKeysV3(action, ["id", "label", "confirmationText", "confirmationRequired", "patch"], `${label}.suggestedActions[${actionIndex}]`);
      if (!["exclude-code", "replace-row-order", "replace-horizon-order", "select-endpoint", "select-svd", "select-reference", "clear-group"].includes(action.id as string)
        || action.confirmationRequired !== true) {
        throw new TypeError(`${label}.suggestedActions[${actionIndex}] is unsupported.`);
      }
      nonblankStringV3(action.label, `${label}.suggestedActions[${actionIndex}].label`);
      nonblankStringV3(action.confirmationText, `${label}.suggestedActions[${actionIndex}].confirmationText`);
      const patch = plainRecordV3(action.patch, `${label}.suggestedActions[${actionIndex}].patch`);
      if (patch.type === "exclude-code") {
        exactKeysV3(patch, ["type", "code"], `${label}.suggestedActions[${actionIndex}].patch`);
        nonblankStringV3(patch.code, `${label}.suggestedActions[${actionIndex}].patch.code`);
      } else if (patch.type === "replace-row-order" || patch.type === "replace-horizon-order") {
        exactKeysV3(patch, ["type", "value"], `${label}.suggestedActions[${actionIndex}].patch`);
        plainRecordV3(patch.value, `${label}.suggestedActions[${actionIndex}].patch.value`);
      } else if (patch.type === "select-model") {
        exactKeysV3(patch, ["type", "value"], `${label}.suggestedActions[${actionIndex}].patch`);
        if (!["EndPoint", "SeparateTrajectory", "AccumulatedTrajectory"].includes(patch.value as string)) {
          throw new TypeError(`${label}.suggestedActions[${actionIndex}] has an invalid model patch.`);
        }
      } else if (patch.type === "select-rotation") {
        exactKeysV3(patch, ["type", "value"], `${label}.suggestedActions[${actionIndex}].patch`);
        if (patch.value !== "svd" && patch.value !== "reference") {
          throw new TypeError(`${label}.suggestedActions[${actionIndex}] has an invalid rotation patch.`);
        }
      } else if (patch.type === "clear-group") {
        exactKeysV3(patch, ["type"], `${label}.suggestedActions[${actionIndex}].patch`);
      } else {
        throw new TypeError(`${label}.suggestedActions[${actionIndex}] has an unsupported patch.`);
      }
    }
  }
  return record as unknown as ModelDiagnosticV3;
}

function intrinsicCapabilityBlocksV3(config: CanonicalStandardConfigV3): Set<ModelCapabilityV3> {
  const blocked = new Set<ModelCapabilityV3>();
  if (config.units.group.type === "none") blocked.add("group-inference");
  if (config.analysis.model.type === "EndPoint") {
    blocked.add("trajectory-inference");
    blocked.add("longitudinal-comparison");
  } else {
    blocked.add("export-reference");
  }
  if (config.analysis.rotation.type === "reference") blocked.add("export-reference");
  return blocked;
}

function capabilityStatusV3(
  value: unknown,
  config: CanonicalStandardConfigV3,
  diagnostics: readonly ModelDiagnosticV3[],
): ReadyStandardCompileResultV3["capabilityStatus"] {
  const record = plainRecordV3(value, "compileResult.capabilityStatus");
  exactKeysV3(record, MODEL_CAPABILITIES_V3, "compileResult.capabilityStatus");
  const blocked = intrinsicCapabilityBlocksV3(config);
  for (const diagnostic of diagnostics) {
    for (const capability of diagnostic.blocks) blocked.add(capability);
  }
  for (const capability of MODEL_CAPABILITIES_V3) {
    const expected = blocked.has(capability) ? "blocked" : "available";
    if (record[capability] !== expected) {
      throw new TypeError(`compileResult.capabilityStatus.${capability} is inconsistent.`);
    }
  }
  if (record["build-model"] !== "available") {
    throw new TypeError("A ready compile result must permit model construction.");
  }
  return record as ReadyStandardCompileResultV3["capabilityStatus"];
}

interface CapturedReadyCompileV3 {
  readonly draftFingerprint: string;
  readonly datasetBinding: DatasetBindingV3;
  readonly canonicalConfiguration: CanonicalStandardConfigV3;
  readonly configurationSha256: string;
  readonly diagnostics: readonly ModelDiagnosticV3[];
  readonly capabilityStatus: ReadyStandardCompileResultV3["capabilityStatus"];
  readonly resourceEstimate: StandardResourceEstimateV3;
}

function captureReadyCompileResultV3(value: unknown): CapturedReadyCompileV3 {
  const snapshot = plainRecordV3(snapshotJsonValueV3(value), "compileResult");
  exactKeysV3(snapshot, [
    "status",
    "draftFingerprint",
    "datasetBinding",
    "canonicalConfiguration",
    "configurationSha256",
    "diagnostics",
    "capabilityStatus",
    "resourceEstimate",
  ], "compileResult");
  if (snapshot.status !== "ready") throw new TypeError("compileResult must be genuinely ready.");
  const canonicalConfiguration = decodeCanonicalStandardConfigV3(snapshot.canonicalConfiguration);
  const diagnostics = denseArrayV3(snapshot.diagnostics, "compileResult.diagnostics")
    .map(diagnosticV3);
  return {
    draftFingerprint: lowercaseSha256V3(snapshot.draftFingerprint, "compileResult.draftFingerprint"),
    datasetBinding: datasetBindingV3(snapshot.datasetBinding, "compileResult.datasetBinding"),
    canonicalConfiguration,
    configurationSha256: lowercaseSha256V3(snapshot.configurationSha256, "compileResult.configurationSha256"),
    diagnostics,
    capabilityStatus: capabilityStatusV3(snapshot.capabilityStatus, canonicalConfiguration, diagnostics),
    resourceEstimate: standardResourceEstimateV3(snapshot.resourceEstimate, "compileResult.resourceEstimate"),
  };
}

function exactJsonEqualV3(left: unknown, right: unknown, label: string): void {
  if (canonicalJsonV3(left) !== canonicalJsonV3(right)) {
    throw new TypeError(`${label} does not match its canonical source.`);
  }
}

function canonicalIdentityJsonForRowV3(
  row: Record<string, unknown>,
  columns: readonly string[],
  label: string,
): string {
  return canonicalJsonV3({
    fields: columns.map((column) => {
      const descriptor = Object.getOwnPropertyDescriptor(row, column);
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
        throw new TypeError(`${label}.${column} must be an own enumerable data property.`);
      }
      return { column, value: scalarIdentityV3(descriptor.value, `${label}.${column}`) };
    }),
  });
}

function tokenByCanonicalJsonV3(
  entries: ExecutionIdentityDictionaryV3["units"],
  label: string,
): Map<string, string> {
  const output = new Map<string, string>();
  for (const entry of entries) {
    if (output.has(entry.canonicalJson)) throw new TypeError(`${label} contains a duplicate canonical identity.`);
    output.set(entry.canonicalJson, entry.token);
  }
  return output;
}

function requiredTokenV3(mapping: ReadonlyMap<string, string>, canonicalJson: string, label: string): string {
  const token = mapping.get(canonicalJson);
  if (token === undefined) throw new TypeError(`${label} is absent from the execution identity dictionary.`);
  return token;
}

function mapRowOrderingV3(
  ordering: SourceResolvedRowOrderingV3,
  horizonTokens: ReadonlyMap<string, string>,
): ResolvedExecutionRowOrderingV3 {
  return {
    type: "within-horizon-order",
    requestedPolicy: snapshotJsonValueV3(ordering.requestedPolicy) as CanonicalRowOrderV3,
    mappings: ordering.mappings.map((entry) => ({
      sourceRowIndex: entry.sourceRowIndex,
      horizonToken: requiredTokenV3(horizonTokens, entry.horizonKey, "Resolved row Horizon"),
      orderTuple: [...entry.orderTuple],
      withinHorizonOrdinal: entry.withinHorizonOrdinal,
    })),
    orderedSourceRowIndices: [...ordering.orderedSourceRowIndices],
    sourceOrderBinding: ordering.sourceOrderBinding,
    textCollationBindings: ordering.textCollationBindings,
  };
}

function mapHorizonOrderingV3(
  ordering: SourceResolvedHorizonOrderingV3,
  requestedPolicy: CanonicalRowOrderV3,
  unitTokens: ReadonlyMap<string, string>,
  horizonTokens: ReadonlyMap<string, string>,
): ResolvedExecutionHorizonOrderingV3 {
  return {
    type: "trajectory-horizon-order",
    requestedPolicy,
    horizonTuples: ordering.horizonTuples.map((entry) => ({
      horizonToken: requiredTokenV3(horizonTokens, entry.horizonKey, "Resolved trajectory Horizon"),
      orderTuple: [...entry.orderTuple],
    })),
    unitSequences: ordering.unitSequences.map((sequence) => ({
      unitToken: requiredTokenV3(unitTokens, sequence.unitKey, "Resolved trajectory Unit"),
      steps: sequence.steps.map((step) => ({
        horizonToken: requiredTokenV3(horizonTokens, step.horizonKey, "Resolved trajectory Horizon step"),
        trajectoryOrdinal: step.trajectoryOrdinal,
      })),
    })),
    implementationHorizonOrder: ordering.implementationHorizonOrder.map((horizonKey) => (
      requiredTokenV3(horizonTokens, horizonKey, "Implementation Horizon order")
    )),
    sourceOrderBinding: ordering.sourceOrderBinding,
    textCollationBindings: ordering.textCollationBindings,
  };
}

function safeCodeValuesV3(
  values: Readonly<Record<string, number>>,
  dictionary: StandardCodeDictionaryV3,
): Readonly<Record<string, number>> {
  const output = Object.create(null) as Record<string, number>;
  for (const code of dictionary.codes) {
    Object.defineProperty(output, code.token, {
      value: values[code.token],
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return output;
}

function buildAdapterParametersV3(
  config: CanonicalStandardConfigV3,
  dictionary: StandardCodeDictionaryV3,
): StandardAdapterParametersV3 {
  return {
    networkType: "standard",
    unitTokenColumn: "__open_ena_unit_token",
    horizonTokenColumn: "__open_ena_horizon_token",
    codeTokens: dictionary.codes.map((entry) => entry.token),
    model: config.analysis.model.type,
    window: config.window.type === "Conversation"
      ? { type: "Conversation" }
      : {
          type: "MovingStanzaWindow",
          backward: config.window.backward,
          forward: config.window.forward,
        },
    weightBy: config.weighting.type === "binary" ? "binary" : "sum",
    displayDimensions: 3,
  };
}

function arrayPermutationV3(value: unknown, size: number, label: string): number[] {
  const array = denseArrayV3(value, label).map((entry, index) => (
    nonnegativeSafeIntegerV3(entry, `${label}[${index}]`)
  ));
  if (array.length !== size
    || new Set(array).size !== size
    || array.some((entry) => entry >= size)) {
    throw new TypeError(`${label} must be a complete zero-based permutation.`);
  }
  return array;
}

function stringArrayV3(value: unknown, label: string, distinct = false): string[] {
  const array = denseArrayV3(value, label).map((entry, index) => (
    nonblankStringV3(entry, `${label}[${index}]`)
  ));
  if (distinct && new Set(array).size !== array.length) throw new TypeError(`${label} must be distinct.`);
  return array;
}

function numericArrayV3(value: unknown, label: string): number[] {
  return denseArrayV3(value, label).map((entry, index) => finiteNumberV3(entry, `${label}[${index}]`));
}

function rotationSetV3(
  value: unknown,
  dictionary: StandardCodeDictionaryV3,
  sourceFit: "svd" | "means",
): RotationSet {
  const record = plainRecordV3(value, "reference.rotationSet");
  exactKeysV3(record, [
    "codes", "adjacencyKey", "rotationMatrix", "rotationColumns", "eigenvalues", "centerVector", "nodes",
  ], "reference.rotationSet");
  const codes = stringArrayV3(record.codes, "reference.rotationSet.codes", true);
  const expectedCodes = dictionary.codes.map((entry) => entry.token);
  exactJsonEqualV3(codes, expectedCodes, "Reference runtime Code basis");
  const expectedEdges = dictionary.edges.map((edge) => {
    const sourceIndex = dictionary.codes.findIndex((code) => code.canonicalIdentity === edge.sourceCodeIdentity);
    const targetIndex = dictionary.codes.findIndex((code) => code.canonicalIdentity === edge.targetCodeIdentity);
    return {
      source: codes[sourceIndex],
      target: codes[targetIndex],
      name: `${codes[sourceIndex]} & ${codes[targetIndex]}`,
      sourceIndex,
      targetIndex,
    };
  });
  const adjacencyKey = denseArrayV3(record.adjacencyKey, "reference.rotationSet.adjacencyKey")
    .map((entry, index) => {
      const edge = plainRecordV3(entry, `reference.rotationSet.adjacencyKey[${index}]`);
      exactKeysV3(edge, ["source", "target", "name", "sourceIndex", "targetIndex"], `reference.rotationSet.adjacencyKey[${index}]`);
      return {
        source: nonblankStringV3(edge.source, `reference.rotationSet.adjacencyKey[${index}].source`),
        target: nonblankStringV3(edge.target, `reference.rotationSet.adjacencyKey[${index}].target`),
        name: nonblankStringV3(edge.name, `reference.rotationSet.adjacencyKey[${index}].name`),
        sourceIndex: nonnegativeSafeIntegerV3(edge.sourceIndex, `reference.rotationSet.adjacencyKey[${index}].sourceIndex`),
        targetIndex: nonnegativeSafeIntegerV3(edge.targetIndex, `reference.rotationSet.adjacencyKey[${index}].targetIndex`),
      };
    });
  exactJsonEqualV3(adjacencyKey, expectedEdges, "Reference runtime edge basis");
  const edgeCount = expectedEdges.length;
  const rotationColumns = stringArrayV3(record.rotationColumns, "reference.rotationSet.rotationColumns", true);
  if (rotationColumns.length !== edgeCount) throw new TypeError("Reference full axis count must equal its edge count.");
  const expectedColumns = Array.from({ length: edgeCount }, (_value, index) => (
    sourceFit === "means" && index === 0 ? "MR1" : `SVD${index + 1}`
  ));
  exactJsonEqualV3(rotationColumns, expectedColumns, "Reference fit axis basis");
  const rotationMatrix = denseArrayV3(record.rotationMatrix, "reference.rotationSet.rotationMatrix")
    .map((row, rowIndex) => {
      const values = numericArrayV3(row, `reference.rotationSet.rotationMatrix[${rowIndex}]`);
      if (values.length !== edgeCount) throw new TypeError("Reference rotation matrix must be square over the complete edge basis.");
      return values;
    });
  if (rotationMatrix.length !== edgeCount) throw new TypeError("Reference rotation matrix must cover every edge.");
  for (let left = 0; left < edgeCount; left += 1) {
    for (let right = left; right < edgeCount; right += 1) {
      let dot = 0;
      for (const row of rotationMatrix) dot += row[left] * row[right];
      const expected = left === right ? 1 : 0;
      if (!Number.isFinite(dot) || Math.abs(dot - expected) > 1e-8) {
        throw new TypeError("Reference rotation matrix columns must be orthonormal.");
      }
    }
  }
  const eigenvalues = numericArrayV3(record.eigenvalues, "reference.rotationSet.eigenvalues");
  if ((sourceFit === "svd" && eigenvalues.length !== edgeCount)
    || (sourceFit === "means" && eigenvalues.length !== 0)
    || eigenvalues.some((entry) => entry < 0)) {
    throw new TypeError("Reference eigenvalues are inconsistent with sourceFit.");
  }
  const centerVector = numericArrayV3(record.centerVector, "reference.rotationSet.centerVector");
  if (centerVector.length !== edgeCount) throw new TypeError("Reference center vector must cover every edge.");
  const centerSquaredNorm = centerVector.reduce((sum, coordinate) => sum + coordinate * coordinate, 0);
  if (!Number.isFinite(centerSquaredNorm)
    || centerSquaredNorm > 1 + 1e-8
    || centerVector.some((coordinate) => coordinate < -1e-12 || coordinate > 1 + 1e-12)) {
    throw new TypeError("Reference center vector must be valid in the sphere-normalized edge domain.");
  }
  const nodes = denseArrayV3(record.nodes, "reference.rotationSet.nodes").map((value, index) => {
    const node = plainRecordV3(value, `reference.rotationSet.nodes[${index}]`);
    const displayed = rotationColumns.slice(0, Math.min(3, edgeCount));
    exactKeysV3(node, ["code", ...displayed], `reference.rotationSet.nodes[${index}]`);
    if (node.code !== codes[index]) throw new TypeError("Reference nodes must follow the runtime Code basis.");
    return {
      code: codes[index],
      ...Object.fromEntries(displayed.map((axis) => [axis, finiteNumberV3(node[axis], `reference node ${axis}`)])),
    };
  });
  if (nodes.length !== codes.length) throw new TypeError("Reference nodes must cover every Code.");
  return { codes, adjacencyKey, rotationMatrix, rotationColumns, eigenvalues, centerVector, nodes };
}

function referenceBindingV3(
  value: unknown,
  config: CanonicalStandardConfigV3,
  dictionary: StandardCodeDictionaryV3,
): ValidatedReferenceExecutionBindingV3 | null {
  const rotation = config.analysis.rotation;
  if (rotation.type !== "reference") {
    if (value !== null) throw new TypeError("SVD and Means execution plans must not carry a Reference binding.");
    return null;
  }
  if (value === null) throw new TypeError("Reference execution requires a validated Reference binding.");
  const record = plainRecordV3(value, "reference");
  exactKeysV3(record, ["referenceId", "contentSha256", "basisPermutation", "rotationSet", "sourceFit"], "reference");
  const referenceId = nonblankStringV3(record.referenceId, "reference.referenceId");
  const contentSha256 = lowercaseSha256V3(record.contentSha256, "reference.contentSha256");
  if (referenceId !== rotation.referenceId || contentSha256 !== rotation.expectedContentSha256) {
    throw new TypeError("Reference identity/content hash does not match the canonical configuration.");
  }
  if (record.sourceFit !== "svd" && record.sourceFit !== "means") {
    throw new TypeError("reference.sourceFit must be svd or means.");
  }
  const edgeCount = dictionary.edges.length;
  return {
    referenceId,
    contentSha256,
    basisPermutation: arrayPermutationV3(record.basisPermutation, edgeCount, "reference.basisPermutation"),
    sourceFit: record.sourceFit,
    rotationSet: rotationSetV3(record.rotationSet, dictionary, record.sourceFit),
  };
}

function sourceOrderContextV3(binding: DatasetBindingV3) {
  return {
    analysisFamily: "standard" as const,
    confirmationAnalysisFamily: "standard" as const,
    datasetBinding: binding,
  };
}

function executionPlanWithoutHashV3(plan: StandardExecutionPlanV3): Record<string, unknown> {
  const snapshot = plainRecordV3(snapshotJsonValueV3(plan), "execution plan");
  const header = plainRecordV3(snapshot.header, "execution plan header");
  const outputHeader = { ...header };
  delete outputHeader.executionPlanSha256;
  return { ...snapshot, header: outputHeader };
}

export function executionPlanHashPayloadV3(
  plan: StandardExecutionPlanV3,
): Record<string, unknown> {
  return executionPlanWithoutHashV3(plan);
}

function materializedRowsV3(input: {
  dataset: ParsedDataset;
  config: CanonicalStandardConfigV3;
  identities: ExecutionIdentityDictionaryV3;
  dictionary: StandardCodeDictionaryV3;
  codeValues: readonly Readonly<Record<string, number>>[];
  rowOrdering: ResolvedExecutionRowOrderingV3 | NotApplicableOrderingV3;
  horizonOrdering: ResolvedExecutionHorizonOrderingV3 | NotApplicableOrderingV3;
}): StandardExecutionRowV3[] {
  const unitTokens = tokenByCanonicalJsonV3(input.identities.units, "Unit dictionary");
  const horizonTokens = tokenByCanonicalJsonV3(input.identities.horizons, "Horizon dictionary");
  const groupTokens = tokenByCanonicalJsonV3(input.identities.groups, "Group dictionary");
  const rowTupleByIndex = input.rowOrdering.type === "within-horizon-order"
    ? new Map(input.rowOrdering.mappings.map((entry) => [entry.sourceRowIndex, entry.orderTuple]))
    : new Map<number, readonly ResolvedOrderValueV3[]>();
  const horizonTupleByToken = input.horizonOrdering.type === "trajectory-horizon-order"
    ? new Map(input.horizonOrdering.horizonTuples.map((entry) => [entry.horizonToken, entry.orderTuple]))
    : new Map<string, readonly ResolvedOrderValueV3[]>();
  const sourceOrder = input.rowOrdering.type === "within-horizon-order"
    ? input.rowOrdering.orderedSourceRowIndices
    : Array.from({ length: input.dataset.rows.length }, (_value, index) => index);
  return sourceOrder.map((sourceRowIndex) => {
    const row = input.dataset.rows[sourceRowIndex] as Record<string, unknown>;
    const unitToken = requiredTokenV3(
      unitTokens,
      canonicalIdentityJsonForRowV3(row, input.config.units.columns, `row ${sourceRowIndex} Unit`),
      `row ${sourceRowIndex} Unit`,
    );
    const horizonToken = requiredTokenV3(
      horizonTokens,
      canonicalIdentityJsonForRowV3(row, input.config.horizons.columns, `row ${sourceRowIndex} Horizon`),
      `row ${sourceRowIndex} Horizon`,
    );
    const groupToken = input.config.units.group.type === "none"
      ? null
      : requiredTokenV3(
          groupTokens,
          canonicalIdentityJsonForRowV3(row, [input.config.units.group.column], `row ${sourceRowIndex} Group`),
          `row ${sourceRowIndex} Group`,
        );
    const rowTuple = rowTupleByIndex.get(sourceRowIndex);
    const horizonTuple = horizonTupleByToken.get(horizonToken);
    return {
      sourceRowIndex,
      unitToken,
      horizonToken,
      groupToken,
      codeValues: safeCodeValuesV3(input.codeValues[sourceRowIndex], input.dictionary),
      ...(rowTuple === undefined ? {} : { rowOrderTuple: [...rowTuple] }),
      ...(horizonTuple === undefined ? {} : { horizonOrderTuple: [...horizonTuple] }),
    };
  });
}

export async function buildStandardExecutionPlanV3(input: {
  dataset: ParsedDataset;
  datasetSha256: string;
  compileResult: ReadyStandardCompileResultV3;
  reference: ValidatedReferenceExecutionBindingV3 | null;
}): Promise<StandardExecutionPlanV3> {
  // Everything reachable from caller-owned input is captured synchronously.
  // No raw caller row is inspected after the first await.
  const inputRecord = snapshotPlainJsonRecordV3(input, "execution plan input");
  exactKeysV3(inputRecord, ["dataset", "datasetSha256", "compileResult", "reference"], "execution plan input");
  const compile = captureReadyCompileResultV3(inputRecord.compileResult);
  const datasetSha256 = lowercaseSha256V3(inputRecord.datasetSha256, "datasetSha256");
  if (datasetSha256 !== compile.datasetBinding.normalizedTableSha256) {
    throw new TypeError("datasetSha256 does not match the ready compile invocation.");
  }
  const envelope = compilerDatasetEnvelopeV3(inputRecord.dataset as ParsedDataset);
  const dataset = snapshotCompilerDatasetInputV3(envelope, compile.datasetBinding);
  if (datasetHashKindFor(dataset) !== compile.datasetBinding.hashKind) {
    throw new TypeError("The dataset hash kind does not match the ready compile invocation.");
  }
  const referenceSnapshot = inputRecord.reference === null ? null : snapshotJsonValueV3(inputRecord.reference);
  const exactResourceEstimate = exactStandardResourceEstimateV3(dataset, compile.canonicalConfiguration);
  exactJsonEqualV3(exactResourceEstimate, compile.resourceEstimate, "Ready compiler resource estimate");
  if (exactResourceEstimate.blocked) throw new TypeError("A blocked resource estimate cannot build a plan.");

  // Resource admission precedes the quadratic edge dictionary allocation.
  const codeDictionary = buildStandardCodeDictionaryV3(compile.canonicalConfiguration.codes);
  const codeRepresentations = buildCodeRepresentationBindingsV3(
    dataset.rows,
    compile.canonicalConfiguration.weighting,
    codeDictionary,
  );
  const codeValues = dataset.rows.map((row) => materializeStandardCodesV3(
    row,
    compile.canonicalConfiguration.weighting,
    codeDictionary,
  ));
  const context = sourceOrderContextV3(compile.datasetBinding);
  const sourceRowOrdering = compile.canonicalConfiguration.window.type === "MovingStanzaWindow"
    ? resolveRowOrderV3(
        dataset.rows as Array<Record<string, unknown>>,
        compile.canonicalConfiguration.horizons.columns,
        compile.canonicalConfiguration.window.rowOrder,
        context,
      )
    : null;
  const sourceHorizonOrdering = compile.canonicalConfiguration.analysis.model.type === "EndPoint"
    ? null
    : resolveHorizonOrderV3(
        dataset.rows as Array<Record<string, unknown>>,
        compile.canonicalConfiguration.units.columns,
        compile.canonicalConfiguration.horizons.columns,
        compile.canonicalConfiguration.analysis.model.horizonOrder,
        context,
      );

  const headerHashOutcomePromise = settlePromiseV3(sha256CanonicalJsonV3(dataset.headers));
  const configurationHashOutcomePromise = settlePromiseV3(
    sha256CanonicalJsonV3(compile.canonicalConfiguration),
  );
  const identitiesOutcomePromise = settlePromiseV3(buildExecutionIdentityDictionaryV3(
    dataset.rows as Array<Record<string, unknown>>,
    compile.canonicalConfiguration.units.columns,
    compile.canonicalConfiguration.horizons.columns,
    compile.canonicalConfiguration.units.group.type === "stable-metadata"
      ? compile.canonicalConfiguration.units.group.column
      : null,
  ));
  const [headerHashOutcome, configurationHashOutcome, identitiesOutcome] = await Promise.all([
    headerHashOutcomePromise,
    configurationHashOutcomePromise,
    identitiesOutcomePromise,
  ] as const);
  const headerSha256 = outcomeValueV3(headerHashOutcome);
  const configurationSha256 = outcomeValueV3(configurationHashOutcome);
  const identities = outcomeValueV3(identitiesOutcome);
  if (headerSha256 !== compile.datasetBinding.headerSha256) {
    throw new TypeError("The dataset header hash does not match the ready compile invocation.");
  }
  if (configurationSha256 !== compile.configurationSha256) {
    throw new TypeError("The canonical configuration hash does not match the ready compile result.");
  }

  const unitTokens = tokenByCanonicalJsonV3(identities.units, "Unit dictionary");
  const horizonTokens = tokenByCanonicalJsonV3(identities.horizons, "Horizon dictionary");
  const rowOrdering: ResolvedExecutionRowOrderingV3 | NotApplicableOrderingV3 = sourceRowOrdering === null
    ? { type: "not-applicable", reason: "conversation-window" }
    : mapRowOrderingV3(sourceRowOrdering, horizonTokens);
  const horizonOrdering: ResolvedExecutionHorizonOrderingV3 | NotApplicableOrderingV3 = sourceHorizonOrdering === null
    ? { type: "not-applicable", reason: "endpoint-model" }
    : mapHorizonOrderingV3(
        sourceHorizonOrdering,
        compile.canonicalConfiguration.analysis.model.type === "EndPoint"
          ? (() => { throw new TypeError("Endpoint cannot carry trajectory ordering."); })()
          : compile.canonicalConfiguration.analysis.model.horizonOrder,
        unitTokens,
        horizonTokens,
      );
  const reference = referenceBindingV3(referenceSnapshot, compile.canonicalConfiguration, codeDictionary);
  const rows = materializedRowsV3({
    dataset,
    config: compile.canonicalConfiguration,
    identities,
    dictionary: codeDictionary,
    codeValues,
    rowOrdering,
    horizonOrdering,
  });
  const adapterParameters = buildAdapterParametersV3(compile.canonicalConfiguration, codeDictionary);
  const weighting = {
    scientific: compile.canonicalConfiguration.weighting.type,
    runtime: adapterParameters.weightBy,
  } as const;
  const planWithoutExecutionHash = {
    header: {
      schemaVersion: 3 as const,
      validationContractVersion: OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3,
      runtimePolicyVersion: OPEN_ENA_RUNTIME_POLICY_VERSION_V3,
      executionContractVersion: OPEN_ENA_EXECUTION_CONTRACT_VERSION_V3,
      analysisFamily: "standard" as const,
      datasetSha256,
      datasetHashKind: compile.datasetBinding.hashKind,
      rowCount: dataset.rows.length,
      headerSha256,
      datasetBinding: compile.datasetBinding,
      configurationSha256,
      runtimeVersion: JENA_RUNTIME_VERSION,
      algorithmBuildSha: JENA_SOURCE_COMMIT,
      resourceEstimate: exactResourceEstimate,
    },
    configuration: compile.canonicalConfiguration,
    identityDictionary: identities,
    codeDictionary,
    codeRepresentations,
    rows,
    rowOrdering,
    horizonOrdering,
    adapterParameters,
    weighting,
    reference,
  };
  const executionPlanSha256 = await sha256CanonicalJsonV3(planWithoutExecutionHash);
  return validateExecutionPlanV3({
    ...planWithoutExecutionHash,
    header: { ...planWithoutExecutionHash.header, executionPlanSha256 },
  });
}

function orderTupleV3(value: unknown, label: string): ResolvedOrderValueV3[] {
  return denseArrayV3(value, label).map((entry, index) => {
    if (typeof entry === "string") return entry;
    return finiteNumberV3(entry, `${label}[${index}]`);
  });
}

function sourceOrderBindingV3(
  value: unknown,
  policy: CanonicalRowOrderV3,
  binding: DatasetBindingV3,
  label: string,
): ResolvedSourceOrderBindingV3 | null {
  if (policy.kind !== "source-order-confirmed") {
    if (value !== null) throw new TypeError(`${label} must be null for explicit column order.`);
    return null;
  }
  const record = plainRecordV3(value, label);
  exactKeysV3(record, ["analysisFamily", "datasetBinding", "confirmation"], label);
  if (record.analysisFamily !== "standard") throw new TypeError(`${label}.analysisFamily must be standard.`);
  exactJsonEqualV3(datasetBindingV3(record.datasetBinding, `${label}.datasetBinding`), binding, `${label} dataset binding`);
  exactJsonEqualV3(record.confirmation, policy.confirmation, `${label} confirmation`);
  return record as unknown as ResolvedSourceOrderBindingV3;
}

function textCollationBindingsV3(
  value: unknown,
  policy: CanonicalRowOrderV3,
  label: string,
): TextCollationBindingV3[] {
  const bindings = denseArrayV3(value, label).map((entry, index) => {
    const record = plainRecordV3(entry, `${label}[${index}]`);
    exactKeysV3(record, [
      "column", "requestedLocale", "resolvedLocale", "collation", "sensitivity", "numeric", "usage", "ignorePunctuation", "caseFirst",
    ], `${label}[${index}]`);
    nonblankStringV3(record.column, `${label}[${index}].column`);
    nonblankStringV3(record.requestedLocale, `${label}[${index}].requestedLocale`);
    nonblankStringV3(record.resolvedLocale, `${label}[${index}].resolvedLocale`);
    nonblankStringV3(record.collation, `${label}[${index}].collation`);
    if (!["base", "accent", "case", "variant"].includes(record.sensitivity as string)
      || typeof record.numeric !== "boolean"
      || record.usage !== "sort"
      || typeof record.ignorePunctuation !== "boolean"
      || !["upper", "lower", "false"].includes(record.caseFirst as string)) {
      throw new TypeError(`${label}[${index}] contains unsupported collation metadata.`);
    }
    return record as unknown as TextCollationBindingV3;
  });
  const expectedTextKeys = policy.kind === "columns"
    ? policy.keys.filter((key) => key.comparator.type === "text")
    : [];
  if (bindings.length !== expectedTextKeys.length
    || bindings.some((binding, index) => (
      binding.column !== expectedTextKeys[index].column
      || binding.requestedLocale !== (expectedTextKeys[index].comparator.type === "text"
        ? expectedTextKeys[index].comparator.locale
        : "")
      || binding.sensitivity !== (expectedTextKeys[index].comparator.type === "text"
        ? expectedTextKeys[index].comparator.sensitivity
        : "")
      || binding.numeric !== (expectedTextKeys[index].comparator.type === "text"
        ? expectedTextKeys[index].comparator.numeric
        : false)
    ))) {
    throw new TypeError(`${label} does not match the requested text comparators.`);
  }
  return bindings;
}

function notApplicableOrderingV3(value: unknown, reason: NotApplicableOrderingV3["reason"], label: string): NotApplicableOrderingV3 {
  const record = plainRecordV3(value, label);
  exactKeysV3(record, ["type", "reason"], label);
  if (record.type !== "not-applicable" || record.reason !== reason) {
    throw new TypeError(`${label} has the wrong not-applicable reason.`);
  }
  return record as NotApplicableOrderingV3;
}

function validateRowsV3(
  value: unknown,
  config: CanonicalStandardConfigV3,
  dictionary: StandardCodeDictionaryV3,
  rowCount: number,
): StandardExecutionRowV3[] {
  const hasRowTuple = config.window.type === "MovingStanzaWindow";
  const hasHorizonTuple = config.analysis.model.type !== "EndPoint";
  const expectedKeys = [
    "sourceRowIndex", "unitToken", "horizonToken", "groupToken", "codeValues",
    ...(hasRowTuple ? ["rowOrderTuple"] : []),
    ...(hasHorizonTuple ? ["horizonOrderTuple"] : []),
  ];
  const rows = denseArrayV3(value, "executionPlan.rows").map((entry, rowIndex) => {
    const record = plainRecordV3(entry, `executionPlan.rows[${rowIndex}]`);
    exactKeysV3(record, expectedKeys, `executionPlan.rows[${rowIndex}]`);
    const sourceRowIndex = nonnegativeSafeIntegerV3(record.sourceRowIndex, `executionPlan.rows[${rowIndex}].sourceRowIndex`);
    const unitToken = nonblankStringV3(record.unitToken, `executionPlan.rows[${rowIndex}].unitToken`);
    const horizonToken = nonblankStringV3(record.horizonToken, `executionPlan.rows[${rowIndex}].horizonToken`);
    const groupToken = record.groupToken === null
      ? null
      : nonblankStringV3(record.groupToken, `executionPlan.rows[${rowIndex}].groupToken`);
    const codeValuesRecord = plainRecordV3(record.codeValues, `executionPlan.rows[${rowIndex}].codeValues`);
    const codeTokens = dictionary.codes.map((code) => code.token);
    exactKeysV3(codeValuesRecord, codeTokens, `executionPlan.rows[${rowIndex}].codeValues`);
    const codeValues = Object.create(null) as Record<string, number>;
    for (const token of codeTokens) {
      const number = finiteNumberV3(codeValuesRecord[token], `executionPlan.rows[${rowIndex}].codeValues.${token}`);
      if (number < 0 || (config.weighting.type === "binary" && number !== 0 && number !== 1)) {
        throw new TypeError(`executionPlan.rows[${rowIndex}] has an invalid ${config.weighting.type} Code value.`);
      }
      Object.defineProperty(codeValues, token, { value: number, enumerable: true, writable: true, configurable: true });
    }
    return {
      sourceRowIndex,
      unitToken,
      horizonToken,
      groupToken,
      codeValues,
      ...(hasRowTuple ? { rowOrderTuple: orderTupleV3(record.rowOrderTuple, `executionPlan.rows[${rowIndex}].rowOrderTuple`) } : {}),
      ...(hasHorizonTuple ? { horizonOrderTuple: orderTupleV3(record.horizonOrderTuple, `executionPlan.rows[${rowIndex}].horizonOrderTuple`) } : {}),
    };
  });
  arrayPermutationV3(rows.map((row) => row.sourceRowIndex), rowCount, "executionPlan sourceRowIndex values");
  return rows;
}

function validateRowOrderingV3(
  value: unknown,
  config: CanonicalStandardConfigV3,
  binding: DatasetBindingV3,
  rows: readonly StandardExecutionRowV3[],
): ResolvedExecutionRowOrderingV3 | NotApplicableOrderingV3 {
  if (config.window.type === "Conversation") {
    const ordering = notApplicableOrderingV3(value, "conversation-window", "executionPlan.rowOrdering");
    const sourceOrder = rows.map((row) => row.sourceRowIndex);
    if (sourceOrder.some((entry, index) => entry !== index)) {
      throw new TypeError("Conversation execution rows must retain source iteration order.");
    }
    return ordering;
  }
  const record = plainRecordV3(value, "executionPlan.rowOrdering");
  exactKeysV3(record, [
    "type", "requestedPolicy", "mappings", "orderedSourceRowIndices", "sourceOrderBinding", "textCollationBindings",
  ], "executionPlan.rowOrdering");
  if (record.type !== "within-horizon-order") throw new TypeError("Moving Stanza requires within-Horizon row ordering.");
  exactJsonEqualV3(record.requestedPolicy, config.window.rowOrder, "Requested row-order policy");
  const mappings = denseArrayV3(record.mappings, "executionPlan.rowOrdering.mappings").map((entry, index) => {
    const mapping = plainRecordV3(entry, `executionPlan.rowOrdering.mappings[${index}]`);
    exactKeysV3(mapping, ["sourceRowIndex", "horizonToken", "orderTuple", "withinHorizonOrdinal"], `executionPlan.rowOrdering.mappings[${index}]`);
    return {
      sourceRowIndex: nonnegativeSafeIntegerV3(mapping.sourceRowIndex, `row mapping ${index} sourceRowIndex`),
      horizonToken: nonblankStringV3(mapping.horizonToken, `row mapping ${index} horizonToken`),
      orderTuple: orderTupleV3(mapping.orderTuple, `row mapping ${index} orderTuple`),
      withinHorizonOrdinal: nonnegativeSafeIntegerV3(mapping.withinHorizonOrdinal, `row mapping ${index} ordinal`),
    };
  });
  const orderedSourceRowIndices = arrayPermutationV3(
    record.orderedSourceRowIndices,
    rows.length,
    "executionPlan.rowOrdering.orderedSourceRowIndices",
  );
  arrayPermutationV3(mappings.map((entry) => entry.sourceRowIndex), rows.length, "executionPlan.rowOrdering mapping indices");
  exactJsonEqualV3(orderedSourceRowIndices, mappings.map((entry) => entry.sourceRowIndex), "Resolved row-order sequence");
  exactJsonEqualV3(orderedSourceRowIndices, rows.map((row) => row.sourceRowIndex), "Materialized row-order sequence");
  const rowByIndex = new Map(rows.map((row) => [row.sourceRowIndex, row]));
  const groups = new Map<string, number[]>();
  for (const mapping of mappings) {
    const row = rowByIndex.get(mapping.sourceRowIndex)!;
    if (row.horizonToken !== mapping.horizonToken) throw new TypeError("Resolved row order crossed a Horizon boundary.");
    exactJsonEqualV3(row.rowOrderTuple, mapping.orderTuple, "Materialized row-order tuple");
    const ordinals = groups.get(mapping.horizonToken) ?? [];
    ordinals.push(mapping.withinHorizonOrdinal);
    groups.set(mapping.horizonToken, ordinals);
  }
  for (const ordinals of groups.values()) {
    const expected = Array.from({ length: ordinals.length }, (_value, index) => index);
    exactJsonEqualV3([...ordinals].sort((left, right) => left - right), expected, "Within-Horizon ordinal sequence");
  }
  return {
    type: "within-horizon-order",
    requestedPolicy: config.window.rowOrder,
    mappings,
    orderedSourceRowIndices,
    sourceOrderBinding: sourceOrderBindingV3(record.sourceOrderBinding, config.window.rowOrder, binding, "executionPlan.rowOrdering.sourceOrderBinding"),
    textCollationBindings: textCollationBindingsV3(record.textCollationBindings, config.window.rowOrder, "executionPlan.rowOrdering.textCollationBindings"),
  };
}

function validateHorizonOrderingV3(
  value: unknown,
  config: CanonicalStandardConfigV3,
  binding: DatasetBindingV3,
  rows: readonly StandardExecutionRowV3[],
): ResolvedExecutionHorizonOrderingV3 | NotApplicableOrderingV3 {
  if (config.analysis.model.type === "EndPoint") {
    return notApplicableOrderingV3(value, "endpoint-model", "executionPlan.horizonOrdering");
  }
  const policy = config.analysis.model.horizonOrder;
  const record = plainRecordV3(value, "executionPlan.horizonOrdering");
  exactKeysV3(record, [
    "type", "requestedPolicy", "horizonTuples", "unitSequences", "implementationHorizonOrder", "sourceOrderBinding", "textCollationBindings",
  ], "executionPlan.horizonOrdering");
  if (record.type !== "trajectory-horizon-order") throw new TypeError("Trajectory models require resolved Horizon ordering.");
  exactJsonEqualV3(record.requestedPolicy, policy, "Requested Horizon-order policy");
  const horizonTuples = denseArrayV3(record.horizonTuples, "executionPlan.horizonOrdering.horizonTuples").map((entry, index) => {
    const tuple = plainRecordV3(entry, `executionPlan.horizonOrdering.horizonTuples[${index}]`);
    exactKeysV3(tuple, ["horizonToken", "orderTuple"], `executionPlan.horizonOrdering.horizonTuples[${index}]`);
    return {
      horizonToken: nonblankStringV3(tuple.horizonToken, `Horizon tuple ${index} token`),
      orderTuple: orderTupleV3(tuple.orderTuple, `Horizon tuple ${index} orderTuple`),
    };
  });
  if (new Set(horizonTuples.map((entry) => entry.horizonToken)).size !== horizonTuples.length) {
    throw new TypeError("Resolved Horizon tuples must be unique.");
  }
  const observedHorizonTokens = new Set(rows.map((row) => row.horizonToken));
  if (horizonTuples.length !== observedHorizonTokens.size
    || horizonTuples.some((entry) => !observedHorizonTokens.has(entry.horizonToken))) {
    throw new TypeError("Resolved Horizon tuples must exactly cover observed Horizons without imputation.");
  }
  const tupleByHorizon = new Map(horizonTuples.map((entry) => [entry.horizonToken, entry.orderTuple]));
  for (const row of rows) exactJsonEqualV3(row.horizonOrderTuple, tupleByHorizon.get(row.horizonToken), "Materialized Horizon-order tuple");
  const unitSequences = denseArrayV3(record.unitSequences, "executionPlan.horizonOrdering.unitSequences").map((entry, index) => {
    const sequence = plainRecordV3(entry, `executionPlan.horizonOrdering.unitSequences[${index}]`);
    exactKeysV3(sequence, ["unitToken", "steps"], `executionPlan.horizonOrdering.unitSequences[${index}]`);
    const unitToken = nonblankStringV3(sequence.unitToken, `Unit sequence ${index} token`);
    const steps = denseArrayV3(sequence.steps, `Unit sequence ${index} steps`).map((stepValue, stepIndex) => {
      const step = plainRecordV3(stepValue, `Unit sequence ${index} step ${stepIndex}`);
      exactKeysV3(step, ["horizonToken", "trajectoryOrdinal"], `Unit sequence ${index} step ${stepIndex}`);
      const trajectoryOrdinal = nonnegativeSafeIntegerV3(step.trajectoryOrdinal, `Unit sequence ${index} step ordinal`);
      if (trajectoryOrdinal !== stepIndex) throw new TypeError("Trajectory ordinals must be contiguous and zero based.");
      return {
        horizonToken: nonblankStringV3(step.horizonToken, `Unit sequence ${index} Horizon token`),
        trajectoryOrdinal,
      };
    });
    if (new Set(steps.map((step) => step.horizonToken)).size !== steps.length) {
      throw new TypeError("Trajectory sequences cannot contain duplicate Horizon steps.");
    }
    return { unitToken, steps };
  });
  if (new Set(unitSequences.map((entry) => entry.unitToken)).size !== unitSequences.length) {
    throw new TypeError("Trajectory Unit sequences must be unique.");
  }
  const observedByUnit = new Map<string, Set<string>>();
  for (const row of rows) {
    const observed = observedByUnit.get(row.unitToken) ?? new Set<string>();
    observed.add(row.horizonToken);
    observedByUnit.set(row.unitToken, observed);
  }
  const sequenceByUnit = new Map(unitSequences.map((entry) => [entry.unitToken, entry]));
  if (sequenceByUnit.size !== observedByUnit.size) throw new TypeError("Every observed Unit requires one trajectory sequence.");
  for (const [unitToken, observed] of observedByUnit) {
    const sequence = sequenceByUnit.get(unitToken);
    if (sequence === undefined
      || sequence.steps.length !== observed.size
      || sequence.steps.some((step) => !observed.has(step.horizonToken))) {
      throw new TypeError("Trajectory sequences must contain every observed Unit-Horizon step exactly once without imputation.");
    }
  }
  const implementationHorizonOrder = stringArrayV3(
    record.implementationHorizonOrder,
    "executionPlan.horizonOrdering.implementationHorizonOrder",
    true,
  );
  arrayPermutationV3(
    implementationHorizonOrder.map((token) => horizonTuples.findIndex((entry) => entry.horizonToken === token)),
    horizonTuples.length,
    "implementation Horizon order",
  );
  return {
    type: "trajectory-horizon-order",
    requestedPolicy: policy,
    horizonTuples,
    unitSequences,
    implementationHorizonOrder,
    sourceOrderBinding: sourceOrderBindingV3(record.sourceOrderBinding, policy, binding, "executionPlan.horizonOrdering.sourceOrderBinding"),
    textCollationBindings: textCollationBindingsV3(record.textCollationBindings, policy, "executionPlan.horizonOrdering.textCollationBindings"),
  };
}

function validateCodeDictionaryV3(value: unknown, config: CanonicalStandardConfigV3): StandardCodeDictionaryV3 {
  const expected = buildStandardCodeDictionaryV3(config.codes);
  exactJsonEqualV3(value, expected, "Execution Code dictionary");
  return expected;
}

function validateCodeRepresentationsV3(
  value: unknown,
  config: CanonicalStandardConfigV3,
  dictionary: StandardCodeDictionaryV3,
): CodeRepresentationBindingV3[] {
  const bindings = denseArrayV3(value, "executionPlan.codeRepresentations").map((entry, index) => {
    const record = plainRecordV3(entry, `executionPlan.codeRepresentations[${index}]`);
    exactKeysV3(record, ["runtimeToken", "sourceColumn", "sourceRepresentation", "runtimeRepresentation"], `executionPlan.codeRepresentations[${index}]`);
    if (record.runtimeRepresentation !== "number") throw new TypeError("Runtime Code representation must be numeric.");
    const expectedRepresentation = config.weighting.type === "frequency"
      ? ["frequency"]
      : ["numeric-binary", "boolean-binary"];
    if (!expectedRepresentation.includes(record.sourceRepresentation as string)) {
      throw new TypeError("Source Code representation contradicts scientific weighting.");
    }
    return record as unknown as CodeRepresentationBindingV3;
  });
  if (bindings.length !== dictionary.codes.length
    || bindings.some((binding, index) => (
      binding.runtimeToken !== dictionary.codes[index].token
      || binding.sourceColumn !== dictionary.codes[index].sourceColumn
    ))) {
    throw new TypeError("Code representation bindings do not match the Code dictionary.");
  }
  return bindings;
}

function validateAdapterParametersV3(
  value: unknown,
  config: CanonicalStandardConfigV3,
  dictionary: StandardCodeDictionaryV3,
): StandardAdapterParametersV3 {
  const expected = buildAdapterParametersV3(config, dictionary);
  exactJsonEqualV3(value, expected, "Standard adapter parameters");
  return expected;
}

function assertIdentityMembershipV3(
  identities: ExecutionIdentityDictionaryV3,
  rows: readonly StandardExecutionRowV3[],
  config: CanonicalStandardConfigV3,
): void {
  const unitTokens = new Set(identities.units.map((entry) => entry.token));
  const horizonTokens = new Set(identities.horizons.map((entry) => entry.token));
  const groupTokens = new Set(identities.groups.map((entry) => entry.token));
  if (identities.units.some((entry) => !UNIT_TOKEN_PATTERN_V3.test(entry.token))
    || identities.horizons.some((entry) => !HORIZON_TOKEN_PATTERN_V3.test(entry.token))
    || identities.groups.some((entry) => !GROUP_TOKEN_PATTERN_V3.test(entry.token))) {
    throw new TypeError("Execution identity dictionaries contain noncanonical runtime tokens.");
  }
  const observedUnits = new Set<string>();
  const observedHorizons = new Set<string>();
  const observedGroups = new Set<string>();
  for (const row of rows) {
    if (!unitTokens.has(row.unitToken) || !horizonTokens.has(row.horizonToken)) {
      throw new TypeError("Execution row contains an unknown Unit or Horizon token.");
    }
    observedUnits.add(row.unitToken);
    observedHorizons.add(row.horizonToken);
    if (config.units.group.type === "none") {
      if (row.groupToken !== null) throw new TypeError("Ungrouped Standard plans cannot carry Group tokens.");
    } else {
      if (row.groupToken === null || !groupTokens.has(row.groupToken)) {
        throw new TypeError("Grouped Standard plans require a known Group token on every row.");
      }
      observedGroups.add(row.groupToken);
    }
  }
  if (observedUnits.size !== unitTokens.size || observedHorizons.size !== horizonTokens.size
    || observedGroups.size !== groupTokens.size) {
    throw new TypeError("Execution identity dictionaries must exactly cover materialized rows.");
  }
}

function resourceInputFromPlanV3(
  plan: Pick<StandardExecutionPlanV3, "configuration" | "rows" | "reference">,
  estimate: StandardResourceEstimateV3,
): Parameters<typeof estimateStandardResourcesV3>[0] {
  const horizonSizes = new Map<string, number>();
  const unitHorizonSizes = new Map<string, number>();
  const horizonsByUnit = new Map<string, Set<string>>();
  const unitTokens = new Set<string>();
  for (const row of plan.rows) {
    unitTokens.add(row.unitToken);
    horizonSizes.set(row.horizonToken, (horizonSizes.get(row.horizonToken) ?? 0) + 1);
    const partition = canonicalJsonV3([row.unitToken, row.horizonToken]);
    unitHorizonSizes.set(partition, (unitHorizonSizes.get(partition) ?? 0) + 1);
    const observed = horizonsByUnit.get(row.unitToken) ?? new Set<string>();
    observed.add(row.horizonToken);
    horizonsByUnit.set(row.unitToken, observed);
  }
  const sortedSizes = (sizes: ReadonlyMap<string, number>) => [...sizes.entries()]
    .sort(([left], [right]) => codeUnitCompareV3(left, right))
    .map(([, size]) => size);
  const trajectorySteps = plan.configuration.analysis.model.type === "EndPoint"
    ? unitTokens.size
    : [...horizonsByUnit.values()].reduce((sum, values) => sum + values.size, 0);
  return {
    rowCount: plan.rows.length,
    unitCount: unitTokens.size,
    horizonCount: horizonSizes.size,
    codeCount: plan.configuration.codes.length,
    horizonSizes: sortedSizes(horizonSizes),
    windowPartitionSizes: plan.configuration.window.type === "Conversation"
      ? sortedSizes(unitHorizonSizes)
      : sortedSizes(horizonSizes),
    trajectorySteps,
    windowType: plan.configuration.window.type,
    backward: plan.configuration.window.type === "MovingStanzaWindow"
      ? plan.configuration.window.backward
      : { kind: "finite", value: 1 },
    forward: plan.configuration.window.type === "MovingStanzaWindow"
      ? plan.configuration.window.forward
      : { kind: "finite", value: 0 },
    referenceProjection: plan.reference !== null,
    datasetSizeBytes: estimate.datasetSizeBytes,
    identityPayloadBytes: estimate.identityPayloadBytes,
  };
}

function decodePlanShapeV3(value: unknown): StandardExecutionPlanV3 {
  const plan = plainRecordV3(snapshotJsonValueV3(value), "executionPlan");
  exactKeysV3(plan, [
    "header",
    "configuration",
    "identityDictionary",
    "codeDictionary",
    "codeRepresentations",
    "rows",
    "rowOrdering",
    "horizonOrdering",
    "adapterParameters",
    "weighting",
    "reference",
  ], "executionPlan");
  const headerRecord = plainRecordV3(plan.header, "executionPlan.header");
  exactKeysV3(headerRecord, [
    "schemaVersion",
    "validationContractVersion",
    "runtimePolicyVersion",
    "executionContractVersion",
    "analysisFamily",
    "datasetSha256",
    "datasetHashKind",
    "rowCount",
    "headerSha256",
    "datasetBinding",
    "configurationSha256",
    "executionPlanSha256",
    "runtimeVersion",
    "algorithmBuildSha",
    "resourceEstimate",
  ], "executionPlan.header");
  if (headerRecord.schemaVersion !== 3
    || headerRecord.analysisFamily !== "standard"
    || headerRecord.validationContractVersion !== OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3
    || headerRecord.runtimePolicyVersion !== OPEN_ENA_RUNTIME_POLICY_VERSION_V3
    || headerRecord.executionContractVersion !== OPEN_ENA_EXECUTION_CONTRACT_VERSION_V3
    || headerRecord.runtimeVersion !== JENA_RUNTIME_VERSION
    || headerRecord.algorithmBuildSha !== JENA_SOURCE_COMMIT
    || !LOWERCASE_GIT_SHA_V3.test(JENA_SOURCE_COMMIT)) {
    throw new TypeError("Execution plan runtime, family, or contract identity is unsupported.");
  }
  const binding = datasetBindingV3(headerRecord.datasetBinding, "executionPlan.header.datasetBinding");
  const datasetSha256 = lowercaseSha256V3(headerRecord.datasetSha256, "executionPlan.header.datasetSha256");
  const datasetHashKind = datasetHashKindV3(headerRecord.datasetHashKind, "executionPlan.header.datasetHashKind");
  const rowCount = nonnegativeSafeIntegerV3(headerRecord.rowCount, "executionPlan.header.rowCount");
  const headerSha256 = lowercaseSha256V3(headerRecord.headerSha256, "executionPlan.header.headerSha256");
  if (datasetSha256 !== binding.normalizedTableSha256
    || datasetHashKind !== binding.hashKind
    || rowCount !== binding.rowCount
    || headerSha256 !== binding.headerSha256) {
    throw new TypeError("Execution plan dataset fields disagree with their compiler binding.");
  }
  const configuration = decodeCanonicalStandardConfigV3(plan.configuration);
  if (configuration.contracts.validationContractVersion !== headerRecord.validationContractVersion
    || configuration.contracts.runtimePolicyVersion !== headerRecord.runtimePolicyVersion) {
    throw new TypeError("Execution plan configuration contract versions disagree with its header.");
  }
  const codeDictionary = validateCodeDictionaryV3(plan.codeDictionary, configuration);
  if (codeDictionary.codes.some((entry) => !CODE_TOKEN_PATTERN_V3.test(entry.token))) {
    throw new TypeError("Execution Code dictionary contains noncanonical runtime tokens.");
  }
  const codeRepresentations = validateCodeRepresentationsV3(plan.codeRepresentations, configuration, codeDictionary);
  const rows = validateRowsV3(plan.rows, configuration, codeDictionary, rowCount);
  const rowOrdering = validateRowOrderingV3(plan.rowOrdering, configuration, binding, rows);
  const horizonOrdering = validateHorizonOrderingV3(plan.horizonOrdering, configuration, binding, rows);
  const adapterParameters = validateAdapterParametersV3(plan.adapterParameters, configuration, codeDictionary);
  const weightingRecord = plainRecordV3(plan.weighting, "executionPlan.weighting");
  exactKeysV3(weightingRecord, ["scientific", "runtime"], "executionPlan.weighting");
  const expectedWeighting = {
    scientific: configuration.weighting.type,
    runtime: adapterParameters.weightBy,
  };
  exactJsonEqualV3(weightingRecord, expectedWeighting, "Execution weighting provenance");
  const reference = referenceBindingV3(plan.reference, configuration, codeDictionary);
  const resourceEstimate = standardResourceEstimateV3(headerRecord.resourceEstimate, "executionPlan.header.resourceEstimate");
  const configurationSha256 = lowercaseSha256V3(headerRecord.configurationSha256, "executionPlan.header.configurationSha256");
  const executionPlanSha256 = lowercaseSha256V3(headerRecord.executionPlanSha256, "executionPlan.header.executionPlanSha256");
  return {
    header: {
      schemaVersion: 3,
      validationContractVersion: OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3,
      runtimePolicyVersion: OPEN_ENA_RUNTIME_POLICY_VERSION_V3,
      executionContractVersion: OPEN_ENA_EXECUTION_CONTRACT_VERSION_V3,
      analysisFamily: "standard",
      datasetSha256,
      datasetHashKind,
      rowCount,
      headerSha256,
      datasetBinding: binding,
      configurationSha256,
      executionPlanSha256,
      runtimeVersion: JENA_RUNTIME_VERSION,
      algorithmBuildSha: JENA_SOURCE_COMMIT,
      resourceEstimate,
    },
    configuration,
    identityDictionary: plan.identityDictionary as ExecutionIdentityDictionaryV3,
    codeDictionary,
    codeRepresentations,
    rows,
    rowOrdering,
    horizonOrdering,
    adapterParameters,
    weighting: expectedWeighting,
    reference,
  };
}

export async function validateExecutionPlanV3(input: unknown): Promise<OpenEnaExecutionPlanV3> {
  // Strict canonical capture happens before any await and before any property
  // read that could execute a getter. The decoded plan is detached from input.
  const plan = decodePlanShapeV3(input);
  const identityOutcomePromise = settlePromiseV3(
    validateExecutionIdentityDictionaryV3(plan.identityDictionary),
  );
  const configurationHashOutcomePromise = settlePromiseV3(sha256CanonicalJsonV3(plan.configuration));
  const planHashOutcomePromise = settlePromiseV3(sha256CanonicalJsonV3(executionPlanWithoutHashV3(plan)));
  const [identityOutcome, configurationHashOutcome, planHashOutcome] = await Promise.all([
    identityOutcomePromise,
    configurationHashOutcomePromise,
    planHashOutcomePromise,
  ] as const);
  const identities = outcomeValueV3(identityOutcome);
  const configurationSha256 = outcomeValueV3(configurationHashOutcome);
  const executionPlanSha256 = outcomeValueV3(planHashOutcome);
  if (configurationSha256 !== plan.header.configurationSha256) {
    throw new TypeError("Execution-plan configuration SHA-256 does not match its canonical configuration.");
  }
  if (executionPlanSha256 !== plan.header.executionPlanSha256) {
    throw new TypeError("Execution-plan SHA-256 does not match its content.");
  }
  assertIdentityMembershipV3(identities, plan.rows, plan.configuration);
  const exactResourceEstimate = estimateStandardResourcesV3(
    resourceInputFromPlanV3(plan, plan.header.resourceEstimate),
  );
  exactJsonEqualV3(exactResourceEstimate, plan.header.resourceEstimate, "Execution resource estimate");
  return deepFreezeV3({ ...plan, identityDictionary: identities });
}
