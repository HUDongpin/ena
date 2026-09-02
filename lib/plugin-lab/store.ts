import type { PluginLabCiphertextV1 } from "./crypto";
import type { PluginProposalState, PluginProposalTrack, PluginProposalVisibility } from "./proposal";
import type { PluginLabConfiguration, PluginLabEnvironment } from "./config";
import { readPluginLabConfiguration } from "./config";

export interface PluginLabCreateProposalInput {
  proposalId: string;
  accessHash: string;
  payloadCipher: PluginLabCiphertextV1;
  publicProjectionCipher: PluginLabCiphertextV1;
  publicProjectionSha256: string;
  track: PluginProposalTrack;
  visibility: PluginProposalVisibility;
  submittedLocale: string;
}

export interface PluginLabStatusRecord {
  proposalId: string;
  state: PluginProposalState;
  createdAt: string;
  updatedAt: string;
  events: readonly Readonly<{ state: PluginProposalState; messageCode: string; recordedAt: string }>[];
  payloadCipher?: PluginLabCiphertextV1;
  publicProjectionCipher?: PluginLabCiphertextV1;
  publicProjectionSha256?: string;
  visibility?: PluginProposalVisibility;
  publicConsentStatus?: "not-requested" | "requested" | "confirmed" | "withdrawn";
  publicModerationStatus?: "pending" | "approved" | "rejected";
  emailConfirmed?: boolean;
}

export interface PluginLabOperatorRecord extends PluginLabStatusRecord {
  payloadCipher: PluginLabCiphertextV1;
  track: PluginProposalTrack;
  visibility: PluginProposalVisibility;
  emailConfirmed: boolean;
  publicConsentStatus: "not-requested" | "requested" | "confirmed" | "withdrawn";
  publicModerationStatus: "pending" | "approved" | "rejected";
}

export interface PluginLabPublicSummaryRecord {
  proposalId: string;
  publicProjectionCipher: PluginLabCiphertextV1;
  publicProjectionSha256: string;
  updatedAt: string;
}

export interface PluginLabRetentionCandidate {
  proposalId: string;
  state: "not-selected" | "withdrawn";
  updatedAt: string;
}

export interface PluginLabStore {
  consumeRateLimit(input: { scopeKind: "submission-source" | "submission-email" | "status-source"; scopeRef: string; limit: number; windowSeconds: number }): Promise<boolean>;
  createProposal(input: PluginLabCreateProposalInput): Promise<void>;
  accessHashFor(proposalId: string): Promise<string | null>;
  readStatus(proposalId: string): Promise<PluginLabStatusRecord | null>;
  listForOperator(): Promise<readonly PluginLabOperatorRecord[]>;
  transition(input: { proposalId: string; from: PluginProposalState; to: PluginProposalState; actorRef: string; messageCode: string; reasonCipher: PluginLabCiphertextV1 }): Promise<boolean>;
  rotateAccessHash(proposalId: string, accessHash: string): Promise<boolean>;
  confirmEmail(proposalId: string, actorRef: string): Promise<boolean>;
  previewRetention(input: { before: string; limit: number }): Promise<readonly PluginLabRetentionCandidate[]>;
  requestPublicConsent(proposalId: string, actorRef: string): Promise<boolean>;
  setPublicConsent(proposalId: string, action: "confirm" | "withdraw", actorRef: string): Promise<boolean>;
  listPublicSummaries(): Promise<readonly PluginLabPublicSummaryRecord[]>;
}

