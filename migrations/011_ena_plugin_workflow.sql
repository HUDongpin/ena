-- Plugin Lab researcher workflow. Apply after 005 using a migration role.
-- Every email and message is encrypted by the application. Email references are keyed digests.
BEGIN;

ALTER TABLE ena_plugin_proposals ADD COLUMN IF NOT EXISTS owner_email_ref text;
ALTER TABLE ena_plugin_proposals ADD COLUMN IF NOT EXISTS awaiting_reply_review boolean NOT NULL DEFAULT false;
ALTER TABLE ena_plugin_proposals ALTER COLUMN public_projection_cipher DROP NOT NULL;
ALTER TABLE ena_plugin_proposals ALTER COLUMN public_projection_sha256 DROP NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='ena_plugin_proposals'::regclass AND conname='ena_plugin_proposals_workflow_owner_check') THEN
    ALTER TABLE ena_plugin_proposals ADD CONSTRAINT ena_plugin_proposals_workflow_owner_check
      CHECK (owner_email_ref IS NULL OR owner_email_ref ~ '^[A-Za-z0-9_-]{43}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='ena_plugin_proposals'::regclass AND conname='ena_plugin_proposals_projection_pair_check') THEN
    ALTER TABLE ena_plugin_proposals ADD CONSTRAINT ena_plugin_proposals_projection_pair_check CHECK (
      (public_projection_cipher IS NOT NULL AND public_projection_sha256 IS NOT NULL)
      OR (public_projection_cipher IS NULL AND public_projection_sha256 IS NULL
        AND visibility='private' AND public_consent_status='not-requested')
    );
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS ena_plugin_proposals_owner_updated_idx
  ON ena_plugin_proposals (owner_email_ref, updated_at DESC, proposal_id) WHERE owner_email_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS ena_plugin_workflow_email_contacts (
  email_ref text PRIMARY KEY CHECK (email_ref ~ '^[A-Za-z0-9_-]{43}$'),
  email_cipher jsonb NOT NULL CHECK (jsonb_typeof(email_cipher)='object'),
  last_challenge_at timestamptz NOT NULL,
  verified_at timestamptz,
  verified_by text CHECK (verified_by IS NULL OR verified_by ~ '^[A-Za-z0-9_-]{43}$')
);
CREATE TABLE IF NOT EXISTS ena_plugin_workflow_challenges (
  challenge_id text PRIMARY KEY CHECK (challenge_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  email_ref text NOT NULL REFERENCES ena_plugin_workflow_email_contacts(email_ref) ON DELETE RESTRICT,
  code_hash text NOT NULL CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  locale text NOT NULL CHECK (locale ~ '^[a-z]{2,3}(?:-[a-z]+)?$'),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at AND expires_at <= created_at + interval '10 minutes'),
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
  consumed_at timestamptz,
  invalidated_at timestamptz
);
CREATE INDEX IF NOT EXISTS ena_plugin_workflow_challenges_email_active_idx
  ON ena_plugin_workflow_challenges (email_ref) WHERE consumed_at IS NULL AND invalidated_at IS NULL;
CREATE INDEX IF NOT EXISTS ena_plugin_workflow_challenges_expiry_idx ON ena_plugin_workflow_challenges (expires_at);
CREATE TABLE IF NOT EXISTS ena_plugin_workflow_sessions (
  session_hash text PRIMARY KEY CHECK (session_hash ~ '^[0-9a-f]{64}$'),
  email_ref text NOT NULL REFERENCES ena_plugin_workflow_email_contacts(email_ref) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at AND expires_at <= created_at + interval '30 minutes'),
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS ena_plugin_workflow_sessions_expiry_idx ON ena_plugin_workflow_sessions (expires_at);
CREATE INDEX IF NOT EXISTS ena_plugin_workflow_sessions_email_idx ON ena_plugin_workflow_sessions (email_ref);
CREATE TABLE IF NOT EXISTS ena_plugin_workflow_verification_events (
  verification_event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email_ref text NOT NULL REFERENCES ena_plugin_workflow_email_contacts(email_ref) ON DELETE RESTRICT,
  challenge_id text NOT NULL UNIQUE REFERENCES ena_plugin_workflow_challenges(challenge_id) ON DELETE RESTRICT,
  actor_ref text NOT NULL CHECK (actor_ref ~ '^[A-Za-z0-9_-]{43}$'),
  recorded_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS ena_plugin_workflow_verification_events_email_idx
  ON ena_plugin_workflow_verification_events (email_ref, verification_event_id);

CREATE TABLE IF NOT EXISTS ena_plugin_workflow_rate_limits (
  scope_kind text NOT NULL CHECK (scope_kind ~ '^[a-z]+(?:-[a-z]+)*$'),
  scope_ref text NOT NULL CHECK (scope_ref ~ '^[A-Za-z0-9_-]{43}$'),
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count >= 1),
  PRIMARY KEY (scope_kind, scope_ref)
);
CREATE INDEX IF NOT EXISTS ena_plugin_workflow_rate_limits_expiry_idx ON ena_plugin_workflow_rate_limits (window_start);

CREATE TABLE IF NOT EXISTS ena_plugin_workflow_requests (
  operation_kind text NOT NULL CHECK (operation_kind IN ('submission', 'reply')),
  owner_ref text NOT NULL CHECK (length(owner_ref) BETWEEN 1 AND 128),
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{1,128}$'),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  proposal_id text NOT NULL REFERENCES ena_plugin_proposals(proposal_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (operation_kind, owner_ref, idempotency_key)
);
CREATE INDEX IF NOT EXISTS ena_plugin_workflow_requests_proposal_idx ON ena_plugin_workflow_requests (proposal_id);
CREATE TABLE IF NOT EXISTS ena_plugin_workflow_messages (
  message_id text PRIMARY KEY CHECK (message_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  proposal_id text NOT NULL REFERENCES ena_plugin_proposals(proposal_id) ON DELETE RESTRICT,
  actor text NOT NULL CHECK (actor IN ('operator', 'researcher')),
  actor_ref text NOT NULL CHECK (actor_ref ~ '^[A-Za-z0-9_-]{1,128}$'),
  body_cipher jsonb NOT NULL CHECK (jsonb_typeof(body_cipher)='object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS ena_plugin_workflow_messages_proposal_idx ON ena_plugin_workflow_messages (proposal_id, created_at, message_id);

CREATE TABLE IF NOT EXISTS ena_plugin_workflow_notifications (
  notification_id text PRIMARY KEY CHECK (notification_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  proposal_id text NOT NULL REFERENCES ena_plugin_proposals(proposal_id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('received', 'status', 'reply')),
  recipient_cipher jsonb NOT NULL CHECK (jsonb_typeof(recipient_cipher)='object'),
  locale text NOT NULL CHECK (locale ~ '^[a-z]{2,3}(?:-[a-z]+)?$'),
  target text NOT NULL CHECK (target IN ('researcher', 'operator')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  claim_token text,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_error_code text CHECK (last_error_code IS NULL OR last_error_code ~ '^[a-z]+(?:-[a-z]+)*$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  sent_at timestamptz,
  CHECK ((status='sending' AND claim_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status<>'sending' AND claim_token IS NULL AND lease_expires_at IS NULL)),
  CHECK ((status='sent')=(sent_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ena_plugin_workflow_notifications_ready_idx
  ON ena_plugin_workflow_notifications (next_attempt_at, created_at) WHERE status='pending';
CREATE INDEX IF NOT EXISTS ena_plugin_workflow_notifications_lease_idx
  ON ena_plugin_workflow_notifications (lease_expires_at) WHERE status='sending';
CREATE INDEX IF NOT EXISTS ena_plugin_workflow_notifications_proposal_idx
  ON ena_plugin_workflow_notifications (proposal_id, created_at);

-- New audit records and messages cannot be rewritten, even by the application table owner.
CREATE OR REPLACE FUNCTION ena_plugin_workflow_immutable_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Plugin Lab workflow records are append-only' USING ERRCODE='55000'; END;
$$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='ena_plugin_workflow_verification_events'::regclass AND tgname='ena_plugin_workflow_verification_immutable') THEN
    CREATE TRIGGER ena_plugin_workflow_verification_immutable BEFORE UPDATE OR DELETE ON ena_plugin_workflow_verification_events
      FOR EACH ROW EXECUTE FUNCTION ena_plugin_workflow_immutable_record();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='ena_plugin_workflow_messages'::regclass AND tgname='ena_plugin_workflow_messages_immutable') THEN
    CREATE TRIGGER ena_plugin_workflow_messages_immutable BEFORE UPDATE OR DELETE ON ena_plugin_workflow_messages
      FOR EACH ROW EXECUTE FUNCTION ena_plugin_workflow_immutable_record();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='ena_plugin_workflow_requests'::regclass AND tgname='ena_plugin_workflow_requests_immutable') THEN
    CREATE TRIGGER ena_plugin_workflow_requests_immutable BEFORE UPDATE OR DELETE ON ena_plugin_workflow_requests
      FOR EACH ROW EXECUTE FUNCTION ena_plugin_workflow_immutable_record();
  END IF;
END $$;
REVOKE ALL ON ena_plugin_workflow_email_contacts, ena_plugin_workflow_challenges, ena_plugin_workflow_sessions,
  ena_plugin_workflow_verification_events, ena_plugin_workflow_rate_limits, ena_plugin_workflow_requests,
  ena_plugin_workflow_messages, ena_plugin_workflow_notifications FROM PUBLIC;
REVOKE ALL ON FUNCTION ena_plugin_workflow_immutable_record() FROM PUBLIC;
-- Grant the application role SELECT/INSERT/UPDATE on mutable workflow tables;
-- SELECT/INSERT only on messages, verification_events and requests, plus sequence USAGE.
COMMIT;
