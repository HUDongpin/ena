import type { ENASet, RotationSet } from "jena-js";
import type { DatasetHashKind, OpenEnaDirectionalMask } from "../types";
import type { ModelDiagnosticV3 } from "./diagnostics";
import type { ExecutionPlanHeaderV3 } from "./execution-plan";
import type { StandardExecutionPlanV3 } from "./execution-plan";
import type { ModelCapabilityStatusV3 } from "./compiler";
import type { OnaExecutionPlanV3 } from "./ona-adapter";
import type { OnaCompilerDiagnosticV3 } from "./ona-compiler-preflight";

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
 * are independently rederived at execution-plan construction and validation.
 * The complete artifact preserves the evidence behind remapped runtime output.
 */
export interface ValidatedReferenceExecutionBindingV3 {
  readonly artifact: OpenEnaStandardReferenceV2;
  /** Incremental to the header's target/projection baseline, including artifact and duplicate remapped geometry. */
  readonly admission: ReferenceAdmissionV3;
  readonly referenceId: string;
  readonly contentSha256: string;
  /** For each target runtime edge index, its corresponding source artifact edge index. */
  readonly basisPermutation: readonly number[];
  readonly rotationSet: RotationSet;
  readonly sourceFit: "svd" | "means";
}

export interface ReferenceAdmissionV3 {
  readonly version: 1;
  readonly incrementalNumericCells: number;
  readonly incrementalPeakBytes: number;
  readonly incrementalExportBytes: number;
}

export type OpenEnaWorkerStageV3 = "verify-plan" | "materialize" | "accumulate" | "normalize" | "center" | "rotate-or-project" | "position-nodes" | "validate-result" | "complete";

export interface RuntimeResourceObservationV3 {
  readonly processedRows: number;
  /** Exact high-water of live raw window history rows, including the arriving row before eviction. */
  readonly maximumBufferedRows: number;
  /** Peak concurrently retained tracked numeric slots; never cumulative allocation or measured JS heap. */
  readonly numericCellsAllocated: number;
  readonly peakBytesObservedOrBounded: number;
  readonly observationMethod: "exact-counters-and-conservative-byte-bound";
}

export interface ResultBindingV3 {
  readonly datasetSha256: string;
  readonly datasetHashKind: DatasetHashKind;
  readonly headerSha256: string;
  readonly rowCount: number;
  readonly configurationSha256: string;
  readonly executionPlanSha256: string;
  readonly runtimeVersion: string;
  readonly algorithmBuildSha: string;
  readonly validationContractVersion: typeof OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3;
  readonly runtimePolicyVersion: typeof OPEN_ENA_RUNTIME_POLICY_VERSION_V3;
  readonly executionContractVersion: typeof OPEN_ENA_EXECUTION_CONTRACT_VERSION_V3;
  readonly referenceId: string | null;
  readonly referenceContentSha256: string | null;
  readonly scientificResultSha256: string;
}

/** Only the two known window extent fields admit the explicit Infinity literal. */
export type SerializableEnaSetV3 = Omit<ENASet, "functionParams"> & {
  readonly functionParams: Omit<ENASet["functionParams"], "windowSizeBack" | "windowSizeForward"> & {
    readonly windowSizeBack: number | "Infinity";
    readonly windowSizeForward: number | "Infinity";
  };
};

export interface ResultExecutionProvenanceV3 {
  readonly header: ExecutionPlanHeaderV3;
  readonly sourceProofSha256: string;
  readonly identityDictionary: StandardExecutionPlanV3["identityDictionary"];
  readonly unitGroups: readonly { readonly unitToken: string; readonly groupToken: string | null }[];
  readonly codeDictionary: StandardExecutionPlanV3["codeDictionary"];
  readonly codeRepresentations: StandardExecutionPlanV3["codeRepresentations"];
  readonly labels: {
    readonly unitColumn: "Unit";
    readonly horizonColumn: "Horizon";
    readonly groupColumn: "Group";
    readonly codes: readonly { runtimeToken: string; column: string; sourceColumn: string; displayLabel: string; canonicalIdentity: string }[];
    readonly edges: readonly { runtimeColumn: string; column: string; sourceCodeIdentity: string; targetCodeIdentity: string }[];
  };
  readonly ordering: {
    readonly requestedRowOrder: CanonicalRowOrderV3 | null;
    readonly requestedHorizonOrder: CanonicalHorizonOrderV3 | null;
    readonly resolvedRowOrder: StandardExecutionPlanV3["rowOrdering"];
    readonly resolvedHorizonOrder: StandardExecutionPlanV3["horizonOrdering"];
    readonly runtimeSourceRowIndices: readonly number[];
  };
  readonly adapterParameters: StandardExecutionPlanV3["adapterParameters"];
  readonly weighting: StandardExecutionPlanV3["weighting"];
  readonly normalization: "sphere";
  readonly boundary: "within-horizon";
  readonly reference: StandardExecutionPlanV3["reference"];
  readonly projection: InternalStandardRunResultV3["projection"];
  readonly populations: InternalStandardRunResultV3["populations"];
  readonly meansBinding: StandardMeansBindingV3 | null;
  readonly resources: {
    readonly targetBaseline: ExecutionPlanHeaderV3["resourceEstimate"];
    readonly operationalAdmission: import("./standard-closure-resource-budget").StandardOperationalAdmissionV3;
    readonly referenceSerializationAdmission: import("./standard-closure-resource-budget").ReferenceBoundSerializationAdmissionV3 | null;
    readonly planSerializationAdmission: import("./standard-closure-resource-budget").StandardPlanSerializationAdmissionV3;
    readonly referenceAdmission: ReferenceAdmissionV3 | null;
    readonly counterContract: {
      readonly version: 1;
      readonly numericCells: "peak-tracked-retained-scientific-slots";
      readonly numericMetadata: "covered-by-structural-byte-policy";
      readonly bytes: "conservative-structural-and-temporary-overlap-bound";
    };
    readonly observed: RuntimeResourceObservationV3;
  };
  readonly diagnostics: readonly ModelDiagnosticV3[];
}

