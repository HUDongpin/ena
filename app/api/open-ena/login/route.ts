import { NextRequest, NextResponse } from "next/server";
import { isLocale, type Locale } from "@/lib/i18n";
import {
  createOpenEnaSessionToken,
  OPEN_ENA_SESSION_COOKIE,
  OPEN_ENA_SESSION_MAX_AGE_SECONDS,
  verifyOpenEnaCredentials,
} from "@/lib/open-ena-auth";
import { resolveOpenEnaRequestOrigin } from "@/lib/open-ena-auth-request";

function formLocale(value: FormDataEntryValue | null): Locale {
  return typeof value === "string" && isLocale(value) ? value : "en";
}

function redirectToWorkspace(origin: string, locale: Locale, invalid = false) {
  const destination = new URL(`/${locale}/open-ena`, origin);
  if (invalid) destination.searchParams.set("auth", "invalid");
  return NextResponse.redirect(destination, { status: 303 });
}

export async function POST(request: NextRequest) {
  const requestOrigin = resolveOpenEnaRequestOrigin(request.headers, request.nextUrl.origin);
  if (!requestOrigin) {
    return new NextResponse("Invalid request origin", { status: 403 });
  }

  const formData = await request.formData();
  const locale = formLocale(formData.get("locale"));
  const usernameValue = formData.get("username");
  const passwordValue = formData.get("password");
  const username = typeof usernameValue === "string" ? usernameValue.trim() : "";
  const password = typeof passwordValue === "string" ? passwordValue : "";

  if (!verifyOpenEnaCredentials(username, password)) {
    const response = redirectToWorkspace(requestOrigin, locale, true);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  const response = redirectToWorkspace(requestOrigin, locale);
  response.cookies.set({
    name: OPEN_ENA_SESSION_COOKIE,
    value: createOpenEnaSessionToken(),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OPEN_ENA_SESSION_MAX_AGE_SECONDS,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
