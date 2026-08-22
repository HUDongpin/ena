"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ModelType, Row, WindowType } from "jena-js";
import type { Locale } from "@/lib/i18n";
import { getOpenEnaAuthCopy } from "@/lib/open-ena-auth-copy";
import { getOpenEnaCopy, isOpenEnaLocalizedLocale } from "@/lib/open-ena-i18n";
import { buildManifest, dimensionEffect } from "@/lib/open-ena/analyze";
import { analyzeDatasetInWorker } from "@/lib/open-ena/client";
import {
  beginAnalysisFamilyConfiguration,
  createAnalysisFamilyDrafts,
  switchAnalysisFamily,
  type OpenEnaAnalysisFamilyDrafts,
} from "@/lib/open-ena/analysis-family";
import { openEnaAnalysisKindFromResult } from "@/lib/open-ena/capabilities";
import {
  analysisKindFor,
  cloneOpenEnaConfig,
  reconcileDirectionalMask,
} from "@/lib/open-ena/network-config";
import { buildOpenEnaOnaDataView } from "@/lib/open-ena/ona-data-view";
import {
  buildOpenEnaOnaAggregateEdgeExport,
  buildOpenEnaOnaDeidentifiedAuditExport,
} from "@/lib/open-ena/ona-export";
import {
  isOpenEnaOrderPanelValueComplete,
  orderPolicyFromPanelValue,
  type OpenEnaOrderPanelValue,
} from "@/lib/open-ena/ona-order-preview";
import {
  inferConfig,
  officialComparisonRotation,
  parseCsv,
  validateConfig,
} from "@/lib/open-ena/csv";
import { codedDataFileKind, parseXlsx } from "@/lib/open-ena/spreadsheet";
import { filterSourceEvidence } from "@/lib/open-ena/evidence";
import {
  buildPairwiseGroupContrast,
  buildPairwiseGroupContrastExport,
  pairwiseGroupContrastEdgesToCsv,
} from "@/lib/open-ena/contrasts";
import {
  buildLongitudinalDerivation,
  buildLongitudinalGroupCentroidExport,
  inferLongitudinalMappingDefaults,
  longitudinalInferenceRowsToCsv,
  longitudinalPeriodRowsToCsv,
  sliceLongitudinalIndependentPeriod,
  sliceLongitudinalPairedPeriods,
  sliceLongitudinalRepeatedPeriods,
  OpenEnaLongitudinalIntegrityError,
  type OpenEnaLongitudinalCohortPolicy,
} from "@/lib/open-ena/longitudinal";
import {
  OpenEnaInferenceIntegrityError,
  runOpenEnaInferenceV2,
  type OpenEnaInferenceRequestV2,
  type OpenEnaInferenceResultV2,
} from "@/lib/open-ena/inference-v2";
import { buildMethodsReport, referenceMeanRotationInterpretation } from "@/lib/open-ena/methods";
import { buildOpenEnaAiInterpretationRequest } from "@/lib/open-ena/ai-interpretation";
import { buildAnalysisBundle, buildResultTables, rowsToCsv } from "@/lib/open-ena/export";
import { codeColorFor, updateCodeColor } from "@/lib/open-ena/plot-style";
import {
  cameraForPreset,
  type OpenEna3dAspectRatio,
  type OpenEna3dCamera,
} from "@/lib/open-ena/plot3d";
import {
  buildReferenceRotationPackage,
  parseRotationReference,
  validateReferenceCompatibility,
} from "@/lib/open-ena/reference";
import {
  buildAnalysisSet,
  buildSetComparisonExport,
  compareAnalysisSets,
  haveCompatibleSetGeometry,
  removeAnalysisSet,
  repairSetSelection,
  setComparisonEdgesToCsv,
  upsertAnalysisSet,
} from "@/lib/open-ena/sets";
import {
  JENA_RUNTIME_VERSION,
  SAMPLE_CONFIG,
  SAMPLE_DATASET_URL,
  TRAJECTORY_SAMPLE_CONFIG,
  TRAJECTORY_SAMPLE_DATASET_URL,
  datasetHashKindFor,
  sameOpenEnaConfig,
  type AnalysisKind,
  type CameraPreset,
  type OpenEnaAnalysisSet,
  type OpenEnaConfig,
  type OpenEnaMode,
  type OpenEnaResult,
  type OpenEnaRotationReference,
  type OpenEnaView,
  type ParsedDataset,
} from "@/lib/open-ena/types";
import OpenEnaPlot, { MiniNetwork } from "./OpenEnaPlot";
import OpenEnaInteractive3DPlot from "./OpenEnaInteractive3DPlot";
import OpenEna3DGroupContrast from "./OpenEna3DGroupContrast";
import OpenEnaDataView, {
  type OpenEnaDataViewColumn,
  type OpenEnaDataViewContext,
  type OpenEnaDataViewRow,
} from "./OpenEnaDataView";
import { OpenEnaAnalysisFamilyControl } from "./OpenEnaAnalysisFamilyControl";
import { OpenEnaDirectionalMaskEditor } from "./OpenEnaDirectionalMaskEditor";
import OpenEnaOrderedResultLayout from "./OpenEnaOrderedResultLayout";
import OpenEnaOnaStats from "./OpenEnaOnaStats";
import { OpenEnaOrderPanel } from "./OpenEnaOrderPanel";
import OpenEnaGroupContrast from "./OpenEnaGroupContrast";
import OpenEnaLongitudinalTrajectory from "./OpenEnaLongitudinalTrajectory";
import OpenEnaPersistentPlotTools from "./OpenEnaPersistentPlotTools";
import OpenEnaSetComparison from "./OpenEnaSetComparison";
import OpenEnaAiInterpretation from "./OpenEnaAiInterpretation";
import OpenEnaInferencePanel, {
  type OpenEnaInferenceDesignChoice,
  type OpenEnaInferencePreview,
} from "./OpenEnaInferencePanel";

interface OpenEnaWorkspaceProps {
  locale: Locale;
}

type OpenEnaModelPanelTab = "units" | "horizons" | "windows" | "codes";
type OpenEnaCenterSurface = "plot" | "data";
type OpenEnaStatsTab = "comparison" | "goodness" | "variance";

const MODEL_TAB_ORDER = ["units", "horizons", "windows", "codes"] as const;
const STATS_TAB_ORDER = ["comparison", "goodness", "variance"] as const;

const modeIcons: Record<OpenEnaMode, React.ReactNode> = {
  sets: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v5H4zm0 8h16v5H4z" /><path d="M7 8h.01M7 16h.01" /></svg>
  ),
  data: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v13H4zM4 10h16M9 5.5v13" /></svg>
  ),
  model: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="7" r="2.2" /><circle cx="18" cy="6" r="2.2" /><circle cx="12" cy="18" r="2.2" /><path d="m8 7 7.8-.8M7.4 8.7l3.5 7.4m5.6-8.2-3.4 8.2" /></svg>
  ),
  plot: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5V4.5M4 19.5h16" /><path d="m6.5 15 4-4 3 2 5-6" /></svg>
  ),
  stats: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V11h3v8zm6 0V5h3v14zm6 0V8h3v11z" /></svg>
  ),
  ai: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="4" /><path d="m7.5 15 2.2-6 2.2 6M8.2 13h3M15 9v6" /></svg>
  ),
};

