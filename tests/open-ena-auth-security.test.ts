import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  createOpenEnaSessionTokenV2,
  OPEN_ENA_SESSION_COOKIE,
  type OpenEnaPrincipal,
} from "../lib/open-ena-auth";
import {
  openEnaRequestOriginConfigurationReady,
  resolveOpenEnaRequestOrigin,
} from "../lib/open-ena-auth-request";

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

function formRequest(body: BodyInit, headers: HeadersInit = {}) {
  return new Request("https://www.ena.hk/api/open-ena/login", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://www.ena.hk",
      ...headers,
    },
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

test("client-supplied forwarded host cannot authorize an Origin or choose a redirect host", () => {
  const attackerHeaders = new Headers({
    host: "internal-runtime:3000",
    origin: "https://attacker.example",
    "x-forwarded-host": "attacker.example",
    "x-forwarded-proto": "https",
  });

  assert.equal(
    resolveOpenEnaRequestOrigin(
      attackerHeaders,
      "http://internal-runtime:3000",
      AUTH_ENVIRONMENT,
    ),
    null,
  );
});

test("production origin validation is anchored to an operator-owned exact origin", () => {
  const headers = new Headers({
    origin: "https://www.ena.hk",
    host: "attacker.example",
    "x-forwarded-host": "attacker.example",
    "x-forwarded-proto": "https",
  });
  assert.equal(
    resolveOpenEnaRequestOrigin(headers, "http://internal-runtime:3000", {
      NODE_ENV: "production",
      OPEN_ENA_PUBLIC_ORIGIN: "https://www.ena.hk",
    }),
    "https://www.ena.hk",
  );
  assert.equal(
    resolveOpenEnaRequestOrigin(
      new Headers({ origin: "https://www.ena.hk/path" }),
      "http://internal-runtime:3000",
      { NODE_ENV: "production", OPEN_ENA_PUBLIC_ORIGIN: "https://www.ena.hk" },
    ),
    null,
  );
  assert.equal(
    resolveOpenEnaRequestOrigin(
      new Headers({ origin: "https://attacker.example" }),
      "http://internal-runtime:3000",
      { NODE_ENV: "production", OPEN_ENA_PUBLIC_ORIGIN: "https://www.ena.hk" },
    ),
    null,
  );
});

test("production origin configuration fails closed without an operator list", () => {
  assert.equal(openEnaRequestOriginConfigurationReady({ NODE_ENV: "production" }), false);
  assert.equal(openEnaRequestOriginConfigurationReady({ NODE_ENV: "production", OPEN_ENA_PUBLIC_ORIGIN: "https://www.ena.hk" }), true);
  assert.equal(openEnaRequestOriginConfigurationReady({ NODE_ENV: "development" }), true);
});

test("login stops an unknown-length oversized form before buffering the complete body", async () => {
  const loginModule = await dynamicModule("../app/api/open-ena/login/route");
  assert.ok(loginModule);
  const createHandler = loginModule.createOpenEnaLoginPostHandler;
  assert.equal(typeof createHandler, "function", "login needs an injectable application-layer security handler");
  if (typeof createHandler !== "function") return;

  let pulls = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new Uint8Array(4 * 1024));
      if (pulls >= 512) controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  const store = {
    consumeLoginAttempt: async () => true,
    isSessionRevoked: async () => false,
    revokeSession: async () => undefined,
  };
  const handler = (createHandler as (dependencies: DynamicModule) => (request: Request) => Promise<Response>)({
    environment: AUTH_ENVIRONMENT,
    securityStoreFactory: async () => store,
  });

  const response = await handler(formRequest(body));

  assert.equal(response.status, 413);
  assert.equal(cancelled, true);
  assert.ok(pulls < 16, `bounded reader pulled ${pulls} chunks`);
});

test("login throttles repeated attempts in the shared store before another password check", async () => {
  const loginModule = await dynamicModule("../app/api/open-ena/login/route");
  assert.ok(loginModule);
  const createHandler = loginModule.createOpenEnaLoginPostHandler;
  assert.equal(typeof createHandler, "function", "login needs an injectable application-layer security handler");
  if (typeof createHandler !== "function") return;

  let attempts = 0;
  let credentialChecks = 0;
  let disposableChecks = 0;
  const store = {
    consumeLoginAttempt: async () => {
      attempts += 1;
      return attempts <= 2;
    },
    consumeDisposableCredential: async () => {
      disposableChecks += 1;
      return null;
    },
    isSessionRevoked: async () => false,
    revokeSession: async () => undefined,
  };
  const handler = (createHandler as (dependencies: DynamicModule) => (request: Request) => Promise<Response>)({
    environment: AUTH_ENVIRONMENT,
    securityStoreFactory: async () => store,
    verifyCredentials: () => {
      credentialChecks += 1;
      return false;
    },
  });
  const body = "locale=en&username=researcher&password=wrong-password";

  const first = await handler(formRequest(body));
  const second = await handler(formRequest(body));
  const denied = await handler(formRequest(body));

  assert.deepEqual([first.status, second.status, denied.status], [303, 303, 429]);
  assert.equal(denied.headers.get("retry-after"), "900");
  assert.equal(credentialChecks, 2);
  assert.equal(disposableChecks, 2);
});

