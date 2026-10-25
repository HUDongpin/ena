import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import CTA from "@/components/CTA";
import MissionNavigation from "@/components/mission/MissionNavigation";
import styles from "@/components/mission/Mission.module.css";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
import { missionNavigationCopy } from "@/lib/mission-navigation-copy";
import { pageMetadata } from "@/lib/metadata";
import { siteConfig } from "@/lib/site";
import { getPluginLabCopy } from "@/lib/plugin-lab/i18n";

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
  const pluginCopy = getPluginLabCopy(typedLocale);

  return (
    <div className={styles.page} data-mission-page>
      <section className={styles.hero} aria-labelledby="mission-title">
        <div className={`${styles.container} ${styles.heroInner}`}>
          <p className={styles.eyebrow}>{dictionary.mission.eyebrow}</p>
          <h1 id="mission-title">{dictionary.mission.title}</h1>
          <p className={styles.heroIntro}>{dictionary.mission.intro}</p>
        </div>
      </section>

      <div className={`${styles.container} ${styles.readingLayout}`}>
        <MissionNavigation copy={missionNavigationCopy[typedLocale]} />
        <div className={styles.content}>
          <section id="model" className={styles.section} aria-labelledby="model-title">
            <h2 id="model-title">{dictionary.mission.modelTitle}</h2>
            <p className={styles.intro}>{dictionary.mission.modelText}</p>
            <div className={styles.items}>
              {dictionary.mission.modelParts.map((item) => (
                <article key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </article>
              ))}
            </div>
          </section>

          <section id="principles" className={styles.section} aria-labelledby="principles-title">
            <h2 id="principles-title">{dictionary.mission.principlesTitle}</h2>
            <p className={styles.intro}>{dictionary.mission.principlesText}</p>
            <div className={styles.items}>
              {dictionary.mission.principles.map((item) => (
                <article key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </article>
              ))}
            </div>
          </section>

          <section id="co-create" className={`${styles.section} ${styles.coCreate}`} aria-labelledby="co-create-title" lang={pluginCopy.contentFallback ? "en" : undefined} dir={pluginCopy.contentFallback ? "ltr" : undefined}>
            {pluginCopy.contentFallback ? <p className={styles.fallbackNotice}>{pluginCopy.fallbackNotice}</p> : null}
            <p className={styles.eyebrow}>{pluginCopy.eyebrow}</p>
            <h2 id="co-create-title">{pluginCopy.coCreateTitle}</h2>
            <p className={styles.intro}>{pluginCopy.coCreateText}</p>
            <div className={styles.items}>
              {pluginCopy.missionPrinciples.map((principle) => <article key={principle.title}><h3>{principle.title}</h3><p>{principle.text}</p></article>)}
            </div>
            <Link className={styles.exploreLink} href={`/${typedLocale}/plugins`}>{pluginCopy.explore}<ArrowRight /></Link>
          </section>

          <section id="resources" className={`${styles.section} ${styles.resources}`} aria-labelledby="resources-title">
            <h2 id="resources-title">{dictionary.mission.resourcesTitle}</h2>
            <p className={styles.intro}>{dictionary.mission.resourcesText}</p>
            <div className={styles.resourceActions}>
              <CTA href={`/${typedLocale}/open-ena`}>{dictionary.common.openWebtool}<ArrowRight /></CTA>
              <CTA href={siteConfig.officialResourcesUrl} variant="secondary" external>{dictionary.common.browseResources}</CTA>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function ArrowRight() {
  return <svg className={styles.arrow} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>;
}
