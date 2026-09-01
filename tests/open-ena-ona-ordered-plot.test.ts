import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildOpenEnaOrderedPlotModel,
  buildOrderedEdgeGlyph,
  type OpenEnaOrderedNodeTotals,
} from "../lib/open-ena/ordered-plot";
import * as unitPointStyleContract from "../lib/open-ena/unit-point-style";
import type { OpenEnaUnitPointStyle } from "../lib/open-ena/unit-point-style";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";
import type { OpenEnaConfig, OpenEnaResult } from "../lib/open-ena/types";

const codes = ["A", "B", "C"];
const adjacencyKey = codes.flatMap((response, responseIndex) => (
  codes.map((ground, groundIndex) => ({
    source: ground,
    target: response,
    sourceIndex: groundIndex,
    targetIndex: responseIndex,
    name: `${ground} & ${response}`,
  }))
));

function weights(values: Partial<Record<string, number>>) {
  return Object.fromEntries(adjacencyKey.map((edge) => [edge.name, values[edge.name] ?? 0]));
}

function orderedFixture(): { result: OpenEnaResult; config: OpenEnaConfig } {
  const config: OpenEnaConfig = {
    analysisKind: "ona",
    unitColumns: ["unit"],
    conversationColumns: ["horizon"],
    groupColumn: "group",
    codes,
    model: "EndPoint",
    window: "MovingStanzaWindow",
    windowSizeBack: 2,
    windowSizeForward: 0,
    weightBy: "sum",
    rotation: "svd",
    referenceRotationId: null,
    centerAlignToOrigin: true,
    orderPolicy: {
      kind: "columns",
      columns: ["turn"],
      comparators: { turn: "number" },
    },
    directionalMask: {
      schemaVersion: 1,
      codeOrder: codes,
      enabled: [
        [true, true, true],
        [true, true, true],
        [false, true, true],
      ],
    },
  };
  const first = weights({
    "A & A": 0.1,
    "A & B": 0.8,
    "B & A": 0.2,
    "B & B": 0.3,
    "A & C": 0.4,
    "C & A": 0.4,
  });
  const second = weights({
    "A & A": 0.5,
    "A & B": 0.4,
    "B & A": 0.4,
    "B & B": 0.7,
    "A & C": 0.2,
    "C & A": 0.2,
  });
  const connectionRows = [
    { ENA_UNIT: "u1", group: "first", ...weights({ "A & B": 4, "B & A": 1, "A & A": 2 }) },
    { ENA_UNIT: "u2", group: "second", ...weights({ "A & B": 6, "B & A": 3, "A & A": 1 }) },
    { ENA_UNIT: "u3", group: "second", ...weights({ "A & B": 2, "B & A": 5, "A & A": 4 }) },
    { ENA_UNIT: "u4", group: "second", ...weights({ "A & B": 8, "B & A": 7, "A & A": 3 }) },
  ];
  const result = {
    set: {
      networkType: "ordered",
      functionParams: { networkType: "ordered" },
      modelType: "EndPoint",
      codes,
      codeColumns: adjacencyKey.map((edge) => edge.name),
      adjacencyKey,
      units: ["unit"],
      conversation: ["horizon"],
      points: [
        { ENA_UNIT: "u1", group: "first", SVD1: -0.6, SVD2: 0.2 },
        { ENA_UNIT: "u2", group: "second", SVD1: 0.2, SVD2: -0.1 },
        { ENA_UNIT: "u3", group: "second", SVD1: 0.4, SVD2: 0.3 },
        { ENA_UNIT: "u4", group: "second", SVD1: 0.7, SVD2: -0.2 },
      ],
      lineWeights: [],
      connectionCounts: connectionRows,
      pointsForProjection: [],
      rotation: {
        nodes: [
          { code: "A", SVD1: -0.8, SVD2: 0.5 },
          { code: "B", SVD1: 0.8, SVD2: 0.5 },
          { code: "C", SVD1: 0, SVD2: -0.8 },
        ],
      },
      variance: { SVD1: 0.6, SVD2: 0.3 },
    },
    groups: [
      { name: "first", count: 1, pointCount: 1, color: "#cc423a", meanPoint: { SVD1: -0.6, SVD2: 0.2 }, meanWeights: first },
      { name: "second", count: 3, pointCount: 3, color: "#218ebf", meanPoint: { SVD1: 0.43, SVD2: 0 }, meanWeights: second },
    ],
    dimensions: ["SVD1", "SVD2"],
    stats: {},
    statsDiagnostics: {
      correlations: "not-applicable-ordered-network",
      tests: "not-applicable-ordered-network",
      correlationUnitLimit: 2_000,
    },
    analyzedAt: "2026-08-22T00:00:00.000Z",
    projectionReference: null,
    executionProvenance: {
      schemaVersion: 1,
      configuration: config,
      analysisKind: "ona",
      networkType: "ordered",
      nodePositionMethod: "directed",
      directionalMask: config.directionalMask,
      ordering: {
        requestedPolicy: config.orderPolicy,
        resolvedPolicy: {
          kind: "columns",
          columns: ["turn"],
          comparators: { turn: "number" },
          direction: "ascending",
          missing: "reject",
          ties: "reject",
          stable: true,
        },
        responseRowSourceIndices: [0, 1, 2, 3],
      },
    },
  } as unknown as OpenEnaResult;
  return { result, config };
}

