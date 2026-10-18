import Link from "next/link";
import { Geist } from "next/font/google";
import styles from "./HubFooter.module.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });

export interface HubFooterCopy {
  brandName: string;
  tagline: string;
  description: string;
  navigation: string;
  primaryResources: string;
  copyright: string;
  nav: { home: string; mission: string; openEna: string; plugins: string; news: string; academy: string; about: string };
  resources: { openWebtool: string; browseResources: string; tutorial: string; officialWebtoolUrl: string; officialResourcesUrl: string; tutorialUrl: string };
}

export default function HubFooter({ copy, homeHref, aboutHref, featureBase, comfortableLinks = false }: {
  copy: HubFooterCopy;
  homeHref: string;
  aboutHref: string;
  featureBase: string;
  comfortableLinks?: boolean;
}) {
  const navItems = [
    { href: homeHref, label: copy.nav.home },
    { href: `${featureBase}/mission`, label: copy.nav.mission },
    { href: `${featureBase}/open-ena`, label: copy.nav.openEna },
    { href: `${featureBase}/plugins`, label: copy.nav.plugins },
    { href: `${featureBase}/news`, label: copy.nav.news },
    { href: `${featureBase}/academy`, label: copy.nav.academy },
    { href: aboutHref, label: copy.nav.about },
  ];
  const resourceItems = [
    { href: `${featureBase}/open-ena`, label: copy.resources.openWebtool, external: false },
    { href: copy.resources.officialWebtoolUrl, label: "Official webENA", external: true },
    { href: copy.resources.officialResourcesUrl, label: copy.resources.browseResources, external: true },
    { href: copy.resources.tutorialUrl, label: copy.resources.tutorial, external: true },
  ];
  return (
    <footer className={`${styles.footer} ${geist.variable}`} data-comfortable-links={comfortableLinks || undefined}>
      <div className="container footer-grid">
        <div className="footer-brand">
          <Link href={homeHref} className="brand-lockup" aria-label={`${copy.brandName} home`} dir="ltr">
            <span className="brand-mark"><img src="/unified-home/ena-mark.svg" width="48" height="48" alt="" /></span>
            <span className="brand-type"><span className="brand-name">ENA</span><span className="brand-description">{copy.tagline}</span></span>
          </Link>
          <p>{copy.description}</p>
        </div>
        <div>
          <h2>{copy.navigation}</h2>
          <div className="footer-links">
            {navItems.map(item => <Link key={item.href} href={item.href} prefetch={false}>{item.label}</Link>)}
          </div>
        </div>
        <div>
          <h2>{copy.primaryResources}</h2>
          <div className="footer-links">
            {resourceItems.map(item => item.external
              ? <a key={item.href} href={item.href} target="_blank" rel="noreferrer">{item.label}</a>
              : <Link key={item.href} href={item.href} prefetch={false}>{item.label}</Link>)}
          </div>
        </div>
      </div>
      <div className="footer-bottom">{copy.copyright}</div>
    </footer>
  );
}
