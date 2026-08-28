import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("../components/open-ena/OpenEnaLongitudinalWorkbenchV3.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../components/open-ena/OpenEnaWorkspace.tsx", import.meta.url), "utf8");
const groupContrast2d = readFileSync(new URL("../components/open-ena/OpenEnaGroupContrast.tsx", import.meta.url), "utf8");
const groupContrast3d = readFileSync(new URL("../components/open-ena/OpenEna3DGroupContrast.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("V3 2D Plotly range actions preserve centers and reset exact immutable spec ranges", async () => {
  type PlotRanges = {
    x: readonly [number, number];
    y: readonly [number, number];
  };
  const display = await import("../lib/open-ena/longitudinal-v3-display") as unknown as {
    zoomTrajectoryPlotlyRangesV3: (
      current: PlotRanges,
      direction: "in" | "out",
    ) => PlotRanges;
    resetTrajectoryPlotlyRangesV3: (initial: PlotRanges) => PlotRanges;
    captureInitialTrajectoryPlotlyRangesV3: (
      initial: PlotRanges | null,
      rendered: PlotRanges,
    ) => PlotRanges;
  };

  assert.equal(typeof display.zoomTrajectoryPlotlyRangesV3, "function");
  assert.equal(typeof display.resetTrajectoryPlotlyRangesV3, "function");
  assert.equal(typeof display.captureInitialTrajectoryPlotlyRangesV3, "function");

  const immutableInitial = {
    x: [-6, 6] as const,
    y: [9, -3] as const,
  };
  const current = {
    x: [2, 8] as const,
    y: [8, -4] as const,
  };
  const zoomedIn = display.zoomTrajectoryPlotlyRangesV3(current, "in");

  assert.equal((zoomedIn.x[0] + zoomedIn.x[1]) / 2, 5);
  assert.equal((zoomedIn.y[0] + zoomedIn.y[1]) / 2, 2);
  assert.ok(Math.abs((current.x[1] - current.x[0]) / (zoomedIn.x[1] - zoomedIn.x[0]) - 1.2) < 1e-12);
  assert.ok(Math.abs((current.y[1] - current.y[0]) / (zoomedIn.y[1] - zoomedIn.y[0]) - 1.2) < 1e-12);
  assert.ok(zoomedIn.y[0] > zoomedIn.y[1], "zoom must preserve a reversed Plotly axis");

  const roundTrip = display.zoomTrajectoryPlotlyRangesV3(zoomedIn, "out");
  for (const axis of ["x", "y"] as const) {
    assert.ok(Math.abs(roundTrip[axis][0] - current[axis][0]) < 1e-12);
    assert.ok(Math.abs(roundTrip[axis][1] - current[axis][1]) < 1e-12);
  }

  const reset = display.resetTrajectoryPlotlyRangesV3(immutableInitial);
  assert.deepEqual(reset, immutableInitial);
  assert.notStrictEqual(reset.x, immutableInitial.x);
  assert.notStrictEqual(reset.y, immutableInitial.y);

  const firstRendered = { x: [-4, 10] as const, y: [-8, 2] as const };
  const captured = display.captureInitialTrajectoryPlotlyRangesV3(null, firstRendered);
  assert.deepEqual(captured, firstRendered);
  assert.notStrictEqual(captured.x, firstRendered.x);
  assert.notStrictEqual(captured.y, firstRendered.y);
  const afterCompactRender = display.captureInitialTrajectoryPlotlyRangesV3(
    captured,
    { x: [100, 200], y: [300, 400] },
  );
  assert.deepEqual(afterCompactRender, firstRendered, "a later render must not replace the immutable first baseline");
});

