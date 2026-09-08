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
import * as identityModuleV3 from "../lib/open-ena/model-v3/identity";
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

test("display labels are unique across Unit, Horizon, and Group roles", async () => {
  const dictionary = await buildExecutionIdentityDictionaryV3(
    [{ id: "x" }, { id: 1 }, { id: "1" }, { id: "1 [id:number(1)]" }],
    ["id"], ["id"], "id",
  );
  const allLabels = [...dictionary.units, ...dictionary.horizons, ...dictionary.groups].map((entry) => entry.displayLabel);
  assert.equal(new Set(allLabels).size, allLabels.length);
});

test("every identity sharing a raw display label receives deterministic typed disambiguation", async () => {
  const reservedLabels = [
    "Unit id=1 [id:number(1)]",
    "Unit id=1 [id:string(\"1\")]",
  ];
  const collisionRows = [
    { id: 1, horizon: "h", unused: reservedLabels[0] },
    { id: "1", horizon: "h", unused: reservedLabels[1] },
  ];
  const forward = await buildExecutionIdentityDictionaryV3(collisionRows, ["id"], ["horizon"], null);
  const reversed = await buildExecutionIdentityDictionaryV3([...collisionRows].reverse(), ["id"], ["horizon"], null);
  const tokens = new Set([...forward.units, ...forward.horizons, ...forward.groups].map((entry) => entry.token));
  const labels = [...forward.units, ...forward.horizons, ...forward.groups].map((entry) => entry.displayLabel);

  assert.deepEqual(forward, reversed);
  assert.equal(new Set(labels).size, labels.length);
  assert.ok(labels.every((label) => !tokens.has(label) && !reservedLabels.includes(label)));
  assert.ok(forward.units.every((entry) => entry.displayLabel.includes(`[id:${entry.fields[0].value.type}(`)));
});

