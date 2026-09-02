import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Row } from "jena-js";
import { analyzeDataset, buildManifest } from "../lib/open-ena/analyze";
import { OpenEnaCapabilityError } from "../lib/open-ena/capabilities";
import { buildAnalysisBundle, parseOpenEnaAnalysisBundle } from "../lib/open-ena/export";
import { buildMethodsReport } from "../lib/open-ena/methods";
import { createDirectionalMask } from "../lib/open-ena/network-config";
import {
  SAMPLE_CONFIG,
  type OpenEnaConfig,
  type ParsedDataset,
} from "../lib/open-ena/types";

const SOURCE_HASH = "7".repeat(64);
const LEGACY_V1_FIXTURE_SHA256 = "e639efe9e29784f71f0c86b32cd7c7c09e75d2cc3cf625fdf0c5c90c00b0eb96";
const LEGACY_V1_FIXTURE_URL = new URL(
  "./fixtures/open-ena/analysis-bundle-v1.json",
  import.meta.url,
);

function orderedFixture() {
  const rows: Row[] = [
    { unit: "u1", horizon: "h1", turn: 1, group: "g1", A: 2, B: 0, C: 1 },
    { unit: "u1", horizon: "h1", turn: 2, group: "g1", A: 0, B: 3, C: 1 },
    { unit: "u2", horizon: "h2", turn: 1, group: "g2", A: 1, B: 1, C: 0 },
    { unit: "u2", horizon: "h2", turn: 2, group: "g2", A: 0, B: 1, C: 2 },
    { unit: "u3", horizon: "h3", turn: 1, group: "g1", A: 0, B: 2, C: 1 },
    { unit: "u3", horizon: "h3", turn: 2, group: "g1", A: 1, B: 0, C: 2 },
  ];
  const dataset: ParsedDataset = {
    name: "ordered-portable.csv",
    headers: ["unit", "horizon", "turn", "group", "A", "B", "C"],
    rows,
    sizeBytes: 0,
    source: "upload",
  };
  const codes = ["A", "B", "C"];
  const config: OpenEnaConfig = {
    ...SAMPLE_CONFIG,
    analysisKind: "ona",
    unitColumns: ["unit"],
    conversationColumns: ["horizon"],
    groupColumn: "group",
    codes,
    model: "EndPoint",
    window: "MovingStanzaWindow",
    windowSizeBack: Number.POSITIVE_INFINITY,
    windowSizeForward: 0,
    weightBy: "sum",
    rotation: "svd",
    referenceRotationId: null,
    orderPolicy: {
      kind: "columns",
      columns: ["turn"],
      comparators: { turn: "number" },
    },
    directionalMask: createDirectionalMask(codes),
  };
  return { dataset, config, result: analyzeDataset(dataset, config) };
}

function standardFixture() {
  const dataset: ParsedDataset = {
    name: "legacy-standard.csv",
    headers: ["unit", "conversation", "group", "A", "B", "C"],
    rows: [
      { unit: "u1", conversation: "c1", group: "g1", A: 1, B: 1, C: 0 },
      { unit: "u2", conversation: "c2", group: "g2", A: 0, B: 1, C: 1 },
    ],
    sizeBytes: 0,
    source: "upload",
  };
  const config: OpenEnaConfig = {
    ...SAMPLE_CONFIG,
    unitColumns: ["unit"],
    conversationColumns: ["conversation"],
    groupColumn: "group",
    codes: ["A", "B", "C"],
  };
  return { dataset, config, result: analyzeDataset(dataset, config) };
}

test("ONA manifest v2 records ordered execution without row-level source mapping", () => {
  const { dataset, config, result } = orderedFixture();
  const manifest = buildManifest(dataset, config, result, SOURCE_HASH) as unknown as {
    schemaVersion: number;
    configuration: Record<string, unknown>;
    analysis: {
      analysisKind: string;
      networkType: string;
    ordering: Record<string, unknown>;
      directionalMask: { enabled: boolean[][] };
    };
    effectiveJenaOptions: Record<string, unknown>;
    boundaries: string[];
  };

  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.configuration.windowSizeBack, "Infinity");
  assert.equal(manifest.analysis.analysisKind, "ona");
  assert.equal(manifest.analysis.networkType, "ordered");
  assert.equal("responseRowSourceIndices" in manifest.analysis.ordering, false);
  assert.equal(
    manifest.analysis.ordering.sourceMapping,
    "excluded-from-generic-bundle",
  );
  assert.deepEqual(manifest.analysis.directionalMask.enabled, config.directionalMask?.enabled);
  assert.equal(manifest.effectiveJenaOptions.networkType, "ordered");
  assert.equal(manifest.effectiveJenaOptions.nodePositionMethod, "directed");
  assert.deepEqual(manifest.effectiveJenaOptions.mask, config.directionalMask?.enabled.map((row) => (
    row.map((enabled) => enabled ? 1 : 0)
  )));
  assert.match(manifest.boundaries.join(" "), /descriptive-only|descriptive only/i);
});

