import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AcademyCard from "@/components/AcademyCard";
import AcademyLessonVisual from "@/components/AcademyLessonVisual";
import JsonLd from "@/components/JsonLd";
import {
  academyLessons,
  getAcademyLesson,
  getRelatedAcademyLessons,
} from "@/lib/academy-data";
import { formatAcademyDate } from "@/lib/academy-format";
import { getAcademyCopy } from "@/lib/academy-i18n";
import { getDictionary, getLocaleMeta, isLocale, locales, type Locale } from "@/lib/i18n";
import { siteConfig } from "@/lib/site";
import { breadcrumbJsonLd, learningResourceJsonLd } from "@/lib/structured-data";

interface AcademyDetailPageProps {
  params: Promise<{ locale: string; slug: string }>;
}

function absoluteUrl(path: string) {
  return new URL(path, siteConfig.url).toString();
}

export function generateStaticParams() {
  return locales.flatMap((locale) => academyLessons.map((lesson) => ({ locale, slug: lesson.slug })));
}

export async function generateMetadata({ params }: AcademyDetailPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const lesson = getAcademyLesson(slug);
  if (!lesson) return {};
  const canonical = `/${locale}/academy/${lesson.slug}`;
  const socialImage = absoluteUrl("/opengraph-image");

  return {
    title: { absolute: `${lesson.title} | ${siteConfig.brandName}` },
    description: lesson.shortSummary,
    authors: [{ name: "ENA.HK Academy", url: siteConfig.url }],
    alternates: {
      canonical,
      languages: Object.fromEntries(locales.map((item) => [getLocaleMeta(item).htmlLang, `/${item}/academy/${lesson.slug}`])),
    },
    openGraph: {
      type: "article",
      siteName: siteConfig.brandName,
      title: lesson.title,
      description: lesson.shortSummary,
      url: canonical,
      locale: getLocaleMeta(locale).htmlLang,
      publishedTime: lesson.publishedAt,
      authors: ["ENA.HK Academy"],
      tags: lesson.tags,
      images: [{
        url: socialImage,
        width: 1200,
        height: 630,
        alt: `${siteConfig.brandName}, ${siteConfig.tagline}`,
      }],
    },
    twitter: {
      card: "summary_large_image",
      title: lesson.title,
      description: lesson.shortSummary,
      images: [socialImage],
    },
  };
}

