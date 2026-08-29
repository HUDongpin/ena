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
  assert.match(source, /new URL\(lockup\.currentSrc\)/u);
  assert.match(source, /new URL\(network\.currentSrc\)/u);
  assert.match(source, /logoCurrentSrcOrigin/u);
  assert.match(source, /heroCurrentSrcOrigin/u);
  assert.match(source, /logoCurrentSrcPathname/u);
  assert.match(source, /heroCurrentSrcPathname/u);
  assert.match(source, /brandAudit\.logoCurrentSrcOrigin, brandAudit\.pageOrigin/u);
  assert.match(source, /brandAudit\.heroCurrentSrcOrigin, brandAudit\.pageOrigin/u);
  assert.match(source, /brandAudit\.logoCurrentSrcPathname, "\/logo-open-ena\.svg"/u);
  assert.match(source, /brandAudit\.heroCurrentSrcPathname, "\/open-ena-network-hero\.svg"/u);
  assert.match(source, /assertApproximateRatio/u);
  assert.match(source, /scrollWidth/u);
  assert.match(source, /open-ena-login-panel/u);
  assert.match(source, /rel="preload"/u);
  assert.match(source, /initiatorType/u);
  assert.match(source, /invalid-local-account/u);
  assert.match(source, /open-ena-workbench/u);
  assert.match(source, /OPEN_ENA_BROWSER_USERNAME/u);
  assert.match(source, /OPEN_ENA_BROWSER_PASSWORD/u);
  assert.match(source, /const username = process\.env\.OPEN_ENA_BROWSER_USERNAME/u);
  assert.match(source, /const password = process\.env\.OPEN_ENA_BROWSER_PASSWORD/u);
  assert.match(source, /assertRectanglesDoNotOverlap\(researchFlowBoxes, "mobile research-flow items"\)/u);
  assert.match(source, /brandAudit\.scrollWidth <= brandAudit\.clientWidth \+ 1/u);
  assert.match(source, /formBox\.y >= brandBox\.y \+ brandBox\.height - 1/u);
  assert.match(source, /brandBox\.x \+ brandBox\.width <= formBox\.x \+ 1/u);
  assert.match(source, /assert\.equal\(brandAudit\.hasHeroPreload, false/u);
  assert.match(source, /brandAudit\.heroResourceInitiatorTypes\.length > 0/u);
  assert.match(source, /\.every\(\(initiatorType\) => initiatorType === "img"\)/u);
  assert.match(source, /invalid-local-password/u);
  assert.match(source, /getByRole\("alert"\)\.waitFor\(\{ state: "visible" \}\)/u);
  assert.match(source, /getByLabel\("Account name"\)\.fill\(username\)/u);
  assert.match(source, /getByLabel\("Password"\)\.fill\(password\)/u);
  assert.match(source, /locator\("\.open-ena-workbench"\)\.waitFor\(\{ state: "visible", timeout: 30_000 \}\)/u);
  assert.match(source, /document\.activeElement/u);
  assert.match(source, /\.blur\(\)/u);
  assert.match(source, /window\.scrollTo/u);
  assert.match(source, /window\.scrollY === 0/u);
  assert.match(source, /window\.scrollX === 0/u);
  assert.match(source, /pageerror/u);
  assert.match(source, /console/u);
  assert.match(source, /message\.type\(\) === "error"/u);
  assert.match(source, /assert\.deepEqual\(messages\.errors, \[\],/u);
  assert.match(source, /finally \{\n    await context\.close\(\);/u);
  assert.match(source, /finally \{\n  await browser\.close\(\);/u);
  assert.doesNotMatch(source, /sandytu|12345-openena/u);
});
