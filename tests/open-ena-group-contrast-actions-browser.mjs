import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const projectRoot = process.cwd();
const outputDir = process.env.TASK32_OUTPUT_DIR ?? "/tmp/open-ena-task32-q1-browser";
const require = createRequire(`${projectRoot}/package.json`);
const { build } = require("esbuild");
const { chromium } = require("playwright");

const workspaceFixture = await readFile(`${projectRoot}/tests/open-ena-model-v3-workspace-browser.mjs`, "utf8");
const fixture = workspaceFixture.split("const entry = `")[1].split("createRoot(document.getElementById('root'))")[0];
const entry = fixture + `
for (const row of data.rows) row.group = 'Task32Q1SyntheticGroup-' + row.group;
let root = createRoot(document.getElementById('root'));
window.task32Q1Render = (locale) => root.render(<OpenEnaWorkspace locale={locale} initialSource={{dataset:data,datasetSha256:'a'.repeat(64),drafts}} worker={worker}/>);
window.task32Q1Render('en');`;

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

const expected = {
  en: {
    cancel: "Copy cancelled", unavailable: "Copy unavailable", image: "Image copied", svg: "SVG copied as text", restore: /Restore Secondary Plot/u,
    title: /Comparison Plot/u, scale: /scaled/u, method: /Each connection is drawn once/u,
  },
  "zh-hant": {
    cancel: "已取消複製", unavailable: "無法複製", image: "已複製圖像", svg: "已將 SVG 複製為文字", restore: /還原次要圖/u,
    title: /比較圖/u, scale: /縮放/u, method: /每條連線只繪製一次/u,
  },
  "zh-hans": {
    cancel: "已取消复制", unavailable: "无法复制", image: "已复制图像", svg: "已将 SVG 复制为文本", restore: /恢复次图/u,
    title: /比较图/u, scale: /缩放/u, method: /每条连接只绘制一次/u,
  },
};