test("overall ordered plot uses the equal-unit weighted mean and never a two-group subtraction", () => {
  const { result, config } = orderedFixture();
  const model = buildOpenEnaOrderedPlotModel({
    result,
    config,
    scope: { kind: "overall" },
    xDimension: "SVD1",
    yDimension: "SVD2",
    edgeThreshold: 0,
  });

  const aToB = model.edges.find((edge) => edge.ground === "A" && edge.response === "B");
  assert.ok(aToB);
  assert.equal(aToB.normalizedMeanWeight, 0.5, "(1×0.8 + 3×0.4) / 4");
  assert.equal(aToB.rawAggregateCount, 20);
  assert.equal(aToB.chevron, true, "A→B is stronger than B→A in the overall mean");
  assert.equal(model.scopeLabel, "Overall ordered network");
  assert.equal(model.weightDefinition, "equal-unit normalized mean");
});

test("direction decisions are pairwise, exact ties show both chevrons, and masks stay asymmetric", () => {
  const { result, config } = orderedFixture();
  const model = buildOpenEnaOrderedPlotModel({
    result,
    config,
    scope: { kind: "group", name: "first" },
    xDimension: "SVD1",
    yDimension: "SVD2",
    edgeThreshold: 0,
  });

  const aToB = model.edges.find((edge) => edge.ground === "A" && edge.response === "B");
  const bToA = model.edges.find((edge) => edge.ground === "B" && edge.response === "A");
  const aToC = model.edges.find((edge) => edge.ground === "A" && edge.response === "C");
  const cToA = model.edges.find((edge) => edge.ground === "C" && edge.response === "A");
  assert.equal(aToB?.chevron, true);
  assert.equal(bToA?.chevron, false);
  assert.equal(aToC?.chevron, true);
  assert.equal(cToA?.chevron, true, "an exact reverse tie marks both directions");
  assert.equal(cToA?.maskEnabled, false, "C ground → A response is independently masked");
  assert.equal(aToC?.maskEnabled, true);
  assert.ok(!model.visibleEdges.some((edge) => edge.ground === "C" && edge.response === "A"));
});

