import { bindOnaResultV3 } from "../lib/open-ena/model-v3/ona-result-binding";
import {
  buildOnaExecutionPlanV3,
  runOnaPlanV3,
} from "../lib/open-ena/model-v3/ona-adapter";
import { decodeCanonicalOnaConfigV3 } from "../lib/open-ena/model-v3/schema";
import { createDirectionalMask } from "../lib/open-ena/network-config";
import type { ParsedDataset } from "../lib/open-ena/types";
import {
  OPEN_ENA_RUNTIME_POLICY_VERSION_V3,
  OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3,
} from "../lib/open-ena/model-v3/types";
import assert from "node:assert/strict";
import test from "node:test";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import {
  bindResultV3,
  scientificResultHashPayloadV3,
} from "../lib/open-ena/model-v3/result-binding";
import { sha256CanonicalJsonV3 } from "../lib/open-ena/model-v3/canonical-json";
import {
  runOpenEnaInferenceV3,
  runOpenEnaTrajectoryInferenceV3,
} from "../lib/open-ena/inference-v2";
import {
  buildReferenceV2,
  fitReferenceSourceV3,
} from "../lib/open-ena/model-v3/reference-v2";
import {
  buildAnalysisBundleV3,
  parseAnalysisBundleV3,
} from "../lib/open-ena/analysis-bundle-v3";
import type { OpenEnaStandardReferenceV2 } from "../lib/open-ena/model-v3/types";
async function api() {
  const ai = await import("../lib/open-ena/ai-interpretation");
  const data = await import("../lib/open-ena/data-view-export");
  const sets = await import("../lib/open-ena/sets");
  const exports = await import("../lib/open-ena/export");
  const a = {
    buildAiInterpretationPayloadV3: ai.buildAiInterpretationPayloadV3,
    buildOpenEnaAiInterpretationRequestV3:
      ai.buildOpenEnaAiInterpretationRequestV3,
    buildDataViewV3: data.buildDataViewV3,
    buildDataViewRowsV3: data.buildDataViewRowsV3,
    buildHistoricalDataViewV3: data.buildHistoricalDataViewV3,
    captureAnalysisSetV3: sets.captureAnalysisSetV3,
    compareAnalysisSetsV3: sets.compareAnalysisSetsV3,
    upsertAnalysisSetV3: sets.upsertAnalysisSetV3,
    buildPresentationArtifactV3: exports.buildPresentationArtifactV3,
    applyPresentationV3: exports.applyPresentationV3,
  };
  for (const [name, fn] of Object.entries(a))
    assert.equal(typeof fn, "function", `Task23 must export ${name}`);
  return a;
}
async function fixture(
  modify?: Parameters<typeof bindingFixtureV3>[1],
  reference?: OpenEnaStandardReferenceV2,
) {
  const f = await bindingFixtureV3(
    reference ? "b".repeat(64) : undefined,
    modify,
    reference,
  );
  const result = await bindResultV3(
    f.plan,
    runStandardPlanV3(f.plan),
    {
      processedRows: f.plan.rows.length,
      maximumBufferedRows: 0,
      numericCellsAllocated: 120,
      peakBytesObservedOrBounded: 10240,
      observationMethod: "exact-counters-and-conservative-byte-bound",
    },
    f.compiled.diagnostics,
  );
  return { ...f, result };
}
const endpointControls = (f: Awaited<ReturnType<typeof fixture>>) => ({
  primaryGroup: { type: "string", value: "Control" } as const,
  secondaryGroup: { type: "string", value: "Treatment" } as const,
  axes: f.result.executionProvenance.projection.estimableAxes.slice(0, 2) as [
    string,
    string,
  ],
});
const trajectoryFixture = (
  model: "SeparateTrajectory" | "AccumulatedTrajectory" = "SeparateTrajectory",
) =>
  fixture((draft, data) => {
    draft.model = model;
    data.rows = data.rows.slice(0, 4).flatMap((row, i) =>
      [1, 2, 3, 4]
        .filter((h) => !(i === 3 && h === 2))
        .map((h) => ({
          ...row,
          horizon: h,
          time: h,
          A: ((i + h) % 3) + 1,
          B: ((i * h) % 4) + 1,
          C: ((i + 2 * h) % 5) + 1,
        })),
    );
  });

test("current consumers require an independent valid plan and reject coherent self-rehashed science", async () => {
  let divergentDraft: unknown;
  const a = await api(),
    f = await fixture((draft) => { divergentDraft = { ...structuredClone(draft), codes: [] }; }),
    other = await bindingFixtureV3("c".repeat(64));
  for (const consumer of [
    a.buildAiInterpretationPayloadV3,
    a.buildDataViewRowsV3,
    a.captureAnalysisSetV3,
  ]) {
    for (const p of [null, undefined, false, 0, "", {}, divergentDraft, other.plan])
      await assert.rejects(() => consumer(f.result, p));
    const forged = structuredClone(f.result);
    forged.set.points[0].SVD1 = 99;
    Object.assign(forged.binding, {
      scientificResultSha256: await sha256CanonicalJsonV3(
        scientificResultHashPayloadV3(forged),
      ),
    });
    await assert.rejects(() => consumer(forged, f.plan));
  }
});

