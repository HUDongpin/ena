-- Apply after 001_open_ena_billable.sql and before deploying the lease-aware
-- application. The application requires the v2 entry point and fails closed
-- until this migration is present. No provider requests are made here.
--
-- Five minutes exceeds the application's maximum 120-second provider request
-- deadline plus bounded consent/accounting queries. The application refuses
-- new dispatch more than two minutes after reservation I/O started, leaving
-- two minutes for the provider and one for cleanup. Existing rows receive a
-- fresh five-minute grace period when the column is added, so migration cannot
-- expire a request that was already live. Keep this duration in sync with
-- OPEN_ENA_BILLABLE_RESERVATION_LEASE_MS.
ALTER TABLE open_ena_billable_reservations
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz NOT NULL
    DEFAULT (clock_timestamp() + interval '5 minutes');

CREATE INDEX IF NOT EXISTS open_ena_billable_reservations_lease_idx
  ON open_ena_billable_reservations (principal_ref, lease_expires_at)
  WHERE status = 'reserved';

-- Recovery and admission share the same transaction and principal lock as
-- settlement/release. There is no separate cleanup call that could race a new
-- request. The original reservation and unique operation key remain forever.
CREATE OR REPLACE FUNCTION open_ena_reserve_billable_v2(
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
  v_expired record;
BEGIN
  IF p_principal IS NULL THEN
    allowed := false;
    reason := 'invalid-reservation';
    RETURN NEXT;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('open_ena:' || p_principal, 0));
  v_now := clock_timestamp();
  FOR v_expired IN
    UPDATE open_ena_billable_reservations
    SET status = 'settled',
        actual_micro_usd = reserved_micro_usd,
        dispatched = true
    WHERE principal_ref = p_principal
      AND status = 'reserved'
      AND lease_expires_at <= v_now
    RETURNING id, resource
  LOOP
    -- Unknown provider outcomes are charged at the reserved ceiling. Spend
    -- stays in its original day/month buckets; no refund or paid retry occurs.
    INSERT INTO open_ena_security_outbox (code, principal_ref, dedupe_key, metadata)
    VALUES (
      'reservation-lease-expired', p_principal,
      'reservation-lease-expired:' || v_expired.id::text,
      jsonb_build_object('resource', v_expired.resource, 'reason', 'unknown-usage-retained')
    ) ON CONFLICT (code, principal_ref, dedupe_key) DO NOTHING;
  END LOOP;

  -- Reentrant acquisition of the same transaction lock is safe. The existing
  -- primitive retains all budget, provider, concurrency, and replay checks.
  RETURN QUERY SELECT * FROM open_ena_reserve_billable(
    p_principal, p_resource, p_amount, p_key, p_limits
  );
END;
$$;
