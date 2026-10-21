import assert from "node:assert/strict";
import test from "node:test";

import {
  clearOpenEnaLongitudinalExecutionCacheV3,
  executeOpenEnaLongitudinalPreparedV3,
  OpenEnaLongitudinalExecutionClientErrorV3,
} from "../lib/open-ena/longitudinal-v3-client";
import { validOpenEnaLongitudinalRequestV3 } from "./helpers/open-ena-longitudinal-v3-fixture";

const request = validOpenEnaLongitudinalRequestV3(500_000, 200);
const privateMessage = "server detail containing private participant data";

async function rejectedSubmission(response: Response) {
  clearOpenEnaLongitudinalExecutionCacheV3();
  let calls = 0;
  try {
    await executeOpenEnaLongitudinalPreparedV3(await request, {
      allowRemote: true,
      remoteEndpoint: "/api/open-ena/longitudinal",
      fetchImpl: async (_input, options) => {
        calls += 1;
        assert.equal(options?.redirect, "error");
        return response;
      },
    });
    assert.fail("the rejected submission must fail");
  } catch (error) {
    assert.ok(error instanceof OpenEnaLongitudinalExecutionClientErrorV3);
    assert.equal(error.code, "REMOTE_SUBMISSION_FAILED");
    assert.equal(error.canContinueLocally, true);
    assert.equal(error.canDisableInference, true);
    assert.equal(calls, 1, "recovery must never automatically resubmit");
    assert.doesNotMatch(error.message, /private participant data/);
    return error;
  }
}

test("HTTP 401 preserves authentication recovery without exposing the server message", async () => {
  const error = await rejectedSubmission(Response.json({ error: { code: "AUTHENTICATION_REQUIRED", message: privateMessage } }, { status: 401 }));
  assert.equal(error.httpStatus, 401);
  assert.equal(error.serverCode, "AUTHENTICATION_REQUIRED");
  assert.equal(error.recovery, "sign-in");
  assert.equal(error.canRetryRemote, false);
});

test("HTTP 429 retains Retry-After as one fixed retry deadline", async () => {
  const before = Date.now();
  const error = await rejectedSubmission(Response.json({ error: { code: "RATE_LIMITED", message: privateMessage } }, {
    status: 429,
    headers: { "retry-after": "60" },
  }));
  assert.equal(error.httpStatus, 429);
  assert.equal(error.serverCode, "RATE_LIMITED");
  assert.equal(error.recovery, "rate-limit");
  assert.equal(error.canRetryRemote, true);
  assert.equal(error.retryAfterSeconds, 60);
  assert.ok(error.retryNotBefore !== null && error.retryNotBefore >= before + 60_000);
  assert.ok(error.retryNotBefore <= Date.now() + 60_000);
});

for (const [status, code] of [[400, "INVALID_LONGITUDINAL_TASK"], [403, "INVALID_REQUEST_ORIGIN"], [413, "DERIVED_PAYLOAD_TOO_LARGE"]] as const) {
  test(`HTTP ${status} keeps its reason and does not offer a blind remote retry`, async () => {
    const error = await rejectedSubmission(Response.json({ error: { code, message: privateMessage } }, { status }));
    assert.equal(error.httpStatus, status);
    assert.equal(error.serverCode, code);
    assert.equal(error.recovery, "request");
    assert.equal(error.canRetryRemote, false);
  });
}

test("HTTP 503 retains temporary-service recovery and explicit remote retry", async () => {
  const error = await rejectedSubmission(Response.json({ error: { code: "REMOTE_SERVICE_UNAVAILABLE", message: privateMessage } }, { status: 503 }));
  assert.equal(error.httpStatus, 503);
  assert.equal(error.serverCode, "REMOTE_SERVICE_UNAVAILABLE");
  assert.equal(error.recovery, "retry");
  assert.equal(error.canRetryRemote, true);
});

test("Retry-After accepts HTTP dates and rejects invalid or unbounded waits", async () => {
  const future = Math.floor(Date.now() / 1_000) * 1_000 + 120_000;
  const dated = await rejectedSubmission(Response.json({ error: { code: "REMOTE_RATE_LIMITED" } }, {
    status: 429, headers: { "retry-after": new Date(future).toUTCString() },
  }));
  assert.ok(dated.retryAfterSeconds !== null && dated.retryAfterSeconds >= 118 && dated.retryAfterSeconds <= 120);
  for (const value of ["-1", "1.5", "999999999999999999999", "tomorrow", "86401"]) {
    const error = await rejectedSubmission(Response.json({ error: { code: "RATE_LIMITED" } }, { status: 429, headers: { "retry-after": value } }));
    assert.equal(error.retryAfterSeconds, null, value);
    assert.equal(error.retryNotBefore, null, value);
  }
});

for (const body of ["<html>private participant data</html>", '{"error":{"code":"<script>private participant data</script>"}}', '{"error":{"code":42}}', JSON.stringify({ error: { code: "X".repeat(65) } })]) {
  test(`malformed error envelope still preserves HTTP recovery: ${body.slice(0, 24)}`, async () => {
    const error = await rejectedSubmission(new Response(body, { status: 401, headers: { "content-type": body.startsWith("<") ? "text/html" : "application/json" } }));
    assert.equal(error.httpStatus, 401);
    assert.equal(error.serverCode, null);
    assert.equal(error.recovery, "sign-in");
  });
}

