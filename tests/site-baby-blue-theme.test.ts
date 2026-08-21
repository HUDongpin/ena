import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();

function source(relativePath: string) {
  return readFileSync(join(projectRoot, relativePath), "utf8");
}

const css = source("app/globals.css");

test("ENA.HK exposes one accessible Baby Blue brand token system", () => {
  assert.match(css, /--page:\s*#f1f9fd;/i);
  assert.match(css, /--surface:\s*#f7fbfe;/i);
  assert.match(css, /--surface-soft:\s*#edf8fd;/i);
  assert.match(css, /--line:\s*#d5ebf6;/i);
  assert.match(css, /--line-strong:\s*#acd9ee;/i);
  assert.match(css, /--accent:\s*#89cff0;/i);
  assert.match(css, /--accent-hover:\s*#73c2e8;/i);
  assert.match(css, /--accent-strong:\s*#1f6f9e;/i);
  assert.match(css, /--accent-soft:\s*#edf8fd;/i);
});

test("public ENA identity assets and generated metadata use Baby Blue", () => {
  for (const relativePath of ["public/ena-mark.svg", "public/ena-logo.svg", "app/icon.svg"]) {
    const svg = source(relativePath);
    assert.match(svg, /#89cff0/i, `${relativePath} must carry the Baby Blue brand color`);
    assert.doesNotMatch(svg, /#72c7bd|#eef9f7|#d7eeea/i, `${relativePath} must not retain the mint identity palette`);
  }

  const manifest = source("app/manifest.ts");
  assert.match(manifest, /background_color:\s*"#f1f9fd"/i);
  assert.match(manifest, /theme_color:\s*"#89cff0"/i);

  for (const relativePath of [
    "app/opengraph-image.tsx",
    "app/[locale]/about/page.tsx",
    "components/AcademyLessonVisual.tsx",
  ]) {
    const assetSource = source(relativePath);
    assert.match(assetSource, /#89cff0/i, `${relativePath} must use the shared Baby Blue identity`);
    assert.doesNotMatch(assetSource, /#72c7bd|#66bfb5|#eef9f7|#d7eeea/i);
  }
});

test("Open ENA consumes the global Baby Blue tokens without recoloring research data", () => {
  assert.match(
    css,
    /\.open-ena-workbench\s*\{[\s\S]*?--ena-accent:\s*var\(--accent\);[\s\S]*?--ena-accent-hover:\s*var\(--accent-hover\);[\s\S]*?--ena-accent-strong:\s*var\(--accent-strong\);[\s\S]*?--ena-accent-soft:\s*var\(--accent-soft\);[\s\S]*?--ena-accent-line:\s*var\(--line-strong\);/,
  );
  assert.doesNotMatch(
    css,
    /#72c7bd|#66bfb5|#56b09d|#397e73|#4db6ac|#49a892|#418476|#72a69e|#f4fbf9|rgba\(114,\s*199,\s*189|rgba\(86,\s*176,\s*157/i,
    "legacy mint/teal brand literals must not survive in the shared CSS",
  );

  const plotStyle = source("lib/open-ena/plot-style.ts");
  assert.match(plotStyle, /"#3366cc"[\s\S]*?"#dc3912"/i, "jENA group colors remain analytical encodings");
  assert.match(plotStyle, /DEFAULT_CODE_COLOR\s*=\s*"#000000"/i, "code colors still default to black");

  const contrast = source("components/open-ena/OpenEnaGroupContrast.tsx");
  assert.match(contrast, /#cc423a/i);
  assert.match(contrast, /#218ebf/i);
});
