#!/usr/bin/env node

import {
  createHash,
  createHmac,
  randomBytes as nodeRandomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RECEIPT_SCHEMA = "open-ena.production-auth-operator.v1";
const MIGRATION_ID = "004_open_ena_disposable_accounts";
const SESSION_COOKIE_NAME = "open-ena-session";
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const DEFAULT_READY_ATTEMPTS = 8;
const DEFAULT_READY_DELAY_MILLISECONDS = 1_000;
const SCRYPT_OPTIONS = Object.freeze({
  N: 16_384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
});
const POSTCONDITION_KEYS = Object.freeze([
  "migration_001_tables",
  "migration_001_function",
  "migration_002_tables",
  "migration_002_functions",
  "migration_003_table",
  "migration_003_function",
  "migration_004_table",
  "migration_004_function",
  "migration_004_columns",
  "migration_004_constraints",
  "migration_004_index",
  "migration_004_function_contract",
]);
const SAFE_FAILURE_CODES = new Set([
  "ACCOUNT_CONSUMPTION_NOT_OBSERVED",
  "ACCOUNT_DISABLE_FAILED",
  "AUTHENTICATED_CACHE_POLICY_INVALID",
  "AUTHENTICATED_REQUEST_FAILED",
  "AUTHENTICATED_RESPONSE_INVALID",
  "AUTHENTICATED_WORKSPACE_NOT_OBSERVED",
  "CLI_ARGUMENT_INVALID",
  "CLOCK_INVALID",
  "COMBINED_MODE_FORBIDDEN",
  "CONFIGURATION_INVALID",
  "DATABASE_BINDING_MISMATCH",
  "DATABASE_CONFIGURATION_INVALID",
  "DATABASE_CONNECTION_FAILED",
  "DATABASE_MIGRATION_FAILED",
  "DATABASE_PROVISIONING_FAILED",
  "DEPLOYMENT_ID_INVALID",
  "DISPOSABLE_ACCOUNT_INSERT_FAILED",
  "DISPOSABLE_ACCOUNT_REUSED",
  "DURABLE_REVOCATION_NOT_OBSERVED",
  "EXPECTED_GIT_SHA_INVALID",
  "LOGIN_CACHE_POLICY_INVALID",
  "LOGIN_COOKIE_INVALID",
  "LOGIN_COOKIE_MISSING",
  "LOGIN_COOKIE_SECURITY_INVALID",
  "LOGIN_REJECTED",
  "LOGIN_REQUEST_FAILED",
  "LOGIN_SESSION_INVALID",
  "LOGOUT_CACHE_POLICY_INVALID",
  "LOGOUT_COOKIE_NOT_CLEARED",
  "LOGOUT_REJECTED",
  "LOGOUT_REQUEST_FAILED",
  "MIGRATION_INPUT_INVALID",
  "MIGRATION_POSTCONDITION_FAILED",
  "MODE_INVALID",
  "OLD_TOKEN_REPLAY_ACCEPTED",
  "OPERATOR_DEPENDENCY_INVALID",
  "OPERATOR_EXECUTION_FAILED",
  "PASSWORD_DERIVATION_FAILED",
  "PROOF_MODE_MIGRATION_INPUT_FORBIDDEN",
  "RANDOM_SOURCE_INVALID",
  "REPLAY_CACHE_POLICY_INVALID",
  "REPLAY_REQUEST_FAILED",
  "REPLAY_RESPONSE_INVALID",
  "SECOND_LOGIN_CACHE_POLICY_INVALID",
  "SECOND_LOGIN_REQUEST_FAILED",
  "SESSION_SECRET_INVALID",
  "TARGET_NOT_READY",
  "TARGET_ORIGIN_INVALID",
]);

const POSTCONDITIONS_SQL = `
SELECT
  (
    to_regclass('public.open_ena_quota_windows') IS NOT NULL
    AND to_regclass('public.open_ena_spend') IS NOT NULL
    AND to_regclass('public.open_ena_billable_reservations') IS NOT NULL
    AND to_regclass('public.open_ena_security_outbox') IS NOT NULL
  ) AS migration_001_tables,
  to_regprocedure('public.open_ena_consume_quota(text,text,integer)') IS NOT NULL
    AS migration_001_function,
  (
    to_regclass('public.open_ena_auth_attempt_windows') IS NOT NULL
    AND to_regclass('public.open_ena_revoked_sessions') IS NOT NULL
  ) AS migration_002_tables,
  (
    to_regprocedure('public.open_ena_consume_login_attempt(text,text,integer,integer,integer)') IS NOT NULL
    AND to_regprocedure('public.open_ena_revoke_session(text,bigint)') IS NOT NULL
    AND to_regprocedure('public.open_ena_session_is_revoked(text)') IS NOT NULL
  ) AS migration_002_functions,
  to_regclass('public.open_ena_ai_consent_receipts') IS NOT NULL
    AS migration_003_table,
  to_regprocedure('public.open_ena_record_ai_consent_receipt(text,text,text,text,text,text)') IS NOT NULL
    AS migration_003_function,
  to_regclass('public.open_ena_disposable_accounts') IS NOT NULL
    AS migration_004_table,
  to_regprocedure('public.open_ena_consume_disposable_account(text,bytea)') IS NOT NULL
    AS migration_004_function,
  (
    SELECT COALESCE(
      array_agg(
        column_name || ':' || udt_name || ':' || is_nullable
        ORDER BY ordinal_position
      ),
      ARRAY[]::text[]
    ) = ARRAY[
      'username_ref:text:NO',
      'password_salt:bytea:NO',
      'password_hash:bytea:NO',
      'principal_ref:text:NO',
      'expires_at:timestamptz:NO',
      'consumed_at:timestamptz:YES',
      'disabled_at:timestamptz:YES',
      'created_at:timestamptz:NO'
    ]::text[]
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'open_ena_disposable_accounts'
  ) AS migration_004_columns,
  (
    SELECT
      count(*) FILTER (WHERE contype = 'p') = 1
      AND count(*) FILTER (WHERE contype = 'u') >= 1
      AND count(*) FILTER (WHERE contype = 'c') >= 7
      AND lower(COALESCE(string_agg(pg_get_constraintdef(oid), ' '), ''))
        LIKE '%primary key (username_ref)%'
      AND lower(COALESCE(string_agg(pg_get_constraintdef(oid), ' '), ''))
        LIKE '%unique (principal_ref)%'
      AND lower(COALESCE(string_agg(pg_get_constraintdef(oid), ' '), ''))
        LIKE '%octet_length(password_salt) = 16%'
      AND lower(COALESCE(string_agg(pg_get_constraintdef(oid), ' '), ''))
        LIKE '%octet_length(password_hash) = 32%'
      AND lower(COALESCE(string_agg(pg_get_constraintdef(oid), ' '), ''))
        LIKE '%expires_at > created_at%'
      AND lower(COALESCE(string_agg(pg_get_constraintdef(oid), ' '), ''))
        LIKE '%consumed_at is null%'
      AND lower(COALESCE(string_agg(pg_get_constraintdef(oid), ' '), ''))
        LIKE '%disabled_at is null%'
    FROM pg_constraint
    WHERE conrelid = to_regclass('public.open_ena_disposable_accounts')
  ) AS migration_004_constraints,
  (
    to_regclass('public.open_ena_disposable_accounts_expiry_idx') IS NOT NULL
    AND lower(COALESCE(pg_get_indexdef(
      to_regclass('public.open_ena_disposable_accounts_expiry_idx')
    ), '')) LIKE '%(expires_at)%'
  ) AS migration_004_index,
  (
    SELECT
      lower(COALESCE(pg_get_functiondef(
        to_regprocedure('public.open_ena_consume_disposable_account(text,bytea)')
      ), '')) LIKE '%update open_ena_disposable_accounts%'
      AND lower(COALESCE(pg_get_functiondef(
        to_regprocedure('public.open_ena_consume_disposable_account(text,bytea)')
      ), '')) LIKE '%password_hash = p_password_hash%'
      AND lower(COALESCE(pg_get_functiondef(
        to_regprocedure('public.open_ena_consume_disposable_account(text,bytea)')
      ), '')) LIKE '%consumed_at is null%'
      AND lower(COALESCE(pg_get_functiondef(
        to_regprocedure('public.open_ena_consume_disposable_account(text,bytea)')
      ), '')) LIKE '%disabled_at is null%'
      AND lower(COALESCE(pg_get_functiondef(
        to_regprocedure('public.open_ena_consume_disposable_account(text,bytea)')
      ), '')) LIKE '%expires_at > v_now%'
      AND lower(COALESCE(pg_get_functiondef(
        to_regprocedure('public.open_ena_consume_disposable_account(text,bytea)')
      ), '')) LIKE '%returning principal_ref%'
  ) AS migration_004_function_contract
`;

const INSERT_ACCOUNT_SQL = `
INSERT INTO open_ena_disposable_accounts (
  username_ref,
  password_salt,
  password_hash,
  principal_ref,
  expires_at
) VALUES ($1, $2, $3, $4, clock_timestamp() + interval '15 minutes')
ON CONFLICT (username_ref) DO NOTHING
RETURNING true AS inserted
`;

const REVOCATION_EVIDENCE_SQL = `
SELECT
  open_ena_session_is_revoked($1) AS function_revoked,
  EXISTS (
    SELECT 1
    FROM open_ena_revoked_sessions
    WHERE jti = $1 AND expires_at > clock_timestamp()
  ) AS row_revoked
`;

class OperatorError extends Error {
  constructor(code) {
    super(code);
    this.name = "OperatorError";
    this.code = code;
  }
}

function fail(code, cause) {
  // Raw transport/database causes can embed URLs, query parameters, or derived
  // identifiers. The operator exposes only a fixed, enumerable-safe code.
  void cause;
  throw new OperatorError(code);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function equalSecret(left, right) {
  const leftDigest = createHash("sha256").update(left, "utf8").digest();
  const rightDigest = createHash("sha256").update(right, "utf8").digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function validateDatabaseUrl(value) {
  if (typeof value !== "string" || value.length === 0) fail("DATABASE_CONFIGURATION_INVALID");
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:")
      || !parsed.hostname
      || !parsed.pathname
      || parsed.pathname === "/"
    ) fail("DATABASE_CONFIGURATION_INVALID");
  } catch (error) {
    if (error instanceof OperatorError) throw error;
    fail("DATABASE_CONFIGURATION_INVALID", error);
  }
  return value;
}

function validateTargetOrigin(value) {
  if (typeof value !== "string" || value.length === 0) fail("TARGET_ORIGIN_INVALID");
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:"
      || parsed.username
      || parsed.password
      || parsed.pathname !== "/"
      || parsed.search
      || parsed.hash
    ) fail("TARGET_ORIGIN_INVALID");
    return parsed.origin;
  } catch (error) {
    if (error instanceof OperatorError) throw error;
    fail("TARGET_ORIGIN_INVALID", error);
  }
}

