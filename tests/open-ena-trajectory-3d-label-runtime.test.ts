import assert from "node:assert/strict";
import test from "node:test";
import { createOpenEna3dLabelLayout, movePlotlyPointByPixels, readPlotlyAnnotationAnchor, readPlotlyAnnotationDragPosition, readPlotlyPointAnchor } from "../lib/open-ena/plot3d-label-layout";
import { placePlotLabels } from "../lib/open-ena/plot-label-layout";
import type { OpenEna3dLabelAnnotation } from "../lib/open-ena/plot3d";

test("native annotation projector reads Plotly's resolved pixels and refuses unavailable projection", () => {
  assert.deepEqual(readPlotlyAnnotationAnchor({ x: 7, y: 8, _xa: { _offset: 11, r2p: (x: number) => x * 2 }, _ya: { _offset: 13, r2p: (y: number) => y * 3 } }), { x: 25, y: 37 });
  assert.equal(readPlotlyAnnotationAnchor({}), null);
  assert.equal(readPlotlyAnnotationAnchor({ x: 0, y: 0, _xa: { _offset: 0, r2p: () => NaN }, _ya: { _offset: 0, r2p: () => 4 } }), null);
});

test("marker projection uses native model/view/projection matrices, scene domain and axis conversion", () => {
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const native = { _fullLayout: { _size: { l: 10, t: 20, w: 800, h: 400 }, scene: {
    domain: { x: [0.25, 0.75], y: [0.1, 0.9] },
    xaxis: { r2l: (x: number) => -x }, yaxis: { r2l: (y: number) => y }, zaxis: { r2l: (z: number) => z },
    _scene: { dataScale: [2, 1, 1], glplot: { cameraParams: { model: identity, view: identity, projection: identity } } },
  } } } as unknown as HTMLDivElement;
  assert.deepEqual(readPlotlyPointAnchor(native, { x: 0.25, y: 0.5, z: 0 }), { x: 310, y: 140 });
  assert.equal(readPlotlyPointAnchor({} as HTMLDivElement, { x: 0, y: 0, z: 0 }), null);
});

test("manual annotation movement exactly inverts native screen projection without a first-step jump", () => {
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const perspective = [1.8, 0, 0, 0, 0, 1.3, 0, 0, 0, 0, -1.02, -1, 0, 0, -0.2, 0];
  const view = [0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0.1, -0.2, -4, 1];
  for (const projection of [identity, perspective]) for (const flip of [1, -1]) {
    const root = { _fullLayout: { _size: { l: 20, t: 30, w: 300, h: 220 }, scene: {
      domain: { x: [0.1, 0.9], y: [0.2, 0.95] },
      xaxis: { r2l: (x: number) => flip * x, l2r: (x: number) => flip * x },
      yaxis: { r2l: (y: number) => y, l2r: (y: number) => y },
      zaxis: { r2l: (z: number) => z, l2r: (z: number) => z },
      _scene: { dataScale: [2, 0.5, 1.5], glplot: { cameraParams: { model: identity, view, projection } } },
    } } } as unknown as HTMLDivElement;
    const point = { x: 0.1, y: 0.2, z: -0.1 };
    const projected = readPlotlyPointAnchor(root, point)!;
    // Includes automatic ax/ay, followed by the first tiny pointer movement.
    const displayed = movePlotlyPointByPixels(root, point, { x: 37, y: -18 })!;
    const moved = movePlotlyPointByPixels(root, displayed, { x: 1, y: 2 })!;
    const after = readPlotlyPointAnchor(root, moved)!;
    assert.ok(Math.abs(after.x - projected.x - 38) < 1e-9);
    assert.ok(Math.abs(after.y - projected.y + 16) < 1e-9);
    assert.ok(Math.abs(moved.z - point.z) < 1e-9, "camera depth remains fixed in this view");
  }
  assert.equal(movePlotlyPointByPixels({} as HTMLDivElement, { x: 0, y: 0, z: 0 }, { x: 1, y: 1 }), null);
});

