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

function trajectoryFixture(periodCount = 3) {
  const rows = ["Group,Name,Period,A,B,C"];
  for (const group of ["Control", "Experimental"] as const) {
    for (let entity = 1; entity <= 4; entity += 1) {
      for (let period = 1; period <= periodCount; period += 1) {
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
    timeOrder: Array.from({ length: periodCount }, (_, index) => `T${index + 1}`),
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
  const {
    endpoint,
    trajectory,
    endpointInference,
    independentInference,
    pairedInference,
    repeatedInference,
  } = await allInferenceFixtures();
  assert.equal(endpointInference.binding.trajectoryMapping, null);
  assert.deepEqual(repeatedInference.binding.trajectoryMapping, {
    contractVersion: 1,
    repeatedEntityColumns: ["Group", "Name"],
    identityConfirmed: true,
    timeColumn: "Period",
    timeOrder: ["T1", "T2", "T3"],
  });
  assert.doesNotThrow(() => assertOpenEnaInferenceBindingV2(
    endpointInference,
    expectedBinding(endpoint),
  ));
  assert.doesNotThrow(() => assertOpenEnaInferenceBindingV2(
    repeatedInference,
    {
      ...expectedBinding(trajectory),
      trajectoryMapping: {
        contractVersion: 1,
        repeatedEntityColumns: ["Group", "Name"],
        identityConfirmed: true,
        timeColumn: "Period",
        timeOrder: ["T1", "T2", "T3"],
      },
    },
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
  for (const inference of [
    endpointInference,
    independentInference,
    pairedInference,
    repeatedInference,
  ]) {
    const parsed = parseOpenEnaInferenceResultV2(JSON.parse(JSON.stringify(inference)));
    assert.deepEqual(parsed, inference);
    assert.equal(Object.isFrozen(parsed), true);
    assert.equal(Object.isFrozen(parsed.binding.trajectoryMapping), true);
  }

  const missingMapping = structuredClone(endpointInference) as unknown as {
    binding: Record<string, unknown>;
  };
  delete missingMapping.binding.trajectoryMapping;
  assert.throws(
    () => parseOpenEnaInferenceResultV2(missingMapping),
    /inference binding/i,
  );

  const endpointWithMapping = structuredClone(endpointInference);
  endpointWithMapping.binding.trajectoryMapping = structuredClone(
    repeatedInference.binding.trajectoryMapping,
  );
  assert.throws(
    () => parseOpenEnaInferenceResultV2(endpointWithMapping),
    /inference trajectory mapping.*(?:invalid|inconsistent)|binding and rows.*inconsistent/i,
  );

  for (const mutate of [
    (mapping: Record<string, unknown>) => { mapping.contractVersion = 2; },
    (mapping: Record<string, unknown>) => { mapping.identityConfirmed = false; },
    (mapping: Record<string, unknown>) => { mapping.repeatedEntityColumns = ["Group"]; },
    (mapping: Record<string, unknown>) => { mapping.timeColumn = "Wrong period field"; },
  ]) {
    const malformed = structuredClone(repeatedInference) as unknown as {
      binding: { trajectoryMapping: Record<string, unknown> };
    };
    mutate(malformed.binding.trajectoryMapping);
    assert.throws(
      () => parseOpenEnaInferenceResultV2(malformed),
      /trajectory mapping|binding and rows.*inconsistent/i,
    );
  }

  const forgedSingularIdentity = structuredClone(repeatedInference) as unknown as {
    request: { repeatedEntityColumns: string[] };
    binding: { trajectoryMapping: { repeatedEntityColumns: string[] } };
  };
  forgedSingularIdentity.request.repeatedEntityColumns = ["Group"];
  forgedSingularIdentity.binding.trajectoryMapping.repeatedEntityColumns = ["Group"];
  assert.throws(
    () => parseOpenEnaInferenceResultV2(forgedSingularIdentity),
    /trajectory mapping|binding/i,
  );

  const forgedTimeField = structuredClone(repeatedInference) as unknown as {
    request: { timeColumn: string };
    binding: { trajectoryMapping: { timeColumn: string } };
    scope: { timeColumn: string };
  };
  forgedTimeField.request.timeColumn = "Wrong period field";
  forgedTimeField.binding.trajectoryMapping.timeColumn = "Wrong period field";
  forgedTimeField.scope.timeColumn = "Wrong period field";
  assert.throws(
    () => parseOpenEnaInferenceResultV2(forgedTimeField),
    /trajectory mapping|binding/i,
  );
});

test("analysis bundle v2 preserves one supplied frozen inference authority and reads v1/v2 strictly", async () => {
  const { endpoint, trajectory, endpointInference, repeatedInference } = await allInferenceFixtures();
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

  const trajectoryBundle = buildAnalysisBundle(
    trajectory.dataset,
    trajectory.configuration,
    trajectory.result,
    HASH,
    { methodsDimensions: trajectory.axes, inference: repeatedInference },
  );
  assert.strictEqual(trajectoryBundle.inference, repeatedInference);
  assert.deepEqual(
    trajectoryBundle.inference?.binding.trajectoryMapping,
    repeatedInference.binding.trajectoryMapping,
  );
  const parsedTrajectoryBundle = parseOpenEnaAnalysisBundle(JSON.stringify(trajectoryBundle));
  assert.equal(parsedTrajectoryBundle.schemaVersion, 2);
  if (parsedTrajectoryBundle.schemaVersion !== 2) assert.fail("expected schema v2");
  assert.deepEqual(
    parsedTrajectoryBundle.inference?.binding.trajectoryMapping,
    repeatedInference.binding.trajectoryMapping,
  );
});

test("strict inference and bundle readers reject a duplicate row for one planned member", async () => {
  const { endpoint, endpointInference } = await allInferenceFixtures();
  const duplicated = structuredClone(endpointInference);
  if (duplicated.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
  duplicated.rows.push(structuredClone(duplicated.rows[0]));
  const bundle = buildAnalysisBundle(
    endpoint.dataset,
    endpoint.configuration,
    endpoint.result,
    HASH,
    { inference: endpointInference },
  );
  const forgedBundle = structuredClone(bundle);
  forgedBundle.inference = duplicated;

  assert.throws(
    () => parseOpenEnaInferenceResultV2(duplicated),
    /duplicate|planned member|cardinality/i,
  );
  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(forgedBundle)),
    /duplicate|planned member|cardinality/i,
  );
});

test("strict readers reject missing, extra, duplicate-member, and wrong-role comparison plans", async () => {
  const { endpoint, endpointInference } = await allInferenceFixtures();
  const validBundle = buildAnalysisBundle(
    endpoint.dataset,
    endpoint.configuration,
    endpoint.result,
    HASH,
    { inference: endpointInference },
  );
  const variants: Array<{ label: string; inference: typeof endpointInference }> = [];

  const missing = structuredClone(endpointInference);
  if (missing.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
  missing.rows.pop();
  variants.push({ label: "missing row", inference: missing });

  const extra = structuredClone(endpointInference);
  if (extra.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
  const extraMemberId = `openena-member-v2-${"f".repeat(64)}`;
  extra.rows.push({ ...structuredClone(extra.rows[0]), memberId: extraMemberId });
  extra.families[0].memberIds.push(extraMemberId);
  extra.families[0].familySizePlanned = 3;
  extra.rows.forEach((row) => { row.familySizePlanned = 3; });
  variants.push({ label: "extra row", inference: extra });

  const duplicateMember = structuredClone(endpointInference);
  if (duplicateMember.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
  duplicateMember.rows[1].memberId = duplicateMember.rows[0].memberId;
  variants.push({ label: "duplicate member", inference: duplicateMember });

  const wrongRole = structuredClone(endpointInference);
  wrongRole.families[0].role = "omnibus";
  variants.push({ label: "wrong family role", inference: wrongRole });

  for (const { label, inference } of variants) {
    assert.throws(
      () => parseOpenEnaInferenceResultV2(inference),
      /duplicate|member|family|axis|cardinality|role/i,
      `${label} standalone`,
    );
    const bundle = structuredClone(validBundle);
    bundle.inference = inference;
    assert.throws(
      () => parseOpenEnaAnalysisBundle(JSON.stringify(bundle)),
      /duplicate|member|family|axis|cardinality|role/i,
      `${label} bundle`,
    );
  }
});

test("strict readers require one comparison row for each bound axis", async () => {
  const { endpoint, endpointInference } = await allInferenceFixtures();
  const duplicatedAxis = structuredClone(endpointInference);
  if (duplicatedAxis.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
  duplicatedAxis.rows[1].axisIndex = 0;
  duplicatedAxis.rows[1].axis = duplicatedAxis.request.axes[0];
  const bundle = buildAnalysisBundle(
    endpoint.dataset,
    endpoint.configuration,
    endpoint.result,
    HASH,
    { inference: endpointInference },
  );
  const forgedBundle = structuredClone(bundle);
  forgedBundle.inference = duplicatedAxis;

  assert.throws(
    () => parseOpenEnaInferenceResultV2(duplicatedAxis),
    /axis|cardinality|planned member/i,
  );
  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(forgedBundle)),
    /axis|cardinality|planned member/i,
  );
});

test("strict readers require one exact two-member comparison family", async () => {
  const { endpoint, endpointInference } = await allInferenceFixtures();
  const splitFamily = structuredClone(endpointInference);
  if (splitFamily.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
  const original = splitFamily.families[0];
  const secondFamilyId = `openena-family-v2-${"e".repeat(64)}`;
  splitFamily.families = [
    {
      ...original,
      familySizePlanned: 1,
      memberIds: [splitFamily.rows[0].memberId],
    },
    {
      ...original,
      familyId: secondFamilyId,
      familySizePlanned: 1,
      memberIds: [splitFamily.rows[1].memberId],
    },
  ];
  splitFamily.rows[0].familySizePlanned = 1;
  splitFamily.rows[1].familyId = secondFamilyId;
  splitFamily.rows[1].familySizePlanned = 1;
  const bundle = buildAnalysisBundle(
    endpoint.dataset,
    endpoint.configuration,
    endpoint.result,
    HASH,
    { inference: endpointInference },
  );
  const forgedBundle = structuredClone(bundle);
  forgedBundle.inference = splitFamily;

  assert.throws(
    () => parseOpenEnaInferenceResultV2(splitFamily),
    /comparison family|planned family|cardinality/i,
  );
  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(forgedBundle)),
    /comparison family|planned family|cardinality/i,
  );
});

test("strict readers require one Friedman omnibus row for each bound axis", async () => {
  const { trajectory, repeatedInference } = await allInferenceFixtures();
  const missingOmnibus = structuredClone(repeatedInference);
  if (missingOmnibus.kind !== "trajectory-repeated-periods") {
    assert.fail("expected repeated-period inference");
  }
  const removed = missingOmnibus.omnibusRows.pop();
  assert.ok(removed);
  const family = missingOmnibus.families.find((candidate) => candidate.role === "omnibus");
  assert.ok(family);
  family.memberIds = family.memberIds.filter((memberId) => memberId !== removed.memberId);
  family.familySizePlanned = family.memberIds.length;
  missingOmnibus.omnibusRows.forEach((row) => {
    row.familySizePlanned = family.familySizePlanned;
  });
  const bundle = buildAnalysisBundle(
    trajectory.dataset,
    trajectory.configuration,
    trajectory.result,
    HASH,
    { methodsDimensions: trajectory.axes, inference: repeatedInference },
  );
  const forgedBundle = structuredClone(bundle);
  forgedBundle.inference = missingOmnibus;

  assert.throws(
    () => parseOpenEnaInferenceResultV2(missingOmnibus),
    /Friedman|omnibus|axis|cardinality/i,
  );
  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(forgedBundle)),
    /Friedman|omnibus|axis|cardinality/i,
  );
});

test("strict readers require every selected axis by all-period-pairs Wilcoxon follow-up", async () => {
  const { trajectory, repeatedInference } = await allInferenceFixtures();
  const missingFollowup = structuredClone(repeatedInference);
  if (missingFollowup.kind !== "trajectory-repeated-periods") {
    assert.fail("expected repeated-period inference");
  }
  const removed = missingFollowup.followupRows.pop();
  assert.ok(removed);
  const family = missingFollowup.families.find((candidate) => candidate.role === "posthoc");
  assert.ok(family);
  family.memberIds = family.memberIds.filter((memberId) => memberId !== removed.memberId);
  family.familySizePlanned = family.memberIds.length;
  missingFollowup.followupRows.forEach((row) => {
    row.familySizePlanned = family.familySizePlanned;
  });
  const bundle = buildAnalysisBundle(
    trajectory.dataset,
    trajectory.configuration,
    trajectory.result,
    HASH,
    { methodsDimensions: trajectory.axes, inference: repeatedInference },
  );
  const forgedBundle = structuredClone(bundle);
  forgedBundle.inference = missingFollowup;

  assert.throws(
    () => parseOpenEnaInferenceResultV2(missingFollowup),
    /Wilcoxon|follow-up|period pair|cardinality/i,
  );
  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(forgedBundle)),
    /Wilcoxon|follow-up|period pair|cardinality/i,
  );
});

