import assert from "node:assert/strict";
import test from "node:test";

import {
  OrderingDomainErrorV3,
  resolveHorizonOrderV3,
  resolveRowOrderV3,
} from "../lib/open-ena/model-v3/ordering";
import type {
  OrderingResolutionContextV3,
  ResolvedHorizonOrderingV3,
  ResolvedRowOrderingV3,
  TextCollationBindingV3,
} from "../lib/open-ena/model-v3/ordering";
import type {
  CanonicalHorizonOrderV3,
  CanonicalRowOrderV3,
  DatasetBindingV3,
  OrderKeyV3,
} from "../lib/open-ena/model-v3/types";

const HASH = "a".repeat(64);
const OTHER_HASH = "b".repeat(64);
const HEADER_HASH = "c".repeat(64);

function columnsPolicy(
  ...keys: OrderKeyV3[]
): Extract<CanonicalRowOrderV3, { kind: "columns" }> {
  assert.ok(keys.length > 0);
  return { kind: "columns", keys: keys as [OrderKeyV3, ...OrderKeyV3[]] };
}

function confirmedPolicy(
  rowCount: number,
  relevantColumns: string[],
  datasetSha256 = HASH,
  analysisFamily: "standard" | "ona" = "standard",
): Extract<CanonicalRowOrderV3, { kind: "source-order-confirmed" }> {
  return {
    kind: "source-order-confirmed",
    confirmation: {
      kind: "explicit-researcher-confirmation",
      analysisFamily,
      datasetSha256,
      rowCount,
      relevantColumns,
      confirmedAt: "2026-09-03T00:00:00.000Z",
      confirmationVersion: 1,
    },
  };
}

function resolutionContext(
  rowCount: number,
  analysisFamily: "standard" | "ona" = "standard",
  normalizedTableSha256 = HASH,
  confirmationAnalysisFamily: "standard" | "ona" = analysisFamily,
): OrderingResolutionContextV3 {
  return {
    analysisFamily,
    confirmationAnalysisFamily,
    datasetBinding: {
      hashKind: "normalized-utf8-csv-text-sha256",
      normalizedTableSha256,
      rowCount,
      headerSha256: HEADER_HASH,
    },
  };
}

type IsMutableArray<T> = T extends unknown[] ? true : false;
type AssertFalse<T extends false> = T;
type RowMappingV3 = ResolvedRowOrderingV3["mappings"][number];
type HorizonTupleV3 = ResolvedHorizonOrderingV3["horizonTuples"][number];
type UnitSequenceV3 = ResolvedHorizonOrderingV3["unitSequences"][number];
const readonlyArrayTypeProof: [
  AssertFalse<IsMutableArray<ResolvedRowOrderingV3["mappings"]>>,
  AssertFalse<IsMutableArray<RowMappingV3["orderTuple"]>>,
  AssertFalse<IsMutableArray<ResolvedRowOrderingV3["orderedSourceRowIndices"]>>,
  AssertFalse<IsMutableArray<ResolvedRowOrderingV3["textCollationBindings"]>>,
  AssertFalse<IsMutableArray<ResolvedHorizonOrderingV3["horizonTuples"]>>,
  AssertFalse<IsMutableArray<HorizonTupleV3["orderTuple"]>>,
  AssertFalse<IsMutableArray<ResolvedHorizonOrderingV3["unitSequences"]>>,
  AssertFalse<IsMutableArray<UnitSequenceV3["steps"]>>,
  AssertFalse<IsMutableArray<ResolvedHorizonOrderingV3["implementationHorizonOrder"]>>,
  AssertFalse<IsMutableArray<ResolvedHorizonOrderingV3["textCollationBindings"]>>,
] = [false, false, false, false, false, false, false, false, false, false];
void readonlyArrayTypeProof;
const validCaseFirstType: TextCollationBindingV3["caseFirst"] = "false";
// @ts-expect-error Arbitrary strings are not valid resolved ECMA-402 caseFirst values.
const invalidCaseFirstType: TextCollationBindingV3["caseFirst"] = "arbitrary";
void validCaseFirstType;
void invalidCaseFirstType;

