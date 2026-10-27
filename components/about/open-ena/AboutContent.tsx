// Maintained in ENA. Migrated from the former OPEN-ENA website.
import Link from "next/link";
import PublicationCard from "./PublicationCard";
import TeamCard from "./TeamCard";
import { projectPublications } from "./publications";
import { teamMembers } from "./team";
import { siteConfig } from "@/lib/site";
import { getLocaleMeta, type Locale } from "@/lib/i18n";
import { attributionSources, getOpenEnaAttributionCopy } from "@/lib/open-ena-attribution";
import { AttributionText } from "@/components/OpenEnaAttribution";
import FoundationReferences from "./FoundationReferences";
import styles from "./AboutContent.module.css";

/** Localized research provenance with preserved English team and publication records. */
export default function AboutContent({ locale, openEnaHref = "/open-ena" }: { locale: Locale; openEnaHref?: string }) {
  const copy = getOpenEnaAttributionCopy(locale);
  const localeMeta = getLocaleMeta(locale);
  const peopleJsonLd = teamMembers.map((member) => ({
    "@type": "Person",
    name: member.name,
    affiliation: {
      "@type": "Organization",
      name: member.institution,
    },
    description: member.bio,
    ...(member.profileUrl ? { sameAs: member.profileUrl } : {}),
  }));
  const publicationsJsonLd = projectPublications.map((publication) => ({
    "@type": publication.href ? "ScholarlyArticle" : "CreativeWork",
    name: publication.title.replace(/\.$/, ""),
    author: publication.schemaAuthors.map((name) => ({ "@type": "Person", name })),
    ...(publication.href ? { datePublished: publication.datePublished } : {}),
    image: new URL(publication.cover, siteConfig.url).href,
    isPartOf: { "@type": "CreativeWork", name: publication.sourceName },
    ...(publication.href ? { sameAs: publication.href, identifier: publication.href } : {}),
  }));

  return (
    <>
      <div className={styles["about-main"]} lang={localeMeta.htmlLang} dir={localeMeta.dir} data-open-ena-about>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [...peopleJsonLd, ...publicationsJsonLd],
            }).replace(/</g, "\\u003c"),
          }}
        />
        <section className={styles["about-hero"]} aria-labelledby="about-title">
          <h1 id="about-title"><AttributionText>{copy.aboutTitle}</AttributionText></h1>
          <p className={styles["about-subtitle"]} lang="en" dir="ltr">A small team. <span>An open horizon.</span></p>
          <div className={styles["about-introduction"]} lang="en" dir="ltr">
            <div className={styles["about-hero-copy"]}>
              <p>Open ENA brings together learning science, quantitative ethnography, artificial intelligence, and educational technology.</p>
              <p>We are building a transparent and approachable path into Epistemic Network Analysis—one where methods, interface decisions, and future capabilities can be inspected rather than hidden.</p>
            </div>
            <div className={styles["about-principle"]}>
              <h2 id="principle-title">Why open</h2>
              <p className={styles["about-principle-lead"]}>Openness is more than access.</p>
              <p>It means making the path from evidence to interpretation visible: what the model receives, what the computation does, what the figure shows, and what it cannot claim.</p>
            </div>
          </div>
          <section className={styles["about-purpose"]} aria-labelledby="purpose-title">
            <h2 id="purpose-title"><AttributionText>{copy.purposeTitle}</AttributionText></h2>
            <p><AttributionText>{copy.purpose}</AttributionText></p>
          </section>
          <Link className={styles["button-primary"]} href={openEnaHref} prefetch={false} lang="en" dir="ltr">Explore Open ENA</Link>
        </section>

        <section className={styles["team-section"]} aria-labelledby="team-title" lang="en" dir="ltr">
          <div className={styles["team-section-heading"]}>
            <h2 id="team-title">The team</h2>
            <span>A shared commitment to understandable research tools.</span>
          </div>
          <div className={styles["team-grid"]}>
            {teamMembers.map((member, index) => <TeamCard key={member.name} member={member} index={index} />)}
          </div>
        </section>

        <section className={styles["publications-section"]} aria-labelledby="publications-title" lang="en" dir="ltr">
          <div className={styles["publications-heading"]}>
            <h2 id="publications-title">Project publications</h2>
            <span>Selected work across three-dimensional ENA, data literacy, and the development of open, web-based analysis tools.</span>
          </div>
          <div className={styles["publications-grid"]}>
            {projectPublications.map((publication) => (
              <PublicationCard key={publication.id} publication={publication} />
            ))}
          </div>
        </section>

        <section id="acknowledgements" className={styles["foundation-section"]} aria-labelledby="acknowledgements-title">
          <h2 id="acknowledgements-title"><AttributionText>{copy.acknowledgementsTitle}</AttributionText></h2>
          <p><AttributionText>{copy.acknowledgements}</AttributionText></p>
          <div className={styles["foundation-links"]}>
            <a href={attributionSources.lab}><AttributionText>{copy.researchTeamLink}</AttributionText></a>
            <a href={attributionSources.webena}><AttributionText>{copy.officialWebenaLink}</AttributionText></a>
          </div>
        </section>

        <section className={styles["foundation-section"]} aria-labelledby="theory-title">
          <h2 id="theory-title"><AttributionText>{copy.theoryTitle}</AttributionText></h2>
          <p><AttributionText>{copy.theoryQe}</AttributionText>{" "}<a className={styles["inline-citation"]} href="#foundation-shaffer-2017" lang="en" dir="ltr">(Shaffer, 2017)</a></p>
          <p><AttributionText>{copy.theoryEna}</AttributionText>{" "}<a className={styles["inline-citation"]} href="#foundation-shaffer-et-al-2016" lang="en" dir="ltr">(Shaffer et al., 2016)</a></p>
          <p><AttributionText>{copy.theoryUse}</AttributionText>{" "}<a className={styles["inline-citation"]} href="#foundation-shaffer-ruis-2017" lang="en" dir="ltr">(Shaffer &amp; Ruis, 2017)</a></p>
        </section>

        <section className={styles["foundation-section"]} aria-labelledby="design-origin-title">
          <h2 id="design-origin-title"><AttributionText>{copy.designTitle}</AttributionText></h2>
          <p><AttributionText>{copy.designOrigin}</AttributionText></p>
          <p><AttributionText>{copy.designTheory}</AttributionText>{" "}<a className={styles["inline-citation"]} href="#foundation-tan-et-al-2022" lang="en" dir="ltr">(Tan et al., 2022)</a></p>
          <p><AttributionText>{copy.independence}</AttributionText></p>
        </section>

        <section className={styles["foundation-section"]} aria-labelledby="foundation-references-title">
          <h2 id="foundation-references-title"><AttributionText>{copy.referencesTitle}</AttributionText></h2>
          <FoundationReferences />
        </section>

      </div>
    </>
  );
}
