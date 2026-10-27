import test from "node:test";
import assert from "node:assert/strict";
import { trajectoryLegendExportLayoutV3 } from "../lib/open-ena/trajectory-legend-export-v3";
import type { buildTrajectoryPresentationV3 } from "../lib/open-ena/trajectory-presentation-v3";

function fixture(): ReturnType<typeof buildTrajectoryPresentationV3> {
  return { points: [], paths: [], centroidPaths: [], disclosure: "", showDirection: true, showConfidenceIntervals: true, uncertaintyStatus: "ready",
    horizonStyles: [{ horizonKey: "h1", label: "TP1", detail: "TP1", color: "#007D97" }],
    centroids: [{ key: "g/h1", group: "G", horizon: "TP1", horizonShortLabel: "TP1", horizonKey: "h1", n: 1, point: { SVD1: 0, SVD2: 0 },
      intervals: { SVD1: { status: "not-estimable", reason: "insufficient-units", sampleSize: 1, finiteReplicates: 500 } } }] };
}

test("image legend discloses individual unavailable CI even when the bootstrap job completed", () => {
  const result = trajectoryLegendExportLayoutV3(fixture(), [], "en", 920);
  assert.match(result.items.map(i => i.text).join(" "), /Some confidence intervals are unavailable/u);
  assert.doesNotMatch(result.items.map(i => i.text).join(" "), /Unit-history resamples|seed 2026|not a joint confidence region/u);
});

test("hidden CI omits method claims and long period labels remain inside export layout", () => {
  const f = fixture(); f.showConfidenceIntervals = false;
  f.horizonStyles[0].label = "Long period label ".repeat(20);
  const result = trajectoryLegendExportLayoutV3(f, [], "zh-hans", 400);
  assert.ok(result.height > 200);
  assert.ok(result.items.every(item => item.x >= 0 && item.x < 400 && item.y < result.height));
  assert.doesNotMatch(result.items.map(i => i.text).join(" "), /500|95%/u);
});

test("hiding centroid paths does not claim disabled intervals are statistically unavailable", () => {
  const f = fixture(); f.uncertaintyStatus = "disabled"; f.centroids = [];
  const result = trajectoryLegendExportLayoutV3(f, [], "en", 920);
  assert.doesNotMatch(result.items.map(i => i.text).join(" "), /unavailable/u);
});

test("export legend uses typed short Group names and includes actual glyph descriptions", () => {
  const f = { ...fixture(), groupLabels: { 'Group Group=G2': 'G2' } };
  const groups = [{ name: 'Group Group=G2', color: '#cc423a', count: 3, pointCount: 9, meanPoint: {}, meanWeights: {} }];
  const layout = trajectoryLegendExportLayoutV3(f, groups, 'en', 920);
  assert.ok(layout.items.some(item => item.text === 'G2'));
  assert.ok(!layout.items.some(item => item.text === 'Group Group=G2'));
  assert.deepEqual(layout.items.filter(item => item.symbol).map(item => item.symbol), ['centroid', 'unit', 'ci']);
  assert.ok(layout.items.some(item => item.text === '95% bootstrap CI'));
  assert.ok(!layout.items.some(item => item.text.includes('Per-axis')));
});
