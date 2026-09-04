import {
  canonicalJsonV3,
  deepFreezeV3,
  sha256CanonicalJsonV3,
  sha256TextV3,
} from "./canonical-json";
import {
  prepareStandardDraftValidationV3,
} from "./diagnostics";
import type {
  ModelCapabilityV3,
  ModelDiagnosticV3,
} from "./diagnostics";
import { ResourceEstimateErrorV3 } from "./resource-budget";
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
import type { ParsedDataset } from "../types";
import {
  compilerDatasetEnvelopeV3,
  datasetBindingV3,
  exactOnaResourceEstimateV3,
  exactStandardResourceEstimateV3,
  parsedEnvelopeV3,
  snapshotCompilerDatasetV3,
} from "./compiler-dataset";
import type { CompilerDatasetEnvelopeV3 } from "./compiler-dataset";
import {
  assertExactOnaDraftV3,
  onaCanonicalFromDraftV3,
  onaDiagnosticV3,
  runOnaScientificPreflightV3,
  validateOnaDatasetV3,
} from "./ona-compiler-preflight";
import type { OnaCompilerDiagnosticV3 } from "./ona-compiler-preflight";

export { ONA_COMPILER_DIAGNOSTIC_IDS_V3 } from "./ona-compiler-preflight";
export type {
  OnaCompilerDiagnosticIdV3,
  OnaCompilerDiagnosticV3,
} from "./ona-compiler-preflight";

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
  intrinsicBlocks: readonly ModelCapabilityV3[] = [],
): ModelCapabilityStatusV3 {
  const blocked = new Set([
    ...intrinsicBlocks,
    ...diagnostics.flatMap((entry) => entry.blocks),
  ]);
  return deepFreezeV3(Object.fromEntries(MODEL_CAPABILITIES_V3.map((capability) => [
    capability,
    blocked.has(capability) ? "blocked" : "available",
  ])) as Record<ModelCapabilityV3, "available" | "blocked">);
}

function standardIntrinsicCapabilityBlocksV3(
  config: CanonicalStandardConfigV3,
): readonly ModelCapabilityV3[] {
  const blocks: ModelCapabilityV3[] = [];
  if (config.units.group.type === "none") blocks.push("group-inference");
  if (config.analysis.model.type === "EndPoint") {
    blocks.push("trajectory-inference", "longitudinal-comparison");
  } else {
    blocks.push("export-reference");
  }
  if (config.analysis.rotation.type === "reference") blocks.push("export-reference");
  return blocks;
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
    window: draft.windowType === "Conversation"
      ? { type: "Conversation" }
      : {
          type: "MovingStanzaWindow",
          backward: draft.movingStanza.backward,
          forward: draft.movingStanza.forward,
          rowOrder: draft.movingStanza.rowOrder,
        },
    analysis: draft.model === "EndPoint"
      ? { model: { type: "EndPoint" }, rotation }
      : { model: { type: draft.model, horizonOrder: draft.horizonOrder }, rotation },
  };
}

export async function compileStandardDraftV3(
  dataset: ParsedDataset,
  datasetSha256: string,
  draft: StandardEnaDraftV3,
): Promise<StandardCompileResultV3> {
  const capturedDraft = draftFingerprintInputV3(draft);
  const draftFingerprint = await capturedDraft.fingerprintPromise;
  let envelope: CompilerDatasetEnvelopeV3;
  let binding: DatasetBindingV3;
  try {
    envelope = compilerDatasetEnvelopeV3(dataset);
    binding = await datasetBindingV3(envelope, datasetSha256);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return deepFreezeV3({
      status: "invalid",
      draftFingerprint,
      diagnostics: [datasetBindingDiagnosticV3()],
      canonicalConfiguration: null,
    });
  }

  const prepared = prepareStandardDraftValidationV3(
    parsedEnvelopeV3(envelope),
    binding,
    capturedDraft.snapshot,
  );
  const diagnostics = prepared.diagnostics;
  if (diagnostics.some((entry) => entry.blocks.includes("build-model"))) {
    return deepFreezeV3({ status: "invalid", draftFingerprint, diagnostics, canonicalConfiguration: null });
  }
  if (prepared.dataset === null
    || await sha256CanonicalJsonV3(prepared.dataset.headers) !== binding.headerSha256) {
    return deepFreezeV3({
      status: "invalid",
      draftFingerprint,
      diagnostics: [datasetBindingDiagnosticV3()],
      canonicalConfiguration: null,
    });
  }
  const validatedDataset = prepared.dataset as unknown as ParsedDataset;
  const canonicalConfiguration = deepFreezeV3(decodeCanonicalStandardConfigV3(
    standardCanonicalFromDraftV3(capturedDraft.snapshot),
  ));
  let resourceEstimate: StandardResourceEstimateV3;
  try {
    resourceEstimate = exactStandardResourceEstimateV3(validatedDataset, canonicalConfiguration);
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
    capabilityStatus: capabilityStatusV3(
      diagnostics,
      standardIntrinsicCapabilityBlocksV3(canonicalConfiguration),
    ),
    resourceEstimate,
  });
}