test("edge geometry is a source-apex / response-base triangle whose presentation scale changes the filled glyph", () => {
  const glyph = buildOrderedEdgeGlyph({
    source: { x: 10, y: 50 },
    target: { x: 110, y: 50 },
    sourceRadius: 10,
    targetRadius: 14,
    relativeMagnitude: 0.5,
    visualScale: 1,
    lane: 1,
    showChevron: true,
  });

  assert.match(glyph.trianglePath, /^M 20(?:\.\d+)? 55(?:\.\d+)? L /);
  assert.match(glyph.hitPath, /^M /);
  assert.ok(glyph.chevronPath?.startsWith("M "));
  for (const value of Object.values(glyph.points).flatMap((point) => [point.x, point.y])) {
    assert.ok(Number.isFinite(value));
  }
  const small = buildOrderedEdgeGlyph({
    source: { x: 10, y: 50 },
    target: { x: 110, y: 50 },
    sourceRadius: 10,
    targetRadius: 14,
    relativeMagnitude: 0.5,
    visualScale: 0.5,
    lane: 1,
    showChevron: true,
  });
  const large = buildOrderedEdgeGlyph({
    source: { x: 10, y: 50 },
    target: { x: 110, y: 50 },
    sourceRadius: 10,
    targetRadius: 14,
    relativeMagnitude: 0.5,
    visualScale: 2,
    lane: 1,
    showChevron: true,
  });
  assert.notEqual(small.trianglePath, large.trianglePath);
  assert.notEqual(small.chevronPath, large.chevronPath);
  assert.ok(
    Math.hypot(
      large.points.baseLeft.x - large.points.baseRight.x,
      large.points.baseLeft.y - large.points.baseRight.y,
    ) > Math.hypot(
      small.points.baseLeft.x - small.points.baseRight.x,
      small.points.baseLeft.y - small.points.baseRight.y,
    ),
  );
  assert.throws(() => buildOrderedEdgeGlyph({
    source: { x: 1, y: 1 },
    target: { x: 1, y: 1 },
    sourceRadius: 10,
    targetRadius: 10,
    relativeMagnitude: 1,
    visualScale: 1,
    lane: 1,
    showChevron: false,
  }), /distinct source and response nodes/);
});

test("node sizing uses response-code totals when supplied and explicitly labels the fallback statistic", () => {
  const { result, config } = orderedFixture();
  const supplied: OpenEnaOrderedNodeTotals = {
    schemaVersion: 1,
    codeOrder: codes,
    overallResponseCodeTotals: [100, 4, 1],
    groups: [
      { name: "first", unitCount: 1, responseCodeTotals: [8, 2, 1] },
      { name: "second", unitCount: 3, responseCodeTotals: [92, 2, 0] },
    ],
  };
  const exact = buildOpenEnaOrderedPlotModel({
    result,
    config,
    scope: { kind: "overall" },
    xDimension: "SVD1",
    yDimension: "SVD2",
    edgeThreshold: 0,
    nodeTotals: supplied,
  });
  assert.equal(exact.nodeSizeDefinition, "raw response-code total");
  assert.ok((exact.nodes.find((node) => node.code === "A")?.radius ?? 0)
    > (exact.nodes.find((node) => node.code === "B")?.radius ?? 0));

  const fallback = buildOpenEnaOrderedPlotModel({
    result,
    config,
    scope: { kind: "overall" },
    xDimension: "SVD1",
    yDimension: "SVD2",
    edgeThreshold: 0,
  });
  assert.equal(fallback.nodeSizeDefinition, "incoming normalized directed mass (response-total fallback)");
});

