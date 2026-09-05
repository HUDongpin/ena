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
  estimateEarlyStandardResourcesV3,
  estimateStandardResourcesV3,
} from "./resource-budget";
import type { StandardResourceEstimateV3 } from "./resource-budget";
import { assertReferenceAdmissionV3, bindReferenceToTargetV3, captureReferenceExecutionBindingV3 } from "./reference-v2";
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

const EXECUTION_PLAN_ROOT_KEYS_V3 = [
  "header",
  "configuration",
  "sourceProof",
  "identityDictionary",
  "codeDictionary",
  "codeRepresentations",
  "rows",
  "rowOrdering",
  "horizonOrdering",
  "adapterParameters",
  "weighting",
  "reference",
] as const;

const EXECUTION_PLAN_HEADER_KEYS_V3 = [
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
] as const;

const STANDARD_CONFIGURATION_KEYS_V3 = [
  "schemaVersion",
  "analysisFamily",
  "contracts",
  "units",
  "horizons",
  "codes",
  "weighting",
  "window",
  "analysis",
] as const;

const SOURCE_PROOF_KEYS_V3 = [
  "schemaVersion",
  "dataset",
  "headers",
  "selectedColumns",
  "rows",
  "sourceProofSha256",
] as const;

const SOURCE_PROOF_DATASET_KEYS_V3 = [
  "name",
  "source",
  "hashKind",
  "normalizedTableSha256",
  "externalHashVerification",
  "rowCount",
  "sizeBytes",
] as const;

const STANDARD_ADAPTER_PARAMETER_KEYS_V3 = [
  "networkType",
  "unitTokenColumn",
  "horizonTokenColumn",
  "codeTokens",
  "model",
  "window",
  "weightBy",
  "displayDimensions",
] as const;

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

export interface StandardSourceProofRowV3 {
  readonly sourceRowIndex: number;
  readonly values: Readonly<Record<string, string | number | boolean>>;
}

export interface StandardSourceProofPayloadV3 {
  readonly schemaVersion: 1;
  readonly dataset: {
    readonly name: string;
    readonly source: "sample" | "upload";
    readonly hashKind: DatasetHashKind;
    readonly normalizedTableSha256: string;
    /**
     * ParsedDataset does not retain the normalized source-file preimage, so
     * this digest is provenance rather than an independently authenticatable
     * signature. Every scientific plan field is nevertheless rederived from
     * the selected source values carried below.
     */
    readonly externalHashVerification: "provenance-only-no-normalized-table-preimage";
    readonly rowCount: number;
    /** Original imported-dataset byte count used by resource contract v3.4. */
    readonly sizeBytes: number;
  };
  readonly headers: readonly string[];
  readonly selectedColumns: readonly string[];
  readonly rows: readonly StandardSourceProofRowV3[];
}

export interface StandardSourceProofV3 extends StandardSourceProofPayloadV3 {
  readonly sourceProofSha256: string;
}

export interface StandardExecutionPlanV3 {
  readonly header: ExecutionPlanHeaderV3;
  readonly configuration: CanonicalStandardConfigV3;
  readonly sourceProof: StandardSourceProofV3;
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

function arrayLengthDescriptorV3(value: unknown[], label: string): number {
  const descriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (descriptor === undefined
    || descriptor.enumerable
    || !("value" in descriptor)
    || typeof descriptor.value !== "number"
    || !Number.isSafeInteger(descriptor.value)
    || descriptor.value < 0) {
    throw new TypeError(`${label}.length is invalid.`);
  }
  return descriptor.value;
}

function shallowArrayLengthV3(value: unknown, label: string): number {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new TypeError(`${label} must be a plain array.`);
  }
  return arrayLengthDescriptorV3(value, label);
}

interface StagedRecordGuardV3 {
  readonly original: object;
  readonly label: string;
  readonly expectedKeys: readonly string[];
  readonly admitted: Record<string, unknown>;
}

interface StagedArrayGuardV3 {
  readonly original: unknown[];
  readonly label: string;
  readonly admittedLength: number;
}

interface ExecutionPlanAdmissionCaptureV3 {
  readonly root: object;
  readonly records: ReadonlyMap<object, StagedRecordGuardV3>;
  readonly arrays: ReadonlyMap<object, StagedArrayGuardV3>;
  readonly reference: { readonly original: object; readonly captured: ValidatedReferenceExecutionBindingV3 } | null;
}

interface MutableExecutionPlanAdmissionCaptureV3 {
  readonly records: Map<object, StagedRecordGuardV3>;
  readonly arrays: Map<object, StagedArrayGuardV3>;
}

function stageRecordV3(
  capture: MutableExecutionPlanAdmissionCaptureV3,
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  const original = value as object;
  const existing = value !== null && typeof value === "object"
    ? capture.records.get(original)
    : undefined;
  if (existing !== undefined) {
    exactKeysV3(existing.admitted, expectedKeys, label);
    return existing.admitted;
  }
  const admitted = snapshotPlainJsonRecordV3(value, label);
  exactKeysV3(admitted, expectedKeys, label);
  capture.records.set(original, { original, label, expectedKeys, admitted });
  return admitted;
}

function stageRecordShapeV3(
  capture: MutableExecutionPlanAdmissionCaptureV3,
  value: unknown,
  label: string,
): Record<string, unknown> {
  const original = value as object;
  const existing = value !== null && typeof value === "object"
    ? capture.records.get(original)
    : undefined;
  if (existing !== undefined) return existing.admitted;
  const admitted = snapshotPlainJsonRecordV3(value, label);
  capture.records.set(original, {
    original,
    label,
    expectedKeys: Object.keys(admitted),
    admitted,
  });
  return admitted;
}

function stageArrayLengthV3(
  capture: MutableExecutionPlanAdmissionCaptureV3,
  value: unknown,
  label: string,
): number {
  const original = value as unknown[];
  const existing = Array.isArray(value) ? capture.arrays.get(original) : undefined;
  if (existing !== undefined) return existing.admittedLength;
  const admittedLength = shallowArrayLengthV3(value, label);
  capture.arrays.set(original, { original, label, admittedLength });
  return admittedLength;
}

function sameDescriptorValuesV3(
  admitted: Record<string, unknown>,
  accepted: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string,
): void {
  for (const key of expectedKeys) {
    if (!Object.is(admitted[key], accepted[key])) {
      throw new TypeError(`${label}.${key} changed after staged admission.`);
    }
  }
}

