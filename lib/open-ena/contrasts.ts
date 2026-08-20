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
  type DatasetHashKind,
  type OpenEnaConfig,
  type OpenEnaProjectionReference,
  type OpenEnaReferenceFit,
  type OpenEnaResult,
} from "./types";
import {
  marginalMeanIntervalPair,
  marginalMeanStudentT95,
  type OpenEnaMarginalMeanIntervalPair,
} from "./uncertainty";

export const PAIRWISE_MANN_WHITNEY_METHOD = "Mann-Whitney U for the first selected group; two-sided auto exact-first inference with 12-significant-digit average ranks, fixed-size exact rank permutations through total N=50, and a tie-corrected normal approximation with a 0.5 continuity correction above that boundary";
export const LEGACY_PAIRWISE_MANN_WHITNEY_METHOD = "Mann-Whitney U for the first selected group; two-sided normal approximation with average ranks, tie-corrected variance, and a 0.5 continuity correction";
export type PairwiseMannWhitneyMethod =
  | typeof PAIRWISE_MANN_WHITNEY_METHOD
  | typeof LEGACY_PAIRWISE_MANN_WHITNEY_METHOD;
export const PAIRWISE_MANN_WHITNEY_EFFECT_DEFINITION = "r_rb(primary vs secondary) = 2 * U(primary) / (nPrimary * nSecondary) - 1; positive values indicate higher ranks in the primary selected group";
export const WEB_ENA_MAX_POSITION_MODIFIER = 1.2;
export const PAIRWISE_CONTRAST_BOUNDARIES = [
  "Primary-minus-Secondary network differences and group mean positions are descriptive; they do not establish statistical significance or causality.",
  "Mann-Whitney inference is ENA.HK post-projection inference on the two selected axes, not a jENA statistic; no multiplicity correction is applied across axes or repeated pair selections.",
  "Endpoint analytic units are the independent observations assumed by the descriptive means and Mann-Whitney calculations.",
  "The plotted uncertainty guides are two separate marginal 95% Student-t confidence intervals for arithmetic mean endpoint-unit coordinates on the displayed axes; they are not a joint two-dimensional confidence region or a significance test.",
  "Raw source rows and row-level co-occurrence records are excluded; preserve the exact source coded-data file, its codebook, and the enclosing ENA manifest with its analyzed-table hash and hashKind for reproducibility.",
  "An absent analyzed-table SHA-256 means the result did not carry an immutable browser provenance binding; it is not evidence that two results came from the same analyzed table.",
  "Imported reference names, analyzed-table hashes, timestamps, and fit descriptors are declared provenance and are not independently authenticated by this comparison.",
] as const;

