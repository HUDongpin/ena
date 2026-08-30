import { createHash, createHmac } from "node:crypto";
import { isIP } from "node:net";
import { NextRequest, NextResponse } from "next/server";
import { isLocale, type Locale } from "@/lib/i18n";
import {
  createOpenEnaSessionTokenV2,
  createOpenEnaSessionTokenV3,
  openEnaDisposableUsernameRef,
  OPEN_ENA_DISPOSABLE_SESSION_MAX_AGE_SECONDS,
  OPEN_ENA_SESSION_COOKIE,
  OPEN_ENA_SESSION_MAX_AGE_SECONDS,
  type OpenEnaAuthEnvironment,
  verifyOpenEnaCredentials,
} from "@/lib/open-ena-auth";
import { resolveOpenEnaRequestOrigin } from "@/lib/open-ena-auth-request";
import {
  createProductionOpenEnaAuthSecurityStore,
  openEnaAuthSecurityConfigurationReady,
  type OpenEnaAuthSecurityStore,
} from "@/lib/server/open-ena-auth-security-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPEN_ENA_LOGIN_MAX_REQUEST_BYTES = 16 * 1024;
export const OPEN_ENA_LOGIN_SOURCE_ATTEMPTS = 5;
export const OPEN_ENA_LOGIN_ACCOUNT_ATTEMPTS = 10;
export const OPEN_ENA_LOGIN_WINDOW_SECONDS = 15 * 60;

type LoginRouteDependencies = {
  environment?: OpenEnaAuthEnvironment;
  securityStoreFactory?: () => Promise<OpenEnaAuthSecurityStore | null>;
  verifyCredentials?: (username: string, password: string) => boolean;
  createSessionToken?: () => string;
  createDisposableSessionToken?: (principalRef: string) => string;
};

class LoginBodyTooLargeError extends Error {}
class InvalidLoginBodyError extends Error {}

function formLocale(value: FormDataEntryValue | null): Locale {
  return typeof value === "string" && isLocale(value) ? value : "en";
}

function redirectToWorkspace(origin: string, locale: Locale, invalid = false) {
  const destination = new URL(`/${locale}/open-ena`, origin);
  if (invalid) destination.searchParams.set("auth", "invalid");
  return NextResponse.redirect(destination, { status: 303 });
}

