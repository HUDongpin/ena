import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { analyzeDataset, buildJenaOptions, buildManifest } from "../lib/open-ena/analyze";
import { parseCsv } from "../lib/open-ena/csv";
import { buildAnalysisBundle, buildResultTables } from "../lib/open-ena/export";
import {
  buildReferenceRotationPackage,
  parseRotationReference,
  validateReferenceCompatibility,
} from "../lib/open-ena/reference";
import { SAMPLE_CONFIG, type OpenEnaConfig } from "../lib/open-ena/types";

const projectRoot = process.cwd();
const SAMPLE_HASH = "a".repeat(64);
const FITTED_HASH = "b".repeat(64);
const HELD_OUT_HASH = "c".repeat(64);
const sampleText = readFileSync(
  join(projectRoot, "public", "data", "academy", "ena-design-talk-sample.csv"),
  "utf8",
);

function sampleDataset() {
  return parseCsv(sampleText, { name: "ena-design-talk-sample.csv", source: "sample" });
}

test("an ENA.HK reference rotation package validates and self-projects without coordinate drift", () => {
  const dataset = sampleDataset();
  const fitted = analyzeDataset(dataset, SAMPLE_CONFIG);
  const referencePackage = buildReferenceRotationPackage(dataset, SAMPLE_CONFIG, fitted, SAMPLE_HASH);
  const reference = parseRotationReference(JSON.stringify(referencePackage), "academy-reference.json");
  assert.deepEqual(reference.fit, {
    method: "svd",
    unitColumns: SAMPLE_CONFIG.unitColumns,
    conversationColumns: SAMPLE_CONFIG.conversationColumns,
  });
  const projectedConfig: OpenEnaConfig = {
    ...SAMPLE_CONFIG,
    rotation: "reference",
    referenceRotationId: reference.referenceId,
  };

  assert.deepEqual(validateReferenceCompatibility(projectedConfig, reference), []);
  const options = buildJenaOptions(dataset, projectedConfig, reference);
  assert.equal("rotation" in options, false);
  assert.deepEqual(options.rotationSet, fitted.set.rotation);

  const projected = analyzeDataset(dataset, projectedConfig, reference);
  assert.equal(projected.projectionReference?.referenceId, reference.referenceId);
  assert.deepEqual(projected.dimensions, fitted.dimensions);
  for (let rowIndex = 0; rowIndex < fitted.set.points.length; rowIndex += 1) {
    for (const dimension of fitted.dimensions) {
      assert.ok(
        Math.abs(Number(fitted.set.points[rowIndex][dimension]) - Number(projected.set.points[rowIndex][dimension])) < 1e-12,
        `${dimension} row ${rowIndex} should remain in the reference geometry`,
      );
    }
  }

  const manifest = buildManifest(dataset, projectedConfig, projected, HELD_OUT_HASH);
  assert.equal(manifest.result.projectionReference?.referenceId, reference.referenceId);
  assert.equal(manifest.effectiveJenaOptions.rotation.method, "reference");
  assert.equal(manifest.effectiveJenaOptions.rotation.referenceId, reference.referenceId);
});

