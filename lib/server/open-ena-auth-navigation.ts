import { NextResponse } from "next/server";
import { isLocale, type Locale } from "@/lib/i18n";
import { getOpenEnaAuthCopy } from "@/lib/open-ena-auth-copy";

export type OpenEnaAuthRecoveryKind = "throttled" | "unavailable" | "unattributed" | "logout-unavailable";
export type OpenEnaNativeRejection = "origin" | "too-large" | "invalid";

/** True for a browser form navigation, not a fetch or API client. */
export function openEnaDocumentNavigation(headers: Headers) {
  return headers.get("sec-fetch-mode")?.trim().toLowerCase() === "navigate"
    && headers.get("sec-fetch-dest")?.trim().toLowerCase() === "document";
}

export function openEnaAuthRecoveryLocation(
  origin: string,
  locale: Locale,
  kind: OpenEnaAuthRecoveryKind,
  retryAfterSeconds?: number,
) {
  const destination = new URL(`/${locale}/open-ena`, origin);
  destination.searchParams.set("auth", kind);
  if (
    kind === "throttled"
    && typeof retryAfterSeconds === "number"
    && Number.isInteger(retryAfterSeconds)
    && retryAfterSeconds >= 1
    && retryAfterSeconds <= 86_400
  ) {
    destination.searchParams.set("retry_after", String(retryAfterSeconds));
  }
  return destination;
}

/** Same-origin recovery redirect. The target is only the validated origin plus a fixed query. */
export function openEnaAuthNavigationResponse(
  origin: string,
  locale: Locale,
  kind: OpenEnaAuthRecoveryKind,
  retryAfterSeconds?: number,
) {
  const destination = openEnaAuthRecoveryLocation(origin, locale, kind, retryAfterSeconds);
  const response = NextResponse.redirect(destination, { status: 303 });
  response.headers.set("Cache-Control", "no-store");
  const retry = destination.searchParams.get("retry_after");
  if (retry) response.headers.set("Retry-After", retry);
  return response;
}

/** Locale only when the referrer path starts with a known locale. Nothing else is copied. */
export function openEnaRecoveryLocale(headers: Headers): Locale {
  const referer = headers.get("referer");
  if (!referer || referer.length > 2048) return "en";
  try {
    const segment = new URL(referer).pathname.split("/").filter(Boolean)[0];
    if (segment && isLocale(segment)) return segment;
  } catch {
    return "en";
  }
  return "en";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Keeps the error status for a browser form when there is no validated redirect
 * origin, or when the body must not be read. The link is only `/{locale}/open-ena`.
 */
export function openEnaNativeRejectionResponse(
  status: 400 | 403 | 413,
  kind: OpenEnaNativeRejection,
  headers: Headers,
) {
  const locale = openEnaRecoveryLocale(headers);
  const copy = getOpenEnaAuthCopy(locale);
  const message = kind === "origin"
    ? copy.requestRejected
    : kind === "too-large"
      ? copy.requestTooLarge
      : copy.requestInvalid;
  const href = `/${locale}/open-ena`;
  const html = `<!doctype html><html lang="${escapeHtml(locale)}"><meta charset="utf-8"><title>${escapeHtml(copy.title)}</title><main><p role="alert">${escapeHtml(message)}</p><p><a href="${escapeHtml(href)}">${escapeHtml(copy.returnToSignIn)}</a></p></main></html>`;
  return new NextResponse(html, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; base-uri 'none'; form-action 'none'",
    },
  });
}
