import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { teamMembers } from "../components/about/open-ena/team";

// The owner's requested UI baseline is the observed live release, not an older dirty checkout.
const liveBase = "12cf50e69a9bb5d3d98d2dab8cc03bab21a0c665";
const projectRoot = process.cwd();
const read = (path: string) => readFileSync(join(projectRoot, path), "utf8");
const baseline = (path: string) => execFileSync("git", ["show", `${liveBase}:${path}`], {
  cwd: projectRoot,
  encoding: "utf8",
  maxBuffer: 4 * 1024 * 1024,
});

const unchangedUi = [
  "components/Header.tsx",
  "components/HomeAwareChrome.tsx",
  "components/Logo.tsx",
  "components/home-source/NetworkHero.tsx",
  "components/home-source/unified-home/Home.module.css",
  "components/shared-home-footer/HubFooter.module.css",
  "components/open-ena/OpenEnaSiteNavigation.tsx",
  "components/about/open-ena/TeamCard.tsx",
  "components/about/open-ena/PublicationCard.tsx",
  "components/about/open-ena/publications.ts",
] as const;

for (const path of unchangedUi) {
  test(`attribution preserves live UI bytes: ${path}`, () => {
    assert.ok(read(path) === baseline(path), `${path} must remain identical to live release ${liveBase}`);
  });
}

test("global styles preserve the complete live prefix and only append scoped attribution rules", () => {
  const original = baseline("app/globals.css");
  const current = read("app/globals.css");
  assert.ok(current.startsWith(original), "all original global style bytes must be retained");
  const added = current.slice(original.length).replace(/\/\*[\s\S]*?\*\//g, "").trim();
  assert.ok(added.length > 0);
  for (const match of added.matchAll(/([^{}]+)\{/g)) {
    const selector = match[1].trim();
    if (selector.startsWith("@")) assert.ok([
      "@media (max-width: 480px)", "@container open-ena-viewport (min-width: 901px)",
    ].includes(selector));
    else for (const item of selector.split(",")) {
      if (item.trim() === ".ena-visual-workspace:has(> .open-ena-attribution-workspace)") continue;
      assert.match(item.trim(), /^\.open-ena-attribution(?:[\s.:-]|$)/);
    }
  }
});

test("workspace changes only add the attribution import and visible attribution row", () => {
  const path = "components/open-ena/OpenEnaWorkspace.tsx";
  const source = read(path);
  const importLine = /^import OpenEnaAttribution from ["']@\/components\/OpenEnaAttribution["'];\r?\n/gm;
  const attributionLine = /^[ \t]*<OpenEnaAttribution locale=\{locale\} aboutHref=\{`\/\$\{locale\}\/about`\} variant="workspace" \/>[ \t]*\r?\n/gm;
  assert.equal([...source.matchAll(importLine)].length, 1, "exactly one attribution import");
  assert.equal([...source.matchAll(attributionLine)].length, 1, "exactly one standalone attribution row");
  const withoutAttribution = source.replace(importLine, "").replace(attributionLine, "");
  assert.ok(withoutAttribution === baseline(path), "workspace must otherwise match the live release byte for byte");
});

test("the homepage retains the live shell and direct analysis entry point", () => {
  const home = read("components/home-source/UnifiedHome.tsx");
  const heroSection = /<section className="open-hero"[\s\S]*?<\/section>/u;
  const originalHero = baseline("components/home-source/UnifiedHome.tsx").match(heroSection)?.[0];
  assert.ok(originalHero, "live release has a hero section");
  assert.ok(home.match(heroSection)?.[0] === originalHero, "the complete homepage hero must remain byte-identical to the live release");
  assert.doesNotMatch(home, /import\s+HomeHeader\b/);
  assert.doesNotMatch(home, /<OpenEnaPreview\b/);
  assert.doesNotMatch(home, /className=["']open-hero-facts["']/);
  assert.doesNotMatch(home, /href=["']#workspace["']/);
  assert.match(home, /className="button-primary" href=\{openEnaHref\}/);
  assert.match(home, /<NetworkHero\s*\/>/);
  const footer = read("components/shared-home-footer/HubFooter.tsx");
  assert.match(footer, /import Logo from ["']\.\.\/Logo["']/);
  assert.match(footer, /<Logo href=\{homeHref\}\s*\/>/);
  assert.match(footer, /className="footer-links footer-navigation-links"/);
});

test("only Eric is removed and all four retained team records, including Ludwig, match the live release", () => {
  const path = "components/about/open-ena/team.ts";
  const original = baseline(path);
  const ericProfile = /^  \{\r?\n    name: "Prof\. Eric Hamilton",\r?\n[\s\S]*?^  \},\r?\n/gm;
  assert.equal([...original.matchAll(ericProfile)].length, 1, "live baseline has exactly one Eric profile");
  assert.ok(read(path) === original.replace(ericProfile, ""), "all retained team data must remain byte-identical");
  assert.deepEqual(teamMembers.map(member => member.name), [
    "Dr. Peter HU Dongpin", "Ludwig Jianxing Yu", "Prof. Sandy TU Yun-Fang", "Ms. Shirleen XU Qiaolin",
  ]);
  const ludwig = teamMembers.find(member => member.name === "Ludwig Jianxing Yu");
  assert.ok(ludwig);
  assert.equal(ludwig.image, "/open-ena-about/team/ludwig-jianxing-yu.jpg");
  assert.equal(ludwig.profileUrl, "https://3dena.com/team");
  assert.match(ludwig.bio, /key developer of 3D ENA 1\.0/);
});
