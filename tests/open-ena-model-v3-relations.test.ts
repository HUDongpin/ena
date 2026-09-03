import assert from "node:assert/strict";
import test from "node:test";

import { validateStandardDraftV3 } from "../lib/open-ena/model-v3/diagnostics";
import type { ModelDiagnosticV3 } from "../lib/open-ena/model-v3/diagnostics";
import type { ParsedDataset } from "../lib/open-ena/types";
import type {
  CanonicalHorizonOrderV3,
  CanonicalRowOrderV3,
  DatasetBindingV3,
  ScalarIdentityV3,
  StandardEnaDraftV3,
} from "../lib/open-ena/model-v3/types";

const DATASET_HASH = "a".repeat(64);
const HEADER_HASH = "b".repeat(64);

type DraftOverrides = Partial<Omit<StandardEnaDraftV3, "movingStanza">> & {
  movingStanza?: Partial<StandardEnaDraftV3["movingStanza"]>;
};

function dataset(
  rows: Array<Record<string, unknown>>,
  headers = ["unit", "horizon", "group", "turn", "phase", "A", "B", "C"],
): ParsedDataset {
  return { name: "relations.csv", headers, rows, sizeBytes: 1, source: "upload" } as ParsedDataset;
}

function binding(input: ParsedDataset): DatasetBindingV3 {
  return {
    hashKind: "normalized-utf8-csv-text-sha256",
    normalizedTableSha256: DATASET_HASH,
    rowCount: input.rows.length,
    headerSha256: HEADER_HASH,
  };
}

const rowOrder: CanonicalRowOrderV3 = {
  kind: "columns",
  keys: [{ column: "turn", direction: "ascending", comparator: { type: "number" } }],
};

const horizonOrder: CanonicalHorizonOrderV3 = {
  kind: "columns",
  keys: [{ column: "phase", direction: "ascending", comparator: { type: "number" } }],
};

function draft(overrides: DraftOverrides = {}): StandardEnaDraftV3 {
  return {
    unitColumns: ["unit"],
    horizonColumns: ["horizon"],
    groupColumn: "group",
    codes: ["A", "B", "C"],
    weighting: "binary",
    model: "EndPoint",
    windowType: "Conversation",
    ...overrides,
    movingStanza: {
      backward: { kind: "finite", value: 2 },
      forward: { kind: "finite", value: 0 },
      rowOrder,
      ...overrides.movingStanza,
    },
    horizonOrder: overrides.horizonOrder ?? null,
    rotation: overrides.rotation ?? { type: "svd", centerAlignToOrigin: true },
  };
}

function healthyRows(): Array<Record<string, unknown>> {
  return [
    { unit: "u1", horizon: "h1", group: "negative", turn: 1, phase: 1, A: 1, B: 1, C: 0 },
    { unit: "u2", horizon: "h1", group: "positive", turn: 2, phase: 1, A: 1, B: 0, C: 1 },
    { unit: "u1", horizon: "h2", group: "negative", turn: 3, phase: 2, A: 0, B: 1, C: 1 },
    { unit: "u2", horizon: "h2", group: "positive", turn: 4, phase: 2, A: 1, B: 1, C: 1 },
  ];
}

function output(input: ParsedDataset, modelDraft = draft()): readonly ModelDiagnosticV3[] {
  return validateStandardDraftV3(input, binding(input), modelDraft);
}

function has(result: readonly ModelDiagnosticV3[], id: ModelDiagnosticV3["id"]): boolean {
  return result.some((entry) => entry.id === id);
}

function exactlyOne(result: readonly ModelDiagnosticV3[], id: ModelDiagnosticV3["id"]): ModelDiagnosticV3 {
  const matches = result.filter((entry) => entry.id === id);
  assert.equal(matches.length, 1, `expected one ${id}, got ${result.map((entry) => entry.id).join(", ")}`);
  return matches[0];
}