function assertReadonlyCompileContract(
  row: ResolvedRowOrderingV3,
  horizon: ResolvedHorizonOrderingV3,
): void {
  // @ts-expect-error The resolved result discriminator is readonly.
  row.type = "within-horizon-order";
  // @ts-expect-error Resolved mappings are readonly at the public type boundary.
  row.mappings.push(row.mappings[0]);
  // @ts-expect-error Nested mapping scalars are readonly at the public type boundary.
  row.mappings[0].sourceRowIndex = 9;
  // @ts-expect-error Resolved tuple values are readonly at the public type boundary.
  row.mappings[0].orderTuple[0] = 99;
  if (row.requestedPolicy.kind === "source-order-confirmed") {
    // @ts-expect-error Source confirmation fields are recursively readonly.
    row.requestedPolicy.confirmation.rowCount = 9;
  }
  if (row.sourceOrderBinding !== null) {
    // @ts-expect-error Resolved dataset binding fields are readonly.
    row.sourceOrderBinding.datasetBinding.headerSha256 = "changed";
  }
  // @ts-expect-error The recursively readonly requested policy cannot be reassigned.
  row.requestedPolicy.kind = "columns";
  // @ts-expect-error Collation provenance fields are readonly.
  row.textCollationBindings[0].resolvedLocale = "changed";
  // @ts-expect-error Horizon sequences are readonly at the public type boundary.
  horizon.unitSequences[0].steps.push(horizon.unitSequences[0].steps[0]);
  // @ts-expect-error Nested trajectory ordinals are readonly.
  horizon.unitSequences[0].steps[0].trajectoryOrdinal = 9;
}
void assertReadonlyCompileContract;

function assertSourceContextCompileContract(
  rows: readonly Record<string, unknown>[],
  columns: Extract<CanonicalRowOrderV3, { kind: "columns" }>,
  source: Extract<CanonicalRowOrderV3, { kind: "source-order-confirmed" }>,
  context: OrderingResolutionContextV3,
): void {
  // @ts-expect-error The confirmation-time family capability is readonly.
  context.confirmationAnalysisFamily = "ona";
  resolveRowOrderV3(rows, ["horizon"], columns);
  resolveRowOrderV3(rows, ["horizon"], source, context);
  // @ts-expect-error Source-confirmed row ordering requires trusted context.
  resolveRowOrderV3(rows, ["horizon"], source);
  resolveHorizonOrderV3(rows, ["unit"], ["horizon"], columns);
  resolveHorizonOrderV3(rows, ["unit"], ["horizon"], source, context);
  // @ts-expect-error Source-confirmed Horizon ordering requires trusted context.
  resolveHorizonOrderV3(rows, ["unit"], ["horizon"], source);
}
void assertSourceContextCompileContract;

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
    "2024-01-01T00:00:00-00:00",
    "2024-01-01 00:00:00Z",
  ]) {
    assert.throws(() => resolveRowOrderV3(
      [{ horizon: "h", at }], ["horizon"], policy,
    ), /datetime|ISO-8601|offset|calendar|time/i);
  }
});

test("datetime ordering fails closed when a four-digit local time crosses the supported UTC year range", () => {
  const policy = columnsPolicy({
    column: "at",
    direction: "ascending",
    comparator: { type: "datetime", format: "ISO-8601", timeZone: "offset-in-value" },
  });
  for (const at of [
    "0000-01-01T00:00:00+14:00",
    "9999-12-31T23:59:59-14:00",
  ]) {
    assert.throws(() => resolveRowOrderV3(
      [{ horizon: "h", at }], ["horizon"], policy,
    ), /datetime|four-digit|range|supported/i);
  }
});