function databaseConfiguration(environment) {
  if (!environment || typeof environment !== "object") fail("CONFIGURATION_INVALID");
  const authDatabaseUrl = validateDatabaseUrl(environment.OPEN_ENA_AUTH_DATABASE_URL);
  const billableDatabaseUrl = validateDatabaseUrl(environment.OPEN_ENA_BILLABLE_DATABASE_URL);
  if (!equalSecret(authDatabaseUrl, billableDatabaseUrl)) fail("DATABASE_BINDING_MISMATCH");
  return { authDatabaseUrl };
}

function proofConfiguration(environment) {
  const { authDatabaseUrl } = databaseConfiguration(environment);
  const sessionSecret = environment.OPEN_ENA_SESSION_SECRET;
  if (typeof sessionSecret !== "string" || sessionSecret.length < 32) {
    fail("SESSION_SECRET_INVALID");
  }
  const targetOrigin = validateTargetOrigin(
    environment.OPEN_ENA_OPERATOR_TARGET_ORIGIN ?? environment.OPEN_ENA_PUBLIC_ORIGIN,
  );
  return { authDatabaseUrl, sessionSecret, targetOrigin };
}

function exactRandomBytes(randomBytes, length, code) {
  let value;
  try {
    value = randomBytes(length);
  } catch (error) {
    fail(code, error);
  }
  if (!(value instanceof Uint8Array) || value.byteLength !== length) fail(code);
  return Buffer.from(value);
}

