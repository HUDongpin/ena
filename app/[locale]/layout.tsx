import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
      siteName: "ENA",
      title: dictionary.meta.siteTitle,
      description: dictionary.meta.siteDescription,
      locale: getLocaleMeta(typedLocale).htmlLang,
      url: `/${typedLocale}`,
    },
  };
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const typedLocale = locale as Locale;
  const dictionary = getDictionary(typedLocale);
  const meta = getLocaleMeta(typedLocale);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.name,
    alternateName: siteConfig.longName,
    url: siteConfig.url,
    description: dictionary.meta.siteDescription,
    inLanguage: meta.htmlLang,
  };

  return (
    <div lang={meta.htmlLang} dir={meta.dir}>
      <HtmlLangSync lang={meta.htmlLang} dir={meta.dir} />
      <JsonLd data={structuredData} />
      <a href="#main-content" className="skip-link">
        {dictionary.common.skipToContent}
      </a>
      <Header locale={typedLocale} dictionary={dictionary} />
      <main id="main-content">{children}</main>
      <Footer locale={typedLocale} dictionary={dictionary} />
      <BackToTop label={dictionary.common.backToTop} />
    </div>
  );
}
