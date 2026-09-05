import assert from "node:assert/strict";
import test from "node:test";
import { runStandardPlanV3 } from "../lib/open-ena/analyze";
import {
  buildAnalysisBundleV3,
  exportStaleAuditV3,
  importOpenEnaArtifactV3,
  parseAnalysisBundleV3,
} from "../lib/open-ena/export";
import { bindResultV3 } from "../lib/open-ena/model-v3/result-binding";
import { bindOnaResultV3 } from "../lib/open-ena/model-v3/ona-result-binding";
import {
  buildOnaExecutionPlanV3,
  runOnaPlanV3,
} from "../lib/open-ena/model-v3/ona-adapter";
import { decodeCanonicalOnaConfigV3 } from "../lib/open-ena/model-v3/schema";
import {
  buildReferenceV2,
  fitReferenceSourceV3,
} from "../lib/open-ena/model-v3/reference-v2";
import type {
  BoundResultV3,
  OpenEnaAnalysisBundleV3,
  OpenEnaStandardReferenceV2,
  StandardEnaDraftV3,
} from "../lib/open-ena/model-v3/types";
import {
  OPEN_ENA_RUNTIME_POLICY_VERSION_V3,
  OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3,
} from "../lib/open-ena/model-v3/types";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";
import type { ParsedDataset } from "../lib/open-ena/types";
import { createDirectionalMask } from "../lib/open-ena/network-config";

type MethodsApiV3 = {
  buildMethodsReportV3(result: BoundResultV3): string;
};

async function methodsApiV3(): Promise<MethodsApiV3> {
  const module = await import("../lib/open-ena/methods");
  const build = Reflect.get(module, "buildMethodsReportV3");
  assert.equal(
    typeof build,
    "function",
    "Task 20 must export buildMethodsReportV3 from the public methods module",
  );
  return { buildMethodsReportV3: build as MethodsApiV3["buildMethodsReportV3"] };
}

function observation(rowCount: number) {
  return {
    processedRows: rowCount,
    maximumBufferedRows: 0,
    numericCellsAllocated: 120,
    peakBytesObservedOrBounded: 10_240,
    observationMethod: "exact-counters-and-conservative-byte-bound" as const,
  };
}

async function boundStandard(
  modify?: (draft: StandardEnaDraftV3, data: ParsedDataset) => void,
  reference?: OpenEnaStandardReferenceV2,
) {
  const fixture = await bindingFixtureV3(
    reference ? "c".repeat(64) : undefined,
    modify as Parameters<typeof bindingFixtureV3>[1],
    reference,
  );
  const result = await bindResultV3(
    fixture.plan,
    runStandardPlanV3(fixture.plan),
    observation(fixture.plan.rows.length),
    fixture.compiled.diagnostics,
  );
  return { ...fixture, result };
}

async function boundOna() {
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
    units: { columns: ["unit"], group: { type: "stable-metadata", column: "group" } },
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
        keys: [{ column: "time", direction: "ascending", comparator: { type: "number" } }],
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
  const plan = await buildOnaExecutionPlanV3(dataset, "d".repeat(64), configuration);
  const result = await bindOnaResultV3(plan, runOnaPlanV3(plan), {
    processedRows: dataset.rows.length,
    maximumRetainedRowsAfterChunk: 0,
    bufferedRowsPeakUpperBound: Math.min(dataset.rows.length, plan.header.resourceEstimate.estimatedRetainedWindowRows + 1),
    numericCellsUpperBound: plan.operationalAdmission.totalNumericCells,
    peakBytesUpperBound: plan.operationalAdmission.totalPeakBytes,
    observationMethod: "dimension-bounds-and-chunk-boundary-stream-state",
  });
  return { plan, result };
}

