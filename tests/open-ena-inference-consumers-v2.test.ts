import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { analyzeDataset } from "../lib/open-ena/analyze";
import { buildPairwiseGroupContrast } from "../lib/open-ena/contrasts";
import { parseCsv } from "../lib/open-ena/csv";
import {
  buildAnalysisBundle as buildAnalysisBundleProduction,
  parseOpenEnaAnalysisBundle,
  type BuildAnalysisBundleOptions,
} from "../lib/open-ena/export";
import {
  assertOpenEnaInferenceBindingV2,
  flattenOpenEnaInferenceRows,
  parseOpenEnaInferenceResultV2,
  type OpenEnaInferenceProducerContextV2,
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
import {
  buildMethodsReport as buildMethodsReportProduction,
  type OpenEnaPresentationOptions,
} from "../lib/open-ena/methods";
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
const INFERENCE_RESOLVED_METHOD_AUDIT_ERROR =
  "Inference resolved p method, exact-tail, and continuity audit are inconsistent.";
const INFERENCE_JSON_DATA_ERROR =
  "Inference result must be plain JSON data with own enumerable data properties.";
const INFERENCE_JSON_BUDGET_ERROR =
  "Inference result exceeds the bounded plain JSON data budget.";
const INFERENCE_ROW_FIELDS_ERROR =
  "Inference result row must contain exactly its required fields.";
const INFERENCE_ROW_REASON_ERROR =
  "Inference row not-estimable reason is inconsistent with its rank test.";
const INFERENCE_OVERALL_REASON_ERROR =
  "Inference overall reason does not match its planned rows.";
const INFERENCE_AVAILABLE_STATISTICS_ERROR =
  "Inference available row statistics are incomplete.";
const INFERENCE_ROW_COUNT_ERROR =
  "Inference row count audit is inconsistent.";
const INFERENCE_LEDGER_AUDIT_ERROR =
  "Inference inclusion ledger audit is inconsistent.";
const INFERENCE_EXACT_FIRST_ERROR =
  "Inference resolved p method is inconsistent with exact-first audit.";
const INFERENCE_MINIMUM_P_ERROR =
  "Inference Wilcoxon minimum attainable p audit is inconsistent with nNonzero.";
const INFERENCE_EXACT_TAIL_ERROR =
  "Inference exact-tail counts and raw p-value are inconsistent.";
const INFERENCE_HOLM_AUDIT_ERROR =
  "Inference Holm family adjustment audit is inconsistent.";

function isInconsistentRowMethodAuditError(error: unknown) {
  return error instanceof Error && error.message === INFERENCE_RESOLVED_METHOD_AUDIT_ERROR;
}

function hasExactErrorMessage(expected: string) {
  return (error: unknown) => error instanceof Error && error.message === expected;
}

function assertValueFreeCurrentContextMismatch(
  run: () => unknown,
  forbiddenValues: readonly string[],
) {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof Error, "expected a current-context mismatch");
  assert.equal(caught.message, "Inference consumer current context mismatch.");
  for (const value of forbiddenValues) assert.doesNotMatch(caught.message, new RegExp(value, "u"));
}

function freezeOwnDataRecursively<T>(value: T, seen = new Set<unknown>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && "value" in descriptor) freezeOwnDataRecursively(descriptor.value, seen);
  }
  return Object.freeze(value);
}

function markRowNotEstimable(row: Record<string, unknown>, reason: string) {
  row.status = "not-estimable";
  row.reason = reason;
  row.pRaw = null;
  row.pHolm = null;
  row.holmRank = null;
  row.holmMultiplier = null;
  row.resolvedPMethod = null;
  row.exactTail = null;
  row.continuityCorrectionApplied = false;
  if (row.test === "wilcoxon-signed-rank") row.minimumAttainableTwoSidedP = null;
}

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

function endpointApproximationFixture() {
  const rows = ["unit,conversation,group,A,B,C"];
  const patterns = [
    [1, 1, 0],
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, 1],
  ] as const;
  for (const [group, count, offset] of [
    ["Primary", 26, 0],
    ["Secondary", 25, 1],
  ] as const) {
    for (let index = 0; index < count; index += 1) {
      const pattern = patterns[(index + offset) % patterns.length];
      rows.push(`${group[0]}${index + 1},c-${group[0]}${index + 1},${group},${pattern.join(",")}`);
    }
  }
  const dataset = parseCsv(rows.join("\n") + "\n", {
    name: "endpoint-approximation-v2.csv",
    source: "upload",
  });
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

