import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import type { NewsUiCopy } from "@/lib/news-i18n";
import { NEWS_TYPES } from "@/lib/news-types";

interface NewsFiltersProps {
  locale: Locale;
  copy: NewsUiCopy;
  years: number[];
  current: {
    q?: string;
    type?: string;
    year?: string;
  };
}

function typeHref(locale: Locale, current: NewsFiltersProps["current"], type?: string) {
  const params = new URLSearchParams();
  if (current.q) params.set("q", current.q);
  if (current.year) params.set("year", current.year);
  if (type) params.set("type", type);
  const query = params.toString();
  return `/${locale}/news${query ? `?${query}` : ""}`;
}

export default function NewsFilters({ locale, copy, years, current }: NewsFiltersProps) {
  return (
    <div className="news-filter-panel">
      <form
        key={`${current.q ?? ""}|${current.type ?? ""}|${current.year ?? ""}`}
        action={`/${locale}/news`}
        method="get"
        className="news-filter-form"
      >
        <label className="news-filter-search">
          <span className="sr-only">{copy.searchPlaceholder}</span>
          <input type="search" name="q" defaultValue={current.q} placeholder={copy.searchPlaceholder} />
        </label>
        <label>
          <span className="sr-only">{copy.typeLabel}</span>
          <select name="type" defaultValue={current.type ?? ""} aria-label={copy.typeLabel}>
            <option value="">{copy.allTypes}</option>
            <option value="journal">{copy.journal}</option>
            <option value="conference">{copy.conference}</option>
          </select>
        </label>
        <label>
          <span className="sr-only">{copy.yearLabel}</span>
          <select name="year" defaultValue={current.year ?? ""} aria-label={copy.yearLabel}>
            <option value="">{copy.allYears}</option>
            {years.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="news-search-button">{copy.search}</button>
        <Link href={`/${locale}/news`} prefetch={false} className="news-reset-button">{copy.reset}</Link>
      </form>
      <div className="news-type-pills" aria-label={copy.typeLabel}>
        <Link href={typeHref(locale, current)} prefetch={false} aria-current={!current.type ? "page" : undefined}>{copy.allTypes}</Link>
        {NEWS_TYPES.map((type) => (
          <Link
            key={type}
            href={typeHref(locale, current, type)}
            prefetch={false}
            aria-current={current.type === type ? "page" : undefined}
          >
            {type === "journal" ? copy.journal : copy.conference}
          </Link>
        ))}
      </div>
    </div>
  );
}
