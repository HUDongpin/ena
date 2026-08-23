import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import NewsCard from "@/components/NewsCard";
import { getLocaleMeta, isLocale, locales, type Locale } from "@/lib/i18n";
import { getNewsCopy, getNewsResultLabel } from "@/lib/news-i18n";
import { getNewsArticlesForTopic, getNewsTopic, getNewsTopics } from "@/lib/news-topics";
import { siteConfig } from "@/lib/site";
import { breadcrumbJsonLd } from "@/lib/structured-data";

interface TopicPageProps {
  params: Promise<{ locale: string; slug: string }>;
}

function absoluteUrl(path: string) {
  return new URL(path, siteConfig.url).toString();
}

export function generateStaticParams() {
  return locales.flatMap((locale) => getNewsTopics().map((topic) => ({ locale, slug: topic.slug })));
}

export async function generateMetadata({ params }: TopicPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const topic = getNewsTopic(slug);
  if (!topic) return {};
  const copy = getNewsCopy(locale);
  const canonical = `/${locale}/news/topic/${topic.slug}`;

  return {
    title: { absolute: `${topic.label} | ${copy.title} | ${siteConfig.brandName}` },
    description: `${copy.title}: ${topic.label}`,
    alternates: {
      canonical,
      languages: Object.fromEntries(locales.map((item) => [getLocaleMeta(item).htmlLang, `/${item}/news/topic/${topic.slug}`])),
    },
  };
}

export default async function TopicPage({ params }: TopicPageProps) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const typedLocale = locale as Locale;
  const topic = getNewsTopic(slug);
  if (!topic) notFound();
  const copy = getNewsCopy(typedLocale);
  const articles = getNewsArticlesForTopic(slug);
  const canonicalPath = `/${typedLocale}/news/topic/${topic.slug}`;
  const isRtl = getLocaleMeta(typedLocale).dir === "rtl";
  const breadcrumb = breadcrumbJsonLd([
    { name: siteConfig.brandName, url: absoluteUrl(`/${typedLocale}`) },
    { name: copy.title, url: absoluteUrl(`/${typedLocale}/news`) },
    { name: topic.label, url: absoluteUrl(canonicalPath) },
  ]);

  return (
    <div className="news-topic-page premium-public-page premium-topic-page">
      <JsonLd data={breadcrumb} />
      <section className="container news-topic-inner">
        <Link href={`/${typedLocale}/news`} prefetch={false} className="news-back-link">
          <span aria-hidden="true">{isRtl ? "→" : "←"}</span> {copy.backToNews}
        </Link>
        <header>
          <p className="eyebrow">{copy.topic}</p>
          <h1 lang="en" dir="ltr">{topic.label}</h1>
          <p>{articles.length} {getNewsResultLabel(typedLocale, articles.length)}</p>
        </header>
        <div className="news-card-list">
          {articles.map((article) => <NewsCard key={article.id} article={article} locale={typedLocale} copy={copy} />)}
        </div>
      </section>
    </div>
  );
}
