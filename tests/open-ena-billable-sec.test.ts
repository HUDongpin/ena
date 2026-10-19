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

test("expired reservations recover concurrency without refunding unknown usage or permitting replay", async () => {
  const store = new MemoryBillableStore();
  const started = new Date("2026-09-30T12:00:00.000Z");
  const reserve = (idempotencyKey: string, now: Date, microUsd = 10) => store.reserveDetailed({
    principalRef: "abandoned-principal", resource: "ai-interpretation", microUsd,
    idempotencyKey, limits, now,
  });
  const abandoned = await reserve("abandoned", started);
  assert.equal(abandoned.ok, true);
  if (!abandoned.ok) return;
  assert.deepEqual(await reserve("replacement", new Date(started.getTime() + 299_999)), {
    ok: false, reason: "concurrency",
  }, "a live lease must keep its concurrency slot");
  const recovered = await reserve("replacement", new Date(started.getTime() + 300_000));
  assert.equal(recovered.ok, true, "an expired lease must free abandoned concurrency");
  if (!recovered.ok) return;
  assert.equal(store.alerts.some((event) => event.code === "reservation-lease-expired"), true);
  assert.deepEqual(await reserve("abandoned", new Date(started.getTime() + 300_001)), {
    ok: false, reason: "idempotency-replayed",
  });
  // Late callbacks from the abandoned handler cannot refund its conservative charge.
  await store.release(abandoned.reservation);
  await store.settle(abandoned.reservation, 0, false);
  await store.settle(recovered.reservation, null, true);
  assert.deepEqual(await reserve("over-budget", new Date(started.getTime() + 300_002), 1), {
    ok: false, reason: "daily-ceiling",
  }, "both full reservations must remain charged");
});

test("lease recovery keeps original-period global spend and covers both billable resources", async () => {
  const store = new MemoryBillableStore();
  const constrained = { ...limits, dailyMicroUsd: 100, globalMonthlyMicroUsd: 15 };
  const reserve = (principalRef: string, resource: string, idempotencyKey: string, now: string, microUsd = 10) => store.reserveDetailed({
    principalRef, resource, idempotencyKey, microUsd, limits: constrained, now: new Date(now),
  });
  assert.equal((await reserve("p", "longitudinal", "old", "2026-09-30T23:58:00Z")).ok, true);
  const replacement = await reserve("p", "ai-interpretation", "new", "2026-10-01T00:03:00Z");
  assert.equal(replacement.ok, true, "a previous-month longitudinal slot must be recoverable by AI");
  assert.deepEqual(await reserve("other", "ai-interpretation", "old-period", "2026-09-30T23:59:00Z", 6), {
    ok: false, reason: "global-monthly-ceiling",
  }, "recovery cannot remove the original month's global spend");
});

test("PostgreSQL reservations require the atomic lease-aware migration and fail closed without it", async () => {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const store = createPostgresBillableStore(async (sql, params = []) => {
    calls.push({ sql, params });
    return { rows: [{ allowed: false, reason: "concurrency" }] };
  });
  assert.deepEqual(await store.reserveDetailed!({ principalRef: "p", resource: "ai-interpretation", microUsd: 10, idempotencyKey: "k", limits }), {
    ok: false, reason: "concurrency",
  });
  assert.match(calls[0]!.sql, /open_ena_reserve_billable_v2\(\$1,\$2,\$3,\$4,\$5\)/u);
  assert.equal(calls.length, 1, "recovery and admission must be one database transaction");
  assert.deepEqual(calls[0]!.params.slice(0, 4), ["p", "ai-interpretation", 10, "k"]);
  const unmigrated = createPostgresBillableStore(async () => { throw Object.assign(new Error("missing function"), { code: "42883" }); });
  assert.deepEqual(await unmigrated.reserveDetailed!({ principalRef: "p", microUsd: 10, idempotencyKey: "k", limits }), {
    ok: false, reason: "store-failure",
  });
});

test("PostgreSQL dispatch freshness starts before reservation I/O rather than after it", async (t) => {
  let elapsed = 1_000;
  t.mock.method(performance, "now", () => elapsed);
  const store = createPostgresBillableStore(async () => {
    elapsed += 250_000; // A delayed DB reply must not renew the dispatch window.
    return { rows: [{
      allowed: true,
      reservation: { id: "synthetic", principal_ref: "p", reserved_micro_usd: 10, resource: "ai-interpretation", dispatched: false },
    }] };
  });
  const result = await store.reserveDetailed!({ principalRef: "p", microUsd: 10, idempotencyKey: "k", limits });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.reservation.dispatchDeadlineMonotonicMs, 121_000);
  assert.ok(result.reservation.dispatchDeadlineMonotonicMs < performance.now());
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
  assert.equal(providerRefForResource("ai-interpretation"), "deepseek");
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
