import Link from "next/link";
import type { Dictionary, Locale } from "@/lib/i18n";
import { siteConfig } from "@/lib/site";
import Logo from "./Logo";

interface FooterProps {
  locale: Locale;
  dictionary: Dictionary;
}

export default function Footer({ locale, dictionary }: FooterProps) {
  const navItems = [
    { href: `/${locale}`, label: dictionary.nav.home },
    { href: `/${locale}/mission`, label: dictionary.nav.mission },
    { href: `/${locale}/news`, label: dictionary.nav.news },
    { href: `/${locale}/academy`, label: dictionary.nav.academy },
    { href: `/${locale}/about`, label: dictionary.nav.about },
  ];
  const resourceItems = [
    { href: siteConfig.officialWebtoolUrl, label: dictionary.common.openWebtool },
    { href: siteConfig.officialResourcesUrl, label: dictionary.common.browseResources },
    { href: siteConfig.tutorialUrl, label: dictionary.footer.tutorialTitle },
  ];

  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <Logo locale={locale} />
          <p>{dictionary.footer.description}</p>
        </div>
        <div>
          <h2>{dictionary.footer.navigation}</h2>
          <div className="footer-links">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        <div>
          <h2>{dictionary.footer.primaryResources}</h2>
          <div className="footer-links">
            {resourceItems.map((item) => (
              <a key={item.href} href={item.href} target="_blank" rel="noreferrer">
                {item.label}
              </a>
            ))}
          </div>
        </div>
      </div>
      <div className="footer-bottom">{dictionary.footer.copyright}</div>
    </footer>
  );
}
