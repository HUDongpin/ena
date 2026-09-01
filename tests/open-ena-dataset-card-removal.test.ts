import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const workspace = readFileSync(
  join(process.cwd(), "components/open-ena/OpenEnaWorkspace.tsx"),
  "utf8",
);
const styles = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

test("Data omits the screenshot-selected active-dataset summary and preview card", () => {
  assert.doesNotMatch(workspace, /className="ena-dataset-card"/);
  assert.doesNotMatch(workspace, /className="ena-dataset-card-title"/);
  assert.doesNotMatch(workspace, /className="ena-data-preview"/);
  assert.doesNotMatch(workspace, /aria-label="Dataset preview"/);
  assert.doesNotMatch(styles, /\.ena-dataset-card\b/);
  assert.doesNotMatch(styles, /\.ena-data-preview\b/);
});

test("removing the preview leaves loaded-dataset state and the empty state intact", () => {
  assert.match(workspace, /const \[dataset, setDataset\]/);
  assert.match(workspace, /const headers = dataset\?\.headers \?\? \[\]/);
  assert.match(workspace, /className="ena-no-dataset"/);
  assert.match(styles, /\.ena-no-dataset\s*\{/);
});
