import type { Metadata } from "next";
import { notFound } from "next/navigation";
import EmptyCollection from "@/components/EmptyCollection";
import PageHero from "@/components/PageHero";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";
import { siteConfig } from "@/lib/site";

interface AcademyPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: AcademyPageProps): Promise<Metadata> {
  const { locale } = await params;
  const typedLocale = isLocale(locale) ? locale : "en";
  const dictionary = getDictionary(typedLocale);
  return pageMetadata({
    locale: typedLocale,
    path: "/academy",
    title: dictionary.nav.academy,
    description: dictionary.academy.intro,
  });
}

export default async function AcademyPage({ params }: AcademyPageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const typedLocale = locale as Locale;
  const dictionary = getDictionary(typedLocale);

  return (
    <div className="interior-page collection-page">
      <PageHero
        eyebrow={dictionary.academy.eyebrow}
        title={dictionary.academy.title}
        intro={dictionary.academy.intro}
      />
      <EmptyCollection
        kind="academy"
        title={dictionary.academy.emptyTitle}
        text={dictionary.academy.emptyText}
        note={dictionary.academy.emptyNote}
        actionLabel={dictionary.common.exploreMethod}
        actionHref={`/${typedLocale}/mission`}
        secondaryLabel={dictionary.common.browseResources}
        secondaryHref={siteConfig.officialResourcesUrl}
        secondaryExternal
      />
    </div>
  );
}
