import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OpenEnaImportPreviewV3 } from "../components/open-ena/model-v3/OpenEnaImportPreviewV3";
import { createWorkspaceStateV3, workspaceReducerV3 } from "../components/open-ena/model-v3/workspace-controller";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";
import { analyzeDataset, runStandardPlanV3 } from "../lib/open-ena/analyze";
import { validateConfig } from "../lib/open-ena/csv";
import { parseOpenEnaAnalysisBundle } from "../lib/open-ena/export";
import { importOpenEnaArtifactV3 } from "../lib/open-ena/model-artifact-imports-v3";
import { exportDraftV3 } from "../lib/open-ena/model-artifact-exports-v3";
import { compileStandardDraftV3 } from "../lib/open-ena/model-v3/compiler";
import { buildStandardExecutionPlanV3 } from "../lib/open-ena/model-v3/execution-plan";
import { migrateLegacyOpenEnaConfigToDraftV3 } from "../lib/open-ena/model-v3/migration";
import { createDirectionalMask } from "../lib/open-ena/network-config";
import type { OpenEnaConfig } from "../lib/open-ena/types";
import { legacyZeroBackwardBundle, legacyZeroBackwardFixture } from "./helpers/open-ena-legacy-zero-backward";

for (const window of ["Conversation", "MovingStanzaWindow"] as const) {
  test(`legacy ${window} zero-backward configuration migrates with an explicit review notice`, async () => {
    const { data, config } = legacyZeroBackwardFixture(window);
    assert.deepEqual(validateConfig(data, config), []);
    const before = structuredClone(config);
    const preview = await importOpenEnaArtifactV3(JSON.stringify(config));
    assert.equal(preview.kind, "draft");
    if (preview.kind !== "draft") throw new Error("Expected draft");
    assert.deepEqual(preview.draft.standard.movingStanza.backward, { kind: "finite", value: 1 });
    assert.deepEqual(preview.draft.standard.movingStanza.forward, { kind: "finite", value: 0 });
    assert.equal(preview.draft.standard.movingStanza.rowOrder, null);
    assert.ok(preview.review.includes("legacy-standard-zero-backward"));
    assert.equal(preview.autoRun, false);
    assert.deepEqual(config, before);
    for (const locale of ["en", "zh-hans", "zh-hant"] as const) {
      const copy = getOpenEnaCopy(locale).modelV3.importPreview;
      const markup = renderToStaticMarkup(createElement(OpenEnaImportPreviewV3, {
        preview, drafts: createWorkspaceStateV3().model.drafts, copy,
        onCancel() {}, onAcceptDraft() {}, onKeepHistorical() {}, onAddReference() {},
      }));
      assert.ok(markup.includes(copy.legacyZeroBackward));
      assert.match(markup, /ena-import-zero-backward-notice/u);
      if (locale !== "en") assert.doesNotMatch(copy.legacyZeroBackward, /The imported Standard draft/u);
    }
  });

  for (const version of [1, 2] as const) test(`legacy v${version} ${window} bundle keeps original science through preview, Cancel, and adoption`, async () => {
    const bundle = legacyZeroBackwardBundle(window, version);
    const text = JSON.stringify(bundle);
    assert.equal(parseOpenEnaAnalysisBundle(text).schemaVersion, version);
    const preview = await importOpenEnaArtifactV3(text);
    assert.equal(preview.kind, "historical-result");
    if (preview.kind !== "historical-result") throw new Error("Expected historical result");
    assert.deepEqual(preview.artifact, JSON.parse(text), "the historical configuration, counts, and fit are untouched");
    assert.ok(preview.review.includes("legacy-standard-zero-backward"));
    const initial = createWorkspaceStateV3();
    let state = workspaceReducerV3(initial, { type: "preview", value: preview });
    state = workspaceReducerV3(state, { type: "cancel-preview" });
    assert.equal(state.model, initial.model);
    state = workspaceReducerV3(state, { type: "preview", value: preview });
    state = workspaceReducerV3(state, { type: "keep-historical", preview });
    assert.equal(state.historical[0], preview);
    assert.equal(state.model, initial.model);
    state = workspaceReducerV3(state, { type: "preview", value: preview });
    state = workspaceReducerV3(state, { type: "accept-draft-preview", preview });
    assert.deepEqual(state.model.drafts.standard.movingStanza.backward, { kind: "finite", value: 1 });
    assert.equal(state.raw.windows.standard.backward.finiteText, "1");
    assert.equal(state.model.runStatus, "idle");
    assert.equal(state.model.runningRequest, null);
    assert.equal(state.autoRunIntent, null);
    // A previously untouched ONA sibling still seeds from the adopted Standard
    // draft on the first switch; it must not resurrect the initial window 5.
    state = workspaceReducerV3(state, { type: "model", action: { type: "set-active-family", family: "ona" } });
    assert.deepEqual(state.model.drafts.ona.backward, { kind: "finite", value: 1 });
    assert.equal(state.raw.windows.ona.backward.finiteText, "1");
    assert.deepEqual(state.model.drafts.ona.unitColumns, ["unit"]);
  });

  for (const weightBy of ["binary", "sum"] as const) for (const forward of [0, 1, 2]) {
    test(`${window}/${weightBy}/forward ${forward}: migrated zero backward preserves multirow scientific counts`, async () => {
      const { data, config } = legacyZeroBackwardFixture(window);
      const original = { ...config, weightBy, windowSizeForward: forward };
      const oldResult = analyzeDataset(data, original);
      assert.deepEqual(oldResult.set.connectionCounts, analyzeDataset(data, { ...original, windowSizeBack: 1 }).set.connectionCounts);
      if (window === "MovingStanzaWindow" && forward === 0) {
        assert.notDeepEqual(oldResult.set.connectionCounts, analyzeDataset(data, { ...original, windowSizeBack: 2 }).set.connectionCounts,
          "fixture distinguishes current-row inclusion from adding a preceding row");
      }
      const migrated = migrateLegacyOpenEnaConfigToDraftV3(original);
      const draft = { ...migrated.standard, movingStanza: { ...migrated.standard.movingStanza,
        rowOrder: { kind: "columns" as const, keys: [{ column: "turn", direction: "ascending" as const, comparator: { type: "number" as const } }] as [{ column: string; direction: "ascending"; comparator: { type: "number" } }] },
      } };
      const compiled = await compileStandardDraftV3(data, "a".repeat(64), draft);
      assert.equal(compiled.status, "ready", JSON.stringify(compiled.diagnostics));
      if (compiled.status !== "ready") throw new Error("Expected ready model after explicit order selection");
      const plan = await buildStandardExecutionPlanV3({ dataset: data, datasetSha256: "a".repeat(64), compileResult: compiled, reference: null });
      const next = runStandardPlanV3(plan).set;
      const unitNames = new Map(plan.identityDictionary.units.map((entry) => [entry.token, entry.fields[0].value.value]));
      const oldCounts = Object.fromEntries(oldResult.set.connectionCounts.map((row) => [String(row.unit), oldResult.set.codeColumns.map((code) => row[code])]));
      const nextCounts = Object.fromEntries(next.connectionCounts.map((row) => [String(unitNames.get(String(row.__open_ena_unit_token))), next.codeColumns.map((code) => row[code])]));
      assert.deepEqual(nextCounts, oldCounts);
    });
  }
}

