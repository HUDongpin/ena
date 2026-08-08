import { locales, type Locale } from "./i18n";

export function buildLocalePath(pathname: string, queryString: string, targetLocale: Locale) {
  const segments = pathname.split("/");

  if (locales.includes(segments[1] as Locale)) {
    segments[1] = targetLocale;
  } else {
    segments.splice(1, 0, targetLocale);
  }

  const path = segments.join("/") || `/${targetLocale}`;
  return queryString ? `${path}?${queryString}` : path;
}
