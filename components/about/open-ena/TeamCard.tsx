// Maintained in ENA. Migrated from the former OPEN-ENA website.
import styles from "./AboutContent.module.css";
import Image from "next/image";
import type { TeamMember } from "./team";

interface TeamCardProps {
  member: TeamMember;
  index: number;
}

export default function TeamCard({ member, index }: TeamCardProps) {
  return (
    <article className={styles["team-card"]}>
      <div className={styles["team-portrait"]}>
        <Image
          src={member.image}
          alt={member.imageAlt}
          fill
          sizes="(max-width: 680px) 100vw, (max-width: 1100px) 50vw, 25vw"
          style={{ objectPosition: member.imagePosition }}
          priority={index < 2}
        />
      </div>
      <div className={styles["team-card-body"]}>
        <p className={styles["team-institution"]}>{member.institution}</p>
        <h2>{member.name}</h2>
        <p className={styles["team-role"]}>{member.role}</p>
        <p className={styles["team-bio"]}>{member.bio}</p>
        {member.profileUrl ? (
          <a className={styles["team-profile-link"]} href={member.profileUrl} rel="noreferrer">
            {member.profileLabel}
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" /></svg>
          </a>
        ) : (
          <span className={styles["team-profile-note"]}>Portrait and affiliation supplied by the Open ENA team</span>
        )}
      </div>
    </article>
  );
}
