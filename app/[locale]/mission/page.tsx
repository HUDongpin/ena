import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CTA from "@/components/CTA";
import NetworkFigure from "@/components/NetworkFigure";
import PageHero from "@/components/PageHero";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";
import { siteConfig } from "@/lib/site";

interface MissionPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: MissionPageProps): Promise<Metadata> {
  const { locale } = await params;
  const typedLocale = isLocale(locale) ? locale : "en";
  const dictionary = getDictionary(typedLocale);
  return pageMetadata({
    locale: typedLocale,
    path: "/mission",
    title: dictionary.nav.mission,
    description: dictionary.mission.intro,
  });
}

export default async function MissionPage({ params }: MissionPageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const typedLocale = locale as Locale;
  const dictionary = getDictionary(typedLocale);

  return (
    <div className="interior-page">
      <PageHero
        eyebrow={dictionary.mission.eyebrow}
        title={dictionary.mission.title}
        intro={dictionary.mission.intro}
      />

      <section className="container definition-section">
        <NetworkFigure
          title={dictionary.home.graphTitle}
          caption={dictionary.home.graphCaption}
          labels={dictionary.home.networkLabels}
        />
        <div className="definition-copy">
          <h2>{dictionary.mission.definitionTitle}</h2>
          <p>{dictionary.mission.definitionText}</p>
        </div>
      </section>

      <section className="model-section">
        <div className="container">
          <div className="section-heading">
            <h2>{dictionary.mission.modelTitle}</h2>
            <p>{dictionary.mission.modelText}</p>
          </div>
          <div className="model-parts">
            {dictionary.mission.modelParts.map((item) => (
              <article key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="container principles-section">
        <div className="section-heading">
          <h2>{dictionary.mission.principlesTitle}</h2>
          <p>{dictionary.mission.principlesText}</p>
        </div>
        <div className="principle-list">
          {dictionary.mission.principles.map((item) => (
            <article key={item.title}>
              <span className="principle-marker" aria-hidden="true" />
              <div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="container closing-panel">
        <div>
          <h2>{dictionary.mission.resourcesTitle}</h2>
          <p>{dictionary.mission.resourcesText}</p>
        </div>
        <div className="button-row">
          <CTA href={`/${typedLocale}/open-ena`}>
            {dictionary.common.openWebtool}
          </CTA>
          <CTA href={siteConfig.officialResourcesUrl} variant="secondary" external>
            {dictionary.common.browseResources}
          </CTA>
        </div>
      </section>
    </div>
  );
}
