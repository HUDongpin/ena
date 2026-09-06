import { workspaceV3Source as v3, controllerV3Source as owner, renderWorkspaceShellV3 as shell, moduleSourceV3 as moduleV3, functionSourceV3 } from "./helpers/open-ena-workspace-v3-ui";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const workspace = readFileSync(
  join(process.cwd(), "components/open-ena/OpenEnaWorkspace.tsx"),
  "utf8",
);
const styles = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

test("Data omits the screenshot-selected local-computation note card", () => {
  assert.doesNotMatch(workspace, /className="ena-local-note"/);
  assert.doesNotMatch(workspace, /copy\.data\.local/);
  assert.doesNotMatch(styles, /\.ena-local-note\b/);
});

test("source loading remains reachable and AI retains explicit reviewed-payload consent", () => {

  assert.match(shell(), />Load sample<\/button>/);
  assert.match(shell(), /aria-label="Open coded CSV or XLSX"/);
  assert.match(moduleV3("components/open-ena/OpenEnaAiInterpretation.tsx"), /data-ena-ai-consent="explicit"/);
  assert.match(moduleV3("components/open-ena/OpenEnaAiInterpretation.tsx"), /!consentGranted/);

});
