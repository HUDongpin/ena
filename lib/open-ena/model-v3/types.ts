import type { DatasetHashKind, OpenEnaDirectionalMask } from "../types";

export const STANDARD_MODEL_TYPES = ["EndPoint", "SeparateTrajectory", "AccumulatedTrajectory"] as const;
export const STANDARD_WINDOW_TYPES = ["MovingStanzaWindow", "Conversation"] as const;
export const STANDARD_ROTATION_TYPES = ["svd", "means", "reference"] as const;
export const OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3 = "open-ena-validation-v3.1" as const;
export const OPEN_ENA_RUNTIME_POLICY_VERSION_V3 = "open-ena-runtime-policy-v3.1" as const;
export const OPEN_ENA_EXECUTION_CONTRACT_VERSION_V3 = "open-ena-execution-v3.1" as const;

export type StandardModelTypeV3 = (typeof STANDARD_MODEL_TYPES)[number];
export type StandardWindowTypeV3 = (typeof STANDARD_WINDOW_TYPES)[number];
export type StandardRotationTypeV3 = (typeof STANDARD_ROTATION_TYPES)[number];
export type AnalysisFamilyV3 = "standard" | "ona";

export type ScalarIdentityV3 =
  | { kind: "exact-string"; value: string }
  | { kind: "finite-number-at-validation-time"; value: number }
  | { kind: "boolean"; value: boolean };

export interface DatasetBoundConfirmationV3 {
  kind: "explicit-researcher-confirmation";
  datasetSha256: string;
  rowCount: number;
  relevantColumns: string[];
  confirmedAt: string;
  confirmationVersion: 1;
}

export type OrderComparatorV3 =
  | { kind: "number" }
  | { kind: "date"; format: "YYYY-MM-DD" }
  | { kind: "datetime"; format: "ISO-8601"; offset: "offset-in-value" }
  | { kind: "ordered-category"; levels: ScalarIdentityV3[] }
  | { kind: "text"; locale: string; sensitivity: "base" | "accent" | "case" | "variant"; numeric: boolean };

export interface OrderKeyV3 {
  column: string;
  direction: "ascending" | "descending";
  comparator: OrderComparatorV3;
}

export type CanonicalRowOrderV3 =
  | { kind: "columns"; keys: readonly [OrderKeyV3, ...OrderKeyV3[]] }
  | { kind: "source-order-confirmed"; confirmation: DatasetBoundConfirmationV3 };
export type CanonicalHorizonOrderV3 = CanonicalRowOrderV3;

export type BackwardExtentV3 = number | "Infinity";
export type ForwardExtentV3 = BackwardExtentV3;

export type StandardWindowV3 =
  | { kind: "MovingStanzaWindow"; backward: BackwardExtentV3; forward: ForwardExtentV3; order: CanonicalRowOrderV3 }
  | { kind: "Conversation" };

export type EndpointRotationV3 =
  | { kind: "SVD"; center: boolean }
  | { kind: "Means"; center: boolean; groupColumn: string; negativeLevel: ScalarIdentityV3; positiveLevel: ScalarIdentityV3 }
  | { kind: "Reference"; referenceId: string; expectedContentSha256: string };

export type TrajectoryRotationV3 =
  | { kind: "SVD"; center: boolean }
  | { kind: "Reference"; referenceId: string; expectedContentSha256: string };

export type CanonicalStandardAnalysisV3 =
  | { model: "EndPoint"; rotation: EndpointRotationV3 }
  | { model: "SeparateTrajectory"; horizonOrder: CanonicalHorizonOrderV3; rotation: TrajectoryRotationV3 }
  | { model: "AccumulatedTrajectory"; horizonOrder: CanonicalHorizonOrderV3; rotation: TrajectoryRotationV3 };

export interface CanonicalCodeV3 { column: string; displayLabel: string }
export interface CanonicalModelContractsV3 {
  validation: typeof OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3;
  runtimePolicy: typeof OPEN_ENA_RUNTIME_POLICY_VERSION_V3;
  execution: typeof OPEN_ENA_EXECUTION_CONTRACT_VERSION_V3;
}

type NonEmptyStrings = readonly [string, ...string[]];
type NonEmptyCodes = readonly [CanonicalCodeV3, CanonicalCodeV3, CanonicalCodeV3, ...CanonicalCodeV3[]];
type UnitsV3 = { columns: NonEmptyStrings };
type HorizonsV3 = { columns: NonEmptyStrings };
type GroupV3 = { kind: "none" } | { kind: "stable-metadata"; column: string };

export interface CanonicalStandardConfigV3 {
  schema: 3;
  family: "standard";
  contracts: CanonicalModelContractsV3;
  units: UnitsV3;
  group: GroupV3;
  horizons: HorizonsV3;
  codes: NonEmptyCodes;
  weighting: "Binary" | "Frequency";
  window: StandardWindowV3;
  analysis: CanonicalStandardAnalysisV3;
}

export interface CanonicalOnaConfigV3 {
  schema: 3;
  family: "ona";
  contracts: CanonicalModelContractsV3;
  units: UnitsV3;
  group: GroupV3;
  horizons: HorizonsV3;
  codes: NonEmptyCodes;
  engine: { method: "frequency"; engineMethod: "sum" };
  window: { kind: "MovingStanzaWindow"; backward: BackwardExtentV3 };
  analysis: { model: "EndPoint"; rotation: { kind: "SVD"; centerAlignToOrigin: true } };
  forward: 0;
  rowOrder: CanonicalRowOrderV3;
  directionalMask: OpenEnaDirectionalMask;
}

export type DraftRotationV3 =
  | { kind: "SVD"; center: boolean }
  | { kind: "Means"; center: boolean; groupColumn: string | null; negativeLevel: ScalarIdentityV3 | null; positiveLevel: ScalarIdentityV3 | null }
  | { kind: "Reference"; referenceId: string | null; expectedContentSha256: string | null };

export interface StandardEnaDraftV3 {
  units: string[];
  horizons: string[];
  group: string | null;
  codes: string[];
  weighting: "Binary" | "Frequency";
  model: StandardModelTypeV3;
  window: StandardWindowTypeV3;
  backward: BackwardExtentV3;
  forward: ForwardExtentV3 | null;
  rowOrder: CanonicalRowOrderV3 | null;
  horizonOrder: CanonicalHorizonOrderV3 | null;
  rotation: DraftRotationV3;
}

export interface OrderedNetworkDraftV3 {
  units: string[];
  horizons: string[];
  group: string | null;
  codes: string[];
  backward: BackwardExtentV3;
  rowOrder: CanonicalRowOrderV3 | null;
  directionalMask: OpenEnaDirectionalMask | null;
}

export interface ModelWorkspaceDraftsV3 {
  schema: 3;
  activeFamily: AnalysisFamilyV3;
  standard: StandardEnaDraftV3;
  ona: OrderedNetworkDraftV3;
}

export interface DatasetBindingV3 {
  hashKind: DatasetHashKind;
  normalizedTableSha256: string;
  rowCount: number;
  headerSha256: string;
}
