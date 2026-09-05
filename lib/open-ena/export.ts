import type { Row, Scalar } from "jena-js";
import { buildManifest } from "./analyze";
import {
  assertOpenEnaCapabilityForContext,
  openEnaAnalysisKindFromResult,
} from "./capabilities";
import type { OpenEnaPairwiseContrast } from "./contrasts";
import {
  assertOpenEnaInferenceBindingV2,
  assertOpenEnaInferenceCoordinatorConsumerV2,
  assertOpenEnaInferenceCurrentContextV2,
  type OpenEnaInferenceProducerContextV2,
} from "./inference-consumers";
import type { OpenEnaInferenceResultV2 } from "./inference-v2";
import { buildMethodsReport, type OpenEnaPresentationOptions } from "./methods";
import { canonicalizeOpenEnaConfig } from "./network-config";
import { codeColorFor } from "./plot-style";
import {
  datasetHashKindFor,
  JENA_RUNTIME_VERSION,
  type OpenEnaConfig,
  type OpenEnaResult,
  type ParsedDataset,
} from "./types";

export const OPEN_ENA_POINT_INDEX = "OPEN_ENA_POINT_INDEX";

export interface OpenEnaPlotExportDimensions {
  status: "native" | "scaled" | "fallback";
  width: number;
  height: number;
  sourceWidth: number | null;
  sourceHeight: number | null;
}

const DEFAULT_PLOT_EXPORT_DIMENSIONS: OpenEnaPlotExportDimensions = {
  status: "fallback",
  width: 920,
  height: 590,
  sourceWidth: null,
  sourceHeight: null,
};
const MAX_PLOT_EXPORT_DIMENSION = 4_096;
export const OPEN_ENA_PLOT_RASTER_MAX_SIDE = 8_192;
export const OPEN_ENA_PLOT_RASTER_MAX_PIXELS = 16_000_000;

export interface OpenEnaPlotRasterDimensions {
  width: number;
  height: number;
  effectiveScale: number;
  status: "requested" | "constrained";
}

export function resolveOpenEnaPlotExportDimensions(
  viewBox: string | null | undefined,
): OpenEnaPlotExportDimensions {
  const values = typeof viewBox === "string"
    ? viewBox.trim().split(/[\s,]+/u).map(Number)
    : [];
  if (values.length !== 4) return { ...DEFAULT_PLOT_EXPORT_DIMENSIONS };
  const [, , width, height] = values;
  if (!values.every(Number.isFinite)
    || width <= 0
    || height <= 0) {
    return { ...DEFAULT_PLOT_EXPORT_DIMENSIONS };
  }
  const viewportScale = Math.min(1, MAX_PLOT_EXPORT_DIMENSION / width, MAX_PLOT_EXPORT_DIMENSION / height);
  return {
    status: viewportScale < 1 ? "scaled" : "native",
    width: width * viewportScale,
    height: height * viewportScale,
    sourceWidth: width,
    sourceHeight: height,
  };
}

export function resolveOpenEnaPlotRasterDimensions(
  dimensions: Pick<OpenEnaPlotExportDimensions, "width" | "height">,
  requestedScale: number,
): OpenEnaPlotRasterDimensions {
  const safeRequestedScale = Number.isFinite(requestedScale) && requestedScale > 0
    ? requestedScale
    : 1;
  const effectiveScale = Math.min(
    safeRequestedScale,
    OPEN_ENA_PLOT_RASTER_MAX_SIDE / dimensions.width,
    OPEN_ENA_PLOT_RASTER_MAX_SIDE / dimensions.height,
    Math.sqrt(OPEN_ENA_PLOT_RASTER_MAX_PIXELS / (dimensions.width * dimensions.height)),
  );
  return {
    width: Math.max(1, Math.floor(dimensions.width * effectiveScale + Number.EPSILON)),
    height: Math.max(1, Math.floor(dimensions.height * effectiveScale + Number.EPSILON)),
    effectiveScale,
    status: effectiveScale < safeRequestedScale - 1e-12 ? "constrained" : "requested",
  };
}

export const OPEN_ENA_RESULT_TABLE_KEYS = [
  "coordinates",
  "lineWeights",
  "connectionCounts",
  "trajectories",
  "centroids",
  "nodePositions",
  "adjacencyKey",
] as const;

export type OpenEnaResultTableKey = (typeof OPEN_ENA_RESULT_TABLE_KEYS)[number];

export type OpenEnaResultTableUnavailableReason =
  | "endpoint-model"
  | "projection-reference";

export type OpenEnaResultTableAvailability =
  | { available: true; reason: null }
  | { available: false; reason: OpenEnaResultTableUnavailableReason };

export interface OpenEnaResultTablesCopy {
  summaryTitle: string;
  summaryDescription: string;
  tabsAriaLabel: string;
  labels: Readonly<Record<OpenEnaResultTableKey, string>>;
  exportLabels: Readonly<Record<OpenEnaResultTableKey, string>>;
  notApplicableShort: string;
  unavailableReasons: Readonly<Record<OpenEnaResultTableUnavailableReason, string>>;
  notApplicableNote: (table: string, reason: string) => string;
  tableAriaLabel: (table: string) => string;
  exportAriaLabel: (table: string) => string;
  showingAllRows: (count: number) => string;
  showingPreviewRows: (shown: number, total: number) => string;
  emptyRows: string;
}

