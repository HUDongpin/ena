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

test("removing the visible warning preserves export confirmation and the ONA-specific notice", () => {
  assert.match(workspace, /copy\.stats\.identityExportConfirmation/);
  assert.match(workspace, /confirmOpenEnaIdentityBearingExport/);
  assert.match(workspace, /confirmCurrentIdentityBearingExport/);
  assert.match(workspace, /copy\.ona\.dataView\.localIdentityWarning/);
});
