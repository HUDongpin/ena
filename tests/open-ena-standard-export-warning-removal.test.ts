import { workspaceV3Source as v3, controllerV3Source as owner, renderWorkspaceShellV3 as shell, moduleSourceV3 as moduleV3, functionSourceV3 } from "./helpers/open-ena-workspace-v3-ui";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const workspace = readFileSync(
  join(process.cwd(), "components/open-ena/OpenEnaWorkspace.tsx"),
  "utf8",
);

test("Standard ENA surfaces omit the screenshot-selected identifier warning", () => {
  assert.doesNotMatch(workspace, /copy\.stats\.identityExportWarning/);
});

test("identity export consent and ONA-specific audit notice remain without redundant standard warnings", () => {

  assert.match(v3, /confirmCurrentIdentityBearingExport/);
  assert.match(v3, /copy.ona.exports.auditWarning/);
  assert.match(v3, /window.confirm\(copy.ona.exports.auditConfirmation\)/);
  assert.doesNotMatch(shell(), /class="ena-standard-export-warning"/);

});
