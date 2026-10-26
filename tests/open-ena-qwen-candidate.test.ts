import assert from "node:assert/strict";
import test from "node:test";
import { interpretationRequest } from "./helpers/ai-interpretation-request-v2";
import { collectOpenEnaAiEvidenceIds } from "../lib/open-ena/ai-interpretation";
import { getApprovedOpenEnaAiPromptArtifact, instantiateOpenEnaAiResponseSchema } from "../lib/server/open-ena-ai-prompt-governance";

type CandidateModule = typeof import("../scripts/lib/open-ena-qwen-candidate");
const candidate: CandidateModule | null = await import("../scripts/lib/open-ena-qwen-candidate").catch(() => null);
function api(): CandidateModule {
  assert.ok(candidate, "the independent Qwen candidate adapter must exist");
  return candidate;
}
const apiKey = "synthetic-qwen-candidate-key";
const usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 };
const normalizedUsage = { promptTokens: 10, completionTokens: 5, totalTokens: 15 };
const valid = {
  observedPatterns: [{ statement: "Synthetic aggregate pattern.", evidenceRefs: ["axis-1"] }],
  contextualQuestions: ["What contextual factors merit review?"],
  limitations: ["Synthetic aggregate evidence cannot establish causality."],
};
function completion(interpretation: unknown = valid, finishReason = "stop") {
  return { model: "qwen3.7-plus-2026-05-26", choices: [{ index: 0, finish_reason: finishReason,
    message: { role: "assistant", content: JSON.stringify(interpretation) } }], usage };
}

