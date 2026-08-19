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
  inference: {
    status: "available",
    provenance: "ENA.HK post-projection inference",
    method: "Mann-Whitney U for the first selected group; two-sided normal approximation with average ranks, tie-corrected variance, and a 0.5 continuity correction",
    effectDefinition: "r_rb(primary vs secondary) = 2 * U(primary) / (nPrimary * nSecondary) - 1; positive values indicate higher ranks in the primary selected group",
    multiplicityCorrection: "none",
    groupOrder: ["Studio", "Seminar"],
    rows: [],
  },
  createdAt: "2026-08-13T01:01:00.000Z",
  boundaries: [],
} as OpenEnaPairwiseContrast;

const defaultProps = {
  contrast,
  edgeThreshold: 0,
  showPoints: true,
  showNetworks: true,
  showLabels: true,
  showUnitLabels: false,
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
  assert.equal((markup.match(/Difference scale 0\.600 · scaled 1\.00×/g) ?? []).length, 1);
  assert.equal((markup.match(/Shared scale 0\.900 · scaled 1\.00×/g) ?? []).length, 2);
  assert.equal((markup.match(/<svg[^>]*aria-labelledby="[^"]+"/g) ?? []).length, 3);
});

test("all three plot roles disclose one compatible axis, variance, extent, and scale frame", async () => {
  const markup = await render({ edgeScale: 1.25, showVariance: true });

  assert.equal((markup.match(/data-ena-axis-frame="shared-full-result"/g) ?? []).length, 3);
  assert.equal((markup.match(/data-ena-axis-x="SVD1"/g) ?? []).length, 3);
  assert.equal((markup.match(/data-ena-axis-y="SVD2"/g) ?? []).length, 3);
  assert.equal((markup.match(/data-ena-axis-x-variance="0\.5"/g) ?? []).length, 3);
  assert.equal((markup.match(/data-ena-axis-y-variance="0\.3"/g) ?? []).length, 3);
  assert.equal((markup.match(/Difference scale 0\.600 · scaled 1\.25× · SVD1 50\.0% · SVD2 30\.0%/g) ?? []).length, 1);
  assert.equal((markup.match(/Shared scale 0\.900 · scaled 1\.25× · SVD1 50\.0% · SVD2 30\.0%/g) ?? []).length, 2);
});

test("unit, group-summary, and code-node encodings follow the official plot grammar", async () => {
  const markup = await render();
  const comparisonSvg = markup.match(/<svg[^>]*data-testid="open-ena-group-comparison-plot"[\s\S]*?<\/svg>/)?.[0] ?? "";

  assert.equal((comparisonSvg.match(/data-ena-unit-point="true"/g) ?? []).length, 4);
  assert.equal((comparisonSvg.match(/data-ena-unit-point="true"[^>]*data-ena-point-shape="circle"/g) ?? []).length, 4);
  assert.match(comparisonSvg, /data-ena-unit-point="true"[\s\S]*?data-ena-group-role="primary"[\s\S]*?<circle[^>]*fill="#3366cc"/);
  assert.match(comparisonSvg, /data-ena-unit-point="true"[\s\S]*?data-ena-group-role="secondary"[\s\S]*?<circle[^>]*fill="#dc3912"/);
  assert.equal((comparisonSvg.match(/data-ena-summary-marker="true"/g) ?? []).length, 2);
  assert.match(comparisonSvg, /data-ena-summary-marker="true"[^>]*data-ena-group-role="primary"[^>]*data-ena-point-shape="square"[^>]*data-ena-marker-size="20"/);
  assert.match(comparisonSvg, /data-ena-summary-marker="true"[^>]*data-ena-group-role="secondary"[^>]*data-ena-point-shape="square"[^>]*data-ena-marker-size="20"/);
  assert.equal((comparisonSvg.match(/<g\b(?=[^>]*data-ena-summary-marker="true")(?=[^>]*role="img")[^>]*>/g) ?? []).length, 2);
  assert.doesNotMatch(comparisonSvg, /<g\b(?=[^>]*data-ena-summary-marker="true")(?=[^>]*(?:role="button"|tabindex=|aria-pressed=|aria-controls=))[^>]*>/);
  assert.equal((comparisonSvg.match(/data-ena-code-node="neutral"/g) ?? []).length, 3);
  assert.equal((comparisonSvg.match(/data-ena-code-node="neutral"[^>]*fill="#ffffff"[^>]*stroke="#4d4d4d"/g) ?? []).length, 3);
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
  assert.equal((primarySvg.match(/data-ena-summary-marker="true"/g) ?? []).length, 1);
  assert.equal((secondarySvg.match(/data-ena-summary-marker="true"/g) ?? []).length, 1);
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
  assert.match(positive, /stroke="#3366cc"/);
  assert.match(negative, /data-ena-sign="negative"/);
  assert.match(negative, /stroke="#dc3912"/);
  assert.ok(Math.abs(Number(tagAttribute(positive, "stroke-width")) - (1 + 0.6 / 0.625 * 6)) < 1e-12);
  assert.ok(Math.abs(Number(tagAttribute(negative, "stroke-width")) - (1 + 0.5 / 0.625 * 6)) < 1e-12);
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

test("all panels use the fixed full-result coordinate extent and honor flips and zoom", async () => {
  const markup = await render({ flipX: true, flipY: true, plotZoom: 99 });

  assert.equal((markup.match(/data-ena-extent-source="full-result"/g) ?? []).length, 3);
  assert.equal((markup.match(/data-ena-coordinate-extent="-10 30 -20 20"/g) ?? []).length, 3);
  assert.equal((markup.match(/style="transform:scale\(2\.4\);transform-origin:center;--ena-plot-text-scale:1"/g) ?? []).length, 3);
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
    runtimeVersion: "0.6.2",
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
  assert.match(comparisonSvg, /declared source SHA-256 cccccccccccc…/);
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
  const primarySvg = markup.match(/<svg[^>]*data-testid="open-ena-group-primary-plot"[\s\S]*?<\/svg>/)?.[0] ?? "";
  const secondarySvg = markup.match(/<svg[^>]*data-testid="open-ena-group-secondary-plot"[\s\S]*?<\/svg>/)?.[0] ?? "";

  assert.match(primarySvg, /data-ena-points-shown="2000"/);
  assert.match(primarySvg, /data-ena-points-valid="2500"/);
  assert.equal((primarySvg.match(/data-ena-unit-point="true"/g) ?? []).length, 2_000);
  assert.match(secondarySvg, /data-ena-points-dropped="1"/);
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
  assert.equal((markup.match(/data-ena-unit-point="true"/g) ?? []).length, 8);
  assert.equal((markup.match(/data-ena-unit-point="true"[\s\S]*?data-ena-point-shape="circle"/g) ?? []).length, 8);
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

test("all horizontally scrollable plot figures are keyboard focusable and labelled", async () => {
  const markup = await render();
  assert.match(markup, /<figure[^>]*tabindex="0"[^>]*aria-label="Comparison plot\. Scroll horizontally on small screens\."/);
  assert.match(markup, /<figure[^>]*tabindex="0"[^>]*aria-label="Primary plot\. Scroll horizontally on small screens\."/);
  assert.match(markup, /<figure[^>]*tabindex="0"[^>]*aria-label="Secondary plot\. Scroll horizontally on small screens\."/);
});
