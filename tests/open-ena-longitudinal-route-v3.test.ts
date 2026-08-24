import assert from "node:assert/strict";
import test from "node:test";

import type { LongitudinalExecutionRequestV2 } from "j-3dena";
import {
  createOpenEnaLongitudinalPostHandlerV3,
  OPEN_ENA_LONGITUDINAL_RATE_LIMIT_REQUESTS,
} from "../lib/server/open-ena-longitudinal-route";

const DATASET_HASH = "1".repeat(64);
const SPEC_HASH = "2".repeat(64);
const SOURCE_HASH = "3".repeat(64);
const ROUTE_URL = "http://localhost:3000/api/open-ena/longitudinal";
const COMPUTE_URL = "https://compute.example/";
const VALID_SESSION = "test-open-ena-session-not-real";
const COMPUTE_TOKEN = "test-only-open-ena-to-compute-token-with-32-bytes";

function derivedRequest(): LongitudinalExecutionRequestV2 {
  const participantToken = "participant-1-0123456789abcdef0123456789abcdef";
  const unitToken = "unit-1-0123456789abcdef0123456789abcdef";
  const stepToken = "step-1-0123456789abcdef0123456789abcdef";
  return {
    dataset: {
      sourceResult: {
        sourceKind: "raw-jena",
        hash: SOURCE_HASH,
        result: {
          points: [{
            participantLabel: {
              columns: ["Speaker"],
              canonical: `opaque-participant:${participantToken}`,
              values: [participantToken],
            },
            unit: { columns: ["Group", "Speaker"], canonical: `opaque-unit:${unitToken}`, values: ["A", unitToken] },
            step: { columns: ["Period"], canonical: `opaque-step:${stepToken}`, values: ["T1"] },
            id: {
              columns: ["Group", "Speaker", "Period"],
              canonical: `opaque-point:${unitToken}:${stepToken}`,
              values: ["A", unitToken, "T1"],
            },
            group: { value: "A" },
            time: { value: "T1" },
          }],
          accumulation: { rowCounts: { rowKeys: [], values: [] } },
        },
      },
    },
    pathTask: {
      datasetHash: DATASET_HASH,
      specHash: SPEC_HASH,
      runId: "route-v3-run",
      runSpec: {
        sourceResultHash: SOURCE_HASH,
        participantColumns: ["Speaker"],
        timeColumn: "Period",
        groupColumn: "Group",
      },
    },
    inferenceTask: { requests: [{ kind: "path-comparison", repetitions: 500 }] },
    execution: { target: "persistent-compute-service", seed: 2026 },
  } as unknown as LongitudinalExecutionRequestV2;
}

function capability(origin = COMPUTE_URL) {
  const base = origin.replace(/\/+$/u, "");
  const job = `${base}/v1/jobs/job-route-1`;
  return {
    schemaVersion: "3dena.longitudinal-compute-capability.v2",
    jobId: "job-route-1",
    capabilityToken: "capability-token-not-secret-fixture",
    urls: {
      schemaVersion: "3dena.longitudinal-compute-status-urls.v2",
      statusUrl: job,
      eventsUrl: `${job}/events`,
      resultUrl: `${job}/result`,
      artifactUrl: `${job}/artifact`,
      cancelUrl: job,
      deleteUrl: job,
    },
    expiresAt: "2026-08-25T00:00:00.000Z",
  };
}

function post(
  request: LongitudinalExecutionRequestV2,
  options: {
    session?: string | null;
    origin?: string | null;
    forwardedHost?: string | null;
    forwardedProtocol?: string | null;
    processingPolicyConfirmed?: boolean;
    executionAttemptId?: string;
    extra?: Record<string, unknown>;
  } = {},
): Request {
  const headers = new Headers({ "content-type": "application/json" });
  const session = options.session === undefined ? VALID_SESSION : options.session;
  const origin = options.origin === undefined ? "http://localhost:3000" : options.origin;
  const forwardedHost = options.forwardedHost === undefined ? "localhost:3000" : options.forwardedHost;
  const forwardedProtocol = options.forwardedProtocol === undefined ? "http" : options.forwardedProtocol;
  if (session !== null) headers.set("cookie", `open-ena-session=${encodeURIComponent(session)}`);
  if (origin !== null) headers.set("origin", origin);
  if (forwardedHost !== null) headers.set("x-forwarded-host", forwardedHost);
  if (forwardedProtocol !== null) headers.set("x-forwarded-proto", forwardedProtocol);
  return new Request(ROUTE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      schemaVersion: "3dena.open-ena-longitudinal-remote-submit.v3",
      executionAttemptId: options.executionAttemptId ?? "attempt-0123456789abcdef0123456789abcdef",
      processingPolicyConfirmed: options.processingPolicyConfirmed ?? true,
      request,
      ...options.extra,
    }),
  });
}

