# Open ENA Model V3 Runtime and Reference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn ready v3 configurations into immutable Standard/ONA execution plans, run all approved Standard combinations through jENA, implement SVD/Means/Reference rules, and publish only hash-bound validated results.

**Architecture:** Keep numerical ENA work in jENA. Product adapters materialize validated Codes and collision-free identities, resolve order before accumulation, map scientific parameters to jENA, verify results, and isolate ONA in a separate adapter and worker branch.

**Tech Stack:** TypeScript, jENA, Web Workers, Web Crypto, Node test runner, Vitest.

---

### Task 1: Materialize Standard Code values and safe runtime dictionaries

**Files:**
- Create: `lib/open-ena/model-v3/standard-adapter.ts`
- Test: `tests/open-ena-model-v3-standard-adapter.test.ts`

- [ ] **Step 1: Write failing strict materialization tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStandardCodeDictionaryV3,
  materializeStandardCodesV3,
} from "../lib/open-ena/model-v3/standard-adapter";

test("Binary Booleans map explicitly while arbitrary truthy values fail", () => {
  const dictionary = buildStandardCodeDictionaryV3(codeDefinitions(["A", "B", "C"]));
  assert.deepEqual(
    materializeStandardCodesV3(
      { A: true, B: false, C: 1 },
      { type: "binary" },
      dictionary,
    ),
    {
      __open_ena_code_v3_000: 1,
      __open_ena_code_v3_001: 0,
      __open_ena_code_v3_002: 1,
    },
  );
  assert.throws(() => materializeStandardCodesV3(
    { A: "yes", B: 0, C: 1 },
    { type: "binary" },
    dictionary,
  ), /Binary.*A/i);
});

test("Frequency preserves finite non-negative decimals", () => {
  const dictionary = buildStandardCodeDictionaryV3(codeDefinitions(["A", "B", "C"]));
  const row = materializeStandardCodesV3(
    { A: 0.25, B: 2, C: 0 },
    { type: "frequency" },
    dictionary,
  );
  assert.equal(row.__open_ena_code_v3_000, 0.25);
  assert.throws(() => materializeStandardCodesV3(
    { A: -1, B: 2, C: 0 },
    { type: "frequency" },
    dictionary,
  ), /Frequency.*A/i);
});
```

- [ ] **Step 2: Run the adapter test**

Run: `node --import tsx --test tests/open-ena-model-v3-standard-adapter.test.ts`
Expected: FAIL because `standard-adapter.ts` is absent.

- [ ] **Step 3: Implement deterministic Code/edge dictionaries and materialization**

```ts
import type { Row } from "jena-js";
import type { CanonicalCodeV3, CanonicalStandardConfigV3 } from "./types";

export function buildCanonicalCodeEntriesV3(definitions: CanonicalCodeV3[]) {
  const encoder = new TextEncoder();
  const compareUtf8 = (left: string, right: string) => {
    const a = encoder.encode(left);
    const b = encoder.encode(right);
    const length = Math.min(a.length, b.length);
    for (let index = 0; index < length; index += 1) {
      if (a[index] !== b[index]) return a[index] - b[index];
    }
    return a.length - b.length;
  };
  if (new Set(definitions.map((code) => code.column)).size !== definitions.length) {
    throw new Error("Code dictionary definitions must have distinct source columns.");
  }
  const ordered = [...definitions].sort((left, right) => compareUtf8(left.column, right.column));
  return ordered.map((definition, index) => ({
    token: `__open_ena_code_v3_${String(index).padStart(3, "0")}`,
    sourceColumn: definition.column,
    displayLabel: definition.displayLabel,
    canonicalIdentity: definition.column,
  }));
}

export function buildStandardCodeDictionaryV3(definitions: CanonicalCodeV3[]) {
  const codes = buildCanonicalCodeEntriesV3(definitions);
  const edges = codes.flatMap((target, targetIndex) => codes
    .slice(0, targetIndex)
    .map((source, sourceIndex) => ({
      token: `__open_ena_edge_v3_${String(sourceIndex).padStart(3, "0")}_${String(targetIndex).padStart(3, "0")}`,
      sourceCodeIdentity: source.canonicalIdentity,
      targetCodeIdentity: target.canonicalIdentity,
    })));
  return { codes, edges };
}

export function materializeStandardCodesV3(
  row: Row,
  weighting: CanonicalStandardConfigV3["weighting"],
  dictionary: ReturnType<typeof buildStandardCodeDictionaryV3>,
) {
  return Object.fromEntries(dictionary.codes.map((code) => {
    const value = row[code.sourceColumn];
    if (weighting.type === "binary") {
      if (value === true) return [code.token, 1];
      if (value === false) return [code.token, 0];
      if (value === 0 || value === 1) return [code.token, value];
      throw new Error(`Binary Code “${code.sourceColumn}” is not 0/1 or Boolean.`);
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`Frequency Code “${code.sourceColumn}” is not a finite non-negative number.`);
    }
    return [code.token, value];
  }));
}
```

Also implement `buildCodeRepresentationBindingsV3(rows, weighting,
dictionary)`. For every Code token it records exactly one source representation
(`numeric-binary`, `boolean-binary`, or `frequency`) and runtime representation
`number`; mixed Binary representation fails even if each individual cell is
otherwise 0/1-like. The execution plan and result provenance carry these
bindings.

- [ ] **Step 4: Add Code names containing ampersands and runtime-reserved labels**

Add cases for `A & B`, `SVD1`, and `MR1`. Assert unique Code tokens and
edge tokens and verify the dictionary restores exact source labels.

```ts
const reserved = buildStandardCodeDictionaryV3(codeDefinitions(["A & B", "SVD1", "MR1"]));
assert.equal(new Set(reserved.codes.map((entry) => entry.token)).size, 3);
assert.deepEqual(
  reserved.codes.map((entry) => entry.sourceColumn).sort(),
  ["A & B", "MR1", "SVD1"],
);
```

- [ ] **Step 5: Run focused tests**

Run: `node --import tsx --test tests/open-ena-model-v3-standard-adapter.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit strict materialization**

```bash
git add lib/open-ena/model-v3/standard-adapter.ts tests/open-ena-model-v3-standard-adapter.test.ts
git commit -m "feat: materialize strict Standard ENA inputs"
```

### Task 2: Build complete Standard execution plans

**Files:**
- Create: `lib/open-ena/model-v3/execution-plan.ts`
- Modify: `lib/open-ena/model-v3/compiler.ts`
- Modify: `lib/open-ena/model-v3/types.ts`
- Test: `tests/open-ena-model-v3-execution-plan.test.ts`

- [ ] **Step 1: Write failing plan permutation and hash tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildStandardExecutionPlanV3 } from "../lib/open-ena/model-v3/execution-plan";

