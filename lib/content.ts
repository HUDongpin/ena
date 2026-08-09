import { newsArticles } from "./news-data";
import { academyLessons } from "./academy-data";

// Compatibility exports for site-level collection checks. The authoritative
// records live in their dedicated reviewed data modules.
export const newsItems = newsArticles;
export { academyLessons };
