import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { academyLessons, newsItems } from "../lib/content";
import { getDictionary, locales } from "../lib/i18n";
import { siteConfig } from "../lib/site";

const projectRoot = process.cwd();
const publicRoutes = ["", "mission", "news", "academy", "about"];

test("the canonical ENA identity is consistent", () => {
  assert.equal(siteConfig.name, "ENA");
  assert.equal(siteConfig.longName, "Epistemic Network Analysis");
  assert.equal(siteConfig.url, "https://www.ena.hk");
  assert.doesNotMatch(JSON.stringify(siteConfig), /www\.aied\.hk/i);
});

test("News and Academy intentionally begin empty", () => {
  assert.equal(newsItems.length, 0);
  assert.equal(academyLessons.length, 0);
});

test("every locale exposes the five requested navigation destinations", () => {
  for (const locale of locales) {
    const dictionary = getDictionary(locale);
    const labels = [
      dictionary.nav.home,
      dictionary.nav.mission,
      dictionary.nav.news,
      dictionary.nav.academy,
      dictionary.nav.about,
    ];

    assert.equal(labels.length, 5);
    assert.equal(new Set(labels).size, 5);
    assert.ok(labels.every((label) => label.trim().length > 0));
  }
});

test("visible dictionary copy contains no long dash characters", () => {
  for (const locale of locales) {
    const copy = JSON.stringify(getDictionary(locale));
    assert.doesNotMatch(copy, /\u2013|\u2014/);
  }
});

test("the locale route tree contains only the initial public page families", () => {
  for (const route of publicRoutes) {
    const path = route
      ? join(projectRoot, "app", "[locale]", route, "page.tsx")
      : join(projectRoot, "app", "[locale]", "page.tsx");
    assert.equal(existsSync(path), true, `Missing route source: ${path}`);
  }

  assert.equal(existsSync(join(projectRoot, "app", "[locale]", "news", "[slug]")), false);
  assert.equal(existsSync(join(projectRoot, "app", "[locale]", "academy", "[slug]")), false);
});

test("the original ENA logo assets are present and free of AIEDHK branding", () => {
  for (const filename of ["ena-mark.svg", "ena-logo.svg"]) {
    const path = join(projectRoot, "public", filename);
    assert.equal(existsSync(path), true);
    const svg = readFileSync(path, "utf8");
    assert.match(svg, /<svg/);
    assert.match(svg, /circle/);
    assert.doesNotMatch(svg, /AIEDHK/i);
  }
});

test("sitemap publishes indexes but no future detail routes", () => {
  const sitemapSource = readFileSync(join(projectRoot, "app", "sitemap.ts"), "utf8");
  assert.match(sitemapSource, /mission/);
  assert.match(sitemapSource, /news/);
  assert.match(sitemapSource, /academy/);
  assert.match(sitemapSource, /about/);
  assert.doesNotMatch(sitemapSource, /\[slug\]|topic/);
});
