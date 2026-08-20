import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { analyzeDataset } from "../lib/open-ena/analyze";
import { buildPairwiseGroupContrast } from "../lib/open-ena/contrasts";
import { parseCsv } from "../lib/open-ena/csv";
import {
  buildAnalysisBundle,
  parseOpenEnaAnalysisBundle,
} from "../lib/open-ena/export";
import {
  assertOpenEnaInferenceBindingV2,
  flattenOpenEnaInferenceRows,
  parseOpenEnaInferenceResultV2,
} from "../lib/open-ena/inference-consumers";
import {
  runOpenEnaInferenceV2,
  type OpenEnaInferenceRequestV2,
  type OpenEnaInferenceResultV2,
} from "../lib/open-ena/inference-v2";
import {
  buildLongitudinalDerivation,
  buildLongitudinalGroupCentroidExport,
  longitudinalInferenceRowsToCsv,
  longitudinalPeriodRowsToCsv,
} from "../lib/open-ena/longitudinal";
import { buildMethodsReport } from "../lib/open-ena/methods";
import { parseRotationReference } from "../lib/open-ena/reference";
import {
  SAMPLE_CONFIG,
  type OpenEnaConfig,
  type OpenEnaResult,
  type ParsedDataset,
} from "../lib/open-ena/types";

const HASH = "d".repeat(64);
const HASH_KIND = "normalized-utf8-csv-text-sha256" as const;
const ANALYZED_AT = "2026-08-21T12:34:56.000Z";

function bindResult(result: OpenEnaResult, configuration: OpenEnaConfig): OpenEnaResult {
  return {
    ...result,
    analyzedAt: ANALYZED_AT,
    provenanceBinding: {
      datasetNormalizedUtf8TextSha256: HASH,
      datasetHashKind: HASH_KIND,
      configuration: structuredClone(configuration),
    },
  };
}

function endpointFixture() {
  const dataset = parseCsv([
    "unit,conversation,group,A,B,C",
    "p1,c1,Primary,1,1,0",
    "p2,c2,Primary,1,0,1",
    "p3,c3,Primary,1,1,1",
    "s1,c4,Secondary,0,1,1",
    "s2,c5,Secondary,1,1,1",
    "s3,c6,Secondary,0,1,0",
  ].join("\n") + "\n", { name: "endpoint-v2.csv", source: "upload" });
  const configuration: OpenEnaConfig = {
    ...SAMPLE_CONFIG,
    unitColumns: ["unit"],
    conversationColumns: ["conversation"],
    groupColumn: "group",
    codes: ["A", "B", "C"],
    model: "EndPoint",
    window: "Conversation",
  };
  const result = bindResult(analyzeDataset(dataset, configuration), configuration);
  const axes = result.dimensions.slice(0, 2) as [string, string];
  return { dataset, configuration, result, axes };
}

function trajectoryFixture() {
  const rows = ["Group,Name,Period,A,B,C"];
  for (const group of ["Control", "Experimental"] as const) {
    for (let entity = 1; entity <= 4; entity += 1) {
      for (let period = 1; period <= 3; period += 1) {
        const first = (entity + period + (group === "Experimental" ? 1 : 0)) % 2;
        const second = (entity * period + 1) % 2;
        const third = (entity + 2 * period) % 2;
        rows.push(`${group},${group[0]}${entity},T${period},${first},${second},${third}`);
      }
    }
  }
  const dataset = parseCsv(rows.join("\n") + "\n", {
    name: "trajectory-v2.csv",
    source: "upload",
  });
  const configuration: OpenEnaConfig = {
    ...SAMPLE_CONFIG,
    unitColumns: ["Group", "Name"],
    conversationColumns: ["Period"],
    groupColumn: "Group",
    codes: ["A", "B", "C"],
    model: "SeparateTrajectory",
    window: "Conversation",
  };
  const result = bindResult(analyzeDataset(dataset, configuration), configuration);
  const axes = result.dimensions.slice(0, 2) as [string, string];
  const derivation = buildLongitudinalDerivation(result, configuration, dataset, {
    repeatedEntityColumns: ["Group", "Name"],
    identityConfirmed: true,
    timeColumn: "Period",
    timeOrder: ["T1", "T2", "T3"],
    cohortPolicy: "available",
    axes,
    datasetNormalizedUtf8TextSha256: HASH,
  }, ANALYZED_AT);
  return { dataset, configuration, result, axes, derivation };
}

