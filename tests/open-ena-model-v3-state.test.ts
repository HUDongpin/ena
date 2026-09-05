import assert from "node:assert/strict";
import test from "node:test";
import {
  createModelStateV3,
  modelScientificContextV3,
  modelStateReducerV3 as reduce,
} from "../components/open-ena/model-v3/model-state";
import type { ModelStateV3 } from "../components/open-ena/model-v3/model-state";
import type { ModelWorkspaceDraftsV3 } from "../lib/open-ena/model-v3/types";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";
import { bindResultV3 } from "../lib/open-ena/model-v3/result-binding";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import {
  compileOnaDraftV3,
  compileStandardDraftV3,
} from "../lib/open-ena/model-v3/compiler";
import {
  buildOnaExecutionPlanV3,
  runOnaPlanV3,
} from "../lib/open-ena/model-v3/ona-adapter";
import { bindOnaResultV3 } from "../lib/open-ena/model-v3/ona-result-binding";
import type { ParsedDataset } from "../lib/open-ena/types";

const datasetSha256 = "a".repeat(64);
function drafts(): ModelWorkspaceDraftsV3 {
  return {
    schemaVersion: 3,
    activeFamily: "standard",
    standard: {
      unitColumns: ["unit"],
      horizonColumns: ["horizon"],
      groupColumn: "group",
      codes: ["A", "B", "C"],
      weighting: "frequency",
      model: "EndPoint",
      windowType: "Conversation",
      movingStanza: {
        backward: { kind: "finite", value: 1 },
        forward: { kind: "finite", value: 0 },
        rowOrder: null,
      },
      horizonOrder: null,
      rotation: { type: "svd", centerAlignToOrigin: true },
    },
    ona: {
      unitColumns: ["person"],
      horizonColumns: ["session"],
      groupColumn: "cohort",
      codes: ["C", "A", "B"],
      backward: { kind: "finite", value: 7 },
      rowOrder: null,
      directionalMask: {
        schemaVersion: 1,
        codeOrder: ["C", "A", "B"],
        enabled: [
          [false, true, false],
          [true, false, true],
          [false, false, true],
        ],
      },
    },
  };
}
function initial() {
  return createModelStateV3(drafts(), datasetSha256);
}
function running(state: ModelStateV3, hash = "b".repeat(64)) {
  return reduce(state, {
    type: "mark-running",
    executionPlanSha256: hash,
    context: modelScientificContextV3(state),
  });
}
let fixturePromise: ReturnType<typeof makeFixture> | undefined;
async function makeFixture() {
  let draft = drafts().standard;
  const f = await bindingFixtureV3(datasetSha256, (input, data) => {
    draft = structuredClone(input);
    data.rows.forEach((row, i) => {
      row.group = [1, "1", true][i % 3];
    });
  });
  const result = await bindResultV3(
    f.plan,
    runStandardPlanV3(f.plan),
    {
      processedRows: f.plan.rows.length,
      maximumBufferedRows: 0,
      numericCellsAllocated: 120,
      peakBytesObservedOrBounded: 10240,
      observationMethod: "exact-counters-and-conservative-byte-bound",
    },
    f.compiled.diagnostics,
  );
  return { ...f, result, draft };
}
async function current() {
  const f = await (fixturePromise ??= makeFixture());
  const state = running(
    createModelStateV3({ ...drafts(), standard: f.draft }, datasetSha256),
    f.plan.header.executionPlanSha256,
  );
  assert.ok(state.runningRequest);
  return {
    ...f,
    state: reduce(state, {
      type: "accept-result",
      request: state.runningRequest,
      result: f.result,
    }),
  };
}

test("creation captures independent editable drafts and rejects unsafe structure", () => {
  const input = drafts();
  input.standard.codes = [];
  input.standard.unitColumns = [];
  input.standard.movingStanza.backward = { kind: "finite", value: -2 };
  input.standard.rotation = {
    type: "means",
    centerAlignToOrigin: false,
    negativeLevel: null,
    positiveLevel: null,
  };
  const state = createModelStateV3(input, datasetSha256);
  input.standard.codes.push("mutated");
  assert.deepEqual(state.drafts.standard.codes, []);
  assert.equal(state.drafts.standard.movingStanza.backward.kind, "finite");
  assert.equal(state.resultStatus, "none");
  assert.equal(state.result, null);
  assert.ok(Object.isFrozen(state.drafts.standard));
  for (const bad of [
    { ...drafts(), schemaVersion: 2 },
    { ...drafts(), activeFamily: "tma" },
    { ...drafts(), extra: true },
    {
      ...drafts(),
      standard: { ...drafts().standard, backward: { kind: "infinity" } },
    },
  ])
    assert.throws(() =>
      createModelStateV3(bad as ModelWorkspaceDraftsV3, datasetSha256),
    );
  assert.throws(() => createModelStateV3(drafts(), "not-a-hash"));
});

