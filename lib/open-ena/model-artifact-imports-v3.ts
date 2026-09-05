import { parseBundleJsonV3 } from "./bundle-json-v3";
import { parseAnalysisBundleV3 } from "./analysis-bundle-v3";
import { captureDraftArtifactV3 } from "./draft-artifact-v3";
import { parseOpenEnaAnalysisBundle, type OpenEnaAnalysisBundleV1, type OpenEnaAnalysisBundleV2 } from "./legacy-analysis-bundle-parser";
import { canonicalJsonV3, deepFreezeV3, sha256CanonicalJsonV3, sha256TextV3 } from "./model-v3/canonical-json";
import { decodeSerializedStandardCompileProvenanceV3 } from "./model-v3/execution-plan";
import { migrateCanonicalConfigurationToDraftV3, migrateLegacyOpenEnaConfigToDraftV3, workspaceDraftsFromArtifactV3 } from "./model-v3/migration";
import { decodeCanonicalOnaConfigV3, decodeCanonicalStandardConfigV3 } from "./model-v3/schema";
import { decodeReferenceV2 } from "./model-v3/reference-codec-v2";
import { RESOURCE_BUDGET_VERSION_V3 } from "./model-v3/resource-budget";
import { ONA_COMPILER_DIAGNOSTIC_IDS_V3 } from "./model-v3/ona-compiler-preflight";
import { captureLegacyReferenceCandidateV3 } from "./reference";
import type { CanonicalOnaConfigV3, ModelWorkspaceDraftsV3, OpenEnaAnalysisBundleV3, OpenEnaStandardReferenceV2 } from "./model-v3/types";
import type { OpenEnaConfig, OpenEnaRotationReference } from "./types";

interface ImportBaseV3 {
  readonly autoRun: false;
  readonly executable: false;
  readonly receivedArtifactSha256: string;
  readonly review: readonly string[];
}

export interface DraftImportV3 extends ImportBaseV3 {
  readonly kind: "draft";
  readonly draft: ModelWorkspaceDraftsV3;
  readonly replaceDraftAction: { readonly required: true };
  /** Imported bytes remain claims; retaining them does not recreate compiler ownership. */
  readonly artifact?: Readonly<Record<string, unknown>>;
}

export interface StaleAuditImportArtifactV3 {
  readonly schemaVersion: 3;
  readonly kind: "open-ena-stale-audit";
  readonly executable: false;
  readonly analysisFamily: "standard" | "ona";
  readonly staleAgainst: { readonly currentDraftFingerprint: string };
  readonly analysisBundle: OpenEnaAnalysisBundleV3;
  readonly integrity: { readonly algorithm: "SHA-256"; readonly canonicalPayloadSha256: string };
}

export interface HistoricalImportV3 extends ImportBaseV3 {
  readonly kind: "historical-result";
  readonly readOnly: true;
  readonly artifact: OpenEnaAnalysisBundleV1 | OpenEnaAnalysisBundleV2 | OpenEnaAnalysisBundleV3 | StaleAuditImportArtifactV3;
  readonly loadConfigurationAction: { readonly required: true; readonly draft: ModelWorkspaceDraftsV3 };
}

export interface ReferenceCandidateImportV3 extends ImportBaseV3 {
  readonly kind: "reference-candidate";
  readonly candidate: OpenEnaStandardReferenceV2 | OpenEnaRotationReference;
  readonly missingProvenance: readonly string[];
  readonly acknowledgeLegacyAction: { readonly required: boolean };
  readonly registerReferenceAction: { readonly required: true };
  readonly selectReferenceAction: { readonly required: true };
}

export type OpenEnaImportResultV3 = DraftImportV3 | HistoricalImportV3 | ReferenceCandidateImportV3;

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Open ENA artifact must be an object.");
  }
  return value as Record<string, unknown>;
}

function exact(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  const result = record(value);
  if (Object.keys(result).length !== keys.length || keys.some((key) => !Object.hasOwn(result, key))) {
    throw new TypeError(`${label} has missing or unsupported fields.`);
  }
  return result;
}

function hash(value: unknown): void {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new TypeError("Artifact requires a lowercase SHA-256 hash.");
}

async function verifyIntegrity(value: Record<string, unknown>): Promise<void> {
  const integrity = exact(value.integrity, ["algorithm", "canonicalPayloadSha256"], "Artifact integrity");
  hash(integrity.canonicalPayloadSha256);
  const { integrity: _excluded, ...payload } = value;
  if (integrity.algorithm !== "SHA-256" || integrity.canonicalPayloadSha256 !== await sha256CanonicalJsonV3(payload)) {
    throw new TypeError("Artifact integrity hash mismatch.");
  }
}