export interface BoundStandardResultV3 {
  readonly schemaVersion: 3;
  readonly kind: "open-ena-bound-result";
  readonly binding: ResultBindingV3;
  readonly configuration: CanonicalStandardConfigV3;
  readonly executionProvenance: ResultExecutionProvenanceV3;
  readonly set: SerializableEnaSetV3;
  readonly capabilityStatus: ModelCapabilityStatusV3;
  readonly createdAt: string;
}

export interface OnaRuntimeResourceObservationV3 {
  readonly processedRows: number;
  /** Observed maximum only at successful chunk boundaries, never called a true peak. */
  readonly maximumRetainedRowsAfterChunk: number;
  /** Conservative retained history plus one arriving row. */
  readonly bufferedRowsPeakUpperBound: number;
  readonly numericCellsUpperBound: number;
  readonly peakBytesUpperBound: number;
  readonly observationMethod: "dimension-bounds-and-chunk-boundary-stream-state";
}

export interface OnaResultExecutionProvenanceV3 {
  readonly header: OnaExecutionPlanV3["header"];
  readonly sourceProofSha256: string;
  readonly identityDictionary: OnaExecutionPlanV3["identityDictionary"];
  readonly unitGroups: readonly { readonly unitToken: string; readonly groupToken: string | null }[];
  readonly codeDictionary: OnaExecutionPlanV3["codeDictionary"];
  readonly codeRepresentations: OnaExecutionPlanV3["codeRepresentations"];
  readonly labels: ResultExecutionProvenanceV3["labels"];
  readonly ordering: {
    readonly requestedRowOrder: CanonicalRowOrderV3;
    readonly resolvedRowOrder: OnaExecutionPlanV3["rowOrdering"];
    readonly resolvedHorizonOrder: OnaExecutionPlanV3["horizonOrdering"];
    readonly runtimeSourceRowIndices: readonly number[];
  };
  readonly adapterParameters: OnaExecutionPlanV3["adapterParameters"];
  readonly weighting: OnaExecutionPlanV3["weighting"];
  readonly directionalMask: OnaExecutionPlanV3["directionalMask"];
  readonly normalization: "sphere";
  readonly boundary: "within-horizon";
  readonly reference: null;
  readonly projection: {
    readonly type: "svd";
    readonly centerAlignToOrigin: true;
    readonly rank: number;
    readonly fullAxes: readonly string[];
    readonly estimableAxes: readonly string[];
    /** Geometry is carried once, in the hashed set; no duplicate numeric payload. */
    readonly geometryPath: "set.rotation";
    readonly variancePath: "set.variance";
  };
  readonly populations: { readonly fit: "endpoint-units"; readonly fitTokens: readonly string[]; readonly targetTokens: readonly string[]; readonly imputedStepCount: 0 };
  readonly resources: {
    readonly targetBaseline: OnaExecutionPlanV3["header"]["resourceEstimate"];
    readonly operationalAdmission: OnaExecutionPlanV3["operationalAdmission"];
    readonly counterContract: { readonly version: 1; readonly numericCells: "conservative-phase-dimension-upper-bound"; readonly bufferedRows: "chunk-boundary-observation-plus-separate-peak-upper-bound"; readonly bytes: "conservative-structural-and-temporary-overlap-bound" };
    readonly observed: OnaRuntimeResourceObservationV3;
  };
  readonly diagnostics: readonly OnaCompilerDiagnosticV3[];
}

