import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { academyLessons, newsItems } from "../lib/content";
import { getDictionary, localeMeta, locales } from "../lib/i18n";
import { buildLocalePath } from "../lib/locale-path";
import { getOpenEnaNavLabel } from "../lib/open-ena-i18n";
import { siteConfig } from "../lib/site";

const projectRoot = process.cwd();
const publicRoutes = ["", "mission", "open-ena", "news", "academy", "about"];

test("the canonical ENA identity is consistent", () => {
  assert.equal(siteConfig.name, "ENA");
  assert.equal(siteConfig.brandName, "ENA.HK");
  assert.equal(siteConfig.longName, "Epistemic Network Analysis");
  assert.equal(siteConfig.tagline, "Epistemic Network Analysis Hub of Knowledge");
  assert.equal(siteConfig.url, "https://www.ena.hk");
  assert.doesNotMatch(JSON.stringify(siteConfig), /www\.aied\.hk/i);
});

test("the locale set matches the complete AIEDHK language menu", () => {
  assert.deepEqual(locales, [
    "en",
    "zh-hant",
    "zh-hans",
    "es",
    "fr",
    "pt",
    "de",
    "ar",
    "ko",
    "ja",
    "hi",
    "ru",
    "id",
    "bn",
  ]);
  assert.equal(localeMeta.ar.dir, "rtl");
});

test("News and Academy expose continuous reviewed collections that can grow", () => {
  const newsIds = newsItems.map((article) => Number(article.id.replace("ena-", "")));
  const newestNewsId = Math.max(...newsIds);
  assert.equal(newsItems.length, newestNewsId);
  assert.deepEqual(newsIds, Array.from({ length: newestNewsId }, (_, index) => newestNewsId - index));
  assert.equal(Math.abs(
    newsItems.filter((article) => article.type === "journal").length
      - newsItems.filter((article) => article.type === "conference").length,
  ) <= 1, true);

  assert.deepEqual(
    academyLessons.map((lesson) => lesson.id),
    Array.from({ length: academyLessons.length }, (_, index) => `academy-${String(index + 1).padStart(3, "0")}`),
  );
  assert.deepEqual(academyLessons.map((lesson) => lesson.sequence), Array.from({ length: academyLessons.length }, (_, index) => index + 1));
});

test("every locale exposes the six requested navigation destinations", () => {
  for (const locale of locales) {
    const dictionary = getDictionary(locale);
    const labels = [
      dictionary.nav.home,
      dictionary.nav.mission,
      getOpenEnaNavLabel(locale),
      dictionary.nav.news,
      dictionary.nav.academy,
      dictionary.nav.about,
    ];

    assert.equal(labels.length, 6);
    assert.equal(new Set(labels).size, 6);
    assert.ok(labels.every((label) => label.trim().length > 0));
    assert.equal(dictionary.about.focusItems.length, 4);
    assert.deepEqual(dictionary.about.products.map((product) => product.name), ["MAIS", "CAIS", "UAIS"]);
    assert.ok(dictionary.footer.tutorialTitle.trim().length > 0);
  }
});

