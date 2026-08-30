import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createPostgresBillableStore,
  MemoryBillableStore,
  parseBillablePolicy,
  principalRefForAccount,
  providerRefForResource,
} from "../lib/server/open-ena-billable";
import { verifyOpenEnaProviderHardBudget } from "../lib/server/luna-client";

const limits = {
  minuteRequests: 6,
  dailyMicroUsd: 20,
  monthlyMicroUsd: 40,
  globalMonthlyMicroUsd: 60,
  providerMonthlyMicroUsd: 80,
  maxConcurrency: 1,
  maxReservationMicroUsd: 10,
  longitudinalMaxReservationMicroUsd: 20,
  alertThresholds: [50, 80, 100],
} as const;

test("billable reservations enforce principal concurrency and settle conservatively", async () => {
  const store = new MemoryBillableStore();
  const first = await store.reserve({ principalRef: "p", microUsd: 10, idempotencyKey: "i", limits });
  assert.ok(first);
  assert.equal(await store.reserve({ principalRef: "p", microUsd: 1, idempotencyKey: "j", limits }), null);
  await store.settle(first, null, true);
  assert.ok(await store.reserve({ principalRef: "p", microUsd: 1, idempotencyKey: "j", limits }));
});

test("stable account principals and durable quota survive a new session token", async () => {
  const store = new MemoryBillableStore();
  const principal = principalRefForAccount("stable-account-id");
  assert.equal(principal, principalRefForAccount("stable-account-id"));
  for (let request = 0; request < limits.minuteRequests; request += 1) {
    assert.equal(await store.consumeQuota(principal, "ai-interpretation", limits.minuteRequests), true);
  }
  // A login token is intentionally absent from the quota API; the same account
  // remains denied until its durable principal window resets.
  assert.equal(await store.consumeQuota(principal, "ai-interpretation", limits.minuteRequests), false);
});

