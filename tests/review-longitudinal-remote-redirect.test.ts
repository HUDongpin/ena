import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type Server, type ServerResponse } from "node:http";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { executeLongitudinalAnalysisV2, type LongitudinalExecutionRequestV2 } from "j-3dena";
import { clearOpenEnaLongitudinalExecutionCacheV3, executeOpenEnaLongitudinalPreparedV3, OpenEnaLongitudinalExecutionClientErrorV3 } from "../lib/open-ena/longitudinal-v3-client";
import { validOpenEnaLongitudinalRequestV3 } from "./helpers/open-ena-longitudinal-v3-fixture";

type Phase = "submission" | "status" | "result" | "artifact" | "deletion";
async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}
async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

// The actual SDK produces the artifact and the client performs its complete
// verifier. The transport is native fetch against an owned loopback server.
const fixture = validOpenEnaLongitudinalRequestV3(500_000, 200).then(async original => {
  const request: LongitudinalExecutionRequestV2 = { ...original, execution: { ...original.execution, target: "persistent-compute-service" } };
  const bundle = await executeLongitudinalAnalysisV2(request);
  const artifact = Buffer.from(JSON.stringify({
    version: "3dena.compute-scientific-longitudinal-result-artifact.v2",
    owner: { contractVersion: "3dena.compute-task-owner.v1", datasetHash: request.pathTask.datasetHash, specHash: request.pathTask.specHash, runId: request.pathTask.runId, taskId: "synthetic-job-1" },
    taskKind: "longitudinal-analysis-v2", requestHash: bundle.identity.requestHash, bundle,
  }));
  return { original, artifact, sha256: createHash("sha256").update(artifact).digest("hex") };
});

async function scenario(redirectPhase: Phase | null, redirectStatus: number, deletionDelayMilliseconds = 0) {
  clearOpenEnaLongitudinalExecutionCacheV3();
  const { original, artifact, sha256 } = await fixture;
  const outside: Array<{ phase: string; method: string; authorization: string | undefined; bodyBytes: number }> = [];
  const received: Phase[] = [];
  const jobId = "synthetic-job-1";
  let origin = "";
  function respond(phase: Phase, response: ServerResponse) {
    const jobUrl = `${origin}/v1/jobs/${jobId}`;
    const expiresAt = "2027-01-01T00:00:00.000Z";
    response.setHeader("content-type", "application/json");
    if (phase === "submission") return response.end(JSON.stringify({
      schemaVersion: "3dena.longitudinal-compute-capability.v2", jobId, capabilityToken: "synthetic-job-bound-token", expiresAt,
      urls: { schemaVersion: "3dena.longitudinal-compute-status-urls.v2", statusUrl: jobUrl, eventsUrl: `${jobUrl}/events`, resultUrl: `${jobUrl}/result`, artifactUrl: `${jobUrl}/artifact`, cancelUrl: jobUrl, deleteUrl: jobUrl },
    }));
    if (phase === "status") return response.end(JSON.stringify({ schemaVersion: "3dena.job-status.v1", jobId, state: "SUCCEEDED", owner: null, progress: null, createdAt: "2026-10-12T04:00:00.000Z", updatedAt: "2026-10-12T04:00:00.000Z", expiresAt, resultAvailable: true, errorCode: null }));
    if (phase === "result") return response.end(JSON.stringify({ schemaVersion: "3dena.job-result-reference.v1", jobId, sha256, byteLength: artifact.length, resultUrl: `${jobUrl}/artifact`, exportUrl: null, expiresAt }));
    if (phase === "artifact") { response.setHeader("x-3dena-result-sha256", sha256); return response.end(artifact); }
    response.end(JSON.stringify({ schemaVersion: "3dena.job-deletion-receipt.v2", jobId, cancelled: false, inputDeleted: true, resultDeleted: true, deletedAt: "2026-10-12T04:00:00.000Z", intentAccepted: true, termination: "observed", capacity: "released", objects: "deleted" }));
  }
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    if (request.url?.startsWith("/outside-job/")) {
      const phase = request.url.slice("/outside-job/".length) as Phase;
      outside.push({ phase, method: request.method ?? "GET", authorization: request.headers.authorization, bodyBytes: Buffer.concat(chunks).length });
      respond(phase, response); return;
    }
    const phase: Phase = request.method === "POST" ? "submission" : request.method === "DELETE" ? "deletion" : request.url?.endsWith("/artifact") ? "artifact" : request.url?.endsWith("/result") ? "result" : "status";
    received.push(phase);
    if (phase === "deletion" && deletionDelayMilliseconds > 0) await delay(deletionDelayMilliseconds);
    if (phase === redirectPhase) { response.statusCode = redirectStatus; response.setHeader("location", `${origin}/outside-job/${phase}`); response.end(); }
    else respond(phase, response);
  });
  origin = await listen(server);
  try {
    // This verifies redirect/binding rules, not a 100 ms timeout edge. Match
    // the other real-HTTP tests' finite scheduling budget, below the 10 s
    // production cleanup default; publication still requires a valid receipt.
    const outcome = await Promise.allSettled([executeOpenEnaLongitudinalPreparedV3(original, { allowRemote: true, remoteEndpoint: `${origin}/api/open-ena/longitudinal`, remotePollIntervalMilliseconds: 1, remoteCleanupDeadlineMilliseconds: 5_000, remoteDeadlineMilliseconds: 15_000 })]);
    return { result: outcome[0]!, outside, received };
  } finally { await close(server); clearOpenEnaLongitudinalExecutionCacheV3(); }
}

for (const phase of ["submission", "status", "result", "artifact", "deletion"] as const) {
  for (const status of [307, 308]) {
    test(`remote ${phase} refuses HTTP ${status} before forwarding a body or job capability`, async () => {
      const { result, outside, received } = await scenario(phase, status);
      assert.ok(received.includes(phase), "the real request must reach the intended phase");
      assert.deepEqual(outside, [], "redirect must not forward any request outside its admitted job path");
      assert.equal(result.status, "rejected");
      if (result.status === "rejected") {
        assert.ok(result.reason instanceof OpenEnaLongitudinalExecutionClientErrorV3);
        const code = phase === "submission" ? "REMOTE_SUBMISSION_FAILED" : phase === "status" ? "REMOTE_POLL_FAILED" : "REMOTE_RESULT_FAILED";
        assert.equal(result.reason.code, code);
      }
    });
  }
}

test("direct remote execution still verifies its actual SDK artifact and deletes the job", async () => {
  const { result, outside, received } = await scenario(null, 307);
  assert.equal(result.status, "fulfilled");
  if (result.status === "fulfilled") assert.equal(result.value.cacheHit, false);
  assert.deepEqual(outside, []);
  assert.deepEqual(received, ["submission", "status", "result", "artifact", "deletion"]);
});

test("redirect verification tolerates a bounded scheduling delay in the genuine deletion response", async () => {
  const { result, outside, received } = await scenario(null, 307, 250);
  assert.equal(result.status, "fulfilled");
  assert.deepEqual(outside, []);
  assert.deepEqual(received, ["submission", "status", "result", "artifact", "deletion"]);
});
