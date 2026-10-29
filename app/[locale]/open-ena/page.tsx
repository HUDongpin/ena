import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import OpenEnaLogin, { OpenEnaAuthRecoveryNotice } from "@/components/open-ena/OpenEnaLogin";
import OpenEnaWorkspaceSession from "@/components/open-ena/OpenEnaWorkspaceSession";
import { getLocaleMeta, isLocale, type Locale } from "@/lib/i18n";
import {
  OPEN_ENA_SESSION_COOKIE,
  isOpenEnaRegisteredPrincipal,
} from "@/lib/open-ena-auth";
import {
  openEnaAuthSecurityConfigurationReady,
  verifyProductionOpenEnaSessionTokenAny,
} from "@/lib/server/open-ena-auth-security-store";
import { openEnaAiOperationOwnerKey } from "@/lib/open-ena/ai-operation-owner";
import { getOpenEnaAiProviderDescriptor } from "@/lib/open-ena/ai-provider";
import {
  getOpenEnaCopy,
  isOpenEnaLocalizedLocale,
  openEnaLocalizedLocales,
} from "@/lib/open-ena-i18n";
import { openEnaLoginNotice } from "@/lib/open-ena-auth-copy";
import { pageMetadata } from "@/lib/metadata";
import { siteConfig } from "@/lib/site";
import { parseOpenEnaDisabledPluginIds } from "@/lib/open-ena/plugins/runtime-registry";
import { getOpenEnaCloudPool, openEnaCloudEnabled } from "@/lib/server/open-ena-cloud-db";
import { openEnaAccountMailReady } from "@/lib/server/open-ena-account-mail";
import { createOpenEnaUsersStore } from "@/lib/server/open-ena-users";

interface OpenEnaPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ auth?: string | string[]; retry_after?: string | string[]; reauth?: string | string[] }>;
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
      ...metadata.openGraph,
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
  const principal = authConfigurationReady
    ? await verifyProductionOpenEnaSessionTokenAny(sessionCookie) : null;
  const query = await searchParams;
  const notice = openEnaLoginNotice(query.auth, query.retry_after);
  const cloudEnabled = openEnaCloudEnabled();

  if (!principal || query.reauth === "1") {
    return (
      <OpenEnaLogin
        locale={typedLocale}
        notice={notice}
        configurationReady={authConfigurationReady}
        cloudEnabled={cloudEnabled}
        registrationAvailable={cloudEnabled && process.env.OPEN_ENA_REGISTRATION_ENABLED === "true" && openEnaAccountMailReady()}
      />
    );
  }

  const copy = getOpenEnaCopy(typedLocale);
  const providerDescriptor = getOpenEnaAiProviderDescriptor(process.env);
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

  const registered = cloudEnabled && isOpenEnaRegisteredPrincipal(principal);
  const profile = registered
    ? await createOpenEnaUsersStore(getOpenEnaCloudPool()).profile(principal).catch(() => null)
    : null;

  return (
    <>
      <OpenEnaAuthRecoveryNotice locale={typedLocale} notice={notice} />
      <JsonLd data={structuredData} />
      <OpenEnaWorkspaceSession key={principal.principalRef} initialLocale={typedLocale}
        operationOwnerKey={openEnaAiOperationOwnerKey(principal.principalRef)} providerDescriptor={providerDescriptor}
        runtimeDisabledPluginIds={parseOpenEnaDisabledPluginIds(process.env.ENA_PLUGIN_LAB_DISABLED_PLUGIN_IDS)}
        accountId={registered ? principal.userId : undefined} accountEmail={profile?.email} />
    </>
  );
}
