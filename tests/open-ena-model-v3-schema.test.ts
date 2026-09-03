import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  horizonOrder: Record<string, unknown> = confirmationOrder(),
): Record<string, unknown> {
  return {
    model: { type, horizonOrder },
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

type FixtureMutation = {
  label: string;
  prepare?: (fixture: Record<string, unknown>) => void;
  mutate: (fixture: Record<string, unknown>) => void;
  pattern: RegExp;
};

function expectStandardRejections(cases: FixtureMutation[]): void {
  for (const { label, prepare, mutate, pattern } of cases) {
    const fixture = standardFixture();
    prepare?.(fixture);
    mutate(fixture);
    assert.throws(() => decodeCanonicalStandardConfigV3(fixture), pattern, label);
  }
}

function expectOnaRejections(cases: FixtureMutation[]): void {
  for (const { label, prepare, mutate, pattern } of cases) {
    const fixture = onaFixture();
    prepare?.(fixture);
    mutate(fixture);
    assert.throws(() => decodeCanonicalOnaConfigV3(fixture), pattern, label);
  }
}

function standardWindow(fixture: Record<string, unknown>): Record<string, unknown> {
  return fixture.window as Record<string, unknown>;
}

function standardAnalysis(fixture: Record<string, unknown>): Record<string, unknown> {
  return fixture.analysis as Record<string, unknown>;
}

function standardModel(fixture: Record<string, unknown>): Record<string, unknown> {
  return standardAnalysis(fixture).model as Record<string, unknown>;
}

function standardRotation(fixture: Record<string, unknown>): Record<string, unknown> {
  return standardAnalysis(fixture).rotation as Record<string, unknown>;
}

function rowOrder(fixture: Record<string, unknown>): Record<string, unknown> {
  return standardWindow(fixture).rowOrder as Record<string, unknown>;
}

function orderKeys(fixture: Record<string, unknown>): Array<Record<string, unknown>> {
  return rowOrder(fixture).keys as Array<Record<string, unknown>>;
}

function comparatorAt(fixture: Record<string, unknown>, index: number): Record<string, unknown> {
  return orderKeys(fixture)[index].comparator as Record<string, unknown>;
}

function sourceConfirmation(fixture: Record<string, unknown>): Record<string, unknown> {
  return rowOrder(fixture).confirmation as Record<string, unknown>;
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

  const self: { self?: unknown } = {};
  self.self = self;
  assert.doesNotThrow(() => deepFreezeV3(self));
  assert.ok(Object.isFrozen(self));
  assert.equal(self.self, self);

  const cyclicObject: { array?: unknown[] } = {};
  const cyclicArray: unknown[] = [cyclicObject];
  cyclicObject.array = cyclicArray;
  assert.doesNotThrow(() => deepFreezeV3(cyclicObject));
  assert.ok(Object.isFrozen(cyclicObject));
  assert.ok(Object.isFrozen(cyclicArray));
  assert.equal(cyclicArray[0], cyclicObject);
  assert.equal(cyclicObject.array, cyclicArray);
});

test("Standard decoder accepts every legal model, rotation, and window branch", () => {
  const variants: Array<[string, (fixture: Record<string, unknown>) => void]> = [
    ["Endpoint SVD moving stanza", () => {}],
    ["Endpoint Means", (fixture) => { fixture.analysis = endpointMeans(); }],
    ["Endpoint Reference", (fixture) => { fixture.analysis = endpointReference(); }],
    ["Separate SVD", (fixture) => { fixture.analysis = trajectory("SeparateTrajectory", "svd", columnOrder()); }],
    ["Separate Reference", (fixture) => { fixture.analysis = trajectory("SeparateTrajectory", "reference"); }],
    ["Accumulated SVD", (fixture) => { fixture.analysis = trajectory("AccumulatedTrajectory", "svd", columnOrder()); }],
    ["Accumulated Reference", (fixture) => { fixture.analysis = trajectory("AccumulatedTrajectory", "reference"); }],
    ["Conversation", (fixture) => { fixture.window = { type: "Conversation" }; }],
  ];

  for (const [label, mutate] of variants) {
    const fixture = standardFixture();
    mutate(fixture);
    const decoded = decodeCanonicalStandardConfigV3(fixture);
    assert.deepEqual(decoded, fixture, label);
    assert.notEqual(decoded, fixture, label);
    assert.notEqual(decoded.codes, fixture.codes, label);
  }
});

test("Standard valid matrix executes every weighting, extent, order, and trajectory-order branch", () => {
  const variants: Array<[
    string,
    (fixture: Record<string, unknown>) => void,
    (decoded: ReturnType<typeof decodeCanonicalStandardConfigV3>) => void,
  ]> = [
    [
      "baseline binary, finite backward, infinite forward, columns order",
      () => {},
      (decoded) => {
        assert.equal(decoded.weighting.type, "binary");
        assert.equal(decoded.window.type, "MovingStanzaWindow");
        if (decoded.window.type === "MovingStanzaWindow") {
          assert.deepEqual(decoded.window.backward, { kind: "finite", value: 2 });
          assert.deepEqual(decoded.window.forward, { kind: "infinity" });
          assert.equal(decoded.window.rowOrder.kind, "columns");
        }
      },
    ],
    [
      "frequency weighting only",
      (fixture) => { fixture.weighting = { type: "frequency" }; },
      (decoded) => {
        assert.equal(decoded.weighting.type, "frequency");
      },
    ],
    [
      "infinite backward only",
      (fixture) => { standardWindow(fixture).backward = { kind: "infinity" }; },
      (decoded) => {
        assert.equal(decoded.window.type, "MovingStanzaWindow");
        if (decoded.window.type === "MovingStanzaWindow") {
          assert.deepEqual(decoded.window.backward, { kind: "infinity" });
        }
      },
    ],
    [
      "zero finite forward only",
      (fixture) => { standardWindow(fixture).forward = { kind: "finite", value: 0 }; },
      (decoded) => {
        assert.equal(decoded.window.type, "MovingStanzaWindow");
        if (decoded.window.type === "MovingStanzaWindow") {
          assert.deepEqual(decoded.window.forward, { kind: "finite", value: 0 });
        }
      },
    ],
    [
      "positive finite forward only",
      (fixture) => { standardWindow(fixture).forward = { kind: "finite", value: 3 }; },
      (decoded) => {
        assert.equal(decoded.window.type, "MovingStanzaWindow");
        if (decoded.window.type === "MovingStanzaWindow") {
          assert.deepEqual(decoded.window.forward, { kind: "finite", value: 3 });
        }
      },
    ],
    [
      "source-confirmed row order only",
      (fixture) => { standardWindow(fixture).rowOrder = confirmationOrder(); },
      (decoded) => {
        assert.equal(decoded.window.type, "MovingStanzaWindow");
        if (decoded.window.type === "MovingStanzaWindow") {
          assert.equal(decoded.window.rowOrder.kind, "source-order-confirmed");
        }
      },
    ],
  ];

  for (const [label, mutate, inspect] of variants) {
    const input = standardFixture();
    mutate(input);
    const decoded = decodeCanonicalStandardConfigV3(input);
    assert.deepEqual(decoded, input, label);
    assert.notEqual(decoded, input, label);
    assert.notEqual(decoded.codes, input.codes, label);
    inspect(decoded);
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

  const symbolKey = standardFixture();
  Object.defineProperty(symbolKey.units, Symbol("hidden"), { value: true, enumerable: true });
  assert.throws(
    () => decodeCanonicalStandardConfigV3(symbolKey),
    /units.*only string-named data properties/i,
  );

  const nonenumerable = standardFixture();
  Object.defineProperty(nonenumerable.horizons, "hidden", { value: true, enumerable: false });
  assert.throws(
    () => decodeCanonicalStandardConfigV3(nonenumerable),
    /horizons\.hidden.*own enumerable data property/i,
  );
});

test("root, contracts, units, Groups, horizons, and Codes reject exact-key and type mutations", () => {
  expectStandardRejections([
    {
      label: "root missing schemaVersion",
      mutate: (fixture) => { delete fixture.schemaVersion; },
      pattern: /Standard config\.schemaVersion.*required/i,
    },
    {
      label: "root extra key",
      mutate: (fixture) => { fixture.future = true; },
      pattern: /Standard config.*unknown.*future/i,
    },
    {
      label: "schemaVersion string coercion",
      mutate: (fixture) => { fixture.schemaVersion = "3"; },
      pattern: /schemaVersion.*3/i,
    },
    {
      label: "family missing",
      mutate: (fixture) => { delete fixture.analysisFamily; },
      pattern: /analysisFamily.*required/i,
    },
    {
      label: "family wrong scalar type",
      mutate: (fixture) => { fixture.analysisFamily = ["standard"]; },
      pattern: /analysisFamily.*standard/i,
    },
    {
      label: "family unknown discriminator",
      mutate: (fixture) => { fixture.analysisFamily = "future"; },
      pattern: /analysisFamily.*standard/i,
    },
    {
      label: "contracts wrong container",
      mutate: (fixture) => { fixture.contracts = []; },
      pattern: /contracts.*plain JSON object/i,
    },
    {
      label: "contracts missing runtime policy",
      mutate: (fixture) => { delete (fixture.contracts as Record<string, unknown>).runtimePolicyVersion; },
      pattern: /contracts\.runtimePolicyVersion.*required/i,
    },
    {
      label: "contracts extra key",
      mutate: (fixture) => { (fixture.contracts as Record<string, unknown>).execution = "inactive"; },
      pattern: /contracts.*unknown.*execution/i,
    },
    {
      label: "validation contract wrong scalar type",
      mutate: (fixture) => { (fixture.contracts as Record<string, unknown>).validationContractVersion = 31; },
      pattern: /validationContractVersion.*open-ena-validation-v3\.1/i,
    },
    {
      label: "runtime contract unknown literal",
      mutate: (fixture) => { (fixture.contracts as Record<string, unknown>).runtimePolicyVersion = "unknown"; },
      pattern: /runtimePolicyVersion.*open-ena-runtime-policy-v3\.1/i,
    },
    {
      label: "units wrong container",
      mutate: (fixture) => { fixture.units = []; },
      pattern: /units.*plain JSON object/i,
    },
    {
      label: "units missing group",
      mutate: (fixture) => { delete (fixture.units as Record<string, unknown>).group; },
      pattern: /units\.group.*required/i,
    },
    {
      label: "units extra key",
      mutate: (fixture) => { (fixture.units as Record<string, unknown>).inactive = true; },
      pattern: /units.*unknown.*inactive/i,
    },
    {
      label: "units columns wrong container",
      mutate: (fixture) => { (fixture.units as Record<string, unknown>).columns = {}; },
      pattern: /units\.columns.*dense plain JSON array/i,
    },
    {
      label: "Group wrong container",
      mutate: (fixture) => { (fixture.units as Record<string, unknown>).group = []; },
      pattern: /units\.group.*plain JSON object/i,
    },
    {
      label: "Group none missing discriminator",
      prepare: (fixture) => { (fixture.units as Record<string, unknown>).group = { type: "none" }; },
      mutate: (fixture) => { delete ((fixture.units as Record<string, unknown>).group as Record<string, unknown>).type; },
      pattern: /units\.group\.type.*none.*stable-metadata/i,
    },
    {
      label: "Group none inactive column",
      prepare: (fixture) => { (fixture.units as Record<string, unknown>).group = { type: "none" }; },
      mutate: (fixture) => { ((fixture.units as Record<string, unknown>).group as Record<string, unknown>).column = "inactive"; },
      pattern: /group none.*unknown.*column/i,
    },
    {
      label: "Group none wrong discriminator type",
      prepare: (fixture) => { (fixture.units as Record<string, unknown>).group = { type: "none" }; },
      mutate: (fixture) => { ((fixture.units as Record<string, unknown>).group as Record<string, unknown>).type = 0; },
      pattern: /units\.group\.type.*none.*stable-metadata/i,
    },
    {
      label: "Group unknown discriminator",
      mutate: (fixture) => { ((fixture.units as Record<string, unknown>).group as Record<string, unknown>).type = "dynamic"; },
      pattern: /units\.group\.type.*none.*stable-metadata/i,
    },
    {
      label: "stable Group missing column",
      mutate: (fixture) => { delete ((fixture.units as Record<string, unknown>).group as Record<string, unknown>).column; },
      pattern: /stable-metadata.*column.*required/i,
    },
    {
      label: "stable Group extra key",
      mutate: (fixture) => { ((fixture.units as Record<string, unknown>).group as Record<string, unknown>).inactive = true; },
      pattern: /stable-metadata.*unknown.*inactive/i,
    },
    {
      label: "stable Group column wrong type",
      mutate: (fixture) => { ((fixture.units as Record<string, unknown>).group as Record<string, unknown>).column = 2; },
      pattern: /group\.column.*nonblank string/i,
    },
    {
      label: "horizons wrong container",
      mutate: (fixture) => { fixture.horizons = []; },
      pattern: /horizons.*plain JSON object/i,
    },
    {
      label: "horizons missing columns",
      mutate: (fixture) => { delete (fixture.horizons as Record<string, unknown>).columns; },
      pattern: /horizons\.columns.*required/i,
    },
    {
      label: "horizons extra key",
      mutate: (fixture) => { (fixture.horizons as Record<string, unknown>).order = []; },
      pattern: /horizons.*unknown.*order/i,
    },
    {
      label: "horizons columns wrong container",
      mutate: (fixture) => { (fixture.horizons as Record<string, unknown>).columns = {}; },
      pattern: /horizons\.columns.*dense plain JSON array/i,
    },
    {
      label: "Codes wrong container",
      mutate: (fixture) => { fixture.codes = {}; },
      pattern: /codes.*dense plain JSON array/i,
    },
    {
      label: "Code object wrong container",
      mutate: (fixture) => { (fixture.codes as unknown[])[0] = []; },
      pattern: /codes\[0\].*plain JSON object/i,
    },
    {
      label: "Code missing displayLabel",
      mutate: (fixture) => { delete (fixture.codes as Array<Record<string, unknown>>)[0].displayLabel; },
      pattern: /codes\[0\]\.displayLabel.*required/i,
    },
    {
      label: "Code extra key",
      mutate: (fixture) => { (fixture.codes as Array<Record<string, unknown>>)[0].color = "red"; },
      pattern: /codes\[0\].*unknown.*color/i,
    },
    {
      label: "Code column wrong scalar type",
      mutate: (fixture) => { (fixture.codes as Array<Record<string, unknown>>)[0].column = ["ask"]; },
      pattern: /codes\[0\]\.column.*nonblank string/i,
    },
  ]);

  assert.throws(
    () => decodeCanonicalStandardConfigV3([]),
    /Standard config.*plain JSON object/i,
    "actual root wrong container",
  );
});

test("Standard weighting and window branches reject exact-key, type, discriminator, and inactive-field mutations", () => {
  expectStandardRejections([
    {
      label: "binary weighting missing type",
      mutate: (fixture) => { delete (fixture.weighting as Record<string, unknown>).type; },
      pattern: /weighting\.type.*required/i,
    },
    {
      label: "binary weighting inactive engine method",
      mutate: (fixture) => { (fixture.weighting as Record<string, unknown>).engineMethod = "sum"; },
      pattern: /weighting.*unknown.*engineMethod/i,
    },
    {
      label: "binary weighting wrong discriminator type",
      mutate: (fixture) => { (fixture.weighting as Record<string, unknown>).type = 1; },
      pattern: /weighting\.type.*binary.*frequency/i,
    },
    {
      label: "binary weighting unknown discriminator",
      mutate: (fixture) => { (fixture.weighting as Record<string, unknown>).type = "tf-idf"; },
      pattern: /weighting\.type.*binary.*frequency/i,
    },
    {
      label: "frequency weighting missing type",
      prepare: (fixture) => { fixture.weighting = { type: "frequency" }; },
      mutate: (fixture) => { delete (fixture.weighting as Record<string, unknown>).type; },
      pattern: /weighting\.type.*required/i,
    },
    {
      label: "frequency weighting extra key",
      prepare: (fixture) => { fixture.weighting = { type: "frequency" }; },
      mutate: (fixture) => { (fixture.weighting as Record<string, unknown>).engineMethod = "sum"; },
      pattern: /weighting.*unknown.*engineMethod/i,
    },
    {
      label: "frequency weighting wrong container",
      prepare: (fixture) => { fixture.weighting = { type: "frequency" }; },
      mutate: (fixture) => { fixture.weighting = []; },
      pattern: /weighting.*plain JSON object/i,
    },
    {
      label: "frequency weighting unknown discriminator",
      prepare: (fixture) => { fixture.weighting = { type: "frequency" }; },
      mutate: (fixture) => { (fixture.weighting as Record<string, unknown>).type = "count"; },
      pattern: /weighting\.type.*binary.*frequency/i,
    },
    {
      label: "Moving Stanza missing backward",
      mutate: (fixture) => { delete standardWindow(fixture).backward; },
      pattern: /MovingStanzaWindow window\.backward.*required/i,
    },
    {
      label: "Moving Stanza extra key",
      mutate: (fixture) => { standardWindow(fixture).inactive = true; },
      pattern: /MovingStanzaWindow window.*unknown.*inactive/i,
    },
    {
      label: "Moving Stanza wrong container",
      mutate: (fixture) => { fixture.window = []; },
      pattern: /window.*plain JSON object/i,
    },
    {
      label: "Moving Stanza unknown discriminator",
      mutate: (fixture) => { standardWindow(fixture).type = "Sliding"; },
      pattern: /window\.type.*MovingStanzaWindow.*Conversation/i,
    },
    {
      label: "Conversation missing discriminator",
      prepare: (fixture) => { fixture.window = { type: "Conversation" }; },
      mutate: (fixture) => { delete standardWindow(fixture).type; },
      pattern: /window\.type.*MovingStanzaWindow.*Conversation/i,
    },
    {
      label: "Conversation inactive extent",
      prepare: (fixture) => { fixture.window = { type: "Conversation" }; },
      mutate: (fixture) => { standardWindow(fixture).backward = { kind: "finite", value: 1 }; },
      pattern: /Conversation window.*unknown.*backward/i,
    },
    {
      label: "Conversation wrong discriminator type",
      prepare: (fixture) => { fixture.window = { type: "Conversation" }; },
      mutate: (fixture) => { standardWindow(fixture).type = 1; },
      pattern: /window\.type.*MovingStanzaWindow.*Conversation/i,
    },
    {
      label: "Conversation unknown discriminator",
      prepare: (fixture) => { fixture.window = { type: "Conversation" }; },
      mutate: (fixture) => { standardWindow(fixture).type = "WholeConversation"; },
      pattern: /window\.type.*MovingStanzaWindow.*Conversation/i,
    },
  ]);
});

test("backward and forward extents reject every malformed tagged or raw representation", () => {
  const commonInvalid: Array<[string, unknown]> = [
    ["null", null],
    ["empty object", {}],
    ["unknown kind", { kind: "forever" }],
    ["finite missing value", { kind: "finite" }],
    ["finite null value", { kind: "finite", value: null }],
    ["finite extra key", { kind: "finite", value: 1, extra: true }],
    ["infinity with value", { kind: "infinity", value: 1 }],
    ["raw JavaScript Infinity", Number.POSITIVE_INFINITY],
    ["string Infinity", "Infinity"],
    ["fractional finite", { kind: "finite", value: 1.5 }],
    ["negative finite", { kind: "finite", value: -1 }],
    ["unsafe finite", { kind: "finite", value: Number.MAX_SAFE_INTEGER + 1 }],
  ];

  for (const field of ["backward", "forward"] as const) {
    for (const [label, invalid] of commonInvalid) {
      const fixture = standardFixture();
      standardWindow(fixture)[field] = invalid;
      assert.throws(
        () => decodeCanonicalStandardConfigV3(fixture),
        new RegExp(`window\\.${field}`, "i"),
        `${field}: ${label}`,
      );
    }
  }

  const zeroBackward = standardFixture();
  standardWindow(zeroBackward).backward = { kind: "finite", value: 0 };
  assert.throws(
    () => decodeCanonicalStandardConfigV3(zeroBackward),
    /window\.backward\.value.*greater than or equal to 1/i,
  );

  const stringFinite = standardFixture();
  standardWindow(stringFinite).forward = { kind: "finite", value: "2" };
  assert.throws(
    () => decodeCanonicalStandardConfigV3(stringFinite),
    /window\.forward\.value.*safe integer/i,
  );

  const positive = standardFixture();
  standardWindow(positive).backward = { kind: "finite", value: 1 };
  standardWindow(positive).forward = { kind: "finite", value: 0 };
  const decoded = decodeCanonicalStandardConfigV3(positive);
  assert.equal(decoded.window.type, "MovingStanzaWindow");
  if (decoded.window.type === "MovingStanzaWindow") {
    assert.deepEqual(decoded.window.backward, { kind: "finite", value: 1 });
    assert.deepEqual(decoded.window.forward, { kind: "finite", value: 0 });
  }
});

test("row-order branches and OrderKey reject exact-key, type, discriminator, and inactive fields", () => {
  expectStandardRejections([
    {
      label: "columns order missing keys",
      mutate: (fixture) => { delete rowOrder(fixture).keys; },
      pattern: /columns order\.keys.*required/i,
    },
    {
      label: "columns order extra key",
      mutate: (fixture) => { rowOrder(fixture).stable = true; },
      pattern: /columns order.*unknown.*stable/i,
    },
    {
      label: "columns order wrong keys container",
      mutate: (fixture) => { rowOrder(fixture).keys = {}; },
      pattern: /rowOrder\.keys.*dense plain JSON array/i,
    },
    {
      label: "columns order inactive confirmation",
      mutate: (fixture) => { rowOrder(fixture).confirmation = (confirmationOrder().confirmation); },
      pattern: /columns order.*unknown.*confirmation/i,
    },
    {
      label: "columns order unknown discriminator",
      mutate: (fixture) => { rowOrder(fixture).kind = "natural"; },
      pattern: /rowOrder\.kind.*columns.*source-order-confirmed/i,
    },
    {
      label: "source order missing confirmation",
      prepare: (fixture) => { standardWindow(fixture).rowOrder = confirmationOrder(); },
      mutate: (fixture) => { delete rowOrder(fixture).confirmation; },
      pattern: /source-order-confirmed order\.confirmation.*required/i,
    },
    {
      label: "source order extra key",
      prepare: (fixture) => { standardWindow(fixture).rowOrder = confirmationOrder(); },
      mutate: (fixture) => { rowOrder(fixture).stable = true; },
      pattern: /source-order-confirmed order.*unknown.*stable/i,
    },
    {
      label: "source order wrong confirmation container",
      prepare: (fixture) => { standardWindow(fixture).rowOrder = confirmationOrder(); },
      mutate: (fixture) => { rowOrder(fixture).confirmation = []; },
      pattern: /rowOrder\.confirmation.*plain JSON object/i,
    },
    {
      label: "source order inactive keys",
      prepare: (fixture) => { standardWindow(fixture).rowOrder = confirmationOrder(); },
      mutate: (fixture) => { rowOrder(fixture).keys = []; },
      pattern: /source-order-confirmed order.*unknown.*keys/i,
    },
    {
      label: "OrderKey missing comparator",
      mutate: (fixture) => { delete orderKeys(fixture)[0].comparator; },
      pattern: /rowOrder\.keys\[0\]\.comparator.*required/i,
    },
    {
      label: "OrderKey extra key",
      mutate: (fixture) => { orderKeys(fixture)[0].missing = "reject"; },
      pattern: /rowOrder\.keys\[0\].*unknown.*missing/i,
    },
    {
      label: "OrderKey wrong column type",
      mutate: (fixture) => { orderKeys(fixture)[0].column = 1; },
      pattern: /rowOrder\.keys\[0\]\.column.*nonblank string/i,
    },
    {
      label: "OrderKey unknown direction",
      mutate: (fixture) => { orderKeys(fixture)[0].direction = "up"; },
      pattern: /rowOrder\.keys\[0\]\.direction.*ascending.*descending/i,
    },
    {
      label: "OrderKey comparator wrong container",
      mutate: (fixture) => { orderKeys(fixture)[0].comparator = []; },
      pattern: /rowOrder\.keys\[0\]\.comparator.*plain JSON object/i,
    },
  ]);
});

test("every comparator branch rejects missing, extra, wrong-type, and discriminator mutations", () => {
  expectStandardRejections([
    {
      label: "number comparator missing type",
      mutate: (fixture) => { delete comparatorAt(fixture, 0).type; },
      pattern: /keys\[0\]\.comparator\.type.*supported comparator/i,
    },
    {
      label: "number comparator extra key",
      mutate: (fixture) => { comparatorAt(fixture, 0).numeric = true; },
      pattern: /number comparator.*unknown.*numeric/i,
    },
    {
      label: "number comparator wrong container",
      mutate: (fixture) => { orderKeys(fixture)[0].comparator = []; },
      pattern: /keys\[0\]\.comparator.*plain JSON object/i,
    },
    {
      label: "number comparator unknown discriminator",
      mutate: (fixture) => { comparatorAt(fixture, 0).type = "integer"; },
      pattern: /keys\[0\]\.comparator\.type.*supported comparator/i,
    },
    {
      label: "date comparator missing format",
      mutate: (fixture) => { delete comparatorAt(fixture, 1).format; },
      pattern: /date comparator\.format.*required/i,
    },
    {
      label: "date comparator extra key",
      mutate: (fixture) => { comparatorAt(fixture, 1).timeZone = "UTC"; },
      pattern: /date comparator.*unknown.*timeZone/i,
    },
    {
      label: "date comparator wrong format",
      mutate: (fixture) => { comparatorAt(fixture, 1).format = "MM/DD/YYYY"; },
      pattern: /keys\[1\]\.comparator\.format.*YYYY-MM-DD/i,
    },
    {
      label: "date comparator format wrong scalar type",
      mutate: (fixture) => { comparatorAt(fixture, 1).format = 1; },
      pattern: /keys\[1\]\.comparator\.format.*YYYY-MM-DD/i,
    },
    {
      label: "date comparator unknown discriminator",
      mutate: (fixture) => { comparatorAt(fixture, 1).type = "calendar-date"; },
      pattern: /keys\[1\]\.comparator\.type.*supported comparator/i,
    },
    {
      label: "datetime comparator missing format",
      mutate: (fixture) => { delete comparatorAt(fixture, 2).format; },
      pattern: /datetime comparator\.format.*required/i,
    },
    {
      label: "datetime comparator missing timeZone",
      mutate: (fixture) => { delete comparatorAt(fixture, 2).timeZone; },
      pattern: /datetime comparator\.timeZone.*required/i,
    },
    {
      label: "datetime comparator extra key",
      mutate: (fixture) => { comparatorAt(fixture, 2).calendar = "gregory"; },
      pattern: /datetime comparator.*unknown.*calendar/i,
    },
    {
      label: "datetime comparator wrong format",
      mutate: (fixture) => { comparatorAt(fixture, 2).format = "RFC3339"; },
      pattern: /keys\[2\]\.comparator\.format.*ISO-8601/i,
    },
    {
      label: "datetime comparator wrong timeZone",
      mutate: (fixture) => { comparatorAt(fixture, 2).timeZone = "UTC"; },
      pattern: /keys\[2\]\.comparator\.timeZone.*offset-in-value/i,
    },
    {
      label: "datetime comparator unknown discriminator",
      mutate: (fixture) => { comparatorAt(fixture, 2).type = "timestamp"; },
      pattern: /keys\[2\]\.comparator\.type.*supported comparator/i,
    },
    {
      label: "ordered-category missing levels",
      mutate: (fixture) => { delete comparatorAt(fixture, 3).levels; },
      pattern: /ordered-category comparator\.levels.*required/i,
    },
    {
      label: "ordered-category extra key",
      mutate: (fixture) => { comparatorAt(fixture, 3).locale = "en"; },
      pattern: /ordered-category comparator.*unknown.*locale/i,
    },
    {
      label: "ordered-category levels wrong container",
      mutate: (fixture) => { comparatorAt(fixture, 3).levels = {}; },
      pattern: /keys\[3\]\.comparator\.levels.*dense plain JSON array/i,
    },
    {
      label: "ordered-category empty levels",
      mutate: (fixture) => { comparatorAt(fixture, 3).levels = []; },
      pattern: /keys\[3\]\.comparator\.levels.*nonempty/i,
    },
    {
      label: "ordered-category duplicate typed levels",
      mutate: (fixture) => {
        comparatorAt(fixture, 3).levels = [
          { type: "number", value: 2 },
          { type: "number", value: 2 },
        ];
      },
      pattern: /keys\[3\]\.comparator\.levels.*distinct/i,
    },
    {
      label: "ordered-category sparse levels",
      mutate: (fixture) => {
        const levels = new Array(2);
        levels[1] = { type: "string", value: "late" };
        comparatorAt(fixture, 3).levels = levels;
      },
      pattern: /keys\[3\]\.comparator\.levels.*dense plain JSON array/i,
    },
    {
      label: "ordered-category wrongly typed numeric identity",
      mutate: (fixture) => {
        comparatorAt(fixture, 3).levels = [{ type: "number", value: "2" }];
      },
      pattern: /levels\[0\]\.value.*finite number/i,
    },
    {
      label: "ordered-category unknown scalar discriminator",
      mutate: (fixture) => {
        comparatorAt(fixture, 3).levels = [{ type: "date", value: "2026-01-01" }];
      },
      pattern: /levels\[0\]\.type.*string.*number.*boolean/i,
    },
    {
      label: "ordered-category scalar extra key",
      mutate: (fixture) => {
        comparatorAt(fixture, 3).levels = [{ type: "string", value: "early", rank: 1 }];
      },
      pattern: /levels\[0\].*unknown.*rank/i,
    },
    {
      label: "ordered-category unknown comparator discriminator",
      mutate: (fixture) => { comparatorAt(fixture, 3).type = "ordinal"; },
      pattern: /keys\[3\]\.comparator\.type.*supported comparator/i,
    },
    {
      label: "text comparator missing locale",
      mutate: (fixture) => { delete comparatorAt(fixture, 4).locale; },
      pattern: /text comparator\.locale.*required/i,
    },
    {
      label: "text comparator missing numeric",
      mutate: (fixture) => { delete comparatorAt(fixture, 4).numeric; },
      pattern: /text comparator\.numeric.*required/i,
    },
    {
      label: "text comparator extra key",
      mutate: (fixture) => { comparatorAt(fixture, 4).caseFirst = "upper"; },
      pattern: /text comparator.*unknown.*caseFirst/i,
    },
    {
      label: "text comparator locale wrong scalar type",
      mutate: (fixture) => { comparatorAt(fixture, 4).locale = 1033; },
      pattern: /keys\[4\]\.comparator\.locale.*nonblank string/i,
    },
    {
      label: "text comparator invalid BCP-47 locale",
      mutate: (fixture) => { comparatorAt(fixture, 4).locale = "en_US"; },
      pattern: /keys\[4\]\.comparator\.locale.*BCP-47/i,
    },
    {
      label: "text comparator unknown sensitivity",
      mutate: (fixture) => { comparatorAt(fixture, 4).sensitivity = "strong"; },
      pattern: /keys\[4\]\.comparator\.sensitivity.*base.*accent.*case.*variant/i,
    },
    {
      label: "text comparator nonboolean numeric",
      mutate: (fixture) => { comparatorAt(fixture, 4).numeric = "true"; },
      pattern: /keys\[4\]\.comparator\.numeric.*boolean/i,
    },
    {
      label: "text comparator unknown discriminator",
      mutate: (fixture) => { comparatorAt(fixture, 4).type = "locale-text"; },
      pattern: /keys\[4\]\.comparator\.type.*supported comparator/i,
    },
  ]);
});

test("dataset confirmation rejects every exact-key, count, column, hash, and timestamp boundary", () => {
  const prepare = (fixture: Record<string, unknown>): void => {
    standardWindow(fixture).rowOrder = confirmationOrder();
  };
  expectStandardRejections([
    {
      label: "confirmation missing datasetSha256",
      prepare,
      mutate: (fixture) => { delete sourceConfirmation(fixture).datasetSha256; },
      pattern: /confirmation\.datasetSha256.*required/i,
    },
    {
      label: "confirmation extra field",
      prepare,
      mutate: (fixture) => { sourceConfirmation(fixture).datasetName = "inactive.csv"; },
      pattern: /confirmation.*unknown.*datasetName/i,
    },
    {
      label: "confirmation unknown kind",
      prepare,
      mutate: (fixture) => { sourceConfirmation(fixture).kind = "implicit"; },
      pattern: /confirmation\.kind.*explicit-researcher-confirmation/i,
    },
    {
      label: "confirmation wrong version",
      prepare,
      mutate: (fixture) => { sourceConfirmation(fixture).confirmationVersion = 2; },
      pattern: /confirmationVersion.*1/i,
    },
    {
      label: "confirmation negative rowCount",
      prepare,
      mutate: (fixture) => { sourceConfirmation(fixture).rowCount = -1; },
      pattern: /rowCount.*nonnegative safe integer/i,
    },
    {
      label: "confirmation fractional rowCount",
      prepare,
      mutate: (fixture) => { sourceConfirmation(fixture).rowCount = 1.5; },
      pattern: /rowCount.*nonnegative safe integer/i,
    },
    {
      label: "confirmation unsafe rowCount",
      prepare,
      mutate: (fixture) => { sourceConfirmation(fixture).rowCount = Number.MAX_SAFE_INTEGER + 1; },
      pattern: /rowCount.*nonnegative safe integer/i,
    },
    {
      label: "confirmation empty relevantColumns",
      prepare,
      mutate: (fixture) => { sourceConfirmation(fixture).relevantColumns = []; },
      pattern: /relevantColumns.*nonempty/i,
    },
    {
      label: "confirmation duplicate relevantColumns",
      prepare,
      mutate: (fixture) => { sourceConfirmation(fixture).relevantColumns = ["student", "student"]; },
      pattern: /relevantColumns.*distinct/i,
    },
    {
      label: "confirmation relevantColumns wrong container",
      prepare,
      mutate: (fixture) => { sourceConfirmation(fixture).relevantColumns = {}; },
      pattern: /relevantColumns.*dense plain JSON array/i,
    },
    {
      label: "confirmation invalid SHA",
      prepare,
      mutate: (fixture) => { sourceConfirmation(fixture).datasetSha256 = "abc"; },
      pattern: /datasetSha256.*lowercase 64-hex SHA-256/i,
    },
    {
      label: "confirmation non-Z timestamp",
      prepare,
      mutate: (fixture) => { sourceConfirmation(fixture).confirmedAt = "2026-09-02T12:34:56.000+00:00"; },
      pattern: /confirmedAt.*canonical UTC.*ending in Z/i,
    },
    {
      label: "confirmation invalid calendar date",
      prepare,
      mutate: (fixture) => { sourceConfirmation(fixture).confirmedAt = "2026-02-30T12:34:56.000Z"; },
      pattern: /confirmedAt.*canonical UTC/i,
    },
    {
      label: "confirmation malformed canonical-looking UTC",
      prepare,
      mutate: (fixture) => { sourceConfirmation(fixture).confirmedAt = "2026-09-02T25:61:61.000Z"; },
      pattern: /confirmedAt.*canonical UTC/i,
    },
  ]);
});

test("analysis and every Standard model object reject exact-key, type, discriminator, and inactive-field mutations", () => {
  expectStandardRejections([
    {
      label: "analysis wrong container",
      mutate: (fixture) => { fixture.analysis = []; },
      pattern: /analysis.*plain JSON object/i,
    },
    {
      label: "analysis missing rotation",
      mutate: (fixture) => { delete standardAnalysis(fixture).rotation; },
      pattern: /analysis\.rotation.*required/i,
    },
    {
      label: "analysis extra key",
      mutate: (fixture) => { standardAnalysis(fixture).window = "inactive"; },
      pattern: /analysis.*unknown.*window/i,
    },
    {
      label: "analysis rotation wrong container",
      mutate: (fixture) => { standardAnalysis(fixture).rotation = []; },
      pattern: /analysis\.rotation.*plain JSON object/i,
    },
    {
      label: "Endpoint missing discriminator",
      mutate: (fixture) => { delete standardModel(fixture).type; },
      pattern: /analysis\.model\.type.*EndPoint.*SeparateTrajectory.*AccumulatedTrajectory/i,
    },
    {
      label: "Endpoint inactive horizonOrder",
      mutate: (fixture) => { standardModel(fixture).horizonOrder = columnOrder(); },
      pattern: /EndPoint model.*unknown.*horizonOrder/i,
    },
    {
      label: "Endpoint wrong discriminator type",
      mutate: (fixture) => { standardModel(fixture).type = 1; },
      pattern: /analysis\.model\.type.*EndPoint.*SeparateTrajectory.*AccumulatedTrajectory/i,
    },
    {
      label: "Endpoint unknown discriminator",
      mutate: (fixture) => { standardModel(fixture).type = "Network"; },
      pattern: /analysis\.model\.type.*EndPoint.*SeparateTrajectory.*AccumulatedTrajectory/i,
    },
    {
      label: "Separate missing horizonOrder",
      prepare: (fixture) => { fixture.analysis = trajectory("SeparateTrajectory", "svd"); },
      mutate: (fixture) => { delete standardModel(fixture).horizonOrder; },
      pattern: /SeparateTrajectory model\.horizonOrder.*required/i,
    },
    {
      label: "Separate extra key",
      prepare: (fixture) => { fixture.analysis = trajectory("SeparateTrajectory", "svd"); },
      mutate: (fixture) => { standardModel(fixture).endpoint = false; },
      pattern: /SeparateTrajectory model.*unknown.*endpoint/i,
    },
    {
      label: "Separate horizonOrder wrong container",
      prepare: (fixture) => { fixture.analysis = trajectory("SeparateTrajectory", "svd"); },
      mutate: (fixture) => { standardModel(fixture).horizonOrder = []; },
      pattern: /analysis\.model\.horizonOrder.*plain JSON object/i,
    },
    {
      label: "Separate unknown discriminator",
      prepare: (fixture) => { fixture.analysis = trajectory("SeparateTrajectory", "svd"); },
      mutate: (fixture) => { standardModel(fixture).type = "SeparatePath"; },
      pattern: /analysis\.model\.type.*EndPoint.*SeparateTrajectory.*AccumulatedTrajectory/i,
    },
    {
      label: "Accumulated missing horizonOrder",
      prepare: (fixture) => { fixture.analysis = trajectory("AccumulatedTrajectory", "svd"); },
      mutate: (fixture) => { delete standardModel(fixture).horizonOrder; },
      pattern: /AccumulatedTrajectory model\.horizonOrder.*required/i,
    },
    {
      label: "Accumulated extra key",
      prepare: (fixture) => { fixture.analysis = trajectory("AccumulatedTrajectory", "svd"); },
      mutate: (fixture) => { standardModel(fixture).endpoint = false; },
      pattern: /AccumulatedTrajectory model.*unknown.*endpoint/i,
    },
    {
      label: "Accumulated horizonOrder wrong scalar",
      prepare: (fixture) => { fixture.analysis = trajectory("AccumulatedTrajectory", "svd"); },
      mutate: (fixture) => { standardModel(fixture).horizonOrder = "source"; },
      pattern: /analysis\.model\.horizonOrder.*plain JSON object/i,
    },
    {
      label: "Accumulated unknown discriminator",
      prepare: (fixture) => { fixture.analysis = trajectory("AccumulatedTrajectory", "svd"); },
      mutate: (fixture) => { standardModel(fixture).type = "AccumulatedPath"; },
      pattern: /analysis\.model\.type.*EndPoint.*SeparateTrajectory.*AccumulatedTrajectory/i,
    },
  ]);
});

test("SVD, Means, and Reference rotations reject exact-key, type, discriminator, and inactive-field mutations", () => {
  expectStandardRejections([
    {
      label: "SVD missing center flag",
      mutate: (fixture) => { delete standardRotation(fixture).centerAlignToOrigin; },
      pattern: /SVD rotation\.centerAlignToOrigin.*required/i,
    },
    {
      label: "SVD extra key",
      mutate: (fixture) => { standardRotation(fixture).contrast = {}; },
      pattern: /SVD rotation.*unknown.*contrast/i,
    },
    {
      label: "SVD center flag wrong type",
      mutate: (fixture) => { standardRotation(fixture).centerAlignToOrigin = "true"; },
      pattern: /centerAlignToOrigin.*boolean/i,
    },
    {
      label: "SVD unknown discriminator",
      mutate: (fixture) => { standardRotation(fixture).type = "varimax"; },
      pattern: /analysis\.rotation\.type.*svd.*means.*reference/i,
    },
    {
      label: "Means missing contrast",
      prepare: (fixture) => { fixture.analysis = endpointMeans(); },
      mutate: (fixture) => { delete standardRotation(fixture).contrast; },
      pattern: /Means rotation\.contrast.*required/i,
    },
    {
      label: "Means extra key",
      prepare: (fixture) => { fixture.analysis = endpointMeans(); },
      mutate: (fixture) => { standardRotation(fixture).referenceId = "inactive"; },
      pattern: /Means rotation.*unknown.*referenceId/i,
    },
    {
      label: "Means center flag wrong type",
      prepare: (fixture) => { fixture.analysis = endpointMeans(); },
      mutate: (fixture) => { standardRotation(fixture).centerAlignToOrigin = "false"; },
      pattern: /centerAlignToOrigin.*boolean/i,
    },
    {
      label: "Means contrast wrong container",
      prepare: (fixture) => { fixture.analysis = endpointMeans(); },
      mutate: (fixture) => { standardRotation(fixture).contrast = []; },
      pattern: /analysis\.rotation\.contrast.*plain JSON object/i,
    },
    {
      label: "Means contrast missing groupColumn",
      prepare: (fixture) => { fixture.analysis = endpointMeans(); },
      mutate: (fixture) => {
        delete (standardRotation(fixture).contrast as Record<string, unknown>).groupColumn;
      },
      pattern: /contrast\.groupColumn.*required/i,
    },
    {
      label: "Means contrast extra key",
      prepare: (fixture) => { fixture.analysis = endpointMeans(); },
      mutate: (fixture) => {
        (standardRotation(fixture).contrast as Record<string, unknown>).order = "negative-first";
      },
      pattern: /contrast.*unknown.*order/i,
    },
    {
      label: "Means unknown discriminator",
      prepare: (fixture) => { fixture.analysis = endpointMeans(); },
      mutate: (fixture) => { standardRotation(fixture).type = "direct-means"; },
      pattern: /analysis\.rotation\.type.*svd.*means.*reference/i,
    },
    {
      label: "Reference missing referenceId",
      prepare: (fixture) => { fixture.analysis = endpointReference(); },
      mutate: (fixture) => { delete standardRotation(fixture).referenceId; },
      pattern: /reference rotation\.referenceId.*required/i,
    },
    {
      label: "Reference inactive center flag",
      prepare: (fixture) => { fixture.analysis = endpointReference(); },
      mutate: (fixture) => { standardRotation(fixture).centerAlignToOrigin = true; },
      pattern: /reference rotation.*unknown.*centerAlignToOrigin/i,
    },
    {
      label: "Reference ID wrong scalar type",
      prepare: (fixture) => { fixture.analysis = endpointReference(); },
      mutate: (fixture) => { standardRotation(fixture).referenceId = ["published-reference-1"]; },
      pattern: /referenceId.*nonblank string/i,
    },
    {
      label: "Reference unknown discriminator",
      prepare: (fixture) => { fixture.analysis = endpointReference(); },
      mutate: (fixture) => { standardRotation(fixture).type = "reuse"; },
      pattern: /analysis\.rotation\.type.*svd.*means.*reference/i,
    },
  ]);
});

test("ONA valid matrix executes finite and infinite backward extents plus both row-order branches", () => {
  const finiteColumns = onaFixture();
  const decodedFinite = decodeCanonicalOnaConfigV3(finiteColumns);
  assert.deepEqual(decodedFinite.window.backward, { kind: "finite", value: 2 });
  assert.equal(decodedFinite.window.rowOrder.kind, "columns");
  assert.notEqual(decodedFinite, finiteColumns);
  assert.notEqual(decodedFinite.window, finiteColumns.window);

  const infinityConfirmed = onaFixture();
  const window = infinityConfirmed.window as Record<string, unknown>;
  window.backward = { kind: "infinity" };
  window.rowOrder = confirmationOrder();
  const decodedInfinity = decodeCanonicalOnaConfigV3(infinityConfirmed);
  assert.deepEqual(decodedInfinity.window.backward, { kind: "infinity" });
  assert.equal(decodedInfinity.window.rowOrder.kind, "source-order-confirmed");
  assert.deepEqual(decodedInfinity, infinityConfirmed);
  assert.notEqual(decodedInfinity, infinityConfirmed);
  assert.notEqual(decodedInfinity.window.rowOrder, window.rowOrder);
});

test("ONA root, model, weighting, window, and rotation reject systematic exact-branch mutations", () => {
  expectOnaRejections([
    {
      label: "ONA root missing mask",
      mutate: (fixture) => { delete fixture.directionalMask; },
      pattern: /ONA config\.directionalMask.*required/i,
    },
    {
      label: "ONA root extra Standard analysis",
      mutate: (fixture) => { fixture.analysis = endpointSvd(); },
      pattern: /ONA config.*unknown.*analysis/i,
    },
    {
      label: "ONA schema wrong type",
      mutate: (fixture) => { fixture.schemaVersion = "3"; },
      pattern: /ONA config\.schemaVersion.*3/i,
    },
    {
      label: "ONA family unknown discriminator",
      mutate: (fixture) => { fixture.analysisFamily = "ordered"; },
      pattern: /ONA config\.analysisFamily.*ona/i,
    },
    {
      label: "ONA model wrong container",
      mutate: (fixture) => { fixture.model = []; },
      pattern: /ONA model.*plain JSON object/i,
    },
    {
      label: "ONA model missing type",
      mutate: (fixture) => { delete (fixture.model as Record<string, unknown>).type; },
      pattern: /ONA model\.type.*EndPoint/i,
    },
    {
      label: "ONA model inactive horizonOrder",
      mutate: (fixture) => { (fixture.model as Record<string, unknown>).horizonOrder = columnOrder(); },
      pattern: /ONA model.*unknown.*horizonOrder/i,
    },
    {
      label: "ONA model wrong discriminator type",
      mutate: (fixture) => { (fixture.model as Record<string, unknown>).type = 1; },
      pattern: /ONA model\.type.*EndPoint/i,
    },
    {
      label: "ONA model unknown discriminator",
      mutate: (fixture) => { (fixture.model as Record<string, unknown>).type = "SeparateTrajectory"; },
      pattern: /ONA model\.type.*EndPoint/i,
    },
    {
      label: "ONA weighting wrong container",
      mutate: (fixture) => { fixture.weighting = []; },
      pattern: /ONA weighting.*plain JSON object/i,
    },
    {
      label: "ONA weighting missing engineMethod",
      mutate: (fixture) => { delete (fixture.weighting as Record<string, unknown>).engineMethod; },
      pattern: /ONA weighting\.engineMethod.*required/i,
    },
    {
      label: "ONA weighting extra key",
      mutate: (fixture) => { (fixture.weighting as Record<string, unknown>).normalization = "none"; },
      pattern: /ONA weighting.*unknown.*normalization/i,
    },
    {
      label: "ONA weighting Binary discriminator",
      mutate: (fixture) => { (fixture.weighting as Record<string, unknown>).type = "binary"; },
      pattern: /ONA weighting\.type.*frequency/i,
    },
    {
      label: "ONA weighting wrong engine method",
      mutate: (fixture) => { (fixture.weighting as Record<string, unknown>).engineMethod = "binary"; },
      pattern: /ONA weighting\.engineMethod.*sum/i,
    },
    {
      label: "ONA window wrong container",
      mutate: (fixture) => { fixture.window = []; },
      pattern: /ONA window.*plain JSON object/i,
    },
    {
      label: "ONA window missing backward",
      mutate: (fixture) => { delete (fixture.window as Record<string, unknown>).backward; },
      pattern: /ONA window\.backward.*required/i,
    },
    {
      label: "ONA window extra key",
      mutate: (fixture) => { (fixture.window as Record<string, unknown>).conversation = true; },
      pattern: /ONA window.*unknown.*conversation/i,
    },
    {
      label: "ONA window Conversation discriminator",
      mutate: (fixture) => { (fixture.window as Record<string, unknown>).type = "Conversation"; },
      pattern: /ONA window\.type.*MovingStanzaWindow/i,
    },
    {
      label: "ONA window forward inactive tagged extent",
      mutate: (fixture) => { (fixture.window as Record<string, unknown>).forward = { kind: "finite", value: 0 }; },
      pattern: /ONA window\.forward.*0/i,
    },
    {
      label: "ONA window nonzero forward",
      mutate: (fixture) => { (fixture.window as Record<string, unknown>).forward = 1; },
      pattern: /ONA window\.forward.*0/i,
    },
    {
      label: "ONA rotation wrong container",
      mutate: (fixture) => { fixture.rotation = []; },
      pattern: /ONA rotation.*plain JSON object/i,
    },
    {
      label: "ONA rotation missing center flag",
      mutate: (fixture) => { delete (fixture.rotation as Record<string, unknown>).centerAlignToOrigin; },
      pattern: /ONA rotation\.centerAlignToOrigin.*required/i,
    },
    {
      label: "ONA rotation extra key",
      mutate: (fixture) => { (fixture.rotation as Record<string, unknown>).contrast = {}; },
      pattern: /ONA rotation.*unknown.*contrast/i,
    },
    {
      label: "ONA rotation Reference discriminator",
      mutate: (fixture) => { (fixture.rotation as Record<string, unknown>).type = "reference"; },
      pattern: /ONA rotation\.type.*svd/i,
    },
    {
      label: "ONA rotation non-centered SVD",
      mutate: (fixture) => { (fixture.rotation as Record<string, unknown>).centerAlignToOrigin = false; },
      pattern: /ONA rotation\.centerAlignToOrigin.*true/i,
    },
  ]);

  assert.throws(() => decodeCanonicalOnaConfigV3([]), /ONA config.*plain JSON object/i);
});

test("ONA directional mask rejects schema, exact-key, code-order, density, dimension, and cell mutations", () => {
  expectOnaRejections([
    {
      label: "mask wrong container",
      mutate: (fixture) => { fixture.directionalMask = []; },
      pattern: /directionalMask.*plain JSON object/i,
    },
    {
      label: "mask wrong schemaVersion",
      mutate: (fixture) => { (fixture.directionalMask as Record<string, unknown>).schemaVersion = 2; },
      pattern: /directionalMask\.schemaVersion.*1/i,
    },
    {
      label: "mask missing enabled",
      mutate: (fixture) => { delete (fixture.directionalMask as Record<string, unknown>).enabled; },
      pattern: /directionalMask\.enabled.*required/i,
    },
    {
      label: "mask extra key",
      mutate: (fixture) => { (fixture.directionalMask as Record<string, unknown>).symmetric = false; },
      pattern: /directionalMask.*unknown.*symmetric/i,
    },
    {
      label: "mask blank codeOrder",
      mutate: (fixture) => {
        ((fixture.directionalMask as Record<string, unknown>).codeOrder as string[])[0] = " ";
      },
      pattern: /directionalMask\.codeOrder\[0\].*nonblank string/i,
    },
    {
      label: "mask duplicate codeOrder",
      mutate: (fixture) => {
        (fixture.directionalMask as Record<string, unknown>).codeOrder = ["ask", "ask", "challenge"];
      },
      pattern: /directionalMask\.codeOrder.*distinct/i,
    },
    {
      label: "mask wrong codeOrder",
      mutate: (fixture) => {
        (fixture.directionalMask as Record<string, unknown>).codeOrder = ["explain", "ask", "challenge"];
      },
      pattern: /directionalMask\.codeOrder.*canonical Code columns.*declared order/i,
    },
    {
      label: "mask sparse codeOrder",
      mutate: (fixture) => {
        const order = new Array(3);
        order[0] = "ask";
        order[2] = "challenge";
        (fixture.directionalMask as Record<string, unknown>).codeOrder = order;
      },
      pattern: /directionalMask\.codeOrder.*dense plain JSON array/i,
    },
    {
      label: "mask codeOrder extra array property",
      mutate: (fixture) => {
        const order = (fixture.directionalMask as Record<string, unknown>).codeOrder as string[] & { note?: string };
        order.note = "extra";
      },
      pattern: /directionalMask\.codeOrder.*dense plain JSON array.*extra properties/i,
    },
    {
      label: "mask sparse outer enabled rows",
      mutate: (fixture) => {
        const rows = new Array(3);
        rows[0] = [true, false, true];
        rows[2] = [false, true, true];
        (fixture.directionalMask as Record<string, unknown>).enabled = rows;
      },
      pattern: /directionalMask\.enabled.*dense plain JSON array/i,
    },
    {
      label: "mask sparse inner enabled cells",
      mutate: (fixture) => {
        const cells = new Array(3);
        cells[0] = true;
        cells[2] = false;
        const rows = (fixture.directionalMask as Record<string, unknown>).enabled as unknown[][];
        rows[1] = cells;
      },
      pattern: /directionalMask\.enabled\[1\].*dense plain JSON array/i,
    },
    {
      label: "mask ragged row",
      mutate: (fixture) => {
        const rows = (fixture.directionalMask as Record<string, unknown>).enabled as unknown[][];
        rows[1] = [true, false];
      },
      pattern: /directionalMask\.enabled.*square matrix/i,
    },
    {
      label: "mask nonsquare outer dimensions",
      mutate: (fixture) => {
        const rows = (fixture.directionalMask as Record<string, unknown>).enabled as unknown[][];
        rows.push([true, true, true]);
      },
      pattern: /directionalMask\.enabled.*square matrix/i,
    },
    {
      label: "mask nonboolean cell",
      mutate: (fixture) => {
        const rows = (fixture.directionalMask as Record<string, unknown>).enabled as unknown[][];
        rows[0][0] = 1;
      },
      pattern: /directionalMask\.enabled\[0\]\[0\].*boolean/i,
    },
    {
      label: "mask outer enabled array extra property",
      mutate: (fixture) => {
        const rows = (fixture.directionalMask as Record<string, unknown>).enabled as unknown[][] & { square?: boolean };
        rows.square = true;
      },
      pattern: /directionalMask\.enabled.*dense plain JSON array.*extra properties/i,
    },
    {
      label: "mask inner row extra property",
      mutate: (fixture) => {
        const rows = (fixture.directionalMask as Record<string, unknown>).enabled as Array<unknown[] & { row?: number }>;
        rows[0].row = 0;
      },
      pattern: /directionalMask\.enabled\[0\].*dense plain JSON array.*extra properties/i,
    },
  ]);
});

test("Standard decoding snapshots nested object and array Proxies without invoking get", () => {
  const objectFixture = standardFixture();
  let objectGets = 0;
  objectFixture.units = new Proxy(objectFixture.units as Record<string, unknown>, {
    get() {
      objectGets += 1;
      throw new Error("object Proxy get must not run");
    },
  });
  const objectDecoded = decodeCanonicalStandardConfigV3(objectFixture);
  assert.deepEqual(objectDecoded.units, {
    columns: ["student", "team"],
    group: { type: "stable-metadata", column: "condition" },
  });
  assert.equal(objectGets, 0);

  const arrayFixture = standardFixture();
  let arrayGets = 0;
  arrayFixture.codes = new Proxy(arrayFixture.codes as unknown[], {
    get() {
      arrayGets += 1;
      throw new Error("array Proxy get must not run");
    },
  });
  const arrayDecoded = decodeCanonicalStandardConfigV3(arrayFixture);
  assert.deepEqual(arrayDecoded.codes.map((code) => code.column), ["ask", "explain", "challenge"]);
  assert.equal(arrayGets, 0);
});

test("ONA decoding snapshots nested array Proxies without invoking get", () => {
  const fixture = onaFixture();
  const mask = fixture.directionalMask as Record<string, unknown>;
  let gets = 0;
  mask.codeOrder = new Proxy(mask.codeOrder as string[], {
    get() {
      gets += 1;
      throw new Error("ONA array Proxy get must not run");
    },
  });

  const decoded = decodeCanonicalOnaConfigV3(fixture);
  assert.deepEqual(decoded.directionalMask.codeOrder, ["ask", "explain", "challenge"]);
  assert.equal(gets, 0);
});

test("decoder rejects descriptor/get TOCTOU disagreement using captured descriptors only", () => {
  const target = standardFixture();
  target.analysisFamily = "ona";
  let gets = 0;
  const misleading = new Proxy(target, {
    get(original, key, receiver) {
      gets += 1;
      if (key === "analysisFamily") return "standard";
      return Reflect.get(original, key, receiver);
    },
  });

  assert.throws(
    () => decodeCanonicalStandardConfigV3(misleading),
    /analysisFamily.*standard/i,
  );
  assert.equal(gets, 0);
});

test("text comparator accepts only supplied locales already in canonical BCP-47 spelling", () => {
  const valid = standardFixture();
  comparatorAt(valid, 4).locale = "en-US";
  const decoded = decodeCanonicalStandardConfigV3(valid);
  assert.equal(decoded.window.type, "MovingStanzaWindow");
  if (decoded.window.type === "MovingStanzaWindow" && decoded.window.rowOrder.kind === "columns") {
    const comparator = decoded.window.rowOrder.keys[4].comparator;
    assert.equal(comparator.type, "text");
    if (comparator.type === "text") assert.equal(comparator.locale, "en-US");
  }

  for (const locale of ["EN-us", "iw", "en-US-u-kn-true-ca-gregory"]) {
    const fixture = standardFixture();
    comparatorAt(fixture, 4).locale = locale;
    assert.throws(
      () => decodeCanonicalStandardConfigV3(fixture),
      /locale.*canonical BCP-47/i,
      locale,
    );
  }
});

test("strict array validation remains descriptor-snapshot based and linear per array", () => {
  const schemaSource = readFileSync(
    new URL("../lib/open-ena/model-v3/schema.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(schemaSource, /keys\.includes\s*\(/u);

  const size = 128;
  const fixture = onaFixture();
  fixture.codes = Array.from({ length: size }, (_, index) => ({
    column: `code-${index}`,
    displayLabel: `Code ${index}`,
  }));
  fixture.directionalMask = {
    schemaVersion: 1,
    codeOrder: Array.from({ length: size }, (_, index) => `code-${index}`),
    enabled: Array.from({ length: size }, (_, row) => (
      Array.from({ length: size }, (_, column) => row === column)
    )),
  };

  const decoded = decodeCanonicalOnaConfigV3(fixture);
  assert.equal(decoded.directionalMask.codeOrder.length, size);
  assert.equal(decoded.directionalMask.enabled.length, size);
  assert.equal(decoded.directionalMask.enabled[0].length, size);
  assert.equal(decoded.directionalMask.enabled[size - 1][size - 1], true);
  assert.notEqual(decoded.directionalMask.enabled, (fixture.directionalMask as { enabled: boolean[][] }).enabled);
});
