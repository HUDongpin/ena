-- Minimal, hash-bound AI consent receipts.
-- Never add prompt, completion, raw-row, dataset-label, or account-identifier
-- columns to this table. The request hash is a binding, not a content store.

CREATE TABLE IF NOT EXISTS open_ena_ai_consent_receipts (
  id uuid PRIMARY KEY,
  principal_ref_hash text NOT NULL CHECK (principal_ref_hash ~ '^[0-9a-f]{64}$'),
  operation_id text NOT NULL CHECK (operation_id ~ '^aiop-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  consent_policy_version text NOT NULL CHECK (length(consent_policy_version) BETWEEN 1 AND 80),
  provider text NOT NULL CHECK (provider ~ '^[A-Za-z0-9._:/@-]{1,80}$'),
  model text NOT NULL CHECK (model ~ '^[A-Za-z0-9._:/@-]{1,160}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  status text NOT NULL CHECK (status IN ('authorized', 'completed', 'failed', 'released')),
  UNIQUE (principal_ref_hash, operation_id)
);

CREATE INDEX IF NOT EXISTS open_ena_ai_consent_receipts_recorded_idx
  ON open_ena_ai_consent_receipts (recorded_at);

CREATE OR REPLACE FUNCTION open_ena_record_ai_consent_receipt(
  p_principal_ref_hash text,
  p_operation_id text,
  p_request_sha256 text,
  p_consent_policy_version text,
  p_provider text,
  p_model text
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_receipt open_ena_ai_consent_receipts;
BEGIN
  IF p_principal_ref_hash IS NULL OR p_principal_ref_hash !~ '^[0-9a-f]{64}$'
     OR p_operation_id IS NULL OR p_operation_id !~ '^aiop-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_request_sha256 IS NULL OR p_request_sha256 !~ '^[0-9a-f]{64}$'
     OR p_consent_policy_version IS NULL OR length(p_consent_policy_version) NOT BETWEEN 1 AND 80
     OR p_provider IS NULL OR p_provider !~ '^[A-Za-z0-9._:/@-]{1,80}$'
     OR p_model IS NULL OR p_model !~ '^[A-Za-z0-9._:/@-]{1,160}$' THEN
    RETURN NULL;
  END IF;

  INSERT INTO open_ena_ai_consent_receipts (
    id, principal_ref_hash, operation_id, request_sha256,
    consent_policy_version, provider, model, status
  ) VALUES (
    md5(p_principal_ref_hash || ':' || p_operation_id)::uuid,
    p_principal_ref_hash, p_operation_id, p_request_sha256,
    p_consent_policy_version, p_provider, p_model, 'authorized'
  )
  ON CONFLICT (principal_ref_hash, operation_id) DO NOTHING
  RETURNING * INTO v_receipt;

  IF NOT FOUND THEN
    SELECT * INTO v_receipt
    FROM open_ena_ai_consent_receipts
    WHERE principal_ref_hash = p_principal_ref_hash AND operation_id = p_operation_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_receipt.id,
    'principal_ref_hash', v_receipt.principal_ref_hash,
    'operation_id', v_receipt.operation_id,
    'request_sha256', v_receipt.request_sha256,
    'consent_policy_version', v_receipt.consent_policy_version,
    'provider', v_receipt.provider,
    'model', v_receipt.model,
    'recorded_at', v_receipt.recorded_at,
    'status', v_receipt.status
  );
END;
$$;

CREATE OR REPLACE FUNCTION open_ena_update_ai_consent_receipt(
  p_id uuid,
  p_status text,
  p_provider text,
  p_model text
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_receipt open_ena_ai_consent_receipts;
BEGIN
  IF p_id IS NULL OR p_status IS NULL OR p_status NOT IN ('completed', 'failed', 'released')
     OR p_provider IS NULL OR p_provider !~ '^[A-Za-z0-9._:/@-]{1,80}$'
     OR p_model IS NULL OR p_model !~ '^[A-Za-z0-9._:/@-]{1,160}$' THEN
    RETURN NULL;
  END IF;
  UPDATE open_ena_ai_consent_receipts
  SET status = p_status, provider = p_provider, model = p_model
  WHERE id = p_id
    AND (status = 'authorized' OR status = p_status)
  RETURNING * INTO v_receipt;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'id', v_receipt.id,
    'principal_ref_hash', v_receipt.principal_ref_hash,
    'operation_id', v_receipt.operation_id,
    'request_sha256', v_receipt.request_sha256,
    'consent_policy_version', v_receipt.consent_policy_version,
    'provider', v_receipt.provider,
    'model', v_receipt.model,
    'recorded_at', v_receipt.recorded_at,
    'status', v_receipt.status
  );
END;
$$;
