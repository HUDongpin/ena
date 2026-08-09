import { newsArticles } from "./news-data";

export interface AcademyLesson {
  slug: string;
  title: string;
  level: string;
}

// News is a reviewed, source-linked research collection. Academy remains empty
// until its first method lesson passes a separate publication review.
export const newsItems = newsArticles;
export const academyLessons: readonly AcademyLesson[] = [];