test("draft replacement preserves incomplete grammar without invoking getters or repairing masks", () => {
  const state = initial();
  const empty = { ...state.drafts.standard, codes: [], horizonOrder: null };
  const replaced = reduce(state, {
    type: "replace-standard-draft",
    draft: empty,
  });
  assert.deepEqual(replaced.drafts.standard, empty);
  assert.equal(replaced.scientificRevision, 1);
  assert.equal(replaced.drafts.ona, state.drafts.ona);
  let reads = 0;
  const hostile = { ...drafts().standard };
  Object.defineProperty(hostile, "codes", {
    enumerable: true,
    get: () => {
      reads++;
      return [];
    },
  });
  assert.throws(() =>
    reduce(state, { type: "replace-standard-draft", draft: hostile }),
  );
  assert.equal(reads, 0);
  assert.throws(() =>
    reduce(state, {
      type: "replace-ona-draft",
      draft: { ...drafts().ona, codes: ["A"] },
    }),
  );
  assert.throws(() =>
    reduce(state, {
      type: "replace-standard-draft",
      draft: { ...drafts().standard, codes: new Array(2) },
    }),
  );
  assert.throws(() =>
    reduce(state, {
      type: "replace-standard-draft",
      draft: {
        ...drafts().standard,
        movingStanza: {
          ...drafts().standard.movingStanza,
          backward: { kind: "finite", value: Infinity },
        },
      },
    }),
  );
});

test("Hide Codes changes display only while Exclude all truly empties the active draft", async () => {
  const { state, result } = await current();
  const hidden = reduce(state, { type: "hide-all-codes" });
  assert.equal(hidden.drafts, state.drafts);
  assert.equal(hidden.display.standard.allCodesSuppressed, true);
  assert.equal(hidden.scientificRevision, state.scientificRevision);
  assert.equal(hidden.result, result);
  const excluded = reduce(hidden, { type: "exclude-all-codes" });
  assert.deepEqual(excluded.drafts.standard.codes, []);
  assert.equal(excluded.drafts.ona, state.drafts.ona);
  assert.equal(excluded.scientificRevision, state.scientificRevision + 1);
  assert.equal(excluded.resultStatus, "stale");
  assert.equal(excluded.result, result);
  assert.equal(reduce(excluded, { type: "exclude-all-codes" }), excluded);
});

test("family switches preserve both drafts, stale results and obsolete requests; same family is referentially unchanged", async () => {
  const { state } = await current();
  const active = running(state);
  const switched = reduce(active, { type: "set-active-family", family: "ona" });
  assert.equal(switched.drafts.standard, state.drafts.standard);
  assert.equal(switched.drafts.ona, state.drafts.ona);
  assert.equal(switched.drafts.activeFamily, "ona");
  assert.equal(switched.scientificRevision, active.scientificRevision + 1);
  assert.equal(switched.resultStatus, "stale");
  assert.equal(switched.runStatus, "obsolete");
  assert.equal(switched.undo, null);
  assert.equal(
    reduce(switched, { type: "set-active-family", family: "ona" }),
    switched,
  );
  assert.equal(
    reduce(switched, { type: "set-active-family", family: "standard" })
      .resultStatus,
    "stale",
  );
});

test("editing an inactive family preserves the active execution and independent Undo", async () => {
  const { state } = await current();
  const active = running(reduce(state, { type: "exclude-code", code: "A" }));
  const next = reduce(active, {
    type: "replace-ona-draft",
    draft: { ...active.drafts.ona, backward: { kind: "infinity" } },
  });
  assert.equal(next.scientificRevision, active.scientificRevision);
  assert.equal(next.runningRequest, active.runningRequest);
  assert.equal(next.resultStatus, active.resultStatus);
  assert.equal(next.undo, active.undo);
});

