import assert from "node:assert/strict";
import test from "node:test";
import { analyzeDataset } from "../lib/open-ena/analyze";
import { parseCsv } from "../lib/open-ena/csv";
import {
  buildLongitudinalGroupCentroidExport,
  buildLongitudinalGroupCentroidView,
  longitudinalPeriodRowsToCsv,
  type OpenEnaLongitudinalSettings,
} from "../lib/open-ena/longitudinal";
import { SAMPLE_CONFIG, type OpenEnaConfig, type OpenEnaResult, type ParsedDataset } from "../lib/open-ena/types";

const SOURCE_HASH = "a".repeat(64);

function longitudinalFixture(model: "SeparateTrajectory" | "AccumulatedTrajectory" = "SeparateTrajectory"): {
  dataset: ParsedDataset;
  config: OpenEnaConfig;
  result: OpenEnaResult;
} {
  const sourceRows = [
      "student,case,period,group,private_text,A,B,C",
      "A,one,T3,G1,private-a3,1,1,0",
      "B,one,T2,G1,private-b2,0,1,1",
      "C,one,T1,G2,private-c1,1,0,1",
      "A,one,T1,G1,private-a1,1,1,0",
      "A,two,T1,G1,private-a1-duplicate-period,0,1,1",
      "B,one,T1,G1,private-b1,1,0,1",
      "C,one,T3,G2,private-c3,0,1,1",
      "B,one,T3,G1,private-b3,1,1,0",
    ];
  const accumulatedRows = [
    sourceRows[0], sourceRows[1], sourceRows[7], sourceRows[8], sourceRows[2],
    sourceRows[4], sourceRows[5], sourceRows[6], sourceRows[3],
  ];
  const dataset = parseCsv(
    (model === "AccumulatedTrajectory" ? accumulatedRows : sourceRows).join("\n") + "\n",
    { name: "longitudinal-private.csv", source: "upload" },
  );
  const config: OpenEnaConfig = {
    ...SAMPLE_CONFIG,
    unitColumns: ["student", "case"],
    conversationColumns: ["period"],
    groupColumn: "group",
    codes: ["A", "B", "C"],
    model,
    window: "Conversation",
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

function settings(cohortPolicy: "available" | "complete" = "available"): OpenEnaLongitudinalSettings {
  return {
    repeatedEntityColumn: "student",
    timeColumn: "period",
    timeOrder: ["T1", "T2", "T3"],
    cohortPolicy,
    axes: ["SVD1", "SVD2"],
    datasetNormalizedUtf8TextSha256: SOURCE_HASH,
  };
}

test("derives explicit-order available-cohort group centroids from compact jENA trajectory points", () => {
  const { dataset, config, result } = longitudinalFixture();
  const view = buildLongitudinalGroupCentroidView(
    result,
    config,
    dataset,
    settings(),
    "2026-08-13T14:00:00.000Z",
  );

  assert.deepEqual(view.timeOrder, ["T1", "T2", "T3"]);
  assert.deepEqual(view.axes, ["SVD1", "SVD2"]);
  assert.equal(view.availableEntityCount, 3);
  assert.equal(view.completeEntityCount, 1);
  assert.equal(view.includedEntityCount, 3);
  assert.deepEqual(view.groups.map((group) => group.name), ["G1", "G2"]);

  const g1 = view.groups[0];
  const g2 = view.groups[1];
  assert.deepEqual(g1.periods.map(({ time, nTotal, nUsed, nExcluded }) => ({ time, nTotal, nUsed, nExcluded })), [
    { time: "T1", nTotal: 2, nUsed: 2, nExcluded: 0 },
    { time: "T2", nTotal: 2, nUsed: 1, nExcluded: 1 },
    { time: "T3", nTotal: 2, nUsed: 2, nExcluded: 0 },
  ]);
  assert.deepEqual(
    g1.periods.map((period) => [
      period.availableEntityCount,
      period.completeEntityCount,
      period.includedEntityCount,
      period.excludedEntityCount,
    ]),
    [[2, 1, 2, 0], [1, 1, 1, 1], [2, 1, 2, 0]],
  );
  assert.deepEqual(g2.periods.map(({ time, nTotal, nUsed, nExcluded, centroid }) => ({
    time,
    nTotal,
    nUsed,
    nExcluded,
    centroid: centroid === null ? null : "present",
  })), [
    { time: "T1", nTotal: 1, nUsed: 1, nExcluded: 0, centroid: "present" },
    { time: "T2", nTotal: 1, nUsed: 0, nExcluded: 1, centroid: null },
    { time: "T3", nTotal: 1, nUsed: 1, nExcluded: 0, centroid: "present" },
  ]);

  const collapsed = view.entityPeriods.find((period) => (
    period.group === "G1" && period.time === "T1" && period.sourcePointCount === 2
  ));
  assert.ok(collapsed);
  assert.match(collapsed.entityId, /^entity-\d{6}$/);
  assert.equal(collapsed.sourcePointCount, 2);
  const compactCoordinates = result.set.points
    .map((point, index) => ({ point, trajectory: result.set.trajectories?.[index] }))
    .filter(({ trajectory }) => trajectory?.student === "A" && trajectory?.period === "T1")
    .map(({ point }) => Number(point.SVD1));
  assert.equal(compactCoordinates.length, 2);
  assert.ok(Math.abs(collapsed.x - compactCoordinates.reduce((sum, value) => sum + value, 0) / 2) < 1e-12);
});

test("complete cohort uses one all-period entity set and reports exclusions per group and period", () => {
  const { dataset, config, result } = longitudinalFixture("AccumulatedTrajectory");
  const view = buildLongitudinalGroupCentroidView(result, config, dataset, {
    ...settings("complete"),
    timeOrder: ["T3", "T2", "T1"],
  });

  assert.equal(view.cohortPolicy, "complete");
  assert.equal(view.availableEntityCount, 3);
  assert.equal(view.completeEntityCount, 1);
  assert.equal(view.includedEntityCount, 1);
  assert.deepEqual(view.entityPeriods.map(({ time }) => time), ["T3", "T2", "T1"]);
  assert.equal(new Set(view.entityPeriods.map(({ entityId }) => entityId)).size, 1);
  assert.match(view.entityPeriods[0].entityId, /^entity-\d{6}$/);
  assert.deepEqual(view.groups[0].periods.map(({ nTotal, nUsed, nExcluded }) => [nTotal, nUsed, nExcluded]), [
    [2, 1, 1],
    [2, 1, 1],
    [2, 1, 1],
  ]);
  assert.deepEqual(view.groups[0].periods.map((period) => [
    period.availableEntityCount,
    period.completeEntityCount,
    period.includedEntityCount,
    period.excludedEntityCount,
  ]), [[2, 1, 1, 1], [1, 1, 1, 1], [2, 1, 1, 1]]);
  assert.deepEqual(view.groups[1].periods.map(({ nTotal, nUsed, nExcluded }) => [nTotal, nUsed, nExcluded]), [
    [1, 0, 1],
    [1, 0, 1],
    [1, 0, 1],
  ]);
});

test("locks accumulated-trajectory period direction to source encounter and jENA step order", () => {
  const { dataset, config, result } = longitudinalFixture("AccumulatedTrajectory");
  const encounterOrder = ["T3", "T2", "T1"];
  const view = buildLongitudinalGroupCentroidView(result, config, dataset, {
    ...settings(),
    timeOrder: encounterOrder,
  });
  assert.deepEqual(view.timeOrder, encounterOrder);
  assert.deepEqual(view.timeOrderPolicy, {
    locked: true,
    basis: "source-encounter-and-jena-step-order",
  });
  assert.throws(
    () => buildLongitudinalGroupCentroidView(result, config, dataset, settings()),
    /accumulated trajectory.*time order.*locked|time order.*cannot be changed.*accumulated/i,
  );

  const separate = longitudinalFixture("SeparateTrajectory");
  const reordered = buildLongitudinalGroupCentroidView(
    separate.result,
    separate.config,
    separate.dataset,
    settings(),
  );
  assert.deepEqual(reordered.timeOrderPolicy, {
    locked: false,
    basis: "researcher-explicit-order",
  });

  const conflictingDataset = parseCsv([
    "student,period,group,A,B,C",
    "u1,T1,g,1,1,0",
    "u1,T2,g,0,1,1",
    "u2,T2,g,1,0,1",
    "u2,T1,g,1,1,0",
  ].join("\n") + "\n", { name: "conflicting-order.csv", source: "upload" });
  const conflictingConfig: OpenEnaConfig = {
    ...config,
    unitColumns: ["student"],
    conversationColumns: ["period"],
    codes: ["A", "B", "C"],
    model: "AccumulatedTrajectory",
  };
  const conflictingResult = analyzeDataset(conflictingDataset, conflictingConfig);
  assert.throws(() => buildLongitudinalGroupCentroidView(
    conflictingResult,
    conflictingConfig,
    conflictingDataset,
    { ...settings(), timeOrder: ["T1", "T2"], datasetNormalizedUtf8TextSha256: null },
  ), /do not share one source encounter order|periods.*across analytic units/i);

  const returningDataset = parseCsv([
    "student,period,task,group,A,B,C",
    "u1,T1,a,g,1,1,0",
    "u1,T2,a,g,0,1,1",
    "u1,T1,b,g,1,0,1",
  ].join("\n") + "\n", { name: "returning-period.csv", source: "upload" });
  const returningConfig: OpenEnaConfig = {
    ...conflictingConfig,
    conversationColumns: ["period", "task"],
  };
  const returningResult = analyzeDataset(returningDataset, returningConfig);
  assert.throws(() => buildLongitudinalGroupCentroidView(
    returningResult,
    returningConfig,
    returningDataset,
    { ...settings(), timeOrder: ["T1", "T2"], datasetNormalizedUtf8TextSha256: null },
  ), /do not share one source encounter order|periods.*across analytic units/i);
});

test("computes adjacent centroid movement while preserving missing-period discontinuities", () => {
  const { dataset, config, result } = longitudinalFixture();
  const view = buildLongitudinalGroupCentroidView(result, config, dataset, settings());
  const g1 = view.groups[0];
  const [t1, t2, t3] = g1.periods;
  assert.ok(t1.centroid && t2.centroid && t3.centroid);
  assert.equal(t1.dx, null);
  assert.equal(t1.stepDistance, null);
  assert.equal(t1.cumulativeDistance, 0);
  assert.ok(Math.abs((t2.dx ?? 0) - (t2.centroid.x - t1.centroid.x)) < 1e-12);
  assert.ok(Math.abs((t2.dy ?? 0) - (t2.centroid.y - t1.centroid.y)) < 1e-12);
  assert.ok(Math.abs((t2.stepDistance ?? 0) - Math.hypot(t2.dx ?? 0, t2.dy ?? 0)) < 1e-12);
  assert.ok(Math.abs(t3.cumulativeDistance - ((t2.stepDistance ?? 0) + (t3.stepDistance ?? 0))) < 1e-12);
  assert.equal(g1.segments.length, 2);
  assert.equal(g1.cumulativeDistance, t3.cumulativeDistance);

  const g2 = view.groups[1];
  assert.equal(g2.periods[1].centroid, null);
  assert.equal(g2.periods[2].dx, null);
  assert.equal(g2.periods[2].stepDistance, null);
  assert.equal(g2.periods[2].cumulativeDistance, 0);
  assert.deepEqual(g2.segments, []);
});

test("available-cohort paths require contributor overlap between adjacent period centroids", () => {
  const fixture = longitudinalFixture();
  const zeroOverlapDataset = parseCsv(
    [
      "student,case,period,group,A,B,C",
      "A,one,T1,G1,1,1,0",
      "B,one,T2,G1,0,1,1",
      "C,one,T3,G1,1,0,1",
    ].join("\n") + "\n",
    { name: "zero-overlap.csv", source: "upload" },
  );
  const result = analyzeDataset(zeroOverlapDataset, fixture.config);
  const view = buildLongitudinalGroupCentroidView(result, fixture.config, zeroOverlapDataset, {
    ...settings(),
    datasetNormalizedUtf8TextSha256: null,
  });
  const group = view.groups[0];
  assert.equal(group.segments.length, 0);
  assert.deepEqual(group.periods.map((period) => ({
    time: period.time,
    contributorOverlapWithPrevious: period.contributorOverlapWithPrevious,
    continuityStatus: period.continuityStatus,
    dx: period.dx,
    stepDistance: period.stepDistance,
  })), [
    { time: "T1", contributorOverlapWithPrevious: null, continuityStatus: "start", dx: null, stepDistance: null },
    { time: "T2", contributorOverlapWithPrevious: 0, continuityStatus: "no-contributor-overlap", dx: null, stepDistance: null },
    { time: "T3", contributorOverlapWithPrevious: 0, continuityStatus: "no-contributor-overlap", dx: null, stepDistance: null },
  ]);
  assert.equal(group.cumulativeDistance, 0);

  const ordinary = longitudinalFixture();
  const ordinaryView = buildLongitudinalGroupCentroidView(
    ordinary.result,
    ordinary.config,
    ordinary.dataset,
    settings(),
  );
  const g1 = ordinaryView.groups[0];
  assert.deepEqual(g1.segments.map((segment) => segment.contributorOverlapCount), [1, 1]);
  assert.deepEqual(g1.periods.map((period) => period.continuityStatus), ["start", "connected", "connected"]);
});

test("retains one full-result coordinate domain and finite node geometry", () => {
  const { dataset, config, result } = longitudinalFixture();
  const view = buildLongitudinalGroupCentroidView(result, config, dataset, settings());
  const x = [
    ...result.set.points.map((row) => Number(row.SVD1)),
    ...(result.set.rotation.nodes ?? []).map((row) => Number(row.SVD1)),
  ];
  const y = [
    ...result.set.points.map((row) => Number(row.SVD2)),
    ...(result.set.rotation.nodes ?? []).map((row) => Number(row.SVD2)),
  ];
  assert.deepEqual(view.coordinateExtent, {
    minX: Math.min(...x),
    maxX: Math.max(...x),
    minY: Math.min(...y),
    maxY: Math.max(...y),
  });
  assert.equal(view.nodes.length, config.codes.length);
  assert.ok(view.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y)));
});

