import type { Row, Scalar } from "jena-js";
import { buildManifest } from "./analyze";
import type { OpenEnaPairwiseContrast } from "./contrasts";
import {
  assertOpenEnaInferenceBindingV2,
  assertOpenEnaInferenceCoordinatorConsumerV2,
  assertOpenEnaInferenceCurrentContextV2,
  parseOpenEnaInferenceResultV2,
  type OpenEnaInferenceProducerContextV2,
} from "./inference-consumers";
import type { OpenEnaInferenceResultV2 } from "./inference-v2";
import { buildMethodsReport, type OpenEnaPresentationOptions } from "./methods";
import {
  datasetHashKindFor,
  JENA_RUNTIME_VERSION,
  type OpenEnaConfig,
  type OpenEnaResult,
  type ParsedDataset,
  type DatasetHashKind,
} from "./types";

export const OPEN_ENA_POINT_INDEX = "OPEN_ENA_POINT_INDEX";

export interface BuildAnalysisBundleOptions extends OpenEnaPresentationOptions {
  methodsDimensions?: readonly string[];
  methodsFlipX?: boolean;
  methodsFlipY?: boolean;
  groupContrast?: OpenEnaPairwiseContrast | null;
  inference?: OpenEnaInferenceResultV2 | null;
  inferenceContext?: OpenEnaInferenceProducerContextV2;
}

export interface OpenEnaAnalysisBundleV1 extends Record<string, unknown> {
  schemaVersion: 1;
  app: "ENA.HK Open ENA";
}

export interface OpenEnaAnalysisBundleV2 extends Record<string, unknown> {
  schemaVersion: 2;
  app: "ENA.HK Open ENA";
  inference: OpenEnaInferenceResultV2 | null;
}

function needsSpreadsheetNeutralization(value: string) {
  for (const character of value) {
    if (character === "\t" || character === "\r") return true;
    const codePoint = character.codePointAt(0) ?? 0;
    if (/\s/u.test(character) || codePoint < 0x20 || codePoint === 0x7f) continue;
    return character === "=" || character === "+" || character === "-" || character === "@";
  }
  return false;
}

function csvValue(value: Scalar | undefined) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" && needsSpreadsheetNeutralization(value)
    ? `'${value}`
    : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function rowsToCsv(rows: Row[]): string {
  if (rows.length === 0) return "";
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const header of Object.keys(row)) {
      if (!seen.has(header)) {
        seen.add(header);
        headers.push(header);
      }
    }
  }
  return [
    headers.map(csvValue).join(","),
    ...rows.map((row) => headers.map((header) => csvValue(row[header])).join(",")),
  ].join("\r\n") + "\r\n";
}

function trajectoryExportRows(result: OpenEnaResult, rows: Row[]): Row[] {
  if (result.set.modelType === "EndPoint") return rows.map((row) => ({ ...row }));
  return rows.map((row, index) => {
    const trajectory = result.set.trajectories?.[index];
    const conversation = Object.fromEntries(result.set.conversation.map((column) => [
      column,
      trajectory?.[column] ?? null,
    ]));
    return {
      ...row,
      [OPEN_ENA_POINT_INDEX]: index,
      TRAJ_UNIT: result.set.conversation
        .map((column) => String(trajectory?.[column] ?? ""))
        .join("::"),
      ...conversation,
    };
  });
}

export function buildResultTables(result: OpenEnaResult) {
  return {
    coordinates: trajectoryExportRows(result, result.set.points),
    lineWeights: trajectoryExportRows(result, result.set.lineWeights),
    connectionCounts: trajectoryExportRows(result, result.set.connectionCounts),
    trajectories: trajectoryExportRows(result, result.set.trajectories ?? []),
    pointsForProjection: trajectoryExportRows(result, result.set.pointsForProjection),
    // jENA projectIn retains target-fitted centroids even though the displayed
    // nodes come from the fixed reference. Do not export those as if they
    // described the shown reference geometry.
    centroids: result.projectionReference ? [] : trajectoryExportRows(result, result.set.centroids ?? []),
    nodePositions: (result.set.rotation.nodes ?? []).map((row) => ({ ...row })),
    adjacencyKey: result.set.adjacencyKey.map((edge) => ({ ...edge })),
  };
}

