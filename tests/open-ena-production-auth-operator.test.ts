import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHmac, scrypt as nodeScrypt } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { inspect } from "node:util";

const DATABASE_URL = "postgresql://operator:db-secret-value@same-db.invalid/open_ena";
const SESSION_SECRET = "operator-session-secret-value-that-must-never-leak";
const TARGET_ORIGIN = "https://production.example";
const MIGRATION_SQL = "-- migration 004 fixture\nSELECT 'fixture migration';\n";
const NOW_MILLISECONDS = 1_800_000_000_000;
const JTI = "123e4567-e89b-42d3-a456-426614174000";
const EXPECTED_FINAL_GIT_SHA = "a".repeat(40);
const DEPLOYMENT_ID = "dpl_openEnaFinalOperatorProof";

const environment = {
  NODE_ENV: "production",
  OPEN_ENA_AUTH_DATABASE_URL: DATABASE_URL,
  OPEN_ENA_BILLABLE_DATABASE_URL: DATABASE_URL,
  OPEN_ENA_PUBLIC_ORIGIN: TARGET_ORIGIN,
  OPEN_ENA_SESSION_SECRET: SESSION_SECRET,
  OPEN_ENA_USERNAME: "static-production-user-must-not-leak",
  OPEN_ENA_PASSWORD: "static-production-password-must-not-leak",
} as const;