test("AI local metadata restores semantic order and projection without runtime dictionaries", async () => {
  const a = await api(),
    f = await trajectoryFixture("AccumulatedTrajectory");
  const payload = await a.buildAiInterpretationPayloadV3(f.result, f.plan);
  assert.deepEqual(payload.configuration, f.result.configuration);
  assert.equal(
    payload.configurationSha256,
    f.result.binding.configurationSha256,
  );
  assert.equal(payload.currentness, "independent-plan-validated");
  assert.equal(payload.stale, false);
  assert.equal(payload.ordering.unitSequences[0].steps[1].trajectoryOrdinal, 1);
  assert.deepEqual(
    payload.ordering.unitSequences[0].steps[1].horizon[0].value,
    { type: "number", value: 2 },
  );
  assert.doesNotMatch(
    JSON.stringify(payload),
    /__open_ena_(?:unit|horizon|code|edge)_v3/u,
  );
  assert.deepEqual(payload.capabilityStatus, f.result.capabilityStatus);
  assert.equal(payload.projection.authority, "target-fitted");
  assert.equal(payload.scope, "local-provenance-review");
});

test("typed Data View restores source columns and separates endpoint multi-Horizon metadata", async () => {
  const a = await api(),
    f = await fixture((draft, data) => {
      draft.unitColumns = ["Student", "Trajectory ordinal"];
      data.headers.push("Student", "Trajectory ordinal");
      data.rows = data.rows.flatMap((row, i) =>
        [1, 2].map((h) => ({
          ...row,
          Student: i === 0 ? "Ava" : i === 1 ? 1 : i === 2 ? "1" : row.unit,
          "Trajectory ordinal": i,
          horizon: h,
          time: h,
        })),
      );
    });
  const view = await a.buildDataViewV3(f.result, f.plan),
    rows = await a.buildDataViewRowsV3(f.result, f.plan);
  assert.equal(rows[0].Student, "Ava");
  assert.equal(rows[0]["Trajectory ordinal"], 0);
  assert.equal(rows[1].Student, 1);
  assert.equal(rows[2].Student, "1");
  assert.equal(rows[0][view.metadataColumns.trajectoryOrdinal], null);
  assert.equal(rows[0].horizon, null);
  assert.equal(rows[0][view.metadataColumns.observedHorizons], null);
  assert.equal(rows[0][view.metadataColumns.observedSourceRowIndices], null);
  assert.deepEqual(
    view.sourceTraversal.map((r) => r.sourceRowIndex),
    f.result.executionProvenance.ordering.runtimeSourceRowIndices,
  );
  assert.doesNotMatch(JSON.stringify(view), /__open_ena_/u);
  assert.equal(
    a.buildHistoricalDataViewV3(f.result).currentness,
    "not-established",
  );
});

test("trajectory Data View preserves actual source membership and fitted ordinals including missing steps", async () => {
  const a = await api();
  for (const model of [
    "SeparateTrajectory",
    "AccumulatedTrajectory",
  ] as const) {
    const f = await trajectoryFixture(model),
      view = await a.buildDataViewV3(f.result, f.plan);
    assert.equal(view.rows.length, 15);
    const rows = view.rows.filter((row) => row.unit === "u4");
    assert.deepEqual(
      rows.map((r) => r.horizon),
      [1, 3, 4],
    );
    assert.deepEqual(
      rows.map((r) => r[view.metadataColumns.trajectoryOrdinal]),
      [0, 1, 2],
    );
    assert.deepEqual(
      rows.map((r) => r[view.metadataColumns.observedSourceRowIndices]),
      [null, null, null],
    );
    assert.deepEqual(
      rows.map(
        (r) =>
          JSON.parse(String(r[view.metadataColumns.observedHorizons]))[0][0]
            .value.value,
      ),
      [1, 3, 4],
    );
    assert.match(view.sourceIndexMeaning, /observed.*membership/i);
    assert.match(view.sourceIndexMeaning, /not.*contribution/i);
  }
});

test("presentation stores all controls, maps SOURCE Codes explicitly, roundtrips optional state and binds exact science", async () => {
  const a = await api(),
    f = await fixture(),
    hash = f.result.binding.scientificResultSha256;
  const state = {
    hiddenCodes: ["A"],
    hiddenGroups: [{ type: "string", value: "Control" } as const],
    codeColors: { A: "#ff0000" },
    groupColors: [
      {
        group: { type: "string", value: "Control" } as const,
        color: "#112233",
      },
    ],
    layerOptions: {
      showPoints: false,
      showMeans: true,
      showLabels: false,
      showNetworks: true,
      showTrajectories: false,
      endpointsOnly: true,
      showIntervals: false,
    },
    nodeOverrides: [{ code: "A", coordinates: { SVD1: 2 } }],
    dimensions: ["SVD1", "SVD2"],
    camera3d: {
      center: { x: 0, y: 0, z: 0 },
      eye: { x: 1, y: 2, z: 3 },
      up: { x: 0, y: 0, z: 1 },
      projection: { type: "orthographic" as const },
    },
  };
  const artifact = a.buildPresentationArtifactV3(f.result, state);
  assert.deepEqual(artifact.hiddenCodes, [
    f.result.executionProvenance.labels.codes.find(
      (c) => c.sourceColumn === "A",
    )!.column,
  ]);
  assert.deepEqual(artifact.layerOptions, state.layerOptions);
  assert.deepEqual(artifact.groupColors, state.groupColors);
  const applied = a.applyPresentationV3(hash, artifact);
  assert.equal(applied.status, "applied");
  assert.equal(
    a.applyPresentationV3("f".repeat(64), artifact).status,
    "unapplied-preset",
  );
  assert.deepEqual(
    (
      await parseAnalysisBundleV3(
        JSON.stringify(
          await buildAnalysisBundleV3(f.result, { presentation: artifact }),
        ),
      )
    ).presentation,
    artifact,
  );
  const old = { ...artifact };
  delete old.layerOptions;
  delete old.groupColors;
  delete old.camera3d;
  assert.deepEqual(
    (
      await parseAnalysisBundleV3(
        JSON.stringify(
          await buildAnalysisBundleV3(f.result, { presentation: old }),
        ),
      )
    ).presentation,
    old,
  );
  assert.equal(f.result.binding.scientificResultSha256, hash);
  assert.notEqual(applied.presentation, artifact);
  assert.throws(() =>
    a.buildPresentationArtifactV3(f.result, {
      ...state,
      hiddenCodes: ["Code 1"],
    }),
  );
  for (const bad of [
    { ...artifact, layerOptions: { ...state.layerOptions, unknown: true } },
    {
      ...artifact,
      groupColors: [{ group: { type: "number", value: 1 }, color: "#000" }],
    },
    { ...artifact, dimensions: [] },
  ])
    await assert.rejects(() =>
      buildAnalysisBundleV3(f.result, { presentation: bad as any }),
    );
});

