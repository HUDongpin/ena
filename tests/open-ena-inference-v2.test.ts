import assert from "node:assert/strict";
import test from "node:test";
import { analyzeDataset } from "../lib/open-ena/analyze";
import { parseCsv } from "../lib/open-ena/csv";
import {
  OpenEnaInferenceIntegrityError,
  runOpenEnaInferenceV2,
  type OpenEnaInferenceCoordinatorInputV2,
} from "../lib/open-ena/inference-v2";
import type {
  OpenEnaLongitudinalComparisonFrame,
  OpenEnaLongitudinalComparisonGroup,
} from "../lib/open-ena/longitudinal";
import { normalizeRankValue } from "../lib/open-ena/rank-inference";
import {
  SAMPLE_CONFIG,
  type OpenEnaConfig,
  type OpenEnaResult,
} from "../lib/open-ena/types";

const HASH = "a".repeat(64);
const OTHER_HASH = "b".repeat(64);
const ANALYZED_AT = "2026-08-21T10:00:00.000Z";

function withBinding(result: OpenEnaResult, configuration: OpenEnaConfig): OpenEnaResult {
  return {
    ...result,
    analyzedAt: ANALYZED_AT,
    provenanceBinding: {
      datasetNormalizedUtf8TextSha256: HASH,
      datasetHashKind: "normalized-utf8-csv-text-sha256",
      configuration: structuredClone(configuration),
    },
  };
}

function endpointFixture(): OpenEnaInferenceCoordinatorInputV2 {
  const dataset = parseCsv([
    "unit,conversation,group,A,B,C",
    "p1,c1,Primary,1,1,0",
    "p2,c2,Primary,1,0,1",
    "s1,c3,Secondary,0,1,1",
    "s2,c4,Secondary,1,1,1",
  ].join("\n") + "\n", { name: "endpoint.csv", source: "upload" });
  const configuration: OpenEnaConfig = {
    ...SAMPLE_CONFIG,
    unitColumns: ["unit"],
    conversationColumns: ["conversation"],
    groupColumn: "group",
    codes: ["A", "B", "C"],
    model: "EndPoint",
    window: "Conversation",
  };
  const result = withBinding(analyzeDataset(dataset, configuration), configuration);
  const axes = result.dimensions.slice(0, 2) as [string, string];
  return {
    request: {
      kind: "endpoint-independent",
      primaryGroup: "Primary",
      secondaryGroup: "Secondary",
      axes,
    },
    result,
    currentBinding: {
      datasetNormalizedUtf8TextSha256: HASH,
      datasetHashKind: "normalized-utf8-csv-text-sha256",
      configuration,
    },
  };
}

function trajectoryFixture(): OpenEnaInferenceCoordinatorInputV2 {
  const dataset = parseCsv([
    "Group,Name,Period,A,B,C",
    "Control,c1,T1,1,1,0",
    "Control,c1,T2,1,0,1",
    "Control,c1,T3,0,1,1",
    "Control,c2,T1,1,0,1",
    "Control,c2,T2,0,1,1",
    "Control,c2,T3,1,1,0",
    "Control,c3,T1,1,1,0",
    "Control,c3,T2,0,1,1",
    "Control,c4,T1,1,0,1",
    "Control,c4,T3,0,1,1",
    "Experimental,e1,T1,1,1,0",
    "Experimental,e1,T2,1,0,1",
    "Experimental,e1,T3,0,1,1",
    "Experimental,e2,T1,0,1,1",
  ].join("\n") + "\n", { name: "trajectory.csv", source: "upload" });
  const configuration: OpenEnaConfig = {
    ...SAMPLE_CONFIG,
    unitColumns: ["Group", "Name"],
    conversationColumns: ["Period"],
    groupColumn: "Group",
    codes: ["A", "B", "C"],
    model: "SeparateTrajectory",
    window: "Conversation",
  };
  const result = withBinding(analyzeDataset(dataset, configuration), configuration);
  const axes = result.dimensions.slice(0, 2) as [string, string];
  const control: OpenEnaLongitudinalComparisonGroup = {
    role: "configured-group",
    index: 0,
    name: "Control",
  };
  const experimental: OpenEnaLongitudinalComparisonGroup = {
    role: "configured-group",
    index: 1,
    name: "Experimental",
  };
  const values = [
    ["opaque-secret-c1", control, "T1", 0, 1.000000000004, 1],
    ["opaque-secret-c1", control, "T2", 1, 1.000000000005, 2],
    ["opaque-secret-c1", control, "T3", 2, 4, 4],
    ["opaque-secret-c2", control, "T1", 0, 2, 2],
    ["opaque-secret-c2", control, "T2", 1, 4, 1],
    ["opaque-secret-c2", control, "T3", 2, 7, 5],
    ["opaque-secret-c3", control, "T1", 0, 3, 3],
    ["opaque-secret-c3", control, "T2", 1, 2, 6],
    ["opaque-secret-c4", control, "T1", 0, 8, 8],
    ["opaque-secret-c4", control, "T3", 2, 9, 9],
    ["opaque-secret-e1", experimental, "T1", 0, 5, 5],
    ["opaque-secret-e1", experimental, "T2", 1, 6, 6],
    ["opaque-secret-e1", experimental, "T3", 2, 7, 7],
    ["opaque-secret-e2", experimental, "T1", 0, 6, 7],
  ] as const;
  const frame: OpenEnaLongitudinalComparisonFrame = {
    kind: "open-ena-longitudinal-comparison-frame",
    coordinateSystem: "unflipped-model-coordinates",
    binding: {
      analyzedAt: ANALYZED_AT,
      datasetNormalizedUtf8TextSha256: HASH,
      datasetHashKind: "normalized-utf8-csv-text-sha256",
      modelType: "SeparateTrajectory",
      configuration: structuredClone(configuration),
      axes,
    },
    repeatedEntityColumns: ["Group", "Name"],
    identityConfirmed: true,
    eligibility: { eligible: true, reason: null },
    timeColumn: "Period",
    timeOrder: ["T1", "T2", "T3"],
    axes,
    groups: [control, experimental],
    points: values.map(([entityToken, group, time, timeIndex, x, y]) => ({
      entityToken,
      group: { ...group },
      time,
      timeIndex,
      x,
      y,
      sourcePointCount: 1,
    })),
  };
  return {
    request: {
      kind: "trajectory-independent-period",
      repeatedEntityColumns: ["Group", "Name"],
      timeColumn: "Period",
      period: "T1",
      primaryGroup: "Control",
      secondaryGroup: "Experimental",
      axes,
    },
    result,
    comparisonFrame: frame,
    currentBinding: {
      datasetNormalizedUtf8TextSha256: HASH,
      datasetHashKind: "normalized-utf8-csv-text-sha256",
      configuration,
    },
  };
}