function base64url(byte: number, length: number) {
  return Buffer.alloc(length, byte).toString("base64url");
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

test("proof mode completes the disposable-account auth ceremony without executing DDL", async () => {
  const operator = await import("../scripts/run-open-ena-production-auth-operator.mjs").catch(() => null);
  assert.ok(operator, "the Production auth operator module must exist");
  assert.equal(typeof operator.runOpenEnaProductionAuthOperator, "function");
  if (!operator || typeof operator.runOpenEnaProductionAuthOperator !== "function") return;

  const username = `ena-operator-${base64url(0x11, 24)}`;
  const password = base64url(0x22, 32);
  const salt = Buffer.alloc(16, 0x33);
  const principalRef = `d_${base64url(0x44, 32)}`;
  const usernameRef = createHmac("sha256", SESSION_SECRET)
    .update(`open-ena-disposable-username:${username}`, "utf8")
    .digest("base64url");
  const passwordHash = await scrypt(password, salt);
  const sessionPayload = `v3.1800000000.${JTI}.${principalRef}`;
  const sessionSignature = createHmac("sha256", SESSION_SECRET)
    .update(sessionPayload, "utf8")
    .digest("base64url");
  const sessionToken = `${sessionPayload}.${sessionSignature}`;
  const sessionCookie = `open-ena-session=${sessionToken}`;

  let randomCall = 0;
  const randomBytes = (length: number) => {
    randomCall += 1;
    const fill = [0x11, 0x22, 0x33, 0x44][randomCall - 1];
    assert.ok(fill, `unexpected randomBytes call ${randomCall}`);
    return Buffer.alloc(length, fill);
  };

  const queries: Array<{ sql: string; params: readonly unknown[] }> = [];
  let closed = false;
  const databaseFactory = async (databaseUrl: string) => {
    assert.equal(databaseUrl, DATABASE_URL);
    return {
      async query(sql: string, params: readonly unknown[] = []) {
        queries.push({ sql, params });
        if (/to_regclass/u.test(sql)) {
          return {
            rowCount: 1,
            rows: [{
              migration_001_tables: true,
              migration_001_function: true,
              migration_002_tables: true,
              migration_002_functions: true,
              migration_003_table: true,
              migration_003_function: true,
              migration_004_table: true,
              migration_004_function: true,
              migration_004_columns: true,
              migration_004_constraints: true,
              migration_004_index: true,
              migration_004_function_contract: true,
            }],
          };
        }
        if (/INSERT INTO open_ena_disposable_accounts/u.test(sql)) {
          return { rowCount: 1, rows: [{ inserted: true }] };
        }
        if (/open_ena_session_is_revoked/u.test(sql)) {
          assert.deepEqual(params, [JTI]);
          return {
            rowCount: 1,
            rows: [{ revoked: true, function_revoked: true, row_revoked: true }],
          };
        }
        if (/SELECT consumed_at IS NOT NULL AS consumed/u.test(sql)) {
          assert.deepEqual(params, [usernameRef]);
          return { rowCount: 1, rows: [{ consumed: true, disabled: false }] };
        }
        if (/UPDATE open_ena_disposable_accounts/u.test(sql)) {
          assert.deepEqual(params, [usernameRef]);
          return { rowCount: 1, rows: [{ disabled: true }] };
        }
        return { rowCount: null, rows: [] };
      },
      async close() {
        closed = true;
      },
    };
  };

  const requests: Array<{ body: string; cookie: string | null; method: string; url: string }> = [];
  const fetchImpl = async (input: URL | RequestInfo, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    const body = typeof init.body === "string" ? init.body : "";
    const cookie = headers.get("cookie");
    assert.ok(init.signal instanceof AbortSignal, "every Production request must be time-bounded");
    requests.push({ body, cookie, method, url });

    if (method === "GET" && cookie === null) {
      return new Response('<form class="open-ena-login-form"></form>', { status: 200 });
    }
    if (method === "POST" && url.endsWith("/api/open-ena/login")) {
      const submitted = new URLSearchParams(body);
      assert.equal(submitted.get("username"), username);
      assert.equal(submitted.get("password"), password);
      const secondAttempt = requests.filter((request) => (
        request.method === "POST" && request.url.endsWith("/api/open-ena/login")
      )).length === 2;
      if (secondAttempt) {
        return new Response(null, {
          status: 303,
          headers: {
            "cache-control": "no-store",
            location: `${TARGET_ORIGIN}/en/open-ena?auth=invalid`,
          },
        });
      }
      return new Response(null, {
        status: 303,
        headers: {
          "cache-control": "no-store",
          location: `${TARGET_ORIGIN}/en/open-ena`,
          "set-cookie": `${sessionCookie}; Path=/; Max-Age=900; HttpOnly; Secure; SameSite=Lax`,
        },
      });
    }
    if (method === "GET" && cookie === sessionCookie) {
      const replay = requests.filter((request) => (
        request.method === "GET" && request.cookie === sessionCookie
      )).length === 2;
      return new Response(
        replay
          ? '<form class="open-ena-login-form"></form>'
          : '<div class="open-ena-workbench"></div>',
        { status: 200, headers: { "cache-control": "private, no-cache, no-store" } },
      );
    }
    if (method === "POST" && url.endsWith("/api/open-ena/logout")) {
      assert.equal(cookie, sessionCookie);
      return new Response(null, {
        status: 303,
        headers: {
          "cache-control": "no-store",
          location: `${TARGET_ORIGIN}/en/open-ena`,
          "set-cookie": "open-ena-session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
        },
      });
    }
    throw new Error("unexpected request shape");
  };

  const receipt = await operator.runOpenEnaProductionAuthOperator({
    mode: "proof",
    environment,
    expectedFinalGitSha: EXPECTED_FINAL_GIT_SHA,
    deploymentId: DEPLOYMENT_ID,
    dependencies: {
      databaseFactory,
      fetch: fetchImpl,
      now: () => NOW_MILLISECONDS,
      randomBytes,
      sleep: async () => undefined,
    },
  });

  assert.equal(closed, true);
  assert.equal(randomCall, 4);
  assert.equal(receipt.schemaVersion, "open-ena.production-auth-operator.v1");
  assert.equal(receipt.status, "PASS");
  assert.equal(receipt.mode, "proof");
  assert.equal(receipt.evidenceLevel, "live-production-http-and-target-postgresql");
  assert.deepEqual(receipt.deploymentBinding, {
    expectedFinalGitSha: EXPECTED_FINAL_GIT_SHA,
    deploymentId: DEPLOYMENT_ID,
    controlPlaneBinding: "EXTERNAL_CROSS_CHECK_REQUIRED",
  });
  assert.equal(receipt.target.origin, TARGET_ORIGIN);
  assert.equal(receipt.databaseBinding.authAndBillableSecretsEqual, true);
  assert.equal(receipt.databaseBinding.allMigrationsPresentOnOneConnection, true);
  assert.equal(receipt.databaseBinding.migrationVerificationAndProvisioningSameConnection, true);
  assert.equal(receipt.databaseBinding.migrationAndProvisioningSameConnection, undefined);
  assert.equal(receipt.migration.id, "004_open_ena_disposable_accounts");
  assert.equal(receipt.migration.applied, false);
  assert.equal(receipt.migration.verifiedPresent, true);
  assert.equal(receipt.credentialCustody.rawValuesPersisted, false);
  assert.equal(receipt.credentialCustody.usernameEntropyBits, 192);
  assert.equal(receipt.credentialCustody.passwordEntropyBits, 256);
  assert.deepEqual(receipt.flow, {
    readinessStatus: 200,
    loginStatus: 303,
    loginNoStoreObserved: true,
    loginRedirectSameOrigin: true,
    secureCookieObserved: true,
    cookieHttpOnly: true,
    cookieSecure: true,
    cookieSameSite: "Lax",
    cookiePath: "/",
    cookieMaxAgeSeconds: 900,
    authenticatedRequestStatus: 200,
    authenticatedNoStoreObserved: true,
    workspaceObserved: true,
    logoutStatus: 303,
    logoutNoStoreObserved: true,
    logoutRedirectSameOrigin: true,
    logoutCookieCleared: true,
    logoutCookieSecurityObserved: true,
    durableRevocationObserved: true,
    durableRevocationFunctionObserved: true,
    durableRevocationRowObserved: true,
    oldTokenReplayStatus: 200,
    oldTokenReplayNoStoreObserved: true,
    oldTokenReplayRejected: true,
    secondLoginStatus: 303,
    secondLoginNoStoreObserved: true,
    secondLoginInvalidRedirectObserved: true,
    secondLoginRejected: true,
    accountConsumed: true,
    accountDisabled: true,
  });

  const insert = queries.find((query) => /INSERT INTO open_ena_disposable_accounts/u.test(query.sql));
  assert.ok(insert);
  assert.equal(insert.params[0], usernameRef);
  assert.deepEqual(insert.params[1], salt);
  assert.deepEqual(insert.params[2], passwordHash);
  assert.equal(insert.params[3], principalRef);
  assert.equal(insert.params.length, 4);
  assert.match(insert.sql, /clock_timestamp\(\)\s*\+\s*interval\s*'15 minutes'/u);
  assert.equal(queries.some((query) => query.sql === MIGRATION_SQL), false);
  assert.equal(queries.some((query) => /CREATE TABLE|CREATE OR REPLACE FUNCTION/iu.test(query.sql)), false);

  const serializedReceipt = JSON.stringify(receipt);
  for (const forbidden of [
    DATABASE_URL,
    SESSION_SECRET,
    username,
    password,
    salt.toString("hex"),
    salt.toString("base64url"),
    passwordHash.toString("hex"),
    passwordHash.toString("base64url"),
    usernameRef,
    principalRef,
    JTI,
    sessionToken,
    sessionCookie,
    environment.OPEN_ENA_USERNAME,
    environment.OPEN_ENA_PASSWORD,
  ]) {
    assert.equal(serializedReceipt.includes(forbidden), false, `receipt leaked ${forbidden}`);
  }
});

test("disposable session verifier binds HMAC, principal, issued time, and expiry", async () => {
  const operator = await import("../scripts/run-open-ena-production-auth-operator.mjs");
  assert.equal(typeof operator.verifyOperatorDisposableSessionToken, "function");
  if (typeof operator.verifyOperatorDisposableSessionToken !== "function") return;

  const principalRef = `d_${base64url(0x55, 32)}`;
  const payload = `v3.1800000000.${JTI}.${principalRef}`;
  const signature = createHmac("sha256", SESSION_SECRET)
    .update(payload, "utf8")
    .digest("base64url");
  const token = `${payload}.${signature}`;
  assert.deepEqual(operator.verifyOperatorDisposableSessionToken(
    token,
    principalRef,
    SESSION_SECRET,
    NOW_MILLISECONDS,
  ), {
    jti: JTI,
    expiresAtSeconds: 1_800_000_900,
  });
  assert.equal(operator.verifyOperatorDisposableSessionToken(
    `${payload}.${"x".repeat(43)}`,
    principalRef,
    SESSION_SECRET,
    NOW_MILLISECONDS,
  ), null);
  assert.equal(operator.verifyOperatorDisposableSessionToken(
    token,
    `d_${base64url(0x66, 32)}`,
    SESSION_SECRET,
    NOW_MILLISECONDS,
  ), null);
  assert.equal(operator.verifyOperatorDisposableSessionToken(
    token,
    principalRef,
    SESSION_SECRET,
    NOW_MILLISECONDS + 901_000,
  ), null);
});

test("a post-login failure revokes the issued session, disables the account, and drops raw causes", async () => {
  const operator = await import("../scripts/run-open-ena-production-auth-operator.mjs");
  const username = `ena-operator-${base64url(0x11, 24)}`;
  const password = base64url(0x22, 32);
  const principalRef = `d_${base64url(0x44, 32)}`;
  const usernameRef = createHmac("sha256", SESSION_SECRET)
    .update(`open-ena-disposable-username:${username}`, "utf8")
    .digest("base64url");
  const payload = `v3.1800000000.${JTI}.${principalRef}`;
  const signature = createHmac("sha256", SESSION_SECRET).update(payload, "utf8").digest("base64url");
  const token = `${payload}.${signature}`;
  const cookie = `open-ena-session=${token}`;
  let randomCall = 0;
  let closed = false;
  let disabled = false;
  let cleanupLogoutAttempted = false;
  let directRevocationAttempted = false;

  const databaseFactory = async () => ({
    async query(sql: string, params: readonly unknown[] = []) {
      if (/to_regclass/u.test(sql)) {
        return {
          rowCount: 1,
          rows: [{
            migration_001_tables: true,
            migration_001_function: true,
            migration_002_tables: true,
            migration_002_functions: true,
            migration_003_table: true,
            migration_003_function: true,
            migration_004_table: true,
            migration_004_function: true,
            migration_004_columns: true,
            migration_004_constraints: true,
            migration_004_index: true,
            migration_004_function_contract: true,
          }],
        };
      }
      if (/INSERT INTO open_ena_disposable_accounts/u.test(sql)) {
        return { rowCount: 1, rows: [{ inserted: true }] };
      }
      if (/open_ena_revoke_session/u.test(sql)) {
        directRevocationAttempted = true;
        assert.deepEqual(params, [JTI, 1_800_000_900]);
        return { rowCount: 1, rows: [{ revoked: true }] };
      }
      if (/UPDATE open_ena_disposable_accounts/u.test(sql)) {
        disabled = true;
        assert.deepEqual(params, [usernameRef]);
        return { rowCount: 1, rows: [{ disabled: true }] };
      }
      return { rowCount: null, rows: [] };
    },
    async close() { closed = true; },
  });
  const fetchImpl = async (input: URL | RequestInfo, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    if (method === "GET" && headers.get("cookie") === null) {
      return new Response("ready", { status: 200 });
    }
    if (method === "POST" && url.endsWith("/api/open-ena/login")) {
      return new Response(null, {
        status: 303,
        headers: {
          "cache-control": "no-store",
          location: `${TARGET_ORIGIN}/en/open-ena`,
          "set-cookie": `${cookie}; Path=/; Max-Age=900; HttpOnly; Secure; SameSite=Lax`,
        },
      });
    }
    if (method === "GET" && headers.get("cookie") === cookie) {
      throw new Error(`transport leaked ${DATABASE_URL} ${username} ${password} ${token}`);
    }
    if (method === "POST" && url.endsWith("/api/open-ena/logout")) {
      cleanupLogoutAttempted = true;
      return new Response(null, {
        status: 303,
        headers: {
          "cache-control": "no-store",
          location: `${TARGET_ORIGIN}/en/open-ena`,
          "set-cookie": "open-ena-session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
        },
      });
    }
    throw new Error("unexpected request");
  };

  let caught: unknown;
  try {
    await operator.runOpenEnaProductionAuthOperator({
      mode: "proof",
      environment,
      expectedFinalGitSha: EXPECTED_FINAL_GIT_SHA,
      deploymentId: DEPLOYMENT_ID,
      dependencies: {
        databaseFactory,
        fetch: fetchImpl,
        now: () => NOW_MILLISECONDS,
        randomBytes: (length: number) => {
          randomCall += 1;
          return Buffer.alloc(length, [0x11, 0x22, 0x33, 0x44][randomCall - 1]);
        },
        sleep: async () => undefined,
      },
    });
  } catch (error) {
    caught = error;
  }

  assert.ok(caught instanceof Error);
  assert.equal((caught as Error & { code?: string }).code, "AUTHENTICATED_REQUEST_FAILED");
  assert.equal(caught.message, "AUTHENTICATED_REQUEST_FAILED");
  assert.equal(cleanupLogoutAttempted, true);
  assert.equal(directRevocationAttempted, true);
  assert.equal(disabled, true);
  assert.equal(closed, true);
  const inspected = inspect(caught, { depth: 8 });
  for (const forbidden of [
    DATABASE_URL,
    SESSION_SECRET,
    username,
    password,
    usernameRef,
    principalRef,
    JTI,
    token,
    cookie,
  ]) assert.equal(inspected.includes(forbidden), false);
});

test("migration mode applies 004 transactionally without credentials, HTTP, or new-auth configuration", async () => {
  const operator = await import("../scripts/run-open-ena-production-auth-operator.mjs");
  const queries: string[] = [];
  let closed = false;
  const receipt = await operator.runOpenEnaProductionAuthOperator({
    mode: "migration",
    environment: {
      OPEN_ENA_AUTH_DATABASE_URL: DATABASE_URL,
      OPEN_ENA_BILLABLE_DATABASE_URL: DATABASE_URL,
    },
    migrationSql: MIGRATION_SQL,
    dependencies: {
      databaseFactory: async () => ({
        async query(sql: string) {
          queries.push(sql);
          if (/to_regclass/u.test(sql)) {
            return {
              rowCount: 1,
              rows: [{
                migration_001_tables: true,
                migration_001_function: true,
                migration_002_tables: true,
                migration_002_functions: true,
                migration_003_table: true,
                migration_003_function: true,
                migration_004_table: true,
                migration_004_function: true,
                migration_004_columns: true,
                migration_004_constraints: true,
                migration_004_index: true,
                migration_004_function_contract: true,
              }],
            };
          }
          return { rowCount: null, rows: [] };
        },
        async close() { closed = true; },
      }),
      fetch: async () => { throw new Error("migration mode must not use HTTP"); },
      now: () => NOW_MILLISECONDS,
      randomBytes: () => { throw new Error("migration mode must not generate credentials"); },
    },
  });

  assert.equal(closed, true);
  assert.equal(receipt.status, "PASS");
  assert.equal(receipt.mode, "migration");
  assert.equal(receipt.evidenceLevel, "target-postgresql-migration");
  assert.equal(receipt.migration.applied, true);
  for (const key of [
    "migration_004_columns",
    "migration_004_constraints",
    "migration_004_index",
    "migration_004_function_contract",
  ]) {
    assert.equal(receipt.migration.postconditions[key], true);
  }
  assert.equal(receipt.databaseBinding.authAndBillableSecretsEqual, true);
  assert.equal(receipt.databaseBinding.allMigrationsPresentOnOneConnection, true);
  assert.equal(receipt.databaseBinding.migrationExecutionAndVerificationSameConnection, true);
  assert.equal(receipt.databaseBinding.migrationAndProvisioningSameConnection, undefined);
  assert.deepEqual(queries.slice(0, 3), [
    "BEGIN",
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0)) AS locked",
    MIGRATION_SQL,
  ]);
  assert.match(queries[3], /to_regclass/u);
  assert.equal(queries[4], "COMMIT");
  assert.equal(queries.some((sql) => /INSERT INTO open_ena_disposable_accounts/u.test(sql)), false);
});

