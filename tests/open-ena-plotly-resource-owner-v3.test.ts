import assert from "node:assert/strict";
import test from "node:test";
import { createOpenEnaPlotlyResourceOwnerV3, type OpenEnaOwnedGlSceneV3 } from "../lib/open-ena/plotly-resource-owner-v3";

function scene() {
  let lost = false, removed = false, losses = 0;
  return {
    _stopped: false,
    canvas: { remove() { removed = true; } },
    gl: { isContextLost: () => lost, getExtension: () => ({ loseContext() { lost = true; losses++; } }) } as unknown as OpenEnaOwnedGlSceneV3["gl"],
    state: () => ({ lost, removed, losses }),
  };
}
function barrier() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }

test("repeated replaced stopped scenes retire, current and unrelated shared export contexts survive", async () => {
  let current = scene(); const initial = current, shared = scene();
  const owner = createOpenEnaPlotlyResourceOwnerV3(() => current);
  for (let cycle = 0; cycle < 10; cycle++) {
    const old = current;
    await owner.run(() => { old._stopped = true; current = scene(); });
    assert.deepEqual(old.state(), { lost: true, removed: true, losses: 1 });
    assert.deepEqual(current.state(), { lost: false, removed: false, losses: 0 });
  }
  await owner.run(() => {});
  assert.equal(initial.state().losses, 1);
  assert.equal(shared.state().lost, false);
});

test("overlapping render and PNG operation protect replaced contexts until both settle", async () => {
  let current = scene(); const old = current, render = barrier(), png = barrier();
  const owner = createOpenEnaPlotlyResourceOwnerV3(() => current);
  const a = owner.run(async () => { old._stopped = true; current = scene(); await render.promise; });
  const b = owner.run(() => png.promise);
  render.release(); await a;
  assert.equal(old.state().lost, false);
  png.release(); await b;
  assert.equal(old.state().lost, true);
  assert.equal(current.state().lost, false);
});

test("unmount defers purge and retirement until pending PNG rejection then closes once", async () => {
  const current = scene(), image = barrier(); let purges = 0;
  const owner = createOpenEnaPlotlyResourceOwnerV3(() => current);
  const operation = owner.run(async () => { await image.promise; throw new Error("image failed"); });
  const done = owner.close(() => { purges++; current._stopped = true; });
  assert.equal(purges, 0); assert.equal(current.state().lost, false);
  await assert.rejects(owner.run(() => {}), /closed/);
  image.release(); await assert.rejects(operation, /image failed/); await done;
  await owner.close(() => { purges++; });
  assert.equal(purges, 1); assert.deepEqual(current.state(), { lost: true, removed: true, losses: 1 });
});

test("rejected partial render retires stopped predecessor while an unstopped replacement is protected", async () => {
  let current = scene(); const previous = current;
  const owner = createOpenEnaPlotlyResourceOwnerV3(() => current);
  await assert.rejects(owner.run(() => { previous._stopped = true; current = scene(); throw new Error("partial render"); }), /partial render/);
  assert.equal(previous.state().lost, true); assert.equal(current.state().lost, false);
});
