import {
  canonicalJsonV3,
  deepFreezeV3,
  sha256CanonicalJsonV3,
  sha256TextV3,
  snapshotDenseJsonArrayV3,
  snapshotPlainJsonRecordV3,
} from "./canonical-json";
import {
  validateStandardDraftV3,
} from "./diagnostics";
import type {
  ModelCapabilityV3,
  ModelDiagnosticV3,
} from "./diagnostics";
import { scalarIdentityV3 } from "./identity";
import { resolveRowOrderV3 } from "./ordering";
import {
  MAX_ESTIMATED_IDENTITY_PAYLOAD_BYTES_V3,
  ResourceEstimateErrorV3,
  estimateCanonicalIdentityAdmissionFieldPayloadBytesV3,
  estimateOnaResourcesV3,
  estimateStandardResourcesV3,
} from "./resource-budget";
import type {
  OnaResourceEstimateV3,
  StandardResourceEstimateV3,
} from "./resource-budget";
import {
  decodeCanonicalOnaConfigV3,
  decodeCanonicalStandardConfigV3,
} from "./schema";
import {
  OPEN_ENA_RUNTIME_POLICY_VERSION_V3,
  OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3,
} from "./types";
import type {
  CanonicalOnaConfigV3,
  CanonicalStandardConfigV3,
  DatasetBindingV3,
  OrderedNetworkDraftV3,
  StandardEnaDraftV3,
} from "./types";
import { datasetHashKindFor } from "../types";
import type { ParsedDataset } from "../types";

const LOWERCASE_SHA256 = /^[a-f0-9]{64}$/u;
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

export type ModelCapabilityStatusV3 = Readonly<Record<ModelCapabilityV3, "available" | "blocked">>;

export type StandardCompileResultV3 = InvalidStandardCompileResultV3 | ReadyStandardCompileResultV3;

export interface InvalidStandardCompileResultV3 {
  readonly status: "invalid";
  readonly draftFingerprint: string;
  readonly diagnostics: readonly ModelDiagnosticV3[];
  readonly canonicalConfiguration: null;
}

export interface ReadyStandardCompileResultV3 {
  readonly status: "ready";
  readonly draftFingerprint: string;
  readonly canonicalConfiguration: CanonicalStandardConfigV3;
  readonly configurationSha256: string;
  readonly diagnostics: readonly ModelDiagnosticV3[];
  readonly capabilityStatus: ModelCapabilityStatusV3;
  /** Exact post-validation estimate; early-envelope telemetry is never returned here. */
  readonly resourceEstimate: StandardResourceEstimateV3;
}

export type OnaCompilerDiagnosticIdV3 =
  | "ONA_DATASET_BINDING_INVALID"
  | "ONA_DRAFT_INVALID"
  | "ONA_RESOURCE_BUDGET_EXCEEDED";

export interface OnaCompilerDiagnosticV3 {
  readonly id: OnaCompilerDiagnosticIdV3;
  readonly severity: "error";
  readonly scope: "dataset" | "model" | "resources";
  readonly summary: string;
  readonly detail: string;
  readonly blocks: readonly ModelCapabilityV3[];
}

export type OnaCompileResultV3 = InvalidOnaCompileResultV3 | ReadyOnaCompileResultV3;

export interface InvalidOnaCompileResultV3 {
  readonly status: "invalid";
  readonly draftFingerprint: string;
  readonly diagnostics: readonly OnaCompilerDiagnosticV3[];
  readonly canonicalConfiguration: null;
}

export interface ReadyOnaCompileResultV3 {
  readonly status: "ready";
  readonly draftFingerprint: string;
  readonly canonicalConfiguration: CanonicalOnaConfigV3;
  readonly configurationSha256: string;
  readonly diagnostics: readonly OnaCompilerDiagnosticV3[];
  readonly capabilityStatus: ModelCapabilityStatusV3;
  /** Exact post-validation estimate; ONA has no public early-envelope result. */
  readonly resourceEstimate: OnaResourceEstimateV3;
}

