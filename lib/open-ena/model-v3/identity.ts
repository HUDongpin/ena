import {
  canonicalJsonV3,
  deepFreezeV3,
  sha256TextV3,
  snapshotDenseJsonArrayV3,
  snapshotPlainJsonRecordV3,
} from "./canonical-json";
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

export interface ExecutionIdentityResolverV3 {
  resolveUnit(canonicalJson: string): string;
  resolveHorizon(canonicalJson: string): string;
  resolveGroup(canonicalJson: string): string;
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
  const material = buildCompositeIdentityMaterialV3(row, columns, label);
  const canonicalJson = material.canonicalJson;
  const sha256 = normalizeHashV3(await sha256TextV3(canonicalJson), `${label} hash`);
  return { fields: material.fields, canonicalJson, sha256 };
}

function buildCompositeIdentityMaterialV3(
  row: unknown,
  columns: readonly string[],
  label: string,
): { fields: IdentityFieldV3[]; canonicalJson: string } {
  const columnSnapshot = snapshotDenseJsonArrayV3(columns, `${label} columns`);
  const normalizedColumns = assertColumnsV3(columnSnapshot as string[], `${label} columns`);
  const record = snapshotPlainJsonRecordV3(row, label);
  return buildCompositeIdentityMaterialFromSnapshotsV3(record, normalizedColumns, label);
}

