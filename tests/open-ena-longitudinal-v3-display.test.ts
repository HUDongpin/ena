import assert from "node:assert/strict";
import test from "node:test";

import {
  applyCompactTrajectoryPlotlyLayoutV3,
  applyFullscreenTrajectoryPlotlyLayoutV3,
  cloneTrajectoryPlotlyInputV3,
  createOpenEnaFullscreenFocusReturnV3,
} from "../lib/open-ena/longitudinal-v3-display";

test("Plotly receives a mutable deep clone while the scientific display spec stays immutable", () => {
  const marker = Object.freeze({ color: "#123456", line: Object.freeze({ color: "#ffffff" }) });
  const trace = Object.freeze({ type: "scatter3d", marker });
  const source = Object.freeze({
    data: Object.freeze([trace]),
    layout: Object.freeze({ scene: Object.freeze({ bgcolor: "transparent" }) }),
    config: Object.freeze({ responsive: true }),
  });

  const cloned = cloneTrajectoryPlotlyInputV3(source);
  const clonedMarker = cloned.data[0]!.marker as Record<string, unknown>;
  clonedMarker.color = "#abcdef";
  (clonedMarker.line as Record<string, unknown>).color = "#000000";
  (cloned.layout.scene as Record<string, unknown>).bgcolor = "#f7f7f7";

  assert.equal(clonedMarker.color, "#abcdef");
  assert.equal(marker.color, "#123456");
  assert.equal(marker.line.color, "#ffffff");
  assert.equal(source.layout.scene.bgcolor, "transparent");
});

test("compact trajectory layout moves a full-width vertical legend below the plot without mutating the envelope", () => {
  const source = Object.freeze({
    data: Object.freeze([Object.freeze({ type: "scatter3d", name: "Group A" })]),
    layout: Object.freeze({
      legend: Object.freeze({ orientation: "v", x: 1.02 }),
      margin: Object.freeze({ l: 60, r: 180, t: 40, b: 40 }),
    }),
    config: Object.freeze({ responsive: true }),
  });

  const cloned = cloneTrajectoryPlotlyInputV3(source);
  const compact = applyCompactTrajectoryPlotlyLayoutV3(cloned, true);

  assert.deepEqual(compact.layout.legend, {
    orientation: "v",
    x: 0,
    xanchor: "left",
    y: -0.08,
    yanchor: "top",
    font: { size: 10 },
    tracegroupgap: 1,
  });
  assert.deepEqual(compact.layout.margin, { l: 44, r: 12, t: 52, b: 210 });
  assert.deepEqual(source.layout.legend, { orientation: "v", x: 1.02 });
  assert.deepEqual(source.layout.margin, { l: 60, r: 180, t: 40, b: 40 });
});

test("wide trajectory layout remains byte-for-byte unchanged", () => {
  const cloned = cloneTrajectoryPlotlyInputV3({
    data: [],
    layout: { legend: { orientation: "v" }, margin: { r: 180 } },
    config: {},
  });
  const before = JSON.stringify(cloned);

  assert.equal(applyCompactTrajectoryPlotlyLayoutV3(cloned, false), cloned);
  assert.equal(JSON.stringify(cloned), before);
});

test("fullscreen trajectory layout gives the scene the complete canvas and overlays the legend", () => {
  const source = Object.freeze({
    data: Object.freeze([Object.freeze({ type: "scatter3d", name: "Group A" })]),
    layout: Object.freeze({
      legend: Object.freeze({ orientation: "v", x: 1.02, font: Object.freeze({ size: 12 }) }),
      margin: Object.freeze({ l: 56, r: 24, t: 32, b: 56 }),
      scene: Object.freeze({
        aspectmode: "data",
        domain: Object.freeze({ x: Object.freeze([0.1, 0.8]), y: Object.freeze([0.2, 0.9]) }),
      }),
    }),
    config: Object.freeze({ responsive: true }),
  });

  const cloned = cloneTrajectoryPlotlyInputV3(source);
  const fullscreen = applyFullscreenTrajectoryPlotlyLayoutV3(cloned, true);

  assert.deepEqual(fullscreen.layout.margin, { l: 24, r: 8, t: 28, b: 20 });
  assert.deepEqual(fullscreen.layout.legend, {
    orientation: "v",
    x: 0.995,
    xanchor: "right",
    y: 0.995,
    yanchor: "top",
    bgcolor: "rgba(255,255,255,0.82)",
    bordercolor: "rgba(91,111,116,0.28)",
    borderwidth: 1,
    font: { size: 11 },
    tracegroupgap: 2,
  });
  assert.deepEqual(fullscreen.layout.scene, {
    aspectmode: "data",
    domain: { x: [0, 1], y: [0, 1] },
  });
  assert.deepEqual(source.layout.margin, { l: 56, r: 24, t: 32, b: 56 });
  assert.deepEqual(source.layout.scene.domain, { x: [0.1, 0.8], y: [0.2, 0.9] });
});

