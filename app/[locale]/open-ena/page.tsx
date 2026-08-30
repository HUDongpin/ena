import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import OpenEnaLogin from "@/components/open-ena/OpenEnaLogin";
import OpenEnaWorkspace from "@/components/open-ena/OpenEnaWorkspace";
import { getLocaleMeta, isLocale, type Locale } from "@/lib/i18n";
import {
  OPEN_ENA_SESSION_COOKIE,
} from "@/lib/open-ena-auth";
import {
  openEnaAuthSecurityConfigurationReady,
  verifyProductionOpenEnaSessionTokenAny,
} from "@/lib/server/open-ena-auth-security-store";
import { OPEN_ENA_AI_DEFAULT_MODEL } from "@/lib/server/luna-client";
import {
  getOpenEnaCopy,
  isOpenEnaLocalizedLocale,
  openEnaLocalizedLocales,
} from "@/lib/open-ena-i18n";
import { pageMetadata } from "@/lib/metadata";
import { siteConfig } from "@/lib/site";

interface OpenEnaPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ auth?: string | string[] }>;
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

export default async function OpenEnaPage({ params, searchParams }: OpenEnaPageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const typedLocale = locale as Locale;
  const authConfigurationReady = openEnaAuthSecurityConfigurationReady();
  const sessionCookie = (await cookies()).get(OPEN_ENA_SESSION_COOKIE)?.value;
  const isAuthenticated = authConfigurationReady
    && Boolean(await verifyProductionOpenEnaSessionTokenAny(sessionCookie));
  const query = await searchParams;

  if (!isAuthenticated) {
    return (
      <OpenEnaLogin
        locale={typedLocale}
        error={query.auth === "invalid"}
        configurationReady={authConfigurationReady}
      />
    );
  }

  const copy = getOpenEnaCopy(typedLocale);
  const configuredAiModel = process.env.OPEN_ENA_AI_MODEL?.trim();
  const providerDescriptor = {
    provider: "OpenRouter",
    model: configuredAiModel && configuredAiModel.length <= 160
      && !/[\u0000-\u001f\u007f]/u.test(configuredAiModel)
      && /^[A-Za-z0-9._:/@-]+$/u.test(configuredAiModel)
      ? configuredAiModel
      : OPEN_ENA_AI_DEFAULT_MODEL,
  };
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
      "In-place interactive 3D ENA in the same fitted jENA coordinate space",
      "Presentation-only 2D and 3D switching without rerunning or refitting analysis",
      "Endpoint, separate-trajectory, and accumulated-trajectory ENA models",
      "Shared reference-rotation projection for independent endpoint datasets",
      "Local source-evidence inspection and privacy-safe derived exports",
      "Research plot controls, 2D SVG or PNG export, and 3D mode-bar PNG capture",
      "jENA diagnostics and ENA.HK Mann-Whitney group comparison",
      "Analysis manifest and reusable reference-rotation package",
    ],
  };

  return (
    <>
      <JsonLd data={structuredData} />
      <OpenEnaWorkspace locale={typedLocale} providerDescriptor={providerDescriptor} />
    </>
  );
}
