import assert from "node:assert/strict";
import test from "node:test";
import { analyzeDataset } from "../lib/open-ena/analyze";
import { parseCsv } from "../lib/open-ena/csv";
import {
  OpenEnaLongitudinalIntegrityError,
  buildLongitudinalDerivation,
  buildLongitudinalGroupCentroidExport,
  longitudinalPeriodRowsToCsv,
  sliceLongitudinalIndependentPeriod,
  sliceLongitudinalPairedPeriods,
  sliceLongitudinalRepeatedPeriods,
  type OpenEnaLongitudinalComparisonFrame,
  type OpenEnaLongitudinalSettingsV2,
} from "../lib/open-ena/longitudinal";
import { SAMPLE_CONFIG, type OpenEnaConfig, type OpenEnaResult, type ParsedDataset } from "../lib/open-ena/types";

const SOURCE_HASH = "c".repeat(64);
const CREATED_AT = "2026-08-21T08:00:00.000Z";

const FIXTURE_ROWS = [
  "Group,Name,Case,Period,private_text,A,B,C",
  "Control,Alex,one,T1,control-alex-t1-one,1,1,0",
  "Control,Alex,two,T1,control-alex-t1-two,0,1,1",
  "Control,Alex,one,T2,control-alex-t2,1,0,1",
  "Control,Alex,one,T3,control-alex-t3,1,1,0",
  "Control,Blair,one,T1,control-blair-t1,1,0,1",
  "Control,Blair,one,T2,control-blair-t2,0,1,1",
  "Control,Casey,one,T1,control-casey-t1,1,1,0",
  "Control,Drew,one,T2,control-drew-t2,1,0,1",
  "Control,Evan,one,T1,control-evan-t1,0,1,1",
  "Control,Evan,one,T3,control-evan-t3,1,0,1",
  "Experimental,Alex,one,T1,experimental-alex-t1,0,1,1",
  "Experimental,Alex,one,T2,experimental-alex-t2,1,1,0",
  "Experimental,Alex,one,T3,experimental-alex-t3,1,0,1",
  "Experimental,Jordan,one,T1,experimental-jordan-t1,1,1,0",
  "Experimental,Jordan,one,T2,experimental-jordan-t2,0,1,1",
  "Experimental,Jordan,one,T3,experimental-jordan-t3,1,0,1",
  "Experimental,Kai,one,T1,experimental-kai-t1,1,0,1",
] as const;

function frameFixture(rows: readonly string[] = FIXTURE_ROWS): {
  dataset: ParsedDataset;
  config: OpenEnaConfig;
  result: OpenEnaResult;
} {
  const dataset = parseCsv(`${rows.join("\n")}\n`, {
    name: "yu-style-private-longitudinal.csv",
    source: "upload",
  });
  const config: OpenEnaConfig = {
    ...SAMPLE_CONFIG,
    unitColumns: ["Group", "Name", "Case"],
    conversationColumns: ["Period"],
    groupColumn: "Group",
    codes: ["A", "B", "C"],
    model: "SeparateTrajectory",
    window: "Conversation",
    rotation: "svd",
  };
  const analyzed = analyzeDataset(dataset, config);
  return {
    dataset,
    config,
    result: {
      ...analyzed,
      provenanceBinding: {
        datasetNormalizedUtf8TextSha256: SOURCE_HASH,
        datasetHashKind: dataset.hashKind,
        configuration: structuredClone(config),
      },
    },
  };
}

function confirmedSettings(
  cohortPolicy: "available" | "complete" = "available",
): OpenEnaLongitudinalSettingsV2 {
  return {
    repeatedEntityColumns: ["Group", "Name"],
    identityConfirmed: true,
    timeColumn: "Period",
    timeOrder: ["T1", "T2", "T3"],
    cohortPolicy,
    axes: ["SVD1", "SVD2"],
    datasetNormalizedUtf8TextSha256: SOURCE_HASH,
  };
}

