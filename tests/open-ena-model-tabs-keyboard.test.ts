import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(
  new URL("../components/open-ena/OpenEnaWorkspace.tsx", import.meta.url),
  "utf8",
);

test("Model tabs implement the ARIA roving-focus keyboard pattern", () => {
  assert.match(
    workspace,
    /const MODEL_TAB_ORDER = \["units", "horizons", "windows", "codes"\] as const/,
    "the visual order must have one canonical keyboard order",
  );
  assert.match(
    workspace,
    /onKeyDown=\{\(event\) => handleModelTabKeyDown\(event, tab\.id\)\}/,
    "every Model tab must delegate keyboard movement",
  );
  assert.match(workspace, /case "ArrowRight":/);
  assert.match(workspace, /case "ArrowDown":/);
  assert.match(workspace, /case "ArrowLeft":/);
  assert.match(workspace, /case "ArrowUp":/);
  assert.match(workspace, /case "Home":/);
  assert.match(workspace, /case "End":/);
  assert.match(
    workspace,
    /setModelTab\(nextTab\)[\s\S]{0,240}querySelector<HTMLButtonElement>[\s\S]{0,180}focus\(\)/,
    "keyboard movement must update selection and move DOM focus to the active tab",
  );
  assert.match(
    workspace,
    /tabIndex=\{modelTab === tab\.id \? 0 : -1\}[\s\S]{0,180}data-model-tab=\{tab\.id\}/,
    "the tablist must retain one roving tab stop",
  );
});
