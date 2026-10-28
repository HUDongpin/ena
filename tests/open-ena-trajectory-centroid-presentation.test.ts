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
import { compileOpenEna3dPlotSpec } from "../lib/open-ena/plot3d";

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

test("trajectory Unit markers and their legends use squares for every Group", async () => {
  const props = await sample;
  const markup = render(props);
  const units = [...markup.matchAll(/<g\b[^>]*data-ena-unit-point="true"[^>]*>([\s\S]*?)<\/g>/gu)];
  assert.equal(units.length, props.result.trajectoryPresentation.points.length);
  assert.ok(units.length > 0);
  for (const unit of units) {
    assert.match(unit[1], /<rect\b/, "all trajectory Unit markers must be square, independent of Group order");
    assert.doesNotMatch(unit[1], /<circle\b|<path\b/);
    assert.match(unit[1], /stroke="none"[^>]*stroke-width="0"/u, "colored squares must have no outline");
  }
  assert.doesNotMatch(markup, /data-ena-group-shape="(?!square)[^"]+"/u, "the legend must use the same shape as the plot");
  for (const group of props.result.groups) assert.ok(units.some(unit => unit[1].includes(`fill="${group.color}"`)));
  const legend = markup.match(/<aside\b[^>]*data-ena-trajectory-legend="true"[\s\S]*?<\/aside>/u)?.[0] ?? "";
  for (const group of props.result.groups) assert.ok(legend.includes(`fill="${group.color}" stroke="none"`), "legend squares must also be borderless");
});

test("trajectory Group centroids use squares filled with their own Group color", async () => {
  const props = await sample;
  const centroids = [...render(props).matchAll(/<g\b[^>]*data-ena-trajectory-centroid="true"[^>]*>([\s\S]*?)<\/g>/gu)];
  assert.equal(centroids.length, props.result.trajectoryPresentation.centroids.length);
  for (const [index, centroid] of centroids.entries()) {
    const group = props.result.groups.find(group => group.name === props.result.trajectoryPresentation.centroids[index].group)!;
    assert.match(centroid[1], /<rect\b/);
    assert.ok(centroid[1].includes(`fill="${group.color}"`), "a centroid must retain its Group color");
  }
});