test("fails closed for endpoint results, missing mappings, invalid time orders, and nonfinite geometry", () => {
  const trajectory = longitudinalFixture();
  const endpointConfig = { ...trajectory.config, model: "EndPoint" as const };
  const endpoint = analyzeDataset(trajectory.dataset, endpointConfig);
  assert.throws(
    () => buildLongitudinalGroupCentroidView(endpoint, endpointConfig, trajectory.dataset, settings()),
    /trajectory.*requires|requires.*trajectory|SeparateTrajectory|AccumulatedTrajectory/i,
  );
  assert.throws(
    () => buildLongitudinalGroupCentroidView(trajectory.result, trajectory.config, trajectory.dataset, {
      ...settings(),
      repeatedEntityColumn: "missing",
    }),
    /repeated.entity.*mapping|unit column/i,
  );
  assert.throws(
    () => buildLongitudinalGroupCentroidView(trajectory.result, trajectory.config, trajectory.dataset, {
      ...settings(),
      timeColumn: "missing",
    }),
    /time.*mapping|conversation column/i,
  );
  for (const timeOrder of [["T1"], ["T1", "T1", "T3"], ["T1", "T2"], ["T1", "T2", "T3", "T4"]]) {
    assert.throws(
      () => buildLongitudinalGroupCentroidView(trajectory.result, trajectory.config, trajectory.dataset, {
        ...settings(),
        timeOrder,
      }),
      /time order|period/i,
    );
  }
  const nonfinite = structuredClone(trajectory.result);
  nonfinite.set.points[0].SVD1 = Number.NaN;
  assert.throws(
    () => buildLongitudinalGroupCentroidView(nonfinite, trajectory.config, trajectory.dataset, settings()),
    /finite.*coordinate|coordinate.*finite/i,
  );
});

