import assert from "node:assert/strict";
import test from "node:test";
import { siteConfig } from "../lib/site";
import { pageMetadata } from "../lib/metadata";
import manifest from "../app/manifest";
import robots from "../app/robots";
import sitemap from "../app/sitemap";
import { getDictionary, locales } from "../lib/i18n";
import { learningResourceJsonLd, pluginSoftwareApplicationJsonLd } from "../lib/structured-data";
import { OPEN_ENA_PLUGIN_CATALOG } from "../lib/open-ena/plugins/catalog";

const origin = "https://www.open-ena.com";
test("Open ENA uses its primary domain for discovery, application identity and every sitemap URL", () => {
  assert.equal(siteConfig.url, origin);
  assert.equal(manifest().short_name, "Open ENA");
  assert.match(manifest().name!, /^Open ENA/u);
  assert.equal(robots().host, origin);
  assert.equal(robots().sitemap, `${origin}/sitemap.xml`);
  for (const entry of sitemap()) {
    assert.equal(new URL(entry.url).origin, origin);
    for (const href of Object.values(entry.alternates?.languages ?? {})) assert.equal(new URL(String(href)).origin, origin);
  }
  for (const locale of locales) assert.match(getDictionary(locale).meta.siteTitle, /^Open ENA/u);
});

test("page social metadata identifies the page and Open ENA instead of inheriting a generic old-brand card", () => {
  const metadata = pageMetadata({ locale: "zh-hans", path: "/academy", title: "学院", description: "教学资源" });
  assert.equal(metadata.openGraph?.siteName, "Open ENA");
  assert.equal(metadata.twitter?.title, "学院 | Open ENA");
  assert.equal(metadata.twitter?.description, "教学资源");
  assert.ok(metadata.openGraph?.images);
});

test("structured data uses the primary publisher while preserving scholarly source citations", () => {
  const lesson = learningResourceJsonLd({ name: "Synthetic tutorial", description: "Synthetic", datePublished: "2026-10-29", educationalLevel: "Beginner", teaches: [], keywords: [], durationMinutes: 10, url: `${origin}/en/academy/sample`, sourceUrls: ["https://example.org/paper"], steps: [] });
  assert.equal(lesson.publisher.name, "Open ENA");
  assert.equal(lesson.publisher.url, origin);
  assert.equal(lesson.author.name, "Open ENA Academy");
  assert.deepEqual(lesson.citation, ["https://example.org/paper"]);
  const plugin = OPEN_ENA_PLUGIN_CATALOG[0];
  assert.equal(pluginSoftwareApplicationJsonLd({ plugin, locale: "zh-hans", name: "Synthetic", description: "Synthetic" }).url, `${origin}/zh-hans/plugins/${plugin.slug}`);
});