test("strict readers reject a nonnumeric window even when inference and manifest agree", async () => {
  const { endpoint, endpointInference } = await allInferenceFixtures();
  const malformed = structuredClone(endpointInference) as unknown as {
    binding: { configuration: Record<string, unknown> };
  };
  malformed.binding.configuration.windowSizeBack = "bad";
  const bundle = buildAnalysisBundle(
    endpoint.dataset,
    endpoint.configuration,
    endpoint.result,
    HASH,
    { inference: endpointInference },
  ) as unknown as {
    inference: unknown;
    manifest: { configuration: Record<string, unknown> };
  };
  bundle.inference = malformed;
  bundle.manifest.configuration.windowSizeBack = "bad";

  assert.throws(
    () => parseOpenEnaInferenceResultV2(malformed),
    /configuration|backward window|windowSizeBack/i,
  );
  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(bundle)),
    /configuration|backward window|windowSizeBack/i,
  );
});

test("strict readers bound both window sizes to safe integers from zero through one hundred", async () => {
  const { endpoint, endpointInference } = await allInferenceFixtures();
  const validBundle = buildAnalysisBundle(
    endpoint.dataset,
    endpoint.configuration,
    endpoint.result,
    HASH,
    { inference: endpointInference },
  );
  for (const field of ["windowSizeBack", "windowSizeForward"] as const) {
    for (const invalid of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
      -1,
      101,
    ]) {
      const malformed = structuredClone(endpointInference) as unknown as {
        binding: { configuration: Record<string, unknown> };
      };
      malformed.binding.configuration[field] = invalid;
      const bundle = structuredClone(validBundle) as unknown as {
        inference: unknown;
        manifest: { configuration: Record<string, unknown> };
      };
      bundle.inference = malformed;
      bundle.manifest.configuration[field] = invalid;

      assert.throws(
        () => parseOpenEnaInferenceResultV2(malformed),
        /window|safe integer|configuration/i,
        `${field}=${String(invalid)} standalone`,
      );
      assert.throws(
        () => parseOpenEnaAnalysisBundle(JSON.stringify(bundle)),
        /window|safe integer|configuration/i,
        `${field}=${String(invalid)} bundle`,
      );
    }
  }
});