function caughtIntegrity(
  run: () => Promise<unknown>,
  expectedCode?: OpenEnaInferenceIntegrityError["code"],
) {
  return assert.rejects(run, (error: unknown) => {
    assert.ok(error instanceof OpenEnaInferenceIntegrityError);
    if (expectedCode) assert.equal(error.code, expectedCode);
    assert.doesNotMatch(
      error.message,
      /Primary|Secondary|Control|Experimental|opaque-secret|T1|T2|T3|NaN|Infinity/i,
    );
    return true;
  });
}

function assertDeeplyFrozen(value: unknown, seen = new Set<unknown>()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const nested of Object.values(value as Record<string, unknown>)) {
    assertDeeplyFrozen(nested, seen);
  }
}

function allRows(result: Awaited<ReturnType<typeof runOpenEnaInferenceV2>>) {
  return result.kind === "trajectory-repeated-periods"
    ? [...result.omnibusRows, ...result.followupRows]
    : result.rows;
}

test("coordinates endpoint Mann-Whitney axes into one frozen Holm family", async () => {
  const input = endpointFixture();
  const output = await runOpenEnaInferenceV2(input);

  assert.equal(output.schemaVersion, 2);
  assert.equal(output.kind, "endpoint-independent");
  assert.equal(output.status, "available");
  assert.equal(output.reason, null);
  assert.equal(output.coordinateSystem, "unflipped-model-coordinates");
  assert.equal(output.provenance, "ENA.HK post-projection inference");
  assert.equal(output.scope.analysisUnit, "endpoint-analytic-unit");
  assert.equal(output.scope.temporalScope, "endpoint-common-period-not-verified");
  assert.equal(output.binding.analyzedAt, ANALYZED_AT);
  assert.equal(output.binding.dataset.normalizedUtf8TextSha256, HASH);
  assert.equal(output.binding.dataset.hashKind, "normalized-utf8-csv-text-sha256");
  assert.equal(output.rows.length, 2);
  assert.equal(output.families.length, 1);
  assert.equal(output.families[0].familySizePlanned, 2);
  assert.ok(output.rows.every((row) => row.test === "mann-whitney-u"));
  assert.ok(output.rows.every((row) => row.pRaw !== null && row.pHolm !== null));
  assert.ok(output.rows.every((row) => row.familyId === output.families[0].familyId));
  assert.ok(output.rows.every((row) => row.warnings.includes("independent-entity-assumption")));
  assert.ok(output.rows.every((row) => row.warnings.includes("cluster-independence-unverified")));
  assert.ok(output.rows.every((row) => row.warnings.includes("arbitrary-axis-sign")));
  assert.deepEqual(output.ledger, {
    candidateEntityCount: 4,
    primaryAvailableCount: 2,
    secondaryAvailableCount: 2,
    includedEntityCount: 4,
    includedAnalyticPointCount: 4,
  });
  assertDeeplyFrozen(output);
});

test("reversing coordinator Mann-Whitney groups swaps direction but preserves two-sided raw and Holm p", async () => {
  const forwardInput = endpointFixture();
  const forward = await runOpenEnaInferenceV2(forwardInput);
  assert.equal(forward.kind, "endpoint-independent");

  const reversedInput = endpointFixture();
  assert.equal(reversedInput.request.kind, "endpoint-independent");
  [reversedInput.request.primaryGroup, reversedInput.request.secondaryGroup] = [
    reversedInput.request.secondaryGroup,
    reversedInput.request.primaryGroup,
  ];
  const reversed = await runOpenEnaInferenceV2(reversedInput);
  assert.equal(reversed.kind, "endpoint-independent");
  for (let index = 0; index < forward.rows.length; index += 1) {
    assert.equal(reversed.rows[index].nPrimary, forward.rows[index].nSecondary);
    assert.equal(reversed.rows[index].nSecondary, forward.rows[index].nPrimary);
    assert.equal(reversed.rows[index].medianPrimary, forward.rows[index].medianSecondary);
    assert.equal(reversed.rows[index].medianSecondary, forward.rows[index].medianPrimary);
    assert.equal(reversed.rows[index].uPrimary, forward.rows[index].uSecondary);
    assert.equal(reversed.rows[index].uSecondary, forward.rows[index].uPrimary);
    const forwardEffect: number | null = forward.rows[index].rankBiserialPrimaryVsSecondary;
    assert.ok(forwardEffect !== null);
    assert.equal(
      reversed.rows[index].rankBiserialPrimaryVsSecondary,
      forwardEffect === 0 ? 0 : -forwardEffect,
    );
    assert.equal(reversed.rows[index].pRaw, forward.rows[index].pRaw);
    assert.equal(reversed.rows[index].pHolm, forward.rows[index].pHolm);
  }
});

