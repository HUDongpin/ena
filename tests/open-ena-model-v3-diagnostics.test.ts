import assert from "node:assert/strict";
import test from "node:test";

import {
  MODEL_DIAGNOSTIC_IDS_V3,
  MODEL_SUGGESTED_ACTION_IDS_V3,
  validateStandardDraftV3,
} from "../lib/open-ena/model-v3/diagnostics";
import type {
  ModelCapabilityV3,
  ModelDiagnosticV3,
  ModelDiagnosticScopeV3,
  ModelDiagnosticSeverityV3,
  ModelDraftPatchV3,
  ModelEvidenceV3,
  ModelSuggestedActionV3,
} from "../lib/open-ena/model-v3/diagnostics";
import type { ParsedDataset } from "../lib/open-ena/types";
import type {
  CanonicalHorizonOrderV3,
  CanonicalRowOrderV3,
  DatasetBindingV3,
  StandardEnaDraftV3,
} from "../lib/open-ena/model-v3/types";

const DATASET_HASH = "a".repeat(64);
const OTHER_HASH = "b".repeat(64);
const HEADER_HASH = "c".repeat(64);
const DEFAULT_HEADERS = ["unit", "horizon", "A", "B", "C"];

const EXPECTED_DIAGNOSTIC_IDS = [
  "STANDARD_DATASET_BINDING_INVALID",
  "STANDARD_UNITS_REQUIRED",
  "STANDARD_HORIZONS_REQUIRED",
  "STANDARD_IDENTITY_MISSING",
  "STANDARD_IDENTITY_VALUE_UNSUPPORTED",
  "STANDARD_CODES_TOO_FEW",
  "STANDARD_CODES_DUPLICATE_SELECTION",
  "STANDARD_CODE_FIELD_MISSING",
  "STANDARD_CODE_ROLE_COLLISION",
  "STANDARD_CODE_VALUE_INVALID",
  "STANDARD_CODE_ALL_ZERO",
  "STANDARD_CODE_ISOLATED",
  "STANDARD_CODE_DUPLICATE_PROFILE",
  "STANDARD_NO_GLOBAL_COOCCURRENCE",
  "STANDARD_GROUP_FIELD_MISSING",
  "STANDARD_GROUP_UNSTABLE_WITHIN_UNIT",
  "STANDARD_HORIZON_SHARED_BY_MULTIPLE_UNITS",
  "STANDARD_ROW_ORDER_REQUIRED",
  "STANDARD_ROW_ORDER_INVALID",
  "STANDARD_HORIZON_ORDER_REQUIRED",
  "STANDARD_HORIZON_ORDER_INVALID",
  "STANDARD_HORIZON_ORDER_UNRESOLVED_TIE",
  "STANDARD_SOURCE_ORDER_CONFIRMATION_STALE",
  "STANDARD_MEANS_REQUIRES_ENDPOINT",
  "STANDARD_MEANS_GROUP_REQUIRED",
  "STANDARD_MEANS_LEVEL_REQUIRED",
  "STANDARD_MEANS_LEVEL_EMPTY",
  "STANDARD_MEANS_IDENTICAL",
  "STANDARD_TRAJECTORY_HAS_NO_PATH",
  "STANDARD_TRAJECTORY_SINGLE_STEP_UNITS",
  "STANDARD_TARGET_RANK_ZERO",
  "STANDARD_SVD_ONE_DIMENSIONAL",
  "STANDARD_REFERENCE_MISSING",
  "STANDARD_REFERENCE_INCOMPATIBLE",
  "STANDARD_REFERENCE_TARGET_DEGENERATE",
  "STANDARD_OUTPUT_NONFINITE",
  "RESOURCE_BUDGET_EXCEEDED",
] as const;

type DraftOverrides = Partial<Omit<StandardEnaDraftV3, "movingStanza">> & {
  movingStanza?: Partial<StandardEnaDraftV3["movingStanza"]>;
};

function dataset(
  rows: Array<Record<string, unknown>>,
  headers: string[] = DEFAULT_HEADERS,
  overrides: Partial<Omit<ParsedDataset, "headers" | "rows">> = {},
): ParsedDataset {
  return {
    name: "codes.csv",
    headers,
    rows: rows as ParsedDataset["rows"],
    sizeBytes: 1,
    source: "upload",
    ...overrides,
  };
}

function binding(input: ParsedDataset, overrides: Partial<DatasetBindingV3> = {}): DatasetBindingV3 {
  return {
    hashKind: "normalized-utf8-csv-text-sha256",
    normalizedTableSha256: DATASET_HASH,
    rowCount: input.rows.length,
    headerSha256: HEADER_HASH,
    ...overrides,
  };
}

