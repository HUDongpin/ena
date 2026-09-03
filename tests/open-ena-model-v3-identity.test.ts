import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assertUniqueIdentityHashBindingsV3,
  buildCompositeIdentityV3,
  buildExecutionIdentityDictionaryV3,
  createExecutionIdentityResolverV3,
  resolveExecutionIdentityForRowV3,
  resolveExecutionIdentitiesForRowsV3,
  resolveIdentityEntryV3,
  scalarIdentityV3,
  validateExecutionIdentityDictionaryV3,
} from "../lib/open-ena/model-v3/identity";
import { canonicalJsonV3, sha256TextV3 } from "../lib/open-ena/model-v3/canonical-json";

const rows = [
  { student: "s1", turn: 1, group: 1 },
  { student: "s1", turn: 1, group: 1 },
  { student: "s2", turn: 2, group: "1" },
  { student: "s3", turn: 3, group: true },
];

test("scalar identities preserve type and normalize negative zero", () => {
  assert.deepEqual(scalarIdentityV3("  value  ", "value"), { type: "string", value: "  value  " });
  assert.deepEqual(scalarIdentityV3(-0, "value"), { type: "number", value: 0 });
  assert.deepEqual(scalarIdentityV3(1, "value"), { type: "number", value: 1 });
  assert.deepEqual(scalarIdentityV3(true, "value"), { type: "boolean", value: true });
});

test("scalar identity rejects unsupported or empty values", () => {
  for (const value of [null, undefined, "", Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY,
    {}, [], BigInt(1), Symbol("x"), () => 1]) {
    assert.throws(() => scalarIdentityV3(value, "value"), /value|scalar/i);
  }
});

test("composite identity is typed, ordered, and delimiter collision safe", async () => {
  const first = await buildCompositeIdentityV3({ left: "A::B", right: "C" }, ["left", "right"]);
  const second = await buildCompositeIdentityV3({ left: "A", right: "B::C" }, ["left", "right"]);
  const number = await buildCompositeIdentityV3({ value: 1 }, ["value"]);
  const string = await buildCompositeIdentityV3({ value: "1" }, ["value"]);
  const bool = await buildCompositeIdentityV3({ value: true }, ["value"]);
  const boolString = await buildCompositeIdentityV3({ value: "true" }, ["value"]);
  const reversed = await buildCompositeIdentityV3({ left: "A::B", right: "C" }, ["right", "left"]);

  assert.notEqual(first.canonicalJson, second.canonicalJson);
  assert.notEqual(first.sha256, second.sha256);
  assert.notEqual(number.canonicalJson, string.canonicalJson);
  assert.notEqual(number.sha256, string.sha256);
  assert.notEqual(bool.canonicalJson, boolString.canonicalJson);
  assert.notEqual(bool.sha256, boolString.sha256);
  assert.notEqual(first.canonicalJson, reversed.canonicalJson);
  assert.deepEqual(first.fields.map((field) => field.column), ["left", "right"]);
  assert.match(first.sha256, /^[0-9a-f]{64}$/);
  assert.equal(first.canonicalJson, canonicalJsonV3({ fields: first.fields }));
});

test("columns and row properties are validated without coercion", async () => {
  for (const columns of [[], [""], ["   "], ["a", "a"], ["a", ""], ["a", undefined], ["a", "b", "b"]]) {
    await assert.rejects(buildCompositeIdentityV3({ a: 1, b: 2 }, columns as string[]), /column/i);
  }
  await assert.rejects(buildCompositeIdentityV3({ a: 1 }, ["b"]), /missing|property|b/i);
  await assert.rejects(buildCompositeIdentityV3({ a: null }, ["a"]), /scalar|a/i);
});

test("dictionary deduplicates identities and is source-order independent", async () => {
  const first = await buildExecutionIdentityDictionaryV3(rows, ["student"], ["turn"], "group");
  const second = await buildExecutionIdentityDictionaryV3([...rows].reverse(), ["student"], ["turn"], "group");

  assert.equal(first.units.length, 3);
  assert.equal(first.horizons.length, 3);
  assert.equal(first.groups.length, 3);
  assert.deepEqual(first.units, second.units);
  assert.deepEqual(first.horizons, second.horizons);
  assert.deepEqual(first.groups, second.groups);
  assert.equal(new Set(first.units.map((entry) => entry.token)).size, first.units.length);
  assert.equal(new Set(first.horizons.map((entry) => entry.token)).size, first.horizons.length);
  assert.equal(new Set(first.groups.map((entry) => entry.token)).size, first.groups.length);
  assert.ok(first.units.every((entry) => /^__open_ena_unit_v3_\d{6,}$/.test(entry.token)));
  assert.ok(first.horizons.every((entry) => /^__open_ena_horizon_v3_\d{6,}$/.test(entry.token)));
  assert.ok(first.groups.every((entry) => /^__open_ena_group_v3_\d{6,}$/.test(entry.token)));
  for (const entry of [...first.units, ...first.horizons, ...first.groups]) {
    assert.equal(entry.sha256, await sha256TextV3(entry.canonicalJson));
  }
});