function derive(
  fixture = frameFixture(),
  settings: OpenEnaLongitudinalSettingsV2 = confirmedSettings(),
) {
  return buildLongitudinalDerivation(
    fixture.result,
    fixture.config,
    fixture.dataset,
    settings,
    CREATED_AT,
  );
}

function caught(run: () => unknown) {
  try {
    run();
    assert.fail("expected a typed longitudinal integrity error");
  } catch (error) {
    assert.ok(error instanceof OpenEnaLongitudinalIntegrityError);
    return error;
  }
}

function assertSafeMessage(error: Error) {
  assert.doesNotMatch(
    error.message,
    /Alex|Blair|Casey|Drew|Evan|Jordan|Kai|Control|Experimental|entity-\d+|NaN|Infinity|control-|experimental-/i,
  );
}

function rounded(value: number) {
  return Math.abs(value) < 1e-12 ? 0 : Number(value.toPrecision(12));
}

function alphaRenamedHistories(frame: OpenEnaLongitudinalComparisonFrame) {
  const byToken = new Map<string, Array<Record<string, string | number>>>();
  for (const point of frame.points) {
    const history = byToken.get(point.entityToken) ?? [];
    history.push({
      group: point.group.name,
      groupIndex: point.group.index,
      time: point.time,
      timeIndex: point.timeIndex,
      x: rounded(point.x),
      y: rounded(point.y),
      sourcePointCount: point.sourcePointCount,
    });
    byToken.set(point.entityToken, history);
  }
  return [...byToken.values()]
    .map((history) => history.sort((left, right) => (
      Number(left.timeIndex) - Number(right.timeIndex)
      || String(left.group).localeCompare(String(right.group))
      || Number(left.x) - Number(right.x)
      || Number(left.y) - Number(right.y)
    )))
    .map((history) => JSON.stringify(history))
    .sort();
}

test("validates ordered plural identity columns against the successful configuration and dataset", () => {
  const fixture = frameFixture();
  const invalidColumns = [
    [],
    ["Group", "Group"],
    ["Group", "private_text"],
    ["Group", "Missing"],
  ];
  for (const repeatedEntityColumns of invalidColumns) {
    const error = caught(() => derive(fixture, {
      ...confirmedSettings(),
      repeatedEntityColumns,
    }));
    assert.equal(error.code, "identity-columns-invalid");
    assertSafeMessage(error);
  }

  const missingHeaderDataset = structuredClone(fixture.dataset);
  missingHeaderDataset.headers = missingHeaderDataset.headers.filter((header) => header !== "Name");
  const missingHeader = caught(() => derive({ ...fixture, dataset: missingHeaderDataset }));
  assert.equal(missingHeader.code, "identity-columns-invalid");

  for (const invalidComponent of [null, undefined, "   "]) {
    const emptyComponentDataset = structuredClone(fixture.dataset);
    if (invalidComponent === undefined) delete emptyComponentDataset.rows[0].Name;
    else emptyComponentDataset.rows[0].Name = invalidComponent;
    const emptyComponent = caught(() => derive({ ...fixture, dataset: emptyComponentDataset }));
    assert.equal(emptyComponent.code, "identity-component-empty");
    assertSafeMessage(emptyComponent);
  }
});

test("normalizes identity components with NFC and intentional String type-boundary equivalence", () => {
  const normalizationRows = [
    "Group,Name,Case,Period,A,B,C",
    "Only,Caf\u00e9,one,T1,1,1,0",
    "Only,Cafe\u0301,two,T1,0,1,1",
    "Only,1,three,T1,1,0,1",
    "Only,1,four,T1,1,1,0",
    "Only,Caf\u00e9,one,T2,1,0,1",
    "Only,Cafe\u0301,two,T2,1,1,0",
    "Only,1,three,T2,0,1,1",
    "Only,1,four,T2,1,0,1",
    "Only, Alex,five,T1,1,1,0",
    "Only,Alex ,six,T1,0,1,1",
    "Only, Alex,five,T2,1,0,1",
    "Only,Alex ,six,T2,1,1,0",
  ];
  const fixture = frameFixture(normalizationRows);
  fixture.dataset.rows.find((row) => row.Case === "three")!.Name = 1;
  const { comparisonFrame } = derive(fixture, {
    ...confirmedSettings(),
    repeatedEntityColumns: ["Name"],
    timeOrder: ["T1", "T2"],
  });

  const tokens = new Set(comparisonFrame.points.map((point) => point.entityToken));
  assert.equal(
    tokens.size,
    4,
    "NFC and numeric/string equivalents collapse, while leading/trailing whitespace remains identity-significant",
  );
  assert.deepEqual(
    comparisonFrame.points.map((point) => point.sourcePointCount).sort((left, right) => left - right),
    [1, 1, 1, 1, 2, 2, 2, 2],
  );
});

