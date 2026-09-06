import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const projectRoot = process.cwd();
const outputDir = process.env.TASK32_OUTPUT_DIR ?? "/tmp/open-ena-task32-r2-browser";
const require = createRequire(`${projectRoot}/package.json`);
const { build } = require("esbuild");
const { chromium } = require("playwright");

const workspaceFixture = await readFile(`${projectRoot}/tests/open-ena-model-v3-workspace-browser.mjs`, "utf8");
const fixture = workspaceFixture.split("const entry = `")[1].split("createRoot(document.getElementById('root'))")[0];
const entry = fixture + `
data.rows.push(
  {unit:'u6',horizon:'h4',group:'Control','Code 1':2,A:4,B:1},
  {unit:'u7',horizon:'h4',group:'Treatment','Code 1':4,A:1,B:2},
  {unit:'u8',horizon:'h1',group:'Control','Code 1':1,A:2,B:1},
  {unit:'u8',horizon:'h2',group:'Control','Code 1':2,A:1,B:3},
);
const trajectoryDrafts={...drafts,activeFamily:'standard',standard:{...standard,model:'SeparateTrajectory',horizonOrder:{kind:'columns',keys:[{column:'horizon',direction:'ascending',comparator:{type:'text',locale:'en-US',sensitivity:'variant',numeric:false}}]}}};
let root=createRoot(document.getElementById('root'));
window.task32Render=(locale)=>root.render(<OpenEnaWorkspace locale={locale} initialSource={{dataset:data,datasetSha256:'a'.repeat(64),drafts}} worker={worker}/>);
window.task32MountTrajectory=(locale)=>{root.unmount();root=createRoot(document.getElementById('root'));root.render(<OpenEnaWorkspace locale={locale} initialSource={{dataset:data,datasetSha256:'a'.repeat(64),drafts:trajectoryDrafts}} worker={worker}/>);};
window.task32Render('en');`;

