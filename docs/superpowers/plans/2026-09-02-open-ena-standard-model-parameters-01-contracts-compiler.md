# Open ENA Model V3 Contracts and Compiler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the fail-closed v3 Draft, diagnostic, canonical-configuration, ordering, identity, resource, migration, and compiler contracts without changing the current Models UI or numerical runtime.

**Architecture:** Add a focused `lib/open-ena/model-v3` domain layer. Drafts are permissive; strict decoders and staged diagnostics are runtime-safe; only an error-free compiler result contains a canonical Standard/ONA configuration and deterministic plan preview.

**Tech Stack:** TypeScript, Node test runner, Web Crypto, existing ParsedDataset/Row types, existing ONA mask types.

---

### Task 0: Freeze the pre-cutover repository and ONA baseline

**Files:**
- Create: `tests/fixtures/open-ena/model-v3/baseline-manifest.json`
- Create: `tests/open-ena-model-v3-baseline.test.ts`

- [ ] **Step 1: Record the read-only baseline identifiers**

Run:

```bash
git rev-parse HEAD
git status --short --branch
node --version
npm --version
Rscript --vanilla -e 'cat(R.version.string, "\n"); cat(as.character(utils::packageVersion("rENA")), "\n")'
```

Expected: exact current values. Record the observed values; do not force the
environment to match an earlier note.

- [ ] **Step 2: Write the failing baseline-manifest test**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the pre-cutover manifest binds immutable ONA and rENA fixtures", () => {
  const manifest = JSON.parse(readFileSync(
    "tests/fixtures/open-ena/model-v3/baseline-manifest.json",
    "utf8",
  ));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.rEnaBaseline.version, "0.3.1");
  assert.match(manifest.rEnaBaseline.fixtureSha256, /^[a-f0-9]{64}$/u);
  assert.match(manifest.ona.publicFixtureSha256, /^[a-f0-9]{64}$/u);
  assert.match(manifest.preCutoverHead, /^[a-f0-9]{40}$/u);
});
```

- [ ] **Step 3: Run the baseline test**

Run: `node --import tsx --test tests/open-ena-model-v3-baseline.test.ts`
Expected: FAIL because the manifest is absent.

- [ ] **Step 4: Create the exact manifest from observed hashes**

Run `shasum -a 256` on
`packages/jena-js/fixtures/goldens/sena-configs.generated.json` and the chosen
public ONA fixture/receipt. Write an exact-key JSON object containing the
observed 40-character HEAD, paths, hashes, rENA/jENA versions, and timestamp.
Do not include private fixture bytes or credentials.

```json
{
  "schemaVersion": 1,
  "preCutoverHead": "3e8cf8c18f0784325b0c2953c949354423313b09",
  "rEnaBaseline": {
    "version": "0.3.1",
    "fixturePath": "packages/jena-js/fixtures/goldens/sena-configs.generated.json",
    "fixtureSha256": "a13517172cc8c87d79278649363aec3aac79ee624d0b22ce3c724650c6204192"
  },
  "ona": {
    "publicFixturePath": "packages/jena-js/fixtures/goldens/ordered-window-tma.generated.json",
    "publicFixtureSha256": "0f295ed72eb360e3792d441c5e034c858ed3c65ddbbc7e868a0abdcec6f70a0e"
  },
  "recordedAt": "2026-09-02T16:06:05Z"
}
```

Before applying the patch, rerun the hash commands. If a tracked fixture changed
without an approved scientific change, stop instead of updating these frozen
values.

- [ ] **Step 5: Run baseline and public ONA checks**

Run:

```bash
node --import tsx --test tests/open-ena-model-v3-baseline.test.ts
node --import tsx --test tests/open-ena-ona-analysis-plan.test.ts tests/open-ena-ona-worker.test.ts tests/open-ena-ona-bundle.test.ts tests/open-ena-ona-descriptive.test.ts tests/open-ena-ona-3d.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the baseline before any business-code change**

```bash
git add tests/fixtures/open-ena/model-v3/baseline-manifest.json tests/open-ena-model-v3-baseline.test.ts
git commit -m "test: freeze Open ENA model baselines"
```

### Task 1: Define the v3 type vocabulary

**Files:**
- Create: `lib/open-ena/model-v3/types.ts`
- Test: `tests/open-ena-model-v3-types.test.ts`

- [ ] **Step 1: Write the failing public-vocabulary test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  OPEN_ENA_RUNTIME_POLICY_VERSION_V3,
  OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3,
  STANDARD_MODEL_TYPES,
  STANDARD_ROTATION_TYPES,
  STANDARD_WINDOW_TYPES,
  type CanonicalStandardAnalysisV3,
} from "../lib/open-ena/model-v3/types";

test("v3 exposes only the approved Standard model, window, and rotation vocabulary", () => {
  assert.deepEqual(STANDARD_MODEL_TYPES, [
    "EndPoint",
    "SeparateTrajectory",
    "AccumulatedTrajectory",
  ]);
  assert.deepEqual(STANDARD_WINDOW_TYPES, [
    "MovingStanzaWindow",
    "Conversation",
  ]);
  assert.deepEqual(STANDARD_ROTATION_TYPES, ["svd", "means", "reference"]);
  assert.equal(OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3, "open-ena-validation-v3.1");
  assert.equal(OPEN_ENA_RUNTIME_POLICY_VERSION_V3, "open-ena-runtime-policy-v3.1");
  assert.equal(STANDARD_ROTATION_TYPES.includes("spherical" as never), false);
  const trajectory: CanonicalStandardAnalysisV3 = {
    model: {
      type: "SeparateTrajectory",
      horizonOrder: {
        kind: "source-order-confirmed",
        confirmation: {
          kind: "explicit-researcher-confirmation",
          datasetSha256: "a".repeat(64),
          rowCount: 2,
          relevantColumns: ["horizon"],
          confirmedAt: "2026-09-02T00:00:00.000Z",
          confirmationVersion: 1,
        },
      },
    },
    rotation: { type: "svd", centerAlignToOrigin: true },
  };
  assert.equal(trajectory.model.type, "SeparateTrajectory");
});
```

- [ ] **Step 2: Run the test and confirm the module is absent**

Run: `node --import tsx --test tests/open-ena-model-v3-types.test.ts`
Expected: FAIL with `Cannot find module '../lib/open-ena/model-v3/types'`.

- [ ] **Step 3: Add the approved discriminated types and constants**

```ts
import type { DatasetHashKind, OpenEnaDirectionalMask } from "../types";

export const STANDARD_MODEL_TYPES = [
  "EndPoint",
  "SeparateTrajectory",
  "AccumulatedTrajectory",
] as const;
export const STANDARD_WINDOW_TYPES = [
  "MovingStanzaWindow",
  "Conversation",
] as const;
export const STANDARD_ROTATION_TYPES = ["svd", "means", "reference"] as const;
export const OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3 = "open-ena-validation-v3.1" as const;
export const OPEN_ENA_RUNTIME_POLICY_VERSION_V3 = "open-ena-runtime-policy-v3.1" as const;
export const OPEN_ENA_EXECUTION_CONTRACT_VERSION_V3 = "open-ena-execution-v3.1" as const;

export type StandardModelTypeV3 = typeof STANDARD_MODEL_TYPES[number];
export type StandardWindowTypeV3 = typeof STANDARD_WINDOW_TYPES[number];
export type StandardRotationTypeV3 = typeof STANDARD_ROTATION_TYPES[number];
export type AnalysisFamilyV3 = "standard" | "ona";

export type ScalarIdentityV3 =
  | { type: "string"; value: string }
  | { type: "number"; value: number }
  | { type: "boolean"; value: boolean };

export interface DatasetBoundConfirmationV3 {
  kind: "explicit-researcher-confirmation";
  datasetSha256: string;
  rowCount: number;
  relevantColumns: string[];
  confirmedAt: string;
  confirmationVersion: 1;
}

export type OrderComparatorV3 =
  | { type: "number" }
  | { type: "date"; format: "YYYY-MM-DD" }
  | { type: "datetime"; format: "ISO-8601"; timeZone: "offset-in-value" }
  | { type: "ordered-category"; levels: ScalarIdentityV3[] }
  | {
      type: "text";
      locale: string;
      sensitivity: "base" | "accent" | "case" | "variant";
      numeric: boolean;
    };

export interface OrderKeyV3 {
  column: string;
  direction: "ascending" | "descending";
  comparator: OrderComparatorV3;
}

export type CanonicalRowOrderV3 =
  | { kind: "columns"; keys: [OrderKeyV3, ...OrderKeyV3[]] }
  | {
      kind: "source-order-confirmed";
      confirmation: DatasetBoundConfirmationV3;
    };
export type CanonicalHorizonOrderV3 = CanonicalRowOrderV3;

export type BackwardExtentV3 =
  | { kind: "finite"; value: number }
  | { kind: "infinity" };
export type ForwardExtentV3 = BackwardExtentV3;

export type StandardWindowV3 =
  | {
      type: "MovingStanzaWindow";
      backward: BackwardExtentV3;
      forward: ForwardExtentV3;
      rowOrder: CanonicalRowOrderV3;
    }
  | { type: "Conversation" };

export type EndpointRotationV3 =
  | { type: "svd"; centerAlignToOrigin: boolean }
  | {
      type: "means";
      centerAlignToOrigin: boolean;
      contrast: {
        groupColumn: string;
        negativeLevel: ScalarIdentityV3;
        positiveLevel: ScalarIdentityV3;
      };
    }
  | {
      type: "reference";
      referenceId: string;
      expectedContentSha256: string;
    };