test("SVD Methods use the bound hashes, binary input, Infinity extents, and intrinsic rank", async () => {
  const { buildMethodsReportV3 } = await methodsApiV3();
  const { result } = await boundStandard((draft, data) => {
    draft.weighting = "binary";
    draft.windowType = "MovingStanzaWindow";
    draft.movingStanza = {
      backward: { kind: "infinity" },
      forward: { kind: "infinity" },
      rowOrder: {
        kind: "columns",
        keys: [{ column: "time", direction: "ascending", comparator: { type: "number" } }],
      },
    };
    data.rows = [
      { unit: "u1", horizon: "h1", time: 1, group: "Control", A: 1, B: 1, C: 0 },
      { unit: "u2", horizon: "h2", time: 2, group: "Treatment", A: 0, B: 1, C: 1 },
      { unit: "u3", horizon: "h3", time: 3, group: "Treatment", A: 1, B: 1, C: 0 },
    ];
  });
  const report = buildMethodsReportV3(result);

  assert.equal(result.executionProvenance.projection.rank, 1);
  assert.match(report, new RegExp(result.binding.datasetSha256));
  assert.match(report, new RegExp(result.binding.configurationSha256));
  assert.match(report, new RegExp(result.binding.executionPlanSha256));
  assert.match(report, /3 source rows/u);
  assert.match(report, /binary/u);
  assert.match(report, /unbounded backward context/u);
  assert.match(report, /unbounded forward context/u);
  assert.match(report, /within each Horizon/u);
  assert.match(report, /Resolved within-Horizon source-row sequences/u);
  assert.match(report, /`Horizon horizon=h1`: 0=source-row index 0/u);
  assert.match(report, /Bound runtime source-row traversal: 0, 1, 2/u);
  assert.match(report, /intrinsic target rank: 1/iu);
  assert.match(report, /full-basis variance shares/iu);
  assert.match(report, /currentness.*not established|does not establish currentness/iu);
  assert.match(report, /stale label.*known stale-audit.*context/u);
  assert.doesNotMatch(report, /__open_ena_(?:unit|horizon|group|code|edge)/u);
});

test("Means Methods distinguish all-endpoint fitting from actual contrast membership", async () => {
  const { buildMethodsReportV3 } = await methodsApiV3();
  const { result } = await boundStandard((draft) => {
    draft.rotation = {
      type: "means",
      centerAlignToOrigin: true,
      negativeLevel: { type: "string", value: "Control" },
      positiveLevel: { type: "string", value: "Treatment" },
    };
  });
  const report = buildMethodsReportV3(result);

  assert.match(report, /Conversation/u);
  assert.match(report, /row order: not applicable/u);
  assert.match(report, /frequency/u);
  assert.match(report, /positive mean minus the negative mean/u);
  assert.match(report, /Control.*n=2/u);
  assert.match(report, /Treatment.*n=2/u);
  assert.match(report, /all 5 endpoint Units/u);
  assert.match(report, /descriptive by construction/u);
  assert.match(report, /supported coordinates.*not.*independent dimensions/u);
});

test("Reference Methods separate the fixed source fit from target projection and variance", async () => {
  const { buildMethodsReportV3 } = await methodsApiV3();
  const source = await boundStandard();
  const reference = await buildReferenceV2(
    await fitReferenceSourceV3(source.plan),
    { displayName: "Bound source", currentPlan: source.plan },
  );
  const target = await boundStandard((draft, data) => {
    draft.rotation = {
      type: "reference",
      referenceId: reference.referenceId,
      expectedContentSha256: reference.contentSha256,
    };
    data.rows = [
      { unit: "target-a", horizon: "target-h1", time: 1, group: "Control", A: 1, B: 1, C: 1 },
      { unit: "target-b", horizon: "target-h2", time: 2, group: "Treatment", A: 1, B: 1, C: 1 },
      { unit: "target-c", horizon: "target-h3", time: 3, group: "Other", A: 1, B: 1, C: 1 },
    ];
  }, reference);
  const report = buildMethodsReportV3(target.result);

  assert.match(report, /fixed Endpoint reference/u);
  assert.match(report, /source fit population: 5 endpoint Units/u);
  assert.match(report, /target projection population: 3 endpoint Units/iu);
  assert.match(report, /axes and node positions were not refitted/u);
  assert.equal(target.result.executionProvenance.projection.targetProjectionRank, 0);
  assert.match(report, /target projection rank: 0/u);
  assert.match(report, /Target projected full-basis variance shares:/u);
  assert.match(report, /source-fit explained variance/u);
  assert.match(report, /legacy Reference.*cannot.*modern bound result/u);
  assert.match(report, /does not authenticate the Reference source/iu);
});

