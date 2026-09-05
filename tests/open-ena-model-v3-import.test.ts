import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as artifacts from "../lib/open-ena/export";
import { SAMPLE_CONFIG, type OpenEnaConfig } from "../lib/open-ena/types";
import { analyzeDataset, runStandardPlanV3 } from "../lib/open-ena/analyze";
import { parseCsv } from "../lib/open-ena/csv";
import { buildReferenceRotationPackage } from "../lib/open-ena/reference";
import { BUNDLE_JSON_LIMITS_V3, captureBundleJsonV3, parseBundleJsonV3 } from "../lib/open-ena/bundle-json-v3";
import { sha256CanonicalJsonV3, sha256TextV3 } from "../lib/open-ena/model-v3/canonical-json";
import { compileOnaDraftV3, compileStandardDraftV3, isCompilerOwnedReadyResultV3 } from "../lib/open-ena/model-v3/compiler";
import { bindResultV3 } from "../lib/open-ena/model-v3/result-binding";
import { fitReferenceSourceV3 } from "../lib/open-ena/model-v3/reference-v2";
import { createDirectionalMask } from "../lib/open-ena/network-config";
import { migrateLegacyOpenEnaConfigToDraftV3 } from "../lib/open-ena/model-v3/migration";
import type { StandardEnaDraftV3 } from "../lib/open-ena/model-v3/types";
import { bindingFixtureV3 } from "./helpers/open-ena-model-v3-fixture";
import { decodeSerializedStandardCompileProvenanceV3 } from "../lib/open-ena/model-v3/execution-plan";
import { buildOnaExecutionPlanV3, runOnaPlanV3 } from "../lib/open-ena/model-v3/ona-adapter";
import { bindOnaResultV3 } from "../lib/open-ena/model-v3/ona-result-binding";

const textOf = (file: { bytes: Uint8Array }) => new TextDecoder().decode(file.bytes);
const draftFixture = (): StandardEnaDraftV3 => structuredClone(migrateLegacyOpenEnaConfigToDraftV3(SAMPLE_CONFIG).standard);
const legacyReference = () => {
  const text = readFileSync(new URL("../public/data/academy/ena-design-talk-sample.csv", import.meta.url), "utf8");
  const dataset = parseCsv(text, { name: "sample.csv", source: "sample" });
  return buildReferenceRotationPackage(dataset, SAMPLE_CONFIG, analyzeDataset(dataset, SAMPLE_CONFIG));
};

async function rehash(value: Record<string, unknown>) {
  const { integrity: _old, ...payload } = value;
  value.integrity = { algorithm: "SHA-256", canonicalPayloadSha256: await sha256CanonicalJsonV3(payload) };
  return JSON.stringify(value);
}

async function boundFixture() {
  const { plan, compiled } = await bindingFixtureV3();
  const result = await bindResultV3(plan, runStandardPlanV3(plan), {
    processedRows: plan.rows.length, maximumBufferedRows: 0, numericCellsAllocated: 120,
    peakBytesObservedOrBounded: 10_240, observationMethod: "exact-counters-and-conservative-byte-bound",
  }, compiled.diagnostics);
  return { plan, compiled, result };
}

test("legacy configuration import previews an unconfirmed draft without auto-running", async () => {
  assert.equal(typeof artifacts.importOpenEnaArtifactV3, "function", "unified artifact importer is required");
  const legacyConfig: OpenEnaConfig = { ...SAMPLE_CONFIG, window: "MovingStanzaWindow" };
  const imported = await artifacts.importOpenEnaArtifactV3(JSON.stringify(legacyConfig));
  assert.equal(imported.kind, "draft");
  assert.equal(imported.autoRun, false);
  if (imported.kind !== "draft") throw new Error("Expected draft preview");
  assert.equal(imported.draft.standard.movingStanza.rowOrder, null);
  assert.equal(imported.review.includes("row-order"), true);
});