test("a jENA mean-rotation reference round-trips and self-projects without coordinate drift", () => {
  const dataset = sampleDataset();
  const meanConfig: OpenEnaConfig = { ...SAMPLE_CONFIG, rotation: "mean" };
  const fitted = analyzeDataset(dataset, meanConfig);
  const referencePackage = buildReferenceRotationPackage(dataset, meanConfig, fitted, SAMPLE_HASH);
  assert.equal(referencePackage.rotationSet.rotationColumns[0], "MR1");
  assert.deepEqual(referencePackage.rotationSet.eigenvalues, []);

  const repeatedGroup = structuredClone(referencePackage);
  if (repeatedGroup.fit.method !== "mean") throw new Error("Expected a mean reference fit.");
  repeatedGroup.fit.groupOrder = [repeatedGroup.fit.groupOrder[0], repeatedGroup.fit.groupOrder[0]];
  assert.throws(
    () => parseRotationReference(JSON.stringify(repeatedGroup), "bad-mean-reference.json"),
    /two distinct ordered groups/i,
  );

  const reference = parseRotationReference(JSON.stringify(referencePackage), "mean-reference.json");
  assert.deepEqual(reference.fit, {
    method: "mean",
    unitColumns: SAMPLE_CONFIG.unitColumns,
    conversationColumns: SAMPLE_CONFIG.conversationColumns,
    groupColumn: SAMPLE_CONFIG.groupColumn,
    groupOrder: fitted.groups.map((group) => group.name),
  });
  const meanBundle = buildAnalysisBundle(dataset, meanConfig, fitted, SAMPLE_HASH);
  const meanFromBundle = parseRotationReference(JSON.stringify(meanBundle), "mean-results.json");
  assert.deepEqual(meanFromBundle.fit, reference.fit);
  const missingV2Inference = structuredClone(meanBundle) as Partial<typeof meanBundle>;
  delete missingV2Inference.inference;
  assert.throws(
    () => parseRotationReference(JSON.stringify(missingV2Inference), "invalid-v2-results.json"),
    /schema-v2 analysis bundle must contain inference/i,
  );
  const projectedConfig: OpenEnaConfig = {
    ...meanConfig,
    rotation: "reference",
    referenceRotationId: reference.referenceId,
  };
  const projected = analyzeDataset(dataset, projectedConfig, reference);
  assert.equal(projected.statsDiagnostics.correlations, "not-applicable-reference");
  assert.equal(projected.statsDiagnostics.tests, "complete");
  assert.deepEqual(projected.stats.correlations, []);
  assert.deepEqual(buildResultTables(projected).centroids, []);
  for (let rowIndex = 0; rowIndex < fitted.set.points.length; rowIndex += 1) {
    for (const dimension of fitted.dimensions) {
      assert.ok(
        Math.abs(Number(fitted.set.points[rowIndex][dimension]) - Number(projected.set.points[rowIndex][dimension])) < 1e-12,
        `${dimension} row ${rowIndex} should remain in the mean-rotation reference geometry`,
      );
    }
  }
});

test("reference projection fails closed on scientifically incompatible model choices", () => {
  const dataset = sampleDataset();
  const fitted = analyzeDataset(dataset, SAMPLE_CONFIG);
  const reference = parseRotationReference(
    JSON.stringify(buildReferenceRotationPackage(dataset, SAMPLE_CONFIG, fitted, SAMPLE_HASH)),
    "academy-reference.json",
  );
  const base: OpenEnaConfig = {
    ...SAMPLE_CONFIG,
    rotation: "reference",
    referenceRotationId: reference.referenceId,
  };

  assert.match(validateReferenceCompatibility({ ...base, codes: [...base.codes].reverse() }, reference).join(" "), /same code names and order/);
  assert.match(validateReferenceCompatibility({ ...base, windowSizeBack: base.windowSizeBack + 1 }, reference).join(" "), /backward window/);
  assert.match(validateReferenceCompatibility({ ...base, weightBy: "sum" }, reference).join(" "), /weighting/);
  assert.match(validateReferenceCompatibility({ ...base, centerAlignToOrigin: false }, reference).join(" "), /zero-network/);
  assert.match(validateReferenceCompatibility({ ...base, model: "SeparateTrajectory" }, reference).join(" "), /endpoint/);
  assert.throws(() => buildJenaOptions(dataset, { ...base, referenceRotationId: "missing" }), /reference rotation/i);
});

