import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createOpenEnaLongitudinalPostHandlerV3 } from "../lib/server/open-ena-longitudinal-route";
import { clearOpenEnaLongitudinalExecutionCacheV3, executeOpenEnaLongitudinalPreparedV3 } from "../lib/open-ena/longitudinal-v3-client";
import { validOpenEnaLongitudinalRequestV3 } from "./helpers/open-ena-longitudinal-v3-fixture";

const publicOrigin = "https://review.invalid";
const endpoint = `${publicOrigin}/api/open-ena/longitudinal`;
const serviceToken = "synthetic-job-binding-service-token";
const fields = ["statusUrl", "eventsUrl", "resultUrl", "artifactUrl", "cancelUrl", "deleteUrl"] as const;
function capability(origin: string, jobId = "job-1") {
  const path = `${origin}/v1/jobs/${jobId}`;
  return { schemaVersion: "3dena.longitudinal-compute-capability.v2", jobId, capabilityToken: "synthetic-job-capability-token", expiresAt: "2027-01-01T00:00:00Z", urls: { schemaVersion: "3dena.longitudinal-compute-status-urls.v2", statusUrl: path, eventsUrl: `${path}/events`, resultUrl: `${path}/result`, artifactUrl: `${path}/artifact`, cancelUrl: path, deleteUrl: path } };
}
function handler(origin: string, upstreamFetch?: typeof fetch) {
  return createOpenEnaLongitudinalPostHandlerV3({ environment: { OPEN_ENA_PUBLIC_ORIGIN: publicOrigin, OPEN_ENA_LONGITUDINAL_COMPUTE_URL: origin, OPEN_ENA_LONGITUDINAL_COMPUTE_TOKEN: serviceToken }, verifyPrincipal: () => ({ principalRef: "synthetic-job-principal" }), consumeQuota: () => true, ...(upstreamFetch ? { upstreamFetch } : {}) });
}
async function incoming() {
  const request = await validOpenEnaLongitudinalRequestV3(20, 200);
  request.execution.target = "persistent-compute-service";
  return new Request(endpoint, { method: "POST", headers: { origin: publicOrigin }, body: JSON.stringify({ schemaVersion: "3dena.open-ena-longitudinal-remote-submit.v3", processingPolicyConfirmed: true, executionAttemptId: "attempt-0123456789abcdef0123456789abcdef", request }) });
}

for (const field of fields) {
  test(`server rejects ${field} whose job path only shares the declared job ID prefix`, async () => {
    for (const wrongId of ["job-10", "job-1-other", "job-1%2Fother"]) {
      const value = capability("https://compute.invalid");
      value.urls[field] = value.urls[field].replace("/jobs/job-1", `/jobs/${wrongId}`);
      const response = await handler("https://compute.invalid", async () => Response.json(value, { status: 202 }))(await incoming());
      assert.equal(response.status, 502, `${field} must bind one complete job ID path segment: ${wrongId}`);
      assert.equal((await response.json() as { error: { code: string } }).error.code, "INVALID_UPSTREAM_RESPONSE");
    }
  });
}

test("server accepts complete legal job IDs including punctuation and scoped child paths", async () => {
  for (const jobId of ["job-1", "job-10", "job.1", "a_b~c"]) {
    const value = capability("https://compute.invalid", jobId);
    assert.equal((await handler("https://compute.invalid", async () => Response.json(value, { status: 202 }))(await incoming())).status, 202);
  }
});

async function listen(callback: (request: IncomingMessage, response: ServerResponse) => void) {
  const server = createServer(callback);
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); } };
}

function failedStatus() {
  return { schemaVersion: "3dena.job-status.v1", jobId: "job-1", state: "FAILED", owner: null, progress: { phase: "failed", completed: 0, total: 1 }, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:01Z", expiresAt: "2027-01-01T00:00:00Z", resultAvailable: false, errorCode: "SYNTHETIC_FAILURE" };
}
function deletion() {
  return { schemaVersion: "3dena.job-deletion-receipt.v2", jobId: "job-1", cancelled: false, inputDeleted: true, resultDeleted: true, deletedAt: "2026-10-01T00:00:02Z", intentAccepted: true, termination: "observed", capacity: "released", objects: "deleted" };
}

for (const throughActualRoute of [false, true]) {
  test(`client cannot DELETE another job through a prefix-matched capability (${throughActualRoute ? "actual route" : "client boundary"})`, async () => {
    clearOpenEnaLongitudinalExecutionCacheV3();
    const calls: Array<{ method: string | undefined; path: string | undefined }> = [];
    const server = await listen((request, response) => {
      calls.push({ method: request.method, path: request.url });
      if (request.method === "POST") {
        const value = capability(server.origin);
        value.urls.deleteUrl = `${server.origin}/v1/jobs/job-10`;
        response.writeHead(202, { "content-type": "application/json" }).end(JSON.stringify(value));
      } else response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(request.method === "DELETE" ? deletion() : failedStatus()));
    });
    try {
      const value = capability(server.origin);
      value.urls.deleteUrl = `${server.origin}/v1/jobs/job-10`;
      const route = handler(server.origin);
      const fetchImpl: typeof fetch = async (input, init) => {
        if (String(input) === endpoint) {
          if (!throughActualRoute) return Response.json(value, { status: 202 });
          const headers = new Headers(init?.headers); headers.set("origin", publicOrigin);
          return route(new Request(endpoint, { ...init, headers }));
        }
        assert.equal(new URL(String(input)).origin, server.origin, "test traffic remains on its owned loopback origin");
        return fetch(input, init);
      };
      await assert.rejects(executeOpenEnaLongitudinalPreparedV3(await validOpenEnaLongitudinalRequestV3(500_000, 10_000), { allowRemote: true, remoteEndpoint: endpoint, fetchImpl, remoteCleanupDeadlineMilliseconds: 100, remotePollIntervalMilliseconds: 1 }));
      assert.deepEqual(calls, throughActualRoute ? [{ method: "POST", path: "/v2/longitudinal-jobs" }] : [], "invalid capability must be rejected before any control request, particularly another job's DELETE");
    } finally { await server.close(); clearOpenEnaLongitudinalExecutionCacheV3(); }
  });
}

test("client still polls and deletes the correctly bound job on a genuine terminal failure", async () => {
  clearOpenEnaLongitudinalExecutionCacheV3();
  const calls: string[] = [];
  const server = await listen((request, response) => { calls.push(`${request.method} ${request.url}`); response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(request.method === "DELETE" ? deletion() : failedStatus())); });
  try {
    // Verify job binding, with room for native HTTP scheduling in parallel suites.
    // This finite cleanup budget remains below the production 10-second default.
    await assert.rejects(executeOpenEnaLongitudinalPreparedV3(await validOpenEnaLongitudinalRequestV3(500_000, 10_000), { allowRemote: true, remoteEndpoint: endpoint, remoteCleanupDeadlineMilliseconds: 5_000, fetchImpl: (input, init) => String(input) === endpoint ? Promise.resolve(Response.json(capability(server.origin), { status: 202 })) : fetch(input, init) }));
    assert.deepEqual(calls, ["GET /v1/jobs/job-1", "DELETE /v1/jobs/job-1"]);
  } finally { await server.close(); clearOpenEnaLongitudinalExecutionCacheV3(); }
});
