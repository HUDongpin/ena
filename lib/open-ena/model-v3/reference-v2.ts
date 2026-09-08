import { runStandardPlanV3 } from "../analyze";
import type { ParsedDataset } from "../types";
import { canonicalJsonV3, deepFreezeV3, sha256CanonicalJsonV3, snapshotPlainJsonRecordV3 } from "./canonical-json";
import { validateStandardDraftV3 } from "./diagnostics";
import { validateStandardExecutionPlanV3, type StandardExecutionPlanV3 } from "./execution-plan";
import { buildStandardCodeDictionaryV3 } from "./standard-adapter";
import { decodeReferenceV2, referenceCodecInternalsV2 } from "./reference-codec-v2";
import type { OpenEnaStandardReferenceV2, ReferenceSourceWitnessV3, StandardEnaDraftV3, InternalStandardRunResultV3, BoundStandardResultV3 } from "./types";
import type { AnalyzePlanWorkerOptionsV3 } from "../client";

export { assertReferenceAdmissionV3, captureReferenceExecutionBindingV3, bindReferenceToTargetV3, decodeReferenceV2 } from "./reference-codec-v2";

type Scientific = Omit<OpenEnaStandardReferenceV2, "displayName" | "referenceId" | "contentSha256">;
const PREFIX = "open-ena-standard-ref-v2:";
const witnesses = new WeakMap<ReferenceSourceWitnessV3, { scientific: Scientific; currentIdentity: string }>();
const { record, string, finite, code, compatibility, scientificFromArtifact } = referenceCodecInternalsV2;

function assertSourcePlan(plan: StandardExecutionPlanV3): void {
  if (plan.header.analysisFamily !== "standard" || plan.configuration.analysisFamily !== "standard") throw new TypeError("Reference requires a Standard source.");
  if (plan.configuration.analysis.model.type !== "EndPoint") throw new TypeError("Reference source requires EndPoint.");
  if (plan.reference !== null || !["svd", "means"].includes(plan.configuration.analysis.rotation.type)) throw new TypeError("Reference requires a target-fitted source; projected artifacts cannot mint a new fit.");
}

function assertScientificReadiness(plan: StandardExecutionPlanV3): void {
  const config = plan.configuration;
  const rotation = config.analysis.rotation;
  if (rotation.type === "reference") throw new TypeError("Reference source must be target-fitted.");
  const proof = plan.sourceProof;
  const dataset: ParsedDataset = {
    name: proof.dataset.name, source: proof.dataset.source, sizeBytes: proof.dataset.sizeBytes, hashKind: proof.dataset.hashKind,
    headers: [...proof.headers], rows: [...proof.rows].sort((left, right) => left.sourceRowIndex - right.sourceRowIndex).map((row) => ({ ...row.values })),
  };
  const draft: StandardEnaDraftV3 = {
    unitColumns: [...config.units.columns], horizonColumns: [...config.horizons.columns],
    groupColumn: config.units.group.type === "none" ? null : config.units.group.column,
    codes: config.codes.map((entry) => entry.column), weighting: config.weighting.type, model: "EndPoint", windowType: config.window.type,
    // The diagnostics contract ignores these inactive Conversation and Endpoint controls.
    movingStanza: config.window.type === "MovingStanzaWindow" ? config.window : { backward: { kind: "infinity" }, forward: { kind: "finite", value: 0 }, rowOrder: null },
    horizonOrder: null,
    rotation: rotation.type === "svd" ? rotation : { type: "means", centerAlignToOrigin: rotation.centerAlignToOrigin, negativeLevel: rotation.contrast.negativeLevel, positiveLevel: rotation.contrast.positiveLevel },
  };
  // Avoid the window discriminant becoming an extra draft control at its exact-key boundary.
  if (config.window.type === "MovingStanzaWindow") draft.movingStanza = { backward: config.window.backward, forward: config.window.forward, rowOrder: config.window.rowOrder };
  const blocking = validateStandardDraftV3(dataset, plan.header.datasetBinding, draft).filter((entry) => entry.blocks.includes("build-model") || entry.blocks.includes("export-reference"));
  if (blocking.length) throw new TypeError(`Reference source is not scientifically ready: ${blocking.map((entry) => entry.id).join(", ")}.`);
}

