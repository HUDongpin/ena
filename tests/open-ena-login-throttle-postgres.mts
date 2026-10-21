import assert from "node:assert/strict";
import { randomBytes, scrypt as nodeScrypt } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { openEnaDisposableUsernameRef } from "../lib/open-ena-auth.ts";
import {
  consumeDisposableCredentialOnQuery,
  createPostgresOpenEnaAuthSecurityStore,
  type OpenEnaLoginAuthenticationResult,
} from "../lib/server/open-ena-auth-security-store.ts";
import { createOpenEnaLoginPostHandler } from "../lib/server/open-ena-login-route.ts";
import {
  canonicalClientIp,
  openEnaLoginPairRef,
  openEnaLoginSourceRef,
  readTrustedClientAddress,
} from "../lib/server/open-ena-trusted-client-ip.ts";
import { cleanupOwnedEphemeralPostgres } from "./support/owned-ephemeral-postgres.mjs";

const { Pool } = createRequire(import.meta.url)("pg") as typeof import("pg");
const root = fileURLToPath(new URL("..", import.meta.url));
const prefix = "ena-login-throttle-";
const PAIR_LIMIT = 10;
const SOURCE_LIMIT = 50;
const WINDOW_SECONDS = 900;
const APP_ROLE = "open_ena_login_app";
const OUTSIDER_ROLE = "open_ena_login_outsider";

const environment = {
  OPEN_ENA_USERNAME: "researcher",
  OPEN_ENA_PASSWORD: "a-different-strong-passphrase",
  OPEN_ENA_SESSION_SECRET: "s".repeat(32),
  OPEN_ENA_ACCOUNT_ID: "stable-deployment-account-id",
  OPEN_ENA_AUTH_DATABASE_URL: "postgresql://synthetic.invalid/open_ena",
  OPEN_ENA_PUBLIC_ORIGIN: "https://www.ena.hk",
  OPEN_ENA_TRUSTED_CLIENT_IP_HEADER: "x-ena-client-ip",
} as const;

type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not allocate a loopback port."));
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function scrypt(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    nodeScrypt(password, salt, 32, {
      N: 16_384,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    }, (error, key) => {
      if (error) reject(error);
      else resolve(Buffer.from(key));
    });
  });
}

function decisionToken(kind: "owner" | "disposable" = "owner", principalRef: string | null = null) {
  return {
    outcome: "authenticated" as const,
    kind,
    principalRef,
    sessionToken: `session-${kind}`,
  };
}

async function countFor(admin: Queryable, scopeKind: "source" | "pair", scopeRef: string) {
  const result = await admin.query(
    "SELECT failure_count, window_start FROM open_ena_login_failure_windows WHERE scope_kind = $1 AND scope_ref = $2",
    [scopeKind, scopeRef],
  );
  return result.rows[0] as { failure_count: number; window_start: Date } | undefined;
}

function loginRequest(body: string, headers: Record<string, string> = {}) {
  return new Request("https://www.ena.hk/api/open-ena/login", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://www.ena.hk",
      ...headers,
    },
    body,
  });
}