for (const locale of ["en", "zh-hans", "zh-hant"] as const) {
  test(`${locale} changes only the unsupported transport keyword and retains the approved request`, () => {
    const { prepareQwenCandidateRequest, QWEN_CANDIDATE } = api();
    const request = interpretationRequest(locale);
    const before = structuredClone(request);
    const prepared = prepareQwenCandidateRequest(request);
    const approved = getApprovedOpenEnaAiPromptArtifact(request.promptVersion, locale);
    const originalSchema = instantiateOpenEnaAiResponseSchema(request.promptVersion, locale, [...collectOpenEnaAiEvidenceIds(request.evidence)]);
    const expectedTransport = JSON.parse(JSON.stringify(originalSchema));
    delete expectedTransport.properties.observedPatterns.items.properties.evidenceRefs.uniqueItems;
    assert.deepEqual(prepared.originalSchema, originalSchema);
    assert.ok(Object.isFrozen(prepared.originalSchema));
    assert.deepEqual(prepared.transportSchema, expectedTransport);
    assert.deepEqual(prepared.omittedSchemaKeywords, ["/properties/observedPatterns/items/properties/evidenceRefs/uniqueItems"]);
    assert.deepEqual(prepared.normalizedRequest, request);
    assert.deepEqual(request, before);
    assert.deepEqual(prepared.body, {
      model: "qwen3.7-plus-2026-05-26", stream: false, enable_thinking: false, max_tokens: 1800,
      messages: [{ role: "system", content: approved.systemPrompt }, { role: "user", content: JSON.stringify(request.evidence) }],
      response_format: { type: "json_schema", json_schema: { name: "open_ena_ai_interpretation", strict: true, schema: expectedTransport } },
    });
    assert.deepEqual(QWEN_CANDIDATE, { provider: "alibaba-model-studio", model: "qwen3.7-plus-2026-05-26", region: "cn-beijing",
      endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", timeoutMilliseconds: 20000, maximumOutputTokens: 1800 });
    assert.equal(JSON.stringify(prepared.body).includes(request.binding.datasetHash), false);
    assert.equal(originalSchema.properties.observedPatterns.items.properties.evidenceRefs.uniqueItems, true);
  });
}

test("one pinned POST returns exact raw evidence, strict interpretation and provider usage", async () => {
  const { generateQwenCandidate, prepareQwenCandidateRequest, QWEN_CANDIDATE } = api();
  const request = interpretationRequest();
  const raw = new TextEncoder().encode(JSON.stringify(completion()));
  let calls = 0;
  const result = await generateQwenCandidate(request, { apiKey, fetch: async (input, init) => {
    calls++;
    assert.equal(input, QWEN_CANDIDATE.endpoint);
    assert.equal(init?.method, "POST");
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal);
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${apiKey}`);
    assert.equal(new Headers(init?.headers).get("content-type"), "application/json");
    assert.equal(init?.body, JSON.stringify(prepareQwenCandidateRequest(request).body));
    return new Response(raw, { headers: { "content-type": "application/json" } });
  } });
  assert.equal(calls, 1);
  assert.deepEqual(result.interpretation, valid);
  assert.deepEqual(result.rawInterpretation, valid);
  assert.deepEqual(result.rawBody, raw);
  assert.deepEqual(result.usage, normalizedUsage);
  assert.equal(result.responseModel, QWEN_CANDIDATE.model);
  assert.equal(result.finishReason, "stop");
  assert.equal(result.httpStatus, 200);
  assert.equal(result.outgoingRequestBody, JSON.stringify(prepareQwenCandidateRequest(request).body));
});

const rejectedInterpretations: Array<[string, unknown]> = [
  ["numeric statement", { ...valid, observedPatterns: [{ statement: 42, evidenceRefs: ["axis-1"] }] }],
  ["object question", { ...valid, contextualQuestions: [{ text: "PRIVATE_PROVIDER_TEXT" }] }],
  ["numeric limitation", { ...valid, limitations: [42] }],
  ["duplicate references", { ...valid, observedPatterns: [{ statement: "Synthetic.", evidenceRefs: ["axis-1", "axis-1"] }] }],
  ["unknown reference", { ...valid, observedPatterns: [{ statement: "Synthetic.", evidenceRefs: ["unknown-evidence"] }] }],
  ["reference overflow", { ...valid, observedPatterns: [{ statement: "Synthetic.", evidenceRefs: Array(9).fill("axis-1") }] }],
  ["observation overflow", { ...valid, observedPatterns: Array(9).fill(valid.observedPatterns[0]) }],
  ["question overflow", { ...valid, contextualQuestions: Array(7).fill("Synthetic?") }],
  ["limitation overflow", { ...valid, limitations: Array(9).fill("Synthetic.") }],
  ["missing limitations", { observedPatterns: valid.observedPatterns, contextualQuestions: [] }],
  ["empty limitations", { ...valid, limitations: [] }],
  ["extra disclosure", { ...valid, responseFormatNote: "PRIVATE_PROVIDER_TEXT" }],
];
for (const [label, interpretation] of rejectedInterpretations) {
  test(`strict Qwen parsing rejects ${label} without projection or another POST`, async () => {
    const { generateQwenCandidate, QwenCandidateError } = api();
    let calls = 0;
    const raw = new TextEncoder().encode(JSON.stringify(completion(interpretation)));
    await assert.rejects(generateQwenCandidate(interpretationRequest(), { apiKey, fetch: async () => {
      calls++;
      return new Response(raw, { headers: { "content-type": "application/json" } });
    } }), (error: unknown) => {
      assert.ok(error instanceof QwenCandidateError);
      assert.equal(error.code, "invalid-interpretation");
      assert.equal(error.providerDispatched, true);
      assert.equal(error.httpStatus, 200);
      assert.deepEqual(error.usage, normalizedUsage);
      assert.deepEqual(error.rawBody, raw);
      assert.equal(error.message.includes("PRIVATE_PROVIDER_TEXT"), false);
      return true;
    });
    assert.equal(calls, 1);
  });
}

test("finish_reason length rejects even valid JSON while retaining usage and raw response", async () => {
  const { generateQwenCandidate, QwenCandidateError } = api();
  const raw = new TextEncoder().encode(JSON.stringify(completion(valid, "length")));
  await assert.rejects(generateQwenCandidate(interpretationRequest(), { apiKey, fetch: async () => new Response(raw) }), (error: unknown) => {
    assert.ok(error instanceof QwenCandidateError);
    assert.equal(error.code, "incomplete-response");
    assert.deepEqual(error.rawBody, raw);
    assert.deepEqual(error.usage, normalizedUsage);
    return true;
  });
});

for (const kind of ["changed model", "refusal", "tool calls"] as const) {
  test(`a completed envelope with ${kind} cannot count as the pinned candidate`, async () => {
    const { generateQwenCandidate, QwenCandidateError } = api();
    const payload = completion();
    if (kind === "changed model") payload.model = "different-model";
    else Object.assign(payload.choices[0].message, kind === "refusal"
      ? { refusal: "Synthetic refusal." } : { tool_calls: [{ type: "function", function: { name: "unused", arguments: "{}" } }] });
    const raw = new TextEncoder().encode(JSON.stringify(payload));
    await assert.rejects(generateQwenCandidate(interpretationRequest(), { apiKey, fetch: async () => new Response(raw) }), (error: unknown) => {
      assert.ok(error instanceof QwenCandidateError);
      assert.equal(error.code, "invalid-response");
      assert.deepEqual(error.rawBody, raw);
      assert.deepEqual(error.usage, normalizedUsage);
      return true;
    });
  });
}

test("HTTP errors retain bounded response bytes and validated usage without retrying", async () => {
  const { generateQwenCandidate, QwenCandidateError } = api();
  const raw = new TextEncoder().encode(JSON.stringify({ error: { message: "PRIVATE_PROVIDER_TEXT" }, usage }));
  let calls = 0;
  await assert.rejects(generateQwenCandidate(interpretationRequest(), { apiKey, fetch: async () => {
    calls++; return new Response(raw, { status: 429 });
  } }), (error: unknown) => {
    assert.ok(error instanceof QwenCandidateError);
    assert.equal(error.code, "http-error");
    assert.equal(error.httpStatus, 429);
    assert.deepEqual(error.rawBody, raw);
    assert.deepEqual(error.usage, normalizedUsage);
    assert.equal(error.message.includes("PRIVATE_PROVIDER_TEXT"), false);
    return true;
  });
  assert.equal(calls, 1);
});

test("non-JSON and malformed chat envelopes remain rejected with their original bytes", async () => {
  const { generateQwenCandidate, QwenCandidateError } = api();
  for (const [text, code] of [["not JSON: PRIVATE_PROVIDER_TEXT", "invalid-json"], [JSON.stringify({ ...completion(), choices: [] }), "invalid-response"]]) {
    await assert.rejects(generateQwenCandidate(interpretationRequest(), { apiKey, fetch: async () => new Response(text) }), (error: unknown) => {
      assert.ok(error instanceof QwenCandidateError);
      assert.equal(error.code, code);
      assert.equal(new TextDecoder().decode(error.rawBody), text);
      assert.equal(error.message.includes("PRIVATE_PROVIDER_TEXT"), false);
      return true;
    });
  }
});

test("streamed overflow retains at most the 64 KiB prefix and cancels without awaiting cancellation", async () => {
  const { generateQwenCandidate, QwenCandidateError } = api();
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(65_537)); },
    cancel() { cancelled = true; return new Promise(() => {}); },
  });
  await assert.rejects(generateQwenCandidate(interpretationRequest(), { apiKey, timeoutMs: 100, fetch: async () => new Response(body) }), (error: unknown) => {
    assert.ok(error instanceof QwenCandidateError);
    assert.equal(error.code, "response-too-large");
    assert.equal(error.rawBody?.length, 65_536);
    return true;
  });
  assert.equal(cancelled, true);
});

test("an independently timed stalled body cancels without awaiting cancellation and retains its prefix", { timeout: 1000 }, async () => {
  const { generateQwenCandidate, QwenCandidateError } = api();
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode("{")); },
    cancel() { cancelled = true; return new Promise(() => {}); },
  });
  await assert.rejects(generateQwenCandidate(interpretationRequest(), { apiKey, timeoutMs: 20, fetch: async () => new Response(body, { status: 503 }) }), (error: unknown) => {
    assert.ok(error instanceof QwenCandidateError);
    assert.equal(error.code, "timeout");
    assert.equal(error.httpStatus, 503);
    assert.equal(new TextDecoder().decode(error.rawBody), "{");
    return true;
  });
  assert.equal(cancelled, true);
});

test("the same deadline bounds a fetch implementation that ignores AbortSignal", { timeout: 1000 }, async () => {
  const { generateQwenCandidate, QwenCandidateError } = api();
  let calls = 0;
  await assert.rejects(generateQwenCandidate(interpretationRequest(), { apiKey, timeoutMs: 20, fetch: async () => {
    calls++; return new Promise<Response>(() => {});
  } }), (error: unknown) => error instanceof QwenCandidateError && error.code === "timeout" && error.providerDispatched);
  assert.equal(calls, 1);
});

test("network exception text never appears in the candidate error", async () => {
  const { generateQwenCandidate, QwenCandidateError } = api();
  await assert.rejects(generateQwenCandidate(interpretationRequest(), { apiKey, fetch: async () => { throw new Error(`PRIVATE_PROVIDER_TEXT ${apiKey}`); } }), (error: unknown) => {
    assert.ok(error instanceof QwenCandidateError);
    assert.equal(error.code, "network");
    assert.equal(error.providerDispatched, true);
    assert.equal(error.message.includes(apiKey), false);
    assert.equal(error.message.includes("PRIVATE_PROVIDER_TEXT"), false);
    return true;
  });
});

test("invalid request, key and timeout fail before the injected transport", async () => {
  const { generateQwenCandidate, QwenCandidateError } = api();
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; throw new Error("must not dispatch"); };
  for (const [request, options, code] of [
    [{ ...interpretationRequest(), locale: "invalid" }, { apiKey }, "invalid-request"],
    [interpretationRequest(), { apiKey: "" }, "invalid-api-key"],
    [interpretationRequest(), { apiKey, timeoutMs: 20_001 }, "invalid-timeout"],
  ] as const) {
    await assert.rejects(generateQwenCandidate(request as ReturnType<typeof interpretationRequest>, { ...options, fetch: fetcher }),
      (error: unknown) => error instanceof QwenCandidateError && error.code === code && !error.providerDispatched);
  }
  assert.equal(calls, 0);
});