function invalidOnaResultV3(
  draftFingerprint: string,
  diagnostics: readonly OnaCompilerDiagnosticV3[],
): InvalidOnaCompileResultV3 {
  return deepFreezeV3({
    status: "invalid",
    draftFingerprint,
    diagnostics,
    canonicalConfiguration: null,
  });
}

export async function compileOnaDraftV3(
  dataset: ParsedDataset,
  datasetSha256: string,
  draft: OrderedNetworkDraftV3,
): Promise<OnaCompileResultV3> {
  const capturedDraft = draftFingerprintInputV3(draft);
  const draftFingerprint = await capturedDraft.fingerprintPromise;
  let envelope: CompilerDatasetEnvelopeV3;
  let binding: DatasetBindingV3;
  try {
    envelope = compilerDatasetEnvelopeV3(dataset);
    binding = await datasetBindingV3(envelope, datasetSha256);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return invalidOnaResultV3(draftFingerprint, [onaDiagnosticV3(
      "ONA_DATASET_BINDING_INVALID",
      "dataset",
      "The ONA dataset binding is invalid.",
      "The hash kind, normalized-table SHA-256, row count, and canonical header SHA-256 must match the current dataset.",
    )]);
  }

  let canonicalConfiguration: CanonicalOnaConfigV3;
  try {
    const onaDraft = assertExactOnaDraftV3(capturedDraft.snapshot);
    canonicalConfiguration = deepFreezeV3(decodeCanonicalOnaConfigV3(onaCanonicalFromDraftV3(onaDraft)));
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return invalidOnaResultV3(draftFingerprint, [onaDiagnosticV3(
      "ONA_DRAFT_INVALID",
      "model",
      "The ONA draft is not executable.",
      "ONA requires its fixed EndPoint, backward-only, Frequency/sum, SVD, explicit-order, directional-mask contract with no Standard-only fields.",
    )]);
  }

  let validatedDataset: ParsedDataset;
  try {
    validatedDataset = await snapshotCompilerDatasetV3(envelope, binding);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return invalidOnaResultV3(draftFingerprint, [onaDiagnosticV3(
      "ONA_DATASET_FIELD_INVALID",
      "dataset",
      "The ONA dataset cannot be snapshotted coherently.",
      "Headers and rows must be dense plain data structures that remain stable during compiler intake.",
      { fieldPath: "dataset" },
    )]);
  }

  const preparedDataset = validateOnaDatasetV3(validatedDataset, binding, canonicalConfiguration);
  if (preparedDataset.diagnostics.some((entry) => entry.severity === "error")
    || preparedDataset.ordering === null) {
    return invalidOnaResultV3(draftFingerprint, preparedDataset.diagnostics);
  }

  let resourceEstimate: OnaResourceEstimateV3;
  try {
    resourceEstimate = exactOnaResourceEstimateV3(validatedDataset, canonicalConfiguration);
  } catch (error) {
    if (!(error instanceof ResourceEstimateErrorV3)) throw error;
    return invalidOnaResultV3(draftFingerprint, [onaDiagnosticV3(
      "ONA_RESOURCE_BUDGET_EXCEEDED",
      "resources",
      "The exact ONA configuration exceeds the fixed resource budget.",
      "No rows, Codes, masks, or backward extent were reduced automatically.",
    )]);
  }
  if (resourceEstimate.blocked) {
    return invalidOnaResultV3(draftFingerprint, [onaDiagnosticV3(
      "ONA_RESOURCE_BUDGET_EXCEEDED",
      "resources",
      "The exact ONA configuration exceeds the fixed resource budget.",
      `The exact estimate was blocked by: ${resourceEstimate.blockedReasons.join(", ")}.`,
    )]);
  }

  const scientific = runOnaScientificPreflightV3(
    validatedDataset,
    canonicalConfiguration,
    preparedDataset.ordering,
  );
  if (scientific.diagnostics.some((entry) => entry.severity === "error")) {
    return invalidOnaResultV3(draftFingerprint, scientific.diagnostics);
  }
  return deepFreezeV3({
    status: "ready",
    draftFingerprint,
    canonicalConfiguration,
    configurationSha256: await sha256CanonicalJsonV3(canonicalConfiguration),
    diagnostics: scientific.diagnostics,
    capabilityStatus: capabilityStatusV3(scientific.diagnostics, [
      "export-reference",
      "group-inference",
      "trajectory-inference",
      "longitudinal-comparison",
      "ai-interpretation",
    ]),
    resourceEstimate,
  });
}
