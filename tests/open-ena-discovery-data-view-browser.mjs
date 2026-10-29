// Built-page checks for Chinese search, readable Data View and primary-domain metadata.
// Run after npm run build: npm run test:browser:discovery-data-view
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { startPluginLabFixture } from "./support/plugin-lab-fixture.mjs";
import { createOpenEnaSessionTokenV2, OPEN_ENA_SESSION_COOKIE } from "../lib/open-ena-auth.ts";
import { locales } from "../lib/i18n.ts";
import { academyLessons } from "../lib/academy-data.ts";
import { newsArticles } from "../lib/news-data.ts";
import { OPEN_ENA_PLUGIN_CATALOG } from "../lib/open-ena/plugins/catalog.ts";
import { parseCsv } from "../lib/open-ena/csv.ts";

const directory = resolve("output/playwright/discovery-data-view");
mkdirSync(directory, { recursive: true });
const report = { status: "running", checks: [], syntheticOnly: true };
const primaryOrigin = "https://www.open-ena.com";
let fixture, browser;
const contexts = [];
async function check(name, action) {
  try { await action(); report.checks.push({ name, status: "pass" }); console.log(`PASS ${name}`); }
  catch (error) { process.exitCode = 1; report.checks.push({ name, status: "fail", message: error.message }); console.log(`FAIL ${name}: ${error.message}`); }
}
async function newPage(path, authenticated = false) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  contexts.push(context);
  await context.route("**/*", route => new URL(route.request().url()).origin === fixture.origin ? route.continue() : route.abort());
  if (authenticated) await context.addCookies([{ name: OPEN_ENA_SESSION_COOKIE, value: createOpenEnaSessionTokenV2(Date.now(), fixture.environment), url: fixture.origin, httpOnly: true, secure: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  await page.goto(`${fixture.origin}${path}`);
  return page;
}
function metadataTags(html) {
  return [...html.matchAll(/<(?:link|meta)\b[^>]*>/gu)].map(([tag]) => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/gu)].map(([, name, value]) => [name, value])));
}
try {
  fixture = await startPluginLabFixture({ evidenceDirectory: directory });
  browser = await chromium.launch({ headless: true });
  await check("Chinese Academy search returns relevant lessons and retains filters through pagination", async () => {
    const page = await newPage("/zh-hans/academy");
    await page.getByRole("searchbox").fill("建模");
    await page.getByRole("button", { name: "搜索", exact: true }).click();
    await page.waitForURL(url => url.searchParams.get("q") === "建模");
    assert.match(await page.locator(".news-result-heading").innerText(), /9\s*节课/u);
    await page.getByRole("navigation", { name: "页", exact: true }).getByRole("link", { name: "2", exact: true }).click();
    await page.waitForURL(url => url.searchParams.get("page") === "2");
    assert.equal(new URL(page.url()).searchParams.get("q"), "建模");
    assert.equal(await page.locator(".academy-card-list > *").count(), 3);
    await page.screenshot({ path: join(directory, "chinese-search.png"), fullPage: false });
    await page.goto(`${fixture.origin}/zh-hant/academy?q=${encodeURIComponent("編碼信度")}`);
    assert.equal(await page.locator('a[href="/zh-hant/academy/audit-coding-reliability-and-consensus"]').count() > 0, true);
    await page.goto(`${fixture.origin}/zh-hans/academy?q=${encodeURIComponent("纵向轨迹")}`);
    assert.equal(await page.locator('a[href="/zh-hans/academy/build-longitudinal-ena-trajectories"]').count() > 0, true);
  });
  await check("rendered public pages, discovery files and social images use the primary domain and Open ENA brand", async () => {
    const paths = [...locales.map(locale => `/${locale}`), ...["en", "zh-hans", "zh-hant"].flatMap(locale =>
      ["mission", "academy", "news", "plugins", "about", "open-ena"].map(path => `/${locale}/${path}`)),
      `/en/academy/${academyLessons[0].slug}`, `/en/news/${newsArticles[0].slug}`, `/en/plugins/${OPEN_ENA_PLUGIN_CATALOG[0].slug}`];
    const results = [];
    for (const path of paths) {
      const response = await fetch(`${fixture.origin}${path}`);
      assert.equal(response.status, 200, path);
      const tags = metadataTags(await response.text());
      const content = property => tags.find(tag => tag.property === property || tag.name === property)?.content;
      const canonical = tags.find(tag => tag.rel === "canonical")?.href;
      assert.equal(canonical, `${primaryOrigin}${path}`, path);
      assert.equal(content("og:url"), `${primaryOrigin}${path}`, path);
      assert.equal(content("og:site_name"), "Open ENA", path);
      assert.equal(content("application-name"), "Open ENA", path);
      assert.ok(content("twitter:title"), path);
      assert.doesNotMatch(content("twitter:title"), /ENA\.HK/u, path);
      assert.ok(content("og:image")?.startsWith(`${primaryOrigin}/`), `${path}: absolute primary-domain social image`);
      results.push({ path, canonical, socialTitle: content("twitter:title") });
    }
    const robots = await (await fetch(`${fixture.origin}/robots.txt`)).text();
    assert.ok(robots.includes(`Sitemap: ${primaryOrigin}/sitemap.xml`));
    assert.doesNotMatch(robots, /www\.ena\.hk/u);
    const sitemap = await (await fetch(`${fixture.origin}/sitemap.xml`)).text();
    assert.ok(sitemap.includes(`<loc>${primaryOrigin}/en</loc>`));
    assert.doesNotMatch(sitemap, /www\.ena\.hk/u);
    const manifest = await (await fetch(`${fixture.origin}/manifest.webmanifest`)).json();
    assert.equal(manifest.short_name, "Open ENA");
    const card = await fetch(`${fixture.origin}/opengraph-image`);
    assert.equal(card.status, 200);
    assert.match(card.headers.get("content-type"), /image\/png/u);
    writeFileSync(join(directory, "social-card.png"), Buffer.from(await card.arrayBuffer()));
    writeFileSync(join(directory, "metadata.json"), JSON.stringify(results, null, 2));
  });
  await check("native Data View shows readable typed Horizons and rounded measures while CSV preserves exact values", async () => {
    const page = await newPage("/en/open-ena", true);
    page.on("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Load trajectory sample", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="open-ena-workspace-v3"]')?.getAttribute("data-result-status") === "current");
    await page.getByTestId("open-ena-workspace-language").selectOption("zh-hans");
    await page.getByTestId("open-ena-data-view-toggle").click();
    const table = page.getByTestId("open-ena-data-view").locator("table");
    const headers = await table.locator("thead tr").last().locator("th").allTextContents();
    const cells = table.locator("tbody tr").first().locator("th, td");
    const horizon = cells.nth(headers.indexOf("观测视域")), coordinate = cells.nth(headers.indexOf("SVD1"));
    assert.equal(await horizon.innerText(), 'Period="TP1"');
    const exactHorizon = await horizon.getAttribute("title"), exactCoordinate = await coordinate.getAttribute("title");
    assert.equal(JSON.parse(exactHorizon)[0][0].value.value, "TP1");
    assert.ok(exactCoordinate.length > 8);
    assert.equal(await coordinate.innerText(), Number(Number(exactCoordinate).toPrecision(6)).toString());
    await page.screenshot({ path: join(directory, "readable-data-view.png"), fullPage: false });
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "将数据视图记录导出为 CSV", exact: true }).click();
    const file = await download;
    assert.equal(await file.failure(), null);
    const path = join(directory, "bound-data-view.csv");
    await file.saveAs(path);
    const csv = parseCsv(readFileSync(path, "utf8"), { name: "bound-data-view.csv", source: "upload" });
    assert.equal(csv.rows[0].SVD1, exactCoordinate);
    assert.equal(csv.rows[0]["Observed Horizons"], exactHorizon);
  });
} catch (error) {
  process.exitCode = 1;
  report.checks.push({ name: "browser runtime", status: "fail", message: error.message });
} finally {
  for (const cleanup of [...contexts.map(context => () => context.close()), () => browser?.close(), () => fixture?.cleanup()]) {
    try { await cleanup(); }
    catch (error) { process.exitCode = 1; report.checks.push({ name: "cleanup", status: "fail", message: error.message }); }
  }
  report.status = process.exitCode ? "fail" : "pass";
  writeFileSync(join(directory, "report.json"), JSON.stringify(report, null, 2));
}
