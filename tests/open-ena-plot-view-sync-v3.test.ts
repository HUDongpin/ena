import assert from "node:assert/strict";
import test from "node:test";
import { createOpenEnaPlotViewSyncV3, openEnaPlotViewFieldsV3 } from "../lib/open-ena/plot-view-sync-v3";

test("owned relayout echoes do not feed back while distinct user camera changes stay observable", async () => {
  const guard = createOpenEnaPlotViewSyncV3();
  const update = { "scene.camera": { eye: { x: 1, y: 2, z: 3 }, projection: { type: "perspective" } } };
  let release!: () => void;
  const pending = guard.apply(update, async value => {
    assert.equal(guard.owns(structuredClone(value)), true);
    assert.equal(guard.owns({ "scene.camera": { ...value["scene.camera"], eye: { x: 1.01, y: 2, z: 3 } } }), false);
    await new Promise<void>(resolve => { release = resolve; });
  });
  update["scene.camera"].eye.x = 9;
  assert.equal(guard.owns(update), false, "caller mutation must not retarget an owned operation");
  release(); await pending;
  assert.equal(guard.owns({ "scene.camera": { eye: { x: 1, y: 2, z: 3 }, projection: { type: "perspective" } } }), false);
});

test("overlapping render ownership survives an older completion and is cleared on rejection", async () => {
  const guard = createOpenEnaPlotViewSyncV3();
  const update = { "scene.aspectmode": "manual", "scene.aspectratio": { x: 1, y: 1, z: 1 } };
  let first!: () => void, second!: () => void;
  const a = guard.apply(update, () => new Promise<void>(resolve => { first = resolve; }));
  const b = guard.apply(update, () => new Promise<void>(resolve => { second = resolve; }));
  first(); await a; assert.equal(guard.owns(update), true);
  second(); await b; assert.equal(guard.owns(update), false);
  await assert.rejects(guard.apply(update, async () => { throw new Error("renderer rejected"); }), /renderer rejected/);
  assert.equal(guard.owns(update), false);
});


test("layout-only events cannot become user camera updates while full and partial view inputs remain observable", () => {
  for (const update of [{ autosize: true }, { width: 640, height: 480 }, { "scene.domain": { x: [0,1] } }]) assert.deepEqual(openEnaPlotViewFieldsV3(update), { camera: false, aspect: false });
  assert.deepEqual(openEnaPlotViewFieldsV3({ "scene.camera": { eye: { x: 2 } } }), { camera: true, aspect: false });
  assert.deepEqual(openEnaPlotViewFieldsV3({ "scene.camera.eye.x": 2 }), { camera: true, aspect: false });
  assert.deepEqual(openEnaPlotViewFieldsV3({ "scene.aspectratio.x": 1.2, "scene.aspectmode": "manual" }), { camera: false, aspect: true });
});