test("Unit and Horizon identities fail closed for absent fields and unsupported values", () => {
  const missing = dataset(
    [{ unit: "u1", group: "negative", turn: 1, phase: 1, A: 1, B: 1, C: 1 }],
    ["unit", "group", "turn", "phase", "A", "B", "C"],
  );
  assert.equal(has(output(missing), "STANDARD_IDENTITY_MISSING"), true);

  const unsupported = dataset([
    { unit: { id: "u1" }, horizon: "h1", group: "negative", turn: 1, phase: 1, A: 1, B: 1, C: 1 },
  ]);
  assert.equal(has(output(unsupported), "STANDARD_IDENTITY_VALUE_UNSUPPORTED"), true);

  assert.equal(has(output(dataset(healthyRows()), draft({ unitColumns: [] })), "STANDARD_UNITS_REQUIRED"), true);
  assert.equal(has(output(dataset(healthyRows()), draft({ horizonColumns: [] })), "STANDARD_HORIZONS_REQUIRED"), true);

  const missingUnitHeader = dataset(
    [{ horizon: "h1", group: "negative", turn: 1, phase: 1, A: 1, B: 1, C: 1 }],
    ["horizon", "group", "turn", "phase", "A", "B", "C"],
  );
  assert.equal(has(output(missingUnitHeader), "STANDARD_IDENTITY_MISSING"), true);
  const unsupportedHorizon = healthyRows();
  unsupportedHorizon[0].horizon = Number.POSITIVE_INFINITY;
  assert.equal(has(output(dataset(unsupportedHorizon)), "STANDARD_IDENTITY_VALUE_UNSUPPORTED"), true);
});

test("Group is required for Means, typed, and stable within each typed Unit", () => {
  const means = { type: "means", centerAlignToOrigin: true, negativeLevel: { type: "string", value: "negative" }, positiveLevel: { type: "string", value: "positive" } } as const;
  assert.equal(has(output(dataset(healthyRows()), draft({ groupColumn: null, rotation: means })), "STANDARD_MEANS_GROUP_REQUIRED"), true);

  const unsupported = healthyRows();
  unsupported[0].group = { label: "negative" };
  assert.equal(has(output(dataset(unsupported), draft({ rotation: means })), "STANDARD_IDENTITY_VALUE_UNSUPPORTED"), true);

  const unstable = healthyRows();
  unstable[2].group = "changed";
  const diagnostic = exactlyOne(output(dataset(unstable)), "STANDARD_GROUP_UNSTABLE_WITHIN_UNIT");
  assert.equal(diagnostic.severity, "error");
  assert.equal(diagnostic.blocks.includes("build-model"), true);

  const missingHeader = dataset(
    healthyRows().map(({ group: _group, ...row }) => row),
    ["unit", "horizon", "turn", "phase", "A", "B", "C"],
  );
  assert.equal(has(output(missingHeader), "STANDARD_GROUP_FIELD_MISSING"), true);
});

test("Code selection cannot reuse an active Task 6 structural role", () => {
  const input = dataset(healthyRows());
  const result = output(input, draft({ codes: ["A", "B", "group"] }));
  const collision = exactlyOne(result, "STANDARD_CODE_ROLE_COLLISION");
  assert.equal(collision.fieldPath, "codes.group");
  assert.equal(collision.blocks.includes("build-model"), true);
  assert.equal(has(result, "STANDARD_CODE_VALUE_INVALID"), false);
});

test("typed Unit keys do not conflate delimiters, types, or negative zero", () => {
  const rows = [
    { unit: 1, horizon: "h1", group: "number", turn: 1, phase: 1, A: 1, B: 1, C: 0 },
    { unit: "1", horizon: "h1", group: "string", turn: 2, phase: 1, A: 1, B: 0, C: 1 },
    { unit: "a::b", horizon: "h2", group: "delimiter", turn: 3, phase: 2, A: 0, B: 1, C: 1 },
    { unit: -0, horizon: "h2", group: "zero", turn: 4, phase: 2, A: 1, B: 1, C: 1 },
    { unit: 0, horizon: "h3", group: "zero", turn: 5, phase: 3, A: 1, B: 1, C: 0 },
  ];
  assert.equal(has(output(dataset(rows)), "STANDARD_GROUP_UNSTABLE_WITHIN_UNIT"), false);
});