export type TrajectoryRotationV3 =
  | { type: "svd"; centerAlignToOrigin: boolean }
  | {
      type: "reference";
      referenceId: string;
      expectedContentSha256: string;
    };

export type CanonicalStandardAnalysisV3 =
  | { model: { type: "EndPoint" }; rotation: EndpointRotationV3 }
  | {
      model: {
        type: "SeparateTrajectory";
        horizonOrder: CanonicalHorizonOrderV3;
      };
      rotation: TrajectoryRotationV3;
    }
  | {
      model: {
        type: "AccumulatedTrajectory";
        horizonOrder: CanonicalHorizonOrderV3;
      };
      rotation: TrajectoryRotationV3;
    };

export interface CanonicalCodeV3 {
  column: string;
  displayLabel: string;
}

export interface CanonicalModelContractsV3 {
  validationContractVersion: typeof OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3;
  runtimePolicyVersion: typeof OPEN_ENA_RUNTIME_POLICY_VERSION_V3;
}

export interface CanonicalStandardConfigV3 {
  schemaVersion: 3;
  analysisFamily: "standard";
  contracts: CanonicalModelContractsV3;
  units: {
    columns: [string, ...string[]];
    group:
      | { type: "none" }
      | { type: "stable-metadata"; column: string };
  };
  horizons: { columns: [string, ...string[]] };
  codes: [CanonicalCodeV3, CanonicalCodeV3, CanonicalCodeV3, ...CanonicalCodeV3[]];
  weighting: { type: "binary" } | { type: "frequency" };
  window: StandardWindowV3;
  analysis: CanonicalStandardAnalysisV3;
}

export interface CanonicalOnaConfigV3 {
  schemaVersion: 3;
  analysisFamily: "ona";
  contracts: CanonicalModelContractsV3;
  units: CanonicalStandardConfigV3["units"];
  horizons: CanonicalStandardConfigV3["horizons"];
  codes: CanonicalStandardConfigV3["codes"];
  model: { type: "EndPoint" };
  weighting: { type: "frequency"; engineMethod: "sum" };
  window: {
    type: "MovingStanzaWindow";
    backward: BackwardExtentV3;
    forward: 0;
    rowOrder: CanonicalRowOrderV3;
  };
  rotation: { type: "svd"; centerAlignToOrigin: true };
  directionalMask: OpenEnaDirectionalMask;
}

export interface StandardEnaDraftV3 {
  unitColumns: string[];
  horizonColumns: string[];
  groupColumn: string | null;
  codes: string[];
  weighting: "binary" | "frequency";
  model: StandardModelTypeV3;
  windowType: StandardWindowTypeV3;
  movingStanza: {
    backward: BackwardExtentV3;
    forward: ForwardExtentV3;
    rowOrder: CanonicalRowOrderV3 | null;
  };
  horizonOrder: CanonicalHorizonOrderV3 | null;
  rotation:
    | { type: "svd"; centerAlignToOrigin: boolean }
    | {
        type: "means";
        centerAlignToOrigin: boolean;
        negativeLevel: ScalarIdentityV3 | null;
        positiveLevel: ScalarIdentityV3 | null;
      }
    | {
        type: "reference";
        referenceId: string | null;
        expectedContentSha256: string | null;
      };
}

export interface OrderedNetworkDraftV3 {
  unitColumns: string[];
  horizonColumns: string[];
  groupColumn: string | null;
  codes: string[];
  backward: BackwardExtentV3;
  rowOrder: CanonicalRowOrderV3 | null;
  directionalMask: OpenEnaDirectionalMask | null;
}

export interface ModelWorkspaceDraftsV3 {
  schemaVersion: 3;
  activeFamily: AnalysisFamilyV3;
  standard: StandardEnaDraftV3;
  ona: OrderedNetworkDraftV3;
}

export interface DatasetBindingV3 {
  hashKind: DatasetHashKind;
  normalizedTableSha256: string;
  rowCount: number;
  headerSha256: string;
}
```

- [ ] **Step 4: Run the vocabulary test**

Run: `node --import tsx --test tests/open-ena-model-v3-types.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit the type vocabulary**

```bash
git add lib/open-ena/model-v3/types.ts tests/open-ena-model-v3-types.test.ts
git commit -m "feat: define Open ENA model v3 contracts"
```

### Task 2: Add canonical JSON, hashes, and strict schema decoding

**Files:**
- Create: `lib/open-ena/model-v3/canonical-json.ts`
- Create: `lib/open-ena/model-v3/schema.ts`
- Test: `tests/open-ena-model-v3-schema.test.ts`

- [ ] **Step 1: Write failing canonicalization and decoder tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalJsonV3,
  sha256CanonicalJsonV3,
} from "../lib/open-ena/model-v3/canonical-json";
import {
  decodeCanonicalOnaConfigV3,
  decodeCanonicalStandardConfigV3,
} from "../lib/open-ena/model-v3/schema";

test("canonical JSON is key-order independent and hashes identically", async () => {
  const left = { b: 2, a: { y: true, x: "v" } };
  const right = { a: { x: "v", y: true }, b: 2 };
  assert.equal(canonicalJsonV3(left), canonicalJsonV3(right));
  assert.equal(
    await sha256CanonicalJsonV3(left),
    await sha256CanonicalJsonV3(right),
  );
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.throws(() => canonicalJsonV3(cyclic), /cyclic/i);
  assert.throws(() => canonicalJsonV3(new Date(0)), /plain objects/i);
});

test("v3 rejects direct Means rotation for a trajectory", () => {
  assert.throws(() => decodeCanonicalStandardConfigV3({
    schemaVersion: 3,
    analysisFamily: "standard",
    contracts: {
      validationContractVersion: "open-ena-validation-v3.1",
      runtimePolicyVersion: "open-ena-runtime-policy-v3.1",
    },
    units: { columns: ["unit"], group: { type: "none" } },
    horizons: { columns: ["horizon"] },
    codes: ["A", "B", "C"].map((column) => ({ column, displayLabel: column })),
    weighting: { type: "binary" },
    window: { type: "Conversation" },
    analysis: {
      model: {
        type: "SeparateTrajectory",
        horizonOrder: {
          kind: "source-order-confirmed",
          confirmation: {
            kind: "explicit-researcher-confirmation",
            datasetSha256: "a".repeat(64),
            rowCount: 3,
            relevantColumns: ["horizon"],
            confirmedAt: "2026-09-02T00:00:00.000Z",
            confirmationVersion: 1,
          },
        },
      },
      rotation: {
        type: "means",
        centerAlignToOrigin: true,
        contrast: {
          groupColumn: "group",
          negativeLevel: { type: "string", value: "A" },
          positiveLevel: { type: "string", value: "B" },
        },
      },
    },
  }), /trajectory.*Means|Means.*trajectory/i);
});

test("v3 decoders reject unknown, inactive, coercible, and non-finite content", () => {
  for (const invalid of [
    withNestedExtra(validStandardConfig, "window", "legacyExtent", 7),
    withValue(validStandardConfig, "window.backward", Number.POSITIVE_INFINITY),
    withValue(validStandardConfig, "window.forward.value", "2"),
    withValue(validStandardConfig, "analysis.rotation.centerAlignToOrigin", "true"),
    withValue(validStandardConfig, "analysis.rotation.type", "varimax"),
    withValue(validStandardConfig, "contracts.validationContractVersion", "unknown"),
  ]) {
    assert.throws(() => decodeCanonicalStandardConfigV3(invalid));
  }
  assert.throws(() => decodeCanonicalOnaConfigV3({
    ...validOnaConfig,
    window: { ...validOnaConfig.window, forward: 1 },
  }), /forward/i);
});
```

- [ ] **Step 2: Run the schema test**

Run: `node --import tsx --test tests/open-ena-model-v3-schema.test.ts`
Expected: FAIL because both modules are absent.

- [ ] **Step 3: Implement canonical JSON and browser-safe SHA-256**

```ts
function encodeCanonicalJsonV3(value: unknown, ancestors: Set<object>): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON rejects non-finite numbers.");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new Error("Canonical JSON rejects cyclic values.");
    ancestors.add(value);
    try {
      return `[${value.map((item) => encodeCanonicalJsonV3(item, ancestors)).join(",")}]`;
    } finally {
      ancestors.delete(value);
    }
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("Canonical JSON accepts only arrays and plain objects.");
    }
    if (ancestors.has(value)) throw new Error("Canonical JSON rejects cyclic values.");
    ancestors.add(value);
    const record = value as Record<string, unknown>;
    try {
      const body = Object.keys(record).sort().map(
        (key) => `${JSON.stringify(key)}:${encodeCanonicalJsonV3(record[key], ancestors)}`,
      );
      return `{${body.join(",")}}`;
    } finally {
      ancestors.delete(value);
    }
  }
  throw new Error("Canonical JSON accepts only JSON values.");
}

export function canonicalJsonV3(value: unknown): string {
  return encodeCanonicalJsonV3(value, new Set());
}

export function deepFreezeV3<T>(value: T, seen = new WeakSet<object>()): T {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreezeV3(child, seen);
  }
  return Object.freeze(value);
}

