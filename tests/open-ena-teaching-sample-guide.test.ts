import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OpenEnaTeachingSampleProgress } from "../components/open-ena/OpenEnaTeachingSampleProgress";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";
import {
  OPEN_ENA_EXPORT_FAMILIES,
  OPEN_ENA_EXPORT_FAMILY_NAMES,
} from "../lib/open-ena/export-applicability";
import { compileOnaDraftV3, compileStandardDraftV3 } from "../lib/open-ena/model-v3/compiler";
import { prepareTeachingSampleV3 } from "../lib/open-ena/sample-source-v3";
import {
  TEACHING_SAMPLE_CATALOG,
  TEACHING_SAMPLE_KINDS,
  teachingSampleFamilyName,
  teachingSampleFirstSuccessProgress,
  teachingSampleKindFromLoadRequest,
} from "../lib/open-ena/teaching-sample-guide";
import { renderWorkspaceShellV3 } from "./helpers/open-ena-workspace-v3-ui";

test("teaching samples reuse the export family names and state row shape plus expected output", () => {
  assert.deepEqual(TEACHING_SAMPLE_KINDS.map((kind) => teachingSampleFamilyName(kind)), [
    OPEN_ENA_EXPORT_FAMILY_NAMES.endpoint,
    OPEN_ENA_EXPORT_FAMILY_NAMES.separate,
    OPEN_ENA_EXPORT_FAMILY_NAMES.ona,
  ]);
  assert.equal(TEACHING_SAMPLE_CATALOG.endpoint.family, "endpoint");
  assert.equal(TEACHING_SAMPLE_CATALOG.trajectory.family, "separate");
  assert.equal(TEACHING_SAMPLE_CATALOG.ona.family, "ona");
  assert.equal(TEACHING_SAMPLE_CATALOG.trajectory.expectedOutput, "separate-trajectory");
  assert.equal(OPEN_ENA_EXPORT_FAMILY_NAMES.accumulated, "Accumulated trajectory");
  assert.ok(OPEN_ENA_EXPORT_FAMILIES.includes("accumulated"));
  assert.deepEqual(
    TEACHING_SAMPLE_KINDS.map((kind) => TEACHING_SAMPLE_CATALOG[kind].family).slice().sort(),
    ["endpoint", "ona", "separate"],
  );

  for (const locale of ["en", "zh-hant", "zh-hans"] as const) {
    const copy = getOpenEnaCopy(locale).modelV3.workspace.data;
    for (const family of OPEN_ENA_EXPORT_FAMILIES) {
      assert.ok(copy.teachingSamples.families[family].trim().length > 0, `${locale} ${family}`);
    }
    if (locale === "en") {
      assert.deepEqual(copy.teachingSamples.families, OPEN_ENA_EXPORT_FAMILY_NAMES);
      assert.equal(copy.teachingSamples.expectedOutputs.endpoint, "Endpoint fit");
      assert.equal(copy.teachingSamples.expectedOutputs.trajectory, OPEN_ENA_EXPORT_FAMILY_NAMES.separate);
      assert.equal(copy.teachingSamples.expectedOutputs.ona, "ONA-ready");
      assert.match(copy.teachingSamples.rowShapes.endpoint, /48 synthetic rows/);
      assert.match(copy.teachingSamples.rowShapes.trajectory, /54 synthetic rows/);
      assert.match(copy.teachingSamples.rowShapes.trajectory, /TP1–TP3/);
      assert.match(copy.teachingSamples.rowShapes.ona, /48 synthetic rows/);
    } else {
      assert.notEqual(copy.teachingSamples.families.separate, OPEN_ENA_EXPORT_FAMILY_NAMES.separate);
      assert.notEqual(copy.teachingSamples.families.accumulated, OPEN_ENA_EXPORT_FAMILY_NAMES.accumulated);
      assert.equal(copy.teachingSamples.families.ona, "ONA");
    }
  }

  const fallback = getOpenEnaCopy("es").modelV3.workspace.data.teachingSamples;
  assert.deepEqual(fallback.families, OPEN_ENA_EXPORT_FAMILY_NAMES);
  assert.equal(fallback.expectedOutputs.ona, "ONA-ready");
});

