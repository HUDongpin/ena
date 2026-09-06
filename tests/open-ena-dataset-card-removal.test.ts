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

test("Data omits the screenshot-selected active-dataset summary and preview card", () => {
  assert.doesNotMatch(workspace, /className="ena-dataset-card"/);
  assert.doesNotMatch(workspace, /className="ena-dataset-card-title"/);
  assert.doesNotMatch(workspace, /className="ena-data-preview"/);
  assert.doesNotMatch(workspace, /aria-label="Dataset preview"/);
  assert.doesNotMatch(styles, /\.ena-dataset-card\b/);
  assert.doesNotMatch(styles, /\.ena-data-preview\b/);
});

test("source installation retains dataset ownership and a meaningful empty-state entry", () => {

  assert.match(owner, /dataset: input\?\.dataset \?\? null/);
  assert.match(owner, /case "install-source"/);
  assert.match(v3, /dataset.name.*dataset.rows.length/);
  assert.match(shell(), /open-ena-empty-data-view/);
  assert.match(shell(), /Open a CSV or XLSX file/);

});
