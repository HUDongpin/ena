import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();

function source(...segments: string[]) {
  return readFileSync(join(projectRoot, ...segments), "utf8");
}

test("the premium public design is mounted only on the requested page families", () => {
  const premiumRoutes = [
    ["app", "[locale]", "page.tsx"],
    ["app", "[locale]", "mission", "page.tsx"],
    ["app", "[locale]", "news", "page.tsx"],
    ["app", "[locale]", "news", "[slug]", "page.tsx"],
    ["app", "[locale]", "news", "topic", "[slug]", "page.tsx"],
    ["app", "[locale]", "academy", "page.tsx"],
    ["app", "[locale]", "academy", "[slug]", "page.tsx"],
  ];

  for (const route of premiumRoutes) {
    assert.match(source(...route), /premium-public-page/, `Premium scope missing from ${route.join("/")}`);
  }

  assert.doesNotMatch(source("app", "[locale]", "about", "page.tsx"), /premium-public-page/);
  assert.doesNotMatch(source("app", "[locale]", "open-ena", "page.tsx"), /premium-public-page/);
  assert.doesNotMatch(source("components", "open-ena", "OpenEnaWorkspace.tsx"), /premium-public-page/);
});

test("the premium layer is isolated in a separately imported stylesheet", () => {
  const layout = source("app", "layout.tsx");
  const cssPath = join(projectRoot, "app", "premium-public.css");

  assert.equal(existsSync(cssPath), true);
  assert.match(layout, /import "\.\/globals\.css";\s*import "\.\/premium-public\.css";/);
  assert.match(source("app", "premium-public.css"), /\.premium-public-page\s*\{/);
});

test("the premium interaction contract preserves touch, focus, contrast, and reduced motion", () => {
  const css = source("app", "premium-public.css");

  assert.match(css, /--ink:\s*#101d2e/i);
  assert.match(css, /--accent:\s*#89cff0/i);
  assert.match(css, /--accent-strong:\s*#075985/i);
  assert.match(css, /--faint:\s*#5f6f83/i);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /min-width:\s*44px/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /animation-duration:\s*0\.01ms !important/);
  assert.doesNotMatch(css, /\.open-ena-(?:page|workbench|login-page)\s/);
});

test("the project-specific design rationale is durable and rejects the unrelated template match", () => {
  const masterPath = join(projectRoot, "design-system", "ena-public-knowledge", "MASTER.md");
  assert.equal(existsSync(masterPath), true);

  const master = readFileSync(masterPath, "utf8");
  assert.match(master, /premium scientific editorial publication \+ research-tool gateway/i);
  assert.match(master, /App Store landing-page match was explicitly rejected/i);
  assert.match(master, /OPEN ENA and About keep their existing page-level/);
  assert.match(master, /No horizontal page scroll at 320, 375, 390, 414, 768, 1024, or 1440px/);
});
