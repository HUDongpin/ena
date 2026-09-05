import type { Row } from "jena-js";
import { fixedProjectionRankV3 } from "./analyze";
import { adjacencyKey, orderedAdjacencyKey } from "jena-js/core";
import {
  canonicalJsonV3,
  sha256CanonicalJsonV3,
} from "./model-v3/canonical-json";
import {
  decodeCanonicalOnaConfigV3,
  decodeCanonicalStandardConfigV3,
} from "./model-v3/schema";
import {
  scalarIdentityV3,
  validateExecutionIdentityDictionaryV3,
} from "./model-v3/identity";
import { buildStandardCodeDictionaryV3 } from "./model-v3/standard-adapter";
import { buildOnaCodeDictionaryV3 } from "./model-v3/ona-adapter";
import { bindReferenceToTargetV3 } from "./model-v3/reference-codec-v2";
import { scientificResultHashPayloadV3 } from "./model-v3/result-binding";
import { assertStandardInternalDerivationsV3 } from "./model-v3/standard-scientific-closure";
import { assertOnaInternalDerivationsV3 } from "./model-v3/ona-scientific-closure";
import {
  assertCombinedStandardResourcesV3,
  captureStandardOperationalAdmissionV3,
} from "./model-v3/standard-closure-resource-budget";
import {
  MODEL_DIAGNOSTIC_IDS_V3,
  centeredNetworkRankV3,
} from "./model-v3/diagnostics";
import { ONA_COMPILER_DIAGNOSTIC_IDS_V3 } from "./model-v3/ona-compiler-preflight";
import type {
  ResolvedExecutionRowOrderingV3,
  ResolvedExecutionHorizonOrderingV3,
} from "./model-v3/execution-plan";
import { MAX_ESTIMATED_ROTATION_WORK_UNITS_V3 } from "./model-v3/resource-budget";
import type {
  BoundResultV3,
  BoundStandardResultV3,
  BoundOnaResultV3,
  BoundStatisticsV3,
  OpenEnaAnalysisBundleV3,
  SerializableEnaSetV3,
  ResultExecutionProvenanceV3,
  OnaResultExecutionProvenanceV3,
  PresentationArtifactV3,
} from "./model-v3/types";

const CAPABILITIES = [
  "build-model",
  "export-current-model",
  "export-reference",
  "group-inference",
  "trajectory-inference",
  "longitudinal-comparison",
  "ai-interpretation",
];
const MANIFEST = [
  "datasetSha256",
  "datasetHashKind",
  "headerSha256",
  "rowCount",
  "configurationSha256",
  "executionPlanSha256",
  "scientificResultSha256",
  "runtimeVersion",
  "algorithmBuildSha",
  "validationContractVersion",
  "runtimePolicyVersion",
  "executionContractVersion",
  "referenceId",
  "referenceContentSha256",
];
const COMPONENTS = [
  "manifest",
  "createdAt",
  "configuration",
  "executionProvenance",
  "tables",
  "modelData",
  "rotation",
  "statistics",
  "capabilityStatus",
  "diagnostics",
  "methodsReportMarkdown",
];
function fail(label: string): never {
  throw new TypeError(`Bundle contract: inconsistent ${label}.`);
}
function same(actual: unknown, expected: unknown, label: string): void {
  if (canonicalJsonV3(actual) !== canonicalJsonV3(expected)) fail(label);
}
function keys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("object shape");
  const actual = Object.keys(value),
    allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    actual.some((key) => !allowed.has(key))
  )
    fail(`exact fields (${required.join(", ")})`);
}
function integer(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    fail("nonnegative integer");
}
function finite(value: unknown, nonnegative = false): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    (nonnegative && value < 0)
  )
    fail("finite scientific number");
}
function string(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.length) fail("nonempty string");
}
function hash(value: unknown): void {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value))
    fail("SHA-256 hash");
}
function unique(values: readonly unknown[], label: string): void {
  if (
    !Array.isArray(values) ||
    new Set(values.map((v) => canonicalJsonV3(v))).size !== values.length
  )
    fail(`${label} uniqueness`);
}
function permutation(
  values: readonly number[],
  size: number,
  label: string,
): void {
  unique(values, label);
  if (
    values.length !== size ||
    values.some(
      (value) => !Number.isSafeInteger(value) || value < 0 || value >= size,
    )
  )
    fail(`${label} ordinal coverage`);
}
function arraySize(
  value: unknown,
  length: number,
  label: string,
): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length !== length)
    fail(`${label} cardinality`);
}
function matrix(
  value: unknown,
  rows: number,
  columns: number,
  label: string,
  nonnegative = false,
): void {
  arraySize(value, rows, label);
  for (const row of value) {
    arraySize(row, columns, label);
    row.forEach((cell) => finite(cell, nonnegative));
  }
}
function near(actual: number, expected: number, label: string): void {
  if (
    !Number.isFinite(actual) ||
    !Number.isFinite(expected) ||
    Math.abs(actual - expected) >
      1e-10 + 1e-9 * Math.max(Math.abs(actual), Math.abs(expected))
  )
    fail(label);
}

export function unavailableBundleStatisticsV3(): BoundStatisticsV3 {
  return {
    available: false,
    diagnostics: ["Statistics were not computed in this bound result."],
    value: null,
  };
}
export function minimalBundleMethodsV3(result: BoundResultV3): string {
  const p = result.executionProvenance;
  return [
    "# Bound ENA analysis",
    "",
    `Family: ${result.configuration.analysisFamily}.`,
    `Model: ${result.set.modelType}.`,
    `Window: ${result.set.functionParams.window}; backward ${result.set.functionParams.windowSizeBack}; forward ${result.set.functionParams.windowSizeForward}.`,
    `Weighting: ${p.weighting.runtime}; normalization: ${p.normalization}; boundary: ${p.boundary}.`,
    `Rotation: ${p.projection.type}; full dimensions: ${result.set.rotation.rotationColumns.length}.`,
    `Dataset SHA-256: ${result.binding.datasetSha256}.`,
    `Configuration SHA-256: ${result.binding.configurationSha256}.`,
    `Execution plan SHA-256: ${result.binding.executionPlanSha256}.`,
    `Scientific result SHA-256: ${result.binding.scientificResultSha256}.`,
    `Runtime: ${result.binding.runtimeVersion}; algorithm build: ${result.binding.algorithmBuildSha}.`,
    `Reference: ${result.binding.referenceId ?? "none"}.`,
    "Statistics: unavailable; no statistical analysis was computed in this bound result.",
    ...(result.configuration.analysisFamily === "ona"
      ? [
          "ONA is descriptive only; directed audit and response summaries are retained.",
        ]
      : []),
    "Content integrity and internal consistency do not authenticate source data or establish a new Reference fit.",
    "",
  ].join("\n");
}

/** Reconstructs data only. This never creates a validated-result/source-witness brand. */
export function boundResultFromBundleV3(
  bundle: OpenEnaAnalysisBundleV3,
): BoundResultV3 {
  const { connectionCounts, lineWeights, pointsForProjection, points } =
    bundle.tables;
  return {
    schemaVersion: 3,
    kind: "open-ena-bound-result",
    binding: bundle.manifest,
    createdAt: bundle.createdAt,
    configuration: bundle.configuration,
    executionProvenance: bundle.executionProvenance,
    set: {
      ...bundle.modelData,
      connectionCounts,
      lineWeights,
      pointsForProjection,
      points,
      rotation: bundle.rotation,
    },
    capabilityStatus: bundle.capabilityStatus,
    ...("orderedAudit" in bundle
      ? {
          orderedAudit: bundle.orderedAudit,
          orderedResponseNodeSummary: bundle.orderedResponseNodeSummary,
        }
      : {}),
  } as BoundResultV3;
}