async function main() {
  assert.equal(canonicalClientIp("203.0.113.10"), "203.0.113.10");
  assert.equal(canonicalClientIp(" 203.0.113.10 "), "203.0.113.10");
  assert.equal(canonicalClientIp("203.0.113.10, 198.51.100.4"), null);
  assert.equal(canonicalClientIp("::1"), "::1");
  assert.equal(canonicalClientIp("0:0:0:0:0:0:0:1"), "::1");
  assert.equal(canonicalClientIp("::ffff:203.0.113.8"), "203.0.113.8");
  assert.equal(canonicalClientIp("2001:0db8:0000:0000:0000:0000:0000:0001"), "2001:db8::1");
  assert.equal(readTrustedClientAddress(
    new Headers({ "x-forwarded-for": "203.0.113.10" }),
    environment,
  ).ok, false);
  const trusted = readTrustedClientAddress(new Headers({
    "x-forwarded-for": "198.51.100.4, 203.0.113.10",
    "x-ena-client-ip": "203.0.113.10",
  }), environment);
  assert.equal(trusted.ok && trusted.address, "203.0.113.10");
  const sourceA = openEnaLoginSourceRef("203.0.113.10", environment);
  const sourceB = openEnaLoginSourceRef("203.0.113.11", environment);
  assert.ok(sourceA && sourceB);
  const pairA = openEnaLoginPairRef("researcher", sourceA, environment);
  const pairCase = openEnaLoginPairRef("Researcher", sourceA, environment);
  assert.ok(pairA && pairCase);
  assert.match(sourceA, /^[A-Za-z0-9_-]{1,128}$/u);
  assert.notEqual(sourceA, sourceB);
  assert.notEqual(pairA, pairCase);
  assert.notEqual(openEnaLoginPairRef("researcher", sourceB, environment), pairA);
  console.log("PASS trusted address and case-preserving pair identity");

  const rootDirectory = mkdtempSync(join(tmpdir(), prefix));
  const dataDirectory = join(rootDirectory, "data");
  const port = await freePort();
  let startAttempted = false;
  let admin: InstanceType<typeof Pool> | undefined;
  let appPool: InstanceType<typeof Pool> | undefined;
  let outsiderPool: InstanceType<typeof Pool> | undefined;
  try {
    execFileSync("initdb", [
      "--pgdata", dataDirectory,
      "--auth", "trust",
      "--username", "postgres",
      "--encoding", "UTF8",
      "--no-locale",
    ], { stdio: "pipe", timeout: 60_000 });
    startAttempted = true;
    execFileSync("pg_ctl", [
      "--pgdata", dataDirectory,
      "--log", join(rootDirectory, "postgres.log"),
      "--options", `-h 127.0.0.1 -p ${port} -c unix_socket_directories=''`,
      "--wait",
      "start",
    ], { stdio: "pipe", timeout: 60_000 });
    admin = new Pool({
      host: "127.0.0.1",
      port,
      user: "postgres",
      database: "postgres",
      max: 4,
      connectionTimeoutMillis: 3_000,
      statement_timeout: 30_000,
    });
    for (const name of [
      "002_open_ena_auth_security.sql",
      "004_open_ena_disposable_accounts.sql",
      "008_open_ena_disposable_expiry_after_lock.sql",
    ]) {
      await admin.query(readFileSync(join(root, "migrations", name), "utf8"));
    }
    const legacyDigest = await admin.query(
      "SELECT md5(prosrc) AS digest, pg_get_functiondef(oid) AS definition FROM pg_proc WHERE oid = 'public.open_ena_consume_login_attempt(text,text,integer,integer,integer)'::regprocedure",
    );
    const migration = readFileSync(join(root, "migrations", "009_open_ena_login_failure_windows.sql"), "utf8");
    assert.doesNotMatch(migration, /DROP\s+TABLE/iu);
    assert.doesNotMatch(migration, /DELETE\s+FROM\s+open_ena_(?:auth_attempt_windows|revoked_sessions|disposable_accounts)/iu);
    assert.doesNotMatch(migration, /openena\b|openenadb\b/iu);
    await admin.query(migration);
    await admin.query(
      "INSERT INTO open_ena_auth_attempt_windows (scope_kind, scope_ref, window_start, attempt_count) VALUES ('account', 'legacy-account', clock_timestamp(), 3)",
    );
    await admin.query(migration);
    const legacyAfter = await admin.query(
      "SELECT md5(prosrc) AS digest, pg_get_functiondef(oid) AS definition FROM pg_proc WHERE oid = 'public.open_ena_consume_login_attempt(text,text,integer,integer,integer)'::regprocedure",
    );
    assert.equal(legacyAfter.rows[0]?.digest, legacyDigest.rows[0]?.digest);
    assert.equal(legacyAfter.rows[0]?.definition, legacyDigest.rows[0]?.definition);
    assert.equal((await admin.query(
      "SELECT attempt_count FROM open_ena_auth_attempt_windows WHERE scope_kind = 'account' AND scope_ref = 'legacy-account'",
    )).rows[0]?.attempt_count, 3);
    assert.equal((await admin.query(
      "SELECT open_ena_consume_login_attempt('legacy-src', 'legacy-acct', 5, 10, 900) AS allowed",
    )).rows[0]?.allowed, true);
    await admin.query("DELETE FROM open_ena_auth_attempt_windows WHERE scope_ref IN ('legacy-src', 'legacy-acct')");
    console.log("PASS migration 009 is additive and leaves the previous limiter callable");

    await admin.query(`
      CREATE ROLE ${APP_ROLE} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
      CREATE ROLE ${OUTSIDER_ROLE} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
      GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.open_ena_login_failure_windows TO ${APP_ROLE};
      GRANT EXECUTE ON FUNCTION public.open_ena_login_failure_guard(text, text, integer, integer, integer) TO ${APP_ROLE};
      GRANT EXECUTE ON FUNCTION public.open_ena_record_login_failure(text, text, integer, integer, integer) TO ${APP_ROLE};
      GRANT EXECUTE ON FUNCTION public.open_ena_clear_login_pair(text, text) TO ${APP_ROLE};
      GRANT EXECUTE ON FUNCTION public.open_ena_prune_login_failure_windows(integer) TO ${APP_ROLE};
      GRANT SELECT, UPDATE ON TABLE public.open_ena_disposable_accounts TO ${APP_ROLE};
      GRANT EXECUTE ON FUNCTION public.open_ena_consume_disposable_account(text, bytea) TO ${APP_ROLE};
      CREATE TABLE public.open_ena_privilege_probe (id integer);
    `);
    const privileges = await admin.query(
      "SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = $1",
      [APP_ROLE],
    );
    assert.equal(privileges.rows[0]?.rolsuper, false);
    assert.equal(privileges.rows[0]?.rolcreatedb, false);
    assert.equal(privileges.rows[0]?.rolcreaterole, false);
    appPool = new Pool({
      host: "127.0.0.1",
      port,
      user: APP_ROLE,
      database: "postgres",
      max: 2,
      connectionTimeoutMillis: 3_000,
      statement_timeout: 15_000,
    });
    outsiderPool = new Pool({
      host: "127.0.0.1",
      port,
      user: OUTSIDER_ROLE,
      database: "postgres",
      max: 1,
      connectionTimeoutMillis: 3_000,
    });
    await assert.rejects(
      () => outsiderPool.query("SELECT blocked FROM open_ena_login_failure_guard('a', 'b', 50, 10, 900)"),
      (error: { code?: string }) => error.code === "42501",
    );
    await assert.rejects(
      () => outsiderPool.query("SELECT id FROM open_ena_privilege_probe"),
      (error: { code?: string }) => error.code === "42501",
    );
    console.log("PASS non-superuser app role is limited to the granted login objects");

    const store = createPostgresOpenEnaAuthSecurityStore(
      async (sql, params) => {
        const result = await appPool!.query(sql, params as unknown[]);
        return { rows: result.rows as Array<Record<string, unknown>> };
      },
      { connect: () => appPool!.connect() },
    );
    async function fail(sourceRef: string, pairRef: string) {
      let called = 0;
      const result = await store.authenticateLogin({
        sourceRef,
        pairRef,
        sourceLimit: SOURCE_LIMIT,
        pairLimit: PAIR_LIMIT,
        windowSeconds: WINDOW_SECONDS,
        authenticate: async () => {
          called += 1;
          return { outcome: "invalid" };
        },
      });
      return { result, called };
    }

    for (let index = 0; index < PAIR_LIMIT; index += 1) {
      const attempt = await fail("pair-source", "pair-user");
      assert.equal(attempt.result.outcome, "invalid");
      assert.equal(attempt.called, 1);
    }
    const eleventh = await fail("pair-source", "pair-user");
    assert.equal(eleventh.result.outcome, "blocked");
    assert.equal(eleventh.called, 0);
    if (eleventh.result.outcome === "blocked") assert.equal(eleventh.result.blockingScope, "pair");
    assert.equal((await countFor(admin, "pair", "pair-user"))?.failure_count, PAIR_LIMIT);
    const blockedAgain = await fail("pair-source", "pair-user");
    assert.equal(blockedAgain.called, 0);
    assert.equal((await countFor(admin, "pair", "pair-user"))?.failure_count, PAIR_LIMIT);
    console.log("PASS ten pair failures block the eleventh without another verification");

    const otherSource = await store.authenticateLogin({
      sourceRef: "other-source",
      pairRef: "other-pair",
      sourceLimit: SOURCE_LIMIT,
      pairLimit: PAIR_LIMIT,
      windowSeconds: WINDOW_SECONDS,
      authenticate: async () => decisionToken(),
    });
    assert.equal(otherSource.outcome, "authenticated");
    assert.equal((await countFor(admin, "pair", "pair-user"))?.failure_count, PAIR_LIMIT);
    assert.equal(await countFor(admin, "pair", "other-pair"), undefined);
    console.log("PASS a blocked source does not block a different source");

    await admin.query("DELETE FROM open_ena_login_failure_windows");
    for (let index = 0; index < SOURCE_LIMIT; index += 1) {
      const attempt = await fail("cycle-source", `cycle-pair-${index}`);
      assert.equal(attempt.result.outcome, "invalid");
      assert.equal(attempt.called, 1);
    }
    const cycled = await fail("cycle-source", "cycle-pair-new");
    assert.equal(cycled.result.outcome, "blocked");
    assert.equal(cycled.called, 0);
    if (cycled.result.outcome === "blocked") assert.equal(cycled.result.blockingScope, "source");
    assert.equal((await countFor(admin, "source", "cycle-source"))?.failure_count, SOURCE_LIMIT);
    assert.equal(await countFor(admin, "pair", "cycle-pair-new"), undefined);
    const unrelatedCycle = await fail("cycle-source-b", "cycle-pair-new");
    assert.equal(unrelatedCycle.result.outcome, "invalid");
    assert.equal(unrelatedCycle.called, 1);
    console.log("PASS fifty username failures block only that source");

    await admin.query("DELETE FROM open_ena_login_failure_windows");
    for (let index = 0; index < 3; index += 1) await fail("reset-source", "reset-a");
    for (let index = 0; index < 4; index += 1) await fail("reset-source", "reset-b");
    let successCalls = 0;
    const success = await store.authenticateLogin({
      sourceRef: "reset-source",
      pairRef: "reset-a",
      sourceLimit: SOURCE_LIMIT,
      pairLimit: PAIR_LIMIT,
      windowSeconds: WINDOW_SECONDS,
      authenticate: async () => {
        successCalls += 1;
        return decisionToken();
      },
    });
    assert.equal(success.outcome, "authenticated");
    assert.equal(successCalls, 1);
    assert.equal(await countFor(admin, "pair", "reset-a"), undefined);
    assert.equal((await countFor(admin, "pair", "reset-b"))?.failure_count, 4);
    assert.equal((await countFor(admin, "source", "reset-source"))?.failure_count, 7);
    console.log("PASS success clears only the authenticated pair");

    await admin.query("DELETE FROM open_ena_login_failure_windows");
    let repeatedSuccess = 0;
    for (let index = 0; index < 11; index += 1) {
      const result = await store.authenticateLogin({
        sourceRef: "success-source",
        pairRef: "success-pair",
        sourceLimit: SOURCE_LIMIT,
        pairLimit: PAIR_LIMIT,
        windowSeconds: WINDOW_SECONDS,
        authenticate: async () => {
          repeatedSuccess += 1;
          return decisionToken();
        },
      });
      assert.equal(result.outcome, "authenticated");
    }
    assert.equal(repeatedSuccess, 11);
    assert.equal((await admin.query("SELECT count(*)::int AS count FROM open_ena_login_failure_windows")).rows[0]?.count, 0);
    console.log("PASS repeated successes do not consume failure allowance");

    await admin.query("DELETE FROM open_ena_login_failure_windows");
    await admin.query(
      "INSERT INTO open_ena_login_failure_windows (scope_kind, scope_ref, window_start, failure_count) VALUES ('pair', 'elapsed-pair', clock_timestamp() - interval '840 seconds', 10), ('source', 'elapsed-source', clock_timestamp() - interval '100 seconds', 4)",
    );
    const beforeElapsed = await countFor(admin, "pair", "elapsed-pair");
    const elapsed = await fail("elapsed-source", "elapsed-pair");
    assert.equal(elapsed.called, 0);
    assert.equal(elapsed.result.outcome, "blocked");
    if (elapsed.result.outcome !== "blocked") throw new Error("expected the elapsed pair to block");
    const databaseRetry = Number((await admin.query(
      "SELECT GREATEST(1, CEIL(EXTRACT(EPOCH FROM (window_start + make_interval(secs => $2) - clock_timestamp()))))::int AS retry FROM open_ena_login_failure_windows WHERE scope_kind = 'pair' AND scope_ref = $1",
      ["elapsed-pair", WINDOW_SECONDS],
    )).rows[0]?.retry);
    assert.ok(databaseRetry >= 50 && databaseRetry <= 70, `expected about 60 seconds, got ${databaseRetry}`);
    assert.ok(Math.abs(elapsed.result.retryAfterSeconds - databaseRetry) <= 2);
    assert.notEqual(elapsed.result.retryAfterSeconds, WINDOW_SECONDS);
    const afterElapsed = await countFor(admin, "pair", "elapsed-pair");
    assert.equal(afterElapsed?.failure_count, 10);
    assert.equal(new Date(afterElapsed!.window_start).getTime(), new Date(beforeElapsed!.window_start).getTime());
    assert.equal((await countFor(admin, "source", "elapsed-source"))?.failure_count, 4);
    const secondElapsed = await fail("elapsed-source", "elapsed-pair");
    if (secondElapsed.result.outcome !== "blocked") throw new Error("expected the repeated block to stay blocked");
    assert.ok(secondElapsed.result.retryAfterSeconds <= elapsed.result.retryAfterSeconds);
    assert.equal(
      new Date((await countFor(admin, "pair", "elapsed-pair"))!.window_start).getTime(),
      new Date(beforeElapsed!.window_start).getTime(),
    );
    console.log("PASS blocked attempts report the remaining window and do not extend it");

    await admin.query("DELETE FROM open_ena_login_failure_windows");
    const sleeper = await admin.connect();
    try {
      await sleeper.query("BEGIN");
      await sleeper.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('open_ena_login_source:' || $1, 0))",
        ["lock-wait-source"],
      );
      await admin.query(
        "INSERT INTO open_ena_login_failure_windows (scope_kind, scope_ref, window_start, failure_count) VALUES ('pair', 'lock-wait-pair', clock_timestamp() - interval '897 seconds', 10)",
      );
      let lockCalls = 0;
      const pending = store.authenticateLogin({
        sourceRef: "lock-wait-source",
        pairRef: "lock-wait-pair",
        sourceLimit: SOURCE_LIMIT,
        pairLimit: PAIR_LIMIT,
        windowSeconds: WINDOW_SECONDS,
        authenticate: async () => {
          lockCalls += 1;
          return { outcome: "invalid" };
        },
      });
      await sleeper.query("SELECT pg_sleep(4)");
      await sleeper.query("COMMIT");
      const waited = await pending;
      assert.equal(lockCalls, 1);
      assert.equal(waited.outcome, "invalid");
      assert.equal((await countFor(admin, "pair", "lock-wait-pair"))?.failure_count, 1);
    } finally {
      await sleeper.query("ROLLBACK").catch(() => undefined);
      sleeper.release();
    }
    console.log("PASS database time is read after the source lock, so a wait can expire the window");

    await admin.query("DELETE FROM open_ena_login_failure_windows");
    let thrownCalls = 0;
    await assert.rejects(
      () => store.authenticateLogin({
        sourceRef: "rollback-source",
        pairRef: "rollback-pair",
        sourceLimit: SOURCE_LIMIT,
        pairLimit: PAIR_LIMIT,
        windowSeconds: WINDOW_SECONDS,
        authenticate: async ({ query }) => {
          thrownCalls += 1;
          await query(
            "INSERT INTO open_ena_login_failure_windows (scope_kind, scope_ref, window_start, failure_count) VALUES ('account', 'bad', clock_timestamp(), 1)",
          );
          return { outcome: "invalid" };
        },
      }),
      /Durable login throttle store is unavailable/u,
    );
    assert.equal(thrownCalls, 1);
    assert.equal((await admin.query("SELECT count(*)::int AS count FROM open_ena_login_failure_windows")).rows[0]?.count, 0);
    const recovered = await fail("rollback-source", "rollback-pair");
    assert.equal(recovered.result.outcome, "invalid");
    assert.equal(recovered.called, 1);
    assert.equal((await countFor(admin, "pair", "rollback-pair"))?.failure_count, 1);
    console.log("PASS a callback or database failure rolls back and releases the client");

    await admin.query("DELETE FROM open_ena_login_failure_windows");
    let concurrentCalls = 0;
    const concurrent = await Promise.race([
      Promise.all(Array.from({ length: 20 }, () => store.authenticateLogin({
        sourceRef: "concurrent-source",
        pairRef: "concurrent-pair",
        sourceLimit: SOURCE_LIMIT,
        pairLimit: PAIR_LIMIT,
        windowSeconds: WINDOW_SECONDS,
        authenticate: async () => {
          concurrentCalls += 1;
          return { outcome: "invalid" };
        },
      }))),
      new Promise<OpenEnaLoginAuthenticationResult[]>((_resolve, reject) => {
        setTimeout(() => reject(new Error("concurrent login attempts did not finish")), 15_000);
      }),
    ]);
    assert.equal(concurrentCalls, PAIR_LIMIT);
    assert.equal(concurrent.filter((result) => result.outcome === "invalid").length, PAIR_LIMIT);
    assert.equal(concurrent.filter((result) => result.outcome === "blocked").length, 10);
    assert.equal((await countFor(admin, "pair", "concurrent-pair"))?.failure_count, PAIR_LIMIT);
    console.log("PASS twenty parallel attempts on a two-connection pool stop at ten verifications");

    const password = "one-time-disposable-password";
    const salt = randomBytes(16);
    const passwordHash = await scrypt(password, salt);
    async function seedDisposable(name: string) {
      const usernameRef = openEnaDisposableUsernameRef(name, environment);
      assert.ok(usernameRef);
      const principalRef = `d_${usernameRef}`;
      await admin!.query(
        "INSERT INTO open_ena_disposable_accounts (username_ref, password_salt, password_hash, principal_ref, expires_at) VALUES ($1, $2, $3, $4, clock_timestamp() + interval '15 minutes')",
        [usernameRef, salt, passwordHash, principalRef],
      );
      return { usernameRef, principalRef };
    }
    const firstDisposable = await seedDisposable("disposable-one");
    const secondDisposable = await seedDisposable("disposable-two");
    async function disposableLogin(sourceRef: string, pairRef: string, usernameRef: string) {
      return store.authenticateLogin({
        sourceRef,
        pairRef,
        sourceLimit: SOURCE_LIMIT,
        pairLimit: PAIR_LIMIT,
        windowSeconds: WINDOW_SECONDS,
        authenticate: async ({ query }) => {
          const backend = await query("SELECT pg_backend_pid() AS pid");
          const principalRef = await consumeDisposableCredentialOnQuery(query, { usernameRef, password });
          const sameBackend = await query("SELECT pg_backend_pid() AS pid");
          assert.equal(sameBackend.rows[0]?.pid, backend.rows[0]?.pid);
          if (!principalRef) return { outcome: "invalid" as const };
          return decisionToken("disposable", principalRef);
        },
      });
    }
    const disposableResults = await Promise.race([
      Promise.all([
        disposableLogin("disp-source-a", "disp-pair-a", firstDisposable.usernameRef),
        disposableLogin("disp-source-b", "disp-pair-b", secondDisposable.usernameRef),
      ]),
      new Promise<OpenEnaLoginAuthenticationResult[]>((_resolve, reject) => {
        setTimeout(() => reject(new Error("disposable logins deadlocked on the two-connection pool")), 20_000);
      }),
    ]);
    assert.deepEqual(disposableResults.map((result) => result.outcome).sort(), ["authenticated", "authenticated"]);
    assert.equal((await admin.query(
      "SELECT count(*)::int AS count FROM open_ena_disposable_accounts WHERE consumed_at IS NOT NULL AND username_ref = ANY($1::text[])",
      [[firstDisposable.usernameRef, secondDisposable.usernameRef]],
    )).rows[0]?.count, 2);
    assert.equal((await disposableLogin("disp-source-a", "disp-pair-a", firstDisposable.usernameRef)).outcome, "invalid");
    console.log("PASS disposable consume uses the checked-out client and stays single-use");

    await admin.query("DELETE FROM open_ena_login_failure_windows");
    const handler = createOpenEnaLoginPostHandler({
      environment,
      securityStoreFactory: async () => store,
      verifyCredentials: () => false,
      createSessionToken: () => "owner-session",
      createDisposableSessionToken: () => "disposable-session",
    });
    const missingAttribution = await handler(loginRequest(
      "locale=zh-hans&username=researcher&password=wrong-password",
      { "x-forwarded-for": "203.0.113.77" },
    ));
    assert.equal(missingAttribution.status, 403);
    assert.equal(missingAttribution.headers.get("cache-control"), "no-store");
    assert.equal((await admin.query("SELECT count(*)::int AS count FROM open_ena_login_failure_windows")).rows[0]?.count, 0);
    const attributedSource = openEnaLoginSourceRef("203.0.113.40", environment);
    const attributedPair = openEnaLoginPairRef("researcher", attributedSource!, environment);
    assert.ok(attributedSource && attributedPair);
    for (let index = 0; index < PAIR_LIMIT; index += 1) {
      const response = await handler(loginRequest(
        "locale=en&username=researcher&password=wrong-password",
        {
          "x-ena-client-ip": "203.0.113.40",
          "x-forwarded-for": `198.51.100.${index}`,
        },
      ));
      assert.equal(response.status, 303);
    }
    const throttled = await handler(loginRequest(
      "locale=en&username=researcher&password=correct-looking-password",
      {
        "x-ena-client-ip": "203.0.113.40",
        "x-forwarded-for": "198.51.100.99",
      },
    ));
    assert.equal(throttled.status, 429);
    assert.equal(throttled.headers.get("cache-control"), "no-store");
    const routeRetry = Number(throttled.headers.get("retry-after"));
    const routeExpected = Number((await admin.query(
      "SELECT GREATEST(1, CEIL(EXTRACT(EPOCH FROM (window_start + make_interval(secs => $2) - clock_timestamp()))))::int AS retry FROM open_ena_login_failure_windows WHERE scope_kind = 'pair' AND scope_ref = $1",
      [attributedPair, WINDOW_SECONDS],
    )).rows[0]?.retry);
    assert.ok(Math.abs(routeRetry - routeExpected) <= 2);
    assert.equal((await countFor(admin, "pair", attributedPair))?.failure_count, PAIR_LIMIT);
    const ownerHandler = createOpenEnaLoginPostHandler({
      environment,
      securityStoreFactory: async () => store,
      verifyCredentials: (username, suppliedPassword) => (
        username === environment.OPEN_ENA_USERNAME && suppliedPassword === environment.OPEN_ENA_PASSWORD
      ),
      createSessionToken: () => "owner-session",
    });
    const ownerLogin = await ownerHandler(loginRequest(
      `locale=zh-hant&username=${encodeURIComponent(environment.OPEN_ENA_USERNAME)}&password=${encodeURIComponent(environment.OPEN_ENA_PASSWORD)}`,
      { "x-ena-client-ip": "203.0.113.41" },
    ));
    assert.equal(ownerLogin.status, 303);
    assert.match(ownerLogin.headers.get("set-cookie") ?? "", /owner-session/u);
    assert.equal(ownerLogin.headers.get("location"), "https://www.ena.hk/zh-hant/open-ena");
    const ownerSource = openEnaLoginSourceRef("203.0.113.41", environment);
    const ownerPair = openEnaLoginPairRef(environment.OPEN_ENA_USERNAME, ownerSource!, environment);
    assert.equal(await countFor(admin, "pair", ownerPair!), undefined);
    console.log("PASS login route uses the guarded transaction, trusted address, and real Retry-After");

    const crashes: unknown[] = [];
    const onCrash = (error: unknown) => { crashes.push(error); };
    process.on("uncaughtException", onCrash);
    process.on("unhandledRejection", onCrash);
    try {
      await assert.rejects(
        () => store.authenticateLogin({
          sourceRef: "killed-source",
          pairRef: "killed-pair",
          sourceLimit: SOURCE_LIMIT,
          pairLimit: PAIR_LIMIT,
          windowSeconds: WINDOW_SECONDS,
          authenticate: async ({ query }) => {
            const backend = await query("SELECT pg_backend_pid() AS pid");
            const pid = Number(backend.rows[0]?.pid);
            assert.ok(Number.isInteger(pid) && pid > 0);
            await admin!.query("SELECT pg_terminate_backend($1::int)", [pid]);
            await new Promise((resolve) => setTimeout(resolve, 300));
            return decisionToken();
          },
        }),
        /Durable login throttle store is unavailable/u,
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.equal(crashes.length, 0, "a checked-out backend failure must not crash the process");
      const healthy = await fail("killed-source-next", "killed-pair-next");
      assert.equal(healthy.result.outcome, "invalid");
      assert.equal(healthy.called, 1);
      const stillLocked = await admin.query(
        "SELECT count(*)::int AS count FROM pg_locks WHERE locktype = 'advisory' AND granted AND pid = ANY (SELECT pid FROM pg_stat_activity WHERE usename = $1)",
        [APP_ROLE],
      );
      assert.equal(stillLocked.rows[0]?.count, 0);
    } finally {
      process.removeListener("uncaughtException", onCrash);
      process.removeListener("unhandledRejection", onCrash);
    }
    console.log("PASS a terminated login backend is contained and the next login still works");

    await admin.query("DELETE FROM open_ena_login_failure_windows");
    await admin.query(
      "INSERT INTO open_ena_login_failure_windows (scope_kind, scope_ref, window_start, failure_count) VALUES ('pair', 'stale-pair', clock_timestamp() - interval '8 days', 4), ('source', 'stale-source', clock_timestamp() - interval '8 days', 9), ('pair', 'active-pair', clock_timestamp() - interval '1 hour', 2), ('pair', 'locked-stale', clock_timestamp() - interval '9 days', 1), ('source', 'unlocked-stale', clock_timestamp() - interval '9 days', 1)",
    );
    await admin.query(
      "INSERT INTO open_ena_auth_attempt_windows (scope_kind, scope_ref, window_start, attempt_count) VALUES ('account', 'legacy-keep', clock_timestamp() - interval '8 days', 6) ON CONFLICT (scope_kind, scope_ref) DO UPDATE SET attempt_count = EXCLUDED.attempt_count",
    );
    const locker = await admin.connect();
    try {
      await locker.query("BEGIN");
      await locker.query(
        "SELECT scope_ref FROM open_ena_login_failure_windows WHERE scope_ref = 'locked-stale' FOR UPDATE",
      );
      const pruned = await fail("prune-source", "prune-pair");
      assert.equal(pruned.result.outcome, "invalid");
      assert.equal(await countFor(admin, "pair", "stale-pair"), undefined);
      assert.equal(await countFor(admin, "source", "stale-source"), undefined);
      assert.equal(await countFor(admin, "source", "unlocked-stale"), undefined);
      assert.equal((await countFor(admin, "pair", "active-pair"))?.failure_count, 2);
      assert.equal((await countFor(admin, "pair", "locked-stale"))?.failure_count, 1);
      assert.equal((await countFor(admin, "pair", "prune-pair"))?.failure_count, 1);
      assert.equal((await admin.query(
        "SELECT attempt_count FROM open_ena_auth_attempt_windows WHERE scope_kind = 'account' AND scope_ref = 'legacy-keep'",
      )).rows[0]?.attempt_count, 6);
    } finally {
      await locker.query("ROLLBACK").catch(() => undefined);
      locker.release();
    }
    const secondPrune = await fail("prune-source-2", "prune-pair-2");
    assert.equal(secondPrune.result.outcome, "invalid");
    assert.equal(await countFor(admin, "pair", "locked-stale"), undefined);
    assert.equal((await countFor(admin, "pair", "active-pair"))?.failure_count, 2);
    console.log("PASS obsolete failure windows are pruned without touching active or legacy rows");

    await admin.query(`REVOKE EXECUTE ON FUNCTION public.open_ena_prune_login_failure_windows(integer) FROM ${APP_ROLE}`);
    const cleanupFailed = await store.authenticateLogin({
      sourceRef: "cleanup-fail-source",
      pairRef: "cleanup-fail-pair",
      sourceLimit: SOURCE_LIMIT,
      pairLimit: PAIR_LIMIT,
      windowSeconds: WINDOW_SECONDS,
      authenticate: async () => decisionToken(),
    });
    assert.equal(cleanupFailed.outcome, "authenticated");
    if (cleanupFailed.outcome === "authenticated") assert.equal(cleanupFailed.sessionToken, "session-owner");
    await admin.query(`GRANT EXECUTE ON FUNCTION public.open_ena_prune_login_failure_windows(integer) TO ${APP_ROLE}`);
    console.log("PASS a post-commit retention failure still returns the successful login");
  } finally {
    await outsiderPool?.end().catch(() => undefined);
    await appPool?.end().catch(() => undefined);
    await admin?.end().catch(() => undefined);
    const cleanup = await cleanupOwnedEphemeralPostgres({
      rootDirectory,
      dataDirectory,
      rootPrefix: prefix,
      startAttempted,
    });
    assert.equal(cleanup.forcedTermination, false);
  }
}

main().then(() => {
  console.log("RESULT pass");
}).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