test("retained sets whitelist derived geometry, preserve source/reference relation, compare and enforce six-set retention", async () => {
  const a = await api(),
    source = await fixture();
  const ref = await buildReferenceV2(await fitReferenceSourceV3(source.plan), {
    currentPlan: source.plan,
    displayName: "Source",
  });
  const target = await fixture((draft, data) => {
    draft.rotation = {
      type: "reference",
      referenceId: ref.referenceId,
      expectedContentSha256: ref.contentSha256,
    };
    data.rows[0].B = 5;
  }, ref);
  const first = await a.captureAnalysisSetV3(source.result, source.plan),
    second = await a.captureAnalysisSetV3(target.result, target.plan);
  assert.equal(first.schemaVersion, 3);
  assert.equal(Object.hasOwn(first, "generatedReference"), false);
  assert.equal(Object.hasOwn(first, "result"), false);
  assert.equal(Object.hasOwn(first, "sourceProofSha256"), false);
  assert.equal(Object.hasOwn(first, "rawRows"), false);
  assert.equal(Object.hasOwn(first, "rowConnectionCounts"), false);
  assert.equal(first.points.length, source.result.set.points.length);
  assert.doesNotMatch(JSON.stringify(first), /__open_ena_/u);
  const comparison = a.compareAnalysisSetsV3(first, second);
  assert.equal(comparison.primary.unitCount, 5);
  assert.equal(comparison.secondary.unitCount, 5);
  assert.equal(comparison.edges.length, source.result.set.adjacencyKey.length);
  assert.equal(
    comparison.referenceSource.configurationSha256,
    source.result.binding.configurationSha256,
  );
  const other = await fixture((_, data) => {
    data.rows[0].A = 7;
  });
  const incompatible = await a.captureAnalysisSetV3(other.result, other.plan);
  assert.throws(
    () => a.compareAnalysisSetsV3(first, incompatible),
    /geometry|source|compatible/i,
  );
  let sets: (typeof first)[] = [];
  for (let i = 0; i < 6; i++)
    sets = a.upsertAnalysisSetV3(sets, { ...first, id: `set-${i}` });
  assert.throws(
    () => a.upsertAnalysisSetV3(sets, { ...first, id: "seventh" }),
    /six|6|at most/i,
  );
  assert.equal(
    a.upsertAnalysisSetV3(sets, { ...first, id: "set-0" }).length,
    6,
  );
  const trajectory = await trajectoryFixture();
  await assert.rejects(
    () => a.captureAnalysisSetV3(trajectory.result, trajectory.plan),
    /EndPoint/i,
  );
});

test("native endpoint AI wire retains aggregate N3, exact numbers, roles, private authority and existing route reader", async () => {
  const a = await api(),
    f = await fixture((_, data) => {
      data.rows = data.rows
        .slice(0, 4)
        .flatMap((r, i) =>
          [0, 1].map((j) => ({ ...r, unit: `u${i}-${j}`, A: Number(r.A) + j })),
        );
    });
  const controls = endpointControls(f),
    inference = await runOpenEnaInferenceV3(f.result, f.plan, controls);
  const request = await a.buildOpenEnaAiInterpretationRequestV3(
    f.result,
    f.plan,
    { locale: "en", inference, controls },
  );
  const ai = await import("../lib/open-ena/ai-interpretation");
  assert.deepEqual(ai.parseOpenEnaAiInterpretationRequestV2(request), request);
  assert.equal(
    request.evidence.inference[0].pRaw,
    inference.inference.rows[0].pRaw,
  );
  assert.equal(request.evidence.descriptive.groups[0].n, 4);
  assert.ok(
    new TextEncoder().encode(JSON.stringify(request)).length < 48 * 1024,
  );
  assert.doesNotMatch(
    JSON.stringify(request),
    /Control|Treatment|u0-0|identityDictionary|sourceProof|__open_ena_|configurationSha256/u,
  );
  await assert.rejects(
    () =>
      a.buildOpenEnaAiInterpretationRequestV3(f.result, f.plan, {
        locale: "en",
        inference: structuredClone(inference),
        controls,
      }),
    /authority/i,
  );
  const small = await fixture(),
    smallControls = endpointControls(small),
    smallInference = await runOpenEnaInferenceV3(
      small.result,
      small.plan,
      smallControls,
    );
  const redacted = await a.buildOpenEnaAiInterpretationRequestV3(
    small.result,
    small.plan,
    { locale: "en", inference: smallInference, controls: smallControls },
  );
  assert.equal(redacted.evidence.inference.length, 0);
  assert.equal(redacted.evidence.descriptive.groups.length, 0);
  assert.ok(
    redacted.evidence.boundaries.includes("minimum-aggregate-disclosure"),
  );
});

