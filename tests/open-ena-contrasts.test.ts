import assert from "node:assert/strict";
import test from "node:test";
import { analyzeDataset } from "../lib/open-ena/analyze";
import {
  buildPairwiseGroupContrast,
  buildPairwiseGroupContrastExport,
  pairwiseGroupContrastEdgesToCsv,
} from "../lib/open-ena/contrasts";
import { parseCsv } from "../lib/open-ena/csv";
import { SAMPLE_CONFIG, type OpenEnaConfig, type OpenEnaResult } from "../lib/open-ena/types";
import { marginalMeanStudentT95 } from "../lib/open-ena/uncertainty";

function threeGroupEndpoint(): { result: OpenEnaResult; config: OpenEnaConfig } {
  const dataset = parseCsv(
    [
      "unit,conversation,group,A,B,C",
      "a1,c1,Alpha,1,1,0",
      "a2,c2,Alpha,1,1,1",
      "b1,c3,Beta,0,1,1",
      "b2,c4,Beta,0,1,1",
      "g1,c5,Gamma,1,0,1",
      "g2,c6,Gamma,1,0,1",
    ].join("\n") + "\n",
    { name: "three-group-endpoint.csv", source: "upload" },
  );
  const config: OpenEnaConfig = {
    ...SAMPLE_CONFIG,
    unitColumns: ["unit"],
    conversationColumns: ["conversation"],
    groupColumn: "group",
    codes: ["A", "B", "C"],
    model: "EndPoint",
    window: "Conversation",
  };
  return { result: analyzeDataset(dataset, config), config };
}

test("builds an ordered pairwise endpoint contrast from two selected groups in a three-group model", () => {
  const { result, config } = threeGroupEndpoint();
  const axes = [result.dimensions[1], result.dimensions[0]] as const;
  const contrast = buildPairwiseGroupContrast(
    result,
    config,
    "Gamma",
    "Alpha",
    axes,
    "2026-08-13T12:00:00.000Z",
  );

  assert.deepEqual(contrast.groupOrder, ["Gamma", "Alpha"]);
  assert.deepEqual(contrast.declaredGroups.map((group) => group.name), ["Alpha", "Beta", "Gamma"]);
  assert.deepEqual(contrast.axes, axes);
  assert.equal(contrast.primary.name, "Gamma");
  assert.equal(contrast.secondary.name, "Alpha");
  assert.equal(contrast.primary.unitCount, 2);
  assert.equal(contrast.secondary.unitCount, 2);
  assert.ok(contrast.primary.points.every((point) => point.group === "Gamma"));
  assert.ok(contrast.secondary.points.every((point) => point.group === "Alpha"));
  assert.equal(contrast.primary.meanConfidenceIntervals?.observationUnit, "endpoint-analytic-unit");
  assert.equal(contrast.primary.meanConfidenceIntervals?.interpretation, "two-separate-marginal-confidence-intervals");
  assert.equal(contrast.primary.meanConfidenceIntervals?.jointRegion, false);
  assert.equal(contrast.primary.meanConfidenceIntervals?.significanceTest, false);

  const gamma = result.groups.find((group) => group.name === "Gamma");
  const alpha = result.groups.find((group) => group.name === "Alpha");
  assert.ok(gamma && alpha);
  assert.equal(contrast.primary.color, gamma.color);
  assert.equal(contrast.secondary.color, alpha.color);
  assert.equal(contrast.primary.meanPoint[axes[0]], gamma.meanPoint[axes[0]]);
  assert.equal(contrast.secondary.meanPoint[axes[1]], alpha.meanPoint[axes[1]]);
  for (const edge of contrast.edges) {
    assert.equal(edge.primaryWeight, gamma.meanWeights[edge.name]);
    assert.equal(edge.secondaryWeight, alpha.meanWeights[edge.name]);
    assert.equal(edge.signedDifference, edge.primaryWeight - edge.secondaryWeight);
  }
  assert.equal(
    contrast.edgeScaleDenominators.difference,
    Math.max(...contrast.edges.map((edge) => Math.abs(edge.signedDifference))),
  );
  assert.equal(
    contrast.edgeScaleDenominators.sharedMean,
    Math.max(...contrast.edges.flatMap((edge) => [Math.abs(edge.primaryWeight), Math.abs(edge.secondaryWeight)])),
  );

  assert.equal(contrast.inference, null);
});

