import assert from "node:assert/strict";
import test from "node:test";
import type { Row } from "jena-js";
import {
  analyzeDataset,
  bindOpenEnaResultProvenance,
  compactOpenEnaSet,
} from "../lib/open-ena/analyze";
import { buildOpenEnaOnaDescriptiveSummary } from "../lib/open-ena/ona-descriptive";
import { createDirectionalMask } from "../lib/open-ena/network-config";
import { buildOpenEnaOrderedAudit } from "../lib/open-ena/ordered-audit";
import type { OpenEnaConfig, OpenEnaResult, ParsedDataset } from "../lib/open-ena/types";

function orderedFixture(windowSizeBack: number = 2) {
  const codes = ["A", "B", "C"];
  const directionalMask = createDirectionalMask(codes);
  directionalMask.enabled[1][0] = false;
  const config: OpenEnaConfig = {
    analysisKind: "ona",
    unitColumns: ["unit"],
    conversationColumns: ["horizon"],
    groupColumn: "group",
    codes,
    model: "EndPoint",
    window: "MovingStanzaWindow",
    windowSizeBack,
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
    directionalMask,
  };
  const rows: Row[] = [
    { unit: "PRIVATE-u1", horizon: "PRIVATE-h1", turn: 1, group: "g1", A: 2, B: 0, C: 0 },
    { unit: "PRIVATE-u1", horizon: "PRIVATE-h1", turn: 2, group: "g1", A: 0, B: 3, C: 0 },
    { unit: "PRIVATE-u2", horizon: "PRIVATE-h2", turn: 1, group: "g2", A: 1, B: 1, C: 0 },
    { unit: "PRIVATE-u2", horizon: "PRIVATE-h2", turn: 2, group: "g2", A: 0, B: 2, C: 1 },
  ];
  const dataset: ParsedDataset = {
    name: "private.csv",
    headers: ["unit", "horizon", "turn", "group", "A", "B", "C"],
    rows,
    sizeBytes: 99,
    source: "upload",
  };
  const full = analyzeDataset(dataset, config);
  const orderedAudit = buildOpenEnaOrderedAudit(full.set);
  assert.ok(orderedAudit);
  const compact: OpenEnaResult = {
    ...full,
    set: compactOpenEnaSet(full.set),
    orderedAudit,
  };
  const result = bindOpenEnaResultProvenance(compact, dataset, "a".repeat(64), config);
  return { config, dataset, result };
}

test("ONA descriptive summary reports the complete directed descriptive contract without inference", () => {
  const { config, result } = orderedFixture();
  const summary = buildOpenEnaOnaDescriptiveSummary({ result, config });

  assert.equal(summary.analysisKind, "ona");
  assert.equal(summary.interpretationBoundary, "descriptive-only");
  assert.equal(summary.scope.kind, "overall");
  assert.equal(summary.unitCount, 2);
  assert.equal(summary.responseRowCount, 4);
  assert.equal(summary.opaqueHorizonCount, 2);
  assert.equal(summary.codeCount, 3);
  assert.equal(summary.directedCellCount, 9);
  assert.equal(summary.enabledCellCount, 8);
  assert.equal(summary.maskedCellCount, 1);
  assert.equal(summary.zeroNetworkCount, 0);
  assert.equal(summary.rawConnectionTotal, 14.5);
  assert.equal(summary.rawSelfConnectionTotal, 2);
  assert.equal(summary.rawOffDiagonalConnectionTotal, 12.5);
  assert.equal(summary.rawConnectionTotal, summary.rawSelfConnectionTotal + summary.rawOffDiagonalConnectionTotal);
  assert.deepEqual(summary.groupCounts, [
    { name: "g1", unitCount: 1 },
    { name: "g2", unitCount: 1 },
  ]);
  assert.deepEqual(summary.incomingRawTotals.map((entry) => entry.code), ["A", "B", "C"]);
  assert.deepEqual(summary.outgoingRawTotals.map((entry) => entry.code), ["A", "B", "C"]);
  assert.deepEqual(summary.incomingRawTotals.map((entry) => entry.rawMass), [0, 11.5, 3]);
  assert.deepEqual(summary.outgoingRawTotals.map((entry) => entry.rawMass), [9.5, 4, 1]);
  assert.equal(summary.topDirectedEdges.length > 0, true);
  assert.deepEqual(
    new Set(summary.pairAsymmetries.map((entry) => `${entry.firstCode}:${entry.secondCode}`)),
    new Set(["A:B", "A:C", "B:C"]),
  );
  assert.deepEqual(summary.varianceDiagnostics.map((entry) => entry.dimension), result.dimensions);
  assert.equal("pValue" in summary, false);
  assert.equal("effectSize" in summary, false);
  assert.equal("confidenceInterval" in summary, false);
  assert.equal("causal" in summary, false);

  const masked = summary.edges.find((edge) => edge.groundSource === "B" && edge.responseTarget === "A");
  const aToB = summary.edges.find((edge) => edge.groundSource === "A" && edge.responseTarget === "B");
  assert.ok(masked);
  assert.ok(aToB);
  assert.equal(masked.maskEnabled, false);
  assert.equal(masked.rawAggregateCount, 0);
  assert.equal(masked.equalUnitNormalizedMean, 0);
  assert.equal(aToB.rawAggregateCount, 8.5);
  assert.equal(aToB.nonzeroUnitCount, 2);
});