test("a Moving Stanza plan maps every source row exactly once", async () => {
  const plan = await buildStandardExecutionPlanV3({
    dataset,
    datasetSha256: "a".repeat(64),
    compileResult: readyMovingStanza,
    reference: null,
  });
  const indices = plan.rows.map((row) => row.sourceRowIndex);
  assert.deepEqual([...indices].sort((a, b) => a - b), dataset.rows.map((_row, index) => index));
  assert.equal(new Set(indices).size, dataset.rows.length);
  assert.match(plan.header.executionPlanSha256, /^[a-f0-9]{64}$/u);
  assert.equal(plan.rowOrdering.type, "within-horizon-order");
});
```

- [ ] **Step 2: Run the execution-plan test**

Run: `node --import tsx --test tests/open-ena-model-v3-execution-plan.test.ts`
Expected: FAIL because the plan builder is absent.

- [ ] **Step 3: Implement plan assembly**

```ts
export interface StandardExecutionRowV3 {
  sourceRowIndex: number;
  unitToken: string;
  horizonToken: string;
  groupToken?: string;
  codeValues: Record<string, number>;
  rowOrderTuple?: Array<string | number>;
  horizonOrderTuple?: Array<string | number>;
}

export type OrderedExecutionRowV3 = StandardExecutionRowV3;

export interface ResolvedRowOrderingV3 {
  type: "within-horizon-order";
  requestedPolicy: CanonicalRowOrderV3;
  mappings: Array<{
    sourceRowIndex: number;
    horizonKey: string;
    orderTuple: Array<string | number>;
    withinHorizonOrdinal: number;
  }>;
  orderedSourceRowIndices: number[];
}

export interface ResolvedHorizonOrderingV3 {
  type: "trajectory-horizon-order";
  horizonTuples: Array<{ horizonToken: string; orderTuple: Array<string | number> }>;
  unitSequences: Array<{
    unitToken: string;
    steps: Array<{ horizonToken: string; trajectoryOrdinal: number }>;
  }>;
  implementationHorizonOrder: string[];
}

export type NotApplicableOrderingV3 =
  | { type: "not-applicable"; reason: "conversation-window" }
  | { type: "not-applicable"; reason: "endpoint-model" };

export type OpenEnaResourceEstimateV3 =
  | ReturnType<typeof estimateStandardResourcesV3>
  | ReturnType<typeof estimateOnaResourcesV3>;

export interface RuntimeResourceObservationV3 {
  processedRows: number;
  maximumBufferedRows: number;
  numericCellsAllocated: number;
  peakBytesObservedOrBounded: number;
  observationMethod: "exact-counters-and-conservative-byte-bound";
}

export interface OpenEnaExecutionProvenanceV3 {
  schemaVersion: 3;
  dataset: DatasetBindingV3;
  configurationSha256: string;
  executionPlanSha256: string;
  identities: Awaited<ReturnType<typeof buildExecutionIdentityDictionaryV3>>;
  codeBasis: {
    codes: Array<{
      sourceColumn: string;
      displayLabel: string;
      runtimeToken: string;
      sourceRepresentation: "numeric-binary" | "boolean-binary" | "frequency";
      runtimeRepresentation: "number";
    }>;
    edges: Array<
      | {
          network: "standard";
          sourceCode: string;
          targetCode: string;
          runtimeColumn: string;
        }
      | {
          network: "ona";
          groundCode: string;
          responseCode: string;
          groundIndex: number;
          responseIndex: number;
          runtimeColumn: string;
        }
    >;
  };
  rowOrdering: ResolvedRowOrderingV3 | NotApplicableOrderingV3;
  horizonOrdering: ResolvedHorizonOrderingV3 | NotApplicableOrderingV3;
  model: StandardModelTypeV3 | "EndPoint";
  window:
    | {
        type: "MovingStanzaWindow";
        backward: BackwardExtentV3;
        forward: ForwardExtentV3 | 0;
        boundary: "within-horizon";
      }
    | { type: "Conversation"; boundary: "complete-horizon" };
  weighting: { scientific: "binary" | "frequency"; runtime: "binary" | "sum" };
  normalization: { type: "sphere"; zeroVectorsRemainAtOrigin: true };
  projection: {
    type: "svd" | "means" | "reference";
    referenceId: string | null;
    referenceContentSha256: string | null;
    sourceFit: "svd" | "means" | null;
    runtimeFirstAxis: string | null;
    centerVector: number[];
    rank: number;
    fullAxes: string[];
    variance: number[];
  };
  populations: {
    fit: "endpoint-units" | "observed-unit-horizon-steps" | "fixed-reference";
    fitTokens: string[];
    targetTokens: string[];
    trajectoryStepCountByUnit: Record<string, number>;
    imputedStepCount: 0;
  };
  resources: {
    estimated: OpenEnaResourceEstimateV3;
    observed: RuntimeResourceObservationV3;
  };
  diagnostics: ModelDiagnosticV3[];
  versions: {
    runtimeVersion: string;
    algorithmBuildSha: string;
    validationContractVersion: typeof OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3;
    runtimePolicyVersion: typeof OPEN_ENA_RUNTIME_POLICY_VERSION_V3;
    executionContractVersion: typeof OPEN_ENA_EXECUTION_CONTRACT_VERSION_V3;
  };
}

export interface ExecutionPlanHeaderV3 {
  schemaVersion: 3;
  validationContractVersion: typeof OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3;
  runtimePolicyVersion: typeof OPEN_ENA_RUNTIME_POLICY_VERSION_V3;
  executionContractVersion: typeof OPEN_ENA_EXECUTION_CONTRACT_VERSION_V3;
  analysisFamily: "standard" | "ona";
  datasetSha256: string;
  datasetHashKind: DatasetHashKind;
  rowCount: number;
  headerSha256: string;
  configurationSha256: string;
  executionPlanSha256: string;
  runtimeVersion: string;
  algorithmBuildSha: string;
  resourceEstimate: OpenEnaResourceEstimateV3;
}

export type StandardAdapterParametersV3 = {
  networkType: "standard";
  unitTokenColumn: "__open_ena_unit_token";
  horizonTokenColumn: "__open_ena_horizon_token";
  codeTokens: string[];
  model: StandardModelTypeV3;
  window:
    | { type: "Conversation" }
    | {
        type: "MovingStanzaWindow";
        backward: BackwardExtentV3;
        forward: ForwardExtentV3;
      };
  weightBy: "binary" | "sum";
  displayDimensions: 3;
};

export type OnaAdapterParametersV3 = {
  networkType: "ordered";
  unitTokenColumn: "__open_ena_unit_token";
  horizonTokenColumn: "__open_ena_horizon_token";
  codeTokens: string[];
  model: "EndPoint";
  window: { type: "MovingStanzaWindow"; backward: BackwardExtentV3; forward: 0 };
  weightBy: "sum";
  rotation: "svd";
  nodePositionMethod: "directed";
  displayDimensions: 3;
};

export interface CodeRepresentationBindingV3 {
  runtimeToken: string;
  sourceColumn: string;
  sourceRepresentation: "numeric-binary" | "boolean-binary" | "frequency";
  runtimeRepresentation: "number";
}