test("fails closed when one repeated entity changes groups or no complete entity remains", () => {
  const fixture = longitudinalFixture();
  const changingGroupDataset = structuredClone(fixture.dataset);
  const changingRow = changingGroupDataset.rows.find((row) => row.student === "A" && row.case === "two");
  assert.ok(changingRow);
  changingRow.group = "G2";
  assert.throws(
    () => buildLongitudinalGroupCentroidView(fixture.result, fixture.config, changingGroupDataset, settings()),
    /entity.*group|group.*entity/i,
  );
  try {
    buildLongitudinalGroupCentroidView(fixture.result, fixture.config, changingGroupDataset, settings());
    assert.fail("changing group membership must fail closed");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert.doesNotMatch(message, /\b(?:A|G1|G2)\b/);
    assert.match(message, /source row|repeated entity|group/i);
  }

  const noCompleteDataset = parseCsv(
    [
      "student,case,period,group,A,B,C",
      "A,one,T1,G1,1,1,0",
      "A,one,T3,G1,0,1,1",
      "B,one,T1,G1,1,0,1",
      "B,one,T2,G1,1,1,0",
    ].join("\n") + "\n",
    { name: "no-complete.csv", source: "upload" },
  );
  const noCompleteResult = analyzeDataset(noCompleteDataset, fixture.config);
  assert.throws(
    () => buildLongitudinalGroupCentroidView(noCompleteResult, fixture.config, noCompleteDataset, settings("complete")),
    /no eligible complete|complete cohort.*no/i,
  );
});

