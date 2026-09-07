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

test("queued replacement waits for a pending PNG before retiring its current scene", async () => {
  let current = scene(); const old = current, render = barrier(), png = barrier();
  const owner = createOpenEnaPlotlyResourceOwnerV3(() => current);
  const started = barrier();
  const a = owner.run(async () => { started.release(); await png.promise; });
  await started.promise;
  const b = owner.run(async () => { old._stopped = true; current = scene(); await render.promise; });
  assert.equal(old.state().lost, false);
  png.release(); await a;
  render.release(); await b;
  assert.equal(old.state().lost, true);
  assert.equal(current.state().lost, false);
});

test("unmount defers purge and retirement until pending PNG rejection then closes once", async () => {
  const current = scene(), image = barrier(), entered = barrier(); let purges = 0;
  const owner = createOpenEnaPlotlyResourceOwnerV3(() => current);
  const operation = owner.run(async () => { entered.release(); await image.promise; throw new Error("image failed"); });
  await entered.promise;
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

test("two requested replacements cannot hide an intermediate scene behind overlapping awaits", { timeout: 1000 }, async () => {
  let current = scene(); const initial = current, firstEntered = barrier(), releaseFirst = barrier();
  let intermediate: ReturnType<typeof scene> | null = null, secondEntered = false;
  const owner = createOpenEnaPlotlyResourceOwnerV3(() => current);
  const first = owner.run(async () => {
    firstEntered.release(); await releaseFirst.promise;
    initial._stopped = true; current = scene(); intermediate = current;
    await Promise.resolve();
  });
  await firstEntered.promise;
  const second = owner.run(async () => { secondEntered = true; current._stopped = true; current = scene(); });
  const startedTooEarly = secondEntered;
  releaseFirst.release();
  assert.equal(startedTooEarly, false, "one root must finish an operation before beginning a replacement"); await Promise.all([first, second]);
  assert.equal(initial.state().lost, true);
  assert.equal(intermediate!.state().lost, true);
  assert.equal(current.state().lost, false);
});

test("purge and context-retirement failures reject close and preserve operation failures", { timeout: 1000 }, async () => {
  const current = scene(), purgeFailure = new Error("purge failure");
  const owner = createOpenEnaPlotlyResourceOwnerV3(() => current);
  await owner.run(() => {});
  await assert.rejects(async () => owner.close(() => { throw purgeFailure; }), error => error === purgeFailure);
  await assert.rejects(owner.close(() => {}), error => error === purgeFailure);
  let active = scene(); const old = active, operationFailure = new Error("operation failed"), retirementFailure = new Error("retirement failed");
  old.gl.getExtension = () => { throw retirementFailure; };
  const other = createOpenEnaPlotlyResourceOwnerV3(() => active);
  await assert.rejects(other.run(() => { old._stopped = true; active = scene(); throw operationFailure; }), error => error instanceof AggregateError && error.errors[0] === operationFailure && error.errors[1] === retirementFailure);
  assert.equal(old.state().removed, false, "a failed retirement must not be misrepresented by DOM removal");
});
