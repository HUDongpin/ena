// Maintained in ENA. Migrated from the former OPEN-ENA website.
import styles from "./AboutContent.module.css";
import Image from "next/image";
import type { ProjectPublication } from "./publications";

interface PublicationCardProps {
  publication: ProjectPublication;
}

export default function PublicationCard({ publication }: PublicationCardProps) {
  const title = publication.titleItalic ? <cite>{publication.title}</cite> : publication.title;
  const sourceTitle = publication.sourceTitleItalic ? (
    <cite>{publication.sourceTitle}{publication.sourceItalicSuffix}</cite>
  ) : (
    <>{publication.sourceTitle}{publication.sourceItalicSuffix}</>
  );

  return (
    <article className={styles["publication-card"]}>
      <div className={styles["publication-cover"]}>
        <Image
          src={publication.cover}
          alt={publication.coverAlt}
          fill
          sizes="(max-width: 599px) 64px, 96px"
        />
      </div>

      <p className={styles["publication-type"]}>{publication.typeLabel} · {publication.year}</p>
      <h3>{publication.title.replace(/\.$/, "")}</h3>
      <p className={styles["publication-citation"]}>
        {publication.authors} {publication.date} {title}{" "}
        {publication.sourcePrefix ? <>{publication.sourcePrefix}{" "}</> : null}
        {sourceTitle}{publication.sourceSuffix}{" "}
        {publication.href ? (
          <a href={publication.href} rel="noreferrer">{publication.href}</a>
        ) : null}
      </p>

      {publication.href ? (
        <a className={styles["publication-link"]} href={publication.href} rel="noreferrer">
          {publication.linkLabel}
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" /></svg>
        </a>
      ) : (
        <span className={styles["publication-status"]}>{publication.statusLabel}</span>
      )}
    </article>
  );
}
