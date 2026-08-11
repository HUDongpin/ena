import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  academyLessons,
  getAcademyLessonText,
  getRelatedAcademyLessons,
} from "../lib/academy-data";
import { filterAcademyLessons } from "../lib/academy-filter";
import { getAcademyCopy, getAcademyResultLabel } from "../lib/academy-i18n";
import { ACADEMY_LEVELS, ACADEMY_TRACKS, ACADEMY_VISUALS } from "../lib/academy-types";
import { locales } from "../lib/i18n";
import { learningResourceJsonLd } from "../lib/structured-data";

const projectRoot = process.cwd();

function publicPath(value: string) {
  return join(projectRoot, "public", value.replace(/^\//, ""));
}

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

test("the ENA Academy remains a continuous, unique, and cumulative pathway", () => {
  const expectedSequences = Array.from({ length: academyLessons.length }, (_, index) => index + 1);
  assert.deepEqual(academyLessons.map((lesson) => lesson.id), expectedSequences.map((sequence) => `academy-${String(sequence).padStart(3, "0")}`));
  assert.deepEqual(academyLessons.map((lesson) => lesson.sequence), expectedSequences);
  assert.equal(new Set(academyLessons.map((lesson) => lesson.slug)).size, academyLessons.length);
  assert.equal(new Set(academyLessons.map((lesson) => normalize(lesson.title))).size, academyLessons.length);
  assert.equal(new Set(academyLessons.map((lesson) => lesson.tags.map(normalize).sort().join("|"))).size, academyLessons.length);
  assert.equal(new Set(academyLessons.flatMap((lesson) => lesson.learningObjectives.map(normalize))).size, academyLessons.length * 3);
  assert.deepEqual(new Set(academyLessons.map((lesson) => lesson.visual)), new Set(ACADEMY_VISUALS));
  assert.deepEqual(new Set(academyLessons.map((lesson) => lesson.track)), new Set(ACADEMY_TRACKS));
  assert.deepEqual(new Set(academyLessons.map((lesson) => lesson.level)), new Set(ACADEMY_LEVELS));

  for (const lesson of academyLessons) {
    assert.match(lesson.id, /^academy-\d{3}$/);
    assert.match(lesson.slug, /^[a-z0-9-]+$/);
    assert.match(lesson.publishedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(Number(lesson.id.replace("academy-", "")), lesson.sequence);
    assert.equal(lesson.tags.length >= 4, true);
    assert.equal(lesson.learningObjectives.length, 3);
    assert.equal(new Set(lesson.learningObjectives.map(normalize)).size, 3);
    assert.equal(lesson.steps.length >= 6, true);
    assert.equal(lesson.steps.every((step) => step.title.length > 5 && step.text.length > 120 && step.checkpoint.length > 40), true);
    assert.equal(new Set(lesson.steps.map((step) => normalize(step.title))).size, lesson.steps.length);
    assert.equal(lesson.coreIdeas.length, 3);
    assert.equal(lesson.analysisChecks.length, 4);
    assert.equal(lesson.methodBoundary.length > 180, true);
    assert.equal(lesson.sources.length >= 2, true);
    assert.equal(lesson.sources.every((source) => source.url.startsWith("https://")), true);
    assert.equal(new Set(lesson.sources.map((source) => source.url)).size, lesson.sources.length);
    assert.equal(getAcademyLessonText(lesson).trim().split(/\s+/).length >= 650, true);
    assert.equal((lesson.downloads?.length ?? 0) > 0, true);
    assert.equal(new Set((lesson.downloads ?? []).map((download) => download.href)).size, lesson.downloads?.length);
    for (const download of lesson.downloads ?? []) {
      assert.equal(existsSync(publicPath(download.href)), true, `Missing Academy download: ${download.href}`);
      assert.equal(download.label.trim().length > 5 && download.note.trim().length > 20, true);
    }
  }
});

test("Academy filtering searches tutorial semantics and clamps pagination", () => {
  assert.deepEqual(
    filterAcademyLessons(academyLessons, { track: "modeling" }).items.map((lesson) => lesson.id),
    ["academy-003", "academy-005"],
  );
  assert.deepEqual(
    filterAcademyLessons(academyLessons, { level: "beginner" }).items.map((lesson) => lesson.id),
    ["academy-001", "academy-002"],
  );
  assert.deepEqual(
    filterAcademyLessons(academyLessons, { q: "moving stanza" }).items.map((lesson) => lesson.id),
    ["academy-003"],
  );
  assert.deepEqual(
    filterAcademyLessons(academyLessons, { q: "codebook" }).items.map((lesson) => lesson.id),
    ["academy-002"],
  );
  assert.deepEqual(
    filterAcademyLessons(academyLessons, { q: "normalization" }).items.map((lesson) => lesson.id),
    ["academy-001", "academy-003", "academy-004", "academy-005"],
  );
  assert.deepEqual(
    filterAcademyLessons(academyLessons, { q: "Siebert-Evenstone" }).items.map((lesson) => lesson.id),
    ["academy-003"],
  );
  const paged = filterAcademyLessons(academyLessons, { page: 99, pageSize: 2 });
  assert.equal(paged.page, Math.ceil(academyLessons.length / 2));
  assert.equal(paged.totalPages, Math.ceil(academyLessons.length / 2));
  assert.deepEqual(paged.items.map((lesson) => lesson.id), academyLessons.slice((paged.page - 1) * 2).map((lesson) => lesson.id));
});

test("the synthetic practice dataset is complete, ordered, balanced, and explicitly coded", () => {
  const datasetPath = publicPath("/data/academy/ena-design-talk-sample.csv");
  const lines = readFileSync(datasetPath, "utf8").trim().split("\n");
  const headers = lines[0].split(",");
  assert.deepEqual(headers, [
    "team_id",
    "condition",
    "discussion_round",
    "conversation_id",
    "line_number",
    "speaker",
    "utterance",
    "goal",
    "evidence",
    "strategy",
    "tradeoff",
    "revision",
  ]);
  assert.equal(lines.length - 1, 48);

  const records = lines.slice(1).map((line) => Object.fromEntries(
    line.split(",").map((value, index) => [headers[index], value]),
  ));
  const teamIds = [...new Set(records.map((record) => record.team_id))];
  const conversationIds = [...new Set(records.map((record) => record.conversation_id))];
  assert.equal(teamIds.length, 8);
  assert.equal(conversationIds.length, 8);
  assert.equal(records.filter((record) => record.condition === "baseline").length, 24);
  assert.equal(records.filter((record) => record.condition === "scaffolded").length, 24);

  for (const conversationId of conversationIds) {
    const conversationRows = records.filter((record) => record.conversation_id === conversationId);
    assert.equal(new Set(conversationRows.map((record) => record.team_id)).size, 1);
    assert.equal(new Set(conversationRows.map((record) => record.discussion_round)).size, 1);
  }

  const codeColumns = ["goal", "evidence", "strategy", "tradeoff", "revision"];
  assert.equal(records.every((record) => codeColumns.every((code) => record[code] === "0" || record[code] === "1")), true);
  assert.equal(records.some((record) => codeColumns.filter((code) => record[code] === "1").length >= 3), true);
  for (const teamId of teamIds) {
    const teamRows = records.filter((record) => record.team_id === teamId);
    assert.deepEqual(teamRows.map((record) => Number(record.line_number)), [1, 2, 3, 4, 5, 6]);
    assert.equal(teamRows.every((record) => record.discussion_round === "round-1"), true);
    assert.equal(teamRows.every((record) => record.conversation_id === `${teamId}-round-1`), true);
  }

  const modelingLesson = academyLessons.find((lesson) => lesson.id === "academy-003");
  assert.ok(modelingLesson);
  assert.match(getAcademyLessonText(modelingLesson), /conversation_id/);
  assert.doesNotMatch(getAcademyLessonText(modelingLesson), /Use discussion_round as the conversation field/);
});

test("all 14 locale shells expose complete Academy interface copy", () => {
  for (const locale of locales) {
    const copy = getAcademyCopy(locale);
    const scalarValues = Object.entries(copy)
      .filter(([key]) => key !== "trackLabels" && key !== "levelLabels")
      .map(([, value]) => value as string);
    assert.equal(scalarValues.every((value) => value.trim().length > 0), true);
    assert.equal(Object.values(copy.trackLabels).every((value) => value.trim().length > 0), true);
    assert.equal(Object.values(copy.levelLabels).every((value) => value.trim().length > 0), true);
    assert.match(copy.title, /ENA/);
    assert.equal(copy.englishContentNote.trim().length > 8, true);
  }

  assert.equal(getAcademyResultLabel("en", 1), "lesson");
  assert.equal(getAcademyResultLabel("en", 4), "lessons");
  assert.equal(getAcademyResultLabel("de", 1), "Lektion");
  assert.equal(getAcademyResultLabel("de", 4), "Lektionen");
  assert.equal(getAcademyResultLabel("ar", 1), "درس");
  assert.equal(getAcademyResultLabel("ar", 4), "دروس");
  assert.equal(getAcademyResultLabel("ru", 2), "урока");
  assert.equal(getAcademyResultLabel("ru", 5), "уроков");
});

test("Academy related records follow curriculum adjacency", () => {
  assert.deepEqual(
    getRelatedAcademyLessons(academyLessons[0]).map((lesson) => lesson.id),
    ["academy-002", "academy-003", "academy-004"],
  );
  assert.deepEqual(
    getRelatedAcademyLessons(academyLessons[3]).map((lesson) => lesson.id),
    ["academy-003", "academy-005", "academy-002"],
  );
  assert.equal(getRelatedAcademyLessons(academyLessons[2])[0].id, "academy-005");
  assert.equal(getRelatedAcademyLessons(academyLessons[4])[0].id, "academy-003");
});

test("Academy structured data identifies an English tutorial rather than News", () => {
  const lesson = academyLessons[0];
  const data = learningResourceJsonLd({
    name: lesson.title,
    description: lesson.shortSummary,
    datePublished: lesson.publishedAt,
    educationalLevel: "Beginner",
    teaches: lesson.learningObjectives,
    keywords: lesson.tags,
    durationMinutes: lesson.durationMinutes,
    url: `https://www.ena.hk/en/academy/${lesson.slug}`,
    sourceUrls: lesson.sources.map((source) => source.url),
    steps: lesson.steps.map((step) => ({ name: step.title, text: step.text })),
  });

  assert.equal(data["@type"], "LearningResource");
  assert.equal(data.learningResourceType, "Tutorial");
  assert.equal(data.inLanguage, "en");
  assert.equal(data.isAccessibleForFree, true);
  assert.equal(data.timeRequired, "PT20M");
  assert.equal(data.hasPart.length, lesson.steps.length);
  assert.equal(data.hasPart.every((part) => part["@type"] === "HowToStep"), true);
  assert.doesNotMatch(JSON.stringify(data), /NewsArticle|ScholarlyArticle/);
});

test("Academy routes keep English fallback content explicit and use tutorial visuals", () => {
  const detailSource = readFileSync(join(projectRoot, "app", "[locale]", "academy", "[slug]", "page.tsx"), "utf8");
  const indexSource = readFileSync(join(projectRoot, "app", "[locale]", "academy", "page.tsx"), "utf8");
  const visualSource = readFileSync(join(projectRoot, "components", "AcademyLessonVisual.tsx"), "utf8");
  assert.match(detailSource, /lang="en" dir="ltr"/);
  assert.doesNotMatch(detailSource, /academy-tutorial-card" lang="en"/);
  assert.match(detailSource, /learningResourceJsonLd/);
  assert.match(detailSource, /getAcademyCopy\("en"\)\.levelLabels/);
  assert.match(detailSource, /socialImage/);
  assert.match(detailSource, /images: \[socialImage\]/);
  assert.doesNotMatch(detailSource, /reviewArticleJsonLd|NewsArticle/);
  assert.match(indexSource, /AcademyFilters/);
  assert.match(indexSource, /AcademyCard/);
  assert.match(visualSource, /COMPARISON PLOT/);
  assert.match(visualSource, /SOURCE ROWS/);
  assert.match(visualSource, /ONE NETWORK = ONE TEAM/);
});
