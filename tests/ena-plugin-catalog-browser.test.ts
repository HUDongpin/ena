import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import PluginCatalogBrowser from "@/components/plugin-lab/PluginCatalogBrowser";
import { OPEN_ENA_PLUGIN_CATALOG } from "@/lib/open-ena/plugins/catalog";

test("the initial catalog exposes four keyboard buttons and one named, linked detail region", () => {
  const html = renderToStaticMarkup(createElement(PluginCatalogBrowser, { plugins: OPEN_ENA_PLUGIN_CATALOG, locale: "en" }));
  assert.equal((html.match(/aria-pressed="true"/gu) ?? []).length, 1);
  assert.equal((html.match(/aria-pressed="false"/gu) ?? []).length, 3);
  assert.equal((html.match(/type="button"/gu) ?? []).length, 4);
  const panelId = /aria-controls="([^"]+)"/u.exec(html)?.[1];
  assert.ok(panelId);
  assert.ok(html.includes(`id="${panelId}" aria-labelledby=`));
  assert.match(html, /aria-label="Choose a plugin"/u);
  assert.match(html, /href="\/en\/plugins\/longitudinal-ena"/u);
  assert.match(html, /href="\/en\/open-ena"/u);
  assert.match(html, /Repeated-entity identity and period order must be confirmed\./u);
  assert.deepEqual([...html.matchAll(/class="plugin-browser-choice-name">([^<]+)</gu)].map((match) => match[1]), ["Longitudinal ENA", "3D ENA", "Ordered Network Analysis", "3D ONA Presenter"]);
  assert.doesNotMatch(html, /How do earlier coded states connect directionally/u);
});

test("core details preserve each plugin's analysis answer, evidence, review status, and limitations", () => {
  for (const plugin of OPEN_ENA_PLUGIN_CATALOG) {
    const html = renderToStaticMarkup(createElement(PluginCatalogBrowser, { plugins: [plugin], locale: "en" }));
    assert.ok(html.includes(`href="/en/plugins/${plugin.slug}"`));
    assert.ok(html.includes(`data-answer="${plugin.changesAnalysis ? "yes" : "no"}">${plugin.changesAnalysis ? "Yes" : "No"}`));
    assert.ok(html.includes(plugin.content.en.researchQuestion));
    for (const limitation of plugin.content.en.limitations) assert.ok(html.includes(limitation));
    assert.match(html, /Automated tests: passed/u);
    assert.match(html, /Browser runtime: pending/u);
    assert.match(html, /Security\/privacy: pending/u);
    assert.match(html, /0\.1\.0-preview\.1/u);
  }
});

test("Chinese controls localize and fallback locales retain English method content and local routes", () => {
  for (const locale of ["zh-hant", "zh-hans", "fr"] as const) {
    const html = renderToStaticMarkup(createElement(PluginCatalogBrowser, { plugins: OPEN_ENA_PLUGIN_CATALOG, locale }));
    assert.ok(html.includes(`href="/${locale}/plugins/longitudinal-ena"`));
    if (locale === "fr") {
      assert.match(html, /lang="en"/u);
      assert.match(html, /View full details/u);
    } else {
      assert.match(html, locale === "zh-hant" ? /查看完整資料/u : /查看完整资料/u);
      assert.match(html, locale === "zh-hant" ? /方法已說明/u : /方法已说明/u);
    }
  }
});
