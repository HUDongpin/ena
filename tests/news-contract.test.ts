import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { newsArticles } from "../lib/news-data";
import { filterNewsArticles } from "../lib/news-filter";
import { locales } from "../lib/i18n";
import { getNewsCopy, getNewsResultLabel } from "../lib/news-i18n";
import { getNewsTopics } from "../lib/news-topics";
import { reviewArticleJsonLd } from "../lib/structured-data";

const projectRoot = process.cwd();

function publicPath(value: string) {
  return join(projectRoot, "public", value.replace(/^\//, ""));
}

function hash(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function pngDimensions(path: string) {
  const data = readFileSync(path);
  assert.equal(data.subarray(1, 4).toString("ascii"), "PNG");
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
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

test("the reviewed corpus keeps continuous ids, unique evidence, and balanced publication types", () => {
  const numericIds = newsArticles.map((article) => Number(article.id.replace("ena-", "")));
  const newestId = Math.max(...numericIds);
  assert.equal(newsArticles.length, newestId);
  assert.deepEqual([...numericIds].sort((a, b) => a - b), Array.from({ length: newestId }, (_, index) => index + 1));
  assert.deepEqual(
    newsArticles.map((article) => `${article.createdAt}:${article.id}`),
    [...newsArticles]
      .sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) ||
          Number(b.id.replace("ena-", "")) - Number(a.id.replace("ena-", "")),
      )
      .map((article) => `${article.createdAt}:${article.id}`),
  );
  assert.deepEqual(
    [...new Set(newsArticles.map((article) => article.createdAt))].sort(),
    requiredThirtyDayDates,
  );

  const journalCount = newsArticles.filter((article) => article.type === "journal").length;
  const conferenceCount = newsArticles.filter((article) => article.type === "conference").length;
  assert.equal(Math.abs(journalCount - conferenceCount) <= 1, true);
  assert.equal(journalCount > 0 && conferenceCount > 0, true);
  assert.deepEqual(newsArticles.find((article) => article.id === "ena-003")?.authors, ["Yotam Hod", "Shir Katz", "Brendan Eagan"]);

  assert.equal(new Set(newsArticles.map((article) => article.id)).size, newsArticles.length);
  assert.equal(new Set(newsArticles.map((article) => article.slug)).size, newsArticles.length);
  assert.equal(new Set(newsArticles.map((article) => normalize(article.title))).size, newsArticles.length);
  assert.equal(new Set(newsArticles.map((article) => article.doi.toLocaleLowerCase())).size, newsArticles.length);
  assert.equal(new Set(newsArticles.map((article) => article.sourceUrl.toLocaleLowerCase())).size, newsArticles.length);
  assert.equal(new Set(newsArticles.map((article) => article.authors.map(normalize).sort().join("|"))).size, newsArticles.length);
  assert.equal(new Set(newsArticles.map((article) => article.tags.map(normalize).sort().join("|"))).size, newsArticles.length);

  for (const article of newsArticles) {
    assert.match(article.id, /^ena-\d{3}$/);
    assert.match(article.slug, /^[a-z0-9-]+$/);
    assert.match(article.sourceUrl, /^https:\/\//);
    assert.match(article.doi, /^10\./);
    assert.match(article.createdAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(article.authors.length > 0 && article.authors.every((author) => author.trim().length > 2), true);
    assert.equal(article.tags.length >= 3, true);
    assert.equal(article.sourceUrls.length >= 2, true);
    assert.equal(new Set(article.sourceUrls.map((source) => source.url)).size, article.sourceUrls.length);
    assert.equal(article.sourceUrls.every((source) => source.label.trim().length > 3 && source.url.startsWith("https://")), true);
    assert.equal(article.sourceUrls.some((source) => source.url === article.sourceUrl), true);
    assert.equal(article.keyTakeaways.length, 3);
    assert.equal(article.shortSummary.trim().length >= 120 && article.shortSummary.trim().length <= 600, true);
    assert.equal(article.fullSummary.trim().split(/\s+/).length >= 350, true);
    assert.equal(article.whyItMatters.trim().length >= 80, true);
  }
});

test("filters search bibliographic and ENA topic fields and clamp pagination", () => {
  assert.equal(filterNewsArticles(newsArticles, { type: "journal" }).total, newsArticles.filter((article) => article.type === "journal").length);
  assert.equal(filterNewsArticles(newsArticles, { type: "conference" }).total, newsArticles.filter((article) => article.type === "conference").length);
  assert.deepEqual(filterNewsArticles(newsArticles, { year: "2024", pageSize: 100 }).items.map((article) => article.id), ["ena-006", "ena-018", "ena-016", "ena-014"]);
  assert.deepEqual(filterNewsArticles(newsArticles, { q: "natural language processing", pageSize: 100 }).items.map((article) => article.id), ["ena-007", "ena-013"]);
  assert.deepEqual(filterNewsArticles(newsArticles, { q: "gaze" }).items.map((article) => article.id), ["ena-001"]);
  assert.deepEqual(filterNewsArticles(newsArticles, { q: "Gašević" }).items.map((article) => article.id), ["ena-005", "ena-002"]);
  const paged = filterNewsArticles(newsArticles, { page: 99, pageSize: 2 });
  assert.equal(paged.page, Math.ceil(newsArticles.length / 2));
  assert.equal(paged.totalPages, Math.ceil(newsArticles.length / 2));
  assert.deepEqual(paged.items.map((article) => article.id), newsArticles.slice((paged.page - 1) * 2).map((article) => article.id));
});

test("every article has unique, id-aligned 16:10 media with same-bitmap placements", () => {
  const masterHashes = new Set<string>();
  const audioHashes = new Set<string>();

  for (const article of newsArticles) {
    assert.match(article.image, /^\/images\/research\/covers\/.+\.png$/);
    assert.match(article.summaryImage, /^\/images\/research\/summary\/.+\.png$/);
    assert.equal(article.image.includes(article.id), true);
    assert.equal(article.summaryImage.includes(article.id), true);
    assert.equal(article.summaryImageAlt, article.imageAlt);

    const coverPath = publicPath(article.image);
    const summaryPath = publicPath(article.summaryImage);
    assert.equal(existsSync(coverPath), true);
    assert.equal(existsSync(summaryPath), true);
    assert.equal(hash(coverPath), hash(summaryPath));
    const dimensions = pngDimensions(coverPath);
    assert.equal(dimensions.width >= 1500, true);
    assert.equal(dimensions.height >= 900, true);
    assert.equal(dimensions.width / dimensions.height > 1.55 && dimensions.width / dimensions.height < 1.65, true);
    masterHashes.add(hash(coverPath));

    assert.match(article.summaryAudio, /^\/audio\/research\/.+\.m4a$/);
    assert.equal(article.summaryAudio.includes(article.id), true);
    const audioPath = publicPath(article.summaryAudio);
    assert.equal(existsSync(audioPath), true);
    assert.equal(statSync(audioPath).size > 100_000, true);
    const audio = readFileSync(audioPath);
    assert.equal(audio.subarray(4, 8).toString("ascii"), "ftyp");
    assert.equal(audio.includes(Buffer.from("mdat")), true);
    audioHashes.add(hash(audioPath));
  }

  assert.equal(masterHashes.size, newsArticles.length);
  assert.equal(audioHashes.size, newsArticles.length);
});

test("all locale interfaces expose complete News copy and an honest English-content note", () => {
  for (const locale of locales) {
    const copy = getNewsCopy(locale);
    assert.equal(Object.values(copy).every((value) => value.trim().length > 0), true);
    assert.match(copy.title, /ENA/);
    assert.equal(copy.englishContentNote.trim().length > 5, true);
  }

  assert.equal(getNewsResultLabel("en", 1), "article");
  assert.equal(getNewsResultLabel("en", 6), "articles");
  assert.equal(getNewsResultLabel("de", 1), "Beitrag");
  assert.equal(getNewsResultLabel("de", 2), "Beiträge");
});

test("topic slugs are stable, unique, and resolve to at least one article", () => {
  const topics = getNewsTopics();
  assert.equal(topics.length >= 20, true);
  assert.equal(new Set(topics.map((topic) => topic.slug)).size, topics.length);
  assert.equal(topics.every((topic) => /^[a-z0-9-]+$/.test(topic.slug) && topic.count > 0), true);
});

test("structured data distinguishes each ENA.HK review from its cited paper", () => {
  const article = newsArticles[0];
  const data = reviewArticleJsonLd({
    headline: article.title,
    description: article.shortSummary,
    sourceAuthors: article.authors,
    datePublished: article.createdAt,
    image: `https://www.ena.hk${article.image}`,
    keywords: article.tags,
    url: `https://www.ena.hk/en/news/${article.slug}`,
    doi: article.doi,
    sourceUrl: article.sourceUrl,
  });

  assert.equal(data["@type"], "NewsArticle");
  assert.equal(data.inLanguage, "en");
  assert.equal(data.author.name, "ENA.HK Editorial Team");
  assert.equal(data.citation, article.sourceUrl);
  assert.equal(data.isBasedOn["@type"], "ScholarlyArticle");
  assert.equal(data.isBasedOn.identifier.value, article.doi);
  assert.deepEqual(data.isBasedOn.author.map((author) => author.name), article.authors);
});
