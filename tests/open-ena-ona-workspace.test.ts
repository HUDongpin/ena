import { workspaceV3Source as v3, controllerV3Source as owner, renderWorkspaceShellV3 as shell, moduleSourceV3 as moduleV3, functionSourceV3 } from "./helpers/open-ena-workspace-v3-ui";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(
  new URL("../components/open-ena/OpenEnaWorkspace.tsx", import.meta.url),
  "utf8",
);
const dataView = readFileSync(
  new URL("../components/open-ena/OpenEnaDataView.tsx", import.meta.url),
  "utf8",
);
const i18n = readFileSync(new URL("../lib/open-ena-i18n.ts", import.meta.url), "utf8");

test("ONA has an independent native draft, explicit family switch, and scientific directional mask", () => {

  assert.match(v3, /<OpenEnaModelTabsV3/);
  assert.match(owner, /set-active-family/);
  assert.match(v3, /directionalMask/);
  assert.match(owner, /buildOnaExecutionPlanV3/);
  assert.doesNotMatch(v3, /updateOnaOrderPanel|coerceSelectedCodes/);

});

test("unfinished ONA order text remains in the durable raw owner across family transitions", () => {

  assert.match(owner, /windowFieldBlockersV3/);
  assert.match(owner, /windows-raw/);
  assert.match(v3, /rawState=\{state.raw.windows\}/);
  assert.doesNotMatch(v3, /applyAnalysisFamilyPolicy/);

});

test("completed bound family owns the plot and Data View while the editor family can differ", () => {

  assert.match(v3, /completedResultKind = result\?\.configuration.analysisFamily/);
  assert.match(v3, /completedResultKind === "ona"/);
  assert.match(v3, /buildDataViewV3\(result, currentPlan\)/);
  assert.doesNotMatch(v3, /isOrderedResult\(result, config\)/);

});

test("ONA descriptive Group selectors preserve the full declared identity inventory", () => {

  assert.match(v3, /identityDictionary.groups/);
  assert.match(v3, /groups.map\(\(group\) => <option/);
  assert.match(v3, /copy.ona.layout.descriptiveBoundary/);
  assert.doesNotMatch(v3, /groups.slice\(0, 2\)/);

});

test("native ONA exports preserve their strict grammar and separate selected-group descriptive output", () => {

  assert.match(v3, /buildOnaBoundViewV3\(result, currentPlan, primaryGroupName \|\| null\)/);
  assert.match(v3, /exportCurrentAnalysisV3\(result, currentPlan\)/);
  assert.doesNotMatch(v3, /selectedPresentationGroupOrder|buildAnalysisBundle\(/);

});

test("native ONA Data View and 3D remain reachable while inference is explicitly unavailable", () => {

  assert.match(v3, /<OpenEna3DOrderedResultLayout/);
  assert.match(v3, /<OpenEnaDataView/);
  assert.match(v3, /ONA remains descriptive only; group and trajectory inference are unavailable/);
  assert.match(v3, /disabled=\{!current \|\| !controls \|\| inferenceBusy \|\| completedResultKind === "ona"\}/);

});

test("ONA exports distinguish aggregate edges, deidentified full-run audit, local identities, and bound bundle", () => {

  for (const text of ["Export ONA aggregate edges", "Export ONA deidentified audit", "Export current Data View", "Export current analysis"]) assert.ok(v3.includes(text));
  assert.match(v3, /window.confirm\(copy.ona.exports.auditConfirmation\)/);
  assert.match(moduleV3("lib/open-ena/ona-bound-view-v3.ts"), /auditRows/);
  assert.match(v3, /Full-run deidentified ordered audit/);

});

test("English, Traditional Chinese, and Simplified Chinese ONA research copy is present", () => {
  assert.match(i18n, /ona:\s*\{/);
  assert.match(i18n, /Ordered Network Analysis/);
  assert.match(i18n, /順序網絡分析/);
  assert.match(i18n, /顺序网络分析/);
  assert.match(i18n, /ground\/source/);
  assert.match(i18n, /來源\/ground|來源碼|源码|source\/ground/);
});
