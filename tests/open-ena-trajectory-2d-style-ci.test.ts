import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import OpenEnaPlot from "../components/open-ena/OpenEnaPlot";
import { prepareTeachingSampleV3 } from "../lib/open-ena/sample-source-v3";
import { compileStandardDraftV3 } from "../lib/open-ena/model-v3/compiler";
import { buildStandardExecutionPlanV3 } from "../lib/open-ena/model-v3/execution-plan";
import { bindResultV3 } from "../lib/open-ena/model-v3/result-binding";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import { presentBoundResultV3 } from "../lib/open-ena/bound-presentation-v3";
import { buildTrajectoryPresentationV3 } from "../lib/open-ena/trajectory-presentation-v3";
import type { TrajectoryCentroidIntervalV3 } from "../lib/open-ena/trajectory-style-v3";
import { DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS } from "../lib/open-ena/group-display";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";

async function fixture() {
  const source = await prepareTeachingSampleV3(await readFile("public/data/academy/ena-2d-trajectory-teaching-sample.csv", "utf8"), "trajectory", new Date("2026-09-06T00:00:00Z"));
  const compiled = await compileStandardDraftV3(source.dataset, source.datasetSha256, source.drafts.standard);
  assert.equal(compiled.status, "ready");
  if (compiled.status !== "ready") throw new Error("Teaching sample must compile");
  const plan = await buildStandardExecutionPlanV3({ dataset: source.dataset, datasetSha256: source.datasetSha256, compileResult: compiled, reference: null });
  const bound = await bindResultV3(plan, runStandardPlanV3(plan), { processedRows: plan.rows.length, maximumBufferedRows: 0, numericCellsAllocated: 120, peakBytesObservedOrBounded: 10240, observationMethod: "exact-counters-and-conservative-byte-bound" }, compiled.diagnostics);
  const presentation = presentBoundResultV3(bound);
  const trajectory = buildTrajectoryPresentationV3(bound, { showCentroidPaths: true, endpointsOnly: false, visibleHorizons: null });
  const horizonKeys = [...new Set(trajectory.points.map(point => point.horizonKey))];
  const colors = ["#24a585", "#75d054", "#fde725"];
  const axes = presentation.result.dimensions;
  const trajectoryPresentation = { ...trajectory, showDirection: true, showConfidenceIntervals: true, uncertaintyStatus: "ready" as const,
    horizonStyles: horizonKeys.map((horizonKey, index) => ({ horizonKey, label: `TP${index + 1}`, detail: `Horizon ${index + 1}`, color: colors[index] })),
    centroids: trajectory.centroids.map(centroid => ({ ...centroid, intervals: Object.fromEntries(axes.map(axis => [axis, {
      status: "estimable" as const, lower: Number(centroid.point[axis]) - 0.2, upper: Number(centroid.point[axis]) + 0.3, sampleSize: centroid.n, finiteReplicates: 500,
    }])) as Record<string, TrajectoryCentroidIntervalV3> })),
  };
  return { result: { ...presentation.result, trajectoryPresentation }, groupColumn: "Group", view: "2d" as const,
    xDimension: axes[0], yDimension: axes[1], zDimension: axes[2], camera: "isometric" as const,
    showPoints: true, showNetworks: true, showLabels: true, showUnitLabels: false, showVariance: true, showTrajectories: true,
    edgeScale: 1, edgeThreshold: 0, pointScale: 1, plotZoom: 1, flipX: false, flipY: false,
    codeSourceByRenderedCode: presentation.codeSourceByRenderedCode, codeLabelByRenderedCode: presentation.codeLabelByRenderedCode, copy: getOpenEnaCopy("en") };
}
const sample = fixture();
type Props = Awaited<typeof sample>;
const render = (props: Props) => renderToStaticMarkup(createElement(OpenEnaPlot, props));
const attr = (element: string, name: string) => element.match(new RegExp(`\\b${name}="([^"]*)"`, "u"))?.[1];
const elements = (markup: string, tag: string, marker: string) => [...markup.matchAll(new RegExp(`<${tag}\\b[^>]*${marker}[^>]*>`, "gu"))].map(match => match[0]);
const close = (actual: number, expected: number, message?: string) => assert.ok(Math.abs(actual - expected) < 1e-7, message ?? `${actual} != ${expected}`);
const withoutIntervals = (props: Props) => ({ ...props, result: { ...props.result, trajectoryPresentation: { ...props.result.trajectoryPresentation, showConfidenceIntervals: false } } });