export default async function AcademyDetailPage({ params }: AcademyDetailPageProps) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const typedLocale = locale as Locale;
  const lesson = getAcademyLesson(slug);
  if (!lesson) notFound();

  const copy = getAcademyCopy(typedLocale);
  const dictionary = getDictionary(typedLocale);
  const related = getRelatedAcademyLessons(lesson);
  const canonicalPath = `/${typedLocale}/academy/${lesson.slug}`;
  const canonicalUrl = absoluteUrl(canonicalPath);
  const isRtl = getLocaleMeta(typedLocale).dir === "rtl";
  const jsonLd = learningResourceJsonLd({
    name: lesson.title,
    description: lesson.shortSummary,
    datePublished: lesson.publishedAt,
    educationalLevel: getAcademyCopy("en").levelLabels[lesson.level],
    teaches: lesson.learningObjectives,
    keywords: lesson.tags,
    durationMinutes: lesson.durationMinutes,
    url: canonicalUrl,
    sourceUrls: lesson.sources.map((source) => source.url),
    steps: lesson.steps.map((step) => ({ name: step.title, text: step.text })),
  });
  const breadcrumb = breadcrumbJsonLd([
    { name: siteConfig.brandName, url: absoluteUrl(`/${typedLocale}`) },
    { name: dictionary.nav.academy, url: absoluteUrl(`/${typedLocale}/academy`) },
    { name: lesson.title, url: canonicalUrl },
  ]);

  return (
    <div className="academy-detail-page">
      <JsonLd data={[jsonLd, breadcrumb]} />
      <article className="container news-detail-article academy-detail-article">
        <Link href={`/${typedLocale}/academy`} prefetch={false} className="news-back-link">
          <span aria-hidden="true">{isRtl ? "→" : "←"}</span> {copy.backToAcademy}
        </Link>

        <div className="news-detail-hero academy-detail-hero">
          <div className="news-detail-image academy-detail-visual">
            <AcademyLessonVisual variant={lesson.visual} alt={lesson.visualAlt} sequence={lesson.sequence} />
          </div>
          <div className="news-detail-heading academy-detail-heading">
            <div className="news-detail-badges">
              <span className="news-type-badge">{copy.trackLabels[lesson.track]}</span>
              <span className="news-evidence-badge academy-level-badge">{copy.levelLabels[lesson.level]}</span>
              <span>{formatAcademyDate(lesson.publishedAt, typedLocale)}</span>
              <span>{lesson.durationMinutes} {copy.minutes}</span>
              <span>{copy.lessonLabel} {String(lesson.sequence).padStart(2, "0")}</span>
            </div>
            <h1 lang="en" dir="ltr">{lesson.title}</h1>
            <p className="academy-detail-summary" lang="en" dir="ltr">{lesson.shortSummary}</p>
            {typedLocale !== "en" ? <p className="news-language-note">{copy.englishContentNote}</p> : null}
            <p className="academy-source-label">{copy.sources}</p>
            <div className="news-source-links academy-source-links">
              {lesson.sources.map((source) => (
                <a key={source.url} href={source.url} target="_blank" rel="noreferrer" lang="en" dir="ltr">
                  {source.label} <span aria-hidden="true">↗</span>
                </a>
              ))}
            </div>
            <div className="news-detail-tags academy-detail-tags" aria-label={copy.trackLabel}>
              {lesson.tags.map((tag) => <span key={tag} lang="en" dir="ltr">{tag}</span>)}
            </div>
          </div>
        </div>

        <div className="news-detail-body academy-detail-body">
          <section className="news-summary-card academy-tutorial-card">
            <p className="eyebrow">{copy.fullTutorial}</p>
            <div className="news-summary-prose academy-introduction" lang="en" dir="ltr">
              {lesson.introduction.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>

            <section className="academy-case-study">
              <p className="academy-section-kicker">{copy.caseStudy}</p>
              <div lang="en" dir="ltr">
                <h2>{lesson.caseStudy.title}</h2>
                <p>{lesson.caseStudy.text}</p>
              </div>
            </section>

            {lesson.downloads?.length ? (
              <section className="academy-downloads">
                <p className="academy-section-kicker">{copy.downloadData}</p>
                <div className="academy-download-grid">
                  {lesson.downloads.map((download) => (
                    <a key={download.href} href={download.href} download>
                      <span className="academy-download-icon" aria-hidden="true">↓</span>
                      <span lang="en" dir="ltr"><strong>{download.label}</strong><small>{download.note}</small></span>
                    </a>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="academy-workflow">
              <ol>
                {lesson.steps.map((step, index) => (
                  <li key={step.title}>
                    <div className="academy-step-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</div>
                    <div className="academy-step-copy">
                      <p className="academy-section-kicker">{copy.stepLabel} {index + 1}</p>
                      <h2 lang="en" dir="ltr">{step.title}</h2>
                      <p lang="en" dir="ltr">{step.text}</p>
                      <div className="academy-checkpoint">
                        <strong>{copy.checkpoint}</strong>
                        <span lang="en" dir="ltr">{step.checkpoint}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </section>

          <aside className="news-detail-sidebar academy-detail-sidebar">
            <section>
              <h2>{copy.learningObjectives}</h2>
              <ul>
                {lesson.learningObjectives.map((objective) => (
                  <li key={objective}><span aria-hidden="true">✓</span><p lang="en" dir="ltr">{objective}</p></li>
                ))}
              </ul>
            </section>
            <section>
              <h2>{copy.coreIdeas}</h2>
              <ol className="academy-sidebar-numbered">
                {lesson.coreIdeas.map((idea, index) => <li key={idea}><span>{index + 1}</span><p lang="en" dir="ltr">{idea}</p></li>)}
              </ol>
            </section>
            <section>
              <h2>{copy.analysisChecks}</h2>
              <ul>
                {lesson.analysisChecks.map((check) => (
                  <li key={check}><span aria-hidden="true">?</span><p lang="en" dir="ltr">{check}</p></li>
                ))}
              </ul>
            </section>
            <section className="academy-boundary-card">
              <h2>{copy.methodBoundary}</h2>
              <p lang="en" dir="ltr">{lesson.methodBoundary}</p>
              <div className="news-evidence-note">
                <strong>{copy.trackLabels[lesson.track]}</strong>
                <span>{copy.levelLabels[lesson.level]} · {lesson.durationMinutes} {copy.minutes}</span>
              </div>
            </section>
          </aside>
        </div>
      </article>

      <section className="news-related-section academy-related-section">
        <div className="container">
          <h2>{copy.relatedLessons}</h2>
          <div className="news-card-list academy-card-list">
            {related.map((item) => <AcademyCard key={item.id} lesson={item} locale={typedLocale} copy={copy} />)}
          </div>
        </div>
      </section>
    </div>
  );
}