function integer(value: unknown): void {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new TypeError("Artifact count must be a nonnegative safe integer.");
}

function nonblank(value: unknown): void {
  if (typeof value !== "string" || value.trim().length === 0) throw new TypeError("Artifact text must be nonblank.");
}

const capabilities = ["build-model", "export-current-model", "export-reference", "group-inference", "trajectory-inference", "longitudinal-comparison", "ai-interpretation"] as const;
const onaResourceIntegers = ["rows", "units", "horizons", "windowPartitions", "codes", "adjacencyDimensions", "datasetSizeBytes", "identityPayloadBytes", "aggregateStateUpperBound", "estimatedStateCount", "estimatedStructuralBytes", "estimatedForwardBufferRows", "estimatedRetainedWindowRows", "estimatedWindowStateCells", "estimatedWindowVisits", "estimatedNumericCells", "estimatedWorkerMaterializationBytes", "estimatedExportBytes", "estimatedPeakBytes", "estimatedRotationWorkUnits", "estimatedRotationMatrixBytes", "endpointNetworks", "directionalMaskCells"] as const;

/** ONA serialized provenance has no source/dataset proof fields. Validate its
 * exact claims without fabricating the fields present in the Standard compiler.
 */
async function verifyOnaCompileClaims(value: unknown, configuration: CanonicalOnaConfigV3): Promise<void> {
  const claims = exact(value, ["draftFingerprint", "configurationSha256", "diagnostics", "capabilityStatus", "resourceEstimate"], "ONA compile provenance");
  hash(claims.draftFingerprint);
  hash(claims.configurationSha256);
  if (claims.configurationSha256 !== await sha256CanonicalJsonV3(configuration)) throw new TypeError("ONA configuration hash mismatch.");
  const blocked = new Set<string>(["export-reference", "group-inference", "trajectory-inference", "longitudinal-comparison", "ai-interpretation"]);
  if (!Array.isArray(claims.diagnostics)) throw new TypeError("ONA diagnostics must be an array.");
  for (const value of claims.diagnostics) {
    const diagnostic = record(value);
    exact(diagnostic, ["id", "severity", "scope", "summary", "detail", "blocks", ...["fieldPath", "evidence"].filter((key) => Object.hasOwn(diagnostic, key))], "ONA diagnostic");
    if (!ONA_COMPILER_DIAGNOSTIC_IDS_V3.includes(diagnostic.id as typeof ONA_COMPILER_DIAGNOSTIC_IDS_V3[number])
      || diagnostic.severity !== "warning" || !["dataset", "units", "windows", "codes", "rotation", "model", "resources"].includes(diagnostic.scope as string)) throw new TypeError("ONA diagnostic contract is unsupported.");
    nonblank(diagnostic.summary); nonblank(diagnostic.detail);
    if (Object.hasOwn(diagnostic, "fieldPath")) nonblank(diagnostic.fieldPath);
    if (!Array.isArray(diagnostic.blocks) || new Set(diagnostic.blocks).size !== diagnostic.blocks.length) throw new TypeError("ONA diagnostic blocks are invalid.");
    for (const capability of diagnostic.blocks) {
      if (!capabilities.includes(capability) || capability === "build-model") throw new TypeError("ONA ready claims cannot block construction.");
      blocked.add(capability);
    }
    if (Object.hasOwn(diagnostic, "evidence")) {
      const evidence = exact(diagnostic.evidence, ["totalCount", "sampleLimit", "samples", "truncated"], "ONA diagnostic evidence");
      integer(evidence.totalCount);
      if (evidence.sampleLimit !== 5 || !Array.isArray(evidence.samples) || evidence.samples.length > 5
        || evidence.samples.length > (evidence.totalCount as number) || evidence.truncated !== ((evidence.totalCount as number) > evidence.samples.length)) throw new TypeError("ONA diagnostic evidence bounds are invalid.");
      for (const value of evidence.samples) {
        const sample = record(value);
        exact(sample, ["detail", ...(Object.hasOwn(sample, "rowIndex") ? ["rowIndex"] : [])], "ONA evidence sample");
        nonblank(sample.detail);
        if (Object.hasOwn(sample, "rowIndex")) integer(sample.rowIndex);
      }
    }
  }
  const status = exact(claims.capabilityStatus, capabilities, "ONA capability claims");
  for (const capability of capabilities) if (status[capability] !== (blocked.has(capability) ? "blocked" : "available")) throw new TypeError("ONA capability claims are inconsistent.");
  const resource = exact(claims.resourceEstimate, ["version", "analysisFamily", "blocked", "blockedReasons", ...onaResourceIntegers], "ONA resource claims");
  if (resource.version !== RESOURCE_BUDGET_VERSION_V3 || resource.analysisFamily !== "ona" || resource.blocked !== false
    || !Array.isArray(resource.blockedReasons) || resource.blockedReasons.length !== 0) throw new TypeError("ONA resource claims are unsupported or blocked.");
  for (const key of onaResourceIntegers) integer(resource[key]);
  const count = configuration.codes.length;
  if (resource.codes !== count || resource.adjacencyDimensions !== count * count || resource.directionalMaskCells !== count * count
    || resource.endpointNetworks !== resource.units) throw new TypeError("ONA resource dimensions disagree with configuration.");
  const order = configuration.window.rowOrder;
  if (order.kind === "source-order-confirmed" && (order.confirmation.analysisFamily !== "ona"
    || order.confirmation.rowCount !== resource.rows
    || canonicalJsonV3(order.confirmation.relevantColumns) !== canonicalJsonV3(configuration.horizons.columns))) throw new TypeError("ONA source order binding is inconsistent.");
}

