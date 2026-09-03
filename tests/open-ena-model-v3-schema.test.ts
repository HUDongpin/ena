import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalJsonV3,
  deepFreezeV3,
  sha256CanonicalJsonV3,
  sha256TextV3,
} from "../lib/open-ena/model-v3/canonical-json";
import {
  decodeCanonicalOnaConfigV3,
  decodeCanonicalStandardConfigV3,
} from "../lib/open-ena/model-v3/schema";

const HASH = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function contracts(): Record<string, unknown> {
  return {
    validationContractVersion: "open-ena-validation-v3.1",
    runtimePolicyVersion: "open-ena-runtime-policy-v3.1",
  };
}

function columnOrder(): Record<string, unknown> {
  return {
    kind: "columns",
    keys: [
      {
        column: "turn",
        direction: "ascending",
        comparator: { type: "number" },
      },
      {
        column: "calendarDate",
        direction: "ascending",
        comparator: { type: "date", format: "YYYY-MM-DD" },
      },
      {
        column: "recordedAt",
        direction: "descending",
        comparator: {
          type: "datetime",
          format: "ISO-8601",
          timeZone: "offset-in-value",
        },
      },
      {
        column: "stage",
        direction: "ascending",
        comparator: {
          type: "ordered-category",
          levels: [
            { type: "string", value: "early" },
            { type: "number", value: 2 },
            { type: "boolean", value: true },
          ],
        },
      },
      {
        column: "speaker",
        direction: "ascending",
        comparator: {
          type: "text",
          locale: "en-US",
          sensitivity: "variant",
          numeric: true,
        },
      },
    ],
  };
}

function confirmationOrder(): Record<string, unknown> {
  return {
    kind: "source-order-confirmed",
    confirmation: {
      kind: "explicit-researcher-confirmation",
      datasetSha256: HASH,
      rowCount: 42,
      relevantColumns: ["student", "conversation", "turn"],
      confirmedAt: "2026-09-02T12:34:56.000Z",
      confirmationVersion: 1,
    },
  };
}

function endpointSvd(): Record<string, unknown> {
  return {
    model: { type: "EndPoint" },
    rotation: { type: "svd", centerAlignToOrigin: true },
  };
}

function endpointMeans(): Record<string, unknown> {
  return {
    model: { type: "EndPoint" },
    rotation: {
      type: "means",
      centerAlignToOrigin: false,
      contrast: {
        groupColumn: "condition",
        negativeLevel: { type: "string", value: "control" },
        positiveLevel: { type: "string", value: "treatment" },
      },
    },
  };
}

function endpointReference(): Record<string, unknown> {
  return {
    model: { type: "EndPoint" },
    rotation: {
      type: "reference",
      referenceId: "published-reference-1",
      expectedContentSha256: HASH,
    },
  };
}

function trajectory(
  type: "SeparateTrajectory" | "AccumulatedTrajectory",
  rotation: "svd" | "reference",
): Record<string, unknown> {
  return {
    model: { type, horizonOrder: confirmationOrder() },
    rotation: rotation === "svd"
      ? { type: "svd", centerAlignToOrigin: false }
      : {
          type: "reference",
          referenceId: "trajectory-reference",
          expectedContentSha256: HASH,
        },
  };
}

function standardFixture(): Record<string, unknown> {
  return {
    schemaVersion: 3,
    analysisFamily: "standard",
    contracts: contracts(),
    units: {
      columns: ["student", "team"],
      group: { type: "stable-metadata", column: "condition" },
    },
    horizons: { columns: ["conversation", "topic"] },
    codes: [
      { column: "ask", displayLabel: "Ask" },
      { column: "explain", displayLabel: "Explain" },
      { column: "challenge", displayLabel: "Challenge" },
    ],
    weighting: { type: "binary" },
    window: {
      type: "MovingStanzaWindow",
      backward: { kind: "finite", value: 2 },
      forward: { kind: "infinity" },
      rowOrder: columnOrder(),
    },
    analysis: endpointSvd(),
  };
}

