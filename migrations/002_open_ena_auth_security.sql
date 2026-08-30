-- Shared Open ENA authentication security state for serverless deployments.
--
-- Source identifiers and account identifiers are one-way application hashes;
-- raw IP addresses, usernames, passwords, and session tokens are never stored.
-- PostgreSQL server time is authoritative for limiter windows and revocation.

CREATE TABLE IF NOT EXISTS open_ena_auth_attempt_windows (
  scope_kind text NOT NULL CHECK (scope_kind IN ('source', 'account')),
  scope_ref text NOT NULL CHECK (scope_ref ~ '^[A-Za-z0-9_-]{1,128}$'),
  window_start timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  PRIMARY KEY (scope_kind, scope_ref)
);

CREATE INDEX IF NOT EXISTS open_ena_auth_attempt_windows_expiry_idx
  ON open_ena_auth_attempt_windows (window_start);

CREATE TABLE IF NOT EXISTS open_ena_revoked_sessions (
  jti text PRIMARY KEY CHECK (
    jti ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
  ),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS open_ena_revoked_sessions_expiry_idx
  ON open_ena_revoked_sessions (expires_at);

CREATE OR REPLACE FUNCTION open_ena_consume_login_attempt(
  p_source_ref text,
  p_account_ref text,
  p_source_limit integer,
  p_account_limit integer,
  p_window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_now timestamptz;
  v_window interval;
  v_source_count integer;
  v_account_count integer;
BEGIN
  IF p_source_ref IS NULL OR p_source_ref !~ '^[A-Za-z0-9_-]{1,128}$'
     OR p_account_ref IS NULL OR p_account_ref !~ '^[A-Za-z0-9_-]{1,128}$'
     OR p_source_limit IS NULL OR p_source_limit < 1
     OR p_account_limit IS NULL OR p_account_limit < p_source_limit
     OR p_window_seconds IS NULL OR p_window_seconds < 1 THEN
    RETURN false;
  END IF;

  v_now := clock_timestamp();
  v_window := make_interval(secs => p_window_seconds);

  -- Serialize the account bucket so attempts from many application instances
  -- and many source addresses cannot race the distributed ceiling.
  PERFORM pg_advisory_xact_lock(hashtextextended('open_ena_login:' || p_account_ref, 0));

  INSERT INTO open_ena_auth_attempt_windows (
    scope_kind,
    scope_ref,
    window_start,
    attempt_count
  ) VALUES ('source', p_source_ref, v_now, 1)
  ON CONFLICT (scope_kind, scope_ref) DO UPDATE
  SET window_start = CASE
        WHEN v_now >= open_ena_auth_attempt_windows.window_start + v_window THEN v_now
        ELSE open_ena_auth_attempt_windows.window_start
      END,
      attempt_count = CASE
        WHEN v_now >= open_ena_auth_attempt_windows.window_start + v_window THEN 1
        ELSE open_ena_auth_attempt_windows.attempt_count + 1
      END
  RETURNING attempt_count INTO v_source_count;

  INSERT INTO open_ena_auth_attempt_windows (
    scope_kind,
    scope_ref,
    window_start,
    attempt_count
  ) VALUES ('account', p_account_ref, v_now, 1)
  ON CONFLICT (scope_kind, scope_ref) DO UPDATE
  SET window_start = CASE
        WHEN v_now >= open_ena_auth_attempt_windows.window_start + v_window THEN v_now
        ELSE open_ena_auth_attempt_windows.window_start
      END,
      attempt_count = CASE
        WHEN v_now >= open_ena_auth_attempt_windows.window_start + v_window THEN 1
        ELSE open_ena_auth_attempt_windows.attempt_count + 1
      END
  RETURNING attempt_count INTO v_account_count;

  DELETE FROM open_ena_auth_attempt_windows
  WHERE window_start < v_now - interval '7 days';

  RETURN v_source_count <= p_source_limit AND v_account_count <= p_account_limit;
END;
$$;

CREATE OR REPLACE FUNCTION open_ena_revoke_session(
  p_jti text,
  p_expires_at_seconds bigint
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_now timestamptz;
  v_expires_at timestamptz;
BEGIN
  IF p_jti IS NULL
     OR p_jti !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     OR p_expires_at_seconds IS NULL OR p_expires_at_seconds < 1 THEN
    RETURN false;
  END IF;

  v_now := clock_timestamp();
  v_expires_at := to_timestamp(p_expires_at_seconds::double precision);
  IF v_expires_at <= v_now THEN
    RETURN false;
  END IF;

  DELETE FROM open_ena_revoked_sessions WHERE expires_at <= v_now;
  INSERT INTO open_ena_revoked_sessions (jti, expires_at, revoked_at)
  VALUES (p_jti, v_expires_at, v_now)
  ON CONFLICT (jti) DO UPDATE
  SET expires_at = GREATEST(open_ena_revoked_sessions.expires_at, EXCLUDED.expires_at);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION open_ena_session_is_revoked(
  p_jti text
) RETURNS boolean
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_now timestamptz;
BEGIN
  IF p_jti IS NULL
     OR p_jti !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' THEN
    RETURN true;
  END IF;
  v_now := clock_timestamp();
  RETURN EXISTS (
    SELECT 1
    FROM open_ena_revoked_sessions
    WHERE jti = p_jti AND expires_at > v_now
  );
END;
$$;