test("native repeated AI resolves selected followup indexes separately from global frame indexes", async () => {
  const a = await api(),
    f = await trajectoryFixture();
  const periods = [1, 3, 4].map((value) => [
    { column: "horizon", value: { type: "number" as const, value } },
  ]);
  const controls = {
    axes: endpointControls(f).axes,
    identityConfirmed: true,
    request: {
      kind: "trajectory-repeated-periods" as const,
      group: { type: "string" as const, value: "Control" },
      periods,
      cohortPolicy: "all-period-complete" as const,
      posthocContrasts: "all-period-pairs" as const,
    },
  };
  const inference = await runOpenEnaTrajectoryInferenceV3(
    f.result,
    f.plan,
    controls,
  );
  const wire = await a.buildOpenEnaAiInterpretationRequestV3(f.result, f.plan, {
    locale: "en",
    inference,
    controls,
  });
  assert.equal(wire.evidence.scope.kind, "trajectory-repeated-periods");
  if (wire.evidence.scope.kind === "trajectory-repeated-periods")
    assert.deepEqual(wire.evidence.scope.selectedPeriodIndices, [0, 2, 3]);
  const pairs = [
    ...wire.evidence.inference,
    ...wire.evidence.inferenceOmissions,
  ].filter((r) => r.familyRole === "posthoc-family");
  assert.equal(pairs.length, 6);
  assert.ok(
    pairs.some(
      (r) =>
        "earlierPeriodIndex" in r &&
        r.earlierPeriodIndex === 2 &&
        r.laterPeriodIndex === 3,
    ),
  );
  assert.ok(
    pairs.every(
      (r) => !("earlierPeriodIndex" in r) || r.earlierPeriodIndex !== 1,
    ),
  );
});

test("Means AI local payload restores typed contrast levels without private Unit tokens", async () => {
  const a = await api(),
    f = await fixture((draft) => {
      draft.rotation = {
        type: "means",
        centerAlignToOrigin: true,
        negativeLevel: { type: "string", value: "Control" },
        positiveLevel: { type: "string", value: "Treatment" },
      };
    });
  const local = await a.buildAiInterpretationPayloadV3(f.result, f.plan);
  assert.doesNotMatch(JSON.stringify(local), /__open_ena_(?:unit|group)_v3/u);
  assert.deepEqual(local.projection.meansBinding?.negative.level, {
    type: "string",
    value: "Control",
  });
  assert.equal(local.projection.meansBinding?.negative.unitCount, 2);
});

test("Reference AI metadata separates source fit from rank-zero target and never exports a new fit", async () => {
  const a = await api(),
    source = await fixture((draft) => {
      draft.rotation = {
        type: "means",
        centerAlignToOrigin: true,
        negativeLevel: { type: "string", value: "Control" },
        positiveLevel: { type: "string", value: "Treatment" },
      };
    });
  const ref = await buildReferenceV2(await fitReferenceSourceV3(source.plan), {
    currentPlan: source.plan,
    displayName: "Means reference",
  });
  const target = await fixture((draft, data) => {
    draft.rotation = {
      type: "reference",
      referenceId: ref.referenceId,
      expectedContentSha256: ref.contentSha256,
    };
    data.rows = data.rows.map((row) => ({ ...row, A: 1, B: 2, C: 3 }));
  }, ref);
  const local = await a.buildAiInterpretationPayloadV3(
    target.result,
    target.plan,
  );
  assert.equal(local.projection.authority, "fixed-reference-target-projection");
  assert.equal(local.projection.sourceFit?.method, "means");
  assert.equal(local.projection.sourceFit?.observationCount, 5);
  assert.equal(
    local.projection.reference?.source.configurationSha256,
    source.result.binding.configurationSha256,
  );
  assert.equal(
    local.configurationSha256,
    target.result.binding.configurationSha256,
  );
  assert.match(local.projection.varianceMeaning, /target variance along fixed/);
  assert.doesNotMatch(JSON.stringify(local), /__open_ena_/u);
});

test("legitimate reserved-looking source values and colliding source/axis/Code namespaces remain lossless", async () => {
  const a = await api(),
    value = "__open_ena_unit_v3_000000";
  const f = await fixture((draft, data) => {
    draft.unitColumns = ["SVD1"];
    draft.codes = ["Code 2", "B", "C"];
    data.headers.push("SVD1", "Code 2");
    data.rows = data.rows.map((row, i) => ({
      ...row,
      SVD1: i === 0 ? value : i === 1 ? true : i === 2 ? "true" : row.unit,
      "Code 2": row.A,
    }));
  });
  const view = await a.buildDataViewV3(f.result, f.plan);
  assert.equal(view.rows[0].SVD1, value);
  assert.equal(view.rows[1].SVD1, true);
  assert.equal(view.rows[2].SVD1, "true");
  assert.notEqual(view.coordinateColumns.SVD1, "SVD1");
  assert.equal(typeof view.rows[0][view.coordinateColumns.SVD1], "number");
  const state = {
    hiddenCodes: ["Code 2"],
    hiddenGroups: [],
    codeColors: { "Code 2": "red" },
    nodeOverrides: [],
    dimensions: ["SVD1"],
  };
  const artifact = a.buildPresentationArtifactV3(f.result, state),
    mapped = f.result.executionProvenance.labels.codes.find(
      (e) => e.sourceColumn === "Code 2",
    )!.column;
  assert.deepEqual(artifact.hiddenCodes, [mapped]);
  assert.deepEqual(Object.keys(artifact.codeColors), [mapped]);
  const set = await a.captureAnalysisSetV3(f.result, f.plan);
  assert.equal(set.points[0].unit[0].value.value, value);
});