export interface StandardExecutionPlanV3 {
  header: ExecutionPlanHeaderV3 & { analysisFamily: "standard" };
  configuration: CanonicalStandardConfigV3;
  identityDictionary: Awaited<ReturnType<typeof buildExecutionIdentityDictionaryV3>>;
  codeDictionary: ReturnType<typeof buildStandardCodeDictionaryV3>;
  codeRepresentations: CodeRepresentationBindingV3[];
  rows: StandardExecutionRowV3[];
  rowOrdering: ResolvedRowOrderingV3 | NotApplicableOrderingV3;
  horizonOrdering: ResolvedHorizonOrderingV3 | NotApplicableOrderingV3;
  adapterParameters: StandardAdapterParametersV3;
  reference: ValidatedReferenceExecutionBindingV3 | null;
}

export interface ValidatedReferenceExecutionBindingV3 {
  referenceId: string;
  contentSha256: string;
  basisPermutation: number[];
  rotationSet: RotationSet;
  sourceFit: "svd" | "means";
}

export interface OnaExecutionPlanV3 {
  header: ExecutionPlanHeaderV3 & { analysisFamily: "ona" };
  configuration: CanonicalOnaConfigV3;
  identityDictionary: Awaited<ReturnType<typeof buildExecutionIdentityDictionaryV3>>;
  codeDictionary: ReturnType<typeof buildOnaCodeDictionaryV3>;
  codeRepresentations: CodeRepresentationBindingV3[];
  rows: OrderedExecutionRowV3[];
  rowOrdering: ResolvedRowOrderingV3;
  adapterParameters: OnaAdapterParametersV3;
  directionalMask: OpenEnaDirectionalMask;
  reference: null;
}

export type OpenEnaExecutionPlanV3 =
  | StandardExecutionPlanV3
  | OnaExecutionPlanV3;

function isStandardExecutionPlanV3(
  plan: OpenEnaExecutionPlanV3,
): plan is StandardExecutionPlanV3 {
  return plan.header.analysisFamily === "standard";
}

export async function buildStandardExecutionPlanV3(input: {
  dataset: ParsedDataset;
  datasetSha256: string;
  compileResult: ReadyStandardCompileResultV3;
  reference: ValidatedStandardReferenceV2 | null;
}): Promise<StandardExecutionPlanV3> {
  const config = input.compileResult.canonicalConfiguration;
  const identities = await buildExecutionIdentityDictionaryV3(
    input.dataset.rows,
    config.units.columns,
    config.horizons.columns,
    config.units.group.type === "stable-metadata" ? config.units.group.column : null,
  );
  const codeDictionary = buildStandardCodeDictionaryV3(config.codes);
  const codeRepresentations = buildCodeRepresentationBindingsV3(
    input.dataset.rows,
    config.weighting,
    codeDictionary,
  );
  const rowOrdering = config.window.type === "MovingStanzaWindow"
    ? resolveRowOrderV3(input.dataset.rows, config.horizons.columns, config.window.rowOrder)
    : { type: "not-applicable" as const, reason: "conversation-window" as const };
  const horizonOrdering = config.analysis.model.type === "EndPoint"
    ? { type: "not-applicable" as const, reason: "endpoint-model" as const }
    : resolveHorizonOrderV3(
        input.dataset.rows,
        config.units.columns,
        config.horizons.columns,
        config.analysis.model.horizonOrder,
      );
  const rows = materializeExecutionRowsV3({
    sourceRows: input.dataset.rows,
    config,
    identities,
    codeDictionary,
    codeRepresentations,
    rowOrdering,
    horizonOrdering,
  });
  const withoutHash = {
    header: {
      schemaVersion: 3 as const,
      validationContractVersion: config.contracts.validationContractVersion,
      runtimePolicyVersion: config.contracts.runtimePolicyVersion,
      executionContractVersion: OPEN_ENA_EXECUTION_CONTRACT_VERSION_V3,
      analysisFamily: "standard" as const,
      datasetSha256: input.datasetSha256,
      datasetHashKind: datasetHashKindFor(input.dataset),
      rowCount: input.dataset.rows.length,
      headerSha256: await sha256CanonicalJsonV3(input.dataset.headers),
      configurationSha256: input.compileResult.configurationSha256,
      runtimeVersion: JENA_RUNTIME_VERSION,
      algorithmBuildSha: JENA_ALGORITHM_BUILD_SHA,
      resourceEstimate: input.compileResult.resourceEstimate,
    },
    configuration: config,
    identityDictionary: identities,
    codeDictionary,
    codeRepresentations,
    rows,
    rowOrdering,
    horizonOrdering,
    adapterParameters: buildStandardAdapterParametersV3(config, codeDictionary),
    reference: input.reference,
  };
  const validated = await validateExecutionPlanV3({
    ...withoutHash,
    header: {
      ...withoutHash.header,
      executionPlanSha256: await sha256CanonicalJsonV3(
        executionPlanHashPayloadV3(withoutHash),
      ),
    },
  });
  if (!isStandardExecutionPlanV3(validated)) {
    throw new Error("Expected a Standard execution plan after validation.");
  }
  return validated;
}
```

- [ ] **Step 4: Implement `validateExecutionPlanV3`**

Validate exact schema/family/runtime, hashes, row count, complete
sourceRowIndex permutation, token dictionary membership, no Standard
directional mask, resolved ordering shape, resource estimate, and Reference
hash. Recompute family-specific adapter parameters and require exact equality;
the worker never accepts caller-selected jENA options. Also require the header's validation/runtime-policy versions to equal the
canonical configuration and its execution-contract version to equal the local
literal. Return a deep-frozen cloned plan so the worker cannot observe caller
mutation.

```ts
function executionPlanHashPayloadV3(
  input: Omit<OpenEnaExecutionPlanV3, "header"> & {
    header: Omit<ExecutionPlanHeaderV3, "executionPlanSha256">
      | ExecutionPlanHeaderV3;
  },
) {
  const payload = structuredClone(input) as Record<string, unknown> & {
    header: Record<string, unknown>;
  };
  delete payload.header.executionPlanSha256;
  return payload;
}

export async function validateExecutionPlanV3(
  input: unknown,
): Promise<OpenEnaExecutionPlanV3> {
  const plan = decodeExecutionPlanShapeV3(input);
  const declared = plan.header.executionPlanSha256;
  if (await sha256CanonicalJsonV3(executionPlanHashPayloadV3(plan)) !== declared) {
    throw new Error("Execution-plan SHA-256 does not match its content.");
  }
  assertCompleteSourcePermutationV3(plan.rows, plan.header.rowCount);
  assertPlanTokenMembershipV3(plan);
  assertFamilyIsolationV3(plan);
  assertResourceEstimateV3(plan);
  assertAdapterParametersV3(plan);
  assertReferenceBindingV3(plan);
  return deepFreezeV3(structuredClone(plan));
}
```

- [ ] **Step 5: Add plan-tampering tests**

Clone a valid plan and separately mutate a row, duplicate a source index, remove
a source index, replace the family, alter the Reference hash, and alter the
resource estimate. Assert that `validateExecutionPlanV3` rejects every case.

```ts
for (const mutate of planMutations) {
  const changed = structuredClone(validPlan);
  mutate(changed);
  await assert.rejects(() => validateExecutionPlanV3(changed));
}
```

- [ ] **Step 6: Run execution-plan and compiler tests**

Run: `node --import tsx --test tests/open-ena-model-v3-execution-plan.test.ts tests/open-ena-model-v3-compiler.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit immutable plans**

