import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAnalysisBundleV3,
  parseAnalysisBundleV3,
} from "../lib/open-ena/export";
import { boundResultFromBundleV3 } from "../lib/open-ena/bundle-contract-v3";
import {
  BUNDLE_JSON_LIMITS_V3,
  captureBundleJsonV3,
  parseBundleJsonV3,
} from "../lib/open-ena/bundle-json-v3";
import {
  canonicalJsonV3,
  sha256CanonicalJsonV3,
  sha256TextV3,
} from "../lib/open-ena/model-v3/canonical-json";
import type {
  OpenEnaAnalysisBundleV3,
  StandardEnaDraftV3,
  StandardAnalysisBundleV3,
} from "../lib/open-ena/model-v3/types";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import { bindResultV3 } from "../lib/open-ena/model-v3/result-binding";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";
import {
  buildReferenceV2,
  fitReferenceSourceV3,
} from "../lib/open-ena/model-v3/reference-v2";
import {
  buildOnaExecutionPlanV3,
  runOnaPlanV3,
} from "../lib/open-ena/model-v3/ona-adapter";
import { bindOnaResultV3 } from "../lib/open-ena/model-v3/ona-result-binding";
import { createDirectionalMask } from "../lib/open-ena/network-config";
import { decodeCanonicalOnaConfigV3 } from "../lib/open-ena/model-v3/schema";
import {
  OPEN_ENA_RUNTIME_POLICY_VERSION_V3,
  OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3,
} from "../lib/open-ena/model-v3/types";

async function fixture(modify?: Parameters<typeof bindingFixtureV3>[1]) {
  const { plan, compiled } = await bindingFixtureV3(undefined, modify);
  const result = await bindResultV3(
    plan,
    runStandardPlanV3(plan),
    {
      processedRows: plan.rows.length,
      maximumBufferedRows: 0,
      numericCellsAllocated: 120,
      peakBytesObservedOrBounded: 10240,
      observationMethod: "exact-counters-and-conservative-byte-bound",
    },
    compiled.diagnostics,
  );
  return { plan, result };
}

test("v3 bundle round-trips a complete bound result with component integrity", async () => {
  const { result } = await fixture();
  const bundle = await buildAnalysisBundleV3(result);
  assert.equal(bundle.schemaVersion, 3);
  assert.equal(bundle.kind, "open-ena-analysis-bundle");
  assert.equal(
    bundle.manifest.configurationSha256,
    result.binding.configurationSha256,
  );
  assert.match(bundle.integrity.bundleContentSha256, /^[0-9a-f]{64}$/u);
  assert.deepEqual(await parseAnalysisBundleV3(JSON.stringify(bundle)), bundle);
});

for (const model of ["SeparateTrajectory", "AccumulatedTrajectory"] as const)
  test(`${model} preserves actual trajectory identity tables and optional fields`, async () => {
    const { result } = await fixture((draft, data) => {
      draft.model = model;
      data.rows = data.rows.flatMap((row) => [
        { ...row, horizon: "first", time: 1 },
        { ...row, horizon: "second", time: 2, A: row.C, C: row.A },
      ]);
    });
    const bundle = await buildAnalysisBundleV3(result);
    assert.deepEqual(bundle.tables.trajectories, result.set.trajectories);
    assert.deepEqual(bundle.modelData.trajectories, result.set.trajectories);
    assert.notDeepEqual(bundle.tables.trajectories, bundle.tables.points);
    assert.deepEqual(
      await parseAnalysisBundleV3(JSON.stringify(bundle)),
      bundle,
    );
  });

test("Means full basis round-trips with its actual contrast membership", async () => {
  const { result } = await fixture((draft) => {
    draft.rotation = {
      type: "means",
      centerAlignToOrigin: true,
      negativeLevel: { type: "string", value: "Control" },
      positiveLevel: { type: "string", value: "Treatment" },
    };
  });
  const bundle = await buildAnalysisBundleV3(result);
  assert.equal(bundle.rotation.rotationColumns[0], "MR1");
  assert.deepEqual(await parseAnalysisBundleV3(JSON.stringify(bundle)), bundle);
});

test("Reference projection retains fixed source geometry and source fit provenance", async () => {
  const source = await bindingFixtureV3();
  const reference = await buildReferenceV2(
    await fitReferenceSourceV3(source.plan),
    { displayName: "Portable source", currentPlan: source.plan },
  );
  const { plan, compiled } = await bindingFixtureV3(
    "c".repeat(64),
    (draft) => {
      draft.rotation = {
        type: "reference",
        referenceId: reference.referenceId,
        expectedContentSha256: reference.contentSha256,
      };
    },
    reference,
  );
  const result = await bindResultV3(
    plan,
    runStandardPlanV3(plan),
    {
      processedRows: plan.rows.length,
      maximumBufferedRows: 0,
      numericCellsAllocated: 120,
      peakBytesObservedOrBounded: 10240,
      observationMethod: "exact-counters-and-conservative-byte-bound",
    },
    compiled.diagnostics,
  );
  const bundle = await buildAnalysisBundleV3(result);
  assert.deepEqual(bundle.rotation, result.set.rotation);
  assert.deepEqual(
    bundle.executionProvenance.reference,
    result.executionProvenance.reference,
  );
  assert.deepEqual(
    await parseAnalysisBundleV3(JSON.stringify(bundle), { expectedPlan: plan }),
    bundle,
  );
  const changed = structuredClone(bundle);
  Object.assign(changed.executionProvenance.projection, {
    rank: 0,
    targetProjectionRank: 0,
  });
  await rehash(changed, true);
  await assert.rejects(
    () => parseAnalysisBundleV3(JSON.stringify(changed)),
    /rank|contract/i,
  );
});