test("non-fullscreen trajectory layout remains unchanged", () => {
  const cloned = cloneTrajectoryPlotlyInputV3({
    data: [],
    layout: { scene: { aspectmode: "data" }, margin: { r: 24 } },
    config: {},
  });
  const before = JSON.stringify(cloned);

  assert.equal(applyFullscreenTrajectoryPlotlyLayoutV3(cloned, false), cloned);
  assert.equal(JSON.stringify(cloned), before);
});


function focusReturnFixture() {
  type Target = { name: string; connected: boolean; enabled: boolean };
  const body: Target = { name: "body", connected: true, enabled: true };
  const entry: Target = { name: "entry", connected: true, enabled: false };
  const region: Target = { name: "region", connected: true, enabled: true };
  const other: Target = { name: "other", connected: true, enabled: true };
  let active: Target = body, current = true, sequence = 0;
  const frames = new Map<number, () => void>(), allFrames: Array<() => void> = [], focused: string[] = [];
  const owner = createOpenEnaFullscreenFocusReturnV3<Target>({
    active: () => active, neutral: target => target === body || target === null,
    usable: target => target.connected && target.enabled,
    focus: target => { active = target; focused.push(target.name); owner.userIntent(target); },
    schedule: callback => { const id = ++sequence; frames.set(id, callback); allFrames.push(callback); return id; },
    cancelSchedule: id => { frames.delete(id); },
  });
  return { owner, body, entry, region, other, focused, frames, allFrames,
    request: () => owner.request(entry, region, () => current),
    setActive: (target: Target) => { active = target; }, invalidate: () => { current = false; },
    frame: () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); },
  };
}

test("deferred fullscreen return waits without polling then completes once at readiness", () => {
  const f = focusReturnFixture(); f.request(); f.frame();
  assert.deepEqual(f.focused, []); assert.equal(f.frames.size, 0, "disabled target must not spin animation frames");
  f.entry.enabled = true; f.owner.ready(false); f.frame();
  assert.deepEqual(f.focused, ["entry"]);
  f.owner.ready(false); f.frame(); assert.deepEqual(f.focused, ["entry"], "own focus event must not create another return");
});

test("later focus or pointer choice cancels a pending return, including an already queued callback", () => {
  for (const afterFrame of [false, true]) {
    const f = focusReturnFixture(); f.request(); if (afterFrame) f.frame();
    f.setActive(f.other); f.owner.userIntent(f.other); f.entry.enabled = true; f.owner.ready(false);
    f.allFrames.forEach(callback => callback()); f.frame(); assert.deepEqual(f.focused, []);
  }
});

test("reentry or unmount cancellation and changed context cannot complete an obsolete return", () => {
  for (const action of ["cancel", "context", "disconnected"] as const) {
    const f = focusReturnFixture(); f.request();
    if (action === "cancel") f.owner.cancel();
    if (action === "context") f.invalidate();
    if (action === "disconnected") { f.entry.connected = false; f.region.connected = false; }
    f.entry.enabled = true; f.owner.ready(false); f.allFrames.forEach(callback => callback()); f.frame();
    assert.deepEqual(f.focused, []);
  }
  const f = focusReturnFixture(); f.request(); const stale = f.allFrames[0]!; f.owner.cancel(); f.request();
  f.entry.enabled = true; stale(); assert.deepEqual(f.focused, []); f.frame(); assert.deepEqual(f.focused, ["entry"]);
});

test("terminal render error uses the usable plot region and ends the focus request", () => {
  const f = focusReturnFixture(); f.request(); f.frame(); f.owner.ready(true); f.frame();
  assert.deepEqual(f.focused, ["region"]); f.entry.enabled = true; f.owner.ready(false); f.frame(); assert.deepEqual(f.focused, ["region"]);
});