test("compact TP labels stay beside their centroid squares without leader lines", async () => {
  const props = await sample;
  const markup = render({ ...props, showLabels: false, showPoints: false });
  const placements = boxes(markup);
  const markers = [...markup.matchAll(/data-ena-trajectory-centroid="true"[^>]*><rect x="([^"]+)" y="([^"]+)"/gu)];
  assert.equal(placements.length, 6);
  assert.equal(markers.length, 6);
  assert.match(markup, /Group colors identify filled square centroids and confidence intervals/u);
  assert.match(markup, /Individual points are hidden/u);
  assert.doesNotMatch(markup, /Horizon colors identify periods|centroid outlines/u);
  assert.doesNotMatch(markup, /data-ena-label-leader=/u);
  const texts = [...markup.matchAll(/<text\b[^>]*data-ena-layout-label="centroid:[^"]+"[^>]*>/gu)];
  assert.equal(texts.length, 6);
  assert.ok(texts.every(([text]) => text.includes("font-size:10px")));
  for (const [index, marker] of markers.entries()) {
    const label = placements[index];
    const anchor = { x: Number(marker[1]) + 3.5, y: Number(marker[2]) + 3.5 };
    const gapX = Math.max(label.x - anchor.x, anchor.x - label.x - label.width, 0);
    const gapY = Math.max(label.y - anchor.y, anchor.y - label.y - label.height, 0);
    assert.ok(label.visible && Math.hypot(gapX, gapY) <= 20, "TP text must remain next to its own square, including a close diagonal placement when arrows occupy the sides");
  }
  assert.equal((markup.match(/data-ena-trajectory-direction="true"/gu) ?? []).length, 4, "trajectory direction arrows remain visible");
});

test("TP label backgrounds never cover the trajectory direction arrowheads", async () => {
  const props = await sample;
  for (const flipX of [false, true]) {
    const markup = render({ ...props, showPoints: false, showLabels: false, flipX });
    const labels = boxes(markup).filter(label => label.visible);
    assert.equal(labels.length, 6);
    const arrows = [...markup.matchAll(/<polygon\b[^>]*data-ena-trajectory-direction="true"[^>]*points="([^"]+)"/gu)];
    assert.equal(arrows.length, 4);
    for (const arrow of arrows) {
      const points = arrow[1].split(" ").map(point => point.split(",").map(Number));
      const x = Math.min(...points.map(point => point[0])), y = Math.min(...points.map(point => point[1]));
      const right = Math.max(...points.map(point => point[0])), bottom = Math.max(...points.map(point => point[1]));
      for (const label of labels) assert.equal(label.x < right && label.x + label.width > x && label.y < bottom && label.y + label.height > y, false, "a TP label must not obscure a direction arrow");
    }
  }
});

test("each complete direction arrow is centered between the two centroid squares", async () => {
  const props = await sample;
  for (const flipX of [false, true]) {
    const markup = render({ ...props, showLabels: false, showPoints: false, flipX });
    const paths = [...markup.matchAll(/<line\b[^>]*data-ena-centroid-path="true"[^>]*>/gu)];
    const arrows = [...markup.matchAll(/<polygon\b[^>]*data-ena-trajectory-direction="true"[^>]*points="([^"]+)"/gu)];
    assert.equal(arrows.length, paths.length);
    assert.equal(arrows.length, 4);
    for (const [index, [path]] of paths.entries()) {
      const coordinate = (name: string) => Number(path.match(new RegExp(`${name}="([^"]+)"`, "u"))![1]);
      const from = { x: coordinate("x1"), y: coordinate("y1") };
      const dx = coordinate("x2") - from.x, dy = coordinate("y2") - from.y;
      const length = Math.hypot(dx, dy);
      const points = arrows[index][1].split(" ").map(point => point.split(",").map(Number));
      const fractions = points.map(([x, y]) => ((x - from.x) * dx + (y - from.y) * dy) / length ** 2);
      const start = Math.min(...fractions), end = Math.max(...fractions);
      assert.ok(Math.abs((start + end) / 2 - 0.5) < 1e-9, "the whole arrow, not only its tip, must occupy the midpoint");
      assert.ok(start >= 0.3 - 1e-9 && end <= 0.7 + 1e-9, "arrowheads must remain clear of both end markers");
      assert.equal(fractions[0], end, "the arrow still points toward the later time point");
    }
  }
});

test("trajectory Code-label hiding retains six hollow black circles with human names on hover and keyboard focus", async () => {
  const props = await sample;
  const markup = render({ ...props, showLabels: false, showUnitLabels: false });
  const nodes = [...markup.matchAll(/<g\b([^>]*data-ena-code-node-position[^>]*)>(.*?)<\/g>/gu)];
  assert.equal(nodes.length, 6);
  assert.equal(boxes(markup).some(box => box.id?.startsWith("code:")), false, "Code label boxes and their attached leader lines are absent");
  for (const [, attrs, contents] of nodes) {
    assert.match(attrs, /tabindex="0"/u);
    assert.match(attrs, /role="img"/u);
    assert.match(attrs, /aria-label="[^"]+"/u);
    assert.match(contents, /<circle\b[^>]*class="ena-result-node"[^>]*fill="none"[^>]*stroke="#000000"/u);
    assert.match(contents, /style="[^"]*fill:none[^"]*stroke:#000000/u, "inline styling must not refill the hollow Code node");
    assert.doesNotMatch(contents, /data-ena-label-leader/u);
  }
  assert.ok(nodes.some(([, attrs, contents]) => /aria-label="EX"/u.test(attrs) && contents.includes("<title>EX</title>")), "the EX node must expose its actual Code name without a visible text label");
  assert.deepEqual([...markup.matchAll(/<text\b[^>]*data-ena-layout-label="centroid:[^"]+"[^>]*>(.*?)<\/text>/gu)].map(match => match[1]), ["TP1", "TP2", "TP3", "TP1", "TP2", "TP3"]);
});

test("custom Code colors change only the outline of hollow trajectory nodes in 2D and 3D", async () => {
  const props = await sample;
  const code = String(props.result.set.rotation.nodes![0].code);
  const codeColors = { [code]: "#7c3aed" };
  const markup = render({ ...props, codeColors });
  const nodes = [...markup.matchAll(/<circle\b[^>]*class="ena-result-node"[^>]*>/gu)].map(match => match[0]);
  assert.equal(nodes.length, props.result.set.codes.length);
  assert.ok(nodes.every(node => node.includes('fill="none"')));
  assert.ok(nodes.some(node => node.includes('stroke="#7c3aed"')));
  const trace = compileOpenEna3dPlotSpec({ ...props, codeColors }).data.find(trace => trace.meta.role === "code-node")!;
  assert.equal(trace.marker?.symbol, "circle-open");
  assert.ok(Array.isArray(trace.marker.color) && trace.marker.color.includes("#7c3aed"));
});