async function onaFixture(grouped = true, zeroUnit = false) {
  const rows = [
    { u: "u1", h: "h1", t: 1, g: "g1", A: 2, B: 0, C: 1 },
    { u: "u2", h: "h1", t: 2, g: "g2", A: 0, B: 3, C: 1 },
    { u: "u1", h: "h2", t: 1, g: "g1", A: 0, B: 2, C: 2 },
    { u: "u3", h: "h2", t: 2, g: "g1", A: 1, B: 1, C: 0 },
  ];
  const codes = ["A", "B", "C"],
    directionalMask = createDirectionalMask(codes);
  if (zeroUnit)
    for (const row of rows)
      if (row.u === "u1") Object.assign(row, { A: 0, B: 0, C: 0 });
  directionalMask.enabled[0][1] = false;
  const configuration = decodeCanonicalOnaConfigV3({
    schemaVersion: 3,
    analysisFamily: "ona",
    contracts: {
      validationContractVersion: OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3,
      runtimePolicyVersion: OPEN_ENA_RUNTIME_POLICY_VERSION_V3,
    },
    units: {
      columns: ["u"],
      group: grouped
        ? { type: "stable-metadata", column: "g" }
        : { type: "none" },
    },
    horizons: { columns: ["h"] },
    codes: codes.map((column) => ({ column, displayLabel: column })),
    model: { type: "EndPoint" },
    weighting: { type: "frequency", engineMethod: "sum" },
    window: {
      type: "MovingStanzaWindow",
      backward: { kind: "finite", value: 2 },
      forward: 0,
      rowOrder: {
        kind: "columns",
        keys: [
          {
            column: "t",
            direction: "ascending",
            comparator: { type: "number" },
          },
        ],
      },
    },
    rotation: { type: "svd", centerAlignToOrigin: true },
    directionalMask,
  });
  const plan = await buildOnaExecutionPlanV3(
    {
      rows,
      headers: Object.keys(rows[0]),
      name: "ona.csv",
      sizeBytes: 512,
      source: "upload",
    },
    "d".repeat(64),
    configuration,
  );
  const result = await bindOnaResultV3(plan, runOnaPlanV3(plan), {
    processedRows: rows.length,
    maximumRetainedRowsAfterChunk: 0,
    bufferedRowsPeakUpperBound: Math.min(
      rows.length,
      plan.header.resourceEstimate.estimatedRetainedWindowRows + 1,
    ),
    numericCellsUpperBound: plan.operationalAdmission.totalNumericCells,
    peakBytesUpperBound: plan.operationalAdmission.totalPeakBytes,
    observationMethod: "dimension-bounds-and-chunk-boundary-stream-state",
  });
  return { plan, result };
}

test("ONA preserves the directed basis, mask, audit and response summaries with individual hashes", async () => {
  const { result, plan } = await onaFixture();
  const bundle = await buildAnalysisBundleV3(result);
  assert.ok("orderedAudit" in bundle);
  assert.deepEqual(bundle.orderedAudit, result.orderedAudit);
  assert.deepEqual(
    bundle.orderedResponseNodeSummary,
    result.orderedResponseNodeSummary,
  );
  assert.match(
    bundle.integrity.componentHashes.orderedAudit,
    /^[0-9a-f]{64}$/u,
  );
  assert.deepEqual(
    await parseAnalysisBundleV3(JSON.stringify(bundle), { expectedPlan: plan }),
    bundle,
  );
});

