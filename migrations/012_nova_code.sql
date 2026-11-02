-- Nova Code private drafts. No publication tables or proposal state are changed.
BEGIN;
CREATE TABLE IF NOT EXISTS ena_nova_sessions (
  session_id uuid PRIMARY KEY,
  owner_ref text NOT NULL CHECK (owner_ref ~ '^[A-Za-z0-9_-]{43}$'),
  document_cipher jsonb NOT NULL CHECK (jsonb_typeof(document_cipher)='array'),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS ena_nova_sessions_owner_idx ON ena_nova_sessions(owner_ref,updated_at DESC);
CREATE TABLE IF NOT EXISTS ena_nova_runs (
  run_id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES ena_nova_sessions(session_id) ON DELETE RESTRICT,
  queue_state text NOT NULL CHECK (queue_state IN ('queued','running','waiting','finished')),
  claim_token uuid,
  lease_expires_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  checkpoint_cipher jsonb,
  created_at timestamptz NOT NULL,
  CHECK ((queue_state='running')=(claim_token IS NOT NULL AND lease_expires_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS ena_nova_one_active_run ON ena_nova_runs(session_id) WHERE queue_state<>'finished';
CREATE INDEX IF NOT EXISTS ena_nova_queue_idx ON ena_nova_runs(queue_state,created_at);
CREATE TABLE IF NOT EXISTS ena_nova_receipts (
  owner_ref text NOT NULL,
  idempotency_key uuid NOT NULL,
  action text NOT NULL,
  subject text NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  session_id uuid NOT NULL REFERENCES ena_nova_sessions(session_id),
  run_id uuid,
  created_at timestamptz NOT NULL,
  PRIMARY KEY(owner_ref,idempotency_key)
);
CREATE TABLE IF NOT EXISTS ena_nova_events (
  cursor bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES ena_nova_sessions(session_id),
  run_id uuid,
  event_type text NOT NULL CHECK (event_type IN ('message','run','artifact','expert')),
  detail text NOT NULL CHECK (detail ~ '^[a-z]+(?:-[a-z]+)*$'),
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS ena_nova_events_session_idx ON ena_nova_events(session_id,cursor);
CREATE TABLE IF NOT EXISTS ena_nova_notifications (
  notification_id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES ena_nova_sessions(session_id),
  request_id uuid NOT NULL UNIQUE,
  request_cursor bigint GENERATED ALWAYS AS IDENTITY,
  request_status text NOT NULL DEFAULT 'requested' CHECK (request_status IN ('requested','answered','superseded')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  claim_token uuid,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  CHECK ((status='sending')=(claim_token IS NOT NULL AND lease_expires_at IS NOT NULL))
);
-- Request metadata is non-content index material; questions/code remain encrypted in the session.
CREATE UNIQUE INDEX IF NOT EXISTS ena_nova_expert_cursor_idx ON ena_nova_notifications(request_cursor);
CREATE INDEX IF NOT EXISTS ena_nova_expert_pending_idx ON ena_nova_notifications(request_cursor) WHERE request_status='requested';
CREATE INDEX IF NOT EXISTS ena_nova_expert_history_idx ON ena_nova_notifications(request_cursor DESC) WHERE request_status<>'requested';
CREATE INDEX IF NOT EXISTS ena_nova_notifications_ready_idx ON ena_nova_notifications(status,next_attempt_at);
CREATE OR REPLACE FUNCTION ena_nova_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Nova audit records are append-only' USING ERRCODE='55000'; END;
$$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='ena_nova_events'::regclass AND tgname='ena_nova_events_immutable') THEN
    CREATE TRIGGER ena_nova_events_immutable BEFORE UPDATE OR DELETE ON ena_nova_events FOR EACH ROW EXECUTE FUNCTION ena_nova_immutable();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='ena_nova_receipts'::regclass AND tgname='ena_nova_receipts_immutable') THEN
    CREATE TRIGGER ena_nova_receipts_immutable BEFORE UPDATE OR DELETE ON ena_nova_receipts FOR EACH ROW EXECUTE FUNCTION ena_nova_immutable();
  END IF;
END $$;
REVOKE ALL ON ena_nova_sessions,ena_nova_runs,ena_nova_receipts,ena_nova_events,ena_nova_notifications FROM PUBLIC;
REVOKE ALL ON FUNCTION ena_nova_immutable() FROM PUBLIC;
-- Application role: SELECT/INSERT/UPDATE mutable tables; SELECT/INSERT events and receipts; sequence USAGE.
COMMIT;
