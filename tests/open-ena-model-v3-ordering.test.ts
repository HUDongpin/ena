import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveHorizonOrderV3,
  resolveRowOrderV3,
} from "../lib/open-ena/model-v3/ordering";
import type {
  CanonicalHorizonOrderV3,
  CanonicalRowOrderV3,
  OrderKeyV3,
} from "../lib/open-ena/model-v3/types";

const HASH = "a".repeat(64);

function columnsPolicy(...keys: OrderKeyV3[]): CanonicalRowOrderV3 {
  assert.ok(keys.length > 0);
  return { kind: "columns", keys: keys as [OrderKeyV3, ...OrderKeyV3[]] };
}

function confirmedPolicy(rowCount: number, relevantColumns: string[]): CanonicalRowOrderV3 {
  return {
    kind: "source-order-confirmed",
    confirmation: {
      kind: "explicit-researcher-confirmation",
      datasetSha256: HASH,
      rowCount,
      relevantColumns,
      confirmedAt: "2026-09-03T00:00:00.000Z",
      confirmationVersion: 1,
    },
  };
}

const ascendingNumber = (column: string): OrderKeyV3 => ({
  column,
  direction: "ascending",
  comparator: { type: "number" },
});

test("row ordering sorts only inside each Horizon and retains source indices", () => {
  const rows = [
    { unit: "u1", horizon: "h1", turn: 2 },
    { unit: "u2", horizon: "h2", turn: 1 },
    { unit: "u1", horizon: "h1", turn: 1 },
    { unit: "u2", horizon: "h2", turn: 2 },
  ];
  const policy = columnsPolicy(ascendingNumber("turn"));
  const resolved = resolveRowOrderV3(rows, ["horizon"], policy);

  assert.equal(resolved.type, "within-horizon-order");
  assert.deepEqual(resolved.requestedPolicy, policy);
  assert.notEqual(resolved.requestedPolicy, policy);
  assert.deepEqual(resolved.orderedSourceRowIndices, [2, 0, 1, 3]);
  assert.deepEqual(
    resolved.mappings.map((entry) => [entry.sourceRowIndex, entry.orderTuple, entry.withinHorizonOrdinal]),
    [[2, [1], 0], [0, [2], 1], [1, [1], 0], [3, [2], 1]],
  );
});

test("row ordering rejects a complete tuple tie instead of using source index", () => {
  assert.throws(() => resolveRowOrderV3(
    [{ horizon: "h1", turn: 1 }, { horizon: "h1", turn: 1 }],
    ["horizon"],
    columnsPolicy(ascendingNumber("turn")),
  ), /unresolved tie/i);
});

test("multi-key row order compares progressively with independent directions", () => {
  const rows = [
    { horizon: "h", primary: 1, secondary: "a" },
    { horizon: "h", primary: 1, secondary: "b" },
    { horizon: "h", primary: 2, secondary: "c" },
  ];
  const resolved = resolveRowOrderV3(rows, ["horizon"], columnsPolicy(
    ascendingNumber("primary"),
    {
      column: "secondary",
      direction: "descending",
      comparator: { type: "text", locale: "en", sensitivity: "variant", numeric: false },
    },
  ));
  assert.deepEqual(resolved.orderedSourceRowIndices, [1, 0, 2]);
});

test("number ordering accepts only finite numbers without coercion or missing values", () => {
  for (const value of [null, undefined, "", "1", Number.NaN, Number.POSITIVE_INFINITY, {}, [], true]) {
    assert.throws(() => resolveRowOrderV3(
      [{ horizon: "h", value }],
      ["horizon"],
      columnsPolicy(ascendingNumber("value")),
    ), /number|finite|missing|order/i);
  }
});

