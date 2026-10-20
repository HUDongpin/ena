import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanupOwnedEphemeralPostgres } from "./support/owned-ephemeral-postgres.mjs";

const project = fileURLToPath(new URL("../", import.meta.url));
const argument = process.argv.indexOf("--evidence-dir");
const evidenceDirectory = resolve(argument >= 0 ? process.argv[argument + 1] : join(project, "output/postgres/migration-007-evidence"));
mkdirSync(evidenceDirectory, { recursive: true });
const require = createRequire(join(project, "package.json"));
const { Pool } = require("pg");
const baselineFile = new URL("./fixtures/server/003_open_ena_ai_consent_legacy.sql", import.meta.url);
const migrationFile = join(project, "migrations/007_open_ena_ai_consent_idempotency.sql");
const legacy = readFileSync(baselineFile, "utf8");
const upgrade = readFileSync(migrationFile, "utf8");
const oldFunction = legacy.slice(legacy.indexOf("CREATE OR REPLACE FUNCTION open_ena_record_ai_consent_receipt("), legacy.indexOf("CREATE OR REPLACE FUNCTION open_ena_update_ai_consent_receipt("));
assert.match(oldFunction, /ON CONFLICT \(principal_ref_hash, operation_id\) DO NOTHING/);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const evidence = {
  command: "node tests/review-server-migration-007-upgrade.mjs --evidence-dir <output-directory>",
  startedAt: new Date().toISOString(),
  inputs: { legacy003: { path: baselineFile.pathname, sha256: digest(legacy) }, upgrade007: { path: migrationFile, sha256: digest(upgrade) } },
  checks: [],
};
const prefix = "ena-r2-upgrade-";
const rootDirectory = mkdtempSync(join(tmpdir(), prefix));
const dataDirectory = join(rootDirectory, "data");
let startAttempted = false;
let pool;
const signature = "public.open_ena_record_ai_consent_receipt(text,text,text,text,text,text)";
const sql = "SELECT public.open_ena_record_ai_consent_receipt($1,$2,$3,$4,$5,$6) AS receipt";
const principal = "a".repeat(64);
const originalHash = "b".repeat(64);
const operation = (number) => `aiop-01234567-89ab-4cde-8f01-${String(number).padStart(12, "0")}`;
const params = (number, hash = originalHash) => [principal, operation(number), hash, "review-synthetic-v2", "deepseek", "deepseek-flash"];
async function check(name, action) {
  try {
    const detail = await action();
    evidence.checks.push({ name, status: "PASS", ...(detail ? { detail } : {}) });
    console.log(`PASS: ${name}`);
  } catch (error) {
    evidence.checks.push({ name, status: "FAIL", error: error.message, actual: error.actual, expected: error.expected });
    console.log(`FAIL: ${name}: ${error.message}`);
  }
}
async function metadata() {
  const result = await pool.query(`SELECT p.oid, p.proowner::regrole::text AS owner, p.proacl::text AS acl,
    pg_get_function_identity_arguments(p.oid) AS arguments, pg_get_function_result(p.oid) AS result,
    p.prokind, p.prosecdef, p.proleakproof, p.proisstrict, p.provolatile, p.proparallel, p.procost, p.prorows, p.proconfig,
    l.lanname, has_function_privilege('receipt_app', p.oid, 'EXECUTE') AS app_execute,
    has_function_privilege('receipt_outsider', p.oid, 'EXECUTE') AS outsider_execute
    FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=$1::regprocedure`, [signature]);
  return result.rows[0];
}
async function schema() {
  return (await pool.query(`SELECT jsonb_build_object(
    'columns', (SELECT jsonb_agg(jsonb_build_object('name',attname,'type',format_type(atttypid,atttypmod),'notnull',attnotnull) ORDER BY attnum) FROM pg_attribute WHERE attrelid='public.open_ena_ai_consent_receipts'::regclass AND attnum>0 AND NOT attisdropped),
    'constraints', (SELECT jsonb_agg(pg_get_constraintdef(oid) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.open_ena_ai_consent_receipts'::regclass),
    'indexes', (SELECT jsonb_agg(indexdef ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='open_ena_ai_consent_receipts'),
    'owner', relowner::regrole::text, 'acl', relacl::text
  ) AS schema FROM pg_class WHERE oid='public.open_ena_ai_consent_receipts'::regclass`)).rows[0].schema;
}
async function rows() {
  return (await pool.query("SELECT to_jsonb(r) AS row FROM public.open_ena_ai_consent_receipts r ORDER BY operation_id")).rows.map(({ row }) => row);
}
async function definition() {
  return (await pool.query("SELECT pg_get_functiondef($1::regprocedure) AS definition", [signature])).rows[0].definition;
}
async function appCall(values) {
  const client = await pool.connect();
  try {
    await client.query("SET ROLE receipt_app");
    return (await client.query(sql, values)).rows[0].receipt;
  } finally {
    await client.query("RESET ROLE");
    client.release();
  }
}
try {
  execFileSync("initdb", ["--pgdata", dataDirectory, "--auth", "trust", "--username", "postgres", "--encoding", "UTF8", "--no-locale"], { stdio: "pipe", timeout: 60_000 });
  const port = await new Promise((resolve, reject) => {
    const server = createServer(); server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { const selected = server.address().port; server.close((error) => error ? reject(error) : resolve(selected)); });
  });
  startAttempted = true;
  execFileSync("pg_ctl", ["--pgdata", dataDirectory, "--log", join(rootDirectory, "postgres.log"), "--options", `-h 127.0.0.1 -p ${port} -c unix_socket_directories=''`, "--wait", "start"], { stdio: "pipe", timeout: 60_000 });
  pool = new Pool({ host: "127.0.0.1", port, user: "postgres", database: "postgres", max: 8, statement_timeout: 5000 });
  evidence.postgresVersion = (await pool.query("SHOW server_version")).rows[0].server_version;
  await pool.query("CREATE ROLE receipt_owner NOLOGIN; CREATE ROLE receipt_app NOLOGIN; CREATE ROLE receipt_outsider NOLOGIN; GRANT USAGE,CREATE ON SCHEMA public TO receipt_owner; GRANT USAGE ON SCHEMA public TO receipt_app,receipt_outsider;");
  await pool.query(`SET ROLE receipt_owner; ${legacy} RESET ROLE;`);
  await pool.query(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC; GRANT EXECUTE ON FUNCTION ${signature} TO receipt_app;
    GRANT SELECT,INSERT,UPDATE ON public.open_ena_ai_consent_receipts TO receipt_app;`);
  await pool.query(`ALTER FUNCTION ${signature} STRICT SECURITY DEFINER VOLATILE PARALLEL RESTRICTED COST 175; ALTER FUNCTION ${signature} SET search_path TO public, pg_temp; ALTER FUNCTION ${signature} SET statement_timeout TO '2500ms';`);
  for (const [index, status] of ["authorized", "completed", "failed", "released"].entries()) {
    const receipt = await appCall(params(index));
    if (status !== "authorized") await pool.query("SELECT public.open_ena_update_ai_consent_receipt($1,$2,$3,$4)", [receipt.id, status, "deepseek", "deepseek-flash"]);
  }
  const beforeDefinition = await definition();
  const before = { metadata: await metadata(), schema: await schema(), rows: await rows(), definitionSha256: digest(beforeDefinition) };
  evidence.before = before;

  await check("old-003 existing database upgrades via operator psql while preserving owner ACL schema signature and receipts", async () => {
    execFileSync("psql", ["--no-psqlrc", "--host", "127.0.0.1", "--port", String(port), "--username", "postgres", "--dbname", "postgres", "--set", "ON_ERROR_STOP=1", "--file", migrationFile], { stdio: "pipe", timeout: 60_000 });
    assert.deepEqual(await metadata(), before.metadata);
    assert.deepEqual(await schema(), before.schema);
    assert.deepEqual(await rows(), before.rows);
    assert.match(await definition(), /ON CONFLICT DO NOTHING/);
    evidence.afterUpgrade = { metadata: await metadata(), schema: await schema(), rows: await rows(), definitionSha256: digest(await definition()) };
    return { owner: before.metadata.owner, appExecute: before.metadata.app_execute, outsiderExecute: before.metadata.outsider_execute, existingStatuses: before.rows.map((row) => row.status) };
  });
  await check("existing terminal and authorized receipts retain exact original bindings under changed repeat requests", async () => {
    for (let index = 0; index < 4; index += 1) {
      const receipt = await appCall(params(index, "c".repeat(64)));
      assert.equal(receipt.request_sha256, originalHash);
      assert.equal(receipt.status, before.rows[index].status);
      assert.equal(receipt.id, before.rows[index].id);
    }
    assert.deepEqual(await rows(), before.rows);
  });
  await check("007 repeats without changing metadata definition or existing receipt rows", async () => {
    const savedDefinition = await definition();
    const xmin = async () => (await pool.query("SELECT xmin::text AS version FROM pg_proc WHERE oid=$1::regprocedure", [signature])).rows[0].version;
    const savedVersion = await xmin();
    await pool.query(upgrade); await pool.query(upgrade);
    assert.equal(await definition(), savedDefinition);
    assert.equal(await xmin(), savedVersion, "already-patched functions are a true no-op");
    assert.deepEqual(await metadata(), before.metadata);
    assert.deepEqual(await rows(), before.rows);
  });
  await check("upgraded nonowner app role supports 40 groups of eight concurrent idempotent inserts", async () => {
    for (let index = 100; index < 140; index += 1) {
      const receipts = await Promise.all(Array.from({ length: 8 }, () => appCall(params(index))));
      assert.ok(receipts.every((receipt) => receipt.id === receipts[0].id && receipt.request_sha256 === originalHash));
      assert.equal((await appCall(params(index, "d".repeat(64)))).request_sha256, originalHash);
    }
    assert.equal((await rows()).length, 44);
    return { groups: 40, concurrentPerGroup: 8, uniqueAddedRows: 40 };
  });
  await check("aborted upgrade transaction restores the old function plus ownership ACL and existing receipt data", async () => {
    await pool.query(beforeDefinition);
    const savedDefinition = await definition(); const savedRows = await rows();
    const client = await pool.connect();
    try {
      await client.query("BEGIN"); await client.query(upgrade);
      await assert.rejects(client.query("SELECT 1/0"), (error) => error.code === "22012");
      await client.query("ROLLBACK");
    } finally { client.release(); }
    assert.equal(await definition(), savedDefinition);
    assert.deepEqual(await metadata(), before.metadata);
    assert.deepEqual(await rows(), savedRows);
    await pool.query(upgrade);
  });
  await check("nonowner without grant cannot invoke receipt creation after upgrade", async () => {
    const client = await pool.connect();
    try {
      await client.query("SET ROLE receipt_outsider");
      await assert.rejects(client.query(sql, params(900)), (error) => error.code === "42501");
    } finally { await client.query("RESET ROLE"); client.release(); }
  });
  await check("007 retains an operator-set function-local search_path configuration", async () => {
    await pool.query(`ALTER FUNCTION ${signature} SET search_path TO public, pg_temp`);
    const configured = await metadata();
    await pool.query(upgrade);
    const upgraded = await metadata();
    evidence.operatorConfiguration = { before: configured.proconfig, after: upgraded.proconfig };
    assert.deepEqual(upgraded.proconfig, configured.proconfig);
  });
  await check("old bodies retain custom volatility strictness security cost parallelism and local configuration", async () => {
    for (const attributes of ["STABLE STRICT SECURITY DEFINER PARALLEL SAFE COST 123", "IMMUTABLE CALLED ON NULL INPUT SECURITY INVOKER PARALLEL RESTRICTED COST 321"]) {
      await pool.query(beforeDefinition);
      await pool.query(`ALTER FUNCTION ${signature} ${attributes}`);
      const configured = await metadata();
      await pool.query(upgrade);
      assert.deepEqual(await metadata(), configured);
    }
    // These attribute variants are preservation probes; a mutating receipt
    // function is not invoked while marked STABLE or IMMUTABLE.
    await pool.query(beforeDefinition); await pool.query(upgrade);
  });
  await check("missing function fails closed without creating a replacement elsewhere", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN; CREATE SCHEMA absent_receipts; SET LOCAL search_path TO absent_receipts, pg_catalog");
      await assert.rejects(client.query(upgrade), (error) => error.code === "55000");
      await client.query("ROLLBACK");
    } finally { client.release(); }
    assert.deepEqual(await metadata(), before.metadata);
  });
  await check("unrecognized bodies and ambiguous old clauses fail closed without any replacement", async () => {
    const savedRows = await rows();
    for (const comment of ["-- custom body outside the supported baseline", "-- ON CONFLICT (principal_ref_hash, operation_id) DO NOTHING"]) {
      await pool.query(beforeDefinition.replace("DECLARE", `${comment}\nDECLARE`));
      const unknownDefinition = await definition();
      const unknownMetadata = await metadata();
      await assert.rejects(pool.query(upgrade), (error) => error.code === "55000");
      assert.equal(await definition(), unknownDefinition);
      assert.deepEqual(await metadata(), unknownMetadata);
      assert.deepEqual(await rows(), savedRows);
    }
    await pool.query(beforeDefinition); await pool.query(upgrade);
  });
  await check("the separately corrected fresh 003 body is a true no-op with operator settings intact", async () => {
    const current003 = readFileSync(join(project, "migrations/003_open_ena_ai_consent.sql"), "utf8");
    const currentFunction = current003.slice(current003.indexOf("CREATE OR REPLACE FUNCTION open_ena_record_ai_consent_receipt("), current003.indexOf("CREATE OR REPLACE FUNCTION open_ena_update_ai_consent_receipt("));
    await pool.query(currentFunction);
    await pool.query(`ALTER FUNCTION ${signature} SET statement_timeout TO '1234ms'`);
    const configured = await metadata(); const savedDefinition = await definition();
    const version = (await pool.query("SELECT xmin::text AS version FROM pg_proc WHERE oid=$1::regprocedure", [signature])).rows[0].version;
    await pool.query(upgrade);
    assert.deepEqual(await metadata(), configured);
    assert.equal(await definition(), savedDefinition);
    assert.equal((await pool.query("SELECT xmin::text AS version FROM pg_proc WHERE oid=$1::regprocedure", [signature])).rows[0].version, version);
    await pool.query(beforeDefinition); await pool.query(upgrade);
  });
  await check("a same-search-path nonpublic schema upgrade preserves its own function and rows without touching public", async () => {
    const savedPublic = await definition();
    const client = await pool.connect();
    try {
      await client.query("BEGIN; CREATE SCHEMA receipt_private; SET LOCAL search_path TO receipt_private, pg_catalog");
      await client.query(legacy);
      await client.query("ALTER FUNCTION receipt_private.open_ena_record_ai_consent_receipt(text,text,text,text,text,text) SET search_path TO receipt_private, pg_temp");
      const inserted = (await client.query("SELECT receipt_private.open_ena_record_ai_consent_receipt($1,$2,$3,$4,$5,$6) AS receipt", params(800))).rows[0].receipt;
      const beforeOid = (await client.query("SELECT 'receipt_private.open_ena_record_ai_consent_receipt(text,text,text,text,text,text)'::regprocedure::oid AS oid")).rows[0].oid;
      await client.query(upgrade);
      const after = (await client.query("SELECT oid,proconfig,prosrc FROM pg_proc WHERE oid='receipt_private.open_ena_record_ai_consent_receipt(text,text,text,text,text,text)'::regprocedure")).rows[0];
      assert.equal(after.oid, beforeOid);
      assert.deepEqual(after.proconfig, ["search_path=receipt_private, pg_temp"]);
      assert.match(after.prosrc, /ON CONFLICT DO NOTHING/);
      const repeated = (await client.query("SELECT receipt_private.open_ena_record_ai_consent_receipt($1,$2,$3,$4,$5,$6) AS receipt", params(800, "d".repeat(64)))).rows[0].receipt;
      assert.deepEqual(repeated, inserted);
      await client.query("ROLLBACK");
    } finally { await client.query("ROLLBACK"); client.release(); }
    assert.equal(await definition(), savedPublic);
  });
  await check("official legacy 003 with CRLF body upgrades while preserving original line endings and attributes", async () => {
    try {
      await pool.query(beforeDefinition.replaceAll("\n", "\r\n"));
      const original = (await pool.query("SELECT prosrc FROM pg_proc WHERE oid=$1::regprocedure", [signature])).rows[0].prosrc;
      assert.ok(original.includes("\r\n"));
      const configured = await metadata();
      await pool.query(upgrade);
      const patched = (await pool.query("SELECT prosrc FROM pg_proc WHERE oid=$1::regprocedure", [signature])).rows[0].prosrc;
      assert.equal(patched, original.replace("ON CONFLICT (principal_ref_hash, operation_id) DO NOTHING", "ON CONFLICT DO NOTHING"));
      assert.deepEqual(await metadata(), configured);
      assert.equal((await appCall(params(0, "d".repeat(64)))).request_sha256, originalHash);
    } finally { await pool.query(beforeDefinition); await pool.query(upgrade); }
  });
  await check("both known corrected CRLF bodies remain exact no-ops on repeated 007 application", async () => {
    const current003 = readFileSync(join(project, "migrations/003_open_ena_ai_consent.sql"), "utf8");
    const currentFunction = current003.slice(current003.indexOf("CREATE OR REPLACE FUNCTION open_ena_record_ai_consent_receipt("), current003.indexOf("CREATE OR REPLACE FUNCTION open_ena_update_ai_consent_receipt("));
    const patchedLegacy = beforeDefinition.replace("ON CONFLICT (principal_ref_hash, operation_id) DO NOTHING", "ON CONFLICT DO NOTHING");
    try {
      for (const corrected of [currentFunction, patchedLegacy]) {
        await pool.query(corrected.replaceAll("\n", "\r\n"));
        await pool.query(`ALTER FUNCTION ${signature} SET statement_timeout TO '1234ms'`);
        const savedDefinition = await definition(); const configured = await metadata();
        const version = (await pool.query("SELECT xmin::text AS version FROM pg_proc WHERE oid=$1::regprocedure", [signature])).rows[0].version;
        await pool.query(upgrade); await pool.query(upgrade);
        assert.equal(await definition(), savedDefinition);
        assert.deepEqual(await metadata(), configured);
        assert.equal((await pool.query("SELECT xmin::text AS version FROM pg_proc WHERE oid=$1::regprocedure", [signature])).rows[0].version, version);
      }
    } finally { await pool.query(beforeDefinition); await pool.query(upgrade); }
  });
} catch (error) {
  evidence.fatal = { message: error.message, code: error.code };
  console.error(error);
} finally {
  if (pool) await pool.end();
  try {
    evidence.cleanup = await cleanupOwnedEphemeralPostgres({ rootDirectory, dataDirectory, rootPrefix: prefix, startAttempted });
    evidence.cleanup.confirmed = true;
  } catch (error) { evidence.cleanup = { confirmed: false, message: error.message }; }
  evidence.finishedAt = new Date().toISOString();
  evidence.exitCode = evidence.fatal || evidence.checks.some((check) => check.status === "FAIL") || !evidence.cleanup.confirmed ? 1 : 0;
  writeFileSync(join(evidenceDirectory, "upgrade-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`RESULT: exit=${evidence.exitCode}; cleanup=${evidence.cleanup.confirmed}; checks=${evidence.checks.length}`);
  process.exitCode = evidence.exitCode;
}
