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

test("trajectory models are configured in Model type instead of launched from the plot toolbar", () => {
  assert.doesNotMatch(workspace, /open-ena-trajectory-analysis-button|launchTrajectoryAnalysis/);
  assert.doesNotMatch(copy, /launch:\s*"Trajectory Analysis"/);
  assert.match(
    workspace,
    /<span>\{copy\.model\.modelType\}<\/span>[\s\S]{0,1200}<option value="EndPoint">[\s\S]{0,300}<option value="SeparateTrajectory">[\s\S]{0,300}<option value="AccumulatedTrajectory">/,
    "Endpoint, Separate trajectory, and Accumulated trajectory must remain explicit peer model choices",
  );
  assert.match(
    workspace,
    /config\.model !== "EndPoint" \? <p className="ena-sequence-note">\{copy\.model\.trajectoryHint\}<\/p> : null/,
    "trajectory requirements must stay beside the model choice that creates the pending configuration",
  );
});

test("the Model heading shortcut opens and focuses Model type without choosing or running a trajectory model", () => {
  const modelPanel = workspace.match(
    /function renderModelPanel\(\)[\s\S]*?(?=\n  function renderLongitudinalPanel\(\))/,
  )?.[0] ?? "";
  const shortcut = modelPanel.match(
    /<button[\s\S]{0,900}data-testid="open-ena-configure-trajectory-model"[\s\S]{0,900}<\/button>/,
  )?.[0] ?? "";
  const handler = workspace.match(
    /function openTrajectoryModelConfiguration\(\)[\s\S]*?(?=\n  function |\n  async function )/,
  )?.[0] ?? "";

  assert.match(shortcut, /^<button/);
  assert.match(shortcut, /onClick=\{openTrajectoryModelConfiguration\}/);
  assert.doesNotMatch(shortcut, /aria-pressed/);
  assert.match(
    modelPanel,
    /<div className="ena-panel-heading">[\s\S]{0,1000}\{dataset && currentAnalysisKind === "ena" \? \([\s\S]{0,500}data-testid="open-ena-configure-trajectory-model"[\s\S]{0,500}<\/button>[\s\S]{0,120}: null\}[\s\S]{0,80}<\/div>\s*<div[\s\S]{0,180}className="ena-model-tabs"/,
    "the shortcut must render only for a loaded standard ENA dataset, remain inside the Model heading, and precede the tabs",
  );
  assert.ok(
    modelPanel.indexOf('className="ena-panel-heading"')
      < modelPanel.indexOf('data-testid="open-ena-configure-trajectory-model"'),
    "the shortcut must follow the Model heading",
  );
  assert.ok(
    modelPanel.indexOf('data-testid="open-ena-configure-trajectory-model"')
      < modelPanel.indexOf('className="ena-model-tabs"'),
    "the shortcut must stay in the Model header area rather than inside a model-type option or plot toolbar",
  );

  assert.match(handler, /setModelTab\("windows"\)/);
  assert.match(handler, /setTrajectoryModelFocusRequest\(\(request\) => request \+ 1\)/);
  assert.doesNotMatch(
    handler,
    /updateConfig|runAnalysis|\bsetMode\(|SeparateTrajectory|AccumulatedTrajectory|rotation/,
    "the shortcut may navigate and request focus, but must not choose or run a model",
  );
  assert.match(
    workspace,
    /trajectoryModelFocusRequest === trajectoryModelFocusHandledRef\.current \|\| modelTab !== "windows"[\s\S]{0,180}trajectoryModelFocusHandledRef\.current = trajectoryModelFocusRequest[\s\S]{0,120}modelTypeSelectRef\.current\?\.focus\(\)/,
    "each shortcut request must focus once after Windows renders without stealing focus on later ordinary tab navigation",
  );
  assert.match(
    modelPanel,
    /id="open-ena-model-type"[\s\S]{0,180}ref=\{modelTypeSelectRef\}/,
    "the shortcut's controlled target must be the real Model type selector",
  );
  assert.match(copy, /configureTrajectory:\s*"Configure trajectory model"/);
  assert.match(copy, /configureTrajectory:\s*"設定軌跡模型"/);
  assert.match(copy, /configureTrajectory:\s*"配置轨迹模型"/);
});

test("longitudinal analysis is derived only from one successful fitted jENA result through the V3 package adapter", () => {
  assert.match(
    longitudinalV3,
    /adaptFittedJenaTrajectoryResultV2\(/,
    "the V3 workflow must adapt one already-fitted jENA result through the package boundary",
  );
  assert.match(longitudinalV3, /SeparateTrajectory/);
  assert.match(longitudinalV3, /AccumulatedTrajectory/);
  assert.match(
    `${longitudinalV3}\n${workspace}\n${copy}`,
    /(?:longitudinal|group-centroid)[^\n]*(?:unavailable|requires)[^\n]*(?:Separate|Accumulated|trajectory)/i,
    "endpoint and missing-result states must explain that a trajectory result is required",
  );
  assert.match(
    workspace,
    /longitudinalV3Context[\s\S]*?resultConfig[\s\S]*?<OpenEnaLongitudinalWorkbenchV3/,
    "the V3 workbench must bind to the last successful result and its immutable resultConfig",
  );
  assert.doesNotMatch(workspace, /buildLongitudinalDerivation\(/, "the active Workspace must not retain a second scientific arithmetic path");
});

test("researchers explicitly select repeated-entity and time-order fields", () => {
  const controls = workspace.match(
    /data-testid="open-ena-longitudinal-controls"[\s\S]*?(?=data-testid="open-ena-longitudinal-(?:time-order|period-diagnostics)"|<\/section>)/,
  )?.[0] ?? "";
  const inferencePanel = workspace.match(/<OpenEnaInferencePanel[\s\S]*?\/>/)?.[0] ?? "";

  assert.match(workspace, /repeatedEntityColumns/);
  assert.match(workspace, /identityConfirmed/);
  assert.match(workspace, /timeColumn/);
  assert.match(controls, /(?:Repeated entity|copy\.longitudinal\.repeatedEntity)/i);
  assert.match(controls, /(?:Time\s*(?:\/|and)?\s*order|copy\.longitudinal\.timeOrder)/i);
  assert.match(
    controls,
    /resultConfig\.unitColumns[\s\S]{0,220}\.filter\(\(column\) => column !== resultConfig\.groupColumn\)[\s\S]{0,180}\.map\([\s\S]{0,500}type="checkbox"/,
    "composite repeated-entity choices must come from successful-result unit fields while excluding the comparison-group namespace",
  );
  assert.match(controls, /copy\.longitudinal\.confirmIdentity/);
  assert.match(
    controls,
    /resultConfig\.conversationColumns[\s\S]{0,260}\.filter\(\(column\) => column !== resultConfig\.groupColumn && !repeatedEntityColumns\.includes\(column\)\)[\s\S]{0,180}\.map\([\s\S]{0,180}<option/,
    "time/order choices must come from successful-result conversation fields while remaining distinct from the group and every identity field",
  );
  assert.match(
    inferencePanel,
    /repeatedEntityColumnOptions=\{\(resultConfig\?\.unitColumns \?\? \[\]\)[\s\S]{0,120}\.filter\(\(column\) => column !== resultConfig\?\.groupColumn\)\}/,
    "Stats inference must not reintroduce the comparison-group namespace as a repeated-entity choice",
  );
  assert.match(
    inferencePanel,
    /timeColumnOptions=\{\(resultConfig\?\.conversationColumns \?\? \[\]\)[\s\S]{0,220}column !== resultConfig\?\.groupColumn[\s\S]{0,120}!repeatedEntityColumns\.includes\(column\)/,
    "Stats inference time choices must remain distinct from both the group and every selected identity field",
  );
  assert.match(
    workspace,
    /setRepeatedEntityColumns\(nextEntityColumns\)[\s\S]{0,120}setIdentityConfirmed\(false\)/,
    "every successful trajectory result must prefill non-group fitted unit fields but require fresh identity confirmation",
  );
  assert.match(
    workspace,
    /if \(update\.repeatedEntityColumns !== undefined\)[\s\S]{0,220}setIdentityConfirmed\(false\)/,
    "editing any composite identity field must synchronously revoke confirmation",
  );
});

test("the Stats coordinator builds all three trajectory designs from aggregate frame slices before one explicit Run", () => {
  const requestBlock = workspace.match(
    /const inferenceRequest\s*=\s*useMemo\([\s\S]*?(?=\n  const inferencePreviewState)/,
  )?.[0] ?? "";
  const previewBlock = workspace.match(
    /const inferencePreviewState\s*=\s*useMemo\([\s\S]*?(?=\n  const inferenceRequestKey)/,
  )?.[0] ?? "";

  assert.match(requestBlock, /kind: "trajectory-independent-period"/);
  assert.match(requestBlock, /kind: "trajectory-paired-periods"/);
  assert.match(requestBlock, /cohortPolicy: "pairwise-complete"/);
  assert.match(requestBlock, /kind: "trajectory-repeated-periods"/);
  assert.match(requestBlock, /cohortPolicy: "all-period-complete"/);
  assert.match(requestBlock, /posthocContrasts: "all-period-pairs"/);
  assert.match(requestBlock, /repeatedEntityColumns: \[\.\.\.repeatedEntityColumns\]/);
  assert.match(requestBlock, /identityConfirmed/);

  assert.match(previewBlock, /sliceLongitudinalIndependentPeriod\(/);
  assert.match(previewBlock, /sliceLongitudinalPairedPeriods\(/);
  assert.match(previewBlock, /sliceLongitudinalRepeatedPeriods\(/);
  assert.doesNotMatch(previewBlock, /runOpenEnaInferenceV2|mannWhitneyRankTest|wilcoxonSignedRankTest|friedmanRankTest/);
  assert.equal((workspace.match(/runOpenEnaInferenceV2\(/g) ?? []).length, 1);
  assert.match(workspace, /comparisonFrame: longitudinalComparisonFrame/);
  assert.doesNotMatch(
    workspace.match(/<OpenEnaInferencePanel[\s\S]*?\/>/)?.[0] ?? "",
    /comparisonFrame|entityToken|pairs|blocks/,
    "the private frame must never cross the sanitized panel boundary",
  );
});

test("trajectory independent design stays disabled until one valid period is available", () => {
  const availabilityBlock = workspace.match(
    /const inferenceDesignAvailability\s*=\s*useMemo\([\s\S]*?(?=\n  const inferenceRequest)/,
  )?.[0] ?? "";
  assert.match(
    availabilityBlock,
    /independent:[\s\S]{0,260}trajectory[\s\S]{0,260}longitudinalTimeOrder\.length\s*>=\s*1/,
  );
  assert.match(availabilityBlock, /independentRequiresPeriod/);
  assert.match(copy, /independentRequiresPeriod:[^\n]+/);
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

test("a successful trajectory run returns the visible surface to the current result", () => {
  const successBlock = workspace.match(
    /async function runAnalysis\([\s\S]*?setShowGroupCentroidPaths\(true\);/,
  )?.[0] ?? "";

  assert.match(
    successBlock,
    /const nextResult = await analyzeDatasetInWorker[\s\S]*?setResult\(nextResult\)[\s\S]*?setMode\(nextResult\.set\.modelType === "EndPoint" \? "model" : "plot"\)[\s\S]*?setCenterSurface\("plot"\)/,
    "the successful worker protocol result must become current before the trajectory plot is shown",
  );
  assert.doesNotMatch(workspace, /activeComparisonSurface|setComparison/);
});

test("the V3 bundle and exports are bound to successful-result provenance", () => {
  assert.match(longitudinalV3, /analyzedAt/);
  assert.match(longitudinalV3, /provenanceBinding/);
  assert.match(longitudinalV3, /configuration/);
  assert.match(longitudinalV3, /sourceBinding/);
  assert.match(longitudinalV3, /configurationHash/);
  assert.match(
    workspace,
    /\? \{ result, config: resultConfig, dataset, datasetHash \}/,
    "pending model controls must not be mixed into a prior successful trajectory result",
  );
  assert.doesNotMatch(
    longitudinalWorkbenchV3,
    /buildOpenEnaLongitudinalExecutionRequestV3\(\{[\s\S]{0,180}config:\s*configForPendingControls/,
  );
  assert.match(longitudinalWorkbenchV3, /createExportBundle\(bundle, \{ displaySpec/);
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

test("accumulated trajectory order is visibly locked to the fitted source sequence", () => {
  assert.match(workspace, /result\?\.set\.modelType === "AccumulatedTrajectory"/);
  assert.match(workspace, /disabled=\{accumulatedOrderLocked \|\| index === 0\}/);
  assert.match(workspace, /disabled=\{accumulatedOrderLocked \|\| index === longitudinalTimeOrder\.length - 1\}/);
  assert.match(workspace, /copy\.longitudinal\.accumulatedOrderLocked/);
  assert.match(copy, /Accumulated trajectories are locked to the fitted source encounter order/);
});

test("the 3D ENA control reuses trajectory coordinates without leaving Open ENA", () => {
  assert.match(workspace, /aria-pressed=\{view === "3d"\}/);
  assert.match(workspace, /selectVisualizationView\("3d"\)/);
  assert.match(workspace, /view === "2d" && activeLongitudinalView/);
  assert.doesNotMatch(workspace, /href=\{siteConfig\.threeDenaUrl\}/);
  assert.match(plot, /view === "3d"[\s\S]*?zDimension/);
});