function draft(codes: string[], overrides: DraftOverrides = {}): StandardEnaDraftV3 {
  const movingStanza: StandardEnaDraftV3["movingStanza"] = {
    backward: { kind: "finite", value: 1 },
    forward: { kind: "finite", value: 0 },
    rowOrder: null,
    ...overrides.movingStanza,
  };
  return {
    unitColumns: ["unit"],
    horizonColumns: ["horizon"],
    groupColumn: null,
    codes,
    weighting: "binary",
    model: "EndPoint",
    windowType: "Conversation",
    horizonOrder: null,
    rotation: { type: "svd", centerAlignToOrigin: true },
    ...overrides,
    movingStanza,
  };
}

function healthyDataset(): ParsedDataset {
  return dataset([
    { unit: "u1", horizon: "h1", A: 1, B: 1, C: 0 },
    { unit: "u1", horizon: "h1", A: 0, B: 0, C: 1 },
    { unit: "u2", horizon: "h2", A: 0, B: 1, C: 1 },
  ]);
}

function diagnosticsFor(
  input: ParsedDataset,
  modelDraft: StandardEnaDraftV3 = draft(["A", "B", "C"]),
  datasetBinding: DatasetBindingV3 = binding(input),
): readonly ModelDiagnosticV3[] {
  return validateStandardDraftV3(input, datasetBinding, modelDraft);
}

type IsMutableArray<T> = T extends unknown[] ? true : false;
type AssertFalse<T extends false> = T;
const readonlyDiagnosticsReturn: AssertFalse<IsMutableArray<ReturnType<typeof validateStandardDraftV3>>> = false;
void readonlyDiagnosticsReturn;

function ids(output: readonly ModelDiagnosticV3[]): string[] {
  return output.map((entry) => entry.id);
}

function one(output: readonly ModelDiagnosticV3[], id: ModelDiagnosticV3["id"]): ModelDiagnosticV3 {
  const matches = output.filter((entry) => entry.id === id);
  assert.equal(matches.length, 1, `expected exactly one ${id}, got ${ids(output).join(", ")}`);
  return matches[0];
}

function hasDerivativeConnectivityNoise(output: readonly ModelDiagnosticV3[]): boolean {
  return output.some((entry) => entry.id === "STANDARD_CODE_ISOLATED"
    || entry.id === "STANDARD_NO_GLOBAL_COOCCURRENCE");
}

function ascendingNumber(column: string): CanonicalRowOrderV3 {
  return {
    kind: "columns",
    keys: [{ column, direction: "ascending", comparator: { type: "number" } }],
  };
}

function confirmedSourceOrder(rowCount: number): CanonicalRowOrderV3 {
  return {
    kind: "source-order-confirmed",
    confirmation: {
      kind: "explicit-researcher-confirmation",
      datasetSha256: DATASET_HASH,
      rowCount,
      relevantColumns: ["horizon"],
      confirmedAt: "2026-09-03T00:00:00.000Z",
      confirmationVersion: 1,
    },
  };
}

test("diagnostic and suggested-action registries are exact, stable, and duplicate-free", () => {
  assert.deepEqual(MODEL_DIAGNOSTIC_IDS_V3, EXPECTED_DIAGNOSTIC_IDS);
  assert.equal(MODEL_DIAGNOSTIC_IDS_V3.length, 37);
  assert.equal(new Set(MODEL_DIAGNOSTIC_IDS_V3).size, 37);
  assert.deepEqual(MODEL_SUGGESTED_ACTION_IDS_V3, [
    "exclude-code", "replace-row-order", "replace-horizon-order", "select-endpoint",
    "select-svd", "select-reference", "clear-group",
  ]);
  assert.ok(Object.isFrozen(MODEL_DIAGNOSTIC_IDS_V3));
  assert.ok(Object.isFrozen(MODEL_SUGGESTED_ACTION_IDS_V3));
  const capability: ModelCapabilityV3 = "build-model";
  const scope: ModelDiagnosticScopeV3 = "codes";
  const severity: ModelDiagnosticSeverityV3 = "warning";
  const evidence: ModelEvidenceV3 = { totalCount: 0, sampleLimit: 5, samples: [], truncated: false };
  const patch: ModelDraftPatchV3 = { type: "exclude-code", code: "A" };
  const action: ModelSuggestedActionV3 = {
    id: "exclude-code", label: "Exclude A", confirmationText: "Exclude A?",
    confirmationRequired: true, patch,
  };
  assert.deepEqual([capability, scope, severity, evidence.sampleLimit, action.confirmationRequired], [
    "build-model", "codes", "warning", 5, true,
  ]);
});

test("a valid Binary draft has no Task 5 diagnostics", () => {
  const input = healthyDataset();
  assert.deepEqual(diagnosticsFor(input), []);
});