test("MovingStanza Data View exports retained zero-based source Horizon/ordinal mappings, without point membership claims", async () => {
  const a = await api(),
    f = await fixture((draft, data) => {
      draft.windowType = "MovingStanzaWindow";
      draft.movingStanza = {
        backward: { kind: "finite", value: 1 },
        forward: { kind: "finite", value: 0 },
        rowOrder: {
          kind: "columns",
          keys: [
            {
              column: "time",
              direction: "descending",
              comparator: { type: "number" },
            },
          ],
        },
      };
      data.rows = data.rows.map((row, i) => ({ ...row, time: i + 1 }));
    });
  const view = await a.buildDataViewV3(f.result, f.plan),
    order = f.result.executionProvenance.ordering.resolvedRowOrder;
  assert.equal(order.type, "within-horizon-order");
  if (order.type !== "within-horizon-order") return;
  const horizons = new Map(
    f.plan.identityDictionary.horizons.map((h) => [h.token, h.fields]),
  );
  for (const entry of view.sourceTraversal) {
    const expected: (typeof order.mappings)[number] = order.mappings.find(
      (m) => m.sourceRowIndex === entry.sourceRowIndex,
    )!;
    assert.deepEqual(entry.horizon, horizons.get(expected.horizonToken));
    assert.equal(entry.withinHorizonOrdinal, expected.withinHorizonOrdinal);
  }
  assert.ok(
    view.rows.every(
      (row) => row[view.metadataColumns.observedSourceRowIndices] === null,
    ),
  );
});

test("AI consumes real independent, paired and repeated trajectory receipts including available N3 evidence and selected indexes", async () => {
  const a = await api(),
    f = await fixture((draft, data) => {
      draft.model = "AccumulatedTrajectory";
      data.rows = data.rows.slice(0, 4).flatMap((row, i) =>
        [0, 1].flatMap((j) =>
          [1, 2, 3, 4].map((h) => ({
            ...row,
            unit: `u${i}-${j}`,
            horizon: h,
            time: h,
            A: ((i + h + j) % 3) + 1,
            B: ((i * h + j) % 4) + 1,
            C: ((i + 2 * h + j) % 5) + 1,
          })),
        ),
      );
    });
  const identity = (value: number) => [
    { column: "horizon", value: { type: "number" as const, value } },
  ];
  const group = { type: "string" as const, value: "Control" },
    axes = endpointControls(f).axes;
  const requests = [
    {
      kind: "trajectory-independent-period" as const,
      primaryGroup: group,
      secondaryGroup: { type: "string" as const, value: "Treatment" },
      period: identity(3),
    },
    {
      kind: "trajectory-paired-periods" as const,
      group,
      earlierPeriod: identity(1),
      laterPeriod: identity(3),
      cohortPolicy: "pairwise-complete" as const,
    },
    {
      kind: "trajectory-repeated-periods" as const,
      group,
      periods: [1, 3, 4].map(identity),
      cohortPolicy: "all-period-complete" as const,
      posthocContrasts: "all-period-pairs" as const,
    },
  ];
  for (const request of requests) {
    const controls = { axes, identityConfirmed: true, request };
    const inference = await runOpenEnaTrajectoryInferenceV3(
      f.result,
      f.plan,
      controls,
    );
    const wire = await a.buildOpenEnaAiInterpretationRequestV3(
      f.result,
      f.plan,
      { locale: "en", inference, controls },
    );
    assert.equal(wire.evidence.kind, request.kind);
    assert.ok(wire.evidence.descriptive.groups.every((g) => g.n === 4));
    const available = wire.evidence.inference;
    assert.ok(available.length > 0);
    if (inference.inference.kind === "trajectory-repeated-periods") {
      const row = inference.inference.followupRows.find(
        (r) =>
          r.earlierPeriodIndex === 1 &&
          r.laterPeriodIndex === 2 &&
          r.status === "available" &&
          r.nNonzero >= 3,
      );
      if (row) {
        const member = available.find(
          (m) =>
            m.test === "wilcoxon-signed-rank" &&
            m.familyRole === "posthoc-family" &&
            m.earlierPeriodIndex === 2 &&
            m.laterPeriodIndex === 3 &&
            m.axisRole === `axis-${row.axisIndex + 1}`,
        );
        assert.ok(member);
        assert.equal(member.pRaw, row.pRaw);
        assert.equal(member.pHolm, row.pHolm);
      }
    }
    assert.doesNotMatch(
      JSON.stringify(wire),
      /u0-0|Control|Treatment|__open_ena_/u,
    );
    await assert.rejects(
      () =>
        a.buildOpenEnaAiInterpretationRequestV3(f.result, f.plan, {
          locale: "en",
          inference: structuredClone(inference),
          controls,
        }),
      /authority/i,
    );
  }
});

