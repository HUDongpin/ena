import CTA from "./CTA";

interface EmptyCollectionProps {
  kind: "news" | "academy";
  title: string;
  text: string;
  note: string;
  actionLabel: string;
  actionHref: string;
  secondaryLabel: string;
  secondaryHref: string;
  secondaryExternal?: boolean;
}

export default function EmptyCollection({
  kind,
  title,
  text,
  note,
  actionLabel,
  actionHref,
  secondaryLabel,
  secondaryHref,
  secondaryExternal = false,
}: EmptyCollectionProps) {
  return (
    <section className="container empty-section">
      <div className="empty-visual" aria-hidden="true">
        <svg viewBox="0 0 220 180">
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path className="empty-frame" d="M38 30H182V150H38Z" />
            {kind === "news" ? (
              <>
                <path className="empty-accent" d="M62 61H157M62 86H143M62 111H126" />
                <circle className="empty-node" cx="164" cy="113" r="11" />
              </>
            ) : (
              <>
                <path className="empty-accent" d="M66 54V127M66 54L111 70L156 54V127L111 142L66 127" />
                <path className="empty-faint" d="M111 70V142M82 87L99 92M123 93L142 87" />
              </>
            )}
          </g>
        </svg>
      </div>
      <div className="empty-copy">
        <h2>{title}</h2>
        <p>{text}</p>
        <p className="empty-note">{note}</p>
        <div className="button-row">
          <CTA href={actionHref}>{actionLabel}</CTA>
          <CTA href={secondaryHref} variant="secondary" external={secondaryExternal}>
            {secondaryLabel}
          </CTA>
        </div>
      </div>
    </section>
  );
}