export function buildAnalysisBundle(
  dataset: ParsedDataset,
  config: OpenEnaConfig,
  result: OpenEnaResult,
  sha256: string | null = null,
  options: BuildAnalysisBundleOptions = {},
) {
  const tables = buildResultTables(result);
  const selectedAxes = [...(options.methodsDimensions ?? result.dimensions.slice(0, 2))];
  if (selectedAxes.length !== 2) {
    throw new Error("Analysis bundle inference requires exactly two selected axes.");
  }
  const inference = options.inference ?? null;
  let resolvedInferenceContext: OpenEnaInferenceProducerContextV2 | null = null;
  if (inference) {
    assertOpenEnaInferenceCoordinatorConsumerV2(inference);
    const currentGroupNames = result.groups.map((group) => group.name);
    const suppliedGroupNames = new Set(options.inferenceContext?.groupNames ?? []);
    if (options.inferenceContext
      && (options.inferenceContext.groupColumn !== config.groupColumn
        || options.inferenceContext.groupNames.length !== currentGroupNames.length
        || suppliedGroupNames.size !== options.inferenceContext.groupNames.length
        || currentGroupNames.some((group) => !suppliedGroupNames.has(group)))) {
      throw new Error("Inference consumer current context mismatch.");
    }
    resolvedInferenceContext = {
      groupNames: currentGroupNames,
      groupColumn: config.groupColumn,
      trajectoryMapping: options.inferenceContext?.trajectoryMapping ?? null,
    };
    assertOpenEnaInferenceCurrentContextV2(inference, resolvedInferenceContext);
    if (!sha256) throw new Error("Inference consumer binding mismatch.");
    assertOpenEnaInferenceBindingV2(inference, {
      analyzedAt: result.analyzedAt,
      datasetNormalizedUtf8TextSha256: sha256,
      datasetHashKind: datasetHashKindFor(dataset),
      modelType: result.set.modelType,
      configuration: config,
      axes: [selectedAxes[0], selectedAxes[1]],
    });
  }
  const presentation = {
    selectedAxes,
    flipX: options.methodsFlipX ?? options.flipX ?? false,
    flipY: options.methodsFlipY ?? options.flipY ?? false,
    edgeThreshold: options.edgeThreshold ?? 0,
    showNetworks: options.showNetworks ?? true,
    showPoints: options.showPoints ?? true,
    showTrajectories: options.showTrajectories ?? true,
    showLabels: options.showLabels ?? true,
    showGroupLabels: options.showGroupLabels ?? true,
    showUnitLabels: options.showUnitLabels ?? false,
    showVariance: options.showVariance ?? true,
    edgeScale: options.edgeScale ?? 1,
    pointScale: options.pointScale ?? 1,
    plotZoom: options.plotZoom ?? 1,
    ...(options.selectedGroupOrder
      ? { selectedGroupOrder: [...options.selectedGroupOrder] as [string, string] }
      : {}),
  };
  const groupContrast = options.groupContrast
    ? (() => {
        const cloned = JSON.parse(JSON.stringify(options.groupContrast)) as OpenEnaPairwiseContrast;
        const { inference: _legacyInference, ...compatibilityContrast } = cloned;
        return {
          schemaVersion: 1 as const,
          kind: "open-ena-pairwise-group-contrast" as const,
          app: "ENA.HK Open ENA" as const,
          runtime: "jena-js" as const,
          runtimeVersion: JENA_RUNTIME_VERSION,
          ...compatibilityContrast,
          boundaries: compatibilityContrast.boundaries.filter((boundary) => (
            !/Mann[-–]Whitney inference|multiplicity correction/iu.test(boundary)
          )),
          inference: null,
          inferenceAuthority: "top-level-inference-v2" as const,
          compatibilityNotice: inference
            ? "This plot-oriented group contrast is non-authoritative compatibility data. Researcher-confirmed inferential results are present only in the top-level schema-v2 inference field."
            : "This plot-oriented group contrast is non-authoritative compatibility data. No researcher-confirmed inferential result is included in this bundle.",
        };
      })()
    : null;
  return {
    schemaVersion: 2 as const,
    app: "ENA.HK Open ENA" as const,
    manifest: buildManifest(dataset, config, result, sha256),
    tables,
    rotationSet: {
      codes: [...result.set.rotation.codes],
      adjacencyKey: result.set.rotation.adjacencyKey.map((edge) => ({ ...edge })),
      rotationMatrix: result.set.rotation.rotationMatrix.map((row) => [...row]),
      rotationColumns: [...result.set.rotation.rotationColumns],
      eigenvalues: [...result.set.rotation.eigenvalues],
      centerVector: [...result.set.rotation.centerVector],
      nodes: (result.set.rotation.nodes ?? []).map((row) => ({ ...row })),
    },
    modelData: {
      modelType: result.set.modelType,
      units: [...result.set.units],
      conversation: [...result.set.conversation],
      codeColumns: [...result.set.codeColumns],
      unitLabels: [...result.set.unitLabels],
      connectionMatrix: result.set.connectionMatrix.map((row) => [...row]),
      functionParams: { ...result.set.functionParams },
    },
    statistics: result.stats,
    statisticsDiagnostics: result.statsDiagnostics,
    groupContrast,
    inference,
    presentation,
    methodsReportMarkdown: buildMethodsReport(
      dataset,
      config,
      result,
      sha256,
      selectedAxes,
      presentation,
      inference,
      resolvedInferenceContext,
    ),
  };
}

const ANALYSIS_BUNDLE_FIELDS = [
  "schemaVersion",
  "app",
  "manifest",
  "tables",
  "rotationSet",
  "modelData",
  "statistics",
  "statisticsDiagnostics",
  "groupContrast",
  "presentation",
  "methodsReportMarkdown",
] as const;

