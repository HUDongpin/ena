import { runStandardPlanV3 } from "../analyze";
import { JENA_RUNTIME_VERSION, JENA_SOURCE_COMMIT, type ParsedDataset } from "../types";
import { canonicalJsonV3, deepFreezeV3, sha256CanonicalJsonV3, snapshotDenseJsonArrayV3, snapshotPlainJsonRecordV3 } from "./canonical-json";
import { validateStandardDraftV3 } from "./diagnostics";
import { validateExecutionPlanV3, type StandardExecutionPlanV3 } from "./execution-plan";
import { MAX_ESTIMATED_EXPORT_BYTES_V3, MAX_ESTIMATED_IDENTITY_PAYLOAD_BYTES_V3, MAX_ESTIMATED_NUMERIC_CELLS_V3, MAX_ESTIMATED_PEAK_BYTES_V3, MAX_ESTIMATED_ROTATION_WORK_UNITS_V3, MAX_ESTIMATED_STATE_COUNT_V3 } from "./resource-budget";
import { decodeCanonicalStandardConfigV3 } from "./schema";
import { buildStandardCodeDictionaryV3 } from "./standard-adapter";
import { OPEN_ENA_EXECUTION_CONTRACT_VERSION_V3, OPEN_ENA_RUNTIME_POLICY_VERSION_V3, OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3 } from "./types";
import type { CanonicalStandardConfigV3, OpenEnaStandardReferenceV2, ReferenceCodeIdentityV2, ReferenceCompatibilityV2, ReferenceSourceWitnessV3, StandardEnaDraftV3 } from "./types";

type Scientific = Omit<OpenEnaStandardReferenceV2, "displayName" | "referenceId" | "contentSha256">;
const PREFIX = "open-ena-standard-ref-v2:";
const TOLERANCE = 1e-8;
const witnesses = new WeakMap<ReferenceSourceWitnessV3, { scientific: Scientific; currentIdentity: string }>();
const ROOT_KEYS = ["schemaVersion", "kind", "family", "sourceModel", "source", "fit", "compatibility", "basis", "geometry", "displayName", "contentSha256", "referenceId"];

function record(input: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  const value = snapshotPlainJsonRecordV3(input, label);
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) throw new TypeError(`${label} must have exact keys: ${keys.join(", ")}.`);
  return value;
}

function arrayLength(input: unknown, label: string, max: number): number {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) throw new TypeError(`${label} must be a plain array.`);
  const length = Object.getOwnPropertyDescriptor(input, "length");
  if (!length || !("value" in length) || !Number.isSafeInteger(length.value) || length.value < 0 || length.value > max) {
    throw new TypeError(`${label} exceeds the Reference array resource budget.`);
  }
  return length.value;
}

function array(input: unknown, label: string, max: number, exact?: number): unknown[] {
  const length = arrayLength(input, label, max);
  if (exact !== undefined && length !== exact) throw new TypeError(`${label} must contain exactly ${exact} entries.`);
  return snapshotDenseJsonArrayV3(input, label);
}

function same(actual: unknown, expected: unknown, label: string): void {
  if (canonicalJsonV3(actual) !== canonicalJsonV3(expected)) throw new TypeError(`${label} does not match its scientific source contract.`);
}

function string(input: unknown, label: string): string {
  if (typeof input === "string" && input.length * 6 > MAX_ESTIMATED_IDENTITY_PAYLOAD_BYTES_V3) throw new TypeError(`${label} exceeds the metadata byte resource budget.`);
  if (typeof input !== "string" || input.trim().length === 0) throw new TypeError(`${label} must be a nonblank string.`);
  return input;
}

function hash(input: unknown, label: string): string {
  if (typeof input !== "string" || !/^[a-f0-9]{64}$/u.test(input)) throw new TypeError(`${label} must be a lowercase SHA-256 digest.`);
  return input;
}

function integer(input: unknown, min: number, max: number, label: string): number {
  if (typeof input !== "number" || !Number.isSafeInteger(input) || input < min || input > max) throw new TypeError(`${label} must be an integer in ${min}..${max}.`);
  return input;
}

function finite(input: unknown, label: string): number {
  if (typeof input !== "number" || !Number.isFinite(input)) throw new TypeError(`${label} must be finite.`);
  return Object.is(input, -0) ? 0 : input;
}

function vector(input: unknown, width: number, label: string): number[] {
  return array(input, label, width, width).map((value) => finite(value, label));
}