test("every selected pair shares one full-result coordinate extent and the extent includes reference nodes", () => {
  const { result, config } = threeGroupEndpoint();
  const axes = result.dimensions.slice(0, 2) as [string, string];
  const allPointX = result.set.points.map((row) => Number(row[axes[0]])).filter(Number.isFinite);
  const allPointY = result.set.points.map((row) => Number(row[axes[1]])).filter(Number.isFinite);
  const node = result.set.rotation.nodes?.[0];
  assert.ok(node);
  const nodeMaxX = Math.max(...allPointX) + 10;
  const nodeMinY = Math.min(...allPointY) - 10;
  node[axes[0]] = nodeMaxX;
  node[axes[1]] = nodeMinY;
  const allNodeX = (result.set.rotation.nodes ?? []).map((row) => Number(row[axes[0]])).filter(Number.isFinite);
  const allNodeY = (result.set.rotation.nodes ?? []).map((row) => Number(row[axes[1]])).filter(Number.isFinite);

  const alphaBeta = buildPairwiseGroupContrast(result, config, "Alpha", "Beta", axes);
  const betaGamma = buildPairwiseGroupContrast(result, config, "Beta", "Gamma", axes);

  assert.deepEqual(alphaBeta.coordinateExtent, betaGamma.coordinateExtent);
  assert.deepEqual(alphaBeta.coordinateExtent, {
    minX: Math.min(...allPointX, ...allNodeX),
    maxX: Math.max(...allPointX, ...allNodeX),
    minY: Math.min(...allPointY, ...allNodeY),
    maxY: Math.max(...allPointY, ...allNodeY),
  });
  assert.deepEqual(
    buildPairwiseGroupContrastExport(alphaBeta).coordinateExtent,
    alphaBeta.coordinateExtent,
  );
});

test("official plot framing reproduces webENA points.rotated.scaled across every fitted dimension", () => {
  const { result, config } = threeGroupEndpoint();
  const axes = result.dimensions.slice(0, 2) as [string, string];
  const contrast = buildPairwiseGroupContrast(result, config, "Alpha", "Beta", axes);
  const frame = contrast.officialPlotFrame;
  assert.ok(frame, "pairwise figures must carry the official webENA frame metadata");

  const pointValues = (axis: string) => result.set.points.map((row) => Number(row[axis]));
  const nodeValues = (axis: string) => (result.set.rotation.nodes ?? []).map((row) => Number(row[axis]));
  const minRatios = axes.map((axis) => Math.min(...nodeValues(axis)) / Math.min(...pointValues(axis)));
  const maxRatios = axes.map((axis) => Math.max(...nodeValues(axis)) / Math.max(...pointValues(axis)));
  const expectedPointScale = Math.min(
    Math.abs(Math.max(...minRatios)),
    Math.abs(Math.max(...maxRatios)),
  );

  const rotation = result.set.rotation.rotationMatrix;
  const edgeColumns = result.set.codeColumns;
  const fullDimensionCount = result.set.rotation.rotationColumns.length;
  const fullCoordinateRows = result.set.pointsForProjection.map((row) => Array.from(
    { length: fullDimensionCount },
    (_, dimension) => edgeColumns.reduce(
      (sum, column, index) => sum + Number(row[column]) * Number(rotation[index]?.[dimension]),
      0,
    ),
  ));
  const rawFullDimensionMaximum = Math.max(...fullCoordinateRows.flat().map(Math.abs));
  const confidenceMaximum = result.groups.reduce((maximum, group) => {
    const groupRowIndexes = result.set.pointsForProjection
      .map((row, index) => row.group === group.name ? index : -1)
      .filter((index) => index >= 0);
    for (let dimension = 0; dimension < fullDimensionCount; dimension += 1) {
      const interval = marginalMeanStudentT95(
        groupRowIndexes.map((index) => fullCoordinateRows[index][dimension]),
      );
      if (interval.status === "estimable") {
        maximum = Math.max(
          maximum,
          Math.abs(interval.lower * expectedPointScale),
          Math.abs(interval.upper * expectedPointScale),
        );
      }
    }
    return maximum;
  }, 0);
  const expectedMaxPosition = Math.max(rawFullDimensionMaximum * expectedPointScale, confidenceMaximum);

  assert.equal(frame.source, "webena-points-rotated-scaled");
  assert.ok(Math.abs(frame.pointScaleFactor - expectedPointScale) < 1e-12);
  assert.ok(Math.abs(frame.maxPosition - expectedMaxPosition) < 1e-12);
  assert.ok(Math.abs(frame.extremePosition - frame.maxPosition * 1.2) < 1e-12);

  const reversed = buildPairwiseGroupContrast(result, config, "Beta", "Alpha", axes);
  assert.deepEqual(reversed.officialPlotFrame, frame, "plot switching must not change the camera frame");
});

