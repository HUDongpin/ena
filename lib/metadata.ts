import type { Metadata } from "next";
import { getLocaleMeta, locales, type Locale } from "./i18n";
import { siteConfig } from "./site";

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
    title: { absolute: `${title} | ${siteConfig.brandName}` },
    description,
    alternates: {
      canonical: `/${locale}${path}`,
      languages: Object.fromEntries(
        locales.map((item) => [getLocaleMeta(item).htmlLang, `/${item}${path}`])
      ),
    },
    openGraph: {
      type: "website",
      siteName: siteConfig.brandName,
      title: `${title} | ${siteConfig.brandName}`,
      description,
      url: `/${locale}${path}`,
      locale: getLocaleMeta(locale).htmlLang,
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: `${siteConfig.brandName}, ${siteConfig.tagline}` }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${siteConfig.brandName}`,
      description,
      images: ["/opengraph-image"],
    },
  };
}
