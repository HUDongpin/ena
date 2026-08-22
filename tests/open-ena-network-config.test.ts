import assert from "node:assert/strict";
import test from "node:test";
import type { Row } from "jena-js";
import { parseCsv, validateConfig } from "../lib/open-ena/csv";
import {
  analysisKindFor,
  canonicalizeOpenEnaConfig,
  cloneDirectionalMask,
  cloneOpenEnaConfig,
  createDirectionalMask,
  deserializeOpenEnaConfig,
  networkTypeFor,
  orderRowsForOpenEna,
  reconcileDirectionalMask,
  sameOpenEnaConfig,
  serializeOpenEnaConfig,
  stableOpenEnaConfigJson,
  validateDirectionalMask,
} from "../lib/open-ena/network-config";
import {
  SAMPLE_CONFIG,
  sameOpenEnaConfig as sameOpenEnaConfigFromTypes,
  type OpenEnaConfig,
  type OpenEnaOrderComparator,
  type OpenEnaOrderPolicy,
  type ParsedDataset,
  type PortableOpenEnaConfig,
} from "../lib/open-ena/types";

const columnOrder = (
  columns: string[],
  comparator: OpenEnaOrderComparator = "number",
): OpenEnaOrderPolicy => ({
  kind: "columns",
  columns,
  comparators: Object.fromEntries(columns.map((column) => [column, comparator])),
});

function orderedConfig(overrides: Partial<OpenEnaConfig> = {}): OpenEnaConfig {
  const codes = overrides.codes ?? ["A", "B", "C"];
  return {
    ...SAMPLE_CONFIG,
    analysisKind: "ona",
    unitColumns: ["unit"],
    conversationColumns: ["horizon"],
    groupColumn: null,
    codes,
    model: "EndPoint",
    window: "MovingStanzaWindow",
    windowSizeBack: 2,
    windowSizeForward: 0,
    weightBy: "sum",
    rotation: "svd",
    referenceRotationId: null,
    orderPolicy: columnOrder(["turn"]),
    directionalMask: createDirectionalMask(codes),
    ...overrides,
  };
}

function manualDataset(rows: Row[], headers = ["unit", "horizon", "turn", "A", "B", "C"]): ParsedDataset {
  return {
    name: "typed-order.csv",
    headers,
    rows,
    sizeBytes: 0,
    source: "upload",
  };
}

test("legacy configs canonicalize only to ENA and compare equal to explicit ENA", () => {
  const legacy = { ...SAMPLE_CONFIG };
  delete (legacy as Partial<OpenEnaConfig>).analysisKind;
  const explicit = { ...SAMPLE_CONFIG, analysisKind: "ena" as const };
  const ordered = orderedConfig();

  assert.equal(analysisKindFor(legacy), "ena");
  assert.equal(SAMPLE_CONFIG.analysisKind, "ena");
  assert.equal(networkTypeFor(legacy), "standard");
  assert.equal(networkTypeFor(ordered), "ordered");
  assert.equal(sameOpenEnaConfig(legacy, explicit), true);
  assert.equal(sameOpenEnaConfig(legacy, ordered), false);
  assert.deepEqual(canonicalizeOpenEnaConfig(legacy), {
    ...SAMPLE_CONFIG,
    analysisKind: "ena",
    orderPolicy: null,
    directionalMask: null,
  });
  assert.equal("analysisKind" in legacy, false, "canonicalization must not mutate a legacy caller");
});

test("the legacy types export routes configuration identity through the central contract", () => {
  const left = orderedConfig();
  const right = cloneOpenEnaConfig(left);
  right.directionalMask!.enabled[0][0] = false;
  assert.equal(sameOpenEnaConfigFromTypes(left, right), false);
  assert.equal(sameOpenEnaConfigFromTypes, sameOpenEnaConfig);
});

test("canonical clone and equality include the full order and directional-mask identity", () => {
  const original = orderedConfig();
  const clone = cloneOpenEnaConfig(original);
  const canonical = canonicalizeOpenEnaConfig(original);
  const roundTrip = JSON.parse(JSON.stringify(canonical)) as OpenEnaConfig;

  assert.deepEqual(clone, canonical);
  assert.deepEqual(roundTrip, canonical);
  assert.equal(sameOpenEnaConfig(original, roundTrip), true);
  assert.notEqual(clone.codes, original.codes);
  assert.notEqual(clone.orderPolicy, original.orderPolicy);
  assert.notEqual(clone.directionalMask, original.directionalMask);
  assert.notEqual(clone.directionalMask?.enabled, original.directionalMask?.enabled);

  clone.orderPolicy = columnOrder(["different"]);
  assert.equal(sameOpenEnaConfig(original, clone), false);
  const changedMask = cloneOpenEnaConfig(original);
  changedMask.directionalMask!.enabled[0][0] = false;
  assert.equal(sameOpenEnaConfig(original, changedMask), false);
  assert.equal(original.directionalMask!.enabled[0][0], true, "deep cloning must protect the caller");
});

