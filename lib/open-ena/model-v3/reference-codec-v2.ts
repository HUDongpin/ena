import { JENA_RUNTIME_VERSION, JENA_SOURCE_COMMIT } from "../types";
import { canonicalJsonV3, deepFreezeV3, sha256CanonicalJsonV3, snapshotPlainJsonRecordV3 } from "./canonical-json";
import { MAX_ESTIMATED_EXPORT_BYTES_V3, MAX_ESTIMATED_IDENTITY_PAYLOAD_BYTES_V3, MAX_ESTIMATED_NUMERIC_CELLS_V3, MAX_ESTIMATED_PEAK_BYTES_V3, MAX_ESTIMATED_ROTATION_WORK_UNITS_V3, MAX_ESTIMATED_STATE_COUNT_V3 } from "./resource-budget";
import { decodeCanonicalStandardConfigV3 } from "./schema";
import { buildStandardCodeDictionaryV3 } from "./standard-adapter";
import { OPEN_ENA_EXECUTION_CONTRACT_VERSION_V3, OPEN_ENA_RUNTIME_POLICY_VERSION_V3, OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3 } from "./types";
import type { CanonicalStandardConfigV3, OpenEnaStandardReferenceV2, ReferenceAdmissionV3, ReferenceCodeIdentityV2, ReferenceCompatibilityV2, ValidatedReferenceExecutionBindingV3 } from "./types";

type Scientific = Omit<OpenEnaStandardReferenceV2, "displayName" | "referenceId" | "contentSha256">;
const PREFIX = "open-ena-standard-ref-v2:";
const TOLERANCE = 1e-8;
const ROOT_KEYS = ["schemaVersion", "kind", "family", "sourceModel", "source", "fit", "compatibility", "basis", "geometry", "displayName", "contentSha256", "referenceId"];

