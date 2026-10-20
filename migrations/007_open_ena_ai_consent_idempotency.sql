-- Apply after migration 003 using the same schema/search_path as that migration.
-- Patch the known receipt body through its complete PostgreSQL definition, so
-- existing function identity, owner, ACL and operator-set attributes survive.
-- One DO statement makes validation and replacement atomic. Existing receipts,
-- table definitions and grants are not modified. Unknown function bodies reject.

DO $migration$
DECLARE
  v_function regprocedure;
  v_definition text;
  v_source text;
  v_fingerprint text;
  v_old_clause constant text := 'ON CONFLICT (principal_ref_hash, operation_id) DO NOTHING';
  v_new_clause constant text := 'ON CONFLICT DO NOTHING';
BEGIN
  v_function := pg_catalog.to_regprocedure('open_ena_record_ai_consent_receipt(text,text,text,text,text,text)');
  IF v_function IS NULL THEN
    RAISE EXCEPTION 'Migration 007 requires the existing migration 003 receipt function.' USING ERRCODE = '55000';
  END IF;

  SELECT p.prosrc INTO v_source
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid = p.prolang
  WHERE p.oid = v_function AND p.prokind = 'f' AND l.lanname = 'plpgsql'
    AND p.prorettype = 'pg_catalog.jsonb'::regtype
    AND p.proargnames = ARRAY['p_principal_ref_hash', 'p_operation_id', 'p_request_sha256', 'p_consent_policy_version', 'p_provider', 'p_model'];
  IF v_source IS NULL THEN
    RAISE EXCEPTION 'Migration 007 found an unsupported receipt function contract.' USING ERRCODE = '55000';
  END IF;

  -- Source fingerprints recognize the checked-in legacy 003 body, the
  -- corrected 003 body, and this migration's patched legacy body. These are
  -- compatibility checks, not authentication. Only transport-level CRLF is
  -- normalized for comparison; unreviewed body edits still fail closed. The
  -- definition used for replacement keeps its original formatting and settings.
  v_fingerprint := pg_catalog.md5(pg_catalog.replace(v_source, E'\r\n', E'\n'));
  IF v_fingerprint IN ('5b13791a1a94d8fe7cbb69297e32f1da', '3ae427d29c3b377049e225a7990ea2a0') THEN
    RETURN;
  END IF;
  IF v_fingerprint <> '65bb02309dc430f15badaf02dbaad73c'
    OR pg_catalog.array_length(pg_catalog.string_to_array(v_source, v_old_clause), 1) <> 2
    OR pg_catalog.strpos(v_source, v_new_clause) <> 0 THEN
    RAISE EXCEPTION 'Migration 007 found an unsupported receipt function body.' USING ERRCODE = '55000';
  END IF;

  v_definition := pg_catalog.pg_get_functiondef(v_function);
  IF pg_catalog.array_length(pg_catalog.string_to_array(v_definition, v_old_clause), 1) <> 2 THEN
    RAISE EXCEPTION 'Migration 007 could not identify one receipt conflict clause.' USING ERRCODE = '55000';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_old_clause, v_new_clause);
END;
$migration$;
