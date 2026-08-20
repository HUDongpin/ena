import assert from "node:assert/strict";
import test from "node:test";
import { analyzeDataset } from "../lib/open-ena/analyze";
import {
  buildPairwiseGroupContrast,
  buildPairwiseGroupContrastExport,
} from "../lib/open-ena/contrasts";
import { parseCsv } from "../lib/open-ena/csv";
import { buildAnalysisBundle } from "../lib/open-ena/export";
import {
  buildEndpointMannWhitney,
  MANN_WHITNEY_METHOD,
  SELECTED_MANN_WHITNEY_METHOD,
} from "../lib/open-ena/inference";
import { buildMethodsReport } from "../lib/open-ena/methods";
import {
  SAMPLE_CONFIG,
  type OpenEnaConfig,
  type OpenEnaResult,
  type ParsedDataset,
} from "../lib/open-ena/types";

const SOURCE_TEXT_SENTINEL = "PRIVATE_UNSELECTED_SOURCE_TEXT_MUST_NOT_LEAVE_THE_BROWSER";
const SOURCE_HASH = "7".repeat(64);

function threeGroupMeanFixture(): {
  dataset: ParsedDataset;
  config: OpenEnaConfig;
  result: OpenEnaResult;
} {
  const dataset = parseCsv(
    [
      "unit,conversation,group,A,B,C,utterance",
      `a1,c1,Alpha,1,1,0,${SOURCE_TEXT_SENTINEL}_A1`,
      `a2,c2,Alpha,1,1,1,${SOURCE_TEXT_SENTINEL}_A2`,
      `b1,c3,Beta,0,1,1,${SOURCE_TEXT_SENTINEL}_B1`,
      `b2,c4,Beta,0,1,1,${SOURCE_TEXT_SENTINEL}_B2`,
      `g1,c5,Gamma,1,0,1,${SOURCE_TEXT_SENTINEL}_G1`,
      `g2,c6,Gamma,1,0,1,${SOURCE_TEXT_SENTINEL}_G2`,
    ].join("\n") + "\n",
    { name: "three-group-mean.csv", source: "upload" },
  );
  const config: OpenEnaConfig = {
    ...SAMPLE_CONFIG,
    unitColumns: ["unit"],
    conversationColumns: ["conversation"],
    groupColumn: "group",
    codes: ["A", "B", "C"],
    model: "EndPoint",
    window: "Conversation",
    rotation: "mean",
  };
  const analyzed = analyzeDataset(dataset, config);
  return {
    dataset,
    config,
    result: {
      ...analyzed,
      provenanceBinding: {
        datasetNormalizedUtf8TextSha256: SOURCE_HASH,
        configuration: structuredClone(config),
      },
    },
  };
}

function twoGroupFixture() {
  const dataset = parseCsv(
    [
      "unit,conversation,group,A,B,C",
      "a1,c1,Alpha,1,1,0",
      "a2,c2,Alpha,1,1,1",
      "b1,c3,Beta,0,1,1",
      "b2,c4,Beta,0,1,1",
    ].join("\n") + "\n",
    { name: "two-group-svd.csv", source: "upload" },
  );
  const config: OpenEnaConfig = {
    ...SAMPLE_CONFIG,
    unitColumns: ["unit"],
    conversationColumns: ["conversation"],
    groupColumn: "group",
    codes: ["A", "B", "C"],
    model: "EndPoint",
    window: "Conversation",
    rotation: "svd",
  };
  return { dataset, config, result: analyzeDataset(dataset, config) };
}

