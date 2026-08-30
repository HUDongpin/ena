import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const OPEN_ENA_SESSION_COOKIE = "open-ena-session";
export const OPEN_ENA_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
export const OPEN_ENA_DISPOSABLE_SESSION_MAX_AGE_SECONDS = 15 * 60;

const SESSION_VERSION = "v1";
export const OPEN_ENA_SESSION_VERSION_V2 = "v2";
export const OPEN_ENA_SESSION_VERSION_V3 = "v3";
export type OpenEnaPrincipal = {
  principalRef: string;
  jti: string;
  issuedAtSeconds: number;
  expiresAtSeconds: number;
};
export type OpenEnaSessionRevocationLookup = {
  isSessionRevoked(jti: string): Promise<boolean>;
};

export type OpenEnaAuthEnvironment = Readonly<Record<string, string | undefined>>;

export function openEnaAuthConfigurationReady(
  environment: OpenEnaAuthEnvironment = process.env,
) {
  return Boolean(
    environment.OPEN_ENA_USERNAME?.trim()
      && environment.OPEN_ENA_PASSWORD
      && environment.OPEN_ENA_PASSWORD.length >= 12
      && environment.OPEN_ENA_SESSION_SECRET
      && environment.OPEN_ENA_SESSION_SECRET.length >= 32,
  );
}
export function openEnaV2AuthConfigurationReady(environment: OpenEnaAuthEnvironment = process.env) {
  return openEnaAuthConfigurationReady(environment) && Boolean(environment.OPEN_ENA_ACCOUNT_ID?.trim());
}

function credentials(environment: OpenEnaAuthEnvironment) {
  if (!openEnaAuthConfigurationReady(environment)) return null;
  return {
    username: environment.OPEN_ENA_USERNAME!.trim(),
    password: environment.OPEN_ENA_PASSWORD!,
    sessionSecret: environment.OPEN_ENA_SESSION_SECRET!,
  };
}

