import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import { bindResultV3 } from "../lib/open-ena/model-v3/result-binding";
import { buildContrastV3 } from "../lib/open-ena/contrasts";
import { presentBoundGroupDisplayV3, presentRetainedEndpointContrastV3 } from "../lib/open-ena/bound-presentation-v3";
import { canonicalJsonV3 } from "../lib/open-ena/model-v3/canonical-json";
import OpenEnaGroupContrast from "../components/open-ena/OpenEnaGroupContrast";
import { DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS } from "../lib/open-ena/group-display";

async function fixture(modify?: Parameters<typeof bindingFixtureV3>[1]) {
  const f = await bindingFixtureV3(undefined, modify);
  const result = await bindResultV3(f.plan, runStandardPlanV3(f.plan), {
    processedRows: f.plan.rows.length, maximumBufferedRows: 0, numericCellsAllocated: 120,
    peakBytesObservedOrBounded: 10240, observationMethod: "exact-counters-and-conservative-byte-bound",
  }, f.compiled.diagnostics);
  const groups = result.executionProvenance.identityDictionary.groups;
  return { ...f, result, groups };
}

function render(display: ReturnType<typeof presentBoundGroupDisplayV3>) {
  return renderToStaticMarkup(createElement(OpenEnaGroupContrast, {
    contrast: display.contrast, groupDisplay: display, edgeThreshold: 0, showPoints: true, showNetworks: true,
    showLabels: true, showGroupLabels: true, showUnitLabels: false, showVariance: true,
    edgeScale: 1, pointScale: 1, plotZoom: 1.3, flipX: true, flipY: false,
    nodeLayout: new Map([[display.contrast.nodes[0].code, new Map([["SVD1", 0.4], ["SVD2", 0.2]])]]),
  }));
}

test("retained endpoint plots are identical to current validated plots without requiring a new plan", async () => {
  const { result, plan, groups } = await fixture();
  const before = canonicalJsonV3(result);
  const axes = ["SVD1", "SVD2"] as const;
  const controls = { axes, primaryGroup: groups[0].fields[0].value, secondaryGroup: groups[1].fields[0].value };
  const current = await buildContrastV3(result, plan, controls);
  const retained = presentRetainedEndpointContrastV3(result, groups[0].token, groups[1].token, axes);
  assert.ok(retained);
  const hiddenUnit = result.executionProvenance.identityDictionary.units[0].token;
  const settings = { [groups[0].token]: { ...DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS, includeHiddenPoints: false } };
  for (const hidden of [[], [JSON.stringify([groups[0].token, hiddenUnit])]]) {
    const currentDisplay = presentBoundGroupDisplayV3(current, settings, hidden, false);
    const retainedDisplay = presentBoundGroupDisplayV3(retained, settings, hidden, false);
    assert.deepEqual(retainedDisplay, currentDisplay);
    assert.equal(render(retainedDisplay), render(currentDisplay), "same scientific geometry, frame, text and glyph sizes");
  }
  assert.equal(canonicalJsonV3(result), before);
  assert.equal("binding" in retained, false, "a plot presenter does not grant current-result authority");
  await assert.rejects(() => buildContrastV3(result, null, controls), /plan/i);
});

test("retained display can swap declared groups and axes without changing fitted coordinates", async () => {
  const { result, groups } = await fixture();
  const before = canonicalJsonV3(result);
  const original = presentRetainedEndpointContrastV3(result, groups[0].token, groups[1].token, ["SVD1", "SVD2"]);
  const swapped = presentRetainedEndpointContrastV3(result, groups[1].token, groups[0].token, ["SVD1", "SVD2"]);
  const axes = presentRetainedEndpointContrastV3(result, groups[0].token, groups[1].token, ["SVD2", "SVD1"]);
  assert.ok(original && swapped && axes);
  assert.deepEqual(original.nodes, swapped.nodes);
  assert.deepEqual(original.officialPlotFrame, swapped.officialPlotFrame);
  assert.equal(swapped.primary.name, original.secondary.name);
  assert.equal(swapped.secondary.name, original.primary.name);
  original.edges.forEach((edge, index) => assert.equal(swapped.edges[index].signedDifference, -edge.signedDifference));
  assert.deepEqual(axes.nodes, original.nodes.map(node => ({ ...node, x: node.y, y: node.x })));
  assert.equal(canonicalJsonV3(result), before);
});

test("retained endpoint plotting requires two distinct declared groups and supported retained axes", async () => {
  const { result, groups } = await fixture();
  for (const pair of [[null, groups[1].token], [groups[0].token, "unknown-group"], [groups[0].token, groups[0].token]]) {
    assert.equal(presentRetainedEndpointContrastV3(result, pair[0], pair[1], ["SVD1", "SVD2"]), null);
  }
  for (const axes of [[], ["SVD1"], ["SVD1", "SVD1"], ["SVD1", "unsupported"], ["SVD1", "SVD2", "SVD3"]]) {
    assert.equal(presentRetainedEndpointContrastV3(result, groups[0].token, groups[1].token, axes), null);
  }
});

test("ungrouped and trajectory results keep their own plot semantics", async () => {
  const ungrouped = await fixture(draft => { draft.groupColumn = null; });
  assert.equal(presentRetainedEndpointContrastV3(ungrouped.result, null, null, ["SVD1", "SVD2"]), null);
  const trajectory = await fixture((draft, data) => {
    draft.model = "SeparateTrajectory";
    draft.horizonColumns = ["unit", "horizon"];
    data.rows = data.rows.flatMap(row => [1, 2].map(time => ({ ...row, horizon: `h${time}`, time, A: Number(row.A) + time })));
  });
  assert.equal(presentRetainedEndpointContrastV3(trajectory.result, trajectory.groups[0].token, trajectory.groups[1].token, ["SVD1", "SVD2"]), null);
});