test("reference import rejects malformed matrices and accepts a raw-row-excluding result bundle", () => {
  const dataset = sampleDataset();
  const fitted = analyzeDataset(dataset, SAMPLE_CONFIG);
  const referencePackage = buildReferenceRotationPackage(dataset, SAMPLE_CONFIG, fitted, SAMPLE_HASH);
  const malformed = structuredClone(referencePackage);
  malformed.rotationSet.rotationMatrix[0][0] = Number.NaN;
  assert.throws(
    () => parseRotationReference(JSON.stringify(malformed), "bad-reference.json"),
    /finite numeric rotation matrix/i,
  );

  const bundleLike = {
    schemaVersion: 1,
    app: "ENA.HK Open ENA",
    manifest: buildManifest(dataset, SAMPLE_CONFIG, fitted, SAMPLE_HASH),
    rotationSet: referencePackage.rotationSet,
  };
  const fromBundle = parseRotationReference(JSON.stringify(bundleLike), "results.json");
  assert.deepEqual(fromBundle.rotationSet.codes, SAMPLE_CONFIG.codes);
  assert.equal(fromBundle.source.normalizedUtf8TextSha256, SAMPLE_HASH);
  assert.equal(JSON.stringify(fromBundle).includes("utterance"), false);
});

test("reference import rejects noncanonical axes, adjacency metadata, and node schemas", () => {
  const dataset = sampleDataset();
  const fitted = analyzeDataset(dataset, SAMPLE_CONFIG);
  const referencePackage = buildReferenceRotationPackage(dataset, SAMPLE_CONFIG, fitted, SAMPLE_HASH);
  const parse = (value: typeof referencePackage) => parseRotationReference(JSON.stringify(value), "mutated-reference.json");

  const oversized = structuredClone(referencePackage);
  oversized.rotationSet.rotationColumns.push("SVD11");
  oversized.rotationSet.eigenvalues.push(0);
  oversized.rotationSet.rotationMatrix.forEach((row) => row.push(0));
  assert.throws(() => parse(oversized), /one axis per adjacency edge/i);

  const identityCollision = structuredClone(referencePackage);
  identityCollision.rotationSet.rotationColumns[0] = "ENA_UNIT";
  assert.throws(() => parse(identityCollision), /canonical SVD or mean-rotation names/i);

  const wrongAdjacencyName = structuredClone(referencePackage);
  wrongAdjacencyName.rotationSet.adjacencyKey[0].name = "WRONG";
  assert.throws(() => parse(wrongAdjacencyName), /exactly match the code names and order/i);

  const wrongNodeCode = structuredClone(referencePackage);
  if (!wrongNodeCode.rotationSet.nodes) throw new Error("The fitted test reference should contain node positions.");
  wrongNodeCode.rotationSet.nodes[0].code = "WRONG";
  assert.throws(() => parse(wrongNodeCode), /one ordered row per code/i);

  const nonFiniteNode = structuredClone(referencePackage);
  if (!nonFiniteNode.rotationSet.nodes) throw new Error("The fitted test reference should contain node positions.");
  nonFiniteNode.rotationSet.nodes[0][nonFiniteNode.rotationSet.rotationColumns[0]] = "garbage";
  assert.throws(() => parse(nonFiniteNode), /finite coordinates for the displayed dimensions/i);

  const privateNodeField = structuredClone(referencePackage);
  if (!privateNodeField.rotationSet.nodes) throw new Error("The fitted test reference should contain node positions.");
  privateNodeField.rotationSet.nodes[0].utterance = "private source text";
  assert.throws(() => parse(privateNodeField), /only code and displayed-dimension coordinates/i);

  const nonOrthonormal = structuredClone(referencePackage);
  nonOrthonormal.rotationSet.rotationMatrix[0][0] += 0.5;
  assert.throws(() => parse(nonOrthonormal), /orthonormal basis/i);

  const negativeEigenvalue = structuredClone(referencePackage);
  negativeEigenvalue.rotationSet.eigenvalues[0] = -1;
  assert.throws(() => parse(negativeEigenvalue), /nonnegative eigenvalues/i);

  const missingSvdEigenvalues = structuredClone(referencePackage);
  missingSvdEigenvalues.rotationSet.eigenvalues = [];
  assert.throws(() => parse(missingSvdEigenvalues), /SVD eigenvalues must match/i);

  const impossibleCenter = structuredClone(referencePackage);
  impossibleCenter.rotationSet.centerVector.fill(Number.MAX_VALUE);
  assert.throws(() => parse(impossibleCenter), /valid sphere-normalized mean/i);

  const missingFitUnit = structuredClone(referencePackage);
  missingFitUnit.fit.unitColumns = [];
  assert.throws(() => parse(missingFitUnit), /at least one unit and conversation column/i);
});

