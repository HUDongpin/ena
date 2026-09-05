import { buildAnalysisBundleV3 } from "./analysis-bundle-v3";
import { captureBundleJsonV3 } from "./bundle-json-v3";
import { captureDraftArtifactV3 } from "./draft-artifact-v3";
import {
  canonicalJsonV3,
  sha256CanonicalJsonV3,
  sha256TextV3,
  snapshotPlainJsonRecordV3,
} from "./model-v3/canonical-json";
import {
  isCompilerOwnedReadyResultV3,
  type ReadyCompileResultV3,
} from "./model-v3/compiler";
import {
  captureExecutionPlanInputV3,
  type OpenEnaExecutionPlanV3,
} from "./model-v3/execution-plan";
import type {
  BoundResultV3,
  BoundStandardResultV3,
  ReferenceSourceWitnessV3,
} from "./model-v3/types";
import { validateBoundResultV3 } from "./model-v3/result-binding";
import { buildReferenceV2 } from "./model-v3/reference-v2";
import { originalReferenceForResultV3 } from "./reference";

const JSON_MEDIA_TYPE = "application/json" as const;

export interface ExportFileDescriptorV3 {
  readonly kind: string;
  readonly filename: string;
  readonly mediaType: typeof JSON_MEDIA_TYPE;
  readonly bytes: Uint8Array;
  /** SHA-256 of the exact final bytes returned above. */
  readonly fileSha256: string;
}

type ArtifactIntegrityV3 = {
  readonly algorithm: "SHA-256";
  /** Canonical JSON of every artifact field except this integrity object. */
  readonly canonicalPayloadSha256: string;
};

export interface ExportReferenceV2Options {
  /** Required only when minting from a fresh target-fitted Standard Endpoint. */
  sourceWitness?: ReferenceSourceWitnessV3;
  /** Required for a fresh fit; optional currentness check for a projected download. */
  currentPlan?: unknown;
  displayName?: string;
}

function capturedReferenceOptionsV2(input: ExportReferenceV2Options): ExportReferenceV2Options {
  const captured = snapshotPlainJsonRecordV3(input, "Reference export options");
  const allowed = new Set(["sourceWitness", "currentPlan", "displayName"]);
  if (Object.keys(captured).some((key) => !allowed.has(key))) {
    throw new TypeError("Reference export options contain an unsupported field.");
  }
  if (captured.displayName !== undefined
    && (typeof captured.displayName !== "string" || captured.displayName.trim().length === 0)) {
    throw new TypeError("Reference displayName must be a nonblank string.");
  }
  return captured as ExportReferenceV2Options;
}

function assertFreshReferenceMatchesResultV2(
  result: BoundStandardResultV3,
  reference: Awaited<ReturnType<typeof buildReferenceV2>>,
): void {
  const projection = result.executionProvenance.projection;
  const same = (actual: unknown, expected: unknown, label: string): void => {
    if (canonicalJsonV3(actual) !== canonicalJsonV3(expected)) {
      throw new TypeError(`Reference ${label} does not match the supplied fresh bound result.`);
    }
  };
  if (projection.type === "reference") {
    throw new TypeError("A projected Endpoint cannot mint a new Reference fit.");
  }
  if (reference.fit.method !== projection.type || reference.fit.rank !== projection.rank) {
    throw new TypeError("Reference fit does not match the supplied fresh bound result.");
  }
  same(reference.fit.variance, projection.variance, "variance");
  same(reference.fit.estimableAxes, projection.estimableAxes, "estimable axes");
  same(reference.geometry.centerVector, projection.centerVector, "center vector");
  same(reference.geometry.rotationMatrix, result.set.rotation.rotationMatrix, "rotation matrix");
  same(reference.geometry.rotationColumns, projection.fullAxes, "rotation axes");
  const sourceColumnByExportLabel = new Map(
    result.executionProvenance.labels.codes.flatMap((entry) => [
      [entry.runtimeToken, entry.sourceColumn] as const,
      [entry.column, entry.sourceColumn] as const,
    ]),
  );
  same(
    reference.basis.codes.map((entry) => entry.value),
    result.set.rotation.codes.map((entry) => sourceColumnByExportLabel.get(entry) ?? entry),
    "Code basis",
  );
  const resultNodes = (result.set.rotation.nodes ?? []).map((node) => ({
    code: sourceColumnByExportLabel.get(String(node.code)) ?? String(node.code),
    coordinates: reference.geometry.nodeColumns.map((axis) => node[axis]),
  }));
  same(
    reference.geometry.nodes.map((node) => ({ code: node.code.value, coordinates: node.coordinates })),
    resultNodes,
    "fixed nodes",
  );
}