test("preserves case so Alex and alex remain distinct repeated identities", () => {
  const fixture = frameFixture([
    "Group,Name,Case,Period,A,B,C",
    "Only,Alex,one,T1,1,1,0",
    "Only,alex,two,T1,0,1,1",
    "Only,Alex,one,T2,1,0,1",
    "Only,alex,two,T2,1,1,0",
  ]);
  const { comparisonFrame } = derive(fixture, {
    ...confirmedSettings(),
    repeatedEntityColumns: ["Name"],
    timeOrder: ["T1", "T2"],
  });

  const pointCountByToken = new Map<string, number>();
  for (const point of comparisonFrame.points) {
    pointCountByToken.set(point.entityToken, (pointCountByToken.get(point.entityToken) ?? 0) + 1);
  }
  assert.equal(pointCountByToken.size, 2);
  assert.deepEqual([...pointCountByToken.values()].sort((left, right) => left - right), [2, 2]);
});

test("migrates the deliberate v1 input to one unconfirmed column while keeping Plot usable", () => {
  const fixture = frameFixture();
  const derivation = buildLongitudinalDerivation(
    fixture.result,
    fixture.config,
    fixture.dataset,
    {
      repeatedEntityColumn: "Group",
      timeColumn: "Period",
      timeOrder: ["T1", "T2", "T3"],
      cohortPolicy: "available",
      axes: ["SVD1", "SVD2"],
      datasetNormalizedUtf8TextSha256: SOURCE_HASH,
    },
    CREATED_AT,
  );

  assert.deepEqual(derivation.view.repeatedEntityColumns, ["Group"]);
  assert.equal(derivation.view.identityConfirmed, false);
  assert.ok(derivation.view.entityPeriods.length > 0, "the compatibility Plot view remains usable");
  assert.deepEqual(derivation.comparisonFrame.repeatedEntityColumns, ["Group"]);
  assert.equal(derivation.comparisonFrame.identityConfirmed, false);
  assert.deepEqual(derivation.comparisonFrame.eligibility, {
    eligible: false,
    reason: "identity-not-confirmed",
  });
  const error = caught(() => sliceLongitudinalPairedPeriods(derivation.comparisonFrame, {
    group: "Control",
    earlierPeriod: "T1",
    laterPeriod: "T2",
  }));
  assert.equal(error.code, "identity-not-confirmed");
  assertSafeMessage(error);
});

test("uses full Group plus Name identity so the same Name in different groups stays distinct", () => {
  const { comparisonFrame } = derive();
  assert.equal(comparisonFrame.identityConfirmed, true);
  assert.deepEqual(comparisonFrame.repeatedEntityColumns, ["Group", "Name"]);
  const tokensByGroup = new Map<string, Set<string>>();
  for (const point of comparisonFrame.points) {
    const tokens = tokensByGroup.get(point.group.name) ?? new Set<string>();
    tokens.add(point.entityToken);
    tokensByGroup.set(point.group.name, tokens);
  }
  assert.equal(tokensByGroup.get("Control")?.size, 5);
  assert.equal(tokensByGroup.get("Experimental")?.size, 3);
  assert.deepEqual(
    new Set([...(tokensByGroup.get("Control") ?? [])].filter((token) => tokensByGroup.get("Experimental")?.has(token))),
    new Set(),
  );
});

