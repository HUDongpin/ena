import { scrypt, timingSafeEqual } from "node:crypto";
import {
  openEnaV2AuthConfigurationReady,
  verifyOpenEnaSessionTokenAnyWithRevocation,
  verifyOpenEnaSessionTokenV2WithRevocation,
  type OpenEnaAuthEnvironment,
  type OpenEnaPrincipal,
  type OpenEnaSessionRevocationLookup,
} from "@/lib/open-ena-auth";
import { openEnaRequestOriginConfigurationReady } from "@/lib/open-ena-auth-request";

export type OpenEnaLoginAttempt = {
  sourceRef: string;
  accountRef: string;
  sourceLimit: number;
  accountLimit: number;
  windowSeconds: number;
};

export type OpenEnaDisposableLogin = {
  usernameRef: string;
  password: string;
};

export type OpenEnaAuthSecurityStore = OpenEnaSessionRevocationLookup & {
  consumeLoginAttempt(input: OpenEnaLoginAttempt): Promise<boolean>;
  consumeDisposableCredential(input: OpenEnaDisposableLogin): Promise<string | null>;
  revokeSession(jti: string, expiresAtSeconds: number): Promise<void>;
};

export type OpenEnaAuthSecurityQuery = (
  sql: string,
  params?: readonly unknown[],
) => Promise<{ rows: Array<Record<string, unknown>> }>;

const OPEN_ENA_DISPOSABLE_SCRYPT_OPTIONS = {
  N: 16_384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
} as const;
const OPEN_ENA_DISPOSABLE_DUMMY_SALT = Buffer.from("c85de58856b62d8af476678c9ca84a17", "hex");

function deriveDisposablePasswordHash(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 32, OPEN_ENA_DISPOSABLE_SCRYPT_OPTIONS, (error, key) => {
      if (error) reject(error);
      else resolve(Buffer.from(key));
    });
  });
}

function validUsernameRef(value: string) {
  return /^[A-Za-z0-9_-]{43}$/u.test(value);
}

function validDisposablePrincipalRef(value: unknown): value is string {
  return typeof value === "string" && /^d_[A-Za-z0-9_-]{43}$/u.test(value);
}

function configuredDatabaseUrl(environment: OpenEnaAuthEnvironment) {
  const raw = environment.OPEN_ENA_AUTH_DATABASE_URL?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (
      (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:")
      || !parsed.hostname
      || !parsed.pathname
    ) return null;
    return raw;
  } catch {
    return null;
  }
}

export function openEnaAuthSecurityConfigurationReady(
  environment: OpenEnaAuthEnvironment = process.env,
) {
  return openEnaV2AuthConfigurationReady(environment)
    && configuredDatabaseUrl(environment) !== null
    && openEnaRequestOriginConfigurationReady(environment);
}

export function createPostgresOpenEnaAuthSecurityStore(
  query: OpenEnaAuthSecurityQuery,
): OpenEnaAuthSecurityStore {
  return {
    async consumeLoginAttempt(input) {
      if (
        !input.sourceRef
        || !input.accountRef
        || !Number.isSafeInteger(input.sourceLimit)
        || input.sourceLimit < 1
        || !Number.isSafeInteger(input.accountLimit)
        || input.accountLimit < input.sourceLimit
        || !Number.isSafeInteger(input.windowSeconds)
        || input.windowSeconds < 1
      ) return false;
      try {
        const result = await query(
          "SELECT open_ena_consume_login_attempt($1,$2,$3,$4,$5) AS allowed",
          [
            input.sourceRef,
            input.accountRef,
            input.sourceLimit,
            input.accountLimit,
            input.windowSeconds,
          ],
        );
        return result.rows[0]?.allowed === true;
      } catch (error) {
        throw new Error("Durable login throttle store is unavailable.", { cause: error });
      }
    },
    async consumeDisposableCredential(input) {
      if (!validUsernameRef(input.usernameRef) || typeof input.password !== "string") return null;
      try {
        const candidate = await query(
          "SELECT password_salt, password_hash FROM open_ena_disposable_accounts WHERE username_ref = $1 LIMIT 1",
          [input.usernameRef],
        );
        const row = candidate.rows[0];
        if (!row) {
          await deriveDisposablePasswordHash(input.password, OPEN_ENA_DISPOSABLE_DUMMY_SALT);
          return null;
        }
        if (
          !Buffer.isBuffer(row.password_salt)
          || row.password_salt.length !== 16
          || !Buffer.isBuffer(row.password_hash)
          || row.password_hash.length !== 32
        ) {
          await deriveDisposablePasswordHash(input.password, OPEN_ENA_DISPOSABLE_DUMMY_SALT);
          throw new TypeError("Invalid disposable credential material.");
        }
        const calculated = await deriveDisposablePasswordHash(input.password, row.password_salt);
        if (!timingSafeEqual(calculated, row.password_hash)) return null;
        const result = await query(
          "SELECT open_ena_consume_disposable_account($1,$2) AS principal_ref",
          [input.usernameRef, calculated],
        );
        const principalRef = result.rows[0]?.principal_ref;
        if (principalRef === null || principalRef === undefined) return null;
        if (!validDisposablePrincipalRef(principalRef)) {
          throw new TypeError("Invalid disposable principal result.");
        }
        return principalRef;
      } catch (error) {
        throw new Error("Durable disposable credential store is unavailable.", { cause: error });
      }
    },
    async isSessionRevoked(jti) {
      try {
        const result = await query(
          "SELECT open_ena_session_is_revoked($1) AS revoked",
          [jti],
        );
        if (typeof result.rows[0]?.revoked !== "boolean") {
          throw new TypeError("Invalid session revocation result.");
        }
        return result.rows[0].revoked;
      } catch (error) {
        throw new Error("Durable session revocation store is unavailable.", { cause: error });
      }
    },
    async revokeSession(jti, expiresAtSeconds) {
      if (!jti || !Number.isSafeInteger(expiresAtSeconds) || expiresAtSeconds < 1) {
        throw new TypeError("Invalid Open ENA session revocation.");
      }
      try {
        const result = await query(
          "SELECT open_ena_revoke_session($1,$2) AS revoked",
          [jti, expiresAtSeconds],
        );
        if (result.rows[0]?.revoked !== true) {
          throw new TypeError("Session revocation was not persisted.");
        }
      } catch (error) {
        throw new Error("Durable session revocation store is unavailable.", { cause: error });
      }
    },
  };
}

