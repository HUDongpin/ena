import assert from "node:assert/strict";
import test from "node:test";
import { defaultOpenEnaCloudPresentation, validateOpenEnaCloudPresentation } from "../lib/open-ena/cloud-workspace-presentation";
import { trajectoryCopyV3 } from "../lib/open-ena/trajectory-copy-v3";
import { locales } from "../lib/i18n";

test("new trajectory controls default on and round-trip without rewriting older saved views", () => {
  const defaults = defaultOpenEnaCloudPresentation();
  assert.equal(defaults.showTrajectoryDirection, true);
  assert.equal(defaults.showTrajectoryConfidenceIntervals, true);
  assert.equal(validateOpenEnaCloudPresentation({ ...defaults, showTrajectoryConfidenceIntervals: false }).showTrajectoryConfidenceIntervals, false);
  const legacy = { ...defaults }; delete legacy.showTrajectoryDirection; delete legacy.showTrajectoryConfidenceIntervals;
  const before = JSON.stringify(legacy);
  const validated = validateOpenEnaCloudPresentation(legacy);
  assert.equal(JSON.stringify(validated), before, "legacy shape and integrity must be preserved");
  assert.throws(() => validateOpenEnaCloudPresentation({ ...defaults, showTrajectoryDirection: "true" }));
});

test("all supported locales provide trajectory CI controls and an explicit method explanation", () => {
  for (const locale of locales) {
    const copy = trajectoryCopyV3(locale);
    assert.ok(copy.showCi && copy.showDirection && copy.periods && copy.groups);
    assert.match(copy.method, /500/u);
    assert.match(copy.method, /2026/u);
  }
});
