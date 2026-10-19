import { OPEN_ENA_AI_OWNER_HEADER, openEnaAiOperationOwnerKey } from "../lib/open-ena/ai-operation-owner";
import assert from "node:assert/strict";
import test from "node:test";
import { generateLunaInterpretation, LunaClientError } from "../lib/server/deepseek-client";
import { createOpenEnaAiInterpretationPostHandler } from "../lib/server/open-ena-ai-interpretation-route";
import { MemoryBillableStore } from "../lib/server/open-ena-billable";
import { OPEN_ENA_AI_CONSENT_VALUE, OPEN_ENA_AI_OPERATION_HEADER, parseOpenEnaAiInterpretationRequest } from "../lib/open-ena/ai-interpretation";
import { interpretationRequest } from "./helpers/ai-interpretation-request-v2";

const environment = { OPEN_ENA_AI_ENABLED: "true", DEEPSEEK_API_KEY: "synthetic-overrun-key", OPEN_ENA_AI_MODEL: "deepseek-flash", OPEN_ENA_PUBLIC_ORIGIN: "https://review.invalid" };
const limits = { minuteRequests: 20, dailyMicroUsd: 20_000, monthlyMicroUsd: 20_000, globalMonthlyMicroUsd: 20_000, providerMonthlyMicroUsd: 20_000, maxConcurrency: 1, maxReservationMicroUsd: 10_000, longitudinalMaxReservationMicroUsd: 10_000, alertThresholds: [] };
const interpretation = { observedPatterns: [{ statement: "Synthetic aggregate pattern.", evidenceRefs: ["axis-1"] }], contextualQuestions: [], limitations: ["Aggregate evidence only."] };

function transport(usage: unknown, dispatched = () => {}) {
  return (async (input) => {
    if (String(input).endsWith("/user/balance")) return Response.json({ is_available: true });
    dispatched();
    return Response.json({ status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(interpretation) }] }], usage });
  }) satisfies typeof fetch;
}

function request(operation = "aiop-01234567-89ab-4cde-8f01-23456789abcd", principal = "synthetic-overrun-principal") {
  return new Request("https://review.invalid/api/open-ena/ai-interpretation", { method: "POST", headers: { [OPEN_ENA_AI_OWNER_HEADER]: openEnaAiOperationOwnerKey(principal), origin: "https://review.invalid", "x-open-ena-ai-consent": OPEN_ENA_AI_CONSENT_VALUE, [OPEN_ENA_AI_OPERATION_HEADER]: operation }, body: JSON.stringify(interpretationRequest()) });
}

test("DeepSeek retains valid reported token cost above the dispatch reservation", async () => {
  const result = await generateLunaInterpretation(interpretationRequest(), { environment, reservationMicroUsd: 10_000, fetch: transport({ input_tokens: 40_000, output_tokens: 100, total_tokens: 40_100 }) });
  assert.deepEqual(result.usage, { promptTokens: 40_000, completionTokens: 100, totalTokens: 40_100, costMicroUsd: 12_120 });
});

test("real DeepSeek parsing and AI handler account an overrun, alert, and stop a fresh operation above the ceiling", async () => {
  const store = new MemoryBillableStore();
  // Same receipt contract as production, backed only by the isolated memory store.
  const record = store.recordAiConsentReceipt.bind(store);
  const update = store.updateAiConsentReceiptStatus.bind(store);
  store.recordAiConsentReceipt = async (input) => { const receipt = await record(input); return receipt && { ...receipt, durable: true }; };
  store.updateAiConsentReceiptStatus = async (input) => { const receipt = await update(input); return receipt && { ...receipt, durable: true }; };
  let dispatches = 0;
  const handler = createOpenEnaAiInterpretationPostHandler({ environment, verifyPrincipal: () => ({ principalRef: "synthetic-overrun-principal" }), authConfigurationReady: () => true, billableStore: store, requireBillable: true, limits, parseRequest: parseOpenEnaAiInterpretationRequest, generate: (payload, signal) => generateLunaInterpretation(payload, { environment, signal, reservationMicroUsd: 10_000, fetch: transport({ input_tokens: 40_000, output_tokens: 100, total_tokens: 40_100 }, () => { dispatches += 1; }) }) });
  assert.equal((await handler(request())).status, 200);
  assert.equal((await handler(request())).status, 409, "the paid operation cannot replay");
  assert.equal((await handler(request("aiop-fedcba98-7654-4321-8fed-cba987654321"))).status, 503, "reported spend plus a fresh reservation exceeds the 20,000 ceiling");
  assert.equal(dispatches, 1);
  assert.equal(store.alerts.filter((event) => event.code === "reservation-overrun").length, 1);
  assert.equal(store.alerts.some((event) => event.code === "provider-usage-missing"), false);
});