function assertHeader(result: BoundResultV3): void {
  const m = result.binding,
    h = result.executionProvenance.header;
  keys(m, MANIFEST);
  keys(h, [
    "schemaVersion",
    "analysisFamily",
    "datasetBinding",
    "resourceEstimate",
    ...MANIFEST.filter(
      (key) =>
        ![
          "referenceId",
          "referenceContentSha256",
          "scientificResultSha256",
        ].includes(key),
    ),
  ]);
  if (
    h.schemaVersion !== 3 ||
    h.analysisFamily !== result.configuration.analysisFamily
  )
    fail("header family");
  for (const key of MANIFEST.filter(
    (key) =>
      ![
        "referenceId",
        "referenceContentSha256",
        "scientificResultSha256",
      ].includes(key),
  ))
    same(
      m[key as keyof typeof m],
      h[key as keyof typeof h],
      `manifest/header ${key}`,
    );
  for (const key of [
    "datasetSha256",
    "headerSha256",
    "configurationSha256",
    "executionPlanSha256",
    "scientificResultSha256",
  ] as const)
    hash(m[key]);
  if (
    typeof m.algorithmBuildSha !== "string" ||
    !/^[0-9a-f]{40}$/u.test(m.algorithmBuildSha)
  )
    fail("algorithm build SHA");
  for (const key of [
    "runtimeVersion",
    "validationContractVersion",
    "runtimePolicyVersion",
    "executionContractVersion",
  ] as const)
    string(m[key]);
  same(
    m.validationContractVersion,
    result.configuration.contracts.validationContractVersion,
    "validation version",
  );
  same(
    m.runtimePolicyVersion,
    result.configuration.contracts.runtimePolicyVersion,
    "runtime policy version",
  );
  integer(m.rowCount);
  if (!m.rowCount || m.rowCount > 100_000) fail("row count limit");
  same(
    h.datasetBinding,
    {
      hashKind: m.datasetHashKind,
      normalizedTableSha256: m.datasetSha256,
      rowCount: m.rowCount,
      headerSha256: m.headerSha256,
    },
    "dataset binding",
  );
  if (
    ![
      "normalized-utf8-text-sha256",
      "normalized-utf8-csv-text-sha256",
      "canonical-first-xlsx-worksheet-v1-sha256",
    ].includes(m.datasetHashKind)
  )
    fail("dataset hash kind");
  if (
    typeof result.createdAt !== "string" ||
    !Number.isFinite(Date.parse(result.createdAt))
  )
    fail("creation timestamp");
}

function assertResources(
  p: ResultExecutionProvenanceV3 | OnaResultExecutionProvenanceV3,
  ona: boolean,
): void {
  const r = p.resources,
    b = p.header.resourceEstimate;
  keys(r, [
    "targetBaseline",
    "operationalAdmission",
    "counterContract",
    "observed",
    ...(!ona
      ? [
          "referenceSerializationAdmission",
          "planSerializationAdmission",
          "referenceAdmission",
        ]
      : []),
  ]);
  const numeric = [
    "rows",
    "units",
    "horizons",
    "windowPartitions",
    "codes",
    "adjacencyDimensions",
    "datasetSizeBytes",
    "identityPayloadBytes",
    "aggregateStateUpperBound",
    "estimatedStateCount",
    "estimatedStructuralBytes",
    "estimatedForwardBufferRows",
    "estimatedRetainedWindowRows",
    "estimatedWindowStateCells",
    "estimatedWindowVisits",
    "estimatedNumericCells",
    "estimatedWorkerMaterializationBytes",
    "estimatedExportBytes",
    "estimatedPeakBytes",
    "estimatedRotationWorkUnits",
    "estimatedRotationMatrixBytes",
    ...(ona
      ? ["endpointNetworks", "directionalMaskCells"]
      : ["trajectorySteps", "resultIdentityBytes"]),
  ];
  keys(b, [
    "version",
    "analysisFamily",
    "blocked",
    "blockedReasons",
    ...numeric,
  ]);
  for (const key of numeric)
    integer((b as unknown as Record<string, unknown>)[key]);
  string(b.version);
  same(b.analysisFamily, ona ? "ona" : "standard", "resource family");
  same(b.blocked, false, "resource admission");
  same(b.blockedReasons, [], "resource blocks");
  same(r.targetBaseline, b, "resource baseline");
  same(b.rows, p.header.rowCount, "resource rows");
  same(b.units, p.identityDictionary.units.length, "resource Units");
  same(b.horizons, p.identityDictionary.horizons.length, "resource Horizons");
  same(b.codes, p.codeDictionary.codes.length, "resource Codes");
  same(b.adjacencyDimensions, p.codeDictionary.edges.length, "resource edges");
  if (ona) {
    const op = r.operationalAdmission;
    const fields = [
      "compactScientificCells",
      "resultIdentityBytes",
      "generatedTableKeyBytes",
      "numericSerializationBytes",
      "metadataSerializationBytes",
      "closureWorkUnits",
      "incrementalNumericCells",
      "incrementalPeakBytes",
      "incrementalExportBytes",
      "totalNumericCells",
      "totalPeakBytes",
      "totalExportBytes",
      "totalStructuralBytes",
    ];
    keys(op, ["version", "stages", ...fields]);
    fields.forEach((field) =>
      integer((op as unknown as Record<string, unknown>)[field]),
    );
    same(op.version, "open-ena-ona-operational-v1", "ONA operational version");
    keys(op.stages, [
      "sourceCaptureCells",
      "accumulationCells",
      "modelCells",
      "bindingCells",
      "rankDiagnosticCells",
      "validationScratchCells",
      "scientificClosureCells",
    ]);
    Object.values(op.stages).forEach(integer);
    same(
      r.counterContract,
      {
        version: 1,
        numericCells: "conservative-phase-dimension-upper-bound",
        bufferedRows:
          "chunk-boundary-observation-plus-separate-peak-upper-bound",
        bytes: "conservative-structural-and-temporary-overlap-bound",
      },
      "ONA counter contract",
    );
    keys(r.observed, [
      "processedRows",
      "maximumRetainedRowsAfterChunk",
      "bufferedRowsPeakUpperBound",
      "numericCellsUpperBound",
      "peakBytesUpperBound",
      "observationMethod",
    ]);
    const observed = (p as OnaResultExecutionProvenanceV3).resources.observed;
    same(
      observed.observationMethod,
      "dimension-bounds-and-chunk-boundary-stream-state",
      "ONA observation semantics",
    );
    if (observed.maximumRetainedRowsAfterChunk > b.estimatedRetainedWindowRows)
      fail("ONA observed retained rows");
    same(
      observed.bufferedRowsPeakUpperBound,
      Math.min(b.rows, b.estimatedRetainedWindowRows + 1),
      "ONA buffered bound",
    );
    same(
      observed.numericCellsUpperBound,
      op.totalNumericCells,
      "ONA observed cell bound",
    );
    same(observed.peakBytesUpperBound, op.totalPeakBytes, "ONA observed bytes");
  } else {
    captureStandardOperationalAdmissionV3(r.operationalAdmission);
    const standard = p as ResultExecutionProvenanceV3;
    keys(standard.resources.planSerializationAdmission, [
      "version",
      "planJsonBytesUpper",
      "serializationPeakBytes",
    ]);
    same(
      standard.resources.planSerializationAdmission.version,
      "open-ena-standard-plan-serialization-v1",
      "plan serialization version",
    );
    integer(standard.resources.planSerializationAdmission.planJsonBytesUpper);
    integer(
      standard.resources.planSerializationAdmission.serializationPeakBytes,
    );
    if (
      (standard.resources.referenceSerializationAdmission !== null) !==
      (standard.reference !== null)
    )
      fail("Reference serialization admission presence");
    if (standard.resources.referenceSerializationAdmission !== null) {
      const ref = standard.resources.referenceSerializationAdmission;
      keys(ref, [
        "version",
        "scientificValueOccurrences",
        "referencePayloadBytes",
        "incrementalNumericCells",
        "incrementalPeakBytes",
        "incrementalExportBytes",
      ]);
      same(
        ref.version,
        "open-ena-reference-bound-serialization-v1",
        "Reference serialization version",
      );
      for (const [key, value] of Object.entries(ref))
        if (key !== "version") integer(value);
      same(
        ref.incrementalNumericCells,
        0,
        "Reference serialization numeric cells",
      );
    }
    same(
      standard.resources.referenceAdmission,
      standard.reference?.admission ?? null,
      "Reference admission duplicate",
    );
    same(
      r.counterContract,
      {
        version: 1,
        numericCells: "peak-tracked-retained-scientific-slots",
        numericMetadata: "covered-by-structural-byte-policy",
        bytes: "conservative-structural-and-temporary-overlap-bound",
      },
      "Standard counter contract",
    );
    keys(r.observed, [
      "processedRows",
      "maximumBufferedRows",
      "numericCellsAllocated",
      "peakBytesObservedOrBounded",
      "observationMethod",
    ]);
    same(
      standard.resources.observed.observationMethod,
      "exact-counters-and-conservative-byte-bound",
      "Standard observation semantics",
    );
    const limits = assertCombinedStandardResourcesV3(
      standard.resources.operationalAdmission,
      standard.resources.referenceAdmission,
      standard.resources.referenceSerializationAdmission,
      standard.resources.planSerializationAdmission,
    );
    const observed = standard.resources.observed;
    if (
      observed.maximumBufferedRows >
        Math.min(b.rows, b.estimatedRetainedWindowRows + 1) ||
      observed.numericCellsAllocated > limits.estimatedNumericCells ||
      observed.peakBytesObservedOrBounded > limits.estimatedPeakBytes
    )
      fail("observed resource bounds");
  }
  for (const [key, value] of Object.entries(r.observed))
    if (key !== "observationMethod") integer(value);
  same(r.observed.processedRows, p.header.rowCount, "processed rows");
}

