import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const productRef = process.env.TASK32_PRODUCT_REF;
const outputDir = process.env.TASK32_OUTPUT_DIR ?? "/tmp/ena-41-task-controller-20260905/task32-r1-screenshots";
await mkdir(outputDir, { recursive: true });
const gitArgs = ["--no-optional-locks", "--git-dir=/Volumes/Starship/ENA/.git/worktrees/standard-ena-model-v3", `--work-tree=${root}`, "-c", `core.worktree=${root}`];
const overlaid = [
  "app/globals.css", "components/open-ena/OpenEnaWorkspace.tsx", "components/open-ena/model-v3/OpenEnaModelTabsV3.tsx",
  "components/open-ena/model-v3/OpenEnaCodesPanelV3.tsx", "components/open-ena/model-v3/OpenEnaUnitsPanelV3.tsx", "lib/open-ena-i18n.ts", "lib/open-ena/source-preparation-v3.ts",
];
function atRef(relativePath) {
  return execFileSync("git", [...gitArgs, "show", `${productRef}:${relativePath}`], { encoding: "utf8" });
}
const fixtureSource = await readFile(`${root}/tests/open-ena-model-v3-workspace-browser.mjs`, "utf8");
const fixture = fixtureSource.split("const entry = `")[1].split("createRoot(document.getElementById('root'))")[0];
const entry = fixture + `const root=createRoot(document.getElementById('root'));window.task32Render=(locale)=>root.render(<OpenEnaWorkspace locale={locale} initialSource={{dataset:data,datasetSha256:'a'.repeat(64),drafts}} worker={worker}/>);window.task32Render('en');`;
const overlay = productRef ? new Map(overlaid.filter((path) => path !== "app/globals.css").map((path) => [`${root}/${path}`, atRef(path)])) : new Map();
const bundle = await build({
  stdin: { contents: entry, loader: "tsx", resolveDir: root, sourcefile: "task32-workspace-i18n-browser.tsx" },
  plugins: [{ name: "task32-product-ref", setup(buildApi) { buildApi.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, (args) => overlay.has(args.path) ? { contents: overlay.get(args.path), loader: args.path.endsWith("x") ? "tsx" : "ts" } : undefined); } }],
  bundle: true, format: "iife", platform: "browser", jsx: "automatic", write: false, logLevel: "silent",
});
const css = productRef ? atRef("app/globals.css") : await readFile(`${root}/app/globals.css`, "utf8");
const browser = await chromium.launch({ headless: true });
const observations = {};
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, reducedMotion: "reduce" });
  page.on("dialog", (dialog) => void dialog.accept());
  await page.route("http://localhost:31997/**", (route) => route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><meta charset="utf-8"><style>${css}</style><div id="root"></div>` }));
  await page.goto("http://localhost:31997/");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.locator(".ena-control-panel").waitFor();
  await page.waitForFunction(() => !document.querySelector("button")?.disabled);
  await page.getByRole("button", { name: "Model", exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent === "Run model" && !button.disabled));
  await page.getByRole("button", { name: "Run model", exact: true }).click();
  await page.waitForFunction(() => window.jobs.length === 1);
  await page.evaluate(() => window.resolveRun(0));
  await page.waitForFunction(() => document.querySelector('[data-testid="open-ena-workspace-v3"]')?.getAttribute("data-result-status") === "current");
  await page.locator('[data-model-tab="codes"]').click();
  await page.getByRole("button", { name: "Hide all code nodes", exact: true }).click();
  async function downloadCurrentAnalysis() {
    await page.locator(".ena-rail-modes button").nth(3).click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("open-ena-export-current-analysis").click(),
    ]);
    const path = await download.path();
    assert.ok(path, "current-analysis download must have a local path");
    return readFile(path, "utf8");
  }
  let scientificJson = null;
  observations.localePreservation = [];
  const reachedCopy = {
    en: { primary: "Primary Plot", secondary: "Secondary Plot", tools: "Plot Tools", preset: "This preset contains per-Code visibility" },
    "zh-hans": { primary: "主图", secondary: "次图", tools: "绘图工具", preset: "此预设包含各代码" },
    "zh-hant": { primary: "主要圖", secondary: "次要圖", tools: "繪圖工具", preset: "此預設包含各代碼" },
  };
  for (const locale of ["en", "zh-hans", "zh-hant"]) {
    await page.evaluate((value) => window.task32Render(value), locale);
    await page.waitForTimeout(50);
    await page.locator(".ena-rail-modes button").nth(1).click();
    await page.locator('[data-model-tab="codes"]').click();
    const hiddenNodeCount = await page.locator('[data-ena-code-node="neutral"]').count();
    const hiddenPressed = await page.locator('.ena-model-codes-v3-toolbar button').first().getAttribute("aria-pressed");
    const plotHeadings = await page.locator(".ena-set-side-plots h3").allInnerTexts();
    const plotToolsTitle = await page.getByTestId("open-ena-persistent-plot-tools").getAttribute("aria-label");
    const modelText = await page.locator(".ena-model-control-content").innerText();
    const expected = reachedCopy[locale];
    const exported = await downloadCurrentAnalysis();
    if (scientificJson === null) scientificJson = exported;
    observations.localePreservation.push({ locale, jobs: await page.evaluate(() => window.jobs.length), current: await page.locator('[data-testid="open-ena-workspace-v3"]').getAttribute("data-result-status"), hiddenPressed, hiddenNodeCount, scientificEqual: scientificJson === exported,
      localizedReachedPlotCopy: plotHeadings.includes(expected.primary) && plotHeadings.includes(expected.secondary) && plotToolsTitle === expected.tools && modelText.includes(expected.preset) });
  }
  await page.locator(".ena-rail-modes button").nth(1).click();
  await page.locator('[data-model-tab="codes"]').click();
  await page.waitForFunction(() => document.querySelector('[data-model-tab="codes"]')?.getAttribute("aria-selected") === "true");
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-model-tab="codes"]'), "::before").backgroundColor === "rgb(137, 207, 240)");
  await page.locator('.ena-model-codes-v3-toolbar button').first().click();
  observations.localeRestored = { jobs: await page.evaluate(() => window.jobs.length), nodeCount: await page.locator('[data-ena-code-node="neutral"]').count(), current: await page.locator('[data-testid="open-ena-workspace-v3"]').getAttribute("data-result-status"), scientificEqual: scientificJson === await downloadCurrentAnalysis() };
  await page.evaluate(() => window.task32Render("zh-hans"));
  await page.waitForTimeout(50);
  await page.locator(".ena-rail-modes button").nth(0).click();
  const fileInput = page.locator('input[type="file"][accept*=".csv"]').first();
  await fileInput.focus();
  await fileInput.setInputFiles({ name: "task32.csv", mimeType: "text/csv", buffer: Buffer.from("unit,horizon,A,B,C\nreview1,h1,1,0,1\nreview2,h2,0,1,1\n") });
  const dialog = page.getByRole("dialog").first();
  await dialog.waitFor();
  await page.waitForFunction(() => { const active = document.activeElement; return active?.getAttribute("role") === "dialog"; });
  observations.sourceInitialFocus = await dialog.evaluate((node) => document.activeElement === node);
  const select = dialog.locator("select").first();
  await select.focus();
  await select.selectOption("number");
  observations.source = {
    text: await dialog.innerText(),
    invalid: await select.getAttribute("aria-invalid"),
    describedBy: await select.getAttribute("aria-describedby"),
    editedSelectRetainedFocus: await select.evaluate((node) => document.activeElement === node),
  };
  await page.keyboard.press("Escape");
  await page.waitForTimeout(50);
  observations.source.afterEscape = await page.getByRole("dialog").count();
  observations.source.focusReturned = await fileInput.evaluate((node) => document.activeElement === node);
  await fileInput.setInputFiles({ name: "task32-cancel.csv", mimeType: "text/csv", buffer: Buffer.from("unit,horizon,A,B,C\nu1,h1,1,0,1\n") });
  await page.getByRole("dialog").waitFor();
  await page.getByRole("dialog").getByRole("button").first().click();
  await page.waitForFunction(() => document.activeElement?.matches('input[type="file"][accept*=".csv"]'));
  observations.source.cancelFocusReturned = await fileInput.evaluate((node) => document.activeElement === node);

  const cappedRows = Array.from({ length: 25 }, (_, index) => `bad-${index},h${index},1,0,${index === 24 ? "maybe" : "true"}`);
  const longColumn = "later_invalid_field_with_a_deliberately_long_identity_that_must_remain_literal_and_reachable";
  await fileInput.setInputFiles({ name: "task32-capped-errors.csv", mimeType: "text/csv", buffer: Buffer.from(`unit,horizon,A,B,${longColumn}\n${cappedRows.join("\n")}\n`) });
  const cappedDialog = page.getByRole("dialog");
  await cappedDialog.waitFor();
  await cappedDialog.locator("select").first().selectOption("number");
  await cappedDialog.locator("select").last().selectOption("boolean");
  const laterSelect = cappedDialog.locator("select").last();
  observations.source.cappedLaterColumn = { invalid: await laterSelect.getAttribute("aria-invalid"), describedBy: await laterSelect.getAttribute("aria-describedby"), alertText: await cappedDialog.getByRole("alert").last().innerText(), literalLongFieldVisible: (await cappedDialog.innerText()).includes(longColumn), dialogOverflowX: await cappedDialog.evaluate((node) => getComputedStyle(node).overflowX) };
  await cappedDialog.getByRole("button").first().click();
  await page.waitForFunction(() => document.activeElement?.matches('input[type="file"][accept*=".csv"]'));

  await fileInput.setInputFiles({ name: "task32-focus-old.csv", mimeType: "text/csv", buffer: Buffer.from("unit,horizon,A,B,C\nu1,h1,1,0,1\n") });
  const oldDialog = page.getByRole("dialog");
  await oldDialog.waitFor();
  await page.evaluate(() => {
    window.task32NativeRaf = window.requestAnimationFrame;
    window.task32RafQueue = [];
    window.requestAnimationFrame = (callback) => { window.task32RafQueue.push(callback); return window.task32RafQueue.length; };
  });
  await oldDialog.getByRole("button").first().click();
  await fileInput.setInputFiles({ name: "task32-focus-new.csv", mimeType: "text/csv", buffer: Buffer.from("unit,horizon,A,B,C\nu2,h2,0,1,1\n") });
  const newDialog = page.getByRole("dialog");
  await newDialog.waitFor();
  observations.source.focusRaceQueued = await page.evaluate(() => window.task32RafQueue.length);
  await page.evaluate(() => {
    const queue = window.task32RafQueue.splice(0);
    queue.forEach((callback) => callback(performance.now()));
    window.requestAnimationFrame = window.task32NativeRaf;
  });
  observations.source.newIntentFocusPreserved = await newDialog.evaluate((node) => node.contains(document.activeElement));
  observations.source.staleFocusAvoided = await fileInput.evaluate((node) => document.activeElement !== node);
  await newDialog.getByRole("button").first().click();
  await page.waitForFunction(() => document.activeElement?.matches('input[type="file"][accept*=".csv"]'));
  await page.locator(".ena-rail-modes button").nth(1).click();
  await page.locator('[data-model-tab="codes"]').click();
  const activeTab = page.locator('[data-model-tab="codes"][aria-selected="true"]');
  await activeTab.waitFor();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-model-tab="codes"]'), "::before").backgroundColor === "rgb(137, 207, 240)");
  const help = page.locator(".ena-model-tab-and-help > button");
  observations.model = await page.evaluate(() => {
    const tab = document.querySelector('[data-model-tab="codes"][aria-selected="true"]');
    const helpButton = document.querySelector(".ena-model-tab-and-help > button");
    const codeRow = document.querySelector(".ena-model-code-row-v3");
    const codeControls = [
      ...document.querySelectorAll(".ena-model-codes-v3-toolbar .ena-official-icon-button"),
      ...(codeRow ? [...codeRow.querySelectorAll(".ena-model-code-drag-handle-v3, .ena-model-code-color-v3, .ena-official-icon-button")] : []),
    ].map((button) => ({ className: button.className, label: button.getAttribute("aria-label") ?? button.textContent.trim(), width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height }));
    const swatch = codeRow?.querySelector(".ena-model-code-color-v3 > span");
    return { tabsClass: document.querySelectorAll(".ena-model-tabs").length, scopeClass: document.querySelectorAll(".ena-model-control-content").length,
      activeBefore: getComputedStyle(tab, "::before").content, activeBeforeTop: getComputedStyle(tab, "::before").top, activeBeforeBackground: getComputedStyle(tab, "::before").backgroundColor,
      activeSelected: tab.getAttribute("aria-selected"), activeAccent: getComputedStyle(tab).getPropertyValue("--ena-accent"), activeMatchesRule: tab.matches('.ena-model-tabs button[aria-selected="true"]'),
      activeInlineStyle: tab.getAttribute("style"),
      activeRule: [...document.styleSheets[0].cssRules].find((rule) => rule.selectorText === '.ena-model-tabs button[aria-selected="true"]::before')?.cssText ?? null,
      tabIndicators: [...document.querySelectorAll(".ena-model-tabs button")].map((button) => ({ tab: button.getAttribute("data-model-tab"), selected: button.getAttribute("aria-selected"), background: getComputedStyle(button, "::before").backgroundColor })),
      helpWidth: helpButton.getBoundingClientRect().width, helpHeight: helpButton.getBoundingClientRect().height, codeControls,
      codeSwatch: swatch ? { width: swatch.getBoundingClientRect().width, height: swatch.getBoundingClientRect().height, background: getComputedStyle(swatch).backgroundColor } : null };
  });
  observations.locales = {};
  for (const locale of ["en", "zh-hans", "zh-hant"]) {
    await page.evaluate((value) => window.task32Render(value), locale);
    await page.waitForTimeout(50);
    await page.locator(".ena-rail-modes button").nth(1).click();
    const localePanels = {};
    for (const tab of ["units", "horizons", "windows", "codes"]) {
      await page.locator(`[data-model-tab="${tab}"]`).click();
      localePanels[tab] = await page.locator(".ena-model-tab-panel").evaluate((node) => ({ clientWidth: node.clientWidth, scrollWidth: node.scrollWidth, overflowX: getComputedStyle(node).overflowX }));
    }
    localePanels.normal = await page.locator('[role="tab"][aria-selected="true"]').evaluate((node) => ({ fontSize: Number.parseFloat(getComputedStyle(node).fontSize), height: node.getBoundingClientRect().height, contentFontSize: Number.parseFloat(getComputedStyle(document.querySelector(".ena-model-tab-panel p")).fontSize) }));
    await page.setViewportSize({ width: 760, height: 1000 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await page.waitForFunction(() => getComputedStyle(document.documentElement).fontSize === "32px");
    await page.waitForFunction(() => Number.parseFloat(getComputedStyle(document.querySelector(".ena-model-tab-panel p")).fontSize) > 25);
    localePanels.zoom200 = await page.locator(".ena-control-panel").evaluate((node) => ({ clientWidth: node.clientWidth, scrollWidth: node.scrollWidth, tabFontSize: Number.parseFloat(getComputedStyle(node.querySelector('[role="tab"][aria-selected="true"]')).fontSize), tabHeight: node.querySelector('[role="tab"][aria-selected="true"]').getBoundingClientRect().height, contentFontSize: Number.parseFloat(getComputedStyle(node.querySelector(".ena-model-tab-panel p")).fontSize), reducedTransition: getComputedStyle(node.querySelector(".ena-model-help-button")).transitionDuration }));
    localePanels.zoomPanels = {};
    for (const tab of ["units", "horizons", "windows", "codes"]) {
      await page.locator(`[data-model-tab="${tab}"]`).click();
      localePanels.zoomPanels[tab] = await page.locator(".ena-model-tab-panel").evaluate((node) => {
        const toolbars = [...node.querySelectorAll(".ena-model-toolbar")];
        const maxScroll = Math.max(0, node.scrollWidth - node.clientWidth);
        node.scrollLeft = maxScroll;
        const reachedRight = Math.abs(node.scrollLeft - maxScroll) <= 1;
        node.scrollLeft = 0;
        return { clientWidth: node.clientWidth, scrollWidth: node.scrollWidth, overflowX: getComputedStyle(node).overflowX, maxScroll, reachedRight,
          toolbarCount: toolbars.length, wrappingToolbarCount: toolbars.filter((toolbar) => getComputedStyle(toolbar).flexWrap === "wrap").length,
          clippedContentCount: [...node.querySelectorAll("*")].filter((item) => !item.matches(".sr-only,input,select,button") && item.scrollWidth > item.clientWidth + 1 && /hidden|clip/.test(getComputedStyle(item).overflowX)).length };
      });
      await page.locator(".ena-model-tab-panel").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${outputDir}/${locale}-${tab}-workspace-200.png`, fullPage: false });
    }
    await page.locator(".ena-rail-modes button").nth(2).click();
    await page.getByTestId("open-ena-persistent-plot-tools").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${outputDir}/${locale}-plot-workspace-200.png`, fullPage: false });
    await page.evaluate(() => { document.documentElement.style.fontSize = "100%"; });
    await page.setViewportSize({ width: 1440, height: 1050 });
    observations.locales[locale] = localePanels;
  }
  const failures = [];
  if (/Review CSV source types|Number requires|Cancel source preparation|Confirm types/.test(observations.source.text)) failures.push("F1 source copy remains English");
  if (observations.source.invalid !== "true" || !observations.source.describedBy) failures.push("F4 invalid source select lacks association");
  if (!observations.sourceInitialFocus || !observations.source.editedSelectRetainedFocus || observations.source.afterEscape !== 0 || !observations.source.focusReturned || !observations.source.cancelFocusReturned) failures.push("F4 source dialog focus/Escape lifecycle");
  if (observations.source.cappedLaterColumn.invalid !== "true" || !observations.source.cappedLaterColumn.describedBy || !observations.source.cappedLaterColumn.literalLongFieldVisible || !/auto|scroll/.test(observations.source.cappedLaterColumn.dialogOverflowX)) failures.push("F4 capped errors hide or clip a later invalid column");
  if (observations.source.focusRaceQueued < 2 || !observations.source.newIntentFocusPreserved || !observations.source.staleFocusAvoided) failures.push("F4 stale cancel focus overrides a newer source intent");
  if (observations.model.tabsClass !== 1 || observations.model.scopeClass < 1 || observations.model.activeBefore === "none" || observations.model.activeBeforeTop !== "0px" || observations.model.activeBeforeBackground !== "rgb(137, 207, 240)" || observations.model.helpWidth < 32 || observations.model.helpHeight < 32) failures.push("F3 actual Models styling");
  if (observations.model.codeControls.length < 6 || observations.model.codeControls.some((control) => control.width < 32 || control.height < 32) || !observations.model.codeSwatch || observations.model.codeSwatch.width < 18 || observations.model.codeSwatch.height < 18 || observations.model.codeSwatch.background === "rgba(0, 0, 0, 0)") failures.push("F3 actual Code color/reorder/Hide/Exclude controls");
  if (observations.localePreservation.some((entry) => entry.jobs !== 1 || entry.current !== "current" || entry.hiddenPressed !== "true" || entry.hiddenNodeCount !== 0 || !entry.scientificEqual || !entry.localizedReachedPlotCopy)) failures.push("locale rerender changed the exported analysis/currentness/hidden Code state or left reached plot copy unlocalized");
  if (observations.localeRestored.jobs !== 1 || observations.localeRestored.current !== "current" || observations.localeRestored.nodeCount < 1 || !observations.localeRestored.scientificEqual) failures.push("restoring hidden Codes changed science or did not restore nodes");
  for (const [locale, panels] of Object.entries(observations.locales)) {
    if (panels.zoom200.contentFontSize < panels.normal.contentFontSize * 1.8 || panels.zoom200.tabHeight < panels.normal.height) failures.push(`F3 ${locale} 200% panel text did not materially grow with stable tab geometry`);
    const zoomPanels = Object.values(panels.zoomPanels);
    if (zoomPanels.reduce((sum, panel) => sum + panel.toolbarCount, 0) === 0 || zoomPanels.some((panel) => panel.toolbarCount !== panel.wrappingToolbarCount)) failures.push(`F3 ${locale} real toolbar wrapping`);
    for (const tab of ["units", "horizons", "windows", "codes"]) {
      const panel = panels.zoomPanels[tab];
      if (!/auto|scroll/.test(panel.overflowX) || !panel.reachedRight || panel.clippedContentCount > 0) failures.push(`F3 ${locale} ${tab} panel content is not horizontally reachable`);
    }
  }
  console.log(JSON.stringify({ productRef: productRef ?? "WORKTREE", observations, failures }, null, 2));
  assert.deepEqual(failures, []);
} finally {
  await browser.close();
}
