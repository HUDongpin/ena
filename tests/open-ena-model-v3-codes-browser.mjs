import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";

const datasetSha256 = "a".repeat(64);
const drafts = {
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
const dataset = {
  name: "task29-codes.csv",
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
    "A & B",
    "__proto__",
    "constructor",
    "節點/🙂",
    "bad",
  ],
  rows: [
    {
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
      ["A & B"]: 3,
      ["__proto__"]: 1,
      constructor: 0,
      ["節點/🙂"]: 0,
      bad: "1",
    },
    {
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
      ["A & B"]: 0,
      ["__proto__"]: 0,
      constructor: 1,
      ["節點/🙂"]: 2,
      bad: "0",
    },
  ],
};

const entry = `
  import React, { useCallback, useState } from "react";
  import { createRoot } from "react-dom/client";
  import { OpenEnaCodesPanelV3, createOpenEnaCodesPreviewV3 } from "./components/open-ena/model-v3/OpenEnaCodesPanelV3";
  import { createModelStateV3, modelScientificContextV3, modelStateReducerV3 } from "./components/open-ena/model-v3/model-state";
  import { modelDiagnosticFieldTargetV3, modelFieldIdV3 } from "./components/open-ena/model-v3/OpenEnaModelDiagnosticsV3";

  const initialDrafts = ${JSON.stringify(drafts)};
  const dataset = ${JSON.stringify(dataset)};
  const datasetSha256 = ${JSON.stringify(datasetSha256)};
  const actions = [];
  const baseCopy = {
    intro: "Selected codes become the nodes in the model network.",
    family: {
      legend: "Analysis family", methodBoundaryLabel: "Method boundary", selectedLabel: "Selected",
      ena: { label: "Standard ENA", description: "Undirected co-occurrence", methodBoundary: "Standard boundary" },
      ona: { label: "Ordered Network Analysis", description: "Directed ground-response", methodBoundary: "ONA boundary" },
    },
    toolbar: "Code actions", hideCodes: "Hide all code nodes", restoreCodes: "Restore all code nodes",
    excludeAllCodes: "Exclude all selected Codes", hideUnavailable: "Select at least one Code before hiding nodes.",
    excludeUnavailable: "There are no selected Codes to exclude.", selectedCodes: "Selected Codes", codeType: "Type",
    positiveCountLabel: "Positive rows", profileTypes: { "binary-number": "Numeric Binary", "binary-boolean": "Boolean Binary", frequency: "Frequency" },
    unavailable: "Unavailable for this exact draft", diagnostics: "Diagnostics", reorderInstructions: "Press Alt+Arrow Up or Alt+Arrow Down to change display order.",
    moveUnavailable: "Display reorder is unavailable until selected Codes are distinct.",
    displayActionUnavailable: "Display actions are unavailable until selected Codes are distinct.",
    restoreBeforeCodeVisibility: "Restore all Codes before changing one Code visibility.",
    manageCodes: "Manage Codes", closeManager: "Close Code manager", managerTitle: "Manage Codes",
    managerInstructions: "Compatible source fields can be selected. Incompatible fields remain visible with reasons.",
    incompatibilityReason: {
      missing: "Missing from the current dataset", "active-role": "Used by an active scientific role",
      "binary-values": "Values do not use one uniform numeric 0/1 or Boolean representation",
      "frequency-values": "Values are not all finite nonnegative numbers",
      "duplicate-selection": "Selected more than once; remove it to repair the draft",
    },
    noCodesTitle: "No codes selected", minimumThreeCodes: "At least three distinct Codes are required to run a model.",
    otherSettingsPreserved: "Units, Horizons, Windows, Order, Rotation, and the other analysis family remain preserved.",
    undo: "Undo Code exclusion",
  };
  const copy = {
    ...baseCopy,
    familyChanged: (family) => "Analysis family changed to " + family + ". Independent settings restored.",
    positiveCount: (count) => count + " positive rows",
    chooseColor: (code) => "Choose color for " + code,
    hideCode: (code) => "Hide " + code + " node",
    showCode: (code) => "Show " + code + " node",
    excludeCode: (code) => "Exclude " + code + " Code",
    reorderCode: (code) => "Reorder " + code,
    addCode: (code) => "Select " + code + " as a Code",
  };

  function App() {
    const [state, setState] = useState(() => createModelStateV3(initialDrafts, datasetSha256));
    const [mounted, setMounted] = useState(true);
    const dispatch = useCallback((action) => {
      actions.push(action);
      setState((current) => modelStateReducerV3(current, action));
    }, []);
    const preview = createOpenEnaCodesPreviewV3(dataset, datasetSha256, state, {
      availability: "available", context: modelScientificContextV3(state), diagnostics: [],
    });
    const focusCodeDiagnostic = () => {
      const family = state.drafts.activeFamily;
      const code = state.drafts[family].codes.includes("A & B") ? "A & B" : "A";
      const target = modelDiagnosticFieldTargetV3(family, {
        id: family === "standard" ? "STANDARD_CODE_VALUE_INVALID" : "ONA_CODE_ALL_ZERO",
        severity: "error", scope: "codes", fieldPath: "codes." + code,
        summary: "unused", detail: "unused", blocks: ["build-model"],
      });
      if (target) document.getElementById(target.fieldId)?.focus();
    };
    window.__task29 = {
      state, actions, setMounted,
      setFamily(family) { dispatch({ type: "set-active-family", family }); },
    };
    return React.createElement("main", null,
      React.createElement("button", { id: "unmount", onClick: () => setMounted((value) => !value) }, mounted ? "Unmount Codes" : "Remount Codes"),
      React.createElement("button", { id: "focus-diagnostic", onClick: focusCodeDiagnostic }, "Focus Code diagnostic"),
      mounted ? React.createElement(OpenEnaCodesPanelV3, {
        state, copy, fields: { id: (path) => modelFieldIdV3("codes", path) }, preview, dispatch,
        onChooseCodeColor: (code) => dispatch({ type: "set-code-color", code, color: "#123456" }),
        localizeDiagnostic: (diagnostic) => ({ summary: diagnostic.id, detail: "Localized " + diagnostic.id }),
      }) : React.createElement("p", { id: "unmounted" }, "Codes unmounted"),
      React.createElement("output", { id: "state" }, JSON.stringify({
        family: state.drafts.activeFamily,
        codes: state.drafts[state.drafts.activeFamily].codes,
        order: state.display[state.drafts.activeFamily].codeOrder,
        visibility: state.display[state.drafts.activeFamily].codeVisibility,
        suppressed: state.display[state.drafts.activeFamily].allCodesSuppressed,
        colors: state.display[state.drafts.activeFamily].codeColors,
        mask: state.drafts.ona.directionalMask,
        standardCodes: state.drafts.standard.codes,
        onaCodes: state.drafts.ona.codes,
        scientificRevision: state.scientificRevision,
      })),
    );
  }
  createRoot(document.getElementById("root")).render(React.createElement(App));
`;