function capabilityStatusV3(
  diagnostics: readonly Pick<ModelDiagnosticV3, "blocks">[],
): ModelCapabilityStatusV3 {
  const blocked = new Set(diagnostics.flatMap((entry) => entry.blocks));
  return deepFreezeV3(Object.fromEntries(MODEL_CAPABILITIES_V3.map((capability) => [
    capability,
    blocked.has(capability) ? "blocked" : "available",
  ])) as Record<ModelCapabilityV3, "available" | "blocked">);
}

function datasetBindingDiagnosticV3(): ModelDiagnosticV3 {
  return deepFreezeV3({
    id: "STANDARD_DATASET_BINDING_INVALID",
    severity: "error",
    scope: "dataset",
    fieldPath: "datasetBinding",
    summary: "The dataset binding is invalid.",
    detail: "The dataset hash kind, normalized-table SHA-256, row count, and canonical header SHA-256 must describe the current dataset exactly.",
    blocks: ["build-model", "export-current-model", "export-reference"],
  });
}

function exactResourceDiagnosticV3(estimate: StandardResourceEstimateV3 | null): ModelDiagnosticV3 {
  const reasons = estimate?.blockedReasons ?? ["unsafe-arithmetic"];
  return deepFreezeV3({
    id: "RESOURCE_BUDGET_EXCEEDED",
    severity: "error",
    scope: "resources",
    fieldPath: "resources",
    summary: "The exact model configuration exceeds the fixed resource budget.",
    detail: "No rows, Codes, extents, or Horizons were reduced automatically; revise the configuration explicitly before model construction or export.",
    blocks: ["build-model", "export-current-model", "export-reference"],
    evidence: {
      totalCount: reasons.length,
      sampleLimit: 5,
      samples: reasons.slice(0, 5).map((reason) => ({ identity: reason, detail: String(reason) })),
      truncated: reasons.length > 5,
    },
  });
}

async function datasetBindingV3(
  dataset: ParsedDataset,
  datasetSha256: string,
): Promise<DatasetBindingV3> {
  return {
    hashKind: datasetHashKindFor(dataset),
    normalizedTableSha256: datasetSha256,
    rowCount: dataset.rows.length,
    headerSha256: await sha256CanonicalJsonV3(dataset.headers),
  };
}

function draftFingerprintInputV3<T>(draft: T): { fingerprintPromise: Promise<string>; snapshot: T } {
  const json = canonicalJsonV3(draft);
  return {
    fingerprintPromise: sha256TextV3(json),
    snapshot: JSON.parse(json) as T,
  };
}

function standardCanonicalFromDraftV3(draft: StandardEnaDraftV3): unknown {
  const rotation = draft.rotation.type === "svd"
    ? { type: "svd", centerAlignToOrigin: draft.rotation.centerAlignToOrigin }
    : draft.rotation.type === "means"
      ? {
          type: "means",
          centerAlignToOrigin: draft.rotation.centerAlignToOrigin,
          contrast: {
            groupColumn: draft.groupColumn,
            negativeLevel: draft.rotation.negativeLevel,
            positiveLevel: draft.rotation.positiveLevel,
          },
        }
      : {
          type: "reference",
          referenceId: draft.rotation.referenceId,
          expectedContentSha256: draft.rotation.expectedContentSha256,
        };
  const analysis = draft.model === "EndPoint"
    ? { model: { type: "EndPoint" }, rotation }
    : { model: { type: draft.model, horizonOrder: draft.horizonOrder }, rotation };
  const window = draft.windowType === "Conversation"
    ? { type: "Conversation" }
    : {
        type: "MovingStanzaWindow",
        backward: draft.movingStanza.backward,
        forward: draft.movingStanza.forward,
        rowOrder: draft.movingStanza.rowOrder,
      };
  return {
    schemaVersion: 3,
    analysisFamily: "standard",
    contracts: {
      validationContractVersion: OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3,
      runtimePolicyVersion: OPEN_ENA_RUNTIME_POLICY_VERSION_V3,
    },
    units: {
      columns: draft.unitColumns,
      group: draft.groupColumn === null
        ? { type: "none" }
        : { type: "stable-metadata", column: draft.groupColumn },
    },
    horizons: { columns: draft.horizonColumns },
    codes: draft.codes.map((column) => ({ column, displayLabel: column })),
    weighting: { type: draft.weighting },
    window,
    analysis,
  };
}

