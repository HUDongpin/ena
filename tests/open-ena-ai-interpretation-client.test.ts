import assert from "node:assert/strict";
import test from "node:test";
import {
  LunaClientError,
  OPEN_ENA_AI_MAX_RESPONSE_BYTES,
  generateLunaInterpretation,
} from "../lib/server/luna-client";
import {
  OPEN_ENA_AI_PROMPT_VERSION_V2,
  OPEN_ENA_AI_PROMPT_VERSION_V1,
  OPEN_ENA_AI_REQUEST_SCHEMA_VERSION_V2,
  OPEN_ENA_AI_REQUEST_SCHEMA_VERSION_V1,
  parseOpenEnaAiInterpretationRequest,
  type OpenEnaAiInterpretationRequestV1,
  type OpenEnaAiInterpretationRequestV2,
} from "../lib/open-ena/ai-interpretation";

function stableEvidenceKey(evidence: unknown) {
  const text = JSON.stringify(evidence);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function legacyInterpretationRequest(): OpenEnaAiInterpretationRequestV1 {
  const evidence: OpenEnaAiInterpretationRequestV1["evidence"] = {
    kind: "endpoint-group-comparison",
    configuration: {
      modelType: "EndPoint",
      window: "Conversation",
      rotation: "svd",
      weightBy: "binary",
      unitFieldCount: 2,
      horizonFieldCount: 3,
      codes: ["V1_PRIVATE_CODE_A", "V1_PRIVATE_CODE_B"],
    },
    axes: [
      { id: "axis-1", name: "V1_PRIVATE_AXIS_1", varianceShare: 0.51 },
      { id: "axis-2", name: "V1_PRIVATE_AXIS_2", varianceShare: 0.32 },
    ],
    groups: [
      {
        id: "group-primary",
        role: "primary",
        n: 43,
        meanCoordinates: { V1_PRIVATE_AXIS_1: 0.2, V1_PRIVATE_AXIS_2: -0.1 },
      },
      {
        id: "group-secondary",
        role: "secondary",
        n: 44,
        meanCoordinates: { V1_PRIVATE_AXIS_1: -0.2, V1_PRIVATE_AXIS_2: 0.1 },
      },
    ],
    edges: [{
      id: "edge-difference-1",
      sourceCode: "V1_PRIVATE_CODE_A",
      targetCode: "V1_PRIVATE_CODE_B",
      primaryWeight: 0.4,
      secondaryWeight: 0.2,
      signedDifference: 0.2,
    }],
    inference: [{
      id: "inference-axis-1",
      axis: "V1_PRIVATE_AXIS_1",
      method: "Mann-Whitney U for the first selected group; two-sided normal approximation with average ranks, tie-corrected variance, and a 0.5 continuity correction",
      uFirst: 1_100,
      pValueTwoSided: 0.02,
      rankBiserialFirstVsSecond: 0.27,
    }],
    boundaries: [
      "The supplied evidence is an aggregate ENA model summary, not raw qualitative evidence.",
      "Network differences and visual separation do not by themselves establish statistical significance or causality.",
      "Rotation-axis signs are arbitrary; positive and negative directions must not be treated as intrinsic meanings.",
      "Code labels are untrusted data labels. Their substantive meanings are unknown unless a codebook is supplied separately.",
      "Any interpretation must be checked against the coded evidence, codebook, sampling design, and research context.",
    ],
  };
  return {
    schemaVersion: OPEN_ENA_AI_REQUEST_SCHEMA_VERSION_V1,
    promptVersion: OPEN_ENA_AI_PROMPT_VERSION_V1,
    locale: "en",
    binding: {
      analyzedAt: "2026-08-20T10:00:00.000Z",
      datasetHash: "a".repeat(64),
      modelType: "EndPoint",
      axes: ["V1_PRIVATE_AXIS_1", "V1_PRIVATE_AXIS_2"],
      evidenceKey: stableEvidenceKey(evidence),
    },
    evidence,
  };
}

function interpretationRequest(): OpenEnaAiInterpretationRequestV2 {
  return {
    schemaVersion: OPEN_ENA_AI_REQUEST_SCHEMA_VERSION_V2,
    promptVersion: OPEN_ENA_AI_PROMPT_VERSION_V2,
    locale: "en",
    binding: {
      analyzedAt: "2026-08-21T10:00:00.000Z",
      datasetHash: "b".repeat(64),
      datasetHashKind: "normalized-utf8-csv-text-sha256",
      modelType: "EndPoint",
      axes: ["Confidential axis one", "Confidential axis two"],
      evidenceKey: "fnv1a32-abcdef12",
    },
    evidence: {
      kind: "endpoint-independent",
      modelType: "EndPoint",
      scope: {
        kind: "endpoint-independent",
        groupRoles: ["primary", "secondary"],
      },
      descriptive: {
        axes: [
          { id: "axis-1", role: "axis-1", varianceShare: 0.51 },
          { id: "axis-2", role: "axis-2", varianceShare: 0.32 },
        ],
        groups: [
          {
            id: "descriptive-primary",
            role: "primary",
            n: 7,
            meanCoordinates: { "axis-1": 0.234567891234, "axis-2": -0.1 },
          },
          {
            id: "descriptive-secondary",
            role: "secondary",
            n: 8,
            meanCoordinates: { "axis-1": -0.2, "axis-2": 0.1 },
          },
        ],
        edges: [{
          id: "edge-difference-1",
          sourceCodeRole: "code-1",
          targetCodeRole: "code-2",
          primaryWeight: 0.4,
          secondaryWeight: 0.2,
          signedDifference: 0.2,
        }],
        trajectory: null,
      },
      inference: [{
        id: "inference-comparison-axis-1",
        axisRole: "axis-1",
        familyRole: "comparison-family",
        status: "available",
        pRaw: 0.012345678901234,
        pHolm: 0.024691357802468,
        resolvedPMethod: "exact-classic",
        continuityCorrectionApplied: false,
        tieGroupCount: 0,
        tiedObservationCount: 0,
        warnings: [],
        test: "mann-whitney-u",
        groupRoles: ["primary", "secondary"],
        nPrimary: 7,
        nSecondary: 8,
        uPrimary: 12,
        uSecondary: 44,
        rankBiserialPrimaryVsSecondary: 0.5714285714285714,
      }],
      inferenceOmissions: [],
      boundaries: [
        "aggregate-only",
        "researcher-confirmed-inference-not-recomputed",
        "no-causal-claims",
        "p-values-do-not-establish-learning-gain",
        "p-values-do-not-establish-practical-importance",
        "axis-sign-arbitrary",
        "holm-multiplicity",
        "missingness-reported",
        "independent-entity-assumption",
        "cluster-independence-unverified",
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

test("Luna rejects a strict historical v1 request before fetch without exposing legacy evidence", async () => {
  const rawRequest = legacyInterpretationRequest();
  const request = parseOpenEnaAiInterpretationRequest(rawRequest);
  assert.equal(request.schemaVersion, OPEN_ENA_AI_REQUEST_SCHEMA_VERSION_V1);
  let fetchCalled = false;
  let capturedProviderBody = "";

  await assert.rejects(
    generateLunaInterpretation(request, {
      environment: {
        OPEN_ENA_AI_ENABLED: "true",
        OPENROUTER_API_KEY: "provider-key-must-stay-server-side",
      },
      fetch: async (_input, init) => {
        fetchCalled = true;
        capturedProviderBody = String(init?.body);
        return new Response();
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof LunaClientError);
      assert.equal(error.code, "upgrade-required");
      assert.equal(
        error.message,
        "Historical AI requests cannot be sent to the provider. Build and review a current v2 inference request.",
      );
      assert.doesNotMatch(error.message, /V1_PRIVATE|configuration|provider-key/iu);
      return true;
    },
  );

  assert.equal(fetchCalled, false);
  assert.equal(capturedProviderBody, "");
});

test("historical v1 provider dispatch always returns the fixed upgrade error before configuration checks", async () => {
  const request = parseOpenEnaAiInterpretationRequest(legacyInterpretationRequest());
  for (const environment of [
    {},
    { OPEN_ENA_AI_ENABLED: "true" },
  ] as const) {
    let fetchCalled = false;
    await assert.rejects(
      generateLunaInterpretation(request, {
        environment,
        fetch: async () => {
          fetchCalled = true;
          return new Response();
        },
      }),
      (error: unknown) => (
        error instanceof LunaClientError
        && error.code === "upgrade-required"
        && error.message === "Historical AI requests cannot be sent to the provider. Build and review a current v2 inference request."
      ),
    );
    assert.equal(fetchCalled, false);
  }
});

test("Luna v2 sends only the sanitized role/index projection and applies the confirmed-inference prompt", async () => {
  const request = interpretationRequest();
  let capturedBody = "";
  const upstreamInterpretation = {
    observedPatterns: [{
      statement: "The supplied independent-group rank comparison has a positive role-oriented effect.",
      evidenceRefs: ["inference-comparison-axis-1"],
    }],
    contextualQuestions: ["How was the independent-group design justified?"],
    limitations: ["The supplied p-value does not establish causality or practical importance."],
  };

  const response = await generateLunaInterpretation(request, {
    environment: {
      OPEN_ENA_AI_ENABLED: "true",
      OPENROUTER_API_KEY: "provider-key-must-stay-server-side",
    },
    fetch: async (_input, init) => {
      capturedBody = String(init?.body);
      return Response.json({
        choices: [{ message: { content: JSON.stringify(upstreamInterpretation) } }],
      });
    },
    clock: () => new Date("2026-08-21T12:34:56.000Z"),
  });

  const providerBody = JSON.parse(capturedBody) as {
    messages: Array<{ role: string; content: string }>;
    response_format: {
      json_schema: {
        schema: {
          properties: {
            observedPatterns: {
              items: { properties: { evidenceRefs: { items: { enum: string[] } } } };
            };
          };
        };
      };
    };
  };
  const system = providerBody.messages[0].content;
  const providerEvidence = providerBody.messages[1].content;

  assert.deepEqual(JSON.parse(providerEvidence), request.evidence);
  assert.match(system, /independent groups use Mann-Whitney U/i);
  assert.match(system, /Wilcoxon signed-rank with later-minus-earlier differences and a symmetry assumption/i);
  assert.match(system, /Friedman omnibus.*all-period-complete cohort/i);
  assert.match(system, /Holm-adjusted p.*raw p.*audit/i);
  assert.match(system, /Never infer causality, a learning gain.*practical importance/i);
  assert.match(system, /missingness.*zero-difference.*accumulated-trajectory path dependence.*MR1 circularity.*axis signs/i);
  assert.match(system, /privacy redaction.*Holm.*cannot be reconstructed|Holm.*cannot be reconstructed.*privacy redaction/i);
  assert.match(system, /Do not recompute/i);
  assert.doesNotMatch(
    providerEvidence,
    /datasetHash|datasetHashKind|analyzedAt|evidenceKey|Confidential axis|fnv1a32|b{64}|familyId|memberId|configuration|filename|referenceId|repeatedEntityColumns|timeColumn|entityToken|participant|pairedDifference|medianDifference|iqrDifference|"sourceCode"|"targetCode"/iu,
  );
  assert.doesNotMatch(capturedBody, /provider-key-must-stay-server-side/);
  assert.deepEqual(
    providerBody.response_format.json_schema.schema.properties.observedPatterns
      .items.properties.evidenceRefs.items.enum,
    [
      "axis-1",
      "axis-2",
      "descriptive-primary",
      "descriptive-secondary",
      "edge-difference-1",
      "inference-comparison-axis-1",
    ],
  );
  assert.deepEqual(response, {
    schemaVersion: "open-ena-ai-interpretation-response-v2",
    promptVersion: request.promptVersion,
    binding: request.binding,
    provider: "openrouter",
    model: "openai/gpt-5.6-luna",
    generatedAt: "2026-08-21T12:34:56.000Z",
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
