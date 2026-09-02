import assert from "node:assert/strict";
import test from "node:test";
import type { Row } from "jena-js";
import { analyzeDataset } from "../lib/open-ena/analyze";
import {
  OPEN_ENA_CAPABILITIES,
  OpenEnaCapabilityError,
  assertOpenEnaCapabilityForConfig,
  assertOpenEnaCapabilityForResult,
  openEnaAnalysisKindFromResult,
} from "../lib/open-ena/capabilities";
import { buildOpenEnaAiInterpretationRequest, buildOpenEnaAiInterpretationRequestV1 } from "../lib/open-ena/ai-interpretation";
import { buildPairwiseGroupContrast } from "../lib/open-ena/contrasts";
import { buildEndpointMannWhitney } from "../lib/open-ena/inference";
import { runOpenEnaInferenceV2 } from "../lib/open-ena/inference-v2";
import { buildLongitudinalDerivation } from "../lib/open-ena/longitudinal";
import { createDirectionalMask } from "../lib/open-ena/network-config";
import { compileOpenEna3dPlotSpec } from "../lib/open-ena/plot3d";
import { buildReferenceRotationPackage, validateReferenceCompatibility } from "../lib/open-ena/reference";
import {
  buildAnalysisSet,
  compareAnalysisSets,
  openEnaSharedEdgesToCsv,
  setComparisonEdgesToCsv,
} from "../lib/open-ena/sets";
import {
  SAMPLE_CONFIG,
  type OpenEnaAnalysisSet,
  type OpenEnaConfig,
  type OpenEnaResult,
  type OpenEnaRotationReference,
  type OpenEnaSharedComparison,
  type ParsedDataset,
} from "../lib/open-ena/types";

function fixture() {
  const rows: Row[] = [
    { unit: "u1", horizon: "h1", turn: 1, group: "g1", A: 1, B: 1, C: 0 },
    { unit: "u1", horizon: "h1", turn: 2, group: "g1", A: 0, B: 1, C: 1 },
    { unit: "u2", horizon: "h2", turn: 1, group: "g2", A: 1, B: 0, C: 1 },
    { unit: "u2", horizon: "h2", turn: 2, group: "g2", A: 1, B: 1, C: 0 },
  ];
  const dataset: ParsedDataset = {
    name: "capability.csv",
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
  return { dataset, config, result: analyzeDataset(dataset, config) };
}

function expectBlocked(callback: () => unknown, feature: string) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof OpenEnaCapabilityError);
    assert.equal(error.code, "ona-feature-not-verified");
    assert.equal(error.feature, feature);
    assert.match(error.message, /descriptive-only|not verified/i);
    return true;
  });
}

test("central capabilities classify ENA and ONA explicitly and reject unknown runtime networks", () => {
  const { config, result } = fixture();
  assert.equal(openEnaAnalysisKindFromResult(result), "ona");
  assert.equal(openEnaAnalysisKindFromResult(analyzeDataset({
    name: "standard.csv",
    headers: ["unit", "horizon", "group", "A", "B", "C"],
    rows: [
      { unit: "u1", horizon: "h1", group: "g1", A: 1, B: 1, C: 0 },
      { unit: "u2", horizon: "h2", group: "g2", A: 0, B: 1, C: 1 },
    ],
    sizeBytes: 0,
    source: "upload",
  }, {
    ...SAMPLE_CONFIG,
    unitColumns: ["unit"],
    conversationColumns: ["horizon"],
    groupColumn: "group",
    codes: ["A", "B", "C"],
  })), "ena");

  assert.equal(OPEN_ENA_CAPABILITIES.ona.threeDimensionalPlot, true);
  assert.doesNotThrow(() => assertOpenEnaCapabilityForConfig(config, "3d"));
  assert.doesNotThrow(() => assertOpenEnaCapabilityForResult(result, "3d"));
  for (const feature of [
    "analysis-sets",
    "reference-rotation",
    "group-contrast",
    "trajectory",
    "inference",
    "ai-interpretation",
  ] as const) {
    expectBlocked(() => assertOpenEnaCapabilityForConfig(config, feature), feature);
    expectBlocked(() => assertOpenEnaCapabilityForResult(result, feature), feature);
  }
  assert.throws(
    () => openEnaAnalysisKindFromResult({
      ...result,
      set: { ...result.set, networkType: "mystery" as never },
    }),
    (error) => error instanceof OpenEnaCapabilityError && error.code === "analysis-network-invalid",
  );
  assert.throws(
    () => openEnaAnalysisKindFromResult({
      ...result,
      set: {
        ...result.set,
        networkType: undefined,
        functionParams: { ...result.set.functionParams, networkType: "ordered" },
      },
    }),
    (error) => error instanceof OpenEnaCapabilityError && error.code === "analysis-network-mismatch",
  );
  assert.throws(
    () => openEnaAnalysisKindFromResult({
      ...result,
      set: {
        ...result.set,
        functionParams: { ...result.set.functionParams, networkType: "mystery" as never },
      },
    }),
    (error) => error instanceof OpenEnaCapabilityError && error.code === "analysis-network-invalid",
  );
});

