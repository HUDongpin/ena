// Isolated integration audit; run with node --import tsx tests/review-server-plugin-transactions.mjs.
// Creates its own loopback PostgreSQL and never reads deployment configuration.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { createPostgresPluginLabStore } from "../lib/plugin-lab/store.ts";
import { createPostgresBillableStore } from "../lib/server/open-ena-billable.ts";
import { cleanupOwnedEphemeralPostgres } from "./support/owned-ephemeral-postgres.mjs";

const prefix = "ena-review-plugin-transactions-";
const rootDirectory = mkdtempSync(join(tmpdir(), prefix));
const dataDirectory = join(rootDirectory, "data");
let startAttempted = false;
let pool;
const syntheticCipher = { keyVersion: "v1", iv: "synthetic", ciphertext: "synthetic", tag: "synthetic" };
const actor = "A".repeat(43);
const hash = "f".repeat(64);
try {
  execFileSync("initdb", ["--pgdata", dataDirectory, "--auth", "trust", "--username", "postgres", "--encoding", "UTF8", "--no-locale"], { stdio: "pipe", timeout: 60_000 });
  const port = await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const selected = server.address().port;
      server.close((error) => error ? reject(error) : resolve(selected));
    });
  });
  startAttempted = true;
  execFileSync("pg_ctl", ["--pgdata", dataDirectory, "--log", join(rootDirectory, "postgres.log"), "--options", `-h 127.0.0.1 -p ${port} -c unix_socket_directories=''`, "--wait", "start"], { stdio: "pipe", timeout: 60_000 });
  pool = new Pool({ host: "127.0.0.1", port, user: "postgres", database: "postgres", max: 8 });
  await pool.query(readFileSync(new URL("../migrations/005_ena_plugin_lab.sql", import.meta.url), "utf8"));
  const store = createPostgresPluginLabStore((sql, params) => pool.query(sql, params));
  const proposalId = "plg_AAAAAAAAAAAAAAAAAAAAAA";
  const proposal = {
    proposalId, accessHash: hash, payloadCipher: syntheticCipher,
    publicProjectionCipher: syntheticCipher, publicProjectionSha256: hash,
    track: "academic", visibility: "public-after-review", submittedLocale: "en",
  };
  await store.createProposal(proposal);
  assert.equal((await store.readStatus(proposalId)).events.length, 1);
  const transition = (from, to, actorRef = actor) => store.transition({
    proposalId, from, to, actorRef, messageCode: `proposal-${to}`, reasonCipher: syntheticCipher,
  });
  const race = await Promise.all([transition("received", "under-review"), transition("received", "under-review")]);
  assert.equal(race.filter(Boolean).length, 1, "only one stale-state transition can commit");
  assert.equal((await store.readStatus(proposalId)).state, "under-review");
  assert.equal((await store.readStatus(proposalId)).events.length, 2);
  await assert.rejects(transition("under-review", "selected", "invalid actor!"));
  assert.equal((await store.readStatus(proposalId)).state, "under-review", "event failure rolls back state");
  assert.equal(await transition("under-review", "selected"), true);
  assert.equal(await store.requestPublicConsent(proposalId, actor), false, "email confirmation required");
  assert.equal(await store.confirmEmail(proposalId, actor), true);
  await assert.rejects(store.requestPublicConsent(proposalId, "invalid actor!"));
  assert.equal((await store.readStatus(proposalId)).publicConsentStatus, "not-requested", "publication event failure rolls back moderation");
  assert.equal(await store.requestPublicConsent(proposalId, actor), true);
  assert.equal(await store.setPublicConsent(proposalId, "confirm", actor, "0".repeat(64)), false);
  const confirms = await Promise.all(Array.from({ length: 4 }, () => store.setPublicConsent(proposalId, "confirm", actor, hash)));
  assert.equal(confirms.filter(Boolean).length, 1, "duplicate consent confirmation cannot append duplicate events");
  assert.equal((await store.listPublicSummaries()).length, 1);
  await assert.rejects(transition("selected", "withdrawn", "short"));
  assert.equal((await store.readStatus(proposalId)).state, "selected", "publication event failure also rolls back lifecycle event");
  const withdrawals = await Promise.all([
    store.setPublicConsent(proposalId, "withdraw", actor, hash),
    transition("selected", "withdrawn"),
  ]);
  assert.ok(withdrawals.some(Boolean));
  assert.equal((await store.listPublicSummaries()).length, 0);
  const final = await store.readStatus(proposalId);
  assert.equal(final.state, "withdrawn");
  assert.equal(final.publicConsentStatus, "withdrawn");
  assert.deepEqual(final.events.map((event) => event.state), ["received", "under-review", "selected", "withdrawn"]);
  const publication = await pool.query("SELECT event_kind FROM ena_plugin_proposal_publication_events ORDER BY publication_event_id");
  assert.equal(publication.rows.filter((row) => row.event_kind === "consent-confirmed").length, 1);
  assert.equal(publication.rows.filter((row) => /withdrawn$/.test(row.event_kind)).length, 1);
  const quotas = await Promise.all(Array.from({ length: 12 }, () => store.consumeRateLimit({ scopeKind: "submission-source", scopeRef: actor, limit: 5, windowSeconds: 3600 })));
  assert.equal(quotas.filter(Boolean).length, 5);
  await pool.query("UPDATE ena_plugin_proposal_rate_limits SET window_start=clock_timestamp()-interval '2 hours' WHERE scope_kind='submission-source' AND scope_ref=$1", [actor]);
  assert.equal(await store.consumeRateLimit({ scopeKind: "submission-source", scopeRef: actor, limit: 5, windowSeconds: 3600 }), true);
  assert.equal((await pool.query("SELECT request_count FROM ena_plugin_proposal_rate_limits WHERE scope_kind='submission-source' AND scope_ref=$1", [actor])).rows[0].request_count, 1);
  console.log("PASS: isolated PostgreSQL lifecycle races, publication gates, atomic rollback, consent withdrawal and concurrent quotas");

  for (const migration of ["001_open_ena_billable.sql", "003_open_ena_ai_consent.sql", "006_open_ena_billable_leases.sql"]) {
    await pool.query(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), "utf8"));
  }
  const billing = createPostgresBillableStore((sql, params) => pool.query(sql, params));
  const limits = {
    minuteRequests: 20, dailyMicroUsd: 100, monthlyMicroUsd: 100,
    globalMonthlyMicroUsd: 100, providerMonthlyMicroUsd: 100,
    maxConcurrency: 1, maxReservationMicroUsd: 60, longitudinalMaxReservationMicroUsd: 60, alertThresholds: [50],
  };
  const reserve = (principalRef, idempotencyKey, microUsd) => billing.reserveDetailed({
    principalRef, idempotencyKey, microUsd, resource: "ai-interpretation", limits,
  });
  const concurrent = await Promise.all([reserve("principal-a", "first", 60), reserve("principal-b", "first", 60)]);
  assert.equal(concurrent.filter((result) => result.ok).length, 1, "cross-principal races respect global/provider ceiling");
  const charged = concurrent.find((result) => result.ok).reservation;
  await Promise.all([billing.settle(charged, 30, true), billing.settle(charged, 30, true)]);
  await billing.release(charged);
  assert.equal((await reserve(charged.principalRef, "first", 1)).reason, "idempotency-replayed");
  const spent = async () => Number((await pool.query("SELECT micro_usd FROM open_ena_spend WHERE scope_kind='global' AND period='month'")).rows[0].micro_usd);
  assert.equal(await spent(), 30, "settlement is exactly once and cannot be refunded later");
  const expired = await reserve("lease-principal", "expired", 40);
  assert.ok(expired.ok);
  assert.equal((await reserve("lease-principal", "blocked", 20)).reason, "concurrency");
  await pool.query("UPDATE open_ena_billable_reservations SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [expired.reservation.id]);
  const renewed = await reserve("lease-principal", "renewed", 20);
  assert.ok(renewed.ok, "expired work frees concurrency");
  assert.equal(await spent(), 90, "expired unknown usage remains charged");
  assert.equal((await reserve("lease-principal", "expired", 1)).reason, "idempotency-replayed");
  await Promise.all([billing.release(renewed.reservation), billing.release(renewed.reservation)]);
  assert.equal(await spent(), 70, "release refunds exactly once");
  const input = { principalRef: "principal-a", operationId: "aiop-01234567-89ab-4cde-8f01-23456789abcd", requestSha256: hash, consentPolicyVersion: "v2", provider: "deepseek", model: "deepseek-flash" };
  const raceReceipts = async (offset) => {
    for (let iteration = 0; iteration < 40; iteration += 1) {
      const operationId = `aiop-01234567-89ab-4cde-8f01-${String(offset + iteration).padStart(12, "0")}`;
      const receipts = await Promise.all(Array.from({ length: 8 }, () => billing.recordAiConsentReceipt({ ...input, operationId })));
      assert.ok(receipts.every((receipt) => receipt?.durable && receipt.id === receipts[0].id));
      const existing = await billing.recordAiConsentReceipt({ ...input, operationId, requestSha256: "0".repeat(64) });
      assert.equal(existing.requestSha256, hash, "idempotent receipt lookup never overwrites the original request binding");
    }
  };
  await raceReceipts(0);
  await pool.query(readFileSync(new URL("../migrations/007_open_ena_ai_consent_idempotency.sql", import.meta.url), "utf8"));
  await raceReceipts(40);
  const receiptId = (await billing.recordAiConsentReceipt(input)).id;
  assert.equal((await billing.updateAiConsentReceiptStatus({ receiptId, status: "completed", provider: input.provider, model: input.model })).status, "completed");
  assert.equal(await billing.updateAiConsentReceiptStatus({ receiptId, status: "failed", provider: input.provider, model: input.model }), null);
  console.log("PASS: isolated PostgreSQL billing budget races, exactly-once settlement/release, lease recovery and immutable terminal receipts");
} finally {
  if (pool) await pool.end();
  await cleanupOwnedEphemeralPostgres({ rootDirectory, dataDirectory, rootPrefix: prefix, startAttempted });
}
