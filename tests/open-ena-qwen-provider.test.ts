import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { interpretationRequest } from "./helpers/ai-interpretation-request-v2";
import { LunaClientError } from "../lib/server/deepseek-client";
import { createOpenEnaAiInterpretationPostHandler } from "../lib/server/open-ena-ai-interpretation-route";
import { createPostgresBillableStore, MemoryBillableStore, providerRefForResource } from "../lib/server/open-ena-billable";
import { OPEN_ENA_AI_CONSENT_VALUE, parseOpenEnaAiInterpretationRequest, parseOpenEnaAiInterpretationRequestV2 } from "../lib/open-ena/ai-interpretation";
import { OPEN_ENA_AI_OWNER_HEADER, openEnaAiOperationOwnerKey } from "../lib/open-ena/ai-operation-owner";

type QwenModule = typeof import("../lib/server/qwen-client");
type ProviderModule = typeof import("../lib/server/open-ena-ai-provider");
const qwen: QwenModule | null = await import("../lib/server/qwen-client").catch(() => null);
const provider: ProviderModule | null = await import("../lib/server/open-ena-ai-provider").catch(() => null);
function api() { assert.ok(qwen, "production Qwen adapter exists"); assert.ok(provider, "explicit provider selector exists"); return { ...qwen, ...provider }; }
const environment = { OPEN_ENA_AI_ENABLED: "true", OPEN_ENA_AI_PROVIDER: "qwen", OPEN_ENA_QWEN_API_KEY: "synthetic-owned-qwen-key",
  OPEN_ENA_AI_MODEL: "qwen3.7-plus-2026-05-26", OPEN_ENA_PUBLIC_ORIGIN: "https://qwen-test.invalid" };
const limits = { minuteRequests: 50, dailyMicroUsd: 1_000_000, monthlyMicroUsd: 1_000_000, globalMonthlyMicroUsd: 1_000_000,
  providerMonthlyMicroUsd: 20_000, maxConcurrency: 5, maxReservationMicroUsd: 10_000, longitudinalMaxReservationMicroUsd: 10_000, alertThresholds: [] };
const interpretation = { observedPatterns: [{ statement: "Synthetic aggregate evidence.", evidenceRefs: ["axis-1"] }], contextualQuestions: [], limitations: ["No causal claim."] };
const providerConsent = "provider-v1:qwen:qwen3.7-plus-2026-05-26:cn-beijing";
function completion(value: unknown = interpretation, usage: unknown = { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }) {
  return { model: environment.OPEN_ENA_AI_MODEL, choices: [{ finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(value) } }], usage };
}

for (const locale of ["en", "zh-hans", "zh-hant"] as const) {
  test(`production ${locale} sends the exact frozen successful candidate body in one POST`, async () => {
    const { generateOpenEnaAiInterpretation, QWEN_CANDIDATE } = api();
    const plan = JSON.parse(readFileSync("docs/evidence/qwen-candidate-20261026/live-nine-plan.json", "utf8"));
    const original = JSON.parse(readFileSync("tests/fixtures/ai-live-fixed-synthetic-request-20261026.json", "utf8"));
    const request = parseOpenEnaAiInterpretationRequestV2({ ...original, locale });
    let calls = 0;
    const result = await generateOpenEnaAiInterpretation(request, { environment, reservationMicroUsd: 10_000, fetch: async (input, init) => {
      calls++;
      assert.equal(input, QWEN_CANDIDATE.endpoint);
      assert.equal(init?.method, "POST"); assert.equal(init?.redirect, "error");
      const digest = createHash("sha256").update(String(init?.body)).digest("hex");
      assert.equal(digest, plan.cases.find((item: { locale: string }) => item.locale === locale).outgoingBodySha256);
      return Response.json(completion());
    } });
    assert.equal(calls, 1);
    assert.equal(result.response.provider, "qwen");
    assert.equal(result.response.model, QWEN_CANDIDATE.model);
    assert.deepEqual(result.response.binding, request.binding);
    assert.deepEqual(result.usage, { promptTokens: 100, completionTokens: 20, totalTokens: 120, costMicroUsd: 50 });
  });
}