test("ONA exclusions restrict the exact existing matrix including empty Codes and Undo restores it", () => {
  const state = reduce(initial(), { type: "set-active-family", family: "ona" });
  const excluded = reduce(state, { type: "exclude-code", code: "A" });
  assert.deepEqual(excluded.drafts.ona.codes, ["C", "B"]);
  assert.deepEqual(excluded.drafts.ona.directionalMask, {
    schemaVersion: 1,
    codeOrder: ["C", "B"],
    enabled: [
      [false, false],
      [false, true],
    ],
  });
  assert.equal(excluded.drafts.standard, state.drafts.standard);
  assert.deepEqual(
    reduce(excluded, { type: "undo-model-edit" }).drafts,
    state.drafts,
  );
  const empty = reduce(state, { type: "exclude-all-codes" });
  assert.deepEqual(empty.drafts.ona.directionalMask, {
    schemaVersion: 1,
    codeOrder: [],
    enabled: [],
  });
  assert.deepEqual(
    reduce(empty, { type: "undo-model-edit" }).drafts,
    state.drafts,
  );
  const nullMask = reduce(state, {
    type: "replace-ona-draft",
    draft: { ...state.drafts.ona, directionalMask: null },
  });
  assert.equal(
    reduce(nullMask, { type: "exclude-code", code: "A" }).drafts.ona
      .directionalMask,
    null,
  );
});

test("Group exclusion preserves selected Means and all other settings and has exact Undo", async () => {
  const { state } = await current();
  const means = reduce(state, {
    type: "replace-standard-draft",
    draft: {
      ...state.drafts.standard,
      rotation: {
        type: "means",
        centerAlignToOrigin: false,
        negativeLevel: { type: "number", value: 1 },
        positiveLevel: { type: "string", value: "1" },
      },
    },
  });
  const excluded = reduce(means, { type: "exclude-group-configuration" });
  assert.equal(excluded.drafts.standard.groupColumn, null);
  assert.deepEqual(excluded.drafts.standard.rotation, {
    type: "means",
    centerAlignToOrigin: false,
    negativeLevel: null,
    positiveLevel: null,
  });
  assert.deepEqual(
    excluded.drafts.standard.unitColumns,
    means.drafts.standard.unitColumns,
  );
  assert.equal(excluded.resultStatus, "stale");
  assert.deepEqual(
    reduce(excluded, { type: "undo-model-edit" }).drafts,
    means.drafts,
  );
  const ona = reduce(state, { type: "set-active-family", family: "ona" });
  const cleared = reduce(ona, { type: "exclude-group-configuration" });
  assert.deepEqual(cleared.drafts.ona, {
    ...ona.drafts.ona,
    groupColumn: null,
  });
  assert.equal(cleared.drafts.standard, ona.drafts.standard);
});

test("Undo binds dataset, active family and exact resulting draft and never declares restored science current", async () => {
  const { state } = await current();
  const excluded = reduce(state, { type: "exclude-code", code: "B" });
  assert.ok(excluded.undo);
  assert.match(
    excluded.undo.resultingDraftFingerprint,
    /^model-draft-json-v3:/,
  );
  const displayEdit = reduce(excluded, {
    type: "set-code-color",
    code: "A",
    color: "#112233",
  });
  const restored = reduce(displayEdit, { type: "undo-model-edit" });
  assert.deepEqual(restored.drafts, state.drafts);
  assert.equal(restored.resultStatus, "stale");
  assert.equal(restored.undo, null);
  assert.equal(restored.display.standard.codeColors.A, "#112233");
  for (const mismatched of [
    { ...excluded, datasetSha256: "c".repeat(64) },
    {
      ...excluded,
      drafts: { ...excluded.drafts, activeFamily: "ona" as const },
    },
    {
      ...excluded,
      drafts: {
        ...excluded.drafts,
        standard: { ...excluded.drafts.standard, weighting: "binary" as const },
      },
    },
  ]) {
    const rejected = reduce(mismatched, { type: "undo-model-edit" });
    assert.equal(rejected.undo, null);
    assert.equal(rejected.drafts, mismatched.drafts);
    assert.equal(rejected.scientificRevision, mismatched.scientificRevision);
  }
  const conflicting = reduce(excluded, {
    type: "replace-standard-draft",
    draft: { ...excluded.drafts.standard, weighting: "binary" },
  });
  assert.equal(conflicting.undo, null);
  assert.equal(reduce(conflicting, { type: "undo-model-edit" }), conflicting);
});

test("dataset changes obsolete execution, stale retained results, clear Undo and snapshots without rewriting drafts", async () => {
  const { state } = await current();
  const edited = running(
    reduce(reduce(state, { type: "hide-all-codes" }), {
      type: "exclude-code",
      code: "B",
    }),
  );
  const next = reduce(edited, {
    type: "set-dataset",
    datasetSha256: "c".repeat(64),
  });
  assert.equal(next.drafts, edited.drafts);
  assert.equal(next.runStatus, "obsolete");
  assert.equal(next.result, state.result);
  assert.equal(next.resultStatus, "stale");
  assert.equal(next.undo, null);
  assert.equal(next.display.standard.codeVisibilitySnapshot, null);
  assert.equal(next.display.standard.allCodesSuppressed, false);
  assert.equal(
    reduce(next, { type: "set-dataset", datasetSha256: next.datasetSha256 }),
    next,
  );
});

