-- Additive failed-login windows. Migration 002's open_ena_consume_login_attempt,
-- open_ena_auth_attempt_windows, and open_ena_revoked_sessions stay in place so
-- the previous runtime can roll back without this table. This file does not
-- delete or rewrite sessions, disposable accounts, or the legacy attempt rows.
--
-- The application role is not a superuser and does not own these objects.
-- After applying this migration, grant only:
--   GRANT SELECT, INSERT, UPDATE, DELETE
--     ON TABLE open_ena_login_failure_windows TO <app-role>;
--   GRANT EXECUTE ON FUNCTION
--     open_ena_login_failure_guard(text, text, integer, integer, integer)
--     TO <app-role>;
--   GRANT EXECUTE ON FUNCTION
--     open_ena_record_login_failure(text, text, integer, integer, integer)
--     TO <app-role>;
--   GRANT EXECUTE ON FUNCTION
--     open_ena_clear_login_pair(text, text) TO <app-role>;
--   GRANT EXECUTE ON FUNCTION
--     open_ena_prune_login_failure_windows(integer) TO <app-role>;
-- Disposable sign-in on the same connection also needs SELECT and UPDATE on
-- open_ena_disposable_accounts and EXECUTE on
-- open_ena_consume_disposable_account(text, bytea). Do not grant superuser,
-- ownership, or broad DELETE on the legacy session or attempt tables.
--
-- Callers must hold one transaction: the guard takes a source advisory lock
-- before reading clock_timestamp(), credential work uses that same connection,
-- then record or clear runs before commit. A blocked bucket is not rewritten.

CREATE TABLE IF NOT EXISTS open_ena_login_failure_windows (
  scope_kind text NOT NULL CHECK (scope_kind IN ('source', 'pair')),
  scope_ref text NOT NULL CHECK (scope_ref ~ '^[A-Za-z0-9_-]{1,128}$'),
  window_start timestamptz NOT NULL,
  failure_count integer NOT NULL CHECK (failure_count >= 0),
  PRIMARY KEY (scope_kind, scope_ref)
);

CREATE OR REPLACE FUNCTION open_ena_login_failure_guard(
  p_source_ref text,
  p_pair_ref text,
  p_source_limit integer,
  p_pair_limit integer,
  p_window_seconds integer
) RETURNS TABLE (
  blocked boolean,
  retry_after_seconds integer,
  blocking_scope text
)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz;
  v_window interval;
  v_source_start timestamptz;
  v_source_count integer;
  v_pair_start timestamptz;
  v_pair_count integer;
  v_source_blocked boolean := false;
  v_pair_blocked boolean := false;
  v_source_retry integer := 0;
  v_pair_retry integer := 0;
  v_blocked boolean;
  v_retry integer;
  v_scope text;
BEGIN
  IF p_source_ref IS NULL OR p_source_ref !~ '^[A-Za-z0-9_-]{1,128}$'
     OR p_pair_ref IS NULL OR p_pair_ref !~ '^[A-Za-z0-9_-]{1,128}$'
     OR p_source_limit IS NULL OR p_source_limit < 1
     OR p_pair_limit IS NULL OR p_pair_limit < 1
     OR p_window_seconds IS NULL OR p_window_seconds < 1
     OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'invalid login failure guard' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('open_ena_login_source:' || p_source_ref, 0)
  );
  v_now := pg_catalog.clock_timestamp();
  v_window := pg_catalog.make_interval(secs => p_window_seconds);

  SELECT window_start, failure_count
    INTO v_source_start, v_source_count
  FROM public.open_ena_login_failure_windows
  WHERE scope_kind = 'source' AND scope_ref = p_source_ref;

  SELECT window_start, failure_count
    INTO v_pair_start, v_pair_count
  FROM public.open_ena_login_failure_windows
  WHERE scope_kind = 'pair' AND scope_ref = p_pair_ref;

  IF v_source_start IS NOT NULL
     AND v_now < v_source_start + v_window
     AND v_source_count >= p_source_limit THEN
    v_source_blocked := true;
    v_source_retry := GREATEST(
      1,
      pg_catalog.ceil(
        EXTRACT(epoch FROM (v_source_start + v_window - v_now))
      )::integer
    );
  END IF;

  IF v_pair_start IS NOT NULL
     AND v_now < v_pair_start + v_window
     AND v_pair_count >= p_pair_limit THEN
    v_pair_blocked := true;
    v_pair_retry := GREATEST(
      1,
      pg_catalog.ceil(
        EXTRACT(epoch FROM (v_pair_start + v_window - v_now))
      )::integer
    );
  END IF;

  v_blocked := v_source_blocked OR v_pair_blocked;
  IF NOT v_blocked THEN
    v_retry := 0;
    v_scope := 'none';
  ELSIF v_source_blocked AND v_pair_blocked THEN
    v_retry := GREATEST(v_source_retry, v_pair_retry);
    v_scope := 'both';
  ELSIF v_pair_blocked THEN
    v_retry := v_pair_retry;
    v_scope := 'pair';
  ELSE
    v_retry := v_source_retry;
    v_scope := 'source';
  END IF;

  RETURN QUERY SELECT v_blocked, v_retry, v_scope;
END;
$$;

