import assert from "node:assert/strict";
import test from "node:test";
import { trajectoryPeriodColorsV3, trajectoryCentroidDescriptionV3 } from "../lib/open-ena/trajectory-style-v3";

test("trajectory periods reproduce the reference's bright R hcl viridis colors", () => {
  assert.deepEqual(trajectoryPeriodColorsV3(3), ["#007D97", "#00BC80", "#D0E02F"]);
  assert.deepEqual(trajectoryPeriodColorsV3(1), ["#00BC80"]);
  assert.deepEqual(trajectoryPeriodColorsV3(0), []);
  assert.equal(trajectoryPeriodColorsV3(15).length, 15);
});

test("centroid descriptions expose asymmetric bounds and unavailable intervals honestly", () => {
  const text = trajectoryCentroidDescriptionV3({ group: "G", horizon: "TP2", n: 3, intervals: {
    SVD1: { status: "estimable", lower: -0.3, upper: 0.7, sampleSize: 3, finiteReplicates: 500 },
    SVD2: { status: "not-estimable", reason: "insufficient-finite-draws", sampleSize: 3, finiteReplicates: 300 },
  } });
  assert.match(text, /95%/u);
  assert.match(text, /-0\.3.*0\.7/u);
  assert.match(text, /SVD2.*unavailable/u);
  assert.match(text, /not a joint confidence region/u);
});
