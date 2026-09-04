import assert from "node:assert/strict";
import test from "node:test";
import type { Row } from "jena-js";
import {
  buildCanonicalCodeEntriesV3,
  buildCodeRepresentationBindingsV3,
  buildStandardCodeDictionaryV3,
  materializeStandardCodesV3,
} from "../lib/open-ena/model-v3/standard-adapter";
import type { CanonicalCodeV3 } from "../lib/open-ena/model-v3/types";

const binary = { type: "binary" } as const;
const frequency = { type: "frequency" } as const;

function codeDefinitions(columns: readonly string[]): CanonicalCodeV3[] {
  return columns.map((column) => ({ column, displayLabel: `Display ${column}` }));
}

test("Code entries use locale-independent UTF-8 byte ordering", () => {
  const columns = ["\u{10000}", "\uE000", "Å", "A"];
  const forward = buildCanonicalCodeEntriesV3(codeDefinitions(columns));
  const reverse = buildCanonicalCodeEntriesV3(codeDefinitions([...columns].reverse()));
  const expected = ["A", "Å", "\uE000", "\u{10000}"];

  assert.deepEqual(forward.map((entry) => entry.sourceColumn), expected);
  assert.deepEqual(reverse, forward);
  assert.deepEqual(
    forward.map((entry) => entry.token),
    [
      "__open_ena_code_v3_000",
      "__open_ena_code_v3_001",
      "__open_ena_code_v3_002",
      "__open_ena_code_v3_003",
    ],
  );
});

test("duplicate source columns fail before display-label inspection or ordering", () => {
  let displayGetterCalls = 0;
  const hostileDuplicate = { column: "A" } as CanonicalCodeV3;
  Object.defineProperty(hostileDuplicate, "displayLabel", {
    enumerable: true,
    get() {
      displayGetterCalls += 1;
      return "must not be read";
    },
  });

  assert.throws(
    () => buildCanonicalCodeEntriesV3([
      { column: "A", displayLabel: "First A" },
      hostileDuplicate,
      { column: "B", displayLabel: "B" },
    ]),
    /distinct source columns/i,
  );
  assert.equal(displayGetterCalls, 0);
});

test("Code definitions must be dense plain data and never invoke accessors", () => {
  const sparse = [
    { column: "A", displayLabel: "A" },
    ,
    { column: "C", displayLabel: "C" },
  ] as unknown as CanonicalCodeV3[];
  assert.throws(() => buildStandardCodeDictionaryV3(sparse), /dense plain JSON array/i);

  let columnGetterCalls = 0;
  const accessor = { displayLabel: "A" } as CanonicalCodeV3;
  Object.defineProperty(accessor, "column", {
    enumerable: true,
    get() {
      columnGetterCalls += 1;
      return "A";
    },
  });
  assert.throws(
    () => buildStandardCodeDictionaryV3([
      accessor,
      { column: "B", displayLabel: "B" },
      { column: "C", displayLabel: "C" },
    ]),
    /data property|accessor/i,
  );
  assert.equal(columnGetterCalls, 0);
});