test("portable ONA configuration preserves an infinite backward window without JSON null coercion", () => {
  const original = orderedConfig({ windowSizeBack: Number.POSITIVE_INFINITY });
  const portable = serializeOpenEnaConfig(original);
  const json = stableOpenEnaConfigJson(original);
  const parsed = deserializeOpenEnaConfig(JSON.parse(json) as PortableOpenEnaConfig);

  assert.equal(portable.windowSizeBack, "Infinity");
  assert.match(json, /"windowSizeBack":"Infinity"/);
  assert.doesNotMatch(json, /"windowSizeBack":null/);
  assert.equal(parsed.windowSizeBack, Number.POSITIVE_INFINITY);
  assert.equal(sameOpenEnaConfig(original, parsed), true);
  assert.throws(
    () => deserializeOpenEnaConfig({
      ...portable,
      windowSizeBack: null,
    } as unknown as PortableOpenEnaConfig),
    /finite number.*Infinity|Infinity.*finite number/i,
  );
});

test("directional masks are full label-bound p by p matrices including the diagonal", () => {
  const mask = createDirectionalMask(["A", "B"]);
  assert.deepEqual(mask, {
    schemaVersion: 1,
    codeOrder: ["A", "B"],
    enabled: [[true, true], [true, true]],
  });
  assert.deepEqual(validateDirectionalMask(mask, ["A", "B"]), []);

  mask.enabled[0][1] = false; // A -> B
  const reconciled = reconcileDirectionalMask(mask, ["B", "C", "A"]);
  assert.deepEqual(reconciled.enabled, [
    [true, true, true],
    [true, true, true],
    [false, true, true],
  ]);
  const clone = cloneDirectionalMask(reconciled);
  clone.enabled[2][0] = true;
  assert.equal(reconciled.enabled[2][0], false);
});

test("directional masks fail closed for duplicate, ambiguous, malformed, or ENA labels", () => {
  assert.throws(() => createDirectionalMask(["A", "A"]), /unique|duplicate/i);
  assert.throws(() => createDirectionalMask(["A", "A & B"]), /ambiguous| & /i);
  assert.match(validateDirectionalMask({
    schemaVersion: 1,
    codeOrder: ["A", "B"],
    enabled: [[true], [true, true]],
  }, ["A", "B"]).join(" "), /2.*2|square|row/i);
  assert.throws(() => canonicalizeOpenEnaConfig({
    ...SAMPLE_CONFIG,
    analysisKind: "ena",
    directionalMask: createDirectionalMask(SAMPLE_CONFIG.codes),
  }), /ENA.*directional mask|directional mask.*ENA/i);
});

test("column ordering groups interleaved typed horizons by first appearance and sorts stably", () => {
  const rows: Row[] = [
    { horizon: "h1", turn: 2, value: "h1-second" },
    { horizon: "h2", turn: 2, value: "h2-second" },
    { horizon: "h1", turn: 1, value: "h1-first" },
    { horizon: "h2", turn: 1, value: "h2-first" },
  ];
  const snapshot = structuredClone(rows);
  const result = orderRowsForOpenEna(rows, ["horizon"], columnOrder(["turn"]));

  assert.deepEqual(result.rows.map((row) => row.value), ["h1-first", "h1-second", "h2-first", "h2-second"]);
  assert.deepEqual(result.sourceIndices, [2, 0, 3, 1]);
  assert.deepEqual(result.resolvedPolicy, {
    kind: "columns",
    columns: ["turn"],
    comparators: { turn: "number" },
    direction: "ascending",
    missing: "reject",
    ties: "reject",
    stable: true,
  });
  assert.deepEqual(rows, snapshot);
});