test("legacy Means trajectories keep Group but require both orders and researcher direction", async () => {
  const imported = await artifacts.importOpenEnaArtifactV3(JSON.stringify({
    ...SAMPLE_CONFIG, window: "MovingStanzaWindow", model: "SeparateTrajectory", rotation: "mean",
  }));
  assert.equal(imported.kind, "draft");
  if (imported.kind !== "draft") throw new Error("Expected draft");
  assert.equal(imported.draft.standard.groupColumn, SAMPLE_CONFIG.groupColumn);
  assert.equal(imported.draft.standard.horizonOrder, null);
  assert.deepEqual(imported.draft.standard.rotation, {
    type: "means", centerAlignToOrigin: SAMPLE_CONFIG.centerAlignToOrigin, negativeLevel: null, positiveLevel: null,
  });
  for (const reason of ["row-order", "horizon-order", "means-direction"]) assert.ok(imported.review.includes(reason));
});

test("legacy ONA keeps explicit numeric order and mask, portable Infinity remains explicit", async () => {
  const imported = await artifacts.importOpenEnaArtifactV3(JSON.stringify({
    ...SAMPLE_CONFIG, analysisKind: "ona", model: "EndPoint", window: "MovingStanzaWindow",
    codes: ["A", "B", "C"], windowSizeBack: "Infinity", windowSizeForward: 0,
    weightBy: "sum", rotation: "svd", centerAlignToOrigin: true,
    orderPolicy: { kind: "columns", columns: ["time"], comparators: { time: "number" } },
    directionalMask: createDirectionalMask(["A", "B", "C"]),
  }));
  if (imported.kind !== "draft") throw new Error("Expected draft");
  assert.equal(imported.draft.activeFamily, "ona");
  assert.deepEqual(imported.draft.ona.backward, { kind: "infinity" });
  assert.deepEqual(imported.draft.ona.rowOrder, { kind: "columns", keys: [{ column: "time", direction: "ascending", comparator: { type: "number" } }] });
  assert.deepEqual(imported.draft.ona.directionalMask, createDirectionalMask(["A", "B", "C"]));
});

test("exported invalid draft states round-trip without silent repair or readiness admission", async () => {
  const drafts = [draftFixture(), draftFixture(), draftFixture()];
  drafts[0].codes = [];
  drafts[1].model = "SeparateTrajectory";
  drafts[1].rotation = { type: "means", centerAlignToOrigin: false, negativeLevel: null, positiveLevel: null };
  drafts[2].movingStanza.backward = { kind: "finite", value: -3 };
  for (const draft of drafts) {
    const imported = await artifacts.importOpenEnaArtifactV3(textOf(await artifacts.exportDraftV3(draft)));
    if (imported.kind !== "draft") throw new Error("Expected draft");
    assert.deepEqual(imported.draft.standard, draft);
    assert.equal(imported.autoRun, false);
    assert.equal(imported.replaceDraftAction.required, true);
    assert.ok(imported.review.includes("compile-before-run"));
    assert.ok(Object.isFrozen(imported.draft.standard));
  }
});

