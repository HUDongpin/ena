import { getDictionary, getLocaleMeta, type Locale } from "@/lib/i18n";
import { getOpenEnaAttributionCopy } from "@/lib/open-ena-attribution";

// Keep official names and product names legible inside RTL prose without HTML in translations.
const latinNames = /(University of Wisconsin–Madison|Wisconsin Center for Education Research|David Williamson Shaffer|Epistemic Analytics Lab|Quantitative Ethnography|Epistemic Network Analysis|UW–Madison|Open ENA|webENA|QE\/ENA|QE|ENA)/g;

export function AttributionText({ children }: { children: string }) {
  return <>{children.split(latinNames).map((part, index) => index % 2
    ? <bdi key={index} dir="ltr">{part}</bdi>
    : part)}</>;
}

export default function OpenEnaAttribution({ locale, aboutHref, variant = "home" }: {
  locale: Locale;
  aboutHref: string;
  variant?: "home" | "footer" | "workspace" | "popup";
}) {
  const copy = getOpenEnaAttributionCopy(locale);
  const meta = getLocaleMeta(locale);
  const workspace = variant === "workspace" || variant === "popup";
  const href = `${aboutHref}#acknowledgements`;

  return (
    <div className={`open-ena-attribution open-ena-attribution-${variant}`} lang={meta.htmlLang} dir={meta.dir}
      data-open-ena-attribution={variant}>
      <p className="open-ena-attribution-credit"><AttributionText>{copy.shortCredit}</AttributionText></p>
      {variant !== "footer" && <p className="open-ena-attribution-purpose"><AttributionText>{workspace ? copy.shortPurpose : copy.purpose}</AttributionText></p>}
      {workspace ? (
        <a className="open-ena-attribution-link" href={href} target="_blank" rel="noopener noreferrer"
          aria-label={`${copy.fullAcknowledgementsLink} — ${getDictionary(locale).common.externalLink}`}>
          {copy.fullAcknowledgementsLink}<span aria-hidden="true"> ↗</span>
        </a>
      ) : (
        <a className="open-ena-attribution-link" href={href}>{copy.fullAcknowledgementsLink}</a>
      )}
    </div>
  );
}