function onaFixture(): Record<string, unknown> {
  return {
    schemaVersion: 3,
    analysisFamily: "ona",
    contracts: contracts(),
    units: { columns: ["student"], group: { type: "none" } },
    horizons: { columns: ["conversation"] },
    codes: [
      { column: "ask", displayLabel: "Ask" },
      { column: "explain", displayLabel: "Explain" },
      { column: "challenge", displayLabel: "Challenge" },
    ],
    model: { type: "EndPoint" },
    weighting: { type: "frequency", engineMethod: "sum" },
    window: {
      type: "MovingStanzaWindow",
      backward: { kind: "finite", value: 2 },
      forward: 0,
      rowOrder: columnOrder(),
    },
    rotation: { type: "svd", centerAlignToOrigin: true },
    directionalMask: {
      schemaVersion: 1,
      codeOrder: ["ask", "explain", "challenge"],
      enabled: [
        [true, false, true],
        [true, true, false],
        [false, true, true],
      ],
    },
  };
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

test("canonical JSON is key-order independent, array-order sensitive, and normalizes negative zero", async () => {
  const first = { z: -0, nested: { y: 2, a: ["first", "second"] } };
  const second = { nested: { a: ["first", "second"], y: 2 }, z: 0 };

  assert.equal(canonicalJsonV3(first), '{"nested":{"a":["first","second"],"y":2},"z":0}');
  assert.equal(canonicalJsonV3(first), canonicalJsonV3(second));
  assert.equal(await sha256CanonicalJsonV3(first), await sha256CanonicalJsonV3(second));
  assert.notEqual(canonicalJsonV3(["first", "second"]), canonicalJsonV3(["second", "first"]));
  assert.notEqual(
    await sha256CanonicalJsonV3(["first", "second"]),
    await sha256CanonicalJsonV3(["second", "first"]),
  );
});

test("SHA-256 helpers return the known lowercase browser-compatible digest shape", async () => {
  const digest = await sha256TextV3("abc");
  assert.equal(digest, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.match(digest, /^[0-9a-f]{64}$/u);
});

test("canonical JSON rejects every non-JSON or structurally unsafe boundary", () => {
  class Instance {
    value = 1;
  }
  const sparse = new Array(2);
  sparse[1] = "present";
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  const symbolProperty = { ok: true };
  Object.defineProperty(symbolProperty, Symbol("hidden"), { value: 1, enumerable: true });
  const nonenumerable = { ok: true };
  Object.defineProperty(nonenumerable, "hidden", { value: 1 });

  const invalid: Array<[string, unknown]> = [
    ["root undefined", undefined],
    ["object undefined", { value: undefined }],
    ["array undefined", [undefined]],
    ["NaN", Number.NaN],
    ["positive infinity", Number.POSITIVE_INFINITY],
    ["negative infinity", Number.NEGATIVE_INFINITY],
    ["bigint", BigInt(1)],
    ["symbol", Symbol("x")],
    ["function", () => 1],
    ["Date", new Date("2026-01-01T00:00:00.000Z")],
    ["Map", new Map([["a", 1]])],
    ["Set", new Set([1])],
    ["class instance", new Instance()],
    ["sparse array", sparse],
    ["cyclic object", cycle],
    ["symbol property", symbolProperty],
    ["nonenumerable property", nonenumerable],
  ];

  for (const [label, value] of invalid) {
    assert.throws(() => canonicalJsonV3(value), Error, label);
  }
});

test("canonical JSON rejects accessors without invoking them and does not mutate valid input", () => {
  let reads = 0;
  const accessor = {};
  Object.defineProperty(accessor, "unsafe", {
    enumerable: true,
    get() {
      reads += 1;
      return "secret";
    },
  });
  assert.throws(() => canonicalJsonV3(accessor), /accessor|data propert/i);
  assert.equal(reads, 0);

  const input = { z: { b: 2, a: 1 }, a: [3, 2, 1] };
  const before = copy(input);
  canonicalJsonV3(input);
  assert.deepEqual(input, before);
});

test("deepFreezeV3 recursively freezes nested arrays and objects and tolerates repeated references", () => {
  const shared = { answer: 42 };
  const value = { list: [shared], repeated: shared };
  const result = deepFreezeV3(value);

  assert.equal(result, value);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.list));
  assert.ok(Object.isFrozen(shared));
  assert.throws(() => {
    result.list.push({ answer: 1 });
  }, TypeError);
});