test("visible brand copy consistently uses ENA.HK capitalization", () => {
  for (const locale of locales) {
    const copy = JSON.stringify(getDictionary(locale));
    assert.doesNotMatch(copy, /ENA\.hk/);
    assert.match(copy, /ENA\.HK/);
  }

  const logoSource = readFileSync(join(projectRoot, "components", "Logo.tsx"), "utf8");
  const lockupSource = readFileSync(join(projectRoot, "public", "ena-logo.svg"), "utf8");
  const metadataSource = readFileSync(join(projectRoot, "lib", "metadata.ts"), "utf8");
  assert.match(logoSource, /siteConfig\.tagline/);
  assert.match(lockupSource, /Epistemic Network Analysis Hub of Knowledge/);
  assert.match(metadataSource, /siteConfig\.brandName/);
  assert.doesNotMatch(metadataSource, /\| ENA`/);
});

test("language switching preserves the page and query string", () => {
  assert.equal(buildLocalePath("/en/about", "ref=audit", "ar"), "/ar/about?ref=audit");
  assert.equal(buildLocalePath("/mission", "", "fr"), "/fr/mission");

  const switcherSource = readFileSync(join(projectRoot, "components", "LanguageSwitcher.tsx"), "utf8");
  const headerSource = readFileSync(join(projectRoot, "components", "Header.tsx"), "utf8");
  assert.match(switcherSource, /useSearchParams/);
  assert.match(switcherSource, /role="listbox"/);
  assert.match(switcherSource, /hrefLang/);
  assert.match(switcherSource, /hidden=\{!open\}/);
  assert.match(headerSource, /LanguageSwitcher/);
  assert.doesNotMatch(headerSource, /locale-links/);
});

test("visible dictionary copy contains no long dash characters", () => {
  for (const locale of locales) {
    const copy = JSON.stringify(getDictionary(locale));
    assert.doesNotMatch(copy, /\u2013|\u2014/);
  }
});

test("the locale route tree includes reviewed News and Academy details", () => {
  for (const route of publicRoutes) {
    const path = route
      ? join(projectRoot, "app", "[locale]", route, "page.tsx")
      : join(projectRoot, "app", "[locale]", "page.tsx");
    assert.equal(existsSync(path), true, `Missing route source: ${path}`);
  }

  assert.equal(existsSync(join(projectRoot, "app", "[locale]", "news", "[slug]", "page.tsx")), true);
  assert.equal(existsSync(join(projectRoot, "app", "[locale]", "news", "topic", "[slug]", "page.tsx")), true);
  assert.equal(existsSync(join(projectRoot, "app", "[locale]", "academy", "[slug]", "page.tsx")), true);
});

test("ENA logo assets use the Yanzi mint palette and remain free of AIEDHK branding", () => {
  for (const filename of ["ena-mark.svg", "ena-logo.svg"]) {
    const path = join(projectRoot, "public", filename);
    assert.equal(existsSync(path), true);
    const svg = readFileSync(path, "utf8");
    assert.match(svg, /<svg/);
    assert.match(svg, /circle/);
    assert.match(svg, /#72c7bd/i);
    assert.doesNotMatch(svg, /#56b09d/i);
    assert.doesNotMatch(svg, /AIEDHK/i);
  }
});

test("the visual system includes the exact Yanzi palette tokens", () => {
  const css = readFileSync(join(projectRoot, "app", "globals.css"), "utf8");
  assert.match(css, /--accent:\s*#72c7bd/i);
  assert.match(css, /--accent-hover:\s*#66bfb5/i);
  assert.match(css, /--accent-soft:\s*#eef9f7/i);
  assert.match(css, /--accent-strong:\s*#39736e/i);
  assert.match(css, /radial-gradient\(circle at 50% 10%/);
  assert.match(css, /\.language-menu\[data-align="right"\][^{]*\{[\s\S]*?inset-inline-end:\s*0/);
  assert.match(css, /\.language-menu\[data-align="left"\][^{]*\{[\s\S]*?inset-inline-start:\s*0/);
});

test("the ENA About page carries the Dr. Peter profile topology", () => {
  const aboutSource = readFileSync(join(projectRoot, "app", "[locale]", "about", "page.tsx"), "utf8");
  assert.match(aboutSource, /Dr\. Peter Hu Dongpin/);
  assert.match(aboutSource, /dr-peter-hu-dongpin\.png/);
  assert.match(aboutSource, /PedaNova/);
  assert.match(aboutSource, /personJsonLd/);
  assert.match(aboutSource, /profileLinks/);
  assert.equal(existsSync(join(projectRoot, "public", "images", "about", "dr-peter-hu-dongpin.png")), true);
});

test("sitemap publishes News and Academy detail routes", () => {
  const sitemapSource = readFileSync(join(projectRoot, "app", "sitemap.ts"), "utf8");
  assert.match(sitemapSource, /mission/);
  assert.match(sitemapSource, /open-ena/);
  assert.match(sitemapSource, /news/);
  assert.match(sitemapSource, /academy/);
  assert.match(sitemapSource, /about/);
  assert.match(sitemapSource, /newsArticles/);
  assert.match(sitemapSource, /getNewsTopics/);
  assert.match(sitemapSource, /academyLessons/);
  assert.match(sitemapSource, /academyRoutes/);
});

test("the root layout mounts Vercel Analytics exactly once for every route", () => {
  const layoutSource = readFileSync(join(projectRoot, "app", "layout.tsx"), "utf8");
  const packageJson = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };

  assert.ok(packageJson.dependencies?.["@vercel/analytics"]);
  assert.match(layoutSource, /import\s+\{\s*Analytics\s*\}\s+from\s+"@vercel\/analytics\/next"/);
  assert.equal((layoutSource.match(/<Analytics\s*\/>/g) ?? []).length, 1);
  assert.match(layoutSource, /<body[^>]*>[\s\S]*?\{children\}[\s\S]*?<Analytics\s*\/>[\s\S]*?<\/body>/);
});
