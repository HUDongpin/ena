import { Pool, type PoolClient } from "pg";
import type { OpenEnaAuthEnvironment } from "../open-ena-auth";

export type OpenEnaCloudErrorCode = "invalid-input" | "invalid-token" | "unauthenticated" | "not-found" | "conflict" | "quota" | "rate-limited" | "too-large" | "unavailable";
export class OpenEnaCloudError extends Error {
  constructor(readonly code: OpenEnaCloudErrorCode) { super(`Open ENA cloud operation: ${code}.`); }
}

let productionPool: Pool | null = null;

export function openEnaCloudEnabled(environment: OpenEnaAuthEnvironment = process.env) {
  return environment.OPEN_ENA_CLOUD_PROJECTS_ENABLED === "true";
}

export function openEnaProjectKey(environment: OpenEnaAuthEnvironment = process.env): Buffer | null {
  const value = environment.OPEN_ENA_PROJECT_ENCRYPTION_KEY;
  return value && /^[a-f0-9]{64}$/iu.test(value) ? Buffer.from(value, "hex") : null;
}

export function getOpenEnaCloudPool(environment: OpenEnaAuthEnvironment = process.env): Pool {
  if (!openEnaCloudEnabled(environment)) throw new OpenEnaCloudError("unavailable");
  const raw = environment.OPEN_ENA_AUTH_DATABASE_URL?.trim();
  if (!raw) throw new OpenEnaCloudError("unavailable");
  const url = new URL(raw);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname.length < 2) throw new OpenEnaCloudError("unavailable");
  if (productionPool) return productionPool;
  const pool = new Pool({ connectionString: raw, max: 6, idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000, statement_timeout: 12_000 });
  pool.on("error", () => {
    // pg error objects may contain connection details. Never log them here.
    if (productionPool === pool) productionPool = null;
    void pool.end().catch(() => undefined);
  });
  productionPool = pool;
  return pool;
}

export async function inOpenEnaCloudTransaction<T>(pool: Pool, action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let clientError: Error | null = null;
  const onError = (error: Error) => { clientError = error; };
  client.on("error", onError);
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '8s'; SET LOCAL statement_timeout = '12s'; SET LOCAL idle_in_transaction_session_timeout = '15s'");
    const result = await action(client);
    if (clientError) throw clientError;
    await client.query("COMMIT");
    return result;
  } catch (error) {
    if (!clientError) await client.query("ROLLBACK").catch(() => { clientError = new Error("Cloud transaction rollback failed."); });
    throw error;
  } finally {
    client.removeListener("error", onError);
    client.release(clientError ?? undefined);
  }
}