test("strict readers enforce closed configuration enums and reference-rotation identity", async () => {
  const { endpoint, endpointInference } = await allInferenceFixtures();
  const validBundle = buildAnalysisBundle(
    endpoint.dataset,
    endpoint.configuration,
    endpoint.result,
    HASH,
    { inference: endpointInference },
  );
  const mutations: Array<(configuration: Record<string, unknown>) => void> = [
    (configuration) => { configuration.model = "Endpoint"; },
    (configuration) => { configuration.window = "SlidingWindow"; },
    (configuration) => { configuration.weightBy = "average"; },
    (configuration) => { configuration.rotation = "wilcoxon"; },
    (configuration) => { configuration.referenceRotationId = 42; },
    (configuration) => {
      configuration.rotation = "reference";
      configuration.referenceRotationId = null;
    },
    (configuration) => { configuration.referenceRotationId = "stale-reference"; },
  ];
  for (const mutate of mutations) {
    const malformed = structuredClone(endpointInference) as unknown as {
      binding: { configuration: Record<string, unknown> };
    };
    mutate(malformed.binding.configuration);
    const bundle = structuredClone(validBundle) as unknown as {
      inference: unknown;
      manifest: { configuration: Record<string, unknown> };
    };
    bundle.inference = malformed;
    mutate(bundle.manifest.configuration);

    assert.throws(
      () => parseOpenEnaInferenceResultV2(malformed),
      /configuration|binding|model|window|weight|rotation|reference/i,
    );
    assert.throws(
      () => parseOpenEnaAnalysisBundle(JSON.stringify(bundle)),
      /configuration|binding|model|window|weight|rotation|reference/i,
    );
  }
});

