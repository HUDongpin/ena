import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();

function source(...segments: string[]) {
  return readFileSync(join(projectRoot, ...segments), "utf8");
}

function fontSizesForSelector(css: string, selector: string) {
  const sizes: string[] = [];
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;

  for (const match of css.matchAll(rulePattern)) {
    const selectors = match[1].split(",").map((entry) => entry.trim());
    if (!selectors.includes(selector)) continue;

    const declaration = match[2].match(/(?:^|;)\s*font-size\s*:\s*([^;]+);/);
    if (declaration) sizes.push(declaration[1].trim());
  }

  return sizes;
}

test("the premium public design is mounted only on the requested page families", () => {
  const premiumRoutes = [
    ["app", "[locale]", "page.tsx"],
    ["app", "[locale]", "mission", "page.tsx"],
    ["app", "[locale]", "news", "page.tsx"],
    ["app", "[locale]", "news", "[slug]", "page.tsx"],
    ["app", "[locale]", "news", "topic", "[slug]", "page.tsx"],
    ["app", "[locale]", "academy", "page.tsx"],
    ["app", "[locale]", "academy", "[slug]", "page.tsx"],
  ];

  for (const route of premiumRoutes) {
    assert.match(source(...route), /premium-public-page/, `Premium scope missing from ${route.join("/")}`);
  }

  assert.doesNotMatch(source("app", "[locale]", "about", "page.tsx"), /premium-public-page/);
  assert.doesNotMatch(source("app", "[locale]", "open-ena", "page.tsx"), /premium-public-page/);
  assert.doesNotMatch(source("components", "open-ena", "OpenEnaWorkspace.tsx"), /premium-public-page/);
});

test("the premium layer is isolated in a separately imported stylesheet", () => {
  const layout = source("app", "layout.tsx");
  const cssPath = join(projectRoot, "app", "premium-public.css");

  assert.equal(existsSync(cssPath), true);
  assert.match(layout, /import "\.\/globals\.css";\s*import "\.\/premium-public\.css";/);
  assert.match(source("app", "premium-public.css"), /\.premium-public-page\s*\{/);
});

test("Home and Mission primary titles use only the About responsive font-size scale", () => {
  const globalCss = source("app", "globals.css");
  const premiumCss = source("app", "premium-public.css");
  const aboutScale = "clamp(2.65rem, 5.3vw, 4.7rem)";

  assert.deepEqual(fontSizesForSelector(globalCss, ".about-profile-hero h1"), [aboutScale]);
  assert.deepEqual(fontSizesForSelector(premiumCss, ".premium-home .hero-copy h1"), [aboutScale]);
  assert.deepEqual(fontSizesForSelector(premiumCss, ".premium-mission .page-hero h1"), [aboutScale]);
});

test("the screenshot-selected public sections are absent", () => {
  const home = source("app", "[locale]", "page.tsx");
  const mission = source("app", "[locale]", "mission", "page.tsx");
  const news = source("app", "[locale]", "news", "page.tsx");
  const academy = source("app", "[locale]", "academy", "page.tsx");

  assert.doesNotMatch(
    home,
    /principle-band|principle-grid|dictionary\.home\.principle(?:Title|Text)|questions-section|question-grid|dictionary\.home\.questions(?:Title|Text|\.map)/,
  );
  assert.doesNotMatch(mission, /<NetworkFigure|definition-section|definition-copy|dictionary\.mission\.definition(?:Title|Text)/);
  assert.doesNotMatch(news, /news-selection-panel|selection-network|copy\.selection(?:Eyebrow|Title|Text)/);
  assert.doesNotMatch(academy, /news-selection-panel|selection-network|copy\.pathway(?:Eyebrow|Title|Text)/);
});

test("News and Academy collections omit their hero blocks while preserving filters and results", () => {
  const news = source("app", "[locale]", "news", "page.tsx");
  const academy = source("app", "[locale]", "academy", "page.tsx");
  const css = `${source("app", "globals.css")}\n${source("app", "premium-public.css")}`;

  assert.doesNotMatch(news, /news-hero|news-hero-grid|news-hero-copy|academy-hero/);
  assert.doesNotMatch(academy, /news-hero|news-hero-grid|news-hero-copy|academy-hero/);
  assert.match(news, /<h1 className="sr-only">\{copy\.title\}<\/h1>[\s\S]*?<NewsFilters\b/);
  assert.match(academy, /<h1 className="sr-only">\{copy\.title\}<\/h1>[\s\S]*?<AcademyFilters\b/);
  assert.match(news, /className="news-card-list"[\s\S]*?<NewsCard\b/);
  assert.match(academy, /className="news-card-list academy-card-list"[\s\S]*?<AcademyCard\b/);
  assert.doesNotMatch(css, /\.(?:news-hero|news-hero-grid|news-hero-copy|academy-hero)\b/);
});

test("News and Academy collection cards share one uniform geometry without a featured first item", () => {
  const css = source("app", "premium-public.css");

  assert.doesNotMatch(css, /\.premium-collection-page \.news-card:(?:first|last|nth|only)-child/);
  assert.match(
    css,
    /\.premium-collection-page \.news-card-list\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);[^}]*grid-auto-rows:\s*1fr;/,
  );
  assert.match(
    css,
    /\.premium-collection-page \.news-card\s*\{[^}]*grid-column:\s*auto;[^}]*height:\s*100%;/,
  );
  assert.match(
    css,
    /\.premium-collection-page \.news-card-link\s*\{[^}]*grid-template-columns:\s*1fr;[^}]*height:\s*100%;/,
  );
  assert.match(css, /\.premium-collection-page \.news-card-media\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9;/);
  assert.match(css, /\.premium-collection-page \.news-card-copy\s*\{[^}]*min-height:\s*430px;[^}]*padding:/);
  assert.match(
    css,
    /\.premium-collection-page \.news-card-copy h2\s*\{[^}]*font-size:\s*clamp\(1\.8rem,\s*2\.5vw,\s*2\.6rem\);[^}]*line-height:\s*1\.04;/,
  );
});

test("the premium interaction contract preserves touch, focus, contrast, and reduced motion", () => {
  const css = source("app", "premium-public.css");

  assert.match(css, /--ink:\s*#101d2e/i);
  assert.match(css, /--accent:\s*#89cff0/i);
  assert.match(css, /--accent-strong:\s*#075985/i);
  assert.match(css, /--faint:\s*#5f6f83/i);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /min-width:\s*44px/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /animation-duration:\s*0\.01ms !important/);
  assert.doesNotMatch(css, /\.open-ena-(?:page|workbench|login-page)\s/);
});

test("the project-specific design rationale is durable and rejects the unrelated template match", () => {
  const masterPath = join(projectRoot, "design-system", "ena-public-knowledge", "MASTER.md");
  assert.equal(existsSync(masterPath), true);

  const master = readFileSync(masterPath, "utf8");
  assert.match(master, /premium scientific editorial publication \+ research-tool gateway/i);
  assert.match(master, /App Store landing-page match was explicitly rejected/i);
  assert.match(master, /OPEN ENA and About keep their existing page-level/);
  assert.match(master, /No horizontal page scroll at 320, 375, 390, 414, 768, 1024, or 1440px/);
});