test("generic ONA bundle keeps Infinity portable and excludes row-level and inferential payloads", () => {
  const { dataset, config, result } = orderedFixture();
  const bundle = buildAnalysisBundle(dataset, config, result, SOURCE_HASH) as Record<string, any>;
  const json = JSON.stringify(bundle);

  assert.equal(bundle.schemaVersion, 2);
  assert.equal(bundle.manifest.schemaVersion, 2);
  assert.equal(bundle.manifest.configuration.windowSizeBack, "Infinity");
  assert.equal(bundle.manifest.effectiveJenaOptions.windowSizeBack, "Infinity");
  assert.equal(bundle.modelData.functionParams.windowSizeBack, "Infinity");
  assert.equal(bundle.modelData.analysisKind, "ona");
  assert.equal(bundle.modelData.networkType, "ordered");
  assert.equal(bundle.modelData.functionParams.networkType, "ordered");
  assert.equal(bundle.groupContrast, null);
  assert.equal(bundle.inference, null);
  assert.doesNotMatch(json, /"windowSizeBack":null/);
  assert.doesNotMatch(
    json,
    /rawRows|metaData|rowConnectionCounts|rowWindowProvenance|responseRowSourceIndices/,
  );

  const parsed = parseOpenEnaAnalysisBundle(json) as Record<string, any>;
  assert.equal(parsed.manifest.configuration.windowSizeBack, "Infinity");
  assert.equal(parsed.modelData.functionParams.windowSizeBack, "Infinity");
  assert.equal(Object.isFrozen(parsed), true);

  assert.throws(
    () => buildAnalysisBundle(dataset, config, result, SOURCE_HASH, { inference: {} as never }),
    (error) => error instanceof OpenEnaCapabilityError && error.feature === "inference",
  );
  assert.throws(
    () => buildAnalysisBundle(dataset, config, result, SOURCE_HASH, { groupContrast: {} as never }),
    (error) => error instanceof OpenEnaCapabilityError && error.feature === "group-contrast",
  );
});

test("bundle parser rejects renamed row-level payloads outside the closed ONA schema", () => {
  const { dataset, config, result } = orderedFixture();
  const valid = structuredClone(buildAnalysisBundle(dataset, config, result, SOURCE_HASH)) as Record<string, any>;
  const mutations: Array<[string, (bundle: Record<string, any>) => void]> = [
    ["manifest dataset records", (bundle) => {
      bundle.manifest.dataset.records = [
        { student: "PRIVATE_STUDENT", horizon: "PRIVATE_HORIZON", utterance: "PRIVATE_TEXT" },
      ];
    }],
    ["coordinate row identity", (bundle) => {
      bundle.tables.coordinates[0].privateHorizon = "PRIVATE_HORIZON";
    }],
    ["directional-mask side channel", (bundle) => {
      bundle.manifest.configuration.directionalMask.records = [
        { student: "PRIVATE_STUDENT", horizon: "PRIVATE_HORIZON" },
      ];
    }],
    ["renamed ordered audit", (bundle) => {
      bundle.tables.auditTrail = [{ response: 1, previous: 0, values: [1, 0, 0] }];
    }],
  ];

  for (const [label, mutate] of mutations) {
    const forged = structuredClone(valid);
    mutate(forged);
    assert.throws(
      () => parseOpenEnaAnalysisBundle(JSON.stringify(forged)),
      /schema|unsupported|row-level|table|field/i,
      label,
    );
  }
});

test("bundle parser binds ONA rotation and authoritative count tables to model data", () => {
  const { dataset, config, result } = orderedFixture();
  const valid = structuredClone(buildAnalysisBundle(dataset, config, result, SOURCE_HASH)) as Record<string, any>;
  const mutations: Array<[string, (bundle: Record<string, any>) => void]> = [
    ["rotation code order", (bundle) => {
      bundle.rotationSet.codes = [...bundle.rotationSet.codes].reverse();
    }],
    ["directed adjacency", (bundle) => {
      bundle.rotationSet.adjacencyKey[0].source = "C";
    }],
    ["connection count authority", (bundle) => {
      bundle.tables.connectionCounts[0]["A & B"] = 123_456;
    }],
    ["unit row cardinality", (bundle) => {
      bundle.modelData.unitLabels.pop();
    }],
  ];

  for (const [label, mutate] of mutations) {
    const forged = structuredClone(valid);
    mutate(forged);
    assert.throws(
      () => parseOpenEnaAnalysisBundle(JSON.stringify(forged)),
      /rotation|adjacency|count|matrix|unit|table|contract|contradict/i,
      label,
    );
  }
});