test("strict readers reject duplicate unit, conversation, and code configuration arrays", async () => {
  const { endpoint, endpointInference } = await allInferenceFixtures();
  const validBundle = buildAnalysisBundle(
    endpoint.dataset,
    endpoint.configuration,
    endpoint.result,
    HASH,
    { inference: endpointInference },
  );
  for (const field of ["unitColumns", "conversationColumns", "codes"] as const) {
    const malformed = structuredClone(endpointInference) as unknown as {
      binding: { configuration: Record<string, unknown> };
    };
    const original = malformed.binding.configuration[field] as string[];
    malformed.binding.configuration[field] = [original[0], original[0]];
    const bundle = structuredClone(validBundle) as unknown as {
      inference: unknown;
      manifest: { configuration: Record<string, unknown> };
    };
    bundle.inference = malformed;
    bundle.manifest.configuration[field] = [original[0], original[0]];

    assert.throws(
      () => parseOpenEnaInferenceResultV2(malformed),
      /configuration|columns|unique|duplicate/i,
      `${field} standalone`,
    );
    assert.throws(
      () => parseOpenEnaAnalysisBundle(JSON.stringify(bundle)),
      /configuration|columns|unique|duplicate/i,
      `${field} bundle`,
    );
  }
});

test("strict readers bound configuration identity arrays and code arrays", async () => {
  const { endpoint, endpointInference } = await allInferenceFixtures();
  const validBundle = buildAnalysisBundle(
    endpoint.dataset,
    endpoint.configuration,
    endpoint.result,
    HASH,
    { inference: endpointInference },
  );
  const cases = [
    { field: "unitColumns", values: Array.from({ length: 257 }, (_, index) => `unit-${index}`) },
    { field: "conversationColumns", values: Array.from({ length: 257 }, (_, index) => `conversation-${index}`) },
    { field: "codes", values: Array.from({ length: 31 }, (_, index) => `code-${index}`) },
  ] as const;
  for (const { field, values } of cases) {
    const malformed = structuredClone(endpointInference) as unknown as {
      binding: { configuration: Record<string, unknown> };
    };
    malformed.binding.configuration[field] = values;
    const bundle = structuredClone(validBundle) as unknown as {
      inference: unknown;
      manifest: { configuration: Record<string, unknown> };
    };
    bundle.inference = malformed;
    bundle.manifest.configuration[field] = values;

    assert.throws(
      () => parseOpenEnaInferenceResultV2(malformed),
      /columns|configuration|bounded|unique/i,
    );
    assert.throws(
      () => parseOpenEnaAnalysisBundle(JSON.stringify(bundle)),
      /columns|configuration|bounded|unique/i,
    );
  }
});

