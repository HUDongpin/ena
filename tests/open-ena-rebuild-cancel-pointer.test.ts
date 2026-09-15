import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();

function source(relativePath: string) {
  return readFileSync(join(projectRoot, relativePath), "utf8");
}

function firstRuleBody(value: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return value.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`, "u"))?.[1] ?? "";
}

function declaredZIndex(body: string) {
  const value = body.match(/z-index:\s*(-?\d+|auto);/u)?.[1];
  assert.ok(value && value !== "auto", `rule must declare a numeric stacking level: ${body}`);
  return Number(value);
}

const workspace = source("components/open-ena/OpenEnaWorkspace.tsx");
const css = source("app/globals.css");
const browser = source("tests/open-ena-rebuild-cancel-pointer-browser.mjs");
const workflow = source(".github/workflows/open-ena-ci.yml");
const pkg = JSON.parse(source("package.json"));

test("rebuild Cancel remains a real keyboard-activatable button above plot stacking", () => {
  assert.match(
    workspace,
    /data-testid="open-ena-cancel-run"[^>]*onClick=\{controller\.cancel\}/u,
  );
  assert.match(
    workspace,
    /<button type="button"[^>]*ena-model-cancel-button[^>]*>\{workspaceCopy\.cancelRun\}<\/button>/u,
  );
  assert.doesNotMatch(
    workspace,
    /ena-model-cancel-button[^>]*tabIndex=\{-1\}/u,
    "Cancel must keep default button keyboard activation",
  );
  assert.match(workspace, /className="ena-model-run-progress"/u);
});

test("plot overlay stacking stays inside the result figure so Cancel and dialogs remain free", () => {
  const rail = firstRuleBody(css, ".ena-tool-rail");
  const panel = firstRuleBody(css, ".ena-control-panel");
  const visual = firstRuleBody(css, ".ena-visual-workspace");
  const comparison = firstRuleBody(css, ".open-ena-set-comparison");
  const cancel = firstRuleBody(css, ".ena-model-cancel-button");
  const progress = firstRuleBody(css, ".ena-model-run-progress");
  const sidePlotActions = css.match(
    /\.open-ena-group-contrast \.ena-set-side-plots \.ena-official-panel-actions\s*\{([^}]*)\}/u,
  )?.[1] ?? "";

  const cancelZ = declaredZIndex(cancel);
  const progressZ = declaredZIndex(progress);
  const plotActionZ = Number(sidePlotActions.match(/z-index:\s*(\d+);/u)?.[1] ?? "0");

  assert.doesNotMatch(rail, /z-index:/u, "the rail must not steal viewport clicks from fallback dialogs");
  assert.doesNotMatch(
    panel,
    /z-index:/u,
    "the control panel must not trap position:fixed code-color fallback overlays",
  );
  assert.doesNotMatch(visual, /z-index:/u);
  assert.doesNotMatch(
    visual,
    /isolation:/u,
    "the research surface must not isolate position:fixed 3D fullscreen descendants",
  );
  assert.match(comparison, /isolation:\s*isolate;/u, "plot chrome must stay inside the result figure stacking context");
  assert.ok(plotActionZ >= 7, "side-plot Remove keeps its overlay stacking inside the result figure");
  assert.ok(cancelZ > plotActionZ && progressZ > plotActionZ);
  assert.doesNotMatch(
    css,
    /\.ena-official-panel-actions[^{]*\{[^}]*pointer-events:\s*none/u,
    "Remove Plot must keep pointer activation when Cancel is not showing",
  );
});

test("the rebuild-cancel pointer harness proves the hit target and preserves the prior result", () => {
  assert.equal(pkg.scripts["test:browser:open-ena-rebuild-cancel-pointer"], "node tests/open-ena-rebuild-cancel-pointer-browser.mjs");
  assert.match(workflow, /npm run test:browser:open-ena-rebuild-cancel-pointer/u);
  assert.match(browser, /viewport:\s*\{\s*width:\s*1440,\s*height:\s*900\s*\}/u);
  assert.match(browser, /elementFromPoint/u);
  assert.match(browser, /getByTestId\("open-ena-cancel-run"\)/u);
  assert.match(browser, /force:\s*false/u);
  assert.match(browser, /keyboard\.press\("Enter"\)/u);
  assert.match(browser, /data-ena-panel-action="remove"/u);
  assert.match(browser, /signal\.aborted/u);
  assert.match(browser, /data-result-status/u);
});