test("bundle parser closes the ONA scientific derivation under an explicit 1e-10 absolute and 1e-9 relative tolerance", () => {
  const { dataset, config, result } = orderedFixture();
  const valid = structuredClone(buildAnalysisBundle(dataset, config, result, SOURCE_HASH)) as Record<string, any>;
  const firstEdge = valid.modelData.codeColumns[0] as string;
  const firstAxis = valid.rotationSet.rotationColumns[0] as string;
  const codeCount = valid.rotationSet.codes.length as number;
  const nonzeroEdgeIndices = valid.modelData.codeColumns.flatMap((_edge: string, edgeIndex: number) => (
    valid.modelData.connectionMatrix.some((row: number[]) => row[edgeIndex] > 0) ? [edgeIndex] : []
  ));
  const nonzeroDiagonal = nonzeroEdgeIndices.find((edgeIndex: number) => (
    edgeIndex % codeCount === Math.floor(edgeIndex / codeCount)
  ));
  const nonzeroDirected = nonzeroEdgeIndices.find((edgeIndex: number) => (
    edgeIndex % codeCount !== Math.floor(edgeIndex / codeCount)
  ));
  assert.notEqual(nonzeroDiagonal, undefined, "fixture must exercise an enabled diagonal cell");
  assert.notEqual(nonzeroDirected, undefined, "fixture must exercise an enabled directed cell");

  const disableNonzeroEdge = (bundle: Record<string, any>, edgeIndex: number) => {
    const groundIndex = edgeIndex % codeCount;
    const responseIndex = Math.floor(edgeIndex / codeCount);
    bundle.manifest.configuration.directionalMask.enabled[groundIndex][responseIndex] = false;
    bundle.manifest.analysis.directionalMask.enabled[groundIndex][responseIndex] = false;
    bundle.manifest.effectiveJenaOptions.mask[groundIndex][responseIndex] = 0;
  };

  const roundingOnly = structuredClone(valid);
  roundingOnly.tables.lineWeights[0][firstEdge] += 1e-12;
  assert.doesNotThrow(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(roundingOnly)),
    "sub-tolerance JSON roundoff must not invalidate a scientific bundle",
  );

  const corruptions: Array<[string, (bundle: Record<string, any>) => void]> = [
    ["duplicated raw connection count", (bundle) => {
      bundle.modelData.connectionMatrix[0][0] += 1;
      bundle.tables.connectionCounts[0][firstEdge] += 1;
    }],
    ["coherently disabled nonzero diagonal", (bundle) => {
      disableNonzeroEdge(bundle, nonzeroDiagonal!);
    }],
    ["coherently disabled nonzero directed edge", (bundle) => {
      disableNonzeroEdge(bundle, nonzeroDirected!);
    }],
    ["sphere-normalized line weight", (bundle) => {
      bundle.tables.lineWeights[0][firstEdge] += 1e-6;
    }],
    ["center vector", (bundle) => {
      bundle.rotationSet.centerVector[0] += 1e-6;
    }],
    ["center-adjusted projection input", (bundle) => {
      bundle.tables.pointsForProjection[0][firstEdge] += 1e-6;
    }],
    ["orthogonal rotation", (bundle) => {
      bundle.rotationSet.rotationMatrix[0][0] += 1e-6;
    }],
    ["rotation eigenvalue", (bundle) => {
      bundle.rotationSet.eigenvalues[0] += 1e-6;
    }],
    ["projected coordinate", (bundle) => {
      bundle.tables.coordinates[0][firstAxis] += 1e-6;
    }],
    ["full-axis variance", (bundle) => {
      bundle.manifest.result.variance[firstAxis] += 1e-6;
    }],
    ["dimension statistic", (bundle) => {
      bundle.statistics.dimensions[0].mean += 1e-6;
    }],
    ["group statistic", (bundle) => {
      bundle.statistics.groups[0].means[firstAxis] += 1e-6;
    }],
    ["coherently forged node and centroid geometry", (bundle) => {
      for (const node of bundle.rotationSet.nodes) node[firstAxis] += 1e-6;
      for (const node of bundle.tables.nodePositions) node[firstAxis] += 1e-6;
      for (const centroid of bundle.tables.centroids) centroid[firstAxis] += 1e-6;
    }],
    ["overflowed node and centroid geometry", (bundle) => {
      for (const dimension of bundle.rotationSet.rotationColumns.slice(0, 3)) {
        for (const node of bundle.rotationSet.nodes) node[dimension] = Number.MAX_VALUE;
        for (const node of bundle.tables.nodePositions) node[dimension] = Number.MAX_VALUE;
        for (const centroid of bundle.tables.centroids) centroid[dimension] = Number.MAX_VALUE;
      }
    }],
    ["duplicated adjacency geometry", (bundle) => {
      bundle.rotationSet.adjacencyKey[0].source = "C";
      bundle.tables.adjacencyKey[0].source = "C";
    }],
  ];

  for (const [label, mutate] of corruptions) {
    const forged = structuredClone(valid);
    mutate(forged);
    assert.throws(
      () => parseOpenEnaAnalysisBundle(JSON.stringify(forged)),
      /adjacency|center|connection|coordinate|eigen|group|line weight|mask|node|normaliz|orthogonal|project|rotation|statistic|variance/i,
      label,
    );
  }

  const rankDeficientDataset: ParsedDataset = {
    name: "rank-deficient-ordered.csv",
    headers: ["unit", "horizon", "turn", "group", "A", "B", "C"],
    rows: Array.from({ length: 6 }, (_unused, index) => ({
      unit: `u${index + 1}`,
      horizon: `h${index + 1}`,
      turn: 1,
      group: "g1",
      A: 1,
      B: 1,
      C: 1,
    })),
    sizeBytes: 0,
    source: "upload",
  };
  const rankDeficient = structuredClone(buildAnalysisBundle(
    rankDeficientDataset,
    config,
    analyzeDataset(rankDeficientDataset, config),
    SOURCE_HASH,
  )) as Record<string, any>;
  const rankDeficientAxis = rankDeficient.rotationSet.rotationColumns[0] as string;
  rankDeficient.rotationSet.nodes[0][rankDeficientAxis] += 1;
  rankDeficient.rotationSet.nodes[1][rankDeficientAxis] -= 1;
  rankDeficient.tables.nodePositions = structuredClone(rankDeficient.rotationSet.nodes);
  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(rankDeficient)),
    /node|least-squares|scientific derivation/i,
    "a unit-scale nullspace node shift cannot hide inside the solver ridge tolerance",
  );
});