test("Code visibility and Group layer bulk suppression restores exact prior settings once", async () => {
  const { state } = await current();
  const groupToken =
    state.result!.executionProvenance.identityDictionary.groups[0].token;
  const configured = reduce(
    reduce(state, { type: "set-code-visible", code: "B", visible: false }),
    {
      type: "set-group-display",
      groupToken,
      patch: {
        showMean: false,
        showOutlierIntervals: true,
        includeHiddenPoints: true,
      },
    },
  );
  const hidden = reduce(reduce(configured, { type: "hide-all-codes" }), {
    type: "hide-all-groups",
  });
  assert.equal(reduce(hidden, { type: "hide-all-codes" }), hidden);
  assert.equal(reduce(hidden, { type: "hide-all-groups" }), hidden);
  assert.equal(hidden.display.standard.allGroupsSuppressed, true);
  // Edits made while suppressed do not overwrite the exact pre-Hide snapshot.
  const patched = reduce(
    reduce(hidden, { type: "set-code-visible", code: "A", visible: false }),
    {
      type: "set-group-display",
      groupToken,
      patch: { showMean: true },
    },
  );
  const restored = reduce(
    reduce(patched, { type: "restore-code-visibility" }),
    { type: "restore-group-visibility" },
  );
  assert.deepEqual(
    restored.display.standard.codeVisibility,
    configured.display.standard.codeVisibility,
  );
  assert.deepEqual(
    restored.display.standard.groups,
    configured.display.standard.groups,
  );
  assert.equal(restored.display.standard.codeVisibilitySnapshot, null);
  assert.equal(restored.display.standard.groupVisibilitySnapshot, null);
  assert.equal(restored.result, state.result);
  assert.equal(restored.scientificRevision, state.scientificRevision);
});

test("visibility snapshots cannot restore onto a different admitted result identity, dataset or family", async () => {
  const { state, result } = await current();
  const hidden = reduce(reduce(state, { type: "hide-all-codes" }), {
    type: "hide-all-groups",
  });
  for (const mismatched of [
    { ...hidden, result: { ...result } },
    { ...hidden, datasetSha256: "d".repeat(64) },
  ]) {
    const next = reduce(
      reduce(mismatched, { type: "restore-code-visibility" }),
      { type: "restore-group-visibility" },
    );
    assert.equal(next.display.standard.codeVisibilitySnapshot, null);
    assert.equal(next.display.standard.groupVisibilitySnapshot, null);
    assert.equal(next.display.standard.allCodesSuppressed, false);
    assert.equal(next.display.standard.allGroupsSuppressed, false);
  }
  const switched = reduce(hidden, { type: "set-active-family", family: "ona" });
  assert.equal(reduce(switched, { type: "restore-code-visibility" }), switched);
});

test("Group display uses actual typed bound tokens and cannot coerce typed levels or patch science", async () => {
  const { state } = await current();
  const groups = state.result!.executionProvenance.identityDictionary.groups;
  const number = groups.find((g) => g.fields[0].value.type === "number")!;
  const string = groups.find((g) => g.fields[0].value.type === "string")!;
  assert.notEqual(number.token, string.token);
  const next = reduce(state, {
    type: "set-group-display",
    groupToken: number.token,
    patch: { showMean: false },
  });
  assert.equal(next.display.standard.groups[number.token].showMean, false);
  assert.equal(next.display.standard.groups[string.token].showMean, true);
  assert.throws(() =>
    reduce(state, {
      type: "set-group-display",
      groupToken: "1",
      patch: { showMean: false },
    }),
  );
  assert.throws(() =>
    reduce(state, {
      type: "set-group-display",
      groupToken: number.token,
      patch: { showMean: "false" } as never,
    }),
  );
  assert.throws(() =>
    reduce(state, {
      type: "set-group-display",
      groupToken: number.token,
      patch: { contrast: "change" } as never,
    }),
  );
  assert.throws(() =>
    reduce(initial(), {
      type: "set-group-display",
      groupToken: number.token,
      patch: { showMean: false },
    }),
  );
  assert.equal(next.result, state.result);
});

