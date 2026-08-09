import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import type { AcademyUiCopy } from "@/lib/academy-i18n";
import { ACADEMY_LEVELS, ACADEMY_TRACKS } from "@/lib/academy-types";

interface AcademyFiltersProps {
  locale: Locale;
  copy: AcademyUiCopy;
  current: {
    q?: string;
    track?: string;
    level?: string;
  };
}

function trackHref(locale: Locale, current: AcademyFiltersProps["current"], track?: string) {
  const params = new URLSearchParams();
  if (current.q) params.set("q", current.q);
  if (current.level) params.set("level", current.level);
  if (track) params.set("track", track);
  const query = params.toString();
  return `/${locale}/academy${query ? `?${query}` : ""}`;
}

export default function AcademyFilters({ locale, copy, current }: AcademyFiltersProps) {
  return (
    <div className="news-filter-panel academy-filter-panel">
      <form
        key={`${current.q ?? ""}|${current.track ?? ""}|${current.level ?? ""}`}
        action={`/${locale}/academy`}
        method="get"
        className="news-filter-form academy-filter-form"
      >
        <label className="news-filter-search">
          <span className="sr-only">{copy.searchPlaceholder}</span>
          <input type="search" name="q" defaultValue={current.q} placeholder={copy.searchPlaceholder} />
        </label>
        <label>
          <span className="sr-only">{copy.trackLabel}</span>
          <select name="track" defaultValue={current.track ?? ""} aria-label={copy.trackLabel}>
            <option value="">{copy.allTracks}</option>
            {ACADEMY_TRACKS.map((track) => <option key={track} value={track}>{copy.trackLabels[track]}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">{copy.levelLabel}</span>
          <select name="level" defaultValue={current.level ?? ""} aria-label={copy.levelLabel}>
            <option value="">{copy.allLevels}</option>
            {ACADEMY_LEVELS.map((level) => <option key={level} value={level}>{copy.levelLabels[level]}</option>)}
          </select>
        </label>
        <button type="submit" className="news-search-button">{copy.search}</button>
        <Link href={`/${locale}/academy`} prefetch={false} className="news-reset-button">{copy.reset}</Link>
      </form>
      <div className="news-type-pills academy-track-pills" aria-label={copy.trackLabel}>
        <Link href={trackHref(locale, current)} prefetch={false} aria-current={!current.track ? "page" : undefined}>{copy.allTracks}</Link>
        {ACADEMY_TRACKS.map((track) => (
          <Link
            key={track}
            href={trackHref(locale, current, track)}
            prefetch={false}
            aria-current={current.track === track ? "page" : undefined}
          >
            {copy.trackLabels[track]}
          </Link>
        ))}
      </div>
    </div>
  );
}
