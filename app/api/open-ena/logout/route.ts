import { NextRequest, NextResponse } from "next/server";
import { isLocale, type Locale } from "@/lib/i18n";
import {
  OPEN_ENA_SESSION_COOKIE,
  verifyOpenEnaSessionTokenAny,
  type OpenEnaAuthEnvironment,
} from "@/lib/open-ena-auth";
import { resolveOpenEnaRequestOrigin } from "@/lib/open-ena-auth-request";
import {
  createProductionOpenEnaAuthSecurityStore,
  openEnaAuthSecurityConfigurationReady,
  type OpenEnaAuthSecurityStore,
} from "@/lib/server/open-ena-auth-security-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPEN_ENA_LOGOUT_MAX_REQUEST_BYTES = 8 * 1024;

type LogoutRouteDependencies = {
  environment?: OpenEnaAuthEnvironment;
  securityStoreFactory?: () => Promise<OpenEnaAuthSecurityStore | null>;
  now?: () => number;
};

class LogoutBodyTooLargeError extends Error {}

function formLocale(value: string | null): Locale {
  return typeof value === "string" && isLocale(value) ? value : "en";
}

function cookieValue(headers: Headers, name: string) {
  const cookieHeader = headers.get("cookie");
  if (!cookieHeader) return undefined;
  for (const segment of cookieHeader.split(";")) {
    const separator = segment.indexOf("=");
    if (separator < 0 || segment.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(segment.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

async function readLogoutLocale(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") return "en" as Locale;
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > OPEN_ENA_LOGOUT_MAX_REQUEST_BYTES)) {
    throw new LogoutBodyTooLargeError();
  }
  if (!request.body) return "en" as Locale;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > OPEN_ENA_LOGOUT_MAX_REQUEST_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new LogoutBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return formLocale(new URLSearchParams(new TextDecoder("utf-8", { fatal: true }).decode(bytes)).get("locale"));
}

function noStore(body: string, status: number) {
  return new NextResponse(body, { status, headers: { "Cache-Control": "no-store" } });
}

function clearSessionCookie(response: NextResponse, environment: OpenEnaAuthEnvironment) {
  response.cookies.set({
    name: OPEN_ENA_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: environment.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export function createOpenEnaLogoutPostHandler(dependencies: LogoutRouteDependencies = {}) {
  const environment = dependencies.environment ?? process.env;
  const securityStoreFactory = dependencies.securityStoreFactory
    ?? (() => createProductionOpenEnaAuthSecurityStore(environment));
  const now = dependencies.now ?? (() => Date.now());

  return async function handleOpenEnaLogoutPost(request: Request) {
    const requestOrigin = resolveOpenEnaRequestOrigin(
      request.headers,
      new URL(request.url).origin,
      environment,
    );
    if (!requestOrigin) return noStore("Invalid request origin", 403);
    if (!openEnaAuthSecurityConfigurationReady(environment)) {
      return noStore("Open ENA secure authentication is not configured.", 503);
    }
    let securityStore: OpenEnaAuthSecurityStore | null;
    try {
      securityStore = await securityStoreFactory();
    } catch {
      securityStore = null;
    }
    if (!securityStore) return noStore("Open ENA secure authentication is unavailable.", 503);

    const principal = verifyOpenEnaSessionTokenAny(
      cookieValue(request.headers, OPEN_ENA_SESSION_COOKIE),
      now(),
      environment,
    );
    if (principal) {
      try {
        await securityStore.revokeSession(principal.jti, principal.expiresAtSeconds);
      } catch {
        // Clearing a cookie without persisting revocation leaves a replayable token.
        return noStore("Open ENA secure authentication is unavailable.", 503);
      }
    }

    let locale: Locale;
    try {
      locale = await readLogoutLocale(request);
    } catch (error) {
      if (error instanceof LogoutBodyTooLargeError) return noStore("Logout request is too large", 413);
      return noStore("Invalid logout request", 400);
    }
    const response = NextResponse.redirect(new URL(`/${locale}/open-ena`, requestOrigin), { status: 303 });
    clearSessionCookie(response, environment);
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
}

const productionPostHandler = createOpenEnaLogoutPostHandler();

export async function POST(request: NextRequest) {
  return productionPostHandler(request);
}
