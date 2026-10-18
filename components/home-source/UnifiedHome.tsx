import Link from "next/link";
import NetworkHero from "./NetworkHero";
import OpenEnaPreview from "./OpenEnaPreview";
import HomeHeader from "./HomeHeader";
import styles from "./unified-home/Home.module.css";

export default function UnifiedHome({ homeHref = "/", aboutHref = "/about", footer }: { homeHref?: string; aboutHref?: string; footer: React.ReactNode }) {
  return (<>
    <div className={styles.home} lang="en" dir="ltr">
      <HomeHeader homeHref={homeHref} aboutHref={aboutHref} />
      <main id="main-content">
        <section className="open-hero" aria-labelledby="open-hero-title">
          <div className="open-hero-copy">
            <p className="eyebrow"><span aria-hidden="true" /> OPEN METHODS · OPEN TOOLING</p>
            <h1 id="open-hero-title">Epistemic networks,<br /><em>open by design.</em></h1>
            <p className="open-hero-lead">Open ENA is a focused, browser-based path from coded discourse to interpretable connections—designed around jENA and shaped for transparent research.</p>
            <div className="open-hero-actions">
              <a className="button-primary" href="#workspace">Explore the interface</a>
              <Link className="button-secondary" href={aboutHref}>Meet the team</Link>
            </div>
            <dl className="open-hero-facts">
              <div><dt>Framework</dt><dd>Next.js</dd></div>
              <div><dt>Planned runtime</dt><dd>jENA 0.6.2</dd></div>
              <div><dt>Current release</dt><dd>UI preview</dd></div>
            </dl>
          </div>
          <NetworkHero />
        </section>
        <OpenEnaPreview />
      </main>
    </div>
    {footer}
  </>);
}
