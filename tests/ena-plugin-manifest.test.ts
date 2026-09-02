import assert from "node:assert/strict";
import test from "node:test";
import {
  OPEN_ENA_PLUGIN_CATALOG,
  getOpenEnaPluginBySlug,
} from "@/lib/open-ena/plugins/catalog";
import {
  parseOpenEnaPluginManifestV1,
} from "@/lib/open-ena/plugins/manifest";
import { openEnaPluginManifestHash, openEnaPluginReviewedManifestHash } from "@/lib/open-ena/plugins/manifest-hash";
import { sha256HexUtf8 } from "@/lib/open-ena/plugins/sha256";

const SHA = "a".repeat(64);

function validManifest() {
  return {
    schemaVersion: "ena.hk/plugin-manifest/v1",
    pluginId: "ena-hk/example-presenter",
    slug: "example-presenter",
    version: "1.2.3",
    contributionKinds: ["presenter-3d"],
    riskLevel: "P0",
    changesAnalysis: false,
    lifecycle: "research-preview",
    scientificEvidence: "display-only",
    content: {
      en: {
        name: "Example presenter",
        tagline: "Displays one fitted result.",
        researchQuestion: "How can a fitted result be explored?",
        limitations: ["It does not create a new analysis."],
        claims: ["Displays existing fitted coordinates."],
        nonClaims: ["Does not refit ENA."],
      },
      "zh-hant": {
        name: "示例呈現器",
        tagline: "呈現同一個已擬合結果。",
        researchQuestion: "如何探索已擬合結果？",
        limitations: ["它不會建立新的分析。"],
        claims: ["呈現現有的已擬合座標。"],
        nonClaims: ["不會重新擬合 ENA。"],
      },
      "zh-hans": {
        name: "示例呈现器",
        tagline: "呈现同一个已拟合结果。",
        researchQuestion: "如何探索已拟合结果？",
        limitations: ["它不会建立新的分析。"],
        claims: ["呈现现有的已拟合坐标。"],
        nonClaims: ["不会重新拟合 ENA。"],
      },
    },
    authors: [{ name: "Researcher", role: "conceptualization", publicConsent: true }],
    maintainer: { name: "Dr. Peter Hu", publicConsent: true },
    compatibility: {
      coreApi: "1",
      jenaVersions: ["0.7.0-ona.0"],
      resultSchemaVersions: [2],
      analysisKinds: ["ena"],
      modelTypes: ["EndPoint"],
      minimumDimensions: 3,
      requiredCapabilities: ["3d"],
    },
    permissions: {
      dataAccessTier: "D2",
      network: "none",
      storage: "none",
      externalProcessing: false,
    },
    scientificBoundary: {
      claims: ["Displays existing fitted coordinates."],
      nonClaims: ["Does not refit ENA."],
    },
    engineeringAssurance: {
      automatedTests: "passed",
      browserRuntime: "pending",
      securityPrivacyReview: "pending",
      lastReviewed: "2026-09-02",
    },
    source: {
      repository: "https://github.com/HUDongpin/ena",
      revision: null,
      artifactSha256: null,
      fixtureSetSha256: SHA,
    },
    approvalBinding: {
      methodSpecificationSha256: null,
      reviewedManifestSha256: null,
    },
    licenses: {
      code: "GPL-3.0-only",
      documentation: "CC-BY-4.0",
      sampleData: "CC0-1.0",
    },
    citation: "https://www.ena.hk/en/plugins/example-presenter",
    reviewReceipts: [],
    changelog: [{ version: "1.2.3", date: "2026-09-02", summary: { en: "Initial preview.", "zh-hant": "首次預覽。", "zh-hans": "首次预览。" } }],
  };
}

test("the V1 plugin parser returns a deeply frozen strict manifest", () => {
  const parsed = parseOpenEnaPluginManifestV1(validManifest());
  assert.equal(parsed.pluginId, "ena-hk/example-presenter");
  assert.ok(Object.isFrozen(parsed));
  assert.ok(Object.isFrozen(parsed.content.en));
  assert.ok(Object.isFrozen(parsed.compatibility.analysisKinds));
  assert.throws(
    () => parseOpenEnaPluginManifestV1({ ...validManifest(), executableUrl: "https://example.com/plugin.js" }),
    /unknown field executableUrl/iu,
  );
});