function securityDependencies() {
  return {
    environment: {
      OPEN_ENA_LONGITUDINAL_COMPUTE_URL: COMPUTE_URL,
      OPEN_ENA_LONGITUDINAL_COMPUTE_TOKEN: COMPUTE_TOKEN,
    },
    verifySessionToken: (token: string | undefined) => token === VALID_SESSION,
    consumeQuota: () => true,
    validateRequest: () => {},
  };
}

test("persistent route queues a privacy-minimized task and never forwards caller execution fields", async () => {
  let upstreamUrl = "";
  let upstreamInit: RequestInit | undefined;
  const handler = createOpenEnaLongitudinalPostHandlerV3({
    ...securityDependencies(),
    upstreamFetch: async (input, init) => {
      upstreamUrl = String(input);
      upstreamInit = init;
      return Response.json(capability(), { status: 202 });
    },
  });

  const response = await handler(post(derivedRequest()));
  assert.equal(response.status, 202);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-open-ena-compute"), "persistent-queued-v2");
  assert.equal(upstreamUrl, "https://compute.example/v2/longitudinal-jobs");
  assert.equal(upstreamInit?.method, "POST");
  const headers = new Headers(upstreamInit?.headers);
  assert.equal(headers.get("origin"), "http://localhost:3000");
  assert.equal(headers.get("x-3dena-contract-version"), "3dena.contract.v1");
  assert.equal(headers.get("x-3dena-service-token"), COMPUTE_TOKEN);
  assert.match(headers.get("idempotency-key") ?? "", /^open-ena-longitudinal-[a-f0-9]{64}$/u);
  const forwarded = JSON.parse(String(upstreamInit?.body)) as Record<string, unknown>;
  assert.deepEqual(Object.keys(forwarded).sort(), [
    "dataset", "inferenceTask", "pathTask", "processingPolicyConfirmed", "schemaVersion", "seed",
  ]);
  assert.equal(forwarded.schemaVersion, "3dena.longitudinal-compute-submission.v2");
  assert.equal(forwarded.seed, 2026);
  assert.equal(Object.hasOwn(forwarded, "execution"), false);
  assert.equal(Object.hasOwn(forwarded, "bootstrapTask"), false);
  assert.equal(Object.hasOwn(forwarded, "rawRows"), false);
  assert.deepEqual(await response.json(), capability());
});

test("persistent route idempotency binds the complete canonical scientific submission", async () => {
  const idempotencyKeys: string[] = [];
  const handler = createOpenEnaLongitudinalPostHandlerV3({
    ...securityDependencies(),
    upstreamFetch: async (_input, init) => {
      idempotencyKeys.push(new Headers(init?.headers).get("idempotency-key") ?? "");
      return Response.json(capability(), { status: 202 });
    },
  });
  const original = derivedRequest();
  const firstAttempt = "attempt-11111111111111111111111111111111";
  assert.equal((await handler(post(original, { executionAttemptId: firstAttempt }))).status, 202);
  assert.equal((await handler(post(structuredClone(original), { executionAttemptId: firstAttempt }))).status, 202);
  const changedInference = structuredClone(original);
  changedInference.inferenceTask = {
    ...changedInference.inferenceTask!,
    requests: [{ kind: "independent-period", periodCanonical: "T2" }],
  } as LongitudinalExecutionRequestV2["inferenceTask"];
  assert.equal((await handler(post(changedInference, { executionAttemptId: firstAttempt }))).status, 202);
  assert.equal((await handler(post(original, {
    executionAttemptId: "attempt-22222222222222222222222222222222",
  }))).status, 202);
  assert.equal(idempotencyKeys[0], idempotencyKeys[1]);
  assert.notEqual(idempotencyKeys[1], idempotencyKeys[2]);
  assert.notEqual(idempotencyKeys[0], idempotencyKeys[3]);
});

test("persistent route rejects raw identities and trajectory CI before any upstream request", async (t) => {
  for (const [label, mutate, expectedCode] of [
    ["raw identity", (request: LongitudinalExecutionRequestV2) => {
      const result = request.dataset.sourceResult!.result as { points: Array<{ participantLabel: { canonical: string; values: string[] } }> };
      result.points[0]!.participantLabel = { canonical: "raw-participant:Alice", values: ["Alice"] };
    }, "PRIVACY_BOUNDARY_VIOLATION"],
    ["bootstrap", (request: LongitudinalExecutionRequestV2) => {
      (request as { bootstrapTask?: unknown }).bootstrapTask = { repetitions: 500 };
    }, "TRAJECTORY_CI_UNSUPPORTED"],
  ] as const) {
    await t.test(label, async () => {
      let submitted = false;
      const request = derivedRequest();
      mutate(request);
      const handler = createOpenEnaLongitudinalPostHandlerV3({
        ...securityDependencies(),
        upstreamFetch: async () => { submitted = true; return Response.json(capability(), { status: 202 }); },
      });
      const response = await handler(post(request));
      assert.equal(response.status, 400);
      assert.equal(submitted, false);
      assert.equal((await response.json() as { error: { code: string } }).error.code, expectedCode);
    });
  }
});