// Independent honest rehash: changing claimed content is not authentication.
async function rehash(bundle: OpenEnaAnalysisBundleV3, scientific = false) {
  const { integrity: _old, ...components } = bundle;
  if (scientific) {
    const { connectionCounts, lineWeights, pointsForProjection, points } =
      bundle.tables;
    const set = {
      ...bundle.modelData,
      connectionCounts,
      lineWeights,
      pointsForProjection,
      points,
      rotation: bundle.rotation,
    };
    const payload = {
      configuration: bundle.configuration,
      executionProvenance: bundle.executionProvenance,
      set,
      capabilityStatus: bundle.capabilityStatus,
      ...("orderedAudit" in bundle
        ? {
            orderedAudit: bundle.orderedAudit,
            orderedResponseNodeSummary: bundle.orderedResponseNodeSummary,
          }
        : {}),
    };
    const oldHash = bundle.manifest.scientificResultSha256,
      scientificResultSha256 = await sha256CanonicalJsonV3(payload);
    Object.assign(bundle.manifest, { scientificResultSha256 });
    Object.assign(bundle, {
      methodsReportMarkdown: bundle.methodsReportMarkdown.replace(
        oldHash,
        scientificResultSha256,
      ),
    });
    if (bundle.presentation)
      bundle.presentation.boundResultSha256 = scientificResultSha256;
  }
  const updated = {
    ...components,
    methodsReportMarkdown: bundle.methodsReportMarkdown,
  };
  const hashes = Object.fromEntries(
    await Promise.all(
      Object.entries(updated)
        .filter(([key]) => !["schemaVersion", "kind"].includes(key))
        .map(async ([key, value]) => [
          key,
          key === "methodsReportMarkdown"
            ? await sha256TextV3(String(value))
            : await sha256CanonicalJsonV3(value),
        ]),
    ),
  );
  Object.assign(bundle, {
    integrity: {
      componentHashes: hashes,
      bundleContentSha256: await sha256CanonicalJsonV3({
        ...updated,
        componentHashes: hashes,
      }),
    },
  });
  return bundle;
}

for (const [label, change] of [
  [
    "table",
    (b: OpenEnaAnalysisBundleV3) => {
      b.tables.points[0].SVD1 = 400;
    },
  ],
  [
    "provenance ordinal",
    (b: OpenEnaAnalysisBundleV3) => {
      (b.executionProvenance.ordering.runtimeSourceRowIndices as number[])[0] =
        999;
    },
  ],
  [
    "rotation",
    (b: OpenEnaAnalysisBundleV3) => {
      b.rotation.rotationMatrix[0][0] = 400;
    },
  ],
  [
    "methods",
    (b: OpenEnaAnalysisBundleV3) => {
      Object.assign(b, {
        methodsReportMarkdown: b.methodsReportMarkdown + "x",
      });
    },
  ],
] as const)
  test(`rejects ${label} tampering without updated integrity`, async () => {
    const { result } = await fixture();
    const bundle = structuredClone(await buildAnalysisBundleV3(result));
    change(bundle);
    await assert.rejects(
      () => parseAnalysisBundleV3(JSON.stringify(bundle)),
      /hash|integrity|contract/i,
    );
  });

for (const [label, change] of [
  [
    "table shape",
    (b: OpenEnaAnalysisBundleV3) => {
      delete b.tables.points[0].SVD1;
    },
  ],
  [
    "Unit identity",
    (b: OpenEnaAnalysisBundleV3) => {
      b.tables.points[0].Unit = "alien";
    },
  ],
  [
    "dictionary identity",
    (b: OpenEnaAnalysisBundleV3) => {
      b.executionProvenance.identityDictionary.units[0].displayLabel = "alien";
    },
  ],
  [
    "projection derivation",
    (b: OpenEnaAnalysisBundleV3) => {
      b.tables.points[0].SVD1 = 400;
    },
  ],
  [
    "orthonormal basis",
    (b: OpenEnaAnalysisBundleV3) => {
      b.rotation.rotationMatrix[0][0] = 400;
    },
  ],
  [
    "normalization derivation",
    (b: OpenEnaAnalysisBundleV3) => {
      b.tables.lineWeights[0]["Connection 1"] = 400;
    },
  ],
  [
    "ordinal coverage",
    (b: OpenEnaAnalysisBundleV3) => {
      (b.executionProvenance.ordering.runtimeSourceRowIndices as number[])[0] =
        999;
    },
  ],
  [
    "model family",
    (b: OpenEnaAnalysisBundleV3) => {
      b.modelData.networkType = "ordered";
    },
  ],
  [
    "source rows",
    (b: OpenEnaAnalysisBundleV3) => {
      b.modelData.rawRows.push({ A: 1 });
    },
  ],
] as const)
  test(`honestly recomputing hashes does not legalize inconsistent ${label}`, async () => {
    const { result } = await fixture();
    const bundle = structuredClone(await buildAnalysisBundleV3(result));
    change(bundle);
    await rehash(bundle, true);
    await assert.rejects(
      () => parseAnalysisBundleV3(JSON.stringify(bundle)),
      /contract|identity|dictionary|scientific|orthonormal|ordinal/i,
    );
  });

test("preserves exact set fields and explicitly unavailable statistics", async () => {
  const { result, plan } = await fixture();
  const bundle = await buildAnalysisBundleV3(result, { expectedPlan: plan });
  const { connectionCounts, lineWeights, pointsForProjection, points } =
    bundle.tables;
  assert.deepEqual(
    {
      ...bundle.modelData,
      connectionCounts,
      lineWeights,
      pointsForProjection,
      points,
      rotation: bundle.rotation,
    },
    result.set,
  );
  assert.deepEqual(bundle.tables.trajectories, []);
  assert.equal(bundle.statistics.available, false);
  assert.equal(bundle.statistics.value, null);
  assert.ok(bundle.statistics.diagnostics.length);
  assert.deepEqual(
    await parseAnalysisBundleV3(JSON.stringify(bundle), { expectedPlan: plan }),
    bundle,
  );
  assert.ok(
    Object.isFrozen(bundle) && Object.isFrozen(bundle.tables.points[0]),
  );
});