test("bundle parser closes analytic units, dataset rows, unit tuples, and group membership", () => {
  const { dataset, config, result } = orderedFixture();
  const valid = structuredClone(buildAnalysisBundle(dataset, config, result, SOURCE_HASH)) as Record<string, any>;

  const corruptions: Array<[string, (bundle: Record<string, any>) => void]> = [
    ["dataset rows below analytic units", (bundle) => {
      bundle.manifest.dataset.rows = bundle.modelData.unitLabels.length - 1;
    }],
    ["dataset columns below declared ONA schema", (bundle) => {
      bundle.manifest.dataset.columns = 0;
    }],
    ["unit tuple disagrees with ENA_UNIT", (bundle) => {
      for (const field of ["coordinates", "lineWeights", "connectionCounts", "pointsForProjection"] as const) {
        bundle.tables[field][0].unit = "forged-unit-tuple";
      }
    }],
    ["duplicate manifest group name", (bundle) => {
      bundle.manifest.result.groups[1].name = bundle.manifest.result.groups[0].name;
      bundle.statistics.groups[1].group = bundle.statistics.groups[0].group;
    }],
    ["manifest counts disagree with table membership", (bundle) => {
      const firstCount = bundle.manifest.result.groups[0].count;
      bundle.manifest.result.groups[0].count = bundle.manifest.result.groups[1].count;
      bundle.manifest.result.groups[1].count = firstCount;
      bundle.statistics.groups[0].n = bundle.manifest.result.groups[0].count;
      bundle.statistics.groups[1].n = bundle.manifest.result.groups[1].count;
    }],
    ["table group absent from manifest", (bundle) => {
      for (const field of ["coordinates", "lineWeights", "connectionCounts", "pointsForProjection"] as const) {
        bundle.tables[field][0].group = "undeclared-group";
      }
    }],
    ["declared group collapsed to null All units", (bundle) => {
      for (const field of ["coordinates", "lineWeights", "connectionCounts", "pointsForProjection"] as const) {
        for (const row of bundle.tables[field]) row.group = null;
      }
      const dimensions = bundle.rotationSet.rotationColumns.slice(0, 3) as string[];
      bundle.manifest.result.groups = [{
        name: "All units",
        count: bundle.modelData.unitLabels.length,
      }];
      bundle.statistics.groups = [{
        group: "All units",
        n: bundle.modelData.unitLabels.length,
        means: Object.fromEntries(dimensions.map((dimension) => [
          dimension,
          bundle.tables.coordinates.reduce((sum: number, row: Record<string, number>) => (
            sum + row[dimension]
          ), 0) / bundle.tables.coordinates.length,
        ])),
      }];
    }],
    ["zero analytic units", (bundle) => {
      bundle.modelData.unitLabels = [];
      bundle.modelData.connectionMatrix = [];
      for (const field of [
        "coordinates", "lineWeights", "connectionCounts", "pointsForProjection", "centroids",
      ] as const) {
        bundle.tables[field] = [];
      }
      bundle.manifest.result.units = 0;
      bundle.manifest.result.points = 0;
      bundle.manifest.result.groups = [];
      bundle.statistics.groups = [];
      for (const dimension of bundle.statistics.dimensions) dimension.n = 0;
    }],
  ];

  for (const [label, mutate] of corruptions) {
    const forged = structuredClone(valid);
    mutate(forged);
    assert.throws(
      () => parseOpenEnaAnalysisBundle(JSON.stringify(forged)),
      /analytic|dataset|group|membership|row|tuple|unit|zero/i,
      label,
    );
  }

  const noGroupCodes = ["A", "B", "C"];
  const noGroupDataset: ParsedDataset = {
    name: "no-group-ordered.csv",
    headers: ["unit", "horizon", "turn", ...noGroupCodes],
    rows: [{ unit: "u1", horizon: "h1", turn: 1, A: 1, B: 1, C: 1 }],
    sizeBytes: 0,
    source: "upload",
  };
  const noGroupConfig: OpenEnaConfig = {
    ...config,
    groupColumn: null,
    codes: noGroupCodes,
    directionalMask: createDirectionalMask(noGroupCodes),
  };
  const noGroup = structuredClone(buildAnalysisBundle(
    noGroupDataset,
    noGroupConfig,
    analyzeDataset(noGroupDataset, noGroupConfig),
    SOURCE_HASH,
  )) as Record<string, any>;
  noGroup.manifest.result.groups[0].name = "forged aggregate";
  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(noGroup)),
    /All units|group|comparison field/i,
  );
});

