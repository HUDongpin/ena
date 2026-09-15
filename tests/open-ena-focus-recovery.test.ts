import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { nextAnalysisSetRemovalFocusId } from "../lib/open-ena/analysis-set-focus";

const projectRoot = process.cwd();

function source(relativePath: string) {
  return readFileSync(join(projectRoot, relativePath), "utf8");
}

const workspace = source("components/open-ena/OpenEnaWorkspace.tsx");
const plotTools = source("components/open-ena/OpenEnaPersistentPlotTools.tsx");
const browser = source("tests/open-ena-focus-recovery-browser.mjs");
const workflow = source(".github/workflows/open-ena-ci.yml");
const pkg = JSON.parse(source("package.json"));

test("Plot Settings Escape and Analysis Set Remove share delayed focus restore", () => {
  assert.equal(nextAnalysisSetRemovalFocusId(["only"], "only", true), "open-ena-capture-set");
  assert.equal(nextAnalysisSetRemovalFocusId(["only"], "only", false), "open-ena-sets-heading");
  assert.equal(nextAnalysisSetRemovalFocusId(["first", "last"], "first", true), "open-ena-set-remove-last");
  assert.match(plotTools, /export function scheduleOpenEnaDomFocusRestore/);
  assert.match(plotTools, /pendingTriggerRestoreRef\.current = true/);
  assert.match(plotTools, /if \(!settingsOpen\) pendingTriggerRestoreRef\.current = false/);
  assert.match(plotTools, /window\.requestAnimationFrame\(\(\) => \{\s*inner = window\.requestAnimationFrame/);
  assert.match(workspace, /scheduleOpenEnaDomFocusRestore/);
  assert.match(workspace, /nextAnalysisSetRemovalFocusId/);
  assert.match(workspace, /id="open-ena-capture-set"/);
  assert.match(workspace, /id=\{`open-ena-set-remove-\$\{set\.id\}`\}/);
  assert.match(workspace, /pendingSetFocusIdRef\.current = nextAnalysisSetRemovalFocusId/);
});

test("the focus-recovery harness proves Escape and Remove under Strict Mode", () => {
  assert.equal(pkg.scripts["test:browser:open-ena-focus-recovery"], "node tests/open-ena-focus-recovery-browser.mjs");
  assert.match(workflow, /npm run test:browser:open-ena-focus-recovery/u);
  assert.match(browser, /viewport:\s*\{\s*width:\s*1440,\s*height:\s*900\s*\}/u);
  assert.match(browser, /<React\.StrictMode>/u);
  assert.match(browser, /keyboard\.press\("Escape"\)/u);
  assert.match(browser, /keyboard\.press\("Enter"\)/u);
  assert.match(browser, /Minimum edge weight/u);
  assert.match(browser, /aria-label"\) === "Plot Settings"/u);
  assert.match(browser, /activeElement\?\.id === "open-ena-capture-set"/u);
  assert.match(browser, /document\.activeElement\?\.tagName\), "BODY"/u);
});