test("the Data rail discloses family, row shape, and expected output on each teaching sample", () => {
  const shell = renderWorkspaceShellV3("en");
  assert.match(shell, />Load sample<\/button>/);
  assert.match(shell, />Load trajectory sample<\/button>/);
  assert.match(shell, />Load ONA sample<\/button>/);
  assert.match(shell, /Family: Endpoint/);
  assert.match(shell, /Row shape: 48 synthetic rows · 8 teams · 5 codes/);
  assert.match(shell, /Expected output: Endpoint fit/);
  assert.match(shell, /Family: Separate trajectory/);
  assert.match(shell, /Row shape: 54 synthetic rows · 6 learners · TP1–TP3 · 6 codes/);
  assert.match(shell, /Expected output: Separate trajectory/);
  assert.match(shell, /Family: ONA/);
  assert.match(shell, /Expected output: ONA-ready/);
  assert.match(shell, /data-teaching-sample="endpoint"/);
  assert.match(shell, /data-teaching-sample="trajectory"/);
  assert.match(shell, /data-teaching-sample="ona"/);

  const hant = renderWorkspaceShellV3("zh-hant");
  assert.match(hant, /模型族: 端點/);
  assert.match(hant, /模型族: 分離軌跡/);
  assert.match(hant, /模型族: ONA/);
  assert.match(hant, /預期產出: 端點擬合/);
  assert.match(hant, /預期產出: 分離軌跡/);
  assert.match(hant, /預期產出: 可建立 ONA/);
  assert.doesNotMatch(hant, /Family: Endpoint/);

  const hans = renderWorkspaceShellV3("zh-hans");
  assert.match(hans, /模型族: 端点/);
  assert.match(hans, /模型族: 分离轨迹/);
  assert.match(hans, /预期产出: 端点拟合/);
  assert.match(hans, /预期产出: 可构建 ONA/);
  assert.doesNotMatch(hans, /Separate trajectory/);

  const spanish = renderWorkspaceShellV3("es");
  assert.match(spanish, /Family: Separate trajectory/);
  assert.match(spanish, /Expected output: ONA-ready/);
});