test("reserved and internal-token-like labels restore exact source, display, and canonical identities", () => {
  const definitions: CanonicalCodeV3[] = [
    { column: "A & B", displayLabel: "A & B display" },
    { column: "SVD1", displayLabel: "SVD1" },
    { column: "MR1", displayLabel: "MR1" },
    { column: "__open_ena_code_v3_000", displayLabel: "__open_ena_edge_v3_000_001" },
  ];
  const dictionary = buildStandardCodeDictionaryV3(definitions);

  assert.equal(new Set(dictionary.codes.map((entry) => entry.token)).size, 4);
  assert.equal(new Set(dictionary.edges.map((entry) => entry.token)).size, 6);
  assert.equal(
    dictionary.codes.some((code) => dictionary.edges.some((edge) => edge.token === code.token)),
    false,
  );
  assert.deepEqual(
    dictionary.codes.map(({ sourceColumn, displayLabel, canonicalIdentity }) => ({
      sourceColumn,
      displayLabel,
      canonicalIdentity,
    })),
    [
      { sourceColumn: "A & B", displayLabel: "A & B display", canonicalIdentity: "A & B" },
      { sourceColumn: "MR1", displayLabel: "MR1", canonicalIdentity: "MR1" },
      { sourceColumn: "SVD1", displayLabel: "SVD1", canonicalIdentity: "SVD1" },
      {
        sourceColumn: "__open_ena_code_v3_000",
        displayLabel: "__open_ena_edge_v3_000_001",
        canonicalIdentity: "__open_ena_code_v3_000",
      },
    ],
  );
  assert.deepEqual(dictionary.edges, [
    {
      token: "__open_ena_edge_v3_000_001",
      sourceCodeIdentity: "A & B",
      targetCodeIdentity: "MR1",
    },
    {
      token: "__open_ena_edge_v3_000_002",
      sourceCodeIdentity: "A & B",
      targetCodeIdentity: "SVD1",
    },
    {
      token: "__open_ena_edge_v3_001_002",
      sourceCodeIdentity: "MR1",
      targetCodeIdentity: "SVD1",
    },
    {
      token: "__open_ena_edge_v3_000_003",
      sourceCodeIdentity: "A & B",
      targetCodeIdentity: "__open_ena_code_v3_000",
    },
    {
      token: "__open_ena_edge_v3_001_003",
      sourceCodeIdentity: "MR1",
      targetCodeIdentity: "__open_ena_code_v3_000",
    },
    {
      token: "__open_ena_edge_v3_002_003",
      sourceCodeIdentity: "SVD1",
      targetCodeIdentity: "__open_ena_code_v3_000",
    },
  ]);
});

test("dictionary construction preserves valid Unicode labels exactly", () => {
  const definitions: CanonicalCodeV3[] = [
    { column: "修订", displayLabel: "修订 🧭" },
    { column: "café", displayLabel: "café" },
    { column: "cafe\u0301", displayLabel: "cafe\u0301" },
  ];
  const dictionary = buildStandardCodeDictionaryV3(definitions);

  for (const definition of definitions) {
    const restored = dictionary.codes.find((entry) => entry.sourceColumn === definition.column);
    assert.equal(restored?.displayLabel, definition.displayLabel);
    assert.equal(restored?.canonicalIdentity, definition.column);
  }
});

test("Binary materialization maps Booleans and numeric 0/1 explicitly", () => {
  const dictionary = buildStandardCodeDictionaryV3(codeDefinitions(["A", "B", "C", "D"]));
  const row = materializeStandardCodesV3(
    { A: true, B: false, C: 1, D: 0 },
    binary,
    dictionary,
  );

  assert.deepEqual(row, {
    __open_ena_code_v3_000: 1,
    __open_ena_code_v3_001: 0,
    __open_ena_code_v3_002: 1,
    __open_ena_code_v3_003: 0,
  });
});

test("Binary accepts negative zero only as canonical numeric zero", () => {
  const dictionary = buildStandardCodeDictionaryV3(codeDefinitions(["A", "B", "C"]));
  const row = materializeStandardCodesV3({ A: -0, B: 1, C: 0 }, binary, dictionary);

  assert.equal(row.__open_ena_code_v3_000, 0);
  assert.equal(Object.is(row.__open_ena_code_v3_000, -0), false);
});

test("Binary rejects every non-explicit representation without coercion", () => {
  const dictionary = buildStandardCodeDictionaryV3(codeDefinitions(["A", "B", "C"]));
  const invalidValues = ["1", "yes", null, undefined, 0.5, 2, -1, Number.NaN, Infinity, -Infinity, {}, []];

  for (const value of invalidValues) {
    assert.throws(
      () => materializeStandardCodesV3({ A: value, B: 0, C: 1 } as never, binary, dictionary),
      /Binary Code.*A.*0\/1 or Boolean/i,
      `unexpectedly accepted ${String(value)}`,
    );
  }
  assert.throws(
    () => materializeStandardCodesV3({ B: 0, C: 1 } as never, binary, dictionary),
    /Binary Code.*A.*missing/i,
  );
});