test("ONA bundle parser binds selected group order to two distinct manifest groups", () => {
  const { dataset, config, result } = orderedFixture();
  const valid = structuredClone(buildAnalysisBundle(
    dataset,
    config,
    result,
    SOURCE_HASH,
    { selectedGroupOrder: ["g2", "g1"] },
  )) as Record<string, any>;

  const parsed = parseOpenEnaAnalysisBundle(JSON.stringify(valid)) as Record<string, any>;
  assert.deepEqual(parsed.presentation.selectedGroupOrder, ["g2", "g1"]);

  for (const [label, selectedGroupOrder] of [
    ["duplicate group", ["g1", "g1"]],
    ["group absent from manifest", ["g1", "ghost-group"]],
  ] as const) {
    const forged = structuredClone(valid);
    forged.presentation.selectedGroupOrder = selectedGroupOrder;
    assert.throws(
      () => parseOpenEnaAnalysisBundle(JSON.stringify(forged)),
      /selected group order|manifest group|declared group|distinct/i,
      label,
    );
  }
});

test("closed ONA parser preserves legitimate one-unit not-estimable statistics", () => {
  const codes = ["A", "B", "C"];
  const dataset: ParsedDataset = {
    name: "one-unit-ordered.csv",
    headers: ["unit", "horizon", "turn", "A", "B", "C"],
    rows: [{ unit: "u1", horizon: "h1", turn: 1, A: 1, B: 1, C: 1 }],
    sizeBytes: 0,
    source: "upload",
  };
  const config: OpenEnaConfig = {
    ...SAMPLE_CONFIG,
    analysisKind: "ona",
    unitColumns: ["unit"],
    conversationColumns: ["horizon"],
    groupColumn: null,
    codes,
    model: "EndPoint",
    window: "MovingStanzaWindow",
    windowSizeBack: 1,
    windowSizeForward: 0,
    weightBy: "sum",
    rotation: "svd",
    referenceRotationId: null,
    orderPolicy: {
      kind: "columns",
      columns: ["turn"],
      comparators: { turn: "number" },
    },
    directionalMask: createDirectionalMask(codes),
  };
  const bundle = buildAnalysisBundle(dataset, config, analyzeDataset(dataset, config), SOURCE_HASH);
  const parsed = parseOpenEnaAnalysisBundle(JSON.stringify(bundle)) as Record<string, any>;

  assert.equal(parsed.statistics.dimensions[0].n, 1);
  assert.equal(parsed.statistics.dimensions[0].sd, null);
  assert.equal(parsed.statistics.dimensions[0].variance, null);
});

