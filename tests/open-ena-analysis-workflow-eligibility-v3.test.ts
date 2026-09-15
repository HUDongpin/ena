import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  analysisSetCaptureEligibilityV3,
  analysisSetCapturePredicateLabelV3,
  analysisSetCompareEligibilityV3,
  analysisSetComparePredicateLabelV3,
  analysisSetsShareCompatibleGeometryV3,
  wholePathAdmissionEligibilityV3,
  wholePathPredicateLabelV3,
} from "../lib/open-ena/analysis-workflow-eligibility-v3";
import { OpenEnaUnmetPrerequisiteList } from "../components/open-ena/OpenEnaUnmetPrerequisiteList";
import { OpenEnaTrajectoryAnalysisPanelV3, trajectoryAnalysisCopyV3 } from "../components/open-ena/model-v3/OpenEnaTrajectoryAnalysisPanelV3";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";
import { workspaceV3Source as v3, moduleSourceV3 } from "./helpers/open-ena-workspace-v3-ui";

const set = (id: string, geometry = "g1") => ({
  id,
  referenceSource: { source: "fitted" },
  geometry: { basis: geometry },
});

test("trajectory capture stays EndPoint-gated and lists every unmet capture predicate", () => {
  const trajectory = analysisSetCaptureEligibilityV3({
    current: true,
    standardFamily: true,
    endpointModel: false,
    retainedDimensionCount: 3,
    retainedSetCount: 0,
  });
  assert.equal(trajectory.eligible, false);
  assert.deepEqual(trajectory.unmet, ["endpoint-model"]);
  const empty = analysisSetCaptureEligibilityV3({
    current: false,
    standardFamily: false,
    endpointModel: false,
    retainedDimensionCount: 0,
    retainedSetCount: 6,
  });
  assert.deepEqual(empty.unmet, [
    "current-result",
    "standard-family",
    "endpoint-model",
    "two-retained-dimensions",
    "retention-capacity",
  ]);
  const endpoint = analysisSetCaptureEligibilityV3({
    current: true,
    standardFamily: true,
    endpointModel: true,
    retainedDimensionCount: 2,
    retainedSetCount: 1,
  });
  assert.equal(endpoint.eligible, true);
  assert.deepEqual(endpoint.unmet, []);
});

test("analysis-set compare documents same-basis even before two captured sets exist", () => {
  const none = analysisSetCompareEligibilityV3([]);
  assert.equal(none.eligible, false);
  assert.deepEqual(none.unmet, ["two-captured-sets", "same-basis-geometry"]);
  const compatible = analysisSetCompareEligibilityV3([set("a"), set("b")]);
  assert.equal(compatible.eligible, true);
  assert.equal(analysisSetsShareCompatibleGeometryV3(set("a"), set("b")), true);
  const mismatched = analysisSetCompareEligibilityV3([set("a"), set("b", "other")]);
  assert.equal(mismatched.eligible, false);
  assert.deepEqual(mismatched.unmet, ["same-basis-geometry"]);
});

test("whole-path admission lists remaining identity, horizon, axis, and group predicates separately", () => {
  const partial = wholePathAdmissionEligibilityV3({
    current: true,
    identityConfirmed: false,
    independentGroupsConfirmed: true,
    distinctGroups: true,
    axes: ["SVD1", "SVD2"],
    horizonCount: 2,
  });
  assert.equal(partial.eligible, false);
  assert.deepEqual(partial.unmet, ["three-supported-axes", "identity-confirmed"]);
  const ready = wholePathAdmissionEligibilityV3({
    current: true,
    identityConfirmed: true,
    independentGroupsConfirmed: true,
    distinctGroups: true,
    axes: ["SVD1", "SVD2", "SVD3"],
    horizonCount: 2,
  });
  assert.equal(ready.eligible, true);
  assert.deepEqual(ready.unmet, []);
});

