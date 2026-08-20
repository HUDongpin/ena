import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const OPEN_ENA_SESSION_COOKIE = "open-ena-session";
export const OPEN_ENA_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

const DEFAULT_USERNAME = "sandytu";
const DEFAULT_PASSWORD = "12345";
const SESSION_VERSION = "v1";

export type OpenEnaAuthEnvironment = Readonly<Record<string, string | undefined>>;

function configuredValue(
  environment: OpenEnaAuthEnvironment,
  name: string,
  fallback: string,
) {
  const value = environment[name];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function credentials(environment: OpenEnaAuthEnvironment) {
  return {
    username: configuredValue(environment, "OPEN_ENA_USERNAME", DEFAULT_USERNAME),
    password: configuredValue(environment, "OPEN_ENA_PASSWORD", DEFAULT_PASSWORD),
  };
}

function constantTimeEqual(left: string, right: string) {
  const leftDigest = createHash("sha256").update(left, "utf8").digest();
  const rightDigest = createHash("sha256").update(right, "utf8").digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function sessionSecret(environment: OpenEnaAuthEnvironment) {
  const explicitSecret = environment.OPEN_ENA_SESSION_SECRET;
  if (typeof explicitSecret === "string" && explicitSecret.length > 0) return explicitSecret;

  const configuredCredentials = credentials(environment);
  return createHash("sha256")
    .update("ena-hk-open-ena-session-v1\0", "utf8")
    .update(configuredCredentials.username, "utf8")
    .update("\0", "utf8")
    .update(configuredCredentials.password, "utf8")
    .digest("hex");
}

function signature(payload: string, environment: OpenEnaAuthEnvironment) {
  return createHmac("sha256", sessionSecret(environment)).update(payload, "utf8").digest("base64url");
}

export function verifyOpenEnaCredentials(
  username: string,
  password: string,
  environment: OpenEnaAuthEnvironment = process.env,
) {
  const expected = credentials(environment);
  const usernameMatches = constantTimeEqual(username, expected.username);
  const passwordMatches = constantTimeEqual(password, expected.password);
  return usernameMatches && passwordMatches;
}

export function createOpenEnaSessionToken(
  issuedAtMilliseconds = Date.now(),
  environment: OpenEnaAuthEnvironment = process.env,
) {
  const issuedAtSeconds = Math.floor(issuedAtMilliseconds / 1_000);
  const payload = `${SESSION_VERSION}.${issuedAtSeconds}`;
  return `${payload}.${signature(payload, environment)}`;
}

export function verifyOpenEnaSessionToken(
  token: string | undefined,
  nowMilliseconds = Date.now(),
  environment: OpenEnaAuthEnvironment = process.env,
) {
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
  return constantTimeEqual(suppliedSignature, signature(payload, environment));
}