test("Frequency preserves finite non-negative decimals and canonicalizes negative zero", () => {
  const dictionary = buildStandardCodeDictionaryV3(codeDefinitions(["A", "B", "C"]));
  const row = materializeStandardCodesV3({ A: 0.25, B: 2, C: -0 }, frequency, dictionary);

  assert.equal(row.__open_ena_code_v3_000, 0.25);
  assert.equal(row.__open_ena_code_v3_001, 2);
  assert.equal(row.__open_ena_code_v3_002, 0);
  assert.equal(Object.is(row.__open_ena_code_v3_002, -0), false);
});

test("Frequency rejects strings, Booleans, missing, negative, and non-finite values", () => {
  const dictionary = buildStandardCodeDictionaryV3(codeDefinitions(["A", "B", "C"]));
  const invalidValues = ["0.25", true, false, null, undefined, -1, Number.NaN, Infinity, -Infinity, {}, []];

  for (const value of invalidValues) {
    assert.throws(
      () => materializeStandardCodesV3({ A: value, B: 2, C: 0 } as never, frequency, dictionary),
      /Frequency Code.*A.*finite non-negative number/i,
      `unexpectedly accepted ${String(value)}`,
    );
  }
  assert.throws(
    () => materializeStandardCodesV3({ B: 2, C: 0 } as never, frequency, dictionary),
    /Frequency Code.*A.*missing/i,
  );
});

test("row access requires own enumerable data properties and never invokes getters", () => {
  const dictionary = buildStandardCodeDictionaryV3(codeDefinitions(["A", "B", "C"]));
  let getterCalls = 0;
  const accessor = { B: 0, C: 1 } as unknown as Row;
  Object.defineProperty(accessor, "A", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 1;
    },
  });
  assert.throws(
    () => materializeStandardCodesV3(accessor, binary, dictionary),
    /Binary Code.*A.*data property|accessor/i,
  );
  assert.equal(getterCalls, 0);

  const inherited = Object.create({ A: 1 }) as Row;
  Object.assign(inherited, { B: 0, C: 1 });
  assert.throws(
    () => materializeStandardCodesV3(inherited, binary, dictionary),
    /plain row|own data property|missing/i,
  );
});

test("materialization validates weighting through data descriptors without invoking accessors", () => {
  const dictionary = buildStandardCodeDictionaryV3(codeDefinitions(["A", "B", "C"]));
  let getterCalls = 0;
  const hostileWeighting = {} as { type: "binary" };
  Object.defineProperty(hostileWeighting, "type", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "binary";
    },
  });

  assert.throws(
    () => materializeStandardCodesV3({ A: 1, B: 0, C: 1 }, hostileWeighting, dictionary),
    /weighting.*data property|accessor/i,
  );
  assert.equal(getterCalls, 0);
});

test("Binary representation bindings record exactly one representation per Code", () => {
  const dictionary = buildStandardCodeDictionaryV3(codeDefinitions(["A", "B", "C"]));
  const bindings = buildCodeRepresentationBindingsV3(
    [
      { A: 0, B: false, C: 1 },
      { A: 1, B: true, C: 0 },
    ],
    binary,
    dictionary,
  );

  assert.deepEqual(bindings, [
    {
      runtimeToken: "__open_ena_code_v3_000",
      sourceColumn: "A",
      sourceRepresentation: "numeric-binary",
      runtimeRepresentation: "number",
    },
    {
      runtimeToken: "__open_ena_code_v3_001",
      sourceColumn: "B",
      sourceRepresentation: "boolean-binary",
      runtimeRepresentation: "number",
    },
    {
      runtimeToken: "__open_ena_code_v3_002",
      sourceColumn: "C",
      sourceRepresentation: "numeric-binary",
      runtimeRepresentation: "number",
    },
  ]);
});