function code(value: string): ReferenceCodeIdentityV2 { return { type: "string", value }; }

function codeIdentity(input: unknown, label: string): ReferenceCodeIdentityV2 {
  const value = record(input, ["type", "value"], label);
  if (value.type !== "string") throw new TypeError(`${label} must be a typed string Code column.`);
  return code(string(value.value, label));
}

function compatibility(configuration: CanonicalStandardConfigV3): ReferenceCompatibilityV2 {
  const window = configuration.window;
  return {
    normalization: "sphere", unitFields: [...configuration.units.columns], horizonFields: [...configuration.horizons.columns],
    weighting: configuration.weighting,
    window: window.type === "Conversation"
      ? { type: "Conversation", backward: { kind: "infinity" }, forward: { kind: "finite", value: 0 }, rowOrder: null }
      : { type: window.type, backward: window.backward, forward: window.forward,
        rowOrder: window.rowOrder.kind === "columns" ? window.rowOrder : { kind: "source-order-confirmed" } },
  };
}

/** Bound all work before copying/enumerating scientific arrays or performing E cubed checks. */
function captureArtifact(input: unknown): Record<string, unknown> {
  const root = record(input, ROOT_KEYS, "Reference");
  const basis = record(root.basis, ["codes", "edges"], "Reference basis");
  const count = arrayLength(basis.codes, "Reference Codes", MAX_ESTIMATED_STATE_COUNT_V3);
  if (count < 3) throw new TypeError("Reference requires at least three unique Codes.");
  const edges = count * (count - 1) / 2;
  const cells = edges * edges;
  const work = cells * edges;
  if (![edges, cells, work].every(Number.isSafeInteger) || work > MAX_ESTIMATED_ROTATION_WORK_UNITS_V3
    || cells > MAX_ESTIMATED_NUMERIC_CELLS_V3 || cells * 8 > MAX_ESTIMATED_PEAK_BYTES_V3
    || cells * 32 > MAX_ESTIMATED_EXPORT_BYTES_V3) throw new TypeError("Reference geometry exceeds the rotation resource budget.");
  arrayLength(basis.edges, "Reference edges", edges);
  const geometry = record(root.geometry, ["centerVector", "rotationMatrix", "rotationColumns", "eigenvalues", "nodeColumns", "nodes"], "Reference geometry");
  const matrixRows = array(geometry.rotationMatrix, "Reference rotationMatrix", edges, edges);
  geometry.rotationMatrix = matrixRows.map((row) => array(row, "Reference rotation row", edges, edges));
  arrayLength(geometry.centerVector, "Reference centerVector", edges);
  arrayLength(geometry.rotationColumns, "Reference rotationColumns", edges);
  arrayLength(geometry.eigenvalues, "Reference eigenvalues", edges);
  arrayLength(geometry.nodeColumns, "Reference nodeColumns", 3);
  arrayLength(geometry.nodes, "Reference nodes", count);
  let textBytes = 0;
  let retainedBytes = 0;
  let values = 0;
  const active = new WeakSet<object>();
  function capture(value: unknown, label: string, depth: number): unknown {
    values += 1;
    if (values > MAX_ESTIMATED_NUMERIC_CELLS_V3 || depth > 32) throw new TypeError("Reference exceeds the nested value resource budget.");
    // Conservative capture/serialization proxies, using the existing export and peak policies.
    retainedBytes += typeof value === "string" ? value.length * 6 + 32 : typeof value === "object" ? 64 : 32;
    if (retainedBytes > MAX_ESTIMATED_EXPORT_BYTES_V3 || retainedBytes * 2 > MAX_ESTIMATED_PEAK_BYTES_V3) throw new TypeError("Reference exceeds the capture/export byte resource budget.");
    if (typeof value === "string") {
      textBytes += value.length * 6 + 2;
      if (textBytes > MAX_ESTIMATED_IDENTITY_PAYLOAD_BYTES_V3) throw new TypeError("Reference exceeds the metadata byte resource budget.");
      return value;
    }
    if (typeof value === "number") return finite(value, label);
    if (value === null || typeof value === "boolean") return value;
    if (typeof value !== "object") throw new TypeError(`${label} must contain JSON values.`);
    if (active.has(value)) throw new TypeError("Reference contains a cycle.");
    active.add(value);
    try {
      if (Array.isArray(value)) return array(value, label, MAX_ESTIMATED_STATE_COUNT_V3).map((entry, index) => capture(entry, `${label}[${index}]`, depth + 1));
      const object = snapshotPlainJsonRecordV3(value, label);
      const output: Record<string, unknown> = {};
      for (const key of Object.keys(object)) {
        capture(key, label, depth + 1);
        Object.defineProperty(output, key, { value: capture(object[key], `${label}.${key}`, depth + 1), enumerable: true, writable: true, configurable: true });
      }
      return output;
    } finally { active.delete(value); }
  }
  // These already captured records prevent caller get/proxy drift on a second root inspection.
  return capture({ ...root, basis, geometry }, "Reference", 0) as Record<string, unknown>;
}

