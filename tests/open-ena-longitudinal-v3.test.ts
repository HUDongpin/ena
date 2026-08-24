import assert from "node:assert/strict";
import test from "node:test";

import {
  compileTrajectoryPlotlySpec,
  executeLongitudinalAnalysisV2,
  verifyLongitudinalAnalysisBundleV2,
} from "j-3dena";

import { analyzeDataset, bindOpenEnaResultProvenance } from "../lib/open-ena/analyze";
import {
  buildOpenEnaLongitudinalExecutionRequestV3,
  confirmOpenEnaLongitudinalIdentityV3,
  createExpectedOpenEnaLongitudinalPeriodV3,
  createOpenEnaLongitudinalSettingsV3,
  isOpenEnaLongitudinalBundleStaleV3,
  migrateOpenEnaLongitudinalSettingsV3,
  openEnaTrajectoryDisplaySpecV3,
  profileOpenEnaLongitudinalMappingV3,
} from "../lib/open-ena/longitudinal-v3";
import type { OpenEnaConfig, ParsedDataset } from "../lib/open-ena/types";
import { assertOpenEnaLongitudinalRemotePrivacyV3 } from "../lib/server/open-ena-longitudinal-route";

const HASH = "6".repeat(64);

const dataset: ParsedDataset = {
  name: "trajectory-v3.csv",
  headers: ["Group", "Speaker", "Period", "weight", "stratum", "A", "B", "C", "D"],
  rows: [
    { Group: "A", Speaker: "a1", Period: 1, weight: 2, stratum: "s1", A: 1, B: 1, C: 0, D: 0 },
    { Group: "A", Speaker: "a1", Period: 2, weight: 2, stratum: "s1", A: 0, B: 1, C: 1, D: 0 },
    { Group: "A", Speaker: "a1", Period: 3, weight: 2, stratum: "s1", A: 0, B: 0, C: 1, D: 1 },
    { Group: "A", Speaker: "a2", Period: 1, weight: 3, stratum: "s2", A: 1, B: 0, C: 0, D: 1 },
    { Group: "A", Speaker: "a2", Period: 2, weight: 3, stratum: "s2", A: 0, B: 0, C: 1, D: 1 },
    { Group: "A", Speaker: "a2", Period: 3, weight: 3, stratum: "s2", A: 1, B: 0, C: 1, D: 0 },
    { Group: "B", Speaker: "b1", Period: 1, weight: 4, stratum: "s1", A: 1, B: 1, C: 1, D: 0 },
    { Group: "B", Speaker: "b1", Period: 2, weight: 4, stratum: "s1", A: 0, B: 1, C: 1, D: 1 },
    { Group: "B", Speaker: "b1", Period: 3, weight: 4, stratum: "s1", A: 1, B: 0, C: 0, D: 1 },
    { Group: "B", Speaker: "b2", Period: 1, weight: 5, stratum: "s2", A: 1, B: 0, C: 1, D: 1 },
    { Group: "B", Speaker: "b2", Period: 2, weight: 5, stratum: "s2", A: 1, B: 1, C: 0, D: 1 },
    { Group: "B", Speaker: "b2", Period: 3, weight: 5, stratum: "s2", A: 0, B: 1, C: 0, D: 1 },
  ],
  sizeBytes: 999,
  source: "upload",
  hashKind: "normalized-utf8-csv-text-sha256",
};

const config: OpenEnaConfig = {
  analysisKind: "ena",
  unitColumns: ["Group", "Speaker"],
  conversationColumns: ["Group", "Speaker", "Period"],
  groupColumn: "Group",
  codes: ["A", "B", "C", "D"],
  model: "SeparateTrajectory",
  window: "Conversation",
  windowSizeBack: 5,
  windowSizeForward: 0,
  weightBy: "binary",
  rotation: "svd",
  referenceRotationId: null,
  centerAlignToOrigin: true,
};

function fitted() {
  return bindOpenEnaResultProvenance(analyzeDataset(dataset, config), dataset, HASH, config);
}

test("V3 defaults mirror the fitted mapping, choose three real dimensions, and keep paired inference unconfirmed", async () => {
  const result = fitted();
  const settings = await createOpenEnaLongitudinalSettingsV3({ result, config, dataset, datasetHash: HASH });
  assert.equal(settings.schemaVersion, 3);
  assert.deepEqual(settings.participantColumns, ["Speaker"]);
  assert.deepEqual(settings.selectedDimensions, result.set.rotation.rotationColumns.slice(0, 3));
  assert.equal(settings.identityConfirmed, false);
  assert.equal(settings.identityBindingHash, null);
  assert.equal(settings.bootstrap.repetitions, 500);
  assert.equal(settings.bootstrap.confidenceLevel, 0.95);
  assert.equal(settings.bootstrap.seed, 2026);
  assert.deepEqual(settings.orderedPeriods.map((period) => period.displayLabel), ["1", "2", "3"]);
  assert.ok(settings.inference.pairedPeriods);
  assert.equal(settings.inference.pairedPeriods?.samePhysicalEntityConfirmed, false);
});