async function sha256Hex(text: string) {
  const bytes = new TextEncoder().encode(text.replace(/^\uFEFF/, ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadText(filename: string, contents: string, type: string) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function downloadJson(filename: string, data: unknown, compact = false) {
  downloadText(filename, `${JSON.stringify(data, null, compact ? undefined : 2)}\n`, "application/json;charset=utf-8");
}

function tableHeaders(rows: Row[]) {
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

function formatStatistic(value: number | undefined, digits = 3, notEstimable = "Not estimable") {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : notEstimable;
}

function formatCopyTemplate(
  template: string,
  values: Readonly<Record<string, string | number>>,
) {
  return template.replace(/\{([A-Za-z0-9]+)\}/gu, (placeholder, key: string) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : placeholder
  ));
}

function officialPlotAxisLabel(axis: string) {
  return axis === "MR1" ? "GMR1" : axis;
}

function toggleInSelectionOrder(selected: readonly string[], header: string, checked: boolean) {
  return checked
    ? selected.includes(header) ? [...selected] : [...selected, header]
    : selected.filter((candidate) => candidate !== header);
}

function toggleInHeaderOrder(headers: readonly string[], selected: readonly string[], header: string, checked: boolean) {
  const next = new Set(selected);
  if (checked) next.add(header);
  else next.delete(header);
  return headers.filter((candidate) => next.has(candidate));
}

function validateWorkspaceConfig(
  dataset: ParsedDataset,
  config: OpenEnaConfig,
  reference: OpenEnaRotationReference | null,
) {
  const errors = validateConfig(dataset, config);
  if (config.rotation === "reference") {
    if (!reference) errors.push("The imported reference rotation is not available in this browser session.");
    else errors.push(...validateReferenceCompatibility(config, reference));
  }
  return [...new Set(errors)];
}

function orderPanelValueFromConfig(config: OpenEnaConfig): OpenEnaOrderPanelValue {
  const policy = config.orderPolicy;
  return {
    policyKind: policy?.kind ?? "columns",
    columns: policy?.kind === "columns" ? [...policy.columns] : [],
    comparators: policy?.kind === "columns" ? { ...policy.comparators } : {},
    sourceRowConfirmed: policy?.kind === "source-row" && policy.confirmed === true,
    windowSizeBack: config.windowSizeBack,
  };
}

export default function OpenEnaWorkspace({ locale }: OpenEnaWorkspaceProps) {
  const copy = getOpenEnaCopy(locale);
  const authCopy = getOpenEnaAuthCopy(locale);
  const workspaceIsLocalized = isOpenEnaLocalizedLocale(locale);
  const cameraPositionOptions: Array<[CameraPreset, string]> = [
    ["isometric", copy.plot.default3dCamera],
    ["xy", copy.plot.xy],
    ["xz", copy.plot.xz],
    ["yz", copy.plot.yz],
    ["yx", copy.plot.yx],
    ["zx", copy.plot.zx],
    ["zy", copy.plot.zy],
  ];
  const [mode, setMode] = useState<OpenEnaMode>("sets");
  const [modelTab, setModelTab] = useState<OpenEnaModelPanelTab>("units");
  const [trajectoryModelFocusRequest, setTrajectoryModelFocusRequest] = useState(0);
  const [statsTab, setStatsTab] = useState<OpenEnaStatsTab>("comparison");
  const [centerSurface, setCenterSurface] = useState<OpenEnaCenterSurface>("plot");
  const [view, setView] = useState<OpenEnaView>("2d");
  const [dataset, setDataset] = useState<ParsedDataset | null>(null);
  const [config, setConfig] = useState<OpenEnaConfig>(SAMPLE_CONFIG);
  const [analysisFamilyDrafts, setAnalysisFamilyDrafts] = useState<OpenEnaAnalysisFamilyDrafts>(
    () => createAnalysisFamilyDrafts(SAMPLE_CONFIG),
  );
  const [directionalMaskOpen, setDirectionalMaskOpen] = useState(false);
  const [codeColors, setCodeColors] = useState<Record<string, string>>({});
  const [resultConfig, setResultConfig] = useState<OpenEnaConfig | null>(null);
  const [datasetHash, setDatasetHash] = useState<string | null>(null);
  const [result, setResult] = useState<OpenEnaResult | null>(null);
  const [rotationReference, setRotationReference] = useState<OpenEnaRotationReference | null>(null);
  const [analysisSets, setAnalysisSets] = useState<OpenEnaAnalysisSet[]>([]);
  const [primarySetId, setPrimarySetId] = useState<string | null>(null);
  const [secondarySetId, setSecondarySetId] = useState<string | null>(null);
  const [primaryGroupName, setPrimaryGroupName] = useState("");
  const [secondaryGroupName, setSecondaryGroupName] = useState("");
  const [activeComparisonSurface, setActiveComparisonSurface] = useState<"groups" | "sets">("groups");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sourceBusy, setSourceBusy] = useState(false);
  const [referenceBusy, setReferenceBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStage, setProgressStage] = useState<"accumulate" | "model">("accumulate");
  const [xDimension, setXDimension] = useState("SVD1");
  const [yDimension, setYDimension] = useState("SVD2");
  const [zDimension, setZDimension] = useState("SVD3");
  const [camera, setCamera] = useState<CameraPreset>("isometric");
  const [interactive3dCamera, setInteractive3dCamera] = useState<OpenEna3dCamera | null>(null);
  const [interactive3dAspectRatio, setInteractive3dAspectRatio] = useState<OpenEna3dAspectRatio | null>(null);
  const [showPoints, setShowPoints] = useState(true);
  const [showNetworks, setShowNetworks] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showGroupLabels, setShowGroupLabels] = useState(true);
  const [showUnitLabels, setShowUnitLabels] = useState(false);
  const [unitCircle, setUnitCircle] = useState(false);
  const [showVariance, setShowVariance] = useState(true);
  const [showTrajectories, setShowTrajectories] = useState(true);
  const [showGroupCentroidPaths, setShowGroupCentroidPaths] = useState(true);
  const [repeatedEntityColumns, setRepeatedEntityColumns] = useState<string[]>([]);
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [timeColumn, setTimeColumn] = useState("");
  const [longitudinalTimeOrder, setLongitudinalTimeOrder] = useState<string[]>([]);
  const [cohortPolicy, setCohortPolicy] = useState<OpenEnaLongitudinalCohortPolicy>("available");
  const [inferenceDesign, setInferenceDesign] = useState<OpenEnaInferenceDesignChoice | null>(null);
  const [inferencePrimaryGroup, setInferencePrimaryGroup] = useState("");
  const [inferenceSecondaryGroup, setInferenceSecondaryGroup] = useState("");
  const [inferenceGroup, setInferenceGroup] = useState<string | null>(null);
  const [inferencePeriod, setInferencePeriod] = useState("");
  const [inferenceEarlierPeriod, setInferenceEarlierPeriod] = useState("");
  const [inferenceLaterPeriod, setInferenceLaterPeriod] = useState("");
  const [inferenceRepeatedPeriods, setInferenceRepeatedPeriods] = useState<string[]>([]);
  const [lastInference, setLastInference] = useState<OpenEnaInferenceResultV2 | null>(null);
  const [lastInferenceRequestKey, setLastInferenceRequestKey] = useState<string | null>(null);
  const [inferenceRunning, setInferenceRunning] = useState(false);
  const [inferenceIntegrityError, setInferenceIntegrityError] = useState<string | null>(null);
  const [edgeScale, setEdgeScale] = useState(1);
  const [edgeThreshold, setEdgeThreshold] = useState(0);
  const [pointScale, setPointScale] = useState(1);
  const [textScale, setTextScale] = useState(1);
  const [plotZoom, setPlotZoom] = useState(1);
  const [plotResetRevision, setPlotResetRevision] = useState(0);
  const [plotSettingsOpen, setPlotSettingsOpen] = useState(false);
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);
  const [sourceQuery, setSourceQuery] = useState("");
  const [activeCodesOnly, setActiveCodesOnly] = useState(false);
  const [sourcePage, setSourcePage] = useState(0);
  const [methodsCopyStatus, setMethodsCopyStatus] = useState("");
  const [resultTable, setResultTable] = useState<"coordinates" | "lineWeights" | "connectionCounts" | "trajectories" | "centroids" | "nodePositions" | "adjacencyKey">("coordinates");
  const [dataViewContext, setDataViewContext] = useState<OpenEnaDataViewContext>("comparison");
  const [onaStatsContext, setOnaStatsContext] = useState<OpenEnaDataViewContext>("comparison");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const plotSvgRef = useRef<SVGSVGElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sourceAbortRef = useRef<AbortController | null>(null);
  const referenceImportRef = useRef<object | null>(null);
  const datasetGenerationRef = useRef(0);
  const groupSelectionColumnRef = useRef<string | null>(null);
  const inferenceGenerationRef = useRef(0);
  const inferenceRequestKeyRef = useRef<string | null>(null);
  const trajectoryModelFocusHandledRef = useRef(0);
  const modelTypeSelectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => () => {
    abortRef.current?.abort();
    sourceAbortRef.current?.abort();
    referenceImportRef.current = null;
  }, []);

  useEffect(() => {
    if (trajectoryModelFocusRequest === trajectoryModelFocusHandledRef.current || modelTab !== "windows") return;
    trajectoryModelFocusHandledRef.current = trajectoryModelFocusRequest;
    modelTypeSelectRef.current?.focus();
  }, [modelTab, trajectoryModelFocusRequest]);

  const configErrors = useMemo(
    () => dataset ? validateWorkspaceConfig(dataset, config, rotationReference) : [],
    [dataset, config, rotationReference],
  );
  const currentAnalysisKind = analysisKindFor(config);
  const completedResultKind = useMemo(
    () => result ? openEnaAnalysisKindFromResult(result) : null,
    [result],
  );
  const capabilityAnalysisKind = completedResultKind ?? currentAnalysisKind;
  const onaCapabilityDisabled = capabilityAnalysisKind === "ona";
  const resultIsStale = Boolean(result && resultConfig && !sameOpenEnaConfig(config, resultConfig));
  const canRun = Boolean(dataset && configErrors.length === 0 && !sourceBusy && !referenceBusy && !loading);
  const manifest = useMemo(
    () => dataset && result && resultConfig
      ? buildManifest(dataset, resultConfig, result, datasetHash)
      : null,
    [dataset, datasetHash, result, resultConfig],
  );
  const resultTables = useMemo(() => result ? buildResultTables(result) : null, [result]);
  const resultUnitCount = useMemo(
    () => result ? new Set(result.set.points.map((row) => String(row.ENA_UNIT ?? ""))).size : 0,
    [result],
  );
  const sourceEvidenceRows = useMemo(
    () => dataset ? filterSourceEvidence(dataset, config, { query: sourceQuery, activeCodesOnly }) : [],
    [activeCodesOnly, config, dataset, sourceQuery],
  );
  const sourcePageSize = 100;
  const sourcePageCount = Math.max(1, Math.ceil(sourceEvidenceRows.length / sourcePageSize));
  const safeSourcePage = Math.min(sourcePage, sourcePageCount - 1);
  const visibleSourceRows = sourceEvidenceRows.slice(
    safeSourcePage * sourcePageSize,
    (safeSourcePage + 1) * sourcePageSize,
  );
  const currentResultGroupNames = useMemo(
    () => result?.groups.map((group) => group.name) ?? [],
    [result],
  );
  const currentResultGroupKey = currentResultGroupNames.join("\u001f");

  useEffect(() => {
    const endpointGroupsAvailable = Boolean(
      result
      && resultConfig?.groupColumn
      && result.set.modelType === "EndPoint"
      && currentResultGroupNames.length >= 2,
    );
    if (!endpointGroupsAvailable) {
      groupSelectionColumnRef.current = null;
      if (primaryGroupName) setPrimaryGroupName("");
      if (secondaryGroupName) setSecondaryGroupName("");
      return;
    }
    const sameGroupingField = groupSelectionColumnRef.current === resultConfig?.groupColumn;
    const nextPrimary = sameGroupingField && currentResultGroupNames.includes(primaryGroupName)
      ? primaryGroupName
      : currentResultGroupNames[0];
    const nextSecondary = sameGroupingField && currentResultGroupNames.includes(secondaryGroupName)
      && secondaryGroupName !== nextPrimary
      ? secondaryGroupName
      : currentResultGroupNames.find((group) => group !== nextPrimary) ?? "";
    groupSelectionColumnRef.current = resultConfig?.groupColumn ?? null;
    if (nextPrimary !== primaryGroupName) setPrimaryGroupName(nextPrimary);
    if (nextSecondary !== secondaryGroupName) setSecondaryGroupName(nextSecondary);
  }, [currentResultGroupKey, primaryGroupName, result, resultConfig, secondaryGroupName]);

  const trajectoryMappingKey = result && resultConfig && result.set.modelType !== "EndPoint"
    ? `${result.analyzedAt}\u001f${resultConfig.unitColumns.join("\u001e")}\u001f${resultConfig.conversationColumns.join("\u001e")}\u001f${resultConfig.groupColumn ?? ""}`
    : "";
  useEffect(() => {
    if (!result || !resultConfig || result.set.modelType === "EndPoint") {
      setRepeatedEntityColumns([]);
      setIdentityConfirmed(false);
      setTimeColumn("");
      return;
    }
    const defaults = inferLongitudinalMappingDefaults(resultConfig);
    const nextEntityColumns = resultConfig.unitColumns.filter((column) => column !== resultConfig.groupColumn);
    const nextTimeColumn = defaults.timeColumn
      && !nextEntityColumns.includes(defaults.timeColumn)
      ? defaults.timeColumn
      : resultConfig.conversationColumns.find((column) => (
          column !== resultConfig.groupColumn && !nextEntityColumns.includes(column)
        )) ?? "";
    setRepeatedEntityColumns(nextEntityColumns);
    setIdentityConfirmed(false);
    setTimeColumn(nextTimeColumn);
  }, [trajectoryMappingKey]);

  const observedLongitudinalTimeOrder = useMemo(() => {
    if (!dataset || !timeColumn) return [];
    const seen = new Set<string>();
    const order: string[] = [];
    for (const row of dataset.rows) {
      const value = String(row[timeColumn] ?? "");
      if (value && !seen.has(value)) {
        seen.add(value);
        order.push(value);
      }
    }
    return order;
  }, [dataset, timeColumn]);
  const observedLongitudinalTimeOrderKey = observedLongitudinalTimeOrder.join("\u001f");

  useEffect(() => {
    setLongitudinalTimeOrder(observedLongitudinalTimeOrder);
  }, [observedLongitudinalTimeOrderKey, result?.analyzedAt, timeColumn]);

  function updateLongitudinalSettings(update: {
    repeatedEntityColumns?: string[];
    identityConfirmed?: boolean;
    timeColumn?: string;
    cohortPolicy?: OpenEnaLongitudinalCohortPolicy;
  }) {
    if (update.repeatedEntityColumns !== undefined) {
      setRepeatedEntityColumns(update.repeatedEntityColumns);
      setIdentityConfirmed(false);
    }
    if (update.identityConfirmed !== undefined) setIdentityConfirmed(update.identityConfirmed);
    if (update.timeColumn !== undefined) setTimeColumn(update.timeColumn);
    if (update.cohortPolicy !== undefined) setCohortPolicy(update.cohortPolicy);
  }

  const longitudinalDerivationState = useMemo(() => {
    if (!result || !resultConfig || !dataset) return { derivation: null, error: copy.longitudinal.unavailableModel };
    if (result.set.modelType === "EndPoint") return { derivation: null, error: copy.longitudinal.unavailableModel };
    if (!repeatedEntityColumns.length) return { derivation: null, error: copy.longitudinal.unavailableEntity };
    if (!timeColumn) return { derivation: null, error: copy.longitudinal.unavailableTime };
    if (longitudinalTimeOrder.length < 1) return { derivation: null, error: copy.longitudinal.unavailablePeriods };
    try {
      return {
        derivation: buildLongitudinalDerivation(
          result,
          resultConfig,
          dataset,
          {
            repeatedEntityColumns,
            identityConfirmed,
            timeColumn,
            timeOrder: longitudinalTimeOrder,
            cohortPolicy,
            axes: [xDimension, yDimension],
            datasetNormalizedUtf8TextSha256: datasetHash,
          },
        ),
        error: null,
      };
    } catch (caught) {
      return { derivation: null, error: caught instanceof Error ? caught.message : String(caught) };
    }
  }, [
    cohortPolicy,
    copy.longitudinal,
    dataset,
    datasetHash,
    identityConfirmed,
    longitudinalTimeOrder,
    repeatedEntityColumns,
    result,
    resultConfig,
    timeColumn,
    xDimension,
    yDimension,
  ]);
  const longitudinalView = longitudinalTimeOrder.length >= 2
    ? longitudinalDerivationState.derivation?.view ?? null
    : null;
  const aiLongitudinalView = longitudinalDerivationState.derivation?.view ?? null;
  const longitudinalComparisonFrame = longitudinalDerivationState.derivation?.comparisonFrame ?? null;
  const longitudinalViewError = longitudinalDerivationState.error
    ?? (longitudinalTimeOrder.length < 2 ? copy.longitudinal.unavailablePeriods : null);

  const inferenceResultInitializationKey = result && resultConfig
    ? `${result.analyzedAt}\u001f${resultConfig.model}\u001f${resultConfig.groupColumn ?? ""}\u001f${currentResultGroupKey}`
    : "";
  useEffect(() => {
    setInferenceDesign(null);
    setInferencePrimaryGroup(currentResultGroupNames[0] ?? "");
    setInferenceSecondaryGroup(currentResultGroupNames.find((group) => group !== currentResultGroupNames[0]) ?? "");
    setInferenceGroup(resultConfig?.groupColumn ? currentResultGroupNames[0] ?? null : null);
    setLastInference(null);
    setLastInferenceRequestKey(null);
    setInferenceIntegrityError(null);
    setInferenceRunning(false);
    inferenceGenerationRef.current += 1;
  }, [inferenceResultInitializationKey]);

  useEffect(() => {
    setInferencePeriod(longitudinalTimeOrder[0] ?? "");
    setInferenceEarlierPeriod(longitudinalTimeOrder[0] ?? "");
    setInferenceLaterPeriod(longitudinalTimeOrder[1] ?? "");
    setInferenceRepeatedPeriods([...longitudinalTimeOrder]);
  }, [observedLongitudinalTimeOrderKey, result?.analyzedAt, timeColumn]);

  const groupContrastAxes = useMemo(
    (): [string, string] => [xDimension, yDimension],
    [xDimension, yDimension],
  );
  const inferenceGroupOptions = resultConfig?.groupColumn ? currentResultGroupNames : [];
  const selectedInferencePrimaryGroup = result?.set.modelType === "EndPoint"
    ? primaryGroupName
    : inferencePrimaryGroup;
  const selectedInferenceSecondaryGroup = result?.set.modelType === "EndPoint"
    ? secondaryGroupName
    : inferenceSecondaryGroup;
  const inferenceDesignAvailability = useMemo(() => {
    const inferenceCopy = copy.stats.inference;
    if (completedResultKind === "ona") {
      const reason = "ONA is descriptive-only in this release; inferential tests are not available.";
      return {
        independent: { enabled: false, reason },
        paired: { enabled: false, reason },
        repeated: { enabled: false, reason },
      };
    }
    const endpoint = result?.set.modelType === "EndPoint";
    const trajectory = Boolean(result && result.set.modelType !== "EndPoint");
    const hasTwoGroups = Boolean(resultConfig?.groupColumn && currentResultGroupNames.length >= 2);
    return {
      independent: {
        enabled: Boolean(result && hasTwoGroups && (endpoint || (trajectory && longitudinalTimeOrder.length >= 1))),
        reason: result && !hasTwoGroups
          ? inferenceCopy.independentRequiresTwoGroups
          : trajectory && longitudinalTimeOrder.length < 1
            ? inferenceCopy.independentRequiresPeriod
            : null,
      },
      paired: {
        enabled: Boolean(trajectory && longitudinalTimeOrder.length >= 2),
        reason: endpoint
          ? inferenceCopy.pairedRequiresTrajectory
          : longitudinalTimeOrder.length < 2
            ? inferenceCopy.pairedRequiresTwoPeriods
            : null,
      },
      repeated: {
        enabled: Boolean(trajectory && longitudinalTimeOrder.length >= 3),
        reason: endpoint
          ? inferenceCopy.repeatedRequiresTrajectory
          : longitudinalTimeOrder.length < 3
            ? inferenceCopy.repeatedRequiresThreePeriods
            : null,
      },
    };
  }, [completedResultKind, copy.stats.inference, currentResultGroupKey, longitudinalTimeOrder.length, result, resultConfig]);

  const inferenceRequest = useMemo((): OpenEnaInferenceRequestV2 | null => {
    if (completedResultKind === "ona" || !result || !resultConfig || !inferenceDesign || resultIsStale) return null;
    if (groupContrastAxes[0] === groupContrastAxes[1]
      || groupContrastAxes.some((axis) => !result.dimensions.includes(axis))) return null;
    if (result.set.modelType === "EndPoint") {
      if (inferenceDesign !== "independent" || !resultConfig.groupColumn
        || !selectedInferencePrimaryGroup || !selectedInferenceSecondaryGroup
        || selectedInferencePrimaryGroup === selectedInferenceSecondaryGroup) return null;
      return {
        kind: "endpoint-independent",
        primaryGroup: selectedInferencePrimaryGroup,
        secondaryGroup: selectedInferenceSecondaryGroup,
        axes: groupContrastAxes,
      };
    }
    if (!identityConfirmed || repeatedEntityColumns.length === 0 || !timeColumn) return null;
    if (inferenceDesign === "independent") {
      if (!resultConfig.groupColumn || !inferencePeriod
        || !selectedInferencePrimaryGroup || !selectedInferenceSecondaryGroup
        || selectedInferencePrimaryGroup === selectedInferenceSecondaryGroup) return null;
      return {
        kind: "trajectory-independent-period",
        repeatedEntityColumns: [...repeatedEntityColumns],
        timeColumn,
        period: inferencePeriod,
        primaryGroup: selectedInferencePrimaryGroup,
        secondaryGroup: selectedInferenceSecondaryGroup,
        axes: groupContrastAxes,
      };
    }
    const selectedGroup = resultConfig.groupColumn ? inferenceGroup : null;
    if (resultConfig.groupColumn && !selectedGroup) return null;
    if (inferenceDesign === "paired") {
      if (!inferenceEarlierPeriod || !inferenceLaterPeriod
        || inferenceEarlierPeriod === inferenceLaterPeriod) return null;
      return {
        kind: "trajectory-paired-periods",
        repeatedEntityColumns: [...repeatedEntityColumns],
        timeColumn,
        group: selectedGroup,
        earlierPeriod: inferenceEarlierPeriod,
        laterPeriod: inferenceLaterPeriod,
        axes: groupContrastAxes,
        cohortPolicy: "pairwise-complete",
      };
    }
    const orderedPeriods = longitudinalTimeOrder.filter((period) => inferenceRepeatedPeriods.includes(period));
    if (orderedPeriods.length < 3) return null;
    return {
      kind: "trajectory-repeated-periods",
      repeatedEntityColumns: [...repeatedEntityColumns],
      timeColumn,
      group: selectedGroup,
      periods: orderedPeriods,
      axes: groupContrastAxes,
      cohortPolicy: "all-period-complete",
      posthocContrasts: "all-period-pairs",
    };
  }, [
    groupContrastAxes,
    completedResultKind,
    identityConfirmed,
    inferenceDesign,
    inferenceEarlierPeriod,
    inferenceGroup,
    inferenceLaterPeriod,
    inferencePeriod,
    inferenceRepeatedPeriods,
    longitudinalTimeOrder,
    repeatedEntityColumns,
    result,
    resultConfig,
    resultIsStale,
    selectedInferencePrimaryGroup,
    selectedInferenceSecondaryGroup,
    timeColumn,
  ]);

  const inferencePreviewState = useMemo((): {
    preview: OpenEnaInferencePreview | null;
    error: string | null;
  } => {
    if (!inferenceRequest || !result || !resultConfig) return { preview: null, error: null };
    const inferenceCopy = copy.stats.inference;
    try {
      if (inferenceRequest.kind === "endpoint-independent") {
        const primary = result.groups.find((group) => group.name === inferenceRequest.primaryGroup)?.count ?? 0;
        const secondary = result.groups.find((group) => group.name === inferenceRequest.secondaryGroup)?.count ?? 0;
        return {
          preview: {
            message: inferenceCopy.eligibilityReady,
            rows: [
              { id: "candidates", label: inferenceCopy.candidateEntities, value: primary + secondary },
              { id: "primary", label: inferenceCopy.availablePrimary, value: primary },
              { id: "secondary", label: inferenceCopy.availableSecondary, value: secondary },
              { id: "included", label: inferenceCopy.includedEntities, value: primary + secondary },
            ],
          },
          error: null,
        };
      }
      if (!longitudinalComparisonFrame) return { preview: null, error: null };
      if (inferenceRequest.kind === "trajectory-independent-period") {
        const slice = sliceLongitudinalIndependentPeriod(longitudinalComparisonFrame, inferenceRequest);
        return {
          preview: {
            message: inferenceCopy.eligibilityReady,
            rows: [
              { id: "candidates", label: inferenceCopy.candidateEntities, value: slice.ledger.candidateEntityCount },
              { id: "primary", label: inferenceCopy.availablePrimary, value: slice.ledger.primaryAvailableCount },
              { id: "secondary", label: inferenceCopy.availableSecondary, value: slice.ledger.secondaryAvailableCount },
              { id: "included", label: inferenceCopy.includedEntities, value: slice.ledger.includedEntityCount },
            ],
          },
          error: null,
        };
      }
      if (inferenceRequest.kind === "trajectory-paired-periods") {
        const slice = sliceLongitudinalPairedPeriods(longitudinalComparisonFrame, inferenceRequest);
        return {
          preview: {
            message: inferenceCopy.eligibilityReady,
            rows: [
              { id: "candidates", label: inferenceCopy.candidateEntities, value: slice.ledger.candidateEntityCount },
              { id: "earlier", label: inferenceCopy.earlierAvailable, value: slice.ledger.earlierAvailableCount },
              { id: "later", label: inferenceCopy.laterAvailable, value: slice.ledger.laterAvailableCount },
              { id: "matched", label: inferenceCopy.matchedEntities, value: slice.ledger.matchedEntityCount },
              { id: "earlier-only", label: inferenceCopy.earlierOnly, value: slice.ledger.earlierOnlyCount },
              { id: "later-only", label: inferenceCopy.laterOnly, value: slice.ledger.laterOnlyCount },
              {
                id: "missing",
                label: inferenceCopy.missingPairs,
                value: slice.ledger.candidateEntityCount - slice.ledger.matchedEntityCount,
              },
              { id: "zero-x", label: inferenceCopy.provisionalZeroFirstAxis, value: slice.ledger.zeroDifferenceCountByAxis.x },
              { id: "zero-y", label: inferenceCopy.provisionalZeroSecondAxis, value: slice.ledger.zeroDifferenceCountByAxis.y },
            ],
          },
          error: null,
        };
      }
      const slice = sliceLongitudinalRepeatedPeriods(longitudinalComparisonFrame, inferenceRequest);
      return {
        preview: {
          message: inferenceCopy.eligibilityReady,
          rows: [
            { id: "candidates", label: inferenceCopy.candidateEntities, value: slice.ledger.candidateEntityCount },
            ...slice.ledger.availableByPeriod.map((entry) => ({
              id: `period-${entry.periodIndex}`,
              label: `${inferenceCopy.availableAtPeriod}: ${entry.period}`,
              value: entry.availableEntityCount,
            })),
            { id: "complete", label: inferenceCopy.completeBlocks, value: slice.ledger.completeBlockCount },
            {
              id: "missing-any",
              label: inferenceCopy.missingAnySelectedPeriod,
              value: slice.ledger.missingAnySelectedPeriodCount,
            },
          ],
        },
        error: null,
      };
    } catch (caught) {
      if (caught instanceof OpenEnaLongitudinalIntegrityError) {
        return { preview: null, error: caught.code };
      }
      return { preview: null, error: "binding-mismatch" };
    }
  }, [copy.stats.inference, inferenceRequest, longitudinalComparisonFrame, result, resultConfig]);

  const inferenceRequestKey = useMemo(() => JSON.stringify({
    analyzedAt: result?.analyzedAt ?? null,
    datasetHash,
    datasetHashKind: dataset ? datasetHashKindFor(dataset) : null,
    configuration: resultConfig,
    request: inferenceRequest,
    design: inferenceDesign,
    repeatedEntityColumns,
    identityConfirmed,
    timeColumn,
    longitudinalTimeOrder,
  }), [
    dataset,
    datasetHash,
    identityConfirmed,
    inferenceDesign,
    inferenceRequest,
    longitudinalTimeOrder,
    repeatedEntityColumns,
    result?.analyzedAt,
    resultConfig,
    timeColumn,
  ]);
  inferenceRequestKeyRef.current = inferenceRequestKey;
  const currentInference = lastInferenceRequestKey === inferenceRequestKey ? lastInference : null;
  const inferenceProducerContext = useMemo(() => {
    if (!result || !resultConfig) return null;
    return {
      groupNames: result.groups.map((group) => group.name),
      groupColumn: resultConfig.groupColumn,
      trajectoryMapping: result.set.modelType === "EndPoint"
        ? null
        : aiLongitudinalView?.identityConfirmed
          ? {
              contractVersion: 1 as const,
              repeatedEntityColumns: [...aiLongitudinalView.repeatedEntityColumns],
              identityConfirmed: true as const,
              timeColumn: aiLongitudinalView.timeColumn,
              timeOrder: [...aiLongitudinalView.timeOrder],
            }
          : null,
    };
  }, [aiLongitudinalView, result, resultConfig]);

  useEffect(() => {
    inferenceGenerationRef.current += 1;
    setLastInference(null);
    setLastInferenceRequestKey(null);
    setInferenceIntegrityError(null);
    setInferenceRunning(false);
  }, [inferenceRequestKey]);

  const inferenceEligibilityMessage = !inferenceDesign
    ? copy.stats.inference.eligibilitySelectDesign
    : !inferenceDesignAvailability[inferenceDesign].enabled
      ? inferenceDesignAvailability[inferenceDesign].reason ?? copy.stats.inference.eligibilityCompleteScope
      : result?.set.modelType !== "EndPoint" && !identityConfirmed
        ? copy.stats.inference.eligibilityConfirmIdentity
        : !inferenceRequest || !inferencePreviewState.preview || inferencePreviewState.error
          ? copy.stats.inference.eligibilityCompleteScope
          : copy.stats.inference.eligibilityReady;
  const canRunInference = Boolean(
    dataset
    && datasetHash
    && /^[0-9a-f]{64}$/iu.test(datasetHash)
    && result
    && completedResultKind !== "ona"
    && resultConfig
    && inferenceRequest
    && inferencePreviewState.preview
    && !inferencePreviewState.error
    && !resultIsStale
    && !inferenceRunning
  );

  async function runInferentialComparison() {
    if (!canRunInference || !dataset || !datasetHash || !result || !resultConfig || !inferenceRequest) return;
    if (inferenceRequest.kind !== "endpoint-independent" && !longitudinalComparisonFrame) return;
    const requestedKey = inferenceRequestKey;
    const generation = inferenceGenerationRef.current + 1;
    inferenceGenerationRef.current = generation;
    setInferenceRunning(true);
    setInferenceIntegrityError(null);
    setLastInference(null);
    setLastInferenceRequestKey(null);
    try {
      const coordinatorInput = inferenceRequest.kind === "endpoint-independent"
        ? {
            request: inferenceRequest,
            result,
            currentBinding: {
              datasetNormalizedUtf8TextSha256: datasetHash,
              datasetHashKind: datasetHashKindFor(dataset),
              configuration: resultConfig,
            },
          }
        : {
            request: inferenceRequest,
            result,
            currentBinding: {
              datasetNormalizedUtf8TextSha256: datasetHash,
              datasetHashKind: datasetHashKindFor(dataset),
              configuration: resultConfig,
            },
            comparisonFrame: longitudinalComparisonFrame!,
          };
      const completed = await runOpenEnaInferenceV2(coordinatorInput);
      if (inferenceGenerationRef.current !== generation
        || inferenceRequestKeyRef.current !== requestedKey) return;
      setLastInference(completed);
      setLastInferenceRequestKey(requestedKey);
    } catch (caught) {
      if (inferenceGenerationRef.current !== generation
        || inferenceRequestKeyRef.current !== requestedKey) return;
      setLastInference(null);
      setLastInferenceRequestKey(null);
      setInferenceIntegrityError(
        caught instanceof OpenEnaInferenceIntegrityError ? caught.code : "binding-mismatch",
      );
    } finally {
      if (inferenceGenerationRef.current === generation) setInferenceRunning(false);
    }
  }
  const contrastUnavailable = useMemo(() => {
    if (!result || !resultConfig) return "Build an endpoint model to compare groups.";
    if (completedResultKind === "ona") return "ONA group networks are descriptive means; pairwise subtraction is unavailable.";
    if (result.set.modelType !== "EndPoint") return copy.contrast.endpointOnly;
    if (!resultConfig.groupColumn) return copy.contrast.requiresGroup;
    if (result.groups.length < 2) return copy.contrast.requiresTwoGroups;
    return null;
  }, [completedResultKind, copy.contrast, result, resultConfig]);
  const groupContrastState = useMemo(() => {
    if (contrastUnavailable || !result || !resultConfig || !primaryGroupName || !secondaryGroupName) {
      return { contrast: null, error: contrastUnavailable };
    }
    try {
      return {
        contrast: buildPairwiseGroupContrast(
          result,
          resultConfig,
          primaryGroupName,
          secondaryGroupName,
          groupContrastAxes,
        ),
        error: null,
      };
    } catch (caught) {
      return {
        contrast: null,
        error: caught instanceof Error ? caught.message : String(caught),
      };
    }
  }, [contrastUnavailable, groupContrastAxes, primaryGroupName, result, resultConfig, secondaryGroupName]);
  const groupContrast = groupContrastState.contrast;
  const maxNetworkWeight = useMemo(() => {
    if (!result) return 1e-9;
    let maximum = 1e-9;
    for (const group of result.groups) {
      for (const weight of Object.values(group.meanWeights)) {
        maximum = Math.max(maximum, Math.abs(weight));
      }
    }
    return maximum;
  }, [result]);
  const methodsReport = useMemo(
    () => dataset && result && resultConfig
      ? buildMethodsReport(dataset, resultConfig, result, datasetHash, [xDimension, yDimension], {
          flipX,
          flipY,
          edgeThreshold,
          showNetworks,
          showPoints,
          showTrajectories,
          showLabels,
          showGroupLabels,
          showUnitLabels,
          showVariance,
          edgeScale,
          pointScale,
          plotZoom,
          selectedGroupOrder: groupContrast?.groupOrder,
        }, currentInference, inferenceProducerContext)
      : null,
    [
      dataset,
      datasetHash,
      currentInference,
      edgeScale,
      edgeThreshold,
      flipX,
      flipY,
      groupContrast,
      inferenceProducerContext,
      plotZoom,
      pointScale,
      result,
      resultConfig,
      showLabels,
      showGroupLabels,
      showNetworks,
      showPoints,
      showTrajectories,
      showUnitLabels,
      showVariance,
      xDimension,
      yDimension,
    ],
  );
  const referenceMeanNotice = result ? referenceMeanRotationInterpretation(result, datasetHash) : null;
  const primarySet = useMemo(
    () => analysisSets.find((analysisSet) => analysisSet.id === primarySetId) ?? null,
    [analysisSets, primarySetId],
  );
  const secondarySet = useMemo(
    () => analysisSets.find((analysisSet) => analysisSet.id === secondarySetId) ?? null,
    [analysisSets, secondarySetId],
  );
  const comparisonAxes = useMemo((): [string, string] => {
    const dimensions = primarySet?.geometry.dimensions ?? [];
    const x = dimensions.includes(xDimension) ? xDimension : dimensions[0] ?? "SVD1";
    const y = dimensions.includes(yDimension) && yDimension !== x
      ? yDimension
      : dimensions.find((dimension) => dimension !== x) ?? "SVD2";
    return [x, y];
  }, [primarySet, xDimension, yDimension]);
  const compatibleSecondarySets = useMemo(
    () => primarySet
      ? analysisSets.filter((analysisSet) => (
          analysisSet.id !== primarySet.id
          && haveCompatibleSetGeometry(primarySet, analysisSet)
        ))
      : [],
    [analysisSets, primarySet],
  );
  const setComparison = useMemo(() => {
    if (!primarySet || !secondarySet || !haveCompatibleSetGeometry(primarySet, secondarySet)) return null;
    try {
      return compareAnalysisSets(primarySet, secondarySet, comparisonAxes);
    } catch {
      return null;
    }
  }, [comparisonAxes, primarySet, secondarySet]);
  const displayedComparisonSurface = completedResultKind === "ona"
    ? "model"
    : activeComparisonSurface === "sets" && setComparison
    ? "sets"
    : groupContrast
      ? "groups"
      : result
        ? "model"
      : setComparison
        ? "sets"
        : "model";
  const activeSetComparison = completedResultKind !== "ona" && displayedComparisonSurface === "sets" ? setComparison : null;
  const activeGroupContrast = completedResultKind !== "ona" && displayedComparisonSurface === "groups" ? groupContrast : null;
  const dataViewModel = useMemo(() => {
    const empty = {
      columns: [] as OpenEnaDataViewColumn[],
      rows: [] as OpenEnaDataViewRow[],
      error: null as string | null,
    };
    if (!dataset || !result || !resultConfig) return empty;

    if (completedResultKind === "ona") {
      if (!datasetHash) return { ...empty, error: "ONA Data View requires the analyzed dataset SHA-256 binding." };
      const selectedGroup = dataViewContext === "primary"
        ? primaryGroupName || result.groups[0]?.name
        : dataViewContext === "secondary"
          ? secondaryGroupName || result.groups[1]?.name
          : null;
      try {
        const viewModel = buildOpenEnaOnaDataView({
          dataset,
          datasetHash,
          result,
          resultConfig,
          scope: selectedGroup
            ? { kind: "group", name: selectedGroup }
            : { kind: "overall" },
        });
        return {
          columns: viewModel.columns.map((column): OpenEnaDataViewColumn => ({
            key: column.key,
            label: column.kind === "provenance"
              ? copy.ona.dataView.provenanceLabels[
                  column.key as keyof typeof copy.ona.dataView.provenanceLabels
                ] ?? column.label
              : column.label,
            kind: column.kind,
            align: column.kind === "metadata" ? "left" : "right",
          })),
          rows: viewModel.rows.map((row): OpenEnaDataViewRow => ({
            id: `ordered-response-${row.responseRowIndex}`,
            values: row.values,
          })),
          error: null,
        };
      } catch (caught) {
        return {
          ...empty,
          error: caught instanceof Error ? caught.message : String(caught),
        };
      }
    }

    const unitFields = resultConfig.unitColumns;
    const horizonFields = resultConfig.conversationColumns;
    const groupField = resultConfig.groupColumn;
    const byUnit = new Map<string, { values: Record<string, string | number | null>; horizons: Set<string> }>();

    for (const sourceRow of dataset.rows) {
      const unitId = unitFields.map((field) => String(sourceRow[field] ?? "")).join("::");
      if (!unitId) continue;
      const horizonId = horizonFields.map((field) => String(sourceRow[field] ?? "")).join("::");
      const group = groupField ? String(sourceRow[groupField] ?? "") : "All units";
      let record = byUnit.get(unitId);
      if (!record) {
        record = {
          values: { unit: unitId, group, horizon: horizonId || "—" },
          horizons: new Set<string>(),
        };
        for (const code of resultConfig.codes) record.values[code] = 0;
        byUnit.set(unitId, record);
      }
      if (horizonId) record.horizons.add(horizonId);
      for (const code of resultConfig.codes) {
        const numeric = Number(sourceRow[code]);
        if (Number.isFinite(numeric)) record.values[code] = Number(record.values[code] ?? 0) + numeric;
      }
    }

    const selectedGroup = dataViewContext === "primary"
      ? activeGroupContrast?.primary.name
      : dataViewContext === "secondary"
        ? activeGroupContrast?.secondary.name
        : null;
    const rows: OpenEnaDataViewRow[] = [...byUnit.entries()]
      .map(([id, record]) => {
        const values: Record<string, string | number | null> = {
          ...record.values,
          horizon: record.horizons.size > 1 ? [...record.horizons].join(" · ") : record.values.horizon,
        };
        return { id, values };
      })
      .filter((row) => !selectedGroup || String(row.values.group ?? "") === selectedGroup);
    const columns: OpenEnaDataViewColumn[] = [
      { key: "unit", label: `Unit · ${unitFields.join(" › ")}`, kind: "metadata" },
      ...(groupField ? [{ key: "group", label: `Group · ${groupField}`, kind: "metadata" as const }] : []),
      { key: "horizon", label: `Horizon · ${horizonFields.join(" › ")}`, kind: "metadata" },
      ...resultConfig.codes.map((code) => ({ key: code, label: code, kind: "code" as const, align: "right" as const })),
    ];
    return { columns, rows, error: null };
  }, [
    activeGroupContrast,
    completedResultKind,
    copy.ona.dataView.provenanceLabels,
    dataViewContext,
    dataset,
    datasetHash,
    primaryGroupName,
    result,
    resultConfig,
    secondaryGroupName,
  ]);
  const activeLongitudinalView = !activeSetComparison
    && !activeGroupContrast
    && result?.set.modelType !== "EndPoint"
    ? longitudinalView
    : null;
  const aiInterpretationRequest = useMemo(() => {
    if (!result || !resultConfig || resultIsStale || !currentInference) return null;
    try {
      return buildOpenEnaAiInterpretationRequest({
        locale,
        result,
        config: resultConfig,
        datasetHash,
        groupContrast: result.set.modelType === "EndPoint" ? groupContrast : null,
        longitudinalView: result.set.modelType === "EndPoint" ? null : aiLongitudinalView,
        currentInference,
      });
    } catch {
      return null;
    }
  }, [aiLongitudinalView, currentInference, datasetHash, groupContrast, locale, result, resultConfig, resultIsStale]);
  const currentProjectedResult = Boolean(
    result
    && resultConfig
    && !resultIsStale
    && result.set.modelType === "EndPoint"
    && result.projectionReference
    && rotationReference
    && result.projectionReference.referenceId === rotationReference.referenceId,
  );

  function installAnalysisConfig(nextConfig: OpenEnaConfig) {
    const next = cloneOpenEnaConfig(nextConfig);
    setAnalysisFamilyDrafts(createAnalysisFamilyDrafts(next));
    setConfig(next);
    setDirectionalMaskOpen(false);
  }

  function updateConfig(update: (current: OpenEnaConfig) => OpenEnaConfig) {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setConfig((current) => {
      const candidate = update(current);
      if (analysisKindFor(candidate) !== "ona") return candidate;
      return {
        ...candidate,
        analysisKind: "ona",
        model: "EndPoint",
        window: "MovingStanzaWindow",
        windowSizeForward: 0,
        weightBy: "sum",
        rotation: "svd",
        referenceRotationId: null,
        directionalMask: reconcileDirectionalMask(candidate.directionalMask, candidate.codes),
      };
    });
    setView("2d");
  }

  function selectAnalysisFamily(target: AnalysisKind) {
    if (target === currentAnalysisKind) return;
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    const transition = beginAnalysisFamilyConfiguration(analysisFamilyDrafts, config, target);
    setAnalysisFamilyDrafts(transition.drafts);
    setConfig(transition.activeConfig);
    setDirectionalMaskOpen(false);
    setView("2d");
    setCenterSurface("plot");
    setMode("model");
    if (target === "ona") setModelTab("windows");
  }

  function updateOnaOrderPanel(value: OpenEnaOrderPanelValue) {
    if (currentAnalysisKind !== "ona") return;
    const directionalMask = reconcileDirectionalMask(config.directionalMask, config.codes);
    const staged: OpenEnaConfig = {
      ...config,
      analysisKind: "ona",
      model: "EndPoint",
      window: "MovingStanzaWindow",
      windowSizeBack: value.windowSizeBack,
      windowSizeForward: 0,
      weightBy: "sum",
      rotation: "svd",
      referenceRotationId: null,
      directionalMask,
      orderPolicy: null,
    };
    if (!isOpenEnaOrderPanelValueComplete(value)) {
      setConfig(staged);
      setAnalysisFamilyDrafts((drafts) => ({ ...drafts, ona: cloneOpenEnaConfig(staged) }));
      setView("2d");
      return;
    }
    const orderPolicy = orderPolicyFromPanelValue(value);
    const executable = { ...staged, orderPolicy };
    const transition = switchAnalysisFamily(
      analysisFamilyDrafts,
      executable,
      "ona",
      { orderPolicy },
    );
    setAnalysisFamilyDrafts(transition.drafts);
    setConfig(transition.activeConfig);
    setView("2d");
  }

  function openTrajectoryModelConfiguration() {
    if (currentAnalysisKind === "ona") return;
    setModelTab("windows");
    setTrajectoryModelFocusRequest((request) => request + 1);
  }

  function captureCurrentAnalysisSet() {
    if (completedResultKind === "ona") {
      setError(copy.ona.unavailable.sets);
      setMode("model");
      return;
    }
    if (!dataset || !resultConfig || !result) {
      setError("Build an endpoint model before capturing an analysis set.");
      setMode("sets");
      return;
    }
    if (result.set.modelType !== "EndPoint") {
      setError("Trajectory models cannot be captured as comparison sets. Build an endpoint model, then capture it here.");
      setMode("sets");
      return;
    }

    try {
      const captured = buildAnalysisSet(dataset, datasetHash, resultConfig, result);
      const nextSets = upsertAnalysisSet(analysisSets, captured);
      setAnalysisSets(nextSets);
      if (captured.generatedReference) {
        setRotationReference(captured.generatedReference);
      }
      if (!primarySetId || primarySetId === captured.id) {
        setPrimarySetId(captured.id);
      } else {
        const selectedPrimary = analysisSets.find((analysisSet) => analysisSet.id === primarySetId);
        if (!secondarySetId && selectedPrimary && haveCompatibleSetGeometry(selectedPrimary, captured)) {
          setSecondarySetId(captured.id);
          setActiveComparisonSurface("sets");
        }
      }
      setError("");
      setMode("sets");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setMode("sets");
    }
  }

  function removeCapturedAnalysisSet(analysisSet: OpenEnaAnalysisSet) {
    const remaining = removeAnalysisSet(analysisSets, analysisSet.id);
    const repaired = repairSetSelection(remaining, { primarySetId, secondarySetId });
    setAnalysisSets(remaining);
    setPrimarySetId(repaired.primarySetId);
    setSecondarySetId(repaired.secondarySetId);
  }

  async function runAnalysis(
    nextDataset = dataset,
    nextConfig = config,
    nextDatasetHash = datasetHash,
  ) {
    if (!nextDataset || sourceAbortRef.current || referenceImportRef.current) return;
    if (!nextDatasetHash) {
      setError("Commit the imported source and its SHA-256 binding before analysis.");
      return;
    }
    const analysisGeneration = datasetGenerationRef.current;
    const errors = validateWorkspaceConfig(nextDataset, nextConfig, rotationReference);
    if (errors.length) {
      setError(errors.join(" "));
      setMode("model");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setProgress(0);
    setError("");
    try {
      const nextResult = await analyzeDatasetInWorker(nextDataset, nextConfig, {
        signal: controller.signal,
        datasetSha256: nextDatasetHash,
        reference: nextConfig.rotation === "reference" ? rotationReference : null,
        onProgress: ({ progress: nextProgress, stage }) => {
          setProgress(Math.round(nextProgress * 100));
          setProgressStage(stage);
        },
      });
      if (controller.signal.aborted || datasetGenerationRef.current !== analysisGeneration) return;
      setResult(nextResult);
      setResultConfig(cloneOpenEnaConfig(nextResult.provenanceBinding!.configuration));
      const [x = "SVD1", y = "SVD2", z = y] = nextResult.dimensions;
      setXDimension(x);
      setYDimension(y);
      setZDimension(z);
      setInteractive3dCamera(null);
      setInteractive3dAspectRatio(null);
      setView("2d");
      setMode("model");
      setActiveComparisonSurface("groups");
      setCenterSurface("plot");
      setResultTable("coordinates");
      setShowTrajectories(true);
      setShowGroupCentroidPaths(true);
    } catch (caught) {
      if (controller.signal.aborted) return;
      const message = caught instanceof Error ? caught.message : String(caught);
      if (abortRef.current === controller && !/cancel/i.test(message)) setError(message);
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
        abortRef.current = null;
      }
    }
  }

  async function loadSample() {
    referenceImportRef.current = null;
    setReferenceBusy(false);
    sourceAbortRef.current?.abort();
    const sourceController = new AbortController();
    sourceAbortRef.current = sourceController;
    datasetGenerationRef.current += 1;
    const sourceGeneration = datasetGenerationRef.current;
    setSourceBusy(true);
    setError("");
    try {
      const response = await fetch(SAMPLE_DATASET_URL, { cache: "no-store", signal: sourceController.signal });
      if (!response.ok) throw new Error(`The teaching sample could not be opened (${response.status}).`);
      const text = await response.text();
      if (sourceController.signal.aborted || sourceAbortRef.current !== sourceController || datasetGenerationRef.current !== sourceGeneration) return;
      const nextDataset = parseCsv(text, {
        name: "ena-design-talk-sample.csv",
        source: "sample",
      });
      const nextHash = await sha256Hex(text);
      if (sourceController.signal.aborted || sourceAbortRef.current !== sourceController || datasetGenerationRef.current !== sourceGeneration) return;
      abortRef.current?.abort();
      abortRef.current = null;
      setLoading(false);
      setDataset(nextDataset);
      setDatasetHash(nextHash);
      installAnalysisConfig(SAMPLE_CONFIG);
      setCodeColors({});
      setResult(null);
      setResultConfig(null);
      setSourceQuery("");
      setActiveCodesOnly(false);
      setSourcePage(0);
      sourceAbortRef.current = null;
      setSourceBusy(false);
      await runAnalysis(nextDataset, SAMPLE_CONFIG, nextHash);
    } catch (caught) {
      if (sourceController.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      if (sourceAbortRef.current === sourceController && datasetGenerationRef.current === sourceGeneration) {
        sourceAbortRef.current = null;
        setSourceBusy(false);
      }
    }
  }

  async function loadTrajectorySample() {
    referenceImportRef.current = null;
    setReferenceBusy(false);
    sourceAbortRef.current?.abort();
    const sourceController = new AbortController();
    sourceAbortRef.current = sourceController;
    datasetGenerationRef.current += 1;
    const sourceGeneration = datasetGenerationRef.current;
    setSourceBusy(true);
    setError("");
    try {
      const response = await fetch(TRAJECTORY_SAMPLE_DATASET_URL, { cache: "no-store", signal: sourceController.signal });
      if (!response.ok) throw new Error(`The 2D trajectory sample could not be opened (${response.status}).`);
      const text = await response.text();
      if (sourceController.signal.aborted || sourceAbortRef.current !== sourceController || datasetGenerationRef.current !== sourceGeneration) return;
      const nextDataset = parseCsv(text, {
        name: "ena-2d-trajectory-teaching-sample.csv",
        source: "sample",
      });
      const nextHash = await sha256Hex(text);
      if (sourceController.signal.aborted || sourceAbortRef.current !== sourceController || datasetGenerationRef.current !== sourceGeneration) return;
      abortRef.current?.abort();
      abortRef.current = null;
      setLoading(false);
      setDataset(nextDataset);
      setDatasetHash(nextHash);
      installAnalysisConfig(TRAJECTORY_SAMPLE_CONFIG);
      setCodeColors({});
      setResult(null);
      setResultConfig(null);
      setSourceQuery("");
      setActiveCodesOnly(false);
      setSourcePage(0);
      sourceAbortRef.current = null;
      setSourceBusy(false);
      await runAnalysis(nextDataset, TRAJECTORY_SAMPLE_CONFIG, nextHash);
    } catch (caught) {
      if (sourceController.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      if (sourceAbortRef.current === sourceController && datasetGenerationRef.current === sourceGeneration) {
        sourceAbortRef.current = null;
        setSourceBusy(false);
      }
    }
  }

  async function openCodedData(file: File) {
    referenceImportRef.current = null;
    setReferenceBusy(false);
    sourceAbortRef.current?.abort();
    const sourceController = new AbortController();
    sourceAbortRef.current = sourceController;
    datasetGenerationRef.current += 1;
    const sourceGeneration = datasetGenerationRef.current;
    setSourceBusy(true);
    setError("");
    try {
      const fileKind = codedDataFileKind(file.name);
      if (file.size > 5 * 1024 * 1024) throw new Error("CSV and XLSX files must be 5 MB or smaller.");
      let nextDataset: ParsedDataset;
      let normalizedHashText: string;
      if (fileKind === "csv") {
        const text = await file.text();
        nextDataset = parseCsv(text, { name: file.name, sizeBytes: file.size, source: "upload" });
        normalizedHashText = text;
      } else {
        const buffer = await file.arrayBuffer();
        const parsed = await parseXlsx(buffer, { name: file.name, sizeBytes: file.size, source: "upload" });
        nextDataset = parsed.dataset;
        normalizedHashText = parsed.normalizedText;
      }
      if (sourceController.signal.aborted || sourceAbortRef.current !== sourceController || datasetGenerationRef.current !== sourceGeneration) return;
      const nextHash = await sha256Hex(normalizedHashText);
      if (sourceController.signal.aborted || sourceAbortRef.current !== sourceController || datasetGenerationRef.current !== sourceGeneration) return;
      abortRef.current?.abort();
      abortRef.current = null;
      setLoading(false);
      setDataset(nextDataset);
      setDatasetHash(nextHash);
      installAnalysisConfig(inferConfig(nextDataset));
      setCodeColors({});
      setResult(null);
      setResultConfig(null);
      setSourceQuery("");
      setActiveCodesOnly(false);
      setSourcePage(0);
      setMode("model");
      setView("2d");
    } catch (caught) {
      if (sourceController.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : String(caught));
      setMode("data");
    } finally {
      if (sourceAbortRef.current === sourceController && datasetGenerationRef.current === sourceGeneration) {
        sourceAbortRef.current = null;
        setSourceBusy(false);
      }
    }
  }

  async function openReferenceRotation(file: File) {
    if (sourceAbortRef.current) return;
    if (currentAnalysisKind === "ona") {
      setError("Reference rotation is unavailable for ONA. Return to the Standard ENA family before importing a reference.");
      setMode("model");
      return;
    }
    const importToken = {};
    referenceImportRef.current = importToken;
    setReferenceBusy(true);
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setError("");
    try {
      if (file.size > 64 * 1024 * 1024) throw new Error("This browser can inspect reference or result-bundle JSON only when the file is 64 MB or smaller. Valid result bundles can be larger; use the dedicated compact Reference rotation JSON for dependable projection interchange.");
      const text = await file.text();
      if (referenceImportRef.current !== importToken) return;
      const reference = parseRotationReference(text, file.name);
      if (referenceImportRef.current !== importToken) return;
      setRotationReference(reference);
      updateConfig((current) => {
        const hasReferenceCodes = reference.compatibility.codes.every((code) => dataset?.headers.includes(code));
        return {
          ...current,
          model: "EndPoint",
          codes: hasReferenceCodes ? [...reference.compatibility.codes] : current.codes,
          window: reference.compatibility.window,
          windowSizeBack: reference.compatibility.windowSizeBack === "Infinity"
            ? current.windowSizeBack
            : reference.compatibility.windowSizeBack,
          windowSizeForward: reference.compatibility.windowSizeForward,
          weightBy: reference.compatibility.weightBy,
          centerAlignToOrigin: reference.compatibility.centerAlignToOrigin,
          rotation: "reference",
          referenceRotationId: reference.referenceId,
        };
      });
      setResult(null);
      setResultConfig(null);
      setView("2d");
      setMode("model");
    } catch (caught) {
      if (referenceImportRef.current !== importToken) return;
      setError(caught instanceof Error ? caught.message : String(caught));
      setMode("model");
    } finally {
      if (referenceImportRef.current === importToken) {
        referenceImportRef.current = null;
        setReferenceBusy(false);
      }
    }
  }

  function updatePointVisibility(visible: boolean) {
    setShowPoints(visible);
  }

  function selectVisualizationView(nextView: OpenEnaView) {
    if (nextView === "3d" && completedResultKind === "ona") {
      setError(copy.ona.unavailable.threeD);
      return;
    }
    setView(nextView);
    setCenterSurface("plot");
  }

  function selectCameraPreset(nextCamera: CameraPreset) {
    setCamera(nextCamera);
    setInteractive3dCamera(cameraForPreset(nextCamera));
    setInteractive3dAspectRatio(null);
    setPlotResetRevision((current) => current + 1);
  }

  function selectAxisDimension(axis: "x" | "y" | "z", nextDimension: string) {
    const currentDimensions = { x: xDimension, y: yDimension, z: zDimension };
    const previousDimension = currentDimensions[axis];
    if (previousDimension === nextDimension) return;

    const setters = {
      x: setXDimension,
      y: setYDimension,
      z: setZDimension,
    };
    setters[axis](nextDimension);
    const occupiedAxis = (["x", "y", "z"] as const).find(
      (candidate) => candidate !== axis && currentDimensions[candidate] === nextDimension,
    );
    if (occupiedAxis) setters[occupiedAxis](previousDimension);
  }

  function resetPlot() {
    const activeDimensions = view === "3d"
      ? result?.dimensions
      : displayedComparisonSurface === "sets"
      ? primarySet?.geometry.dimensions ?? result?.dimensions
      : result?.dimensions ?? primarySet?.geometry.dimensions;
    if (activeDimensions) {
      const [x = "SVD1", y = "SVD2", z = y] = activeDimensions;
      setXDimension(x);
      setYDimension(y);
      setZDimension(z);
    }
    setCamera("isometric");
    setInteractive3dCamera(null);
    setInteractive3dAspectRatio(null);
    setShowPoints(true);
    setShowNetworks(true);
    setShowLabels(true);
    setShowGroupLabels(true);
    setShowUnitLabels(false);
    setUnitCircle(false);
    setShowVariance(true);
    setShowTrajectories(true);
    setShowGroupCentroidPaths(true);
    setEdgeScale(1);
    setEdgeThreshold(0);
    setPointScale(1);
    setTextScale(1);
    setPlotZoom(1);
    setFlipX(false);
    setFlipY(false);
    setPlotResetRevision((current) => current + 1);
  }

  function serializedPlotSvg() {
    const source = plotSvgRef.current;
    if (!source) return null;
    const clone = source.cloneNode(true) as SVGSVGElement;
    if (completedResultKind === "ona" || !showUnitLabels) {
      clone.querySelectorAll<SVGGElement>("[data-ena-unit-point='true'], [data-ona-unit-point='true']").forEach((unitPoint, index) => {
        unitPoint.setAttribute("aria-label", `Analytic unit point ${index + 1}; identifier omitted from this SVG export.`);
        unitPoint.querySelectorAll("title").forEach((title) => {
          title.textContent = `Analytic unit point ${index + 1}; identifier omitted from this SVG export.`;
        });
        unitPoint.querySelectorAll(".ena-set-unit-label").forEach((label) => label.remove());
      });
    }
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", "920");
    clone.setAttribute("height", "590");
    const styles = document.createElementNS("http://www.w3.org/2000/svg", "style");
    styles.textContent = `
      text { font-family: Arial, Helvetica, sans-serif; }
      .ena-plot-background { fill: #fff; }
      .ena-zero-axes line, .ena-three-axes line { stroke: #8b999f; stroke-width: 1.25; stroke-dasharray: 4 5; }
      .ena-zero-axes text, .ena-three-axes text { fill: #5c6c72; font-size: 13px; font-weight: 690; }
      .ena-result-node { fill: #fff; stroke: #283d48; stroke-width: 5; }
      .ena-result-label, .ena-mean-label { fill: #263740; paint-order: stroke; stroke: #fff; stroke-linejoin: round; stroke-width: 5px; font-size: 14px; font-weight: 700; }
      .ena-mean-label { font-size: 13px; }
      .ena-set-plot-background { fill: #fff; }
      .ena-set-zero-axes line { stroke: #8b999f; stroke-width: 1.2; stroke-dasharray: 4 5; }
      .ena-set-axis-endpoint { fill: #333; }
      .ena-set-zero-axes text { fill: #5c6c72; font-size: 13px; font-weight: 690; }
      .ena-set-result-node { fill: #fff; stroke: #283d48; stroke-width: 4; }
      .ena-set-result-label, .ena-set-group-label, .ena-set-unit-label { fill: #263740; paint-order: stroke; stroke: #fff; stroke-linejoin: round; stroke-width: 4px; font-size: 13px; font-weight: 700; }
      .ena-set-unit-label { font-size: 11px; }
      .ena-longitudinal-background { fill: #fbfcfc; }
      .ena-longitudinal-axis { stroke: #c1cdcb; stroke-width: 1.15; stroke-dasharray: 3 5; }
      .ena-longitudinal-axis-label { fill: #40565a; font-family: monospace; font-size: 14px; font-weight: 680; }
      .ena-individual-trajectory-path { fill: none; stroke-width: 1.65; stroke-linecap: round; opacity: 0.32; }
      .ena-group-centroid-path { fill: none; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; opacity: 0.94; }
      .ena-group-centroid-direction-arrow { fill: #17212b; stroke: #fff; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; opacity: 0.98; }
      .ena-individual-direction-arrow { fill: #17212b; stroke: #fff; stroke-width: 1; stroke-linecap: round; stroke-linejoin: round; opacity: 0.82; }
      .ena-longitudinal-node circle:first-child { fill: #fff; stroke: #385b58; stroke-width: 2.2; }
      .ena-longitudinal-node circle:nth-child(2) { fill: #385b58; }
      .ena-longitudinal-node text, .ena-longitudinal-node-label, .ena-longitudinal-period-label { fill: #263f43; paint-order: stroke; stroke: #fff; stroke-width: 4px; stroke-linejoin: round; font-size: 13px; font-weight: 730; }
      .ena-longitudinal-period-label { font-family: monospace; font-size: 12px; }
      .ona-zero-axes line { stroke: #8b999f; stroke-width: 1.15; stroke-dasharray: 4 5; }
      .ona-zero-axes text { fill: #50646a; font-size: 13px; font-weight: 690; }
      .ona-code-node .ena-set-result-label { fill: #263740; paint-order: stroke; stroke: #fff; stroke-linejoin: round; stroke-width: 4px; font-size: 13px; font-weight: 740; }
      .ona-directed-edge path[data-ona-edge-hit-target='true'] { stroke: transparent; }
    `;
    clone.insertBefore(styles, clone.firstChild);
    return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}\n`;
  }

  function exportPlotSvg() {
    const svg = serializedPlotSvg();
    if (svg) downloadText(`open-ena-${Date.now()}-plot.svg`, svg, "image/svg+xml;charset=utf-8");
  }

  function exportPlotPng() {
    const svg = serializedPlotSvg();
    if (!svg) return;
    const sourceUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    const image = new Image();
    image.onload = () => {
      const scale = 3;
      const canvas = document.createElement("canvas");
      canvas.width = 920 * scale;
      canvas.height = 590 * scale;
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(sourceUrl);
        setError("The browser could not prepare the PNG canvas.");
        return;
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(sourceUrl);
        if (!blob) {
          setError("The browser could not encode the PNG figure.");
          return;
        }
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `open-ena-${Date.now()}-plot.png`;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      }, "image/png");
    };
    image.onerror = () => {
      URL.revokeObjectURL(sourceUrl);
      setError("The browser could not render the SVG figure as PNG.");
    };
    image.src = sourceUrl;
  }

  async function copyMethodsReport() {
    if (!methodsReport) return;
    try {
      await navigator.clipboard.writeText(methodsReport);
      setMethodsCopyStatus("Copied");
      window.setTimeout(() => setMethodsCopyStatus(""), 2_000);
    } catch {
      setError("The browser could not copy the methods report. Download the Markdown file instead.");
    }
  }

  function renderSetsPanel() {
    const canCaptureCurrent = Boolean(
      dataset
      && datasetHash
      && result
      && resultConfig
      && result.set.modelType === "EndPoint"
      && completedResultKind !== "ona"
      && !resultIsStale
      && !loading
      && !sourceBusy
      && !referenceBusy,
    );
    const projectedSetCount = analysisSets.filter((analysisSet) => analysisSet.role === "projected").length;
    const fittedSetCount = analysisSets.length - projectedSetCount;

    return (
      <div className="ena-control-content ena-sets-panel">
        <div className="ena-panel-heading">
          <p className="ena-panel-kicker">00 · Sets</p>
          <h2>{copy.sets.title}</h2>
          <p>{copy.sets.description}</p>
        </div>

        <ol className="ena-sets-workflow" aria-label="Shared-space comparison workflow">
          <li data-done={fittedSetCount > 0 ? "true" : "false"}>
            <strong>Capture a fitted endpoint</strong>
            <span>Its generated reference is installed for reuse.</span>
          </li>
          <li data-done={currentProjectedResult ? "true" : "false"}>
            <strong>Build a target in that reference</strong>
            <span>Open another CSV or XLSX file, choose the installed reference rotation, and rebuild.</span>
          </li>
          <li data-done={projectedSetCount > 0 ? "true" : "false"}>
            <strong>Capture the projected endpoint</strong>
            <span>The snapshot retains its reference lineage without raw rows.</span>
          </li>
          <li data-done={setComparison ? "true" : "false"}>
            <strong>Choose Primary and Secondary</strong>
            <span>Only compatible sets from one fixed geometry can be compared.</span>
          </li>
        </ol>

        <div className="ena-sets-capture">
          <button
            type="button"
            className="ena-action-button ena-action-primary"
            disabled={!canCaptureCurrent}
            onClick={captureCurrentAnalysisSet}
          >
            {copy.sets.capture}
          </button>
          <p>{copy.sets.captureHint}</p>
          {result && result.set.modelType !== "EndPoint" ? (
            <p className="ena-sets-compatibility-note">Trajectory results cannot be captured. Rebuild an endpoint model to create a comparison set.</p>
          ) : resultIsStale ? (
            <p className="ena-sets-compatibility-note">The current result no longer matches the pending configuration. Rebuild it before capture.</p>
          ) : result && !datasetHash ? (
            <p className="ena-sets-compatibility-note">A verified dataset SHA-256 is required before capture.</p>
          ) : null}
        </div>

        {analysisSets.length ? (
          <div className="ena-sets-list" aria-label="Captured analysis sets">
            {analysisSets.map((analysisSet) => {
              const reference = analysisSet.generatedReference ?? analysisSet.projectionReference;
              return (
                <article className="ena-sets-card" data-role={analysisSet.role} key={analysisSet.id}>
                  <div className="ena-sets-card-heading">
                    <div>
                      <strong>{analysisSet.name}</strong>
                      <span className="ena-sets-role">{analysisSet.role === "fitted" ? copy.sets.fitted : copy.sets.projected}</span>
                    </div>
                    <button
                      type="button"
                      className="ena-sets-remove"
                      aria-label={`Remove ${analysisSet.name}`}
                      onClick={() => removeCapturedAnalysisSet(analysisSet)}
                    >
                      {copy.sets.remove}
                    </button>
                  </div>
                  <dl>
                    <div><dt>Dataset</dt><dd>{analysisSet.dataset.name}</dd></div>
                    <div><dt>{copy.sets.sourceHash}</dt><dd title={analysisSet.dataset.normalizedUtf8TextSha256 ?? "Unavailable"}>{analysisSet.dataset.normalizedUtf8TextSha256 ?? "Unavailable"}</dd></div>
                    <div><dt>{copy.sets.hashScope}</dt><dd>{analysisSet.dataset.hashKind ?? "legacy normalized UTF-8 text"}</dd></div>
                    <div><dt>Role</dt><dd>{analysisSet.role}</dd></div>
                    <div>
                      <dt>{analysisSet.generatedReference ? copy.sets.generatedReference : copy.sets.projectionReference}</dt>
                      <dd>{reference ? `${reference.name} · ${reference.referenceId}` : "Unavailable"}</dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="ena-sets-empty">
            <strong>{copy.sets.emptyTitle}</strong>
            <p>{copy.sets.emptyText}</p>
          </div>
        )}

        {analysisSets.length ? (
          <section className="ena-sets-comparison-controls" aria-labelledby="ena-sets-compare-heading">
            <h3 id="ena-sets-compare-heading">Compare captured sets</h3>
            <label className="ena-field">
              <span>{copy.sets.primary}</span>
              <select
                value={primarySetId ?? ""}
                onChange={(event) => {
                  const nextPrimaryId = event.target.value || null;
                  const nextPrimary = analysisSets.find((analysisSet) => analysisSet.id === nextPrimaryId) ?? null;
                  setPrimarySetId(nextPrimaryId);
                  setActiveComparisonSurface("sets");
                  if (!nextPrimary || !secondarySet || !haveCompatibleSetGeometry(nextPrimary, secondarySet)) {
                    setSecondarySetId(null);
                  }
                }}
              >
                <option value="">{copy.sets.choosePrimary}</option>
                {analysisSets
                  .filter((analysisSet) => analysisSet.id !== secondarySetId)
                  .map((analysisSet) => <option key={analysisSet.id} value={analysisSet.id}>{analysisSet.name}</option>)}
              </select>
            </label>
            <label className="ena-field">
              <span>{copy.sets.secondary}</span>
              <select
                value={secondarySetId ?? ""}
                disabled={!primarySet}
                onChange={(event) => {
                  setSecondarySetId(event.target.value || null);
                  setActiveComparisonSurface("sets");
                }}
              >
                <option value="">{copy.sets.chooseSecondary}</option>
                {compatibleSecondarySets
                  .filter((analysisSet) => analysisSet.id !== primarySetId)
                  .map((analysisSet) => <option key={analysisSet.id} value={analysisSet.id}>{analysisSet.name}</option>)}
              </select>
            </label>
            <p>{copy.sets.comparisonHint}</p>
            {primarySet && compatibleSecondarySets.length === 0 ? <p className="ena-sets-compatibility-note">{copy.sets.noCompatibleSecondary}</p> : null}
            <div className="ena-sets-export-actions">
              <button
                type="button"
                className="ena-action-button ena-action-secondary"
                disabled={!setComparison || !primarySet || !secondarySet}
                onClick={() => {
                  if (setComparison && primarySet && secondarySet) {
                    downloadJson(
                      `open-ena-${Date.now()}-set-comparison.json`,
                      buildSetComparisonExport(setComparison),
                    );
                  }
                }}
              >
                {copy.sets.exportJson} ↓
              </button>
              <button
                type="button"
                className="ena-action-button ena-action-secondary"
                disabled={!setComparison}
                onClick={() => {
                  if (setComparison) {
                    downloadText(
                      `open-ena-${Date.now()}-comparison-edges.csv`,
                      setComparisonEdgesToCsv(setComparison),
                      "text/csv;charset=utf-8",
                    );
                  }
                }}
              >
                {copy.sets.exportEdges} ↓
              </button>
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  function renderDataPanel() {
    return (
      <div className="ena-control-content">
        <div className="ena-panel-heading">
          <p className="ena-panel-kicker">01 · Dataset</p>
          <h2>{copy.data.title}</h2>
          <p>{copy.data.description}</p>
        </div>
        <div className="ena-source-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hidden
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void openCodedData(file);
              event.currentTarget.value = "";
            }}
          />
          <input
            ref={referenceInputRef}
            type="file"
            accept=".json,application/json"
            hidden
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void openReferenceRotation(file);
              event.currentTarget.value = "";
            }}
          />
          <button type="button" className="ena-action-button ena-action-primary" onClick={() => fileInputRef.current?.click()} disabled={referenceBusy}>
            <span aria-hidden="true">＋</span> {copy.data.upload}
          </button>
          <p>{copy.data.uploadHint}</p>
          <button type="button" className="ena-action-button ena-action-secondary" onClick={() => void loadSample()} disabled={sourceBusy || referenceBusy || loading}>
            <span aria-hidden="true">◇</span> {copy.data.sample}
          </button>
          <p>{copy.data.sampleHint}</p>
          <button type="button" className="ena-action-button ena-action-secondary" onClick={() => void loadTrajectorySample()} disabled={sourceBusy || referenceBusy || loading}>
            <span aria-hidden="true">↗</span> {copy.data.trajectorySample}
          </button>
          <p>{copy.data.trajectorySampleHint}</p>
        </div>
        <div className="ena-local-note"><span aria-hidden="true">◉</span>{copy.data.local}</div>
        <div className="ena-reference-card">
          <div>
            <strong>Shared ENA geometry</strong>
            <span>Import a Reference rotation JSON to project endpoint data into the same fitted space. As a size-bounded convenience, this browser can also inspect compact raw-row-excluding result bundles up to 64 MB; valid bundles may be larger.</span>
          </div>
          <button
            type="button"
            className="ena-action-button ena-action-secondary"
            onClick={() => referenceInputRef.current?.click()}
            disabled={currentAnalysisKind === "ona" || sourceBusy || referenceBusy || loading}
            title={currentAnalysisKind === "ona" ? copy.ona.unavailable.reference : undefined}
          >
            Import reference rotation
          </button>
          {rotationReference ? (
            <div className="ena-reference-active" role="status">
              <span><i />{rotationReference.name}</span>
              <small>{rotationReference.compatibility.codes.length} codes · {rotationReference.compatibility.window}</small>
              <small>Declared source metadata; structure is validated, but authorship and source identity are not independently verified.</small>
              <button
                type="button"
                onClick={() => {
                  setRotationReference(null);
                  updateConfig((current) => ({ ...current, rotation: "svd", referenceRotationId: null }));
                }}
              >
                Remove
              </button>
            </div>
          ) : null}
        </div>
        {dataset ? (
          <div className="ena-dataset-card" aria-live="polite">
            <div className="ena-dataset-card-title">
              <span>{copy.data.active}</span>
              <strong>{dataset.name}</strong>
            </div>
            <dl>
              <div><dt>{copy.data.rows}</dt><dd>{dataset.rows.length.toLocaleString()}</dd></div>
              <div><dt>{copy.data.columns}</dt><dd>{dataset.headers.length}</dd></div>
              <div><dt>{copy.data.source}</dt><dd>{dataset.source === "sample" ? "Academy sample" : fileSize(dataset.sizeBytes)}</dd></div>
            </dl>
            <div className="ena-data-preview" tabIndex={0} aria-label="Dataset preview">
              <table>
                <thead><tr>{dataset.headers.slice(0, 5).map((header) => <th key={header}>{header}</th>)}</tr></thead>
                <tbody>
                  {dataset.rows.slice(0, 4).map((row, index) => (
                    <tr key={index}>{dataset.headers.slice(0, 5).map((header) => <td key={header}>{String(row[header] ?? "")}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : <div className="ena-no-dataset">{copy.data.noFile}</div>}
      </div>
    );
  }

  function renderModelPanel() {
    const headers = dataset?.headers ?? [];
    const modelTabs: Array<{ id: OpenEnaModelPanelTab; label: string }> = [
      { id: "units", label: "Units" },
      { id: "horizons", label: "Horizons" },
      { id: "windows", label: "Windows" },
      { id: "codes", label: "Codes" },
    ];
    const identityOptions = headers.filter((header) => !config.codes.includes(header));
    const codeOptions = headers.filter((header) => (
      !config.unitColumns.includes(header)
      && !config.conversationColumns.includes(header)
      && header !== config.groupColumn
    ));
    const directionalMask = currentAnalysisKind === "ona"
      ? reconcileDirectionalMask(config.directionalMask, config.codes)
      : null;

    function handleModelTabKeyDown(
      event: React.KeyboardEvent<HTMLButtonElement>,
      currentTab: OpenEnaModelPanelTab,
    ) {
      const currentIndex = MODEL_TAB_ORDER.indexOf(currentTab);
      let nextIndex: number;

      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
          nextIndex = (currentIndex + 1) % MODEL_TAB_ORDER.length;
          break;
        case "ArrowLeft":
        case "ArrowUp":
          nextIndex = (currentIndex - 1 + MODEL_TAB_ORDER.length) % MODEL_TAB_ORDER.length;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = MODEL_TAB_ORDER.length - 1;
          break;
        default:
          return;
      }

      event.preventDefault();
      const nextTab = MODEL_TAB_ORDER[nextIndex];
      setModelTab(nextTab);
      event.currentTarget.parentElement
        ?.querySelector<HTMLButtonElement>(`[data-model-tab="${nextTab}"]`)
        ?.focus();
    }

    return (
      <div className="ena-control-content">
        <div className="ena-panel-heading">
          <p className="ena-panel-kicker">02 · Model</p>
          <h2>{copy.model.title}</h2>
          <p>{dataset?.source === "sample" ? "Teaching Sample · jENA model configuration" : copy.model.description}</p>
          {dataset && currentAnalysisKind === "ena" ? (
            <button
              type="button"
              className="ena-action-button ena-action-secondary ena-trajectory-model-shortcut"
              data-testid="open-ena-configure-trajectory-model"
              onClick={openTrajectoryModelConfiguration}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="5" cy="17" r="2" />
                <circle cx="12" cy="10" r="2" />
                <circle cx="19" cy="5" r="2" />
                <path d="m6.5 15.6 4-4m3.2-2.8 3.6-2.6" />
              </svg>
              <span>{copy.model.configureTrajectory}</span>
              <span aria-hidden="true">→</span>
            </button>
          ) : null}
        </div>
        <OpenEnaAnalysisFamilyControl
          value={currentAnalysisKind}
          onChange={selectAnalysisFamily}
          copy={copy.ona.family}
          disabled={!dataset || loading || sourceBusy || referenceBusy}
        />
        <div className="ena-model-tabs" role="tablist" aria-label="Model configuration">
          {modelTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`ena-model-tab-${tab.id}`}
              aria-controls={`ena-model-panel-${tab.id}`}
              aria-selected={modelTab === tab.id}
              tabIndex={modelTab === tab.id ? 0 : -1}
              data-ena-model-tab={tab.id}
              data-model-tab={tab.id}
              onClick={() => setModelTab(tab.id)}
              onKeyDown={(event) => handleModelTabKeyDown(event, tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {!dataset ? <button type="button" className="ena-inline-link" onClick={() => setMode("data")}>← {copy.data.title}</button> : (
          <div className="ena-form-stack ena-model-tabbed-form">
            <section
              id={`ena-model-panel-${modelTab}`}
              role="tabpanel"
              aria-labelledby={`ena-model-tab-${modelTab}`}
              data-ena-model-panel={modelTab}
              className="ena-model-tab-panel"
            >
              {modelTab === "units" ? (
                <>
                  <fieldset className="ena-code-fieldset ena-identity-fieldset">
                    <legend>{copy.model.unit} identity <span>{config.unitColumns.length}</span></legend>
                    <p>{copy.model.identityHint}</p>
                    <div className="ena-code-options">
                      {identityOptions.map((header) => (
                        <label key={header}>
                          <input
                            type="checkbox"
                            checked={config.unitColumns.includes(header)}
                            onChange={(event) => updateConfig((current) => ({
                              ...current,
                              unitColumns: toggleInSelectionOrder(current.unitColumns, header, event.target.checked),
                            }))}
                          />
                          <span>{header}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label className="ena-field">
                    <span>{copy.model.group}</span>
                    <select
                      value={config.groupColumn ?? ""}
                      onChange={(event) => updateConfig((current) => {
                        const groupColumn = event.target.value || null;
                        const rotation = officialComparisonRotation(dataset, {
                          groupColumn,
                          model: current.model,
                          currentRotation: current.rotation,
                        });
                        return {
                          ...current,
                          groupColumn,
                          rotation,
                          referenceRotationId: rotation === "reference" ? current.referenceRotationId : null,
                        };
                      })}
                    >
                      <option value="">{copy.model.noGroup}</option>
                      {identityOptions.map((header) => <option key={header} value={header}>{header}</option>)}
                    </select>
                  </label>
                </>
              ) : null}

              {modelTab === "horizons" ? (
                <>
                  <fieldset className="ena-code-fieldset ena-identity-fieldset">
                    <legend>Horizon identity <span>{config.conversationColumns.length}</span></legend>
                    <p>Open ENA uses the selected conversation fields to define the analysis horizon.</p>
                    <div className="ena-code-options">
                      {identityOptions.map((header) => (
                        <label key={header}>
                          <input
                            type="checkbox"
                            checked={config.conversationColumns.includes(header)}
                            onChange={(event) => updateConfig((current) => ({
                              ...current,
                              conversationColumns: toggleInSelectionOrder(current.conversationColumns, header, event.target.checked),
                            }))}
                          />
                          <span>{header}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <p className="ena-sequence-note">{copy.model.sequenceNote}</p>
                </>
              ) : null}

              {modelTab === "windows" ? (
                currentAnalysisKind === "ona" ? (
                  <OpenEnaOrderPanel
                    value={orderPanelValueFromConfig(config)}
                    onChange={updateOnaOrderPanel}
                    rows={dataset.rows}
                    unitColumns={config.unitColumns}
                    horizonColumns={config.conversationColumns}
                    columnOptions={headers
                      .filter((header) => !config.codes.includes(header))
                      .map((header) => ({ value: header, label: header }))}
                    copy={copy.ona.order}
                    disabled={loading || sourceBusy || referenceBusy}
                    finiteWindowFallback={Number.isSafeInteger(config.windowSizeBack)
                      ? config.windowSizeBack
                      : 2}
                  />
                ) : <>
                  <label className="ena-field">
                    <span>{copy.model.window}</span>
                    <select value={config.window} onChange={(event) => updateConfig((current) => ({ ...current, window: event.target.value as WindowType }))}>
                      <option value="MovingStanzaWindow">{copy.model.movingWindow}</option>
                      <option value="Conversation">{copy.model.conversationWindow}</option>
                    </select>
                  </label>
                  {config.window === "MovingStanzaWindow" ? (
                    <div className="ena-two-fields ena-window-fields">
                      <label className="ena-field ena-range-field">
                        <span>{copy.model.back}<output>{config.windowSizeBack}</output></span>
                        <input type="range" min="1" max="21" step="1" value={config.windowSizeBack} onChange={(event) => updateConfig((current) => ({ ...current, windowSizeBack: Number(event.target.value) }))} />
                      </label>
                      <label className="ena-field ena-range-field">
                        <span>{copy.model.forward}<output>{config.windowSizeForward}</output></span>
                        <input type="range" min="0" max="20" step="1" value={config.windowSizeForward} onChange={(event) => updateConfig((current) => ({ ...current, windowSizeForward: Number(event.target.value) }))} />
                      </label>
                    </div>
                  ) : null}
                  <div className="ena-two-fields">
                    <label className="ena-field">
                      <span>{copy.model.modelType}</span>
                      <select id="open-ena-model-type" ref={modelTypeSelectRef} value={config.model} onChange={(event) => updateConfig((current) => {
                        const model = event.target.value as ModelType;
                        const rotation = officialComparisonRotation(dataset, {
                          groupColumn: current.groupColumn,
                          model,
                          currentRotation: current.rotation,
                        });
                        return {
                          ...current,
                          model,
                          rotation,
                          referenceRotationId: rotation === "reference" ? current.referenceRotationId : null,
                        };
                      })}>
                        <option value="EndPoint">{copy.model.endpoint}</option>
                        <option value="SeparateTrajectory">{copy.model.separateTrajectory}</option>
                        <option value="AccumulatedTrajectory">{copy.model.accumulatedTrajectory}</option>
                      </select>
                    </label>
                    <label className="ena-field">
                      <span>{copy.model.rotation}</span>
                      <select value={config.rotation} onChange={(event) => updateConfig((current) => {
                        const rotation = event.target.value as OpenEnaConfig["rotation"];
                        return {
                          ...current,
                          rotation,
                          referenceRotationId: rotation === "reference" ? rotationReference?.referenceId ?? null : null,
                        };
                      })}>
                        <option value="svd">{copy.model.svd}</option>
                        <option value="mean" disabled={config.model !== "EndPoint"}>{copy.model.means}</option>
                        <option value="reference" disabled={config.model !== "EndPoint" || !rotationReference}>Project into reference rotation</option>
                      </select>
                    </label>
                  </div>
                  {config.model !== "EndPoint" ? <p className="ena-sequence-note">{copy.model.trajectoryHint}</p> : null}
                  {config.rotation === "reference" && rotationReference ? (
                    <div className="ena-reference-model-note" role="status">
                      <strong>Reference space: {rotationReference.name}</strong>
                      <span>Axes, center, and node positions remain fixed. Variance reports this dataset’s distribution in the reference basis.</span>
                    </div>
                  ) : null}
                  <div className="ena-two-fields ena-model-options">
                    <label className="ena-field">
                      <span>{copy.model.weighting}</span>
                      <select value={config.weightBy} onChange={(event) => updateConfig((current) => ({ ...current, weightBy: event.target.value as "binary" | "sum" }))}>
                        <option value="binary">{copy.model.binary}</option>
                        <option value="sum">{copy.model.sum}</option>
                      </select>
                    </label>
                    <label className="ena-switch-row ena-center-switch">
                      <span>{copy.model.center}</span>
                      <input type="checkbox" checked={config.centerAlignToOrigin} onChange={(event) => updateConfig((current) => ({ ...current, centerAlignToOrigin: event.target.checked }))} />
                    </label>
                  </div>
                </>
              ) : null}

              {modelTab === "codes" ? (
                <>
                <fieldset className="ena-code-fieldset">
                  <legend>{copy.model.codes} <span>{config.codes.length}</span></legend>
                  <div className="ena-code-options">
                    {codeOptions.map((header) => {
                      const selected = config.codes.includes(header);
                      return (
                        <div className="ena-code-option-row" key={header}>
                          <label>
                            <input
                              type="checkbox"
                              checked={config.codes.includes(header)}
                              onChange={(event) => updateConfig((current) => ({
                                ...current,
                                codes: toggleInHeaderOrder(headers, current.codes, header, event.target.checked),
                              }))}
                            />
                            <span>{header}</span>
                          </label>
                          {selected ? (
                            <label className="ena-code-color-control" title={`${copy.model.codeColor}: ${header}`}>
                              <input
                                className="ena-code-color-input"
                                type="color"
                                aria-label={`${copy.model.codeColor}: ${header}`}
                                data-ena-code-color={header}
                                value={codeColorFor(codeColors, header)}
                                onChange={(event) => setCodeColors((current) => updateCodeColor(current, header, event.target.value))}
                              />
                            </label>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
                {directionalMask ? (
                  <OpenEnaDirectionalMaskEditor
                    id="open-ena-ona-directional-mask"
                    open={directionalMaskOpen}
                    onOpenChange={setDirectionalMaskOpen}
                    value={directionalMask}
                    onChange={(nextMask) => updateConfig((current) => ({
                      ...current,
                      directionalMask: nextMask,
                    }))}
                    copy={copy.ona.mask}
                    disabled={loading || sourceBusy || referenceBusy}
                  />
                ) : null}
                </>
              ) : null}
            </section>

            {configErrors.length ? (
              <ul className="ena-validation-list">{configErrors.map((item) => <li key={item}>{item}</li>)}</ul>
            ) : <div className="ena-valid-state"><span aria-hidden="true">✓</span>{copy.model.valid}</div>}
            <button type="button" className="ena-action-button ena-action-primary ena-run-button" disabled={!canRun} onClick={() => void runAnalysis()}>
              {currentAnalysisKind === "ona"
                ? result ? copy.ona.rerun : copy.ona.run
                : result ? copy.model.rerun : copy.model.run} <span aria-hidden="true">→</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderLongitudinalPanel() {
    const trajectoryResult = Boolean(result && resultConfig && result.set.modelType !== "EndPoint");
    const accumulatedOrderLocked = result?.set.modelType === "AccumulatedTrajectory";
    return (
      <section
        className="ena-longitudinal-controls"
        aria-label={copy.longitudinal.title}
        data-testid="open-ena-longitudinal-controls"
      >
        <div className="ena-group-contrast-heading">
          <h3>{copy.longitudinal.title}</h3>
          <p>{copy.longitudinal.description}</p>
        </div>
        {!trajectoryResult || !resultConfig ? (
          <p className="ena-sets-compatibility-note">{copy.longitudinal.unavailableModel}</p>
        ) : (
          <>
            <div className="ena-two-fields">
              <fieldset className="ena-inference-identity ena-longitudinal-identity">
                <legend>{copy.longitudinal.repeatedEntity}</legend>
                <div className="ena-inference-check-grid">{resultConfig.unitColumns
                  .filter((column) => column !== resultConfig.groupColumn)
                  .map((column) => (
                    <label key={column}>
                      <input
                        type="checkbox"
                        checked={repeatedEntityColumns.includes(column)}
                        onChange={(event) => updateLongitudinalSettings({
                          repeatedEntityColumns: resultConfig.unitColumns.filter((candidate) => (
                            candidate !== resultConfig.groupColumn
                            && (candidate === column
                              ? event.currentTarget.checked
                              : repeatedEntityColumns.includes(candidate))
                          )),
                        })}
                      />
                      <span>{column}</span>
                    </label>
                  ))}</div>
                <label className="ena-inference-confirmation">
                  <input
                    type="checkbox"
                    checked={identityConfirmed}
                    disabled={repeatedEntityColumns.length === 0}
                    onChange={(event) => updateLongitudinalSettings({ identityConfirmed: event.currentTarget.checked })}
                  />
                  <span>{copy.longitudinal.confirmIdentity}</span>
                </label>
                <p className="ena-sequence-note">{copy.longitudinal.identityConfirmationHint}</p>
              </fieldset>
              <label className="ena-field">
                <span>{copy.longitudinal.timeOrder}</span>
                <select
                  value={timeColumn}
                  onChange={(event) => updateLongitudinalSettings({ timeColumn: event.target.value })}
                >
                  {resultConfig.conversationColumns
                    .filter((column) => column !== resultConfig.groupColumn && !repeatedEntityColumns.includes(column))
                    .map((column) => <option key={column} value={column}>{column}</option>)}
                </select>
              </label>
            </div>
            <fieldset className="ena-camera-fieldset ena-longitudinal-cohort-fieldset">
              <legend>{copy.longitudinal.cohortPolicy}</legend>
              <label>
                <input
                  type="radio"
                  name="ena-longitudinal-cohort"
                  value="available"
                  checked={cohortPolicy === "available"}
                  onChange={() => updateLongitudinalSettings({ cohortPolicy: "available" })}
                />
                <span>{copy.longitudinal.available}</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="ena-longitudinal-cohort"
                  value="complete"
                  checked={cohortPolicy === "complete"}
                  onChange={() => updateLongitudinalSettings({ cohortPolicy: "complete" })}
                />
                <span>{copy.longitudinal.complete}</span>
              </label>
            </fieldset>
            <p className="ena-sequence-note">
              {cohortPolicy === "complete" ? copy.longitudinal.completeHint : copy.longitudinal.availableHint}
            </p>
            {accumulatedOrderLocked ? (
              <p className="ena-sequence-note" role="note">{copy.longitudinal.accumulatedOrderLocked}</p>
            ) : null}
            <div className="ena-longitudinal-time-order" data-testid="open-ena-longitudinal-time-order">
              <strong>{copy.longitudinal.observedOrder}</strong>
              <ol>{longitudinalTimeOrder.map((period, index) => (
                <li key={period} data-period={period}>
                  <span>{period}</span>
                  <span className="ena-longitudinal-order-actions">
                    <button
                      type="button"
                      aria-label={`${copy.longitudinal.moveEarlier}: ${period}`}
                      disabled={accumulatedOrderLocked || index === 0}
                      onClick={() => setLongitudinalTimeOrder((current) => {
                        const currentIndex = current.indexOf(period);
                        if (currentIndex <= 0) return current;
                        const next = [...current];
                        [next[currentIndex - 1], next[currentIndex]] = [next[currentIndex], next[currentIndex - 1]];
                        return next;
                      })}
                    >↑</button>
                    <button
                      type="button"
                      aria-label={`${copy.longitudinal.moveLater}: ${period}`}
                      disabled={accumulatedOrderLocked || index === longitudinalTimeOrder.length - 1}
                      onClick={() => setLongitudinalTimeOrder((current) => {
                        const currentIndex = current.indexOf(period);
                        if (currentIndex < 0 || currentIndex >= current.length - 1) return current;
                        const next = [...current];
                        [next[currentIndex], next[currentIndex + 1]] = [next[currentIndex + 1], next[currentIndex]];
                        return next;
                      })}
                    >↓</button>
                  </span>
                </li>
              ))}</ol>
            </div>
            <div className="ena-switch-stack">
              <label className="ena-switch-row">
                <span>{copy.longitudinal.showIndividualPaths}</span>
                <input type="checkbox" checked={showTrajectories} onChange={(event) => setShowTrajectories(event.target.checked)} />
              </label>
              <label className="ena-switch-row">
                <span>{copy.longitudinal.showGroupPaths}</span>
                <input type="checkbox" checked={showGroupCentroidPaths} onChange={(event) => setShowGroupCentroidPaths(event.target.checked)} />
              </label>
            </div>
            {longitudinalView ? (
              <>
                {!resultConfig.groupColumn ? <p>{copy.longitudinal.allUnits}</p> : null}
                <div className="ena-stats-scroll" data-testid="open-ena-longitudinal-period-diagnostics">
                  <table className="ena-stats-table">
                    <caption>{copy.longitudinal.descriptive}</caption>
                    <thead>
                      <tr>
                        <th>{copy.longitudinal.group}</th>
                        <th>{copy.longitudinal.period}</th>
                        <th>{copy.longitudinal.availableCount}</th>
                        <th>{copy.longitudinal.completeCount}</th>
                        <th>{copy.longitudinal.includedCount}</th>
                        <th>{copy.longitudinal.excludedCount}</th>
                      </tr>
                    </thead>
                    <tbody>{longitudinalView.periodDiagnostics.map((period) => (
                      <tr key={`${period.group}-${period.time}`}>
                        <th scope="row">{period.group}</th>
                        <td>{period.time}</td>
                        <td>{period.availableEntityCount}</td>
                        <td>{period.completeEntityCount}</td>
                        <td>{period.includedEntityCount}</td>
                        <td>{period.excludedEntityCount}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <p className="ena-sequence-note">{copy.longitudinal.noEndpointTests}</p>
                <div className="ena-two-fields ena-longitudinal-export-actions">
                  <button
                    type="button"
                    className="ena-action-button ena-action-secondary"
                    onClick={() => downloadJson(
                      `open-ena-${Date.now()}-longitudinal-group-centroids.json`,
                      buildLongitudinalGroupCentroidExport(longitudinalView, {
                        flipX,
                        flipY,
                        showIndividualPaths: showTrajectories,
                        showGroupCentroidPaths,
                        showPoints,
                        showLabels,
                        showVariance,
                        pointScale,
                        plotZoom,
                      }, currentInference),
                      true,
                    )}
                  >
                    {copy.longitudinal.exportJson} ↓
                  </button>
                  <button
                    type="button"
                    className="ena-action-button ena-action-secondary"
                    onClick={() => downloadText(
                      `open-ena-${Date.now()}-longitudinal-group-centroids.csv`,
                      longitudinalPeriodRowsToCsv(longitudinalView),
                      "text/csv;charset=utf-8",
                    )}
                  >
                    {copy.longitudinal.exportCsv} ↓
                  </button>
                </div>
              </>
            ) : (
              <p className="ena-sets-compatibility-note">{longitudinalViewError}</p>
            )}
            <div className="ena-longitudinal-export-actions">
              <button
                type="button"
                className="ena-action-button ena-action-secondary"
                disabled={!currentInference || !longitudinalView}
                onClick={() => {
                  if (currentInference && longitudinalView) {
                    downloadText(
                      `open-ena-${Date.now()}-longitudinal-inference.csv`,
                      longitudinalInferenceRowsToCsv(longitudinalView, currentInference),
                      "text/csv;charset=utf-8",
                    );
                  }
                }}
              >
                {copy.longitudinal.exportInferenceCsv} ↓
              </button>
            </div>
          </>
        )}
      </section>
    );
  }

  function renderPlotPanel() {
    const dimensions = view === "3d"
      ? result?.dimensions ?? ["SVD1", "SVD2", "SVD3"]
      : displayedComparisonSurface === "sets"
      ? primarySet?.geometry.dimensions ?? result?.dimensions ?? ["SVD1", "SVD2", "SVD3"]
      : result?.dimensions ?? primarySet?.geometry.dimensions ?? ["SVD1", "SVD2", "SVD3"];
    return (
      <div className="ena-control-content">
        <div className="ena-panel-heading">
          <p className="ena-panel-kicker">03 · Presenter</p>
          <h2>{completedResultKind === "ona" ? copy.ona.presenter.title : copy.plot.title}</h2>
          <p>{completedResultKind === "ona" ? copy.ona.presenter.description : copy.plot.description}</p>
        </div>
        <div className="ena-form-stack">
          {completedResultKind === "ona" ? (
            <section className="ena-ordered-presenter-boundary" role="note">
              <strong>{copy.ona.layout.directionGuide}</strong>
              <p>{copy.ona.presenter.directionBoundary}</p>
              <p>{copy.ona.layout.descriptiveBoundary}</p>
            </section>
          ) : <>
          {renderLongitudinalPanel()}
          <section
            className="ena-group-contrast-controls"
            aria-label="Endpoint group contrast"
            data-testid="open-ena-endpoint-group-contrast-controls"
          >
            <div className="ena-group-contrast-heading">
              <h3>{copy.contrast.title}</h3>
              <p>{copy.contrast.description}</p>
            </div>
            {result && resultConfig && !contrastUnavailable ? (
              <>
                <div className="ena-two-fields">
                  <label className="ena-field">
                    <span>{copy.contrast.primary}</span>
                    <select
                      value={primaryGroupName}
                      onChange={(event) => {
                        const nextPrimary = event.target.value;
                        setPrimaryGroupName(nextPrimary);
                        if (secondaryGroupName === nextPrimary) {
                          setSecondaryGroupName(result.groups.find((group) => group.name !== nextPrimary)?.name ?? "");
                        }
                        setActiveComparisonSurface("groups");
                      }}
                    >
                      {result.groups.map((group) => (
                        <option key={group.name} value={group.name} disabled={group.name === secondaryGroupName}>{group.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="ena-field">
                    <span>{copy.contrast.secondary}</span>
                    <select
                      value={secondaryGroupName}
                      onChange={(event) => {
                        const nextSecondary = event.target.value;
                        setSecondaryGroupName(nextSecondary);
                        if (primaryGroupName === nextSecondary) {
                          setPrimaryGroupName(result.groups.find((group) => group.name !== nextSecondary)?.name ?? "");
                        }
                        setActiveComparisonSurface("groups");
                      }}
                    >
                      {result.groups.map((group) => (
                        <option key={group.name} value={group.name} disabled={group.name === primaryGroupName}>{group.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <button
                  type="button"
                  className="ena-action-button ena-action-secondary ena-group-contrast-swap"
                  disabled={!primaryGroupName || !secondaryGroupName}
                  onClick={() => {
                    setPrimaryGroupName(secondaryGroupName);
                    setSecondaryGroupName(primaryGroupName);
                    setActiveComparisonSurface("groups");
                  }}
                >
                  {copy.contrast.swap} ↔
                </button>
                <p className="ena-group-contrast-order">
                  {copy.contrast.selectedOrder}: <strong>{primaryGroupName} → {secondaryGroupName}</strong>. {copy.contrast.multiplicity}
                </p>
                <div className="ena-two-fields ena-group-contrast-export-actions">
                  <button
                    type="button"
                    className="ena-action-button ena-action-secondary"
                    disabled={!groupContrast}
                    onClick={() => groupContrast && downloadJson(
                      `open-ena-${Date.now()}-group-contrast.json`,
                      buildPairwiseGroupContrastExport(groupContrast, {
                        flipX,
                        flipY,
                        edgeThreshold,
                        showNetworks,
                        showPoints,
                        showLabels,
                        showGroupLabels,
                        showUnitLabels,
                        showVariance,
                        edgeScale,
                        pointScale,
                        plotZoom,
                      }),
                      true,
                    )}
                  >
                    {copy.contrast.exportJson} ↓
                  </button>
                  <button
                    type="button"
                    className="ena-action-button ena-action-secondary"
                    disabled={!groupContrast}
                    onClick={() => groupContrast && downloadText(
                      `open-ena-${Date.now()}-group-contrast-edges.csv`,
                      pairwiseGroupContrastEdgesToCsv(groupContrast),
                      "text/csv;charset=utf-8",
                    )}
                  >
                    {copy.contrast.exportEdges} ↓
                  </button>
                </div>
                <p className="ena-export-identifier-note">Derived contrast files retain analytic-unit and group identifiers; pseudonymize them before sharing when needed.</p>
              </>
            ) : (
              <p className="ena-sets-compatibility-note">{groupContrastState.error}</p>
            )}
          </section>
          {setComparison && result ? (
            <div className="ena-surface-choice" role="group" aria-label="Active comparison surface">
              <button type="button" aria-pressed={displayedComparisonSurface !== "sets"} onClick={() => setActiveComparisonSurface("groups")}>
                {groupContrast ? "Current groups" : "Current model"}
              </button>
              <button type="button" aria-pressed={displayedComparisonSurface === "sets"} onClick={() => setActiveComparisonSurface("sets")}>Captured sets</button>
            </div>
          ) : null}
          </>}
          <div className="ena-switch-stack">
            {([
              [showPoints, updatePointVisibility, copy.plot.showPoints],
              ...(!activeLongitudinalView ? [[showNetworks, setShowNetworks, copy.plot.showNetworks] as const] : []),
              [showLabels, setShowLabels, copy.plot.showLabels],
              ...(!activeLongitudinalView ? [[showUnitLabels, setShowUnitLabels, copy.plot.showUnitLabels] as const] : []),
              [showVariance, setShowVariance, copy.plot.showVariance],
            ] as const).map(([checked, setter, label]) => (
              <label key={label} className="ena-switch-row">
                <span>{label}</span>
                <input type="checkbox" checked={checked} onChange={(event) => setter(event.target.checked)} />
              </label>
            ))}
          </div>
          {([
            [copy.plot.axisX, xDimension, "x"],
            [copy.plot.axisY, yDimension, "y"],
            ...(view === "3d" ? [[copy.plot.axisZ, zDimension, "z"] as const] : []),
          ] as Array<[string, string, "x" | "y" | "z"]>).map(([label, value, axis]) => (
            <label key={label} className="ena-field">
              <span>{label}</span>
              <select value={value} onChange={(event) => selectAxisDimension(axis, event.target.value)}>
                {dimensions.map((dimension) => <option key={dimension} value={dimension}>{dimension}</option>)}
              </select>
            </label>
          ))}
          {!activeLongitudinalView ? (
            <>
              <label className="ena-field ena-range-field">
                <span>{copy.plot.edgeScale}<output>{edgeScale.toFixed(1)}×</output></span>
                <input type="range" min="0.1" max="4" step="0.1" value={edgeScale} onChange={(event) => setEdgeScale(Number(event.target.value))} />
              </label>
              <label className="ena-field ena-range-field">
                <span>{copy.plot.edgeThreshold}<output>{Math.round(edgeThreshold * 100)}%</output></span>
                <input type="range" min="0" max="0.95" step="0.05" value={edgeThreshold} onChange={(event) => setEdgeThreshold(Number(event.target.value))} />
              </label>
            </>
          ) : null}
          <label className="ena-field ena-range-field">
            <span>{copy.plot.pointScale}<output>{pointScale.toFixed(1)}×</output></span>
            <input type="range" min="0.5" max="2" step="0.1" value={pointScale} onChange={(event) => setPointScale(Number(event.target.value))} />
          </label>
          <div className="ena-plot-actions" role="group" aria-label="Plot position and scale">
            <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => setPlotZoom((value) => Math.max(0.6, Number((value - 0.2).toFixed(1))))}>−</button>
            <button type="button" aria-label="Fit plot" title="Fit plot" onClick={() => setPlotZoom(1)}>Fit plot · {plotZoom.toFixed(1)}×</button>
            <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => setPlotZoom((value) => Math.min(2.4, Number((value + 0.2).toFixed(1))))}>+</button>
          </div>
          <div className="ena-plot-actions ena-plot-flips" role="group" aria-label="Axis direction">
            <button type="button" aria-pressed={flipX} onClick={() => setFlipX((value) => !value)}>Flip X</button>
            <button type="button" aria-pressed={flipY} onClick={() => setFlipY((value) => !value)}>Flip Y</button>
          </div>
          {view === "3d" ? (
            <fieldset className="ena-camera-fieldset">
              <legend>{copy.plot.cameraPosition}</legend>
              {cameraPositionOptions.map(([value, label]) => (
                <label key={value}><input type="radio" name="ena-camera" value={value} checked={camera === value} onChange={() => selectCameraPreset(value)} /><span>{label}</span></label>
              ))}
            </fieldset>
          ) : null}
          <button type="button" className="ena-action-button ena-action-secondary" onClick={resetPlot}>{copy.plot.reset}</button>
          <div className="ena-two-fields ena-figure-exports">
            <button type="button" className="ena-action-button ena-action-secondary" disabled={view === "3d" || (!result && !activeSetComparison)} onClick={exportPlotSvg}>Export SVG ↓</button>
            <button type="button" className="ena-action-button ena-action-secondary" disabled={view === "3d" || (!result && !activeSetComparison)} onClick={exportPlotPng}>Export PNG ↓</button>
          </div>
          {view === "3d" ? <p className="ena-plot-export-note">{copy.plot.threeDExportHint}</p> : null}
        </div>
      </div>
    );
  }

  function renderAiPanel() {
    if (capabilityAnalysisKind === "ona") {
      return (
        <div className="ena-control-content ena-ai-mode-panel">
          <div className="ena-panel-heading">
            <p className="ena-panel-kicker">AI</p>
            <h2>{copy.aiInterpretation.title}</h2>
            <p>{copy.ona.unavailable.ai}</p>
          </div>
        </div>
      );
    }
    const aiReady = Boolean(
      result
      && !resultIsStale
      && currentInference
      && aiInterpretationRequest,
    );
    const disabledReason = resultIsStale
      ? copy.aiInterpretation.staleResult
      : result && !currentInference
        ? copy.stats.inference.noResult
        : result && !aiInterpretationRequest
          ? copy.aiInterpretation.aggregatePrivacyGate
          : copy.aiInterpretation.noCurrentResult;

    return (
      <div
        className="ena-control-content ena-ai-mode-panel"
        data-ena-ai-source="stats-results"
        data-ena-ai-readiness={aiReady ? "ready" : "required"}
      >
        <div className="ena-panel-heading ena-ai-mode-heading">
          <p className="ena-panel-kicker">AI</p>
          <h2>{copy.aiInterpretation.title}</h2>
          <p>{copy.aiInterpretation.description}</p>
        </div>
        <section
          className="ena-ai-stats-source"
          data-state={aiReady ? "ready" : "required"}
          aria-label={copy.aiInterpretation.statsSourceLabel}
        >
          <div className="ena-ai-stats-source-summary">
            <span className="ena-ai-stats-badge" aria-hidden="true">STATS</span>
            <div>
              <strong>{copy.aiInterpretation.statsSourceLabel}</strong>
              <p>{aiReady ? copy.aiInterpretation.statsReady : copy.aiInterpretation.statsRequired}</p>
            </div>
          </div>
          <button
            type="button"
            className="ena-inline-link"
            onClick={() => {
              setStatsTab("comparison");
              setMode("stats");
            }}
          >
            {copy.aiInterpretation.openStats} →
          </button>
        </section>
        <OpenEnaAiInterpretation
          key={`${locale}:${inferenceRequestKey}:${currentInference?.analyzedAt ?? "no-inference"}`}
          request={aiInterpretationRequest}
          disabled={!result || resultIsStale || !aiInterpretationRequest || !currentInference}
          disabledReason={disabledReason}
          copy={copy.aiInterpretation}
          showHeading={false}
        />
      </div>
    );
  }

  function renderStatsPanel() {
    if (completedResultKind === "ona") {
      if (!result || !resultConfig) {
        return (
          <div className="ena-control-content">
            <div className="ena-panel-heading">
              <p className="ena-panel-kicker">ONA</p>
              <h2>{copy.ona.stats.title}</h2>
              <p>{copy.workspace.emptyText}</p>
            </div>
          </div>
        );
      }
      const selectedGroup = onaStatsContext === "primary"
        ? primaryGroupName || result.groups[0]?.name
        : onaStatsContext === "secondary"
          ? secondaryGroupName || result.groups[1]?.name
          : null;
      const scope = selectedGroup
        ? { kind: "group" as const, name: selectedGroup }
        : { kind: "overall" as const };
      const contextOptions = [
        { value: "comparison" as const, label: copy.ona.dataView.overall },
        ...(result.groups[0]
          ? [{ value: "primary" as const, label: `${copy.ona.dataView.primary} · ${primaryGroupName || result.groups[0].name}` }]
          : []),
        ...(result.groups[1]
          ? [{ value: "secondary" as const, label: `${copy.ona.dataView.secondary} · ${secondaryGroupName || result.groups[1].name}` }]
          : []),
      ];
      const exportAggregate = () => {
        try {
          const exported = buildOpenEnaOnaAggregateEdgeExport({ result, config: resultConfig, scope });
          downloadText(
            `open-ena-ona-${scope.kind === "group" ? "group-" : "overall-"}${Date.now()}-aggregate-edges.csv`,
            exported.csv,
            "text/csv;charset=utf-8",
          );
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      };
      const exportAudit = () => {
        if (!window.confirm(copy.ona.exports.auditConfirmation)) return;
        try {
          const exported = buildOpenEnaOnaDeidentifiedAuditExport({ result, config: resultConfig });
          downloadText(
            `open-ena-ona-${Date.now()}-deidentified-audit.csv`,
            exported.csv,
            "text/csv;charset=utf-8",
          );
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      };

      return (
        <div className="ena-control-content ena-ona-stats-panel">
          <div className="ena-panel-heading">
            <p className="ena-panel-kicker">ONA · descriptive</p>
            <h2>{copy.ona.stats.title}</h2>
            <p>{copy.ona.stats.descriptiveBoundary}</p>
          </div>
          <label className="ena-field ena-ona-stats-scope">
            <span>{copy.ona.exports.scopeLabel}</span>
            <select
              value={onaStatsContext}
              onChange={(event) => setOnaStatsContext(event.currentTarget.value as OpenEnaDataViewContext)}
            >
              {contextOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <OpenEnaOnaStats
            result={result}
            config={resultConfig}
            scope={scope}
            copy={copy.ona.stats}
          />
          <section className="ena-ona-export-panel" aria-labelledby="open-ena-ona-export-title">
            <header>
              <h3 id="open-ena-ona-export-title">{copy.ona.exports.title}</h3>
              <p>{copy.ona.exports.description}</p>
            </header>
            <div>
              <button type="button" className="ena-action-button ena-action-secondary" onClick={exportAggregate}>
                {copy.ona.exports.aggregateLabel} ↓
              </button>
              <p>{copy.ona.exports.aggregateDescription}</p>
            </div>
            <div>
              <button type="button" className="ena-action-button ena-action-secondary" onClick={exportAudit}>
                {copy.ona.exports.auditLabel} ↓
              </button>
              <p>{copy.ona.exports.auditDescription}</p>
            </div>
            <p className="ena-ona-export-warning" role="note">{copy.ona.exports.auditWarning}</p>
          </section>
        </div>
      );
    }
    const manifestConfig = resultConfig ?? config;
    const statsTabs = [
      { id: "comparison", label: copy.stats.tabs.comparison },
      { id: "goodness", label: copy.stats.tabs.goodness },
      { id: "variance", label: copy.stats.tabs.variance },
    ] as const;

    function handleStatsTabKeyDown(
      event: React.KeyboardEvent<HTMLButtonElement>,
      currentTab: OpenEnaStatsTab,
    ) {
      const currentIndex = STATS_TAB_ORDER.indexOf(currentTab);
      let nextIndex: number;
      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
          nextIndex = (currentIndex + 1) % STATS_TAB_ORDER.length;
          break;
        case "ArrowLeft":
        case "ArrowUp":
          nextIndex = (currentIndex - 1 + STATS_TAB_ORDER.length) % STATS_TAB_ORDER.length;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = STATS_TAB_ORDER.length - 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      const nextTab = STATS_TAB_ORDER[nextIndex];
      setStatsTab(nextTab);
      event.currentTarget.parentElement
        ?.querySelector<HTMLButtonElement>(`[data-stats-tab="${nextTab}"]`)
        ?.focus();
    }

    function renderJenaTestContent() {
      if (!result) return null;
      return result.stats.tests?.length ? (
        <>
          <div className="ena-stats-scroll">
            <table className="ena-stats-table">
              <caption className="sr-only">{copy.stats.ui.jenaTestsCaption}</caption>
              <thead><tr>
                <th scope="col">{copy.stats.ui.axis}</th>
                <th scope="col">{copy.stats.ui.test}</th>
                <th scope="col">{copy.stats.ui.statistic}</th>
                <th scope="col">{copy.stats.ui.degreesFreedom}</th>
              </tr></thead>
              <tbody>{result.stats.tests.map((test) => (
                <tr key={`${test.dimension}-${test.test}`}>
                  <th scope="row">{test.dimension}</th>
                  <td>{test.test === "welch-t" ? copy.stats.ui.welchT : copy.stats.ui.oneWayF}</td>
                  <td>{formatStatistic(test.statistic, 3, copy.stats.ui.notEstimable)}</td>
                  <td>{test.df !== undefined
                    ? formatStatistic(test.df, 2, copy.stats.ui.notEstimable)
                    : `${formatStatistic(test.dfBetween, 0, copy.stats.ui.notEstimable)}/${formatStatistic(test.dfWithin, 0, copy.stats.ui.notEstimable)}`}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p>
            {formatCopyTemplate(copy.stats.ui.fittedModelGroupOrder, {
              groups: result.stats.tests[0]?.groups.join(" → ") ?? "—",
              notEstimable: copy.stats.ui.notEstimable,
            })} {copy.stats.notTest}
          </p>
        </>
      ) : result.statsDiagnostics.tests === "omitted-unit-limit" ? (
        <p>{formatCopyTemplate(copy.stats.ui.omittedTests, {
          units: result.set.points.length.toLocaleString(),
          limit: result.statsDiagnostics.correlationUnitLimit.toLocaleString(),
        })}</p>
      ) : result.statsDiagnostics.tests === "not-applicable-trajectory" ? (
        <p>{copy.stats.trajectoryNotice}</p>
      ) : null;
    }

    return (
      <div className="ena-control-content">
        <div className="ena-panel-heading">
          <p className="ena-panel-kicker">{copy.stats.ui.evidenceKicker}</p>
          <h2>{copy.stats.title}</h2>
          <p>{copy.stats.description}</p>
        </div>
        <div className="ena-stats-tabs" role="tablist" aria-label={copy.stats.ui.viewsAriaLabel}>
          {statsTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`ena-stats-tab-${tab.id}`}
              aria-controls={"ena-stats-active-panel"}
              aria-selected={statsTab === tab.id}
              tabIndex={statsTab === tab.id ? 0 : -1}
              data-ena-stats-tab={tab.id}
              data-stats-tab={tab.id}
              onClick={() => setStatsTab(tab.id)}
              onKeyDown={(event) => handleStatsTabKeyDown(event, tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {!result ? <button type="button" className="ena-inline-link" onClick={() => setMode(dataset ? "model" : "data")}>← {dataset ? copy.model.title : copy.data.title}</button> : (
          <div className="ena-stats-stack">
            <div
              id="ena-stats-active-panel"
              role="tabpanel"
              aria-labelledby={`ena-stats-tab-${statsTab}`}
              data-ena-stats-panel={statsTab}
            >
              <div data-ena-stats-panel="comparison" hidden={statsTab !== "comparison"}>
                <section>
                  <h3>{copy.stats.groupSummary}</h3>
                  {result.groups.map((group) => (
                    <div key={group.name} className="ena-group-stat"><span><i style={{ background: group.color }} />{group.name}</span><strong>n = {group.count}</strong></div>
                  ))}
                </section>
                <div data-ena-stats-scope="selected-pair">
                  <OpenEnaInferencePanel
                    copy={copy.stats.inference}
                    modelType={result.set.modelType}
                    design={inferenceDesign}
                    designAvailability={inferenceDesignAvailability}
                    onDesignChange={setInferenceDesign}
                    repeatedEntityColumns={repeatedEntityColumns}
                    repeatedEntityColumnOptions={(resultConfig?.unitColumns ?? [])
                      .filter((column) => column !== resultConfig?.groupColumn)}
                    identityConfirmed={identityConfirmed}
                    onRepeatedEntityColumnsChange={(columns) => updateLongitudinalSettings({ repeatedEntityColumns: columns })}
                    onIdentityConfirmedChange={(confirmed) => updateLongitudinalSettings({ identityConfirmed: confirmed })}
                    timeColumn={timeColumn}
                    timeColumnOptions={(resultConfig?.conversationColumns ?? [])
                      .filter((column) => (
                        column !== resultConfig?.groupColumn
                        && !repeatedEntityColumns.includes(column)
                      ))}
                    onTimeColumnChange={(column) => updateLongitudinalSettings({ timeColumn: column })}
                    groupOptions={inferenceGroupOptions}
                    selectedGroup={inferenceGroup}
                    primaryGroup={selectedInferencePrimaryGroup}
                    secondaryGroup={selectedInferenceSecondaryGroup}
                    onSelectedGroupChange={setInferenceGroup}
                    onPrimaryGroupChange={(group) => {
                      if (result.set.modelType === "EndPoint") setPrimaryGroupName(group);
                      else setInferencePrimaryGroup(group);
                    }}
                    onSecondaryGroupChange={(group) => {
                      if (result.set.modelType === "EndPoint") setSecondaryGroupName(group);
                      else setInferenceSecondaryGroup(group);
                    }}
                    periodOptions={longitudinalTimeOrder}
                    selectedPeriod={inferencePeriod}
                    earlierPeriod={inferenceEarlierPeriod}
                    laterPeriod={inferenceLaterPeriod}
                    repeatedPeriods={inferenceRepeatedPeriods}
                    onSelectedPeriodChange={setInferencePeriod}
                    onEarlierPeriodChange={setInferenceEarlierPeriod}
                    onLaterPeriodChange={setInferenceLaterPeriod}
                    onRepeatedPeriodsChange={setInferenceRepeatedPeriods}
                    preview={inferencePreviewState.preview}
                    eligibilityMessage={inferenceEligibilityMessage}
                    canRun={canRunInference}
                    running={inferenceRunning}
                    inference={currentInference}
                    integrityError={inferenceIntegrityError ?? inferencePreviewState.error}
                    onRun={() => void runInferentialComparison()}
                  />
                  {groupContrast ? (
                    <section className="ena-selected-contrast-summary">
                      <h3>{copy.contrast.title}</h3>
                      <p>
                        {copy.contrast.selectedOrder}: <strong>{groupContrast.groupOrder.join(" → ")}</strong>.{" "}
                        {copy.contrast.selectedAxes}: <strong>{groupContrast.axes.join(" × ")}</strong>.{" "}
                        {copy.contrast.multiplicity}
                      </p>
                    </section>
                  ) : null}
                  {referenceMeanNotice ? (
                    <section className="ena-reference-interpretation">
                      <h3>{copy.stats.ui.referenceMr1Title}</h3>
                      <p>{referenceMeanNotice}</p>
                    </section>
                  ) : null}
                  {result.set.modelType === "EndPoint" && groupContrast ? <section>
                    <h3 aria-label={copy.stats.effect}>{copy.stats.effect} · {copy.stats.ui.selectedPair}</h3>
                    <div className="ena-effect-grid">
                      {groupContrast.axes.map((dimension) => {
                        const effect = dimensionEffect(result, manifestConfig.groupColumn, dimension, groupContrast.groupOrder);
                        return <div key={dimension}><span>{dimension}</span><strong>{effect === null ? "—" : effect.toFixed(3)}</strong></div>;
                      })}
                    </div>
                    <p>{copy.stats.notTest}</p>
                    {manifestConfig.rotation === "mean" ? (
                      <p>{formatCopyTemplate(copy.stats.ui.mr1Circularity, {
                        groups: result.groups.slice(0, 2).map((group) => group.name).join(" → "),
                      })}</p>
                    ) : null}
                  </section> : null}
                </div>
                {result.groups.length > 2 ? (
                  <section data-ena-stats-scope="all-groups-omnibus">
                    <h3>{copy.stats.ui.allGroupTitle}</h3>
                    <p>{copy.stats.ui.allGroupDescription}</p>
                    {renderJenaTestContent()}
                  </section>
                ) : (
                  <section data-ena-stats-scope="fitted-model">
                    <h3>{copy.stats.verifiedTests}</h3>
                    {renderJenaTestContent()}
                  </section>
                )}
              </div>
              <div data-ena-stats-panel="goodness" hidden={statsTab !== "goodness"}>
                <section>
                  <h3>{copy.stats.correlations}</h3>
                  {result.statsDiagnostics.correlations === "complete" ? (
                    <>
                      <div className="ena-stats-scroll">
                        <table className="ena-stats-table">
                          <caption className="sr-only">{copy.stats.ui.correlationsCaption}</caption>
                          <thead><tr>
                            <th scope="col">{copy.stats.ui.axis}</th>
                            <th scope="col">{copy.stats.ui.pearsonR}</th>
                            <th scope="col">{copy.stats.ui.spearmanRho}</th>
                          </tr></thead>
                          <tbody>{result.stats.correlations
                            .filter((correlation) => [xDimension, yDimension].includes(correlation.dimension))
                            .map((correlation) => (
                              <tr key={correlation.dimension}>
                                <th scope="row">{correlation.dimension}</th>
                                <td>{formatStatistic(correlation.pearson, 3, copy.stats.ui.notEstimable)}</td>
                                <td>{formatStatistic(correlation.spearman, 3, copy.stats.ui.notEstimable)}</td>
                              </tr>
                            ))}</tbody>
                        </table>
                      </div>
                      <p>{copy.stats.ui.correlationsExplanation}</p>
                    </>
                  ) : result.statsDiagnostics.correlations === "omitted-unit-limit" ? (
                    <p>{formatCopyTemplate(copy.stats.ui.omittedCorrelations, {
                      units: result.set.points.length.toLocaleString(),
                      limit: result.statsDiagnostics.correlationUnitLimit.toLocaleString(),
                    })}</p>
                  ) : result.statsDiagnostics.correlations === "not-applicable-reference" ? (
                    <p>{copy.stats.ui.projectionCorrelationBoundary}</p>
                  ) : (
                    <p>{copy.stats.trajectoryNotice}</p>
                  )}
                </section>
              </div>
              <div data-ena-stats-panel="variance" hidden={statsTab !== "variance"}>
                <section>
                  <h3>{copy.stats.variance}</h3>
                  <table className="ena-stats-table">
                    <caption className="sr-only">{copy.stats.ui.varianceCaption}</caption>
                    <thead><tr>
                      <th scope="col">{copy.stats.ui.axis}</th>
                      <th scope="col">{copy.stats.ui.share}</th>
                    </tr></thead>
                    <tbody>{[xDimension, yDimension].map((dimension) => <tr key={dimension}>
                      <th scope="row">{dimension}</th>
                      <td>{((result.set.variance[dimension] ?? 0) * 100).toFixed(1)}%</td>
                    </tr>)}</tbody>
                  </table>
                  <p>
                    {copy.stats.ui.varianceExplanation}
                    {result.projectionReference ? ` ${copy.stats.ui.projectedVarianceBoundary}` : ""}
                  </p>
                </section>
              </div>
            </div>
            <div className="ena-stats-export-region" data-ena-stats-export="true">
              <section className="ena-manifest-section">
              <h3>{copy.stats.manifest}</h3>
              <dl>
                <div><dt>jENA</dt><dd>v{JENA_RUNTIME_VERSION}</dd></div>
                <div><dt>{copy.model.unit}</dt><dd>{manifestConfig.unitColumns.join(" + ")}</dd></div>
                <div><dt>{copy.model.conversation}</dt><dd>{manifestConfig.conversationColumns.join(" + ")}</dd></div>
                <div><dt>{copy.model.modelType}</dt><dd>{manifestConfig.model}</dd></div>
                <div><dt>{copy.model.window}</dt><dd>{manifestConfig.window}</dd></div>
                <div><dt>{copy.model.rotation}</dt><dd>{manifestConfig.rotation}</dd></div>
                {result.projectionReference ? <div><dt>{copy.stats.ui.referenceSpace}</dt><dd>{result.projectionReference.name}</dd></div> : null}
                <div><dt>{copy.model.forward}</dt><dd>{manifestConfig.windowSizeForward}</dd></div>
                <div>
                  <dt>{copy.sets.sourceHash}</dt>
                  <dd title={datasetHash ?? copy.stats.ui.notRecorded}>{datasetHash ? `${datasetHash.slice(0, 12)}…` : "—"}</dd>
                </div>
                <div><dt>{copy.sets.hashScope}</dt><dd>{dataset?.hashKind ?? copy.stats.ui.legacyHashScope}</dd></div>
              </dl>
              <div className="ena-export-stack">
                <button type="button" className="ena-action-button ena-action-primary" disabled={!manifest} onClick={() => manifest && downloadJson(`open-ena-${Date.now()}-manifest.json`, manifest)}>
                  {copy.stats.export} <span aria-hidden="true">↓</span>
                </button>
                <button
                  type="button"
                  className="ena-action-button ena-action-secondary"
                  disabled={!dataset || !result || !resultConfig}
                  onClick={() => {
                    if (dataset && result && resultConfig) {
                      downloadJson(
                        `open-ena-${Date.now()}-results.json`,
                        buildAnalysisBundle(dataset, resultConfig, result, datasetHash, {
                          codeColors,
                          methodsDimensions: [xDimension, yDimension],
                          methodsFlipX: flipX,
                          methodsFlipY: flipY,
                          edgeThreshold,
                          showNetworks,
                          showPoints,
                          showTrajectories,
                          showLabels,
                          showUnitLabels,
                          showVariance,
                          edgeScale,
                          pointScale,
                          plotZoom,
                          selectedGroupOrder: groupContrast?.groupOrder,
                          groupContrast,
                          inference: currentInference,
                          inferenceContext: inferenceProducerContext ?? undefined,
                        }),
                        true,
                      );
                    }
                  }}
                >
                  {copy.stats.exportBundle} <span aria-hidden="true">↓</span>
                </button>
                <button
                  type="button"
                  className="ena-action-button ena-action-secondary"
                  disabled={!dataset || !result || !resultConfig || result.set.modelType !== "EndPoint"}
                  onClick={() => {
                    if (dataset && result && resultConfig && result.set.modelType === "EndPoint") {
                      downloadJson(
                        `open-ena-${Date.now()}-reference-rotation.json`,
                        buildReferenceRotationPackage(dataset, resultConfig, result, datasetHash),
                        true,
                      );
                    }
                  }}
                >
                  {copy.stats.ui.referenceRotationJson} <span aria-hidden="true">↓</span>
                </button>
              </div>
            </section>
            <section className="ena-methods-section" aria-label={copy.stats.ui.methodsTitle}>
              <h3>{copy.stats.ui.methodsTitle}</h3>
              <p>{copy.stats.ui.methodsDescription}</p>
              <div className="ena-two-fields">
                <button
                  type="button"
                  className="ena-action-button ena-action-secondary"
                  disabled={!methodsReport}
                  onClick={() => void copyMethodsReport()}
                >
                  {copy.stats.ui.copyMethods} {methodsCopyStatus ? "✓" : ""}
                </button>
                <button
                  type="button"
                  className="ena-action-button ena-action-secondary"
                  disabled={!methodsReport}
                  onClick={() => methodsReport && downloadText(
                    `open-ena-${Date.now()}-methods-report.md`,
                    methodsReport,
                    "text/markdown;charset=utf-8",
                  )}
                >
                  {copy.stats.ui.methodsReport} ↓
                </button>
              </div>
              {methodsReport ? (
                <details className="ena-methods-preview">
                  <summary>{copy.stats.ui.methodsPreview}</summary>
                  <pre>{methodsReport}</pre>
                </details>
              ) : null}
              </section>
              {renderResultTables()}
              {renderSourceEvidence()}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderSourceEvidence() {
    if (!dataset) return null;
    return (
      <details className="ena-source-evidence">
        <summary>
          <span>Source evidence</span>
          <small>{sourceEvidenceRows.length.toLocaleString()} of {dataset.rows.length.toLocaleString()} coded rows</small>
        </summary>
        <div className="ena-source-evidence-controls">
          <label className="ena-field">
            <span>Search every source field</span>
            <input
              type="search"
              value={sourceQuery}
              placeholder="Unit, conversation, code, or text"
              onChange={(event) => {
                setSourceQuery(event.target.value);
                setSourcePage(0);
              }}
            />
          </label>
          <label className="ena-switch-row">
            <span>Rows with an active selected code</span>
            <input
              type="checkbox"
              checked={activeCodesOnly}
              onChange={(event) => {
                setActiveCodesOnly(event.target.checked);
                setSourcePage(0);
              }}
            />
          </label>
        </div>
        <p className="ena-source-privacy">
          {copy.aiInterpretation.privacyLocal} {copy.aiInterpretation.privacyExternal}
          Derived exports retain selected analytic-unit and group identifiers, plus conversation identifiers for trajectories; pseudonymize them before sharing when needed.
        </p>
        <div className="ena-source-table-wrap" role="region" aria-label="Filtered source evidence table" tabIndex={0}>
          <table>
            <thead>
              <tr><th>Parsed record</th>{dataset.headers.map((header) => <th key={header}>{header}</th>)}</tr>
            </thead>
            <tbody>
              {visibleSourceRows.map(({ recordNumber, row }) => (
                <tr key={recordNumber}>
                  <th scope="row">{recordNumber}</th>
                  {dataset.headers.map((header) => <td key={header}>{String(row[header] ?? "")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {visibleSourceRows.length === 0 ? <p>No source rows match these filters.</p> : null}
        </div>
        <div className="ena-source-pagination" aria-live="polite">
          <span>Page {safeSourcePage + 1} of {sourcePageCount}</span>
          <div>
            <button type="button" disabled={safeSourcePage === 0} onClick={() => setSourcePage((page) => Math.max(0, page - 1))}>Previous</button>
            <button type="button" disabled={safeSourcePage >= sourcePageCount - 1} onClick={() => setSourcePage((page) => Math.min(sourcePageCount - 1, page + 1))}>Next</button>
          </div>
        </div>
      </details>
    );
  }

  function renderResultTables() {
    if (!resultTables) return null;
    const tableMap = resultTables;
    const rows = tableMap[resultTable] as Row[];
    const headers = tableHeaders(rows);
    const labels = {
      coordinates: "Coordinates",
      lineWeights: "Line weights",
      connectionCounts: "Connection counts",
      trajectories: "Trajectory steps",
      centroids: "Centroids",
      nodePositions: "Node positions",
      adjacencyKey: "Adjacency key",
    } as const;
    const fileLabels = {
      coordinates: "Coordinates CSV",
      lineWeights: "Line weights CSV",
      connectionCounts: "Connection counts CSV",
      trajectories: "Trajectory steps CSV",
      centroids: "Centroids CSV",
      nodePositions: "Nodes CSV",
      adjacencyKey: "Adjacency CSV",
    } as const;

    return (
      <details className="ena-result-data">
        <summary>
          <span>Result data</span>
          <small>Inspect and export jENA model tables</small>
        </summary>
        <div className="ena-result-data-tools">
          <div className="ena-result-tabs" role="tablist" aria-label="Result tables">
            {(Object.keys(labels) as Array<keyof typeof labels>)
              .filter((key) => !(result?.projectionReference && key === "centroids"))
              .map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={resultTable === key}
                onClick={() => setResultTable(key)}
              >
                {labels[key]} <span>{tableMap[key].length}</span>
              </button>
              ))}
          </div>
          <button
            type="button"
            className="ena-action-button ena-action-secondary ena-table-export"
            onClick={() => downloadText(`open-ena-${resultTable}.csv`, rowsToCsv(rows), "text/csv;charset=utf-8")}
          >
            {fileLabels[resultTable]} ↓
          </button>
        </div>
        <div className="ena-result-table-wrap" role="region" aria-label={`${labels[resultTable]} table`} tabIndex={0}>
          <table>
            <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
            <tbody>{rows.slice(0, 100).map((row, rowIndex) => (
              <tr key={rowIndex}>{headers.map((header) => <td key={header}>{String(row[header] ?? "")}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
        <p>{rows.length > 100 ? `Showing 100 of ${rows.length.toLocaleString()} rows. The CSV export contains all rows.` : `Showing all ${rows.length.toLocaleString()} rows.`}</p>
      </details>
    );
  }

  function renderResultData() {
    const rows = dataViewModel.rows;
    const ordered = completedResultKind === "ona";
    const contextOptions = ordered
      ? [
          { value: "comparison" as const, label: copy.ona.dataView.overall },
          ...(result?.groups[0]
            ? [{ value: "primary" as const, label: `${copy.ona.dataView.primary} · ${primaryGroupName || result.groups[0].name}` }]
            : []),
          ...(result?.groups[1]
            ? [{ value: "secondary" as const, label: `${copy.ona.dataView.secondary} · ${secondaryGroupName || result.groups[1].name}` }]
            : []),
        ]
      : undefined;
    return (
      <OpenEnaDataView
        columns={dataViewModel.columns}
        rows={rows}
        context={dataViewContext}
        onContextChange={setDataViewContext}
        onReturnToComparison={() => setCenterSurface("plot")}
        onExportCsv={() => {
          if (ordered && !window.confirm(copy.ona.dataView.exportConfirmation)) return;
          downloadText(
            `open-ena-${ordered ? "ona-local-" : ""}${Date.now()}-data-view.csv`,
            rowsToCsv(rows.map((row) => Object.fromEntries(
              Object.entries(row.values).map(([key, value]) => [key, value ?? null]),
            ) as Row)),
            "text/csv;charset=utf-8",
          );
        }}
        contextOptions={contextOptions}
        notice={ordered ? copy.ona.dataView.localIdentityWarning : undefined}
        copy={ordered ? {
          ariaLabel: copy.ona.dataView.ariaLabel,
          title: copy.ona.dataView.title,
          returnLabel: copy.ona.dataView.returnLabel,
          returnAriaLabel: copy.ona.dataView.returnAriaLabel,
          contextLabel: copy.ona.dataView.contextLabel,
          record: copy.ona.dataView.record,
          records: copy.ona.dataView.records,
          exportLabel: copy.ona.dataView.exportLabel,
          exportAriaLabel: copy.ona.dataView.exportAriaLabel,
          tableAriaLabel: copy.ona.dataView.tableAriaLabel,
          provenanceGroup: copy.ona.dataView.provenanceGroup,
          metadataGroup: copy.ona.dataView.metadataGroup,
          directedEdgeGroup: copy.ona.dataView.directedEdgeGroup,
          yes: copy.ona.dataView.yes,
          no: copy.ona.dataView.no,
        } : undefined}
        exportClassification={ordered ? "local-identity-bearing-view" : "derived"}
        emptyMessage={dataViewModel.error
          ?? (ordered ? copy.ona.dataView.empty : "No derived Data View records are available for this plot context.")}
      />
    );
  }

  const panel = mode === "sets"
    ? renderSetsPanel()
    : mode === "data"
      ? renderDataPanel()
      : mode === "model"
        ? renderModelPanel()
        : mode === "plot"
          ? renderPlotPanel()
          : mode === "stats"
            ? renderStatsPanel()
            : renderAiPanel();
  const persistentPlotTools = (
    <OpenEnaPersistentPlotTools
      analysisKind={completedResultKind ?? "ena"}
      title={completedResultKind === "ona" ? copy.ona.presenter.title : "Plot Tools"}
      edgeScale={edgeScale}
      edgeThreshold={edgeThreshold}
      pointScale={pointScale}
      textScale={textScale}
      showLabels={showLabels}
      showGroupLabels={showGroupLabels}
      showUnitLabels={showUnitLabels}
      showPoints={showPoints}
      unitCircle={unitCircle}
      flipX={flipX}
      flipY={flipY}
      plotZoom={plotZoom}
      onEdgeScaleChange={setEdgeScale}
      onEdgeThresholdChange={setEdgeThreshold}
      onPointScaleChange={setPointScale}
      onTextScaleChange={setTextScale}
      onShowLabelsChange={setShowLabels}
      onShowGroupLabelsChange={setShowGroupLabels}
      onShowUnitLabelsChange={setShowUnitLabels}
      onShowPointsChange={updatePointVisibility}
      onUnitCircleChange={setUnitCircle}
      onFlipXChange={setFlipX}
      onFlipYChange={setFlipY}
      onPlotZoomChange={setPlotZoom}
      onReset={resetPlot}
      settingsOpen={plotSettingsOpen}
      onSettingsOpenChange={setPlotSettingsOpen}
      disabled={!result || loading}
    />
  );

  return (
    <div
      className="open-ena-page"
      lang={workspaceIsLocalized ? undefined : "en"}
      dir={workspaceIsLocalized ? undefined : "ltr"}
    >
      <section className="open-ena-workbench" aria-label="Open ENA analysis workspace" aria-busy={loading || sourceBusy || referenceBusy}>
        <div className="ena-workbench-grid">
          <nav className="ena-tool-rail" aria-label="Analysis modes" data-ena-workbench-region="rail">
            <div className="ena-rail-brand" data-ena-rail-brand="true" aria-label="ENA.HK Open ENA">
              <span className="ena-mini-mark" aria-hidden="true"><img src="/ena-mark.svg" alt="" /></span>
              <span className="ena-rail-product">OPEN ENA</span>
              <span
                className="ena-rail-version"
                data-ena-rail-version="true"
                title={`ENA computation powered by jENA v${JENA_RUNTIME_VERSION} (GPL-3.0-only)`}
              >jENA {JENA_RUNTIME_VERSION}</span>
            </div>
            <div className="ena-rail-modes">
              {(Object.keys(copy.modes) as OpenEnaMode[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  className="ena-rail-button"
                  aria-current={mode === item ? "step" : undefined}
                  aria-label={item === "ai" ? copy.aiInterpretation.title : copy.modes[item]}
                  title={onaCapabilityDisabled && (item === "sets" || item === "ai")
                    ? item === "sets" ? copy.ona.unavailable.sets : copy.ona.unavailable.ai
                    : item === "ai" ? copy.aiInterpretation.title : copy.modes[item]}
                  disabled={onaCapabilityDisabled && (item === "sets" || item === "ai")}
                  onClick={() => setMode(item)}
                >
                  {modeIcons[item]}
                  <span>{copy.modes[item]}</span>
                </button>
              ))}
            </div>
            <form className="ena-rail-logout" action="/api/open-ena/logout" method="post">
              <input type="hidden" name="locale" value={locale} />
              <button type="submit" aria-label={authCopy.signOut} title={authCopy.signOut}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M10 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H10" />
                  <path d="M14 8l4 4-4 4M9 12h9" />
                </svg>
                <span>{authCopy.signOut}</span>
              </button>
            </form>
            <div className="ena-rail-meta">
              <div
                className="ena-run-status"
                data-state={loading || sourceBusy || referenceBusy ? "running" : result ? "result" : "ready"}
                role="status"
                aria-live="polite"
                aria-atomic="true"
                title={result
                  ? `${result.set.codes.length} ${copy.workspace.codes.toLowerCase()} · ${result.groups.length} ${copy.workspace.groups.toLowerCase()} · ${resultUnitCount} ${copy.workspace.units.toLowerCase()}`
                  : dataset
                    ? `${dataset.rows.length.toLocaleString()} rows · ${dataset.headers.length.toLocaleString()} fields`
                    : "No model loaded"}
              >
                <span aria-hidden="true" />
                <span className="ena-rail-status-label">{sourceBusy
                  ? "Preparing"
                  : referenceBusy
                    ? "Reference"
                  : loading
                    ? `${progress}%`
                  : resultIsStale
                    ? "Rebuild"
                    : result
                      ? copy.workspace.result
                      : copy.workspace.ready}</span>
              </div>
              <span className="ena-rail-privacy" title="Source data stays in this browser workspace unless intentionally exported.">Local</span>
              <span className="sr-only">
                ENA computation powered by jENA v{JENA_RUNTIME_VERSION} (GPL-3.0-only); ENA.HK provides the interface, plotting, and exports. Source data stays in this workspace’s browser memory unless you intentionally export it.
              </span>
            </div>
          </nav>

          <aside className="ena-control-panel" data-ena-workbench-region="controls">
            {panel}
          </aside>

          <div className="ena-visual-workspace"
            data-ena-view={view}
            data-testid="open-ena-center-surface"
          >
            <div className={`ena-visual-toolbar${view === "2d" && activeGroupContrast ? " ena-visual-toolbar-group-contrast" : ""}`}>
              <div>
                <p>{completedResultKind === "ona"
                  ? copy.ona.layout.overallPlot
                  : view === "3d" && result
                  ? activeGroupContrast
                    ? `${copy.workspace.comparison} · ${copy.views.threeD}`
                    : copy.views.threeD
                  : activeSetComparison
                  ? copy.workspace.comparison
                  : activeGroupContrast
                    ? copy.workspace.comparison
                    : activeLongitudinalView
                      ? copy.longitudinal.title
                      : copy.workspace.comparison}</p>
                <span>{completedResultKind === "ona"
                  ? `${resultUnitCount} ${copy.workspace.units.toLowerCase()} · ${result?.set.codes.length ?? 0} ${copy.workspace.codes.toLowerCase()} · p² directed space`
                  : view === "3d" && result
                  ? activeGroupContrast
                    ? `${activeGroupContrast.primary.name} − ${activeGroupContrast.secondary.name} · ${xDimension} × ${yDimension} × ${zDimension} · linked camera`
                    : `${xDimension} × ${yDimension} × ${zDimension} · ${copy.plot.sameFittedSpace}`
                  : activeSetComparison
                  ? `${activeSetComparison.primary.name} − ${activeSetComparison.secondary.name} · shared ${activeSetComparison.axes[0]} × ${activeSetComparison.axes[1]}`
                  : activeGroupContrast
                    ? `${activeGroupContrast.groupOrder[0]} − ${activeGroupContrast.groupOrder[1]} · fixed ${officialPlotAxisLabel(activeGroupContrast.axes[0])} × ${officialPlotAxisLabel(activeGroupContrast.axes[1])}`
                  : activeLongitudinalView
                    ? `${activeLongitudinalView.cohortPolicy === "complete" ? copy.longitudinal.complete : copy.longitudinal.available} · ${activeLongitudinalView.axes[0]} × ${activeLongitudinalView.axes[1]} · ${activeLongitudinalView.timeOrder.length} ${copy.longitudinal.period.toLowerCase()}`
                  : result
                  ? `${resultUnitCount} ${copy.workspace.units.toLowerCase()}${result.set.modelType === "EndPoint" ? "" : ` · ${result.set.points.length} ${copy.workspace.trajectorySteps.toLowerCase()}`} · ${result.set.codes.length} ${copy.workspace.codes.toLowerCase()}`
                  : "SVD research space"}</span>
              </div>
              <div className="ena-visual-toolbar-actions">
                <button
                  type="button"
                  className="ena-compact-toolbar-button"
                  data-testid="open-ena-data-view-toggle"
                  aria-pressed={centerSurface === "data"}
                  disabled={view === "3d" || (!activeGroupContrast && completedResultKind !== "ona")}
                  onClick={() => {
                    setDataViewContext("comparison");
                    setCenterSurface((current) => current === "data" ? "plot" : "data");
                  }}
                >
                  <span aria-hidden="true">▦</span>{centerSurface === "data"
                    ? completedResultKind === "ona" ? copy.ona.layout.overallPlot : "Comparison Plot"
                    : completedResultKind === "ona" ? copy.ona.dataView.title : "Data View"}
                </button>
                <div className="ena-analysis-toolbar-cluster">
                  <div className="ena-view-toggle" role="group" aria-label="ENA visualization options">
                    <button type="button" aria-pressed={view === "2d"} onClick={() => selectVisualizationView("2d")}>
                      <strong>{completedResultKind === "ona" ? "2D ONA" : copy.views.twoD}</strong>
                    </button>
                    <button
                      type="button"
                      aria-pressed={view === "3d"}
                      onClick={() => selectVisualizationView("3d")}
                      disabled={completedResultKind === "ona"}
                      title={completedResultKind === "ona" ? copy.ona.unavailable.threeD : undefined}
                      aria-label={completedResultKind === "ona"
                        ? copy.ona.unavailable.threeD
                        : `${copy.views.threeD}. ${copy.plot.threeDInteractionHint}`}
                    >
                      <strong>{copy.views.threeD}</strong>
                    </button>
                  </div>
                  <button
                    type="button"
                    className="ena-compact-toolbar-button ena-download-model-button"
                    disabled={!dataset || !result || !resultConfig}
                    onClick={() => {
                      if (dataset && result && resultConfig) {
                        if (completedResultKind === "ona"
                          && !window.confirm(copy.ona.exports.bundleConfirmation)) return;
                        downloadJson(
                          `open-ena-${Date.now()}-results.json`,
                          buildAnalysisBundle(dataset, resultConfig, result, datasetHash, {
                            codeColors,
                            methodsDimensions: [xDimension, yDimension],
                            methodsFlipX: flipX,
                            methodsFlipY: flipY,
                            edgeThreshold,
                            showNetworks,
                            showPoints,
                            showTrajectories,
                            showLabels,
                            showGroupLabels,
                            showUnitLabels,
                            showVariance,
                            edgeScale,
                            pointScale,
                            plotZoom,
                            selectedGroupOrder: groupContrast?.groupOrder,
                            groupContrast,
                            inference: currentInference,
                            inferenceContext: inferenceProducerContext ?? undefined,
                          }),
                          true,
                        );
                      }
                    }}
                  >
                    <svg className="ena-download-model-button-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M14 3H7.5A1.5 1.5 0 0 0 6 4.5v15A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V7l-4-4Z" />
                      <path d="M14 3v4h4M12 10v7m-3-3 3 3 3-3" />
                    </svg>
                    {completedResultKind === "ona" ? "Download ONA bundle" : "Download Model"}
                  </button>
                </div>
              </div>
            </div>

            {view === "3d" && result ? (
              <section
                className="ena-three-d-display-controls"
                data-testid="open-ena-3d-display-controls"
                aria-label={`${copy.views.threeD} ${copy.plot.title}`}
              >
                {activeGroupContrast ? (
                  <p className="ena-three-d-linked-note" data-testid="open-ena-3d-linked-view-note">
                    Linked 3D view — axes and camera apply to all three plots.
                  </p>
                ) : null}
                <div
                  className="ena-three-d-camera-position"
                  role="radiogroup"
                  aria-labelledby="open-ena-3d-camera-position-label"
                  data-testid="open-ena-3d-camera-position"
                >
                  <span id="open-ena-3d-camera-position-label" className="ena-three-d-control-label">
                    {copy.plot.cameraPosition}:
                  </span>
                  <div className="ena-three-d-camera-options">
                    {cameraPositionOptions.map(([value, label]) => (
                      <label key={value}>
                        <input
                          type="radio"
                          name="ena-camera-position"
                          value={value}
                          checked={camera === value}
                          onChange={() => selectCameraPreset(value)}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div
                  className="ena-three-d-axis-controls"
                  role="group"
                  aria-label={`${copy.plot.axisX}, ${copy.plot.axisY}, ${copy.plot.axisZ}`}
                >
                  {([
                    [copy.plot.axisX, xDimension, "x"],
                    [copy.plot.axisY, yDimension, "y"],
                    [copy.plot.axisZ, zDimension, "z"],
                  ] as Array<[string, string, "x" | "y" | "z"]>).map(([label, value, axis]) => (
                    <label key={axis} className="ena-three-d-axis-field">
                      <span>{label}</span>
                      <select
                        value={value}
                        onChange={(event) => selectAxisDimension(axis, event.target.value)}
                        data-testid={`open-ena-3d-axis-${axis}`}
                      >
                        {result.dimensions.map((dimension) => (
                          <option
                            key={dimension}
                            value={dimension}
                          >
                            {dimension}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </section>
            ) : null}

            {completedResultKind === "ona" && result && resultConfig ? (
              <>
              {resultIsStale ? (
                <div className="ena-stale-banner" role="status">
                  <strong>Configuration changed</strong>
                  <span>The directed ONA view remains bound to the last successful ordered model. Rebuild to apply the pending controls.</span>
                </div>
              ) : null}
              {loading ? (
                <div className="ena-inline-progress" role="status" aria-live="polite">
                  <span>Rebuilding ordered network with jENA · {progress}% · {progressStage}</span>
                  <button type="button" onClick={() => abortRef.current?.abort()}>Cancel</button>
                </div>
              ) : null}
              <OpenEnaOrderedResultLayout
                result={result}
                config={resultConfig}
                primaryGroupName={primaryGroupName || null}
                secondaryGroupName={secondaryGroupName || null}
                centerMode={centerSurface}
                dataView={centerSurface === "data" ? (
                  <div data-testid="open-ena-center-data-view">
                    {renderResultData()}
                  </div>
                ) : null}
                rightTools={persistentPlotTools}
                xDimension={xDimension}
                yDimension={yDimension}
                edgeThreshold={edgeThreshold}
                edgeScale={edgeScale}
                pointScale={pointScale}
                textScale={textScale}
                plotZoom={plotZoom}
                flipX={flipX}
                flipY={flipY}
                showPoints={showPoints}
                showNetworks={showNetworks}
                showLabels={showLabels}
                showUnitLabels={showUnitLabels}
                showVariance={showVariance}
                codeColors={codeColors}
                nodeTotals={result.orderedResponseNodeSummary}
                copy={copy.ona.layout}
                plotCopy={copy.ona.plot}
                svgRef={plotSvgRef}
              />
              </>
            ) : activeSetComparison && view === "2d" ? (
              <OpenEnaSetComparison
                codeColors={codeColors}
                comparison={activeSetComparison}
                edgeThreshold={edgeThreshold}
                showPoints={showPoints}
                showNetworks={showNetworks}
                showLabels={showLabels}
                showUnitLabels={showUnitLabels}
                edgeScale={edgeScale}
                pointScale={pointScale}
                plotZoom={plotZoom}
                flipX={flipX}
                flipY={flipY}
                svgRef={plotSvgRef}
              />
            ) : loading && !result ? (
              <div className="ena-loading-surface" aria-live="polite">
                <div className="ena-loading-network" aria-hidden="true"><i /><i /><i /><i /><span /><span /><span /></div>
                <h2>{copy.workspace.running}</h2>
                <div
                  className="ena-progress-track"
                  role="progressbar"
                  aria-label="jENA model progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress}
                >
                  <span style={{ width: `${progress}%` }} />
                </div>
                <p>{progressStage === "accumulate" ? "Accumulating coded co-occurrences" : "Normalizing, rotating, and projecting the ENA model"}</p>
                <button type="button" className="ena-action-button ena-action-secondary" onClick={() => abortRef.current?.abort()}>Cancel run</button>
              </div>
            ) : result ? (
              <>
                {resultIsStale ? (
                  <div className="ena-stale-banner" role="status">
                    <strong>Configuration changed</strong>
                    <span>The plot and evidence below remain from the last successful model. Rebuild to apply the pending controls.</span>
                  </div>
                ) : null}
                {loading ? (
                  <div className="ena-inline-progress" role="status" aria-live="polite">
                    <span>Rebuilding with jENA · {progress}% · {progressStage}</span>
                    <button type="button" onClick={() => abortRef.current?.abort()}>Cancel</button>
                  </div>
                ) : null}
                {result.projectionReference ? (
                  <div className="ena-projection-badge" role="status">
                    <strong>Projected into reference</strong>
                    <span>{result.projectionReference.name}</span>
                  </div>
                ) : null}
                {view === "2d" && activeLongitudinalView ? (
                  <OpenEnaLongitudinalTrajectory
                    codeColors={codeColors}
                    trajectory={activeLongitudinalView}
                    showIndividualPaths={showTrajectories}
                    showGroupCentroidPaths={showGroupCentroidPaths}
                    showPoints={showPoints}
                    showLabels={showLabels}
                    showVariance={showVariance}
                    pointScale={pointScale}
                    plotZoom={plotZoom}
                    flipX={flipX}
                    flipY={flipY}
                    copy={copy.longitudinal}
                    svgRef={plotSvgRef}
                  />
                ) : view === "2d" && activeGroupContrast ? (
                  <OpenEnaGroupContrast
                    codeColors={codeColors}
                    contrast={activeGroupContrast}
                    edgeThreshold={edgeThreshold}
                    showPoints={showPoints}
                    showNetworks={showNetworks}
                    showLabels={showLabels}
                    showGroupLabels={showGroupLabels}
                    showUnitLabels={showUnitLabels}
                    unitCircle={unitCircle}
                    showVariance={showVariance}
                    edgeScale={edgeScale}
                    pointScale={pointScale}
                    textScale={textScale}
                    plotZoom={plotZoom}
                    plotResetRevision={plotResetRevision}
                    flipX={flipX}
                    flipY={flipY}
                    centerMode={centerSurface}
                    dataView={centerSurface === "data" ? (
                      <div data-testid="open-ena-center-data-view">
                        {renderResultData()}
                      </div>
                    ) : null}
                    rightTools={persistentPlotTools}
                    svgRef={plotSvgRef}
                    onSwitchPlots={() => {
                      setPrimaryGroupName(secondaryGroupName);
                      setSecondaryGroupName(primaryGroupName);
                    }}
                  />
                ) : view === "3d" && activeGroupContrast && resultConfig?.groupColumn ? (
                  <OpenEna3DGroupContrast
                    codeColors={codeColors}
                    result={result}
                    contrast={activeGroupContrast}
                    groupColumn={resultConfig.groupColumn}
                    xDimension={xDimension}
                    yDimension={yDimension}
                    zDimension={zDimension}
                    camera={camera}
                    showPoints={showPoints}
                    showNetworks={showNetworks}
                    showLabels={showLabels}
                    showUnitLabels={showUnitLabels}
                    showVariance={showVariance}
                    edgeScale={edgeScale}
                    edgeThreshold={edgeThreshold}
                    pointScale={pointScale}
                    plotZoom={plotZoom}
                    plotResetRevision={plotResetRevision}
                    sharedCamera={interactive3dCamera}
                    onCameraChange={setInteractive3dCamera}
                    sharedAspectRatio={interactive3dAspectRatio}
                    onAspectRatioChange={setInteractive3dAspectRatio}
                    flipX={flipX}
                    flipY={flipY}
                    copy={copy}
                  />
                ) : view === "3d" ? (
                  <OpenEnaInteractive3DPlot
                    codeColors={codeColors}
                    result={result}
                    groupColumn={resultConfig?.groupColumn ?? null}
                    xDimension={xDimension}
                    yDimension={yDimension}
                    zDimension={zDimension}
                    camera={camera}
                    showPoints={showPoints}
                    showNetworks={showNetworks}
                    showLabels={showLabels}
                    showUnitLabels={showUnitLabels}
                    showVariance={showVariance}
                    showTrajectories={showTrajectories}
                    edgeScale={edgeScale}
                    edgeThreshold={edgeThreshold}
                    pointScale={pointScale}
                    plotZoom={plotZoom}
                    plotResetRevision={plotResetRevision}
                    initialCamera={interactive3dCamera}
                    onCameraChange={setInteractive3dCamera}
                    initialAspectRatio={interactive3dAspectRatio}
                    onAspectRatioChange={setInteractive3dAspectRatio}
                    flipX={flipX}
                    flipY={flipY}
                    copy={copy}
                  />
                ) : (
                  <OpenEnaPlot
                    codeColors={codeColors}
                    result={result}
                    groupColumn={resultConfig?.groupColumn ?? null}
                    view={view}
                    xDimension={xDimension}
                    yDimension={yDimension}
                    zDimension={zDimension}
                    camera={camera}
                    showPoints={showPoints}
                    showNetworks={showNetworks}
                    showLabels={showLabels}
                    showUnitLabels={showUnitLabels}
                    showVariance={showVariance}
                    showTrajectories={showTrajectories}
                    edgeScale={edgeScale}
                    edgeThreshold={edgeThreshold}
                    pointScale={pointScale}
                    plotZoom={plotZoom}
                    flipX={flipX}
                    flipY={flipY}
                    copy={copy}
                    svgRef={plotSvgRef}
                  />
                )}
                {completedResultKind !== "ona" && view === "2d" && showNetworks && !activeGroupContrast && !activeLongitudinalView ? (
                  <section className="ena-group-networks" aria-labelledby="ena-group-networks-title">
                    <div className="ena-subpanel-title"><h2 id="ena-group-networks-title">{copy.workspace.groupNetworks}</h2><span>Shared {xDimension} × {yDimension} space</span></div>
                    <div className="ena-group-network-grid">
                      {result.groups.map((group, index) => (
                        <article key={group.name}>
                          <div className="ena-group-network-heading">
                            <span>
                              <i className={index % 2 === 1 ? "ena-group-square" : "ena-group-circle"} style={{ background: group.color }} />
                              {group.name}
                            </span>
                            <strong>
                              n = {group.count}{group.pointCount !== group.count ? ` · ${group.pointCount} ${copy.workspace.trajectorySteps.toLowerCase()}` : ""}
                            </strong>
                          </div>
                          <MiniNetwork
                            codeColors={codeColors}
                            result={result}
                            group={group}
                            xDimension={xDimension}
                            yDimension={yDimension}
                            label={`${group.name} mean ENA network`}
                            maxNetworkWeight={maxNetworkWeight}
                            edgeThreshold={edgeThreshold}
                          />
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}
              </>
            ) : (
              <section className="ena-empty-workbench" data-testid="open-ena-empty-workbench" aria-label="Open ENA model setup workbench">
                <div className="ena-empty-analysis-layout">
                  <figure
                    className="ena-empty-comparison-plot"
                    data-testid="open-ena-empty-comparison-plot"
                    data-ena-workbench-region="center"
                  >
                    <header className="ena-set-plot-heading">
                      <div><h3>COMPARISON PLOT</h3><p>Model setup required</p></div>
                      <span>2D research space</span>
                    </header>
                    <div className="ena-empty-surface">
                      <svg
                        className="ena-empty-network"
                        data-testid="open-ena-empty-network"
                        viewBox="0 0 200 135"
                        role="img"
                        aria-label="Connected four-node epistemic network"
                      >
                        <line x1="99" y1="17" x2="28" y2="66" />
                        <line x1="99" y1="17" x2="174" y2="64" />
                        <line x1="28" y1="66" x2="174" y2="64" />
                        <line x1="28" y1="66" x2="102" y2="119" />
                        <line x1="174" y1="64" x2="102" y2="119" />
                        <circle cx="99" cy="17" r="10" />
                        <circle cx="28" cy="66" r="10" />
                        <circle cx="174" cy="64" r="10" />
                        <circle cx="102" cy="119" r="10" />
                      </svg>
                      <div className="ena-empty-guidance">
                        <p className="ena-panel-kicker">MODEL → VIEW → PRESENTER</p>
                        <h2>{copy.workspace.emptyTitle}</h2>
                        <p>{copy.workspace.emptyText}</p>
                        <ol>
                          <li data-done={dataset ? "true" : "false"}>
                            <span className="sr-only">{dataset ? "Complete: " : "Not complete: "}</span>
                            Open or load coded rows
                          </li>
                          <li data-done={dataset && configErrors.length === 0 ? "true" : "false"}>
                            <span className="sr-only">{dataset && configErrors.length === 0 ? "Complete: " : "Not complete: "}</span>
                            Define units, conversations, and at least 3 codes; comparison group optional
                          </li>
                          <li data-done="false"><span className="sr-only">Not complete: </span>Build the model with jENA</li>
                        </ol>
                        <button type="button" className="ena-action-button ena-action-primary" onClick={() => void loadSample()} disabled={sourceBusy || referenceBusy || loading}>{copy.data.sample}</button>
                      </div>
                    </div>
                  </figure>

                  <div className="ena-empty-side-column" data-ena-workbench-region="right-stack">
                    <figure data-testid="open-ena-empty-primary-plot">
                      <header className="ena-set-plot-heading"><div><h3>PRIMARY PLOT</h3><p>Awaiting group selection</p></div><span>—</span></header>
                      <div className="ena-empty-plot-placeholder"><span>Primary network appears after a model is built.</span></div>
                    </figure>
                    <figure data-testid="open-ena-empty-secondary-plot">
                      <header className="ena-set-plot-heading"><div><h3>SECONDARY PLOT</h3><p>Awaiting group selection</p></div><span>—</span></header>
                      <div className="ena-empty-plot-placeholder"><span>Secondary network appears after a model is built.</span></div>
                    </figure>
                    <div className="ena-empty-plot-tools" data-testid="open-ena-empty-plot-tools">
                      {persistentPlotTools}
                    </div>
                  </div>
                </div>
                <div className="ena-empty-data-view" data-testid="open-ena-empty-data-view">
                  <strong>Data View</strong><span>{dataset ? `${dataset.rows.length.toLocaleString()} coded rows ready for review` : "Open a CSV or XLSX file, or load the teaching sample, to inspect coded rows."}</span><span aria-hidden="true">⌃</span>
                </div>
              </section>
            )}
            {error ? <div className="ena-error-banner" role="alert"><strong>{copy.workspace.errorTitle}</strong><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Dismiss error">×</button></div> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
