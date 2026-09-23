import assert from "node:assert/strict";
import test from "node:test";
import { generateLunaInterpretation, LunaClientError } from "../lib/server/deepseek-client";
import { interpretationRequest } from "./helpers/ai-interpretation-request-v2";

const interpretation = {
  observedPatterns: [{ statement: "Aggregate pattern.", evidenceRefs: ["axis-1"] }],
  contextualQuestions: [],
  limitations: ["Aggregate evidence only."],
};

const configured = {
  OPEN_ENA_AI_ENABLED: "true",
  DEEPSEEK_API_KEY: "synthetic-deepseek-key",
  OPEN_ENA_AI_MODEL: "deepseek-flash",
};

test("DeepSeek balance preflight precedes a strict, non-stored aggregate Responses request", async () => {
  const calls: Array<{ url: string; body?: Record<string, unknown> }> = [];
  const result = await generateLunaInterpretation(interpretationRequest(), {
    environment: configured,
    reservationMicroUsd: 10_000,
    fetch: async (input, init) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
      calls.push({ url, body });
      if (url.endsWith("/user/balance")) return Response.json({ is_available: true });
      return Response.json({
        status: "completed",
        output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(interpretation) }] }],
        usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120, input_tokens_details: { cached_tokens: 25 } },
      });
    },
  });

  assert.deepEqual(calls.map((call) => call.url), [
    "https://api.deepseek.com/user/balance",
    "https://api.deepseek.com/responses",
  ]);
  const request = calls[1].body!;
  assert.equal(request.model, "deepseek-flash");
  assert.equal(request.store, false);
  assert.deepEqual(request.reasoning, { effort: "none" });
  assert.equal((request.text as { format: { type: string } }).format.type, "json_schema");
  assert.equal(JSON.stringify(request).includes(interpretationRequest().binding.datasetHash), false);
  assert.equal(result.response.provider, "deepseek");
  assert.equal(result.response.model, "deepseek-flash");
  assert.deepEqual(result.usage, {
    promptTokens: 100,
    completionTokens: 20,
    totalTokens: 120,
    costMicroUsd: 54,
  });
});

test("DeepSeek unavailable balance denies dispatch and keeps the operation retryable", async () => {
  const calls: string[] = [];
  await assert.rejects(
    generateLunaInterpretation(interpretationRequest(), {
      environment: configured,
      reservationMicroUsd: 10_000,
      fetch: async (input) => { calls.push(String(input)); return Response.json({ is_available: false }); },
    }),
    (error: unknown) => error instanceof LunaClientError && error.providerDispatched === false,
  );
  assert.deepEqual(calls, ["https://api.deepseek.com/user/balance"]);
});

test("OpenRouter credentials cannot activate the DeepSeek route", async () => {
  let called = false;
  await assert.rejects(
    generateLunaInterpretation(interpretationRequest(), {
      environment: { OPEN_ENA_AI_ENABLED: "true", OPENROUTER_API_KEY: "old-provider-key" },
      fetch: async () => { called = true; return Response.json({}); },
    }),
    (error: unknown) => error instanceof LunaClientError && error.code === "missing-api-key",
  );
  assert.equal(called, false);
});

test("DeepSeek does not dispatch if the reservation cannot cover the bounded request", async () => {
  let called = false;
  await assert.rejects(
    generateLunaInterpretation(interpretationRequest(), {
      environment: configured,
      reservationMicroUsd: 1,
      fetch: async () => { called = true; return Response.json({ is_available: true }); },
    }),
    (error: unknown) => error instanceof LunaClientError && error.providerDispatched === false,
  );
  assert.equal(called, false);
});

test("DeepSeek reservation includes the structured-output schema in its pre-dispatch bound", async () => {
  let called = false;
  await assert.rejects(
    generateLunaInterpretation(interpretationRequest(), {
      environment: configured,
      reservationMicroUsd: 3_500,
      fetch: async () => { called = true; return Response.json({ is_available: true }); },
    }),
    (error: unknown) => error instanceof LunaClientError && error.providerDispatched === false,
  );
  assert.equal(called, false);
});