```bash
git add lib/open-ena/model-v3/execution-plan.ts lib/open-ena/model-v3/compiler.ts lib/open-ena/model-v3/types.ts tests/open-ena-model-v3-execution-plan.test.ts
git commit -m "feat: build immutable Standard ENA plans"
```

### Task 3: Map all six Standard combinations to jENA

**Files:**
- Modify: `lib/open-ena/model-v3/standard-adapter.ts`
- Test: `packages/jena-js/tests/standard-window-v3.test.ts`
- Test: `tests/open-ena-model-v3-six-combinations.test.ts`

- [ ] **Step 1: Write an independent jENA window oracle test**

```ts
function sourceIndicesForWindow(
  current: number,
  size: number,
  backward: number,
  forward: number,
) {
  const first = backward === Infinity ? 0 : Math.max(0, current - (backward - 1));
  const last = forward === Infinity ? size - 1 : Math.min(size - 1, current + forward);
  return Array.from({ length: last - first + 1 }, (_value, offset) => first + offset);
}

it.each([
  [1, 0],
  [5, 0],
  [2, 2],
  [Infinity, 0],
  [2, Infinity],
  [Infinity, Infinity],
] as const)("matches the direct oracle for back=%s forward=%s", (back, forward) => {
  const expected = rows.map((_row, index) => sourceIndicesForWindow(index, rows.length, back, forward));
  expect(observedWindowMembership(rows, back, forward)).toEqual(expected);
});
```

- [ ] **Step 2: Run the jENA focused test**

Run: `npm test --workspace=jena-js -- tests/standard-window-v3.test.ts`
Expected: the new test either exposes the missing membership hook or fails on
an Infinity case; record the exact red failure before changing production code.

- [ ] **Step 3: Add one production window-bound helper with a tested public core export**

Expose a pure `windowBoundsForRow(current, horizonLength, back, forward)` from
`packages/jena-js/src/performance.ts` through
`packages/jena-js/src/core/index.ts`. Use that same helper inside the
production moving-window path, so the oracle and runtime share bounds only
after the independent oracle has established expected behavior.

```ts
export function windowBoundsForRow(
  current: number,
  horizonLength: number,
  backward: number,
  forward: number,
) {
  return {
    first: backward === Infinity
      ? 0
      : Math.max(0, current - Math.max(0, backward - 1)),
    last: forward === Infinity
      ? horizonLength - 1
      : Math.min(horizonLength - 1, current + forward),
  };
}
```

- [ ] **Step 4: Write the six-combination application test**

```ts
for (const model of ["EndPoint", "SeparateTrajectory", "AccumulatedTrajectory"] as const) {
  for (const window of ["MovingStanzaWindow", "Conversation"] as const) {
    test(`${model} + ${window} maps to jENA without losing scientific semantics`, async () => {
      const plan = await planFor({ model, window });
      const options = toStandardJenaOptionsV3(plan);
      assert.equal(options.model, model);
      assert.equal(options.window, window);
      assert.equal(options.weightBy, "binary");
      if (window === "Conversation") {
        assert.equal(plan.rowOrdering.type, "not-applicable");
      }
    });
  }
}
```

- [ ] **Step 5: Implement `toStandardJenaOptionsV3`**

Return jENA options with internal Unit/Horizon/Code columns, the resolved row
order, exact model/window, finite or JavaScript Infinity extents, Binary or
Frequency-to-sum mapping, three dimensions for the complete fitted set, and
SVD/Means/Reference make-set options. Conversation retains its jENA window type;
do not flatten it into a reported Moving Stanza config.

```ts
export function toStandardJenaOptionsV3(plan: StandardExecutionPlanV3): ENAWorkerOptions {
  const { configuration: config } = plan;
  const parameters = assertStandardAdapterParametersV3(plan);
  return {
    rows: plan.rows.map(executionRowToJenaRowV3),
    units: ["__open_ena_unit_token"],
    conversation: ["__open_ena_horizon_token"],
    codes: plan.codeDictionary.codes.map((entry) => entry.token),
    model: parameters.model,
    window: parameters.window.type,
    windowSizeBack: parameters.window.type === "Conversation"
      ? Number.POSITIVE_INFINITY
      : extentToNumberV3(parameters.window.backward),
    windowSizeForward: parameters.window.type === "Conversation"
      ? 0
      : extentToNumberV3(parameters.window.forward),
    weightBy: parameters.weightBy,
    dimensions: parameters.displayDimensions,
    centerAlignToOrigin: centerPolicyForPlanV3(plan),
    ...makeSetRotationOptionsV3(plan),
  };
}
```

- [ ] **Step 6: Add Binary/Frequency and finite/Infinity table coverage**

For each of the six model/window pairs, execute at least one Binary and one
Frequency case. Across the table cover finite back, finite forward, backward
Infinity, forward Infinity, both Infinity, and Conversation. Assert no window
crosses a Horizon.

```ts
for (const testCase of standardCombinationCases) {
  const result = runStandardPlanV3(await buildCasePlan(testCase));
  assert.equal(result.set.modelType, testCase.model);
  assert.equal(result.set.functionParams.window, testCase.window);
  assert.deepEqual(result.set.connectionCounts, testCase.expectedConnectionCounts);
}
```

- [ ] **Step 7: Run jENA and application focused tests**

Run:

```bash
npm test --workspace=jena-js -- tests/standard-window-v3.test.ts
node --import tsx --test tests/open-ena-model-v3-six-combinations.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit six-combination execution**

```bash
git add packages/jena-js/src/performance.ts packages/jena-js/src/core/index.ts packages/jena-js/tests/standard-window-v3.test.ts lib/open-ena/model-v3/standard-adapter.ts tests/open-ena-model-v3-six-combinations.test.ts
git commit -m "feat: run all Standard ENA model windows"
```

### Task 4: Enforce SVD and Endpoint-only Means fitting

**Files:**
- Modify: `lib/open-ena/model-v3/standard-adapter.ts`
- Modify: `lib/open-ena/analyze.ts`
- Test: `tests/open-ena-model-v3-rotations.test.ts`

- [ ] **Step 1: Write failing Means membership and direction tests**

```ts
test("Means masks contain each Endpoint Unit once and preserve direction", async () => {
  const plan = await endpointMeansPlan({
    negative: "Control",
    positive: "Treatment",
  });
  const binding = buildMeansBindingV3(plan);
  assert.deepEqual(binding.negative.unitTokens.sort(), ["u-control-1", "u-control-2"]);
  assert.deepEqual(binding.positive.unitTokens.sort(), ["u-treatment-1", "u-treatment-2"]);
  assert.equal(binding.direction, "positive-minus-negative");
  const result = runStandardPlanV3(plan);
  assert.equal(meanCoordinate(result, "Treatment", "MR1") > meanCoordinate(result, "Control", "MR1"), true);
});