function noStoreResponse(body: string, status: number, headers?: HeadersInit) {
  return new NextResponse(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

function declaredContentLength(headers: Headers) {
  const raw = headers.get("content-length");
  if (raw === null) return null;
  if (!/^(?:0|[1-9][0-9]*)$/u.test(raw)) return Number.NaN;
  return Number(raw);
}

async function readBoundedLoginBody(request: Request) {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > OPEN_ENA_LOGIN_MAX_REQUEST_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new LoginBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function parseLoginForm(request: Request) {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/x-www-form-urlencoded") throw new InvalidLoginBodyError();
  const declaredBytes = declaredContentLength(request.headers);
  if (Number.isNaN(declaredBytes)) throw new InvalidLoginBodyError();
  if (declaredBytes !== null && declaredBytes > OPEN_ENA_LOGIN_MAX_REQUEST_BYTES) {
    throw new LoginBodyTooLargeError();
  }
  const bytes = await readBoundedLoginBody(request);
  if (declaredBytes !== null && declaredBytes !== bytes.byteLength) throw new InvalidLoginBodyError();
  let body: string;
  try {
    body = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new InvalidLoginBodyError();
  }
  return new URLSearchParams(body);
}

function accountRef(environment: OpenEnaAuthEnvironment) {
  const accountId = environment.OPEN_ENA_ACCOUNT_ID?.trim() ?? "";
  return createHash("sha256").update(accountId, "utf8").digest("base64url");
}

function loginSourceRef(
  headers: Headers,
  environment: OpenEnaAuthEnvironment,
  accountReference: string,
) {
  const configuredHeader = environment.OPEN_ENA_TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase();
  const rawAddress = configuredHeader ? headers.get(configuredHeader)?.trim() : undefined;
  const address = rawAddress && !rawAddress.includes(",") && isIP(rawAddress)
    ? rawAddress
    : "unattributed";
  const secret = environment.OPEN_ENA_SESSION_SECRET ?? "";
  return {
    attributed: address !== "unattributed",
    ref: createHmac("sha256", secret)
      .update(`open-ena-login-source:${accountReference}:${address}`, "utf8")
      .digest("base64url"),
  };
}

export function createOpenEnaLoginPostHandler(
  dependencies: LoginRouteDependencies = {},
) {
  const environment = dependencies.environment ?? process.env;
  const securityStoreFactory = dependencies.securityStoreFactory
    ?? (() => createProductionOpenEnaAuthSecurityStore(environment));
  const verifyCredentials = dependencies.verifyCredentials
    ?? ((username: string, password: string) => verifyOpenEnaCredentials(username, password, environment));
  const createSessionToken = dependencies.createSessionToken
    ?? (() => createOpenEnaSessionTokenV2(Date.now(), environment));
  const createDisposableSessionToken = dependencies.createDisposableSessionToken
    ?? ((principalRef: string) => createOpenEnaSessionTokenV3(Date.now(), environment, principalRef));

  return async function handleOpenEnaLoginPost(request: Request) {
    const requestOrigin = resolveOpenEnaRequestOrigin(
      request.headers,
      new URL(request.url).origin,
      environment,
    );
    if (!requestOrigin) return noStoreResponse("Invalid request origin", 403);

    const declaredBytes = declaredContentLength(request.headers);
    if (Number.isNaN(declaredBytes)) return noStoreResponse("Invalid login request", 400);
    if (declaredBytes !== null && declaredBytes > OPEN_ENA_LOGIN_MAX_REQUEST_BYTES) {
      return noStoreResponse("Login request is too large", 413);
    }

    let formData: URLSearchParams;
    try {
      formData = await parseLoginForm(request);
    } catch (error) {
      if (error instanceof LoginBodyTooLargeError) {
        return noStoreResponse("Login request is too large", 413);
      }
      return noStoreResponse("Invalid login request", 400);
    }
    const locale = formLocale(formData.get("locale"));
    const username = formData.get("username")?.trim() ?? "";
    const password = formData.get("password") ?? "";

    // Consume a durable attempt only after the bounded form has been parsed.
    // This keeps malformed/oversized traffic from exhausting the credential
    // bucket while still placing the throttle before any password comparison.
    if (!openEnaAuthSecurityConfigurationReady(environment)) {
      return noStoreResponse("Open ENA secure authentication is not configured.", 503);
    }

    let securityStore: OpenEnaAuthSecurityStore | null;
    try {
      securityStore = await securityStoreFactory();
    } catch {
      securityStore = null;
    }
    if (!securityStore) return noStoreResponse("Open ENA secure authentication is unavailable.", 503);

    const accountReference = accountRef(environment);
    const source = loginSourceRef(request.headers, environment, accountReference);
    let attemptAllowed = false;
    try {
      attemptAllowed = await securityStore.consumeLoginAttempt({
        sourceRef: source.ref,
        accountRef: accountReference,
        sourceLimit: source.attributed
          ? OPEN_ENA_LOGIN_SOURCE_ATTEMPTS
          : OPEN_ENA_LOGIN_ACCOUNT_ATTEMPTS,
        accountLimit: OPEN_ENA_LOGIN_ACCOUNT_ATTEMPTS,
        windowSeconds: OPEN_ENA_LOGIN_WINDOW_SECONDS,
      });
    } catch {
      return noStoreResponse("Open ENA secure authentication is unavailable.", 503);
    }
    if (!attemptAllowed) {
      return noStoreResponse("Too many login attempts", 429, {
        "Retry-After": String(OPEN_ENA_LOGIN_WINDOW_SECONDS),
      });
    }

    let sessionToken: string;
    let sessionMaxAgeSeconds = OPEN_ENA_SESSION_MAX_AGE_SECONDS;
    if (verifyCredentials(username, password)) {
      sessionToken = createSessionToken();
    } else {
      const usernameRef = openEnaDisposableUsernameRef(username, environment);
      let principalRef: string | null = null;
      try {
        principalRef = usernameRef
          ? await securityStore.consumeDisposableCredential({ usernameRef, password })
          : null;
      } catch {
        return noStoreResponse("Open ENA secure authentication is unavailable.", 503);
      }
      if (principalRef) {
        try {
          sessionToken = createDisposableSessionToken(principalRef);
          sessionMaxAgeSeconds = OPEN_ENA_DISPOSABLE_SESSION_MAX_AGE_SECONDS;
        } catch {
          return noStoreResponse("Open ENA secure authentication is unavailable.", 503);
        }
      } else {
        const response = redirectToWorkspace(requestOrigin, locale, true);
        response.headers.set("Cache-Control", "no-store");
        return response;
      }
    }

    const response = redirectToWorkspace(requestOrigin, locale);
    response.cookies.set({
      name: OPEN_ENA_SESSION_COOKIE,
      value: sessionToken,
      httpOnly: true,
      sameSite: "lax",
      secure: environment.NODE_ENV === "production",
      path: "/",
      maxAge: sessionMaxAgeSeconds,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
}

const productionPostHandler = createOpenEnaLoginPostHandler();

export async function POST(request: NextRequest) {
  return productionPostHandler(request);
}