test("minimum Codes use distinct nonblank selections and an empty configuration stays empty", () => {
  const input = healthyDataset();
  const emptyDraft = draft([]);
  const empty = diagnosticsFor(input, emptyDraft);
  assert.deepEqual(ids(empty), ["STANDARD_CODES_TOO_FEW"]);
  assert.deepEqual(emptyDraft.codes, []);
  assert.equal(one(empty, "STANDARD_CODES_TOO_FEW").severity, "error");
  assert.ok(one(empty, "STANDARD_CODES_TOO_FEW").blocks.includes("build-model"));
  assert.equal(hasDerivativeConnectivityNoise(empty), false);
  assert.deepEqual(ids(diagnosticsFor(input, draft(["A", "B"]))), ["STANDARD_CODES_TOO_FEW"]);
  const duplicate = diagnosticsFor(input, draft(["A", "A", "B", "C"]));
  assert.deepEqual(ids(duplicate), ["STANDARD_CODES_DUPLICATE_SELECTION"]);
  assert.equal(one(duplicate, "STANDARD_CODES_DUPLICATE_SELECTION").evidence?.totalCount, 1);
  assert.deepEqual(ids(diagnosticsFor(input, draft(["A", "A", "B"]))), [
    "STANDARD_CODES_TOO_FEW", "STANDARD_CODES_DUPLICATE_SELECTION",
  ]);
  const blank = diagnosticsFor(input, draft(["A", "B", ""]));
  assert.ok(ids(blank).includes("STANDARD_CODES_TOO_FEW"));
  assert.ok(ids(blank).includes("STANDARD_CODE_FIELD_MISSING"));
});

test("missing Code fields block without all-zero or connectivity derivative noise", () => {
  const input = healthyDataset();
  const output = diagnosticsFor(input, draft(["A", "B", "missing"]));
  const missing = one(output, "STANDARD_CODE_FIELD_MISSING");
  assert.deepEqual([missing.severity, missing.scope, missing.fieldPath], ["error", "codes", "codes.missing"]);
  assert.ok(missing.blocks.includes("build-model"));
  assert.ok(missing.summary.trim().length > 0 && missing.detail.trim().length > 0);
  assert.equal(ids(output).includes("STANDARD_CODE_ALL_ZERO"), false);
  assert.equal(hasDerivativeConnectivityNoise(output), false);
});

test("Code role collisions cover active structural and ordering roles only", () => {
  const input = dataset([
    { unit: "u", horizon: "h", group: "g", A: 1, B: 1, turn: 0, week: 0 },
    { unit: "u", horizon: "h", group: "g", A: 0, B: 1, turn: 1, week: 1 },
  ], ["unit", "horizon", "group", "A", "B", "turn", "week"]);
  for (const [code, overrides] of [
    ["unit", {}],
    ["horizon", {}],
    ["group", { groupColumn: "group" }],
  ] as const) {
    const output = diagnosticsFor(input, draft(["A", "B", code], overrides));
    assert.equal(one(output, "STANDARD_CODE_ROLE_COLLISION").fieldPath, `codes.${code}`);
    assert.equal(ids(output).includes("STANDARD_CODE_VALUE_INVALID"), false);
    assert.equal(hasDerivativeConnectivityNoise(output), false);
  }
  const activeRow = diagnosticsFor(input, draft(["A", "B", "turn"], {
    windowType: "MovingStanzaWindow",
    movingStanza: { rowOrder: ascendingNumber("turn") },
  }));
  assert.equal(one(activeRow, "STANDARD_CODE_ROLE_COLLISION").fieldPath, "codes.turn");
  const inactiveRow = diagnosticsFor(input, draft(["A", "B", "turn"], {
    windowType: "Conversation",
    movingStanza: { rowOrder: ascendingNumber("turn") },
  }));
  assert.equal(ids(inactiveRow).includes("STANDARD_CODE_ROLE_COLLISION"), false);

  const horizonOrder = ascendingNumber("week") as CanonicalHorizonOrderV3;
  const activeHorizon = diagnosticsFor(input, draft(["A", "B", "week"], {
    model: "SeparateTrajectory",
    horizonOrder,
  }));
  assert.equal(one(activeHorizon, "STANDARD_CODE_ROLE_COLLISION").fieldPath, "codes.week");
  const inactiveHorizon = diagnosticsFor(input, draft(["A", "B", "week"], {
    model: "EndPoint",
    horizonOrder,
  }));
  assert.equal(ids(inactiveHorizon).includes("STANDARD_CODE_ROLE_COLLISION"), false);
});

test("Binary accepts uniform numeric and Boolean representations without cross-Code coercion", () => {
  const numeric = dataset([
    { unit: "u", horizon: "h", A: 0, B: 1, C: 1 },
    { unit: "u", horizon: "h", A: 1, B: 0, C: 1 },
  ]);
  assert.equal(ids(diagnosticsFor(numeric)).includes("STANDARD_CODE_VALUE_INVALID"), false);
  const boolean = dataset([
    { unit: "u", horizon: "h", A: false, B: true, C: true },
    { unit: "u", horizon: "h", A: true, B: false, C: true },
  ]);
  assert.equal(ids(diagnosticsFor(boolean)).includes("STANDARD_CODE_VALUE_INVALID"), false);
  const perCode = dataset([
    { unit: "u", horizon: "h", A: 0, B: false, C: 1 },
    { unit: "u", horizon: "h", A: 1, B: true, C: 0 },
  ]);
  const output = diagnosticsFor(perCode);
  assert.equal(ids(output).includes("STANDARD_CODE_VALUE_INVALID"), false);
  assert.equal(ids(output).includes("STANDARD_CODE_DUPLICATE_PROFILE"), false);
});