test("all unverified production entry points fail closed for ONA before legacy processing", async () => {
  const { dataset, config, result } = fixture();

  expectBlocked(() => buildAnalysisSet(dataset, null, config, result), "analysis-sets");
  expectBlocked(() => compareAnalysisSets(
    { config } as OpenEnaAnalysisSet,
    { config } as OpenEnaAnalysisSet,
  ), "analysis-sets");
  const forgedComparison = {
    primary: { config },
    secondary: { config },
    edges: [],
  } as unknown as OpenEnaSharedComparison;
  expectBlocked(() => setComparisonEdgesToCsv(forgedComparison), "analysis-sets");
  expectBlocked(() => openEnaSharedEdgesToCsv(forgedComparison), "analysis-sets");
  expectBlocked(() => buildReferenceRotationPackage(dataset, config, result), "reference-rotation");
  expectBlocked(() => validateReferenceCompatibility(
    config,
    {} as OpenEnaRotationReference,
  ), "reference-rotation");
  expectBlocked(() => buildPairwiseGroupContrast(result, config, "g1", "g2"), "group-contrast");
  const poisonedDimensions: OpenEnaResult = {
    ...result,
    dimensions: {
      slice() {
        throw new Error("legacy dimensions slice ran before the ONA capability guard");
      },
    } as unknown as string[],
  };
  expectBlocked(
    () => buildPairwiseGroupContrast(poisonedDimensions, config, "g1", "g2"),
    "group-contrast",
  );
  expectBlocked(() => buildLongitudinalDerivation(result, config, dataset, {} as never), "trajectory");
  assert.throws(
    () => compileOpenEna3dPlotSpec({ result } as never),
    /standard ENA|ordered ONA|dedicated ordered 3D compiler/i,
  );
  const poisoned3dInput = new Proxy({ result }, {
    get(target, property, receiver) {
      if (property === "result") return Reflect.get(target, property, receiver);
      throw new Error(`3D input property ${String(property)} was read before the ONA capability guard`);
    },
  });
  assert.throws(
    () => compileOpenEna3dPlotSpec(poisoned3dInput as never),
    /standard ENA|ordered ONA|dedicated ordered 3D compiler/i,
  );
  expectBlocked(() => buildEndpointMannWhitney(result, "group", result.dimensions), "inference");
  await assert.rejects(
    () => runOpenEnaInferenceV2({ result } as never),
    (error) => error instanceof OpenEnaCapabilityError
      && error.code === "ona-feature-not-verified"
      && error.feature === "inference",
  );
  expectBlocked(
    () => buildOpenEnaAiInterpretationRequestV1({ result, config } as never),
    "ai-interpretation",
  );
  expectBlocked(
    () => buildOpenEnaAiInterpretationRequest({ result, config } as never),
    "ai-interpretation",
  );
});

test("result/config disagreements fail closed rather than inferring analysis kind from matrix width", () => {
  const { config, result } = fixture();
  const tampered: OpenEnaResult = {
    ...result,
    executionProvenance: {
      ...result.executionProvenance!,
      analysisKind: "ena",
      networkType: "standard",
    },
  };
  assert.throws(
    () => assertOpenEnaCapabilityForResult(tampered, "analysis-sets"),
    (error) => error instanceof OpenEnaCapabilityError && error.code === "analysis-network-mismatch",
  );
  assert.throws(
    () => assertOpenEnaCapabilityForConfig({ ...config, analysisKind: "ena" }, "analysis-sets"),
    /order policy|directional mask|standard ENA/i,
  );
});
