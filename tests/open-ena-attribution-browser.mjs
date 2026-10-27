import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

// Component acceptance harness: real site/workspace components and CSS, local Next
// adapters, and the real Standard ENA compute/binding functions. This does not
// claim to verify a deployed Next server, authentication, or the production analysis Worker. The unmodified 2D display Worker may run locally.
const projectRoot = process.cwd();
const liveBaseline = "12cf50e69a9bb5d3d98d2dab8cc03bab21a0c665";
const homeSourcePath = "components/home-source/UnifiedHome.tsx";
const baselineHome = execFileSync("git", ["show", `${liveBaseline}:${homeSourcePath}`], { cwd: projectRoot, encoding: "utf8" });
const currentHome = await readFile(resolve(projectRoot, homeSourcePath), "utf8");
const heroPattern = /<section className="open-hero"[\s\S]*?<\/section>/u;
const originalHero = baselineHome.match(heroPattern)?.[0];
assert.ok(originalHero, "live baseline hero is present");
assert.equal(currentHome.match(heroPattern)?.[0], originalHero, "existing live hero markup remains byte-for-byte unchanged");
const outputDir = resolve(process.env.ENA_ATTRIBUTION_BROWSER_OUTPUT ?? "output/live-attribution-20261027/browser");
const require = createRequire(`${projectRoot}/package.json`);
const { build } = require("esbuild");
// Playwright is a local acceptance-test tool, not a product dependency.
const playwrightRequire = process.env.ENA_ATTRIBUTION_PLAYWRIGHT_PACKAGE_JSON
  ? createRequire(resolve(process.env.ENA_ATTRIBUTION_PLAYWRIGHT_PACKAGE_JSON))
  : (() => { try { require.resolve("playwright"); return require; }
      catch { return createRequire(`${projectRoot}/packages/jena-js/package.json`); } })();