test("date ordering validates real YYYY-MM-DD calendar dates", () => {
  const resolved = resolveRowOrderV3([
    { horizon: "h", date: "2024-03-01" },
    { horizon: "h", date: "2024-02-29" },
  ], ["horizon"], columnsPolicy({
    column: "date",
    direction: "ascending",
    comparator: { type: "date", format: "YYYY-MM-DD" },
  }));
  assert.deepEqual(resolved.orderedSourceRowIndices, [1, 0]);

  for (const date of ["2023-02-29", "2024-02-30", "2024-13-01", "2024-00-10", "2024-1-01"] ) {
    assert.throws(() => resolveRowOrderV3(
      [{ horizon: "h", date }],
      ["horizon"],
      columnsPolicy({
        column: "date",
        direction: "ascending",
        comparator: { type: "date", format: "YYYY-MM-DD" },
      }),
    ), /date|calendar|YYYY-MM-DD/i);
  }
});

test("datetime ordering requires a valid explicit offset and compares absolute instants", () => {
  const policy = columnsPolicy({
    column: "at",
    direction: "ascending",
    comparator: { type: "datetime", format: "ISO-8601", timeZone: "offset-in-value" },
  });
  const resolved = resolveRowOrderV3([
    { horizon: "h", at: "2024-01-01T00:00:00Z" },
    { horizon: "h", at: "2024-01-01T00:30:00+01:00" },
  ], ["horizon"], policy);
  assert.deepEqual(resolved.orderedSourceRowIndices, [1, 0]);

  assert.throws(() => resolveRowOrderV3([
    { horizon: "h", at: "2024-01-01T00:00:00Z" },
    { horizon: "h", at: "2023-12-31T19:00:00-05:00" },
  ], ["horizon"], policy), /unresolved tie/i);

  for (const at of [
    "2024-01-01T00:00:00",
    "2024-02-30T00:00:00Z",
    "2024-01-01T24:00:00Z",
    "2024-01-01T00:60:00Z",
    "2024-01-01T00:00:60Z",
    "2024-01-01T00:00:00+14:01",
    "2024-01-01 00:00:00Z",
  ]) {
    assert.throws(() => resolveRowOrderV3(
      [{ horizon: "h", at }], ["horizon"], policy,
    ), /datetime|ISO-8601|offset|calendar|time/i);
  }
});

test("ordered categories match typed identities, normalize negative zero, and reject unknown levels", () => {
  const policy = columnsPolicy({
    column: "stage",
    direction: "ascending",
    comparator: {
      type: "ordered-category",
      levels: [
        { type: "string", value: "1" },
        { type: "number", value: 1 },
        { type: "boolean", value: true },
      ],
    },
  });
  const resolved = resolveRowOrderV3([
    { horizon: "h", stage: 1 },
    { horizon: "h", stage: "1" },
    { horizon: "h", stage: true },
  ], ["horizon"], policy);
  assert.deepEqual(resolved.orderedSourceRowIndices, [1, 0, 2]);
  assert.throws(() => resolveRowOrderV3(
    [{ horizon: "h", stage: false }], ["horizon"], policy,
  ), /unknown category/i);

  const zero = resolveRowOrderV3(
    [{ horizon: "h", stage: -0 }],
    ["horizon"],
    columnsPolicy({
      column: "stage",
      direction: "ascending",
      comparator: { type: "ordered-category", levels: [{ type: "number", value: 0 }] },
    }),
  );
  assert.deepEqual(zero.mappings[0].orderTuple, [0]);
  assert.throws(() => resolveRowOrderV3(
    [{ horizon: "h", stage: 0 }],
    ["horizon"],
    columnsPolicy({
      column: "stage",
      direction: "ascending",
      comparator: {
        type: "ordered-category",
        levels: [{ type: "number", value: -0 }, { type: "number", value: 0 }],
      },
    }),
  ), /distinct|duplicate|level/i);
});