async function selfHashedJsonArtifactV3<T extends { kind: string }>(
  payload: T,
  filename: string,
): Promise<T & { integrity: ArtifactIntegrityV3 } & ExportFileDescriptorV3> {
  const captured = captureBundleJsonV3(payload) as T;
  const integrity: ArtifactIntegrityV3 = {
    algorithm: "SHA-256",
    canonicalPayloadSha256: await sha256CanonicalJsonV3(captured),
  };
  const artifact = captureBundleJsonV3({ ...captured, integrity }) as T & { integrity: ArtifactIntegrityV3 };
  const text = canonicalJsonV3(artifact);
  const bytes = new TextEncoder().encode(text);
  return Object.freeze({
    ...artifact,
    filename,
    mediaType: JSON_MEDIA_TYPE,
    bytes,
    fileSha256: await sha256TextV3(text),
  });
}

export async function exportCanonicalConfigV3(input: ReadyCompileResultV3) {
  if (!isCompilerOwnedReadyResultV3(input)) {
    throw new TypeError("Canonical configuration export requires a compiler-owned ready result.");
  }
  const captured = captureBundleJsonV3(input) as ReadyCompileResultV3;
  const analysisFamily = captured.canonicalConfiguration.analysisFamily;
  const {
    status: _nontransferableReadyReceipt,
    canonicalConfiguration,
    ...compileProvenance
  } = captured;
  const payload = {
    schemaVersion: 3 as const,
    kind: "open-ena-canonical-config" as const,
    executable: true as const,
    family: analysisFamily === "standard" ? "Standard" as const : "ONA" as const,
    payload: {
      analysisFamily,
      configuration: canonicalConfiguration,
      compileProvenance,
    },
  };
  const suffix = analysisFamily === "standard"
    ? "standard-ena-config.v3.json"
    : "ona-config.v3.json";
  return selfHashedJsonArtifactV3(
    payload,
    `model-${captured.configurationSha256.slice(0, 12)}.${suffix}`,
  );
}

export async function exportDraftV3(input: unknown) {
  const { analysisFamily, draft } = captureDraftArtifactV3(input);
  const draftSha256 = await sha256CanonicalJsonV3(draft);
  return selfHashedJsonArtifactV3({
    schemaVersion: 3 as const,
    kind: "open-ena-draft" as const,
    executable: false as const,
    analysisFamily,
    draft,
  }, `model-${draftSha256.slice(0, 12)}.open-ena-draft.v3.json`);
}

export async function exportCurrentAnalysisV3(
  input: BoundResultV3,
  currentPlan: OpenEnaExecutionPlanV3,
) {
  const result = captureBundleJsonV3(input) as BoundResultV3;
  // First reject malformed historical science without relabeling it as stale.
  const portable = buildAnalysisBundleV3(result);
  const current = buildAnalysisBundleV3(result, { expectedPlan: currentPlan }).then(
    () => ({ error: null }),
    (error: unknown) => ({ error }),
  );
  const bundle = await portable;
  const currentOutcome = await current;
  if (currentOutcome.error) {
    throw new TypeError(
      "Result is stale against the current analysis plan; export a STALE audit instead.",
      { cause: currentOutcome.error },
    );
  }
  const text = canonicalJsonV3(bundle);
  const bytes = new TextEncoder().encode(text);
  const family = bundle.configuration.analysisFamily;
  const suffix = family === "standard"
    ? "standard-ena-analysis.v3.json"
    : "ona-analysis.v3.json";
  return Object.freeze({
    kind: bundle.kind,
    family: family === "standard" ? "Standard" as const : "ONA" as const,
    filename: `analysis-${bundle.integrity.bundleContentSha256.slice(0, 12)}.${suffix}`,
    mediaType: JSON_MEDIA_TYPE,
    bytes,
    fileSha256: await sha256TextV3(text),
    integrity: bundle.integrity,
  });
}