test("builder captures inputs before its first await and rejects forged science", async () => {
  const { result } = await fixture();
  const mutable = structuredClone(result);
  const pending = buildAnalysisBundleV3(mutable);
  mutable.set.points[0].SVD1 = 400;
  const bundle = await pending;
  assert.deepEqual(bundle.tables.points, result.set.points);
  await assert.rejects(
    () => buildAnalysisBundleV3(mutable),
    /hash|integrity|contract/i,
  );
});

test("presentation binds the exact result and known identities without changing science", async () => {
  const { result } = await fixture();
  const presentation = {
    boundResultSha256: result.binding.scientificResultSha256,
    hiddenCodes: ["Code 1"],
    hiddenGroups: [{ type: "string" as const, value: "Control" }],
    codeColors: { "Code 1": "#ff0000" },
    nodeOverrides: [{ code: "Code 1", coordinates: { SVD1: 0.2 } }],
    dimensions: ["SVD1", "SVD2"],
  };
  const bundle = await buildAnalysisBundleV3(result, { presentation });
  assert.deepEqual(bundle.presentation, presentation);
  assert.equal(
    bundle.manifest.scientificResultSha256,
    result.binding.scientificResultSha256,
  );
  assert.ok(bundle.integrity.componentHashes.presentation);
  for (const changed of [
    { ...presentation, boundResultSha256: "b".repeat(64) },
    { ...presentation, hiddenCodes: ["absent"] },
    { ...presentation, dimensions: ["SVD99"] },
  ]) {
    await assert.rejects(
      () => buildAnalysisBundleV3(result, { presentation: changed }),
      /presentation|contract/i,
    );
  }
});

test("safe text boundary rejects duplicate/unsafe keys, nonfinite numbers, depth and size before verification", async () => {
  const { result } = await fixture();
  const text = JSON.stringify(await buildAnalysisBundleV3(result));
  for (const input of [
    text.replace('"schemaVersion":3', '"schemaVersion":3,"schemaVersion":3'),
    text.replace(
      '"schemaVersion":3',
      '"schemaVersion":3,"\\u0073chemaVersion":3',
    ),
    text.replace('"schemaVersion":3', '"schemaVersion":3,"__proto__":{}'),
    text.replace('"schemaVersion":3', '"schemaVersion":3,"extra":1e999'),
    "[".repeat(70) + "0" + "]".repeat(70),
    " ".repeat(16 * 1024 * 1024 + 1),
  ]) {
    await assert.rejects(
      () => parseAnalysisBundleV3(input),
      /JSON|duplicate|unsafe|finite|depth|size|limit|contract/i,
    );
  }
});

test("historical parser checks integrity without claiming independent source truth", async () => {
  const { result } = await fixture();
  const bundle = await buildAnalysisBundleV3(result);
  const { plan: other } = await bindingFixtureV3("b".repeat(64));
  assert.deepEqual(
    await parseAnalysisBundleV3(canonicalJsonV3(bundle)),
    bundle,
  );
  await assert.rejects(
    () =>
      parseAnalysisBundleV3(JSON.stringify(bundle), { expectedPlan: other }),
    /binding|plan|match/i,
  );
});

test("honest rehash cannot smuggle unknown nested ordering fields", async () => {
  const { result } = await fixture((draft) => {
    draft.windowType = "MovingStanzaWindow";
    draft.movingStanza.rowOrder = {
      kind: "columns",
      keys: [
        {
          column: "unit",
          direction: "ascending",
          comparator: {
            type: "text",
            locale: "en",
            sensitivity: "variant",
            numeric: false,
          },
        },
      ],
    };
  });
  const bundle = structuredClone(await buildAnalysisBundleV3(result));
  const ordering = bundle.executionProvenance.ordering.resolvedRowOrder;
  assert.equal(ordering.type, "within-horizon-order");
  if (ordering.type !== "within-horizon-order")
    throw new Error("fixture ordering");
  Object.assign(ordering.textCollationBindings[0], {
    extraneousScientificClaim: true,
  });
  await rehash(bundle, true);
  await assert.rejects(
    () => parseAnalysisBundleV3(JSON.stringify(bundle)),
    /contract/i,
  );
});

test("ONA response summary Group membership is checked even after complete honest rehash", async () => {
  const { result } = await onaFixture();
  const bundle = structuredClone(await buildAnalysisBundleV3(result));
  assert.ok("orderedAudit" in bundle);
  bundle.orderedResponseNodeSummary.groups[0].unitCount += 10;
  await rehash(bundle, true);
  await assert.rejects(
    () => parseAnalysisBundleV3(JSON.stringify(bundle)),
    /contract/i,
  );
});

