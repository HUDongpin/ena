import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import OpenEnaSetComparison from "../components/open-ena/OpenEnaSetComparison";
import type { OpenEnaSharedComparison } from "../lib/open-ena/sets";

const comparison = {
  referenceId: "open-ena-ref:shared-space-2026",
  reference: {
    schemaVersion: 1,
    kind: "open-ena-reference-rotation",
    app: "ENA.HK Open ENA",
    runtime: "jena-js",
    runtimeVersion: "0.6.2",
    referenceId: "open-ena-ref:shared-space-2026",
    name: "Shared-space reference",
    source: {
      datasetName: "reference.csv",
      normalizedUtf8TextSha256: "c".repeat(64),
      analyzedAt: "2026-08-13T00:00:00.000Z",
    },
    fit: {
      method: "svd",
      unitColumns: ["unit"],
      conversationColumns: ["conversation"],
    },
    compatibility: {
      model: "EndPoint",
      codes: ["Evidence", "Reflection", "Revision"],
      window: "MovingStanzaWindow",
      windowSizeBack: 5,
      windowSizeForward: 0,
      weightBy: "binary",
      centerAlignToOrigin: true,
      normalization: "sphere",
    },
  },
  axes: ["SVD1", "SVD2"],
  geometry: {
    referenceId: "open-ena-ref:shared-space-2026",
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
    centerVector: [0.2, 0.2, 0.2],
    nodes: [
      { code: "Evidence", SVD1: -0.72, SVD2: 0.34, SVD3: 0 },
      { code: "Reflection", SVD1: 0.14, SVD2: 0.78, SVD3: 0 },
      { code: "Revision", SVD1: 0.66, SVD2: -0.43, SVD3: 0 },
    ],
    compatibility: {
      model: "EndPoint",
      codes: ["Evidence", "Reflection", "Revision"],
      window: "MovingStanzaWindow",
      windowSizeBack: 5,
      windowSizeForward: 0,
      weightBy: "binary",
      centerAlignToOrigin: true,
      normalization: "sphere",
    },
  },
  nodes: [
    { code: "Evidence", x: -0.72, y: 0.34 },
    { code: "Reflection", x: 0.14, y: 0.78 },
    { code: "Revision", x: 0.66, y: -0.43 },
  ],
  primary: {
    setId: "set-primary",
    name: "Studio cohort",
    role: "fitted",
    capturedAt: "2026-08-13T00:00:00.000Z",
    unitCount: 18,
    datasetHash: "a".repeat(64),
    dataset: {
      name: "studio.csv",
      source: "upload",
      rowCount: 18,
      columnCount: 8,
      sizeBytes: 2048,
      normalizedUtf8TextSha256: "a".repeat(64),
    },
    config: {} as OpenEnaSharedComparison["primary"]["config"],
    unitIds: ["participant-01", "participant-02"],
    points: [
      { unitId: "participant-01", sourceUnitId: "Alpha", x: -0.36, y: 0.21 },
      { unitId: "participant-02", sourceUnitId: "Beta", x: -0.08, y: 0.1 },
    ],
    meanPoint: { SVD1: -0.21, SVD2: 0.17 },
    meanWeights: {
      "Evidence & Reflection": 0.8,
      "Evidence & Revision": 0.18,
      "Reflection & Revision": 0.2,
    },
  },
  secondary: {
    setId: "set-secondary",
    name: "Seminar cohort",
    role: "projected",
    capturedAt: "2026-08-13T00:01:00.000Z",
    unitCount: 16,
    datasetHash: "b".repeat(64),
    dataset: {
      name: "seminar.csv",
      source: "upload",
      rowCount: 16,
      columnCount: 8,
      sizeBytes: 2048,
      normalizedUtf8TextSha256: "b".repeat(64),
    },
    config: {} as OpenEnaSharedComparison["secondary"]["config"],
    unitIds: ["participant-01", "participant-03"],
    points: [
      { unitId: "participant-01", sourceUnitId: "Alpha", x: 0.18, y: -0.04 },
      { unitId: "participant-03", sourceUnitId: "Gamma", x: 0.34, y: -0.2 },
    ],
    meanPoint: { SVD1: 0.26, SVD2: -0.12 },
    meanWeights: {
      "Evidence & Reflection": 0.2,
      "Evidence & Revision": 0.63,
      "Reflection & Revision": 0.2,
    },
  },
  edges: [
    {
      source: "Evidence",
      target: "Reflection",
      name: "Evidence & Reflection",
      primaryWeight: 0.8,
      secondaryWeight: 0.2,
      signedDifference: 0.6,
      stronger: "primary",
    },
    {
      source: "Evidence",
      target: "Revision",
      name: "Evidence & Revision",
      primaryWeight: 0.18,
      secondaryWeight: 0.63,
      signedDifference: -0.45,
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
  createdAt: "2026-08-13T00:02:00.000Z",
} as OpenEnaSharedComparison;

test("shared-set comparison renders a semantic 2D primary, secondary, and signed-difference workbench", () => {
  const markup = renderToStaticMarkup(createElement(OpenEnaSetComparison, {
    comparison,
    edgeThreshold: 0,
    showPoints: true,
    showNetworks: true,
    showLabels: true,
    showUnitLabels: false,
    edgeScale: 1,
    pointScale: 1,
    plotZoom: 1,
    flipX: false,
    flipY: false,
  }));

  assert.match(markup, /data-testid="open-ena-set-comparison"/);
  assert.match(markup, /data-ena-dimensions="2"/);
  assert.match(markup, />COMPARISON PLOT</);
  assert.match(markup, />PRIMARY PLOT</);
  assert.match(markup, />SECONDARY PLOT</);
  assert.match(markup, /Reference geometry: <[^>]*>open-ena-ref:shared-space-2026</);
  assert.match(markup, /Studio cohort/);
  assert.match(markup, /18 analytic units/);
  assert.match(markup, /Seminar cohort/);
  assert.match(markup, /16 analytic units/);

  const labelledGraphics = markup.match(/<svg[^>]*role="img"[^>]*aria-labelledby="[^"]+"/g) ?? [];
  assert.equal(labelledGraphics.length, 3, "all three network graphics need labelled SVG semantics");
  assert.match(markup, /Signed network difference, Studio cohort minus Seminar cohort/);
  assert.match(markup, /Positive edges mean Studio cohort is stronger/);
  assert.match(markup, /Negative edges mean Seminar cohort is stronger/);
  assert.match(markup, />Evidence<\/text>/, "code labels should obey showLabels");
  assert.doesNotMatch(markup, />Alpha<\/text>/, "unit labels need their own explicit control");
  assert.doesNotMatch(markup, /\b(?:NaN|Infinity|-Infinity)\b/);
});

test("all three plots publish one absolute edge scale while preserving signed differences", () => {
  const markup = renderToStaticMarkup(createElement(OpenEnaSetComparison, {
    comparison,
    edgeThreshold: 0,
    showPoints: true,
    showNetworks: true,
    showLabels: false,
    showUnitLabels: false,
    edgeScale: 1,
    pointScale: 1,
    plotZoom: 1,
    flipX: true,
    flipY: true,
  }));

  const scaleValues = [...markup.matchAll(/data-ena-edge-scale-max="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(scaleValues, ["0.8", "0.8", "0.8"]);
  assert.match(markup, /data-ena-sign="positive"/);
  assert.match(markup, /data-ena-sign="negative"/);
  assert.match(markup, /data-ena-sign="equal"/);
  assert.match(markup, /data-ena-mean-marker="primary-circle"/);
  assert.match(markup, /data-ena-mean-marker="secondary-diamond"/);
  assert.match(markup, /SVD1 · flipped/);
  assert.match(markup, /SVD2 · flipped/);
  assert.doesNotMatch(markup, />Evidence</, "code labels should obey showLabels");
});

test("saved-set zoom keeps all three SVG papers fixed and clips centered plot layers", () => {
  const markup = renderToStaticMarkup(createElement(OpenEnaSetComparison, {
    comparison,
    edgeThreshold: 0,
    showPoints: true,
    showNetworks: true,
    showLabels: true,
    showUnitLabels: false,
    edgeScale: 1,
    pointScale: 1,
    plotZoom: 99,
    flipX: false,
    flipY: false,
  }));
  const plotSvgs = [
    markup.match(/<svg[^>]*data-testid="open-ena-shared-difference-plot"[\s\S]*?<\/svg>/)?.[0] ?? "",
    markup.match(/<svg[^>]*data-testid="open-ena-primary-plot"[\s\S]*?<\/svg>/)?.[0] ?? "",
    markup.match(/<svg[^>]*data-testid="open-ena-secondary-plot"[\s\S]*?<\/svg>/)?.[0] ?? "",
  ];

  plotSvgs.forEach((svg) => {
    const root = svg.match(/^<svg\b[^>]*>/)?.[0] ?? "";
    const viewportIndex = svg.indexOf('data-ena-plot-viewport="true"');
    assert.match(root, /data-ena-plot-zoom="2\.4"/);
    assert.doesNotMatch(root, /transform:\s*scale|transform-origin/);
    assert.ok(
      svg.indexOf('class="ena-set-plot-background"') < viewportIndex,
      "the saved-set paper must remain outside the zoom layer",
    );
    assert.ok(
      svg.indexOf('opacity="0.62"') < viewportIndex,
      "the saved-set grid must remain outside the zoom layer",
    );
  });
  assert.equal((markup.match(/transform="translate\(460 295\) scale\(2\.4\) translate\(-460 -295\)"/g) ?? []).length, 1);
  assert.equal((markup.match(/transform="translate\(220 140\) scale\(2\.4\) translate\(-220 -140\)"/g) ?? []).length, 2);
  const clipIds = plotSvgs.map((svg) => svg.match(/<clipPath\b[^>]*id="([^"]+)"[^>]*>/)?.[1] ?? "");
  assert.ok(clipIds.every(Boolean));
  assert.equal(new Set(clipIds).size, 3);
});

test("shared point geometry preserves namespaced unit identity and distinct non-color set encodings", () => {
  const markup = renderToStaticMarkup(createElement(OpenEnaSetComparison, {
    comparison,
    edgeThreshold: 0,
    showPoints: true,
    showNetworks: true,
    showLabels: false,
    showUnitLabels: true,
    edgeScale: 1,
    pointScale: 1,
    plotZoom: 1,
    flipX: false,
    flipY: false,
  }));
  const comparisonSvg = markup.match(/<svg[^>]*data-testid="open-ena-shared-difference-plot"[\s\S]*?<\/svg>/)?.[0] ?? "";
  const primarySvg = markup.match(/<svg[^>]*data-testid="open-ena-primary-plot"[\s\S]*?<\/svg>/)?.[0] ?? "";
  const secondarySvg = markup.match(/<svg[^>]*data-testid="open-ena-secondary-plot"[\s\S]*?<\/svg>/)?.[0] ?? "";

  assert.equal(comparisonSvg.match(/data-ena-unit-point="true"/g)?.length, 4);
  assert.equal(primarySvg.match(/data-ena-unit-point="true"/g)?.length, 2);
  assert.equal(secondarySvg.match(/data-ena-unit-point="true"/g)?.length, 2);
  assert.match(comparisonSvg, /data-ena-point-key="primary:0"/);
  assert.match(comparisonSvg, /data-ena-point-key="secondary:0"/);
  assert.match(comparisonSvg, /data-ena-set-role="primary"[^>]*data-ena-point-shape="circle"/);
  assert.match(comparisonSvg, /data-ena-set-role="secondary"[^>]*data-ena-point-shape="diamond"/);
  assert.match(primarySvg, /aria-label="Studio cohort unit Alpha"/);
  assert.match(secondarySvg, /aria-label="Seminar cohort unit Alpha"/);
  assert.match(primarySvg, />Alpha<\/text>/);
  assert.match(secondarySvg, />Gamma<\/text>/);
  assert.doesNotMatch(markup, />Evidence<\/text>/, "unit-label visibility must not force code labels on");
  assert.doesNotMatch(markup, /\b(?:NaN|Infinity|-Infinity)\b/);
});

test("hidden unit labels use opaque markup keys and large sets are deterministically sampled", () => {
  const largeComparison = structuredClone(comparison);
  largeComparison.primary.points = Array.from({ length: 2_500 }, (_, index) => ({
    unitId: `private-${index}`,
    sourceUnitId: `Private learner ${index}`,
    x: index / 2_500,
    y: -index / 2_500,
  }));
  largeComparison.primary.unitIds = largeComparison.primary.points.map((point) => point.unitId);
  largeComparison.primary.unitCount = largeComparison.primary.points.length;
  const markup = renderToStaticMarkup(createElement(OpenEnaSetComparison, {
    comparison: largeComparison,
    edgeThreshold: 0,
    showPoints: true,
    showNetworks: true,
    showLabels: false,
    showUnitLabels: false,
    edgeScale: 1,
    pointScale: 1,
    plotZoom: 1,
    flipX: false,
    flipY: false,
  }));
  const primarySvg = markup.match(/<svg[^>]*data-testid="open-ena-primary-plot"[\s\S]*?<\/svg>/)?.[0] ?? "";

  assert.match(primarySvg, /data-ena-points-shown="2000"/);
  assert.match(primarySvg, /data-ena-points-total="2500"/);
  assert.equal(primarySvg.match(/data-ena-unit-point="true"/g)?.length, 2_000);
  assert.doesNotMatch(markup, /private-2499|Private learner 2499/);
  assert.doesNotMatch(markup, /data-ena-point-key="[^\"]*private/);
});

test("the accessible table ranks and labels strongest signed differences without erasing sign", () => {
  const markup = renderToStaticMarkup(createElement(OpenEnaSetComparison, {
    comparison,
    edgeThreshold: 0.25,
    showPoints: true,
    showNetworks: true,
    showLabels: true,
    showUnitLabels: false,
    edgeScale: 1,
    pointScale: 1,
    plotZoom: 1,
    flipX: false,
    flipY: false,
  }));

  assert.match(markup, /<table[^>]*>/);
  assert.match(markup, /<caption>Strongest signed edge differences<\/caption>/);
  assert.match(markup, /<th[^>]*scope="col"[^>]*>Signed difference<\/th>/);
  assert.match(markup, /<th[^>]*scope="col"[^>]*>Stronger set<\/th>/);
  assert.match(markup, /<th[^>]*scope="row"[^>]*>Evidence &amp; Reflection<\/th>[\s\S]*?\+0\.600[\s\S]*?Studio cohort/);
  assert.match(markup, /<th[^>]*scope="row"[^>]*>Evidence &amp; Revision<\/th>[\s\S]*?−0\.450[\s\S]*?Seminar cohort/);
  assert.ok(
    markup.indexOf("Evidence &amp; Reflection") < markup.indexOf("Evidence &amp; Revision"),
    "differences should be ranked by absolute magnitude",
  );
  assert.doesNotMatch(markup, /<th[^>]*scope="row"[^>]*>Reflection &amp; Revision<\/th>/);
  assert.match(markup, /Threshold uses 25% of the shared absolute edge scale \(0\.800\)/);
});

test("the comparison layout stacks responsively and contains wide evidence without page overflow", () => {
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
  const marker = "/* Shared-set comparison: one fixed 2D reference geometry and edge scale. */";
  const markerIndex = css.lastIndexOf(marker);

  assert.ok(markerIndex >= 0, "comparison styles should be appended as an isolated stylesheet section");
  const comparisonCss = css.slice(markerIndex);
  assert.match(comparisonCss, /\.open-ena-set-comparison\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*100%;/);
  assert.match(comparisonCss, /\.ena-set-comparison-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*2fr\)\s+minmax\(270px,\s*1fr\);/);
  assert.match(comparisonCss, /\.ena-set-difference-table\s*\{[\s\S]*?max-width:\s*100%;[\s\S]*?overflow-x:\s*auto;/);
  assert.match(comparisonCss, /@media\s*\(max-width:\s*1120px\)[\s\S]*?\.ena-set-comparison-layout\s*\{[\s\S]*?grid-template-columns:\s*1fr;/);
  assert.match(comparisonCss, /@media\s*\(max-width:\s*640px\)[\s\S]*?\.ena-set-side-plots\s*\{[\s\S]*?grid-template-columns:\s*1fr;/);
  assert.match(comparisonCss, /@media\s*\(max-width:\s*640px\)[\s\S]*?\.ena-set-main-plot[\s\S]*?overflow-x:\s*auto;/);
  assert.match(comparisonCss, /@media\s*\(max-width:\s*640px\)[\s\S]*?\.open-ena-set-comparison-svg\s*\{[\s\S]*?width:\s*700px;[\s\S]*?max-width:\s*none;/);
});

test("captured-set comparison preserves the active code palette in all three plots", () => {
  const markup = renderToStaticMarkup(createElement(OpenEnaSetComparison, {
    comparison,
    edgeThreshold: 0,
    showPoints: true,
    showNetworks: true,
    showLabels: true,
    showUnitLabels: false,
    edgeScale: 1,
    pointScale: 1,
    plotZoom: 1,
    flipX: false,
    flipY: false,
    codeColors: { Revision: "#ef6c00" },
  } as never));

  assert.equal(
    markup.match(/<circle[^>]*data-ena-code="Revision"[^>]*fill="#ef6c00"/g)?.length,
    3,
  );
  assert.equal(
    markup.match(/<circle[^>]*data-ena-code="Evidence"[^>]*fill="#000000"/g)?.length,
    3,
  );
});