test("strict readers accept 4096-character axes and reject 4097-character or larger axes", async () => {
  const { endpoint, endpointInference } = await allInferenceFixtures();
  const validBundle = buildAnalysisBundle(
    endpoint.dataset,
    endpoint.configuration,
    endpoint.result,
    HASH,
    { inference: endpointInference },
  );
  const withAxis = (length: number) => {
    const inference = structuredClone(endpointInference);
    if (inference.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
    const axis = "A".repeat(length);
    inference.request.axes[0] = axis;
    inference.binding.axes[0] = axis;
    inference.rows[0].axis = axis;
    return inference;
  };
  const bundleWithAxis = (length: number) => {
    const bundle = structuredClone(validBundle);
    bundle.inference = withAxis(length);
    bundle.presentation.selectedAxes[0] = "A".repeat(length);
    return bundle;
  };

  assert.doesNotThrow(() => parseOpenEnaInferenceResultV2(withAxis(4_096)));
  assert.doesNotThrow(() => parseOpenEnaAnalysisBundle(JSON.stringify(bundleWithAxis(4_096))));
  for (const length of [4_097, 5_000]) {
    assert.throws(
      () => parseOpenEnaInferenceResultV2(withAxis(length)),
      /axis|bounded|string/i,
    );
    assert.throws(
      () => parseOpenEnaAnalysisBundle(JSON.stringify(bundleWithAxis(length))),
      /axis|bounded|string/i,
    );
  }
});

test("strict readers apply the 4096-character boundary to groups, periods, and identity fields", async () => {
  const { endpoint, trajectory, endpointInference, pairedInference } = await allInferenceFixtures();
  const endpointBundle = buildAnalysisBundle(
    endpoint.dataset,
    endpoint.configuration,
    endpoint.result,
    HASH,
    { inference: endpointInference },
  );
  const trajectoryBundle = buildAnalysisBundle(
    trajectory.dataset,
    trajectory.configuration,
    trajectory.result,
    HASH,
    { methodsDimensions: trajectory.axes, inference: pairedInference },
  );
  const cases = [
    {
      label: "group",
      inference(length: number) {
        const value = structuredClone(endpointInference);
        if (value.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
        value.request.primaryGroup = "G".repeat(length);
        value.scope.primaryGroup = value.request.primaryGroup;
        return value;
      },
      bundle(length: number) {
        const value = structuredClone(endpointBundle);
        value.inference = this.inference(length);
        return value;
      },
    },
    {
      label: "period",
      inference(length: number) {
        const value = structuredClone(pairedInference);
        if (value.kind !== "trajectory-paired-periods" || !value.binding.trajectoryMapping) {
          assert.fail("expected mapped paired inference");
        }
        value.request.earlierPeriod = "P".repeat(length);
        value.scope.earlierPeriod = value.request.earlierPeriod;
        value.binding.trajectoryMapping.timeOrder[0] = value.request.earlierPeriod;
        return value;
      },
      bundle(length: number) {
        const value = structuredClone(trajectoryBundle);
        value.inference = this.inference(length);
        return value;
      },
    },
    {
      label: "identity",
      inference(length: number) {
        const value = structuredClone(pairedInference);
        if (value.kind !== "trajectory-paired-periods" || !value.binding.trajectoryMapping) {
          assert.fail("expected mapped paired inference");
        }
        const identity = "I".repeat(length);
        value.request.repeatedEntityColumns[1] = identity;
        value.binding.trajectoryMapping.repeatedEntityColumns[1] = identity;
        value.binding.configuration.unitColumns[1] = identity;
        return value;
      },
      bundle(length: number) {
        const value = structuredClone(trajectoryBundle);
        const inference = this.inference(length);
        value.inference = inference;
        value.manifest.configuration.unitColumns[1] = "I".repeat(length);
        return value;
      },
    },
  ];
  for (const boundary of cases) {
    assert.doesNotThrow(
      () => parseOpenEnaInferenceResultV2(boundary.inference(4_096)),
      `${boundary.label}=4096 standalone`,
    );
    assert.doesNotThrow(
      () => parseOpenEnaAnalysisBundle(JSON.stringify(boundary.bundle(4_096))),
      `${boundary.label}=4096 bundle`,
    );
    assert.throws(
      () => parseOpenEnaInferenceResultV2(boundary.inference(4_097)),
      /bounded|string|group|period|identity|columns|mapping/i,
      `${boundary.label}=4097 standalone`,
    );
    assert.throws(
      () => parseOpenEnaAnalysisBundle(JSON.stringify(boundary.bundle(4_097))),
      /bounded|string|group|period|identity|columns|mapping/i,
      `${boundary.label}=4097 bundle`,
    );
  }
});

test("strict readers reject oversized aggregate arrays before accepting their contents", async () => {
  const { endpoint, endpointInference } = await allInferenceFixtures();
  const oversized = structuredClone(endpointInference);
  oversized.warnings = Array.from({ length: 4_097 }, () => "small-sample");
  const bundle = buildAnalysisBundle(
    endpoint.dataset,
    endpoint.configuration,
    endpoint.result,
    HASH,
    { inference: endpointInference },
  );
  const forgedBundle = structuredClone(bundle);
  forgedBundle.inference = oversized;

  assert.throws(
    () => parseOpenEnaInferenceResultV2(oversized),
    /warnings|array|bounded|too many/i,
  );
  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(forgedBundle)),
    /warnings|array|bounded|too many/i,
  );
});

test("repeated-period parsing rejects an excessive all-pairs plan before pair expansion", async () => {
  const { trajectory, repeatedInference } = await allInferenceFixtures();
  const excessive = structuredClone(repeatedInference);
  if (excessive.kind !== "trajectory-repeated-periods" || !excessive.binding.trajectoryMapping) {
    assert.fail("expected mapped repeated inference");
  }
  const periods = Array.from({ length: 65 }, (_, index) => `P${index + 1}`);
  excessive.request.periods = periods;
  excessive.scope.periods = [...periods];
  excessive.binding.trajectoryMapping.timeOrder = [...periods];
  const bundle = buildAnalysisBundle(
    trajectory.dataset,
    trajectory.configuration,
    trajectory.result,
    HASH,
    { methodsDimensions: trajectory.axes, inference: repeatedInference },
  );
  const forgedBundle = structuredClone(bundle);
  forgedBundle.inference = excessive;

  assert.throws(
    () => parseOpenEnaInferenceResultV2(excessive),
    /bounded aggregate row budget/i,
  );
  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(forgedBundle)),
    /bounded aggregate row budget/i,
  );
});

