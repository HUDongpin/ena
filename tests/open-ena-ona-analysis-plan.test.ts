import assert from "node:assert/strict";
import test from "node:test";
import type { Row } from "jena-js";
import {
  analyzeDataset,
  bindOpenEnaResultProvenance,
  buildJenaOptions,
  buildManifest,
  buildOpenEnaAnalysisPlan,
  dimensionEffect,
} from "../lib/open-ena/analyze";
import { parseCsv, validateConfig } from "../lib/open-ena/csv";
import { createDirectionalMask } from "../lib/open-ena/network-config";
import {
  SAMPLE_CONFIG,
  datasetHashKindFor,
  type OpenEnaConfig,
  type OpenEnaResult,
  type ParsedDataset,
} from "../lib/open-ena/types";

function orderedConfig(overrides: Partial<OpenEnaConfig> = {}): OpenEnaConfig {
  const codes = overrides.codes ?? ["A", "B", "C"];
  return {
    ...SAMPLE_CONFIG,
    analysisKind: "ona",
    unitColumns: ["unit"],
    conversationColumns: ["horizon"],
    groupColumn: "group",
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
    ...overrides,
  };
}

function manualDataset(rows: Row[]): ParsedDataset {
  return {
    name: "ordered-counts.csv",
    headers: ["unit", "horizon", "turn", "group", "A", "B", "C"],
    rows,
    sizeBytes: 0,
    source: "upload",
  };
}

test("ONA accepts finite nonnegative raw code counts while standard ENA remains binary", () => {
  const dataset = parseCsv([
    "unit,horizon,turn,group,A,B,C",
    "u1,h1,1,g1,2,0,1.5",
    "u1,h1,2,g1,0,3,0",
  ].join("\n") + "\n", { name: "raw-counts.csv", source: "upload" });

  assert.deepEqual(validateConfig(dataset, orderedConfig()), []);
  assert.match(
    validateConfig(dataset, {
      ...SAMPLE_CONFIG,
      unitColumns: ["unit"],
      conversationColumns: ["horizon"],
      groupColumn: "group",
      codes: ["A", "B", "C"],
    }).join(" "),
    /0\/1|true\/false/i,
  );

  for (const invalid of ["-1", "NaN", "Infinity", "", "not-a-number"]) {
    const invalidDataset = parseCsv([
      "unit,horizon,turn,group,A,B,C",
      `u1,h1,1,g1,${invalid},1,1`,
    ].join("\n") + "\n", { name: `invalid-${invalid}.csv`, source: "upload" });
    assert.match(
      validateConfig(invalidDataset, orderedConfig()).join(" "),
      /finite nonnegative/i,
      `ONA must reject ${JSON.stringify(invalid)}`,
    );
  }
});

function csvDatasetWithFirstCount(value: string): ParsedDataset {
  return parseCsv([
    "unit,horizon,turn,group,A,B,C",
    `u1,h1,1,g1,${value},0,0`,
    "u1,h1,2,g1,0,1,0",
    "u1,h2,1,g1,1,0,0",
    "u1,h2,2,g1,0,1,0",
    "u1,h3,1,g1,0,1,1",
  ].join("\n") + "\n", { name: "textual-count-boundary.csv", source: "upload" });
}

test("ONA CSV counts preserve representable nonnegative decimal boundaries", () => {
  for (const [source, expected] of [
    ["0", 0],
    ["0e-324", 0],
    ["5e-324", Number.MIN_VALUE],
    [" 5e-324 ", Number.MIN_VALUE],
  ] as const) {
    const dataset = csvDatasetWithFirstCount(source);
    assert.deepEqual(validateConfig(dataset, orderedConfig()), [], source);
    const plan = buildOpenEnaAnalysisPlan(dataset, orderedConfig());
    assert.equal(plan.options.rows[0]?.A, expected, source);
  }
});

test("ONA CSV counts reject mathematical underflow, negative text including negative zero, and non-finite decimals before plan construction", () => {
  for (const source of [
    "1e-324",
    " 1e-324 ",
    "-1e-324",
    "-0",
    "-0.0e-324",
    "1e309",
    "-1",
    "   ",
  ]) {
    const dataset = csvDatasetWithFirstCount(source);
    assert.match(
      validateConfig(dataset, orderedConfig()).join(" "),
      /finite nonnegative|underflow|representable/i,
      source,
    );
    assert.throws(
      () => buildOpenEnaAnalysisPlan(dataset, orderedConfig()),
      /finite nonnegative|underflow|representable/i,
      source,
    );
  }
});

