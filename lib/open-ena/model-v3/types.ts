import type { ENASet, RotationSet } from "jena-js";
import type { DatasetHashKind, OpenEnaDirectionalMask } from "../types";
import type { ModelDiagnosticV3 } from "./diagnostics";
import type { ExecutionPlanHeaderV3 } from "./execution-plan";

export const STANDARD_MODEL_TYPES = [
  "EndPoint",
  "SeparateTrajectory",
  "AccumulatedTrajectory",
] as const;
export const STANDARD_WINDOW_TYPES = ["MovingStanzaWindow", "Conversation"] as const;
export const STANDARD_ROTATION_TYPES = ["svd", "means", "reference"] as const;
export const OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3 = "open-ena-validation-v3.1" as const;
export const OPEN_ENA_RUNTIME_POLICY_VERSION_V3 = "open-ena-runtime-policy-v3.1" as const;
export const OPEN_ENA_EXECUTION_CONTRACT_VERSION_V3 = "open-ena-execution-v3.1" as const;

export type StandardModelTypeV3 = typeof STANDARD_MODEL_TYPES[number];
export type StandardWindowTypeV3 = typeof STANDARD_WINDOW_TYPES[number];
export type StandardRotationTypeV3 = typeof STANDARD_ROTATION_TYPES[number];
export type AnalysisFamilyV3 = "standard" | "ona";

export type ScalarIdentityV3 =
  | { type: "string"; value: string }
  | { type: "number"; value: number }
  | { type: "boolean"; value: boolean };

export interface DatasetBoundConfirmationV3 {
  kind: "explicit-researcher-confirmation";
  analysisFamily: AnalysisFamilyV3;
  datasetSha256: string;
  rowCount: number;
  relevantColumns: string[];
  confirmedAt: string;
  confirmationVersion: 1;
}

export type OrderComparatorV3 =
  | { type: "number" }
  | { type: "date"; format: "YYYY-MM-DD" }
  | { type: "datetime"; format: "ISO-8601"; timeZone: "offset-in-value" }
  | { type: "ordered-category"; levels: ScalarIdentityV3[] }
  | {
      type: "text";
      locale: string;
      sensitivity: "base" | "accent" | "case" | "variant";
      numeric: boolean;
    };

export interface OrderKeyV3 {
  column: string;
  direction: "ascending" | "descending";
  comparator: OrderComparatorV3;
}

export type CanonicalRowOrderV3 =
  | { kind: "columns"; keys: [OrderKeyV3, ...OrderKeyV3[]] }
  | { kind: "source-order-confirmed"; confirmation: DatasetBoundConfirmationV3 };
export type CanonicalHorizonOrderV3 = CanonicalRowOrderV3;

export type BackwardExtentV3 =
  | { kind: "finite"; value: number }
  | { kind: "infinity" };
export type ForwardExtentV3 = BackwardExtentV3;

export type StandardWindowV3 =
  | {
      type: "MovingStanzaWindow";
      backward: BackwardExtentV3;
      forward: ForwardExtentV3;
      rowOrder: CanonicalRowOrderV3;
    }
  | { type: "Conversation" };

export type EndpointRotationV3 =
  | { type: "svd"; centerAlignToOrigin: boolean }
  | {
      type: "means";
      centerAlignToOrigin: boolean;
      contrast: {
        groupColumn: string;
        negativeLevel: ScalarIdentityV3;
        positiveLevel: ScalarIdentityV3;
      };
    }
  | { type: "reference"; referenceId: string; expectedContentSha256: string };

export type TrajectoryRotationV3 =
  | { type: "svd"; centerAlignToOrigin: boolean }
  | { type: "reference"; referenceId: string; expectedContentSha256: string };

export type CanonicalStandardAnalysisV3 =
  | { model: { type: "EndPoint" }; rotation: EndpointRotationV3 }
  | {
      model: { type: "SeparateTrajectory"; horizonOrder: CanonicalHorizonOrderV3 };
      rotation: TrajectoryRotationV3;
    }
  | {
      model: { type: "AccumulatedTrajectory"; horizonOrder: CanonicalHorizonOrderV3 };
      rotation: TrajectoryRotationV3;
    };

export interface CanonicalCodeV3 {
  column: string;
  displayLabel: string;
}

export interface CanonicalModelContractsV3 {
  validationContractVersion: typeof OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3;
  runtimePolicyVersion: typeof OPEN_ENA_RUNTIME_POLICY_VERSION_V3;
}

export interface CanonicalStandardConfigV3 {
  schemaVersion: 3;
  analysisFamily: "standard";
  contracts: CanonicalModelContractsV3;
  units: {
    columns: [string, ...string[]];
    group: { type: "none" } | { type: "stable-metadata"; column: string };
  };
  horizons: { columns: [string, ...string[]] };
  codes: [CanonicalCodeV3, CanonicalCodeV3, CanonicalCodeV3, ...CanonicalCodeV3[]];
  weighting: { type: "binary" } | { type: "frequency" };
  window: StandardWindowV3;
  analysis: CanonicalStandardAnalysisV3;
}

