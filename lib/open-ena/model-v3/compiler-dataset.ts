import {
  canonicalJsonV3,
  deepFreezeV3,
  sha256CanonicalJsonV3,
  snapshotDenseJsonArrayV3,
  snapshotPlainJsonRecordV3,
} from "./canonical-json";
import { scalarIdentityV3 } from "./identity";
import {
  MAX_ESTIMATED_IDENTITY_PAYLOAD_BYTES_V3,
  MAX_ESTIMATED_EXPORT_BYTES_V3,
  ResourceEstimateErrorV3,
  estimateCanonicalIdentityAdmissionFieldPayloadBytesV3,
  estimateOnaResourcesV3,
  estimateStandardResourcesV3,
} from "./resource-budget";
import type {
  OnaResourceEstimateV3,
  StandardResourceEstimateV3,
} from "./resource-budget";
import type {
  CanonicalOnaConfigV3,
  CanonicalStandardConfigV3,
  DatasetBindingV3,
} from "./types";
import { datasetHashKindFor } from "../types";
import type { ParsedDataset } from "../types";

const LOWERCASE_SHA256 = /^[a-f0-9]{64}$/u;
const PROVISIONAL_HEADER_SHA256_V3 = "0".repeat(64);
const own = Object.prototype.hasOwnProperty;

/** @internal Coherent shallow envelope captured before any async boundary. */
export interface CompilerDatasetEnvelopeV3 {
  readonly name: string;
  readonly headers: unknown[];
  readonly rows: unknown[];
  readonly sizeBytes: number;
  readonly source: "sample" | "upload";
  readonly hashKind?: ParsedDataset["hashKind"];
}

