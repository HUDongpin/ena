import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  beginAnalysisFamilyConfiguration,
  createAnalysisFamilyDrafts,
  switchAnalysisFamily,
} from "../lib/open-ena/analysis-family";
import { createDirectionalMask } from "../lib/open-ena/network-config";
import { SAMPLE_CONFIG, type OpenEnaConfig } from "../lib/open-ena/types";
import { OpenEnaAnalysisFamilyControl } from "../components/open-ena/OpenEnaAnalysisFamilyControl";
import {
  createModelStateV3,
  modelStateReducerV3,
} from "../components/open-ena/model-v3/model-state";
import type { ModelWorkspaceDraftsV3 } from "../lib/open-ena/model-v3/types";

function trajectoryEna(): OpenEnaConfig {
  return {
    ...SAMPLE_CONFIG,
    analysisKind: "ena",
    unitColumns: ["speaker"],
    conversationColumns: ["conversation"],
    groupColumn: "condition",
    codes: ["A", "B"],
    model: "SeparateTrajectory",
    window: "Conversation",
    windowSizeBack: 7,
    weightBy: "binary",
    rotation: "mean",
  };
}

test("analysis-family drafts restore family-specific choices while synchronizing shared fields", () => {
  const ena = trajectoryEna();
  const drafts = createAnalysisFamilyDrafts(ena);
  const orderPolicy = {
    kind: "columns" as const,
    columns: ["turn"],
    comparators: { turn: "number" as const },
  };

  const selectedOna = switchAnalysisFamily(drafts, ena, "ona", { orderPolicy });

  assert.equal(selectedOna.activeConfig.analysisKind, "ona");
  assert.equal(selectedOna.activeConfig.model, "EndPoint");
  assert.equal(selectedOna.activeConfig.window, "MovingStanzaWindow");
  assert.equal(selectedOna.activeConfig.windowSizeForward, 0);
  assert.equal(selectedOna.activeConfig.weightBy, "sum");
  assert.equal(selectedOna.activeConfig.rotation, "svd");
  assert.equal(selectedOna.activeConfig.referenceRotationId, null);
  assert.deepEqual(selectedOna.activeConfig.orderPolicy, orderPolicy);
  assert.deepEqual(selectedOna.activeConfig.directionalMask?.codeOrder, ["A", "B"]);

  const editedMask = createDirectionalMask(["A", "B"]);
  editedMask.enabled[0][1] = false;
  const editedOna: OpenEnaConfig = {
    ...selectedOna.activeConfig,
    unitColumns: ["speaker", "session"],
    conversationColumns: ["conversation", "phase"],
    groupColumn: "cohort",
    codes: ["A", "B"],
    windowSizeBack: 9,
    directionalMask: editedMask,
  };
  const selectedEna = switchAnalysisFamily(selectedOna.drafts, editedOna, "ena");

  assert.equal(selectedEna.activeConfig.analysisKind, "ena");
  assert.equal(selectedEna.activeConfig.model, "SeparateTrajectory");
  assert.equal(selectedEna.activeConfig.window, "Conversation");
  assert.equal(selectedEna.activeConfig.windowSizeBack, 7);
  assert.equal(selectedEna.activeConfig.weightBy, "binary");
  assert.equal(selectedEna.activeConfig.rotation, "mean");
  assert.deepEqual(selectedEna.activeConfig.unitColumns, ["speaker", "session"]);
  assert.deepEqual(selectedEna.activeConfig.conversationColumns, ["conversation", "phase"]);
  assert.equal(selectedEna.activeConfig.groupColumn, "cohort");
  assert.deepEqual(selectedEna.activeConfig.codes, ["A", "B"]);
  assert.equal(selectedEna.activeConfig.orderPolicy, null);
  assert.equal(selectedEna.activeConfig.directionalMask, null);

  const editedEna: OpenEnaConfig = {
    ...selectedEna.activeConfig,
    codes: ["A", "B", "C"],
  };
  const restoredOna = switchAnalysisFamily(selectedEna.drafts, editedEna, "ona");
  assert.equal(restoredOna.activeConfig.windowSizeBack, 9);
  assert.deepEqual(restoredOna.activeConfig.orderPolicy, orderPolicy);
  assert.equal(restoredOna.activeConfig.directionalMask?.enabled[0][1], false);
  assert.equal(restoredOna.activeConfig.directionalMask?.enabled[0][2], true);
  assert.equal(restoredOna.activeConfig.directionalMask?.enabled[2][0], true);
  assert.equal(restoredOna.activeConfig.directionalMask?.enabled[2][2], true);
  assert.deepEqual(restoredOna.activeConfig.codes, ["A", "B", "C"]);

  assert.deepEqual(ena.codes, ["A", "B"], "family transitions must not mutate caller-owned drafts");
});