const { chromium } = playwrightRequire("playwright");
const origin = "http://localhost:32188";
const locales = ["en", "zh-hant", "zh-hans", "es", "fr", "pt", "de", "ar", "ko", "ja", "hi", "ru", "id", "bn"];
const responsiveLocales = ["en", "zh-hant", "zh-hans", "ar", "de", "hi", "bn"];
const entry = `
import React from "react";
import { createRoot } from "react-dom/client";
import LocaleLayout from "./app/[locale]/layout";
import HomePage from "./app/[locale]/page";
import AboutPage from "./app/[locale]/about/page";
import OpenEnaWorkspace from "./components/open-ena/OpenEnaWorkspace";
import { getLocaleMeta } from "./lib/i18n";
import { getOpenEnaAttributionCopy } from "./lib/open-ena-attribution";
import { runStandardPlanV3 } from "./lib/open-ena/analyze";
import { bindResultV3 } from "./lib/open-ena/model-v3/result-binding";
import { compileStandardDraftV3 } from "./lib/open-ena/model-v3/compiler";
import { migrateCanonicalConfigurationToDraftV3 } from "./lib/open-ena/model-v3/migration";
import { parsedDatasetFromSourceProofV3 } from "./lib/open-ena/model-v3/execution-plan";
const [locale, surface = "home"] = location.pathname.split("/").filter(Boolean);
const copy = getOpenEnaAttributionCopy(locale);
window.__attributionExpected = { copy, meta: getLocaleMeta(locale) };
const values = [[1,2,1,0],[2,1,3,1],[1,3,1,2],[3,1,2,1],[1,1,4,2],[2,4,1,3],[4,2,3,1],[3,2,1,4]];
const codes = ["A", "B", "C", "D"];
const dataset = { name: "attribution-synthetic.csv", source: "upload", sizeBytes: 1024,
 headers: ["unit", "horizon", "group", ...codes], rows: values.map((value, index) => ({
 unit: "synthetic-" + index, horizon: "h" + Math.floor(index / 2), group: index % 2 ? "Treatment" : "Control",
 ...Object.fromEntries(codes.map((code, i) => [code, value[i]])) })) };
const order = { kind: "columns", keys: [{ column: "unit", direction: "ascending", comparator: { type: "text", locale: "en-US", sensitivity: "variant", numeric: false } }] };
const standard = { unitColumns: ["unit"], horizonColumns: ["horizon"], groupColumn: "group", codes,
 weighting: "frequency", model: "EndPoint", windowType: "MovingStanzaWindow",
 movingStanza: { backward: { kind: "finite", value: 1 }, forward: { kind: "finite", value: 0 }, rowOrder: order },
 horizonOrder: null, rotation: { type: "svd", centerAlignToOrigin: true } };
const drafts = { schemaVersion: 3, activeFamily: "standard", standard,
 ona: { unitColumns: ["unit"], horizonColumns: ["horizon"], groupColumn: "group", codes,
 backward: { kind: "finite", value: 1 }, rowOrder: order,
 directionalMask: { schemaVersion: 1, codeOrder: codes, enabled: codes.map((_, i) => codes.map((_, j) => i !== j)) } } };
window.__attributionJobs = [];
const worker = async (plan) => {
 const compiled = await compileStandardDraftV3(parsedDatasetFromSourceProofV3(plan.sourceProof), plan.header.datasetSha256,
 migrateCanonicalConfigurationToDraftV3(plan.configuration).standard);
 const result = await bindResultV3(plan, runStandardPlanV3(plan), {
 processedRows: plan.rows.length, maximumBufferedRows: 0, numericCellsAllocated: 120,
 peakBytesObservedOrBounded: 10240, observationMethod: "exact-counters-and-conservative-byte-bound" }, compiled.diagnostics);
 window.__attributionJobs.push({ plan, result });
 return { result, sourceWitness: null };
};
(async () => {
 const params = Promise.resolve({ locale });
 const page = surface === "home" ? await HomePage({ params })
 : surface === "about" ? await AboutPage({ params })
 : <OpenEnaWorkspace locale={locale} worker={worker}
 initialSource={new URLSearchParams(location.search).has("fixture") ? { dataset, datasetSha256: "a".repeat(64), drafts } : undefined} />;
 const shell = await LocaleLayout({ children: page, params });
 createRoot(document.getElementById("root")).render(shell);
})().catch(error => { window.__attributionMountError = String(error.stack || error); });
`;
const bundle = await build({
  stdin: { contents: entry, loader: "tsx", resolveDir: projectRoot, sourcefile: "attribution-acceptance.tsx" },
  bundle: true, format: "iife", platform: "browser", jsx: "automatic", write: false,
  outdir: "attribution-harness", logLevel: "silent",
  define: { "process.env.NODE_ENV": '"development"' },
  banner: { js: "var process = { env: { NODE_ENV: 'development' } };" },
  plugins: [{ name: "next-browser-adapters", setup(builder) {
    const stubs = {
      "next/navigation": `${projectRoot}/tests/helpers/a11y-next-navigation-stub.js`,
      "next/link": `${projectRoot}/tests/helpers/a11y-next-link-stub.tsx`,
      "next/font/google": `${projectRoot}/tests/helpers/a11y-next-font-stub.js`,
    };
    builder.onResolve({ filter: /^next\/(navigation|link|font\/google)$/ }, args => ({ path: stubs[args.path] }));
    builder.onResolve({ filter: /^next\/image$/ }, () => ({ path: "image", namespace: "attribution-image" }));
    builder.onLoad({ filter: /.*/, namespace: "attribution-image" }, () => ({ loader: "tsx", resolveDir: projectRoot, contents: `
import React from "react";
import Image from "${projectRoot}/tests/helpers/a11y-next-image-stub.tsx";
export default function LocalImage({fill,style,...props}) {
 return <Image {...props} fill={fill} style={fill ? {position:"absolute",inset:0,width:"100%",height:"100%",...style} : style}/>;
}` }));
  } }],
});
const script = bundle.outputFiles.find(file => file.path.endsWith(".js")).text;
const css = await readFile(`${projectRoot}/app/globals.css`, "utf8") + "\n" + bundle.outputFiles.filter(file => file.path.endsWith(".css")).map(file => file.text).join("\n");
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/harness.css"><script defer src="/harness.js"></script></head><body><div id="root"></div></body></html>';
const mime = { ".js": "application/javascript", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".csv": "text/csv", ".json": "application/json" };
const report = { baseline: liveBaseline, exactHeroSourceMatch: true, harness: "real React components; local Next adapters; actual Standard ENA compute and binding in an injected worker", surfaces: [], chromeChecks: [], workflow: {}, screenshots: [], errors: [], externalRequests: [] };
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
context.on("page", page => {
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(15_000);
  page.on("pageerror", error => report.errors.push(error.message));
  page.on("console", message => { if (message.type() === "error" && !/Failed to load resource|net::ERR_|WebGL|GL Driver|GPU stall/u.test(message.text())) report.errors.push(message.text()); });
});
await context.route("**/*", async route => {
  const url = new URL(route.request().url());
  if (url.origin !== origin) { report.externalRequests.push(url.origin); return route.abort(); }
  if (url.pathname === "/harness.js") return route.fulfill({ contentType: "application/javascript", body: script });
  if (url.pathname === "/harness.css") return route.fulfill({ contentType: "text/css", body: css });
  if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  if (extname(url.pathname)) {
    const path = resolve(projectRoot, "public", "." + decodeURIComponent(url.pathname));
    if (path.startsWith(resolve(projectRoot, "public") + sep)) {
      try { return await route.fulfill({ contentType: mime[extname(path)] ?? "application/octet-stream", body: await readFile(path) }); } catch { /* Missing fixture assets are reported by browser checks. */ }
    }
    return route.fulfill({ status: 404, body: "Not found" });
  }
  return route.fulfill({ contentType: "text/html", body: html });
});
const page = await context.newPage();
async function mount(locale, surface, width, fixture = false) {
  await page.setViewportSize({ width, height: 1000 });
  const path = surface === "home" ? `/${locale}` : `/${locale}/${surface === "workspace" ? "open-ena" : surface}`;
  await page.goto(origin + path + (fixture ? "?fixture=1" : ""));
  await page.waitForFunction(() => document.querySelector("[data-open-ena-attribution]") || window.__attributionMountError);
  assert.equal(await page.evaluate(() => window.__attributionMountError), undefined, `${locale}/${surface} mount`);
}
async function screenshot(name, fullPage = true) {
  await page.screenshot({ path: resolve(outputDir, name), fullPage });
  report.screenshots.push(name);
}
async function checkLiveChrome(locale, surface, width) {
  const routes = ["", "/mission", "/open-ena", "/plugins", "/news", "/academy", "/about"].map(route => `/${locale}${route}`);
  const header = page.locator("header.site-header");
  assert.equal(await header.count(), 1, `${locale}/${surface}: exactly one shared header`);
  assert.deepEqual(await header.locator(".desktop-nav > a").evaluateAll(links => links.map(link => link.getAttribute("href"))), routes);
  assert.deepEqual(await header.locator(".mobile-nav > a.mobile-nav-link").evaluateAll(links => links.map(link => link.getAttribute("href"))), routes);
  assert.equal(await header.locator(".desktop-language .language-switcher").count(), 1);
  assert.equal(await header.locator(".desktop-language .language-option").count(), 14);
  for (const scope of [header, page.locator("footer")]) {
    assert.equal(await scope.count(), 1);
    const logo = scope.locator("img.brand-wordmark");
    assert.equal(await logo.count(), 1, `${locale}/${surface}: current shared logo`);
    assert.equal(await logo.getAttribute("src"), "/unified-home/logo-open-ena.svg");
    assert.equal(await logo.getAttribute("alt"), "Open ENA — Epistemic Network Analysis");
    assert.equal(await scope.locator(".brand-lockup").getAttribute("href"), `/${locale}`);
  }
  const footer = page.locator("footer");
  assert.deepEqual(await footer.locator(".footer-navigation-links > a").evaluateAll(links => links.map(link => link.getAttribute("href"))), routes);
  assert.equal(await header.isVisible(), surface !== "workspace");
  if (surface !== "workspace") {
    const mobileToggle = header.locator(".menu-button");
    if (await mobileToggle.isVisible()) {
      await mobileToggle.click();
      assert.equal(await header.locator("#mobile-navigation").isVisible(), true);
      const language = header.locator(".mobile-locales .language-button");
      await language.click();
      assert.equal(await header.locator(".mobile-locales .language-option:visible").count(), 14);
      await page.keyboard.press("Escape");
      await mobileToggle.click();
      assert.equal(await header.locator("#mobile-navigation").isVisible(), false);
    } else {
      await header.locator(".desktop-language .language-button").click();
      assert.equal(await header.locator(".desktop-language .language-option:visible").count(), 14);
      await page.keyboard.press("Escape");
    }
  } else {
    assert.equal(await page.locator("[data-ena-site-trigger]").count(), 1);
    const links = page.locator("[data-ena-site-navigation] a");
    assert.deepEqual(await links.evaluateAll(items => items.map(item => item.getAttribute("href"))), routes.filter(route => !route.endsWith("/open-ena")));
    assert.ok((await links.evaluateAll(items => items.map(item => item.getAttribute("target")))).every(target => target === "_blank"));
  }
  if (surface === "home") {
    assert.equal(await page.locator(".open-ena-preview, .open-hero-facts, .workspace-section, .site-header-inner").count(), 0, "no legacy home UI restored");
    assert.equal(await page.locator(".open-hero-actions .button-primary").getAttribute("href"), `/${locale}/open-ena`);
    assert.equal(await page.locator(".open-hero-actions .button-primary").textContent(), "Open ENA");
    assert.equal(await page.locator(".open-hero-actions .button-secondary").getAttribute("href"), `/${locale}/about`);
  }
  report.chromeChecks.push({ locale, surface, width, currentHeader: true, sevenNavigationLinks: true, languageMenu: true, currentLogos: true });
}

