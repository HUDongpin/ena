import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import NewsCard from "@/components/NewsCard";
import NewsFilters from "@/components/NewsFilters";
import { isLocale, type Locale } from "@/lib/i18n";
import { newsArticles, newsYears } from "@/lib/news-data";
import { filterNewsArticles } from "@/lib/news-filter";
import { getNewsCopy, getNewsResultLabel } from "@/lib/news-i18n";
import { pageMetadata } from "@/lib/metadata";

interface NewsPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function pageHref(locale: Locale, current: { q?: string; type?: string; year?: string }, page: number) {
  const params = new URLSearchParams();
  if (current.q) params.set("q", current.q);
  if (current.type) params.set("type", current.type);
  if (current.year) params.set("year", current.year);
  params.set("page", String(page));
  return `/${locale}/news?${params.toString()}`;
}

export async function generateMetadata({ params }: Pick<NewsPageProps, "params">): Promise<Metadata> {
  const { locale } = await params;
  const typedLocale = isLocale(locale) ? locale : "en";
  const copy = getNewsCopy(typedLocale);
  return pageMetadata({ locale: typedLocale, path: "/news", title: copy.title, description: copy.intro });
}

export default async function NewsPage({ params, searchParams }: NewsPageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const typedLocale = locale as Locale;
  const copy = getNewsCopy(typedLocale);
  const raw = await searchParams;
  const current = {
    q: first(raw.q),
    type: first(raw.type),
    year: first(raw.year),
  };
  const result = filterNewsArticles(newsArticles, {
    ...current,
    page: Number(first(raw.page) ?? "1"),
    pageSize: 6,
  });

  return (
    <div className="interior-page collection-page news-page premium-public-page premium-collection-page">
      <section className="news-hero">
        <div className="container news-hero-grid">
          <div className="news-hero-copy">
            <p className="eyebrow">{copy.eyebrow}</p>
            <h1>{copy.title}</h1>
            <p>{copy.intro}</p>
          </div>
        </div>
      </section>

      <section className="container news-index" aria-label={copy.title}>
        <NewsFilters locale={typedLocale} copy={copy} years={newsYears} current={current} />

        <div className="news-result-heading">
          <p>{result.total} {getNewsResultLabel(typedLocale, result.total)}</p>
          <p>{copy.page} {result.page} / {result.totalPages}</p>
        </div>

        {result.items.length > 0 ? (
          <div className="news-card-list">
            {result.items.map((article) => (
              <NewsCard key={article.id} article={article} locale={typedLocale} copy={copy} />
            ))}
          </div>
        ) : (
          <div className="news-no-results">{copy.noResults}</div>
        )}

        {result.totalPages > 1 ? (
          <nav className="news-pagination" aria-label={copy.page}>
            {Array.from({ length: result.totalPages }, (_, index) => index + 1).map((page) => (
              <Link
                key={page}
                href={pageHref(typedLocale, current, page)}
                prefetch={false}
                aria-current={page === result.page ? "page" : undefined}
              >
                {page}
              </Link>
            ))}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
