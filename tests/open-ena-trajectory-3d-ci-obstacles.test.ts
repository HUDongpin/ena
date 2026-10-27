import assert from "node:assert/strict";
import test from "node:test";
import { measureOpenEna3dLabels } from "../lib/open-ena/plot3d-label-layout";

test("projected CI edges participate in label avoidance without treating the empty box interior as filled", () => {
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const bg = { getBoundingClientRect: () => ({ left: 190, top: 90, width: 20, height: 20 }) };
  const element = { querySelector: () => bg, setAttribute: () => {}, style: {} };
  const axis = { r2l: (value: number) => value };
  const root = {
    clientWidth: 400, clientHeight: 200,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 200 }),
    querySelector: () => element, querySelectorAll: () => [], closest: () => null, setAttribute: () => {},
    _fullData: [{ type: "scatter3d", mode: "lines", meta: { role: "confidence-interval" },
      x: [-0.8, 0.8], y: [0.8, -0.8], z: [0, 0], line: { width: 2, dash: "dash" } }],
    _fullLayout: { width: 400, height: 200, _size: { l: 0, t: 0, w: 400, h: 200 }, scene: {
      xaxis: axis, yaxis: axis, zaxis: axis,
      annotations: [{ name: "c0", x: 0, y: 0, z: 0, _xa: { _offset: 200, r2p: () => 0 }, _ya: { _offset: 100, r2p: () => 0 } }],
      _scene: { dataScale: [1, 1, 1], glplot: { cameraParams: { model: identity, view: identity, projection: identity } } },
    } },
  } as unknown as HTMLDivElement;
  const measured = measureOpenEna3dLabels(root, [{ id: "c0", annotationIndex: 0, role: "centroid", text: "T1", description: "T1", priority: 200 }]);
  const contains = (x: number, y: number) => measured.obstacles.some(box => x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height);
  assert.ok(contains(100, 50), "the projected dashed diagonal must obstruct labels along its length");
  assert.ok(!contains(100, 120), "the wireframe's empty interior must remain available for labels");
  assert.ok(measured.obstacles.length > 2);
});

test("dense CI obstacles defer labels safely without call-stack overflow or changing traces", () => {
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const element = { querySelector: () => ({ getBoundingClientRect: () => ({ left: 190, top: 90, width: 20, height: 20 }) }), setAttribute: () => {}, style: {} };
  const axis = { r2l: (value: number) => value };
  const trace = { type: "scatter3d", mode: "lines", meta: { role: "confidence-interval" },
    x: [-0.8, 0.8], y: [0.8, -0.8], z: [0, 0], line: { width: 2, dash: "dash" } };
  const traces = Array.from({ length: 5000 }, () => trace), attributes = new Map<string, string>();
  const root = {
    clientWidth: 400, clientHeight: 200,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 200 }),
    querySelector: () => element, querySelectorAll: () => [], closest: () => null,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    _fullData: traces,
    _fullLayout: { width: 400, height: 200, _size: { l: 0, t: 0, w: 400, h: 200 }, scene: {
      xaxis: axis, yaxis: axis, zaxis: axis,
      annotations: [{ name: "c0", x: 0, y: 0, z: 0, _xa: { _offset: 200, r2p: () => 0 }, _ya: { _offset: 100, r2p: () => 0 } }],
      _scene: { dataScale: [1, 1, 1], glplot: { cameraParams: { model: identity, view: identity, projection: identity } } },
    } },
  } as unknown as HTMLDivElement;
  const labels = [{ id: "c0", annotationIndex: 0, role: "centroid" as const, text: "T1", description: "T1 full detail", priority: 200 }];
  const measured = measureOpenEna3dLabels(root, labels);
  assert.equal(attributes.get("data-ena-label-obstacle-budget"), "exceeded");
  assert.equal(measured.labels.length, 0, "the existing layout defers unmatched labels while keeping their details available");
  assert.equal(measured.obstacles.length, 0, "do not send an incomplete collision map to the label solver");
  assert.equal(traces.length, 5000); assert.deepEqual(trace.x, [-0.8, 0.8]); assert.equal(labels[0].description, "T1 full detail");
});
