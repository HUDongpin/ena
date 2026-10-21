import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, scryptSync } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { createOpenEnaLoginPostHandler } from "../lib/server/open-ena-login-route.ts";
import { createPostgresOpenEnaAuthSecurityStore } from "../lib/server/open-ena-auth-security-store.ts";
import { openEnaDisposableUsernameRef, verifyOpenEnaCredentials } from "../lib/open-ena-auth.ts";
import { cleanupOwnedEphemeralPostgres } from "./support/owned-ephemeral-postgres.mjs";

const project = fileURLToPath(new URL("../", import.meta.url));
const evidenceArgument = process.argv.indexOf("--evidence-dir");
const evidenceDirectory = resolve(evidenceArgument >= 0 ? process.argv[evidenceArgument + 1] : join(project, "output/review-regressions/auth-login-source"));
mkdirSync(evidenceDirectory, { recursive: true });
const prefix = "ena-auth-source-";
const rootDirectory = mkdtempSync(join(tmpdir(), prefix));
const dataDirectory = join(rootDirectory, "data");
let startAttempted = false;
let pool;
let credentialChecks = 0;
const evidence = { startedAt: new Date().toISOString(), checks: [] };
const environment = {
  OPEN_ENA_USERNAME: "synthetic-owner",
  OPEN_ENA_PASSWORD: "synthetic-owner-test-password",
  OPEN_ENA_SESSION_SECRET: "synthetic-secret-".repeat(3),
  OPEN_ENA_ACCOUNT_ID: "isolated-source-regression",
  OPEN_ENA_ALLOWED_ORIGINS: "https://auth-test.invalid",
  OPEN_ENA_AUTH_DATABASE_URL: "postgresql://unused.invalid/owned-test",
  OPEN_ENA_TRUSTED_CLIENT_IP_HEADER: "x-test-ip",
};

async function check(name, action) {
  try {
    const detail = await action();
    evidence.checks.push({ name, status: "PASS", ...(detail ? { detail } : {}) });
    console.log(`PASS: ${name}`);
  } catch (error) {
    evidence.checks.push({ name, status: "FAIL", message: error.message, actual: error.actual, expected: error.expected });
    console.error(`FAIL: ${name}: ${error.message}`);
  }
}

function request({ source = "192.0.2.1", correct = false, username = environment.OPEN_ENA_USERNAME, password, headers = {} } = {}) {
  return new Request("https://auth-test.invalid/api/open-ena/login", {
    method: "POST",
    headers: { origin: "https://auth-test.invalid", "content-type": "application/x-www-form-urlencoded", ...(source === null ? {} : { "x-test-ip": source }), ...headers },
    body: new URLSearchParams({ locale: "zh-hans", username, password: password ?? (correct ? environment.OPEN_ENA_PASSWORD : "synthetic-wrong-password") }),
  });
}
function handler(store, customEnvironment = environment) {
  return createOpenEnaLoginPostHandler({
    environment: customEnvironment,
    securityStoreFactory: async () => store,
    verifyCredentials(username, password) {
      credentialChecks += 1;
      return verifyOpenEnaCredentials(username, password, customEnvironment);
    },
  });
}
async function clearSources() {
  await pool.query("DELETE FROM public.open_ena_auth_attempt_windows WHERE scope_kind='source'");
  credentialChecks = 0;
}
async function counts() {
  return (await pool.query("SELECT attempt_count FROM public.open_ena_auth_attempt_windows WHERE scope_kind='source' ORDER BY scope_ref")).rows.map(row => row.attempt_count);
}