test("display labels are globally unique and deterministic under adversarial collisions", async () => {
  const collisionRows = [
    { id: 1, turn: 1 },
    { id: "1", turn: 1 },
    { id: "1 [id:number(1)]", turn: 1 },
    { id: "1 [id:string(1)]", turn: 1 },
    { id: "x, y", turn: 1 },
    { id: "x, y [id:string(x, y)]", turn: 1 },
    { id: "line\nfeed\tcontrol", turn: 1 },
  ];
  const first = await buildExecutionIdentityDictionaryV3(collisionRows, ["id"], ["turn"], null);
  const second = await buildExecutionIdentityDictionaryV3([...collisionRows].reverse(), ["id"], ["turn"], null);
  assert.equal(new Set(first.units.map((entry) => entry.displayLabel)).size, first.units.length);
  assert.deepEqual(first.units, second.units);
  assert.ok(first.units.every((entry) => !first.units.some((other) => other !== entry && other.token === entry.displayLabel)));
});

test("optional null group has no entries and typed group values resolve distinctly", async () => {
  const noGroup = await buildExecutionIdentityDictionaryV3(rows, ["student"], ["turn"], null);
  assert.deepEqual(noGroup.groups, []);

  const dictionary = await buildExecutionIdentityDictionaryV3([
    { student: "one", turn: 1, group: 1 },
    { student: "two", turn: 1, group: "1" },
  ], ["student"], ["turn"], "group");
  assert.equal(dictionary.groups.length, 2);
  const numeric = dictionary.groups.find((entry) => entry.fields[0].value.type === "number");
  const textual = dictionary.groups.find((entry) => entry.fields[0].value.type === "string");
  assert.ok(numeric && textual);
  assert.equal(resolveIdentityEntryV3(dictionary.groups, numeric.token).token, numeric.token);
  assert.equal(resolveIdentityEntryV3(dictionary.groups, textual.sha256).token, textual.token);
  assert.notEqual(numeric.displayLabel, textual.displayLabel);
});

test("reserved-looking source values and headers never become tokens or exact display labels", async () => {
  const reserved = "__open_ena_unit_v3_000000";
  const dictionary = await buildExecutionIdentityDictionaryV3([
    { [reserved]: reserved, horizon: reserved, group: reserved },
  ], [reserved], ["horizon"], "group");
  const tokens = [...dictionary.units, ...dictionary.horizons, ...dictionary.groups].map((entry) => entry.token);
  assert.equal(new Set(tokens).size, tokens.length);
  assert.ok(tokens.every((token) => token !== reserved));
  assert.ok([...dictionary.units, ...dictionary.horizons, ...dictionary.groups]
    .every((entry) => entry.displayLabel !== entry.token && entry.displayLabel !== reserved));
});

test("row lookup resolves exact typed identities and rejects unknown values", async () => {
  const dictionary = await buildExecutionIdentityDictionaryV3(rows, ["student"], ["turn"], "group");
  const resolver = await createExecutionIdentityResolverV3(dictionary);
  for (const row of rows) {
    const unitIdentity = await buildCompositeIdentityV3(row, ["student"]);
    const horizonIdentity = await buildCompositeIdentityV3(row, ["turn"]);
    const groupIdentity = await buildCompositeIdentityV3(row, ["group"]);
    const expectedUnit = dictionary.units.find((entry) => entry.canonicalJson === unitIdentity.canonicalJson);
    const expectedHorizon = dictionary.horizons.find((entry) => entry.canonicalJson === horizonIdentity.canonicalJson);
    const expectedGroup = dictionary.groups.find((entry) => entry.canonicalJson === groupIdentity.canonicalJson);
    assert.ok(expectedUnit && expectedHorizon && expectedGroup);
    const resolved = await resolveExecutionIdentityForRowV3(
      row, ["student"], ["turn"], "group", resolver,
    );
    assert.equal(resolved.unitToken, expectedUnit.token);
    assert.equal(resolved.horizonToken, expectedHorizon.token);
    assert.equal(resolved.groupToken, expectedGroup?.token);
  }
  const knownUnit = await buildCompositeIdentityV3(rows[0], ["student"]);
  const knownHorizon = await buildCompositeIdentityV3(rows[0], ["turn"]);
  const knownGroup = await buildCompositeIdentityV3(rows[0], ["group"]);
  assert.doesNotThrow(() => resolveIdentityEntryV3(dictionary.units, knownUnit));
  assert.doesNotThrow(() => resolveIdentityEntryV3(dictionary.horizons, knownHorizon));
  assert.doesNotThrow(() => resolveIdentityEntryV3(dictionary.groups, knownGroup));

  await assert.rejects(resolveExecutionIdentityForRowV3(
    { student: "unknown", turn: 1, group: 1 }, ["student"], ["turn"], "group", resolver,
  ), /unknown|resolve|identity/i);
  await assert.rejects(resolveExecutionIdentityForRowV3(
    { student: "s1", turn: 999, group: 1 }, ["student"], ["turn"], "group", resolver,
  ), /unknown|resolve|identity/i);
  await assert.rejects(resolveExecutionIdentityForRowV3(
    { student: "s1", turn: 1, group: "unknown" }, ["student"], ["turn"], "group", resolver,
  ), /unknown|resolve|identity/i);
  assert.throws(() => resolveIdentityEntryV3(dictionary.units, "not-a-token-or-hash"), /unknown|resolve|identity/i);
});

