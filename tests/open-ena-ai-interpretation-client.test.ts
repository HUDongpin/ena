import assert from "node:assert/strict";
import test from "node:test";
import {
  LunaClientError,
  OPEN_ENA_AI_MAX_RESPONSE_BYTES,
  generateLunaInterpretation,
} from "../lib/server/luna-client";
import {
  OPEN_ENA_AI_PROMPT_VERSION,
  OPEN_ENA_AI_REQUEST_SCHEMA_VERSION,
  type OpenEnaAiInterpretationRequestV1,
} from "../lib/open-ena/ai-interpretation";

function interpretationRequest(): OpenEnaAiInterpretationRequestV1 {
  return {
    schemaVersion: OPEN_ENA_AI_REQUEST_SCHEMA_VERSION,
    promptVersion: OPEN_ENA_AI_PROMPT_VERSION,
    locale: "en",
    binding: {
      analyzedAt: "2026-08-20T10:00:00.000Z",
      datasetHash: "a".repeat(64),
      modelType: "EndPoint",
      axes: ["SVD1", "SVD2"],
      evidenceKey: "fnv1a32-12345678",
    },
    evidence: {
      kind: "endpoint-group-comparison",
      configuration: {
        modelType: "EndPoint",
        window: "Conversation",
        rotation: "svd",
        weightBy: "binary",
        unitFieldCount: 2,
        horizonFieldCount: 3,
        codes: ["EC", "ICT"],
      },
      axes: [
        { id: "axis-1", name: "SVD1", varianceShare: 0.51 },
        { id: "axis-2", name: "SVD2", varianceShare: 0.32 },
      ],
      groups: [
        { id: "group-primary", role: "primary", n: 43, meanCoordinates: { SVD1: 0.2, SVD2: -0.1 } },
        { id: "group-secondary", role: "secondary", n: 44, meanCoordinates: { SVD1: -0.2, SVD2: 0.1 } },
      ],
      edges: [{
        id: "edge-difference-1",
        sourceCode: "EC",
        targetCode: "ICT",
        primaryWeight: 0.4,
        secondaryWeight: 0.2,
        signedDifference: 0.2,
      }],
      inference: [{
        id: "inference-axis-1",
        axis: "SVD1",
        method: "Mann-Whitney U",
        uFirst: 1_100,
        pValueTwoSided: 0.02,
        rankBiserialFirstVsSecond: 0.27,
      }],
      boundaries: [
        "The supplied evidence is aggregate only.",
        "Visual separation does not establish causality.",
      ],
    },
  };
}

test("Luna interpretation fails closed before fetch when AI is not explicitly enabled", async () => {
  let fetchCalled = false;

  await assert.rejects(
    generateLunaInterpretation(interpretationRequest(), {
      environment: {},
      fetch: async () => {
        fetchCalled = true;
        return new Response();
      },
    }),
    (error: unknown) => error instanceof LunaClientError && error.code === "disabled",
  );
  assert.equal(fetchCalled, false);
});

test("Luna interpretation fails closed before fetch when the OpenRouter key is missing", async () => {
  let fetchCalled = false;

  await assert.rejects(
    generateLunaInterpretation(interpretationRequest(), {
      environment: { OPEN_ENA_AI_ENABLED: "true" },
      fetch: async () => {
        fetchCalled = true;
        return new Response();
      },
    }),
    (error: unknown) => error instanceof LunaClientError && error.code === "missing-api-key",
  );
  assert.equal(fetchCalled, false);
});