export interface BoundOnaResultV3 {
  readonly schemaVersion: 3;
  readonly kind: "open-ena-bound-result";
  readonly binding: ResultBindingV3;
  readonly configuration: CanonicalOnaConfigV3;
  readonly executionProvenance: OnaResultExecutionProvenanceV3;
  readonly set: SerializableEnaSetV3;
  readonly orderedAudit: import("../types").OpenEnaOrderedAudit;
  readonly orderedResponseNodeSummary: import("../types").OpenEnaOrderedResponseNodeSummary;
  readonly capabilityStatus: ModelCapabilityStatusV3;
  readonly createdAt: string;
}

export type BoundResultV3 = BoundStandardResultV3 | BoundOnaResultV3;

export interface OpenEnaModelTablesV3 {
  connectionCounts: import("jena-js").Row[];
  lineWeights: import("jena-js").Row[];
  pointsForProjection: import("jena-js").Row[];
  points: import("jena-js").Row[];
  trajectories: import("jena-js").Row[];
}

/** Retains optional-field presence, including trajectories, in the scientific hash. */
export type OpenEnaBundleModelDataV3 = Omit<SerializableEnaSetV3,
  "connectionCounts" | "lineWeights" | "pointsForProjection" | "points" | "rotation">;

export interface BoundStatisticsV3 {
  available: boolean;
  diagnostics: string[];
  value: import("jena-js").ENAStatsResult | null;
}

export interface NodeDisplayOverrideV3 {
  code: string;
  coordinates: Record<string, number>;
}

export interface PresentationArtifactV3 {
  boundResultSha256: string;
  hiddenCodes: string[];
  hiddenGroups: ScalarIdentityV3[];
  codeColors: Record<string, string>;
  nodeOverrides: NodeDisplayOverrideV3[];
  dimensions: string[];
  camera3d?: import("../plot3d").OpenEna3dCamera;
}

export interface BundleComponentHashesV3 {
  manifest: string;
  createdAt: string;
  configuration: string;
  executionProvenance: string;
  tables: string;
  modelData: string;
  rotation: string;
  statistics: string;
  capabilityStatus: string;
  diagnostics: string;
  presentation?: string;
  methodsReportMarkdown: string;
}

interface AnalysisBundleBaseV3 {
  schemaVersion: 3;
  kind: "open-ena-analysis-bundle";
  manifest: ResultBindingV3;
  createdAt: string;
  tables: OpenEnaModelTablesV3;
  modelData: OpenEnaBundleModelDataV3;
  rotation: RotationSet;
  statistics: BoundStatisticsV3;
  capabilityStatus: BoundResultV3["capabilityStatus"];
  presentation?: PresentationArtifactV3;
  methodsReportMarkdown: string;
}

export interface StandardAnalysisBundleV3 extends AnalysisBundleBaseV3 {
  configuration: BoundStandardResultV3["configuration"];
  executionProvenance: ResultExecutionProvenanceV3;
  diagnostics: { warnings: readonly ModelDiagnosticV3[]; execution: string[] };
  integrity: { componentHashes: BundleComponentHashesV3; bundleContentSha256: string };
}

export interface OnaAnalysisBundleV3 extends AnalysisBundleBaseV3 {
  configuration: BoundOnaResultV3["configuration"];
  executionProvenance: OnaResultExecutionProvenanceV3;
  orderedAudit: BoundOnaResultV3["orderedAudit"];
  orderedResponseNodeSummary: BoundOnaResultV3["orderedResponseNodeSummary"];
  diagnostics: { warnings: readonly import("./ona-compiler-preflight").OnaCompilerDiagnosticV3[]; execution: string[] };
  integrity: { componentHashes: BundleComponentHashesV3 & { orderedAudit: string; orderedResponseNodeSummary: string }; bundleContentSha256: string };
}