test("endpoint family IDs are invariant to successful-result group presentation order", async () => {
  const baselineInput = endpointFixture();
  const baseline = await runOpenEnaInferenceV2(baselineInput);
  assert.equal(baseline.kind, "endpoint-independent");

  const reorderedInput = endpointFixture();
  reorderedInput.result.groups.reverse();
  const reordered = await runOpenEnaInferenceV2(reorderedInput);
  assert.equal(reordered.kind, "endpoint-independent");
  assert.deepEqual(reordered.families, baseline.families);
  assert.deepEqual(
    reordered.rows.map((row) => ({ familyId: row.familyId, memberId: row.memberId })),
    baseline.rows.map((row) => ({ familyId: row.familyId, memberId: row.memberId })),
  );
  assert.deepEqual(reordered.rows, baseline.rows);
});

test("coordinator snapshots request, frame, result provenance, and current binding before its first await", async () => {
  const endpoint = endpointFixture();
  const endpointBaseline = await runOpenEnaInferenceV2(structuredClone(endpoint));
  const endpointPending = runOpenEnaInferenceV2(endpoint);
  assert.equal(endpoint.request.kind, "endpoint-independent");
  endpoint.request.primaryGroup = "changed-after-start";
  endpoint.result.groups.reverse();
  endpoint.result.set.points[0][endpoint.request.axes[0]] = 1e200;
  assert.ok(endpoint.result.provenanceBinding);
  endpoint.result.provenanceBinding.datasetNormalizedUtf8TextSha256 = OTHER_HASH;
  endpoint.currentBinding.configuration.codes = ["changed-after-start"];
  const endpointOutput = await endpointPending;
  assert.deepEqual(endpointOutput, endpointBaseline);

  const trajectory = trajectoryFixture();
  trajectory.request = {
    kind: "trajectory-paired-periods",
    repeatedEntityColumns: ["Group", "Name"],
    timeColumn: "Period",
    group: "Control",
    earlierPeriod: "T1",
    laterPeriod: "T2",
    axes: trajectory.request.axes,
    cohortPolicy: "pairwise-complete",
  };
  const trajectoryBaseline = await runOpenEnaInferenceV2(structuredClone(trajectory));
  const trajectoryPending = runOpenEnaInferenceV2(trajectory);
  assert.equal(trajectory.request.kind, "trajectory-paired-periods");
  trajectory.request.earlierPeriod = "T3";
  assert.ok(trajectory.comparisonFrame);
  trajectory.comparisonFrame.points[0].x = 1e200;
  trajectory.comparisonFrame.points[0].sourcePointCount = 99;
  assert.ok(trajectory.result.provenanceBinding);
  trajectory.result.provenanceBinding.configuration.codes = ["changed-after-start"];
  trajectory.currentBinding.datasetNormalizedUtf8TextSha256 = OTHER_HASH;
  const trajectoryOutput = await trajectoryPending;
  assert.deepEqual(trajectoryOutput, trajectoryBaseline);
});

test("trajectory independent inference uses only the explicitly selected period", async () => {
  const input = trajectoryFixture();
  const first = await runOpenEnaInferenceV2(input);
  assert.equal(first.kind, "trajectory-independent-period");
  assert.equal(first.rows.length, 2);
  assert.deepEqual(first.ledger, {
    candidateEntityCount: 6,
    primaryAvailableCount: 4,
    secondaryAvailableCount: 2,
    includedEntityCount: 6,
    includedCompactPointCount: 6,
    includedSourcePointCount: 6,
  });

  const mutated = structuredClone(input);
  assert.ok(mutated.comparisonFrame);
  for (const point of mutated.comparisonFrame.points) {
    if (point.time !== "T1") {
      point.x = point.time === "T2" ? 1e100 : -1e100;
      point.y = point.time === "T2" ? -1e90 : 1e90;
    }
  }
  const second = await runOpenEnaInferenceV2(mutated);
  assert.equal(second.kind, "trajectory-independent-period");
  assert.deepEqual(second.rows, first.rows);
  assert.deepEqual(second.families, first.families);
});

