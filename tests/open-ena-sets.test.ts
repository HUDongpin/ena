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
  haveCompatibleSetGeometry,
  removeAnalysisSet,
  repairSetSelection,
  setComparisonEdgesToCsv,
  upsertAnalysisSet,
} from "../lib/open-ena/sets";
import * as setsModule from "../lib/open-ena/sets";
import { SAMPLE_CONFIG, type OpenEnaConfig } from "../lib/open-ena/types";

const sampleText = readFileSync(
  join(process.cwd(), "public", "data", "academy", "ena-design-talk-sample.csv"),
  "utf8",
);
const primaryHash = "a".repeat(64);
const secondaryHash = "b".repeat(64);

function dataset(name = "sample.csv") {
  return parseCsv(sampleText, { name, source: "upload" });
}

function bindResult(
  result: ReturnType<typeof analyzeDataset>,
  hash: string,
  configuration: OpenEnaConfig,
) {
  return {
    ...result,
    provenanceBinding: {
      datasetNormalizedUtf8TextSha256: hash,
      configuration: {
        ...configuration,
        unitColumns: [...configuration.unitColumns],
        conversationColumns: [...configuration.conversationColumns],
        codes: [...configuration.codes],
      },
    },
  };
}

function fittedAndProjected() {
  const primaryDataset = dataset("primary.csv");
  const fitted = bindResult(analyzeDataset(primaryDataset, SAMPLE_CONFIG), primaryHash, SAMPLE_CONFIG);
  const reference = buildReferenceRotationPackage(primaryDataset, SAMPLE_CONFIG, fitted, primaryHash);
  const projectedConfig: OpenEnaConfig = {
    ...SAMPLE_CONFIG,
    rotation: "reference",
    referenceRotationId: reference.referenceId,
  };
  const secondaryDataset = dataset("secondary.csv");
  const projected = bindResult(
    analyzeDataset(secondaryDataset, projectedConfig, reference),
    secondaryHash,
    projectedConfig,
  );
  return { primaryDataset, fitted, reference, secondaryDataset, projectedConfig, projected };
}

test("endpoint capture snapshots fitted and projected provenance without raw rows", () => {
  const { primaryDataset, fitted, reference, secondaryDataset, projectedConfig, projected } = fittedAndProjected();
  const primary = buildAnalysisSet(primaryDataset, primaryHash, SAMPLE_CONFIG, fitted, {
    id: "primary",
    name: "Primary",
    capturedAt: "2026-08-13T00:00:00.000Z",
  });
  const secondary = buildAnalysisSet(secondaryDataset, secondaryHash, projectedConfig, projected, {
    id: "secondary",
    name: "Secondary",
    capturedAt: "2026-08-13T00:01:00.000Z",
  });

  assert.equal(primary.role, "fitted");
  assert.equal(primary.generatedReference?.referenceId, reference.referenceId);
  assert.equal(primary.projectionReference, null);
  assert.equal(secondary.role, "projected");
  assert.equal(secondary.generatedReference, null);
  assert.equal(secondary.projectionReference?.referenceId, reference.referenceId);
  assert.equal(primary.geometry.referenceId, secondary.geometry.referenceId);
  assert.equal(JSON.stringify([primary, secondary]).includes("utterance"), false);
  assert.equal("rows" in primary.dataset, false);

  primaryDataset.name = "mutated.csv";
  SAMPLE_CONFIG.codes[0] = "mutated";
  fitted.set.points[0].ENA_UNIT = "mutated";
  assert.equal(primary.dataset.name, "primary.csv");
  assert.equal(primary.config.codes[0], "goal");
  assert.notEqual(primary.points[0].ENA_UNIT, "mutated");
  SAMPLE_CONFIG.codes[0] = "goal";
});

test("a shared fixed geometry produces equal-unit means and signed primary-minus-secondary edges", () => {
  const { primaryDataset, fitted, secondaryDataset, projectedConfig, projected } = fittedAndProjected();
  const primary = buildAnalysisSet(primaryDataset, primaryHash, SAMPLE_CONFIG, fitted, { id: "p", name: "P" });
  const secondary = buildAnalysisSet(secondaryDataset, secondaryHash, projectedConfig, projected, { id: "s", name: "S" });
  const comparison = compareAnalysisSets(primary, secondary, ["SVD1", "SVD2"], "2026-08-13T00:02:00.000Z");

  assert.equal(haveCompatibleSetGeometry(primary, secondary), true);
  assert.equal(comparison.primary.unitCount, 8);
  assert.equal(comparison.secondary.unitCount, 8);
  assert.equal(comparison.primary.points[0].unitId, "p::team-01");
  assert.equal(comparison.secondary.points[0].unitId, "s::team-01");
  assert.ok(Math.abs(comparison.primary.meanPoint.SVD1
    - fitted.set.points.reduce((sum, row) => sum + Number(row.SVD1), 0) / 8) < 1e-12);
  for (const edge of comparison.edges) {
    assert.ok(Math.abs(edge.signedDifference - (edge.primaryWeight - edge.secondaryWeight)) < 1e-12);
  }
  assert.deepEqual(comparison.nodes.map((node) => node.code), SAMPLE_CONFIG.codes);
});