function identityKeyV3(
  row: Record<string, unknown>,
  columns: readonly string[],
  label: string,
): string {
  return canonicalJsonV3(columns.map((column) => {
    if (!own.call(row, column)) throw new TypeError(`${label} is missing ${JSON.stringify(column)}.`);
    const descriptor = Object.getOwnPropertyDescriptor(row, column);
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new TypeError(`${label}.${column} must be an own data property.`);
    }
    return { column, value: scalarIdentityV3(descriptor.value, `${label}.${column}`) };
  }));
}

function addSafeV3(left: number, right: number, label: string): number {
  const sum = left + right;
  if (!Number.isSafeInteger(sum)) {
    throw new ResourceEstimateErrorV3("UNSAFE_ARITHMETIC", `${label} exceeds safe integer arithmetic.`);
  }
  return sum;
}

function selectedIdentityColumnsV3(
  config: CanonicalStandardConfigV3 | CanonicalOnaConfigV3,
): string[] {
  const columns = new Set<string>([
    ...config.units.columns,
    ...config.horizons.columns,
  ]);
  if (config.units.group.type === "stable-metadata") columns.add(config.units.group.column);
  if (config.window.type === "MovingStanzaWindow" && config.window.rowOrder.kind === "columns") {
    for (const key of config.window.rowOrder.keys) columns.add(key.column);
  }
  if (config.analysisFamily === "standard"
    && config.analysis.model.type !== "EndPoint"
    && config.analysis.model.horizonOrder.kind === "columns") {
    for (const key of config.analysis.model.horizonOrder.keys) columns.add(key.column);
  }
  return [...columns].sort();
}

function identityPayloadBytesV3(
  rows: readonly Record<string, unknown>[],
  columns: readonly string[],
): number {
  let total = 0;
  for (const row of rows) {
    for (const column of columns) {
      const descriptor = Object.getOwnPropertyDescriptor(row, column);
      const value = descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
      total = addSafeV3(
        total,
        estimateCanonicalIdentityAdmissionFieldPayloadBytesV3(column, value),
        "Selected identity payload",
      );
      if (total > MAX_ESTIMATED_IDENTITY_PAYLOAD_BYTES_V3) return total;
    }
  }
  return total;
}

function resourceShapeV3(
  dataset: ParsedDataset,
  config: CanonicalStandardConfigV3 | CanonicalOnaConfigV3,
): {
  unitCount: number;
  horizonSizes: number[];
  trajectorySteps: number;
  identityPayloadBytes: number;
} {
  const unitKeys = new Set<string>();
  const horizonSizes = new Map<string, number>();
  const horizonsByUnit = new Map<string, Set<string>>();
  for (let rowIndex = 0; rowIndex < dataset.rows.length; rowIndex += 1) {
    const row = snapshotPlainJsonRecordV3(dataset.rows[rowIndex], `dataset.rows[${rowIndex}]`);
    const unit = identityKeyV3(row, config.units.columns, `dataset.rows[${rowIndex}] Unit`);
    const horizon = identityKeyV3(row, config.horizons.columns, `dataset.rows[${rowIndex}] Horizon`);
    unitKeys.add(unit);
    horizonSizes.set(horizon, (horizonSizes.get(horizon) ?? 0) + 1);
    const observed = horizonsByUnit.get(unit) ?? new Set<string>();
    observed.add(horizon);
    horizonsByUnit.set(unit, observed);
  }
  const trajectorySteps = config.analysisFamily === "standard"
    && config.analysis.model.type !== "EndPoint"
    ? [...horizonsByUnit.values()].reduce((total, values) => addSafeV3(total, values.size, "Trajectory steps"), 0)
    : unitKeys.size;
  return {
    unitCount: unitKeys.size,
    horizonSizes: [...horizonSizes.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([, size]) => size),
    trajectorySteps,
    identityPayloadBytes: identityPayloadBytesV3(
      dataset.rows as Array<Record<string, unknown>>,
      selectedIdentityColumnsV3(config),
    ),
  };
}