test("ONA without Group metadata preserves its explicit All units response summary", async () => {
  const { result } = await onaFixture(false);
  const bundle = await buildAnalysisBundleV3(result);
  assert.deepEqual(await parseAnalysisBundleV3(JSON.stringify(bundle)), bundle);
});

test("builder admits escaped text by serialized UTF-8 bytes including the final integrity envelope", async () => {
  const { result } = await fixture();
  const makePresentation = (color: string) => ({
    boundResultSha256: result.binding.scientificResultSha256,
    hiddenCodes: [],
    hiddenGroups: [],
    codeColors: { "Code 1": color },
    nodeOverrides: [],
    dimensions: ["SVD1"],
  });
  // Control characters take six serialized bytes, not their one-code-unit source width.
  await assert.rejects(
    () =>
      buildAnalysisBundleV3(result, {
        presentation: makePresentation("\u0000".repeat(2_800_000)),
      }),
    /size|byte|limit|resource/i,
  );
  const bundle = await buildAnalysisBundleV3(result, {
    presentation: makePresentation("\u0000\ud800".repeat(5000)),
  });
  assert.deepEqual(await parseAnalysisBundleV3(JSON.stringify(bundle)), bundle);
});

test("explicit null presentation is rejected even with an honest component hash", async () => {
  const { result } = await fixture();
  const bundle = structuredClone(await buildAnalysisBundleV3(result));
  Object.assign(bundle, { presentation: null });
  await rehash(bundle);
  await assert.rejects(
    () => parseAnalysisBundleV3(JSON.stringify(bundle)),
    /contract/i,
  );
});

async function orderedBundleFixture(
  trajectory = false,
  unbalanced = false,
  sourceConfirmed = false,
  accumulated = false,
) {
  const { result } = await fixture((draft, data) => {
    draft.windowType = "MovingStanzaWindow";
    draft.movingStanza.rowOrder = {
      kind: "columns",
      keys: [
        {
          column: "unit",
          direction: "ascending",
          comparator: {
            type: "text",
            locale: "en",
            sensitivity: "variant",
            numeric: false,
          },
        },
      ],
    };
    if (trajectory) {
      draft.model = accumulated
        ? "AccumulatedTrajectory"
        : "SeparateTrajectory";
      data.rows = data.rows.flatMap((row, index) => [
        { ...row, horizon: "first", time: 1 },
        ...(unbalanced && index === 2
          ? []
          : [{ ...row, horizon: "second", time: 2, A: row.C, C: row.A }]),
        ...(unbalanced && index === 3
          ? [{ ...row, horizon: "third", time: 3, A: row.B, B: row.C }]
          : []),
      ]);
    }
    if (sourceConfirmed) {
      const policy = (relevantColumns: string[]) => ({
        kind: "source-order-confirmed" as const,
        confirmation: {
          kind: "explicit-researcher-confirmation" as const,
          analysisFamily: "standard" as const,
          datasetSha256: "a".repeat(64),
          rowCount: data.rows.length,
          relevantColumns,
          confirmedAt: "2026-09-05T00:00:00.000Z",
          confirmationVersion: 1 as const,
        },
      });
      draft.movingStanza.rowOrder = policy(["horizon"]);
      if (trajectory) draft.horizonOrder = policy(["unit", "horizon"]);
    }
  });
  return (await buildAnalysisBundleV3(result)) as StandardAnalysisBundleV3;
}

for (const [label, trajectory, mutate] of [
  [
    "SPEC F1: trajectory declares Endpoint Horizon ordering",
    true,
    (bundle: StandardAnalysisBundleV3) => {
      Object.assign(bundle.executionProvenance.ordering, {
        resolvedHorizonOrder: {
          type: "not-applicable",
          reason: "endpoint-model",
        },
      });
    },
  ],
  [
    "SPEC F2: ten trajectory points have no Unit sequences",
    true,
    (bundle: StandardAnalysisBundleV3) => {
      Object.assign(bundle.executionProvenance.ordering.resolvedHorizonOrder, {
        unitSequences: [],
      });
    },
  ],
  [
    "SPEC F3: one row key has an empty normalized tuple",
    false,
    (bundle: StandardAnalysisBundleV3) => {
      const row = bundle.executionProvenance.ordering.resolvedRowOrder;
      if (row.type === "within-horizon-order")
        Object.assign(row.mappings[0], { orderTuple: [] });
    },
  ],
  [
    "SPEC F3: ascending text is decreasing within a Horizon",
    false,
    (bundle: StandardAnalysisBundleV3) => {
      const row = bundle.executionProvenance.ordering.resolvedRowOrder;
      if (row.type === "within-horizon-order")
        Object.assign(row.mappings[0], { orderTuple: ["zzzz"] });
    },
  ],
] as const)
  test(label, async () => {
    const bundle = structuredClone(await orderedBundleFixture(trajectory));
    mutate(bundle);
    await rehash(bundle, true);
    await assert.rejects(
      () => parseAnalysisBundleV3(JSON.stringify(bundle)),
      /contract|order|sequence|tuple/i,
    );
  });

