import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { isOpenEnaAnalyticsDisabledPath } from "@/lib/analytics-consent";
import { locales } from "@/lib/i18n";
import { OPEN_ENA_PLUGIN_CATALOG } from "@/lib/open-ena/plugins/catalog";
import { pluginSoftwareApplicationJsonLd } from "@/lib/structured-data";
import {
  getPluginLabCopy,
  getPluginProposalFormCopy,
  pluginContentForLocale,
  pluginContributionLabel,
  pluginLifecycleLabel,
  pluginScientificEvidenceLabel,
} from "@/lib/plugin-lab/i18n";

const projectRoot = process.cwd();

test("every site locale has a Plugin Lab navigation label and an explicit content-language decision", () => {
  for (const locale of locales) {
    const copy = getPluginLabCopy(locale);
    assert.ok(copy.navLabel.trim().length > 0, locale);
    assert.ok(copy.explore.trim().length > 0, locale);
    assert.equal(copy.contentFallback, !["en", "zh-hant", "zh-hans"].includes(locale));
    const localized = pluginContentForLocale(OPEN_ENA_PLUGIN_CATALOG[0], locale);
    assert.equal(localized.fallback, !["en", "zh-hant", "zh-hans"].includes(locale));
    assert.equal(localized.language, localized.fallback ? "en" : locale);
    assert.ok(localized.fallback ? localized.fallbackNotice.length > 0 : localized.fallbackNotice === "");
  }
});

test("reviewed Chinese Plugin Lab surfaces localize workflow and scientific-status labels", () => {
  const zhHantForm = getPluginProposalFormCopy("zh-hant");
  const zhHansForm = getPluginProposalFormCopy("zh-hans");
  assert.equal(zhHantForm.fallback, false);
  assert.equal(zhHansForm.fallback, false);
  assert.match(zhHantForm.submit, /提交/u);
  assert.match(zhHansForm.dataSafetyConfirmation, /数据/u);
  assert.equal(getPluginProposalFormCopy("fr").fallback, true);
  assert.equal(pluginContributionLabel("analysis-family", "zh-hant"), "方法變體");
  assert.equal(pluginLifecycleLabel("research-preview", "zh-hans"), "研究预览");
  assert.equal(pluginScientificEvidenceLabel("display-only", "zh-hant"), "僅呈現");
});

test("public Plugin Lab routes exist while private workflow routes opt out of indexing and analytics", () => {
  for (const path of [
    ["app", "[locale]", "plugins", "page.tsx"],
    ["app", "[locale]", "plugins", "[slug]", "page.tsx"],
    ["app", "[locale]", "plugins", "propose", "page.tsx"],
    ["app", "[locale]", "plugins", "status", "page.tsx"],
    ["app", "[locale]", "plugins", "operator", "page.tsx"],
  ]) assert.equal(existsSync(join(projectRoot, ...path)), true, path.join("/"));
  assert.equal(existsSync(join(projectRoot, "app", "[locale]", "plugins", "status", "consent", "route.ts")), true);

  assert.equal(isOpenEnaAnalyticsDisabledPath("/en/plugins"), false);
  assert.equal(isOpenEnaAnalyticsDisabledPath("/en/plugins/3d-ena"), false);
  assert.equal(isOpenEnaAnalyticsDisabledPath("/en/plugins/propose"), true);
  assert.equal(isOpenEnaAnalyticsDisabledPath("/zh-hant/plugins/status"), true);
  assert.equal(isOpenEnaAnalyticsDisabledPath("/en/plugins/operator/anything"), true);

  for (const route of ["propose", "status", "operator"]) {
    const source = readFileSync(join(projectRoot, "app", "[locale]", "plugins", route, "page.tsx"), "utf8");
    assert.match(source, /noindex|index:\s*false/u, route);
    assert.match(source, /force-dynamic/u, route);
  }
});