test("paper-style composite reference mappings survive package round-trip", () => {
  const dataset = parseCsv(
    "Group,Name,Lesson,A,B,C\nG1,Alex,L1,1,1,0\nG1,Alex,L2,0,1,1\nG2,Blair,L1,1,0,1\nG2,Blair,L2,1,1,0\n",
    { name: "paper-mapping.csv", source: "upload" },
  );
  const config: OpenEnaConfig = {
    ...SAMPLE_CONFIG,
    unitColumns: ["Group", "Name"],
    conversationColumns: ["Group", "Name", "Lesson"],
    groupColumn: "Group",
    codes: ["A", "B", "C"],
    window: "Conversation",
  };
  const result = analyzeDataset(dataset, config);
  const reference = parseRotationReference(JSON.stringify(
    buildReferenceRotationPackage(dataset, config, result, SAMPLE_HASH),
  ));
  assert.deepEqual(reference.fit.unitColumns, ["Group", "Name"]);
  assert.deepEqual(reference.fit.conversationColumns, ["Group", "Name", "Lesson"]);
});

test("reference provenance and code dimensions are validated before expensive expansion", () => {
  const dataset = sampleDataset();
  const fitted = analyzeDataset(dataset, SAMPLE_CONFIG);
  const referencePackage = buildReferenceRotationPackage(dataset, SAMPLE_CONFIG, fitted, SAMPLE_HASH);

  const badHash = structuredClone(referencePackage);
  badHash.source.normalizedUtf8TextSha256 = "not-a-sha256";
  assert.throws(() => parseRotationReference(JSON.stringify(badHash)), /64-character SHA-256/i);

  const badTimestamp = structuredClone(referencePackage);
  badTimestamp.source.analyzedAt = "sometime yesterday";
  assert.throws(() => parseRotationReference(JSON.stringify(badTimestamp)), /ISO timestamp/i);

  const tooManyCodes = structuredClone(referencePackage) as unknown as Record<string, unknown>;
  const rotationSet = tooManyCodes.rotationSet as Record<string, unknown>;
  rotationSet.codes = Array.from({ length: 1_000 }, (_, index) => `C${index}`);
  rotationSet.adjacencyKey = [];
  assert.throws(
    () => parseRotationReference(JSON.stringify(tooManyCodes), "wide-reference.json"),
    /at most 30 codes/i,
  );
});