test("official plot framing includes every declared group's confidence bounds across the full rotation", () => {
  const { result, config } = threeGroupEndpoint();
  const axes = result.dimensions.slice(0, 2) as [string, string];
  const baseline = buildPairwiseGroupContrast(result, config, "Alpha", "Beta", axes);
  const ciDominant = structuredClone(result);
  const edgeColumns = ciDominant.set.codeColumns;
  const fullDimensionCount = ciDominant.set.rotation.rotationColumns.length;
  assert.equal(edgeColumns.length, 3);
  assert.equal(fullDimensionCount, 3);
  ciDominant.set.rotation.rotationMatrix = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (const row of ciDominant.set.pointsForProjection) {
    for (const column of edgeColumns) row[column] = 0;
  }
  const unselectedGroupPoints = ciDominant.set.pointsForProjection
    .filter((row) => row.group === "Gamma");
  assert.equal(unselectedGroupPoints.length, 2);
  unselectedGroupPoints[0][edgeColumns[2]] = -1;
  unselectedGroupPoints[1][edgeColumns[2]] = 1;

  const contrast = buildPairwiseGroupContrast(ciDominant, config, "Alpha", "Beta", axes);
  const frame = contrast.officialPlotFrame;
  assert.ok(frame);
  assert.ok(!contrast.groupOrder.includes("Gamma"));
  assert.ok(!contrast.axes.includes(ciDominant.set.rotation.rotationColumns[2]));
  const thirdDimensionInterval = marginalMeanStudentT95([-1, 1]);
  assert.equal(thirdDimensionInterval.status, "estimable");
  const expectedConfidenceMaximum = Math.max(
    Math.abs(thirdDimensionInterval.lower),
    Math.abs(thirdDimensionInterval.upper),
  ) * frame.pointScaleFactor;
  assert.ok(
    expectedConfidenceMaximum > frame.pointScaleFactor,
    "the synthetic third-dimension confidence bound must dominate its scaled endpoint points",
  );
  assert.ok(Math.abs(frame.maxPosition - expectedConfidenceMaximum) < 1e-12);
  assert.ok(Math.abs(frame.extremePosition - expectedConfidenceMaximum * 1.2) < 1e-12);

  assert.deepEqual(contrast.coordinateExtent, baseline.coordinateExtent);
  assert.deepEqual(contrast.inference, baseline.inference);
});

