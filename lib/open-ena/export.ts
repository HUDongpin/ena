import type { Row, Scalar } from "jena-js";
import { directedNodePositions } from "jena-js/rotation";
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
  parseOpenEnaInferenceResultV2,
  type OpenEnaInferenceProducerContextV2,
} from "./inference-consumers";
import type { OpenEnaInferenceResultV2 } from "./inference-v2";
import { buildMethodsReport, type OpenEnaPresentationOptions } from "./methods";
import {
  canonicalizeOpenEnaConfig,
  deserializeOpenEnaConfig,
} from "./network-config";
import { codeColorFor } from "./plot-style";
import {
  datasetHashKindFor,
  JENA_RUNTIME_VERSION,
  type OpenEnaConfig,
  type OpenEnaResult,
  type ParsedDataset,
  type DatasetHashKind,
  type PortableOpenEnaConfig,
} from "./types";

export const OPEN_ENA_POINT_INDEX = "OPEN_ENA_POINT_INDEX";

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

export interface OpenEnaResultTableAvailability {
  available: boolean;
  reason: OpenEnaResultTableUnavailableReason | null;
}

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
      tabIndex: availability.available ? 0 : -1,
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

const PORTABLE_CONFIG_FIELDS = [
  "analysisKind",
  "unitColumns",
  "conversationColumns",
  "groupColumn",
  "codes",
  "model",
  "window",
  "windowSizeBack",
  "windowSizeForward",
  "weightBy",
  "rotation",
  "referenceRotationId",
  "centerAlignToOrigin",
  "orderPolicy",
  "directionalMask",
] as const;

const LEGACY_CONFIG_REQUIRED_FIELDS = [
  "unitColumns",
  "conversationColumns",
  "groupColumn",
  "codes",
  "model",
  "window",
  "windowSizeBack",
  "windowSizeForward",
  "weightBy",
  "rotation",
  "referenceRotationId",
  "centerAlignToOrigin",
] as const;

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string) {
  const actual = Object.keys(value);
  const expectedSet = new Set(expected);
  if (actual.length !== expected.length
    || actual.some((key) => !expectedSet.has(key))
    || expected.some((key) => !Object.hasOwn(value, key))) {
    throw new Error(`${label} must contain exactly its schema fields.`);
  }
}

function boundedUniqueStrings(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
) {
  if (!Array.isArray(value)
    || value.length < minimum
    || value.length > maximum
    || value.some((item) => typeof item !== "string" || item.length === 0 || item.length > 4_096)
    || new Set(value).size !== value.length) {
    throw new Error(`${label} must contain unique bounded non-empty strings.`);
  }
}

function assertPortableConfigScalars(config: Record<string, unknown>) {
  boundedUniqueStrings(config.unitColumns, "Manifest unit columns", 1, 256);
  boundedUniqueStrings(config.conversationColumns, "Manifest conversation columns", 1, 256);
  boundedUniqueStrings(config.codes, "Manifest code columns", 3, 30);
  if (config.groupColumn !== null
    && (typeof config.groupColumn !== "string" || config.groupColumn.length === 0 || config.groupColumn.length > 4_096)) {
    throw new Error("Manifest group column must be null or a bounded non-empty string.");
  }
  if (config.model !== "EndPoint"
    && config.model !== "SeparateTrajectory"
    && config.model !== "AccumulatedTrajectory") {
    throw new Error("Manifest model type is unsupported.");
  }
  if (config.window !== "MovingStanzaWindow" && config.window !== "Conversation") {
    throw new Error("Manifest window type is unsupported.");
  }
  if (typeof config.windowSizeForward !== "number"
    || !Number.isSafeInteger(config.windowSizeForward)
    || config.windowSizeForward < 0
    || config.windowSizeForward > 100) {
    throw new Error("Manifest windowSizeForward must be a safe integer from 0 to 100.");
  }
  if (config.weightBy !== "binary" && config.weightBy !== "sum") {
    throw new Error("Manifest weighting policy is unsupported.");
  }
  if (config.rotation !== "svd" && config.rotation !== "mean" && config.rotation !== "reference") {
    throw new Error("Manifest rotation policy is unsupported.");
  }
  if (typeof config.centerAlignToOrigin !== "boolean") {
    throw new Error("Manifest centerAlignToOrigin must be boolean.");
  }
  if (config.rotation === "reference") {
    if (typeof config.referenceRotationId !== "string" || config.referenceRotationId.length === 0) {
      throw new Error("Manifest reference rotation requires a reference ID.");
    }
  } else if (config.referenceRotationId !== null) {
    throw new Error("Manifest non-reference rotation cannot retain a reference ID.");
  }
}

