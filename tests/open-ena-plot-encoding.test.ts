import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { analyzeDataset } from "../lib/open-ena/analyze";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";
import { parseCsv } from "../lib/open-ena/csv";
import { SAMPLE_CONFIG } from "../lib/open-ena/types";

function sixGroupTrajectoryResult() {
  const rows = ["unit,conversation,group,A,B,C"];
  for (let index = 0; index < 6; index += 1) {
    rows.push(`u${index + 1},c1,g${index + 1},1,1,0`);
    rows.push(`u${index + 1},c2,g${index + 1},0,1,1`);
  }
  const dataset = parseCsv(`${rows.join("\n")}\n`, {
    name: "six-group-trajectories.csv",
    source: "upload",
  });
  return analyzeDataset(dataset, {
    ...SAMPLE_CONFIG,
    unitColumns: ["unit"],
    conversationColumns: ["conversation"],
    groupColumn: "group",
    codes: ["A", "B", "C"],
    model: "SeparateTrajectory",
    window: "Conversation",
    windowSizeForward: 0,
  });
}

test("generic 2D ENA plots retain network encodings but fail closed on legacy trajectory flags", async () => {
  const plotModule = await import("../components/open-ena/OpenEnaPlot") as typeof import("../components/open-ena/OpenEnaPlot") & {
    GROUP_VISUAL_ENCODINGS?: ReadonlyArray<{
      key: string;
      markerShape: string;
      markerLabel: string;
      trajectoryLabel: string;
    }>;
  };
  const encodings = plotModule.GROUP_VISUAL_ENCODINGS;

  assert.ok(encodings, "the plot should publish its stable group-encoding contract");
  assert.equal(encodings.length, 6);
  assert.equal(new Set(encodings.map(({ key }) => key)).size, 6);
  assert.equal(new Set(encodings.map(({ markerShape }) => markerShape)).size, 6);
  assert.ok(encodings.every(({ trajectoryLabel }) => trajectoryLabel === "solid"));
  assert.deepEqual(encodings.slice(0, 2).map(({ markerShape }) => markerShape), ["circle", "square"]);

  const result = sixGroupTrajectoryResult();
  assert.equal(result.groups.length, 6);
  const render = (showTrajectories: boolean) => renderToStaticMarkup(createElement(plotModule.default, {
    result,
    groupColumn: "group",
    view: "2d",
    xDimension: result.dimensions[0],
    yDimension: result.dimensions[1],
    zDimension: result.dimensions[2],
    camera: "xy",
    showPoints: true,
    showNetworks: true,
    showLabels: true,
    showUnitLabels: false,
    showVariance: true,
    showTrajectories,
    edgeScale: 1,
    edgeThreshold: 0,
    pointScale: 1,
    plotZoom: 1,
    flipX: false,
    flipY: false,
    copy: getOpenEnaCopy("en"),
  }));
  const markup = render(true);
  assert.equal(markup, render(false), "the read-compatible trajectory flag must be a presenter no-op");
  assert.match(markup, /<svg[^>]*viewBox="0 0 920 590"/, "standard 2D ENA must retain the 920 by 590 live export viewBox");
  assert.doesNotMatch(markup, /ena-trajectory-(?:path|direction-arrow|arrow-)/);
  assert.doesNotMatch(markup, /data-ena-trajectory-style|directed trajectory segment|trajectory line/i);
  assert.match(markup, /Solid network edge/);

  for (const [index, encoding] of encodings.entries()) {
    const group = `g${index + 1}`;
    const markerOccurrences = markup.match(new RegExp(`data-ena-group-shape="${encoding.markerShape}"`, "g")) ?? [];
    assert.ok(markerOccurrences.length >= 2, `${group} should use ${encoding.markerShape} for units and the unit legend`);
    assert.ok(
      markup.includes(`${group}: ${encoding.markerLabel} marker`),
      `${group} should expose its ENA marker mapping to assistive technology`,
    );
    assert.ok(markup.includes(`${group} mean: square centroid marker`), `${group} mean should use the ENA centroid square`);
  }
  assert.equal((markup.match(/data-ena-centroid-shape="square"/g) ?? []).length, 6);
  assert.match(markup, /Group means use square centroid markers/);
});

