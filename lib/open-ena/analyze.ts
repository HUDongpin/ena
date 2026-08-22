import { cohensD, dimensionSummary, ena, enaStats, groupSummary, type ENASet, type Row } from "jena-js";
import type { ENAWorkerOptions } from "jena-js/browser";
import type {
  CanonicalOpenEnaConfig,
  GroupNetwork,
  OpenEnaAnalysisPlan,
  OpenEnaConfig,
  OpenEnaExecutionProvenance,
  OpenEnaManifest,
  OpenEnaResult,
  OpenEnaRotationReference,
  OpenEnaSummary,
  ParsedDataset,
} from "./types";
import { coerceSelectedCodes, validateConfig } from "./csv";
import {
  analysisKindFor,
  canonicalizeOpenEnaConfig,
  cloneDirectionalMask,
  cloneOpenEnaConfig,
  orderRowsForOpenEna,
  sameOpenEnaConfig,
} from "./network-config";
import { JENA_GROUP_COLORS } from "./plot-style";
import { validateReferenceCompatibility } from "./reference";
import { datasetHashKindFor, JENA_RUNTIME_VERSION, OPEN_ENA_APP_VERSION } from "./types";

export const AUTO_CORRELATION_UNIT_LIMIT = 500;

function numericMean(rows: Row[], field: string) {
  const values = rows.map((row) => row[field]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function equalUnitMean(rows: Row[], field: string) {
  const valuesByUnit = new Map<string, number[]>();
  for (const row of rows) {
    const value = row[field];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const unit = String(row.ENA_UNIT ?? "");
    const values = valuesByUnit.get(unit) ?? [];
    values.push(value);
    valuesByUnit.set(unit, values);
  }
  if (valuesByUnit.size === 0) return 0;
  let total = 0;
  for (const values of valuesByUnit.values()) {
    total += values.reduce((sum, value) => sum + value, 0) / values.length;
  }
  return total / valuesByUnit.size;
}

function compositeValue(row: Row, columns: string[]) {
  return columns.map((column) => String(row[column] ?? "")).join("::");
}

function comparisonGroupNames(dataset: ParsedDataset, config: OpenEnaConfig): [string, string] {
  if (!config.groupColumn) {
    throw new Error("Generalized means rotation requires a comparison-group column.");
  }
  const groupColumn = config.groupColumn;
  const groupNames = [...new Set(dataset.rows.map((row) => String(row[groupColumn] ?? "")))].filter(Boolean);
  if (groupNames.length < 2) {
    throw new Error("Generalized means rotation requires at least two non-empty comparison groups.");
  }
  return [groupNames[0], groupNames[1]];
}

export function effectiveRotation(dataset: ParsedDataset, config: OpenEnaConfig) {
  if (config.rotation === "mean") {
    const groupColumn = config.groupColumn;
    if (!groupColumn) {
      throw new Error("Generalized means rotation requires a comparison-group column.");
    }
    return {
      method: "generalized" as const,
      params: {
        xVar: groupColumn,
        select2Groups: comparisonGroupNames(dataset, config),
      },
    };
  }
  return { method: "svd" as const };
}

function renameProjectedAxis(row: Row, from: string, to: string): Row {
  if (!(from in row) || from === to) return row;
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key === from ? to : key, value]),
  ) as Row;
}

/**
 * jENA names the first generalized-regression axis RR1. Open ENA historically
 * serializes a two-group fitted axis as MR1, and its reference-rotation schema
 * uses that canonical name. Keep the verified generalized geometry while
 * preserving that stable analytical/export key; the figure layer presents it
 * as the official webENA label GMR1.
 */
