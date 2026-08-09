import { newsArticles } from "./news-data";
import { slugifyTopic } from "./news-format";

export interface NewsTopic {
  slug: string;
  label: string;
  count: number;
}

export function getNewsTopics(): NewsTopic[] {
  const topics = new Map<string, { label: string; count: number }>();

  for (const article of newsArticles) {
    for (const tag of article.tags) {
      const slug = slugifyTopic(tag);
      if (!slug) continue;
      const existing = topics.get(slug);
      if (existing) existing.count += 1;
      else topics.set(slug, { label: tag, count: 1 });
    }
  }

  return [...topics.entries()]
    .map(([slug, value]) => ({ slug, label: value.label, count: value.count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function getNewsTopic(slug: string) {
  return getNewsTopics().find((topic) => topic.slug === slug);
}

export function getNewsArticlesForTopic(slug: string) {
  return newsArticles.filter((article) => article.tags.some((tag) => slugifyTopic(tag) === slug));
}