test("row lookup with null group returns no group token", async () => {
  const row = { student: "one", turn: 1, group: true };
  const dictionary = await buildExecutionIdentityDictionaryV3(
    [row], ["student"], ["turn"], null,
  );
  const resolver = await createExecutionIdentityResolverV3(dictionary);
  const resolved = await resolveExecutionIdentityForRowV3(
    row, ["student"], ["turn"], null, resolver,
  );
  const unitIdentity = await buildCompositeIdentityV3(row, ["student"]);
  const horizonIdentity = await buildCompositeIdentityV3(row, ["turn"]);
  const expectedUnit = dictionary.units.find((entry) => entry.canonicalJson === unitIdentity.canonicalJson);
  const expectedHorizon = dictionary.horizons.find((entry) => entry.canonicalJson === horizonIdentity.canonicalJson);
  assert.ok(expectedUnit && expectedHorizon);
  assert.equal(resolved.unitToken, expectedUnit.token);
  assert.equal(resolved.horizonToken, expectedHorizon.token);
  assert.equal(resolved.groupToken, null);
  assert.deepEqual(dictionary.groups, []);
});

test("one-time resolver indexes dictionaries and batch resolution binds every source row", async () => {
  const highCardinalityRows = Array.from({ length: 240 }, (_, index) => ({
    student: `student-${index}`,
    turn: index,
    group: index % 3 === 0 ? index : index % 3 === 1 ? String(index) : Boolean(index % 2),
  }));
  const dictionary = await buildExecutionIdentityDictionaryV3(highCardinalityRows, ["student"], ["turn"], "group");
  await validateExecutionIdentityDictionaryV3(dictionary);
  const resolver = await createExecutionIdentityResolverV3(dictionary);
  const resolved = await resolveExecutionIdentitiesForRowsV3(
    highCardinalityRows, ["student"], ["turn"], "group", resolver,
  );
  assert.equal(resolved.length, highCardinalityRows.length);
  assert.deepEqual(resolved.map((binding) => binding.sourceRowIndex), highCardinalityRows.map((_, index) => index));
  assert.ok(resolved.every((binding) => binding.unitToken && binding.horizonToken && binding.groupToken));

  const source = readFileSync(new URL("../lib/open-ena/model-v3/identity.ts", import.meta.url), "utf8");
  const resolverSource = resolveExecutionIdentityForRowV3.toString();
  assert.equal(resolverSource.includes("sha256TextV3"), false);
  assert.equal(resolverSource.includes(".filter("), false);
  assert.equal(resolverSource.includes(".find("), false);
  assert.equal(source.includes("resolveExecutionIdentityForRowV3.toString"), false);
});

test("tampered dictionaries are rejected before resolver creation", async () => {
  const dictionary = await buildExecutionIdentityDictionaryV3(rows, ["student"], ["turn"], "group");
  const tamperCases = [
    (copy: typeof dictionary) => { copy.units[0].sha256 = "0".repeat(64); },
    (copy: typeof dictionary) => { copy.units[0].token = copy.horizons[0].token; },
    (copy: typeof dictionary) => { copy.units[0].canonicalJson = "{}"; },
    (copy: typeof dictionary) => { copy.units[0].fields[0].value = { type: "number", value: 999 }; },
    (copy: typeof dictionary) => { copy.units.push({ ...copy.units[0] }); },
    (copy: typeof dictionary) => { copy.units.push({ ...copy.units[0], token: `${copy.units[0].token}-other` }); },
    (copy: typeof dictionary) => { copy.units[1].displayLabel = copy.units[0].displayLabel; },
  ];
  for (const tamper of tamperCases) {
    const copy = structuredClone(dictionary);
    tamper(copy);
    await assert.rejects(createExecutionIdentityResolverV3(copy), /tamper|duplicate|canonical|hash|token|label|collision|invalid/i);
  }
});

