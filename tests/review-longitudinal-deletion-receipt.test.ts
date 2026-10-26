import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import test from "node:test";
import { createAnalysisClient, executeLongitudinalAnalysisV2 } from "j-3dena";
import {
  clearOpenEnaLongitudinalExecutionCacheV3,
  executeOpenEnaLongitudinalPreparedV3,
  OpenEnaLongitudinalExecutionClientErrorV3,
} from "../lib/open-ena/longitudinal-v3-client";
import { validOpenEnaLongitudinalRequestV3 } from "./helpers/open-ena-longitudinal-v3-fixture";

const jobId = "synthetic-deletion-job";
const fixture = validOpenEnaLongitudinalRequestV3(500_000, 200).then(async original => {
  const request = { ...original, execution: { ...original.execution, target: "persistent-compute-service" as const } };
  const bundle = await executeLongitudinalAnalysisV2(request);
  const artifact = Buffer.from(JSON.stringify({
    version: "3dena.compute-scientific-longitudinal-result-artifact.v2",
    owner: { contractVersion: "3dena.compute-task-owner.v1", datasetHash: request.pathTask.datasetHash, specHash: request.pathTask.specHash, runId: request.pathTask.runId, taskId: jobId },
    taskKind: "longitudinal-analysis-v2", requestHash: bundle.identity.requestHash, bundle,
  }));
  return { original, artifact, sha256: createHash("sha256").update(artifact).digest("hex") };
});
const complete = {
  schemaVersion: "3dena.job-deletion-receipt.v2", jobId, cancelled: false,
  inputDeleted: true, resultDeleted: true, deletedAt: "2026-10-12T04:00:00.000Z",
  intentAccepted: true, termination: "observed", capacity: "released", objects: "deleted",
};
const pending = {
  ...complete, inputDeleted: false, resultDeleted: false, deletedAt: null,
  termination: "pending", capacity: "held", objects: "pending",
};

