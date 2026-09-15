import { NextResponse, type NextRequest } from "next/server";
import { canonicalizeChineseLocalePathname } from "./lib/canonical-locale-pathname";

// next.config redirects are case-insensitive, so /zh-Hant → /zh-hant loops on /zh-hant (#37).
export function proxy(request: NextRequest) {
  const canonicalPathname = canonicalizeChineseLocalePathname(request.nextUrl.pathname);
  if (!canonicalPathname) {
    return NextResponse.next();
  }

  const destination = request.nextUrl.clone();
  destination.pathname = canonicalPathname;
  return NextResponse.redirect(destination);
}

export const config = {
  matcher: ["/zh-:script", "/zh-:script/:path*"],
};
