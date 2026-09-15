import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";

const projectRoot = process.cwd();

function source(relativePath: string) {
  return readFileSync(join(projectRoot, relativePath), "utf8");
}

const workspace = source("components/open-ena/OpenEnaWorkspace.tsx");
const controller = source("components/open-ena/model-v3/workspace-controller.ts");
const css = source("app/globals.css");
const browser = source("tests/open-ena-stale-rebuild-cue-browser.mjs");
const workflow = source(".github/workflows/open-ena-ci.yml");
const pkg = JSON.parse(source("package.json"));

test("CSV/XLSX admit keeps current drafts, cues Rebuild, and never auto-runs", () => {
  assert.match(workspace, /function installSource\([^)]*drafts = state\.model\.drafts/u);
  assert.match(workspace, /installSource\(value, value\.drafts, true\)/u);
  assert.doesNotMatch(workspace, /emptyWorkspaceDraftsV3/u);
  assert.match(controller, /rebuildCue = !action\.autoRun && retainedResult/u);
  assert.match(controller, /reason: "source-replacement"/u);
  assert.match(controller, /action\.action\.type === "mark-running" && next\.rebuildCue/u);
  assert.match(controller, /rebuildCue: null/u);
});

test("stale source-replacement UI focuses a one-click Rebuild affordance", () => {
  assert.match(workspace, /modelState\.resultStatus === "stale" && rebuildCue/u);
  assert.match(workspace, /data-testid="open-ena-stale-rebuild-run"/u);
  assert.match(workspace, /data-testid="open-ena-stale-rebuild"/u);
  assert.match(workspace, /requestRebuildAfterSourceReplacement/u);
  assert.match(workspace, /modelState\.resultStatus === "stale" \? workspaceCopy\.result\.historicalGeometry : workspaceCopy\.result\.boundGeometry/u);
  assert.match(workspace, /staleRebuildRef\.current \?\? runButtonRef\.current/u);
  assert.match(workspace, /if \(controller\.canRun\) \{\s*controller\.run\(\);/u);
  assert.match(css, /\.ena-stale-rebuild-callout/u);
  assert.match(css, /@keyframes ena-rebuild-cue/u);
  assert.match(css, /prefers-reduced-motion: reduce/u);
  assert.equal(getOpenEnaCopy("en").modelV3.workspace.result.rebuildNow, "Rebuild now");
  assert.equal(getOpenEnaCopy("zh-hant").modelV3.workspace.result.rebuildNow, "立即重新建立");
  assert.equal(getOpenEnaCopy("zh-hans").modelV3.workspace.result.rebuildNow, "立即重新构建");
});

test("the stale-rebuild cue harness proves CSV admit discoverability without silent rebuild", () => {
  assert.equal(pkg.scripts["test:browser:open-ena-stale-rebuild-cue"], "node tests/open-ena-stale-rebuild-cue-browser.mjs");
  assert.match(workflow, /npm run test:browser:open-ena-stale-rebuild-cue/u);
  assert.match(browser, /Confirm types and create typed XLSX/u);
  assert.match(browser, /open-ena-stale-rebuild-run/u);
  assert.match(browser, /window\.jobs\.length === 1/u);
  assert.match(browser, /data-ena-rebuild-cue/u);
  assert.match(browser, /getByTestId\("open-ena-stale-rebuild-run"\)\.click/u);
  assert.match(browser, /window\.jobs\.length === 2/u);
});