test("high-cardinality label allocation does not clone the complete raw-label set per identity", async () => {
  const highCardinalityRows = Array.from({ length: 2_048 }, (_, index) => ({
    id: index % 2 === 0 ? index : String(index),
    horizon: "shared",
  }));
  const forward = await buildExecutionIdentityDictionaryV3(highCardinalityRows, ["id"], ["horizon"], null);
  const reversed = await buildExecutionIdentityDictionaryV3(
    [...highCardinalityRows].reverse(), ["id"], ["horizon"], null,
  );
  assert.deepEqual(forward.units, reversed.units);
  assert.equal(new Set(forward.units.map((entry) => entry.displayLabel)).size, highCardinalityRows.length);

  const source = readFileSync(new URL("../lib/open-ena/model-v3/identity.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /new Set\(rawLabels\)/);
});

test("reserved strings in unselected headers and values are excluded from every namespace token", async () => {
  const reserved = [
    "__open_ena_unit_v3_000000",
    "__open_ena_horizon_v3_000000",
    "__open_ena_group_v3_000000",
  ];
  const sourceRows = [
    { id: "first", unusedHeader: reserved[0], unusedValue: reserved[1], another: reserved[2] },
    { id: "second", unusedHeader: reserved[2], unusedValue: reserved[0], another: reserved[1] },
  ];
  const first = await buildExecutionIdentityDictionaryV3(sourceRows, ["id"], ["id"], null);
  const second = await buildExecutionIdentityDictionaryV3([...sourceRows].reverse(), ["id"], ["id"], null);
  const tokens = [...first.units, ...first.horizons, ...first.groups].map((entry) => entry.token);
  assert.ok(tokens.every((token) => !reserved.includes(token)));
  assert.deepEqual(first, second);
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
  const lookupCounts = { unit: 0, horizon: 0, group: 0 };
  const countingResolver = Object.freeze({
    resolveUnit(canonicalJson: string) {
      lookupCounts.unit += 1;
      return resolver.resolveUnit(canonicalJson);
    },
    resolveHorizon(canonicalJson: string) {
      lookupCounts.horizon += 1;
      return resolver.resolveHorizon(canonicalJson);
    },
    resolveGroup(canonicalJson: string) {
      lookupCounts.group += 1;
      return resolver.resolveGroup(canonicalJson);
    },
  });
  const resolved = await resolveExecutionIdentitiesForRowsV3(
    highCardinalityRows, ["student"], ["turn"], "group", countingResolver,
  );
  assert.equal(resolved.length, highCardinalityRows.length);
  assert.deepEqual(resolved.map((binding) => binding.sourceRowIndex), highCardinalityRows.map((_, index) => index));
  assert.ok(resolved.every((binding) => binding.unitToken && binding.horizonToken && binding.groupToken));
  assert.deepEqual(lookupCounts, {
    unit: highCardinalityRows.length,
    horizon: highCardinalityRows.length,
    group: highCardinalityRows.length,
  });

  const source = readFileSync(new URL("../lib/open-ena/model-v3/identity.ts", import.meta.url), "utf8");
  const resolverSource = resolveExecutionIdentityForRowV3.toString();
  assert.equal(resolverSource.includes("sha256TextV3"), false);
  assert.equal(resolverSource.includes(".filter("), false);
  assert.equal(resolverSource.includes(".find("), false);
  assert.equal(source.includes("resolveExecutionIdentityForRowV3.toString"), false);
  assert.match(source, /new Map<string, .*canonicalJson/);
  assert.equal((source.match(/sha256TextV3\(material\.canonicalJson\)/g) ?? []).length, 1);
});

test("resolver snapshots synchronously before caller mutation and remains opaque", async () => {
  const original = await buildExecutionIdentityDictionaryV3(rows, ["student"], ["turn"], "group");
  const mutable = structuredClone(original);
  const resolverPromise = createExecutionIdentityResolverV3(mutable);
  mutable.units[0].token = "__open_ena_unit_v3_999999";
  mutable.units[0].fields[0].value.value = "replaced";
  mutable.units[0].canonicalJson = "{}";
  mutable.units = [];
  const resolver = await resolverPromise;
  const binding = await resolveExecutionIdentityForRowV3(rows[0], ["student"], ["turn"], "group", resolver);
  assert.equal(binding.unitToken, original.units.find((entry) => entry.fields[0].value.value === "s1")?.token);
  assert.deepEqual(Object.keys(resolver).sort(), ["resolveGroup", "resolveHorizon", "resolveUnit"]);
  assert.throws(() => { (resolver as unknown as { resolveUnit: unknown }).resolveUnit = () => "bad"; }, TypeError);
  assert.equal(Object.getOwnPropertyNames(resolver).some((name) => name.includes("Map") || name.includes("entries")), false);
});

test("dictionary build and resolver accept proxied boundaries without ordinary gets", async () => {
  let getCount = 0;
  const noGet = () => {
    getCount += 1;
    throw new Error("ordinary get must not execute");
  };
  const sourceRow = new Proxy({ id: "x", turn: 1, group: true }, { get: noGet });
  const rowsProxy = new Proxy([sourceRow], { get: noGet });
  const unitColumns = new Proxy(["id"], { get: noGet });
  const horizonColumns = new Proxy(["turn"], { get: noGet });
  const dictionary = await buildExecutionIdentityDictionaryV3(rowsProxy, unitColumns, horizonColumns, "group");
  assert.equal(getCount, 0);

  const proxyEntry = (entry: (typeof dictionary.units)[number]) => new Proxy({
    ...entry,
    fields: new Proxy(entry.fields.map((field) => new Proxy({
      ...field,
      value: new Proxy({ ...field.value }, { get: noGet }),
    }, { get: noGet })), { get: noGet }),
  }, { get: noGet });
  const proxiedDictionary = new Proxy({
    units: new Proxy(dictionary.units.map(proxyEntry), { get: noGet }),
    horizons: new Proxy(dictionary.horizons.map(proxyEntry), { get: noGet }),
    groups: new Proxy(dictionary.groups.map(proxyEntry), { get: noGet }),
  }, { get: noGet });
  const resolver = await createExecutionIdentityResolverV3(proxiedDictionary);
  assert.equal(getCount, 0);
  const binding = await resolveExecutionIdentityForRowV3(sourceRow, ["id"], ["turn"], "group", resolver);
  assert.equal(binding.groupToken, dictionary.groups[0].token);
});

test("batch resolution snapshots all nested rows and columns before its first await", async () => {
  const sourceRows = [
    { unit: "first", horizon: 1, group: "a" },
    { unit: "second", horizon: 2, group: "b" },
  ];
  const unitColumns = ["unit"];
  const horizonColumns = ["horizon"];
  const dictionary = await buildExecutionIdentityDictionaryV3(sourceRows, unitColumns, horizonColumns, "group");
  const resolver = await createExecutionIdentityResolverV3(dictionary);
  const pending = resolveExecutionIdentitiesForRowsV3(
    sourceRows, unitColumns, horizonColumns, "group", resolver,
  );
  sourceRows[1].unit = "mutated-unknown";
  sourceRows[1].horizon = 999;
  sourceRows[1].group = "mutated-group";
  sourceRows[1] = { unit: "replacement-unknown", horizon: 888, group: "replacement" };
  unitColumns[0] = "missing-unit-column";
  horizonColumns[0] = "missing-horizon-column";
  const bindings = await pending;
  assert.deepEqual(bindings.map(({ sourceRowIndex, unitToken, horizonToken, groupToken }) => ({
    sourceRowIndex, unitToken, horizonToken, groupToken,
  })), [
    {
      sourceRowIndex: 0,
      unitToken: dictionary.units.find((entry) => entry.fields[0].value.value === "first")?.token,
      horizonToken: dictionary.horizons.find((entry) => entry.fields[0].value.value === 1)?.token,
      groupToken: dictionary.groups.find((entry) => entry.fields[0].value.value === "a")?.token,
    },
    {
      sourceRowIndex: 1,
      unitToken: dictionary.units.find((entry) => entry.fields[0].value.value === "second")?.token,
      horizonToken: dictionary.horizons.find((entry) => entry.fields[0].value.value === 2)?.token,
      groupToken: dictionary.groups.find((entry) => entry.fields[0].value.value === "b")?.token,
    },
  ]);
});

test("single-row resolution snapshots row and columns before its first await", async () => {
  const sourceRow = { unit: "single", horizon: 1, group: true };
  const unitColumns = ["unit"];
  const horizonColumns = ["horizon"];
  const dictionary = await buildExecutionIdentityDictionaryV3([sourceRow], unitColumns, horizonColumns, "group");
  const resolver = await createExecutionIdentityResolverV3(dictionary);
  const pending = resolveExecutionIdentityForRowV3(sourceRow, unitColumns, horizonColumns, "group", resolver);
  sourceRow.unit = "mutated-unknown";
  sourceRow.horizon = 999;
  sourceRow.group = false;
  unitColumns[0] = "missing-unit-column";
  horizonColumns[0] = "missing-horizon-column";
  const binding = await pending;
  assert.equal(binding.unitToken, dictionary.units[0].token);
  assert.equal(binding.horizonToken, dictionary.horizons[0].token);
  assert.equal(binding.groupToken, dictionary.groups[0].token);
});

test("single-row resolution derives every role from one coherent descriptor snapshot", async () => {
  const versions = [
    { unit: "u1", horizon: "h1", group: "g1" },
    { unit: "u2", horizon: "h2", group: "g2" },
    { unit: "u3", horizon: "h3", group: "g3" },
  ];
  const dictionary = await buildExecutionIdentityDictionaryV3(
    versions, ["unit"], ["horizon"], "group",
  );
  const resolver = await createExecutionIdentityResolverV3(dictionary);
  let descriptorCalls = 0;
  let ordinaryGetCalls = 0;
  const proxiedRow = new Proxy({ unit: "unused", horizon: "unused", group: "unused" }, {
    get() {
      ordinaryGetCalls += 1;
      throw new Error("ordinary row get must not execute");
    },
    getOwnPropertyDescriptor(_target, key) {
      const version = versions[Math.floor(descriptorCalls / 3) % versions.length];
      descriptorCalls += 1;
      return {
        configurable: true,
        enumerable: true,
        writable: true,
        value: version[key as keyof typeof version],
      };
    },
  });

  const binding = await resolveExecutionIdentityForRowV3(
    proxiedRow, ["unit"], ["horizon"], "group", resolver,
  );
  const unit = dictionary.units.find((entry) => entry.token === binding.unitToken);
  const horizon = dictionary.horizons.find((entry) => entry.token === binding.horizonToken);
  const group = dictionary.groups.find((entry) => entry.token === binding.groupToken);
  assert.equal(descriptorCalls, 3);
  assert.equal(ordinaryGetCalls, 0);
  assert.equal(unit?.fields[0].value.value, "u1");
  assert.equal(horizon?.fields[0].value.value, "h1");
  assert.equal(group?.fields[0].value.value, "g1");
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

test("dictionary validation rejects blank labels and labels colliding with any internal token", async () => {
  const dictionary = await buildExecutionIdentityDictionaryV3(rows, ["student"], ["turn"], "group");
  const tamperCases = [
    (copy: typeof dictionary) => { copy.units[0].displayLabel = ""; },
    (copy: typeof dictionary) => { copy.units[0].displayLabel = "   "; },
    (copy: typeof dictionary) => { copy.units[0].displayLabel = copy.units[0].token; },
    (copy: typeof dictionary) => { copy.units[0].displayLabel = copy.units[1].token; },
    (copy: typeof dictionary) => { copy.units[0].displayLabel = copy.horizons[0].token; },
  ];
  for (const tamper of tamperCases) {
    const copy = structuredClone(dictionary);
    tamper(copy);
    await assert.rejects(validateExecutionIdentityDictionaryV3(copy), /display|label|token|invalid/i);
  }

  const reordered = structuredClone(dictionary);
  reordered.units.reverse();
  reordered.horizons.reverse();
  reordered.units[0].displayLabel = reordered.horizons[0].token;
  await assert.rejects(validateExecutionIdentityDictionaryV3(reordered), /display|label|token|invalid/i);
});

test("the identity module does not export its unvalidated dictionary snapshot helper", () => {
  assert.equal("snapshotExecutionIdentityDictionaryV3" in identityModuleV3, false);
  const source = readFileSync(new URL("../lib/open-ena/model-v3/identity.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /export\s+function\s+snapshotExecutionIdentityDictionaryV3/u);
});

test("dictionary validation hashes each canonical identity once across all roles", async () => {
  const dictionary = await buildExecutionIdentityDictionaryV3([{ id: "shared" }], ["id"], ["id"], "id");
  const subtle = globalThis.crypto.subtle;
  const originalDigest = subtle.digest;
  const originalOwnDigestDescriptor = Object.getOwnPropertyDescriptor(subtle, "digest");
  let digestCalls = 0;
  Object.defineProperty(subtle, "digest", {
    configurable: true,
    value: async (...args: Parameters<SubtleCrypto["digest"]>) => {
      digestCalls += 1;
      return originalDigest.apply(subtle, args);
    },
  });
  try {
    await validateExecutionIdentityDictionaryV3(dictionary);
  } finally {
    if (originalOwnDigestDescriptor === undefined) {
      Reflect.deleteProperty(subtle, "digest");
    } else {
      Object.defineProperty(subtle, "digest", originalOwnDigestDescriptor);
    }
  }
  assert.equal(digestCalls, 1);
});

test("imported negative-zero identity scalars normalize to positive zero before freezing", async () => {
  const dictionary = await buildExecutionIdentityDictionaryV3(
    [{ unit: 0, horizon: 0, group: 0 }], ["unit"], ["horizon"], "group",
  );
  const imported = structuredClone(dictionary);
  imported.units[0].fields[0].value.value = -0;
  imported.horizons[0].fields[0].value.value = -0;
  imported.groups[0].fields[0].value.value = -0;

  const validated = await validateExecutionIdentityDictionaryV3(imported);
  for (const entry of [...validated.units, ...validated.horizons, ...validated.groups]) {
    assert.equal(entry.fields[0].value.value, 0);
    assert.equal(Object.is(entry.fields[0].value.value, -0), false);
  }

  const resolver = await createExecutionIdentityResolverV3(imported);
  const binding = await resolveExecutionIdentityForRowV3(
    { unit: -0, horizon: -0, group: -0 }, ["unit"], ["horizon"], "group", resolver,
  );
  assert.equal(binding.unitToken, dictionary.units[0].token);
  assert.equal(binding.horizonToken, dictionary.horizons[0].token);
  assert.equal(binding.groupToken, dictionary.groups[0].token);
});

test("imported identity scalars preserve matching declared types and reject mismatches", async () => {
  const dictionary = await buildExecutionIdentityDictionaryV3(
    [{ unit: 1, horizon: "1", group: true }], ["unit"], ["horizon"], "group",
  );
  const validated = await validateExecutionIdentityDictionaryV3(dictionary);
  assert.deepEqual([
    validated.units[0].fields[0].value,
    validated.horizons[0].fields[0].value,
    validated.groups[0].fields[0].value,
  ], [
    { type: "number", value: 1 },
    { type: "string", value: "1" },
    { type: "boolean", value: true },
  ]);

  const mismatches = [
    (copy: typeof dictionary) => { copy.units[0].fields[0].value.type = "string"; },
    (copy: typeof dictionary) => { copy.horizons[0].fields[0].value.type = "number"; },
    (copy: typeof dictionary) => { copy.groups[0].fields[0].value.type = "string"; },
  ];
  for (const mismatch of mismatches) {
    const imported = structuredClone(dictionary);
    mismatch(imported);
    await assert.rejects(validateExecutionIdentityDictionaryV3(imported), /inconsistent|scalar|type/i);
    await assert.rejects(createExecutionIdentityResolverV3(imported), /inconsistent|scalar|type/i);
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
