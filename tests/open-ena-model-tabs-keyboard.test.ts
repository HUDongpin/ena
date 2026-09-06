import { workspaceV3Source as v3, controllerV3Source as owner, renderWorkspaceShellV3 as shell, moduleSourceV3 as moduleV3, functionSourceV3 } from "./helpers/open-ena-workspace-v3-ui";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(
  new URL("../components/open-ena/OpenEnaWorkspace.tsx", import.meta.url),
  "utf8",
);

test("accepted Models tabs own the ARIA roving-focus keyboard pattern", () => {

  const tabs = moduleV3("components/open-ena/model-v3/OpenEnaModelTabsV3.tsx");
  assert.match(tabs, /role="tablist"/);
  for (const key of ["ArrowLeft", "ArrowRight", "Home", "End"]) assert.ok(tabs.includes(key));
  assert.match(tabs, /aria-selected/);
  assert.match(tabs, /tabIndex=/);
  assert.match(v3, /<OpenEnaModelTabsV3/);

});

test("Models v3 keyboard coverage uses a real component browser harness", () => {
  const behaviorTest = readFileSync(
    new URL("./open-ena-model-v3-tabs-browser.mjs", import.meta.url),
    "utf8",
  );
  assert.match(behaviorTest, /chromium\.launch\(\{ headless: true \}\)/u);
  for (const key of ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End"]) {
    assert.match(behaviorTest, new RegExp(`\\["${key}"`, "u"));
  }
  assert.match(behaviorTest, /page\.keyboard\.press\(key\)/u);
  assert.match(behaviorTest, /page\.keyboard\.press\("Escape"\)/u);
  assert.match(behaviorTest, /document\.activeElement/u);
  assert.match(behaviorTest, /button button/u);
});
