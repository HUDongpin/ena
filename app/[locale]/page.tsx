import type { Metadata } from "next";
import { notFound } from "next/navigation";
import UnifiedHome from "@/components/home-source/UnifiedHome";
import HubFooter from "@/components/shared-home-footer/HubFooter";
import { getDictionary, getLocaleMeta, isLocale, locales } from "@/lib/i18n";
import { getHomeFooterCopy } from "@/lib/home-footer";
import { siteConfig } from "@/lib/site";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return {
    title: { absolute: "Open ENA" },
    description: "Browser-based Epistemic Network Analysis powered by jENA, with transparent modeling, visualization and research exports.",
    alternates: {
      canonical: `/${locale}`,
      languages: Object.fromEntries(locales.map(item => [getLocaleMeta(item).htmlLang, `/${item}`])),
    },
    openGraph: { type: "website", siteName: siteConfig.brandName, locale: getLocaleMeta(locale).htmlLang, title: siteConfig.brandName, description: siteConfig.description, url: `/${locale}`, images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: `${siteConfig.brandName}, ${siteConfig.longName}` }] },
    twitter: {
      card: "summary_large_image",
      title: siteConfig.brandName,
      description: siteConfig.description,
      images: ["/opengraph-image"],
    },
  };
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <UnifiedHome locale={locale} aboutHref={`/${locale}/about`} openEnaHref={`/${locale}/open-ena`} footer={
    <HubFooter copy={getHomeFooterCopy(locale, getDictionary(locale))} locale={locale} homeHref={`/${locale}`} aboutHref={`/${locale}/about`} featureBase={`/${locale}`} comfortableLinks />
  } />;
}
