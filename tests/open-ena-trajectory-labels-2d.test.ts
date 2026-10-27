import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prepareTeachingSampleV3 } from "../lib/open-ena/sample-source-v3";
import { compileStandardDraftV3 } from "../lib/open-ena/model-v3/compiler";
import { buildStandardExecutionPlanV3 } from "../lib/open-ena/model-v3/execution-plan";
import { bindResultV3 } from "../lib/open-ena/model-v3/result-binding";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import { presentBoundResultV3 } from "../lib/open-ena/bound-presentation-v3";
import { buildTrajectoryPresentationV3 } from "../lib/open-ena/trajectory-presentation-v3";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";
import OpenEnaPlot from "../components/open-ena/OpenEnaPlot";

async function fixture() {
  const source = await prepareTeachingSampleV3(await readFile("public/data/academy/ena-2d-trajectory-teaching-sample.csv", "utf8"), "trajectory", new Date("2026-09-06T00:00:00Z"));
  const compiled = await compileStandardDraftV3(source.dataset, source.datasetSha256, source.drafts.standard);
  assert.equal(compiled.status, "ready");
  if (compiled.status !== "ready") throw new Error("Teaching sample must compile");
  const plan = await buildStandardExecutionPlanV3({ dataset: source.dataset, datasetSha256: source.datasetSha256, compileResult: compiled, reference: null });
  const bound = await bindResultV3(plan, runStandardPlanV3(plan), { processedRows: plan.rows.length, maximumBufferedRows: 0, numericCellsAllocated: 120, peakBytesObservedOrBounded: 10240, observationMethod: "exact-counters-and-conservative-byte-bound" }, compiled.diagnostics);
  const presentation = presentBoundResultV3(bound);
  const trajectoryPresentation = buildTrajectoryPresentationV3(bound, { showCentroidPaths: true, endpointsOnly: false, visibleHorizons: null });
  const axes = presentation.result.dimensions;
  return { result: { ...presentation.result, trajectoryPresentation }, groupColumn: "Group", view: "2d" as const,
    xDimension: axes[0], yDimension: axes[1], zDimension: axes[2], camera: "isometric" as const,
    showPoints: true, showNetworks: true, showLabels: true, showUnitLabels: false, showVariance: true, showTrajectories: true,
    edgeScale: 1, edgeThreshold: 0, pointScale: 1, plotZoom: 1, flipX: false, flipY: false,
    codeSourceByRenderedCode: presentation.codeSourceByRenderedCode, codeLabelByRenderedCode: presentation.codeLabelByRenderedCode, copy: getOpenEnaCopy("en") };
}
const sample = fixture();
const render = (props: Awaited<typeof sample> & Record<string, unknown>) => renderToStaticMarkup(createElement(OpenEnaPlot, props));
function boxes(markup: string) {
  return [...markup.matchAll(/<g\b([^>]*data-ena-label-box="true"[^>]*)>/gu)].map((match) => {
    const attr = (name: string) => match[1].match(new RegExp(`${name}="([^"]*)"`, "u"))?.[1];
    return { id: attr("data-label-id"), visible: attr("data-label-visible") === "true", x: Number(attr("data-label-x")), y: Number(attr("data-label-y")), width: Number(attr("data-label-width")), height: Number(attr("data-label-height")) };
  });
}

test("native teaching-sample centroid and Code labels share non-overlapping bounded placements", async () => {
  const props = await sample;
  for (const [xDimension, yDimension] of [[props.xDimension, props.yDimension], [props.xDimension, props.zDimension], [props.yDimension, props.zDimension]]) {
    const markup = render({ ...props, xDimension, yDimension });
    const placements = boxes(markup);
    assert.equal(placements.length, props.result.set.codes.length + props.result.trajectoryPresentation.centroids.length, "all Code and centroid labels must enter the same placement layer");
    const shown = placements.filter((box) => box.visible);
    assert.equal(shown.length, placements.length, `the small teaching sample has room for every label (${xDimension},${yDimension}); hidden: ${placements.filter(box => !box.visible).map(box => box.id).join(",")}`);
    for (const [i, a] of shown.entries()) {
      assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.width <= 920 && a.y + a.height <= 590);
      for (const b of shown.slice(i + 1)) assert.equal(a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height, false, `${a.id} overlaps ${b.id}`);
    }
  }
});