function parseManifestConfiguration(
  value: unknown,
  schemaVersion: 1 | 2,
) {
  if (!isRecord(value)) throw new Error("Analysis manifest configuration is missing.");
  assertPortableConfigScalars(value);
  if (schemaVersion === 1) {
    const allowed = new Set<string>([
      ...LEGACY_CONFIG_REQUIRED_FIELDS,
      "analysisKind",
      "orderPolicy",
      "directionalMask",
    ]);
    if (Object.keys(value).some((key) => !allowed.has(key))
      || LEGACY_CONFIG_REQUIRED_FIELDS.some((key) => !Object.hasOwn(value, key))) {
      throw new Error("Legacy manifest configuration contains an unsupported field.");
    }
    if ((value.analysisKind !== undefined && value.analysisKind !== "ena")
      || (value.orderPolicy !== undefined && value.orderPolicy !== null)
      || (value.directionalMask !== undefined && value.directionalMask !== null)) {
      throw new Error("Legacy schema-v1 bundles are ENA-only and cannot declare ordered analysis.");
    }
    if (typeof value.windowSizeBack !== "number"
      || !Number.isSafeInteger(value.windowSizeBack)
      || value.windowSizeBack < 0
      || value.windowSizeBack > 100) {
      throw new Error("Legacy manifest windowSizeBack must be a finite safe integer; JSON null cannot encode Infinity.");
    }
    return canonicalizeOpenEnaConfig({
      ...(value as unknown as OpenEnaConfig),
      analysisKind: "ena",
      orderPolicy: null,
      directionalMask: null,
    });
  }

  exactKeys(value, PORTABLE_CONFIG_FIELDS, "Schema-v2 manifest configuration");
  let config: ReturnType<typeof deserializeOpenEnaConfig>;
  try {
    config = deserializeOpenEnaConfig(value as unknown as PortableOpenEnaConfig);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Portable manifest configuration is invalid.");
  }
  if (config.analysisKind === "ona") {
    if (config.model !== "EndPoint"
      || config.window !== "MovingStanzaWindow"
      || !(config.windowSizeBack === Number.POSITIVE_INFINITY
        || (Number.isSafeInteger(config.windowSizeBack) && config.windowSizeBack >= 1))
      || config.windowSizeForward !== 0
      || config.weightBy !== "sum"
      || config.rotation !== "svd"
      || config.referenceRotationId !== null) {
      throw new Error("Schema-v2 ONA configuration contains an unsupported ordered model policy.");
    }
  } else if (!Number.isSafeInteger(config.windowSizeBack)
    || config.windowSizeBack < 0
    || config.windowSizeBack > 100) {
    throw new Error("Schema-v2 ENA windowSizeBack must be a finite safe integer from 0 to 100.");
  }
  return config;
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function expectedResolvedOrdering(config: ReturnType<typeof canonicalizeOpenEnaConfig>) {
  const policy = config.orderPolicy;
  if (!policy) return null;
  if (policy.kind === "source-row") {
    return { kind: "source-row" as const, confirmed: true as const, stable: true as const };
  }
  return {
    kind: "columns" as const,
    columns: [...policy.columns],
    comparators: { ...policy.comparators },
    direction: "ascending" as const,
    missing: "reject" as const,
    ties: "reject" as const,
    stable: true as const,
  };
}

function expectedPortableBackward(config: ReturnType<typeof canonicalizeOpenEnaConfig>) {
  return config.window === "Conversation" || config.windowSizeBack === Number.POSITIVE_INFINITY
    ? "Infinity" as const
    : config.windowSizeBack;
}

function expectedCodeColumns(config: ReturnType<typeof canonicalizeOpenEnaConfig>) {
  if (config.analysisKind === "ona") {
    return config.codes.flatMap((response) => (
      config.codes.map((ground) => `${ground} & ${response}`)
    ));
  }
  const edges: string[] = [];
  for (let targetIndex = 1; targetIndex < config.codes.length; targetIndex += 1) {
    for (let sourceIndex = 0; sourceIndex < targetIndex; sourceIndex += 1) {
      edges.push(`${config.codes[sourceIndex]} & ${config.codes[targetIndex]}`);
    }
  }
  return edges;
}

function parseManifestContract(
  manifest: Record<string, unknown>,
  modelData: Record<string, unknown>,
) {
  if (manifest.app !== "ENA.HK Open ENA"
    || (manifest.schemaVersion !== 1 && manifest.schemaVersion !== 2)) {
    throw new Error("Analysis bundle contains an unsupported nested manifest.");
  }
  const schemaVersion = manifest.schemaVersion;
  const manifestFields = [
    "schemaVersion", "app", "appVersion", "runtime", "runtimeVersion", "dataset",
    "configuration", "result", "effectiveJenaOptions", "generatedAt", "boundaries",
    ...(schemaVersion === 2 ? ["analysis"] : []),
  ];
  exactKeys(manifest, manifestFields, `Schema-v${schemaVersion} analysis manifest`);
  const config = parseManifestConfiguration(manifest.configuration, schemaVersion);
  if (!isRecord(manifest.effectiveJenaOptions)) {
    throw new Error("Analysis manifest effective jENA options are missing.");
  }
  const effective = manifest.effectiveJenaOptions;
  const expectedNetworkType = config.analysisKind === "ona" ? "ordered" : "standard";
  const expectedNodeMethod = config.analysisKind === "ona" ? "directed" : "undirected";
  const expectedMask = config.directionalMask
    ? config.directionalMask.enabled.map((row) => row.map((enabled) => enabled ? 1 : 0))
    : undefined;

  if (schemaVersion === 1) {
    if (Object.hasOwn(manifest, "analysis")
      || Reflect.get(effective, "networkType") === "ordered"
      || Reflect.get(effective, "nodePositionMethod") !== "undirected"
      || (Reflect.get(effective, "mask") !== undefined && Reflect.get(effective, "mask") !== null)
      || Reflect.get(modelData, "analysisKind") === "ona"
      || Reflect.get(modelData, "networkType") === "ordered") {
      throw new Error("Legacy schema-v1 bundles are ENA-only and cannot contain ordered runtime markers.");
    }
  } else {
    if (!isRecord(manifest.analysis)) throw new Error("Schema-v2 analysis manifest identity is missing.");
    exactKeys(
      manifest.analysis,
      ["analysisKind", "networkType", "ordering", "directionalMask"],
      "Schema-v2 manifest analysis identity",
    );
    const expectedOrdering = config.orderPolicy
      ? {
          requestedPolicy: config.orderPolicy,
          resolvedPolicy: expectedResolvedOrdering(config),
          sourceMapping: "excluded-from-generic-bundle",
        }
      : null;
    const effectiveNetworkMatches = config.analysisKind === "ona"
      ? effective.networkType === "ordered"
      : !Object.hasOwn(effective, "networkType");
    const effectiveMaskMatches = config.analysisKind === "ona"
      ? sameJson(effective.mask, expectedMask)
      : !Object.hasOwn(effective, "mask");
    if (manifest.analysis.analysisKind !== config.analysisKind
      || manifest.analysis.networkType !== expectedNetworkType
      || !sameJson(manifest.analysis.ordering, expectedOrdering)
      || !sameJson(manifest.analysis.directionalMask, config.directionalMask)
      || !effectiveNetworkMatches
      || effective.nodePositionMethod !== expectedNodeMethod
      || !effectiveMaskMatches) {
      throw new Error("Schema-v2 manifest analysis identity contradicts its ordered network contract.");
    }
  }

  if (!sameJson(effective.units, config.unitColumns)
    || !sameJson(effective.conversation, config.conversationColumns)
    || !sameJson(effective.codes, config.codes)
    || !sameJson(effective.metadata, config.groupColumn ? [config.groupColumn] : [])
    || effective.includeMeta !== true
    || effective.model !== config.model
    || effective.window !== config.window
    || effective.windowSizeBack !== expectedPortableBackward(config)
    || effective.windowSizeForward !== (config.window === "Conversation" ? 0 : config.windowSizeForward)
    || effective.weightBy !== config.weightBy
    || effective.dimensions !== 3
    || effective.centerAlignToOrigin !== config.centerAlignToOrigin
    || effective.normalization !== "sphere") {
    throw new Error("Analysis manifest effective jENA model, unit, conversation, code, or window options contradict its configuration.");
  }
  if (!isRecord(manifest.result) || manifest.result.model !== config.model) {
    throw new Error("Analysis manifest result model contradicts its configuration.");
  }
  if (!isRecord(effective.rotation)
    || (config.analysisKind === "ona" && effective.rotation.method !== "svd")
    || (config.analysisKind === "ena"
      && config.rotation === "svd"
      && effective.rotation.method !== "svd")
    || (config.analysisKind === "ena"
      && config.rotation === "mean"
      && effective.rotation.method !== "generalized")
    || (config.analysisKind === "ena"
      && config.rotation === "reference"
      && effective.rotation.method !== "reference")) {
    throw new Error("Analysis manifest projection lineage is inconsistent with its rotation configuration.");
  }

  if (!isRecord(modelData.functionParams)) {
    throw new Error("Analysis bundle model function parameters are missing.");
  }
  const functionParams = modelData.functionParams;
  const functionNetworkType = Reflect.get(functionParams, "networkType");
  if (schemaVersion === 1) {
    if (Reflect.get(modelData, "analysisKind") === "ona"
      || Reflect.get(modelData, "networkType") === "ordered"
      || functionNetworkType === "ordered") {
      throw new Error("Legacy schema-v1 bundles are ENA-only and cannot contain ordered function parameters.");
    }
  } else {
    const functionNetworkMatches = config.analysisKind === "ona"
      ? functionNetworkType === "ordered"
      : functionNetworkType === undefined || functionNetworkType === "standard";
    if (modelData.analysisKind !== config.analysisKind
      || modelData.networkType !== expectedNetworkType
      || !functionNetworkMatches) {
      throw new Error("Schema-v2 model data contradicts its analysis kind or runtime network identity.");
    }
  }
  if (modelData.modelType !== config.model
    || !sameJson(modelData.units, config.unitColumns)
    || !sameJson(modelData.conversation, config.conversationColumns)
    || functionParams.model !== config.model
    || functionParams.window !== config.window
    || functionParams.windowSizeBack !== expectedPortableBackward(config)
    || functionParams.windowSizeForward !== (config.window === "Conversation" ? 0 : config.windowSizeForward)
    || functionParams.weightBy !== config.weightBy) {
    throw new Error("Analysis bundle model, unit, conversation, or function parameters contradict its manifest.");
  }
  const codeColumns = expectedCodeColumns(config);
  const expectedEdgeCount = codeColumns.length;
  if (!Array.isArray(modelData.codeColumns)
    || !sameJson(modelData.codeColumns, codeColumns)
    || !Array.isArray(modelData.connectionMatrix)
    || modelData.connectionMatrix.some((row) => (
      !Array.isArray(row)
      || row.length !== expectedEdgeCount
      || row.some((cell) => typeof cell !== "number" || !Number.isFinite(cell))
    ))) {
    throw new Error("Analysis bundle connectionMatrix must contain finite rows matching its network shape.");
  }
  return config;
}

const ONA_TABLE_FIELDS = [
  "coordinates",
  "lineWeights",
  "connectionCounts",
  "trajectories",
  "pointsForProjection",
  "centroids",
  "nodePositions",
  "adjacencyKey",
] as const;

const ONA_ROTATION_SET_FIELDS = [
  "codes",
  "adjacencyKey",
  "rotationMatrix",
  "rotationColumns",
  "eigenvalues",
  "centerVector",
  "nodes",
] as const;

const ONA_MODEL_DATA_FIELDS = [
  "modelType",
  "analysisKind",
  "networkType",
  "units",
  "conversation",
  "codeColumns",
  "unitLabels",
  "connectionMatrix",
  "functionParams",
] as const;

const ONA_PRESENTATION_FIELDS = [
  "selectedAxes",
  "codeColors",
  "flipX",
  "flipY",
  "edgeThreshold",
  "showNetworks",
  "showPoints",
  "showTrajectories",
  "showLabels",
  "showGroupLabels",
  "showUnitLabels",
  "showVariance",
  "edgeScale",
  "pointScale",
  "plotZoom",
  "selectedGroupOrder",
] as const;

function exactAllowedKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
  label: string,
) {
  const allowedSet = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedSet.has(key))
    || required.some((key) => !Object.hasOwn(value, key))) {
    throw new Error(`${label} contains an unsupported or missing schema field.`);
  }
}