test("persistent route requires an exact versioned wrapper and explicit processing confirmation", async (t) => {
  for (const [label, request, expectedCode] of [
    ["extra field", post(derivedRequest(), { extra: { rawRows: [] } }), "INVALID_REQUEST"],
    ["unconfirmed", post(derivedRequest(), { processingPolicyConfirmed: false }), "PROCESSING_POLICY_NOT_CONFIRMED"],
    ["invalid attempt", post(derivedRequest(), { executionAttemptId: "attempt-predictable" }), "INVALID_EXECUTION_ATTEMPT"],
  ] as const) {
    await t.test(label, async () => {
      const response = await createOpenEnaLongitudinalPostHandlerV3({
        ...securityDependencies(),
        upstreamFetch: async () => Response.json(capability(), { status: 202 }),
      })(request);
      assert.equal(response.status, 400);
      assert.equal((await response.json() as { error: { code: string } }).error.code, expectedCode);
    });
  }
});

test("persistent route fails closed when server-to-server authentication is missing", async () => {
  let submitted = false;
  const response = await createOpenEnaLongitudinalPostHandlerV3({
    ...securityDependencies(),
    environment: { OPEN_ENA_LONGITUDINAL_COMPUTE_URL: COMPUTE_URL },
    upstreamFetch: async () => {
      submitted = true;
      return Response.json(capability(), { status: 202 });
    },
  })(post(derivedRequest()));
  assert.equal(response.status, 503);
  assert.equal(submitted, false);
  assert.equal((await response.json() as { error: { code: string } }).error.code, "REMOTE_SERVICE_UNAVAILABLE");
});

test("persistent route cuts off a streamed derived payload before buffering beyond its limit", async () => {
  let submitted = false;
  let cancelled = false;
  const headers = new Headers({
    "content-type": "application/json",
    cookie: `open-ena-session=${encodeURIComponent(VALID_SESSION)}`,
    origin: "http://localhost:3000",
    "x-forwarded-host": "localhost:3000",
    "x-forwarded-proto": "http",
  });
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("{\"schemaVersion\":"));
      controller.enqueue(new Uint8Array(64));
    },
    cancel() { cancelled = true; },
  });
  const incoming = new Request(ROUTE_URL, {
    method: "POST",
    headers,
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  const response = await createOpenEnaLongitudinalPostHandlerV3({
    ...securityDependencies(),
    maximumDerivedPayloadBytes: 32,
    upstreamFetch: async () => {
      submitted = true;
      return Response.json(capability(), { status: 202 });
    },
  })(incoming);
  assert.equal(response.status, 413);
  assert.equal(submitted, false);
  assert.equal(cancelled, true);
  assert.equal((await response.json() as { error: { code: string } }).error.code, "DERIVED_PAYLOAD_TOO_LARGE");
});

test("persistent route authenticates and verifies same-origin before parsing derived research data", async (t) => {
  for (const [label, options, status, code] of [
    ["missing session", { session: null }, 401, "AUTHENTICATION_REQUIRED"],
    ["missing origin", { origin: null }, 403, "INVALID_REQUEST_ORIGIN"],
    ["cross site", { origin: "https://attacker.example" }, 403, "INVALID_REQUEST_ORIGIN"],
    ["protocol mismatch", { origin: "https://localhost:3000", forwardedProtocol: "http" }, 403, "INVALID_REQUEST_ORIGIN"],
  ] as const) {
    await t.test(label, async () => {
      let submitted = false;
      const response = await createOpenEnaLongitudinalPostHandlerV3({
        ...securityDependencies(),
        upstreamFetch: async () => { submitted = true; return Response.json(capability(), { status: 202 }); },
      })(post(derivedRequest(), options));
      assert.equal(response.status, status);
      assert.equal((await response.json() as { error: { code: string } }).error.code, code);
      assert.equal(submitted, false);
    });
  }
});