test("typed horizon tuples cannot collide through delimiters or scalar coercion", () => {
  const rows: Row[] = [
    { h1: "a::b", h2: "c", turn: 2, value: "delimiter-one" },
    { h1: "a", h2: "b::c", turn: 1, value: "delimiter-two" },
    { h1: 1, h2: "x", turn: 1, value: "number" },
    { h1: "1", h2: "x", turn: 1, value: "string" },
    { h1: true, h2: "x", turn: 1, value: "boolean" },
  ];
  const result = orderRowsForOpenEna(rows, ["h1", "h2"], columnOrder(["turn"]));
  assert.deepEqual(result.sourceIndices, [0, 1, 2, 3, 4]);
});

test("typed horizon identity preserves negative zero independently from positive zero", () => {
  const rows: Row[] = [
    { horizon: -0, turn: 2, value: "negative-zero" },
    { horizon: 0, turn: 1, value: "positive-zero" },
  ];
  const result = orderRowsForOpenEna(rows, ["horizon"], columnOrder(["turn"]));

  assert.deepEqual(
    result.sourceIndices,
    [0, 1],
    "separate typed horizons must retain first-appearance order instead of sorting together",
  );
});

test("CSV numeric order values use a recorded numeric comparator rather than lexical order", () => {
  const dataset = parseCsv(
    "unit,horizon,turn,A,B,C\nu1,h1,10,0,0,1\nu1,h1,2,0,1,0\nu1,h1,-1.5,1,0,0\n",
    { name: "numeric-order.csv", source: "upload" },
  );
  const result = orderRowsForOpenEna(dataset.rows, ["horizon"], columnOrder(["turn"]));

  assert.deepEqual(result.rows.map((row) => row.turn), ["-1.5", "2", "10"]);
  assert.deepEqual(result.sourceIndices, [2, 1, 0]);
  assert.deepEqual(result.resolvedPolicy.kind === "columns" && result.resolvedPolicy.comparators, {
    turn: "number",
  });
});

test("numeric ordering compares large integers, precise decimals, and exponents losslessly", () => {
  for (const values of [
    ["9007199254740993", "9007199254740992"],
    ["1.0000000000000002", "1.0000000000000001"],
    ["1e1000", "9e999"],
    ["-9007199254740992", "-9007199254740993"],
  ]) {
    const rows: Row[] = values.map((turn, index) => ({ horizon: "h", turn, index }));
    assert.deepEqual(
      orderRowsForOpenEna(rows, ["horizon"], columnOrder(["turn"])).sourceIndices,
      [1, 0],
      `lossless ascending order failed for ${values.join(" and ")}`,
    );
  }
  assert.throws(
    () => orderRowsForOpenEna([
      { horizon: "h", turn: "1" },
      { horizon: "h", turn: "1.0" },
      { horizon: "h", turn: "1e0" },
    ], ["horizon"], columnOrder(["turn"])),
    /tie/i,
    "textually different but numerically equal decimals must remain a true tie",
  );
});

test("partially numeric string order values fail closed instead of silently changing comparator", () => {
  assert.throws(
    () => orderRowsForOpenEna([
      { horizon: "h", turn: "1" },
      { horizon: "h", turn: "unknown" },
    ], ["horizon"], columnOrder(["turn"])),
    /incompatible.*number|number.*incompatible/i,
  );
});

test("explicit string and ISO datetime comparators preserve their declared semantics", () => {
  const stringRows: Row[] = [
    { horizon: "h", turn: "1" },
    { horizon: "h", turn: "01" },
    { horizon: "h", turn: "001" },
  ];
  assert.deepEqual(
    orderRowsForOpenEna(stringRows, ["horizon"], columnOrder(["turn"], "string")).rows.map((row) => row.turn),
    ["001", "01", "1"],
  );

  const timeRows: Row[] = [
    { horizon: "h", time: "2026-08-22T12:00:00+08:00" },
    { horizon: "h", time: "2026-08-22T03:30:00Z" },
  ];
  assert.deepEqual(
    orderRowsForOpenEna(timeRows, ["horizon"], columnOrder(["time"], "iso-datetime")).sourceIndices,
    [1, 0],
  );
  assert.throws(
    () => orderRowsForOpenEna([
      { horizon: "h", time: "08/22/2026 12:00" },
    ], ["horizon"], columnOrder(["time"], "iso-datetime")),
    /incompatible.*iso-datetime|iso-datetime.*incompatible/i,
  );
  for (const invalid of [
    "2026-02-30T00:00:00Z",
    "2025-02-29T00:00:00Z",
    "2026-04-31T00:00:00Z",
    "2026-01-01T24:00:00Z",
  ]) {
    assert.throws(
      () => orderRowsForOpenEna([
        { horizon: "h", time: invalid },
      ], ["horizon"], columnOrder(["time"], "iso-datetime")),
      /incompatible.*iso-datetime|iso-datetime.*incompatible/i,
      `semantically invalid ISO timestamp must fail closed: ${invalid}`,
    );
  }
  assert.deepEqual(
    orderRowsForOpenEna([
      { horizon: "h", time: "2024-02-29T00:00:00Z" },
    ], ["horizon"], columnOrder(["time"], "iso-datetime")).sourceIndices,
    [0],
  );
});