// Pure artifact codec: no worker transport, numerical run or source-witness owner.
function record(input: unknown, keys: readonly string[] | undefined, label: string): Record<string, unknown> {
  const value = snapshotPlainJsonRecordV3(input, label);
  const accepted = snapshotPlainJsonRecordV3(input, label);
  const actual = Object.keys(value);
  const expected = keys ?? actual;
  if (actual.length !== expected.length || actual.some((key) => !expected.includes(key))) throw new TypeError(`${label} must have exact keys: ${expected.join(", ")}.`);
  if (Object.keys(accepted).length !== actual.length || actual.some((key) => !Object.hasOwn(accepted, key) || !Object.is(value[key], accepted[key]))) throw new TypeError(`${label} changed during coherent descriptor capture.`);
  return accepted;
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
  if (arrayLength(input, label, max) !== length) throw new TypeError(`${label} length changed during coherent descriptor capture.`);
  const capture = (): unknown[] => {
    const keys = Reflect.ownKeys(input as object);
    if (keys.length !== length + 1 || keys.some((key) => key !== "length" && (typeof key !== "string" || !/^(0|[1-9]\d*)$/u.test(key) || Number(key) >= length))) throw new TypeError(`${label} must be a dense plain Reference array.`);
    return Array.from({ length }, (_unused, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw new TypeError(`${label}[${index}] must be an own data property, not an accessor.`);
      return descriptor.value;
    });
  };
  const staged = capture();
  const accepted = capture();
  if (staged.some((value, index) => !Object.is(value, accepted[index]))) throw new TypeError(`${label} changed during coherent descriptor capture.`);
  return accepted;
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
type ReferenceBaselineV3 = { readonly estimatedNumericCells: number; readonly estimatedPeakBytes: number; readonly estimatedExportBytes: number };
const EMPTY_BASELINE: ReferenceBaselineV3 = { estimatedNumericCells: 0, estimatedPeakBytes: 0, estimatedExportBytes: 0 };

export function assertReferenceAdmissionV3(admission: ReferenceAdmissionV3, baseline: ReferenceBaselineV3): void {
  if (baseline.estimatedNumericCells + admission.incrementalNumericCells > MAX_ESTIMATED_NUMERIC_CELLS_V3
    || baseline.estimatedPeakBytes + admission.incrementalPeakBytes > MAX_ESTIMATED_PEAK_BYTES_V3
    || baseline.estimatedExportBytes + admission.incrementalExportBytes > MAX_ESTIMATED_EXPORT_BYTES_V3) throw new TypeError("Reference and target exceed the combined projection resource budget.");
}

/** Conservative structural cost: four simultaneous capture/hash/runtime representations, one export. */
function referenceAdmission(value: unknown): ReferenceAdmissionV3 {
  let numeric = 0;
  let bytes = 0;
  function visit(input: unknown): void {
    bytes += typeof input === "string" ? input.length * 6 + 32 : typeof input === "object" ? 64 : 32;
    if (typeof input === "number") numeric += 1;
    if (Array.isArray(input)) input.forEach(visit);
    else if (input !== null && typeof input === "object") Object.entries(input).forEach(([key, entry]) => { visit(key); visit(entry); });
  }
  visit(value);
  return { version: 1, incrementalNumericCells: numeric * 4, incrementalPeakBytes: bytes * 4, incrementalExportBytes: bytes };
}

function captureArtifact(input: unknown, baseline: ReferenceBaselineV3 = EMPTY_BASELINE): Record<string, unknown> {
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
  assertReferenceAdmissionV3({ version: 1, incrementalNumericCells: cells * 4, incrementalPeakBytes: cells * 128, incrementalExportBytes: cells * 32 }, baseline);
  basis.codes = array(basis.codes, "Reference Codes", count, count);
  basis.edges = array(basis.edges, "Reference edges", edges, edges);
  const geometry = record(root.geometry, ["centerVector", "rotationMatrix", "rotationColumns", "eigenvalues", "nodeColumns", "nodes"], "Reference geometry");
  const matrixRows = array(geometry.rotationMatrix, "Reference rotationMatrix", edges, edges);
  geometry.rotationMatrix = matrixRows.map((row) => array(row, "Reference rotation row", edges, edges));
  geometry.centerVector = array(geometry.centerVector, "Reference centerVector", edges, edges);
  geometry.rotationColumns = array(geometry.rotationColumns, "Reference rotationColumns", edges, edges);
  geometry.eigenvalues = array(geometry.eigenvalues, "Reference eigenvalues", edges);
  geometry.nodeColumns = array(geometry.nodeColumns, "Reference nodeColumns", 3, 3);
  geometry.nodes = array(geometry.nodes, "Reference nodes", count, count).map((inputNode) => {
    const node = record(inputNode, ["code", "coordinates"], "Reference node");
    return { ...node, coordinates: array(node.coordinates, "Reference node coordinates", 3, 3) };
  });
  let textBytes = 0;
  let retainedBytes = 0;
  let values = 0;
  const active = new WeakSet<object>();
  function capture(value: unknown, label: string, depth: number): unknown {
    values += 1;
    if (values > MAX_ESTIMATED_NUMERIC_CELLS_V3 || depth > 32) throw new TypeError("Reference exceeds the nested value resource budget.");
    // Conservative capture/serialization proxies, using the existing export and peak policies.
    retainedBytes += typeof value === "string" ? value.length * 6 + 32 : typeof value === "object" ? 64 : 32;
    if (retainedBytes + baseline.estimatedExportBytes > MAX_ESTIMATED_EXPORT_BYTES_V3 || retainedBytes * 4 + baseline.estimatedPeakBytes > MAX_ESTIMATED_PEAK_BYTES_V3) throw new TypeError("Reference exceeds the combined capture/export byte resource budget.");
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
      const object = record(value, undefined, label);
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

/** Synchronous pre-copy boundary; no caller-owned Reference graph survives the first await. */
export function captureReferenceExecutionBindingV3(input: unknown, baseline: ReferenceBaselineV3 = EMPTY_BASELINE): ValidatedReferenceExecutionBindingV3 {
  const root = record(input, ["artifact", "admission", "referenceId", "contentSha256", "basisPermutation", "rotationSet", "sourceFit"], "Reference binding");
  const artifact = captureArtifact(root.artifact, baseline) as unknown as OpenEnaStandardReferenceV2;
  const width = artifact.geometry.rotationMatrix.length;
  const count = artifact.basis.codes.length;
  const rotation = record(root.rotationSet, ["codes", "adjacencyKey", "rotationMatrix", "rotationColumns", "eigenvalues", "centerVector", "nodes"], "Reference rotationSet");
  // Before walking any caller binding arrays, charge the artifact and the unavoidable duplicate matrix.
  const artifactAdmission = referenceAdmission(artifact);
  assertReferenceAdmissionV3({ ...artifactAdmission, incrementalPeakBytes: artifactAdmission.incrementalPeakBytes + width * width * 128, incrementalNumericCells: artifactAdmission.incrementalNumericCells + width * width * 4 }, baseline);
  const basisPermutation = array(root.basisPermutation, "Reference basis permutation", width, width).map((value) => integer(value, 0, width - 1, "Reference basis index"));
  const codes = array(rotation.codes, "Reference runtime Codes", count, count).map((value) => string(value, "Reference runtime Code"));
  const adjacencyKey = array(rotation.adjacencyKey, "Reference runtime edges", width, width).map((entry) => {
    const edge = record(entry, ["source", "target", "name", "sourceIndex", "targetIndex"], "Reference runtime edge");
    return { source: string(edge.source, "Reference edge source"), target: string(edge.target, "Reference edge target"), name: string(edge.name, "Reference edge name"), sourceIndex: integer(edge.sourceIndex, 0, count - 1, "Reference source index"), targetIndex: integer(edge.targetIndex, 0, count - 1, "Reference target index") };
  });
  const rotationColumns = array(rotation.rotationColumns, "Reference runtime axes", width, width).map((value) => string(value, "Reference runtime axis"));
  const rotationMatrix = array(rotation.rotationMatrix, "Reference runtime matrix", width, width).map((row) => vector(row, width, "Reference runtime matrix row"));
  const centerVector = vector(rotation.centerVector, width, "Reference runtime center");
  const eigenvalues = array(rotation.eigenvalues, "Reference runtime eigenvalues", width).map((value) => finite(value, "Reference runtime eigenvalue"));
  const nodes = array(rotation.nodes, "Reference runtime nodes", count, count).map((entry) => {
    const node = record(entry, ["code", ...rotationColumns.slice(0, 3)], "Reference runtime node");
    return { code: string(node.code, "Reference runtime node Code"), ...Object.fromEntries(rotationColumns.slice(0, 3).map((axis) => [axis, finite(node[axis], "Reference runtime node coordinate")])) };
  });
  const admission = record(root.admission, ["version", "incrementalNumericCells", "incrementalPeakBytes", "incrementalExportBytes"], "Reference admission");
  if (admission.version !== 1) throw new TypeError("Reference admission version is unsupported.");
  for (const key of ["incrementalNumericCells", "incrementalPeakBytes", "incrementalExportBytes"]) integer(admission[key], 0, Number.MAX_SAFE_INTEGER, "Reference admission cost");
  const captured = { artifact, referenceId: string(root.referenceId, "Reference binding ID"), contentSha256: hash(root.contentSha256, "Reference binding SHA"), basisPermutation, rotationSet: { codes, adjacencyKey, rotationMatrix, rotationColumns, eigenvalues, centerVector, nodes }, sourceFit: root.sourceFit };
  if (captured.sourceFit !== "svd" && captured.sourceFit !== "means") throw new TypeError("Reference source fit must be SVD or Means.");
  const derived = referenceAdmission(captured);
  assertReferenceAdmissionV3(derived, baseline);
  same(admission, derived, "Reference admission ledger");
  return { ...captured, sourceFit: captured.sourceFit, admission: derived };
}

function scientificFromArtifact(reference: OpenEnaStandardReferenceV2): Scientific {
  const { displayName: _displayName, referenceId: _referenceId, contentSha256: _contentSha256, ...scientific } = reference;
  return scientific;
}

/** Decode both inputs before awaiting hashes, then bind only a compatible complete Reference. */
export async function bindReferenceToTargetV3(input: unknown, target: CanonicalStandardConfigV3): Promise<ValidatedReferenceExecutionBindingV3> {
  const capturedArtifact = captureArtifact(input);
  const sourceCodeCount = (capturedArtifact.basis as { codes: unknown[] }).codes.length;
  let config: CanonicalStandardConfigV3;
  try {
    const capturedTarget = record(target, undefined, "Reference target configuration");
    capturedTarget.codes = array(capturedTarget.codes, "Reference target Codes", sourceCodeCount, sourceCodeCount);
    config = decodeCanonicalStandardConfigV3(capturedTarget);
  }
  catch (error) {
    if (error instanceof TypeError) throw new TypeError(`Reference target configuration is invalid: ${error.message}`, { cause: error });
    throw error;
  }
  const reference = await decodeReferenceV2(capturedArtifact).catch((error: unknown) => {
    if (error instanceof TypeError && !error.message.includes("Reference")) throw new TypeError(`Reference artifact is invalid: ${error.message}`, { cause: error });
    throw error;
  });
  const rotation = config.analysis.rotation;
  if (rotation.type !== "reference" || rotation.referenceId !== reference.referenceId || rotation.expectedContentSha256 !== reference.contentSha256) throw new TypeError("Reference target identity/content SHA does not match the selected artifact.");
  same(reference.compatibility, compatibility(config), "Reference target compatibility");
  const identityKey = (value: ReferenceCodeIdentityV2) => canonicalJsonV3(value);
  const sourceCodes = new Set(reference.basis.codes.map(identityKey));
  if (sourceCodes.size !== config.codes.length || config.codes.some((entry) => !sourceCodes.has(identityKey(code(entry.column))))) throw new TypeError("Reference and target must have identical typed Code identities, without implicit field renaming.");
  const dictionary = buildStandardCodeDictionaryV3(config.codes);
  const edgeKey = (left: ReferenceCodeIdentityV2, right: ReferenceCodeIdentityV2) => canonicalJsonV3([identityKey(left), identityKey(right)].sort());
  const edgeIndices = new Map(reference.basis.edges.map((edge, index) => [edgeKey(edge.source, edge.target), index]));
  const basisPermutation = dictionary.edges.map((edge) => {
    const index = edgeIndices.get(edgeKey(code(edge.sourceCodeIdentity), code(edge.targetCodeIdentity)));
    if (index === undefined) throw new TypeError("Reference is missing a target undirected edge.");
    return index;
  });
  if (new Set(basisPermutation).size !== dictionary.edges.length) throw new TypeError("Reference edge permutation is not bijective.");
  const expectedAxes = reference.geometry.rotationColumns.map((_axis, index) => index === 0 && reference.fit.method === "means" ? "MR1" : `SVD${index + 1}`);
  same(reference.geometry.rotationColumns, expectedAxes, "Reference runtime axes");
  const nodesByIdentity = new Map(reference.geometry.nodes.map((node) => [identityKey(node.code), node]));
  const runtimeCodes = dictionary.codes.map((entry) => entry.token);
  const codeIndices = new Map(dictionary.codes.map((entry, index) => [entry.sourceColumn, index]));
  const rotationSet = {
    codes: runtimeCodes,
    adjacencyKey: dictionary.edges.map((edge) => {
      const sourceIndex = codeIndices.get(edge.sourceCodeIdentity)!;
      const targetIndex = codeIndices.get(edge.targetCodeIdentity)!;
      return { source: runtimeCodes[sourceIndex], target: runtimeCodes[targetIndex], name: `${runtimeCodes[sourceIndex]} & ${runtimeCodes[targetIndex]}`, sourceIndex, targetIndex };
    }),
    rotationMatrix: basisPermutation.map((index) => [...reference.geometry.rotationMatrix[index]]),
    centerVector: basisPermutation.map((index) => reference.geometry.centerVector[index]),
    rotationColumns: [...reference.geometry.rotationColumns], eigenvalues: [...reference.geometry.eigenvalues],
    nodes: dictionary.codes.map((entry) => {
      const node = nodesByIdentity.get(identityKey(code(entry.sourceColumn)));
      if (!node) throw new TypeError("Reference fixed node identity is missing.");
      return { code: entry.token, ...Object.fromEntries(reference.geometry.nodeColumns.map((axis, index) => [axis, node.coordinates[index]])) };
    }),
  };
  // A row permutation must retain the same orthonormal columns; verify the remapped geometry too.
  for (let left = 0; left < rotationSet.rotationColumns.length; left += 1) for (let right = left; right < rotationSet.rotationColumns.length; right += 1) {
    const product = rotationSet.rotationMatrix.reduce((sum, row) => sum + row[left] * row[right], 0);
    if (Math.abs(product - (left === right ? 1 : 0)) > TOLERANCE) throw new TypeError("Reference remapped geometry must remain orthonormal.");
  }
  const captured = { artifact: { ...reference, displayName: reference.referenceId }, referenceId: reference.referenceId, contentSha256: reference.contentSha256, basisPermutation, rotationSet, sourceFit: reference.fit.method };
  const admission = referenceAdmission(captured);
  assertReferenceAdmissionV3(admission, EMPTY_BASELINE);
  return deepFreezeV3({ ...captured, admission });
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


/** @internal Shared pure validators/formatters; none can create a source witness. */
export const referenceCodecInternalsV2 = Object.freeze({ record, string, finite, code, compatibility, scientificFromArtifact });