test("DeepSeek timeout aborts balance preflight before dispatch", async () => {
  await assert.rejects(
    generateLunaInterpretation(interpretationRequest(), {
      environment: configured, timeoutMs: 5,
      fetch: async (_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("private timeout detail")), { once: true });
      }),
    }),
    (error: unknown) => error instanceof LunaClientError && error.code === "upstream-timeout"
      && error.providerDispatched === false && !error.message.includes("private timeout"),
  );
});

test("DeepSeek caller cancellation cannot dispatch after balance preflight", async () => {
  const caller = new AbortController();
  const calls: string[] = [];
  await assert.rejects(
    generateLunaInterpretation(interpretationRequest(), {
      environment: configured, signal: caller.signal,
      fetch: async (input) => {
        calls.push(String(input));
        caller.abort();
        return Response.json({ is_available: true });
      },
    }),
    (error: unknown) => error instanceof LunaClientError && error.code === "upstream-cancelled"
      && error.providerDispatched === false,
  );
  assert.deepEqual(calls, ["https://api.deepseek.com/user/balance"]);
});

test("DeepSeek 429 is rate limited without exposing provider details", async () => {
  await assert.rejects(
    generateLunaInterpretation(interpretationRequest(), {
      environment: configured,
      fetch: async () => new Response("private provider body", { status: 429 }),
    }),
    (error: unknown) => error instanceof LunaClientError && error.code === "upstream-rate-limited"
      && error.providerDispatched === false && !error.message.includes("private provider body"),
  );
});

test("DeepSeek 402 is a balance failure without exposing provider details", async () => {
  await assert.rejects(
    generateLunaInterpretation(interpretationRequest(), {
      environment: configured,
      fetch: async () => new Response("private billing body", { status: 402 }),
    }),
    (error: unknown) => error instanceof LunaClientError && error.code === "upstream-payment-required"
      && error.providerDispatched === false && !error.message.includes("private billing body"),
  );
});

test("DeepSeek network failures redact upstream details", async () => {
  await assert.rejects(
    generateLunaInterpretation(interpretationRequest(), {
      environment: configured,
      fetch: async () => { throw new Error("private network detail"); },
    }),
    (error: unknown) => error instanceof LunaClientError && error.code === "upstream-network"
      && error.providerDispatched === false && !error.message.includes("private network detail"),
  );
});

test("DeepSeek oversized response fails closed before schema parsing", async () => {
  await assert.rejects(
    generateLunaInterpretation(interpretationRequest(), {
      environment: configured,
      fetch: async (input) => String(input).endsWith("/user/balance")
        ? Response.json({ is_available: true })
        : new Response("x".repeat(70_000)),
    }),
    (error: unknown) => error instanceof LunaClientError && error.code === "upstream-malformed"
      && error.providerDispatched === true,
  );
});

test("DeepSeek malformed completion does not echo model content", async () => {
  await assert.rejects(
    generateLunaInterpretation(interpretationRequest(), {
      environment: configured,
      fetch: async (input) => String(input).endsWith("/user/balance")
        ? Response.json({ is_available: true })
        : Response.json({ status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "private completion" }] }] }),
    }),
    (error: unknown) => error instanceof LunaClientError && error.code === "upstream-malformed"
      && error.providerDispatched === true && !error.message.includes("private completion"),
  );
});

test("DeepSeek unknown request schema fails before balance or dispatch", async () => {
  let called = false;
  await assert.rejects(
    generateLunaInterpretation({ ...interpretationRequest(), schemaVersion: "untrusted" } as never, {
      environment: configured, fetch: async () => { called = true; return Response.json({}); },
    }),
    (error: unknown) => error instanceof LunaClientError && error.providerDispatched === false,
  );
  assert.equal(called, false);
});

test("DeepSeek extra sensitive evidence fails before balance or dispatch", async () => {
  let called = false;
  const request = interpretationRequest();
  await assert.rejects(
    generateLunaInterpretation({ ...request, evidence: { ...request.evidence, participantName: "PRIVATE_NAME" } } as never, {
      environment: configured, fetch: async () => { called = true; return Response.json({}); },
    }),
    (error: unknown) => error instanceof LunaClientError && error.providerDispatched === false,
  );
  assert.equal(called, false);
});
