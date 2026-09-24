import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { afterEach, test } from "node:test";

import {
  createOpenEnaSessionTokenV2,
  OPEN_ENA_SESSION_COOKIE,
  type OpenEnaPrincipal,
} from "../lib/open-ena-auth";
import {
  openEnaRequestOriginConfigurationReady,
  resolveOpenEnaRequestOrigin,
} from "../lib/open-ena-auth-request";
import {
  createProductionOpenEnaAuthSecurityStore,
  classifyProductionOpenEnaSessionTokenAny,
  invalidateProductionOpenEnaAuthSecurityStore,
  isTransientOpenEnaAuthStoreFailure,
  OPEN_ENA_AUTH_ERROR_HEADER,
  OPEN_ENA_AUTH_NOT_CONFIGURED_MESSAGE,
  OPEN_ENA_AUTH_STORE_CREATE_ATTEMPTS,
  OPEN_ENA_AUTH_STORE_UNAVAILABLE_MESSAGE,
  OPEN_ENA_AUTH_UNAVAILABLE_RETRY_AFTER_SECONDS,
  type OpenEnaAuthSecurityPool,
} from "../lib/server/open-ena-auth-security-store";

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

afterEach(() => {
  invalidateProductionOpenEnaAuthSecurityStore();
});

const LOGIN_FORM = "locale=en&username=researcher&password=a-different-strong-passphrase";

function validLoginAttempt() {
  return {
    sourceRef: "src",
    accountRef: "acct",
    sourceLimit: 5,
    accountLimit: 10,
    windowSeconds: 900,
  };
}

function createFakePool(options: {
  query?: OpenEnaAuthSecurityPool["query"];
  ended?: () => void;
} = {}) {
  const listeners: Array<(error: Error) => void> = [];
  const pool: OpenEnaAuthSecurityPool & { emitError: (error: Error) => void } = {
    query: options.query ?? (async () => ({ rows: [{ allowed: true }] })),
    on(event, listener) {
      if (event === "error") listeners.push(listener);
      return undefined;
    },
    async end() {
      options.ended?.();
    },
    emitError(error) {
      for (const listener of listeners) listener(error);
    },
  };
  return pool;
}

