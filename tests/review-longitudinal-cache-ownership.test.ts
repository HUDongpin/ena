import assert from "node:assert/strict";
import test from "node:test";
import { compileTrajectoryPlotlySpec, createExportBundle, executeLongitudinalAnalysisV2, hashLongitudinalExecutionRequestV2, verifyLongitudinalAnalysisBundleV2 } from "j-3dena";
import { openEnaTrajectoryDisplaySpecV3 } from "../lib/open-ena/longitudinal-v3";
import { clearOpenEnaLongitudinalExecutionCacheV3, executeOpenEnaLongitudinalPreparedV3 } from "../lib/open-ena/longitudinal-v3-client";
import { createOpenEnaLongitudinalWorkerHostV3, type OpenEnaLongitudinalWorkerRequestV3 } from "../lib/open-ena/longitudinal-v3.worker";
import { validOpenEnaLongitudinalRequestV3 } from "./helpers/open-ena-longitudinal-v3-fixture";

// The transport alone is controlled. The real host, SDK executor, immutable
// request hasher and full result verifier all run without dependency overrides.
async function withProductionHost(callback: (counts: { started: number; terminated: number }) => Promise<void>) {
  clearOpenEnaLongitudinalExecutionCacheV3();
  const counts = { started: 0, terminated: 0 };
  class ProductionHostWorker {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: ((event: { message: string }) => void) | null = null;
    private listener: (event: { data: OpenEnaLongitudinalWorkerRequestV3 }) => void = () => {};
    constructor() {
      createOpenEnaLongitudinalWorkerHostV3({
        addEventListener: (_type, listener) => { this.listener = listener; },
        postMessage: (data) => { const captured = structuredClone(data); queueMicrotask(() => this.onmessage?.({ data: captured })); },
      });
    }
    postMessage(data: OpenEnaLongitudinalWorkerRequestV3) { if (data.kind === "run") counts.started++; this.listener({ data: structuredClone(data) }); }
    terminate() { counts.terminated++; }
  }
  const before = globalThis.Worker;
  globalThis.Worker = ProductionHostWorker as unknown as typeof Worker;
  try { await callback(counts); }
  finally { globalThis.Worker = before; clearOpenEnaLongitudinalExecutionCacheV3(); }
}

test("a caller edit after invocation cannot change the request executed under the original cache key", async () => {
  await withProductionHost(async (counts) => {
    const request = await validOpenEnaLongitudinalRequestV3(20, 200);
    const original = structuredClone(request);
    const expectedHash = await hashLongitudinalExecutionRequestV2(original);
    const pending = executeOpenEnaLongitudinalPreparedV3(request);
    request.execution.seed++;
    for (const task of request.inferenceTask?.requests ?? []) if (task.kind === "path-comparison") task.seed = request.execution.seed;
    const first = await pending;
    assert.equal(first.bundle.identity.requestHash, expectedHash);
    assert.equal(first.bundle.execution.seed, original.execution.seed);
    const second = await executeOpenEnaLongitudinalPreparedV3(original);
    assert.equal(second.cacheHit, true);
    assert.equal(second.bundle.identity.requestHash, expectedHash);
    assert.equal(counts.started, 1);
  });
});

test("a returned receipt cannot poison the verified result cache", async () => {
  await withProductionHost(async (counts) => {
    const request = await validOpenEnaLongitudinalRequestV3(20, 200);
    const first = await executeOpenEnaLongitudinalPreparedV3(request);
    const expected = structuredClone(first.bundle);
    Reflect.set(first.bundle.execution, "seed", first.bundle.execution.seed + 1);
    Reflect.set(first.bundle.codeGeometry.nodes[0].coordinates, "0", 1234567);
    const second = await executeOpenEnaLongitudinalPreparedV3(structuredClone(request));
    assert.equal(second.cacheHit, true);
    assert.deepEqual(second.bundle, expected);
    await verifyLongitudinalAnalysisBundleV2(second.bundle);
    assert.equal(counts.started, 1);
  });
});

test("cancellation by final progress notification rejects adoption and does not populate the cache", async () => {
  await withProductionHost(async (counts) => {
    const request = await validOpenEnaLongitudinalRequestV3(20, 200);
    const controller = new AbortController();
    await assert.rejects(executeOpenEnaLongitudinalPreparedV3(request, {
      signal: controller.signal,
      onProgress(value) { if (value.stage === "complete") controller.abort(); },
    }), (error: unknown) => error instanceof DOMException && error.name === "AbortError");
    const retry = await executeOpenEnaLongitudinalPreparedV3(request);
    assert.equal(retry.cacheHit, false);
    assert.equal(counts.started, 2);
    assert.equal(counts.terminated, 2);
  });
});

