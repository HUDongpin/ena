import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { readPluginLabConfiguration, type PluginLabEnvironment } from "./config";
import type { PluginLabCiphertextV1 } from "./crypto";
import { assertPluginProposalTransition, isPluginProposalState } from "./proposal";
import { createPostgresPluginLabStore } from "./store";
import type { ClaimedNotification, PendingNotification, ResearcherSession, WorkflowProposalRecord, WorkflowStore } from "./workflow-types";

export type { ClaimedNotification, CreateOwnedProposalInput, PendingNotification, ResearcherSession, WorkflowMessage, WorkflowNotificationSummary, WorkflowOwner, WorkflowProposalRecord, WorkflowStore } from "./workflow-types";

function unavailable(): never {
  // Do not preserve pg's error cause, which can contain SQL values or connection details.
  throw new Error("Plugin Lab workflow store is unavailable.");
}

function timestamp(value: unknown): string {
  if (value instanceof Date && Number.isFinite(value.valueOf())) return value.toISOString();
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  return unavailable();
}

function validLifetime(now: Date, expiresAt: Date, maximumMs: number) {
  if (!Number.isFinite(now.valueOf()) || !Number.isFinite(expiresAt.valueOf()) || expiresAt <= now || expiresAt.valueOf() - now.valueOf() > maximumMs) {
    throw new TypeError("Invalid workflow expiration.");
  }
}

