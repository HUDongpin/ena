// Owned PostgreSQL 16 upgrade regression; no deployment configuration is read.
// PATH=/opt/homebrew/opt/postgresql@16/bin:$PATH node tests/review-server-migration-006-upgrade.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { cleanupOwnedEphemeralPostgres } from "./support/owned-ephemeral-postgres.mjs";

const project = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== "--evidence-dir" || !args[1])) {
  throw new TypeError("Usage: node tests/review-server-migration-006-upgrade.mjs [--evidence-dir <directory>]");
}
const evidenceDirectory = resolve(args[1] ?? join(project, "output/postgres/migration-006-evidence"));
mkdirSync(evidenceDirectory, { recursive: true });
const legacy = readFileSync(join(project, "migrations/001_open_ena_billable.sql"), "utf8");
const upgrade = readFileSync(join(project, "migrations/006_open_ena_billable_leases.sql"), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const receipt = {
  schemaVersion: "open-ena.migration-006-upgrade-regression.v1",
  startedAt: new Date().toISOString(),
  inputs: { legacy001Sha256: sha256(legacy), upgrade006Sha256: sha256(upgrade) },
  permissionScope: "Owned local non-superuser invoker model only; current production grants are not verified.",
  checks: [],
};
const prefix = "ena-migration-006-upgrade-";
const rootDirectory = mkdtempSync(join(tmpdir(), prefix));
const dataDirectory = join(rootDirectory, "data");
let startAttempted = false;
let pool;
let app;
let denied;
let assertions = 0;
function equal(actual, expected, message) { assertions += 1; assert.deepEqual(actual, expected, message); }
function ok(value, message) { assertions += 1; assert.ok(value, message); }
async function rejects(action, code, message) {
  assertions += 1;
  await assert.rejects(action, (error) => error.code === code, message);
}
async function check(name, action) {
  const before = assertions;
  try {
    const detail = await action();
    receipt.checks.push({ name, status: "PASS", assertions: assertions - before, ...(detail ? { detail } : {}) });
    console.log(`PASS: ${name}`);
  } catch (error) {
    receipt.checks.push({ name, status: "FAIL", assertions: assertions - before, message: error.message, code: error.code });
    throw error;
  }
}
const limits = {
  dailyMicroUsd: 1_000_000, monthlyMicroUsd: 1_000_000,
  globalDailyMicroUsd: 1_000_000, globalMonthlyMicroUsd: 1_000_000,
  providerDailyMicroUsd: 1_000_000, providerMonthlyMicroUsd: 1_000_000,
  maxConcurrency: 1, provider: "deepseek", alertThresholds: [],
};
const reserveSql = "SELECT * FROM public.open_ena_reserve_billable_v2($1,$2,$3,$4,$5)";
const reserveValues = (principal, key, amount = 10, resource = "ai-interpretation") => [principal, resource, amount, key, limits];
async function reserve(connection, principal, key, amount = 10, resource = "ai-interpretation", version = "v2") {
  const sql = version === "legacy" ? reserveSql.replace("_billable_v2", "_billable") : reserveSql;
  return (await connection.query(sql, reserveValues(principal, key, amount, resource))).rows[0];
}
async function rows(withLease = true) {
  return (await pool.query(`SELECT ${withLease ? "to_jsonb(r)" : "to_jsonb(r) - 'lease_expires_at'"} AS value
    FROM public.open_ena_billable_reservations r ORDER BY principal_ref,resource,idempotency_key`)).rows.map(({ value }) => value);
}
async function spend() {
  return (await pool.query("SELECT to_jsonb(s) AS value FROM public.open_ena_spend s ORDER BY scope_kind,scope_ref,period,period_start")).rows.map(({ value }) => value);
}
async function events() {
  return (await pool.query("SELECT to_jsonb(e) AS value FROM public.open_ena_security_outbox e ORDER BY id")).rows.map(({ value }) => value);
}
async function snapshot() { return { rows: await rows(), spend: await spend(), events: await events() }; }
async function row(id) {
  return (await pool.query("SELECT to_jsonb(r) AS value FROM public.open_ena_billable_reservations r WHERE id=$1", [id])).rows[0].value;
}
async function principalSpend(principal) {
  return (await pool.query("SELECT period,micro_usd::text FROM public.open_ena_spend WHERE scope_kind='principal' AND scope_ref=$1 ORDER BY period", [principal])).rows;
}
async function expirationEvents(id) {
  return (await pool.query("SELECT count(*)::integer AS count FROM public.open_ena_security_outbox WHERE code='reservation-lease-expired' AND dedupe_key=$1", [`reservation-lease-expired:${id}`])).rows[0].count;
}
async function expire(id) {
  await pool.query("UPDATE public.open_ena_billable_reservations SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [id]);
}
async function applyUpgrade() {
  const client = await pool.connect();
  try { await client.query("BEGIN"); await client.query(upgrade); await client.query("COMMIT"); }
  finally { await client.query("ROLLBACK"); client.release(); }
}
// Observe each real backend blocked by this exact holder before releasing it.
async function waitForLock(waiterPid, holderPid) {
  const deadline = Date.now() + 2_000;
  let state;
  do {
    state = (await pool.query("SELECT wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=$1", [waiterPid])).rows[0];
    if (state?.wait_event_type === "Lock" && state.wait_event === "advisory" && state.blockers.includes(holderPid)) break;
    await delay(10);
  } while (Date.now() < deadline);
  equal(state?.wait_event_type, "Lock", "the operation must reach a real database lock wait");
  equal(state?.wait_event, "advisory", "reserve, settle and release must share the advisory lock");
  ok(state?.blockers.includes(holderPid), "the exact owning transaction must block the operation");
}
async function withWaitingTransactions(holderAction, waitingActions) {
  const holder = await app.connect();
  const waiters = [];
  const pending = [];
  try {
    await holder.query("BEGIN");
    const holderPid = (await holder.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    const heldResult = await holderAction(holder);
    for (const action of waitingActions) {
      const waiter = await app.connect(); waiters.push(waiter);
      const waiterPid = (await waiter.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      const query = action(waiter); query.catch(() => undefined); pending.push(query);
      await waitForLock(waiterPid, holderPid);
    }
    await holder.query("COMMIT");
    return { heldResult, results: await Promise.all(pending) };
  } finally {
    await holder.query("ROLLBACK").catch(() => undefined);
    await Promise.allSettled(pending);
    for (const waiter of waiters) waiter.release();
    holder.release();
  }
}

try {
  execFileSync("initdb", ["--pgdata", dataDirectory, "--auth", "trust", "--username", "postgres", "--encoding", "UTF8", "--no-locale"], { stdio: "pipe", timeout: 60_000 });
  const port = await new Promise((resolvePort, reject) => {
    const server = createServer(); server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { const selected = server.address().port; server.close((error) => error ? reject(error) : resolvePort(selected)); });
  });
  startAttempted = true;
  execFileSync("pg_ctl", ["--pgdata", dataDirectory, "--log", join(rootDirectory, "postgres.log"), "--options", `-h 127.0.0.1 -p ${port} -c unix_socket_directories=''`, "--wait", "start"], { stdio: "pipe", timeout: 60_000 });
  const connection = { host: "127.0.0.1", port, database: "postgres", max: 8, statement_timeout: 5_000, connectionTimeoutMillis: 2_000, idle_in_transaction_session_timeout: 10_000 };
  pool = new Pool({ ...connection, user: "postgres" });
  receipt.postgresVersion = (await pool.query("SHOW server_version")).rows[0].server_version;
  ok(receipt.postgresVersion.startsWith("16."), "this release regression requires PostgreSQL 16");
  await pool.query(legacy);
  const live = (await reserve(pool, "legacy-live", "live", 40, "ai-interpretation", "legacy")).reservation;
  const settled = (await reserve(pool, "legacy-settled", "settled", 40, "ai-interpretation", "legacy")).reservation;
  await pool.query("SELECT public.open_ena_settle_billable($1,15,true)", [settled.id]);
  const released = (await reserve(pool, "legacy-released", "released", 30, "ai-interpretation", "legacy")).reservation;
  await pool.query("SELECT public.open_ena_release_billable($1)", [released.id]);
  const historicalId = "00000000-0000-4000-8000-000000000006";
  await pool.query(`INSERT INTO public.open_ena_billable_reservations
    (id,principal_ref,resource,provider_ref,idempotency_key,reserved_micro_usd,actual_micro_usd,day_start,month_start,status,dispatched,created_at)
    VALUES($1,'legacy-history','longitudinal','persistent-compute','historical-operation',25,NULL,'2001-01-31','2001-01-01','reserved',false,'2001-01-31T23:59:00Z')`, [historicalId]);
  await pool.query(`INSERT INTO public.open_ena_spend(scope_kind,scope_ref,period,period_start,micro_usd)
    SELECT scope.kind,scope.ref,period.kind,period.start,25 FROM
    (VALUES('principal','legacy-history'),('global','global'),('provider','persistent-compute')) AS scope(kind,ref)
    CROSS JOIN (VALUES('day','2001-01-31'::date),('month','2001-01-01'::date)) AS period(kind,start)`);
  const before = { rows: await rows(false), spend: await spend() };
  equal(before.rows.map((item) => item.status).sort(), ["released", "reserved", "reserved", "settled"]);

  await check("006 rolls back atomically on a populated 001 database", async () => {
    const client = await pool.connect();
    try { await client.query("BEGIN"); await client.query(upgrade); await client.query("ROLLBACK"); }
    finally { await client.query("ROLLBACK"); client.release(); }
    equal((await pool.query("SELECT to_regprocedure('public.open_ena_reserve_billable_v2(text,text,bigint,text,jsonb)') AS fn")).rows[0].fn, null);
    equal((await pool.query("SELECT count(*)::integer AS count FROM information_schema.columns WHERE table_schema='public' AND table_name='open_ena_billable_reservations' AND column_name='lease_expires_at'")).rows[0].count, 0);
    equal(await rows(false), before.rows); equal(await spend(), before.spend);
  });

  await check("populated 001 to 006 preserves rows and period spend and grants fresh five-minute leases", async () => {
    const started = (await pool.query("SELECT clock_timestamp()::text AS value")).rows[0].value;
    await applyUpgrade();
    const finished = (await pool.query("SELECT clock_timestamp()::text AS value")).rows[0].value;
    equal(await rows(false), before.rows); equal(await spend(), before.spend);
    const bounds = (await pool.query(`SELECT count(*)::integer AS total,
      count(*) FILTER (WHERE lease_expires_at >= $1::timestamptz+interval '5 minutes'
        AND lease_expires_at <= $2::timestamptz+interval '5 minutes')::integer AS in_bounds,
      bool_and(lease_expires_at > clock_timestamp()) AS future FROM public.open_ena_billable_reservations`, [started, finished])).rows[0];
    equal(bounds, { total: 4, in_bounds: 4, future: true });
    equal((await reserve(pool, "legacy-live", "premature-replacement")).reason, "concurrency");
    equal((await reserve(pool, "legacy-history", "premature-replacement")).reason, "concurrency");
    equal(await expirationEvents(live.id), 0); equal(await expirationEvents(historicalId), 0);
    return { databaseMigrationStart: started, databaseMigrationFinish: finished, migratedRows: 4 };
  });

  await check("repeat 006 preserves every lease, row, spend bucket and outbox event", async () => {
    // An already expired value must remain expired, not be renewed by replaying DDL.
    await expire(historicalId);
    const saved = await snapshot(); await applyUpgrade(); await applyUpgrade();
    equal(await snapshot(), saved);
  });

  await check("a real non-superuser invoker can reserve, settle and release with explicit grants", async () => {
    await pool.query(`CREATE ROLE lease_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      CREATE ROLE lease_denied LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
      GRANT USAGE ON SCHEMA public TO lease_app,lease_denied;
      GRANT EXECUTE ON FUNCTION public.open_ena_reserve_billable_v2(text,text,bigint,text,jsonb),
        public.open_ena_reserve_billable(text,text,bigint,text,jsonb),public.open_ena_settle_billable(uuid,bigint,boolean),
        public.open_ena_release_billable(uuid) TO lease_app;
      GRANT SELECT,INSERT,UPDATE ON public.open_ena_billable_reservations,public.open_ena_spend TO lease_app;
      GRANT SELECT,INSERT ON public.open_ena_security_outbox TO lease_app;
      GRANT USAGE ON SEQUENCE public.open_ena_security_outbox_id_seq TO lease_app;`);
    app = new Pool({ ...connection, user: "lease_app" });
    denied = new Pool({ ...connection, user: "lease_denied" });
    equal((await app.query("SELECT current_user AS name,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows[0], { name: "lease_app", rolsuper: false, rolbypassrls: false });
    equal((await pool.query("SELECT prosecdef FROM pg_proc WHERE oid='public.open_ena_reserve_billable_v2(text,text,bigint,text,jsonb)'::regprocedure")).rows[0].prosecdef, false);
    const first = await reserve(app, "role-success", "settle", 40); equal(first.allowed, true);
    await app.query("SELECT public.open_ena_settle_billable($1,15,true)", [first.reservation.id]);
    const second = await reserve(app, "role-success", "release", 30); equal(second.allowed, true);
    await app.query("SELECT public.open_ena_release_billable($1)", [second.reservation.id]);
    equal(await principalSpend("role-success"), [{ period: "day", micro_usd: "15" }, { period: "month", micro_usd: "15" }]);
  });

  await check("missing function or underlying table permission rejects without any ledger mutation", async () => {
    const saved = await snapshot();
    await rejects(() => reserve(denied, "denied", "no-execute"), "42501");
    await pool.query(`GRANT EXECUTE ON FUNCTION public.open_ena_reserve_billable_v2(text,text,bigint,text,jsonb),
      public.open_ena_reserve_billable(text,text,bigint,text,jsonb) TO lease_denied`);
    await rejects(() => reserve(denied, "legacy-history", "no-table-permission"), "42501");
    equal(await snapshot(), saved);
  });

  await check("historical expiry recovery retains original period spend and operation replay denial", async () => {
    const originalPeriods = (await spend()).filter((item) => item.period_start.startsWith("2001-01"));
    const result = await reserve(app, "legacy-history", "replacement", 10, "longitudinal"); equal(result.allowed, true);
    const recovered = await row(historicalId);
    equal([recovered.status, recovered.actual_micro_usd, recovered.dispatched], ["settled", 25, true]);
    equal((await spend()).filter((item) => item.period_start.startsWith("2001-01")), originalPeriods);
    equal(await expirationEvents(historicalId), 1);
    equal((await reserve(app, "legacy-history", "historical-operation", 25, "longitudinal")).reason, "idempotency-replayed");
    await app.query("SELECT public.open_ena_release_billable($1)", [result.reservation.id]);
  });

  await check("recovery holding the principal lock wins once over concurrent settle, release and recovery", async () => {
    const principal = "recovery-first";
    const initial = await reserve(app, principal, "old", 40); equal(initial.allowed, true); await expire(initial.reservation.id);
    const race = await withWaitingTransactions(
      (holder) => reserve(holder, principal, "new", 10, "longitudinal"),
      [(waiter) => waiter.query("SELECT public.open_ena_settle_billable($1,5,true)", [initial.reservation.id]),
        (waiter) => waiter.query("SELECT public.open_ena_release_billable($1)", [initial.reservation.id]),
        (waiter) => reserve(waiter, principal, "competing-new", 10)],
    );
    equal(race.heldResult.allowed, true); equal(race.results[2].reason, "concurrency");
    const recovered = await row(initial.reservation.id);
    equal([recovered.status, recovered.actual_micro_usd, recovered.dispatched], ["settled", 40, true]);
    equal(await principalSpend(principal), [{ period: "day", micro_usd: "50" }, { period: "month", micro_usd: "50" }]);
    equal(await expirationEvents(initial.reservation.id), 1);
    equal((await reserve(app, principal, "old", 40)).reason, "idempotency-replayed");
    equal(await expirationEvents(initial.reservation.id), 1);
  });

  for (const terminal of ["settle", "release"]) {
    await check(`${terminal} holding the principal lock prevents a waiting recovery from double-accounting`, async () => {
      const principal = `${terminal}-first`;
      const initial = await reserve(app, principal, "old", 40); equal(initial.allowed, true); await expire(initial.reservation.id);
      const sql = terminal === "settle" ? "SELECT public.open_ena_settle_billable($1,5,true)" : "SELECT public.open_ena_release_billable($1)";
      const race = await withWaitingTransactions((holder) => holder.query(sql, [initial.reservation.id]),
        [(waiter) => reserve(waiter, principal, "new", 10), (waiter) => waiter.query(sql, [initial.reservation.id])]);
      equal(race.results[0].allowed, true);
      const finished = await row(initial.reservation.id);
      equal([finished.status, finished.actual_micro_usd, finished.dispatched], terminal === "settle" ? ["settled", 5, true] : ["released", null, false]);
      const amount = terminal === "settle" ? "15" : "10";
      equal(await principalSpend(principal), [{ period: "day", micro_usd: amount }, { period: "month", micro_usd: amount }]);
      equal(await expirationEvents(initial.reservation.id), 0);
      equal((await reserve(app, principal, "old", 40)).reason, "idempotency-replayed");
    });
  }
} catch (error) {
  receipt.fatal = { message: error.message, code: error.code };
  console.error(`FAIL: ${error.message}`);
} finally {
  await Promise.all([app, denied, pool].filter(Boolean).map((entry) => entry.end()));
  try {
    receipt.cleanup = { ...await cleanupOwnedEphemeralPostgres({ rootDirectory, dataDirectory, rootPrefix: prefix, startAttempted }), confirmed: true };
    equal(existsSync(rootDirectory), false, "the owned data directory must be removed after confirmed shutdown");
  } catch (error) { receipt.cleanup = { confirmed: false, message: error.message, ownedRoot: basename(rootDirectory) }; }
  receipt.assertions = assertions;
  receipt.finishedAt = new Date().toISOString();
  receipt.exitCode = receipt.fatal || receipt.checks.some((entry) => entry.status === "FAIL") || !receipt.cleanup.confirmed ? 1 : 0;
  writeFileSync(join(evidenceDirectory, "upgrade-evidence.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`RESULT: exit=${receipt.exitCode}; checks=${receipt.checks.length}; assertions=${assertions}; cleanup=${receipt.cleanup.confirmed}`);
  process.exitCode = receipt.exitCode;
}
