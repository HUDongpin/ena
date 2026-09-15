const CANONICAL_CHINESE_LOCALES = ["zh-hant", "zh-hans"] as const;

export function canonicalizeChineseLocalePathname(pathname: string): string | null {
  if (!pathname.startsWith("/")) {
    return null;
  }

  const slash = pathname.indexOf("/", 1);
  const segment = slash === -1 ? pathname.slice(1) : pathname.slice(1, slash);
  const lowered = segment.toLowerCase();
  const canonical = CANONICAL_CHINESE_LOCALES.find((locale) => locale === lowered);
  if (!canonical || canonical === segment) {
    return null;
  }

  return `/${canonical}${slash === -1 ? "" : pathname.slice(slash)}`;
}