for (const mutation of [
  "missing Unit",
  "missing step",
  "extra observed step",
  "duplicate step",
  "reordered steps",
] as const)
  test(`trajectory sequence rejects ${mutation} after honest rehash`, async () => {
    const bundle = structuredClone(await orderedBundleFixture(true, true));
    const order = bundle.executionProvenance.ordering.resolvedHorizonOrder;
    assert.equal(order.type, "trajectory-horizon-order");
    if (order.type !== "trajectory-horizon-order")
      throw new Error("trajectory fixture");
    const sequence = order.unitSequences.find(
      (entry) => entry.steps.length === 2,
    )!;
    if (mutation === "missing Unit")
      Object.assign(order, { unitSequences: order.unitSequences.slice(1) });
    else if (mutation === "missing step")
      Object.assign(sequence, {
        steps: sequence.steps
          .slice(1)
          .map((step, index) => ({ ...step, trajectoryOrdinal: index })),
      });
    else if (mutation === "extra observed step") {
      const missing = order.horizonTuples.find(
        (entry) =>
          !sequence.steps.some(
            (step) => step.horizonToken === entry.horizonToken,
          ),
      )!;
      Object.assign(sequence, {
        steps: [
          ...sequence.steps,
          { horizonToken: missing.horizonToken, trajectoryOrdinal: 2 },
        ],
      });
    } else if (mutation === "duplicate step")
      Object.assign(sequence, {
        steps: [
          ...sequence.steps,
          { ...sequence.steps[0], trajectoryOrdinal: 2 },
        ],
      });
    else
      Object.assign(sequence, {
        steps: [...sequence.steps]
          .reverse()
          .map((step, index) => ({ ...step, trajectoryOrdinal: index })),
      });
    await rehash(bundle, true);
    await assert.rejects(
      () => parseAnalysisBundleV3(JSON.stringify(bundle)),
      /contract|sequence|step|ordinal/i,
    );
  });

for (const accumulated of [false, true])
  for (const sourceConfirmed of [false, true])
    test(`unbalanced ${accumulated ? "Accumulated" : "Separate"} trajectories retain ${sourceConfirmed ? "source-confirmed" : "column"} order`, async () => {
      const bundle = await orderedBundleFixture(
        true,
        true,
        sourceConfirmed,
        accumulated,
      );
      const order = bundle.executionProvenance.ordering.resolvedHorizonOrder;
      assert.equal(order.type, "trajectory-horizon-order");
      if (order.type !== "trajectory-horizon-order")
        throw new Error("trajectory fixture");
      assert.deepEqual(
        [
          ...new Set(order.unitSequences.map((entry) => entry.steps.length)),
        ].sort(),
        [1, 2, 3],
      );
      assert.deepEqual(
        await parseAnalysisBundleV3(JSON.stringify(bundle)),
        bundle,
      );
    });

test("Horizon tuples enforce numeric width/domain and per-Unit ordering", async () => {
  const original = await orderedBundleFixture(true);
  for (const tuple of [[], ["1"], [99]]) {
    const bundle = structuredClone(original),
      order = bundle.executionProvenance.ordering.resolvedHorizonOrder;
    if (order.type !== "trajectory-horizon-order")
      throw new Error("trajectory fixture");
    const first = order.unitSequences[0].steps[0].horizonToken;
    Object.assign(
      order.horizonTuples.find((entry) => entry.horizonToken === first)!,
      { orderTuple: tuple },
    );
    await rehash(bundle, true);
    await assert.rejects(
      () => parseAnalysisBundleV3(JSON.stringify(bundle)),
      /contract|tuple|order/i,
    );
  }
});

test("equal Horizon tuples across separate Units remain valid", async () => {
  const { result } = await fixture((draft, data) => {
    draft.model = "SeparateTrajectory";
    data.rows = data.rows.flatMap((row) => [
      { ...row, horizon: `${row.unit}-first`, time: 1 },
      { ...row, horizon: `${row.unit}-second`, time: 2, A: row.C, C: row.A },
    ]);
  });
  const bundle = await buildAnalysisBundleV3(result);
  assert.deepEqual(await parseAnalysisBundleV3(JSON.stringify(bundle)), bundle);
});

const binaryFixtureModifier: NonNullable<
  Parameters<typeof bindingFixtureV3>[1]
> = (draft, data) => {
  draft.weighting = "binary";
  const values = [
    [1, 1, 0],
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, 1],
    [1, 1, 0],
  ];
  data.rows = data.rows.map((row, index) => ({
    ...row,
    A: values[index][0],
    B: values[index][1],
    C: values[index][2],
  }));
};

test("QUALITY F1: fractional Binary counts reject at builder and parser despite coherent normalized geometry", async () => {
  const { result } = await fixture(binaryFixtureModifier);
  const original = await buildAnalysisBundleV3(result);
  assert.deepEqual(
    await parseAnalysisBundleV3(JSON.stringify(original)),
    original,
  );
  const changed = structuredClone(original);
  changed.modelData.connectionMatrix.forEach((row, index) =>
    row.forEach((value, edge) => {
      row[edge] = value / 2;
      changed.tables.connectionCounts[index][
        changed.modelData.codeColumns[edge]
      ] = value / 2;
    }),
  );
  await rehash(changed, true);
  await assert.rejects(
    () => parseAnalysisBundleV3(JSON.stringify(changed)),
    /Binary|integer|contract/i,
  );
  await assert.rejects(
    () => buildAnalysisBundleV3(boundResultFromBundleV3(changed)),
    /Binary|integer|contract/i,
  );
});