test("per-Code presentation accepts source keys and exact permutations without altering running science", () => {
  const state = running(initial());
  const changed = reduce(
    reduce(
      reduce(state, { type: "set-code-visible", code: "B", visible: false }),
      {
        type: "set-code-color",
        code: "A",
        color: "#abcdef",
      },
    ),
    { type: "set-code-order", codes: ["C", "A", "B"] },
  );
  assert.equal(changed.drafts, state.drafts);
  assert.equal(changed.runStatus, "running");
  assert.equal(changed.runningRequest, state.runningRequest);
  assert.equal(changed.scientificRevision, state.scientificRevision);
  for (const codes of [
    ["A", "A", "B"],
    ["A", "B"],
    ["A", "B", "D"],
    ["A", "B", "C", "D"],
  ]) {
    assert.throws(() => reduce(state, { type: "set-code-order", codes }));
  }
  assert.throws(() =>
    reduce(state, {
      type: "set-code-visible",
      code: "unknown",
      visible: false,
    }),
  );
  assert.throws(() =>
    reduce(state, { type: "set-code-color", code: "unknown", color: "red" }),
  );
  const excluded = reduce(changed, { type: "exclude-code", code: "A" });
  assert.deepEqual(excluded.display.standard.codeOrder, ["C", "B"]);
  assert.deepEqual(excluded.drafts.standard.codes, ["B", "C"]);
});

test("source Code strings resembling object keys are preserved as own display properties", () => {
  const input = drafts();
  input.standard.codes = ["__proto__", "constructor", "A|B"];
  const state = createModelStateV3(input, datasetSha256);
  const next = reduce(
    reduce(state, {
      type: "set-code-visible",
      code: "__proto__",
      visible: false,
    }),
    {
      type: "set-code-color",
      code: "constructor",
      color: "#123456",
    },
  );
  assert.equal(
    Object.hasOwn(next.display.standard.codeVisibility, "__proto__"),
    true,
  );
  assert.equal(next.display.standard.codeVisibility.__proto__, false);
  assert.equal(next.display.standard.codeColors.constructor, "#123456");
  assert.deepEqual(
    reduce(next, { type: "exclude-code", code: "A|B" }).drafts.standard.codes,
    ["__proto__", "constructor"],
  );
});

test("same-value replacements and unknown exclusion are no-ops, preserving Undo and request", () => {
  const state = running(reduce(initial(), { type: "exclude-code", code: "A" }));
  assert.equal(
    reduce(state, {
      type: "replace-standard-draft",
      draft: structuredClone(state.drafts.standard),
    }),
    state,
  );
  assert.equal(reduce(state, { type: "exclude-code", code: "missing" }), state);
  assert.equal(
    reduce(state, {
      type: "set-code-order",
      codes: [...state.display.standard.codeOrder],
    }),
    state,
  );
});

test("matching result adoption retains the exact immutable bound object and clears obsolete visibility snapshots", async () => {
  const { state, result } = await current();
  assert.equal(state.resultStatus, "current");
  assert.equal(state.runStatus, "idle");
  assert.equal(state.result, result);
  const hidden = reduce(state, { type: "hide-all-codes" });
  const next = running(hidden, result.binding.executionPlanSha256);
  assert.ok(next.runningRequest);
  const accepted = reduce(next, {
    type: "accept-result",
    request: next.runningRequest,
    result,
  });
  assert.equal(accepted.result, result);
  assert.equal(accepted.resultStatus, "current");
  // Re-admitting the very same result keeps its exact result-bound snapshot.
  assert.ok(accepted.display.standard.codeVisibilitySnapshot);
  assert.equal(
    reduce(accepted, {
      type: "accept-result",
      request: next.runningRequest,
      result,
    }),
    accepted,
  );
});

test("wrong-hash, dataset, family and obsolete results never replace retained science", async () => {
  const { state, result } = await current();
  const requestState = running(state, result.binding.executionPlanSha256);
  assert.ok(requestState.runningRequest);
  for (const wrong of [
    {
      ...result,
      binding: { ...result.binding, executionPlanSha256: "f".repeat(64) },
    },
    {
      ...result,
      binding: { ...result.binding, datasetSha256: "f".repeat(64) },
    },
    {
      ...result,
      configuration: { ...result.configuration, analysisFamily: "ona" },
    } as never,
  ])
    assert.equal(
      reduce(requestState, {
        type: "accept-result",
        request: requestState.runningRequest,
        result: wrong,
      }),
      requestState,
    );
  const obsolete = reduce(requestState, { type: "exclude-code", code: "B" });
  assert.equal(obsolete.runStatus, "obsolete");
  assert.equal(
    reduce(obsolete, {
      type: "accept-result",
      request: requestState.runningRequest,
      result,
    }),
    obsolete,
  );
});