test("text ordering honors locale sensitivity and numeric collation", () => {
  const numeric = resolveRowOrderV3([
    { horizon: "h", label: "item10" },
    { horizon: "h", label: "item2" },
  ], ["horizon"], columnsPolicy({
    column: "label",
    direction: "ascending",
    comparator: { type: "text", locale: "en", sensitivity: "variant", numeric: true },
  }));
  assert.deepEqual(numeric.orderedSourceRowIndices, [1, 0]);

  const collator = new Intl.Collator("en", { sensitivity: "case", numeric: false, usage: "sort" });
  const values = ["A", "a"];
  assert.notEqual(collator.compare(values[0], values[1]), 0);
  const expected = collator.compare(values[0], values[1]) < 0 ? [0, 1] : [1, 0];
  const caseSensitive = resolveRowOrderV3(
    values.map((label) => ({ horizon: "h", label })),
    ["horizon"],
    columnsPolicy({
      column: "label",
      direction: "ascending",
      comparator: { type: "text", locale: "en", sensitivity: "case", numeric: false },
    }),
  );
  assert.deepEqual(caseSensitive.orderedSourceRowIndices, expected);

  assert.throws(() => resolveRowOrderV3([
    { horizon: "h", label: "e" },
    { horizon: "h", label: "é" },
  ], ["horizon"], columnsPolicy({
    column: "label",
    direction: "ascending",
    comparator: { type: "text", locale: "en", sensitivity: "base", numeric: false },
  })), /unresolved tie/i);
});

test("ordering policies reject noncanonical locale and malformed key structures", () => {
  assert.throws(() => resolveRowOrderV3(
    [{ horizon: "h", label: "a" }],
    ["horizon"],
    columnsPolicy({
      column: "label",
      direction: "ascending",
      comparator: { type: "text", locale: "EN-us", sensitivity: "variant", numeric: false },
    }),
  ), /canonical|locale/i);

  const duplicateKeys = columnsPolicy(ascendingNumber("value"), ascendingNumber("value"));
  assert.throws(() => resolveRowOrderV3(
    [{ horizon: "h", value: 1 }], ["horizon"], duplicateKeys,
  ), /distinct|duplicate|column/i);
});

test("source-order confirmation preserves source order within each Horizon", () => {
  const rows = [
    { horizon: "h1", value: "first-h1" },
    { horizon: "h2", value: "first-h2" },
    { horizon: "h1", value: "second-h1" },
    { horizon: "h2", value: "second-h2" },
  ];
  const policy = confirmedPolicy(rows.length, ["horizon"]);
  const resolved = resolveRowOrderV3(rows, ["horizon"], policy);
  assert.deepEqual(resolved.orderedSourceRowIndices, [0, 2, 1, 3]);
  assert.deepEqual(resolved.mappings.map((entry) => entry.orderTuple), [[0], [1], [0], [1]]);
  assert.deepEqual(resolved.requestedPolicy, policy);
});

test("source-order confirmation validates row count and relevant Horizon columns", () => {
  const rows = [{ horizon: "h", other: 1 }];
  assert.throws(() => resolveRowOrderV3(
    rows, ["horizon"], confirmedPolicy(2, ["horizon"]),
  ), /rowCount|row count/i);
  assert.throws(() => resolveRowOrderV3(
    rows, ["horizon"], confirmedPolicy(1, ["other"]),
  ), /relevantColumns|horizon/i);
});

