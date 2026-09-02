import { notFound } from "next/navigation";
import CTA from "@/components/CTA";
import NetworkFigure from "@/components/NetworkFigure";
import OpenEnaHomeFeature from "@/components/OpenEnaHomeFeature";
import { getDictionary, isLocale, localeMeta, type Locale } from "@/lib/i18n";
import { siteConfig } from "@/lib/site";
import { getPluginLabCopy } from "@/lib/plugin-lab/i18n";

interface HomePageProps {
  params: Promise<{ locale: string }>;
}

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const typedLocale = locale as Locale;
  const dictionary = getDictionary(typedLocale);
  const pluginCopy = getPluginLabCopy(typedLocale);

  return (
    <div className="home-page premium-public-page premium-home">
      <section className="container home-hero">
        <div className="hero-copy">
          <p className="eyebrow">{dictionary.home.eyebrow}</p>
          <h1>{dictionary.home.heroTitle}</h1>
          <p className="hero-text">
            {dictionary.home.heroText}{" "}
            {dictionary.home.originCredit}{" "}
            <strong><bdi>Wisconsin Center for Education Research.</bdi></strong>{" "}
            <strong><bdi dir={localeMeta[typedLocale].dir}>{dictionary.home.initiatorCredit}</bdi></strong>
          </p>
          <div className="button-row">
            <CTA href={`/${typedLocale}/mission`}>{dictionary.common.exploreMethod}</CTA>
            <CTA href={`/${typedLocale}/open-ena`} variant="secondary">
              {dictionary.common.openWebtool}
            </CTA>
          </div>
        </div>
        <NetworkFigure
          title={dictionary.home.graphTitle}
          caption={dictionary.home.graphCaption}
          labels={dictionary.home.networkLabels}
        />
      </section>

      <OpenEnaHomeFeature
        locale={typedLocale}
        ctaLabel={dictionary.common.openWebtool}
      />

      <section className="container workflow-section">
        <div className="section-heading">
          <p className="eyebrow">{dictionary.home.workflowEyebrow}</p>
          <h2>{dictionary.home.workflowTitle}</h2>
          <p>{dictionary.home.workflowText}</p>
        </div>
        <div className="workflow-grid">
          {dictionary.home.workflow.map((item) => (
            <article key={item.title} className="workflow-item">
              <span className="workflow-node" aria-hidden="true" />
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="container plugin-home-invitation" lang={pluginCopy.contentFallback ? "en" : undefined}>
        {pluginCopy.contentFallback ? <p className="plugin-language-note">{pluginCopy.fallbackNotice}</p> : null}
        <div>
          <p className="eyebrow">{pluginCopy.eyebrow}</p>
          <h2>{pluginCopy.coCreateTitle}</h2>
          <p>{pluginCopy.intro}</p>
        </div>
        <div className="button-row">
          <CTA href={`/${typedLocale}/plugins`}>{pluginCopy.explore}</CTA>
          <CTA href={`/${typedLocale}/plugins/propose`} variant="secondary">{pluginCopy.propose}</CTA>
        </div>
      </section>

      <section className="container closing-panel">
        <div>
          <h2>{dictionary.home.ctaTitle}</h2>
          <p>{dictionary.home.ctaText}</p>
        </div>
        <div className="button-row">
          <CTA href={siteConfig.officialResourcesUrl} external>
            {dictionary.common.browseResources}
          </CTA>
          <CTA href={`/${typedLocale}/about`} variant="secondary">
            {dictionary.common.learnAboutSite}
          </CTA>
        </div>
      </section>
    </div>
  );
}
