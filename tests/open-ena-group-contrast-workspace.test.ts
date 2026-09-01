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

test("endpoint results expose dedicated Primary group and Secondary group selectors", () => {
  assert.match(
    workspace,
    /primaryGroup(?:Name)?/,
    "the Workspace needs state for the selected Primary group, distinct from primarySetId",
  );
  assert.match(
    workspace,
    /secondaryGroup(?:Name)?/,
    "the Workspace needs state for the selected Secondary group, distinct from secondarySetId",
  );
  assert.match(
    workspace,
    /(?:aria-label|data-testid)=["{][^\n>]*(?:endpoint )?group contrast/i,
    "the two current-result group selectors need their own labelled control region",
  );
  assert.match(`${workspace}\n${copy}`, /Primary group/i);
  assert.match(`${workspace}\n${copy}`, /Secondary group/i);
  assert.match(
    workspace,
    /result\.groups\.map\([\s\S]{0,500}<option/,
    "selector options must come from the current result's stable group list",
  );
});

test("current-result group selectors remain after the Analysis Sets interface is removed", () => {
  assert.doesNotMatch(workspace, /function renderSetsPanel\(\)/);
  assert.doesNotMatch(workspace, /primarySetId|secondarySetId/);
  assert.match(
    workspace,
    /(?:group contrast|contrast groups)[\s\S]{0,800}primaryGroup(?:Name)?[\s\S]{0,800}secondaryGroup(?:Name)?/i,
  );
});

test("group contrast defaults to the first two groups in stable result order", () => {
  const declaredOrder = ["Zulu", "Alpha", "Gamma"] as const;
  const result = endpointResult(declaredOrder);
  assert.deepEqual(result.groups.map((group) => group.name), declaredOrder);

  assert.match(
    workspace,
    /currentResultGroupNames\[0\][\s\S]{0,600}(?:setPrimaryGroup|primaryGroup)/,
    "the first declared result group must become Primary by default",
  );
  assert.match(
    workspace,
    /currentResultGroupNames[\s\S]{0,600}find\(\(group\) => group !== nextPrimary\)[\s\S]{0,300}setSecondaryGroup/,
    "the second declared result group must become Secondary by default",
  );
  assert.match(
    workspace,
    /currentResultGroupNames\.includes\(primaryGroupName\)[\s\S]{0,500}currentResultGroupNames\.includes\(secondaryGroupName\)/i,
    "valid researcher selections should be retained when the result or rail mode is revisited",
  );
  assert.match(workspace, /copy\.contrast\.swap/, "the reverse action needs an accessible label");
  assert.match(
    workspace,
    /setPrimaryGroupName\(secondaryGroupName\)[\s\S]{0,180}setSecondaryGroupName\(primaryGroupName\)/,
    "two-group results need an explicit way to reverse the ordered contrast",
  );
});

test("one top-level selected pair persists across Plot while Stats requires an explicit inference run", () => {
  const componentState = workspace.slice(0, workspace.indexOf("function renderDataPanel"));
  assert.match(componentState, /const\s*\[[^\n]*(?:primaryGroup|groupPrimary)[^\n]*useState/i);
  assert.match(componentState, /const\s*\[[^\n]*(?:secondaryGroup|groupSecondary)[^\n]*useState/i);
  assert.match(
    workspace,
    /(?:groupContrastAxes|contrastAxes)[\s\S]{0,300}xDimension[\s\S]{0,300}yDimension/,
    "the contrast must use the researcher's current X and Y plot axes",
  );
  assert.match(
    workspace,
    /kind:\s*"endpoint-independent"[\s\S]{0,500}primaryGroup:[\s\S]{0,500}secondaryGroup:[\s\S]{0,500}axes:\s*groupContrastAxes/,
    "the explicit endpoint request must use the selected pair and axes",
  );
  assert.match(workspace, /runOpenEnaInferenceV2\(/);
  assert.doesNotMatch(workspace, /const mannWhitney\s*=\s*useMemo/);
  assert.match(
    workspace,
    /onClick=\{\(\) => setMode\(item\)\}/,
    "rail navigation should only change the mode so the top-level pair remains selected",
  );
});

test("Stats localizes the selected axes instead of leaking an English connector", () => {
  const summary = workspace.match(
    /<section className="ena-selected-contrast-summary">[\s\S]*?<\/section>/,
  )?.[0] ?? "";
  assert.ok(summary, "the selected contrast summary must remain present in Stats");
  assert.match(summary, /copy\.contrast\.selectedAxes/);
  assert.doesNotMatch(summary, /\}\s+on\s+\{/i);
  assert.deepEqual(
    (["en", "zh-hant", "zh-hans"] as const).map((locale) => (
      getOpenEnaCopy(locale).contrast.selectedAxes
    )),
    ["Selected axes", "所選座標軸", "所选坐标轴"],
  );
});

test("a stable current-result contrast surface shows Comparison, Primary, and Secondary plots", () => {
  assert.match(
    workspace,
    /import OpenEnaGroupContrast(?:,\s*\{[\s\S]*?\})? from "\.\/OpenEnaGroupContrast"/,
    "the current-result contrast needs a surface distinct from captured-set comparison",
  );
  assert.match(
    workspace,
    /<OpenEnaGroupContrast[\s\S]{0,300}contrast=\{activeGroupDisplay\.contrast\}/,
    "the presenter consumes the successfully derived display contrast without replacing canonical result state",
  );
  assert.match(workspace, /<OpenEnaGroupContrast[\s\S]{0,400}groupDisplay=\{activeGroupDisplay\}/);
  assert.match(groupContrastSurface, /contrast\.primary/);
  assert.match(groupContrastSurface, /contrast\.secondary/);
  assert.match(workspace, /activeGroupContrast\.groupOrder/);
  assert.match(groupContrastSurface, /data-testid="open-ena-group-contrast"/);
  assert.match(groupContrastSurface, /"open-ena-group-comparison-plot"/);
  assert.match(groupContrastSurface, /"open-ena-group-primary-plot"/);
  assert.match(groupContrastSurface, /"open-ena-group-secondary-plot"/);
  assert.match(groupContrastSurface, />\s*Comparison Plot\s*</);
  assert.match(groupContrastSurface, />\s*Primary Plot\s*</);
  assert.match(groupContrastSurface, />\s*Secondary Plot\s*</);
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
  assert.match(workspace, /<OpenEnaInferencePanel\b/);
  assert.match(copy, /multiplicity:[^\n]*Holm/);
  assert.doesNotMatch(`${workspace}\n${copy}`, /No multiplicity correction is applied/i);
});

test("research exports record the selected group pair and selected X/Y axes", () => {
  assert.match(exportsSource, /groupContrast|groupOrder|selectedGroups/);
  assert.match(exportsSource, /OpenEnaPairwiseContrast/);
  assert.match(exportsSource, /selectedGroupOrder/);
  assert.match(exportsSource, /axes|selectedAxes/);
  assert.match(
    workspace,
    /buildAnalysisBundle\([\s\S]{0,1400}methodsDimensions:\s*\[xDimension,\s*yDimension\][\s\S]{0,800}selectedGroupOrder:\s*selectedPresentationGroupOrder[\s\S]{0,300}groupContrast/,
    "the full result bundle must receive the validated presenter pair and active axes",
  );
  assert.match(
    workspace,
    /group-contrast\.json[\s\S]{0,900}buildPairwiseGroupContrastExport\(groupDisplayExportContrast,[\s\S]{0,700}(?:flipX|edgeThreshold|showNetworks)/,
    "a dedicated contrast export must preserve the selected pair, axes, and current display-derived summaries",
  );
});

test("ungrouped, one-group, and trajectory results explain why group contrast is unavailable", () => {
  const uiSource = `${workspace}\n${copy}`;
  assert.match(uiSource, /group contrast[^\n]*(?:requires|unavailable)[^\n]*(?:group column|grouping variable)/i);
  assert.match(uiSource, /group contrast[^\n]*(?:requires|unavailable)[^\n]*(?:at least two|two distinct) groups/i);
  assert.match(uiSource, /group contrast[^\n]*(?:endpoint only|only available for endpoint|requires an endpoint)/i);
  assert.match(workspace, /(?:groupColumn|manifestConfig\.groupColumn)[\s\S]{0,700}(?:group contrast|contrastUnavailable)/i);
  assert.match(workspace, /result\.groups\.length\s*<\s*2[\s\S]{0,700}(?:group contrast|contrastUnavailable)/i);
  assert.match(workspace, /result\.set\.modelType\s*!==\s*"EndPoint"[\s\S]{0,700}(?:group contrast|contrastUnavailable)/i);
});

test("the 3D ENA control opens the current group result in the shared fitted space", () => {
  assert.match(workspace, /aria-pressed=\{view === "3d"\}/);
  assert.match(workspace, /selectVisualizationView\("3d"\)/);
  assert.match(workspace, /view === "2d" && activeGroupContrast/);
  assert.doesNotMatch(workspace, /href=\{siteConfig\.threeDenaUrl\}/);
});
