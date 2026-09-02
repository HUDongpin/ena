import { OPEN_ENA_CAPABILITIES, openEnaAnalysisKindFromResult, type OpenEnaCapability } from "@/lib/open-ena/capabilities";
import { serializeOpenEnaConfig } from "@/lib/open-ena/network-config";
import type { OpenEnaConfig, OpenEnaResult, PortableOpenEnaConfig } from "@/lib/open-ena/types";

export const OPEN_ENA_PLUGIN_CORE_API_VERSION = "1" as const;
export const OPEN_ENA_PLUGIN_RESULT_SCHEMA_VERSION = 2 as const;

export interface OpenEnaPluginScientificResultV1 {
  schemaVersion: "ena.hk/scientific-result/v1";
  sourceDatasetSha256: string | null;
  configuration: PortableOpenEnaConfig | null;
  analysisKind: "ena" | "ona";
  networkType: "standard" | "ordered";
  modelType: "EndPoint" | "SeparateTrajectory" | "AccumulatedTrajectory";
  dimensions: readonly string[];
  codes: readonly string[];
  adjacencyKey: readonly unknown[];
  lineWeights: readonly unknown[];
  pointsForProjection: readonly unknown[];
  points: readonly unknown[];
  rotation: Readonly<{
    rotationColumns: readonly string[];
    rotationMatrix: readonly unknown[];
    eigenvalues: readonly number[];
    centerVector: readonly number[];
    nodes: readonly unknown[];
  }>;
  variance: Readonly<Record<string, number>>;
  groups: readonly unknown[];
  projectionReference: unknown;
}

export interface OpenEnaPluginContextV1 {
  schemaVersion: "ena.hk/plugin-context/v1";
  coreApiVersion: typeof OPEN_ENA_PLUGIN_CORE_API_VERSION;
  resultSchemaVersion: typeof OPEN_ENA_PLUGIN_RESULT_SCHEMA_VERSION;
  analysisKind: "ena" | "ona";
  modelType: "EndPoint" | "SeparateTrajectory" | "AccumulatedTrajectory";
  dimensions: readonly string[];
  selectedDimensions: readonly string[];
  capabilities: readonly OpenEnaCapability[];
  minimumDataTier: "D2";
  scientificResult: OpenEnaPluginScientificResultV1;
  stale: boolean;
}

const contextResultOwners = new WeakMap<object, OpenEnaResult>();

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function deepFreezeOpenEnaPluginValue<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreezeOpenEnaPluginValue(nested);
    Object.freeze(value);
  }
  return value;
}

export function canonicalOpenEnaPluginValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalOpenEnaPluginValue).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalOpenEnaPluginValue(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function capabilitiesFor(analysisKind: "ena" | "ona"): OpenEnaCapability[] {
  const source = OPEN_ENA_CAPABILITIES[analysisKind];
  return [
    ...(source.analysisSets ? ["analysis-sets" as const] : []),
    ...(source.referenceRotation ? ["reference-rotation" as const] : []),
    ...(source.groupContrast ? ["group-contrast" as const] : []),
    ...(source.trajectory ? ["trajectory" as const] : []),
    ...(source.threeDimensionalPlot ? ["3d" as const] : []),
    ...(source.inference ? ["inference" as const] : []),
    ...(source.aiInterpretation ? ["ai-interpretation" as const] : []),
  ];
}

export function createOpenEnaPluginScientificResultV1(result: OpenEnaResult, config?: OpenEnaConfig | null): OpenEnaPluginScientificResultV1 {
  const analysisKind = openEnaAnalysisKindFromResult(result);
  const boundConfig = config ?? result.provenanceBinding?.configuration ?? null;
  if (boundConfig && boundConfig.model !== result.set.modelType) throw new TypeError("Plugin scientific binding configuration does not match the completed result model.");
  const sourceDatasetSha256 = result.provenanceBinding?.datasetNormalizedUtf8TextSha256
    ?? result.projectionReference?.source.normalizedUtf8TextSha256
    ?? null;
  const snapshot: OpenEnaPluginScientificResultV1 = {
    schemaVersion: "ena.hk/scientific-result/v1",
    sourceDatasetSha256: typeof sourceDatasetSha256 === "string" && /^[0-9a-f]{64}$/u.test(sourceDatasetSha256) ? sourceDatasetSha256 : null,
    configuration: boundConfig ? serializeOpenEnaConfig(boundConfig) : null,
    analysisKind,
    networkType: analysisKind === "ona" ? "ordered" : "standard",
    modelType: result.set.modelType,
    dimensions: jsonClone(result.dimensions),
    codes: jsonClone(result.set.codes),
    adjacencyKey: jsonClone(result.set.adjacencyKey),
    lineWeights: jsonClone(result.set.lineWeights),
    pointsForProjection: jsonClone(result.set.pointsForProjection),
    points: jsonClone(result.set.points),
    rotation: {
      rotationColumns: jsonClone(result.set.rotation.rotationColumns),
      rotationMatrix: jsonClone(result.set.rotation.rotationMatrix),
      eigenvalues: jsonClone(result.set.rotation.eigenvalues),
      centerVector: jsonClone(result.set.rotation.centerVector),
      nodes: jsonClone(result.set.rotation.nodes ?? []),
    },
    variance: jsonClone(result.set.variance),
    groups: jsonClone(result.groups),
    projectionReference: jsonClone(result.projectionReference),
  };
  return deepFreezeOpenEnaPluginValue(snapshot) as OpenEnaPluginScientificResultV1;
}

export function createOpenEnaPluginContextV1(input: {
  result: OpenEnaResult;
  config?: OpenEnaConfig | null;
  selectedDimensions: readonly string[];
  stale: boolean;
}): OpenEnaPluginContextV1 {
  deepFreezeOpenEnaPluginValue(input.result);
  const analysisKind = openEnaAnalysisKindFromResult(input.result);
  if (input.config && input.config.model !== input.result.set.modelType) throw new TypeError("Plugin context configuration does not match the completed result model.");
  if (input.selectedDimensions.some((dimension) => !input.result.dimensions.includes(dimension))) throw new TypeError("Plugin context selected dimensions must belong to the completed result.");
  const context = deepFreezeOpenEnaPluginValue({
    schemaVersion: "ena.hk/plugin-context/v1" as const,
    coreApiVersion: OPEN_ENA_PLUGIN_CORE_API_VERSION,
    resultSchemaVersion: OPEN_ENA_PLUGIN_RESULT_SCHEMA_VERSION,
    analysisKind,
    modelType: input.result.set.modelType,
    dimensions: [...input.result.dimensions],
    selectedDimensions: [...input.selectedDimensions],
    capabilities: capabilitiesFor(analysisKind),
    minimumDataTier: "D2" as const,
    scientificResult: createOpenEnaPluginScientificResultV1(input.result, input.config),
    stale: input.stale,
  }) as OpenEnaPluginContextV1;
  contextResultOwners.set(context, input.result);
  return context;
}

export function openEnaPluginContextOwnsResult(context: OpenEnaPluginContextV1, result: OpenEnaResult) {
  return contextResultOwners.get(context) === result;
}
