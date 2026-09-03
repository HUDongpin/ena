import { canonicalJsonV3, sha256TextV3 } from "./canonical-json";
import type { ScalarIdentityV3 } from "./types";

export interface IdentityFieldV3 {
  column: string;
  value: ScalarIdentityV3;
}

export interface CompositeIdentityV3 {
  fields: IdentityFieldV3[];
  canonicalJson: string;
  sha256: string;
}

export interface ExecutionIdentityEntryV3 extends CompositeIdentityV3 {
  token: string;
  displayLabel: string;
}

export interface ExecutionIdentityDictionaryV3 {
  units: ExecutionIdentityEntryV3[];
  horizons: ExecutionIdentityEntryV3[];
  groups: ExecutionIdentityEntryV3[];
}

export type IdentityNamespaceV3 = "unit" | "horizon" | "group";

export type IdentityLookupCandidateV3 = Pick<CompositeIdentityV3, "sha256" | "canonicalJson" | "fields">;

const own = Object.prototype.hasOwnProperty;

function assertColumnsV3(columns: readonly string[], label: string): string[] {
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new TypeError(`${label} must be a nonempty dense list of distinct nonblank strings.`);
  }
  const copy: string[] = [];
  for (let index = 0; index < columns.length; index += 1) {
    if (!own.call(columns, index)) {
      throw new TypeError(`${label} must be a dense list of distinct nonblank strings.`);
    }
    const column = columns[index];
    if (typeof column !== "string" || column.trim().length === 0) {
      throw new TypeError(`${label}[${index}] must be a nonblank string.`);
    }
    copy.push(column);
  }
  if (new Set(copy).size !== copy.length) {
    throw new TypeError(`${label} must contain distinct column names.`);
  }
  return copy;
}

function assertRowV3(row: unknown, rowIndex: number | string): Record<string, unknown> {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    throw new TypeError(`row ${rowIndex} must be an object.`);
  }
  return row as Record<string, unknown>;
}

function readRowPropertyV3(row: Record<string, unknown>, column: string, rowLabel: string): unknown {
  if (!own.call(row, column)) {
    throw new TypeError(`${rowLabel} is missing required property ${JSON.stringify(column)}.`);
  }
  const descriptor = Object.getOwnPropertyDescriptor(row, column);
  if (descriptor === undefined || !("value" in descriptor)) {
    throw new TypeError(`${rowLabel}.${column} must be an own data property.`);
  }
  return descriptor.value;
}

export function scalarIdentityV3(value: unknown, label: string): ScalarIdentityV3 {
  switch (typeof value) {
    case "string":
      if (value.length === 0) throw new TypeError(`${label} must be a nonempty string.`);
      return { type: "string", value };
    case "number":
      if (!Number.isFinite(value)) throw new TypeError(`${label} must be a finite number.`);
      return { type: "number", value: Object.is(value, -0) ? 0 : value };
    case "boolean":
      return { type: "boolean", value };
    default:
      throw new TypeError(`${label} must be a nonempty string, finite number, or boolean.`);
  }
}

function canonicalFieldsV3(fields: readonly IdentityFieldV3[], label = "identity fields"): string {
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new TypeError(`${label} must be a nonempty dense list.`);
  }
  for (let index = 0; index < fields.length; index += 1) {
    if (!own.call(fields, index)) throw new TypeError(`${label} must be a nonempty dense list.`);
  }
  const normalized = fields.map((field, index) => {
    if (field === null || typeof field !== "object" || Array.isArray(field)
      || typeof field.column !== "string" || field.column.trim().length === 0
      || field.value === null || typeof field.value !== "object" || Array.isArray(field.value)) {
      throw new TypeError(`${label}[${index}] is malformed.`);
    }
    const scalar = scalarIdentityV3(field.value.value, `${label}[${index}].value`);
    if (field.value.type !== scalar.type) {
      throw new TypeError(`${label}[${index}] has an inconsistent scalar type.`);
    }
    return { column: field.column, value: scalar };
  });
  if (new Set(normalized.map((field) => field.column)).size !== normalized.length) {
    throw new TypeError(`${label} must contain distinct columns.`);
  }
  return canonicalJsonV3({
    fields: normalized.map((field) => ({
      column: field.column,
      value: { type: field.value.type, value: field.value.value },
    })),
  });
}

function normalizeHashV3(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/iu.test(value)) {
    throw new TypeError(`${label} must return a 64-character SHA-256 hexadecimal string.`);
  }
  return value.toLowerCase();
}

async function makeCompositeIdentityV3(
  row: unknown,
  columns: readonly string[],
  label: string,
): Promise<CompositeIdentityV3> {
  const normalizedColumns = assertColumnsV3(columns, `${label} columns`);
  const record = assertRowV3(row, label);
  const fields = normalizedColumns.map((column) => ({
    column,
    value: scalarIdentityV3(readRowPropertyV3(record, column, label), `${label}.${column}`),
  }));
  const canonicalJson = canonicalFieldsV3(fields);
  const sha256 = normalizeHashV3(await sha256TextV3(canonicalJson), `${label} hash`);
  return { fields, canonicalJson, sha256 };
}