test("canonical Standard import preserves source-bound confirmation but cannot transfer compiler authority", async () => {
  const { compiled } = await bindingFixtureV3("a".repeat(64), (draft, data) => {
    draft.windowType = "MovingStanzaWindow";
    draft.movingStanza.rowOrder = { kind: "source-order-confirmed", confirmation: {
      kind: "explicit-researcher-confirmation", analysisFamily: "standard", datasetSha256: "a".repeat(64),
      rowCount: data.rows.length, relevantColumns: ["horizon"], confirmedAt: "2026-09-05T00:00:00.000Z", confirmationVersion: 1,
    } };
  });
  const file = await artifacts.exportCanonicalConfigV3(compiled);
  const imported = await artifacts.importOpenEnaArtifactV3(textOf(file));
  if (imported.kind !== "draft") throw new Error("Expected draft");
  assert.equal(isCompilerOwnedReadyResultV3(imported), false);
  assert.equal(imported.autoRun, false);
  assert.equal(compiled.canonicalConfiguration.window.type, "MovingStanzaWindow");
  if (compiled.canonicalConfiguration.window.type !== "MovingStanzaWindow") throw new Error("Expected Moving Stanza");
  assert.deepEqual(imported.draft.standard.movingStanza.rowOrder, compiled.canonicalConfiguration.window.rowOrder);
  assert.equal(imported.receivedArtifactSha256, file.fileSha256);
  assert.ok(imported.review.includes("dataset-bound-confirmations"));
  const otherDataset = parseCsv("unit,horizon,A,B,C\nu1,h1,1,1,1\nu2,h1,1,2,3", { name: "other.csv", source: "upload" });
  const recompiled = await compileStandardDraftV3(otherDataset, "b".repeat(64), imported.draft.standard);
  assert.equal(recompiled.status, "invalid");
});

test("compiler-exported ONA config and shaped ONA draft both import as ONA drafts", async () => {
  const dataset = parseCsv("u,h,t,A,B,C\nu1,h1,1,2,0,1\nu2,h1,2,0,3,1\nu1,h2,1,0,2,2", { name: "ona.csv", source: "upload" });
  dataset.rows = [{ u: "u1", h: "h1", t: 1, A: 2, B: 0, C: 1 }, { u: "u2", h: "h1", t: 2, A: 0, B: 3, C: 1 }, { u: "u1", h: "h2", t: 1, A: 0, B: 2, C: 2 }];
  const draft = { unitColumns: ["u"], horizonColumns: ["h"], groupColumn: null, codes: ["A", "B", "C"],
    backward: { kind: "finite" as const, value: 2 }, rowOrder: { kind: "columns" as const, keys: [{ column: "t", direction: "ascending" as const, comparator: { type: "number" as const } }] as [{ column: string; direction: "ascending"; comparator: { type: "number" } }] },
    directionalMask: createDirectionalMask(["A", "B", "C"]),
  };
  const compiled = await compileOnaDraftV3(dataset, "d".repeat(64), draft);
  assert.equal(compiled.status, "ready", JSON.stringify(compiled.diagnostics));
  if (compiled.status !== "ready") throw new Error("Expected ONA readiness");
  for (const file of [await artifacts.exportCanonicalConfigV3(compiled), await artifacts.exportDraftV3(draft)]) {
    const imported = await artifacts.importOpenEnaArtifactV3(textOf(file));
    if (imported.kind !== "draft") throw new Error("Expected draft");
    assert.equal(imported.draft.activeFamily, "ona");
    assert.deepEqual(imported.draft.ona, draft);
  }
  const plan = await buildOnaExecutionPlanV3(dataset, "d".repeat(64), compiled.canonicalConfiguration);
  const result = await bindOnaResultV3(plan, runOnaPlanV3(plan), {
    processedRows: dataset.rows.length, maximumRetainedRowsAfterChunk: 0,
    bufferedRowsPeakUpperBound: Math.min(dataset.rows.length, plan.header.resourceEstimate.estimatedRetainedWindowRows + 1),
    numericCellsUpperBound: plan.operationalAdmission.totalNumericCells,
    peakBytesUpperBound: plan.operationalAdmission.totalPeakBytes,
    observationMethod: "dimension-bounds-and-chunk-boundary-stream-state",
  });
  for (const file of [await artifacts.exportCurrentAnalysisV3(result, plan), await artifacts.exportStaleAuditV3(result, "f".repeat(64))]) {
    const imported = await artifacts.importOpenEnaArtifactV3(textOf(file));
    if (imported.kind !== "historical-result") throw new Error("Expected ONA history");
    assert.deepEqual(imported.loadConfigurationAction.draft.ona, draft);
  }
  const artifact = JSON.parse(textOf(await artifacts.exportCanonicalConfigV3(compiled)));
  for (const change of [
    { configurationSha256: "b".repeat(64) }, { status: "ready" },
    { resourceEstimate: { ...artifact.payload.compileProvenance.resourceEstimate, directionalMaskCells: 10 ** 12 } },
    { diagnostics: [{ id: "unknown", severity: "warning", scope: "rotation", summary: "invalid", detail: "invalid", blocks: [] }] },
  ]) await assert.rejects(artifacts.importOpenEnaArtifactV3(await rehash({ ...artifact, payload: {
    ...artifact.payload, compileProvenance: { ...artifact.payload.compileProvenance, ...change },
  } })));
});