test("pairwise contrasts fail closed for unsupported models, ambiguous groups, empty groups, and invalid axes", () => {
  const { result, config } = threeGroupEndpoint();
  const axes = result.dimensions.slice(0, 2);

  const trajectory = structuredClone(result);
  trajectory.set.modelType = "SeparateTrajectory";
  assert.throws(
    () => buildPairwiseGroupContrast(trajectory, { ...config, model: "SeparateTrajectory" }, "Alpha", "Beta", axes),
    /endpoint/i,
  );
  assert.throws(() => buildPairwiseGroupContrast(result, config, "Alpha", "Alpha", axes), /distinct/i);
  assert.throws(() => buildPairwiseGroupContrast(result, config, "alpha", "Beta", axes), /exactly match/i);
  assert.throws(() => buildPairwiseGroupContrast(result, config, "missing", "Beta", axes), /exactly match/i);
  assert.throws(() => buildPairwiseGroupContrast(result, config, "Alpha", "Beta", [axes[0]]), /two distinct axes/i);
  assert.throws(() => buildPairwiseGroupContrast(result, config, "Alpha", "Beta", [axes[0], axes[0]]), /two distinct axes/i);
  assert.throws(() => buildPairwiseGroupContrast(result, config, "Alpha", "Beta", [axes[0], "missing-axis"]), /current ENA result geometry/i);

  const empty = structuredClone(result);
  empty.set.points = empty.set.points.filter((row) => row.group !== "Alpha");
  empty.set.lineWeights = empty.set.lineWeights.filter((row) => row.group !== "Alpha");
  assert.throws(() => buildPairwiseGroupContrast(empty, config, "Alpha", "Beta", axes), /must contain/i);

  const duplicateDeclaration = structuredClone(result);
  duplicateDeclaration.groups[1].name = "Alpha";
  assert.throws(
    () => buildPairwiseGroupContrast(duplicateDeclaration, config, "Alpha", "Gamma", axes),
    /unique|ambiguous/i,
  );
});

test("endpoint contrasts reject duplicate rows instead of overweighting a repeated analytic unit", () => {
  const { result, config } = threeGroupEndpoint();
  const duplicated = structuredClone(result);
  duplicated.set.points.push({ ...duplicated.set.points.find((row) => row.ENA_UNIT === "a1")! });
  duplicated.set.lineWeights.push({ ...duplicated.set.lineWeights.find((row) => row.ENA_UNIT === "a1")! });

  assert.throws(
    () => buildPairwiseGroupContrast(duplicated, config, "Alpha", "Beta"),
    /exactly one coordinate row and one network row per endpoint analytic unit/i,
  );
});

test("endpoint contrasts reject an analytic unit assigned to both selected groups", () => {
  const { result, config } = threeGroupEndpoint();
  const unstable = structuredClone(result);
  const alphaPoint = unstable.set.points.find((row) => row.ENA_UNIT === "a1");
  const alphaLine = unstable.set.lineWeights.find((row) => row.ENA_UNIT === "a1");
  assert.ok(alphaPoint && alphaLine);
  unstable.set.points.push({ ...alphaPoint, group: "Beta" });
  unstable.set.lineWeights.push({ ...alphaLine, group: "Beta" });

  assert.throws(
    () => buildPairwiseGroupContrast(unstable, config, "Alpha", "Beta"),
    /exactly one selected group|populations overlap/i,
  );
});