export interface OpenEnaResultTableTabView {
  key: OpenEnaResultTableKey;
  id: string;
  controls: string;
  label: string;
  badge: string;
  selected: boolean;
  disabled: boolean;
  tabIndex: 0 | -1;
  reason: string | null;
  describedBy: string | null;
}

export interface OpenEnaResultTableViewModel {
  summaryTitle: string;
  summaryDescription: string;
  tabsAriaLabel: string;
  tabs: readonly OpenEnaResultTableTabView[];
  unavailableNotes: ReadonlyArray<{
    id: string;
    label: string;
    reason: string;
  }>;
  panel: {
    id: string;
    labelledBy: string;
    available: boolean;
    note: string | null;
    tableAriaLabel: string;
    headers: readonly string[];
    rows: readonly Row[];
    rowSummary: string;
  };
  export: {
    disabled: boolean;
    label: string;
    ariaLabel: string;
  };
}

export function openEnaResultTableFocusTarget(
  keys: readonly OpenEnaResultTableKey[],
  currentKey: OpenEnaResultTableKey,
  key: string,
): OpenEnaResultTableKey | null {
  if (keys.length === 0) return null;
  if (key === "Home") return keys[0] ?? null;
  if (key === "End") return keys.at(-1) ?? null;
  const direction = key === "ArrowLeft" || key === "ArrowUp"
    ? -1
    : key === "ArrowRight" || key === "ArrowDown"
      ? 1
      : 0;
  if (direction === 0) return null;
  const currentIndex = keys.indexOf(currentKey);
  const normalizedIndex = currentIndex >= 0 ? currentIndex : 0;
  return keys[(normalizedIndex + direction + keys.length) % keys.length] ?? null;
}

export function resolveOpenEnaResultTableRovingKey(
  tabs: readonly OpenEnaResultTableTabView[],
  rovingKey: OpenEnaResultTableKey | null,
): OpenEnaResultTableKey | null {
  if (rovingKey && tabs.some((tab) => tab.key === rovingKey)) return rovingKey;
  return tabs.find((tab) => tab.selected && !tab.disabled)?.key
    ?? tabs.find((tab) => tab.tabIndex === 0)?.key
    ?? tabs[0]?.key
    ?? null;
}

export function openEnaResultTableAvailability(context: {
  modelType: OpenEnaResult["set"]["modelType"];
  projectionReference: boolean;
}): Record<OpenEnaResultTableKey, OpenEnaResultTableAvailability> {
  const availability = Object.fromEntries(OPEN_ENA_RESULT_TABLE_KEYS.map((key) => [
    key,
    { available: true, reason: null },
  ])) as Record<OpenEnaResultTableKey, OpenEnaResultTableAvailability>;
  if (context.modelType === "EndPoint") {
    availability.trajectories = {
      available: false,
      reason: "endpoint-model",
    };
  }
  if (context.projectionReference) {
    availability.centroids = {
      available: false,
      reason: "projection-reference",
    };
  }
  return availability;
}

function openEnaResultTableHeaders(rows: readonly Row[]) {
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
  return headers;
}

export function buildOpenEnaResultTableViewModel(input: {
  selectedKey: OpenEnaResultTableKey;
  tables: Readonly<Record<OpenEnaResultTableKey, readonly Row[]>>;
  availability: Readonly<Record<OpenEnaResultTableKey, OpenEnaResultTableAvailability>>;
  copy: OpenEnaResultTablesCopy;
  idPrefix?: string;
  previewLimit?: number;
}): OpenEnaResultTableViewModel {
  const idPrefix = input.idPrefix ?? "open-ena-result-table";
  const panelId = `${idPrefix}-panel`;
  const previewLimit = input.previewLimit ?? 100;
  const selectedAvailability = input.availability[input.selectedKey];
  const selectedRows = input.tables[input.selectedKey];
  const selectedLabel = input.copy.labels[input.selectedKey];
  const selectedReason = selectedAvailability.reason
    ? input.copy.unavailableReasons[selectedAvailability.reason]
    : null;
  const rovingKey = selectedAvailability.available
    ? input.selectedKey
    : OPEN_ENA_RESULT_TABLE_KEYS.find((key) => input.availability[key].available)
      ?? input.selectedKey;
  const tabs = OPEN_ENA_RESULT_TABLE_KEYS.map((key): OpenEnaResultTableTabView => {
    const availability = input.availability[key];
    const reason = availability.reason ? input.copy.unavailableReasons[availability.reason] : null;
    return {
      key,
      id: `${idPrefix}-tab-${key}`,
      controls: panelId,
      label: input.copy.labels[key],
      badge: availability.available ? String(input.tables[key].length) : input.copy.notApplicableShort,
      selected: input.selectedKey === key,
      disabled: !availability.available,
      tabIndex: key === rovingKey ? 0 : -1,
      reason,
      describedBy: reason ? `${idPrefix}-reason-${key}` : null,
    };
  });
  const previewRows = selectedAvailability.available
    ? selectedRows.slice(0, previewLimit)
    : [];
  const rowSummary = !selectedAvailability.available
    ? ""
    : selectedRows.length === 0
      ? input.copy.emptyRows
      : selectedRows.length > previewLimit
        ? input.copy.showingPreviewRows(previewRows.length, selectedRows.length)
        : input.copy.showingAllRows(selectedRows.length);
  return {
    summaryTitle: input.copy.summaryTitle,
    summaryDescription: input.copy.summaryDescription,
    tabsAriaLabel: input.copy.tabsAriaLabel,
    tabs,
    unavailableNotes: tabs.flatMap((tab) => tab.reason && tab.describedBy
      ? [{ id: tab.describedBy, label: tab.label, reason: tab.reason }]
      : []),
    panel: {
      id: panelId,
      labelledBy: `${idPrefix}-tab-${input.selectedKey}`,
      available: selectedAvailability.available,
      note: selectedReason ? input.copy.notApplicableNote(selectedLabel, selectedReason) : null,
      tableAriaLabel: input.copy.tableAriaLabel(selectedLabel),
      headers: selectedAvailability.available ? openEnaResultTableHeaders(selectedRows) : [],
      rows: previewRows,
      rowSummary,
    },
    export: {
      disabled: !selectedAvailability.available || selectedRows.length === 0,
      label: input.copy.exportLabels[input.selectedKey],
      ariaLabel: input.copy.exportAriaLabel(selectedLabel),
    },
  };
}