test("direct Means remains invalid for both trajectory models", async () => {
  for (const model of ["SeparateTrajectory", "AccumulatedTrajectory"] as const) {
    await assert.rejects(() => compileAndPlan({
      model,
      rotation: { type: "means" },
    }), /Means.*EndPoint/i);
  }
});
```

- [ ] **Step 2: Run the rotation test**

Run: `node --import tsx --test tests/open-ena-model-v3-rotations.test.ts`
Expected: FAIL because Means binding and v3 runner are absent.

- [ ] **Step 3: Implement Means masks from Unit-stable membership**

```ts
export function buildMeansBindingV3(plan: StandardExecutionPlanV3) {
  if (plan.configuration.analysis.model.type !== "EndPoint"
    || plan.configuration.analysis.rotation.type !== "means") {
    throw new Error("Means binding requires a Standard EndPoint Means plan.");
  }
  const contrast = plan.configuration.analysis.rotation.contrast;
  const membership = stableGroupMembershipByUnitV3(plan, contrast.groupColumn);
  const negative = unitsForLevelV3(membership, contrast.negativeLevel);
  const positive = unitsForLevelV3(membership, contrast.positiveLevel);
  if (negative.length === 0 || positive.length === 0) {
    throw new Error("Means groups must each contain at least one Unit.");
  }
  return {
    groupColumn: contrast.groupColumn,
    negative: { level: contrast.negativeLevel, unitTokens: negative },
    positive: { level: contrast.positiveLevel, unitTokens: positive },
    direction: "positive-minus-negative" as const,
  };
}
```

Map the Unit tokens to the Endpoint `connectionCounts` order and pass exactly
two non-overlapping masks to jENA. Validate non-zero membership and a non-zero
MR1 direction before accepting the result.

- [ ] **Step 4: Preserve canonical MR1 output naming**

Route v3 Means output through the existing
`canonicalizeOfficialMeanRotation` logic, add an assertion that the first
canonical axis is MR1, and record the runtime source axis name separately in
projection provenance.

```ts
const runtimeFirstAxis = generatedSet.rotation.rotationColumns[0] ?? "";
const canonicalSet = canonicalizeOfficialMeanRotation(generatedSet);
if (canonicalSet.rotation.rotationColumns[0] !== "MR1") {
  throw new Error("Means rotation did not produce canonical MR1.");
}
provenance.projection.runtimeFirstAxis = runtimeFirstAxis;
```

- [ ] **Step 5: Add rank-zero, rank-one, zero-network, and uneven trajectory cases**

Assert rank zero blocks target fit, rank one returns a warning and no fake
second scientific axis, zero-network observations remain at the origin, and
trajectory SVD reports steps per Unit without equal-Unit reweighting.

```ts
assert.throws(() => runStandardPlanV3(rankZeroPlan), /rank zero|no co-occurrences/i);
const rankOne = runStandardPlanV3(rankOnePlan);
assert.equal(rankOne.diagnostics.some((entry) => entry.id === "STANDARD_SVD_ONE_DIMENSIONAL"), true);
assert.equal(rankOne.set.rotation.rotationColumns.includes("SVD2"), false);
```

- [ ] **Step 6: Run rotation and existing official Means tests**

Run:

```bash
node --import tsx --test tests/open-ena-model-v3-rotations.test.ts
node --import tsx --test tests/open-ena-official-mean-rotation-contract.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit rotations**

```bash
git add lib/open-ena/model-v3/standard-adapter.ts lib/open-ena/analyze.ts tests/open-ena-model-v3-rotations.test.ts
git commit -m "feat: enforce Standard ENA rotation contracts"
```

### Task 5: Create and validate Reference v2

**Files:**
- Create: `lib/open-ena/model-v3/reference-v2.ts`
- Modify: `lib/open-ena/model-v3/types.ts`
- Test: `tests/open-ena-reference-v2.test.ts`

- [ ] **Step 1: Write failing content identity and geometry tests**

```ts
test("Reference v2 identity is content-addressed and ignores the display alias", async () => {
  const first = await buildReferenceV2(endpointResult, { displayName: "First" });
  const second = await buildReferenceV2(endpointResult, { displayName: "Second" });
  assert.equal(first.contentSha256, second.contentSha256);
  assert.equal(first.referenceId, `open-ena-standard-ref-v2:${first.contentSha256}`);
});

test("Reference v2 rejects non-orthonormal or non-finite geometry", async () => {
  const reference = await buildReferenceV2(endpointResult, { displayName: "Fit" });
  const nonOrthonormal = structuredClone(reference);
  nonOrthonormal.geometry.rotationMatrix[0][0] = 2;
  await assert.rejects(() => decodeReferenceV2(nonOrthonormal), /orthonormal/i);
  const nonFinite = structuredClone(reference);
  nonFinite.geometry.centerVector[0] = Number.NaN;
  await assert.rejects(() => decodeReferenceV2(nonFinite), /finite/i);
});
```

- [ ] **Step 2: Run Reference tests**

Run: `node --import tsx --test tests/open-ena-reference-v2.test.ts`
Expected: FAIL because Reference v2 is absent.

- [ ] **Step 3: Implement immutable Reference construction**

Build the artifact from a current Standard EndPoint result whose rotation is
target-fitted SVD or Means. Include source dataset/config/plan hashes, runtime
and build identity, fit provenance, compatibility, typed Code/edge basis,
center, full rotation, eigenvalues, and nodes. Compute content hash over the
scientific payload excluding displayName, referenceId, and download time, then
set the content-addressed referenceId.

```ts
export async function buildReferenceV2(
  result: BoundOpenEnaResultV3,
  options: { displayName: string },
): Promise<OpenEnaStandardReferenceV2> {
  assertReferenceSourceResultV3(result);
  const scientific = referenceScientificPayloadV2(result);
  const contentSha256 = await sha256CanonicalJsonV3(scientific);
  return {
    ...scientific,
    displayName: options.displayName,
    contentSha256,
    referenceId: `open-ena-standard-ref-v2:${contentSha256}`,
  };
}
```

- [ ] **Step 4: Implement strict Reference decoding**

Use exact keys and bounded arrays. Validate family Standard, source EndPoint,
at least three unique Codes, n(n-1)/2 edges, finite square rotation, unique
columns, orthonormal columns at 1e-8, valid eigenvalues/Means metadata,
sphere-normalized center domain, complete nodes, and content hash.

