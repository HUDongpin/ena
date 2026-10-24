-- Shared registered identities and private cloud projects for both public domains.
-- Run as the database operator; the application role remains a non-owner without BYPASSRLS.
BEGIN;

CREATE TABLE IF NOT EXISTS public.open_ena_users (
  id uuid PRIMARY KEY,
  email varchar(254) NOT NULL UNIQUE CHECK (email = lower(btrim(email)) AND email !~ '[[:space:]]' AND position('@' in email) > 1),
  password_salt bytea NOT NULL CHECK (octet_length(password_salt) = 16),
  password_hash bytea NOT NULL CHECK (octet_length(password_hash) = 32),
  session_version integer NOT NULL DEFAULT 1 CHECK (session_version > 0),
  verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  password_changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.open_ena_account_actions (
  id uuid PRIMARY KEY,
  token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  purpose text NOT NULL CHECK (purpose IN ('verify', 'reset')),
  email varchar(254) NOT NULL CHECK (email = lower(btrim(email))),
  user_id uuid REFERENCES public.open_ena_users(id),
  session_version integer,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK ((purpose = 'verify' AND user_id IS NULL AND session_version IS NULL)
    OR (purpose = 'reset' AND user_id IS NOT NULL AND session_version > 0))
);
CREATE INDEX IF NOT EXISTS open_ena_account_actions_expiry_idx ON public.open_ena_account_actions(expires_at);
CREATE INDEX IF NOT EXISTS open_ena_account_actions_user_idx ON public.open_ena_account_actions(user_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.open_ena_account_request_limits (
  rate_key char(64) PRIMARY KEY CHECK (rate_key ~ '^[a-f0-9]{64}$'),
  hits integer NOT NULL CHECK (hits > 0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS open_ena_account_request_limits_expiry_idx ON public.open_ena_account_request_limits(expires_at);

CREATE TABLE IF NOT EXISTS public.open_ena_projects (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES public.open_ena_users(id),
  title varchar(120) NOT NULL CHECK (length(btrim(title)) > 0),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  snapshot_version smallint NOT NULL DEFAULT 1 CHECK (snapshot_version = 1),
  content_ciphertext bytea NOT NULL CHECK (octet_length(content_ciphertext) BETWEEN 29 AND 16777244),
  content_sha256 char(64) NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 16777216),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  archived_at timestamptz
);
CREATE INDEX IF NOT EXISTS open_ena_projects_owner_updated_idx ON public.open_ena_projects(owner_id, updated_at DESC, id);
ALTER TABLE public.open_ena_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.open_ena_projects FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'open_ena_projects' AND policyname = 'open_ena_project_owner') THEN
    CREATE POLICY open_ena_project_owner ON public.open_ena_projects
      USING (owner_id::text = current_setting('open_ena.user_id', true))
      WITH CHECK (owner_id::text = current_setting('open_ena.user_id', true));
  END IF;
END $$;

REVOKE ALL ON public.open_ena_users, public.open_ena_account_actions, public.open_ena_account_request_limits, public.open_ena_projects FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'openena') THEN
    GRANT SELECT, INSERT, UPDATE ON public.open_ena_users TO openena;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.open_ena_account_actions, public.open_ena_account_request_limits TO openena;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.open_ena_projects TO openena;
  END IF;
END $$;
COMMIT;
