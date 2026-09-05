import {
  EnaNumericalError,
  accumulateDataChunked,
  orderedAdjacencyKey,
} from "jena-js";
import type {
  AdjacencyKeyEntry,
  ENAData,
  EnaNumericalErrorCode,
  Row,
} from "jena-js";
import {
  canonicalJsonV3,
  deepFreezeV3,
  snapshotDenseJsonArrayV3,
  snapshotPlainJsonRecordV3,
} from "./canonical-json";
import { centeredNetworkRankV3 } from "./diagnostics";
import type { ModelCapabilityV3 } from "./diagnostics";
import { scalarIdentityV3 } from "./identity";
import { resolveRowOrderV3 } from "./ordering";
import type { ResolvedRowOrderingV3 } from "./ordering";
import {
  OPEN_ENA_RUNTIME_POLICY_VERSION_V3,
  OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3,
} from "./types";
import type {
  CanonicalOnaConfigV3,
  DatasetBindingV3,
  OrderedNetworkDraftV3,
} from "./types";
import { datasetHashKindFor } from "../types";
import type { ParsedDataset } from "../types";

const LOWERCASE_SHA256 = /^[a-f0-9]{64}$/u;
const ONA_UNIT_COLUMN_TOKEN_V3 = "__OPEN_ENA_V3_UNIT__";
const ONA_HORIZON_COLUMN_TOKEN_V3 = "__OPEN_ENA_V3_HORIZON__";
const ONA_GROUP_COLUMN_TOKEN_V3 = "__OPEN_ENA_V3_GROUP__";
const ONA_ORDERED_NUMERICAL_CODES_V3 = new Set<EnaNumericalErrorCode>([
  "ORDERED_CONNECTION_NONFINITE",
  "ORDERED_PRODUCT_UNDERFLOW",
  "ORDERED_MASK_UNDERFLOW",
  "ORDERED_UNIT_AGGREGATION_NONFINITE",
]);

export const ONA_COMPILER_DIAGNOSTIC_IDS_V3 = Object.freeze([
  "ONA_DATASET_BINDING_INVALID",
  "ONA_DATASET_EMPTY",
  "ONA_DATASET_FIELD_INVALID",
  "ONA_ORDER_INVALID",
  "ONA_GROUP_UNSTABLE",
  "ONA_CODE_ALL_ZERO",
  "ONA_NO_ENABLED_CONNECTION",
  "ONA_NUMERICAL_INVALID",
  "ONA_TARGET_RANK_ZERO",
  "ONA_ZERO_NETWORK_UNITS",
  "ONA_SVD_ONE_DIMENSIONAL",
  "ONA_DRAFT_INVALID",
  "ONA_RESOURCE_BUDGET_EXCEEDED",
] as const);

export type OnaCompilerDiagnosticIdV3 = typeof ONA_COMPILER_DIAGNOSTIC_IDS_V3[number];

export interface OnaCompilerDiagnosticV3 {
  readonly id: OnaCompilerDiagnosticIdV3;
  readonly severity: "error" | "warning";
  readonly scope: "dataset" | "units" | "windows" | "codes" | "rotation" | "model" | "resources";
  readonly fieldPath?: string;
  readonly summary: string;
  readonly detail: string;
  readonly blocks: readonly ModelCapabilityV3[];
  readonly evidence?: {
    readonly totalCount: number;
    readonly sampleLimit: 5;
    readonly samples: readonly { readonly rowIndex?: number; readonly detail: string }[];
    readonly truncated: boolean;
  };
}

/** @internal Stable ONA compiler diagnostic construction. */
export function onaDiagnosticV3(
  id: OnaCompilerDiagnosticIdV3,
  scope: OnaCompilerDiagnosticV3["scope"],
  summary: string,
  detail: string,
  options: Pick<OnaCompilerDiagnosticV3, "fieldPath" | "evidence">
    & Partial<Pick<OnaCompilerDiagnosticV3, "severity" | "blocks">> = {},
): OnaCompilerDiagnosticV3 {
  const { severity = "error", blocks, ...metadata } = options;
  return deepFreezeV3({
    id,
    severity,
    scope,
    summary,
    detail,
    blocks: blocks ?? ["build-model", "export-current-model", "export-reference"],
    ...metadata,
  });
}

