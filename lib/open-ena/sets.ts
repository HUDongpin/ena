import type { Row } from "jena-js";
import { rowsToCsv } from "./export";
import { buildReferenceRotationPackage } from "./reference";
import {
  JENA_RUNTIME_VERSION,
  type OpenEnaAnalysisSet,
  type OpenEnaConfig,
  type OpenEnaProjectionReference,
  type OpenEnaReferenceCompatibility,
  type OpenEnaResult,
  type OpenEnaRotationReference,
  type OpenEnaSharedComparison,
  type OpenEnaSharedComparisonSide,
  type ParsedDataset,
  sameOpenEnaConfig,
} from "./types";

export type { OpenEnaAnalysisSet, OpenEnaSharedComparison } from "./types";

export const MAX_RETAINED_ANALYSIS_SETS = 6;

interface BuildAnalysisSetOptions {
  id?: string;
  name?: string;
  capturedAt?: string;
}

interface CaptureAnalysisSetOptions {
  setId?: string;
  name?: string;
  datasetSha256?: string | null;
  capturedAt?: string;
}

export interface OpenEnaSetSelection {
  primarySetId: string | null;
  secondarySetId: string | null;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function finite(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function canonicalTimestamp(value: string, label: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`${label} must be a canonical ISO timestamp.`);
  }
  return value;
}

function validateDatasetHash(value: string | null) {
  if (value !== null && !/^[0-9a-f]{64}$/iu.test(value)) {
    throw new Error("The analysis-set dataset hash must be a 64-character SHA-256 value.");
  }
  return value?.toLowerCase() ?? null;
}

function cloneConfig(config: OpenEnaConfig): OpenEnaConfig {
  return {
    ...config,
    unitColumns: [...config.unitColumns],
    conversationColumns: [...config.conversationColumns],
    codes: [...config.codes],
  };
}

function cloneCompatibility(compatibility: OpenEnaReferenceCompatibility): OpenEnaReferenceCompatibility {
  return { ...compatibility, codes: [...compatibility.codes] };
}

function sanitizeEndpointRows(
  rows: Row[],
  config: OpenEnaConfig,
  numericColumns: string[],
  label: string,
) {
  const seenUnits = new Set<string>();
  return rows.map((row, index) => {
    const unit = String(row.ENA_UNIT ?? "");
    if (!unit) throw new Error(`${label} row ${index + 1} is missing ENA_UNIT.`);
    if (seenUnits.has(unit)) throw new Error(`${label} must contain exactly one row per endpoint analytic unit.`);
    seenUnits.add(unit);
    const sanitized: Row = { ENA_UNIT: unit };
    if (config.groupColumn && row[config.groupColumn] !== undefined) {
      sanitized[config.groupColumn] = row[config.groupColumn];
    }
    for (const column of numericColumns) {
      sanitized[column] = finite(row[column], `${label} ${column}`);
    }
    return sanitized;
  });
}

function summarizeEndpointLineWeights(
  rows: Row[],
  edgeNames: string[],
  pointUnits: Set<string>,
) {
  const seenUnits = new Set<string>();
  const sums = new Array<number>(edgeNames.length).fill(0);
  for (const [rowIndex, row] of rows.entries()) {
    const unit = String(row.ENA_UNIT ?? "");
    if (!unit) throw new Error(`Endpoint line-weight row ${rowIndex + 1} is missing ENA_UNIT.`);
    if (seenUnits.has(unit)) {
      throw new Error("Endpoint line weights must contain exactly one row per analytic unit.");
    }
    seenUnits.add(unit);
    for (let edgeIndex = 0; edgeIndex < edgeNames.length; edgeIndex += 1) {
      const edgeName = edgeNames[edgeIndex];
      sums[edgeIndex] += finite(row[edgeName], `Endpoint line-weight ${edgeName}`);
    }
  }
  if (seenUnits.size !== pointUnits.size || [...pointUnits].some((unit) => !seenUnits.has(unit))) {
    throw new Error("Endpoint coordinates and line weights must describe the same analytic units.");
  }
  const denominator = Math.max(1, seenUnits.size);
  return Object.fromEntries(edgeNames.map((edgeName, index) => [edgeName, sums[index] / denominator]));
}

