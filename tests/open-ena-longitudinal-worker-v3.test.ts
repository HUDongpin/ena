import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  hashLongitudinalExecutionRequestV2,
  type LongitudinalAnalysisBundleV2,
  type LongitudinalExecutionRequestV2,
} from "j-3dena";

import {
  createOpenEnaLongitudinalWorkerHostV3,
  type OpenEnaLongitudinalWorkerRequestV3,
  type OpenEnaLongitudinalWorkerResponseV3,
} from "../lib/open-ena/longitudinal-v3.worker";
import {
  OpenEnaLongitudinalExecutionClientErrorV3,
  clearOpenEnaLongitudinalExecutionCacheV3,
  estimateOpenEnaLongitudinalExecutionV3,
  executeOpenEnaLongitudinalPreparedV3,
} from "../lib/open-ena/longitudinal-v3-client";
import { validOpenEnaLongitudinalRequestV3 } from "./helpers/open-ena-longitudinal-v3-fixture";

async function fakeBundle(request: LongitudinalExecutionRequestV2): Promise<LongitudinalAnalysisBundleV2> {
  const requestHash = await hashLongitudinalExecutionRequestV2(request);
  return {
    schemaVersion: "3dena.longitudinal-analysis-bundle.v2",
    identity: {
      datasetHash: request.pathTask.datasetHash,
      specHash: request.pathTask.specHash,
      sourceResultHash: request.pathTask.runSpec.sourceResultHash,
      requestHash,
      resultHash: "5".repeat(64),
      runId: request.pathTask.runId,
      jenaBuildId: `jena-js@${request.execution.jenaVersion}+${request.execution.jenaCommit}:${request.execution.buildId}`,
    },
    runSpec: request.pathTask.runSpec,
    model: { type: "SeparateTrajectory", fullRotationDimensions: ["SVD1", "SVD2", "SVD3"], selectedDimensions: ["SVD1", "SVD2", "SVD3"] },
    paths: [],
    inference: (request.inferenceTask?.requests ?? []).filter((item) => item.kind !== "path-comparison").map(() => ({} as never)),
    pathComparisons: (request.inferenceTask?.requests ?? []).filter((item) => item.kind === "path-comparison").map(() => ({} as never)),
    bootstrap: [],
    codeGeometry: {
      schemaVersion: "3dena.longitudinal-code-geometry.v2",
      dimensions: ["SVD1", "SVD2", "SVD3"],
      nodes: [],
    },
    networkOverlays: [], diagnostics: [],
    execution: {
      target: request.execution.target,
      jenaVersion: request.execution.jenaVersion,
      jenaCommit: request.execution.jenaCommit,
      jenaTarballIntegrity: request.execution.jenaTarballIntegrity,
      sdkVersion: request.execution.sdkVersion,
      buildId: request.execution.buildId,
      seed: request.execution.seed,
      permutationPlanHashes: [],
      resamplingPlanHashes: [],
      evidenceStatus: "IMPLEMENTED_UNVERIFIED",
    },
  };
}

function remoteCapability(jobId: string) {
  const jobUrl = `https://compute.example/v1/jobs/${jobId}`;
  return {
    jobUrl,
    value: {
      schemaVersion: "3dena.longitudinal-compute-capability.v2",
      jobId,
      capabilityToken: `capability-token-not-secret-${jobId}`,
      urls: {
        schemaVersion: "3dena.longitudinal-compute-status-urls.v2",
        statusUrl: jobUrl,
        eventsUrl: `${jobUrl}/events`,
        resultUrl: `${jobUrl}/result`,
        artifactUrl: `${jobUrl}/artifact`,
        cancelUrl: jobUrl,
        deleteUrl: jobUrl,
      },
      expiresAt: "2026-08-25T00:00:00.000Z",
    },
  };
}

function remoteStatus(
  capability: ReturnType<typeof remoteCapability>["value"],
  state: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "EXPIRED",
  errorCode: string | null = null,
) {
  return {
    schemaVersion: "3dena.job-status.v1",
    jobId: capability.jobId,
    state,
    owner: null,
    progress: { phase: state.toLowerCase(), completed: state === "SUCCEEDED" ? 1 : 0, total: 1 },
    createdAt: "2026-08-24T12:00:00.000Z",
    updatedAt: "2026-08-24T12:00:01.000Z",
    expiresAt: capability.expiresAt,
    resultAvailable: state === "SUCCEEDED",
    errorCode,
  };
}

