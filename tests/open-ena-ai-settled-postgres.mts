import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPostgresBillableStore } from "../lib/server/open-ena-billable.ts";
import { createOpenEnaAiInterpretationPostHandler } from "../lib/server/open-ena-ai-interpretation-route.ts";
import { OPEN_ENA_AI_OFFLINE_EVALUATION_CASES_V1 } from "../lib/server/open-ena-ai-prompt-evaluation.ts";
import { parseOpenEnaAiInterpretationRequest } from "../lib/open-ena/ai-interpretation.ts";
import { openEnaAiOperationOwnerKey } from "../lib/open-ena/ai-operation-owner.ts";
import { cleanupOwnedEphemeralPostgres } from "./support/owned-ephemeral-postgres.mjs";

const project = fileURLToPath(new URL("..", import.meta.url));
const prefix = "ena-settled-proof-";
const rootDirectory = mkdtempSync(join(tmpdir(), prefix));
const dataDirectory = join(rootDirectory, "data");
const { Pool } = createRequire(import.meta.url)("pg") as typeof import("pg");
let pool: InstanceType<typeof Pool> | undefined;
let startAttempted = false;
const checks: string[] = [];
const limits = { minuteRequests: 50, dailyMicroUsd: 100000, monthlyMicroUsd: 100000,
  globalMonthlyMicroUsd: 100000, providerMonthlyMicroUsd: 100000, maxConcurrency: 5,
  maxReservationMicroUsd: 99, longitudinalMaxReservationMicroUsd: 99, alertThresholds: [100] };
