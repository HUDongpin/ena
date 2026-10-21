-- Login admission is scoped to the operator-attributed source, never to the
-- deployment's shared account. Keep migration 002's function for old releases.
-- A successful login refunds only its own admitted slot in the exact window.
-- Refunds are internal, once-only operations: do not automatically retry them.

CREATE OR REPLACE FUNCTION public.open_ena_reserve_login_attempt_v2(
  p_source_ref text,
  p_limit integer,
  p_window_seconds integer
) RETURNS TABLE (
  allowed boolean,
  window_started_at text,
  retry_after_seconds integer
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_now timestamptz;
  v_window interval;
  v_window_start timestamptz;
  v_count integer;
BEGIN
  IF p_source_ref IS NULL OR p_source_ref !~ '^[A-Za-z0-9_-]{1,128}$'
     OR p_limit IS NULL OR p_limit < 1
     OR p_window_seconds IS NULL OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'Invalid login reservation arguments' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('open_ena_login_source_v2:' || p_source_ref, 0));
  v_window := make_interval(secs => p_window_seconds);

  LOOP
    -- Older releases use a different advisory lock and may be inserting the
    -- first row concurrently. Wait for that insert without overwriting it.
    INSERT INTO public.open_ena_auth_attempt_windows (scope_kind, scope_ref, window_start, attempt_count)
    VALUES ('source', p_source_ref, clock_timestamp(), 0)
    ON CONFLICT (scope_kind, scope_ref) DO NOTHING;

    SELECT attempts.window_start, attempts.attempt_count
    INTO v_window_start, v_count
    FROM public.open_ena_auth_attempt_windows AS attempts
    WHERE attempts.scope_kind = 'source' AND attempts.scope_ref = p_source_ref
    FOR UPDATE;
    EXIT WHEN FOUND;
    -- An expired-row cleanup may have removed the conflict row between these
    -- statements. Re-create it before taking the admission timestamp.
  END LOOP;

  -- Include row-lock waits, including callers from older releases that use a
  -- different advisory lock. Admission must use the clock after both locks.
  v_now := clock_timestamp();

  IF v_now >= v_window_start + v_window THEN
    v_window_start := v_now;
    UPDATE public.open_ena_auth_attempt_windows AS attempts
    SET window_start = v_window_start, attempt_count = 1
    WHERE attempts.scope_kind = 'source' AND attempts.scope_ref = p_source_ref;
  ELSIF v_count >= p_limit THEN
    -- Denied traffic neither consumes slots nor extends the fixed window.
    RETURN QUERY SELECT false, NULL::text,
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM v_window_start + v_window - v_now)))::integer;
    RETURN;
  ELSE
    UPDATE public.open_ena_auth_attempt_windows AS attempts
    SET attempt_count = attempts.attempt_count + 1
    WHERE attempts.scope_kind = 'source' AND attempts.scope_ref = p_source_ref;
  END IF;

  -- Bound opportunistic retention work and never wait on another active source.
  WITH expired AS (
    SELECT attempts.scope_kind, attempts.scope_ref
    FROM public.open_ena_auth_attempt_windows AS attempts
    WHERE attempts.scope_kind = 'source' AND attempts.window_start < v_now - interval '7 days'
    ORDER BY attempts.window_start
    LIMIT 100
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.open_ena_auth_attempt_windows AS attempts
  USING expired
  WHERE attempts.scope_kind = expired.scope_kind AND attempts.scope_ref = expired.scope_ref;

  -- Return text to retain PostgreSQL microseconds across the JavaScript boundary.
  RETURN QUERY SELECT true,
    to_char(v_window_start AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_ena_refund_login_attempt_v2(
  p_source_ref text,
  p_window_start timestamptz
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_source_ref IS NULL OR p_source_ref !~ '^[A-Za-z0-9_-]{1,128}$' OR p_window_start IS NULL THEN
    RAISE EXCEPTION 'Invalid login refund arguments' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('open_ena_login_source_v2:' || p_source_ref, 0));
  UPDATE public.open_ena_auth_attempt_windows AS attempts
  SET attempt_count = attempts.attempt_count - 1
  WHERE attempts.scope_kind = 'source'
    AND attempts.scope_ref = p_source_ref
    AND attempts.window_start = p_window_start
    AND attempts.attempt_count > 0;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  -- A completed request must never refund a replacement window.
  RETURN v_updated = 1;
END;
$$;