/** @internal Classifies only typed ordered-runtime numerical failures. */
export function onaNumericalDiagnosticV3(error: unknown): OnaCompilerDiagnosticV3 {
  if (!(error instanceof EnaNumericalError) || !ONA_ORDERED_NUMERICAL_CODES_V3.has(error.code)) {
    throw error;
  }
  return onaDiagnosticV3(
    "ONA_NUMERICAL_INVALID",
    "windows",
    "ONA ordered accumulation is not finite and representable.",
    "The authoritative ordered accumulator rejected a product, mask application, running sum, or Unit aggregate before SVD.",
    { fieldPath: "window" },
  );
}

/** @internal Exact fixed-family ONA draft boundary. */
export function assertExactOnaDraftV3(value: unknown): OrderedNetworkDraftV3 {
  const record = snapshotPlainJsonRecordV3(value, "ONA draft");
  const expected = [
    "unitColumns",
    "horizonColumns",
    "groupColumn",
    "codes",
    "backward",
    "rowOrder",
    "directionalMask",
  ].sort();
  const actual = Object.keys(record).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError("ONA draft has an invalid shape or contains Standard-only fields.");
  }
  return record as unknown as OrderedNetworkDraftV3;
}

/** @internal Fixed ONA canonical candidate; strict decoder runs at the caller. */
export function onaCanonicalFromDraftV3(draft: OrderedNetworkDraftV3): unknown {
  return {
    schemaVersion: 3,
    analysisFamily: "ona",
    contracts: {
      validationContractVersion: OPEN_ENA_VALIDATION_CONTRACT_VERSION_V3,
      runtimePolicyVersion: OPEN_ENA_RUNTIME_POLICY_VERSION_V3,
    },
    units: {
      columns: draft.unitColumns,
      group: draft.groupColumn === null
        ? { type: "none" }
        : { type: "stable-metadata", column: draft.groupColumn },
    },
    horizons: { columns: draft.horizonColumns },
    codes: draft.codes.map((column) => ({ column, displayLabel: column })),
    model: { type: "EndPoint" },
    weighting: { type: "frequency", engineMethod: "sum" },
    window: {
      type: "MovingStanzaWindow",
      backward: draft.backward,
      forward: 0,
      rowOrder: draft.rowOrder,
    },
    rotation: { type: "svd", centerAlignToOrigin: true },
    directionalMask: draft.directionalMask,
  };
}

function typedIdentityKeyV3(
  row: Record<string, unknown>,
  columns: readonly string[],
  label: string,
): string {
  return canonicalJsonV3(columns.map((column) => {
    if (!Object.hasOwn(row, column)) throw new TypeError(`${label} is missing ${JSON.stringify(column)}.`);
    const descriptor = Object.getOwnPropertyDescriptor(row, column);
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new TypeError(`${label}.${column} must be an own data property.`);
    }
    return { column, value: scalarIdentityV3(descriptor.value, `${label}.${column}`) };
  }));
}

export interface PreparedOnaDatasetV3 {
  readonly diagnostics: readonly OnaCompilerDiagnosticV3[];
  readonly ordering: ResolvedRowOrderingV3 | null;
}

