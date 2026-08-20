import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import OpenEnaGroupContrast from "../components/open-ena/OpenEnaGroupContrast";
import OpenEnaPlot, { MiniNetwork } from "../components/open-ena/OpenEnaPlot";
import OpenEnaSetComparison from "../components/open-ena/OpenEnaSetComparison";
import { getOpenEnaCopy } from "../lib/open-ena-i18n";
import { analyzeDataset } from "../lib/open-ena/analyze";
import { parseCsv } from "../lib/open-ena/csv";
import type { OpenEnaPairwiseContrast } from "../lib/open-ena/contrasts";
import type {
  GroupNetwork,
  OpenEnaConfig,
  OpenEnaResult,
  OpenEnaSharedComparison,
} from "../lib/open-ena/types";
import { SAMPLE_CONFIG } from "../lib/open-ena/types";

const JENA_PRIMARY_BLUE = "#3366cc";
const JENA_SECONDARY_RED = "#dc3912";
const OFFICIAL_FIRST_GROUP_RED = "#cc423a";
const OFFICIAL_SECOND_GROUP_BLUE = "#218ebf";

function lineTags(markup: string) {
  return markup.match(/<line\b[^>]*>/g) ?? [];
}

function endpointEdgeLines(markup: string) {
  return lineTags(markup).filter((line) => line.includes("data-ena-edge="));
}

function plotSvg(markup: string, testId: string) {
  return markup.match(new RegExp(`<svg[^>]*data-testid="${testId}"[\\s\\S]*?<\\/svg>`))?.[0] ?? "";
}

function lineBySign(markup: string, sign: "positive" | "negative") {
  return endpointEdgeLines(markup).find((line) => line.includes(`data-ena-sign="${sign}"`)) ?? "";
}

function expectSolid(lines: string[], context: string) {
  assert.ok(lines.length > 0, `${context} must render at least one endpoint network edge`);
  for (const line of lines) {
    assert.doesNotMatch(
      line,
      /\sstroke-dasharray=/i,
      `${context} endpoint edge must be solid: ${line}`,
    );
  }
}

function expectStroke(lines: string[], color: string, context: string) {
  assert.ok(lines.length > 0, `${context} must render at least one endpoint network edge`);
  for (const line of lines) {
    assert.match(line, new RegExp(`\\sstroke="${color}"`), `${context} must use ${color}: ${line}`);
  }
}

const pairwiseContrast = {
  groupColumn: "condition",
  declaredGroups: [
    { name: "Primary cohort", unitCount: 2, pointCount: 2 },
    { name: "Secondary cohort", unitCount: 2, pointCount: 2 },
  ],
  axes: ["SVD1", "SVD2"],
  coordinateExtent: { minX: -1, maxX: 1, minY: -1, maxY: 1 },
  configuration: {
    unitColumns: ["unit"],
    conversationColumns: ["conversation"],
    groupColumn: "condition",
    codes: ["A", "B", "C"],
    model: "EndPoint",
    window: "Conversation",
    windowSizeBack: 1,
    windowSizeForward: 0,
    weightBy: "binary",
    rotation: "svd",
    referenceRotationId: null,
    centerAlignToOrigin: true,
  },
  resultProvenance: { projectionReference: null },
  geometry: {
    variance: { SVD1: 0.6, SVD2: 0.4 },
  },
  primary: {
    name: "Primary cohort",
    color: JENA_PRIMARY_BLUE,
    unitCount: 2,
    points: [],
    meanPoint: { SVD1: -0.4, SVD2: 0.2 },
  },
  secondary: {
    name: "Secondary cohort",
    color: JENA_SECONDARY_RED,
    unitCount: 2,
    points: [],
    meanPoint: { SVD1: 0.4, SVD2: -0.2 },
  },
  nodes: [
    { code: "A", x: -0.8, y: 0.4 },
    { code: "B", x: 0, y: 0.8 },
    { code: "C", x: 0.8, y: -0.4 },
  ],
  edges: [
    {
      source: "A",
      target: "B",
      name: "A & B",
      primaryWeight: 0.8,
      secondaryWeight: 0.2,
      signedDifference: 0.6,
      stronger: "primary",
    },
    {
      source: "A",
      target: "C",
      name: "A & C",
      primaryWeight: 0.1,
      secondaryWeight: 0.6,
      signedDifference: -0.5,
      stronger: "secondary",
    },
  ],
  edgeScaleDenominators: {
    difference: 0.6,
    sharedMean: 0.8,
    differenceDefinition: "maximum absolute Primary-minus-Secondary edge difference",
    sharedMeanDefinition: "shared maximum absolute Primary or Secondary mean edge weight",
  },
} as unknown as OpenEnaPairwiseContrast;