```ts
export async function decodeReferenceV2(
  input: unknown,
): Promise<OpenEnaStandardReferenceV2> {
  const reference = decodeReferenceShapeV2(input);
  assertReferenceBasisV2(reference);
  assertFiniteReferenceGeometryV2(reference.geometry);
  assertOrthonormalColumnsV2(reference.geometry.rotationMatrix, 1e-8);
  assertReferenceCenterV2(reference.geometry.centerVector);
  const scientific = referenceScientificPayloadFromArtifactV2(reference);
  if (await sha256CanonicalJsonV3(scientific) !== reference.contentSha256) {
    throw new Error("Reference content SHA-256 does not match.");
  }
  return deepFreezeV3(structuredClone(reference));
}
```

- [ ] **Step 5: Add minting-boundary tests**

Assert trajectory results cannot mint References; Reference-projected Endpoint
results can download the original artifact but cannot mint a new fit; ONA and
TMA kinds are rejected.

```ts
await assert.rejects(() => buildReferenceV2(trajectoryResult, { displayName: "No" }), /EndPoint/i);
await assert.rejects(() => buildReferenceV2(projectedEndpoint, { displayName: "No" }), /target-fitted/i);
await assert.rejects(() => decodeReferenceV2(onaReference), /Standard/i);
```

- [ ] **Step 6: Run Reference tests**

Run: `node --import tsx --test tests/open-ena-reference-v2.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit Reference v2**

```bash
git add lib/open-ena/model-v3/reference-v2.ts lib/open-ena/model-v3/types.ts tests/open-ena-reference-v2.test.ts
git commit -m "feat: add content-addressed ENA references"
```

### Task 6: Remap Reference basis and project all three Standard models

**Files:**
- Modify: `lib/open-ena/model-v3/reference-v2.ts`
- Modify: `lib/open-ena/model-v3/execution-plan.ts`
- Modify: `lib/open-ena/model-v3/standard-adapter.ts`
- Test: `tests/open-ena-reference-v2-projection.test.ts`

- [ ] **Step 1: Write failing reordered-Code projection tests**

```ts
for (const model of ["EndPoint", "SeparateTrajectory", "AccumulatedTrajectory"] as const) {
  test(`Endpoint Reference projects ${model} after deterministic Code remapping`, async () => {
    const plan = await referenceTargetPlan({
      model,
      targetCodeOrder: ["C", "A", "B"],
    });
    assert.deepEqual(plan.reference?.basisPermutation, [1, 2, 0]);
    const result = runStandardPlanV3(plan);
    assert.deepEqual(result.set.rotation.rotationMatrix, plan.reference?.rotationSet.rotationMatrix);
    assert.deepEqual(result.set.rotation.nodes, plan.reference?.rotationSet.nodes);
  });
}
```

- [ ] **Step 2: Run projection tests**

Run: `node --import tsx --test tests/open-ena-reference-v2-projection.test.ts`
Expected: FAIL because basis remapping and trajectory Reference targets are not implemented.

- [ ] **Step 3: Implement compatibility and edge permutation**

Compare family, source model, Code identity set, undirected edge set, weighting,
window/extents, sphere normalization, Unit/Horizon fields, and Moving Stanza
row-order structure. Build a target edge-index map by typed source/target Code
identity; reorder rotation-matrix rows, centerVector, adjacency keys, and nodes;
then revalidate the remapped geometry. Do not compare display order.

```ts
export function bindReferenceToTargetV3(
  reference: OpenEnaStandardReferenceV2,
  config: CanonicalStandardConfigV3,
): ValidatedReferenceExecutionBindingV3 {
  assertReferenceCompatibilityV3(reference.compatibility, config);
  const basisPermutation = edgePermutationV3(reference.basis, config.codes);
  const rotationSet = remapRotationSetV3(reference.geometry, basisPermutation);
  assertRemappedBasisV3(rotationSet, config.codes);
  return {
    referenceId: reference.referenceId,
    contentSha256: reference.contentSha256,
    basisPermutation,
    rotationSet,
    sourceFit: reference.fit.method,
  };
}
```

- [ ] **Step 4: Apply fixed geometry without target fitting**

For Reference plans pass only `rotationSet` to jENA, use the Reference center
policy, reject simultaneous target rotation options, and validate that returned
rotation/nodes exactly equal the remapped Reference. Record source fit
population and target projection population separately.

```ts
if (plan.reference) {
  options.rotationSet = plan.reference.rotationSet;
  delete options.rotation;
}
const set = makeSet(data, extractMakeSetOptions(options));
if (plan.reference && !sameRotationSetV3(set.rotation, plan.reference.rotationSet)) {
  throw new Error("Reference projection refitted or changed fixed geometry.");
}
```

- [ ] **Step 5: Add mismatch and no-fallback cases**

Test missing/duplicate Code, edge mismatch, weighting, window, extents,
normalization, Unit/Horizon mapping, row comparator, direction, category
levels, locale, time zone, and content hash. Assert every failure remains a
Reference error and does not produce SVD/Means output.

```ts
for (const mutate of incompatibleReferenceCases) {
  const reference = structuredClone(validReference);
  mutate(reference);
  assert.throws(
    () => bindReferenceToTargetV3(reference, targetConfig),
    /Reference/i,
  );
}
```

- [ ] **Step 6: Run all Reference tests**

Run: `node --import tsx --test tests/open-ena-reference-v2*.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit Reference projection**

```bash
git add lib/open-ena/model-v3/reference-v2.ts lib/open-ena/model-v3/execution-plan.ts lib/open-ena/model-v3/standard-adapter.ts tests/open-ena-reference-v2-projection.test.ts
git commit -m "feat: project Standard models into references"
```

### Task 7: Bind results and replace the worker request boundary

**Files:**
- Create: `lib/open-ena/model-v3/result-binding.ts`
- Modify: `lib/open-ena/jena.worker.ts`
- Modify: `lib/open-ena/client.ts`
- Modify: `lib/open-ena/analyze.ts`
- Test: `tests/open-ena-model-v3-worker.test.ts`
- Test: `tests/open-ena-model-v3-result-binding.test.ts`

- [ ] **Step 1: Write failing current/stale binding tests**

```ts
test("a result is current only when every binding matches", () => {
  const result = bindResultV3(rawResult, plan);
  assert.equal(resultMatchesPlanV3(result, plan), true);
  for (const mutate of [
    (copy: typeof plan) => { copy.header.datasetSha256 = "b".repeat(64); },
    (copy: typeof plan) => { copy.header.configurationSha256 = "b".repeat(64); },
    (copy: typeof plan) => { copy.header.executionPlanSha256 = "b".repeat(64); },
    (copy: typeof plan) => { copy.header.runtimeVersion = "different"; },
  ]) {
    const changed = structuredClone(plan);
    mutate(changed);
    assert.equal(resultMatchesPlanV3(result, changed), false);
  }
});
```

- [ ] **Step 2: Write failing worker-plan tests**

Create an in-process worker scope, send one valid
`run-open-ena-plan-v3` request, and assert progress begins with verify-plan and
ends with a bound result. Send a hash-tampered plan and assert one error with no
jENA stream creation.

