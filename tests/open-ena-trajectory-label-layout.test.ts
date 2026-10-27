import assert from "node:assert/strict";
import test from "node:test";
import * as presentation from "../lib/open-ena/trajectory-presentation-v3";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import { bindResultV3 } from "../lib/open-ena/model-v3/result-binding";
import type { BoundStandardResultV3 } from "../lib/open-ena/model-v3/types";

test("Horizon plot text comes from typed values, including literal prefix-like strings", () => {
  const format = (presentation as Record<string, unknown>).shortHorizonLabelV3;
  assert.equal(typeof format, "function", "trajectory presentation must provide a typed short label formatter");
  const label = format as (fields: Array<{ column: string; value: { type: string; value: string | number | boolean } }>) => string;
  assert.equal(label([{ column: "Period", value: { type: "string", value: "TP2" } }]), "TP2");
  assert.equal(label([{ column: "阶段", value: { type: "string", value: "第二阶段" } }]), "第二阶段");
  assert.equal(label([{ column: "Period", value: { type: "number", value: 2 } }]), "2");
  assert.equal(label([{ column: "Period", value: { type: "string", value: "Horizon Period=TP2 <>&" } }]), "Horizon Period=TP2 <>&");
  assert.equal(label([{ column: "Term", value: { type: "string", value: "秋季" } }, { column: "Period", value: { type: "number", value: 2 } }]), "秋季 · 2");
});

test("Separate and Accumulated trajectory short labels preserve identity, counts and fitted result", async () => {
  for (const model of ["SeparateTrajectory", "AccumulatedTrajectory"] as const) {
    const fixture = await bindingFixtureV3(undefined, (draft, data) => {
      draft.model = model;
      data.rows = [0, 1].flatMap(unit => [1, 2, 3].map(period => ({ unit: `u${unit}`, horizon: `TP${period}`, time: period, group: "G", A: 1 + period, B: 1 + unit, C: 1 + (unit + period) % 3 })));
    });
    const result = await bindResultV3(fixture.plan, runStandardPlanV3(fixture.plan), { processedRows: fixture.plan.rows.length, maximumBufferedRows: 0, numericCellsAllocated: 120, peakBytesObservedOrBounded: 10240, observationMethod: "exact-counters-and-conservative-byte-bound" }, fixture.compiled.diagnostics) as BoundStandardResultV3;
    const before = JSON.stringify(result);
    const view = presentation.buildTrajectoryPresentationV3(result, { showCentroidPaths: true, endpointsOnly: false, visibleHorizons: null });
    assert.deepEqual(new Set(view.centroids.map(c => (c as typeof c & { horizonShortLabel: string }).horizonShortLabel)), new Set(["TP1", "TP2", "TP3"]));
    assert.ok(view.centroids.every(c => c.n === 2 && c.horizon.includes("horizon=TP") && c.key !== c.horizon));
    assert.deepEqual(view.points.map(p => p.ordinal), [0, 1, 2, 0, 1, 2]);
    assert.equal(JSON.stringify(result), before);
  }
});

async function layoutModule() {
  return import("../lib/open-ena/plot-label-layout");
}
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

test("coincident labels are displaced without moving anchors, overlap, or boundary clipping", async () => {
  const { placePlotLabels } = await layoutModule();
  const labels = Array.from({ length: 12 }, (_, i) => ({ id: `point-${i}`, anchor: { x: 230, y: 180 }, width: i < 6 ? 32 : 65, height: 16, priority: i < 6 ? 20 : 10 }));
  const original = structuredClone(labels);
  const bounds = { x: 10, y: 10, width: 460, height: 340 };
  const obstacle = { x: 220, y: 170, width: 20, height: 20 };
  const result = placePlotLabels({ labels, bounds, obstacles: [obstacle] });
  assert.equal([...result.values()].filter(p => p.visible).length, labels.length);
  for (const p of result.values()) {
    assert.ok(p.x >= bounds.x && p.y >= bounds.y && p.x + p.width <= bounds.x + bounds.width && p.y + p.height <= bounds.y + bounds.height);
    assert.equal(overlaps(p, obstacle), false);
    for (const q of result.values()) if (q.id !== p.id) assert.equal(overlaps(p, q), false, `${p.id} intersects ${q.id}`);
    assert.equal(p.dx, p.x + p.width / 2 - 230);
    assert.equal(p.dy, p.y + p.height / 2 - 180);
  }
  assert.deepEqual(labels, original);
  assert.deepEqual(placePlotLabels({ labels: [...labels].reverse(), bounds, obstacles: [obstacle] }), result, "identities, not incoming array order, settle ties");
  assert.deepEqual(placePlotLabels({ labels, bounds, obstacles: [obstacle], previous: result }), result, "unchanged valid layout remains stable");
});

test("dense or off-screen labels are omitted in priority order without dropping their records", async () => {
  const { placePlotLabels } = await layoutModule();
  const labels = [
    { id: "unit", anchor: { x: 50, y: 30 }, width: 60, height: 20, priority: 1 },
    { id: "code", anchor: { x: 50, y: 30 }, width: 60, height: 20, priority: 30 },
    { id: "outside", anchor: { x: -1000, y: 30 }, width: 20, height: 20, priority: 99 },
    { id: "oversized", anchor: { x: 50, y: 30 }, width: 200, height: 20, priority: 100 },
  ];
  const result = placePlotLabels({ labels, bounds: { x: 0, y: 0, width: 100, height: 40 } });
  assert.equal(result.size, 4);
  assert.equal(result.get("code")?.visible, true);
  assert.equal(result.get("unit")?.visible, false);
  assert.equal(result.get("outside")?.visible, false);
  assert.equal(result.get("oversized")?.visible, false);
});

test("measurement or view changes invalidate old positions and cannot emit nonfinite geometry", async () => {
  const { placePlotLabels } = await layoutModule();
  const labels = [{ id: "label", anchor: { x: 40, y: 40 }, width: 20, height: 15, priority: 1 }];
  const previous = placePlotLabels({ labels, bounds: { x: 0, y: 0, width: 300, height: 200 } });
  const next = placePlotLabels({ labels: [{ ...labels[0], width: 90, anchor: { x: 95, y: 95 } }], previous, bounds: { x: 0, y: 0, width: 100, height: 100 } });
  const p = next.get("label")!;
  assert.ok(p.visible && p.x >= 0 && p.y >= 0 && p.x + p.width <= 100 && p.y + p.height <= 100);
  const invalid = placePlotLabels({ labels: [{ ...labels[0], anchor: { x: NaN, y: 40 } }], bounds: { x: 0, y: 0, width: 100, height: 100 } });
  assert.equal(invalid.get("label")?.visible, false);
  assert.ok(Object.values(invalid.get("label")!).every(value => typeof value !== "number" || Number.isFinite(value)));
});
