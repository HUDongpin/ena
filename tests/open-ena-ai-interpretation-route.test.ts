import assert from "node:assert/strict";
import test from "node:test";
import {
  OPEN_ENA_AI_CONSENT_VALUE,
  type OpenEnaAiInterpretationRequestV1,
  type OpenEnaAiInterpretationResponseV1,
} from "../lib/open-ena/ai-interpretation";
import {
  createOpenEnaAiInterpretationPostHandler,
  openEnaAiAuthConfigurationReady,
  OPEN_ENA_AI_MAX_REQUEST_BYTES,
} from "../app/api/open-ena/ai-interpretation/route";

const WORKSPACE_URL = "http://localhost:3000/api/open-ena/ai-interpretation";
const VALID_SESSION = "test-session-token-not-real";
const parsedRequest = { marker: "strictly-parsed-request" } as unknown as OpenEnaAiInterpretationRequestV1;
const generatedResponse = { marker: "generated-interpretation" } as unknown as OpenEnaAiInterpretationResponseV1;

function request(
  body: BodyInit | null = JSON.stringify({ schemaVersion: "fixture" }),
  options: {
    session?: string | null;
    origin?: string | null;
    contentLength?: string | null;
    consent?: string | null;
  } = {},
) {
  const headers = new Headers({ "content-type": "application/json" });
  const session = options.session === undefined ? VALID_SESSION : options.session;
  const origin = options.origin === undefined ? "http://localhost:3000" : options.origin;
  if (session !== null) headers.set("cookie", `open-ena-session=${encodeURIComponent(session)}`);
  if (origin !== null) headers.set("origin", origin);
  const consent = options.consent === undefined ? OPEN_ENA_AI_CONSENT_VALUE : options.consent;
  if (consent !== null) headers.set("x-open-ena-ai-consent", consent);
  if (options.contentLength !== undefined && options.contentLength !== null) {
    headers.set("content-length", options.contentLength);
  }
  return new Request(WORKSPACE_URL, { method: "POST", headers, body });
}

function dependencies(overrides: Partial<Parameters<typeof createOpenEnaAiInterpretationPostHandler>[0]> = {}) {
  const calls = {
    parsedValues: [] as unknown[],
    generatedRequests: [] as OpenEnaAiInterpretationRequestV1[],
    generatedSignals: [] as AbortSignal[],
  };
  const handler = createOpenEnaAiInterpretationPostHandler({
    verifySessionToken: (token) => token === VALID_SESSION,
    parseRequest: (value) => {
      calls.parsedValues.push(value);
      return parsedRequest;
    },
    authConfigurationReady: () => true,
    consumeQuota: () => true,
    generate: async (value, signal) => {
      calls.generatedRequests.push(value);
      calls.generatedSignals.push(signal);
      return generatedResponse;
    },
    ...overrides,
  });
  return { handler, calls };
}

async function json(response: Response) {
  return JSON.parse(await response.text()) as Record<string, unknown>;
}

function assertNoStore(response: Response) {
  assert.equal(response.headers.get("cache-control"), "no-store");
}

test("AI interpretation requires the current Open ENA session before parsing a request", async () => {
  const { handler, calls } = dependencies();
  const response = await handler(request(undefined, { session: null }));

  assert.equal(response.status, 401);
  assertNoStore(response);
  assert.deepEqual(calls.parsedValues, []);
  assert.deepEqual(calls.generatedRequests, []);
});

test("AI interpretation rejects a cross-origin request with the existing origin policy", async () => {
  const { handler, calls } = dependencies();
  const response = await handler(request(undefined, { origin: "https://attacker.example" }));

  assert.equal(response.status, 403);
  assertNoStore(response);
  assert.deepEqual(calls.parsedValues, []);
  assert.deepEqual(calls.generatedRequests, []);
});

test("AI interpretation requires an explicit Origin header", async () => {
  const { handler, calls } = dependencies();
  const response = await handler(request(undefined, { origin: null }));

  assert.equal(response.status, 403);
  assertNoStore(response);
  assert.deepEqual(calls.parsedValues, []);
});