test("canonical Means and trajectory configurations preserve their distinct scientific intent", async () => {
  for (const model of ["EndPoint", "SeparateTrajectory", "AccumulatedTrajectory"] as const) {
    const { compiled } = await bindingFixtureV3("a".repeat(64), (draft, dataset) => {
      draft.model = model;
      if (model === "EndPoint") draft.rotation = { type: "means", centerAlignToOrigin: true,
        negativeLevel: { type: "string", value: "Control" }, positiveLevel: { type: "string", value: "Treatment" } };
      else {
        dataset.rows.forEach((row, index) => {
          row.unit = index % 2 === 0 ? "u1" : "u2";
          row.group = index % 2 === 0 ? "Control" : "Treatment";
        });
        draft.horizonOrder = { kind: "source-order-confirmed", confirmation: {
        kind: "explicit-researcher-confirmation", analysisFamily: "standard", datasetSha256: "a".repeat(64),
        rowCount: 5, relevantColumns: ["unit", "horizon"], confirmedAt: "2026-09-05T00:00:00.000Z", confirmationVersion: 1,
        } };
      }
    });
    const imported = await artifacts.importOpenEnaArtifactV3(textOf(await artifacts.exportCanonicalConfigV3(compiled)));
    if (imported.kind !== "draft") throw new Error("Expected draft");
    assert.equal(imported.draft.standard.model, model);
    if (model === "EndPoint") assert.deepEqual(imported.draft.standard.rotation, {
      type: "means", centerAlignToOrigin: true,
      negativeLevel: { type: "string", value: "Control" }, positiveLevel: { type: "string", value: "Treatment" },
    });
    else {
      const analysisModel = compiled.canonicalConfiguration.analysis.model;
      if (analysisModel.type === "EndPoint") throw new Error("Expected trajectory");
      assert.deepEqual(imported.draft.standard.horizonOrder, analysisModel.horizonOrder);
    }
  }
});

test("new serialized Standard claims decoder is bounded, detached and returns no ready authority", async () => {
  const { compiled } = await bindingFixtureV3();
  const artifact = JSON.parse(textOf(await artifacts.exportCanonicalConfigV3(compiled)));
  const input = { configuration: artifact.payload.configuration, compileProvenance: artifact.payload.compileProvenance };
  const pending = decodeSerializedStandardCompileProvenanceV3(input);
  input.compileProvenance.configurationSha256 = "b".repeat(64);
  const claims = await pending;
  assert.equal(claims.configurationSha256, compiled.configurationSha256);
  assert.equal("status" in claims, false);
  assert.equal("canonicalConfiguration" in claims, false);
  assert.equal(isCompilerOwnedReadyResultV3(claims), false);
  assert.equal(Object.isFrozen(claims), true);
  for (const invalid of [
    { ...input, surprise: true }, { ...input, compileProvenance: { ...input.compileProvenance, status: "ready" } },
    { ...input, configuration: { bomb: Array(250_001).fill(0) } }, { ...input, configuration: { n: NaN } },
  ]) await assert.rejects(decodeSerializedStandardCompileProvenanceV3(invalid));
});