test("zero-backward migration keeps forward/Infinity intent and rejects unrelated invalid fields and ONA zero", async () => {
  const { config } = legacyZeroBackwardFixture();
  const infiniteForward = migrateLegacyOpenEnaConfigToDraftV3({ ...config, windowSizeForward: Infinity });
  assert.deepEqual(infiniteForward.standard.movingStanza.forward, { kind: "infinity" });
  const infiniteBack = await importOpenEnaArtifactV3(JSON.stringify({ ...config, windowSizeBack: "Infinity", windowSizeForward: 2 }));
  if (infiniteBack.kind !== "draft") throw new Error("Expected draft");
  assert.deepEqual(infiniteBack.draft.standard.movingStanza.backward, { kind: "infinity" });
  assert.deepEqual(infiniteBack.draft.standard.movingStanza.forward, { kind: "finite", value: 2 });
  assert.equal(infiniteBack.review.includes("legacy-standard-zero-backward"), false);
  for (const invalid of [
    { windowSizeBack: -1 }, { windowSizeBack: 0.5 }, { windowSizeBack: null }, { windowSizeBack: "0" },
    { windowSizeForward: -1 }, { windowSizeForward: null }, { windowSizeForward: "Infinity" },
    { weightBy: "unsupported" }, { codes: ["A", "A", "C"] }, { futureScientificMeaning: true },
  ]) await assert.rejects(importOpenEnaArtifactV3(JSON.stringify({ ...config, ...invalid })));
  const ona: OpenEnaConfig = { ...config, analysisKind: "ona", weightBy: "sum",
    orderPolicy: { kind: "columns", columns: ["turn"], comparators: { turn: "number" } },
    directionalMask: createDirectionalMask(config.codes),
  };
  await assert.rejects(importOpenEnaArtifactV3(JSON.stringify(ona)), /backward extent is invalid/u);
  const unchanged = await importOpenEnaArtifactV3(JSON.stringify({ ...config, windowSizeBack: 5 }));
  assert.equal(unchanged.review.includes("legacy-standard-zero-backward"), false);
  const native = migrateLegacyOpenEnaConfigToDraftV3(config).standard;
  const nativeFile = await exportDraftV3({ ...native, movingStanza: { ...native.movingStanza, backward: { kind: "finite", value: 0 } } });
  const nativePreview = await importOpenEnaArtifactV3(new TextDecoder().decode(nativeFile.bytes));
  if (nativePreview.kind !== "draft") throw new Error("Expected native draft");
  assert.deepEqual(nativePreview.draft.standard.movingStanza.backward, { kind: "finite", value: 0 },
    "native invalid draft intent is not silently repaired by the legacy compatibility rule");
  assert.equal(nativePreview.review.includes("legacy-standard-zero-backward"), false);
});