const ANALYSIS_BUNDLE_V2_GROUP_CONTRAST_FIELDS = [
  "schemaVersion", "kind", "app", "runtime", "runtimeVersion", "groupColumn", "declaredGroups",
  "groupOrder", "axes", "coordinateExtent", "officialPlotFrame", "configuration",
  "resultProvenance", "geometry", "primary", "secondary", "nodes", "edges",
  "edgeScaleDenominators", "createdAt", "boundaries", "inference", "inferenceAuthority",
  "compatibilityNotice",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parsedHashKind(value: unknown): DatasetHashKind | null {
  return value === "normalized-utf8-text-sha256"
    || value === "normalized-utf8-csv-text-sha256"
    || value === "canonical-first-xlsx-worksheet-v1-sha256"
    ? value
    : null;
}

function freezeParsed<T>(value: T, seen = new Set<unknown>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value as Record<string, unknown>)) freezeParsed(nested, seen);
  return Object.freeze(value);
}

/**
 * Strict outer result-bundle reader. Schema v1 remains historical and never
 * receives a fabricated inference field; schema v2 requires one authoritative
 * aggregate inference field (which may explicitly be null).
 */
export function parseOpenEnaAnalysisBundle(
  text: string,
): OpenEnaAnalysisBundleV1 | OpenEnaAnalysisBundleV2 {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new Error("Analysis bundle is not valid JSON.");
  }
  if (!isRecord(value)
    || (value.schemaVersion !== 1 && value.schemaVersion !== 2)
    || value.app !== "ENA.HK Open ENA") {
    throw new Error("This is not a supported ENA.HK analysis bundle.");
  }
  const allowed = new Set<string>([
    ...ANALYSIS_BUNDLE_FIELDS,
    ...(value.schemaVersion === 2 ? ["inference"] : []),
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new Error("Analysis bundle contains an unsupported analysis bundle field.");
  }
  for (const required of ANALYSIS_BUNDLE_FIELDS) {
    if (!(required in value)) throw new Error("Analysis bundle is incomplete.");
  }
  if (!isRecord(value.manifest)
    || !isRecord(value.tables)
    || !isRecord(value.rotationSet)
    || !isRecord(value.modelData)
    || !isRecord(value.presentation)
    || typeof value.methodsReportMarkdown !== "string") {
    throw new Error("Analysis bundle is incomplete.");
  }
  if (value.schemaVersion === 1) {
    if ("inference" in value) throw new Error("Schema-v1 analysis bundles cannot contain v2 inference.");
    return freezeParsed(value as OpenEnaAnalysisBundleV1);
  }
  if (!("inference" in value)) throw new Error("Schema-v2 analysis bundle must contain inference.");
  if (value.inference !== null) value.inference = parseOpenEnaInferenceResultV2(value.inference);
  if (value.groupContrast !== null) {
    if (!isRecord(value.groupContrast)
      || value.groupContrast.inference !== null
      || value.groupContrast.inferenceAuthority !== "top-level-inference-v2"
      || typeof value.groupContrast.compatibilityNotice !== "string"
      || Object.keys(value.groupContrast).some((key) => (
        !new Set<string>(ANALYSIS_BUNDLE_V2_GROUP_CONTRAST_FIELDS).has(key)
      ))) {
      throw new Error("Schema-v2 group contrast must defer to top-level inference.");
    }
  }
  if (value.inference !== null) {
    const inference = value.inference as OpenEnaInferenceResultV2;
    const manifest = value.manifest;
    const presentation = value.presentation;
    if (!isRecord(manifest.dataset)
      || !isRecord(manifest.result)
      || !isRecord(manifest.configuration)
      || !Array.isArray(presentation.selectedAxes)
      || presentation.selectedAxes.length !== 2
      || presentation.selectedAxes.some((axis) => typeof axis !== "string")
      || typeof manifest.dataset.normalizedUtf8TextSha256 !== "string"
      || !/^[0-9a-f]{64}$/u.test(manifest.dataset.normalizedUtf8TextSha256)
      || !parsedHashKind(manifest.dataset.hashKind)
      || typeof manifest.result.analyzedAt !== "string"
      || (manifest.result.model !== "EndPoint"
        && manifest.result.model !== "SeparateTrajectory"
        && manifest.result.model !== "AccumulatedTrajectory")) {
      throw new Error("Inference consumer binding mismatch.");
    }
    assertOpenEnaInferenceBindingV2(inference, {
      analyzedAt: manifest.result.analyzedAt,
      datasetNormalizedUtf8TextSha256: manifest.dataset.normalizedUtf8TextSha256,
      datasetHashKind: parsedHashKind(manifest.dataset.hashKind)!,
      modelType: manifest.result.model,
      configuration: manifest.configuration as unknown as OpenEnaConfig,
      axes: presentation.selectedAxes as [string, string],
    });
  }
  return freezeParsed(value as OpenEnaAnalysisBundleV2);
}
