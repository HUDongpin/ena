// Run explicitly: node --import tsx --test tests/ena-plugin-workflow-store.integration.ts
// This suite owns a new loopback PostgreSQL cluster; it never reads deployment configuration.
import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { createPostgresPluginLabStore } from "../lib/plugin-lab/store";
import { encryptPluginLabText } from "../lib/plugin-lab/crypto";
import { pluginLabEmailRef } from "../lib/plugin-lab/workflow-security";
import type { CreateOwnedProposalInput, PendingNotification } from "../lib/plugin-lab/workflow-types";
// Shared helper validates ownership before stopping/removing the temporary cluster.
import { cleanupOwnedEphemeralPostgres } from "./support/owned-ephemeral-postgres.mjs";

const cipher = { keyVersion: "v1" as const, iv: "synthetic", ciphertext: "synthetic", tag: "synthetic" };
const emailRef = "A".repeat(43);
const otherEmailRef = "B".repeat(43);
const actorRef = "C".repeat(43);
const hash = "f".repeat(64);
const wrongHash = "0".repeat(64);
const proposalId = "plg_AAAAAAAAAAAAAAAAAAAAAA";
const legacyId = "plg_BBBBBBBBBBBBBBBBBBBBBB";
const now = new Date("2026-10-24T10:00:00.000Z");
const later = (seconds: number) => new Date(now.valueOf() + seconds * 1_000);
const challenge = (suffix: string, ref = emailRef, time = now) => ({
  challengeId: `challenge_${suffix.padEnd(22, "x")}`, emailRef: ref, emailCipher: cipher,
  codeHash: hash, locale: "en", now: time, expiresAt: new Date(time.valueOf() + 600_000),
});
const notification = (id: string, idForProposal = proposalId): PendingNotification => ({
  id, proposalId: idForProposal, kind: "received", recipientCipher: cipher, locale: "en", target: "researcher",
});
const ownedInput = (overrides: Partial<CreateOwnedProposalInput> = {}): CreateOwnedProposalInput => ({
  proposalId, emailRef, sourceRef: "Z".repeat(43), payloadCipher: cipher, publicProjectionCipher: null, publicProjectionSha256: null,
  track: "academic", visibility: "private", submittedLocale: "en", idempotencyKey: "submission_first_1234",
  requestHash: hash, actorRef, notifications: [notification("notification_received_1234")], ...overrides,
});