test("Qwen uses its own undiscounted tiered price and rejects insufficient reservations before dispatch", async () => {
  const { qwenCostMicroUsd, generateQwenInterpretation } = api();
  assert.equal(qwenCostMicroUsd(100, 20), 50);
  assert.equal(qwenCostMicroUsd(40_000, 100), 11_151);
  assert.equal(qwenCostMicroUsd(300_000, 20), 247_867);
  assert.equal(qwenCostMicroUsd(0, 0), 0);
  let calls = 0;
  await assert.rejects(generateQwenInterpretation(interpretationRequest(), { environment, reservationMicroUsd: 1, fetch: async () => {
    calls++; return Response.json(completion());
  } }), (error: unknown) => error instanceof LunaClientError && error.code === "invalid-configuration" && !error.providerDispatched);
  assert.equal(calls, 0);
});

test("provider selection is explicit and a missing Qwen key never uses another provider's key", async () => {
  const { generateOpenEnaAiInterpretation } = api();
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; throw new Error("must not dispatch"); };
  for (const candidate of [
    { ...environment, OPEN_ENA_QWEN_API_KEY: undefined, DASHSCOPE_API_KEY: "unrelated-key", DEEPSEEK_API_KEY: "unrelated-key" },
    { ...environment, OPEN_ENA_AI_PROVIDER: "unsupported" },
    { ...environment, OPEN_ENA_AI_MODEL: "other-model" },
  ]) await assert.rejects(generateOpenEnaAiInterpretation(interpretationRequest(), { environment: candidate, fetch: fetcher }),
    (error: unknown) => error instanceof LunaClientError && !error.providerDispatched);
  assert.equal(calls, 0);
  const urls: string[] = [];
  await generateOpenEnaAiInterpretation(interpretationRequest(), { environment: { OPEN_ENA_AI_ENABLED: "true", DEEPSEEK_API_KEY: "synthetic-legacy-key" }, fetch: async input => {
    urls.push(String(input));
    return String(input).endsWith("/user/balance") ? Response.json({ is_available: true })
      : Response.json({ status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(interpretation) }] }] });
  } });
  assert.deepEqual(urls, ["https://api.deepseek.com/user/balance", "https://api.deepseek.com/responses"]);
});

test("caller cancellation before Qwen dispatch stays releasable", async () => {
  const { generateQwenInterpretation } = api();
  const controller = new AbortController(); controller.abort();
  let calls = 0;
  await assert.rejects(generateQwenInterpretation(interpretationRequest(), { environment, signal: controller.signal, fetch: async () => {
    calls++; return Response.json(completion());
  } }), (error: unknown) => error instanceof LunaClientError && error.code === "upstream-cancelled" && !error.providerDispatched);
  assert.equal(calls, 0);
});

test("caller cancellation after dispatch is bounded even if fetch ignores its signal", { timeout: 1000 }, async () => {
  const { generateQwenInterpretation } = api();
  const controller = new AbortController();
  let calls = 0;
  const result = generateQwenInterpretation(interpretationRequest(), { environment, signal: controller.signal, fetch: async () => {
    calls++; queueMicrotask(() => controller.abort()); return new Promise<Response>(() => {});
  } });
  await assert.rejects(result, (error: unknown) => error instanceof LunaClientError && error.code === "upstream-cancelled" && error.providerDispatched);
  assert.equal(calls, 1);
});

test("Qwen provider mapping is explicit and old reservations retain their provider on settlement and release", async () => {
  const selected = { OPEN_ENA_AI_PROVIDER: "qwen" };
  assert.equal(providerRefForResource("ai-interpretation", selected), "qwen");
  const store = new MemoryBillableStore(selected);
  const policy = { ...limits, providerMonthlyMicroUsd: 100 };
  const reserve = (key: string, amount: number) => store.reserveDetailed({ principalRef: key, resource: "ai-interpretation", idempotencyKey: key, microUsd: amount, limits: policy });
  const first = await reserve("qwen-old", 80); assert.equal(first.ok, true); if (!first.ok) return;
  selected.OPEN_ENA_AI_PROVIDER = "deepseek";
  const second = await reserve("deepseek-new", 80); assert.equal(second.ok, true); if (!second.ok) return;
  await store.settle(first.reservation, 20, true);
  assert.deepEqual(await reserve("deepseek-over-budget", 21), { ok: false, reason: "provider-monthly-ceiling" });
  selected.OPEN_ENA_AI_PROVIDER = "qwen";
  await store.release(second.reservation);
  assert.deepEqual(await reserve("qwen-over-budget", 81), { ok: false, reason: "provider-monthly-ceiling" });
  assert.equal((await reserve("qwen-remaining", 80)).ok, true);
  selected.OPEN_ENA_AI_PROVIDER = "deepseek";
  assert.equal((await reserve("deepseek-refunded", 100)).ok, true);
});