test("Frequency fractional counts and Binary Reference projections remain valid", async () => {
  const frequency = await fixture((_draft, data) => {
    data.rows = data.rows.map((row) => ({
      ...row,
      A: Number(row.A) / 2,
      B: Number(row.B) / 2,
      C: Number(row.C) / 2,
    }));
  });
  const fractional = await buildAnalysisBundleV3(frequency.result);
  assert.ok(
    fractional.modelData.connectionMatrix.some((row) =>
      row.some((value) => !Number.isInteger(value)),
    ),
  );
  assert.deepEqual(
    await parseAnalysisBundleV3(JSON.stringify(fractional)),
    fractional,
  );
  const source = await bindingFixtureV3(undefined, binaryFixtureModifier);
  const reference = await buildReferenceV2(
    await fitReferenceSourceV3(source.plan),
    { displayName: "Binary source", currentPlan: source.plan },
  );
  const { plan, compiled } = await bindingFixtureV3(
    "c".repeat(64),
    (draft, data) => {
      binaryFixtureModifier(draft, data);
      draft.rotation = {
        type: "reference",
        referenceId: reference.referenceId,
        expectedContentSha256: reference.contentSha256,
      };
    },
    reference,
  );
  const result = await bindResultV3(
    plan,
    runStandardPlanV3(plan),
    {
      processedRows: plan.rows.length,
      maximumBufferedRows: 0,
      numericCellsAllocated: 120,
      peakBytesObservedOrBounded: 10240,
      observationMethod: "exact-counters-and-conservative-byte-bound",
    },
    compiled.diagnostics,
  );
  const bundle = await buildAnalysisBundleV3(result);
  assert.deepEqual(await parseAnalysisBundleV3(JSON.stringify(bundle)), bundle);
});

for (const [label, mutation] of [
  [
    "false actions",
    (d: object) => Object.assign(d, { suggestedActions: false }),
  ],
  ["null actions", (d: object) => Object.assign(d, { suggestedActions: null })],
  ["false evidence", (d: object) => Object.assign(d, { evidence: false })],
  ["null evidence", (d: object) => Object.assign(d, { evidence: null })],
  [
    "object sample identity",
    (d: object) =>
      Object.assign(d, {
        evidence: {
          totalCount: 1,
          sampleLimit: 5,
          samples: [{ detail: "Evidence", identity: { arbitrary: 1 } }],
          truncated: false,
        },
      }),
  ],
  ["unknown scope", (d: object) => Object.assign(d, { scope: "not-a-scope" })],
  [
    "unknown action ID",
    (d: object) =>
      Object.assign(d, {
        suggestedActions: [
          {
            id: "not-an-action",
            label: "Action",
            confirmationText: "Confirm",
            confirmationRequired: true,
            patch: { type: "clear-group" },
          },
        ],
      }),
  ],
  [
    "false sample array",
    (d: object) =>
      Object.assign(d, {
        evidence: {
          totalCount: 1,
          sampleLimit: 5,
          samples: false,
          truncated: false,
        },
      }),
  ],
  [
    "incorrect truncation",
    (d: object) =>
      Object.assign(d, {
        evidence: {
          totalCount: 2,
          sampleLimit: 5,
          samples: [{ detail: "Evidence" }],
          truncated: false,
        },
      }),
  ],
  [
    "sample count over total",
    (d: object) =>
      Object.assign(d, {
        evidence: {
          totalCount: 0,
          sampleLimit: 5,
          samples: [{ detail: "Evidence" }],
          truncated: false,
        },
      }),
  ],
  [
    "null sample row index",
    (d: object) =>
      Object.assign(d, {
        evidence: {
          totalCount: 1,
          sampleLimit: 5,
          samples: [{ detail: "Evidence", rowIndex: null }],
          truncated: false,
        },
      }),
  ],
] as const)
  test(`QUALITY F2: diagnostic ${label} rejects after honest rehash`, async () => {
    const { result } = await fixture();
    const bundle = structuredClone(await buildAnalysisBundleV3(result));
    assert.ok(bundle.executionProvenance.diagnostics.length);
    mutation(bundle.executionProvenance.diagnostics[0]);
    Object.assign(bundle.diagnostics, {
      warnings: bundle.executionProvenance.diagnostics,
    });
    await rehash(bundle, true);
    await assert.rejects(
      () => parseAnalysisBundleV3(JSON.stringify(bundle)),
      /contract|diagnostic|evidence|action/i,
    );
    await assert.rejects(
      () => buildAnalysisBundleV3(boundResultFromBundleV3(bundle)),
      /contract|diagnostic|evidence|action/i,
    );
  });