test("2D trajectories use borderless Group-colored squares and black centroid paths", async () => {
  const props = await sample, markup = render(props), trajectory = props.result.trajectoryPresentation;
  const centroids = [...markup.matchAll(/<g\b[^>]*data-ena-trajectory-centroid="true"[^>]*>(.*?)<\/g>/gu)];
  assert.equal(centroids.length, trajectory.centroids.length);
  for (const [index, centroid] of trajectory.centroids.entries()) {
    const rect = centroids[index][1].match(/<rect\b[^>]*>/u)![0];
    const group = props.result.groups.find(group => group.name === centroid.group)!;
    assert.ok(attr(rect, "style")?.includes(`fill:${group.color}`));
    assert.ok(attr(rect, "style")?.includes("stroke:none"));
  }
  const units = [...markup.matchAll(/<g\b[^>]*data-ena-unit-point="true"[^>]*>(.*?)<\/g>/gu)];
  assert.equal(units.length, trajectory.points.length);
  for (const [, contents] of units) {
    const rect = contents.match(/<rect\b[^>]*>/u)![0];
    assert.ok(props.result.groups.some(group => attr(rect, "fill") === group.color));
    assert.equal(attr(rect, "stroke"), "none");
  }
  for (const path of elements(markup, "line", "data-ena-centroid-path")) {
    assert.match(attr(path, "style") ?? "", /stroke:black(?:;|$)/u);
    assert.equal(attr(path, "stroke-width"), "3");
  }
});

test("2D direction heads are filled and centered, retain direction controls and omit zero-length arrows", async () => {
  const props = await sample, markup = render(props);
  const paths = elements(markup, "line", "data-ena-centroid-path");
  const heads = elements(markup, "polygon", "data-ena-trajectory-direction");
  assert.equal(heads.length, paths.length);
  for (const [index, head] of heads.entries()) {
    const path = paths[index], from = [Number(attr(path, "x1")), Number(attr(path, "y1"))];
    const to = [Number(attr(path, "x2")), Number(attr(path, "y2"))];
    const dx = to[0] - from[0], dy = to[1] - from[1], length = Math.hypot(dx, dy);
    const positions = attr(head, "points")!.split(" ").map(pair => pair.split(",").map(Number));
    const fractions = positions.map(([x, y]) => ((x - from[0]) * dx + (y - from[1]) * dy) / length ** 2);
    const lower = Math.min(...fractions), upper = Math.max(...fractions);
    close((lower + upper) / 2, 0.5);
    assert.ok(lower >= 0.3 - 1e-9 && upper <= 0.7 + 1e-9);
    assert.equal(fractions[0], upper);
    assert.match(attr(head, "style") ?? "", /fill:black/u);
  }
  const trajectory = props.result.trajectoryPresentation, point = trajectory.centroids[0];
  const zero = render({ ...props, result: { ...props.result, trajectoryPresentation: { ...trajectory, centroidPaths: [{ from: point, to: point, sharedContributorCount: 1 }] } } });
  assert.equal(elements(zero, "polygon", "data-ena-trajectory-direction").length, 0);
  const hidden = render({ ...props, result: { ...props.result, trajectoryPresentation: { ...trajectory, showDirection: false } } });
  assert.equal(elements(hidden, "polygon", "data-ena-trajectory-direction").length, 0);
  assert.ok(elements(hidden, "line", "data-ena-centroid-path").every(path => /stroke:black(?:;|$)/u.test(attr(path, "style") ?? "")));
});

