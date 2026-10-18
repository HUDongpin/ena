import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { getOpenEnaHomeCopy } from "../lib/open-ena-home-copy";

const projectRoot = process.cwd();

test("the merged homepage keeps the accessible preview and a local analysis entry point", () => {
  const home = readFileSync(join(projectRoot, "app", "[locale]", "page.tsx"), "utf8");
  const shared = readFileSync(join(projectRoot, "components", "home-source", "UnifiedHome.tsx"), "utf8");
  const figure = readFileSync(join(projectRoot, "components", "home-source", "NetworkHero.tsx"), "utf8");
  const preview = readFileSync(join(projectRoot, "components", "home-source", "OpenEnaPreview.tsx"), "utf8");
  const footer = readFileSync(join(projectRoot, "components", "shared-home-footer", "HubFooter.tsx"), "utf8");

  assert.match(home, /<UnifiedHome/);
  assert.match(home, /featureBase=\{`\/\$\{locale\}`\}/);
  assert.match(footer, /href: `\$\{featureBase\}\/open-ena`/);
  assert.match(shared, /<NetworkHero/);
  assert.match(shared, /<OpenEnaPreview/);
  assert.match(figure, /role="img" aria-labelledby="network-title network-desc"/);
  assert.match(preview, /data-ui-preview="static"/);
  assert.match(preview, /aria-label="Preview analysis modes"/);
  assert.match(preview, /It is not computed from user data/);
  assert.match(preview, /disabled>Build model with jENA/);
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
