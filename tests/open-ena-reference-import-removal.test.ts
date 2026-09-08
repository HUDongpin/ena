import { workspaceV3Source as v3, controllerV3Source as owner, renderWorkspaceShellV3 as shell, moduleSourceV3 as moduleV3, functionSourceV3 } from "./helpers/open-ena-workspace-v3-ui";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();
const workspace = readFileSync(
  join(projectRoot, "components", "open-ena", "OpenEnaWorkspace.tsx"),
  "utf8",
);

test("the Data panel removes the Shared ENA geometry import feature", () => {
  assert.doesNotMatch(workspace, /Shared ENA geometry/);
  assert.doesNotMatch(workspace, /Import reference rotation/);
  assert.doesNotMatch(workspace, /referenceInputRef/);
  assert.doesNotMatch(workspace, /async function openReferenceRotation/);
  assert.doesNotMatch(workspace, /parseRotationReference/);
  assert.doesNotMatch(workspace, /accept="\.json,application\/json"/);
});

test("the Model panel does not retain an unreachable reference-projection option", () => {
  assert.doesNotMatch(workspace, /Project into reference rotation/);
  assert.doesNotMatch(workspace, /const \[rotationReference, setRotationReference\]/);
  assert.doesNotMatch(workspace, /ena-reference-model-note/);
});

test("coded-data entry and native Reference export coexist with explicit artifact previews", () => {

  assert.match(shell(), /aria-label="Open coded CSV or XLSX"/);
  assert.match(shell(), />Load sample<\/button>/);
  assert.match(shell(), />Export Reference<\/button>/);
  assert.match(v3, /<OpenEnaImportPreviewV3/);
  assert.match(v3, /exportReferenceV2\(/);

});