function exactStandardResourceEstimateV3(
  dataset: ParsedDataset,
  config: CanonicalStandardConfigV3,
): StandardResourceEstimateV3 {
  const shape = resourceShapeV3(dataset, config);
  return estimateStandardResourcesV3({
    rowCount: dataset.rows.length,
    unitCount: shape.unitCount,
    horizonCount: shape.horizonSizes.length,
    codeCount: config.codes.length,
    horizonSizes: shape.horizonSizes,
    trajectorySteps: shape.trajectorySteps,
    windowType: config.window.type,
    backward: config.window.type === "MovingStanzaWindow"
      ? config.window.backward
      : { kind: "finite", value: 1 },
    forward: config.window.type === "MovingStanzaWindow"
      ? config.window.forward
      : { kind: "finite", value: 0 },
    referenceProjection: config.analysis.rotation.type === "reference",
    datasetSizeBytes: dataset.sizeBytes,
    identityPayloadBytes: shape.identityPayloadBytes,
  });
}

export async function compileStandardDraftV3(
  dataset: ParsedDataset,
  datasetSha256: string,
  draft: StandardEnaDraftV3,
): Promise<StandardCompileResultV3> {
  const capturedDraft = draftFingerprintInputV3(draft);
  const draftFingerprint = await capturedDraft.fingerprintPromise;
  let binding: DatasetBindingV3;
  try {
    binding = await datasetBindingV3(dataset, datasetSha256);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return deepFreezeV3({
      status: "invalid",
      draftFingerprint,
      diagnostics: [datasetBindingDiagnosticV3()],
      canonicalConfiguration: null,
    });
  }
  const diagnostics = validateStandardDraftV3(dataset, binding, capturedDraft.snapshot);
  if (diagnostics.some((entry) => entry.blocks.includes("build-model"))) {
    return deepFreezeV3({
      status: "invalid",
      draftFingerprint,
      diagnostics,
      canonicalConfiguration: null,
    });
  }

  const canonicalConfiguration = deepFreezeV3(decodeCanonicalStandardConfigV3(
    standardCanonicalFromDraftV3(capturedDraft.snapshot),
  ));
  let resourceEstimate: StandardResourceEstimateV3;
  try {
    resourceEstimate = exactStandardResourceEstimateV3(dataset, canonicalConfiguration);
  } catch (error) {
    if (!(error instanceof ResourceEstimateErrorV3)) throw error;
    return deepFreezeV3({
      status: "invalid",
      draftFingerprint,
      diagnostics: [...diagnostics, exactResourceDiagnosticV3(null)],
      canonicalConfiguration: null,
    });
  }
  if (resourceEstimate.blocked) {
    return deepFreezeV3({
      status: "invalid",
      draftFingerprint,
      diagnostics: [...diagnostics, exactResourceDiagnosticV3(resourceEstimate)],
      canonicalConfiguration: null,
    });
  }
  return deepFreezeV3({
    status: "ready",
    draftFingerprint,
    canonicalConfiguration,
    configurationSha256: await sha256CanonicalJsonV3(canonicalConfiguration),
    diagnostics,
    capabilityStatus: capabilityStatusV3(diagnostics),
    resourceEstimate,
  });
}

function onaDiagnosticV3(
  id: OnaCompilerDiagnosticIdV3,
  scope: OnaCompilerDiagnosticV3["scope"],
  summary: string,
  detail: string,
): OnaCompilerDiagnosticV3 {
  return deepFreezeV3({
    id,
    severity: "error",
    scope,
    summary,
    detail,
    blocks: ["build-model", "export-current-model", "export-reference"],
  });
}

