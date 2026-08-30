-- Durable Open ENA billing primitives.
--
-- All mutations are performed by PostgreSQL functions. The application supplied
-- clock is never authoritative: quota and billing periods use the database
-- server clock in UTC. This migration does not require an extension.

CREATE TABLE IF NOT EXISTS open_ena_quota_windows (
  principal_ref text NOT NULL,
  resource text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (principal_ref, resource)
);

CREATE TABLE IF NOT EXISTS open_ena_spend (
  scope_kind text NOT NULL CHECK (scope_kind IN ('principal', 'global', 'provider')),
  scope_ref text NOT NULL,
  period text NOT NULL CHECK (period IN ('day', 'month')),
  period_start date NOT NULL,
  micro_usd bigint NOT NULL DEFAULT 0 CHECK (micro_usd >= 0),
  PRIMARY KEY (scope_kind, scope_ref, period, period_start)
);

CREATE TABLE IF NOT EXISTS open_ena_billable_reservations (
  id uuid PRIMARY KEY,
  principal_ref text NOT NULL,
  resource text NOT NULL,
  provider_ref text NOT NULL,
  idempotency_key text NOT NULL,
  reserved_micro_usd bigint NOT NULL CHECK (reserved_micro_usd >= 0),
  actual_micro_usd bigint CHECK (actual_micro_usd IS NULL OR actual_micro_usd >= 0),
  day_start date NOT NULL,
  month_start date NOT NULL,
  status text NOT NULL CHECK (status IN ('reserved', 'settled', 'released')),
  dispatched boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (principal_ref, resource, idempotency_key)
);

CREATE TABLE IF NOT EXISTS open_ena_security_outbox (
  id bigserial PRIMARY KEY,
  code text NOT NULL,
  principal_ref text NOT NULL,
  dedupe_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (code, principal_ref, dedupe_key)
);

CREATE INDEX IF NOT EXISTS open_ena_billable_reservations_active_idx
  ON open_ena_billable_reservations (principal_ref, status);

