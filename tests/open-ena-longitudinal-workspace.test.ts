import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();
const source = (relativePath: string) => {
  const absolutePath = join(projectRoot, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
};

const workspace = source("components/open-ena/OpenEnaWorkspace.tsx");
const plot = source("components/open-ena/OpenEnaPlot.tsx");
const longitudinalPlot = source("components/open-ena/OpenEnaLongitudinalTrajectory.tsx");
const copy = source("lib/open-ena-i18n.ts");
const longitudinal = source("lib/open-ena/longitudinal.ts");
const site = source("lib/site.ts");

test("trajectory analysis is launched by a same-route workspace button", () => {
  const launchButton = workspace.match(
    /<button[\s\S]{0,700}data-testid="open-ena-trajectory-analysis-button"[\s\S]{0,700}<\/button>/,
  )?.[0] ?? "";
  const launchHandler = workspace.match(
    /function launchTrajectoryAnalysis\(\)[\s\S]*?(?=\n  function [A-Za-z]|\n  async function [A-Za-z])/,
  )?.[0] ?? "";

  assert.match(launchButton, /^<button/);
  assert.match(launchButton, /onClick=\{launchTrajectoryAnalysis\}/);
  assert.doesNotMatch(launchButton, /\bhref\s*=/);
  assert.match(launchHandler, /if \(!dataset\)[\s\S]{0,160}setMode\("data"\)/);
  assert.match(launchHandler, /result\.set\.modelType !== "EndPoint"[\s\S]{0,220}setMode\("plot"\)/);
  assert.match(launchHandler, /model:\s*"SeparateTrajectory"/);
  assert.match(launchHandler, /rotation:\s*"svd"/);
  assert.match(launchHandler, /setModelTab\("windows"\)/);
  assert.match(launchHandler, /setMode\("model"\)/);
  assert.doesNotMatch(launchHandler, /router|window\.location|location\.assign|href/);
});

test("longitudinal group-centroid analysis is derived only from successful jENA trajectory results", () => {
  assert.match(
    longitudinal,
    /export function buildLongitudinalGroupCentroidView\(/,
    "the workflow needs one pure derived-view builder instead of another jENA run",
  );
  assert.match(longitudinal, /SeparateTrajectory/);
  assert.match(longitudinal, /AccumulatedTrajectory/);
  assert.match(
    `${longitudinal}\n${workspace}\n${copy}`,
    /(?:longitudinal|group-centroid)[^\n]*(?:unavailable|requires)[^\n]*(?:Separate|Accumulated|trajectory)/i,
    "endpoint and missing-result states must explain that a trajectory result is required",
  );
  assert.match(
    workspace,
    /buildLongitudinalGroupCentroidView\([\s\S]{0,600}result[\s\S]{0,300}resultConfig/,
    "the derived view must bind to the last successful result and its immutable resultConfig",
  );
});

test("researchers explicitly select repeated-entity and time-order fields", () => {
  const controls = workspace.match(
    /data-testid="open-ena-longitudinal-controls"[\s\S]*?(?=data-testid="open-ena-longitudinal-(?:time-order|period-diagnostics)"|<\/fieldset>|<\/section>)/,
  )?.[0] ?? "";

  assert.match(workspace, /repeatedEntityColumn/);
  assert.match(workspace, /timeColumn/);
  assert.match(controls, /(?:Repeated entity|copy\.longitudinal\.repeatedEntity)/i);
  assert.match(controls, /(?:Time\s*(?:\/|and)?\s*order|copy\.longitudinal\.timeOrder)/i);
  assert.match(
    controls,
    /resultConfig\.unitColumns[\s\S]{0,220}\.filter\(\(column\) => column !== resultConfig\.groupColumn\)[\s\S]{0,180}\.map\([\s\S]{0,180}<option/,
    "repeated-entity choices must come from successful-result unit fields while excluding the comparison-group namespace",
  );
  assert.match(
    controls,
    /resultConfig\.conversationColumns[\s\S]{0,260}\.filter\(\(column\) => column !== resultConfig\.groupColumn && column !== repeatedEntityColumn\)[\s\S]{0,180}\.map\([\s\S]{0,180}<option/,
    "time/order choices must come from successful-result conversation fields while remaining distinct from group and entity fields",
  );
});

test("the discovered period order is reviewed visibly and is never a hidden lexical sort", () => {
  assert.match(
    workspace,
    /data-testid="open-ena-longitudinal-time-order"/,
    "the workbench needs a stable, labelled time-order review region",
  );
  assert.match(
    workspace,
    /(?:longitudinalTimeOrder|timeOrder)\.map\([\s\S]{0,400}(?:<li|data-period|aria-label)/,
    "every retained period must be shown in its analysis order",
  );
  assert.match(
    `${longitudinal}\n${copy}`,
    /(?:first[- ]encountered|source order|observed order|explicit time order)/i,
    "default ordering needs a visible, reproducible rule",
  );
  assert.doesNotMatch(
    longitudinal,
    /(?:periods|timeOrder|timeValues)\.sort\(\s*\)/,
    "period labels must not be silently lexically sorted",
  );
});

test("Available and Complete cohort policies have distinct repeated-entity denominators", () => {
  assert.match(longitudinal, /"available"\s*\|\s*"complete"/);
  assert.match(`${workspace}\n${copy}`, /Available cohort/i);
  assert.match(`${workspace}\n${copy}`, /Complete cohort/i);
  assert.match(
    `${longitudinal}\n${copy}`,
    /Available cohort[\s\S]{0,500}(?:observed|represented)[\s\S]{0,300}(?:each|that) period/i,
    "Available must use the entities observed in each individual period",
  );
  assert.match(
    `${longitudinal}\n${copy}`,
    /Complete cohort[\s\S]{0,500}(?:every|all)[\s\S]{0,250}(?:selected|ordered) period/i,
    "Complete must retain the same repeated entities across every selected period",
  );
  assert.match(
    longitudinal,
    /cohortPolicy\s*===\s*"complete"[\s\S]{0,900}(?:every|completeEntity|completeEntities)/,
    "the complete-cohort branch must compute an all-period entity intersection",
  );
});

test("group-centroid paths have a control independent from individual unit paths", () => {
  assert.match(workspace, /showTrajectories/);
  assert.match(workspace, /showGroupCentroidPaths/);
  assert.match(`${workspace}\n${copy}`, /Individual trajectory paths/i);
  assert.match(`${workspace}\n${copy}`, /Group-centroid paths/i);
  assert.match(
    workspace,
    /checked=\{showTrajectories\}[\s\S]{0,300}setShowTrajectories/,
    "the existing individual-path switch must retain its own state",
  );
  assert.match(
    workspace,
    /checked=\{showGroupCentroidPaths\}[\s\S]{0,300}setShowGroupCentroidPaths/,
    "group-centroid visibility needs a separate switch and setter",
  );
  assert.match(
    `${workspace}\n${plot}\n${longitudinalPlot}`,
    /showGroupCentroidPaths[\s\S]{0,1200}(?:groupCentroidPaths|longitudinalView)/,
    "the derived centroid paths must reach the 2D plot independently of unit trajectories",
  );
  assert.match(longitudinalPlot, /className="ena-group-centroid-path"/);
});

test("the workbench exposes per-period group counts and missingness diagnostics", () => {
  const diagnostics = workspace.match(
    /data-testid="open-ena-longitudinal-period-diagnostics"[\s\S]*?<\/table>/,
  )?.[0] ?? "";

  assert.match(diagnostics, /<table/);
  assert.match(diagnostics, /(?:Period|Time)/i);
  assert.match(diagnostics, /(?:Group|Cohort)/i);
  assert.match(diagnostics, /Available/i);
  assert.match(diagnostics, /Complete/i);
  assert.match(diagnostics, /Included/i);
  assert.match(diagnostics, /(?:Missing|Excluded)/i);
  assert.match(
    diagnostics,
    /(?:periodDiagnostics|longitudinalView\.periods)\.map/,
    "diagnostics must render every group-period row rather than one overall point count",
  );
  assert.match(longitudinal, /availableEntityCount/);
  assert.match(longitudinal, /completeEntityCount/);
  assert.match(longitudinal, /includedEntityCount/);
});

test("changing longitudinal settings invalidates only the derived view and never jENA coordinates", () => {
  const controls = workspace.match(
    /data-testid="open-ena-longitudinal-controls"[\s\S]*?(?=<\/fieldset>|<\/section>)/,
  )?.[0] ?? "";
  const derivedView = workspace.match(
    /const longitudinalViewState\s*=\s*useMemo\([\s\S]*?\n  \]\);/,
  )?.[0] ?? "";

  assert.match(controls, /updateLongitudinalSettings|setRepeatedEntityColumn|setTimeColumn|setCohortPolicy/);
  assert.match(derivedView, /buildLongitudinalGroupCentroidView/);
  assert.match(derivedView, /repeatedEntityColumn|longitudinalSettings/);
  assert.match(derivedView, /timeColumn|longitudinalSettings/);
  assert.match(derivedView, /cohortPolicy|longitudinalSettings/);
  assert.doesNotMatch(controls, /setResult\s*\(/);
  assert.doesNotMatch(controls, /setResultConfig\s*\(/);
  assert.doesNotMatch(controls, /runAnalysis|analyzeDatasetInWorker|buildOpenEnaResult|updateConfig/);
  assert.match(
    `${workspace}\n${copy}`,
    /(?:presentation settings|longitudinal settings)[^\n]*(?:does not|do not|never)[^\n]*(?:rebuild|change)[^\n]*(?:jENA|coordinates)/i,
    "the UI must disclose that these settings do not refit or move the ENA solution",
  );
});

test("a successful trajectory run returns the visible surface to the current result", () => {
  const successBlock = workspace.match(
    /setResult\(\{[\s\S]*?setShowGroupCentroidPaths\(true\);/,
  )?.[0] ?? "";

  assert.match(successBlock, /setActiveComparisonSurface\("groups"\)/);
  assert.match(
    workspace,
    /activeComparisonSurface === "sets" && setComparison[\s\S]{0,400}result[\s\S]{0,160}"model"/,
    "a retained set comparison must not permanently hide a newly built current trajectory result",
  );
});

test("the longitudinal view and its exports are bound to successful-result provenance", () => {
  assert.match(longitudinal, /analyzedAt/);
  assert.match(longitudinal, /provenanceBinding/);
  assert.match(longitudinal, /configuration/);
  assert.match(longitudinal, /projectionReference/);
  assert.match(
    workspace,
    /buildLongitudinalGroupCentroidView\(\s*result,\s*resultConfig,/,
    "pending model controls must not be mixed into a prior successful trajectory result",
  );
  assert.doesNotMatch(
    workspace,
    /buildLongitudinalGroupCentroidView\(\s*result,\s*config,/,
  );
});

test("longitudinal group-centroid summaries stay descriptive and never reuse endpoint tests", () => {
  const longitudinalPanel = workspace.match(
    /function renderLongitudinalPanel\(\)[\s\S]*?(?=\n  function render[A-Z]|\n  const panel =)/,
  )?.[0] ?? "";

  assert.match(`${longitudinalPanel}\n${copy}`, /descriptive/i);
  assert.match(
    `${longitudinalPanel}\n${copy}`,
    /(?:no|not)[^\n]*(?:endpoint )?(?:Mann.?Whitney|Welch)/i,
    "trajectory steps and centroid paths must not be presented as endpoint inference",
  );
  assert.doesNotMatch(longitudinalPanel, /buildEndpointMannWhitney|mannWhitney|Welch|cohensD|Cohen/);
  assert.doesNotMatch(longitudinal, /buildEndpointMannWhitney|enaStats|cohensD/);
  assert.match(`${longitudinalPanel}\n${copy}`, /(?:No[^\n]*)?Welch[^\n]*(?:not applied|is not applied|is applied)/i);
});

test("longitudinal CSV and JSON exports preserve cohort, time, geometry, and source provenance", () => {
  assert.match(longitudinal, /export function buildLongitudinalGroupCentroidExport\(/);
  assert.match(longitudinal, /export function longitudinalPeriodRowsToCsv\(/);
  assert.match(longitudinal, /normalizedUtf8TextSha256/);
  assert.match(longitudinal, /timeOrder/);
  assert.match(longitudinal, /cohortPolicy/);
  assert.match(longitudinal, /repeatedEntityColumn/);
  assert.match(longitudinal, /timeColumn/);
  assert.match(longitudinal, /rotationMatrix|rotationSet/);
  assert.match(longitudinal, /rotationColumns/);
  assert.match(longitudinal, /projectionReference/);
  assert.match(longitudinal, /modelType/);
  assert.match(longitudinal, /analyzedAt/);
  assert.match(longitudinal, /period|timeValue/);
  assert.match(longitudinal, /group|cohort/);
  assert.match(longitudinal, /includedEntityCount/);
  assert.doesNotMatch(longitudinal, /dataset\.rows|rawRows/);

  assert.match(workspace, /longitudinal-group-centroids\.json/);
  assert.match(workspace, /longitudinal-group-centroids\.csv/);
  assert.match(workspace, /buildLongitudinalGroupCentroidExport\(/);
  assert.match(workspace, /longitudinalPeriodRowsToCsv\(/);
});

test("ungrouped trajectory models use one All units path while invalid mappings explain unavailability", () => {
  assert.match(
    longitudinal,
    /groupColumn[\s\S]{0,500}(?:All units|UNGROUPED)/,
    "a missing comparison group must produce one overall centroid path, not disable the workflow",
  );
  assert.match(
    `${workspace}\n${copy}`,
    /(?:No comparison group|Ungrouped)[^\n]*(?:All units|one overall)[^\n]*(?:centroid|path)/i,
  );
  assert.match(
    `${longitudinal}\n${copy}`,
    /(?:unavailable|requires)[^\n]*(?:repeated-entity|repeated entity)[^\n]*(?:field|mapping|column)/i,
  );
  assert.match(
    `${longitudinal}\n${copy}`,
    /(?:unavailable|requires)[^\n]*(?:time|order)[^\n]*(?:field|mapping|column)/i,
  );
  assert.match(
    `${longitudinal}\n${copy}`,
    /(?:unavailable|requires)[^\n]*(?:at least two|two or more)[^\n]*(?:period|time)/i,
  );
  assert.match(
    `${longitudinal}\n${copy}`,
    /(?:unavailable|no eligible)[^\n]*(?:complete|repeated)[^\n]*(?:entity|entities|units)/i,
  );
});

test("standalone longitudinal SVG and PNG exports embed the complete plot visual system", () => {
  const serializer = workspace.match(
    /function serializedPlotSvg\(\)[\s\S]*?(?=\n  function exportPlotSvg\(\))/,
  )?.[0] ?? "";
  const embeddedStyles = serializer.match(/styles\.textContent\s*=\s*`([\s\S]*?)`;/)?.[1] ?? "";

  assert.match(serializer, /source\.cloneNode\(true\)/, "the export must retain inline marker and arrow definitions from the live SVG");
  assert.match(embeddedStyles, /\.ena-longitudinal-background\s*\{[^}]*fill:/);
  assert.match(embeddedStyles, /\.ena-longitudinal-axis\s*\{[^}]*stroke:[^}]*stroke-width:[^}]*stroke-dasharray:/);
  assert.match(embeddedStyles, /\.ena-longitudinal-axis-label\s*\{[^}]*fill:[^}]*font-family:[^}]*font-size:[^}]*font-weight:/);
  assert.match(embeddedStyles, /\.ena-individual-trajectory-path\s*\{[^}]*fill:[^}]*stroke-width:[^}]*stroke-linecap:[^}]*opacity:/);
  assert.match(embeddedStyles, /\.ena-group-centroid-path\s*\{[^}]*fill:[^}]*stroke-width:[^}]*stroke-linecap:[^}]*opacity:/);
  assert.match(embeddedStyles, /\.ena-longitudinal-node circle:first-child\s*\{[^}]*fill:[^}]*stroke:[^}]*stroke-width:/);
  assert.match(embeddedStyles, /\.ena-longitudinal-node circle:nth-child\(2\)\s*\{[^}]*fill:/);
  const sharedLabelRule = embeddedStyles.match(
    /\.ena-longitudinal-node text\s*,\s*\.ena-longitudinal-period-label\s*\{([^}]*)\}/,
  )?.[1] ?? "";
  for (const declaration of ["paint-order:", "stroke:", "fill:", "font-size:", "font-weight:"]) {
    assert.ok(sharedLabelRule.includes(declaration), `longitudinal node/period labels need ${declaration} in the embedded SVG stylesheet`);
  }
  assert.match(embeddedStyles, /\.ena-longitudinal-period-label\s*\{[^}]*font-family:[^}]*font-size:/);

  assert.match(
    longitudinalPlot,
    /const common\s*=\s*\{\s*fill,\s*stroke,\s*strokeWidth,\s*vectorEffect:/,
    "individual and centroid marker glyphs must retain their visual attributes inside the cloned SVG",
  );
  assert.match(
    longitudinalPlot,
    /<marker[\s\S]{0,500}<path[^>]*fill=\{color\}/,
    "trajectory arrowheads must retain their fill inside the cloned SVG definitions",
  );
  assert.match(
    workspace,
    /function exportPlotPng\(\)[\s\S]{0,180}const svg = serializedPlotSvg\(\)/,
    "PNG rendering must consume the same self-contained SVG serializer",
  );
});

test("accumulated trajectory order is visibly locked to the fitted source sequence", () => {
  assert.match(workspace, /result\?\.set\.modelType === "AccumulatedTrajectory"/);
  assert.match(workspace, /disabled=\{accumulatedOrderLocked \|\| index === 0\}/);
  assert.match(workspace, /disabled=\{accumulatedOrderLocked \|\| index === longitudinalTimeOrder\.length - 1\}/);
  assert.match(workspace, /copy\.longitudinal\.accumulatedOrderLocked/);
  assert.match(copy, /Accumulated trajectories are locked to the fitted source encounter order/);
});

test("the 3D ENA exploratory control remains the unchanged external website link", () => {
  assert.match(site, /threeDenaUrl:\s*"https:\/\/www\.3dena\.com"/);
  assert.match(workspace, /href=\{siteConfig\.threeDenaUrl\}/);
  assert.match(workspace, /target="_blank"/);
  assert.match(workspace, /rel="noreferrer"/);
  assert.doesNotMatch(workspace, /setView\("3d"\)/);
});
