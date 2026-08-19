import type { Row } from "jena-js";
import { rowsToCsv } from "./export";
import {
  mannWhitneyU,
  MANN_WHITNEY_PROVENANCE,
  type MannWhitneyDimensionRow,
} from "./inference";
import {
  JENA_RUNTIME_VERSION,
  sameOpenEnaConfig,
  type OpenEnaConfig,
  type OpenEnaProjectionReference,
  type OpenEnaReferenceFit,
  type OpenEnaResult,
} from "./types";

export const PAIRWISE_MANN_WHITNEY_METHOD = "Mann-Whitney U for the first selected group; two-sided normal approximation with average ranks, tie-corrected variance, and a 0.5 continuity correction";
export const PAIRWISE_MANN_WHITNEY_EFFECT_DEFINITION = "r_rb(primary vs secondary) = 2 * U(primary) / (nPrimary * nSecondary) - 1; positive values indicate higher ranks in the primary selected group";
export const PAIRWISE_CONTRAST_BOUNDARIES = [
  "Primary-minus-Secondary network differences and group mean positions are descriptive; they do not establish statistical significance or causality.",
  "Mann-Whitney inference is ENA.HK post-projection inference on the two selected axes, not a jENA statistic; no multiplicity correction is applied across axes or repeated pair selections.",
  "Endpoint analytic units are the independent observations assumed by the descriptive means and Mann-Whitney calculations.",
  "Raw source rows and row-level co-occurrence records are excluded; preserve the exact source CSV, its codebook, and the enclosing ENA manifest with its dataset hash for reproducibility.",
  "An absent source SHA-256 means the result did not carry an immutable browser provenance binding; it is not evidence that two results came from the same source.",
  "Imported reference names, source hashes, timestamps, and fit descriptors are declared provenance and are not independently authenticated by this comparison.",
] as const;

export interface OpenEnaPairwiseContrastSide {
  name: string;
  unitCount: number;
  unitIds: string[];
  points: Array<{
    unitId: string;
    group: string;
    x: number;
    y: number;
  }>;
  meanPoint: Record<string, number>;
  meanWeights: Record<string, number>;
}

export interface OpenEnaPairwiseContrast {
  groupColumn: string;
  declaredGroups: Array<{ name: string; unitCount: number; pointCount: number }>;
  groupOrder: [string, string];
  axes: [string, string];
  /** Fixed domain from all finite endpoint points plus nodes on the selected axes. */
  coordinateExtent: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  configuration: OpenEnaConfig;
  resultProvenance: {
    analyzedAt: string;
    model: "EndPoint";
    dimensions: string[];
    sourceDatasetNormalizedUtf8TextSha256: string | null;
    sourceBindingStatus: "bound" | "not-present";
    projectionReference: OpenEnaProjectionReference | null;
    rotationMethod: OpenEnaConfig["rotation"];
    referenceId: string | null;
    fit: OpenEnaReferenceFit;
  };
  geometry: {
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
    variance: Record<string, number>;
    nodes: Array<{ code: string; coordinates: Record<string, number> }>;
  };
  primary: OpenEnaPairwiseContrastSide;
  secondary: OpenEnaPairwiseContrastSide;
  nodes: Array<{ code: string; x: number; y: number }>;
  edges: Array<{
    source: string;
    target: string;
    name: string;
    primaryWeight: number;
    secondaryWeight: number;
    signedDifference: number;
    stronger: "primary" | "secondary" | "equal";
  }>;
  edgeScaleDenominators: {
    difference: number;
    sharedMean: number;
    differenceDefinition: "maximum absolute Primary-minus-Secondary edge difference";
    sharedMeanDefinition: "shared maximum absolute Primary or Secondary mean edge weight";
  };
  inference: {
    status: "available";
    provenance: typeof MANN_WHITNEY_PROVENANCE;
    method: typeof PAIRWISE_MANN_WHITNEY_METHOD;
    effectDefinition: typeof PAIRWISE_MANN_WHITNEY_EFFECT_DEFINITION;
    multiplicityCorrection: "none";
    groupOrder: [string, string];
    rows: MannWhitneyDimensionRow[];
  };
  createdAt: string;
  boundaries: string[];
}