test("analysis bundle v2 keeps the active plot contrast as non-authoritative compatibility data", () => {
  const { dataset, config, result } = threeGroupMeanFixture();
  const selectedAxes = [result.dimensions[1], result.dimensions[0]] as [string, string];
  const selectedGroupOrder = ["Beta", "Gamma"] as [string, string];
  const contrast = buildPairwiseGroupContrast(
    result,
    config,
    selectedGroupOrder[0],
    selectedGroupOrder[1],
    selectedAxes,
    "2026-08-13T13:00:00.000Z",
  );
  const bundle = buildAnalysisBundle(dataset, config, result, SOURCE_HASH, {
    methodsDimensions: selectedAxes,
    methodsFlipX: true,
    methodsFlipY: false,
    edgeThreshold: 0.375,
    showNetworks: false,
    showPoints: true,
    selectedGroupOrder,
    groupContrast: contrast,
  });

  assert.ok(bundle.groupContrast);
  assert.equal(bundle.schemaVersion, 2);
  assert.equal(bundle.inference, null);
  const {
    schemaVersion,
    kind,
    app,
    runtime,
    runtimeVersion,
    inference,
    inferenceAuthority,
    compatibilityNotice,
    ...bundledContrast
  } = bundle.groupContrast;
  assert.equal(schemaVersion, 1);
  assert.equal(kind, "open-ena-pairwise-group-contrast");
  assert.equal(app, "ENA.HK Open ENA");
  assert.equal(runtime, "jena-js");
  assert.equal(runtimeVersion, "0.6.2");
  const { inference: _legacyInference, ...contrastWithoutInference } = contrast;
  assert.deepEqual(bundledContrast, {
    ...contrastWithoutInference,
    boundaries: contrastWithoutInference.boundaries.filter((boundary) => (
      !/Mann[-–]Whitney inference|multiplicity correction/iu.test(boundary)
    )),
  });
  assert.equal(inference, null);
  assert.equal(inferenceAuthority, "top-level-inference-v2");
  assert.match(compatibilityNotice, /non-authoritative/i);
  assert.doesNotMatch(JSON.stringify(bundle.groupContrast), /"multiplicityCorrection":"none"|no multiplicity correction/i);
  assert.notStrictEqual(bundle.groupContrast, contrast);
  assert.deepEqual(bundle.manifest.result.groups.map(({ name }) => name), ["Alpha", "Beta", "Gamma"]);
  assert.equal(bundle.manifest.dataset.normalizedUtf8TextSha256, SOURCE_HASH);
  assert.deepEqual(bundle.presentation.selectedAxes, selectedAxes);
  assert.deepEqual(bundle.presentation.selectedGroupOrder, selectedGroupOrder);
  assert.equal(bundle.presentation.flipX, true);
  assert.equal(bundle.presentation.flipY, false);
  assert.equal(bundle.presentation.edgeThreshold, 0.375);
  assert.equal(bundle.presentation.showNetworks, false);
  assert.equal(bundle.presentation.showPoints, true);

  assert.match(bundle.methodsReportMarkdown, /No researcher-confirmed inferential comparison was run/i);
  assert.match(bundle.methodsReportMarkdown, /37\.5% \(0\.375\).*presentation-only/i);
  assert.match(bundle.methodsReportMarkdown, /X .*\(flipped\); Y .*\(unflipped\)/);
  assert.match(bundle.methodsReportMarkdown, /## Group-mean uncertainty guides/);
  assert.match(bundle.methodsReportMarkdown, /mean ± t\(0\.975, n−1\) × sample SD \/ √n/);
  assert.match(bundle.methodsReportMarkdown, /not a joint 95% two-dimensional confidence region/i);
  assert.match(bundle.methodsReportMarkdown, /No simultaneous-coverage correction was applied across axes/i);
  assert.match(bundle.methodsReportMarkdown, /conditional on the ENA coordinate system fitted to this dataset/i);
  assert.match(bundle.methodsReportMarkdown, /\| `Beta` \| `SVD\d+` \| \d+ \|/);
  assert.match(bundle.methodsReportMarkdown, /\| `Gamma` \| `SVD\d+` \| \d+ \|/);
});

test("selected plot pairs affect descriptive guides but never trigger Methods inference", () => {
  const { dataset, config, result } = threeGroupMeanFixture();
  const axes = result.dimensions.slice(0, 2);
  const repeatedSelections = [
    ["Alpha", "Gamma"],
    ["Beta", "Gamma"],
    ["Gamma", "Alpha"],
  ] as const;

  for (const groupOrder of repeatedSelections) {
    const report = buildMethodsReport(dataset, config, result, SOURCE_HASH, axes, {
      selectedGroupOrder: groupOrder,
    });
    assert.ok(report.includes(`For \`${groupOrder[0]}\` and \`${groupOrder[1]}\``));
    assert.match(report, /No researcher-confirmed inferential comparison was run/i);
    assert.doesNotMatch(report, /Holm-adjusted p/i);
  }
});

test("dedicated contrast export omits raw source text while preserving declared provenance, fit order, and signed Primary-minus-Secondary direction", () => {
  const { config, result } = threeGroupMeanFixture();
  const axes = [result.dimensions[0], result.dimensions[2]] as [string, string];
  const betaMinusGamma = buildPairwiseGroupContrast(
    result,
    config,
    "Beta",
    "Gamma",
    axes,
    "2026-08-13T13:10:00.000Z",
  );
  const gammaMinusBeta = buildPairwiseGroupContrast(
    result,
    config,
    "Gamma",
    "Beta",
    axes,
    "2026-08-13T13:11:00.000Z",
  );
  const exported = buildPairwiseGroupContrastExport(betaMinusGamma, {
    flipX: true,
    flipY: false,
    edgeThreshold: 0.25,
    showNetworks: true,
    showPoints: false,
    showLabels: true,
    showGroupLabels: true,
    showUnitLabels: false,
    showVariance: true,
    edgeScale: 1.4,
    pointScale: 0.8,
    plotZoom: 1.2,
  });
  const reversed = buildPairwiseGroupContrastExport(gammaMinusBeta);

  assert.deepEqual(exported.groupOrder, ["Beta", "Gamma"]);
  assert.deepEqual(exported.selectedAxes, axes);
  assert.deepEqual(exported.configuration, config);
  assert.deepEqual(exported.resultProvenance, {
    analyzedAt: result.analyzedAt,
    model: "EndPoint",
    dimensions: result.dimensions,
    sourceDatasetNormalizedUtf8TextSha256: SOURCE_HASH,
    sourceBindingStatus: "bound",
    projectionReference: null,
    rotationMethod: "mean",
    referenceId: null,
    fit: {
      method: "mean",
      unitColumns: ["unit"],
      conversationColumns: ["conversation"],
      groupColumn: "group",
      groupOrder: ["Alpha", "Beta"],
    },
  });
  assert.deepEqual(exported.geometry.dimensions, result.dimensions);
  assert.deepEqual(exported.geometry.rotationColumns, result.set.rotation.rotationColumns);
  assert.deepEqual(exported.geometry.rotationMatrix, result.set.rotation.rotationMatrix);
  assert.deepEqual(exported.inference.groupOrder, ["Beta", "Gamma"]);
  assert.equal(exported.inference.multiplicityCorrection, "none");
  assert.deepEqual(exported.presentation, {
    selectedAxes: axes,
    flipX: true,
    flipY: false,
    edgeThreshold: 0.25,
    showNetworks: true,
    showPoints: false,
    showLabels: true,
    showGroupLabels: true,
    showUnitLabels: false,
    showVariance: true,
    edgeScale: 1.4,
    pointScale: 0.8,
    plotZoom: 1.2,
    statisticsCoordinateSystem: "unflipped model coordinates",
    thresholdDefinitions: {
      comparison: "edgeThreshold is relative to the maximum absolute Primary-minus-Secondary edge difference",
      sideNetworks: "edgeThreshold is relative to the shared maximum absolute Primary or Secondary mean edge weight",
    },
    edgeScaleDenominators: betaMinusGamma.edgeScaleDenominators,
  });

  const reversedByName = new Map(reversed.comparison.edges.map((edge) => [edge.name, edge]));
  for (const edge of exported.comparison.edges) {
    const reverseEdge = reversedByName.get(edge.name);
    assert.ok(reverseEdge);
    assert.equal(edge.signedDifference, edge.primaryWeight - edge.secondaryWeight);
    assert.ok(Math.abs(edge.signedDifference + reverseEdge.signedDifference) <= 1e-12);
    assert.equal(
      reverseEdge.stronger,
      edge.stronger === "primary" ? "secondary" : edge.stronger === "secondary" ? "primary" : "equal",
    );
  }

  const serialized = JSON.stringify(exported);
  assert.doesNotMatch(serialized, new RegExp(SOURCE_TEXT_SENTINEL));
  assert.doesNotMatch(serialized, /"(?:rawRows|sourceRows|pointsForProjection|connectionCounts|lineWeights|utterance)"/);
  assert.match(serialized, /Raw source rows/);
  assert.match(serialized, /Primary-minus-Secondary/);
});

test("legacy low-level pair selection remains compatible but Methods never invokes it", () => {
  const threeGroup = threeGroupMeanFixture();
  const axes = threeGroup.result.dimensions.slice(0, 2);
  const selected = buildEndpointMannWhitney(
    threeGroup.result,
    "group",
    axes,
    ["Gamma", "Beta"],
  );

  assert.equal(selected.status, "available");
  assert.equal(selected.method, SELECTED_MANN_WHITNEY_METHOD);
  assert.match(selected.method, /Primary selected group/);
  assert.doesNotMatch(selected.method, /first declared group/);
  assert.deepEqual(selected.groupOrder, ["Gamma", "Beta"]);
  assert.equal(selected.multiplicityCorrection, "none");

  const selectedReport = buildMethodsReport(
    threeGroup.dataset,
    threeGroup.config,
    threeGroup.result,
    SOURCE_HASH,
    axes,
    { selectedGroupOrder: ["Gamma", "Beta"] },
  );
  assert.match(selectedReport, /For `Gamma` and `Beta`/);
  assert.match(selectedReport, /No researcher-confirmed inferential comparison was run/i);
  assert.doesNotMatch(selectedReport, /Rank-biserial effects/);

  const legacyFixture = twoGroupFixture();
  const legacy = buildEndpointMannWhitney(
    legacyFixture.result,
    "group",
    legacyFixture.result.dimensions.slice(0, 2),
  );
  assert.equal(legacy.status, "available");
  assert.equal(legacy.method, MANN_WHITNEY_METHOD);
  assert.match(legacy.method, /first declared group/);
  assert.doesNotMatch(legacy.method, /Primary selected group/);
  assert.deepEqual(legacy.groupOrder, ["Alpha", "Beta"]);

  const legacyReport = buildMethodsReport(
    legacyFixture.dataset,
    legacyFixture.config,
    legacyFixture.result,
  );
  assert.match(legacyReport, /No researcher-confirmed inferential comparison was run/i);
  assert.doesNotMatch(legacyReport, /(?:Selected|Declared) group order/);
});