function buildCompositeIdentityMaterialFromSnapshotsV3(
  record: Record<string, unknown>,
  normalizedColumns: readonly string[],
  label: string,
): { fields: IdentityFieldV3[]; canonicalJson: string } {
  const fields = normalizedColumns.map((column) => ({
    column,
    value: scalarIdentityV3(readRowPropertyV3(record, column, label), `${label}.${column}`),
  }));
  return { fields, canonicalJson: canonicalFieldsV3(fields) };
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
  allocatedLabels: Set<string>,
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
  const roleLabel = namespace[0].toUpperCase() + namespace.slice(1);
  const baseLabels = unique.map((composite) => `${roleLabel} ${baseDisplayLabelV3(composite.fields)}`);
  const rawLabels = new Set(baseLabels);
  const baseLabelCounts = new Map<string, number>();
  for (const baseLabel of baseLabels) {
    baseLabelCounts.set(baseLabel, (baseLabelCounts.get(baseLabel) ?? 0) + 1);
  }
  const nextSuffixByTypedLabel = new Map<string, number>();

  let tokenIndex = 0;
  return unique.map((composite, index) => {
    const baseLabel = baseLabels[index];
    let token = `${prefix}${String(tokenIndex).padStart(6, "0")}`;
    while (reservedStrings.has(token)) {
      tokenIndex += 1;
      token = `${prefix}${String(tokenIndex).padStart(6, "0")}`;
    }
    tokenIndex += 1;
    const typedLabel = `${baseLabel} [${typedDisplayDisambiguatorV3(composite.fields)}]`;
    let displayLabel = baseLabel;
    if ((baseLabelCounts.get(baseLabel) ?? 0) > 1
      || allocatedLabels.has(displayLabel)
      || reservedStrings.has(displayLabel)
      || displayLabel === token) {
      displayLabel = typedLabel;
      let suffix = nextSuffixByTypedLabel.get(typedLabel) ?? 2;
      while (rawLabels.has(displayLabel) || allocatedLabels.has(displayLabel)
        || reservedStrings.has(displayLabel) || displayLabel === token) {
        displayLabel = `${typedLabel} #${suffix}`;
        suffix += 1;
      }
      nextSuffixByTypedLabel.set(typedLabel, suffix);
    }
    allocatedLabels.add(displayLabel);
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

async function hashUniqueMaterialsV3(
  materials: ReadonlyMap<string, { fields: IdentityFieldV3[]; canonicalJson: string }>,
): Promise<CompositeIdentityV3[]> {
  return Promise.all(Array.from(materials.values(), async (material) => ({
    fields: material.fields.map((field) => ({
      column: field.column,
      value: { type: field.value.type, value: field.value.value } as ScalarIdentityV3,
    })),
    canonicalJson: material.canonicalJson,
    sha256: normalizeHashV3(await sha256TextV3(material.canonicalJson), "identity hash"),
  })));
}

export async function buildExecutionIdentityDictionaryV3(
  rows: readonly Record<string, unknown>[],
  unitColumns: readonly string[],
  horizonColumns: readonly string[],
  groupColumn: string | null,
): Promise<ExecutionIdentityDictionaryV3> {
  const rowSnapshot = snapshotDenseJsonArrayV3(rows, "rows");
  const unitColumnSnapshot = snapshotDenseJsonArrayV3(unitColumns, "unitColumns");
  const horizonColumnSnapshot = snapshotDenseJsonArrayV3(horizonColumns, "horizonColumns");
  const rowRecords = rowSnapshot.map((row, rowIndex) => snapshotPlainJsonRecordV3(row, `row ${rowIndex}`));
  const normalizedUnitColumns = assertColumnsV3(unitColumnSnapshot as string[], "unitColumns");
  const normalizedHorizonColumns = assertColumnsV3(horizonColumnSnapshot as string[], "horizonColumns");
  if (groupColumn !== null && (typeof groupColumn !== "string" || groupColumn.trim().length === 0)) {
    throw new TypeError("groupColumn must be null or a nonblank string.");
  }
  const unitMaterials = new Map<string, { fields: IdentityFieldV3[]; canonicalJson: string }>();
  const horizonMaterials = new Map<string, { fields: IdentityFieldV3[]; canonicalJson: string }>();
  const groupMaterials = new Map<string, { fields: IdentityFieldV3[]; canonicalJson: string }>();

  for (let rowIndex = 0; rowIndex < rowRecords.length; rowIndex += 1) {
    const row = rowRecords[rowIndex];
    const unit = buildCompositeIdentityMaterialFromSnapshotsV3(row, normalizedUnitColumns, `row ${rowIndex} unit`);
    const horizon = buildCompositeIdentityMaterialFromSnapshotsV3(row, normalizedHorizonColumns, `row ${rowIndex} horizon`);
    unitMaterials.set(unit.canonicalJson, unit);
    horizonMaterials.set(horizon.canonicalJson, horizon);
    if (groupColumn !== null) {
      const group = buildCompositeIdentityMaterialFromSnapshotsV3(row, [groupColumn], `row ${rowIndex} group`);
      groupMaterials.set(group.canonicalJson, group);
    }
  }

  const reservedStrings = new Set<string>([
    ...normalizedUnitColumns,
    ...normalizedHorizonColumns,
    ...(groupColumn === null ? [] : [groupColumn]),
  ]);
  for (const record of rowRecords) {
    for (const key of Object.keys(record)) {
      reservedStrings.add(key);
      const value = record[key];
      if (typeof value === "string") reservedStrings.add(value);
    }
  }
  const allMaterials = new Map<string, { fields: IdentityFieldV3[]; canonicalJson: string }>();
  for (const material of [...unitMaterials.values(), ...horizonMaterials.values(), ...groupMaterials.values()]) {
    allMaterials.set(material.canonicalJson, material);
  }
  const allDigests = await hashUniqueMaterialsV3(allMaterials);
  const digestByCanonicalJson = new Map(allDigests.map((digest) => [digest.canonicalJson, digest]));
  const units = Array.from(unitMaterials.keys(), (canonicalJson) => digestByCanonicalJson.get(canonicalJson)!);
  const horizons = Array.from(horizonMaterials.keys(), (canonicalJson) => digestByCanonicalJson.get(canonicalJson)!);
  const groups = Array.from(groupMaterials.keys(), (canonicalJson) => digestByCanonicalJson.get(canonicalJson)!);
  assertUniqueIdentityHashBindingsV3([...units, ...horizons, ...groups]);

  const allocatedLabels = new Set<string>();
  const dictionary: ExecutionIdentityDictionaryV3 = {
    units: indexIdentityCompositesV3(units, "unit", reservedStrings, allocatedLabels),
    horizons: indexIdentityCompositesV3(horizons, "horizon", reservedStrings, allocatedLabels),
    groups: indexIdentityCompositesV3(groups, "group", reservedStrings, allocatedLabels),
  };
  return deepFreezeV3(dictionary);
}

type IdentityRoleV3 = "Unit" | "Horizon" | "Group";

function assertExactKeysV3(record: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} has an invalid shape.`);
  }
}

function validateNamespaceTokenV3(token: string, role: IdentityRoleV3): void {
  const prefix = namespacePrefixV3(role.toLowerCase() as IdentityNamespaceV3);
  if (!new RegExp(`^${prefix}\\d{6,}$`, "u").test(token)) {
    throw new TypeError(`Invalid ${role} identity token format.`);
  }
}

export function snapshotExecutionIdentityDictionaryV3(input: unknown): ExecutionIdentityDictionaryV3 {
  const root = snapshotPlainJsonRecordV3(input, "identity dictionary");
  assertExactKeysV3(root, ["units", "horizons", "groups"], "identity dictionary");
  const snapshotRole = (role: IdentityRoleV3): ExecutionIdentityEntryV3[] => {
    const key = `${role.toLowerCase()}s`;
    const rawEntries = snapshotDenseJsonArrayV3(root[key], `${role} identities`);
    return rawEntries.map((rawEntry, entryIndex) => {
      const entry = snapshotPlainJsonRecordV3(rawEntry, `${role} identity entry ${entryIndex}`);
      assertExactKeysV3(entry, ["token", "displayLabel", "fields", "canonicalJson", "sha256"], `${role} identity entry`);
      const rawFields = snapshotDenseJsonArrayV3(entry.fields, `${role} identity fields`);
      const fields = rawFields.map((rawField, fieldIndex) => {
        const field = snapshotPlainJsonRecordV3(rawField, `${role} identity field ${fieldIndex}`);
        assertExactKeysV3(field, ["column", "value"], `${role} identity field`);
        const scalar = snapshotPlainJsonRecordV3(field.value, `${role} identity scalar`);
        assertExactKeysV3(scalar, ["type", "value"], `${role} identity scalar`);
        return { column: field.column as string, value: { type: scalar.type, value: scalar.value } as ScalarIdentityV3 };
      });
      return {
        token: entry.token as string,
        displayLabel: entry.displayLabel as string,
        fields,
        canonicalJson: entry.canonicalJson as string,
        sha256: entry.sha256 as string,
      };
    });
  };
  return { units: snapshotRole("Unit"), horizons: snapshotRole("Horizon"), groups: snapshotRole("Group") };
}

async function validateExecutionIdentityDictionarySnapshotV3(
  dictionarySnapshot: ExecutionIdentityDictionaryV3,
): Promise<ExecutionIdentityDictionaryV3> {
  const allBindings: Array<Pick<CompositeIdentityV3, "sha256" | "canonicalJson">> = [];
  const allTokens = new Set<string>();
  const allLabels = new Set<string>();
  const digestByCanonicalJson = new Map<string, string>();
  for (const role of ["Unit", "Horizon", "Group"] as const) {
    const key = `${role.toLowerCase()}s` as "units" | "horizons" | "groups";
    const rawEntries = dictionarySnapshot[key];
    const canonicalIdentities = new Set<string>();
    for (const entry of rawEntries) {
      if (typeof entry.token !== "string" || typeof entry.displayLabel !== "string"
        || typeof entry.canonicalJson !== "string" || typeof entry.sha256 !== "string") {
        throw new TypeError(`Malformed ${role} identity entry.`);
      }
      if (entry.displayLabel.trim().length === 0) {
        throw new TypeError(`${role} identity display label must be nonblank.`);
      }
      validateNamespaceTokenV3(entry.token, role);
      if (entry.sha256 !== entry.sha256.toLowerCase()) throw new TypeError(`Malformed ${role} identity digest.`);
      normalizeHashV3(entry.sha256, `${role} identity digest`);
      if (canonicalFieldsV3(entry.fields, `${role} identity fields`) !== entry.canonicalJson) {
        throw new TypeError(`Malformed ${role} identity canonical representation.`);
      }
      if (allTokens.has(entry.token)) throw new Error("Identity dictionary contains duplicate tokens.");
      allTokens.add(entry.token);
      if (allLabels.has(entry.displayLabel)) throw new Error("Duplicate identity display labels.");
      allLabels.add(entry.displayLabel);
      if (canonicalIdentities.has(entry.canonicalJson)) throw new Error(`Duplicate ${role} identity canonical values.`);
      canonicalIdentities.add(entry.canonicalJson);
      allBindings.push(entry);
      let expectedDigest = digestByCanonicalJson.get(entry.canonicalJson);
      if (expectedDigest === undefined) {
        expectedDigest = await sha256TextV3(entry.canonicalJson);
        digestByCanonicalJson.set(entry.canonicalJson, expectedDigest);
      }
      if (entry.sha256 !== expectedDigest) {
        throw new Error(`Invalid ${role} identity digest.`);
      }
    }
  }
  for (const displayLabel of allLabels) {
    if (allTokens.has(displayLabel)) {
      throw new Error("Identity display labels must not equal internal identity tokens.");
    }
  }
  assertUniqueIdentityHashBindingsV3(allBindings);
  return deepFreezeV3(dictionarySnapshot);
}

export async function validateExecutionIdentityDictionaryV3(
  dictionary: unknown,
): Promise<ExecutionIdentityDictionaryV3> {
  const snapshot = snapshotExecutionIdentityDictionaryV3(dictionary);
  return validateExecutionIdentityDictionarySnapshotV3(snapshot);
}

function resolverMapV3(
  entries: readonly ExecutionIdentityEntryV3[],
): Map<string, ExecutionIdentityEntryV3> {
  const byCanonicalJson = new Map<string, ExecutionIdentityEntryV3>();
  for (const entry of entries) {
    byCanonicalJson.set(entry.canonicalJson, entry);
  }
  return byCanonicalJson;
}

export async function createExecutionIdentityResolverV3(
  dictionary: unknown,
): Promise<ExecutionIdentityResolverV3> {
  const snapshot = snapshotExecutionIdentityDictionaryV3(dictionary);
  const validated = await validateExecutionIdentityDictionarySnapshotV3(snapshot);
  const units = resolverMapV3(validated.units);
  const horizons = resolverMapV3(validated.horizons);
  const groups = resolverMapV3(validated.groups);
  const resolve = (map: ReadonlyMap<string, ExecutionIdentityEntryV3>, role: IdentityRoleV3) => (canonicalJson: string): string => {
    const entry = map.get(canonicalJson);
    if (entry === undefined) throw new Error(`Unknown ${role} identity.`);
    return entry.token;
  };
  return Object.freeze({
    resolveUnit: resolve(units, "Unit"),
    resolveHorizon: resolve(horizons, "Horizon"),
    resolveGroup: resolve(groups, "Group"),
  });
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
  let match: ExecutionIdentityEntryV3 | undefined;
  let matchCount = 0;
  for (const entry of entries) {
    if (candidate === null ? entry.token === identity || entry.sha256 === lookupHash : entry.sha256 === lookupHash) {
      match = entry;
      matchCount += 1;
    }
  }
  if (matchCount !== 1 || match === undefined) {
    throw new Error("Unknown identity token/hash.");
  }
  const entry = match;
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

function resolveMaterialV3(
  material: { canonicalJson: string },
  resolve: (canonicalJson: string) => string,
  role: IdentityRoleV3,
): string {
  try {
    return resolve(material.canonicalJson);
  } catch (error) {
    if (error instanceof Error && error.message === `Unknown ${role} identity.`) throw error;
    throw new Error(`Unknown ${role} identity.`);
  }
}

export async function resolveExecutionIdentityForRowV3(
  row: unknown,
  unitColumns: readonly string[],
  horizonColumns: readonly string[],
  groupColumn: string | null,
  resolver: ExecutionIdentityResolverV3,
): Promise<{ unitToken: string; horizonToken: string; groupToken: string | null }> {
  const record = snapshotPlainJsonRecordV3(row, "row");
  const unitColumnSnapshot = snapshotDenseJsonArrayV3(unitColumns, "unitColumns");
  const horizonColumnSnapshot = snapshotDenseJsonArrayV3(horizonColumns, "horizonColumns");
  const normalizedUnitColumns = assertColumnsV3(unitColumnSnapshot as string[], "unitColumns");
  const normalizedHorizonColumns = assertColumnsV3(horizonColumnSnapshot as string[], "horizonColumns");
  const capturedGroupColumn = groupColumn;
  if (capturedGroupColumn !== null
    && (typeof capturedGroupColumn !== "string" || capturedGroupColumn.trim().length === 0)) {
    throw new TypeError("groupColumn must be null or a nonblank string.");
  }
  return resolveExecutionIdentityFromSnapshotsV3(
    record, normalizedUnitColumns, normalizedHorizonColumns, capturedGroupColumn, resolver,
  );
}

function resolveExecutionIdentityFromSnapshotsV3(
  record: Record<string, unknown>,
  normalizedUnitColumns: readonly string[],
  normalizedHorizonColumns: readonly string[],
  groupColumn: string | null,
  resolver: ExecutionIdentityResolverV3,
): { unitToken: string; horizonToken: string; groupToken: string | null } {
  const unit = buildCompositeIdentityMaterialFromSnapshotsV3(record, normalizedUnitColumns, "row unit");
  const horizon = buildCompositeIdentityMaterialFromSnapshotsV3(record, normalizedHorizonColumns, "row horizon");
  const group = groupColumn === null
    ? null
    : buildCompositeIdentityMaterialFromSnapshotsV3(record, [groupColumn], "row group");
  return {
    unitToken: resolveMaterialV3(unit, resolver.resolveUnit, "Unit"),
    horizonToken: resolveMaterialV3(horizon, resolver.resolveHorizon, "Horizon"),
    groupToken: group === null ? null : resolveMaterialV3(group, resolver.resolveGroup, "Group"),
  };
}

export async function resolveExecutionIdentitiesForRowsV3(
  rows: readonly Record<string, unknown>[],
  unitColumns: readonly string[],
  horizonColumns: readonly string[],
  groupColumn: string | null,
  resolver: ExecutionIdentityResolverV3,
): Promise<Array<{ sourceRowIndex: number; unitToken: string; horizonToken: string; groupToken: string | null }>> {
  const rowSnapshot = snapshotDenseJsonArrayV3(rows, "rows");
  const unitColumnSnapshot = snapshotDenseJsonArrayV3(unitColumns, "unitColumns");
  const horizonColumnSnapshot = snapshotDenseJsonArrayV3(horizonColumns, "horizonColumns");
  const normalizedUnitColumns = assertColumnsV3(unitColumnSnapshot as string[], "unitColumns");
  const normalizedHorizonColumns = assertColumnsV3(horizonColumnSnapshot as string[], "horizonColumns");
  if (groupColumn !== null && (typeof groupColumn !== "string" || groupColumn.trim().length === 0)) {
    throw new TypeError("groupColumn must be null or a nonblank string.");
  }
  const rowRecords = rowSnapshot.map((row, rowIndex) => snapshotPlainJsonRecordV3(row, `row ${rowIndex}`));
  return rowRecords.map((row, sourceRowIndex) => ({
    sourceRowIndex,
    ...resolveExecutionIdentityFromSnapshotsV3(
      row, normalizedUnitColumns, normalizedHorizonColumns, groupColumn, resolver,
    ),
  }));
}