test("row results and requested policies are detached and deeply frozen", () => {
  const rows = [{ horizon: "h", turn: 1 }];
  const horizonColumns = ["horizon"];
  const policy = columnsPolicy(ascendingNumber("turn"));
  const resolved = resolveRowOrderV3(rows, horizonColumns, policy);
  rows[0].turn = 99;
  horizonColumns[0] = "changed";
  if (policy.kind === "columns") policy.keys[0].column = "changed";

  assert.equal(resolved.mappings[0].orderTuple[0], 1);
  assert.equal(resolved.mappings[0].withinHorizonOrdinal, 0);
  assert.deepEqual(resolved.requestedPolicy, columnsPolicy(ascendingNumber("turn")));
  assert.ok(Object.isFrozen(resolved));
  assert.ok(Object.isFrozen(resolved.requestedPolicy));
  assert.ok(Object.isFrozen(resolved.mappings));
  assert.ok(Object.isFrozen(resolved.mappings[0]));
  assert.ok(Object.isFrozen(resolved.mappings[0].orderTuple));
  assert.ok(Object.isFrozen(resolved.orderedSourceRowIndices));
  assert.throws(() => resolved.orderedSourceRowIndices.push(99), TypeError);
});

test("ordering boundaries avoid ordinary Proxy gets and reject accessors, classes, sparse arrays, and exotic values", () => {
  let ordinaryGets = 0;
  const noGet = () => {
    ordinaryGets += 1;
    throw new Error("ordinary get must not execute");
  };
  const row = new Proxy({ unit: "u", horizon: "h", turn: 1 }, { get: noGet });
  const rows = new Proxy([row], { get: noGet });
  const horizonColumns = new Proxy(["horizon"], { get: noGet });
  const keyComparator = new Proxy({ type: "number" as const }, { get: noGet });
  const key = new Proxy({ column: "turn", direction: "ascending" as const, comparator: keyComparator }, { get: noGet });
  const keys = new Proxy([key] as [OrderKeyV3], { get: noGet });
  const policy = new Proxy({ kind: "columns" as const, keys }, { get: noGet });
  const resolved = resolveRowOrderV3(rows, horizonColumns, policy);
  assert.deepEqual(resolved.orderedSourceRowIndices, [0]);
  assert.equal(ordinaryGets, 0);

  let getterCalls = 0;
  const accessorRow = { horizon: "h", turn: 1 } as Record<string, unknown>;
  Object.defineProperty(accessorRow, "unused", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "no";
    },
  });
  assert.throws(() => resolveRowOrderV3(
    [accessorRow], ["horizon"], columnsPolicy(ascendingNumber("turn")),
  ), /accessor|data property/i);
  assert.equal(getterCalls, 0);

  class RowClass {
    horizon = "h";
    turn = 1;
  }
  assert.throws(() => resolveRowOrderV3(
    [new RowClass() as unknown as Record<string, unknown>],
    ["horizon"],
    columnsPolicy(ascendingNumber("turn")),
  ), /plain|object/i);

  const sparseRows = new Array<Record<string, unknown>>(1);
  assert.throws(() => resolveRowOrderV3(
    sparseRows, ["horizon"], columnsPolicy(ascendingNumber("turn")),
  ), /dense|array/i);
  const sparseColumns = ["horizon"];
  sparseColumns.length = 2;
  assert.throws(() => resolveRowOrderV3(
    [{ horizon: "h", turn: 1 }], sparseColumns, columnsPolicy(ascendingNumber("turn")),
  ), /dense|column|array/i);
  assert.throws(() => resolveRowOrderV3(
    [{ horizon: "h", turn: new Date() }], ["horizon"], columnsPolicy(ascendingNumber("turn")),
  ), /number|finite|order/i);
});

test("row ordering is semantically deterministic under source reversal", () => {
  const rows = [
    { id: "a", horizon: "h2", turn: 2 },
    { id: "b", horizon: "h1", turn: 2 },
    { id: "c", horizon: "h2", turn: 1 },
    { id: "d", horizon: "h1", turn: 1 },
  ];
  const policy = columnsPolicy(ascendingNumber("turn"));
  const project = (input: typeof rows) => {
    const resolved = resolveRowOrderV3(input, ["horizon"], policy);
    return resolved.mappings.map((mapping) => ({
      id: input[mapping.sourceRowIndex].id,
      horizonKey: mapping.horizonKey,
      orderTuple: mapping.orderTuple,
      withinHorizonOrdinal: mapping.withinHorizonOrdinal,
    }));
  };
  assert.deepEqual(project(rows), project([...rows].reverse()));
});

