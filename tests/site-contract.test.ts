import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { academyLessons, newsItems } from "../lib/content";
import { getDictionary, localeMeta, locales, type Locale } from "../lib/i18n";
import { buildLocalePath } from "../lib/locale-path";
import { getOpenEnaNavLabel } from "../lib/open-ena-i18n";
import { siteConfig } from "../lib/site";

const projectRoot = process.cwd();
const publicRoutes = ["", "mission", "open-ena", "news", "academy", "about"];
const expectedLocalizedHomeCopy = {
  en: {
    initiatorCredit: "Dr. Peter Hu Dongpin is the Initiator of the open access ENA Hub of Knowledge.",
    pageScrollProgress: "Page scroll progress",
  },
  "zh-hant": {
    initiatorCredit: "Dr. Peter Hu Dongpin 是開放取用 ENA 知識樞紐的發起人。",
    pageScrollProgress: "頁面捲動進度",
  },
  "zh-hans": {
    initiatorCredit: "Dr. Peter Hu Dongpin 是开放获取 ENA 知识枢纽的发起人。",
    pageScrollProgress: "页面滚动进度",
  },
  es: {
    initiatorCredit: "Dr. Peter Hu Dongpin es el impulsor del Centro de Conocimiento ENA de acceso abierto.",
    pageScrollProgress: "Progreso de desplazamiento de la página",
  },
  fr: {
    initiatorCredit: "Dr. Peter Hu Dongpin est l'initiateur du pôle de connaissances ENA en libre accès.",
    pageScrollProgress: "Progression du défilement de la page",
  },
  pt: {
    initiatorCredit: "O Dr. Peter Hu Dongpin é o iniciador do Centro de Conhecimento ENA de acesso aberto.",
    pageScrollProgress: "Progresso de deslocamento da página",
  },
  de: {
    initiatorCredit: "Dr. Peter Hu Dongpin ist der Initiator des frei zugänglichen ENA-Wissenszentrums.",
    pageScrollProgress: "Scrollfortschritt der Seite",
  },
  ar: {
    initiatorCredit: "Dr. Peter Hu Dongpin هو مبادر مركز ENA المعرفي مفتوح الوصول.",
    pageScrollProgress: "تقدم التمرير في الصفحة",
  },
  ko: {
    initiatorCredit: "Dr. Peter Hu Dongpin은 오픈 액세스 ENA 지식 허브의 발기인입니다.",
    pageScrollProgress: "페이지 스크롤 진행률",
  },
  ja: {
    initiatorCredit: "Dr. Peter Hu Dongpinは、オープンアクセスのENAナレッジハブの発起人です。",
    pageScrollProgress: "ページのスクロール進捗",
  },
  hi: {
    initiatorCredit: "Dr. Peter Hu Dongpin ओपन-एक्सेस ENA ज्ञान केंद्र के प्रवर्तक हैं।",
    pageScrollProgress: "पृष्ठ स्क्रॉल प्रगति",
  },
  ru: {
    initiatorCredit: "Dr. Peter Hu Dongpin является инициатором центра знаний ENA с открытым доступом.",
    pageScrollProgress: "Прогресс прокрутки страницы",
  },
  id: {
    initiatorCredit: "Dr. Peter Hu Dongpin adalah penggagas Pusat Pengetahuan ENA dengan akses terbuka.",
    pageScrollProgress: "Progres gulir halaman",
  },
  bn: {
    initiatorCredit: "Dr. Peter Hu Dongpin উন্মুক্ত প্রবেশাধিকারভিত্তিক ENA জ্ঞানকেন্দ্রের প্রবর্তক।",
    pageScrollProgress: "পৃষ্ঠা স্ক্রলের অগ্রগতি",
  },
} satisfies Record<Locale, {
  initiatorCredit: string;
  pageScrollProgress: string;
}>;

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
  assert.deepEqual(
    [...newsIds].sort((left, right) => right - left),
    Array.from({ length: newestNewsId }, (_, index) => newestNewsId - index),
  );
  assert.deepEqual(
    newsItems.map((article) => `${article.createdAt}:${article.id}`),
    [...newsItems]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)
        || Number(right.id.replace("ena-", "")) - Number(left.id.replace("ena-", "")))
      .map((article) => `${article.createdAt}:${article.id}`),
  );
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

test("Open ENA uses the same neutral navigation treatment as the other destinations", () => {
  const headerSource = readFileSync(join(projectRoot, "components", "Header.tsx"), "utf8");
  const css = readFileSync(join(projectRoot, "app", "globals.css"), "utf8");

  assert.doesNotMatch(headerSource, /featured|nav-link-open-ena|mobile-nav-link-open-ena/);
  assert.doesNotMatch(css, /nav-link-open-ena|mobile-nav-link-open-ena/);
  assert.match(headerSource, /mission[\s\S]*?open-ena[\s\S]*?news/);
});

