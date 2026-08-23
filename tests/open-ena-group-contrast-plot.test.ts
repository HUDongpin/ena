import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { OpenEnaGroupContrastProps } from "../components/open-ena/OpenEnaGroupContrast";
import type { OpenEnaPairwiseContrast } from "../lib/open-ena/contrasts";

const componentPath = join(process.cwd(), "components", "open-ena", "OpenEnaGroupContrast.tsx");

const contrast = {
  groupColumn: "condition",
  declaredGroups: [
    { name: "Studio", unitCount: 2, pointCount: 2 },
    { name: "Seminar", unitCount: 2, pointCount: 2 },
  ],
  groupOrder: ["Studio", "Seminar"],
  axes: ["SVD1", "SVD2"],
  coordinateExtent: { minX: -10, maxX: 30, minY: -20, maxY: 20 },
  officialPlotFrame: {
    source: "webena-points-rotated-scaled",
    pointScaleFactor: 2,
    maxPosition: 4,
    extremePosition: 4.8,
  },
  configuration: {
    unitColumns: ["unit"],
    conversationColumns: ["conversation"],
    groupColumn: "condition",
    codes: ["Evidence", "Reflection", "Revision"],
    model: "EndPoint",
    window: "Conversation",
    windowSizeBack: 1,
    windowSizeForward: 0,
    weightBy: "binary",
    rotation: "svd",
    referenceRotationId: null,
    centerAlignToOrigin: true,
  },
  resultProvenance: {
    analyzedAt: "2026-08-13T01:00:00.000Z",
    model: "EndPoint",
    dimensions: ["SVD1", "SVD2", "SVD3"],
    sourceDatasetNormalizedUtf8TextSha256: "a".repeat(64),
    sourceBindingStatus: "bound",
    projectionReference: null,
    rotationMethod: "svd",
    referenceId: null,
    fit: {
      method: "svd",
      unitColumns: ["unit"],
      conversationColumns: ["conversation"],
    },
  },
  geometry: {
    codes: ["Evidence", "Reflection", "Revision"],
    dimensions: ["SVD1", "SVD2", "SVD3"],
    adjacencyKey: [
      { source: "Evidence", target: "Reflection", name: "Evidence & Reflection", sourceIndex: 0, targetIndex: 1 },
      { source: "Evidence", target: "Revision", name: "Evidence & Revision", sourceIndex: 0, targetIndex: 2 },
      { source: "Reflection", target: "Revision", name: "Reflection & Revision", sourceIndex: 1, targetIndex: 2 },
    ],
    rotationColumns: ["SVD1", "SVD2", "SVD3"],
    rotationMatrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    eigenvalues: [1, 0.5, 0.25],
    centerVector: [0, 0, 0],
    variance: { SVD1: 0.5, SVD2: 0.3, SVD3: 0.2 },
    nodes: [
      { code: "Evidence", coordinates: { SVD1: -1, SVD2: 0.5, SVD3: 0 } },
      { code: "Reflection", coordinates: { SVD1: 0, SVD2: 1, SVD3: 0 } },
      { code: "Revision", coordinates: { SVD1: 1, SVD2: -0.5, SVD3: 0 } },
    ],
  },
  primary: {
    name: "Studio",
    unitCount: 2,
    unitIds: ["private-studio-01", "private-studio-02"],
    points: [
      { unitId: "private-studio-01", group: "Studio", x: -1.2, y: 0.4 },
      { unitId: "private-studio-02", group: "Studio", x: -0.2, y: 0.1 },
    ],
    meanPoint: { SVD1: -0.7, SVD2: 0.25 },
    meanWeights: {
      "Evidence & Reflection": 0.9,
      "Evidence & Revision": 0.1,
      "Reflection & Revision": 0.2,
    },
  },
  secondary: {
    name: "Seminar",
    unitCount: 2,
    unitIds: ["private-seminar-01", "private-seminar-02"],
    points: [
      { unitId: "private-seminar-01", group: "Seminar", x: 0.4, y: -0.2 },
      { unitId: "private-seminar-02", group: "Seminar", x: 1.1, y: -0.7 },
    ],
    meanPoint: { SVD1: 0.75, SVD2: -0.45 },
    meanWeights: {
      "Evidence & Reflection": 0.3,
      "Evidence & Revision": 0.6,
      "Reflection & Revision": 0.2,
    },
  },
  nodes: [
    { code: "Evidence", x: -1, y: 0.5 },
    { code: "Reflection", x: 0, y: 1 },
    { code: "Revision", x: 1, y: -0.5 },
  ],
  edges: [
    {
      source: "Evidence",
      target: "Reflection",
      name: "Evidence & Reflection",
      primaryWeight: 0.9,
      secondaryWeight: 0.3,
      signedDifference: 0.6,
      stronger: "primary",
    },
    {
      source: "Evidence",
      target: "Revision",
      name: "Evidence & Revision",
      primaryWeight: 0.1,
      secondaryWeight: 0.6,
      signedDifference: -0.5,
      stronger: "secondary",
    },
    {
      source: "Reflection",
      target: "Revision",
      name: "Reflection & Revision",
      primaryWeight: 0.2,
      secondaryWeight: 0.2,
      signedDifference: 0,
      stronger: "equal",
    },
  ],
  edgeScaleDenominators: {
    difference: 0.6,
    sharedMean: 0.9,
    differenceDefinition: "maximum absolute Primary-minus-Secondary edge difference",
    sharedMeanDefinition: "shared maximum absolute Primary or Secondary mean edge weight",
  },
  inference: null,
  createdAt: "2026-08-13T01:01:00.000Z",
  boundaries: [],
} as OpenEnaPairwiseContrast;

const defaultProps = {
  contrast,
  edgeThreshold: 0,
  showPoints: true,
  showNetworks: true,
  showLabels: true,
  showGroupLabels: true,
  showUnitLabels: false,
  unitCircle: false,
  showVariance: true,
  edgeScale: 1,
  pointScale: 1,
  plotZoom: 1,
  flipX: false,
  flipY: false,
} satisfies OpenEnaGroupContrastProps;

async function render(props: Partial<OpenEnaGroupContrastProps> = {}) {
  assert.ok(existsSync(componentPath), "OpenEnaGroupContrast.tsx must implement the pairwise comparison surface");
  const { default: OpenEnaGroupContrast } = await import("../components/open-ena/OpenEnaGroupContrast");
  const mergedProps: OpenEnaGroupContrastProps = { ...defaultProps, ...props };
  return renderToStaticMarkup(createElement(OpenEnaGroupContrast, mergedProps));
}

function plotSvg(markup: string, testId: string) {
  return markup.match(new RegExp(`<svg[^>]*data-testid="${testId}"[\\s\\S]*?<\\/svg>`))?.[0] ?? "";
}