for (const [label, values] of [
  ["mixed Boolean and number", [0, true]],
  ["integer two", [2, 0]],
  ["negative", [-1, 0]],
  ["fraction", [0.5, 0]],
  ["numeric string", ["1", "0"]],
  ["null", [null, 0]],
  ["undefined", [undefined, 0]],
  ["NaN", [Number.NaN, 0]],
  ["Infinity", [Number.POSITIVE_INFINITY, 0]],
  ["object", [{ value: 1 }, 0]],
] as const) {
  test(`Binary rejects ${label} without coercion`, () => {
    const input = dataset([
      { unit: "u", horizon: "h", A: values[0], B: 1, C: 1 },
      { unit: "u", horizon: "h", A: values[1], B: 0, C: 1 },
    ]);
    const output = diagnosticsFor(input);
    const invalid = one(output, "STANDARD_CODE_VALUE_INVALID");
    assert.deepEqual([invalid.fieldPath, invalid.severity, invalid.scope], ["codes.A", "error", "codes"]);
    assert.ok(invalid.blocks.includes("build-model"));
    assert.equal(hasDerivativeConnectivityNoise(output), false);
  });
}

test("Binary treats a missing own Code property as invalid", () => {
  const input = dataset([
    { unit: "u", horizon: "h", B: 1, C: 1 },
    { unit: "u", horizon: "h", A: 0, B: 0, C: 1 },
  ]);
  const invalid = one(diagnosticsFor(input), "STANDARD_CODE_VALUE_INVALID");
  assert.equal(invalid.fieldPath, "codes.A");
  assert.deepEqual(invalid.evidence?.samples.map((sample) => sample.rowIndex), [0]);
});

test("Frequency accepts finite nonnegative decimals and negative zero", () => {
  const input = dataset([
    { unit: "u", horizon: "h", A: 0.25, B: -0, C: 2 },
    { unit: "u", horizon: "h", A: 1.5, B: 1, C: 0 },
  ]);
  const output = diagnosticsFor(input, draft(["A", "B", "C"], { weighting: "frequency" }));
  assert.equal(ids(output).includes("STANDARD_CODE_VALUE_INVALID"), false);
  assert.equal(ids(output).includes("STANDARD_CODE_ALL_ZERO"), false);
});

for (const [label, value] of [
  ["Boolean", true], ["string", "1"], ["null", null], ["undefined", undefined],
  ["negative", -0.25], ["NaN", Number.NaN], ["Infinity", Number.POSITIVE_INFINITY],
  ["object", { value: 1 }],
] as const) {
  test(`Frequency rejects ${label}`, () => {
    const input = dataset([
      { unit: "u", horizon: "h", A: value, B: 1, C: 1 },
      { unit: "u", horizon: "h", A: 0, B: 0.5, C: 2 },
    ]);
    const output = diagnosticsFor(input, draft(["A", "B", "C"], { weighting: "frequency" }));
    assert.equal(one(output, "STANDARD_CODE_VALUE_INVALID").fieldPath, "codes.A");
    assert.equal(hasDerivativeConnectivityNoise(output), false);
  });
}

test("Frequency treats a missing own Code property as invalid", () => {
  const input = dataset([
    { unit: "u", horizon: "h", B: 1, C: 1 },
    { unit: "u", horizon: "h", A: 0.5, B: 0, C: 1 },
  ]);
  const output = diagnosticsFor(input, draft(["A", "B", "C"], { weighting: "frequency" }));
  assert.equal(one(output, "STANDARD_CODE_VALUE_INVALID").fieldPath, "codes.A");
});

test("all-zero Codes block building, offer confirmed exclusion, and are not also isolated", () => {
  const input = dataset([
    { unit: "u", horizon: "h", A: 1, B: 1, D: -0 },
    { unit: "u", horizon: "h", A: 0, B: 1, D: 0 },
  ], ["unit", "horizon", "A", "B", "D"]);
  const output = diagnosticsFor(input, draft(["A", "B", "D"]));
  const allZero = one(output, "STANDARD_CODE_ALL_ZERO");
  assert.deepEqual([allZero.severity, allZero.scope, allZero.fieldPath], ["error", "codes", "codes.D"]);
  assert.ok(allZero.blocks.includes("build-model"));
  assert.equal(output.some((entry) => entry.id === "STANDARD_CODE_ISOLATED" && entry.fieldPath === "codes.D"), false);
  assert.equal(allZero.evidence?.totalCount, input.rows.length);
  const action = allZero.suggestedActions?.[0];
  assert.deepEqual(action?.patch, { type: "exclude-code", code: "D" });
  assert.equal(action?.confirmationRequired, true);
  assert.ok((action?.confirmationText.length ?? 0) > 20);
});

