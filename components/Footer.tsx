import Link from "next/link";
import type { Dictionary, Locale } from "@/lib/i18n";
import { getOpenEnaNavLabel } from "@/lib/open-ena-i18n";
import { siteConfig } from "@/lib/site";
import AnalyticsConsentControl from "./AnalyticsConsentControl";
import Logo from "./Logo";

interface FooterProps {
  locale: Locale;
  dictionary: Dictionary;
}

const analyticsConsentCopy = {
  en: {
    enable: "Allow aggregate analytics",
    disable: "Disable analytics",
  },
  "zh-hant": {
    enable: "允許彙總分析",
    disable: "停用分析",
  },
  "zh-hans": {
    enable: "允许聚合分析",
    disable: "停用分析",
  },
} as const;

export default function Footer({ locale, dictionary }: FooterProps) {
  const analyticsCopy = locale === "zh-hant" || locale === "zh-hans"
    ? analyticsConsentCopy[locale]
    : analyticsConsentCopy.en;
  const navItems = [
    { href: `/${locale}`, label: dictionary.nav.home },
    { href: `/${locale}/mission`, label: dictionary.nav.mission },
    { href: `/${locale}/open-ena`, label: getOpenEnaNavLabel(locale) },
    { href: `/${locale}/news`, label: dictionary.nav.news },
    { href: `/${locale}/academy`, label: dictionary.nav.academy },
    { href: `/${locale}/about`, label: dictionary.nav.about },
  ];
  const resourceItems = [
    { href: `/${locale}/open-ena`, label: dictionary.common.openWebtool, external: false },
    { href: siteConfig.officialWebtoolUrl, label: "Official webENA", external: true },
    { href: siteConfig.officialResourcesUrl, label: dictionary.common.browseResources, external: true },
    { href: siteConfig.tutorialUrl, label: dictionary.footer.tutorialTitle, external: true },
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
              <Link key={item.href} href={item.href} prefetch={item.href.endsWith("/about") ? false : undefined}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        <div>
          <h2>{dictionary.footer.primaryResources}</h2>
          <div className="footer-links">
            {resourceItems.map((item) => item.external ? (
              <a key={item.href} href={item.href} target="_blank" rel="noreferrer">{item.label}</a>
            ) : (
              <Link key={item.href} href={item.href}>{item.label}</Link>
            ))}
          </div>
        </div>
      </div>
      <div className="footer-analytics-preference">
        <AnalyticsConsentControl copy={analyticsCopy} />
      </div>
      <div className="footer-bottom">{dictionary.footer.copyright}</div>
    </footer>
  );
}