test("standalone and mini-network code nodes share the selected palette", async () => {
  const { default: OpenEnaPlot, MiniNetwork } = await import("../components/open-ena/OpenEnaPlot");
  const result = sixGroupTrajectoryResult();
  const codeColors = { A: "#c2185b" };
  const markup = renderToStaticMarkup(createElement(OpenEnaPlot, {
    result,
    groupColumn: "group",
    view: "2d",
    xDimension: result.dimensions[0],
    yDimension: result.dimensions[1],
    zDimension: result.dimensions[2],
    camera: "xy",
    showPoints: true,
    showNetworks: true,
    showLabels: true,
    showUnitLabels: false,
    showVariance: true,
    showTrajectories: true,
    edgeScale: 1,
    edgeThreshold: 0,
    pointScale: 1,
    plotZoom: 1,
    flipX: false,
    flipY: false,
    copy: getOpenEnaCopy("en"),
    codeColors,
  } as never));
  const miniMarkup = renderToStaticMarkup(createElement(MiniNetwork, {
    result,
    group: result.groups[0],
    xDimension: result.dimensions[0],
    yDimension: result.dimensions[1],
    label: "g1 network",
    maxNetworkWeight: 1,
    edgeThreshold: 0,
    codeColors,
  } as never));

  assert.match(markup, /<circle[^>]*data-ena-code="A"[^>]*fill="#c2185b"/);
  assert.match(markup, /<circle[^>]*data-ena-code="B"[^>]*fill="#000000"/);
  assert.match(miniMarkup, /<circle[^>]*data-ena-code="A"[^>]*fill="#c2185b"/);
  assert.match(miniMarkup, /<circle[^>]*data-ena-code="B"[^>]*fill="#000000"/);
});

test("generic 2D ENA applies a dimension layout to one node and every incident edge without reframing", async () => {
  const { default: OpenEnaPlot } = await import("../components/open-ena/OpenEnaPlot");
  const result = sixGroupTrajectoryResult();
  const before = structuredClone(result);
  const xDimension = result.dimensions[0]!;
  const yDimension = result.dimensions[1]!;
  const zDimension = result.dimensions[2]!;
  const common = {
    result,
    groupColumn: "group",
    view: "2d" as const,
    xDimension,
    yDimension,
    zDimension,
    camera: "xy" as const,
    showPoints: true,
    showNetworks: true,
    showLabels: true,
    showUnitLabels: false,
    showVariance: true,
    showTrajectories: false,
    edgeScale: 1,
    edgeThreshold: 0,
    pointScale: 1,
    plotZoom: 1,
    flipX: false,
    flipY: false,
    copy: getOpenEnaCopy("en"),
  };
  const render = (nodeLayout?: ReadonlyMap<string, ReadonlyMap<string, number>>) => (
    renderToStaticMarkup(createElement(OpenEnaPlot, { ...common, nodeLayout } as never))
  );
  const baseline = render();
  const moved = render(new Map([["A", new Map([[xDimension, 4], [yDimension, -3]])]]));
  const nodeTransform = (markup: string, code: string) => markup.match(new RegExp(
    `<g(?=[^>]*transform="translate\\(([^ ]+) ([^)]+)\\)")(?=[^>]*data-ena-code-node-position="${code}")[^>]*>`,
  ))?.slice(1, 3).map(Number) ?? [];
  const edgeTag = (markup: string, edge: string) => markup.match(new RegExp(
    `<line[^>]*data-ena-edge="${edge.replace(" & ", " &amp; ")}"[^>]*>`,
  ))?.[0] ?? "";

  assert.notDeepEqual(nodeTransform(moved, "A"), nodeTransform(baseline, "A"));
  assert.deepEqual(nodeTransform(moved, "B"), nodeTransform(baseline, "B"));
  assert.notEqual(edgeTag(moved, "A & B"), edgeTag(baseline, "A & B"));
  assert.equal(edgeTag(moved, "B & C"), edgeTag(baseline, "B & C"));
  assert.match(moved, /data-ena-drag-code="A"/);
  assert.deepEqual(result, before, "display-only node movement cannot mutate the fitted result");
});
