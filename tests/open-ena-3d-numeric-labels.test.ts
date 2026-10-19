import assert from "node:assert/strict";
import test from "node:test";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import { bindResultV3 } from "../lib/open-ena/model-v3/result-binding";
import { presentBoundResultV3 } from "../lib/open-ena/bound-presentation-v3";
import { compileOpenEna3dPlotSpec } from "../lib/open-ena/plot3d";

async function fixture() {
  const f = await bindingFixtureV3(undefined, (_draft, data) => {
    for (const row of data.rows) row.group = "G";
  });
  const bound = await bindResultV3(f.plan, runStandardPlanV3(f.plan), {
    processedRows: f.plan.rows.length, maximumBufferedRows: 0, numericCellsAllocated: 120,
    peakBytesObservedOrBounded: 10240, observationMethod: "exact-counters-and-conservative-byte-bound",
  }, f.compiled.diagnostics);
  const { result } = presentBoundResultV3(bound);
  const [xDimension, yDimension, zDimension] = result.dimensions;
  return {
    result, groupColumn: "Group", xDimension, yDimension, zDimension,
    camera: "isometric" as const, showPoints: true, showNetworks: true, showLabels: true,
    showUnitLabels: false, showVariance: true, showTrajectories: false,
    edgeScale: 1, edgeThreshold: 0, pointScale: 1, plotZoom: 1, flipX: false, flipY: false,
  };
}

test("3D coordinate labels preserve exponent digits for Unit, mean and Code hovers", async () => {
  const props = await fixture();
  // Exercise finite display coordinates directly without altering bound science.
  for (const value of [1e-10, -2.34567e-10, 1e-20, -1e-20, 1e-7, 1.234567, 1.2, 0, 10]) {
    const result = structuredClone(props.result);
    result.set.points[0][props.xDimension] = value;
    result.groups[0].meanPoint[props.xDimension] = value;
    result.set.rotation.nodes![0][props.xDimension] = value;
    const before = JSON.stringify(result);
    const spec = compileOpenEna3dPlotSpec({ ...props, result });
    for (const role of ["unit-points", "group-mean", "code-node"]) {
      const trace = spec.data.find(candidate => candidate.meta.role === role)!;
      assert.equal(trace.x[0], value);
      const displayed = trace.customdata![0]!.match(new RegExp(`${props.xDimension}: ([^<]+)`))?.[1];
      assert.equal(Number(displayed), Number(value.toPrecision(6)), `${role}: ${value} displayed as ${displayed}`);
    }
    assert.equal(JSON.stringify(result), before);
  }
});

test("3D network weight labels preserve small scientific-notation magnitudes", async () => {
  const props = await fixture();
  const edgeName = props.result.set.adjacencyKey[0].name;
  props.result.groups[0].meanWeights[edgeName] = 1.23456e-10;
  const spec = compileOpenEna3dPlotSpec(props);
  const trace = spec.data.find(candidate => candidate.meta.role === "network-edge" && candidate.meta.edgeName === edgeName)!;
  const displayed = trace.customdata![0]!.match(/mean weight ([^<]+)/)?.[1];
  assert.equal(trace.meta.edgeValue, 1.23456e-10);
  assert.equal(Number(displayed), trace.meta.edgeValue, `edge weight displayed as ${displayed}`);
});
