import { workspaceV3Source as v3, controllerV3Source as owner, renderWorkspaceShellV3 as shell, moduleSourceV3 as moduleV3, functionSourceV3 } from "./helpers/open-ena-workspace-v3-ui";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { analyzeDataset } from "../lib/open-ena/analyze";
import { parseCsv } from "../lib/open-ena/csv";
import { buildEndpointMannWhitney } from "../lib/open-ena/inference";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";
import { SAMPLE_CONFIG } from "../lib/open-ena/types";

const projectRoot = process.cwd();
const source = (relativePath: string) => {
  const absolutePath = join(projectRoot, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
};

const workspace = source("components/open-ena/OpenEnaWorkspace.tsx");
const groupContrastSurface = source("components/open-ena/OpenEnaGroupContrast.tsx");
const inference = source("lib/open-ena/inference.ts");
const exportsSource = source("lib/open-ena/export.ts");
const copy = source("lib/open-ena-i18n.ts");

function endpointResult(groupNames: readonly string[]) {
  const rows = groupNames.flatMap((group, groupIndex) => [
    `u${groupIndex + 1}a,c${groupIndex + 1}a,${group},1,${groupIndex % 2},1`,
    `u${groupIndex + 1}b,c${groupIndex + 1}b,${group},${groupIndex % 2},1,1`,
  ]);
  const dataset = parseCsv(
    ["unit,conversation,group,A,B,C", ...rows].join("\n") + "\n",
    { name: `${groupNames.length}-groups.csv`, source: "upload" },
  );
  const config = {
    ...SAMPLE_CONFIG,
    unitColumns: ["unit"],
    conversationColumns: ["conversation"],
    groupColumn: "group",
    codes: ["A", "B", "C"],
    window: "Conversation",
  } as typeof SAMPLE_CONFIG;
  return analyzeDataset(dataset, config);
}

test("Group selectors expose every declared typed identity for the current result", () => {

  assert.match(v3, /identityDictionary.groups/);
  assert.match(v3, /aria-label="Primary Group"/);
  assert.match(v3, /aria-label="Secondary Group"/);
  assert.match(v3, /groups.map\(\(group\) => <option key=\{group.token\} value=\{group.token\}/);

});

test("current Group selectors remain independent from captured analysis sets", () => {

  assert.match(v3, /value=\{primaryGroupName\}/);
  assert.match(v3, /value=\{secondaryGroupName\}/);
  assert.match(v3, /upsertAnalysisSetV3/);
  assert.doesNotMatch(v3, /primarySetId|secondarySetId/);

});

test("group contrast defaults to the first two groups in stable result order", () => {
  const declaredOrder = ["Zulu", "Alpha", "Gamma"] as const;
  const result = endpointResult(declaredOrder);
  assert.deepEqual(result.groups.map((group) => group.name), declaredOrder);


  assert.match(v3, /groups\[0\]\?\.token/);
  assert.match(v3, /groups.some\(\(group\) => group.token === previous/);
  assert.match(v3, /setPrimaryGroupName\(secondaryGroupName\)/);
  assert.match(v3, /setSecondaryGroupName\(primaryGroupName\)/);

});

test("one typed pair and two inference axes persist while inference requires explicit Run", () => {

  assert.match(v3, /primaryGroup: primary.fields\[0\].value/);
  assert.match(v3, /axes: \[twoDAxes\[0\], twoDAxes\[1\]\]/);
  assert.match(v3, /onClick=\{\(\) => void attempt\(runInference\)\}/);
  assert.match(v3, /onClick=\{\(\) => setMode\(entry\)\}/);

});

test("Stats localizes the selected axes instead of leaking an English connector", () => {

  assert.match(v3, /copy.contrast.selectedAxes/);
  assert.deepEqual((["en", "zh-hant", "zh-hans"] as const).map((locale) => getOpenEnaCopy(locale).contrast.selectedAxes), ["Selected axes", "所選座標軸", "所选坐标轴"]);

});

test("native contrast presentation retains Comparison, Primary, Secondary, and persistent tools", () => {

  assert.match(v3, /presentBoundGroupDisplayV3/);
  assert.match(v3, /<OpenEnaGroupContrast .*centerMode=\{centerSurface\} dataView=\{nativeDataView\} rightTools=\{persistentPlotTools\}/);
  for (const id of ["open-ena-group-comparison-plot", "open-ena-group-primary-plot", "open-ena-group-secondary-plot"]) assert.ok(groupContrastSurface.includes(id));

});

test("selected-pair inference works with three total groups and preserves selected order", () => {
  const result = endpointResult(["baseline", "guided", "transfer"]);
  const axes = [result.dimensions[1], result.dimensions[0]] as const;
  const selectedOrder = ["transfer", "guided"] as const;
  const selectedInference = buildEndpointMannWhitney(
    result,
    "group",
    axes,
    selectedOrder,
  );

  assert.equal(selectedInference.status, "available");
  assert.equal(selectedInference.reason, null);
  assert.deepEqual(selectedInference.groupOrder, selectedOrder);
  assert.deepEqual(selectedInference.rows.map((row) => row.dimension), axes);
  assert.ok(selectedInference.rows.every((row) => row.nFirst === 2 && row.nSecond === 2));
});

test("the legacy pairwise wrapper remains compatible while the explicit Stats workflow declares Holm", () => {
  const result = endpointResult(["G4", "G1", "G6", "G2", "G5", "G3"]);
  const axes = result.dimensions.slice(0, 2);
  const selectedOrder = ["G5", "G1"] as const;
  const selectedInference = buildEndpointMannWhitney(
    result,
    "group",
    axes,
    selectedOrder,
  ) as ReturnType<typeof buildEndpointMannWhitney> & { multiplicityCorrection: "none" };

  assert.deepEqual(result.groups.map((group) => group.name), ["G4", "G1", "G6", "G2", "G5", "G3"]);
  assert.equal(selectedInference.status, "available");
  assert.deepEqual(selectedInference.groupOrder, selectedOrder);
  assert.equal(selectedInference.multiplicityCorrection, "none");
  assert.match(inference, /selected[^\n]*(?:group|pair)/i);

  assert.match(v3, /<OpenEnaNativeStatsPanelV3/);
  assert.match(copy, /multiplicity:[^\n]*Holm/);

});

test("native contrast exports bind selected groups and axes separately from immutable model statistics", () => {

  assert.match(v3, /exportContrastV3\(/);
  const nativeExport = moduleV3("lib/open-ena/contrast-export-v3.ts");
  assert.match(nativeExport, /buildContrastV3\(/);
  assert.match(nativeExport, /controls/);
  assert.match(v3, /exportCurrentAnalysisV3\(result, currentPlan\)/);
  assert.match(v3, /Model bundles contain unavailable statistics/);

});

test("unavailable contrast does not invalidate ungrouped or rank-one fitted geometry", () => {

  assert.match(v3, /Contrast requires two declared Groups and two supported fitted axes/);
  assert.match(v3, /Only one supported fitted axis is available/);
  assert.match(v3, /buildLongitudinalViewV3/);
  assert.match(v3, /consumerError && <p role="status"/);

});

test("3D contrast reuses the bound model with independent supported display axes", () => {

  assert.match(v3, /<OpenEna3DGroupContrast .*result=\{plotResult!\} contrast=\{contrast\}/);
  assert.match(v3, /threeDDimensions !== null/);
  assert.match(v3, /setView\("3d"\)/);
  assert.doesNotMatch(v3, /openThreeDRoute|router.push/);

});