function asRecordArray(value: unknown, label: string) {
  if (!Array.isArray(value) || value.some((item) => !isRecord(item))) {
    throw new Error(`${label} must be an array of schema objects.`);
  }
  return value as Record<string, unknown>[];
}

function asFiniteBundleNumber(value: unknown, label: string, nonnegative = false) {
  if (typeof value !== "number"
    || !Number.isFinite(value)
    || (nonnegative && value < 0)) {
    throw new Error(`${label} must be ${nonnegative ? "a nonnegative " : "a "}finite number.`);
  }
  return value;
}

function asSafeBundleInteger(value: unknown, label: string, minimum = 0) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label} must be a safe integer of at least ${minimum}.`);
  }
  return value;
}

function asBoundedBundleString(value: unknown, label: string, maximum = 4_096) {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    throw new Error(`${label} must be a bounded non-empty string.`);
  }
  return value;
}

function assertBundleScalar(value: unknown, label: string) {
  if (value !== null
    && typeof value !== "string"
    && typeof value !== "boolean"
    && (typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error(`${label} must be a finite JSON scalar.`);
  }
}

function assertDeclaredIdentityScalar(value: unknown, label: string) {
  assertBundleScalar(value, label);
  if (value === null || (typeof value === "string" && value.length === 0)) {
    throw new Error(`${label} must be a present, non-empty declared identity value.`);
  }
}

function asFiniteMatrix(
  value: unknown,
  rows: number,
  columns: number,
  label: string,
  nonnegative = false,
) {
  if (!Array.isArray(value) || value.length !== rows) {
    throw new Error(`${label} row count contradicts its declared shape.`);
  }
  return value.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== columns) {
      throw new Error(`${label} row ${rowIndex + 1} contradicts its declared shape.`);
    }
    return row.map((cell, columnIndex) => asFiniteBundleNumber(
      cell,
      `${label} cell [${rowIndex}, ${columnIndex}]`,
      nonnegative,
    ));
  });
}

/**
 * JSON number round-trips and independent IEEE-754 evaluation may differ in
 * their final bits. Scientific duplicate surfaces in an ONA bundle are equal
 * only when |a-b| <= 1e-10 + 1e-9 * max(|a|, |b|). The absolute term protects
 * values near zero; the relative term scales to the magnitude being checked.
 */
export const OPEN_ENA_BUNDLE_SCIENTIFIC_TOLERANCE = Object.freeze({
  absolute: 1e-10,
  relative: 1e-9,
});

function scientificTolerance(left: number, right: number) {
  return OPEN_ENA_BUNDLE_SCIENTIFIC_TOLERANCE.absolute
    + OPEN_ENA_BUNDLE_SCIENTIFIC_TOLERANCE.relative
      * Math.max(Math.abs(left), Math.abs(right));
}

function scientificallyEqual(left: number, right: number) {
  return Number.isFinite(left)
    && Number.isFinite(right)
    && Math.abs(left - right) <= scientificTolerance(left, right);
}

function assertScientificallyEqual(actual: number, expected: number, label: string) {
  if (!scientificallyEqual(actual, expected)) {
    throw new Error(`${label} contradicts the authoritative ONA scientific derivation.`);
  }
}

function assertScientificResidual(residual: number, scale: number, label: string) {
  const tolerance = OPEN_ENA_BUNDLE_SCIENTIFIC_TOLERANCE.absolute
    + OPEN_ENA_BUNDLE_SCIENTIFIC_TOLERANCE.relative * Math.abs(scale);
  if (!Number.isFinite(residual)
    || !Number.isFinite(scale)
    || !Number.isFinite(tolerance)
    || Math.abs(residual) > tolerance) {
    throw new Error(`${label} contradicts the authoritative ONA scientific derivation.`);
  }
}

function stableSphereNormalizedRow(row: readonly number[]) {
  let scale = 0;
  let scaledSumSquares = 1;
  for (const value of row) {
    const absolute = Math.abs(value);
    if (absolute === 0) continue;
    if (scale < absolute) {
      const ratio = scale / absolute;
      scaledSumSquares = 1 + scaledSumSquares * ratio * ratio;
      scale = absolute;
    } else {
      const ratio = absolute / scale;
      scaledSumSquares += ratio * ratio;
    }
  }
  if (scale === 0) return row.map(() => 0);
  const scaledNorm = Math.sqrt(scaledSumSquares);
  return row.map((value) => (value / scale) / scaledNorm);
}

function meanMatrixColumns(matrix: readonly (readonly number[])[]) {
  const width = matrix[0]?.length ?? 0;
  return Array.from({ length: width }, (_unused, columnIndex) => (
    matrix.reduce((sum, row) => sum + (row[columnIndex] ?? 0), 0) / matrix.length
  ));
}

function multiplyBundleMatrices(
  left: readonly (readonly number[])[],
  right: readonly (readonly number[])[],
) {
  const columns = right[0]?.length ?? 0;
  return left.map((row) => Array.from({ length: columns }, (_unused, columnIndex) => (
    row.reduce((sum, value, sharedIndex) => (
      sum + value * (right[sharedIndex]?.[columnIndex] ?? 0)
    ), 0)
  )));
}

function sampleVariance(values: readonly number[]) {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
}

function uniqueSchemaKeys(keys: readonly string[]) {
  return [...new Set(keys)];
}

function assertOnaBundleContract(
  bundle: Record<string, unknown>,
  config: ReturnType<typeof canonicalizeOpenEnaConfig>,
) {
  if (config.analysisKind !== "ona") return;
  const manifest = bundle.manifest as Record<string, unknown>;
  const tables = bundle.tables as Record<string, unknown>;
  const rotationSet = bundle.rotationSet as Record<string, unknown>;
  const modelData = bundle.modelData as Record<string, unknown>;
  const presentation = bundle.presentation as Record<string, unknown>;
  const statisticsDiagnostics = bundle.statisticsDiagnostics;
  const statistics = bundle.statistics;

  if (!isRecord(manifest.dataset)
    || !isRecord(manifest.result)
    || !isRecord(manifest.effectiveJenaOptions)
    || !isRecord(manifest.configuration)
    || !isRecord(modelData.functionParams)
    || !isRecord(statisticsDiagnostics)
    || !isRecord(statistics)) {
    throw new Error("Schema-v2 ONA bundle is missing a closed contract object.");
  }
  const dataset = manifest.dataset;
  const result = manifest.result;
  const effective = manifest.effectiveJenaOptions;
  const portableConfig = manifest.configuration;
  const functionParams = modelData.functionParams;

  if (!isRecord(portableConfig.orderPolicy)
    || !isRecord(portableConfig.directionalMask)) {
    throw new Error("Schema-v2 ONA order policy and directional mask are missing.");
  }
  if (portableConfig.orderPolicy.kind === "columns") {
    exactKeys(
      portableConfig.orderPolicy,
      ["kind", "columns", "comparators"],
      "Schema-v2 ONA portable order policy",
    );
  } else {
    exactKeys(
      portableConfig.orderPolicy,
      ["kind", "confirmed"],
      "Schema-v2 ONA portable order policy",
    );
  }
  exactKeys(
    portableConfig.directionalMask,
    ["schemaVersion", "codeOrder", "enabled"],
    "Schema-v2 ONA portable directional mask",
  );

  exactKeys(
    dataset,
    ["name", "rows", "columns", "source", "hashKind", "normalizedUtf8TextSha256"],
    "Schema-v2 ONA manifest dataset",
  );
  asBoundedBundleString(dataset.name, "Schema-v2 ONA dataset name");
  const datasetRowCount = asSafeBundleInteger(
    dataset.rows,
    "Schema-v2 ONA dataset row count",
  );
  const datasetColumnCount = asSafeBundleInteger(
    dataset.columns,
    "Schema-v2 ONA dataset column count",
  );
  const minimumDeclaredColumns = new Set([
    ...config.unitColumns,
    ...config.conversationColumns,
    ...(config.groupColumn ? [config.groupColumn] : []),
    ...config.codes,
    ...(config.orderPolicy?.kind === "columns" ? config.orderPolicy.columns : []),
  ]).size;
  if (datasetColumnCount < minimumDeclaredColumns) {
    throw new Error("Schema-v2 ONA dataset columns cannot cover its declared analysis fields.");
  }
  if (dataset.source !== "sample" && dataset.source !== "upload") {
    throw new Error("Schema-v2 ONA dataset source is unsupported.");
  }
  if (!parsedHashKind(dataset.hashKind)) {
    throw new Error("Schema-v2 ONA dataset hash kind is unsupported.");
  }
  if (dataset.normalizedUtf8TextSha256 !== null
    && (typeof dataset.normalizedUtf8TextSha256 !== "string"
      || !/^[0-9a-f]{64}$/u.test(dataset.normalizedUtf8TextSha256))) {
    throw new Error("Schema-v2 ONA dataset hash must be a lowercase SHA-256 value or null.");
  }

  exactKeys(
    effective,
    [
      "units", "conversation", "codes", "metadata", "includeMeta", "model", "window",
      "windowSizeBack", "windowSizeForward", "weightBy", "dimensions", "networkType", "mask",
      "rotation", "centerAlignToOrigin", "normalization", "nodePositionMethod",
    ],
    "Schema-v2 ONA effective jENA options",
  );
  if (!isRecord(effective.rotation)) {
    throw new Error("Schema-v2 ONA rotation policy is missing.");
  }
  exactKeys(effective.rotation, ["method"], "Schema-v2 ONA rotation policy");

  exactKeys(modelData, ONA_MODEL_DATA_FIELDS, "Schema-v2 ONA model data");
  exactKeys(
    functionParams,
    [
      "model", "weightBy", "window", "windowSizeBack", "windowSizeForward", "includeMeta",
      "networkType",
    ],
    "Schema-v2 ONA model function parameters",
  );
  if (functionParams.includeMeta !== true) {
    throw new Error("Schema-v2 ONA model function parameters must retain metadata." );
  }

  if (!Array.isArray(modelData.unitLabels)
    || modelData.unitLabels.length < 1
    || modelData.unitLabels.some((label) => (
      typeof label !== "string" || label.length === 0 || label.length > 4_096
    ))
    || new Set(modelData.unitLabels).size !== modelData.unitLabels.length) {
    throw new Error("Schema-v2 ONA unit labels must be unique bounded strings.");
  }
  const unitLabels = modelData.unitLabels as string[];
  if (datasetRowCount < unitLabels.length) {
    throw new Error("Schema-v2 ONA dataset rows must be at least its analytic-unit count.");
  }
  const codeColumns = expectedCodeColumns(config);
  const edgeCount = codeColumns.length;
  const connectionMatrix = asFiniteMatrix(
    modelData.connectionMatrix,
    unitLabels.length,
    edgeCount,
    "Schema-v2 ONA connection matrix",
    true,
  );
  for (let responseIndex = 0; responseIndex < config.codes.length; responseIndex += 1) {
    for (let groundIndex = 0; groundIndex < config.codes.length; groundIndex += 1) {
      if (config.directionalMask!.enabled[groundIndex][responseIndex]) continue;
      const edgeIndex = responseIndex * config.codes.length + groundIndex;
      if (connectionMatrix.some((row) => row[edgeIndex] !== 0)) {
        throw new Error(
          "Schema-v2 ONA disabled directional-mask cells must remain zero in the authoritative connection matrix.",
        );
      }
    }
  }

  exactKeys(rotationSet, ONA_ROTATION_SET_FIELDS, "Schema-v2 ONA rotation set");
  if (!sameJson(rotationSet.codes, config.codes)) {
    throw new Error("Schema-v2 ONA rotation code order contradicts its manifest.");
  }
  const expectedAdjacency = config.codes.flatMap((response, targetIndex) => (
    config.codes.map((ground, sourceIndex) => ({
      source: ground,
      target: response,
      name: `${ground} & ${response}`,
      sourceIndex,
      targetIndex,
    }))
  ));
  const adjacency = asRecordArray(rotationSet.adjacencyKey, "Schema-v2 ONA rotation adjacency");
  if (adjacency.length !== edgeCount) {
    throw new Error("Schema-v2 ONA rotation adjacency contradicts its directed network shape.");
  }
  adjacency.forEach((edge, index) => {
    exactKeys(
      edge,
      ["source", "target", "name", "sourceIndex", "targetIndex"],
      `Schema-v2 ONA adjacency edge ${index + 1}`,
    );
    if (!sameJson(edge, expectedAdjacency[index])) {
      throw new Error("Schema-v2 ONA rotation adjacency contradicts its directed edge contract.");
    }
  });
  const rotationColumns = Array.isArray(rotationSet.rotationColumns)
    ? rotationSet.rotationColumns
    : [];
  const expectedRotationColumns = Array.from({ length: edgeCount }, (_, index) => `SVD${index + 1}`);
  if (!sameJson(rotationColumns, expectedRotationColumns)) {
    throw new Error("Schema-v2 ONA rotation columns contradict its SVD edge space.");
  }
  const rotationMatrix = asFiniteMatrix(
    rotationSet.rotationMatrix,
    edgeCount,
    edgeCount,
    "Schema-v2 ONA rotation matrix",
  );
  if (!Array.isArray(rotationSet.eigenvalues)
    || rotationSet.eigenvalues.length !== edgeCount) {
    throw new Error("Schema-v2 ONA eigenvalues contradict its rotation columns.");
  }
  rotationSet.eigenvalues.forEach((value, index) => {
    asFiniteBundleNumber(value, `Schema-v2 ONA eigenvalue ${index + 1}`, true);
  });
  const eigenvalues = rotationSet.eigenvalues as number[];
  if (!Array.isArray(rotationSet.centerVector)
    || rotationSet.centerVector.length !== edgeCount) {
    throw new Error("Schema-v2 ONA center vector contradicts its edge space.");
  }
  rotationSet.centerVector.forEach((value, index) => {
    asFiniteBundleNumber(value, `Schema-v2 ONA center value ${index + 1}`);
  });
  const centerVector = rotationSet.centerVector as number[];

  const displayedDimensions = expectedRotationColumns.slice(0, 3);
  const nodes = asRecordArray(rotationSet.nodes, "Schema-v2 ONA rotation nodes");
  if (nodes.length !== config.codes.length) {
    throw new Error("Schema-v2 ONA rotation nodes must contain one row per code.");
  }
  nodes.forEach((node, index) => {
    exactKeys(node, ["code", ...displayedDimensions], `Schema-v2 ONA rotation node ${index + 1}`);
    if (node.code !== config.codes[index]) {
      throw new Error("Schema-v2 ONA rotation node order contradicts its codes.");
    }
    displayedDimensions.forEach((dimension) => {
      asFiniteBundleNumber(node[dimension], `Schema-v2 ONA rotation node ${dimension}`);
    });
  });

  exactKeys(tables, ONA_TABLE_FIELDS, "Schema-v2 ONA result tables");
  const tableRows = Object.fromEntries(ONA_TABLE_FIELDS.map((field) => [
    field,
    asRecordArray(tables[field], `Schema-v2 ONA ${field} table`),
  ])) as Record<(typeof ONA_TABLE_FIELDS)[number], Record<string, unknown>[]>;
  if (tableRows.trajectories.length !== 0) {
    throw new Error("Schema-v2 ONA trajectory table must be empty.");
  }
  for (const field of [
    "coordinates", "lineWeights", "connectionCounts", "pointsForProjection", "centroids",
  ] as const) {
    if (tableRows[field].length !== unitLabels.length) {
      throw new Error(`Schema-v2 ONA ${field} table contradicts its analytic-unit cardinality.`);
    }
  }
  const identityFields = uniqueSchemaKeys([
    "ENA_UNIT",
    ...config.unitColumns,
    ...(config.groupColumn ? [config.groupColumn] : []),
  ]);
  tableRows.coordinates.forEach((row, rowIndex) => {
    exactKeys(
      row,
      uniqueSchemaKeys([...identityFields, ...displayedDimensions]),
      `Schema-v2 ONA coordinate row ${rowIndex + 1}`,
    );
    if (row.ENA_UNIT !== unitLabels[rowIndex]) {
      throw new Error("Schema-v2 ONA coordinate units contradict modelData.unitLabels.");
    }
    identityFields.forEach((field) => assertBundleScalar(
      row[field],
      `Schema-v2 ONA coordinate identity ${field}`,
    ));
    for (const field of [
      ...config.unitColumns,
      ...(config.groupColumn ? [config.groupColumn] : []),
    ]) {
      assertDeclaredIdentityScalar(
        row[field],
        `Schema-v2 ONA declared identity ${field}`,
      );
    }
    const tupleLabel = config.unitColumns
      .map((column) => String(row[column] ?? ""))
      .join("::");
    if (tupleLabel !== row.ENA_UNIT) {
      throw new Error("Schema-v2 ONA analytic-unit tuple contradicts its ENA_UNIT label.");
    }
    displayedDimensions.forEach((dimension) => {
      asFiniteBundleNumber(row[dimension], `Schema-v2 ONA coordinate ${dimension}`);
    });
  });
  for (const field of ["lineWeights", "connectionCounts", "pointsForProjection"] as const) {
    tableRows[field].forEach((row, rowIndex) => {
      exactKeys(
        row,
        uniqueSchemaKeys([...identityFields, ...codeColumns]),
        `Schema-v2 ONA ${field} row ${rowIndex + 1}`,
      );
      for (const identityField of identityFields) {
        assertBundleScalar(row[identityField], `Schema-v2 ONA ${field} identity ${identityField}`);
        if (!sameJson(row[identityField], tableRows.coordinates[rowIndex][identityField])) {
          throw new Error(`Schema-v2 ONA ${field} identity contradicts its coordinate row.`);
        }
      }
      codeColumns.forEach((edge, edgeIndex) => {
        const numeric = asFiniteBundleNumber(
          row[edge],
          `Schema-v2 ONA ${field} edge ${edge}`,
          field !== "pointsForProjection",
        );
        if (field === "connectionCounts" && numeric !== connectionMatrix[rowIndex][edgeIndex]) {
          throw new Error("Schema-v2 ONA connection-count table contradicts modelData.connectionMatrix.");
        }
      });
    });
  }
  tableRows.centroids.forEach((row, rowIndex) => {
    exactKeys(row, ["unit", ...displayedDimensions], `Schema-v2 ONA centroid row ${rowIndex + 1}`);
    if (row.unit !== unitLabels[rowIndex]) {
      throw new Error("Schema-v2 ONA centroid units contradict modelData.unitLabels.");
    }
    displayedDimensions.forEach((dimension) => {
      asFiniteBundleNumber(row[dimension], `Schema-v2 ONA centroid ${dimension}`);
    });
  });
  if (!sameJson(tableRows.nodePositions, nodes)) {
    throw new Error("Schema-v2 ONA node-position table contradicts its rotation nodes.");
  }
  if (!sameJson(tableRows.adjacencyKey, adjacency)) {
    throw new Error("Schema-v2 ONA adjacency table contradicts its rotation adjacency.");
  }

  // modelData.connectionMatrix is the one authoritative numeric surface. All
  // retained duplicates must reproduce the runtime's stable scientific chain:
  // raw counts -> sphere normalization -> centering -> SVD projection.
  const expectedLineWeights = connectionMatrix.map(stableSphereNormalizedRow);
  const actualLineWeights = tableRows.lineWeights.map((row) => codeColumns.map((edge) => (
    asFiniteBundleNumber(row[edge], `Schema-v2 ONA normalized line weight ${edge}`, true)
  )));
  expectedLineWeights.forEach((row, rowIndex) => {
    row.forEach((expected, edgeIndex) => {
      assertScientificallyEqual(
        actualLineWeights[rowIndex][edgeIndex],
        expected,
        "Schema-v2 ONA sphere-normalized line weight",
      );
    });
  });

  const nonzeroLineWeights = expectedLineWeights.filter((row) => (
    row.some((value) => value !== 0)
  ));
  if (nonzeroLineWeights.length === 0) {
    throw new Error("Schema-v2 ONA requires at least one analytic unit with network signal.");
  }
  const centerRows = config.centerAlignToOrigin ? nonzeroLineWeights : expectedLineWeights;
  const expectedCenterVector = meanMatrixColumns(centerRows);
  expectedCenterVector.forEach((expected, edgeIndex) => {
    assertScientificallyEqual(
      centerVector[edgeIndex],
      expected,
      "Schema-v2 ONA center vector",
    );
  });
  const expectedProjectionInputs = expectedLineWeights.map((row) => {
    const hasSignal = row.some((value) => value !== 0);
    if (config.centerAlignToOrigin && !hasSignal) return row.map(() => 0);
    return row.map((value, edgeIndex) => value - expectedCenterVector[edgeIndex]);
  });
  const actualProjectionInputs = tableRows.pointsForProjection.map((row) => codeColumns.map((edge) => (
    asFiniteBundleNumber(row[edge], `Schema-v2 ONA centered projection input ${edge}`)
  )));
  expectedProjectionInputs.forEach((row, rowIndex) => {
    row.forEach((expected, edgeIndex) => {
      assertScientificallyEqual(
        actualProjectionInputs[rowIndex][edgeIndex],
        expected,
        "Schema-v2 ONA center-adjusted pointsForProjection",
      );
    });
  });

  for (let leftAxis = 0; leftAxis < edgeCount; leftAxis += 1) {
    for (let rightAxis = leftAxis; rightAxis < edgeCount; rightAxis += 1) {
      const dot = rotationMatrix.reduce((sum, row) => (
        sum + row[leftAxis] * row[rightAxis]
      ), 0);
      assertScientificResidual(
        dot - (leftAxis === rightAxis ? 1 : 0),
        1,
        "Schema-v2 ONA rotation matrix orthogonality",
      );
    }
  }
  const expectedFullCoordinates = multiplyBundleMatrices(expectedProjectionInputs, rotationMatrix);
  const axisEnergies = Array.from({ length: edgeCount }, (_unused, axisIndex) => (
    expectedFullCoordinates.reduce((sum, row) => sum + (row[axisIndex] ?? 0) ** 2, 0)
  ));
  for (let leftAxis = 0; leftAxis < edgeCount; leftAxis += 1) {
    for (let rightAxis = leftAxis + 1; rightAxis < edgeCount; rightAxis += 1) {
      const crossProduct = expectedFullCoordinates.reduce((sum, row) => (
        sum + (row[leftAxis] ?? 0) * (row[rightAxis] ?? 0)
      ), 0);
      assertScientificResidual(
        crossProduct,
        Math.sqrt(axisEnergies[leftAxis] * axisEnergies[rightAxis]),
        "Schema-v2 ONA SVD rotation axes",
      );
    }
  }
  const eigenvalueDivisor = Math.max(1, unitLabels.length - 1);
  eigenvalues.forEach((actual, axisIndex) => {
    assertScientificallyEqual(
      actual,
      axisEnergies[axisIndex] / eigenvalueDivisor,
      `Schema-v2 ONA rotation eigenvalue ${axisIndex + 1}`,
    );
    if (axisIndex > 0
      && actual > eigenvalues[axisIndex - 1] + scientificTolerance(actual, eigenvalues[axisIndex - 1])) {
      throw new Error("Schema-v2 ONA rotation eigenvalues contradict descending SVD axis order.");
    }
  });
  tableRows.coordinates.forEach((row, rowIndex) => {
    displayedDimensions.forEach((dimension, axisIndex) => {
      assertScientificallyEqual(
        row[dimension] as number,
        expectedFullCoordinates[rowIndex][axisIndex],
        `Schema-v2 ONA projected coordinate ${dimension}`,
      );
    });
  });

  const expectedNodeGeometry = directedNodePositions(
    expectedLineWeights,
    expectedFullCoordinates.map((row) => row.slice(0, displayedDimensions.length)),
  );
  nodes.forEach((node, nodeIndex) => {
    displayedDimensions.forEach((dimension, axisIndex) => {
      assertScientificallyEqual(
        node[dimension] as number,
        expectedNodeGeometry.nodes[nodeIndex][axisIndex],
        `Schema-v2 ONA directed-node position ${dimension}`,
      );
    });
  });
  tableRows.centroids.forEach((row, rowIndex) => {
    displayedDimensions.forEach((dimension, axisIndex) => {
      assertScientificallyEqual(
        row[dimension] as number,
        expectedNodeGeometry.centroids[rowIndex][axisIndex],
        `Schema-v2 ONA directed-node centroid ${dimension}`,
      );
    });
  });

  const fullAxisVariances = Array.from({ length: edgeCount }, (_unused, axisIndex) => (
    sampleVariance(expectedFullCoordinates.map((row) => row[axisIndex])) ?? 0
  ));
  const fullVarianceTotal = fullAxisVariances.reduce((sum, value) => sum + value, 0);
  const expectedVariance = fullAxisVariances.map((value) => (
    fullVarianceTotal === 0 ? 0 : value / fullVarianceTotal
  ));

  exactKeys(
    result,
    [
      "model", "units", "points", "groups", "dimensions", "variance", "statsDiagnostics",
      "projectionReference", "analyzedAt",
    ],
    "Schema-v2 ONA manifest result",
  );
  if (result.model !== "EndPoint"
    || result.units !== unitLabels.length
    || result.points !== tableRows.coordinates.length
    || result.projectionReference !== null
    || !sameJson(result.dimensions, displayedDimensions)
    || !sameJson(result.statsDiagnostics, statisticsDiagnostics)) {
    throw new Error("Schema-v2 ONA result summary contradicts its model tables or diagnostics.");
  }
  asBoundedBundleString(result.analyzedAt, "Schema-v2 ONA analyzed timestamp");
  const resultVariance = result.variance;
  if (!isRecord(resultVariance)) {
    throw new Error("Schema-v2 ONA variance summary is missing.");
  }
  exactKeys(resultVariance, expectedRotationColumns, "Schema-v2 ONA variance summary");
  expectedRotationColumns.forEach((dimension, axisIndex) => {
    const actual = asFiniteBundleNumber(
      resultVariance[dimension],
      `Schema-v2 ONA variance ${dimension}`,
      true,
    );
    assertScientificallyEqual(
      actual,
      expectedVariance[axisIndex],
      `Schema-v2 ONA full-axis variance ${dimension}`,
    );
  });
  const manifestGroups = asRecordArray(result.groups, "Schema-v2 ONA manifest groups");
  let manifestUnitCount = 0;
  const manifestGroupNames = new Set<string>();
  manifestGroups.forEach((group, index) => {
    exactKeys(group, ["name", "count"], `Schema-v2 ONA manifest group ${index + 1}`);
    const name = asBoundedBundleString(
      group.name,
      `Schema-v2 ONA manifest group ${index + 1} name`,
    );
    if (manifestGroupNames.has(name)) {
      throw new Error("Schema-v2 ONA manifest group names must be unique.");
    }
    manifestGroupNames.add(name);
    manifestUnitCount += asSafeBundleInteger(
      group.count,
      `Schema-v2 ONA manifest group ${index + 1} count`,
      1,
    );
  });
  if (manifestUnitCount !== unitLabels.length) {
    throw new Error("Schema-v2 ONA manifest group counts contradict its analytic units.");
  }
  if (config.groupColumn) {
    const tableGroupCounts = new Map<string, number>();
    tableRows.coordinates.forEach((row) => {
      const name = String(row[config.groupColumn!]);
      if (!manifestGroupNames.has(name)) {
        throw new Error("Schema-v2 ONA table group membership is absent from its manifest groups.");
      }
      tableGroupCounts.set(name, (tableGroupCounts.get(name) ?? 0) + 1);
    });
    manifestGroups.forEach((group) => {
      if (tableGroupCounts.get(group.name as string) !== group.count) {
        throw new Error("Schema-v2 ONA manifest group counts contradict table group membership.");
      }
    });
  } else if (manifestGroups.length !== 1
    || manifestGroups[0].name !== "All units"
    || manifestGroups[0].count !== unitLabels.length) {
    throw new Error("Schema-v2 ONA without a group column must declare exactly All units.");
  }

  exactKeys(
    statisticsDiagnostics,
    ["correlations", "tests", "correlationUnitLimit"],
    "Schema-v2 ONA statistics diagnostics",
  );
  if (statisticsDiagnostics.correlations !== "not-applicable-ordered-network"
    || statisticsDiagnostics.tests !== "not-applicable-ordered-network") {
    throw new Error("Schema-v2 ONA statistics diagnostics contradict descriptive-only scope.");
  }
  asSafeBundleInteger(
    statisticsDiagnostics.correlationUnitLimit,
    "Schema-v2 ONA correlation unit limit",
    1,
  );
  exactAllowedKeys(
    statistics,
    ["dimensions", "correlations", "groups"],
    ["dimensions", "correlations"],
    "Schema-v2 ONA statistics",
  );
  const dimensionStats = asRecordArray(statistics.dimensions, "Schema-v2 ONA dimension statistics");
  if (dimensionStats.length !== displayedDimensions.length) {
    throw new Error("Schema-v2 ONA dimension statistics contradict displayed dimensions.");
  }
  dimensionStats.forEach((row, index) => {
    exactKeys(
      row,
      ["dimension", "n", "mean", "sd", "variance", "min", "max"],
      `Schema-v2 ONA dimension statistic ${index + 1}`,
    );
    if (row.dimension !== displayedDimensions[index]
      || row.n !== unitLabels.length) {
      throw new Error("Schema-v2 ONA dimension statistics contradict its unit or axis contract.");
    }
    const values = expectedFullCoordinates.map((coordinates) => coordinates[index]);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = sampleVariance(values);
    const expectedStatistics = {
      mean,
      sd: variance === null ? null : Math.sqrt(variance),
      variance,
      min: Math.min(...values),
      max: Math.max(...values),
    };
    for (const field of ["mean", "min", "max"] as const) {
      const actual = asFiniteBundleNumber(
        row[field],
        `Schema-v2 ONA dimension statistic ${field}`,
      );
      assertScientificallyEqual(
        actual,
        expectedStatistics[field],
        `Schema-v2 ONA dimension statistic ${field}`,
      );
    }
    for (const field of ["sd", "variance"] as const) {
      if (expectedStatistics[field] === null) {
        if (row[field] !== null) {
          throw new Error(`Schema-v2 ONA dimension statistic ${field} must be not estimable.`);
        }
        continue;
      }
      const actual = asFiniteBundleNumber(
        row[field],
        `Schema-v2 ONA dimension statistic ${field}`,
        true,
      );
      assertScientificallyEqual(
        actual,
        expectedStatistics[field],
        `Schema-v2 ONA dimension statistic ${field}`,
      );
    }
  });
  if (!Array.isArray(statistics.correlations) || statistics.correlations.length !== 0) {
    throw new Error("Schema-v2 ONA correlation statistics must remain unavailable.");
  }
  if (config.groupColumn) {
    const groupStats = asRecordArray(statistics.groups, "Schema-v2 ONA group statistics");
    if (groupStats.length !== manifestGroups.length) {
      throw new Error("Schema-v2 ONA group statistics contradict its manifest groups.");
    }
    groupStats.forEach((row, index) => {
      exactKeys(row, ["group", "n", "means"], `Schema-v2 ONA group statistic ${index + 1}`);
      if (row.group !== manifestGroups[index].name || row.n !== manifestGroups[index].count) {
        throw new Error("Schema-v2 ONA group statistics contradict its manifest group identity.");
      }
      const means = row.means;
      if (!isRecord(means)) throw new Error("Schema-v2 ONA group means are missing.");
      exactKeys(means, displayedDimensions, `Schema-v2 ONA group means ${index + 1}`);
      const groupName = manifestGroups[index].name as string;
      const groupRowIndices = tableRows.coordinates.flatMap((coordinate, rowIndex) => (
        String(coordinate[config.groupColumn!]) === groupName ? [rowIndex] : []
      ));
      if (groupRowIndices.length !== row.n) {
        throw new Error("Schema-v2 ONA group statistics contradict table group membership.");
      }
      displayedDimensions.forEach((dimension, axisIndex) => {
        const actual = asFiniteBundleNumber(
          means[dimension],
          `Schema-v2 ONA group mean ${dimension}`,
        );
        const expected = groupRowIndices.reduce((sum, rowIndex) => (
          sum + expectedFullCoordinates[rowIndex][axisIndex]
        ), 0) / groupRowIndices.length;
        assertScientificallyEqual(
          actual,
          expected,
          `Schema-v2 ONA group mean ${dimension}`,
        );
      });
    });
  } else if (Object.hasOwn(statistics, "groups")) {
    throw new Error("Schema-v2 ONA statistics cannot add groups without a comparison field.");
  }

  exactAllowedKeys(
    presentation,
    ONA_PRESENTATION_FIELDS,
    [
      "selectedAxes", "flipX", "flipY", "edgeThreshold", "showNetworks", "showPoints",
      "showTrajectories", "showLabels", "showGroupLabels", "showUnitLabels", "showVariance",
      "edgeScale", "pointScale", "plotZoom",
    ],
    "Schema-v2 ONA presentation",
  );
  if (!Array.isArray(presentation.selectedAxes)
    || presentation.selectedAxes.length !== 2
    || presentation.selectedAxes.some((axis) => (
      typeof axis !== "string" || !displayedDimensions.includes(axis)
    ))) {
    throw new Error("Schema-v2 ONA presentation axes contradict its displayed dimensions.");
  }
  for (const field of [
    "flipX", "flipY", "showNetworks", "showPoints", "showTrajectories", "showLabels",
    "showGroupLabels", "showUnitLabels", "showVariance",
  ] as const) {
    if (typeof presentation[field] !== "boolean") {
      throw new Error(`Schema-v2 ONA presentation ${field} must be boolean.`);
    }
  }
  for (const field of ["edgeThreshold", "edgeScale", "pointScale", "plotZoom"] as const) {
    asFiniteBundleNumber(presentation[field], `Schema-v2 ONA presentation ${field}`, true);
  }
  if (Object.hasOwn(presentation, "codeColors")) {
    if (!isRecord(presentation.codeColors)) {
      throw new Error("Schema-v2 ONA presentation code colors are invalid.");
    }
    exactKeys(presentation.codeColors, config.codes, "Schema-v2 ONA presentation code colors");
    for (const color of Object.values(presentation.codeColors)) {
      if (typeof color !== "string" || !/^#[0-9a-f]{6}$/iu.test(color)) {
        throw new Error("Schema-v2 ONA presentation code colors must be six-digit hex values.");
      }
    }
  }
  if (Object.hasOwn(presentation, "selectedGroupOrder")) {
    const selectedGroupOrder = presentation.selectedGroupOrder;
    if (!Array.isArray(selectedGroupOrder)
      || selectedGroupOrder.length !== 2
      || selectedGroupOrder.some((group) => typeof group !== "string")) {
      throw new Error("Schema-v2 ONA selected group order is invalid.");
    }
    if (selectedGroupOrder[0] === selectedGroupOrder[1]
      || selectedGroupOrder.some((group) => !manifestGroupNames.has(group))) {
      throw new Error(
        "Schema-v2 ONA selected group order must contain two distinct declared manifest groups.",
      );
    }
  }

  if (!Array.isArray(manifest.boundaries)
    || manifest.boundaries.some((boundary) => typeof boundary !== "string")) {
    throw new Error("Schema-v2 ONA manifest boundaries must be strings.");
  }
  if (manifest.runtime !== "jena-js"
    || typeof manifest.runtimeVersion !== "string"
    || typeof manifest.appVersion !== "string"
    || typeof manifest.generatedAt !== "string") {
    throw new Error("Schema-v2 ONA manifest runtime identity is invalid.");
  }
}

// Historical standard-ENA bundles retain a defensive deny-list because their
// dynamic trajectory rows predate the closed schema. Schema-v2 ONA is instead
// accepted only through assertOnaBundleContract's complete allow-listed shape.
const FORBIDDEN_ROW_LEVEL_BUNDLE_KEYS = new Set([
  "rawRows",
  "metaData",
  "rowConnectionCounts",
  "rowWindowProvenance",
  "orderedAudit",
  "responseRowSourceIndices",
  "responseRowIndex",
  "responseRowIndices",
  "previousRowIndex",
  "previousResponseRowIndices",
  "priorRowCount",
  "priorRowCounts",
  "horizonIdentity",
  "horizonOrdinals",
  "edgeValues",
]);

function containsForbiddenRowLevelKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenRowLevelKey);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, nested]) => (
    FORBIDDEN_ROW_LEVEL_BUNDLE_KEYS.has(key) || containsForbiddenRowLevelKey(nested)
  ));
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
  if (value.manifest.schemaVersion !== value.schemaVersion) {
    throw new Error("Analysis bundle outer and nested schema versions must match.");
  }
  const parsedConfiguration = parseManifestContract(value.manifest, value.modelData);
  if (value.schemaVersion === 1 && parsedConfiguration.analysisKind !== "ena") {
    throw new Error("Legacy schema-v1 bundles are ENA-only and cannot contain ordered analysis.");
  }
  assertOnaBundleContract(value, parsedConfiguration);
  if (parsedConfiguration.analysisKind === "ena" && containsForbiddenRowLevelKey(value)) {
    throw new Error("Generic analysis bundles cannot contain raw or row-level analysis data.");
  }
  if (value.schemaVersion === 1) {
    if ("inference" in value) throw new Error("Schema-v1 analysis bundles cannot contain v2 inference.");
    return freezeParsed(value as OpenEnaAnalysisBundleV1);
  }
  if (!("inference" in value)) throw new Error("Schema-v2 analysis bundle must contain inference.");
  if (parsedConfiguration.analysisKind === "ona"
    && (value.inference !== null || value.groupContrast !== null)) {
    throw new Error("Generic ONA bundles are descriptive-only and cannot contain inference or group contrast.");
  }
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
