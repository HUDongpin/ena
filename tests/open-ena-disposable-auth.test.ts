import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { scrypt as nodeScrypt } from "node:crypto";
import test from "node:test";

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

const AUTH_ENVIRONMENT = {
  OPEN_ENA_USERNAME: "researcher",
  OPEN_ENA_PASSWORD: "a-different-strong-passphrase",
  OPEN_ENA_SESSION_SECRET: "s".repeat(32),
  OPEN_ENA_ACCOUNT_ID: "stable-deployment-account-id",
  OPEN_ENA_AUTH_DATABASE_URL: "postgresql://security.invalid/open_ena",
  OPEN_ENA_ALLOWED_ORIGINS: "https://www.ena.hk,https://ena.hk",
} as const;

type DynamicModule = Record<string, unknown>;

async function dynamicModule(relativePath: string): Promise<DynamicModule | null> {
  try {
    return await import(relativePath) as DynamicModule;
  } catch {
    return null;
  }
}

function formRequest(username: string, password: string) {
  return new Request("https://www.ena.hk/api/open-ena/login", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://www.ena.hk",
    },
    body: new URLSearchParams({ locale: "en", username, password }),
  });
}

test("disposable username references are stable secret-keyed HMACs and never raw usernames", async () => {
  const auth = await dynamicModule("../lib/open-ena-auth");
  assert.ok(auth);
  const derive = auth.openEnaDisposableUsernameRef;
  assert.equal(typeof derive, "function");
  if (typeof derive !== "function") return;

  const first = (derive as Function)("  one-time-user  ", AUTH_ENVIRONMENT);
  const repeated = (derive as Function)("one-time-user", AUTH_ENVIRONMENT);
  const different = (derive as Function)("another-user", AUTH_ENVIRONMENT);
  assert.match(first, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(first, repeated);
  assert.notEqual(first, different);
  assert.notEqual(first, "one-time-user");
  assert.equal((derive as Function)("one-time-user", {
    ...AUTH_ENVIRONMENT,
    OPEN_ENA_SESSION_SECRET: "too-short",
  }), null);
  assert.equal((derive as Function)("", AUTH_ENVIRONMENT), null);
  assert.equal((derive as Function)("u".repeat(255), AUTH_ENVIRONMENT), null);
});

test("v3 sessions carry a signed disposable principal without weakening static v2 account rotation", async () => {
  const auth = await dynamicModule("../lib/open-ena-auth");
  assert.ok(auth);
  const createV3 = auth.createOpenEnaSessionTokenV3;
  const verifyAny = auth.verifyOpenEnaSessionTokenAny;
  const createV2 = auth.createOpenEnaSessionTokenV2;
  const verifyV2 = auth.verifyOpenEnaSessionTokenV2;
  assert.equal(typeof createV3, "function");
  assert.equal(typeof verifyAny, "function");
  assert.equal(typeof createV2, "function");
  assert.equal(typeof verifyV2, "function");
  if (
    typeof createV3 !== "function"
    || typeof verifyAny !== "function"
    || typeof createV2 !== "function"
    || typeof verifyV2 !== "function"
  ) return;

  const disposablePrincipal = `d_${"A".repeat(43)}`;
  const issuedAt = 1_800_000_000_000;
  const token = (createV3 as (
    issuedAtMilliseconds: number,
    environment: DynamicModule,
    principalRef: string,
  ) => string)(issuedAt, AUTH_ENVIRONMENT, disposablePrincipal);
  const verified = (verifyAny as (
    token: string,
    nowMilliseconds: number,
    environment: DynamicModule,
  ) => { principalRef: string; issuedAtSeconds: number; expiresAtSeconds: number } | null)(token, issuedAt + 1_000, {
    ...AUTH_ENVIRONMENT,
    OPEN_ENA_ACCOUNT_ID: "rotated-static-account-id",
  });

  assert.equal(verified?.principalRef, disposablePrincipal);
  assert.equal(
    (verified?.expiresAtSeconds ?? 0) - (verified?.issuedAtSeconds ?? 0),
    15 * 60,
    "a disposable session should expire quickly even though static sessions last 12 hours",
  );
  assert.throws(
    () => (createV3 as Function)(issuedAt, AUTH_ENVIRONMENT, "not-a-disposable-principal"),
    /disposable principal/i,
  );

  const staticToken = (createV2 as Function)(issuedAt, AUTH_ENVIRONMENT);
  assert.equal((verifyV2 as Function)(staticToken, issuedAt + 1_000, {
    ...AUTH_ENVIRONMENT,
    OPEN_ENA_ACCOUNT_ID: "rotated-static-account-id",
  }), null);
});

test("PostgreSQL store verifies a scrypt password and atomically consumes one disposable account", async () => {
  const storeModule = await dynamicModule("../lib/server/open-ena-auth-security-store");
  assert.ok(storeModule);
  const createStore = storeModule.createPostgresOpenEnaAuthSecurityStore;
  assert.equal(typeof createStore, "function");
  if (typeof createStore !== "function") return;

  const password = "one-time-test-password-with-entropy";
  const salt = Buffer.from("00112233445566778899aabbccddeeff", "hex");
  const passwordHash = await scrypt(password, salt);
  const usernameRef = "u".repeat(43);
  const principalRef = `d_${"p".repeat(43)}`;
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const store = (createStore as Function)(async (sql: string, params: readonly unknown[] = []) => {
    calls.push({ sql, params });
    if (/SELECT password_salt, password_hash/u.test(sql)) {
      return { rows: [{ password_salt: salt, password_hash: passwordHash }] };
    }
    if (/open_ena_consume_disposable_account/u.test(sql)) {
      return { rows: [{ principal_ref: principalRef }] };
    }
    throw new Error("unexpected SQL");
  });

  const consumed = await store.consumeDisposableCredential({ usernameRef, password });

  assert.equal(consumed, principalRef);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].params, [usernameRef]);
  assert.equal(calls[1].params[0], usernameRef);
  assert.ok(Buffer.isBuffer(calls[1].params[1]));
  assert.equal(calls.flatMap((call) => call.params).includes(password), false);
});