test("column order policies require one explicit supported comparator per column", () => {
  assert.throws(
    () => orderRowsForOpenEna([{ horizon: "h", turn: 1 }], ["horizon"], {
      kind: "columns",
      columns: ["turn"],
    } as unknown as OpenEnaOrderPolicy),
    /explicit comparator/i,
  );
  assert.throws(
    () => orderRowsForOpenEna([{ horizon: "h", turn: 1 }], ["horizon"], {
      kind: "columns",
      columns: ["turn"],
      comparators: { different: "number" },
    }),
    /exactly match/i,
  );
});

test("column ordering rejects missing horizons/order values, non-finite numbers, mixed values, and ties", () => {
  assert.throws(
    () => orderRowsForOpenEna([{ horizon: null, turn: 1 }], ["horizon"], columnOrder(["turn"])),
    /horizon.*missing|missing.*horizon/i,
  );
  assert.throws(
    () => orderRowsForOpenEna([{ horizon: "h" }], ["horizon"], columnOrder(["turn"])),
    /order.*missing|missing.*order/i,
  );
  assert.throws(
    () => orderRowsForOpenEna([{ horizon: "h", turn: Number.POSITIVE_INFINITY }], ["horizon"], columnOrder(["turn"])),
    /finite/i,
  );
  assert.throws(
    () => orderRowsForOpenEna([
      { horizon: "h", turn: 1 },
      { horizon: "h", turn: true },
    ], ["horizon"], columnOrder(["turn"])),
    /incompatible/i,
  );
  assert.throws(
    () => orderRowsForOpenEna([
      { horizon: "h", turn: 1 },
      { horizon: "h", turn: 1 },
    ], ["horizon"], columnOrder(["turn"])),
    /tie/i,
  );
  assert.throws(
    () => orderRowsForOpenEna([{ horizon: "h", turn: 1 }], ["horizon"], columnOrder([])),
    /at least one|non-empty/i,
  );
});

test("source-row ordering requires explicit confirmation and preserves the original row order", () => {
  assert.throws(
    () => orderRowsForOpenEna([{ horizon: "h", turn: 1 }], ["horizon"], {
      kind: "source-row",
      confirmed: false,
    } as unknown as OpenEnaOrderPolicy),
    /confirm/i,
  );
  const rows: Row[] = [{ horizon: "h", turn: 2 }, { horizon: "h", turn: 1 }];
  const result = orderRowsForOpenEna(rows, ["horizon"], { kind: "source-row", confirmed: true });
  assert.deepEqual(result.rows, rows);
  assert.deepEqual(result.sourceIndices, [0, 1]);
  assert.deepEqual(result.resolvedPolicy, { kind: "source-row", confirmed: true, stable: true });
});

test("ONA validation enforces the ordered endpoint contract and validates order against the data", () => {
  const dataset = manualDataset([
    { unit: "u1", horizon: "h1", turn: 2, A: 1, B: 0, C: 0 },
    { unit: "u1", horizon: "h1", turn: 1, A: 1, B: 0, C: 0 },
    { unit: "u2", horizon: "h2", turn: 1, A: 1, B: 0, C: 0 },
    { unit: "u2", horizon: "h2", turn: 2, A: 0, B: 1, C: 0 },
    { unit: "u3", horizon: "h3", turn: 1, A: 1, B: 0, C: 0 },
    { unit: "u3", horizon: "h3", turn: 2, A: 0, B: 0, C: 1 },
  ]);
  const valid = orderedConfig();
  assert.deepEqual(validateConfig(dataset, valid), []);

  for (const [override, expected] of [
    [{ model: "SeparateTrajectory" }, /endpoint/i],
    [{ window: "Conversation" }, /moving stanza/i],
    [{ windowSizeBack: 0 }, /backward.*at least 1|at least 1.*backward/i],
    [{ windowSizeForward: 1 }, /forward.*zero|zero.*forward/i],
    [{ weightBy: "binary" }, /sum/i],
    [{ rotation: "mean" }, /SVD/i],
    [{ rotation: "reference", referenceRotationId: "ref" }, /reference|SVD/i],
    [{ orderPolicy: null }, /order/i],
  ] as const) {
    assert.match(validateConfig(dataset, {
      ...valid,
      ...override,
    } as OpenEnaConfig).join(" "), expected);
  }

  const tied = manualDataset([
    { unit: "u1", horizon: "h1", turn: 1, A: 1, B: 0, C: 1 },
    { unit: "u1", horizon: "h1", turn: 1, A: 0, B: 1, C: 0 },
  ]);
  assert.match(validateConfig(tied, valid).join(" "), /tie/i);
});