test("production receipts bind the exact reviewed manifest, method, version, source, artifact, and fixtures", () => {
  const methodSpecificationSha256 = "b".repeat(64);
  const revision = "d".repeat(40);
  const artifactSha256 = "e".repeat(64);
  const fixtureSetSha256 = "f".repeat(64);
  const unsigned = {
    ...validManifest(),
    lifecycle: "production",
    engineeringAssurance: { automatedTests: "passed", browserRuntime: "passed", securityPrivacyReview: "passed", lastReviewed: "2026-09-02" },
    source: { ...validManifest().source, revision, artifactSha256, fixtureSetSha256 },
    approvalBinding: { methodSpecificationSha256, reviewedManifestSha256: null },
    reviewReceipts: [],
  };
  const reviewedManifestSha256 = openEnaPluginReviewedManifestHash(unsigned);
  const binding = {
    pluginId: "ena-hk/example-presenter",
    pluginVersion: "1.2.3",
    methodSpecificationSha256,
    reviewedManifestSha256,
    sourceRevision: revision,
    artifactSha256,
    fixtureSetSha256,
  };
  const production = {
    ...unsigned,
    approvalBinding: { methodSpecificationSha256, reviewedManifestSha256 },
    reviewReceipts: ["engineering", "security-privacy", "product"].map((kind, index) => ({ kind, status: "passed", receiptSha256: String(index + 1).repeat(64), binding })),
  };
  assert.doesNotThrow(() => parseOpenEnaPluginManifestV1(production));
  assert.throws(() => parseOpenEnaPluginManifestV1({ ...production, source: { ...production.source, artifactSha256: null }, reviewReceipts: [] }), /production.*artifact/iu);
  assert.throws(() => parseOpenEnaPluginManifestV1({ ...production, version: "1.2.4" }), /receipt.*version|binding/iu);
  assert.throws(() => parseOpenEnaPluginManifestV1({ ...production, engineeringAssurance: { ...production.engineeringAssurance, browserRuntime: "pending" } }), /production.*assurance/iu);
});

test("manifest validation rejects scientific, permission, and release contradictions", () => {
  assert.throws(
    () => parseOpenEnaPluginManifestV1({ ...validManifest(), changesAnalysis: true }),
    /display-only.*cannot change/iu,
  );
  assert.throws(
    () => parseOpenEnaPluginManifestV1({
      ...validManifest(),
      permissions: { ...validManifest().permissions, externalProcessing: true },
    }),
    /P0.*external processing/iu,
  );
  assert.throws(
    () => parseOpenEnaPluginManifestV1({
      ...validManifest(),
      lifecycle: "production",
    }),
    /production.*exact source revision/iu,
  );
});

test("manifest URLs are HTTPS references, never executable inputs", () => {
  assert.throws(
    () => parseOpenEnaPluginManifestV1({
      ...validManifest(),
      source: { ...validManifest().source, repository: "javascript:alert(1)" },
    }),
    /HTTPS URL/iu,
  );
  assert.throws(
    () => parseOpenEnaPluginManifestV1({
      ...validManifest(),
      citation: "https://user:secret@example.com/citation",
    }),
    /credentials/iu,
  );
});

test("the catalog has unique identities and exposes the four reviewed starting entries", () => {
  assert.deepEqual(
    OPEN_ENA_PLUGIN_CATALOG.map((entry) => entry.pluginId),
    [
      "ena-hk/3d-ena",
      "ena-hk/ordered-network-analysis",
      "ena-hk/3d-ona",
      "ena-hk/longitudinal-ena",
    ],
  );
  assert.equal(new Set(OPEN_ENA_PLUGIN_CATALOG.map((entry) => entry.pluginId)).size, 4);
  assert.equal(new Set(OPEN_ENA_PLUGIN_CATALOG.map((entry) => entry.slug)).size, 4);
  assert.equal(getOpenEnaPluginBySlug("3d-ena")?.changesAnalysis, false);
  assert.equal(getOpenEnaPluginBySlug("ordered-network-analysis")?.changesAnalysis, true);
  assert.equal(getOpenEnaPluginBySlug("missing"), null);
});

test("manifest hashes are deterministic, 64-hex, and exclude no declared field", () => {
  assert.equal(sha256HexUtf8("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  const first = parseOpenEnaPluginManifestV1(validManifest());
  const reordered = parseOpenEnaPluginManifestV1({
    ...validManifest(),
    compatibility: {
      ...validManifest().compatibility,
      analysisKinds: ["ena"],
    },
  });
  assert.match(openEnaPluginManifestHash(first), /^[0-9a-f]{64}$/u);
  assert.equal(openEnaPluginManifestHash(first), openEnaPluginManifestHash(reordered));
  const changed = parseOpenEnaPluginManifestV1({
    ...validManifest(),
    scientificBoundary: {
      ...validManifest().scientificBoundary,
      nonClaims: ["Does not refit, infer, or validate ENA."],
    },
  });
  assert.notEqual(openEnaPluginManifestHash(first), openEnaPluginManifestHash(changed));
});
