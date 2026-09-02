-- ENA Plugin Lab proposal state. Apply with a dedicated least-privilege role.
-- Contact and proposal text live only inside application-encrypted payload_cipher.

CREATE TABLE IF NOT EXISTS ena_plugin_proposals (
  proposal_id text PRIMARY KEY CHECK (proposal_id ~ '^plg_[A-Za-z0-9_-]{22}$'),
  state text NOT NULL CHECK (state IN ('received', 'under-review', 'needs-information', 'selected', 'not-selected', 'withdrawn')),
  track text NOT NULL CHECK (track IN ('academic', 'commissioned', 'unsure')),
  visibility text NOT NULL CHECK (visibility IN ('private', 'public-after-review')),
  public_consent_status text NOT NULL CHECK (public_consent_status IN ('not-requested', 'requested', 'confirmed', 'withdrawn')),
  public_moderation_status text NOT NULL CHECK (public_moderation_status IN ('pending', 'approved', 'rejected')),
  email_confirmed_at timestamptz NULL,
  email_confirmed_by text NULL CHECK (email_confirmed_by IS NULL OR email_confirmed_by ~ '^[A-Za-z0-9_-]{43}$'),
  submitted_locale text NOT NULL CHECK (submitted_locale ~ '^[a-z]{2,3}(?:-[a-z]+)?$'),
  payload_cipher jsonb NOT NULL CHECK (jsonb_typeof(payload_cipher) = 'object'),
  public_projection_cipher jsonb NOT NULL CHECK (jsonb_typeof(public_projection_cipher) = 'object'),
  public_projection_sha256 text NOT NULL CHECK (public_projection_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS ena_plugin_proposals_state_updated_idx
  ON ena_plugin_proposals (state, updated_at DESC);

CREATE TABLE IF NOT EXISTS ena_plugin_proposal_events (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proposal_id text NOT NULL REFERENCES ena_plugin_proposals(proposal_id) ON DELETE RESTRICT,
  from_state text NULL CHECK (from_state IS NULL OR from_state IN ('received', 'under-review', 'needs-information', 'selected', 'not-selected', 'withdrawn')),
  to_state text NOT NULL CHECK (to_state IN ('received', 'under-review', 'needs-information', 'selected', 'not-selected', 'withdrawn')),
  actor_ref text NOT NULL CHECK (actor_ref ~ '^[A-Za-z0-9_-]{1,128}$'),
  message_code text NOT NULL CHECK (message_code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  reason_cipher jsonb NULL CHECK (reason_cipher IS NULL OR jsonb_typeof(reason_cipher) = 'object'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS ena_plugin_proposal_events_proposal_idx
  ON ena_plugin_proposal_events (proposal_id, event_id);

CREATE TABLE IF NOT EXISTS ena_plugin_proposal_publication_events (
  publication_event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proposal_id text NOT NULL REFERENCES ena_plugin_proposals(proposal_id) ON DELETE RESTRICT,
  event_kind text NOT NULL CHECK (event_kind IN ('moderation-approved-consent-requested', 'consent-confirmed', 'consent-withdrawn', 'proposal-withdrawal-consent-withdrawn')),
  from_consent_status text NOT NULL CHECK (from_consent_status IN ('not-requested', 'requested', 'confirmed', 'withdrawn')),
  to_consent_status text NOT NULL CHECK (to_consent_status IN ('not-requested', 'requested', 'confirmed', 'withdrawn')),
  from_moderation_status text NOT NULL CHECK (from_moderation_status IN ('pending', 'approved', 'rejected')),
  to_moderation_status text NOT NULL CHECK (to_moderation_status IN ('pending', 'approved', 'rejected')),
  actor_kind text NOT NULL CHECK (actor_kind IN ('operator', 'proposer', 'system')),
  actor_ref text NOT NULL CHECK (actor_ref ~ '^[A-Za-z0-9_-]{43}$'),
  public_projection_sha256 text NOT NULL CHECK (public_projection_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS ena_plugin_proposal_publication_events_proposal_idx
  ON ena_plugin_proposal_publication_events (proposal_id, publication_event_id);

REVOKE UPDATE, DELETE ON ena_plugin_proposal_events FROM PUBLIC;
REVOKE UPDATE, DELETE ON ena_plugin_proposal_publication_events FROM PUBLIC;

CREATE TABLE IF NOT EXISTS ena_plugin_proposal_access_tokens (
  proposal_id text PRIMARY KEY REFERENCES ena_plugin_proposals(proposal_id) ON DELETE CASCADE,
  access_hash text NOT NULL CHECK (access_hash ~ '^[0-9a-f]{64}$'),
  rotated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS ena_plugin_proposal_rate_limits (
  scope_kind text NOT NULL CHECK (scope_kind IN ('submission-source', 'submission-email', 'status-source')),
  scope_ref text NOT NULL CHECK (scope_ref ~ '^[A-Za-z0-9_-]{43}$'),
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count >= 1),
  PRIMARY KEY (scope_kind, scope_ref)
);

CREATE INDEX IF NOT EXISTS ena_plugin_proposal_rate_limits_expiry_idx
  ON ena_plugin_proposal_rate_limits (window_start);