test("Standard decoder accepts every legal model, rotation, and window branch", () => {
  const variants: Array<[string, (fixture: Record<string, unknown>) => void]> = [
    ["Endpoint SVD moving stanza", () => {}],
    ["Endpoint Means", (fixture) => { fixture.analysis = endpointMeans(); }],
    ["Endpoint Reference", (fixture) => { fixture.analysis = endpointReference(); }],
    ["Separate SVD", (fixture) => { fixture.analysis = trajectory("SeparateTrajectory", "svd"); }],
    ["Separate Reference", (fixture) => { fixture.analysis = trajectory("SeparateTrajectory", "reference"); }],
    ["Accumulated SVD", (fixture) => { fixture.analysis = trajectory("AccumulatedTrajectory", "svd"); }],
    ["Accumulated Reference", (fixture) => { fixture.analysis = trajectory("AccumulatedTrajectory", "reference"); }],
    ["Conversation", (fixture) => { fixture.window = { type: "Conversation" }; }],
  ];

  for (const [label, mutate] of variants) {
    const fixture = standardFixture();
    mutate(fixture);
    assert.deepEqual(decodeCanonicalStandardConfigV3(fixture), fixture, label);
  }
});

test("Standard decoder constructs detached fresh structures", () => {
  const input = standardFixture();
  const decoded = decodeCanonicalStandardConfigV3(input);
  const expected = copy(decoded);

  (input.units as { columns: string[] }).columns[0] = "mutated";
  ((input.window as { rowOrder: { keys: Array<{ column: string }> } }).rowOrder.keys[0]).column = "changed";
  ((input.codes as Array<{ displayLabel: string }>)[0]).displayLabel = "Changed";

  assert.deepEqual(decoded, expected);
  assert.notEqual(decoded, input);
  assert.notEqual(decoded.units, input.units);
  assert.notEqual(decoded.codes, input.codes);
});

test("Standard decoder rejects top-level and nested missing or extra fields", () => {
  const extraTop = standardFixture();
  extraTop.extra = true;
  assert.throws(() => decodeCanonicalStandardConfigV3(extraTop), /config.*unknown.*extra/i);

  const missingTop = standardFixture();
  delete missingTop.codes;
  assert.throws(() => decodeCanonicalStandardConfigV3(missingTop), /config\.codes.*required|missing.*codes/i);

  const extraWindow = standardFixture();
  (extraWindow.window as Record<string, unknown>).unusedExtent = 2;
  assert.throws(() => decodeCanonicalStandardConfigV3(extraWindow), /window.*unknown.*unusedExtent/i);

  const missingContract = standardFixture();
  delete (missingContract.contracts as Record<string, unknown>).runtimePolicyVersion;
  assert.throws(() => decodeCanonicalStandardConfigV3(missingContract), /contracts.*runtimePolicyVersion.*required|missing/i);
});

test("Standard decoder rejects wrong schemas, families, contracts, and discriminators", () => {
  const cases: Array<[string, (fixture: Record<string, unknown>) => void, RegExp]> = [
    ["schema", (f) => { f.schemaVersion = 2; }, /schemaVersion.*3/i],
    ["family", (f) => { f.analysisFamily = "ona"; }, /analysisFamily.*standard/i],
    ["validation contract", (f) => {
      (f.contracts as Record<string, unknown>).validationContractVersion = "unknown-contract";
    }, /validationContractVersion.*open-ena-validation-v3\.1/i],
    ["window", (f) => { (f.window as Record<string, unknown>).type = "Sliding"; }, /window\.type/i],
    ["weighting", (f) => { f.weighting = { type: "tf-idf" }; }, /weighting\.type/i],
    ["rotation", (f) => {
      ((f.analysis as Record<string, unknown>).rotation as Record<string, unknown>).type = "varimax";
    }, /rotation\.type/i],
  ];
  for (const [label, mutate, pattern] of cases) {
    const fixture = standardFixture();
    mutate(fixture);
    assert.throws(() => decodeCanonicalStandardConfigV3(fixture), pattern, label);
  }
});

test("trajectory Means regression is rejected explicitly", () => {
  const fixture = standardFixture();
  fixture.analysis = {
    model: { type: "SeparateTrajectory", horizonOrder: confirmationOrder() },
    rotation: (endpointMeans().rotation),
  };
  assert.throws(
    () => decodeCanonicalStandardConfigV3(fixture),
    /trajectory.*Means|Means.*trajectory/i,
  );
});

