import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();
const smokeModuleUrl = new URL("./open-ena-login-browser-smoke.mjs", import.meta.url).href;

async function loadSmokeModule() {
  return import(smokeModuleUrl);
}

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
  assert.match(source, /export function validateOpenEnaLoopbackBaseUrl/u);
  assert.match(source, /export function createSensitiveValueRedactor/u);
  assert.match(source, /export async function runOpenEnaLoginBrowserSmoke\(environment = process\.env\)/u);
  assert.match(source, /const username = environment\.OPEN_ENA_BROWSER_USERNAME/u);
  assert.match(source, /const password = environment\.OPEN_ENA_BROWSER_PASSWORD/u);
  assert.doesNotMatch(source, /const username = ["'`]/u);
  assert.doesNotMatch(source, /const password = ["'`]/u);
  assert.match(source, /pathToFileURL\(resolve\(process\.argv\[1\]\)\)\.href === import\.meta\.url/u);
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
  assert.match(source, /finally \{\n    await browser\.close\(\);/u);
});

test("the loopback URL validator returns only safe local origins", async () => {
  const { validateOpenEnaLoopbackBaseUrl } = await loadSmokeModule();

  assert.equal(
    validateOpenEnaLoopbackBaseUrl("http://127.0.0.1:3000"),
    "http://127.0.0.1:3000",
  );
  assert.equal(
    validateOpenEnaLoopbackBaseUrl("http://[::1]:3000"),
    "http://[::1]:3000",
  );
});

test("the loopback URL validator rejects unsafe values without echoing them", async () => {
  const { validateOpenEnaLoopbackBaseUrl } = await loadSmokeModule();
  const safeMessage = "OPEN_ENA_BROWSER_BASE_URL must be an http loopback origin without credentials, path, query, or fragment";
  const rejectedValues = [
    "not a url",
    "https://127.0.0.1:3000",
    "http://localhost:3000",
    "https://synthetic-external.invalid",
    "http://synthetic-user:synthetic-pass@127.0.0.1:3000",
    "http://127.0.0.1:3000/?syntheticToken=value",
    "http://127.0.0.1:3000/#synthetic-fragment",
    "http://127.0.0.1:3000/synthetic-prefix",
  ];

  for (const rawValue of rejectedValues) {
    assert.throws(
      () => validateOpenEnaLoopbackBaseUrl(rawValue),
      (error) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, safeMessage);
        assert.equal(error.message.includes(rawValue), false);
        return true;
      },
    );
  }
});

test("the sensitive-value redactor replaces exact and encoded synthetic values longest-first", async () => {
  const { createSensitiveValueRedactor } = await loadSmokeModule();

  const passwordContainsUsername = createSensitiveValueRedactor([
    "synthetic-user",
    "synthetic-user--password",
  ]);
  assert.equal(
    passwordContainsUsername("synthetic-user--password / synthetic-user"),
    "[redacted] / [redacted]",
  );

  const usernameContainsPassword = createSensitiveValueRedactor([
    "short-secret",
    "short-secret--username",
  ]);
  assert.equal(
    usernameContainsPassword("short-secret--username / short-secret"),
    "[redacted] / [redacted]",
  );

  const identicalValues = createSensitiveValueRedactor(["same-synthetic", "same-synthetic"]);
  assert.equal(identicalValues("same-synthetic + same-synthetic"), "[redacted] + [redacted]");

  const ignoresEmptyValues = createSensitiveValueRedactor(["", undefined, null]);
  assert.equal(ignoresEmptyValues("unchanged synthetic text"), "unchanged synthetic text");

  const specialCharacters = createSensitiveValueRedactor(["a.$^*+?()"]);
  assert.equal(specialCharacters("a.$^*+?() then a.$^*+?()"), "[redacted] then [redacted]");

  const encodedValue = "synthetic user/+";
  const encodedVariants = createSensitiveValueRedactor([encodedValue]);
  assert.equal(
    encodedVariants(`plain=${encodedValue}; encoded=${encodeURIComponent(encodedValue)}`),
    "plain=[redacted]; encoded=[redacted]",
  );
});

test("the sensitive-value redactor replaces native form-encoded synthetic values", async () => {
  const { createSensitiveValueRedactor } = await loadSmokeModule();
  const sensitiveValue = "synthetic value/+";
  const formEncodedValue = new URLSearchParams({ value: sensitiveValue }).toString().slice("value=".length);
  const redact = createSensitiveValueRedactor([sensitiveValue]);

  assert.equal(
    redact(`native-form=${formEncodedValue}; native-form=${formEncodedValue}`),
    "native-form=[redacted]; native-form=[redacted]",
  );
});