test("ABA late completion with the same plan hash cannot satisfy a newer request after Undo", async () => {
  const { state, result } = await current();
  const a1 = running(state, result.binding.executionPlanSha256);
  assert.ok(a1.runningRequest);
  const b = reduce(a1, { type: "exclude-code", code: "B" });
  const a = reduce(b, { type: "undo-model-edit" });
  const a2 = running(a, result.binding.executionPlanSha256);
  assert.ok(a2.runningRequest);
  assert.ok(a2.runningRequest.generation > a1.runningRequest.generation);
  assert.equal(
    reduce(a2, { type: "accept-result", request: a1.runningRequest, result }),
    a2,
  );
  const accepted = reduce(a2, {
    type: "accept-result",
    request: a2.runningRequest,
    result,
  });
  assert.equal(accepted.resultStatus, "current");
  assert.equal(accepted.result, result);
});

test("late compile contexts and cancelled/error completions cannot reopen or replace newer runs", async () => {
  const { state, result } = await current();
  const context = modelScientificContextV3(state);
  const edited = reduce(state, { type: "exclude-code", code: "B" });
  assert.equal(
    reduce(edited, {
      type: "mark-running",
      context,
      executionPlanSha256: result.binding.executionPlanSha256,
    }),
    edited,
  );
  const a = running(state, result.binding.executionPlanSha256);
  assert.ok(a.runningRequest);
  const cancelled = reduce(a, {
    type: "mark-cancelled",
    request: a.runningRequest,
  });
  assert.equal(cancelled.runStatus, "cancelled");
  assert.equal(cancelled.result, state.result);
  assert.equal(
    reduce(cancelled, {
      type: "accept-result",
      request: a.runningRequest,
      result,
    }),
    cancelled,
  );
  const next = running(cancelled, result.binding.executionPlanSha256);
  assert.ok(next.runningRequest);
  assert.equal(
    reduce(next, { type: "mark-error", request: a.runningRequest }),
    next,
  );
  const error = reduce(next, {
    type: "mark-error",
    request: next.runningRequest,
  });
  assert.equal(error.runStatus, "error");
  assert.equal(error.result, result);
  const obsolete = reduce(next, { type: "mark-obsolete" });
  assert.equal(obsolete.runStatus, "obsolete");
  assert.equal(
    reduce(obsolete, {
      type: "accept-result",
      request: next.runningRequest,
      result,
    }),
    obsolete,
  );
});

test("raw editor invalidity explicitly blocks Run and stales/obsoletes even if canonical draft is unchanged", async () => {
  const { state, result } = await current();
  const active = running(state, result.binding.executionPlanSha256);
  const blocked = reduce(active, {
    type: "set-editor-blocked",
    family: "standard",
    blocked: true,
  });
  assert.equal(blocked.drafts, active.drafts);
  assert.equal(blocked.runStatus, "obsolete");
  assert.equal(blocked.resultStatus, "stale");
  assert.equal(blocked.scientificRevision, active.scientificRevision + 1);
  assert.equal(running(blocked, result.binding.executionPlanSha256), blocked);
  const repaired = reduce(blocked, {
    type: "set-editor-blocked",
    family: "standard",
    blocked: false,
  });
  assert.equal(repaired.resultStatus, "stale");
  assert.equal(
    running(repaired, result.binding.executionPlanSha256).runStatus,
    "running",
  );
});

test("empty Codes remain compile-blocked; reducer does not confer compiler readiness", async () => {
  const f = await (fixturePromise ??= makeFixture());
  const empty = reduce(initial(), { type: "exclude-all-codes" });
  const compiled = await compileStandardDraftV3(
    {
      name: "empty.csv",
      source: "upload",
      sizeBytes: 1,
      headers: ["unit", "horizon", "group", "A", "B", "C"],
      rows: [{ unit: "u", horizon: "h", group: 1, A: 1, B: 2, C: 1 }],
    },
    datasetSha256,
    empty.drafts.standard,
  );
  assert.notEqual(compiled.status, "ready");
  assert.equal(empty.result, null);
  assert.equal(f.result.configuration.codes.length, 3);
});

test("newly selected Codes receive visible presentation defaults without resetting existing preferences", () => {
  const state = reduce(initial(), {
    type: "set-code-visible",
    code: "B",
    visible: false,
  });
  const draft = { ...state.drafts.standard, codes: ["A", "B", "C", "D"] };
  const next = reduce(state, { type: "replace-standard-draft", draft });
  assert.equal(next.display.standard.codeVisibility.D, true);
  assert.equal(next.display.standard.codeVisibility.B, false);
  assert.deepEqual(next.display.standard.codeOrder, ["A", "B", "C", "D"]);
  assert.deepEqual(next.drafts.standard.codes, draft.codes);
});