function scientificFromArtifact(reference: OpenEnaStandardReferenceV2): Scientific {
  const { displayName: _displayName, referenceId: _referenceId, contentSha256: _contentSha256, ...scientific } = reference;
  return scientific;
}

function decodeShape(input: unknown): OpenEnaStandardReferenceV2 {
  const root = captureArtifact(input);
  if (root.schemaVersion !== 2 || root.kind !== "open-ena-standard-reference-rotation" || root.family !== "Standard" || root.sourceModel !== "EndPoint") {
    throw new TypeError("Reference v2 requires Standard family and EndPoint source with the exact schema/kind.");
  }
  string(root.displayName, "Reference displayName");
  hash(root.contentSha256, "Reference contentSha256");
  if (root.referenceId !== `${PREFIX}${root.contentSha256}`) throw new TypeError("Reference content-addressed ID does not match its SHA-256.");
  const source = record(root.source, ["datasetBinding", "configuration", "configurationSha256", "executionPlanSha256", "sourceProofSha256", "externalHashVerification", "runtime"], "Reference source");
  const configuration = decodeCanonicalStandardConfigV3(source.configuration);
  const rotation = configuration.analysis.rotation;
  if (configuration.analysis.model.type !== "EndPoint" || (rotation.type !== "svd" && rotation.type !== "means")) throw new TypeError("Reference source must be a target-fitted Standard EndPoint SVD or Means configuration.");
  hash(source.configurationSha256, "Reference configurationSha256");
  hash(source.executionPlanSha256, "Reference executionPlanSha256");
  hash(source.sourceProofSha256, "Reference sourceProofSha256");
  const binding = record(source.datasetBinding, ["hashKind", "normalizedTableSha256", "rowCount", "headerSha256"], "Reference dataset binding");
  if (typeof binding.hashKind !== "string" || !["normalized-utf8-text-sha256", "normalized-utf8-csv-text-sha256", "canonical-first-xlsx-worksheet-v1-sha256"].includes(binding.hashKind)) throw new TypeError("Reference dataset hash kind is unsupported.");
  hash(binding.normalizedTableSha256, "Reference dataset SHA-256");
  hash(binding.headerSha256, "Reference header SHA-256");
  const rows = integer(binding.rowCount, 1, MAX_ESTIMATED_STATE_COUNT_V3, "Reference source row count");
  if (configuration.window.type === "MovingStanzaWindow" && configuration.window.rowOrder.kind === "source-order-confirmed") {
    const confirmation = configuration.window.rowOrder.confirmation;
    if (confirmation.analysisFamily !== "standard" || confirmation.datasetSha256 !== binding.normalizedTableSha256 || confirmation.rowCount !== rows) throw new TypeError("Reference source-order confirmation must match its source dataset binding.");
    same(confirmation.relevantColumns, configuration.horizons.columns, "Reference source-order confirmation columns");
  }
  if (source.externalHashVerification !== "provenance-only-no-normalized-table-preimage") throw new TypeError("Reference external hash provenance contract is unsupported.");
  same(source.runtime, {
    runtimeVersion: JENA_RUNTIME_VERSION, algorithmBuildSha: JENA_SOURCE_COMMIT,
    validationContractVersion: OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3,
    runtimePolicyVersion: OPEN_ENA_RUNTIME_POLICY_VERSION_V3, executionContractVersion: OPEN_ENA_EXECUTION_CONTRACT_VERSION_V3,
  }, "Reference runtime/build identity");
  same(root.compatibility, compatibility(configuration), "Reference compatibility");
  const basis = record(root.basis, ["codes", "edges"], "Reference basis");
  const codes = array(basis.codes, "Reference Codes", MAX_ESTIMATED_STATE_COUNT_V3).map((entry) => codeIdentity(entry, "Reference Code"));
  const names = codes.map((entry) => entry.value);
  if (new Set(names).size !== codes.length || codes.length !== configuration.codes.length
    || configuration.codes.some((entry) => !names.includes(entry.column))) throw new TypeError("Reference Codes must be unique and cover the source Code identity set.");
  const width = codes.length * (codes.length - 1) / 2;
  const edges = array(basis.edges, "Reference edges", width, width);
  const edgeKeys = edges.map((entry) => {
    const edge = record(entry, ["source", "target"], "Reference edge");
    const left = codeIdentity(edge.source, "Reference edge source").value;
    const right = codeIdentity(edge.target, "Reference edge target").value;
    if (left === right || !names.includes(left) || !names.includes(right)) throw new TypeError("Reference edge must connect two distinct selected Codes.");
    return canonicalJsonV3([left, right].sort());
  });
  if (new Set(edgeKeys).size !== width) throw new TypeError("Reference undirected edges must be unique and complete.");
  const geometry = record(root.geometry, ["centerVector", "rotationMatrix", "rotationColumns", "eigenvalues", "nodeColumns", "nodes"], "Reference geometry");
  const axes = array(geometry.rotationColumns, "Reference axes", width, width).map((entry) => string(entry, "Reference axis"));
  if (new Set(axes).size !== width) throw new TypeError("Reference axes must be unique.");
  const matrix = array(geometry.rotationMatrix, "Reference rotationMatrix", width, width).map((row) => vector(row, width, "Reference rotation row"));
  for (let left = 0; left < width; left += 1) {
    for (let right = left; right < width; right += 1) {
      let product = 0;
      for (let row = 0; row < width; row += 1) product += matrix[row][left] * matrix[row][right];
      if (Math.abs(product - (left === right ? 1 : 0)) > TOLERANCE) throw new TypeError("Reference rotation columns must be orthonormal at tolerance 1e-8.");
    }
  }
  const center = vector(geometry.centerVector, width, "Reference center");
  const centerNorm = center.reduce((sum, value) => sum + value * value, 0);
  if (center.some((value) => value < 0 || value > 1 + TOLERANCE) || centerNorm > 1 + TOLERANCE
    || center.reduce((sum, value) => sum + value, 0) < 1 - TOLERANCE) throw new TypeError("Reference center must be a mean of nonnegative sphere-normalized nonzero networks.");
  const nodeAxes = array(geometry.nodeColumns, "Reference node axes", 3);
  same(nodeAxes, axes.slice(0, 3), "Reference fixed node axes");
  const nodeNames = array(geometry.nodes, "Reference nodes", codes.length, codes.length).map((entry) => {
    const node = record(entry, ["code", "coordinates"], "Reference node");
    vector(node.coordinates, nodeAxes.length, "Reference node coordinates");
    return codeIdentity(node.code, "Reference node Code").value;
  });
  if (new Set(nodeNames).size !== codes.length || nodeNames.some((name) => !names.includes(name))) throw new TypeError("Reference nodes must cover each Code exactly once.");
  const fit = record(root.fit, ["method", "origin", "population", "observationCount", "populationSha256", "centerAlignToOrigin", "rank", "estimableAxes", "variance", "means"], "Reference fit");
  if (fit.method !== rotation.type || fit.origin !== "target-fitted" || fit.population !== "endpoint-units" || fit.centerAlignToOrigin !== rotation.centerAlignToOrigin) throw new TypeError("Reference fit provenance must match the target-fitted source.");
  const observations = integer(fit.observationCount, 2, rows, "Reference fit observation count");
  const rank = integer(fit.rank, 1, Math.min(width, observations - 1), "Reference intrinsic rank");
  hash(fit.populationSha256, "Reference fit population SHA-256");
  const variance = vector(fit.variance, width, "Reference variance");
  if (variance.some((value) => value < 0 || value > 1) || Math.abs(variance.reduce((sum, value) => sum + value, 0) - 1) > TOLERANCE) throw new TypeError("Reference full-basis variance must sum to one.");
  const eigenvalues = array(geometry.eigenvalues, "Reference eigenvalues", width).map((value) => finite(value, "Reference eigenvalue"));
  if (rotation.type === "svd") {
    if (fit.means !== null || eigenvalues.length !== width || eigenvalues[0] <= 0
      || eigenvalues.some((value, index) => value < 0 || (index > 0 && value > eigenvalues[index - 1]))) throw new TypeError("Reference SVD requires valid nonnegative ordered eigenvalues and no Means metadata.");
    const total = eigenvalues.reduce((sum, value) => sum + value, 0);
    if (!Number.isFinite(total) || variance.some((value, index) => Math.abs(value - eigenvalues[index] / total) > TOLERANCE)) throw new TypeError("Reference SVD eigenvalues must agree with full-basis variance.");
    // Match centeredNetworkRankV3: qualifying sphere-normalized nonnegative
    // networks have inputScale <= 1, so its rounding floor is (8 * EPSILON * E)^2.
    const rankThreshold = Math.max(Number.MIN_VALUE, eigenvalues[0] * 1e-12, (8 * Number.EPSILON * width) ** 2);
    if (rank !== eigenvalues.filter((value) => value > rankThreshold).length) throw new TypeError("Reference SVD intrinsic rank must match its eigenvalues under the numerical rank policy.");
    same(fit.estimableAxes, axes.slice(0, rank), "Reference SVD estimable axes");
  } else {
    if (eigenvalues.length !== 0 || axes[0] !== "MR1") throw new TypeError("Reference Means requires MR1 and no SVD eigenvalues.");
    if (variance[0] <= 0) throw new TypeError("Reference Means MR1 must have positive variance for its nonzero contrast.");
    const means = record(fit.means, ["groupColumn", "negativeLevel", "positiveLevel", "negativeCount", "positiveCount", "direction"], "Reference Means metadata");
    if (configuration.units.group.type !== "stable-metadata" || configuration.units.group.column !== rotation.contrast.groupColumn
      || canonicalJsonV3(rotation.contrast.negativeLevel) === canonicalJsonV3(rotation.contrast.positiveLevel)) throw new TypeError("Reference Means contrast requires stable Group metadata and distinct typed levels.");
    same({ groupColumn: means.groupColumn, negativeLevel: means.negativeLevel, positiveLevel: means.positiveLevel }, rotation.contrast, "Reference Means contrast");
    const negative = integer(means.negativeCount, 1, observations, "Reference negative count");
    const positive = integer(means.positiveCount, 1, observations, "Reference positive count");
    if (negative + positive > observations || means.direction !== "positive-minus-negative") throw new TypeError("Reference Means counts/direction must describe disjoint ordered source groups.");
    const floor = Math.max(...variance) * 1e-12;
    same(fit.estimableAxes, axes.filter((_axis, index) => index === 0 || variance[index] > floor), "Reference Means estimable coordinates");
  }
  return root as unknown as OpenEnaStandardReferenceV2;
}

