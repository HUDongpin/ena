export interface NewsItem {
  slug: string;
  title: string;
  publishedAt: string;
}

export interface AcademyLesson {
  slug: string;
  title: string;
  level: string;
}

// These collections intentionally begin empty. Future content should be
// reviewed before it is added to the public News or Academy routes.
export const newsItems: readonly NewsItem[] = [];
export const academyLessons: readonly AcademyLesson[] = [];