test("the ordered SVG renders scaled triangles, pair chevrons, self inner discs, raw tooltips, and one external edge-list stop", async () => {
  const { result, config } = orderedFixture();
  const { default: OpenEnaOrderedPlot } = await import("../components/open-ena/OpenEnaOrderedPlot");
  const markup = renderToStaticMarkup(createElement(OpenEnaOrderedPlot, {
    result,
    config,
    scope: { kind: "overall" },
    xDimension: "SVD1",
    yDimension: "SVD2",
    edgeThreshold: 0,
    edgeScale: 1,
    pointScale: 1,
    textScale: 1,
    plotZoom: 1,
    flipX: false,
    flipY: false,
    showPoints: true,
    showNetworks: true,
    showLabels: true,
    showUnitLabels: false,
    showVariance: true,
    compact: false,
  }));

  assert.match(markup, /data-testid="open-ena-ordered-plot"/);
  assert.match(markup, /<svg[^>]*role="group"[^>]*class="open-ena-ordered-svg"/);
  assert.match(markup, /data-ona-edge-glyph="broadcast-triangle"/);
  assert.match(markup, /data-ona-ground="A"[^>]*data-ona-response="B"/);
  assert.match(markup, /data-ona-chevron="A-to-B"/);
  assert.match(markup, /data-ona-self-loop="A"/);
  assert.match(markup, /A ground\/source → B response\/target/);
  assert.match(markup, /raw aggregate count 20/);
  assert.match(markup, /aria-label="Visible directed connections"/);
  assert.match(markup, /data-ona-edge-hit-target="true"[^>]*aria-hidden="true"/);
  assert.doesNotMatch(markup, /data-ona-edge-hit-target[^>]*tabindex=/);
  assert.doesNotMatch(markup, /data-ona-self-loop[^>]*tabindex=/);
  assert.doesNotMatch(markup, /<li[^>]*tabindex=/);
  assert.doesNotMatch(markup, /<line[^>]*data-ona-ground=/, "self-connections and directed edges must never use a degenerate line glyph");

  const compactMarkup = renderToStaticMarkup(createElement(OpenEnaOrderedPlot, {
    result,
    config,
    scope: { kind: "group", name: "first" },
    xDimension: "SVD1",
    yDimension: "SVD2",
    edgeThreshold: 0,
    edgeScale: 2,
    pointScale: 1,
    textScale: 1,
    plotZoom: 1,
    flipX: true,
    flipY: false,
    showPoints: false,
    showNetworks: true,
    showLabels: true,
    showUnitLabels: false,
    showVariance: false,
    compact: true,
    copy: {
      groundSourceLabel: "來源",
      responseTargetLabel: "回應",
      directionLegendLabel: "順序網絡方向圖例",
      flippedLabel: "已翻轉",
    },
  }));
  assert.match(compactMarkup, /aria-label="順序網絡方向圖例"/);
  assert.match(compactMarkup, /A 來源 → B 回應/);
  assert.match(compactMarkup, /SVD1 · 已翻轉/);
  assert.match(compactMarkup, /<svg[^>]*viewBox="0 0 920 430"/);
  assert.doesNotMatch(compactMarkup, /data-ona-unit-shape-legend="true"/);
  assert.match(compactMarkup, /<details[^>]*class="ona-visible-edge-summary"/);
});