async function runInference(
  fixture: ReturnType<typeof endpointFixture> | ReturnType<typeof trajectoryFixture>,
  request: OpenEnaInferenceRequestV2,
) {
  return runOpenEnaInferenceV2({
    request,
    result: fixture.result,
    currentBinding: {
      datasetNormalizedUtf8TextSha256: HASH,
      datasetHashKind: HASH_KIND,
      configuration: fixture.configuration,
    },
    ...("derivation" in fixture
      ? { comparisonFrame: fixture.derivation.comparisonFrame }
      : {}),
  });
}

async function allInferenceFixtures() {
  const endpoint = endpointFixture();
  const trajectory = trajectoryFixture();
  const endpointInference = await runInference(endpoint, {
    kind: "endpoint-independent",
    primaryGroup: "Primary",
    secondaryGroup: "Secondary",
    axes: endpoint.axes,
  });
  const independentInference = await runInference(trajectory, {
    kind: "trajectory-independent-period",
    repeatedEntityColumns: ["Group", "Name"],
    timeColumn: "Period",
    period: "T1",
    primaryGroup: "Control",
    secondaryGroup: "Experimental",
    axes: trajectory.axes,
  });
  const pairedInference = await runInference(trajectory, {
    kind: "trajectory-paired-periods",
    repeatedEntityColumns: ["Group", "Name"],
    timeColumn: "Period",
    group: "Control",
    earlierPeriod: "T1",
    laterPeriod: "T2",
    axes: trajectory.axes,
    cohortPolicy: "pairwise-complete",
  });
  const repeatedInference = await runInference(trajectory, {
    kind: "trajectory-repeated-periods",
    repeatedEntityColumns: ["Group", "Name"],
    timeColumn: "Period",
    group: "Control",
    periods: ["T1", "T2", "T3"],
    axes: trajectory.axes,
    cohortPolicy: "all-period-complete",
    posthocContrasts: "all-period-pairs",
  });
  return {
    endpoint,
    trajectory,
    endpointInference,
    independentInference,
    pairedInference,
    repeatedInference,
  };
}

function expectedBinding(
  fixture: ReturnType<typeof endpointFixture> | ReturnType<typeof trajectoryFixture>,
) {
  return {
    analyzedAt: ANALYZED_AT,
    datasetNormalizedUtf8TextSha256: HASH,
    datasetHashKind: HASH_KIND,
    modelType: fixture.configuration.model,
    configuration: fixture.configuration,
    axes: fixture.axes,
  } as const;
}

test("consumer binding guard fails closed and aggregate flattening contains no individual evidence", async () => {
  const { endpoint, endpointInference, repeatedInference } = await allInferenceFixtures();
  assert.doesNotThrow(() => assertOpenEnaInferenceBindingV2(
    endpointInference,
    expectedBinding(endpoint),
  ));
  assert.throws(
    () => assertOpenEnaInferenceBindingV2(endpointInference, {
      ...expectedBinding(endpoint),
      datasetNormalizedUtf8TextSha256: "e".repeat(64),
    }),
    /inference consumer binding mismatch/i,
  );

  const rows = flattenOpenEnaInferenceRows(repeatedInference);
  assert.equal(rows.length, 8);
  assert.deepEqual(rows.map((row) => row.rowRole), [
    "omnibus", "omnibus",
    "posthoc", "posthoc", "posthoc", "posthoc", "posthoc", "posthoc",
  ]);
  assert.ok(rows.every((row) => row.familySizePlanned === (row.test === "friedman" ? 2 : 6)));
  const keys = new Set(rows.flatMap((row) => Object.keys(row)));
  for (const forbidden of ["entityToken", "entityId", "points", "pairs", "blocks", "differences"]) {
    assert.equal(keys.has(forbidden), false);
  }
  const parsed = parseOpenEnaInferenceResultV2(JSON.parse(JSON.stringify(repeatedInference)));
  assert.deepEqual(parsed, repeatedInference);
  assert.equal(Object.isFrozen(parsed), true);
});

