import {
  OPEN_ENA_PLUGIN_MANIFEST_SCHEMA_V1,
  type OpenEnaPluginManifestV1,
} from "./types";
import { openEnaPluginReviewedManifestHash } from "./manifest-hash";

const CONTRIBUTIONS = [
  "analysis-family", "model-workflow", "presenter-2d", "presenter-3d",
  "diagnostic", "exporter", "external-service",
] as const;
const LIFECYCLES = [
  "incubating", "experimental", "research-preview", "production", "deprecated", "revoked",
] as const;
const EVIDENCE = [
  "display-only", "method-specified", "computationally-reproduced",
  "empirically-evaluated", "externally-peer-reviewed",
] as const;
const ROLES = [
  "conceptualization", "methodology", "software", "validation", "visualization", "project-administration",
] as const;
const CAPABILITIES = [
  "analysis-sets", "reference-rotation", "group-contrast", "trajectory", "3d", "inference", "ai-interpretation",
] as const;
const MODEL_TYPES = ["EndPoint", "SeparateTrajectory", "AccumulatedTrajectory"] as const;
const REVIEW_STATUSES = ["pending", "passed", "not-required"] as const;
const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const IDENTIFIER = /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)+$/u;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SEMVER = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;

function fail(message: string): never {
  throw new TypeError(`Invalid Open ENA plugin manifest: ${message}`);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(`${label} must be a plain object.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some((descriptor) => !("value" in descriptor))) {
    fail(`${label} cannot contain accessors.`);
  }
  return value as Record<string, unknown>;
}

function exact(value: unknown, label: string, keys: readonly string[]) {
  const parsed = record(value, label);
  const unknown = Object.keys(parsed).filter((key) => !keys.includes(key));
  if (unknown.length > 0) fail(`${label} contains unknown field ${unknown[0]}.`);
  const missing = keys.filter((key) => !Object.hasOwn(parsed, key));
  if (missing.length > 0) fail(`${label} is missing ${missing[0]}.`);
  return parsed;
}

function text(value: unknown, label: string, max = 600) {
  if (typeof value !== "string" || value.length < 1 || value.length > max || value !== value.trim()) {
    fail(`${label} must be non-empty bounded text without boundary whitespace.`);
  }
  if (/[\u0000-\u001f\u007f]/u.test(value)) fail(`${label} contains unsafe control characters.`);
  return value;
}

function enumText<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  const parsed = text(value, label, 80);
  if (!(allowed as readonly string[]).includes(parsed)) fail(`${label} is unsupported.`);
  return parsed as T;
}

function textList(value: unknown, label: string, maxItems = 24, maxLength = 600) {
  if (!Array.isArray(value) || value.length < 1 || value.length > maxItems) fail(`${label} must be a non-empty bounded array.`);
  const parsed = value.map((entry, index) => text(entry, `${label}[${index}]`, maxLength));
  if (new Set(parsed).size !== parsed.length) fail(`${label} contains duplicates.`);
  return parsed;
}

function enumList<T extends string>(value: unknown, allowed: readonly T[], label: string, allowEmpty = false) {
  if (!Array.isArray(value) || (!allowEmpty && value.length < 1) || value.length > allowed.length) {
    fail(`${label} must be a bounded array.`);
  }
  const parsed = value.map((entry, index) => enumText(entry, allowed, `${label}[${index}]`));
  if (new Set(parsed).size !== parsed.length) fail(`${label} contains duplicates.`);
  return parsed;
}

function bool(value: unknown, label: string) {
  if (typeof value !== "boolean") fail(`${label} must be boolean.`);
  return value;
}

function date(value: unknown, label: string) {
  const parsed = text(value, label, 10);
  if (!DATE.test(parsed) || Number.isNaN(Date.parse(`${parsed}T00:00:00Z`))) fail(`${label} must be an ISO date.`);
  return parsed;
}

function semver(value: unknown, label: string) {
  const parsed = text(value, label, 80);
  if (!SEMVER.test(parsed)) fail(`${label} must be SemVer.`);
  return parsed;
}

function sha(value: unknown, label: string, nullable = true) {
  if (nullable && value === null) return null;
  const parsed = text(value, label, 64);
  if (!SHA256.test(parsed)) fail(`${label} must be lowercase SHA-256.`);
  return parsed;
}

function httpsUrl(value: unknown, label: string) {
  const parsed = text(value, label, 1000);
  let url: URL;
  try { url = new URL(parsed); } catch { fail(`${label} must be an HTTPS URL.`); }
  if (url.protocol !== "https:") fail(`${label} must be an HTTPS URL.`);
  if (url.username || url.password) fail(`${label} cannot contain credentials.`);
  return url.toString();
}

function localizedContent(value: unknown, label: string) {
  const parsed = exact(value, label, ["name", "tagline", "researchQuestion", "limitations", "claims", "nonClaims"]);
  return {
    name: text(parsed.name, `${label}.name`, 120),
    tagline: text(parsed.tagline, `${label}.tagline`, 240),
    researchQuestion: text(parsed.researchQuestion, `${label}.researchQuestion`, 400),
    limitations: textList(parsed.limitations, `${label}.limitations`, 12, 500),
    claims: textList(parsed.claims, `${label}.claims`, 24, 600),
    nonClaims: textList(parsed.nonClaims, `${label}.nonClaims`, 24, 600),
  };
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

export function parseOpenEnaPluginManifestV1(value: unknown): OpenEnaPluginManifestV1 {
  const root = exact(value, "root", [
    "schemaVersion", "pluginId", "slug", "version", "contributionKinds", "riskLevel",
    "changesAnalysis", "lifecycle", "scientificEvidence", "content", "authors", "maintainer",
    "compatibility", "permissions", "scientificBoundary", "engineeringAssurance", "source",
    "approvalBinding", "licenses", "citation", "reviewReceipts", "changelog",
  ]);
  if (root.schemaVersion !== OPEN_ENA_PLUGIN_MANIFEST_SCHEMA_V1) fail("schemaVersion is unsupported.");
  const pluginId = text(root.pluginId, "pluginId", 120);
  if (!IDENTIFIER.test(pluginId)) fail("pluginId is invalid.");
  const slug = text(root.slug, "slug", 80);
  if (!SLUG.test(slug)) fail("slug is invalid.");
  const version = semver(root.version, "version");
  const contributionKinds = enumList(root.contributionKinds, CONTRIBUTIONS, "contributionKinds");
  const riskLevel = enumText(root.riskLevel, ["P0", "P1", "P2", "P3"] as const, "riskLevel");
  const changesAnalysis = bool(root.changesAnalysis, "changesAnalysis");
  const lifecycle = enumText(root.lifecycle, LIFECYCLES, "lifecycle");
  const scientificEvidence = enumText(root.scientificEvidence, EVIDENCE, "scientificEvidence");

  const contentRecord = exact(root.content, "content", ["en", "zh-hant", "zh-hans"]);
  const content = {
    en: localizedContent(contentRecord.en, "content.en"),
    "zh-hant": localizedContent(contentRecord["zh-hant"], "content.zh-hant"),
    "zh-hans": localizedContent(contentRecord["zh-hans"], "content.zh-hans"),
  };

  if (!Array.isArray(root.authors) || root.authors.length < 1 || root.authors.length > 24) fail("authors must be bounded.");
  const authors = root.authors.map((entry, index) => {
    const author = record(entry, `authors[${index}]`);
    const keys = Object.keys(author);
    if (keys.some((key) => !["name", "role", "publicConsent", "orcid"].includes(key))) fail(`authors[${index}] contains an unknown field.`);
    if (!Object.hasOwn(author, "name") || !Object.hasOwn(author, "role") || !Object.hasOwn(author, "publicConsent")) fail(`authors[${index}] is incomplete.`);
    if (author.publicConsent !== true) fail(`authors[${index}] requires public consent.`);
    const orcid = author.orcid === undefined ? undefined : text(author.orcid, `authors[${index}].orcid`, 19);
    if (orcid !== undefined && !/^0000-000[1-9]-[0-9]{4}-[0-9]{3}[0-9X]$/u.test(orcid)) fail(`authors[${index}].orcid is invalid.`);
    return {
      name: text(author.name, `authors[${index}].name`, 120),
      role: enumText(author.role, ROLES, `authors[${index}].role`),
      publicConsent: true as const,
      ...(orcid ? { orcid } : {}),
    };
  });

  const maintainerRecord = exact(root.maintainer, "maintainer", ["name", "publicConsent"]);
  if (maintainerRecord.publicConsent !== true) fail("maintainer requires public consent.");
  const maintainer = { name: text(maintainerRecord.name, "maintainer.name", 120), publicConsent: true as const };

  const compatibilityRecord = exact(root.compatibility, "compatibility", [
    "coreApi", "jenaVersions", "resultSchemaVersions", "analysisKinds", "modelTypes",
    "minimumDimensions", "requiredCapabilities",
  ]);
  if (compatibilityRecord.coreApi !== "1") fail("compatibility.coreApi is unsupported.");
  if (!Array.isArray(compatibilityRecord.resultSchemaVersions) || compatibilityRecord.resultSchemaVersions.length < 1
    || compatibilityRecord.resultSchemaVersions.some((entry) => !Number.isSafeInteger(entry) || Number(entry) < 1)) {
    fail("compatibility.resultSchemaVersions is invalid.");
  }
  const minimumDimensions = compatibilityRecord.minimumDimensions;
  if (!Number.isSafeInteger(minimumDimensions) || Number(minimumDimensions) < 1 || Number(minimumDimensions) > 32) {
    fail("compatibility.minimumDimensions is invalid.");
  }
  const compatibility = {
    coreApi: "1" as const,
    jenaVersions: textList(compatibilityRecord.jenaVersions, "compatibility.jenaVersions", 12, 80),
    resultSchemaVersions: [...compatibilityRecord.resultSchemaVersions] as number[],
    analysisKinds: enumList(compatibilityRecord.analysisKinds, ["ena", "ona"] as const, "compatibility.analysisKinds"),
    modelTypes: enumList(compatibilityRecord.modelTypes, MODEL_TYPES, "compatibility.modelTypes"),
    minimumDimensions: Number(minimumDimensions),
    requiredCapabilities: enumList(compatibilityRecord.requiredCapabilities, CAPABILITIES, "compatibility.requiredCapabilities", true),
  };

  const permissionsRecord = exact(root.permissions, "permissions", ["dataAccessTier", "network", "storage", "externalProcessing"]);
  const permissions = {
    dataAccessTier: enumText(permissionsRecord.dataAccessTier, ["D0", "D1", "D2", "D3"] as const, "permissions.dataAccessTier"),
    network: enumText(permissionsRecord.network, ["none", "host-brokered"] as const, "permissions.network"),
    storage: enumText(permissionsRecord.storage, ["none", "host-mediated"] as const, "permissions.storage"),
    externalProcessing: bool(permissionsRecord.externalProcessing, "permissions.externalProcessing"),
  };

  const boundaryRecord = exact(root.scientificBoundary, "scientificBoundary", ["claims", "nonClaims"]);
  const scientificBoundary = {
    claims: textList(boundaryRecord.claims, "scientificBoundary.claims", 24, 600),
    nonClaims: textList(boundaryRecord.nonClaims, "scientificBoundary.nonClaims", 24, 600),
  };

  const assuranceRecord = exact(root.engineeringAssurance, "engineeringAssurance", [
    "automatedTests", "browserRuntime", "securityPrivacyReview", "lastReviewed",
  ]);
  const engineeringAssurance = {
    automatedTests: enumText(assuranceRecord.automatedTests, REVIEW_STATUSES, "engineeringAssurance.automatedTests"),
    browserRuntime: enumText(assuranceRecord.browserRuntime, REVIEW_STATUSES, "engineeringAssurance.browserRuntime"),
    securityPrivacyReview: enumText(assuranceRecord.securityPrivacyReview, REVIEW_STATUSES, "engineeringAssurance.securityPrivacyReview"),
    lastReviewed: date(assuranceRecord.lastReviewed, "engineeringAssurance.lastReviewed"),
  };

  const sourceRecord = exact(root.source, "source", ["repository", "revision", "artifactSha256", "fixtureSetSha256"]);
  const revision = sourceRecord.revision === null ? null : text(sourceRecord.revision, "source.revision", 40);
  if (revision !== null && !COMMIT.test(revision)) fail("source.revision must be a lowercase 40-hex commit.");
  const source = {
    repository: httpsUrl(sourceRecord.repository, "source.repository"),
    revision,
    artifactSha256: sha(sourceRecord.artifactSha256, "source.artifactSha256"),
    fixtureSetSha256: sha(sourceRecord.fixtureSetSha256, "source.fixtureSetSha256"),
  };

  const approvalBindingRecord = exact(root.approvalBinding, "approvalBinding", ["methodSpecificationSha256", "reviewedManifestSha256"]);
  const approvalBinding = {
    methodSpecificationSha256: sha(approvalBindingRecord.methodSpecificationSha256, "approvalBinding.methodSpecificationSha256"),
    reviewedManifestSha256: sha(approvalBindingRecord.reviewedManifestSha256, "approvalBinding.reviewedManifestSha256"),
  };

  const licensesRecord = exact(root.licenses, "licenses", ["code", "documentation", "sampleData"]);
  const licenses = {
    code: text(licensesRecord.code, "licenses.code", 80),
    documentation: text(licensesRecord.documentation, "licenses.documentation", 80),
    sampleData: text(licensesRecord.sampleData, "licenses.sampleData", 80),
  };

  if (!Array.isArray(root.reviewReceipts) || root.reviewReceipts.length > 12) fail("reviewReceipts must be bounded.");
  const reviewReceipts = root.reviewReceipts.map((entry, index) => {
    const receipt = exact(entry, `reviewReceipts[${index}]`, ["kind", "status", "receiptSha256", "binding"]);
    if (receipt.status !== "passed") fail(`reviewReceipts[${index}].status must be passed.`);
    const binding = exact(receipt.binding, `reviewReceipts[${index}].binding`, [
      "pluginId", "pluginVersion", "methodSpecificationSha256", "reviewedManifestSha256",
      "sourceRevision", "artifactSha256", "fixtureSetSha256",
    ]);
    const boundPluginId = text(binding.pluginId, `reviewReceipts[${index}].binding.pluginId`, 120);
    if (!IDENTIFIER.test(boundPluginId)) fail(`reviewReceipts[${index}].binding.pluginId is invalid.`);
    const sourceRevision = text(binding.sourceRevision, `reviewReceipts[${index}].binding.sourceRevision`, 40);
    if (!COMMIT.test(sourceRevision)) fail(`reviewReceipts[${index}].binding.sourceRevision is invalid.`);
    return {
      kind: enumText(receipt.kind, ["method", "engineering", "security-privacy", "product"] as const, `reviewReceipts[${index}].kind`),
      status: "passed" as const,
      receiptSha256: sha(receipt.receiptSha256, `reviewReceipts[${index}].receiptSha256`, false) as string,
      binding: {
        pluginId: boundPluginId,
        pluginVersion: semver(binding.pluginVersion, `reviewReceipts[${index}].binding.pluginVersion`),
        methodSpecificationSha256: sha(binding.methodSpecificationSha256, `reviewReceipts[${index}].binding.methodSpecificationSha256`, false) as string,
        reviewedManifestSha256: sha(binding.reviewedManifestSha256, `reviewReceipts[${index}].binding.reviewedManifestSha256`, false) as string,
        sourceRevision,
        artifactSha256: sha(binding.artifactSha256, `reviewReceipts[${index}].binding.artifactSha256`, false) as string,
        fixtureSetSha256: sha(binding.fixtureSetSha256, `reviewReceipts[${index}].binding.fixtureSetSha256`, false) as string,
      },
    };
  });

  if (!Array.isArray(root.changelog) || root.changelog.length < 1 || root.changelog.length > 40) fail("changelog must be bounded.");
  const changelog = root.changelog.map((entry, index) => {
    const change = exact(entry, `changelog[${index}]`, ["version", "date", "summary"]);
    const summary = exact(change.summary, `changelog[${index}].summary`, ["en", "zh-hant", "zh-hans"]);
    return {
      version: semver(change.version, `changelog[${index}].version`),
      date: date(change.date, `changelog[${index}].date`),
      summary: {
        en: text(summary.en, `changelog[${index}].summary.en`, 400),
        "zh-hant": text(summary["zh-hant"], `changelog[${index}].summary.zh-hant`, 400),
        "zh-hans": text(summary["zh-hans"], `changelog[${index}].summary.zh-hans`, 400),
      },
    };
  });

  if (scientificEvidence === "display-only" && changesAnalysis) fail("display-only plugins cannot change analysis.");
  if (riskLevel === "P0" && permissions.externalProcessing) fail("P0 plugins cannot use external processing.");
  if (riskLevel === "P0" && contributionKinds.some((kind) => kind === "analysis-family" || kind === "external-service")) {
    fail("P0 plugins cannot declare analysis or external-service contributions.");
  }
  for (const [index, receipt] of reviewReceipts.entries()) {
    if (receipt.binding.pluginId !== pluginId
      || receipt.binding.pluginVersion !== version
      || receipt.binding.methodSpecificationSha256 !== approvalBinding.methodSpecificationSha256
      || receipt.binding.reviewedManifestSha256 !== approvalBinding.reviewedManifestSha256
      || receipt.binding.sourceRevision !== source.revision
      || receipt.binding.artifactSha256 !== source.artifactSha256
      || receipt.binding.fixtureSetSha256 !== source.fixtureSetSha256) {
      fail(`reviewReceipts[${index}] binding does not match the exact reviewed plugin tuple.`);
    }
  }
  if (lifecycle === "production") {
    if (!source.revision) fail("production plugins require an exact source revision.");
    if (!source.artifactSha256) fail("production plugins require an exact artifact hash.");
    if (!source.fixtureSetSha256) fail("production plugins require an exact fixture-set hash.");
    if (!approvalBinding.methodSpecificationSha256 || !approvalBinding.reviewedManifestSha256) fail("production plugins require exact method and reviewed-manifest bindings.");
    if (engineeringAssurance.automatedTests !== "passed" || engineeringAssurance.browserRuntime !== "passed" || engineeringAssurance.securityPrivacyReview !== "passed") {
      fail("production plugins require every engineering assurance to be passed.");
    }
    for (const kind of ["engineering", "security-privacy", "product"] as const) {
      if (!reviewReceipts.some((receipt) => receipt.kind === kind)) fail(`production plugins require a ${kind} review receipt.`);
    }
    if (changesAnalysis && !reviewReceipts.some((receipt) => receipt.kind === "method")) fail("production method plugins require a method review receipt.");
  }

  const manifest: OpenEnaPluginManifestV1 = {
    schemaVersion: OPEN_ENA_PLUGIN_MANIFEST_SCHEMA_V1,
    pluginId,
    slug,
    version,
    contributionKinds,
    riskLevel,
    changesAnalysis,
    lifecycle,
    scientificEvidence,
    content,
    authors,
    maintainer,
    compatibility,
    permissions,
    scientificBoundary,
    engineeringAssurance,
    source,
    approvalBinding,
    licenses,
    citation: httpsUrl(root.citation, "citation"),
    reviewReceipts,
    changelog,
  };
  if (lifecycle === "production" && approvalBinding.reviewedManifestSha256 !== openEnaPluginReviewedManifestHash(manifest)) {
    fail("production reviewed-manifest binding does not match the exact manifest content.");
  }
  return deepFreeze(manifest) as OpenEnaPluginManifestV1;
}