test("genuine legacy schema-v2 Standard and ONA bundles retain complete parser admission", async () => {
  const dataset = parseCsv("u,h,t,A,B,C\nu1,h1,1,2,0,1\nu2,h1,2,0,3,1\nu1,h2,1,0,2,2", { name: "legacy.csv", source: "upload" });
  dataset.rows = [{ u: "u1", h: "h1", t: 1, A: 2, B: 0, C: 1 }, { u: "u2", h: "h1", t: 2, A: 0, B: 3, C: 1 }, { u: "u1", h: "h2", t: 1, A: 0, B: 2, C: 2 }];
  for (const family of ["ena", "ona"] as const) {
    const config: OpenEnaConfig = { ...SAMPLE_CONFIG, analysisKind: family, unitColumns: ["u"], conversationColumns: ["h"],
      codes: ["A", "B", "C"], groupColumn: null, window: "MovingStanzaWindow", windowSizeBack: 2, windowSizeForward: 0,
      weightBy: "sum", orderPolicy: family === "ona" ? { kind: "columns", columns: ["t"], comparators: { t: "number" } } : null,
      directionalMask: family === "ona" ? createDirectionalMask(["A", "B", "C"]) : null };
    const bundle = artifacts.buildAnalysisBundle(dataset, config, analyzeDataset(dataset, config), "a".repeat(64));
    const imported = await artifacts.importOpenEnaArtifactV3(JSON.stringify(bundle));
    if (imported.kind !== "historical-result") throw new Error("Expected history");
    assert.equal(imported.artifact.schemaVersion, 2);
    assert.equal(imported.loadConfigurationAction.draft.activeFamily, family === "ena" ? "standard" : "ona");
    await assert.rejects(artifacts.importOpenEnaArtifactV3(JSON.stringify({ ...bundle, unexpected: true })));
  }
});

test("draft exporter/importer preserves long admitted labels; duplicate Codes are the explicit exception", async () => {
  const draft = draftFixture();
  draft.groupColumn = "group".repeat(20_000);
  const imported = await artifacts.importOpenEnaArtifactV3(textOf(await artifacts.exportDraftV3(draft)));
  if (imported.kind !== "draft") throw new Error("Expected draft");
  assert.deepEqual(imported.draft.standard, draft);
  draft.codes = ["A", "A", "C"];
  await assert.rejects(artifacts.importOpenEnaArtifactV3(textOf(await artifacts.exportDraftV3(draft))), /Codes.*unique/i);
});

test("draft previews explicitly report unsupported Means trajectories and missing Reference confirmation", async () => {
  const draft = draftFixture();
  draft.model = "SeparateTrajectory";
  draft.rotation = { type: "means", centerAlignToOrigin: true, negativeLevel: null, positiveLevel: null };
  const means = await artifacts.importOpenEnaArtifactV3(textOf(await artifacts.exportDraftV3(draft)));
  assert.ok(means.review.includes("means-trajectory"));
  draft.rotation = { type: "reference", referenceId: "legacy-reference", expectedContentSha256: null };
  const reference = await artifacts.importOpenEnaArtifactV3(textOf(await artifacts.exportDraftV3(draft)));
  assert.ok(reference.review.includes("reference-content-hash"));
});

test("native v3 analysis and STALE audit imports remain historical with explicit load actions", async () => {
  const { plan, result } = await boundFixture();
  const files = [await artifacts.exportCurrentAnalysisV3(result, plan), await artifacts.exportStaleAuditV3(result, "f".repeat(64))];
  for (const file of files) {
    const imported = await artifacts.importOpenEnaArtifactV3(textOf(file));
    if (imported.kind !== "historical-result") throw new Error("Expected historical result");
    assert.equal(imported.readOnly, true);
    assert.equal(imported.autoRun, false);
    assert.equal(imported.loadConfigurationAction.required, true);
    assert.deepEqual(imported.loadConfigurationAction.draft.standard.codes, ["A", "B", "C"]);
    assert.ok(imported.review.includes("source-currentness-unverified"));
    assert.equal(isCompilerOwnedReadyResultV3(imported), false);
  }
});

