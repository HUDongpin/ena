import type { MetadataRoute } from "next";
import { locales } from "@/lib/i18n";
import { siteConfig } from "@/lib/site";

const routes = ["", "/mission", "/news", "/academy", "/about"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.flatMap((route) =>
    locales.map((locale) => ({
      url: `${siteConfig.url}/${locale}${route}`,
      changeFrequency: route === "/news" || route === "/academy" ? "weekly" : "monthly",
      priority: route === "" ? 1 : 0.8,
      alternates: {
        languages: Object.fromEntries(
          locales.map((item) => [item, `${siteConfig.url}/${item}${route}`])
        ),
      },
    }))
  );
}
