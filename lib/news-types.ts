export const NEWS_TYPES = ["journal", "conference"] as const;

export type NewsType = (typeof NEWS_TYPES)[number];

export interface NewsSource {
  label: string;
  url: string;
}

export interface NewsArticle {
  id: string;
  slug: string;
  title: string;
  authors: string[];
  venue: string;
  year: number;
  type: NewsType;
  tags: string[];
  image: string;
  imageAlt: string;
  summaryImage: string;
  summaryImageAlt: string;
  summaryAudio: string;
  summaryAudioTitle: string;
  shortSummary: string;
  fullSummary: string;
  keyTakeaways: [string, string, string];
  whyItMatters: string;
  sourceUrl: string;
  sourceUrls: NewsSource[];
  doi: string;
  createdAt: string;
}

export interface NewsFilterOptions {
  q?: string;
  type?: string;
  year?: string;
  page?: number;
  pageSize?: number;
}

export interface NewsFilterResult {
  items: NewsArticle[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