test("shared typed Horizons are legal information and do not merge Unit paths", () => {
  const result = output(dataset(healthyRows()), draft({ model: "SeparateTrajectory", horizonOrder }));
  const shared = exactlyOne(result, "STANDARD_HORIZON_SHARED_BY_MULTIPLE_UNITS");
  assert.equal(shared.severity, "information");
  assert.deepEqual(shared.blocks, []);
  assert.equal(has(result, "STANDARD_TRAJECTORY_HAS_NO_PATH"), false);

  const typeDistinct = dataset([
    { unit: "u1", horizon: 1, group: "g1", turn: 1, phase: 1, A: 1, B: 1, C: 0 },
    { unit: "u2", horizon: "1", group: "g2", turn: 2, phase: 2, A: 1, B: 0, C: 1 },
  ]);
  assert.equal(has(output(typeDistinct), "STANDARD_HORIZON_SHARED_BY_MULTIPLE_UNITS"), false);
});

test("Moving Stanza row order and trajectory Horizon order are independent prerequisites", () => {
  const input = dataset(healthyRows());
  const result = output(input, draft({
    model: "SeparateTrajectory",
    windowType: "MovingStanzaWindow",
    movingStanza: { rowOrder: null },
    horizonOrder: null,
  }));
  assert.equal(has(result, "STANDARD_ROW_ORDER_REQUIRED"), true);
  assert.equal(has(result, "STANDARD_HORIZON_ORDER_REQUIRED"), true);
  assert.equal(has(result, "STANDARD_TRAJECTORY_HAS_NO_PATH"), false, "derivative shape diagnostics are suppressed");
});

test("authoritative resolvers classify invalid/tied orders and stale source confirmations", () => {
  const input = dataset(healthyRows());
  const tiedRows = output(input, draft({ windowType: "MovingStanzaWindow", movingStanza: {
    rowOrder: { kind: "columns", keys: [{ column: "phase", direction: "ascending", comparator: { type: "number" } }] },
  } }));
  assert.equal(has(tiedRows, "STANDARD_ROW_ORDER_INVALID"), true);

  const tiedHorizons = output(input, draft({
    model: "SeparateTrajectory",
    horizonOrder: { kind: "columns", keys: [{ column: "group", direction: "ascending", comparator: { type: "text", locale: "en", sensitivity: "variant", numeric: false } }] },
  }));
  assert.equal(has(tiedHorizons, "STANDARD_HORIZON_ORDER_INVALID") || has(tiedHorizons, "STANDARD_HORIZON_ORDER_UNRESOLVED_TIE"), true);

  const stale: CanonicalRowOrderV3 = {
    kind: "source-order-confirmed",
    confirmation: {
      kind: "explicit-researcher-confirmation",
      datasetSha256: "c".repeat(64),
      rowCount: input.rows.length,
      relevantColumns: ["horizon"],
      confirmedAt: "2026-09-03T00:00:00.000Z",
      confirmationVersion: 1,
    },
  };
  const staleResult = output(input, draft({ windowType: "MovingStanzaWindow", movingStanza: { rowOrder: stale } }));
  assert.equal(has(staleResult, "STANDARD_SOURCE_ORDER_CONFIRMATION_STALE"), true);
  assert.equal(has(staleResult, "STANDARD_ROW_ORDER_INVALID"), false);

  const tieInput = dataset(healthyRows().map((row) => ({ ...row, same: 1 })), [
    "unit", "horizon", "group", "turn", "phase", "same", "A", "B", "C",
  ]);
  const horizonTie = output(tieInput, draft({
    model: "SeparateTrajectory",
    horizonOrder: { kind: "columns", keys: [{ column: "same", direction: "ascending", comparator: { type: "number" } }] },
  }));
  assert.equal(has(horizonTie, "STANDARD_HORIZON_ORDER_UNRESOLVED_TIE"), true);
  assert.equal(has(horizonTie, "STANDARD_HORIZON_ORDER_INVALID"), false);

  const staleHorizon: CanonicalHorizonOrderV3 = {
    kind: "source-order-confirmed",
    confirmation: {
      kind: "explicit-researcher-confirmation",
      datasetSha256: "c".repeat(64),
      rowCount: input.rows.length,
      relevantColumns: ["unit", "horizon"],
      confirmedAt: "2026-09-03T00:00:00.000Z",
      confirmationVersion: 1,
    },
  };
  const staleHorizonResult = output(input, draft({ model: "SeparateTrajectory", horizonOrder: staleHorizon }));
  assert.equal(has(staleHorizonResult, "STANDARD_SOURCE_ORDER_CONFIRMATION_STALE"), true);
  assert.equal(has(staleHorizonResult, "STANDARD_HORIZON_ORDER_INVALID"), false);

  const currentHorizon: CanonicalHorizonOrderV3 = {
    ...staleHorizon,
    confirmation: { ...staleHorizon.confirmation, datasetSha256: DATASET_HASH },
  };
  const currentHorizonResult = output(input, draft({ model: "SeparateTrajectory", horizonOrder: currentHorizon }));
  assert.equal(has(currentHorizonResult, "STANDARD_SOURCE_ORDER_CONFIRMATION_STALE"), false);
  assert.equal(has(currentHorizonResult, "STANDARD_HORIZON_ORDER_INVALID"), false);

  const missingOrderField = output(input, draft({
    model: "SeparateTrajectory",
    horizonOrder: { kind: "columns", keys: [{ column: "missing", direction: "ascending", comparator: { type: "number" } }] },
  }));
  assert.equal(has(missingOrderField, "STANDARD_HORIZON_ORDER_INVALID"), true);
});