test("native Reference v2 becomes an immutable candidate without registration or selection", async () => {
  const { plan, result } = await boundFixture();
  const sourceWitness = await fitReferenceSourceV3(plan);
  const file = await artifacts.exportReferenceV2(result, { sourceWitness, currentPlan: plan, displayName: "Original fit" });
  const imported = await artifacts.importOpenEnaArtifactV3(textOf(file));
  if (imported.kind !== "reference-candidate") throw new Error("Expected Reference candidate");
  assert.equal(imported.candidate.schemaVersion, 2);
  assert.equal(imported.registerReferenceAction.required, true);
  assert.equal(imported.selectReferenceAction.required, true);
  assert.equal(imported.autoRun, false);
  assert.deepEqual(imported.candidate, JSON.parse(textOf(file)));
  assert.equal(Object.isFrozen(imported.candidate), true);
});

test("legacy Reference reports received hash and missing provenance without inventing v2 evidence", async () => {
  const reference = legacyReference();
  const text = JSON.stringify(reference, null, 2);
  const imported = await artifacts.importOpenEnaArtifactV3(text);
  if (imported.kind !== "reference-candidate") throw new Error("Expected Reference candidate");
  assert.equal(imported.candidate.schemaVersion, 1);
  assert.equal(imported.receivedArtifactSha256, await sha256TextV3(text));
  assert.equal(imported.acknowledgeLegacyAction.required, true);
  assert.ok(imported.missingProvenance.includes("source.normalizedUtf8TextSha256"));
  assert.ok(imported.missingProvenance.includes("source.configurationSha256"));
  assert.ok(imported.missingProvenance.includes("source.executionPlanSha256"));
  assert.equal("contentSha256" in imported.candidate, false);
  assert.equal("sourceProofSha256" in imported.candidate.source, false);
});

test("strict artifact identity, family, integrity and provenance failures preserve the caller state", async () => {
  const { compiled, result } = await boundFixture();
  const canonical = JSON.parse(textOf(await artifacts.exportCanonicalConfigV3(compiled)));
  const draft = JSON.parse(textOf(await artifacts.exportDraftV3(draftFixture())));
  const stale = JSON.parse(textOf(await artifacts.exportStaleAuditV3(result, "f".repeat(64))));
  const mutations = [
    { ...canonical, family: "ONA" }, { ...canonical, executable: false },
    { ...canonical, extra: true }, { ...canonical, payload: { ...canonical.payload, compileProvenance: {} } },
    { ...canonical, payload: { ...canonical.payload, compileProvenance: { ...canonical.payload.compileProvenance, configurationSha256: "e".repeat(64) } } },
    { ...draft, analysisFamily: "ona" }, { ...draft, executable: true },
    { ...draft, draft: { ...draft.draft, codes: ["A", "A", "C"] } },
    { ...stale, analysisFamily: "ona" }, { ...stale, staleAgainst: { currentDraftFingerprint: "not-a-hash" } },
    { ...stale, staleReasons: [] },
  ];
  const currentDraft = draftFixture();
  const registry = [legacyReference()];
  const before = JSON.stringify({ currentDraft, registry });
  for (const mutation of mutations) await assert.rejects(artifacts.importOpenEnaArtifactV3(await rehash(mutation)));
  await assert.rejects(artifacts.importOpenEnaArtifactV3(JSON.stringify({ ...draft, integrity: { algorithm: "SHA-256", canonicalPayloadSha256: "e".repeat(64) } })), /integrity|hash/i);
  assert.equal(JSON.stringify({ currentDraft, registry }), before);
});