test("repairing an editable duplicate Code draft also restores an exact display permutation", () => {
  const input = drafts();
  input.standard.codes = ["A", "A", "B"];
  const invalid = createModelStateV3(input, datasetSha256);
  assert.deepEqual(invalid.drafts.standard.codes, ["A", "A", "B"]);
  assert.throws(() =>
    reduce(invalid, { type: "set-code-order", codes: ["A", "A", "B"] }),
  );
  const repaired = reduce(invalid, {
    type: "replace-standard-draft",
    draft: { ...input.standard, codes: ["A", "B", "C"] },
  });
  assert.deepEqual(repaired.display.standard.codeOrder, ["A", "B", "C"]);
  assert.deepEqual(repaired.drafts.standard.codes, ["A", "B", "C"]);
});

test("scientific edits and Undo without a result always retain the none status", () => {
  const state = running(initial());
  const excluded = reduce(state, { type: "exclude-all-codes" });
  const undone = reduce(excluded, { type: "undo-model-edit" });
  const switched = reduce(undone, { type: "set-active-family", family: "ona" });
  const dataset = reduce(switched, {
    type: "set-dataset",
    datasetSha256: "c".repeat(64),
  });
  for (const next of [state, excluded, undone, switched, dataset]) {
    assert.equal(next.resultStatus, "none");
    assert.equal(next.result, null);
  }
});

test("adopting a new admitted result object expires both visibility snapshots even with the same scientific hash", async () => {
  const f = await current();
  const second = await makeFixture();
  assert.notEqual(second.result, f.result);
  assert.equal(
    second.result.binding.scientificResultSha256,
    f.result.binding.scientificResultSha256,
  );
  const groupToken =
    f.result.executionProvenance.identityDictionary.groups[0].token;
  const configured = reduce(
    reduce(f.state, { type: "set-code-visible", code: "B", visible: false }),
    {
      type: "set-group-display",
      groupToken,
      patch: { showMean: false },
    },
  );
  const hidden = reduce(reduce(configured, { type: "hide-all-codes" }), {
    type: "hide-all-groups",
  });
  const next = running(hidden, second.result.binding.executionPlanSha256);
  assert.ok(next.runningRequest);
  const accepted = reduce(next, {
    type: "accept-result",
    request: next.runningRequest,
    result: second.result,
  });
  assert.equal(accepted.result, second.result);
  assert.equal(accepted.display.standard.codeVisibilitySnapshot, null);
  assert.equal(accepted.display.standard.groupVisibilitySnapshot, null);
  assert.equal(accepted.display.standard.allCodesSuppressed, false);
  assert.equal(accepted.display.standard.allGroupsSuppressed, false);
  assert.equal(accepted.display.standard.codeVisibility.B, true);
  assert.equal(accepted.display.standard.groups[groupToken].showMean, true);
  assert.equal(reduce(accepted, { type: "restore-code-visibility" }), accepted);
  assert.equal(
    reduce(accepted, { type: "restore-group-visibility" }),
    accepted,
  );
});

test("Group display edits during Running preserve request, revision and current result status", async () => {
  const { state, result } = await current();
  const active = running(state, result.binding.executionPlanSha256);
  const changed = reduce(active, {
    type: "set-group-display",
    groupToken: result.executionProvenance.identityDictionary.groups[0].token,
    patch: {
      showMean: false,
      showConfidenceIntervals: false,
      showUnitPoints: false,
    },
  });
  assert.equal(changed.runStatus, "running");
  assert.equal(changed.scientificRevision, active.scientificRevision);
  assert.equal(changed.runningRequest, active.runningRequest);
  assert.equal(changed.result, result);
  assert.equal(changed.resultStatus, "current");
});

