import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const OPEN_ENA_SESSION_COOKIE = "open-ena-session";
export const OPEN_ENA_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

const SESSION_VERSION = "v1";

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