test("ONA preflight uses the same stable finite-window history as the runtime", () => {
  const dataset = manualDataset([
    { unit: "u1", horizon: "h1", turn: 1, group: "g1", A: 1e16, B: 0, C: 0 },
    { unit: "u1", horizon: "h1", turn: 2, group: "g1", A: 1.5, B: 0, C: 0 },
    { unit: "u1", horizon: "h1", turn: 3, group: "g1", A: 0, B: 1e308, C: 0 },
    { unit: "u1", horizon: "h2", turn: 1, group: "g1", A: 0, B: 1, C: 1 },
  ]);

  assert.deepEqual(validateConfig(dataset, orderedConfig()), []);
  const plan = buildOpenEnaAnalysisPlan(dataset, orderedConfig());
  assert.equal(plan.options.rows[1]?.A, 1.5);
});

test("ONA rejects finite raw counts whose ordered products would overflow", () => {
  const unsafe = manualDataset([
    { unit: "u1", horizon: "h1", turn: 1, group: "g1", A: 1e308, B: 0, C: 1 },
    { unit: "u1", horizon: "h1", turn: 2, group: "g1", A: 0, B: 1e308, C: 1 },
  ]);
  const safe = manualDataset([
    { unit: "u1", horizon: "h1", turn: 1, group: "g1", A: 1e100, B: 0, C: 1 },
    { unit: "u1", horizon: "h1", turn: 2, group: "g1", A: 0, B: 1e100, C: 1 },
  ]);

  assert.deepEqual(validateConfig(safe, orderedConfig()), []);
  assert.match(
    validateConfig(unsafe, orderedConfig()).join(" "),
    /finite numeric safety range|ordered connection accumulation/i,
  );
  assert.throws(
    () => buildOpenEnaAnalysisPlan(unsafe, orderedConfig()),
    /finite numeric safety range|ordered connection accumulation/i,
  );
});

test("ONA rejects positive raw counts whose ordered products underflow to zero", () => {
  const mixed = manualDataset([
    { unit: "tiny", horizon: "tiny-h", turn: 1, group: "g1", A: 1e-200, B: 1e-200, C: 0 },
    { unit: "normal", horizon: "normal-h", turn: 1, group: "g2", A: 1, B: 0, C: 1 },
    { unit: "normal", horizon: "normal-h", turn: 2, group: "g2", A: 0, B: 1, C: 0 },
  ]);

  assert.match(
    validateConfig(mixed, orderedConfig()).join(" "),
    /underflow|finite numeric safety range|ordered connection accumulation/i,
  );
  assert.throws(
    () => buildOpenEnaAnalysisPlan(mixed, orderedConfig()),
    /underflow|finite numeric safety range|ordered connection accumulation/i,
  );
});

test("ONA stably normalizes finite directed counts near 5e299 instead of producing a zero network", () => {
  const mixed = manualDataset([
    { unit: "huge", horizon: "huge-h", turn: 1, group: "g1", A: 1e150, B: 1e150, C: 0 },
    { unit: "normal", horizon: "normal-h", turn: 1, group: "g2", A: 1, B: 0, C: 1 },
  ]);

  assert.deepEqual(validateConfig(mixed, orderedConfig()), []);
  const result = analyzeDataset(mixed, orderedConfig());
  const hugeCounts = result.set.connectionCounts.find((row) => row.ENA_UNIT === "huge");
  const hugeWeights = result.set.lineWeights.find((row) => row.ENA_UNIT === "huge");
  assert.ok(hugeCounts);
  assert.ok(hugeWeights);
  assert.equal(Number.isFinite(Number(hugeCounts["A & B"])), true);
  assert.equal(Number.isFinite(Number(hugeCounts["B & A"])), true);
  assert.ok(Math.abs(Number(hugeCounts["A & B"]) / 5e299 - 1) < 1e-15);
  assert.ok(Math.abs(Number(hugeCounts["B & A"]) / 5e299 - 1) < 1e-15);
  assert.ok(Math.abs(Number(hugeWeights["A & B"]) - 1 / Math.sqrt(2)) < 1e-12);
  assert.ok(Math.abs(Number(hugeWeights["B & A"]) - 1 / Math.sqrt(2)) < 1e-12);
  assert.ok(Number(hugeWeights["A & B"]) > 0);
  assert.ok(Number(hugeWeights["B & A"]) > 0);
});

