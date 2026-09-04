import assert from "node:assert/strict";
import test from "node:test";

import { sha256CanonicalJsonV3, sha256TextV3 } from "../lib/open-ena/model-v3/canonical-json";
import { compileStandardDraftV3 } from "../lib/open-ena/model-v3/compiler";
import type { ReadyStandardCompileResultV3 } from "../lib/open-ena/model-v3/compiler";
import {
  buildStandardExecutionPlanV3,
  validateExecutionPlanV3,
} from "../lib/open-ena/model-v3/execution-plan";
import * as executionPlanModuleV3 from "../lib/open-ena/model-v3/execution-plan";
import type {
  StandardExecutionPlanV3,
  ValidatedReferenceExecutionBindingV3,
} from "../lib/open-ena/model-v3/execution-plan";
import type { StandardEnaDraftV3 } from "../lib/open-ena/model-v3/types";
import {
  MAX_ESTIMATED_DATASET_BYTES_V3,
  estimateStandardResourcesV3,
} from "../lib/open-ena/model-v3/resource-budget";
import {
  JENA_RUNTIME_VERSION,
  JENA_SOURCE_COMMIT,
} from "../lib/open-ena/types";
import type { ParsedDataset } from "../lib/open-ena/types";
import * as publicModelV3 from "../lib/open-ena/model-v3/index";

const DATASET_SHA256 = "a".repeat(64);
const REFERENCE_SHA256 = "b".repeat(64);
const HEADERS = ["unit", "horizon", "time", "turn", "group", "A", "B", "C"];

function dataset(overrides: Partial<ParsedDataset> = {}): ParsedDataset {
  return {
    name: "execution-plan.csv",
    headers: [...HEADERS],
    rows: [
      { unit: "u1", horizon: "shared-1", time: 1, turn: 1, group: "g1", A: 1, B: 1, C: 0 },
      { unit: "u1", horizon: "shared-1", time: 1, turn: 2, group: "g1", A: 1, B: 0, C: 1 },
      { unit: "u2", horizon: "shared-1", time: 1, turn: 3, group: "g2", A: 0, B: 1, C: 1 },
      { unit: "u2", horizon: "shared-1", time: 1, turn: 4, group: "g2", A: 1, B: 1, C: 0 },
      { unit: "u1", horizon: "shared-2", time: 2, turn: 5, group: "g1", A: 1, B: 0, C: 1 },
      { unit: "u1", horizon: "shared-2", time: 2, turn: 6, group: "g1", A: 0, B: 1, C: 1 },
      { unit: "u2", horizon: "shared-2", time: 2, turn: 7, group: "g2", A: 1, B: 1, C: 0 },
      { unit: "u2", horizon: "shared-2", time: 2, turn: 8, group: "g2", A: 0, B: 1, C: 1 },
    ],
    sizeBytes: 512,
    source: "upload",
    ...overrides,
  };
}

function unsharedDataset(overrides: Partial<ParsedDataset> = {}): ParsedDataset {
  return dataset({
    rows: [
      { unit: "u1", horizon: "u1-h1", time: 1, turn: 1, group: "g1", A: 1, B: 1, C: 0 },
      { unit: "u2", horizon: "u2-h1", time: 1, turn: 2, group: "g2", A: 0, B: 1, C: 1 },
      { unit: "u1", horizon: "u1-h2", time: 2, turn: 3, group: "g1", A: 1, B: 0, C: 1 },
      { unit: "u2", horizon: "u2-h2", time: 2, turn: 4, group: "g2", A: 1, B: 1, C: 0 },
    ],
    ...overrides,
  });
}

const rowOrder: NonNullable<StandardEnaDraftV3["movingStanza"]["rowOrder"]> = {
  kind: "columns",
  keys: [{ column: "turn", direction: "ascending", comparator: { type: "number" } }],
};

const horizonOrder: NonNullable<StandardEnaDraftV3["horizonOrder"]> = {
  kind: "columns",
  keys: [{ column: "time", direction: "ascending", comparator: { type: "number" } }],
};

function draft(overrides: Partial<StandardEnaDraftV3> = {}): StandardEnaDraftV3 {
  return {
    unitColumns: ["unit"],
    horizonColumns: ["horizon"],
    groupColumn: "group",
    codes: ["A", "B", "C"],
    weighting: "binary",
    model: "SeparateTrajectory",
    windowType: "MovingStanzaWindow",
    movingStanza: {
      backward: { kind: "finite", value: 1 },
      forward: { kind: "finite", value: 0 },
      rowOrder,
    },
    horizonOrder,
    rotation: { type: "svd", centerAlignToOrigin: true },
    ...overrides,
  };
}

async function readyCompile(
  inputDataset: ParsedDataset,
  inputDraft: StandardEnaDraftV3,
  datasetSha256 = DATASET_SHA256,
): Promise<ReadyStandardCompileResultV3> {
  const result = await compileStandardDraftV3(inputDataset, datasetSha256, inputDraft);
  assert.equal(result.status, "ready", result.diagnostics.map((entry) => entry.id).join(", "));
  if (result.status !== "ready") throw new Error("expected a ready Standard compilation");
  return result;
}

async function planFor(
  inputDraft = draft(),
  inputDataset = dataset(),
  reference: ValidatedReferenceExecutionBindingV3 | null = null,
): Promise<StandardExecutionPlanV3> {
  const compileResult = await readyCompile(inputDataset, inputDraft);
  return buildStandardExecutionPlanV3({
    dataset: inputDataset,
    datasetSha256: DATASET_SHA256,
    compileResult,
    reference,
  });
}

function mutableJson(value: unknown): Record<string, any> {
  return JSON.parse(JSON.stringify(value)) as Record<string, any>;
}

function mutablePlan(plan: StandardExecutionPlanV3): Record<string, any> {
  return mutableJson(plan);
}

async function rehashPlan(plan: Record<string, any>): Promise<Record<string, any>> {
  const payload = mutablePlan(plan as unknown as StandardExecutionPlanV3);
  delete payload.header.executionPlanSha256;
  plan.header.executionPlanSha256 = await sha256CanonicalJsonV3(payload);
  return plan;
}