function remoteDeletionReceipt(jobId: string) {
  return {
    schemaVersion: "3dena.job-deletion-receipt.v2",
    jobId,
    cancelled: false,
    inputDeleted: true,
    resultDeleted: true,
    deletedAt: "2026-08-24T12:00:02.000Z",
    intentAccepted: true,
    termination: "observed",
    capacity: "released",
    objects: "deleted",
  };
}

function isRecoverableRemoteFailure(error: unknown, code: string): boolean {
  return error instanceof OpenEnaLongitudinalExecutionClientErrorV3
    && error.code === code
    && error.decision.target === "persistent-compute-service"
    && error.canContinueLocally
    && error.canDisableInference;
}

async function successfulRemoteTransport(
  request: LongitudinalExecutionRequestV2,
  jobId: string,
): Promise<{ fetchMock: typeof fetch; deletionCount: () => number }> {
  const { value: capability, jobUrl } = remoteCapability(jobId);
  const persistentRequest = {
    ...request,
    execution: { ...request.execution, target: "persistent-compute-service" as const },
  };
  const bundle = await fakeBundle(persistentRequest);
  const artifact = {
    version: "3dena.compute-scientific-longitudinal-result-artifact.v2",
    owner: {
      contractVersion: "3dena.compute-task-owner.v1",
      datasetHash: request.pathTask.datasetHash,
      specHash: request.pathTask.specHash,
      runId: request.pathTask.runId,
      taskId: jobId,
    },
    taskKind: "longitudinal-analysis-v2",
    requestHash: bundle.identity.requestHash,
    bundle,
  };
  const artifactBytes = new TextEncoder().encode(JSON.stringify(artifact));
  const artifactSha = createHash("sha256").update(artifactBytes).digest("hex");
  let deletionCalls = 0;
  const fetchMock: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url === "/api/open-ena/longitudinal" && method === "POST") return Response.json(capability, { status: 202 });
    if (url === jobUrl && method === "GET") return Response.json(remoteStatus(capability, "SUCCEEDED"));
    if (url === `${jobUrl}/result` && method === "GET") return Response.json({
      schemaVersion: "3dena.job-result-reference.v1",
      jobId,
      sha256: artifactSha,
      byteLength: artifactBytes.byteLength,
      resultUrl: "https://blob.example/result.json",
      exportUrl: null,
      expiresAt: capability.expiresAt,
    });
    if (url === `${jobUrl}/artifact` && method === "GET") return new Response(artifactBytes, {
      status: 200,
      headers: { "x-3dena-result-sha256": artifactSha, "content-type": "application/json" },
    });
    if (url === jobUrl && method === "DELETE") {
      deletionCalls += 1;
      return Response.json(remoteDeletionReceipt(jobId));
    }
    return new Response(null, { status: 404 });
  };
  return { fetchMock, deletionCount: () => deletionCalls };
}

test("Worker V3 posts ordered progress and exactly one result for one immutable request", async () => {
  const listeners: Array<(event: { data: OpenEnaLongitudinalWorkerRequestV3 }) => void> = [];
  const responses: OpenEnaLongitudinalWorkerResponseV3[] = [];
  const request = await validOpenEnaLongitudinalRequestV3();
  createOpenEnaLongitudinalWorkerHostV3({
    addEventListener: (_type, listener) => listeners.push(listener),
    postMessage: (message) => responses.push(message),
  }, { execute: async (input) => fakeBundle(input) });
  listeners[0]!({ data: { kind: "run", id: "one", request } });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(responses.filter((message) => message.kind === "progress").map((message) => message.progress), [0.05, 0.22, 0.96]);
  assert.equal(responses.filter((message) => message.kind === "result").length, 1);
  assert.equal(responses.at(-1)?.kind, "result");
});

