import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { locales } from "../lib/i18n";
import { attributionSources, getOpenEnaAttributionCopy, openEnaAttributionCopy } from "../lib/open-ena-attribution";
import { teamMembers } from "../components/about/open-ena/team";
import { projectPublications } from "../components/about/open-ena/publications";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

test("every supported locale has complete original-language attribution, theory and purpose copy", () => {
  assert.deepEqual(Object.keys(openEnaAttributionCopy).sort(), [...locales].sort());
  const english = getOpenEnaAttributionCopy("en");
  for (const locale of locales) {
    const copy = getOpenEnaAttributionCopy(locale);
    assert.deepEqual(Object.keys(copy).sort(), Object.keys(english).sort(), locale);
    for (const [key, value] of Object.entries(copy)) {
      assert.equal(typeof value, "string", `${locale}.${key}`);
      assert.ok(value.trim(), `${locale}.${key}`);
      assert.doesNotMatch(value, /<[^>]*>|\bTODO\b|\bTBD\b|\[translate\]/iu, `${locale}.${key}`);
      if (locale !== "en") assert.notEqual(value, english[key as keyof typeof english], `${locale}.${key} must not fall back to English`);
    }
    for (const entity of ["University of Wisconsin–Madison", "David Williamson Shaffer", "Epistemic Analytics Lab", "Wisconsin Center for Education Research", "webENA"]) {
      assert.ok(copy.acknowledgements.includes(entity), `${locale} acknowledges ${entity}`);
    }
    for (const entity of ["UW–Madison", "David Williamson Shaffer", "Epistemic Analytics Lab", "webENA"]) {
      assert.ok(copy.shortCredit.includes(entity), `${locale} visibly credits ${entity}`);
    }
    assert.match(copy.designOrigin, /webENA/u, locale);
  }
  assert.equal(english.purpose, "Open ENA is a non-commercial platform for educational and research purposes and will remain free forever.");
});

test("permanent free access is expressed explicitly across all fourteen translations", () => {
  const forever = {
    en: /free forever/,
    "zh-hant": /永久免費/,
    "zh-hans": /永久免费/,
    es: /gratuita para siempre/,
    fr: /gratuite pour toujours/,
    pt: /gratuito para sempre/,
    de: /für immer kostenlos/,
    ar: /مجانية إلى الأبد/,
    ko: /영구|영원/,
    ja: /永久|永続/,
    hi: /हमेशा|सदैव/,
    ru: /навсегда.*бесплатной/,
    id: /gratis selamanya/,
    bn: /চিরকাল|চিরদিন|সবসময়/,
  } as const;
  for (const locale of locales) assert.match(getOpenEnaAttributionCopy(locale).purpose, forever[locale], locale);
});

test("Eric's team profile is removed without rewriting scholarly authorship", () => {
  assert.deepEqual(teamMembers.map(member => member.name), [
    "Dr. Peter HU Dongpin", "Ludwig Jianxing Yu", "Prof. Sandy TU Yun-Fang", "Ms. Shirleen XU Qiaolin",
  ]);
  assert.ok(teamMembers.every(member => !/Eric Hamilton|eric-hamilton/.test(JSON.stringify(member))));
  assert.ok(projectPublications[0].schemaAuthors.includes("Eric Hamilton"));
  assert.match(projectPublications[0].authors, /Hamilton, E\./);
  assert.equal(projectPublications[0].href, undefined, "retain the existing forthcoming publication status");
});

test("verified foundational references and official source links remain stable", () => {
  assert.equal(attributionSources.lab, "https://www.epistemicanalytics.org/");
  assert.equal(attributionSources.webena, "https://app.epistemicnetwork.org/");
  assert.equal(attributionSources.tutorial, "https://doi.org/10.18608/jla.2016.33.3");
  assert.equal(attributionSources.theory, "https://doi.org/10.18608/hla17.015");
  assert.equal(attributionSources.visualization, "https://doi.org/10.1007/978-3-030-93859-8_9");
  const references = read("components/about/open-ena/FoundationReferences.tsx");
  assert.match(references, /Cathcart Press/);
  assert.match(references, /Collier/);
  assert.match(references, /Hinojosa/);
  assert.match(references, /129[–-]143/);
  assert.match(references, /175[–-]187/);
});

test("all public entry points and the workspace receive the original route locale", () => {
  for (const path of ["components/home-source/UnifiedHome.tsx", "components/shared-home-footer/HubFooter.tsx", "components/Footer.tsx"]) {
    assert.match(read(path), /<OpenEnaAttribution locale=\{locale\}/, path);
  }
  const workspace = read("components/open-ena/OpenEnaWorkspace.tsx");
  assert.match(workspace, /<OpenEnaDisclaimer locale=\{locale\}/);
  assert.doesNotMatch(workspace, /<OpenEnaAttribution\b/, "the former upper acknowledgement block is removed");
  const disclaimer = read("components/open-ena/OpenEnaDisclaimer.tsx");
  assert.match(disclaimer, /<OpenEnaAttribution locale=\{locale\}/);
  assert.match(disclaimer, /variant="popup"/);
  const component = read("components/OpenEnaAttribution.tsx");
  assert.match(component, /#acknowledgements/);
  assert.match(component, /target="_blank" rel="noopener noreferrer"/);
  assert.match(component, /common\.externalLink/);
  assert.doesNotMatch(component, /getOpenEnaCopy|isOpenEnaLocalizedLocale/);
});
