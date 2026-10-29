import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HomeAwareChrome from "@/components/HomeAwareChrome";
import BackToTop from "@/components/BackToTop";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import HtmlLangSync from "@/components/HtmlLangSync";
import JsonLd from "@/components/JsonLd";
import {
  getDictionary,
  getLocaleMeta,
  isLocale,
  locales,
  type Locale,
} from "@/lib/i18n";
import { siteConfig } from "@/lib/site";
import { SkipLink } from "@/components/SkipLink";
import { getOpenEnaCopy, isOpenEnaLocalizedLocale } from "@/lib/open-ena-i18n";

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const typedLocale = isLocale(locale) ? locale : "en";
  const dictionary = getDictionary(typedLocale);

  return {
    title: { absolute: dictionary.meta.siteTitle },
    description: dictionary.meta.siteDescription,
    alternates: {
      canonical: `/${typedLocale}`,
      languages: Object.fromEntries(locales.map((item) => [getLocaleMeta(item).htmlLang, `/${item}`])),
    },
    openGraph: {
      type: "website",
      siteName: siteConfig.brandName,
      title: dictionary.meta.siteTitle,
      description: dictionary.meta.siteDescription,
      locale: getLocaleMeta(typedLocale).htmlLang,
      url: `/${typedLocale}`,
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: `${siteConfig.brandName}, ${siteConfig.tagline}` }],
    },
    twitter: {
      card: "summary_large_image",
      title: dictionary.meta.siteTitle,
      description: dictionary.meta.siteDescription,
      images: ["/opengraph-image"],
    },
  };
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const typedLocale = locale as Locale;
  const dictionary = getDictionary(typedLocale);
  const workspaceCopy = getOpenEnaCopy(isOpenEnaLocalizedLocale(typedLocale) ? typedLocale : "en");
  const meta = getLocaleMeta(typedLocale);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.brandName,
    alternateName: [siteConfig.name, siteConfig.longName, siteConfig.tagline],
    url: siteConfig.url,
    description: dictionary.meta.siteDescription,
    inLanguage: meta.htmlLang,
  };

  return (
    <div lang={meta.htmlLang} dir={meta.dir}>
      <HtmlLangSync lang={meta.htmlLang} dir={meta.dir} />
      <JsonLd data={structuredData} />
      <HomeAwareChrome locale={typedLocale}
        skipLink={<SkipLink key="site-skip" skipToContent={dictionary.common.skipToContent} skipToWorkspace={workspaceCopy.modelV3.workspace.landmarks.skipToWorkspace} />}
        header={<Header key="site-header" locale={typedLocale} dictionary={dictionary} />}
        footer={<Footer key="site-footer" locale={typedLocale} dictionary={dictionary} />}
        backToTop={<BackToTop key="back-to-top" label={dictionary.common.backToTop} progressLabel={dictionary.common.pageScrollProgress} />}
      >
        {children}
      </HomeAwareChrome>
    </div>
  );
}
