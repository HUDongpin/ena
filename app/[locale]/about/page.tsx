import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AboutContent from "@/components/about/open-ena/AboutContent";
import { getDictionary, getLocaleMeta, isLocale, locales } from "@/lib/i18n";
import { siteConfig } from "@/lib/site";
import { getOpenEnaAttributionCopy } from "@/lib/open-ena-attribution";

interface AboutPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: AboutPageProps): Promise<Metadata> {
  const { locale } = await params;
  const typedLocale = isLocale(locale) ? locale : "en";
  const dictionary = getDictionary(typedLocale);
  const description = getOpenEnaAttributionCopy(typedLocale).metaDescription;
  const title = `${dictionary.nav.about} | ${siteConfig.brandName}`;
  const url = `/${typedLocale}/about`;

  return {
    title: { absolute: title },
    description,
    alternates: {
      canonical: url,
      languages: Object.fromEntries(
        locales.map((item) => [getLocaleMeta(item).htmlLang, `/${item}/about`])
      ),
    },
    openGraph: {
      type: "website",
      title,
      description,
      url,
      siteName: siteConfig.brandName,
      locale: getLocaleMeta(typedLocale).htmlLang,
    },
  };
}

export default async function AboutPage({ params }: AboutPageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <AboutContent locale={locale} openEnaHref={`/${locale}/open-ena`} />;
}