function constantTimeEqual(left: string, right: string) {
  const leftDigest = createHash("sha256").update(left, "utf8").digest();
  const rightDigest = createHash("sha256").update(right, "utf8").digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

function configuredSessionSecret(environment: OpenEnaAuthEnvironment) {
  const secret = environment.OPEN_ENA_SESSION_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

function validDisposablePrincipalRef(principalRef: string) {
  return /^d_[A-Za-z0-9_-]{43}$/u.test(principalRef);
}

/**
 * Derives a database-safe lookup key without disclosing the submitted username.
 * The domain-separated HMAC also resists offline username dictionaries after a
 * database-only disclosure.
 */
export function openEnaDisposableUsernameRef(
  username: string,
  environment: OpenEnaAuthEnvironment = process.env,
) {
  const secret = configuredSessionSecret(environment);
  const normalized = username.trim();
  if (!secret || !normalized || normalized.length > 254) return null;
  return createHmac("sha256", secret)
    .update(`open-ena-disposable-username:${normalized}`, "utf8")
    .digest("base64url");
}

export function verifyOpenEnaCredentials(
  username: string,
  password: string,
  environment: OpenEnaAuthEnvironment = process.env,
) {
  const expected = credentials(environment);
  if (!expected) return false;
  const usernameMatches = constantTimeEqual(username, expected.username);
  const passwordMatches = constantTimeEqual(password, expected.password);
  return usernameMatches && passwordMatches;
}

export function createOpenEnaSessionToken(
  issuedAtMilliseconds = Date.now(),
  environment: OpenEnaAuthEnvironment = process.env,
) {
  const configuredCredentials = credentials(environment);
  if (!configuredCredentials) {
    throw new TypeError("Open ENA authentication is not configured.");
  }
  const issuedAtSeconds = Math.floor(issuedAtMilliseconds / 1_000);
  const payload = `${SESSION_VERSION}.${issuedAtSeconds}`;
  return `${payload}.${signature(payload, configuredCredentials.sessionSecret)}`;
}

export function verifyOpenEnaSessionToken(
  token: string | undefined,
  nowMilliseconds = Date.now(),
  environment: OpenEnaAuthEnvironment = process.env,
) {
  const configuredCredentials = credentials(environment);
  if (!configuredCredentials) return false;
  if (!token) return false;

  const segments = token.split(".");
  if (segments.length !== 3) return false;

  const [version, issuedAtText, suppliedSignature] = segments;
  if (version !== SESSION_VERSION || !/^\d+$/.test(issuedAtText)) return false;

  const issuedAtSeconds = Number(issuedAtText);
  const nowSeconds = Math.floor(nowMilliseconds / 1_000);
  if (!Number.isSafeInteger(issuedAtSeconds)) return false;
  if (issuedAtSeconds > nowSeconds + 60) return false;
  if (nowSeconds - issuedAtSeconds >= OPEN_ENA_SESSION_MAX_AGE_SECONDS) return false;

  const payload = `${version}.${issuedAtText}`;
  return constantTimeEqual(
    suppliedSignature,
    signature(payload, configuredCredentials.sessionSecret),
  );
}

/** Creates a non-renewable, opaque principal-bound v2 session. */
export function createOpenEnaSessionTokenV2(
  issuedAtMilliseconds = Date.now(),
  environment: OpenEnaAuthEnvironment = process.env,
) {
  const configured = credentials(environment);
  const accountId = environment.OPEN_ENA_ACCOUNT_ID?.trim();
  if (!configured || !accountId) throw new TypeError("Open ENA v2 authentication is not configured.");
  const issuedAtSeconds = Math.floor(issuedAtMilliseconds / 1_000);
  const jti = randomUUID();
  const principalRef = createHash("sha256").update(accountId, "utf8").digest("base64url");
  const payload = `${OPEN_ENA_SESSION_VERSION_V2}.${issuedAtSeconds}.${jti}.${principalRef}`;
  return `${payload}.${signature(payload, configured.sessionSecret)}`;
}

export function verifyOpenEnaSessionTokenV2(
  token: string | undefined,
  nowMilliseconds = Date.now(),
  environment: OpenEnaAuthEnvironment = process.env,
): OpenEnaPrincipal | null {
  const configured = credentials(environment);
  const accountId = environment.OPEN_ENA_ACCOUNT_ID?.trim();
  if (!configured || !accountId || !token) return null;
  const segments = token.split(".");
  if (segments.length !== 5 || segments[0] !== OPEN_ENA_SESSION_VERSION_V2) return null;
  const [, issuedText, jti, principalRef, supplied] = segments;
  const issued = Number(issuedText); const now = Math.floor(nowMilliseconds / 1_000);
  if (!/^\d+$/.test(issuedText) || !Number.isSafeInteger(issued) || !/^[0-9a-f-]{36}$/i.test(jti)) return null;
  if (issued > now + 60 || now - issued >= OPEN_ENA_SESSION_MAX_AGE_SECONDS) return null;
  const expectedRef = createHash("sha256").update(accountId, "utf8").digest("base64url");
  const payload = `${OPEN_ENA_SESSION_VERSION_V2}.${issuedText}.${jti}.${principalRef}`;
  if (!constantTimeEqual(principalRef, expectedRef) || !constantTimeEqual(supplied, signature(payload, configured.sessionSecret))) return null;
  return {
    principalRef,
    jti,
    issuedAtSeconds: issued,
    expiresAtSeconds: issued + OPEN_ENA_SESSION_MAX_AGE_SECONDS,
  };
}

/** Creates a non-renewable v3 session for one pre-provisioned disposable principal. */
export function createOpenEnaSessionTokenV3(
  issuedAtMilliseconds = Date.now(),
  environment: OpenEnaAuthEnvironment = process.env,
  principalRef: string,
) {
  const sessionSecret = configuredSessionSecret(environment);
  if (!sessionSecret || !validDisposablePrincipalRef(principalRef)) {
    throw new TypeError("Open ENA disposable principal authentication is not configured.");
  }
  const issuedAtSeconds = Math.floor(issuedAtMilliseconds / 1_000);
  const jti = randomUUID();
  const payload = `${OPEN_ENA_SESSION_VERSION_V3}.${issuedAtSeconds}.${jti}.${principalRef}`;
  return `${payload}.${signature(payload, sessionSecret)}`;
}

export function verifyOpenEnaSessionTokenV3(
  token: string | undefined,
  nowMilliseconds = Date.now(),
  environment: OpenEnaAuthEnvironment = process.env,
): OpenEnaPrincipal | null {
  const sessionSecret = configuredSessionSecret(environment);
  if (!sessionSecret || !token) return null;
  const segments = token.split(".");
  if (segments.length !== 5 || segments[0] !== OPEN_ENA_SESSION_VERSION_V3) return null;
  const [, issuedText, jti, principalRef, supplied] = segments;
  const issued = Number(issuedText);
  const now = Math.floor(nowMilliseconds / 1_000);
  if (
    !/^\d+$/u.test(issuedText)
    || !Number.isSafeInteger(issued)
    || !/^[0-9a-f-]{36}$/iu.test(jti)
    || !validDisposablePrincipalRef(principalRef)
  ) return null;
  if (issued > now + 60 || now - issued >= OPEN_ENA_DISPOSABLE_SESSION_MAX_AGE_SECONDS) return null;
  const payload = `${OPEN_ENA_SESSION_VERSION_V3}.${issuedText}.${jti}.${principalRef}`;
  if (!constantTimeEqual(supplied, signature(payload, sessionSecret))) return null;
  return {
    principalRef,
    jti,
    issuedAtSeconds: issued,
    expiresAtSeconds: issued + OPEN_ENA_DISPOSABLE_SESSION_MAX_AGE_SECONDS,
  };
}

export function verifyOpenEnaSessionTokenAny(
  token: string | undefined,
  nowMilliseconds = Date.now(),
  environment: OpenEnaAuthEnvironment = process.env,
) {
  return verifyOpenEnaSessionTokenV2(token, nowMilliseconds, environment)
    ?? verifyOpenEnaSessionTokenV3(token, nowMilliseconds, environment);
}

/**
 * Completes signed-token verification with a shared, per-jti revocation read.
 * Store outages fail closed so a serverless instance never treats an
 * unverifiable logout state as an active session.
 */
export async function verifyOpenEnaSessionTokenV2WithRevocation(
  token: string | undefined,
  revocations: OpenEnaSessionRevocationLookup,
  nowMilliseconds = Date.now(),
  environment: OpenEnaAuthEnvironment = process.env,
): Promise<OpenEnaPrincipal | null> {
  const principal = verifyOpenEnaSessionTokenV2(token, nowMilliseconds, environment);
  if (!principal) return null;
  try {
    return await revocations.isSessionRevoked(principal.jti) ? null : principal;
  } catch {
    return null;
  }
}

/** Verifies either supported durable-session version and then checks shared revocation. */
export async function verifyOpenEnaSessionTokenAnyWithRevocation(
  token: string | undefined,
  revocations: OpenEnaSessionRevocationLookup,
  nowMilliseconds = Date.now(),
  environment: OpenEnaAuthEnvironment = process.env,
): Promise<OpenEnaPrincipal | null> {
  const principal = verifyOpenEnaSessionTokenAny(token, nowMilliseconds, environment);
  if (!principal) return null;
  try {
    return await revocations.isSessionRevoked(principal.jti) ? null : principal;
  } catch {
    return null;
  }
}
