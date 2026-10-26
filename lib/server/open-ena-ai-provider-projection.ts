import {
  OPEN_ENA_AI_PROMPT_VERSION_V2,
  OPEN_ENA_AI_RESPONSE_SCHEMA_VERSION_V2,
} from "../open-ena/ai-interpretation";
import { OPEN_ENA_AI_BASE_RESPONSE_JSON_SCHEMA_V2 } from "./open-ena-ai-prompt-governance";

const REFERENCE_LIMIT = OPEN_ENA_AI_BASE_RESPONSE_JSON_SCHEMA_V2.properties.observedPatterns.items.properties.evidenceRefs.maxItems;
const LIMITATION_LIMIT = OPEN_ENA_AI_BASE_RESPONSE_JSON_SCHEMA_V2.properties.limitations.maxItems;

/** Only exact current-contract literals under these keys may be discarded. */
export const OPEN_ENA_PROVIDER_METADATA_ECHO_KEYS = [
  "additionalProperties",
  "name",
  "promptVersion",
  "schemaVersion",
  "type",
] as const;

/** Top-level disclosure prose that the closed contract can carry as a limitation. */
export const OPEN_ENA_PROVIDER_DISCLOSURE_KEYS = [
  "disclosure",
  "limitationNote",
  "missingnessDisclosure",
  "responseFormatNote",
  "supplementalNote",
] as const;

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

function isVerifiedMetadataEcho(key: string, value: unknown): boolean {
  switch (key) {
    case "additionalProperties": return value === OPEN_ENA_AI_BASE_RESPONSE_JSON_SCHEMA_V2.additionalProperties;
    case "name": return value === "open_ena_ai_interpretation";
    case "promptVersion": return value === OPEN_ENA_AI_PROMPT_VERSION_V2;
    case "schemaVersion": return value === OPEN_ENA_AI_RESPONSE_SCHEMA_VERSION_V2;
    case "type": return value === OPEN_ENA_AI_BASE_RESPONSE_JSON_SCHEMA_V2.type;
    default: return false;
  }
}

function absorbExtra(key: string, value: unknown, label: string, notes: string[]): void {
  if (isVerifiedMetadataEcho(key, value)) return;
  if (!DISCLOSURE_KEYS.has(key) || typeof value !== "string") throw unexpected(label);
  if (value.trim() === "") return;
  notes.push(value);
}

function closedPattern(pattern: unknown, index: number): unknown {
  if (!isPlainObject(pattern)) return pattern;
  const closed: Record<string, unknown> = {};
  if (Object.hasOwn(pattern, "statement")) closed.statement = pattern.statement;
  if (Object.hasOwn(pattern, "evidenceRefs")) closed.evidenceRefs = pattern.evidenceRefs;
  for (const key of Object.keys(pattern)) {
    if (key === "statement" || key === "evidenceRefs") continue;
    // A scoped disclosure cannot become a global limitation without losing its
    // pattern/evidence association. Leave that case fail-closed.
    if (!isVerifiedMetadataEcho(key, pattern[key])) throw unexpected(`AI v2 observed pattern ${index + 1}`);
  }
  return closed;
}

function withReferences(pattern: Record<string, unknown>, evidenceRefs: readonly string[]): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  if (Object.hasOwn(pattern, "statement")) next.statement = pattern.statement;
  next.evidenceRefs = [...evidenceRefs];
  return next;
}

function collapseDuplicateReferenceOverflow(patterns: readonly unknown[], evidenceIds: ReadonlySet<string>): unknown[] {
  const normalized: unknown[] = [];
  for (const pattern of patterns) {
    if (!isPlainObject(pattern) || !Array.isArray(pattern.evidenceRefs) || pattern.evidenceRefs.length <= REFERENCE_LIMIT) {
      normalized.push(pattern);
      continue;
    }
    if (!allSupplied(pattern.evidenceRefs, evidenceIds)) return [...patterns];
    const unique = uniqueIds(pattern.evidenceRefs);
    if (unique.length <= REFERENCE_LIMIT) {
      normalized.push(withReferences(pattern, unique));
      continue;
    }
    // Splitting changes observation counts and can retarget ordinal disclosures.
    // Keep the complete association for the strict parser to reject.
    normalized.push(pattern);
  }
  return normalized;
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
 * Verified literal metadata echoes are removed. Top-level disclosure strings move
 * into limitations without truncation or type coercion; nested disclosures reject.
 * Over-long reference lists collapse duplicates only when every id was supplied
 * and the distinct set fits the reference cap, preserving pattern count and order. Anything else
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
      ? collapseDuplicateReferenceOverflow(patterns.map((pattern, index) => closedPattern(pattern, index)), evidenceIds)
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
