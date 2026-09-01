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

test("coded-data entry points and reference-package export remain available", () => {
  assert.match(workspace, /accept="\.csv,\.xlsx,/);
  assert.match(workspace, /void loadSample\(\)/);
  assert.match(workspace, /void loadTrajectorySample\(\)/);
  assert.match(workspace, /buildReferenceRotationPackage/);
  assert.match(workspace, /referenceRotationJson/);
});
