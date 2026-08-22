import type { ENASet, ENAStatsResult, ModelType, RotationSet, Row, WindowType } from "jena-js";

export type OpenEnaMode = "sets" | "data" | "model" | "plot" | "stats";
export type OpenEnaView = "2d" | "3d";
export type CameraPreset = "isometric" | "xy" | "xz" | "yz";

export interface ParsedDataset {
  name: string;
  headers: string[];
  rows: Row[];
  sizeBytes: number;
  source: "sample" | "upload";
  /** Exact semantics of the digest derived from this imported table. */
  hashKind?: DatasetHashKind;
}

export type DatasetHashKind =
  | "normalized-utf8-text-sha256"
  | "normalized-utf8-csv-text-sha256"
  | "canonical-first-xlsx-worksheet-v1-sha256";

export function datasetHashKindFor(dataset: Pick<ParsedDataset, "name" | "hashKind">): DatasetHashKind {
  return dataset.hashKind
    ?? (/\.xlsx$/iu.test(dataset.name)
      ? "canonical-first-xlsx-worksheet-v1-sha256"
      : "normalized-utf8-csv-text-sha256");
}

export interface OpenEnaConfig {
  unitColumns: string[];
  conversationColumns: string[];
  groupColumn: string | null;
  codes: string[];
  model: ModelType;
  window: WindowType;
  windowSizeBack: number;
  windowSizeForward: number;
  weightBy: "binary" | "sum";
  rotation: "svd" | "mean" | "reference";
  referenceRotationId: string | null;
  centerAlignToOrigin: boolean;
}

export interface OpenEnaReferenceCompatibility {
  model: "EndPoint";
  codes: string[];
  window: WindowType;
  windowSizeBack: number | "Infinity";
  windowSizeForward: number;
  weightBy: "binary" | "sum";
  centerAlignToOrigin: boolean;
  normalization: "sphere";
}

export type OpenEnaReferenceFit =
  | { method: "svd"; unitColumns: string[]; conversationColumns: string[] }
  | { method: "mean"; unitColumns: string[]; conversationColumns: string[]; groupColumn: string; groupOrder: [string, string] };

export interface OpenEnaRotationReference {
  schemaVersion: 1;
  kind: "open-ena-reference-rotation";
  app: "ENA.HK Open ENA";
  runtime: "jena-js";
  runtimeVersion: string;
  referenceId: string;
  name: string;
  source: {
    datasetName: string;
    hashKind?: DatasetHashKind;
    normalizedUtf8TextSha256: string | null;
    analyzedAt: string;
  };
  fit: OpenEnaReferenceFit;
  compatibility: OpenEnaReferenceCompatibility;
  rotationSet: RotationSet;
}

export type OpenEnaProjectionReference = Omit<OpenEnaRotationReference, "rotationSet">;

export interface GroupNetwork {
  name: string;
  /** Distinct analytic units represented by the group. */
  count: number;
  /** Projected points; greater than count for trajectory models. */
  pointCount: number;
  color: string;
  meanPoint: Record<string, number>;
  meanWeights: Record<string, number>;
}

export interface OpenEnaResult {
  set: ENASet;
  groups: GroupNetwork[];
  dimensions: string[];
  stats: ENAStatsResult;
  statsDiagnostics: {
    correlations: "complete" | "omitted-unit-limit" | "not-applicable-trajectory" | "not-applicable-reference";
    tests: "complete" | "omitted-unit-limit" | "not-applicable-trajectory";
    correlationUnitLimit: number;
  };
  analyzedAt: string;
  projectionReference: OpenEnaProjectionReference | null;
  /** Optional immutable source/config binding added by the browser client. */
  provenanceBinding?: {
    datasetNormalizedUtf8TextSha256: string;
    datasetHashKind?: DatasetHashKind;
    configuration: OpenEnaConfig;
  };
}

/**
 * A compact, immutable endpoint result retained in the browser for shared-space
 * comparison. It intentionally contains no source rows or row-level stanza
 * records; analytic-unit identifiers remain because they are part of the
 * derived ENA result and must be pseudonymized before sharing when necessary.
 */
export interface OpenEnaAnalysisSet {
  id: string;
  name: string;
  capturedAt: string;
  role: "fitted" | "projected";
  dataset: {
    name: string;
    source: ParsedDataset["source"];
    rowCount: number;
    columnCount: number;
    sizeBytes: number;
    hashKind?: DatasetHashKind;
    normalizedUtf8TextSha256: string | null;
  };
  config: OpenEnaConfig;
  points: Row[];
  /** Equal-unit mean sphere-normalized weight for each canonical edge. */
  meanWeights: Record<string, number>;
  geometry: {
    referenceId: string;
    codes: string[];
    dimensions: string[];
    adjacencyKey: Array<{
      source: string;
      target: string;
      name: string;
      sourceIndex: number;
      targetIndex: number;
    }>;
    rotationColumns: string[];
    rotationMatrix: number[][];
    eigenvalues: number[];
    centerVector: number[];
    nodes: Row[];
    compatibility: OpenEnaReferenceCompatibility;
  };
  generatedReference: OpenEnaRotationReference | null;
  projectionReference: OpenEnaProjectionReference | null;
}