try {
  execFileSync("initdb", ["--pgdata", dataDirectory, "--auth", "trust", "--username", "postgres", "--encoding", "UTF8", "--no-locale"], { stdio: "pipe", timeout: 60_000 });
  const port = await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { const selected = server.address().port; server.close(error => error ? reject(error) : resolvePort(selected)); });
  });
  startAttempted = true;
  execFileSync("pg_ctl", ["--pgdata", dataDirectory, "--log", join(rootDirectory, "postgres.log"), "--options", `-h 127.0.0.1 -p ${port} -c unix_socket_directories=''`, "--wait", "start"], { stdio: "pipe", timeout: 60_000 });
  pool = new Pool({ host: "127.0.0.1", port, user: "postgres", database: "postgres", max: 12, statement_timeout: 5000 });
  evidence.postgresVersion = (await pool.query("SHOW server_version")).rows[0].server_version;
  for (const file of ["002_open_ena_auth_security.sql", "004_open_ena_disposable_accounts.sql", "008_open_ena_disposable_expiry_after_lock.sql"]) {
    await pool.query(readFileSync(join(project, "migrations", file), "utf8"));
  }
  const migration = readFileSync(join(project, "migrations/009_open_ena_login_source_reservations.sql"), "utf8");
  evidence.migrationSha256 = createHash("sha256").update(migration).digest("hex");
  const store = createPostgresOpenEnaAuthSecurityStore((sql, values) => pool.query(sql, values));
  const post = handler(store);

  await check("009 is additive and repeatable, preserving legacy function and shared account rows", async () => {
    await pool.query("INSERT INTO public.open_ena_auth_attempt_windows VALUES ('account','legacy-account',clock_timestamp(),10)");
    const accountBefore = (await pool.query("SELECT to_jsonb(a) AS value FROM public.open_ena_auth_attempt_windows a WHERE scope_kind='account'")).rows;
    const definitionBefore = (await pool.query("SELECT pg_get_functiondef('public.open_ena_consume_login_attempt(text,text,integer,integer,integer)'::regprocedure) AS value")).rows;
    await pool.query(migration);
    await pool.query(migration);
    assert.deepEqual((await pool.query("SELECT to_jsonb(a) AS value FROM public.open_ena_auth_attempt_windows a WHERE scope_kind='account'")).rows, accountBefore);
    assert.deepEqual((await pool.query("SELECT pg_get_functiondef('public.open_ena_consume_login_attempt(text,text,integer,integer,integer)'::regprocedure) AS value")).rows, definitionBefore);
  });

  await check("fifteen failures at one source do not block correct credentials from another", async () => {
    await clearSources();
    const statuses = [];
    for (let index = 0; index < 15; index++) statuses.push((await post(request())).status);
    assert.deepEqual(statuses, [...Array(5).fill(303), ...Array(10).fill(429)]);
    assert.equal(credentialChecks, 5);
    const other = await post(request({ correct: true, source: "192.0.2.2" }));
    assert.equal(other.status, 303);
    assert.ok(other.headers.get("set-cookie"));
    assert.deepEqual((await counts()).sort((a, b) => a - b), [0, 5]);
  });

  await check("twenty successful logins do not accumulate an attempt charge", async () => {
    await clearSources();
    for (let index = 0; index < 20; index++) {
      const response = await post(request({ correct: true }));
      assert.equal(response.status, 303);
      assert.ok(response.headers.get("set-cookie"));
    }
    assert.deepEqual(await counts(), [0]);
  });

  await check("one successful credential cannot erase earlier disposable-password guesses", async () => {
    await clearSources();
    for (let index = 0; index < 4; index++) await post(request({ username: "synthetic-disposable" }));
    assert.ok((await post(request({ correct: true }))).headers.get("set-cookie"));
    assert.deepEqual(await counts(), [4]);
    await post(request({ username: "synthetic-disposable" }));
    const blocked = await post(request({ correct: true }));
    assert.equal(blocked.status, 429);
    assert.equal(credentialChecks, 6);
  });

  await check("concurrent reservations saturate at five; success refunds preserve other slots", async () => {
    await clearSources();
    const input = { sourceRef: "concurrent", limit: 5, windowSeconds: 900 };
    const attempts = await Promise.all(Array.from({ length: 32 }, () => store.reserveLoginAttempt(input)));
    const admitted = attempts.filter(attempt => attempt.allowed);
    assert.equal(admitted.length, 5);
    assert.deepEqual(await counts(), [5]);
    await Promise.all(admitted.slice(0, 2).map(attempt => store.refundLoginAttempt(attempt.reservation)));
    assert.deepEqual(await counts(), [3]);
    const more = await Promise.all(Array.from({ length: 8 }, () => store.reserveLoginAttempt(input)));
    assert.equal(more.filter(attempt => attempt.allowed).length, 2);
    assert.deepEqual(await counts(), [5]);
  });

  await check("concurrent actual handlers retain every admitted failure after success refunds", async () => {
    await clearSources();
    const responses = await Promise.all(Array.from({ length: 16 }, (_, index) => post(request({ correct: index % 4 === 0 }))));
    assert.ok(responses.every(response => response.status === 303 || response.status === 429));
    const successes = responses.filter(response => response.headers.has("set-cookie")).length;
    assert.deepEqual(await counts(), [credentialChecks - successes]);
    assert.ok(credentialChecks - successes <= 5);
    return { checkedCredentials: credentialChecks, successes, retainedFailures: credentialChecks - successes };
  });

  await check("a denied request reports the remaining window and does not extend it", async () => {
    await clearSources();
    await pool.query("INSERT INTO public.open_ena_auth_attempt_windows VALUES ('source','remaining',clock_timestamp()-interval '840 seconds',5)");
    const before = (await pool.query("SELECT window_start::text FROM public.open_ena_auth_attempt_windows WHERE scope_ref='remaining'")).rows[0].window_start;
    const attempt = await store.reserveLoginAttempt({ sourceRef: "remaining", limit: 5, windowSeconds: 900 });
    assert.equal(attempt.allowed, false);
    assert.ok(attempt.retryAfterSeconds >= 58 && attempt.retryAfterSeconds <= 60);
    assert.equal((await pool.query("SELECT window_start::text FROM public.open_ena_auth_attempt_windows WHERE scope_ref='remaining'")).rows[0].window_start, before);
    assert.deepEqual(await counts(), [5]);
  });

  await check("a late refund cannot reduce a replacement window", async () => {
    await clearSources();
    const input = { sourceRef: "rollover", limit: 5, windowSeconds: 900 };
    const previous = await store.reserveLoginAttempt(input);
    assert.equal(previous.allowed, true);
    await pool.query("UPDATE public.open_ena_auth_attempt_windows SET window_start=clock_timestamp()-interval '901 seconds' WHERE scope_ref='rollover'");
    const replacement = await store.reserveLoginAttempt(input);
    assert.equal(replacement.allowed, true);
    assert.notEqual(replacement.reservation.windowStartedAt, previous.reservation.windowStartedAt);
    await store.refundLoginAttempt(previous.reservation);
    assert.deepEqual(await counts(), [1]);
    await store.refundLoginAttempt(replacement.reservation);
    assert.deepEqual(await counts(), [0]);
  });

  await check("microsecond-precise database window identity survives the JavaScript store", async () => {
    await clearSources();
    await pool.query("INSERT INTO public.open_ena_auth_attempt_windows VALUES ('source','microseconds',date_trunc('milliseconds',clock_timestamp())+interval '456 microseconds',0)");
    const attempt = await store.reserveLoginAttempt({ sourceRef: "microseconds", limit: 5, windowSeconds: 900 });
    assert.equal(attempt.allowed, true);
    assert.match(attempt.reservation.windowStartedAt, /\d{3}456Z$/u);
    await store.refundLoginAttempt(attempt.reservation);
    assert.deepEqual(await counts(), [0]);
  });

  await check("row-lock waiting uses the post-lock clock for expiry and admission", async () => {
    await clearSources();
    await pool.query("INSERT INTO public.open_ena_auth_attempt_windows VALUES ('source','row-lock',clock_timestamp(),5)");
    const lock = await pool.connect();
    const waiter = await pool.connect();
    let pending;
    try {
      await lock.query("BEGIN");
      await lock.query("UPDATE public.open_ena_auth_attempt_windows SET window_start=clock_timestamp()-interval '899.8 seconds' WHERE scope_ref='row-lock'");
      const pid = (await waiter.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      pending = waiter.query("SELECT * FROM public.open_ena_reserve_login_attempt_v2('row-lock',5,900)");
      const deadline = Date.now() + 2000;
      let waiting = false;
      while (Date.now() < deadline) {
        waiting = (await pool.query("SELECT wait_event_type='Lock' AS waiting FROM pg_stat_activity WHERE pid=$1", [pid])).rows[0]?.waiting;
        if (waiting) break;
        await delay(10);
      }
      assert.equal(waiting, true);
      await lock.query("SELECT pg_sleep(0.35)");
      await lock.query("COMMIT");
      assert.equal((await pending).rows[0].allowed, true);
      assert.deepEqual(await counts(), [1]);
    } finally {
      await lock.query("ROLLBACK");
      if (pending) await pending.catch(() => undefined);
      lock.release();
      waiter.release();
    }
  });

  await check("an older release's uncommitted first attempt survives mixed-version admission and refund", async () => {
    await clearSources();
    const legacy = await pool.connect();
    const current = await pool.connect();
    const currentStore = createPostgresOpenEnaAuthSecurityStore((sql, values) => current.query(sql, values));
    let pending;
    try {
      await legacy.query("BEGIN");
      const old = await legacy.query("SELECT public.open_ena_consume_login_attempt('mixed-source','mixed-account',5,10,900) AS allowed");
      assert.equal(old.rows[0].allowed, true);
      const pid = (await current.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      pending = currentStore.reserveLoginAttempt({ sourceRef: "mixed-source", limit: 5, windowSeconds: 900 });
      const deadline = Date.now() + 2000;
      let waiting = false;
      while (Date.now() < deadline) {
        waiting = (await pool.query("SELECT wait_event_type='Lock' AS waiting FROM pg_stat_activity WHERE pid=$1", [pid])).rows[0]?.waiting;
        if (waiting) break;
        await delay(10);
      }
      assert.equal(waiting, true);
      await legacy.query("COMMIT");
      const admitted = await pending;
      assert.equal(admitted.allowed, true);
      assert.deepEqual(await counts(), [2], "both admitted attempts must remain counted");
      await currentStore.refundLoginAttempt(admitted.reservation);
      assert.deepEqual(await counts(), [1], "a new success must retain the old release's failure");
    } finally {
      await legacy.query("ROLLBACK");
      if (pending) await pending.catch(() => undefined);
      legacy.release();
      current.release();
    }
  });

  await check("disposable success refunds once and replay remains an unsuccessful attempt", async () => {
    await clearSources();
    const username = "synthetic-single-use";
    const password = "synthetic-single-use-password";
    const salt = Buffer.alloc(16, 7);
    const hash = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    await pool.query("INSERT INTO public.open_ena_disposable_accounts(username_ref,password_salt,password_hash,principal_ref,expires_at) VALUES($1,$2,$3,$4,clock_timestamp()+interval '5 minutes')", [openEnaDisposableUsernameRef(username, environment), salt, hash, `d_${"p".repeat(43)}`]);
    const first = await post(request({ username, password }));
    assert.equal(first.status, 303);
    assert.ok(first.headers.get("set-cookie"));
    assert.deepEqual(await counts(), [0]);
    const replay = await post(request({ username, password }));
    assert.equal(replay.status, 303);
    assert.equal(replay.headers.get("set-cookie"), null);
    assert.equal(new URL(replay.headers.get("location")).searchParams.get("auth"), "invalid");
    assert.deepEqual(await counts(), [1]);
  });

  await check("untrusted, absent and malformed source headers do not manufacture fresh sources", async () => {
    await clearSources();
    for (const source of [null, "invalid", "192.0.2.1, 192.0.2.2", ""]) {
      await post(request({ source, headers: { "x-forwarded-for": `198.51.100.${credentialChecks + 1}` } }));
    }
    assert.deepEqual(await counts(), [4]);
    const unconfigured = handler(store, { ...environment, OPEN_ENA_TRUSTED_CLIENT_IP_HEADER: undefined });
    for (let index = 0; index < 6; index++) await unconfigured(request({ source: `192.0.2.${index + 1}` }));
    assert.equal((await unconfigured(request({ correct: true, source: "192.0.2.99" }))).status, 429);
    assert.deepEqual(await counts(), [10]);
  });

  await check("an unavailable reservation function fails closed before checking credentials", async () => {
    await clearSources();
    await pool.query("ALTER FUNCTION public.open_ena_reserve_login_attempt_v2(text,integer,integer) RENAME TO temporarily_unavailable_reserve");
    try {
      const response = await post(request({ correct: true }));
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("set-cookie"), null);
      assert.equal(credentialChecks, 0);
    } finally {
      await pool.query("ALTER FUNCTION public.temporarily_unavailable_reserve(text,integer,integer) RENAME TO open_ena_reserve_login_attempt_v2");
    }
  });
} finally {
  await pool?.end();
  evidence.cleanup = await cleanupOwnedEphemeralPostgres({ rootDirectory, dataDirectory, rootPrefix: prefix, startAttempted });
  evidence.finishedAt = new Date().toISOString();
  writeFileSync(join(evidenceDirectory, "login-source-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
}
const failures = evidence.checks.filter(check => check.status === "FAIL");
console.log(`${evidence.checks.length - failures.length}/${evidence.checks.length} PostgreSQL login source checks passed`);
if (failures.length) process.exitCode = 1;