test("wrong, expired, or already-consumed disposable credentials do not issue a principal", async () => {
  const storeModule = await dynamicModule("../lib/server/open-ena-auth-security-store");
  assert.ok(storeModule);
  const createStore = storeModule.createPostgresOpenEnaAuthSecurityStore;
  assert.equal(typeof createStore, "function");
  if (typeof createStore !== "function") return;

  const salt = Buffer.alloc(16, 7);
  const expected = await scrypt("expected-password", salt);
  let consumeCalls = 0;
  const wrongPasswordStore = (createStore as Function)(async (sql: string) => {
    if (/SELECT password_salt, password_hash/u.test(sql)) {
      return { rows: [{ password_salt: salt, password_hash: expected }] };
    }
    consumeCalls += 1;
    return { rows: [{ principal_ref: null }] };
  });
  assert.equal(await wrongPasswordStore.consumeDisposableCredential({
    usernameRef: "u".repeat(43),
    password: "wrong-password",
  }), null);
  assert.equal(consumeCalls, 0, "a wrong password must never reach the consume function");

  const unavailableStore = (createStore as Function)(async (sql: string) => {
    if (/SELECT password_salt, password_hash/u.test(sql)) {
      return { rows: [{ password_salt: salt, password_hash: expected }] };
    }
    return { rows: [{ principal_ref: null }] };
  });
  assert.equal(await unavailableStore.consumeDisposableCredential({
    usernameRef: "u".repeat(43),
    password: "expected-password",
  }), null);
});

test("login falls through from the static account to a one-time disposable account", async () => {
  const loginModule = await dynamicModule("../app/api/open-ena/login/route");
  assert.ok(loginModule);
  const createHandler = loginModule.createOpenEnaLoginPostHandler;
  assert.equal(typeof createHandler, "function");
  if (typeof createHandler !== "function") return;

  const principalRef = `d_${"q".repeat(43)}`;
  const seen: { usernameRef?: string; password?: string; sessionPrincipal?: string } = {};
  const handler = (createHandler as Function)({
    environment: AUTH_ENVIRONMENT,
    securityStoreFactory: async () => ({
      consumeLoginAttempt: async () => true,
      consumeDisposableCredential: async (input: { usernameRef: string; password: string }) => {
        seen.usernameRef = input.usernameRef;
        seen.password = input.password;
        return principalRef;
      },
      isSessionRevoked: async () => false,
      revokeSession: async () => undefined,
    }),
    verifyCredentials: () => false,
    createDisposableSessionToken: (value: string) => {
      seen.sessionPrincipal = value;
      return "signed-disposable-session";
    },
  });

  const response = await handler(formRequest("single-use-user", "single-use-password"));

  assert.equal(response.status, 303);
  assert.equal(seen.password, "single-use-password");
  assert.match(seen.usernameRef ?? "", /^[A-Za-z0-9_-]{43}$/u);
  assert.notEqual(seen.usernameRef, "single-use-user");
  assert.equal(seen.sessionPrincipal, principalRef);
  assert.match(response.headers.get("set-cookie") ?? "", /signed-disposable-session/u);
  assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=900/u);
});