function derivePasswordHash(password, salt) {
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, 32, SCRYPT_OPTIONS, (error, key) => {
      if (error) reject(error);
      else resolve(Buffer.from(key));
    });
  });
}

export function deriveOpenEnaDisposableUsernameRef(username, sessionSecret) {
  return createHmac("sha256", sessionSecret)
    .update(`open-ena-disposable-username:${username}`, "utf8")
    .digest("base64url");
}

async function readBoundedText(response, failureCode) {
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) {
    fail(failureCode);
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let total = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        fail(failureCode);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } catch (error) {
    if (error instanceof OperatorError) throw error;
    fail(failureCode, error);
  } finally {
    reader.releaseLock();
  }
}

function setCookieValues(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const combined = headers.get("set-cookie");
  return combined ? [combined] : [];
}

function sessionSetCookie(headers) {
  return setCookieValues(headers).find((value) => (
    value.trim().toLowerCase().startsWith(`${SESSION_COOKIE_NAME}=`)
  )) ?? null;
}

function parseSessionCookie(setCookie) {
  if (!setCookie) fail("LOGIN_COOKIE_MISSING");
  const segments = setCookie.split(";").map((segment) => segment.trim());
  const separator = segments[0].indexOf("=");
  if (separator < 1 || segments[0].slice(0, separator) !== SESSION_COOKIE_NAME) {
    fail("LOGIN_COOKIE_INVALID");
  }
  const rawValue = segments[0].slice(separator + 1);
  if (!rawValue) fail("LOGIN_COOKIE_INVALID");
  const attributes = new Set(segments.slice(1).map((segment) => segment.toLowerCase()));
  if (
    !attributes.has("httponly")
    || !attributes.has("secure")
    || !attributes.has("samesite=lax")
    || !attributes.has("path=/")
    || !attributes.has("max-age=900")
  ) fail("LOGIN_COOKIE_SECURITY_INVALID");
  return {
    header: `${SESSION_COOKIE_NAME}=${rawValue}`,
    token: decodeURIComponent(rawValue),
    security: {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAgeSeconds: 900,
    },
  };
}

function clearedSessionCookieIsSecure(setCookie) {
  if (!setCookie) return false;
  const segments = setCookie.split(";").map((segment) => segment.trim());
  const separator = segments[0].indexOf("=");
  if (
    separator < 1
    || segments[0].slice(0, separator) !== SESSION_COOKIE_NAME
    || segments[0].slice(separator + 1) !== ""
  ) return false;
  const attributes = new Set(segments.slice(1).map((segment) => segment.toLowerCase()));
  return attributes.has("httponly")
    && attributes.has("secure")
    && attributes.has("samesite=lax")
    && attributes.has("path=/")
    && attributes.has("max-age=0");
}

function noStoreObserved(response) {
  return (response.headers.get("cache-control") ?? "")
    .split(",")
    .some((directive) => directive.trim().toLowerCase() === "no-store");
}

