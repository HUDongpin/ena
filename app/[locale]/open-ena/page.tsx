import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import OpenEnaWorkspace from "@/components/open-ena/OpenEnaWorkspace";
import { getLocaleMeta, isLocale, type Locale } from "@/lib/i18n";
import {
  getOpenEnaCopy,
  isOpenEnaLocalizedLocale,
  openEnaLocalizedLocales,
} from "@/lib/open-ena-i18n";
import { pageMetadata } from "@/lib/metadata";
import { siteConfig } from "@/lib/site";

interface OpenEnaPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: OpenEnaPageProps): Promise<Metadata> {
  const { locale } = await params;
  const typedLocale = isLocale(locale) ? locale : "en";
  const metadataLocale = isOpenEnaLocalizedLocale(typedLocale) ? typedLocale : "en";
  const copy = getOpenEnaCopy(metadataLocale);
  const canonical = `/${metadataLocale}${siteConfig.openEnaPath}`;
  const metadata = pageMetadata({
    locale: metadataLocale,
    path: siteConfig.openEnaPath,
    title: copy.title,
    description: copy.intro,
  });
  return {
    ...metadata,
    alternates: {
      canonical,
      languages: Object.fromEntries(
        openEnaLocalizedLocales.map((item) => [
          getLocaleMeta(item).htmlLang,
          `/${item}${siteConfig.openEnaPath}`,
        ]),
      ),
    },
    openGraph: {
      title: `${copy.title} | ${siteConfig.brandName}`,
      description: copy.intro,
      url: canonical,
      locale: getLocaleMeta(metadataLocale).htmlLang,
    },
    robots: isOpenEnaLocalizedLocale(typedLocale) ? undefined : { index: false, follow: true },
  };
}

export default async function OpenEnaPage({ params }: OpenEnaPageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const typedLocale = locale as Locale;
  const copy = getOpenEnaCopy(typedLocale);
  const canonicalLocale = isOpenEnaLocalizedLocale(typedLocale) ? typedLocale : "en";
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Open ENA",
    applicationCategory: "ResearchApplication",
    operatingSystem: "Web browser",
    url: `${siteConfig.url}/${canonicalLocale}${siteConfig.openEnaPath}`,
    inLanguage: getLocaleMeta(canonicalLocale).htmlLang,
    description: copy.intro,
    softwareVersion: "0.1",
    isAccessibleForFree: true,
    featureList: [
      "Browser-based Epistemic Network Analysis with jENA",
      "Default two-dimensional ENA visualization",
      "External link to the separate 3D ENA exploratory application",
      "Endpoint, separate-trajectory, and accumulated-trajectory ENA models",
      "Shared reference-rotation projection for independent endpoint datasets",
      "Local source-evidence inspection and privacy-safe derived exports",
      "Research plot controls and SVG or PNG figure export",
      "jENA diagnostics and ENA.HK Mann-Whitney group comparison",
      "Analysis manifest and reusable reference-rotation package",
    ],
  };

  return (
    <>
      <JsonLd data={structuredData} />
      <OpenEnaWorkspace locale={typedLocale} />
    </>
  );
}
