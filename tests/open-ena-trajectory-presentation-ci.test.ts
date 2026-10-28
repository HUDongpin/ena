import assert from "node:assert/strict";
import test from "node:test";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import { bindResultV3 } from "../lib/open-ena/model-v3/result-binding";
import type { BoundStandardResultV3 } from "../lib/open-ena/model-v3/types";
import { buildTrajectoryPresentationV3, buildTrajectoryUncertaintyPopulationV3 } from "../lib/open-ena/trajectory-presentation-v3";
import { openEnaGroupUnitKey } from "../lib/open-ena/group-display";
import { computeTrajectoryUncertaintyV3 } from "../lib/open-ena/trajectory-uncertainty-v3";
import { sha256TextV3 } from "../lib/open-ena/model-v3/canonical-json";
import { buildPresentationArtifactV3, applyPresentationV3 } from "../lib/open-ena/presentation-artifact-v3";

async function fixture() {
  const f = await bindingFixtureV3(undefined, (draft, data) => {
    draft.model = "SeparateTrajectory";
    data.rows = [[1,2,3],[1,2],[1,3]].flatMap((periods, unit) => periods.map((period, index) => ({
      unit: `u${unit}`, horizon: `h${period}`, time: period, group: "G",
      A: 1 + (unit + period) % 3, B: 1 + (period + unit * 2) % 4, C: 1 + (index * 2 + unit) % 5,
    })));
  });
  const result = await bindResultV3(f.plan, runStandardPlanV3(f.plan), { processedRows: f.plan.rows.length, maximumBufferedRows: 0,
    numericCellsAllocated: 120, peakBytesObservedOrBounded: 10240, observationMethod: "exact-counters-and-conservative-byte-bound" }, f.compiled.diagnostics) as BoundStandardResultV3;
  return result;
}
const settings = { showCentroidPaths: true, endpointsOnly: false, visibleHorizons: null };

test("Horizon filtering preserves full palette and CI population; endpoint-only changes the actual population", async () => {
  const result = await fixture();
  const full = buildTrajectoryPresentationV3(result, settings);
  const lastKey = result.executionProvenance.identityDictionary.horizons.find(h => h.fields[0].value.value === "h3")!.canonicalJson;
  const filtered = buildTrajectoryPresentationV3(result, { ...settings, visibleHorizons: [lastKey] });
  assert.deepEqual(filtered.horizonStyles, full.horizonStyles);
  const a = buildTrajectoryUncertaintyPopulationV3(result, settings);
  const b = buildTrajectoryUncertaintyPopulationV3(result, { ...settings, visibleHorizons: [lastKey], showDirection: false });
  assert.equal(a.populationKey, b.populationKey);
  assert.deepEqual(a.groups, b.groups);
  const end = buildTrajectoryUncertaintyPopulationV3(result, { ...settings, endpointsOnly: true });
  assert.notEqual(end.populationKey, a.populationKey);
  assert.ok(end.groups.flatMap(g => g.units).every(u => u.steps.length === 1));
  assert.equal(full.showConfidenceIntervals, true);
  assert.equal(full.showDirection, true);
});

test("CI population honors hidden summary membership without un-hiding points", async () => {
  const result = await fixture();
  const dictionary = result.executionProvenance.identityDictionary;
  const hidden = openEnaGroupUnitKey(dictionary.groups[0].token, dictionary.units[0].token);
  const excluded = { ...settings, hiddenUnitKeys: [hidden] };
  const included = { ...excluded, groupSettingsByToken: { [dictionary.groups[0].token]: { includeHiddenPoints: true, showUnitPoints: true, showMean: true, showConfidenceIntervals: true, showOutlierIntervals: false } } };
  const a = buildTrajectoryUncertaintyPopulationV3(result, excluded);
  const b = buildTrajectoryUncertaintyPopulationV3(result, included);
  assert.equal(a.groups[0].units.length, 2);
  assert.equal(b.groups[0].units.length, 3);
  assert.notEqual(a.populationKey, b.populationKey);
  assert.equal(buildTrajectoryPresentationV3(result, excluded).points.length, buildTrajectoryPresentationV3(result, included).points.length);
});

test("computed intervals bind to each observed centroid and stale populations never display CI", async () => {
  const result = await fixture(), before = JSON.stringify(result);
  const population = buildTrajectoryUncertaintyPopulationV3(result, settings);
  const uncertainty = computeTrajectoryUncertaintyV3({ axes: population.axes, groups: population.groups, bindingKey: await sha256TextV3(population.populationKey) });
  const baseline = buildTrajectoryPresentationV3(result, settings);
  const displayed = buildTrajectoryPresentationV3(result, settings, { populationKey: population.populationKey, status: "ready", result: uncertainty });
  assert.equal(displayed.uncertaintyStatus, "ready");
  assert.ok(displayed.centroids.every(centroid => Object.keys(centroid.intervals ?? {}).length === population.axes.length));
  for (const centroid of displayed.centroids) {
    const computed = uncertainty.centroids.find(value => value.centroidKey === centroid.key)!;
    assert.equal(computed.n, centroid.n);
    for (const axis of computed.axes) {
      assert.ok(Math.abs(axis.estimate - centroid.point[axis.axis]) < 1e-12);
      const interval = centroid.intervals![axis.axis];
      if (axis.status === "unavailable") assert.equal(interval.status, "not-estimable");
      else {
        assert.notEqual(interval.status, "not-estimable");
        if (interval.status !== "not-estimable") assert.deepEqual([interval.lower, interval.upper], [axis.lower, axis.upper]);
      }
    }
  }
  assert.deepEqual(displayed.centroids.map(({ point, n }) => ({ point, n })), baseline.centroids.map(({ point, n }) => ({ point, n })));
  assert.deepEqual(displayed.points, baseline.points);
  const stale = buildTrajectoryPresentationV3(result, settings, { populationKey: "other-population", status: "ready", result: uncertainty });
  assert.equal(stale.uncertaintyStatus, "pending");
  assert.ok(stale.centroids.every(centroid => centroid.intervals === undefined));
  assert.equal(JSON.stringify(result), before);
});

test("presentation presets preserve the trajectory CI toggle", async () => {
  const result = await fixture();
  const preset = buildPresentationArtifactV3(result, { dimensions: [...result.executionProvenance.projection.estimableAxes].slice(0, 2), hiddenCodes: [], hiddenGroups: [], codeColors: {}, nodeOverrides: [], layerOptions: { showTrajectoryConfidenceIntervals: false } });
  const restored = applyPresentationV3(result.binding.scientificResultSha256, preset);
  assert.equal(restored.status, "applied");
  assert.equal(restored.presentation.layerOptions?.showTrajectoryConfidenceIntervals, false);
});
