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

test("removing the note leaves source loading and AI consent enforcement intact", () => {
  assert.match(workspace, /loadTrajectorySample/);
  assert.match(workspace, /copy\.data\.trajectorySample/);
  assert.match(workspace, /<OpenEnaAiInterpretation/);
  assert.match(workspace, /disabled=\{!result \|\| resultIsStale \|\| !aiInterpretationRequest \|\| !currentInference\}/);
});