test("analysis bundle v2 preserves one supplied frozen inference authority and reads v1/v2 strictly", async () => {
  const { endpoint, endpointInference } = await allInferenceFixtures();
  const contrast = buildPairwiseGroupContrast(
    endpoint.result,
    endpoint.configuration,
    "Primary",
    "Secondary",
    endpoint.axes,
    ANALYZED_AT,
  );
  const bundle = buildAnalysisBundle(
    endpoint.dataset,
    endpoint.configuration,
    endpoint.result,
    HASH,
    { groupContrast: contrast, inference: endpointInference },
  );
  assert.equal(bundle.schemaVersion, 2);
  assert.strictEqual(bundle.inference, endpointInference);
  assert.equal(bundle.groupContrast?.inference, null);
  assert.equal(bundle.groupContrast?.inferenceAuthority, "top-level-inference-v2");
  assert.match(bundle.groupContrast?.compatibilityNotice ?? "", /non-authoritative/i);
  assert.doesNotMatch(
    JSON.stringify(bundle.groupContrast),
    /"multiplicityCorrection":"none"|no multiplicity correction/i,
  );

  const parsedV2 = parseOpenEnaAnalysisBundle(JSON.stringify(bundle));
  assert.equal(parsedV2.schemaVersion, 2);
  assert.deepEqual(parsedV2, JSON.parse(JSON.stringify(bundle)));
  assert.ok(parsedV2.inference === null || Object.isFrozen(parsedV2.inference));

  const v1 = structuredClone(bundle) as Record<string, unknown>;
  v1.schemaVersion = 1;
  delete v1.inference;
  const parsedV1 = parseOpenEnaAnalysisBundle(JSON.stringify(v1));
  assert.equal(parsedV1.schemaVersion, 1);
  assert.equal("inference" in parsedV1, false, "v1 must not be upgraded by fabricating v2 inference");

  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify({ ...bundle, unexpected: true })),
    /unsupported analysis bundle field/i,
  );
  const nestedUnknown = structuredClone(bundle) as Record<string, unknown>;
  assert.ok(nestedUnknown.inference && typeof nestedUnknown.inference === "object");
  (nestedUnknown.inference as { scope: Record<string, unknown> }).scope.participants = ["must-not-pass"];
  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(nestedUnknown)),
    /inference scope contains an unsupported field/i,
  );
  const staleBundle = structuredClone(bundle);
  staleBundle.manifest.result.analyzedAt = "2026-08-21T12:34:57.000Z";
  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(staleBundle)),
    /inference consumer binding mismatch/i,
  );
  const missingInference = structuredClone(bundle) as Record<string, unknown>;
  delete missingInference.inference;
  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(missingInference)),
    /v2.*inference/i,
  );
  assert.throws(
    () => buildAnalysisBundle(endpoint.dataset, endpoint.configuration, endpoint.result, "e".repeat(64), {
      inference: endpointInference,
    }),
    /inference consumer binding mismatch/i,
  );
});

