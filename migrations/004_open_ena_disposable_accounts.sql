-- One-time Open ENA test accounts for release authentication evidence.
--
-- Raw usernames and passwords are never stored. The application derives a
-- domain-separated HMAC username reference, performs fixed-parameter scrypt,
-- and submits only the derived hash to the atomic consume function.

CREATE TABLE IF NOT EXISTS open_ena_disposable_accounts (
  username_ref text NOT NULL PRIMARY KEY CHECK (username_ref ~ '^[A-Za-z0-9_-]{43}$'),
  password_salt bytea NOT NULL CHECK (octet_length(password_salt) = 16),
  password_hash bytea NOT NULL CHECK (octet_length(password_hash) = 32),
  principal_ref text NOT NULL UNIQUE CHECK (principal_ref ~ '^d_[A-Za-z0-9_-]{43}$'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (expires_at > created_at),
  CHECK (consumed_at IS NULL OR consumed_at >= created_at),
  CHECK (disabled_at IS NULL OR disabled_at >= created_at)
);

CREATE INDEX IF NOT EXISTS open_ena_disposable_accounts_expiry_idx
  ON open_ena_disposable_accounts (expires_at);

CREATE OR REPLACE FUNCTION open_ena_consume_disposable_account(
  p_username_ref text,
  p_password_hash bytea
) RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_now timestamptz;
  v_principal_ref text;
BEGIN
  IF p_username_ref IS NULL
     OR p_username_ref !~ '^[A-Za-z0-9_-]{43}$'
     OR p_password_hash IS NULL
     OR octet_length(p_password_hash) <> 32 THEN
    RETURN NULL;
  END IF;

  v_now := clock_timestamp();
  UPDATE open_ena_disposable_accounts
  SET consumed_at = v_now
  WHERE username_ref = p_username_ref
    AND password_hash = p_password_hash
    AND consumed_at IS NULL
    AND disabled_at IS NULL
    AND expires_at > v_now
  RETURNING principal_ref INTO v_principal_ref;

  RETURN v_principal_ref;
END;
$$;