test("paired inference uses raw later-minus-earlier once and reverses signed statistics only", async () => {
  const input = trajectoryFixture();
  input.request = {
    kind: "trajectory-paired-periods",
    repeatedEntityColumns: ["Group", "Name"],
    timeColumn: "Period",
    group: "Control",
    earlierPeriod: "T1",
    laterPeriod: "T2",
    axes: input.request.axes,
    cohortPolicy: "pairwise-complete",
  };
  assert.ok(input.comparisonFrame);
  const control = input.comparisonFrame.groups.find((group) => group.name === "Control");
  assert.ok(control);
  input.comparisonFrame.points.push({
    entityToken: "opaque-secret-c5",
    group: { ...control },
    time: "T3",
    timeIndex: 2,
    x: 10,
    y: 10,
    sourcePointCount: 1,
  });
  const collapsed = input.comparisonFrame.points.find((point) => (
    point.entityToken === "opaque-secret-c1" && point.time === "T1"
  ));
  assert.ok(collapsed);
  collapsed.sourcePointCount = 2;
  const forward = await runOpenEnaInferenceV2(input);
  assert.equal(forward.kind, "trajectory-paired-periods");
  assert.equal(forward.status, "available");
  assert.equal(forward.rows.length, 2);
  assert.ok(forward.ledger);
  assert.equal(forward.ledger.candidateEntityCount, 5);
  assert.equal(forward.ledger.matchedEntityCount, 3);
  assert.equal(forward.ledger.earlierOnlyCount, 1);
  assert.equal(forward.ledger.laterOnlyCount, 0);
  assert.equal(forward.ledger.missingPairCount, 2);
  assert.equal(forward.ledger.earlierAvailableSourcePointCount, 5);
  assert.equal(forward.ledger.laterAvailableSourcePointCount, 3);
  assert.equal(forward.ledger.matchedCompactPointCount, 6);
  assert.equal(forward.ledger.matchedSourcePointCount, 7);
  assert.equal(forward.rows[0].nMatched, 3);
  assert.equal(forward.rows[0].nMissing, 2);
  assert.equal(
    forward.rows[0].medianDifference,
    normalizeRankValue(1.000000000005 - 1.000000000004),
    "coordinates are subtracted before the shared difference normalizer",
  );
  assert.ok(forward.rows.every((row) => row.warnings.includes("signed-rank-symmetry-assumption")));
  assert.ok(forward.rows.every((row) => row.warnings.includes("missing-pairs")));
  assert.ok(forward.rows[1].warnings.includes("ties-present"));

  const reversedInput = structuredClone(input);
  assert.equal(reversedInput.request.kind, "trajectory-paired-periods");
  [reversedInput.request.earlierPeriod, reversedInput.request.laterPeriod] = [
    reversedInput.request.laterPeriod,
    reversedInput.request.earlierPeriod,
  ];
  const reversed = await runOpenEnaInferenceV2(reversedInput);
  assert.equal(reversed.kind, "trajectory-paired-periods");
  for (let index = 0; index < forward.rows.length; index += 1) {
    assert.equal(reversed.rows[index].wPositive, forward.rows[index].wNegative);
    assert.equal(reversed.rows[index].wNegative, forward.rows[index].wPositive);
    assert.equal(
      reversed.rows[index].rankBiserialLaterVsEarlier,
      -(forward.rows[index].rankBiserialLaterVsEarlier ?? Number.NaN),
    );
    assert.equal(reversed.rows[index].pRaw, forward.rows[index].pRaw);
    assert.equal(reversed.rows[index].pHolm, forward.rows[index].pHolm);
  }
});

test("repeated inference shares one complete cohort across omnibus and every follow-up pair", async () => {
  const input = trajectoryFixture();
  input.request = {
    kind: "trajectory-repeated-periods",
    repeatedEntityColumns: ["Group", "Name"],
    timeColumn: "Period",
    group: "Control",
    periods: ["T1", "T2", "T3"],
    axes: input.request.axes,
    cohortPolicy: "all-period-complete",
    posthocContrasts: "all-period-pairs",
  };
  const output = await runOpenEnaInferenceV2(input);
  assert.equal(output.kind, "trajectory-repeated-periods");
  assert.ok(output.ledger);
  assert.equal(output.ledger.candidateEntityCount, 4);
  assert.equal(output.ledger.completeBlockCount, 2);
  assert.equal(output.ledger.missingAnySelectedPeriodCount, 2);
  assert.deepEqual(output.ledger.availableByPeriod.map((entry) => entry.availableEntityCount), [4, 3, 3]);
  assert.equal(output.omnibusRows.length, 2);
  assert.equal(output.followupRows.length, 6);
  assert.ok(output.omnibusRows.every((row) => row.nComplete === 2));
  assert.ok(output.followupRows.every((row) => row.nMatched === 2));
  assert.deepEqual(
    [...new Set(output.followupRows.map((row) => `${row.earlierPeriodIndex}-${row.laterPeriodIndex}`))],
    ["0-1", "0-2", "1-2"],
  );
  assert.equal(output.families.length, 2);
  assert.equal(output.families.find((family) => family.role === "omnibus")?.familySizePlanned, 2);
  assert.equal(output.families.find((family) => family.role === "posthoc")?.familySizePlanned, 6);
  assert.ok(output.omnibusRows.every((row) => row.warnings.includes("missing-complete-blocks")));
  assert.ok(output.followupRows.every((row) => row.warnings.includes("missing-complete-blocks")));
});

test("repeated zero-complete data preserves every planned null family member", async () => {
  const input = trajectoryFixture();
  input.request = {
    kind: "trajectory-repeated-periods",
    repeatedEntityColumns: ["Group", "Name"],
    timeColumn: "Period",
    group: "Experimental",
    periods: ["T1", "T2", "T3"],
    axes: input.request.axes,
    cohortPolicy: "all-period-complete",
    posthocContrasts: "all-period-pairs",
  };
  assert.ok(input.comparisonFrame);
  input.comparisonFrame.points = input.comparisonFrame.points.filter((point) => (
    !(point.entityToken === "opaque-secret-e1" && point.time === "T3")
  ));
  const output = await runOpenEnaInferenceV2(input);
  assert.equal(output.kind, "trajectory-repeated-periods");
  assert.equal(output.status, "not-estimable");
  assert.equal(output.reason, "no-complete-blocks");
  assert.ok(output.ledger);
  assert.equal(output.ledger.completeBlockCount, 0);
  assert.equal(output.omnibusRows.length, 2);
  assert.equal(output.followupRows.length, 6);
  assert.ok(allRows(output).every((row) => row.pRaw === null && row.pHolm === null));
  assert.ok(allRows(output).every((row) => row.resolvedPMethod === null));
  assert.ok(output.followupRows.every((row) => row.reason === "no-complete-blocks"));
  assert.ok(allRows(output).every((row) => row.familySizePlanned === (row.test === "friedman" ? 2 : 6)));
});

