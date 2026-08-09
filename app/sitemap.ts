import type { MetadataRoute } from "next";
import { locales } from "@/lib/i18n";
import { newsArticles } from "@/lib/news-data";
import { getNewsTopics } from "@/lib/news-topics";
import { siteConfig } from "@/lib/site";

const routes = ["", "/mission", "/news", "/academy", "/about"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const indexRoutes: MetadataRoute.Sitemap = routes.flatMap((route) =>
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

  const articleRoutes = newsArticles.flatMap((article) =>
    locales.map((locale) => ({
      url: `${siteConfig.url}/${locale}/news/${article.slug}`,
      lastModified: article.createdAt,
      changeFrequency: "monthly" as const,
      priority: 0.75,
      alternates: {
        languages: Object.fromEntries(
          locales.map((item) => [item, `${siteConfig.url}/${item}/news/${article.slug}`])
        ),
      },
    }))
  );

  const topicRoutes = getNewsTopics().flatMap((topic) =>
    locales.map((locale) => ({
      url: `${siteConfig.url}/${locale}/news/topic/${topic.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.65,
      alternates: {
        languages: Object.fromEntries(
          locales.map((item) => [item, `${siteConfig.url}/${item}/news/topic/${topic.slug}`])
        ),
      },
    }))
  );

  return [...indexRoutes, ...articleRoutes, ...topicRoutes];
}