test("PostgreSQL workflow persists ownership, verification, replies and delivery without changing legacy consent", async (context) => {
  assert.equal(existsSync(new URL("../migrations/011_ena_plugin_workflow.sql", import.meta.url)), true, "the additive workflow migration is implemented");
  const { createWorkflowStore } = await import("../lib/plugin-lab/workflow-store");
  const prefix = "ena-plugin-workflow-test-";
  const rootDirectory = mkdtempSync(join(tmpdir(), prefix));
  const dataDirectory = join(rootDirectory, "data");
  let startAttempted = false;
  let pool: Pool | undefined;
  try {
    execFileSync("initdb", ["--pgdata", dataDirectory, "--auth", "trust", "--username", "postgres", "--encoding", "UTF8", "--no-locale"], { stdio: "pipe", timeout: 60_000 });
    const port = await new Promise<number>((resolve, reject) => {
      const server = createServer();
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const selected = (server.address() as { port: number }).port;
        server.close((error) => error ? reject(error) : resolve(selected));
      });
    });
    startAttempted = true;
    execFileSync("pg_ctl", ["--pgdata", dataDirectory, "--log", join(rootDirectory, "postgres.log"), "--options", `-h 127.0.0.1 -p ${port} -c unix_socket_directories=''`, "--wait", "start"], { stdio: "pipe", timeout: 60_000 });
    pool = new Pool({ host: "127.0.0.1", port, user: "postgres", database: "postgres", max: 12, statement_timeout: 5_000 });
    const db = pool;
    await db.query(readFileSync(new URL("../migrations/005_ena_plugin_lab.sql", import.meta.url), "utf8"));
    const legacy = createPostgresPluginLabStore((sql, params) => db.query(sql, params as unknown[]));
    await legacy.createProposal({ proposalId: legacyId, accessHash: hash, payloadCipher: cipher, publicProjectionCipher: cipher, publicProjectionSha256: hash, track: "academic", visibility: "public-after-review", submittedLocale: "en" });
    const migration = readFileSync(new URL("../migrations/011_ena_plugin_workflow.sql", import.meta.url), "utf8");
    await db.query(migration);
    await db.query(migration);
    const store = createWorkflowStore(db);

    await context.test("legacy proposals and tokens survive migration; owner attachment cannot verify email", async () => {
      assert.equal(await legacy.accessHashFor(legacyId), hash);
      assert.equal((await store.readOwned(legacyId, { legacyProposalId: legacyId }))?.ownerEmailRef, null);
      assert.equal(await store.readOwned(legacyId, { legacyProposalId: proposalId }), null);
      assert.equal(await store.attachOwner(legacyId, otherEmailRef), true);
      assert.equal(await store.attachOwner(legacyId, emailRef), false);
      assert.equal((await store.readOwned(legacyId, { emailRef: otherEmailRef }))?.emailConfirmed, false);
      assert.equal((await store.listOwned(emailRef)).length, 0);
    });

    await context.test("OTP cooldown and single consumption are atomic under concurrent requests", async () => {
      const attempts = await Promise.all(Array.from({ length: 8 }, (_, index) => store.putChallenge(challenge(`race_${index}`))));
      assert.equal(attempts.filter(Boolean).length, 1);
      const id = (await db.query("SELECT challenge_id FROM ena_plugin_workflow_challenges WHERE email_ref=$1", [emailRef])).rows[0].challenge_id as string;
      assert.equal(await store.putChallenge(challenge("early", emailRef, later(59))), false);
      const consumed = await Promise.all(Array.from({ length: 8 }, (_, index) => store.consumeChallenge({ challengeId: id, codeHash: hash, now: later(1), sessionHash: String(index).repeat(64), sessionExpiresAt: later(1_801) })));
      assert.equal(consumed.filter(Boolean).length, 1);
      assert.equal(consumed.find(Boolean)?.emailRef, emailRef);
      const sessionIndex = consumed.findIndex(Boolean);
      assert.deepEqual(await store.readSession(String(sessionIndex).repeat(64), later(2)), consumed[sessionIndex]);
      assert.equal(await store.readSession(String(sessionIndex).repeat(64), later(1_801)), null);
      await store.revokeSession(String(sessionIndex).repeat(64));
      assert.equal(await store.readSession(String(sessionIndex).repeat(64), later(2)), null);
    });

    await context.test("five wrong attempts exhaust a code, a resend invalidates old codes, and time bounds are enforced", async () => {
      const first = challenge("failure", otherEmailRef);
      assert.equal(await store.putChallenge(first), true);
      const invalid = { challengeId: first.challengeId, codeHash: wrongHash, now: later(1), sessionHash: hash, sessionExpiresAt: later(1_801) };
      assert.ok((await Promise.all(Array.from({ length: 8 }, () => store.consumeChallenge(invalid)))).every((result) => result === null));
      assert.equal(await store.consumeChallenge({ ...invalid, codeHash: hash }), null);
      assert.equal((await db.query("SELECT failed_attempts FROM ena_plugin_workflow_challenges WHERE challenge_id=$1", [first.challengeId])).rows[0].failed_attempts, 5);
      const second = challenge("resend", otherEmailRef, later(60));
      assert.equal(await store.putChallenge(second), true);
      assert.equal(await store.consumeChallenge({ ...invalid, codeHash: hash, now: later(61) }), null);
      const third = challenge("third", otherEmailRef, later(120));
      assert.equal(await store.putChallenge(third), true);
      assert.equal(await store.consumeChallenge({ ...invalid, challengeId: second.challengeId, codeHash: hash, now: later(121) }), null);
      assert.equal(await store.consumeChallenge({ ...invalid, challengeId: third.challengeId, codeHash: hash, now: later(720) }), null);
      await assert.rejects(store.putChallenge({ ...challenge("too_long", "D".repeat(43)), expiresAt: later(601) }));
      assert.equal(await store.putChallenge(challenge("invalidate", "E".repeat(43))), true);
      await store.invalidateChallenge(challenge("invalidate").challengeId);
      assert.equal(await store.consumeChallenge({ ...invalid, challengeId: challenge("invalidate").challengeId, codeHash: hash }), null);
    });

    await context.test("submission replay is immutable and ownership prevents cross-researcher reads", async () => {
      const writes = await Promise.all(Array.from({ length: 8 }, () => store.createOwnedProposal(ownedInput())));
      assert.equal(writes.filter((result) => "created" in result && result.created).length, 1);
      assert.ok(writes.every((result) => "proposalId" in result && result.proposalId === proposalId));
      assert.deepEqual(await store.createOwnedProposal(ownedInput({ requestHash: wrongHash })), { conflict: true });
      assert.equal((await store.listOwned(emailRef)).length, 1);
      assert.equal(await store.readOwned(proposalId, { emailRef: otherEmailRef }), null);
      const record = await store.readOwned(proposalId, { emailRef });
      assert.equal(record?.publicProjectionCipher, null);
      assert.equal(record?.events.length, 1);
      assert.equal(record?.notifications.length, 1);
      assert.equal(record?.emailConfirmed, true);
      assert.equal(record?.publicConsentStatus, "not-requested");
      assert.doesNotMatch(JSON.stringify(record), /recipientCipher|emailCipher|reasonCipher|codeHash|sessionHash/u);
      await assert.rejects(db.query("UPDATE ena_plugin_proposals SET visibility='public-after-review' WHERE proposal_id=$1", [proposalId]));
      await assert.rejects(db.query("UPDATE ena_plugin_proposals SET public_projection_sha256=$2 WHERE proposal_id=$1", [proposalId, hash]));
    });

    await context.test("new submissions cannot omit the required source quota reference", async () => {
      await assert.rejects(store.createOwnedProposal(ownedInput({ proposalId: "plg_JJJJJJJJJJJJJJJJJJJJJJ", idempotencyKey: "missing_source_submission", sourceRef: undefined as unknown as string, notifications: [] })));
      assert.equal(await store.readOwned("plg_JJJJJJJJJJJJJJJJJJJJJJ", { emailRef }), null);
    });

    await context.test("questions are separate from private reasons and reply commits state, message, audit and outbox once", async () => {
      const transition = (from: "received" | "under-review", to: "under-review" | "needs-information") => store.transition({
        proposalId, from, to, actorRef, reasonCipher: { ...cipher, ciphertext: "internal_reason" },
        ...(to === "needs-information" ? { message: { messageId: "question_1234567890", bodyCipher: { ...cipher, ciphertext: "visible_question" } } } : {}), notifications: [],
      });
      assert.equal(await transition("received", "under-review"), true);
      assert.equal(await transition("under-review", "needs-information"), true);
      const reply = { proposalId, owner: { emailRef }, messageId: "reply_1234567890", bodyCipher: cipher, actorRef, idempotencyKey: "reply_request_123456", requestHash: hash, notifications: [notification("notification_reply_12345")] };
      assert.equal(await store.appendReply({ ...reply, owner: { emailRef: otherEmailRef } }), "conflict");
      const race = await Promise.all(Array.from({ length: 8 }, () => store.appendReply(reply)));
      assert.equal(race.filter((result) => result === "created").length, 1);
      assert.equal(race.filter((result) => result === "replayed").length, 7);
      assert.equal(await store.appendReply({ ...reply, requestHash: wrongHash }), "conflict");
      assert.equal(await store.appendReply({ ...reply, idempotencyKey: "different_request_123" }), "conflict");
      const record = await store.readOwned(proposalId, { emailRef });
      assert.equal(record?.state, "under-review");
      assert.equal(record?.awaitingReplyReview, true);
      assert.equal(record?.events.length, 4);
      assert.deepEqual(record?.messages.map((message) => message.actor), ["operator", "researcher"]);
      assert.doesNotMatch(JSON.stringify(record), /internal_reason/u);
      assert.equal(record?.notifications.length, 2);
      await assert.rejects(transition("under-review", "needs-information"), "duplicate question IDs roll back the state change rather than overwrite a message");
      assert.equal((await store.readOwned(proposalId, { emailRef }))?.state, "under-review");
    });

    await context.test("a different email owner or differently bound legacy credential cannot wait on the proposal row lock", async () => {
      const blocker = await db.connect();
      try {
        await blocker.query("BEGIN");
        await blocker.query("SELECT proposal_id FROM ena_plugin_proposals WHERE proposal_id=$1 FOR UPDATE", [proposalId]);
        const reply = { proposalId, messageId: "unauthorized_reply_123", bodyCipher: cipher, actorRef, idempotencyKey: "unauthorized_request_123", requestHash: hash, notifications: [] };
        assert.equal(await store.appendReply({ ...reply, owner: { emailRef: otherEmailRef } }), "conflict", "an excluded owner must not attempt to lock the row");
        assert.equal(await store.appendReply({ ...reply, owner: { legacyProposalId: legacyId } }), "conflict", "a credential bound to another proposal must not attempt to lock the row");
      } finally {
        await blocker.query("ROLLBACK");
        blocker.release();
      }
    });

    await context.test("failed notification insert rolls back a transition; review clears the attention flag", async () => {
      await assert.rejects(store.transition({ proposalId, from: "under-review", to: "selected", actorRef, reasonCipher: cipher, notifications: [notification("notification_received_1234")] }));
      assert.equal((await store.readOwned(proposalId, { emailRef }))?.state, "under-review");
      assert.equal((await store.readOwned(proposalId, { emailRef }))?.awaitingReplyReview, true);
      assert.equal(await store.transition({ proposalId, from: "under-review", to: "selected", actorRef, reasonCipher: cipher, notifications: [] }), true);
      assert.equal((await store.readOwned(proposalId, { emailRef }))?.awaitingReplyReview, false);
    });

    await context.test("legacy public publication and withdrawal audit gates remain intact", async () => {
      const transition = (from: "received" | "under-review" | "selected", to: "under-review" | "selected" | "withdrawn") => store.transition({ proposalId: legacyId, from, to, actorRef, reasonCipher: cipher, notifications: [] });
      assert.equal(await transition("received", "under-review"), true);
      assert.equal(await transition("under-review", "selected"), true);
      assert.equal(await legacy.requestPublicConsent(legacyId, actorRef), false);
      assert.equal(await legacy.confirmEmail(legacyId, actorRef), true);
      assert.equal(await legacy.requestPublicConsent(legacyId, actorRef), true);
      assert.equal(await legacy.setPublicConsent(legacyId, "confirm", actorRef, hash), true);
      assert.equal((await legacy.listPublicSummaries()).length, 1);
      assert.equal(await transition("selected", "withdrawn"), true);
      assert.equal((await legacy.listPublicSummaries()).length, 0);
      assert.equal((await store.readOwned(legacyId, { emailRef: otherEmailRef }))?.publicConsentStatus, "withdrawn");
      assert.equal((await db.query("SELECT * FROM ena_plugin_proposal_publication_events WHERE proposal_id=$1", [legacyId])).rows.length, 3);
    });

    await context.test("outbox claims are exclusive, stale acknowledgements fail and attempts stop at five", async () => {
      const time = new Date(Date.now() + 60_000);
      const claims = (await Promise.all(Array.from({ length: 6 }, () => store.claimNotifications(1, time)))).flat();
      assert.equal(claims.length, 2);
      assert.equal(new Set(claims.map((item) => item.id)).size, 2);
      assert.equal(await store.settleNotification({ id: claims[0].id, claimToken: "invalid_claim", success: true, now: time }), false);
      assert.equal(await store.settleNotification({ id: claims[0].id, claimToken: claims[0].claimToken, success: true, now: time }), true);
      assert.equal(await store.settleNotification({ id: claims[0].id, claimToken: claims[0].claimToken, success: true, now: time }), false);
      let previous = claims[1];
      let nextTime = new Date(time.valueOf() + 121_000);
      for (let attempt = 2; attempt <= 5; attempt += 1) {
        const [claimed] = await store.claimNotifications(1, nextTime);
        assert.ok(claimed);
        assert.equal(claimed.attempts, attempt);
        assert.notEqual(claimed.claimToken, previous.claimToken);
        assert.equal(await store.settleNotification({ id: previous.id, claimToken: previous.claimToken, success: true, now: nextTime }), false);
        previous = claimed;
        nextTime = new Date(nextTime.valueOf() + 121_000);
      }
      assert.equal((await store.claimNotifications(10, nextTime)).length, 0);
      const record = await store.readOwned(proposalId, { emailRef });
      assert.deepEqual(record?.notifications.map((item) => item.status).sort(), ["failed", "sent"]);
      assert.equal(await store.settleNotification({ id: previous.id, claimToken: previous.claimToken, success: true, now: nextTime }), false);
    });

    await context.test("workflow source limits serialize concurrent requests without changing legacy rate scopes", async () => {
      const limited = await Promise.all(Array.from({ length: 12 }, () => store.consumeRateLimit({ scopeKind: "otp-source", scopeRef: emailRef, limit: 5, windowSeconds: 3600 })));
      assert.equal(limited.filter(Boolean).length, 5);
      assert.equal(await legacy.consumeRateLimit({ scopeKind: "submission-source", scopeRef: emailRef, limit: 1, windowSeconds: 3600 }), true);
    });

    await context.test("failed deliveries retry only after backoff and stop after the fifth delivery attempt", async () => {
      const retryId = "plg_DDDDDDDDDDDDDDDDDDDDDD";
      assert.deepEqual(await store.createOwnedProposal(ownedInput({ proposalId: retryId, idempotencyKey: "submission_retry_1234", notifications: [notification("notification_retries_123", retryId)] })), { proposalId: retryId, created: true });
      let time = new Date(Date.now() + 60_000);
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const [claimed] = await store.claimNotifications(1, time);
        assert.ok(claimed);
        assert.equal(claimed.attempts, attempt);
        assert.equal(await store.settleNotification({ id: claimed.id, claimToken: claimed.claimToken, success: false, now: time, errorCode: "secret-recipient-example-org" }), true);
        assert.equal((await store.claimNotifications(1, time)).length, 0);
        time = new Date(time.valueOf() + 3_601_000);
      }
      assert.equal((await store.claimNotifications(1, time)).length, 0);
      assert.equal((await store.readOwned(retryId, { emailRef }))?.notifications[0].status, "failed");
      assert.equal((await db.query("SELECT last_error_code FROM ena_plugin_workflow_notifications WHERE proposal_id=$1", [retryId])).rows[0].last_error_code, "delivery-failed");
    });

    await context.test("legacy backfill is dry-run by default, decrypts only locally and never confirms ownership by itself", async () => {
      assert.equal(existsSync(new URL("../scripts/plugin-lab-backfill-owners.ts", import.meta.url)), true, "the owner backfill script is implemented");
      const { backfillPluginLabOwners } = await import("../scripts/plugin-lab-backfill-owners");
      const key = Buffer.alloc(32, 6);
      const configuration = { databaseUrl: "postgres://unused.invalid/test", encryptionKey: key, keyVersion: "v1" as const, secret: "synthetic-backfill-secret-that-is-at-least-32-characters" };
      const backfillId = "plg_CCCCCCCCCCCCCCCCCCCCCC";
      const normalizedEmail = "researcher@example.org";
      const payload = { schemaVersion: 2, email: "Researcher@Example.org", name: "Researcher", affiliation: null,
        title: "Question", researchQuestion: "What changes?", currentGap: "", proposedChange: "Proposed method", unchangedBoundary: "",
        publicSummary: "", privateDetails: "", referenceLinks: [], visibility: "private", track: "academic", dataSafetyConfirmed: true, privacyConsent: true };
      await legacy.createProposal({ proposalId: backfillId, accessHash: hash, payloadCipher: encryptPluginLabText(JSON.stringify(payload), key, "v1", `proposal-payload:${backfillId}`), publicProjectionCipher: cipher, publicProjectionSha256: hash, track: "academic", visibility: "private", submittedLocale: "en" });
      const dry = await backfillPluginLabOwners({ pool: db, configuration });
      assert.equal(dry.eligible, 1);
      assert.equal(dry.attached, 0);
      assert.equal((await store.readOwned(backfillId, { legacyProposalId: backfillId }))?.ownerEmailRef, null);
      const applied = await backfillPluginLabOwners({ pool: db, configuration, apply: true, batchSize: 1 });
      assert.equal(applied.attached, 1);
      const ref = pluginLabEmailRef(normalizedEmail, configuration.secret);
      assert.equal((await store.readOwned(backfillId, { emailRef: ref }))?.emailConfirmed, false);
      assert.equal((await backfillPluginLabOwners({ pool: db, configuration, apply: true })).attached, 0);
      const proof = challenge("backfill_proof", ref);
      assert.equal(await store.putChallenge(proof), true);
      assert.ok(await store.consumeChallenge({ challengeId: proof.challengeId, codeHash: hash, now: later(1), sessionHash: "a".repeat(64), sessionExpiresAt: later(1_801) }));
      const verified = await store.readOwned(backfillId, { emailRef: ref });
      assert.equal(verified?.emailConfirmed, true);
      assert.equal(verified?.publicConsentStatus, "not-requested");
      const confirmedBy = (await db.query("SELECT email_confirmed_by FROM ena_plugin_proposals WHERE proposal_id=$1", [backfillId])).rows[0].email_confirmed_by;
      assert.notEqual(confirmedBy, actorRef);
      assert.notEqual(confirmedBy, ref);
      await assert.rejects(db.query("UPDATE ena_plugin_workflow_verification_events SET actor_ref=$1", [actorRef]));
      await assert.rejects(db.query("DELETE FROM ena_plugin_workflow_messages"));
      await assert.rejects(db.query("UPDATE ena_plugin_workflow_requests SET request_hash=$1", [wrongHash]));
    });

    await context.test("new-submission quotas are atomic and never block an existing receipt replay", async () => {
      const third = ownedInput({ proposalId: "plg_EEEEEEEEEEEEEEEEEEEEEE", idempotencyKey: "third_submission", notifications: [] });
      assert.deepEqual(await store.createOwnedProposal(third), { proposalId: third.proposalId, created: true });
      assert.deepEqual(await store.createOwnedProposal(ownedInput({ proposalId: "plg_FFFFFFFFFFFFFFFFFFFFFF", idempotencyKey: "fourth_submission", notifications: [] })), { rateLimited: true });
      assert.deepEqual(await store.createOwnedProposal(ownedInput()), { proposalId, created: false });
      const sourceRef = "S".repeat(43);
      for (const [index, letter] of ["F", "G"].entries()) {
        const ref = letter.repeat(43);
        const proof = challenge(`quota_${letter}`, ref);
        assert.equal(await store.putChallenge(proof), true);
        assert.ok(await store.consumeChallenge({ challengeId: proof.challengeId, codeHash: hash, now: later(1), sessionHash: (index === 0 ? "b" : "c").repeat(64), sessionExpiresAt: later(1_801) }));
        for (let submission = 0; submission < 3; submission += 1) {
          const id = `plg_${letter.repeat(21)}${submission}`;
          const result = await store.createOwnedProposal(ownedInput({ proposalId: id, emailRef: ref, sourceRef, idempotencyKey: `source_${letter}_${submission}`, notifications: [] }));
          assert.deepEqual(result, index === 1 && submission === 2 ? { rateLimited: true } : { proposalId: id, created: true });
        }
      }
      assert.equal(Number((await db.query("SELECT request_count FROM ena_plugin_workflow_rate_limits WHERE scope_kind='submission-email' AND scope_ref=$1", ["G".repeat(43)])).rows[0].request_count), 2, "source rejection rolls back the email quota increment");
    });
  } finally {
    if (pool) await pool.end();
    await cleanupOwnedEphemeralPostgres({ rootDirectory, dataDirectory, rootPrefix: prefix, startAttempted });
  }
});
