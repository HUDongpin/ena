-- Apply after migration 004 using its schema/search_path. Lock the credential
-- row before reading server time so a lock wait cannot extend its validity.
-- Patch only the known body through PostgreSQL's full function definition:
-- existing OID, owner, ACL, security attributes and local settings survive.
-- One atomic DO statement changes no account rows, table definitions or grants.

DO $migration$
DECLARE
  v_function regprocedure;
  v_definition text;
  v_source text;
  v_fingerprint text;
  v_old_clause constant text := '  v_now := clock_timestamp();';
  v_new_clause text := '  -- Waiting for an earlier transaction must not extend credential validity.
  PERFORM 1 FROM open_ena_disposable_accounts
  WHERE username_ref = p_username_ref FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_now := clock_timestamp();';
BEGIN
  v_function := pg_catalog.to_regprocedure('open_ena_consume_disposable_account(text,bytea)');
  IF v_function IS NULL THEN
    RAISE EXCEPTION 'Migration 008 requires the existing migration 004 consume function.' USING ERRCODE = '55000';
  END IF;

  SELECT p.prosrc INTO v_source
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid = p.prolang
  WHERE p.oid = v_function AND p.prokind = 'f' AND l.lanname = 'plpgsql'
    AND p.prorettype = 'pg_catalog.text'::regtype
    AND p.proargnames = ARRAY['p_username_ref', 'p_password_hash'];
  IF v_source IS NULL THEN
    RAISE EXCEPTION 'Migration 008 found an unsupported consume function contract.' USING ERRCODE = '55000';
  END IF;

  -- These body fingerprints recognize checked-in 004 and this exact patch.
  -- Normalize transport CRLF only; unreviewed edits still fail closed.
  v_fingerprint := pg_catalog.md5(pg_catalog.replace(v_source, E'\r\n', E'\n'));
  IF v_fingerprint = '97c3f483614a4649fcdfd099ad3d7176' THEN
    RETURN;
  END IF;
  IF v_fingerprint <> 'f0dd0e856abd9210671ee99e4a8860f0'
    OR pg_catalog.array_length(pg_catalog.string_to_array(v_source, v_old_clause), 1) <> 2 THEN
    RAISE EXCEPTION 'Migration 008 found an unsupported consume function body.' USING ERRCODE = '55000';
  END IF;

  v_definition := pg_catalog.pg_get_functiondef(v_function);
  IF pg_catalog.array_length(pg_catalog.string_to_array(v_definition, v_old_clause), 1) <> 2 THEN
    RAISE EXCEPTION 'Migration 008 could not identify one consume timestamp.' USING ERRCODE = '55000';
  END IF;
  -- Keep the original line ending for a stable repeat-application fingerprint.
  IF pg_catalog.strpos(v_source, E'\r\n') > 0 THEN
    v_new_clause := pg_catalog.replace(v_new_clause, E'\n', E'\r\n');
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old_clause, v_new_clause);
END;
$migration$;
