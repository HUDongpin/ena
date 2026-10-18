// Maintained in ENA. Migrated from the former OPEN-ENA website.
import Link from "next/link";
import PublicationCard from "./PublicationCard";
import TeamCard from "./TeamCard";
import { projectPublications } from "./publications";
import { teamMembers } from "./team";
import { siteConfig } from "@/lib/site";
import styles from "./AboutContent.module.css";

/** Shared English source content; the host owns the main landmark and navigation. */
export default function AboutContent({ homeHref = "/" }: { homeHref?: string }) {
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
      <div className={styles["about-main"]} lang="en" dir="ltr" data-open-ena-about>
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
          <div>
            <p className={styles["eyebrow"]}>ABOUT OPEN ENA</p>
            <h1 id="about-title">A small team.<br /><em>An open horizon.</em></h1>
          </div>
          <div className={styles["about-hero-copy"]}>
            <p>Open ENA brings together learning science, quantitative ethnography, artificial intelligence, and educational technology.</p>
            <p>We are building a transparent and approachable path into Epistemic Network Analysis—one where methods, interface decisions, and future capabilities can be inspected rather than hidden.</p>
          </div>
        </section>

        <section className={styles["team-section"]} aria-labelledby="team-title">
          <div className={styles["team-section-heading"]}>
            <p className={styles["eyebrow"]}>THE TEAM</p>
            <h2 id="team-title">People behind the open work.</h2>
            <span>Four perspectives, connected by a shared commitment to understandable research tools.</span>
          </div>
          <div className={styles["team-grid"]}>
            {teamMembers.map((member, index) => <TeamCard key={member.name} member={member} index={index} />)}
          </div>
        </section>

        <section className={styles["publications-section"]} aria-labelledby="publications-title">
          <div className={styles["publications-heading"]}>
            <p className={styles["eyebrow"]}>PROJECT PUBLICATIONS</p>
            <h2 id="publications-title">Research behind the open work.</h2>
            <span>Selected work across three-dimensional ENA, data literacy, and the development of open, web-based analysis tools.</span>
          </div>
          <div className={styles["publications-grid"]}>
            {projectPublications.map((publication) => (
              <PublicationCard key={publication.id} publication={publication} />
            ))}
          </div>
        </section>

        <section className={styles["about-principle"]} aria-labelledby="principle-title">
          <div className={styles["about-principle-mark"]} aria-hidden="true">
            <img src="/open-ena-about/logo-open-ena-mark.svg" alt="" width="118" height="118" />
          </div>
          <div>
            <p className={styles["eyebrow"]}>WHY OPEN</p>
            <h2 id="principle-title">Openness is more than access.</h2>
            <p>It means making the path from evidence to interpretation visible: what the model receives, what the computation does, what the figure shows, and what it cannot claim.</p>
            <Link className={styles["button-primary"]} href={homeHref} prefetch={false}>Explore Open ENA</Link>
          </div>
        </section>
      </div>
    </>
  );
}