test("Conversation rejects inactive row order and extents", () => {
  for (const inactive of [
    { type: "Conversation", backward: { kind: "finite", value: 2 } },
    { type: "Conversation", forward: { kind: "finite", value: 0 } },
    { type: "Conversation", rowOrder: columnOrder() },
  ]) {
    const fixture = standardFixture();
    fixture.window = inactive;
    assert.throws(() => decodeCanonicalStandardConfigV3(fixture), /Conversation.*unknown|window.*unknown/i);
  }
});

test("extent decoding rejects non-JSON infinities, strings, fractions, and invalid bounds", () => {
  const cases: Array<[unknown, "backward" | "forward"]> = [
    [Number.POSITIVE_INFINITY, "backward"],
    ["Infinity", "backward"],
    [{ kind: "finite", value: "2" }, "backward"],
    [{ kind: "finite", value: 1.5 }, "backward"],
    [{ kind: "finite", value: 0 }, "backward"],
    [{ kind: "finite", value: -1 }, "forward"],
    [{ kind: "finite", value: Number.MAX_SAFE_INTEGER + 1 }, "forward"],
    [{ kind: "infinity", value: 5 }, "forward"],
  ];
  for (const [extent, field] of cases) {
    const fixture = standardFixture();
    (fixture.window as Record<string, unknown>)[field] = extent;
    assert.throws(() => decodeCanonicalStandardConfigV3(fixture), new RegExp(field, "i"));
  }
});

test("strict scalars reject number and boolean coercion attempts", () => {
  const numeric = standardFixture();
  ((((numeric.window as Record<string, unknown>).rowOrder as Record<string, unknown>).keys as Array<Record<string, unknown>>)[0]
    .comparator as Record<string, unknown>).type = "number";
  (((numeric.window as Record<string, unknown>).backward as Record<string, unknown>).value) = "2";
  assert.throws(() => decodeCanonicalStandardConfigV3(numeric), /backward.*number|safe integer/i);

  const boolean = standardFixture();
  ((((boolean.window as Record<string, unknown>).rowOrder as Record<string, unknown>).keys as Array<Record<string, unknown>>)[4]
    .comparator as Record<string, unknown>).numeric = "true";
  assert.throws(() => decodeCanonicalStandardConfigV3(boolean), /numeric.*boolean/i);
});

test("Codes, Units, Horizons, order keys, and category levels are nonempty and distinct", () => {
  const cases: Array<[string, (fixture: Record<string, unknown>) => void, RegExp]> = [
    ["too few codes", (f) => { f.codes = (f.codes as unknown[]).slice(0, 2); }, /codes.*at least 3/i],
    ["duplicate codes", (f) => {
      (f.codes as Array<Record<string, unknown>>)[1].column = "ask";
    }, /codes.*column.*distinct|duplicate/i],
    ["missing code", (f) => { delete (f.codes as Array<Record<string, unknown>>)[0].displayLabel; }, /displayLabel.*required/i],
    ["blank unit", (f) => { (f.units as { columns: string[] }).columns[0] = "  "; }, /units\.columns.*nonblank/i],
    ["duplicate units", (f) => { (f.units as { columns: string[] }).columns = ["student", "student"]; }, /units\.columns.*distinct/i],
    ["empty horizons", (f) => { (f.horizons as { columns: string[] }).columns = []; }, /horizons\.columns.*nonempty/i],
    ["duplicate horizons", (f) => { (f.horizons as { columns: string[] }).columns = ["topic", "topic"]; }, /horizons\.columns.*distinct/i],
    ["duplicate order keys", (f) => {
      const keys = (((f.window as Record<string, unknown>).rowOrder as Record<string, unknown>).keys as Array<Record<string, unknown>>);
      keys[1].column = "turn";
    }, /order.*column.*distinct|duplicate/i],
    ["duplicate category levels", (f) => {
      const comparator = (((((f.window as Record<string, unknown>).rowOrder as Record<string, unknown>).keys as Array<Record<string, unknown>>)[3]).comparator as Record<string, unknown>);
      comparator.levels = [{ type: "string", value: "same" }, { type: "string", value: "same" }];
    }, /levels.*distinct|duplicate/i],
  ];
  for (const [label, mutate, pattern] of cases) {
    const fixture = standardFixture();
    mutate(fixture);
    assert.throws(() => decodeCanonicalStandardConfigV3(fixture), pattern, label);
  }
});