test("diagnostic optional absence and valid present action/evidence preserve native Standard and ONA diagnostics", async () => {
  for (const { result } of [await fixture(), await onaFixture(true, true)]) {
    const bundle = structuredClone(await buildAnalysisBundleV3(result));
    assert.ok(bundle.executionProvenance.diagnostics.length);
    assert.deepEqual(
      await parseAnalysisBundleV3(JSON.stringify(bundle)),
      bundle,
    );
    for (const diagnostic of bundle.executionProvenance.diagnostics) {
      Reflect.deleteProperty(diagnostic, "evidence");
      Reflect.deleteProperty(diagnostic, "suggestedActions");
    }
    Object.assign(bundle.diagnostics, {
      warnings: bundle.executionProvenance.diagnostics,
    });
    await rehash(bundle, true);
    assert.deepEqual(
      await parseAnalysisBundleV3(JSON.stringify(bundle)),
      bundle,
    );
    if (bundle.configuration.analysisFamily === "standard") {
      Object.assign(bundle.executionProvenance.diagnostics[0], {
        evidence: {
          totalCount: 1,
          sampleLimit: 5,
          samples: [{ detail: "Evidence", identity: "Unit", rowIndex: 0 }],
          truncated: false,
        },
        suggestedActions: [
          {
            id: "clear-group",
            label: "Clear Group",
            confirmationText: "Confirm",
            confirmationRequired: true,
            patch: { type: "clear-group" },
          },
        ],
      });
      Object.assign(bundle.diagnostics, {
        warnings: bundle.executionProvenance.diagnostics,
      });
      await rehash(bundle, true);
      assert.deepEqual(
        await parseAnalysisBundleV3(JSON.stringify(bundle)),
        bundle,
      );
    }
  }
});

for (const patchType of ["replace-row-order", "replace-horizon-order"] as const)
  test(`diagnostic ${patchType} preserves valid policy payload and rejects malformed nested fields`, async () => {
    const { result } = await fixture();
    const bundle = structuredClone(await buildAnalysisBundleV3(result));
    const action = {
      id: patchType,
      label: "Replace order",
      confirmationText: "Confirm",
      confirmationRequired: true,
      patch: {
        type: patchType,
        value: {
          kind: "columns",
          keys: [
            {
              column: "time",
              direction: "ascending",
              comparator: { type: "number" },
            },
          ],
        },
      },
    };
    Object.assign(bundle.executionProvenance.diagnostics[0], {
      suggestedActions: [action],
    });
    Object.assign(bundle.diagnostics, {
      warnings: bundle.executionProvenance.diagnostics,
    });
    await rehash(bundle, true);
    assert.deepEqual(
      await parseAnalysisBundleV3(JSON.stringify(bundle)),
      bundle,
    );
    for (const value of [
      null,
      { kind: "columns", keys: [] },
      {
        kind: "columns",
        keys: [
          {
            column: "time",
            direction: "ascending",
            comparator: { type: "number", extra: true },
          },
        ],
      },
    ]) {
      Object.assign(action.patch, { value });
      await rehash(bundle, true);
      await assert.rejects(
        () => parseAnalysisBundleV3(JSON.stringify(bundle)),
        /contract|order|keys|field/i,
      );
    }
  });

test("QUALITY F3: object entry admission matches the parser at the exact shared container boundary", () => {
  const object = Object.fromEntries(
    Array.from({ length: BUNDLE_JSON_LIMITS_V3.arrayLength }, (_, index) => [
      `k${index.toString(36)}`,
      0,
    ]),
  );
  assert.deepEqual(
    parseBundleJsonV3(JSON.stringify(captureBundleJsonV3(object))),
    object,
  );
  object.extra = 0;
  let propertyReads = 0;
  const input = new Proxy(object, {
    getOwnPropertyDescriptor(target, key) {
      propertyReads++;
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  assert.throws(
    () => captureBundleJsonV3(input),
    /container.*limit|size.*limit/i,
  );
  assert.equal(
    propertyReads,
    0,
    "reject too many object entries before copying properties",
  );
  assert.throws(
    () => parseBundleJsonV3(JSON.stringify(object)),
    /container.*limit|size.*limit/i,
  );
});

test("QUALITY F4: explicit null networkType rejects while Standard absence stays valid", async () => {
  const { result } = await fixture();
  const original = await buildAnalysisBundleV3(result);
  const changed = structuredClone(original);
  Object.assign(changed.modelData, { networkType: null });
  await rehash(changed, true);
  await assert.rejects(
    () => parseAnalysisBundleV3(JSON.stringify(changed)),
    /contract|family/i,
  );
  await assert.rejects(
    () => buildAnalysisBundleV3(boundResultFromBundleV3(changed)),
    /contract|family/i,
  );
  const absent = structuredClone(original);
  delete absent.modelData.networkType;
  await rehash(absent, true);
  assert.deepEqual(await parseAnalysisBundleV3(JSON.stringify(absent)), absent);
});