function assertResolvedOrderMetadata(
  order: ResolvedExecutionRowOrderingV3 | ResolvedExecutionHorizonOrderingV3,
  p: ResultExecutionProvenanceV3 | OnaResultExecutionProvenanceV3,
): void {
  const policy = order.requestedPolicy;
  if (policy.kind === "source-order-confirmed") {
    same(
      order.sourceOrderBinding,
      {
        analysisFamily: p.header.analysisFamily,
        datasetBinding: p.header.datasetBinding,
        confirmation: policy.confirmation,
      },
      "source order binding",
    );
    same(
      policy.confirmation.datasetSha256,
      p.header.datasetSha256,
      "source confirmation hash",
    );
    same(
      policy.confirmation.rowCount,
      p.header.rowCount,
      "source confirmation row count",
    );
  } else same(order.sourceOrderBinding, null, "column order source binding");
  const textKeys =
    policy.kind === "columns"
      ? policy.keys.filter((key) => key.comparator.type === "text")
      : [];
  arraySize(
    order.textCollationBindings,
    textKeys.length,
    "text collation bindings",
  );
  order.textCollationBindings.forEach((binding, index) => {
    keys(binding, [
      "column",
      "requestedLocale",
      "resolvedLocale",
      "collation",
      "sensitivity",
      "numeric",
      "usage",
      "ignorePunctuation",
      "caseFirst",
    ]);
    const requested = textKeys[index];
    if (requested.comparator.type !== "text") fail("text comparator");
    same(binding.column, requested.column, "collation column");
    same(
      binding.requestedLocale,
      requested.comparator.locale,
      "requested locale",
    );
    same(
      binding.sensitivity,
      requested.comparator.sensitivity,
      "collation sensitivity",
    );
    same(
      binding.numeric,
      requested.comparator.numeric,
      "collation numeric policy",
    );
    string(binding.resolvedLocale);
    string(binding.collation);
    same(binding.usage, "sort", "collation usage");
    if (
      typeof binding.ignorePunctuation !== "boolean" ||
      !["upper", "lower", "false"].includes(binding.caseFirst)
    )
      fail("collation metadata");
  });
}

function assertOrdering(
  p: ResultExecutionProvenanceV3 | OnaResultExecutionProvenanceV3,
  ona: boolean,
): void {
  const o = p.ordering,
    n = p.header.rowCount;
  keys(o, [
    "requestedRowOrder",
    "resolvedRowOrder",
    "resolvedHorizonOrder",
    "runtimeSourceRowIndices",
    ...(!ona ? ["requestedHorizonOrder"] : []),
  ]);
  permutation(o.runtimeSourceRowIndices, n, "runtime row order");
  const row = o.resolvedRowOrder,
    horizon = o.resolvedHorizonOrder;
  const horizons = new Set(
    p.identityDictionary.horizons.map((entry) => entry.token),
  );
  if (row.type === "not-applicable") {
    same(
      row,
      { type: "not-applicable", reason: "conversation-window" },
      "row order reason",
    );
    same(o.requestedRowOrder, null, "unused row order");
  } else {
    keys(row, [
      "type",
      "requestedPolicy",
      "mappings",
      "orderedSourceRowIndices",
      "sourceOrderBinding",
      "textCollationBindings",
    ]);
    same(row.type, "within-horizon-order", "row ordering type");
    same(row.requestedPolicy, o.requestedRowOrder, "row policy");
    assertResolvedOrderMetadata(row, p);
    permutation(row.orderedSourceRowIndices, n, "resolved row order");
    permutation(
      row.mappings.map((entry) => entry.sourceRowIndex),
      n,
      "row mapping",
    );
    const ordinals = new Map<string, number[]>();
    row.mappings.forEach((entry) => {
      keys(entry, [
        "sourceRowIndex",
        "horizonToken",
        "orderTuple",
        "withinHorizonOrdinal",
      ]);
      if (!horizons.has(entry.horizonToken)) fail("row Horizon identity");
      integer(entry.withinHorizonOrdinal);
      if (
        !Array.isArray(entry.orderTuple) ||
        entry.orderTuple.some(
          (cell) =>
            typeof cell !== "string" &&
            (typeof cell !== "number" || !Number.isFinite(cell)),
        )
      )
        fail("order tuple");
      const list = ordinals.get(entry.horizonToken) ?? [];
      list.push(entry.withinHorizonOrdinal);
      ordinals.set(entry.horizonToken, list);
    });
    for (const ords of ordinals.values())
      permutation(ords, ords.length, "within-Horizon");
    const map = new Map(
      row.mappings.map((entry) => [entry.sourceRowIndex, entry]),
    );
    for (const indices of [
      row.orderedSourceRowIndices,
      o.runtimeSourceRowIndices,
    ]) {
      const next = new Map<string, number>();
      indices.forEach((index) => {
        const item = map.get(index)!;
        if (item.withinHorizonOrdinal !== (next.get(item.horizonToken) ?? 0))
          fail("within-Horizon ordinal order");
        next.set(item.horizonToken, item.withinHorizonOrdinal + 1);
      });
    }
  }
  if (horizon.type === "not-applicable")
    same(
      horizon,
      { type: "not-applicable", reason: "endpoint-model" },
      "Horizon order reason",
    );
  else {
    keys(horizon, [
      "type",
      "requestedPolicy",
      "horizonTuples",
      "unitSequences",
      "implementationHorizonOrder",
      "sourceOrderBinding",
      "textCollationBindings",
    ]);
    same(horizon.type, "trajectory-horizon-order", "Horizon ordering type");
    same(
      horizon.requestedPolicy,
      (p as ResultExecutionProvenanceV3).ordering.requestedHorizonOrder,
      "Horizon policy",
    );
    assertResolvedOrderMetadata(horizon, p);
    unique(
      horizon.horizonTuples.map((entry) => entry.horizonToken),
      "Horizon tuples",
    );
    same(
      horizon.horizonTuples.map((entry) => entry.horizonToken).sort(),
      [...horizons].sort(),
      "complete Horizon tuples",
    );
    same(
      [...horizon.implementationHorizonOrder].sort(),
      [...horizons].sort(),
      "complete Horizon order",
    );
    horizon.horizonTuples.forEach((entry) => {
      keys(entry, ["horizonToken", "orderTuple"]);
      if (
        !horizons.has(entry.horizonToken) ||
        !Array.isArray(entry.orderTuple) ||
        entry.orderTuple.some(
          (cell) =>
            typeof cell !== "string" &&
            (typeof cell !== "number" || !Number.isFinite(cell)),
        )
      )
        fail("Horizon tuple");
    });
    unique(
      horizon.unitSequences.map((entry) => entry.unitToken),
      "Unit sequences",
    );
    const units = new Set(
      p.identityDictionary.units.map((entry) => entry.token),
    );
    horizon.unitSequences.forEach((entry) => {
      keys(entry, ["unitToken", "steps"]);
      if (!units.has(entry.unitToken)) fail("sequence Unit");
      unique(
        entry.steps.map((step) => step.horizonToken),
        "Unit Horizon steps",
      );
      entry.steps.forEach((step, index) => {
        keys(step, ["horizonToken", "trajectoryOrdinal"]);
        if (
          !horizons.has(step.horizonToken) ||
          step.trajectoryOrdinal !== index
        )
          fail("trajectory ordinal");
      });
    });
  }
}

