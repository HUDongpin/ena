import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import NewsCard from "@/components/NewsCard";
import { getDictionary, getLocaleMeta, isLocale, locales, type Locale } from "@/lib/i18n";
import { formatNewsDate, readingTimeMinutes, slugifyTopic } from "@/lib/news-format";
import { getNewsCopy } from "@/lib/news-i18n";
import { getNewsArticle, getRelatedNewsArticles, newsArticles } from "@/lib/news-data";
import { siteConfig } from "@/lib/site";
import { breadcrumbJsonLd, reviewArticleJsonLd } from "@/lib/structured-data";

interface NewsDetailPageProps {
  params: Promise<{ locale: string; slug: string }>;
}

function absoluteUrl(path: string) {
  return new URL(path, siteConfig.url).toString();
}

export function generateStaticParams() {
  return locales.flatMap((locale) => newsArticles.map((article) => ({ locale, slug: article.slug })));
}

export async function generateMetadata({ params }: NewsDetailPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const article = getNewsArticle(slug);
  if (!article) return {};
  const canonical = `/${locale}/news/${article.slug}`;
  const image = absoluteUrl(article.image);

  return {
    title: { absolute: `${article.title} | ${siteConfig.brandName}` },
    description: article.shortSummary,
    authors: [{ name: "ENA.HK Editorial Team", url: siteConfig.url }],
    alternates: {
      canonical,
      languages: Object.fromEntries(locales.map((item) => [getLocaleMeta(item).htmlLang, `/${item}/news/${article.slug}`])),
    },
    openGraph: {
      type: "article",
      siteName: siteConfig.brandName,
      title: article.title,
      description: article.shortSummary,
      url: canonical,
      locale: getLocaleMeta(locale).htmlLang,
      publishedTime: article.createdAt,
      authors: ["ENA.HK Editorial Team"],
      tags: article.tags,
      images: [{ url: image, alt: article.imageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.shortSummary,
      images: [image],
    },
  };
}

export default async function NewsDetailPage({ params }: NewsDetailPageProps) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const typedLocale = locale as Locale;
  const article = getNewsArticle(slug);
  if (!article) notFound();

  const copy = getNewsCopy(typedLocale);
  const dictionary = getDictionary(typedLocale);
  const related = getRelatedNewsArticles(article);
  const typeLabel = article.type === "journal" ? copy.journal : copy.conference;
  const evidenceLabel = article.type === "journal" ? copy.journalEvidence : copy.conferenceEvidence;
  const canonicalPath = `/${typedLocale}/news/${article.slug}`;
  const canonicalUrl = absoluteUrl(canonicalPath);
  const isRtl = getLocaleMeta(typedLocale).dir === "rtl";
  const jsonLd = reviewArticleJsonLd({
    headline: article.title,
    description: article.shortSummary,
    sourceAuthors: article.authors,
    datePublished: article.createdAt,
    image: absoluteUrl(article.image),
    keywords: article.tags,
    url: canonicalUrl,
    doi: article.doi,
    sourceUrl: article.sourceUrl,
  });
  const breadcrumb = breadcrumbJsonLd([
    { name: siteConfig.brandName, url: absoluteUrl(`/${typedLocale}`) },
    { name: dictionary.nav.news, url: absoluteUrl(`/${typedLocale}/news`) },
    { name: article.title, url: canonicalUrl },
  ]);

  return (
    <div className="news-detail-page">
      <JsonLd data={[jsonLd, breadcrumb]} />
      <article className="container news-detail-article">
        <Link href={`/${typedLocale}/news`} prefetch={false} className="news-back-link">
          <span aria-hidden="true">{isRtl ? "→" : "←"}</span> {copy.backToNews}
        </Link>

        <div className="news-detail-hero">
          <div className="news-detail-image">
            <Image
              src={article.image}
              alt={article.imageAlt}
              fill
              sizes="(max-width: 1040px) min(760px, calc(100vw - 48px)), 42vw"
              loading="eager"
              fetchPriority="high"
              lang="en"
              dir="ltr"
            />
          </div>
          <div className="news-detail-heading">
            <div className="news-detail-badges">
              <span className="news-type-badge">{typeLabel}</span>
              <span className="news-evidence-badge">{evidenceLabel}</span>
              <span>{article.year}</span>
              <span>{formatNewsDate(article.createdAt, typedLocale)}</span>
              <span>{readingTimeMinutes(article.fullSummary)} {copy.minRead}</span>
            </div>
            <h1 lang="en" dir="ltr">{article.title}</h1>
            <p className="news-detail-authors" lang="en" dir="ltr">{article.authors.join(", ")}</p>
            <p className="news-detail-venue" lang="en" dir="ltr">{article.venue}</p>
            {typedLocale !== "en" ? <p className="news-language-note">{copy.englishContentNote}</p> : null}
            <div className="news-source-links">
              {article.sourceUrls.map((source) => (
                <a key={source.url} href={source.url} target="_blank" rel="noreferrer" lang="en" dir="ltr">
                  {source.label} <span aria-hidden="true">↗</span>
                </a>
              ))}
            </div>
            <div className="news-detail-tags" aria-label={copy.topic}>
              {article.tags.map((tag) => (
                <Link key={tag} href={`/${typedLocale}/news/topic/${slugifyTopic(tag)}`} prefetch={false} lang="en" dir="ltr">{tag}</Link>
              ))}
            </div>
          </div>
        </div>

        <div className="news-detail-body">
          <section className="news-summary-card">
            <p className="eyebrow">{copy.summaryHeading}</p>
            <figure>
              <Image
                src={article.summaryImage}
                alt={article.summaryImageAlt}
                width={1586}
                height={992}
                sizes="(max-width: 820px) calc(100vw - 80px), 64vw"
                loading="lazy"
                lang="en"
                dir="ltr"
              />
            </figure>
            {typedLocale === "en" ? (
              <div className="news-audio-block">
                <p>{article.summaryAudioTitle}</p>
                <audio controls preload="metadata" src={article.summaryAudio}>
                  Your browser does not support audio playback.
                </audio>
              </div>
            ) : null}
            <div className="news-summary-prose" lang="en" dir="ltr">
              {article.fullSummary.split("\n\n").map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            </div>
          </section>

          <aside className="news-detail-sidebar">
            <section>
              <h2>{copy.keyTakeaways}</h2>
              <ul>
                {article.keyTakeaways.map((takeaway) => (
                  <li key={takeaway}><span aria-hidden="true">✓</span><p lang="en" dir="ltr">{takeaway}</p></li>
                ))}
              </ul>
            </section>
            <section>
              <h2>{copy.whyItMatters}</h2>
              <p lang="en" dir="ltr">{article.whyItMatters}</p>
              <div className="news-evidence-note">
                <strong>{evidenceLabel}</strong>
                <span>{typeLabel}</span>
              </div>
            </section>
          </aside>
        </div>
      </article>

      <section className="news-related-section">
        <div className="container">
          <h2>{copy.relatedPapers}</h2>
          <div className="news-card-list">
            {related.map((item) => <NewsCard key={item.id} article={item} locale={typedLocale} copy={copy} />)}
          </div>
        </div>
      </section>
    </div>
  );
}