test("Reference trajectory Methods retain Endpoint source fit and actual target step populations", async () => {
  const { buildMethodsReportV3 } = await methodsApiV3();
  const source = await boundStandard();
  const reference = await buildReferenceV2(
    await fitReferenceSourceV3(source.plan),
    { displayName: "Endpoint source", currentPlan: source.plan },
  );
  for (const model of ["SeparateTrajectory", "AccumulatedTrajectory"] as const) {
    const target = await boundStandard((draft, data) => {
      draft.model = model;
      draft.rotation = {
        type: "reference",
        referenceId: reference.referenceId,
        expectedContentSha256: reference.contentSha256,
      };
      data.rows = data.rows.flatMap((row) => [
        { ...row, horizon: "first", time: 1 },
        { ...row, horizon: "second", time: 2 },
      ]);
    }, reference);
    const report = buildMethodsReportV3(target.result);

    assert.equal(target.result.executionProvenance.populations.fit, "reference-source-endpoint-units");
    assert.equal(target.result.executionProvenance.populations.targetTokens.length, 10);
    assert.match(report, /source fit population: 5 endpoint Units/u);
    assert.match(report, /Target projection population: 10 observed Unit-Horizon steps/u);
    assert.match(report, new RegExp(`${model}.*${model === "SeparateTrajectory" ? "step-specific" : "cumulative through each observed step"}`, "u"));
    assert.match(report, /No missing trajectory steps were imputed/u);
  }
});

test("trajectory Methods report window semantics, shared Horizons, and actual observed sequences", async () => {
  const { buildMethodsReportV3 } = await methodsApiV3();
  for (const model of ["SeparateTrajectory", "AccumulatedTrajectory"] as const) {
    const { result } = await boundStandard((draft, data) => {
      draft.model = model;
      draft.windowType = "MovingStanzaWindow";
      data.headers.push("row_order");
      draft.movingStanza = {
        backward: { kind: "finite", value: 5 },
        forward: { kind: "finite", value: 2 },
        rowOrder: {
          kind: "columns",
          keys: [{ column: "row_order", direction: "ascending", comparator: { type: "number" } }],
        },
      };
      data.rows = data.rows.flatMap((row, index) => [
        { ...row, horizon: "first", time: 1, row_order: index * 2 },
        ...(index === 4 ? [] : [{ ...row, horizon: "second", time: 2, row_order: index * 2 + 1 }]),
      ]);
    });
    const report = buildMethodsReportV3(result);

    assert.match(report, /Backward size 5 includes the current row and up to 4 preceding rows/u);
    assert.match(report, /Forward size 2 includes up to 2 following rows/u);
    assert.match(report, /within each Horizon/u);
    assert.match(report, /Shared Horizons were observed/u);
    assert.match(report, /`Horizon horizon=first`: 0=source-row index 0/u);
    assert.match(report, /Bound runtime source-row traversal:/u);
    assert.match(report, /Bound implementation Horizon order: `Horizon horizon=first`, `Horizon horizon=second`/u);
    assert.match(report, /`Unit unit=u1`: 0=`Horizon horizon=first`, 1=`Horizon horizon=second`/u);
    assert.match(report, /`Unit unit=u5`: 0=`Horizon horizon=first`/u);
    assert.match(report, /No missing trajectory steps were imputed/u);
    assert.match(
      report,
      model === "SeparateTrajectory"
        ? /SeparateTrajectory.*step-specific networks/u
        : /AccumulatedTrajectory.*cumulative through each observed step/u,
    );
  }
});

test("ONA Methods remain frequency-weighted and explicitly descriptive only", async () => {
  const { buildMethodsReportV3 } = await methodsApiV3();
  const { result } = await boundOna();
  const report = buildMethodsReportV3(result);

  assert.match(report, /Order Network Analysis \(ONA\)/u);
  assert.match(report, /Scientific weighting: `frequency`/u);
  assert.match(report, /Forward size 0 includes no following rows within each Horizon/u);
  assert.match(report, /sphere normalization/u);
  assert.match(report, /ONA is descriptive only/u);
  assert.match(report, /no Standard ENA group subtraction, trajectory inference, or Reference projection was performed/u);
  assert.match(report, /Capability blocks:/u);
  assert.doesNotMatch(report, /__open_ena_(?:unit|horizon|group|code|edge)/u);
});

test("bound source labels remain visible without injecting Markdown structure", async () => {
  const { buildMethodsReportV3 } = await methodsApiV3();
  const hostileCode = `${"`x".repeat(130_000)}\n\n## Fabricated methods|column\``;
  const { result } = await boundStandard((draft, data) => {
    draft.codes = [hostileCode, "B", "C"];
    data.headers = data.headers.map((header) => header === "A" ? hostileCode : header);
    data.rows = data.rows.map((row, index) => Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key === "A" ? hostileCode : key,
        key === "group" && index === 0 ? "__open_ena_group_v3_user-label" : value,
      ]),
    ));
    data.sizeBytes = new TextEncoder().encode(hostileCode).byteLength * 6 + 4_096;
  });
  const report = buildMethodsReportV3(result);

  assert.doesNotMatch(report, /^## Fabricated methods(?:\s|$)/mu);
  assert.match(report, /Fabricated methods\|column/u);
  assert.match(report, /__open_ena_group_v3_user-label/u, "token-like source text is preserved as a public label");
  assert.match(report, /Required resolved sequences.*never truncated/u);
});