test("Binary representation bindings reject mixed Boolean and numeric values within a Code", () => {
  const dictionary = buildStandardCodeDictionaryV3(codeDefinitions(["A", "B", "C"]));

  assert.throws(
    () => buildCodeRepresentationBindingsV3(
      [
        { A: 0, B: false, C: 1 },
        { A: true, B: true, C: 0 },
      ],
      binary,
      dictionary,
    ),
    /Binary Code.*A.*mixed.*numeric.*Boolean/i,
  );
});

test("Frequency representation bindings record frequency source and numeric runtime", () => {
  const dictionary = buildStandardCodeDictionaryV3(codeDefinitions(["A", "B", "C"]));
  const bindings = buildCodeRepresentationBindingsV3(
    [
      { A: 0.25, B: 2, C: 0 },
      { A: 1.5, B: 0, C: 4 },
    ],
    frequency,
    dictionary,
  );

  assert.deepEqual(bindings.map((binding) => binding.sourceRepresentation), [
    "frequency",
    "frequency",
    "frequency",
  ]);
  assert.equal(bindings.every((binding) => binding.runtimeRepresentation === "number"), true);
});

test("representation binding validates every value and rejects empty or sparse row arrays", () => {
  const dictionary = buildStandardCodeDictionaryV3(codeDefinitions(["A", "B", "C"]));
  assert.throws(
    () => buildCodeRepresentationBindingsV3([], binary, dictionary),
    /at least one row/i,
  );

  const sparse = [
    { A: 0, B: 0, C: 1 },
    ,
    { A: 1, B: 1, C: 0 },
  ] as unknown as Row[];
  assert.throws(
    () => buildCodeRepresentationBindingsV3(sparse, binary, dictionary),
    /dense plain JSON array/i,
  );

  assert.throws(
    () => buildCodeRepresentationBindingsV3(
      [
        { A: 0, B: 0, C: 1 },
        { A: 2, B: 1, C: 0 },
      ],
      binary,
      dictionary,
    ),
    /Binary Code.*A.*0\/1 or Boolean/i,
  );
});

test("representation binding rejects selected accessors without invoking them", () => {
  const dictionary = buildStandardCodeDictionaryV3(codeDefinitions(["A", "B", "C"]));
  let getterCalls = 0;
  const hostile = { B: 0, C: 1 } as unknown as Row;
  Object.defineProperty(hostile, "A", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 1;
    },
  });

  assert.throws(
    () => buildCodeRepresentationBindingsV3([hostile], binary, dictionary),
    /Binary Code.*A.*data property|accessor/i,
  );
  assert.equal(getterCalls, 0);
});

test("dictionaries, materialized rows, and representation bindings are deeply immutable", () => {
  const dictionary = buildStandardCodeDictionaryV3(codeDefinitions(["A", "B", "C"]));
  const row = materializeStandardCodesV3({ A: 0, B: 1, C: 0 }, binary, dictionary);
  const bindings = buildCodeRepresentationBindingsV3([{ A: 0, B: 1, C: 0 }], binary, dictionary);

  assert.equal(Object.isFrozen(dictionary), true);
  assert.equal(Object.isFrozen(dictionary.codes), true);
  assert.equal(Object.isFrozen(dictionary.codes[0]), true);
  assert.equal(Object.isFrozen(dictionary.edges), true);
  assert.equal(Object.isFrozen(dictionary.edges[0]), true);
  assert.equal(Object.isFrozen(row), true);
  assert.equal(Object.isFrozen(bindings), true);
  assert.equal(Object.isFrozen(bindings[0]), true);
  assert.throws(() => {
    (dictionary.codes[0] as { token: string }).token = "tampered";
  }, TypeError);
  assert.throws(() => {
    (row as Record<string, number>).__open_ena_code_v3_000 = 99;
  }, TypeError);
  assert.throws(() => {
    (bindings[0] as { sourceColumn: string }).sourceColumn = "tampered";
  }, TypeError);
});