test("PostgreSQL reservations select the configured provider while later accounting uses only the bound reservation", async () => {
  const selected = { OPEN_ENA_AI_PROVIDER: "qwen" };
  const calls: Array<{ sql: string; values: readonly unknown[] }> = [];
  const store = createPostgresBillableStore(async (sql, values = []) => {
    calls.push({ sql, values });
    return { rows: [{ allowed: true, reservation: { id: "bound-qwen-reservation", principal_ref: "p", resource: "ai-interpretation", provider_ref: "qwen", reserved_micro_usd: 80 } }] };
  }, selected);
  const reserved = await store.reserveDetailed!({ principalRef: "p", resource: "ai-interpretation", idempotencyKey: "one", microUsd: 80, limits });
  assert.equal(reserved.ok, true); if (!reserved.ok) return;
  assert.equal(JSON.parse(String(calls[0].values[4])).provider, "qwen");
  selected.OPEN_ENA_AI_PROVIDER = "deepseek";
  await store.settle(reserved.reservation, 20, true);
  await store.release(reserved.reservation);
  assert.deepEqual(calls[1].values, ["bound-qwen-reservation", 20, true]);
  assert.deepEqual(calls[2].values, ["bound-qwen-reservation"]);
});

function routeRequest(operationId: string, signal?: AbortSignal) {
  return new Request("https://qwen-test.invalid/api/open-ena/ai-interpretation", { method: "POST", signal, headers: {
    origin: "https://qwen-test.invalid", "content-type": "application/json", "x-open-ena-ai-consent": OPEN_ENA_AI_CONSENT_VALUE,
    "x-open-ena-ai-operation-id": operationId, [OPEN_ENA_AI_OWNER_HEADER]: openEnaAiOperationOwnerKey("qwen-principal"),
    "x-open-ena-ai-provider-consent": providerConsent,
  }, body: JSON.stringify(interpretationRequest()) });
}

test("Qwen rejects missing or stale provider consent before admission or dispatch", async () => {
  const { generateOpenEnaAiInterpretation } = api();
  const store = new MemoryBillableStore();
  let admissions = 0, dispatches = 0;
  const reserve = store.reserveDetailed.bind(store);
  store.reserveDetailed = async input => { admissions++; return reserve(input); };
  const post = createOpenEnaAiInterpretationPostHandler({ environment, authConfigurationReady: () => true,
    verifyPrincipal: () => ({ principalRef: "qwen-principal" }), billableStore: store, limits,
    parseRequest: parseOpenEnaAiInterpretationRequest,
    generate: (request, signal) => generateOpenEnaAiInterpretation(request, { environment, signal, reservationMicroUsd: 10_000,
      fetch: async () => { dispatches++; return Response.json(completion()); } }),
  });
  for (const value of [null, "provider-v1:deepseek:deepseek-flash:provider-managed"]) {
    const request = routeRequest(`aiop-${randomUUID()}`);
    if (value === null) request.headers.delete("x-open-ena-ai-provider-consent");
    else request.headers.set("x-open-ena-ai-provider-consent", value);
    assert.equal((await post(request)).status, value === null ? 428 : 409);
  }
  assert.equal(admissions, 0);
  assert.equal(dispatches, 0);
});

