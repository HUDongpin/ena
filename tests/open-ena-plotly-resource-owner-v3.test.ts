import assert from "node:assert/strict";
import test from "node:test";
import { createOpenEnaPlotlyResourceOwnerV3, runOpenEnaPlotlyViewTransactionV3, type OpenEnaOwnedGlSceneV3 } from "../lib/open-ena/plotly-resource-owner-v3";

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

test("render captures the effective view only at transaction start and never interleaves its apply step", async () => {
  const owner = createOpenEnaPlotlyResourceOwnerV3(() => null), held = barrier(), entered = barrier();
  let view = "perspective", rendered = "", applied = "";
  const first = owner.run(async () => { entered.release(); await held.promise; view = "orthographic-zoom"; });
  await entered.promise;
  const second = runOpenEnaPlotlyViewTransactionV3(owner, {
    active: () => true, revision: () => 0, prepare: () => view, currentUserView: () => view,
    render: async chosen => { rendered = chosen; await Promise.resolve(); },
    apply: async chosen => { applied = chosen; },
  });
  const later = owner.run(() => { assert.equal(applied, "orthographic-zoom"); });
  held.release(); await Promise.all([first, second, later]);
  assert.equal(rendered, "orthographic-zoom"); assert.equal(applied, rendered);
});

test("inactive queued input is skipped and an actual later user orbit wins over captured restoration", async () => {
  const owner = createOpenEnaPlotlyResourceOwnerV3(() => null), held = barrier(), entered = barrier();
  let revision = 0, active = true, applied = "", userView = "original";
  const operation = runOpenEnaPlotlyViewTransactionV3(owner, {
    active: () => active, revision: () => revision, prepare: () => "effective-original", currentUserView: () => userView,
    render: async () => { entered.release(); await held.promise; }, apply: async value => { applied = value; },
  });
  await entered.promise; revision++; userView = "actual-later-orbit";
  const stale = runOpenEnaPlotlyViewTransactionV3(owner, {
    active: () => false, revision: () => revision, prepare: () => { throw new Error("stale input prepared"); },
    currentUserView: () => "", render: async () => { throw new Error("stale input rendered"); }, apply: async () => {},
  });
  held.release(); assert.equal(await operation, "actual-later-orbit"); await stale;
  assert.equal(applied, "actual-later-orbit");
  active = true;
  const result = await runOpenEnaPlotlyViewTransactionV3(owner, {
    active: () => active, revision: () => revision, prepare: () => "effective-reset",
    currentUserView: () => userView,
    render: async value => { applied = value; active = false; },
    apply: async () => { throw new Error("inactive restoration"); },
  });
  assert.equal(result, null); assert.equal(applied, "effective-reset", "inactivated react already received the chosen view, never an intermediate preset");
});

test("changed controlled input cancels its queued operation and orbit during apply is not overwritten on completion", async () => {
  const owner = createOpenEnaPlotlyResourceOwnerV3(() => null), held = barrier();
  let input = "old-camera", revision = 0, rendered = false;
  const oldInput = input, oldRevision = revision;
  const earlier = owner.run(() => held.promise);
  const queued = runOpenEnaPlotlyViewTransactionV3(owner, {
    active: () => input === oldInput && revision === oldRevision, revision: () => revision,
    prepare: () => input, currentUserView: () => input,
    render: async () => { rendered = true; }, apply: async () => {},
  });
  input = "new-axis-reset-camera"; held.release(); await earlier; await queued;
  assert.equal(rendered, false);
  let actual = "explicit-new-fit-camera";
  const result = await runOpenEnaPlotlyViewTransactionV3(owner, {
    active: () => true, revision: () => revision, prepare: () => actual, currentUserView: () => actual,
    render: async chosen => { assert.equal(chosen, "explicit-new-fit-camera"); },
    apply: async () => { await Promise.resolve(); revision++; actual = "newer-user-orbit"; },
  });
  assert.equal(result, "newer-user-orbit", "completion must not overwrite the later user's camera reference");
});
