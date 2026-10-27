import assert from "node:assert/strict";
import test from "node:test";
import { computeTrajectoryUncertaintyV3, type TrajectoryUncertaintyInputV3, type TrajectoryUncertaintyResultV3 } from "../lib/open-ena/trajectory-uncertainty-v3";
import { runTrajectoryUncertaintyV3 } from "../lib/open-ena/trajectory-uncertainty-v3-client";
import { createTrajectoryUncertaintyWorkerHostV3 } from "../lib/open-ena/trajectory-uncertainty-v3.worker";

function fixture() { return { bindingKey: "current-binding", axes: ["x", "y"], groups: [{ groupKey: "g", units: [0, 2].map(x => ({ unitKey: `u${x}`, steps: [{ horizonKey: "h", centroidKey: "c", coordinates: [x, 2 * x] }] })) }] }; }
class WorkerStub {
  onmessage: Worker["onmessage"] = null;
  onerror: Worker["onerror"] = null;
  message!: { kind: "run"; id: string; input: TrajectoryUncertaintyInputV3 };
  terminated = false;
  postMessage(message: unknown) { this.message = message as typeof this.message; }
  terminate() { this.terminated = true; }
  reply(value: unknown = computeTrajectoryUncertaintyV3(this.message.input)) {
    this.onmessage?.call(this as unknown as Worker, { data: { kind: "result", id: this.message.id, result: value } } as MessageEvent);
  }
}

test("client dispatches detached frozen input and returns frozen intervals", async () => {
  const worker = new WorkerStub(), input = fixture();
  const pending = runTrajectoryUncertaintyV3(input, { workerFactory: () => worker });
  input.groups[0].units[0].steps[0].coordinates[0] = 50;
  assert.equal(worker.message.input.groups[0].units[0].steps[0].coordinates[0], 0);
  assert.ok(Object.isFrozen(worker.message.input.groups[0].units));
  worker.reply(); const result = await pending;
  assert.equal(result.centroids[0].axes[0].estimate, 1); assert.ok(Object.isFrozen(result.centroids[0].axes[0])); assert.ok(worker.terminated);
});

test("abort terminates active worker and rejects without publishing late results", async () => {
  const worker = new WorkerStub(), controller = new AbortController();
  const pending = runTrajectoryUncertaintyV3(fixture(), { workerFactory: () => worker, signal: controller.signal });
  controller.abort(); await assert.rejects(pending, { name: "AbortError" });
  assert.ok(worker.terminated); assert.equal(worker.onmessage, null);
});

test("already aborted jobs never create workers", async () => {
  const controller = new AbortController(); controller.abort(); let started = false;
  await assert.rejects(runTrajectoryUncertaintyV3(fixture(), { signal: controller.signal, workerFactory: () => { started = true; return new WorkerStub(); } }), { name: "AbortError" });
  assert.equal(started, false);
});

test("deadline terminates stalled workers and cannot be raised past 30 seconds", async () => {
  const worker = new WorkerStub();
  await assert.rejects(runTrajectoryUncertaintyV3(fixture(), { workerFactory: () => worker, deadlineMs: 5 }), /deadline/i);
  assert.ok(worker.terminated);
  await assert.rejects(runTrajectoryUncertaintyV3(fixture(), { deadlineMs: 30_001 }), /deadline/i);
});

test("currentness loss during execution and stale result bindings reject", async () => {
  let current = true; const worker = new WorkerStub();
  const pending = runTrajectoryUncertaintyV3(fixture(), { workerFactory: () => worker, isCurrent: () => current });
  current = false; worker.reply(); await assert.rejects(pending, /stale/i); assert.ok(worker.terminated);
  const staleWorker = new WorkerStub(), next = runTrajectoryUncertaintyV3(fixture(), { workerFactory: () => staleWorker });
  staleWorker.reply({ ...computeTrajectoryUncertaintyV3(fixture()), bindingKey: "old-binding" });
  await assert.rejects(next, /stale/i);
});

test("late responses reject even before a delayed timeout callback runs", async () => {
  const worker = new WorkerStub();
  const pending = runTrajectoryUncertaintyV3(fixture(), { workerFactory: () => worker, deadlineMs: 10 });
  const until = performance.now() + 15;
  while (performance.now() < until) { /* emulate a busy main thread */ }
  worker.reply(); await assert.rejects(pending, /deadline/i); assert.ok(worker.terminated);
});

test("worker return must preserve centroid identities, counts, estimates, and axes", async () => {
  for (const change of [
    (r: TrajectoryUncertaintyResultV3) => { r.centroids[0].axes[0].estimate = 42; },
    (r: TrajectoryUncertaintyResultV3) => { r.centroids[0].n = 99; },
    (r: TrajectoryUncertaintyResultV3) => { r.centroids[0].axes[0].lower = NaN; },
    (r: TrajectoryUncertaintyResultV3) => { r.axes = ["y", "x"]; },
  ]) {
    const worker = new WorkerStub(), pending = runTrajectoryUncertaintyV3(fixture(), { workerFactory: () => worker });
    const result = structuredClone(computeTrajectoryUncertaintyV3(fixture())); change(result); worker.reply(result);
    await assert.rejects(pending, /mismatch|invalid|stale/i); assert.ok(worker.terminated);
  }
});

test("worker dispatch failures clean up worker and timer", async () => {
  const worker = new WorkerStub(); worker.postMessage = () => { throw new Error("clone failed"); };
  await assert.rejects(runTrajectoryUncertaintyV3(fixture(), { workerFactory: () => worker }), /clone failed/);
  assert.ok(worker.terminated);
});

test("small worker host computes native intervals and rejects invalid input", () => {
  let receive!: (event: { data: unknown }) => void; const messages: unknown[] = [];
  createTrajectoryUncertaintyWorkerHostV3({ addEventListener: (_type, callback) => { receive = callback; }, postMessage: message => { messages.push(message); } });
  receive({ data: { kind: "run", id: "one", input: fixture() } });
  assert.deepEqual(messages[0], { kind: "result", id: "one", result: computeTrajectoryUncertaintyV3(fixture()) });
  receive({ data: { kind: "run", id: "two", input: { bindingKey: "bad" } } });
  assert.equal((messages[1] as { kind: string }).kind, "error");
});