let cleanupResult;
try {
  execFileSync("initdb", ["--pgdata", dataDirectory, "--auth", "trust", "--username", "postgres", "--encoding", "UTF8", "--no-locale"], { stdio: "pipe", timeout: 60000 });
  const port = await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      server.close(error => error ? reject(error) : resolve(address.port));
    });
  });
  startAttempted = true;
  execFileSync("pg_ctl", ["--pgdata", dataDirectory, "--log", join(rootDirectory, "postgres.log"),
    "--options", `-h 127.0.0.1 -p ${port} -c unix_socket_directories=''`, "--wait", "start"], { stdio: "pipe", timeout: 60000 });
  pool = new Pool({ host: "127.0.0.1", port, user: "postgres", database: "postgres", max: 4, statement_timeout: 5000 });
  for (const name of ["001_open_ena_billable.sql", "003_open_ena_ai_consent.sql", "006_open_ena_billable_leases.sql", "007_open_ena_ai_consent_idempotency.sql"]) {
    await pool.query(readFileSync(join(project, "migrations", name), "utf8"));
  }
  const store = createPostgresBillableStore((sql, params) => pool!.query(sql, params));
  const principalRef = "settled-proof-principal";
  const resource = "ai-interpretation";
  const reserve = async (idempotencyKey: string, principal = principalRef, namedResource = resource) => {
    const result = await store.reserveDetailed!({ principalRef: principal, resource: namedResource, idempotencyKey, microUsd: 99, limits });
    assert.ok(result.ok, "owned synthetic reservation must succeed");
    return result.reservation;
  };
  const proof = (idempotencyKey: string, principal = principalRef, namedResource = resource) =>
    store.isSettledDispatchedOperation!({ principalRef: principal, resource: namedResource, idempotencyKey });
  const op = () => `aiop-${randomUUID()}`;
  const activeId = op();
  const active = await reserve(activeId);
  assert.equal(await proof(activeId), false);
  // Exercise both columns independently; only settlement can grant the proof.
  await pool.query("UPDATE open_ena_billable_reservations SET dispatched=true WHERE id=$1", [active.id]);
  assert.equal(await proof(activeId), false, "a dispatched but active operation is not settled");
  checks.push("reserved and in-flight operations do not grant a new-generation option");
  const releasedId = op();
  const released = await reserve(releasedId);
  await store.release(released);
  assert.equal(await proof(releasedId), false);
  assert.equal(await store.isReleasedOperation!({ principalRef, resource, idempotencyKey: releasedId }), true);
  const undispatchedId = op();
  await store.settle(await reserve(undispatchedId), 0, false);
  assert.equal(await proof(undispatchedId), false, "settled without dispatch is not a settled-dispatch proof");
  checks.push("pre-dispatch release remains distinct from settlement");

  await store.settle(active, 37, true);
  assert.equal(await proof(activeId), true);
  assert.equal(await proof(activeId, "another-principal"), false);
  assert.equal(await proof(activeId, principalRef, "longitudinal-v3"), false);
  assert.equal(await proof(op()), false);
  const spendBefore = (await pool.query("SELECT * FROM open_ena_spend ORDER BY scope_kind, scope_ref, period, period_start")).rows;
  for (let i = 0; i < 3; i += 1) {
    assert.equal(await proof(activeId), true);
    assert.deepEqual(await store.reserveDetailed!({ principalRef, resource, idempotencyKey: activeId, microUsd: 99, limits }),
      { ok: false, reason: "idempotency-replayed" });
  }
  assert.deepEqual((await pool.query("SELECT * FROM open_ena_spend ORDER BY scope_kind, scope_ref, period, period_start")).rows, spendBefore);
  checks.push("settled proof is principal/resource/id scoped and does not change original spend");

  const expiredId = op();
  const expired = await reserve(expiredId);
  await pool.query("UPDATE open_ena_billable_reservations SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [expired.id]);
  assert.equal(await proof(expiredId), false, "proof lookup itself does not reconcile a lease");
  const reconciler = await reserve(op());
  assert.equal(await proof(expiredId), true, "the existing ledger conservatively settles an expired unknown outcome");
  await store.release(reconciler);
  const expiredRow = (await pool.query("SELECT status, dispatched, reserved_micro_usd FROM open_ena_billable_reservations WHERE id=$1", [expired.id])).rows[0];
  assert.equal(expiredRow.status, "settled");
  assert.equal(expiredRow.dispatched, true);
  assert.equal(Number(expiredRow.reserved_micro_usd), 99);
  checks.push("lease expiry retains the reserved ceiling without claiming the provider's final charge");

  let providerCalls = 0;
  const routePrincipal = "settled-route-principal";
  const handler = createOpenEnaAiInterpretationPostHandler({
    environment: { NODE_ENV: "development" }, verifyPrincipal: () => ({ principalRef: routePrincipal }),
    authConfigurationReady: () => true, billableStore: store, limits, requireBillable: true,
    providerDescriptor: () => ({ provider: "deepseek", model: "deepseek-flash" }),
    parseRequest: parseOpenEnaAiInterpretationRequest,
    generate: async () => {
      providerCalls += 1;
      throw Object.assign(new Error("Synthetic dispatched timeout"), { code: "upstream-timeout", providerDispatched: true });
    },
  });
  const request = (operationId: string) => new Request("http://localhost/api/open-ena/ai-interpretation", {
    method: "POST", headers: { origin: "http://localhost", "content-type": "application/json",
      "x-open-ena-ai-consent": "reviewed-aggregate-v3", "x-open-ena-ai-operation-id": operationId,
      "x-open-ena-ai-owner": openEnaAiOperationOwnerKey(routePrincipal) },
    body: JSON.stringify(OPEN_ENA_AI_OFFLINE_EVALUATION_CASES_V1[0].request),
  });
  const firstId = op();
  for (const expected of [504, 409, 409]) {
    const response = await handler(request(firstId));
    assert.equal(response.status, expected);
    assert.equal(response.headers.get("x-open-ena-ai-retry"), null);
    assert.equal(response.headers.get("x-open-ena-ai-settled-retry"), "new-operation");
    assert.equal(response.headers.get("x-open-ena-ai-operation-id"), firstId);
  }
  assert.equal(providerCalls, 1);
  const routeSpend = async () => (await pool!.query(
    "SELECT micro_usd FROM open_ena_spend WHERE scope_kind='principal' AND scope_ref=$1 ORDER BY period", [routePrincipal],
  )).rows.map(row => Number(row.micro_usd));
  assert.deepEqual(await routeSpend(), [99, 99], "same-id replays retain exactly one reserved ceiling per accounting period");
  const original = (await pool.query("SELECT * FROM open_ena_billable_reservations WHERE principal_ref=$1 AND idempotency_key=$2", [routePrincipal, firstId])).rows[0];
  assert.equal((await handler(request(op()))).status, 504);
  assert.equal(providerCalls, 2, "only a separate explicit operation reaches the synthetic provider again");
  assert.deepEqual(await routeSpend(), [198, 198], "only the separate operation adds another reserved ceiling");
  assert.deepEqual((await pool.query("SELECT * FROM open_ena_billable_reservations WHERE principal_ref=$1 AND idempotency_key=$2", [routePrincipal, firstId])).rows[0], original);
  checks.push("real PostgreSQL route replays never dispatch again; a separate operation preserves the original ledger entry");
} finally {
  if (pool) await pool.end();
  cleanupResult = await cleanupOwnedEphemeralPostgres({ rootDirectory, dataDirectory, rootPrefix: prefix, startAttempted });
}
assert.equal(checks.length, 5);
const output = join(project, "output/review-regressions/ai-settled-postgres.json");
mkdirSync(join(project, "output/review-regressions"), { recursive: true });
writeFileSync(output, JSON.stringify({ status: "PASS", checks, cleanup: cleanupResult, paidProviderCalls: 0 }, null, 2) + "\n");
console.log(JSON.stringify({ status: "PASS", checks: checks.length, output, paidProviderCalls: 0 }));