test("a tiny drag preserves native subpixel clearance instead of feeding SVG pixel rounding into the solver", () => {
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const anchor = { x: 561.4201947161396, y: 356.5920678979642 };
  const point = { x: (anchor.x - 16) / 929 * 2 - 1, y: 1 - (anchor.y - 68) / 429 * 2, z: 0 };
  const axis = { r2l: (x: number) => x, l2r: (x: number) => x };
  const root = { _fullLayout: { _size: { l: 16, t: 68, w: 929, h: 429 }, scene: {
    xaxis: axis, yaxis: axis, zaxis: axis,
    annotations: [{ ...point, ax: 0, ay: -19 }],
    _scene: { dataScale: [1, 1, 1], glplot: { cameraParams: { model: identity, view: identity, projection: identity } } },
  } } } as unknown as HTMLDivElement;
  const start = readPlotlyAnnotationDragPosition(root, 0)!;
  const moved = movePlotlyPointByPixels(root, start, { x: 3, y: 0 })!;
  const projected = readPlotlyPointAnchor(root, moved)!;
  const placements = placePlotLabels({ bounds: { x: 16, y: 68, width: 929, height: 429 },
    obstacles: [{ x: anchor.x - 5.25, y: anchor.y - 5.25, width: 10.5, height: 10.5 }],
    labels: [{ id: "TE", anchor, width: 19, height: 19, priority: 400,
      preferredOffset: { x: projected.x - anchor.x, y: projected.y - anchor.y } }] });
  const placement = placements.get("TE")!;
  assert.ok(placement.visible);
  assert.ok(Math.abs(placement.dx - 3) < 1e-9);
  assert.ok(Math.abs(placement.dy + 19) < 1e-9, "do not replace native337.592px center with rounded338px DOM center");
});

function harness() {
  const labels: OpenEna3dLabelAnnotation[] = [0, 1, 2].map(index => ({ id: `label-${index}`, annotationIndex: index, role: "centroid", text: `TP${index}`, description: `Horizon Period = TP${index} · n=8`, priority: 300 }));
  const native = labels.map(label => ({ name: label.id, ax: 0, ay: 0, xshift: 0, yshift: 0, opacity: 0, captureevents: false }));
  const attrs = new Map<string, string>();
  const root = { setAttribute: (key: string, value: string) => attrs.set(key, value), querySelector: () => null, _fullLayout: { scene: { annotations: native } } } as unknown as HTMLDivElement;
  const updates: Record<string, unknown>[] = [];
  const frames = new Map<number, () => void>();
  let frame = 0, active = true, bounds = { x: 0, y: 0, width: 320, height: 160 }, move = 0;
  let hold: Promise<void> | null = null;
  const controller = createOpenEna3dLabelLayout({
    root, labels, isCurrent: () => active,
    scheduleFrame: callback => { frames.set(++frame, callback); return frame; },
    cancelFrame: id => { frames.delete(id); },
    measure: () => ({ bounds, obstacles: [], labels: labels.map(label => ({ id: label.id, anchor: { x: 160 + move, y: 80 }, width: 54, height: 18, priority: label.priority })) }),
    run: async operation => { if (hold) await hold; return operation(); },
    relayout: async update => { updates.push(update); for (const [key, value] of Object.entries(update)) { const match = key.match(/^scene\.annotations\[(\d+)\]\.(.+)$/)!; Object.assign(native[Number(match[1])], { [match[2]]: value }); } },
  });
  return { controller, labels, native, attrs, updates, frames, move: (value: number) => { move = value; }, narrow: () => { bounds = { x: 0, y: 0, width: 55, height: 20 }; }, deactivate: () => { active = false; }, hold: (value: Promise<void>) => { hold = value; } };
}

test("native label layout separates coincident labels, coalesces camera events and keeps updates pixel-only", async () => {
  const h = harness();
  h.controller.schedule(); h.controller.schedule(); h.controller.schedule();
  assert.equal(h.frames.size, 1);
  await h.controller.flush();
  assert.equal(h.frames.size, 0);
  assert.equal(h.attrs.get("data-ena-label-layout"), "ready");
  assert.equal(h.native.filter(label => label.opacity === 1).length, 3);
  assert.equal(new Set(h.native.map(label => `${label.xshift},${label.yshift}`)).size, 3);
  assert.ok(h.updates.every(update => Object.keys(update).every(key => /^scene\.annotations\[\d+\]\.(ax|ay|xshift|yshift|opacity|captureevents)$/.test(key))));
  const count = h.updates.length;
  await h.controller.flush();
  assert.equal(h.updates.length, count, "same measured layout must not cause relayout loops");
  h.move(20); h.controller.schedule(); await h.controller.flush();
  assert.equal(h.native.filter(label => label.opacity === 1).length, 3);
  h.controller.close();
});

test("labels that cannot fit defer without dropping identities and stale queued work never relayouts", async () => {
  const h = harness(); h.narrow();
  await h.controller.flush();
  assert.equal(h.native.filter(label => label.opacity === 1).length, 0);
  assert.equal(h.attrs.get("data-ena-label-deferred-count"), "3");
  assert.equal(h.labels.length, 3);
  let release!: () => void;
  h.hold(new Promise<void>(resolve => { release = resolve; }));
  const pending = h.controller.flush();
  h.deactivate(); h.controller.close(); release();
  await pending;
  assert.equal(h.updates.length, 0);
});