test("planned unavailable axes remain in Holm without receiving a fabricated cell p-value", async () => {
  const input = trajectoryFixture();
  assert.ok(input.comparisonFrame);
  for (const point of input.comparisonFrame.points) point.y = 1;
  const output = await runOpenEnaInferenceV2(input);
  assert.equal(output.kind, "trajectory-independent-period");
  assert.equal(output.rows[1].status, "not-estimable");
  assert.equal(output.rows[1].pRaw, null);
  assert.equal(output.rows[1].pHolm, null);
  assert.equal(output.rows[1].familySizePlanned, 2);
  assert.equal(output.rows[0].familySizePlanned, 2);
  assert.equal(output.rows[0].pHolm, Math.min(1, 2 * (output.rows[0].pRaw ?? Number.NaN)));
});

test("identity and ordinary design errors return typed disabled results", async () => {
  const identity = trajectoryFixture();
  assert.ok(identity.comparisonFrame);
  identity.comparisonFrame.identityConfirmed = false;
  identity.comparisonFrame.eligibility = { eligible: false, reason: "identity-not-confirmed" };
  const identityOutput = await runOpenEnaInferenceV2(identity);
  assert.equal(identityOutput.status, "disabled");
  assert.equal(identityOutput.reason, "identity-not-confirmed");
  assert.equal(identityOutput.ledger, null);
  assert.deepEqual(allRows(identityOutput), []);

  const sameGroups = trajectoryFixture();
  assert.equal(sameGroups.request.kind, "trajectory-independent-period");
  sameGroups.request.secondaryGroup = sameGroups.request.primaryGroup;
  const sameGroupsOutput = await runOpenEnaInferenceV2(sameGroups);
  assert.equal(sameGroupsOutput.status, "disabled");
  assert.equal(sameGroupsOutput.reason, "groups-must-differ");

  const groupOnly = trajectoryFixture();
  assert.equal(groupOnly.request.kind, "trajectory-independent-period");
  groupOnly.request.repeatedEntityColumns = ["Group"];
  assert.ok(groupOnly.comparisonFrame);
  groupOnly.comparisonFrame.repeatedEntityColumns = ["Group"];
  const groupOnlyOutput = await runOpenEnaInferenceV2(groupOnly);
  assert.equal(groupOnlyOutput.status, "disabled");
  assert.equal(groupOnlyOutput.reason, "identity-columns-invalid");
  assert.equal(groupOnlyOutput.ledger, null);

  const wrongModel = endpointFixture();
  wrongModel.request = {
    kind: "trajectory-paired-periods",
    repeatedEntityColumns: ["unit"],
    timeColumn: "conversation",
    group: "Primary",
    earlierPeriod: "c1",
    laterPeriod: "c2",
    axes: wrongModel.request.axes,
    cohortPolicy: "pairwise-complete",
  };
  const wrongModelOutput = await runOpenEnaInferenceV2(wrongModel);
  assert.equal(wrongModelOutput.status, "disabled");
  assert.equal(wrongModelOutput.reason, "design-not-confirmed");
});

test("unknown or duplicate request axes return typed disabled results after source binding verification", async () => {
  const endpoint = endpointFixture();
  endpoint.request.axes = [endpoint.request.axes[0], endpoint.request.axes[0]];
  const endpointOutput = await runOpenEnaInferenceV2(endpoint);
  assert.equal(endpointOutput.kind, "endpoint-independent");
  assert.equal(endpointOutput.status, "disabled");
  assert.equal(endpointOutput.reason, "axes-invalid");
  assert.equal(endpointOutput.ledger, null);
  assert.deepEqual(endpointOutput.families, []);
  assert.deepEqual(endpointOutput.rows, []);
  assert.equal(endpointOutput.binding.dataset.normalizedUtf8TextSha256, HASH);

  const trajectory = trajectoryFixture();
  trajectory.request.axes = [trajectory.request.axes[0], "unknown-axis"];
  const trajectoryOutput = await runOpenEnaInferenceV2(trajectory);
  assert.equal(trajectoryOutput.kind, "trajectory-independent-period");
  assert.equal(trajectoryOutput.status, "disabled");
  assert.equal(trajectoryOutput.reason, "axes-invalid");
  assert.equal(trajectoryOutput.ledger, null);
  assert.deepEqual(trajectoryOutput.families, []);
  assert.deepEqual(trajectoryOutput.rows, []);
  assert.equal(trajectoryOutput.binding.dataset.normalizedUtf8TextSha256, HASH);
});

test("result/current binding drift and malformed axes fail closed with static integrity errors", async () => {
  const mutations: Array<(input: OpenEnaInferenceCoordinatorInputV2) => void> = [
    (input) => { input.currentBinding.datasetNormalizedUtf8TextSha256 = "bad"; },
    (input) => { input.currentBinding.datasetNormalizedUtf8TextSha256 = OTHER_HASH; },
    (input) => { input.currentBinding.datasetHashKind = "canonical-first-xlsx-worksheet-v1-sha256"; },
    (input) => { input.currentBinding.configuration.codes = ["A", "B"]; },
    (input) => { delete input.result.provenanceBinding; },
    (input) => { input.result.analyzedAt = "not-a-time"; },
    (input) => { input.result.set.functionParams.windowSizeForward = 99; },
  ];
  for (const mutate of mutations) {
    const input = endpointFixture();
    mutate(input);
    await caughtIntegrity(() => runOpenEnaInferenceV2(input), "binding-mismatch");
  }
});