/** @internal Staged structural/value/order validation on one frozen snapshot. */
export function validateOnaDatasetV3(
  dataset: ParsedDataset,
  binding: DatasetBindingV3,
  config: CanonicalOnaConfigV3,
): PreparedOnaDatasetV3 {
  if (!LOWERCASE_SHA256.test(binding.normalizedTableSha256)
    || !LOWERCASE_SHA256.test(binding.headerSha256)
    || binding.rowCount !== dataset.rows.length
    || binding.hashKind !== datasetHashKindFor(dataset)) {
    return {
      diagnostics: [onaDiagnosticV3(
        "ONA_DATASET_BINDING_INVALID",
        "dataset",
        "The ONA dataset binding is invalid.",
        "The hash kind, normalized-table SHA-256, row count, and canonical header SHA-256 must match the current dataset.",
      )],
      ordering: null,
    };
  }
  if (dataset.rows.length === 0) {
    return {
      diagnostics: [onaDiagnosticV3(
        "ONA_DATASET_EMPTY",
        "dataset",
        "ONA requires at least one source row.",
        "An empty dataset has no analytical Unit observation and cannot fit mandatory ONA SVD.",
        { fieldPath: "dataset.rows", evidence: { totalCount: 0, sampleLimit: 5, samples: [], truncated: false } },
      )],
      ordering: null,
    };
  }
  const headers = snapshotDenseJsonArrayV3(dataset.headers, "dataset.headers");
  const headerSet = new Set(headers);
  const orderColumns = config.window.rowOrder.kind === "columns"
    ? config.window.rowOrder.keys.map((key) => key.column)
    : [];
  const selected = [
    ...config.units.columns,
    ...config.horizons.columns,
    ...(config.units.group.type === "stable-metadata" ? [config.units.group.column] : []),
    ...config.codes.map((code) => code.column),
    ...orderColumns,
  ];
  if (selected.some((column) => !headerSet.has(column))) {
    return {
      diagnostics: [onaDiagnosticV3(
        "ONA_DATASET_FIELD_INVALID",
        "dataset",
        "An ONA scientific field is missing from the dataset.",
        "Every Unit, Horizon, Group, Code, and order field must be an exact current header.",
        { fieldPath: "dataset.headers" },
      )],
      ordering: null,
    };
  }
  const scientificRoles = [
    ...config.units.columns,
    ...config.horizons.columns,
    ...(config.units.group.type === "stable-metadata" ? [config.units.group.column] : []),
    ...orderColumns,
  ];
  if (config.codes.some((code) => scientificRoles.includes(code.column))) {
    return {
      diagnostics: [onaDiagnosticV3(
        "ONA_DATASET_FIELD_INVALID",
        "dataset",
        "An ONA Code has another active scientific role.",
        "Code fields must remain disjoint from Unit, Horizon, Group, and row-order fields.",
        { fieldPath: "codes" },
      )],
      ordering: null,
    };
  }
  const groupByUnit = new Map<string, string>();
  const codeActive = config.codes.map(() => false);
  for (let rowIndex = 0; rowIndex < dataset.rows.length; rowIndex += 1) {
    const row = snapshotPlainJsonRecordV3(dataset.rows[rowIndex], `dataset.rows[${rowIndex}]`);
    try {
      const unitKey = typedIdentityKeyV3(row, config.units.columns, `dataset.rows[${rowIndex}] Unit`);
      typedIdentityKeyV3(row, config.horizons.columns, `dataset.rows[${rowIndex}] Horizon`);
      if (config.units.group.type === "stable-metadata") {
        const groupKey = canonicalJsonV3(scalarIdentityV3(
          row[config.units.group.column],
          `dataset.rows[${rowIndex}] Group`,
        ));
        const prior = groupByUnit.get(unitKey);
        if (prior !== undefined && prior !== groupKey) {
          return {
            diagnostics: [onaDiagnosticV3(
              "ONA_GROUP_UNSTABLE",
              "units",
              "ONA Group metadata is unstable within a typed Unit.",
              "The compiler does not add Group to Unit identity or repair the mapping silently.",
              {
                fieldPath: "groupColumn",
                evidence: {
                  totalCount: 1,
                  sampleLimit: 5,
                  samples: [{ rowIndex, detail: "Typed Unit maps to more than one typed Group value." }],
                  truncated: false,
                },
              },
            )],
            ordering: null,
          };
        }
        groupByUnit.set(unitKey, groupKey);
      }
      for (let codeIndex = 0; codeIndex < config.codes.length; codeIndex += 1) {
        const value = row[config.codes[codeIndex].column];
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
          throw new TypeError("ONA Code values must be finite nonnegative numbers.");
        }
        if (value > 0) codeActive[codeIndex] = true;
      }
    } catch {
      return {
        diagnostics: [onaDiagnosticV3(
          "ONA_DATASET_FIELD_INVALID",
          "dataset",
          "ONA source values do not satisfy the strict field domains.",
          "Unit, Horizon, and Group identities must be typed scalars; Code values must be finite nonnegative numbers.",
          {
            fieldPath: "dataset.rows",
            evidence: {
              totalCount: 1,
              sampleLimit: 5,
              samples: [{ rowIndex, detail: "Source row fails a required ONA field domain." }],
              truncated: false,
            },
          },
        )],
        ordering: null,
      };
    }
  }
  const allZeroCodes = config.codes.filter((_code, index) => !codeActive[index]);
  if (allZeroCodes.length > 0) {
    return {
      diagnostics: [onaDiagnosticV3(
        "ONA_CODE_ALL_ZERO",
        "codes",
        "At least one selected ONA Code has no positive value.",
        "Every selected directed-network Code must contribute at least one positive finite count.",
        {
          fieldPath: "codes",
          evidence: {
            totalCount: allZeroCodes.length,
            sampleLimit: 5,
            samples: allZeroCodes.slice(0, 5).map((code) => ({ detail: `Code ${JSON.stringify(code.column)} is all zero.` })),
            truncated: allZeroCodes.length > 5,
          },
        },
      )],
      ordering: null,
    };
  }
  try {
    return {
      diagnostics: [],
      ordering: resolveRowOrderV3(
        dataset.rows as Array<Record<string, unknown>>,
        config.horizons.columns,
        config.window.rowOrder,
        {
          analysisFamily: "ona",
          confirmationAnalysisFamily: "ona",
          datasetBinding: binding,
        },
      ),
    };
  } catch {
    return {
      diagnostics: [onaDiagnosticV3(
        "ONA_ORDER_INVALID",
        "windows",
        "ONA row order cannot be resolved exactly.",
        "Order fields, comparators, ties, and dataset-bound confirmation must satisfy the fixed ONA ordering contract.",
        { fieldPath: "rowOrder" },
      )],
      ordering: null,
    };
  }
}