test("AI review binds native context locally and snapshots inputs; display changes leave the wire and scientific hashes invariant", async () => {
  const a = await api(),
    ai = await import("../lib/open-ena/ai-interpretation"),
    f = await fixture(),
    controls = endpointControls(f),
    inference = await runOpenEnaInferenceV3(f.result, f.plan, controls);
  const mutableResult = structuredClone(f.result),
    mutablePlan = structuredClone(f.plan),
    mutableControls = structuredClone(controls);
  const pending = ai.buildAiInterpretationReviewV3(mutableResult, mutablePlan, {
    locale: "en",
    inference,
    controls: mutableControls,
  });
  mutableResult.set.points[0].SVD1 = 900;
  Object.assign(mutablePlan.header, { configurationSha256: "f".repeat(64) });
  mutableControls.axes.reverse();
  const review = await pending;
  assert.deepEqual(review.binding, f.result.binding);
  assert.deepEqual(review.context, {
    axes: controls.axes,
    primaryGroup: controls.primaryGroup,
    secondaryGroup: controls.secondaryGroup,
  });
  const hidden = await a.buildOpenEnaAiInterpretationRequestV3(
    f.result,
    f.plan,
    {
      locale: "en",
      inference,
      controls: {
        ...controls,
        hiddenCodes: ["A", "B", "C"],
        hiddenGroups: [controls.primaryGroup, controls.secondaryGroup],
      },
    },
  );
  assert.deepEqual(hidden, review.request);
  assert.equal(Object.hasOwn(review.request, "context"), false);
  assert.equal(
    Object.hasOwn(review.request.binding, "configurationSha256"),
    false,
  );
  const other = await bindingFixtureV3("d".repeat(64));
  await assert.rejects(
    () =>
      a.buildOpenEnaAiInterpretationRequestV3(f.result, other.plan, {
        locale: "en",
        inference,
        controls,
      }),
    /stale/i,
  );
  await assert.rejects(
    () =>
      a.buildOpenEnaAiInterpretationRequestV3(f.result, f.plan, {
        locale: "en",
        inference,
        controls: {
          ...controls,
          primaryGroup: controls.secondaryGroup,
          secondaryGroup: controls.primaryGroup,
        },
      }),
    /context/i,
  );
});

async function boundOna(hash = "d".repeat(64)) {
  const codes = ["A", "B", "C"];
  const directionalMask = createDirectionalMask(codes);
  directionalMask.enabled[0][1] = false;
  const configuration = decodeCanonicalOnaConfigV3({
    schemaVersion: 3,
    analysisFamily: "ona",
    contracts: {
      validationContractVersion: OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3,
      runtimePolicyVersion: OPEN_ENA_RUNTIME_POLICY_VERSION_V3,
    },
    units: {
      columns: ["unit"],
      group: { type: "stable-metadata", column: "group" },
    },
    horizons: { columns: ["horizon"] },
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
            column: "time",
            direction: "ascending",
            comparator: { type: "number" },
          },
        ],
      },
    },
    rotation: { type: "svd", centerAlignToOrigin: true },
    directionalMask,
  });
  const dataset: ParsedDataset = {
    name: "ona-methods.csv",
    source: "upload",
    sizeBytes: 512,
    headers: ["unit", "horizon", "time", "group", ...codes],
    rows: [
      { unit: "u1", horizon: "h1", time: 1, group: "g1", A: 2, B: 0, C: 1 },
      { unit: "u2", horizon: "h1", time: 2, group: "g2", A: 0, B: 3, C: 1 },
      { unit: "u1", horizon: "h2", time: 1, group: "g1", A: 0, B: 2, C: 2 },
      { unit: "u3", horizon: "h2", time: 2, group: "g1", A: 1, B: 1, C: 0 },
    ],
  };
  const plan = await buildOnaExecutionPlanV3(dataset, hash, configuration);
  const result = await bindOnaResultV3(plan, runOnaPlanV3(plan), {
    processedRows: dataset.rows.length,
    maximumRetainedRowsAfterChunk: 0,
    bufferedRowsPeakUpperBound: Math.min(
      dataset.rows.length,
      plan.header.resourceEstimate.estimatedRetainedWindowRows + 1,
    ),
    numericCellsUpperBound: plan.operationalAdmission.totalNumericCells,
    peakBytesUpperBound: plan.operationalAdmission.totalPeakBytes,
    observationMethod: "dimension-bounds-and-chunk-boundary-stream-state",
  });
  return { plan, result };
}

test("ONA remains blocked for AI and retained sets while typed Data View remains descriptive and current-guarded", async () => {
  const a = await api(),
    f = await boundOna();
  await assert.rejects(
    () => a.buildAiInterpretationPayloadV3(f.result, f.plan),
    /ai-interpretation.*blocked/i,
  );
  await assert.rejects(
    () => a.captureAnalysisSetV3(f.result, f.plan),
    /ONA.*blocked/i,
  );
  const view = await a.buildDataViewV3(f.result, f.plan);
  assert.equal(view.rows.length, 3);
  assert.equal(view.rows[0].unit, "u1");
  assert.doesNotMatch(JSON.stringify(view), /__open_ena_/u);
  const other = await boundOna("e".repeat(64));
  await assert.rejects(() => a.buildDataViewV3(f.result, other.plan), /stale/i);
});

test("native AI wire does not invent a trajectory continuity label from implementation-only frame index order", async () => {
  const ai = await import("../lib/open-ena/ai-interpretation");
  const f = await fixture((draft, data) => {
    draft.model = "SeparateTrajectory";
    draft.groupColumn = null;
    data.rows = data.rows.slice(0, 4).flatMap((r, i) =>
      [1, 2, 3].map((h) => ({
        ...r,
        horizon: h,
        time: h,
        A: ((i + h) % 3) + 1,
        B: ((i * h) % 4) + 1,
        C: ((i + 2 * h) % 5) + 1,
      })),
    );
  });
  const periods = [1, 2, 3].map((value) => [
    { column: "horizon", value: { type: "number" as const, value } },
  ]);
  const controls = {
    axes: endpointControls(f).axes,
    identityConfirmed: true,
    request: {
      kind: "trajectory-repeated-periods" as const,
      group: null,
      periods,
      cohortPolicy: "all-period-complete" as const,
      posthocContrasts: "all-period-pairs" as const,
    },
  };
  const inference = await runOpenEnaTrajectoryInferenceV3(
      f.result,
      f.plan,
      controls,
    ),
    review = await ai.buildAiInterpretationReviewV3(f.result, f.plan, {
      locale: "en",
      inference,
      controls,
    });
  assert.deepEqual(
    review.request.evidence.descriptive.trajectory?.groupPeriods,
    [],
  );
  assert.match(review.wireLimitations, /continuity|precedence/i);
  assert.equal(
    "unitSequences" in review.context && review.context.unitSequences?.length,
    4,
  );
});