test("strict readers bind non-disabled inference to a possible model and distinct selections", async () => {
  const {
    endpoint,
    trajectory,
    endpointInference,
    independentInference,
    pairedInference,
  } = await allInferenceFixtures();
  const endpointBundle = buildAnalysisBundle(
    endpoint.dataset,
    endpoint.configuration,
    endpoint.result,
    HASH,
    { inference: endpointInference },
  );
  const trajectoryBundle = buildAnalysisBundle(
    trajectory.dataset,
    trajectory.configuration,
    trajectory.result,
    HASH,
    { methodsDimensions: trajectory.axes, inference: independentInference },
  );

  const endpointWrongModel = structuredClone(endpointInference);
  endpointWrongModel.binding.modelType = "SeparateTrajectory";
  endpointWrongModel.binding.configuration.model = "SeparateTrajectory";
  const endpointWrongModelBundle = structuredClone(endpointBundle);
  endpointWrongModelBundle.inference = endpointWrongModel;
  endpointWrongModelBundle.manifest.result.model = "SeparateTrajectory";
  endpointWrongModelBundle.manifest.configuration.model = "SeparateTrajectory";

  const endpointSameGroup = structuredClone(endpointInference);
  if (endpointSameGroup.kind !== "endpoint-independent") {
    assert.fail("expected endpoint inference");
  }
  endpointSameGroup.request.secondaryGroup = endpointSameGroup.request.primaryGroup;
  endpointSameGroup.scope.secondaryGroup = endpointSameGroup.scope.primaryGroup;
  const endpointSameGroupBundle = structuredClone(endpointBundle);
  endpointSameGroupBundle.inference = endpointSameGroup;

  const periodSameGroup = structuredClone(independentInference);
  if (periodSameGroup.kind !== "trajectory-independent-period") {
    assert.fail("expected independent-period inference");
  }
  periodSameGroup.request.secondaryGroup = periodSameGroup.request.primaryGroup;
  periodSameGroup.scope.secondaryGroup = periodSameGroup.scope.primaryGroup;
  const periodSameGroupBundle = structuredClone(trajectoryBundle);
  periodSameGroupBundle.inference = periodSameGroup;

  const pairedSamePeriod = structuredClone(pairedInference);
  if (pairedSamePeriod.kind !== "trajectory-paired-periods") {
    assert.fail("expected paired-period inference");
  }
  pairedSamePeriod.request.laterPeriod = pairedSamePeriod.request.earlierPeriod;
  pairedSamePeriod.scope.laterPeriod = pairedSamePeriod.scope.earlierPeriod;
  const pairedBundle = buildAnalysisBundle(
    trajectory.dataset,
    trajectory.configuration,
    trajectory.result,
    HASH,
    { methodsDimensions: trajectory.axes, inference: pairedInference },
  );
  const pairedSamePeriodBundle = structuredClone(pairedBundle);
  pairedSamePeriodBundle.inference = pairedSamePeriod;

  for (const { label, inference, bundle } of [
    { label: "endpoint inference with trajectory model", inference: endpointWrongModel, bundle: endpointWrongModelBundle },
    { label: "endpoint inference with identical groups", inference: endpointSameGroup, bundle: endpointSameGroupBundle },
    { label: "one-period inference with identical groups", inference: periodSameGroup, bundle: periodSameGroupBundle },
    { label: "paired inference with identical periods", inference: pairedSamePeriod, bundle: pairedSamePeriodBundle },
  ]) {
    assert.throws(
      () => parseOpenEnaInferenceResultV2(inference),
      /design|model|distinct|groups|periods/i,
      `${label} standalone`,
    );
    assert.throws(
      () => parseOpenEnaAnalysisBundle(JSON.stringify(bundle)),
      /design|model|distinct|groups|periods/i,
      `${label} bundle`,
    );
  }
});

test("strict readers preserve genuine coordinator-disabled design diagnostics", async () => {
  const endpoint = endpointFixture();
  const trajectory = trajectoryFixture();
  const sameGroup = await runInference(endpoint, {
    kind: "endpoint-independent",
    primaryGroup: "Primary",
    secondaryGroup: "Primary",
    axes: endpoint.axes,
  });
  const samePeriod = await runInference(trajectory, {
    kind: "trajectory-paired-periods",
    repeatedEntityColumns: ["Group", "Name"],
    timeColumn: "Period",
    group: "Control",
    earlierPeriod: "T1",
    laterPeriod: "T1",
    axes: trajectory.axes,
    cohortPolicy: "pairwise-complete",
  });
  for (const [fixture, inference] of [
    [endpoint, sameGroup],
    [trajectory, samePeriod],
  ] as const) {
    assert.equal(inference.status, "disabled");
    assert.equal(inference.ledger, null);
    assert.deepEqual(parseOpenEnaInferenceResultV2(structuredClone(inference)), inference);
    const bundle = buildAnalysisBundle(
      fixture.dataset,
      fixture.configuration,
      fixture.result,
      HASH,
      {
        methodsDimensions: fixture.axes,
        inference,
      },
    );
    assert.deepEqual(
      parseOpenEnaAnalysisBundle(JSON.stringify(bundle)).inference,
      inference,
    );
  }
});