test("Worker V3 suppresses a late scientific result after cancellation", async () => {
  const listeners: Array<(event: { data: OpenEnaLongitudinalWorkerRequestV3 }) => void> = [];
  const responses: OpenEnaLongitudinalWorkerResponseV3[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  createOpenEnaLongitudinalWorkerHostV3({
    addEventListener: (_type, listener) => listeners.push(listener),
    postMessage: (message) => responses.push(message),
  }, { execute: async (input) => { await gate; return fakeBundle(input); } });
  listeners[0]!({ data: { kind: "run", id: "cancelled", request: await validOpenEnaLongitudinalRequestV3() } });
  listeners[0]!({ data: { kind: "cancel", id: "cancelled" } });
  release();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(responses.some((message) => message.kind === "result"), false);
  assert.equal(responses.at(-1)?.kind, "cancelled");
});

test("router keeps bounded work local and requires explicit confirmation above either budget", async () => {
  const local = estimateOpenEnaLongitudinalExecutionV3(await validOpenEnaLongitudinalRequestV3(20, 200));
  assert.equal(local.target, "browser-worker");
  assert.equal(local.requiresConfirmation, false);
  const remote = estimateOpenEnaLongitudinalExecutionV3(await validOpenEnaLongitudinalRequestV3(500_000, 10_000));
  assert.equal(remote.target, "persistent-compute-service");
  assert.equal(remote.requiresConfirmation, true);
  assert.ok(remote.predictedMilliseconds > 8_000 || remote.predictedMemoryBytes > 128 * 1024 * 1024);
  assert.equal(remote.remotePayload.rawRows, false);
  assert.equal(remote.remotePayload.identities, "opaque-participant-tokens");
});

test("remote route never submits without confirmation and offers explicit local fallback", async () => {
  clearOpenEnaLongitudinalExecutionCacheV3();
  const request = await validOpenEnaLongitudinalRequestV3(500_000, 10_000);
  await assert.rejects(
    executeOpenEnaLongitudinalPreparedV3(request, { allowRemote: false }),
    (error: unknown) => error instanceof OpenEnaLongitudinalExecutionClientErrorV3
      && error.code === "REMOTE_CONFIRMATION_REQUIRED"
      && error.canContinueLocally
      && /disable inference\./u.test(error.message)
      && !/uncertainty/iu.test(error.message),
  );
});

test("scientific request cache ignores no display state and returns the same immutable envelope", async () => {
  clearOpenEnaLongitudinalExecutionCacheV3();
  const request = await validOpenEnaLongitudinalRequestV3(20, 200);
  let executions = 0;
  const executor = async (input: LongitudinalExecutionRequestV2) => {
    executions += 1;
    return fakeBundle(input);
  };
  const first = await executeOpenEnaLongitudinalPreparedV3(request, { forceLocal: true, nodeExecutor: executor, resultVerifier: async () => {} });
  const second = await executeOpenEnaLongitudinalPreparedV3(structuredClone(request), { forceLocal: true, nodeExecutor: executor, resultVerifier: async () => {} });
  assert.equal(executions, 1);
  assert.equal(first.bundle.identity.resultHash, second.bundle.identity.resultHash);
  assert.equal(first.cacheHit, false);
  assert.equal(second.cacheHit, true);
});

test("result binding requires the canonical jENA plus SDK build identity", async () => {
  clearOpenEnaLongitudinalExecutionCacheV3();
  const request = await validOpenEnaLongitudinalRequestV3(20, 200);
  const malformed = await fakeBundle(request);
  malformed.identity.jenaBuildId = request.execution.buildId;
  await assert.rejects(
    executeOpenEnaLongitudinalPreparedV3(request, {
      forceLocal: true,
      nodeExecutor: async () => malformed,
      resultVerifier: async () => {},
    }),
    /mismatched immutable binding/u,
  );
});

test("remote execution queues, polls, verifies the immutable artifact, and closes durable deletion", async () => {
  clearOpenEnaLongitudinalExecutionCacheV3();
  const request = await validOpenEnaLongitudinalRequestV3(500_000, 10_000);
  const persistentRequest = {
    ...request,
    execution: { ...request.execution, target: "persistent-compute-service" as const },
  };
  const bundle = await fakeBundle(persistentRequest);
  const artifact = {
    version: "3dena.compute-scientific-longitudinal-result-artifact.v2",
    owner: {
      contractVersion: "3dena.compute-task-owner.v1",
      datasetHash: request.pathTask.datasetHash,
      specHash: request.pathTask.specHash,
      runId: request.pathTask.runId,
      taskId: "job-remote-1",
    },
    taskKind: "longitudinal-analysis-v2",
    requestHash: bundle.identity.requestHash,
    bundle,
  };
  const artifactBytes = new TextEncoder().encode(JSON.stringify(artifact));
  const artifactSha = createHash("sha256").update(artifactBytes).digest("hex");
  const jobUrl = "https://compute.example/v1/jobs/job-remote-1";
  const capability = {
    schemaVersion: "3dena.longitudinal-compute-capability.v2",
    jobId: "job-remote-1",
    capabilityToken: "capability-token-not-secret-remote-1",
    urls: {
      schemaVersion: "3dena.longitudinal-compute-status-urls.v2",
      statusUrl: jobUrl,
      eventsUrl: `${jobUrl}/events`,
      resultUrl: `${jobUrl}/result`,
      artifactUrl: `${jobUrl}/artifact`,
      cancelUrl: jobUrl,
      deleteUrl: jobUrl,
    },
    expiresAt: "2026-08-25T00:00:00.000Z",
  };
  const calls: Array<{ url: string; method: string; headers: Headers; body: string | null }> = [];
  let statusPolls = 0;
  let deletionPolls = 0;
  const fetchMock: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, headers: new Headers(init?.headers), body: typeof init?.body === "string" ? init.body : null });
    if (url === "/api/open-ena/longitudinal" && method === "POST") return Response.json(capability, { status: 202 });
    if (url === jobUrl && method === "GET") {
      statusPolls += 1;
      return Response.json({
        schemaVersion: "3dena.job-status.v1",
        jobId: capability.jobId,
        state: statusPolls === 1 ? "QUEUED" : "SUCCEEDED",
        owner: artifact.owner,
        progress: { phase: statusPolls === 1 ? "queued" : "succeeded", completed: statusPolls === 1 ? 0 : 1, total: 1 },
        createdAt: "2026-08-24T12:00:00.000Z",
        updatedAt: "2026-08-24T12:00:01.000Z",
        expiresAt: capability.expiresAt,
        resultAvailable: statusPolls > 1,
        errorCode: null,
      });
    }
    if (url === `${jobUrl}/result`) return Response.json({
      schemaVersion: "3dena.job-result-reference.v1",
      jobId: capability.jobId,
      sha256: artifactSha,
      byteLength: artifactBytes.byteLength,
      resultUrl: "https://blob.example/result.json",
      exportUrl: null,
      expiresAt: capability.expiresAt,
    });
    if (url === `${jobUrl}/artifact`) return new Response(artifactBytes, {
      status: 200,
      headers: { "x-3dena-result-sha256": artifactSha, "content-type": "application/json" },
    });
    if (url === jobUrl && method === "DELETE") {
      deletionPolls += 1;
      return Response.json({
        schemaVersion: "3dena.job-deletion-receipt.v2",
        jobId: capability.jobId,
        cancelled: false,
        inputDeleted: deletionPolls > 1,
        resultDeleted: deletionPolls > 1,
        deletedAt: deletionPolls > 1 ? "2026-08-24T12:00:02.000Z" : null,
        intentAccepted: true,
        termination: deletionPolls > 1 ? "observed" : "pending",
        capacity: deletionPolls > 1 ? "released" : "held",
        objects: deletionPolls > 1 ? "deleted" : "pending",
      }, { status: deletionPolls > 1 ? 200 : 202 });
    }
    return new Response(null, { status: 404 });
  };
  const progress: number[] = [];
  const receipt = await executeOpenEnaLongitudinalPreparedV3(request, {
    allowRemote: true,
    remoteEndpoint: "/api/open-ena/longitudinal",
    fetchImpl: fetchMock,
    remotePollIntervalMilliseconds: 1,
    remoteCleanupDeadlineMilliseconds: 1_000,
    resultVerifier: async () => {},
    onProgress: (value) => progress.push(value.progress),
  });

  assert.equal(receipt.bundle.execution.target, "persistent-compute-service");
  assert.equal(statusPolls, 2);
  assert.equal(deletionPolls, 2);
  assert.ok(progress.includes(0.15));
  const submitted = JSON.parse(calls[0]!.body!) as Record<string, unknown>;
  assert.equal(submitted.schemaVersion, "3dena.open-ena-longitudinal-remote-submit.v3");
  assert.match(String(submitted.executionAttemptId), /^attempt-[a-f0-9]{32}$/u);
  assert.equal(submitted.processingPolicyConfirmed, true);
  assert.equal(Object.hasOwn(submitted, "rawRows"), false);
  const deleteCalls = calls.filter((call) => call.method === "DELETE");
  assert.equal(deleteCalls.length, 2);
  assert.equal(deleteCalls[0]!.headers.get("idempotency-key"), deleteCalls[1]!.headers.get("idempotency-key"));
  assert.equal(deleteCalls[0]!.headers.get("accept"), "application/vnd.3dena.job-deletion-receipt.v2+json");
});