test("bounded tokenizer rejects hostile text before artifacts materialize", async () => {
  const hostile = [
    '{"schemaVersion":1,"schemaVersion":3}', '{"codes":[],"co\\u0064es":[]}',
    '{"__proto__":{"polluted":true}}', '{"constr\\u0075ctor":{}}',
    '['.repeat(66) + '0' + ']'.repeat(66), '[' + '0,'.repeat(250_000) + '0]',
    '{' + Array.from({ length: 250_001 }, (_, i) => `"k${i}":0`).join(',') + '}',
    '{"n":1e999}', '{"schemaVersion":999,"kind":"open-ena-draft"}',
    '{"kind":"future-artifact"}', JSON.stringify({ ...SAMPLE_CONFIG, codes: ["A", "A", "C"] }),
    JSON.stringify({ ...SAMPLE_CONFIG, analysisKind: "ena", directionalMask: createDirectionalMask(["A", "B", "C"]) }),
    JSON.stringify({ ...SAMPLE_CONFIG, windowSizeBack: Number.NaN }),
  ];
  const state = { currentDraft: draftFixture(), registry: [legacyReference()] };
  const before = JSON.stringify(state);
  for (const text of hostile) await assert.rejects(artifacts.importOpenEnaArtifactV3(text));
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(JSON.stringify(state), before);
  assert.throws(() => captureBundleJsonV3({ n: Infinity }), /finite/i);
  await assert.rejects(artifacts.importOpenEnaArtifactV3({ n: NaN } as unknown as string), /size|string/i);
});

test("string and numeric token bounds are explicit and preserve existing finite exporter admission", () => {
  assert.equal(BUNDLE_JSON_LIMITS_V3.stringLength, BUNDLE_JSON_LIMITS_V3.bytes);
  assert.equal(BUNDLE_JSON_LIMITS_V3.numberMagnitude, Number.MAX_VALUE);
  assert.equal(BUNDLE_JSON_LIMITS_V3.objectKeys, 250_000);
  assert.equal(parseBundleJsonV3(JSON.stringify(Number.MAX_VALUE)), Number.MAX_VALUE);
  assert.equal(parseBundleJsonV3(JSON.stringify("x".repeat(100_000))), "x".repeat(100_000));
  assert.throws(() => parseBundleJsonV3('"' + 'x'.repeat(BUNDLE_JSON_LIMITS_V3.stringLength + 1) + '"'), /size|string/i);
});

test("Reference source-model disguise, unknown fields and dimension bombs are rejected", async () => {
  const reference = legacyReference();
  for (const value of [
    { ...reference, sourceModel: "SeparateTrajectory" },
    { ...reference, compatibility: { ...reference.compatibility, model: "SeparateTrajectory" } },
    { ...reference, fit: { ...reference.fit, sourceModel: "SeparateTrajectory" } },
    { ...reference, rotationSet: { ...reference.rotationSet, rotationMatrix: [[0]] } },
    { ...reference, rotationSet: { ...reference.rotationSet, codes: Array.from({ length: 10_000 }, (_, i) => `C${i}`) } },
    { ...reference, compatibility: { ...reference.compatibility, windowSizeBack: -1 } },
  ]) await assert.rejects(artifacts.importOpenEnaArtifactV3(JSON.stringify(value)));
});

test("genuine schema-v1 result stays historical and requires explicit configuration loading", async () => {
  assert.equal(typeof artifacts.importOpenEnaArtifactV3, "function", "unified artifact importer is required");
  const currentDraft = structuredClone(SAMPLE_CONFIG);
  const registry = [{ id: "existing-reference", contentSha256: "a".repeat(64) }];
  const before = JSON.stringify({ currentDraft, registry });
  const text = readFileSync(new URL("./fixtures/open-ena/analysis-bundle-v1.json", import.meta.url), "utf8");
  const imported = await artifacts.importOpenEnaArtifactV3(text);
  assert.equal(imported.kind, "historical-result");
  assert.equal(imported.autoRun, false);
  if (imported.kind !== "historical-result") throw new Error("Expected historical preview");
  assert.equal(imported.loadConfigurationAction.required, true);
  assert.equal(imported.readOnly, true);
  assert.equal(imported.artifact.schemaVersion, 1);
  assert.equal(Object.isFrozen(imported.artifact), true);
  assert.equal(JSON.stringify({ currentDraft, registry }), before);
});
