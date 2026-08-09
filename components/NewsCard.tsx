import Image from "next/image";
import Link from "next/link";
import { getLocaleMeta, type Locale } from "@/lib/i18n";
import type { NewsUiCopy } from "@/lib/news-i18n";
import type { NewsArticle } from "@/lib/news-types";

interface NewsCardProps {
  article: NewsArticle;
  locale: Locale;
  copy: NewsUiCopy;
}

export default function NewsCard({ article, locale, copy }: NewsCardProps) {
  const numericId = /^ena-(\d+)$/.exec(article.id)?.[1];
  const stableNumber = numericId ? String(Number.parseInt(numericId, 10)).padStart(2, "0") : article.id;
  const typeLabel = article.type === "journal" ? copy.journal : copy.conference;
  const isRtl = getLocaleMeta(locale).dir === "rtl";

  return (
    <article className="news-card">
      <Link href={`/${locale}/news/${article.slug}`} prefetch={false} className="news-card-link">
        <div className="news-card-media">
          <Image
            src={article.image}
            alt={article.imageAlt}
            fill
            sizes="(max-width: 820px) calc(100vw - 48px), (max-width: 1040px) 37vw, 38vw"
            loading="lazy"
            lang="en"
            dir="ltr"
          />
        </div>
        <div className="news-card-copy">
          <div className="news-card-meta">
            <div className="news-card-badges">
              <span className="news-type-badge">{typeLabel}</span>
              <span>{article.year}</span>
            </div>
            <span className="news-card-id" aria-label={`${typeLabel} ${stableNumber}`}>
              {typeLabel} {stableNumber}
            </span>
          </div>
          <h2 lang="en" dir="ltr">{article.title}</h2>
          <p className="news-card-authors" lang="en" dir="ltr">{article.authors.join(", ")}</p>
          <p className="news-card-venue" lang="en" dir="ltr">{article.venue}</p>
          <p className="news-card-summary" lang="en" dir="ltr">{article.shortSummary}</p>
          {locale !== "en" ? <p className="news-language-note">{copy.englishContentNote}</p> : null}
          <div className="news-card-tags" aria-label={copy.topic}>
            {article.tags.slice(0, 3).map((tag) => (
              <span key={tag} lang="en" dir="ltr">{tag}</span>
            ))}
          </div>
          <span className="news-read-link">{copy.readSummary} <span aria-hidden="true">{isRtl ? "←" : "→"}</span></span>
        </div>
      </Link>
    </article>
  );
}