test("changed seeds create a fresh verified result and unchanged inputs reuse its cache", async () => {
  await withProductionHost(async (counts) => {
    const request = await validOpenEnaLongitudinalRequestV3(20, 200);
    const first = await executeOpenEnaLongitudinalPreparedV3(request);
    const changed = structuredClone(request);
    changed.execution.seed++;
    for (const task of changed.inferenceTask?.requests ?? []) if (task.kind === "path-comparison") task.seed = changed.execution.seed;
    const second = await executeOpenEnaLongitudinalPreparedV3(changed);
    assert.equal(second.cacheHit, false);
    assert.notEqual(first.bundle.identity.requestHash, second.bundle.identity.requestHash);
    assert.equal((await executeOpenEnaLongitudinalPreparedV3(changed)).cacheHit, true);
    assert.equal(counts.started, 2);
  });
});

test("executor aliases cannot mutate the owned bundle during verification or after caching", async () => {
  await withProductionHost(async () => {
    const request = await validOpenEnaLongitudinalRequestV3(20, 200);
    // Structured transport, unlike the direct SDK return, drops Object.freeze.
    const retained = structuredClone(await executeLongitudinalAnalysisV2(request));
    const expected = structuredClone(retained);
    const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    const pending = executeOpenEnaLongitudinalPreparedV3(request, {
      nodeExecutor: async () => retained,
      resultVerifier: async (bundle) => { await verifyLongitudinalAnalysisBundleV2(bundle); started.resolve(); await release.promise; },
    });
    await started.promise;
    assert.equal(Object.isFrozen(retained), false, "taking ownership must not freeze the executor's original object");
    retained.codeGeometry.nodes[0].coordinates[0] = 2345678;
    release.resolve();
    const first = await pending;
    retained.execution.seed++;
    const second = await executeOpenEnaLongitudinalPreparedV3(request);
    assert.equal(second.cacheHit, true);
    assert.equal(first.bundle, second.bundle, "hits reuse one frozen envelope without another full copy");
    assert.deepEqual(first.bundle, expected);
    await verifyLongitudinalAnalysisBundleV2(second.bundle);
  });
});

test("object key order and execution transport do not change scientific cache identity", async () => {
  await withProductionHost(async (counts) => {
    const request = await validOpenEnaLongitudinalRequestV3(20, 200);
    const reverseKeys = (value: unknown): unknown => Array.isArray(value) ? value.map(reverseKeys)
      : value !== null && typeof value === "object" ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverseKeys(child)])) : value;
    const first = await executeOpenEnaLongitudinalPreparedV3(request);
    const reordered = reverseKeys(request) as typeof request;
    reordered.execution.target = "node-service";
    const second = await executeOpenEnaLongitudinalPreparedV3(reordered);
    assert.equal(second.cacheHit, true);
    assert.equal(first.bundle, second.bundle);
    assert.equal(counts.started, 1);
  });
});

test("inference repetitions and selected axis order remain part of scientific request identity", async () => {
  await withProductionHost(async (counts) => {
    const request = await validOpenEnaLongitudinalRequestV3(20, 200);
    const first = await executeOpenEnaLongitudinalPreparedV3(request);
    const hashes = new Set([first.bundle.identity.requestHash]);
    for (const mutation of ["repetitions", "axis-order"] as const) {
      const changed = structuredClone(request);
      if (mutation === "repetitions") for (const task of changed.inferenceTask?.requests ?? []) { if (task.kind === "path-comparison") task.repetitions++; }
      else changed.pathTask.runSpec.selectedDimensions.reverse();
      const expectedHash = await hashLongitudinalExecutionRequestV2(changed);
      const receipt = await executeOpenEnaLongitudinalPreparedV3(changed);
      assert.equal(receipt.cacheHit, false);
      assert.equal(receipt.bundle.identity.requestHash, expectedHash);
      hashes.add(receipt.bundle.identity.requestHash);
      await verifyLongitudinalAnalysisBundleV2(receipt.bundle);
      assert.equal((await executeOpenEnaLongitudinalPreparedV3(changed)).cacheHit, true);
    }
    assert.equal(hashes.size, 3);
    assert.equal(counts.started, 3);
  });
});

test("display and ZIP export consumers preserve the frozen cache envelope", async () => {
  await withProductionHost(async () => {
    const request = await validOpenEnaLongitudinalRequestV3(20, 200);
    const receipt = await executeOpenEnaLongitudinalPreparedV3(request);
    const before = JSON.stringify(receipt.bundle);
    const displaySpec = openEnaTrajectoryDisplaySpecV3(receipt.bundle);
    const plot = compileTrajectoryPlotlySpec(receipt.bundle, displaySpec);
    assert.ok(plot.data.length > 0);
    const exported = await createExportBundle(receipt.bundle, { displaySpec });
    assert.ok(exported.bytes.length > 0);
    assert.ok(exported.files.some(file => file.path.endsWith("analysis.json")));
    assert.equal(JSON.stringify(receipt.bundle), before);
    assert.equal((await executeOpenEnaLongitudinalPreparedV3(request)).cacheHit, true);
  });
});