test("Open ENA preserves the true norm when two directed cells near 1.3e308 would overflow a naive sum of squares", () => {
  const dataset = manualDataset([
    { unit: "huge", horizon: "huge-h", turn: 1, group: "g1", A: 1.3e308, B: 0, C: 0 },
    { unit: "huge", horizon: "huge-h", turn: 2, group: "g1", A: 0, B: 1, C: 1 },
  ]);
  const config = orderedConfig();

  assert.deepEqual(validateConfig(dataset, config), []);
  const result = analyzeDataset(dataset, config);
  const counts = result.set.connectionCounts.find((row) => row.ENA_UNIT === "huge");
  const weights = result.set.lineWeights.find((row) => row.ENA_UNIT === "huge");
  assert.ok(counts);
  assert.ok(weights);
  assert.equal(Number(counts["A & B"]), 1.3e308);
  assert.equal(Number(counts["A & C"]), 1.3e308);
  assert.ok(Number(weights["A & B"]) > 0);
  assert.ok(Number(weights["A & C"]) > 0);
  assert.ok(Math.abs(Number(weights["A & B"]) - Math.SQRT1_2) < 1e-12);
  assert.ok(Math.abs(Number(weights["A & C"]) - Math.SQRT1_2) < 1e-12);
  for (const row of result.set.lineWeights) {
    for (const edge of result.set.codeColumns) {
      assert.equal(Number.isFinite(Number(row[edge])), true, `${edge} must stay finite`);
    }
  }
  for (const point of result.set.points) {
    for (const dimension of result.dimensions) {
      assert.equal(Number.isFinite(Number(point[dimension])), true, `${dimension} must stay finite`);
    }
  }
});

test("the ONA plan binds ordered rows, source indices, raw counts, mask direction, and directed nodes", () => {
  const dataset = manualDataset([
    { unit: "u1", horizon: "h1", turn: 2, group: "g1", A: 0, B: 3, C: 0 },
    { unit: "u1", horizon: "h1", turn: 1, group: "g1", A: 2, B: 0, C: 1 },
  ]);
  const directionalMask = createDirectionalMask(["A", "B", "C"]);
  directionalMask.enabled[0][1] = false; // source A -> target B
  directionalMask.enabled[1][0] = true; // source B -> target A remains enabled
  const config = orderedConfig({ directionalMask });

  const plan = buildOpenEnaAnalysisPlan(dataset, config);

  assert.equal(plan.configuration.analysisKind, "ona");
  assert.equal(plan.options.networkType, "ordered");
  assert.equal(plan.options.nodePositionMethod, "directed");
  assert.deepEqual(plan.options.mask, [
    [1, 0, 1],
    [1, 1, 1],
    [1, 1, 1],
  ]);
  assert.deepEqual(plan.options.rows.map((row) => row.turn), [undefined, undefined]);
  assert.deepEqual(plan.options.rows.map((row) => row.A), [2, 0]);
  assert.equal(plan.options.rows[0].A, 2);
  assert.equal(plan.options.rows[1].B, 3);
  assert.deepEqual(plan.executionProvenance, {
    schemaVersion: 1,
    configuration: plan.configuration,
    analysisKind: "ona",
    networkType: "ordered",
    nodePositionMethod: "directed",
    directionalMask,
    ordering: {
      requestedPolicy: config.orderPolicy,
      resolvedPolicy: {
        kind: "columns",
        columns: ["turn"],
        comparators: { turn: "number" },
        direction: "ascending",
        missing: "reject",
        ties: "reject",
        stable: true,
      },
      responseRowSourceIndices: [1, 0],
    },
  });
  assert.notEqual(plan.executionProvenance.directionalMask, directionalMask);
  assert.notEqual(plan.executionProvenance.ordering?.requestedPolicy, config.orderPolicy);
  assert.notEqual(plan.options.codes, plan.configuration.codes);
  assert.notEqual(plan.options.units, plan.configuration.unitColumns);
  assert.notEqual(plan.options.conversation, plan.configuration.conversationColumns);
  plan.options.codes[0] = "mutated-option";
  plan.options.units[0] = "mutated-unit";
  plan.options.conversation[0] = "mutated-horizon";
  assert.deepEqual(plan.configuration.codes, ["A", "B", "C"]);
  assert.deepEqual(plan.configuration.unitColumns, ["unit"]);
  assert.deepEqual(plan.configuration.conversationColumns, ["horizon"]);
});