function assertResultOwnership(datasetSha256: string | null, config: OpenEnaConfig, result: OpenEnaResult) {
  const binding = result.provenanceBinding;
  if (!binding) {
    throw new Error("The ENA result is missing its immutable dataset and configuration provenance binding.");
  }
  if (binding.datasetNormalizedUtf8TextSha256 !== datasetSha256
    || !sameOpenEnaConfig(binding.configuration, config)) {
    throw new Error("The supplied dataset and configuration do not reproduce this ENA result.");
  }
}

/**
 * Capture a derived endpoint result for browser-memory comparison. This is a
 * deliberate whitelist copy: rawRows, rowConnectionCounts, conversations, and
 * unselected source fields never enter the retained object.
 */
export function buildAnalysisSet(
  dataset: ParsedDataset,
  datasetSha256: string | null,
  config: OpenEnaConfig,
  result: OpenEnaResult,
  options: BuildAnalysisSetOptions = {},
): OpenEnaAnalysisSet {
  if (result.set.modelType !== "EndPoint") {
    throw new Error("Trajectory results cannot be captured as shared analysis sets; build an endpoint model instead.");
  }
  if (result.dimensions.length < 2) throw new Error("A shared analysis set requires at least two ENA dimensions.");
  assertResultOwnership(datasetSha256, config, result);

  const hash = validateDatasetHash(datasetSha256);
  const capturedAt = canonicalTimestamp(options.capturedAt ?? new Date().toISOString(), "Analysis-set capture time");
  const generatedReference: OpenEnaRotationReference | null = result.projectionReference
    ? null
    : cloneJson(buildReferenceRotationPackage(dataset, config, result, hash));
  const projectionReference: OpenEnaProjectionReference | null = result.projectionReference
    ? cloneJson(result.projectionReference)
    : null;
  const reference = generatedReference ?? projectionReference;
  if (!reference) throw new Error("The endpoint result does not provide reusable reference provenance.");

  const dimensions = [...result.dimensions];
  const adjacencyKey = result.set.adjacencyKey.map((edge) => ({
    source: edge.source,
    target: edge.target,
    name: edge.name,
    sourceIndex: edge.sourceIndex,
    targetIndex: edge.targetIndex,
  }));
  const points = sanitizeEndpointRows(result.set.points, config, dimensions, "Endpoint coordinate");
  const meanWeights = summarizeEndpointLineWeights(
    result.set.lineWeights,
    adjacencyKey.map((edge) => edge.name),
    new Set(points.map((row) => String(row.ENA_UNIT))),
  );

  const displayedNodes = result.set.rotation.nodes ?? [];
  const nodes = config.codes.map((code) => {
    const source = displayedNodes.find((row) => String(row.code) === code);
    if (!source) throw new Error(`Reference geometry is missing the node for code ${code}.`);
    return {
      code,
      ...Object.fromEntries(dimensions.map((dimension) => [
        dimension,
        finite(source[dimension], `Reference node ${code} ${dimension}`),
      ])),
    };
  });
  const role = result.projectionReference ? "projected" : "fitted";
  const defaultId = `open-ena-set:${hash ?? dataset.name}:${result.analyzedAt}:${reference.referenceId}`;

  return {
    id: options.id ?? defaultId,
    name: options.name ?? dataset.name,
    capturedAt,
    role,
    dataset: {
      name: dataset.name,
      source: dataset.source,
      rowCount: dataset.rows.length,
      columnCount: dataset.headers.length,
      sizeBytes: dataset.sizeBytes,
      normalizedUtf8TextSha256: hash,
    },
    config: cloneConfig(config),
    points,
    meanWeights,
    geometry: {
      referenceId: reference.referenceId,
      codes: [...result.set.rotation.codes],
      dimensions,
      adjacencyKey,
      rotationColumns: [...result.set.rotation.rotationColumns],
      rotationMatrix: result.set.rotation.rotationMatrix.map((row) => row.map((value) => finite(value, "Reference rotation matrix"))),
      eigenvalues: result.set.rotation.eigenvalues.map((value) => finite(value, "Reference eigenvalue")),
      centerVector: result.set.rotation.centerVector.map((value) => finite(value, "Reference center vector")),
      nodes,
      compatibility: cloneCompatibility(reference.compatibility),
    },
    generatedReference,
    projectionReference,
  };
}