test("production billable routes contain no process-local token quota or legacy-session fallback", () => {
  const aiRoute = readFileSync(new URL("../lib/server/open-ena-ai-interpretation-route.ts", import.meta.url), "utf8");
  const longitudinalRoute = readFileSync(new URL("../lib/server/open-ena-longitudinal-route.ts", import.meta.url), "utf8");
  for (const source of [aiRoute, longitudinalRoute]) {
    assert.doesNotMatch(source, /quotaBySession/u);
    assert.doesNotMatch(source, /consumeOpenEna[A-Za-z]+Quota/u);
  }
  assert.doesNotMatch(longitudinalRoute, /verifyOpenEnaSessionToken[,\s}]/u);
  assert.match(aiRoute, /store\.consumeQuota\([\s\S]*?principal\.principalRef/u);
  assert.match(longitudinalRoute, /store\.consumeQuota\(principalRef/u);
});

test("global and provider ceilings aggregate across different principals", async () => {
  const store = new MemoryBillableStore();
  const constrained = { ...limits, maxConcurrency: 2, globalMonthlyMicroUsd: 15 };
  const first = await store.reserveDetailed({
    principalRef: "principal-a",
    resource: "ai-interpretation",
    microUsd: 10,
    idempotencyKey: "a",
    limits: constrained,
  });
  assert.equal(first.ok, true);
  const second = await store.reserveDetailed({
    principalRef: "principal-b",
    resource: "ai-interpretation",
    microUsd: 6,
    idempotencyKey: "b",
    limits: constrained,
  });
  assert.deepEqual(second, { ok: false, reason: "global-monthly-ceiling" });
});

test("test and PostgreSQL stores share the same explicit provider scope mapping", () => {
  assert.equal(providerRefForResource("ai-interpretation"), "openrouter");
  assert.equal(providerRefForResource("longitudinal"), "persistent-compute");
  assert.equal(providerRefForResource("future-resource"), "resource:future-resource");
});

test("settle and release are exactly once and reconcile the reservation's original UTC period", async () => {
  const store = new MemoryBillableStore();
  const dayOne = new Date("2026-08-30T23:59:59.000Z");
  const dayTwo = new Date("2026-08-31T00:00:01.000Z");
  const first = await store.reserveDetailed({
    principalRef: "period-principal",
    resource: "ai-interpretation",
    microUsd: 10,
    idempotencyKey: "period-one",
    limits,
    now: dayOne,
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  await store.settle(first.reservation, 0, true);
  await store.settle(first.reservation, 0, true);
  await store.release(first.reservation);
  const replacement = await store.reserveDetailed({
    principalRef: "period-principal",
    resource: "ai-interpretation",
    microUsd: 10,
    idempotencyKey: "period-two",
    limits,
    now: dayOne,
  });
  assert.equal(replacement.ok, true);
  if (!replacement.ok) return;
  await store.release(replacement.reservation);
  await store.release(replacement.reservation);
  const nextDay = await store.reserveDetailed({
    principalRef: "period-principal",
    resource: "ai-interpretation",
    microUsd: 10,
    idempotencyKey: "period-three",
    limits,
    now: dayTwo,
  });
  assert.equal(nextDay.ok, true);
});

test("a used idempotency key cannot dispatch against an already-accounted reservation", async () => {
  const store = new MemoryBillableStore();
  const first = await store.reserveDetailed({
    principalRef: "p",
    resource: "ai-interpretation",
    microUsd: 1,
    idempotencyKey: "same-attempt",
    limits,
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  await store.settle(first.reservation, 1, true);
  assert.deepEqual(await store.reserveDetailed({
    principalRef: "p",
    resource: "ai-interpretation",
    microUsd: 1,
    idempotencyKey: "same-attempt",
    limits,
  }), { ok: false, reason: "idempotency-replayed" });
});

test("an actual-cost overrun is accounted and raises a dedicated durable review alert", async () => {
  const store = new MemoryBillableStore();
  const result = await store.reserveDetailed({
    principalRef: "overrun-principal",
    resource: "ai-interpretation",
    microUsd: 10,
    idempotencyKey: "overrun-attempt",
    limits,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  await store.settle(result.reservation, 11, true);
  assert.equal(store.alerts.some((event) => (
    event.code === "reservation-overrun"
    && event.metadata?.reason === "actual-exceeded-reservation"
  )), true);
});

test("versioned billable policy requires every durable limiter and reservation control", () => {
  const environment = {
    OPEN_ENA_ACCOUNT_ID: "stable-account-id",
    OPEN_ENA_BILLING_POLICY_VERSION: "v1",
    OPEN_ENA_BILLABLE_REQUESTS_PER_MINUTE: "6",
    OPEN_ENA_AI_DAILY_MICRO_USD: "20",
    OPEN_ENA_AI_MONTHLY_MICRO_USD: "40",
    OPEN_ENA_GLOBAL_MONTHLY_MICRO_USD: "60",
    OPEN_ENA_PROVIDER_MONTHLY_MICRO_USD: "80",
    OPEN_ENA_BILLABLE_MAX_CONCURRENCY: "1",
    OPEN_ENA_AI_MAX_RESERVATION_MICRO_USD: "10",
    OPEN_ENA_LONGITUDINAL_MAX_RESERVATION_MICRO_USD: "20",
    OPEN_ENA_SECURITY_ALERT_THRESHOLDS: "50,80,100",
  };
  assert.deepEqual(parseBillablePolicy(environment), limits);
  assert.equal(parseBillablePolicy({ ...environment, OPEN_ENA_BILLABLE_REQUESTS_PER_MINUTE: undefined }), null);
});

test("budget thresholds alert once per scope and alert metadata uses a closed schema", async () => {
  const store = new MemoryBillableStore();
  const result = await store.reserveDetailed({
    principalRef: "alert-principal",
    resource: "ai-interpretation",
    microUsd: 10,
    idempotencyKey: "threshold",
    limits,
  });
  assert.equal(result.ok, true);
  assert.equal(store.alerts.some((event) => (
    event.code === "budget-threshold" && event.metadata?.scope === "principal-day"
  )), true);
  const before = store.alerts.length;
  const unsafeMetadata = { reason: "safe-reason", token: "must-not-persist" };
  await store.alert({ code: "billable-denied", principalRef: "alert-principal", metadata: unsafeMetadata });
  await store.alert({ code: "billable-denied", principalRef: "alert-principal", metadata: unsafeMetadata });
  assert.equal(store.alerts.length, before + 1);
  assert.deepEqual(store.alerts.at(-1)?.metadata, { reason: "safe-reason" });
});

test("PostgreSQL quota uses DB time and passes only principal, resource, and limit", async () => {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const store = createPostgresBillableStore(async (sql, params = []) => {
    calls.push({ sql, params });
    return { rows: [{ allowed: true }] };
  });
  assert.equal(await store.consumeQuota("principal", "longitudinal", 7), true);
  assert.match(calls[0]!.sql, /open_ena_consume_quota\(\$1,\$2,\$3\)/u);
  assert.deepEqual(calls[0]!.params, ["principal", "longitudinal", 7]);
  const unavailable = createPostgresBillableStore(async () => { throw new Error("offline"); });
  await assert.rejects(unavailable.consumeQuota("principal", "longitudinal", 7), /unavailable/u);
});

test("provider hard limit is a readiness check and fails closed", async () => {
  const fetcher = async () => Response.json({
    data: { limit_reset: "monthly", limit: 9, limit_remaining: 8 },
  });
  assert.equal(await verifyOpenEnaProviderHardBudget(
    fetcher,
    "redacted",
    10_000_000,
    10_000_000,
    1_000_000,
  ), true);
  await assert.rejects(verifyOpenEnaProviderHardBudget(
    fetcher,
    "redacted",
    8_000_000,
    8_000_000,
    1_000_000,
  ));
});