export function canonicalizeOfficialMeanRotation(set: ENASet): ENASet {
  const from = set.rotation.rotationColumns[0];
  if (from !== "RR1") return set;
  const to = "MR1";
  return {
    ...set,
    points: set.points.map((row) => renameProjectedAxis(row, from, to)),
    centroids: set.centroids?.map((row) => renameProjectedAxis(row, from, to)),
    trajectories: set.trajectories?.map((row) => renameProjectedAxis(row, from, to)),
    rotation: {
      ...set.rotation,
      rotationColumns: set.rotation.rotationColumns.map((column, index) => index === 0 ? to : column),
      nodes: set.rotation.nodes?.map((row) => renameProjectedAxis(row, from, to)),
    },
    variance: Object.fromEntries(
      Object.entries(set.variance).map(([key, value]) => [key === from ? to : key, value]),
    ),
  };
}

function buildBaseJenaOptions(
  dataset: ParsedDataset,
  config: CanonicalOpenEnaConfig,
  rows: Row[],
  reference: OpenEnaRotationReference | null = null,
): ENAWorkerOptions {
  if (config.rotation === "reference" && (!reference || config.referenceRotationId !== reference.referenceId)) {
    throw new Error("A matching imported reference rotation is required for this model.");
  }
  if (reference) {
    const referenceErrors = validateReferenceCompatibility(config, reference);
    if (referenceErrors.length) throw new Error(referenceErrors.join(" "));
  }
  const retainedColumns = [
    ...config.unitColumns,
    ...config.conversationColumns,
    ...(config.groupColumn ? [config.groupColumn] : []),
  ];
  return {
    rows: coerceSelectedCodes(rows, config.codes, retainedColumns, config.analysisKind),
    units: [...config.unitColumns],
    conversation: [...config.conversationColumns],
    codes: [...config.codes],
    metadata: config.groupColumn ? [config.groupColumn] : [],
    model: config.model,
    window: config.window,
    windowSizeBack: config.window === "Conversation" ? Number.POSITIVE_INFINITY : config.windowSizeBack,
    windowSizeForward: config.window === "Conversation" ? 0 : config.windowSizeForward,
    weightBy: config.weightBy,
    dimensions: 3,
    ...(reference ? { rotationSet: reference.rotationSet } : { rotation: effectiveRotation(dataset, config) }),
    centerAlignToOrigin: config.centerAlignToOrigin,
  };
}

export function buildOpenEnaAnalysisPlan(
  dataset: ParsedDataset,
  config: OpenEnaConfig,
  reference: OpenEnaRotationReference | null = null,
): OpenEnaAnalysisPlan {
  const configuration = canonicalizeOpenEnaConfig(config);
  if (configuration.analysisKind === "ena") {
    return {
      configuration,
      options: buildBaseJenaOptions(dataset, configuration, dataset.rows, reference),
      executionProvenance: {
        schemaVersion: 1,
        configuration: cloneOpenEnaConfig(configuration),
        analysisKind: "ena",
        networkType: "standard",
        nodePositionMethod: "undirected",
        directionalMask: null,
        ordering: null,
      },
    };
  }

  const errors = validateConfig(dataset, configuration);
  if (errors.length > 0) throw new Error(errors.join(" "));
  if (reference) throw new Error("ONA does not support reference rotation.");
  const orderPolicy = configuration.orderPolicy;
  const directionalMask = configuration.directionalMask;
  if (!orderPolicy || !directionalMask) {
    throw new Error("ONA requires an explicit order policy and directional mask.");
  }
  const ordered = orderRowsForOpenEna(dataset.rows, configuration.conversationColumns, orderPolicy);
  const base = buildBaseJenaOptions(dataset, configuration, ordered.rows, null);
  const executionProvenance: OpenEnaExecutionProvenance = {
    schemaVersion: 1,
    configuration: cloneOpenEnaConfig(configuration),
    analysisKind: "ona",
    networkType: "ordered",
    nodePositionMethod: "directed",
    directionalMask: cloneDirectionalMask(directionalMask),
    ordering: {
      requestedPolicy: cloneOpenEnaConfig(configuration).orderPolicy!,
      resolvedPolicy: structuredClone(ordered.resolvedPolicy),
      responseRowSourceIndices: [...ordered.sourceIndices],
    },
  };
  return {
    configuration,
    options: {
      ...base,
      networkType: "ordered",
      mask: directionalMask.enabled.map((row) => row.map((enabled) => enabled ? 1 : 0)),
      nodePositionMethod: "directed",
    },
    executionProvenance,
  };
}