test("all six Standard model and window pairs remain supported", () => {
  const input = dataset(healthyRows());
  const combinations = [
    ["EndPoint", "Conversation"],
    ["EndPoint", "MovingStanzaWindow"],
    ["SeparateTrajectory", "Conversation"],
    ["SeparateTrajectory", "MovingStanzaWindow"],
    ["AccumulatedTrajectory", "Conversation"],
    ["AccumulatedTrajectory", "MovingStanzaWindow"],
  ] as const;
  for (const [model, windowType] of combinations) {
    const result = output(input, draft({ model, windowType, horizonOrder: model === "EndPoint" ? null : horizonOrder }));
    assert.equal(result.some((entry) => (entry.id as string) === "STANDARD_MODEL_WINDOW_UNSUPPORTED"), false);
    assert.equal(result.some((entry) => entry.severity === "error"), false, `${model} + ${windowType}: ${result.map((entry) => entry.id).join(", ")}`);
  }
});

test("trajectory Means stays selected and invalid", () => {
  const means = { type: "means", centerAlignToOrigin: true, negativeLevel: { type: "string", value: "negative" }, positiveLevel: { type: "string", value: "positive" } } as const;
  const result = output(dataset(healthyRows()), draft({ model: "SeparateTrajectory", horizonOrder, rotation: means }));
  const diagnostic = exactlyOne(result, "STANDARD_MEANS_REQUIRES_ENDPOINT");
  assert.equal(diagnostic.blocks.includes("build-model"), true);
  assert.equal(has(result, "STANDARD_MEANS_IDENTICAL"), false);
});

function meansDraft(negativeLevel: ScalarIdentityV3 | null, positiveLevel: ScalarIdentityV3 | null): StandardEnaDraftV3 {
  return draft({
    rotation: { type: "means", centerAlignToOrigin: true, negativeLevel, positiveLevel },
  });
}

test("Means requires two explicit, distinct, eligible typed levels", () => {
  const input = dataset(healthyRows());
  assert.equal(has(output(input, meansDraft(null, { type: "string", value: "positive" })), "STANDARD_MEANS_LEVEL_REQUIRED"), true);
  assert.equal(has(output(input, meansDraft({ type: "string", value: "absent" }, { type: "string", value: "positive" })), "STANDARD_MEANS_LEVEL_EMPTY"), true);
  assert.equal(has(output(input, meansDraft({ type: "string", value: "negative" }, { type: "string", value: "negative" })), "STANDARD_MEANS_IDENTICAL"), true);

  const typed = output(input, meansDraft({ type: "number", value: 1 }, { type: "string", value: "positive" }));
  assert.equal(has(typed, "STANDARD_MEANS_LEVEL_EMPTY"), true);

  const typedGroups = dataset([
    { unit: "u::1", horizon: "h::1", group: 1, turn: 1, phase: 1, A: 1, B: 1, C: 0 },
    { unit: "u::2", horizon: "h::2", group: "1", turn: 2, phase: 2, A: 0, B: 1, C: 1 },
  ]);
  const typedGroupsResult = output(typedGroups, meansDraft(
    { type: "number", value: 1 },
    { type: "string", value: "1" },
  ));
  assert.equal(typedGroupsResult.some((entry) => entry.id === "STANDARD_MEANS_LEVEL_EMPTY" && entry.severity === "error"), false);
  assert.equal(has(typedGroupsResult, "STANDARD_MEANS_IDENTICAL"), false);
});

