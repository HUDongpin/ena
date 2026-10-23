import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { getOpenEnaHomeCopy } from "../lib/open-ena-home-copy";

const projectRoot = process.cwd();

test("the homepage keeps the hero and local analysis entry point without the static preview", () => {
  const home = readFileSync(join(projectRoot, "app", "[locale]", "page.tsx"), "utf8");
  const shared = readFileSync(join(projectRoot, "components", "home-source", "UnifiedHome.tsx"), "utf8");
  const figure = readFileSync(join(projectRoot, "components", "home-source", "NetworkHero.tsx"), "utf8");
  const footer = readFileSync(join(projectRoot, "components", "shared-home-footer", "HubFooter.tsx"), "utf8");

  assert.match(home, /<UnifiedHome/);
  assert.match(home, /openEnaHref=\{`\/\$\{locale\}\/open-ena`\}/);
  assert.match(home, /featureBase=\{`\/\$\{locale\}`\}/);
  assert.match(footer, /href: `\$\{featureBase\}\/open-ena`/);
  assert.match(shared, /<NetworkHero/);
  assert.doesNotMatch(shared, /OpenEnaPreview|href="#workspace"/);
  assert.match(shared, /href=\{openEnaHref\}/);
  assert.match(figure, /role="img" aria-labelledby="network-title network-desc"/);
});

test("Open ENA homepage copy explains openness, local processing, and reproducibility honestly", () => {
  const english = getOpenEnaHomeCopy("en");
  const traditionalChinese = getOpenEnaHomeCopy("zh-hant");
  const simplifiedChinese = getOpenEnaHomeCopy("zh-hans");

  assert.equal(english.pillars.length, 3);
  assert.match(english.pillars.map((item) => `${item.title} ${item.text}`).join(" "), /Open by design/);
  assert.match(english.pillars.map((item) => item.text).join(" "), /no data-upload endpoint/);
  assert.match(english.pillars.map((item) => item.text).join(" "), /Export model choices/);
  assert.match(english.methodNote, /not, by itself, evidence of statistical significance/);
  assert.match(traditionalChinese.title, /Open ENA/);
  assert.match(simplifiedChinese.title, /Open ENA/);
  assert.equal(getOpenEnaHomeCopy("fr"), english);
});