async function assertProvenance(result: BoundResultV3): Promise<void> {
  const p = result.executionProvenance,
    ona = result.configuration.analysisFamily === "ona";
  keys(p, [
    "header",
    "sourceProofSha256",
    "identityDictionary",
    "unitGroups",
    "codeDictionary",
    "codeRepresentations",
    "labels",
    "ordering",
    "adapterParameters",
    "weighting",
    "normalization",
    "boundary",
    "reference",
    "projection",
    "populations",
    "resources",
    "diagnostics",
    ...(ona ? ["directionalMask"] : ["meansBinding"]),
  ]);
  hash(p.sourceProofSha256);
  await validateExecutionIdentityDictionaryV3(p.identityDictionary);
  const config = result.configuration,
    dictionary = ona
      ? buildOnaCodeDictionaryV3(config.codes)
      : buildStandardCodeDictionaryV3(config.codes);
  same(p.codeDictionary, dictionary, "canonical Code dictionary");
  const runtimeCodes = dictionary.codes.map((code) => code.token),
    codes = runtimeCodes.map((_code, i) => `Code ${i + 1}`);
  const edges = ona
    ? orderedAdjacencyKey(runtimeCodes)
    : adjacencyKey(runtimeCodes);
  same(
    p.labels,
    {
      unitColumn: "Unit",
      horizonColumn: "Horizon",
      groupColumn: "Group",
      codes: dictionary.codes.map((code, i) => ({
        runtimeToken: code.token,
        column: codes[i],
        sourceColumn: code.sourceColumn,
        displayLabel: code.displayLabel,
        canonicalIdentity: code.canonicalIdentity,
      })),
      edges: edges.map((edge, i) => ({
        runtimeColumn: edge.name,
        column: `Connection ${i + 1}`,
        sourceCodeIdentity:
          dictionary.codes[edge.sourceIndex].canonicalIdentity,
        targetCodeIdentity:
          dictionary.codes[edge.targetIndex].canonicalIdentity,
      })),
    },
    "Code/edge labels",
  );
  arraySize(p.codeRepresentations, runtimeCodes.length, "Code representations");
  p.codeRepresentations.forEach((entry, index) => {
    keys(entry, [
      "runtimeToken",
      "sourceColumn",
      "sourceRepresentation",
      "runtimeRepresentation",
    ]);
    const code = dictionary.codes[index];
    same(entry.runtimeToken, code.token, "representation token");
    same(entry.sourceColumn, code.sourceColumn, "representation source");
    same(entry.runtimeRepresentation, "number", "runtime representation");
    if (
      !(
        config.weighting.type === "frequency"
          ? ["frequency"]
          : ["numeric-binary", "boolean-binary"]
      ).includes(entry.sourceRepresentation)
    )
      fail("Code representation");
  });
  const units = p.identityDictionary.units,
    groups = p.identityDictionary.groups;
  arraySize(p.unitGroups, units.length, "Unit Group mapping");
  p.unitGroups.forEach((entry, index) => {
    keys(entry, ["unitToken", "groupToken"]);
    same(entry.unitToken, units[index].token, "Unit Group token");
    if (
      entry.groupToken !== null &&
      !groups.some((group) => group.token === entry.groupToken)
    )
      fail("Group identity");
  });
  for (const [entries, columns] of [
    [units, config.units.columns],
    [p.identityDictionary.horizons, config.horizons.columns],
    [
      groups,
      config.units.group.type === "none" ? [] : [config.units.group.column],
    ],
  ] as const)
    for (const entry of entries)
      same(
        entry.fields.map((field) => field.column),
        columns,
        "dictionary identity columns",
      );
  if (
    config.units.group.type === "none"
      ? groups.length !== 0 ||
        p.unitGroups.some((entry) => entry.groupToken !== null)
      : p.unitGroups.some((entry) => entry.groupToken === null)
  )
    fail("Group contract");
  same(p.normalization, "sphere", "normalization");
  same(p.boundary, "within-horizon", "boundary");
  same(
    p.weighting,
    {
      scientific: config.weighting.type,
      runtime: config.weighting.type === "binary" ? "binary" : "sum",
    },
    "weighting",
  );
  const standard = result as BoundStandardResultV3;
  const window = config.window;
  same(
    p.ordering.requestedRowOrder,
    window.type === "MovingStanzaWindow" ? window.rowOrder : null,
    "configured row order",
  );
  if (!ona)
    same(
      standard.executionProvenance.ordering.requestedHorizonOrder,
      standard.configuration.analysis.model.type === "EndPoint"
        ? null
        : standard.configuration.analysis.model.horizonOrder,
      "configured Horizon order",
    );
  const adapterWindow =
    window.type === "Conversation"
      ? { type: "Conversation" }
      : {
          type: window.type,
          backward: window.backward,
          forward: window.forward,
        };
  same(
    p.adapterParameters,
    {
      networkType: ona ? "ordered" : "standard",
      unitTokenColumn: "__open_ena_unit_token",
      horizonTokenColumn: "__open_ena_horizon_token",
      codeTokens: runtimeCodes,
      model: result.set.modelType,
      window: adapterWindow,
      weightBy: p.weighting.runtime,
      displayDimensions: 3,
      ...(ona
        ? {
            groupTokenColumn: "__open_ena_group_token",
            rotation: "svd",
            centerAlignToOrigin: true,
            nodePositionMethod: "directed",
          }
        : {}),
    },
    "adapter parameters",
  );
  if (ona) {
    same(p.reference, null, "ONA Reference");
    same(
      (p as OnaResultExecutionProvenanceV3).directionalMask,
      (result as BoundOnaResultV3).configuration.directionalMask,
      "ONA mask",
    );
  } else if (p.reference !== null) {
    const reference = await bindReferenceToTargetV3(
      p.reference.artifact,
      standard.configuration,
    );
    same(p.reference, reference, "Reference portable binding");
    same(result.binding.referenceId, reference.referenceId, "Reference ID");
    same(
      result.binding.referenceContentSha256,
      reference.contentSha256,
      "Reference content hash",
    );
    same(
      result.set.rotation,
      {
        ...reference.rotationSet,
        codes,
        adjacencyKey: result.set.adjacencyKey,
        nodes: reference.rotationSet.nodes?.map((node, index) => ({
          ...node,
          code: codes[index],
        })),
      },
      "fixed Reference geometry",
    );
  }
  if (p.reference === null) {
    same(result.binding.referenceId, null, "absent Reference ID");
    same(result.binding.referenceContentSha256, null, "absent Reference hash");
  }
  assertOrdering(p, ona);
  assertResources(p, ona);
}