test("every comparator honors descending direction", () => {
  const cases: Array<{
    values: [unknown, unknown];
    key: OrderKeyV3;
  }> = [
    { values: [1, 2], key: { ...ascendingNumber("value"), direction: "descending" } },
    {
      values: ["2024-01-01", "2024-01-02"],
      key: {
        column: "value",
        direction: "descending",
        comparator: { type: "date", format: "YYYY-MM-DD" },
      },
    },
    {
      values: ["2024-01-01T00:00:00Z", "2024-01-02T00:00:00+00:00"],
      key: {
        column: "value",
        direction: "descending",
        comparator: { type: "datetime", format: "ISO-8601", timeZone: "offset-in-value" },
      },
    },
    {
      values: ["low", "high"],
      key: {
        column: "value",
        direction: "descending",
        comparator: {
          type: "ordered-category",
          levels: [{ type: "string", value: "low" }, { type: "string", value: "high" }],
        },
      },
    },
    {
      values: ["a", "b"],
      key: {
        column: "value",
        direction: "descending",
        comparator: { type: "text", locale: "en", sensitivity: "variant", numeric: false },
      },
    },
  ];
  for (const { values, key } of cases) {
    const resolved = resolveRowOrderV3(
      values.map((value) => ({ horizon: "h", value })),
      ["horizon"],
      columnsPolicy(key),
    );
    assert.deepEqual(resolved.orderedSourceRowIndices, [1, 0]);
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

test("text ordering rejects a canonical but unsupported locale instead of silently falling back", () => {
  assert.deepEqual(Intl.Collator.supportedLocalesOf(["zz-ZZ"], { localeMatcher: "lookup" }), []);
  assert.throws(() => resolveRowOrderV3(
    [{ horizon: "h", label: "a" }],
    ["horizon"],
    columnsPolicy({
      column: "label",
      direction: "ascending",
      comparator: { type: "text", locale: "zz-ZZ", sensitivity: "variant", numeric: false },
    }),
  ), /unsupported|locale/i);
});

test("text ordering binds or rejects a requested collation according to effective runtime behavior", () => {
  const locale = "en-u-co-phonebk";
  const requested = new Intl.Locale(locale).collation;
  const actual = new Intl.Collator(locale, {
    sensitivity: "variant",
    numeric: false,
    usage: "sort",
  }).resolvedOptions().collation;
  const resolve = () => resolveRowOrderV3(
    [{ horizon: "h", label: "a" }],
    ["horizon"],
    columnsPolicy({
      column: "label",
      direction: "ascending",
      comparator: { type: "text", locale, sensitivity: "variant", numeric: false },
    }),
  );
  if (requested === actual && actual !== "default" && actual !== "standard") {
    assert.equal(resolve().textCollationBindings[0].collation, actual);
  } else {
    assert.throws(resolve, /collation|extension|locale|fallback/i);
  }

  assert.throws(() => resolveRowOrderV3(
    [{ horizon: "h", label: "a" }],
    ["horizon"],
    columnsPolicy({
      column: "label",
      direction: "ascending",
      comparator: {
        type: "text",
        locale: "en-u-co-foobar",
        sensitivity: "variant",
        numeric: false,
      },
    }),
  ), /collation|extension|locale|fallback/i);
});

test("a supported Unicode collation extension is accepted and bound", (context) => {
  const phonebookLocale = "de-u-co-phonebk";
  const phonebookOptions = new Intl.Collator(phonebookLocale, {
    sensitivity: "variant",
    numeric: false,
    usage: "sort",
  }).resolvedOptions();
  const phonebookSupported = Intl.Collator.supportedLocalesOf(
    [phonebookLocale],
    { localeMatcher: "lookup" },
  ).length === 1 && phonebookOptions.collation === "phonebk";
  if (!phonebookSupported) {
    context.skip("Current runtime does not expose the requested German phonebook collation.");
    return;
  }
  const phonebook = resolveRowOrderV3(
    [{ horizon: "h", label: "ä" }],
    ["horizon"],
    columnsPolicy({
      column: "label",
      direction: "ascending",
      comparator: {
        type: "text",
        locale: phonebookLocale,
        sensitivity: "variant",
        numeric: false,
      },
    }),
  );
  assert.equal(phonebook.textCollationBindings[0].requestedLocale, phonebookLocale);
  assert.equal(phonebook.textCollationBindings[0].collation, "phonebk");
});

test("a supported Unicode case-first extension is accepted and bound", (context) => {
  const caseFirstLocale = "en-u-kf-upper";
  const caseFirstOptions = new Intl.Collator(caseFirstLocale, {
    sensitivity: "variant",
    numeric: false,
    usage: "sort",
  }).resolvedOptions();
  const caseFirstSupported = Intl.Collator.supportedLocalesOf(
    [caseFirstLocale],
    { localeMatcher: "lookup" },
  ).length === 1 && caseFirstOptions.caseFirst === "upper";
  if (!caseFirstSupported) {
    context.skip("Current runtime does not expose the requested case-first behavior.");
    return;
  }
  const caseFirst = resolveRowOrderV3(
    [{ horizon: "h", label: "a" }],
    ["horizon"],
    columnsPolicy({
      column: "label",
      direction: "ascending",
      comparator: {
        type: "text",
        locale: caseFirstLocale,
        sensitivity: "variant",
        numeric: false,
      },
    }),
  );
  assert.equal(caseFirst.textCollationBindings[0].requestedLocale, caseFirstLocale);
  assert.equal(caseFirst.textCollationBindings[0].caseFirst, "upper");
});

test("explicit Unicode numeric extension cannot contradict the comparator numeric option", (context) => {
  const conflicts = [
    { locale: "en-u-kn", numeric: false },
    { locale: "en-u-kn-false", numeric: true },
  ];
  let exercised = 0;
  for (const { locale, numeric } of conflicts) {
    if (Intl.Collator.supportedLocalesOf([locale], { localeMatcher: "lookup" }).length !== 1) continue;
    exercised += 1;
    assert.throws(() => resolveRowOrderV3(
      [{ horizon: "h", label: "item2" }],
      ["horizon"],
      columnsPolicy({
        column: "label",
        direction: "ascending",
        comparator: { type: "text", locale, sensitivity: "variant", numeric },
      }),
    ), /numeric|extension|conflict|locale/i);
  }

  for (const { locale, numeric } of [
    { locale: "en-u-kn", numeric: true },
    { locale: "en-u-kn-false", numeric: false },
  ]) {
    const options = new Intl.Collator(locale, {
      sensitivity: "variant",
      numeric,
      usage: "sort",
    }).resolvedOptions();
    if (Intl.Collator.supportedLocalesOf([locale], { localeMatcher: "lookup" }).length !== 1
      || options.numeric !== numeric) continue;
    exercised += 1;
    const resolved = resolveRowOrderV3(
      [{ horizon: "h", label: "item2" }],
      ["horizon"],
      columnsPolicy({
        column: "label",
        direction: "ascending",
        comparator: { type: "text", locale, sensitivity: "variant", numeric },
      }),
    );
    assert.equal(resolved.textCollationBindings[0].numeric, numeric);
  }
  if (exercised === 0) context.skip("Current runtime does not expose Unicode numeric collation behavior.");
});

test("a private-use u subtag is not misread as a Unicode behavior extension", () => {
  const locale = "en-x-u-co-phonebk";
  const resolved = resolveRowOrderV3(
    [{ horizon: "h", label: "a" }],
    ["horizon"],
    columnsPolicy({
      column: "label",
      direction: "ascending",
      comparator: { type: "text", locale, sensitivity: "variant", numeric: false },
    }),
  );
  assert.equal(resolved.textCollationBindings[0].requestedLocale, locale);
  assert.equal(resolved.textCollationBindings[0].collation, "default");
});

test("resolved text collation options are serialized once per key as frozen deterministic provenance", () => {
  const policy = columnsPolicy(
    {
      column: "label",
      direction: "ascending",
      comparator: { type: "text", locale: "en", sensitivity: "variant", numeric: true },
    },
    ascendingNumber("turn"),
  );
  const rows = [
    { unit: "u", horizon: "h", label: "item10", turn: 2 },
    { unit: "u", horizon: "h", label: "item2", turn: 1 },
  ];
  const rowResult = resolveRowOrderV3(rows, ["horizon"], policy);
  const horizonRows = [
    { unit: "u", horizon: "h1", label: "item2", turn: 1 },
    { unit: "u", horizon: "h2", label: "item10", turn: 2 },
  ];
  const horizonResult = resolveHorizonOrderV3(horizonRows, ["unit"], ["horizon"], policy);
  const options = new Intl.Collator("en", {
    sensitivity: "variant",
    numeric: true,
    usage: "sort",
  }).resolvedOptions();
  const expected = [{
    column: "label",
    requestedLocale: "en",
    resolvedLocale: options.locale,
    collation: options.collation,
    sensitivity: options.sensitivity,
    numeric: options.numeric,
    usage: options.usage,
    ignorePunctuation: options.ignorePunctuation,
    caseFirst: options.caseFirst,
  }];
  assert.deepEqual(rowResult.textCollationBindings, expected);
  assert.deepEqual(horizonResult.textCollationBindings, expected);
  assert.equal(rowResult.textCollationBindings[0].resolvedLocale, "en");
  assert.ok(Object.isFrozen(rowResult.textCollationBindings));
  assert.ok(Object.isFrozen(rowResult.textCollationBindings[0]));
  assert.ok(Object.isFrozen(horizonResult.textCollationBindings));
  assert.deepEqual(
    resolveRowOrderV3([...rows].reverse(), ["horizon"], policy).textCollationBindings,
    rowResult.textCollationBindings,
  );
  assert.deepEqual(resolveRowOrderV3(
    [{ horizon: "h", turn: 1 }], ["horizon"], columnsPolicy(ascendingNumber("turn")),
  ).textCollationBindings, []);
});

test("source-order confirmation preserves source order within each Horizon", () => {
  const rows = [
    { horizon: "h1", value: "first-h1" },
    { horizon: "h2", value: "first-h2" },
    { horizon: "h1", value: "second-h1" },
    { horizon: "h2", value: "second-h2" },
  ];
  const policy = confirmedPolicy(rows.length, ["horizon"]);
  const context = resolutionContext(rows.length);
  const resolved = resolveRowOrderV3(rows, ["horizon"], policy, context);
  assert.deepEqual(resolved.orderedSourceRowIndices, [0, 2, 1, 3]);
  assert.deepEqual(resolved.mappings.map((entry) => entry.orderTuple), [[0], [1], [0], [1]]);
  assert.deepEqual(resolved.requestedPolicy, policy);
  assert.deepEqual(resolved.sourceOrderBinding, {
    analysisFamily: "standard",
    datasetBinding: context.datasetBinding,
    confirmation: policy.kind === "source-order-confirmed" ? policy.confirmation : null,
  });
});

test("source-order confirmation validates row count and relevant Horizon columns", () => {
  const rows = [{ horizon: "h", other: 1 }];
  assert.throws(() => resolveRowOrderV3(
    rows, ["horizon"], confirmedPolicy(2, ["horizon"]), resolutionContext(rows.length),
  ), /rowCount|row count/i);
  assert.throws(() => resolveRowOrderV3(
    rows, ["horizon"], confirmedPolicy(1, ["other"]), resolutionContext(rows.length),
  ), /relevantColumns|horizon/i);
});

test("source-order confirmation requires a trusted current binding and expires on hash changes", () => {
  const rows = [{ horizon: "h1" }, { horizon: "h2" }];
  const policy = confirmedPolicy(rows.length, ["horizon"]);
  const differentlyBoundPolicy = confirmedPolicy(rows.length, ["horizon"], OTHER_HASH);
  assert.equal(differentlyBoundPolicy.confirmation.datasetSha256, OTHER_HASH);
  const callWithoutContext = resolveRowOrderV3 as unknown as (
    inputRows: readonly Record<string, unknown>[],
    horizonColumns: readonly string[],
    sourcePolicy: CanonicalRowOrderV3,
  ) => unknown;
  assert.throws(() => callWithoutContext(rows, ["horizon"], policy), /context|binding|required/i);
  const horizonRows = [{ unit: "u", horizon: "h1" }, { unit: "u", horizon: "h2" }];
  const horizonPolicy = confirmedPolicy(horizonRows.length, ["unit", "horizon"]);
  const callHorizonWithoutContext = resolveHorizonOrderV3 as unknown as (
    inputRows: readonly Record<string, unknown>[],
    unitColumns: readonly string[],
    horizonColumns: readonly string[],
    sourcePolicy: CanonicalHorizonOrderV3,
  ) => unknown;
  assert.throws(() => callHorizonWithoutContext(
    horizonRows, ["unit"], ["horizon"], horizonPolicy,
  ), /context|binding|required/i);
  assert.throws(() => resolveRowOrderV3(
    rows, ["horizon"], policy, resolutionContext(rows.length, "standard", OTHER_HASH),
  ), /dataset|hash|expired|binding/i);
  assert.throws(() => resolveRowOrderV3(
    rows, ["horizon"], differentlyBoundPolicy, resolutionContext(rows.length),
  ), /dataset|hash|expired|binding/i);

  const reorderedRows = [...rows].reverse();
  assert.throws(() => resolveRowOrderV3(
    reorderedRows,
    ["horizon"],
    policy,
    resolutionContext(reorderedRows.length, "standard", OTHER_HASH),
  ), /dataset|hash|expired|binding/i);
});

test("ordering domain failures expose stable codes without parsing English messages", () => {
  const capture = (operation: () => unknown): unknown => {
    try {
      operation();
    } catch (error) {
      return error;
    }
    assert.fail("expected an ordering domain error");
  };
  const rows = [{ horizon: "h1" }, { horizon: "h2" }];
  const stale = capture(() => resolveRowOrderV3(
    rows,
    ["horizon"],
    confirmedPolicy(rows.length, ["horizon"]),
    resolutionContext(rows.length, "standard", OTHER_HASH),
  ));
  assert.equal(stale instanceof OrderingDomainErrorV3, true);
  assert.equal((stale as OrderingDomainErrorV3).code, "SOURCE_CONFIRMATION_STALE");

  const tie = capture(() => resolveHorizonOrderV3(
    [
      { unit: "u1", horizon: "h1", order: 1 },
      { unit: "u1", horizon: "h2", order: 1 },
    ],
    ["unit"],
    ["horizon"],
    columnsPolicy(ascendingNumber("order")),
  ));
  assert.equal(tie instanceof OrderingDomainErrorV3, true);
  assert.equal((tie as OrderingDomainErrorV3).code, "HORIZON_TIE");
});

test("source-order confirmation expires when the current analysis family differs from its bound family", () => {
  const rows = [{ horizon: "h" }];
  const policy = confirmedPolicy(rows.length, ["horizon"]);
  assert.throws(() => resolveRowOrderV3(
    rows,
    ["horizon"],
    policy,
    resolutionContext(rows.length, "ona", HASH, "standard"),
  ), /family|expired|confirmation/i);

  const matching = resolveRowOrderV3(
    rows,
    ["horizon"],
    policy,
    resolutionContext(rows.length, "standard", HASH, "standard"),
  );
  assert.equal(matching.sourceOrderBinding?.analysisFamily, "standard");
});

test("source-order confirmation persists its own analysis-family provenance", () => {
  const rows = [{ unit: "u", horizon: "h", turn: 1 }];
  const standardPolicy = {
    ...confirmedPolicy(rows.length, ["horizon"]),
    confirmation: {
      ...confirmedPolicy(rows.length, ["horizon"]).confirmation,
      analysisFamily: "standard",
    },
  } as unknown as Extract<CanonicalRowOrderV3, { kind: "source-order-confirmed" }>;
  const standard = resolveRowOrderV3(rows, ["horizon"], standardPolicy, resolutionContext(rows.length));
  assert.equal(standard.sourceOrderBinding?.confirmation.analysisFamily, "standard");

  const onaPolicy = {
    ...standardPolicy,
    confirmation: { ...standardPolicy.confirmation, analysisFamily: "ona" },
  } as unknown as Extract<CanonicalRowOrderV3, { kind: "source-order-confirmed" }>;
  assert.throws(
    () => resolveRowOrderV3(rows, ["horizon"], onaPolicy, resolutionContext(rows.length, "standard")),
    /confirmation.*family|family.*changed|expired/iu,
  );
  const legacyPolicy = confirmedPolicy(rows.length, ["horizon"]) as unknown as {
    kind: "source-order-confirmed";
    confirmation: Record<string, unknown>;
  };
  delete legacyPolicy.confirmation.analysisFamily;
  assert.throws(
    () => resolveRowOrderV3(
      rows,
      ["horizon"],
      legacyPolicy as unknown as CanonicalRowOrderV3,
      resolutionContext(rows.length),
    ),
    /analysisFamily.*required|confirmation.*shape|unknown/iu,
  );
});

test("source-order relevant columns must exactly match the current ordered field identity", () => {
  const rows = [{ h1: "one", h2: "two", h3: "three" }];
  const policy = confirmedPolicy(rows.length, ["h1", "h2"]);
  const context = resolutionContext(rows.length);
  for (const currentColumns of [
    ["h1"],
    ["h2"],
    ["h2", "h1"],
    ["h1", "h3"],
  ]) {
    assert.throws(() => resolveRowOrderV3(
      rows, currentColumns, policy, context,
    ), /relevantColumns|field|column|expired/i);
  }
  assert.doesNotThrow(() => resolveRowOrderV3(
    rows, ["h1", "h2"], policy, context,
  ));
});

test("Horizon source confirmation exactly binds the ordered Unit-Horizon field union", () => {
  const rows = [{ unit: "u", horizon: "h", extra: "x" }];
  const context = resolutionContext(rows.length);
  assert.doesNotThrow(() => resolveHorizonOrderV3(
    rows,
    ["unit"],
    ["horizon"],
    confirmedPolicy(rows.length, ["unit", "horizon"]),
    context,
  ));
  for (const relevantColumns of [
    ["horizon", "unit"],
    ["unit", "horizon", "extra"],
    ["horizon"],
  ]) {
    assert.throws(() => resolveHorizonOrderV3(
      rows,
      ["unit"],
      ["horizon"],
      confirmedPolicy(rows.length, relevantColumns),
      context,
    ), /relevantColumns|field|column|expired/i);
  }
});

test("resolution context is exact, descriptor-safe, and validates family plus complete dataset binding", () => {
  const rows = [{ horizon: "h" }];
  const policy = confirmedPolicy(rows.length, ["horizon"]);
  type MutableContextProbe = {
    analysisFamily: unknown;
    confirmationAnalysisFamily?: unknown;
    datasetBinding: Record<string, unknown>;
    extra?: unknown;
  };
  const malformed: Array<(context: MutableContextProbe) => void> = [
    (context) => { context.analysisFamily = "other"; },
    (context) => { context.confirmationAnalysisFamily = "other"; },
    (context) => { delete context.confirmationAnalysisFamily; },
    (context) => { context.datasetBinding.hashKind = "md5"; },
    (context) => { context.datasetBinding.normalizedTableSha256 = "not-a-hash"; },
    (context) => { context.datasetBinding.headerSha256 = "not-a-hash"; },
    (context) => { context.datasetBinding.rowCount = 2; },
    (context) => { context.extra = true; },
  ];
  for (const mutate of malformed) {
    const context = structuredClone(resolutionContext(rows.length)) as unknown as MutableContextProbe;
    mutate(context);
    assert.throws(() => resolveRowOrderV3(
      rows, ["horizon"], policy, context as unknown as OrderingResolutionContextV3,
    ), /context|family|hash|rowCount|shape|binding/i);
  }
  const malformedColumnsContext = structuredClone(resolutionContext(rows.length)) as unknown as MutableContextProbe;
  malformedColumnsContext.confirmationAnalysisFamily = "other";
  assert.throws(() => resolveRowOrderV3(
    [{ horizon: "h", order: 1 }],
    ["horizon"],
    columnsPolicy(ascendingNumber("order")),
    malformedColumnsContext as unknown as OrderingResolutionContextV3,
  ), /context|family|shape|binding/i);

  let ordinaryGets = 0;
  const noGet = () => {
    ordinaryGets += 1;
    throw new Error("ordinary context get must not execute");
  };
  const bindingTarget = {
    hashKind: "normalized-utf8-csv-text-sha256" as const,
    normalizedTableSha256: HASH,
    rowCount: rows.length,
    headerSha256: HEADER_HASH,
  };
  const context = new Proxy({
    analysisFamily: "standard" as const,
    confirmationAnalysisFamily: "standard" as const,
    datasetBinding: new Proxy(bindingTarget, { get: noGet }),
  }, { get: noGet });
  resolveRowOrderV3(rows, ["horizon"], policy, context);
  assert.equal(ordinaryGets, 0);
});

test("source-order binding is detached and frozen, row ordering permits ONA, and Horizon ordering requires Standard", () => {
  const rows = [{ unit: "u", horizon: "h" }];
  const rowPolicy = confirmedPolicy(rows.length, ["horizon"], HASH, "ona");
  const rowContext = resolutionContext(rows.length, "ona");
  const rowResolved = resolveRowOrderV3(rows, ["horizon"], rowPolicy, rowContext);
  assert.equal(rowResolved.sourceOrderBinding?.analysisFamily, "ona");
  assert.deepEqual(rowResolved.textCollationBindings, []);
  assert.ok(Object.isFrozen(rowResolved.sourceOrderBinding));
  assert.ok(Object.isFrozen(rowResolved.sourceOrderBinding?.datasetBinding));
  assert.ok(Object.isFrozen(rowResolved.sourceOrderBinding?.confirmation));

  const mutableContext = rowContext as unknown as {
    analysisFamily: "standard" | "ona";
    confirmationAnalysisFamily: "standard" | "ona";
    datasetBinding: DatasetBindingV3;
  };
  mutableContext.analysisFamily = "standard";
  mutableContext.confirmationAnalysisFamily = "standard";
  mutableContext.datasetBinding.normalizedTableSha256 = OTHER_HASH;
  assert.equal(rowResolved.sourceOrderBinding?.analysisFamily, "ona");
  assert.equal(rowResolved.sourceOrderBinding?.datasetBinding.normalizedTableSha256, HASH);

  const horizonPolicy = confirmedPolicy(rows.length, ["unit", "horizon"]);
  assert.throws(() => resolveHorizonOrderV3(
    rows,
    ["unit"],
    ["horizon"],
    horizonPolicy,
    resolutionContext(rows.length, "ona"),
  ), /standard|family/i);
  const horizonResolved = resolveHorizonOrderV3(
    rows,
    ["unit"],
    ["horizon"],
    horizonPolicy,
    resolutionContext(rows.length, "standard"),
  );
  assert.equal(horizonResolved.sourceOrderBinding?.analysisFamily, "standard");
  assert.ok(Object.isFrozen(horizonResolved.sourceOrderBinding));
});

test("empty source-order confirmation normalizes negative-zero row counts to positive zero", () => {
  const policy = confirmedPolicy(-0, ["horizon"]);
  const context = resolutionContext(-0);
  const resolved = resolveRowOrderV3([], ["horizon"], policy, context);
  assert.deepEqual(resolved.mappings, []);
  assert.deepEqual(resolved.orderedSourceRowIndices, []);
  assert.equal(resolved.requestedPolicy.kind, "source-order-confirmed");
  if (resolved.requestedPolicy.kind === "source-order-confirmed") {
    assert.equal(Object.is(resolved.requestedPolicy.confirmation.rowCount, -0), false);
  }
  assert.equal(Object.is(resolved.sourceOrderBinding?.datasetBinding.rowCount, -0), false);
  assert.equal(Object.is(resolved.sourceOrderBinding?.confirmation.rowCount, -0), false);
});

test("stateful descriptor Proxies are captured once before deriving identity and order values", () => {
  const versions = [
    { horizon: "h1", turn: 1 },
    { horizon: "h2", turn: 2 },
  ];
  let descriptorCalls = 0;
  let ordinaryGets = 0;
  const row = new Proxy({ horizon: "unused", turn: 999 }, {
    get() {
      ordinaryGets += 1;
      throw new Error("ordinary get must not execute");
    },
    getOwnPropertyDescriptor(_target, key) {
      const version = versions[Math.floor(descriptorCalls / 2) % versions.length];
      descriptorCalls += 1;
      return {
        configurable: true,
        enumerable: true,
        writable: true,
        value: version[key as keyof typeof version],
      };
    },
  });
  const resolved = resolveRowOrderV3(
    [row], ["horizon"], columnsPolicy(ascendingNumber("turn")),
  );
  assert.equal(descriptorCalls, 2);
  assert.equal(ordinaryGets, 0);
  assert.deepEqual(resolved.mappings[0].orderTuple, [1]);
  assert.match(resolved.mappings[0].horizonKey, /h1/u);
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
  assert.equal(resolved.sourceOrderBinding, null);
  assert.deepEqual(resolved.textCollationBindings, []);
  assert.ok(Object.isFrozen(resolved));
  assert.ok(Object.isFrozen(resolved.requestedPolicy));
  assert.ok(Object.isFrozen(resolved.mappings));
  assert.ok(Object.isFrozen(resolved.mappings[0]));
  assert.ok(Object.isFrozen(resolved.mappings[0].orderTuple));
  assert.ok(Object.isFrozen(resolved.orderedSourceRowIndices));
  assert.throws(() => {
    (resolved.orderedSourceRowIndices as unknown as number[]).push(99);
  }, TypeError);
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
  const policy = confirmedPolicy(rows.length, ["unit", "horizon"]);
  const context = resolutionContext(rows.length);
  const resolved = resolveHorizonOrderV3(rows, ["unit"], ["horizon"], policy, context);
  const tupleByHorizon = new Map(resolved.horizonTuples.map((entry) => [entry.horizonKey, entry.orderTuple]));
  for (const sequence of resolved.unitSequences) {
    assert.deepEqual(sequence.steps.map((step) => tupleByHorizon.get(step.horizonKey)), [[0], [1]]);
  }

  assert.throws(() => resolveHorizonOrderV3(
    rows,
    ["unit"],
    ["horizon"],
    confirmedPolicy(rows.length + 1, ["unit", "horizon"]),
    context,
  ), /rowCount|row count/i);
  assert.throws(() => resolveHorizonOrderV3(
    rows,
    ["unit"],
    ["horizon"],
    confirmedPolicy(rows.length, ["horizon"]),
    context,
  ), /relevantColumns|horizon/i);
});

test("Horizon result uses canonical code-unit materialization order and is reversal deterministic", () => {
  const rows = [
    { unit: "u2", horizon: "h2", week: 2 },
    { unit: "u1", horizon: "h1", week: 1 },
    { unit: "u2", horizon: "h1", week: 1 },
    { unit: "u1", horizon: "h2", week: 2 },
  ];
  const policy = columnsPolicy(ascendingNumber("week"));
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