export const OPEN_ENA_AUTH_STORE_UNAVAILABLE_MESSAGE =
  "Open ENA secure authentication is unavailable.";
export const OPEN_ENA_AUTH_NOT_CONFIGURED_MESSAGE =
  "Open ENA secure authentication is not configured.";
export const OPEN_ENA_AUTH_ERROR_HEADER = "X-Open-ENA-Auth-Error";
export const OPEN_ENA_AUTH_UNAVAILABLE_RETRY_AFTER_SECONDS = 2;
export const OPEN_ENA_AUTH_STORE_CREATE_ATTEMPTS = 2;

export type OpenEnaAuthFailureReason =
  | "not-configured"
  | "store-unavailable"
  | "store-error";

export type OpenEnaAuthSecurityPool = {
  query(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
  on(event: "error", listener: (error: Error) => void): unknown;
  end(): Promise<void> | void;
};

export type OpenEnaAuthSecurityPoolFactory = (
  connectionString: string,
) => OpenEnaAuthSecurityPool | Promise<OpenEnaAuthSecurityPool>;

export type CreateProductionOpenEnaAuthSecurityStoreOptions = {
  createPool?: OpenEnaAuthSecurityPoolFactory;
};

type ProductionStoreGeneration = {
  promise: Promise<OpenEnaAuthSecurityStore | null>;
  pool: OpenEnaAuthSecurityPool | null;
};

const TRANSIENT_STORE_FAILURE_CODES: Record<string, true> = {
  ECONNABORTED: true,
  ECONNREFUSED: true,
  ECONNRESET: true,
  EPIPE: true,
  ETIMEDOUT: true,
  ENOTFOUND: true,
  EAI_AGAIN: true,
  EHOSTUNREACH: true,
  ENETUNREACH: true,
  "08000": true,
  "08001": true,
  "08003": true,
  "08004": true,
  "08006": true,
  "57P01": true,
  "57P02": true,
  "57P03": true,
  "53300": true,
};

let productionStore: ProductionStoreGeneration | null = null;

export function openEnaAuthFailureBody(reason: OpenEnaAuthFailureReason) {
  switch (reason) {
    case "not-configured":
      return OPEN_ENA_AUTH_NOT_CONFIGURED_MESSAGE;
    case "store-unavailable":
    case "store-error":
      return OPEN_ENA_AUTH_STORE_UNAVAILABLE_MESSAGE;
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}

export function openEnaAuthFailureHeaders(reason: OpenEnaAuthFailureReason): Record<string, string> {
  switch (reason) {
    case "not-configured":
      return { [OPEN_ENA_AUTH_ERROR_HEADER]: reason };
    case "store-unavailable":
    case "store-error":
      return {
        [OPEN_ENA_AUTH_ERROR_HEADER]: reason,
        "Retry-After": String(OPEN_ENA_AUTH_UNAVAILABLE_RETRY_AFTER_SECONDS),
      };
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}

function failureCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  return typeof error.code === "string" ? error.code : "";
}

function logAuthStoreFailure(event: string, error: unknown) {
  // Never log the error message: node-pg and URL parsers may embed the DSN.
  console.error("open-ena-auth-store", event, error instanceof Error ? error.name : typeof error, failureCode(error));
}

export function isTransientOpenEnaAuthStoreFailure(error: unknown) {
  const code = failureCode(error);
  if (code && TRANSIENT_STORE_FAILURE_CODES[code] === true) return true;
  if (!(error instanceof Error)) return false;
  return /Connection terminated(?: unexpectedly)?/u.test(error.message)
    || /timeout expired/iu.test(error.message)
    || /Cannot use a pool after calling end/u.test(error.message)
    || /Client has encountered a connection error/u.test(error.message);
}

export function invalidateProductionOpenEnaAuthSecurityStore() {
  const current = productionStore;
  productionStore = null;
  if (!current?.pool) return;
  void Promise.resolve(current.pool.end()).catch(() => undefined);
}

function discardGeneration(generation: ProductionStoreGeneration) {
  if (productionStore !== generation) return;
  const pool = generation.pool;
  generation.pool = null;
  productionStore = null;
  if (pool) void Promise.resolve(pool.end()).catch(() => undefined);
}

async function openAuthSecurityPool(
  databaseUrl: string,
  createPool?: OpenEnaAuthSecurityPoolFactory,
) {
  if (createPool) return createPool(databaseUrl);
  const { Pool } = await import("pg");
  return new Pool({
    connectionString: databaseUrl,
    max: 2,
    // Serverless Postgres (Neon and similar) can exceed 2s on a cold compute.
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 5_000,
    allowExitOnIdle: true,
  }) as OpenEnaAuthSecurityPool;
}

async function createPoolBackedStore(
  generation: ProductionStoreGeneration,
  databaseUrl: string,
  createPool?: OpenEnaAuthSecurityPoolFactory,
) {
  for (let attempt = 1; attempt <= OPEN_ENA_AUTH_STORE_CREATE_ATTEMPTS; attempt += 1) {
    try {
      const pool = await openAuthSecurityPool(databaseUrl, createPool);
      if (productionStore !== generation) {
        void Promise.resolve(pool.end()).catch(() => undefined);
        return null;
      }
      generation.pool = pool;
      pool.on("error", (error) => {
        logAuthStoreFailure("pool-error", error);
        discardGeneration(generation);
      });
      return createPostgresOpenEnaAuthSecurityStore(async (sql, params) => {
        try {
          const result = await pool.query(sql, params as unknown[]);
          return { rows: result.rows as Array<Record<string, unknown>> };
        } catch (error) {
          if (isTransientOpenEnaAuthStoreFailure(error)) {
            logAuthStoreFailure("query-transient", error);
            discardGeneration(generation);
          }
          throw error;
        }
      });
    } catch (error) {
      logAuthStoreFailure(
        attempt >= OPEN_ENA_AUTH_STORE_CREATE_ATTEMPTS ? "create-exhausted" : "create-retry",
        error,
      );
    }
  }
  return null;
}

export async function createProductionOpenEnaAuthSecurityStore(
  environment: OpenEnaAuthEnvironment = process.env,
  injectedQuery?: OpenEnaAuthSecurityQuery,
  options?: CreateProductionOpenEnaAuthSecurityStoreOptions,
): Promise<OpenEnaAuthSecurityStore | null> {
  if (injectedQuery) return createPostgresOpenEnaAuthSecurityStore(injectedQuery);
  if (productionStore) return productionStore.promise;
  const databaseUrl = configuredDatabaseUrl(environment);
  if (!databaseUrl) return null;

  const generation: ProductionStoreGeneration = {
    promise: Promise.resolve(null),
    pool: null,
  };
  generation.promise = createPoolBackedStore(generation, databaseUrl, options?.createPool);
  productionStore = generation;
  const store = await generation.promise;
  if (!store && productionStore === generation) discardGeneration(generation);
  return store;
}

export async function verifyProductionOpenEnaSessionTokenAny(
  token: string | undefined,
  nowMilliseconds = Date.now(),
  environment: OpenEnaAuthEnvironment = process.env,
  injectedQuery?: OpenEnaAuthSecurityQuery,
): Promise<OpenEnaPrincipal | null> {
  if (!openEnaAuthSecurityConfigurationReady(environment)) return null;
  const store = await createProductionOpenEnaAuthSecurityStore(environment, injectedQuery);
  if (!store) return null;
  return verifyOpenEnaSessionTokenAnyWithRevocation(
    token,
    store,
    nowMilliseconds,
    environment,
  );
}

/** Retained for callers that explicitly require the static-account v2 contract. */
export async function verifyProductionOpenEnaSessionTokenV2(
  token: string | undefined,
  nowMilliseconds = Date.now(),
  environment: OpenEnaAuthEnvironment = process.env,
  injectedQuery?: OpenEnaAuthSecurityQuery,
): Promise<OpenEnaPrincipal | null> {
  if (!openEnaAuthSecurityConfigurationReady(environment)) return null;
  const store = await createProductionOpenEnaAuthSecurityStore(environment, injectedQuery);
  if (!store) return null;
  return verifyOpenEnaSessionTokenV2WithRevocation(
    token,
    store,
    nowMilliseconds,
    environment,
  );
}