test("trajectory frame binding drift fails closed before any private slice is exposed", async () => {
  const mutations: Array<(frame: OpenEnaLongitudinalComparisonFrame) => void> = [
    (frame) => { frame.binding.analyzedAt = "2026-08-21T10:00:01.000Z"; },
    (frame) => { frame.binding.datasetNormalizedUtf8TextSha256 = OTHER_HASH; },
    (frame) => { frame.binding.datasetHashKind = "canonical-first-xlsx-worksheet-v1-sha256"; },
    (frame) => { frame.binding.configuration.codes = ["A", "B"]; },
    (frame) => { frame.axes = [frame.axes[1], frame.axes[0]]; },
    (frame) => { frame.timeColumn = "Other"; },
    (frame) => { frame.repeatedEntityColumns = ["Name", "Group"]; },
  ];
  for (const mutate of mutations) {
    const input = trajectoryFixture();
    assert.ok(input.comparisonFrame);
    mutate(input.comparisonFrame);
    await caughtIntegrity(() => runOpenEnaInferenceV2(input), "binding-mismatch");
  }
});

test("trajectory private-frame collision codes remain typed and value-free", async () => {
  const renamedFrameGroup = trajectoryFixture();
  assert.ok(renamedFrameGroup.comparisonFrame);
  renamedFrameGroup.comparisonFrame.groups[0].name = "forged-private-group";
  await caughtIntegrity(
    () => runOpenEnaInferenceV2(renamedFrameGroup),
    "group-instability",
  );

  const groupInstability = trajectoryFixture();
  assert.ok(groupInstability.comparisonFrame);
  groupInstability.comparisonFrame.points[0].group.index = 99;
  await caughtIntegrity(
    () => runOpenEnaInferenceV2(groupInstability),
    "group-instability",
  );

  const duplicatePeriod = trajectoryFixture();
  assert.ok(duplicatePeriod.comparisonFrame);
  duplicatePeriod.comparisonFrame.points.push({
    ...structuredClone(duplicatePeriod.comparisonFrame.points[0]),
    x: 99,
  });
  await caughtIntegrity(
    () => runOpenEnaInferenceV2(duplicatePeriod),
    "entity-period-instability",
  );

  const collision = trajectoryFixture();
  assert.ok(collision.comparisonFrame);
  const primary = collision.comparisonFrame.points.find((point) => (
    point.group.name === "Control" && point.time === "T1"
  ));
  const secondary = collision.comparisonFrame.points.find((point) => (
    point.group.name === "Experimental" && point.time === "T1"
  ));
  assert.ok(primary);
  assert.ok(secondary);
  secondary.entityToken = primary.entityToken;
  await caughtIntegrity(() => runOpenEnaInferenceV2(collision), "identity-collision");

  const nonfinite = trajectoryFixture();
  assert.ok(nonfinite.comparisonFrame);
  nonfinite.comparisonFrame.points[0].x = Number.NaN;
  await caughtIntegrity(() => runOpenEnaInferenceV2(nonfinite), "nonfinite-coordinate");

  const invalidSourceCount = trajectoryFixture();
  assert.ok(invalidSourceCount.comparisonFrame);
  invalidSourceCount.comparisonFrame.points[0].sourcePointCount = 0;
  await caughtIntegrity(
    () => runOpenEnaInferenceV2(invalidSourceCount),
    "entity-period-instability",
  );
});

test("paired slicing fails closed on identity collisions and duplicate compact points outside selected periods", async () => {
  const pairedRequest = (input: OpenEnaInferenceCoordinatorInputV2) => {
    input.request = {
      kind: "trajectory-paired-periods",
      repeatedEntityColumns: ["Group", "Name"],
      timeColumn: "Period",
      group: "Control",
      earlierPeriod: "T1",
      laterPeriod: "T2",
      axes: input.request.axes,
      cohortPolicy: "pairwise-complete",
    };
  };

  const unselectedGroupCollision = trajectoryFixture();
  pairedRequest(unselectedGroupCollision);
  assert.ok(unselectedGroupCollision.comparisonFrame);
  const controlPoint = unselectedGroupCollision.comparisonFrame.points.find((point) => (
    point.group.name === "Control" && point.time === "T1"
  ));
  const experimentalUnselectedPeriod = unselectedGroupCollision.comparisonFrame.points.find((point) => (
    point.group.name === "Experimental" && point.time === "T3"
  ));
  assert.ok(controlPoint);
  assert.ok(experimentalUnselectedPeriod);
  experimentalUnselectedPeriod.entityToken = controlPoint.entityToken;
  await caughtIntegrity(
    () => runOpenEnaInferenceV2(unselectedGroupCollision),
    "identity-collision",
  );

  const duplicateUnselectedPeriod = trajectoryFixture();
  pairedRequest(duplicateUnselectedPeriod);
  assert.ok(duplicateUnselectedPeriod.comparisonFrame);
  const existingT3 = duplicateUnselectedPeriod.comparisonFrame.points.find((point) => (
    point.group.name === "Control" && point.time === "T3"
  ));
  assert.ok(existingT3);
  duplicateUnselectedPeriod.comparisonFrame.points.push({
    ...structuredClone(existingT3),
    x: existingT3.x + 100,
  });
  await caughtIntegrity(
    () => runOpenEnaInferenceV2(duplicateUnselectedPeriod),
    "entity-period-instability",
  );
});