export function verifyOperatorDisposableSessionToken(
  token,
  expectedPrincipalRef,
  sessionSecret,
  nowMilliseconds,
) {
  if (
    typeof token !== "string"
    || typeof expectedPrincipalRef !== "string"
    || !/^d_[A-Za-z0-9_-]{43}$/u.test(expectedPrincipalRef)
    || typeof sessionSecret !== "string"
    || sessionSecret.length < 32
    || !Number.isSafeInteger(nowMilliseconds)
  ) return null;
  const segments = token.split(".");
  if (
    segments.length !== 5
    || segments[0] !== "v3"
    || !/^\d+$/u.test(segments[1])
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(segments[2])
    || !/^d_[A-Za-z0-9_-]{43}$/u.test(segments[3])
    || !/^[A-Za-z0-9_-]{43}$/u.test(segments[4])
  ) return null;
  const issuedAtSeconds = Number(segments[1]);
  const nowSeconds = Math.floor(nowMilliseconds / 1_000);
  if (
    !Number.isSafeInteger(issuedAtSeconds)
    || issuedAtSeconds > nowSeconds + 60
    || nowSeconds - issuedAtSeconds >= 15 * 60
    || !equalSecret(segments[3], expectedPrincipalRef)
  ) return null;
  const payload = segments.slice(0, 4).join(".");
  const expectedSignature = createHmac("sha256", sessionSecret)
    .update(payload, "utf8")
    .digest("base64url");
  if (!equalSecret(segments[4], expectedSignature)) return null;
  return {
    jti: segments[2],
    expiresAtSeconds: issuedAtSeconds + 15 * 60,
  };
}

function redirectMatches(response, origin, path, invalid = false) {
  if (response.status !== 303) return false;
  const location = response.headers.get("location");
  if (!location) return false;
  try {
    const parsed = new URL(location, origin);
    return parsed.origin === origin
      && parsed.pathname === path
      && (invalid ? parsed.searchParams.get("auth") === "invalid" : parsed.search === "");
  } catch {
    return false;
  }
}

function requestInitWithTimeout(init, timeoutMilliseconds) {
  return { ...init, signal: AbortSignal.timeout(timeoutMilliseconds) };
}

async function request(fetchImpl, url, init, failureCode, timeoutMilliseconds) {
  try {
    return await fetchImpl(url, requestInitWithTimeout(init, timeoutMilliseconds));
  } catch (error) {
    fail(failureCode, error);
  }
}

async function waitForTarget(
  fetchImpl,
  targetUrl,
  attempts,
  delayMilliseconds,
  timeoutMilliseconds,
  sleep,
) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(targetUrl, requestInitWithTimeout({
        method: "GET",
        redirect: "manual",
        headers: { accept: "text/html" },
      }, timeoutMilliseconds));
      if (response.status === 200) return response.status;
    } catch {
      // A bounded retry hides transport diagnostics that may contain secret-bearing URLs.
    }
    if (attempt < attempts) await sleep(delayMilliseconds);
  }
  fail("TARGET_NOT_READY");
}

function formHeaders(origin, cookie) {
  const headers = new Headers({
    "content-type": "application/x-www-form-urlencoded",
    origin,
  });
  if (cookie) headers.set("cookie", cookie);
  return headers;
}

async function disableAccount(database, usernameRef) {
  const result = await database.query(
    `UPDATE open_ena_disposable_accounts
     SET disabled_at = COALESCE(disabled_at, clock_timestamp())
     WHERE username_ref = $1
     RETURNING disabled_at IS NOT NULL AS disabled`,
    [usernameRef],
  );
  return result.rowCount === 1 && result.rows[0]?.disabled === true;
}

async function readRevocationEvidence(database, jti) {
  const result = await database.query(REVOCATION_EVIDENCE_SQL, [jti]);
  return {
    functionObserved: result.rows[0]?.function_revoked === true,
    rowObserved: result.rows[0]?.row_revoked === true,
  };
}

function checkMigrationPostconditions(result) {
  const row = result.rows?.[0];
  return Boolean(row && POSTCONDITION_KEYS.every((key) => row[key] === true));
}

async function applyMigrationAndVerify(database, migrationSql) {
  try {
    await database.query("BEGIN");
    await database.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0)) AS locked",
      ["open-ena:migration:004"],
    );
    await database.query(migrationSql);
    const postconditions = await database.query(POSTCONDITIONS_SQL);
    if (!checkMigrationPostconditions(postconditions)) fail("MIGRATION_POSTCONDITION_FAILED");
    await database.query("COMMIT");
  } catch (error) {
    await database.query("ROLLBACK").catch(() => undefined);
    if (error instanceof OperatorError) throw error;
    fail("DATABASE_MIGRATION_FAILED", error);
  }
}

async function openDatabase(databaseFactory, databaseUrl) {
  if (typeof databaseFactory !== "function") fail("OPERATOR_DEPENDENCY_INVALID");
  let database;
  try {
    database = await databaseFactory(databaseUrl);
  } catch (error) {
    fail("DATABASE_CONNECTION_FAILED", error);
  }
  if (!database || typeof database.query !== "function" || typeof database.close !== "function") {
    fail("DATABASE_CONNECTION_FAILED");
  }
  return database;
}

