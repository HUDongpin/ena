import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const workspace = readFileSync(
  join(process.cwd(), "components/open-ena/OpenEnaWorkspace.tsx"),
  "utf8",
);

test("the rail displays the requested jENA 0.7.0 label without changing runtime provenance", () => {
  assert.match(
    workspace,
    /const JENA_RAIL_DISPLAY_VERSION = JENA_RUNTIME_VERSION\.split\("-", 1\)\[0\];/,
  );
  assert.match(workspace, />jENA \{JENA_RAIL_DISPLAY_VERSION\}<\/a>/);
  assert.doesNotMatch(workspace, />jENA \{JENA_RUNTIME_VERSION\} · \{copy\.workspace\.jenaSourceLabel\}<\/a>/);
  assert.match(
    workspace,
    /jenaSourceAriaLabel\(JENA_RUNTIME_VERSION, JENA_SOURCE_COMMIT\.slice\(0, 7\)\)/,
  );
  assert.match(workspace, /href=\{JENA_SOURCE_URL\}/);
});