test("2D CI rectangles render selected-axis bounds before paths and expand only the display frame", async () => {
  const props = await sample, before = JSON.stringify(props.result.set), markup = render(props);
  const rectangles = elements(markup, "rect", "data-ena-trajectory-ci");
  assert.equal(rectangles.length, props.result.trajectoryPresentation.centroids.length);
  assert.ok(markup.indexOf("data-ena-trajectory-ci") < markup.indexOf("data-ena-centroid-path"));
  const labels = elements(markup, "g", "data-ena-label-box").filter(label => attr(label, "data-label-visible") === "true").map(label => ({
    x: Number(attr(label, "data-label-x")), y: Number(attr(label, "data-label-y")), width: Number(attr(label, "data-label-width")), height: Number(attr(label, "data-label-height")),
  }));
  assert.ok(labels.length > 0, "collision avoidance must preserve readable labels");
  for (const [index, rect] of rectangles.entries()) {
    assert.match(attr(rect, "style") ?? "", /fill:none/u);
    assert.match(attr(rect, "style") ?? "", /stroke-dasharray:0.1 2.4/u);
    assert.ok(Number(attr(rect, "width")) > 0 && Number(attr(rect, "height")) > 0);
    assert.ok(Number(attr(rect, "x")) >= 72 && Number(attr(rect, "y")) >= 58);
    assert.ok(Number(attr(rect, "x")) + Number(attr(rect, "width")) <= 920 - 72 + 1e-7);
    assert.ok(Number(attr(rect, "y")) + Number(attr(rect, "height")) <= 590 - 58 + 1e-7);
    const group = props.result.groups.find(group => group.name === props.result.trajectoryPresentation.centroids[index].group)!;
    assert.ok(attr(rect, "style")?.includes(`stroke:${group.color}`));
    const x = Number(attr(rect, "x")), y = Number(attr(rect, "y")), width = Number(attr(rect, "width")), height = Number(attr(rect, "height"));
    const edges = [{ x, y, width, height: 1 }, { x, y: y + height, width, height: 1 }, { x, y, width: 1, height }, { x: x + width, y, width: 1, height }];
    assert.equal(edges.length, 4, "the empty CI interior stays unfilled even when compact labels mask a few boundary dots");
  }
  assert.equal(JSON.stringify(props.result.set), before, "CI display cannot mutate fitted coordinates");
  const off = render(withoutIntervals(props));
  assert.equal(elements(off, "rect", "data-ena-trajectory-ci").length, 0);
});

test("CI flips and axis changes follow fitted coordinates; small bounds never shrink the full-result frame", async () => {
  const props = await sample;
  const base = elements(render(props), "rect", "data-ena-trajectory-ci");
  const flipped = elements(render({ ...props, flipX: true, flipY: true }), "rect", "data-ena-trajectory-ci");
  for (const [index, rect] of base.entries()) {
    close(Number(attr(flipped[index], "x")), 920 - Number(attr(rect, "x")) - Number(attr(rect, "width")));
    close(Number(attr(flipped[index], "y")), 590 - Number(attr(rect, "y")) - Number(attr(rect, "height")));
    close(Number(attr(flipped[index], "width")), Number(attr(rect, "width")));
  }
  const trajectory = props.result.trajectoryPresentation;
  const tiny = { ...props, result: { ...props.result, trajectoryPresentation: { ...trajectory, centroids: trajectory.centroids.map(centroid => ({ ...centroid,
    intervals: Object.fromEntries(props.result.dimensions.map(axis => [axis, { status: "degenerate" as const, lower: Number(centroid.point[axis]), upper: Number(centroid.point[axis]), sampleSize: 3, finiteReplicates: 500 }])) })) } } };
  const nodes = (value: string) => elements(value, "g", "data-ena-code-node-position").map(node => attr(node, "transform"));
  assert.deepEqual(nodes(render(tiny)), nodes(render(withoutIntervals(tiny))), "degenerate bounds do not contract the fitted frame");
  const swapped = render({ ...props, xDimension: props.yDimension, yDimension: props.zDimension });
  assert.equal(elements(swapped, "rect", "data-ena-trajectory-ci").length, base.length);
  assert.notDeepEqual(elements(swapped, "rect", "data-ena-trajectory-ci").map(rect => attr(rect, "x")), base.map(rect => attr(rect, "x")));
});