test("shared comparison fails closed on self, trajectory, axis, semantics, and exact geometry mismatch", () => {
  const { primaryDataset, fitted, secondaryDataset, projectedConfig, projected } = fittedAndProjected();
  const primary = buildAnalysisSet(primaryDataset, primaryHash, SAMPLE_CONFIG, fitted, { id: "p" });
  const secondary = buildAnalysisSet(secondaryDataset, secondaryHash, projectedConfig, projected, { id: "s" });
  assert.throws(() => compareAnalysisSets(primary, primary), /distinct/i);
  assert.throws(() => compareAnalysisSets(primary, secondary, ["SVD1", "missing"]), /dimensions/i);

  const wrongReference = structuredClone(secondary);
  wrongReference.geometry.referenceId = "different";
  assert.equal(haveCompatibleSetGeometry(primary, wrongReference), false);
  assert.throws(() => compareAnalysisSets(primary, wrongReference), /reference/i);

  const wrongMatrix = structuredClone(secondary);
  wrongMatrix.geometry.rotationMatrix[0][0] += 1e-12;
  assert.equal(haveCompatibleSetGeometry(primary, wrongMatrix), false);
  assert.throws(() => compareAnalysisSets(primary, wrongMatrix), /geometry/i);

  const trajectoryConfig: OpenEnaConfig = { ...SAMPLE_CONFIG, model: "SeparateTrajectory" };
  const trajectory = bindResult(
    analyzeDataset(primaryDataset, trajectoryConfig),
    primaryHash,
    trajectoryConfig,
  );
  assert.throws(() => buildAnalysisSet(primaryDataset, primaryHash, SAMPLE_CONFIG, trajectory), /trajectory/i);
});

test("comparison export is raw-row-excluding and records both immutable inputs", () => {
  const { primaryDataset, fitted, secondaryDataset, projectedConfig, projected } = fittedAndProjected();
  const primary = buildAnalysisSet(primaryDataset, primaryHash, SAMPLE_CONFIG, fitted, { id: "p", name: "P" });
  const secondary = buildAnalysisSet(secondaryDataset, secondaryHash, projectedConfig, projected, { id: "s", name: "S" });
  const comparison = compareAnalysisSets(primary, secondary, ["SVD1", "SVD2"], "2026-08-13T00:02:00.000Z");
  const bundle = buildSetComparisonExport(comparison);
  const serialized = JSON.stringify(bundle);

  assert.deepEqual(bundle.sets.map((entry) => [entry.id, entry.name, entry.dataset.normalizedUtf8TextSha256]), [
    ["p", "P", primaryHash],
    ["s", "S", secondaryHash],
  ]);
  assert.equal(bundle.reference.referenceId, primary.geometry.referenceId);
  assert.deepEqual(bundle.selectedAxes, ["SVD1", "SVD2"]);
  assert.equal(bundle.createdAt, "2026-08-13T00:02:00.000Z");
  assert.equal(serialized.includes("utterance"), false);
  assert.equal(serialized.includes("rawRows"), false);
  assert.match(setComparisonEdgesToCsv(comparison), /signedDifference/);
});

test("set collection helpers upsert, remove, and repair distinct selectors", () => {
  const { primaryDataset, fitted, secondaryDataset, projectedConfig, projected } = fittedAndProjected();
  const p = buildAnalysisSet(primaryDataset, primaryHash, SAMPLE_CONFIG, fitted, { id: "p", name: "P" });
  const s = buildAnalysisSet(secondaryDataset, secondaryHash, projectedConfig, projected, { id: "s", name: "S" });
  const renamed = { ...p, name: "Renamed" };
  const sets = upsertAnalysisSet(upsertAnalysisSet([p], s), renamed);
  assert.deepEqual(sets.map((entry) => entry.name), ["Renamed", "S"]);
  assert.deepEqual(repairSetSelection(sets, { primarySetId: "p", secondarySetId: "p" }), {
    primarySetId: "p",
    secondarySetId: "s",
  });
  assert.deepEqual(repairSetSelection(removeAnalysisSet(sets, "p"), {
    primarySetId: "p",
    secondarySetId: "s",
  }), { primarySetId: "s", secondarySetId: null });
});

test("set removal focus chooses successor, predecessor, capture, or heading deterministically", () => {
  const nextFocusId = Reflect.get(setsModule, "nextAnalysisSetRemovalFocusId");
  assert.equal(typeof nextFocusId, "function", "the pure set-removal focus helper must be exported");
  const ids = ["first", "middle", "last"];
  assert.equal(nextFocusId(ids, "first", true), "open-ena-set-remove-middle");
  assert.equal(nextFocusId(ids, "middle", true), "open-ena-set-remove-last");
  assert.equal(nextFocusId(ids, "last", true), "open-ena-set-remove-middle");
  assert.equal(nextFocusId(["only"], "only", true), "open-ena-capture-set");
  assert.equal(nextFocusId(["only"], "only", false), "open-ena-sets-heading");
  assert.equal(nextFocusId(ids, "missing", true), "open-ena-capture-set");
  assert.equal(nextFocusId(ids, "missing", false), "open-ena-sets-heading");
});

test("capture rejects a dataset or configuration that does not reproduce the supplied result", () => {
  const primaryDataset = dataset("primary.csv");
  const fitted = bindResult(analyzeDataset(primaryDataset, SAMPLE_CONFIG), primaryHash, SAMPLE_CONFIG);

  assert.throws(() => buildAnalysisSet(
    primaryDataset,
    primaryHash,
    { ...SAMPLE_CONFIG, weightBy: "sum" },
    fitted,
  ), /does not reproduce|configuration.*result/i);

  const unrelated = parseCsv(sampleText.replace("team-01", "other-team"), {
    name: "unrelated.csv",
    source: "upload",
  });
  assert.throws(() => buildAnalysisSet(unrelated, secondaryHash, SAMPLE_CONFIG, fitted), /does not reproduce|dataset.*result/i);
});