export type PluginLabQuery = (sql: string, params?: readonly unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;

function storeFailure(cause: unknown): never {
  throw new Error("Plugin Lab durable store is unavailable.", { cause });
}

function asDate(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  storeFailure(new TypeError("Invalid store timestamp."));
}

function statusState(value: unknown): PluginProposalState {
  if (value === "received" || value === "under-review" || value === "needs-information" || value === "selected" || value === "not-selected" || value === "withdrawn") return value;
  storeFailure(new TypeError("Invalid store state."));
}

function retentionState(value: unknown): PluginLabRetentionCandidate["state"] {
  if (value === "not-selected" || value === "withdrawn") return value;
  storeFailure(new TypeError("Invalid retention-candidate state."));
}

function statusRecord(rows: Array<Record<string, unknown>>): PluginLabStatusRecord | null {
  const proposal = rows[0];
  if (!proposal) return null;
  const eventsValue = proposal.events;
  if (!Array.isArray(eventsValue)) storeFailure(new TypeError("Invalid store events."));
  return {
    proposalId: String(proposal.proposal_id),
    state: statusState(proposal.state),
    createdAt: asDate(proposal.created_at),
    updatedAt: asDate(proposal.updated_at),
    events: eventsValue.map((event) => {
      if (!event || typeof event !== "object") storeFailure(new TypeError("Invalid store event."));
      const item = event as Record<string, unknown>;
      return { state: statusState(item.state), messageCode: String(item.messageCode), recordedAt: asDate(item.recordedAt) };
    }),
    ...(proposal.payload_cipher ? { payloadCipher: proposal.payload_cipher as PluginLabCiphertextV1 } : {}),
    ...(proposal.public_projection_cipher ? { publicProjectionCipher: proposal.public_projection_cipher as PluginLabCiphertextV1 } : {}),
    ...(typeof proposal.public_projection_sha256 === "string" && /^[0-9a-f]{64}$/u.test(proposal.public_projection_sha256) ? { publicProjectionSha256: proposal.public_projection_sha256 } : {}),
    ...(typeof proposal.visibility === "string" ? { visibility: proposal.visibility as PluginProposalVisibility } : {}),
    ...(typeof proposal.public_consent_status === "string" ? { publicConsentStatus: proposal.public_consent_status as PluginLabStatusRecord["publicConsentStatus"] } : {}),
    ...(typeof proposal.public_moderation_status === "string" ? { publicModerationStatus: proposal.public_moderation_status as PluginLabStatusRecord["publicModerationStatus"] } : {}),
    ...(Object.hasOwn(proposal, "email_confirmed_at") ? { emailConfirmed: proposal.email_confirmed_at !== null && proposal.email_confirmed_at !== undefined } : {}),
  };
}

export function createPostgresPluginLabStore(query: PluginLabQuery): PluginLabStore {
  return {
    async consumeRateLimit(input) {
      try {
        const result = await query(`
          INSERT INTO ena_plugin_proposal_rate_limits (scope_kind, scope_ref, window_start, request_count)
          VALUES ($1, $2, clock_timestamp(), 1)
          ON CONFLICT (scope_kind, scope_ref) DO UPDATE SET
            window_start = CASE WHEN clock_timestamp() >= ena_plugin_proposal_rate_limits.window_start + make_interval(secs => $4) THEN clock_timestamp() ELSE ena_plugin_proposal_rate_limits.window_start END,
            request_count = CASE WHEN clock_timestamp() >= ena_plugin_proposal_rate_limits.window_start + make_interval(secs => $4) THEN 1 ELSE ena_plugin_proposal_rate_limits.request_count + 1 END
          RETURNING request_count <= $3 AS allowed`, [input.scopeKind, input.scopeRef, input.limit, input.windowSeconds]);
        return result.rows[0]?.allowed === true;
      } catch (error) { storeFailure(error); }
    },
    async createProposal(input) {
      try {
        const result = await query(`
          WITH created AS (
            INSERT INTO ena_plugin_proposals (proposal_id, state, track, visibility, public_consent_status, public_moderation_status, submitted_locale, payload_cipher, public_projection_cipher, public_projection_sha256)
            VALUES ($1, 'received', $2, $3, 'not-requested', 'pending', $4, $5::jsonb, $6::jsonb, $7)
            RETURNING proposal_id
          ), token AS (
            INSERT INTO ena_plugin_proposal_access_tokens (proposal_id, access_hash)
            SELECT proposal_id, $8 FROM created RETURNING proposal_id
          )
          INSERT INTO ena_plugin_proposal_events (proposal_id, from_state, to_state, actor_ref, message_code)
          SELECT proposal_id, NULL, 'received', 'system', 'proposal-received' FROM token
          RETURNING proposal_id`, [input.proposalId, input.track, input.visibility, input.submittedLocale, JSON.stringify(input.payloadCipher), JSON.stringify(input.publicProjectionCipher), input.publicProjectionSha256, input.accessHash]);
        if (result.rows[0]?.proposal_id !== input.proposalId) storeFailure(new TypeError("Proposal write was not confirmed."));
      } catch (error) { storeFailure(error); }
    },
    async accessHashFor(proposalId) {
      try {
        const result = await query("SELECT access_hash FROM ena_plugin_proposal_access_tokens WHERE proposal_id = $1 LIMIT 1", [proposalId]);
        const value = result.rows[0]?.access_hash;
        return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value) ? value : null;
      } catch (error) { storeFailure(error); }
    },
    async readStatus(proposalId) {
      try {
        const result = await query(`
          SELECT p.proposal_id, p.state, p.visibility, p.email_confirmed_at, p.public_consent_status, p.public_moderation_status, p.public_projection_cipher, p.public_projection_sha256, p.created_at, p.updated_at,
            COALESCE(jsonb_agg(jsonb_build_object('state', e.to_state, 'messageCode', e.message_code, 'recordedAt', e.recorded_at) ORDER BY e.event_id) FILTER (WHERE e.event_id IS NOT NULL), '[]'::jsonb) AS events
          FROM ena_plugin_proposals p LEFT JOIN ena_plugin_proposal_events e ON e.proposal_id = p.proposal_id
          WHERE p.proposal_id = $1 GROUP BY p.proposal_id`, [proposalId]);
        return statusRecord(result.rows);
      } catch (error) { storeFailure(error); }
    },
    async listForOperator() {
      try {
        const result = await query(`
          SELECT p.proposal_id, p.state, p.track, p.visibility, p.email_confirmed_at, p.public_consent_status, p.public_moderation_status, p.payload_cipher, p.public_projection_cipher, p.created_at, p.updated_at,
            COALESCE(jsonb_agg(jsonb_build_object('state', e.to_state, 'messageCode', e.message_code, 'recordedAt', e.recorded_at) ORDER BY e.event_id) FILTER (WHERE e.event_id IS NOT NULL), '[]'::jsonb) AS events
          FROM ena_plugin_proposals p LEFT JOIN ena_plugin_proposal_events e ON e.proposal_id = p.proposal_id
          GROUP BY p.proposal_id ORDER BY p.updated_at DESC LIMIT 200`);
        return result.rows.map((row) => ({
          ...statusRecord([row])!,
          payloadCipher: row.payload_cipher as PluginLabCiphertextV1,
          track: row.track as PluginProposalTrack,
          visibility: row.visibility as PluginProposalVisibility,
          emailConfirmed: row.email_confirmed_at !== null && row.email_confirmed_at !== undefined,
          publicConsentStatus: row.public_consent_status as PluginLabOperatorRecord["publicConsentStatus"],
          publicModerationStatus: row.public_moderation_status as PluginLabOperatorRecord["publicModerationStatus"],
        }));
      } catch (error) { storeFailure(error); }
    },
    async transition(input) {
      try {
        const result = await query(`
          WITH candidate AS (
            SELECT proposal_id, public_consent_status, public_moderation_status, public_projection_sha256
            FROM ena_plugin_proposals WHERE proposal_id = $1 AND state = $2 FOR UPDATE
          ), changed AS (
            UPDATE ena_plugin_proposals p SET
              state = $3,
              public_consent_status = CASE WHEN $3 = 'withdrawn' AND c.public_consent_status IN ('requested', 'confirmed') THEN 'withdrawn' ELSE c.public_consent_status END,
              updated_at = clock_timestamp()
            FROM candidate c WHERE p.proposal_id = c.proposal_id
            RETURNING p.proposal_id, c.public_consent_status AS prior_consent_status, p.public_consent_status, c.public_moderation_status, c.public_projection_sha256
          ), lifecycle_event AS (
            INSERT INTO ena_plugin_proposal_events (proposal_id, from_state, to_state, actor_ref, message_code, reason_cipher)
            SELECT proposal_id, $2, $3, $4, $5, $6::jsonb FROM changed RETURNING proposal_id
          ), publication_event AS (
            INSERT INTO ena_plugin_proposal_publication_events
              (proposal_id, event_kind, from_consent_status, to_consent_status, from_moderation_status, to_moderation_status, actor_kind, actor_ref, public_projection_sha256)
            SELECT proposal_id, 'proposal-withdrawal-consent-withdrawn', prior_consent_status, public_consent_status,
              public_moderation_status, public_moderation_status, 'operator', $4, public_projection_sha256
            FROM changed WHERE $3 = 'withdrawn' AND prior_consent_status IN ('requested', 'confirmed')
            RETURNING proposal_id
          )
          SELECT proposal_id FROM lifecycle_event`,
        [input.proposalId, input.from, input.to, input.actorRef, input.messageCode, JSON.stringify(input.reasonCipher)]);
        return result.rows[0]?.proposal_id === input.proposalId;
      } catch (error) { storeFailure(error); }
    },
    async rotateAccessHash(proposalId, accessHash) {
      try {
        const result = await query("UPDATE ena_plugin_proposal_access_tokens SET access_hash = $2, rotated_at = clock_timestamp() WHERE proposal_id = $1 RETURNING proposal_id", [proposalId, accessHash]);
        return result.rows[0]?.proposal_id === proposalId;
      } catch (error) { storeFailure(error); }
    },
    async confirmEmail(proposalId, actorRef) {
      try {
        const result = await query(`
          UPDATE ena_plugin_proposals
          SET email_confirmed_at = clock_timestamp(), email_confirmed_by = $2, updated_at = clock_timestamp()
          WHERE proposal_id = $1 AND state = 'selected' AND visibility = 'public-after-review'
            AND email_confirmed_at IS NULL
          RETURNING proposal_id`, [proposalId, actorRef]);
        return result.rows[0]?.proposal_id === proposalId;
      } catch (error) { storeFailure(error); }
    },
    async previewRetention(input) {
      try {
        const result = await query(`
          SELECT proposal_id, state, updated_at FROM ena_plugin_proposals
          WHERE state IN ('not-selected', 'withdrawn') AND updated_at < $1::timestamptz
          ORDER BY updated_at ASC LIMIT $2`, [input.before, input.limit]);
        return result.rows.map((row) => ({
          proposalId: String(row.proposal_id),
          state: retentionState(row.state),
          updatedAt: asDate(row.updated_at),
        }));
      } catch (error) { storeFailure(error); }
    },
    async requestPublicConsent(proposalId, actorRef) {
      try {
        const result = await query(`
          WITH candidate AS (
            SELECT proposal_id, public_consent_status, public_moderation_status, public_projection_sha256
            FROM ena_plugin_proposals
            WHERE proposal_id = $1 AND state = 'selected' AND visibility = 'public-after-review'
              AND email_confirmed_at IS NOT NULL
              AND public_moderation_status = 'pending' AND public_consent_status = 'not-requested'
            FOR UPDATE
          ), changed AS (
            UPDATE ena_plugin_proposals p
            SET public_moderation_status = 'approved', public_consent_status = 'requested', updated_at = clock_timestamp()
            FROM candidate c WHERE p.proposal_id = c.proposal_id
            RETURNING p.proposal_id, c.public_consent_status, c.public_moderation_status, c.public_projection_sha256
          )
          INSERT INTO ena_plugin_proposal_publication_events
            (proposal_id, event_kind, from_consent_status, to_consent_status, from_moderation_status, to_moderation_status, actor_kind, actor_ref, public_projection_sha256)
          SELECT proposal_id, 'moderation-approved-consent-requested', public_consent_status, 'requested',
            public_moderation_status, 'approved', 'operator', $2, public_projection_sha256 FROM changed
          RETURNING proposal_id`, [proposalId, actorRef]);
        return result.rows[0]?.proposal_id === proposalId;
      } catch (error) { storeFailure(error); }
    },
    async setPublicConsent(proposalId, action, actorRef) {
      try {
        const target = action === "confirm" ? "confirmed" : "withdrawn";
        const permittedCurrent = action === "confirm" ? ["requested"] : ["requested", "confirmed"];
        const result = await query(`
          WITH candidate AS (
            SELECT proposal_id, public_consent_status, public_moderation_status, public_projection_sha256
            FROM ena_plugin_proposals
            WHERE proposal_id = $1 AND state = 'selected' AND visibility = 'public-after-review'
              AND email_confirmed_at IS NOT NULL AND public_moderation_status = 'approved'
              AND public_consent_status = ANY($3::text[])
            FOR UPDATE
          ), changed AS (
            UPDATE ena_plugin_proposals p SET public_consent_status = $2, updated_at = clock_timestamp()
            FROM candidate c WHERE p.proposal_id = c.proposal_id
            RETURNING p.proposal_id, c.public_consent_status, c.public_moderation_status, c.public_projection_sha256
          )
          INSERT INTO ena_plugin_proposal_publication_events
            (proposal_id, event_kind, from_consent_status, to_consent_status, from_moderation_status, to_moderation_status, actor_kind, actor_ref, public_projection_sha256)
          SELECT proposal_id, CASE WHEN $2 = 'confirmed' THEN 'consent-confirmed' ELSE 'consent-withdrawn' END,
            public_consent_status, $2, public_moderation_status, public_moderation_status,
            'proposer', $4, public_projection_sha256 FROM changed
          RETURNING proposal_id`, [proposalId, target, permittedCurrent, actorRef]);
        return result.rows[0]?.proposal_id === proposalId;
      } catch (error) { storeFailure(error); }
    },
    async listPublicSummaries() {
      try {
        const result = await query(`
          SELECT p.proposal_id, p.public_projection_cipher, p.public_projection_sha256, p.updated_at FROM ena_plugin_proposals p
          WHERE state = 'selected' AND visibility = 'public-after-review'
            AND email_confirmed_at IS NOT NULL
            AND public_moderation_status = 'approved' AND public_consent_status = 'confirmed'
            AND EXISTS (
              SELECT 1 FROM ena_plugin_proposal_publication_events e
              WHERE e.proposal_id = p.proposal_id AND e.event_kind = 'consent-confirmed'
                AND e.public_projection_sha256 = p.public_projection_sha256
            )
          ORDER BY p.updated_at DESC LIMIT 100`);
        return result.rows.map((row) => ({ proposalId: String(row.proposal_id), publicProjectionCipher: row.public_projection_cipher as PluginLabCiphertextV1, publicProjectionSha256: String(row.public_projection_sha256), updatedAt: asDate(row.updated_at) }));
      } catch (error) { storeFailure(error); }
    },
  };
}

let productionStore: Promise<PluginLabStore | null> | null = null;

export async function createProductionPluginLabStore(
  environment: PluginLabEnvironment = process.env,
  injectedQuery?: PluginLabQuery,
): Promise<PluginLabStore | null> {
  if (injectedQuery) return createPostgresPluginLabStore(injectedQuery);
  if (productionStore) return productionStore;
  const configuration: PluginLabConfiguration | null = readPluginLabConfiguration(environment);
  if (!configuration) return null;
  const pending = import("pg").then(({ Pool }) => {
    const pool = new Pool({ connectionString: configuration.databaseUrl, max: 2, connectionTimeoutMillis: 2_000, idleTimeoutMillis: 30_000, statement_timeout: 5_000 });
    return createPostgresPluginLabStore(async (sql, params) => {
      const result = await pool.query(sql, params as unknown[]); return { rows: result.rows as Array<Record<string, unknown>> };
    });
  }).catch(() => null);
  productionStore = pending;
  const resolved = await pending;
  if (!resolved && productionStore === pending) productionStore = null;
  return resolved;
}