test("logout revokes exactly one jti and another instance rejects its replay", async () => {
  const authModule = await dynamicModule("../lib/open-ena-auth");
  const logoutModule = await dynamicModule("../app/api/open-ena/logout/route");
  assert.ok(authModule);
  assert.ok(logoutModule);
  const verifyWithRevocation = authModule.verifyOpenEnaSessionTokenV2WithRevocation;
  const createLogoutHandler = logoutModule.createOpenEnaLogoutPostHandler;
  assert.equal(typeof verifyWithRevocation, "function", "session verification must consult durable revocation");
  assert.equal(typeof createLogoutHandler, "function", "logout must expose a revoking handler seam");
  if (typeof verifyWithRevocation !== "function" || typeof createLogoutHandler !== "function") return;

  const issuedAt = 1_800_000_000_000;
  const firstToken = createOpenEnaSessionTokenV2(issuedAt, AUTH_ENVIRONMENT);
  const secondToken = createOpenEnaSessionTokenV2(issuedAt + 1_000, AUTH_ENVIRONMENT);
  // This Set is only the shared backend test double. Production is separately
  // required below to construct a PostgreSQL adapter and contain no memory map.
  const revokedJtis = new Set<string>();
  const firstInstance = {
    consumeLoginAttempt: async () => true,
    isSessionRevoked: async (jti: string) => revokedJtis.has(jti),
    revokeSession: async (jti: string) => { revokedJtis.add(jti); },
  };
  const secondInstance = {
    consumeLoginAttempt: async () => true,
    isSessionRevoked: async (jti: string) => revokedJtis.has(jti),
    revokeSession: async (jti: string) => { revokedJtis.add(jti); },
  };
  const logout = (createLogoutHandler as (dependencies: DynamicModule) => (request: Request) => Promise<Response>)({
    environment: AUTH_ENVIRONMENT,
    now: () => issuedAt + 2_000,
    securityStoreFactory: async () => firstInstance,
  });
  const request = new Request("https://www.ena.hk/api/open-ena/logout", {
    method: "POST",
    headers: {
      cookie: `open-ena-session=${encodeURIComponent(firstToken)}`,
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://www.ena.hk",
    },
    body: "locale=en",
  });

  const response = await logout(request);
  const replayed = await (verifyWithRevocation as (
    token: string,
    store: DynamicModule,
    now: number,
    environment: DynamicModule,
  ) => Promise<OpenEnaPrincipal | null>)(firstToken, secondInstance, issuedAt + 3_000, AUTH_ENVIRONMENT);
  const unrelated = await (verifyWithRevocation as (
    token: string,
    store: DynamicModule,
    now: number,
    environment: DynamicModule,
  ) => Promise<OpenEnaPrincipal | null>)(secondToken, secondInstance, issuedAt + 3_000, AUTH_ENVIRONMENT);

  assert.equal(response.status, 303);
  assert.equal(replayed, null);
  assert.ok(unrelated);
});

test("logout fails closed when durable revocation cannot be persisted", async () => {
  const logoutModule = await dynamicModule("../app/api/open-ena/logout/route");
  assert.ok(logoutModule);
  const createLogoutHandler = logoutModule.createOpenEnaLogoutPostHandler;
  assert.equal(typeof createLogoutHandler, "function");
  if (typeof createLogoutHandler !== "function") return;
  const token = createOpenEnaSessionTokenV2(1_800_000_000_000, AUTH_ENVIRONMENT);
  const handler = (createLogoutHandler as (dependencies: DynamicModule) => (request: Request) => Promise<Response>)({
    environment: AUTH_ENVIRONMENT,
    now: () => 1_800_000_001_000,
    securityStoreFactory: async () => ({
      consumeLoginAttempt: async () => true,
      isSessionRevoked: async () => false,
      revokeSession: async () => { throw new Error("database unavailable"); },
    }),
  });
  const response = await handler(new Request("https://www.ena.hk/api/open-ena/logout", {
    method: "POST",
    headers: {
      origin: "https://www.ena.hk",
      cookie: `${OPEN_ENA_SESSION_COOKIE}=${encodeURIComponent(token)}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "locale=en",
  }));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("production auth security is PostgreSQL-backed and its migration is present", async () => {
  const storeModule = await dynamicModule("../lib/server/open-ena-auth-security-store");
  assert.ok(storeModule, "the shared authentication security store must exist");
  const storePath = new URL("../lib/server/open-ena-auth-security-store.ts", import.meta.url);
  const migrationPath = new URL("../migrations/002_open_ena_auth_security.sql", import.meta.url);
  assert.equal(existsSync(storePath), true);
  assert.equal(existsSync(migrationPath), true);
  if (!existsSync(storePath) || !existsSync(migrationPath)) return;

  const storeSource = readFileSync(storePath, "utf8");
  const migration = readFileSync(migrationPath, "utf8");
  assert.match(storeSource, /OPEN_ENA_AUTH_DATABASE_URL/u);
  assert.match(storeSource, /import\("pg"\)/u);
  assert.doesNotMatch(storeSource, /new\s+(?:Map|Set)\s*</u);
  assert.match(migration, /open_ena_auth_attempt_windows/u);
  assert.match(migration, /open_ena_consume_login_attempt/u);
  assert.match(migration, /clock_timestamp\s*\(\s*\)/u);
  assert.match(migration, /open_ena_revoked_sessions/u);
  assert.match(migration, /open_ena_revoke_session/u);
  assert.match(migration, /open_ena_session_is_revoked/u);
  const ready = storeModule.openEnaAuthSecurityConfigurationReady as undefined | ((environment: DynamicModule) => boolean);
  assert.equal(typeof ready, "function");
  if (typeof ready === "function") {
    assert.equal(ready({ ...AUTH_ENVIRONMENT, NODE_ENV: "production" }), true);
    assert.equal(ready({ ...AUTH_ENVIRONMENT, NODE_ENV: "production", OPEN_ENA_PUBLIC_ORIGIN: "" }), false);
    assert.equal(ready({ ...AUTH_ENVIRONMENT, NODE_ENV: "production", OPEN_ENA_ALLOWED_ORIGINS: undefined }), false);
  }
});