function draftReview(draft: ModelWorkspaceDraftsV3): string[] {
  const review = ["compile-before-run"];
  const selected = draft[draft.activeFamily];
  if (selected.codes.length < 3) review.push("codes");
  const orders = draft.activeFamily === "standard"
    ? [draft.standard.movingStanza.rowOrder, draft.standard.horizonOrder] : [draft.ona.rowOrder];
  if (orders.some((order) => order?.kind === "source-order-confirmed")) review.push("dataset-bound-confirmations");
  if (draft.activeFamily === "ona") {
    if (draft.ona.rowOrder === null) review.push("row-order");
    return review;
  }
  const standard = draft.standard;
  if (standard.windowType === "MovingStanzaWindow" && standard.movingStanza.rowOrder === null) review.push("row-order");
  if (standard.model !== "EndPoint" && standard.horizonOrder === null) review.push("horizon-order");
  if (standard.rotation.type === "means") {
    if (standard.model !== "EndPoint") review.push("means-trajectory");
    if (standard.rotation.negativeLevel === null || standard.rotation.positiveLevel === null) review.push("means-direction");
  }
  if (standard.rotation.type === "reference" && standard.rotation.expectedContentSha256 === null) review.push("reference-content-hash");
  return review;
}

function draftResult(draft: ModelWorkspaceDraftsV3, receivedArtifactSha256: string, artifact?: Record<string, unknown>): DraftImportV3 {
  return deepFreezeV3({ kind: "draft", autoRun: false, executable: false, receivedArtifactSha256,
    draft, artifact, review: draftReview(draft), replaceDraftAction: { required: true } });
}

function historicalResult(artifact: HistoricalImportV3["artifact"], configuration: unknown, receivedArtifactSha256: string): HistoricalImportV3 {
  const draft = migrateCanonicalConfigurationToDraftV3(configuration);
  return deepFreezeV3({ kind: "historical-result", autoRun: false, executable: false, readOnly: true,
    receivedArtifactSha256, artifact, review: ["historical-result", "source-currentness-unverified", ...draftReview(draft)],
    loadConfigurationAction: { required: true, draft } });
}

function legacyDraft(value: unknown) {
  const config = record(value);
  return migrateLegacyOpenEnaConfigToDraftV3({
    ...config,
    // Only the portable sentinel can introduce a runtime Infinity. JSON null
    // (including a stringified nonfinite programmatic number) is never repaired.
    windowSizeBack: config.windowSizeBack === "Infinity" ? Infinity : config.windowSizeBack,
  } as OpenEnaConfig);
}

