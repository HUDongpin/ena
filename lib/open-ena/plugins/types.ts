import type { OpenEnaCapability } from "@/lib/open-ena/capabilities";
import type { AnalysisKind } from "@/lib/open-ena/types";

export const OPEN_ENA_PLUGIN_MANIFEST_SCHEMA_V1 = "ena.hk/plugin-manifest/v1" as const;

export type OpenEnaPluginContributionKind =
  | "analysis-family"
  | "model-workflow"
  | "presenter-2d"
  | "presenter-3d"
  | "diagnostic"
  | "exporter"
  | "external-service";

export type OpenEnaPluginRiskLevel = "P0" | "P1" | "P2" | "P3";
export type OpenEnaPluginLifecycle =
  | "incubating"
  | "experimental"
  | "research-preview"
  | "production"
  | "deprecated"
  | "revoked";
export type OpenEnaPluginScientificEvidence =
  | "display-only"
  | "method-specified"
  | "computationally-reproduced"
  | "empirically-evaluated"
  | "externally-peer-reviewed";
export type OpenEnaPluginDataAccessTier = "D0" | "D1" | "D2" | "D3";
export type OpenEnaPluginReviewStatus = "pending" | "passed" | "not-required";

export interface OpenEnaPluginLocalizedContentV1 {
  name: string;
  tagline: string;
  researchQuestion: string;
  limitations: readonly string[];
  claims: readonly string[];
  nonClaims: readonly string[];
}

export interface OpenEnaPluginManifestV1 {
  schemaVersion: typeof OPEN_ENA_PLUGIN_MANIFEST_SCHEMA_V1;
  pluginId: string;
  slug: string;
  version: string;
  contributionKinds: readonly OpenEnaPluginContributionKind[];
  riskLevel: OpenEnaPluginRiskLevel;
  changesAnalysis: boolean;
  lifecycle: OpenEnaPluginLifecycle;
  scientificEvidence: OpenEnaPluginScientificEvidence;
  content: Readonly<Record<"en" | "zh-hant" | "zh-hans", OpenEnaPluginLocalizedContentV1>>;
  authors: readonly Readonly<{
    name: string;
    role: "conceptualization" | "methodology" | "software" | "validation" | "visualization" | "project-administration";
    publicConsent: true;
    orcid?: string;
  }>[];
  maintainer: Readonly<{ name: string; publicConsent: true }>;
  compatibility: Readonly<{
    coreApi: "1";
    jenaVersions: readonly string[];
    resultSchemaVersions: readonly number[];
    analysisKinds: readonly AnalysisKind[];
    modelTypes: readonly ("EndPoint" | "SeparateTrajectory" | "AccumulatedTrajectory")[];
    minimumDimensions: number;
    requiredCapabilities: readonly OpenEnaCapability[];
  }>;
  permissions: Readonly<{
    dataAccessTier: OpenEnaPluginDataAccessTier;
    network: "none" | "host-brokered";
    storage: "none" | "host-mediated";
    externalProcessing: boolean;
  }>;
  scientificBoundary: Readonly<{
    claims: readonly string[];
    nonClaims: readonly string[];
  }>;
  engineeringAssurance: Readonly<{
    automatedTests: OpenEnaPluginReviewStatus;
    browserRuntime: OpenEnaPluginReviewStatus;
    securityPrivacyReview: OpenEnaPluginReviewStatus;
    lastReviewed: string;
  }>;
  source: Readonly<{
    repository: string;
    revision: string | null;
    artifactSha256: string | null;
    fixtureSetSha256: string | null;
  }>;
  approvalBinding: Readonly<{
    methodSpecificationSha256: string | null;
    reviewedManifestSha256: string | null;
  }>;
  licenses: Readonly<{
    code: string;
    documentation: string;
    sampleData: string;
  }>;
  citation: string;
  reviewReceipts: readonly Readonly<{
    kind: "method" | "engineering" | "security-privacy" | "product";
    status: "passed";
    receiptSha256: string;
    binding: Readonly<{
      pluginId: string;
      pluginVersion: string;
      methodSpecificationSha256: string;
      reviewedManifestSha256: string;
      sourceRevision: string;
      artifactSha256: string;
      fixtureSetSha256: string;
    }>;
  }>[];
  changelog: readonly Readonly<{
    version: string;
    date: string;
    summary: Readonly<Record<"en" | "zh-hant" | "zh-hans", string>>;
  }>[];
}
