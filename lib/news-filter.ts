import type { NewsArticle, NewsFilterOptions, NewsFilterResult } from "./news-types";
import { NEWS_TYPES } from "./news-types";

export function filterNewsArticles(
  articles: NewsArticle[],
  options: NewsFilterOptions = {},
): NewsFilterResult {
  const query = options.q?.trim().toLocaleLowerCase() ?? "";
  const type = NEWS_TYPES.includes(options.type as (typeof NEWS_TYPES)[number])
    ? options.type
    : undefined;
  const year = /^\d{4}$/.test(options.year ?? "") ? Number(options.year) : undefined;
  const pageSize = Math.max(1, Math.min(24, Math.trunc(options.pageSize ?? 6)));

  const filtered = articles.filter((article) => {
    if (type && article.type !== type) return false;
    if (year && article.year !== year) return false;
    if (!query) return true;

    const searchable = [
      article.title,
      article.authors.join(" "),
      article.venue,
      article.tags.join(" "),
      article.shortSummary,
    ]
      .join(" ")
      .toLocaleLowerCase();

    return searchable.includes(query);
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const requestedPage = Number.isFinite(options.page) ? Math.trunc(options.page ?? 1) : 1;
  const page = Math.max(1, Math.min(totalPages, requestedPage));
  const offset = (page - 1) * pageSize;

  return {
    items: filtered.slice(offset, offset + pageSize),
    total,
    page,
    pageSize,
    totalPages,
  };
}