test("CLI emits one fixed-shape JSON failure receipt and never writes raw diagnostics", () => {
  const script = join(import.meta.dirname, "..", "scripts", "run-open-ena-production-auth-operator.mjs");
  const cliDatabaseUrl = "postgresql://cli-user:cli-password@cli-secret.invalid/open_ena";
  const cliSessionSecret = "cli-session-secret-that-must-not-appear-anywhere";
  const invalidOrigin = "http://private-production-origin.invalid";
  const result = spawnSync(process.execPath, [
    script,
    "--mode=proof",
    `--expected-final-git-sha=${EXPECTED_FINAL_GIT_SHA}`,
    `--deployment-id=${DEPLOYMENT_ID}`,
  ], {
    encoding: "utf8",
    env: {
      ...process.env,
      OPEN_ENA_AUTH_DATABASE_URL: cliDatabaseUrl,
      OPEN_ENA_BILLABLE_DATABASE_URL: cliDatabaseUrl,
      OPEN_ENA_PUBLIC_ORIGIN: invalidOrigin,
      OPEN_ENA_SESSION_SECRET: cliSessionSecret,
    },
  });

  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.endsWith("\n"), true);
  assert.equal(result.stdout.trim().split("\n").length, 1);
  const receipt = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(receipt).sort(), [
    "failureCode",
    "mode",
    "observedAt",
    "schemaVersion",
    "status",
  ]);
  assert.equal(receipt.schemaVersion, "open-ena.production-auth-operator.v1");
  assert.equal(receipt.status, "FAIL");
  assert.equal(receipt.mode, "proof");
  assert.equal(receipt.failureCode, "TARGET_ORIGIN_INVALID");
  for (const forbidden of [cliDatabaseUrl, cliSessionSecret, invalidOrigin]) {
    assert.equal(`${result.stdout}${result.stderr}`.includes(forbidden), false);
  }
});