test("isolated Codes remain selected, warn strongly, and offer only confirmed exclusion", () => {
  const input = dataset([
    { unit: "u1", horizon: "h1", A: 1, B: 1, D: 0 },
    { unit: "u2", horizon: "h2", A: 0, B: 0, D: 1 },
  ], ["unit", "horizon", "A", "B", "D"]);
  const modelDraft = draft(["A", "B", "D"]);
  const output = diagnosticsFor(input, modelDraft);
  const isolated = one(output, "STANDARD_CODE_ISOLATED");
  assert.deepEqual([isolated.severity, isolated.scope, isolated.fieldPath], ["warning", "codes", "codes.D"]);
  assert.deepEqual(isolated.blocks, []);
  assert.match(isolated.detail, /retained|meaningful|scientific/i);
  assert.deepEqual(isolated.suggestedActions?.[0].patch, { type: "exclude-code", code: "D" });
  assert.equal(isolated.suggestedActions?.[0].confirmationRequired, true);
  assert.deepEqual(modelDraft.codes, ["A", "B", "D"]);
});

test("exact typed Code profiles warn deterministically without conflating numeric and Boolean values", () => {
  const duplicateInput = dataset([
    { unit: "u", horizon: "h", A: 1, B: 1, C: 0 },
    { unit: "u", horizon: "h", A: 0, B: 0, C: 1 },
  ]);
  const forward = diagnosticsFor(duplicateInput);
  const duplicate = one(forward, "STANDARD_CODE_DUPLICATE_PROFILE");
  assert.equal(duplicate.severity, "warning");
  assert.equal(duplicate.fieldPath, "codes.B");
  assert.deepEqual(duplicate.blocks, []);
  assert.deepEqual(duplicate.suggestedActions?.[0].patch, { type: "exclude-code", code: "B" });

  const reversedInput = dataset([...duplicateInput.rows].reverse() as Array<Record<string, unknown>>);
  const reversed = one(diagnosticsFor(reversedInput), "STANDARD_CODE_DUPLICATE_PROFILE");
  assert.deepEqual(
    { id: duplicate.id, fieldPath: duplicate.fieldPath, identity: duplicate.evidence?.samples[0]?.identity },
    { id: reversed.id, fieldPath: reversed.fieldPath, identity: reversed.evidence?.samples[0]?.identity },
  );

  const typed = dataset([
    { unit: "u", horizon: "h", A: 1, B: true, C: 0 },
    { unit: "u", horizon: "h", A: 0, B: false, C: 1 },
  ]);
  assert.equal(ids(diagnosticsFor(typed)).includes("STANDARD_CODE_DUPLICATE_PROFILE"), false);
});

test("a resolved candidate network with no edge emits the global blocking error", () => {
  const input = dataset([
    { unit: "u1", horizon: "h1", A: 1, B: 0, C: 0 },
    { unit: "u2", horizon: "h2", A: 0, B: 1, C: 0 },
    { unit: "u3", horizon: "h3", A: 0, B: 0, C: 1 },
  ]);
  const output = diagnosticsFor(input);
  const global = one(output, "STANDARD_NO_GLOBAL_COOCCURRENCE");
  assert.deepEqual([global.severity, global.scope], ["error", "codes"]);
  assert.ok(global.blocks.includes("build-model"));
  assert.equal(output.filter((entry) => entry.id === "STANDARD_CODE_ISOLATED").length, 3);
});

test("Conversation aggregates across rows within a typed Horizon but never across Horizons", () => {
  const within = dataset([
    { unit: "u", horizon: "h", A: 1, B: 0, C: 0 },
    { unit: "u", horizon: "h", A: 0, B: 1, C: 1 },
  ]);
  const withinOutput = diagnosticsFor(within);
  assert.equal(ids(withinOutput).includes("STANDARD_NO_GLOBAL_COOCCURRENCE"), false);
  assert.equal(ids(withinOutput).includes("STANDARD_CODE_ISOLATED"), false);

  const across = dataset([
    { unit: "u1", horizon: "h1", A: 1, B: 0, C: 0 },
    { unit: "u2", horizon: "h2", A: 0, B: 1, C: 1 },
  ]);
  const acrossOutput = diagnosticsFor(across);
  assert.equal(one(acrossOutput, "STANDARD_CODE_ISOLATED").fieldPath, "codes.A");
  assert.equal(ids(acrossOutput).includes("STANDARD_NO_GLOBAL_COOCCURRENCE"), false);
});

function movingDraft(
  backward: StandardEnaDraftV3["movingStanza"]["backward"],
  forward: StandardEnaDraftV3["movingStanza"]["forward"],
  rowOrder: CanonicalRowOrderV3 | null = ascendingNumber("turn"),
): StandardEnaDraftV3 {
  return draft(["A", "B", "C"], {
    windowType: "MovingStanzaWindow",
    movingStanza: { backward, forward, rowOrder },
  });
}