function migrationReceipt(migrationSql, observedAtMilliseconds) {
  return {
    schemaVersion: RECEIPT_SCHEMA,
    status: "PASS",
    mode: "migration",
    evidenceLevel: "target-postgresql-migration",
    observedAt: new Date(observedAtMilliseconds).toISOString(),
    databaseBinding: {
      authAndBillableSecretsEqual: true,
      allMigrationsPresentOnOneConnection: true,
      migrationExecutionAndVerificationSameConnection: true,
    },
    migration: {
      id: MIGRATION_ID,
      sha256: sha256(Buffer.from(migrationSql, "utf8")),
      bytes: Buffer.byteLength(migrationSql, "utf8"),
      applied: true,
      postconditions: Object.fromEntries(POSTCONDITION_KEYS.map((key) => [key, true])),
    },
  };
}

export async function runOpenEnaProductionAuthOperator({
  mode,
  environment = process.env,
  migrationSql,
  expectedFinalGitSha,
  deploymentId,
  dependencies = {},
} = {}) {
  const databaseFactory = dependencies.databaseFactory;
  const now = dependencies.now ?? Date.now;
  const observedAtMilliseconds = now();
  if (!Number.isSafeInteger(observedAtMilliseconds) || observedAtMilliseconds < 1) {
    fail("CLOCK_INVALID");
  }
  if (mode !== "migration" && mode !== "proof" && mode !== "all") fail("MODE_INVALID");
  if (mode === "all" && dependencies.allowCombinedMode !== true) fail("COMBINED_MODE_FORBIDDEN");
  if ((mode === "migration" || mode === "all")
      && (typeof migrationSql !== "string" || migrationSql.length === 0)) {
    fail("MIGRATION_INPUT_INVALID");
  }
  if (mode === "proof" && migrationSql !== undefined) fail("PROOF_MODE_MIGRATION_INPUT_FORBIDDEN");

  if (mode === "migration") {
    const configured = databaseConfiguration(environment);
    const database = await openDatabase(databaseFactory, configured.authDatabaseUrl);
    try {
      await applyMigrationAndVerify(database, migrationSql);
      return migrationReceipt(migrationSql, observedAtMilliseconds);
    } finally {
      await database.close().catch(() => undefined);
    }
  }

  const configured = proofConfiguration(environment);
  if (typeof expectedFinalGitSha !== "string" || !/^[0-9a-f]{40}$/u.test(expectedFinalGitSha)) {
    fail("EXPECTED_GIT_SHA_INVALID");
  }
  if (
    typeof deploymentId !== "string"
    || !/^dpl_[A-Za-z0-9]{1,120}$/u.test(deploymentId)
  ) fail("DEPLOYMENT_ID_INVALID");
  const fetchImpl = dependencies.fetch ?? globalThis.fetch;
  const randomBytes = dependencies.randomBytes ?? nodeRandomBytes;
  const sleep = dependencies.sleep ?? ((milliseconds) => new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  }));
  const readyAttempts = dependencies.readyAttempts ?? DEFAULT_READY_ATTEMPTS;
  const readyDelayMilliseconds = dependencies.readyDelayMilliseconds
    ?? DEFAULT_READY_DELAY_MILLISECONDS;
  const requestTimeoutMilliseconds = dependencies.requestTimeoutMilliseconds ?? 10_000;
  if (typeof databaseFactory !== "function" || typeof fetchImpl !== "function") {
    fail("OPERATOR_DEPENDENCY_INVALID");
  }
  if (!Number.isSafeInteger(readyAttempts) || readyAttempts < 1 || readyAttempts > 60) {
    fail("OPERATOR_DEPENDENCY_INVALID");
  }
  if (
    !Number.isSafeInteger(readyDelayMilliseconds)
    || readyDelayMilliseconds < 0
    || readyDelayMilliseconds > 30_000
  ) fail("OPERATOR_DEPENDENCY_INVALID");
  if (
    !Number.isSafeInteger(requestTimeoutMilliseconds)
    || requestTimeoutMilliseconds < 1_000
    || requestTimeoutMilliseconds > 30_000
  ) fail("OPERATOR_DEPENDENCY_INVALID");

  const usernameBytes = exactRandomBytes(randomBytes, 24, "RANDOM_SOURCE_INVALID");
  const passwordBytes = exactRandomBytes(randomBytes, 32, "RANDOM_SOURCE_INVALID");
  const passwordSalt = exactRandomBytes(randomBytes, 16, "RANDOM_SOURCE_INVALID");
  const principalBytes = exactRandomBytes(randomBytes, 32, "RANDOM_SOURCE_INVALID");
  const username = `ena-operator-${usernameBytes.toString("base64url")}`;
  const password = passwordBytes.toString("base64url");
  const usernameRef = deriveOpenEnaDisposableUsernameRef(username, configured.sessionSecret);
  const principalRef = `d_${principalBytes.toString("base64url")}`;
  let passwordHash;
  try {
    passwordHash = await derivePasswordHash(password, passwordSalt);
  } catch (error) {
    fail("PASSWORD_DERIVATION_FAILED", error);
  } finally {
    usernameBytes.fill(0);
    passwordBytes.fill(0);
    principalBytes.fill(0);
  }

  let database;
  let provisioned = false;
  let accountDisabled = false;
  let issuedSession = null;
  let sessionRevocationObserved = false;
  try {
    try {
      database = await openDatabase(databaseFactory, configured.authDatabaseUrl);
    } catch (error) {
      if (error instanceof OperatorError) throw error;
      fail("DATABASE_CONNECTION_FAILED", error);
    }

    try {
      if (mode === "all") await applyMigrationAndVerify(database, migrationSql);
      else {
        const postconditions = await database.query(POSTCONDITIONS_SQL);
        if (!checkMigrationPostconditions(postconditions)) fail("MIGRATION_POSTCONDITION_FAILED");
      }
      await database.query("BEGIN");
      const inserted = await database.query(INSERT_ACCOUNT_SQL, [
        usernameRef,
        Buffer.from(passwordSalt),
        Buffer.from(passwordHash),
        principalRef,
      ]);
      if (inserted.rowCount !== 1 || inserted.rows[0]?.inserted !== true) {
        fail("DISPOSABLE_ACCOUNT_INSERT_FAILED");
      }
      await database.query("COMMIT");
      provisioned = true;
    } catch (error) {
      await database.query("ROLLBACK").catch(() => undefined);
      if (error instanceof OperatorError) throw error;
      fail("DATABASE_PROVISIONING_FAILED", error);
    } finally {
      passwordSalt.fill(0);
      passwordHash.fill(0);
    }

    const workspacePath = "/en/open-ena";
    const workspaceUrl = `${configured.targetOrigin}${workspacePath}`;
    const loginUrl = `${configured.targetOrigin}/api/open-ena/login`;
    const logoutUrl = `${configured.targetOrigin}/api/open-ena/logout`;
    const readinessStatus = await waitForTarget(
      fetchImpl,
      workspaceUrl,
      readyAttempts,
      readyDelayMilliseconds,
      requestTimeoutMilliseconds,
      sleep,
    );

    const loginBody = new URLSearchParams({ locale: "en", username, password }).toString();
    const login = await request(fetchImpl, loginUrl, {
      method: "POST",
      redirect: "manual",
      headers: formHeaders(configured.targetOrigin),
      body: loginBody,
    }, "LOGIN_REQUEST_FAILED", requestTimeoutMilliseconds);
    const loginRedirectSameOrigin = redirectMatches(login, configured.targetOrigin, workspacePath);
    if (!loginRedirectSameOrigin) fail("LOGIN_REJECTED");
    const loginNoStoreObserved = noStoreObserved(login);
    if (!loginNoStoreObserved) fail("LOGIN_CACHE_POLICY_INVALID");
    const session = parseSessionCookie(sessionSetCookie(login.headers));
    const verifiedSession = verifyOperatorDisposableSessionToken(
      session.token,
      principalRef,
      configured.sessionSecret,
      now(),
    );
    if (!verifiedSession) fail("LOGIN_SESSION_INVALID");
    const { jti } = verifiedSession;
    issuedSession = {
      cookieHeader: session.header,
      jti,
      expiresAtSeconds: verifiedSession.expiresAtSeconds,
    };

    const authenticated = await request(fetchImpl, workspaceUrl, {
      method: "GET",
      redirect: "manual",
      headers: { accept: "text/html", cookie: session.header },
    }, "AUTHENTICATED_REQUEST_FAILED", requestTimeoutMilliseconds);
    const authenticatedBody = await readBoundedText(authenticated, "AUTHENTICATED_RESPONSE_INVALID");
    const authenticatedNoStoreObserved = noStoreObserved(authenticated);
    if (!authenticatedNoStoreObserved) fail("AUTHENTICATED_CACHE_POLICY_INVALID");
    const workspaceObserved = authenticated.status === 200
      && authenticatedBody.includes("open-ena-workbench")
      && !authenticatedBody.includes("open-ena-login-form");
    if (!workspaceObserved) fail("AUTHENTICATED_WORKSPACE_NOT_OBSERVED");

    const logout = await request(fetchImpl, logoutUrl, {
      method: "POST",
      redirect: "manual",
      headers: formHeaders(configured.targetOrigin, session.header),
      body: "locale=en",
    }, "LOGOUT_REQUEST_FAILED", requestTimeoutMilliseconds);
    const logoutRedirectSameOrigin = redirectMatches(logout, configured.targetOrigin, workspacePath);
    if (!logoutRedirectSameOrigin) fail("LOGOUT_REJECTED");
    const logoutNoStoreObserved = noStoreObserved(logout);
    if (!logoutNoStoreObserved) fail("LOGOUT_CACHE_POLICY_INVALID");
    const logoutCookieSecurityObserved = clearedSessionCookieIsSecure(
      sessionSetCookie(logout.headers),
    );
    const logoutCookieCleared = logoutCookieSecurityObserved;
    if (!logoutCookieCleared) fail("LOGOUT_COOKIE_NOT_CLEARED");

    const revocation = await readRevocationEvidence(database, jti);
    const durableRevocationFunctionObserved = revocation.functionObserved;
    const durableRevocationRowObserved = revocation.rowObserved;
    const durableRevocationObserved = durableRevocationFunctionObserved
      && durableRevocationRowObserved;
    if (!durableRevocationObserved) fail("DURABLE_REVOCATION_NOT_OBSERVED");
    sessionRevocationObserved = true;

    const replay = await request(fetchImpl, workspaceUrl, {
      method: "GET",
      redirect: "manual",
      headers: { accept: "text/html", cookie: session.header },
    }, "REPLAY_REQUEST_FAILED", requestTimeoutMilliseconds);
    const replayBody = await readBoundedText(replay, "REPLAY_RESPONSE_INVALID");
    const oldTokenReplayNoStoreObserved = noStoreObserved(replay);
    if (!oldTokenReplayNoStoreObserved) fail("REPLAY_CACHE_POLICY_INVALID");
    const oldTokenReplayRejected = replay.status === 200
      && replayBody.includes("open-ena-login-form")
      && !replayBody.includes("open-ena-workbench");
    if (!oldTokenReplayRejected) fail("OLD_TOKEN_REPLAY_ACCEPTED");

    const secondLogin = await request(fetchImpl, loginUrl, {
      method: "POST",
      redirect: "manual",
      headers: formHeaders(configured.targetOrigin),
      body: loginBody,
    }, "SECOND_LOGIN_REQUEST_FAILED", requestTimeoutMilliseconds);
    const secondLoginInvalidRedirectObserved = redirectMatches(
      secondLogin,
      configured.targetOrigin,
      workspacePath,
      true,
    );
    const secondLoginNoStoreObserved = noStoreObserved(secondLogin);
    if (!secondLoginNoStoreObserved) fail("SECOND_LOGIN_CACHE_POLICY_INVALID");
    const secondLoginRejected = secondLoginInvalidRedirectObserved
      && sessionSetCookie(secondLogin.headers) === null;
    if (!secondLoginRejected) fail("DISPOSABLE_ACCOUNT_REUSED");

    const accountState = await database.query(
      `SELECT consumed_at IS NOT NULL AS consumed,
         disabled_at IS NOT NULL AS disabled
       FROM open_ena_disposable_accounts
       WHERE username_ref = $1`,
      [usernameRef],
    );
    const accountConsumed = accountState.rowCount === 1
      && accountState.rows[0]?.consumed === true;
    if (!accountConsumed) fail("ACCOUNT_CONSUMPTION_NOT_OBSERVED");
    accountDisabled = await disableAccount(database, usernameRef);
    if (!accountDisabled) fail("ACCOUNT_DISABLE_FAILED");

    return {
      schemaVersion: RECEIPT_SCHEMA,
      status: "PASS",
      mode,
      evidenceLevel: "live-production-http-and-target-postgresql",
      observedAt: new Date(observedAtMilliseconds).toISOString(),
      deploymentBinding: {
        expectedFinalGitSha,
        deploymentId,
        controlPlaneBinding: "EXTERNAL_CROSS_CHECK_REQUIRED",
      },
      target: {
        origin: configured.targetOrigin,
        workspacePath,
      },
      databaseBinding: {
        authAndBillableSecretsEqual: true,
        allMigrationsPresentOnOneConnection: true,
        migrationVerificationAndProvisioningSameConnection: true,
      },
      migration: mode === "all" ? {
        id: MIGRATION_ID,
        sha256: sha256(Buffer.from(migrationSql, "utf8")),
        bytes: Buffer.byteLength(migrationSql, "utf8"),
        applied: true,
        verifiedPresent: true,
        postconditions: Object.fromEntries(POSTCONDITION_KEYS.map((key) => [key, true])),
      } : {
        id: MIGRATION_ID,
        applied: false,
        verifiedPresent: true,
        postconditions: Object.fromEntries(POSTCONDITION_KEYS.map((key) => [key, true])),
      },
      credentialCustody: {
        usernameEntropyBits: 192,
        passwordEntropyBits: 256,
        rawValuesPersisted: false,
        persistedFields: [
          "username_ref",
          "password_salt",
          "password_hash",
          "principal_ref",
          "expires_at",
          "consumed_at",
          "disabled_at",
        ],
      },
      flow: {
        readinessStatus,
        loginStatus: login.status,
        loginNoStoreObserved,
        loginRedirectSameOrigin,
        secureCookieObserved: true,
        cookieHttpOnly: session.security.httpOnly,
        cookieSecure: session.security.secure,
        cookieSameSite: session.security.sameSite,
        cookiePath: session.security.path,
        cookieMaxAgeSeconds: session.security.maxAgeSeconds,
        authenticatedRequestStatus: authenticated.status,
        authenticatedNoStoreObserved,
        workspaceObserved,
        logoutStatus: logout.status,
        logoutNoStoreObserved,
        logoutRedirectSameOrigin,
        logoutCookieCleared,
        logoutCookieSecurityObserved,
        durableRevocationObserved,
        durableRevocationFunctionObserved,
        durableRevocationRowObserved,
        oldTokenReplayStatus: replay.status,
        oldTokenReplayNoStoreObserved,
        oldTokenReplayRejected,
        secondLoginStatus: secondLogin.status,
        secondLoginNoStoreObserved,
        secondLoginInvalidRedirectObserved,
        secondLoginRejected,
        accountConsumed,
        accountDisabled,
      },
    };
  } catch (error) {
    if (database && issuedSession && !sessionRevocationObserved) {
      let cleanupLogoutCompleted = false;
      try {
        const cleanupLogout = await fetchImpl(
          `${configured.targetOrigin}/api/open-ena/logout`,
          requestInitWithTimeout({
            method: "POST",
            redirect: "manual",
            headers: formHeaders(configured.targetOrigin, issuedSession.cookieHeader),
            body: "locale=en",
          }, requestTimeoutMilliseconds),
        );
        cleanupLogoutCompleted = cleanupLogout.status === 303;
      } catch {
        cleanupLogoutCompleted = false;
      }
      let cleanupRevocationObserved = false;
      if (cleanupLogoutCompleted) {
        try {
          const evidence = await readRevocationEvidence(database, issuedSession.jti);
          cleanupRevocationObserved = evidence.functionObserved && evidence.rowObserved;
        } catch {
          cleanupRevocationObserved = false;
        }
      }
      if (!cleanupRevocationObserved) {
        await database.query(
          "SELECT open_ena_revoke_session($1,$2) AS revoked",
          [issuedSession.jti, issuedSession.expiresAtSeconds],
        ).catch(() => undefined);
      }
    }
    if (database && provisioned && !accountDisabled) {
      await disableAccount(database, usernameRef).catch(() => false);
    }
    if (error instanceof OperatorError) throw error;
    fail("OPERATOR_EXECUTION_FAILED", error);
  } finally {
    if (database) await database.close().catch(() => undefined);
  }
}