export interface OpenEnaSharedComparisonSide {
  setId: string;
  name: string;
  role: OpenEnaAnalysisSet["role"];
  capturedAt: string;
  datasetHash: string | null;
  dataset: OpenEnaAnalysisSet["dataset"];
  config: OpenEnaConfig;
  unitCount: number;
  unitIds: string[];
  points: Array<{
    unitId: string;
    sourceUnitId: string;
    x: number;
    y: number;
  }>;
  meanPoint: Record<string, number>;
  meanWeights: Record<string, number>;
}

export interface OpenEnaSharedComparison {
  referenceId: string;
  /** Canonical compact provenance for the one fitted reference shared by both sets. */
  reference: OpenEnaProjectionReference;
  axes: [string, string];
  geometry: OpenEnaAnalysisSet["geometry"];
  nodes: Array<{ code: string; x: number; y: number }>;
  primary: OpenEnaSharedComparisonSide;
  secondary: OpenEnaSharedComparisonSide;
  edges: Array<{
    source: string;
    target: string;
    name: string;
    primaryWeight: number;
    secondaryWeight: number;
    signedDifference: number;
    stronger: "primary" | "secondary" | "equal";
  }>;
  createdAt: string;
}

export type OpenEnaSummary = Omit<OpenEnaResult, "set">;

export interface OpenEnaManifest {
  schemaVersion: 1;
  app: "ENA.HK Open ENA";
  appVersion: string;
  runtime: "jena-js";
  runtimeVersion: string;
  dataset: {
    name: string;
    rows: number;
    columns: number;
    source: ParsedDataset["source"];
    hashKind?: DatasetHashKind;
    normalizedUtf8TextSha256: string | null;
  };
  configuration: OpenEnaConfig;
  result: {
    model: ModelType;
    units: number;
    points: number;
    groups: Array<{ name: string; count: number }>;
    dimensions: string[];
    variance: Record<string, number>;
    statsDiagnostics: OpenEnaResult["statsDiagnostics"];
    projectionReference: OpenEnaProjectionReference | null;
    analyzedAt: string;
  };
  effectiveJenaOptions: {
    units: string[];
    conversation: string[];
    codes: string[];
    metadata: string[];
    includeMeta: true;
    model: ModelType;
    window: WindowType;
    windowSizeBack: number | "Infinity";
    windowSizeForward: number;
    weightBy: "binary" | "sum";
    dimensions: 3;
    rotation:
      | { method: "svd" }
      | { method: "mean"; params: { groups: [string[], string[]] } }
      | { method: "generalized"; params: { xVar: string; select2Groups: [string, string] } }
      | { method: "reference"; referenceId: string; sourceDatasetSha256: string | null };
    centerAlignToOrigin: boolean;
    normalization: "sphere";
    nodePositionMethod: "undirected";
  };
  generatedAt: string;
  boundaries: string[];
}

export const SAMPLE_DATASET_URL = "/data/academy/ena-design-talk-sample.csv";

export const TRAJECTORY_SAMPLE_DATASET_URL = "/data/academy/ena-2d-trajectory-teaching-sample.csv";

export const SAMPLE_CONFIG: OpenEnaConfig = {
  unitColumns: ["team_id"],
  conversationColumns: ["conversation_id"],
  groupColumn: "condition",
  codes: ["goal", "evidence", "strategy", "tradeoff", "revision"],
  model: "EndPoint",
  window: "MovingStanzaWindow",
  windowSizeBack: 5,
  windowSizeForward: 0,
  weightBy: "binary",
  rotation: "svd",
  referenceRotationId: null,
  centerAlignToOrigin: true,
};

export const TRAJECTORY_SAMPLE_CONFIG: OpenEnaConfig = {
  unitColumns: ["Group", "Speaker"],
  conversationColumns: ["Group", "Speaker", "Period"],
  groupColumn: "Group",
  codes: ["TE", "EX", "IN", "RE", "SP", "TP"],
  model: "SeparateTrajectory",
  window: "Conversation",
  windowSizeBack: 5,
  windowSizeForward: 0,
  weightBy: "binary",
  rotation: "svd",
  referenceRotationId: null,
  centerAlignToOrigin: true,
};

export const JENA_RUNTIME_VERSION = "0.6.2";
export const OPEN_ENA_APP_VERSION = "0.1.0";

export function sameOpenEnaConfig(left: OpenEnaConfig, right: OpenEnaConfig) {
  return left.model === right.model
    && left.groupColumn === right.groupColumn
    && left.window === right.window
    && left.windowSizeBack === right.windowSizeBack
    && left.windowSizeForward === right.windowSizeForward
    && left.weightBy === right.weightBy
    && left.rotation === right.rotation
    && left.referenceRotationId === right.referenceRotationId
    && left.centerAlignToOrigin === right.centerAlignToOrigin
    && left.unitColumns.length === right.unitColumns.length
    && left.unitColumns.every((value, index) => value === right.unitColumns[index])
    && left.conversationColumns.length === right.conversationColumns.length
    && left.conversationColumns.every((value, index) => value === right.conversationColumns[index])
    && left.codes.length === right.codes.length
    && left.codes.every((value, index) => value === right.codes[index]);
}
