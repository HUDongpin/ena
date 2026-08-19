import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { getOpenEnaHomeCopy } from "../lib/open-ena-home-copy";

const projectRoot = process.cwd();

test("the homepage gives Open ENA a dedicated concept section and internal entry point", () => {
  const home = readFileSync(join(projectRoot, "app", "[locale]", "page.tsx"), "utf8");
  const feature = readFileSync(join(projectRoot, "components", "OpenEnaHomeFeature.tsx"), "utf8");

  assert.match(home, /<OpenEnaHomeFeature/);
  assert.match(feature, /href=\{`\/\$\{locale\}\/open-ena`\}/);
  assert.match(feature, /<figure className="open-ena-concept-figure">/);
  assert.match(feature, /role="img"/);
  assert.match(feature, /aria-labelledby="open-ena-figure-title open-ena-figure-description"/);
  assert.match(feature, /copy\.figureLabels\.data/);
  assert.match(feature, /copy\.figureLabels\.model/);
  assert.match(feature, /copy\.figureLabels\.comparison/);
  assert.match(feature, /copy\.figureLabels\.export/);
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