export interface OnaScientificPreflightV3 {
  readonly diagnostics: readonly OnaCompilerDiagnosticV3[];
  /** Exact authoritative model-only target, retained for parity tests and Plan 2 reuse. */
  readonly model: Readonly<Pick<ENAData, "connectionCounts" | "connectionMatrix" | "adjacencyKey">> | null;
}

interface OnaPlanLocalMaterializationV3 {
  readonly rows: Row[];
  readonly codeTokens: string[];
  readonly metadataTokens: string[];
}

function planLocalTokenMapV3(keys: readonly string[], prefix: string): ReadonlyMap<string, string> {
  return new Map([...new Set(keys)].sort().map((key, index) => [
    key,
    `${prefix}${index.toString(36).padStart(8, "0")}`,
  ]));
}

function materializeOnaPlanLocalRowsV3(
  dataset: ParsedDataset,
  config: CanonicalOnaConfigV3,
  ordering: ResolvedRowOrderingV3,
): OnaPlanLocalMaterializationV3 {
  const sourceRows = dataset.rows as Array<Record<string, unknown>>;
  const unitIdentities = sourceRows.map((row, index) => typedIdentityKeyV3(
    row,
    config.units.columns,
    `dataset.rows[${index}] Unit`,
  ));
  const horizonIdentities = sourceRows.map((row, index) => typedIdentityKeyV3(
    row,
    config.horizons.columns,
    `dataset.rows[${index}] Horizon`,
  ));
  const groupColumn = config.units.group.type === "stable-metadata"
    ? config.units.group.column
    : null;
  const groupIdentities = groupColumn !== null
    ? sourceRows.map((row, index) => canonicalJsonV3(scalarIdentityV3(
        row[groupColumn],
        `dataset.rows[${index}] Group`,
      )))
    : [];
  const unitTokens = planLocalTokenMapV3(unitIdentities, "__OPEN_ENA_V3_UNIT_VALUE_");
  const horizonTokens = planLocalTokenMapV3(horizonIdentities, "__OPEN_ENA_V3_HORIZON_VALUE_");
  const groupTokens = planLocalTokenMapV3(groupIdentities, "__OPEN_ENA_V3_GROUP_VALUE_");
  const codeTokens = config.codes.map((_code, index) => (
    `__OPEN_ENA_V3_CODE_${index.toString(36).padStart(8, "0")}`
  ));
  const rows = ordering.orderedSourceRowIndices.map((sourceRowIndex) => {
    const source = sourceRows[sourceRowIndex];
    const unitToken = unitTokens.get(unitIdentities[sourceRowIndex]);
    const horizonToken = horizonTokens.get(horizonIdentities[sourceRowIndex]);
    if (source === undefined || unitToken === undefined || horizonToken === undefined) {
      throw new Error("ONA resolved order cannot be materialized into plan-local identities.");
    }
    const groupToken = groupColumn !== null
      ? groupTokens.get(groupIdentities[sourceRowIndex])
      : undefined;
    if (groupColumn !== null && groupToken === undefined) {
      throw new Error("ONA plan-local Group token materialization failed.");
    }
    return Object.fromEntries([
      [ONA_UNIT_COLUMN_TOKEN_V3, unitToken],
      [ONA_HORIZON_COLUMN_TOKEN_V3, horizonToken],
      ...(groupToken === undefined ? [] : [[ONA_GROUP_COLUMN_TOKEN_V3, groupToken]]),
      ...config.codes.map((code, codeIndex) => [codeTokens[codeIndex], source[code.column]]),
    ]) as Row;
  });
  return {
    rows,
    codeTokens,
    metadataTokens: groupColumn === null ? [] : [ONA_GROUP_COLUMN_TOKEN_V3],
  };
}