function guardedDenseArrayElementsV3(
  value: unknown[],
  acceptedLength: number,
  label: string,
): unknown[] {
  const keys = Reflect.ownKeys(value);
  if (keys.length !== acceptedLength + 1 || !keys.includes("length")) {
    throw new TypeError(`${label} must be a dense plain JSON array without extra properties.`);
  }
  const elements = new Array<unknown>(acceptedLength);
  let elementCount = 0;
  for (const key of keys) {
    if (key === "length") continue;
    if (typeof key !== "string"
      || !/^(0|[1-9]\d*)$/u.test(key)
      || !Number.isSafeInteger(Number(key))) {
      throw new TypeError(`${label} must be a dense plain JSON array without extra properties.`);
    }
    const index = Number(key);
    if (index >= acceptedLength) {
      throw new TypeError(`${label} must be a dense plain JSON array without extra properties.`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw new TypeError(`${label}[${key}] must be an own enumerable data property, not an accessor.`);
    }
    elements[index] = descriptor.value;
    elementCount += 1;
  }
  if (elementCount !== acceptedLength) {
    throw new TypeError(`${label} must be a dense plain JSON array without extra properties.`);
  }
  return elements;
}

/** Admit schema-derived dimensions before enumerating each scientific array. */
function admitExecutionPlanCardinalitiesV3(
  root: object,
  records: Map<object, Record<string, unknown>>,
  lengths: Map<object, number>,
  arrayElements: Map<object, unknown[]>,
): void {
  // Newly discovered parents are captured and checked once, then reused by the
  // final copy. In particular, discovering a nested array never requires a third
  // descriptor read of its parent or another enumeration of its containing array.
  const record = (value: unknown, label: string, keys?: readonly string[]): Record<string, unknown> => {
    let accepted = records.get(value as object);
    if (accepted === undefined) {
      const staged = snapshotPlainJsonRecordV3(value, label);
      if (keys !== undefined) exactKeysV3(staged, keys, label);
      accepted = snapshotPlainJsonRecordV3(value, label);
      const expectedKeys = keys ?? Object.keys(staged);
      exactKeysV3(accepted, expectedKeys, label);
      sameDescriptorValuesV3(staged, accepted, expectedKeys, label);
      records.set(value as object, accepted);
    }
    if (keys !== undefined) exactKeysV3(accepted, keys, label);
    return accepted;
  };
  const length = (value: unknown, label: string, bound?: number, exact = false): number => {
    const previous = lengths.get(value as object);
    const admitted = previous ?? shallowArrayLengthV3(value, label);
    if (bound !== undefined && (exact ? admitted !== bound : admitted > bound)) {
      throw new TypeError(`${label} has an inconsistent schema cardinality.`);
    }
    if (previous === undefined) {
      const accepted = shallowArrayLengthV3(value, label);
      if (accepted !== admitted) throw new TypeError(`${label}.length changed after staged admission.`);
      lengths.set(value as object, accepted);
    }
    return admitted;
  };
  const elements = (value: unknown, label: string): unknown[] => {
    const previous = arrayElements.get(value as object);
    if (previous !== undefined) return previous;
    const accepted = guardedDenseArrayElementsV3(value as unknown[], length(value, label), label);
    arrayElements.set(value as object, accepted);
    return accepted;
  };
  const columns = (value: unknown, label: string): string[] => (
    elements(value, label).map((column) => nonblankStringV3(column, label))
  );

  const plan = record(root, "executionPlan");
  const header = record(plan.header, "executionPlan.header");
  const rowCount = nonnegativeSafeIntegerV3(header.rowCount, "executionPlan.header.rowCount");
  const resource = record(header.resourceEstimate, "executionPlan.header.resourceEstimate");
  const config = record(plan.configuration, "executionPlan.configuration");
  const proof = record(plan.sourceProof, "executionPlan.sourceProof");
  // Headers and ordered-category levels have no independent absolute cap in
  // schema v3. Header count supplies the bound for selected column dimensions.
  const headerCount = length(proof.headers, "sourceProof.headers");
  const units = record(config.units, "configuration.units", ["columns", "group"]);
  const horizons = record(config.horizons, "configuration.horizons", ["columns"]);
  const unitWidth = length(units.columns, "configuration.units.columns", headerCount);
  const horizonWidth = length(horizons.columns, "configuration.horizons.columns", headerCount);
  length(proof.selectedColumns, "sourceProof.selectedColumns", headerCount);
  const unitColumns = columns(units.columns, "configuration.units.columns");
  const horizonColumns = columns(horizons.columns, "configuration.horizons.columns");
  const trajectoryColumns = [...new Set([...unitColumns, ...horizonColumns])];
  const selectedColumns = columns(proof.selectedColumns, "sourceProof.selectedColumns");
  const group = record(units.group, "configuration.units.group");
  exactKeysV3(group, group.type === "none" ? ["type"] : ["type", "column"], "configuration.units.group");

  const identity = record(plan.identityDictionary, "identityDictionary", ["units", "horizons", "groups"]);
  const unitCount = length(identity.units, "identityDictionary.units", rowCount);
  const horizonCount = length(identity.horizons, "identityDictionary.horizons", rowCount);
  length(identity.groups, "identityDictionary.groups", group.type === "none" ? 0 : unitCount);
  for (const [role, width] of [["units", unitWidth], ["horizons", horizonWidth], ["groups", 1]] as const) {
    for (const [index, value] of elements(identity[role], `identityDictionary.${role}`).entries()) {
      const label = `identityDictionary.${role}[${index}]`;
      const entry = record(value, label, ["token", "displayLabel", "fields", "canonicalJson", "sha256"]);
      length(entry.fields, `${label}.fields`, width, true);
    }
  }

  const confirmation = (value: unknown, relevant: readonly string[], label: string): void => {
    const accepted = record(value, label, [
      "kind", "analysisFamily", "datasetSha256", "rowCount", "relevantColumns", "confirmedAt", "confirmationVersion",
    ]);
    length(accepted.relevantColumns, `${label}.relevantColumns`, relevant.length, true);
    const actual = columns(accepted.relevantColumns, `${label}.relevantColumns`);
    if (actual.some((column, index) => column !== relevant[index])) {
      throw new TypeError(`${label}.relevantColumns must match the ordered identity columns.`);
    }
  };
  type PolicyDimensions = { kind: "columns" | "source-order-confirmed"; width: number; textKeys: number };
  const policy = (
    value: unknown,
    relevant: readonly string[],
    label: string,
    expected?: PolicyDimensions,
  ): PolicyDimensions => {
    const accepted = record(value, label);
    if (expected !== undefined && accepted.kind !== expected.kind) {
      throw new TypeError(`${label} disagrees with the configured order policy.`);
    }
    if (accepted.kind === "source-order-confirmed") {
      exactKeysV3(accepted, ["kind", "confirmation"], label);
      confirmation(accepted.confirmation, relevant, `${label}.confirmation`);
      return { kind: accepted.kind, width: 1, textKeys: 0 };
    }
    if (accepted.kind !== "columns") throw new TypeError(`${label}.kind is unsupported.`);
    exactKeysV3(accepted, ["kind", "keys"], label);
    const width = length(accepted.keys, `${label}.keys`, headerCount);
    if (expected !== undefined) length(accepted.keys, `${label}.keys`, expected.width, true);
    let textKeys = 0;
    for (const [index, value] of elements(accepted.keys, `${label}.keys`).entries()) {
      const keyLabel = `${label}.keys[${index}]`;
      const key = record(value, keyLabel, ["column", "direction", "comparator"]);
      const comparator = record(key.comparator, `${keyLabel}.comparator`);
      if (comparator.type === "text") textKeys += 1;
    }
    if (expected !== undefined && textKeys !== expected.textKeys) {
      throw new TypeError(`${label} has inconsistent text comparator cardinality.`);
    }
    return { kind: accepted.kind, width, textKeys };
  };
  const ordering = (
    value: unknown,
    dimensions: PolicyDimensions | null,
    relevant: readonly string[],
    label: string,
    keys: readonly string[],
  ): Record<string, unknown> => {
    const accepted = record(value, label, dimensions === null ? ["type", "reason"] : keys);
    if (dimensions === null) return accepted;
    policy(accepted.requestedPolicy, relevant, `${label}.requestedPolicy`, dimensions);
    length(accepted.textCollationBindings, `${label}.textCollationBindings`, dimensions.textKeys, true);
    if (dimensions.kind === "source-order-confirmed") {
      const binding = record(accepted.sourceOrderBinding, `${label}.sourceOrderBinding`, ["analysisFamily", "datasetBinding", "confirmation"]);
      confirmation(binding.confirmation, relevant, `${label}.sourceOrderBinding.confirmation`);
    } else if (accepted.sourceOrderBinding !== null) {
      throw new TypeError(`${label}.sourceOrderBinding must be null for column order.`);
    }
    return accepted;
  };
  const window = record(config.window, "configuration.window");
  const analysis = record(config.analysis, "configuration.analysis");
  const model = record(analysis.model, "configuration.analysis.model");
  const rowDimensions = window.type === "MovingStanzaWindow"
    ? policy(window.rowOrder, horizonColumns, "configuration.window.rowOrder") : null;
  const horizonDimensions = model.type !== "EndPoint"
    ? policy(model.horizonOrder, trajectoryColumns, "configuration.analysis.model.horizonOrder") : null;
  const rowOrdering = ordering(plan.rowOrdering, rowDimensions, horizonColumns, "rowOrdering", [
    "type", "requestedPolicy", "mappings", "orderedSourceRowIndices", "sourceOrderBinding", "textCollationBindings",
  ]);
  if (rowDimensions !== null) {
    length(rowOrdering.mappings, "rowOrdering.mappings", rowCount, true);
    length(rowOrdering.orderedSourceRowIndices, "rowOrdering.orderedSourceRowIndices", rowCount, true);
    for (const [index, value] of elements(rowOrdering.mappings, "rowOrdering.mappings").entries()) {
      const label = `rowOrdering.mappings[${index}]`;
      const mapping = record(value, label, ["sourceRowIndex", "horizonToken", "orderTuple", "withinHorizonOrdinal"]);
      length(mapping.orderTuple, `${label}.orderTuple`, rowDimensions.width, true);
    }
  }
  const horizonOrdering = ordering(plan.horizonOrdering, horizonDimensions, trajectoryColumns, "horizonOrdering", [
    "type", "requestedPolicy", "horizonTuples", "unitSequences", "implementationHorizonOrder", "sourceOrderBinding", "textCollationBindings",
  ]);
  if (horizonDimensions !== null) {
    length(horizonOrdering.horizonTuples, "horizonOrdering.horizonTuples", horizonCount, true);
    length(horizonOrdering.implementationHorizonOrder, "horizonOrdering.implementationHorizonOrder", horizonCount, true);
    length(horizonOrdering.unitSequences, "horizonOrdering.unitSequences", unitCount, true);
    const estimatedSteps = nonnegativeSafeIntegerV3(resource.trajectorySteps, "resourceEstimate.trajectorySteps");
    if (estimatedSteps > rowCount) throw new TypeError("Trajectory steps cannot exceed the source row count.");
    let totalSteps = 0;
    for (const [index, value] of elements(horizonOrdering.unitSequences, "horizonOrdering.unitSequences").entries()) {
      const label = `horizonOrdering.unitSequences[${index}]`;
      const sequence = record(value, label, ["unitToken", "steps"]);
      totalSteps += length(sequence.steps, `${label}.steps`, horizonCount);
      if (totalSteps > estimatedSteps) throw new TypeError("Trajectory step cardinality exceeds its resource estimate.");
    }
    if (totalSteps !== estimatedSteps) throw new TypeError("Trajectory step cardinality disagrees with its resource estimate.");
    for (const [index, value] of elements(horizonOrdering.horizonTuples, "horizonOrdering.horizonTuples").entries()) {
      const label = `horizonOrdering.horizonTuples[${index}]`;
      const tuple = record(value, label, ["horizonToken", "orderTuple"]);
      length(tuple.orderTuple, `${label}.orderTuple`, horizonDimensions.width, true);
    }
  }

  const dictionary = record(plan.codeDictionary, "codeDictionary");
  const codeTokens = elements(dictionary.codes, "codeDictionary.codes").map((value, index) => {
    const label = `codeDictionary.codes[${index}]`;
    return nonblankStringV3(record(value, label, ["token", "sourceColumn", "displayLabel", "canonicalIdentity"]).token, `${label}.token`);
  });
  for (const [index, value] of elements(proof.rows, "sourceProof.rows").entries()) {
    const label = `sourceProof.rows[${index}]`;
    const row = record(value, label, ["sourceRowIndex", "values"]);
    const values = record(row.values, `${label}.values`, selectedColumns);
    for (const column of selectedColumns) {
      const scalar = values[column];
      if (typeof scalar !== "string" && typeof scalar !== "boolean"
        && (typeof scalar !== "number" || !Number.isFinite(scalar))) {
        throw new TypeError(`${label}.values.${column} must be a finite JSON scalar.`);
      }
    }
  }
  const rowKeys = [
    "sourceRowIndex", "unitToken", "horizonToken", "groupToken", "codeValues",
    ...(rowDimensions === null ? [] : ["rowOrderTuple"]),
    ...(horizonDimensions === null ? [] : ["horizonOrderTuple"]),
  ];
  for (const [index, value] of elements(plan.rows, "executionPlan.rows").entries()) {
    const label = `executionPlan.rows[${index}]`;
    const row = record(value, label, rowKeys);
    if (rowDimensions !== null) length(row.rowOrderTuple, `${label}.rowOrderTuple`, rowDimensions.width, true);
    if (horizonDimensions !== null) length(row.horizonOrderTuple, `${label}.horizonOrderTuple`, horizonDimensions.width, true);
    const values = record(row.codeValues, `${label}.codeValues`, codeTokens);
    for (const token of codeTokens) finiteNumberV3(values[token], `${label}.codeValues.${token}`);
  }
}

function captureAdmittedExecutionPlanV3(
  admission: ExecutionPlanAdmissionCaptureV3,
): unknown {
  const acceptedRecords = new Map<object, Record<string, unknown>>();
  for (const guard of admission.records.values()) {
    const accepted = snapshotPlainJsonRecordV3(guard.original, guard.label);
    exactKeysV3(accepted, guard.expectedKeys, guard.label);
    sameDescriptorValuesV3(guard.admitted, accepted, guard.expectedKeys, guard.label);
    acceptedRecords.set(guard.original, accepted);
  }

  const acceptedArrayLengths = new Map<object, number>();
  for (const guard of admission.arrays.values()) {
    const acceptedLength = shallowArrayLengthV3(guard.original, guard.label);
    if (acceptedLength !== guard.admittedLength) {
      throw new TypeError(`${guard.label}.length changed after staged admission.`);
    }
    acceptedArrayLengths.set(guard.original, acceptedLength);
  }

  const acceptedArrayElements = new Map<object, unknown[]>();
  admitExecutionPlanCardinalitiesV3(admission.root, acceptedRecords, acceptedArrayLengths, acceptedArrayElements);

  const active = new WeakSet<object>();
  const detached = new WeakMap<object, unknown>();
  const visit = (value: unknown, label: string): unknown => {
    if (admission.reference !== null && value === admission.reference.original) return admission.reference.captured;
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new TypeError(`${label} must contain only finite JSON numbers.`);
      return Object.is(value, -0) ? 0 : value;
    }
    if (typeof value !== "object") {
      throw new TypeError(`${label} contains a value that is not a JSON value.`);
    }
    if (active.has(value)) throw new TypeError(`${label} contains a cyclic reference.`);
    const previous = detached.get(value);
    if (previous !== undefined) return previous;
    active.add(value);
    try {
      if (Array.isArray(value)) {
        const guardedLength = acceptedArrayLengths.get(value);
        if (guardedLength === undefined && Object.getPrototypeOf(value) !== Array.prototype) {
          throw new TypeError(`${label} must be a dense plain JSON array.`);
        }
        const length = guardedLength ?? arrayLengthDescriptorV3(value, label);
        const elements = acceptedArrayElements.get(value) ?? guardedDenseArrayElementsV3(value, length, label);
        const output = new Array<unknown>(length);
        detached.set(value, output);
        for (let index = 0; index < elements.length; index += 1) {
          output[index] = visit(elements[index], `${label}[${index}]`);
        }
        return output;
      }
      const record = acceptedRecords.get(value) ?? snapshotPlainJsonRecordV3(value, label);
      const output: Record<string, unknown> = {};
      detached.set(value, output);
      for (const key of Object.keys(record)) {
        Object.defineProperty(output, key, {
          value: visit(record[key], `${label}.${key}`),
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
      return output;
    } finally {
      active.delete(value);
    }
  };
  return visit(admission.root, "executionPlan");
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

function selectedSourceColumnsV3(config: CanonicalStandardConfigV3): string[] {
  const selected = new Set<string>([
    ...config.units.columns,
    ...config.horizons.columns,
    ...config.codes.map((code) => code.column),
  ]);
  if (config.units.group.type === "stable-metadata") selected.add(config.units.group.column);
  if (config.window.type === "MovingStanzaWindow" && config.window.rowOrder.kind === "columns") {
    for (const key of config.window.rowOrder.keys) selected.add(key.column);
  }
  if (config.analysis.model.type !== "EndPoint" && config.analysis.model.horizonOrder.kind === "columns") {
    for (const key of config.analysis.model.horizonOrder.keys) selected.add(key.column);
  }
  return [...selected].sort(codeUnitCompareV3);
}

function selectedSourceValueV3(row: object, column: string, label: string): string | number | boolean {
  const descriptor = Object.getOwnPropertyDescriptor(row, column);
  if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
    throw new TypeError(`${label}.${column} must be an own enumerable data property.`);
  }
  const value = descriptor.value;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return Object.is(value, -0) ? 0 : value;
  throw new TypeError(`${label}.${column} must be a finite JSON scalar selected by the Standard configuration.`);
}

/** @internal Shared by the compiler and plan builder after their coherent dataset snapshot. */
export function buildStandardSourceProofPayloadV3(
  datasetValue: ParsedDataset,
  bindingValue: DatasetBindingV3,
  config: CanonicalStandardConfigV3,
): StandardSourceProofPayloadV3 {
  const datasetRecord = snapshotPlainJsonRecordV3(datasetValue, "source proof dataset");
  const expectedDatasetKeys = own.call(datasetRecord, "hashKind")
    ? ["name", "headers", "rows", "sizeBytes", "source", "hashKind"]
    : ["name", "headers", "rows", "sizeBytes", "source"];
  exactKeysV3(datasetRecord, expectedDatasetKeys, "source proof dataset");
  const name = nonblankStringV3(datasetRecord.name, "source proof dataset.name");
  if (datasetRecord.source !== "sample" && datasetRecord.source !== "upload") {
    throw new TypeError("source proof dataset.source is unsupported.");
  }
  const hashKind = datasetHashKindFor({
    name,
    ...(own.call(datasetRecord, "hashKind") ? { hashKind: datasetRecord.hashKind as DatasetHashKind } : {}),
  });
  const binding = datasetBindingV3(bindingValue, "source proof dataset binding");
  const sizeBytes = nonnegativeSafeIntegerV3(
    datasetRecord.sizeBytes,
    "source proof dataset.sizeBytes",
  );
  const headers = stringArrayV3(datasetRecord.headers, "source proof headers", true);
  const rowValues = denseArrayV3(datasetRecord.rows, "source proof rows");
  if (hashKind !== binding.hashKind || rowValues.length !== binding.rowCount) {
    throw new TypeError("Source proof dataset does not match its compiler binding.");
  }
  const selectedColumns = selectedSourceColumnsV3(config);
  const headerSet = new Set(headers);
  if (selectedColumns.some((column) => !headerSet.has(column))) {
    throw new TypeError("Source proof selected columns must exist in the complete header list.");
  }
  const rows = rowValues.map((rowValue, sourceRowIndex): StandardSourceProofRowV3 => {
    if (rowValue === null || typeof rowValue !== "object" || Array.isArray(rowValue)) {
      throw new TypeError(`source proof row ${sourceRowIndex} must be a plain object.`);
    }
    const prototype = Object.getPrototypeOf(rowValue);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`source proof row ${sourceRowIndex} must be a plain object.`);
    }
    const values = Object.create(null) as Record<string, string | number | boolean>;
    for (const column of selectedColumns) {
      Object.defineProperty(values, column, {
        value: selectedSourceValueV3(rowValue, column, `source proof row ${sourceRowIndex}`),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return { sourceRowIndex, values };
  });
  return {
    schemaVersion: 1,
    dataset: {
      name,
      source: datasetRecord.source,
      hashKind,
      normalizedTableSha256: binding.normalizedTableSha256,
      externalHashVerification: "provenance-only-no-normalized-table-preimage",
      rowCount: binding.rowCount,
      sizeBytes,
    },
    headers,
    selectedColumns,
    rows,
  };
}

function sourceProofPayloadV3(proof: StandardSourceProofV3): StandardSourceProofPayloadV3 {
  const snapshot = plainRecordV3(snapshotJsonValueV3(proof), "sourceProof");
  delete snapshot.sourceProofSha256;
  return snapshot as unknown as StandardSourceProofPayloadV3;
}

function parsedDatasetFromSourceProofV3(proof: StandardSourceProofPayloadV3): ParsedDataset {
  const rows = [...proof.rows]
    .sort((left, right) => left.sourceRowIndex - right.sourceRowIndex)
    .map((row) => row.values);
  return deepFreezeV3({
    name: proof.dataset.name,
    headers: [...proof.headers],
    rows,
    sizeBytes: proof.dataset.sizeBytes,
    source: proof.dataset.source,
    hashKind: proof.dataset.hashKind,
  }) as unknown as ParsedDataset;
}

function decodeStandardSourceProofV3(
  value: unknown,
  config: CanonicalStandardConfigV3,
  binding: DatasetBindingV3,
  rowCount: number,
): StandardSourceProofV3 {
  const record = plainRecordV3(value, "executionPlan.sourceProof");
  exactKeysV3(record, SOURCE_PROOF_KEYS_V3, "executionPlan.sourceProof");
  if (record.schemaVersion !== 1) throw new TypeError("executionPlan.sourceProof.schemaVersion must be 1.");
  const dataset = plainRecordV3(record.dataset, "executionPlan.sourceProof.dataset");
  exactKeysV3(dataset, SOURCE_PROOF_DATASET_KEYS_V3, "executionPlan.sourceProof.dataset");
  const name = nonblankStringV3(dataset.name, "executionPlan.sourceProof.dataset.name");
  if (dataset.source !== "sample" && dataset.source !== "upload") {
    throw new TypeError("executionPlan.sourceProof.dataset.source is unsupported.");
  }
  const hashKind = datasetHashKindV3(dataset.hashKind, "executionPlan.sourceProof.dataset.hashKind");
  const normalizedTableSha256 = lowercaseSha256V3(
    dataset.normalizedTableSha256,
    "executionPlan.sourceProof.dataset.normalizedTableSha256",
  );
  const proofRowCount = nonnegativeSafeIntegerV3(dataset.rowCount, "executionPlan.sourceProof.dataset.rowCount");
  const sizeBytes = nonnegativeSafeIntegerV3(
    dataset.sizeBytes,
    "executionPlan.sourceProof.dataset.sizeBytes",
  );
  if (dataset.externalHashVerification !== "provenance-only-no-normalized-table-preimage"
    || hashKind !== binding.hashKind
    || normalizedTableSha256 !== binding.normalizedTableSha256
    || proofRowCount !== binding.rowCount
    || proofRowCount !== rowCount) {
    throw new TypeError("Execution source proof provenance does not match its compiler dataset binding.");
  }
  const headers = stringArrayV3(record.headers, "executionPlan.sourceProof.headers", true);
  const selectedColumns = stringArrayV3(
    record.selectedColumns,
    "executionPlan.sourceProof.selectedColumns",
    true,
  );
  exactJsonEqualV3(selectedColumns, selectedSourceColumnsV3(config), "Execution source proof selected columns");
  const headerSet = new Set(headers);
  if (selectedColumns.some((column) => !headerSet.has(column))) {
    throw new TypeError("Execution source proof selected columns must exist in its complete headers.");
  }
  const rows = denseArrayV3(record.rows, "executionPlan.sourceProof.rows").map((entry, index) => {
    const row = plainRecordV3(entry, `executionPlan.sourceProof.rows[${index}]`);
    exactKeysV3(row, ["sourceRowIndex", "values"], `executionPlan.sourceProof.rows[${index}]`);
    const sourceRowIndex = nonnegativeSafeIntegerV3(
      row.sourceRowIndex,
      `executionPlan.sourceProof.rows[${index}].sourceRowIndex`,
    );
    const valuesRecord = plainRecordV3(row.values, `executionPlan.sourceProof.rows[${index}].values`);
    exactKeysV3(valuesRecord, selectedColumns, `executionPlan.sourceProof.rows[${index}].values`);
    const values = Object.create(null) as Record<string, string | number | boolean>;
    for (const column of selectedColumns) {
      const selected = valuesRecord[column];
      if (typeof selected !== "string" && typeof selected !== "boolean"
        && (typeof selected !== "number" || !Number.isFinite(selected))) {
        throw new TypeError(`executionPlan.sourceProof.rows[${index}].values.${column} is not a finite JSON scalar.`);
      }
      Object.defineProperty(values, column, {
        value: typeof selected === "number" && Object.is(selected, -0) ? 0 : selected,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return { sourceRowIndex, values };
  });
  arrayPermutationV3(
    rows.map((row) => row.sourceRowIndex),
    rowCount,
    "executionPlan.sourceProof sourceRowIndex values",
  );
  return {
    schemaVersion: 1,
    dataset: {
      name,
      source: dataset.source,
      hashKind,
      normalizedTableSha256,
      externalHashVerification: "provenance-only-no-normalized-table-preimage",
      rowCount,
      sizeBytes,
    },
    headers,
    selectedColumns,
    rows,
    sourceProofSha256: lowercaseSha256V3(
      record.sourceProofSha256,
      "executionPlan.sourceProof.sourceProofSha256",
    ),
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
  readonly sourceProofSha256: string;
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
    "sourceProofSha256",
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
    sourceProofSha256: lowercaseSha256V3(
      snapshot.sourceProofSha256,
      "compileResult.sourceProofSha256",
    ),
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

async function referenceBindingV3(
  value: unknown,
  config: CanonicalStandardConfigV3,
  _dictionary: StandardCodeDictionaryV3,
): Promise<ValidatedReferenceExecutionBindingV3 | null> {
  const rotation = config.analysis.rotation;
  if (rotation.type === "reference") {
    const captured = captureReferenceExecutionBindingV3(value);
    const derived = await bindReferenceToTargetV3(captured.artifact, config);
    exactJsonEqualV3(captured, derived, "Reference rederived execution binding");
    return derived;
  }
  if (value !== null) throw new TypeError("SVD and Means execution plans must not carry a Reference binding.");
  return null;
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
  if (compile.canonicalConfiguration.analysis.rotation.type === "reference" && inputRecord.reference === null) {
    throw new TypeError("Reference execution requires a complete artifact binding.");
  }
  if (compile.canonicalConfiguration.analysis.rotation.type !== "reference" && inputRecord.reference !== null) {
    throw new TypeError("SVD and Means execution plans must not carry a Reference binding.");
  }
  const datasetSha256 = lowercaseSha256V3(inputRecord.datasetSha256, "datasetSha256");
  if (datasetSha256 !== compile.datasetBinding.normalizedTableSha256) {
    throw new TypeError("datasetSha256 does not match the ready compile invocation.");
  }
  const envelope = compilerDatasetEnvelopeV3(inputRecord.dataset as ParsedDataset);
  const rowLengthDescriptor = Object.getOwnPropertyDescriptor(envelope.rows, "length");
  if (rowLengthDescriptor === undefined
    || !("value" in rowLengthDescriptor)
    || rowLengthDescriptor.value !== compile.datasetBinding.rowCount
    || compile.resourceEstimate.rows !== compile.datasetBinding.rowCount
    || compile.resourceEstimate.codes !== compile.canonicalConfiguration.codes.length
    || compile.resourceEstimate.datasetSizeBytes !== envelope.sizeBytes) {
    throw new TypeError("Ready compiler binding/resource envelope is inconsistent.");
  }
  const earlyAdmission = estimateEarlyStandardResourcesV3({
    rowCount: compile.datasetBinding.rowCount,
    codeCount: compile.canonicalConfiguration.codes.length,
    datasetSizeBytes: envelope.sizeBytes,
    identityPayloadBytes: 0,
  });
  if (earlyAdmission.blocked) {
    throw new TypeError("Ready compiler envelope exceeds the fixed pre-snapshot resource budget.");
  }
  const referenceSnapshot = inputRecord.reference === null ? null : captureReferenceExecutionBindingV3(inputRecord.reference, {
    estimatedNumericCells: compile.resourceEstimate.estimatedNumericCells,
    estimatedPeakBytes: Math.max(earlyAdmission.estimatedPeakBytes, compile.resourceEstimate.estimatedPeakBytes),
    estimatedExportBytes: compile.resourceEstimate.estimatedExportBytes,
  });
  const dataset = snapshotCompilerDatasetInputV3(envelope, compile.datasetBinding);
  if (datasetHashKindFor(dataset) !== compile.datasetBinding.hashKind) {
    throw new TypeError("The dataset hash kind does not match the ready compile invocation.");
  }
  const sourceProofPayload = buildStandardSourceProofPayloadV3(
    dataset,
    compile.datasetBinding,
    compile.canonicalConfiguration,
  );
  const sourceProofSha256 = await sha256CanonicalJsonV3(sourceProofPayload);
  if (sourceProofSha256 !== compile.sourceProofSha256) {
    throw new TypeError("Selected source proof does not match the ready compile invocation.");
  }
  const proofDataset = parsedDatasetFromSourceProofV3(sourceProofPayload);
  const exactResourceEstimate = exactStandardResourceEstimateV3(proofDataset, compile.canonicalConfiguration);
  exactJsonEqualV3(exactResourceEstimate, compile.resourceEstimate, "Ready compiler resource estimate");
  if (exactResourceEstimate.blocked) throw new TypeError("A blocked resource estimate cannot build a plan.");
  if (referenceSnapshot) assertReferenceAdmissionV3(referenceSnapshot.admission, exactResourceEstimate);

  // Resource admission precedes the quadratic edge dictionary allocation.
  const codeDictionary = buildStandardCodeDictionaryV3(compile.canonicalConfiguration.codes);
  const codeRepresentations = buildCodeRepresentationBindingsV3(
    proofDataset.rows,
    compile.canonicalConfiguration.weighting,
    codeDictionary,
  );
  const codeValues = proofDataset.rows.map((row) => materializeStandardCodesV3(
    row,
    compile.canonicalConfiguration.weighting,
    codeDictionary,
  ));
  const context = sourceOrderContextV3(compile.datasetBinding);
  const sourceRowOrdering = compile.canonicalConfiguration.window.type === "MovingStanzaWindow"
    ? resolveRowOrderV3(
        proofDataset.rows as Array<Record<string, unknown>>,
        compile.canonicalConfiguration.horizons.columns,
        compile.canonicalConfiguration.window.rowOrder,
        context,
      )
    : null;
  const sourceHorizonOrdering = compile.canonicalConfiguration.analysis.model.type === "EndPoint"
    ? null
    : resolveHorizonOrderV3(
        proofDataset.rows as Array<Record<string, unknown>>,
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
    proofDataset.rows as Array<Record<string, unknown>>,
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
  const reference = await referenceBindingV3(referenceSnapshot, compile.canonicalConfiguration, codeDictionary);
  const sourceProof: StandardSourceProofV3 = {
    ...sourceProofPayload,
    sourceProofSha256,
  };
  const rows = materializedRowsV3({
    dataset: proofDataset,
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
    sourceProof,
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

/** @internal Linear implementation-order lookup; intentionally absent from the public v3 barrel. */
export function implementationHorizonPermutationV3(
  horizonTokens: readonly string[],
  implementationOrder: readonly string[],
): number[] {
  const indexByToken = new Map<string, number>();
  for (let index = 0; index < horizonTokens.length; index += 1) {
    const token = horizonTokens[index];
    if (indexByToken.has(token)) throw new TypeError("Resolved Horizon tuples must be unique.");
    indexByToken.set(token, index);
  }
  return implementationOrder.map((token) => {
    const index = indexByToken.get(token);
    if (index === undefined) throw new TypeError("Implementation Horizon order contains an unknown Horizon token.");
    return index;
  });
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
    implementationHorizonPermutationV3(
      horizonTuples.map((entry) => entry.horizonToken),
      implementationHorizonOrder,
    ),
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

function undirectedEdgeCountV3(codeCount: number): number {
  const product = codeCount * Math.max(0, codeCount - 1);
  if (!Number.isSafeInteger(product)) {
    throw new TypeError("Standard Code count exceeds safe undirected-edge arithmetic.");
  }
  return product / 2;
}

/**
 * Descriptor-safe lower-bound admission. This reads fixed metadata and array
 * length descriptors only; scientific array elements remain untouched until
 * both source-envelope and dense-rotation lower bounds are admitted.
 */
function admitExecutionPlanEnvelopeV3(value: unknown): ExecutionPlanAdmissionCaptureV3 {
  const capture: MutableExecutionPlanAdmissionCaptureV3 = {
    records: new Map(),
    arrays: new Map(),
  };
  const plan = stageRecordV3(
    capture,
    value,
    EXECUTION_PLAN_ROOT_KEYS_V3,
    "executionPlan",
  );

  const configuration = stageRecordV3(
    capture,
    plan.configuration,
    STANDARD_CONFIGURATION_KEYS_V3,
    "executionPlan.configuration",
  );
  if (configuration.schemaVersion !== 3 || configuration.analysisFamily !== "standard") {
    throw new TypeError("Execution plan configuration must be Standard schema v3.");
  }
  const analysis = stageRecordV3(
    capture,
    configuration.analysis,
    ["model", "rotation"],
    "executionPlan.configuration.analysis",
  );
  const rotation = stageRecordShapeV3(
    capture,
    analysis.rotation,
    "executionPlan.configuration.analysis.rotation",
  );
  if ((rotation.type === "reference") !== (plan.reference !== null)) throw new TypeError("Reference configuration must carry exactly one complete Reference binding.");
  const codeCount = stageArrayLengthV3(
    capture,
    configuration.codes,
    "executionPlan.configuration.codes",
  );

  const header = stageRecordV3(
    capture,
    plan.header,
    EXECUTION_PLAN_HEADER_KEYS_V3,
    "executionPlan.header",
  );
  if (header.schemaVersion !== 3 || header.analysisFamily !== "standard") {
    throw new TypeError("Execution plan header must be Standard schema v3.");
  }
  const rowCount = nonnegativeSafeIntegerV3(header.rowCount, "executionPlan.header.rowCount");
  const binding = stageRecordV3(
    capture,
    header.datasetBinding,
    ["hashKind", "normalizedTableSha256", "rowCount", "headerSha256"],
    "executionPlan.header.datasetBinding",
  );
  const bindingRows = nonnegativeSafeIntegerV3(
    binding.rowCount,
    "executionPlan.header.datasetBinding.rowCount",
  );
  const resource = stageRecordV3(
    capture,
    header.resourceEstimate,
    STANDARD_RESOURCE_KEYS_V3,
    "executionPlan.header.resourceEstimate",
  );
  if (resource.version !== RESOURCE_BUDGET_VERSION_V3 || resource.analysisFamily !== "standard") {
    throw new TypeError("Execution plan resource estimate has an unsupported contract.");
  }
  const resourceRows = nonnegativeSafeIntegerV3(
    resource.rows,
    "executionPlan.header.resourceEstimate.rows",
  );
  const resourceCodes = nonnegativeSafeIntegerV3(
    resource.codes,
    "executionPlan.header.resourceEstimate.codes",
  );
  const resourceDatasetSizeBytes = nonnegativeSafeIntegerV3(
    resource.datasetSizeBytes,
    "executionPlan.header.resourceEstimate.datasetSizeBytes",
  );
  const resourceAdjacencyDimensions = nonnegativeSafeIntegerV3(
    resource.adjacencyDimensions,
    "executionPlan.header.resourceEstimate.adjacencyDimensions",
  );
  const blockedReasonCount = stageArrayLengthV3(
    capture,
    resource.blockedReasons,
    "executionPlan.header.resourceEstimate.blockedReasons",
  );
  if (resource.blocked !== false || blockedReasonCount !== 0) {
    throw new TypeError("Execution plan resource estimate must already be admitted.");
  }

  const sourceProof = stageRecordV3(
    capture,
    plan.sourceProof,
    SOURCE_PROOF_KEYS_V3,
    "executionPlan.sourceProof",
  );
  if (sourceProof.schemaVersion !== 1) {
    throw new TypeError("executionPlan.sourceProof.schemaVersion must be 1.");
  }
  const proofDataset = stageRecordV3(
    capture,
    sourceProof.dataset,
    SOURCE_PROOF_DATASET_KEYS_V3,
    "executionPlan.sourceProof.dataset",
  );
  const proofRowCount = nonnegativeSafeIntegerV3(
    proofDataset.rowCount,
    "executionPlan.sourceProof.dataset.rowCount",
  );
  const datasetSizeBytes = nonnegativeSafeIntegerV3(
    proofDataset.sizeBytes,
    "executionPlan.sourceProof.dataset.sizeBytes",
  );
  const proofRows = stageArrayLengthV3(
    capture,
    sourceProof.rows,
    "executionPlan.sourceProof.rows",
  );
  const planRows = stageArrayLengthV3(capture, plan.rows, "executionPlan.rows");

  const codeDictionary = stageRecordV3(
    capture,
    plan.codeDictionary,
    ["codes", "edges"],
    "executionPlan.codeDictionary",
  );
  const dictionaryCodes = stageArrayLengthV3(
    capture,
    codeDictionary.codes,
    "executionPlan.codeDictionary.codes",
  );
  const dictionaryEdges = stageArrayLengthV3(
    capture,
    codeDictionary.edges,
    "executionPlan.codeDictionary.edges",
  );
  const representationCount = stageArrayLengthV3(
    capture,
    plan.codeRepresentations,
    "executionPlan.codeRepresentations",
  );
  const adapter = stageRecordV3(
    capture,
    plan.adapterParameters,
    STANDARD_ADAPTER_PARAMETER_KEYS_V3,
    "executionPlan.adapterParameters",
  );
  const adapterCodeCount = stageArrayLengthV3(
    capture,
    adapter.codeTokens,
    "executionPlan.adapterParameters.codeTokens",
  );
  const expectedEdges = undirectedEdgeCountV3(codeCount);

  if (rowCount !== bindingRows
    || rowCount !== resourceRows
    || rowCount !== proofRowCount
    || rowCount !== proofRows
    || rowCount !== planRows
    || codeCount !== resourceCodes
    || codeCount !== dictionaryCodes
    || codeCount !== representationCount
    || codeCount !== adapterCodeCount
    || expectedEdges !== dictionaryEdges
    || expectedEdges !== resourceAdjacencyDimensions
    || datasetSizeBytes !== resourceDatasetSizeBytes) {
    throw new TypeError("Execution plan shallow envelope metadata is inconsistent.");
  }

  const early = estimateEarlyStandardResourcesV3({
    rowCount,
    codeCount,
    datasetSizeBytes,
    identityPayloadBytes: 0,
  });
  if (early.blocked) {
    throw new TypeError("Execution plan exceeds the fixed pre-materialization resource budget.");
  }
  const occupiedSizes = rowCount === 0 ? [] : [rowCount];
  const lowerBound = estimateStandardResourcesV3({
    rowCount,
    unitCount: rowCount === 0 ? 0 : 1,
    horizonCount: rowCount === 0 ? 0 : 1,
    codeCount,
    horizonSizes: occupiedSizes,
    windowPartitionSizes: occupiedSizes,
    trajectorySteps: rowCount === 0 ? 0 : 1,
    windowType: "MovingStanzaWindow",
    backward: { kind: "finite", value: 1 },
    forward: { kind: "finite", value: 0 },
    referenceProjection: rotation.type === "reference",
    datasetSizeBytes,
    identityPayloadBytes: 0,
  });
  if (lowerBound.blocked) {
    throw new TypeError("Execution plan exceeds an unavoidable Standard resource lower bound.");
  }
  const reference = plan.reference === null ? null : {
    original: plan.reference as object,
    captured: captureReferenceExecutionBindingV3(plan.reference, {
      estimatedNumericCells: Math.max(lowerBound.estimatedNumericCells, nonnegativeSafeIntegerV3(resource.estimatedNumericCells, "resourceEstimate.estimatedNumericCells")),
      estimatedPeakBytes: Math.max(early.estimatedPeakBytes, lowerBound.estimatedPeakBytes, nonnegativeSafeIntegerV3(resource.estimatedPeakBytes, "resourceEstimate.estimatedPeakBytes")),
      estimatedExportBytes: Math.max(lowerBound.estimatedExportBytes, nonnegativeSafeIntegerV3(resource.estimatedExportBytes, "resourceEstimate.estimatedExportBytes")),
    }),
  };
  return {
    root: value as object,
    records: capture.records,
    arrays: capture.arrays,
    reference,
  };
}

async function decodePlanShapeV3(value: unknown): Promise<StandardExecutionPlanV3> {
  const plan = plainRecordV3(value, "executionPlan");
  exactKeysV3(plan, EXECUTION_PLAN_ROOT_KEYS_V3, "executionPlan");
  const headerRecord = plainRecordV3(plan.header, "executionPlan.header");
  exactKeysV3(headerRecord, EXECUTION_PLAN_HEADER_KEYS_V3, "executionPlan.header");
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
  const sourceProof = decodeStandardSourceProofV3(
    plan.sourceProof,
    configuration,
    binding,
    rowCount,
  );
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
  const reference = await referenceBindingV3(plan.reference, configuration, codeDictionary);
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
    sourceProof,
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
  // Shallow admission precedes canonical capture so hostile or impossible
  // envelopes cannot force scientific-array traversal or dense dictionaries.
  const admission = admitExecutionPlanEnvelopeV3(input);
  const capturedInput = captureAdmittedExecutionPlanV3(admission);
  // The accepted descriptor capture runs before any await. The deep decoder
  // consumes only its detached graph and never reads caller-owned input again.
  const plan = await decodePlanShapeV3(capturedInput);
  const sourceProofPayload = sourceProofPayloadV3(plan.sourceProof);
  const proofDataset = parsedDatasetFromSourceProofV3(sourceProofPayload);
  const sourceProofHashOutcomePromise = settlePromiseV3(sha256CanonicalJsonV3(sourceProofPayload));
  const headerHashOutcomePromise = settlePromiseV3(sha256CanonicalJsonV3(sourceProofPayload.headers));
  const identityOutcomePromise = settlePromiseV3(buildExecutionIdentityDictionaryV3(
    proofDataset.rows as Array<Record<string, unknown>>,
    plan.configuration.units.columns,
    plan.configuration.horizons.columns,
    plan.configuration.units.group.type === "stable-metadata"
      ? plan.configuration.units.group.column
      : null,
  ));
  const configurationHashOutcomePromise = settlePromiseV3(sha256CanonicalJsonV3(plan.configuration));
  const planHashOutcomePromise = settlePromiseV3(sha256CanonicalJsonV3(executionPlanWithoutHashV3(plan)));
  const [sourceProofHashOutcome, headerHashOutcome, identityOutcome, configurationHashOutcome, planHashOutcome] = await Promise.all([
    sourceProofHashOutcomePromise,
    headerHashOutcomePromise,
    identityOutcomePromise,
    configurationHashOutcomePromise,
    planHashOutcomePromise,
  ] as const);
  const sourceProofSha256 = outcomeValueV3(sourceProofHashOutcome);
  const headerSha256 = outcomeValueV3(headerHashOutcome);
  const identities = outcomeValueV3(identityOutcome);
  const configurationSha256 = outcomeValueV3(configurationHashOutcome);
  const executionPlanSha256 = outcomeValueV3(planHashOutcome);
  if (sourceProofSha256 !== plan.sourceProof.sourceProofSha256) {
    throw new TypeError("Execution source-proof SHA-256 does not match its selected source evidence.");
  }
  if (headerSha256 !== plan.header.headerSha256) {
    throw new TypeError("Execution source-proof headers do not match the compiler header binding.");
  }
  if (configurationSha256 !== plan.header.configurationSha256) {
    throw new TypeError("Execution-plan configuration SHA-256 does not match its canonical configuration.");
  }
  if (executionPlanSha256 !== plan.header.executionPlanSha256) {
    throw new TypeError("Execution-plan SHA-256 does not match its content.");
  }
  exactJsonEqualV3(plan.identityDictionary, identities, "Execution identity dictionary derived from source proof");

  const expectedCodeRepresentations = buildCodeRepresentationBindingsV3(
    proofDataset.rows,
    plan.configuration.weighting,
    plan.codeDictionary,
  );
  exactJsonEqualV3(
    plan.codeRepresentations,
    expectedCodeRepresentations,
    "Execution Code representations derived from source proof",
  );
  const context = sourceOrderContextV3(plan.header.datasetBinding);
  const unitTokens = tokenByCanonicalJsonV3(identities.units, "Unit dictionary");
  const horizonTokens = tokenByCanonicalJsonV3(identities.horizons, "Horizon dictionary");
  const sourceRowOrdering = plan.configuration.window.type === "MovingStanzaWindow"
    ? resolveRowOrderV3(
        proofDataset.rows as Array<Record<string, unknown>>,
        plan.configuration.horizons.columns,
        plan.configuration.window.rowOrder,
        context,
      )
    : null;
  const expectedRowOrdering: ResolvedExecutionRowOrderingV3 | NotApplicableOrderingV3 = sourceRowOrdering === null
    ? { type: "not-applicable", reason: "conversation-window" }
    : mapRowOrderingV3(sourceRowOrdering, horizonTokens);
  const sourceHorizonOrdering = plan.configuration.analysis.model.type === "EndPoint"
    ? null
    : resolveHorizonOrderV3(
        proofDataset.rows as Array<Record<string, unknown>>,
        plan.configuration.units.columns,
        plan.configuration.horizons.columns,
        plan.configuration.analysis.model.horizonOrder,
        context,
      );
  const expectedHorizonOrdering: ResolvedExecutionHorizonOrderingV3 | NotApplicableOrderingV3 = sourceHorizonOrdering === null
    ? { type: "not-applicable", reason: "endpoint-model" }
    : mapHorizonOrderingV3(
        sourceHorizonOrdering,
        plan.configuration.analysis.model.type === "EndPoint"
          ? (() => { throw new TypeError("Endpoint cannot carry trajectory ordering."); })()
          : plan.configuration.analysis.model.horizonOrder,
        unitTokens,
        horizonTokens,
      );
  exactJsonEqualV3(plan.rowOrdering, expectedRowOrdering, "Authoritative resolved row ordering");
  exactJsonEqualV3(plan.horizonOrdering, expectedHorizonOrdering, "Authoritative resolved Horizon ordering");
  const codeValues = proofDataset.rows.map((row) => materializeStandardCodesV3(
    row,
    plan.configuration.weighting,
    plan.codeDictionary,
  ));
  const expectedRows = materializedRowsV3({
    dataset: proofDataset,
    config: plan.configuration,
    identities,
    dictionary: plan.codeDictionary,
    codeValues,
    rowOrdering: expectedRowOrdering,
    horizonOrdering: expectedHorizonOrdering,
  });
  exactJsonEqualV3(plan.rows, expectedRows, "Execution rows derived from source proof");
  const expectedAdapterParameters = buildAdapterParametersV3(plan.configuration, plan.codeDictionary);
  exactJsonEqualV3(plan.adapterParameters, expectedAdapterParameters, "Standard adapter parameters");
  exactJsonEqualV3(plan.weighting, {
    scientific: plan.configuration.weighting.type,
    runtime: expectedAdapterParameters.weightBy,
  }, "Execution weighting provenance");
  assertIdentityMembershipV3(identities, plan.rows, plan.configuration);
  const exactResourceEstimate = exactStandardResourceEstimateV3(proofDataset, plan.configuration);
  exactJsonEqualV3(exactResourceEstimate, plan.header.resourceEstimate, "Execution resource estimate");
  if (plan.reference) assertReferenceAdmissionV3(plan.reference.admission, exactResourceEstimate);
  return deepFreezeV3({ ...plan, identityDictionary: identities });
}
