import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { ENASet, Row } from "jena-js";
import { analyzeDataset } from "../lib/open-ena/analyze";
import { buildAnalysisBundle, parseOpenEnaAnalysisBundle } from "../lib/open-ena/export";
import { assertOnaInternalDerivationsV3 } from "../lib/open-ena/model-v3/ona-scientific-closure";
import type { OpenEnaConfig, ParsedDataset } from "../lib/open-ena/types";
import { buildAnalysisBundleV3, parseAnalysisBundleV3 } from "../lib/open-ena/analysis-bundle-v3";
import { compileOnaDraftV3 } from "../lib/open-ena/model-v3/compiler";
import { migrateLegacyOpenEnaConfigToDraftV3 } from "../lib/open-ena/model-v3/migration";
import { buildOnaExecutionPlanV3, runOnaPlanV3 } from "../lib/open-ena/model-v3/ona-adapter";
import { bindOnaResultV3, onaScientificResultHashPayloadV3 } from "../lib/open-ena/model-v3/ona-result-binding";
import { sha256CanonicalJsonV3 } from "../lib/open-ena/model-v3/canonical-json";

// Generated with the frozen pre-fix source, not by the implementation under test.
const historical = JSON.parse(readFileSync(new URL("./fixtures/open-ena/ona-pre-stable-centering.json", import.meta.url), "utf8")) as {
  dataset: ParsedDataset; config: OpenEnaConfig; set: ENASet; bundle: Record<string, unknown>;
};

test("current ONA geometry closes under the same stabilized centering as its fit", () => {
  const result = analyzeDataset(historical.dataset, historical.config);
  assert.doesNotThrow(() => assertOnaInternalDerivationsV3(result.set));
  assert.doesNotThrow(() => parseOpenEnaAnalysisBundle(JSON.stringify(
    buildAnalysisBundle(historical.dataset, historical.config, result, "a".repeat(64)),
  )));
});

for (const scale of [1e-100, 1e-160, 1e-200]) test(`current ONA variance shares survive native and schema-v2 roundtrips at scale ${scale}`, async () => {
  const codes = ["A", "B", "C"];
  const dataset: ParsedDataset = {
    name: "synthetic-ona-tiny.csv", source: "upload", sizeBytes: 2048,
    headers: ["unit", "horizon", "turn", ...codes],
    rows: Array.from({ length: 6 }, (_, i) => ({ unit: `u${i}`, horizon: `h${i}`, turn: i, A: 1, B: (i + 1) * scale, C: 1 })),
  };
  const config: OpenEnaConfig = {
    ...historical.config, analysisKind: "ona", unitColumns: ["unit"], conversationColumns: ["horizon"],
    groupColumn: null, codes, model: "EndPoint", window: "MovingStanzaWindow", windowSizeBack: 1,
    windowSizeForward: 0, weightBy: "sum", rotation: "svd", referenceRotationId: null, centerAlignToOrigin: true,
    orderPolicy: { kind: "columns", columns: ["turn"], comparators: { turn: "number" } },
    directionalMask: { schemaVersion: 1, codeOrder: codes, enabled: [[false, false, false], [true, false, false], [true, false, false]] },
  };
  const hash = "a".repeat(64);
  const compiled = await compileOnaDraftV3(dataset, hash, migrateLegacyOpenEnaConfigToDraftV3(config).ona);
  assert.equal(compiled.status, "ready");
  if (compiled.status !== "ready") throw new Error("Expected ready ONA fixture");
  assert.ok(compiled.diagnostics.some(item => item.id === "ONA_TARGET_RANK_ZERO"), "the existing scientific warning remains visible");
  const plan = await buildOnaExecutionPlanV3(dataset, hash, compiled.canonicalConfiguration);
  const runtime = runOnaPlanV3(plan);
  assert.equal(runtime.set.variance.SVD1, 1);
  const bound = await bindOnaResultV3(plan, runtime, {
    processedRows: plan.rows.length, maximumRetainedRowsAfterChunk: 0,
    bufferedRowsPeakUpperBound: 1, numericCellsUpperBound: plan.operationalAdmission.totalNumericCells,
    peakBytesUpperBound: plan.operationalAdmission.totalPeakBytes,
    observationMethod: "dimension-bounds-and-chunk-boundary-stream-state",
  });
  const nativeBundle = await buildAnalysisBundleV3(bound);
  await assert.doesNotReject(() => parseAnalysisBundleV3(JSON.stringify(nativeBundle), { expectedPlan: plan }));
  const legacyResult = analyzeDataset(dataset, config);
  assert.doesNotThrow(() => parseOpenEnaAnalysisBundle(JSON.stringify(buildAnalysisBundle(dataset, config, legacyResult, hash))));
});