test("confirmation structure is exact and freshness-shaped without checking dataset freshness", () => {
  const valid = standardFixture();
  (valid.window as Record<string, unknown>).rowOrder = confirmationOrder();
  assert.equal(
    ((decodeCanonicalStandardConfigV3(valid).window as { rowOrder: { kind: string } }).rowOrder.kind),
    "source-order-confirmed",
  );

  const cases: Array<[string, (confirmation: Record<string, unknown>) => void, RegExp]> = [
    ["hash", (c) => { c.datasetSha256 = HASH.toUpperCase(); }, /datasetSha256.*lowercase/i],
    ["row count", (c) => { c.rowCount = -1; }, /rowCount.*nonnegative/i],
    ["duplicate columns", (c) => { c.relevantColumns = ["student", "student"]; }, /relevantColumns.*distinct/i],
    ["timestamp", (c) => { c.confirmedAt = "2026-09-02T12:34:56+00:00"; }, /confirmedAt.*canonical UTC/i],
    ["version", (c) => { c.confirmationVersion = 2; }, /confirmationVersion.*1/i],
    ["stale shape", (c) => { c.datasetHash = c.datasetSha256; }, /confirmation.*unknown.*datasetHash/i],
  ];
  for (const [label, mutate, pattern] of cases) {
    const fixture = standardFixture();
    const order = confirmationOrder();
    mutate(order.confirmation as Record<string, unknown>);
    (fixture.window as Record<string, unknown>).rowOrder = order;
    assert.throws(() => decodeCanonicalStandardConfigV3(fixture), pattern, label);
  }
});

test("comparators require exact fixed formats, time zones, sensitivity, and locale type", () => {
  const cases: Array<[number, string, unknown, RegExp]> = [
    [1, "format", "MM/DD/YYYY", /format.*YYYY-MM-DD/i],
    [1, "extra", true, /date comparator.*unknown.*extra/i],
    [2, "format", "RFC3339", /format.*ISO-8601/i],
    [2, "timeZone", "UTC", /timeZone.*offset-in-value/i],
    [4, "sensitivity", "strong", /sensitivity/i],
    [4, "locale", 1033, /locale.*string|BCP-47/i],
  ];
  for (const [index, field, value, pattern] of cases) {
    const fixture = standardFixture();
    const keys = (((fixture.window as Record<string, unknown>).rowOrder as Record<string, unknown>).keys as Array<Record<string, unknown>>);
    (keys[index].comparator as Record<string, unknown>)[field] = value;
    assert.throws(() => decodeCanonicalStandardConfigV3(fixture), pattern);
  }
});

test("Reference rotation rejects a center flag, blank ID, and non-lowercase hash", () => {
  const cases: Array<[string, (rotation: Record<string, unknown>) => void, RegExp]> = [
    ["center", (r) => { r.centerAlignToOrigin = true; }, /reference.*unknown.*centerAlignToOrigin/i],
    ["id", (r) => { r.referenceId = " "; }, /referenceId.*nonblank/i],
    ["hash", (r) => { r.expectedContentSha256 = HASH.toUpperCase(); }, /expectedContentSha256.*lowercase/i],
  ];
  for (const [label, mutate, pattern] of cases) {
    const fixture = standardFixture();
    fixture.analysis = endpointReference();
    const rotation = (fixture.analysis as { rotation: Record<string, unknown> }).rotation;
    mutate(rotation);
    assert.throws(() => decodeCanonicalStandardConfigV3(fixture), pattern, label);
  }
});

test("model objects reject inactive Horizon order on Endpoint", () => {
  const fixture = standardFixture();
  ((fixture.analysis as { model: Record<string, unknown> }).model).horizonOrder = columnOrder();
  assert.throws(() => decodeCanonicalStandardConfigV3(fixture), /EndPoint model.*unknown.*horizonOrder/i);
});