test("six ONA groups use circle markers with stable non-color inner styles and an accessible numbered legend", async () => {
  const { result, config } = orderedFixture();
  const { default: OpenEnaOrderedPlot } = await import("../components/open-ena/OpenEnaOrderedPlot");
  const groupNames = ["zeta", "alpha", "echo", "bravo", "delta", "charlie"];
  const sixGroupResult = structuredClone(result);
  sixGroupResult.groups = groupNames.map((name, index) => ({
    ...sixGroupResult.groups[index % sixGroupResult.groups.length],
    name,
    count: 1,
    pointCount: 1,
    color: "#52636a",
  }));
  sixGroupResult.set.points = groupNames.map((group, index) => ({
    ENA_UNIT: `unit-${index + 1}`,
    group,
    SVD1: -0.75 + index * 0.3,
    SVD2: index % 2 === 0 ? -0.25 : 0.25,
  }));

  const render = (candidate: OpenEnaResult) => renderToStaticMarkup(createElement(OpenEnaOrderedPlot, {
    result: candidate,
    config,
    scope: { kind: "overall" },
    xDimension: "SVD1",
    yDimension: "SVD2",
    edgeThreshold: 0,
    edgeScale: 1,
    pointScale: 1,
    textScale: 1,
    plotZoom: 1,
    flipX: false,
    flipY: false,
    showPoints: true,
    showNetworks: true,
    showLabels: true,
    showUnitLabels: false,
    showVariance: true,
    compact: false,
  }));
  const styleMap = (markup: string) => new Map(
    [...markup.matchAll(/data-ona-unit-point="true"[^>]*data-ona-group="([^"]+)"[^>]*data-ona-point-shape="circle"[^>]*data-ona-point-style="([^"]+)"/g)]
      .map((match) => [match[1], match[2]]),
  );

  const markup = render(sixGroupResult);
  const reordered = structuredClone(sixGroupResult);
  reordered.groups.reverse();
  const reorderedMarkup = render(reordered);
  const mapping = styleMap(markup);
  const exportTarget = markup.match(/<svg[^>]*class="open-ena-ordered-svg"[^>]*>[\s\S]*?<\/svg>/)?.[0];

  assert.equal(mapping.size, 6);
  assert.equal(new Set(mapping.values()).size, 6, "six groups must remain distinguishable without color");
  assert.deepEqual(styleMap(reorderedMarkup), mapping, "group-name-to-style mapping must ignore result group order");
  const pointGroups = [...markup.matchAll(/<g[^>]*data-ona-unit-point="true"[^>]*>([\s\S]*?)<\/g>/g)];
  assert.equal(pointGroups.length, 6);
  for (const pointGroup of pointGroups) {
    const wrapper = pointGroup[0].match(/^<g[^>]*>/)?.[0] ?? "";
    assert.match(wrapper, /data-ona-point-shape="circle"/);
    assert.match(wrapper, /data-ona-point-style="(?:solid|inner-ring|center-dot|horizontal-bar|plus|cross)"/);
    assert.match(wrapper, /role="img"/);
    assert.match(wrapper, /aria-label="[^"]*unit-[1-6][^"]*group[^"]*horizontal axis[^"]*vertical axis[^"]*"/i);
    assert.match(pointGroup[1], /^<title>[^<]+<\/title>/, "the wrapper title must be its first accessible description child");
    assert.equal(pointGroup[1].match(/<(circle|line|path|rect|polygon)\b/)?.[1], "circle", "the first graphic element must be the analytic-unit outer circle");
    assert.doesNotMatch(pointGroup[1], /<(?:rect|polygon)\b/, "unit marker glyphs may not use rect or polygon");
  }
  assert.ok(exportTarget, "the plot must expose its main SVG export target");
  assert.match(exportTarget, /^<svg[^>]*viewBox="0 0 920 682"/);
  assert.match(exportTarget, /role="list"[^>]*class="ona-unit-shape-legend-svg"[^>]*data-ona-unit-shape-legend="true"[^>]*aria-label="units"/);
  const sortedGroupNames = [...groupNames].sort((left, right) => left.localeCompare(right));
  const englishStyleNames = getOpenEnaCopy("en").ona.plot.pointStyleNames;
  for (const [index, group] of sortedGroupNames.entries()) {
    const style = mapping.get(group) as OpenEnaUnitPointStyle | undefined;
    assert.ok(style);
    const legendEntry = exportTarget.match(new RegExp(`<g[^>]*data-ona-group-legend="${group}"[^>]*data-ona-point-shape="circle"[^>]*data-ona-point-style="${style}"[^>]*>[\\s\\S]*?<\\/g>`))?.[0];
    assert.ok(legendEntry, `${group} legend entry must be nested in the exported SVG`);
    assert.match(legendEntry, /<circle\b[^>]*fill="#52636a"/, "each exported legend entry must include its marker example and color");
    assert.match(legendEntry, new RegExp(`<desc>[^<]*${group}[^<]*color #52636a[^<]*${englishStyleNames[style]}[^<]*<\\/desc>`));
    assert.match(legendEntry, new RegExp(`<text[^>]*>[\\s\\S]*?<tspan[^>]*>${index + 1}\\. ${group}<\\/tspan>[\\s\\S]*?<\\/text>`), "legend must visibly number the stable group order");
  }
  assert.equal((markup.match(/data-ona-unit-shape-legend="true"/g) ?? []).length, 1, "the exported SVG legend must be authoritative, not duplicated externally");
});