const sharedSetComparison = {
  referenceId: "open-ena-ref:solid-line-contract",
  axes: ["SVD1", "SVD2"],
  primary: {
    name: "Primary set",
    unitCount: 2,
    points: [],
    meanPoint: { SVD1: -0.4, SVD2: 0.2 },
  },
  secondary: {
    name: "Secondary set",
    unitCount: 2,
    points: [],
    meanPoint: { SVD1: 0.4, SVD2: -0.2 },
  },
  nodes: [
    { code: "A", x: -0.8, y: 0.4 },
    { code: "B", x: 0, y: 0.8 },
    { code: "C", x: 0.8, y: -0.4 },
  ],
  edges: [
    {
      source: "A",
      target: "B",
      name: "A & B",
      primaryWeight: 0.8,
      secondaryWeight: 0.2,
      signedDifference: 0.6,
      stronger: "primary",
    },
    {
      source: "A",
      target: "C",
      name: "A & C",
      primaryWeight: 0.1,
      secondaryWeight: 0.6,
      signedDifference: -0.5,
      stronger: "secondary",
    },
  ],
} as unknown as OpenEnaSharedComparison;

const comparisonProps = {
  edgeThreshold: 0,
  showPoints: false,
  showNetworks: true,
  showLabels: false,
  showGroupLabels: true,
  showUnitLabels: false,
  edgeScale: 1,
  pointScale: 1,
  plotZoom: 1,
  flipX: false,
  flipY: false,
};

function renderPairwiseContrast() {
  return renderToStaticMarkup(createElement(OpenEnaGroupContrast, {
    contrast: pairwiseContrast,
    showVariance: false,
    ...comparisonProps,
  }));
}

function renderSharedSetComparison() {
  return renderToStaticMarkup(createElement(OpenEnaSetComparison, {
    comparison: sharedSetComparison,
    ...comparisonProps,
  }));
}

function analyzedResult(model: OpenEnaConfig["model"]): OpenEnaResult {
  const dataset = parseCsv([
    "unit,conversation,condition,A,B,C",
    "primary-1,t1,Primary,1,1,0",
    "primary-1,t2,Primary,0,1,1",
    "primary-2,t1,Primary,1,1,0",
    "primary-2,t2,Primary,0,1,1",
    "secondary-1,t1,Secondary,1,0,1",
    "secondary-1,t2,Secondary,1,1,0",
    "secondary-2,t1,Secondary,1,0,1",
    "secondary-2,t2,Secondary,1,1,0",
  ].join("\n") + "\n", {
    name: "network-line-style.csv",
    source: "upload",
  });
  const config: OpenEnaConfig = {
    ...SAMPLE_CONFIG,
    unitColumns: ["unit"],
    conversationColumns: ["conversation"],
    groupColumn: "condition",
    codes: ["A", "B", "C"],
    model,
    window: "Conversation",
    windowSizeBack: 1,
    windowSizeForward: 0,
  };
  return analyzeDataset(dataset, config);
}

const endpointResult = analyzedResult("EndPoint");
const trajectoryResult = analyzedResult("SeparateTrajectory");

function renderMainPlot(result: OpenEnaResult, showNetworks: boolean, showTrajectories: boolean) {
  return renderToStaticMarkup(createElement(OpenEnaPlot, {
    result,
    groupColumn: "condition",
    view: "2d",
    xDimension: result.dimensions[0],
    yDimension: result.dimensions[1],
    zDimension: result.dimensions[2],
    camera: "xy",
    showPoints: false,
    showNetworks,
    showLabels: false,
    showUnitLabels: false,
    showVariance: false,
    showTrajectories,
    edgeScale: 1,
    edgeThreshold: 0,
    pointScale: 1,
    plotZoom: 1,
    flipX: false,
    flipY: false,
    copy: getOpenEnaCopy("en"),
  }));
}

test("current-result pairwise network edges use the official stable declared-group colors", () => {
  const markup = renderPairwiseContrast();
  const difference = plotSvg(markup, "open-ena-group-comparison-plot");
  const primary = plotSvg(markup, "open-ena-group-primary-plot");
  const secondary = plotSvg(markup, "open-ena-group-secondary-plot");

  expectStroke([lineBySign(difference, "positive")], OFFICIAL_FIRST_GROUP_RED, "first-group pairwise edge");
  expectStroke([lineBySign(difference, "negative")], OFFICIAL_SECOND_GROUP_BLUE, "second-group pairwise edge");
  expectStroke(endpointEdgeLines(primary), OFFICIAL_FIRST_GROUP_RED, "first-group side network");
  expectStroke(endpointEdgeLines(secondary), OFFICIAL_SECOND_GROUP_BLUE, "second-group side network");
});