test("native labels scale without changing fitted geometry and retain a keyboard-accessible full-label list", async () => {
  const props = await sample;
  const base = render(props), larger = render({ ...props, textScale: 1.6, showUnitLabels: true });
  assert.match(base, /<details[^>]*data-ena-trajectory-label-details/);
  for (const centroid of props.result.trajectoryPresentation.centroids) assert.ok(base.includes(`${centroid.group} · ${centroid.horizon} · observed n = ${centroid.n}`));
  assert.ok(boxes(larger).length > boxes(base).length, "enabled Unit labels must join collision placement");
  const firstBase = boxes(base).find((box) => box.id?.startsWith("code:"))!;
  const firstLarger = boxes(larger).find((box) => box.id === firstBase.id)!;
  assert.ok(firstLarger.height > firstBase.height, "text size controls actual label metrics");
  const geometry = (markup: string) => [...markup.matchAll(/<rect x="([^"]+)" y="([^"]+)" width="5" height="5"/gu)].map((match) => match[0]);
  assert.equal(geometry(base).length, props.result.trajectoryPresentation.centroids.length, "every smaller centroid square retains its fitted centre");
  assert.deepEqual(geometry(larger), geometry(base), "label placement cannot change centroid coordinates");
  assert.doesNotMatch(base, /data-ena-label-leader="true"/, "automatic Code and period labels do not use callout leaders");
});

test("hiding native Code and Unit labels removes them from placements while centroid details remain", async () => {
  const props = await sample;
  const markup = render({ ...props, showLabels: false, showUnitLabels: false });
  assert.equal(boxes(markup).length, props.result.trajectoryPresentation.centroids.length);
  assert.ok(boxes(markup).every((box) => box.id?.startsWith("centroid:")));
  assert.match(markup, /data-ena-trajectory-label-details/);
});