test("mapping profile reports duplicate participant-period rows without performing scientific arithmetic", async () => {
  const settings = await createOpenEnaLongitudinalSettingsV3({ result: fitted(), config, dataset, datasetHash: HASH });
  const duplicated: ParsedDataset = { ...dataset, rows: [...dataset.rows, { ...dataset.rows[0]! }] };
  const profile = profileOpenEnaLongitudinalMappingV3(duplicated, config, settings);
  assert.equal(profile.sourceRows, 13);
  assert.equal(profile.participants, 4);
  assert.equal(profile.participantPeriods, 12);
  assert.equal(profile.duplicateRows, 1);
  assert.ok(profile.positiveStableNumericMetadata.includes("weight"));
  assert.ok(profile.stableParticipantMetadata.includes("stratum"));
  assert.equal(Object.hasOwn(profile, "centroid"), false);
});

test("expected empty periods preserve the observed numeric elapsed-time contract", async () => {
  const settings = await createOpenEnaLongitudinalSettingsV3({ result: fitted(), config, dataset, datasetHash: HASH });
  const expected = createExpectedOpenEnaLongitudinalPeriodV3("4", "Period", 3, settings.orderedPeriods[0]);
  assert.deepEqual(expected.identity.components[0], { name: "Period", type: "number", value: 4 });
  assert.deepEqual(expected.value, { type: "numeric-v1", value: 4, unit: "source-time-unit" });
  assert.equal(expected.expected, true);
  assert.match(expected.sourceTimeCanonical, /^expected:/);
});

test("the Open ENA adapter binds, pseudonymizes, and executes one immutable jENA V2 request", async () => {
  const result = fitted();
  const initial = await createOpenEnaLongitudinalSettingsV3({ result, config, dataset, datasetHash: HASH });
  const settings = await confirmOpenEnaLongitudinalIdentityV3(initial, {
    result,
    config,
    datasetHash: HASH,
  });
  const before = structuredClone(result.set);
  const prepared = await buildOpenEnaLongitudinalExecutionRequestV3({
    result,
    config,
    dataset,
    datasetHash: HASH,
    settings,
    runId: "open-ena-v3-test-run",
    executionTarget: "node-service",
  });

  assert.equal(prepared.request.dataset.receipt.sha256, HASH);
  const remoteRequest = structuredClone(prepared.request);
  remoteRequest.execution.target = "persistent-compute-service";
  assert.doesNotThrow(() => assertOpenEnaLongitudinalRemotePrivacyV3(remoteRequest));
  assert.equal(prepared.request.pathTask.specHash, prepared.request.dataset.specHash);
  assert.equal(
    prepared.request.pathTask.runSpec.sourceResultHash,
    prepared.request.dataset.sourceResult?.hash,
  );
  assert.ok((prepared.request.dataset.sourceResult?.result as { dimensions: string[] }).dimensions.length > 3);
  const privateIdentifiers = new Set(["a1", "a2", "b1", "b2"]);
  const transportedPoints = (prepared.request.dataset.sourceResult?.result as {
    points: Array<{ unit: { values: unknown[] }; participantLabel: { values: unknown[] } }>;
  }).points;
  assert.equal(transportedPoints.some((point) => (
    [...point.unit.values, ...point.participantLabel.values].some((value) => privateIdentifiers.has(String(value)))
  )), false);
  assert.deepEqual(result.set, before);

  const bundle = await executeLongitudinalAnalysisV2(prepared.request);
  await verifyLongitudinalAnalysisBundleV2(bundle);
  assert.equal(bundle.paths.length, 2);
  assert.equal(bundle.inference.some((item) => item.request.kind === "independent-period"), true);
  assert.equal(bundle.inference.some((item) => item.request.kind === "paired-periods"), true);
  assert.equal(bundle.inference.some((item) => item.request.kind === "repeated-periods"), true);
  assert.equal(bundle.pathComparisons.length, 1);
  assert.equal(bundle.bootstrap.length, 2);
  assert.equal(bundle.execution.target, "node-service");
});