test("swapping Primary and Secondary negates signed quantities without changing geometry or fit provenance", () => {
  const { result, config } = threeGroupEndpoint();
  const axes = result.dimensions.slice(0, 2);
  const forward = buildPairwiseGroupContrast(result, config, "Alpha", "Beta", axes, "2026-08-13T12:00:00.000Z");
  const reverse = buildPairwiseGroupContrast(result, config, "Beta", "Alpha", axes, "2026-08-13T12:00:00.000Z");

  assert.deepEqual(forward.geometry, reverse.geometry);
  assert.deepEqual(forward.coordinateExtent, reverse.coordinateExtent);
  assert.deepEqual(forward.resultProvenance.fit, reverse.resultProvenance.fit);
  assert.deepEqual(forward.primary, reverse.secondary);
  assert.deepEqual(forward.secondary, reverse.primary);
  for (const edge of forward.edges) {
    const swapped = reverse.edges.find((candidate) => candidate.name === edge.name);
    assert.ok(swapped);
    assert.equal(swapped.signedDifference, -edge.signedDifference);
    assert.equal(
      swapped.stronger,
      edge.stronger === "primary" ? "secondary" : edge.stronger === "secondary" ? "primary" : "equal",
    );
  }
  assert.equal(forward.inference, null);
  assert.equal(reverse.inference, null);
});

test("JSON and CSV exports bind group order, axes, configuration, result geometry, reference provenance, and interpretation boundaries", () => {
  const { result, config } = threeGroupEndpoint();
  const boundResult: OpenEnaResult = {
    ...result,
    provenanceBinding: {
      datasetNormalizedUtf8TextSha256: "a".repeat(64),
      configuration: structuredClone(config),
    },
  };
  const axes = result.dimensions.slice(0, 2);
  const contrast = buildPairwiseGroupContrast(
    boundResult,
    config,
    "Beta",
    "Gamma",
    axes,
    "2026-08-13T12:30:00.000Z",
  );
  const bundle = buildPairwiseGroupContrastExport(contrast);

  assert.equal(bundle.kind, "open-ena-pairwise-group-contrast");
  assert.deepEqual(bundle.declaredGroups.map((group) => group.name), ["Alpha", "Beta", "Gamma"]);
  assert.deepEqual(bundle.groupOrder, ["Beta", "Gamma"]);
  assert.deepEqual(bundle.selectedAxes, axes);
  assert.deepEqual(bundle.configuration, config);
  assert.equal(bundle.resultProvenance.analyzedAt, result.analyzedAt);
  assert.equal(bundle.resultProvenance.model, "EndPoint");
  assert.equal(bundle.resultProvenance.sourceDatasetNormalizedUtf8TextSha256, "a".repeat(64));
  assert.equal(bundle.resultProvenance.projectionReference, null);
  assert.deepEqual(bundle.geometry.rotationColumns, result.set.rotation.rotationColumns);
  assert.deepEqual(bundle.geometry.rotationMatrix, result.set.rotation.rotationMatrix);
  assert.deepEqual(bundle.geometry.adjacencyKey, result.set.adjacencyKey);
  assert.deepEqual(bundle.comparison.edges, contrast.edges);
  assert.equal(bundle.inference, null);
  assert.ok(bundle.boundaries.some((boundary) => /descriptive/i.test(boundary)));
  assert.ok(bundle.boundaries.some((boundary) => /primary.*minus.*secondary/i.test(boundary)));
  assert.ok(bundle.boundaries.some((boundary) => /does not calculate inferential statistics/i.test(boundary)));
  assert.doesNotMatch(JSON.stringify(bundle), /pValueTwoSided|uFirst|rankBiserialFirstVsSecond/);
  assert.ok(bundle.boundaries.some((boundary) => /raw source rows/i.test(boundary)));
  assert.doesNotMatch(JSON.stringify(bundle), /rawRows|rowConnectionCounts|pointsForProjection/);

  const csv = pairwiseGroupContrastEdgesToCsv(contrast);
  const header = csv.split("\r\n")[0];
  assert.match(header, /primaryGroup,secondaryGroup,xAxis,yAxis/);
  assert.match(header, /configurationJson,resultProvenanceJson,boundariesJson/);
  assert.match(csv, /Beta,Gamma/);
  assert.match(csv, new RegExp(axes[0]));
  assert.match(csv, /sourceDatasetNormalizedUtf8TextSha256/);
  assert.match(csv, /Primary-minus-Secondary/);
});