export interface OpenEnaPairwiseContrastPresentationOptions {
  flipX?: boolean;
  flipY?: boolean;
  edgeThreshold?: number;
  showNetworks?: boolean;
  showPoints?: boolean;
  showLabels?: boolean;
  showUnitLabels?: boolean;
  showVariance?: boolean;
  edgeScale?: number;
  pointScale?: number;
  plotZoom?: number;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneConfig(config: OpenEnaConfig): OpenEnaConfig {
  return {
    ...config,
    unitColumns: [...config.unitColumns],
    conversationColumns: [...config.conversationColumns],
    codes: [...config.codes],
  };
}

function finite(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function rowsForGroup(rows: Row[], groupColumn: string, groupName: string) {
  return rows.filter((row) => String(row[groupColumn] ?? "") === groupName);
}

function valuesByUnit(rows: Row[], column: string, label: string) {
  const byUnit = new Map<string, number[]>();
  for (const [index, row] of rows.entries()) {
    const unitId = String(row.ENA_UNIT ?? "");
    if (!unitId) throw new Error(`${label} row ${index + 1} is missing ENA_UNIT.`);
    const values = byUnit.get(unitId) ?? [];
    values.push(finite(row[column], `${label} ${column}`));
    byUnit.set(unitId, values);
  }
  return byUnit;
}

function equalUnitMean(rows: Row[], column: string, label: string) {
  const byUnit = valuesByUnit(rows, column, label);
  if (!byUnit.size) throw new Error(`${label} has no analytic units.`);
  let total = 0;
  for (const values of byUnit.values()) {
    total += values.reduce((sum, value) => sum + value, 0) / values.length;
  }
  return total / byUnit.size;
}

function fullResultCoordinateExtent(
  result: OpenEnaResult,
  axes: [string, string],
  nodes: Array<{ x: number; y: number }>,
) {
  const coordinates = nodes.map(({ x, y }) => ({ x, y }));
  for (const row of result.set.points) {
    const x = row[axes[0]];
    const y = row[axes[1]];
    if (typeof x === "number" && Number.isFinite(x)
      && typeof y === "number" && Number.isFinite(y)) {
      coordinates.push({ x, y });
    }
  }
  if (!coordinates.length) {
    throw new Error("The current ENA result has no finite endpoint-point or node geometry for the selected axes.");
  }
  return {
    minX: Math.min(...coordinates.map(({ x }) => x)),
    maxX: Math.max(...coordinates.map(({ x }) => x)),
    minY: Math.min(...coordinates.map(({ y }) => y)),
    maxY: Math.max(...coordinates.map(({ y }) => y)),
  };
}

function buildSide(
  result: OpenEnaResult,
  groupColumn: string,
  groupName: string,
  axes: [string, string],
): OpenEnaPairwiseContrastSide {
  const pointRows = rowsForGroup(result.set.points, groupColumn, groupName);
  const lineRows = rowsForGroup(result.set.lineWeights, groupColumn, groupName);
  if (!pointRows.length || !lineRows.length) {
    throw new Error(`Selected group ${groupName} must contain endpoint coordinates and network weights.`);
  }
  const pointUnitIds = pointRows.map((row) => String(row.ENA_UNIT ?? ""));
  const lineUnitIds = lineRows.map((row) => String(row.ENA_UNIT ?? ""));
  const pointUnits = new Set(pointUnitIds);
  const lineUnits = new Set(lineUnitIds);
  if (pointUnits.has("") || lineUnits.has("")
    || pointUnits.size !== pointRows.length
    || lineUnits.size !== lineRows.length
    || pointUnits.size !== lineUnits.size
    || [...pointUnits].some((unitId) => !lineUnits.has(unitId))) {
    throw new Error(`Selected group ${groupName} must have exactly one coordinate row and one network row per endpoint analytic unit.`);
  }
  return {
    name: groupName,
    unitCount: pointUnits.size,
    unitIds: [...pointUnits],
    points: pointRows.map((row) => ({
      unitId: String(row.ENA_UNIT),
      group: groupName,
      x: finite(row[axes[0]], `${groupName} ${axes[0]} coordinate`),
      y: finite(row[axes[1]], `${groupName} ${axes[1]} coordinate`),
    })),
    meanPoint: Object.fromEntries(axes.map((axis) => [
      axis,
      equalUnitMean(pointRows, axis, `${groupName} endpoint coordinates`),
    ])),
    meanWeights: Object.fromEntries(result.set.adjacencyKey.map((edge) => [
      edge.name,
      equalUnitMean(lineRows, edge.name, `${groupName} endpoint network`),
    ])),
  };
}

export function buildPairwiseGroupContrast(
  result: OpenEnaResult,
  config: OpenEnaConfig,
  primaryGroup: string,
  secondaryGroup: string,
  selectedAxes: readonly string[] = result.dimensions.slice(0, 2),
  createdAt = new Date().toISOString(),
): OpenEnaPairwiseContrast {
  if (result.set.modelType !== "EndPoint" || config.model !== "EndPoint") {
    throw new Error("Pairwise group contrasts require an endpoint ENA result and endpoint configuration.");
  }
  if (!config.groupColumn) throw new Error("Pairwise group contrasts require a comparison-group column.");
  if (result.provenanceBinding && !sameOpenEnaConfig(result.provenanceBinding.configuration, config)) {
    throw new Error("The result provenance binding does not match the supplied configuration.");
  }
  const sourceHash = result.provenanceBinding?.datasetNormalizedUtf8TextSha256 ?? null;
  if (sourceHash !== null && !/^[0-9a-f]{64}$/iu.test(sourceHash)) {
    throw new Error("The result provenance binding must contain a 64-character source dataset SHA-256 value.");
  }
  if (config.codes.length !== result.set.rotation.codes.length
    || config.codes.some((code, index) => code !== result.set.rotation.codes[index])) {
    throw new Error("The supplied configuration code order does not match the current result geometry.");
  }
  if (result.projectionReference) {
    if (config.rotation !== "reference" || config.referenceRotationId !== result.projectionReference.referenceId) {
      throw new Error("The supplied configuration does not match the result reference provenance.");
    }
  } else if (config.rotation === "reference" || config.referenceRotationId !== null) {
    throw new Error("The supplied configuration declares a reference that is absent from the result provenance.");
  }
  const declaredGroups = result.groups.map((group) => group.name);
  if (declaredGroups.length < 2 || declaredGroups.length > 6) {
    throw new Error("Pairwise group contrasts require an ENA result with 2 to 6 declared groups.");
  }
  if (new Set(declaredGroups).size !== declaredGroups.length) {
    throw new Error("Declared ENA result group names must be unique so pairwise selection is unambiguous.");
  }
  if (primaryGroup === secondaryGroup) throw new Error("Choose two distinct groups for a pairwise contrast.");
  if (!declaredGroups.includes(primaryGroup) || !declaredGroups.includes(secondaryGroup)) {
    throw new Error("Each selected group name must exactly match a declared ENA result group.");
  }
  if (selectedAxes.length !== 2 || selectedAxes[0] === selectedAxes[1]
    || selectedAxes.some((axis) => !result.dimensions.includes(axis))) {
    throw new Error("Choose two distinct axes available in the current ENA result geometry.");
  }
  const parsedTime = Date.parse(createdAt);
  if (!Number.isFinite(parsedTime) || new Date(parsedTime).toISOString() !== createdAt) {
    throw new Error("Pairwise contrast time must be a canonical ISO timestamp.");
  }
  const analyzedTime = Date.parse(result.analyzedAt);
  if (!Number.isFinite(analyzedTime) || new Date(analyzedTime).toISOString() !== result.analyzedAt) {
    throw new Error("The ENA result analysis time must be a canonical ISO timestamp.");
  }
  const axes: [string, string] = [selectedAxes[0], selectedAxes[1]];
  const primary = buildSide(result, config.groupColumn, primaryGroup, axes);
  const secondary = buildSide(result, config.groupColumn, secondaryGroup, axes);
  const secondaryUnits = new Set(secondary.unitIds);
  if (primary.unitIds.some((unitId) => secondaryUnits.has(unitId))) {
    throw new Error("Each endpoint analytic unit must belong to exactly one selected group; Primary and Secondary unit populations overlap.");
  }
  const nodes = result.set.rotation.codes.map((code) => {
    const node = result.set.rotation.nodes?.find((candidate) => String(candidate.code) === code);
    if (!node) throw new Error(`Current result geometry is missing the node for code ${code}.`);
    return {
      code,
      x: finite(node[axes[0]], `Node ${code} ${axes[0]}`),
      y: finite(node[axes[1]], `Node ${code} ${axes[1]}`),
    };
  });
  const coordinateExtent = fullResultCoordinateExtent(result, axes, nodes);
  const edges = result.set.adjacencyKey.map((edge) => {
    const primaryWeight = primary.meanWeights[edge.name];
    const secondaryWeight = secondary.meanWeights[edge.name];
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
  const edgeScaleDenominators = {
    difference: edges.reduce((maximum, edge) => Math.max(maximum, Math.abs(edge.signedDifference)), 0),
    sharedMean: edges.reduce((maximum, edge) => Math.max(
      maximum,
      Math.abs(edge.primaryWeight),
      Math.abs(edge.secondaryWeight),
    ), 0),
    differenceDefinition: "maximum absolute Primary-minus-Secondary edge difference" as const,
    sharedMeanDefinition: "shared maximum absolute Primary or Secondary mean edge weight" as const,
  };
  const inferenceRows = axes.map((dimension): MannWhitneyDimensionRow => ({
    dimension,
    ...mannWhitneyU(
      rowsForGroup(result.set.points, config.groupColumn!, primaryGroup)
        .map((row) => finite(row[dimension], `${primaryGroup} ${dimension}`)),
      rowsForGroup(result.set.points, config.groupColumn!, secondaryGroup)
        .map((row) => finite(row[dimension], `${secondaryGroup} ${dimension}`)),
    ),
  }));
  const dimensions = [...result.dimensions];
  const geometry = {
    codes: [...result.set.rotation.codes],
    dimensions,
    adjacencyKey: result.set.adjacencyKey.map((edge) => ({
      source: edge.source,
      target: edge.target,
      name: edge.name,
      sourceIndex: edge.sourceIndex,
      targetIndex: edge.targetIndex,
    })),
    rotationColumns: [...result.set.rotation.rotationColumns],
    rotationMatrix: result.set.rotation.rotationMatrix.map((row) => row.map((value) => finite(value, "Rotation matrix value"))),
    eigenvalues: result.set.rotation.eigenvalues.map((value) => finite(value, "Rotation eigenvalue")),
    centerVector: result.set.rotation.centerVector.map((value) => finite(value, "Rotation center value")),
    variance: Object.fromEntries(dimensions.map((dimension) => [
      dimension,
      finite(result.set.variance[dimension], `Result variance ${dimension}`),
    ])),
    nodes: result.set.rotation.codes.map((code) => {
      const node = result.set.rotation.nodes?.find((candidate) => String(candidate.code) === code);
      if (!node) throw new Error(`Current result geometry is missing the node for code ${code}.`);
      return {
        code,
        coordinates: Object.fromEntries(dimensions.map((dimension) => [
          dimension,
          finite(node[dimension], `Node ${code} ${dimension}`),
        ])),
      };
    }),
  };
  const fit: OpenEnaReferenceFit = result.projectionReference
    ? cloneJson(result.projectionReference.fit)
    : config.rotation === "mean"
      ? {
          method: "mean",
          unitColumns: [...config.unitColumns],
          conversationColumns: [...config.conversationColumns],
          groupColumn: config.groupColumn,
          groupOrder: [result.groups[0].name, result.groups[1].name],
        }
      : {
          method: "svd",
          unitColumns: [...config.unitColumns],
          conversationColumns: [...config.conversationColumns],
        };

  return {
    groupColumn: config.groupColumn,
    declaredGroups: result.groups.map((group) => ({
      name: group.name,
      unitCount: group.count,
      pointCount: group.pointCount,
    })),
    groupOrder: [primaryGroup, secondaryGroup],
    axes,
    coordinateExtent,
    configuration: cloneConfig(config),
    resultProvenance: {
      analyzedAt: result.analyzedAt,
      model: "EndPoint",
      dimensions,
      sourceDatasetNormalizedUtf8TextSha256: sourceHash?.toLowerCase() ?? null,
      sourceBindingStatus: result.provenanceBinding ? "bound" : "not-present",
      projectionReference: result.projectionReference ? cloneJson(result.projectionReference) : null,
      rotationMethod: config.rotation,
      referenceId: result.projectionReference?.referenceId ?? null,
      fit,
    },
    geometry,
    primary,
    secondary,
    nodes,
    edges,
    edgeScaleDenominators,
    inference: {
      status: "available",
      provenance: MANN_WHITNEY_PROVENANCE,
      method: PAIRWISE_MANN_WHITNEY_METHOD,
      effectDefinition: PAIRWISE_MANN_WHITNEY_EFFECT_DEFINITION,
      multiplicityCorrection: "none",
      groupOrder: [primaryGroup, secondaryGroup],
      rows: inferenceRows,
    },
    createdAt,
    boundaries: [...PAIRWISE_CONTRAST_BOUNDARIES],
  };
}

export function buildPairwiseGroupContrastExport(
  contrast: OpenEnaPairwiseContrast,
  presentationOptions?: OpenEnaPairwiseContrastPresentationOptions,
) {
  const finiteOr = (value: number | undefined, fallback: number) => (
    typeof value === "number" && Number.isFinite(value) ? value : fallback
  );
  const presentation = presentationOptions
    ? {
        selectedAxes: [...contrast.axes] as [string, string],
        flipX: presentationOptions.flipX ?? false,
        flipY: presentationOptions.flipY ?? false,
        edgeThreshold: finiteOr(presentationOptions.edgeThreshold, 0),
        showNetworks: presentationOptions.showNetworks ?? true,
        showPoints: presentationOptions.showPoints ?? true,
        showLabels: presentationOptions.showLabels ?? true,
        showUnitLabels: presentationOptions.showUnitLabels ?? false,
        showVariance: presentationOptions.showVariance ?? true,
        edgeScale: finiteOr(presentationOptions.edgeScale, 1),
        pointScale: finiteOr(presentationOptions.pointScale, 1),
        plotZoom: finiteOr(presentationOptions.plotZoom, 1),
        statisticsCoordinateSystem: "unflipped model coordinates" as const,
        thresholdDefinitions: {
          comparison: "edgeThreshold is relative to the maximum absolute Primary-minus-Secondary edge difference",
          sideNetworks: "edgeThreshold is relative to the shared maximum absolute Primary or Secondary mean edge weight",
        },
        edgeScaleDenominators: { ...contrast.edgeScaleDenominators },
      }
    : null;
  return {
    schemaVersion: 1 as const,
    kind: "open-ena-pairwise-group-contrast" as const,
    app: "ENA.HK Open ENA" as const,
    runtime: "jena-js" as const,
    runtimeVersion: JENA_RUNTIME_VERSION,
    groupColumn: contrast.groupColumn,
    declaredGroups: cloneJson(contrast.declaredGroups),
    groupOrder: [...contrast.groupOrder] as [string, string],
    selectedAxes: [...contrast.axes] as [string, string],
    coordinateExtent: { ...contrast.coordinateExtent },
    edgeScaleDenominators: { ...contrast.edgeScaleDenominators },
    configuration: cloneConfig(contrast.configuration),
    resultProvenance: cloneJson(contrast.resultProvenance),
    geometry: cloneJson(contrast.geometry),
    comparison: {
      primary: cloneJson(contrast.primary),
      secondary: cloneJson(contrast.secondary),
      nodes: cloneJson(contrast.nodes),
      edges: cloneJson(contrast.edges),
    },
    inference: cloneJson(contrast.inference),
    presentation,
    createdAt: contrast.createdAt,
    boundaries: [...contrast.boundaries],
  };
}

export function pairwiseGroupContrastEdgesToCsv(contrast: OpenEnaPairwiseContrast) {
  const configurationJson = JSON.stringify(contrast.configuration);
  const resultProvenanceJson = JSON.stringify(contrast.resultProvenance);
  const boundariesJson = JSON.stringify(contrast.boundaries);
  return rowsToCsv(contrast.edges.map((edge) => ({
    primaryGroup: contrast.groupOrder[0],
    secondaryGroup: contrast.groupOrder[1],
    xAxis: contrast.axes[0],
    yAxis: contrast.axes[1],
    groupColumn: contrast.groupColumn,
    differenceScaleDenominator: contrast.edgeScaleDenominators.difference,
    sharedMeanScaleDenominator: contrast.edgeScaleDenominators.sharedMean,
    configurationJson,
    resultProvenanceJson,
    boundariesJson,
    source: edge.source,
    target: edge.target,
    name: edge.name,
    primaryWeight: edge.primaryWeight,
    secondaryWeight: edge.secondaryWeight,
    signedDifference: edge.signedDifference,
    stronger: edge.stronger,
  })));
}