test("native independent AI period continuity matches bound centroids and blocks a hidden previous N<3 aggregate", async () => {
  const a = await api();
  for (const sparse of [false, true]) {
    const f = await fixture((draft, data) => {
      draft.model = "SeparateTrajectory";
      data.rows = data.rows.slice(0, 4).flatMap((row, i) =>
        [0, 1].flatMap((j) =>
          [1, 2, 3]
            .filter((h) => !sparse || h !== 1 || (i < 2 && j === 0))
            .map((h) => ({
              ...row,
              unit: `u${i}-${j}`,
              horizon: h,
              time: h,
              A: ((i + h + j) % 3) + 1,
              B: ((i * h + j) % 4) + 1,
              C: ((i + 2 * h + j) % 5) + 1,
            })),
        ),
      );
    });
    const controls = {
      axes: endpointControls(f).axes,
      identityConfirmed: true,
      request: {
        kind: "trajectory-independent-period" as const,
        primaryGroup: { type: "string" as const, value: "Control" },
        secondaryGroup: { type: "string" as const, value: "Treatment" },
        period: [
          { column: "horizon", value: { type: "number" as const, value: 2 } },
        ],
      },
    };
    const inference = await runOpenEnaTrajectoryInferenceV3(
      f.result,
      f.plan,
      controls,
    );
    const request = () =>
      a.buildOpenEnaAiInterpretationRequestV3(f.result, f.plan, {
        locale: "en",
        inference,
        controls: {
          axes: controls.axes,
          identityConfirmed: true,
          request: controls.request,
        },
      });
    if (sparse) {
      await assert.rejects(request, /previous aggregate of at least 3/i);
      continue;
    }
    const wire = await request(),
      rows = wire.evidence.descriptive.trajectory!.groupPeriods;
    assert.equal(rows.length, 2);
    const group = f.result.executionProvenance.identityDictionary.groups.find(
      (g) => g.fields[0].value.value === "Control",
    )!.displayLabel;
    const horizon = (v: number) =>
      f.result.executionProvenance.identityDictionary.horizons.find(
        (h) => h.fields[0].value.value === v,
      )!.displayLabel;
    const mean = (v: number) => {
      const points = f.result.set.points.filter(
        (p) => p.Group === group && p.Horizon === horizon(v),
      );
      return (
        points.reduce((n, p) => n + Number(p[controls.axes[0]]), 0) /
        points.length
      );
    };
    const primary = rows.find((row) => row.groupRole === "primary")!;
    assert.equal(primary.continuityStatus, "connected");
    assert.equal(primary.centroid?.axis1, mean(2));
    assert.equal(primary.delta?.axis1, mean(2) - mean(1));
  }
});

test("presentation Group validation uses typed identity indexes with linear membership work", async () => {
  const a = await api(),
    f = await fixture((_, data) => {
      data.rows = Array.from({ length: 200 }, (_, i) => ({
        ...data.rows[i % 5],
        unit: `unit-${i}`,
        group: `group-${i}`,
        A: (i % 3) + 1,
        B: (i % 4) + 1,
        C: (i % 5) + 1,
      }));
    });
  const groups = f.result.executionProvenance.identityDictionary.groups.map(
    (g) => g.fields[0].value,
  );
  const original = JSON.stringify;
  let count = 0;
  JSON.stringify = function (value: unknown, ...args: any[]) {
    if (typeof value === "string" && /^group-\d+$/u.test(value)) count++;
    return (original as any)(value, ...args);
  } as typeof JSON.stringify;
  try {
    const artifact = a.buildPresentationArtifactV3(f.result, {
      hiddenCodes: [],
      hiddenGroups: groups,
      codeColors: {},
      nodeOverrides: [],
      dimensions: ["SVD1"],
      groupColors: groups.map((group) => ({ group, color: "red" })),
    });
    assert.equal(artifact.hiddenGroups.length, 200);
    assert.equal(artifact.groupColors?.length, 200);
    assert.ok(
      count < 5000,
      `Expected linear Group serialization work, observed ${count}`,
    );
  } finally {
    JSON.stringify = original;
  }
});

test("retained set and Data View snapshots are detached, forged retained sets reject, and rank-one sets stay unavailable", async () => {
  const a = await api(),
    f = await fixture();
  const result = structuredClone(f.result),
    plan = structuredClone(f.plan),
    options = { id: "captured", name: "Original" };
  const pending = a.captureAnalysisSetV3(result, plan, options);
  options.name = "Changed";
  result.set.points[0].SVD1 = 100;
  Object.assign(plan.header, { executionPlanSha256: "f".repeat(64) });
  const set = await pending;
  assert.equal(set.name, "Original");
  assert.equal(set.points[0].coordinates.SVD1, f.result.set.points[0].SVD1);
  assert.ok(Object.isFrozen(set.points[0].coordinates));
  assert.throws(
    () => a.compareAnalysisSetsV3(set, { ...set, id: "borrowed" }),
    /authority/i,
  );
  const rankOne = await fixture((_, data) => {
    data.rows = data.rows
      .slice(0, 4)
      .map((row, i) => ({ ...row, A: i % 2 ? 2 : 1, B: i % 2 ? 1 : 2, C: 1 }));
  });
  await assert.rejects(
    () => a.captureAnalysisSetV3(rankOne.result, rankOne.plan),
    /two supported retained/i,
  );
  const view = await a.buildDataViewV3(rankOne.result, rankOne.plan);
  assert.equal(view.rows.length, 4);
});