export function captureOpenEnaAnalysisSet(
  dataset: ParsedDataset,
  config: OpenEnaConfig,
  result: OpenEnaResult,
  options: CaptureAnalysisSetOptions = {},
) {
  return buildAnalysisSet(dataset, options.datasetSha256 ?? null, config, result, {
    id: options.setId,
    name: options.name,
    capturedAt: options.capturedAt,
  });
}

export function upsertAnalysisSet(sets: OpenEnaAnalysisSet[], captured: OpenEnaAnalysisSet) {
  const existingIndex = sets.findIndex((set) => set.id === captured.id);
  if (existingIndex < 0) {
    if (sets.length >= MAX_RETAINED_ANALYSIS_SETS) {
      throw new Error(`This browser session can retain at most ${MAX_RETAINED_ANALYSIS_SETS} analysis sets. Remove one before capturing another.`);
    }
    return [...sets, captured];
  }
  return sets.map((set, index) => index === existingIndex ? captured : set);
}

export function upsertOpenEnaAnalysisSet(sets: OpenEnaAnalysisSet[], captured: OpenEnaAnalysisSet) {
  return upsertAnalysisSet(sets, captured);
}

export function removeAnalysisSet(sets: OpenEnaAnalysisSet[], setId: string) {
  return sets.filter((set) => set.id !== setId);
}