const observations = { locales: {}, restoreTargets: {}, zoomBounds: {}, clipboardReads: 0, errors: [], network: [] };
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, reducedMotion: "reduce" });
  page.on("pageerror", (error) => observations.errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") observations.errors.push(message.text());
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") {
      observations.network.push(url.origin);
      return route.abort();
    }
    if (url.pathname === "/ena-mark.svg") {
      return route.fulfill({ contentType: "image/svg+xml", body: await readFile(`${projectRoot}/public/ena-mark.svg`, "utf8") });
    }
    if (url.pathname.startsWith("/data/academy/")) {
      return route.fulfill({ status: 503, contentType: "text/plain; charset=utf-8", body: "unavailable" });
    }
    return route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><meta charset="utf-8"><style>${css}</style><div id="root"></div>` });
  });
  await page.goto("http://localhost:32002/");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.getByRole("button", { name: "Model", exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent === "Run model" && !button.disabled));
  await page.getByRole("button", { name: "Run model", exact: true }).click();
  await page.waitForFunction(() => window.jobs.length === 1);
  await page.evaluate(() => window.resolveRun(0));
  await page.waitForFunction(() => document.querySelector("[data-testid=open-ena-workspace-v3]").dataset.resultStatus === "current");
  await page.getByTestId("open-ena-group-contrast").waitFor();
  const scientificResultBefore = await page.evaluate(() => JSON.stringify(window.jobs[0].result));

  await page.evaluate(() => {
    window.task32Q1Clipboard = { confirmCalls: 0, confirmDecision: false, confirmThrows: false, writes: [], writeTexts: [], serialized: [] };
    window.confirm = () => {
      window.task32Q1Clipboard.confirmCalls += 1;
      if (window.task32Q1Clipboard.confirmThrows) throw new Error("confirmation unavailable");
      return window.task32Q1Clipboard.confirmDecision;
    };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        write: async (items) => {
          const types = [];
          for (const item of items) {
            for (const type of item.types) {
              const blob = await item.getType(type);
              types.push({ type, size: blob.size });
            }
          }
          window.task32Q1Clipboard.writes.push(types);
        },
        writeText: async (value) => window.task32Q1Clipboard.writeTexts.push({
          length: value.length,
          hasSyntheticGroup: value.includes("Task32Q1SyntheticGroup-"),
        }),
        read: () => { window.task32Q1ClipboardReads = (window.task32Q1ClipboardReads ?? 0) + 1; throw new Error("clipboard reads prohibited"); },
        readText: () => { window.task32Q1ClipboardReads = (window.task32Q1ClipboardReads ?? 0) + 1; throw new Error("clipboard reads prohibited"); },
      },
    });
    const realSerialize = XMLSerializer.prototype.serializeToString;
    XMLSerializer.prototype.serializeToString = function serializeForTask32Q1(node) {
      const value = realSerialize.call(this, node);
      window.task32Q1Clipboard.serialized.push({
        length: value.length,
        hasSyntheticGroup: value.includes("Task32Q1SyntheticGroup-"),
      });
      return value;
    };
  });

  const renderLocale = async (locale) => {
    await page.evaluate((value) => window.task32Q1Render(value), locale);
    await page.waitForTimeout(100);
  };
  const clipboardSnapshot = () => page.evaluate(() => structuredClone(window.task32Q1Clipboard));

  for (const locale of ["en", "zh-hant", "zh-hans"]) {
    await renderLocale(locale);
    const plot = page.getByTestId("open-ena-group-contrast");
    const controls = await plot.locator("[data-ena-plot-toolbar] [data-ena-plot-action], [data-ena-panel-toolbar] [data-ena-panel-action]").evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { action: element.dataset.enaPlotAction ?? element.dataset.enaPanelAction, name: element.getAttribute("aria-label"), title: element.title, width: rect.width, height: rect.height };
    }));
    assert.equal(controls.length, 17, `${locale}: the three actual plot panels expose all 17 actions`);
    assert.ok(controls.every(({ width, height }) => width >= 32 && height >= 32), `${locale}: every actual plot action is at least 32 by 32 CSS px`);
    if (locale !== "en") {
      assert.ok(controls.every(({ name, title }) => !/(Comparison|Primary|Secondary|Zoom|Recenter|Copy|Hide|Show|Remove|Switch|Plot)/u.test(`${name} ${title}`)), `${locale}: action names and titles are selected-locale copy`);
    }
    const captionText = await plot.locator(".ena-set-series-caption").allTextContents();
    const methodText = await plot.locator(".ena-set-method-boundary").textContent();
    const visibleText = await plot.innerText();
    assert.match(visibleText, expected[locale].title);
    assert.ok(captionText.some((text) => expected[locale].scale.test(text)), `${locale}: visible scale caption is localized`);
    assert.match(methodText ?? "", expected[locale].method);
    if (locale !== "en") assert.doesNotMatch(`${captionText.join(" ")} ${methodText}`, /scaled|analytic units|Each connection is drawn once/u);

    const comparisonCopy = plot.locator('[data-ena-plot-toolbar="comparison"] [data-ena-plot-action="copy-image"]');
    const beforeUnavailable = await clipboardSnapshot();
    await page.evaluate(() => { window.task32Q1Clipboard.confirmThrows = true; });
    await comparisonCopy.click();
    await page.waitForFunction(({ kind, text }) => document.querySelector(`[data-ena-plot-toolbar="${kind}"] .ena-plot-copy-status`)?.textContent === text, { kind: "comparison", text: expected[locale].unavailable });
    const afterUnavailable = await clipboardSnapshot();
    assert.equal(afterUnavailable.confirmCalls, beforeUnavailable.confirmCalls + 1, `${locale}: unavailable confirmation is attempted exactly once`);
    assert.equal(afterUnavailable.writes.length, beforeUnavailable.writes.length, `${locale}: unavailable confirmation publishes no PNG`);
    assert.equal(afterUnavailable.writeTexts.length, beforeUnavailable.writeTexts.length, `${locale}: unavailable confirmation publishes no SVG fallback`);

    const beforeRejectPng = await clipboardSnapshot();
    await page.evaluate(() => { window.task32Q1Clipboard.confirmThrows = false; window.task32Q1Clipboard.confirmDecision = false; });
    await comparisonCopy.click();
    await page.waitForFunction(({ kind, text }) => document.querySelector(`[data-ena-plot-toolbar="${kind}"] .ena-plot-copy-status`)?.textContent === text, { kind: "comparison", text: expected[locale].cancel });
    const afterRejectPng = await clipboardSnapshot();
    assert.equal(afterRejectPng.confirmCalls, beforeRejectPng.confirmCalls + 1, `${locale}: rejected PNG asks exactly once`);
    assert.equal(afterRejectPng.writes.length, beforeRejectPng.writes.length, `${locale}: rejected PNG publishes nothing`);
    assert.equal(afterRejectPng.writeTexts.length, beforeRejectPng.writeTexts.length, `${locale}: rejected PNG cannot use SVG fallback`);

    await page.evaluate(() => { window.task32Q1Clipboard.confirmDecision = true; });
    const beforeAcceptPng = await clipboardSnapshot();
    await comparisonCopy.click();
    await page.waitForFunction(({ kind, text }) => document.querySelector(`[data-ena-plot-toolbar="${kind}"] .ena-plot-copy-status`)?.textContent === text, { kind: "comparison", text: expected[locale].image });
    const afterAcceptPng = await clipboardSnapshot();
    assert.equal(afterAcceptPng.confirmCalls, beforeAcceptPng.confirmCalls + 1, `${locale}: accepted PNG asks exactly once`);
    assert.equal(afterAcceptPng.writes.length, beforeAcceptPng.writes.length + 1, `${locale}: accepted PNG publishes exactly once`);
    assert.equal(afterAcceptPng.writeTexts.length, beforeAcceptPng.writeTexts.length, `${locale}: successful PNG has no text fallback`);
    assert.ok(afterAcceptPng.serialized.at(-1)?.hasSyntheticGroup, `${locale}: accepted PNG serialization contains the synthetic Group identity`);

    await page.evaluate(() => { window.task32Q1Clipboard.confirmDecision = false; navigator.clipboard.write = undefined; });
    const secondaryCopy = plot.locator('[data-ena-plot-toolbar="secondary"] [data-ena-plot-action="copy-image"]');
    const beforeRejectSvg = await clipboardSnapshot();
    await secondaryCopy.click();
    await page.waitForFunction(({ kind, text }) => document.querySelector(`[data-ena-plot-toolbar="${kind}"] .ena-plot-copy-status`)?.textContent === text, { kind: "secondary", text: expected[locale].cancel });
    const afterRejectSvg = await clipboardSnapshot();
    assert.equal(afterRejectSvg.confirmCalls, beforeRejectSvg.confirmCalls + 1, `${locale}: rejected SVG fallback asks exactly once`);
    assert.equal(afterRejectSvg.writeTexts.length, beforeRejectSvg.writeTexts.length, `${locale}: rejected SVG fallback publishes nothing`);

    await page.evaluate(() => { window.task32Q1Clipboard.confirmDecision = true; });
    const beforeAcceptSvg = await clipboardSnapshot();
    await secondaryCopy.click();
    await page.waitForFunction(({ kind, text }) => document.querySelector(`[data-ena-plot-toolbar="${kind}"] .ena-plot-copy-status`)?.textContent === text, { kind: "secondary", text: expected[locale].svg });
    const afterAcceptSvg = await clipboardSnapshot();
    assert.equal(afterAcceptSvg.confirmCalls, beforeAcceptSvg.confirmCalls + 1, `${locale}: accepted SVG fallback asks exactly once`);
    assert.equal(afterAcceptSvg.writeTexts.length, beforeAcceptSvg.writeTexts.length + 1, `${locale}: accepted SVG fallback publishes exactly once`);
    assert.equal(afterAcceptSvg.writeTexts.at(-1)?.hasSyntheticGroup, true, `${locale}: accepted SVG text contains the synthetic Group identity`);

    const visibility = plot.locator('[data-ena-panel-toolbar="primary"] [data-ena-panel-action="toggle-visibility"]');
    await visibility.click();
    assert.equal(await visibility.getAttribute("aria-pressed"), "true", `${locale}: Hide becomes a pressed Show action`);
    await visibility.click();
    assert.equal(await visibility.getAttribute("aria-pressed"), "false", `${locale}: Show restores the panel`);

    await plot.locator('[data-ena-panel-toolbar="secondary"] [data-ena-panel-action="remove"]').click();
    await page.waitForFunction(() => document.activeElement?.getAttribute("data-ena-restore-slot") === "secondary");
    const restore = plot.locator('[data-ena-restore-slot="secondary"]').first();
    const restoreRect = await restore.evaluate((element) => element.getBoundingClientRect().toJSON());
    assert.ok(restoreRect.width >= 32 && restoreRect.height >= 32, `${locale}: revealed Restore target is at least 32px: ${JSON.stringify(restoreRect)}`);
    assert.match(await restore.getAttribute("aria-label") ?? "", expected[locale].restore);
    observations.restoreTargets[locale] = restoreRect;
    await restore.press("Enter");
    await page.waitForFunction(() => document.activeElement?.getAttribute("data-ena-panel-role") === "secondary");

    const switchAction = plot.locator('[data-ena-panel-action="switch-plots"]');
    const beforeLocaleSwitch = await plot.locator(".ena-set-series-caption").first().innerText();
    await switchAction.focus();
    await switchAction.click();
    await page.waitForFunction((before) => document.querySelector(".ena-set-series-caption")?.textContent !== before, beforeLocaleSwitch);
    assert.equal(await switchAction.evaluate((element) => document.activeElement === element), true, `${locale}: Switch retains focus after changing the ordered pair`);

    observations.locales[locale] = { controls, captionText, methodText, copy: afterAcceptSvg };
    await plot.locator('[data-ena-plot-toolbar="comparison"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${outputDir}/plot-actions-${locale}.png` });
    await page.evaluate(() => {
      navigator.clipboard.write = async (items) => {
        const types = [];
        for (const item of items) for (const type of item.types) {
          const blob = await item.getType(type);
          types.push({ type, size: blob.size });
        }
        window.task32Q1Clipboard.writes.push(types);
      };
    });
  }

  await renderLocale("zh-hans");
  const plot = page.getByTestId("open-ena-group-contrast");
  await plot.locator('[data-ena-panel-toolbar="primary"] [data-ena-panel-action="remove"]').click();
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-ena-restore-slot") === "secondary");
  const promotedRestore = plot.locator('[data-ena-restore-slot="secondary"]').first();
  const promotedRect = await promotedRestore.evaluate((element) => element.getBoundingClientRect().toJSON());
  assert.ok(promotedRect.width >= 32 && promotedRect.height >= 32, `promoted Primary removal exposes a 32px restore target: ${JSON.stringify(promotedRect)}`);
  assert.match(await promotedRestore.getAttribute("aria-label") ?? "", /恢复次图/u);
  observations.promotedRestoreTarget = promotedRect;
  await promotedRestore.press("Enter");
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-ena-panel-role") === "secondary");

  await plot.locator('[data-ena-panel-toolbar="secondary"] [data-ena-panel-action="remove"]').click();
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-ena-restore-slot") === "secondary");
  const secondaryRestore = plot.locator('[data-ena-restore-slot="secondary"]').first();
  await secondaryRestore.press(" ");
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-ena-panel-role") === "secondary");

  const measureRestoreAtZoomBound = async (zoomAction, expectedZoom) => {
    const zoomButton = plot.locator(`[data-ena-plot-toolbar="comparison"] [data-ena-plot-action="${zoomAction}"]`);
    while (!(await zoomButton.isDisabled())) await zoomButton.click();
    assert.equal(await page.getByTestId("open-ena-group-comparison-plot").getAttribute("data-ena-plot-zoom"), expectedZoom);
    await plot.locator('[data-ena-panel-toolbar="secondary"] [data-ena-panel-action="remove"]').click();
    await page.waitForFunction(() => document.activeElement?.getAttribute("data-ena-restore-slot") === "secondary");
    const restore = plot.locator('[data-ena-restore-slot="secondary"]').first();
    const rect = await restore.evaluate((element) => element.getBoundingClientRect().toJSON());
    assert.ok(rect.width >= 32 && rect.height >= 32, `${expectedZoom}x plot zoom Restore target is at least 32px: ${JSON.stringify(rect)}`);
    await restore.press("Enter");
    await page.waitForFunction(() => document.activeElement?.getAttribute("data-ena-panel-role") === "secondary");
    observations.zoomBounds[expectedZoom] = rect;
  };
  await measureRestoreAtZoomBound("zoom-out", "0.6");
  await plot.locator('[data-ena-plot-toolbar="comparison"] [data-ena-plot-action="recenter"]').click();
  await measureRestoreAtZoomBound("zoom-in", "2.4");
  await plot.locator('[data-ena-plot-toolbar="comparison"] [data-ena-plot-action="recenter"]').click();

  await page.setViewportSize({ width: 760, height: 900 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
  const narrowZoomOut = plot.locator('[data-ena-plot-toolbar="comparison"] [data-ena-plot-action="zoom-out"]');
  while (!(await narrowZoomOut.isDisabled())) await narrowZoomOut.click();
  await plot.locator('[data-ena-plot-toolbar="comparison"]').scrollIntoViewIfNeeded();
  const reflowControls = await plot.locator("[data-ena-plot-toolbar] [data-ena-plot-action], [data-ena-panel-toolbar] [data-ena-panel-action]").evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height, visible: Boolean(element.getClientRects().length) };
  }));
  assert.equal(reflowControls.length, 17, "all actions remain mounted in narrow 200 percent text reflow");
  assert.ok(reflowControls.every(({ width, height, visible }) => visible && width >= 32 && height >= 32), "all actions remain visible and at least 32px in narrow reflow");
  await plot.locator('[data-ena-panel-toolbar="secondary"] [data-ena-panel-action="remove"]').click();
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-ena-restore-slot") === "secondary");
  const narrowRestore = plot.locator('[data-ena-restore-slot="secondary"]').first();
  const narrowRestoreRect = await narrowRestore.evaluate((element) => element.getBoundingClientRect().toJSON());
  assert.ok(narrowRestoreRect.width >= 32 && narrowRestoreRect.height >= 32, `narrow 200 percent Restore target is at least 32px: ${JSON.stringify(narrowRestoreRect)}`);
  observations.narrowRestoreTarget = narrowRestoreRect;
  await page.screenshot({ path: `${outputDir}/plot-actions-zh-hans-narrow-200-percent-restore.png`, fullPage: true });
  await narrowRestore.press("Enter");
  await page.screenshot({ path: `${outputDir}/plot-actions-zh-hans-narrow-200-percent.png`, fullPage: true });

  observations.clipboardReads = await page.evaluate(() => window.task32Q1ClipboardReads ?? 0);
  observations.workerJobs = await page.evaluate(() => window.jobs.length);
  observations.resultStatus = await page.getByTestId("open-ena-workspace-v3").getAttribute("data-result-status");
  observations.scientificResultEqual = await page.evaluate((before) => JSON.stringify(window.jobs[0].result) === before, scientificResultBefore);
  assert.equal(observations.clipboardReads, 0, "the regression never reads the system clipboard");
  assert.equal(observations.workerJobs, 1, "locale and presentation actions never start another Worker job");
  assert.equal(observations.resultStatus, "current", "presentation actions preserve the bound scientific result");
  assert.equal(observations.scientificResultEqual, true, "locale, clipboard, panel and zoom actions preserve the exact bound scientific object");
  assert.deepEqual(observations.errors, []);
  assert.deepEqual(observations.network, []);
  await writeFile(`${outputDir}/results.json`, `${JSON.stringify(observations, null, 2)}\n`);
  console.log("Task32 Q1 actual GroupContrast actions: 3 locales, reject/accept PNG and SVG fallback, stable focus, 32px normal/reflow, one current Worker result PASS.");
} finally {
  await browser.close();
}
