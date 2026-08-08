import type { Metadata } from "next";
import { getLocaleMeta, locales, type Locale } from "./i18n";

export function pageMetadata({
  locale,
  path,
  title,
  description,
}: {
  locale: Locale;
  path: string;
  title: string;
  description: string;
}): Metadata {
  return {
    title: { absolute: `${title} | ENA` },
    description,
    alternates: {
      canonical: `/${locale}${path}`,
      languages: Object.fromEntries(
        locales.map((item) => [getLocaleMeta(item).htmlLang, `/${item}${path}`])
      ),
    },
    openGraph: {
      title: `${title} | ENA`,
      description,
      url: `/${locale}${path}`,
      locale: getLocaleMeta(locale).htmlLang,
    },
  };
}