test("ONA family activation fails closed until an explicit order policy exists", () => {
  const ena = trajectoryEna();
  const drafts = createAnalysisFamilyDrafts(ena);

  assert.throws(
    () => switchAnalysisFamily(drafts, ena, "ona"),
    /explicit order policy/i,
  );
});

test("ONA configuration can begin as an explicitly incomplete draft without becoming executable", () => {
  const ena = trajectoryEna();
  const drafts = createAnalysisFamilyDrafts(ena);
  const begun = beginAnalysisFamilyConfiguration(drafts, ena, "ona");

  assert.equal(begun.activeConfig.analysisKind, "ona");
  assert.equal(begun.activeConfig.orderPolicy, null);
  assert.equal(begun.activeConfig.model, "EndPoint");
  assert.equal(begun.activeConfig.window, "MovingStanzaWindow");
  assert.equal(begun.activeConfig.windowSizeForward, 0);
  assert.equal(begun.activeConfig.weightBy, "sum");
  assert.equal(begun.activeConfig.rotation, "svd");
  assert.deepEqual(begun.activeConfig.directionalMask?.codeOrder, ena.codes);
  assert.equal(begun.drafts.ena.model, "SeparateTrajectory");
  assert.equal(begun.drafts.ona.orderPolicy, null);

  assert.throws(
    () => switchAnalysisFamily(begun.drafts, begun.activeConfig, "ona"),
    /explicit order policy/i,
  );
});

test("analysis-family control renders two method cards instead of a switch", () => {
  const markup = renderToStaticMarkup(createElement(OpenEnaAnalysisFamilyControl, {
    value: "ona",
    onChange: () => undefined,
    copy: {
      legend: "Analysis family",
      methodBoundaryLabel: "Method boundary",
      selectedLabel: "Selected",
      ena: {
        label: "Standard ENA",
        description: "Undirected co-occurrence model",
        methodBoundary: "Standard family boundary",
      },
      ona: {
        label: "Ordered Network Analysis",
        description: "Ground-to-response model",
        methodBoundary: "Ordered family boundary",
      },
    },
  }));

  assert.equal((markup.match(/type="radio"/gu) ?? []).length, 2);
  assert.doesNotMatch(markup, /role="switch"/u);
  assert.match(markup, /Standard family boundary/u);
  assert.match(markup, /Ordered family boundary/u);
  assert.match(markup, /Selected/u);
});

test("v3 Exclude all clears only the active family and stays empty after remount and family round trip", () => {
  const workspace: ModelWorkspaceDraftsV3 = {
    schemaVersion: 3,
    activeFamily: "standard",
    standard: {
      unitColumns: ["speaker"], horizonColumns: ["conversation"], groupColumn: "condition",
      codes: ["A", "B", "C"], weighting: "binary", model: "EndPoint", windowType: "Conversation",
      movingStanza: {
        backward: { kind: "finite", value: 1 }, forward: { kind: "finite", value: 0 }, rowOrder: null,
      },
      horizonOrder: null,
      rotation: { type: "svd", centerAlignToOrigin: true },
    },
    ona: {
      unitColumns: ["speaker"], horizonColumns: ["conversation"], groupColumn: null,
      codes: ["C", "B", "A"], backward: { kind: "finite", value: 5 }, rowOrder: null,
      directionalMask: null,
    },
  };
  const sha = "f".repeat(64);
  const state = createModelStateV3(workspace, sha);
  const excluded = modelStateReducerV3(state, { type: "exclude-all-codes" });
  assert.deepEqual(excluded.drafts.standard.codes, []);
  assert.deepEqual(excluded.drafts.ona.codes, workspace.ona.codes);
  assert.equal(excluded.drafts.standard.windowType, "Conversation");

  const remounted = createModelStateV3(excluded.drafts, excluded.datasetSha256);
  assert.deepEqual(remounted.drafts.standard.codes, []);
  const ona = modelStateReducerV3(remounted, { type: "set-active-family", family: "ona" });
  assert.deepEqual(ona.drafts.ona.codes, workspace.ona.codes);
  const standard = modelStateReducerV3(ona, { type: "set-active-family", family: "standard" });
  assert.deepEqual(standard.drafts.standard.codes, []);
});