```ts
scope.dispatch({
  kind: "run-open-ena-plan-v3",
  id: "valid",
  plan: validPlan,
  chunkSize: 2,
});
await host.idle();
assert.equal(messages[0].stage, "verify-plan");
assert.equal(messages.at(-1)?.kind, "result");
```

- [ ] **Step 3: Run both focused tests**

Run: `node --import tsx --test tests/open-ena-model-v3-worker.test.ts tests/open-ena-model-v3-result-binding.test.ts`
Expected: FAIL because the binding and protocol are absent.

- [ ] **Step 4: Implement bound-result creation**

```ts
export function resultMatchesPlanV3(
  result: BoundOpenEnaResultV3,
  plan: OpenEnaExecutionPlanV3,
) {
  return result.binding.datasetSha256 === plan.header.datasetSha256
    && result.binding.datasetHashKind === plan.header.datasetHashKind
    && result.binding.headerSha256 === plan.header.headerSha256
    && result.binding.configurationSha256 === plan.header.configurationSha256
    && result.binding.executionPlanSha256 === plan.header.executionPlanSha256
    && result.binding.runtimeVersion === plan.header.runtimeVersion
    && result.binding.algorithmBuildSha === plan.header.algorithmBuildSha
    && result.binding.validationContractVersion === plan.header.validationContractVersion
    && result.binding.runtimePolicyVersion === plan.header.runtimePolicyVersion
    && result.binding.executionContractVersion === plan.header.executionContractVersion
    && result.binding.referenceId === (plan.reference?.referenceId ?? null)
    && result.binding.referenceContentSha256
      === (plan.reference?.contentSha256 ?? null);
}
```

Implement `bindResultV3(plan, verifiedSet, observedResources, diagnostics)` by
cloning the canonical config, identities, Code/edge basis, ordering, versions,
and estimated resources from the plan, then adding fit/target populations,
center, rank, full axes, variance, runtime axis names, and observed resource
counters only from the verified runtime result. Never read the current UI.
Before returning, validate every provenance dictionary/token/table reference,
finite vector/matrix, population count, and family-specific network shape.
Translate every plan-local Unit, Horizon, Group, Code, and edge token back
through its reversible dictionary while binding; an unknown token is fatal and
no internal token may remain in the user-facing ENA set or exported tables.
Compute `scientificResultSha256` over the canonical configuration, complete
execution provenance, ENA set, and capability status before inserting that hash
into the binding; validation recomputes the same hash payload and rejects
self-hash or content mismatches.

Add the result contract in `model-v3/types.ts`:

```ts
export interface BoundOpenEnaResultV3 {
  schemaVersion: 3;
  kind: "open-ena-bound-result";
  binding: {
    datasetSha256: string;
    datasetHashKind: DatasetHashKind;
    headerSha256: string;
    configurationSha256: string;
    executionPlanSha256: string;
    runtimeVersion: string;
    algorithmBuildSha: string;
    validationContractVersion: typeof OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3;
    runtimePolicyVersion: typeof OPEN_ENA_RUNTIME_POLICY_VERSION_V3;
    executionContractVersion: typeof OPEN_ENA_EXECUTION_CONTRACT_VERSION_V3;
    referenceId: string | null;
    referenceContentSha256: string | null;
    scientificResultSha256: string;
  };
  configuration: CanonicalStandardConfigV3 | CanonicalOnaConfigV3;
  executionProvenance: OpenEnaExecutionProvenanceV3;
  set: ENASet;
  capabilityStatus: Record<ModelCapabilityV3, "available" | "blocked">;
  createdAt: string;
}
```

- [ ] **Step 5: Replace the v3 worker request**

Add:

```ts
type OpenEnaWorkerRequestV3 =
  | {
      kind: "run-open-ena-plan-v3";
      id: string;
      plan: OpenEnaExecutionPlanV3;
      chunkSize: number;
    }
  | { kind: "cancel"; id: string };
```

The worker validates the plan before stream creation, emits explicit stages,
runs the Standard or ONA adapter by discriminator, recomputes the resource
estimate from the validated rows/config and requires exact equality, calls the
runtime allocation guard before stream creation, tracks actual buffered rows
and numeric cells against both the declared estimate and hard limits, checks
cancellation at chunk boundaries, validates the result, binds it, disposes the
stream, and returns no partial result.

- [ ] **Step 6: Update the browser client**

Change `analyzeDatasetInWorker` to accept a ready execution plan rather than
dataset/config/reference. Preserve the 60-second timeout and AbortSignal.
Match request ID and plan hash before resolving. A late or wrong-hash result is
rejected.

```ts
export async function analyzePlanInWorkerV3(
  plan: OpenEnaExecutionPlanV3,
  options: { signal?: AbortSignal; onProgress?: (progress: ENAWorkerProgress) => void },
): Promise<BoundOpenEnaResultV3> {
  const id = `open-ena-v3-${crypto.randomUUID()}`;
  return runWorkerRequestV3({
    kind: "run-open-ena-plan-v3",
    id,
    plan,
    chunkSize: 2_000,
  }, {
    ...options,
    expectedPlanSha256: plan.header.executionPlanSha256,
    timeoutMs: 60_000,
  });
}
```

- [ ] **Step 7: Add cancellation, obsolete, duplicate-ID, and late-result tests**

Use injected stream dependencies. Assert queued and active cancellation,
forward-Infinity cancellation at a chunk boundary, duplicate request rejection,
stream disposal, pre-allocation resource rejection, runtime estimate overrun
rejection with no partial result, and that a result for plan B cannot satisfy a
caller waiting for plan A.

```ts
controller.abort();
await assert.rejects(runPromise, (error: unknown) => (
  error instanceof DOMException && error.name === "AbortError"
));
assert.equal(disposeCalls, 1);
assert.equal(messages.some((message) => message.kind === "result"), false);
```

- [ ] **Step 8: Run worker, client, and existing functional tests**

Run:

