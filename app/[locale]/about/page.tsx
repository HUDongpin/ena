import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PageHero from "@/components/PageHero";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";
import { siteConfig } from "@/lib/site";

interface AboutPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: AboutPageProps): Promise<Metadata> {
  const { locale } = await params;
  const typedLocale = isLocale(locale) ? locale : "en";
  const dictionary = getDictionary(typedLocale);
  return pageMetadata({
    locale: typedLocale,
    path: "/about",
    title: dictionary.nav.about,
    description: dictionary.about.intro,
  });
}

export default async function AboutPage({ params }: AboutPageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const typedLocale = locale as Locale;
  const dictionary = getDictionary(typedLocale);
  const resources = [
    {
      href: siteConfig.officialWebtoolUrl,
      title: dictionary.about.webtoolTitle,
      text: dictionary.about.webtoolText,
      className: "resource-featured",
    },
    {
      href: siteConfig.officialResourcesUrl,
      title: dictionary.about.libraryTitle,
      text: dictionary.about.libraryText,
      className: "",
    },
    {
      href: siteConfig.tutorialUrl,
      title: dictionary.about.tutorialTitle,
      text: dictionary.about.tutorialText,
      className: "",
    },
  ];

  return (
    <div className="interior-page about-page">
      <PageHero eyebrow={dictionary.about.eyebrow} title={dictionary.about.title} intro={dictionary.about.intro} />

      <section className="container purpose-section">
        <div className="purpose-copy">
          <h2>{dictionary.about.purposeTitle}</h2>
          <p>{dictionary.about.purposeText}</p>
        </div>
        <div className="values-grid">
          {dictionary.about.values.map((item, index) => (
            <article key={item.title} className={`value-item value-item-${index + 1}`}>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="scope-band">
        <div className="container scope-inner">
          <h2>{dictionary.about.boundariesTitle}</h2>
          <p>{dictionary.about.boundariesText}</p>
        </div>
      </section>

      <section className="container resources-section">
        <div className="section-heading">
          <h2>{dictionary.about.resourcesTitle}</h2>
          <p>{dictionary.about.resourcesText}</p>
        </div>
        <div className="resource-grid">
          {resources.map((resource) => (
            <a
              key={resource.href}
              href={resource.href}
              target="_blank"
              rel="noreferrer"
              className={`resource-item focus-ring ${resource.className}`}
            >
              <span className="resource-arrow" aria-hidden="true">↗</span>
              <div>
                <h3>{resource.title}</h3>
                <p>{resource.text}</p>
              </div>
              <span className="sr-only">{dictionary.common.externalLink}</span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