export interface BuildAnalysisBundleOptions extends OpenEnaPresentationOptions {
  methodsDimensions?: readonly string[];
  methodsFlipX?: boolean;
  methodsFlipY?: boolean;
  groupContrast?: OpenEnaPairwiseContrast | null;
  inference?: OpenEnaInferenceResultV2 | null;
  inferenceContext?: OpenEnaInferenceProducerContextV2;
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

export function rowsToCsv(rows: readonly Row[]): string {
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
  const analysisKind = openEnaAnalysisKindFromResult(result);
  const canonicalConfig = canonicalizeOpenEnaConfig(config);
  if (canonicalConfig.analysisKind !== analysisKind) {
    throw new Error("The analysis bundle configuration disagrees with the completed runtime network.");
  }
  if (canonicalConfig.rotation === "reference") {
    assertOpenEnaCapabilityForContext(canonicalConfig, result, "reference-rotation");
  }
  if (options.inference != null) {
    assertOpenEnaCapabilityForContext(canonicalConfig, result, "inference");
  }
  if (options.groupContrast != null) {
    assertOpenEnaCapabilityForContext(canonicalConfig, result, "group-contrast");
  }
  const tables = buildResultTables(result);
  const selectedAxes = [...(options.methodsDimensions ?? result.dimensions.slice(0, 2))];
  const selectedView = options.view ?? "2d";
  const requiredAxisCount = analysisKind === "ona" && selectedView === "3d" ? 3 : 2;
  if (selectedAxes.length !== requiredAxisCount
    || new Set(selectedAxes).size !== selectedAxes.length
    || selectedAxes.some((dimension) => !result.dimensions.includes(dimension))) {
    throw new Error(`Analysis bundle ${selectedView.toUpperCase()} presentation requires ${requiredAxisCount} distinct completed-result axes.`);
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
    ...(options.view ? { view: options.view } : {}),
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
      analysisKind,
      networkType: analysisKind === "ona" ? "ordered" as const : "standard" as const,
      units: [...result.set.units],
      conversation: [...result.set.conversation],
      codeColumns: [...result.set.codeColumns],
      unitLabels: [...result.set.unitLabels],
      connectionMatrix: result.set.connectionMatrix.map((row) => [...row]),
      functionParams: {
        ...result.set.functionParams,
        ...(analysisKind === "ona" ? { networkType: "ordered" as const } : {}),
        windowSizeBack: result.set.functionParams.windowSizeBack === Number.POSITIVE_INFINITY
          ? "Infinity" as const
          : result.set.functionParams.windowSizeBack,
      },
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

export { parseOpenEnaAnalysisBundle } from "./legacy-analysis-bundle-parser";
export type { OpenEnaAnalysisBundleV1, OpenEnaAnalysisBundleV2 } from "./legacy-analysis-bundle-parser";
export { buildAnalysisBundleV3, parseAnalysisBundleV3, buildBundleIntegrityV3 } from "./analysis-bundle-v3";
export type { BuildAnalysisBundleOptionsV3, AnalysisBundleValidationOptionsV3 } from "./analysis-bundle-v3";
export {
  exportCanonicalConfigV3,
  exportCurrentAnalysisV3,
  exportDraftV3,
  exportReferenceV2,
  exportStaleAuditV3,
} from "./model-artifact-exports-v3";
export type { ExportFileDescriptorV3, ExportReferenceV2Options } from "./model-artifact-exports-v3";