test("Methods escapes hostile inference labels without losing exact supplied values", async () => {
  const primary = "`Primary\r\n\n## Fabricated result|";
  const secondary = "`Secondary\t|";
  const csvField = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const dataset = parseCsv([
    "unit,conversation,group,A,B,C",
    `p1,c1,${csvField(primary)},1,1,0`,
    `p2,c2,${csvField(primary)},1,0,1`,
    `p3,c3,${csvField(primary)},1,1,1`,
    `s1,c4,${csvField(secondary)},0,1,1`,
    `s2,c5,${csvField(secondary)},1,1,1`,
    `s3,c6,${csvField(secondary)},0,1,0`,
  ].join("\n") + "\n", { name: "hostile-inference.csv", source: "upload" });
  const configuration: OpenEnaConfig = {
    ...SAMPLE_CONFIG,
    unitColumns: ["unit"],
    conversationColumns: ["conversation"],
    groupColumn: "group",
    codes: ["A", "B", "C"],
    model: "EndPoint",
    window: "Conversation",
  };
  const result = bindResult(analyzeDataset(dataset, configuration), configuration);
  const axes = result.dimensions.slice(0, 2) as [string, string];
  const inference = await runInference({ dataset, configuration, result, axes }, {
    kind: "endpoint-independent",
    primaryGroup: primary,
    secondaryGroup: secondary,
    axes,
  });
  const report = buildMethodsReport(dataset, configuration, result, HASH, axes, {}, inference);
  assert.doesNotMatch(report, /^## Fabricated result(?:\s|$)/m);
  assert.doesNotMatch(report, /\r|\t/);
  const rawP = flattenOpenEnaInferenceRows(inference).find((row) => row.pRaw !== null)?.pRaw;
  assert.ok(rawP !== null && rawP !== undefined);
  assert.ok(report.includes(String(rawP)));
});

test("reference convenience import accepts outer result-bundle v2 while keeping reference schema v1", async () => {
  const { endpoint, endpointInference } = await allInferenceFixtures();
  const bundle = buildAnalysisBundle(
    endpoint.dataset,
    endpoint.configuration,
    endpoint.result,
    HASH,
    { inference: endpointInference },
  );
  const reference = parseRotationReference(JSON.stringify(bundle), "v2-results.json");
  assert.equal(reference.schemaVersion, 1);
  assert.deepEqual(reference.rotationSet.codes, endpoint.configuration.codes);
  assert.equal(reference.source.normalizedUtf8TextSha256, HASH);
});

test("Methods consumes the supplied inference without recomputation for all four designs", async () => {
  const fixtures = await allInferenceFixtures();
  const noRun = buildMethodsReport(
    fixtures.endpoint.dataset,
    fixtures.endpoint.configuration,
    fixtures.endpoint.result,
    HASH,
    fixtures.endpoint.axes,
  );
  assert.match(noRun, /No researcher-confirmed inferential comparison was run/i);
  assert.doesNotMatch(noRun, /\| Mann–Whitney U \|/);

  const cases: Array<{
    fixture: typeof fixtures.endpoint | typeof fixtures.trajectory;
    inference: OpenEnaInferenceResultV2;
    expected: RegExp[];
  }> = [
    {
      fixture: fixtures.endpoint,
      inference: fixtures.endpointInference,
      expected: [/Independent endpoint groups/i, /Mann–Whitney U/, /endpoint common period.*not verified/i],
    },
    {
      fixture: fixtures.trajectory,
      inference: fixtures.independentInference,
      expected: [/Independent groups at one period/i, /Mann–Whitney U/, /T1/],
    },
    {
      fixture: fixtures.trajectory,
      inference: fixtures.pairedInference,
      expected: [/Paired periods/i, /Wilcoxon signed-rank/, /later minus earlier/i, /pairwise-complete/],
    },
    {
      fixture: fixtures.trajectory,
      inference: fixtures.repeatedInference,
      expected: [/Repeated periods/i, /Friedman/, /Wilcoxon signed-rank follow-up/i, /all-period-complete/],
    },
  ];
  for (const { fixture, inference, expected } of cases) {
    const report = buildMethodsReport(
      fixture.dataset,
      fixture.configuration,
      fixture.result,
      HASH,
      fixture.axes,
      {},
      inference,
    );
    for (const pattern of expected) assert.match(report, pattern);
    assert.match(report, /Holm-adjusted p/i);
    assert.match(report, /12 significant digits/i);
    assert.match(report, /unflipped model coordinate system/i);
    assert.match(report, /cluster independence.*unverified/i);
    assert.match(report, /(?:does|do) not establish causality/i);
    const firstRaw = flattenOpenEnaInferenceRows(inference).find((row) => row.pRaw !== null)?.pRaw;
    if (firstRaw !== undefined && firstRaw !== null) {
      assert.match(report, new RegExp(String(firstRaw).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  }
});

test("longitudinal JSON v2 and the separate inference CSV preserve aggregates only", async () => {
  const { trajectory, pairedInference } = await allInferenceFixtures();
  const exported = buildLongitudinalGroupCentroidExport(
    trajectory.derivation.view,
    undefined,
    pairedInference,
  );
  assert.equal(exported.schemaVersion, 2);
  assert.deepEqual(exported.settings.repeatedEntityColumns, ["Group", "Name"]);
  assert.equal("repeatedEntityColumn" in exported.settings, false);
  assert.strictEqual(exported.inference, pairedInference);
  assert.deepEqual(exported.inferenceDiagnostics?.ledger, pairedInference.ledger);
  assert.deepEqual(exported.privacy, {
    rawSourceRowsIncluded: false,
    entityTokensIncluded: false,
    entityValuesIncluded: false,
    pairedDifferencesIncluded: false,
    entityPeriodCoordinatesIncluded: false,
    note: "The derived export contains aggregate group-period geometry and aggregate inference only; it excludes repeated-entity values, opaque tokens, paired differences, entity-period coordinates, and raw source rows.",
  });
  const serialized = JSON.stringify(exported);
  assert.doesNotMatch(serialized, /open-ena-entity-|"entityToken"|"entityPeriods"/i);

  const geometryCsv = longitudinalPeriodRowsToCsv(trajectory.derivation.view);
  const geometryHeader = geometryCsv.split("\r\n")[0];
  assert.match(geometryHeader, /repeatedEntityColumnsJson/);
  assert.doesNotMatch(geometryHeader, /(?:^|,)repeatedEntityColumn(?:,|$)/);
  assert.doesNotMatch(geometryHeader, /pRaw|pHolm|familyId|memberId/);

  const inferenceCsv = longitudinalInferenceRowsToCsv(pairedInference);
  const inferenceHeader = inferenceCsv.split("\r\n")[0];
  assert.match(inferenceHeader, /test,axisIndex,axis,status,reason/);
  assert.match(inferenceHeader, /familyId,memberId,familySizePlanned/);
  assert.match(inferenceHeader, /pRaw,pHolm/);
  assert.match(inferenceHeader, /nMatched,nMissing,nPositive,nNegative,nZero,nNonzero/);
  assert.match(inferenceHeader, /wPositive,wNegative,t,z,rankBiserialLaterVsEarlier/);
  assert.doesNotMatch(inferenceCsv, /entityToken|entityId|Control,Name|open-ena-entity-/i);
});

test("consumer surfaces do not import or invoke low-level rank engines", () => {
  const root = process.cwd();
  for (const relativePath of [
    "lib/open-ena/inference-consumers.ts",
    "lib/open-ena/export.ts",
    "lib/open-ena/methods.ts",
  ]) {
    const source = readFileSync(join(root, relativePath), "utf8");
    assert.doesNotMatch(source, /from ["'].\/(?:rank-inference|inference)["']/);
    assert.doesNotMatch(source, /buildEndpointMannWhitney|mannWhitneyRankTest|wilcoxonSignedRankTest|friedmanRankTest/);
  }
});
