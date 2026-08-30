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

let productionStorePromise: Promise<OpenEnaAuthSecurityStore | null> | null = null;

export async function createProductionOpenEnaAuthSecurityStore(
  environment: OpenEnaAuthEnvironment = process.env,
  injectedQuery?: OpenEnaAuthSecurityQuery,
): Promise<OpenEnaAuthSecurityStore | null> {
  if (injectedQuery) return createPostgresOpenEnaAuthSecurityStore(injectedQuery);
  if (productionStorePromise) return productionStorePromise;
  const databaseUrl = configuredDatabaseUrl(environment);
  if (!databaseUrl) return null;

  const pending = import("pg")
    .then(({ Pool }) => {
      const pool = new Pool({
        connectionString: databaseUrl,
        max: 2,
        connectionTimeoutMillis: 2_000,
        idleTimeoutMillis: 30_000,
        statement_timeout: 5_000,
      });
      return createPostgresOpenEnaAuthSecurityStore(async (sql, params) => {
        const result = await pool.query(sql, params as unknown[]);
        return { rows: result.rows as Array<Record<string, unknown>> };
      });
    })
    .catch(() => null);
  productionStorePromise = pending;
  const store = await pending;
  if (!store && productionStorePromise === pending) productionStorePromise = null;
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