test("the home page retains the standard ENA figure and source credit while Mission omits the removed definition region", () => {
  const homeSource = readFileSync(join(projectRoot, "app", "[locale]", "page.tsx"), "utf8");
  const missionSource = readFileSync(join(projectRoot, "app", "[locale]", "mission", "page.tsx"), "utf8");
  const figureSource = readFileSync(join(projectRoot, "components", "NetworkFigure.tsx"), "utf8");
  const css = readFileSync(join(projectRoot, "app", "globals.css"), "utf8");

  assert.match(homeSource, /<NetworkFigure/);
  assert.doesNotMatch(
    missionSource,
    /<NetworkFigure|definition-section|definition-copy|dictionary\.mission\.definition(?:Title|Text)/,
  );
  assert.doesNotMatch(missionSource, /definition-(?:visual|node|edge)/);
  assert.doesNotMatch(css, /\.definition-(?:visual|node|edge)/);
  assert.doesNotMatch(figureSource, /plot-key|key-line/);
  assert.match(homeSource, /dictionary\.home\.originCredit/);
  assert.match(
    homeSource,
    /<strong><bdi>Wisconsin Center for Education Research\.<\/bdi><\/strong>\s*\{" "\}\s*<strong><bdi dir=\{localeMeta\[typedLocale\]\.dir\}>\{dictionary\.home\.initiatorCredit\}<\/bdi><\/strong>/u,
  );
  assert.doesNotMatch(homeSource, /typedLocale === "en"/u);
  assert.doesNotMatch(
    homeSource,
    /Dr\. Peter Hu Dongpin is the Initiator of the open access ENA Hub of Knowledge\./u,
  );
  assert.equal(
    getDictionary("en").home.originCredit,
    "ENA was proposed and developed by researchers and developers from",
  );
  for (const locale of locales) {
    const dictionary = getDictionary(locale);
    assert.ok(dictionary.home.originCredit.trim().length > 0);
    assert.ok(dictionary.home.initiatorCredit.trim().length > 0);
    assert.ok(dictionary.common.pageScrollProgress.trim().length > 0);
    assert.match(dictionary.home.initiatorCredit, /Dr\. Peter Hu Dongpin/u);
    assert.match(dictionary.home.initiatorCredit, /ENA/u);
    assert.deepEqual(
      {
        initiatorCredit: dictionary.home.initiatorCredit,
        pageScrollProgress: dictionary.common.pageScrollProgress,
      },
      expectedLocalizedHomeCopy[locale],
    );
    if (locale !== "en") {
      assert.notEqual(dictionary.home.initiatorCredit, expectedLocalizedHomeCopy.en.initiatorCredit);
    }
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

test("ENA logo assets use the Baby Blue palette and remain free of AIEDHK branding", () => {
  for (const filename of ["ena-mark.svg", "ena-logo.svg"]) {
    const path = join(projectRoot, "public", filename);
    assert.equal(existsSync(path), true);
    const svg = readFileSync(path, "utf8");
    assert.match(svg, /<svg/);
    assert.match(svg, /circle/);
    assert.match(svg, /#89cff0/i);
    assert.doesNotMatch(svg, /#72c7bd|#56b09d/i);
    assert.doesNotMatch(svg, /AIEDHK/i);
  }
});

test("the visual system includes the exact ENA Baby Blue palette tokens", () => {
  const css = readFileSync(join(projectRoot, "app", "globals.css"), "utf8");
  assert.match(css, /--accent:\s*#89cff0/i);
  assert.match(css, /--accent-hover:\s*#73c2e8/i);
  assert.match(css, /--accent-soft:\s*#edf8fd/i);
  assert.match(css, /--accent-strong:\s*#1f6f9e/i);
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

test("the root layout exposes opt-in Vercel Analytics through the consent gate", () => {
  const layoutSource = readFileSync(join(projectRoot, "app", "layout.tsx"), "utf8");
  const analyticsSource = readFileSync(join(projectRoot, "components", "AnalyticsConsent.tsx"), "utf8");
  const packageJson = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };

  assert.ok(packageJson.dependencies?.["@vercel/analytics"]);
  assert.match(layoutSource, /AnalyticsConsent/u);
  assert.match(layoutSource, /OPEN_ENA_BROWSER_SMOKE_DISABLE_ANALYTICS/u);
  assert.match(layoutSource, /<body[^>]*>[\s\S]*?\{children\}[\s\S]*?<AnalyticsConsent[^>]*\/>[\s\S]*?<\/body>/u);
  assert.match(analyticsSource, /@vercel\/analytics\/next/u);
  assert.match(analyticsSource, /OPEN_ENA_ANALYTICS_CONSENT_STORAGE_KEY/u);
  assert.match(analyticsSource, /sanitizeOpenEnaAnalyticsUrl/u);
  assert.match(analyticsSource, /isOpenEnaAnalyticsDisabledPath\(window\.location\.pathname\)/u);
  assert.doesNotMatch(analyticsSource, /url:\s*url\.pathname/u);
  assert.match(analyticsSource, /beforeSend/u);
  assert.match(analyticsSource, /return null/u);
});