CREATE OR REPLACE FUNCTION open_ena_record_login_failure(
  p_source_ref text,
  p_pair_ref text,
  p_source_limit integer,
  p_pair_limit integer,
  p_window_seconds integer
) RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz;
  v_window interval;
BEGIN
  IF p_source_ref IS NULL OR p_source_ref !~ '^[A-Za-z0-9_-]{1,128}$'
     OR p_pair_ref IS NULL OR p_pair_ref !~ '^[A-Za-z0-9_-]{1,128}$'
     OR p_source_limit IS NULL OR p_source_limit < 1
     OR p_pair_limit IS NULL OR p_pair_limit < 1
     OR p_window_seconds IS NULL OR p_window_seconds < 1
     OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'invalid login failure record' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('open_ena_login_source:' || p_source_ref, 0)
  );
  v_now := pg_catalog.clock_timestamp();
  v_window := pg_catalog.make_interval(secs => p_window_seconds);

  -- A request that is already blocked must not move either window.
  IF EXISTS (
    SELECT 1
    FROM public.open_ena_login_failure_windows
    WHERE scope_kind = 'source'
      AND scope_ref = p_source_ref
      AND v_now < window_start + v_window
      AND failure_count >= p_source_limit
  ) OR EXISTS (
    SELECT 1
    FROM public.open_ena_login_failure_windows
    WHERE scope_kind = 'pair'
      AND scope_ref = p_pair_ref
      AND v_now < window_start + v_window
      AND failure_count >= p_pair_limit
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.open_ena_login_failure_windows (
    scope_kind, scope_ref, window_start, failure_count
  ) VALUES ('source', p_source_ref, v_now, 1)
  ON CONFLICT (scope_kind, scope_ref) DO UPDATE
  SET window_start = CASE
        WHEN v_now >= public.open_ena_login_failure_windows.window_start + v_window THEN v_now
        ELSE public.open_ena_login_failure_windows.window_start
      END,
      failure_count = CASE
        WHEN v_now >= public.open_ena_login_failure_windows.window_start + v_window THEN 1
        WHEN public.open_ena_login_failure_windows.failure_count >= p_source_limit
          THEN public.open_ena_login_failure_windows.failure_count
        ELSE public.open_ena_login_failure_windows.failure_count + 1
      END;

  INSERT INTO public.open_ena_login_failure_windows (
    scope_kind, scope_ref, window_start, failure_count
  ) VALUES ('pair', p_pair_ref, v_now, 1)
  ON CONFLICT (scope_kind, scope_ref) DO UPDATE
  SET window_start = CASE
        WHEN v_now >= public.open_ena_login_failure_windows.window_start + v_window THEN v_now
        ELSE public.open_ena_login_failure_windows.window_start
      END,
      failure_count = CASE
        WHEN v_now >= public.open_ena_login_failure_windows.window_start + v_window THEN 1
        WHEN public.open_ena_login_failure_windows.failure_count >= p_pair_limit
          THEN public.open_ena_login_failure_windows.failure_count
        ELSE public.open_ena_login_failure_windows.failure_count + 1
      END;
END;
$$;

CREATE OR REPLACE FUNCTION open_ena_clear_login_pair(
  p_source_ref text,
  p_pair_ref text
) RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_source_ref IS NULL OR p_source_ref !~ '^[A-Za-z0-9_-]{1,128}$'
     OR p_pair_ref IS NULL OR p_pair_ref !~ '^[A-Za-z0-9_-]{1,128}$' THEN
    RAISE EXCEPTION 'invalid login pair clear' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('open_ena_login_source:' || p_source_ref, 0)
  );
  DELETE FROM public.open_ena_login_failure_windows
  WHERE scope_kind = 'pair' AND scope_ref = p_pair_ref;
END;
$$;

CREATE INDEX IF NOT EXISTS open_ena_login_failure_windows_expiry_idx
  ON public.open_ena_login_failure_windows (window_start);

-- Bounded retention for windows that nobody has touched for 7 days.
-- Call it only after the login transaction commits, so it does not run while
-- that transaction still holds its source advisory lock. SKIP LOCKED keeps it
-- from waiting on a row another source lock already updated.
CREATE OR REPLACE FUNCTION open_ena_prune_login_failure_windows(
  p_limit integer
) RETURNS integer
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 32), 1), 100);
  v_deleted integer := 0;
  v_cutoff timestamptz;
BEGIN
  -- One stable cutoff lets the expiry index serve the range. clock_timestamp()
  -- inside the scan is volatile and cannot be an index condition.
  v_cutoff := pg_catalog.clock_timestamp() - interval '7 days';
  DELETE FROM public.open_ena_login_failure_windows AS target
  USING (
    SELECT ctid
    FROM public.open_ena_login_failure_windows
    WHERE window_start < v_cutoff
    ORDER BY window_start
    FOR UPDATE SKIP LOCKED
    LIMIT v_limit
  ) AS stale
  WHERE target.ctid = stale.ctid;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.open_ena_login_failure_guard(text, text, integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_ena_record_login_failure(text, text, integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_ena_clear_login_pair(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_ena_prune_login_failure_windows(integer) FROM PUBLIC;
REVOKE ALL ON TABLE public.open_ena_login_failure_windows FROM PUBLIC;