async function checkAttributions(locale, surface, width) {
  await checkLiveChrome(locale, surface, width);
  const expected = await page.evaluate(() => window.__attributionExpected);
  const attr = page.locator("[data-open-ena-attribution]");
  const count = await attr.count();
  assert.equal(count, surface === "home" || surface === "workspace" ? 2 : 1, `${locale}/${surface}: attribution copies`);
  for (const block of await attr.all()) {
    assert.equal(await block.getAttribute("lang"), expected.meta.htmlLang);
    assert.equal(await block.getAttribute("dir"), expected.meta.dir);
    assert.ok((await block.textContent()).includes(expected.copy.shortCredit));
    const variant = await block.getAttribute("data-open-ena-attribution");
    if (variant === "footer") {
      assert.ok(!(await block.textContent()).includes(expected.copy.purpose), "footer omits the purpose statement at the owner's request");
      assert.equal(await block.locator("p").count(), 1, "footer keeps only the credit paragraph");
    } else {
      assert.ok((await block.textContent()).includes(variant === "workspace" ? expected.copy.shortPurpose : expected.copy.purpose));
    }
    const link = block.locator("a");
    assert.equal(await link.getAttribute("href"), `/${locale}/about#acknowledgements`);
    assert.equal(await block.isVisible(), !(surface === "workspace" && variant === "footer"), `${locale}/${surface}: ${variant} visibility follows existing workspace chrome`);
  }
  assert.equal(await page.getByRole("main").count(), 1);
  assert.equal(await page.getByRole("contentinfo").count(), surface === "workspace" ? 0 : 1);
  if (surface === "about") {
    const about = page.locator("[data-open-ena-about]");
    assert.deepEqual(await about.locator(":scope > section").evaluateAll(sections => sections.map(section => section.getAttribute("aria-labelledby"))), [
      "about-title", "team-title", "publications-title", "acknowledgements-title", "theory-title", "design-origin-title", "foundation-references-title",
    ], "team and project publications immediately follow the About introduction");
    assert.equal(await about.getAttribute("lang"), expected.meta.htmlLang);
    assert.equal(await about.getAttribute("dir"), expected.meta.dir);
    for (const key of ["purpose", "acknowledgements", "theoryQe", "theoryEna", "theoryUse", "designOrigin", "designTheory", "independence"]) assert.ok((await about.textContent()).includes(expected.copy[key]), `${locale}: ${key}`);
    const expectedPeople = ["Dr. Peter HU Dongpin", "Ludwig Jianxing Yu", "Prof. Sandy TU Yun-Fang", "Ms. Shirleen XU Qiaolin"];
    assert.equal(await page.locator("section[aria-labelledby=team-title] article").count(), 4);
    assert.deepEqual(await page.locator("section[aria-labelledby=team-title] article h3").allTextContents(), expectedPeople);
    assert.equal(await page.getByRole("img", { name: "Portrait of Ludwig Jianxing Yu", exact: true }).count(), 1);
    assert.equal(await page.getByRole("img", { name: /Eric Hamilton/u }).count(), 0);
    assert.ok((await page.locator("section[aria-labelledby=publications-title]").textContent()).includes("Hamilton, E."));
    const graph = JSON.parse(await about.locator('script[type="application/ld+json"]').textContent())["@graph"];
    assert.deepEqual(graph.filter(node => node["@type"] === "Person").map(node => node.name), expectedPeople);
    assert.ok(!graph.filter(node => node["@type"] === "Person").some(node => /Eric/u.test(node.name)));
    for (const reference of ["foundation-shaffer-2017", "foundation-shaffer-et-al-2016", "foundation-shaffer-ruis-2017", "foundation-tan-et-al-2022"]) {
      assert.equal(await page.locator(`#${reference}`).count(), 1);
      assert.equal(await page.locator(`a[href="#${reference}"]`).count(), 1);
    }
    await page.waitForFunction(() => [...document.querySelectorAll("[data-open-ena-about] img")].every(img => img.complete && img.naturalWidth > 0));
  }
  if (surface === "workspace") {
    const geometry = await page.locator('[data-open-ena-attribution="workspace"]').evaluate(block => {
      const toolbar = block.previousElementSibling;
      const result = block.nextElementSibling;
      const rect = block.getBoundingClientRect();
      return { toolbarClass: toolbar.className, top: rect.top, bottom: rect.bottom, toolbarBottom: toolbar.getBoundingClientRect().bottom, resultTop: result.getBoundingClientRect().top, position: getComputedStyle(block).position, flex: getComputedStyle(block).flexShrink };
    });
    assert.ok(geometry.toolbarClass.includes("ena-visual-toolbar"));
    assert.ok(geometry.top >= geometry.toolbarBottom - 1 && geometry.bottom <= geometry.resultTop + 1, `${locale}: no attribution overlay`);
    assert.ok(!["absolute", "fixed"].includes(geometry.position));
    assert.equal(geometry.flex, "0");
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `${locale}/${surface}/${width}: horizontal overflow ${overflow}px`);
  report.surfaces.push({ locale, surface, width, overflow });
}
try {
  for (const locale of locales) {
    for (const surface of ["home", "about", "workspace"]) {
      await mount(locale, surface, 1440);
      await checkAttributions(locale, surface, 1440);
      if (surface === "about" && responsiveLocales.includes(locale)) await screenshot(`about-${locale}-1440.png`);
      if (surface === "home" && locale === "en") await screenshot("home-en-1440.png");
    }
    console.log(`Attribution desktop: ${locale} passed`);
  }
  for (const locale of responsiveLocales) {
    for (const width of [320, 390]) {
      for (const surface of ["home", "about", "workspace"]) {
        await mount(locale, surface, width);
        await checkAttributions(locale, surface, width);
        if (width === 390 && (surface === "about" || ["en", "ar"].includes(locale))) await screenshot(`${surface}-${locale}-${width}.png`);
      }
    }
    console.log(`Attribution responsive: ${locale} passed`);
  }
  await mount("en", "workspace", 1440, true);
  await page.getByRole("button", { name: "Model", exact: true }).click();
  await page.waitForFunction(() => { const button = document.querySelector('[data-testid="open-ena-run-model"]'); return button && !button.disabled; });
  await page.getByTestId("open-ena-run-model").click();
  await page.waitForFunction(() => document.querySelector('[data-testid="open-ena-workspace-v3"]').dataset.resultStatus === "current");
  await checkAttributions("en", "workspace", 1440);
  const identity = await page.evaluate(() => JSON.stringify(window.__attributionJobs[0].result.binding));
  await page.waitForFunction(() => !document.querySelector('[data-ena-2d-frame-status="pending"]'));
  const displayFrameFallback = await page.locator('[data-ena-2d-frame-status="unavailable"]').count() > 0;
  await screenshot("workspace-result-2d.png", false);
  await page.getByTestId("open-ena-data-view-toggle").click();
  await page.getByTestId("open-ena-data-view").waitFor();
  await checkAttributions("en", "workspace", 1440);
  const sourceUrl = page.url();
  const popupPromise = context.waitForEvent("page");
  await page.locator('[data-open-ena-attribution="workspace"] a').click();
  const popup = await popupPromise;
  await popup.locator("#acknowledgements").waitFor();
  assert.ok(popup.url().endsWith("/en/about#acknowledgements"));
  assert.equal(page.url(), sourceUrl);
  assert.equal(await page.getByTestId("open-ena-workspace-v3").getAttribute("data-result-status"), "current");
  assert.equal(await page.getByTestId("open-ena-data-view-toggle").getAttribute("aria-pressed"), "true");
  assert.equal(await page.evaluate(() => JSON.stringify(window.__attributionJobs[0].result.binding)), identity);
  await popup.close();
  await screenshot("workspace-data-view.png", false);
  await page.getByTestId("open-ena-data-view-toggle").click();
  const threeD = page.locator(".ena-visual-toolbar").getByRole("button", { name: "3D ENA", exact: true });
  assert.ok(await threeD.isEnabled(), "synthetic fixture provides a third dimension");
  await threeD.click();
  await page.getByTestId("open-ena-3d-group-contrast").waitFor();
  await checkAttributions("en", "workspace", 1440);
  await screenshot("workspace-result-3d.png", false);
  assert.equal(await page.evaluate(() => JSON.stringify(window.__attributionJobs[0].result.binding)), identity);
  report.workflow = { displayFrameFallback, realStandardResult: true, dataView: true, twoD: true, threeDSurface: true, popupPreservesResultAndDataView: true, workerJobs: await page.evaluate(() => window.__attributionJobs.length) };
  assert.equal(report.workflow.workerJobs, 1);
  assert.deepEqual(report.errors, [], "browser script/React errors");
  report.status = "passed";
  console.log(`Attribution acceptance PASS: ${report.surfaces.length} surface/locale/viewport checks; real result, Data View, 2D/3D surface and popup preservation.`);
} catch (error) {
  report.status = "failed";
  report.failure = String(error.stack || error);
  await screenshot("failure.png").catch(() => {});
  throw error;
} finally {
  await writeFile(resolve(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
  await context.close();
  await browser.close();
}