test("remote cancellation sends one durable DELETE intent with a stable operation key", async () => {
  clearOpenEnaLongitudinalExecutionCacheV3();
  const request = await validOpenEnaLongitudinalRequestV3(500_000, 10_000);
  const controller = new AbortController();
  const jobUrl = "https://compute.example/v1/jobs/job-cancel-1";
  const capability = {
    schemaVersion: "3dena.longitudinal-compute-capability.v2",
    jobId: "job-cancel-1",
    capabilityToken: "capability-token-not-secret-cancel-1",
    urls: {
      schemaVersion: "3dena.longitudinal-compute-status-urls.v2",
      statusUrl: jobUrl,
      eventsUrl: `${jobUrl}/events`,
      resultUrl: `${jobUrl}/result`,
      artifactUrl: `${jobUrl}/artifact`,
      cancelUrl: jobUrl,
      deleteUrl: jobUrl,
    },
    expiresAt: "2026-08-25T00:00:00.000Z",
  };
  const deletionKeys: string[] = [];
  const fetchMock: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url === "/api/open-ena/longitudinal" && method === "POST") return Response.json(capability, { status: 202 });
    if (url === jobUrl && method === "GET") {
      controller.abort();
      return Response.json({
        schemaVersion: "3dena.job-status.v1",
        jobId: capability.jobId,
        state: "RUNNING",
        owner: null,
        progress: { phase: "running", completed: 0, total: 1 },
        createdAt: "2026-08-24T12:00:00.000Z",
        updatedAt: "2026-08-24T12:00:01.000Z",
        expiresAt: capability.expiresAt,
        resultAvailable: false,
        errorCode: null,
      });
    }
    if (url === jobUrl && method === "DELETE") {
      deletionKeys.push(new Headers(init?.headers).get("idempotency-key") ?? "");
      return Response.json({
        schemaVersion: "3dena.job-deletion-receipt.v2",
        jobId: capability.jobId,
        cancelled: true,
        inputDeleted: true,
        resultDeleted: true,
        deletedAt: "2026-08-24T12:00:02.000Z",
        intentAccepted: true,
        termination: "observed",
        capacity: "released",
        objects: "deleted",
      });
    }
    return new Response(null, { status: 404 });
  };

  await assert.rejects(
    executeOpenEnaLongitudinalPreparedV3(request, {
      allowRemote: true,
      remoteEndpoint: "/api/open-ena/longitudinal",
      fetchImpl: fetchMock,
      signal: controller.signal,
      remotePollIntervalMilliseconds: 1,
      resultVerifier: async () => {},
    }),
    (error: unknown) => error instanceof DOMException && error.name === "AbortError",
  );
  assert.deepEqual(deletionKeys, ["open-ena-delete-job-cancel-1"]);
});