export interface OpenEnaPairwiseContrastSide {
  name: string;
  /** Stable group-identity color inherited from the fitted ENA result. */
  color?: string;
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
  meanConfidenceIntervals?: OpenEnaMarginalMeanIntervalPair;
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
  /**
   * webENA's display-only square camera frame. Fitted coordinates remain raw
   * in every result/export table; endpoint points, group means, and their
   * marginal guides are multiplied by pointScaleFactor only while rendering.
   */
  officialPlotFrame?: {
    source: "webena-points-rotated-scaled";
    pointScaleFactor: number;
    maxPosition: number;
    extremePosition: number;
  };
  configuration: OpenEnaConfig;
  resultProvenance: {
    analyzedAt: string;
    model: "EndPoint";
    dimensions: string[];
    sourceDatasetNormalizedUtf8TextSha256: string | null;
    sourceDatasetHashKind?: DatasetHashKind;
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
    method: PairwiseMannWhitneyMethod;
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
  showGroupLabels?: boolean;
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
  groupColumn: string,
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
  // Confidence guides are part of the plotted evidence. Include every
  // declared group's marginal interval in the shared frame so changing the
  // selected pair never clips a guide or silently rescales the geometry.
  for (const group of result.groups) {
    const groupPoints = result.set.points
      .filter((row) => String(row[groupColumn] ?? "") === group.name)
      .map((row) => ({
        x: typeof row[axes[0]] === "number" ? row[axes[0]] as number : Number.NaN,
        y: typeof row[axes[1]] === "number" ? row[axes[1]] as number : Number.NaN,
      }));
    const intervals = marginalMeanIntervalPair(groupPoints, axes);
    if (intervals.x.status === "estimable" && intervals.y.status === "estimable") {
      coordinates.push(
        { x: intervals.x.lower, y: intervals.y.lower },
        { x: intervals.x.lower, y: intervals.y.upper },
        { x: intervals.x.upper, y: intervals.y.lower },
        { x: intervals.x.upper, y: intervals.y.upper },
      );
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

function finiteValues(values: unknown[]) {
  return values
    .map((value) => Number(value))
    .filter((value): value is number => Number.isFinite(value));
}

function officialPointPositionScale(
  result: OpenEnaResult,
  axes: readonly [string, string],
) {
  const ratios = (kind: "min" | "max") => axes.flatMap((axis) => {
    const pointValues = finiteValues(result.set.points.map((row) => row[axis]));
    const nodeValues = finiteValues((result.set.rotation.nodes ?? []).map((row) => row[axis]));
    if (!pointValues.length || !nodeValues.length) return [];
    const pointExtreme = kind === "min" ? Math.min(...pointValues) : Math.max(...pointValues);
    const nodeExtreme = kind === "min" ? Math.min(...nodeValues) : Math.max(...nodeValues);
    if (Math.abs(pointExtreme) <= 1e-12) return [];
    const ratio = nodeExtreme / pointExtreme;
    return Number.isFinite(ratio) ? [ratio] : [];
  });
  const minimumRatios = ratios("min");
  const maximumRatios = ratios("max");
  if (!minimumRatios.length || !maximumRatios.length) return 1;
  const scale = Math.min(
    Math.abs(Math.max(...minimumRatios)),
    Math.abs(Math.max(...maximumRatios)),
  );
  return Number.isFinite(scale) && scale > 1e-12 ? scale : 1;
}

function fullRotatedPointCoordinates(result: OpenEnaResult) {
  const matrix = result.set.rotation.rotationMatrix;
  const columns = result.set.codeColumns;
  const dimensionCount = result.set.rotation.rotationColumns.length;
  if (matrix.length !== columns.length || dimensionCount <= 0) return null;
  return result.set.pointsForProjection.map((point) => Array.from(
    { length: dimensionCount },
    (_, dimension) => {
      let coordinate = 0;
      for (let edge = 0; edge < columns.length; edge += 1) {
        const pointValue = Number(point[columns[edge]]);
        const rotationValue = Number(matrix[edge]?.[dimension]);
        if (!Number.isFinite(pointValue) || !Number.isFinite(rotationValue)) {
          return Number.NaN;
        }
        coordinate += pointValue * rotationValue;
      }
      return coordinate;
    },
  ));
}

function fullRotatedPointMaximum(
  result: OpenEnaResult,
  fullCoordinates: number[][] | null,
) {
  let maximum = 0;
  for (const coordinates of fullCoordinates ?? []) {
    for (const coordinate of coordinates) {
      if (Number.isFinite(coordinate)) maximum = Math.max(maximum, Math.abs(coordinate));
    }
  }
  if (maximum > 1e-12) return maximum;
  return result.set.points.reduce((outerMaximum, point) => Math.max(
    outerMaximum,
    ...result.dimensions.map((dimension) => {
      const value = Number(point[dimension]);
      return Number.isFinite(value) ? Math.abs(value) : 0;
    }),
  ), 0);
}

function fullRotatedGroupConfidenceMaximum(
  result: OpenEnaResult,
  groupColumn: string,
  fullCoordinates: number[][] | null,
) {
  const declaredGroups = new Set(result.groups.map((group) => group.name));
  const groupByUnit = new Map<string, string>();
  for (const point of result.set.points) {
    const groupName = String(point[groupColumn] ?? "");
    const unitId = String(point.ENA_UNIT ?? "");
    if (unitId && declaredGroups.has(groupName)) groupByUnit.set(unitId, groupName);
  }
  const sourceRows = fullCoordinates ? result.set.pointsForProjection : result.set.points;
  const coordinateRows = fullCoordinates ?? result.set.points.map((point) => result.dimensions.map(
    (dimension) => Number(point[dimension]),
  ));
  const dimensionCount = coordinateRows[0]?.length ?? 0;
  const groupCoordinates = new Map(
    [...declaredGroups].map((groupName) => [
      groupName,
      Array.from({ length: dimensionCount }, () => [] as number[]),
    ]),
  );
  for (const [index, row] of sourceRows.entries()) {
    const directGroupName = String(row[groupColumn] ?? "");
    const groupName = declaredGroups.has(directGroupName)
      ? directGroupName
      : groupByUnit.get(String(row.ENA_UNIT ?? ""));
    const perDimension = groupName ? groupCoordinates.get(groupName) : undefined;
    if (!perDimension) continue;
    for (let dimension = 0; dimension < dimensionCount; dimension += 1) {
      perDimension[dimension].push(coordinateRows[index]?.[dimension] ?? Number.NaN);
    }
  }
  let maximum = 0;
  for (const perDimension of groupCoordinates.values()) {
    for (const values of perDimension) {
      const interval = marginalMeanStudentT95(values);
      if (interval.status === "estimable") {
        maximum = Math.max(maximum, Math.abs(interval.lower), Math.abs(interval.upper));
      }
    }
  }
  return maximum;
}

function officialWebEnaPlotFrame(
  result: OpenEnaResult,
  groupColumn: string,
) {
  const defaultAxes = result.dimensions.slice(0, 2) as [string, string];
  const pointScaleFactor = officialPointPositionScale(result, defaultAxes);
  const fullCoordinates = fullRotatedPointCoordinates(result);
  const scaledPointMaximum = fullRotatedPointMaximum(result, fullCoordinates) * pointScaleFactor;
  const confidenceMaximum = fullRotatedGroupConfidenceMaximum(
    result,
    groupColumn,
    fullCoordinates,
  ) * pointScaleFactor;
  const rawMaximum = Math.max(scaledPointMaximum, confidenceMaximum);
  const fallbackNodeMaximum = (result.set.rotation.nodes ?? []).reduce((maximum, node) => Math.max(
    maximum,
    ...defaultAxes.map((axis) => {
      const value = Number(node[axis]);
      return Number.isFinite(value) ? Math.abs(value) : 0;
    }),
  ), 0);
  const maxPosition = rawMaximum > 1e-12 ? rawMaximum : Math.max(fallbackNodeMaximum, 1);
  return {
    source: "webena-points-rotated-scaled" as const,
    pointScaleFactor,
    maxPosition,
    extremePosition: maxPosition * WEB_ENA_MAX_POSITION_MODIFIER,
  };
}

function buildSide(
  result: OpenEnaResult,
  groupColumn: string,
  groupName: string,
  axes: [string, string],
  color?: string,
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
  const points = pointRows.map((row) => ({
    unitId: String(row.ENA_UNIT),
    group: groupName,
    x: finite(row[axes[0]], `${groupName} ${axes[0]} coordinate`),
    y: finite(row[axes[1]], `${groupName} ${axes[1]} coordinate`),
  }));
  return {
    name: groupName,
    color,
    unitCount: pointUnits.size,
    unitIds: [...pointUnits],
    points,
    meanPoint: Object.fromEntries(axes.map((axis) => [
      axis,
      equalUnitMean(pointRows, axis, `${groupName} endpoint coordinates`),
    ])),
    meanWeights: Object.fromEntries(result.set.adjacencyKey.map((edge) => [
      edge.name,
      equalUnitMean(lineRows, edge.name, `${groupName} endpoint network`),
    ])),
    meanConfidenceIntervals: marginalMeanIntervalPair(points, axes),
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
  const primary = buildSide(
    result,
    config.groupColumn,
    primaryGroup,
    axes,
    result.groups.find((group) => group.name === primaryGroup)?.color,
  );
  const secondary = buildSide(
    result,
    config.groupColumn,
    secondaryGroup,
    axes,
    result.groups.find((group) => group.name === secondaryGroup)?.color,
  );
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
  const coordinateExtent = fullResultCoordinateExtent(result, axes, nodes, config.groupColumn);
  const officialPlotFrame = officialWebEnaPlotFrame(result, config.groupColumn);
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
    officialPlotFrame,
    configuration: cloneConfig(config),
    resultProvenance: {
      analyzedAt: result.analyzedAt,
      model: "EndPoint",
      dimensions,
      sourceDatasetNormalizedUtf8TextSha256: sourceHash?.toLowerCase() ?? null,
      ...(result.provenanceBinding?.datasetHashKind
        ? { sourceDatasetHashKind: result.provenanceBinding.datasetHashKind }
        : {}),
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
        showGroupLabels: presentationOptions.showGroupLabels ?? true,
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
    officialPlotFrame: contrast.officialPlotFrame ? { ...contrast.officialPlotFrame } : null,
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