test("bundle parser symmetrically accepts v2 and a SHA-locked pre-v2 serializer artifact", () => {
  // This artifact is the byte-for-byte output of buildAnalysisBundle at
  // d6b90c319e5106b88203b7281dbc7872c7d4229b, the origin/main ancestor and
  // sole parent of the commit that changed the outer bundle schema to v2.
  const legacyText = readFileSync(LEGACY_V1_FIXTURE_URL, "utf8");
  assert.equal(
    createHash("sha256").update(legacyText, "utf8").digest("hex"),
    LEGACY_V1_FIXTURE_SHA256,
  );
  const legacy = parseOpenEnaAnalysisBundle(legacyText) as Record<string, any>;
  assert.equal(legacy.schemaVersion, 1);
  assert.equal(legacy.manifest.schemaVersion, 1);
  assert.equal(legacy.manifest.runtimeVersion, "0.6.2");
  assert.equal(
    legacy.manifest.dataset.normalizedUtf8TextSha256,
    "2aafd9920a0e576a584ea9d7c32cd3190e435199a065f61497b03d7c9cebff3b",
  );
  assert.equal(Object.hasOwn(legacy, "inference"), false);
  assert.equal(Object.isFrozen(legacy), true);

  const { dataset, config, result } = standardFixture();
  const current = buildAnalysisBundle(dataset, config, result, SOURCE_HASH);
  const parsedCurrent = parseOpenEnaAnalysisBundle(JSON.stringify(current)) as Record<string, any>;
  assert.equal(parsedCurrent.schemaVersion, 2);
  assert.equal(parsedCurrent.manifest.schemaVersion, 2);
  assert.equal(parsedCurrent.inference, null);
  assert.equal(Object.isFrozen(parsedCurrent), true);
  for (const sharedField of [
    "app", "manifest", "tables", "rotationSet", "modelData", "statistics",
    "statisticsDiagnostics", "groupContrast", "presentation", "methodsReportMarkdown",
  ]) {
    assert.equal(Object.hasOwn(legacy, sharedField), true, `legacy ${sharedField}`);
    assert.equal(Object.hasOwn(parsedCurrent, sharedField), true, `v2 ${sharedField}`);
  }

  const legacyCodes = legacy.manifest.configuration.codes as string[];
  const orderedMarkers: Array<[string, (bundle: Record<string, any>) => void]> = [
    ["top-level v2 inference", (bundle) => {
      bundle.inference = null;
    }],
    ["manifest analysis", (bundle) => {
      bundle.manifest.analysis = {
        analysisKind: "ona",
        networkType: "ordered",
        ordering: null,
        directionalMask: null,
      };
    }],
    ["configuration analysis kind", (bundle) => {
      bundle.manifest.configuration.analysisKind = "ona";
    }],
    ["configuration order policy", (bundle) => {
      bundle.manifest.configuration.orderPolicy = { kind: "source-row", confirmed: true };
    }],
    ["configuration directional mask", (bundle) => {
      bundle.manifest.configuration.directionalMask = createDirectionalMask(legacyCodes);
    }],
    ["effective ordered network", (bundle) => {
      bundle.manifest.effectiveJenaOptions.networkType = "ordered";
    }],
    ["directed node method", (bundle) => {
      bundle.manifest.effectiveJenaOptions.nodePositionMethod = "directed";
    }],
    ["model ordered identity", (bundle) => {
      bundle.modelData.networkType = "ordered";
    }],
    ["model analysis kind", (bundle) => {
      bundle.modelData.analysisKind = "ona";
    }],
    ["ordered function parameters", (bundle) => {
      bundle.modelData.functionParams.networkType = "ordered";
    }],
  ];
  for (const [label, mutate] of orderedMarkers) {
    const forged = structuredClone(legacy);
    mutate(forged);
    assert.throws(
      () => parseOpenEnaAnalysisBundle(JSON.stringify(forged)),
      /legacy.*ENA-only|schema-v1|unsupported|ordered/i,
      label,
    );
  }

  const nullInfinityLegacy = structuredClone(legacy) as Record<string, any>;
  nullInfinityLegacy.manifest.configuration.windowSizeBack = null;
  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(nullInfinityLegacy)),
    /windowSizeBack|Infinity|null/i,
  );

  const widthOnlyLegacy = structuredClone(legacy) as Record<string, any>;
  widthOnlyLegacy.modelData.codeColumns = Array.from({ length: 25 }, (_, index) => `edge-${index}`);
  widthOnlyLegacy.modelData.connectionMatrix = widthOnlyLegacy.modelData.connectionMatrix.map(() => (
    Array.from({ length: 25 }, () => 0)
  ));
  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(widthOnlyLegacy)),
    /network shape|connectionMatrix|standard|legacy/i,
    "a p-squared matrix alone must never migrate legacy schema v1 to ONA",
  );
});

test("bundle parser requires outer and nested schema versions to match", () => {
  const { dataset, config, result } = standardFixture();
  const current = structuredClone(buildAnalysisBundle(dataset, config, result, SOURCE_HASH)) as Record<string, any>;
  const outerV1NestedV2 = structuredClone(current);
  outerV1NestedV2.schemaVersion = 1;
  delete outerV1NestedV2.inference;

  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(outerV1NestedV2)),
    /schema.*version|nested.*schema|schema.*match/i,
  );
});

test("bundle parser rejects contradictory v2 ordered identity", () => {
  const { dataset, config, result } = orderedFixture();
  const bundle = structuredClone(buildAnalysisBundle(dataset, config, result, SOURCE_HASH)) as Record<string, any>;
  bundle.manifest.analysis.networkType = "standard";
  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(bundle)),
    /network|ordered|analysis kind|manifest/i,
  );
});