test("disabled analysis-set and whole-path copy names Endpoint-only same-basis and trajectory gates", () => {
  for (const locale of ["en", "zh-hant", "zh-hans"] as const) {
    const artifacts = getOpenEnaCopy(locale).modelV3.workspace.artifacts;
    const path = trajectoryAnalysisCopyV3(locale);
    assert.match(analysisSetCapturePredicateLabelV3("endpoint-model", artifacts.capturePredicates), /EndPoint|端點|端点/);
    assert.match(analysisSetComparePredicateLabelV3("same-basis-geometry", artifacts.comparePredicates), /same-basis|同一基底|同一基底/);
    assert.ok(path.pairedNote.includes(locale === "en" ? "not implemented" : locale === "zh-hant" ? "尚未實作" : "尚未实现"));
    if (locale !== "en") {
      assert.notEqual(artifacts.unmetPrerequisites, getOpenEnaCopy("en").modelV3.workspace.artifacts.unmetPrerequisites);
      assert.notEqual(path.predicates["identity-confirmed"], trajectoryAnalysisCopyV3("en").predicates["identity-confirmed"]);
    }
  }
  assert.equal(wholePathPredicateLabelV3("two-ordered-horizons", trajectoryAnalysisCopyV3("en").predicates), "At least two Horizons in fitted order");
});

test("unmet prerequisite markup lists predicate ids and is omitted when empty", () => {
  const items = [
    { id: "endpoint-model", label: "EndPoint model" },
    { id: "same-basis-geometry", label: "Same basis" },
  ];
  const html = renderToStaticMarkup(createElement(OpenEnaUnmetPrerequisiteList, {
    id: "capture-unmet",
    title: "Unmet prerequisites",
    testId: "open-ena-capture-analysis-set-prerequisites",
    items,
  }));
  assert.match(html, /id="capture-unmet"/);
  assert.match(html, /data-testid="open-ena-capture-analysis-set-prerequisites"/);
  assert.match(html, /data-unmet-predicate="endpoint-model"/);
  assert.match(html, /data-unmet-predicate="same-basis-geometry"/);
  assert.equal(renderToStaticMarkup(createElement(OpenEnaUnmetPrerequisiteList, {
    id: "empty",
    title: "Unmet prerequisites",
    items: [],
  })), "");
});

test("whole-path panel checklist names remaining predicates without enabling the run action", () => {
  const copy = trajectoryAnalysisCopyV3("en");
  const html = renderToStaticMarkup(createElement(OpenEnaTrajectoryAnalysisPanelV3, {
    locale: "en",
    hidden: false,
    frameKey: "trajectory",
    result: {},
    plan: {},
    current: true,
    controls: null,
    admission: {
      current: true,
      identityConfirmed: true,
      distinctGroups: true,
      axes: ["SVD1", "SVD2"],
      horizonCount: 2,
    },
    ranks: [],
    confirmIdentityExport: () => {
      throw new Error("render must not request export permission");
    },
  }));
  assert.match(html, /data-testid="open-ena-whole-path-prerequisites"/);
  assert.match(html, /data-unmet-predicate="three-supported-axes"/);
  assert.match(html, /data-unmet-predicate="independent-groups-confirmed"/);
  assert.doesNotMatch(html, /data-unmet-predicate="identity-confirmed"/);
  assert.doesNotMatch(html, /data-unmet-predicate="two-ordered-horizons"/);
  assert.ok(html.includes(copy.pairedNote));
  const run = html.match(/<button[^>]*>Run whole-path comparison<\/button>/)?.[0] ?? "";
  assert.match(run, /disabled=""/);
  assert.match(run, /aria-describedby="native-path-requirements native-path-unmet"/);
});

test("Workspace wires capture/compare and whole-path eligibility to visible checklists", () => {
  assert.match(v3, /analysisSetCaptureEligibilityV3/);
  assert.match(v3, /analysisSetCompareEligibilityV3/);
  assert.match(v3, /admission=\{pathAdmission\}/);
  assert.match(v3, /open-ena-capture-analysis-set-prerequisites/);
  assert.match(v3, /open-ena-compare-analysis-sets-prerequisites/);
  assert.match(v3, /disabled=\{!captureEligibility\.eligible\}/);
  assert.match(v3, /disabled=\{!compareEligibility\.eligible\}/);
  assert.match(moduleSourceV3("lib/open-ena/analysis-workflow-eligibility-v3.ts"), /endpoint-model/);
  assert.match(moduleSourceV3("lib/open-ena/sets-bound-v3.ts"), /Analysis sets require EndPoint results/);
});