/**
 * Staged internal factory: owns one actual fit, then retains only its frozen
 * scientific payload. It is realm-local, NOT a BoundResult or a worker API.
 * Task 15 must integrate validated worker results at this trusted capture
 * boundary; UI callers must not implement main-thread refits to obtain proof.
 */
export async function fitReferenceSourceV3(sourcePlan: unknown): Promise<ReferenceSourceWitnessV3> {
  const plan = await validateStandardExecutionPlanV3(sourcePlan);
  assertSourcePlan(plan);
  assertScientificReadiness(plan);
  const result = runStandardPlanV3(plan, { materialization: "model" });
  return captureOwnedSourceFit(plan, result);
}

/** The only runtime-result-to-witness bridge remains private to this owner. */
async function captureOwnedSourceFit(plan: StandardExecutionPlanV3, result: Pick<InternalStandardRunResultV3, "projection" | "populations" | "meansBinding"> & { set: Pick<InternalStandardRunResultV3["set"], "rotation"> }, assertActive: () => void = () => {}): Promise<ReferenceSourceWitnessV3> {
  const dictionary = buildStandardCodeDictionaryV3(plan.configuration.codes);
  const tokenNames = new Map(dictionary.codes.map((entry) => [entry.token, entry.sourceColumn]));
  const names = result.set.rotation.codes.map((token) => {
    const name = tokenNames.get(token);
    if (name === undefined) throw new TypeError("Reference runtime Code has no canonical source identity.");
    return name;
  });
  const nodeColumns = result.projection.fullAxes.slice(0, 3);
  const geometry: OpenEnaStandardReferenceV2["geometry"] = {
    centerVector: [...result.projection.centerVector], rotationMatrix: result.set.rotation.rotationMatrix.map((row) => [...row]),
    rotationColumns: [...result.projection.fullAxes], eigenvalues: [...result.set.rotation.eigenvalues], nodeColumns,
    nodes: (result.set.rotation.nodes ?? []).map((row) => {
      const name = tokenNames.get(String(row.code));
      if (name === undefined) throw new TypeError("Reference runtime node has no canonical Code identity.");
      return { code: code(name), coordinates: nodeColumns.map((axis) => finite(row[axis], "Reference fitted node")) };
    }),
  };
  const unitIdentities = new Map(plan.identityDictionary.units.map((entry) => [entry.token, entry.canonicalJson]));
  const population = result.populations.fitTokens.map((token) => {
    const identity = unitIdentities.get(token);
    if (identity === undefined) throw new TypeError("Reference fit population has no typed Unit identity.");
    return identity;
  });
  if (result.populations.fit !== "endpoint-units" || new Set(population).size !== plan.identityDictionary.units.length) throw new TypeError("Reference fit population must include all Endpoint Units exactly once.");
  const header = plan.header;
  const means = result.meansBinding;
  const scientific: Scientific = {
    schemaVersion: 2, kind: "open-ena-standard-reference-rotation", family: "Standard", sourceModel: "EndPoint",
    source: {
      datasetBinding: header.datasetBinding, configuration: plan.configuration,
      configurationSha256: header.configurationSha256, executionPlanSha256: header.executionPlanSha256,
      sourceProofSha256: plan.sourceProof.sourceProofSha256, externalHashVerification: plan.sourceProof.dataset.externalHashVerification,
      runtime: { runtimeVersion: header.runtimeVersion, algorithmBuildSha: header.algorithmBuildSha,
        validationContractVersion: header.validationContractVersion, runtimePolicyVersion: header.runtimePolicyVersion, executionContractVersion: header.executionContractVersion },
    },
    fit: {
      method: result.projection.type === "reference" ? (() => { throw new TypeError("Reference projected results cannot mint a source fit."); })() : result.projection.type, origin: "target-fitted", population: "endpoint-units", observationCount: population.length,
      populationSha256: await sha256CanonicalJsonV3(population), centerAlignToOrigin: result.projection.centerAlignToOrigin,
      rank: result.projection.rank, estimableAxes: [...result.projection.estimableAxes], variance: [...result.projection.variance],
      means: means === null ? null : { groupColumn: means.groupColumn, negativeLevel: means.negative.level, positiveLevel: means.positive.level,
        negativeCount: means.negative.unitTokens.length, positiveCount: means.positive.unitTokens.length, direction: means.direction },
    },
    compatibility: compatibility(plan.configuration),
    basis: { codes: names.map(code), edges: result.set.rotation.adjacencyKey.map((entry) => ({ source: code(names[entry.sourceIndex]), target: code(names[entry.targetIndex]) })) },
    geometry,
  };
  const contentSha256 = await sha256CanonicalJsonV3(scientific);
  const artifact = await decodeReferenceV2({ ...scientific, displayName: "Source fit", contentSha256, referenceId: `${PREFIX}${contentSha256}` });
  assertActive();
  const witness = Object.freeze({}) as ReferenceSourceWitnessV3;
  witnesses.set(witness, { scientific: deepFreezeV3(scientificFromArtifact(artifact)), currentIdentity: canonicalJsonV3({ header: plan.header, configuration: plan.configuration }) });
  return witness;
}