const bundle = await build({
  stdin: { contents: entry, loader: "tsx", resolveDir: projectRoot },
  bundle: true,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  write: false,
  logLevel: "silent",
});
const css = await readFile(`${projectRoot}/app/globals.css`, "utf8");
await mkdir(outputDir, { recursive: true });
const observations = { locales: {}, failures: {}, errors: [], network: [] };

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, reducedMotion: "reduce" });
  page.on("pageerror", (error) => observations.errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") {
      observations.network.push(url.origin);
      return route.abort();
    }
    if (url.pathname === "/ena-mark.svg") return route.fulfill({ contentType: "image/svg+xml", body: await readFile(`${projectRoot}/public/ena-mark.svg`, "utf8") });
    if (url.pathname.startsWith("/data/academy/")) return route.fulfill({ status: 503, contentType: "text/plain; charset=utf-8", body: "unavailable" });
    return route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><meta charset="utf-8"><style>${css}</style><div id="root"></div>` });
  });
  await page.goto("http://localhost:31998/");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.getByRole("button", { name: "Model", exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent === "Run model" && !button.disabled));
  await page.getByRole("button", { name: "Run model", exact: true }).click();
  await page.waitForFunction(() => window.jobs.length === 1);
  await page.evaluate(() => window.resolveRun(0));
  await page.waitForFunction(() => document.querySelector("[data-testid=open-ena-workspace-v3]").dataset.resultStatus === "current");
  await page.locator(".ena-rail-modes button").nth(3).click();
  const inference = page.getByRole("button", { name: "Run confirmed inference", exact: true });
  assert.equal(await inference.isDisabled(), false);
  await inference.click();
  await page.getByRole("button", { name: "Export native statistics", exact: true }).waitFor();

  for (const locale of ["en", "zh-hant", "zh-hans"]) {
    await page.evaluate((nextLocale) => window.task32Render(nextLocale), locale);
    await page.waitForTimeout(100);
    await page.locator(".ena-rail-modes button").nth(3).click();
    const statsText = await page.locator(".ena-model-control-content").innerText();
    await page.getByTestId("open-ena-data-view-toggle").click();
    const dataView = page.getByTestId("open-ena-data-view");
    await dataView.waitFor();
    const dataViewText = await dataView.innerText();
    const dataViewAria = await dataView.locator("[aria-label]").evaluateAll((elements) => elements.map((element) => element.getAttribute("aria-label")));
    const comparisonDataViewText = await page.getByTestId("open-ena-group-data-view").textContent();
    await page.getByTestId("open-ena-data-view").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${outputDir}/${locale}-native-data-view.png` });
    await page.getByTestId("open-ena-data-view-toggle").click();
    await page.locator(".ena-rail-modes button").nth(4).click();
    const aiText = await page.locator(".ena-ai-mode-panel").innerText();
    await page.locator(".ena-ai-mode-panel").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${outputDir}/${locale}-eligible-ai.png` });
    observations.locales[locale] = { statsText, dataViewText, dataViewAria, comparisonDataViewText, aiText };
    if (locale === "zh-hant") {
      assert.match(dataViewText, /資料檢視/u);
      assert.match(dataViewText, /正規化無向邊/u);
      assert.match(dataViewText, /觀測來源資料列索引/u);
      assert.match(statsText, /全域保留來源資料列走訪/u);
      assert.match(comparisonDataViewText, /比較記錄/u);
      assert.match(aiText, /彙總證據/u);
    }
    if (locale === "zh-hans") {
      assert.match(dataViewText, /数据视图/u);
      assert.match(dataViewText, /归一化无向边/u);
      assert.match(dataViewText, /观测来源数据行索引/u);
      assert.match(statsText, /全局保留来源数据行遍历/u);
      assert.match(comparisonDataViewText, /比较记录/u);
      assert.match(aiText, /汇总证据/u);
    }
    if (locale !== "en") {
      assert.doesNotMatch(dataViewText, /Return to Comparison|Show units in|Data View records|Export CSV|Previous page|Next page|Metadata|Global retained source-row/u);
      assert.doesNotMatch(dataViewAria.join(" "), /Return to Comparison|Show units in|Export Data View records|Data View row pages|Data View records/u);
      assert.doesNotMatch(aiText, /The V2 wire is aggregate evidence only/u);
      assert.doesNotMatch(statsText, /Global retained source-row traversal|Trajectory ordinal|Observed Horizons|Observed source row indices/u);
    }
  }

  const renderLocale = async (locale) => {
    await page.evaluate((nextLocale) => window.task32Render(nextLocale), locale);
    await page.waitForTimeout(100);
  };
  const alertText = async () => {
    const alert = page.locator(".ena-model-control-content > [role=alert]");
    await alert.waitFor();
    return alert.innerText();
  };
  await renderLocale("en");
  await page.locator(".ena-rail-modes button").nth(0).click();
  const sourceFile = page.locator('input[type="file"][accept*=".csv"]').first();
  await sourceFile.setInputFiles({ name: "oversize.csv", mimeType: "text/csv", buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 32) });
  observations.failures.oversizeEn = await alertText();
  assert.match(observations.failures.oversizeEn, /5 MB.*5 MiB/u);
  await renderLocale("zh-hans");
  observations.failures.oversizeZhHans = await alertText();
  assert.match(observations.failures.oversizeZhHans, /编码数据.*5 MiB/u);
  await renderLocale("zh-hant");
  observations.failures.oversizeZhHant = await alertText();
  assert.match(observations.failures.oversizeZhHant, /編碼資料.*5 MiB/u);
  await page.screenshot({ path: `${outputDir}/zh-hant-oversize-source.png` });

  await renderLocale("en");
  const artifactFile = page.locator('input[type="file"][accept=".json"]').first();
  await artifactFile.setInputFiles({ name: "oversize-analysis.json", mimeType: "application/json", buffer: Buffer.alloc(16 * 1024 * 1024 + 1, 32) });
  observations.failures.artifact = await alertText();
  assert.match(observations.failures.artifact, /artifact.*16 MiB/u);
  await artifactFile.setInputFiles({ name: "malformed-analysis.json", mimeType: "application/json", buffer: Buffer.from("{}") });
  observations.failures.genericEn = await alertText();
  assert.match(observations.failures.genericEn, /requested operation failed/u);
  await renderLocale("zh-hans");
  observations.failures.genericZhHans = await alertText();
  assert.match(observations.failures.genericZhHans, /请求的操作失败/u);

  await renderLocale("en");
  await page.getByRole("button", { name: "Load sample", exact: true }).click();
  observations.failures.sample = await alertText();
  assert.match(observations.failures.sample, /teaching sample.*unavailable/u);
  await page.locator(".ena-rail-modes button").nth(3).click();
  const presetFile = page.getByText("Review presentation preset", { exact: true }).locator('input[type="file"]');
  await presetFile.setInputFiles({ name: "oversize-preset.json", mimeType: "application/json", buffer: Buffer.alloc(16 * 1024 * 1024 + 1, 32) });
  await page.locator(".ena-rail-modes button").nth(0).click();
  observations.failures.preset = await alertText();
  assert.match(observations.failures.preset, /preset.*16 MiB/u);

  observations.workerJobsAfterFailures = await page.evaluate(() => window.jobs.length);
  observations.resultStatusAfterFailures = await page.getByTestId("open-ena-workspace-v3").getAttribute("data-result-status");
  assert.equal(observations.workerJobsAfterFailures, 1);
  assert.equal(observations.resultStatusAfterFailures, "current");

  await page.locator(".ena-rail-modes button").nth(1).click();
  await page.getByRole("tab", { name: /Codes,/u }).click();
  await page.getByRole("radio", { name: /Ordered Network Analysis/u }).check();
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent === "Run model" && !button.disabled));
  await page.getByRole("button", { name: "Run model", exact: true }).click();
  await page.waitForFunction(() => window.jobs.length === 2);
  await page.evaluate(() => window.resolveRun(1));
  await page.waitForFunction(() => document.querySelector("[data-testid=open-ena-workspace-v3]").dataset.resultStatus === "current");
  assert.equal(await page.locator('.ena-model-control-content > [role="alert"]').count(), 0, "a successful new run clears the previous operation failure");
  observations.ona = {};
  for (const locale of ["en", "zh-hant", "zh-hans"]) {
    await renderLocale(locale);
    await page.locator(".ena-rail-modes button").nth(3).click();
    const statsText = await page.locator(".ena-model-control-content").innerText();
    await page.getByTestId("open-ena-data-view-toggle").click();
    const dataViewText = await page.getByTestId("open-ena-data-view").innerText();
    if (locale === "zh-hans") await page.screenshot({ path: `${outputDir}/zh-hans-ona-data-view.png` });
    await page.getByTestId("open-ena-data-view-toggle").click();
    observations.ona[locale] = { statsText, dataViewText };
    if (locale === "zh-hant") {
      assert.match(statsText, /描述由前項／來源指向回應／目標的有向網絡/u);
      assert.match(dataViewText, /正規化有向邊/u);
    } else if (locale === "zh-hans") {
      assert.match(statsText, /描述由前项／来源指向回应／目标的有向网络/u);
      assert.match(dataViewText, /归一化有向边/u);
    } else {
      assert.match(statsText, /Descriptive directed ground\/source to response\/target networks/u);
      assert.match(dataViewText, /Normalized directed edges/u);
    }
  }

  await page.evaluate(() => window.task32MountTrajectory("en"));
  await page.getByTestId("open-ena-workspace-v3").waitFor();
  await page.locator(".ena-rail-modes button").nth(1).click();
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent === "Run model" && !button.disabled));
  await page.getByRole("button", { name: "Run model", exact: true }).click();
  await page.waitForFunction(() => window.jobs.length === 3);
  await page.evaluate(() => window.resolveRun(2));
  await page.waitForFunction(() => document.querySelector("[data-testid=open-ena-workspace-v3]").dataset.resultStatus === "current");
  observations.trajectory = {};
  for (const [locale, expected] of [["en", /Downstream complete-case availability/u], ["zh-hant", /下游完整案例的可用性不決定核心軌跡/u], ["zh-hans", /下游完整案例的可用性不决定核心轨迹/u]]) {
    await renderLocale(locale);
    const centerText = await page.getByTestId("open-ena-center-surface").innerText();
    observations.trajectory[locale] = centerText;
    assert.match(centerText, expected);
    if (locale === "zh-hant") await page.screenshot({ path: `${outputDir}/zh-hant-trajectory.png` });
  }
  observations.workerJobs = await page.evaluate(() => window.jobs.length);
  observations.resultStatus = await page.getByTestId("open-ena-workspace-v3").getAttribute("data-result-status");
  assert.equal(observations.workerJobs, 3);
  assert.equal(observations.resultStatus, "current");
  assert.deepEqual(observations.errors, []);
  assert.deepEqual(observations.network, []);
  await writeFile(`${outputDir}/results.json`, `${JSON.stringify(observations, null, 2)}\n`);
  console.log(`Task32 R2 Workspace i18n browser: ${Object.keys(observations.locales).length} locales, ${Object.keys(observations.failures).length} failure states, Standard/ONA/trajectory consumers, ${observations.workerJobs} exact Worker jobs.`);
} finally {
  await browser.close();
}
