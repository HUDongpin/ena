import type {
  AcademyFilterOptions,
  AcademyFilterResult,
  AcademyLesson,
} from "./academy-types";
import { ACADEMY_LEVELS, ACADEMY_TRACKS } from "./academy-types";

export function filterAcademyLessons(
  lessons: AcademyLesson[],
  options: AcademyFilterOptions = {},
): AcademyFilterResult {
  const query = options.q?.trim().toLocaleLowerCase() ?? "";
  const track = ACADEMY_TRACKS.includes(options.track as (typeof ACADEMY_TRACKS)[number])
    ? options.track
    : undefined;
  const level = ACADEMY_LEVELS.includes(options.level as (typeof ACADEMY_LEVELS)[number])
    ? options.level
    : undefined;
  const pageSize = Math.max(1, Math.min(24, Math.trunc(options.pageSize ?? 6)));

  const filtered = lessons.filter((lesson) => {
    if (track && lesson.track !== track) return false;
    if (level && lesson.level !== level) return false;
    if (!query) return true;

    const searchable = [
      lesson.title,
      lesson.tags.join(" "),
      lesson.shortSummary,
      lesson.introduction.join(" "),
      lesson.caseStudy.title,
      lesson.caseStudy.text,
      lesson.learningObjectives.join(" "),
      lesson.steps.flatMap((step) => [step.title, step.text, step.checkpoint]).join(" "),
      lesson.coreIdeas.join(" "),
      lesson.analysisChecks.join(" "),
      lesson.methodBoundary,
      lesson.sources.map((source) => source.label).join(" "),
    ].join(" ").toLocaleLowerCase();

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