test("AI interpretation fails closed when secure Open ENA auth is not explicitly configured", async () => {
  const { handler, calls } = dependencies({ authConfigurationReady: () => false });
  const response = await handler(request());

  assert.equal(response.status, 503);
  assertNoStore(response);
  assert.deepEqual(calls.parsedValues, []);
});

test("AI interpretation production auth requires explicit credentials and a high-entropy session secret", () => {
  assert.equal(openEnaAiAuthConfigurationReady({}), false);
  assert.equal(openEnaAiAuthConfigurationReady({
    OPEN_ENA_USERNAME: "researcher",
    OPEN_ENA_PASSWORD: "too-short",
    OPEN_ENA_SESSION_SECRET: "s".repeat(32),
  }), false);
  assert.equal(openEnaAiAuthConfigurationReady({
    OPEN_ENA_USERNAME: "researcher",
    OPEN_ENA_PASSWORD: "strong-password-for-open-ena",
    OPEN_ENA_SESSION_SECRET: "s".repeat(32),
  }), true);
});

test("AI interpretation requires the reviewed-aggregate consent assertion", async () => {
  for (const consent of [null, "not-reviewed"] as const) {
    const { handler, calls } = dependencies();
    const response = await handler(request(undefined, { consent }));

    assert.equal(response.status, 428);
    assertNoStore(response);
    assert.deepEqual(calls.parsedValues, []);
  }
});

test("AI interpretation enforces the application request quota before parsing or provider use", async () => {
  const { handler, calls } = dependencies({ consumeQuota: () => false });
  const response = await handler(request());

  assert.equal(response.status, 429);
  assertNoStore(response);
  assert.deepEqual(calls.parsedValues, []);
  assert.deepEqual(calls.generatedRequests, []);
});

test("AI interpretation rejects a declared request larger than 48 KiB without parsing it", async () => {
  const { handler, calls } = dependencies();
  const response = await handler(request("{}", {
    contentLength: String(OPEN_ENA_AI_MAX_REQUEST_BYTES + 1),
  }));

  assert.equal(OPEN_ENA_AI_MAX_REQUEST_BYTES, 48 * 1024);
  assert.equal(response.status, 413);
  assertNoStore(response);
  assert.deepEqual(calls.parsedValues, []);
});

test("AI interpretation measures the actual UTF-8 body even when Content-Length is absent", async () => {
  const { handler, calls } = dependencies();
  const oversizedUtf8 = JSON.stringify({ padding: "界".repeat(OPEN_ENA_AI_MAX_REQUEST_BYTES / 2) });
  assert.ok(new TextEncoder().encode(oversizedUtf8).byteLength > OPEN_ENA_AI_MAX_REQUEST_BYTES);

  const response = await handler(request(oversizedUtf8, { contentLength: null }));

  assert.equal(response.status, 413);
  assertNoStore(response);
  assert.deepEqual(calls.parsedValues, []);
});

test("AI interpretation rejects malformed JSON and invalid UTF-8 as safe client errors", async (t) => {
  await t.test("malformed JSON", async () => {
    const { handler, calls } = dependencies();
    const response = await handler(request("{"));

    assert.equal(response.status, 400);
    assertNoStore(response);
    assert.deepEqual(calls.parsedValues, []);
  });

  await t.test("invalid UTF-8", async () => {
    const { handler, calls } = dependencies();
    const response = await handler(request(new Uint8Array([0xc3, 0x28])));

    assert.equal(response.status, 400);
    assertNoStore(response);
    assert.deepEqual(calls.parsedValues, []);
  });
});

test("AI interpretation returns the strict parser's safe validation message", async () => {
  const safeMessage = "The AI interpretation request has an invalid schemaVersion.";
  const { handler, calls } = dependencies({
    parseRequest: () => { throw new Error(safeMessage); },
  });

  const response = await handler(request(JSON.stringify({ schemaVersion: "wrong" })));
  const body = await json(response);

  assert.equal(response.status, 400);
  assertNoStore(response);
  assert.equal(body.error, safeMessage);
  assert.deepEqual(calls.generatedRequests, []);
});