export async function buildCompositeIdentityV3(
  row: unknown,
  columns: readonly string[],
): Promise<CompositeIdentityV3> {
  return makeCompositeIdentityV3(row, columns, "row");
}

function namespacePrefixV3(namespace: IdentityNamespaceV3): string {
  switch (namespace) {
    case "unit": return "__open_ena_unit_v3_";
    case "horizon": return "__open_ena_horizon_v3_";
    case "group": return "__open_ena_group_v3_";
    default: throw new TypeError(`Unknown identity namespace ${String(namespace)}.`);
  }
}

function scalarDisplayValueV3(value: ScalarIdentityV3): string {
  return value.type === "string" ? value.value : String(value.value);
}

function baseDisplayLabelV3(fields: readonly IdentityFieldV3[]): string {
  return fields.map((field) => `${field.column}=${scalarDisplayValueV3(field.value)}`).join(", ");
}

function typedDisplayDisambiguatorV3(fields: readonly IdentityFieldV3[]): string {
  return fields.map((field) => `${field.column}:${field.value.type}(${JSON.stringify(field.value.value)})`).join(", ");
}

function indexIdentityCompositesV3(
  composites: readonly CompositeIdentityV3[],
  namespace: IdentityNamespaceV3,
  reservedStrings: ReadonlySet<string>,
): ExecutionIdentityEntryV3[] {
  const byHash = new Map<string, CompositeIdentityV3>();
  for (const composite of composites) {
    const prior = byHash.get(composite.sha256);
    if (prior !== undefined && prior.canonicalJson !== composite.canonicalJson) {
      throw new Error(`SHA-256 collision in ${namespace} identity dictionary for hash ${composite.sha256}.`);
    }
    if (prior === undefined) byHash.set(composite.sha256, composite);
  }

  const unique = Array.from(byHash.values()).sort((a, b) => {
    if (a.sha256 < b.sha256) return -1;
    if (a.sha256 > b.sha256) return 1;
    if (a.canonicalJson < b.canonicalJson) return -1;
    if (a.canonicalJson > b.canonicalJson) return 1;
    return 0;
  });
  const prefix = namespacePrefixV3(namespace);
  const baseLabels = unique.map((composite) => baseDisplayLabelV3(composite.fields));
  const labelCounts = new Map<string, number>();
  for (const label of baseLabels) labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);

  let tokenIndex = 0;
  return unique.map((composite, index) => {
    const baseLabel = baseLabels[index];
    const displayLabel = (labelCounts.get(baseLabel) ?? 0) > 1
      ? `${baseLabel} [${typedDisplayDisambiguatorV3(composite.fields)}]`
      : baseLabel;
    let token = `${prefix}${String(tokenIndex).padStart(6, "0")}`;
    while (reservedStrings.has(token)) {
      tokenIndex += 1;
      token = `${prefix}${String(tokenIndex).padStart(6, "0")}`;
    }
    tokenIndex += 1;
    return {
      token,
      fields: composite.fields.map((field) => ({
        column: field.column,
        value: { type: field.value.type, value: field.value.value } as ScalarIdentityV3,
      })),
      canonicalJson: composite.canonicalJson,
      sha256: composite.sha256,
      displayLabel,
    };
  });
}

export function assertUniqueIdentityHashBindingsV3(
  identities: readonly Pick<CompositeIdentityV3, "sha256" | "canonicalJson">[],
): void {
  const byHash = new Map<string, string>();
  for (const identity of identities) {
    const sha256 = normalizeHashV3(identity.sha256, "identity sha256");
    if (typeof identity.canonicalJson !== "string") {
      throw new TypeError("Identity canonicalJson must be a string.");
    }
    const priorCanonicalJson = byHash.get(sha256);
    if (priorCanonicalJson !== undefined && priorCanonicalJson !== identity.canonicalJson) {
      throw new Error(`SHA-256 collision for hash ${sha256}.`);
    }
    if (priorCanonicalJson === undefined) byHash.set(sha256, identity.canonicalJson);
  }
}

function appendCompositeV3(
  target: CompositeIdentityV3[],
  composite: CompositeIdentityV3,
): void {
  target.push({
    fields: composite.fields.map((field) => ({
      column: field.column,
      value: { type: field.value.type, value: field.value.value } as ScalarIdentityV3,
    })),
    canonicalJson: composite.canonicalJson,
    sha256: composite.sha256,
  });
}