export async function sha256TextV3(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function sha256CanonicalJsonV3(value: unknown): Promise<string> {
  return sha256TextV3(canonicalJsonV3(value));
}
```

- [ ] **Step 4: Implement the strict decoder slice**

```ts
import type {
  CanonicalOnaConfigV3,
  CanonicalStandardAnalysisV3,
  CanonicalStandardConfigV3,
} from "./types";

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} must contain exactly: ${expected.join(", ")}.`);
  }
}

function decodeAnalysis(value: unknown): CanonicalStandardAnalysisV3 {
  const input = record(value, "Standard analysis");
  exactKeys(input, ["model", "rotation"], "Standard analysis");
  const model = decodeStandardModelV3(input.model);
  const rotation = decodeStandardRotationV3(input.rotation);
  if (model.type === "EndPoint") return { model, rotation };
  if (rotation.type === "means") {
    throw new Error("A Standard trajectory cannot use direct Means rotation.");
  }
  return { model, rotation };
}

export function decodeCanonicalStandardConfigV3(
  value: unknown,
): CanonicalStandardConfigV3 {
  const input = record(value, "Standard configuration");
  exactKeys(input, [
    "schemaVersion",
    "analysisFamily",
    "contracts",
    "units",
    "horizons",
    "codes",
    "weighting",
    "window",
    "analysis",
  ], "Standard configuration");
  if (input.schemaVersion !== 3 || input.analysisFamily !== "standard") {
    throw new Error("Expected a schema-v3 Standard ENA configuration.");
  }
  return {
    schemaVersion: 3,
    analysisFamily: "standard",
    contracts: decodeModelContractsV3(input.contracts),
    units: decodeUnitsV3(input.units),
    horizons: decodeHorizonsV3(input.horizons),
    codes: decodeCodesV3(input.codes),
    weighting: decodeStandardWeightingV3(input.weighting),
    window: decodeStandardWindowV3(input.window),
    analysis: decodeAnalysis(input.analysis),
  };
}

export function decodeCanonicalOnaConfigV3(value: unknown): CanonicalOnaConfigV3 {
  const input = record(value, "ONA configuration");
  exactKeys(input, [
    "schemaVersion", "analysisFamily", "contracts", "units", "horizons",
    "codes", "model", "weighting", "window", "rotation", "directionalMask",
  ], "ONA configuration");
  return decodeExactOnaBranchesV3(input);
}
```

Implement every helper above as an exact-key decoder, not as an assertion or
cast. The branch contracts are: non-empty distinct string arrays for Unit and
Horizon columns; `none` or exact `stable-metadata` Group; at least three Code
objects with exact `column`/`displayLabel` strings and distinct columns;
Binary/Frequency Standard weighting; explicit finite-integer or `infinity`
extent sentinels; Conversation with no inactive fields; exact order-policy,
confirmation, comparator, Model, and Rotation branches; and literal contract
versions. The ONA decoder must accept only EndPoint, frequency/sum, Moving
Stanza, forward `0`, SVD/centered, canonical mask entries, and no Standard-only
keys. Add one rejection test for every branch's missing key, extra key, wrong
scalar type, unknown discriminator, and inactive field. No decoded return path
may contain `as unknown as CanonicalStandardConfigV3` or
`as unknown as CanonicalOnaConfigV3`.

- [ ] **Step 5: Run the focused tests and typecheck**

Run: `node --import tsx --test tests/open-ena-model-v3-schema.test.ts && npm run typecheck:app`
Expected: PASS.

- [ ] **Step 6: Commit schema and hash foundations**

```bash
git add lib/open-ena/model-v3/canonical-json.ts lib/open-ena/model-v3/schema.ts tests/open-ena-model-v3-schema.test.ts
git commit -m "feat: add strict model v3 serialization"
```

### Task 3: Build typed identities and internal dictionaries

**Files:**
- Create: `lib/open-ena/model-v3/identity.ts`
- Test: `tests/open-ena-model-v3-identity.test.ts`

- [ ] **Step 1: Write failing collision tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCompositeIdentityV3,
  buildExecutionIdentityDictionaryV3,
} from "../lib/open-ena/model-v3/identity";

test("typed tuples do not collide through delimiters or scalar display", async () => {
  const first = await buildCompositeIdentityV3(
    { left: "A::B", right: "C" },
    ["left", "right"],
  );
  const second = await buildCompositeIdentityV3(
    { left: "A", right: "B::C" },
    ["left", "right"],
  );
  const numeric = await buildCompositeIdentityV3({ id: 1 }, ["id"]);
  const textual = await buildCompositeIdentityV3({ id: "1" }, ["id"]);
  assert.notEqual(first.sha256, second.sha256);
  assert.notEqual(numeric.sha256, textual.sha256);
});

test("execution tokens remain unique when source headers mimic reserved names", async () => {
  const dictionary = await buildExecutionIdentityDictionaryV3(
    [
      { unit: "__open_ena_unit_v3_000000", horizon: "h1" },
      { unit: "u2", horizon: "h1" },
    ],
    ["unit"],
    ["horizon"],
    null,
  );
  assert.equal(new Set(dictionary.units.map((entry) => entry.token)).size, 2);
  assert.equal(dictionary.units.some((entry) => entry.token === entry.displayLabel), false);
});
```

- [ ] **Step 2: Run the identity test**

Run: `node --import tsx --test --test-concurrency=1 tests/open-ena-model-v3-identity.test.ts`
Expected: FAIL because `identity.ts` is absent.

- [ ] **Step 3: Implement typed identities and dictionaries**

```ts
import type { Row } from "jena-js";
import { canonicalJsonV3, sha256TextV3 } from "./canonical-json";
import type { ScalarIdentityV3 } from "./types";

function scalarIdentity(value: Row[string], label: string): ScalarIdentityV3 {
  if (value === null || value === undefined || value === "") {
    throw new Error(`${label} contains a missing identity value.`);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
    return { type: "number", value: Object.is(value, -0) ? 0 : value };
  }
  if (typeof value === "string") return { type: "string", value };
  if (typeof value === "boolean") return { type: "boolean", value };
  throw new Error(`${label} has an unsupported identity type.`);
}

export async function buildCompositeIdentityV3(
  row: Row,
  columns: string[],
) {
  const fields = columns.map((column) => ({
    column,
    value: scalarIdentity(row[column], column),
  }));
  const canonicalJson = canonicalJsonV3(fields);
  return {
    fields,
    canonicalJson,
    sha256: await sha256TextV3(canonicalJson),
  };
}

function token(prefix: "unit" | "horizon" | "group", index: number) {
  return `__open_ena_${prefix}_v3_${String(index).padStart(6, "0")}`;
}

export async function buildExecutionIdentityDictionaryV3(
  rows: Row[],
  unitColumns: string[],
  horizonColumns: string[],
  groupColumn: string | null,
) {
  const unitByHash = new Map<string, Awaited<ReturnType<typeof buildCompositeIdentityV3>>>();
  const horizonByHash = new Map<string, Awaited<ReturnType<typeof buildCompositeIdentityV3>>>();
  const groupByHash = new Map<string, Awaited<ReturnType<typeof buildCompositeIdentityV3>>>();
  const insert = (
    dictionary: typeof unitByHash,
    identity: Awaited<ReturnType<typeof buildCompositeIdentityV3>>,
  ) => {
    const existing = dictionary.get(identity.sha256);
    if (existing && existing.canonicalJson !== identity.canonicalJson) {
      throw new Error("Identity SHA-256 collision detected.");
    }
    dictionary.set(identity.sha256, identity);
  };
  for (const row of rows) {
    const unit = await buildCompositeIdentityV3(row, unitColumns);
    const horizon = await buildCompositeIdentityV3(row, horizonColumns);
    insert(unitByHash, unit);
    insert(horizonByHash, horizon);
    if (groupColumn) {
      const group = await buildCompositeIdentityV3(row, [groupColumn]);
      insert(groupByHash, group);
    }
  }
  const units = [...unitByHash.values()].sort((a, b) => a.sha256.localeCompare(b.sha256))
    .map((identity, index) => ({
      token: token("unit", index),
      identity,
      displayLabel: identity.fields.map((field) => String(field.value.value)).join(" · "),
    }));
  const horizons = [...horizonByHash.values()].sort((a, b) => a.sha256.localeCompare(b.sha256))
    .map((identity, index) => ({
      token: token("horizon", index),
      identity,
      displayLabel: identity.fields.map((field) => String(field.value.value)).join(" · "),
    }));
  const groups = [...groupByHash.values()].sort((a, b) => a.sha256.localeCompare(b.sha256))
    .map((identity, index) => ({
      token: token("group", index),
      identity,
      displayLabel: identity.fields.map((field) => String(field.value.value)).join(" · "),
    }));
  return { units, horizons, groups };
}
```

Add a Group test proving number `1` and string `"1"` remain distinct and that
each execution row's optional Group token resolves through the returned Group
dictionary. No user-facing export may expose the internal tokens.

- [ ] **Step 4: Run identity tests**

Run: `node --import tsx --test tests/open-ena-model-v3-identity.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit identity safety**

```bash
git add lib/open-ena/model-v3/identity.ts tests/open-ena-model-v3-identity.test.ts
git commit -m "feat: add typed ENA model identities"
```

### Task 4: Resolve explicit row and Horizon ordering

**Files:**
- Create: `lib/open-ena/model-v3/ordering.ts`
- Test: `tests/open-ena-model-v3-ordering.test.ts`

- [ ] **Step 1: Write failing row-order boundary and tie tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { resolveRowOrderV3 } from "../lib/open-ena/model-v3/ordering";

const rows = [
  { unit: "u1", horizon: "h1", turn: 2 },
  { unit: "u2", horizon: "h2", turn: 1 },
  { unit: "u1", horizon: "h1", turn: 1 },
  { unit: "u2", horizon: "h2", turn: 2 },
];