test("rejects confirmed group-only pseudo-entities and fails closed on a Name-only cross-group collision", () => {
  const fixture = frameFixture();
  const groupOnly = caught(() => derive(fixture, {
    ...confirmedSettings(),
    repeatedEntityColumns: ["Group"],
  }));
  assert.equal(groupOnly.code, "identity-columns-invalid");
  assertSafeMessage(groupOnly);

  const nameOnly = caught(() => derive(fixture, {
    ...confirmedSettings(),
    repeatedEntityColumns: ["Name"],
  }));
  assert.ok(nameOnly.code === "identity-collision" || nameOnly.code === "group-instability");
  assertSafeMessage(nameOnly);
});

test("keeps canonical identity values out of the frame and tokens or values out of public ledgers and exports", () => {
  const { view, comparisonFrame } = derive();
  const frameJson = JSON.stringify(comparisonFrame);
  assert.match(frameJson, /entity-000001/);
  assert.doesNotMatch(frameJson, /Alex|Blair|Casey|Drew|Evan|Jordan|Kai|private_text|control-|experimental-/);
  assert.doesNotMatch(frameJson, /\[\\?"Group\\?",\\?"(?:Control|Experimental)\\?"\]/);

  const independent = sliceLongitudinalIndependentPeriod(comparisonFrame, {
    period: "T1",
    primaryGroup: "Control",
    secondaryGroup: "Experimental",
  });
  const paired = sliceLongitudinalPairedPeriods(comparisonFrame, {
    group: "Control",
    earlierPeriod: "T1",
    laterPeriod: "T2",
  });
  const repeated = sliceLongitudinalRepeatedPeriods(comparisonFrame, {
    group: "Control",
    periods: ["T1", "T2", "T3"],
  });
  for (const ledger of [independent.ledger, paired.ledger, repeated.ledger]) {
    assert.doesNotMatch(JSON.stringify(ledger), /entity-|Alex|Blair|Casey|Drew|Evan|Jordan|Kai|control-|experimental-/i);
  }

  const exported = JSON.stringify(buildLongitudinalGroupCentroidExport(view));
  const csv = longitudinalPeriodRowsToCsv(view);
  assert.doesNotMatch(exported, /entity-\d{6}|Alex|Blair|Casey|Drew|Evan|Jordan|Kai|private_text|control-|experimental-/i);
  assert.doesNotMatch(csv, /entity-\d{6}|Alex|Blair|Casey|Drew|Evan|Jordan|Kai|private_text|control-|experimental-/i);
});

test("collapses duplicate compact steps exactly once before frame slices and descriptive centroids", () => {
  const fixture = frameFixture();
  const { view, comparisonFrame } = derive(fixture);
  const duplicate = comparisonFrame.points.find((point) => point.sourcePointCount === 2);
  assert.ok(duplicate);
  assert.equal(duplicate.group.name, "Control");
  assert.equal(duplicate.time, "T1");

  const sourceCoordinates = fixture.result.set.points
    .map((point, index) => ({ point, trajectory: fixture.result.set.trajectories?.[index] }))
    .filter(({ trajectory }) => (
      trajectory?.Group === "Control"
      && trajectory?.Name === "Alex"
      && trajectory?.Period === "T1"
    ))
    .map(({ point }) => ({ x: Number(point.SVD1), y: Number(point.SVD2) }));
  assert.equal(sourceCoordinates.length, 2);
  assert.ok(Math.abs(duplicate.x - sourceCoordinates.reduce((sum, point) => sum + point.x, 0) / 2) < 1e-12);
  assert.ok(Math.abs(duplicate.y - sourceCoordinates.reduce((sum, point) => sum + point.y, 0) / 2) < 1e-12);

  const controlT1 = comparisonFrame.points.filter((point) => point.group.name === "Control" && point.time === "T1");
  const centroid = view.groups.find((group) => group.name === "Control")?.periods[0].centroid;
  assert.ok(centroid);
  assert.ok(Math.abs(centroid.x - controlT1.reduce((sum, point) => sum + point.x, 0) / controlT1.length) < 1e-12);
  assert.ok(Math.abs(centroid.y - controlT1.reduce((sum, point) => sum + point.y, 0) / controlT1.length) < 1e-12);
});

