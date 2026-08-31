import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AcademyCard from "@/components/AcademyCard";
import AcademyFilters from "@/components/AcademyFilters";
import { academyLessons } from "@/lib/academy-data";
import { filterAcademyLessons } from "@/lib/academy-filter";
import { getAcademyCopy, getAcademyResultLabel } from "@/lib/academy-i18n";
import { isLocale, type Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";

interface AcademyPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function pageHref(locale: Locale, current: { q?: string; track?: string; level?: string }, page: number) {
  const params = new URLSearchParams();
  if (current.q) params.set("q", current.q);
  if (current.track) params.set("track", current.track);
  if (current.level) params.set("level", current.level);
  params.set("page", String(page));
  return `/${locale}/academy?${params.toString()}`;
}

export async function generateMetadata({ params }: AcademyPageProps): Promise<Metadata> {
  const { locale } = await params;
  const typedLocale = isLocale(locale) ? locale : "en";
  const copy = getAcademyCopy(typedLocale);
  return pageMetadata({
    locale: typedLocale,
    path: "/academy",
    title: copy.title,
    description: copy.intro,
  });
}

export default async function AcademyPage({ params, searchParams }: AcademyPageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const typedLocale = locale as Locale;
  const copy = getAcademyCopy(typedLocale);
  const raw = await searchParams;
  const current = {
    q: first(raw.q),
    track: first(raw.track),
    level: first(raw.level),
  };
  const result = filterAcademyLessons(academyLessons, {
    ...current,
    page: Number(first(raw.page) ?? "1"),
    pageSize: 6,
  });

  return (
    <div className="interior-page collection-page academy-page premium-public-page premium-collection-page">
      <section className="news-hero academy-hero">
        <div className="container news-hero-grid">
          <div className="news-hero-copy">
            <p className="eyebrow">{copy.eyebrow}</p>
            <h1>{copy.title}</h1>
            <p>{copy.intro}</p>
          </div>
        </div>
      </section>

      <section className="container news-index academy-index" aria-label={copy.title}>
        <AcademyFilters locale={typedLocale} copy={copy} current={current} />

        <div className="news-result-heading">
          <p>{result.total} {getAcademyResultLabel(typedLocale, result.total)}</p>
          <p>{copy.page} {result.page} / {result.totalPages}</p>
        </div>

        {result.items.length > 0 ? (
          <div className="news-card-list academy-card-list">
            {result.items.map((lesson) => (
              <AcademyCard key={lesson.id} lesson={lesson} locale={typedLocale} copy={copy} />
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
