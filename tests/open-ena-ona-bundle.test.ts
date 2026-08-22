import assert from "node:assert/strict";
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

function orderedFixture() {
  const rows: Row[] = [
    { unit: "u1", horizon: "h1", turn: 1, group: "g1", A: 2, B: 0, C: 1 },
    { unit: "u1", horizon: "h1", turn: 2, group: "g1", A: 0, B: 3, C: 1 },
    { unit: "u2", horizon: "h2", turn: 1, group: "g2", A: 1, B: 1, C: 0 },
    { unit: "u2", horizon: "h2", turn: 2, group: "g2", A: 0, B: 1, C: 2 },
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

test("bundle parser migrates only legacy standard ENA manifests", () => {
  const { dataset, config, result } = standardFixture();
  const current = structuredClone(buildAnalysisBundle(dataset, config, result, SOURCE_HASH)) as Record<string, any>;
  const legacy = structuredClone(current);
  legacy.schemaVersion = 1;
  delete legacy.inference;
  legacy.manifest.schemaVersion = 1;
  delete legacy.manifest.analysis;
  delete legacy.manifest.effectiveJenaOptions.networkType;
  delete legacy.manifest.effectiveJenaOptions.mask;
  delete legacy.modelData.analysisKind;
  delete legacy.modelData.networkType;
  delete legacy.modelData.functionParams.networkType;

  assert.doesNotThrow(() => parseOpenEnaAnalysisBundle(JSON.stringify(legacy)));

  const orderedLegacy = structuredClone(legacy);
  orderedLegacy.manifest.configuration.analysisKind = "ona";
  orderedLegacy.manifest.configuration.orderPolicy = {
    kind: "source-row",
    confirmed: true,
  };
  orderedLegacy.manifest.configuration.directionalMask = createDirectionalMask(["A", "B", "C"]);
  orderedLegacy.manifest.effectiveJenaOptions.networkType = "ordered";
  orderedLegacy.manifest.effectiveJenaOptions.nodePositionMethod = "directed";
  orderedLegacy.modelData.functionParams.networkType = "ordered";
  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(orderedLegacy)),
    /legacy.*ENA-only|schema-v1.*ordered|legacy.*ordered/i,
  );

  const nullInfinityLegacy = structuredClone(legacy);
  nullInfinityLegacy.manifest.configuration.windowSizeBack = null;
  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(nullInfinityLegacy)),
    /windowSizeBack|Infinity|null/i,
  );

  const widthOnlyLegacy = structuredClone(legacy);
  widthOnlyLegacy.modelData.codeColumns = Array.from({ length: 9 }, (_, index) => `edge-${index}`);
  widthOnlyLegacy.modelData.connectionMatrix = widthOnlyLegacy.modelData.connectionMatrix.map(() => (
    Array.from({ length: 9 }, () => 0)
  ));
  assert.throws(
    () => parseOpenEnaAnalysisBundle(JSON.stringify(widthOnlyLegacy)),
    /network shape|connectionMatrix|standard|legacy/i,
    "a p-squared matrix alone must never migrate legacy schema v1 to ONA",
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
