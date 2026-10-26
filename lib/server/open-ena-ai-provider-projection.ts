import { OPEN_ENA_AI_BASE_RESPONSE_JSON_SCHEMA_V2 } from "./open-ena-ai-prompt-governance";

const PATTERN_LIMIT = OPEN_ENA_AI_BASE_RESPONSE_JSON_SCHEMA_V2.properties.observedPatterns.maxItems;
const REFERENCE_LIMIT = OPEN_ENA_AI_BASE_RESPONSE_JSON_SCHEMA_V2.properties.observedPatterns.items.properties.evidenceRefs.maxItems;
const LIMITATION_LIMIT = OPEN_ENA_AI_BASE_RESPONSE_JSON_SCHEMA_V2.properties.limitations.maxItems;

/** Schema and transport echoes. Values are discarded, never stored as prose. */
export const OPEN_ENA_PROVIDER_METADATA_ECHO_KEYS = [
  "$schema",
  "additionalProperties",
  "name",
  "promptVersion",
  "responseFormatNote",
  "schemaVersion",
  "type",
] as const;

/** Misplaced disclosure prose that the closed contract can still carry as a limitation. */
export const OPEN_ENA_PROVIDER_DISCLOSURE_KEYS = [
  "disclosure",
  "limitationNote",
  "missingnessDisclosure",
  "supplementalNote",
] as const;

const METADATA_ECHO_KEYS = new Set<string>(OPEN_ENA_PROVIDER_METADATA_ECHO_KEYS);
const DISCLOSURE_KEYS = new Set<string>(OPEN_ENA_PROVIDER_DISCLOSURE_KEYS);
const EVIDENCE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unexpected(label: string): Error {
  return new Error(`${label} contains an unexpected field.`);
}

function isSuppliedEvidenceId(value: unknown, evidenceIds: ReadonlySet<string>): value is string {
  return typeof value === "string"
    && value.length <= 100
    && EVIDENCE_ID.test(value)
    && evidenceIds.has(value);
}

function allSupplied(values: readonly unknown[], evidenceIds: ReadonlySet<string>): values is readonly string[] {
  return values.every((value) => isSuppliedEvidenceId(value, evidenceIds));
}

function uniqueIds(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }
  return unique;
}

function absorbExtra(key: string, value: unknown, label: string, notes: string[]): void {
  if (METADATA_ECHO_KEYS.has(key)) return;
  if (!DISCLOSURE_KEYS.has(key) || typeof value !== "string") throw unexpected(label);
  if (value.trim() === "") return;
  notes.push(value);
}

function closedPattern(pattern: unknown, index: number, notes: string[]): unknown {
  if (!isPlainObject(pattern)) return pattern;
  const closed: Record<string, unknown> = {};
  if (Object.hasOwn(pattern, "statement")) closed.statement = pattern.statement;
  if (Object.hasOwn(pattern, "evidenceRefs")) closed.evidenceRefs = pattern.evidenceRefs;
  for (const key of Object.keys(pattern)) {
    if (key === "statement" || key === "evidenceRefs") continue;
    absorbExtra(key, pattern[key], `AI v2 observed pattern ${index + 1}`, notes);
  }
  return closed;
}

function withReferences(pattern: Record<string, unknown>, evidenceRefs: readonly string[]): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  if (Object.hasOwn(pattern, "statement")) next.statement = pattern.statement;
  next.evidenceRefs = [...evidenceRefs];
  return next;
}

function partitionPatterns(patterns: readonly unknown[], evidenceIds: ReadonlySet<string>): unknown[] {
  const partitioned: unknown[] = [];
  for (const pattern of patterns) {
    if (!isPlainObject(pattern) || !Array.isArray(pattern.evidenceRefs) || pattern.evidenceRefs.length <= REFERENCE_LIMIT) {
      partitioned.push(pattern);
      continue;
    }
    if (!allSupplied(pattern.evidenceRefs, evidenceIds)) return [...patterns];
    const unique = uniqueIds(pattern.evidenceRefs);
    if (unique.length <= REFERENCE_LIMIT) {
      partitioned.push(withReferences(pattern, unique));
      continue;
    }
    for (let index = 0; index < unique.length; index += REFERENCE_LIMIT) {
      partitioned.push(withReferences(pattern, unique.slice(index, index + REFERENCE_LIMIT)));
    }
  }
  return partitioned.length > PATTERN_LIMIT ? [...patterns] : partitioned;
}

function mergeLimitations(existing: unknown, present: boolean, notes: readonly string[]): unknown {
  if (notes.length === 0) return existing;
  if (!present) return [...notes];
  if (!Array.isArray(existing) || existing.some((item) => typeof item !== "string")) {
    throw unexpected("AI v2 interpretation");
  }
  const merged = [...existing];
  for (const note of notes) {
    if (!merged.includes(note)) merged.push(note);
  }
  if (merged.length > LIMITATION_LIMIT) throw new Error("AI v2 limitations exceeds its allowed length.");
  return merged;
}

/**
 * Project a provider interpretation onto the closed v2 object before strict parsing.
 * Metadata echoes are removed. Disclosure strings move into limitations without
 * truncation or type coercion. Over-long reference lists are partitioned only when
 * every id was supplied and the result still fits the pattern cap. Anything else
 * is left for the strict parser to reject.
 */
export function projectOpenEnaProviderInterpretation(
  value: unknown,
  evidenceIds: ReadonlySet<string>,
): unknown {
  if (!isPlainObject(value)) return value;
  const notes: string[] = [];
  const projected: Record<string, unknown> = {};
  if (Object.hasOwn(value, "observedPatterns")) {
    const patterns = value.observedPatterns;
    projected.observedPatterns = Array.isArray(patterns)
      ? partitionPatterns(patterns.map((pattern, index) => closedPattern(pattern, index, notes)), evidenceIds)
      : patterns;
  }
  if (Object.hasOwn(value, "contextualQuestions")) projected.contextualQuestions = value.contextualQuestions;
  for (const key of Object.keys(value)) {
    if (key === "observedPatterns" || key === "contextualQuestions" || key === "limitations") continue;
    absorbExtra(key, value[key], "AI v2 interpretation", notes);
  }
  if (Object.hasOwn(value, "limitations") || notes.length > 0) {
    projected.limitations = mergeLimitations(value.limitations, Object.hasOwn(value, "limitations"), notes);
  }
  return projected;
}
