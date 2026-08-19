import CTA from "@/components/CTA";
import type { Locale } from "@/lib/i18n";
import { getOpenEnaHomeCopy } from "@/lib/open-ena-home-copy";

interface OpenEnaHomeFeatureProps {
  locale: Locale;
  ctaLabel: string;
}

const comparisonNodes = [
  { x: 382, y: 174 },
  { x: 494, y: 153 },
  { x: 535, y: 252 },
  { x: 443, y: 315 },
  { x: 342, y: 275 },
];

export default function OpenEnaHomeFeature({ locale, ctaLabel }: OpenEnaHomeFeatureProps) {
  const copy = getOpenEnaHomeCopy(locale);

  return (
    <section className="open-ena-home-section" aria-labelledby="open-ena-home-title">
      <div className="container open-ena-home-layout">
        <div className="open-ena-home-copy">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 id="open-ena-home-title">{copy.title}</h2>
          <p className="open-ena-home-lead">{copy.lead}</p>

          <ol className="open-ena-home-pillars">
            {copy.pillars.map((pillar, index) => (
              <li key={pillar.title}>
                <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{pillar.title}</h3>
                  <p>{pillar.text}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="open-ena-home-action">
            <CTA href={`/${locale}/open-ena`}>{ctaLabel}</CTA>
            <p>{copy.methodNote}</p>
          </div>
        </div>

        <figure className="open-ena-concept-figure">
          <svg
            viewBox="0 0 760 500"
            role="img"
            aria-labelledby="open-ena-figure-title open-ena-figure-description"
            preserveAspectRatio="xMidYMid meet"
          >
            <title id="open-ena-figure-title">{copy.figureTitle}</title>
            <desc id="open-ena-figure-description">{copy.figureDescription}</desc>

            <rect className="open-ena-figure-shell" x="18" y="18" width="724" height="464" rx="22" />
            <path className="open-ena-figure-topbar" d="M40 18h680a22 22 0 0 1 22 22v48H18V40a22 22 0 0 1 22-22Z" />
            <circle className="open-ena-figure-brand-ring" cx="58" cy="53" r="17" />
            <circle className="open-ena-figure-brand-dot" cx="58" cy="53" r="6" />
            <text className="open-ena-figure-brand" x="87" y="49">OPEN ENA</text>
            <text className="open-ena-figure-subtitle" x="87" y="67">{copy.figureLabels.workspace}</text>
            <rect className="open-ena-figure-status" x="632" y="37" width="82" height="31" rx="15" />
            <circle className="open-ena-figure-status-dot" cx="650" cy="52.5" r="4" />
            <text className="open-ena-figure-status-label" x="662" y="57">{copy.figureLabels.local}</text>

            <path className="open-ena-figure-rail" d="M18 88h72v350H18Z" />
            {[128, 198, 268, 338].map((y, index) => (
              <g key={y} className={index === 2 ? "open-ena-figure-mode is-active" : "open-ena-figure-mode"}>
                <rect x="31" y={y - 23} width="46" height="46" rx="7" />
                <circle cx="54" cy={y - 4} r="5" />
                <path d={`M42 ${y + 8}h24`} />
              </g>
            ))}

            <rect className="open-ena-figure-panel" x="90" y="88" width="205" height="350" />
            <text className="open-ena-figure-kicker" x="111" y="122">{copy.figureLabels.model}</text>
            <text className="open-ena-figure-panel-title" x="111" y="147">{copy.figureLabels.configuration}</text>
            {[177, 220, 263].map((y, index) => (
              <g key={y}>
                <text className="open-ena-figure-field-label" x="111" y={y}>{[copy.figureLabels.unit, copy.figureLabels.window, copy.figureLabels.codes][index]}</text>
                <rect className="open-ena-figure-field" x="111" y={y + 10} width="161" height="26" rx="4" />
                <path className="open-ena-figure-field-line" d={`M125 ${y + 23}h${index === 0 ? 84 : index === 1 ? 103 : 63}`} />
              </g>
            ))}
            <rect className="open-ena-figure-run" x="111" y="334" width="161" height="38" rx="5" />
            <circle cx="130" cy="353" r="4" />
            <path d="M143 353h75" />
            <rect className="open-ena-figure-note" x="111" y="388" width="161" height="27" rx="4" />
            <path d="M123 401.5h125" />

            <rect className="open-ena-figure-plot" x="295" y="88" width="286" height="350" />
            <text className="open-ena-figure-kicker" x="318" y="122">{copy.figureLabels.comparison}</text>
            <text className="open-ena-figure-plot-title" x="318" y="147">{copy.figureLabels.twoD}</text>
            <g className="open-ena-figure-grid" aria-hidden="true">
              <path d="M318 205H558M318 260H558M318 315H558M368 169V346M438 169V346M508 169V346" />
              <path className="open-ena-figure-axis" d="M318 260H558M438 169V346" />
            </g>
            <g className="open-ena-figure-network-primary" fill="none" strokeLinecap="round">
              <path d="M382 174L494 153M494 153L535 252M535 252L443 315M443 315L342 275M342 275L382 174M382 174L443 315" />
            </g>
            <g className="open-ena-figure-network-secondary" fill="none" strokeLinecap="round">
              <path d="M382 174L535 252M494 153L443 315M494 153L342 275M535 252L342 275" />
            </g>
            <g className="open-ena-figure-unit-points" aria-hidden="true">
              <circle cx="407" cy="223" r="4" />
              <circle cx="421" cy="239" r="4" />
              <circle cx="398" cy="253" r="4" />
              <rect x="472" y="248" width="9" height="9" />
              <rect x="487" y="267" width="9" height="9" />
              <rect x="465" y="282" width="9" height="9" />
            </g>
            <g className="open-ena-figure-nodes">
              {comparisonNodes.map((node) => (
                <g key={`${node.x}-${node.y}`}>
                  <circle cx={node.x} cy={node.y} r="12" />
                  <circle cx={node.x} cy={node.y} r="4" />
                </g>
              ))}
            </g>
            <g className="open-ena-figure-legend">
              <circle cx="327" cy="402" r="5" />
              <path d="M339 402h55" />
              <rect x="420" y="397" width="10" height="10" />
              <path d="M440 402h57" />
            </g>

            <rect className="open-ena-figure-side" x="581" y="88" width="161" height="350" />
            {[{ y: 110, label: copy.figureLabels.primary, tone: "primary" }, { y: 257, label: copy.figureLabels.secondary, tone: "secondary" }].map((plot) => (
              <g key={plot.y} className={`open-ena-figure-mini is-${plot.tone}`}>
                <text x="601" y={plot.y + 17}>{plot.label}</text>
                <rect x="601" y={plot.y + 30} width="120" height="94" rx="5" />
                <path d={`M618 ${plot.y + 95}L652 ${plot.y + 57}L695 ${plot.y + 83}L665 ${plot.y + 108}L618 ${plot.y + 95}`} />
                <circle cx="618" cy={plot.y + 95} r="5" />
                <circle cx="652" cy={plot.y + 57} r="5" />
                <circle cx="695" cy={plot.y + 83} r="5" />
                <circle cx="665" cy={plot.y + 108} r="5" />
              </g>
            ))}

            <path className="open-ena-figure-flow" d="M18 438h724v22a22 22 0 0 1-22 22H40a22 22 0 0 1-22-22Z" />
            {[copy.figureLabels.data, copy.figureLabels.model, copy.figureLabels.comparison, copy.figureLabels.export].map((label, index) => {
              const x = 89 + index * 182;
              return (
                <g key={label} className="open-ena-figure-flow-step">
                  <circle cx={x} cy="460" r="10" />
                  <text x={x + 18} y="465">{label}</text>
                  {index < 3 ? <path d={`M${x + 96} 460h48l-7-7m7 7-7 7`} /> : null}
                </g>
              );
            })}
          </svg>
          <figcaption>{copy.figureCaption}</figcaption>
        </figure>
      </div>
    </section>
  );
}
