import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();

test("package scripts expose a bounded Open ENA login brand browser gate", () => {
  const packageJson = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
  assert.equal(
    packageJson.scripts["test:browser:open-ena-login"],
    "node tests/open-ena-login-browser-smoke.mjs",
  );
});

test("the login browser gate covers responsive branding and authentication without embedded credentials", () => {
  const smokePath = join(projectRoot, "tests", "open-ena-login-browser-smoke.mjs");
  assert.equal(existsSync(smokePath), true);
  const source = readFileSync(smokePath, "utf8");

  assert.match(source, /width:\s*1440,\s*height:\s*1000/u);
  assert.match(source, /width:\s*820,\s*height:\s*1000/u);
  assert.match(source, /width:\s*390,\s*height:\s*844/u);
  assert.match(source, /logo-open-ena\.svg/u);
  assert.match(source, /open-ena-network-hero\.svg/u);
  assert.match(source, /open-ena-login-context-copy li/u);
  assert.match(source, /naturalWidth > 0/u);
  assert.match(source, /getAttribute\("width"\)/u);
  assert.match(source, /getAttribute\("height"\)/u);
  assert.match(source, /currentSrc/u);
  assert.match(source, /assertApproximateRatio/u);
  assert.match(source, /scrollWidth/u);
  assert.match(source, /open-ena-login-panel/u);
  assert.match(source, /rel="preload"/u);
  assert.match(source, /initiatorType/u);
  assert.match(source, /invalid-local-account/u);
  assert.match(source, /open-ena-workbench/u);
  assert.match(source, /OPEN_ENA_BROWSER_USERNAME/u);
  assert.match(source, /OPEN_ENA_BROWSER_PASSWORD/u);
  assert.match(source, /pageerror/u);
  assert.match(source, /console/u);
  assert.doesNotMatch(source, /sandytu|12345-openena/u);
});