test("first-success progress stays on load, prefilled drafts, remaining gates, then Build", () => {
  const clear = teachingSampleFirstSuccessProgress({
    loaded: true,
    draftsPrefilled: true,
    admissionSettled: true,
    remainingGateCount: 0,
    buildPhase: "pending",
  });
  assert.deepEqual(clear.map((step) => [step.id, step.done]), [
    ["load", true],
    ["drafts", true],
    ["gates", true],
    ["build", false],
  ]);

  const blocked = teachingSampleFirstSuccessProgress({
    loaded: true,
    draftsPrefilled: true,
    admissionSettled: true,
    remainingGateCount: 1,
    buildPhase: "pending",
  });
  assert.equal(blocked.find((step) => step.id === "gates")?.done, false);
  assert.equal(blocked.find((step) => step.id === "build")?.done, false);

  const checking = teachingSampleFirstSuccessProgress({
    loaded: true,
    draftsPrefilled: true,
    admissionSettled: false,
    remainingGateCount: 0,
    buildPhase: "running",
  });
  assert.equal(checking.find((step) => step.id === "gates")?.done, false);
  assert.equal(checking.find((step) => step.id === "build")?.done, false);

  const built = teachingSampleFirstSuccessProgress({
    loaded: true,
    draftsPrefilled: true,
    admissionSettled: true,
    remainingGateCount: 0,
    buildPhase: "succeeded",
  });
  assert.equal(built.every((step) => step.done), true);
  assert.equal(teachingSampleKindFromLoadRequest(true), "trajectory");
  assert.equal(teachingSampleKindFromLoadRequest(false), "endpoint");
  assert.equal(teachingSampleKindFromLoadRequest("ona"), "ona");

  const copy = getOpenEnaCopy("en").modelV3.workspace.data.firstSuccess;
  const markup = renderToStaticMarkup(createElement(OpenEnaTeachingSampleProgress, {
    kind: "ona",
    familyLabel: OPEN_ENA_EXPORT_FAMILY_NAMES.ona,
    steps: blocked,
    buildPhase: "pending",
    admissionSettled: true,
    remainingGates: [{ id: "ONA_ORDER_INVALID:rowOrder", label: "ONA row order cannot be resolved exactly." }],
    copy,
  }));
  assert.match(markup, /data-progress-step="load" data-done="true"/);
  assert.match(markup, /data-progress-step="drafts" data-done="true"/);
  assert.match(markup, /Eligible drafts prefilled for ONA/);
  assert.match(markup, /data-progress-step="gates" data-done="false"/);
  assert.match(markup, /data-unmet-predicate="ONA_ORDER_INVALID:rowOrder"/);
  assert.match(markup, /ONA row order cannot be resolved exactly/);
  assert.match(markup, /data-progress-step="build" data-done="false"/);
  assert.match(markup, /fixed ONA contract is prefilled and unchanged/);
  assert.match(markup, /Analysis sets stay an Endpoint gate/);

  const trajectory = renderToStaticMarkup(createElement(OpenEnaTeachingSampleProgress, {
    kind: "trajectory",
    familyLabel: OPEN_ENA_EXPORT_FAMILY_NAMES.separate,
    steps: clear,
    buildPhase: "pending",
    admissionSettled: true,
    remainingGates: [],
    copy,
  }));
  assert.match(trajectory, /No remaining Build gates/);
  assert.match(trajectory, /Accumulated trajectory/);
  assert.match(trajectory, /Analysis sets stay an Endpoint gate/);
});

test("the ONA teaching sample prefills an eligible draft and the trajectory sample still honors the order gate", async () => {
  const endpointText = await readFile("public/data/academy/ena-design-talk-sample.csv", "utf8");
  const trajectoryText = await readFile("public/data/academy/ena-2d-trajectory-teaching-sample.csv", "utf8");
  const confirmedAt = new Date("2026-09-06T00:00:00.000Z");
  const endpoint = await prepareTeachingSampleV3(endpointText, "endpoint", confirmedAt);
  const ona = await prepareTeachingSampleV3(endpointText, "ona", confirmedAt);
  const trajectory = await prepareTeachingSampleV3(trajectoryText, "trajectory", confirmedAt);

  assert.equal(endpoint.drafts.activeFamily, "standard");
  assert.equal(ona.drafts.activeFamily, "ona");
  assert.equal(trajectory.drafts.activeFamily, "standard");
  assert.deepEqual(ona.drafts.standard, endpoint.drafts.standard);
  assert.deepEqual(ona.drafts.ona, endpoint.drafts.ona);
  assert.ok(ona.drafts.ona.directionalMask);
  assert.deepEqual(trajectory.drafts.standard.horizonColumns, ["Period"]);

  const onaCompiled = await compileOnaDraftV3(ona.dataset, ona.datasetSha256, ona.drafts.ona);
  assert.equal(onaCompiled.status, "ready", onaCompiled.diagnostics.map((entry) => entry.id).join(", "));

  const trajectoryStandard = await compileStandardDraftV3(trajectory.dataset, trajectory.datasetSha256, trajectory.drafts.standard);
  assert.equal(trajectoryStandard.status, "ready");
  const trajectoryOna = await compileOnaDraftV3(trajectory.dataset, trajectory.datasetSha256, trajectory.drafts.ona);
  assert.equal(trajectoryOna.status, "invalid");
  assert.ok(trajectoryOna.diagnostics.some((entry) => entry.id === "ONA_ORDER_INVALID" && entry.blocks.includes("build-model")));
});
