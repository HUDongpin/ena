import type { Metadata } from "next";
import { notFound } from "next/navigation";
import UnifiedHome from "@/components/home-source/UnifiedHome";
import HubFooter from "@/components/shared-home-footer/HubFooter";
import { getDictionary, getLocaleMeta, isLocale, locales } from "@/lib/i18n";
import { getHomeFooterCopy } from "@/lib/home-footer";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return {
    title: { absolute: "Open ENA" },
    description: "Explore the Open ENA interface for transparent, browser-based Epistemic Network Analysis prepared for jENA integration.",
    alternates: {
      canonical: `/${locale}`,
      languages: Object.fromEntries(locales.map(item => [getLocaleMeta(item).htmlLang, `/${item}`])),
    },
    openGraph: { type: "website", siteName: "ENA.HK", locale: getLocaleMeta(locale).htmlLang, title: "Open ENA", description: "Explore a transparent Open ENA interface prepared for future jENA integration.", url: `/${locale}` },
    twitter: {
      card: "summary",
      title: "Open ENA",
      description: "Explore a transparent Open ENA interface prepared for future jENA integration.",
    },
  };
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <UnifiedHome homeHref={`/${locale}`} aboutHref={`/${locale}/about`} footer={
    <HubFooter copy={getHomeFooterCopy(locale, getDictionary(locale))} homeHref={`/${locale}`} aboutHref={`/${locale}/about`} featureBase={`/${locale}`} comfortableLinks />
  } />;
}