function orderedSingletonRows(): ParsedDataset {
  return dataset([
    { unit: "u", horizon: "h", turn: 3, A: 0, B: 0, C: 1 },
    { unit: "u", horizon: "h", turn: 1, A: 1, B: 0, C: 0 },
    { unit: "u", horizon: "h", turn: 2, A: 0, B: 1, C: 0 },
  ], ["unit", "horizon", "turn", "A", "B", "C"]);
}

test("Moving Stanza finite back one means current only; larger back and forward form candidate edges", () => {
  const input = orderedSingletonRows();
  const currentOnly = diagnosticsFor(input, movingDraft(
    { kind: "finite", value: 1 }, { kind: "finite", value: 0 },
  ));
  one(currentOnly, "STANDARD_NO_GLOBAL_COOCCURRENCE");

  const backwardTwo = diagnosticsFor(input, movingDraft(
    { kind: "finite", value: 2 }, { kind: "finite", value: 0 },
  ));
  assert.equal(hasDerivativeConnectivityNoise(backwardTwo), false);

  const forwardOne = diagnosticsFor(input, movingDraft(
    { kind: "finite", value: 1 }, { kind: "finite", value: 1 },
  ));
  assert.equal(hasDerivativeConnectivityNoise(forwardOne), false);
});

test("Moving Stanza backward, forward, and both Infinity stop at Horizon boundaries", () => {
  const input = orderedSingletonRows();
  for (const [backward, forward] of [
    [{ kind: "infinity" }, { kind: "finite", value: 0 }],
    [{ kind: "finite", value: 1 }, { kind: "infinity" }],
    [{ kind: "infinity" }, { kind: "infinity" }],
  ] as const) {
    assert.equal(hasDerivativeConnectivityNoise(diagnosticsFor(input, movingDraft(backward, forward))), false);
  }

  const boundaryInput = dataset([
    { unit: "u1", horizon: "h1", turn: 1, A: 1, B: 0, C: 0 },
    { unit: "u2", horizon: "h2", turn: 1, A: 0, B: 1, C: 1 },
  ], ["unit", "horizon", "turn", "A", "B", "C"]);
  const boundary = diagnosticsFor(boundaryInput, movingDraft({ kind: "infinity" }, { kind: "infinity" }));
  assert.equal(one(boundary, "STANDARD_CODE_ISOLATED").fieldPath, "codes.A");
});

test("Moving Stanza accepts matching source-order confirmation", () => {
  const input = orderedSingletonRows();
  const output = diagnosticsFor(input, movingDraft(
    { kind: "finite", value: 2 },
    { kind: "finite", value: 0 },
    confirmedSourceOrder(input.rows.length),
  ));
  assert.equal(ids(output).includes("STANDARD_ROW_ORDER_INVALID"), false);
});

test("unresolved row order, invalid extents, and invalid identities suppress derivative connectivity", () => {
  const input = orderedSingletonRows();
  const required = diagnosticsFor(input, movingDraft(
    { kind: "finite", value: 1 }, { kind: "finite", value: 0 }, null,
  ));
  one(required, "STANDARD_ROW_ORDER_REQUIRED");
  assert.equal(hasDerivativeConnectivityNoise(required), false);

  const tied = dataset([
    { unit: "u", horizon: "h", turn: 1, A: 1, B: 0, C: 0 },
    { unit: "u", horizon: "h", turn: 1, A: 0, B: 1, C: 1 },
  ], ["unit", "horizon", "turn", "A", "B", "C"]);
  const tieOutput = diagnosticsFor(tied, movingDraft(
    { kind: "finite", value: 2 }, { kind: "finite", value: 0 },
  ));
  one(tieOutput, "STANDARD_ROW_ORDER_INVALID");
  assert.equal(hasDerivativeConnectivityNoise(tieOutput), false);

  const invalidWindow = movingDraft({ kind: "finite", value: 0 }, { kind: "finite", value: 0 });
  const invalidWindowOutput = diagnosticsFor(input, invalidWindow);
  one(invalidWindowOutput, "STANDARD_ROW_ORDER_INVALID");
  assert.equal(hasDerivativeConnectivityNoise(invalidWindowOutput), false);

  const missingIdentity = dataset([
    { unit: "u", turn: 1, A: 1, B: 0, C: 0 },
    { unit: "u", turn: 2, A: 0, B: 1, C: 1 },
  ], ["unit", "horizon", "turn", "A", "B", "C"]);
  const identityOutput = diagnosticsFor(missingIdentity, movingDraft(
    { kind: "finite", value: 2 }, { kind: "finite", value: 0 },
  ));
  one(identityOutput, "STANDARD_ROW_ORDER_INVALID");
  assert.equal(hasDerivativeConnectivityNoise(identityOutput), false);
});

