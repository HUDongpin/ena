import assert from "node:assert/strict";
import test from "node:test";
import { createOpenEnaLongitudinalWorkerHostV3, type OpenEnaLongitudinalWorkerRequestV3, type OpenEnaLongitudinalWorkerResponseV3 } from "../lib/open-ena/longitudinal-v3.worker";
import { executeOpenEnaLongitudinalPreparedV3, clearOpenEnaLongitudinalExecutionCacheV3 } from "../lib/open-ena/longitudinal-v3-client";
import { validOpenEnaLongitudinalRequestV3 } from "./helpers/open-ena-longitudinal-v3-fixture";

test("a longitudinal progress callback exception rejects once, terminates its Worker and permits an uncached retry", async () => {
  clearOpenEnaLongitudinalExecutionCacheV3();
  const request = await validOpenEnaLongitudinalRequestV3(20, 200);
  const reportedErrors: unknown[] = [];
  let starts = 0, terminations = 0;
  class Transport {
    onmessage: ((event: { data: OpenEnaLongitudinalWorkerResponseV3 }) => void) | null = null;
    onerror: ((event: { message: string }) => void) | null = null;
    listener: (event: { data: OpenEnaLongitudinalWorkerRequestV3 }) => void = () => {};
    constructor() {
      createOpenEnaLongitudinalWorkerHostV3({
        addEventListener: (_type, callback) => { this.listener = callback; },
        // Browsers report an exception in an event handler without rejecting the
        // unrelated promise or stopping future event deliveries. Record exactly
        // that transport behavior while retaining the actual SDK/host execution.
        postMessage: (message) => queueMicrotask(() => { try { this.onmessage?.({ data: structuredClone(message) }); } catch (error) { reportedErrors.push(error); } }),
      });
    }
    postMessage(data: OpenEnaLongitudinalWorkerRequestV3) { if (data.kind === "run") starts++; this.listener({ data: structuredClone(data) }); }
    terminate() { terminations++; }
  }
  const previous = globalThis.Worker; globalThis.Worker = Transport as unknown as typeof Worker;
  try {
    const reason = new Error("controlled consumer progress failure");
    const first = await Promise.allSettled([executeOpenEnaLongitudinalPreparedV3(request, { onProgress(value) { if (value.stage !== "complete") throw reason; } })]);
    const retry = await executeOpenEnaLongitudinalPreparedV3(request);
    assert.equal(first[0].status, "rejected", "a failed callback must not silently publish/cache a successful analysis");
    if (first[0].status === "rejected") assert.equal(first[0].reason, reason);
    assert.deepEqual(reportedErrors, [], "callback failure belongs to the execution promise, not a global event error");
    assert.equal(retry.cacheHit, false);
    assert.equal(starts, 2);
    assert.equal(terminations, 2);
  } finally { globalThis.Worker = previous; clearOpenEnaLongitudinalExecutionCacheV3(); }
});

test("a cancelled longitudinal request ignores queued progress before a later request starts", async () => {
  clearOpenEnaLongitudinalExecutionCacheV3();
  const request = await validOpenEnaLongitudinalRequestV3(20, 200);
  const controller = new AbortController(), deliveries: string[] = [];
  let terminated = 0;
  class QueuedTransport {
    onmessage: ((event: { data: OpenEnaLongitudinalWorkerResponseV3 }) => void) | null = null;
    onerror = null;
    postMessage(data: OpenEnaLongitudinalWorkerRequestV3) {
      if (data.kind !== "run") return;
      queueMicrotask(() => {
        this.onmessage?.({ data: { kind: "progress", id: data.id, progress: 0.05, stage: "validate-binding" } });
        this.onmessage?.({ data: { kind: "progress", id: data.id, progress: 0.22, stage: "path-inference-bootstrap" } });
      });
    }
    terminate() { terminated++; }
  }
  const previous = globalThis.Worker; globalThis.Worker = QueuedTransport as unknown as typeof Worker;
  try {
    await assert.rejects(executeOpenEnaLongitudinalPreparedV3(request, { signal: controller.signal, onProgress(value) { deliveries.push(value.stage); controller.abort(); } }), (error: unknown) => error instanceof DOMException && error.name === "AbortError");
    assert.deepEqual(deliveries, ["validate-binding"], "no settled request may invoke a consumer callback again");
    assert.equal(terminated, 1);
  } finally { globalThis.Worker = previous; clearOpenEnaLongitudinalExecutionCacheV3(); }
});