test("a projected result bundle preserves the original fitted-reference lineage", () => {
  const fittedDataset = sampleDataset();
  const fitted = analyzeDataset(fittedDataset, SAMPLE_CONFIG);
  const original = buildReferenceRotationPackage(fittedDataset, SAMPLE_CONFIG, fitted, FITTED_HASH);
  const projectedDataset = { ...sampleDataset(), name: "held-out.csv", source: "upload" as const };
  const projectedConfig: OpenEnaConfig = {
    ...SAMPLE_CONFIG,
    rotation: "reference",
    referenceRotationId: original.referenceId,
  };
  const projected = analyzeDataset(projectedDataset, projectedConfig, original);
  const bundle = buildAnalysisBundle(projectedDataset, projectedConfig, projected, HELD_OUT_HASH);
  const reimported = parseRotationReference(JSON.stringify(bundle), "held-out-results.json");

  assert.equal(reimported.referenceId, original.referenceId);
  assert.equal(reimported.name, original.name);
  assert.deepEqual(reimported.source, original.source);
  assert.equal(reimported.source.datasetName, fittedDataset.name);
  assert.equal(reimported.source.normalizedUtf8TextSha256, FITTED_HASH);
  assert.notEqual(reimported.source.normalizedUtf8TextSha256, HELD_OUT_HASH);

  const missingLineage = structuredClone(bundle);
  missingLineage.manifest.result.projectionReference = null;
  assert.throws(
    () => parseRotationReference(JSON.stringify(missingLineage), "missing-lineage-results.json"),
    /projection lineage is inconsistent/i,
  );

  const mismatchedMethod = structuredClone(bundle);
  mismatchedMethod.manifest.effectiveJenaOptions.rotation = { method: "svd" };
  assert.throws(
    () => parseRotationReference(JSON.stringify(mismatchedMethod), "mismatched-lineage-results.json"),
    /projection lineage is inconsistent/i,
  );

  const mismatchedId = structuredClone(bundle);
  if (mismatchedId.manifest.result.projectionReference) {
    mismatchedId.manifest.result.projectionReference.referenceId = "different-reference";
  }
  assert.throws(
    () => parseRotationReference(JSON.stringify(mismatchedId), "mismatched-id-results.json"),
    /reference identifier is inconsistent/i,
  );
});

test("the reference-space workflow is visible, local, and explicitly endpoint-only", () => {
  const workspace = readFileSync(join(projectRoot, "components", "open-ena", "OpenEnaWorkspace.tsx"), "utf8");
  const plot = readFileSync(join(projectRoot, "components", "open-ena", "OpenEnaPlot.tsx"), "utf8");
  assert.match(workspace, /Import reference rotation/);
  assert.match(workspace, /Project into reference rotation/);
  assert.match(workspace, /Projected into reference/);
  assert.match(workspace, /buildReferenceRotationPackage/);
  assert.match(workspace, /parseRotationReference/);
  assert.match(workspace, /validateReferenceCompatibility/);
  assert.match(workspace, /Reference rotation JSON/);
  assert.match(workspace, /const \[referenceBusy, setReferenceBusy\] = useState\(false\)/);
  assert.match(workspace, /referenceImportRef\.current !== importToken/);
  assert.match(workspace, /async function loadSample\(\) \{[\s\S]{0,140}referenceImportRef\.current = null;[\s\S]{0,80}setReferenceBusy\(false\)/);
  assert.match(workspace, /async function openCodedData\(file: File\) \{[\s\S]{0,140}referenceImportRef\.current = null;[\s\S]{0,80}setReferenceBusy\(false\)/);
  assert.match(workspace, /async function openReferenceRotation\(file: File\) \{[\s\S]{0,100}if \(sourceAbortRef\.current\) return/);
  assert.match(workspace, /setResult\(null\)[\s\S]{0,80}setResultConfig\(null\)/);
  assert.match(workspace, /size-bounded convenience/);
  assert.match(workspace, /valid bundles may be larger/);
  assert.match(workspace, /source identity are not independently verified/);
  assert.match(workspace, /not-applicable-reference/);
  assert.match(workspace, /Valid result bundles can be larger/);
  assert.match(workspace, /dedicated compact Reference rotation JSON for dependable projection interchange/);
  assert.match(workspace, /buildAnalysisBundle\([\s\S]{0,1600}true,/);
  assert.match(workspace, /buildReferenceRotationPackage\([\s\S]{0,180}true,/);
  assert.match(plot, /Projected into fixed reference:/);
  assert.match(plot, /analyzed-table SHA-256/);
  assert.match(plot, /Variance shares describe current data in this fixed basis, not reference-fit explained variance/);
  assert.match(plot, /ena-reference-figure-provenance/);
});