function assertTables(result: BoundResultV3): [string, string | null][] {
  const p = result.executionProvenance,
    s = result.set,
    ona = result.configuration.analysisFamily === "ona",
    endpoint = s.modelType === "EndPoint";
  keys(
    s,
    [
      "modelType",
      "codes",
      "units",
      "conversation",
      "codeColumns",
      "adjacencyKey",
      "rawRows",
      "rowConnectionCounts",
      "connectionCounts",
      "connectionMatrix",
      "metaData",
      "unitLabels",
      "functionParams",
      "lineWeights",
      "pointsForProjection",
      "points",
      "rotation",
      "variance",
      "centroids",
    ],
    ["networkType", ...(ona ? ["rowWindowProvenance"] : ["trajectories"])],
  );
  same(
    s.networkType ?? "standard",
    ona ? "ordered" : "standard",
    "model family",
  );
  same(
    s.modelType,
    ona
      ? "EndPoint"
      : (result as BoundStandardResultV3).configuration.analysis.model.type,
    "model type",
  );
  same(s.rawRows, [], "forbidden source rows");
  same(s.rowConnectionCounts, [], "forbidden row counts");
  if (ona) {
    same(s.rowWindowProvenance, [], "ONA row provenance");
    same(s.metaData, [], "ONA metadata");
  }
  const codes = p.labels.codes.map((code) => code.column),
    e = p.labels.edges.length,
    axes = s.rotation.rotationColumns,
    displayed = axes.slice(0, 3);
  if (
    e ** 3 > MAX_ESTIMATED_ROTATION_WORK_UNITS_V3 ||
    e ** 3 > p.header.resourceEstimate.estimatedRotationWorkUnits ||
    s.points.length * e * e > MAX_ESTIMATED_ROTATION_WORK_UNITS_V3
  )
    fail("scientific work admission limit");
  const edges = (ona ? orderedAdjacencyKey(codes) : adjacencyKey(codes)).map(
    (edge, i) => ({ ...edge, name: `Connection ${i + 1}` }),
  );
  same(s.codes, codes, "Code basis");
  same(
    s.codeColumns,
    edges.map((edge) => edge.name),
    "edge columns",
  );
  same(s.adjacencyKey, edges, "adjacency basis");
  same(s.units, ["Unit"], "Unit columns");
  same(s.conversation, ["Horizon"], "Horizon columns");
  keys(s.rotation, [
    "codes",
    "adjacencyKey",
    "rotationMatrix",
    "rotationColumns",
    "eigenvalues",
    "centerVector",
    "nodes",
  ]);
  same(s.rotation.codes, codes, "rotation Codes");
  same(s.rotation.adjacencyKey, edges, "rotation edges");
  arraySize(axes, e, "full axes");
  unique(axes, "full axes");
  axes.forEach(string);
  matrix(s.rotation.rotationMatrix, e, e, "rotation");
  arraySize(s.rotation.centerVector, e, "center");
  s.rotation.centerVector.forEach((v) => finite(v));
  for (let left = 0; left < e; left++)
    for (let right = left; right < e; right++) {
      let dot = 0;
      for (let row = 0; row < e; row++)
        dot +=
          s.rotation.rotationMatrix[row][left] *
          s.rotation.rotationMatrix[row][right];
      if (Math.abs(dot - (left === right ? 1 : 0)) > 1e-8)
        fail("orthonormal rotation basis");
    }
  keys(s.variance, axes);
  Object.values(s.variance).forEach((v) => {
    finite(v, true);
    if (v > 1 + 1e-9) fail("variance share");
  });
  arraySize(s.rotation.nodes, codes.length, "nodes");
  s.rotation.nodes.forEach((node, index) => {
    keys(node, ["code", ...displayed]);
    same(node.code, codes[index], "node Code identity");
    displayed.forEach((axis) => finite(node[axis]));
  });
  const unitMap = new Map(
      p.identityDictionary.units.map((entry) => [
        entry.token,
        entry.displayLabel,
      ]),
    ),
    horizonMap = new Map(
      p.identityDictionary.horizons.map((entry) => [
        entry.token,
        entry.displayLabel,
      ]),
    ),
    groupMap = new Map(
      p.identityDictionary.groups.map((entry) => [
        entry.token,
        entry.displayLabel,
      ]),
    );
  unique(p.populations.targetTokens, "target population");
  const pairs = p.populations.targetTokens.map(
    (token): [string, string | null] => {
      string(token);
      const pair: unknown = endpoint ? [token, null] : JSON.parse(token);
      if (
        !Array.isArray(pair) ||
        pair.length !== 2 ||
        !unitMap.has(pair[0]) ||
        (endpoint ? pair[1] !== null : !horizonMap.has(pair[1]))
      )
        fail("population Unit/Horizon identity");
      return pair as [string, string | null];
    },
  );
  if (endpoint)
    same(
      [...pairs.map(([unit]) => unit)].sort(),
      [...unitMap.keys()].sort(),
      "complete Unit population",
    );
  const n = pairs.length,
    groups = new Map(
      p.unitGroups.map((entry) => [entry.unitToken, entry.groupToken]),
    );
  const rowIdentities = (
    index: number,
    centroid = false,
    trajectory = false,
  ): Row => {
    const [unit, horizon] = pairs[index],
      group = groups.get(unit);
    return {
      ...(centroid
        ? { unit: unitMap.get(unit)! }
        : { Unit: unitMap.get(unit)!, ENA_UNIT: unitMap.get(unit)! }),
      ...(horizon !== null ? { Horizon: horizonMap.get(horizon)! } : {}),
      ...(group !== null && group !== undefined && !(ona && centroid)
        ? { Group: groupMap.get(group)! }
        : {}),
      ...(trajectory && horizon === null ? { Horizon: "" } : {}),
    };
  };
  const table = (
    rows: Row[] | undefined,
    scientific: string[],
    label: string,
    centroid = false,
    trajectory = false,
  ) => {
    arraySize(rows, n, label);
    rows.forEach((unknownRow, index) => {
      const row = unknownRow as Row,
        identity = rowIdentities(index, centroid, trajectory);
      keys(row, [...Object.keys(identity), ...scientific]);
      Object.entries(identity).forEach(([key, value]) =>
        same(row[key], value, `${label} ${key} identity`),
      );
      scientific.forEach((column) =>
        finite(row[column], label === "counts" || label === "line weights"),
      );
    });
  };
  table(s.connectionCounts, s.codeColumns, "counts");
  table(s.lineWeights, s.codeColumns, "line weights");
  table(s.pointsForProjection, s.codeColumns, "projection input");
  table(s.points, displayed, "points");
  table(s.centroids, displayed, "centroids", true);
  if (!ona) table(s.metaData, [], "metadata");
  if (endpoint) {
    if (Object.hasOwn(s, "trajectories")) fail("Endpoint trajectories");
  } else table(s.trajectories, [], "trajectories", false, true);
  same(
    s.unitLabels,
    pairs.map(([unit, horizon]) =>
      horizon === null
        ? unitMap.get(unit)
        : canonicalJsonV3([unitMap.get(unit), horizonMap.get(horizon)]),
    ),
    "analytical labels",
  );
  matrix(s.connectionMatrix, n, e, "connection matrix", true);
  same(
    s.connectionMatrix,
    s.connectionCounts.map((row) => s.codeColumns.map((column) => row[column])),
    "connection matrix/table duplicate",
  );
  const w = result.configuration.window,
    extent = (
      value: { kind: "infinity" } | { kind: "finite"; value: number },
    ) => (value.kind === "infinity" ? "Infinity" : value.value);
  same(
    s.functionParams,
    {
      model: s.modelType,
      weightBy: p.weighting.runtime,
      window: w.type,
      includeMeta: true,
      windowSizeBack:
        w.type === "Conversation" ? "Infinity" : extent(w.backward),
      windowSizeForward:
        w.type === "Conversation" || ona
          ? 0
          : extent(
              (result as BoundStandardResultV3).configuration.window.type ===
                "MovingStanzaWindow"
                ? (
                    (result as BoundStandardResultV3).configuration
                      .window as Extract<
                      BoundStandardResultV3["configuration"]["window"],
                      { type: "MovingStanzaWindow" }
                    >
                  ).forward
                : { kind: "finite", value: 0 },
            ),
      ...(ona ? { networkType: "ordered" } : {}),
    },
    "function parameters",
  );
  return pairs;
}