test("new bundles bind the full report while exact Task17 reports remain read-compatible", async () => {
  const { buildMethodsReportV3 } = await methodsApiV3();
  const { result } = await boundStandard();
  const bundle = await buildAnalysisBundleV3(result);
  assert.equal(bundle.methodsReportMarkdown, buildMethodsReportV3(result));
  assert.match(bundle.methodsReportMarkdown, /## Data binding/u);

  const legacyModule = await import("../lib/open-ena/bundle-contract-v3");
  const legacyBuilder = Reflect.get(legacyModule, "minimalBundleMethodsV3") as
    | ((value: BoundResultV3) => string)
    | undefined;
  assert.equal(typeof legacyBuilder, "function");
  const legacy = structuredClone(bundle) as OpenEnaAnalysisBundleV3;
  legacy.methodsReportMarkdown = legacyBuilder!(result);

  const hashes = await import("../lib/open-ena/model-v3/canonical-json");
  const { integrity: _old, ...components } = legacy;
  const componentHashes = Object.fromEntries(await Promise.all(
    Object.entries(components)
      .filter(([key]) => !["schemaVersion", "kind"].includes(key))
      .map(async ([key, value]) => [
        key,
        key === "methodsReportMarkdown"
          ? await hashes.sha256TextV3(String(value))
          : await hashes.sha256CanonicalJsonV3(value),
      ]),
  ));
  legacy.integrity = {
    componentHashes: componentHashes as never,
    bundleContentSha256: await hashes.sha256CanonicalJsonV3({
      ...components,
      componentHashes,
    }),
  };
  assert.deepEqual(await parseAnalysisBundleV3(JSON.stringify(legacy)), legacy);

  const stale = await exportStaleAuditV3(result, "f".repeat(64));
  const importedStale = await importOpenEnaArtifactV3(new TextDecoder().decode(stale.bytes));
  assert.equal(importedStale.kind, "historical-result");
  if (importedStale.kind !== "historical-result") assert.fail("Expected stale historical import");
  assert.ok(importedStale.review.includes("stale-audit"));
  assert.ok(importedStale.review.includes("stale-against-current-draft-fingerprint"));
  const staleArtifact = importedStale.artifact as {
    analysisBundle: OpenEnaAnalysisBundleV3;
  };
  assert.equal(
    staleArtifact.analysisBundle.methodsReportMarkdown,
    bundle.methodsReportMarkdown,
    "stale context does not rewrite scientific Methods bytes",
  );

  const arbitrary = structuredClone(legacy);
  arbitrary.methodsReportMarkdown += "\nArbitrary accepted prose.";
  const { integrity: _previous, ...arbitraryComponents } = arbitrary;
  const arbitraryHashes = Object.fromEntries(await Promise.all(
    Object.entries(arbitraryComponents)
      .filter(([key]) => !["schemaVersion", "kind"].includes(key))
      .map(async ([key, value]) => [
        key,
        key === "methodsReportMarkdown"
          ? await hashes.sha256TextV3(String(value))
          : await hashes.sha256CanonicalJsonV3(value),
      ]),
  ));
  arbitrary.integrity = {
    componentHashes: arbitraryHashes as never,
    bundleContentSha256: await hashes.sha256CanonicalJsonV3({
      ...arbitraryComponents,
      componentHashes: arbitraryHashes,
    }),
  };
  await assert.rejects(
    () => parseAnalysisBundleV3(JSON.stringify(arbitrary)),
    /bound methods report|contract/u,
  );
});

test("Methods and semantic bundle reads do not depend on the host number locale", async () => {
  const { buildMethodsReportV3 } = await methodsApiV3();
  const { result } = await boundStandard();
  const bundle = await buildAnalysisBundleV3(result);
  const expected = bundle.methodsReportMarkdown;
  const original = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function localeSentinel() {
    return `locale-dependent-${Number(this)}`;
  };
  try {
    assert.equal(buildMethodsReportV3(result), expected);
    assert.deepEqual(await parseAnalysisBundleV3(JSON.stringify(bundle)), bundle);
  } finally {
    Number.prototype.toLocaleString = original;
  }
});