test("fails closed when source identity, compact trajectory identity, or source binding drifts", () => {
  const fixture = longitudinalFixture();
  const missingSourceStep = structuredClone(fixture.dataset);
  missingSourceStep.rows.pop();
  assert.throws(
    () => buildLongitudinalGroupCentroidView(fixture.result, fixture.config, missingSourceStep, settings()),
    /same unit-conversation identities|no exact source|unstable entity-period mapping/i,
  );
  const unmappedPoint = structuredClone(fixture.result);
  if (unmappedPoint.set.trajectories) unmappedPoint.set.trajectories[0].period = "private-period-value";
  try {
    buildLongitudinalGroupCentroidView(unmappedPoint, fixture.config, fixture.dataset, settings());
    assert.fail("an unmapped compact point must fail closed");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert.doesNotMatch(message, /private-period-value|\b(?:A|G1)\b/);
    assert.match(message, /compact.*point|identity|mapping/i);
  }

  const duplicateCompactStep = structuredClone(fixture.result);
  duplicateCompactStep.set.points.push({ ...duplicateCompactStep.set.points[0] });
  duplicateCompactStep.set.trajectories?.push({ ...duplicateCompactStep.set.trajectories[0] });
  assert.throws(
    () => buildLongitudinalGroupCentroidView(duplicateCompactStep, fixture.config, fixture.dataset, settings()),
    /duplicate unit-conversation point identity|unstable entity-period mapping/i,
  );

  assert.throws(
    () => buildLongitudinalGroupCentroidView(fixture.result, fixture.config, fixture.dataset, {
      ...settings(),
      datasetNormalizedUtf8TextSha256: "b".repeat(64),
    }),
    /analyzed-table hash.*does not match|successful result binding/i,
  );
  assert.throws(
    () => buildLongitudinalGroupCentroidView(fixture.result, fixture.config, fixture.dataset, {
      ...settings(),
      datasetNormalizedUtf8TextSha256: null,
    }),
    /analyzed-table hash.*required|verify.*provenance|successful result binding/i,
  );

  const mismatchedConfigResult: OpenEnaResult = {
    ...fixture.result,
    provenanceBinding: {
      datasetNormalizedUtf8TextSha256: SOURCE_HASH,
      configuration: { ...fixture.config, windowSizeForward: 1 },
    },
  };
  assert.throws(
    () => buildLongitudinalGroupCentroidView(mismatchedConfigResult, fixture.config, fixture.dataset, settings()),
    /provenance binding.*configuration|configuration.*successful result binding/i,
  );

  const unboundResult = { ...fixture.result, provenanceBinding: undefined };
  assert.throws(
    () => buildLongitudinalGroupCentroidView(
      unboundResult,
      { ...fixture.config, weightBy: "sum" },
      fixture.dataset,
      { ...settings(), datasetNormalizedUtf8TextSha256: null },
    ),
    /successful.*result.*configuration|configuration.*successful.*result/i,
  );
});