test("builds the comparison frame before Plot available or complete cohort filtering", () => {
  const fixture = frameFixture();
  const available = derive(fixture, confirmedSettings("available"));
  const complete = derive(fixture, confirmedSettings("complete"));
  assert.ok(available.view.entityPeriods.length > complete.view.entityPeriods.length);
  assert.deepEqual(available.comparisonFrame, complete.comparisonFrame);
  assert.equal(Object.isFrozen(available.comparisonFrame), true);
  assert.equal(Object.isFrozen(available.comparisonFrame.points), true);
  assert.equal(Object.isFrozen(available.comparisonFrame.points[0]), true);
  assert.throws(() => {
    (available.comparisonFrame.points as unknown as Array<{ x: number }>)[0].x = 999;
  }, TypeError);
});

test("independent-period slice isolates one known period and two disjoint entity groups", () => {
  const { comparisonFrame } = derive();
  const slice = sliceLongitudinalIndependentPeriod(comparisonFrame, {
    period: "T1",
    primaryGroup: "Control",
    secondaryGroup: "Experimental",
  });
  assert.ok(slice.rows.length > 0);
  assert.ok(slice.rows.every((row) => row.time === "T1" && row.timeIndex === 0));
  assert.deepEqual(new Set(slice.rows.map((row) => row.groupRole)), new Set(["primary", "secondary"]));
  assert.equal(new Set(slice.rows.map((row) => row.entityToken)).size, slice.rows.length);
  const primary = new Set(slice.rows.filter((row) => row.groupRole === "primary").map((row) => row.entityToken));
  const secondary = new Set(slice.rows.filter((row) => row.groupRole === "secondary").map((row) => row.entityToken));
  assert.deepEqual([...primary].filter((token) => secondary.has(token)), []);
  assert.deepEqual(slice.ledger, {
    candidateEntityCount: 8,
    primaryAvailableCount: 4,
    secondaryAvailableCount: 3,
    includedEntityCount: 7,
  });

  const unknown = caught(() => sliceLongitudinalIndependentPeriod(comparisonFrame, {
    period: "unknown-period",
    primaryGroup: "Control",
    secondaryGroup: "Experimental",
  }));
  assert.equal(unknown.code, "period-invalid");
  assertSafeMessage(unknown);
});

test("paired slice uses only A and B pairwise completion and reports third-period-independent missingness", () => {
  const { comparisonFrame } = derive();
  const paired = sliceLongitudinalPairedPeriods(comparisonFrame, {
    group: "Control",
    earlierPeriod: "T1",
    laterPeriod: "T2",
  });
  assert.equal(paired.pairs.length, 2, "Blair remains paired even though T3 is missing");
  assert.deepEqual(paired.ledger, {
    candidateEntityCount: 5,
    earlierAvailableCount: 4,
    laterAvailableCount: 3,
    matchedEntityCount: 2,
    earlierOnlyCount: 2,
    laterOnlyCount: 1,
    zeroDifferenceCountByAxis: {
      x: paired.ledger.zeroDifferenceCountByAxis.x,
      y: paired.ledger.zeroDifferenceCountByAxis.y,
    },
  });
  assert.ok(paired.pairs.every((pair) => pair.earlier.time === "T1" && pair.later.time === "T2"));
  assert.equal(new Set(paired.pairs.map((pair) => pair.entityToken)).size, paired.pairs.length);

  const repeated = sliceLongitudinalRepeatedPeriods(comparisonFrame, {
    group: "Control",
    periods: ["T1", "T2", "T3"],
  });
  assert.ok(paired.pairs.length > repeated.blocks.length);
});

