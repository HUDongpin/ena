import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("inference browser gate uses the native production workflow and retains its scientific and privacy assertions", () => {
  const source = readFileSync(join(process.cwd(), "tests/open-ena-inference-browser-smoke.mjs"), "utf8");
  for (const marker of [
    "createServedBrowserV3", "prepareNativeFixtureV3", "runNativeFixtureV3", "nativeFixtureIdentitiesV3",
    "Non-parametric", "Run confirmed inference", "native table must preserve exact exported values", "open-ena-native-post-model-statistics", "pRaw", "pHolm",
    "statistics.available, false", "open-ena-ai-interpretation-request-v2", "assertAggregatePrivacy",
    "trajectory-independent-period", "trajectory-paired-periods", "trajectory-repeated-periods",
    "mann-whitney-u", "wilcoxon-signed-rank", "friedman", "path-comparison", "permutationCount",
    "open-ena-native-trajectory-analysis", "open-ena-native-trajectory-export-manifest",
    "Include participant data in this export", "requestFamilies", "sha256", "ArrowRight", "Home", "End",
    "zh-hant", "zh-hans", "scrollWidth", "consoleErrors", "consoleWarnings", "pageErrors", "runtime.close(failure)",
  ]) assert.ok(source.includes(marker), `native inference smoke must retain ${marker}`);
  assert.match(source, /page\.on\("dialog", dialog =>/u, "downloads use one persistent synthetic-actor confirmation handler");
  assert.match(source, /response\.status\(\), 200/u, "the actual entry route must serve successfully");
  assert.match(source, /localizedDataPanel\.getByRole\("button", \{ name: locale\.sample, exact: true \}\)/u);
  assert.doesNotMatch(source, /playwright-cli|next", "dev|open-ena-longitudinal-v3-workbench|schemaVersion === 2/u);
  const workflow = readFileSync(join(process.cwd(), ".github/workflows/open-ena-ci.yml"), "utf8");
  assert.ok(workflow.indexOf("node tests/open-ena-inference-browser-smoke.mjs") > workflow.indexOf("npm run test:browser:longitudinal-v3"));
});

test("keyboard return to Comparison reopens the remounted tables after checking focus", () => {
  const source = readFileSync(join(process.cwd(), "tests/open-ena-inference-browser-smoke.mjs"), "utf8");
  const keyboard = source.slice(source.indexOf('await stage("keyboard Stats tabs'), source.indexOf('await stage("aggregate AI preview'));
  const focus = keyboard.indexOf('"Tab reaches the focusable result panel"');
  const widths = keyboard.indexOf("const widths = []");
  assert.ok(focus >= 0 && widths > focus);
  const preparation = keyboard.slice(focus, widths);
  for (const summary of ["Native comparison statistics", "Researcher-requested post-model inference"]) {
    assert.ok(preparation.includes(`filter({ hasText: /^${summary}$/ }).click()`), `reopen ${summary} after the keyboard focus assertion`);
  }
  assert.match(keyboard, /assert\.ok\(wraps\.length >= 2\)/u);
  assert.match(keyboard, /wraps\.every\(node => node\.tabIndex === 0/u);
  assert.match(keyboard, /wraps\.some\(node => node\.scrollWidth > node\.clientWidth\)/u);
});