test("trajectory Code-label hiding retains six hollow nodes with human names available on hover and keyboard focus", async () => {
  const props = await sample;
  const markup = render({ ...props, showLabels: false, showUnitLabels: false });
  const nodes = [...markup.matchAll(/<g\b([^>]*data-ena-code-node-position[^>]*)>(.*?)<\/g>/gu)];
  assert.equal(nodes.length, 6);
  assert.equal(boxes(markup).some(box => box.id?.startsWith("code:")), false, "Code label boxes and their attached leader lines are absent");
  for (const [, attrs, contents] of nodes) {
    assert.match(attrs, /tabindex="0"/u);
    assert.match(attrs, /role="img"/u);
    assert.match(attrs, /aria-label="[^"]+"/u);
    assert.match(contents, /<circle\b[^>]*class="ena-result-node"[^>]*fill="#fff"/u);
    assert.doesNotMatch(contents, /data-ena-label-leader/u);
  }
  assert.ok(nodes.some(([, attrs, contents]) => /aria-label="EX"/u.test(attrs) && contents.includes("<title>EX</title>")), "the EX node must expose its actual Code name without a visible text label");
  assert.deepEqual([...markup.matchAll(/<text\b[^>]*data-ena-layout-label="centroid:[^"]+"[^>]*>(.*?)<\/text>/gu)].map(match => match[1]), ["TP1", "TP2", "TP3", "TP1", "TP2", "TP3"]);
});

test("native trajectory Code dots are moderately smaller while hover names and nontrajectory sizing remain", async () => {
  const props = await sample;
  const markup = render({ ...props, showLabels: false });
  const circles = [...markup.matchAll(/<circle\b[^>]*class="ena-result-node"[^>]*>/gu)].map(match => match[0]);
  assert.equal(circles.length, 6);
  assert.ok(circles.every(circle => /\br="8"/u.test(circle)), "native trajectory Code radius must be 8 SVG units");
  assert.ok(markup.includes("<title>EX</title>"));
  const nontrajectory = renderToStaticMarkup(createElement(OpenEnaPlot, { ...props, result: { ...props.result, trajectoryPresentation: undefined }, showLabels: false }));
  const unchanged = [...nontrajectory.matchAll(/<circle\b[^>]*class="ena-result-node"[^>]*>/gu)].map(match => match[0]);
  assert.equal(unchanged.length, 6);
  assert.ok(unchanged.every(circle => /\br="14"/u.test(circle)), "other 2D plots retain their existing Code size");
});

test("visible centroid labels show only typed Horizon values while full details remain focusable", async () => {
  const markup = render(await sample);
  const texts = [...markup.matchAll(/<text\b[^>]*data-ena-layout-label="centroid:[^"]+"[^>]*>(.*?)<\/text>/gu)].map((match) => match[1]);
  assert.deepEqual(texts, ["TP1", "TP2", "TP3", "TP1", "TP2", "TP3"]);
  const details = markup.match(/<details\b[^>]*data-ena-trajectory-label-details[^>]*>(.*?)<\/details>/u)?.[1] ?? "";
  assert.equal((details.match(/<li\b[^>]*tabindex="0"[^>]*>/gu) ?? []).length, boxes(markup).length, "every full label is keyboard reachable");
  assert.ok(details.includes("observed n = 3"));
  for (const text of markup.matchAll(/<text\b[^>]*data-ena-layout-label[^>]*>/gu)) assert.ok(text[0].includes("font-family:Arial, Helvetica, sans-serif"), "screen and standalone export share a resolvable font");
});

test("manual Code label anchors move only labels and clearing overrides restores automatic placement", async () => {
  const props = await sample;
  const code = String(props.result.set.rotation.nodes![0].code);
  const base = render(props);
  const moved = render({ ...props, nodeLayout: new Map([[code, new Map([[props.xDimension, 0.8], [props.yDimension, -0.8]])]]) });
  const reset = render({ ...props, nodeLayout: new Map() });
  assert.notDeepEqual(boxes(moved).find((box) => box.id === `code:${code}`), boxes(base).find((box) => box.id === `code:${code}`));
  assert.deepEqual(boxes(reset), boxes(base));
  const node = (markup: string) => [...markup.matchAll(/<g[^>]*data-ena-code-node-position[^>]*>/gu)].map((match) => match[0]);
  assert.deepEqual(node(moved), node(base));
});

test("focusing a deferred label promotes it without moving an already visible selected label", async () => {
  const api = await import("../components/open-ena/useSvgTrajectoryLabels");
  const place = (api as Record<string, unknown>).placeSvgTrajectoryLabels as ((input: unknown, selectedId: string | null) => Map<string, { visible: boolean; x: number; y: number }>) | undefined;
  assert.equal(typeof place, "function", "2D selection must reach the collision planner");
  const input = { bounds: { x: 0, y: 0, width: 60, height: 22 }, labels: [
    { id: "code", anchor: { x: 30, y: 11 }, width: 48, height: 18, priority: 80 },
    { id: "unit", anchor: { x: 30, y: 11 }, width: 48, height: 18, priority: 20 },
  ] };
  const initial = place!(input, null);
  assert.equal(initial.get("code")?.visible, true);
  assert.equal(initial.get("unit")?.visible, false);
  const focusVisible = place!({ ...input, previous: initial }, "code");
  assert.deepEqual(focusVisible.get("code"), initial.get("code"), "focus must not shift an already readable label");
  const promoted = place!({ ...input, previous: initial }, "unit");
  assert.equal(promoted.get("unit")?.visible, true, "keyboard focus reveals the deferred label when a slot is available");
  assert.equal(promoted.get("code")?.visible, false);
});

test("centroid period labels are small and adjacent with no leader lines", async () => {
  const markup = render({ ...await sample, showLabels: false, showUnitLabels: false });
  const labels = [...markup.matchAll(/<g\b[^>]*data-label-id="centroid:[^"]*"[^>]*>(.*?)<\/g>/gu)];
  assert.equal(labels.length, 6);
  for (const [, contents] of labels) {
    assert.doesNotMatch(contents, /data-ena-label-leader/u);
    assert.match(contents, /font-size:10px/u);
  }
});

test("visible trajectory Code names use small text beside the hollow nodes", async () => {
  const markup = render(await sample);
  const texts = [...markup.matchAll(/<text\b[^>]*data-ena-layout-label="code:[^"]+"[^>]*>/gu)].map(match => match[0]);
  assert.equal(texts.length, 6);
  assert.ok(texts.every(text => text.includes('font-size:10px')));
  assert.match(markup, />IN<\/text>/u);
});