test("failure receipt accepts only the operator's fixed error-code allowlist", async () => {
  const operator = await import("../scripts/run-open-ena-production-auth-operator.mjs");
  const attackerChosen = new operator.OperatorError("SENSITIVE_UPPERCASE_DIAGNOSTIC");
  const receipt = operator.createSafeOperatorFailureReceipt(
    attackerChosen,
    "proof",
    NOW_MILLISECONDS,
  );
  assert.equal(receipt.failureCode, "UNEXPECTED_FAILURE");
  assert.equal(JSON.stringify(receipt).includes("SENSITIVE_UPPERCASE_DIAGNOSTIC"), false);
});

test("operator source has no secret-bearing filesystem or diagnostic output path", () => {
  const source = readFileSync(
    new URL("../scripts/run-open-ena-production-auth-operator.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /\bconsole\.(?:log|error|warn|info|debug)\b/u);
  assert.doesNotMatch(source, /\b(?:writeFile|appendFile|createWriteStream|writeFileSync|appendFileSync)\b/u);
  assert.doesNotMatch(source, /process\.stderr/u);
  assert.match(source, /createSafeOperatorFailureReceipt/u);
  assert.match(source, /process\.stdout\.write\(JSON\.stringify\(receipt\) \+ "\\n"\)/u);
});