function assertProjection(
  result: BoundResultV3,
  pairs: [string, string | null][],
): void {
  const p = result.executionProvenance,
    projection = p.projection,
    axes = result.set.rotation.rotationColumns,
    ona = result.configuration.analysisFamily === "ona",
    ref = p.reference !== null;
  const standard = result as BoundStandardResultV3;
  keys(projection, [
    "type",
    "centerAlignToOrigin",
    "rank",
    "fullAxes",
    "estimableAxes",
    ...(ona
      ? ["geometryPath", "variancePath"]
      : [
          "runtimeFirstAxis",
          "centerVector",
          "variance",
          ...(ref ? ["targetProjectionRank"] : []),
        ]),
  ]);
  same(
    projection.type,
    ona ? "svd" : standard.configuration.analysis.rotation.type,
    "projection family",
  );
  same(projection.fullAxes, axes, "projection axes");
  unique(projection.estimableAxes, "estimable axes");
  if (projection.estimableAxes.some((axis) => !axes.includes(axis)))
    fail("estimable axis membership");
  integer(projection.rank);
  if (projection.rank > Math.min(axes.length, Math.max(0, pairs.length - 1)))
    fail("projection rank bound");
  const model = result.set.modelType,
    pop = p.populations;
  keys(pop, [
    "fit",
    "fitTokens",
    "targetTokens",
    "imputedStepCount",
    ...(!ona
      ? ["trajectoryStepCountByUnit", ...(ref ? ["sourceFit"] : [])]
      : []),
  ]);
  same(pop.imputedStepCount, 0, "imputed steps");
  same(pop.fitTokens, ref ? [] : pop.targetTokens, "fit tokens");
  same(
    pop.fit,
    ref
      ? "reference-source-endpoint-units"
      : model === "EndPoint"
        ? "endpoint-units"
        : "observed-unit-horizon-steps",
    "fit family",
  );
  if (ona) {
    same(projection.centerAlignToOrigin, true, "ONA centering");
    same(
      (p as OnaResultExecutionProvenanceV3).projection.geometryPath,
      "set.rotation",
      "ONA geometry path",
    );
    same(
      (p as OnaResultExecutionProvenanceV3).projection.variancePath,
      "set.variance",
      "ONA variance path",
    );
  } else {
    const sp = standard.executionProvenance,
      proj = sp.projection;
    const requested = standard.configuration.analysis.rotation;
    same(
      proj.centerAlignToOrigin,
      requested.type === "reference"
        ? sp.reference!.artifact.fit.centerAlignToOrigin
        : requested.centerAlignToOrigin,
      "centering policy",
    );
    same(proj.runtimeFirstAxis, axes[0], "first axis");
    same(
      proj.centerVector,
      result.set.rotation.centerVector,
      "center duplicate",
    );
    same(
      proj.variance,
      axes.map((axis) => result.set.variance[axis]),
      "variance duplicate",
    );
    same(
      sp.populations.trajectoryStepCountByUnit,
      model === "EndPoint"
        ? {}
        : Object.fromEntries(
            [...new Set(pairs.map(([unit]) => unit))].map((unit) => [
              unit,
              pairs.filter(([u]) => u === unit).length,
            ]),
          ),
      "trajectory counts",
    );
    if (ref) {
      same(
        sp.populations.sourceFit,
        sp.reference!.artifact.fit,
        "Reference source fit",
      );
      same(proj.targetProjectionRank, proj.rank, "Reference target rank");
      same(
        proj.rank,
        fixedProjectionRankV3(result.set),
        "actual fixed Reference projection rank",
      );
      same(
        proj.estimableAxes,
        sp.reference!.artifact.fit.estimableAxes,
        "Reference estimable axes",
      );
    }
    if (requested.type === "means") {
      const groupColumn =
        standard.configuration.units.group.type === "stable-metadata"
          ? standard.configuration.units.group.column
          : "";
      const members = (level: typeof requested.contrast.negativeLevel) => {
        const token = sp.identityDictionary.groups.find(
          (entry) =>
            canonicalJsonV3(entry.fields[0].value) === canonicalJsonV3(level),
        )?.token;
        const unitTokens = sp.unitGroups
          .filter((entry) => entry.groupToken === token)
          .map((entry) => entry.unitToken);
        if (!token || !unitTokens.length) fail("Means group membership");
        return { level, unitTokens };
      };
      same(
        sp.meansBinding,
        {
          groupColumn,
          negative: members(requested.contrast.negativeLevel),
          positive: members(requested.contrast.positiveLevel),
          direction: "positive-minus-negative",
        },
        "Means membership",
      );
    } else same(sp.meansBinding, null, "non-Means membership");
  }
  if (!ref) {
    const eigenvalues = result.set.rotation.eigenvalues;
    if (projection.type === "svd") {
      same(
        axes,
        axes.map((_axis, index) => `SVD${index + 1}`),
        "SVD axes",
      );
      arraySize(eigenvalues, axes.length, "eigenvalues");
      eigenvalues.forEach((v, i) => {
        finite(v, true);
        if (i && v > eigenvalues[i - 1]) fail("eigenvalue order");
      });
      const threshold = Math.max(
        Number.MIN_VALUE,
        eigenvalues[0] * 1e-12,
        (8 * Number.EPSILON * axes.length) ** 2,
      );
      same(
        projection.rank,
        eigenvalues.filter((v) => v > threshold).length,
        "SVD rank",
      );
      same(
        projection.estimableAxes,
        axes.slice(0, projection.rank),
        "SVD estimable prefix",
      );
    } else {
      same(eigenvalues, [], "Means eigenvalues");
      same(
        axes,
        axes.map((_axis, index) => (index === 0 ? "MR1" : `SVD${index + 1}`)),
        "Means axes",
      );
      const variance = axes.map((axis) => result.set.variance[axis]),
        floor = Math.max(...variance) * 1e-12;
      if (variance[0] <= 0) fail("Means first-axis variance");
      same(
        projection.estimableAxes,
        axes.filter((_axis, index) => index === 0 || variance[index] > floor),
        "Means estimable axes",
      );
    }
    same(
      projection.rank,
      centeredNetworkRankV3(
        result.set.connectionMatrix,
        projection.centerAlignToOrigin,
      ),
      "internal centered-network rank",
    );
  }
}