export interface CanonicalOnaConfigV3 {
  schemaVersion: 3;
  analysisFamily: "ona";
  contracts: CanonicalModelContractsV3;
  units: CanonicalStandardConfigV3["units"];
  horizons: CanonicalStandardConfigV3["horizons"];
  codes: CanonicalStandardConfigV3["codes"];
  model: { type: "EndPoint" };
  weighting: { type: "frequency"; engineMethod: "sum" };
  window: {
    type: "MovingStanzaWindow";
    backward: BackwardExtentV3;
    forward: 0;
    rowOrder: CanonicalRowOrderV3;
  };
  rotation: { type: "svd"; centerAlignToOrigin: true };
  directionalMask: OpenEnaDirectionalMask;
}

export interface StandardEnaDraftV3 {
  unitColumns: string[];
  horizonColumns: string[];
  groupColumn: string | null;
  codes: string[];
  weighting: "binary" | "frequency";
  model: StandardModelTypeV3;
  windowType: StandardWindowTypeV3;
  movingStanza: {
    backward: BackwardExtentV3;
    forward: ForwardExtentV3;
    rowOrder: CanonicalRowOrderV3 | null;
  };
  horizonOrder: CanonicalHorizonOrderV3 | null;
  rotation:
    | { type: "svd"; centerAlignToOrigin: boolean }
    | {
        type: "means";
        centerAlignToOrigin: boolean;
        negativeLevel: ScalarIdentityV3 | null;
        positiveLevel: ScalarIdentityV3 | null;
      }
    | { type: "reference"; referenceId: string | null; expectedContentSha256: string | null };
}

export interface OrderedNetworkDraftV3 {
  unitColumns: string[];
  horizonColumns: string[];
  groupColumn: string | null;
  codes: string[];
  backward: BackwardExtentV3;
  rowOrder: CanonicalRowOrderV3 | null;
  directionalMask: OpenEnaDirectionalMask | null;
}

export interface ModelWorkspaceDraftsV3 {
  schemaVersion: 3;
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

/**
 * Minimal execution-time view of a separately validated Standard Reference
 * v2 artifact. Reference parsing, compatibility proof, and basis remapping
 * remain owned by the Reference tasks; an execution plan only accepts their
 * already-remapped, content-addressed output.
 */
export interface ValidatedReferenceExecutionBindingV3 {
  readonly referenceId: string;
  readonly contentSha256: string;
  readonly basisPermutation: readonly number[];
  readonly rotationSet: RotationSet;
  readonly sourceFit: "svd" | "means";
}

export interface StandardMeansBindingV3 {
  readonly groupColumn: string;
  readonly negative: { readonly level: ScalarIdentityV3; readonly unitTokens: readonly string[] };
  readonly positive: { readonly level: ScalarIdentityV3; readonly unitTokens: readonly string[] };
  readonly direction: "positive-minus-negative";
}

/**
 * Internal synchronous output for an already built/validated plan. This is not
 * the hashed, immutable worker BoundResult. Diagnostics here cover runtime
 * rotation eligibility; the bound-result task must retain compiler diagnostics
 * too. No resource observations or untrusted-plan verification are implied.
 */
export interface InternalStandardRunResultV3 {
  readonly configuration: CanonicalStandardConfigV3;
  readonly executionPlanHeader: ExecutionPlanHeaderV3;
  readonly set: ENASet;
  readonly diagnostics: readonly ModelDiagnosticV3[];
  readonly meansBinding: StandardMeansBindingV3 | null;
  readonly projection: {
    readonly type: "svd" | "means";
    readonly runtimeFirstAxis: string;
    readonly centerAlignToOrigin: boolean;
    readonly centerVector: readonly number[];
    /** Intrinsic independent target rank under the established numerical policy. */
    readonly rank: number;
    /** Complete square basis, including completion axes required by Reference. */
    readonly fullAxes: readonly string[];
    /**
     * Supported projected coordinates, not a count of independent dimensions.
     * SVD uses the intrinsic rank prefix. Means retains validated MR1 plus
     * residual coordinates with variance share > largest axis share * 1e-12;
     * multiple supported Means coordinates can describe one intrinsic dimension.
     */
    readonly estimableAxes: readonly string[];
    /** Full-basis variance shares in fullAxes order, never display-renormalized. */
    readonly variance: readonly number[];
  };
  readonly populations: {
    /** Means centering/residual SVD uses all endpoints; meansBinding defines MR1. */
    readonly fit: "endpoint-units" | "observed-unit-horizon-steps";
    /** Actual connectionCounts order: Unit tokens or canonical [Unit,Horizon] pairs. */
    readonly fitTokens: readonly string[];
    readonly targetTokens: readonly string[];
    readonly trajectoryStepCountByUnit: Readonly<Record<string, number>>;
    readonly imputedStepCount: 0;
  };
}