test("dataset and binding trust failures emit one stable blocking diagnostic and suppress derivatives", () => {
  const input = healthyDataset();
  const cases: Array<[string, ParsedDataset, DatasetBindingV3]> = [
    ["row count", input, binding(input, { rowCount: input.rows.length + 1 })],
    ["table hash", input, binding(input, { normalizedTableSha256: "BAD" })],
    ["header hash", input, binding(input, { headerSha256: "BAD" })],
    ["hash kind", { ...input, hashKind: "normalized-utf8-text-sha256" }, binding(input)],
    ["duplicate header", { ...input, headers: ["unit", "horizon", "A", "A", "C"] }, binding(input)],
    ["blank header", { ...input, headers: ["unit", "horizon", "A", " ", "C"] }, binding(input)],
  ];
  for (const [label, caseDataset, caseBinding] of cases) {
    const output = diagnosticsFor(caseDataset, draft(["A", "B", "C"]), caseBinding);
    assert.deepEqual(ids(output), ["STANDARD_DATASET_BINDING_INVALID"], label);
    const invalid = output[0];
    assert.deepEqual([invalid.severity, invalid.scope, invalid.fieldPath], ["error", "dataset", "dataset"]);
    assert.ok(invalid.blocks.includes("build-model"));
    assert.equal(hasDerivativeConnectivityNoise(output), false);
  }
});

test("dataset trust boundary avoids ordinary Proxy gets and accepts stable descriptor snapshots", () => {
  let ordinaryGets = 0;
  const noGet = () => {
    ordinaryGets += 1;
    throw new Error("ordinary get must not run");
  };
  const rows = [
    new Proxy({ unit: "u", horizon: "h", A: 1, B: 1, C: 0 }, { get: noGet }),
    new Proxy({ unit: "u", horizon: "h", A: 0, B: 0, C: 1 }, { get: noGet }),
  ];
  const headers = new Proxy([...DEFAULT_HEADERS], { get: noGet });
  const rowsArray = new Proxy(rows, { get: noGet });
  const datasetProxy = new Proxy({
    name: "codes.csv",
    headers,
    rows: rowsArray,
    sizeBytes: 1,
    source: "upload" as const,
  }, { get: noGet });
  const bindingProxy = new Proxy({
    hashKind: "normalized-utf8-csv-text-sha256" as const,
    normalizedTableSha256: DATASET_HASH,
    rowCount: 2,
    headerSha256: HEADER_HASH,
  }, { get: noGet });
  const output = validateStandardDraftV3(datasetProxy, bindingProxy, draft(["A", "B", "C"]));
  assert.equal(ordinaryGets, 0);
  assert.equal(ids(output).includes("STANDARD_DATASET_BINDING_INVALID"), false);
});

test("accessor, class, sparse, and exotic dataset structures fail closed as binding diagnostics", () => {
  const accessorRow: Record<string, unknown> = { unit: "u", horizon: "h", B: 1, C: 1 };
  Object.defineProperty(accessorRow, "A", { enumerable: true, get: () => 1 });
  class RowClass {
    unit = "u";
    horizon = "h";
    A = 1;
    B = 1;
    C = 0;
  }
  const sparseRows = new Array<Record<string, unknown>>(2);
  sparseRows[1] = { unit: "u", horizon: "h", A: 1, B: 1, C: 0 };
  const cases = [
    dataset([accessorRow]),
    dataset([new RowClass() as unknown as Record<string, unknown>]),
    dataset(sparseRows),
  ];
  for (const input of cases) {
    const output = diagnosticsFor(input, draft(["A", "B", "C"]), binding(input));
    assert.deepEqual(ids(output), ["STANDARD_DATASET_BINDING_INVALID"]);
  }
});

test("direct JavaScript malformed draft structures fail closed instead of being silently accepted", () => {
  const input = healthyDataset();
  const malformedCases: unknown[] = [
    { ...draft(["A", "B", "C"]), codes: { A: true } },
    { ...draft(["A", "B", "C"]), weighting: "sum" },
    { ...draft(["A", "B", "C"]), unitColumns: ["unit", , "other"] },
    { ...draft(["A", "B", "C"]), horizonColumns: new Date() },
  ];
  for (const malformed of malformedCases) {
    assert.throws(() => validateStandardDraftV3(
      input,
      binding(input),
      malformed as StandardEnaDraftV3,
    ), /draft|codes|weighting|columns|array|shape|plain/i);
  }
});

test("malformed active row and Horizon order policies cannot pass the direct JavaScript boundary", () => {
  const input = dataset([
    { unit: "u", horizon: "h1", turn: 1, A: 1, B: 1, C: 0 },
    { unit: "u", horizon: "h2", turn: 2, A: 0, B: 1, C: 1 },
  ], [...DEFAULT_HEADERS, "turn"]);
  const malformedOrder = {
    kind: "columns",
    keys: [{ column: "turn", direction: "ascending", comparator: { type: "mystery" } }],
  } as unknown as CanonicalRowOrderV3;
  const rowOutput = diagnosticsFor(input, draft(["A", "B", "C"], {
    windowType: "MovingStanzaWindow",
    movingStanza: { rowOrder: malformedOrder },
  }));
  one(rowOutput, "STANDARD_ROW_ORDER_INVALID");
  assert.equal(hasDerivativeConnectivityNoise(rowOutput), false);

  const horizonOutput = diagnosticsFor(input, draft(["A", "B", "C"], {
    model: "SeparateTrajectory",
    horizonOrder: malformedOrder,
  }));
  one(horizonOutput, "STANDARD_HORIZON_ORDER_INVALID");
  assert.equal(hasDerivativeConnectivityNoise(horizonOutput), false);
});