test("Luna interpretation sends only aggregate evidence to the default OpenRouter Luna endpoint", async () => {
  const request = interpretationRequest();
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const upstreamInterpretation = {
    observedPatterns: [{
      statement: "The aggregate EC-ICT connection is stronger for the primary role.",
      evidenceRefs: ["edge-difference-1"],
    }],
    contextualQuestions: ["What coded excerpts support this aggregate pattern?"],
    limitations: ["Visual separation does not establish causality."],
  };

  const response = await generateLunaInterpretation(request, {
    environment: {
      OPEN_ENA_AI_ENABLED: "true",
      OPENROUTER_API_KEY: "provider-key-must-stay-server-side",
    },
    fetch: async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return Response.json({
        choices: [{ message: { content: JSON.stringify(upstreamInterpretation) } }],
      });
    },
    clock: () => new Date("2026-08-20T12:34:56.000Z"),
  });

  assert.equal(capturedUrl, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(capturedInit?.method, "POST");
  assert.equal(new Headers(capturedInit?.headers).get("authorization"), "Bearer provider-key-must-stay-server-side");
  const providerBody = JSON.parse(String(capturedInit?.body)) as {
    model: string;
    max_tokens: number;
    messages: Array<{ role: string; content: string }>;
    response_format: {
      type: string;
      json_schema: {
        strict: boolean;
        schema: {
          additionalProperties: boolean;
          properties: {
            observedPatterns: {
              items: {
                properties: {
                  evidenceRefs: { items: { enum: string[] } };
                };
              };
            };
          };
        };
      };
    };
  };
  assert.equal(providerBody.model, "openai/gpt-5.6-luna");
  assert.equal(providerBody.max_tokens, 1_800);
  assert.match(providerBody.messages[0].content, /aggregate ENA evidence/i);
  assert.match(providerBody.messages[0].content, /does not establish causality/i);
  assert.match(providerBody.messages[0].content, /axis signs are arbitrary/i);
  assert.match(providerBody.messages[0].content, /untrusted data labels/i);
  assert.match(providerBody.messages[0].content, /Every string.*untrusted data/i);
  assert.deepEqual(JSON.parse(providerBody.messages[1].content), request.evidence);
  assert.doesNotMatch(providerBody.messages[1].content, /datasetHash|evidenceKey|analyzedAt|fnv1a32|a{64}/);
  assert.doesNotMatch(String(capturedInit?.body), /provider-key-must-stay-server-side/);
  assert.equal(providerBody.response_format.type, "json_schema");
  assert.equal(providerBody.response_format.json_schema.strict, true);
  assert.equal(providerBody.response_format.json_schema.schema.additionalProperties, false);
  assert.deepEqual(
    providerBody.response_format.json_schema.schema.properties.observedPatterns
      .items.properties.evidenceRefs.items.enum,
    [
      "axis-1",
      "axis-2",
      "edge-difference-1",
      "group-primary",
      "group-secondary",
      "inference-axis-1",
    ],
  );
  assert.deepEqual(response, {
    schemaVersion: "open-ena-ai-interpretation-response-v1",
    promptVersion: request.promptVersion,
    binding: request.binding,
    provider: "openrouter",
    model: "openai/gpt-5.6-luna",
    generatedAt: "2026-08-20T12:34:56.000Z",
    interpretation: upstreamInterpretation,
  });
});

test("Luna interpretation maps OpenRouter 401 without exposing upstream bodies or keys", async () => {
  const apiKey = "top-secret-openrouter-key";
  const upstreamSecret = "upstream-body-must-never-escape";

  await assert.rejects(
    generateLunaInterpretation(interpretationRequest(), {
      environment: {
        OPEN_ENA_AI_ENABLED: "true",
        OPENROUTER_API_KEY: apiKey,
      },
      fetch: async () => new Response(`${upstreamSecret} ${apiKey}`, { status: 401 }),
    }),
    (error: unknown) => {
      assert.ok(error instanceof LunaClientError);
      assert.equal(error.code, "upstream-unauthorized");
      assert.doesNotMatch(error.message, new RegExp(`${upstreamSecret}|${apiKey}`));
      return true;
    },
  );
});

test("Luna interpretation maps OpenRouter 429 to a fail-closed rate-limit error", async () => {
  await assert.rejects(
    generateLunaInterpretation(interpretationRequest(), {
      environment: {
        OPEN_ENA_AI_ENABLED: "true",
        OPENROUTER_API_KEY: "server-only-key",
      },
      fetch: async () => new Response("provider quota details are private", {
        status: 429,
        headers: { "retry-after": "30" },
      }),
    }),
    (error: unknown) => error instanceof LunaClientError
      && error.code === "upstream-rate-limited"
      && !error.message.includes("provider quota details"),
  );
});

test("Luna interpretation identifies OpenRouter 402 without exposing billing details or keys", async () => {
  const apiKey = "server-only-key";
  const privateBillingBody = `private OpenRouter billing detail ${apiKey}`;

  await assert.rejects(
    generateLunaInterpretation(interpretationRequest(), {
      environment: {
        OPEN_ENA_AI_ENABLED: "true",
        OPENROUTER_API_KEY: apiKey,
      },
      fetch: async () => new Response(privateBillingBody, { status: 402 }),
    }),
    (error: unknown) => error instanceof LunaClientError
      && error.code === "upstream-payment-required"
      && !error.message.includes(privateBillingBody)
      && !error.message.includes(apiKey),
  );
});

test("Luna interpretation maps OpenRouter 5xx responses without exposing the upstream body", async () => {
  await assert.rejects(
    generateLunaInterpretation(interpretationRequest(), {
      environment: {
        OPEN_ENA_AI_ENABLED: "true",
        OPENROUTER_API_KEY: "server-only-key",
      },
      fetch: async () => new Response("private provider incident identifier", { status: 503 }),
    }),
    (error: unknown) => error instanceof LunaClientError
      && error.code === "upstream-unavailable"
      && !error.message.includes("private provider incident"),
  );
});