function uniqueSourceAdjacencyV3(codes: readonly string[]): AdjacencyKeyEntry[] {
  const adjacency = orderedAdjacencyKey([...codes]);
  const counts = new Map<string, number>();
  for (const entry of adjacency) counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1);
  const rawNames = new Set(adjacency.map((entry) => entry.name));
  const assigned = new Set<string>();
  return adjacency.map((entry) => {
    let name = counts.get(entry.name) === 1
      ? entry.name
      : `${entry.name} [${entry.sourceIndex}->${entry.targetIndex}]`;
    while (assigned.has(name) || (name !== entry.name && rawNames.has(name))) name += "#";
    assigned.add(name);
    return { ...entry, name };
  });
}

function restoreOnaSourceModelV3(
  accumulated: Pick<ENAData, "connectionCounts" | "connectionMatrix" | "adjacencyKey">,
  config: CanonicalOnaConfigV3,
): Pick<ENAData, "connectionCounts" | "connectionMatrix" | "adjacencyKey"> {
  const sourceAdjacency = uniqueSourceAdjacencyV3(config.codes.map((code) => code.column));
  if (sourceAdjacency.length !== accumulated.adjacencyKey.length) {
    throw new Error("ONA plan-local adjacency cannot be restored to source Code identities.");
  }
  const connectionCounts = accumulated.connectionCounts.map((row) => {
    return {
      ...Object.fromEntries(sourceAdjacency.map((sourceEdge, edgeIndex) => {
        const internalEdge = accumulated.adjacencyKey[edgeIndex];
        if (internalEdge === undefined
          || internalEdge.sourceIndex !== sourceEdge.sourceIndex
          || internalEdge.targetIndex !== sourceEdge.targetIndex) {
          throw new Error("ONA plan-local adjacency order drifted during source-label restoration.");
        }
        return [sourceEdge.name, row[internalEdge.name]];
      })),
    } as Row;
  });
  return {
    connectionCounts,
    connectionMatrix: accumulated.connectionMatrix.map((row) => [...row]),
    adjacencyKey: sourceAdjacency,
  };
}