```bash
node --import tsx --test tests/open-ena-model-v3-worker.test.ts tests/open-ena-model-v3-result-binding.test.ts
node --import tsx --test tests/open-ena-functional.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit the worker boundary**

```bash
git add lib/open-ena/model-v3/result-binding.ts lib/open-ena/jena.worker.ts lib/open-ena/client.ts lib/open-ena/analyze.ts tests/open-ena-model-v3-worker.test.ts tests/open-ena-model-v3-result-binding.test.ts
git commit -m "feat: execute hash-bound Open ENA plans"
```

### Task 8: Wrap ONA in its isolated v3 adapter

**Files:**
- Create: `lib/open-ena/model-v3/ona-adapter.ts`
- Modify: `lib/open-ena/model-v3/execution-plan.ts`
- Modify: `lib/open-ena/jena.worker.ts`
- Modify: `lib/open-ena/model-v3/index.ts`
- Test: `tests/open-ena-ona-v3-adapter.test.ts`

- [ ] **Step 1: Write a failing legacy-versus-v3 ONA equality test**

```ts
test("the v3 ONA adapter preserves the complete existing result", async () => {
  const legacy = analyzeDataset(onaDataset, onaConfig);
  const plan = await buildOnaExecutionPlanV3(
    onaDataset,
    datasetSha256,
    migrateOnaConfigToCanonicalV3(onaConfig),
  );
  const current = runOnaPlanV3(plan);
  assert.deepEqual(current.set.connectionCounts, legacy.set.connectionCounts);
  assert.deepEqual(current.set.lineWeights, legacy.set.lineWeights);
  assert.deepEqual(current.set.points, legacy.set.points);
  assert.deepEqual(current.set.rotation, legacy.set.rotation);
  assert.deepEqual(current.orderedAudit, legacy.orderedAudit);
});
```

- [ ] **Step 2: Run the ONA adapter test**

Run: `node --import tsx --test tests/open-ena-ona-v3-adapter.test.ts`
Expected: FAIL because the ONA v3 adapter is absent.

- [ ] **Step 3: Implement the thin ONA adapter**

Translate only the fixed ONA canonical fields into the existing ordered jENA
options: EndPoint, Moving Stanza, backward finite/Infinity, forward 0, sum,
SVD, directed node positions, explicit row order, and the unchanged
directional mask. Reuse existing ordered audits and response-node summaries.
Reject Conversation, trajectory, Reference, Means, and forward values before
jENA.

```ts
export function buildOnaCodeDictionaryV3(definitions: CanonicalCodeV3[]) {
  const codes = buildCanonicalCodeEntriesV3(definitions);
  const edges = codes.flatMap((response, responseIndex) => codes.map(
    (ground, groundIndex) => ({
      token: `__open_ena_directed_edge_v3_${String(groundIndex).padStart(3, "0")}_${String(responseIndex).padStart(3, "0")}`,
      groundCodeIdentity: ground.canonicalIdentity,
      responseCodeIdentity: response.canonicalIdentity,
      groundIndex,
      responseIndex,
    }),
  ));
  return { codes, edges };
}

function isOnaExecutionPlanV3(plan: OpenEnaExecutionPlanV3): plan is OnaExecutionPlanV3 {
  return plan.header.analysisFamily === "ona";
}

export async function buildOnaExecutionPlanV3(
  dataset: ParsedDataset,
  datasetSha256: string,
  configuration: CanonicalOnaConfigV3,
): Promise<OnaExecutionPlanV3> {
  const decoded = decodeCanonicalOnaConfigV3(configuration);
  const identities = await buildExecutionIdentityDictionaryV3(
    dataset.rows,
    decoded.units.columns,
    decoded.horizons.columns,
    decoded.units.group.type === "stable-metadata" ? decoded.units.group.column : null,
  );
  const codeDictionary = buildOnaCodeDictionaryV3(decoded.codes);
  const codeRepresentations = buildCodeRepresentationBindingsV3(
    dataset.rows,
    decoded.weighting,
    codeDictionary,
  );
  const rowOrdering = resolveRowOrderV3(
    dataset.rows,
    decoded.horizons.columns,
    decoded.window.rowOrder,
  );
  const planWithoutHash = buildOnaPlanPayloadV3({
    dataset,
    datasetSha256,
    configuration: decoded,
    configurationSha256: await sha256CanonicalJsonV3(decoded),
    identities,
    codeDictionary,
    codeRepresentations,
    rowOrdering,
    resourceEstimate: estimateOnaResourcesV3(dataset, decoded),
  });
  const validated = await validateExecutionPlanV3({
    ...planWithoutHash,
    header: {
      ...planWithoutHash.header,
      executionPlanSha256: await sha256CanonicalJsonV3(
        executionPlanHashPayloadV3(planWithoutHash),
      ),
    },
  });
  if (!isOnaExecutionPlanV3(validated)) {
    throw new Error("Expected an ONA execution plan after validation.");
  }
  return validated;
}

export function toOnaJenaOptionsV3(plan: OnaExecutionPlanV3): ENAWorkerOptions {
  assertOnaCanonicalContractV3(plan.configuration);
  const parameters = assertOnaAdapterParametersV3(plan);
  return {
    rows: plan.rows.map(executionRowToJenaRowV3),
    units: ["__open_ena_unit_token"],
    conversation: ["__open_ena_horizon_token"],
    codes: plan.codeDictionary.codes.map((entry) => entry.token),
    networkType: parameters.networkType,
    model: parameters.model,
    window: parameters.window.type,
    windowSizeBack: extentToNumberV3(parameters.window.backward),
    windowSizeForward: parameters.window.forward,
    weightBy: parameters.weightBy,
    rotation: { method: parameters.rotation },
    nodePositionMethod: parameters.nodePositionMethod,
    mask: booleanMaskToNumericV3(plan.directionalMask),
    dimensions: parameters.displayDimensions,
  };
}
```

`buildOnaPlanPayloadV3` must populate the same dataset/header/contract/runtime
fields as the Standard builder, materialize one and only one row per source
index, carry the exact canonical mask into both configuration and plan, set
`reference: null`, derive `adapterParameters` from the canonical ONA contract,
and reject a blocked resource estimate. The final
`validateExecutionPlanV3` family discriminator must return the ONA branch.

- [ ] **Step 4: Add Standard/ONA field-leakage tests**

Attempt to inject a Reference, Horizon order, forward extent, Means rotation,
or Standard Binary weighting into serialized ONA plans; assert plan validation
rejects every case. Assert Standard plans reject directional masks.

```ts
for (const mutation of familyLeakageMutations) {
  const plan = structuredClone(validOnaPlan) as unknown as Record<string, unknown>;
  mutation(plan);
  await assert.rejects(() => validateExecutionPlanV3(plan), /ONA|family|contract/i);
}
```

- [ ] **Step 5: Run the public ONA suites**

Run:

```bash
node --import tsx --test tests/open-ena-ona-analysis-plan.test.ts tests/open-ena-ona-worker.test.ts tests/open-ena-ona-bundle.test.ts tests/open-ena-ona-descriptive.test.ts
node --import tsx --test tests/open-ena-ona-v3-adapter.test.ts
```

Expected: PASS with unchanged numeric assertions.

- [ ] **Step 6: Run Plan 2 application and jENA gates**

Run:

```bash
npm test --workspace=jena-js
npm run typecheck:app
npm run test:app
```

Expected: PASS.

- [ ] **Step 7: Commit ONA isolation**

```bash
git add lib/open-ena/model-v3/ona-adapter.ts lib/open-ena/model-v3/execution-plan.ts lib/open-ena/model-v3/index.ts lib/open-ena/jena.worker.ts tests/open-ena-ona-v3-adapter.test.ts
git commit -m "refactor: isolate ONA execution contracts"
```

## Plan 2 completion checkpoint

- All six Standard combinations run through v3 plans.
- Binary/Frequency and both Infinity extents are exercised.
- Means is direct Endpoint-only.
- Endpoint References project all three Standard models.
- Worker accepts and validates plans rather than UI drafts.
- Results bind every required hash.
- Public ONA numerical suites are unchanged.
- `npm run test:app`, jENA tests, and app typecheck pass.