/** Strict standalone import: unsigned integrity verification, never a new source fit. */
export async function decodeReferenceV2(input: unknown): Promise<OpenEnaStandardReferenceV2> {
  // Complete descriptor-safe detached shape capture and geometry checks precede the first await.
  const reference = decodeShape(input);
  const [configurationHash, contentHash] = await Promise.all([
    sha256CanonicalJsonV3(reference.source.configuration), sha256CanonicalJsonV3(scientificFromArtifact(reference)),
  ]);
  if (configurationHash !== reference.source.configurationSha256) throw new TypeError("Reference source configuration SHA-256 does not match.");
  if (contentHash !== reference.contentSha256) throw new TypeError("Reference content SHA-256 does not match.");
  return deepFreezeV3(reference);
}

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
  const plan = await validateExecutionPlanV3(sourcePlan);
  assertSourcePlan(plan);
  assertScientificReadiness(plan);
  const result = runStandardPlanV3(plan);
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
      method: result.projection.type, origin: "target-fitted", population: "endpoint-units", observationCount: population.length,
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
  const witness = Object.freeze({}) as ReferenceSourceWitnessV3;
  witnesses.set(witness, { scientific: deepFreezeV3(scientificFromArtifact(artifact)), currentIdentity: canonicalJsonV3({ header: plan.header, configuration: plan.configuration }) });
  return witness;
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
  const current = await validateExecutionPlanV3(captured.currentPlan);
  assertSourcePlan(current);
  if (canonicalJsonV3({ header: current.header, configuration: current.configuration }) !== owned.currentIdentity) throw new TypeError("Reference source is stale against the independently supplied current plan.");
  const contentSha256 = await sha256CanonicalJsonV3(owned.scientific);
  return decodeReferenceV2({ ...owned.scientific, displayName, contentSha256, referenceId: `${PREFIX}${contentSha256}` });
}