test("Means rejects selected groups without non-zero Unit networks and identical group means", () => {
  const noNetwork = dataset([
    { unit: "n", horizon: "h1", group: "negative", turn: 1, phase: 1, A: 1, B: 0, C: 0 },
    { unit: "p", horizon: "h2", group: "positive", turn: 2, phase: 2, A: 1, B: 1, C: 1 },
  ]);
  assert.equal(has(output(noNetwork, meansDraft({ type: "string", value: "negative" }, { type: "string", value: "positive" })), "STANDARD_MEANS_LEVEL_EMPTY"), true);

  const identical = dataset([
    { unit: "n", horizon: "h1", group: "negative", turn: 1, phase: 1, A: 1, B: 1, C: 1 },
    { unit: "p", horizon: "h2", group: "positive", turn: 2, phase: 2, A: 1, B: 1, C: 1 },
  ]);
  assert.equal(has(output(identical, meansDraft({ type: "string", value: "negative" }, { type: "string", value: "positive" })), "STANDARD_MEANS_IDENTICAL"), true);
});

test("one-Unit Means groups only block group inference", () => {
  const result = output(dataset(healthyRows()), meansDraft(
    { type: "string", value: "negative" },
    { type: "string", value: "positive" },
  ));
  const warnings = result.filter((entry) => entry.id === "STANDARD_MEANS_LEVEL_EMPTY");
  assert.equal(warnings.length, 2);
  for (const warning of warnings) {
    assert.equal(warning.severity, "warning");
    assert.deepEqual(warning.blocks, ["group-inference"]);
    assert.match(warning.detail, /descriptive Means rotation/u);
  }
});

test("a one-versus-three Means contrast blocks only the undersized level even when target rank exceeds one", () => {
  const input = dataset([
    { unit: "n", horizon: "hn", group: "negative", turn: 1, phase: 1, A: 1, B: 1, C: 0 },
    { unit: "p1", horizon: "hp1", group: "positive", turn: 2, phase: 2, A: 1, B: 0, C: 1 },
    { unit: "p2", horizon: "hp2", group: "positive", turn: 3, phase: 3, A: 0, B: 1, C: 1 },
    { unit: "p3", horizon: "hp3", group: "positive", turn: 4, phase: 4, A: 1, B: 1, C: 1 },
  ]);
  const result = output(input, meansDraft(
    { type: "string", value: "negative" },
    { type: "string", value: "positive" },
  ));
  const warnings = result.filter((entry) => entry.id === "STANDARD_MEANS_LEVEL_EMPTY" && entry.severity === "warning");
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].fieldPath, "rotation.negativeLevel");
  assert.deepEqual(warnings[0].blocks, ["group-inference"]);
  assert.equal(has(result, "STANDARD_SVD_ONE_DIMENSIONAL"), false);
});

test("SVD blocks rank-zero targets while Reference permits them with the approved warning", () => {
  const input = dataset([
    { unit: "solo", horizon: "h1", group: "g", turn: 1, phase: 1, A: 1, B: 1, C: 0 },
    { unit: "solo", horizon: "h2", group: "g", turn: 2, phase: 2, A: 0, B: 1, C: 1 },
  ]);
  const svd = exactlyOne(output(input), "STANDARD_TARGET_RANK_ZERO");
  assert.equal(svd.severity, "error");
  assert.equal(svd.blocks.includes("build-model"), true);

  const reference = output(input, draft({ rotation: {
    type: "reference",
    referenceId: "reference-1",
    expectedContentSha256: "d".repeat(64),
  } }));
  assert.equal(has(reference, "STANDARD_TARGET_RANK_ZERO"), false);
  assert.equal(exactlyOne(reference, "STANDARD_REFERENCE_TARGET_DEGENERATE").severity, "warning");
});