test("pre-fix ONA arithmetic is admitted only by the explicit historical recipe", () => {
  assert.throws(() => assertOnaInternalDerivationsV3(historical.set), /directed node geometry/);
  assert.doesNotThrow(() => assertOnaInternalDerivationsV3(historical.set, { allowHistoricalCentering: true }));
  assert.doesNotThrow(() => parseOpenEnaAnalysisBundle(JSON.stringify(historical.bundle)));
});

test("historical compatibility still derives nodes and variances rather than trusting retained fields", () => {
  for (const field of ["nodes", "variance"] as const) {
    const forged = structuredClone(historical.set);
    if (field === "nodes") forged.rotation.nodes![0].SVD1 = Number(forged.rotation.nodes![0].SVD1) + 0.1;
    else forged.variance.SVD1 = 0.5;
    assert.throws(() => assertOnaInternalDerivationsV3(forged, { allowHistoricalCentering: true }), /scientific derivation/);
  }
  const forged = structuredClone(historical.bundle) as Record<string, any>;
  forged.rotationSet.nodes[0].SVD1 += 0.1;
  forged.tables.nodePositions[0].SVD1 += 0.1;
  assert.throws(() => parseOpenEnaAnalysisBundle(JSON.stringify(forged)), /directed-node/);
  // Each node is individually genuine, but the two recipes disagree beyond
  // tolerance here. A per-field fallback would wrongly accept this mixture.
  const current = analyzeDataset(historical.dataset, historical.config).set;
  const mixed = structuredClone(historical.set);
  mixed.rotation.nodes![0] = current.rotation.nodes![0];
  assert.throws(() => assertOnaInternalDerivationsV3(mixed, { allowHistoricalCentering: true }), /directed node geometry/);
  const mixedBundle = structuredClone(historical.bundle) as Record<string, any>;
  mixedBundle.rotationSet.nodes[0] = current.rotation.nodes![0];
  mixedBundle.tables.nodePositions[0] = current.rotation.nodes![0];
  assert.throws(() => parseOpenEnaAnalysisBundle(JSON.stringify(mixedBundle)), /directed-node/);
});

test("native historical bundle admission does not grant current source-plan authority", async () => {
  const compiled = await compileOnaDraftV3(historical.dataset, "a".repeat(64), migrateLegacyOpenEnaConfigToDraftV3(historical.config).ona);
  assert.equal(compiled.status, "ready");
  if (compiled.status !== "ready") throw new Error("Expected ready ONA fixture");
  const plan = await buildOnaExecutionPlanV3(historical.dataset, "a".repeat(64), compiled.canonicalConfiguration);
  const current = await bindOnaResultV3(plan, runOnaPlanV3(plan), {
    processedRows: plan.rows.length, maximumRetainedRowsAfterChunk: 0,
    bufferedRowsPeakUpperBound: Math.min(plan.rows.length, plan.header.resourceEstimate.estimatedRetainedWindowRows + 1),
    numericCellsUpperBound: plan.operationalAdmission.totalNumericCells,
    peakBytesUpperBound: plan.operationalAdmission.totalPeakBytes,
    observationMethod: "dimension-bounds-and-chunk-boundary-stream-state",
  });
  assert.deepEqual(current.set.connectionMatrix, historical.set.connectionMatrix);
  const old = structuredClone(current);
  const restoreValues = (rows: readonly Row[], source: readonly Row[], targetKeys: readonly string[], sourceKeys = targetKeys) => rows.map((row, index) => ({
    ...row, ...Object.fromEntries(targetKeys.map((key, column) => [key, source[index][sourceKeys[column]]])),
  }));
  const axes = old.set.rotation.rotationColumns.slice(0, 3);
  // Retain native labels/provenance while restoring every pre-fix numerical
  // surface from the independently generated historical source fixture.
  Object.assign(old.set, {
    pointsForProjection: restoreValues(old.set.pointsForProjection, historical.set.pointsForProjection, old.set.codeColumns, historical.set.codeColumns),
    points: restoreValues(old.set.points, historical.set.points, axes),
    centroids: restoreValues(old.set.centroids!, historical.set.centroids!, axes),
    variance: structuredClone(historical.set.variance),
    rotation: {
      ...old.set.rotation,
      rotationMatrix: structuredClone(historical.set.rotation.rotationMatrix),
      centerVector: structuredClone(historical.set.rotation.centerVector),
      eigenvalues: structuredClone(historical.set.rotation.eigenvalues),
      nodes: restoreValues(old.set.rotation.nodes!, historical.set.rotation.nodes!, axes),
    },
  });
  Object.assign(old.binding, { scientificResultSha256: await sha256CanonicalJsonV3(onaScientificResultHashPayloadV3(old)) });
  const bundle = await buildAnalysisBundleV3(old);
  await assert.doesNotReject(() => parseAnalysisBundleV3(JSON.stringify(bundle)));
  await assert.rejects(() => parseAnalysisBundleV3(JSON.stringify(bundle), { expectedPlan: plan }), /directed node geometry/);
});