function assertDiagnostics(result: BoundResultV3): void {
  const p = result.executionProvenance,
    ona = result.configuration.analysisFamily === "ona";
  if (!Array.isArray(p.diagnostics)) fail("diagnostic list");
  for (const d of p.diagnostics) {
    keys(
      d,
      ["id", "severity", "scope", "summary", "detail", "blocks"],
      ["fieldPath", "evidence", ...(!ona ? ["suggestedActions"] : [])],
    );
    [d.id, d.scope, d.summary, d.detail].forEach(string);
    if (
      !(
        ona ? ["error", "warning"] : ["error", "warning", "information"]
      ).includes(d.severity)
    )
      fail("diagnostic severity");
    if (
      !(
        ona
          ? (ONA_COMPILER_DIAGNOSTIC_IDS_V3 as readonly string[])
          : (MODEL_DIAGNOSTIC_IDS_V3 as readonly string[])
      ).includes(d.id)
    )
      fail("diagnostic family/id");
    if (d.fieldPath !== undefined) string(d.fieldPath);
    const actions = "suggestedActions" in d ? d.suggestedActions : undefined;
    if (actions)
      for (const action of actions) {
        keys(action, [
          "id",
          "label",
          "confirmationText",
          "confirmationRequired",
          "patch",
        ]);
        string(action.id);
        string(action.label);
        string(action.confirmationText);
        same(action.confirmationRequired, true, "action confirmation");
        const patch = action.patch;
        if (patch.type === "exclude-code") {
          keys(patch, ["type", "code"]);
          string(patch.code);
        } else if (patch.type === "clear-group") keys(patch, ["type"]);
        else if (patch.type === "select-model") {
          keys(patch, ["type", "value"]);
          if (
            ![
              "EndPoint",
              "SeparateTrajectory",
              "AccumulatedTrajectory",
            ].includes(patch.value)
          )
            fail("suggested model");
        } else if (patch.type === "select-rotation") {
          keys(patch, ["type", "value"]);
          if (!["svd", "reference"].includes(patch.value))
            fail("suggested rotation");
        } else fail("unsupported suggested action patch");
      }
    unique(d.blocks, "diagnostic blocks");
    if (d.blocks.some((block: string) => !CAPABILITIES.includes(block)))
      fail("diagnostic capability");
    if (d.evidence) {
      keys(d.evidence, ["totalCount", "sampleLimit", "samples", "truncated"]);
      integer(d.evidence.totalCount);
      same(d.evidence.sampleLimit, 5, "sample limit");
      if (
        d.evidence.samples.length > 5 ||
        typeof d.evidence.truncated !== "boolean"
      )
        fail("evidence bound");
      d.evidence.samples.forEach(
        (sample: { detail: string; rowIndex?: number }) => {
          keys(sample, ["detail"], ["rowIndex", ...(!ona ? ["identity"] : [])]);
          string(sample.detail);
          if (sample.rowIndex !== undefined) {
            integer(sample.rowIndex);
            if (sample.rowIndex >= result.binding.rowCount)
              fail("evidence row index");
          }
        },
      );
    }
  }
  const blocked = new Set(p.diagnostics.flatMap((d) => [...d.blocks]));
  if (ona)
    for (const capability of CAPABILITIES.filter(
      (c) => !["build-model", "export-current-model"].includes(c),
    ))
      blocked.add(capability as never);
  else {
    if (result.configuration.units.group.type === "none")
      blocked.add("group-inference");
    if (result.set.modelType === "EndPoint") {
      blocked.add("trajectory-inference");
      blocked.add("longitudinal-comparison");
    } else blocked.add("export-reference");
    if (p.reference) blocked.add("export-reference");
  }
  same(
    result.capabilityStatus,
    Object.fromEntries(
      CAPABILITIES.map((c) => [
        c,
        blocked.has(c as never) ? "blocked" : "available",
      ]),
    ),
    "capability status",
  );
}

function assertOnaEvidence(result: BoundOnaResultV3): void {
  const audit = result.orderedAudit,
    summary = result.orderedResponseNodeSummary,
    p = result.executionProvenance,
    n = result.binding.rowCount,
    c = result.set.codes.length,
    e = c * c;
  keys(audit, [
    "schemaVersion",
    "codeOrder",
    "edgeOrder",
    "responseRowIndices",
    "previousResponseRowIndices",
    "priorRowCounts",
    "horizonOrdinals",
    "edgeValues",
  ]);
  same(audit.schemaVersion, 1, "audit schema");
  same(audit.codeOrder, result.set.codes, "audit Code basis");
  same(audit.edgeOrder, "response-major-ground-minor", "directed audit order");
  same(
    audit.responseRowIndices,
    Array.from({ length: n }, (_value, index) => index),
    "audit response order",
  );
  for (const field of [
    audit.previousResponseRowIndices,
    audit.priorRowCounts,
    audit.horizonOrdinals,
  ])
    arraySize(field, n, "audit ordinals");
  matrix(audit.edgeValues, n, e, "audit contributions", true);
  const order = p.ordering.resolvedRowOrder;
  if (order.type !== "within-horizon-order") fail("ONA row order");
  const mapping = new Map(
    order.mappings.map((entry) => [entry.sourceRowIndex, entry]),
  );
  const previous = new Map<string, number>(),
    horizonOrder = new Map<string, number>();
  audit.responseRowIndices.forEach((index, position) => {
    const row = mapping.get(p.ordering.runtimeSourceRowIndices[index])!;
    if (!horizonOrder.has(row.horizonToken))
      horizonOrder.set(row.horizonToken, horizonOrder.size);
    same(
      audit.previousResponseRowIndices[position],
      previous.get(row.horizonToken) ?? null,
      "audit previous response",
    );
    same(
      audit.horizonOrdinals[position],
      horizonOrder.get(row.horizonToken),
      "audit Horizon ordinal",
    );
    const back = result.configuration.window.backward;
    same(
      audit.priorRowCounts[position],
      Math.min(
        row.withinHorizonOrdinal,
        back.kind === "infinity" ? Infinity : back.value - 1,
      ),
      "audit prior rows",
    );
    previous.set(row.horizonToken, index);
    for (let edge = 0; edge < e; edge++) {
      const basis = p.codeDictionary.edges[edge];
      if (
        !p.directionalMask.enabled[basis.groundIndex][basis.responseIndex] &&
        (audit.edgeValues[position][edge] !== 0 ||
          result.set.connectionMatrix.some((row) => row[edge] !== 0))
      )
        fail("masked audit contribution");
    }
  });
  keys(summary, [
    "schemaVersion",
    "codeOrder",
    "overallResponseCodeTotals",
    "groups",
  ]);
  same(summary.schemaVersion, 1, "response summary schema");
  same(summary.codeOrder, result.set.codes, "response Code basis");
  arraySize(summary.overallResponseCodeTotals, c, "response totals");
  summary.overallResponseCodeTotals.forEach((v) => finite(v, true));
  unique(
    summary.groups.map((group) => group.name),
    "response groups",
  );
  summary.groups.forEach((group) => {
    keys(group, ["name", "unitCount", "responseCodeTotals"]);
    string(group.name);
    integer(group.unitCount);
    arraySize(group.responseCodeTotals, c, "group response totals");
    group.responseCodeTotals.forEach((v) => finite(v, true));
  });
  const expectedGroups =
    result.configuration.units.group.type === "none"
      ? [{ name: "All units", unitCount: p.identityDictionary.units.length }]
      : p.identityDictionary.groups.map((group) => ({
          name: group.displayLabel,
          unitCount: p.unitGroups.filter(
            (entry) => entry.groupToken === group.token,
          ).length,
        }));
  const actualGroups = summary.groups.map(({ name, unitCount }) => ({
    name,
    unitCount,
  }));
  same(
    actualGroups.sort((a, b) => a.name.localeCompare(b.name)),
    expectedGroups.sort((a, b) => a.name.localeCompare(b.name)),
    "response summary Group membership",
  );
  if (summary.groups.length)
    for (let code = 0; code < c; code++) {
      const scale = Math.max(
        summary.overallResponseCodeTotals[code],
        ...summary.groups.map((group) => group.responseCodeTotals[code]),
      );
      if (scale)
        near(
          summary.groups.reduce(
            (sum, group) => sum + group.responseCodeTotals[code] / scale,
            0,
          ),
          summary.overallResponseCodeTotals[code] / scale,
          "group/overall response totals",
        );
    }
  // The compact audit omits row-to-Unit source mapping. Overall conservation is
  // portable; per-Unit/source-window truth still requires the independent plan.
  for (let edge = 0; edge < e; edge++) {
    let scale = 0;
    for (const row of result.set.connectionMatrix)
      scale = Math.max(scale, row[edge]);
    for (const row of audit.edgeValues) scale = Math.max(scale, row[edge]);
    if (scale)
      near(
        audit.edgeValues.reduce((sum, row) => sum + row[edge] / scale, 0),
        result.set.connectionMatrix.reduce(
          (sum, row) => sum + row[edge] / scale,
          0,
        ),
        "audit count conservation",
      );
  }
}

