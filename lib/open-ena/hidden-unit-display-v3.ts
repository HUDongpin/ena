import type { BoundResultV3 } from "./model-v3/types";

/** Exact composite token keys to public labels, in admitted Unit dictionary
 * order. This is a display index; it carries no new scientific authority. */
export function buildUnitDisplayLabelIndexV3(result: Pick<BoundResultV3, "executionProvenance">): ReadonlyMap<string, string> {
  const provenance = result.executionProvenance;
  const groupsByUnit = new Map(provenance.unitGroups.map((entry) => [entry.unitToken, entry.groupToken]));
  return new Map(provenance.identityDictionary.units.map((unit) => [
    JSON.stringify([groupsByUnit.get(unit.token), unit.token]), unit.displayLabel,
  ]));
}

/** The owner builds the index lazily for a nonempty hidden inventory and reuses
 * it for the same result. Preserve the former dictionary-order Set projection. */
export function hiddenUnitLabelsV3(index: ReadonlyMap<string, string> | null, hiddenUnitKeys: readonly string[]): ReadonlySet<string> {
  const labels = new Set<string>();
  if (hiddenUnitKeys.length === 0 || index === null) return labels;
  const hidden = new Set(hiddenUnitKeys);
  for (const [key, label] of index) if (hidden.has(key)) labels.add(label);
  return labels;
}
