import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { academyLessons, newsItems } from "../lib/content";
import { getDictionary, localeMeta, locales } from "../lib/i18n";
import { buildLocalePath } from "../lib/locale-path";
import { siteConfig } from "../lib/site";

const projectRoot = process.cwd();
const publicRoutes = ["", "mission", "news", "academy", "about"];

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

test("sitemap publishes indexes but no future detail routes", () => {
  const sitemapSource = readFileSync(join(projectRoot, "app", "sitemap.ts"), "utf8");
  assert.match(sitemapSource, /mission/);
  assert.match(sitemapSource, /news/);
  assert.match(sitemapSource, /academy/);
  assert.match(sitemapSource, /about/);
  assert.doesNotMatch(sitemapSource, /\[slug\]|topic/);
});
