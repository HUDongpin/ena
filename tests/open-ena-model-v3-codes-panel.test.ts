import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createOpenEnaCodesPreviewV3,
  OpenEnaCodesPanelV3,
  type OpenEnaCodesPanelV3Copy,
} from "../components/open-ena/model-v3/OpenEnaCodesPanelV3";
import {
  createModelStateV3,
  modelScientificContextV3,
  modelStateReducerV3 as reduce,
  type ModelStateActionV3,
} from "../components/open-ena/model-v3/model-state";
import { profileCodeColumnValuesV3 } from "../lib/open-ena/model-v3/code-profile";
import {
  compileOnaDraftV3,
  compileStandardDraftV3,
} from "../lib/open-ena/model-v3/compiler";
import { modelDiagnosticFieldTargetV3 } from "../components/open-ena/model-v3/OpenEnaModelDiagnosticsV3";
import type { ModelWorkspaceDraftsV3 } from "../lib/open-ena/model-v3/types";
import type { ParsedDataset } from "../lib/open-ena/types";

const datasetSha256 = "a".repeat(64);

function drafts(): ModelWorkspaceDraftsV3 {
  return {
    schemaVersion: 3,
    activeFamily: "standard",
    standard: {
      unitColumns: ["student"],
      horizonColumns: ["conversation"],
      groupColumn: "condition",
      codes: ["A", "B", "C"],
      weighting: "frequency",
      model: "EndPoint",
      windowType: "Conversation",
      movingStanza: {
        backward: { kind: "finite", value: 1 },
        forward: { kind: "finite", value: 0 },
        rowOrder: {
          kind: "columns",
          keys: [
            {
              column: "turn",
              direction: "ascending",
              comparator: { type: "number" },
            },
          ],
        },
      },
      horizonOrder: {
        kind: "columns",
        keys: [
          {
            column: "week",
            direction: "ascending",
            comparator: { type: "number" },
          },
        ],
      },
      rotation: { type: "svd", centerAlignToOrigin: true },
    },
    ona: {
      unitColumns: ["person"],
      horizonColumns: ["session"],
      groupColumn: "cohort",
      codes: ["C", "A", "B"],
      backward: { kind: "finite", value: 7 },
      rowOrder: {
        kind: "columns",
        keys: [
          {
            column: "turn",
            direction: "ascending",
            comparator: { type: "number" },
          },
        ],
      },
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

function dataset(): ParsedDataset {
  return {
    name: "codes.csv",
    source: "upload",
    sizeBytes: 512,
    headers: [
      "student",
      "conversation",
      "condition",
      "turn",
      "week",
      "person",
      "session",
      "cohort",
      "A",
      "B",
      "C",
      "fraction",
      "bool",
      "mixed",
      "missing-value",
      "text",
      "all-zero",
      "__proto__",
      "constructor",
      "A & B",
      "節點/🙂",
    ],
    rows: [
      Object.assign(Object.create(null), {
        student: "u1",
        conversation: "h1",
        condition: "g1",
        turn: 1,
        week: 1,
        person: "p1",
        session: "s1",
        cohort: "c1",
        A: 1,
        B: 0,
        C: 2,
        fraction: 0.5,
        bool: true,
        mixed: 1,
        "missing-value": 1,
        text: "1",
        "all-zero": 0,
        ["__proto__"]: 1,
        constructor: 0,
        "A & B": 3,
        "節點/🙂": 0,
      }),
      Object.assign(Object.create(null), {
        student: "u2",
        conversation: "h2",
        condition: "g2",
        turn: 2,
        week: 2,
        person: "p2",
        session: "s2",
        cohort: "c2",
        A: 0,
        B: 4,
        C: 1,
        fraction: 1.25,
        bool: false,
        mixed: false,
        text: 1,
        "all-zero": 0,
        ["__proto__"]: 0,
        constructor: 1,
        "A & B": 0,
        "節點/🙂": 2,
      }),
    ],
  };
}

const copy: OpenEnaCodesPanelV3Copy = {
  intro: "Selected codes become the nodes in the model network.",
  family: {
    legend: "Analysis family",
    methodBoundaryLabel: "Method boundary",
    selectedLabel: "Selected",
    ena: {
      label: "Standard ENA",
      description: "Undirected co-occurrence",
      methodBoundary: "Standard boundary",
    },
    ona: {
      label: "Ordered Network Analysis",
      description: "Directed ground-response",
      methodBoundary: "ONA boundary",
    },
  },
  familyChanged: (family) =>
    `Analysis family changed to ${family}. Independent settings restored.`,
  toolbar: "Code actions",
  hideCodes: "Hide all code nodes",
  restoreCodes: "Restore all code nodes",
  excludeAllCodes: "Exclude all selected Codes",
  hideUnavailable: "Select at least one Code before hiding nodes.",
  excludeUnavailable: "There are no selected Codes to exclude.",
  selectedCodes: "Selected Codes",
  codeType: "Type",
  positiveCountLabel: "Positive rows",
  profileTypes: {
    "binary-number": "Numeric Binary",
    "binary-boolean": "Boolean Binary",
    frequency: "Frequency",
  },
  positiveCount: (count) => `${count} positive rows`,
  unavailable: "Unavailable for this exact draft",
  diagnostics: "Diagnostics",
  diagnosticsUnavailable:
    "Compiler diagnostics are unavailable for this exact draft.",
  chooseColor: (code) => `Choose color for ${code}`,
  hideCode: (code) => `Hide ${code} node`,
  showCode: (code) => `Show ${code} node`,
  excludeCode: (code) => `Exclude ${code} Code`,
  reorderCode: (code) => `Reorder ${code}`,
  reorderInstructions:
    "Press Alt+Arrow Up or Alt+Arrow Down to change display order.",
  moveUnavailable:
    "Display reorder is unavailable until selected Codes are distinct.",
  displayActionUnavailable:
    "Display actions are unavailable until selected Codes are distinct.",
  restoreBeforeCodeVisibility:
    "Restore all Codes before changing one Code visibility.",
  manageCodes: "Manage Codes",
  closeManager: "Close Code manager",
  managerTitle: "Manage Codes",
  managerInstructions:
    "Compatible source fields can be selected. Incompatible fields remain visible with reasons.",
  addCode: (code) => `Select ${code} as a Code`,
  incompatibilityReason: {
    missing: "Missing from the current dataset",
    "active-role": "Used by an active scientific role",
    "binary-values":
      "Values do not use one uniform numeric 0/1 or Boolean representation",
    "frequency-values": "Values are not all finite nonnegative numbers",
    "duplicate-selection":
      "Selected more than once; remove it to repair the draft",
  },
  noCodesTitle: "No codes selected",
  minimumThreeCodes:
    "At least three distinct Codes are required to run a model.",
  otherSettingsPreserved:
    "Units, Horizons, Windows, Order, Rotation, and the other analysis family remain preserved.",
  undo: "Undo Code exclusion",
};

function panelProps(state = createModelStateV3(drafts(), datasetSha256)) {
  const actions: ModelStateActionV3[] = [];
  const preview = createOpenEnaCodesPreviewV3(dataset(), datasetSha256, state, {
    availability: "available",
    context: modelScientificContextV3(state),
    diagnostics: [],
  });
  return {
    state,
    copy,
    fields: { id: (path: string) => `field:${path}` },
    preview,
    dispatch: (action: ModelStateActionV3) => actions.push(action),
    onChooseCodeColor: (code: string) =>
      actions.push({ type: "set-code-color", code, color: "#123456" }),
    localizeDiagnostic: (diagnostic: { id: string }) => ({
      summary: diagnostic.id,
      detail: `Localized ${diagnostic.id}`,
    }),
    actions,
  };
}

test("Codes clearly separates Hide and Exclude all and renders source-profile rows", () => {
  const markup = renderToStaticMarkup(
    createElement(OpenEnaCodesPanelV3, panelProps()),
  );
  assert.match(markup, /Selected codes become the nodes/u);
  assert.match(markup, /aria-label="Hide all code nodes"/u);
  assert.match(markup, /aria-label="Exclude all selected Codes"/u);
  assert.match(markup, /A[\s\S]*Frequency[\s\S]*1 positive rows/u);
  assert.match(markup, /id="field:codes"/u);
  assert.match(markup, /aria-label="Choose color for A"/u);
  assert.match(markup, /aria-label="Hide A node"[^>]*aria-pressed="false"/u);
  assert.match(markup, /aria-label="Exclude A Code"/u);
  assert.match(markup, /aria-label="Reorder A"/u);
});

test("the shared profiler preserves exact Binary and Frequency domains", () => {
  const rows = dataset().rows as Array<Record<string, unknown>>;
  assert.deepEqual(profileCodeColumnValuesV3(rows, "A", "binary"), {
    status: "valid",
    representation: "binary-number",
    positiveCount: 1,
    magnitudes: [1, 0],
    signature: '[{"type":"number","value":1},{"type":"number","value":0}]',
    allZero: false,
  });
  assert.equal(
    profileCodeColumnValuesV3(rows, "bool", "binary").status,
    "valid",
  );
  assert.deepEqual(profileCodeColumnValuesV3(rows, "mixed", "binary"), {
    status: "invalid",
    invalidRows: [0, 1],
  });
  assert.equal(
    profileCodeColumnValuesV3(rows, "fraction", "frequency").status,
    "valid",
  );
  assert.deepEqual(profileCodeColumnValuesV3(rows, "bool", "frequency"), {
    status: "invalid",
    invalidRows: [0, 1],
  });
  assert.deepEqual(profileCodeColumnValuesV3(rows, "text", "frequency"), {
    status: "invalid",
    invalidRows: [0],
  });
  assert.deepEqual(
    profileCodeColumnValuesV3(rows, "missing-value", "frequency"),
    { status: "invalid", invalidRows: [1] },
  );
  assert.equal(Object.hasOwn(rows[0], "__proto__"), true);
  assert.equal(
    profileCodeColumnValuesV3(rows, "__proto__", "frequency").status,
    "valid",
  );
  const allZero = profileCodeColumnValuesV3(rows, "all-zero", "frequency");
  assert.equal(allZero.status, "valid");
  if (allZero.status === "valid")
    assert.deepEqual([allZero.positiveCount, allZero.allZero], [0, true]);
});

test("preview evidence is exact-context bound and active-role compatibility ignores inactive memories", () => {
  const state = createModelStateV3(drafts(), datasetSha256);
  const preview = createOpenEnaCodesPreviewV3(dataset(), datasetSha256, state, {
    availability: "available",
    context: modelScientificContextV3(state),
    diagnostics: [],
  });
  assert.equal(preview.availability, "available");
  if (preview.availability !== "available") return;
  assert.deepEqual(preview.context, modelScientificContextV3(state));
  const byColumn = new Map(
    preview.fields.map((field) => [field.column, field]),
  );
  assert.ok(
    byColumn.get("student")?.incompatibilityReasons.includes("active-role"),
  );
  assert.deepEqual(
    byColumn.get("turn")?.incompatibilityReasons,
    [],
    "Conversation leaves row-order memory inactive",
  );
  assert.deepEqual(
    byColumn.get("week")?.incompatibilityReasons,
    [],
    "EndPoint leaves Horizon-order memory inactive",
  );
  assert.deepEqual(byColumn.get("fraction")?.incompatibilityReasons, []);
  assert.deepEqual(byColumn.get("bool")?.incompatibilityReasons, [
    "frequency-values",
  ]);
  assert.equal(byColumn.get("fraction")?.profile.availability, "available");

  const changed = reduce(state, { type: "set-active-family", family: "ona" });
  const staleMarkup = renderToStaticMarkup(
    createElement(OpenEnaCodesPanelV3, {
      ...panelProps(changed),
      preview,
    }),
  );
  assert.match(staleMarkup, /Unavailable for this exact draft/u);
  assert.doesNotMatch(staleMarkup, />0 positive rows</u);
});

test("Manage Codes keeps incompatible and selected invalid fields visible and removable", () => {
  const input = drafts();
  input.standard.codes = ["A", "A", "text"];
  const state = createModelStateV3(input, datasetSha256);
  const markup = renderToStaticMarkup(
    createElement(OpenEnaCodesPanelV3, panelProps(state)),
  );
  assert.match(markup, />text</u);
  assert.match(markup, /Values are not all finite nonnegative numbers/u);
  assert.match(
    markup,
    /Selected more than once; remove it to repair the draft/u,
  );
  assert.match(markup, /Used by an active scientific role/u);
  const textChoice =
    markup.match(
      /<input[^>]*name="open-ena-code-choice"[^>]*value="text"[^>]*>/u,
    )?.[0] ?? "";
  const studentChoice =
    markup.match(
      /<input[^>]*name="open-ena-code-choice"[^>]*value="student"[^>]*>/u,
    )?.[0] ?? "";
  assert.match(textChoice, /checked/u);
  assert.doesNotMatch(textChoice, /disabled/u);
  assert.match(studentChoice, /disabled/u);
  assert.match(
    markup,
    /Display actions are unavailable until selected Codes are distinct/u,
  );
});

test("stale or wrong-family compiler diagnostics never enter a current source profile", () => {
  const standard = createModelStateV3(drafts(), datasetSha256);
  const changed = reduce(standard, {
    type: "set-active-family",
    family: "ona",
  });
  const staleDiagnostic = {
    id: "STANDARD_CODE_VALUE_INVALID" as const,
    severity: "error" as const,
    scope: "codes" as const,
    fieldPath: "codes.A",
    summary: "stale raw summary",
    detail: "stale raw detail",
    blocks: ["build-model" as const],
  };
  const preview = createOpenEnaCodesPreviewV3(
    dataset(),
    datasetSha256,
    changed,
    {
      availability: "available",
      context: modelScientificContextV3(standard),
      diagnostics: [staleDiagnostic],
    },
  );
  assert.equal(preview.availability, "available");
  if (preview.availability === "available") {
    assert.equal(preview.diagnosticAvailability, "unavailable");
    assert.deepEqual(preview.diagnostics, []);
    assert.ok(preview.fields.every((field) => field.diagnostics.length === 0));
  }
});

test("diagnostic availability distinguishes absent and all five context mismatches from a current empty check", () => {
  const state = createModelStateV3(drafts(), datasetSha256);
  const currentContext = modelScientificContextV3(state);
  const current = createOpenEnaCodesPreviewV3(dataset(), datasetSha256, state, {
    availability: "available",
    context: currentContext,
    diagnostics: [],
  });
  assert.equal(current.availability, "available");
  if (current.availability !== "available") return;
  assert.equal(current.diagnosticAvailability, "available");

  const staleDiagnostic = {
    id: "STANDARD_CODE_VALUE_INVALID" as const,
    severity: "error" as const,
    scope: "codes" as const,
    fieldPath: "codes.A",
    summary: "stale compiler summary",
    detail: "stale compiler detail",
    blocks: ["build-model" as const],
  };
  const mismatches = [
    { ...currentContext, datasetSha256: "b".repeat(64) },
    { ...currentContext, family: "ona" as const },
    {
      ...currentContext,
      scientificRevision: currentContext.scientificRevision + 1,
    },
    {
      ...currentContext,
      draftFingerprint: `${currentContext.draftFingerprint}:stale`,
    },
    { ...currentContext, executionEpoch: currentContext.executionEpoch + 1 },
  ];
  const unavailableInputs = [
    { availability: "unavailable" as const },
    ...mismatches.map((context) => ({
      availability: "available" as const,
      context,
      diagnostics: [staleDiagnostic],
    })),
  ];
  for (const diagnosticEvidence of unavailableInputs) {
    const preview = createOpenEnaCodesPreviewV3(
      dataset(),
      datasetSha256,
      state,
      diagnosticEvidence,
    );
    assert.equal(preview.availability, "available");
    if (preview.availability !== "available") continue;
    assert.equal(preview.diagnosticAvailability, "unavailable");
    assert.notDeepEqual(preview, current);
    assert.equal(
      preview.fields.find((field) => field.column === "A")?.profile
        .availability,
      "available",
    );
    assert.deepEqual(preview.diagnostics, []);
    const markup = renderToStaticMarkup(
      createElement(OpenEnaCodesPanelV3, {
        ...panelProps(state),
        preview,
      }),
    );
    assert.match(
      markup,
      /Compiler diagnostics are unavailable for this exact draft/u,
    );
    assert.match(markup, /A[\s\S]*Frequency[\s\S]*1 positive rows/u);
    assert.doesNotMatch(
      markup,
      /stale compiler summary|stale compiler detail/u,
    );
  }

  const recoveredMarkup = renderToStaticMarkup(
    createElement(OpenEnaCodesPanelV3, {
      ...panelProps(state),
      preview: current,
    }),
  );
  assert.doesNotMatch(recoveredMarkup, /Compiler diagnostics are unavailable/u);
});

test("set-codes reconciles a non-null ONA mask in source identity and preserves null", () => {
  const state = reduce(createModelStateV3(drafts(), datasetSha256), {
    type: "set-active-family",
    family: "ona",
  });
  const next = reduce(state, {
    type: "set-codes",
    codes: ["C", "A", "A & B", "__proto__", "constructor", "節點/🙂"],
  });
  assert.deepEqual(next.drafts.ona.directionalMask, {
    schemaVersion: 1,
    codeOrder: ["C", "A", "A & B", "__proto__", "constructor", "節點/🙂"],
    enabled: [
      [false, true, true, true, true, true],
      [true, false, true, true, true, true],
      [true, true, true, true, true, true],
      [true, true, true, true, true, true],
      [true, true, true, true, true, true],
      [true, true, true, true, true, true],
    ],
  });
  assert.equal(next.display.ona.codeVisibility["__proto__"], true);
  assert.equal(
    Object.hasOwn(next.display.ona.codeVisibility, "constructor"),
    true,
  );
  assert.deepEqual(state.drafts.standard, next.drafts.standard);

  const nullDrafts = drafts();
  nullDrafts.activeFamily = "ona";
  nullDrafts.ona.directionalMask = null;
  const missing = reduce(createModelStateV3(nullDrafts, datasetSha256), {
    type: "set-codes",
    codes: ["C", "A", "A & B"],
  });
  assert.equal(missing.drafts.ona.directionalMask, null);
});

test("ONA Exclude all and Undo preserve the exact native empty submatrix and full mask", () => {
  const state = reduce(createModelStateV3(drafts(), datasetSha256), {
    type: "set-active-family",
    family: "ona",
  });
  const empty = reduce(state, { type: "exclude-all-codes" });
  assert.deepEqual(empty.drafts.ona.directionalMask, {
    schemaVersion: 1,
    codeOrder: [],
    enabled: [],
  });
  const restored = reduce(empty, { type: "undo-model-edit" });
  assert.deepEqual(restored.drafts.ona, state.drafts.ona);
});

test("duplicate Code drafts remain reviewable without ambiguous display reorder", () => {
  const input = drafts();
  input.standard.codes = ["A", "A", "B"];
  const state = createModelStateV3(input, datasetSha256);
  const markup = renderToStaticMarkup(
    createElement(OpenEnaCodesPanelV3, panelProps(state)),
  );
  assert.equal((markup.match(/data-code-source="A"/gu) ?? []).length, 2);
  assert.match(markup, /aria-label="Reorder A"[^>]*disabled/u);
  assert.throws(
    () => reduce(state, { type: "set-code-order", codes: ["A", "A", "B"] }),
    /exact permutation/u,
  );
});

test("actual compiler Code diagnostics target one source-identity row without duplicate IDs", async () => {
  const input = drafts();
  input.standard.codes = ["A & B", "A & B", "__proto__"];
  const state = createModelStateV3(input, datasetSha256);
  const source = dataset();
  source.rows.forEach((row) => {
    row["A & B"] = "invalid";
  });
  const compiled = await compileStandardDraftV3(
    source,
    datasetSha256,
    input.standard,
  );
  const diagnostic = compiled.diagnostics.find(
    (candidate) =>
      candidate.id === "STANDARD_CODE_VALUE_INVALID" &&
      candidate.fieldPath === "codes.A & B",
  );
  assert.ok(diagnostic);
  const target = modelDiagnosticFieldTargetV3("standard", diagnostic);
  assert.equal(target?.tab, "codes");
  assert.equal(target?.fieldPath, "codes.A & B");
  const markup = renderToStaticMarkup(
    createElement(OpenEnaCodesPanelV3, {
      ...panelProps(state),
      preview: createOpenEnaCodesPreviewV3(source, datasetSha256, state, {
        availability: "available",
        context: modelScientificContextV3(state),
        diagnostics: [diagnostic],
      }),
    }),
  );
  assert.equal((markup.match(/id="field:codes\.A &amp; B"/gu) ?? []).length, 1);
  assert.match(markup, /id="field:codes\.A &amp; B"[^>]*tabindex="-1"/u);
  assert.match(markup, /STANDARD_CODE_VALUE_INVALID/u);
  assert.doesNotMatch(markup, new RegExp(diagnostic.summary, "u"));
  assert.doesNotMatch(markup, new RegExp(diagnostic.detail, "u"));
});

test("global Hide keeps per-Code visibility controls truthful and an eligible per-Code Undo visible", () => {
  const state = createModelStateV3(drafts(), datasetSha256);
  const hidden = reduce(state, { type: "hide-all-codes" });
  const hiddenMarkup = renderToStaticMarkup(
    createElement(OpenEnaCodesPanelV3, panelProps(hidden)),
  );
  assert.match(hiddenMarkup, /aria-label="Hide A node"[^>]*disabled/u);
  assert.match(
    hiddenMarkup,
    /Restore all Codes before changing one Code visibility/u,
  );

  const excluded = reduce(state, { type: "exclude-code", code: "C" });
  const excludedMarkup = renderToStaticMarkup(
    createElement(OpenEnaCodesPanelV3, panelProps(excluded)),
  );
  assert.match(excludedMarkup, />Undo Code exclusion</u);
});

test("empty toolbar actions expose their own accurate disabled reasons", () => {
  const state = reduce(createModelStateV3(drafts(), datasetSha256), {
    type: "exclude-all-codes",
  });
  const markup = renderToStaticMarkup(
    createElement(OpenEnaCodesPanelV3, panelProps(state)),
  );
  const hide =
    markup.match(/<button[^>]*aria-label="Hide all code nodes"[^>]*>/u)?.[0] ??
    "";
  const exclude =
    markup.match(
      /<button[^>]*aria-label="Exclude all selected Codes"[^>]*>/u,
    )?.[0] ?? "";
  const hideReason = hide.match(/aria-describedby="([^"]+)"/u)?.[1];
  const excludeReason = exclude.match(/aria-describedby="([^"]+)"/u)?.[1];
  assert.ok(hideReason && excludeReason);
  assert.notEqual(hideReason, excludeReason);
  assert.match(
    markup,
    new RegExp(`id="${hideReason}"[^>]*>${copy.hideUnavailable}<`, "u"),
  );
  assert.match(
    markup,
    new RegExp(`id="${excludeReason}"[^>]*>${copy.excludeUnavailable}<`, "u"),
  );
});

test("compiler suites exercise the shared profile path for Standard and fixed Frequency ONA", async () => {
  const standardInput = dataset();
  const standardDraft = { ...drafts().standard, codes: ["A", "B", "all-zero"] };
  const standard = await compileStandardDraftV3(
    standardInput,
    datasetSha256,
    standardDraft,
  );
  assert.ok(
    standard.diagnostics.some(
      (diagnostic) => diagnostic.id === "STANDARD_CODE_ALL_ZERO",
    ),
  );
  const onaInput = drafts().ona;
  const ona = await compileOnaDraftV3(dataset(), datasetSha256, onaInput);
  assert.ok(
    ona.diagnostics.every(
      (diagnostic) => diagnostic.id !== "ONA_DRAFT_INVALID",
    ),
  );
});