test("the standard ENA builder preserves its legacy option shape and binary coercion", () => {
  const dataset = manualDataset([
    { unit: "u1", horizon: "h1", turn: 2, group: "g1", A: "1", B: "0", C: true },
    { unit: "u1", horizon: "h1", turn: 1, group: "g1", A: "0", B: "1", C: false },
  ]);
  const config: OpenEnaConfig = {
    ...SAMPLE_CONFIG,
    unitColumns: ["unit"],
    conversationColumns: ["horizon"],
    groupColumn: "group",
    codes: ["A", "B", "C"],
  };

  const legacy = buildJenaOptions(dataset, config);
  const plan = buildOpenEnaAnalysisPlan(dataset, config);

  assert.deepEqual(plan.options, legacy);
  assert.deepEqual(plan.options.rows.map((row) => row.turn), [undefined, undefined]);
  assert.deepEqual(plan.options.rows.map((row) => [row.A, row.B, row.C]), [[1, 0, 1], [0, 1, 0]]);
  assert.equal(Object.hasOwn(plan.options, "networkType"), false);
  assert.equal(Object.hasOwn(plan.options, "mask"), false);
  assert.equal(Object.hasOwn(plan.options, "nodePositionMethod"), false);
  assert.deepEqual(plan.executionProvenance, {
    schemaVersion: 1,
    configuration: plan.configuration,
    analysisKind: "ena",
    networkType: "standard",
    nodePositionMethod: "undirected",
    directionalMask: null,
    ordering: null,
  });
});

test("ONA runs as an ordered model and exposes descriptive-only statistics", () => {
  const dataset = manualDataset([
    { unit: "u1", horizon: "h1", turn: 1, group: "g1", A: 2, B: 0, C: 1 },
    { unit: "u1", horizon: "h1", turn: 2, group: "g1", A: 0, B: 3, C: 0 },
    { unit: "u2", horizon: "h2", turn: 1, group: "g2", A: 1, B: 1, C: 0 },
    { unit: "u2", horizon: "h2", turn: 2, group: "g2", A: 0, B: 0, C: 2 },
  ]);
  const config = orderedConfig();
  assert.deepEqual(validateConfig(dataset, config), []);

  const result = analyzeDataset(dataset, config);

  assert.equal(result.set.networkType, "ordered");
  assert.equal(result.set.functionParams.networkType, "ordered");
  assert.equal(result.set.adjacencyKey.length, 9);
  assert.equal(result.stats.tests, undefined);
  assert.deepEqual(result.stats.correlations, []);
  assert.equal(result.statsDiagnostics.correlations, "not-applicable-ordered-network");
  assert.equal(result.statsDiagnostics.tests, "not-applicable-ordered-network");
  assert.equal(dimensionEffect(result, "group", result.dimensions[0]), null);
  assert.deepEqual(result.executionProvenance?.ordering?.responseRowSourceIndices, [0, 1, 2, 3]);
});

test("result provenance binding deep-clones the canonical config and validates the source hash", () => {
  const dataset = manualDataset([
    { unit: "u1", horizon: "h1", turn: 1, group: "g1", A: 1, B: 1, C: 1 },
  ]);
  const config = orderedConfig();
  const result = analyzeDataset(dataset, config);
  const hash = "a".repeat(64);

  const bound = bindOpenEnaResultProvenance(result, dataset, hash, config);
  config.codes[0] = "mutated";
  config.directionalMask!.enabled[0][1] = false;

  assert.notEqual(bound, result);
  assert.equal(result.provenanceBinding, undefined);
  assert.notEqual(bound.executionProvenance, result.executionProvenance);
  assert.notEqual(
    bound.executionProvenance?.configuration.directionalMask,
    result.executionProvenance?.configuration.directionalMask,
  );
  assert.equal(bound.provenanceBinding?.datasetNormalizedUtf8TextSha256, hash);
  assert.equal(bound.provenanceBinding?.datasetHashKind, "normalized-utf8-csv-text-sha256");
  assert.deepEqual(bound.provenanceBinding?.configuration.codes, ["A", "B", "C"]);
  assert.equal(bound.provenanceBinding?.configuration.directionalMask?.enabled[0][1], true);
  assert.throws(
    () => bindOpenEnaResultProvenance(result, dataset, "not-a-sha256", orderedConfig()),
    /SHA-256/i,
  );
  assert.throws(
    () => bindOpenEnaResultProvenance(
      result,
      { ...dataset, hashKind: "unknown-hash-kind" as never },
      "d".repeat(64),
      orderedConfig(),
    ),
    /hash kind|hashKind|dataset provenance/i,
  );
  assert.throws(
    () => datasetHashKindFor({ name: dataset.name, hashKind: "unknown-hash-kind" as never }),
    /hash kind|hashKind|dataset provenance/i,
  );
  assert.throws(
    () => buildManifest(
      { ...dataset, hashKind: "unknown-hash-kind" as never },
      orderedConfig(),
      result,
    ),
    /hash kind|hashKind|dataset provenance/i,
  );
  assert.throws(
    () => bindOpenEnaResultProvenance(result, dataset, "b".repeat(64), SAMPLE_CONFIG),
    /does not match|configuration/i,
  );
});