test("oversized error metadata is cancelled while HTTP and retry headers survive", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) { controller.enqueue(new Uint8Array(32 * 1024)); },
    cancel() { cancelled = true; },
  });
  const error = await rejectedSubmission(new Response(body, { status: 429, headers: { "content-type": "application/json", "retry-after": "60" } }));
  assert.equal(cancelled, true);
  assert.equal(error.serverCode, null);
  assert.equal(error.httpStatus, 429);
  assert.equal(error.retryAfterSeconds, 60);
});

test("declared oversized error metadata is rejected before reading", async () => {
  let reads = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) { reads += 1; controller.enqueue(new Uint8Array(1)); },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  const error = await rejectedSubmission(new Response(body, { status: 403, headers: { "content-type": "application/json", "content-length": String(64 * 1024 + 1) } }));
  assert.equal(reads, 0);
  assert.equal(cancelled, true);
  assert.equal(error.httpStatus, 403);
  assert.equal(error.canRetryRemote, false);
});

for (const abortBy of ["caller", "deadline"] as const) {
  test(`a stalled error body still obeys ${abortBy} cancellation`, { timeout: 2_000 }, async () => {
    const readStarted = Promise.withResolvers<void>();
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull() { readStarted.resolve(); },
      cancel() { cancelled = true; },
    }, { highWaterMark: 0 });
    const controller = new AbortController();
    const execution = executeOpenEnaLongitudinalPreparedV3(await request, {
      signal: controller.signal,
      allowRemote: true,
      remoteEndpoint: "/api/open-ena/longitudinal",
      remoteDeadlineMilliseconds: abortBy === "deadline" ? 30 : 1_000,
      fetchImpl: async () => new Response(body, { status: 401, headers: { "content-type": "application/json" } }),
    });
    await readStarted.promise;
    if (abortBy === "caller") controller.abort();
    await assert.rejects(execution, (error: unknown) => abortBy === "caller"
      ? error instanceof DOMException && error.name === "AbortError"
      : error instanceof OpenEnaLongitudinalExecutionClientErrorV3 && error.code === "REMOTE_DEADLINE_EXCEEDED");
    assert.equal(cancelled, true);
  });
}

for (const phase of ["status", "result", "artifact"] as const) {
  test(`${phase} HTTP failures retain recovery details and clean up the existing job`, async () => {
    const jobId = "error-recovery-job";
    const jobUrl = `https://compute.example/v1/jobs/${jobId}`;
    const expiresAt = "2027-01-01T00:00:00.000Z";
    const calls: string[] = [];
    await assert.rejects(executeOpenEnaLongitudinalPreparedV3(await request, {
      allowRemote: true,
      remoteEndpoint: "/api/open-ena/longitudinal",
      fetchImpl: async (input, options) => {
        const url = String(input);
        const method = options?.method ?? "GET";
        calls.push(`${method} ${url}`);
        assert.equal(options?.redirect, "error");
        if (method === "POST") return Response.json({
          schemaVersion: "3dena.longitudinal-compute-capability.v2", jobId, capabilityToken: "test-capability", expiresAt,
          urls: { schemaVersion: "3dena.longitudinal-compute-status-urls.v2", statusUrl: jobUrl, eventsUrl: `${jobUrl}/events`, resultUrl: `${jobUrl}/result`, artifactUrl: `${jobUrl}/artifact`, cancelUrl: jobUrl, deleteUrl: jobUrl },
        });
        if (method === "DELETE") return Response.json({
          schemaVersion: "3dena.job-deletion-receipt.v2", jobId, cancelled: false, inputDeleted: true, resultDeleted: true,
          deletedAt: "2026-10-21T00:00:00.000Z", intentAccepted: true, termination: "observed", capacity: "released", objects: "deleted",
        });
        if (url === (phase === "status" ? jobUrl : `${jobUrl}/${phase}`)) {
          return Response.json({ error: { code: "REMOTE_RATE_LIMITED", message: privateMessage } }, { status: 429, headers: { "retry-after": "60" } });
        }
        if (url === jobUrl) return Response.json({
          schemaVersion: "3dena.job-status.v1", jobId, state: "SUCCEEDED", resultAvailable: true, errorCode: null,
          owner: null, progress: null, createdAt: "2026-10-21T00:00:00.000Z", updatedAt: "2026-10-21T00:00:00.000Z", expiresAt,
        });
        assert.equal(url, `${jobUrl}/result`);
        return Response.json({ schemaVersion: "3dena.job-result-reference.v1", jobId, sha256: "a".repeat(64), byteLength: 1, resultUrl: `${jobUrl}/artifact`, exportUrl: null, expiresAt });
      },
    }), (error: unknown) => {
      assert.ok(error instanceof OpenEnaLongitudinalExecutionClientErrorV3);
      assert.equal(error.code, phase === "status" ? "REMOTE_POLL_FAILED" : "REMOTE_RESULT_FAILED");
      assert.equal(error.httpStatus, 429);
      assert.equal(error.serverCode, "REMOTE_RATE_LIMITED");
      assert.equal(error.retryAfterSeconds, 60);
      assert.doesNotMatch(error.message, /private participant data/);
      return true;
    });
    assert.equal(calls.filter((call) => call.startsWith("POST ")).length, 1);
    assert.equal(calls.at(-1), `DELETE ${jobUrl}`);
  });
}