test("unavailable selected-axis CI is omitted and hollow Code nodes preserve focus and short labels", async () => {
  const props = await sample, trajectory = props.result.trajectoryPresentation;
  const first = trajectory.centroids[0];
  const unavailable = { ...first, intervals: { ...first.intervals, [props.xDimension]: { status: "not-estimable" as const, reason: "fewer-than-two-independent-units", sampleSize: 1, finiteReplicates: 0 } } };
  const markup = render({ ...props, result: { ...props.result, trajectoryPresentation: { ...trajectory, centroids: [unavailable, ...trajectory.centroids.slice(1)] } } } as Props);
  assert.equal(elements(markup, "rect", "data-ena-trajectory-ci").length, trajectory.centroids.length - 1);
  const nodes = elements(markup, "circle", "ena-result-node");
  assert.equal(nodes.length, props.result.set.codes.length);
  assert.ok(nodes.every(node => /fill:none(?:;|$)/u.test(attr(node, "style") ?? "")), "trajectory Code nodes have a light hollow appearance");
  assert.ok(nodes.every(node => Number(attr(node, "r")) === 4.5));
  assert.match(markup, /data-ena-code-node-position="[^"]+" tabindex="0" role="img"/u);
  assert.deepEqual([...markup.matchAll(/<text\b[^>]*data-ena-layout-label="centroid:[^"]+"[^>]*>(.*?)<\/text>/gu)].map(match => match[1]), ["TP1", "TP2", "TP3", "TP1", "TP2", "TP3"]);
});

test("2D per-Group CI switches suppress intervals and their display-frame expansion", async () => {
  const props = await sample;
  const settingsByName = Object.fromEntries(props.result.groups.map(group => [group.name, { ...DEFAULT_OPEN_ENA_GROUP_DISPLAY_OPTIONS, showConfidenceIntervals: false }]));
  const hiddenCi = { ...props, result: { ...props.result, groupPresentation: { allSuppressed: false, hiddenUnits: new Set<string>(), settingsByName } } };
  const markup = render(hiddenCi);
  assert.equal(elements(markup, "rect", "data-ena-trajectory-ci").length, 0);
  assert.equal(elements(markup, "g", "data-ena-trajectory-centroid").length, props.result.trajectoryPresentation.centroids.length, "CI visibility must not hide group means");
  const nodes = (value: string) => elements(value, "g", "data-ena-code-node-position").map(node => attr(node, "transform"));
  assert.deepEqual(nodes(markup), nodes(render(withoutIntervals(hiddenCi))), "hidden Group CIs cannot change framing or reserve label obstacles");
  settingsByName[props.result.groups[0].name].showConfidenceIntervals = true;
  const selected = render(hiddenCi);
  assert.equal(elements(selected, "rect", "data-ena-trajectory-ci").length, props.result.trajectoryPresentation.centroids.filter(c => c.group === props.result.groups[0].name).length);
  hiddenCi.result.groupPresentation.allSuppressed = true;
  const suppressed = render(hiddenCi);
  assert.equal(elements(suppressed, "rect", "data-ena-trajectory-ci").length, 0);
  assert.equal(elements(suppressed, "g", "data-ena-trajectory-centroid").length, 0);
  assert.equal(elements(suppressed, "line", "data-ena-centroid-path").length, 0);
});
