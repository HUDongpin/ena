import { NextRequest, NextResponse } from "next/server";
import { isLocale, type Locale } from "@/lib/i18n";
import { OPEN_ENA_SESSION_COOKIE } from "@/lib/open-ena-auth";
import { resolveOpenEnaRequestOrigin } from "@/lib/open-ena-auth-request";

function formLocale(value: FormDataEntryValue | null): Locale {
  return typeof value === "string" && isLocale(value) ? value : "en";
}

export async function POST(request: NextRequest) {
  const requestOrigin = resolveOpenEnaRequestOrigin(request.headers, request.nextUrl.origin);
  if (!requestOrigin) {
    return new NextResponse("Invalid request origin", { status: 403 });
  }

  const formData = await request.formData();
  const locale = formLocale(formData.get("locale"));
  const response = NextResponse.redirect(new URL(`/${locale}/open-ena`, requestOrigin), { status: 303 });
  response.cookies.set({
    name: OPEN_ENA_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