test("the existing two-group ONA fixture renders both analytic-unit groups as circles", async () => {
  const { result, config } = orderedFixture();
  const { default: OpenEnaOrderedPlot } = await import("../components/open-ena/OpenEnaOrderedPlot");
  const markup = renderToStaticMarkup(createElement(OpenEnaOrderedPlot, {
    result,
    config,
    scope: { kind: "overall" },
    xDimension: "SVD1",
    yDimension: "SVD2",
    edgeThreshold: 0,
    edgeScale: 1,
    pointScale: 1,
    textScale: 1,
    plotZoom: 1,
    flipX: false,
    flipY: false,
    showPoints: true,
    showNetworks: true,
    showLabels: true,
    showUnitLabels: false,
    showVariance: true,
    compact: false,
  }));

  const pointWrappers = [...markup.matchAll(/<g[^>]*data-ona-unit-point="true"[^>]*>/g)].map((match) => match[0]);
  assert.equal(pointWrappers.length, 4);
  assert.deepEqual(new Set(pointWrappers.map((wrapper) => wrapper.match(/data-ona-group="([^"]+)"/)?.[1])), new Set(["first", "second"]));
  for (const wrapper of pointWrappers) {
    assert.match(wrapper, /data-ona-point-shape="circle"/);
    assert.match(wrapper, /data-ona-point-style="(?:solid|inner-ring|center-dot|horizontal-bar|plus|cross)"/);
  }
  const pointGroups = [...markup.matchAll(/<g[^>]*data-ona-unit-point="true"[^>]*>([\s\S]*?)<\/g>/g)];
  assert.equal(pointGroups.length, 4);
  for (const pointGroup of pointGroups) {
    assert.match(pointGroup[1], /^<title>[^<]+<\/title>/);
    assert.equal(pointGroup[1].match(/<(circle|line|path|rect|polygon)\b/)?.[1], "circle");
  }
});

test("unit point style assignments are deterministic for empty, duplicate, reordered, cycling, case, and Unicode names", () => {
  const assignments = unitPointStyleContract.openEnaUnitPointStyleAssignments;
  assert.deepEqual([...assignments([])], []);
  const names = ["中文", "alpha", "Alpha", "éclair", "zeta", "bravo", "charlie", "delta", "echo", "foxtrot", "alpha"];
  const expected = [...assignments(names)];
  assert.equal(expected.length, 10, "duplicate group names must be removed");
  assert.deepEqual([...assignments([...names].reverse())], expected, "input order must not affect assignments");
  assert.deepEqual(expected.map(([name]) => name), ["Alpha", "alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "zeta", "éclair", "中文"]);
  assert.equal(expected[0]?.[1], "solid");
  assert.equal(expected[6]?.[1], "solid", "the seventh sorted group must cycle to the first style");
});

function relativeLuminance(hex: string) {
  const normalized = hex.slice(1);
  const channels = [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255);
  return channels.map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  )).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrastRatio(left: string, right: string) {
  const [lighter, darker] = [relativeLuminance(left), relativeLuminance(right)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

test("unit point inner glyph colors remain contrast-safe on default, white, near-white, dark, and shorthand fills", () => {
  const glyphColors = Reflect.get(unitPointStyleContract, "openEnaUnitPointGlyphColors") as unknown;
  assert.equal(typeof glyphColors, "function", "the shared style module must export a contrast-safe glyph-color resolver");
  if (typeof glyphColors !== "function") return;
  for (const fill of ["#d27448", "#39736e", "#ffffff", "#f8f9fa", "#111827", "#ABC"]) {
    const colors = glyphColors(fill) as { foreground: string; halo: string | null };
    assert.match(colors.foreground, /^#[0-9a-f]{6}$/i);
    const normalizedFill = fill.length === 4
      ? `#${[...fill.slice(1)].map((value) => value.repeat(2)).join("")}`
      : fill;
    assert.ok(contrastRatio(normalizedFill, colors.foreground) >= 4.5, `${fill} must have high-contrast inner glyphs`);
  }
  const fallback = glyphColors("var(--unknown-color)") as { foreground: string; halo: string | null };
  assert.match(fallback.foreground, /^#[0-9a-f]{6}$/i);
  assert.match(fallback.halo ?? "", /^#[0-9a-f]{6}$/i, "unparseable fills need a dual-contrast fallback");
});

test("twelve long English and Chinese group names wrap completely below the plot with dynamic export height", async () => {
  const { result, config } = orderedFixture();
  const { default: OpenEnaOrderedPlot } = await import("../components/open-ena/OpenEnaOrderedPlot");
  const names = [
    "Advanced collaborative epistemic reasoning cohort alpha",
    "以協作知識建構為核心的第一研究群組",
    "面向人工智能协作学习的第二研究组",
    "Evidence-centered discussion and reflection community",
    "跨學科問題解決與反思實踐共同體",
    "跨学科问题解决与反思实践共同体",
    "Knowledge building regulation and synthesis cohort",
    "多語言協作探究與論證學習群組",
    "多语言协作探究与论证学习群组",
    "Sustained inquiry and collective improvement cohort",
    "資料驅動的共同調節學習研究群組",
    "数据驱动的共同调节学习研究组",
  ];
  const manyGroups = structuredClone(result);
  manyGroups.groups = names.map((name, index) => ({
    ...manyGroups.groups[index % manyGroups.groups.length],
    name,
    count: 1,
    pointCount: 1,
  }));
  manyGroups.set.points = names.map((group, index) => ({
    ENA_UNIT: `long-unit-${index + 1}`,
    group,
    SVD1: -0.8 + (index % 6) * 0.3,
    SVD2: -0.45 + Math.floor(index / 6) * 0.9,
  }));
  const markup = renderToStaticMarkup(createElement(OpenEnaOrderedPlot, {
    result: manyGroups,
    config,
    scope: { kind: "overall" },
    xDimension: "SVD1",
    yDimension: "SVD2",
    edgeThreshold: 0,
    edgeScale: 1,
    pointScale: 1,
    textScale: 1,
    plotZoom: 1,
    flipX: false,
    flipY: false,
    showPoints: true,
    showNetworks: true,
    showLabels: true,
    showUnitLabels: false,
    showVariance: true,
    compact: false,
  }));
  const exportTarget = markup.match(/<svg[^>]*class="open-ena-ordered-svg"[^>]*>[\s\S]*?<\/svg>/)?.[0] ?? "";
  const exportHeight = Number(exportTarget.match(/viewBox="0 0 920 ([0-9.]+)"/)?.[1]);
  assert.ok(exportHeight > 742, "wrapped rows must grow beyond the old fixed four-row legend height");
  const entries = [...exportTarget.matchAll(/<g[^>]*data-ona-group-legend="([^"]+)"[^>]*data-ona-legend-row="([0-9]+)"[^>]*data-ona-legend-line-count="([0-9]+)"[^>]*transform="translate\(([0-9.]+) ([0-9.]+)\)"[^>]*>([\s\S]*?)<\/g>/g)];
  assert.equal(entries.length, 12);
  assert.deepEqual(new Set(entries.map((entry) => Number(entry[2]))), new Set([0, 1, 2, 3]));
  const rows = new Map<number, { y: number; maximumLines: number }>();
  for (const [group, row, lineCount, x, y, body] of entries.map((entry) => entry.slice(1))) {
    assert.ok(Number(x) >= 0 && Number(x) < 920, `${group} must stay within the SVG width`);
    assert.ok(Number(y) > 590, `${group} row ${row} must remain below the plotting area`);
    const text = body.match(new RegExp(`<text[^>]*data-ona-legend-label="${group}"[^>]*>([\\s\\S]*?)<\\/text>`))?.[1] ?? "";
    const lines = [...text.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((match) => match[1]);
    assert.equal(lines.length, Number(lineCount));
    for (const line of lines) {
      const displayWidth = [...line].reduce((sum, character) => (
        sum + (/[^\u0000-\u00ff]/u.test(character) ? 2 : 1)
      ), 0);
      assert.ok(displayWidth <= 36, `${group} line must fit its deterministic SVG column without clipping`);
    }
    const number = [...names].sort((left, right) => left < right ? -1 : left > right ? 1 : 0).indexOf(group) + 1;
    assert.equal(lines.join(""), `${number}. ${group}`, "wrapped tspans must preserve the complete visible numbered group name without truncation");
    const rowIndex = Number(row);
    const current = rows.get(rowIndex);
    rows.set(rowIndex, {
      y: Number(y),
      maximumLines: Math.max(current?.maximumLines ?? 0, Number(lineCount)),
    });
  }
  const orderedRows = [...rows.entries()].sort(([left], [right]) => left - right);
  for (let index = 1; index < orderedRows.length; index += 1) {
    const previous = orderedRows[index - 1][1];
    const current = orderedRows[index][1];
    assert.ok(current.y - previous.y >= Math.max(30, previous.maximumLines * 16 + 8), "legend rows must use the preceding row's maximum wrapped-line height");
  }
});

test("ordered point and legend metadata use human-readable localized copy without implementation slugs", async () => {
  const { result, config } = orderedFixture();
  const { default: OpenEnaOrderedPlot } = await import("../components/open-ena/OpenEnaOrderedPlot");
  const locales = [
    { locale: "en" as const, expected: /Analytic unit|Group|horizontal axis|vertical axis/ },
    { locale: "zh-hant" as const, expected: /分析單位|群組|橫軸|縱軸/ },
    { locale: "zh-hans" as const, expected: /分析单位|组|横轴|纵轴/ },
  ];
  for (const { locale, expected } of locales) {
    const copy = getOpenEnaCopy(locale).ona.plot;
    const localizedStyles = Object.values(copy.pointStyleNames);
    assert.equal(localizedStyles.length, 6);
    assert.equal(new Set(localizedStyles).size, 6);
    assert.doesNotMatch(localizedStyles.join(" "), /inner-ring|center-dot|horizontal-bar/);
    const markup = renderToStaticMarkup(createElement(OpenEnaOrderedPlot, {
      result,
      config,
      scope: { kind: "overall" },
      xDimension: "SVD1",
      yDimension: "SVD2",
      edgeThreshold: 0,
      edgeScale: 1,
      pointScale: 1,
      textScale: 1,
      plotZoom: 1,
      flipX: false,
      flipY: false,
      showPoints: true,
      showNetworks: true,
      showLabels: true,
      showUnitLabels: false,
      showVariance: true,
      compact: false,
      copy,
    }));
    const metadata = [...markup.matchAll(/aria-label="([^"]*)"|<(?:title|desc)>([^<]*)<\/(?:title|desc)>/g)]
      .map((match) => match[1] ?? match[2] ?? "")
      .join("\n");
    assert.match(metadata, expected);
    assert.doesNotMatch(metadata, /inner-ring|center-dot|horizontal-bar/);
    if (locale !== "en") assert.doesNotMatch(metadata, /\b(?:Unit|Group|color|point style|circle marker)\b/i);
  }
});

test("malformed ordered adjacency and nonfinite scientific values fail closed", () => {
  const { result, config } = orderedFixture();
  const malformed = structuredClone(result);
  malformed.set.adjacencyKey[2] = {
    ...malformed.set.adjacencyKey[2],
    sourceIndex: 0,
  };
  assert.throws(() => buildOpenEnaOrderedPlotModel({
    result: malformed,
    config,
    scope: { kind: "overall" },
    xDimension: "SVD1",
    yDimension: "SVD2",
    edgeThreshold: 0,
  }), /response-major, ground-minor/);

  const nonfinite = structuredClone(result);
  nonfinite.groups[0].meanWeights["A & B"] = Number.POSITIVE_INFINITY;
  assert.throws(() => buildOpenEnaOrderedPlotModel({
    result: nonfinite,
    config,
    scope: { kind: "group", name: "first" },
    xDimension: "SVD1",
    yDimension: "SVD2",
    edgeThreshold: 0,
  }), /finite nonnegative/);
});