test("ONA descriptive group scopes remain aggregate equal-unit means and never become contrasts", () => {
  const { config, result } = orderedFixture();
  const overall = buildOpenEnaOnaDescriptiveSummary({ result, config });
  const group = buildOpenEnaOnaDescriptiveSummary({
    result,
    config,
    scope: { kind: "group", name: "g1" },
  });

  assert.equal(group.scopeLabel, "g1 ordered mean network");
  assert.equal(group.unitCount, 1);
  assert.equal(group.groupCounts.length, 2, "group counts describe the completed result, not a subtraction");
  assert.notDeepEqual(
    group.edges.map((edge) => edge.equalUnitNormalizedMean),
    overall.edges.map((edge) => edge.equalUnitNormalizedMean),
  );
  assert.throws(
    () => buildOpenEnaOnaDescriptiveSummary({
      result,
      config,
      scope: { kind: "group", name: "missing" },
    }),
    /group scope/i,
  );
});

test("ONA descriptive summaries accept only the explicit Infinity horizon sentinel and fail closed on stale or nonfinite evidence", () => {
  const entire = orderedFixture(Number.POSITIVE_INFINITY);
  assert.doesNotThrow(() => buildOpenEnaOnaDescriptiveSummary(entire));

  const { config, result } = orderedFixture();
  assert.throws(
    () => buildOpenEnaOnaDescriptiveSummary({
      result,
      config: { ...config, windowSizeBack: 3 },
    }),
    /configuration|completed/i,
  );
  assert.throws(
    () => buildOpenEnaOnaDescriptiveSummary({
      result,
      config: { ...config, windowSizeBack: Number.NaN },
    }),
    /finite|window/i,
  );

  const nonfinite = structuredClone(result);
  const firstEdge = nonfinite.set.adjacencyKey[0].name;
  nonfinite.set.connectionCounts[0][firstEdge] = Number.POSITIVE_INFINITY;
  assert.throws(
    () => buildOpenEnaOnaDescriptiveSummary({ result: nonfinite, config }),
    /finite|range/i,
  );

  const nonfiniteNormalized = structuredClone(result);
  nonfiniteNormalized.set.lineWeights[0][firstEdge] = Number.NaN;
  assert.throws(
    () => buildOpenEnaOnaDescriptiveSummary({ result: nonfiniteNormalized, config }),
    /line weight|normalized|finite/i,
  );

  const forgedGroupMean = structuredClone(result);
  forgedGroupMean.groups[0].meanWeights[firstEdge] = 0.75;
  assert.throws(
    () => buildOpenEnaOnaDescriptiveSummary({ result: forgedGroupMean, config }),
    /group.*mean|line weight|completed/i,
  );

  const mismatchedDimensions = structuredClone(result);
  mismatchedDimensions.dimensions.reverse();
  assert.throws(
    () => buildOpenEnaOnaDescriptiveSummary({ result: mismatchedDimensions, config }),
    /dimension|variance/i,
  );

  const maskedLeak = structuredClone(result);
  const maskedEdge = maskedLeak.set.adjacencyKey.find((edge) => edge.source === "B" && edge.target === "A");
  assert.ok(maskedEdge);
  const maskedEdgeIndex = maskedLeak.set.adjacencyKey.indexOf(maskedEdge);
  maskedLeak.set.connectionCounts[0][maskedEdge.name] = 1;
  maskedLeak.set.connectionMatrix[0][maskedEdgeIndex] = 1;
  assert.throws(
    () => buildOpenEnaOnaDescriptiveSummary({ result: maskedLeak, config }),
    /masked/i,
  );

  const standard = structuredClone(result);
  standard.set.networkType = undefined;
  standard.set.functionParams.networkType = undefined;
  assert.throws(
    () => buildOpenEnaOnaDescriptiveSummary({ result: standard, config }),
    /ONA|ordered|network/i,
  );
});