test("AI interpretation passes only the parsed request to the provider and returns its structured response", async () => {
  const rawValue = { schemaVersion: "fixture", ignoredUntilStrictlyParsed: true };
  const { handler, calls } = dependencies();

  const response = await handler(request(JSON.stringify(rawValue)));

  assert.equal(response.status, 200);
  assertNoStore(response);
  assert.deepEqual(await json(response), generatedResponse);
  assert.deepEqual(calls.parsedValues, [rawValue]);
  assert.deepEqual(calls.generatedRequests, [parsedRequest]);
  assert.equal(calls.generatedSignals.length, 1);
  assert.equal(calls.generatedSignals[0] instanceof AbortSignal, true);
});

for (const [providerStatus, expectedStatus, expectedMessage] of [
  [429, 429, "The AI interpretation provider is rate limited. Please try again later."],
  [503, 503, "AI interpretation is temporarily unavailable."],
  [504, 504, "The AI interpretation provider timed out."],
  [401, 502, "The AI interpretation provider request failed."],
  [500, 502, "The AI interpretation provider request failed."],
] as const) {
  test(`AI interpretation maps provider status ${providerStatus} to safe HTTP ${expectedStatus}`, async () => {
    const sensitiveUpstreamDetail = `provider-body-and-key-must-not-leak-${providerStatus}`;
    const { handler } = dependencies({
      generate: async () => {
        throw Object.assign(new Error(sensitiveUpstreamDetail), {
          name: "LunaProviderError",
          code: `fixture-${providerStatus}`,
          status: providerStatus,
          providerBody: sensitiveUpstreamDetail,
        });
      },
    });

    const response = await handler(request());
    const responseText = await response.text();

    assert.equal(response.status, expectedStatus);
    assertNoStore(response);
    assert.match(responseText, new RegExp(expectedMessage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(responseText, /provider-body-and-key-must-not-leak/);
    assert.doesNotMatch(responseText, /fixture-/);
  });
}

test("AI interpretation treats an unclassified provider failure as a safe bad gateway", async () => {
  const { handler } = dependencies({
    generate: async () => { throw new Error("secret upstream response"); },
  });

  const response = await handler(request());
  const responseText = await response.text();

  assert.equal(response.status, 502);
  assertNoStore(response);
  assert.doesNotMatch(responseText, /secret upstream response/);
  assert.match(responseText, /provider request failed/i);
});

for (const [providerCode, expectedStatus] of [
  ["upstream-rate-limited", 429],
  ["upstream-payment-required", 402],
  ["disabled", 503],
  ["missing-api-key", 503],
  ["invalid-configuration", 503],
  ["upstream-unavailable", 503],
  ["upstream-timeout", 504],
  ["upstream-cancelled", 499],
  ["upstream-unauthorized", 502],
  ["upstream-network", 502],
  ["upstream-malformed", 502],
] as const) {
  test(`AI interpretation maps provider code ${providerCode} to safe HTTP ${expectedStatus}`, async () => {
    const { handler } = dependencies({
      generate: async () => {
        throw Object.assign(new Error("provider detail must stay private"), {
          name: "LunaClientError",
          code: providerCode,
        });
      },
    });

    const response = await handler(request());
    const responseText = await response.text();

    assert.equal(response.status, expectedStatus);
    assertNoStore(response);
    assert.doesNotMatch(responseText, /provider detail must stay private/);
  });
}

test("AI interpretation reports the OpenRouter credit gate without exposing account details", async () => {
  const { handler } = dependencies({
    generate: async () => {
      throw Object.assign(new Error("private billing body and account identifier"), {
        name: "LunaClientError",
        code: "upstream-payment-required",
      });
    },
  });

  const response = await handler(request());
  const responseText = await response.text();

  assert.equal(response.status, 402);
  assertNoStore(response);
  assert.match(responseText, /OpenRouter credits are required/i);
  assert.doesNotMatch(responseText, /private billing body|account identifier/);
});

test("AI interpretation maps an aborted provider request to a safe timeout", async () => {
  const { handler } = dependencies({
    generate: async () => { throw new DOMException("private timeout detail", "AbortError"); },
  });

  const response = await handler(request());
  const responseText = await response.text();

  assert.equal(response.status, 504);
  assertNoStore(response);
  assert.doesNotMatch(responseText, /private timeout detail/);
  assert.match(responseText, /timed out/i);
});