function assertExactOnaDraftV3(value: unknown): OrderedNetworkDraftV3 {
  const record = snapshotPlainJsonRecordV3(value, "ONA draft");
  const expected = [
    "unitColumns",
    "horizonColumns",
    "groupColumn",
    "codes",
    "backward",
    "rowOrder",
    "directionalMask",
  ].sort();
  const actual = Object.keys(record).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError("ONA draft has an invalid shape or contains Standard-only fields.");
  }
  return record as unknown as OrderedNetworkDraftV3;
}

function onaCanonicalFromDraftV3(draft: OrderedNetworkDraftV3): unknown {
  return {
    schemaVersion: 3,
    analysisFamily: "ona",
    contracts: {
      validationContractVersion: OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3,
      runtimePolicyVersion: OPEN_ENA_RUNTIME_POLICY_VERSION_V3,
    },
    units: {
      columns: draft.unitColumns,
      group: draft.groupColumn === null
        ? { type: "none" }
        : { type: "stable-metadata", column: draft.groupColumn },
    },
    horizons: { columns: draft.horizonColumns },
    codes: draft.codes.map((column) => ({ column, displayLabel: column })),
    model: { type: "EndPoint" },
    weighting: { type: "frequency", engineMethod: "sum" },
    window: {
      type: "MovingStanzaWindow",
      backward: draft.backward,
      forward: 0,
      rowOrder: draft.rowOrder,
    },
    rotation: { type: "svd", centerAlignToOrigin: true },
    directionalMask: draft.directionalMask,
  };
}

function validateOnaDatasetV3(
  dataset: ParsedDataset,
  binding: DatasetBindingV3,
  config: CanonicalOnaConfigV3,
): void {
  if (!LOWERCASE_SHA256.test(binding.normalizedTableSha256)
    || !LOWERCASE_SHA256.test(binding.headerSha256)
    || binding.rowCount !== dataset.rows.length
    || binding.hashKind !== datasetHashKindFor(dataset)) {
    throw new TypeError("ONA dataset binding is invalid.");
  }
  const headers = snapshotDenseJsonArrayV3(dataset.headers, "dataset.headers");
  const headerSet = new Set(headers);
  const selected = [
    ...config.units.columns,
    ...config.horizons.columns,
    ...(config.units.group.type === "stable-metadata" ? [config.units.group.column] : []),
    ...config.codes.map((code) => code.column),
    ...(config.window.rowOrder.kind === "columns"
      ? config.window.rowOrder.keys.map((key) => key.column)
      : []),
  ];
  if (selected.some((column) => !headerSet.has(column))) {
    throw new TypeError("ONA selected fields must all exist in the dataset header.");
  }
  const scientificRoles = [
    ...config.units.columns,
    ...config.horizons.columns,
    ...(config.units.group.type === "stable-metadata" ? [config.units.group.column] : []),
    ...(config.window.rowOrder.kind === "columns"
      ? config.window.rowOrder.keys.map((key) => key.column)
      : []),
  ];
  if (config.codes.some((code) => scientificRoles.includes(code.column))) {
    throw new TypeError("ONA Code fields cannot also have another active scientific role.");
  }
  for (let rowIndex = 0; rowIndex < dataset.rows.length; rowIndex += 1) {
    const row = snapshotPlainJsonRecordV3(dataset.rows[rowIndex], `dataset.rows[${rowIndex}]`);
    identityKeyV3(row, config.units.columns, `dataset.rows[${rowIndex}] Unit`);
    identityKeyV3(row, config.horizons.columns, `dataset.rows[${rowIndex}] Horizon`);
    if (config.units.group.type === "stable-metadata") {
      scalarIdentityV3(row[config.units.group.column], `dataset.rows[${rowIndex}] Group`);
    }
    for (const code of config.codes) {
      const value = row[code.column];
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        throw new TypeError("ONA Code values must be finite nonnegative numbers.");
      }
    }
  }
  resolveRowOrderV3(
    dataset.rows as Array<Record<string, unknown>>,
    config.horizons.columns,
    config.window.rowOrder,
    {
      analysisFamily: "ona",
      confirmationAnalysisFamily: "ona",
      datasetBinding: binding,
    },
  );
}