export function buildJenaOptions(
  dataset: ParsedDataset,
  config: OpenEnaConfig,
  reference: OpenEnaRotationReference | null = null,
): ENAWorkerOptions {
  return buildOpenEnaAnalysisPlan(dataset, config, reference).options;
}

/**
 * jENA's verified trajectory accumulator intentionally returns unit and
 * conversation identities for each step, but not arbitrary metadata. Restore
 * only the already-validated, unit-stable comparison field so trajectory
 * points, tables, and plots retain their group identity without carrying raw
 * source rows across the worker boundary.
 */
export function attachStableGroupMetadata(
  set: ENASet,
  rows: Row[],
  config: OpenEnaConfig,
): ENASet {
  const groupColumn = config.groupColumn;
  if (!groupColumn) return set;
  const groupByUnit = new Map<string, Row[string]>();
  for (const row of rows) {
    groupByUnit.set(compositeValue(row, config.unitColumns), row[groupColumn]);
  }
  const attach = (row: Row): Row => {
    const group = groupByUnit.get(String(row.ENA_UNIT ?? ""));
    return group === undefined ? { ...row } : { ...row, [groupColumn]: group };
  };
  return {
    ...set,
    connectionCounts: set.connectionCounts.map(attach),
    metaData: set.metaData.map(attach),
    lineWeights: set.lineWeights.map(attach),
    pointsForProjection: set.pointsForProjection.map(attach),
    points: set.points.map(attach),
    centroids: set.centroids?.map(attach),
    trajectories: set.trajectories?.map(attach),
  };
}

