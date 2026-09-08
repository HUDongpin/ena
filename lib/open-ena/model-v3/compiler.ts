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
  StandardScientificEvidenceV3,
} from "./diagnostics";
import type { StandardOperationalAdmissionV3 } from "./standard-closure-resource-budget";
import { ResourceEstimateErrorV3 } from "./resource-budget";
import type {
  OnaResourceEstimateV3,
  StandardResourceEstimateV3,
} from "./resource-budget";
import {
  decodeCanonicalOnaConfigV3,
} from "./schema";
import type {
  CanonicalOnaConfigV3,
  CanonicalStandardConfigV3,
  DatasetBindingV3,
  OrderedNetworkDraftV3,
  StandardEnaDraftV3,
} from "./types";
import type { ParsedDataset } from "../types";
import {
  captureDatasetBindingV3,
  compilerDatasetEnvelopeV3,
  exactOnaResourceEstimateV3,
  parsedEnvelopeV3,
  snapshotCompilerDatasetInputV3,
} from "./compiler-dataset";
import type {
  CompilerDatasetBindingCaptureV3,
  CompilerDatasetEnvelopeV3,
} from "./compiler-dataset";
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

const compilerOwnedReadyResultsV3 = new WeakSet<object>();

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
  /** Exact dataset binding captured by this compiler invocation. */
  readonly datasetBinding: DatasetBindingV3;
  /** Selected scientific source evidence captured by this compiler invocation. */
  readonly sourceProofSha256: string;
  readonly canonicalConfiguration: CanonicalStandardConfigV3;
  readonly configurationSha256: string;
  readonly diagnostics: readonly ModelDiagnosticV3[];
  readonly capabilityStatus: ModelCapabilityStatusV3;
  /** Exact post-validation estimate; early-envelope telemetry is never returned here. */
  readonly resourceEstimate: StandardResourceEstimateV3;
  readonly operationalAdmission: StandardOperationalAdmissionV3;
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

export type ReadyCompileResultV3 = ReadyStandardCompileResultV3 | ReadyOnaCompileResultV3;

/** Check-only, realm-local receipt. There is deliberately no caller registration API. */
export function isCompilerOwnedReadyResultV3(value: unknown): value is ReadyCompileResultV3 {
  return value !== null
    && typeof value === "object"
    && compilerOwnedReadyResultsV3.has(value);
}

function ownReadyResultV3<T extends ReadyCompileResultV3>(value: T): T {
  const result = deepFreezeV3(value);
  compilerOwnedReadyResultsV3.add(result);
  return result;
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


function draftFingerprintInputV3<T>(draft: T): { fingerprintPromise: Promise<string>; snapshot: T } {
  const json = canonicalJsonV3(draft);
  return {
    fingerprintPromise: sha256TextV3(json),
    snapshot: JSON.parse(json) as T,
  };
}

type CompilerPromiseOutcomeV3<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: unknown };

function settleCompilerPromiseV3<T>(promise: Promise<T>): Promise<CompilerPromiseOutcomeV3<T>> {
  return promise.then(
    (value) => ({ ok: true, value }),
    (error: unknown) => ({ ok: false, error }),
  );
}

function compilerPromiseValueV3<T>(outcome: CompilerPromiseOutcomeV3<T>): T {
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}


export async function compileStandardDraftV3(
  dataset: ParsedDataset,
  datasetSha256: string,
  draft: StandardEnaDraftV3,
): Promise<StandardCompileResultV3> {
  return compileStandardDraftInternalV3(dataset, datasetSha256, draft);
}

/** @internal Owns the same real prepared validation as the ordinary compiler.
 * No evidence input or caller registration hook is accepted. Ordinary compile
 * results never retain the extra source matrix after their invocation returns.
 */
export async function compileStandardDraftWithScientificEvidenceV3(dataset: ParsedDataset, datasetSha256: string, draft: StandardEnaDraftV3) {
  let evidence: StandardScientificEvidenceV3 | null = null;
  const compiled = await compileStandardDraftInternalV3(dataset, datasetSha256, draft, (value) => { evidence = value; });
  if (compiled.status === "ready" && evidence === null) throw new TypeError("Ready Standard compilation requires its own scientific source evidence.");
  return { compiled, evidence: evidence as StandardScientificEvidenceV3 | null };
}

