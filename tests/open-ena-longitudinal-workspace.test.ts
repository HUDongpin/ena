import { workspaceV3Source as v3, controllerV3Source as owner, renderWorkspaceShellV3 as shell, moduleSourceV3 as moduleV3, functionSourceV3 } from "./helpers/open-ena-workspace-v3-ui";
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
const longitudinalV3 = source("lib/open-ena/longitudinal-v3.ts");
const longitudinalWorkbenchV3 = source("components/open-ena/OpenEnaLongitudinalWorkbenchV3.tsx");

test("trajectory model choice belongs to native Windows rather than the view toolbar", () => {

  assert.match(v3, /<OpenEnaWindowsPanelV3/);
  const windows = moduleV3("components/open-ena/model-v3/OpenEnaWindowsPanelV3.tsx");
  assert.match(windows, /Object.keys\(copy.models\)/);
  assert.match(moduleV3("components/open-ena/model-v3/model-copy-v3.ts"), /AccumulatedTrajectory/);
  const toolbar = v3.slice(v3.indexOf('<div className="ena-visual-toolbar"'), v3.indexOf('<div>\n      {presentation'));
  assert.doesNotMatch(toolbar, /set-standard-model|dispatchModel/);

});

test("Model heading shortcut focuses native Model type without changing a draft or starting a run", () => {

  assert.match(v3, /className="ena-model-trajectory-button"/);
  assert.match(v3, /setModelNavigation\(\(value\) => \(\{ tab: "windows", serial: value.serial \+ 1 \}\)\)/);
  assert.match(v3, /ena-model-windows-v3 select/);
  assert.match(v3, /requestAnimationFrame/);

});