test("repeated-period slice builds one common all-selected-period complete cohort", () => {
  const { comparisonFrame } = derive();
  const repeated = sliceLongitudinalRepeatedPeriods(comparisonFrame, {
    group: "Control",
    periods: ["T1", "T2", "T3"],
  });
  assert.equal(repeated.blocks.length, 1);
  assert.ok(repeated.blocks.every((block) => block.periods.length === 3));
  assert.ok(repeated.blocks.every((block) => block.periods.map((period) => period.time).join(",") === "T1,T2,T3"));
  assert.deepEqual(repeated.ledger, {
    candidateEntityCount: 5,
    availableByPeriod: [
      { period: "T1", periodIndex: 0, availableEntityCount: 4 },
      { period: "T2", periodIndex: 1, availableEntityCount: 3 },
      { period: "T3", periodIndex: 2, availableEntityCount: 2 },
    ],
    completeBlockCount: 1,
    missingAnySelectedPeriodCount: 4,
  });
});

test("row permutations may relabel tokens but preserve histories, slice ledgers, and aggregate coordinates", () => {
  const original = derive();
  const header = FIXTURE_ROWS[0];
  const permutedRows = [
    header,
    ...FIXTURE_ROWS.slice(1).filter((_, index) => index % 2 === 1).reverse(),
    ...FIXTURE_ROWS.slice(1).filter((_, index) => index % 2 === 0).reverse(),
  ];
  const permuted = derive(frameFixture(permutedRows));

  assert.deepEqual(alphaRenamedHistories(original.comparisonFrame), alphaRenamedHistories(permuted.comparisonFrame));
  const independentRequest = { period: "T1", primaryGroup: "Control", secondaryGroup: "Experimental" } as const;
  const pairedRequest = { group: "Control", earlierPeriod: "T1", laterPeriod: "T2" } as const;
  const repeatedRequest = { group: "Control", periods: ["T1", "T2", "T3"] } as const;
  assert.deepEqual(
    sliceLongitudinalIndependentPeriod(original.comparisonFrame, independentRequest).ledger,
    sliceLongitudinalIndependentPeriod(permuted.comparisonFrame, independentRequest).ledger,
  );
  assert.deepEqual(
    sliceLongitudinalPairedPeriods(original.comparisonFrame, pairedRequest).ledger,
    sliceLongitudinalPairedPeriods(permuted.comparisonFrame, pairedRequest).ledger,
  );
  assert.deepEqual(
    sliceLongitudinalRepeatedPeriods(original.comparisonFrame, repeatedRequest).ledger,
    sliceLongitudinalRepeatedPeriods(permuted.comparisonFrame, repeatedRequest).ledger,
  );

  const centroids = (derivation: typeof original) => derivation.view.periodDiagnostics.map((period) => ({
    group: period.group,
    time: period.time,
    x: period.centroid ? rounded(period.centroid.x) : null,
    y: period.centroid ? rounded(period.centroid.y) : null,
  })).sort((left, right) => left.group.localeCompare(right.group) || left.time.localeCompare(right.time));
  assert.deepEqual(centroids(original), centroids(permuted));
});

test("throws stable safe integrity errors for binding drift, unstable compact points, and nonfinite coordinates", () => {
  const fixture = frameFixture();
  const mismatchedBinding = caught(() => derive(fixture, {
    ...confirmedSettings(),
    datasetNormalizedUtf8TextSha256: "d".repeat(64),
  }));
  assert.equal(mismatchedBinding.code, "binding-mismatch");
  assertSafeMessage(mismatchedBinding);

  const duplicate = structuredClone(fixture.result);
  duplicate.set.points.push({ ...duplicate.set.points[0] });
  duplicate.set.trajectories?.push({ ...duplicate.set.trajectories[0] });
  const instability = caught(() => derive({ ...fixture, result: duplicate }));
  assert.equal(instability.code, "entity-period-instability");
  assertSafeMessage(instability);

  const nonfinite = structuredClone(fixture.result);
  nonfinite.set.points[0].SVD1 = Number.NaN;
  const coordinate = caught(() => derive({ ...fixture, result: nonfinite }));
  assert.equal(coordinate.code, "nonfinite-coordinate");
  assertSafeMessage(coordinate);
});