test("two Units may share Horizons and duplicate Unit-Horizon rows are deduplicated", () => {
  const rows = [
    { unit: "u1", horizon: "Week 1", week: 1 },
    { unit: "u1", horizon: "Week 1", week: 1 },
    { unit: "u1", horizon: "Week 2", week: 2 },
    { unit: "u2", horizon: "Week 1", week: 1 },
    { unit: "u2", horizon: "Week 2", week: 2 },
  ];
  const resolved = resolveHorizonOrderV3(
    rows, ["unit"], ["horizon"], columnsPolicy(ascendingNumber("week")),
  );
  assert.equal(resolved.type, "trajectory-horizon-order");
  assert.equal(resolved.horizonTuples.length, 2);
  assert.equal(resolved.unitSequences.length, 2);
  assert.ok(resolved.unitSequences.every((sequence) => sequence.steps.length === 2));
  assert.ok(resolved.unitSequences.every((sequence) => (
    new Set(sequence.steps.map((step) => step.horizonKey)).size === 2
  )));
  assert.ok(resolved.unitSequences.every((sequence) => (
    sequence.steps.map((step) => step.trajectoryOrdinal).join(",") === "0,1"
  )));
});

test("same Unit with two distinct comparator-equivalent Horizons fails with exact diagnostic prefix", () => {
  const rows = [
    { unit: "u1", horizon: "h-a", week: 1 },
    { unit: "u1", horizon: "h-b", week: 1 },
  ];
  assert.throws(() => resolveHorizonOrderV3(
    rows, ["unit"], ["horizon"], columnsPolicy(ascendingNumber("week")),
  ), (error: unknown) => (
    error instanceof Error && error.message.startsWith("STANDARD_HORIZON_ORDER_UNRESOLVED_TIE:")
  ));
});

test("Horizon ordering rejects an unstable tuple for the same typed Horizon", () => {
  assert.throws(() => resolveHorizonOrderV3([
    { unit: "u1", horizon: "h1", week: 1 },
    { unit: "u2", horizon: "h1", week: 2 },
  ], ["unit"], ["horizon"], columnsPolicy(ascendingNumber("week"))), /horizon.*unstable|unstable.*horizon/i);
});

test("Horizon source confirmation uses first global appearance and validates confirmation coverage", () => {
  const rows = [
    { unit: "u1", horizon: "h2" },
    { unit: "u2", horizon: "h1" },
    { unit: "u1", horizon: "h1" },
    { unit: "u2", horizon: "h2" },
  ];
  const policy = confirmedPolicy(rows.length, ["horizon"]);
  const resolved = resolveHorizonOrderV3(rows, ["unit"], ["horizon"], policy);
  const tupleByHorizon = new Map(resolved.horizonTuples.map((entry) => [entry.horizonKey, entry.orderTuple]));
  for (const sequence of resolved.unitSequences) {
    assert.deepEqual(sequence.steps.map((step) => tupleByHorizon.get(step.horizonKey)), [[0], [1]]);
  }

  assert.throws(() => resolveHorizonOrderV3(
    rows, ["unit"], ["horizon"], confirmedPolicy(rows.length + 1, ["horizon"]),
  ), /rowCount|row count/i);
  assert.throws(() => resolveHorizonOrderV3(
    rows, ["unit"], ["horizon"], confirmedPolicy(rows.length, ["unit"]),
  ), /relevantColumns|horizon/i);
});

