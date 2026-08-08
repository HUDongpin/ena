import type { Metadata } from "next";
import { notFound } from "next/navigation";
import EmptyCollection from "@/components/EmptyCollection";
import PageHero from "@/components/PageHero";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";
import { siteConfig } from "@/lib/site";

interface NewsPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: NewsPageProps): Promise<Metadata> {
  const { locale } = await params;
  const typedLocale = isLocale(locale) ? locale : "en";
  const dictionary = getDictionary(typedLocale);
  return pageMetadata({
    locale: typedLocale,
    path: "/news",
    title: dictionary.nav.news,
    description: dictionary.news.intro,
  });
}

export default async function NewsPage({ params }: NewsPageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const typedLocale = locale as Locale;
  const dictionary = getDictionary(typedLocale);

  return (
    <div className="interior-page collection-page">
      <PageHero eyebrow={dictionary.news.eyebrow} title={dictionary.news.title} intro={dictionary.news.intro} />
      <EmptyCollection
        kind="news"
        title={dictionary.news.emptyTitle}
        text={dictionary.news.emptyText}
        note={dictionary.news.emptyNote}
        actionLabel={dictionary.common.learnAboutSite}
        actionHref={`/${typedLocale}/about`}
        secondaryLabel={dictionary.common.browseResources}
        secondaryHref={siteConfig.officialResourcesUrl}
        secondaryExternal
      />
    </div>
  );
}