test("remote POST 503 is a typed recoverable submission failure", async () => {
  clearOpenEnaLongitudinalExecutionCacheV3();
  const request = await validOpenEnaLongitudinalRequestV3(500_000, 10_000);
  let deleteCalls = 0;
  const fetchMock: typeof fetch = async (_input, init) => {
    if ((init?.method ?? "GET") === "DELETE") deleteCalls += 1;
    return new Response("temporarily unavailable", { status: 503 });
  };

  await assert.rejects(
    executeOpenEnaLongitudinalPreparedV3(request, {
      allowRemote: true,
      remoteEndpoint: "/api/open-ena/longitudinal",
      fetchImpl: fetchMock,
      resultVerifier: async () => {},
    }),
    (error: unknown) => isRecoverableRemoteFailure(error, "REMOTE_SUBMISSION_FAILED")
      && /HTTP 503/u.test((error as Error).message),
  );
  assert.equal(deleteCalls, 0, "no durable job exists before a capability is issued");
});

test("remote poll network failure is typed and still closes durable deletion", async () => {
  clearOpenEnaLongitudinalExecutionCacheV3();
  const request = await validOpenEnaLongitudinalRequestV3(500_000, 10_000);
  const { value: capability, jobUrl } = remoteCapability("job-poll-network-1");
  let deleteCalls = 0;
  const fetchMock: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url === "/api/open-ena/longitudinal" && method === "POST") return Response.json(capability, { status: 202 });
    if (url === jobUrl && method === "GET") throw new TypeError("fetch failed");
    if (url === jobUrl && method === "DELETE") {
      deleteCalls += 1;
      return Response.json(remoteDeletionReceipt(capability.jobId));
    }
    return new Response(null, { status: 404 });
  };

  await assert.rejects(
    executeOpenEnaLongitudinalPreparedV3(request, {
      allowRemote: true,
      remoteEndpoint: "/api/open-ena/longitudinal",
      fetchImpl: fetchMock,
      remotePollIntervalMilliseconds: 1,
      resultVerifier: async () => {},
    }),
    (error: unknown) => isRecoverableRemoteFailure(error, "REMOTE_POLL_FAILED")
      && /fetch failed/u.test((error as Error).message),
  );
  assert.equal(deleteCalls, 1);
});