export async function exportStaleAuditV3(
  input: BoundResultV3,
  currentDraftFingerprint: string,
) {
  if (typeof currentDraftFingerprint !== "string"
    || !/^[a-f0-9]{64}$/u.test(currentDraftFingerprint)) {
    throw new TypeError("Stale audit requires the current draft SHA-256 fingerprint.");
  }
  // This proves portable historical consistency without source/current-plan authority.
  const analysisBundle = await buildAnalysisBundleV3(input);
  const family = analysisBundle.configuration.analysisFamily;
  return selfHashedJsonArtifactV3({
    schemaVersion: 3 as const,
    kind: "open-ena-stale-audit" as const,
    executable: false as const,
    analysisFamily: family,
    staleAgainst: { currentDraftFingerprint },
    analysisBundle,
  }, `analysis.STALE-${currentDraftFingerprint.slice(0, 12)}.${family === "standard" ? "standard-ena-analysis" : "ona-analysis"}.v3.json`);
}

export async function exportReferenceV2(
  input: BoundResultV3,
  options: ExportReferenceV2Options = {},
) {
  const result = captureBundleJsonV3(input) as BoundResultV3;
  const capturedOptions = capturedReferenceOptionsV2(options);
  const currentPlan = capturedOptions.currentPlan === undefined
    ? undefined
    : captureExecutionPlanInputV3(capturedOptions.currentPlan);
  let artifact;
  if (result.configuration.analysisFamily === "standard"
    && result.binding.referenceId !== null) {
    artifact = await originalReferenceForResultV3(result, currentPlan);
  } else {
    const portableValidation = buildAnalysisBundleV3(result);
    const currentValidation = currentPlan === undefined
      ? Promise.resolve({ error: null })
      : validateBoundResultV3(result, currentPlan).then(
          () => ({ error: null }),
          (error: unknown) => ({ error }),
        );
    const freshMint = capturedOptions.sourceWitness !== undefined
      && currentPlan !== undefined
      ? buildReferenceV2(capturedOptions.sourceWitness, {
          displayName: capturedOptions.displayName ?? "Standard ENA Reference",
          currentPlan,
        }).then(
          (reference) => ({ reference, error: null }),
          (error: unknown) => ({ reference: null, error }),
        )
      : Promise.resolve({ reference: null, error: null });
    await portableValidation;
    const currentOutcome = await currentValidation;
    if (currentOutcome.error) throw currentOutcome.error;
    if (result.configuration.analysisFamily !== "standard") {
      throw new TypeError("Only Standard ENA can export a Reference.");
    }
    const standardResult = result as BoundStandardResultV3;
    if (standardResult.configuration.analysis.model.type !== "EndPoint") {
      throw new TypeError("Only a Standard EndPoint fit can export a Reference.");
    }
    if (capturedOptions.sourceWitness === undefined) {
      throw new TypeError("Fresh Reference export requires an owned source witness.");
    }
    if (currentPlan === undefined) {
      throw new TypeError("Fresh Reference export requires an independent current plan.");
    }
    const mintOutcome = await freshMint;
    if (mintOutcome.error) throw mintOutcome.error;
    if (mintOutcome.reference === null) {
      throw new TypeError("Fresh Reference export did not produce an owned artifact.");
    }
    assertFreshReferenceMatchesResultV2(standardResult, mintOutcome.reference);
    artifact = mintOutcome.reference;
  }
  const text = canonicalJsonV3(artifact);
  const bytes = new TextEncoder().encode(text);
  return Object.freeze({
    ...artifact,
    filename: `reference-${artifact.contentSha256.slice(0, 12)}.standard-ena-reference.v2.json`,
    mediaType: JSON_MEDIA_TYPE,
    bytes,
    fileSha256: await sha256TextV3(text),
  });
}
