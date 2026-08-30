import {
  openEnaV2AuthConfigurationReady,
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

export type OpenEnaAuthSecurityStore = OpenEnaSessionRevocationLookup & {
  consumeLoginAttempt(input: OpenEnaLoginAttempt): Promise<boolean>;
  revokeSession(jti: string, expiresAtSeconds: number): Promise<void>;
};

export type OpenEnaAuthSecurityQuery = (
  sql: string,
  params?: readonly unknown[],
) => Promise<{ rows: Array<Record<string, unknown>> }>;

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

export async function verifyProductionOpenEnaSessionTokenV2(
  token: string | undefined,
  nowMilliseconds = Date.now(),
  environment: OpenEnaAuthEnvironment = process.env,
): Promise<OpenEnaPrincipal | null> {
  if (!openEnaAuthSecurityConfigurationReady(environment)) return null;
  const store = await createProductionOpenEnaAuthSecurityStore(environment);
  if (!store) return null;
  return verifyOpenEnaSessionTokenV2WithRevocation(
    token,
    store,
    nowMilliseconds,
    environment,
  );
}