function trajectoryComparisonFrameWithCoordinates(
  fixture: ReturnType<typeof trajectoryFixture>,
  entityCount: number,
) {
  const frame = structuredClone(fixture.derivation.comparisonFrame);
  const group = frame.groups.find((candidate) => candidate.name === "Control");
  if (!group) assert.fail("expected Control comparison group");
  frame.points = [];
  for (let entity = 1; entity <= entityCount; entity += 1) {
    const entityToken = `opaque-test-${entity}`;
    const base = entity / 100;
    frame.points.push(
      {
        entityToken,
        group,
        time: "T1",
        timeIndex: 0,
        x: base,
        y: base * 2,
        sourcePointCount: 1,
      },
      {
        entityToken,
        group,
        time: "T2",
        timeIndex: 1,
        x: base + 1 + entity / 10_000,
        y: base * 2 - 1 - entity / 20_000,
        sourcePointCount: 1,
      },
      {
        entityToken,
        group,
        time: "T3",
        timeIndex: 2,
        x: base + 2 + entity / 5_000,
        y: base * 2 + 1 + entity / 10_000,
        sourcePointCount: 1,
      },
    );
  }
  return frame;
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

function producerContext(
  result: OpenEnaResult,
  configuration: OpenEnaConfig,
  inference: OpenEnaInferenceResultV2,
): OpenEnaInferenceProducerContextV2 {
  return {
    groupNames: result.groups.map((group) => group.name),
    groupColumn: configuration.groupColumn,
    trajectoryMapping: inference.kind === "endpoint-independent"
      ? null
      : inference.binding.trajectoryMapping,
  };
}

function buildAnalysisBundle(
  dataset: ParsedDataset,
  configuration: OpenEnaConfig,
  result: OpenEnaResult,
  sourceHash: string | null = null,
  options: BuildAnalysisBundleOptions = {},
) {
  const inference = options.inference ?? null;
  return buildAnalysisBundleProduction(dataset, configuration, result, sourceHash, {
    ...options,
    inferenceContext: options.inferenceContext
      ?? (inference ? producerContext(result, configuration, inference) : undefined),
  });
}

function buildMethodsReport(
  dataset: ParsedDataset,
  configuration: OpenEnaConfig,
  result: OpenEnaResult,
  sourceHash: string | null = null,
  dimensions: readonly string[] = result.dimensions.slice(0, 2),
  presentation: OpenEnaPresentationOptions = {},
  inference: OpenEnaInferenceResultV2 | null = null,
  inferenceContext: OpenEnaInferenceProducerContextV2 | null = null,
) {
  return buildMethodsReportProduction(
    dataset,
    configuration,
    result,
    sourceHash,
    dimensions,
    presentation,
    inference,
    inferenceContext ?? (inference ? producerContext(result, configuration, inference) : null),
  );
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

test("bundle and Methods producers reject frozen inference clones with private or forged authority", async () => {
  const {
    endpoint,
    trajectory,
    endpointInference,
    pairedInference,
  } = await allInferenceFixtures();
  const privateSentinel = "PRIVATE_PERSON_SENTINEL";
  const privateForgery = structuredClone(endpointInference) as unknown as Record<string, unknown>;
  privateForgery.participantRows = [{
    name: privateSentinel,
    difference: 123,
  }];
  freezeOwnDataRecursively(privateForgery);

  const validFrozenClone = freezeOwnDataRecursively(structuredClone(endpointInference));
  assert.strictEqual(parseOpenEnaInferenceResultV2(validFrozenClone), validFrozenClone);

  const groupForgery = structuredClone(endpointInference);
  if (groupForgery.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
  groupForgery.request.primaryGroup = privateSentinel;
  groupForgery.scope.primaryGroup = privateSentinel;
  freezeOwnDataRecursively(groupForgery);
  assert.strictEqual(parseOpenEnaInferenceResultV2(groupForgery), groupForgery);

  const semanticForgery = structuredClone(endpointInference);
  if (semanticForgery.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
  semanticForgery.rows[0].pRaw = semanticForgery.rows[0].pRaw === 1 ? 0.5 : 1;
  freezeOwnDataRecursively(semanticForgery);

  const mutableClone = structuredClone(endpointInference);
  const producers = [
    {
      label: "analysis bundle",
      run(inference: OpenEnaInferenceResultV2) {
        return buildAnalysisBundle(
          endpoint.dataset,
          endpoint.configuration,
          endpoint.result,
          HASH,
          { inference },
        );
      },
    },
    {
      label: "Methods report",
      run(inference: OpenEnaInferenceResultV2) {
        return buildMethodsReport(
          endpoint.dataset,
          endpoint.configuration,
          endpoint.result,
          HASH,
          endpoint.axes,
          {},
          inference,
        );
      },
    },
  ];

  for (const producer of producers) {
    assert.throws(
      () => producer.run(privateForgery as unknown as OpenEnaInferenceResultV2),
      hasExactErrorMessage("Inference result contains an unsupported field."),
      `${producer.label} private evidence`,
    );
    assert.throws(
      () => producer.run(semanticForgery),
      hasExactErrorMessage(INFERENCE_EXACT_TAIL_ERROR),
      `${producer.label} semantic forgery`,
    );
    assert.throws(
      () => producer.run(mutableClone),
      hasExactErrorMessage("Inference consumer authority mismatch."),
      `${producer.label} mutable clone`,
    );
    assert.throws(
      () => producer.run(validFrozenClone),
      hasExactErrorMessage("Inference consumer authority mismatch."),
      `${producer.label} valid frozen imported clone`,
    );
    assert.throws(
      () => producer.run(groupForgery),
      hasExactErrorMessage("Inference consumer authority mismatch."),
      `${producer.label} internally consistent forged group`,
    );
  }

  const trajectoryFrozenClone = freezeOwnDataRecursively(structuredClone(pairedInference));
  const mappingForgery = structuredClone(pairedInference);
  if (mappingForgery.kind !== "trajectory-paired-periods"
    || !mappingForgery.binding.trajectoryMapping) {
    assert.fail("expected paired trajectory inference mapping");
  }
  mappingForgery.binding.trajectoryMapping.timeOrder[2] = "PRIVATE_TIME_SENTINEL";
  freezeOwnDataRecursively(mappingForgery);
  assert.strictEqual(parseOpenEnaInferenceResultV2(mappingForgery), mappingForgery);

  for (const inference of [trajectoryFrozenClone, mappingForgery]) {
    assert.throws(
      () => buildLongitudinalGroupCentroidExport(
        trajectory.derivation.view,
        undefined,
        inference,
      ),
      hasExactErrorMessage("Inference consumer authority mismatch."),
    );
    assert.throws(
      () => longitudinalInferenceRowsToCsv(trajectory.derivation.view, inference),
      hasExactErrorMessage("Inference consumer authority mismatch."),
    );
  }

  const genuineBundle = buildAnalysisBundle(
    endpoint.dataset,
    endpoint.configuration,
    endpoint.result,
    HASH,
    { inference: endpointInference },
  );
  assert.strictEqual(genuineBundle.inference, endpointInference);
  assert.doesNotMatch(JSON.stringify(genuineBundle), new RegExp(privateSentinel));
  const importedBundle = parseOpenEnaAnalysisBundle(JSON.stringify(genuineBundle));
  assert.deepEqual(importedBundle.inference, endpointInference);
  assert.notStrictEqual(importedBundle.inference, endpointInference);
  assert.throws(
    () => buildAnalysisBundle(
      endpoint.dataset,
      endpoint.configuration,
      endpoint.result,
      HASH,
      { inference: importedBundle.inference as OpenEnaInferenceResultV2 },
    ),
    hasExactErrorMessage("Inference consumer authority mismatch."),
  );
});

test("producer current context rejects an old genuine authority after group or trajectory mapping drift", async () => {
  const {
    endpoint,
    trajectory,
    endpointInference,
    pairedInference,
  } = await allInferenceFixtures();
  const changedGroupResult = {
    ...endpoint.result,
    groups: endpoint.result.groups.filter((group) => group.name !== "Primary"),
  };
  assert.throws(
    () => buildAnalysisBundle(
      endpoint.dataset,
      endpoint.configuration,
      changedGroupResult,
      HASH,
      { inference: endpointInference },
    ),
    hasExactErrorMessage("Inference consumer current context mismatch."),
  );
  assert.throws(
    () => buildMethodsReport(
      endpoint.dataset,
      endpoint.configuration,
      changedGroupResult,
      HASH,
      endpoint.axes,
      {},
      endpointInference,
    ),
    hasExactErrorMessage("Inference consumer current context mismatch."),
  );

  if (!pairedInference.binding.trajectoryMapping) {
    assert.fail("expected paired trajectory mapping");
  }
  const changedMapping = structuredClone(pairedInference.binding.trajectoryMapping);
  changedMapping.timeOrder[2] = "Changed current T3";
  const changedTrajectoryContext = {
    groupNames: trajectory.result.groups.map((group) => group.name),
    groupColumn: trajectory.configuration.groupColumn,
    trajectoryMapping: changedMapping,
  };
  assert.throws(
    () => buildAnalysisBundle(
      trajectory.dataset,
      trajectory.configuration,
      trajectory.result,
      HASH,
      {
        methodsDimensions: trajectory.axes,
        inference: pairedInference,
        inferenceContext: changedTrajectoryContext,
      } as Parameters<typeof buildAnalysisBundle>[4],
    ),
    hasExactErrorMessage("Inference consumer current context mismatch."),
  );
  assert.throws(
    () => buildMethodsReport(
      trajectory.dataset,
      trajectory.configuration,
      trajectory.result,
      HASH,
      trajectory.axes,
      {},
      pairedInference,
      changedTrajectoryContext,
    ),
    hasExactErrorMessage("Inference consumer current context mismatch."),
  );

  assert.throws(
    () => buildAnalysisBundleProduction(
      trajectory.dataset,
      trajectory.configuration,
      trajectory.result,
      HASH,
      { methodsDimensions: trajectory.axes, inference: pairedInference },
    ),
    hasExactErrorMessage("Inference consumer current context mismatch."),
  );
  assert.throws(
    () => buildMethodsReportProduction(
      trajectory.dataset,
      trajectory.configuration,
      trajectory.result,
      HASH,
      trajectory.axes,
      {},
      pairedInference,
    ),
    hasExactErrorMessage("Inference consumer current context mismatch."),
  );

  const reorderedCurrentContext = {
    ...producerContext(trajectory.result, trajectory.configuration, pairedInference),
    groupNames: trajectory.result.groups.map((group) => group.name).reverse(),
  };
  assert.doesNotThrow(() => buildAnalysisBundleProduction(
    trajectory.dataset,
    trajectory.configuration,
    trajectory.result,
    HASH,
    {
      methodsDimensions: trajectory.axes,
      inference: pairedInference,
      inferenceContext: reorderedCurrentContext,
    },
  ));
  assert.doesNotThrow(() => buildMethodsReportProduction(
    trajectory.dataset,
    trajectory.configuration,
    trajectory.result,
    HASH,
    trajectory.axes,
    {},
    pairedInference,
    reorderedCurrentContext,
  ));
});

test("disabled coordinator authority remains bound to its original group set and private trajectory context", async () => {
  const endpoint = endpointFixture();
  const trajectory = trajectoryFixture();
  const disabledEndpoint = await runInference(endpoint, {
    kind: "endpoint-independent",
    primaryGroup: "Primary",
    secondaryGroup: "Primary",
    axes: endpoint.axes,
  });
  assert.equal(disabledEndpoint.status, "disabled");
  assert.equal(disabledEndpoint.reason, "groups-must-differ");

  assert.doesNotThrow(() => buildAnalysisBundle(
    endpoint.dataset,
    endpoint.configuration,
    endpoint.result,
    HASH,
    { inference: disabledEndpoint },
  ));
  assert.doesNotThrow(() => buildMethodsReport(
    endpoint.dataset,
    endpoint.configuration,
    endpoint.result,
    HASH,
    endpoint.axes,
    {},
    disabledEndpoint,
  ));

  const replacementGroup = "PRIVATE_REPLACEMENT_GROUP_SENTINEL";
  const endpointDrifts = [
    {
      ...endpoint.result,
      groups: endpoint.result.groups.filter((group) => group.name !== "Primary"),
    },
    {
      ...endpoint.result,
      groups: endpoint.result.groups.map((group) => (
        group.name === "Primary" ? { ...group, name: replacementGroup } : group
      )),
    },
  ];
  for (const result of endpointDrifts) {
    assertValueFreeCurrentContextMismatch(
      () => buildAnalysisBundle(
        endpoint.dataset,
        endpoint.configuration,
        result,
        HASH,
        { inference: disabledEndpoint },
      ),
      ["Primary", replacementGroup],
    );
    assertValueFreeCurrentContextMismatch(
      () => buildMethodsReport(
        endpoint.dataset,
        endpoint.configuration,
        result,
        HASH,
        endpoint.axes,
        {},
        disabledEndpoint,
      ),
      ["Primary", replacementGroup],
    );
  }

  const disabledBeforePublicMapping = await runInference(trajectory, {
    kind: "trajectory-paired-periods",
    repeatedEntityColumns: ["Group"],
    timeColumn: "Period",
    group: "Control",
    earlierPeriod: "T1",
    laterPeriod: "T2",
    axes: trajectory.axes,
    cohortPolicy: "pairwise-complete",
  });
  assert.equal(disabledBeforePublicMapping.status, "disabled");
  assert.equal(disabledBeforePublicMapping.reason, "identity-columns-invalid");
  assert.equal(disabledBeforePublicMapping.binding.trajectoryMapping, null);

  const originalTrajectoryContext: OpenEnaInferenceProducerContextV2 = {
    groupNames: trajectory.result.groups.map((group) => group.name),
    groupColumn: trajectory.configuration.groupColumn,
    trajectoryMapping: {
      contractVersion: 1,
      repeatedEntityColumns: [...trajectory.derivation.view.repeatedEntityColumns],
      identityConfirmed: true,
      timeColumn: trajectory.derivation.view.timeColumn,
      timeOrder: [...trajectory.derivation.view.timeOrder],
    },
  };
  assert.doesNotThrow(() => buildAnalysisBundle(
    trajectory.dataset,
    trajectory.configuration,
    trajectory.result,
    HASH,
    {
      methodsDimensions: trajectory.axes,
      inference: disabledBeforePublicMapping,
      inferenceContext: originalTrajectoryContext,
    },
  ));
  assert.doesNotThrow(() => buildMethodsReport(
    trajectory.dataset,
    trajectory.configuration,
    trajectory.result,
    HASH,
    trajectory.axes,
    {},
    disabledBeforePublicMapping,
    originalTrajectoryContext,
  ));

  const privateTime = "PRIVATE_TIME_SENTINEL";
  const privateIdentity = "PRIVATE_IDENTITY_SENTINEL";
  const trajectoryDrifts: OpenEnaInferenceProducerContextV2[] = [
    {
      ...originalTrajectoryContext,
      trajectoryMapping: {
        ...originalTrajectoryContext.trajectoryMapping!,
        timeColumn: privateTime,
      },
    },
    {
      ...originalTrajectoryContext,
      trajectoryMapping: {
        ...originalTrajectoryContext.trajectoryMapping!,
        timeOrder: ["T1", "T2", privateTime],
      },
    },
    {
      ...originalTrajectoryContext,
      trajectoryMapping: {
        ...originalTrajectoryContext.trajectoryMapping!,
        repeatedEntityColumns: ["Group", privateIdentity],
      },
    },
    {
      ...originalTrajectoryContext,
      trajectoryMapping: null,
    },
  ];
  for (const driftedContext of trajectoryDrifts) {
    assertValueFreeCurrentContextMismatch(
      () => buildAnalysisBundle(
        trajectory.dataset,
        trajectory.configuration,
        trajectory.result,
        HASH,
        {
          methodsDimensions: trajectory.axes,
          inference: disabledBeforePublicMapping,
          inferenceContext: driftedContext,
        },
      ),
      [privateTime, privateIdentity, "Control"],
    );
    assertValueFreeCurrentContextMismatch(
      () => buildMethodsReport(
        trajectory.dataset,
        trajectory.configuration,
        trajectory.result,
        HASH,
        trajectory.axes,
        {},
        disabledBeforePublicMapping,
        driftedContext,
      ),
      [privateTime, privateIdentity, "Control"],
    );
  }
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
        value.manifest.effectiveJenaOptions.units[1] = "I".repeat(length);
        value.modelData.units[1] = "I".repeat(length);
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
    { label: "bounded but arithmetically impossible exact-tail digits", inference: boundaryTail, bundle: boundaryTailBundle },
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

test("strict readers and longitudinal CSV reject a stateful inherited getter without invoking it", async () => {
  const { trajectory, pairedInference } = await allInferenceFixtures();
  const forged = structuredClone(pairedInference);
  if (forged.kind !== "trajectory-paired-periods") assert.fail("expected paired inference");
  const row = forged.rows[0];
  delete (row as unknown as { reason?: unknown }).reason;
  let getterReadCount = 0;
  const mutablePrototype = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(mutablePrototype, "reason", {
    enumerable: true,
    configurable: true,
    get() {
      getterReadCount += 1;
      return getterReadCount <= 4 ? null : "no-complete-blocks";
    },
  });
  Object.setPrototypeOf(row, mutablePrototype);
  freezeOwnDataRecursively(forged);

  assert.throws(
    () => parseOpenEnaInferenceResultV2(forged),
    hasExactErrorMessage(INFERENCE_JSON_DATA_ERROR),
  );
  assert.throws(
    () => longitudinalInferenceRowsToCsv(trajectory.derivation.view, forged),
    hasExactErrorMessage(INFERENCE_JSON_DATA_ERROR),
  );
  assert.equal(getterReadCount, 0, "validation must inspect descriptors without invoking getters");
});

test("strict inference JSON boundary rejects inherited, accessor, symbol, sparse, and exotic-array state", async () => {
  const { pairedInference } = await allInferenceFixtures();
  const cases: Array<{
    label: string;
    mutate: (inference: Extract<OpenEnaInferenceResultV2, { kind: "trajectory-paired-periods" }>) => () => number;
  }> = [
    {
      label: "inherited required field",
      mutate(inference) {
        const row = inference.rows[0];
        delete (row as unknown as { reason?: unknown }).reason;
        Object.setPrototypeOf(row, Object.freeze({ reason: null }));
        return () => 0;
      },
    },
    {
      label: "own getter",
      mutate(inference) {
        let reads = 0;
        Object.defineProperty(inference.rows[0], "reason", {
          enumerable: true,
          configurable: true,
          get() { reads += 1; return null; },
        });
        return () => reads;
      },
    },
    {
      label: "custom record prototype",
      mutate(inference) {
        Object.setPrototypeOf(inference.rows[0], Object.freeze({}));
        return () => 0;
      },
    },
    {
      label: "symbol field",
      mutate(inference) {
        Object.defineProperty(inference.rows[0], Symbol("hidden"), {
          enumerable: true,
          value: "unexpected",
        });
        return () => 0;
      },
    },
    {
      label: "non-enumerable field",
      mutate(inference) {
        Object.defineProperty(inference.rows[0], "hidden", {
          enumerable: false,
          value: "unexpected",
        });
        return () => 0;
      },
    },
    {
      label: "sparse row array",
      mutate(inference) {
        delete inference.rows[1];
        return () => 0;
      },
    },
    {
      label: "accessor array index",
      mutate(inference) {
        let reads = 0;
        const first = inference.rows[0];
        Object.defineProperty(inference.rows, "0", {
          enumerable: true,
          configurable: true,
          get() { reads += 1; return first; },
        });
        return () => reads;
      },
    },
    {
      label: "custom array prototype",
      mutate(inference) {
        Object.setPrototypeOf(inference.rows, Object.create(Array.prototype));
        return () => 0;
      },
    },
  ];

  for (const { label, mutate } of cases) {
    const forged = structuredClone(pairedInference);
    if (forged.kind !== "trajectory-paired-periods") assert.fail("expected paired inference");
    const getterReads = mutate(forged);
    assert.throws(
      () => parseOpenEnaInferenceResultV2(forged),
      hasExactErrorMessage(INFERENCE_JSON_DATA_ERROR),
      label,
    );
    assert.equal(getterReads(), 0, `${label} must be rejected without invoking an accessor`);
  }
});

test("plain-data budget rejects an oversized dense array before inspecting its elements", async () => {
  const { endpoint, endpointInference } = await allInferenceFixtures();
  const standalone = structuredClone(endpointInference);
  if (standalone.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
  const oversizedRows = Array.from({ length: 4_097 }, () => standalone.rows[0]);
  let elementGetterReads = 0;
  Object.defineProperty(oversizedRows, "0", {
    enumerable: true,
    configurable: true,
    get() {
      elementGetterReads += 1;
      return standalone.rows[0];
    },
  });
  standalone.rows = oversizedRows as typeof standalone.rows;

  assert.throws(
    () => parseOpenEnaInferenceResultV2(standalone),
    hasExactErrorMessage(INFERENCE_JSON_BUDGET_ERROR),
  );
  assert.equal(elementGetterReads, 0, "oversized-array rejection must not inspect an element accessor");

  const bundle = buildAnalysisBundle(
    endpoint.dataset,
    endpoint.configuration,
    endpoint.result,
    HASH,
    { inference: endpointInference },
  );
  const bundledInference = structuredClone(endpointInference);
  if (bundledInference.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
  bundledInference.rows = Array.from(
    { length: 4_097 },
    () => structuredClone(bundledInference.rows[0]),
  ) as typeof bundledInference.rows;
  const bundled = structuredClone(bundle);
  bundled.inference = bundledInference;
  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(bundled)),
    hasExactErrorMessage(INFERENCE_JSON_BUDGET_ERROR),
  );
});

test("plain-data budget bounds one object and cumulative object-node and own-key work", async () => {
  const { endpoint, endpointInference } = await allInferenceFixtures();
  const cases: Array<{ label: string; extra: unknown }> = [
    {
      label: "one oversized object",
      extra: Object.fromEntries(Array.from(
        { length: 4_097 },
        (_, index) => [`field-${index}`, index],
      )),
    },
    {
      label: "cumulative object-node budget",
      extra: Array.from({ length: 4_096 }, () => ({
        children: Array.from({ length: 8 }, () => ({})),
      })),
    },
    {
      label: "cumulative own-key budget",
      extra: Array.from(
        { length: 65 },
        () => Array.from({ length: 4_096 }, () => 0),
      ),
    },
  ];
  const bundle = buildAnalysisBundle(
    endpoint.dataset,
    endpoint.configuration,
    endpoint.result,
    HASH,
    { inference: endpointInference },
  );

  for (const { label, extra } of cases) {
    const standalone = structuredClone(endpointInference) as unknown as Record<string, unknown>;
    standalone.oversizedTree = extra;
    assert.throws(
      () => parseOpenEnaInferenceResultV2(standalone),
      hasExactErrorMessage(INFERENCE_JSON_BUDGET_ERROR),
      `${label} standalone`,
    );

    const bundled = structuredClone(bundle) as unknown as Record<string, unknown>;
    bundled.inference = standalone;
    assert.throws(
      () => parseOpenEnaAnalysisBundle(JSON.stringify(bundled)),
      hasExactErrorMessage(INFERENCE_JSON_BUDGET_ERROR),
      `${label} bundle`,
    );
  }
});

test("plain-data budget accepts a maximum bounded dense array and counts shared objects once", async () => {
  const { endpoint, endpointInference } = await allInferenceFixtures();
  const standalone = structuredClone(endpointInference);
  if (standalone.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
  const sharedWarnings = Array.from({ length: 4_096 }, () => "small-sample" as const);
  standalone.warnings = sharedWarnings;
  standalone.rows[0].warnings = sharedWarnings;
  standalone.rows[1].warnings = sharedWarnings;

  assert.deepEqual(parseOpenEnaInferenceResultV2(standalone), standalone);
  const bundle = buildAnalysisBundle(
    endpoint.dataset,
    endpoint.configuration,
    endpoint.result,
    HASH,
    { inference: endpointInference },
  );
  const bundled = structuredClone(bundle);
  bundled.inference = standalone;
  assert.deepEqual(
    parseOpenEnaAnalysisBundle(JSON.stringify(bundled)).inference,
    standalone,
  );

  const sharedLeaf = Array.from({ length: 4_096 }, () => 0);
  const sharedBranch = Array.from({ length: 4_096 }, () => sharedLeaf);
  const sharedGraph = Array.from({ length: 4_096 }, () => sharedBranch);
  const sharedGraphForgery = structuredClone(endpointInference) as unknown as Record<string, unknown>;
  sharedGraphForgery.sharedGraph = sharedGraph;
  assert.throws(
    () => parseOpenEnaInferenceResultV2(sharedGraphForgery),
    hasExactErrorMessage("Inference result contains an unsupported field."),
    "shared subgraphs are counted once and reach schema validation instead of exhausting the budget",
  );
});

test("schema-v2 bundle inference rows require every field as own JSON data", async () => {
  const { trajectory, pairedInference } = await allInferenceFixtures();
  const bundle = buildAnalysisBundle(
    trajectory.dataset,
    trajectory.configuration,
    trajectory.result,
    HASH,
    { methodsDimensions: trajectory.axes, inference: pairedInference },
  );
  const forgedBundle = structuredClone(bundle);
  if (!forgedBundle.inference || forgedBundle.inference.kind !== "trajectory-paired-periods") {
    assert.fail("expected paired bundle inference");
  }
  delete (forgedBundle.inference.rows[0] as unknown as {
    reason?: unknown;
  }).reason;

  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(forgedBundle)),
    hasExactErrorMessage(INFERENCE_ROW_FIELDS_ERROR),
  );
});

test("strict readers bind not-estimable and overall reasons to coordinator semantics", async () => {
  const fixtures = await allInferenceFixtures();
  const cases: Array<{
    label: string;
    fixture: typeof fixtures.endpoint | typeof fixtures.trajectory;
    inference: OpenEnaInferenceResultV2;
    expectedError: string;
    mutate: (inference: OpenEnaInferenceResultV2) => void;
  }> = [
    {
      label: "Mann–Whitney row with a repeated-period reason",
      fixture: fixtures.endpoint,
      inference: fixtures.endpointInference,
      expectedError: INFERENCE_ROW_REASON_ERROR,
      mutate(inference) {
        if (inference.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
        markRowNotEstimable(
          inference.rows[0] as unknown as Record<string, unknown>,
          "no-complete-blocks",
        );
      },
    },
    {
      label: "paired Wilcoxon row with an independent-group reason",
      fixture: fixtures.trajectory,
      inference: fixtures.pairedInference,
      expectedError: INFERENCE_ROW_REASON_ERROR,
      mutate(inference) {
        if (inference.kind !== "trajectory-paired-periods") assert.fail("expected paired inference");
        markRowNotEstimable(
          inference.rows[0] as unknown as Record<string, unknown>,
          "empty-group",
        );
      },
    },
    {
      label: "repeated follow-up claims no complete blocks while the cohort is nonempty",
      fixture: fixtures.trajectory,
      inference: fixtures.repeatedInference,
      expectedError: INFERENCE_ROW_REASON_ERROR,
      mutate(inference) {
        if (inference.kind !== "trajectory-repeated-periods") assert.fail("expected repeated inference");
        assert.ok(inference.ledger && inference.ledger.completeBlockCount > 0);
        markRowNotEstimable(
          inference.followupRows[0] as unknown as Record<string, unknown>,
          "no-complete-blocks",
        );
      },
    },
    {
      label: "overall reason disagrees with two homogeneous row reasons",
      fixture: fixtures.endpoint,
      inference: fixtures.endpointInference,
      expectedError: INFERENCE_OVERALL_REASON_ERROR,
      mutate(inference) {
        if (inference.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
        inference.rows.forEach((row) => {
          markRowNotEstimable(row as unknown as Record<string, unknown>, "all-values-tied");
          row.z = null;
        });
        inference.status = "not-estimable";
        inference.reason = "empty-group";
      },
    },
  ];

  for (const { label, fixture, inference, expectedError, mutate } of cases) {
    const forged = structuredClone(inference);
    mutate(forged);
    const bundle = buildAnalysisBundle(
      fixture.dataset,
      fixture.configuration,
      fixture.result,
      HASH,
      { methodsDimensions: fixture.axes, inference },
    );
    const forgedBundle = structuredClone(bundle);
    forgedBundle.inference = forged;
    assert.throws(
      () => parseOpenEnaInferenceResultV2(forged),
      hasExactErrorMessage(expectedError),
      `${label} standalone`,
    );
    assert.throws(
      () => parseOpenEnaAnalysisBundle(JSON.stringify(forgedBundle)),
      hasExactErrorMessage(expectedError),
      `${label} bundle`,
    );
  }
});

test("available rows require complete core statistics and internally coherent counts", async () => {
  const fixtures = await allInferenceFixtures();
  const cases: Array<{
    label: string;
    fixture: typeof fixtures.endpoint | typeof fixtures.trajectory;
    inference: OpenEnaInferenceResultV2;
    expectedError: string;
    mutate: (inference: OpenEnaInferenceResultV2) => void;
  }> = [
    {
      label: "available Mann–Whitney missing a median",
      fixture: fixtures.endpoint,
      inference: fixtures.endpointInference,
      expectedError: INFERENCE_AVAILABLE_STATISTICS_ERROR,
      mutate(inference) {
        if (inference.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
        inference.rows[0].medianPrimary = null;
      },
    },
    {
      label: "available Wilcoxon missing W positive",
      fixture: fixtures.trajectory,
      inference: fixtures.pairedInference,
      expectedError: INFERENCE_AVAILABLE_STATISTICS_ERROR,
      mutate(inference) {
        if (inference.kind !== "trajectory-paired-periods") assert.fail("expected paired inference");
        inference.rows[0].wPositive = null;
      },
    },
    {
      label: "available Friedman missing Q",
      fixture: fixtures.trajectory,
      inference: fixtures.repeatedInference,
      expectedError: INFERENCE_AVAILABLE_STATISTICS_ERROR,
      mutate(inference) {
        if (inference.kind !== "trajectory-repeated-periods") assert.fail("expected repeated inference");
        inference.omnibusRows[0].q = null;
      },
    },
    {
      label: "Mann–Whitney available with an empty primary group",
      fixture: fixtures.endpoint,
      inference: fixtures.endpointInference,
      expectedError: INFERENCE_ROW_COUNT_ERROR,
      mutate(inference) {
        if (inference.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
        inference.rows[0].nPrimary = 0;
      },
    },
    {
      label: "Wilcoxon matched count does not equal signed and zero counts",
      fixture: fixtures.trajectory,
      inference: fixtures.pairedInference,
      expectedError: INFERENCE_ROW_COUNT_ERROR,
      mutate(inference) {
        if (inference.kind !== "trajectory-paired-periods") assert.fail("expected paired inference");
        inference.rows[0].nMatched += 1;
      },
    },
    {
      label: "Friedman available without a complete block",
      fixture: fixtures.trajectory,
      inference: fixtures.repeatedInference,
      expectedError: INFERENCE_ROW_COUNT_ERROR,
      mutate(inference) {
        if (inference.kind !== "trajectory-repeated-periods") assert.fail("expected repeated inference");
        inference.omnibusRows[0].nComplete = 0;
      },
    },
  ];

  for (const { label, fixture, inference, expectedError, mutate } of cases) {
    const forged = structuredClone(inference);
    mutate(forged);
    const bundle = buildAnalysisBundle(
      fixture.dataset,
      fixture.configuration,
      fixture.result,
      HASH,
      { methodsDimensions: fixture.axes, inference },
    );
    const forgedBundle = structuredClone(bundle);
    forgedBundle.inference = forged;
    assert.throws(
      () => parseOpenEnaInferenceResultV2(forged),
      hasExactErrorMessage(expectedError),
      `${label} standalone`,
    );
    assert.throws(
      () => parseOpenEnaAnalysisBundle(JSON.stringify(forgedBundle)),
      hasExactErrorMessage(expectedError),
      `${label} bundle`,
    );
  }
});

test("aggregate ledgers bind exactly to the supplied per-axis row counts", async () => {
  const fixtures = await allInferenceFixtures();
  const cases: Array<{
    label: string;
    fixture: typeof fixtures.endpoint | typeof fixtures.trajectory;
    inference: OpenEnaInferenceResultV2;
    mutate: (inference: OpenEnaInferenceResultV2) => void;
  }> = [
    {
      label: "endpoint primary count drift",
      fixture: fixtures.endpoint,
      inference: fixtures.endpointInference,
      mutate(inference) {
        if (inference.kind !== "endpoint-independent" || !inference.ledger) {
          assert.fail("expected endpoint ledger");
        }
        inference.ledger.primaryAvailableCount += 1;
      },
    },
    {
      label: "paired zero-count axis drift",
      fixture: fixtures.trajectory,
      inference: fixtures.pairedInference,
      mutate(inference) {
        if (inference.kind !== "trajectory-paired-periods" || !inference.ledger) {
          assert.fail("expected paired ledger");
        }
        inference.ledger.axes[0].zeroDifferenceCount += 1;
      },
    },
    {
      label: "repeated complete-cohort drift",
      fixture: fixtures.trajectory,
      inference: fixtures.repeatedInference,
      mutate(inference) {
        if (inference.kind !== "trajectory-repeated-periods" || !inference.ledger) {
          assert.fail("expected repeated ledger");
        }
        inference.ledger.completeBlockCount += 1;
      },
    },
  ];

  for (const { label, fixture, inference, mutate } of cases) {
    const forged = structuredClone(inference);
    mutate(forged);
    const bundle = buildAnalysisBundle(
      fixture.dataset,
      fixture.configuration,
      fixture.result,
      HASH,
      { methodsDimensions: fixture.axes, inference },
    );
    const forgedBundle = structuredClone(bundle);
    forgedBundle.inference = forged;
    assert.throws(
      () => parseOpenEnaInferenceResultV2(forged),
      hasExactErrorMessage(INFERENCE_LEDGER_AUDIT_ERROR),
      `${label} standalone`,
    );
    assert.throws(
      () => parseOpenEnaAnalysisBundle(JSON.stringify(forgedBundle)),
      hasExactErrorMessage(INFERENCE_LEDGER_AUDIT_ERROR),
      `${label} bundle`,
    );
  }
});

test("resolved methods obey every exact-first threshold and tie or zero branch", async () => {
  const fixtures = await allInferenceFixtures();
  const endpointApproximation = endpointApproximationFixture();
  const endpointApproximationInference = await runInference(endpointApproximation, {
    kind: "endpoint-independent",
    primaryGroup: "Primary",
    secondaryGroup: "Secondary",
    axes: endpointApproximation.axes,
  });
  const currentBinding = {
    datasetNormalizedUtf8TextSha256: HASH,
    datasetHashKind: HASH_KIND,
    configuration: fixtures.trajectory.configuration,
  } as const;
  const pairedApproximationInference = await runOpenEnaInferenceV2({
    request: {
      kind: "trajectory-paired-periods",
      repeatedEntityColumns: ["Group", "Name"],
      timeColumn: "Period",
      group: "Control",
      earlierPeriod: "T1",
      laterPeriod: "T2",
      axes: fixtures.trajectory.axes,
      cohortPolicy: "pairwise-complete",
    },
    result: fixtures.trajectory.result,
    currentBinding,
    comparisonFrame: trajectoryComparisonFrameWithCoordinates(fixtures.trajectory, 51),
  });
  const friedmanApproximationInference = await runOpenEnaInferenceV2({
    request: {
      kind: "trajectory-repeated-periods",
      repeatedEntityColumns: ["Group", "Name"],
      timeColumn: "Period",
      group: "Control",
      periods: ["T1", "T2", "T3"],
      axes: fixtures.trajectory.axes,
      cohortPolicy: "all-period-complete",
      posthocContrasts: "all-period-pairs",
    },
    result: fixtures.trajectory.result,
    currentBinding,
    comparisonFrame: trajectoryComparisonFrameWithCoordinates(fixtures.trajectory, 8),
  });
  const fakeExactTail = {
    extremeAssignmentCount: "1",
    totalAssignmentCount: "2",
    inclusive: true as const,
    midP: false as const,
  };
  const cases: Array<{
    label: string;
    fixture: typeof fixtures.endpoint | typeof fixtures.trajectory | typeof endpointApproximation;
    inference: OpenEnaInferenceResultV2;
    mutate: (inference: OpenEnaInferenceResultV2) => void;
  }> = [
    {
      label: "small Mann–Whitney claims normal approximation",
      fixture: fixtures.endpoint,
      inference: fixtures.endpointInference,
      mutate(inference) {
        if (inference.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
        inference.rows[0].resolvedPMethod = "normal-approximation-tie-corrected";
        inference.rows[0].exactTail = null;
        inference.rows[0].continuityCorrectionApplied = true;
      },
    },
    {
      label: "tied Mann–Whitney claims classic exact",
      fixture: fixtures.endpoint,
      inference: fixtures.endpointInference,
      mutate(inference) {
        if (inference.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
        inference.rows[0].tieGroupCount = Math.max(1, inference.rows[0].tieGroupCount);
        inference.rows[0].tiedObservationCount = Math.max(2, inference.rows[0].tiedObservationCount);
        inference.rows[0].tieCorrectionSum = Math.max(6, inference.rows[0].tieCorrectionSum);
        inference.rows[0].resolvedPMethod = "exact-classic";
      },
    },
    {
      label: "untied Mann–Whitney claims conditional exact",
      fixture: fixtures.endpoint,
      inference: fixtures.endpointInference,
      mutate(inference) {
        if (inference.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
        inference.rows[0].tieGroupCount = 0;
        inference.rows[0].tiedObservationCount = 0;
        inference.rows[0].tieCorrectionSum = 0;
        inference.rows[0].resolvedPMethod = "exact-conditional-rank-permutation";
      },
    },
    {
      label: "large Mann–Whitney claims exact",
      fixture: endpointApproximation,
      inference: endpointApproximationInference,
      mutate(inference) {
        if (inference.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
        inference.rows[0].resolvedPMethod = inference.rows[0].tieGroupCount === 0
          ? "exact-classic"
          : "exact-conditional-rank-permutation";
        inference.rows[0].exactTail = structuredClone(fakeExactTail);
        inference.rows[0].continuityCorrectionApplied = false;
      },
    },
    {
      label: "small Wilcoxon claims normal approximation",
      fixture: fixtures.trajectory,
      inference: fixtures.pairedInference,
      mutate(inference) {
        if (inference.kind !== "trajectory-paired-periods") assert.fail("expected paired inference");
        inference.rows[0].resolvedPMethod = "normal-approximation-actual-ranks";
        inference.rows[0].exactTail = null;
        inference.rows[0].continuityCorrectionApplied = true;
      },
    },
    {
      label: "tied Wilcoxon claims classic exact",
      fixture: fixtures.trajectory,
      inference: fixtures.pairedInference,
      mutate(inference) {
        if (inference.kind !== "trajectory-paired-periods") assert.fail("expected paired inference");
        inference.rows[0].tieGroupCount = Math.max(1, inference.rows[0].tieGroupCount);
        inference.rows[0].tiedObservationCount = Math.max(2, inference.rows[0].tiedObservationCount);
        inference.rows[0].tieCorrectionSum = Math.max(6, inference.rows[0].tieCorrectionSum);
        inference.rows[0].resolvedPMethod = "exact-classic";
      },
    },
    {
      label: "untied zero-free Wilcoxon claims conditional exact",
      fixture: fixtures.trajectory,
      inference: fixtures.pairedInference,
      mutate(inference) {
        if (inference.kind !== "trajectory-paired-periods") assert.fail("expected paired inference");
        inference.rows[0].tieGroupCount = 0;
        inference.rows[0].tiedObservationCount = 0;
        inference.rows[0].tieCorrectionSum = 0;
        inference.rows[0].nZero = 0;
        inference.rows[0].nMatched = inference.rows[0].nNonzero;
        inference.rows[0].resolvedPMethod = "exact-conditional-sign-flip";
      },
    },
    {
      label: "large Wilcoxon claims exact",
      fixture: fixtures.trajectory,
      inference: pairedApproximationInference,
      mutate(inference) {
        if (inference.kind !== "trajectory-paired-periods") assert.fail("expected paired inference");
        inference.rows[0].resolvedPMethod = inference.rows[0].tieGroupCount === 0
          && inference.rows[0].nZero === 0
          ? "exact-classic"
          : "exact-conditional-sign-flip";
        inference.rows[0].exactTail = structuredClone(fakeExactTail);
        inference.rows[0].continuityCorrectionApplied = false;
      },
    },
    {
      label: "small Friedman assignment space claims chi-square approximation",
      fixture: fixtures.trajectory,
      inference: fixtures.repeatedInference,
      mutate(inference) {
        if (inference.kind !== "trajectory-repeated-periods") assert.fail("expected repeated inference");
        inference.omnibusRows[0].resolvedPMethod = "chi-square-approximation-tie-corrected";
        inference.omnibusRows[0].exactTail = null;
      },
    },
    {
      label: "large Friedman assignment space claims exact",
      fixture: fixtures.trajectory,
      inference: friedmanApproximationInference,
      mutate(inference) {
        if (inference.kind !== "trajectory-repeated-periods") assert.fail("expected repeated inference");
        inference.omnibusRows[0].resolvedPMethod = "exact-conditional-period-permutation";
        inference.omnibusRows[0].exactTail = structuredClone(fakeExactTail);
      },
    },
  ];

  for (const { label, fixture, inference, mutate } of cases) {
    const forged = structuredClone(inference);
    mutate(forged);
    const bundle = buildAnalysisBundle(
      fixture.dataset,
      fixture.configuration,
      fixture.result,
      HASH,
      { methodsDimensions: fixture.axes, inference },
    );
    const forgedBundle = structuredClone(bundle);
    forgedBundle.inference = forged;
    assert.throws(
      () => parseOpenEnaInferenceResultV2(forged),
      hasExactErrorMessage(INFERENCE_EXACT_FIRST_ERROR),
      `${label} standalone`,
    );
    assert.throws(
      () => parseOpenEnaAnalysisBundle(JSON.stringify(forgedBundle)),
      hasExactErrorMessage(INFERENCE_EXACT_FIRST_ERROR),
      `${label} bundle`,
    );
  }
});

test("Wilcoxon minimum attainable p audit is exactly derived from nNonzero", async () => {
  const fixtures = await allInferenceFixtures();
  const largeInference = await runOpenEnaInferenceV2({
    request: {
      kind: "trajectory-paired-periods",
      repeatedEntityColumns: ["Group", "Name"],
      timeColumn: "Period",
      group: "Control",
      earlierPeriod: "T1",
      laterPeriod: "T2",
      axes: fixtures.trajectory.axes,
      cohortPolicy: "pairwise-complete",
    },
    result: fixtures.trajectory.result,
    currentBinding: {
      datasetNormalizedUtf8TextSha256: HASH,
      datasetHashKind: HASH_KIND,
      configuration: fixtures.trajectory.configuration,
    },
    comparisonFrame: trajectoryComparisonFrameWithCoordinates(fixtures.trajectory, 1_076),
  });
  if (largeInference.kind !== "trajectory-paired-periods") assert.fail("expected paired inference");
  if (fixtures.pairedInference.kind !== "trajectory-paired-periods") {
    assert.fail("expected paired inference fixture");
  }
  const pairedInference = fixtures.pairedInference;
  assert.ok(largeInference.rows.every((row) => (
    row.nNonzero === 1_076
    && row.minimumAttainableTwoSidedP?.log2 === -1_075
    && row.minimumAttainableTwoSidedP.numeric === null
  )));
  const cases: Array<{
    label: string;
    inference: Extract<OpenEnaInferenceResultV2, { kind: "trajectory-paired-periods" }>;
    mutate: (inference: Extract<OpenEnaInferenceResultV2, { kind: "trajectory-paired-periods" }>) => void;
  }> = [
    {
      label: "wrong log2",
      inference: pairedInference,
      mutate(inference) {
        if (!inference.rows[0].minimumAttainableTwoSidedP) assert.fail("expected minimum-p audit");
        inference.rows[0].minimumAttainableTwoSidedP.log2 = 999;
      },
    },
    {
      label: "negative numeric p",
      inference: pairedInference,
      mutate(inference) {
        if (!inference.rows[0].minimumAttainableTwoSidedP) assert.fail("expected minimum-p audit");
        inference.rows[0].minimumAttainableTwoSidedP.numeric = -7;
      },
    },
    {
      label: "wrong finite numeric p",
      inference: pairedInference,
      mutate(inference) {
        if (!inference.rows[0].minimumAttainableTwoSidedP) assert.fail("expected minimum-p audit");
        inference.rows[0].minimumAttainableTwoSidedP.numeric = 0.75;
      },
    },
    {
      label: "premature numeric underflow marker",
      inference: pairedInference,
      mutate(inference) {
        if (!inference.rows[0].minimumAttainableTwoSidedP) assert.fail("expected minimum-p audit");
        inference.rows[0].minimumAttainableTwoSidedP.numeric = null;
      },
    },
    {
      label: "numeric value retained beyond the underflow boundary",
      inference: largeInference,
      mutate(inference) {
        if (!inference.rows[0].minimumAttainableTwoSidedP) assert.fail("expected minimum-p audit");
        inference.rows[0].minimumAttainableTwoSidedP.numeric = Number.MIN_VALUE;
      },
    },
  ];

  for (const { label, inference, mutate } of cases) {
    const forged = structuredClone(inference);
    mutate(forged);
    const bundle = buildAnalysisBundle(
      fixtures.trajectory.dataset,
      fixtures.trajectory.configuration,
      fixtures.trajectory.result,
      HASH,
      { methodsDimensions: fixtures.trajectory.axes, inference },
    );
    const forgedBundle = structuredClone(bundle);
    forgedBundle.inference = forged;
    assert.throws(
      () => parseOpenEnaInferenceResultV2(forged),
      hasExactErrorMessage(INFERENCE_MINIMUM_P_ERROR),
      `${label} standalone`,
    );
    assert.throws(
      () => parseOpenEnaAnalysisBundle(JSON.stringify(forgedBundle)),
      hasExactErrorMessage(INFERENCE_MINIMUM_P_ERROR),
      `${label} bundle`,
    );
  }

  assert.deepEqual(parseOpenEnaInferenceResultV2(structuredClone(largeInference)), largeInference);
});

test("exact-tail counts, assignment totals, and raw p-values remain arithmetically coherent", async () => {
  const fixtures = await allInferenceFixtures();
  const cases: Array<{
    label: string;
    fixture: typeof fixtures.endpoint | typeof fixtures.trajectory;
    inference: OpenEnaInferenceResultV2;
    mutate: (inference: OpenEnaInferenceResultV2) => void;
  }> = [
    {
      label: "zero extreme assignments",
      fixture: fixtures.endpoint,
      inference: fixtures.endpointInference,
      mutate(inference) {
        if (inference.kind !== "endpoint-independent" || !inference.rows[0].exactTail) {
          assert.fail("expected endpoint exact tail");
        }
        inference.rows[0].exactTail.extremeAssignmentCount = "0";
      },
    },
    {
      label: "extreme assignments exceed total",
      fixture: fixtures.endpoint,
      inference: fixtures.endpointInference,
      mutate(inference) {
        if (inference.kind !== "endpoint-independent" || !inference.rows[0].exactTail) {
          assert.fail("expected endpoint exact tail");
        }
        inference.rows[0].exactTail.extremeAssignmentCount = (
          BigInt(inference.rows[0].exactTail.totalAssignmentCount) + BigInt(1)
        ).toString();
      },
    },
    {
      label: "raw p disagrees with exact counts",
      fixture: fixtures.endpoint,
      inference: fixtures.endpointInference,
      mutate(inference) {
        if (inference.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
        inference.rows[0].pRaw = inference.rows[0].pRaw === 1 ? 0.5 : 1;
      },
    },
    {
      label: "Mann–Whitney assignment total is not the fixed-size combination count",
      fixture: fixtures.endpoint,
      inference: fixtures.endpointInference,
      mutate(inference) {
        if (inference.kind !== "endpoint-independent" || !inference.rows[0].exactTail) {
          assert.fail("expected endpoint exact tail");
        }
        const audit = inference.rows[0].exactTail;
        audit.totalAssignmentCount = (BigInt(audit.totalAssignmentCount) + BigInt(1)).toString();
        inference.rows[0].pRaw = Number(BigInt(audit.extremeAssignmentCount))
          / Number(BigInt(audit.totalAssignmentCount));
      },
    },
    {
      label: "Wilcoxon assignment total is not two to nNonzero",
      fixture: fixtures.trajectory,
      inference: fixtures.pairedInference,
      mutate(inference) {
        if (inference.kind !== "trajectory-paired-periods" || !inference.rows[0].exactTail) {
          assert.fail("expected paired exact tail");
        }
        const audit = inference.rows[0].exactTail;
        audit.totalAssignmentCount = (BigInt(audit.totalAssignmentCount) + BigInt(1)).toString();
        inference.rows[0].pRaw = Number(BigInt(audit.extremeAssignmentCount))
          / Number(BigInt(audit.totalAssignmentCount));
      },
    },
    {
      label: "Friedman assignment total is not factorial to complete blocks",
      fixture: fixtures.trajectory,
      inference: fixtures.repeatedInference,
      mutate(inference) {
        if (inference.kind !== "trajectory-repeated-periods"
          || !inference.omnibusRows[0].exactTail) {
          assert.fail("expected Friedman exact tail");
        }
        const row = inference.omnibusRows[0];
        const audit = row.exactTail!;
        audit.totalAssignmentCount = (BigInt(audit.totalAssignmentCount) + BigInt(1)).toString();
        row.pRaw = Number(BigInt(audit.extremeAssignmentCount))
          / Number(BigInt(audit.totalAssignmentCount));
      },
    },
  ];

  for (const { label, fixture, inference, mutate } of cases) {
    const forged = structuredClone(inference);
    mutate(forged);
    const bundle = buildAnalysisBundle(
      fixture.dataset,
      fixture.configuration,
      fixture.result,
      HASH,
      { methodsDimensions: fixture.axes, inference },
    );
    const forgedBundle = structuredClone(bundle);
    forgedBundle.inference = forged;
    assert.throws(
      () => parseOpenEnaInferenceResultV2(forged),
      hasExactErrorMessage(INFERENCE_EXACT_TAIL_ERROR),
      `${label} standalone`,
    );
    assert.throws(
      () => parseOpenEnaAnalysisBundle(JSON.stringify(forgedBundle)),
      hasExactErrorMessage(INFERENCE_EXACT_TAIL_ERROR),
      `${label} bundle`,
    );
  }
});

test("Holm audit is reconstructed over every planned member including null-p placeholders", async () => {
  const { endpoint, endpointInference } = await allInferenceFixtures();
  const cases: Array<{
    label: string;
    mutate: (inference: Extract<OpenEnaInferenceResultV2, { kind: "endpoint-independent" }>) => void;
  }> = [
    {
      label: "forged Holm p",
      mutate(inference) {
        inference.rows[0].pHolm = inference.rows[0].pHolm === 1 ? 0.5 : 1;
      },
    },
    {
      label: "forged Holm rank",
      mutate(inference) {
        inference.rows[0].holmRank = inference.rows[0].holmRank === 1 ? 2 : 1;
      },
    },
    {
      label: "forged Holm multiplier",
      mutate(inference) {
        inference.rows[0].holmMultiplier = inference.rows[0].holmMultiplier === 1 ? 2 : 1;
      },
    },
    {
      label: "planned null member incorrectly removed from the multiplier",
      mutate(inference) {
        markRowNotEstimable(
          inference.rows[0] as unknown as Record<string, unknown>,
          "all-values-tied",
        );
        inference.rows[0].z = null;
        const available = inference.rows[1];
        if (available.pRaw === null) assert.fail("expected available planned member");
        available.pHolm = available.pRaw;
        available.holmRank = 1;
        available.holmMultiplier = 1;
      },
    },
  ];
  const bundle = buildAnalysisBundle(
    endpoint.dataset,
    endpoint.configuration,
    endpoint.result,
    HASH,
    { inference: endpointInference },
  );

  for (const { label, mutate } of cases) {
    const forged = structuredClone(endpointInference);
    if (forged.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
    mutate(forged);
    const forgedBundle = structuredClone(bundle);
    forgedBundle.inference = forged;
    assert.throws(
      () => parseOpenEnaInferenceResultV2(forged),
      hasExactErrorMessage(INFERENCE_HOLM_AUDIT_ERROR),
      `${label} standalone`,
    );
    assert.throws(
      () => parseOpenEnaAnalysisBundle(JSON.stringify(forgedBundle)),
      hasExactErrorMessage(INFERENCE_HOLM_AUDIT_ERROR),
      `${label} bundle`,
    );
  }
});

test("strict readers round-trip genuine coordinator not-estimable audits", async () => {
  const trajectory = trajectoryFixture();
  const currentBinding = {
    datasetNormalizedUtf8TextSha256: HASH,
    datasetHashKind: HASH_KIND,
    configuration: trajectory.configuration,
  } as const;

  const allTiedFrame = structuredClone(trajectory.derivation.comparisonFrame);
  allTiedFrame.points.forEach((point) => {
    if (point.time === "T1") {
      point.x = 1;
      point.y = 1;
    }
  });
  const allTied = await runOpenEnaInferenceV2({
    request: {
      kind: "trajectory-independent-period",
      repeatedEntityColumns: ["Group", "Name"],
      timeColumn: "Period",
      period: "T1",
      primaryGroup: "Control",
      secondaryGroup: "Experimental",
      axes: trajectory.axes,
    },
    result: trajectory.result,
    currentBinding,
    comparisonFrame: allTiedFrame,
  });

  const allZeroFrame = trajectoryComparisonFrameWithCoordinates(trajectory, 4);
  for (const entityToken of new Set(allZeroFrame.points.map((point) => point.entityToken))) {
    const earlier = allZeroFrame.points.find((point) => (
      point.entityToken === entityToken && point.time === "T1"
    ));
    const later = allZeroFrame.points.find((point) => (
      point.entityToken === entityToken && point.time === "T2"
    ));
    if (!earlier || !later) assert.fail("expected complete paired fixture");
    later.x = earlier.x;
    later.y = earlier.y;
  }
  const allZero = await runOpenEnaInferenceV2({
    request: {
      kind: "trajectory-paired-periods",
      repeatedEntityColumns: ["Group", "Name"],
      timeColumn: "Period",
      group: "Control",
      earlierPeriod: "T1",
      laterPeriod: "T2",
      axes: trajectory.axes,
      cohortPolicy: "pairwise-complete",
    },
    result: trajectory.result,
    currentBinding,
    comparisonFrame: allZeroFrame,
  });

  const noCompleteFrame = structuredClone(trajectory.derivation.comparisonFrame);
  noCompleteFrame.points = [];
  const noComplete = await runOpenEnaInferenceV2({
    request: {
      kind: "trajectory-repeated-periods",
      repeatedEntityColumns: ["Group", "Name"],
      timeColumn: "Period",
      group: "Control",
      periods: ["T1", "T2", "T3"],
      axes: trajectory.axes,
      cohortPolicy: "all-period-complete",
      posthocContrasts: "all-period-pairs",
    },
    result: trajectory.result,
    currentBinding,
    comparisonFrame: noCompleteFrame,
  });

  assert.equal(allTied.status, "not-estimable");
  assert.equal(allTied.reason, "all-values-tied");
  assert.equal(allZero.status, "not-estimable");
  assert.equal(allZero.reason, "all-zero-differences");
  assert.equal(noComplete.status, "not-estimable");
  assert.equal(noComplete.reason, "no-complete-blocks");

  for (const inference of [allTied, allZero, noComplete]) {
    assert.deepEqual(parseOpenEnaInferenceResultV2(structuredClone(inference)), inference);
    const bundle = buildAnalysisBundle(
      trajectory.dataset,
      trajectory.configuration,
      trajectory.result,
      HASH,
      { methodsDimensions: trajectory.axes, inference },
    );
    assert.deepEqual(parseOpenEnaAnalysisBundle(JSON.stringify(bundle)).inference, inference);
  }
});

test("not-estimable rows cannot retain inferential p-value or Holm audit state", async () => {
  const { endpoint, endpointInference } = await allInferenceFixtures();
  const forged = structuredClone(endpointInference);
  if (forged.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
  forged.status = "not-estimable";
  forged.reason = "all-values-tied";
  forged.rows.forEach((row) => {
    row.status = "not-estimable";
    row.reason = "all-values-tied";
    // Deliberately retain the coordinator's available p/method/Holm audit fields.
  });
  const bundle = buildAnalysisBundle(
    endpoint.dataset,
    endpoint.configuration,
    endpoint.result,
    HASH,
    { inference: endpointInference },
  );
  const forgedBundle = structuredClone(bundle);
  forgedBundle.inference = forged;

  assert.throws(
    () => parseOpenEnaInferenceResultV2(forged),
    /not-estimable|status|p-values|Holm|method/i,
  );
  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(forgedBundle)),
    /not-estimable|status|p-values|Holm|method/i,
  );
});

test("not-estimable rows cannot retain an exact-tail audit", async () => {
  const { endpoint, endpointInference } = await allInferenceFixtures();
  const forged = structuredClone(endpointInference);
  if (forged.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
  forged.status = "not-estimable";
  forged.reason = "all-values-tied";
  forged.rows.forEach((row) => {
    assert.ok(row.exactTail, "fixture must begin with an exact-tail audit");
    row.status = "not-estimable";
    row.reason = "all-values-tied";
    row.pRaw = null;
    row.pHolm = null;
    row.resolvedPMethod = null;
    row.holmRank = null;
    row.holmMultiplier = null;
    // Deliberately retain exactTail after clearing all p-value state.
  });
  const bundle = buildAnalysisBundle(
    endpoint.dataset,
    endpoint.configuration,
    endpoint.result,
    HASH,
    { inference: endpointInference },
  );
  const forgedBundle = structuredClone(bundle);
  forgedBundle.inference = forged;

  assert.throws(
    () => parseOpenEnaInferenceResultV2(forged),
    /not-estimable|status|exact-tail|audit/i,
  );
  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(forgedBundle)),
    /not-estimable|status|exact-tail|audit/i,
  );
});

test("not-estimable rows cannot claim that a continuity correction was applied", async () => {
  const { endpoint, endpointInference } = await allInferenceFixtures();
  const forged = structuredClone(endpointInference);
  if (forged.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
  forged.status = "not-estimable";
  forged.reason = "all-values-tied";
  forged.rows.forEach((row) => {
    row.status = "not-estimable";
    row.reason = "all-values-tied";
    row.pRaw = null;
    row.pHolm = null;
    row.resolvedPMethod = null;
    row.holmRank = null;
    row.holmMultiplier = null;
    row.exactTail = null;
    row.continuityCorrectionApplied = true;
  });
  const bundle = buildAnalysisBundle(
    endpoint.dataset,
    endpoint.configuration,
    endpoint.result,
    HASH,
    { inference: endpointInference },
  );
  const forgedBundle = structuredClone(bundle);
  forgedBundle.inference = forged;

  assert.throws(
    () => parseOpenEnaInferenceResultV2(forged),
    /not-estimable|status|continuity|correction/i,
  );
  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(forgedBundle)),
    /not-estimable|status|continuity|correction/i,
  );
});

test("not-estimable Wilcoxon rows cannot retain a minimum attainable p audit", async () => {
  const { trajectory, pairedInference } = await allInferenceFixtures();
  const forged = structuredClone(pairedInference);
  if (forged.kind !== "trajectory-paired-periods") assert.fail("expected paired inference");
  forged.status = "not-estimable";
  forged.reason = "all-zero-differences";
  forged.rows.forEach((row) => {
    assert.ok(row.minimumAttainableTwoSidedP, "fixture must begin with a minimum-p audit");
    row.status = "not-estimable";
    row.reason = "all-zero-differences";
    row.pRaw = null;
    row.pHolm = null;
    row.resolvedPMethod = null;
    row.holmRank = null;
    row.holmMultiplier = null;
    row.exactTail = null;
    row.continuityCorrectionApplied = false;
    // Deliberately retain minimumAttainableTwoSidedP after clearing p-value state.
  });
  const bundle = buildAnalysisBundle(
    trajectory.dataset,
    trajectory.configuration,
    trajectory.result,
    HASH,
    { methodsDimensions: trajectory.axes, inference: pairedInference },
  );
  const forgedBundle = structuredClone(bundle);
  forgedBundle.inference = forged;

  assert.throws(
    () => parseOpenEnaInferenceResultV2(forged),
    /not-estimable|status|minimum|attainable|audit/i,
  );
  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(forgedBundle)),
    /not-estimable|status|minimum|attainable|audit/i,
  );
});

test("a not-estimable result requires a stable overall reason", async () => {
  const { endpoint, endpointInference } = await allInferenceFixtures();
  const forged = structuredClone(endpointInference);
  if (forged.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
  forged.status = "not-estimable";
  forged.reason = null;
  forged.rows.forEach((row) => {
    row.status = "not-estimable";
    row.reason = "all-values-tied";
    row.pRaw = null;
    row.pHolm = null;
    row.resolvedPMethod = null;
    row.holmRank = null;
    row.holmMultiplier = null;
    row.exactTail = null;
    row.continuityCorrectionApplied = false;
  });
  const bundle = buildAnalysisBundle(
    endpoint.dataset,
    endpoint.configuration,
    endpoint.result,
    HASH,
    { inference: endpointInference },
  );
  const forgedBundle = structuredClone(bundle);
  forgedBundle.inference = forged;

  assert.throws(
    () => parseOpenEnaInferenceResultV2(forged),
    /not-estimable|overall|reason|status/i,
  );
  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(forgedBundle)),
    /not-estimable|overall|reason|status/i,
  );
});

test("available rows cannot retain a not-estimable reason", async () => {
  const { endpoint, endpointInference } = await allInferenceFixtures();
  const forged = structuredClone(endpointInference);
  if (forged.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
  forged.rows[0].reason = "all-values-tied";
  const bundle = buildAnalysisBundle(
    endpoint.dataset,
    endpoint.configuration,
    endpoint.result,
    HASH,
    { inference: endpointInference },
  );
  const forgedBundle = structuredClone(bundle);
  forgedBundle.inference = forged;

  assert.throws(
    () => parseOpenEnaInferenceResultV2(forged),
    /available|reason|status/i,
  );
  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(forgedBundle)),
    /available|reason|status/i,
  );
});

test("available rows require complete p-value, method, and Holm audit state", async () => {
  const { endpoint, endpointInference } = await allInferenceFixtures();
  const bundle = buildAnalysisBundle(
    endpoint.dataset,
    endpoint.configuration,
    endpoint.result,
    HASH,
    { inference: endpointInference },
  );
  type EndpointRow = Extract<
    OpenEnaInferenceResultV2,
    { kind: "endpoint-independent" }
  >["rows"][number];
  const cases: Array<{ label: string; mutate: (row: EndpointRow) => void }> = [
    {
      label: "missing raw and Holm p-values",
      mutate(row) { row.pRaw = null; row.pHolm = null; },
    },
    {
      label: "missing Holm p-value",
      mutate(row) { row.pHolm = null; },
    },
    {
      label: "missing resolved method",
      mutate(row) { row.resolvedPMethod = null; },
    },
    {
      label: "missing Holm rank",
      mutate(row) { row.holmRank = null; },
    },
    {
      label: "missing Holm multiplier",
      mutate(row) { row.holmMultiplier = null; },
    },
    {
      label: "invalid Holm rank",
      mutate(row) { row.holmRank = 0; },
    },
    {
      label: "invalid Holm multiplier",
      mutate(row) { row.holmMultiplier = 0; },
    },
  ];
  for (const { label, mutate } of cases) {
    const forged = structuredClone(endpointInference);
    if (forged.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
    mutate(forged.rows[0]);
    const forgedBundle = structuredClone(bundle);
    forgedBundle.inference = forged;

    assert.throws(
      () => parseOpenEnaInferenceResultV2(forged),
      /available|p-values|resolved|method|status|Holm/i,
      `${label} standalone`,
    );
    assert.throws(
      () => parseOpenEnaAnalysisBundle(JSON.stringify(forgedBundle)),
      /available|p-values|resolved|method|status|Holm/i,
      `${label} bundle`,
    );
  }
});

test("available rows reject a resolved p-value method from another rank test", async () => {
  const { endpoint, endpointInference } = await allInferenceFixtures();
  const forged = structuredClone(endpointInference);
  if (forged.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
  forged.rows[0].resolvedPMethod = "exact-conditional-sign-flip";
  const bundle = buildAnalysisBundle(
    endpoint.dataset,
    endpoint.configuration,
    endpoint.result,
    HASH,
    { inference: endpointInference },
  );
  const forgedBundle = structuredClone(bundle);
  forgedBundle.inference = forged;

  assert.throws(
    () => parseOpenEnaInferenceResultV2(forged),
    /resolved|method|Mann|test/i,
  );
  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(forgedBundle)),
    /resolved|method|Mann|test/i,
  );
});

test("an available exact row requires its exact-tail audit", async () => {
  const { endpoint, endpointInference } = await allInferenceFixtures();
  const forged = structuredClone(endpointInference);
  if (forged.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
  assert.match(forged.rows[0].resolvedPMethod ?? "", /^exact-/);
  forged.rows[0].exactTail = null;
  const bundle = buildAnalysisBundle(
    endpoint.dataset,
    endpoint.configuration,
    endpoint.result,
    HASH,
    { inference: endpointInference },
  );
  const forgedBundle = structuredClone(bundle);
  forgedBundle.inference = forged;

  assert.throws(
    () => parseOpenEnaInferenceResultV2(forged),
    isInconsistentRowMethodAuditError,
  );
  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(forgedBundle)),
    isInconsistentRowMethodAuditError,
  );
});

test("an available exact row cannot claim a continuity correction", async () => {
  const { endpoint, endpointInference } = await allInferenceFixtures();
  const forged = structuredClone(endpointInference);
  if (forged.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
  assert.match(forged.rows[0].resolvedPMethod ?? "", /^exact-/);
  assert.ok(forged.rows[0].exactTail);
  forged.rows[0].continuityCorrectionApplied = true;
  const bundle = buildAnalysisBundle(
    endpoint.dataset,
    endpoint.configuration,
    endpoint.result,
    HASH,
    { inference: endpointInference },
  );
  const forgedBundle = structuredClone(bundle);
  forgedBundle.inference = forged;

  assert.throws(
    () => parseOpenEnaInferenceResultV2(forged),
    /exact|continuity|method|audit/i,
  );
  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(forgedBundle)),
    /exact|continuity|method|audit/i,
  );
});

test("an available approximation row cannot retain an exact-tail audit", async () => {
  const { endpoint, endpointInference } = await allInferenceFixtures();
  const forged = structuredClone(endpointInference);
  if (forged.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
  assert.ok(forged.rows[0].exactTail);
  forged.rows[0].resolvedPMethod = "normal-approximation-tie-corrected";
  forged.rows[0].continuityCorrectionApplied = true;
  const bundle = buildAnalysisBundle(
    endpoint.dataset,
    endpoint.configuration,
    endpoint.result,
    HASH,
    { inference: endpointInference },
  );
  const forgedBundle = structuredClone(bundle);
  forgedBundle.inference = forged;

  assert.throws(
    () => parseOpenEnaInferenceResultV2(forged),
    /approximation|exact-tail|method|audit/i,
  );
  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(forgedBundle)),
    /approximation|exact-tail|method|audit/i,
  );
});

test("available approximation rows require method-specific continuity audit state", async () => {
  const fixtures = await allInferenceFixtures();
  const endpointBundle = buildAnalysisBundle(
    fixtures.endpoint.dataset,
    fixtures.endpoint.configuration,
    fixtures.endpoint.result,
    HASH,
    { inference: fixtures.endpointInference },
  );
  const pairedBundle = buildAnalysisBundle(
    fixtures.trajectory.dataset,
    fixtures.trajectory.configuration,
    fixtures.trajectory.result,
    HASH,
    { methodsDimensions: fixtures.trajectory.axes, inference: fixtures.pairedInference },
  );
  const repeatedBundle = buildAnalysisBundle(
    fixtures.trajectory.dataset,
    fixtures.trajectory.configuration,
    fixtures.trajectory.result,
    HASH,
    { methodsDimensions: fixtures.trajectory.axes, inference: fixtures.repeatedInference },
  );
  const cases: Array<{
    label: string;
    inference: OpenEnaInferenceResultV2;
    bundle: ReturnType<typeof buildAnalysisBundle>;
    mutate: (inference: OpenEnaInferenceResultV2) => void;
  }> = [
    {
      label: "Mann–Whitney normal approximation without continuity correction",
      inference: fixtures.endpointInference,
      bundle: endpointBundle,
      mutate(inference) {
        if (inference.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
        inference.rows[0].resolvedPMethod = "normal-approximation-tie-corrected";
        inference.rows[0].exactTail = null;
        inference.rows[0].continuityCorrectionApplied = false;
      },
    },
    {
      label: "Wilcoxon normal approximation without continuity correction",
      inference: fixtures.pairedInference,
      bundle: pairedBundle,
      mutate(inference) {
        if (inference.kind !== "trajectory-paired-periods") assert.fail("expected paired inference");
        inference.rows[0].resolvedPMethod = "normal-approximation-actual-ranks";
        inference.rows[0].exactTail = null;
        inference.rows[0].continuityCorrectionApplied = false;
      },
    },
    {
      label: "Friedman chi-square approximation with continuity correction",
      inference: fixtures.repeatedInference,
      bundle: repeatedBundle,
      mutate(inference) {
        if (inference.kind !== "trajectory-repeated-periods") assert.fail("expected repeated inference");
        inference.omnibusRows[0].resolvedPMethod = "chi-square-approximation-tie-corrected";
        inference.omnibusRows[0].exactTail = null;
        inference.omnibusRows[0].continuityCorrectionApplied = true;
      },
    },
  ];

  for (const { label, inference, bundle, mutate } of cases) {
    const forged = structuredClone(inference);
    mutate(forged);
    const forgedBundle = structuredClone(bundle);
    forgedBundle.inference = forged;

    assert.throws(
      () => parseOpenEnaInferenceResultV2(forged),
      /continuity|approximation|method|audit/i,
      `${label} standalone`,
    );
    assert.throws(
      () => parseOpenEnaAnalysisBundle(JSON.stringify(forgedBundle)),
      /continuity|approximation|method|audit/i,
      `${label} bundle`,
    );
  }
});

test("available Wilcoxon rows require the minimum attainable two-sided p audit", async () => {
  const { trajectory, pairedInference } = await allInferenceFixtures();
  const forged = structuredClone(pairedInference);
  if (forged.kind !== "trajectory-paired-periods") assert.fail("expected paired inference");
  assert.ok(forged.rows[0].minimumAttainableTwoSidedP);
  forged.rows[0].minimumAttainableTwoSidedP = null;
  const bundle = buildAnalysisBundle(
    trajectory.dataset,
    trajectory.configuration,
    trajectory.result,
    HASH,
    { methodsDimensions: trajectory.axes, inference: pairedInference },
  );
  const forgedBundle = structuredClone(bundle);
  forgedBundle.inference = forged;

  assert.throws(
    () => parseOpenEnaInferenceResultV2(forged),
    /Wilcoxon|minimum|attainable|method|audit/i,
  );
  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(forgedBundle)),
    /Wilcoxon|minimum|attainable|method|audit/i,
  );
});

test("strict readers round-trip genuine coordinator approximation audits", async () => {
  const endpoint = endpointApproximationFixture();
  const endpointInference = await runInference(endpoint, {
    kind: "endpoint-independent",
    primaryGroup: "Primary",
    secondaryGroup: "Secondary",
    axes: endpoint.axes,
  });
  if (endpointInference.kind !== "endpoint-independent") assert.fail("expected endpoint inference");
  assert.ok(endpointInference.rows.every((row) => (
    row.status === "available"
    && row.resolvedPMethod === "normal-approximation-tie-corrected"
    && row.exactTail === null
    && row.continuityCorrectionApplied
  )));

  const trajectory = trajectoryFixture();
  const currentBinding = {
    datasetNormalizedUtf8TextSha256: HASH,
    datasetHashKind: HASH_KIND,
    configuration: trajectory.configuration,
  } as const;
  const pairedInference = await runOpenEnaInferenceV2({
    request: {
      kind: "trajectory-paired-periods",
      repeatedEntityColumns: ["Group", "Name"],
      timeColumn: "Period",
      group: "Control",
      earlierPeriod: "T1",
      laterPeriod: "T2",
      axes: trajectory.axes,
      cohortPolicy: "pairwise-complete",
    },
    result: trajectory.result,
    currentBinding,
    comparisonFrame: trajectoryComparisonFrameWithCoordinates(trajectory, 51),
  });
  if (pairedInference.kind !== "trajectory-paired-periods") assert.fail("expected paired inference");
  assert.ok(pairedInference.rows.every((row) => (
    row.status === "available"
    && row.resolvedPMethod === "normal-approximation-actual-ranks"
    && row.exactTail === null
    && row.continuityCorrectionApplied
    && row.minimumAttainableTwoSidedP !== null
  )));

  const repeatedInference = await runOpenEnaInferenceV2({
    request: {
      kind: "trajectory-repeated-periods",
      repeatedEntityColumns: ["Group", "Name"],
      timeColumn: "Period",
      group: "Control",
      periods: ["T1", "T2", "T3"],
      axes: trajectory.axes,
      cohortPolicy: "all-period-complete",
      posthocContrasts: "all-period-pairs",
    },
    result: trajectory.result,
    currentBinding,
    comparisonFrame: trajectoryComparisonFrameWithCoordinates(trajectory, 8),
  });
  if (repeatedInference.kind !== "trajectory-repeated-periods") {
    assert.fail("expected repeated inference");
  }
  assert.ok(repeatedInference.omnibusRows.every((row) => (
    row.status === "available"
    && row.resolvedPMethod === "chi-square-approximation-tie-corrected"
    && row.exactTail === null
    && !row.continuityCorrectionApplied
  )));

  for (const { fixture, inference } of [
    { fixture: endpoint, inference: endpointInference },
    { fixture: trajectory, inference: pairedInference },
    { fixture: trajectory, inference: repeatedInference },
  ] as const) {
    const parsed = parseOpenEnaInferenceResultV2(structuredClone(inference));
    assert.deepEqual(parsed, inference);
    const bundle = buildAnalysisBundle(
      fixture.dataset,
      fixture.configuration,
      fixture.result,
      HASH,
      { methodsDimensions: fixture.axes, inference },
    );
    assert.deepEqual(parseOpenEnaAnalysisBundle(JSON.stringify(bundle)).inference, inference);
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

  const inferenceCsv = longitudinalInferenceRowsToCsv(
    trajectory.derivation.view,
    pairedInference,
  );
  const inferenceHeader = inferenceCsv.split("\r\n")[0];
  assert.match(inferenceHeader, /test,axisIndex,axis,status,reason/);
  assert.match(inferenceHeader, /familyId,memberId,familySizePlanned/);
  assert.match(inferenceHeader, /pRaw,pHolm/);
  assert.match(inferenceHeader, /nMatched,nMissing,nPositive,nNegative,nZero,nNonzero/);
  assert.match(inferenceHeader, /wPositive,wNegative,t,z,rankBiserialLaterVsEarlier/);
  assert.doesNotMatch(inferenceCsv, /entityToken|entityId|Control,Name|open-ena-entity-/i);

  const forgedViews = [
    {
      mutate(view: typeof trajectory.derivation.view) { view.identityConfirmed = false; },
      error: "Inference consumer binding mismatch.",
    },
    {
      mutate(view: typeof trajectory.derivation.view) {
        view.repeatedEntityColumns = [];
        view.repeatedEntityColumn = "Group";
      },
      error: "Inference consumer binding mismatch.",
    },
    {
      mutate(view: typeof trajectory.derivation.view) {
        view.repeatedEntityColumns = ["Name", "Group"];
      },
      error: "Inference consumer current context mismatch.",
    },
    {
      mutate(view: typeof trajectory.derivation.view) { view.timeColumn = "Wrong period field"; },
      error: "Inference consumer current context mismatch.",
    },
    {
      mutate(view: typeof trajectory.derivation.view) { view.timeOrder.reverse(); },
      error: "Inference consumer current context mismatch.",
    },
  ];
  for (const { mutate, error } of forgedViews) {
    const forged = structuredClone(trajectory.derivation.view);
    mutate(forged);
    assert.throws(
      () => buildLongitudinalGroupCentroidExport(forged, undefined, pairedInference),
      hasExactErrorMessage(error),
    );
  }
});

test("longitudinal inference CSV rejects inference axes that do not bind to the current view", async () => {
  const { trajectory, pairedInference } = await allInferenceFixtures();
  const forged = structuredClone(pairedInference);
  if (forged.kind !== "trajectory-paired-periods") assert.fail("expected paired inference");
  forged.request.axes.reverse();
  forged.binding.axes.reverse();
  forged.rows.forEach((row) => {
    row.axis = forged.request.axes[row.axisIndex];
  });
  const parsedForgery = parseOpenEnaInferenceResultV2(forged);

  assert.throws(
    () => longitudinalInferenceRowsToCsv(trajectory.derivation.view, parsedForgery),
    hasExactErrorMessage("Inference consumer authority mismatch."),
  );
});

test("longitudinal inference CSV rejects an unparsed mutable inference clone", async () => {
  const { trajectory, pairedInference } = await allInferenceFixtures();
  const unparsedClone = structuredClone(pairedInference);
  assert.equal(Object.isFrozen(unparsedClone), false);

  assert.throws(
    () => longitudinalInferenceRowsToCsv(trajectory.derivation.view, unparsedClone),
    hasExactErrorMessage("Inference consumer authority mismatch."),
  );
});

test("longitudinal inference CSV rejects a current-view trajectory mapping mismatch", async () => {
  const { trajectory, pairedInference } = await allInferenceFixtures();
  const forgedView = structuredClone(trajectory.derivation.view);
  forgedView.timeOrder.reverse();

  assert.throws(
    () => longitudinalInferenceRowsToCsv(forgedView, pairedInference),
    hasExactErrorMessage("Inference consumer current context mismatch."),
  );
});

test("consumer surfaces do not import or invoke low-level rank engines", () => {
  const root = process.cwd();
  for (const relativePath of [
    "lib/open-ena/inference-authority.ts",
    "lib/open-ena/inference-consumers.ts",
    "lib/open-ena/export.ts",
    "lib/open-ena/longitudinal.ts",
    "lib/open-ena/methods.ts",
  ]) {
    const source = readFileSync(join(root, relativePath), "utf8");
    assert.doesNotMatch(source, /from ["'].\/(?:rank-inference|inference)["']/);
    assert.doesNotMatch(source, /buildEndpointMannWhitney|mannWhitneyRankTest|wilcoxonSignedRankTest|friedmanRankTest/);
  }
});