test("binding refuses unexecuted config fields and malformed execution provenance", () => {
  const dataset = manualDataset([
    { unit: "u1", horizon: "h1", turn: 1, group: "g1", A: 1, B: 1, C: 1 },
  ]);
  const executedConfig = orderedConfig({ groupColumn: null, centerAlignToOrigin: true });
  const result = analyzeDataset(dataset, executedConfig);
  const hash = "c".repeat(64);

  assert.throws(
    () => bindOpenEnaResultProvenance(result, dataset, hash, {
      ...executedConfig,
      groupColumn: "group",
    }),
    /does not match|configuration/i,
  );
  assert.throws(
    () => bindOpenEnaResultProvenance(result, dataset, hash, {
      ...executedConfig,
      centerAlignToOrigin: false,
    }),
    /does not match|configuration/i,
  );

  const wrongNodeMethod: typeof result = {
    ...result,
    executionProvenance: {
      ...structuredClone(result.executionProvenance!),
      nodePositionMethod: "undirected",
    },
  };
  assert.throws(
    () => bindOpenEnaResultProvenance(wrongNodeMethod, dataset, hash, executedConfig),
    /execution provenance|directed|node/i,
  );

  const wrongSourceIndex: typeof result = {
    ...result,
    executionProvenance: {
      ...structuredClone(result.executionProvenance!),
      ordering: {
        ...structuredClone(result.executionProvenance!.ordering!),
        responseRowSourceIndices: [999],
      },
    },
  };
  assert.throws(
    () => bindOpenEnaResultProvenance(wrongSourceIndex, dataset, hash, executedConfig),
    /source-index|permutation|execution provenance/i,
  );

  const wrongResolvedPolicy: typeof result = {
    ...result,
    executionProvenance: {
      ...structuredClone(result.executionProvenance!),
      ordering: {
        ...structuredClone(result.executionProvenance!.ordering!),
        resolvedPolicy: {
          ...structuredClone(result.executionProvenance!.ordering!.resolvedPolicy),
          stable: false as never,
        },
      },
    },
  };
  assert.throws(
    () => bindOpenEnaResultProvenance(wrongResolvedPolicy, dataset, hash, executedConfig),
    /resolved|order|execution provenance/i,
  );
});

test("binding recomputes the exact ordered source mapping and rejects sparse or wrong permutations", () => {
  const dataset = manualDataset([
    { unit: "u1", horizon: "h1", turn: 4, group: "g1", A: 1, B: 0, C: 1 },
    { unit: "u1", horizon: "h1", turn: 1, group: "g1", A: 0, B: 1, C: 1 },
    { unit: "u1", horizon: "h1", turn: 3, group: "g1", A: 1, B: 1, C: 0 },
    { unit: "u1", horizon: "h1", turn: 2, group: "g1", A: 1, B: 0, C: 1 },
  ]);
  const config = orderedConfig();
  const result = analyzeDataset(dataset, config);
  const hash = "e".repeat(64);
  assert.deepEqual(result.executionProvenance?.ordering?.responseRowSourceIndices, [1, 3, 2, 0]);

  const sparse = new Array<number>(4);
  sparse[1] = 1;
  sparse[2] = 2;
  sparse[3] = 3;
  const sparseResult: OpenEnaResult = {
    ...result,
    executionProvenance: {
      ...structuredClone(result.executionProvenance!),
      ordering: {
        ...structuredClone(result.executionProvenance!.ordering!),
        responseRowSourceIndices: sparse,
      },
    },
  };
  assert.throws(
    () => bindOpenEnaResultProvenance(sparseResult, dataset, hash, config),
    /source-index|mapping|permutation/i,
  );

  const wrongPermutation: OpenEnaResult = {
    ...result,
    executionProvenance: {
      ...structuredClone(result.executionProvenance!),
      ordering: {
        ...structuredClone(result.executionProvenance!.ordering!),
        responseRowSourceIndices: [0, 1, 2, 3],
      },
    },
  };
  assert.throws(
    () => bindOpenEnaResultProvenance(wrongPermutation, dataset, hash, config),
    /source-index|mapping|permutation/i,
  );
});
