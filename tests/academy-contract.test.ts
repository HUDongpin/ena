import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
import { academyCovers, getAcademyCover } from "../lib/academy-covers";
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

const requiredThirtyDayDates = Array.from({ length: 30 }, (_, offset) =>
  new Date(Date.UTC(2026, 6, 23 + offset)).toISOString().slice(0, 10),
);

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
  assert.deepEqual(
    [...new Set(academyLessons.map((lesson) => lesson.publishedAt))].sort(),
    requiredThirtyDayDates,
  );

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
    filterAcademyLessons(academyLessons, { track: "modeling", pageSize: 100 }).items.map((lesson) => lesson.id),
    ["academy-003", "academy-005", "academy-012", "academy-013", "academy-014", "academy-015", "academy-021", "academy-022", "academy-027"],
  );
  assert.deepEqual(
    filterAcademyLessons(academyLessons, { level: "beginner", pageSize: 100 }).items.map((lesson) => lesson.id),
    ["academy-001", "academy-002", "academy-008", "academy-018", "academy-025", "academy-026", "academy-029", "academy-032"],
  );
  assert.deepEqual(
    filterAcademyLessons(academyLessons, { q: "moving stanza", pageSize: 100 }).items.map((lesson) => lesson.id),
    ["academy-003", "academy-007"],
  );
  assert.equal(filterAcademyLessons(academyLessons, { q: "codebook", pageSize: 100 }).items.some((lesson) => lesson.id === "academy-006"), true);
  assert.deepEqual(
    filterAcademyLessons(academyLessons, { q: "Compare ENA Normalization Choices", pageSize: 24 }).items.map((lesson) => lesson.id),
    ["academy-027"],
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

test("Academy search understands simplified and traditional Chinese categories and method keywords", () => {
  const search = (q: string) => filterAcademyLessons(academyLessons, { q, pageSize: 24 }).items.map(lesson => lesson.id);
  assert.deepEqual(search("建模"), filterAcademyLessons(academyLessons, { track: "modeling", pageSize: 24 }).items.map(lesson => lesson.id));
  assert.deepEqual(search("資料準備"), search("数据准备"));
  assert.ok(search("数据准备").length > 0);
  assert.deepEqual(search("入門"), search("入门"));
  assert.ok(search("编码信度").includes("academy-006"));
  assert.ok(search("編碼信度").includes("academy-006"));
  assert.ok(search("纵向轨迹").includes("academy-021"));
  assert.ok(search("縱向軌跡").includes("academy-021"));
  assert.ok(search("缺失数据").includes("academy-025"));
  assert.equal(filterAcademyLessons(academyLessons, { q: "建模", track: "interpretation" }).total, 0);
  assert.equal(filterAcademyLessons(academyLessons, { q: "不存在的教学主题" }).total, 0);
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
    ["academy-007", "academy-009", "academy-011"],
  );
  assert.deepEqual(
    getRelatedAcademyLessons(academyLessons[3]).map((lesson) => lesson.id),
    ["academy-008", "academy-010", "academy-017"],
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

test("Academy routes preserve English content and every lesson has an attributed tutorial cover", () => {
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
  assert.deepEqual(Object.keys(academyCovers).sort(), academyLessons.map((lesson) => lesson.id).sort());
  const imageHashes = new Set<string>();
  for (const lesson of academyLessons) {
    const cover = getAcademyCover(lesson.id);
    assert.match(cover.src, /^\/images\/academy\/tutorial-2024-fig(?:\d+|[a-z]+)\.webp$/);
    assert.equal(cover.width, 1600);
    assert.equal(cover.height, 900);
    assert.ok(cover.alt.length > 40, `Describe the artwork for ${lesson.id}`);
    const bytes = readFileSync(publicPath(cover.src));
    assert.ok(bytes.length > 1000 && bytes.length <= 256_000, `Cover size budget: ${lesson.id}`);
    imageHashes.add(createHash("sha256").update(bytes).digest("hex"));
    assert.match(cover.sourceUrl, /^https:\/\/link\.springer\.com\/chapter\//);
    assert.equal(cover.license, "CC BY 4.0");
    assert.equal(cover.licenseUrl, "https://creativecommons.org/licenses/by/4.0/");
    assert.match(cover.credit, /Tan et al\. \(2024\)/);
    assert.ok(cover.caption.length > 15);
  }
  assert.equal(imageHashes.size, new Set(academyLessons.map((lesson) => getAcademyCover(lesson.id).src)).size,
    "Different source assets must not accidentally contain duplicate image bytes");
  const credits = readFileSync(join(projectRoot, "components", "AcademyCoverCredit.tsx"), "utf8");
  assert.match(credits, /href=\{cover.sourceUrl\}/);
  assert.match(credits, /href=\{cover.licenseUrl\}/);
  assert.throws(() => getAcademyCover("missing-lesson"), /Missing Academy cover/);
  assert.match(visualSource, /from "next\/image"/);
  assert.match(visualSource, /getAcademyCover/);
});
