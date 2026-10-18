import type { Dictionary, Locale } from "./i18n";
import { getOpenEnaNavLabel } from "./open-ena-i18n";
import { getPluginLabCopy } from "./plugin-lab/i18n";
import { siteConfig } from "./site";
import type { HubFooterCopy } from "../components/shared-home-footer/HubFooter";

export function getHomeFooterCopy(locale: Locale, dictionary: Dictionary): HubFooterCopy {
  return {
    brandName: siteConfig.brandName,
    tagline: siteConfig.tagline,
    ...dictionary.footer,
    nav: { ...dictionary.nav, openEna: getOpenEnaNavLabel(locale), plugins: getPluginLabCopy(locale).navLabel },
    resources: {
      openWebtool: dictionary.common.openWebtool,
      browseResources: dictionary.common.browseResources,
      tutorial: dictionary.footer.tutorialTitle,
      officialWebtoolUrl: siteConfig.officialWebtoolUrl,
      officialResourcesUrl: siteConfig.officialResourcesUrl,
      tutorialUrl: siteConfig.tutorialUrl,
    },
  };
}