test("AI independent period never turns incomparable frame neighbors into a chronology or missing-step claim", async () => {
  const a = await api(),
    f = await fixture((draft, data) => {
      draft.model = "SeparateTrajectory";
      data.rows = data.rows
        .slice(0, 4)
        .flatMap((r, i) =>
          [0, 1, 2].flatMap((j) =>
            [1, i < 2 ? 2 : 3, 4].map((h) => ({
              ...r,
              unit: `unit-${i}-${j}`,
              horizon: h,
              time: h === 3 ? 2 : h,
              A: ((i + h + j) % 3) + 1,
              B: ((i * h + j) % 4) + 1,
              C: ((i + 2 * h + j) % 5) + 1,
            })),
          ),
        );
    });
  const controls = {
    axes: endpointControls(f).axes,
    identityConfirmed: true,
    request: {
      kind: "trajectory-independent-period" as const,
      primaryGroup: { type: "string" as const, value: "Control" },
      secondaryGroup: { type: "string" as const, value: "Treatment" },
      period: [
        { column: "horizon", value: { type: "number" as const, value: 3 } },
      ],
    },
  };
  const inference = await runOpenEnaTrajectoryInferenceV3(
    f.result,
    f.plan,
    controls,
  );
  assert.equal(inference.inference.kind, "trajectory-independent-period");
  assert.deepEqual(
    inference.context.frameIndexHorizons.map((h) => h[0].value.value),
    [1, 2, 3, 4],
  );
  await assert.rejects(
    () =>
      a.buildOpenEnaAiInterpretationRequestV3(f.result, f.plan, {
        locale: "en",
        inference,
        controls,
      }),
    /incomparable|precedence/i,
  );
  assert.equal(f.result.capabilityStatus["build-model"], "available");
});

test("AI descriptive all-frame completeness stays distinct from selected repeated-inference completeness", async () => {
  const a = await api(),
    f = await fixture((draft, data) => {
      draft.model = "SeparateTrajectory";
      draft.groupColumn = null;
      data.rows = data.rows
        .slice(0, 4)
        .flatMap((r, i) =>
          [1, 2, 3, 4]
            .filter((h) => !(i === 3 && h === 2))
            .map((h) => ({
              ...r,
              horizon: h,
              time: h,
              A: ((i + h) % 3) + 1,
              B: ((i * h) % 4) + 1,
              C: ((i + 2 * h) % 5) + 1,
            })),
        );
    });
  const controls = {
    axes: endpointControls(f).axes,
    identityConfirmed: true,
    request: {
      kind: "trajectory-repeated-periods" as const,
      group: null,
      periods: [1, 3, 4].map((value) => [
        { column: "horizon", value: { type: "number" as const, value } },
      ]),
      cohortPolicy: "all-period-complete" as const,
      posthocContrasts: "all-period-pairs" as const,
    },
  };
  const inference = await runOpenEnaTrajectoryInferenceV3(
    f.result,
    f.plan,
    controls,
  );
  assert.equal(inference.comparison.completeUnitCount, 4);
  const wire = await a.buildOpenEnaAiInterpretationRequestV3(f.result, f.plan, {
    locale: "en",
    inference,
    controls,
  });
  assert.equal(wire.evidence.descriptive.trajectory?.periodCount, 4);
  assert.equal(wire.evidence.descriptive.trajectory?.completeEntityCount, 3);
  for (const row of wire.evidence.inference)
    if (row.test === "friedman") assert.equal(row.nComplete, 4);
});

test("AI review and wire reject forged receipt handles without invoking ordinary kind getters", async () => {
  const ai = await import("../lib/open-ena/ai-interpretation");
  for (const consumer of [
    ai.buildAiInterpretationReviewV3,
    ai.buildOpenEnaAiInterpretationRequestV3,
  ]) {
    for (const kind of [
      "open-ena-endpoint-inference",
      "open-ena-trajectory-inference",
    ]) {
      for (const shape of [
        "own-accessor",
        "inherited-accessor",
        "get-proxy",
      ] as const) {
        let ordinaryGets = 0;
        const accessor = Object.defineProperty({}, "kind", {
          enumerable: true,
          get() {
            ordinaryGets += 1;
            return kind;
          },
        });
        const inference =
          shape === "own-accessor"
            ? accessor
            : shape === "inherited-accessor"
              ? Object.create(accessor)
              : new Proxy(
                  { kind },
                  {
                    get(target, key, receiver) {
                      ordinaryGets += 1;
                      return Reflect.get(target, key, receiver);
                    },
                  },
                );
        await assert.rejects(
          () =>
            consumer({}, {}, {
              locale: "en",
              inference,
              controls: {},
            } as never),
          /authority|receipt|kind/i,
        );
        assert.equal(
          ordinaryGets,
          0,
          `${consumer.name}: ${kind} ${shape} must reject without ordinary property reads`,
        );
      }
      // An own enumerable data discriminator is only a dispatch hint. It does
      // not let a frozen clone manufacture the actual producer's authority.
      await assert.rejects(
        () =>
          consumer({}, {}, {
            locale: "en",
            inference: Object.freeze({ kind }),
            controls: {},
          } as never),
        /authority/i,
      );
    }
  }
});