test("projected mean-rotation lineage remains intact for circularity classification", () => {
  const { result, config } = threeGroupEndpoint();
  const projectedConfig: OpenEnaConfig = {
    ...config,
    rotation: "reference",
    referenceRotationId: "open-ena-ref:mean-three-group",
  };
  const projected: OpenEnaResult = {
    ...result,
    projectionReference: {
      schemaVersion: 1,
      kind: "open-ena-reference-rotation",
      app: "ENA.HK Open ENA",
      runtime: "jena-js",
      runtimeVersion: "0.6.2",
      referenceId: "open-ena-ref:mean-three-group",
      name: "Mean contrast reference",
      source: {
        datasetName: "fitted-source.csv",
        normalizedUtf8TextSha256: "c".repeat(64),
        analyzedAt: "2026-08-13T10:00:00.000Z",
      },
      fit: {
        method: "mean",
        unitColumns: ["unit"],
        conversationColumns: ["conversation"],
        groupColumn: "group",
        groupOrder: ["Alpha", "Beta"],
      },
      compatibility: {
        model: "EndPoint",
        codes: ["A", "B", "C"],
        window: "Conversation",
        windowSizeBack: "Infinity",
        windowSizeForward: 0,
        weightBy: "binary",
        centerAlignToOrigin: true,
        normalization: "sphere",
      },
    },
    provenanceBinding: {
      datasetNormalizedUtf8TextSha256: "d".repeat(64),
      configuration: structuredClone(projectedConfig),
    },
  };

  const bundle = buildPairwiseGroupContrastExport(
    buildPairwiseGroupContrast(projected, projectedConfig, "Alpha", "Gamma"),
  );
  assert.deepEqual(bundle.resultProvenance.projectionReference?.fit, projected.projectionReference?.fit);
  assert.deepEqual(bundle.resultProvenance.projectionReference?.source, projected.projectionReference?.source);
  assert.equal(bundle.resultProvenance.sourceDatasetNormalizedUtf8TextSha256, "d".repeat(64));
});

test("a directly fitted mean rotation exports its original fit order independently of selected pair order", () => {
  const dataset = parseCsv(
    [
      "unit,conversation,group,A,B,C",
      "a1,c1,Alpha,1,1,0",
      "a2,c2,Alpha,1,1,1",
      "b1,c3,Beta,0,1,1",
      "b2,c4,Beta,0,1,1",
    ].join("\n") + "\n",
    { name: "direct-mean-fit.csv", source: "upload" },
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
  const result: OpenEnaResult = {
    ...analyzed,
    provenanceBinding: {
      datasetNormalizedUtf8TextSha256: "e".repeat(64),
      configuration: structuredClone(config),
    },
  };
  const bundle = buildPairwiseGroupContrastExport(
    buildPairwiseGroupContrast(result, config, "Beta", "Alpha"),
  );

  assert.deepEqual(bundle.groupOrder, ["Beta", "Alpha"]);
  assert.deepEqual(bundle.resultProvenance.fit, {
    method: "mean",
    unitColumns: ["unit"],
    conversationColumns: ["conversation"],
    groupColumn: "group",
    groupOrder: ["Alpha", "Beta"],
  });
  assert.equal(bundle.resultProvenance.sourceDatasetNormalizedUtf8TextSha256, "e".repeat(64));
});

test("a result provenance binding must match the supplied configuration", () => {
  const { result, config } = threeGroupEndpoint();
  const mismatched: OpenEnaResult = {
    ...result,
    provenanceBinding: {
      datasetNormalizedUtf8TextSha256: "b".repeat(64),
      configuration: { ...config, weightBy: "sum" },
    },
  };

  assert.throws(
    () => buildPairwiseGroupContrast(mismatched, config, "Alpha", "Beta"),
    /provenance binding.*configuration|configuration.*provenance binding/i,
  );
});