test("2D and 3D compile from the same bundle and never change the result hash", async () => {
  const result = fitted();
  const initial = await createOpenEnaLongitudinalSettingsV3({ result, config, dataset, datasetHash: HASH });
  const prepared = await buildOpenEnaLongitudinalExecutionRequestV3({
    result,
    config,
    dataset,
    datasetHash: HASH,
    settings: initial,
    runId: "display-only-run",
    executionTarget: "node-service",
  });
  const bundle = await executeLongitudinalAnalysisV2(prepared.request);
  const threeDisplay = openEnaTrajectoryDisplaySpecV3(bundle, { projection: "3d" });
  const twoDisplay = openEnaTrajectoryDisplaySpecV3(bundle, { projection: "xy" });
  const three = compileTrajectoryPlotlySpec(bundle, threeDisplay);
  const two = compileTrajectoryPlotlySpec(bundle, twoDisplay);
  assert.equal(three.resultHash, bundle.identity.resultHash);
  assert.equal(two.resultHash, bundle.identity.resultHash);
  assert.equal(threeDisplay.style.centroidSize, 7);
  assert.equal(twoDisplay.style.centroidSize, 7);
  for (const plot of [three, two]) {
    const paths = plot.data.filter((trace) => trace.meta.role === "trajectory-path");
    const individualPaths = plot.data.filter((trace) => trace.meta.role === "individual-path");
    const centroids = plot.data.filter((trace) => trace.meta.role === "centroid");
    assert.ok(paths.length > 0);
    assert.ok(individualPaths.length > 0);
    assert.ok(centroids.length > 0);
    assert.ok([...paths, ...individualPaths].every((trace) => (
      (trace.line as { color?: string } | undefined)?.color === "#000000"
    )));
    assert.ok(paths.every((trace) => {
      const marker = trace.marker as { color?: string; symbol?: string } | undefined;
      return marker?.symbol === "square" && marker.color !== "#000000";
    }));
    assert.ok(centroids.every((trace) => {
      const marker = trace.marker as { color?: string; size?: number; symbol?: string } | undefined;
      return marker?.size === 7 && marker.symbol === "square" && marker.color !== "#000000";
    }));
  }
  const threeArrows = three.data.filter((trace) => trace.meta.role === "direction-arrow");
  const twoArrows = two.data.filter((trace) => trace.meta.role === "direction-arrow");
  assert.ok(threeArrows.length > 0);
  assert.ok(twoArrows.length > 0);
  assert.ok(threeArrows.every((trace) => JSON.stringify(trace.colorscale) === JSON.stringify([[0, "#000000"], [1, "#000000"]])));
  assert.ok(twoArrows.every((trace) => (
    (trace.line as { color?: string } | undefined)?.color === "#000000"
    && (trace.marker as { color?: string } | undefined)?.color === "#000000"
  )));
  const threeUncertainty = three.data.filter((trace) => trace.meta.role === "uncertainty");
  const twoUncertainty = two.data.filter((trace) => trace.meta.role === "uncertainty");
  assert.ok(threeUncertainty.length > 0);
  assert.ok(twoUncertainty.length > 0);
  assert.ok(threeUncertainty.every((trace) => (
    trace.mode === "lines"
    && trace.connectgaps === false
    && (trace.line as { dash?: string } | undefined)?.dash === "dash"
    && trace.error_x === undefined
    && trace.error_y === undefined
    && trace.error_z === undefined
  )));
  assert.ok(twoUncertainty.every((trace) => trace.error_x !== undefined && trace.error_y !== undefined));
  const expectedMidpoints = three.data
    .filter((trace) => trace.meta.role === "trajectory-path")
    .flatMap((trace) => {
      const x = trace.x as Array<number | null>;
      const y = trace.y as Array<number | null>;
      const z = trace.z as Array<number | null>;
      return x.slice(1).flatMap((currentX, index) => {
        const previousX = x[index];
        const previousY = y[index];
        const currentY = y[index + 1];
        const previousZ = z[index];
        const currentZ = z[index + 1];
        return previousX === null || currentX === null || previousY === null || currentY === null || previousZ === null || currentZ === null
          ? []
          : [[
            previousX + (currentX - previousX) * 0.5,
            previousY + (currentY - previousY) * 0.5,
            previousZ + (currentZ - previousZ) * 0.5,
          ]];
      });
    });
  assert.deepEqual(threeArrows.map((trace) => [
    (trace.x as number[])[0],
    (trace.y as number[])[0],
    (trace.z as number[])[0],
  ]), expectedMidpoints);
  assert.deepEqual(twoArrows.map((trace) => [
    (trace.x as number[]).at(-1),
    (trace.y as number[]).at(-1),
  ]), expectedMidpoints.map(([x, y]) => [x, y]));
  assert.notDeepEqual(three.layout, two.layout);
  assert.equal(isOpenEnaLongitudinalBundleStaleV3(bundle, prepared.binding), false);
  assert.equal(isOpenEnaLongitudinalBundleStaleV3(bundle, { ...prepared.binding, specHash: "f".repeat(64) }), true);
});

test("V1/V2 settings migrate read-only to V3, add a real third dimension, and clear identity confirmation", async () => {
  const result = fitted();
  const migrated = await migrateOpenEnaLongitudinalSettingsV3({
    repeatedEntityColumns: ["Speaker"],
    identityConfirmed: true,
    timeColumn: "Period",
    timeOrder: ["1", "2", "3"],
    cohortPolicy: "complete",
    axes: ["SVD1", "SVD2"],
    datasetNormalizedUtf8TextSha256: HASH,
  }, { result, config, dataset, datasetHash: HASH });
  assert.equal(migrated.schemaVersion, 3);
  assert.deepEqual(migrated.selectedDimensions, result.set.rotation.rotationColumns.slice(0, 3));
  assert.equal(migrated.identityConfirmed, false);
  assert.equal(migrated.identityBindingHash, null);
  assert.equal(migrated.cohortPolicy, "complete");
});