test("a static-account success keeps v2 duration and never touches a disposable credential", async () => {
  const loginModule = await dynamicModule("../app/api/open-ena/login/route");
  assert.ok(loginModule);
  const createHandler = loginModule.createOpenEnaLoginPostHandler;
  assert.equal(typeof createHandler, "function");
  if (typeof createHandler !== "function") return;

  let disposableCalls = 0;
  const handler = (createHandler as Function)({
    environment: AUTH_ENVIRONMENT,
    securityStoreFactory: async () => ({
      consumeLoginAttempt: async () => true,
      consumeDisposableCredential: async () => {
        disposableCalls += 1;
        return null;
      },
      isSessionRevoked: async () => false,
      revokeSession: async () => undefined,
    }),
    verifyCredentials: () => true,
    createSessionToken: () => "signed-static-session",
  });

  const response = await handler(formRequest("researcher", "static-password"));
  assert.equal(response.status, 303);
  assert.equal(disposableCalls, 0);
  assert.match(response.headers.get("set-cookie") ?? "", /signed-static-session/u);
  assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=43200/u);
});

test("disposable credential store failures fail closed instead of becoming an invalid-password redirect", async () => {
  const loginModule = await dynamicModule("../app/api/open-ena/login/route");
  assert.ok(loginModule);
  const createHandler = loginModule.createOpenEnaLoginPostHandler;
  assert.equal(typeof createHandler, "function");
  if (typeof createHandler !== "function") return;

  const handler = (createHandler as Function)({
    environment: AUTH_ENVIRONMENT,
    securityStoreFactory: async () => ({
      consumeLoginAttempt: async () => true,
      consumeDisposableCredential: async () => { throw new Error("database unavailable"); },
      isSessionRevoked: async () => false,
      revokeSession: async () => undefined,
    }),
    verifyCredentials: () => false,
  });

  const response = await handler(formRequest("single-use-user", "single-use-password"));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("a v3 disposable session uses the same durable logout and replay rejection boundary", async () => {
  const auth = await dynamicModule("../lib/open-ena-auth");
  const logoutModule = await dynamicModule("../app/api/open-ena/logout/route");
  assert.ok(auth);
  assert.ok(logoutModule);
  const createV3 = auth.createOpenEnaSessionTokenV3;
  const verifyAnyWithRevocation = auth.verifyOpenEnaSessionTokenAnyWithRevocation;
  const createLogoutHandler = logoutModule.createOpenEnaLogoutPostHandler;
  assert.equal(typeof createV3, "function");
  assert.equal(typeof verifyAnyWithRevocation, "function");
  assert.equal(typeof createLogoutHandler, "function");
  if (
    typeof createV3 !== "function"
    || typeof verifyAnyWithRevocation !== "function"
    || typeof createLogoutHandler !== "function"
  ) return;

  const issuedAt = 1_800_000_000_000;
  const token = (createV3 as Function)(issuedAt, AUTH_ENVIRONMENT, `d_${"v".repeat(43)}`);
  const revoked = new Set<string>();
  const store = {
    consumeLoginAttempt: async () => true,
    consumeDisposableCredential: async () => null,
    isSessionRevoked: async (jti: string) => revoked.has(jti),
    revokeSession: async (jti: string) => { revoked.add(jti); },
  };
  const logout = (createLogoutHandler as Function)({
    environment: AUTH_ENVIRONMENT,
    now: () => issuedAt + 1_000,
    securityStoreFactory: async () => store,
  });
  const response = await logout(new Request("https://www.ena.hk/api/open-ena/logout", {
    method: "POST",
    headers: {
      cookie: `open-ena-session=${encodeURIComponent(token)}`,
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://www.ena.hk",
    },
    body: "locale=en",
  }));
  const replay = await (verifyAnyWithRevocation as Function)(
    token,
    store,
    issuedAt + 2_000,
    AUTH_ENVIRONMENT,
  );

  assert.equal(response.status, 303);
  assert.equal(replay, null);
  assert.equal(revoked.size, 1);
});

test("the legacy Production V2 verifier remains v2-only while the explicit Any verifier accepts v3", async () => {
  const auth = await dynamicModule("../lib/open-ena-auth");
  const storeModule = await dynamicModule("../lib/server/open-ena-auth-security-store");
  assert.ok(auth);
  assert.ok(storeModule);
  const createV3 = auth.createOpenEnaSessionTokenV3;
  const verifyProductionV2 = storeModule.verifyProductionOpenEnaSessionTokenV2;
  const verifyProductionAny = storeModule.verifyProductionOpenEnaSessionTokenAny;
  assert.equal(typeof createV3, "function");
  assert.equal(typeof verifyProductionV2, "function");
  assert.equal(typeof verifyProductionAny, "function");
  if (
    typeof createV3 !== "function"
    || typeof verifyProductionV2 !== "function"
    || typeof verifyProductionAny !== "function"
  ) return;

  const issuedAt = 1_800_000_000_000;
  const token = (createV3 as Function)(issuedAt, AUTH_ENVIRONMENT, `d_${"z".repeat(43)}`);
  const query = async (sql: string) => {
    assert.match(sql, /open_ena_session_is_revoked/u);
    return { rows: [{ revoked: false }] };
  };
  const v2Only = await (verifyProductionV2 as Function)(
    token,
    issuedAt + 1_000,
    AUTH_ENVIRONMENT,
    query,
  );
  const anyVersion = await (verifyProductionAny as Function)(
    token,
    issuedAt + 1_000,
    AUTH_ENVIRONMENT,
    query,
  );

  assert.equal(v2Only, null);
  assert.equal(anyVersion?.principalRef, `d_${"z".repeat(43)}`);
});

test("migration 004 stores only one-way disposable credentials and consumes them atomically", () => {
  const migrationPath = new URL("../migrations/004_open_ena_disposable_accounts.sql", import.meta.url);
  assert.equal(existsSync(migrationPath), true);
  if (!existsSync(migrationPath)) return;
  const migration = readFileSync(migrationPath, "utf8");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS open_ena_disposable_accounts/u);
  assert.match(migration, /username_ref\s+text\s+NOT NULL/u);
  assert.match(migration, /password_salt\s+bytea\s+NOT NULL/u);
  assert.match(migration, /password_hash\s+bytea\s+NOT NULL/u);
  assert.match(migration, /principal_ref\s+text\s+NOT NULL/u);
  assert.match(migration, /expires_at\s+timestamptz\s+NOT NULL/u);
  assert.match(migration, /consumed_at\s+timestamptz/u);
  assert.match(migration, /disabled_at\s+timestamptz/u);
  assert.match(migration, /CREATE OR REPLACE FUNCTION open_ena_consume_disposable_account/u);
  assert.match(migration, /UPDATE\s+open_ena_disposable_accounts[\s\S]*?consumed_at\s+IS\s+NULL/u);
  assert.match(migration, /expires_at\s*>\s*v_now/u);
  assert.match(migration, /disabled_at\s+IS\s+NULL/u);
  assert.match(migration, /RETURNING\s+principal_ref/u);
  assert.match(migration, /octet_length\(password_salt\)\s*=\s*16/u);
  assert.match(migration, /octet_length\(password_hash\)\s*=\s*32/u);
  assert.match(migration, /password_hash\s*=\s*p_password_hash/u);
  assert.match(migration, /CHECK\s*\(expires_at\s*>\s*created_at\)/u);
  assert.match(migration, /clock_timestamp\(\)/u);
  assert.doesNotMatch(migration, /\busername\s+(?:text|varchar|character)/iu);
  assert.doesNotMatch(migration, /\bpassword\s+(?:text|varchar|character)/iu);
  assert.doesNotMatch(migration, /CREATE\s+EXTENSION/iu);
  assert.doesNotMatch(migration, /\bEXECUTE\b/iu);
  assert.doesNotMatch(migration, /\bp_now\b/u);
});

test("operator documentation requires migration 004 and states the disposable credential boundary", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  assert.match(readme, /migrations\/004_open_ena_disposable_accounts\.sql/u);
  assert.match(readme, /HMAC username reference/u);
  assert.match(readme, /scrypt/u);
  assert.match(readme, /v3 session/u);
  assert.match(readme, /15-minute/u);
  assert.match(readme, /Apply all four\s+migrations/u);
  assert.match(readme, /same operator-controlled PostgreSQL deployment/u);
  assert.match(readme, /run-open-ena-production-auth-operator\.mjs/u);
  assert.match(readme, /--mode=migration/u);
  assert.match(readme, /before deploying the auth code/u);
  assert.match(readme, /--mode=proof/u);
  assert.match(readme, /EXTERNAL_CROSS_CHECK_REQUIRED/u);
});
