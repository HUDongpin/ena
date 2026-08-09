import Link from "next/link";
import { getLocaleMeta, type Locale } from "@/lib/i18n";
import { formatAcademyDate } from "@/lib/academy-format";
import type { AcademyUiCopy } from "@/lib/academy-i18n";
import type { AcademyLesson } from "@/lib/academy-types";
import AcademyLessonVisual from "./AcademyLessonVisual";

interface AcademyCardProps {
  lesson: AcademyLesson;
  locale: Locale;
  copy: AcademyUiCopy;
}

export default function AcademyCard({ lesson, locale, copy }: AcademyCardProps) {
  const isRtl = getLocaleMeta(locale).dir === "rtl";
  const stableNumber = String(lesson.sequence).padStart(2, "0");

  return (
    <article className="news-card academy-card">
      <Link href={`/${locale}/academy/${lesson.slug}`} prefetch={false} className="news-card-link academy-card-link">
        <div className="news-card-media academy-card-media">
          <AcademyLessonVisual variant={lesson.visual} alt={lesson.visualAlt} sequence={lesson.sequence} />
        </div>
        <div className="news-card-copy academy-card-copy">
          <div className="news-card-meta">
            <div className="news-card-badges">
              <span className="news-type-badge">{copy.trackLabels[lesson.track]}</span>
              <span>{copy.levelLabels[lesson.level]}</span>
              <span>{lesson.durationMinutes} {copy.minutes}</span>
              <span>{formatAcademyDate(lesson.publishedAt, locale)}</span>
            </div>
            <span className="news-card-id" aria-label={`${copy.lessonLabel} ${stableNumber}`}>
              {copy.lessonLabel} {stableNumber}
            </span>
          </div>
          <h2 lang="en" dir="ltr">{lesson.title}</h2>
          <p className="news-card-summary" lang="en" dir="ltr">{lesson.shortSummary}</p>
          {locale !== "en" ? <p className="news-language-note">{copy.englishContentNote}</p> : null}
          <div className="news-card-tags" aria-label={copy.trackLabel}>
            {lesson.tags.slice(0, 3).map((tag) => <span key={tag} lang="en" dir="ltr">{tag}</span>)}
          </div>
          <span className="news-read-link">{copy.openLesson} <span aria-hidden="true">{isRtl ? "←" : "→"}</span></span>
        </div>
      </Link>
    </article>
  );
}
