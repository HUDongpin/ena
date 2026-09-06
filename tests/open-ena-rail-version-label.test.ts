import { workspaceV3Source as v3, controllerV3Source as owner, renderWorkspaceShellV3 as shell, moduleSourceV3 as moduleV3, functionSourceV3 } from "./helpers/open-ena-workspace-v3-ui";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const workspace = readFileSync(
  join(process.cwd(), "components/open-ena/OpenEnaWorkspace.tsx"),
  "utf8",
);

test("rail runtime label is derived from the actual jENA runtime without changing provenance", () => {

  assert.match(shell(), /data-ena-rail-version="true"[^>]*>jENA 0\.7\.0/);
  assert.match(v3, /JENA_RUNTIME_VERSION.split/);

});
