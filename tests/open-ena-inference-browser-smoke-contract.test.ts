import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();
const smokePath = join(projectRoot, "tests", "open-ena-inference-browser-smoke.mjs");
const workflowPath = join(projectRoot, ".github", "workflows", "open-ena-ci.yml");

test("inference smoke follows endpoint inference and the current V3 trajectory workbench", () => {
  const source = readFileSync(smokePath, "utf8");
  const workflow = readFileSync(workflowPath, "utf8");

  assert.match(source, /let dialogHandlerInstalled = false;/u);
  assert.match(source, /const installDialogHandler = !dialogHandlerInstalled;/u);
  assert.match(
    source,
    /installDialogHandler[\s\S]*?page\.on\("dialog", \(dialog\) => \{[\s\S]*?dialog\.accept\(\)\.catch\([\s\S]*?already handled/u,
    "the smoke must install one persistent dialog handler for the browser session",
  );
  assert.match(source, /if \(installDialogHandler\) dialogHandlerInstalled = true;/u);
  assert.match(source, /response\.status >= 200 && response\.status < 400/u);
  assert.doesNotMatch(source, /response\.status >= 200 && response\.status < 500/u);

  assert.match(source, /run explicit Endpoint Mann-Whitney and inspect consumers/u);
  assert.match(source, /run current V3 trajectory inference envelope/u);
  assert.match(source, /open-ena-longitudinal-v3-workbench/u);
  assert.match(source, /open-ena-longitudinal-v3-inference/u);
  assert.match(source, /Analysis JSON/u);
  for (const family of [
    "independent-period",
    "paired-periods",
    "repeated-periods",
    "path-comparison",
  ]) assert.match(source, new RegExp(family, "u"));
  for (const testName of [
    "mann-whitney",
    "wilcoxon-signed-rank",
    "friedman",
    "permutation",
  ]) assert.match(source, new RegExp(testName, "u"));

  assert.doesNotMatch(source, /run selected-period trajectory Mann-Whitney/u);
  assert.doesNotMatch(source, /run paired-period Wilcoxon signed-rank/u);
  assert.doesNotMatch(source, /prove presentation independence and aggregate consumer parity/u);
  assert.doesNotMatch(source, /\.ena-inference-ledger[\s\S]*?trajectory-independent-period/u);

  const longitudinalStep = workflow.indexOf("npm run test:browser:longitudinal-v3");
  const inferenceStep = workflow.indexOf("node tests/open-ena-inference-browser-smoke.mjs");
  assert.ok(longitudinalStep >= 0 && inferenceStep > longitudinalStep);
});