function sourceIndices(plan: StandardExecutionPlanV3): number[] {
  return plan.rows.map((row) => row.sourceRowIndex);
}

interface ShallowArrayTrapCounts {
  ownKeys: number;
  elementDescriptors: number;
}

function guardedArray<T>(values: T[], counts: ShallowArrayTrapCounts): T[] {
  return new Proxy(values, {
    ownKeys(target) {
      counts.ownKeys += 1;
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(target, key) {
      if (key !== "length") counts.elementDescriptors += 1;
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
}

function guardedRecord(
  value: Record<string, unknown>,
  counts: ShallowArrayTrapCounts,
): Record<string, unknown> {
  return new Proxy(value, {
    ownKeys(target) {
      counts.ownKeys += 1;
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(target, key) {
      counts.elementDescriptors += 1;
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
}

function zeroTrapCounts(): ShallowArrayTrapCounts {
  return { ownKeys: 0, elementDescriptors: 0 };
}

function assertNoDeepTraversal(counts: ShallowArrayTrapCounts, label: string): void {
  assert.deepEqual(counts, { ownKeys: 0, elementDescriptors: 0 }, label);
}

function replacementResourceEstimate(
  plan: Record<string, any>,
  datasetSizeBytes: number,
) {
  const rows = plan.rows as Array<{ unitToken: string; horizonToken: string }>;
  const horizons = new Map<string, number>();
  const partitions = new Map<string, number>();
  const units = new Map<string, Set<string>>();
  for (const row of rows) {
    horizons.set(row.horizonToken, (horizons.get(row.horizonToken) ?? 0) + 1);
    const partition = JSON.stringify([row.unitToken, row.horizonToken]);
    partitions.set(partition, (partitions.get(partition) ?? 0) + 1);
    const observed = units.get(row.unitToken) ?? new Set<string>();
    observed.add(row.horizonToken);
    units.set(row.unitToken, observed);
  }
  const sorted = (map: ReadonlyMap<string, number>) => [...map.entries()]
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([, size]) => size);
  const config = plan.configuration;
  return estimateStandardResourcesV3({
    rowCount: rows.length,
    unitCount: units.size,
    horizonCount: horizons.size,
    codeCount: config.codes.length,
    horizonSizes: sorted(horizons),
    windowPartitionSizes: config.window.type === "Conversation" ? sorted(partitions) : sorted(horizons),
    trajectorySteps: config.analysis.model.type === "EndPoint"
      ? units.size
      : [...units.values()].reduce((sum, values) => sum + values.size, 0),
    windowType: config.window.type,
    backward: config.window.type === "MovingStanzaWindow" ? config.window.backward : { kind: "finite", value: 1 },
    forward: config.window.type === "MovingStanzaWindow" ? config.window.forward : { kind: "finite", value: 0 },
    referenceProjection: plan.reference !== null,
    datasetSizeBytes,
    identityPayloadBytes: plan.header.resourceEstimate.identityPayloadBytes,
  });
}

function identityMatrix(size: number): number[][] {
  return Array.from({ length: size }, (_row, rowIndex) => (
    Array.from({ length: size }, (_column, columnIndex) => rowIndex === columnIndex ? 1 : 0)
  ));
}

function referenceBinding(
  sourceFit: "svd" | "means" = "svd",
): ValidatedReferenceExecutionBindingV3 {
  const codes = [
    "__open_ena_code_v3_000",
    "__open_ena_code_v3_001",
    "__open_ena_code_v3_002",
  ];
  const adjacencyKey = [
    { source: codes[0], target: codes[1], name: `${codes[0]} & ${codes[1]}`, sourceIndex: 0, targetIndex: 1 },
    { source: codes[0], target: codes[2], name: `${codes[0]} & ${codes[2]}`, sourceIndex: 0, targetIndex: 2 },
    { source: codes[1], target: codes[2], name: `${codes[1]} & ${codes[2]}`, sourceIndex: 1, targetIndex: 2 },
  ];
  const rotationColumns = sourceFit === "svd" ? ["SVD1", "SVD2", "SVD3"] : ["MR1", "SVD2", "SVD3"];
  return {
    referenceId: "reference-v2:test",
    contentSha256: REFERENCE_SHA256,
    basisPermutation: [0, 1, 2],
    sourceFit,
    rotationSet: {
      codes,
      adjacencyKey,
      rotationMatrix: identityMatrix(3),
      rotationColumns,
      eigenvalues: sourceFit === "svd" ? [3, 2, 1] : [],
      centerVector: [0, 0, 0],
      nodes: codes.map((code, index) => ({
        code,
        [rotationColumns[0]]: index === 0 ? 1 : 0,
        [rotationColumns[1]]: index === 1 ? 1 : 0,
        [rotationColumns[2]]: index === 2 ? 1 : 0,
      })),
    },
  };
}

function assertDeepFrozen(value: unknown, seen = new WeakSet<object>()): void {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return;
  if (seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) assertDeepFrozen(descriptor.value, seen);
  }
}

test("a Moving Stanza plan maps every source row exactly once and binds runtime identities", async () => {
  const plan = await planFor();
  assert.deepEqual([...sourceIndices(plan)].sort((left, right) => left - right), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(new Set(sourceIndices(plan)).size, 8);
  assert.equal(plan.rowOrdering.type, "within-horizon-order");
  assert.equal(plan.horizonOrdering.type, "trajectory-horizon-order");
  assert.match(plan.header.executionPlanSha256, /^[a-f0-9]{64}$/u);
  assert.equal(plan.header.runtimeVersion, JENA_RUNTIME_VERSION);
  assert.equal(plan.header.algorithmBuildSha, JENA_SOURCE_COMMIT);
  assert.equal(plan.header.datasetSha256, DATASET_SHA256);
  assert.deepEqual(plan.header.datasetBinding, {
    hashKind: "normalized-utf8-csv-text-sha256",
    normalizedTableSha256: DATASET_SHA256,
    rowCount: 8,
    headerSha256: plan.header.headerSha256,
  });
  assert.equal(plan.identityDictionary.units.length, 2);
  assert.equal(plan.identityDictionary.horizons.length, 2, "shared Horizons remain legal and shared");
  assert.equal(plan.rows.every((row) => row.rowOrderTuple !== undefined), true);
  assert.equal(plan.rows.every((row) => row.horizonOrderTuple !== undefined), true);
});

test("Conversation and EndPoint encode non-applicable ordering without fake tuples", async () => {
  const endpoint = await planFor(draft({
    model: "EndPoint",
    windowType: "Conversation",
    movingStanza: { backward: { kind: "finite", value: 1 }, forward: { kind: "finite", value: 0 }, rowOrder: null },
    horizonOrder: null,
  }), unsharedDataset());
  assert.deepEqual(endpoint.rowOrdering, { type: "not-applicable", reason: "conversation-window" });
  assert.deepEqual(endpoint.horizonOrdering, { type: "not-applicable", reason: "endpoint-model" });
  assert.equal(endpoint.rows.some((row) => "rowOrderTuple" in row || "horizonOrderTuple" in row), false);

  for (const model of ["SeparateTrajectory", "AccumulatedTrajectory"] as const) {
    const trajectory = await planFor(draft({
      model,
      windowType: "Conversation",
      movingStanza: { backward: { kind: "finite", value: 1 }, forward: { kind: "finite", value: 0 }, rowOrder: null },
    }), unsharedDataset());
    assert.deepEqual(trajectory.rowOrdering, { type: "not-applicable", reason: "conversation-window" });
    assert.equal(trajectory.horizonOrdering.type, "trajectory-horizon-order");
    assert.equal(trajectory.rows.every((row) => !("rowOrderTuple" in row) && "horizonOrderTuple" in row), true);
  }
});

test("finite/Infinity extents and source-order confirmations remain exact plan inputs", async () => {
  const confirmation = {
    kind: "source-order-confirmed" as const,
    confirmation: {
      kind: "explicit-researcher-confirmation" as const,
      analysisFamily: "standard" as const,
      datasetSha256: DATASET_SHA256,
      rowCount: 4,
      relevantColumns: ["horizon"],
      confirmedAt: "2026-09-04T00:00:00.000Z",
      confirmationVersion: 1 as const,
    },
  };
  const inputDraft = draft({
    model: "EndPoint",
    horizonOrder: null,
    movingStanza: {
      backward: { kind: "infinity" },
      forward: { kind: "infinity" },
      rowOrder: confirmation,
    },
  });
  const plan = await planFor(inputDraft, unsharedDataset());
  assert.deepEqual(plan.adapterParameters.window, {
    type: "MovingStanzaWindow",
    backward: { kind: "infinity" },
    forward: { kind: "infinity" },
  });
  assert.equal(plan.rowOrdering.type, "within-horizon-order");
  if (plan.rowOrdering.type !== "within-horizon-order") return;
  assert.deepEqual(plan.rowOrdering.requestedPolicy, confirmation);
  assert.deepEqual(plan.rowOrdering.sourceOrderBinding?.datasetBinding, plan.header.datasetBinding);
});

test("Binary Boolean and Frequency Code representations retain scientific and runtime names", async () => {
  const booleanRows = dataset({
    rows: dataset().rows.map((row) => ({
      ...row,
      A: Boolean(row.A),
      B: Boolean(row.B),
      C: Boolean(row.C),
    })),
  });
  const binary = await planFor(draft(), booleanRows);
  assert.deepEqual(binary.codeRepresentations.map((binding) => binding.sourceRepresentation), [
    "boolean-binary",
    "boolean-binary",
    "boolean-binary",
  ]);
  assert.equal(binary.adapterParameters.weightBy, "binary");
  assert.deepEqual(binary.weighting, { scientific: "binary", runtime: "binary" });

  const frequencyRows = dataset({
    rows: dataset().rows.map((row, index) => ({
      ...row,
      A: Number(row.A) + index / 10,
      B: Number(row.B) + index / 20,
      C: Number(row.C) + index / 30,
    })),
  });
  const frequency = await planFor(draft({ weighting: "frequency" }), frequencyRows);
  assert.deepEqual(frequency.codeRepresentations.map((binding) => binding.sourceRepresentation), [
    "frequency",
    "frequency",
    "frequency",
  ]);
  assert.equal(frequency.adapterParameters.weightBy, "sum");
  assert.deepEqual(frequency.weighting, { scientific: "frequency", runtime: "sum" });
  assert.equal(frequency.rows[1].codeValues.__open_ena_code_v3_000, 1.1);
});

test("a build is isolated from immediate caller mutation and stateful row descriptors", async () => {
  const original = dataset();
  const compileResult = mutableJson(await readyCompile(original, draft())) as unknown as ReadyStandardCompileResultV3;
  const input = structuredClone(original);
  let selectedCodeDescriptorReads = 0;
  input.rows[0] = new Proxy(input.rows[0], {
    getOwnPropertyDescriptor(target, key) {
      const descriptor = Object.getOwnPropertyDescriptor(target, key);
      if (key === "A" && descriptor !== undefined && "value" in descriptor) {
        selectedCodeDescriptorReads += 1;
        return { ...descriptor, value: selectedCodeDescriptorReads === 1 ? 1 : 0 };
      }
      return descriptor;
    },
  });
  const pending = buildStandardExecutionPlanV3({
    dataset: input,
    datasetSha256: DATASET_SHA256,
    compileResult,
    reference: null,
  });
  input.headers[0] = "mutated-header";
  input.rows[0] = { unit: "mutated", horizon: "mutated", time: 99, turn: 99, group: "mutated", A: 0, B: 0, C: 0 };
  (compileResult.canonicalConfiguration.codes as Array<{ column: string }>)[0].column = "mutated";
  const plan = await pending;

  assert.equal(selectedCodeDescriptorReads, 1);
  assert.equal(plan.codeDictionary.codes[0].sourceColumn, "A");
  assert.equal(plan.rows.find((row) => row.sourceRowIndex === 0)?.codeValues.__open_ena_code_v3_000, 1);
  assert.equal(JSON.stringify(plan.identityDictionary).includes("mutated"), false);
});

test("build rejects forged compile results and dataset/configuration/resource mismatches", async () => {
  const inputDataset = dataset();
  const genuine = await readyCompile(inputDataset, draft());
  const cases: Array<{
    name: string;
    dataset?: ParsedDataset;
    datasetSha256?: string;
    mutate?: (result: Record<string, any>) => void;
  }> = [
    { name: "redundant dataset SHA", datasetSha256: "c".repeat(64) },
    { name: "row count", dataset: dataset({ rows: dataset().rows.slice(0, 3) }) },
    { name: "header", dataset: dataset({ headers: [...HEADERS, "extra"] }) },
    { name: "hash kind", dataset: dataset({ hashKind: "normalized-utf8-text-sha256" }) },
    { name: "configuration hash", mutate: (result) => { result.configurationSha256 = "d".repeat(64); } },
    { name: "configuration content", mutate: (result) => { result.canonicalConfiguration.weighting.type = "frequency"; } },
    { name: "resource estimate", mutate: (result) => { result.resourceEstimate.estimatedNumericCells += 1; } },
    { name: "capability status", mutate: (result) => { result.capabilityStatus["build-model"] = "blocked"; } },
    { name: "malformed diagnostic evidence", mutate: (result) => { result.diagnostics[0].evidence = { bogus: true }; } },
    { name: "contract version", mutate: (result) => { result.canonicalConfiguration.contracts.validationContractVersion = "old"; } },
  ];
  for (const entry of cases) {
    const candidate = JSON.parse(JSON.stringify(genuine)) as Record<string, any>;
    entry.mutate?.(candidate);
    await assert.rejects(
      buildStandardExecutionPlanV3({
        dataset: entry.dataset ?? inputDataset,
        datasetSha256: entry.datasetSha256 ?? DATASET_SHA256,
        compileResult: candidate as ReadyStandardCompileResultV3,
        reference: null,
      }),
      () => true,
      entry.name,
    );
  }

  await assert.rejects(buildStandardExecutionPlanV3({
    dataset: inputDataset,
    datasetSha256: DATASET_SHA256,
    compileResult: { status: "invalid" } as unknown as ReadyStandardCompileResultV3,
    reference: null,
  }));
});

test("build binds the ready compiler result to the exact selected source snapshot", async () => {
  const compiledDataset = dataset();
  const compileResult = await readyCompile(compiledDataset, draft());
  const substitutedDataset = dataset({
    rows: compiledDataset.rows.map((row, index) => (
      index === 1 ? { ...row, A: row.A === 0 ? 1 : 0 } : { ...row }
    )),
  });

  await assert.rejects(buildStandardExecutionPlanV3({
    dataset: substitutedDataset,
    datasetSha256: DATASET_SHA256,
    compileResult,
    reference: null,
  }), /source proof|compile invocation|selected source/i);
});

test("build rejects accessors, sparse rows, and exotic rows without invoking getters", async () => {
  const compileResult = await readyCompile(dataset(), draft());
  let inputGetterCalls = 0;
  const hostileInput = {
    datasetSha256: DATASET_SHA256,
    compileResult,
    reference: null,
  } as Record<string, unknown>;
  Object.defineProperty(hostileInput, "dataset", {
    enumerable: true,
    get() {
      inputGetterCalls += 1;
      return dataset();
    },
  });
  await assert.rejects(buildStandardExecutionPlanV3(hostileInput as never));
  assert.equal(inputGetterCalls, 0);

  let getterCalls = 0;
  const accessorDataset = dataset();
  Object.defineProperty(accessorDataset.rows[0], "A", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 1;
    },
  });
  await assert.rejects(buildStandardExecutionPlanV3({
    dataset: accessorDataset,
    datasetSha256: DATASET_SHA256,
    compileResult,
    reference: null,
  }));
  assert.equal(getterCalls, 0);

  const sparseDataset = dataset();
  delete sparseDataset.rows[1];
  await assert.rejects(buildStandardExecutionPlanV3({
    dataset: sparseDataset,
    datasetSha256: DATASET_SHA256,
    compileResult,
    reference: null,
  }));

  const exoticDataset = dataset();
  exoticDataset.rows[0] = new (class ExoticRow {
    unit = "u1";
  })() as never;
  await assert.rejects(buildStandardExecutionPlanV3({
    dataset: exoticDataset,
    datasetSha256: DATASET_SHA256,
    compileResult,
    reference: null,
  }));
});

test("SVD and Means require null Reference while Reference remains fail-closed until Task 13", async () => {
  await assert.rejects(planFor(draft(), dataset(), referenceBinding()));
  await assert.rejects(planFor(draft({
    model: "EndPoint",
    horizonOrder: null,
    rotation: {
      type: "means",
      centerAlignToOrigin: true,
      negativeLevel: { type: "string", value: "g1" },
      positiveLevel: { type: "string", value: "g2" },
    },
  }), dataset(), referenceBinding("means")));

  const referenceDraft = draft({
    rotation: {
      type: "reference",
      referenceId: "reference-v2:test",
      expectedContentSha256: REFERENCE_SHA256,
    },
  });
  await assert.rejects(planFor(referenceDraft, dataset(), null));
  await assert.rejects(planFor(referenceDraft, dataset(), referenceBinding("means")));
  const badPermutation = referenceBinding();
  (badPermutation.basisPermutation as number[])[1] = 0;
  await assert.rejects(planFor(referenceDraft, dataset(), badPermutation));
  const wrongHash = { ...referenceBinding(), contentSha256: "c".repeat(64) };
  await assert.rejects(planFor(referenceDraft, dataset(), wrongHash));
  const nonOrthonormal = referenceBinding();
  nonOrthonormal.rotationSet.rotationMatrix[0][0] = 2;
  await assert.rejects(planFor(referenceDraft, dataset(), nonOrthonormal));

  const means = await planFor(draft({
    model: "EndPoint",
    horizonOrder: null,
    rotation: {
      type: "means",
      centerAlignToOrigin: true,
      negativeLevel: { type: "string", value: "g1" },
      positiveLevel: { type: "string", value: "g2" },
    },
  }), unsharedDataset(), null);
  assert.equal(means.configuration.analysis.rotation.type, "means");
});

test("build rejects every unavailable Reference branch before rows, Reference, or crypto work", async () => {
  const inputDataset = unsharedDataset();
  const svdCompile = await readyCompile(inputDataset, draft());
  const referenceCompile = await readyCompile(inputDataset, draft({
    rotation: {
      type: "reference",
      referenceId: "reference-v2:test",
      expectedContentSha256: REFERENCE_SHA256,
    },
  }));
  const subtle = globalThis.crypto.subtle;
  const originalDescriptor = Object.getOwnPropertyDescriptor(subtle, "digest");
  const originalDigest = subtle.digest;
  let patched = false;
  let digestCalls = 0;
  try {
    Object.defineProperty(subtle, "digest", {
      configurable: true,
      value: (...args: Parameters<SubtleCrypto["digest"]>) => {
        digestCalls += 1;
        return Reflect.apply(originalDigest, subtle, args);
      },
    });
    patched = true;
    for (const [name, compileResult, referenceValue] of [
      ["SVD with Reference", svdCompile, {}],
      ["Reference rotation without binding", referenceCompile, null],
      ["Reference rotation with binding", referenceCompile, {}],
    ] as const) {
      const rows = zeroTrapCounts();
      const reference = zeroTrapCounts();
      digestCalls = 0;
      await assert.rejects(buildStandardExecutionPlanV3({
        dataset: {
          ...inputDataset,
          rows: guardedArray([...inputDataset.rows], rows),
        },
        datasetSha256: DATASET_SHA256,
        compileResult,
        reference: referenceValue === null
          ? null
          : guardedRecord(referenceValue, reference) as unknown as ValidatedReferenceExecutionBindingV3,
      }), () => true, name);
      assertNoDeepTraversal(rows, `${name} rows`);
      assertNoDeepTraversal(reference, `${name} Reference`);
      assert.equal(digestCalls, 0, `${name} crypto work`);
    }
  } finally {
    if (patched) {
      if (originalDescriptor === undefined) Reflect.deleteProperty(subtle, "digest");
      else Object.defineProperty(subtle, "digest", originalDescriptor);
    }
  }
});

test("validator rejects every unavailable Reference branch before scientific traversal", async () => {
  const basePlan = await planFor(draft(), unsharedDataset());
  const subtle = globalThis.crypto.subtle;
  const originalDescriptor = Object.getOwnPropertyDescriptor(subtle, "digest");
  const originalDigest = subtle.digest;
  let patched = false;
  let digestCalls = 0;
  try {
    Object.defineProperty(subtle, "digest", {
      configurable: true,
      value: (...args: Parameters<SubtleCrypto["digest"]>) => {
        digestCalls += 1;
        return Reflect.apply(originalDigest, subtle, args);
      },
    });
    patched = true;
    for (const [name, rotation, referenceValue] of [
      ["SVD with Reference", { type: "svd", centerAlignToOrigin: true }, {}],
      ["Reference rotation without binding", {
        type: "reference",
        referenceId: "reference-v2:test",
        expectedContentSha256: REFERENCE_SHA256,
      }, null],
      ["Reference rotation with binding", {
        type: "reference",
        referenceId: "reference-v2:test",
        expectedContentSha256: REFERENCE_SHA256,
      }, {}],
    ] as const) {
      const candidate = mutablePlan(basePlan);
      candidate.configuration.analysis.rotation = rotation;
      const rows = zeroTrapCounts();
      const proofRows = zeroTrapCounts();
      const dictionaryCodes = zeroTrapCounts();
      const reference = zeroTrapCounts();
      candidate.rows = guardedArray(candidate.rows, rows);
      candidate.sourceProof.rows = guardedArray(candidate.sourceProof.rows, proofRows);
      candidate.codeDictionary.codes = guardedArray(candidate.codeDictionary.codes, dictionaryCodes);
      candidate.reference = referenceValue === null ? null : guardedRecord(referenceValue, reference);
      digestCalls = 0;
      await assert.rejects(validateExecutionPlanV3(candidate), () => true, name);
      assertNoDeepTraversal(rows, `${name} rows`);
      assertNoDeepTraversal(proofRows, `${name} source-proof rows`);
      assertNoDeepTraversal(dictionaryCodes, `${name} Code dictionary`);
      assertNoDeepTraversal(reference, `${name} Reference`);
      assert.equal(digestCalls, 0, `${name} crypto work`);
    }
  } finally {
    if (patched) {
      if (originalDescriptor === undefined) Reflect.deleteProperty(subtle, "digest");
      else Object.defineProperty(subtle, "digest", originalDescriptor);
    }
  }
});

test("validator rejects coordinated legal-domain scientific and identity forgeries", async () => {
  const valid = await planFor();

  const codeValue = mutablePlan(valid);
  const zeroRow = codeValue.rows.find((row: any) => row.codeValues.__open_ena_code_v3_000 === 0);
  assert.ok(zeroRow);
  zeroRow.codeValues.__open_ena_code_v3_000 = 1;
  await rehashPlan(codeValue);
  await assert.rejects(validateExecutionPlanV3(codeValue), () => true, "source Code value forgery");

  const representation = mutablePlan(valid);
  representation.codeRepresentations[0].sourceRepresentation = "boolean-binary";
  await rehashPlan(representation);
  await assert.rejects(validateExecutionPlanV3(representation), () => true, "source representation forgery");

  const coordinatedToken = mutablePlan(valid);
  const oldToken = coordinatedToken.identityDictionary.units[0].token;
  const newToken = "__open_ena_unit_v3_999998";
  coordinatedToken.identityDictionary.units[0].token = newToken;
  for (const row of coordinatedToken.rows) if (row.unitToken === oldToken) row.unitToken = newToken;
  for (const sequence of coordinatedToken.horizonOrdering.unitSequences) {
    if (sequence.unitToken === oldToken) sequence.unitToken = newToken;
  }
  await rehashPlan(coordinatedToken);
  await assert.rejects(validateExecutionPlanV3(coordinatedToken), () => true, "coordinated runtime token forgery");

  const typedIdentity = mutablePlan(valid);
  const entry = typedIdentity.identityDictionary.units[0];
  const originalIdentityValue = entry.fields[0].value.value;
  entry.fields[0].value.value = `${String(originalIdentityValue)}-forged`;
  entry.canonicalJson = JSON.stringify({ fields: entry.fields });
  entry.sha256 = await sha256TextV3(entry.canonicalJson);
  await rehashPlan(typedIdentity);
  await assert.rejects(validateExecutionPlanV3(typedIdentity), () => true, "typed source identity forgery");
});

test("validator reruns authoritative row and Horizon ordering instead of accepting coordinated mirrors", async () => {
  const valid = await planFor();

  const rowReversal = mutablePlan(valid);
  const byHorizon = new Map<string, any[]>();
  for (const mapping of rowReversal.rowOrdering.mappings) {
    const values = byHorizon.get(mapping.horizonToken) ?? [];
    values.push(mapping);
    byHorizon.set(mapping.horizonToken, values);
  }
  rowReversal.rowOrdering.mappings = [...byHorizon.values()].flatMap((values) => (
    [...values].reverse().map((mapping, index) => ({ ...mapping, withinHorizonOrdinal: index }))
  ));
  rowReversal.rowOrdering.orderedSourceRowIndices = rowReversal.rowOrdering.mappings.map((mapping: any) => mapping.sourceRowIndex);
  const rowBySource = new Map(rowReversal.rows.map((row: any) => [row.sourceRowIndex, row]));
  rowReversal.rows = rowReversal.rowOrdering.orderedSourceRowIndices.map((index: number) => rowBySource.get(index));
  await rehashPlan(rowReversal);
  await assert.rejects(validateExecutionPlanV3(rowReversal), () => true, "coordinated row reversal");

  const trajectoryReversal = mutablePlan(valid);
  for (const sequence of trajectoryReversal.horizonOrdering.unitSequences) {
    sequence.steps = [...sequence.steps].reverse().map((step, index) => ({ ...step, trajectoryOrdinal: index }));
  }
  await rehashPlan(trajectoryReversal);
  await assert.rejects(validateExecutionPlanV3(trajectoryReversal), () => true, "coordinated trajectory reversal");

  const tupleForgery = mutablePlan(valid);
  for (const mapping of tupleForgery.rowOrdering.mappings) mapping.orderTuple = [999];
  for (const row of tupleForgery.rows) row.rowOrderTuple = [999];
  for (const tuple of tupleForgery.horizonOrdering.horizonTuples) tuple.orderTuple = [999];
  for (const row of tupleForgery.rows) row.horizonOrderTuple = [999];
  await rehashPlan(tupleForgery);
  await assert.rejects(validateExecutionPlanV3(tupleForgery), () => true, "coordinated tuple forgery");
});

test("forged 50k ready envelopes fail before any row element or ownKeys inspection", async () => {
  const genuine = JSON.parse(JSON.stringify(await readyCompile(dataset(), draft()))) as Record<string, any>;
  genuine.datasetBinding.rowCount = 50_000;
  genuine.resourceEstimate.rows = 50_000;
  let ownKeysCalls = 0;
  const rows = new Proxy(new Array(50_000), {
    ownKeys(target) {
      ownKeysCalls += 1;
      return Reflect.ownKeys(target);
    },
  });
  await assert.rejects(buildStandardExecutionPlanV3({
    dataset: dataset({ rows: rows as ParsedDataset["rows"] }),
    datasetSha256: DATASET_SHA256,
    compileResult: genuine as ReadyStandardCompileResultV3,
    reference: null,
  }));
  assert.equal(ownKeysCalls, 0);
});

test("oversized dataset envelopes fail before any row element or ownKeys inspection", async () => {
  const compiledDataset = unsharedDataset();
  const compileResult = await readyCompile(compiledDataset, draft());
  let rowOwnKeysCalls = 0;
  let elementDescriptorReads = 0;
  const guardedRows = new Proxy(
    compiledDataset.rows.map((row) => new Proxy(row, {
      getOwnPropertyDescriptor(target, key) {
        elementDescriptorReads += 1;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    })),
    {
      ownKeys(target) {
        rowOwnKeysCalls += 1;
        return Reflect.ownKeys(target);
      },
    },
  );

  await assert.rejects(buildStandardExecutionPlanV3({
    dataset: {
      ...compiledDataset,
      rows: guardedRows,
      sizeBytes: MAX_ESTIMATED_DATASET_BYTES_V3 + 1,
    },
    datasetSha256: DATASET_SHA256,
    compileResult,
    reference: null,
  }));
  assert.equal(rowOwnKeysCalls, 0);
  assert.equal(elementDescriptorReads, 0);
});

test("dataset envelopes exactly at the byte limit remain admissible", async () => {
  const atLimitDataset = unsharedDataset({
    sizeBytes: MAX_ESTIMATED_DATASET_BYTES_V3,
  });
  const compileResult = await readyCompile(atLimitDataset, draft());
  const plan = await buildStandardExecutionPlanV3({
    dataset: atLimitDataset,
    datasetSha256: DATASET_SHA256,
    compileResult,
    reference: null,
  });
  assert.equal(plan.header.resourceEstimate.datasetSizeBytes, MAX_ESTIMATED_DATASET_BYTES_V3);
  assert.equal(plan.header.resourceEstimate.blocked, false);
});

test("validator rejects oversized source envelopes before traversing scientific arrays", async () => {
  const candidate = mutablePlan(await planFor(draft(), unsharedDataset()));
  candidate.sourceProof.dataset.sizeBytes = MAX_ESTIMATED_DATASET_BYTES_V3 + 1;
  candidate.header.resourceEstimate.datasetSizeBytes = MAX_ESTIMATED_DATASET_BYTES_V3 + 1;
  const rows = zeroTrapCounts();
  const proofRows = zeroTrapCounts();
  const dictionaryCodes = zeroTrapCounts();
  const dictionaryEdges = zeroTrapCounts();
  candidate.rows = guardedArray(candidate.rows, rows);
  candidate.sourceProof.rows = guardedArray(candidate.sourceProof.rows, proofRows);
  candidate.codeDictionary.codes = guardedArray(candidate.codeDictionary.codes, dictionaryCodes);
  candidate.codeDictionary.edges = guardedArray(candidate.codeDictionary.edges, dictionaryEdges);

  await assert.rejects(
    validateExecutionPlanV3(candidate),
    /fixed pre-materialization resource budget/,
  );
  assertNoDeepTraversal(rows, "execution rows");
  assertNoDeepTraversal(proofRows, "source-proof rows");
  assertNoDeepTraversal(dictionaryCodes, "Code dictionary entries");
  assertNoDeepTraversal(dictionaryEdges, "edge dictionary entries");
});

test("validator rejects impossible dense Code counts from lengths before enumerating dictionaries", async () => {
  const candidate = mutablePlan(await planFor(draft(), unsharedDataset()));
  const codeCount = 401;
  const edgeCount = codeCount * (codeCount - 1) / 2;
  const configCodes = zeroTrapCounts();
  const dictionaryCodes = zeroTrapCounts();
  const dictionaryEdges = zeroTrapCounts();
  const representations = zeroTrapCounts();
  const adapterTokens = zeroTrapCounts();
  candidate.configuration.codes = guardedArray(new Array(codeCount), configCodes);
  candidate.header.resourceEstimate.codes = codeCount;
  candidate.header.resourceEstimate.adjacencyDimensions = edgeCount;
  candidate.codeDictionary.codes = guardedArray(new Array(codeCount), dictionaryCodes);
  candidate.codeDictionary.edges = guardedArray(new Array(edgeCount), dictionaryEdges);
  candidate.codeRepresentations = guardedArray(new Array(codeCount), representations);
  candidate.adapterParameters.codeTokens = guardedArray(new Array(codeCount), adapterTokens);

  await assert.rejects(
    validateExecutionPlanV3(candidate),
    /unavoidable Standard resource lower bound/,
  );
  assertNoDeepTraversal(configCodes, "configuration Codes");
  assertNoDeepTraversal(dictionaryCodes, "Code dictionary entries");
  assertNoDeepTraversal(dictionaryEdges, "edge dictionary entries");
  assertNoDeepTraversal(representations, "Code representations");
  assertNoDeepTraversal(adapterTokens, "adapter Code tokens");
});

test("validator rejects unknown root keys without traversing their values", async () => {
  const candidate = mutablePlan(await planFor());
  const extraValue = zeroTrapCounts();
  candidate.unexpected = guardedRecord({ nested: { prompt: "untrusted" } }, extraValue);
  await assert.rejects(validateExecutionPlanV3(candidate), /invalid shape/);
  assertNoDeepTraversal(extraValue, "unknown root value");
});

test("resource estimates cannot choose their own dataset byte base", async () => {
  const valid = mutablePlan(await planFor());
  valid.header.resourceEstimate = replacementResourceEstimate(
    valid,
    valid.header.resourceEstimate.datasetSizeBytes + 1,
  );
  await rehashPlan(valid);
  await assert.rejects(validateExecutionPlanV3(valid));
});

test("source proof discloses only selected scientific values and binds every derived field", async () => {
  const secret = "PRIVATE-UNSELECTED-SOURCE-TEXT";
  const inputDataset = dataset({
    headers: [...HEADERS, "private_notes"],
    rows: dataset().rows.map((row) => ({ ...row, private_notes: secret })),
  });
  const plan = await planFor(draft(), inputDataset);
  assert.equal(plan.sourceProof.headers.includes("private_notes"), true, "complete headers remain hash-verifiable");
  assert.equal(plan.sourceProof.selectedColumns.includes("private_notes"), false);
  assert.equal(JSON.stringify(plan.sourceProof).includes(secret), false);
  assert.equal(
    plan.sourceProof.dataset.externalHashVerification,
    "provenance-only-no-normalized-table-preimage",
  );
  assert.equal(plan.sourceProof.dataset.sizeBytes, inputDataset.sizeBytes);
  assert.equal(plan.header.resourceEstimate.datasetSizeBytes, inputDataset.sizeBytes);

  const forged = mutablePlan(plan);
  const proofZero = forged.sourceProof.rows.find((row: any) => row.values.A === 0);
  assert.ok(proofZero);
  proofZero.values.A = 1;
  const proofPayload = mutableJson(forged.sourceProof);
  delete proofPayload.sourceProofSha256;
  forged.sourceProof.sourceProofSha256 = await sha256CanonicalJsonV3(proofPayload);
  await rehashPlan(forged);
  await assert.rejects(validateExecutionPlanV3(forged));
});

test("validator rejects hash-preserving semantic tampering across every plan boundary", async () => {
  const valid = await planFor();
  const mutations: Array<[string, (plan: Record<string, any>) => void]> = [
    ["duplicate source index", (plan) => { plan.rows[1].sourceRowIndex = plan.rows[0].sourceRowIndex; }],
    ["missing source row", (plan) => { plan.rows.pop(); }],
    ["out of range source index", (plan) => { plan.rows[0].sourceRowIndex = 99; }],
    ["identity token", (plan) => { plan.rows[0].unitToken = "__unknown_unit"; }],
    ["identity dictionary", (plan) => { plan.identityDictionary.units[0].token = "__unknown_unit"; }],
    ["Code dictionary", (plan) => { plan.codeDictionary.codes[0].sourceColumn = "different"; }],
    ["Code value", (plan) => { plan.rows[0].codeValues.__open_ena_code_v3_000 = -1; }],
    ["row order", (plan) => { plan.rowOrdering.mappings[0].horizonToken = "__unknown_horizon"; }],
    ["horizon order", (plan) => { plan.horizonOrdering.unitSequences[0].steps.pop(); }],
    ["imputed Horizon tuple", (plan) => {
      plan.horizonOrdering.horizonTuples.push({ horizonToken: "__open_ena_horizon_v3_999999", orderTuple: [999] });
      plan.horizonOrdering.implementationHorizonOrder.push("__open_ena_horizon_v3_999999");
    }],
    ["family", (plan) => { plan.header.analysisFamily = "ona"; }],
    ["configuration", (plan) => { plan.configuration.weighting.type = "frequency"; }],
    ["configuration hash", (plan) => { plan.header.configurationSha256 = "c".repeat(64); }],
    ["header hash", (plan) => { plan.header.headerSha256 = "c".repeat(64); }],
    ["resource estimate", (plan) => { plan.header.resourceEstimate.estimatedNumericCells += 1; }],
    ["adapter", (plan) => { plan.adapterParameters.weightBy = "sum"; }],
    ["runtime", (plan) => { plan.header.runtimeVersion = "forged-runtime"; }],
    ["algorithm", (plan) => { plan.header.algorithmBuildSha = "0".repeat(40); }],
    ["validation version", (plan) => { plan.header.validationContractVersion = "forged"; }],
    ["execution version", (plan) => { plan.header.executionContractVersion = "forged"; }],
    ["unexpected Reference", (plan) => { plan.reference = referenceBinding(); }],
  ];
  for (const [name, mutate] of mutations) {
    const changed = mutablePlan(valid);
    mutate(changed);
    await rehashPlan(changed);
    await assert.rejects(validateExecutionPlanV3(changed), () => true, name);
  }

  const changedHash = mutablePlan(valid);
  changedHash.header.executionPlanSha256 = "f".repeat(64);
  await assert.rejects(validateExecutionPlanV3(changedHash));
});

test("validator rejects malformed plans before executing accessors", async () => {
  const valid = mutablePlan(await planFor());
  let getterCalls = 0;
  Object.defineProperty(valid.rows[0].codeValues, "__open_ena_code_v3_000", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 1;
    },
  });
  await assert.rejects(validateExecutionPlanV3(valid));
  assert.equal(getterCalls, 0);
});

test("plans are deterministic detached deep-frozen clones without freezing caller input", async () => {
  const firstDataset = dataset();
  const firstCompile = await readyCompile(firstDataset, draft());
  const firstReference: ValidatedReferenceExecutionBindingV3 | null = null;
  const first = await buildStandardExecutionPlanV3({
    dataset: firstDataset,
    datasetSha256: DATASET_SHA256,
    compileResult: firstCompile,
    reference: firstReference,
  });
  const second = await planFor();

  assert.equal(first.header.executionPlanSha256, second.header.executionPlanSha256);
  assert.deepEqual(first, second);
  assertDeepFrozen(first);
  assert.equal(Object.isFrozen(firstDataset), false);
  assert.equal(Object.isFrozen(firstDataset.rows), false);
  assert.equal(Object.isFrozen(firstDataset.rows[0]), false);
  assert.notEqual(first.rows, firstDataset.rows);

  const detachedInput = mutablePlan(first);
  const validated = await validateExecutionPlanV3(detachedInput);
  detachedInput.rows[0].codeValues.__open_ena_code_v3_000 = 0;
  assert.notEqual(validated.rows[0].codeValues.__open_ena_code_v3_000, detachedInput.rows[0].codeValues.__open_ena_code_v3_000);
  assertDeepFrozen(validated);
});

test("implementation Horizon permutation uses the indexed 16k-token helper", () => {
  const helper = (executionPlanModuleV3 as unknown as Record<string, unknown>)
    .implementationHorizonPermutationV3;
  assert.equal(typeof helper, "function");
  const resolve = helper as (
    horizonTokens: readonly string[],
    implementationOrder: readonly string[],
  ) => number[];
  const horizonTokens = Array.from({ length: 16_000 }, (_value, index) => `h-${index}`);
  const implementationOrder = [...horizonTokens].reverse();
  const permutation = resolve(horizonTokens, implementationOrder);
  assert.equal(permutation.length, horizonTokens.length);
  assert.equal(permutation[0], 15_999);
  assert.equal(permutation[15_999], 0);
  assert.throws(() => resolve(horizonTokens, [...implementationOrder.slice(0, -1), "missing"]));
});

test("execution-plan internals stay absent from the public model-v3 barrel", () => {
  const exports = Object.keys(publicModelV3);
  for (const internal of [
    "buildStandardSourceProofPayloadV3",
    "executionPlanHashPayloadV3",
    "buildStandardExecutionPlanV3",
    "validateExecutionPlanV3",
  ]) {
    assert.equal(exports.includes(internal), false, `execution-plan internal leaked: ${internal}`);
  }
});

test("public hashes provide internal integrity without claiming source authentication", async () => {
  const plan = await planFor();
  assert.equal(
    plan.sourceProof.dataset.externalHashVerification,
    "provenance-only-no-normalized-table-preimage",
  );
  assert.equal("signature" in plan.sourceProof, false);
  assert.equal("authenticatedSource" in plan.sourceProof.dataset, false);
  assert.equal(plan.header.datasetSha256, DATASET_SHA256);
});

test("operational crypto failures are rethrown exactly without orphaned rejections", async () => {
  const inputDataset = dataset();
  const compileResult = await readyCompile(inputDataset, draft());
  const subtle = globalThis.crypto.subtle;
  const originalDigest = subtle.digest;
  const originalDescriptor = Object.getOwnPropertyDescriptor(subtle, "digest");
  const sentinel = new TypeError("execution-plan crypto operational failure");
  const orphaned: unknown[] = [];
  const capture = (reason: unknown): void => { orphaned.push(reason); };
  let listenerInstalled = false;
  let patched = false;
  let digestCalls = 0;
  try {
    process.on("unhandledRejection", capture);
    listenerInstalled = true;
    Object.defineProperty(subtle, "digest", {
      configurable: true,
      value: (...args: Parameters<SubtleCrypto["digest"]>) => {
        digestCalls += 1;
        if (digestCalls === 3) return Promise.reject(sentinel);
        return Reflect.apply(originalDigest, subtle, args);
      },
    });
    patched = true;
    await assert.rejects(buildStandardExecutionPlanV3({
      dataset: inputDataset,
      datasetSha256: DATASET_SHA256,
      compileResult,
      reference: null,
    }), (error) => error === sentinel);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(digestCalls > 3, true, "the first digest succeeds before a concurrent-batch failure");
    assert.deepEqual(orphaned, []);
  } finally {
    if (listenerInstalled) process.off("unhandledRejection", capture);
    if (patched) {
      if (originalDescriptor === undefined) Reflect.deleteProperty(subtle, "digest");
      else Object.defineProperty(subtle, "digest", originalDescriptor);
      assert.equal(globalThis.crypto.subtle.digest, originalDigest);
    }
  }
});