test("endpoint and trajectory aggregate inference is invariant to private row order", async () => {
  const endpoint = endpointFixture();
  const endpointBaseline = await runOpenEnaInferenceV2(endpoint);
  const endpointReordered = structuredClone(endpoint);
  endpointReordered.result.set.points.reverse();
  const endpointAfter = await runOpenEnaInferenceV2(endpointReordered);
  assert.deepEqual(endpointAfter, endpointBaseline);

  const trajectory = trajectoryFixture();
  trajectory.request = {
    kind: "trajectory-repeated-periods",
    repeatedEntityColumns: ["Group", "Name"],
    timeColumn: "Period",
    group: "Control",
    periods: ["T1", "T2", "T3"],
    axes: trajectory.request.axes,
    cohortPolicy: "all-period-complete",
    posthocContrasts: "all-period-pairs",
  };
  const trajectoryBaseline = await runOpenEnaInferenceV2(trajectory);
  const trajectoryReordered = structuredClone(trajectory);
  assert.ok(trajectoryReordered.comparisonFrame);
  trajectoryReordered.comparisonFrame.points.reverse();
  const trajectoryAfter = await runOpenEnaInferenceV2(trajectoryReordered);
  assert.deepEqual(trajectoryAfter, trajectoryBaseline);
});

test("endpoint duplicate, overlapping, and non-finite analytic units fail closed", async () => {
  const duplicate = endpointFixture();
  duplicate.result.set.points[1].ENA_UNIT = duplicate.result.set.points[0].ENA_UNIT;
  await caughtIntegrity(() => runOpenEnaInferenceV2(duplicate), "entity-period-instability");

  const overlap = endpointFixture();
  overlap.result.set.points[2].ENA_UNIT = overlap.result.set.points[0].ENA_UNIT;
  await caughtIntegrity(() => runOpenEnaInferenceV2(overlap), "identity-collision");

  for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const input = endpointFixture();
    input.result.set.points[0][input.request.axes[0]] = invalid;
    await caughtIntegrity(() => runOpenEnaInferenceV2(input), "nonfinite-coordinate");
  }

  const duplicateGroups = endpointFixture();
  duplicateGroups.result.groups[1].name = duplicateGroups.result.groups[0].name;
  await caughtIntegrity(() => runOpenEnaInferenceV2(duplicateGroups), "group-instability");

  const unexpectedFrame = endpointFixture();
  unexpectedFrame.comparisonFrame = trajectoryFixture().comparisonFrame;
  await caughtIntegrity(() => runOpenEnaInferenceV2(unexpectedFrame), "binding-mismatch");
});

test("endpoint validates unselected and unknown-group analytic units before group slicing", async () => {
  const crossGroup = endpointFixture();
  const crossGroupPoint = structuredClone(crossGroup.result.set.points[0]);
  crossGroupPoint.group = "Third";
  crossGroup.result.set.points.push(crossGroupPoint);
  crossGroup.result.groups.push({
    ...structuredClone(crossGroup.result.groups[0]),
    name: "Third",
    count: 1,
    pointCount: 1,
  });
  await caughtIntegrity(() => runOpenEnaInferenceV2(crossGroup), "identity-collision");

  const unknownGroup = endpointFixture();
  const unknownGroupPoint = structuredClone(unknownGroup.result.set.points[0]);
  unknownGroupPoint.ENA_UNIT = "opaque-unknown-unit";
  unknownGroupPoint.group = "unknown-group-value";
  unknownGroup.result.set.points.push(unknownGroupPoint);
  await caughtIntegrity(() => runOpenEnaInferenceV2(unknownGroup), "group-instability");
});

test("warning aggregation covers accumulated paths, MR1 circularity, ties, zeros, and exact discreteness", async () => {
  const input = trajectoryFixture();
  input.currentBinding.configuration.model = "AccumulatedTrajectory";
  input.currentBinding.configuration.rotation = "mean";
  const priorFirstAxis = input.request.axes[0];
  input.request.axes = ["MR1", input.request.axes[1]];
  input.result.dimensions = ["MR1", ...input.result.dimensions.slice(1)];
  for (const point of input.result.set.points) point.MR1 = point[priorFirstAxis];
  input.result.set.modelType = "AccumulatedTrajectory";
  input.result.set.functionParams.model = "AccumulatedTrajectory";
  assert.ok(input.result.provenanceBinding);
  input.result.provenanceBinding.configuration.model = "AccumulatedTrajectory";
  input.result.provenanceBinding.configuration.rotation = "mean";
  assert.ok(input.comparisonFrame);
  input.comparisonFrame.binding.modelType = "AccumulatedTrajectory";
  input.comparisonFrame.binding.configuration.model = "AccumulatedTrajectory";
  input.comparisonFrame.binding.configuration.rotation = "mean";
  input.comparisonFrame.axes = ["MR1", input.comparisonFrame.axes[1]];
  input.comparisonFrame.binding.axes = ["MR1", input.comparisonFrame.binding.axes[1]];
  const output = await runOpenEnaInferenceV2(input);
  assert.ok(output.warnings.includes("accumulated-trajectory-path-dependence"));
  assert.ok(output.warnings.includes("mr1-circularity"));
  assert.ok(output.warnings.includes("small-sample"));
  assert.ok(output.warnings.includes("discrete-attainable-p"));
});