// Real HTTP/native fetch and an actual SDK scientific artifact: malformed
// deletion facts must never authorize publishing or caching the result.
// These cases verify deletion facts and result ownership, not timeout edges.
// Reconciliation waits 250 ms per pending receipt; leave room for HTTP and
// scheduling under the full parallel suite while staying below the 10 s default.
async function withService(run: (context: {
  execute: () => ReturnType<typeof executeOpenEnaLongitudinalPreparedV3>;
  setReceipts: (...receipts: Record<string, unknown>[]) => void;
  sdkDelete: () => Promise<unknown>;
  calls: Array<{ method: string; path: string; deletionKey?: string }>;
}) => Promise<void>, cleanupDeadlineMilliseconds = 5_000) {
  clearOpenEnaLongitudinalExecutionCacheV3();
  const { original, artifact, sha256 } = await fixture;
  let origin = "";
  let receipts: Record<string, unknown>[] = [complete];
  const calls: Array<{ method: string; path: string; deletionKey?: string }> = [];
  const server = createServer(async (request, response: ServerResponse) => {
    for await (const chunk of request) void chunk;
    calls.push({ method: request.method ?? "GET", path: request.url ?? "", deletionKey: request.headers["idempotency-key"] as string | undefined });
    response.setHeader("content-type", "application/json");
    const jobUrl = `${origin}/v1/jobs/${jobId}`;
    const expiresAt = "2027-01-01T00:00:00.000Z";
    if (request.method === "DELETE") {
      const receipt = receipts[0]!;
      if (receipts.length > 1) receipts.shift();
      response.end(JSON.stringify(receipt));
    } else if (request.method === "POST") response.end(JSON.stringify({
      schemaVersion: "3dena.longitudinal-compute-capability.v2", jobId,
      capabilityToken: "synthetic-job-bound-token", expiresAt,
      urls: { schemaVersion: "3dena.longitudinal-compute-status-urls.v2", statusUrl: jobUrl, eventsUrl: `${jobUrl}/events`, resultUrl: `${jobUrl}/result`, artifactUrl: `${jobUrl}/artifact`, cancelUrl: jobUrl, deleteUrl: jobUrl },
    }));
    else if (request.url?.endsWith("/artifact")) { response.setHeader("x-3dena-result-sha256", sha256); response.end(artifact); }
    else if (request.url?.endsWith("/result")) response.end(JSON.stringify({ schemaVersion: "3dena.job-result-reference.v1", jobId, sha256, byteLength: artifact.length, resultUrl: `${jobUrl}/artifact`, exportUrl: null, expiresAt }));
    else response.end(JSON.stringify({ schemaVersion: "3dena.job-status.v1", jobId, state: "SUCCEEDED", owner: null, progress: null, createdAt: "2026-10-12T04:00:00.000Z", updatedAt: "2026-10-12T04:00:00.000Z", expiresAt, resultAvailable: true, errorCode: null }));
  });
  try {
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    origin = `http://127.0.0.1:${address.port}`;
    await run({
      execute: () => executeOpenEnaLongitudinalPreparedV3(original, { allowRemote: true, remoteEndpoint: `${origin}/submit`, remotePollIntervalMilliseconds: 1, remoteCleanupDeadlineMilliseconds: cleanupDeadlineMilliseconds, remoteDeadlineMilliseconds: 15_000 }),
      setReceipts: (...values) => { receipts = values; }, calls,
      sdkDelete: () => createAnalysisClient({ baseUrl: origin, retryMaxAttempts: 1 }).deleteJobV2({ jobId, capabilityToken: "synthetic-job-bound-token" }, "synthetic-oracle-key"),
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    clearOpenEnaLongitudinalExecutionCacheV3();
  }
}

for (const [label, patch] of [
  ["intent was not accepted", { intentAccepted: false }],
  ["unknown termination", { termination: "unobserved" }],
  ["null termination", { termination: null }],
  ["unknown capacity", { capacity: "retained" }],
  ["null capacity", { capacity: null }],
  ["nonboolean cancellation", { cancelled: "false" }],
  ["invalid deletion timestamp", { deletedAt: "not-a-timestamp" }],
  ["empty deletion timestamp", { deletedAt: "" }],
  ["nonboolean input deletion", { inputDeleted: "true" }],
  ["nonboolean result deletion", { resultDeleted: 1 }],
  ["contradictory object facts", { inputDeleted: false }],
  ["deleted objects without timestamp", { deletedAt: null }],
  ["pending objects claiming complete facts", { objects: "pending" }],
  ["unknown object lifecycle", { objects: "forgotten" }],
  ["pending termination without held capacity", { termination: "pending" }],
] as const) {
  test(`remote rejects deletion receipt with ${label}, then permits a fresh successful retry`, async () => {
    await withService(async ({ execute, setReceipts, sdkDelete, calls }) => {
      setReceipts({ ...complete, ...patch });
      await assert.rejects(sdkDelete(), (error: unknown) => !!error && typeof error === "object" && "code" in error && error.code === "INVALID_RESPONSE");
      await assert.rejects(execute(), (error: unknown) => error instanceof OpenEnaLongitudinalExecutionClientErrorV3 && error.code === "REMOTE_RESULT_FAILED");
      setReceipts(complete);
      const beforeRetry = calls.length;
      assert.equal((await execute()).cacheHit, false, "rejected deletion must not populate the completed cache");
      assert.equal(calls.length - beforeRetry, 5, "recovery performs a fresh submission, poll, artifact verification and deletion");
      const beforeCacheHit = calls.length;
      assert.equal((await execute()).cacheHit, true);
      assert.equal(calls.length, beforeCacheHit);
    });
  });
}

for (const termination of ["observed", "not_required"] as const) {
  for (const capacity of ["released", "not_reserved"] as const) {
    test(`valid deletion permits cancelled=false, ${termination} termination and ${capacity} capacity`, async () => {
      await withService(async ({ execute, setReceipts, sdkDelete }) => {
        setReceipts({ ...complete, termination, capacity });
        await sdkDelete();
        assert.equal((await execute()).cacheHit, false);
      });
    });
  }
}

test("valid pending deletion reconciles with the same operation key before publishing", async () => {
  await withService(async ({ execute, setReceipts, calls }) => {
    setReceipts(pending, { ...complete, cancelled: true });
    assert.equal((await execute()).cacheHit, false);
    const deletions = calls.filter(call => call.method === "DELETE");
    assert.equal(deletions.length, 2);
    assert.equal(deletions[0]!.deletionKey, deletions[1]!.deletionKey);
    const beforeCacheHit = calls.length;
    assert.equal((await execute()).cacheHit, true);
    assert.equal(calls.length, beforeCacheHit);
  });
});

test("deleted objects still wait for pending termination and held capacity", async () => {
  await withService(async ({ execute, setReceipts, calls }) => {
    setReceipts(
      { ...pending, termination: "not_required", capacity: "not_reserved" },
      { ...complete, termination: "pending", capacity: "held" },
      { ...complete, capacity: "held" },
      complete,
    );
    assert.equal((await execute()).cacheHit, false);
    const deletions = calls.filter(call => call.method === "DELETE");
    assert.equal(deletions.length, 4);
    assert.equal(new Set(deletions.map(call => call.deletionKey)).size, 1);
  }, 5_000);
});
