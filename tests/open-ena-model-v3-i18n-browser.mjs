import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = new URL("..", import.meta.url).pathname;
const artifactDir = "/tmp/ena-41-task-controller-20260905/task32-browser-screenshots";
await mkdir(artifactDir, { recursive: true });

const entry = `
  import React from "react";
  import { createRoot } from "react-dom/client";
  import { getOpenEnaCopy } from "./lib/open-ena-i18n";
  import { OpenEnaModelTabsV3 } from "./components/open-ena/model-v3/OpenEnaModelTabsV3";
  const context = { datasetSha256: "${"a".repeat(64)}", family: "standard", scientificRevision: 1, draftFingerprint: "model-draft-json-v3:{}", executionEpoch: 0 };
  const summary = { context, configuration: { family: "standard", model: "EndPoint", window: "Conversation", weighting: "binary", rotation: "svd" }, counts: { units: { availability: "available", value: 4 }, horizons: { availability: "available", value: 2 }, groups: { availability: "available", value: 2 }, codes: { availability: "available", value: 3 } } };
  const root = createRoot(document.getElementById("root"));
  function render(locale) {
    const copy = getOpenEnaCopy(locale).modelV3.tabs;
    root.render(<main className="ena-model-control-content" lang={locale}><OpenEnaModelTabsV3 copy={copy} diagnostics={[]} scientificContext={context} scientificSummary={summary} status={{ runStatus: "idle", resultStatus: "current", configurationReadiness: "ready", editorBlocked: false }} renderPanel={(tab) => <section><h2>{copy.tabs[tab]}</h2><div className="ena-model-toolbar"><button type="button">{copy.tabs.units}</button><button type="button">{copy.tabs.codes}</button></div><div className="ena-official-field-path"><div className="ena-official-field-path-segments"><span className="ena-official-field-path-segment"><span className="ena-official-field-name">Extremely long researcher supplied field path that must stay bounded and scrollable</span></span></div><button className="ena-official-field-path-add" aria-label="add" type="button">+</button></div><button className="ena-official-icon-button" aria-label="icon action" type="button">●</button></section>} onSuggestedAction={() => {}} /> </main>);
  }
  window.__task32 = { render };
  render("en");
`;

const bundle = await build({ stdin: { contents: entry, loader: "tsx", resolveDir: root, sourcefile: "task32-i18n-browser.tsx" }, bundle: true, format: "iife", platform: "browser", write: false });
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 640, height: 480 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.setContent(`<style>${css}</style><div id="root"></div>`);
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  for (const locale of ["en", "zh-hant", "zh-hans"]) {
    await page.evaluate((value) => window.__task32.render(value), locale);
    await page.getByRole("tab").nth(3).waitFor();
    assert.equal(await page.locator("button button").count(), 0);
    assert.equal(await page.locator('[role="status"][aria-live="polite"]').count(), 1);
    await page.locator('[data-model-tab="units"]').focus();
    assert.equal(await page.locator('[data-model-tab="units"]').evaluate((node) => getComputedStyle(node).outlineWidth), "3px");
    const helpButton = page.locator(".ena-model-tab-and-help > button");
    const helpName = await helpButton.getAttribute("aria-label");
    assert.ok(helpName);
    if (locale !== "en") assert.doesNotMatch(helpName, /About Units settings/u);
    await helpButton.click();
    await page.keyboard.press("Escape");
    await page.waitForFunction((name) => document.activeElement?.getAttribute("aria-label") === name, helpName);
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    assert.equal(await page.locator(".ena-official-icon-button").evaluate((node) => {
      const style = getComputedStyle(node); return Number.parseFloat(style.width) >= 32 && Number.parseFloat(style.height) >= 32;
    }), true);
    await page.screenshot({ path: `${artifactDir}/${locale}.png`, fullPage: true });
    await page.evaluate(() => { document.documentElement.style.fontSize = "100%"; });
  }
  assert.equal(await page.locator(".ena-model-control-content h2").textContent(), "单位");
  console.log("Task32 Models v3 locale, focus, reduced-motion and 200% reflow browser gate passed.");
} finally {
  await browser.close();
}