test("DeepSeek usage controls preserve zero and ordinary costs while malformed reports stay unknown", async () => {
  for (const [usage, expected] of [
    [{ input_tokens: 0, output_tokens: 0, total_tokens: 0 }, 0],
    [{ input_tokens: 100, output_tokens: 20, total_tokens: 120 }, 54],
    [{ input_tokens: -1, output_tokens: 1, total_tokens: 0 }, null],
    [{ input_tokens: 1, output_tokens: 1, total_tokens: 3 }, null],
    [{ input_tokens: 0.5, output_tokens: 1, total_tokens: 1.5 }, null],
    [{ input_tokens: Number.MAX_SAFE_INTEGER + 1, output_tokens: 0, total_tokens: Number.MAX_SAFE_INTEGER + 1 }, null],
    [null, null],
  ] as const) {
    const result = await generateLunaInterpretation(interpretationRequest(), { environment, reservationMicroUsd: 10_000, fetch: transport(usage) });
    assert.equal(result.usage?.costMicroUsd ?? null, expected, JSON.stringify(usage));
  }
});

for (const malformed of ["invalid-json", "invalid-interpretation", "invalid-response-shape"] as const) {
  test(`DeepSeek ${malformed} preserves independently validated overrun usage for failed-operation accounting`, async () => {
    const store = new MemoryBillableStore();
    const recordedCosts: Array<number | null> = [];
    const settle = store.settle.bind(store);
    store.settle = async (reservation, cost, dispatched) => { recordedCosts.push(cost); await settle(reservation, cost, dispatched); };
    let dispatches = 0;
    const generate = (payload: ReturnType<typeof interpretationRequest>, signal?: AbortSignal) => generateLunaInterpretation(payload, {
      environment, signal, reservationMicroUsd: 10_000,
      fetch: async (input) => {
        if (String(input).endsWith("/user/balance")) return Response.json({ is_available: true });
        dispatches++;
        return Response.json({
          status: malformed === "invalid-response-shape" ? "incomplete" : "completed",
          output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: malformed === "invalid-json" ? "{" : JSON.stringify({ observedPatterns: [], contextualQuestions: [], limitations: [] }) }] }],
          usage: { input_tokens: 40_000, output_tokens: 100, total_tokens: 40_100 },
        });
      },
    });
    const handler = createOpenEnaAiInterpretationPostHandler({ environment, verifyPrincipal: () => ({ principalRef: "failed-output-principal" }), authConfigurationReady: () => true, billableStore: store, limits, parseRequest: parseOpenEnaAiInterpretationRequest, generate: (payload, signal) => generate(payload as ReturnType<typeof interpretationRequest>, signal) });
    const failed = await handler(request(undefined, "failed-output-principal"));
    assert.equal(failed.status, 502);
    assert.equal(failed.headers.get("x-open-ena-ai-retry"), null, "a billed failure never authorizes an automatic paid retry");
    assert.doesNotMatch(await failed.text(), /12120|40000|synthetic/u, "accounting metadata stays server-side");
    assert.deepEqual(recordedCosts, [12_120]);
    assert.equal((await handler(request(undefined, "failed-output-principal"))).status, 409);
    assert.equal((await handler(request("aiop-fedcba98-7654-4321-8fed-cba987654321", "failed-output-principal"))).status, 503);
    assert.equal(dispatches, 1);
    assert.equal(store.alerts.filter((event) => event.code === "reservation-overrun").length, 1);
  });
}

test("failed scientific output carries ordinary valid cost, while malformed or missing usage keeps the full reservation", async () => {
  for (const [usage, expected] of [
    [{ input_tokens: 100, output_tokens: 20, total_tokens: 120 }, 54],
    [{ input_tokens: -1, output_tokens: 1, total_tokens: 0 }, null],
    [{ input_tokens: 100, output_tokens: 20, total_tokens: 121 }, null],
    [null, null],
  ] as const) {
    let failure: unknown;
    try {
      await generateLunaInterpretation(interpretationRequest(), { environment, reservationMicroUsd: 10_000, fetch: async (input) => String(input).endsWith("/user/balance") ? Response.json({ is_available: true }) : Response.json({ status: "completed", output: [], usage }) });
    } catch (error) { failure = error; }
    assert.ok(failure instanceof LunaClientError);
    assert.equal(failure.providerDispatched, true);
    const store = new MemoryBillableStore();
    let settled: number | null | undefined;
    const settle = store.settle.bind(store);
    store.settle = async (reservation, cost, dispatched) => { settled = cost; await settle(reservation, cost, dispatched); };
    const handler = createOpenEnaAiInterpretationPostHandler({ environment, verifyPrincipal: () => ({ principalRef: "usage-control" }), authConfigurationReady: () => true, billableStore: store, limits: { ...limits, dailyMicroUsd: 10_000 }, parseRequest: parseOpenEnaAiInterpretationRequest, generate: async () => { throw failure; } });
    assert.equal((await handler(request(undefined, "usage-control"))).status, 502);
    assert.equal(settled, expected);
    const remainder = await store.reserveDetailed({ principalRef: "usage-control", resource: "ai-interpretation", microUsd: 1, idempotencyKey: "remaining", limits: { ...limits, dailyMicroUsd: 10_000 } });
    assert.equal(remainder.ok, expected !== null, "unknown usage retains the complete reservation charge");
  }
});