test("V3 captures the first rendered 3D aspect ratio as an immutable zoom and reset baseline", async () => {
  type AspectRatio = { x: number; y: number; z: number };
  const display = await import("../lib/open-ena/longitudinal-v3-display") as unknown as {
    captureInitialTrajectoryPlotlyAspectRatioV3: (
      initial: AspectRatio | null,
      rendered: AspectRatio,
    ) => AspectRatio;
  };

  assert.equal(typeof display.captureInitialTrajectoryPlotlyAspectRatioV3, "function");

  const firstRendered = { x: 1.8, y: 1.2, z: 0.65 };
  const captured = display.captureInitialTrajectoryPlotlyAspectRatioV3(null, firstRendered);
  assert.deepEqual(captured, firstRendered);
  assert.notStrictEqual(captured, firstRendered);

  const afterFullscreenRender = display.captureInitialTrajectoryPlotlyAspectRatioV3(
    captured,
    { x: 9, y: 8, z: 7 },
  );
  assert.deepEqual(
    afterFullscreenRender,
    firstRendered,
    "compact/fullscreen Plotly.react calls must not replace the first runtime aspect baseline",
  );
  assert.notStrictEqual(afterFullscreenRender, captured);
});

test("V3 plot action gate rejects a concurrent operation until the active one settles", async () => {
  type ActionResult<T> =
    | { status: "completed"; value: T }
    | { status: "rejected" };
  const display = await import("../lib/open-ena/longitudinal-v3-display") as unknown as {
    runTrajectoryPlotlyActionV3: <T>(
      gate: { current: boolean },
      action: () => Promise<T>,
    ) => Promise<ActionResult<T>>;
  };

  assert.equal(typeof display.runTrajectoryPlotlyActionV3, "function");

  const gate = { current: false };
  const fakeRoot = { zoomLevel: 0 };
  const relayoutPayloads: number[] = [];
  let releaseFirst!: () => void;
  let signalFirstStarted!: () => void;
  const firstStarted = new Promise<void>((resolve) => { signalFirstStarted = resolve; });
  const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let blockNextRelayout = true;
  const fakePlotly = {
    async relayout(root: typeof fakeRoot, payload: { zoomLevel: number }) {
      relayoutPayloads.push(payload.zoomLevel);
      if (blockNextRelayout) {
        blockNextRelayout = false;
        signalFirstStarted();
        await firstBlocked;
      }
      root.zoomLevel = payload.zoomLevel;
    },
  };
  const zoom = () => display.runTrajectoryPlotlyActionV3(gate, async () => {
    const nextZoomLevel = fakeRoot.zoomLevel + 1;
    await fakePlotly.relayout(fakeRoot, { zoomLevel: nextZoomLevel });
    return nextZoomLevel;
  });
  const first = zoom();

  await firstStarted;
  assert.equal(gate.current, true, "the synchronous gate must close before the first await yields");
  const concurrent = await zoom();
  assert.deepEqual(concurrent, { status: "rejected" });
  assert.deepEqual(relayoutPayloads, [1], "the rejected action must not reuse the first pre-update root state");

  releaseFirst();
  assert.deepEqual(await first, { status: "completed", value: 1 });
  assert.equal(gate.current, false);
  assert.equal(fakeRoot.zoomLevel, 1);

  assert.deepEqual(await zoom(), { status: "completed", value: 2 });
  assert.equal(fakeRoot.zoomLevel, 2);
  assert.deepEqual(relayoutPayloads, [1, 2], "the next accepted action must compute from the updated root state");
});