test("researcher publication consent stays inside the status cookie path", () => {
  const controls = readFileSync(join(projectRoot, "components", "plugin-lab", "PluginPublicConsentControls.tsx"), "utf8");
  assert.match(controls, /`\/\$\{locale\}\/plugins\/status\/consent`/u);
  assert.doesNotMatch(controls, /fetch\("\/api\/plugin-lab\/public-consent"/u);
});

test("database-backed public proposal summaries are never baked into the static catalog", () => {
  const index = readFileSync(join(projectRoot, "app", "[locale]", "plugins", "page.tsx"), "utf8");
  assert.match(index, /export const dynamic = "force-dynamic"/u);
});

test("catalog and detail pages expose independent-extension and analysis-change boundaries", () => {
  const index = readFileSync(join(projectRoot, "app", "[locale]", "plugins", "page.tsx"), "utf8");
  const detail = readFileSync(join(projectRoot, "app", "[locale]", "plugins", "[slug]", "page.tsx"), "utf8");
  assert.match(index, /OPEN_ENA_PLUGIN_CATALOG/u);
  assert.match(getPluginLabCopy("en").independentBoundary, /not official webENA|not an official webENA/iu);
  assert.match(detail, /changesAnalysis/u);
  assert.match(detail, /scientificEvidence/u);
  assert.match(detail, /engineeringAssurance/u);
  assert.match(detail, /permissions/u);
  assert.match(detail, /licenses/u);
  assert.match(detail, /pluginSoftwareApplicationJsonLd/u);
  assert.match(detail, /plugin\.contributionKinds\.map/u);
  assert.match(detail, /plugin\.changelog\.map/u);
  assert.match(detail, /approvalBinding/u);
});

test("plugin JSON-LD projects only public manifest metadata", () => {
  const plugin = OPEN_ENA_PLUGIN_CATALOG[0];
  const data = pluginSoftwareApplicationJsonLd({
    plugin,
    locale: "en",
    name: plugin.content.en.name,
    description: plugin.content.en.tagline,
  });
  assert.equal(data["@type"], "SoftwareApplication");
  assert.equal(data.softwareVersion, plugin.version);
  assert.equal(data.url, `https://www.ena.hk/en/plugins/${plugin.slug}`);
  assert.equal(JSON.stringify(data).includes("private"), false);
});

test("proposal UI is text-only and states the no-NDA, no-participant-data, and no-purchased-verification boundaries", () => {
  const propose = readFileSync(join(projectRoot, "app", "[locale]", "plugins", "propose", "page.tsx"), "utf8");
  const form = readFileSync(join(projectRoot, "components", "plugin-lab", "PluginProposalForm.tsx"), "utf8");
  const combined = `${propose}\n${form}\n${JSON.stringify(getPluginProposalFormCopy("en"))}`;
  assert.doesNotMatch(combined, /type=["']file["']/u);
  assert.match(combined, /not an NDA/iu);
  assert.match(combined, /participant|student data/iu);
  assert.match(combined, /does not buy|cannot buy|does not purchase/iu);
});

test("navigation and sitemap include only public plugin routes", () => {
  const header = readFileSync(join(projectRoot, "components", "Header.tsx"), "utf8");
  const footer = readFileSync(join(projectRoot, "components", "Footer.tsx"), "utf8");
  const sitemap = readFileSync(join(projectRoot, "app", "sitemap.ts"), "utf8");
  assert.match(header, /open-ena[\s\S]*?plugins[\s\S]*?news/u);
  assert.match(footer, /open-ena[\s\S]*?plugins[\s\S]*?news/u);
  assert.match(sitemap, /OPEN_ENA_PLUGIN_CATALOG/u);
  assert.match(sitemap, /pluginRoutes/u);
  assert.doesNotMatch(sitemap, /plugins\/(?:propose|status|operator)/u);
});

test("embedded Plugin Lab invitations mark every non-reviewed locale as an English fallback", () => {
  for (const path of [
    ["app", "[locale]", "page.tsx"],
    ["app", "[locale]", "mission", "page.tsx"],
    ["app", "[locale]", "about", "page.tsx"],
    ["components", "open-ena", "OpenEnaLogin.tsx"],
  ]) {
    const source = readFileSync(join(projectRoot, ...path), "utf8");
    assert.match(source, /contentFallback/u, path.join("/"));
    assert.match(source, /lang=\{pluginCopy\.contentFallback \? "en" : undefined\}/u, path.join("/"));
  }
});