/**
 * Browser-only owned operation. Imports transport lazily so the shared Reference
 * decoder stays usable by workers/server code. No caller transport/result hook
 * can enter this authority-bearing path, and no main-thread fit is performed.
 */
export async function analyzePlanWithReferenceSourceV3(sourcePlan: unknown, options: AnalyzePlanWorkerOptionsV3 = {}): Promise<{ result: BoundStandardResultV3; sourceWitness: ReferenceSourceWitnessV3 }> {
  const captured = snapshotPlainJsonRecordV3(options, "Owned Reference worker options");
  if (Object.keys(captured).some((key) => key !== "signal" && key !== "onProgress")) throw new TypeError("Owned Reference worker options cannot override the production transport.");
  const plan = await validateStandardExecutionPlanV3(sourcePlan);
  assertSourcePlan(plan);
  const { analyzePlanInWorkerV3 } = await import("../client");
  const result = await analyzePlanInWorkerV3(plan, { signal: captured.signal as AbortSignal | undefined, onProgress: captured.onProgress as AnalyzePlanWorkerOptionsV3["onProgress"] });
  if ((captured.signal as AbortSignal | undefined)?.aborted) throw new DOMException("Reference source was cancelled.", "AbortError");
  const mappings = result.executionProvenance.labels.codes;
  const tokens = new Map(mappings.map((entry) => [entry.column, entry.runtimeToken]));
  const rotation = result.set.rotation;
  const token = (value: string) => {
    const found = tokens.get(value);
    if (found === undefined) throw new TypeError("Fresh worker Reference has an unknown Code mapping.");
    return found;
  };
  const assertActive = () => {
    if ((captured.signal as AbortSignal | undefined)?.aborted) throw new DOMException("Reference source was cancelled.", "AbortError");
  };
  const sourceWitness = await captureOwnedSourceFit(plan, {
    projection: result.executionProvenance.projection, populations: result.executionProvenance.populations, meansBinding: result.executionProvenance.meansBinding,
    set: { rotation: {
      ...rotation, codes: rotation.codes.map(token),
      adjacencyKey: rotation.adjacencyKey.map((edge) => ({ ...edge, source: token(edge.source), target: token(edge.target), name: `${token(edge.source)} & ${token(edge.target)}` })),
      nodes: rotation.nodes?.map((row) => ({ ...row, code: token(String(row.code)) })),
    } },
  }, assertActive);
  if ((captured.signal as AbortSignal | undefined)?.aborted) throw new DOMException("Reference source was cancelled.", "AbortError");
  return { result, sourceWitness };
}

/**
 * Mint only from the owned fresh-fit witness and an independently supplied
 * validated current-plan snapshot. No fit occurs here. This proves currentness
 * at this call's snapshot; the UI owner must recheck before a later download.
 */
export async function buildReferenceV2(source: ReferenceSourceWitnessV3, options: { displayName: string; currentPlan: unknown }): Promise<OpenEnaStandardReferenceV2> {
  const captured = record(options, ["displayName", "currentPlan"], "Reference current-plan options");
  const displayName = string(captured.displayName, "Reference displayName");
  const owned = witnesses.get(source);
  if (!owned) throw new TypeError("Reference minting requires an owned target-fitted source witness; imported/projected results cannot mint.");
  const current = await validateStandardExecutionPlanV3(captured.currentPlan);
  assertSourcePlan(current);
  if (canonicalJsonV3({ header: current.header, configuration: current.configuration }) !== owned.currentIdentity) throw new TypeError("Reference source is stale against the independently supplied current plan.");
  const contentSha256 = await sha256CanonicalJsonV3(owned.scientific);
  return decodeReferenceV2({ ...owned.scientific, displayName, contentSha256, referenceId: `${PREFIX}${contentSha256}` });
}