test("all-zero paired axes are planned not-estimable rows without exact discreteness", async () => {
  const input = trajectoryFixture();
  assert.ok(input.comparisonFrame);
  for (const earlier of input.comparisonFrame.points.filter((point) => (
    point.group.name === "Control" && point.time === "T1"
  ))) {
    const later = input.comparisonFrame.points.find((point) => (
      point.entityToken === earlier.entityToken && point.time === "T2"
    ));
    if (later) {
      later.x = earlier.x;
      later.y = earlier.y;
    }
  }
  input.request = {
    kind: "trajectory-paired-periods",
    repeatedEntityColumns: ["Group", "Name"],
    timeColumn: "Period",
    group: "Control",
    earlierPeriod: "T1",
    laterPeriod: "T2",
    axes: input.request.axes,
    cohortPolicy: "pairwise-complete",
  };
  const output = await runOpenEnaInferenceV2(input);
  assert.equal(output.kind, "trajectory-paired-periods");
  assert.equal(output.status, "not-estimable");
  assert.equal(output.reason, "all-zero-differences");
  assert.ok(output.rows.every((row) => row.reason === "all-zero-differences"));
  assert.ok(output.rows.every((row) => row.nZero === 3 && row.nNonzero === 0));
  assert.ok(output.rows.every((row) => row.warnings.includes("zero-differences-present")));
  assert.ok(output.rows.every((row) => !row.warnings.includes("discrete-attainable-p")));
  assert.ok(output.rows.every((row) => row.pRaw === null && row.pHolm === null));
  assert.equal(output.families[0].familySizePlanned, 2);
});

test("ungrouped trajectory inference uses one explicit All units frame with a null group request", async () => {
  const input = trajectoryFixture();
  const ungroup = (configuration: OpenEnaConfig) => {
    configuration.unitColumns = ["Name"];
    configuration.groupColumn = null;
  };
  ungroup(input.currentBinding.configuration);
  assert.ok(input.result.provenanceBinding);
  ungroup(input.result.provenanceBinding.configuration);
  input.result.set.units = ["Name"];
  input.result.groups = [{
    ...input.result.groups[0],
    name: "All units",
    count: input.result.groups.reduce((sum, group) => sum + group.count, 0),
    pointCount: input.result.groups.reduce((sum, group) => sum + group.pointCount, 0),
  }];
  assert.ok(input.comparisonFrame);
  ungroup(input.comparisonFrame.binding.configuration);
  input.comparisonFrame.repeatedEntityColumns = ["Name"];
  input.comparisonFrame.groups = [{ role: "all-units", index: 0, name: "All units" }];
  for (const point of input.comparisonFrame.points) {
    point.group = { role: "all-units", index: 0, name: "All units" };
  }
  input.request = {
    kind: "trajectory-paired-periods",
    repeatedEntityColumns: ["Name"],
    timeColumn: "Period",
    group: null,
    earlierPeriod: "T1",
    laterPeriod: "T2",
    axes: input.request.axes,
    cohortPolicy: "pairwise-complete",
  };
  const output = await runOpenEnaInferenceV2(input);
  assert.equal(output.kind, "trajectory-paired-periods");
  assert.equal(output.status, "available");
  assert.equal(output.scope.group, null);
  assert.equal(output.scope.analysisUnit, "repeated-entity");
  assert.ok(output.ledger);
  assert.equal(output.ledger.matchedEntityCount, 4);
});

test("family/member IDs are stable role-index hashes and no private frame internals escape", async () => {
  const input = trajectoryFixture();
  input.request = {
    kind: "trajectory-repeated-periods",
    repeatedEntityColumns: ["Group", "Name"],
    timeColumn: "Period",
    group: "Control",
    periods: ["T1", "T2", "T3"],
    axes: input.request.axes,
    cohortPolicy: "all-period-complete",
    posthocContrasts: "all-period-pairs",
  };
  Object.assign(input.request, { entityToken: "request-secret-token" });
  const first = await runOpenEnaInferenceV2(input);
  const second = await runOpenEnaInferenceV2(structuredClone(input));
  assert.deepEqual(second, first);
  const reordered = structuredClone(input);
  const reverseConfig = (configuration: OpenEnaConfig) => Object.fromEntries(
    Object.entries(configuration).reverse(),
  ) as unknown as OpenEnaConfig;
  reordered.currentBinding.configuration = reverseConfig(reordered.currentBinding.configuration);
  assert.ok(reordered.result.provenanceBinding);
  reordered.result.provenanceBinding.configuration = reverseConfig(
    reordered.result.provenanceBinding.configuration,
  );
  assert.ok(reordered.comparisonFrame);
  reordered.comparisonFrame.binding.configuration = reverseConfig(
    reordered.comparisonFrame.binding.configuration,
  );
  const reorderedOutput = await runOpenEnaInferenceV2(reordered);
  assert.deepEqual(reorderedOutput.families, first.families);
  for (const family of first.families) {
    assert.match(family.familyId, /^openena-family-v2-[0-9a-f]{64}$/u);
    assert.doesNotMatch(family.familyId, /Control|Experimental|T1|T2|T3|opaque-secret/i);
  }
  for (const row of allRows(first)) {
    assert.match(row.memberId, /^openena-member-v2-[0-9a-f]{64}$/u);
    assert.doesNotMatch(row.memberId, /Control|Experimental|T1|T2|T3|opaque-secret/i);
  }
  assert.equal(new Set(allRows(first).map((row) => row.memberId)).size, allRows(first).length);
  const serialized = JSON.stringify(first);
  assert.doesNotMatch(serialized, /opaque-secret|request-secret|entityToken|entityTokens|entityValues|pairedDifferences|entityPeriodCoordinates|sourceRows/i);
  const forbiddenKeys = new Set(["entityToken", "entityTokens", "points", "pairs", "blocks", "rawDifferences", "sourceRows"]);
  const visit = (value: unknown) => {
    assert.notEqual(typeof value, "bigint", "public inference must not contain BigInt");
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      assert.equal(forbiddenKeys.has(key), false, `public inference contains forbidden key ${key}`);
      visit(nested);
    }
  };
  visit(first);
  assertDeeplyFrozen(first);
});