test("ONA recognizes diagonal self-transitions and cross-row transitions without standard same-row co-occurrence", () => {
  const selfOnly = manualDataset([
    { unit: "u1", horizon: "h1", turn: 1, A: 1, B: 0, C: 0 },
    { unit: "u1", horizon: "h1", turn: 2, A: 1, B: 0, C: 0 },
    { unit: "u2", horizon: "h2", turn: 1, A: 0, B: 1, C: 0 },
    { unit: "u2", horizon: "h2", turn: 2, A: 0, B: 1, C: 0 },
    { unit: "u3", horizon: "h3", turn: 1, A: 0, B: 0, C: 1 },
    { unit: "u3", horizon: "h3", turn: 2, A: 0, B: 0, C: 1 },
  ]);
  assert.deepEqual(validateConfig(selfOnly, orderedConfig()), []);

  const crossRow = manualDataset([
    { unit: "u1", horizon: "h1", turn: 1, A: 1, B: 0, C: 0 },
    { unit: "u1", horizon: "h1", turn: 2, A: 0, B: 1, C: 0 },
    { unit: "u1", horizon: "h1", turn: 3, A: 0, B: 0, C: 1 },
  ]);
  assert.deepEqual(validateConfig(crossRow, orderedConfig()), []);
});

test("ONA validation does not create a connection across negative-zero and positive-zero horizons", () => {
  const codes = ["A", "B", "C"];
  const dataset = manualDataset([
    { unit: "u1", horizon: -0, turn: 1, A: 1, B: 0, C: 0 },
    { unit: "u1", horizon: 0, turn: 2, A: 0, B: 1, C: 0 },
    { unit: "u1", horizon: "third", turn: 3, A: 0, B: 0, C: 1 },
  ], ["unit", "horizon", "turn", ...codes]);
  const errors = validateConfig(dataset, orderedConfig({
    codes,
    directionalMask: createDirectionalMask(codes),
  }));

  assert.match(errors.join(" "), /do not form an enabled ordered connection/i);
});

test("ONA permits delimiter-bearing conversation tuples without identity collisions", () => {
  const codes = ["A", "B", "C"];
  const dataset = manualDataset([
    { unit: "u1", h1: "a::b", h2: "c", turn: 1, A: 1, B: 0, C: 0 },
    { unit: "u1", h1: "a::b", h2: "c", turn: 2, A: 0, B: 1, C: 0 },
    { unit: "u2", h1: "a", h2: "b::c", turn: 1, A: 1, B: 0, C: 0 },
    { unit: "u2", h1: "a", h2: "b::c", turn: 2, A: 0, B: 1, C: 1 },
  ], ["unit", "h1", "h2", "turn", ...codes]);
  const config = orderedConfig({
    conversationColumns: ["h1", "h2"],
    codes,
    directionalMask: createDirectionalMask(codes),
  });

  assert.deepEqual(validateConfig(dataset, config), []);
});

test("ONA preflight rejects typed unit tuples that collapse to one display label", () => {
  const dataset = manualDataset([
    { unit: 1, horizon: "h1", turn: 1, A: 1, B: 1, C: 0 },
    { unit: "1", horizon: "h2", turn: 1, A: 1, B: 0, C: 1 },
  ]);
  const errors = validateConfig(dataset, orderedConfig());

  assert.match(errors.join(" "), /unit identity.*ambiguous|distinct typed unit tuples/i);
  assert.doesNotMatch(errors.join(" "), /unit “?1”?/i, "the collision error must not disclose a participant label");
});