test("persistent route rate limits before parsing and preserves its fixed session quota", async () => {
  let submitted = 0;
  const denied = createOpenEnaLongitudinalPostHandlerV3({
    ...securityDependencies(),
    consumeQuota: () => false,
    upstreamFetch: async () => { submitted += 1; return Response.json(capability(), { status: 202 }); },
  });
  const deniedResponse = await denied(post(derivedRequest()));
  assert.equal(deniedResponse.status, 429);
  assert.equal(submitted, 0);

  const session = `rate-session-${Date.now()}-${Math.random()}`;
  const limited = createOpenEnaLongitudinalPostHandlerV3({
    environment: {
      OPEN_ENA_LONGITUDINAL_COMPUTE_URL: COMPUTE_URL,
      OPEN_ENA_LONGITUDINAL_COMPUTE_TOKEN: COMPUTE_TOKEN,
    },
    verifySessionToken: (token) => token === session,
    validateRequest: () => {},
    upstreamFetch: async () => { submitted += 1; return Response.json(capability(), { status: 202 }); },
  });
  for (let index = 0; index < OPEN_ENA_LONGITUDINAL_RATE_LIMIT_REQUESTS; index += 1) {
    assert.equal((await limited(post(derivedRequest(), { session }))).status, 202);
  }
  assert.equal((await limited(post(derivedRequest(), { session }))).status, 429);
  assert.equal(submitted, OPEN_ENA_LONGITUDINAL_RATE_LIMIT_REQUESTS);
});

test("persistent route fails safely for missing service, timeout, rejection, and unsafe capability URLs", async (t) => {
  const cases: Array<[string, Parameters<typeof createOpenEnaLongitudinalPostHandlerV3>[0], number, string]> = [
    ["missing service", { ...securityDependencies(), environment: {} }, 503, "REMOTE_SERVICE_UNAVAILABLE"],
    ["unsupported compute mount path", {
      ...securityDependencies(),
      environment: {
        OPEN_ENA_LONGITUDINAL_COMPUTE_URL: "https://compute.example/mounted/",
        OPEN_ENA_LONGITUDINAL_COMPUTE_TOKEN: COMPUTE_TOKEN,
      },
    }, 503, "REMOTE_SERVICE_UNAVAILABLE"],
    ["timeout", {
      ...securityDependencies(),
      submissionDeadlineMilliseconds: 5,
      upstreamFetch: async (_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("timeout", "AbortError")), { once: true });
      }),
    }, 504, "REMOTE_SUBMISSION_DEADLINE_EXCEEDED"],
    ["upstream rejection", {
      ...securityDependencies(),
      upstreamFetch: async () => Response.json({ private: "RAW_ALICE" }, { status: 500 }),
    }, 502, "REMOTE_SUBMISSION_REJECTED"],
    ["unsafe URL", {
      ...securityDependencies(),
      upstreamFetch: async () => Response.json({
        ...capability(),
        urls: { ...capability().urls, artifactUrl: "https://attacker.example/result" },
      }, { status: 202 }),
    }, 502, "INVALID_UPSTREAM_RESPONSE"],
  ];
  for (const [label, dependencies, status, code] of cases) {
    await t.test(label, async () => {
      const response = await createOpenEnaLongitudinalPostHandlerV3(dependencies)(post(derivedRequest()));
      const text = await response.text();
      assert.equal(response.status, status);
      assert.equal(JSON.parse(text).error.code, code);
      assert.doesNotMatch(text, /RAW_ALICE/u);
    });
  }
});

test("persistent route preserves actionable safe upstream statuses without reflecting private bodies", async (t) => {
  const cases = [
    [400, "REMOTE_SUBMISSION_INVALID"],
    [409, "REMOTE_ATTEMPT_CONFLICT"],
    [413, "REMOTE_DERIVED_PAYLOAD_TOO_LARGE"],
    [429, "REMOTE_RATE_LIMITED"],
    [503, "REMOTE_SERVICE_UNAVAILABLE"],
    [504, "REMOTE_SUBMISSION_DEADLINE_EXCEEDED"],
  ] as const;

  for (const [status, code] of cases) {
    await t.test(String(status), async () => {
      const handler = createOpenEnaLongitudinalPostHandlerV3({
        ...securityDependencies(),
        upstreamFetch: async () => Response.json(
          { private: "RAW_ALICE", upstreamCode: "DO_NOT_REFLECT" },
          { status, headers: status === 429 ? { "retry-after": "17" } : undefined },
        ),
      });
      const response = await handler(post(derivedRequest()));
      assert.equal(response.status, status);
      if (status === 429) assert.equal(response.headers.get("retry-after"), "17");
      const serialized = JSON.stringify(await response.json());
      assert.match(serialized, new RegExp(code, "u"));
      assert.doesNotMatch(serialized, /RAW_ALICE|DO_NOT_REFLECT/u);
    });
  }
});
