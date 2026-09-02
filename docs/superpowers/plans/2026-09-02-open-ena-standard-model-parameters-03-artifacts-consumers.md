# Open ENA Model V3 Artifacts and Consumers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make schema-v3 bound results, provenance, References, bundles, methods reports, and every downstream scientific consumer use one immutable result source of truth.

**Architecture:** Export and consumer APIs accept BoundOpenEnaResultV3, never the live UI draft. New writes use component-hashed v3 artifacts; legacy readers create historical results or drafts with explicit limitations; capability gates prevent stale or methodologically incompatible analyses.

**Tech Stack:** TypeScript, Node test runner, existing Open ENA exports, longitudinal, inference, contrasts, sets, and AI interpretation modules.

---

### Task 1: Build the analysis bundle v3 and component integrity hashes

**Files:**
- Modify: `lib/open-ena/export.ts`
- Modify: `lib/open-ena/model-v3/types.ts`
- Test: `tests/open-ena-analysis-bundle-v3.test.ts`

- [ ] **Step 1: Write the failing bundle round-trip test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAnalysisBundleV3,
  parseAnalysisBundleV3,
} from "../lib/open-ena/export";

test("bundle v3 binds configuration, execution, tables, rotation, and methods", async () => {
  const bundle = await buildAnalysisBundleV3(boundResultFixture);
  assert.equal(bundle.schemaVersion, 3);
  assert.equal(bundle.kind, "open-ena-analysis-bundle");
  assert.equal(
    bundle.manifest.configurationSha256,
    boundResultFixture.binding.configurationSha256,
  );
  assert.match(bundle.integrity.bundleContentSha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(await parseAnalysisBundleV3(JSON.stringify(bundle)), bundle);
});
```

- [ ] **Step 2: Run the bundle test**

Run: `node --import tsx --test tests/open-ena-analysis-bundle-v3.test.ts`
Expected: FAIL because v3 bundle APIs are absent.

- [ ] **Step 3: Define the exact v3 bundle**

Add exact typed fields for manifest, canonical configuration, execution
provenance, tables, full rotation, statistics, capability status, diagnostics,
optional presentation, methods Markdown, component hashes, and bundle hash.
Build every component from the bound result; do not read the current draft.

```ts
export interface OpenEnaModelTablesV3 {
  connectionCounts: Row[];
  lineWeights: Row[];
  pointsForProjection: Row[];
  points: Row[];
  trajectories: Row[];
}

export interface BoundStatisticsV3 {
  available: boolean;
  diagnostics: string[];
  value: ENAStatsResult | null;
}

export interface PresentationArtifactV3 {
  boundResultSha256: string;
  hiddenCodes: string[];
  hiddenGroups: ScalarIdentityV3[];
  codeColors: Record<string, string>;
  nodeOverrides: NodeDisplayOverride[];
  dimensions: string[];
  camera3d?: CameraState;
}

export interface OpenEnaAnalysisBundleV3 {
  schemaVersion: 3;
  kind: "open-ena-analysis-bundle";
  manifest: {
    datasetSha256: string;
    datasetHashKind: DatasetHashKind;
    headerSha256: string;
    configurationSha256: string;
    executionPlanSha256: string;
    scientificResultSha256: string;
    runtimeVersion: string;
    algorithmBuildSha: string;
    validationContractVersion: string;
    runtimePolicyVersion: string;
    executionContractVersion: string;
    referenceId: string | null;
    referenceContentSha256: string | null;
  };
  configuration: BoundOpenEnaResultV3["configuration"];
  executionProvenance: OpenEnaExecutionProvenanceV3;
  tables: OpenEnaModelTablesV3;
  rotation: RotationSet;
  statistics: BoundStatisticsV3;
  capabilityStatus: BoundOpenEnaResultV3["capabilityStatus"];
  diagnostics: { warnings: ModelDiagnosticV3[]; execution: string[] };
  presentation?: PresentationArtifactV3;
  methodsReportMarkdown: string;
  integrity: {
    componentHashes: BundleComponentHashesV3;
    bundleContentSha256: string;
  };
}

export interface BundleComponentHashesV3 {
  manifest: string;
  configuration: string;
  executionProvenance: string;
  tables: string;
  rotation: string;
  statistics: string;
  capabilityStatus: string;
  diagnostics: string;
  presentation?: string;
  methodsReportMarkdown: string;
}
```

- [ ] **Step 4: Implement canonical component hashes**

```ts
async function componentHash(value: unknown) {
  return sha256CanonicalJsonV3(value);
}

export async function buildBundleIntegrityV3(
  components: Omit<OpenEnaAnalysisBundleV3, "integrity">,
) {
  const componentHashes = {
    manifest: await componentHash(components.manifest),
    configuration: await componentHash(components.configuration),
    executionProvenance: await componentHash(components.executionProvenance),
    tables: await componentHash(components.tables),
    rotation: await componentHash(components.rotation),
    statistics: await componentHash(components.statistics),
    capabilityStatus: await componentHash(components.capabilityStatus),
    diagnostics: await componentHash(components.diagnostics),
    ...(components.presentation
      ? { presentation: await componentHash(components.presentation) }
      : {}),
    methodsReportMarkdown: await sha256TextV3(components.methodsReportMarkdown),
  };
  return {
    componentHashes,
    bundleContentSha256: await componentHash({ ...components, componentHashes }),
  };
}
```

- [ ] **Step 5: Implement strict parsing and tamper tests**

Parse exact keys and revalidate every component hash, bundle hash, model-table
shape, rotation basis, identity dictionaries, and binding equality. Mutate one
table cell, one provenance ordinal, one rotation cell, and one methods
character; assert each artifact is rejected as verified.

```ts
for (const mutate of bundleTamperCases) {
  const changed = structuredClone(validBundle);
  mutate(changed);
  await assert.rejects(
    () => parseAnalysisBundleV3(JSON.stringify(changed)),
    /hash|integrity|contract/i,
  );
}
```

- [ ] **Step 6: Run bundle and existing export tests**

Run:

```bash
node --import tsx --test tests/open-ena-analysis-bundle-v3.test.ts
node --import tsx --test tests/open-ena-ona-bundle.test.ts tests/open-ena-pairwise-export-methods.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit bundle v3**

```bash
git add lib/open-ena/export.ts lib/open-ena/model-v3/types.ts tests/open-ena-analysis-bundle-v3.test.ts
git commit -m "feat: export hash-bound ENA analysis bundles"
```

### Task 2: Add canonical-config, draft, stale-audit, and Reference exports

**Files:**
- Modify: `lib/open-ena/export.ts`
- Modify: `lib/open-ena/reference.ts`
- Test: `tests/open-ena-model-v3-export-policy.test.ts`

- [ ] **Step 1: Write failing export-policy tests**

```ts
test("normal analysis export requires a current result", async () => {
  await assert.rejects(
    () => exportCurrentAnalysisV3(staleResult, currentPlan),
    /stale.*audit/i,
  );
  const audit = await exportStaleAuditV3(staleResult, currentDraftFingerprint);
  assert.equal(audit.kind, "open-ena-stale-audit");
  assert.equal(audit.executable, false);
});

test("invalid drafts export only as non-executable drafts", async () => {
  const artifact = await exportDraftV3(invalidDraft);
  assert.equal(artifact.kind, "open-ena-draft");
  assert.equal(artifact.executable, false);
});
```

- [ ] **Step 2: Run export-policy tests**

Run: `node --import tsx --test tests/open-ena-model-v3-export-policy.test.ts`
Expected: FAIL because v3 policy APIs are absent.

- [ ] **Step 3: Implement distinct artifact builders**

Add:

```ts
exportCanonicalConfigV3(readyCompileResult)
exportDraftV3(draft)
exportCurrentAnalysisV3(boundResult, currentPlan)
exportStaleAuditV3(boundResult, currentDraftFingerprint)
exportReferenceV2(boundEndpointResult)
```

Each function returns a different exact `kind`, filename suffix, executable
flag where applicable, and integrity hash. A stale result cannot pass through
the normal analysis builder.

- [ ] **Step 4: Delegate legacy Reference exports**

Keep existing public functions in `reference.ts`, but make qualifying v3
results delegate to `model-v3/reference-v2.ts`. A Reference-projected
Endpoint returns/downloads the original Reference and cannot mint a new fit.

```ts
export async function buildReferenceRotationPackageV2(result: BoundOpenEnaResultV3) {
  if (result.configuration.analysisFamily !== "standard") {
    throw new Error("Only Standard ENA can export a Reference.");
  }
  if (result.binding.referenceId) return originalReferenceForResultV3(result);
  return buildReferenceV2(result, {
    displayName: defaultReferenceNameV2(result),
  });
}
```

- [ ] **Step 5: Add filename and no-overwrite assertions**

Assert canonical configs end in `.standard-ena-config.v3.json`, drafts in
`.open-ena-draft.v3.json`, current bundles in
`.standard-ena-analysis.v3.json`, stale audits contain `.STALE-`, and
References end in `.standard-ena-reference.v2.json`. Export builders return
bytes; they do not mutate imported artifacts or write files themselves.

```ts
assert.match(canonical.filename, /\.standard-ena-config\.v3\.json$/u);
assert.match(draft.filename, /\.open-ena-draft\.v3\.json$/u);
assert.match(current.filename, /\.standard-ena-analysis\.v3\.json$/u);
assert.match(stale.filename, /\.STALE-/u);
assert.match(reference.filename, /\.standard-ena-reference\.v2\.json$/u);
```

- [ ] **Step 6: Run export tests**

Run: `node --import tsx --test tests/open-ena-model-v3-export-policy.test.ts tests/open-ena-reference-v2.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit artifact policy**

```bash
git add lib/open-ena/export.ts lib/open-ena/reference.ts tests/open-ena-model-v3-export-policy.test.ts
git commit -m "feat: separate ENA model artifact exports"
```

### Task 3: Migrate legacy config, bundle, and Reference imports

**Files:**
- Modify: `lib/open-ena/export.ts`
- Modify: `lib/open-ena/reference.ts`
- Modify: `lib/open-ena/model-v3/migration.ts`
- Test: `tests/open-ena-model-v3-import.test.ts`
- Test: `tests/fixtures/open-ena/analysis-bundle-v1.json`

- [ ] **Step 1: Write failing legacy import-state tests**

```ts
test("legacy Moving Stanza imports become invalid reviewable drafts", async () => {
  const imported = await importOpenEnaArtifactV3(JSON.stringify(legacyConfig));
  assert.equal(imported.kind, "draft");
  assert.equal(imported.autoRun, false);
  assert.equal(imported.draft.standard.movingStanza.rowOrder, null);
  assert.equal(imported.review.includes("row-order"), true);
});

test("legacy result imports do not overwrite the current draft", async () => {
  const imported = await importOpenEnaArtifactV3(
    readFileSync("tests/fixtures/open-ena/analysis-bundle-v1.json", "utf8"),
  );
  assert.equal(imported.kind, "historical-result");
  assert.equal(imported.loadConfigurationAction.required, true);
});
```

- [ ] **Step 2: Run the import test**

Run: `node --import tsx --test tests/open-ena-model-v3-import.test.ts`
Expected: FAIL because the unified v3 importer is absent.

- [ ] **Step 3: Implement kind-first bounded import routing**

Parse bytes under existing file-size limits, reject excessive JSON depth and
unsafe or duplicate object keys before materializing the object, inspect
schema/kind, and route to strict v3 config/draft/bundle/
Reference parsers or legacy adapters. Return a side-effect-free import result;
never update workspace state or start a worker inside the parser.

```ts
export async function importOpenEnaArtifactV3(text: string): Promise<OpenEnaImportResultV3> {
  assertBoundedJsonTextV3(text);
  const value = parseSafeJsonV3(text);
  assertNoUnsafeKeysV3(value);
  const identity = artifactIdentityV3(value);
  switch (identity) {
    case "config-v3": return importCanonicalConfigV3(value);
    case "draft-v3": return importDraftV3(value);
    case "bundle-v3": return importBundleV3(value);
    case "reference-v2": return importReferenceV2(value);
    case "legacy": return importLegacyArtifactV3(value);
  }
}
```

`parseSafeJsonV3` must use a bounded tokenizer/parser that observes object keys
before overwrite; plain `JSON.parse` plus a reviver is insufficient for
duplicate-key rejection. It enforces byte, nesting, array-length, object-key,
string-length, and numeric bounds while parsing, then the strict artifact
decoder enforces exact semantic keys.

- [ ] **Step 4: Implement legacy limitations**

Legacy Standard Moving Stanza gets no row-order confirmation; legacy
trajectory gets no Horizon-order confirmation; legacy Means preserves the
Group candidate but leaves ordered contrast levels unconfirmed; legacy
Reference computes the received artifact hash and lists missing source
provenance. ONA retains its explicit order/mask.

```ts
const migrated = migrateLegacyOpenEnaConfigToDraftV3(legacyConfig);
migrated.standard.movingStanza.rowOrder = null;
if (migrated.standard.model !== "EndPoint") migrated.standard.horizonOrder = null;
if (migrated.standard.rotation.type === "means") {
  migrated.standard.rotation.negativeLevel = null;
  migrated.standard.rotation.positiveLevel = null;
}
migrated.autoRun = false;
```

- [ ] **Step 5: Add hostile artifact cases**

Test excessive nesting, huge arrays, a raw duplicate JSON object key,
non-finite values represented through programmatic objects, `__proto__`,
unknown schema/kind, duplicate semantic
Codes, matrix dimension bombs, disguised ONA as Standard, and a trajectory
artifact declaring itself an Endpoint Reference. Assert the current draft and
registry fixture remain byte-for-byte unchanged.

```ts
for (const attack of hostileArtifacts) {
  const before = canonicalJsonV3(workspaceFixture);
  await assert.rejects(() => importOpenEnaArtifactV3(attack));
  assert.equal(canonicalJsonV3(workspaceFixture), before);
}
```

- [ ] **Step 6: Run migration, import, and legacy bundle tests**

Run:

```bash
node --import tsx --test tests/open-ena-model-v3-import.test.ts tests/open-ena-model-v3-migration.test.ts
node --import tsx --test tests/open-ena-ona-bundle.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit dual-read migration**

```bash
git add lib/open-ena/export.ts lib/open-ena/reference.ts lib/open-ena/model-v3/migration.ts tests/open-ena-model-v3-import.test.ts tests/fixtures/open-ena/analysis-bundle-v1.json
git commit -m "feat: migrate legacy ENA model artifacts"
```

### Task 4: Generate methods only from bound provenance

**Files:**
- Modify: `lib/open-ena/methods.ts`
- Test: `tests/open-ena-methods-v3.test.ts`

- [ ] **Step 1: Write failing SVD, Means, Reference, and trajectory methods tests**

```ts
test("Methods reports exact ordering and window semantics", () => {
  const report = buildMethodsReportV3(movingTrajectoryResult);
  assert.match(report, /Backward size 5 includes the current row and up to 4 preceding rows/u);
  assert.match(report, /Forward size 2 includes up to 2 following rows/u);
  assert.match(report, /within each Horizon/u);
  assert.match(report, /No missing trajectory steps were imputed/u);
  assert.match(report, /configuration SHA-256/u);
  assert.match(report, /execution-plan SHA-256/u);
});

test("Means and Reference reports state their construction limits", () => {
  assert.match(buildMethodsReportV3(meansResult), /positive mean minus the negative mean/u);
  assert.match(buildMethodsReportV3(meansResult), /descriptive by construction/u);
  assert.match(buildMethodsReportV3(referenceTrajectoryResult), /fixed Endpoint reference/u);
  assert.match(buildMethodsReportV3(referenceTrajectoryResult), /axes and node positions were not refitted/u);
});
```

- [ ] **Step 2: Run methods tests**

Run: `node --import tsx --test tests/open-ena-methods-v3.test.ts`
Expected: FAIL because `buildMethodsReportV3` is absent.

- [ ] **Step 3: Implement the v3 report from bound result fields**

Create pure section builders for Data Binding, Units, Horizons, Codes,
Window/Weighting, Ordering, Model/Trajectory, Rotation, Warnings/Capabilities,
and Limitations. Read only `BoundOpenEnaResultV3`; accept no draft or separate
config argument.

```ts
export function buildMethodsReportV3(result: BoundOpenEnaResultV3): string {
  return [
    methodsDataBindingV3(result),
    methodsUnitsV3(result),
    methodsHorizonsV3(result),
    methodsCodesV3(result),
    methodsWindowAndWeightingV3(result),
    methodsOrderingV3(result),
    methodsModelV3(result),
    methodsRotationV3(result),
    methodsWarningsV3(result),
    methodsLimitationsV3(result),
  ].join("\n\n");
}
```

- [ ] **Step 4: Cover every approved report distinction**

Add assertions for Conversation row order not applicable, Binary/Frequency,
both Infinity extents, shared Horizons, observed Unit sequences, rank one,
Means direction and group counts, Reference source/target populations, legacy
Reference limitations, target-projected variance, ONA descriptive-only text,
and stale audit labeling.

- [ ] **Step 5: Run v3 and existing methods tests**

Run: `node --import tsx --test tests/open-ena-methods-v3.test.ts tests/open-ena-methods.test.ts tests/open-ena-pairwise-export-methods.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit bound methods**

```bash
git add lib/open-ena/methods.ts tests/open-ena-methods-v3.test.ts
git commit -m "feat: report bound Standard ENA methods"
```

### Task 5: Gate inference and contrasts on bound current results

**Files:**
- Modify: `lib/open-ena/inference-v2.ts`
- Modify: `lib/open-ena/inference-consumers.ts`
- Modify: `lib/open-ena/contrasts.ts`
- Test: `tests/open-ena-model-v3-inference-consumers.test.ts`

- [ ] **Step 1: Write failing stale and small-group capability tests**

```ts
test("stale results and blocked capabilities cannot start new inference", () => {
  assert.throws(
    () => buildInferenceInputV3(staleResult, currentPlan),
    /stale/i,
  );
  assert.throws(
    () => buildInferenceInputV3(meansOneUnitPerGroup, matchingPlan),
    /group-inference.*blocked/i,
  );
});

test("display visibility never changes contrast data", () => {
  const visible = buildContrastV3(currentResult, { hiddenCodes: [] });
  const hidden = buildContrastV3(currentResult, { hiddenCodes: currentResult.configuration.codes.map((code) => code.column) });
  assert.deepEqual(hidden.primary, visible.primary);
  assert.deepEqual(hidden.secondary, visible.secondary);
});
```

- [ ] **Step 2: Run the consumer test**

Run: `node --import tsx --test tests/open-ena-model-v3-inference-consumers.test.ts`
Expected: FAIL because v3 consumer entry points are absent.

- [ ] **Step 3: Add one bound-result guard**

```ts
export function assertCurrentCapabilityV3(
  result: BoundOpenEnaResultV3,
  plan: OpenEnaExecutionPlanV3,
  capability: ModelCapabilityV3,
) {
  if (!resultMatchesPlanV3(result, plan)) {
    throw new Error("The Open ENA result is stale for the current execution plan.");
  }
  if (result.capabilityStatus[capability] === "blocked") {
    throw new Error(`Open ENA capability “${capability}” is blocked by model diagnostics.`);
  }
}
```

Use it at inference and contrast entry points. Remove any fallback that rebuilds
binding data from the live draft.

- [ ] **Step 4: Preserve Reference interpretation**

Inference provenance records whether axes are target-fitted SVD/Means or fixed
Reference, and labels Reference variance as target projected variance. Means
MR1 tests retain the “descriptive by construction” boundary.

```ts
const projectionAuthority = result.executionProvenance.projection.type === "reference"
  ? "fixed-reference-target-projection"
  : "target-fitted";
return {
  ...inference,
  projectionAuthority,
  varianceMeaning: projectionAuthority === "target-fitted"
    ? "fitted-space variance"
    : "target variance along fixed reference axes",
};
```

- [ ] **Step 5: Run consumer and existing inference/contrast tests**

Run:

```bash
node --import tsx --test tests/open-ena-model-v3-inference-consumers.test.ts
node --import tsx --test tests/open-ena-inference-v2.test.ts tests/open-ena-inference-consumers-v2.test.ts tests/open-ena-contrasts.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit consumer gates**

```bash
git add lib/open-ena/inference-v2.ts lib/open-ena/inference-consumers.ts lib/open-ena/contrasts.ts tests/open-ena-model-v3-inference-consumers.test.ts
git commit -m "refactor: bind ENA inference to current results"
```

### Task 6: Bind longitudinal analysis to fitted Horizon order

**Files:**
- Modify: `lib/open-ena/longitudinal.ts`
- Modify: `lib/open-ena/longitudinal-v3.ts`
- Test: `tests/open-ena-model-v3-longitudinal.test.ts`

- [ ] **Step 1: Write failing order-lock and missing-step tests**

```ts
test("Accumulated trajectories use the bound order and cannot be reordered after fit", () => {
  const view = buildLongitudinalViewV3(accumulatedResult, {
    requestedOrder: accumulatedResult.executionProvenance.ordering.horizons,
  });
  assert.deepEqual(view.unitSequences, accumulatedResult.executionProvenance.ordering.horizons.unitSequences);
  assert.throws(
    () => reorderLongitudinalViewV3(view, ["Week 2", "Week 1"]),
    /Accumulated.*fitted Horizon order/i,
  );
});

test("missing Unit steps remain absent", () => {
  const view = buildLongitudinalViewV3(unbalancedSeparateResult, {});
  assert.deepEqual(view.entities.find((entity) => entity.id === "u1")?.steps, ["Week 1", "Week 3"]);
  assert.equal(view.entities.find((entity) => entity.id === "u1")?.steps.includes("Week 2"), false);
});
```

- [ ] **Step 2: Run longitudinal v3 tests**

Run: `node --import tsx --test tests/open-ena-model-v3-longitudinal.test.ts`
Expected: FAIL because the consumer still derives order from source encounter/settings.

- [ ] **Step 3: Replace source-derived order with bound provenance**

Read per-Unit sequences from
`result.executionProvenance.ordering.horizons.unitSequences`. For Separate,
allow display filtering but not scientific redefinition of the result order.
For Accumulated, reject any post-fit reordering. Do not create absent periods.

```ts
const ordering = result.executionProvenance.horizonOrdering;
if (ordering.type !== "trajectory-horizon-order") {
  throw new Error("Trajectory result lacks bound Horizon order.");
}
const unitSequences = ordering.unitSequences.map((entry) => ({
  unitToken: entry.unitToken,
  steps: entry.steps.map((step) => ({ ...step })),
}));
```

- [ ] **Step 4: Preserve complete-case separation**

Keep complete/incomplete cohort logic in the downstream view. A valid unbalanced
core trajectory can exist while a balanced longitudinal comparison remains
blocked. Record that capability boundary in the view provenance.

```ts
const completeUnitTokens = unitSequences
  .filter((entry) => requiredHorizons.every(
    (horizonToken) => entry.steps.some((step) => step.horizonToken === horizonToken),
  ))
  .map((entry) => entry.unitToken);
const comparisonAvailable = completeUnitTokens.length >= minimumCompleteUnits;
```

- [ ] **Step 5: Add Reference trajectory cases**

Assert a Reference trajectory preserves fixed source geometry, target Horizon
order, target projected variance, and source/target hashes.

```ts
assert.equal(view.projection.type, "reference");
assert.equal(view.projection.referenceContentSha256, reference.contentSha256);
assert.equal(view.binding.datasetSha256, targetDatasetSha256);
assert.deepEqual(view.rotation, reference.geometry.rotationMatrix);
```

- [ ] **Step 6: Run longitudinal suites**

Run:

```bash
node --import tsx --test tests/open-ena-model-v3-longitudinal.test.ts
node --import tsx --test tests/open-ena-longitudinal.test.ts tests/open-ena-longitudinal-v3.test.ts tests/open-ena-longitudinal-v3-scientific-revision.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit longitudinal binding**

```bash
git add lib/open-ena/longitudinal.ts lib/open-ena/longitudinal-v3.ts tests/open-ena-model-v3-longitudinal.test.ts
git commit -m "refactor: bind trajectories to fitted Horizon order"
```

### Task 7: Migrate AI, sets, Data View, and presentation artifacts

**Files:**
- Modify: `lib/open-ena/ai-interpretation.ts`
- Modify: `lib/open-ena/sets.ts`
- Modify: `lib/open-ena/data-view-export.ts`
- Modify: `lib/open-ena/export.ts`
- Test: `tests/open-ena-model-v3-bound-consumers.test.ts`

- [ ] **Step 1: Write failing payload and token-leak tests**

```ts
test("bound consumers never read a divergent draft or leak internal tokens", async () => {
  const payload = buildAiInterpretationPayloadV3(boundResult, divergentDraft);
  assert.equal(payload.configurationSha256, boundResult.binding.configurationSha256);
  assert.doesNotMatch(JSON.stringify(payload), /__open_ena_(?:unit|horizon|code|edge)_v3/u);

  const exported = buildDataViewRowsV3(boundResult);
  assert.equal(exported[0].Student, "Ava");
  assert.doesNotMatch(JSON.stringify(exported), /__open_ena_/u);
});
```

- [ ] **Step 2: Run bound-consumer tests**

Run: `node --import tsx --test tests/open-ena-model-v3-bound-consumers.test.ts`
Expected: FAIL because the v3 consumers are absent.

- [ ] **Step 3: Build AI payloads from bound results**

Include exact canonical configuration, warnings, capability blocks, ordering
summary, rotation fit/reference distinction, and stale status. Refuse current
interpretation when result/plan hashes do not match. Preserve existing ONA
descriptive-only AI boundary.

```ts
export function buildAiInterpretationPayloadV3(
  result: BoundOpenEnaResultV3,
  plan: OpenEnaExecutionPlanV3,
) {
  assertCurrentCapabilityV3(result, plan, "ai-interpretation");
  return {
    configurationSha256: result.binding.configurationSha256,
    executionPlanSha256: result.binding.executionPlanSha256,
    configuration: result.configuration,
    ordering: result.executionProvenance.horizonOrdering,
    projection: result.executionProvenance.projection,
    warnings: result.diagnostics.warnings,
    capabilityStatus: result.capabilityStatus,
  };
}
```

- [ ] **Step 4: Update sets and Data View**

Analysis sets capture only compatible bound results. Data View restores typed
Unit/Horizon fields through execution dictionaries and exports source indices
and trajectory ordinals without internal tokens.

```ts
export function buildDataViewRowsV3(result: BoundOpenEnaResultV3) {
  const dictionaries = executionDictionariesV3(result.executionProvenance);
  return result.set.points.map((row) => restoreExecutionLabelsV3(row, dictionaries));
}

export function captureAnalysisSetV3(result: BoundOpenEnaResultV3) {
  assertNoInternalTokensV3(result);
  return cloneBoundResultForSetV3(result);
}
```

- [ ] **Step 5: Add presentation artifact binding**

Build presentation artifacts with hidden Codes/Groups, colors, layer options,
node overrides, dimensions, and camera plus the exact result hash. Apply only
when the hash matches; otherwise retain as an unapplied preset.

```ts
export function applyPresentationV3(
  resultHash: string,
  artifact: PresentationArtifactV3,
) {
  return artifact.boundResultSha256 === resultHash
    ? { status: "applied" as const, presentation: structuredClone(artifact) }
    : { status: "unapplied-preset" as const, presentation: structuredClone(artifact) };
}
```

- [ ] **Step 6: Run affected consumers and Plan 3 gate**

Run:

```bash
node --import tsx --test tests/open-ena-model-v3-bound-consumers.test.ts
node --import tsx --test tests/open-ena-ai-interpretation-payload.test.ts tests/open-ena-sets.test.ts tests/open-ena-data-view-export.test.ts
npm run typecheck:app
npm run test:app
```

Expected: PASS.

- [ ] **Step 7: Commit bound consumers**

```bash
git add lib/open-ena/ai-interpretation.ts lib/open-ena/sets.ts lib/open-ena/data-view-export.ts lib/open-ena/export.ts tests/open-ena-model-v3-bound-consumers.test.ts
git commit -m "refactor: consume bound Open ENA results"
```

## Plan 3 completion checkpoint

- New writes are v3 and component-hashed.
- Invalid drafts and stale results have distinct non-executable artifacts.
- Legacy artifacts remain dual-read with explicit review.
- Methods read only bound provenance.
- Inference, contrasts, longitudinal, AI, sets, and Data View reject stale or
  blocked contexts.
- Internal tokens never enter user-facing artifacts.
- Existing app tests and typecheck pass.