function edgeLineTags(svg: string) {
  return [...svg.matchAll(/<line\b[^>]*data-ena-edge="[^"]+"[^>]*>/g)].map((match) => match[0]);
}

function unitPointTags(svg: string) {
  return [...svg.matchAll(/<g\b[^>]*data-ena-unit-point="true"[^>]*>/g)].map((match) => match[0]);
}

function tagAttribute(tag: string, name: string) {
  return tag.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? "";
}

function codeNodeCircle(svg: string, code: string) {
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return svg.match(new RegExp(
    `<g\\b[^>]*aria-label="${escaped} code node"[^>]*>[\\s\\S]*?<circle\\b[^>]*data-ena-code-node="neutral"[^>]*>`,
  ))?.[0].match(/<circle\b[^>]*data-ena-code-node="neutral"[^>]*>/)?.[0] ?? "";
}

function codeNodePosition(svg: string, code: string) {
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const transform = svg.match(new RegExp(
    `<g\\b(?=[^>]*transform="translate\\(([^ ]+) ([^)]+)\\)")(?=[^>]*aria-label="${escaped} code node")[^>]*>`,
  ));
  return transform ? { x: Number(transform[1]), y: Number(transform[2]) } : null;
}

test("pairwise contrast renders stable Comparison, Primary, and Secondary 2D panels", async () => {
  const markup = await render();

  assert.match(markup, /data-testid="open-ena-group-contrast"/);
  assert.match(markup, /data-ena-dimensions="2"/);
  assert.match(markup, /data-testid="open-ena-group-comparison-plot"/);
  assert.match(markup, /data-testid="open-ena-group-primary-plot"/);
  assert.match(markup, /data-testid="open-ena-group-secondary-plot"/);
  assert.match(markup, />Comparison Plot</);
  assert.match(markup, />Primary Plot</);
  assert.match(markup, />Secondary Plot</);
  assert.doesNotMatch(markup, />(?:COMPARISON|PRIMARY|SECONDARY) PLOT</);
  assert.doesNotMatch(markup, /overlaid group means/);
  assert.match(markup, /Studio · 2 analytic units/);
  assert.match(markup, /Seminar · 2 analytic units/);
  assert.equal((markup.match(/Difference scale 0\.600 · scaled 1\.00x/g) ?? []).length, 1);
  assert.equal((markup.match(/Shared scale 0\.900 · scaled 1\.00x/g) ?? []).length, 2);
  assert.equal((markup.match(/<svg[^>]*aria-labelledby="[^"]+"/g) ?? []).length, 3);
});

test("all three plot roles disclose one compatible axis, variance, extent, and scale frame", async () => {
  const markup = await render({ edgeScale: 1.25, showVariance: true });

  assert.equal((markup.match(/data-ena-axis-frame="official-symmetric-max-position"/g) ?? []).length, 3);
  assert.equal((markup.match(/data-ena-axis-x="SVD1"/g) ?? []).length, 3);
  assert.equal((markup.match(/data-ena-axis-y="SVD2"/g) ?? []).length, 3);
  assert.equal((markup.match(/data-ena-axis-x-variance="0\.5"/g) ?? []).length, 3);
  assert.equal((markup.match(/data-ena-axis-y-variance="0\.3"/g) ?? []).length, 3);
  assert.equal((markup.match(/data-ena-official-point-position-scale="2"/g) ?? []).length, 3);
  assert.equal((markup.match(/data-ena-official-max-position="4"/g) ?? []).length, 3);
  assert.equal((markup.match(/data-ena-official-extreme-position="4\.8"/g) ?? []).length, 3);
  assert.equal((markup.match(/Difference scale 0\.600 · scaled 1\.25x · SVD1 50\.0% · SVD2 30\.0%/g) ?? []).length, 1);
  assert.equal((markup.match(/Shared scale 0\.900 · scaled 1\.25x · SVD1 50\.0% · SVD2 30\.0%/g) ?? []).length, 2);
});

test("official webENA frame scales analytic-unit evidence but preserves raw network-node geometry", async () => {
  const markup = await render();
  const comparison = plotSvg(markup, "open-ena-group-comparison-plot");

  assert.match(
    comparison,
    /<line x1="459\.75" y1="18\.5" x2="459\.75" y2="702\.5"><\/line><line x1="117\.75" y1="360\.5" x2="801\.75" y2="360\.5"><\/line>/,
    "the axes must occupy the official centered square rather than the full wide paper",
  );
  assert.match(
    comparison,
    /transform="translate\(288\.75 303\.5\)"[^>]*data-ena-unit-point="true"/,
    "unit coordinates use points.rotated.scaled presentation geometry",
  );
  assert.match(
    comparison,
    /transform="translate\(388\.5 324\.875\)"[^>]*aria-label="Evidence code node"/,
    "code-node coordinates remain in the raw fitted ENA geometry",
  );
});

test("unit, group-summary, and code-node encodings follow the official plot grammar", async () => {
  const markup = await render();
  const comparisonSvg = markup.match(/<svg[^>]*data-testid="open-ena-group-comparison-plot"[\s\S]*?<\/svg>/)?.[0] ?? "";

  assert.equal((comparisonSvg.match(/data-ena-unit-point="true"/g) ?? []).length, 4);
  assert.equal((comparisonSvg.match(/data-ena-unit-point="true"[^>]*data-ena-point-shape="circle"/g) ?? []).length, 4);
  assert.match(comparisonSvg, /data-ena-unit-point="true"[\s\S]*?data-ena-group-role="primary"[\s\S]*?<circle[^>]*fill="#cc423a"/);
  assert.match(comparisonSvg, /data-ena-unit-point="true"[\s\S]*?data-ena-group-role="secondary"[\s\S]*?<circle[^>]*fill="#218ebf"/);
  assert.equal((comparisonSvg.match(/data-ena-summary-marker="true"/g) ?? []).length, 2);
  assert.match(comparisonSvg, /data-ena-summary-marker="true"[^>]*data-ena-group-role="primary"[^>]*data-ena-point-shape="square"[^>]*data-ena-marker-size="11.5"/);
  assert.match(comparisonSvg, /data-ena-summary-marker="true"[^>]*data-ena-group-role="secondary"[^>]*data-ena-point-shape="square"[^>]*data-ena-marker-size="11.5"/);
  assert.equal((comparisonSvg.match(/<g\b(?=[^>]*data-ena-summary-marker="true")(?=[^>]*role="img")[^>]*>/g) ?? []).length, 2);
  assert.doesNotMatch(comparisonSvg, /<g\b(?=[^>]*data-ena-summary-marker="true")(?=[^>]*(?:role="button"|tabindex=|aria-pressed=|aria-controls=))[^>]*>/);
  assert.equal((comparisonSvg.match(/data-ena-code-node="neutral"/g) ?? []).length, 3);
  assert.equal(
    (comparisonSvg.match(/data-ena-code-node="neutral"[^>]*fill="#000000"[^>]*stroke="#000000"/g) ?? []).length,
    3,
    "code nodes default to black while retaining neutral analytical meaning",
  );
  assert.equal(Number(tagAttribute(codeNodeCircle(comparisonSvg, "Evidence"), "data-ena-code-node-size")), 5.5);
  assert.equal(Number(tagAttribute(codeNodeCircle(comparisonSvg, "Reflection"), "data-ena-code-node-size")), 3);
  assert.equal(Number(tagAttribute(codeNodeCircle(comparisonSvg, "Revision"), "data-ena-code-node-size")), 2.5);
});

test("official group labels default on beside comparison mean squares and remain independently hideable", async () => {
  const visible = plotSvg(await render({ showLabels: false, showGroupLabels: true }), "open-ena-group-comparison-plot");
  assert.match(visible, /class="ena-set-group-label"[^>]*>Studio<\/text>/);
  assert.match(visible, /class="ena-set-group-label"[^>]*>Seminar<\/text>/);
  assert.doesNotMatch(visible, />Evidence<|>Reflection<|>Revision</);

  const hidden = plotSvg(await render({ showLabels: true, showGroupLabels: false }), "open-ena-group-comparison-plot");
  assert.doesNotMatch(hidden, /class="ena-set-group-label"/);
  assert.match(hidden, />Evidence<|>Reflection<|>Revision</);
});

test("official axes retain their square camera endpoints as small neutral marks", async () => {
  const comparison = plotSvg(await render(), "open-ena-group-comparison-plot");
  assert.equal((comparison.match(/data-ena-axis-endpoint="true"/g) ?? []).length, 4);
  assert.match(comparison, /class="ena-set-axis-endpoint"[^>]*r="1\.5"/);

  const primary = plotSvg(await render(), "open-ena-group-primary-plot");
  assert.equal((primary.match(/data-ena-axis-endpoint="true"/g) ?? []).length, 4);
  assert.match(primary, /class="ena-set-axis-endpoint"[^>]*r="1\.5"/);
});

test("Comparison overlays both groups while each side plot isolates its selected role", async () => {
  const markup = await render();
  const comparisonSvg = markup.match(/<svg[^>]*data-testid="open-ena-group-comparison-plot"[\s\S]*?<\/svg>/)?.[0] ?? "";
  const primarySvg = markup.match(/<svg[^>]*data-testid="open-ena-group-primary-plot"[\s\S]*?<\/svg>/)?.[0] ?? "";
  const secondarySvg = markup.match(/<svg[^>]*data-testid="open-ena-group-secondary-plot"[\s\S]*?<\/svg>/)?.[0] ?? "";

  assert.match(comparisonSvg, /data-ena-plotted-group-roles="primary secondary"/);
  assert.match(primarySvg, /data-ena-plotted-group-roles="primary"/);
  assert.match(secondarySvg, /data-ena-plotted-group-roles="secondary"/);
  assert.equal((comparisonSvg.match(/data-ena-summary-marker="true"/g) ?? []).length, 2);
  assert.equal((primarySvg.match(/data-ena-summary-marker="true"/g) ?? []).length, 0);
  assert.equal((secondarySvg.match(/data-ena-summary-marker="true"/g) ?? []).length, 0);
  assert.equal((primarySvg.match(/data-ena-unit-point="true"/g) ?? []).length, 0);
  assert.equal((secondarySvg.match(/data-ena-unit-point="true"/g) ?? []).length, 0);
  assert.doesNotMatch(primarySvg, /data-ena-group-role="secondary"/);
  assert.doesNotMatch(secondarySvg, /data-ena-group-role="primary"/);
});

test("Data View can own only the center surface while side plots and right tools persist", async () => {
  const markup = await render({
    centerMode: "data",
    dataView: createElement("table", { "data-testid": "fixture-data-table" },
      createElement("tbody", null, createElement("tr", null, createElement("td", null, "Data record"))),
    ),
    rightTools: createElement("div", { "data-testid": "fixture-plot-tools" }, "Scale edge weights"),
  });

  assert.match(markup, /data-testid="open-ena-group-center-surface"[^>]*data-ena-center-mode="data"/);
  assert.match(markup, /data-testid="open-ena-group-data-view"/);
  assert.match(markup, /data-testid="fixture-data-table"/);
  assert.doesNotMatch(markup, /data-testid="open-ena-group-comparison-plot"/);
  assert.match(markup, /data-testid="open-ena-group-primary-plot"/);
  assert.match(markup, /data-testid="open-ena-group-secondary-plot"/);
  assert.match(markup, /data-testid="open-ena-group-right-tools"/);
  assert.match(markup, /data-testid="fixture-plot-tools"/);
});

test("comparison draws one signed-difference line per nonzero edge while side plots retain the shared mean denominator", async () => {
  const authoritativeContrast = structuredClone(contrast);
  authoritativeContrast.edgeScaleDenominators.difference = 0.625;
  authoritativeContrast.edgeScaleDenominators.sharedMean = 0.925;
  const markup = await render({ contrast: authoritativeContrast });
  const comparisonSvg = markup.match(/<svg[^>]*data-testid="open-ena-group-comparison-plot"[\s\S]*?<\/svg>/)?.[0] ?? "";
  const primarySvg = markup.match(/<svg[^>]*data-testid="open-ena-group-primary-plot"[\s\S]*?<\/svg>/)?.[0] ?? "";
  const secondarySvg = markup.match(/<svg[^>]*data-testid="open-ena-group-secondary-plot"[\s\S]*?<\/svg>/)?.[0] ?? "";

  assert.match(comparisonSvg, /data-ena-edge-scale-kind="signed-difference"/);
  assert.match(comparisonSvg, /data-ena-edge-scale-max="0.625"/);
  assert.match(comparisonSvg, /data-ena-signed-difference-scale-max="0.625"/);
  assert.match(primarySvg, /data-ena-edge-scale-kind="shared-group-mean"/);
  assert.match(primarySvg, /data-ena-edge-scale-max="0.925"/);
  assert.match(secondarySvg, /data-ena-edge-scale-kind="shared-group-mean"/);
  assert.match(secondarySvg, /data-ena-edge-scale-max="0.925"/);
  assert.match(markup, /data-ena-difference-edge-scale-max="0.625"/);
  assert.match(markup, /data-ena-shared-mean-edge-scale-max="0.925"/);
  assert.match(markup, /maximum absolute Primary-minus-Secondary edge difference/);
  assert.match(markup, /shared maximum absolute Primary or Secondary mean edge weight/);
  const lines = edgeLineTags(comparisonSvg);
  assert.equal(lines.length, 2, "the center must draw exactly one line for each nonzero signed difference");
  const positive = lines.find((line) => line.includes('data-ena-edge="Evidence &amp; Reflection"')) ?? "";
  const negative = lines.find((line) => line.includes('data-ena-edge="Evidence &amp; Revision"')) ?? "";
  assert.match(positive, /data-ena-sign="positive"/);
  assert.match(positive, /stroke="#cc423a"/);
  assert.match(negative, /data-ena-sign="negative"/);
  assert.match(negative, /stroke="#218ebf"/);
  assert.ok(Math.abs(Number(tagAttribute(positive, "stroke-width")) - 0.6 * 7.5) < 1e-12);
  assert.ok(Math.abs(Number(tagAttribute(negative, "stroke-width")) - 0.5 * 7.5) < 1e-12);
  assert.equal(Number(tagAttribute(positive, "stroke-opacity")), 1);
  assert.equal(Number(tagAttribute(negative, "stroke-opacity")), 0.3);
  assert.doesNotMatch(comparisonSvg, /data-ena-sign="equal"/, "zero differences must not be drawn as nonzero-width lines");
});

test("an all-zero signed contrast explains that there are no nonzero differences", async () => {
  const equalContrast = structuredClone(contrast);
  equalContrast.edges = equalContrast.edges.map((edge) => ({
    ...edge,
    secondaryWeight: edge.primaryWeight,
    signedDifference: 0,
    stronger: "equal" as const,
  }));
  equalContrast.edgeScaleDenominators.difference = 0;
  const markup = await render({ contrast: equalContrast });

  assert.match(markup, /data-testid="open-ena-group-no-nonzero-differences"/);
  assert.match(markup, /role="status"/);
  assert.match(markup, /No nonzero Primary-minus-Secondary edge differences/);
  assert.match(markup, /data-ena-difference-edge-scale-max="0"/);
  const comparisonSvg = markup.match(/<svg[^>]*data-testid="open-ena-group-comparison-plot"[\s\S]*?<\/svg>/)?.[0] ?? "";
  assert.equal(edgeLineTags(comparisonSvg).length, 0, "the all-zero center must not draw any network edges");
  assert.doesNotMatch(markup, /\b(?:NaN|Infinity|-Infinity)\b/);
});

test("plot roots are named images containing static summaries rather than reveal controls", async () => {
  const markup = await render();
  for (const testId of [
    "open-ena-group-comparison-plot",
    "open-ena-group-primary-plot",
    "open-ena-group-secondary-plot",
  ]) {
    const svg = plotSvg(markup, testId);
    const root = svg.match(/^<svg\b[^>]*>/)?.[0] ?? "";
    assert.match(root, /role="img"/, `${testId} exposes one static scientific figure`);
    assert.doesNotMatch(root, /aria-roledescription="interactive/i);
    const labelledBy = tagAttribute(root, "aria-labelledby").split(/\s+/u).filter(Boolean);
    assert.equal(labelledBy.length, 2, `${testId} must name itself with its title and description`);
    assert.match(svg, new RegExp(`<title id="${labelledBy[0]}">[^<]+<\\/title>`));
    assert.match(svg, new RegExp(`<desc id="${labelledBy[1]}">[^<]+<\\/desc>`));
    assert.doesNotMatch(svg, /role="button"|aria-pressed=|data-ena-point-reveal-state=/);
  }
});

test("coincident analytic units remain persistent circles at their unchanged coordinates", async () => {
  const coincident = structuredClone(contrast);
  coincident.primary.points = coincident.primary.points.map((point) => ({
    ...point,
    x: coincident.primary.meanPoint.SVD1,
    y: coincident.primary.meanPoint.SVD2,
  }));
  const svg = plotSvg(await render({ contrast: coincident }), "open-ena-group-comparison-plot");
  const primary = unitPointTags(svg).filter((tag) => tag.includes('data-ena-group-role="primary"'));

  assert.equal(primary.length, 2, "one persistent observation mark remains represented per analytic unit");
  assert.equal(new Set(primary.map((tag) => tagAttribute(tag, "transform"))).size, 1);
  assert.doesNotMatch(svg, /revealed-foreground|data-ena-overlap-count|data-ena-overlap-label|>×2<\/text>/);
});

test("large persistent point layers disclose deterministic sampling without reveal semantics", async () => {
  const large = structuredClone(contrast);
  large.primary.points = Array.from({ length: 2_500 }, (_, index) => ({
    unitId: `large-primary-${index}`,
    group: "Studio",
    x: index < 3 ? 5 : index / 100,
    y: index < 3 ? 5 : index / 200,
  }));
  large.primary.unitIds = large.primary.points.map((point) => point.unitId);
  large.primary.unitCount = large.primary.points.length;

  const markup = await render({ contrast: large });
  const comparison = plotSvg(markup, "open-ena-group-comparison-plot");
  assert.equal(unitPointTags(comparison).length, 2_002);
  assert.match(comparison, /data-ena-points-valid="2502"/);
  assert.match(comparison, /data-ena-points-shown="2002"/);
  assert.match(comparison, /Rendering 2002 sampled unit marks from 2502 valid analytic-unit points\./);
  assert.doesNotMatch(markup, /reveal|overlap-count|concentric/i);
});

test("all panels keep fixed SVG papers while flips and zoom stay inside clipped plot layers", async () => {
  const markup = await render({ flipX: true, flipY: true, plotZoom: 99 });
  const comparison = plotSvg(markup, "open-ena-group-comparison-plot");
  const primary = plotSvg(markup, "open-ena-group-primary-plot");
  const secondary = plotSvg(markup, "open-ena-group-secondary-plot");
  const plotSvgs = [comparison, primary, secondary];

  assert.equal((markup.match(/data-ena-extent-source="full-result"/g) ?? []).length, 3);
  assert.equal((markup.match(/data-ena-coordinate-extent="-10 30 -20 20"/g) ?? []).length, 3);
  assert.equal((markup.match(/data-ena-plot-zoom="2\.4"/g) ?? []).length, 3);
  plotSvgs.forEach((svg) => {
    const root = svg.match(/^<svg\b[^>]*>/)?.[0] ?? "";
    assert.doesNotMatch(root, /transform:\s*scale|transform-origin/);
    assert.ok(
      svg.indexOf('class="ena-set-plot-background"') < svg.indexOf('data-ena-plot-viewport="true"'),
      "the fixed white paper must remain outside the clipped zoom layer",
    );
  });
  assert.match(
    comparison,
    /<g\b(?=[^>]*data-ena-plot-content="true")(?=[^>]*data-ena-plot-zoom-layer="true")(?=[^>]*transform="translate\(460 361\.5\) scale\(2\.4\) translate\(-460 -361\.5\)")[^>]*>/,
  );
  assert.equal((markup.match(/transform="translate\(220 111\.5\) scale\(2\.4\) translate\(-220 -111\.5\)"/g) ?? []).length, 2);
  const clipIds = plotSvgs.map((svg) => svg.match(/<clipPath\b[^>]*id="([^"]+)"[^>]*>/)?.[1] ?? "");
  assert.ok(clipIds.every(Boolean), "every plot must declare a viewport clip path");
  assert.equal(new Set(clipIds).size, 3, "each inline SVG needs a unique clip-path identifier");
  plotSvgs.forEach((svg, index) => {
    const escapedClipId = clipIds[index].replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    assert.match(svg, new RegExp(`<g\\b(?=[^>]*data-ena-plot-viewport="true")(?=[^>]*clip-path="url\\(#${escapedClipId}\\)")[^>]*>`));
  });
  assert.match(markup, /SVD1 · 50\.0% · flipped/);
  assert.match(markup, /SVD2 · 30\.0% · flipped/);
  assert.doesNotMatch(markup, /data-ena-extent-source="derived-selected-points-and-nodes"/);
  assert.doesNotMatch(markup, /\b(?:NaN|Infinity|-Infinity)\b/);
});

test("variance labels follow the presentation toggle", async () => {
  const shown = await render({ showVariance: true });
  const hidden = await render({ showVariance: false });

  assert.match(shown, /SVD1 · 50\.0%/);
  assert.match(shown, /SVD2 · 30\.0%/);
  assert.doesNotMatch(hidden, /SVD1 · 50\.0%|SVD2 · 30\.0%/);
});

test("projected comparison figures carry fixed-reference identity and variance semantics inside the SVG", async () => {
  const projected = structuredClone(contrast);
  projected.resultProvenance.projectionReference = {
    schemaVersion: 1,
    kind: "open-ena-reference-rotation",
    app: "ENA.HK Open ENA",
    runtime: "jena-js",
    runtimeVersion: "0.7.0-ona.0",
    referenceId: "open-ena-ref:fixed-geometry-1234567890",
    name: "Independent reference geometry",
    source: {
      datasetName: "reference.csv",
      normalizedUtf8TextSha256: "c".repeat(64),
      analyzedAt: "2026-08-12T01:00:00.000Z",
    },
    fit: {
      method: "svd",
      unitColumns: ["unit"],
      conversationColumns: ["conversation"],
    },
    compatibility: {
      model: "EndPoint",
      codes: ["Evidence", "Reflection", "Revision"],
      window: "Conversation",
      windowSizeBack: "Infinity",
      windowSizeForward: 0,
      weightBy: "binary",
      centerAlignToOrigin: true,
      normalization: "sphere",
    },
  };
  const markup = await render({ contrast: projected });
  const comparisonSvg = markup.match(/<svg[^>]*data-testid="open-ena-group-comparison-plot"[\s\S]*?<\/svg>/)?.[0] ?? "";

  assert.match(comparisonSvg, /Projected into fixed reference/);
  assert.match(comparisonSvg, /ID open-ena-ref:fixed-geometry/);
  assert.match(comparisonSvg, /declared analyzed-table SHA-256 cccccccccccc…/);
  assert.match(comparisonSvg, /Reference: Independent reference geometry/);
  assert.match(comparisonSvg, /Variance shares describe current data in this fixed basis/);
});

test("unit rendering is capped, rejects non-finite points, and hides source identity in markup", async () => {
  const largeContrast = structuredClone(contrast);
  largeContrast.primary.points = Array.from({ length: 2_500 }, (_, index) => ({
    unitId: `private-learner-${index}`,
    group: "Studio",
    x: index / 2_500,
    y: -index / 2_500,
  }));
  largeContrast.primary.unitIds = largeContrast.primary.points.map((point) => point.unitId);
  largeContrast.primary.unitCount = largeContrast.primary.points.length;
  largeContrast.secondary.points.push({
    unitId: "private-nonfinite",
    group: "Seminar",
    x: Number.NaN,
    y: Number.POSITIVE_INFINITY,
  });
  const markup = await render({ contrast: largeContrast });
  const comparisonSvg = markup.match(/<svg[^>]*data-testid="open-ena-group-comparison-plot"[\s\S]*?<\/svg>/)?.[0] ?? "";
  const primarySvg = markup.match(/<svg[^>]*data-testid="open-ena-group-primary-plot"[\s\S]*?<\/svg>/)?.[0] ?? "";
  const secondarySvg = markup.match(/<svg[^>]*data-testid="open-ena-group-secondary-plot"[\s\S]*?<\/svg>/)?.[0] ?? "";

  assert.match(comparisonSvg, /data-ena-points-shown="2002"/);
  assert.match(comparisonSvg, /data-ena-points-valid="2502"/);
  assert.match(comparisonSvg, /data-ena-points-dropped="1"/);
  assert.equal((comparisonSvg.match(/data-ena-unit-point="true"/g) ?? []).length, 2_002);
  assert.equal((primarySvg.match(/data-ena-unit-point="true"/g) ?? []).length, 0);
  assert.equal((secondarySvg.match(/data-ena-unit-point="true"/g) ?? []).length, 0);
  assert.doesNotMatch(markup, /private-learner|private-studio|private-seminar|private-nonfinite/);
  assert.doesNotMatch(markup, /data-ena-point-key="[^"]*private/);
  assert.doesNotMatch(markup, /\b(?:NaN|Infinity|-Infinity)\b/);
});

test("unit and code labels have independent controls and unit labels are sanitized", async () => {
  const labelledContrast = structuredClone(contrast);
  labelledContrast.primary.points[0].unitId = "Learner\u0000 A with a deliberately very long private identifier 1234567890";
  const markup = await render({
    contrast: labelledContrast,
    showLabels: false,
    showUnitLabels: true,
  });

  assert.doesNotMatch(markup, />Evidence<|>Reflection<|>Revision</);
  assert.match(markup, />Learner A with a deliberately very long private id…<\/text>/);
  assert.doesNotMatch(markup, /\u0000/);
  assert.equal((markup.match(/data-ena-unit-point="true"/g) ?? []).length, 4);
  assert.equal((markup.match(/data-ena-unit-point="true"[\s\S]*?data-ena-point-shape="circle"/g) ?? []).length, 4);
});

test("visibility and scale props control plot output", async () => {
  const hiddenMarkup = await render({
    showPoints: false,
    showNetworks: false,
    showLabels: false,
    edgeScale: 1.7,
    pointScale: 1.8,
  });
  assert.doesNotMatch(hiddenMarkup, /data-ena-unit-point="true"/);
  assert.doesNotMatch(hiddenMarkup, /data-ena-edge="/);
  assert.doesNotMatch(hiddenMarkup, />Evidence<|>Reflection<|>Revision</);
  assert.equal((hiddenMarkup.match(/data-ena-edge-scale-factor="1.7"/g) ?? []).length, 3);
  assert.equal((hiddenMarkup.match(/data-ena-point-scale-factor="1.8"/g) ?? []).length, 3);
});

test("Unit circle is a model-independent node-layout mode and never hides analytic-unit points", async () => {
  const { officialEquiUnitCircleNodePositions } = await import("../components/open-ena/OpenEnaGroupContrast");
  const baselineModel = structuredClone(contrast);
  const optimalMarkup = await render();
  const unitCircleMarkup = await render({
    unitCircle: true,
  } as unknown as Partial<OpenEnaGroupContrastProps>);
  const optimalSvg = plotSvg(optimalMarkup, "open-ena-group-comparison-plot");
  const circleSvg = plotSvg(unitCircleMarkup, "open-ena-group-comparison-plot");

  assert.match(optimalSvg, /data-ena-node-position-mode="optimal"/);
  assert.match(circleSvg, /data-ena-node-position-mode="equiunitcircle"/);
  assert.equal((optimalSvg.match(/data-ena-unit-point="true"/g) ?? []).length, 4);
  assert.equal((circleSvg.match(/data-ena-unit-point="true"/g) ?? []).length, 4);
  assert.match(circleSvg, /data-ena-coordinate-extent="-10 30 -20 20"/);
  assert.deepEqual(contrast, baselineModel, "the presentation-only node layout cannot mutate contrast statistics");

  const modelCircle = officialEquiUnitCircleNodePositions(contrast.nodes);
  const anchor = modelCircle.get("Evidence");
  assert.deepEqual(anchor, { x: -1, y: 0.5 }, "rENA preserves the first maximum-radius node as its circle anchor");
  assert.ok(Math.abs(Math.hypot(modelCircle.get("Reflection")!.x, modelCircle.get("Reflection")!.y) - Math.sqrt(1.25)) < 1e-12);
  assert.ok(Math.abs(Math.hypot(modelCircle.get("Revision")!.x, modelCircle.get("Revision")!.y) - Math.sqrt(1.25)) < 1e-12);
  assert.ok(
    Math.abs(modelCircle.get("Revision")!.x - 0.06698729810778048) < 1e-12
      && Math.abs(modelCircle.get("Revision")!.y + 1.1160254037844386) < 1e-12,
    "rENA walks upper-x-descending then lower-x-ascending nodes counter-clockwise from the anchor",
  );
  assert.deepEqual(
    officialEquiUnitCircleNodePositions([{ code: "Zero", x: 0, y: 0 }]).get("Zero"),
    { x: 0, y: 0 },
    "zero-vector nodes stay at the origin and do not consume a circle slot",
  );

  const points = ["Evidence", "Reflection", "Revision"].map((code) => codeNodePosition(circleSvg, code));
  assert.ok(points.every((point) => point !== null), "every code needs one circle-layout position");
  const concrete = points as Array<{ x: number; y: number }>;
  const center = {
    x: concrete.reduce((sum, point) => sum + point.x, 0) / concrete.length,
    y: concrete.reduce((sum, point) => sum + point.y, 0) / concrete.length,
  };
  const radii = concrete.map((point) => Math.hypot(point.x - center.x, point.y - center.y));
  assert.ok(Math.max(...radii) - Math.min(...radii) < 1e-6, "code nodes must be equally spaced on one circle");

  for (const testId of [
    "open-ena-group-comparison-plot",
    "open-ena-group-primary-plot",
    "open-ena-group-secondary-plot",
  ]) {
    assert.match(plotSvg(unitCircleMarkup, testId), /data-ena-node-position-mode="equiunitcircle"/);
  }
});

test("Unit circle follows webENA by hiding unconnected code nodes without changing edge thresholds", async () => {
  const withUnconnected = structuredClone(contrast);
  withUnconnected.nodes.push({ code: "Unconnected", x: 0.25, y: 0.25 });
  withUnconnected.geometry.codes.push("Unconnected");
  withUnconnected.geometry.nodes.push({
    code: "Unconnected",
    coordinates: { SVD1: 0.25, SVD2: 0.25, SVD3: 0 },
  });
  const optimal = await render({ contrast: withUnconnected });
  const circular = await render({
    contrast: withUnconnected,
    unitCircle: true,
  } as unknown as Partial<OpenEnaGroupContrastProps>);

  assert.match(optimal, /aria-label="Unconnected code node"/);
  assert.doesNotMatch(circular, /aria-label="Unconnected code node"/);
  assert.deepEqual(
    [...circular.matchAll(/data-ena-signed-difference="([^"]+)"/g)].map((match) => match[1]),
    [...optimal.matchAll(/data-ena-signed-difference="([^"]+)"/g)].map((match) => match[1]),
  );
});

test("ordered legend and signed-edge table expose direction without relying on color", async () => {
  const markup = await render({ edgeThreshold: 0.2 });

  assert.match(markup, /<ol[^>]*aria-label="Selected group order"[^>]*data-ena-legend-order="primary-secondary"/);
  assert.match(markup, /<li[^>]*data-ena-group-role="primary"[\s\S]*?Square summary[\s\S]*?Primary: Studio[\s\S]*?<\/li>/);
  assert.match(markup, /<li[^>]*data-ena-group-role="secondary"[\s\S]*?Square summary[\s\S]*?Secondary: Seminar[\s\S]*?<\/li>/);
  assert.match(markup, /<caption>Strongest signed edge differences<\/caption>/);
  assert.match(markup, /<th[^>]*scope="col"[^>]*>Signed difference<\/th>/);
  assert.match(markup, /<th[^>]*scope="col"[^>]*>Stronger group<\/th>/);
  assert.match(markup, /<th[^>]*scope="row"[^>]*>Evidence &amp; Reflection<\/th>[\s\S]*?\+0\.600[\s\S]*?Studio/);
  assert.match(markup, /<th[^>]*scope="row"[^>]*>Evidence &amp; Revision<\/th>[\s\S]*?−0\.500[\s\S]*?Seminar/);
  assert.ok(markup.indexOf("Evidence &amp; Reflection") < markup.indexOf("Evidence &amp; Revision"));
  assert.match(markup, /Threshold uses 20% of the comparison signed-difference scale \(0\.600\)/);
});

test("the central comparison SVG accepts the Workspace export ref", () => {
  assert.ok(existsSync(componentPath));
  const source = readFileSync(componentPath, "utf8");
  assert.match(source, /svgRef\?:\s*Ref<SVGSVGElement>/);
  assert.match(source, /kind\s*===\s*"comparison"\s*\?\s*svgRef\s*:\s*undefined/);
});

test("Copy image resolves the semantic plot SVG instead of a toolbar icon", () => {
  const source = readFileSync(componentPath, "utf8");
  assert.match(
    source,
    /closest\("figure"\)\?\.querySelector<SVGSVGElement>\("svg\[data-ena-plot-kind\]"\)/,
  );
  assert.doesNotMatch(source, /closest\("figure"\)\?\.querySelector\("svg"\)/);
});

test("all horizontally scrollable plot figures are keyboard focusable and labelled", async () => {
  const markup = await render();
  assert.match(markup, /<figure[^>]*tabindex="0"[^>]*aria-label="Comparison plot\. Scroll horizontally on small screens\."/);
  assert.match(markup, /<figure[^>]*tabindex="0"[^>]*aria-label="Primary plot\. Scroll horizontally on small screens\."/);
  assert.match(markup, /<figure[^>]*tabindex="0"[^>]*aria-label="Secondary plot\. Scroll horizontally on small screens\."/);
});

function figureForHeading(markup: string, heading: "Comparison Plot" | "Primary Plot" | "Secondary Plot") {
  const headingIndex = markup.indexOf(`<h3>${heading}</h3>`);
  if (headingIndex < 0) return "";
  const start = markup.lastIndexOf("<figure", headingIndex);
  const end = markup.indexOf("</figure>", headingIndex);
  return start >= 0 && end >= 0 ? markup.slice(start, end + "</figure>".length) : "";
}

function groupSummaryColor(markup: string, groupName: string) {
  const escapedName = groupName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const marker = markup.match(new RegExp(
    `<g\\b(?=[^>]*data-ena-summary-marker="true")(?=[^>]*aria-label="(?:Primary|Secondary) group mean for ${escapedName}, square marker")[^>]*>[\\s\\S]*?<\\/g>`,
  ))?.[0] ?? "";
  return [...marker.matchAll(/<rect\b[^>]*fill="(#[0-9a-f]{6})"[^>]*>/giu)]
    .map((match) => match[1].toLowerCase())
    .find((color) => color !== "#ffffff") ?? "";
}

test("official plot headers expose accessible Zoom In, Zoom Out, Recenter, and Copy image controls", async () => {
  const markup = await render();

  for (const [heading, kind] of [
    ["Comparison Plot", "comparison"],
    ["Primary Plot", "primary"],
    ["Secondary Plot", "secondary"],
  ] as const) {
    const figure = figureForHeading(markup, heading);
    assert.ok(figure, `${heading} must own one figure`);
    assert.match(
      figure,
      new RegExp(`data-ena-plot-toolbar="${kind}"[^>]*role="group"|role="group"[^>]*data-ena-plot-toolbar="${kind}"`),
      `${heading} must expose one semantically scoped action toolbar`,
    );
    for (const [action, accessibleName] of [
      ["zoom-in", "Zoom In"],
      ["zoom-out", "Zoom Out"],
      ["recenter", "Recenter"],
      ["copy-image", "Copy image"],
    ] as const) {
      assert.match(
        figure,
        new RegExp(`<button\\b(?=[^>]*data-ena-plot-action="${action}")(?=[^>]*aria-label="[^"]*${accessibleName}[^"]*")[^>]*>`),
        `${heading} must provide an accessible ${accessibleName} button`,
      );
    }
  }
});

test("official side-panel actions keep Switch Plots on Secondary while Primary exposes Hide and Remove", async () => {
  const markup = await render({
    onSwitchPlots: () => undefined,
  } as Partial<OpenEnaGroupContrastProps>);
  const comparison = figureForHeading(markup, "Comparison Plot");
  const primary = figureForHeading(markup, "Primary Plot");
  const secondary = figureForHeading(markup, "Secondary Plot");

  assert.doesNotMatch(comparison, /data-ena-panel-toolbar=|data-ena-panel-action=/);
  assert.deepEqual(
    [...primary.matchAll(/data-ena-panel-action="([^"]+)"/g)].map((match) => match[1]),
    ["toggle-visibility", "remove"],
    "Primary must expose exactly Hide and Remove panel-management actions",
  );
  assert.deepEqual(
    [...secondary.matchAll(/data-ena-panel-action="([^"]+)"/g)].map((match) => match[1]),
    ["switch-plots", "toggle-visibility", "remove"],
    "Secondary must expose exactly Switch, Hide, and Remove panel-management actions",
  );
  assert.match(primary, /data-ena-panel-toolbar="primary"/);
  assert.match(primary, /data-ena-panel-action="toggle-visibility"[^>]*(?:aria-label|title)="Hide Plot"/);
  assert.match(primary, /data-ena-panel-action="remove"[^>]*(?:aria-label|title)="Remove Plot"/);
  assert.doesNotMatch(primary, /data-ena-panel-action="switch-plots"/);
  assert.match(secondary, /data-ena-panel-toolbar="secondary"/);
  assert.match(secondary, /data-ena-panel-action="switch-plots"[^>]*(?:aria-label|title)="Switch Plots"/);
  assert.match(secondary, /data-ena-panel-action="toggle-visibility"[^>]*(?:aria-label|title)="Hide Plot"/);
  assert.match(secondary, /data-ena-panel-action="remove"[^>]*(?:aria-label|title)="Remove Plot"/);

  for (const [heading, figure] of [
    ["Comparison Plot", comparison],
    ["Primary Plot", primary],
    ["Secondary Plot", secondary],
  ] as const) {
    assert.deepEqual(
      [...figure.matchAll(/data-ena-plot-action="([^"]+)"/g)].map((match) => match[1]),
      ["zoom-in", "zoom-out", "recenter", "copy-image"],
      `${heading} must own exactly one zoom/recenter/copy action set`,
    );
  }

  const componentSource = readFileSync(componentPath, "utf8");
  const workspaceSource = readFileSync(
    join(process.cwd(), "components", "open-ena", "OpenEnaWorkspace.tsx"),
    "utf8",
  );
  assert.match(componentSource, /onSwitchPlots\?:\s*\(\)\s*=>\s*void/);
  assert.match(componentSource, /data-ena-panel-action=["{]switch-plots["}][\s\S]{0,500}onClick=\{onSwitchPlots\}/);
  assert.match(
    componentSource,
    /const handleSwitchPlots = \(\) => \{[\s\S]{0,700}setPanelRoles\(\{ primary: "primary", secondary: "secondary" \}\);[\s\S]{0,200}onSwitchPlots\?\.\(\);/,
    "Switch must normalize any remove/restore card-role remapping before the Workspace swaps the authoritative pair",
  );
  assert.match(
    componentSource,
    /onSwitchPlots=\{onSwitchPlots \? handleSwitchPlots : undefined\}/,
    "the Secondary action must use the remove/restore-safe switch handler",
  );
  assert.match(
    workspaceSource,
    /<OpenEnaGroupContrast[\s\S]{0,1800}onSwitchPlots=\{[\s\S]{0,600}setPrimaryGroupName\(secondaryGroupName\)[\s\S]{0,300}setSecondaryGroupName\(primaryGroupName\)/,
    "Workspace must own the ordered-group swap invoked from the Secondary panel header",
  );
});

test("Hide, Show, Remove, and comparison-point Restore are model-independent panel-state transitions", async () => {
  const componentModule = await import("../components/open-ena/OpenEnaGroupContrast");
  const stateMachine = componentModule as typeof componentModule & {
    OPEN_ENA_INITIAL_PLOT_PANEL_STATE?: { primary: string; secondary: string };
    reduceOpenEnaPlotPanelState?: (
      state: { primary: string; secondary: string },
      action: { type: "toggle-visibility" | "remove" | "restore"; plot: "primary" | "secondary" },
    ) => { primary: string; secondary: string };
  };
  assert.equal(
    typeof stateMachine.reduceOpenEnaPlotPanelState,
    "function",
    "the UI must expose a pure panel-state transition so Hide/Remove cannot mutate the ENA model",
  );
  const reduce = stateMachine.reduceOpenEnaPlotPanelState!;
  const initial = stateMachine.OPEN_ENA_INITIAL_PLOT_PANEL_STATE;
  assert.deepEqual(initial, { primary: "visible", secondary: "visible" });

  const primaryHidden = reduce(initial!, { type: "toggle-visibility", plot: "primary" });
  assert.deepEqual(primaryHidden, { primary: "hidden", secondary: "visible" });
  assert.deepEqual(initial, { primary: "visible", secondary: "visible" }, "panel transitions must be immutable");
  assert.deepEqual(
    reduce(primaryHidden, { type: "toggle-visibility", plot: "primary" }),
    initial,
    "Show Plot must restore a hidden plot",
  );

  const secondaryRemoved = reduce(initial!, { type: "remove", plot: "secondary" });
  assert.deepEqual(secondaryRemoved, { primary: "visible", secondary: "removed" });
  assert.deepEqual(
    reduce(secondaryRemoved, { type: "restore", plot: "secondary" }),
    initial,
    "the corresponding Comparison point must restore a removed side plot",
  );
});

test("hidden plots fade without collapsing and removed plots advertise point-based restoration", () => {
  const source = readFileSync(componentPath, "utf8");
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

  assert.match(source, /data-ena-panel-state=\{panelStates?\.primary\}/);
  assert.match(source, /data-ena-panel-state=\{panelStates?\.secondary\}/);
  assert.match(source, /panelStates?\.primary\s*!==\s*"removed"[\s\S]{0,500}<figure/);
  assert.match(source, /panelStates?\.secondary\s*!==\s*"removed"[\s\S]{0,500}<figure/);
  assert.match(source, /panelStates?\[?[^\]\n]*\]?\s*===\s*"hidden"[\s\S]{0,250}"Show Plot"[\s\S]{0,250}"Hide Plot"/);
  assert.match(source, /panelStates?\.primary\s*===\s*"removed"[\s\S]{0,800}Restore Primary Plot/);
  assert.match(source, /panelStates?\.secondary\s*===\s*"removed"[\s\S]{0,800}Restore Secondary Plot/);
  assert.match(source, /Restore Primary Plot[\s\S]{0,500}type:\s*"restore"[\s\S]{0,100}plot:\s*"primary"/);
  assert.match(source, /Restore Secondary Plot[\s\S]{0,500}type:\s*"restore"[\s\S]{0,100}plot:\s*"secondary"/);

  const hiddenRule = css.match(/[^{}]*\[data-ena-panel-state=["']hidden["']\][^{}]*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(hiddenRule, /opacity\s*:\s*0?\.\d+/);
  assert.doesNotMatch(hiddenRule, /display\s*:\s*none|visibility\s*:\s*hidden/);
  assert.match(
    css,
    /\[data-ena-restore-panel\]\s*\{[^}]*pointer-events:\s*bounding-box;[^}]*cursor:\s*pointer;/,
    "the restored mean-marker hit area must win SVG pointer targeting even when unit circles overlap it",
  );
});

test("official Yu 0712 colors follow Experimental and Control identities across every figure layer and plot switch", async () => {
  const yuContrast = structuredClone(contrast);
  yuContrast.declaredGroups = [
    { ...yuContrast.declaredGroups[0], name: "Experimental" },
    { ...yuContrast.declaredGroups[1], name: "Control" },
  ];
  yuContrast.groupOrder = ["Experimental", "Control"];
  yuContrast.primary = {
    ...yuContrast.primary,
    name: "Experimental",
    color: "#3366cc",
    unitIds: yuContrast.primary.unitIds.map((_, index) => `fixture-experimental-${index + 1}`),
    points: yuContrast.primary.points.map((point, index) => ({
      ...point,
      unitId: `fixture-experimental-${index + 1}`,
      group: "Experimental",
    })),
  };
  yuContrast.secondary = {
    ...yuContrast.secondary,
    name: "Control",
    color: "#dc3912",
    unitIds: yuContrast.secondary.unitIds.map((_, index) => `fixture-control-${index + 1}`),
    points: yuContrast.secondary.points.map((point, index) => ({
      ...point,
      unitId: `fixture-control-${index + 1}`,
      group: "Control",
    })),
  };

  const analyticalSnapshot = JSON.stringify({
    axes: yuContrast.axes,
    coordinateExtent: yuContrast.coordinateExtent,
    primaryMean: yuContrast.primary.meanPoint,
    secondaryMean: yuContrast.secondary.meanPoint,
    nodes: yuContrast.nodes,
    edges: yuContrast.edges,
  });
  const forward = await render({ contrast: yuContrast });
  assert.equal(
    JSON.stringify({
      axes: yuContrast.axes,
      coordinateExtent: yuContrast.coordinateExtent,
      primaryMean: yuContrast.primary.meanPoint,
      secondaryMean: yuContrast.secondary.meanPoint,
      nodes: yuContrast.nodes,
      edges: yuContrast.edges,
    }),
    analyticalSnapshot,
    "official figure colors are a presentation contract and must not mutate statistics or coordinates",
  );

  const expectedColors: Record<string, string> = {
    Experimental: "#cc423a",
    Control: "#218ebf",
  };
  const forwardComparison = plotSvg(forward, "open-ena-group-comparison-plot");
  const forwardPrimary = plotSvg(forward, "open-ena-group-primary-plot");
  const forwardSecondary = plotSvg(forward, "open-ena-group-secondary-plot");
  assert.equal(groupSummaryColor(forward, "Experimental"), expectedColors.Experimental);
  assert.equal(groupSummaryColor(forward, "Control"), expectedColors.Control);
  assert.match(
    figureForHeading(forward, "Primary Plot"),
    /class="ena-set-series-primary" style="color:#cc423a">Experimental<\/span>/,
    "the Experimental side caption must match its red figure layers",
  );
  assert.match(
    figureForHeading(forward, "Secondary Plot"),
    /class="ena-set-series-secondary" style="color:#218ebf">Control<\/span>/,
    "the Control side caption must match its blue figure layers",
  );

  for (const [role, color] of [["primary", expectedColors.Experimental], ["secondary", expectedColors.Control]] as const) {
    const pointTags = [...forwardComparison.matchAll(new RegExp(
      `<g\\b(?=[^>]*data-ena-unit-point="true")(?=[^>]*data-ena-group-role="${role}")[^>]*>[\\s\\S]*?<circle\\b[^>]*fill="([^"]+)"`,
      "g",
    ))];
    assert.ok(pointTags.length > 0, `${role} must retain visible unit-circle evidence`);
    assert.ok(pointTags.every((match) => match[1] === color), `${role} unit circles must use ${color}`);

    const guide = forwardComparison.match(new RegExp(
      `<g\\b(?=[^>]*data-ena-uncertainty-guide="marginal-student-t-95")(?=[^>]*data-ena-group-role="${role}")[^>]*>[\\s\\S]*?<\\/g>`,
    ))?.[0] ?? "";
    assert.match(guide, new RegExp(`stroke="${color}"`), `${role} interval lines must match the group identity`);
    assert.match(guide, new RegExp(`fill="${color}"`), `${role} interval handles must match the group identity`);
  }
  assert.ok(edgeLineTags(forwardPrimary).every((line) => tagAttribute(line, "stroke") === expectedColors.Experimental));
  assert.ok(edgeLineTags(forwardSecondary).every((line) => tagAttribute(line, "stroke") === expectedColors.Control));
  assert.equal(
    tagAttribute(edgeLineTags(forwardComparison).find((line) => line.includes("Evidence &amp; Reflection")) ?? "", "stroke"),
    expectedColors.Experimental,
  );
  assert.equal(
    tagAttribute(edgeLineTags(forwardComparison).find((line) => line.includes("Evidence &amp; Revision")) ?? "", "stroke"),
    expectedColors.Control,
  );
  for (const node of forwardComparison.match(/<circle\b[^>]*data-ena-code-node="neutral"[^>]*>/g) ?? []) {
    assert.equal(tagAttribute(node, "fill"), tagAttribute(node, "stroke"));
    assert.notEqual(tagAttribute(node, "fill"), expectedColors.Experimental);
    assert.notEqual(tagAttribute(node, "fill"), expectedColors.Control);
  }

  const reversed = structuredClone(yuContrast);
  reversed.groupOrder = [yuContrast.secondary.name, yuContrast.primary.name];
  reversed.primary = structuredClone(yuContrast.secondary);
  reversed.secondary = structuredClone(yuContrast.primary);
  reversed.edges = yuContrast.edges.map((edge) => ({
    ...edge,
    primaryWeight: edge.secondaryWeight,
    secondaryWeight: edge.primaryWeight,
    signedDifference: -edge.signedDifference,
    stronger: edge.stronger === "primary"
      ? "secondary" as const
      : edge.stronger === "secondary"
        ? "primary" as const
        : "equal" as const,
  }));
  const swapped = await render({ contrast: reversed });

  for (const groupName of yuContrast.groupOrder) {
    const before = groupSummaryColor(forward, groupName);
    const after = groupSummaryColor(swapped, groupName);
    assert.equal(before, expectedColors[groupName], `${groupName} must use its observed official color before switching`);
    assert.equal(after, before, `${groupName} must retain its color when its Primary/Secondary role changes`);
  }
  assert.match(
    figureForHeading(swapped, "Primary Plot"),
    /class="ena-set-series-primary" style="color:#218ebf">Control<\/span>/,
  );
  assert.match(
    figureForHeading(swapped, "Secondary Plot"),
    /class="ena-set-series-secondary" style="color:#cc423a">Experimental<\/span>/,
  );
});

test("official comparison keeps one signed-difference edge per connection while side plots keep full mean networks", async () => {
  const markup = await render({ edgeThreshold: 0, showNetworks: true });
  const comparison = plotSvg(markup, "open-ena-group-comparison-plot");
  const primary = plotSvg(markup, "open-ena-group-primary-plot");
  const secondary = plotSvg(markup, "open-ena-group-secondary-plot");

  assert.equal(edgeLineTags(comparison).length, 2, "only the two nonzero signed differences belong in Comparison");
  assert.equal(new Set(edgeLineTags(comparison).map((tag) => tagAttribute(tag, "data-ena-edge"))).size, 2,
    "Comparison must never double-draw one connection as overlapping group networks");
  assert.equal(edgeLineTags(primary).length, 3, "Primary must retain its complete nonzero group-mean network");
  assert.equal(edgeLineTags(secondary).length, 3, "Secondary must retain its complete nonzero group-mean network");
  assert.match(comparison, /data-ena-network-role="signed-difference"/);
  assert.match(primary, /data-ena-network-role="primary"/);
  assert.match(secondary, /data-ena-network-role="secondary"/);
});

test("Workspace retains the single Comparison Download Model and Data View toolbar actions", () => {
  const workspaceSource = readFileSync(
    join(process.cwd(), "components", "open-ena", "OpenEnaWorkspace.tsx"),
    "utf8",
  );
  assert.equal((workspaceSource.match(/data-testid="open-ena-data-view-toggle"/g) ?? []).length, 1);
  assert.equal((workspaceSource.match(/\bDownload Model\b/g) ?? []).length, 1);
  assert.equal((workspaceSource.match(/className="ena-download-model-button-icon"/g) ?? []).length, 1);
  assert.match(workspaceSource, /data-testid="open-ena-data-view-toggle"[\s\S]{0,500}setCenterSurface/);
  assert.match(workspaceSource, /ena-download-model-button[\s\S]{0,1000}buildAnalysisBundle/);
});

test("one selected code color is reused by Comparison, Primary, and Secondary code nodes", async () => {
  const markup = await render({
    codeColors: { Evidence: "#7b1fa2" },
  } as unknown as Partial<OpenEnaGroupContrastProps>);
  const coloredEvidenceNodes = markup.match(
    /<circle\b[^>]*data-ena-code="Evidence"[^>]*fill="#7b1fa2"[^>]*>/g,
  ) ?? [];
  const defaultReflectionNodes = markup.match(
    /<circle\b[^>]*data-ena-code="Reflection"[^>]*fill="#000000"[^>]*>/g,
  ) ?? [];

  assert.equal(coloredEvidenceNodes.length, 3);
  assert.equal(defaultReflectionNodes.length, 3);
});