function sameHash(left: unknown, right: string) {
  if (typeof left !== "string" || !/^[0-9a-f]{64}$/u.test(left) || !/^[0-9a-f]{64}$/u.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function session(row: QueryResultRow | undefined): ResearcherSession | null {
  return row ? { emailRef: String(row.email_ref), emailCipher: row.email_cipher as PluginLabCiphertextV1, expiresAt: timestamp(row.expires_at) } : null;
}

const RECORD_SELECT = `
  SELECT p.*,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('state',e.to_state,'messageCode',e.message_code,'recordedAt',e.recorded_at) ORDER BY e.event_id)
      FROM ena_plugin_proposal_events e WHERE e.proposal_id=p.proposal_id), '[]'::jsonb) AS events,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('messageId',m.message_id,'actor',m.actor,'bodyCipher',m.body_cipher,'createdAt',m.created_at) ORDER BY m.created_at,m.message_id)
      FROM ena_plugin_workflow_messages m WHERE m.proposal_id=p.proposal_id), '[]'::jsonb) AS messages,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',n.notification_id,'kind',n.kind,'target',n.target,'status',n.status,'attempts',n.attempts,'createdAt',n.created_at,'sentAt',n.sent_at) ORDER BY n.created_at,n.notification_id)
      FROM ena_plugin_workflow_notifications n WHERE n.proposal_id=p.proposal_id), '[]'::jsonb) AS notifications
  FROM ena_plugin_proposals p`;

function record(row: QueryResultRow): WorkflowProposalRecord {
  if (!isPluginProposalState(row.state) || !Array.isArray(row.events) || !Array.isArray(row.messages) || !Array.isArray(row.notifications)) return unavailable();
  return {
    proposalId: String(row.proposal_id), state: row.state, track: row.track, visibility: row.visibility,
    createdAt: timestamp(row.created_at), updatedAt: timestamp(row.updated_at),
    payloadCipher: row.payload_cipher, publicProjectionCipher: row.public_projection_cipher ?? null,
    publicProjectionSha256: row.public_projection_sha256 ?? null,
    emailConfirmed: row.email_confirmed_at !== null, publicConsentStatus: row.public_consent_status,
    publicModerationStatus: row.public_moderation_status, ownerEmailRef: row.owner_email_ref ?? null,
    submittedLocale: String(row.submitted_locale), awaitingReplyReview: row.awaiting_reply_review === true,
    events: row.events.map((item: QueryResultRow) => {
      if (!isPluginProposalState(item.state)) return unavailable();
      return { state: item.state, messageCode: String(item.messageCode), recordedAt: timestamp(item.recordedAt) };
    }),
    messages: row.messages.map((item: QueryResultRow) => ({ messageId: String(item.messageId), actor: item.actor, bodyCipher: item.bodyCipher, createdAt: timestamp(item.createdAt) })),
    notifications: row.notifications.map((item: QueryResultRow) => ({ id: String(item.id), kind: item.kind, target: item.target, status: item.status, attempts: Number(item.attempts), createdAt: timestamp(item.createdAt), sentAt: item.sentAt === null ? null : timestamp(item.sentAt) })),
  };
}

async function insertNotifications(client: PoolClient, proposalId: string, notifications: readonly PendingNotification[]) {
  for (const item of notifications) {
    if (item.proposalId !== proposalId) throw new TypeError("Notification proposal mismatch.");
    await client.query(`INSERT INTO ena_plugin_workflow_notifications
      (notification_id,proposal_id,kind,recipient_cipher,locale,target) VALUES ($1,$2,$3,$4::jsonb,$5,$6)`,
    [item.id, proposalId, item.kind, JSON.stringify(item.recipientCipher), item.locale, item.target]);
  }
}

async function takeSubmissionQuota(client: PoolClient, scopeKind: string, scopeRef: string, limit: number, windowSeconds: number) {
  const result = await client.query(`INSERT INTO ena_plugin_workflow_rate_limits (scope_kind,scope_ref,window_start,request_count)
    VALUES ($1,$2,clock_timestamp(),1) ON CONFLICT (scope_kind,scope_ref) DO UPDATE SET
      window_start=CASE WHEN clock_timestamp() >= ena_plugin_workflow_rate_limits.window_start+make_interval(secs => $4) THEN clock_timestamp() ELSE ena_plugin_workflow_rate_limits.window_start END,
      request_count=CASE WHEN clock_timestamp() >= ena_plugin_workflow_rate_limits.window_start+make_interval(secs => $4) THEN 1 ELSE ena_plugin_workflow_rate_limits.request_count+1 END
    WHERE clock_timestamp() >= ena_plugin_workflow_rate_limits.window_start+make_interval(secs => $4)
      OR ena_plugin_workflow_rate_limits.request_count < $3 RETURNING scope_ref`, [scopeKind, scopeRef, limit, windowSeconds]);
  return result.rows.length === 1;
}

/** All multi-statement mutations use a single checked-out client and short transactions. */
export function createWorkflowStore(pool: Pool): WorkflowStore {
  async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    let client: PoolClient | undefined;
    let discard = false;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout='5s'");
      await client.query("SET LOCAL lock_timeout='3s'");
      await client.query("SET LOCAL idle_in_transaction_session_timeout='10s'");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch {
      if (client) { try { await client.query("ROLLBACK"); } catch { discard = true; } }
      return unavailable();
    } finally { client?.release(discard); }
  }

  async function query(sql: string, params: unknown[] = []) {
    try { return await pool.query(sql, params); } catch { return unavailable(); }
  }

  return {
    async consumeRateLimit(input) {
      if (!Number.isSafeInteger(input.limit) || input.limit < 1 || !Number.isSafeInteger(input.windowSeconds) || input.windowSeconds < 1) throw new TypeError("Invalid workflow rate limit.");
      const result = await query(`INSERT INTO ena_plugin_workflow_rate_limits (scope_kind,scope_ref,window_start,request_count)
        VALUES ($1,$2,clock_timestamp(),1) ON CONFLICT (scope_kind,scope_ref) DO UPDATE SET
        window_start=CASE WHEN clock_timestamp() >= ena_plugin_workflow_rate_limits.window_start + make_interval(secs => $4) THEN clock_timestamp() ELSE ena_plugin_workflow_rate_limits.window_start END,
        request_count=CASE WHEN clock_timestamp() >= ena_plugin_workflow_rate_limits.window_start + make_interval(secs => $4) THEN 1 ELSE LEAST(ena_plugin_workflow_rate_limits.request_count,2147483646)+1 END
        RETURNING request_count <= $3 AS allowed`, [input.scopeKind, input.scopeRef, input.limit, input.windowSeconds]);
      return result.rows[0]?.allowed === true;
    },
    async putChallenge(input) {
      validLifetime(input.now, input.expiresAt, 600_000);
      return transaction(async (client) => {
        // All verification paths lock the contact first, then its challenge and proposals.
        const accepted = await client.query(`INSERT INTO ena_plugin_workflow_email_contacts (email_ref,email_cipher,last_challenge_at)
          VALUES ($1,$2::jsonb,$3) ON CONFLICT (email_ref) DO UPDATE SET email_cipher=EXCLUDED.email_cipher,last_challenge_at=EXCLUDED.last_challenge_at
          WHERE ena_plugin_workflow_email_contacts.last_challenge_at <= $3::timestamptz-interval '60 seconds' RETURNING email_ref`,
        [input.emailRef, JSON.stringify(input.emailCipher), input.now]);
        if (!accepted.rows.length) return false;
        await client.query(`UPDATE ena_plugin_workflow_challenges SET invalidated_at=$2
          WHERE email_ref=$1 AND consumed_at IS NULL AND invalidated_at IS NULL`, [input.emailRef, input.now]);
        await client.query(`INSERT INTO ena_plugin_workflow_challenges (challenge_id,email_ref,code_hash,locale,created_at,expires_at)
          VALUES ($1,$2,$3,$4,$5,$6)`, [input.challengeId, input.emailRef, input.codeHash, input.locale, input.now, input.expiresAt]);
        return true;
      });
    },
    async consumeChallenge(input) {
      validLifetime(input.now, input.sessionExpiresAt, 1_800_000);
      return transaction(async (client) => {
        const identity = await client.query("SELECT email_ref FROM ena_plugin_workflow_challenges WHERE challenge_id=$1", [input.challengeId]);
        if (!identity.rows.length) return null;
        const emailRef = String(identity.rows[0].email_ref);
        const contact = await client.query("SELECT email_cipher FROM ena_plugin_workflow_email_contacts WHERE email_ref=$1 FOR UPDATE", [emailRef]);
        const result = await client.query(`SELECT * FROM ena_plugin_workflow_challenges WHERE challenge_id=$1 AND consumed_at IS NULL
          AND invalidated_at IS NULL AND failed_attempts < 5 AND created_at <= $2 AND expires_at > $2 FOR UPDATE`, [input.challengeId, input.now]);
        const challenge = result.rows[0];
        if (!challenge) return null;
        if (!sameHash(challenge.code_hash, input.codeHash)) {
          await client.query("UPDATE ena_plugin_workflow_challenges SET failed_attempts=failed_attempts+1 WHERE challenge_id=$1", [input.challengeId]);
          return null;
        }
        const actorRef = createHash("sha256").update(`plugin-lab-verified-email:${emailRef}`).digest("base64url");
        await client.query("UPDATE ena_plugin_workflow_challenges SET consumed_at=$2 WHERE challenge_id=$1", [input.challengeId, input.now]);
        await client.query("UPDATE ena_plugin_workflow_email_contacts SET verified_at=$2,verified_by=$3 WHERE email_ref=$1", [emailRef, input.now, actorRef]);
        await client.query("INSERT INTO ena_plugin_workflow_verification_events (email_ref,challenge_id,actor_ref,recorded_at) VALUES ($1,$2,$3,$4)", [emailRef, input.challengeId, actorRef, input.now]);
        await client.query("SELECT proposal_id FROM ena_plugin_proposals WHERE owner_email_ref=$1 AND email_confirmed_at IS NULL ORDER BY proposal_id FOR UPDATE", [emailRef]);
        await client.query(`UPDATE ena_plugin_proposals SET email_confirmed_at=$2,email_confirmed_by=$3,updated_at=clock_timestamp()
          WHERE owner_email_ref=$1 AND email_confirmed_at IS NULL`, [emailRef, input.now, actorRef]);
        await client.query("INSERT INTO ena_plugin_workflow_sessions (session_hash,email_ref,created_at,expires_at) VALUES ($1,$2,$3,$4)", [input.sessionHash, emailRef, input.now, input.sessionExpiresAt]);
        return { emailRef, emailCipher: contact.rows[0].email_cipher as PluginLabCiphertextV1, expiresAt: input.sessionExpiresAt.toISOString() };
      });
    },
    async invalidateChallenge(challengeId) {
      await query("UPDATE ena_plugin_workflow_challenges SET invalidated_at=clock_timestamp() WHERE challenge_id=$1 AND consumed_at IS NULL AND invalidated_at IS NULL", [challengeId]);
    },
    async readSession(sessionHash, now) {
      const result = await query(`SELECT s.email_ref,c.email_cipher,s.expires_at FROM ena_plugin_workflow_sessions s
        JOIN ena_plugin_workflow_email_contacts c ON c.email_ref=s.email_ref
        WHERE s.session_hash=$1 AND s.revoked_at IS NULL AND s.created_at <= $2 AND s.expires_at > $2`, [sessionHash, now]);
      return session(result.rows[0]);
    },
    async revokeSession(sessionHash) {
      await query("UPDATE ena_plugin_workflow_sessions SET revoked_at=clock_timestamp() WHERE session_hash=$1 AND revoked_at IS NULL", [sessionHash]);
    },
    async createOwnedProposal(input) {
      return transaction(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`plugin-lab-submission:${input.emailRef}:${input.idempotencyKey}`]);
        const previous = await client.query("SELECT proposal_id,request_hash FROM ena_plugin_workflow_requests WHERE operation_kind='submission' AND owner_ref=$1 AND idempotency_key=$2", [input.emailRef, input.idempotencyKey]);
        if (previous.rows[0]) return sameHash(previous.rows[0].request_hash, input.requestHash) ? { proposalId: String(previous.rows[0].proposal_id), created: false } : { conflict: true as const };
        const verified = await client.query("SELECT verified_at,verified_by FROM ena_plugin_workflow_email_contacts WHERE email_ref=$1 AND verified_at IS NOT NULL FOR SHARE", [input.emailRef]);
        if (!verified.rows[0]) return { conflict: true as const };
        await client.query("SAVEPOINT submission_quota");
        const emailAllowed = await takeSubmissionQuota(client, "submission-email", input.emailRef, 3, 86_400);
        const sourceAllowed = emailAllowed && await takeSubmissionQuota(client, "submission-source", input.sourceRef, 5, 3_600);
        if (!sourceAllowed) {
          await client.query("ROLLBACK TO SAVEPOINT submission_quota");
          return { rateLimited: true as const };
        }
        await client.query("RELEASE SAVEPOINT submission_quota");
        await client.query(`INSERT INTO ena_plugin_proposals
          (proposal_id,state,track,visibility,public_consent_status,public_moderation_status,submitted_locale,payload_cipher,public_projection_cipher,public_projection_sha256,owner_email_ref,email_confirmed_at,email_confirmed_by)
          VALUES ($1,'received',$2,$3,'not-requested','pending',$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10)`,
        [input.proposalId, input.track, input.visibility, input.submittedLocale, JSON.stringify(input.payloadCipher), input.publicProjectionCipher === null ? null : JSON.stringify(input.publicProjectionCipher), input.publicProjectionSha256, input.emailRef, verified.rows[0].verified_at, verified.rows[0].verified_by]);
        await client.query("INSERT INTO ena_plugin_proposal_events (proposal_id,from_state,to_state,actor_ref,message_code) VALUES ($1,NULL,'received',$2,'proposal-received')", [input.proposalId, input.actorRef]);
        await client.query("INSERT INTO ena_plugin_workflow_requests (operation_kind,owner_ref,idempotency_key,request_hash,proposal_id) VALUES ('submission',$1,$2,$3,$4)", [input.emailRef, input.idempotencyKey, input.requestHash, input.proposalId]);
        await insertNotifications(client, input.proposalId, input.notifications);
        return { proposalId: input.proposalId, created: true };
      });
    },
    async listOwned(emailRef) {
      return (await query(`${RECORD_SELECT} WHERE p.owner_email_ref=$1 ORDER BY p.updated_at DESC,p.proposal_id LIMIT 200`, [emailRef])).rows.map(record);
    },
    async readOwned(proposalId, owner) {
      const result = "emailRef" in owner
        ? await query(`${RECORD_SELECT} WHERE p.proposal_id=$1 AND p.owner_email_ref=$2`, [proposalId, owner.emailRef])
        : await query(`${RECORD_SELECT} WHERE p.proposal_id=$1 AND p.proposal_id=$2`, [proposalId, owner.legacyProposalId]);
      return result.rows[0] ? record(result.rows[0]) : null;
    },
    async listOperator() {
      return (await query(`${RECORD_SELECT} ORDER BY p.updated_at DESC,p.proposal_id LIMIT 200`)).rows.map(record);
    },
    async appendReply(input) {
      return transaction(async (client) => {
        const ownerPredicate = "emailRef" in input.owner ? "owner_email_ref=$2" : "proposal_id=$2";
        const ownerRef = "emailRef" in input.owner ? input.owner.emailRef : input.owner.legacyProposalId;
        const ownerParams = [input.proposalId, ownerRef];
        const result = await client.query(`SELECT state FROM ena_plugin_proposals WHERE proposal_id=$1 AND ${ownerPredicate} FOR UPDATE`, ownerParams);
        const proposal = result.rows[0];
        if (!proposal) return "conflict";
        const previous = await client.query("SELECT request_hash FROM ena_plugin_workflow_requests WHERE operation_kind='reply' AND owner_ref=$1 AND idempotency_key=$2", [input.proposalId, input.idempotencyKey]);
        if (previous.rows[0]) return sameHash(previous.rows[0].request_hash, input.requestHash) ? "replayed" : "conflict";
        if (proposal.state !== "needs-information") return "conflict";
        const changed = await client.query(`UPDATE ena_plugin_proposals SET state='under-review',awaiting_reply_review=true,updated_at=clock_timestamp()
          WHERE proposal_id=$1 AND ${ownerPredicate} AND state='needs-information' RETURNING proposal_id`, ownerParams);
        if (changed.rows.length !== 1) return "conflict";
        await client.query("INSERT INTO ena_plugin_workflow_messages (message_id,proposal_id,actor,actor_ref,body_cipher) VALUES ($1,$2,'researcher',$3,$4::jsonb)", [input.messageId, input.proposalId, input.actorRef, JSON.stringify(input.bodyCipher)]);
        await client.query("INSERT INTO ena_plugin_proposal_events (proposal_id,from_state,to_state,actor_ref,message_code) VALUES ($1,'needs-information','under-review',$2,'researcher-replied')", [input.proposalId, input.actorRef]);
        await client.query("INSERT INTO ena_plugin_workflow_requests (operation_kind,owner_ref,idempotency_key,request_hash,proposal_id) VALUES ('reply',$1,$2,$3,$1)", [input.proposalId, input.idempotencyKey, input.requestHash]);
        await insertNotifications(client, input.proposalId, input.notifications);
        return "created";
      });
    },
    async transition(input) {
      assertPluginProposalTransition(input.from, input.to);
      return transaction(async (client) => {
        const legacy = createPostgresPluginLabStore((sql, params) => client.query(sql, params as unknown[]));
        const changed = await legacy.transition({ ...input, messageCode: `proposal-${input.to}` });
        if (!changed) return false;
        await client.query("UPDATE ena_plugin_proposals SET awaiting_reply_review=false WHERE proposal_id=$1", [input.proposalId]);
        if (input.message) {
          await client.query("INSERT INTO ena_plugin_workflow_messages (message_id,proposal_id,actor,actor_ref,body_cipher) VALUES ($1,$2,'operator',$3,$4::jsonb)", [input.message.messageId, input.proposalId, input.actorRef, JSON.stringify(input.message.bodyCipher)]);
        }
        await insertNotifications(client, input.proposalId, input.notifications);
        return true;
      });
    },
    async attachOwner(proposalId, emailRef) {
      const result = await query("UPDATE ena_plugin_proposals SET owner_email_ref=$2 WHERE proposal_id=$1 AND (owner_email_ref IS NULL OR owner_email_ref=$2) RETURNING proposal_id", [proposalId, emailRef]);
      return result.rows.length === 1;
    },
    async claimNotifications(limit, now) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isFinite(now.valueOf())) throw new TypeError("Invalid notification claim.");
      const claimToken = randomBytes(32).toString("base64url");
      const result = await query(`WITH exhausted AS (
          UPDATE ena_plugin_workflow_notifications SET status='failed',claim_token=NULL,lease_expires_at=NULL,last_error_code='lease-expired'
          WHERE status='sending' AND attempts>=5 AND lease_expires_at <= $2 RETURNING notification_id
        ), candidates AS (
          SELECT notification_id FROM ena_plugin_workflow_notifications WHERE attempts<5
            AND ((status='pending' AND next_attempt_at <= $2) OR (status='sending' AND lease_expires_at <= $2))
          ORDER BY created_at,notification_id FOR UPDATE SKIP LOCKED LIMIT $1
        ) UPDATE ena_plugin_workflow_notifications n SET status='sending',attempts=n.attempts+1,claim_token=$3,
          lease_expires_at=$2::timestamptz+interval '120 seconds'
        FROM candidates c WHERE n.notification_id=c.notification_id RETURNING n.*`, [limit, now, claimToken]);
      return result.rows.map((row): ClaimedNotification => ({ id: String(row.notification_id), proposalId: String(row.proposal_id), kind: row.kind, recipientCipher: row.recipient_cipher, locale: String(row.locale), target: row.target, attempts: Number(row.attempts), claimToken: String(row.claim_token), leaseExpiresAt: timestamp(row.lease_expires_at) }));
    },
    async settleNotification(input) {
      const permittedErrors = new Set(["transport", "provider", "configuration", "recipient", "unknown", "delivery-failed", "mail-unavailable", "rate-limited", "timeout"]);
      const errorCode = input.success ? null : permittedErrors.has(input.errorCode ?? "") ? input.errorCode : "delivery-failed";
      const result = await query(`UPDATE ena_plugin_workflow_notifications SET
        status=CASE WHEN $3 THEN 'sent' WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,
        sent_at=CASE WHEN $3 THEN $4::timestamptz ELSE NULL END,
        next_attempt_at=CASE WHEN $3 THEN next_attempt_at ELSE $4::timestamptz+make_interval(secs => LEAST(3600,30*power(2,attempts))::integer) END,
        claim_token=NULL,lease_expires_at=NULL,last_error_code=$5
        WHERE notification_id=$1 AND claim_token=$2 AND status='sending' AND lease_expires_at > $4 RETURNING notification_id`,
      [input.id, input.claimToken, input.success, input.now, errorCode]);
      return result.rows.length === 1;
    },
  };
}

// Cache only by the effective connection target; every call first validates its own configuration.
const productionStores = new Map<string, WorkflowStore>();
export async function createProductionWorkflowStore(environment: PluginLabEnvironment = process.env): Promise<WorkflowStore | null> {
  const configuration = readPluginLabConfiguration(environment);
  if (!configuration) return null;
  const existing = productionStores.get(configuration.databaseUrl);
  if (existing) return existing;
  const pool = new Pool({ connectionString: configuration.databaseUrl, max: 2, connectionTimeoutMillis: 2_000, idleTimeoutMillis: 30_000, statement_timeout: 5_000, allowExitOnIdle: true });
  pool.on("error", () => console.error("plugin-lab-workflow-store:idle-connection-error"));
  const store = createWorkflowStore(pool);
  productionStores.set(configuration.databaseUrl, store);
  return store;
}