/** Pure admission and preview. No workspace, registry, source plan, or worker is accepted. */
export async function importOpenEnaArtifactV3(text: string): Promise<OpenEnaImportResultV3> {
  const value = record(parseBundleJsonV3(text));
  const receivedArtifactSha256 = await sha256TextV3(text);
  if (value.schemaVersion === 3 && value.kind === "open-ena-draft") {
    exact(value, ["schemaVersion", "kind", "executable", "analysisFamily", "draft", "integrity"], "Draft artifact");
    if (value.executable !== false) throw new TypeError("Draft artifacts must be non-executable.");
    const captured = captureDraftArtifactV3(value.draft);
    if (captured.analysisFamily !== value.analysisFamily) throw new TypeError("Draft artifact family mismatch.");
    // Explicit hostile-import exception to draft roundtrips: scientific-invalid
    // selections are preserved, but duplicate semantic Code identities are not.
    if (new Set(captured.draft.codes).size !== captured.draft.codes.length) throw new TypeError("Imported draft Codes must have unique semantic identities.");
    await verifyIntegrity(value);
    return draftResult(workspaceDraftsFromArtifactV3(captured.draft), receivedArtifactSha256, value);
  }
  if (value.schemaVersion === 3 && value.kind === "open-ena-canonical-config") {
    exact(value, ["schemaVersion", "kind", "executable", "family", "payload", "integrity"], "Canonical configuration artifact");
    if (value.executable !== true) throw new TypeError("Canonical configuration artifact marker is invalid.");
    const payload = exact(value.payload, ["analysisFamily", "configuration", "compileProvenance"], "Canonical payload");
    const config = payload.analysisFamily === "standard" ? decodeCanonicalStandardConfigV3(payload.configuration)
      : payload.analysisFamily === "ona" ? decodeCanonicalOnaConfigV3(payload.configuration) : null;
    if (config === null || value.family !== (config.analysisFamily === "standard" ? "Standard" : "ONA")) throw new TypeError("Canonical artifact family mismatch.");
    await verifyIntegrity(value);
    if (config.analysisFamily === "standard") await decodeSerializedStandardCompileProvenanceV3({ configuration: config, compileProvenance: payload.compileProvenance });
    else await verifyOnaCompileClaims(payload.compileProvenance, config);
    return draftResult(migrateCanonicalConfigurationToDraftV3(config), receivedArtifactSha256, value);
  }
  if (value.schemaVersion === 3 && value.kind === "open-ena-analysis-bundle") {
    const artifact = await parseAnalysisBundleV3(text);
    return historicalResult(artifact, artifact.configuration, receivedArtifactSha256);
  }
  if (value.schemaVersion === 3 && value.kind === "open-ena-stale-audit") {
    exact(value, ["schemaVersion", "kind", "executable", "analysisFamily", "staleAgainst", "analysisBundle", "integrity"], "STALE audit artifact");
    if (value.executable !== false) throw new TypeError("STALE audits must be non-executable.");
    hash(exact(value.staleAgainst, ["currentDraftFingerprint"], "STALE binding").currentDraftFingerprint);
    await verifyIntegrity(value);
    const bundle = await parseAnalysisBundleV3(canonicalJsonV3(value.analysisBundle));
    if (value.analysisFamily !== bundle.configuration.analysisFamily) throw new TypeError("STALE audit family mismatch.");
    return historicalResult(value as unknown as StaleAuditImportArtifactV3, bundle.configuration, receivedArtifactSha256);
  }
  if ((value.schemaVersion === 2 && value.kind === "open-ena-standard-reference-rotation")
    || (value.schemaVersion === 1 && value.kind === "open-ena-reference-rotation")) {
    const legacy = value.schemaVersion === 1;
    const { candidate, missingProvenance } = legacy ? captureLegacyReferenceCandidateV3(value)
      : { candidate: await decodeReferenceV2(value), missingProvenance: [] };
    return deepFreezeV3({ kind: "reference-candidate", autoRun: false, executable: false,
      receivedArtifactSha256, candidate, missingProvenance,
      review: legacy ? ["legacy-reference-acknowledgement", "computational-compatibility-unproven"] : ["reference-compatibility", "source-currentness-unverified"],
      acknowledgeLegacyAction: { required: legacy }, registerReferenceAction: { required: true }, selectReferenceAction: { required: true } });
  }
  if (Object.hasOwn(value, "kind")) throw new TypeError("Unsupported Open ENA artifact schema/kind.");
  if (Object.hasOwn(value, "schemaVersion")) {
    if ((value.schemaVersion !== 1 && value.schemaVersion !== 2) || value.app !== "ENA.HK Open ENA") {
      throw new TypeError("Unsupported Open ENA artifact schema/kind.");
    }
    const artifact = parseOpenEnaAnalysisBundle(text);
    const draft = legacyDraft(record(artifact.manifest).configuration);
    return deepFreezeV3({ kind: "historical-result", autoRun: false, executable: false, readOnly: true,
      receivedArtifactSha256, artifact, review: ["historical-result", ...draft.requiresReview],
      loadConfigurationAction: { required: true, draft } });
  }
  const draft = legacyDraft(value);
  return deepFreezeV3({ kind: "draft", autoRun: false, executable: false, receivedArtifactSha256,
    draft, review: draft.requiresReview, replaceDraftAction: { required: true } });
}