test("Horizon result uses canonical code-unit materialization order and is reversal deterministic", () => {
  const rows = [
    { unit: "u2", horizon: "h2", week: 2 },
    { unit: "u1", horizon: "h1", week: 1 },
    { unit: "u2", horizon: "h1", week: 1 },
    { unit: "u1", horizon: "h2", week: 2 },
  ];
  const policy = columnsPolicy(ascendingNumber("week")) as CanonicalHorizonOrderV3;
  const forward = resolveHorizonOrderV3(rows, ["unit"], ["horizon"], policy);
  const reversed = resolveHorizonOrderV3([...rows].reverse(), ["unit"], ["horizon"], policy);
  assert.deepEqual(forward, reversed);

  const codeUnitSorted = [...forward.implementationHorizonOrder].sort((left, right) => (
    left < right ? -1 : left > right ? 1 : 0
  ));
  assert.deepEqual(forward.implementationHorizonOrder, codeUnitSorted);
  assert.deepEqual(
    forward.horizonTuples.map((entry) => entry.horizonKey),
    forward.implementationHorizonOrder,
  );
  assert.ok(Object.isFrozen(forward));
  assert.ok(Object.isFrozen(forward.horizonTuples));
  assert.ok(Object.isFrozen(forward.unitSequences));
  assert.ok(Object.isFrozen(forward.unitSequences[0].steps));
  assert.ok(Object.isFrozen(forward.implementationHorizonOrder));
});

test("typed canonical Unit and Horizon keys prevent coercion, delimiter, and column-order collisions", () => {
  const rows = [
    { unit: 1, left: "a::b", right: "c", order: 1 },
    { unit: "1", left: "a", right: "b::c", order: 2 },
  ];
  const policy = columnsPolicy(ascendingNumber("order"));
  const resolved = resolveHorizonOrderV3(rows, ["unit"], ["left", "right"], policy);
  assert.equal(new Set(resolved.unitSequences.map((entry) => entry.unitKey)).size, 2);
  assert.equal(new Set(resolved.horizonTuples.map((entry) => entry.horizonKey)).size, 2);

  const reversedColumns = resolveHorizonOrderV3(rows, ["unit"], ["right", "left"], policy);
  assert.notDeepEqual(
    resolved.implementationHorizonOrder,
    reversedColumns.implementationHorizonOrder,
  );
});

test("Horizon boundaries reject Proxy ordinary gets, accessors, class rows, and sparse Unit columns", () => {
  let gets = 0;
  const noGet = () => {
    gets += 1;
    throw new Error("ordinary get must not execute");
  };
  const row = new Proxy({ unit: "u", horizon: "h", week: 1 }, { get: noGet });
  const rows = new Proxy([row], { get: noGet });
  const unitColumns = new Proxy(["unit"], { get: noGet });
  const horizonColumns = new Proxy(["horizon"], { get: noGet });
  const resolved = resolveHorizonOrderV3(
    rows, unitColumns, horizonColumns, columnsPolicy(ascendingNumber("week")),
  );
  assert.equal(resolved.unitSequences.length, 1);
  assert.equal(gets, 0);

  const accessor = { unit: "u", horizon: "h", week: 1 } as Record<string, unknown>;
  let getterCalls = 0;
  Object.defineProperty(accessor, "extra", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 1;
    },
  });
  assert.throws(() => resolveHorizonOrderV3(
    [accessor], ["unit"], ["horizon"], columnsPolicy(ascendingNumber("week")),
  ), /accessor|data property/i);
  assert.equal(getterCalls, 0);

  class RowClass {
    unit = "u";
    horizon = "h";
    week = 1;
  }
  assert.throws(() => resolveHorizonOrderV3(
    [new RowClass() as unknown as Record<string, unknown>],
    ["unit"],
    ["horizon"],
    columnsPolicy(ascendingNumber("week")),
  ), /plain|object/i);

  const sparseUnits = ["unit"];
  sparseUnits.length = 2;
  assert.throws(() => resolveHorizonOrderV3(
    [{ unit: "u", horizon: "h", week: 1 }],
    sparseUnits,
    ["horizon"],
    columnsPolicy(ascendingNumber("week")),
  ), /dense|column|array/i);
});
