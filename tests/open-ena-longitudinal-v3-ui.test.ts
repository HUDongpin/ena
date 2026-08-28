import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("../components/open-ena/OpenEnaLongitudinalWorkbenchV3.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../components/open-ena/OpenEnaWorkspace.tsx", import.meta.url), "utf8");
const groupContrast2d = readFileSync(new URL("../components/open-ena/OpenEnaGroupContrast.tsx", import.meta.url), "utf8");
const groupContrast3d = readFileSync(new URL("../components/open-ena/OpenEna3DGroupContrast.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

type HarnessCamera = {
  eye: { x: number; y: number; z: number };
  center: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
  projection: { type: "perspective" | "orthographic" };
};
type HarnessRanges = { x: readonly [number, number]; y: readonly [number, number] };
type HarnessAspect = { x: number; y: number; z: number };

function createFakeTrajectoryPlotlyHarness() {
  const root: {
    _fullLayout?: {
      xaxis?: { range?: readonly [number, number] };
      yaxis?: { range?: readonly [number, number] };
      scene?: {
        camera?: HarnessCamera;
        aspectratio?: HarnessAspect;
        _scene?: {
          getCamera: () => HarnessCamera | undefined;
          glplot: { getAspectratio: () => HarnessAspect | undefined };
        };
      };
    };
  } = {};
  const events: string[] = [];
  const relayoutPayloads: Array<Record<string, unknown>> = [];
  const imageOptions: Array<Record<string, unknown>> = [];
  let nextRanges: HarnessRanges | null = null;
  let nextAspect: HarnessAspect | null = null;
  let nextCamera: HarnessCamera | null = null;
  let blockedRelayout: { started: () => void; wait: Promise<void> } | null = null;

  const applyRelayout = (payload: Record<string, unknown>) => {
    const layout = root._fullLayout;
    if (!layout) return;
    if (payload["xaxis.range"] && layout.xaxis) layout.xaxis.range = payload["xaxis.range"] as [number, number];
    if (payload["yaxis.range"] && layout.yaxis) layout.yaxis.range = payload["yaxis.range"] as [number, number];
    if (payload["scene.camera"] && layout.scene) layout.scene.camera = structuredClone(payload["scene.camera"] as HarnessCamera);
    if (payload["scene.aspectratio"] && layout.scene) layout.scene.aspectratio = structuredClone(payload["scene.aspectratio"] as HarnessAspect);
  };

  return {
    root,
    events,
    relayoutPayloads,
    imageOptions,
    setNextRuntime(value: { ranges?: HarnessRanges; aspect?: HarnessAspect; camera?: HarnessCamera }) {
      nextRanges = value.ranges ?? null;
      nextAspect = value.aspect ?? null;
      nextCamera = value.camera ?? null;
    },
    blockNextRelayout() {
      let release!: () => void;
      let started!: () => void;
      const wait = new Promise<void>((resolve) => { release = resolve; });
      const didStart = new Promise<void>((resolve) => { started = resolve; });
      blockedRelayout = { started, wait };
      return { release, didStart };
    },
    async react(input: { layout: Record<string, unknown> }) {
      const renderId = String((input.layout.meta as { renderId?: string } | undefined)?.renderId ?? "render");
      events.push(`react:${renderId}`);
      if (nextRanges) {
        root._fullLayout = {
          xaxis: { range: [...nextRanges.x] },
          yaxis: { range: [...nextRanges.y] },
        };
      } else {
        root._fullLayout = {
          scene: {
            camera: nextCamera ? structuredClone(nextCamera) : undefined,
            aspectratio: nextAspect ? { ...nextAspect } : undefined,
            _scene: {
              getCamera: () => root._fullLayout?.scene?.camera,
              glplot: { getAspectratio: () => root._fullLayout?.scene?.aspectratio },
            },
          },
        };
      }
    },
    async relayout(payload: Record<string, unknown>) {
      const payloadCopy = structuredClone(payload);
      relayoutPayloads.push(payloadCopy);
      events.push(`relayout:${JSON.stringify(payloadCopy)}`);
      if (blockedRelayout) {
        const blocker = blockedRelayout;
        blockedRelayout = null;
        blocker.started();
        await blocker.wait;
      }
      applyRelayout(payloadCopy);
      events.push("relayout:complete");
    },
    async toImage(options: Record<string, unknown>) {
      imageOptions.push(structuredClone(options));
      events.push("toImage");
      return "data:image/png;base64,CONTROLLER";
    },
    readRanges: (): HarnessRanges | null => {
      const x = root._fullLayout?.xaxis?.range;
      const y = root._fullLayout?.yaxis?.range;
      return x && y ? { x: [...x], y: [...y] } : null;
    },
    readAspectRatio: (): HarnessAspect | null => {
      const value = root._fullLayout?.scene?._scene?.glplot.getAspectratio();
      return value ? { ...value } : null;
    },
    readCamera: (fallback: HarnessCamera): HarnessCamera => (
      structuredClone(root._fullLayout?.scene?._scene?.getCamera() ?? fallback)
    ),
  };
}

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

  for (const huge of [
    { x: [1.2e308, 1.6e308] as const, y: [1.6e308, 1.2e308] as const },
    { x: [1.6e308, 1.2e308] as const, y: [1.2e308, 1.6e308] as const },
  ]) {
    const zoomed = display.zoomTrajectoryPlotlyRangesV3(huge, "in");
    assert.ok([...zoomed.x, ...zoomed.y].every(Number.isFinite));
    assert.equal(zoomed.x[0] / 2 + zoomed.x[1] / 2, huge.x[0] / 2 + huge.x[1] / 2);
    assert.equal(zoomed.y[0] / 2 + zoomed.y[1] / 2, huge.y[0] / 2 + huge.y[1] / 2);
  }
  assert.throws(
    () => display.zoomTrajectoryPlotlyRangesV3({ x: [0, Number.POSITIVE_INFINITY], y: [0, 1] }, "in"),
    /finite/u,
  );
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

test("V3 Plotly controller captures rendered baselines and dispatches every reachable action", async () => {
  type Result<T> = { status: "completed"; value: T } | { status: "stale" };
  type RenderRequest = {
    specKey: object;
    input: { data: Array<Record<string, unknown>>; layout: Record<string, unknown>; config: Record<string, unknown> };
    hasScene: boolean;
    defaultCamera: HarnessCamera;
  };
  const [display, interactive] = await Promise.all([
    import("../lib/open-ena/longitudinal-v3-display"),
    import("../components/open-ena/OpenEnaInteractive3DPlot"),
  ]) as unknown as [
    {
      createTrajectoryPlotlyControllerV3: (dependencies: Record<string, unknown>) => {
        render: (request: RenderRequest) => Promise<Result<null>>;
        zoom: (direction: "in" | "out") => Promise<Result<Record<string, unknown>>>;
        recenter: () => Promise<Result<Record<string, unknown>>>;
        copy: (
          options: Record<string, unknown>,
          consume?: (image: string) => Promise<string>,
        ) => Promise<Result<string>>;
      };
      zoomTrajectoryPlotlyRangesV3: (ranges: HarnessRanges, direction: "in" | "out") => HarnessRanges;
    },
    {
      zoomOpenEna3dCamera: (camera: HarnessCamera, reference: HarnessCamera, direction: "in" | "out") => HarnessCamera;
      resetOpenEna3dCameraDistance: (camera: HarnessCamera, reference: HarnessCamera) => HarnessCamera;
      zoomOpenEna3dAspectRatio: (aspect: HarnessAspect, reference: HarnessAspect, direction: "in" | "out") => HarnessAspect;
    },
  ];
  assert.equal(typeof display.createTrajectoryPlotlyControllerV3, "function");

  const harness = createFakeTrajectoryPlotlyHarness();
  const controller = display.createTrajectoryPlotlyControllerV3({
    react: harness.react,
    relayout: harness.relayout,
    toImage: harness.toImage,
    readRanges: harness.readRanges,
    readAspectRatio: harness.readAspectRatio,
    readCamera: harness.readCamera,
    zoomCamera: interactive.zoomOpenEna3dCamera,
    resetCamera: interactive.resetOpenEna3dCameraDistance,
    zoomAspectRatio: interactive.zoomOpenEna3dAspectRatio,
  });
  const defaultPerspective: HarnessCamera = {
    eye: { x: 2, y: 2, z: 2 },
    center: { x: 0, y: 0, z: 0 },
    up: { x: 0, y: 0, z: 1 },
    projection: { type: "perspective" },
  };
  const defaultOrthographic: HarnessCamera = {
    eye: { x: 0, y: 0, z: 2.5 },
    center: { x: 0, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    projection: { type: "orthographic" },
  };
  const input = (renderId: string) => ({ data: [], layout: { meta: { renderId } }, config: {} });

  const twoDimensionalSpec = {};
  const initial2d: HarnessRanges = { x: [-12, 6], y: [9, -3] };
  harness.setNextRuntime({ ranges: initial2d });
  assert.equal((await controller.render({ specKey: twoDimensionalSpec, input: input("2d"), hasScene: false, defaultCamera: defaultPerspective })).status, "completed");
  const zoomed2d = display.zoomTrajectoryPlotlyRangesV3(initial2d, "in");
  assert.deepEqual(await controller.zoom("in"), { status: "completed", value: {
    "xaxis.autorange": false,
    "yaxis.autorange": false,
    "xaxis.range": zoomed2d.x,
    "yaxis.range": zoomed2d.y,
  } });
  assert.deepEqual(await controller.recenter(), { status: "completed", value: {
    "xaxis.autorange": false,
    "yaxis.autorange": false,
    "xaxis.range": initial2d.x,
    "yaxis.range": initial2d.y,
  } });

  harness.setNextRuntime({ ranges: { x: [100, 200], y: [300, 400] } });
  await controller.render({ specKey: twoDimensionalSpec, input: input("2d-compact"), hasScene: false, defaultCamera: defaultPerspective });
  assert.deepEqual((await controller.recenter() as { status: "completed"; value: Record<string, unknown> }).value["xaxis.range"], initial2d.x);
  const replacement2d = {};
  const replacementRanges: HarnessRanges = { x: [20, 40], y: [-2, 8] };
  harness.setNextRuntime({ ranges: replacementRanges });
  await controller.render({ specKey: replacement2d, input: input("2d-new-spec"), hasScene: false, defaultCamera: defaultPerspective });
  assert.deepEqual((await controller.recenter() as { status: "completed"; value: Record<string, unknown> }).value["xaxis.range"], replacementRanges.x);

  const orthographicSpec = {};
  const initialAspect = { x: 2, y: 1.25, z: 0.75 };
  harness.setNextRuntime({ aspect: initialAspect, camera: defaultOrthographic });
  await controller.render({ specKey: orthographicSpec, input: input("orthographic"), hasScene: true, defaultCamera: defaultOrthographic });
  const expectedOrthographicZoom = interactive.zoomOpenEna3dAspectRatio(initialAspect, initialAspect, "in");
  assert.deepEqual(await controller.zoom("in"), { status: "completed", value: {
    "scene.aspectmode": "manual",
    "scene.aspectratio": expectedOrthographicZoom,
  } });
  harness.setNextRuntime({ aspect: { x: 9, y: 8, z: 7 }, camera: defaultOrthographic });
  await controller.render({ specKey: orthographicSpec, input: input("orthographic-fullscreen"), hasScene: true, defaultCamera: defaultOrthographic });
  assert.deepEqual(await controller.recenter(), { status: "completed", value: {
    "scene.aspectmode": "manual",
    "scene.aspectratio": initialAspect,
  } });

  const perspectiveSpec = {};
  const rotatedCamera: HarnessCamera = {
    eye: { x: -3, y: 4, z: 2 },
    center: { x: 0.2, y: -0.3, z: 0.1 },
    up: { x: 0, y: 0, z: 1 },
    projection: { type: "perspective" },
  };
  harness.setNextRuntime({ aspect: { x: 1, y: 1, z: 1 }, camera: rotatedCamera });
  await controller.render({ specKey: perspectiveSpec, input: input("perspective"), hasScene: true, defaultCamera: defaultPerspective });
  assert.deepEqual(await controller.zoom("in"), { status: "completed", value: {
    "scene.camera": interactive.zoomOpenEna3dCamera(rotatedCamera, defaultPerspective, "in"),
  } });
  const cameraAfterZoom = harness.readCamera(defaultPerspective);
  assert.deepEqual(await controller.recenter(), { status: "completed", value: {
    "scene.camera": interactive.resetOpenEna3dCameraDistance(cameraAfterZoom, defaultPerspective),
  } });
  const copyOptions = { format: "png", width: 1600, height: 1000, scale: 1 };
  assert.deepEqual(await controller.copy(copyOptions, async (image) => `consumed:${image}`), {
    status: "completed",
    value: "consumed:data:image/png;base64,CONTROLLER",
  });
  assert.deepEqual(harness.imageOptions, [copyOptions]);
});

test("V3 Plotly controller makes a requested new spec final after an old action", async () => {
  type Result<T> = { status: "completed"; value: T } | { status: "stale" };
  const [display, interactive] = await Promise.all([
    import("../lib/open-ena/longitudinal-v3-display"),
    import("../components/open-ena/OpenEnaInteractive3DPlot"),
  ]) as unknown as [any, any];
  assert.equal(typeof display.createTrajectoryPlotlyControllerV3, "function");
  const harness = createFakeTrajectoryPlotlyHarness();
  const controller = display.createTrajectoryPlotlyControllerV3({
    react: harness.react,
    relayout: harness.relayout,
    toImage: harness.toImage,
    readRanges: harness.readRanges,
    readAspectRatio: harness.readAspectRatio,
    readCamera: harness.readCamera,
    zoomCamera: interactive.zoomOpenEna3dCamera,
    resetCamera: interactive.resetOpenEna3dCameraDistance,
    zoomAspectRatio: interactive.zoomOpenEna3dAspectRatio,
  });
  const camera: HarnessCamera = {
    eye: { x: 2, y: 2, z: 2 }, center: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 }, projection: { type: "perspective" },
  };
  const oldSpec = {};
  harness.setNextRuntime({ camera, aspect: { x: 1, y: 1, z: 1 } });
  await controller.render({ specKey: oldSpec, input: { data: [], layout: { meta: { renderId: "old" } }, config: {} }, hasScene: true, defaultCamera: camera });
  harness.events.length = 0;
  harness.relayoutPayloads.length = 0;

  const blocker = harness.blockNextRelayout();
  const oldAction = controller.zoom("in") as Promise<Result<Record<string, unknown>>>;
  await blocker.didStart;
  const queuedOldAction = controller.recenter() as Promise<Result<Record<string, unknown>>>;
  const newSpec = {};
  const newCamera: HarnessCamera = { ...camera, eye: { x: -4, y: 1, z: 3 } };
  harness.setNextRuntime({ camera: newCamera, aspect: { x: 1.5, y: 1, z: 0.8 } });
  const newRender = controller.render({ specKey: newSpec, input: { data: [], layout: { meta: { renderId: "new" } }, config: {} }, hasScene: true, defaultCamera: newCamera });
  const newAction = controller.zoom("out") as Promise<Result<Record<string, unknown>>>;
  blocker.release();

  assert.deepEqual(await oldAction, { status: "stale" });
  assert.deepEqual(await queuedOldAction, { status: "stale" });
  assert.equal((await newRender).status, "completed");
  assert.equal((await newAction).status, "completed");
  assert.equal(harness.relayoutPayloads.length, 2, "the queued stale old action must never call relayout");
  assert.ok(harness.events.indexOf("relayout:complete") < harness.events.indexOf("react:new"));
  assert.ok(harness.events.indexOf("react:new") < harness.events.lastIndexOf("relayout:complete"));
  assert.deepEqual(harness.readCamera(newCamera), interactive.zoomOpenEna3dCamera(newCamera, newCamera, "out"));
});

test("the reachable V3 presenter wires accessible Plotly actions for 3D and 2D projections", () => {
  const presenter = component.match(
    /function TrajectoryPlotlyPresenterV3[\s\S]*?(?=\nfunction AuditCards)/,
  )?.[0] ?? "";

  assert.match(presenter, /const controllerRef = useRef<TrajectoryPlotlyControllerV3 \| null>\(null\)/);
  assert.match(presenter, /createTrajectoryPlotlyControllerV3\(/);
  assert.match(presenter, /controller\.render\(\{[\s\S]*?specKey:\s*spec/);
  assert.match(presenter, /controller\.zoom\(direction\)/);
  assert.match(presenter, /controller\.recenter\(\)/);
  assert.match(presenter, /controller\.copy\(/);
  assert.match(presenter, /result\.status === "completed"[\s\S]*?announceAction/);
  assert.match(presenter, /const \[actionPending, setActionPending\] = useState\(false\)/);
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
    /analysisControls=\{persistentRailPanels\}/,
    "Data, Model, Stats, and AI must be passed into the mounted trajectory workbench as controls, not replace it",
  );
  assert.match(trajectoryPresenter, /analysisControlsMode=\{mode\}/);
  assert.match(component, /analysisControlsMode:\s*OpenEnaMode;/);
  assert.doesNotMatch(component, /analysisControlsMode:\s*string;/);
  assert.match(component, /OpenEnaLongitudinalV3ControlsSlot/);
  assert.match(component, /data-testid="open-ena-longitudinal-v3-analysis-controls"/);
  assert.match(component, /data-testid="open-ena-longitudinal-v3-trajectory-controls"/);
  assert.match(component, /data-controls-mode=\{analysisControlsMode\}/);
  assert.match(
    component,
    /hidden=\{analysisControlsMode === "plot"\}[\s\S]*?hidden=\{analysisControlsMode !== "plot"\}/,
    "analysis and trajectory controls must stay mounted in separate wrappers while visibility follows the rail mode",
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
