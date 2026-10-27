import Link from "next/link";
import NetworkHero from "./NetworkHero";
import type { Locale } from "@/lib/i18n";
import OpenEnaAttribution from "@/components/OpenEnaAttribution";
import styles from "./unified-home/Home.module.css";

export default function UnifiedHome({ locale, aboutHref = "/about", openEnaHref, footer }: { locale: Locale; aboutHref?: string; openEnaHref: string; footer: React.ReactNode }) {
  return (<>
    <div className={styles.home} lang="en" dir="ltr">
      <main id="main-content">
        <section className="open-hero" aria-labelledby="open-hero-title">
          <div className="open-hero-copy">
            <p className="eyebrow"><span aria-hidden="true" /> OPEN METHODS · OPEN TOOLING</p>
            <h1 id="open-hero-title">Epistemic networks,<br /><em>open by design.</em></h1>
            <p className="open-hero-lead">Open ENA is a focused, browser-based path from coded discourse to interpretable connections—designed around jENA and shaped for transparent research.</p>
            <div className="open-hero-actions">
              <Link className="button-primary" href={openEnaHref} prefetch={false}>Open ENA</Link>
              <Link className="button-secondary" href={aboutHref} prefetch={false}>Meet the team</Link>
            </div>
          </div>
          <NetworkHero />
        </section>
        <OpenEnaAttribution locale={locale} aboutHref={aboutHref} />
      </main>
    </div>
    {footer}
  </>);
}