function exactKeysV3(
  record: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} has an invalid shape.`);
  }
}

function shallowArrayLengthV3(value: unknown, label: string): { value: unknown[]; length: number } {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new TypeError(`${label} must be a plain array.`);
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (descriptor === undefined
    || descriptor.enumerable
    || !("value" in descriptor)
    || typeof descriptor.value !== "number"
    || !Number.isSafeInteger(descriptor.value)
    || descriptor.value < 0) {
    throw new TypeError(`${label}.length is invalid.`);
  }
  return { value, length: descriptor.value };
}

/** @internal Strict root snapshot without touching row objects. */
export function compilerDatasetEnvelopeV3(datasetValue: ParsedDataset): CompilerDatasetEnvelopeV3 {
  const record = snapshotPlainJsonRecordV3(datasetValue, "dataset");
  const expected = Object.hasOwn(record, "hashKind")
    ? ["name", "headers", "rows", "sizeBytes", "source", "hashKind"]
    : ["name", "headers", "rows", "sizeBytes", "source"];
  exactKeysV3(record, expected, "dataset");
  if (typeof record.name !== "string" || record.name.trim().length === 0) {
    throw new TypeError("dataset.name must be a nonblank string.");
  }
  if (typeof record.sizeBytes !== "number"
    || !Number.isSafeInteger(record.sizeBytes)
    || record.sizeBytes < 0) {
    throw new TypeError("dataset.sizeBytes must be a nonnegative safe integer.");
  }
  if (record.source !== "sample" && record.source !== "upload") {
    throw new TypeError("dataset.source must be sample or upload.");
  }
  const headers = shallowArrayLengthV3(record.headers, "dataset.headers");
  const rows = shallowArrayLengthV3(record.rows, "dataset.rows");
  const candidate = {
    name: record.name,
    ...(Object.hasOwn(record, "hashKind") ? { hashKind: record.hashKind as ParsedDataset["hashKind"] } : {}),
  };
  let hashKind: ParsedDataset["hashKind"];
  try {
    hashKind = datasetHashKindFor(candidate);
  } catch (error) {
    throw new TypeError(
      error instanceof Error ? error.message : "dataset.hashKind is unsupported.",
      { cause: error },
    );
  }
  return {
    name: record.name,
    headers: headers.value,
    rows: rows.value,
    sizeBytes: record.sizeBytes,
    source: record.source,
    hashKind,
  };
}

/** @internal Plain envelope view consumed by Standard staged diagnostics. */
export function parsedEnvelopeV3(envelope: CompilerDatasetEnvelopeV3): ParsedDataset {
  return {
    name: envelope.name,
    headers: envelope.headers as string[],
    rows: envelope.rows as ParsedDataset["rows"],
    sizeBytes: envelope.sizeBytes,
    source: envelope.source,
    ...(envelope.hashKind === undefined ? {} : { hashKind: envelope.hashKind }),
  };
}

export interface CompilerDatasetBindingCaptureV3 {
  /**
   * Synchronous seed used only while capturing Standard rows. The provisional
   * header digest never leaves the compiler and is replaced after the
   * invocation-time header hash promise resolves.
   */
  readonly provisionalBinding: DatasetBindingV3;
  readonly bindingPromise: Promise<DatasetBindingV3>;
}

/** @internal Captures binding scalars and starts the header hash before the caller can mutate input. */
export function captureDatasetBindingV3(
  envelope: CompilerDatasetEnvelopeV3,
  datasetSha256: string,
): CompilerDatasetBindingCaptureV3 {
  if (!LOWERCASE_SHA256.test(datasetSha256)) {
    throw new TypeError("datasetSha256 must be a lowercase 64-hex SHA-256 digest.");
  }
  const hashKind = datasetHashKindFor(envelope);
  const rowCount = shallowArrayLengthV3(envelope.rows, "dataset.rows").length;
  const provisionalBinding: DatasetBindingV3 = {
    hashKind,
    normalizedTableSha256: datasetSha256,
    rowCount,
    headerSha256: PROVISIONAL_HEADER_SHA256_V3,
  };
  const headerSha256Promise = sha256CanonicalJsonV3(envelope.headers);
  return {
    provisionalBinding,
    bindingPromise: headerSha256Promise.then((headerSha256) => ({
      hashKind,
      normalizedTableSha256: datasetSha256,
      rowCount,
      headerSha256,
    })),
  };
}

/** @internal Synchronous detached ONA snapshot; header hash verification follows on the snapshot. */
export function snapshotCompilerDatasetInputV3(
  envelope: CompilerDatasetEnvelopeV3,
  binding: DatasetBindingV3,
): ParsedDataset {
  const headers = snapshotDenseJsonArrayV3(envelope.headers, "dataset.headers");
  if (headers.some((header) => typeof header !== "string" || header.trim().length === 0)
    || new Set(headers).size !== headers.length) {
    throw new TypeError("dataset.headers must contain distinct nonblank strings.");
  }
  const rowValues = snapshotDenseJsonArrayV3(envelope.rows, "dataset.rows");
  if (rowValues.length !== binding.rowCount) throw new TypeError("dataset row count changed during intake.");
  const rows = rowValues.map((row, index) => snapshotPlainJsonRecordV3(row, `dataset.rows[${index}]`));
  return deepFreezeV3({
    name: envelope.name,
    headers: headers as string[],
    rows: rows as ParsedDataset["rows"],
    sizeBytes: envelope.sizeBytes,
    source: envelope.source,
    ...(envelope.hashKind === undefined ? {} : { hashKind: envelope.hashKind }),
  });
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
  const columns = new Set<string>([...config.units.columns, ...config.horizons.columns]);
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

/**
 * Data-derived bound for complete BoundResult identity/metadata serialization.
 * Role occurrences include both Unit and ENA_UNIT: Unit14, Horizon8, Group7
 * across model tables, metadata, trajectories and composite unitLabels. Counting
 * all source rows conservatively covers observed targets without imputing steps.
 * Dictionary fields, embedded canonical JSON and worst typed display labels are
 * counted independently, even when different roles use the same source fields.
 */
export function estimateOnaGeneratedTableKeyBytesV3(dataset: Pick<ParsedDataset, "rows">, config: CanonicalOnaConfigV3): number {
  // Typed Map keys preserve number/string/Boolean distinctions without encoding
  // potentially huge identity strings before their separate byte admission.
  interface Trie { children: Map<string | number | boolean, Trie>; terminal: boolean }
  const root: Trie = { children: new Map(), terminal: false };
  let units = 0;
  for (const row of dataset.rows) {
    let current = root;
    for (const column of config.units.columns) {
      const value = scalarIdentityV3(Object.getOwnPropertyDescriptor(row, column)?.value, "ONA Unit key bound").value;
      let child = current.children.get(value);
      if (!child) { child = { children: new Map(), terminal: false }; current.children.set(value, child); }
      current = child;
    }
    if (!current.terminal) { current.terminal = true; units += 1; }
  }
  const c = config.codes.length, e = c * c, d = Math.min(3, e);
  const bytes = 64 * (4 * units * e + 2 * units * d + c * d);
  if (!Number.isSafeInteger(bytes)) throw new ResourceEstimateErrorV3("UNSAFE_ARITHMETIC", "ONA generated table-key bytes exceed safe arithmetic.");
  return bytes;
}

export function estimateResultIdentityBytesV3(dataset: Pick<ParsedDataset, "rows">, config: CanonicalStandardConfigV3 | CanonicalOnaConfigV3): number {
  const encoder = new TextEncoder();
  const bytes = (value: unknown) => encoder.encode(canonicalJsonV3(value)).byteLength;
  let total = 0;
  const add = (value: number) => { total = addSafeV3(total, value, "Bound result identity bytes"); };
  const multiply = (left: number, right: number) => {
    const result = left * right;
    if (!Number.isSafeInteger(result)) throw new ResourceEstimateErrorV3("UNSAFE_ARITHMETIC", "Bound result identity multiplication exceeds safe arithmetic.");
    return result;
  };
  // Fixed field names, version/hash strings, numeric/index text and bounded
  // diagnostic wrappers. Dynamic Code/identity strings are charged below.
  const c = config.codes.length;
  const e = config.analysisFamily === "ona" ? c * c : c * (c - 1) / 2;
  add(16_384 + multiply(c * c + 10, 2_048) + multiply(dataset.rows.length, 1_024) + multiply(e, 256));
  if (config.analysisFamily === "ona") {
    // Generated Code/Connection/SVD field names repeat in the four Unit×edge
    // tables and point/centroid/node tables. No source label becomes a key.
    add(estimateOnaGeneratedTableKeyBytesV3(dataset, config));
  }
  for (const [role, columns, occurrences] of [
    ["Unit", config.units.columns, 14], ["Horizon", config.horizons.columns, 8],
    ["Group", config.units.group.type === "stable-metadata" ? [config.units.group.column] : [], config.analysisFamily === "ona" ? 8 : 7],
  ] as const) {
    if (columns.length === 0) continue;
    for (const source of dataset.rows) {
      // Admission before constructing long labels, including a caller-declared
      // tiny source size. Column/value length itself supplies this lower bound.
      let constructionBytes = 0;
      for (const column of columns) {
        const value = Object.getOwnPropertyDescriptor(source, column)?.value;
        constructionBytes = addSafeV3(constructionBytes, estimateCanonicalIdentityAdmissionFieldPayloadBytesV3(column, value), "Identity label construction");
      }
      // The field proxy already uses6bytes per UTF16 unit. Eight such copies
      // bound base+typed forms, their two JSON escaping layers and dictionary
      // wrappers before any long string is concatenated or encoded.
      const constructionBound = addSafeV3(total, addSafeV3(multiply(constructionBytes, 8 * (occurrences + 1)), 4_096, "Role construction wrappers"), "Result identity admission");
      if (constructionBound > MAX_ESTIMATED_EXPORT_BYTES_V3) return constructionBound;
      const fields = columns.map((column) => ({ column, value: scalarIdentityV3(Object.getOwnPropertyDescriptor(source, column)?.value, "Result identity source") }));
      const base = fields.map((field) => `${field.column}=${String(field.value.value)}`).join(", ");
      const typed = fields.map((field) => `${field.column}:${field.value.type}(${JSON.stringify(field.value.value)})`).join(", ");
      // Any suffix count is bounded by the number of admitted source values and
      // allocated identities, both below MAX_SAFE_INTEGER.16digits covers it.
      const displayLabel = `${role} ${base} [${typed}] #9007199254740991`;
      // Composite unitLabels embeds a JSON array as a JSON string, so use the
      // second escaped form for every label occurrence (a conservative bound).
      add(multiply(bytes(canonicalJsonV3(displayLabel)) + 8, occurrences));
      add(bytes({ token: "x".repeat(64), fields, canonicalJson: canonicalJsonV3({ fields }), sha256: "x".repeat(64), displayLabel }));
      if (total > MAX_ESTIMATED_EXPORT_BYTES_V3) return total;
    }
  }
  // Bound encoding expansion before creating the complete policy JSON string.
  function encodedUpperBound(value: unknown): number {
    if (typeof value === "string") return multiply(value.length, 6) + 2;
    if (value === null || typeof value !== "object") return 24;
    if (Array.isArray(value)) return value.reduce((sum, item) => addSafeV3(sum, encodedUpperBound(item) + 1, "Policy array bytes"), 2);
    return Object.entries(value).reduce((sum, [key, item]) => addSafeV3(sum, encodedUpperBound(key) + encodedUpperBound(item) + 2, "Policy object bytes"), 2);
  }
  const policyConstruction = addSafeV3(total, multiply(encodedUpperBound(config), 8), "Policy capture bytes");
  if (policyConstruction > MAX_ESTIMATED_EXPORT_BYTES_V3) return policyConstruction;
  // Complete canonical configuration plus requested/resolved policy copies.
  add(multiply(bytes(config), 8));
  // Source/display Code identities occur in configuration, audit dictionaries,
  // reversible aliases and both endpoint fields of canonical/alias edge maps.
  for (const code of config.codes) {
    const occurrences = config.analysisFamily === "ona" ? 16 + 4 * c : 12 + 2 * Math.max(0, c - 1);
    const codeConstruction = addSafeV3(total, multiply(6 * (code.column.length + code.displayLabel.length) + 512, 2 * occurrences), "Code identity construction");
    if (codeConstruction > MAX_ESTIMATED_EXPORT_BYTES_V3) return codeConstruction;
    add(multiply(bytes({ column: code.column, displayLabel: code.displayLabel, identity: canonicalJsonV3({ type: "string", value: code.column }) }), occurrences));
  }
  return total;
}