CREATE OR REPLACE FUNCTION open_ena_consume_quota(
  p_principal text,
  p_resource text,
  p_limit integer DEFAULT 6
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_now timestamptz;
  v_limit integer;
  v_count integer;
BEGIN
  v_now := clock_timestamp();
  v_limit := COALESCE(p_limit, 6);
  IF p_principal IS NULL OR p_resource IS NULL OR v_limit < 0 THEN
    RETURN false;
  END IF;

  INSERT INTO open_ena_quota_windows (principal_ref, resource, window_start, request_count)
  VALUES (p_principal, p_resource, v_now, 1)
  ON CONFLICT (principal_ref, resource) DO UPDATE
  SET window_start = CASE
        WHEN v_now >= open_ena_quota_windows.window_start + interval '1 minute' THEN v_now
        ELSE open_ena_quota_windows.window_start
      END,
      request_count = CASE
        WHEN v_now >= open_ena_quota_windows.window_start + interval '1 minute' THEN 1
        ELSE open_ena_quota_windows.request_count + 1
      END
  RETURNING request_count INTO v_count;

  RETURN v_count <= v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION open_ena_reserve_billable(
  p_principal text,
  p_resource text,
  p_amount bigint,
  p_key text,
  p_limits jsonb
) RETURNS TABLE(allowed boolean, reason text, reservation jsonb)
LANGUAGE plpgsql
AS $$
DECLARE
  v_now timestamptz;
  v_day date;
  v_month date;
  v_provider text;
  v_limit_daily bigint;
  v_limit_monthly bigint;
  v_limit_global_daily bigint;
  v_limit_global_monthly bigint;
  v_limit_provider_daily bigint;
  v_limit_provider_monthly bigint;
  v_limit_concurrency integer;
  v_principal_day bigint;
  v_principal_month bigint;
  v_global_day bigint;
  v_global_month bigint;
  v_provider_day bigint;
  v_provider_month bigint;
  v_active_count integer;
  v_threshold integer;
  v_reservation open_ena_billable_reservations;
BEGIN
  IF p_principal IS NULL OR p_resource IS NULL OR p_key IS NULL OR p_limits IS NULL THEN
    allowed := false;
    reason := 'invalid-reservation';
    RETURN NEXT;
    RETURN;
  END IF;

  v_limit_daily := (p_limits->>'dailyMicroUsd')::bigint;
  v_limit_monthly := (p_limits->>'monthlyMicroUsd')::bigint;
  v_limit_global_monthly := (p_limits->>'globalMonthlyMicroUsd')::bigint;
  v_limit_provider_monthly := (p_limits->>'providerMonthlyMicroUsd')::bigint;
  v_limit_global_daily := COALESCE((p_limits->>'globalDailyMicroUsd')::bigint, v_limit_global_monthly);
  v_limit_provider_daily := COALESCE((p_limits->>'providerDailyMicroUsd')::bigint, v_limit_provider_monthly);
  v_limit_concurrency := (p_limits->>'maxConcurrency')::integer;
  v_provider := COALESCE(NULLIF(p_limits->>'provider', ''), 'openrouter');

  IF p_amount IS NULL OR p_amount < 0
     OR v_limit_daily IS NULL OR v_limit_daily < 0
     OR v_limit_monthly IS NULL OR v_limit_monthly < 0
     OR v_limit_global_daily IS NULL OR v_limit_global_daily < 0
     OR v_limit_global_monthly IS NULL OR v_limit_global_monthly < 0
     OR v_limit_provider_daily IS NULL OR v_limit_provider_daily < 0
     OR v_limit_provider_monthly IS NULL OR v_limit_provider_monthly < 0
     OR v_limit_concurrency IS NULL OR v_limit_concurrency < 0 THEN
    allowed := false;
    reason := 'invalid-reservation';
    RETURN NEXT;
    RETURN;
  END IF;

  v_now := clock_timestamp();
  v_day := (v_now AT TIME ZONE 'UTC')::date;
  v_month := date_trunc('month', v_now AT TIME ZONE 'UTC')::date;

  -- A stable principal lock serializes reserve, settle, and release for the
  -- same account across every application instance.
  PERFORM pg_advisory_xact_lock(hashtextextended('open_ena:' || p_principal, 0));

  -- The unique idempotency key is checked while holding the same lock used by
  -- the insert, so retries cannot create a second reservation.
  SELECT * INTO v_reservation
  FROM open_ena_billable_reservations
  WHERE principal_ref = p_principal
    AND resource = p_resource
    AND idempotency_key = p_key
  FOR UPDATE;
  IF FOUND THEN
    allowed := false;
    reason := 'idempotency-replayed';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT count(*) INTO v_active_count
  FROM open_ena_billable_reservations
  WHERE principal_ref = p_principal AND status = 'reserved';
  IF v_active_count >= v_limit_concurrency THEN
    allowed := false;
    reason := 'concurrency';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Keep every concrete day/month bucket. A pending reservation can therefore
  -- be reconciled into its original period after midnight or month rollover.
  INSERT INTO open_ena_spend (scope_kind, scope_ref, period, period_start, micro_usd)
  VALUES
    ('principal', p_principal, 'day', v_day, 0),
    ('principal', p_principal, 'month', v_month, 0),
    ('global', 'global', 'day', v_day, 0),
    ('global', 'global', 'month', v_month, 0),
    ('provider', v_provider, 'day', v_day, 0),
    ('provider', v_provider, 'month', v_month, 0)
  ON CONFLICT (scope_kind, scope_ref, period, period_start) DO NOTHING;

  SELECT micro_usd INTO v_principal_day FROM open_ena_spend
  WHERE scope_kind = 'principal' AND scope_ref = p_principal AND period = 'day' AND period_start = v_day FOR UPDATE;
  SELECT micro_usd INTO v_principal_month FROM open_ena_spend
  WHERE scope_kind = 'principal' AND scope_ref = p_principal AND period = 'month' AND period_start = v_month FOR UPDATE;
  SELECT micro_usd INTO v_global_day FROM open_ena_spend
  WHERE scope_kind = 'global' AND scope_ref = 'global' AND period = 'day' AND period_start = v_day FOR UPDATE;
  SELECT micro_usd INTO v_global_month FROM open_ena_spend
  WHERE scope_kind = 'global' AND scope_ref = 'global' AND period = 'month' AND period_start = v_month FOR UPDATE;
  SELECT micro_usd INTO v_provider_day FROM open_ena_spend
  WHERE scope_kind = 'provider' AND scope_ref = v_provider AND period = 'day' AND period_start = v_day FOR UPDATE;
  SELECT micro_usd INTO v_provider_month FROM open_ena_spend
  WHERE scope_kind = 'provider' AND scope_ref = v_provider AND period = 'month' AND period_start = v_month FOR UPDATE;

  IF v_principal_day > v_limit_daily - p_amount THEN
    allowed := false;
    reason := 'daily-ceiling';
    RETURN NEXT;
    RETURN;
  END IF;
  IF v_principal_month > v_limit_monthly - p_amount THEN
    allowed := false;
    reason := 'monthly-ceiling';
    RETURN NEXT;
    RETURN;
  END IF;
  IF v_global_day > v_limit_global_daily - p_amount THEN
    allowed := false;
    reason := 'global-daily-ceiling';
    RETURN NEXT;
    RETURN;
  END IF;
  IF v_global_month > v_limit_global_monthly - p_amount THEN
    allowed := false;
    reason := 'global-monthly-ceiling';
    RETURN NEXT;
    RETURN;
  END IF;
  IF v_provider_day > v_limit_provider_daily - p_amount THEN
    allowed := false;
    reason := 'provider-daily-ceiling';
    RETURN NEXT;
    RETURN;
  END IF;
  IF v_provider_month > v_limit_provider_monthly - p_amount THEN
    allowed := false;
    reason := 'provider-monthly-ceiling';
    RETURN NEXT;
    RETURN;
  END IF;

  -- md5() is core PostgreSQL. Length-prefixed text avoids ambiguous concatenation
  -- without using NUL characters, which PostgreSQL text does not permit.
  INSERT INTO open_ena_billable_reservations (
    id, principal_ref, resource, provider_ref, idempotency_key,
    reserved_micro_usd, actual_micro_usd, day_start,
    month_start, status, dispatched
  ) VALUES (
    md5(
      length(p_principal)::text || ':' || p_principal
      || length(p_resource)::text || ':' || p_resource
      || length(p_key)::text || ':' || p_key
      || ':' || v_now::text
    )::uuid,
    p_principal, p_resource, v_provider, p_key, p_amount, NULL,
    v_day, v_month, 'reserved', false
  ) RETURNING * INTO v_reservation;

  UPDATE open_ena_spend SET micro_usd = micro_usd + p_amount
  WHERE scope_kind = 'principal' AND scope_ref = p_principal AND period = 'day' AND period_start = v_day;
  UPDATE open_ena_spend SET micro_usd = micro_usd + p_amount
  WHERE scope_kind = 'principal' AND scope_ref = p_principal AND period = 'month' AND period_start = v_month;
  UPDATE open_ena_spend SET micro_usd = micro_usd + p_amount
  WHERE scope_kind = 'global' AND scope_ref = 'global' AND period = 'day' AND period_start = v_day;
  UPDATE open_ena_spend SET micro_usd = micro_usd + p_amount
  WHERE scope_kind = 'global' AND scope_ref = 'global' AND period = 'month' AND period_start = v_month;
  UPDATE open_ena_spend SET micro_usd = micro_usd + p_amount
  WHERE scope_kind = 'provider' AND scope_ref = v_provider AND period = 'day' AND period_start = v_day;
  UPDATE open_ena_spend SET micro_usd = micro_usd + p_amount
  WHERE scope_kind = 'provider' AND scope_ref = v_provider AND period = 'month' AND period_start = v_month;

  -- Emit one durable warning per threshold/scope/UTC period. The outbox unique
  -- key makes retries and concurrent application instances idempotent.
  FOR v_threshold IN
    SELECT value::integer
    FROM jsonb_array_elements_text(COALESCE(p_limits->'alertThresholds', '[]'::jsonb))
  LOOP
    IF v_limit_daily > 0
       AND (v_principal_day + p_amount)::numeric / v_limit_daily::numeric * 100 >= v_threshold THEN
      INSERT INTO open_ena_security_outbox (code, principal_ref, dedupe_key, metadata)
      VALUES (
        'budget-threshold', p_principal,
        'principal-day:' || v_threshold::text || ':' || v_day::text,
        jsonb_build_object('resource', p_resource, 'scope', 'principal-day', 'threshold', v_threshold::text)
      ) ON CONFLICT (code, principal_ref, dedupe_key) DO NOTHING;
    END IF;
    IF v_limit_monthly > 0
       AND (v_principal_month + p_amount)::numeric / v_limit_monthly::numeric * 100 >= v_threshold THEN
      INSERT INTO open_ena_security_outbox (code, principal_ref, dedupe_key, metadata)
      VALUES (
        'budget-threshold', p_principal,
        'principal-month:' || v_threshold::text || ':' || v_month::text,
        jsonb_build_object('resource', p_resource, 'scope', 'principal-month', 'threshold', v_threshold::text)
      ) ON CONFLICT (code, principal_ref, dedupe_key) DO NOTHING;
    END IF;
    IF v_limit_global_monthly > 0
       AND (v_global_month + p_amount)::numeric / v_limit_global_monthly::numeric * 100 >= v_threshold THEN
      INSERT INTO open_ena_security_outbox (code, principal_ref, dedupe_key, metadata)
      VALUES (
        'budget-threshold', 'global',
        'global-month:' || v_threshold::text || ':' || v_month::text,
        jsonb_build_object('resource', p_resource, 'scope', 'global-month', 'threshold', v_threshold::text)
      ) ON CONFLICT (code, principal_ref, dedupe_key) DO NOTHING;
    END IF;
    IF v_limit_provider_monthly > 0
       AND (v_provider_month + p_amount)::numeric / v_limit_provider_monthly::numeric * 100 >= v_threshold THEN
      INSERT INTO open_ena_security_outbox (code, principal_ref, dedupe_key, metadata)
      VALUES (
        'budget-threshold', 'provider:' || v_provider,
        'provider-month:' || v_threshold::text || ':' || v_month::text,
        jsonb_build_object('resource', p_resource, 'scope', 'provider-month', 'threshold', v_threshold::text)
      ) ON CONFLICT (code, principal_ref, dedupe_key) DO NOTHING;
    END IF;
  END LOOP;

  allowed := true;
  reservation := to_jsonb(v_reservation);
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION open_ena_settle_billable(
  p_id uuid,
  p_actual bigint,
  p_dispatched boolean
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_principal text;
  v_actual bigint;
  v_delta bigint;
  v_reservation open_ena_billable_reservations;
BEGIN
  IF p_actual IS NOT NULL AND p_actual < 0 THEN
    RAISE EXCEPTION 'actual micro-USD must be non-negative' USING ERRCODE = '22023';
  END IF;
  SELECT principal_ref INTO v_principal
  FROM open_ena_billable_reservations WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('open_ena:' || v_principal, 0));

  -- The status predicate makes settlement exactly once. A retry after release
  -- or settlement does not touch spend or concurrency again.
  UPDATE open_ena_billable_reservations
  SET status = 'settled',
      actual_micro_usd = COALESCE(p_actual, reserved_micro_usd),
      dispatched = COALESCE(p_dispatched, false)
  WHERE id = p_id AND status = 'reserved'
  RETURNING * INTO v_reservation;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_actual := v_reservation.actual_micro_usd;
  v_delta := v_actual - v_reservation.reserved_micro_usd;

  UPDATE open_ena_spend SET micro_usd = micro_usd + v_delta
  WHERE scope_kind = 'principal' AND scope_ref = v_reservation.principal_ref AND period = 'day' AND period_start = v_reservation.day_start;
  UPDATE open_ena_spend SET micro_usd = micro_usd + v_delta
  WHERE scope_kind = 'principal' AND scope_ref = v_reservation.principal_ref AND period = 'month' AND period_start = v_reservation.month_start;
  UPDATE open_ena_spend SET micro_usd = micro_usd + v_delta
  WHERE scope_kind = 'global' AND scope_ref = 'global' AND period = 'day' AND period_start = v_reservation.day_start;
  UPDATE open_ena_spend SET micro_usd = micro_usd + v_delta
  WHERE scope_kind = 'global' AND scope_ref = 'global' AND period = 'month' AND period_start = v_reservation.month_start;
  UPDATE open_ena_spend SET micro_usd = micro_usd + v_delta
  WHERE scope_kind = 'provider' AND scope_ref = v_reservation.provider_ref AND period = 'day' AND period_start = v_reservation.day_start;
  UPDATE open_ena_spend SET micro_usd = micro_usd + v_delta
  WHERE scope_kind = 'provider' AND scope_ref = v_reservation.provider_ref AND period = 'month' AND period_start = v_reservation.month_start;
  IF v_delta > 0 THEN
    INSERT INTO open_ena_security_outbox (code, principal_ref, dedupe_key, metadata)
    VALUES (
      'reservation-overrun',
      v_reservation.principal_ref,
      'reservation-overrun:' || v_reservation.id::text,
      jsonb_build_object(
        'reason', 'actual-exceeded-reservation',
        'resource', v_reservation.resource
      )
    ) ON CONFLICT (code, principal_ref, dedupe_key) DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION open_ena_release_billable(p_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_principal text;
  v_reservation open_ena_billable_reservations;
BEGIN
  SELECT principal_ref INTO v_principal
  FROM open_ena_billable_reservations WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('open_ena:' || v_principal, 0));

  -- Releasing is exactly once. Only an active reservation is removed from
  -- spend; settled rows cannot be released a second time.
  UPDATE open_ena_billable_reservations
  SET status = 'released'
  WHERE id = p_id AND status = 'reserved'
  RETURNING * INTO v_reservation;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE open_ena_spend SET micro_usd = micro_usd - v_reservation.reserved_micro_usd
  WHERE scope_kind = 'principal' AND scope_ref = v_reservation.principal_ref AND period = 'day' AND period_start = v_reservation.day_start;
  UPDATE open_ena_spend SET micro_usd = micro_usd - v_reservation.reserved_micro_usd
  WHERE scope_kind = 'principal' AND scope_ref = v_reservation.principal_ref AND period = 'month' AND period_start = v_reservation.month_start;
  UPDATE open_ena_spend SET micro_usd = micro_usd - v_reservation.reserved_micro_usd
  WHERE scope_kind = 'global' AND scope_ref = 'global' AND period = 'day' AND period_start = v_reservation.day_start;
  UPDATE open_ena_spend SET micro_usd = micro_usd - v_reservation.reserved_micro_usd
  WHERE scope_kind = 'global' AND scope_ref = 'global' AND period = 'month' AND period_start = v_reservation.month_start;
  UPDATE open_ena_spend SET micro_usd = micro_usd - v_reservation.reserved_micro_usd
  WHERE scope_kind = 'provider' AND scope_ref = v_reservation.provider_ref AND period = 'day' AND period_start = v_reservation.day_start;
  UPDATE open_ena_spend SET micro_usd = micro_usd - v_reservation.reserved_micro_usd
  WHERE scope_kind = 'provider' AND scope_ref = v_reservation.provider_ref AND period = 'month' AND period_start = v_reservation.month_start;
END;
$$;

CREATE OR REPLACE FUNCTION open_ena_emit_security_alert(
  p_code text,
  p_principal text,
  p_metadata jsonb
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_input jsonb := COALESCE(p_metadata, '{}'::jsonb);
  v_metadata jsonb;
  v_dedupe_key text;
BEGIN
  -- Closed metadata schema: upstream text, credentials, prompts, payloads, and
  -- arbitrary nested JSON are never persisted in the durable outbox.
  v_metadata := jsonb_strip_nulls(jsonb_build_object(
    'reason', NULLIF(v_input->>'reason', ''),
    'resource', NULLIF(v_input->>'resource', ''),
    'scope', NULLIF(v_input->>'scope', ''),
    'threshold', NULLIF(v_input->>'threshold', '')
  ));
  v_dedupe_key := concat_ws(
    ':',
    p_code,
    COALESCE(v_metadata->>'resource', '-'),
    COALESCE(v_metadata->>'reason', '-'),
    COALESCE(v_metadata->>'scope', '-'),
    COALESCE(v_metadata->>'threshold', '-'),
    to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYYMMDDHH24')
  );
  INSERT INTO open_ena_security_outbox (code, principal_ref, dedupe_key, metadata)
  VALUES (p_code, p_principal, v_dedupe_key, v_metadata)
  ON CONFLICT (code, principal_ref, dedupe_key) DO NOTHING;
END;
$$;