test("row ordering sorts only inside each Horizon and retains source indices", () => {
  const resolved = resolveRowOrderV3(rows, ["horizon"], {
    kind: "columns",
    keys: [{
      column: "turn",
      direction: "ascending",
      comparator: { type: "number" },
    }],
  });
  assert.deepEqual(resolved.orderedSourceRowIndices, [2, 0, 1, 3]);
  assert.deepEqual(
    resolved.mappings.map((entry) => [entry.sourceRowIndex, entry.withinHorizonOrdinal]),
    [[2, 0], [0, 1], [1, 0], [3, 1]],
  );
});

test("unresolved ties fail instead of using the source row index", () => {
  assert.throws(() => resolveRowOrderV3(
    [{ horizon: "h1", turn: 1 }, { horizon: "h1", turn: 1 }],
    ["horizon"],
    {
      kind: "columns",
      keys: [{
        column: "turn",
        direction: "ascending",
        comparator: { type: "number" },
      }],
    },
  ), /unresolved tie/i);
});
```

- [ ] **Step 2: Run the ordering test**

Run: `node --import tsx --test tests/open-ena-model-v3-ordering.test.ts`
Expected: FAIL because the resolver is absent.

- [ ] **Step 3: Implement comparator parsing and within-Horizon resolution**

```ts
import type { Row, Scalar } from "jena-js";
import { canonicalJsonV3 } from "./canonical-json";
import type { CanonicalRowOrderV3, OrderKeyV3 } from "./types";