async function compileStandardDraftInternalV3(
  dataset: ParsedDataset, datasetSha256: string, draft: StandardEnaDraftV3,
  retainEvidence?: (evidence: StandardScientificEvidenceV3 | null) => void,
): Promise<StandardCompileResultV3> {
  const capturedDraft = draftFingerprintInputV3(draft);
  const draftFingerprintOutcomePromise = settleCompilerPromiseV3(capturedDraft.fingerprintPromise);
  let envelope: CompilerDatasetEnvelopeV3;
  let bindingCapture: CompilerDatasetBindingCaptureV3;
  try {
    envelope = compilerDatasetEnvelopeV3(dataset);
    bindingCapture = captureDatasetBindingV3(envelope, datasetSha256);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    const draftFingerprint = compilerPromiseValueV3(await draftFingerprintOutcomePromise);
    return deepFreezeV3({
      status: "invalid",
      draftFingerprint,
      diagnostics: [datasetBindingDiagnosticV3()],
      canonicalConfiguration: null,
    });
  }
  const bindingOutcomePromise = settleCompilerPromiseV3(bindingCapture.bindingPromise);
  const prepared = prepareStandardDraftValidationV3(
    parsedEnvelopeV3(envelope),
    bindingCapture.provisionalBinding,
    capturedDraft.snapshot,
  );
  retainEvidence?.(prepared.scientificEvidence);
  const draftFingerprint = compilerPromiseValueV3(await draftFingerprintOutcomePromise);
  const bindingOutcome = await bindingOutcomePromise;
  if (!bindingOutcome.ok) throw bindingOutcome.error;
  const binding: DatasetBindingV3 = bindingOutcome.value;
  if (prepared.dataset !== null
    && await sha256CanonicalJsonV3(prepared.dataset.headers) !== binding.headerSha256) {
    return deepFreezeV3({
      status: "invalid",
      draftFingerprint,
      diagnostics: [datasetBindingDiagnosticV3()],
      canonicalConfiguration: null,
    });
  }
  const diagnostics = prepared.diagnostics;
  if (diagnostics.some((entry) => entry.blocks.includes("build-model"))) {
    return deepFreezeV3({ status: "invalid", draftFingerprint, diagnostics, canonicalConfiguration: null });
  }
  if (prepared.dataset === null) {
    return deepFreezeV3({
      status: "invalid",
      draftFingerprint,
      diagnostics: [datasetBindingDiagnosticV3()],
      canonicalConfiguration: null,
    });
  }
  if (prepared.scientificAdmission === null) throw new TypeError("Ready Standard compilation requires its mandatory pre-evidence resource admission.");
  const { canonicalConfiguration, resourceEstimate, sourceProofPayload, operationalAdmission } = prepared.scientificAdmission;
  return ownReadyResultV3({
    status: "ready",
    draftFingerprint,
    datasetBinding: binding,
    sourceProofSha256: await sha256CanonicalJsonV3(sourceProofPayload),
    canonicalConfiguration,
    configurationSha256: await sha256CanonicalJsonV3(canonicalConfiguration),
    diagnostics,
    capabilityStatus: capabilityStatusV3(
      diagnostics,
      standardIntrinsicCapabilityBlocksV3(canonicalConfiguration),
    ),
    resourceEstimate,
    operationalAdmission,
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
  const draftFingerprintOutcomePromise = settleCompilerPromiseV3(capturedDraft.fingerprintPromise);
  let envelope: CompilerDatasetEnvelopeV3;
  let bindingCapture: CompilerDatasetBindingCaptureV3;
  try {
    envelope = compilerDatasetEnvelopeV3(dataset);
    bindingCapture = captureDatasetBindingV3(envelope, datasetSha256);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    const draftFingerprint = compilerPromiseValueV3(await draftFingerprintOutcomePromise);
    return invalidOnaResultV3(draftFingerprint, [onaDiagnosticV3(
      "ONA_DATASET_BINDING_INVALID",
      "dataset",
      "The ONA dataset binding is invalid.",
      "The hash kind, normalized-table SHA-256, row count, and canonical header SHA-256 must match the current dataset.",
    )]);
  }
  const bindingOutcomePromise = settleCompilerPromiseV3(bindingCapture.bindingPromise);

  let canonicalConfiguration: CanonicalOnaConfigV3 | null = null;
  let draftBoundaryError: TypeError | null = null;
  try {
    const onaDraft = assertExactOnaDraftV3(capturedDraft.snapshot);
    canonicalConfiguration = deepFreezeV3(decodeCanonicalOnaConfigV3(onaCanonicalFromDraftV3(onaDraft)));
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    draftBoundaryError = error;
  }

  let validatedDataset: ParsedDataset | null = null;
  let datasetSnapshotError: TypeError | null = null;
  if (canonicalConfiguration !== null) {
    try {
      validatedDataset = snapshotCompilerDatasetInputV3(
        envelope,
        bindingCapture.provisionalBinding,
      );
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      datasetSnapshotError = error;
    }
  }

  const draftFingerprint = compilerPromiseValueV3(await draftFingerprintOutcomePromise);
  const bindingOutcome = await bindingOutcomePromise;
  if (!bindingOutcome.ok) throw bindingOutcome.error;
  const binding: DatasetBindingV3 = bindingOutcome.value;
  if (draftBoundaryError !== null || canonicalConfiguration === null) {
    return invalidOnaResultV3(draftFingerprint, [onaDiagnosticV3(
      "ONA_DRAFT_INVALID",
      "model",
      "The ONA draft is not executable.",
      "ONA requires its fixed EndPoint, backward-only, Frequency/sum, SVD, explicit-order, directional-mask contract with no Standard-only fields.",
    )]);
  }
  if (datasetSnapshotError !== null || validatedDataset === null
    || await sha256CanonicalJsonV3(validatedDataset.headers) !== binding.headerSha256) {
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
  return ownReadyResultV3({
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