test("group-stability errors never expose an analytic-unit value or typed identity", () => {
  const sentinel = "student-secret-42";
  const dataset = manualDataset([
    { unit: sentinel, horizon: "h", turn: 1, group: "control", A: 1, B: 0, C: 0 },
    { unit: sentinel, horizon: "h", turn: 2, group: "treatment", A: 0, B: 1, C: 1 },
  ], ["unit", "horizon", "turn", "group", "A", "B", "C"]);
  const errors = validateConfig(dataset, orderedConfig({ groupColumn: "group" }));
  const message = errors.join(" ");

  assert.match(message, /stable within each.*unit|unit.*multiple group/i);
  assert.doesNotMatch(message, new RegExp(sentinel, "i"));
  assert.doesNotMatch(message, /\[\["unit"/u);
});

test("ONA keeps the conservative unit delimiter guard for multi-column display identities", () => {
  const dataset = manualDataset([
    { unitA: "a::b", unitB: "c", horizon: "h1", turn: 1, A: 1, B: 1, C: 0 },
    { unitA: "a", unitB: "b::c", horizon: "h2", turn: 1, A: 1, B: 0, C: 1 },
  ], ["unitA", "unitB", "horizon", "turn", "A", "B", "C"]);
  const errors = validateConfig(dataset, orderedConfig({ unitColumns: ["unitA", "unitB"] }));

  assert.match(errors.join(" "), /ONA unit component values cannot contain.*::/i);
});

test("standard ENA retains the composite-identity delimiter guard", () => {
  const dataset = manualDataset([
    { unit: "u1", horizon: "a::b", turn: 1, A: 1, B: 1 },
  ], ["unit", "horizon", "turn", "A", "B"]);
  const errors = validateConfig(dataset, {
    ...SAMPLE_CONFIG,
    analysisKind: "ena",
    unitColumns: ["unit"],
    conversationColumns: ["horizon"],
    groupColumn: null,
    codes: ["A", "B"],
  });

  assert.match(errors.join(" "), /cannot contain.*::.*jENA reserves/i);
});

test("standard ENA rejects both ONA-only order and mask state consistently", () => {
  assert.throws(
    () => canonicalizeOpenEnaConfig({
      ...SAMPLE_CONFIG,
      analysisKind: "ena",
      orderPolicy: columnOrder(["turn"]),
    }),
    /standard ENA.*order policy|order policy.*standard ENA/i,
  );
  assert.throws(
    () => canonicalizeOpenEnaConfig({
      ...SAMPLE_CONFIG,
      analysisKind: "ena",
      directionalMask: createDirectionalMask(SAMPLE_CONFIG.codes),
    }),
    /standard ENA.*directional mask|directional mask.*standard ENA/i,
  );
});

test("ONA safety budgeting uses p squared directed cells including diagonal while ENA remains unchanged", () => {
  const codes = Array.from({ length: 30 }, (_, index) => `C${index + 1}`);
  const rows: Row[] = Array.from({ length: 1_000 }, (_, index) => ({
    unit: `u${index}`,
    horizon: `h${index}`,
    turn: 1,
    ...Object.fromEntries(codes.map((code) => [code, 1])),
  }));
  const dataset = manualDataset(rows, ["unit", "horizon", "turn", ...codes]);
  const standard = {
    ...SAMPLE_CONFIG,
    analysisKind: "ena" as const,
    unitColumns: ["unit"],
    conversationColumns: ["horizon"],
    groupColumn: null,
    codes,
    model: "EndPoint" as const,
    window: "MovingStanzaWindow" as const,
    windowSizeBack: 2,
    weightBy: "binary" as const,
    rotation: "svd" as const,
  };
  assert.doesNotMatch(validateConfig(dataset, standard).join(" "), /model-size safety budget/);
  assert.match(
    validateConfig(dataset, orderedConfig({ codes, directionalMask: createDirectionalMask(codes) })).join(" "),
    /model-size safety budget.*directed.*diagonal|directed.*diagonal.*model-size safety budget/i,
  );
});

test("legacy standard validation remains numerically and behaviorally unchanged", () => {
  const dataset = parseCsv(
    "unit,conversation,A,B,C\nu1,c1,1,1,0\nu2,c2,0,1,1\n",
    { name: "legacy.csv", source: "upload" },
  );
  const legacy = {
    ...SAMPLE_CONFIG,
    unitColumns: ["unit"],
    conversationColumns: ["conversation"],
    groupColumn: null,
    codes: ["A", "B", "C"],
    window: "Conversation" as const,
  };
  assert.deepEqual(validateConfig(dataset, legacy), []);
  assert.deepEqual(validateConfig(dataset, { ...legacy, analysisKind: "ena" }), []);
});