/** Portable historical artifact. This type does not confer source/current-plan authority. */
export type OpenEnaAnalysisBundleV3 = StandardAnalysisBundleV3 | OnaAnalysisBundleV3;

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
    readonly type: "svd" | "means" | "reference";
    readonly runtimeFirstAxis: string;
    readonly centerAlignToOrigin: boolean;
    readonly centerVector: readonly number[];
    /** Intrinsic target rank; Reference measures the actual full fixed coordinates. Source rank is populations.sourceFit.rank. */
    readonly rank: number;
    /** Complete square basis, including completion axes required by Reference. */
    readonly fullAxes: readonly string[];
    /**
     * Supported projected coordinates, not a count of independent dimensions.
     * SVD uses the intrinsic rank prefix. Means retains validated MR1 plus
     * residual coordinates with variance share > largest axis share * 1e-12;
     * multiple supported Means coordinates can describe one intrinsic dimension.
     * Reference retains source-supported axes even when this target has rank zero.
     */
    readonly estimableAxes: readonly string[];
    /** Full-basis variance shares in fullAxes order, never display-renormalized. */
    readonly variance: readonly number[];
    /** Explicit Reference target rank, equal to rank; absent for a target fit. */
    readonly targetProjectionRank?: number;
  };
  readonly populations: {
    /** Means centering/residual SVD uses all endpoints; meansBinding defines MR1. */
    readonly fit: "endpoint-units" | "observed-unit-horizon-steps" | "reference-source-endpoint-units";
    /** Actual target fit order, or empty for Reference; source identity is retained by sourceFit.populationSha256. */
    readonly fitTokens: readonly string[];
    /** Actual target connectionCounts order: Unit tokens or canonical [Unit,Horizon] pairs. */
    readonly targetTokens: readonly string[];
    readonly trajectoryStepCountByUnit: Readonly<Record<string, number>>;
    readonly imputedStepCount: 0;
    /** Original Reference fit metadata; never replaced by the target projection population. */
    readonly sourceFit?: OpenEnaStandardReferenceV2["fit"];
  };
}

/** Realm-local proof of an owned, validated fresh fit; never a worker BoundResult. */
declare const referenceSourceWitnessV3: unique symbol;
export interface ReferenceSourceWitnessV3 {
  readonly [referenceSourceWitnessV3]: true;
}

export type ReferenceCodeIdentityV2 = { readonly type: "string"; readonly value: string };
export type ReferenceRowPolicyV2 =
  | Extract<CanonicalRowOrderV3, { kind: "columns" }>
  | { kind: "source-order-confirmed" };

export interface ReferenceCompatibilityV2 {
  readonly normalization: "sphere";
  readonly unitFields: readonly string[];
  readonly horizonFields: readonly string[];
  readonly weighting: CanonicalStandardConfigV3["weighting"];
  readonly window: {
    readonly type: StandardWindowTypeV3;
    readonly backward: BackwardExtentV3;
    readonly forward: ForwardExtentV3;
    readonly rowOrder: ReferenceRowPolicyV2 | null;
  };
}

export interface OpenEnaStandardReferenceV2 {
  readonly schemaVersion: 2;
  readonly kind: "open-ena-standard-reference-rotation";
  readonly family: "Standard";
  readonly sourceModel: "EndPoint";
  readonly displayName: string;
  readonly contentSha256: string;
  readonly referenceId: string;
  readonly source: {
    readonly datasetBinding: DatasetBindingV3;
    readonly configuration: CanonicalStandardConfigV3;
    readonly configurationSha256: string;
    readonly executionPlanSha256: string;
    readonly sourceProofSha256: string;
    /** Public hashes establish internal integrity, not source authentication. */
    readonly externalHashVerification: "provenance-only-no-normalized-table-preimage";
    readonly runtime: {
      readonly runtimeVersion: string;
      readonly algorithmBuildSha: string;
      readonly validationContractVersion: typeof OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3;
      readonly runtimePolicyVersion: typeof OPEN_ENA_RUNTIME_POLICY_VERSION_V3;
      readonly executionContractVersion: typeof OPEN_ENA_EXECUTION_CONTRACT_VERSION_V3;
    };
  };
  readonly fit: {
    readonly method: "svd" | "means";
    readonly origin: "target-fitted";
    readonly population: "endpoint-units";
    readonly observationCount: number;
    readonly populationSha256: string;
    readonly centerAlignToOrigin: boolean;
    readonly rank: number;
    readonly estimableAxes: readonly string[];
    readonly variance: readonly number[];
    readonly means: null | {
      readonly groupColumn: string;
      readonly negativeLevel: ScalarIdentityV3;
      readonly positiveLevel: ScalarIdentityV3;
      readonly negativeCount: number;
      readonly positiveCount: number;
      readonly direction: "positive-minus-negative";
    };
  };
  readonly compatibility: ReferenceCompatibilityV2;
  readonly basis: {
    readonly codes: readonly ReferenceCodeIdentityV2[];
    readonly edges: ReadonlyArray<{
      readonly source: ReferenceCodeIdentityV2;
      readonly target: ReferenceCodeIdentityV2;
    }>;
  };
  readonly geometry: {
    readonly centerVector: readonly number[];
    readonly rotationMatrix: ReadonlyArray<readonly number[]>;
    readonly rotationColumns: readonly string[];
    readonly eigenvalues: readonly number[];
    /** Only coordinates actually fitted by jENA; no synthesized completion nodes. */
    readonly nodeColumns: readonly string[];
    readonly nodes: ReadonlyArray<{
      readonly code: ReferenceCodeIdentityV2;
      readonly coordinates: readonly number[];
    }>;
  };
}