test("a previously settled DeepSeek operation cannot be dispatched again after the Qwen switch", async () => {
  const { generateOpenEnaAiInterpretation } = api();
  const store = new MemoryBillableStore();
  const operation = `aiop-${randomUUID()}`;
  const previous = await store.reserveDetailed({ principalRef: "qwen-principal", provider: "deepseek", resource: "ai-interpretation",
    idempotencyKey: operation, microUsd: 10_000, limits });
  assert.equal(previous.ok, true); if (!previous.ok) return;
  await store.settle(previous.reservation, 50, true);
  let dispatches = 0;
  const post = createOpenEnaAiInterpretationPostHandler({ environment, authConfigurationReady: () => true,
    verifyPrincipal: () => ({ principalRef: "qwen-principal" }), billableStore: store, limits,
    parseRequest: parseOpenEnaAiInterpretationRequest,
    generate: (request, signal) => generateOpenEnaAiInterpretation(request, { environment, signal, fetch: async () => { dispatches++; return Response.json(completion()); } }),
  });
  assert.equal((await post(routeRequest(operation))).status, 409);
  assert.equal(dispatches, 0);
});

test("validated Qwen usage survives an unexpected failure after provider parsing", async () => {
  const { generateQwenInterpretation } = api();
  await assert.rejects(generateQwenInterpretation(interpretationRequest(), { environment, clock: () => new Date(NaN), fetch: async () => Response.json(completion()) }),
    (error: unknown) => error instanceof LunaClientError && error.providerDispatched && error.usage?.costMicroUsd === 50);
});

for (const outcome of ["invalid-output", "network", "cancelled-before-dispatch"] as const) {
  test(`actual Qwen client and route retain ledger and operation identity after ${outcome}`, async () => {
    const { generateOpenEnaAiInterpretation } = api();
    const store = new MemoryBillableStore();
    const charges: Array<number | null> = [], receiptProviders: string[] = [];
    const settle = store.settle.bind(store), record = store.recordAiConsentReceipt.bind(store), update = store.updateAiConsentReceiptStatus.bind(store);
    store.settle = async (reservation, cost, dispatched) => { charges.push(cost); await settle(reservation, cost, dispatched); };
    store.recordAiConsentReceipt = async input => { receiptProviders.push(input.provider); const receipt = await record(input); return receipt && { ...receipt, durable: true }; };
    store.updateAiConsentReceiptStatus = async input => { const receipt = await update(input); return receipt && { ...receipt, durable: true }; };
    let dispatches = 0;
    const post = createOpenEnaAiInterpretationPostHandler({ environment, authConfigurationReady: () => true,
      verifyPrincipal: () => ({ principalRef: "qwen-principal" }), billableStore: store, requireBillable: true, limits,
      parseRequest: parseOpenEnaAiInterpretationRequest,
      generate: (request, signal) => generateOpenEnaAiInterpretation(request, { environment, signal, reservationMicroUsd: 10_000, fetch: async () => {
        dispatches++;
        if (outcome === "network") throw new Error("PRIVATE_PROVIDER_OUTCOME_UNKNOWN");
        return Response.json(completion({ ...interpretation, limitations: [] }, { prompt_tokens: 40_000, completion_tokens: 100, total_tokens: 40_100 }));
      } }),
    });
    const operation = `aiop-${randomUUID()}`;
    const controller = new AbortController(); if (outcome === "cancelled-before-dispatch") controller.abort();
    const response = await post(routeRequest(operation, controller.signal));
    assert.equal(response.status, outcome === "cancelled-before-dispatch" ? 499 : 502);
    assert.deepEqual(receiptProviders, ["qwen"]);
    if (outcome === "cancelled-before-dispatch") {
      assert.equal(dispatches, 0); assert.deepEqual(charges, []);
      assert.equal(response.headers.get("x-open-ena-ai-retry"), "new-operation");
      assert.equal(await store.isReleasedOperation({ principalRef: "qwen-principal", resource: "ai-interpretation", idempotencyKey: operation }), true);
    } else {
      assert.equal(dispatches, 1);
      assert.deepEqual(charges, [outcome === "invalid-output" ? 11_151 : null]);
      assert.equal(response.headers.get("x-open-ena-ai-retry"), null);
      assert.equal((await post(routeRequest(operation))).status, 409);
      assert.equal(dispatches, 1);
      const fresh = await store.reserveDetailed({ principalRef: "qwen-new-principal", resource: "ai-interpretation", provider: "qwen", idempotencyKey: "new", microUsd: 10_001, limits });
      assert.deepEqual(fresh, { ok: false, reason: "provider-monthly-ceiling" });
    }
  });
}