test("bundle parser binds model identity, units, conversations, codes, order, mask, and node method", () => {
  const { dataset, config, result } = orderedFixture();
  const valid = structuredClone(buildAnalysisBundle(dataset, config, result, SOURCE_HASH)) as Record<string, any>;
  const mutations: Array<[string, (bundle: Record<string, any>) => void]> = [
    ["analysis kind", (bundle) => { bundle.modelData.analysisKind = "ena"; }],
    ["runtime network", (bundle) => { bundle.modelData.networkType = "standard"; }],
    ["model", (bundle) => { bundle.modelData.modelType = "SeparateTrajectory"; }],
    ["unit columns", (bundle) => { bundle.modelData.units = ["different-unit"]; }],
    ["conversation columns", (bundle) => { bundle.modelData.conversation = ["different-horizon"]; }],
    ["edge order", (bundle) => { bundle.modelData.codeColumns = [...bundle.modelData.codeColumns].reverse(); }],
    ["requested order", (bundle) => {
      bundle.manifest.analysis.ordering.requestedPolicy = { kind: "source-row", confirmed: true };
    }],
    ["source mapping export policy", (bundle) => {
      bundle.manifest.analysis.ordering.sourceMapping = "included";
    }],
    ["directional mask", (bundle) => {
      bundle.manifest.analysis.directionalMask.enabled[0][1] = false;
    }],
    ["node method", (bundle) => { bundle.manifest.effectiveJenaOptions.nodePositionMethod = "undirected"; }],
  ];

  for (const [label, mutate] of mutations) {
    const forged = structuredClone(valid);
    mutate(forged);
    assert.throws(
      () => parseOpenEnaAnalysisBundle(JSON.stringify(forged)),
      /analysis|network|model|unit|conversation|code|edge|order|mapping|mask|node|contract|contradict/i,
      label,
    );
  }
});

test("ONA bundle blocks a forged reference rotation before reading result rotation fields", () => {
  const { dataset, config, result } = orderedFixture();
  const forgedConfig: OpenEnaConfig = {
    ...config,
    rotation: "reference",
    referenceRotationId: "forged-reference",
  };
  const poisonedResult = new Proxy(result, {
    get(target, property, receiver) {
      if (property === "projectionReference") {
        throw new Error("result projectionReference was read before the ONA reference guard");
      }
      return Reflect.get(target, property, receiver);
    },
  });

  assert.throws(
    () => buildAnalysisBundle(dataset, forgedConfig, poisonedResult, SOURCE_HASH),
    (error) => error instanceof OpenEnaCapabilityError
      && error.feature === "reference-rotation",
  );
});

test("ONA Methods records the resolved directed scientific contract and omits ENA-only claims", () => {
  const { dataset, config, result } = orderedFixture();
  const report = buildMethodsReport(dataset, config, result, SOURCE_HASH);

  assert.match(report, /Order Network Analysis \(ONA\)|ordered network/i);
  assert.match(report, /requested order policy/i);
  assert.match(report, /resolved order policy/i);
  assert.match(report, /`turn`[^\n]*`number`|number[^\n]*`turn`/i);
  assert.match(report, /ascending/i);
  assert.match(report, /missing[^\n]*reject|reject[^\n]*missing/i);
  assert.match(report, /ties?[^\n]*reject|reject[^\n]*ties?/i);
  assert.match(report, /ground\/source[^\n]*response\/target|ground[^\n]*→[^\n]*response/i);
  assert.match(report, /3²|3 × 3|9 directed cells/i);
  assert.match(report, /diagonal/i);
  assert.match(report, /total stanza rows including the current row/i);
  assert.match(report, /unbounded|all earlier rows/i);
  assert.match(report, /raw code-count products/i);
  assert.match(report, /half-weight|0\.5/i);
  assert.match(report, /directed method|directed node/i);
  assert.match(report, /directional mask/i);
  assert.match(report, /9 of 9|9\/9/);
  assert.match(report, /descriptive-only|descriptive only/i);
  assert.match(report, /sorted-to-source[^\n]*excluded|source mapping[^\n]*excluded/i);

  assert.doesNotMatch(report, /Source row order defined sequence/i);
  assert.doesNotMatch(report, /node positions used the undirected method/i);
  assert.doesNotMatch(report, /Group-mean uncertainty guides/i);
  assert.doesNotMatch(report, /Student-t confidence interval/i);
  assert.doesNotMatch(report, /jENA diagnostic statistics were used/i);
  assert.doesNotMatch(report, /reference projection/i);
});