test("strict readers bind paired indexes and Friedman metadata to the selected periods", async () => {
  const { trajectory, pairedInference, repeatedInference } = await allInferenceFixtures();
  const pairedBundle = buildAnalysisBundle(
    trajectory.dataset,
    trajectory.configuration,
    trajectory.result,
    HASH,
    { methodsDimensions: trajectory.axes, inference: pairedInference },
  );
  const repeatedBundle = buildAnalysisBundle(
    trajectory.dataset,
    trajectory.configuration,
    trajectory.result,
    HASH,
    { methodsDimensions: trajectory.axes, inference: repeatedInference },
  );

  const wrongPairIndexes = structuredClone(pairedInference);
  if (wrongPairIndexes.kind !== "trajectory-paired-periods") {
    assert.fail("expected paired-period inference");
  }
  wrongPairIndexes.rows.forEach((row) => {
    row.earlierPeriodIndex = 999;
    row.laterPeriodIndex = 1_000;
  });
  const wrongPairIndexesBundle = structuredClone(pairedBundle);
  wrongPairIndexesBundle.inference = wrongPairIndexes;

  const wrongPeriodCount = structuredClone(repeatedInference);
  if (wrongPeriodCount.kind !== "trajectory-repeated-periods") {
    assert.fail("expected repeated-period inference");
  }
  wrongPeriodCount.omnibusRows.forEach((row) => { row.nPeriods = 999; });
  const wrongPeriodCountBundle = structuredClone(repeatedBundle);
  wrongPeriodCountBundle.inference = wrongPeriodCount;

  const wrongDegreesFreedom = structuredClone(repeatedInference);
  if (wrongDegreesFreedom.kind !== "trajectory-repeated-periods") {
    assert.fail("expected repeated-period inference");
  }
  wrongDegreesFreedom.omnibusRows.forEach((row) => { row.degreesFreedom = 999; });
  const wrongDegreesFreedomBundle = structuredClone(repeatedBundle);
  wrongDegreesFreedomBundle.inference = wrongDegreesFreedom;

  const missingDegreesFreedom = structuredClone(repeatedInference);
  if (missingDegreesFreedom.kind !== "trajectory-repeated-periods") {
    assert.fail("expected repeated-period inference");
  }
  missingDegreesFreedom.omnibusRows.forEach((row) => { row.degreesFreedom = null; });
  const missingDegreesFreedomBundle = structuredClone(repeatedBundle);
  missingDegreesFreedomBundle.inference = missingDegreesFreedom;

  for (const { label, inference, bundle } of [
    { label: "paired row indexes", inference: wrongPairIndexes, bundle: wrongPairIndexesBundle },
    { label: "Friedman period count", inference: wrongPeriodCount, bundle: wrongPeriodCountBundle },
    { label: "Friedman degrees of freedom", inference: wrongDegreesFreedom, bundle: wrongDegreesFreedomBundle },
    { label: "missing Friedman degrees of freedom", inference: missingDegreesFreedom, bundle: missingDegreesFreedomBundle },
  ]) {
    assert.throws(
      () => parseOpenEnaInferenceResultV2(inference),
      /period|index|Friedman|degrees|metadata|cardinality/i,
      `${label} standalone`,
    );
    assert.throws(
      () => parseOpenEnaAnalysisBundle(JSON.stringify(bundle)),
      /period|index|Friedman|degrees|metadata|cardinality/i,
      `${label} bundle`,
    );
  }
});

test("repeated ledger indexes bind exactly to a selected non-prefix time-order subset", async () => {
  const trajectory = trajectoryFixture(4);
  const inference = await runInference(trajectory, {
    kind: "trajectory-repeated-periods",
    repeatedEntityColumns: ["Group", "Name"],
    timeColumn: "Period",
    group: "Control",
    periods: ["T2", "T3", "T4"],
    axes: trajectory.axes,
    cohortPolicy: "all-period-complete",
    posthocContrasts: "all-period-pairs",
  });
  if (inference.kind !== "trajectory-repeated-periods" || !inference.ledger) {
    assert.fail("expected repeated-period inference ledger");
  }
  assert.deepEqual(
    inference.ledger.availableByPeriod.map((period) => period.periodIndex),
    [1, 2, 3],
  );
  const bundle = buildAnalysisBundle(
    trajectory.dataset,
    trajectory.configuration,
    trajectory.result,
    HASH,
    { methodsDimensions: trajectory.axes, inference },
  );
  assert.deepEqual(parseOpenEnaInferenceResultV2(structuredClone(inference)), inference);
  assert.deepEqual(parseOpenEnaAnalysisBundle(JSON.stringify(bundle)).inference, inference);

  const permuted = structuredClone(inference);
  if (!permuted.ledger) assert.fail("expected repeated-period inference ledger");
  permuted.ledger.availableByPeriod.reverse();
  const permutedBundle = structuredClone(bundle);
  permutedBundle.inference = permuted;
  assert.throws(
    () => parseOpenEnaInferenceResultV2(permuted),
    /ledger|period|index|order|cardinality/i,
  );
  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(permutedBundle)),
    /ledger|period|index|order|cardinality/i,
  );
});

