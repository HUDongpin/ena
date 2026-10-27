import assert from "node:assert/strict";
import test from "node:test";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import { bindResultV3 } from "../lib/open-ena/model-v3/result-binding";
import type { BoundStandardResultV3 } from "../lib/open-ena/model-v3/types";
import { buildTrajectoryPresentationV3, buildTrajectoryUncertaintyPopulationV3 } from "../lib/open-ena/trajectory-presentation-v3";
import { openEnaGroupUnitKey } from "../lib/open-ena/group-display";

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