function resourceShapeV3(
  dataset: ParsedDataset,
  config: CanonicalStandardConfigV3 | CanonicalOnaConfigV3,
): {
  unitCount: number;
  horizonSizes: number[];
  unitHorizonSizes: number[];
  trajectorySteps: number;
  identityPayloadBytes: number;
} {
  const unitKeys = new Set<string>();
  const horizonSizes = new Map<string, number>();
  const unitHorizonSizes = new Map<string, number>();
  const horizonsByUnit = new Map<string, Set<string>>();
  for (let rowIndex = 0; rowIndex < dataset.rows.length; rowIndex += 1) {
    const row = snapshotPlainJsonRecordV3(dataset.rows[rowIndex], `dataset.rows[${rowIndex}]`);
    const unit = identityKeyV3(row, config.units.columns, `dataset.rows[${rowIndex}] Unit`);
    const horizon = identityKeyV3(row, config.horizons.columns, `dataset.rows[${rowIndex}] Horizon`);
    unitKeys.add(unit);
    horizonSizes.set(horizon, (horizonSizes.get(horizon) ?? 0) + 1);
    const partition = canonicalJsonV3([unit, horizon]);
    unitHorizonSizes.set(partition, (unitHorizonSizes.get(partition) ?? 0) + 1);
    const observed = horizonsByUnit.get(unit) ?? new Set<string>();
    observed.add(horizon);
    horizonsByUnit.set(unit, observed);
  }
  const trajectorySteps = config.analysisFamily === "standard"
    && config.analysis.model.type !== "EndPoint"
    ? [...horizonsByUnit.values()].reduce(
        (total, values) => addSafeV3(total, values.size, "Trajectory steps"),
        0,
      )
    : unitKeys.size;
  const sortedSizes = (sizes: Map<string, number>): number[] => [...sizes.entries()]
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([, size]) => size);
  return {
    unitCount: unitKeys.size,
    horizonSizes: sortedSizes(horizonSizes),
    unitHorizonSizes: sortedSizes(unitHorizonSizes),
    trajectorySteps,
    identityPayloadBytes: identityPayloadBytesV3(
      dataset.rows as Array<Record<string, unknown>>,
      selectedIdentityColumnsV3(config),
    ),
  };
}

/** @internal Exact Standard post-validation estimate. */
export function exactStandardResourceEstimateV3(
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
    windowPartitionSizes: config.window.type === "Conversation"
      ? shape.unitHorizonSizes
      : shape.horizonSizes,
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
    resultIdentityBytes: estimateResultIdentityBytesV3(dataset, config),
  });
}

/** @internal Exact ONA post-validation estimate. */
export function exactOnaResourceEstimateV3(
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
