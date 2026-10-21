import { NextResponse } from "next/server";
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
  consumeDisposableCredentialOnQuery,
  createProductionOpenEnaAuthSecurityStore,
  openEnaAuthFailureBody,
  openEnaAuthFailureHeaders,
  openEnaAuthSecurityConfigurationReady,
  type OpenEnaAuthFailureReason,
  type OpenEnaAuthSecurityStore,
  type OpenEnaLoginAuthenticationResult,
} from "@/lib/server/open-ena-auth-security-store";
import {
  openEnaAuthNavigationResponse,
  openEnaDocumentNavigation,
  openEnaNativeRejectionResponse,
  type OpenEnaNativeRejection,
} from "@/lib/server/open-ena-auth-navigation";
import {
  openEnaLoginPairRef,
  openEnaLoginSourceRef,
  readTrustedClientAddress,
} from "@/lib/server/open-ena-trusted-client-ip";

export const OPEN_ENA_LOGIN_MAX_REQUEST_BYTES = 16 * 1024;
export const OPEN_ENA_LOGIN_PAIR_FAILURES = 10;
export const OPEN_ENA_LOGIN_SOURCE_FAILURES = 50;
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

function authFailureResponse(reason: OpenEnaAuthFailureReason) {
  return new NextResponse(openEnaAuthFailureBody(reason), {
    status: 503,
    headers: { "Cache-Control": "no-store", ...openEnaAuthFailureHeaders(reason) },
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
    const documentNavigation = openEnaDocumentNavigation(request.headers);
    const nativeRejection = (
      status: 400 | 403 | 413,
      kind: OpenEnaNativeRejection,
      text: string,
    ) => (
      documentNavigation
        ? openEnaNativeRejectionResponse(status, kind, request.headers)
        : noStoreResponse(text, status)
    );
    const requestOrigin = resolveOpenEnaRequestOrigin(
      request.headers,
      new URL(request.url).origin,
      environment,
    );
    if (!requestOrigin) return nativeRejection(403, "origin", "Invalid request origin");

    const declaredBytes = declaredContentLength(request.headers);
    if (Number.isNaN(declaredBytes)) return nativeRejection(400, "invalid", "Invalid login request");
    if (declaredBytes !== null && declaredBytes > OPEN_ENA_LOGIN_MAX_REQUEST_BYTES) {
      return nativeRejection(413, "too-large", "Login request is too large");
    }

    let formData: URLSearchParams;
    try {
      formData = await parseLoginForm(request);
    } catch (error) {
      if (error instanceof LoginBodyTooLargeError) {
        return nativeRejection(413, "too-large", "Login request is too large");
      }
      return nativeRejection(400, "invalid", "Invalid login request");
    }
    const locale = formLocale(formData.get("locale"));
    const username = formData.get("username")?.trim() ?? "";
    const password = formData.get("password") ?? "";

    // Origin and body checks above happen before any credential or limiter work.
    if (!openEnaAuthSecurityConfigurationReady(environment)) {
      return documentNavigation
        ? openEnaAuthNavigationResponse(requestOrigin, locale, "unavailable")
        : authFailureResponse("not-configured");
    }
    const attribution = readTrustedClientAddress(request.headers, environment);
    if (!attribution.ok) {
      return documentNavigation
        ? openEnaAuthNavigationResponse(requestOrigin, locale, "unattributed")
        : noStoreResponse("Login client address is unavailable", 403);
    }
    const sourceRef = openEnaLoginSourceRef(attribution.address, environment);
    const pairRef = sourceRef ? openEnaLoginPairRef(username, sourceRef, environment) : null;
    if (!sourceRef || !pairRef) return authFailureResponse("not-configured");

    let securityStore: OpenEnaAuthSecurityStore | null;
    try {
      securityStore = await securityStoreFactory();
    } catch {
      return documentNavigation
        ? openEnaAuthNavigationResponse(requestOrigin, locale, "unavailable")
        : authFailureResponse("store-error");
    }
    if (!securityStore) {
      return documentNavigation
        ? openEnaAuthNavigationResponse(requestOrigin, locale, "unavailable")
        : authFailureResponse("store-unavailable");
    }

    let verdict: OpenEnaLoginAuthenticationResult;
    try {
      verdict = await securityStore.authenticateLogin({
        sourceRef,
        pairRef,
        sourceLimit: OPEN_ENA_LOGIN_SOURCE_FAILURES,
        pairLimit: OPEN_ENA_LOGIN_PAIR_FAILURES,
        windowSeconds: OPEN_ENA_LOGIN_WINDOW_SECONDS,
        authenticate: async ({ query }) => {
          if (verifyCredentials(username, password)) {
            return {
              outcome: "authenticated",
              kind: "owner",
              principalRef: null,
              sessionToken: createSessionToken(),
            };
          }
          const usernameRef = openEnaDisposableUsernameRef(username, environment);
          if (!usernameRef) return { outcome: "invalid" };
          const principalRef = await consumeDisposableCredentialOnQuery(query, {
            usernameRef,
            password,
          });
          if (!principalRef) return { outcome: "invalid" };
          return {
            outcome: "authenticated",
            kind: "disposable",
            principalRef,
            sessionToken: createDisposableSessionToken(principalRef),
          };
        },
      });
    } catch {
      return documentNavigation
        ? openEnaAuthNavigationResponse(requestOrigin, locale, "unavailable")
        : authFailureResponse("store-error");
    }
    if (verdict.outcome === "blocked") {
      if (documentNavigation) {
        return openEnaAuthNavigationResponse(
          requestOrigin,
          locale,
          "throttled",
          verdict.retryAfterSeconds,
        );
      }
      return noStoreResponse("Too many login attempts", 429, {
        "Retry-After": String(verdict.retryAfterSeconds),
      });
    }
    if (verdict.outcome === "invalid") {
      const rejected = redirectToWorkspace(requestOrigin, locale, true);
      rejected.headers.set("Cache-Control", "no-store");
      return rejected;
    }

    const response = redirectToWorkspace(requestOrigin, locale);
    response.cookies.set({
      name: OPEN_ENA_SESSION_COOKIE,
      value: verdict.sessionToken,
      httpOnly: true,
      sameSite: "lax",
      secure: environment.NODE_ENV === "production",
      path: "/",
      maxAge: verdict.kind === "disposable"
        ? OPEN_ENA_DISPOSABLE_SESSION_MAX_AGE_SECONDS
        : OPEN_ENA_SESSION_MAX_AGE_SECONDS,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
}