for (const [state, code] of [
  ["FAILED", "REMOTE_TERMINAL_FAILED"],
  ["EXPIRED", "REMOTE_TERMINAL_EXPIRED"],
] as const) {
  test(`remote terminal ${state} is typed and still closes durable deletion`, async () => {
    clearOpenEnaLongitudinalExecutionCacheV3();
    const request = await validOpenEnaLongitudinalRequestV3(500_000, 10_000);
    const { value: capability, jobUrl } = remoteCapability(`job-terminal-${state.toLowerCase()}-1`);
    let deleteCalls = 0;
    const fetchMock: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/api/open-ena/longitudinal" && method === "POST") return Response.json(capability, { status: 202 });
      if (url === jobUrl && method === "GET") {
        return Response.json(remoteStatus(capability, state, `${state}_FIXTURE`));
      }
      if (url === jobUrl && method === "DELETE") {
        deleteCalls += 1;
        return Response.json(remoteDeletionReceipt(capability.jobId));
      }
      return new Response(null, { status: 404 });
    };

    await assert.rejects(
      executeOpenEnaLongitudinalPreparedV3(request, {
        allowRemote: true,
        remoteEndpoint: "/api/open-ena/longitudinal",
        fetchImpl: fetchMock,
        remotePollIntervalMilliseconds: 1,
        resultVerifier: async () => {},
      }),
      (error: unknown) => isRecoverableRemoteFailure(error, code)
        && (error as Error).message.includes(`${state}_FIXTURE`),
    );
    assert.equal(deleteCalls, 1);
  });
}

test("remote result-reference failure is typed and still closes durable deletion", async () => {
  clearOpenEnaLongitudinalExecutionCacheV3();
  const request = await validOpenEnaLongitudinalRequestV3(500_000, 10_000);
  const { value: capability, jobUrl } = remoteCapability("job-result-failure-1");
  let deleteCalls = 0;
  const fetchMock: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url === "/api/open-ena/longitudinal" && method === "POST") return Response.json(capability, { status: 202 });
    if (url === jobUrl && method === "GET") return Response.json(remoteStatus(capability, "SUCCEEDED"));
    if (url === `${jobUrl}/result` && method === "GET") return new Response("upstream failed", { status: 503 });
    if (url === jobUrl && method === "DELETE") {
      deleteCalls += 1;
      return Response.json(remoteDeletionReceipt(capability.jobId));
    }
    return new Response(null, { status: 404 });
  };

  await assert.rejects(
    executeOpenEnaLongitudinalPreparedV3(request, {
      allowRemote: true,
      remoteEndpoint: "/api/open-ena/longitudinal",
      fetchImpl: fetchMock,
      resultVerifier: async () => {},
    }),
    (error: unknown) => isRecoverableRemoteFailure(error, "REMOTE_RESULT_FAILED")
      && /HTTP 503/u.test((error as Error).message),
  );
  assert.equal(deleteCalls, 1);
});