test("3D ONA Methods and bundle record the actual display axes from the same fitted ordered model", () => {
  const { dataset, config, result } = orderedFixture();
  const axes = result.dimensions.slice(0, 3);
  assert.equal(axes.length, 3);
  const report = buildMethodsReport(
    dataset,
    config,
    result,
    SOURCE_HASH,
    axes,
    { view: "3d", flipX: true, flipY: false } as never,
  );

  assert.match(report, new RegExp(`Displayed 3D axes: X .*${axes[0]}.*; Y .*${axes[1]}.*; Z .*${axes[2]}`));
  assert.match(report, /same completed fitted ordered model|same fitted ordered model/i);
  assert.match(report, /display-only/i);
  assert.match(report, /PNG[\s\S]{0,120}view artifact/i);
  assert.doesNotMatch(report, /three-dimensional plotting[\s\S]{0,80}not verified/i);

  const bundle = buildAnalysisBundle(dataset, config, result, SOURCE_HASH, {
    methodsDimensions: axes,
    view: "3d",
    methodsFlipX: true,
    methodsFlipY: false,
  } as never) as Record<string, any>;
  assert.deepEqual(bundle.presentation.selectedAxes, axes);
  assert.equal(bundle.presentation.view, "3d");
  assert.match(bundle.methodsReportMarkdown, /Displayed 3D axes/i);
  assert.match(bundle.manifest.boundaries.join(" "), /3D[\s\S]{0,180}display-only/i);
  assert.doesNotMatch(bundle.manifest.boundaries.join(" "), /3D[\s\S]{0,80}(blocked|not verified)/i);
  const parsed = parseOpenEnaAnalysisBundle(JSON.stringify(bundle)) as Record<string, any>;
  assert.equal(parsed.presentation.view, "3d");
  assert.deepEqual(parsed.presentation.selectedAxes, axes);
});

test("ONA Methods records cross-unit horizon context and response-unit attribution", () => {
  const codes = ["A", "B", "C"];
  const dataset: ParsedDataset = {
    name: "cross-unit-horizon.csv",
    headers: ["unit", "horizon", "turn", "A", "B", "C"],
    rows: [
      { unit: "ground-unit", horizon: "shared", turn: 1, A: 1, B: 0, C: 1 },
      { unit: "response-unit", horizon: "shared", turn: 2, A: 0, B: 1, C: 1 },
    ],
    sizeBytes: 0,
    source: "upload",
  };
  const config: OpenEnaConfig = {
    ...SAMPLE_CONFIG,
    analysisKind: "ona",
    unitColumns: ["unit"],
    conversationColumns: ["horizon"],
    groupColumn: null,
    codes,
    model: "EndPoint",
    window: "MovingStanzaWindow",
    windowSizeBack: 2,
    windowSizeForward: 0,
    weightBy: "sum",
    rotation: "svd",
    referenceRotationId: null,
    orderPolicy: {
      kind: "columns",
      columns: ["turn"],
      comparators: { turn: "number" },
    },
    directionalMask: createDirectionalMask(codes),
  };
  const result = analyzeDataset(dataset, config);
  const groundUnit = result.set.connectionCounts.find((row) => row.ENA_UNIT === "ground-unit");
  const responseUnit = result.set.connectionCounts.find((row) => row.ENA_UNIT === "response-unit");
  assert.equal(Number(groundUnit?.["A & B"]), 0);
  assert.equal(Number(responseUnit?.["A & B"]), 1);

  const report = buildMethodsReport(dataset, config, result, SOURCE_HASH);
  assert.match(report, /window[^\n]*may span[^\n]*analytic units[^\n]*same typed horizon/i);
  assert.match(report, /contribution[^\n]*(?:assigned|credited)[^\n]*current response[^\n]*analytic unit/i);
});

test("ONA Methods blocks unverified inference and forged reference rotation before legacy reads", () => {
  const { dataset, config, result } = orderedFixture();
  assert.throws(
    () => buildMethodsReport(
      dataset,
      config,
      result,
      SOURCE_HASH,
      result.dimensions.slice(0, 2),
      {},
      {} as never,
    ),
    (error) => error instanceof OpenEnaCapabilityError && error.feature === "inference",
  );

  const forgedConfig: OpenEnaConfig = {
    ...config,
    rotation: "reference",
    referenceRotationId: "forged-reference",
  };
  const poisonedResult = new Proxy(result, {
    get(target, property, receiver) {
      if (property === "projectionReference") {
        throw new Error("result projectionReference was read before the ONA Methods reference guard");
      }
      return Reflect.get(target, property, receiver);
    },
  });
  assert.throws(
    () => buildMethodsReport(dataset, forgedConfig, poisonedResult, SOURCE_HASH),
    (error) => error instanceof OpenEnaCapabilityError
      && error.feature === "reference-rotation",
  );
});

test("standard ENA Methods retains its established source-order and undirected wording", () => {
  const { dataset, config, result } = standardFixture();
  const report = buildMethodsReport(dataset, config, result, SOURCE_HASH);
  assert.match(report, /Source row order defined sequence within conversations/);
  assert.match(report, /node positions used the undirected method/);
  assert.match(report, /Group-mean uncertainty guides/);
});