function exactOnaResourceEstimateV3(
  dataset: ParsedDataset,
  config: CanonicalOnaConfigV3,
): OnaResourceEstimateV3 {
  const shape = resourceShapeV3(dataset, config);
  return estimateOnaResourcesV3({
    rowCount: dataset.rows.length,
    unitCount: shape.unitCount,
    horizonCount: shape.horizonSizes.length,
    codeCount: config.codes.length,
    horizonSizes: shape.horizonSizes,
    backward: config.window.backward,
    datasetSizeBytes: dataset.sizeBytes,
    identityPayloadBytes: shape.identityPayloadBytes,
  });
}

export async function compileOnaDraftV3(
  dataset: ParsedDataset,
  datasetSha256: string,
  draft: OrderedNetworkDraftV3,
): Promise<OnaCompileResultV3> {
  const capturedDraft = draftFingerprintInputV3(draft);
  const draftFingerprint = await capturedDraft.fingerprintPromise;
  let binding: DatasetBindingV3;
  try {
    binding = await datasetBindingV3(dataset, datasetSha256);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return deepFreezeV3({
      status: "invalid",
      draftFingerprint,
      diagnostics: [onaDiagnosticV3(
        "ONA_DATASET_BINDING_INVALID",
        "dataset",
        "The ONA dataset binding is invalid.",
        "The hash kind, normalized-table SHA-256, row count, and canonical header SHA-256 must match the current dataset.",
      )],
      canonicalConfiguration: null,
    });
  }

  let canonicalConfiguration: CanonicalOnaConfigV3;
  try {
    const onaDraft = assertExactOnaDraftV3(capturedDraft.snapshot);
    canonicalConfiguration = deepFreezeV3(decodeCanonicalOnaConfigV3(onaCanonicalFromDraftV3(onaDraft)));
    validateOnaDatasetV3(dataset, binding, canonicalConfiguration);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return deepFreezeV3({
      status: "invalid",
      draftFingerprint,
      diagnostics: [onaDiagnosticV3(
        "ONA_DRAFT_INVALID",
        "model",
        "The ONA draft is not executable.",
        "ONA requires its fixed EndPoint, backward-only, Frequency/sum, SVD, explicit-order, directional-mask contract with no Standard-only fields.",
      )],
      canonicalConfiguration: null,
    });
  }

  let resourceEstimate: OnaResourceEstimateV3;
  try {
    resourceEstimate = exactOnaResourceEstimateV3(dataset, canonicalConfiguration);
  } catch (error) {
    if (!(error instanceof ResourceEstimateErrorV3)) throw error;
    return deepFreezeV3({
      status: "invalid",
      draftFingerprint,
      diagnostics: [onaDiagnosticV3(
        "ONA_RESOURCE_BUDGET_EXCEEDED",
        "resources",
        "The exact ONA configuration exceeds the fixed resource budget.",
        "No rows, Codes, masks, or backward extent were reduced automatically.",
      )],
      canonicalConfiguration: null,
    });
  }
  if (resourceEstimate.blocked) {
    return deepFreezeV3({
      status: "invalid",
      draftFingerprint,
      diagnostics: [onaDiagnosticV3(
        "ONA_RESOURCE_BUDGET_EXCEEDED",
        "resources",
        "The exact ONA configuration exceeds the fixed resource budget.",
        `The exact estimate was blocked by: ${resourceEstimate.blockedReasons.join(", ")}.`,
      )],
      canonicalConfiguration: null,
    });
  }
  const onaCapabilityStatus = capabilityStatusV3([{
    blocks: ["export-reference", "group-inference", "trajectory-inference", "longitudinal-comparison"],
  }]);
  return deepFreezeV3({
    status: "ready",
    draftFingerprint,
    canonicalConfiguration,
    configurationSha256: await sha256CanonicalJsonV3(canonicalConfiguration),
    diagnostics: [],
    capabilityStatus: onaCapabilityStatus,
    resourceEstimate,
  });
}
