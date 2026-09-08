import assert from "node:assert/strict";
import test from "node:test";
import { buildUnitDisplayLabelIndexV3, hiddenUnitLabelsV3 } from "../lib/open-ena/hidden-unit-display-v3";
import { bindResultV3 } from "../lib/open-ena/model-v3/result-binding";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";
import type { BoundResultV3 } from "../lib/open-ena/model-v3/types";

async function fixture(size: number, groupless = false) {
  const value = await bindingFixtureV3(undefined, (draft, data) => {
    draft.horizonOrder = null;
    if (groupless) draft.groupColumn = null;
    data.rows = Array.from({ length: size }, (_, i) => ({ unit: i < 2 ? (i === 0 ? 1 : "1") : `u${i}`, horizon: "h1", time: 1, group: i % 2 ? "1" : 1, A: i % 3 + 1, B: i * 7 % 5 + 1, C: i * 11 % 7 + 1 }));
  });
  return bindResultV3(value.plan, runStandardPlanV3(value.plan), { processedRows: size, maximumBufferedRows: 0, numericCellsAllocated: size * 20, peakBytesObservedOrBounded: size * 1024, observationMethod: "exact-counters-and-conservative-byte-bound" }, value.compiled.diagnostics);
}
function legacy(result: BoundResultV3, keys: readonly string[]) {
  const provenance = result.executionProvenance;
  return new Set(provenance.identityDictionary.units.filter(unit => {
    const group = provenance.unitGroups.find(entry => entry.unitToken === unit.token)?.groupToken;
    return keys.includes(JSON.stringify([group, unit.token]));
  }).map(unit => unit.displayLabel));
}
function observedArray<T>(values: readonly T[], visit: () => void) {
  return new Proxy([...values], { get(target, key, receiver) { if (typeof key === "string" && /^(0|[1-9]\d*)$/.test(key)) visit(); return Reflect.get(target, key, receiver); } });
}

test("admitted 5000-Unit display lookup builds one linear exact-token index and preserves the legacy Set projection", async () => {
  const result = await fixture(5000), provenance = result.executionProvenance;
  let units = 0, memberships = 0;
  const indexed = { executionProvenance: { ...provenance,
    unitGroups: observedArray(provenance.unitGroups, () => memberships++),
    identityDictionary: { ...provenance.identityDictionary, units: observedArray(provenance.identityDictionary.units, () => units++) },
  } };
  const index = buildUnitDisplayLabelIndexV3(indexed);
  assert.equal(units, 5000); assert.equal(memberships, 5000, "membership inventory is traversed once, never once per Unit");
  const keys = provenance.unitGroups.filter((_, i) => i % 7 === 0).reverse().map(entry => JSON.stringify([entry.groupToken, entry.unitToken]));
  const before = JSON.stringify(result);
  assert.deepEqual([...hiddenUnitLabelsV3(index, keys)], [...legacy(result, keys)], "order and public labels match even when hidden preference order differs");
  assert.equal(units, 5000); assert.equal(memberships, 5000, "resolving changed hidden preferences reuses the index without reading native inventories");
  assert.equal(JSON.stringify(result), before);
});

test("empty hidden keys never traverse the supplied index", () => {
  const index = new class extends Map<string, string> { override [Symbol.iterator](): MapIterator<[string, string]> { throw new Error("Empty hidden inventory must not be traversed"); } }();
  assert.deepEqual([...hiddenUnitLabelsV3(index, [])], []);
  assert.deepEqual([...hiddenUnitLabelsV3(null, [])], []);
});

test("typed Unit and Group identities cannot cross-match or infer membership from display labels", async () => {
  const result = await fixture(20), p = result.executionProvenance;
  const numeric = p.identityDictionary.units.find(unit => unit.fields[0].value.type === "number")!;
  const textual = p.identityDictionary.units.find(unit => unit.fields[0].value.type === "string" && unit.fields[0].value.value === "1")!;
  const numericGroup = p.unitGroups.find(entry => entry.unitToken === numeric.token)!.groupToken;
  const textualGroup = p.unitGroups.find(entry => entry.unitToken === textual.token)!.groupToken;
  assert.notEqual(numericGroup, textualGroup);
  const index = buildUnitDisplayLabelIndexV3(result);
  const wrong = [JSON.stringify([textualGroup, numeric.token]), JSON.stringify([numericGroup, textual.token]), JSON.stringify([numericGroup, numeric.displayLabel]), JSON.stringify(["", numeric.token])];
  assert.deepEqual([...hiddenUnitLabelsV3(index, wrong)], []);
  const exact = [...wrong, JSON.stringify([numericGroup, numeric.token])];
  assert.deepEqual([...hiddenUnitLabelsV3(index, exact)], [numeric.displayLabel]);
  assert.deepEqual([...hiddenUnitLabelsV3(index, exact)], [...legacy(result, exact)]);
});

test("groupless native membership retains null composite-key semantics", async () => {
  const result = await fixture(20, true), unit = result.executionProvenance.identityDictionary.units[0];
  assert.ok(result.executionProvenance.unitGroups.every(entry => entry.groupToken === null));
  const index = buildUnitDisplayLabelIndexV3(result), keys = [JSON.stringify([null, unit.token])];
  assert.deepEqual([...hiddenUnitLabelsV3(index, keys)], [unit.displayLabel]);
  assert.deepEqual([...hiddenUnitLabelsV3(index, keys)], [...legacy(result, keys)]);
  assert.deepEqual([...hiddenUnitLabelsV3(index, [JSON.stringify(["", unit.token])])], []);
});