test("strict readers require bounded exact-tail audits and complete aggregate ledgers", async () => {
  const {
    endpoint,
    trajectory,
    endpointInference,
    pairedInference,
    repeatedInference,
  } = await allInferenceFixtures();
  const endpointBundle = buildAnalysisBundle(
    endpoint.dataset,
    endpoint.configuration,
    endpoint.result,
    HASH,
    { inference: endpointInference },
  );
  const pairedBundle = buildAnalysisBundle(
    trajectory.dataset,
    trajectory.configuration,
    trajectory.result,
    HASH,
    { methodsDimensions: trajectory.axes, inference: pairedInference },
  );
  const repeatedBundle = buildAnalysisBundle(
    trajectory.dataset,
    trajectory.configuration,
    trajectory.result,
    HASH,
    { methodsDimensions: trajectory.axes, inference: repeatedInference },
  );

  const boundaryTail = structuredClone(endpointInference);
  if (boundaryTail.kind !== "endpoint-independent" || !boundaryTail.rows[0].exactTail) {
    assert.fail("expected endpoint exact-tail audit");
  }
  boundaryTail.rows[0].exactTail.extremeAssignmentCount = "1".repeat(4_096);
  boundaryTail.rows[0].exactTail.totalAssignmentCount = "9".repeat(4_096);
  const boundaryTailBundle = structuredClone(endpointBundle);
  boundaryTailBundle.inference = boundaryTail;
  assert.doesNotThrow(() => parseOpenEnaInferenceResultV2(boundaryTail));
  assert.doesNotThrow(() => parseOpenEnaAnalysisBundle(JSON.stringify(boundaryTailBundle)));

  const oversizedTail = structuredClone(endpointInference);
  if (oversizedTail.kind !== "endpoint-independent" || !oversizedTail.rows[0].exactTail) {
    assert.fail("expected endpoint exact-tail audit");
  }
  oversizedTail.rows[0].exactTail.totalAssignmentCount = "9".repeat(4_097);
  const oversizedTailBundle = structuredClone(endpointBundle);
  oversizedTailBundle.inference = oversizedTail;

  const missingLedger = structuredClone(endpointInference);
  missingLedger.ledger = null;
  const missingLedgerBundle = structuredClone(endpointBundle);
  missingLedgerBundle.inference = missingLedger;

  const duplicatePairedAxes = structuredClone(pairedInference);
  if (duplicatePairedAxes.kind !== "trajectory-paired-periods" || !duplicatePairedAxes.ledger) {
    assert.fail("expected paired inference ledger");
  }
  duplicatePairedAxes.ledger.axes[1].axisIndex = 0;
  const duplicatePairedAxesBundle = structuredClone(pairedBundle);
  duplicatePairedAxesBundle.inference = duplicatePairedAxes;

  const emptyRepeatedPeriods = structuredClone(repeatedInference);
  if (emptyRepeatedPeriods.kind !== "trajectory-repeated-periods" || !emptyRepeatedPeriods.ledger) {
    assert.fail("expected repeated inference ledger");
  }
  emptyRepeatedPeriods.ledger.availableByPeriod = [];
  const emptyRepeatedPeriodsBundle = structuredClone(repeatedBundle);
  emptyRepeatedPeriodsBundle.inference = emptyRepeatedPeriods;

  const duplicateRepeatedPeriods = structuredClone(repeatedInference);
  if (duplicateRepeatedPeriods.kind !== "trajectory-repeated-periods" || !duplicateRepeatedPeriods.ledger) {
    assert.fail("expected repeated inference ledger");
  }
  duplicateRepeatedPeriods.ledger.availableByPeriod[1].periodIndex = 0;
  const duplicateRepeatedPeriodsBundle = structuredClone(repeatedBundle);
  duplicateRepeatedPeriodsBundle.inference = duplicateRepeatedPeriods;

  const oversizedRepeatedPeriods = structuredClone(repeatedInference);
  if (oversizedRepeatedPeriods.kind !== "trajectory-repeated-periods" || !oversizedRepeatedPeriods.ledger) {
    assert.fail("expected repeated inference ledger");
  }
  oversizedRepeatedPeriods.ledger.availableByPeriod = Array.from(
    { length: 4_097 },
    () => structuredClone(oversizedRepeatedPeriods.ledger!.availableByPeriod[0]),
  );
  const oversizedRepeatedPeriodsBundle = structuredClone(repeatedBundle);
  oversizedRepeatedPeriodsBundle.inference = oversizedRepeatedPeriods;

  for (const { label, inference, bundle } of [
    { label: "oversized exact-tail digit string", inference: oversizedTail, bundle: oversizedTailBundle },
    { label: "available result without ledger", inference: missingLedger, bundle: missingLedgerBundle },
    { label: "duplicate paired ledger axes", inference: duplicatePairedAxes, bundle: duplicatePairedAxesBundle },
    { label: "empty repeated-period ledger", inference: emptyRepeatedPeriods, bundle: emptyRepeatedPeriodsBundle },
    { label: "duplicate repeated-period ledger indexes", inference: duplicateRepeatedPeriods, bundle: duplicateRepeatedPeriodsBundle },
    { label: "oversized repeated-period ledger", inference: oversizedRepeatedPeriods, bundle: oversizedRepeatedPeriodsBundle },
  ]) {
    assert.throws(
      () => parseOpenEnaInferenceResultV2(inference),
      /exact-tail|bounded|ledger|axis|period|required|cardinality/i,
      `${label} standalone`,
    );
    assert.throws(
      () => parseOpenEnaAnalysisBundle(JSON.stringify(bundle)),
      /exact-tail|bounded|ledger|axis|period|required|cardinality/i,
      `${label} bundle`,
    );
  }
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

  const forgedViews = [
    (view: typeof trajectory.derivation.view) => { view.identityConfirmed = false; },
    (view: typeof trajectory.derivation.view) => {
      view.repeatedEntityColumns = [];
      view.repeatedEntityColumn = "Group";
    },
    (view: typeof trajectory.derivation.view) => { view.repeatedEntityColumns = ["Name", "Group"]; },
    (view: typeof trajectory.derivation.view) => { view.timeColumn = "Wrong period field"; },
    (view: typeof trajectory.derivation.view) => { view.timeOrder.reverse(); },
  ];
  for (const mutate of forgedViews) {
    const forged = structuredClone(trajectory.derivation.view);
    mutate(forged);
    assert.throws(
      () => buildLongitudinalGroupCentroidExport(forged, undefined, pairedInference),
      (error: unknown) => error instanceof Error
        && error.message === "Inference consumer binding mismatch.",
    );
  }
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