function assertPresentation(
  p: PresentationArtifactV3,
  result: BoundResultV3,
): void {
  keys(
    p,
    [
      "boundResultSha256",
      "hiddenCodes",
      "hiddenGroups",
      "codeColors",
      "nodeOverrides",
      "dimensions",
    ],
    ["camera3d"],
  );
  same(
    p.boundResultSha256,
    result.binding.scientificResultSha256,
    "presentation exact result binding",
  );
  const codes = result.set.codes,
    axes = result.set.rotation.rotationColumns;
  for (const [values, allowed] of [
    [p.hiddenCodes, codes],
    [p.dimensions, axes],
  ] as const) {
    unique(values, "presentation references");
    if (values.some((v) => !allowed.includes(v)))
      fail("presentation Code/axis reference");
  }
  if (!p.dimensions.length) fail("presentation dimensions");
  unique(p.hiddenGroups, "presentation Groups");
  p.hiddenGroups.forEach((group) => {
    keys(group, ["type", "value"]);
    same(
      group,
      scalarIdentityV3(group.value, "presentation Group"),
      "presentation Group identity",
    );
    if (
      !result.executionProvenance.identityDictionary.groups.some(
        (entry) =>
          canonicalJsonV3(entry.fields[0].value) === canonicalJsonV3(group),
      )
    )
      fail("presentation Group reference");
  });
  keys(p.codeColors, [], codes);
  Object.values(p.codeColors).forEach(string);
  unique(
    p.nodeOverrides.map((node) => node.code),
    "presentation node overrides",
  );
  p.nodeOverrides.forEach((node) => {
    keys(node, ["code", "coordinates"]);
    if (!codes.includes(node.code)) fail("presentation node Code");
    keys(node.coordinates, [], axes);
    if (!Object.keys(node.coordinates).length) fail("presentation coordinates");
    Object.values(node.coordinates).forEach((v) => finite(v));
  });
  if (Object.hasOwn(p, "camera3d")) {
    if (!p.camera3d) fail("presentation camera object");
    keys(p.camera3d, ["center", "eye", "up", "projection"]);
    for (const vector of [p.camera3d.center, p.camera3d.eye, p.camera3d.up]) {
      keys(vector, ["x", "y", "z"]);
      Object.values(vector).forEach((v) => finite(v));
    }
    keys(p.camera3d.projection, ["type"]);
    if (!["perspective", "orthographic"].includes(p.camera3d.projection.type))
      fail("presentation camera projection");
  }
}

/** Portable schema and internal scientific consistency only. Source authenticity,
 * current plan, source ordering truth and new-fit authority require other APIs.
 */
export async function assertPortableBundleContractV3(
  bundle: OpenEnaAnalysisBundleV3,
): Promise<void> {
  try {
    const ona = bundle.configuration.analysisFamily === "ona";
    const components = [
      ...COMPONENTS,
      ...(ona ? ["orderedAudit", "orderedResponseNodeSummary"] : []),
    ];
    keys(
      bundle,
      ["schemaVersion", "kind", "integrity", ...components],
      ["presentation"],
    );
    if (
      bundle.schemaVersion !== 3 ||
      bundle.kind !== "open-ena-analysis-bundle"
    )
      fail("bundle family envelope");
    same(
      bundle.configuration,
      ona
        ? decodeCanonicalOnaConfigV3(bundle.configuration)
        : decodeCanonicalStandardConfigV3(bundle.configuration),
      "canonical configuration",
    );
    keys(bundle.integrity, ["componentHashes", "bundleContentSha256"]);
    keys(bundle.integrity.componentHashes, components, ["presentation"]);
    if (
      Object.hasOwn(bundle, "presentation") !==
      Object.hasOwn(bundle.integrity.componentHashes, "presentation")
    )
      fail("presentation hash presence");
    Object.values(bundle.integrity.componentHashes).forEach(hash);
    hash(bundle.integrity.bundleContentSha256);
    keys(bundle.tables, [
      "connectionCounts",
      "lineWeights",
      "pointsForProjection",
      "points",
      "trajectories",
    ]);
    const result = boundResultFromBundleV3(bundle);
    assertHeader(result);
    same(
      await sha256CanonicalJsonV3(result.configuration),
      result.binding.configurationSha256,
      "configuration hash",
    );
    same(
      await sha256CanonicalJsonV3(scientificResultHashPayloadV3(result)),
      result.binding.scientificResultSha256,
      "complete scientific result hash",
    );
    await assertProvenance(result);
    const pairs = assertTables(result);
    assertProjection(result, pairs);
    assertDiagnostics(result);
    same(
      bundle.tables.trajectories,
      result.set.trajectories ?? [],
      "trajectory table duplicate",
    );
    if (ona) {
      assertOnaEvidence(result as BoundOnaResultV3);
      assertOnaInternalDerivationsV3(result.set);
    } else {
      const p = (result as BoundStandardResultV3).executionProvenance;
      assertStandardInternalDerivationsV3(
        result.set,
        p.projection,
        p.meansBinding,
        pairs.map(([unit]) => unit),
        p.reference?.rotationSet ?? null,
      );
    }
    same(
      bundle.statistics,
      unavailableBundleStatisticsV3(),
      "bound statistics availability",
    );
    same(
      bundle.diagnostics,
      { warnings: result.executionProvenance.diagnostics, execution: [] },
      "bound diagnostics",
    );
    same(
      bundle.methodsReportMarkdown,
      minimalBundleMethodsV3(result),
      "bound methods report",
    );
    if (Object.hasOwn(bundle, "presentation"))
      assertPresentation(bundle.presentation!, result);
  } catch (error) {
    throw new TypeError(
      `Bundle contract validation failed: ${error instanceof Error ? error.message : "invalid schema"}`,
      { cause: error },
    );
  }
}