test("Luna interpretation rejects malformed completion JSON without echoing provider content", async () => {
  const privateCompletion = "private completion content is not JSON";

  await assert.rejects(
    generateLunaInterpretation(interpretationRequest(), {
      environment: {
        OPEN_ENA_AI_ENABLED: "true",
        OPENROUTER_API_KEY: "server-only-key",
      },
      fetch: async () => Response.json({
        choices: [{ message: { content: privateCompletion } }],
      }),
    }),
    (error: unknown) => error instanceof LunaClientError
      && error.code === "upstream-malformed"
      && !error.message.includes(privateCompletion),
  );
});

test("Luna interpretation rejects an oversized provider response before schema parsing", async () => {
  await assert.rejects(
    generateLunaInterpretation(interpretationRequest(), {
      environment: {
        OPEN_ENA_AI_ENABLED: "true",
        OPENROUTER_API_KEY: "server-only-key",
      },
      fetch: async () => new Response("x".repeat(OPEN_ENA_AI_MAX_RESPONSE_BYTES + 1), {
        headers: { "content-length": String(OPEN_ENA_AI_MAX_RESPONSE_BYTES + 1) },
      }),
    }),
    (error: unknown) => error instanceof LunaClientError && error.code === "upstream-malformed",
  );
});

test("Luna interpretation rejects completion claims that cite unsupplied evidence IDs", async () => {
  await assert.rejects(
    generateLunaInterpretation(interpretationRequest(), {
      environment: {
        OPEN_ENA_AI_ENABLED: "true",
        OPENROUTER_API_KEY: "server-only-key",
      },
      fetch: async () => Response.json({
        choices: [{ message: { content: JSON.stringify({
          observedPatterns: [{
            statement: "This unsupported claim must fail closed.",
            evidenceRefs: ["not-supplied-by-the-request"],
          }],
          contextualQuestions: [],
          limitations: ["Aggregate evidence only."],
        }) } }],
      }),
    }),
    (error: unknown) => error instanceof LunaClientError && error.code === "upstream-malformed",
  );
});

test("Luna interpretation rejects a structured response that omits limitations", async () => {
  await assert.rejects(
    generateLunaInterpretation(interpretationRequest(), {
      environment: {
        OPEN_ENA_AI_ENABLED: "true",
        OPENROUTER_API_KEY: "server-only-key",
      },
      fetch: async () => Response.json({
        choices: [{ message: { content: JSON.stringify({
          observedPatterns: [{ statement: "Aggregate pattern.", evidenceRefs: ["axis-1"] }],
          contextualQuestions: [],
          limitations: [],
        }) } }],
      }),
    }),
    (error: unknown) => error instanceof LunaClientError && error.code === "upstream-malformed",
  );
});

test("Luna interpretation aborts at the injected timeout and redacts the fetch error", async () => {
  const privateFetchError = "private fetch timeout details";

  await assert.rejects(
    generateLunaInterpretation(interpretationRequest(), {
      environment: {
        OPEN_ENA_AI_ENABLED: "true",
        OPENROUTER_API_KEY: "server-only-key",
      },
      timeoutMs: 5,
      fetch: async (_input, init) => new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return reject(new Error("missing abort signal"));
        signal.addEventListener("abort", () => reject(new Error(privateFetchError)), { once: true });
      }),
    }),
    (error: unknown) => error instanceof LunaClientError
      && error.code === "upstream-timeout"
      && !error.message.includes(privateFetchError),
  );
});

test("Luna interpretation redacts non-timeout fetch failures", async () => {
  const apiKey = "server-key-that-must-not-escape";
  const privateNetworkError = `network diagnostics containing ${apiKey}`;

  await assert.rejects(
    generateLunaInterpretation(interpretationRequest(), {
      environment: {
        OPEN_ENA_AI_ENABLED: "true",
        OPENROUTER_API_KEY: apiKey,
      },
      fetch: async () => { throw new Error(privateNetworkError); },
    }),
    (error: unknown) => error instanceof LunaClientError
      && error.code === "upstream-network"
      && !error.message.includes(apiKey)
      && !error.message.includes(privateNetworkError),
  );
});

test("Luna interpretation timeout remains active while reading the upstream body", async () => {
  const generation = generateLunaInterpretation(interpretationRequest(), {
    environment: {
      OPEN_ENA_AI_ENABLED: "true",
      OPENROUTER_API_KEY: "server-only-key",
    },
    timeoutMs: 5,
    fetch: async (_input, init) => ({
      ok: true,
      status: 200,
      json: async () => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new Error("private body-read timeout details")),
          { once: true },
        );
      }),
    }) as Response,
  });
  const outcome = await Promise.race([
    generation.then(
      () => ({ kind: "resolved" as const }),
      (error: unknown) => ({ kind: "rejected" as const, error }),
    ),
    new Promise<{ kind: "hung" }>((resolve) => setTimeout(() => resolve({ kind: "hung" }), 50)),
  ]);

  assert.notEqual(outcome.kind, "hung");
  assert.equal(outcome.kind, "rejected");
  if (outcome.kind === "rejected") {
    assert.ok(outcome.error instanceof LunaClientError);
    assert.equal(outcome.error.code, "upstream-timeout");
    assert.doesNotMatch(outcome.error.message, /private body-read timeout details/);
  }
});