test("pure digest binding assertion fails closed on forged collisions and allows exact duplicates", () => {
  const hash = "a".repeat(64);
  assert.throws(() => assertUniqueIdentityHashBindingsV3([
    { sha256: hash, canonicalJson: '{"fields":[]}' },
    { sha256: hash, canonicalJson: '{"fields":[1]}' },
  ]), /collision/i);
  assert.doesNotThrow(() => assertUniqueIdentityHashBindingsV3([
    { sha256: hash, canonicalJson: '{"fields":[]}' },
    { sha256: hash, canonicalJson: '{"fields":[]}' },
  ]));
});

test("lookup rejects a same-hash candidate with a different canonical typed identity", async () => {
  const dictionary = await buildExecutionIdentityDictionaryV3(
    [{ student: "one", turn: 1 }], ["student"], ["turn"], null,
  );
  const entry = dictionary.units[0];
  assert.throws(() => resolveIdentityEntryV3(dictionary.units, {
    sha256: entry.sha256,
    canonicalJson: canonicalJsonV3({ fields: [{ column: "student", value: { type: "number", value: 1 } }] }),
    fields: [{ column: "student", value: { type: "number", value: 1 } }],
  }), /collision|canonical|malformed/i);
});

test("dictionary is detached and does not mutate source rows or columns", async () => {
  const sourceRows = [{ student: "one", turn: 1, group: "g" }];
  const unitColumns = ["student"];
  const horizonColumns = ["turn"];
  const dictionary = await buildExecutionIdentityDictionaryV3(sourceRows, unitColumns, horizonColumns, "group");
  const before = JSON.stringify(dictionary);
  sourceRows[0].student = "changed";
  unitColumns[0] = "changed";
  horizonColumns.push("student");
  assert.equal(JSON.stringify(dictionary), before);
  assert.equal(Object.prototype.hasOwnProperty.call(dictionary, "rows"), false);
});

test("deep-frozen inputs and returned nested mutation remain detached", async () => {
  const sourceRows = Object.freeze([Object.freeze({ student: "one", turn: 1, group: false })]);
  const unitColumns = Object.freeze(["student"]);
  const horizonColumns = Object.freeze(["turn"]);
  const sourceSnapshot = JSON.stringify({ sourceRows, unitColumns, horizonColumns });
  const dictionary = await buildExecutionIdentityDictionaryV3(sourceRows, unitColumns, horizonColumns, "group");
  assert.throws(() => { dictionary.units[0].fields[0].value = { type: "string", value: "mutated" }; }, TypeError);
  assert.throws(() => { dictionary.units[0].fields.push({ column: "fake", value: { type: "boolean", value: true } }); }, TypeError);
  assert.throws(() => { dictionary.units[0].displayLabel = "mutated"; }, TypeError);
  assert.throws(() => { dictionary.units.push(dictionary.units[0]); }, TypeError);
  assert.equal(JSON.stringify({ sourceRows, unitColumns, horizonColumns }), sourceSnapshot);
});

test("proxy, accessor, and class boundary inputs are rejected without ordinary property reads", async () => {
  let ordinaryGetCount = 0;
  const proxiedColumns = new Proxy(["student"], {
    get() {
      ordinaryGetCount += 1;
      throw new Error("ordinary column get must not execute");
    },
  });
  const identity = await buildCompositeIdentityV3({ student: "one" }, proxiedColumns);
  assert.equal(identity.fields[0].value.value, "one");
  assert.equal(ordinaryGetCount, 0);

  let rowGetCount = 0;
  const proxiedRow = new Proxy({ student: "one" }, {
    get() {
      rowGetCount += 1;
      throw new Error("ordinary row get must not execute");
    },
  });
  const proxiedRowIdentity = await buildCompositeIdentityV3(proxiedRow, ["student"]);
  assert.equal(proxiedRowIdentity.fields[0].value.value, "one");
  assert.equal(rowGetCount, 0);

  const accessorRow = {} as Record<string, unknown>;
  Object.defineProperty(accessorRow, "student", { enumerable: true, get: () => { throw new Error("row getter"); } });
  await assert.rejects(buildCompositeIdentityV3(accessorRow, ["student"]), /accessor|data property/i);
  class RowClass { student = "one"; }
  await assert.rejects(buildCompositeIdentityV3(new RowClass(), ["student"]), /plain|object/i);
});