test("longitudinal display uses an admitted bound result while inference requires the independent plan", () => {

  assert.match(v3, /buildLongitudinalViewV3\(result as BoundStandardResultV3/);
  assert.doesNotMatch(v3, /buildLongitudinalV3ModelBundle|deriveLongitudinalV3WorkspaceView/);
  assert.match(v3, /buildTrajectoryPresentationV3/);

});

test("native Units and Horizons editors define entities and typed order explicitly", () => {

  assert.match(v3, /<OpenEnaUnitsPanelV3/);
  assert.match(v3, /<OpenEnaHorizonsPanelV3/);
  assert.match(v3, /horizon-raw/);
  assert.doesNotMatch(v3, /repeatedEntityColumns|longitudinalTimeColumn/);

});

test("one explicit native inference action supports independent paired and repeated trajectory designs", () => {

  for (const design of ["trajectory-independent-period", "trajectory-paired-periods", "trajectory-repeated-periods"]) assert.ok(v3.includes(design));
  assert.match(v3, /runOpenEnaTrajectoryInferenceV3/);
  assert.match(v3, /onClick=\{\(\) => void attempt\(runInference\)\}/);
  assert.match(v3, /identityConfirmed/);

});

test("independent trajectory inference requires one selected fitted period and an eligible typed pair", () => {

  assert.match(v3, /inferenceDesign === "independent" \? endpointControls && periods\[0\]/);
  assert.match(v3, /period: periods\[0\]/);
  assert.match(v3, /disabled=\{!current \|\| !controls/);

});

test("Horizon order is explicitly reviewed and graph display retains original fitted ordinals", () => {

  assert.match(v3, /<OpenEnaHorizonsPanelV3/);
  assert.match(v3, /Fitted Horizon order is locked/);
  assert.match(v3, /Observed fitted trajectory steps and original ordinals/);
  assert.doesNotMatch(v3, /longitudinalTimeOrder.*sort/);

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

test("Group-centroid paths and individual paths have independent display controls", () => {

  assert.match(v3, /showGroupCentroidPaths, setShowGroupCentroidPaths.*useState\(true\)/);
  assert.match(v3, /showTrajectories, setShowTrajectories.*useState\(false\)/);
  assert.match(v3, /checked=\{showGroupCentroidPaths\}/);
  assert.match(v3, /showVariance, showTrajectories/);

});

test("native trajectory presentation shows actual cohort and available-by-period evidence", () => {

  assert.match(v3, /longitudinal.provenance.cohortMeaning/);
  assert.match(v3, /longitudinal.comparison/);
  assert.match(moduleV3("components/open-ena/model-v3/OpenEnaNativeStatsPanelV3.tsx"), /ledger/);
  assert.match(moduleV3("lib/open-ena/native-statistics-export-v3.ts"), /availableByPeriod/);

});

test("changing V3 longitudinal settings marks the envelope stale and never refits or mutates jENA coordinates", () => {
  assert.match(longitudinalWorkbenchV3, /function commitScientific[\s\S]*?setScientificDirty\(true\)/);
  assert.match(longitudinalWorkbenchV3, /isOpenEnaLongitudinalBundleStaleV3/);
  assert.match(longitudinalWorkbenchV3, /compileTrajectoryPlotlySpec\(bundle, displaySpec\)/);
  assert.doesNotMatch(longitudinalWorkbenchV3, /setResult\s*\(/);
  assert.doesNotMatch(longitudinalWorkbenchV3, /setResultConfig\s*\(/);
  assert.doesNotMatch(longitudinalWorkbenchV3, /analyzeDatasetInWorker|buildLongitudinalDerivation|Math\.(?:hypot|sqrt|pow)/);
  assert.match(
    longitudinalWorkbenchV3,
    /display-only 3D\/2D views|display-only views/i,
    "the UI must disclose that display changes do not refit or move the jENA solution",
  );
});

test("successful trajectory adoption updates the persistent current-result surface", () => {

  assert.match(owner, /accept-result/);
  assert.match(v3, /data-result-status=\{modelState.resultStatus\}/);
  assert.match(v3, /data-testid="open-ena-center-surface"/);
  assert.doesNotMatch(v3, /mode === "plot" && <OpenEnaPlot/);

});

test("native bundle exports use the exact current result and independent plan", () => {

  assert.match(v3, /exportCurrentAnalysisV3\(result, currentPlan\)/);
  assert.match(v3, /latest.current.state.model.result === result/);
  assert.match(v3, /Model bundles contain unavailable statistics/);

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

test("trajectory exports separate bound Data View, full model, and native inference evidence", () => {

  assert.match(v3, /exportCurrentAnalysisV3/);
  assert.match(v3, /buildDataViewV3/);
  assert.match(v3, /exportNativeStatisticsV3/);
  assert.match(moduleV3("lib/open-ena/native-statistics-export-v3.ts"), /binding/);
  assert.doesNotMatch(v3, /buildLongitudinalV3ModelBundle/);

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

  assert.match(serializer, /source\.cloneNode\(true\)/, "the export must retain the live SVG trajectory paths and direction glyphs");
  assert.match(embeddedStyles, /\.ena-longitudinal-background\s*\{[^}]*fill:/);
  assert.match(embeddedStyles, /\.ena-longitudinal-axis\s*\{[^}]*stroke:[^}]*stroke-width:[^}]*stroke-dasharray:/);
  assert.match(embeddedStyles, /\.ena-longitudinal-axis-label\s*\{[^}]*fill:[^}]*font-family:[^}]*font-size:[^}]*font-weight:/);
  assert.match(embeddedStyles, /\.ena-individual-trajectory-path\s*\{[^}]*fill:[^}]*stroke-width:[^}]*stroke-linecap:[^}]*opacity:/);
  assert.match(embeddedStyles, /\.ena-group-centroid-path\s*\{[^}]*fill:[^}]*stroke-width:[^}]*stroke-linecap:[^}]*opacity:/);
  assert.match(embeddedStyles, /\.ena-group-centroid-direction-arrow\s*\{[^}]*fill:[^}]*stroke-width:[^}]*stroke-linecap:[^}]*stroke-linejoin:[^}]*opacity:/);
  assert.match(embeddedStyles, /\.ena-individual-direction-arrow\s*\{[^}]*fill:[^}]*stroke-width:[^}]*stroke-linecap:[^}]*stroke-linejoin:[^}]*opacity:/);
  assert.match(embeddedStyles, /\.ena-longitudinal-node circle:first-child\s*\{[^}]*fill:[^}]*stroke:[^}]*stroke-width:/);
  assert.match(embeddedStyles, /\.ena-longitudinal-node circle:nth-child\(2\)\s*\{[^}]*fill:/);
  const sharedLabelRule = embeddedStyles.match(
    /\.ena-longitudinal-node text\s*,\s*\.ena-longitudinal-node-label\s*,\s*\.ena-longitudinal-period-label\s*\{([^}]*)\}/,
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
    /function DirectionArrow[\s\S]*?<path[\s\S]{0,500}className=\{className\}[\s\S]{0,500}fill=\{DIRECTION_ARROW_FILL\}[\s\S]{0,500}stroke=\{DIRECTION_ARROW_HALO\}/,
    "direction glyphs must retain their explicit dark fill and white halo inside the cloned SVG",
  );
  assert.match(
    workspace,
    /function exportPlotPng\(\)[\s\S]{0,220}const serialized = serializedPlotSvg\(\)[\s\S]{0,220}new Blob\(\[serialized\.svg\]/,
    "PNG rendering must consume the same self-contained SVG and dimensions serializer",
  );
});

test("accumulated trajectory display cannot change fitted source order or inference cohorts", () => {

  assert.match(v3, /Fitted Horizon order is locked. Display filters retain original ordinals and do not change inference cohorts/);
  assert.match(v3, /Display .*horizon.displayLabel/);
  assert.match(moduleV3("lib/open-ena/trajectory-presentation-v3.ts"), /trajectoryOrdinal/);

});

test("3D trajectory graphs reuse native observed coordinates inside the same Workspace", () => {

  assert.match(v3, /trajectoryPresentation/);
  assert.match(v3, /<OpenEnaInteractive3DPlot .*result=\{plotResult!\}/);
  assert.match(moduleV3("lib/open-ena/plot3d.ts"), /trajectoryPresentation/);
  assert.doesNotMatch(v3, /window.open\(/);

});
