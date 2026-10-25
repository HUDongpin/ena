import assert from "node:assert/strict";
import test from "node:test";
import { enaCorrelations } from "jena-js";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import { bindResultV3 } from "../lib/open-ena/model-v3/result-binding";
import { boundScientificAdapterV3 } from "../lib/open-ena/inference-consumers-v3";
import * as uncertainty from "../lib/open-ena/uncertainty";

async function api() {
  const module = await import("../lib/open-ena/endpoint-statistics-2d-v3").catch(() => null);
  assert.equal(typeof module?.calculateEndpointGoodness2DV3, "function", "2D endpoint goodness must be available");
  assert.equal(typeof module?.calculateEndpointWelch2DV3, "function", "2D endpoint Welch comparisons must be available");
  return module!;
}
async function fixture(hash = "a".repeat(64)) {
  const f = await bindingFixtureV3(hash);
  const result = await bindResultV3(f.plan, runStandardPlanV3(f.plan), {
    processedRows: f.plan.rows.length, maximumBufferedRows: 0,
    numericCellsAllocated: 120, peakBytesObservedOrBounded: 10240,
    observationMethod: "exact-counters-and-conservative-byte-bound",
  }, f.compiled.diagnostics);
  return { ...f, result };
}

test("two-sided Student t tails support Welch's fractional df and avoid cancellation", () => {
  const p = Reflect.get(uncertainty, "studentTTwoSidedP") as (t: number, df: number) => number;
  assert.equal(typeof p, "function");
  assert.equal(p(0, 8.5), 1);
  assert.ok(Math.abs(p(1, 1) - 0.5) < 1e-12);
  assert.ok(Math.abs(p(2, 2) - 0.183503419072274) < 1e-12);
  assert.equal(p(3.2, 81.162), p(-3.2, 81.162));
  assert.ok(p(30, 100) > 0 && p(30, 100) < 1e-40);
  assert.throws(() => p(1, 0), /positive/i);
});

test("Goodness of Fit pairs each Unit with its own centroid in original source order", async () => {
  const a = await api(), f = await fixture();
  const axes = f.result.executionProvenance.projection.estimableAxes.slice(0, 2) as [string, string];
  const actual = await a.calculateEndpointGoodness2DV3(f.result, f.plan, axes);
  assert.equal(actual.status, "available");
  const names = new Map(f.plan.identityDictionary.units.map(u => [u.token, u.displayLabel]));
  const first = new Map<string, number>();
  for (const row of f.plan.rows) first.set(names.get(row.unitToken)!, Math.min(first.get(names.get(row.unitToken)!) ?? Infinity, row.sourceRowIndex));
  const set = boundScientificAdapterV3(f.result, axes).set;
  const indices = set.points.map((_, i) => i).sort((i, j) => first.get(String(set.points[i].ENA_UNIT))! - first.get(String(set.points[j].ENA_UNIT))!);
  const expected = enaCorrelations({ ...set, points: indices.map(i => set.points[i]), centroids: indices.map(i => set.centroids![i]) }, axes);
  assert.deepEqual(actual.rows.map(r => [r.axis, r.pearson, r.spearman]), expected.map(r => [r.dimension, r.pearson, r.spearman]));
  assert.equal(actual.unitCount, 5);
  assert.deepEqual(actual.binding, f.result.binding);
  await assert.rejects(() => a.calculateEndpointGoodness2DV3(f.result, f.plan, [axes[0], axes[0]]), /distinct/i);
  await assert.rejects(() => a.calculateEndpointGoodness2DV3(f.result, f.plan, [axes[0], "not-an-axis"]), /supported/i);
});

test("2D statistics reject stale plans and retain only the selected comparison groups", async () => {
  const a = await api(), f = await fixture(), other = await fixture("b".repeat(64));
  const axes = f.result.executionProvenance.projection.estimableAxes.slice(0, 2) as [string, string];
  const controls = { axes, primaryGroup: { type: "string" as const, value: "Control" }, secondaryGroup: { type: "string" as const, value: "Treatment" } };
  await assert.rejects(() => a.calculateEndpointGoodness2DV3(f.result, other.plan, axes), /stale/i);
  await assert.rejects(() => a.calculateEndpointWelch2DV3(f.result, other.plan, controls), /stale/i);
  const forward = await a.calculateEndpointWelch2DV3(f.result, f.plan, controls);
  const backward = await a.calculateEndpointWelch2DV3(f.result, f.plan, { ...controls, primaryGroup: controls.secondaryGroup, secondaryGroup: controls.primaryGroup });
  assert.equal(forward.rows.length, 2);
  assert.equal(forward.coordinateDecimalPlaces, 4);
  const primaryPoints = f.result.set.points.filter(p => p.Group === forward.groupSelection.primary);
  assert.equal(forward.rows[0].meanPrimary, primaryPoints.reduce((sum, p) => sum + Number(Number(p[axes[0]]).toFixed(4)) / primaryPoints.length, 0));
  for (let i = 0; i < 2; i++) {
    assert.equal(forward.rows[i].nPrimary, 2);
    assert.equal(forward.rows[i].nSecondary, 2);
    assert.equal(forward.rows[i].status, "available");
    assert.ok(Math.abs(forward.rows[i].t! + backward.rows[i].t!) < 1e-12);
    assert.equal(forward.rows[i].p, backward.rows[i].p);
    assert.equal(forward.rows[i].cohensD, backward.rows[i].cohensD);
  }
});