async function loginHandler(dependencies: DynamicModule) {
  const loginModule = await dynamicModule("../app/api/open-ena/login/route");
  assert.ok(loginModule);
  const createHandler = loginModule.createOpenEnaLoginPostHandler;
  assert.equal(typeof createHandler, "function");
  if (typeof createHandler !== "function") return null;
  return (createHandler as (dependencies: DynamicModule) => (request: Request) => Promise<Response>)(dependencies);
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

test("logout revalidates the localized Open ENA gate after clearing the session cookie", async () => {
  const authModule = await dynamicModule("../lib/open-ena-auth");
  const logoutModule = await dynamicModule("../app/api/open-ena/logout/route");
  assert.ok(authModule);
  assert.ok(logoutModule);
  const createLogoutHandler = logoutModule.createOpenEnaLogoutPostHandler;
  assert.equal(typeof createLogoutHandler, "function");
  if (typeof createLogoutHandler !== "function") return;

  const issuedAt = 1_800_000_000_000;
  const token = createOpenEnaSessionTokenV2(issuedAt, AUTH_ENVIRONMENT);
  const principal = (authModule.verifyOpenEnaSessionTokenV2 as (
    token: string,
    now: number,
    environment: DynamicModule,
  ) => OpenEnaPrincipal | null)(token, issuedAt + 2_000, AUTH_ENVIRONMENT);
  assert.ok(principal);
  const revokedJtis = new Set<string>();
  const revalidated: string[] = [];
  const logout = (createLogoutHandler as (dependencies: DynamicModule) => (request: Request) => Promise<Response>)({
    environment: AUTH_ENVIRONMENT,
    now: () => issuedAt + 2_000,
    securityStoreFactory: async () => ({
      consumeLoginAttempt: async () => true,
      isSessionRevoked: async (jti: string) => revokedJtis.has(jti),
      revokeSession: async (jti: string) => { revokedJtis.add(jti); },
    }),
    revalidateOpenEnaWorkspace: (locale: string) => { revalidated.push(locale); },
  });
  const response = await logout(new Request("https://www.ena.hk/api/open-ena/logout", {
    method: "POST",
    headers: {
      cookie: `open-ena-session=${encodeURIComponent(token)}`,
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://www.ena.hk",
    },
    body: "locale=zh-hans",
  }));
  const setCookie = response.headers.get("set-cookie") ?? "";

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://www.ena.hk/zh-hans/open-ena");
  assert.match(setCookie, /open-ena-session=/);
  assert.match(setCookie, /Max-Age=0/i);
  assert.deepEqual(revalidated, ["zh-hans"]);
  assert.deepEqual([...revokedJtis], [principal.jti]);
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
  assert.match(storeSource, /pool\.on\(\s*"error"/u);
  assert.match(storeSource, /invalidateProductionOpenEnaAuthSecurityStore/u);
  assert.match(storeSource, /connectionTimeoutMillis:\s*5_000/u);
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

test("login returns a structured 503 when the production security store is missing", async () => {
  const handler = await loginHandler({
    environment: AUTH_ENVIRONMENT,
    securityStoreFactory: async () => null,
  });
  assert.ok(handler);
  const response = await handler(formRequest(LOGIN_FORM));
  assert.equal(response.status, 503);
  assert.equal(await response.text(), OPEN_ENA_AUTH_STORE_UNAVAILABLE_MESSAGE);
  assert.equal(response.headers.get(OPEN_ENA_AUTH_ERROR_HEADER.toLowerCase()), "store-unavailable");
  assert.equal(
    response.headers.get("retry-after"),
    String(OPEN_ENA_AUTH_UNAVAILABLE_RETRY_AFTER_SECONDS),
  );
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("location"), null);
});

test("login returns a structured 503 when store construction throws without leaking secrets", async () => {
  const handler = await loginHandler({
    environment: AUTH_ENVIRONMENT,
    securityStoreFactory: async () => {
      throw new Error("connect ECONNREFUSED postgresql://open_ena:super-secret@db.internal/open_ena");
    },
  });
  assert.ok(handler);
  const response = await handler(formRequest(LOGIN_FORM));
  const body = await response.text();
  assert.equal(response.status, 503);
  assert.equal(body, OPEN_ENA_AUTH_STORE_UNAVAILABLE_MESSAGE);
  assert.equal(response.headers.get(OPEN_ENA_AUTH_ERROR_HEADER.toLowerCase()), "store-error");
  assert.equal(
    response.headers.get("retry-after"),
    String(OPEN_ENA_AUTH_UNAVAILABLE_RETRY_AFTER_SECONDS),
  );
  assert.doesNotMatch(body, /postgresql:/iu);
  assert.doesNotMatch(body, /super-secret/u);
  assert.doesNotMatch(body, /db\.internal/u);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("login returns a structured 503 when a store operation throws", async () => {
  const handler = await loginHandler({
    environment: AUTH_ENVIRONMENT,
    securityStoreFactory: async () => ({
      consumeLoginAttempt: async () => {
        throw new Error("Durable login throttle store is unavailable.");
      },
      isSessionRevoked: async () => false,
      revokeSession: async () => undefined,
    }),
  });
  assert.ok(handler);
  const response = await handler(formRequest(LOGIN_FORM));
  assert.equal(response.status, 503);
  assert.equal(await response.text(), OPEN_ENA_AUTH_STORE_UNAVAILABLE_MESSAGE);
  assert.equal(response.headers.get(OPEN_ENA_AUTH_ERROR_HEADER.toLowerCase()), "store-error");
});

test("login keeps the not-configured 503 distinct from store unavailability", async () => {
  const handler = await loginHandler({
    environment: { ...AUTH_ENVIRONMENT, OPEN_ENA_AUTH_DATABASE_URL: undefined },
    securityStoreFactory: async () => {
      throw new Error("factory must not run when authentication is not configured");
    },
  });
  assert.ok(handler);
  const response = await handler(formRequest(LOGIN_FORM));
  assert.equal(response.status, 503);
  assert.equal(await response.text(), OPEN_ENA_AUTH_NOT_CONFIGURED_MESSAGE);
  assert.equal(response.headers.get(OPEN_ENA_AUTH_ERROR_HEADER.toLowerCase()), "not-configured");
  assert.equal(response.headers.get("retry-after"), null);
});

test("an origin that is not on the operator allowlist is 403, not a store 503", async () => {
  const handler = await loginHandler({
    environment: {
      ...AUTH_ENVIRONMENT,
      NODE_ENV: "production",
      OPEN_ENA_ALLOWED_ORIGINS: "https://ena.hk",
    },
    securityStoreFactory: async () => {
      throw new Error("factory must not run for a rejected origin");
    },
  });
  assert.ok(handler);
  const response = await handler(formRequest(LOGIN_FORM));
  assert.equal(response.status, 403);
  assert.equal(await response.text(), "Invalid request origin");
  assert.equal(response.headers.get(OPEN_ENA_AUTH_ERROR_HEADER.toLowerCase()), null);
});

test("a failed production store promise is retried instead of sticking at null", async () => {
  let createCount = 0;
  const createPool = async () => {
    createCount += 1;
    throw Object.assign(new Error("connect failed"), { code: "ECONNREFUSED" });
  };

  const first = await createProductionOpenEnaAuthSecurityStore(
    AUTH_ENVIRONMENT,
    undefined,
    { createPool },
  );
  const second = await createProductionOpenEnaAuthSecurityStore(
    AUTH_ENVIRONMENT,
    undefined,
    { createPool },
  );

  assert.equal(first, null);
  assert.equal(second, null);
  assert.equal(createCount, OPEN_ENA_AUTH_STORE_CREATE_ATTEMPTS * 2);
});

test("production store creation retries a transient pool factory failure in the same call", async () => {
  let createCount = 0;
  const store = await createProductionOpenEnaAuthSecurityStore(
    AUTH_ENVIRONMENT,
    undefined,
    {
      createPool: async () => {
        createCount += 1;
        if (createCount === 1) {
          throw Object.assign(new Error("connect failed"), { code: "ETIMEDOUT" });
        }
        return createFakePool();
      },
    },
  );

  assert.ok(store);
  assert.equal(createCount, 2);
  assert.equal(await store.consumeLoginAttempt(validLoginAttempt()), true);
});

test("a transient pool query failure discards the cached production store", async () => {
  let createCount = 0;
  const createPool = async () => {
    createCount += 1;
    return createFakePool({
      query: async () => {
        throw Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
      },
    });
  };

  const first = await createProductionOpenEnaAuthSecurityStore(
    AUTH_ENVIRONMENT,
    undefined,
    { createPool },
  );
  assert.ok(first);
  await assert.rejects(
    () => first.consumeLoginAttempt(validLoginAttempt()),
    /Durable login throttle store is unavailable/u,
  );

  const second = await createProductionOpenEnaAuthSecurityStore(
    AUTH_ENVIRONMENT,
    undefined,
    { createPool },
  );
  assert.ok(second);
  assert.notEqual(second, first);
  assert.equal(createCount, 2);
});

test("a non-transient query failure keeps the cached production store", async () => {
  let createCount = 0;
  const createPool = async () => {
    createCount += 1;
    return createFakePool({
      query: async () => {
        throw Object.assign(new Error("function open_ena_consume_login_attempt does not exist"), {
          code: "42883",
        });
      },
    });
  };

  const first = await createProductionOpenEnaAuthSecurityStore(
    AUTH_ENVIRONMENT,
    undefined,
    { createPool },
  );
  assert.ok(first);
  await assert.rejects(() => first.consumeLoginAttempt(validLoginAttempt()));

  const second = await createProductionOpenEnaAuthSecurityStore(
    AUTH_ENVIRONMENT,
    undefined,
    { createPool },
  );
  assert.equal(second, first);
  assert.equal(createCount, 1);
});

test("an idle pool error discards the cached production store", async () => {
  const pools: Array<ReturnType<typeof createFakePool>> = [];
  const first = await createProductionOpenEnaAuthSecurityStore(
    AUTH_ENVIRONMENT,
    undefined,
    {
      createPool: async () => {
        const pool = createFakePool();
        pools.push(pool);
        return pool;
      },
    },
  );
  assert.ok(first);
  assert.equal(pools.length, 1);
  assert.ok(pools[0]);

  pools[0].emitError(Object.assign(new Error("idle client backend terminated"), { code: "57P01" }));

  const second = await createProductionOpenEnaAuthSecurityStore(
    AUTH_ENVIRONMENT,
    undefined,
    {
      createPool: async () => {
        const pool = createFakePool();
        pools.push(pool);
        return pool;
      },
    },
  );
  assert.ok(second);
  assert.notEqual(second, first);
  assert.equal(pools.length, 2);
});

test("in-flight production store creation is shared instead of opening two pools", async () => {
  let createCount = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const createPool = async () => {
    createCount += 1;
    await gate;
    return createFakePool();
  };

  const firstPromise = createProductionOpenEnaAuthSecurityStore(
    AUTH_ENVIRONMENT,
    undefined,
    { createPool },
  );
  const secondPromise = createProductionOpenEnaAuthSecurityStore(
    AUTH_ENVIRONMENT,
    undefined,
    { createPool },
  );
  try {
    await Promise.resolve();
    assert.equal(createCount, 1);
  } finally {
    release();
  }
  const [first, second] = await Promise.all([firstPromise, secondPromise]);
  assert.ok(first);
  assert.equal(second, first);
  assert.equal(createCount, 1);
});

test("transient store failure detection stays conservative", () => {
  assert.equal(
    isTransientOpenEnaAuthStoreFailure(Object.assign(new Error("refused"), { code: "ECONNREFUSED" })),
    true,
  );
  assert.equal(isTransientOpenEnaAuthStoreFailure(new Error("timeout expired")), true);
  assert.equal(
    isTransientOpenEnaAuthStoreFailure(Object.assign(new Error("undefined function"), { code: "42883" })),
    false,
  );
  assert.equal(isTransientOpenEnaAuthStoreFailure(new TypeError("Invalid disposable credential material.")), false);
});

test("production session classification separates login, configuration, and store failures", async () => {
  const issuedAt = 1_800_000_000_000;
  const token = createOpenEnaSessionTokenV2(issuedAt, AUTH_ENVIRONMENT);
  const secretDetail = "postgres://secret-user:secret-pass@db.internal/open_ena";
  const logged: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };
  try {
    const missingConfig = await classifyProductionOpenEnaSessionTokenAny(token, issuedAt + 1_000, {});
    assert.deepEqual(missingConfig, { outcome: "not-configured" });

    let creates = 0;
    const storeDown = await classifyProductionOpenEnaSessionTokenAny(
      token,
      issuedAt + 1_000,
      AUTH_ENVIRONMENT,
      undefined,
      {
        createPool: () => {
          creates += 1;
          throw Object.assign(new Error(secretDetail), { code: "ECONNREFUSED" });
        },
      },
    );
    assert.equal(storeDown.outcome, "store-unavailable");
    assert.equal(creates, OPEN_ENA_AUTH_STORE_CREATE_ATTEMPTS);

    const missingSession = await classifyProductionOpenEnaSessionTokenAny(
      undefined,
      issuedAt + 1_000,
      AUTH_ENVIRONMENT,
      async () => {
        throw new Error("revocation must not run without a session");
      },
    );
    assert.deepEqual(missingSession, { outcome: "unauthenticated" });

    const invalidSession = await classifyProductionOpenEnaSessionTokenAny(
      "not-a-session",
      issuedAt + 1_000,
      AUTH_ENVIRONMENT,
      async () => ({ rows: [{ revoked: false }] }),
    );
    assert.deepEqual(invalidSession, { outcome: "unauthenticated" });

    const revoked = await classifyProductionOpenEnaSessionTokenAny(
      token,
      issuedAt + 1_000,
      AUTH_ENVIRONMENT,
      async (sql) => {
        assert.match(sql, /open_ena_session_is_revoked/u);
        return { rows: [{ revoked: true }] };
      },
    );
    assert.deepEqual(revoked, { outcome: "unauthenticated" });

    const revocationOutage = await classifyProductionOpenEnaSessionTokenAny(
      token,
      issuedAt + 1_000,
      AUTH_ENVIRONMENT,
      async () => {
        throw Object.assign(new Error(secretDetail), { code: "57P01" });
      },
    );
    assert.deepEqual(revocationOutage, { outcome: "store-error" });

    const accepted = await classifyProductionOpenEnaSessionTokenAny(
      token,
      issuedAt + 1_000,
      AUTH_ENVIRONMENT,
      async () => ({ rows: [{ revoked: false }] }),
    );
    assert.equal(accepted.outcome, "authenticated");
    if (accepted.outcome === "authenticated") {
      assert.match(accepted.principal.principalRef, /^[A-Za-z0-9_-]{43}$/u);
      assert.notEqual(accepted.principal.principalRef, AUTH_ENVIRONMENT.OPEN_ENA_ACCOUNT_ID);
    }
  } finally {
    console.error = originalError;
    invalidateProductionOpenEnaAuthSecurityStore();
  }

  const serialized = JSON.stringify(logged);
  assert.doesNotMatch(serialized, /secret-user|secret-pass|postgres:\/\//);
});

test("logout store construction failures use the structured 503 contract", async () => {
  const logoutModule = await dynamicModule("../app/api/open-ena/logout/route");
  assert.ok(logoutModule);
  const createLogoutHandler = logoutModule.createOpenEnaLogoutPostHandler;
  assert.equal(typeof createLogoutHandler, "function");
  if (typeof createLogoutHandler !== "function") return;
  const handler = (createLogoutHandler as (dependencies: DynamicModule) => (request: Request) => Promise<Response>)({
    environment: AUTH_ENVIRONMENT,
    securityStoreFactory: async () => null,
  });
  const response = await handler(new Request("https://www.ena.hk/api/open-ena/logout", {
    method: "POST",
    headers: { origin: "https://www.ena.hk" },
  }));
  assert.equal(response.status, 503);
  assert.equal(await response.text(), OPEN_ENA_AUTH_STORE_UNAVAILABLE_MESSAGE);
  assert.equal(response.headers.get(OPEN_ENA_AUTH_ERROR_HEADER.toLowerCase()), "store-unavailable");
  assert.equal(
    response.headers.get("retry-after"),
    String(OPEN_ENA_AUTH_UNAVAILABLE_RETRY_AFTER_SECONDS),
  );
});
