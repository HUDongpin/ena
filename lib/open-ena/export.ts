import type { Row, Scalar } from "jena-js";
import { buildManifest } from "./analyze";
import type { OpenEnaPairwiseContrast } from "./contrasts";
import { buildMethodsReport, type OpenEnaPresentationOptions } from "./methods";
import { codeColorFor } from "./plot-style";
import { JENA_RUNTIME_VERSION, type OpenEnaConfig, type OpenEnaResult, type ParsedDataset } from "./types";

export const OPEN_ENA_POINT_INDEX = "OPEN_ENA_POINT_INDEX";

interface BuildAnalysisBundleOptions extends OpenEnaPresentationOptions {
  methodsDimensions?: readonly string[];
  methodsFlipX?: boolean;
  methodsFlipY?: boolean;
  groupContrast?: OpenEnaPairwiseContrast | null;
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
  const presentation = {
    selectedAxes,
    ...(options.codeColors
      ? {
          codeColors: Object.fromEntries(result.set.rotation.codes.map((code) => [
            code,
            codeColorFor(options.codeColors, code),
          ])),
        }
      : {}),
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
  return {
    schemaVersion: 1 as const,
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
    groupContrast: options.groupContrast
      ? {
          schemaVersion: 1 as const,
          kind: "open-ena-pairwise-group-contrast" as const,
          app: "ENA.HK Open ENA" as const,
          runtime: "jena-js" as const,
          runtimeVersion: JENA_RUNTIME_VERSION,
          ...JSON.parse(JSON.stringify(options.groupContrast)) as OpenEnaPairwiseContrast,
        }
      : null,
    presentation,
    methodsReportMarkdown: buildMethodsReport(
      dataset,
      config,
      result,
      sha256,
      selectedAxes,
      presentation,
    ),
  };
}
