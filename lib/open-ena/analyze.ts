import { cohensD, dimensionSummary, ena, enaStats, groupSummary, type ENASet, type Row } from "jena-js";
import type { ENAWorkerOptions } from "jena-js/browser";
import type {
  GroupNetwork,
  OpenEnaConfig,
  OpenEnaManifest,
  OpenEnaResult,
  OpenEnaRotationReference,
  OpenEnaSummary,
  ParsedDataset,
} from "./types";
import { coerceSelectedCodes } from "./csv";
import { JENA_GROUP_COLORS } from "./plot-style";
import { validateReferenceCompatibility } from "./reference";
import { JENA_RUNTIME_VERSION, OPEN_ENA_APP_VERSION } from "./types";

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

function meanRotationGroups(dataset: ParsedDataset, config: OpenEnaConfig): [string[], string[]] {
  if (!config.groupColumn) return [[], []];
  const groupColumn = config.groupColumn;
  const groupNames = [...new Set(dataset.rows.map((row) => String(row[groupColumn] ?? "")))];
  return groupNames.slice(0, 2).map((groupName) => [
    ...new Set(
      dataset.rows
        .filter((row) => String(row[groupColumn] ?? "") === groupName)
        .map((row) => compositeValue(row, config.unitColumns)),
    ),
  ]) as [string[], string[]];
}

export function effectiveRotation(dataset: ParsedDataset, config: OpenEnaConfig) {
  if (config.rotation === "mean") {
    return { method: "mean" as const, params: { groups: meanRotationGroups(dataset, config) } };
  }
  return { method: "svd" as const };
}

export function buildJenaOptions(
  dataset: ParsedDataset,
  config: OpenEnaConfig,
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
    rows: coerceSelectedCodes(dataset.rows, config.codes, retainedColumns),
    units: config.unitColumns,
    conversation: config.conversationColumns,
    codes: config.codes,
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
  const stats = !endpointModel
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
        : referenceProjection
          ? "not-applicable-reference"
          : !diagnosticsAreSafe
            ? "omitted-unit-limit"
            : "complete",
      tests: !endpointModel ? "not-applicable-trajectory" : diagnosticsAreSafe ? "complete" : "omitted-unit-limit",
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
): OpenEnaResult {
  return { set, ...buildOpenEnaSummary(set, config, reference) };
}

/**
 * Keep the aggregate/model tables needed by the workspace and exports while
 * releasing jENA's row-level copies of the source data after the model exists.
 */
export function compactOpenEnaSet(set: ENASet): ENASet {
  return {
    ...set,
    rawRows: [],
    rowConnectionCounts: [],
    metaData: [],
    trajectories: set.trajectories?.map((row) => ({ ...row })),
  };
}

export function analyzeDataset(
  dataset: ParsedDataset,
  config: OpenEnaConfig,
  reference: OpenEnaRotationReference | null = null,
): OpenEnaResult {
  const options = buildJenaOptions(dataset, config, reference);
  const set = attachStableGroupMetadata(ena(options), options.rows, config);
  return buildOpenEnaResult(set, config, reference);
}

export function dimensionEffect(
  result: OpenEnaResult,
  groupColumn: string | null,
  dimension: string,
  selectedGroupOrder?: readonly [string, string],
) {
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
      "Rows are analyzed in their CSV order within each conversation; reorder the source before analysis when sequence matters.",
      "Moving stanza windows may span multiple units that share a conversation, matching jENA/rENA discourse-window semantics; whole-conversation windows are accumulated per unit and conversation.",
      "Rotation-axis signs are arbitrary, so mirrored coordinates can represent the same ENA solution.",
      "Visual separation and edge thickness are descriptive; they do not establish statistical significance or causality.",
      "Trajectory steps are repeated observations of analytic units. Open ENA does not apply endpoint group tests or point-centroid correlation diagnostics to trajectory models.",
      "For reference projections, the axes, center, and reference nodes remain fixed; variance describes the current dataset in that basis, not explained variance in the fitted reference sample.",
      "For reference projections, point-centroid correlations and target-fitted centroid tables are withheld because jENA 0.6.2 does not compute them from the displayed fixed reference nodes.",
      "Imported reference names, source hashes, timestamps, and fit descriptors are declared provenance: ENA.HK validates their structure but does not independently authenticate their origin.",
      "The 3D ENA link opens a separate website; this workspace does not automatically transfer the dataset, configuration, or computed model.",
      "The result bundle excludes raw source rows. Preserve the exact source CSV and its codebook alongside the manifest and derived outputs for reproducibility.",
    ],
  };
}