test("remote bundle verifier failure is typed after the durable job is deleted", async () => {
  clearOpenEnaLongitudinalExecutionCacheV3();
  const request = await validOpenEnaLongitudinalRequestV3(500_000, 10_000);
  const transport = await successfulRemoteTransport(request, "job-result-verifier-1");
  await assert.rejects(
    executeOpenEnaLongitudinalPreparedV3(request, {
      allowRemote: true,
      remoteEndpoint: "/api/open-ena/longitudinal",
      fetchImpl: transport.fetchMock,
      resultVerifier: async () => { throw new Error("bundle schema rejected"); },
    }),
    (error: unknown) => isRecoverableRemoteFailure(error, "REMOTE_RESULT_FAILED")
      && /bundle schema rejected/u.test((error as Error).message),
  );
  assert.equal(transport.deletionCount(), 1);
});

test("remote hard deadline uses the controllable seam, is typed, and still deletes", async () => {
  clearOpenEnaLongitudinalExecutionCacheV3();
  const request = await validOpenEnaLongitudinalRequestV3(500_000, 10_000);
  const { value: capability, jobUrl } = remoteCapability("job-deadline-1");
  let deleteCalls = 0;
  const fetchMock: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url === "/api/open-ena/longitudinal" && method === "POST") return Response.json(capability, { status: 202 });
    if (url === jobUrl && method === "GET") {
      return await new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) reject(new DOMException("aborted", "AbortError"));
        else signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      });
    }
    if (url === jobUrl && method === "DELETE") {
      deleteCalls += 1;
      return Response.json(remoteDeletionReceipt(capability.jobId));
    }
    return new Response(null, { status: 404 });
  };

  await assert.rejects(
    executeOpenEnaLongitudinalPreparedV3(request, {
      allowRemote: true,
      remoteEndpoint: "/api/open-ena/longitudinal",
      fetchImpl: fetchMock,
      remoteDeadlineMilliseconds: 5,
      remoteCleanupDeadlineMilliseconds: 100,
      resultVerifier: async () => {},
    }),
    (error: unknown) => isRecoverableRemoteFailure(error, "REMOTE_DEADLINE_EXCEEDED"),
  );
  assert.equal(deleteCalls, 1);
});

test("force-local recovery preserves the failed immutable request except execution target", async () => {
  clearOpenEnaLongitudinalExecutionCacheV3();
  const request = await validOpenEnaLongitudinalRequestV3(500_000, 10_000);
  const submittedRequests: LongitudinalExecutionRequestV2[] = [];
  const fetchMock: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { request: LongitudinalExecutionRequestV2 };
    submittedRequests.push(body.request);
    return new Response("temporarily unavailable", { status: 503 });
  };
  await assert.rejects(
    executeOpenEnaLongitudinalPreparedV3(request, {
      allowRemote: true,
      remoteEndpoint: "/api/open-ena/longitudinal",
      fetchImpl: fetchMock,
      resultVerifier: async () => {},
    }),
    (error: unknown) => isRecoverableRemoteFailure(error, "REMOTE_SUBMISSION_FAILED"),
  );

  const localRequests: LongitudinalExecutionRequestV2[] = [];
  await executeOpenEnaLongitudinalPreparedV3(request, {
    forceLocal: true,
    nodeExecutor: async (input) => {
      localRequests.push(structuredClone(input));
      return fakeBundle(input);
    },
    resultVerifier: async () => {},
  });
  const submittedRequest = submittedRequests[0];
  const localRequest = localRequests[0];
  assert.ok(submittedRequest);
  assert.ok(localRequest);
  const remoteComparable = structuredClone(submittedRequest);
  const localComparable = structuredClone(localRequest);
  remoteComparable.execution.target = "browser-worker";
  localComparable.execution.target = "browser-worker";
  assert.deepEqual(remoteComparable, localComparable);
  assert.equal(submittedRequest.execution.seed, localRequest.execution.seed);
  assert.deepEqual(submittedRequest.inferenceTask, localRequest.inferenceTask);
  assert.equal(submittedRequest.pathTask.specHash, localRequest.pathTask.specHash);
});
