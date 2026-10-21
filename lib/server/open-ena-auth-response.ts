import { NextResponse } from "next/server";
import { isLocale, type Locale } from "@/lib/i18n";
import type { OpenEnaAuthFailure } from "@/lib/open-ena-auth-copy";

/** The referrer can choose a supported language, never a redirect destination. */
export function openEnaAuthRequestLocale(request: Request): Locale {
  try {
    const locale = new URL(request.headers.get("referer") ?? request.url).pathname.split("/")[1];
    if (isLocale(locale)) return locale;
  } catch { /* Malformed referrers cannot alter the request boundary. */ }
  return "en";
}

export function openEnaAuthErrorResponse(request: Request, input: {
  status: number;
  body: string;
  failure: OpenEnaAuthFailure;
  locale?: Locale;
  headers?: HeadersInit;
}) {
  const headers = new Headers(input.headers);
  headers.set("Cache-Control", "no-store");
  const documentNavigation = request.headers.get("sec-fetch-mode") === "navigate"
    || /(?:^|,)\s*text\/html(?:\s*;|\s*,|\s*$)/iu.test(request.headers.get("accept") ?? "");
  if (!documentNavigation) return new NextResponse(input.body, { status: input.status, headers });

  const query = new URLSearchParams({ auth: input.failure });
  const retryAfter = headers.get("retry-after");
  if (input.failure === "throttled" && retryAfter && /^\d{1,3}$/u.test(retryAfter)
    && Number(retryAfter) >= 1 && Number(retryAfter) <= 900) {
    query.set("retry", retryAfter);
  }
  // A relative Location remains on the actual browser-facing origin, including
  // behind a reverse proxy. It never trusts Host, forwarded headers or referrer.
  headers.set("Location", `/${input.locale ?? openEnaAuthRequestLocale(request)}/open-ena?${query}`);
  return new NextResponse(null, { status: 303, headers });
}