export function removeOpenEnaAnalysisSet(sets: OpenEnaAnalysisSet[], setId: string) {
  return removeAnalysisSet(sets, setId);
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function compactReference(set: OpenEnaAnalysisSet): OpenEnaProjectionReference {
  if (set.projectionReference) return cloneJson(set.projectionReference);
  if (set.generatedReference) {
    const { rotationSet: _rotationSet, ...reference } = set.generatedReference;
    return cloneJson(reference);
  }
  throw new Error("The analysis set is missing fitted-reference provenance.");
}

export function validateOpenEnaSharedGeometry(
  primary: OpenEnaAnalysisSet,
  secondary: OpenEnaAnalysisSet,
  axes: readonly string[] = primary.geometry.dimensions.slice(0, 2),
) {
  const errors: string[] = [];
  if (primary.id === secondary.id) errors.push("Primary and Secondary must be distinct analysis sets.");
  if (primary.geometry.referenceId !== secondary.geometry.referenceId) {
    errors.push("Primary and Secondary use different reference identifiers.");
  }
  try {
    if (!sameJson(compactReference(primary), compactReference(secondary))) {
      errors.push("Primary and Secondary declare inconsistent fitted-reference provenance.");
    }
  } catch (caught) {
    errors.push(caught instanceof Error ? caught.message : String(caught));
  }
  if (!sameJson(primary.geometry.compatibility, secondary.geometry.compatibility)) {
    errors.push("Primary and Secondary use different ENA accumulation semantics.");
  }
  if (!sameJson(primary.geometry.codes, secondary.geometry.codes)) {
    errors.push("Primary and Secondary use different code schemas.");
  }
  if (!sameJson(primary.geometry.dimensions, secondary.geometry.dimensions)) {
    errors.push("Primary and Secondary expose different ENA dimensions.");
  }
  if (!sameJson(primary.geometry.adjacencyKey, secondary.geometry.adjacencyKey)) {
    errors.push("Primary and Secondary use different adjacency geometry.");
  }
  if (!sameJson(primary.geometry.rotationColumns, secondary.geometry.rotationColumns)
    || !sameJson(primary.geometry.rotationMatrix, secondary.geometry.rotationMatrix)
    || !sameJson(primary.geometry.eigenvalues, secondary.geometry.eigenvalues)
    || !sameJson(primary.geometry.centerVector, secondary.geometry.centerVector)
    || !sameJson(primary.geometry.nodes, secondary.geometry.nodes)) {
    errors.push("Primary and Secondary do not share the exact fitted reference geometry.");
  }
  if (axes.length !== 2 || axes[0] === axes[1]
    || axes.some((axis) => !primary.geometry.dimensions.includes(axis))) {
    errors.push("Choose two distinct dimensions available in the shared reference geometry.");
  }
  return [...new Set(errors)];
}

export function haveCompatibleSetGeometry(primary: OpenEnaAnalysisSet, secondary: OpenEnaAnalysisSet) {
  return validateOpenEnaSharedGeometry(primary, secondary)
    .filter((error) => !/must be distinct analysis sets/i.test(error)).length === 0;
}

function equalUnitMean(rows: Row[], column: string) {
  const byUnit = new Map<string, number[]>();
  for (const row of rows) {
    const unit = String(row.ENA_UNIT ?? "");
    const value = finite(row[column], `Shared-set ${column}`);
    const values = byUnit.get(unit) ?? [];
    values.push(value);
    byUnit.set(unit, values);
  }
  if (!byUnit.size) return 0;
  let total = 0;
  for (const values of byUnit.values()) total += values.reduce((sum, value) => sum + value, 0) / values.length;
  return total / byUnit.size;
}

function comparisonSide(
  set: OpenEnaAnalysisSet,
  axes: [string, string],
): OpenEnaSharedComparisonSide {
  const sourceUnitIds = set.points.map((row) => String(row.ENA_UNIT ?? ""));
  const unitIds = sourceUnitIds.map((sourceUnitId) => `${set.id}::${sourceUnitId}`);
  return {
    setId: set.id,
    name: set.name,
    role: set.role,
    capturedAt: set.capturedAt,
    datasetHash: set.dataset.normalizedUtf8TextSha256,
    dataset: cloneJson(set.dataset),
    config: cloneConfig(set.config),
    unitCount: new Set(sourceUnitIds).size,
    unitIds,
    points: set.points.map((row, index) => ({
      unitId: unitIds[index],
      sourceUnitId: sourceUnitIds[index],
      x: finite(row[axes[0]], `${set.name} ${axes[0]} coordinate`),
      y: finite(row[axes[1]], `${set.name} ${axes[1]} coordinate`),
    })),
    meanPoint: Object.fromEntries(axes.map((axis) => [axis, equalUnitMean(set.points, axis)])),
    meanWeights: Object.fromEntries(set.geometry.adjacencyKey.map((edge) => [
      edge.name,
      finite(set.meanWeights[edge.name], `Shared-set ${edge.name} mean weight`),
    ])),
  };
}

export function compareAnalysisSets(
  primary: OpenEnaAnalysisSet,
  secondary: OpenEnaAnalysisSet,
  selectedAxes: readonly string[] = primary.geometry.dimensions.slice(0, 2),
  createdAt = new Date().toISOString(),
): OpenEnaSharedComparison {
  const errors = validateOpenEnaSharedGeometry(primary, secondary, selectedAxes);
  if (errors.length) throw new Error(errors.join(" "));
  const axes: [string, string] = [selectedAxes[0], selectedAxes[1]];
  canonicalTimestamp(createdAt, "Shared-set comparison time");
  const primarySummary = comparisonSide(primary, axes);
  const secondarySummary = comparisonSide(secondary, axes);
  const nodes = primary.geometry.codes.map((code) => {
    const row = primary.geometry.nodes.find((candidate) => String(candidate.code) === code);
    if (!row) throw new Error(`Shared reference geometry is missing node ${code}.`);
    return {
      code,
      x: finite(row[axes[0]], `Shared node ${code} ${axes[0]}`),
      y: finite(row[axes[1]], `Shared node ${code} ${axes[1]}`),
    };
  });
  const edges = primary.geometry.adjacencyKey.map((edge) => {
    const primaryWeight = primarySummary.meanWeights[edge.name];
    const secondaryWeight = secondarySummary.meanWeights[edge.name];
    const signedDifference = primaryWeight - secondaryWeight;
    return {
      source: edge.source,
      target: edge.target,
      name: edge.name,
      primaryWeight,
      secondaryWeight,
      signedDifference,
      stronger: Math.abs(signedDifference) <= 1e-12
        ? "equal" as const
        : signedDifference > 0
          ? "primary" as const
          : "secondary" as const,
    };
  });
  return {
    referenceId: primary.geometry.referenceId,
    reference: compactReference(primary),
    axes,
    geometry: cloneJson(primary.geometry),
    nodes,
    primary: primarySummary,
    secondary: secondarySummary,
    edges,
    createdAt,
  };
}

export function buildOpenEnaSharedComparison(
  primary: OpenEnaAnalysisSet,
  secondary: OpenEnaAnalysisSet,
  axes?: readonly string[],
  createdAt?: string,
) {
  return compareAnalysisSets(primary, secondary, axes, createdAt);
}

export function buildSetComparisonExport(comparison: OpenEnaSharedComparison) {
  return {
    schemaVersion: 1 as const,
    kind: "open-ena-shared-set-comparison" as const,
    app: "ENA.HK Open ENA" as const,
    runtime: "jena-js" as const,
    runtimeVersion: JENA_RUNTIME_VERSION,
    reference: {
      ...cloneJson(comparison.reference),
      geometry: cloneJson(comparison.geometry),
    },
    sets: [comparison.primary, comparison.secondary].map((set) => ({
      id: set.setId,
      name: set.name,
      role: set.role,
      capturedAt: set.capturedAt,
      dataset: cloneJson(set.dataset),
      configuration: cloneConfig(set.config),
    })),
    selectedAxes: [...comparison.axes] as [string, string],
    createdAt: comparison.createdAt,
    comparison: {
      nodes: cloneJson(comparison.nodes),
      primary: cloneJson(comparison.primary),
      secondary: cloneJson(comparison.secondary),
      edges: cloneJson(comparison.edges),
    },
    boundaries: [
      "Primary-minus-Secondary differences are descriptive and do not imply statistical significance or causality.",
      "The export excludes raw source rows and row-level co-occurrence records but retains analytic-unit identifiers and selected group metadata.",
      "Both sets were compared only after exact reference geometry and accumulation semantics matched.",
    ],
  };
}

export function buildOpenEnaSharedComparisonBundle(
  primary: OpenEnaAnalysisSet,
  secondary: OpenEnaAnalysisSet,
  axes?: readonly string[],
  createdAt?: string,
) {
  return buildSetComparisonExport(compareAnalysisSets(primary, secondary, axes, createdAt));
}

export function setComparisonEdgesToCsv(comparison: OpenEnaSharedComparison) {
  return rowsToCsv(comparison.edges.map((edge) => ({
    referenceId: comparison.referenceId,
    primarySetId: comparison.primary.setId,
    secondarySetId: comparison.secondary.setId,
    source: edge.source,
    target: edge.target,
    name: edge.name,
    primaryWeight: edge.primaryWeight,
    secondaryWeight: edge.secondaryWeight,
    signedDifference: edge.signedDifference,
    stronger: edge.stronger,
  })));
}

export function openEnaSharedEdgesToCsv(comparison: OpenEnaSharedComparison) {
  return setComparisonEdgesToCsv(comparison);
}

export function repairSetSelection(
  sets: OpenEnaAnalysisSet[],
  selection: OpenEnaSetSelection,
): OpenEnaSetSelection {
  const requestedPrimary = sets.find((set) => set.id === selection.primarySetId) ?? sets[0] ?? null;
  if (!requestedPrimary) return { primarySetId: null, secondarySetId: null };
  const requestedSecondary = sets.find((set) => (
    set.id === selection.secondarySetId
    && set.id !== requestedPrimary.id
    && haveCompatibleSetGeometry(requestedPrimary, set)
  ));
  const fallbackSecondary = sets.find((set) => (
    set.id !== requestedPrimary.id
    && haveCompatibleSetGeometry(requestedPrimary, set)
  ));
  return {
    primarySetId: requestedPrimary.id,
    secondarySetId: (requestedSecondary ?? fallbackSecondary)?.id ?? null,
  };
}

export function repairOpenEnaSetSelection(
  sets: OpenEnaAnalysisSet[],
  primarySetId: string | null,
  secondarySetId: string | null,
) {
  return repairSetSelection(sets, { primarySetId, secondarySetId });
}