test("invalid-value evidence is exact, safely bounded, and never copies raw values", () => {
  const secret = "SECRET_RAW_VALUE_DO_NOT_COPY";
  const rows = Array.from({ length: 8 }, (_, rowIndex) => ({
    unit: `u${rowIndex}`,
    horizon: `h${rowIndex}`,
    A: secret,
    B: 1,
    C: 1,
  }));
  const invalid = one(diagnosticsFor(dataset(rows)), "STANDARD_CODE_VALUE_INVALID");
  assert.equal(invalid.evidence?.totalCount, 8);
  assert.equal(invalid.evidence?.sampleLimit, 5);
  assert.equal(invalid.evidence?.samples.length, 5);
  assert.equal(invalid.evidence?.truncated, true);
  assert.deepEqual(invalid.evidence?.samples.map((sample) => sample.rowIndex), [0, 1, 2, 3, 4]);
  assert.equal(JSON.stringify(invalid.evidence).includes(secret), false);
});

test("all emitted evidence and actions obey the total-count and scientific-confirmation contracts", () => {
  const input = dataset([
    { unit: "u1", horizon: "h1", A: 1, B: 1, D: 0 },
    { unit: "u2", horizon: "h2", A: 0, B: 0, D: 1 },
  ], ["unit", "horizon", "A", "B", "D"]);
  const output = diagnosticsFor(input, draft(["A", "B", "D", "missing"]));
  for (const entry of output) {
    assert.ok(entry.summary.trim().length > 0);
    assert.ok(entry.detail.trim().length > 0);
    if (entry.severity === "error") assert.ok(entry.blocks.includes("build-model"));
    if (entry.id === "STANDARD_CODE_ISOLATED" || entry.id === "STANDARD_CODE_DUPLICATE_PROFILE") {
      assert.equal(entry.blocks.includes("build-model"), false);
    }
    if (entry.evidence !== undefined) {
      assert.equal(entry.evidence.sampleLimit, 5);
      assert.ok(entry.evidence.totalCount >= entry.evidence.samples.length);
      assert.ok(entry.evidence.samples.length <= 5);
      assert.equal(entry.evidence.truncated, entry.evidence.totalCount > entry.evidence.samples.length);
      for (const sample of entry.evidence.samples) {
        assert.ok(sample.detail.trim().length > 0);
        assert.deepEqual(Object.keys(sample).every((key) => ["rowIndex", "identity", "detail"].includes(key)), true);
      }
    }
    for (const action of entry.suggestedActions ?? []) {
      assert.equal(action.confirmationRequired, true);
      assert.ok(action.confirmationText.trim().length > 20);
    }
  }
});

test("diagnostics are detached, recursively frozen, and deterministically ordered", () => {
  const rows = Array.from({ length: 6 }, (_, rowIndex) => ({
    unit: `u${rowIndex}`,
    horizon: `h${rowIndex}`,
    A: "invalid",
    B: 1,
    C: 1,
  }));
  const input = dataset(rows);
  const modelDraft = draft(["C", "A", "B", "missing"]);
  const output = diagnosticsFor(input, modelDraft);
  const serialized = JSON.stringify(output);
  input.headers.reverse();
  (rows[0] as Record<string, unknown>).A = 1;
  modelDraft.codes.reverse();
  assert.equal(JSON.stringify(output), serialized);
  assert.ok(Object.isFrozen(output));
  for (const entry of output) {
    assert.ok(Object.isFrozen(entry));
    assert.ok(Object.isFrozen(entry.blocks));
    if (entry.evidence !== undefined) {
      assert.ok(Object.isFrozen(entry.evidence));
      assert.ok(Object.isFrozen(entry.evidence.samples));
      assert.ok(entry.evidence.samples.every(Object.isFrozen));
    }
    if (entry.suggestedActions !== undefined) {
      assert.ok(Object.isFrozen(entry.suggestedActions));
      assert.ok(entry.suggestedActions.every(Object.isFrozen));
      assert.ok(entry.suggestedActions.every((action) => Object.isFrozen(action.patch)));
    }
  }
  assert.throws(() => (output as ModelDiagnosticV3[]).push(output[0]), TypeError);

  const insertionA = dataset([{ unit: "u", horizon: "h", A: "x", B: 1, C: 1 }]);
  const insertionB = dataset([{ C: 1, B: 1, A: "x", horizon: "h", unit: "u" }]);
  assert.deepEqual(diagnosticsFor(insertionA), diagnosticsFor(insertionB));
  const orderKeys = output.map((entry) => `${String(MODEL_DIAGNOSTIC_IDS_V3.indexOf(entry.id)).padStart(2, "0")}:${entry.fieldPath ?? ""}`);
  assert.deepEqual(orderKeys, [...orderKeys].sort());
});
