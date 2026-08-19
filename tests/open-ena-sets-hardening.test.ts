import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { analyzeDataset } from "../lib/open-ena/analyze";
import { parseCsv } from "../lib/open-ena/csv";
import { buildReferenceRotationPackage } from "../lib/open-ena/reference";
import {
  buildAnalysisSet,
  buildSetComparisonExport,
  compareAnalysisSets,
  upsertAnalysisSet,
} from "../lib/open-ena/sets";
import { SAMPLE_CONFIG, type OpenEnaConfig, type OpenEnaResult } from "../lib/open-ena/types";

const sampleText = readFileSync(
  join(process.cwd(), "public", "data", "academy", "ena-design-talk-sample.csv"),
  "utf8",
);
const fittedHash = "a".repeat(64);
const projectedHash = "b".repeat(64);

function cloneConfig(config: OpenEnaConfig): OpenEnaConfig {
  return {
    ...config,
    unitColumns: [...config.unitColumns],
    conversationColumns: [...config.conversationColumns],
    codes: [...config.codes],
  };
}

function bindResult(result: OpenEnaResult, hash: string, config: OpenEnaConfig): OpenEnaResult {
  return {
    ...result,
    provenanceBinding: {
      datasetNormalizedUtf8TextSha256: hash,
      configuration: cloneConfig(config),
    },
  };
}

function fixtures() {
  const fittedConfig = cloneConfig(SAMPLE_CONFIG);
  const fittedDataset = parseCsv(sampleText, { name: "fitted.csv", source: "upload" });
  const fittedResult = bindResult(
    analyzeDataset(fittedDataset, fittedConfig),
    fittedHash,
    fittedConfig,
  );
  const fittedReference = buildReferenceRotationPackage(
    fittedDataset,
    fittedConfig,
    fittedResult,
    fittedHash,
  );
  const projectedConfig: OpenEnaConfig = {
    ...cloneConfig(fittedConfig),
    rotation: "reference",
    referenceRotationId: fittedReference.referenceId,
  };
  const projectedDataset = parseCsv(sampleText, { name: "projected.csv", source: "upload" });
  const projectedResult = bindResult(
    analyzeDataset(projectedDataset, projectedConfig, fittedReference),
    projectedHash,
    projectedConfig,
  );
  const fittedSet = buildAnalysisSet(fittedDataset, fittedHash, fittedConfig, fittedResult, {
    id: "fitted-set",
    name: "Fitted set",
    capturedAt: "2026-08-13T00:00:00.000Z",
  });
  const projectedSet = buildAnalysisSet(projectedDataset, projectedHash, projectedConfig, projectedResult, {
    id: "projected-set",
    name: "Projected set",
    capturedAt: "2026-08-13T00:01:00.000Z",
  });
  return { fittedResult, fittedReference, fittedSet, projectedSet };
}

test("captured endpoint sets retain one precomputed equal-unit mean per edge", () => {
  const { fittedResult, fittedSet } = fixtures();
  const retained = fittedSet as unknown as Record<string, unknown>;
  const meanWeights = retained.meanWeights as Record<string, number> | undefined;

  assert.ok(meanWeights, "a captured endpoint set must retain precomputed meanWeights");
  assert.deepEqual(Object.keys(meanWeights), fittedResult.set.adjacencyKey.map((edge) => edge.name));
  for (const edge of fittedResult.set.adjacencyKey) {
    const expected = fittedResult.set.lineWeights.reduce(
      (total, row) => total + Number(row[edge.name]),
      0,
    ) / fittedResult.set.lineWeights.length;
    assert.ok(
      Math.abs(meanWeights[edge.name] - expected) < 1e-12,
      `${edge.name} must be the equal-unit mean captured from the endpoint model`,
    );
  }
});

test("captured endpoint sets omit the per-unit line-weight table", () => {
  const { fittedSet } = fixtures();
  assert.equal(
    "lineWeights" in (fittedSet as unknown as Record<string, unknown>),
    false,
    "captured sets must not retain one edge-weight row per analytic unit",
  );
});

test("the six-set cap rejects a seventh unique ID but still permits replacement upserts", () => {
  const { fittedSet } = fixtures();
  const sixSets = Array.from({ length: 6 }, (_, index) => ({
    ...structuredClone(fittedSet),
    id: `set-${index + 1}`,
    name: `Set ${index + 1}`,
  }));
  const replacement = {
    ...structuredClone(fittedSet),
    id: "set-3",
    name: "Replacement set 3",
  };
  const replaced = upsertAnalysisSet(sixSets, replacement);

  assert.equal(replaced.length, 6, "replacement must not consume another retained-set slot");
  assert.equal(replaced.find((entry) => entry.id === "set-3")?.name, "Replacement set 3");
  assert.throws(
    () => upsertAnalysisSet(replaced, {
      ...structuredClone(fittedSet),
      id: "set-7",
      name: "Set 7",
    }),
    /(?:at most|limit).*6|six.*(?:analysis )?sets/i,
  );
});

test("comparison export records exactly one compact canonical fitted-reference provenance", () => {
  const { fittedReference, fittedSet, projectedSet } = fixtures();
  const comparison = compareAnalysisSets(
    fittedSet,
    projectedSet,
    ["SVD1", "SVD2"],
    "2026-08-13T00:02:00.000Z",
  );
  const bundle = buildSetComparisonExport(comparison);
  const reference = bundle.reference as unknown as Record<string, unknown>;
  const { rotationSet: _rotationSet, ...expectedProvenance } = fittedReference;

  for (const [key, value] of Object.entries(expectedProvenance)) {
    assert.deepEqual(reference[key], value, `comparison reference must preserve canonical ${key}`);
  }
  assert.equal("rotationSet" in reference, false, "compact comparison provenance must not duplicate rotation geometry");

  let referenceProvenanceCount = 0;
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (!Array.isArray(value)
      && (value as Record<string, unknown>).kind === "open-ena-reference-rotation") {
      referenceProvenanceCount += 1;
    }
    for (const child of Object.values(value as Record<string, unknown>)) visit(child);
  };
  visit(bundle);
  assert.equal(referenceProvenanceCount, 1, "comparison export must contain one reference provenance object");
});

test("comparison rejects mismatched declared reference provenance despite identical geometry", () => {
  const { fittedSet, projectedSet } = fixtures();
  const mismatched = structuredClone(projectedSet);
  if (!mismatched.projectionReference) throw new Error("The projected fixture must retain projection provenance.");
  mismatched.projectionReference.source.normalizedUtf8TextSha256 = "c".repeat(64);

  assert.deepEqual(mismatched.geometry, fittedSet.geometry, "the mismatch fixture must preserve identical geometry");
  assert.throws(
    () => compareAnalysisSets(fittedSet, mismatched, ["SVD1", "SVD2"]),
    /reference.*provenance|provenance.*reference/i,
  );
});