export function buildOpenEnaSummary(
  set: ENASet,
  config: OpenEnaConfig,
  reference: OpenEnaRotationReference | null = null,
): OpenEnaSummary {
  const analysisKind = analysisKindFor(config);
  const runtimeNetworkType = set.networkType ?? "standard";
  if ((analysisKind === "ona") !== (runtimeNetworkType === "ordered")) {
    throw new Error(`The ${analysisKind.toUpperCase()} configuration does not match the ${runtimeNetworkType} runtime result.`);
  }
  const orderedNetwork = analysisKind === "ona";
  const dimensions = set.rotation.rotationColumns.slice(0, 3);
  const groupValue = (row: Row) => config.groupColumn ? String(row[config.groupColumn] ?? "All units") : "All units";
  const groupNames = [...new Set(set.points.map(groupValue))];
  const groupMean = set.modelType === "EndPoint" ? numericMean : equalUnitMean;
  const groups: GroupNetwork[] = groupNames.map((name, index) => {
    const pointRows = set.points.filter((row) => groupValue(row) === name);
    const lineRows = set.lineWeights.filter((row) => groupValue(row) === name);
    const unitCount = new Set(pointRows.map((row) => String(row.ENA_UNIT ?? ""))).size;
    return {
      name,
      count: unitCount,
      pointCount: pointRows.length,
      color: JENA_GROUP_COLORS[index % JENA_GROUP_COLORS.length],
      meanPoint: Object.fromEntries(dimensions.map((dimension) => [dimension, groupMean(pointRows, dimension)])),
      meanWeights: Object.fromEntries(set.adjacencyKey.map((edge) => [edge.name, groupMean(lineRows, edge.name)])),
    };
  });

  const endpointModel = set.modelType === "EndPoint";
  const diagnosticsAreSafe = endpointModel && set.points.length <= AUTO_CORRELATION_UNIT_LIMIT;
  const referenceProjection = Boolean(reference);
  const stats = orderedNetwork
    ? {
        dimensions: dimensionSummary(set, dimensions),
        correlations: [],
        ...(config.groupColumn ? { groups: groupSummary(set, config.groupColumn, dimensions) } : {}),
      }
    : !endpointModel
    ? {
        dimensions: dimensionSummary(set, dimensions),
        correlations: [],
      }
    : diagnosticsAreSafe
    ? (() => {
        const endpointStats = enaStats(set, {
        ...(config.groupColumn ? { by: config.groupColumn } : {}),
        dims: dimensions,
        });
        return referenceProjection ? { ...endpointStats, correlations: [] } : endpointStats;
      })()
    : {
        dimensions: dimensionSummary(set, dimensions),
        correlations: [],
        ...(config.groupColumn ? { groups: groupSummary(set, config.groupColumn, dimensions) } : {}),
      };

  return {
    groups,
    dimensions,
    stats,
    statsDiagnostics: {
      correlations: !endpointModel
        ? "not-applicable-trajectory"
        : orderedNetwork
          ? "not-applicable-ordered-network"
        : referenceProjection
          ? "not-applicable-reference"
          : !diagnosticsAreSafe
            ? "omitted-unit-limit"
            : "complete",
      tests: orderedNetwork
        ? "not-applicable-ordered-network"
        : !endpointModel
          ? "not-applicable-trajectory"
          : diagnosticsAreSafe
            ? "complete"
            : "omitted-unit-limit",
      correlationUnitLimit: AUTO_CORRELATION_UNIT_LIMIT,
    },
    analyzedAt: new Date().toISOString(),
    projectionReference: reference ? {
      schemaVersion: reference.schemaVersion,
      kind: reference.kind,
      app: reference.app,
      runtime: reference.runtime,
      runtimeVersion: reference.runtimeVersion,
      referenceId: reference.referenceId,
      name: reference.name,
      source: reference.source,
      fit: reference.fit,
      compatibility: reference.compatibility,
    } : null,
  };
}

export function buildOpenEnaResult(
  set: ENASet,
  config: OpenEnaConfig,
  reference: OpenEnaRotationReference | null = null,
  executionProvenance?: OpenEnaExecutionProvenance,
): OpenEnaResult {
  return {
    set,
    ...buildOpenEnaSummary(set, config, reference),
    ...(executionProvenance ? { executionProvenance: structuredClone(executionProvenance) } : {}),
  };
}

/**
 * Keep the aggregate/model tables needed by the workspace and exports while
 * releasing jENA's row-level copies of the source data after the model exists.
 */
export function compactOpenEnaSet(set: ENASet): ENASet {
  const orderedNetwork = set.networkType === "ordered";
  return {
    ...set,
    rawRows: [],
    rowConnectionCounts: orderedNetwork
      ? set.rowConnectionCounts.map((row) => ({ ...row }))
      : [],
    metaData: [],
    ...(orderedNetwork && set.rowWindowProvenance
      ? { rowWindowProvenance: set.rowWindowProvenance.map((entry) => ({ ...entry })) }
      : {}),
    trajectories: set.trajectories?.map((row) => ({ ...row })),
  };
}

export function analyzeDataset(
  dataset: ParsedDataset,
  config: OpenEnaConfig,
  reference: OpenEnaRotationReference | null = null,
): OpenEnaResult {
  const plan = buildOpenEnaAnalysisPlan(dataset, config, reference);
  const generatedSet = ena(plan.options);
  const fittedSet = plan.configuration.rotation === "mean"
    ? canonicalizeOfficialMeanRotation(generatedSet)
    : generatedSet;
  const set = attachStableGroupMetadata(fittedSet, plan.options.rows, plan.configuration);
  return buildOpenEnaResult(set, plan.configuration, reference, plan.executionProvenance);
}

