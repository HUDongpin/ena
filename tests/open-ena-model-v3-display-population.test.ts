import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prepareTeachingSampleV3 } from "../lib/open-ena/sample-source-v3";
import { compileStandardDraftV3 } from "../lib/open-ena/model-v3/compiler";
import { buildStandardExecutionPlanV3 } from "../lib/open-ena/model-v3/execution-plan";
import { bindResultV3 } from "../lib/open-ena/model-v3/result-binding";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import { buildTrajectoryPresentationV3 } from "../lib/open-ena/trajectory-presentation-v3";
import { presentBoundResultV3 } from "../lib/open-ena/bound-presentation-v3";
import { compileOpenEna3dPlotSpec } from "../lib/open-ena/plot3d";
import OpenEnaPlot from "../components/open-ena/OpenEnaPlot";
import OpenEnaGroupDisplayControls from "../components/open-ena/OpenEnaGroupDisplayControls";
import { DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS } from "../lib/open-ena/group-display";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";

async function sample() {
  const text = await readFile("public/data/academy/ena-2d-trajectory-teaching-sample.csv", "utf8");
  const source = await prepareTeachingSampleV3(text, "trajectory", new Date("2026-09-06T00:00:00Z"));
  const compiled = await compileStandardDraftV3(source.dataset, source.datasetSha256, source.drafts.standard);
  if (compiled.status !== "ready") throw new Error("Fixture must compile");
  const plan = await buildStandardExecutionPlanV3({ dataset: source.dataset, datasetSha256: source.datasetSha256, compileResult: compiled, reference: null });
  return bindResultV3(plan, runStandardPlanV3(plan), { processedRows: plan.rows.length, maximumBufferedRows: 0, numericCellsAllocated: 120, peakBytesObservedOrBounded: 10240, observationMethod: "exact-counters-and-conservative-byte-bound" }, compiled.diagnostics);
}

test("hidden trajectory Units govern summary population and shared contributors independently from individual paths", async () => {
  const result = await sample(), before = JSON.stringify(result);
  const dictionary = result.executionProvenance.identityDictionary;
  const group = dictionary.groups.find((entry) => entry.fields[0].value.value === "G2")!;
  const unit = dictionary.units.find((entry) => entry.fields.some((field) => field.column === "Speaker" && field.value.value === "S05"))!;
  const options = { showCentroidPaths: true, endpointsOnly: false, visibleHorizons: null };
  const full = buildTrajectoryPresentationV3(result, options);
  const hiddenUnitKeys = [JSON.stringify([group.token, unit.token])];
  const hidden = buildTrajectoryPresentationV3(result, { ...options, hiddenUnitKeys, groupSettingsByToken: { [group.token]: { ...DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS, includeHiddenPoints: false } } });
  assert.equal(hidden.points.length, 15);
  assert.equal(hidden.paths.length, 10);
  assert.ok(hidden.centroids.filter((centroid) => centroid.group === group.displayLabel).every((centroid) => centroid.n === 2));
  assert.ok(hidden.centroidPaths.filter((path) => path.from.group === group.displayLabel).every((path) => path.sharedContributorCount === 2));
  for (const centroid of hidden.centroids.filter((entry) => entry.group === group.displayLabel)) {
    const rows = result.set.points.filter((point) => point.Group === group.displayLabel && point.Horizon === centroid.horizon && point.Unit !== unit.displayLabel);
    for (const [axis, coordinate] of Object.entries(centroid.point)) assert.equal(coordinate, rows.reduce((sum, row) => sum + Number(row[axis]), 0) / rows.length);
  }
  const include = buildTrajectoryPresentationV3(result, { ...options, hiddenUnitKeys, groupSettingsByToken: { [group.token]: { ...DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS, includeHiddenPoints: true } } });
  assert.deepEqual(include.centroids, full.centroids);
  assert.deepEqual(include.centroidPaths, full.centroidPaths);
  assert.equal(include.points.length, 15);
  assert.equal(include.paths.length, 10, "including a Unit in summaries must not reveal its individual path");
  const restored = buildTrajectoryPresentationV3(result, { ...options, hiddenUnitKeys: [] });
  assert.deepEqual(restored, full);
  const keptHorizons = dictionary.horizons.filter((entry) => entry.fields[0].value.value !== "TP2").map((entry) => entry.canonicalJson);
  const gaps = buildTrajectoryPresentationV3(result, { ...options, hiddenUnitKeys, visibleHorizons: keptHorizons });
  assert.equal(gaps.paths.length, 0); assert.equal(gaps.centroidPaths.length, 0);
  assert.equal(JSON.stringify(result), before, "display population choices preserve every bound scientific fact");
  const projected = presentBoundResultV3(result), axes = projected.result.dimensions;
  const props = { result: { ...projected.result, trajectoryPresentation: full }, groupColumn: "Group", view: "2d" as const, xDimension: axes[0], yDimension: axes[1], zDimension: axes[2], camera: "isometric" as const, showPoints: true, showNetworks: true, showLabels: true, showUnitLabels: false, showVariance: false, showTrajectories: true, edgeScale: 1, edgeThreshold: 0, pointScale: 1, plotZoom: 1, flipX: false, flipY: false, copy: getOpenEnaCopy("en") };
  const base3d = compileOpenEna3dPlotSpec(props), hidden3d = compileOpenEna3dPlotSpec({ ...props, result: { ...projected.result, trajectoryPresentation: hidden } });
  assert.deepEqual(hidden3d.layout.scene, base3d.layout.scene);
  const svg = renderToStaticMarkup(createElement(OpenEnaPlot, { ...props, result: { ...projected.result, trajectoryPresentation: hidden } }));
  assert.equal((svg.match(/data-ena-trajectory-path="true"/g) ?? []).length, 10);
});