function numeric(value: Scalar, column: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Order column “${column}” requires finite numbers.`);
  }
  return value;
}

function comparable(value: Scalar, key: OrderKeyV3): string | number {
  if (value === null || value === "") throw new Error(`Order column “${key.column}” has a missing value.`);
  if (key.comparator.type === "number") return numeric(value, key.column);
  if (key.comparator.type === "ordered-category") {
    const index = key.comparator.levels.findIndex(
      (level) => level.type === typeof value && level.value === value,
    );
    if (index < 0) throw new Error(`Order column “${key.column}” has an unknown category.`);
    return index;
  }
  if (key.comparator.type === "date") {
    return parseDateV3(value, key.comparator.format, key.column);
  }
  if (key.comparator.type === "datetime") {
    return parseDateTimeV3(
      value,
      key.comparator.format,
      key.comparator.timeZone,
      key.column,
    );
  }
  if (typeof value !== "string") throw new Error(`Order column “${key.column}” requires text.`);
  return value;
}

function compareTuples(
  left: Array<string | number>,
  right: Array<string | number>,
  keys: OrderKeyV3[],
) {
  for (let index = 0; index < keys.length; index += 1) {
    const direction = keys[index].direction === "ascending" ? 1 : -1;
    if (keys[index].comparator.type === "text") {
      const compare = textComparatorV3(keys[index]);
      const delta = compare(String(left[index]), String(right[index]));
      if (delta !== 0) return Math.sign(delta) * direction;
      continue;
    }
    if (left[index] < right[index]) return -1 * direction;
    if (left[index] > right[index]) return 1 * direction;
  }
  return 0;
}

export function resolveRowOrderV3(
  rows: Row[],
  horizonColumns: string[],
  policy: CanonicalRowOrderV3,
) {
  if (policy.kind !== "columns") {
    const groups = new Map<string, number[]>();
    rows.forEach((row, sourceRowIndex) => {
      const horizonKey = canonicalJsonV3(horizonColumns.map((column) => row[column]));
      const group = groups.get(horizonKey) ?? [];
      group.push(sourceRowIndex);
      groups.set(horizonKey, group);
    });
    const mappings = [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([horizonKey, sourceIndices]) => sourceIndices.map(
        (sourceRowIndex, withinHorizonOrdinal) => ({
          sourceRowIndex,
          horizonKey,
          orderTuple: [withinHorizonOrdinal],
          withinHorizonOrdinal,
        }),
      ));
    return {
      type: "within-horizon-order" as const,
      requestedPolicy: policy,
      mappings,
      orderedSourceRowIndices: mappings.map((entry) => entry.sourceRowIndex),
    };
  }
  const groups = new Map<string, Array<{ sourceRowIndex: number; tuple: Array<string | number> }>>();
  rows.forEach((row, sourceRowIndex) => {
    const horizonKey = canonicalJsonV3(horizonColumns.map((column) => row[column]));
    const group = groups.get(horizonKey) ?? [];
    group.push({
      sourceRowIndex,
      tuple: policy.keys.map((key) => comparable(row[key.column], key)),
    });
    groups.set(horizonKey, group);
  });
  const mappings: Array<{
    sourceRowIndex: number;
    horizonKey: string;
    orderTuple: Array<string | number>;
    withinHorizonOrdinal: number;
  }> = [];
  for (const [horizonKey, group] of groups) {
    group.sort((a, b) => compareTuples(a.tuple, b.tuple, policy.keys));
    group.forEach((entry, index) => {
      if (index > 0 && compareTuples(group[index - 1].tuple, entry.tuple, policy.keys) === 0) {
        throw new Error(`Within-Horizon row order has an unresolved tie in ${horizonKey}.`);
      }
      mappings.push({
        ...entry,
        horizonKey,
        orderTuple: entry.tuple,
        withinHorizonOrdinal: index,
      });
    });
  }
  mappings.sort((a, b) => {
    const horizonDelta = a.horizonKey.localeCompare(b.horizonKey);
    return horizonDelta || a.withinHorizonOrdinal - b.withinHorizonOrdinal;
  });
  return {
    type: "within-horizon-order" as const,
    requestedPolicy: policy,
    mappings,
    orderedSourceRowIndices: mappings.map((entry) => entry.sourceRowIndex),
  };
}
```

- [ ] **Step 4: Complete the explicit date, datetime, category, and text comparators**

```ts
function parseDateV3(value: Scalar, format: string, column: string) {
  if (typeof value !== "string") throw new Error(`Order column “${column}” requires a date string.`);
  if (format !== "YYYY-MM-DD" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error(`Order column “${column}” does not match YYYY-MM-DD.`);
  }
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new Error(`Order column “${column}” is not a valid calendar date.`);
  }
  return timestamp;
}

function parseDateTimeV3(value: Scalar, format: string, timeZone: string, column: string) {
  if (typeof value !== "string"
    || format !== "ISO-8601"
    || timeZone !== "offset-in-value"
    || !/(?:Z|[+-]\d{2}:\d{2})$/u.test(value)) {
    throw new Error(`Order column “${column}” requires ISO-8601 with an explicit offset.`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`Order column “${column}” is not a valid datetime.`);
  return timestamp;
}

function textComparatorV3(key: OrderKeyV3) {
  if (key.comparator.type !== "text") throw new Error("Expected a text comparator.");
  const collator = new Intl.Collator(key.comparator.locale, {
    sensitivity: key.comparator.sensitivity,
    numeric: key.comparator.numeric,
    usage: "sort",
  });
  return (left: string, right: string) => collator.compare(left, right);
}
```

Restrict the v3 decoder and UI to the implemented explicit date formats
`YYYY-MM-DD` and `ISO-8601`; datetime requires
`timeZone: "offset-in-value"`. Add invalid calendar date, missing offset,
unknown category, locale, case-sensitivity, and numeric-collation tests.

- [ ] **Step 5: Extend the same file with `resolveHorizonOrderV3` and concrete tests**

Add a test where two Units both use Week 1 legally, then add two distinct
Horizons for the same Unit with the same Week and assert
`STANDARD_HORIZON_ORDER_UNRESOLVED_TIE`. Implement
`resolveHorizonOrderV3(rows, unitColumns, horizonColumns, policy)` by first
requiring one stable tuple per Horizon, then sorting only each Unit's observed
Horizon set. Return `horizonTuples`, `unitSequences`, and a deterministic
implementation Horizon order.

```ts
export function resolveHorizonOrderV3(
  rows: Row[],
  unitColumns: string[],
  horizonColumns: string[],
  policy: CanonicalHorizonOrderV3,
) {
  const horizons = stableHorizonTuplesV3(rows, horizonColumns, policy);
  const byUnit = observedHorizonsByUnitV3(rows, unitColumns, horizonColumns);
  const unitSequences = [...byUnit.entries()].map(([unitKey, horizonKeys]) => {
    const steps = [...horizonKeys]
      .map((horizonKey) => horizons.get(horizonKey)!)
      .sort((left, right) => compareResolvedOrderTuplesV3(left.tuple, right.tuple, policy));
    steps.forEach((step, index) => {
      if (index > 0
        && compareResolvedOrderTuplesV3(steps[index - 1].tuple, step.tuple, policy) === 0) {
        throw new Error(`STANDARD_HORIZON_ORDER_UNRESOLVED_TIE:${unitKey}`);
      }
    });
    return {
      unitKey,
      steps: steps.map((step, trajectoryOrdinal) => ({
        horizonKey: step.horizonKey,
        trajectoryOrdinal,
      })),
    };
  });
  return {
    type: "trajectory-horizon-order" as const,
    horizonTuples: [...horizons.values()],
    unitSequences,
    implementationHorizonOrder: [...horizons.keys()].sort(),
  };
}
```

- [ ] **Step 6: Run ordering and type tests**

Run: `node --import tsx --test tests/open-ena-model-v3-ordering.test.ts tests/open-ena-model-v3-types.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit ordering**

```bash
git add lib/open-ena/model-v3/ordering.ts tests/open-ena-model-v3-ordering.test.ts
git commit -m "feat: resolve strict Standard ENA ordering"
```

### Task 5: Add stable diagnostics and Code-domain validation

**Files:**
- Create: `lib/open-ena/model-v3/diagnostics.ts`
- Test: `tests/open-ena-model-v3-diagnostics.test.ts`

- [ ] **Step 1: Write failing Code diagnostic tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { validateStandardDraftV3 } from "../lib/open-ena/model-v3/diagnostics";

const dataset = {
  name: "codes.csv",
  headers: ["unit", "horizon", "A", "B", "C", "D"],
  rows: [
    { unit: "u1", horizon: "h1", A: 1, B: 1, C: 0, D: 0 },
    { unit: "u2", horizon: "h2", A: 0, B: 0, C: 1, D: 0 },
  ],
  sizeBytes: 1,
  source: "upload" as const,
};

function datasetBindingForTest(input: typeof dataset) {
  return {
    hashKind: "normalized-utf8-csv-text-sha256" as const,
    normalizedTableSha256: "a".repeat(64),
    rowCount: input.rows.length,
    headerSha256: "b".repeat(64),
  };
}
const binding = datasetBindingForTest(dataset);

function draft(codes: string[]) {
  return {
    unitColumns: ["unit"],
    horizonColumns: ["horizon"],
    groupColumn: null,
    codes,
    weighting: "binary" as const,
    model: "EndPoint" as const,
    windowType: "Conversation" as const,
    movingStanza: {
      backward: { kind: "finite" as const, value: 1 },
      forward: { kind: "finite" as const, value: 0 },
      rowOrder: null,
    },
    horizonOrder: null,
    rotation: { type: "svd" as const, centerAlignToOrigin: true },
  };
}

test("Codes enforce minimum, all-zero error, and isolated warning", () => {
  const tooFew = validateStandardDraftV3(dataset, binding, draft(["A", "B"]));
  assert.equal(tooFew.some((d) => d.id === "STANDARD_CODES_TOO_FEW" && d.severity === "error"), true);
  const checked = validateStandardDraftV3(dataset, binding, draft(["A", "B", "C", "D"]));
  assert.equal(checked.some((d) => d.id === "STANDARD_CODE_ALL_ZERO" && d.fieldPath === "codes.D"), true);
  assert.equal(checked.some((d) => d.id === "STANDARD_CODE_ISOLATED" && d.fieldPath === "codes.C"), true);
});
```

- [ ] **Step 2: Run the diagnostic test**

Run: `node --import tsx --test tests/open-ena-model-v3-diagnostics.test.ts`
Expected: FAIL because the validator is absent.

- [ ] **Step 3: Implement diagnostic types, factory, and Binary/Frequency checks**

```ts
import type { ParsedDataset } from "../types";
import type {
  CanonicalHorizonOrderV3,
  CanonicalRowOrderV3,
  DatasetBindingV3,
  StandardEnaDraftV3,
  StandardModelTypeV3,
} from "./types";

export type ModelCapabilityV3 =
  | "build-model"
  | "export-current-model"
  | "export-reference"
  | "group-inference"
  | "trajectory-inference"
  | "longitudinal-comparison"
  | "ai-interpretation";

export const MODEL_DIAGNOSTIC_IDS_V3 = [
  "STANDARD_DATASET_BINDING_INVALID",
  "STANDARD_UNITS_REQUIRED",
  "STANDARD_HORIZONS_REQUIRED",
  "STANDARD_IDENTITY_MISSING",
  "STANDARD_IDENTITY_VALUE_UNSUPPORTED",
  "STANDARD_CODES_TOO_FEW",
  "STANDARD_CODES_DUPLICATE_SELECTION",
  "STANDARD_CODE_FIELD_MISSING",
  "STANDARD_CODE_ROLE_COLLISION",
  "STANDARD_CODE_VALUE_INVALID",
  "STANDARD_CODE_ALL_ZERO",
  "STANDARD_CODE_ISOLATED",
  "STANDARD_CODE_DUPLICATE_PROFILE",
  "STANDARD_NO_GLOBAL_COOCCURRENCE",
  "STANDARD_GROUP_FIELD_MISSING",
  "STANDARD_GROUP_UNSTABLE_WITHIN_UNIT",
  "STANDARD_HORIZON_SHARED_BY_MULTIPLE_UNITS",
  "STANDARD_ROW_ORDER_REQUIRED",
  "STANDARD_ROW_ORDER_INVALID",
  "STANDARD_HORIZON_ORDER_REQUIRED",
  "STANDARD_HORIZON_ORDER_INVALID",
  "STANDARD_HORIZON_ORDER_UNRESOLVED_TIE",
  "STANDARD_SOURCE_ORDER_CONFIRMATION_STALE",
  "STANDARD_MEANS_REQUIRES_ENDPOINT",
  "STANDARD_MEANS_GROUP_REQUIRED",
  "STANDARD_MEANS_LEVEL_REQUIRED",
  "STANDARD_MEANS_LEVEL_EMPTY",
  "STANDARD_MEANS_IDENTICAL",
  "STANDARD_TRAJECTORY_HAS_NO_PATH",
  "STANDARD_TRAJECTORY_SINGLE_STEP_UNITS",
  "STANDARD_TARGET_RANK_ZERO",
  "STANDARD_SVD_ONE_DIMENSIONAL",
  "STANDARD_REFERENCE_MISSING",
  "STANDARD_REFERENCE_INCOMPATIBLE",
  "STANDARD_REFERENCE_TARGET_DEGENERATE",
  "STANDARD_OUTPUT_NONFINITE",
  "RESOURCE_BUDGET_EXCEEDED",
] as const;
export type ModelDiagnosticIdV3 = typeof MODEL_DIAGNOSTIC_IDS_V3[number];

export const MODEL_SUGGESTED_ACTION_IDS_V3 = [
  "exclude-code",
  "replace-row-order",
  "replace-horizon-order",
  "select-endpoint",
  "select-svd",
  "select-reference",
  "clear-group",
] as const;
export type ModelSuggestedActionIdV3 = typeof MODEL_SUGGESTED_ACTION_IDS_V3[number];

export interface ModelDiagnosticV3 {
  id: ModelDiagnosticIdV3;
  severity: "error" | "warning" | "information";
  scope: "dataset" | "units" | "horizons" | "windows" | "codes" | "rotation" | "reference" | "resources" | "migration";
  fieldPath?: string;
  summary: string;
  detail: string;
  blocks: ModelCapabilityV3[];
  evidence?: {
    totalCount: number;
    sampleLimit: 5;
    samples: Array<{ rowIndex?: number; identity?: string; detail: string }>;
    truncated: boolean;
  };
  suggestedActions?: ModelSuggestedActionV3[];
}

export type ModelDraftPatchV3 =
  | { type: "exclude-code"; code: string }
  | { type: "replace-row-order"; value: CanonicalRowOrderV3 }
  | { type: "replace-horizon-order"; value: CanonicalHorizonOrderV3 }
  | { type: "select-model"; value: StandardModelTypeV3 }
  | { type: "select-rotation"; value: "svd" | "reference" }
  | { type: "clear-group" };

export interface ModelSuggestedActionV3 {
  id: ModelSuggestedActionIdV3;
  label: string;
  confirmationText: string;
  confirmationRequired: true;
  patch: ModelDraftPatchV3;
}

function diagnostic(
  value: Omit<ModelDiagnosticV3, "blocks"> & { blocks?: ModelCapabilityV3[] },
): ModelDiagnosticV3 {
  return { ...value, blocks: value.blocks ?? [] };
}

function validBinary(value: unknown) {
  return value === 0 || value === 1 || value === false || value === true;
}

function validFrequency(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function validateStandardDraftV3(
  dataset: ParsedDataset,
  binding: DatasetBindingV3,
  draft: StandardEnaDraftV3,
): ModelDiagnosticV3[] {
  const output: ModelDiagnosticV3[] = [];
  output.push(...validateDatasetAndConfirmationsV3(dataset, binding, draft));
  if (draft.codes.length < 3) output.push(diagnostic({
    id: "STANDARD_CODES_TOO_FEW",
    severity: "error",
    scope: "codes",
    summary: "Select at least three Codes.",
    detail: "Standard ENA requires at least three selected Codes.",
    blocks: ["build-model"],
  }));
  for (const code of draft.codes) {
    if (!dataset.headers.includes(code)) {
      output.push(diagnostic({
        id: "STANDARD_CODE_FIELD_MISSING",
        severity: "error",
        scope: "codes",
        fieldPath: `codes.${code}`,
        summary: `Code “${code}” is missing.`,
        detail: "The selected Code is not present in the current dataset.",
        blocks: ["build-model"],
      }));
      continue;
    }
    const values = dataset.rows.map((row) => row[code]);
    const valid = draft.weighting === "binary" ? validBinary : validFrequency;
    const binaryRepresentationKinds = new Set(values.map((value) => typeof value));
    const mixedBinaryRepresentations = draft.weighting === "binary"
      && binaryRepresentationKinds.has("number")
      && binaryRepresentationKinds.has("boolean");
    if (mixedBinaryRepresentations || values.some((value) => !valid(value))) {
      output.push(diagnostic({
        id: "STANDARD_CODE_VALUE_INVALID",
        severity: "error",
        scope: "codes",
        fieldPath: `codes.${code}`,
        summary: `Code “${code}” is incompatible with ${draft.weighting} weighting.`,
        detail: "Values are not silently coerced.",
        blocks: ["build-model"],
      }));
      continue;
    }
    if (values.every((value) => Number(value) === 0)) {
      output.push(diagnostic({
        id: "STANDARD_CODE_ALL_ZERO",
        severity: "error",
        scope: "codes",
        fieldPath: `codes.${code}`,
        summary: `Code “${code}” is all zero.`,
        detail: "An all-zero Code cannot form a connection.",
        blocks: ["build-model"],
      }));
      continue;
    }
    const connectivity = codeConnectivityForDraftV3(dataset, draft);
    if (connectivity && connectivity.degreeByCode.get(code) === 0) output.push(diagnostic({
      id: "STANDARD_CODE_ISOLATED",
      severity: "warning",
      scope: "codes",
      fieldPath: `codes.${code}`,
      summary: `Code “${code}” is isolated.`,
      detail: "The Code is retained because isolation may be substantively meaningful.",
    }));
  }
  return output;
}
```

`codeConnectivityForDraftV3` must use the candidate scientific window, not
same-row coincidence: Conversation aggregates within each Horizon; Moving
Stanza uses the resolved within-Horizon order and exact finite/Infinity bounds.
It returns `null` when row-order or value-domain prerequisites are unresolved,
so a derivative isolation warning is suppressed rather than guessed. Detect
exact duplicate Code profiles from the validated typed source vectors. Emit
`STANDARD_NO_GLOBAL_COOCCURRENCE` as a blocking error only when the resolved
candidate network has no edge anywhere.

- [ ] **Step 4: Add table-driven tests for every approved Code value boundary**

In the same test file, add explicit cases for numeric and Boolean Binary,
mixed representation, strings, fractions, negatives, NaN, Infinity, missing,
valid Frequency decimals, duplicate profiles, role collisions, and global
no-co-occurrence. Assert exact diagnostic IDs, capability blocks, confirmation
requirements for scientific patches, `sampleLimit === 5`,
`samples.length <= sampleLimit`, accurate total counts, and truncation flags.

```ts
for (const value of [2, -1, 0.5, "1", "yes", null, Number.NaN, Number.POSITIVE_INFINITY]) {
  test(`Binary rejects ${String(value)}`, () => {
    const caseDataset = datasetWithCodeValue(value);
    const diagnostics = validateStandardDraftV3(
      caseDataset,
      datasetBindingForTest(caseDataset),
      draft(["A", "B", "C"]),
    );
    assert.equal(diagnostics.some((entry) => (
      entry.id === "STANDARD_CODE_VALUE_INVALID"
      && entry.blocks.includes("build-model")
    )), true);
  });
}
```

- [ ] **Step 5: Run diagnostic tests**

Run: `node --import tsx --test tests/open-ena-model-v3-diagnostics.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit diagnostic foundations**

```bash
git add lib/open-ena/model-v3/diagnostics.ts tests/open-ena-model-v3-diagnostics.test.ts
git commit -m "feat: validate Standard ENA code domains"
```

### Task 6: Complete staged Unit, Horizon, trajectory, and rotation diagnostics

**Files:**
- Modify: `lib/open-ena/model-v3/diagnostics.ts`
- Test: `tests/open-ena-model-v3-relations.test.ts`

- [ ] **Step 1: Write failing relation tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { validateStandardDraftV3 } from "../lib/open-ena/model-v3/diagnostics";
import type { ParsedDataset } from "../lib/open-ena/types";
import type { DatasetBindingV3, StandardEnaDraftV3 } from "../lib/open-ena/model-v3/types";

function datasetBindingForTest(dataset: ParsedDataset): DatasetBindingV3 {
  return {
    hashKind: "normalized-utf8-csv-text-sha256",
    normalizedTableSha256: "a".repeat(64),
    rowCount: dataset.rows.length,
    headerSha256: "b".repeat(64),
  };
}

const base: StandardEnaDraftV3 = {
  unitColumns: ["unit"],
  horizonColumns: ["horizon"],
  groupColumn: "group",
  codes: ["A", "B", "C"],
  weighting: "binary",
  model: "EndPoint",
  windowType: "Conversation",
  movingStanza: {
    backward: { kind: "finite", value: 1 },
    forward: { kind: "finite", value: 0 },
    rowOrder: null,
  },
  horizonOrder: null,
  rotation: { type: "svd", centerAlignToOrigin: true },
};

test("shared Horizons are information while unstable Unit groups are errors", () => {
  const dataset = {
    name: "relations.csv",
    headers: ["unit", "horizon", "group", "A", "B", "C"],
    rows: [
      { unit: "u1", horizon: "h1", group: "g1", A: 1, B: 1, C: 0 },
      { unit: "u2", horizon: "h1", group: "g2", A: 0, B: 1, C: 1 },
      { unit: "u1", horizon: "h2", group: "g2", A: 1, B: 0, C: 1 },
    ],
    sizeBytes: 1,
    source: "upload" as const,
  };
  const diagnostics = validateStandardDraftV3(dataset, datasetBindingForTest(dataset), base);
  assert.equal(diagnostics.some((d) => d.id === "STANDARD_HORIZON_SHARED_BY_MULTIPLE_UNITS" && d.severity === "information"), true);
  assert.equal(diagnostics.some((d) => d.id === "STANDARD_GROUP_UNSTABLE_WITHIN_UNIT" && d.blocks.includes("build-model")), true);
});

test("trajectory and Moving Stanza require independent orders", () => {
  const dataset = {
    name: "orders.csv",
    headers: ["unit", "horizon", "group", "A", "B", "C"],
    rows: [{ unit: "u1", horizon: "h1", group: "g1", A: 1, B: 1, C: 1 }],
    sizeBytes: 1,
    source: "upload" as const,
  };
  const diagnostics = validateStandardDraftV3(dataset, datasetBindingForTest(dataset), {
    ...base,
    model: "SeparateTrajectory",
    windowType: "MovingStanzaWindow",
  });
  assert.equal(diagnostics.some((d) => d.id === "STANDARD_ROW_ORDER_REQUIRED"), true);
  assert.equal(diagnostics.some((d) => d.id === "STANDARD_HORIZON_ORDER_REQUIRED"), true);
});
```

- [ ] **Step 2: Run relation tests**

Run: `node --import tsx --test tests/open-ena-model-v3-relations.test.ts`
Expected: FAIL because the staged validator does not yet emit these diagnostics.

- [ ] **Step 3: Add staged field/identity/relation/order/rotation validators**

Add pure functions in this exact order:

```ts
function validateFieldRoles(dataset: ParsedDataset, draft: StandardEnaDraftV3) {
  const structural = new Set([
    ...draft.unitColumns,
    ...draft.horizonColumns,
    ...(draft.groupColumn ? [draft.groupColumn] : []),
    ...(draft.movingStanza.rowOrder?.kind === "columns"
      ? draft.movingStanza.rowOrder.keys.map((key) => key.column)
      : []),
    ...(draft.horizonOrder?.kind === "columns"
      ? draft.horizonOrder.keys.map((key) => key.column)
      : []),
  ]);
  return draft.codes
    .filter((code) => structural.has(code))
    .map((code) => errorDiagnosticV3(
      "STANDARD_CODE_ROLE_COLLISION",
      "codes",
      `codes.${code}`,
      `Code “${code}” is also used as a structural field.`,
    ));
}

function validateDatasetAndConfirmationsV3(
  dataset: ParsedDataset,
  binding: DatasetBindingV3,
  draft: StandardEnaDraftV3,
) {
  const output = validateDatasetBindingV3(dataset, binding);
  for (const [fieldPath, policy, relevantColumns] of activeOrderPoliciesV3(draft)) {
    if (policy?.kind === "source-order-confirmed"
      && !confirmationMatchesV3(policy.confirmation, binding, relevantColumns)) {
      output.push(errorDiagnosticV3(
        "STANDARD_SOURCE_ORDER_CONFIRMATION_STALE",
        fieldPath.startsWith("horizonOrder") ? "horizons" : "windows",
        fieldPath,
        "Source-order confirmation does not match this dataset and active fields.",
      ));
    }
  }
  return output;
}

function validateUnitAndGroupRelations(dataset: ParsedDataset, draft: StandardEnaDraftV3) {
  const output = validateIdentityFieldsV3(dataset, draft.unitColumns, "units");
  if (!draft.groupColumn || output.some((entry) => entry.severity === "error")) return output;
  const groupByUnit = new Map<string, string>();
  for (const row of dataset.rows) {
    const unit = typedTupleKeyV3(row, draft.unitColumns);
    const group = typedScalarKeyV3(row[draft.groupColumn]);
    const previous = groupByUnit.get(unit);
    if (previous !== undefined && previous !== group) {
      output.push(errorDiagnosticV3(
        "STANDARD_GROUP_UNSTABLE_WITHIN_UNIT",
        "units",
        `group.${draft.groupColumn}`,
        "The Group value is not stable within each Unit.",
      ));
      break;
    }
    groupByUnit.set(unit, group);
  }
  return output;
}

function validateHorizonRelations(dataset: ParsedDataset, draft: StandardEnaDraftV3) {
  const output = validateIdentityFieldsV3(dataset, draft.horizonColumns, "horizons");
  const unitsByHorizon = unitsByHorizonV3(dataset.rows, draft.unitColumns, draft.horizonColumns);
  if ([...unitsByHorizon.values()].some((units) => units.size > 1)) {
    output.push(informationDiagnosticV3(
      "STANDARD_HORIZON_SHARED_BY_MULTIPLE_UNITS",
      "horizons",
      "At least one Horizon is shared by multiple Units.",
    ));
  }
  return output;
}

function validateRequiredOrders(_dataset: ParsedDataset, draft: StandardEnaDraftV3) {
  const output: ModelDiagnosticV3[] = [];
  if (draft.windowType === "MovingStanzaWindow" && !draft.movingStanza.rowOrder) {
    output.push(errorDiagnosticV3(
      "STANDARD_ROW_ORDER_REQUIRED",
      "windows",
      "movingStanza.rowOrder",
      "Moving Stanza requires an explicit row-order contract.",
    ));
  }
  if (draft.model !== "EndPoint" && !draft.horizonOrder) {
    output.push(errorDiagnosticV3(
      "STANDARD_HORIZON_ORDER_REQUIRED",
      "horizons",
      "horizonOrder",
      "Trajectory models require an explicit Horizon-order contract.",
    ));
  }
  return output;
}

function validateModelRotation(_dataset: ParsedDataset, draft: StandardEnaDraftV3) {
  return draft.model !== "EndPoint" && draft.rotation.type === "means"
    ? [errorDiagnosticV3(
        "STANDARD_MEANS_REQUIRES_ENDPOINT",
        "rotation",
        "rotation",
        "Direct Means rotation requires EndPoint.",
      )]
    : [];
}

function validateMeansContrast(dataset: ParsedDataset, draft: StandardEnaDraftV3) {
  if (draft.rotation.type !== "means") return [];
  return validateMeansLevelsAndNetworksV3(dataset, draft);
}

function validateTrajectoryShape(dataset: ParsedDataset, draft: StandardEnaDraftV3) {
  if (draft.model === "EndPoint") return [];
  const counts = horizonCountByUnitV3(dataset.rows, draft.unitColumns, draft.horizonColumns);
  if (![...counts.values()].some((count) => count >= 2)) {
    return [errorDiagnosticV3(
      "STANDARD_TRAJECTORY_HAS_NO_PATH",
      "horizons",
      "horizonOrder",
      "No Unit has at least two observed trajectory steps.",
    )];
  }
  return [...counts.values()].some((count) => count === 1)
    ? [warningDiagnosticV3(
        "STANDARD_TRAJECTORY_SINGLE_STEP_UNITS",
        "horizons",
        "Some Units have only one observed trajectory step.",
      )]
    : [];
}
```

Implement each with early prerequisite checks and stable IDs from the approved
spec. Update `validateStandardDraftV3` to concatenate stages while suppressing
dependent stages after missing fields or failed identities. Means must remain
selected and invalid when its Group/levels disappear; direct trajectory Means
must emit `STANDARD_MEANS_REQUIRES_ENDPOINT`.

- [ ] **Step 4: Add complete relation and combination cases**

Add concrete test rows for: missing Unit/Horizon values, Code role collisions,
Group stability, one Unit target SVD, one Unit Reference, shared Horizons,
trajectory no path, single-step Unit warning, stale confirmations, all six
Model/Window combinations, Means selected-level absence, empty/non-zero groups,
identical means, and one-Unit inference block.

```ts
const combinations = [
  ["EndPoint", "MovingStanzaWindow"],
  ["EndPoint", "Conversation"],
  ["SeparateTrajectory", "MovingStanzaWindow"],
  ["SeparateTrajectory", "Conversation"],
  ["AccumulatedTrajectory", "MovingStanzaWindow"],
  ["AccumulatedTrajectory", "Conversation"],
] as const;
for (const [model, windowType] of combinations) {
  test(`${model} + ${windowType} reaches combination validation`, () => {
    const diagnostics = validateStandardDraftV3(
      relationDataset,
      datasetBindingForTest(relationDataset),
      completeDraft({ model, windowType }),
    );
    assert.equal(diagnostics.some((entry) => entry.id === "STANDARD_MODEL_WINDOW_UNSUPPORTED"), false);
  });
}
```

- [ ] **Step 5: Run both diagnostic suites**

Run: `node --import tsx --test --test-concurrency=1 tests/open-ena-model-v3-diagnostics.test.ts tests/open-ena-model-v3-relations.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit staged diagnostics**

```bash
git add lib/open-ena/model-v3/diagnostics.ts tests/open-ena-model-v3-relations.test.ts
git commit -m "feat: add fail-closed ENA model diagnostics"
```

### Task 7: Add deterministic resource estimates

**Files:**
- Create: `lib/open-ena/model-v3/resource-budget.ts`
- Test: `tests/open-ena-model-v3-resource-budget.test.ts`

- [ ] **Step 1: Write failing formula and hard-limit tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { estimateStandardResourcesV3 } from "../lib/open-ena/model-v3/resource-budget";

test("resource estimates use undirected edges and actual Horizon sizes", () => {
  const estimate = estimateStandardResourcesV3({
    rowCount: 6,
    unitCount: 2,
    horizonCount: 2,
    codeCount: 4,
    horizonSizes: [2, 4],
    trajectorySteps: 5,
    windowType: "MovingStanzaWindow",
    backward: { kind: "infinity" },
    forward: { kind: "finite", value: 0 },
    referenceProjection: false,
  });
  assert.equal(estimate.adjacencyDimensions, 6);
  assert.equal(estimate.estimatedWindowVisits, 20);
  assert.equal(estimate.blocked, false);
});
```

- [ ] **Step 2: Run the resource test**

Run: `node --import tsx --test tests/open-ena-model-v3-resource-budget.test.ts`
Expected: FAIL because the estimator is absent.

- [ ] **Step 3: Implement a versioned deterministic estimator**

```ts
import type {
  BackwardExtentV3,
  ForwardExtentV3,
  StandardWindowTypeV3,
} from "./types";

export const RESOURCE_BUDGET_VERSION_V3 = "open-ena-resource-v3.1";
export const MAX_ESTIMATED_NUMERIC_CELLS_V3 = 25_000_000;
export const MAX_ESTIMATED_WINDOW_VISITS_V3 = 100_000_000;
export const MAX_ESTIMATED_PEAK_BYTES_V3 = 512 * 1024 * 1024;
export const MAX_ESTIMATED_EXPORT_BYTES_V3 = 256 * 1024 * 1024;

function extent(value: BackwardExtentV3 | ForwardExtentV3, horizonSize: number, includesCurrent: boolean) {
  if (value.kind === "infinity") return includesCurrent ? horizonSize : Math.max(0, horizonSize - 1);
  return includesCurrent
    ? Math.min(horizonSize, value.value)
    : Math.min(Math.max(0, horizonSize - 1), value.value);
}

export function estimateStandardResourcesV3(input: {
  rowCount: number;
  unitCount: number;
  horizonCount: number;
  codeCount: number;
  horizonSizes: number[];
  trajectorySteps: number;
  windowType: StandardWindowTypeV3;
  backward: BackwardExtentV3;
  forward: ForwardExtentV3;
  referenceProjection: boolean;
}) {
  assertSafeResourceInputsV3(input);
  const adjacencyDimensions = input.codeCount * (input.codeCount - 1) / 2;
  const estimatedWindowVisits = input.horizonSizes.reduce((total, size) => (
    total + (input.windowType === "Conversation"
      ? size * size
      : size * (
          extent(input.backward, size, true)
          + extent(input.forward, size, false)
        ))
  ), 0);
  const estimatedForwardBufferRows = input.windowType === "Conversation"
    ? Math.max(0, ...input.horizonSizes)
    : input.horizonSizes.reduce((largest, size) => Math.max(
        largest,
        extent(input.forward, size, false),
      ), 0);
  const estimatedNumericCells =
    input.rowCount * input.codeCount
    + input.trajectorySteps * adjacencyDimensions
    + adjacencyDimensions * adjacencyDimensions
    + (input.referenceProjection ? input.trajectorySteps * adjacencyDimensions : 0);
  const estimatedWorkerMaterializationBytes =
    input.rowCount * (input.codeCount + 5) * 16
    + estimatedForwardBufferRows * (input.codeCount + 5) * 16;
  const estimatedExportBytes =
    (input.rowCount * input.codeCount + input.trajectorySteps * adjacencyDimensions) * 24;
  const estimatedPeakBytes = estimatedNumericCells * 8 + estimatedWorkerMaterializationBytes;
  assertSafeResourceOutputsV3({
    adjacencyDimensions,
    estimatedWindowVisits,
    estimatedNumericCells,
    estimatedWorkerMaterializationBytes,
    estimatedExportBytes,
    estimatedPeakBytes,
  });
  const blockedReasons = [
    ...(estimatedNumericCells > MAX_ESTIMATED_NUMERIC_CELLS_V3 ? ["numeric-cells" as const] : []),
    ...(estimatedWindowVisits > MAX_ESTIMATED_WINDOW_VISITS_V3 ? ["window-visits" as const] : []),
    ...(estimatedPeakBytes > MAX_ESTIMATED_PEAK_BYTES_V3 ? ["peak-bytes" as const] : []),
    ...(estimatedExportBytes > MAX_ESTIMATED_EXPORT_BYTES_V3 ? ["export-bytes" as const] : []),
  ];
  return {
    version: RESOURCE_BUDGET_VERSION_V3,
    analysisFamily: "standard" as const,
    rows: input.rowCount,
    units: input.unitCount,
    horizons: input.horizonCount,
    codes: input.codeCount,
    adjacencyDimensions,
    trajectorySteps: input.trajectorySteps,
    estimatedForwardBufferRows,
    estimatedWindowVisits,
    estimatedNumericCells,
    estimatedWorkerMaterializationBytes,
    estimatedExportBytes,
    estimatedPeakBytes,
    blocked: blockedReasons.length > 0,
    blockedReasons,
  };
}
```

- [ ] **Step 4: Add finite/Infinity/forward/reference/ONA table cases**

Add exact expected counts for finite backward 1 and 5, finite forward 2,
backward Infinity, forward Infinity, both Infinity, Conversation effective
coverage, Reference projection, and ONA n-squared directed dimensions. Assert
that separate window-visit, numeric-cell, peak-memory, export-size, and unsafe
integer failures return `RESOURCE_BUDGET_EXCEEDED` input evidence and never
change an extent. Implement `estimateOnaResourcesV3` with `p * p` directed
dimensions, mask storage, backward-only visits, and the same byte/work limits;
its return value uses `analysisFamily: "ona"`, while the Standard estimator
uses `analysisFamily: "standard"`.

```ts
for (const testCase of resourceCases) {
  test(testCase.name, () => {
    const estimate = estimateStandardResourcesV3(testCase.input);
    assert.equal(estimate.estimatedWindowVisits, testCase.windowVisits);
    assert.equal(estimate.adjacencyDimensions, testCase.adjacencyDimensions);
    assert.deepEqual(testCase.input.backward, testCase.originalBackward);
    assert.deepEqual(testCase.input.forward, testCase.originalForward);
  });
}
```

- [ ] **Step 5: Run the estimator tests**

Run: `node --import tsx --test tests/open-ena-model-v3-resource-budget.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit the budget estimator**

```bash
git add lib/open-ena/model-v3/resource-budget.ts tests/open-ena-model-v3-resource-budget.test.ts
git commit -m "feat: preflight Open ENA model resources"
```

### Task 8: Compile drafts and migrate legacy configs

**Files:**
- Create: `lib/open-ena/model-v3/compiler.ts`
- Create: `lib/open-ena/model-v3/migration.ts`
- Create: `lib/open-ena/model-v3/index.ts`
- Modify: `lib/open-ena/types.ts`
- Test: `tests/open-ena-model-v3-compiler.test.ts`
- Test: `tests/open-ena-model-v3-migration.test.ts`

- [ ] **Step 1: Write failing compiler readiness tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { compileStandardDraftV3 } from "../lib/open-ena/model-v3/compiler";

test("an invalid draft has no canonical configuration", async () => {
  const result = await compileStandardDraftV3(dataset, "a".repeat(64), {
    ...validDraft,
    codes: [],
  });
  assert.equal(result.status, "invalid");
  assert.equal(result.canonicalConfiguration, null);
});

test("a valid Conversation Endpoint compiles without row order", async () => {
  const result = await compileStandardDraftV3(dataset, "a".repeat(64), {
    ...validDraft,
    windowType: "Conversation",
    model: "EndPoint",
  });
  assert.equal(result.status, "ready");
  if (result.status !== "ready") throw new Error("expected ready");
  assert.equal(result.canonicalConfiguration.window.type, "Conversation");
  assert.match(result.configurationSha256, /^[a-f0-9]{64}$/u);
  assert.equal(Object.isFrozen(result.canonicalConfiguration), true);
  assert.equal(Object.isFrozen(result.canonicalConfiguration.codes), true);
});
```

Use a concrete three-row dataset and complete `validDraft` fixture in the
test file; do not import a production sample.

- [ ] **Step 2: Write failing legacy migration tests**

```ts
test("legacy Moving Stanza and trajectory configs require fresh order review", () => {
  const migrated = migrateLegacyOpenEnaConfigToDraftV3({
    ...SAMPLE_CONFIG,
    model: "SeparateTrajectory",
    window: "MovingStanzaWindow",
  });
  assert.equal(migrated.standard.movingStanza.rowOrder, null);
  assert.equal(migrated.standard.horizonOrder, null);
  assert.equal(migrated.requiresReview.includes("row-order"), true);
  assert.equal(migrated.requiresReview.includes("horizon-order"), true);
});
```

- [ ] **Step 3: Run the compiler and migration tests**

Run: `node --import tsx --test tests/open-ena-model-v3-compiler.test.ts tests/open-ena-model-v3-migration.test.ts`
Expected: FAIL because compiler and migration modules are absent.

- [ ] **Step 4: Implement the Standard compiler**

Implement `compileStandardDraftV3(dataset, datasetSha256, draft)` as:

```ts
export type StandardCompileResultV3 =
  | {
      status: "invalid";
      draftFingerprint: string;
      diagnostics: ModelDiagnosticV3[];
      canonicalConfiguration: null;
    }
  | ReadyStandardCompileResultV3;

export interface ReadyStandardCompileResultV3 {
  status: "ready";
  draftFingerprint: string;
  canonicalConfiguration: CanonicalStandardConfigV3;
  configurationSha256: string;
  diagnostics: ModelDiagnosticV3[];
  capabilityStatus: Record<ModelCapabilityV3, "available" | "blocked">;
  resourceEstimate: ReturnType<typeof estimateStandardResourcesV3>;
}

export async function compileStandardDraftV3(
  dataset: ParsedDataset,
  datasetSha256: string,
  draft: StandardEnaDraftV3,
): Promise<StandardCompileResultV3> {
  const datasetBinding: DatasetBindingV3 = {
    hashKind: datasetHashKindFor(dataset),
    normalizedTableSha256: requireLowercaseSha256V3(datasetSha256),
    rowCount: dataset.rows.length,
    headerSha256: await sha256CanonicalJsonV3(dataset.headers),
  };
  const diagnostics = validateStandardDraftV3(dataset, datasetBinding, draft);
  if (diagnostics.some((entry) => entry.blocks.includes("build-model"))) {
    return {
      status: "invalid",
      draftFingerprint: await sha256CanonicalJsonV3(draft),
      diagnostics,
      canonicalConfiguration: null,
    };
  }
  const canonicalConfiguration = deepFreezeV3(decodeCanonicalStandardConfigV3(
    canonicalStandardFromDraftV3(draft, {
      validationContractVersion: OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3,
      runtimePolicyVersion: OPEN_ENA_RUNTIME_POLICY_VERSION_V3,
    }),
  ));
  const configurationSha256 = await sha256CanonicalJsonV3(canonicalConfiguration);
  const resourceEstimate = estimateForDraftV3(dataset, canonicalConfiguration);
  if (resourceEstimate.blocked) {
    return {
      status: "invalid",
      draftFingerprint: await sha256CanonicalJsonV3(draft),
      diagnostics: [...diagnostics, resourceDiagnosticV3(resourceEstimate)],
      canonicalConfiguration: null,
    };
  }
  return {
    status: "ready",
    draftFingerprint: await sha256CanonicalJsonV3(draft),
    canonicalConfiguration,
    configurationSha256,
    diagnostics,
    capabilityStatus: capabilityStatusV3(diagnostics),
    resourceEstimate,
  };
}
```

Add `compileOnaDraftV3` with the fixed ONA contract and no Standard-only
fields.

- [ ] **Step 5: Implement lossless legacy-to-draft migration**

Map the existing flat `OpenEnaConfig` to the correct family draft. Preserve
known Units, Horizons, Group, Codes, finite/Infinity backward, forward, model,
weighting, rotation, reference ID, ONA order, and mask. Set missing Standard
row/Horizon order confirmations to null, expose explicit `requiresReview`
entries, map `sum` to the scientific Frequency label, and never auto-run.

```ts
export function migrateLegacyOpenEnaConfigToDraftV3(
  config: OpenEnaConfig,
): MigratedModelDraftV3 {
  const family = analysisKindFor(config) === "ona" ? "ona" : "standard";
  return family === "ona"
    ? migrateLegacyOnaDraftV3(config)
    : {
        schemaVersion: 3,
        activeFamily: "standard",
        standard: {
          ...standardDraftFieldsV3(config),
          weighting: config.weightBy === "sum" ? "frequency" : "binary",
          movingStanza: {
            backward: portableExtentV3(config.windowSizeBack),
            forward: portableExtentV3(config.windowSizeForward),
            rowOrder: null,
          },
          horizonOrder: null,
        },
        ona: emptyOnaDraftV3(),
        requiresReview: [
          ...(config.window === "MovingStanzaWindow" ? ["row-order" as const] : []),
          ...(config.model === "EndPoint" ? [] : ["horizon-order" as const]),
          ...(config.rotation === "mean" ? ["means-direction" as const] : []),
        ],
        autoRun: false,
      };
}
```

- [ ] **Step 6: Export v3 APIs and narrow legacy aliases**

```ts
export * from "./canonical-json";
export * from "./compiler";
export * from "./diagnostics";
export * from "./identity";
export * from "./migration";
export * from "./ordering";
export * from "./resource-budget";
export * from "./schema";
export * from "./types";
```

In `lib/open-ena/types.ts`, export type-only aliases for the new workspace,
canonical, and compile-result types; do not replace `OpenEnaConfig` yet.

- [ ] **Step 7: Run Plan 1 focused and application tests**

Run:

```bash
node --import tsx --test tests/open-ena-model-v3-*.test.ts
npm run typecheck:app
npm run test:app
```

Expected: all new tests and all existing application tests PASS.

- [ ] **Step 8: Commit the compiler boundary**

```bash
git add lib/open-ena/model-v3 lib/open-ena/types.ts tests/open-ena-model-v3-compiler.test.ts tests/open-ena-model-v3-migration.test.ts
git commit -m "feat: compile fail-closed Open ENA model drafts"
```

## Plan 1 completion checkpoint

Before Plan 2:

- `git diff --check` passes.
- `git status --short` contains no uncommitted Plan 1 files.
- Every v3 diagnostic/compiler test passes.
- Existing app tests pass.
- Current Models UI and worker are still on the legacy path.
- No ONA result or algorithm has changed.