function sameStringArray(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function hasExactKeys(value: object, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return sameStringArray(actual, sortedExpected);
}

function resolvedOrderPolicyMatches(provenance: OpenEnaExecutionProvenance) {
  const requested = provenance.ordering?.requestedPolicy;
  const resolved = provenance.ordering?.resolvedPolicy;
  if (!requested || !resolved || requested.kind !== resolved.kind) return false;
  if (requested.kind === "source-row" && resolved.kind === "source-row") {
    return hasExactKeys(resolved, ["kind", "confirmed", "stable"])
      && requested.confirmed === true
      && resolved.confirmed === true
      && resolved.stable === true;
  }
  if (requested.kind !== "columns" || resolved.kind !== "columns") return false;
  return hasExactKeys(resolved, [
    "kind",
    "columns",
    "comparators",
    "direction",
    "missing",
    "ties",
    "stable",
  ])
    && sameStringArray(requested.columns, resolved.columns)
    && requested.columns.every((column) => requested.comparators[column] === resolved.comparators[column])
    && hasExactKeys(resolved.comparators, requested.columns)
    && resolved.direction === "ascending"
    && resolved.missing === "reject"
    && resolved.ties === "reject"
    && resolved.stable === true;
}

function assertResultExecutionProvenance(
  result: OpenEnaResult,
  dataset: ParsedDataset,
  suppliedConfig: CanonicalOpenEnaConfig,
) {
  const provenance = result.executionProvenance;
  if (!provenance || provenance.schemaVersion !== 1 || !provenance.configuration) {
    throw new Error("The completed Open ENA result is missing full execution provenance.");
  }
  let executedConfig: CanonicalOpenEnaConfig;
  try {
    executedConfig = canonicalizeOpenEnaConfig(provenance.configuration);
  } catch {
    throw new Error("The completed Open ENA result has invalid execution-provenance configuration.");
  }
  if (!sameOpenEnaConfig(executedConfig, suppliedConfig)) {
    throw new Error("The provenance configuration does not match the completed Open ENA result.");
  }

  const runtimeNetworkValue = Reflect.get(result.set, "networkType") as unknown;
  if (runtimeNetworkValue !== undefined
    && runtimeNetworkValue !== "standard"
    && runtimeNetworkValue !== "ordered") {
    throw new Error("The completed Open ENA result has an invalid runtime network type.");
  }
  const runtimeNetworkType = runtimeNetworkValue ?? "standard";
  const expectedNetworkType = executedConfig.analysisKind === "ona" ? "ordered" : "standard";
  const functionNetworkType = Reflect.get(result.set.functionParams, "networkType") as unknown;
  if ((functionNetworkType ?? "standard") !== expectedNetworkType
    || runtimeNetworkType !== expectedNetworkType
    || provenance.analysisKind !== executedConfig.analysisKind
    || provenance.networkType !== expectedNetworkType
    || !sameStringArray(result.set.codes, executedConfig.codes)
    || !sameStringArray(result.set.units, executedConfig.unitColumns)
    || !sameStringArray(result.set.conversation, executedConfig.conversationColumns)
    || result.set.modelType !== executedConfig.model
    || result.set.functionParams.model !== executedConfig.model
    || result.set.functionParams.window !== executedConfig.window
    || result.set.functionParams.windowSizeBack !== (executedConfig.window === "Conversation"
      ? Number.POSITIVE_INFINITY
      : executedConfig.windowSizeBack)
    || result.set.functionParams.windowSizeForward !== (executedConfig.window === "Conversation"
      ? 0
      : executedConfig.windowSizeForward)
    || result.set.functionParams.weightBy !== executedConfig.weightBy) {
    throw new Error("The execution provenance does not match the completed Open ENA runtime result.");
  }
  if (executedConfig.rotation === "reference") {
    if (!result.projectionReference
      || result.projectionReference.referenceId !== executedConfig.referenceRotationId) {
      throw new Error("The execution provenance does not match the reference-projected result.");
    }
  } else if (result.projectionReference) {
    throw new Error("The execution provenance unexpectedly omits the result reference projection.");
  }

  if (executedConfig.analysisKind === "ena") {
    if (provenance.nodePositionMethod !== "undirected"
      || provenance.directionalMask !== null
      || provenance.ordering !== null) {
      throw new Error("Standard ENA execution provenance cannot carry ordered-network options.");
    }
    return provenance;
  }

  const provenanceConfig: OpenEnaConfig = {
    ...executedConfig,
    orderPolicy: provenance.ordering?.requestedPolicy ?? null,
    directionalMask: provenance.directionalMask,
  };
  const sourceIndices = provenance.ordering?.responseRowSourceIndices;
  if (provenance.nodePositionMethod !== "directed"
    || !sameOpenEnaConfig(executedConfig, provenanceConfig)
    || !resolvedOrderPolicyMatches(provenance)
    || !Array.isArray(sourceIndices)
    || sourceIndices.length !== dataset.rows.length
    || new Set(sourceIndices).size !== dataset.rows.length
    || sourceIndices.some((index) => (
      !Number.isSafeInteger(index) || index < 0 || index >= dataset.rows.length
    ))) {
    throw new Error("ONA execution provenance has an invalid directed mask, resolved order, or source-index permutation.");
  }
  return provenance;
}

/**
 * Return a new result with a canonical, deep-cloned source/config binding.
 * The completed worker result and the caller's mutable config remain untouched.
 */
export function bindOpenEnaResultProvenance(
  result: OpenEnaResult,
  dataset: ParsedDataset,
  datasetSha256: string,
  config: OpenEnaConfig,
): OpenEnaResult {
  if (!/^[a-f\d]{64}$/iu.test(datasetSha256)) {
    throw new Error("Open ENA provenance binding requires a 64-character hexadecimal SHA-256 digest.");
  }
  const configuration = canonicalizeOpenEnaConfig(config);
  const executionProvenance = assertResultExecutionProvenance(result, dataset, configuration);
  const datasetHashKind = datasetHashKindFor(dataset);
  if (datasetHashKind !== "normalized-utf8-text-sha256"
    && datasetHashKind !== "normalized-utf8-csv-text-sha256"
    && datasetHashKind !== "canonical-first-xlsx-worksheet-v1-sha256") {
    throw new Error("Open ENA dataset provenance contains an unsupported hash kind.");
  }
  return {
    ...result,
    executionProvenance: structuredClone(executionProvenance),
    provenanceBinding: {
      datasetNormalizedUtf8TextSha256: datasetSha256.toLowerCase(),
      datasetHashKind,
      configuration: cloneOpenEnaConfig(configuration),
    },
  };
}

export function dimensionEffect(
  result: OpenEnaResult,
  groupColumn: string | null,
  dimension: string,
  selectedGroupOrder?: readonly [string, string],
) {
  if ((result.set.networkType ?? "standard") === "ordered") return null;
  if (result.set.modelType !== "EndPoint" || !groupColumn) return null;
  if (!selectedGroupOrder && result.groups.length !== 2) return null;
  const firstName = selectedGroupOrder?.[0] ?? result.groups[0]?.name;
  const secondName = selectedGroupOrder?.[1] ?? result.groups[1]?.name;
  if (!firstName || !secondName || firstName === secondName) return null;
  const declaredGroups = new Set(result.groups.map((group) => group.name));
  if (!declaredGroups.has(firstName) || !declaredGroups.has(secondName)) return null;
  const firstValues = result.set.points
    .filter((row) => String(row[groupColumn]) === firstName)
    .map((row) => Number(row[dimension]));
  const secondValues = result.set.points
    .filter((row) => String(row[groupColumn]) === secondName)
    .map((row) => Number(row[dimension]));
  return Number.isFinite(cohensD(firstValues, secondValues)) ? cohensD(firstValues, secondValues) : null;
}

export function buildManifest(
  dataset: ParsedDataset,
  config: OpenEnaConfig,
  result: OpenEnaResult,
  sha256: string | null = null,
): OpenEnaManifest {
  return {
    schemaVersion: 1,
    app: "ENA.HK Open ENA",
    appVersion: OPEN_ENA_APP_VERSION,
    runtime: "jena-js",
    runtimeVersion: JENA_RUNTIME_VERSION,
    dataset: {
      name: dataset.name,
      rows: dataset.rows.length,
      columns: dataset.headers.length,
      source: dataset.source,
      hashKind: datasetHashKindFor(dataset),
      normalizedUtf8TextSha256: sha256,
    },
    configuration: config,
    result: {
      model: result.set.modelType,
      units: new Set(result.set.points.map((row) => String(row.ENA_UNIT ?? ""))).size,
      points: result.set.points.length,
      groups: result.groups.map(({ name, count }) => ({ name, count })),
      dimensions: result.dimensions,
      variance: result.set.variance,
      statsDiagnostics: result.statsDiagnostics,
      projectionReference: result.projectionReference,
      analyzedAt: result.analyzedAt,
    },
    effectiveJenaOptions: {
      units: [...config.unitColumns],
      conversation: [...config.conversationColumns],
      codes: [...config.codes],
      metadata: config.groupColumn ? [config.groupColumn] : [],
      includeMeta: true,
      model: config.model,
      window: config.window,
      windowSizeBack: config.window === "Conversation" ? "Infinity" : config.windowSizeBack,
      windowSizeForward: config.window === "Conversation" ? 0 : config.windowSizeForward,
      weightBy: config.weightBy,
      dimensions: 3,
      rotation: result.projectionReference
        ? {
            method: "reference",
            referenceId: result.projectionReference.referenceId,
            sourceDatasetSha256: result.projectionReference.source.normalizedUtf8TextSha256,
          }
        : effectiveRotation(dataset, config),
      centerAlignToOrigin: config.centerAlignToOrigin,
      normalization: "sphere",
      nodePositionMethod: "undirected",
    },
    generatedAt: new Date().toISOString(),
    boundaries: [
      "The graph depends on the supplied codes, units, conversations, window, weighting, normalization, and rotation.",
      "Rows are analyzed in source order within each conversation; XLSX analysis uses the first worksheet. Reorder the source before analysis when sequence matters.",
      "Dataset hash scope is recorded in dataset.hashKind: CSV uses BOM-normalized UTF-8 source text; XLSX uses the versioned canonical values of the analyzed first worksheet, excluding workbook styling and unselected worksheets.",
      "Moving stanza windows may span multiple units that share a conversation, matching jENA/rENA discourse-window semantics; whole-conversation windows are accumulated per unit and conversation.",
      "Rotation-axis signs are arbitrary, so mirrored coordinates can represent the same ENA solution.",
      "Visual separation and edge thickness are descriptive; they do not establish statistical significance or causality.",
      "Trajectory steps are repeated observations of analytic units. Open ENA does not apply endpoint group tests or point-centroid correlation diagnostics to trajectory models.",
      "For reference projections, the axes, center, and reference nodes remain fixed; variance describes the current dataset in that basis, not explained variance in the fitted reference sample.",
      "For reference projections, point-centroid correlations and target-fitted centroid tables are withheld because jENA 0.7.0-ona.0 does not compute them from the displayed fixed reference nodes.",
      "Imported reference names, analyzed-table hashes, hash kinds, timestamps, and fit descriptors are declared provenance: ENA.HK validates their structure but does not independently authenticate their origin.",
      "The 3D ENA link opens a separate website; this workspace does not automatically transfer the dataset, configuration, or computed model.",
      "The result bundle excludes raw source rows. Preserve the exact source coded-data file and its codebook alongside the manifest and derived outputs for reproducibility.",
    ],
  };
}