export async function buildExecutionIdentityDictionaryV3(
  rows: readonly Record<string, unknown>[],
  unitColumns: readonly string[],
  horizonColumns: readonly string[],
  groupColumn: string | null,
): Promise<ExecutionIdentityDictionaryV3> {
  const normalizedUnitColumns = assertColumnsV3(unitColumns, "unitColumns");
  const normalizedHorizonColumns = assertColumnsV3(horizonColumns, "horizonColumns");
  if (groupColumn !== null && (typeof groupColumn !== "string" || groupColumn.trim().length === 0)) {
    throw new TypeError("groupColumn must be null or a nonblank string.");
  }
  const units: CompositeIdentityV3[] = [];
  const horizons: CompositeIdentityV3[] = [];
  const groups: CompositeIdentityV3[] = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = assertRowV3(rows[rowIndex], `row ${rowIndex}`);
    appendCompositeV3(units, await makeCompositeIdentityV3(row, normalizedUnitColumns, `row ${rowIndex} unit`));
    appendCompositeV3(horizons, await makeCompositeIdentityV3(row, normalizedHorizonColumns, `row ${rowIndex} horizon`));
    if (groupColumn !== null) {
      appendCompositeV3(groups, await makeCompositeIdentityV3(row, [groupColumn], `row ${rowIndex} group`));
    }
  }

  const reservedStrings = new Set<string>([
    ...normalizedUnitColumns,
    ...normalizedHorizonColumns,
    ...(groupColumn === null ? [] : [groupColumn]),
  ]);
  for (const composite of [...units, ...horizons, ...groups]) {
    for (const field of composite.fields) {
      if (field.value.type === "string") reservedStrings.add(field.value.value);
    }
  }
  assertUniqueIdentityHashBindingsV3([...units, ...horizons, ...groups]);

  return {
    units: indexIdentityCompositesV3(units, "unit", reservedStrings),
    horizons: indexIdentityCompositesV3(horizons, "horizon", reservedStrings),
    groups: indexIdentityCompositesV3(groups, "group", reservedStrings),
  };
}

export function resolveIdentityEntryV3(
  entries: readonly ExecutionIdentityEntryV3[],
  identity: string | IdentityLookupCandidateV3,
): ExecutionIdentityEntryV3 {
  if (identity === null || (typeof identity !== "string"
    && (typeof identity !== "object" || Array.isArray(identity)))) {
    throw new TypeError("Identity lookup requires a token, hash, or composite identity object.");
  }
  const candidate = typeof identity === "string" ? null : identity;
  let lookupHash: string;
  if (typeof identity === "string") {
    if (identity.length === 0) throw new TypeError("Identity lookup requires a nonempty token or hash string.");
    lookupHash = identity.toLowerCase();
  } else {
    lookupHash = normalizeHashV3(identity.sha256, "identity lookup sha256");
  }
  const matches = entries.filter((entry) => candidate === null
    ? entry.token === identity || entry.sha256 === lookupHash
    : entry.sha256 === lookupHash);
  if (matches.length !== 1) {
    throw new Error(`Unknown identity token/hash ${JSON.stringify(identity)}.`);
  }
  const entry = matches[0];
  const entryCanonicalJson = canonicalFieldsV3(entry.fields, "dictionary entry fields");
  if (entryCanonicalJson !== entry.canonicalJson) {
    throw new Error(`Malformed identity dictionary entry ${entry.token}: typed fields do not match canonicalJson.`);
  }
  if (candidate !== null) {
    const candidateCanonicalJson = canonicalFieldsV3(candidate.fields, "identity lookup fields");
    if (candidateCanonicalJson !== candidate.canonicalJson) {
      throw new Error("Malformed identity lookup: typed fields do not match canonicalJson.");
    }
    if (candidate.canonicalJson !== entry.canonicalJson) {
      throw new Error(`SHA-256 collision for identity hash ${lookupHash}: canonical identities differ.`);
    }
  }
  return entry;
}

export function resolveIdentityTokenV3(
  entries: readonly ExecutionIdentityEntryV3[],
  identity: string | IdentityLookupCandidateV3,
): string {
  return resolveIdentityEntryV3(entries, identity).token;
}

export async function resolveExecutionIdentityForRowV3(
  row: unknown,
  dictionary: ExecutionIdentityDictionaryV3,
  unitColumns: readonly string[],
  horizonColumns: readonly string[],
  groupColumn: string | null,
): Promise<{ unit: string; horizon: string; group: string | null }> {
  const unit = await makeCompositeIdentityV3(row, unitColumns, "row unit");
  const horizon = await makeCompositeIdentityV3(row, horizonColumns, "row horizon");
  const group = groupColumn === null
    ? null
    : await makeCompositeIdentityV3(row, [groupColumn], "row group");
  return {
    unit: resolveIdentityTokenV3(dictionary.units, unit),
    horizon: resolveIdentityTokenV3(dictionary.horizons, horizon),
    group: group === null ? null : resolveIdentityTokenV3(dictionary.groups, group),
  };
}