export { OperatorError };

export function createSafeOperatorFailureReceipt(error, mode, nowMilliseconds = Date.now()) {
  const safeMode = mode === "migration" || mode === "proof" ? mode : "invalid";
  const safeTimestamp = Number.isSafeInteger(nowMilliseconds) && nowMilliseconds >= 0
    ? nowMilliseconds
    : 0;
  const failureCode = error instanceof OperatorError
    && typeof error.code === "string"
    && SAFE_FAILURE_CODES.has(error.code)
    ? error.code
    : "UNEXPECTED_FAILURE";
  return {
    schemaVersion: RECEIPT_SCHEMA,
    status: "FAIL",
    mode: safeMode,
    observedAt: new Date(safeTimestamp).toISOString(),
    failureCode,
  };
}

function parseCliArguments(argv) {
  const parsed = {};
  const fields = new Map([
    ["--mode", "mode"],
    ["--expected-final-git-sha", "expectedFinalGitSha"],
    ["--deployment-id", "deploymentId"],
  ]);
  for (const argument of argv) {
    if (typeof argument !== "string" || /[\u0000-\u001f\u007f]/u.test(argument)) {
      fail("CLI_ARGUMENT_INVALID");
    }
    const separator = argument.indexOf("=");
    if (separator < 1) fail("CLI_ARGUMENT_INVALID");
    const flag = argument.slice(0, separator);
    const value = argument.slice(separator + 1);
    const field = fields.get(flag);
    if (!field || !value || Object.hasOwn(parsed, field)) fail("CLI_ARGUMENT_INVALID");
    parsed[field] = value;
  }
  if (parsed.mode !== "migration" && parsed.mode !== "proof") fail("MODE_INVALID");
  return parsed;
}