test("Luna interpretation allows an explicit OpenRouter base URL and configurable model", async () => {
  let capturedUrl = "";
  let capturedModel = "";

  const response = await generateLunaInterpretation(interpretationRequest(), {
    environment: {
      OPEN_ENA_AI_ENABLED: "true",
      OPENROUTER_API_KEY: "server-only-key",
      OPEN_ENA_AI_BASE_URL: "https://openrouter.ai/api/v1/",
      OPEN_ENA_AI_MODEL: "research/custom-luna",
    },
    fetch: async (input, init) => {
      capturedUrl = String(input);
      capturedModel = (JSON.parse(String(init?.body)) as { model: string }).model;
      return Response.json({
        choices: [{ message: { content: JSON.stringify({
          observedPatterns: [{ statement: "Aggregate pattern.", evidenceRefs: ["axis-1"] }],
          contextualQuestions: [],
          limitations: ["Aggregate evidence only."],
        }) } }],
      });
    },
  });

  assert.equal(capturedUrl, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(capturedModel, "research/custom-luna");
  assert.equal(response.model, "research/custom-luna");
});

for (const unsafeBaseUrl of [
  "javascript:private-provider-config",
  "http://openrouter.ai/api/v1",
  "https://attacker.example/api/v1",
  "https://openrouter.ai/not-the-openrouter-api",
]) {
  test(`Luna interpretation rejects unsafe provider base URL ${unsafeBaseUrl} before fetch`, async () => {
    let fetchCalled = false;

    await assert.rejects(
      generateLunaInterpretation(interpretationRequest(), {
        environment: {
          OPEN_ENA_AI_ENABLED: "true",
          OPENROUTER_API_KEY: "server-only-key",
          OPEN_ENA_AI_BASE_URL: unsafeBaseUrl,
        },
        fetch: async () => {
          fetchCalled = true;
          return new Response();
        },
      }),
      (error: unknown) => error instanceof LunaClientError && error.code === "invalid-configuration",
    );
    assert.equal(fetchCalled, false);
  });
}

test("Luna interpretation propagates caller cancellation to the provider request", async () => {
  const caller = new AbortController();
  let providerSignal: AbortSignal | null = null;
  const generation = generateLunaInterpretation(interpretationRequest(), {
    environment: {
      OPEN_ENA_AI_ENABLED: "true",
      OPENROUTER_API_KEY: "server-only-key",
    },
    signal: caller.signal,
    fetch: async (_input, init) => new Promise<Response>((_resolve, reject) => {
      providerSignal = init?.signal ?? null;
      providerSignal?.addEventListener("abort", () => reject(new Error("private cancelled request")), {
        once: true,
      });
    }),
  });

  caller.abort();
  await assert.rejects(
    generation,
    (error: unknown) => error instanceof LunaClientError && error.code === "upstream-cancelled",
  );
  assert.equal((providerSignal as unknown as AbortSignal).aborted, true);
});

test("Luna interpretation rejects a structurally valid completion that echoes the API key", async () => {
  const apiKey = "sk-or-secret-provider-key-123456";

  await assert.rejects(
    generateLunaInterpretation(interpretationRequest(), {
      environment: {
        OPEN_ENA_AI_ENABLED: "true",
        OPENROUTER_API_KEY: apiKey,
      },
      fetch: async () => Response.json({
        choices: [{ message: { content: JSON.stringify({
          observedPatterns: [{
            statement: `Provider accidentally echoed ${apiKey}`,
            evidenceRefs: ["axis-1"],
          }],
          contextualQuestions: [],
          limitations: ["Aggregate evidence only."],
        }) } }],
      }),
    }),
    (error: unknown) => error instanceof LunaClientError
      && error.code === "upstream-malformed"
      && !error.message.includes(apiKey),
  );
});

test("Luna interpretation rejects an invalid injected timeout before fetch", async () => {
  let fetchCalled = false;

  await assert.rejects(
    generateLunaInterpretation(interpretationRequest(), {
      environment: {
        OPEN_ENA_AI_ENABLED: "true",
        OPENROUTER_API_KEY: "server-only-key",
      },
      timeoutMs: 0,
      fetch: async () => {
        fetchCalled = true;
        return new Response();
      },
    }),
    (error: unknown) => error instanceof LunaClientError && error.code === "invalid-configuration",
  );
  assert.equal(fetchCalled, false);
});