test("effective Group suppression reports zero visibility and disables overridden controls without rewriting stored choices", () => {
  const groups = [{ id: "g1", name: "G1", color: "#000000", unitIds: ["u1", "u2", "u3"] }];
  const settingsByGroup = { g1: { ...DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS, includeHiddenPoints: true, showOutlierIntervals: true } };
  const before = JSON.stringify(settingsByGroup);
  const markup = renderToStaticMarkup(createElement(OpenEnaGroupDisplayControls, { groups, settingsByGroup, hiddenUnitKeys: [JSON.stringify(["g1", "u2"])], view: "2d", suppressedGroups: { g1: "Preset suppression overrides these saved controls." }, intervalsUnavailableReason: "Native trajectories do not provide these intervals.", onSettingsChange() {}, onUnitVisibilityChange() {}, onRevealAllHidden() {} }));
  assert.match(markup, /G1 · 0 of 3 unit points visible/);
  assert.match(markup, /Unit visibility · 0\/3/);
  assert.match(markup, /Preset suppression overrides these saved controls/);
  assert.match(markup, /Native trajectories do not provide these intervals/);
  for (const input of markup.match(/<input\b[^>]*role="switch"[^>]*>/g) ?? []) assert.match(input, /disabled=""/);
  assert.equal(JSON.stringify(settingsByGroup), before);
  const endpoint = renderToStaticMarkup(createElement(OpenEnaGroupDisplayControls, { groups, settingsByGroup, hiddenUnitKeys: [], view: "2d", onSettingsChange() {}, onUnitVisibilityChange() {}, onRevealAllHidden() {} }));
  const confidence = endpoint.match(/<input\b[^>]*aria-label="Show confidence intervals for G1"[^>]*>/)?.[0] ?? "";
  assert.ok(confidence); assert.doesNotMatch(confidence, /disabled=/);
  assert.match(endpoint, /G1 · 3 of 3 unit points visible/);
});


test("hiding the sole fitted connector contributor leaves two observed centroids disconnected", async () => {
  const { bindingFixtureV3 } = await import("./helpers/open-ena-model-v3-fixture");
  const fixture = await bindingFixtureV3(undefined, (draft, data) => {
    draft.model = "SeparateTrajectory";
    data.rows = [
      { unit: "u1", horizon: "h1", time: 1, group: "G", A: 1, B: 2, C: 1 },
      { unit: "u1", horizon: "h2", time: 2, group: "G", A: 2, B: 1, C: 3 },
      { unit: "u2", horizon: "h1", time: 1, group: "G", A: 1, B: 3, C: 1 },
      { unit: "u3", horizon: "h2", time: 2, group: "G", A: 3, B: 1, C: 2 },
    ];
  });
  const result = await bindResultV3(fixture.plan, runStandardPlanV3(fixture.plan), { processedRows: 4, maximumBufferedRows: 0, numericCellsAllocated: 120, peakBytesObservedOrBounded: 10240, observationMethod: "exact-counters-and-conservative-byte-bound" }, fixture.compiled.diagnostics);
  const group = result.executionProvenance.identityDictionary.groups[0];
  const unit = result.executionProvenance.identityDictionary.units.find((entry) => entry.fields[0].value.value === "u1")!;
  const options = { showCentroidPaths: true, endpointsOnly: false, visibleHorizons: null, hiddenUnitKeys: [JSON.stringify([group.token, unit.token])] };
  const hidden = buildTrajectoryPresentationV3(result, options);
  assert.deepEqual(hidden.centroids.map((centroid) => centroid.n), [1, 1]);
  assert.equal(hidden.paths.length, 0);
  assert.equal(hidden.centroidPaths.length, 0, "different remaining Units at each end do not establish continuity");
  const included = buildTrajectoryPresentationV3(result, { ...options, groupSettingsByToken: { [group.token]: { ...DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS, includeHiddenPoints: true } } });
  assert.deepEqual(included.centroids.map((centroid) => centroid.n), [2, 2]);
  assert.equal(included.centroidPaths[0].sharedContributorCount, 1);
  assert.equal(included.paths.length, 0);
});

for (const name of ["constructor", "toString"]) test(`legacy Group name ${name} does not inherit suppression or query state`, () => {
  const markup = renderToStaticMarkup(createElement(OpenEnaGroupDisplayControls, { groups: [{ name, color: "#000000", unitIds: ["u1", "u2"] }], settingsByGroup: {}, hiddenUnitKeys: [JSON.stringify([name, "u2"])], view: "2d", onSettingsChange() {}, onUnitVisibilityChange() {}, onRevealAllHidden() {} }));
  const reveal = markup.match(/<button[^>]*aria-label="Show all hidden unit points"[^>]*>/)?.[0] ?? "";
  assert.ok(reveal); assert.doesNotMatch(reveal, /disabled=|aria-describedby=/);
  assert.match(markup, new RegExp(`${name} · 1 of 2 unit points visible`));
});