/** @internal Authoritative ordered accumulation and SVD-identifiability preflight. */
export function runOnaScientificPreflightV3(
  dataset: ParsedDataset,
  config: CanonicalOnaConfigV3,
  ordering: ResolvedRowOrderingV3,
): OnaScientificPreflightV3 {
  const materialized = materializeOnaPlanLocalRowsV3(dataset, config, ordering);
  let connectionMatrix: number[][];
  let model: Pick<ENAData, "connectionCounts" | "connectionMatrix" | "adjacencyKey">;
  try {
    const accumulated = accumulateDataChunked({
      rows: materialized.rows,
      units: [ONA_UNIT_COLUMN_TOKEN_V3],
      conversation: [ONA_HORIZON_COLUMN_TOKEN_V3],
      codes: materialized.codeTokens,
      metadata: materialized.metadataTokens,
      networkType: "ordered",
      model: "EndPoint",
      window: "MovingStanzaWindow",
      windowSizeBack: config.window.backward.kind === "infinity"
        ? Number.POSITIVE_INFINITY
        : config.window.backward.value,
      windowSizeForward: 0,
      weightBy: "sum",
      mask: config.directionalMask.enabled.map((row) => row.map((enabled) => enabled ? 1 : 0)),
      includeMeta: false,
      materialization: "model",
      chunkSize: Math.max(1, Math.min(materialized.rows.length, 1_000)),
    });
    model = restoreOnaSourceModelV3(accumulated, config);
    connectionMatrix = model.connectionMatrix;
  } catch (error) {
    return deepFreezeV3({
      diagnostics: [onaNumericalDiagnosticV3(error)],
      model: null,
    });
  }
  if (connectionMatrix.some((row) => row.some((value) => !Number.isFinite(value)))) {
    return deepFreezeV3({
      diagnostics: [onaDiagnosticV3(
        "ONA_NUMERICAL_INVALID",
        "windows",
        "ONA ordered accumulation produced a non-finite value.",
        "No non-finite directed network can reach mandatory SVD.",
        { fieldPath: "window" },
      )],
      model,
    });
  }
  const signaled = connectionMatrix.map((row) => row.some((value) => value !== 0));
  if (!signaled.some(Boolean)) {
    return deepFreezeV3({
      diagnostics: [onaDiagnosticV3(
        "ONA_NO_ENABLED_CONNECTION",
        "codes",
        "The selected Codes do not form an enabled ordered connection.",
        "At least one positive directed connection must remain under the exact Horizon, order, backward window, and mask.",
        { fieldPath: "directionalMask" },
      )],
      model,
    });
  }
  const zeroCount = signaled.filter((value) => !value).length;
  const centeredRank = centeredNetworkRankV3(connectionMatrix, true);
  const diagnostics: OnaCompilerDiagnosticV3[] = [];
  if (zeroCount > 0) {
    diagnostics.push(onaDiagnosticV3(
      "ONA_ZERO_NETWORK_UNITS", "rotation", "ONA retains analytical Units with zero directed networks.",
      "These Units remain in the descriptive model with the existing ONA normalization and coordinates; they are not removed or imputed.",
      { fieldPath: "rotation", severity: "warning", blocks: [], evidence: { totalCount: zeroCount, sampleLimit: 5,
        samples: Array.from({ length: Math.min(zeroCount, 5) }, () => ({ detail: "Analytical Unit has an all-zero directed network." })), truncated: zeroCount > 5 } },
    ));
  }
  if (centeredRank === 0) {
    const totalCount = connectionMatrix.length;
    diagnostics.push(onaDiagnosticV3(
        "ONA_TARGET_RANK_ZERO",
        "rotation",
        "The descriptive ONA fit has no estimable centered variation.",
        "The existing SVD geometry and variance are retained. Completion axes, including normalized roundoff-level variance, are not evidence of an estimable dimension.",
        {
          fieldPath: "rotation",
          severity: "warning",
          blocks: [],
          evidence: {
            totalCount,
            sampleLimit: 5,
            samples: Array.from(
              { length: Math.min(totalCount, 5) },
              () => ({ detail: "Target participates in the rank-zero centered population." }),
            ),
            truncated: totalCount > 5,
          },
        },
      ));
  }
  if (centeredRank === 1) diagnostics.push(onaDiagnosticV3(
        "ONA_SVD_ONE_DIMENSIONAL",
        "rotation",
        "The mandatory ONA SVD target is one-dimensional.",
        "SVD1 is estimable, but the compiler does not invent meaningful second or third directed-network dimensions.",
        {
          fieldPath: "rotation",
          severity: "warning",
          blocks: ["ai-interpretation"],
          evidence: {
            totalCount: connectionMatrix.length,
            sampleLimit: 5,
            samples: Array.from(
              { length: Math.min(connectionMatrix.length, 5) },
              () => ({ detail: "Target participates in the one-dimensional centered population." }),
            ),
            truncated: connectionMatrix.length > 5,
          },
        },
      ));
  return deepFreezeV3({ diagnostics, model });
}