test("supports an ungrouped trajectory as one All units centroid path", () => {
  const fixture = longitudinalFixture();
  const config = { ...fixture.config, groupColumn: null };
  const result = analyzeDataset(fixture.dataset, config);
  const view = buildLongitudinalGroupCentroidView(result, config, fixture.dataset, {
    ...settings(),
    datasetNormalizedUtf8TextSha256: null,
  });
  assert.deepEqual(view.groups.map((group) => group.name), ["All units"]);
  assert.ok(view.entityPeriods.every((period) => period.group === "All units"));
});

test("exports descriptive geometry, cohort diagnostics, and provenance without raw source rows", () => {
  const { dataset, config, result } = longitudinalFixture();
  const view = buildLongitudinalGroupCentroidView(
    result,
    config,
    dataset,
    settings(),
    "2026-08-13T14:00:00.000Z",
  );
  const exported = buildLongitudinalGroupCentroidExport(view, {
    flipX: true,
    flipY: false,
    showIndividualPaths: true,
    showGroupCentroidPaths: true,
    showPoints: true,
    showLabels: false,
    showVariance: true,
    pointScale: 1.2,
    plotZoom: 1.1,
  });
  assert.equal(exported.kind, "open-ena-longitudinal-group-centroids");
  assert.equal(exported.runtime, "jena-js");
  assert.deepEqual(exported.settings.timeOrder, ["T1", "T2", "T3"]);
  assert.equal(exported.settings.cohortPolicy, "available");
  assert.equal(exported.source.normalizedUtf8TextSha256, SOURCE_HASH);
  assert.deepEqual(exported.configuration, config);
  assert.deepEqual(exported.geometry.rotationMatrix, result.set.rotation.rotationMatrix);
  assert.equal(exported.resultProvenance.modelType, "SeparateTrajectory");
  assert.equal(exported.resultProvenance.analyzedAt, result.analyzedAt);
  assert.equal(exported.summary.includedEntityCount, 3);
  assert.equal(exported.inference, null);
  assert.deepEqual(exported.presentation?.sampling, {
    strategy: "deterministic-stratified-by-group",
    individualPointLimit: 2_000,
    individualPointTotal: view.entityPeriods.length,
    individualPointShown: view.entityPeriods.length,
    individualSegmentLimit: 2_000,
    individualSegmentTotal: 2,
    individualSegmentShown: 2,
    groupCentroidPathsComplete: true,
  });
  assert.deepEqual(exported.privacy, {
    rawSourceRowsIncluded: false,
    repeatedEntityIdentifiersIncluded: false,
    entityPeriodCoordinatesIncluded: false,
    note: "The derived export contains group-period summaries and fitted geometry, not repeated-entity identifiers or entity-period coordinates.",
  });
  assert.match(exported.boundaries.join(" "), /descriptive/i);
  assert.match(exported.boundaries.join(" "), /no endpoint.*test|endpoint.*not applied/i);
  assert.doesNotMatch(JSON.stringify(exported), /private-a3|private_text|rawRows|rowConnectionCounts|pointsForProjection/);

  const csv = longitudinalPeriodRowsToCsv(view);
  assert.match(csv.split("\r\n")[0], /group,time,timeIndex,nTotal,nUsed,nExcluded,availableEntityCount,completeEntityCount,includedEntityCount,excludedEntityCount/);
  assert.match(csv, /G1,T1/);
  assert.match(csv, /sourceDatasetHashKind/);
  assert.match(csv, /normalized-utf8-csv-text-sha256/);
  assert.match(csv, /sourceDatasetNormalizedUtf8TextSha256/);
  assert.match(csv, /timeOrderJson/);
  assert.match(csv, /\[""T1"",""T2"",""T3""\]/);
  assert.match(csv, /runtimeVersion/);
  assert.match(csv, /timeOrderLocked,timeOrderBasis/);
  assert.match(csv, /contributorOverlapWithPrevious,continuityStatus/);
  assert.match(csv, /SeparateTrajectory/);
  assert.doesNotMatch(csv, /private-a3|private_text|entityId/);
});