test("current-result pairwise network edges are solid on the plain research canvas", () => {
  const markup = renderPairwiseContrast();
  const allEndpointEdges = [
    ...endpointEdgeLines(plotSvg(markup, "open-ena-group-comparison-plot")),
    ...endpointEdgeLines(plotSvg(markup, "open-ena-group-primary-plot")),
    ...endpointEdgeLines(plotSvg(markup, "open-ena-group-secondary-plot")),
  ];

  expectSolid(allEndpointEdges, "current-result pairwise plot");
  assert.doesNotMatch(markup, /Dashed negative/, "the pairwise legend must not describe a solid edge as dashed");
  assert.match(markup, /Solid Secondary cohort color: Secondary is stronger/, "the pairwise legend must disclose the solid Secondary difference encoding without rebinding group identity to a role color");
});

test("captured-set comparison edges use jENA blue for Primary/positive and red for Secondary/negative", () => {
  const markup = renderSharedSetComparison();
  const difference = plotSvg(markup, "open-ena-shared-difference-plot");
  const primary = plotSvg(markup, "open-ena-primary-plot");
  const secondary = plotSvg(markup, "open-ena-secondary-plot");

  expectStroke([lineBySign(difference, "positive")], JENA_PRIMARY_BLUE, "positive captured-set edge");
  expectStroke([lineBySign(difference, "negative")], JENA_SECONDARY_RED, "negative captured-set edge");
  expectStroke(endpointEdgeLines(primary), JENA_PRIMARY_BLUE, "Primary captured-set network");
  expectStroke(endpointEdgeLines(secondary), JENA_SECONDARY_RED, "Secondary captured-set network");
});

test("captured-set comparison endpoint edges are all solid", () => {
  const markup = renderSharedSetComparison();
  const allEndpointEdges = [
    ...endpointEdgeLines(plotSvg(markup, "open-ena-shared-difference-plot")),
    ...endpointEdgeLines(plotSvg(markup, "open-ena-primary-plot")),
    ...endpointEdgeLines(plotSvg(markup, "open-ena-secondary-plot")),
  ];

  expectSolid(allEndpointEdges, "captured-set comparison");
});

test("generic endpoint results and mini networks start with the jENA blue/red palette", () => {
  assert.deepEqual(
    endpointResult.groups.slice(0, 2).map((group) => group.color.toLowerCase()),
    [JENA_PRIMARY_BLUE, JENA_SECONDARY_RED],
    "the first two result groups must use the jENA blue/red palette",
  );

  for (const [index, color] of [JENA_PRIMARY_BLUE, JENA_SECONDARY_RED].entries()) {
    const group = endpointResult.groups[index] as GroupNetwork;
    const miniMarkup = renderToStaticMarkup(createElement(MiniNetwork, {
      result: endpointResult,
      group,
      xDimension: endpointResult.dimensions[0],
      yDimension: endpointResult.dimensions[1],
      label: `${group.name} mean ENA network`,
      maxNetworkWeight: Math.max(...endpointResult.groups.flatMap((entry) => Object.values(entry.meanWeights))),
      edgeThreshold: 0,
    }));
    expectStroke(lineTags(miniMarkup), color, `${group.name} mini network`);
    expectSolid(lineTags(miniMarkup), `${group.name} mini network`);
  }
});

test("generic endpoint network edges are solid and retain the jENA blue/red group colors", () => {
  const markup = renderMainPlot(endpointResult, true, false);
  const networkEdges = lineTags(markup).filter((line) => line.includes("stronger by"));
  const primaryEdges = networkEdges.filter((line) => line.includes("Primary stronger by"));
  const secondaryEdges = networkEdges.filter((line) => line.includes("Secondary stronger by"));

  expectStroke(primaryEdges, JENA_PRIMARY_BLUE, "generic Primary endpoint edge");
  expectStroke(secondaryEdges, JENA_SECONDARY_RED, "generic Secondary endpoint edge");
  expectSolid(networkEdges, "generic endpoint network");
});

test("data trajectory segments are solid while grid and zero-axis styling remain out of scope", () => {
  const markup = renderMainPlot(trajectoryResult, false, true);
  const trajectoryLines = lineTags(markup).filter((line) => line.includes('class="ena-trajectory-path"'));

  assert.ok(trajectoryLines.length > 0, "the trajectory fixture must render directed data segments");
  for (const line of trajectoryLines) {
    assert.doesNotMatch(line, /\sstroke-dasharray=/i, `data trajectory must be solid: ${line}`);
  }
});
