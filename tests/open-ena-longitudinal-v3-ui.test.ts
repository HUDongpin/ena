import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("../components/open-ena/OpenEnaLongitudinalWorkbenchV3.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../components/open-ena/OpenEnaWorkspace.tsx", import.meta.url), "utf8");
const groupContrast2d = readFileSync(new URL("../components/open-ena/OpenEnaGroupContrast.tsx", import.meta.url), "utf8");
const groupContrast3d = readFileSync(new URL("../components/open-ena/OpenEna3DGroupContrast.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("V3 trajectory controls follow the 3DENA scientific workflow order", () => {
  const order = [...component.matchAll(/data-trajectory-step="(\d+)"/gu)].map((match) => Number(match[1]));
  assert.deepEqual(order, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  for (const phrase of [
    "Time / order variable",
    "Entity ID",
    "same physical entity",
    "Displayed trajectory levels",
    "Expected empty period",
    "Complete analytical rows",
    "Full rotation distance",
    "3D / 2D projection",
    "Direction arrows",
    "Run trajectory analysis",
    "Analysis bundle ZIP",
  ]) assert.match(component, new RegExp(phrase, "i"));
  for (const removed of [
    "Participant-history cluster bootstrap",
    "Bootstrap numerical intervals",
    "Confidence level",
    "Resampling design",
    "Bootstrap CSV",
    "Mean network overlay",
    "Mean network edges",
    "Overlay time",
    "Overlay scope",
  ]) assert.doesNotMatch(component, new RegExp(removed, "i"));
});

test("React presenter consumes the immutable package envelope and contains no scientific arithmetic", () => {
  assert.match(component, /compileTrajectoryPlotlySpec/);
  assert.match(component, /cloneTrajectoryPlotlyInputV3\(spec\)/);
  assert.match(component, /createExportBundle/);
  assert.match(component, /executeOpenEnaLongitudinalPreparedV3/);
  assert.doesNotMatch(component, /Math\.(?:hypot|sqrt|pow)/);
  assert.doesNotMatch(component, /\b(?:mannWhitney|wilcoxonSigned|friedmanRank|holmAdjust|percentile)\s*\(/);
  assert.doesNotMatch(component, /reduce\([^\n]*(?:centroid|distance|pValue|confidence)/i);
});

test("standalone downloads use the exact aggregate files emitted by the 3DENA package", () => {
  assert.match(component, /exported\.files\.find/);
  assert.doesNotMatch(component, /JSON\.stringify\(bundle/);
  assert.doesNotMatch(component, /csvRows\(pathRows\(bundle\)\)/);
  assert.doesNotMatch(component, /csvRows\(inferenceRows\(bundle\)\)/);
  assert.doesNotMatch(component, /csvRows\(bootstrapRows\(bundle\)\)/);
});

test("successful trajectory results use the V3 workbench instead of the legacy render-time derivation", () => {
  assert.match(workspace, /OpenEnaLongitudinalWorkbenchV3/);
  assert.match(workspace, /<OpenEnaLongitudinalWorkbenchV3/);
  assert.match(component, /data-testid="open-ena-longitudinal-v3-workbench"/);
  assert.match(workspace, /trajectory results are executed by the V3 task workbench/i);
  assert.match(
    workspace,
    /setMode\(nextResult\.set\.modelType === "EndPoint" \? "model" : "plot"\)/,
    "a successful trajectory fit must open its dedicated workbench on the first analysis screen",
  );
  assert.doesNotMatch(
    workspace,
    /setResult\(nextResult\)[\s\S]{0,600}setMode\("model"\)[\s\S]{0,300}setShowTrajectories\(true\)/,
    "the trajectory completion route must not fall through the generic ENA presenter",
  );
});

test("successful trajectory results keep the trajectory presenter mounted across rail modes", () => {
  const trajectoryRoute = workspace.match(/const longitudinalV3Context =[\s\S]*?: null;/)?.[0] ?? "";

  assert.match(trajectoryRoute, /result\.set\.modelType !== "EndPoint"/);
  assert.doesNotMatch(
    trajectoryRoute,
    /mode === "plot"/,
    "Model, Data, Stats, and AI rail modes must not route a trajectory result back to generic ENA plots",
  );
});

test("non-Plot rail panels occupy the trajectory controls slot without unmounting its presenter", () => {
  const trajectoryPresenter = workspace.match(
    /<OpenEnaLongitudinalWorkbenchV3[\s\S]*?\/>/,
  )?.[0] ?? "";

  assert.match(
    trajectoryPresenter,
    /analysisControls=\{mode === "plot" \? null : panel\}/,
    "Data, Model, Stats, and AI must be passed into the mounted trajectory workbench as controls, not replace it",
  );
  assert.match(trajectoryPresenter, /analysisControlsMode=\{mode\}/);
  assert.match(component, /data-testid="open-ena-longitudinal-v3-analysis-controls"/);
  assert.match(component, /data-controls-mode=\{analysisControlsMode\}/);
  assert.match(
    component,
    /analysisControls \? \([\s\S]*?\{analysisControls\}[\s\S]*?\) : \([\s\S]*?data-trajectory-step="1"/,
    "Plot mode must retain trajectory controls while non-Plot modes render their actual panel in the same left slot",
  );
});

test("official Primary, Comparison, and Secondary presenters expose ENA marks only", () => {
  assert.doesNotMatch(groupContrast2d, /trajectory|showTrajectories/i);
  assert.match(groupContrast3d, /showTrajectories:\s*false/);
  assert.doesNotMatch(groupContrast3d, /showTrajectories:\s*true/);
  assert.doesNotMatch(
    workspace.match(/<OpenEnaGroupContrast[\s\S]*?\/>/)?.[0] ?? "",
    /trajectory|showTrajectories/i,
  );
  assert.doesNotMatch(
    workspace.match(/<OpenEna3DGroupContrast[\s\S]*?\/>/)?.[0] ?? "",
    /trajectory|showTrajectories/i,
  );
});

test("V3 desktop and narrow layouts preserve controls-status-plot-table order without horizontal overflow", () => {
  assert.match(css, /\.ena-longitudinal-v3-workbench\s*\{[^}]*grid-column:\s*2\s*\/\s*4[^}]*overflow:\s*hidden/);
  assert.match(css, /\.ena-longitudinal-v3-layout\s*\{[^}]*grid-template-columns:\s*minmax\(300px,\s*380px\)\s+minmax\(0,\s*1fr\)/);
  assert.match(
    css,
    /@media\s*\(max-width:\s*1260px\)\s*and\s*\(min-width:\s*901px\)[\s\S]*?\.ena-workbench-grid:has\(\.ena-longitudinal-v3-workbench\)\s*\{[^}]*grid-template-columns:\s*65px\s+minmax\(0,\s*1fr\)[^}]*overflow-x:\s*hidden/,
  );
  assert.match(
    css,
    /@media\s*\(max-width:\s*1260px\)\s*and\s*\(min-width:\s*901px\)[\s\S]*?\.ena-longitudinal-v3-workbench\s*\{[^}]*grid-column:\s*2[^}]*overflow-x:\s*hidden/,
  );
  assert.match(
    css,
    /@media\s*\(max-width:\s*1260px\)\s*and\s*\(min-width:\s*901px\)[\s\S]*?\.ena-longitudinal-v3-layout\s*\{[^}]*grid-template-columns:\s*minmax\(280px,\s*340px\)\s+minmax\(0,\s*1fr\)/,
  );
  assert.match(css, /@media\s*\(max-width:\s*900px\)[\s\S]*?\.ena-longitudinal-v3-layout\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(css, /\.ena-longitudinal-v3-table-wrap\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(css, /@media\s*\(max-width:\s*560px\)[\s\S]*?\.ena-longitudinal-v3-plot-shell\s*\{[^}]*height:\s*535px/);
  assert.match(css, /@media\s*\(max-width:\s*560px\)[\s\S]*?\.ena-longitudinal-v3-plot\s*\{[^}]*height:\s*480px/);
});

test("the plot action toolbar occupies its own row instead of covering the 3D legend", () => {
  assert.match(css, /\.ena-longitudinal-v3-plot-shell\s*\{[^}]*min-height:\s*615px/);
  assert.match(css, /\.ena-longitudinal-v3-plot-actions\s*\{[^}]*position:\s*static[^}]*border-bottom:/);
  assert.match(css, /@media\s*\(max-width:\s*900px\)[\s\S]*?\.ena-longitudinal-v3-plot-shell\s*\{[^}]*height:\s*485px/);
});

test("individual participant paths are display-only and default off in the aggregate trajectory view", () => {
  assert.match(component, /traces:\s*\{\s*participants:\s*true,\s*individualPaths:\s*false,[\s\S]*?uncertainty:\s*false,/);
  assert.match(component, /\['individualPaths',\s*copy\.individualPaths\]/);
});

test("trajectory analysis exposes no CI or bootstrap controls, results, or standalone download", () => {
  assert.doesNotMatch(component, /\['uncertainty',\s*copy\.uncertainty\]/);
  assert.match(component, /uncertainty:\s*false/);
  assert.match(component, /Run without inference/);
  assert.match(component, /关闭推断后运行/);
  assert.match(component, /關閉推斷後運行/);
  assert.match(component, /required weights, and task parameters/);
  assert.match(component, /必要权重以及任务参数/);
  assert.match(component, /必要權重以及任務參數/);
  assert.doesNotMatch(component, /required weights or strata/);
  assert.doesNotMatch(component, /必要权重或分层/);
  assert.doesNotMatch(component, /data-testid="open-ena-longitudinal-v3-bootstrap"/);
  assert.doesNotMatch(component, /copy\.bootstrap(?:Results|Csv)?/);
  assert.doesNotMatch(component, /trajectory-bootstrap\.csv/);
  assert.doesNotMatch(component, /BOOTSTRAP_NOT_ESTIMABLE/);
});

test("typed remote failures preserve one immutable request and expose three explicit recovery choices", () => {
  const recovery = component.match(
    /status === "remote-recovery"[\s\S]*?remoteFailure\.canDisableInference[\s\S]*?<\/div> : null/,
  )?.[0] ?? "";
  const withoutInference = component.match(
    /const runWithoutInference = async \(\) => \{[\s\S]*?(?=\n  const download = async)/,
  )?.[0] ?? "";
  assert.match(component, /type WorkbenchStatus =[^;]*"remote-recovery"/);
  assert.match(component, /retryRemote:\s*"Retry remote"/);
  assert.match(component, /remoteRecoveryTitle:\s*"Persistent compute did not complete"/);
  assert.match(recovery, /status === "remote-recovery"/);
  assert.match(
    component,
    /caught instanceof OpenEnaLongitudinalExecutionClientErrorV3[\s\S]*?setStatus\("remote-recovery"\)/,
  );
  assert.match(
    recovery,
    /pendingRun[\s\S]*?runPrepared\(pendingRun, \{ allowRemote: true \}\)[\s\S]*?copy\.retryRemote/,
  );
  assert.match(
    recovery,
    /pendingRun[\s\S]*?runPrepared\(pendingRun, \{ forceLocal: true \}\)[\s\S]*?copy\.continueLocal/,
  );
  assert.match(
    withoutInference,
    /const sourcePending = pendingRun;[\s\S]*?withoutOpenEnaLongitudinalInferenceSettingsV3\(sourcePending\.settingsSnapshot\)[\s\S]*?withoutOpenEnaLongitudinalInferencePreparedV3\(sourcePending\.prepared\)/,
  );
  assert.match(recovery, /onClick=\{\(\) => void runWithoutInference\(\)\}>\{copy\.disableHeavy\}/);
});

test("scientific edits invalidate pending confirmation and recovery before an old completion can become current", () => {
  const commitBlock = component.match(
    /function commitScientific\([\s\S]*?(?=\n  function updateInferenceGroups)/,
  )?.[0] ?? "";
  const runPreparedBlock = component.match(
    /const runPrepared = async \([\s\S]*?(?=\n  const run = async)/,
  )?.[0] ?? "";

  assert.match(commitBlock, /advanceOpenEnaLongitudinalScientificRevisionV3/);
  assert.match(commitBlock, /abortRef\.current\?\.abort\(\)/);
  assert.match(commitBlock, /setPendingRun\(null\)/);
  assert.match(commitBlock, /setRouteDecision\(null\)/);
  assert.match(commitBlock, /setRemoteFailure\(null\)/);
  assert.match(runPreparedBlock, /isOpenEnaLongitudinalScientificRunCurrentV3/);
  assert.match(
    runPreparedBlock,
    /if \(!runIsCurrent\(\)\) return;[\s\S]*?setBundle\(receipt\.bundle\)[\s\S]*?setScientificDirty\(false\)/,
    "only the exact still-current prepared run may publish a bundle and clear its stale marker",
  );
  assert.match(
    component,
    /pendingRun[\s\S]*?runPrepared\(pendingRun, \{ allowRemote: true \}\)/,
  );
  assert.match(
    component,
    /pendingRun[\s\S]*?runPrepared\(pendingRun, \{ forceLocal: true \}\)/,
  );
});

test("visible dimensions come from the immutable bundle whenever a result exists", () => {
  assert.match(component, /openEnaLongitudinalHeaderDimensionsV3\(bundle, settings\)/);
  assert.match(component, /headerDimensions\.join\(" × "\)/);
  assert.doesNotMatch(
    component.match(/ena-longitudinal-v3-output-header[\s\S]*?<\/header>/)?.[0] ?? "",
    /settings\.selectedDimensions\.join/,
  );
});

test("fitted ENA code references stay visible while all mean-network overlay controls are absent", () => {
  assert.match(component, /codeNodes:\s*true/);
  assert.match(component, /ENA code reference nodes are always shown/);
  assert.match(component, /ENA code 参考节点始终显示/);
  assert.doesNotMatch(component, /checked=\{display\.traces\.networkOverlay\}/);
  assert.doesNotMatch(component, /checked=\{settings\.networkOverlay\.enabled\}/);
  assert.doesNotMatch(component, /settings\.networkOverlay\.(?:periodCanonical|groupCanonical)/);
  assert.doesNotMatch(component, /copy\.(?:network|networkEdges|overlayPeriod|overlayScope)/);
});

test("fullscreen gives the Plotly canvas the remaining dynamic viewport instead of retaining its 560px page height", () => {
  assert.match(css, /\.ena-longitudinal-v3-plot-shell:fullscreen,\s*\.ena-longitudinal-v3-plot-shell\[data-fallback-fullscreen="true"\]\s*\{[^}]*display:\s*grid[^}]*grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)[^}]*height:\s*100dvh[^}]*overflow:\s*hidden/);
  assert.match(css, /\.ena-longitudinal-v3-plot-shell:fullscreen\s+\.ena-longitudinal-v3-plot,\s*\.ena-longitudinal-v3-plot-shell\[data-fallback-fullscreen="true"\]\s+\.ena-longitudinal-v3-plot\s*\{[^}]*height:\s*100%[^}]*min-height:\s*0/);
  assert.match(css, /data-fallback-fullscreen="true"/);
  assert.match(component, /setFallbackFullscreen\(true\)/);
  assert.match(component, /requestFullscreen\(\)/);
  assert.match(component, /document\.exitFullscreen\(\)/);
  assert.match(component, /document\.addEventListener\("fullscreenchange",\s*resizePlot\)/);
  assert.match(component, /window\.addEventListener\("resize",\s*resizePlot\)/);
});

test("V3 result surfaces include equivalent mapping, path, inference, warning, and provenance tables", () => {
  for (const testId of [
    "open-ena-longitudinal-v3-mapping-audit",
    "open-ena-longitudinal-v3-path-table",
    "open-ena-longitudinal-v3-inference",
    "open-ena-longitudinal-v3-warnings",
    "open-ena-longitudinal-v3-provenance",
  ]) assert.match(component, new RegExp(`data-testid="${testId}"`));
  assert.doesNotMatch(component, /data-testid="open-ena-longitudinal-v3-bootstrap"/);
});

test("all trajectory camera options preserve the lowercase CameraPreset value", () => {
  assert.match(component, /\(\["isometric", "xy", "xz", "yz", "yx", "zx", "zy"\] as CameraPreset\[\]\)/);
  assert.match(component, /<option key=\{preset\} value=\{preset\}>\{preset\.toUpperCase\(\)\}<\/option>/);
});