const bundle = await build({
  stdin: {
    contents: entry,
    loader: "tsx",
    resolveDir: new URL("..", import.meta.url).pathname,
    sourcefile: "task29-codes-browser-harness.tsx",
  },
  bundle: true,
  format: "iife",
  platform: "browser",
  write: false,
  logLevel: "silent",
});

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.setContent(
    '<!doctype html><html><body><div id="root"></div></body></html>',
  );
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.getByTestId("open-ena-model-v3-codes-panel").waitFor();

  async function state() {
    return JSON.parse(await page.locator("#state").textContent());
  }

  assert.match(
    await page.locator('[data-code-source="A"]').first().textContent(),
    /Frequency/u,
  );
  const initialRevision = (await state()).scientificRevision;
  await page.getByRole("button", { name: "Hide all code nodes" }).click();
  assert.equal((await state()).suppressed, true);
  assert.equal((await state()).scientificRevision, initialRevision);
  assert.equal(
    await page.getByRole("button", { name: "Hide A node" }).isDisabled(),
    true,
  );
  assert.equal(
    await page
      .getByText("Restore all Codes before changing one Code visibility.", {
        exact: true,
      })
      .isVisible(),
    true,
  );
  await page.getByRole("button", { name: "Restore all code nodes" }).click();
  assert.equal((await state()).suppressed, false);

  await page.getByRole("button", { name: "Hide B node" }).click();
  assert.equal((await state()).visibility.B, false);
  assert.equal((await state()).scientificRevision, initialRevision);
  await page.getByRole("button", { name: "Choose color for A" }).click();
  assert.equal((await state()).colors.A, "#123456");

  const reorderB = page.getByRole("button", { name: "Reorder B" });
  await reorderB.focus();
  await reorderB.press("Alt+ArrowUp");
  assert.deepEqual((await state()).order, ["B", "A", "C"]);
  assert.equal(
    await reorderB.evaluate((element) => element === document.activeElement),
    true,
  );
  await page
    .getByRole("button", { name: "Reorder B" })
    .dragTo(page.getByRole("button", { name: "Reorder C" }));
  assert.deepEqual((await state()).order, ["A", "C", "B"]);
  assert.equal((await state()).scientificRevision, initialRevision);

  await page.getByRole("button", { name: "Manage Codes" }).first().click();
  assert.equal(
    await page
      .getByRole("checkbox", { name: "Select student as a Code" })
      .isDisabled(),
    true,
  );
  assert.equal(
    await page
      .getByText("Used by an active scientific role", { exact: true })
      .first()
      .isVisible(),
    true,
  );
  await page
    .getByRole("checkbox", { name: "Select fraction as a Code" })
    .check();
  assert.deepEqual((await state()).standardCodes, ["A", "B", "C", "fraction"]);
  assert.deepEqual((await state()).onaCodes, ["C", "A", "B"]);
  await page.getByRole("checkbox", { name: "Select C as a Code" }).uncheck();
  assert.deepEqual((await state()).standardCodes, ["A", "B", "fraction"]);
  await page.getByRole("button", { name: "Undo Code exclusion" }).click();
  assert.deepEqual((await state()).standardCodes, ["A", "B", "C", "fraction"]);

  await page.getByRole("radio", { name: /Ordered Network Analysis/u }).check();
  assert.equal((await state()).family, "ona");
  await page
    .getByText(
      "Analysis family changed to ona. Independent settings restored.",
      { exact: true },
    )
    .waitFor();
  assert.deepEqual((await state()).mask.enabled, [
    [false, true, false],
    [true, false, true],
    [false, false, true],
  ]);
  await page.getByRole("checkbox", { name: "Select A & B as a Code" }).check();
  const grown = await state();
  assert.deepEqual(grown.onaCodes, ["C", "A", "B", "A & B"]);
  assert.deepEqual(grown.mask.codeOrder, grown.onaCodes);
  assert.deepEqual(
    grown.mask.enabled.slice(0, 3).map((row) => row.slice(0, 3)),
    [
      [false, true, false],
      [true, false, true],
      [false, false, true],
    ],
  );
  assert.ok(
    grown.mask.enabled.every((row, source) =>
      row.every((cell, target) => (source < 3 && target < 3) || cell === true),
    ),
  );
  await page.getByRole("button", { name: "Focus Code diagnostic" }).click();
  assert.equal(
    await page
      .locator('[data-code-source="A & B"]')
      .evaluate((element) => element === document.activeElement),
    true,
  );

  await page
    .getByRole("button", { name: "Exclude all selected Codes" })
    .click();
  assert.deepEqual((await state()).onaCodes, []);
  assert.deepEqual((await state()).mask, {
    schemaVersion: 1,
    codeOrder: [],
    enabled: [],
  });
  await page.getByText("No codes selected", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Unmount Codes" }).click();
  await page.getByRole("button", { name: "Remount Codes" }).click();
  assert.deepEqual((await state()).onaCodes, []);
  await page.getByRole("button", { name: "Undo Code exclusion" }).click();
  assert.deepEqual((await state()).onaCodes, ["C", "A", "B", "A & B"]);

  await page
    .getByRole("button", { name: "Exclude all selected Codes" })
    .click();
  await page.evaluate(() => window.__task29.setFamily("standard"));
  assert.deepEqual((await state()).standardCodes, ["A", "B", "C", "fraction"]);
  await page.evaluate(() => window.__task29.setFamily("ona"));
  assert.deepEqual((await state()).onaCodes, []);
  assert.deepEqual((await state()).mask, {
    schemaVersion: 1,
    codeOrder: [],
    enabled: [],
  });

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  console.log("Task29 Codes actual-component browser checks passed.");
} finally {
  await browser.close();
}