async function createDefaultPostgresDatabase(connectionString) {
  const { Client } = await import("pg");
  const client = new Client({
    connectionString,
    application_name: "open-ena-production-auth-operator",
    connectionTimeoutMillis: 10_000,
    query_timeout: 20_000,
    statement_timeout: 20_000,
  });
  await client.connect();
  return {
    async query(sql, params = []) {
      const result = await client.query(sql, [...params]);
      return { rowCount: result.rowCount, rows: result.rows };
    },
    async close() {
      await client.end();
    },
  };
}

async function executeCli(argv, environment) {
  let mode = "invalid";
  try {
    const parsed = parseCliArguments(argv);
    mode = parsed.mode;
    const migrationSql = mode === "migration"
      ? await readFile(new URL("../migrations/004_open_ena_disposable_accounts.sql", import.meta.url), "utf8")
      : undefined;
    const receipt = await runOpenEnaProductionAuthOperator({
      mode,
      environment,
      migrationSql,
      expectedFinalGitSha: parsed.expectedFinalGitSha,
      deploymentId: parsed.deploymentId,
      dependencies: { databaseFactory: createDefaultPostgresDatabase },
    });
    return { exitCode: 0, receipt };
  } catch (error) {
    return {
      exitCode: 1,
      receipt: createSafeOperatorFailureReceipt(error, mode),
    };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { exitCode, receipt } = await executeCli(process.argv.slice(2), process.env);
  process.stdout.write(JSON.stringify(receipt) + "\n");
  process.exitCode = exitCode;
}