test("Reference selection requires a nonblank ID and exact lowercase content digest", () => {
  const input = dataset(healthyRows());
  for (const rotation of [
    { type: "reference", referenceId: null, expectedContentSha256: null },
    { type: "reference", referenceId: " ", expectedContentSha256: "d".repeat(64) },
    { type: "reference", referenceId: "reference-1", expectedContentSha256: "D".repeat(64) },
    { type: "reference", referenceId: "reference-1", expectedContentSha256: "short" },
  ] as const) {
    const result = output(input, draft({ rotation }));
    const missing = exactlyOne(result, "STANDARD_REFERENCE_MISSING");
    assert.equal(missing.severity, "error");
    assert.equal(missing.blocks.includes("build-model"), true);
    assert.equal(has(result, "STANDARD_REFERENCE_INCOMPATIBLE"), false);
  }
});

test("Moving Stanza Unit networks preserve jENA focal ownership after head/tail subtraction", () => {
  const input = dataset([
    { unit: "filler", horizon: "h1", group: "other", turn: 1, phase: 1, A: 1, B: 1, C: 0 },
    { unit: "p", horizon: "h1", group: "negative", turn: 2, phase: 1, A: 0, B: 0, C: 1 },
    { unit: "q", horizon: "h2", group: "positive", turn: 3, phase: 2, A: 1, B: 1, C: 1 },
  ]);
  const result = output(input, meansDraft(
    { type: "string", value: "negative" },
    { type: "string", value: "positive" },
  ));
  const movingResult = output(input, {
    ...meansDraft({ type: "string", value: "negative" }, { type: "string", value: "positive" }),
    windowType: "MovingStanzaWindow",
  });
  assert.equal(has(result, "STANDARD_MEANS_IDENTICAL"), false);
  assert.equal(has(movingResult, "STANDARD_MEANS_IDENTICAL"), false,
    "p owns AC+BC, not predecessor-only AB; q owns AB+AC+BC");

  const frequencyInput = dataset([
    { unit: "filler", horizon: "h1", group: "other", turn: 1, phase: 1, A: 2, B: 3, C: 0 },
    { unit: "p", horizon: "h1", group: "negative", turn: 2, phase: 1, A: 0, B: 0, C: 5 },
    { unit: "q", horizon: "h2", group: "positive", turn: 3, phase: 2, A: 2, B: 3, C: 5 },
  ]);
  const frequencyResult = output(frequencyInput, {
    ...meansDraft({ type: "string", value: "negative" }, { type: "string", value: "positive" }),
    weighting: "frequency",
    windowType: "MovingStanzaWindow",
  });
  assert.equal(has(frequencyResult, "STANDARD_MEANS_IDENTICAL"), false,
    "frequency p owns [AC=10, BC=15], not predecessor-only AB=6; q also owns AB=6");
});

test("active policy proxies are snapshotted once without ordinary get behavior", () => {
  let ordinaryGets = 0;
  const descriptorCounts = new Map<PropertyKey, number>();
  const policyTarget = rowOrder;
  const policy = new Proxy(policyTarget, {
    get() {
      ordinaryGets += 1;
      throw new Error("ordinary get must not run");
    },
    getOwnPropertyDescriptor(target, property) {
      descriptorCounts.set(property, (descriptorCounts.get(property) ?? 0) + 1);
      return Object.getOwnPropertyDescriptor(target, property);
    },
  });
  const result = output(dataset(healthyRows()), draft({
    windowType: "MovingStanzaWindow",
    movingStanza: { rowOrder: policy },
  }));
  assert.equal(has(result, "STANDARD_ROW_ORDER_INVALID"), false);
  assert.equal(ordinaryGets, 0);
  assert.equal(descriptorCounts.get("kind"), 1);
  assert.equal(descriptorCounts.get("keys"), 1);
});

