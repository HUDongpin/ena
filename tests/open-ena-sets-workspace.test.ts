import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();
const source = (relativePath: string) => {
  const absolutePath = join(projectRoot, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
};

const types = source("lib/open-ena/types.ts");
const copy = source("lib/open-ena-i18n.ts");
const workspace = source("components/open-ena/OpenEnaWorkspace.tsx");
const sets = source("lib/open-ena/sets.ts");
const comparisonPlot = source("components/open-ena/OpenEnaSetComparison.tsx");

test("Sets is the first Open ENA workbench mode and retains the existing Data workflow", () => {
  assert.match(types, /OpenEnaMode\s*=\s*"sets"\s*\|\s*"data"\s*\|\s*"model"\s*\|\s*"plot"\s*\|\s*"stats"/);
  assert.match(copy, /modes:\s*\{\s*sets:\s*string;\s*data:\s*string;/);
  assert.match(copy, /modes:\s*\{\s*sets:\s*"Sets",\s*data:\s*"Data",\s*model:/);
  assert.match(workspace, /const modeIcons:\s*Record<OpenEnaMode,[\s\S]*?\{\s*sets:/);
  assert.match(workspace, /useState<OpenEnaMode>\("sets"\)/);
  assert.match(workspace, /mode === "sets"\s*\?\s*renderSetsPanel\(\)\s*:\s*mode === "data"/);
});

test("the workspace captures completed endpoint models and preserves fitted reference geometry", () => {
  assert.match(workspace, /const \[analysisSets, setAnalysisSets\]\s*=\s*useState<OpenEnaAnalysisSet\[]>\(\[\]\)/);
  assert.match(workspace, /const \[primarySetId, setPrimarySetId\]\s*=\s*useState<string \| null>\(null\)/);
  assert.match(workspace, /const \[secondarySetId, setSecondarySetId\]\s*=\s*useState<string \| null>\(null\)/);
  assert.match(workspace, /function captureCurrentAnalysisSet|const captureCurrentAnalysisSet\s*=/);
  assert.match(workspace, /result\.set\.modelType\s*!==\s*"EndPoint"/);
  assert.match(workspace, /buildAnalysisSet\([\s\S]*?dataset[\s\S]*?datasetHash[\s\S]*?resultConfig[\s\S]*?result/);
  assert.match(workspace, /const nextSets\s*=\s*upsertAnalysisSet\(analysisSets,\s*captured\)[\s\S]*?setAnalysisSets\(nextSets\)/);
  assert.match(workspace, /captured\.generatedReference[\s\S]*?setRotationReference\(captured\.generatedReference\)/);
  assert.match(copy, /capture:\s*"Capture current model"/);
  assert.match(workspace, /\{copy\.sets\.capture\}/);
});

test("captured analysis sets are raw-row-free snapshots with stable duplicate upsert semantics", () => {
  assert.match(types, /interface OpenEnaAnalysisSet\s*\{/);
  assert.match(types, /dataset:\s*\{[\s\S]*?name:\s*string;[\s\S]*?normalizedUtf8TextSha256:\s*string \| null;/);
  assert.match(types, /role:\s*"fitted"\s*\|\s*"projected"/);
  assert.match(types, /generatedReference:\s*OpenEnaRotationReference \| null/);
  assert.doesNotMatch(types.match(/interface OpenEnaAnalysisSet\s*\{[\s\S]*?\n\}/)?.[0] ?? "", /\brows\s*:/);
  assert.match(sets, /export function buildAnalysisSet\(/);
  assert.match(sets, /if \(result\.set\.modelType !== "EndPoint"\)[\s\S]*?throw new Error\([\s\S]*?trajectory/i);
  assert.match(sets, /const role\s*=\s*result\.projectionReference\s*\?\s*"projected"\s*:\s*"fitted"/);
  assert.match(sets, /const generatedReference[\s\S]*?=\s*result\.projectionReference\s*\?\s*null[\s\S]*?buildReferenceRotationPackage\(/);
  assert.match(sets, /export function upsertAnalysisSet\(/);
  assert.match(sets, /set\.id === captured\.id/);
});

test("Sets cards expose identity, role, reference state, removal, and repaired selections", () => {
  assert.match(workspace, /function renderSetsPanel\(\)/);
  assert.match(workspace, /analysisSets\.map\(\(analysisSet\)/);
  assert.match(workspace, /analysisSet\.dataset\.name/);
  assert.match(workspace, /analysisSet\.dataset\.normalizedUtf8TextSha256/);
  assert.match(workspace, /analysisSet\.role/);
  assert.match(workspace, /analysisSet\.generatedReference|analysisSet\.projectionReference/);
  assert.match(workspace, /aria-label=\{`Remove \$\{analysisSet\.name\}/);
  assert.match(workspace, /removeAnalysisSet\(analysisSets,\s*analysisSet\.id/);
  assert.match(workspace, /repairSetSelection\([\s\S]*?primarySetId[\s\S]*?secondarySetId/);
});

test("Primary and Secondary selectors exclude self-comparison and require one shared geometry", () => {
  assert.match(sets, /export function haveCompatibleSetGeometry\(/);
  assert.match(sets, /referenceId|geometryId/);
  assert.match(sets, /codes/);
  assert.match(sets, /dimensions/);
  assert.match(sets, /adjacencyKey/);
  assert.match(workspace, /<span>\{copy\.sets\.primary\}<\/span>[\s\S]*?<select[\s\S]*?value=\{primarySetId \?\? ""\}/);
  assert.match(workspace, /<span>\{copy\.sets\.secondary\}<\/span>[\s\S]*?<select[\s\S]*?value=\{secondarySetId \?\? ""\}/);
  assert.match(workspace, /analysisSet\.id !== primarySetId/);
  assert.match(workspace, /analysisSet\.id !== secondarySetId/);
  assert.match(workspace, /haveCompatibleSetGeometry\(/);
});

test("a valid pair renders the shared comparison without displacing the current single-result plot", () => {
  assert.match(workspace, /import OpenEnaSetComparison from "\.\/OpenEnaSetComparison"/);
  assert.match(workspace, /<OpenEnaSetComparison[\s\S]*?comparison=\{activeSetComparison\}[\s\S]*?edgeThreshold=\{edgeThreshold\}[\s\S]*?showLabels=\{showLabels\}[\s\S]*?flipX=\{flipX\}[\s\S]*?flipY=\{flipY\}[\s\S]*?svgRef=\{plotSvgRef\}/);
  assert.match(workspace, /<OpenEnaPlot[\s\S]*?result=\{result\}/);
  assert.match(comparisonPlot, /data-testid="open-ena-set-comparison"/);
  assert.match(comparisonPlot, /"open-ena-shared-difference-plot"/);
  assert.match(comparisonPlot, /"open-ena-primary-plot"/);
  assert.match(comparisonPlot, /"open-ena-secondary-plot"/);
  assert.match(comparisonPlot, />COMPARISON PLOT</);
  assert.match(comparisonPlot, />PRIMARY PLOT</);
  assert.match(comparisonPlot, />SECONDARY PLOT</);
  assert.match(comparisonPlot, /Reference geometry:/);
  assert.match(comparisonPlot, /<table[\s\S]*?<caption>Strongest signed edge differences<\/caption>/);
});

test("a selected shared comparison remains the plot anchor across rail modes and follows Plot Tools axes", () => {
  assert.match(workspace, /const comparisonAxes\s*=\s*useMemo/);
  assert.match(workspace, /primarySet\?\.geometry\.dimensions[\s\S]*?dimensions\.includes\(xDimension\)[\s\S]*?dimensions\.includes\(yDimension\)/);
  assert.match(workspace, /compareAnalysisSets\(primarySet,\s*secondarySet,\s*comparisonAxes\)/);
  assert.match(workspace, /\{activeSetComparison\s*\?\s*\([\s\S]*?<OpenEnaSetComparison/);
  assert.doesNotMatch(workspace, /mode === "sets" && activeSetComparison\s*\?\s*\([\s\S]*?<OpenEnaSetComparison/);
  assert.match(workspace, /displayedComparisonSurface === "sets"[\s\S]{0,160}primarySet\?\.geometry\.dimensions/);
});

test("set comparison exports preserve signed direction in JSON and edge CSV", () => {
  assert.match(sets, /export function compareAnalysisSets\(/);
  assert.match(sets, /signedDifference/);
  assert.match(sets, /primary.*-.*secondary|primaryWeight\s*-\s*secondaryWeight/i);
  assert.match(sets, /export function buildSetComparisonExport\(/);
  assert.match(sets, /export function setComparisonEdgesToCsv\(/);
  assert.match(workspace, /downloadJson\([\s\S]*?comparison[\s\S]*?buildSetComparisonExport\(/);
  assert.match(workspace, /downloadText\([\s\S]*?comparison-edges\.csv[\s\S]*?setComparisonEdgesToCsv\(/);
});

test("unsupported trajectory capture fails visibly and the external 3D ENA link is unchanged", () => {
  assert.match(workspace, /result\.set\.modelType\s*!==\s*"EndPoint"[\s\S]*?setError\([\s\S]*?trajectory/i);
  assert.match(workspace, /href=\{siteConfig\.threeDenaUrl\}/);
  assert.match(workspace, /target="_blank"/);
  assert.match(workspace, /rel="noreferrer"/);
  assert.match(source("lib/site.ts"), /threeDenaUrl:\s*"https:\/\/www\.3dena\.com"/);
});

test("Sets guidance stays truthful and source evidence is not misattributed to a retained comparison", () => {
  assert.match(workspace, /result\s*&&\s*result\.set\.modelType\s*!==\s*"EndPoint"/);
  assert.match(workspace, /currentProjectedResult[\s\S]*?result\.projectionReference[\s\S]*?resultIsStale/);
  assert.match(workspace, /<li data-done=\{currentProjectedResult \? "true" : "false"\}>/);
  const statsStart = workspace.indexOf("function renderStatsPanel()");
  const evidenceCall = workspace.indexOf("{renderSourceEvidence()}", statsStart);
  const evidenceFunction = workspace.indexOf("function renderSourceEvidence()", statsStart);
  assert.ok(statsStart >= 0 && evidenceCall > statsStart && evidenceCall < evidenceFunction,
    "source evidence belongs to the current-result Stats & Export panel, not a retained-set plot surface");
});

test("applicable Plot Tools control the active shared-set plot and the mobile rail fits five modes", () => {
  assert.match(workspace, /<OpenEnaSetComparison[\s\S]*?showPoints=\{showPoints\}[\s\S]*?showNetworks=\{showNetworks\}[\s\S]*?showLabels=\{showLabels\}[\s\S]*?showUnitLabels=\{showUnitLabels\}[\s\S]*?edgeScale=\{edgeScale\}[\s\S]*?pointScale=\{pointScale\}[\s\S]*?plotZoom=\{plotZoom\}/);
  assert.match(workspace, /disabled=\{!result && !activeSetComparison\}[\s\S]{0,100}onClick=\{exportPlotSvg\}/);
  assert.match(workspace, /disabled=\{!result && !activeSetComparison\}[\s\S]{0,100}onClick=\{exportPlotPng\}/);
  const css = source("app/globals.css");
  const responsiveRailRules = [...css.matchAll(/\.ena-tool-rail\s*\{[^}]*?grid-template-columns:\s*repeat\((\d),/g)]
    .map((match) => Number(match[1]));
  assert.deepEqual(responsiveRailRules.slice(-2), [5, 5]);
  assert.match(css, /\.ena-sets-remove\s*\{[\s\S]*?min-height:\s*44px;/);
});