test("actual native ONA result adoption uses source Code keys and preserves ONA-only display and scientific custody", async () => {
  const input = drafts();
  input.activeFamily = "ona";
  input.ona.codes = ["Code 2", "C", "B"];
  input.ona.directionalMask = {
    schemaVersion: 1,
    codeOrder: [...input.ona.codes],
    enabled: [
      [true, false, true],
      [true, true, true],
      [true, true, true],
    ],
  };
  input.ona.rowOrder = {
    kind: "columns",
    keys: [
      {
        column: "time",
        direction: "ascending",
        comparator: { type: "number" },
      },
    ],
  };
  const data: ParsedDataset = {
    name: "state-ona.csv",
    source: "upload",
    sizeBytes: 512,
    headers: ["person", "session", "cohort", "time", "C", "Code 2", "B"],
    rows: [
      {
        person: "u1",
        session: "h1",
        time: 1,
        cohort: 1,
        "Code 2": 2,
        B: 0,
        C: 1,
      },
      {
        person: "u2",
        session: "h1",
        time: 2,
        cohort: "1",
        "Code 2": 0,
        B: 3,
        C: 1,
      },
      {
        person: "u1",
        session: "h2",
        time: 1,
        cohort: 1,
        "Code 2": 0,
        B: 2,
        C: 2,
      },
      {
        person: "u3",
        session: "h2",
        time: 2,
        cohort: true,
        "Code 2": 1,
        B: 1,
        C: 0,
      },
    ],
  };
  const compiled = await compileOnaDraftV3(data, datasetSha256, input.ona);
  assert.equal(compiled.status, "ready");
  if (compiled.status !== "ready")
    throw new Error("Expected an actual ready ONA fixture");
  const plan = await buildOnaExecutionPlanV3(
    data,
    datasetSha256,
    compiled.canonicalConfiguration,
  );
  const result = await bindOnaResultV3(plan, runOnaPlanV3(plan), {
    processedRows: data.rows.length,
    maximumRetainedRowsAfterChunk: 0,
    bufferedRowsPeakUpperBound: Math.min(
      data.rows.length,
      plan.header.resourceEstimate.estimatedRetainedWindowRows + 1,
    ),
    numericCellsUpperBound: plan.operationalAdmission.totalNumericCells,
    peakBytesUpperBound: plan.operationalAdmission.totalPeakBytes,
    observationMethod: "dimension-bounds-and-chunk-boundary-stream-state",
  });
  const active = running(
    createModelStateV3(input, datasetSha256),
    plan.header.executionPlanSha256,
  );
  assert.ok(active.runningRequest);
  const state = reduce(active, {
    type: "accept-result",
    request: active.runningRequest,
    result,
  });
  const alias = result.executionProvenance.labels.codes.find(
    (code) => code.sourceColumn === "Code 2",
  )!.column;
  assert.notEqual(alias, "Code 2");
  assert.equal(input.ona.codes.includes(alias), false);
  assert.throws(() =>
    reduce(state, { type: "set-code-visible", code: alias, visible: false }),
  );
  const display = reduce(state, {
    type: "set-code-visible",
    code: "Code 2",
    visible: false,
  });
  assert.equal(display.display.ona.codeVisibility["Code 2"], false);
  assert.equal(display.display.standard, state.display.standard);
  assert.equal(display.result, result);
  assert.equal(display.resultStatus, "current");
  const excluded = reduce(display, { type: "exclude-code", code: "Code 2" });
  assert.equal(excluded.resultStatus, "stale");
  assert.deepEqual(excluded.drafts.ona.directionalMask, {
    schemaVersion: 1,
    codeOrder: ["C", "B"],
    enabled: [
      [true, true],
      [true, true],
    ],
  });
  const restored = reduce(excluded, { type: "undo-model-edit" });
  assert.deepEqual(restored.drafts.ona, input.ona);
  assert.equal(restored.result, result);
  assert.equal(restored.resultStatus, "stale");
});

test("late compilation cannot replace a newer run or reopen its cancelled, error, obsolete or completed state", async () => {
  const { state, result } = await current();
  const beforeNewRun = modelScientificContextV3(state);
  const newer = running(state, result.binding.executionPlanSha256);
  assert.ok(newer.runningRequest);
  const whileRunning = modelScientificContextV3(newer);
  const lateStart = (target: ModelStateV3, context = beforeNewRun) =>
    reduce(target, {
      type: "mark-running",
      executionPlanSha256: result.binding.executionPlanSha256,
      context,
    });
  assert.equal(lateStart(newer), newer);
  const terminalStates = [
    reduce(newer, { type: "mark-cancelled", request: newer.runningRequest }),
    reduce(newer, { type: "mark-error", request: newer.runningRequest }),
    reduce(newer, { type: "mark-obsolete" }),
    reduce(newer, {
      type: "accept-result",
      request: newer.runningRequest,
      result,
    }),
  ];
  for (const terminal of terminalStates) {
    assert.equal(lateStart(terminal), terminal);
    assert.equal(lateStart(terminal, whileRunning), terminal);
    assert.equal(
      running(terminal, result.binding.executionPlanSha256).runStatus,
      "running",
    );
  }
});