test("Task 6 evidence is bounded and the returned graph is recursively frozen", () => {
  const rows = healthyRows();
  for (let index = 3; index < 12; index += 1) {
    rows.push({ unit: `u${index}`, horizon: "h1", group: `g${index}`, turn: index + 2, phase: 1, A: 1, B: 1, C: 0 });
  }
  const result = output(dataset(rows));
  const shared = exactlyOne(result, "STANDARD_HORIZON_SHARED_BY_MULTIPLE_UNITS");
  assert.equal(shared.evidence?.totalCount, 2);
  assert.ok((shared.evidence?.samples.length ?? 0) <= 5);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(shared), true);
  assert.equal(Object.isFrozen(shared.evidence), true);
  assert.equal(Object.isFrozen(shared.evidence?.samples), true);
});

test("finite Frequency inputs that overflow exact accumulation fail closed before rank fitting", () => {
  const input = dataset([
    { unit: "u1", horizon: "h1", group: "g1", turn: 1, phase: 1, A: 1e308, B: 1e308, C: 1e308 },
  ]);
  const result = output(input, draft({ weighting: "frequency" }));
  assert.equal(has(result, "STANDARD_OUTPUT_NONFINITE"), true);
  assert.equal(has(result, "STANDARD_TARGET_RANK_ZERO"), false);
});

test("trajectory shape distinguishes no paths from some single-step Units", () => {
  const noPath = dataset([
    { unit: "u1", horizon: "h1", group: "g1", turn: 1, phase: 1, A: 1, B: 1, C: 0 },
    { unit: "u2", horizon: "h1", group: "g2", turn: 2, phase: 1, A: 0, B: 1, C: 1 },
  ]);
  assert.equal(has(output(noPath, draft({ model: "SeparateTrajectory", horizonOrder })), "STANDARD_TRAJECTORY_HAS_NO_PATH"), true);

  const someSingle = healthyRows();
  someSingle.push({ unit: "u3", horizon: "h1", group: "g3", turn: 5, phase: 1, A: 1, B: 1, C: 0 });
  const result = output(dataset(someSingle), draft({ model: "SeparateTrajectory", horizonOrder }));
  assert.equal(has(result, "STANDARD_TRAJECTORY_HAS_NO_PATH"), false);
  assert.equal(has(result, "STANDARD_TRAJECTORY_SINGLE_STEP_UNITS"), true);

  const empty = dataset([]);
  const emptyTrajectory = output(empty, draft({ model: "SeparateTrajectory", horizonOrder }));
  assert.equal(has(emptyTrajectory, "STANDARD_TRAJECTORY_HAS_NO_PATH"), true);

  const emptyMeans = output(empty, meansDraft(
    { type: "string", value: "negative" },
    { type: "string", value: "positive" },
  ));
  assert.equal(emptyMeans.filter((entry) => entry.id === "STANDARD_MEANS_LEVEL_EMPTY" && entry.severity === "error").length, 2);
});

test("field and identity failures suppress relation, order, rank, Means, and trajectory derivatives", () => {
  const input = dataset([
    { unit: { bad: true }, group: "negative", turn: 1, phase: 1, A: 1, B: 1, C: 1 },
  ], ["unit", "group", "turn", "phase", "A", "B", "C"]);
  const result = output(input, draft({
    model: "SeparateTrajectory",
    windowType: "MovingStanzaWindow",
    horizonOrder,
    rotation: {
      type: "means",
      centerAlignToOrigin: true,
      negativeLevel: { type: "string", value: "negative" },
      positiveLevel: { type: "string", value: "positive" },
    },
  }));
  assert.equal(has(result, "STANDARD_IDENTITY_MISSING") || has(result, "STANDARD_IDENTITY_VALUE_UNSUPPORTED"), true);
  for (const id of [
    "STANDARD_GROUP_UNSTABLE_WITHIN_UNIT",
    "STANDARD_HORIZON_SHARED_BY_MULTIPLE_UNITS",
    "STANDARD_ROW_ORDER_INVALID",
    "STANDARD_HORIZON_ORDER_INVALID",
    "STANDARD_MEANS_LEVEL_EMPTY",
    "STANDARD_MEANS_IDENTICAL",
    "STANDARD_TARGET_RANK_ZERO",
    "STANDARD_TRAJECTORY_HAS_NO_PATH",
  ] as const) assert.equal(has(result, id), false, id);
  assert.equal(has(result, "STANDARD_MEANS_REQUIRES_ENDPOINT"), true);
});