test("ONA decoder accepts its isolated canonical contract and detaches the result", () => {
  const input = onaFixture();
  const decoded = decodeCanonicalOnaConfigV3(input);
  const expected = copy(decoded);
  ((input.directionalMask as { enabled: boolean[][] }).enabled[0])[0] = false;
  (input.codes as Array<{ column: string }>)[0].column = "mutated";
  assert.deepEqual(decoded, expected);
  assert.notEqual(decoded, input);
  assert.notEqual(decoded.directionalMask, input.directionalMask);
});

test("ONA rejects every Standard-only or noncanonical branch", () => {
  const cases: Array<[string, (fixture: Record<string, unknown>) => void, RegExp]> = [
    ["forward", (f) => { (f.window as Record<string, unknown>).forward = 1; }, /forward.*0/i],
    ["Conversation", (f) => { f.window = { type: "Conversation" }; }, /window\.type.*MovingStanzaWindow/i],
    ["Binary", (f) => { f.weighting = { type: "binary" }; }, /weighting.*frequency/i],
    ["Reference", (f) => { f.rotation = endpointReference().rotation; }, /rotation.*svd/i],
    ["Means", (f) => { f.rotation = endpointMeans().rotation; }, /rotation.*svd/i],
    ["non-centered", (f) => { (f.rotation as Record<string, unknown>).centerAlignToOrigin = false; }, /centerAlignToOrigin.*true/i],
    ["trajectory", (f) => { f.model = { type: "SeparateTrajectory", horizonOrder: columnOrder() }; }, /model\.type.*EndPoint/i],
    ["analysis", (f) => { f.analysis = endpointSvd(); }, /ONA config.*unknown.*analysis/i],
    ["tagged forward", (f) => { (f.window as Record<string, unknown>).forward = { kind: "finite", value: 0 }; }, /forward.*0/i],
  ];
  for (const [label, mutate, pattern] of cases) {
    const fixture = onaFixture();
    mutate(fixture);
    assert.throws(() => decodeCanonicalOnaConfigV3(fixture), pattern, label);
  }
});

test("ONA directional mask must exactly match code order, dimensions, and boolean cells", () => {
  const cases: Array<[string, (mask: Record<string, unknown>) => void, RegExp]> = [
    ["wrong order", (m) => { m.codeOrder = ["explain", "ask", "challenge"]; }, /codeOrder.*canonical Code columns.*order/i],
    ["duplicate order", (m) => { m.codeOrder = ["ask", "ask", "challenge"]; }, /codeOrder.*distinct|canonical Code columns/i],
    ["ragged", (m) => { (m.enabled as unknown[][])[1] = [true, false]; }, /enabled.*square|length/i],
    ["wrong rows", (m) => { (m.enabled as unknown[][]).pop(); }, /enabled.*square|length/i],
    ["nonboolean", (m) => { (m.enabled as unknown[][])[0][0] = 1; }, /enabled.*boolean/i],
  ];
  for (const [label, mutate, pattern] of cases) {
    const fixture = onaFixture();
    mutate(fixture.directionalMask as Record<string, unknown>);
    assert.throws(() => decodeCanonicalOnaConfigV3(fixture), pattern, label);
  }
});

test("strict decoders reject nonplain, inherited, accessor, and sparse inputs without getter reads", () => {
  const nonplain = standardFixture();
  nonplain.units = new (class Units {
    columns = ["student"];
    group = { type: "none" };
  })();
  assert.throws(() => decodeCanonicalStandardConfigV3(nonplain), /units.*plain JSON object/i);

  const inherited = Object.create({ schemaVersion: 3 }) as Record<string, unknown>;
  Object.assign(inherited, standardFixture());
  delete inherited.schemaVersion;
  assert.throws(() => decodeCanonicalStandardConfigV3(inherited), /config.*plain JSON object|schemaVersion.*own/i);

  let reads = 0;
  const accessor = standardFixture();
  Object.defineProperty(accessor, "analysisFamily", {
    enumerable: true,
    get() {
      reads += 1;
      return "standard";
    },
  });
  assert.throws(() => decodeCanonicalStandardConfigV3(accessor), /config.*accessor|data propert/i);
  assert.equal(reads, 0);

  const sparse = standardFixture();
  const columns = new Array(2);
  columns[1] = "student";
  (sparse.units as Record<string, unknown>).columns = columns;
  assert.throws(() => decodeCanonicalStandardConfigV3(sparse), /units\.columns.*dense plain JSON array/i);
});