test("the reachable V3 presenter wires accessible Plotly actions for 3D and 2D projections", () => {
  const presenter = component.match(
    /function TrajectoryPlotlyPresenterV3[\s\S]*?(?=\nfunction AuditCards)/,
  )?.[0] ?? "";

  assert.match(presenter, /zoomOpenEna3dCamera\(/);
  assert.match(presenter, /resetOpenEna3dCameraDistance\(/);
  assert.match(presenter, /zoomOpenEna3dAspectRatio\(/);
  assert.match(presenter, /zoomTrajectoryPlotlyRangesV3\(/);
  assert.match(presenter, /resetTrajectoryPlotlyRangesV3\(initialRanges\)/);
  assert.match(presenter, /projection\.type === "orthographic"/);
  assert.match(presenter, /trajectoryPlotlyCamera\(scene\.camera, cameraForPreset\(cameraPreset\)\)/);
  assert.match(presenter, /zoomOpenEna3dCamera\(activeCamera, defaultCamera, direction\)/);
  assert.match(presenter, /const initialRangesRef = useRef<TrajectoryPlotlyRangesV3 \| null>\(null\)/);
  assert.match(presenter, /const initialAspectRatioRef = useRef<OpenEna3dAspectRatio \| null>\(null\)/);
  assert.match(
    presenter,
    /useEffect\(\(\) => \{\s*initialRangesRef\.current = null;\s*initialAspectRatioRef\.current = null;\s*\}, \[spec\]\)/,
    "only an immutable spec change may invalidate the first rendered 2D and 3D baselines",
  );
  assert.match(
    presenter,
    /Plotly\.react\([\s\S]*?\.then\(\(\) => \{[\s\S]*?trajectoryPlotlyRuntimeRanges\(root\)[\s\S]*?captureInitialTrajectoryPlotlyRangesV3\(/,
    "the 2D baseline must be captured only after Plotly has resolved its initial autorange",
  );
  assert.match(
    presenter,
    /Plotly\.react\([\s\S]*?\.then\(\(\) => \{[\s\S]*?trajectoryPlotlyRuntimeAspectRatio\(root\)[\s\S]*?captureInitialTrajectoryPlotlyAspectRatioV3\(/,
    "the aspect baseline must be captured from the first successful Plotly render, not the unrendered spec fallback",
  );
  assert.match(
    presenter,
    /zoomOpenEna3dAspectRatio\(\s*currentAspectRatio\(\),\s*defaultAspectRatio\(\),\s*direction,/,
  );
  assert.match(presenter, /"scene\.aspectratio": defaultAspectRatio\(\)/);
  assert.match(presenter, /const actionPendingRef = useRef\(false\)/);
  assert.match(presenter, /const \[actionPending, setActionPending\] = useState\(false\)/);
  assert.match(presenter, /runTrajectoryPlotlyActionV3\(actionPendingRef,/);
  assert.ok(
    [...presenter.matchAll(/disabled=\{status !== "ready" \|\| actionPending\}/gu)].length >= 4,
    "all four plot actions must disable while an earlier relayout/toImage operation is pending",
  );
  assert.match(
    presenter,
    /const announceAction = \(message: string\) => \{[\s\S]*?setActionStatus\(""\)[\s\S]*?window\.setTimeout/,
    "repeating the same action must still mutate and reannounce the live status",
  );
  assert.match(presenter, /const actionStatusTimerRef = useRef<number \| null>\(null\)/);
  assert.match(
    presenter,
    /useEffect\(\(\) => \(\) => \{[\s\S]*?actionStatusTimerRef\.current[\s\S]*?window\.clearTimeout/,
    "the live-announcement timer must be cleared when the presenter unmounts",
  );
  for (const relayoutKey of [
    "scene.camera",
    "scene.aspectratio",
    "xaxis.range",
    "yaxis.range",
  ]) assert.match(presenter, new RegExp(`"${relayoutKey.replace(".", "\\.")}"`));

  for (const action of ["zoom-in", "zoom-out", "recenter", "copy-image"]) {
    assert.match(presenter, new RegExp(`data-ena-plot-action="${action}"`));
  }
  assert.match(presenter, /const canvasId =/);
  assert.match(presenter, /id=\{canvasId\}/);
  assert.ok(
    [...presenter.matchAll(/aria-controls=\{canvasId\}/gu)].length >= 5,
    "fullscreen and all four plot actions must identify the Plotly canvas they control",
  );
  assert.match(presenter, /<button\s+[\s\S]*?type="button"[\s\S]*?data-ena-plot-action="zoom-in"/);
  assert.match(presenter, /role="status"\s+aria-live="polite">\{actionStatus\}/);
  assert.match(presenter, /Plotly\.toImage\(/);

  assert.match(presenter, /new ResizeObserver/);
  assert.match(presenter, /Plotly\.purge\(/);
  assert.match(presenter, /requestFullscreen\(/);
  assert.match(presenter, /fallbackFullscreen/);
});

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
