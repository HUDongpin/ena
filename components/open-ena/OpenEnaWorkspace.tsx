"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ModelType, Row, WindowType } from "jena-js";
import type { Locale } from "@/lib/i18n";
import { getOpenEnaAuthCopy } from "@/lib/open-ena-auth-copy";
import { getOpenEnaCopy, isOpenEnaLocalizedLocale } from "@/lib/open-ena-i18n";
import { siteConfig } from "@/lib/site";
import { buildManifest, dimensionEffect } from "@/lib/open-ena/analyze";
import { analyzeDatasetInWorker } from "@/lib/open-ena/client";
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
import { buildEndpointMannWhitney } from "@/lib/open-ena/inference";
import {
  buildLongitudinalGroupCentroidExport,
  buildLongitudinalGroupCentroidView,
  longitudinalPeriodRowsToCsv,
  type OpenEnaLongitudinalCohortPolicy,
} from "@/lib/open-ena/longitudinal";
import { buildMethodsReport, referenceMeanRotationInterpretation } from "@/lib/open-ena/methods";
import { buildOpenEnaAiInterpretationRequest } from "@/lib/open-ena/ai-interpretation";
import { buildAnalysisBundle, buildResultTables, rowsToCsv } from "@/lib/open-ena/export";
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
  sameOpenEnaConfig,
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
import OpenEnaDataView, {
  type OpenEnaDataViewColumn,
  type OpenEnaDataViewContext,
  type OpenEnaDataViewRow,
} from "./OpenEnaDataView";
import OpenEnaGroupContrast from "./OpenEnaGroupContrast";
import OpenEnaLongitudinalTrajectory from "./OpenEnaLongitudinalTrajectory";
import OpenEnaPersistentPlotTools from "./OpenEnaPersistentPlotTools";
import OpenEnaSetComparison from "./OpenEnaSetComparison";
import OpenEnaAiInterpretation from "./OpenEnaAiInterpretation";

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

function formatStatistic(value: number | undefined, digits = 3) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "Not estimable";
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

export default function OpenEnaWorkspace({ locale }: OpenEnaWorkspaceProps) {
  const copy = getOpenEnaCopy(locale);
  const authCopy = getOpenEnaAuthCopy(locale);
  const workspaceIsLocalized = isOpenEnaLocalizedLocale(locale);
  const [mode, setMode] = useState<OpenEnaMode>("sets");
  const [modelTab, setModelTab] = useState<OpenEnaModelPanelTab>("units");
  const [statsTab, setStatsTab] = useState<OpenEnaStatsTab>("comparison");
  const [centerSurface, setCenterSurface] = useState<OpenEnaCenterSurface>("plot");
  const [view, setView] = useState<OpenEnaView>("2d");
  const [dataset, setDataset] = useState<ParsedDataset | null>(null);
  const [config, setConfig] = useState<OpenEnaConfig>(SAMPLE_CONFIG);
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
  const [showPoints, setShowPoints] = useState(true);
  const [showNetworks, setShowNetworks] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showGroupLabels, setShowGroupLabels] = useState(true);
  const [showUnitLabels, setShowUnitLabels] = useState(false);
  const [unitCircle, setUnitCircle] = useState(false);
  const [showVariance, setShowVariance] = useState(true);
  const [showTrajectories, setShowTrajectories] = useState(true);
  const [showGroupCentroidPaths, setShowGroupCentroidPaths] = useState(true);
  const [repeatedEntityColumn, setRepeatedEntityColumn] = useState("");
  const [timeColumn, setTimeColumn] = useState("");
  const [longitudinalTimeOrder, setLongitudinalTimeOrder] = useState<string[]>([]);
  const [cohortPolicy, setCohortPolicy] = useState<OpenEnaLongitudinalCohortPolicy>("available");
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const plotSvgRef = useRef<SVGSVGElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sourceAbortRef = useRef<AbortController | null>(null);
  const referenceImportRef = useRef<object | null>(null);
  const datasetGenerationRef = useRef(0);
  const groupSelectionColumnRef = useRef<string | null>(null);

  useEffect(() => () => {
    abortRef.current?.abort();
    sourceAbortRef.current?.abort();
    referenceImportRef.current = null;
  }, []);

  const configErrors = useMemo(
    () => dataset ? validateWorkspaceConfig(dataset, config, rotationReference) : [],
    [dataset, config, rotationReference],
  );
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
    ? `${result.analyzedAt}\u001f${resultConfig.unitColumns.join("\u001e")}\u001f${resultConfig.conversationColumns.join("\u001e")}`
    : "";
  useEffect(() => {
    if (!result || !resultConfig || result.set.modelType === "EndPoint") {
      if (repeatedEntityColumn) setRepeatedEntityColumn("");
      if (timeColumn) setTimeColumn("");
      return;
    }
    const nextEntity = resultConfig.unitColumns.includes(repeatedEntityColumn)
      ? repeatedEntityColumn
      : resultConfig.unitColumns[0] ?? "";
    const nextTime = resultConfig.conversationColumns.includes(timeColumn)
      ? timeColumn
      : resultConfig.conversationColumns[0] ?? "";
    if (nextEntity !== repeatedEntityColumn) setRepeatedEntityColumn(nextEntity);
    if (nextTime !== timeColumn) setTimeColumn(nextTime);
  }, [repeatedEntityColumn, result, resultConfig, timeColumn, trajectoryMappingKey]);

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
    repeatedEntityColumn?: string;
    timeColumn?: string;
    cohortPolicy?: OpenEnaLongitudinalCohortPolicy;
  }) {
    if (update.repeatedEntityColumn !== undefined) setRepeatedEntityColumn(update.repeatedEntityColumn);
    if (update.timeColumn !== undefined) setTimeColumn(update.timeColumn);
    if (update.cohortPolicy !== undefined) setCohortPolicy(update.cohortPolicy);
  }

  const longitudinalViewState = useMemo(() => {
    if (!result || !resultConfig || !dataset) return { view: null, error: copy.longitudinal.unavailableModel };
    if (result.set.modelType === "EndPoint") return { view: null, error: copy.longitudinal.unavailableModel };
    if (!repeatedEntityColumn) return { view: null, error: copy.longitudinal.unavailableEntity };
    if (!timeColumn) return { view: null, error: copy.longitudinal.unavailableTime };
    if (longitudinalTimeOrder.length < 2) return { view: null, error: copy.longitudinal.unavailablePeriods };
    try {
      return {
        view: buildLongitudinalGroupCentroidView(
          result,
          resultConfig,
          dataset,
          {
            repeatedEntityColumn,
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
      return { view: null, error: caught instanceof Error ? caught.message : String(caught) };
    }
  }, [
    cohortPolicy,
    copy.longitudinal,
    dataset,
    datasetHash,
    longitudinalTimeOrder,
    repeatedEntityColumn,
    result,
    resultConfig,
    timeColumn,
    xDimension,
    yDimension,
  ]);
  const longitudinalView = longitudinalViewState.view;

  const groupContrastAxes = useMemo(
    (): [string, string] => [xDimension, yDimension],
    [xDimension, yDimension],
  );
  const contrastUnavailable = useMemo(() => {
    if (!result || !resultConfig) return "Build an endpoint model to compare groups.";
    if (result.set.modelType !== "EndPoint") return copy.contrast.endpointOnly;
    if (!resultConfig.groupColumn) return copy.contrast.requiresGroup;
    if (result.groups.length < 2) return copy.contrast.requiresTwoGroups;
    return null;
  }, [copy.contrast, result, resultConfig]);
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
  const mannWhitney = useMemo(
    () => result
      ? buildEndpointMannWhitney(
          result,
          resultConfig?.groupColumn ?? null,
          groupContrastAxes,
          groupContrast?.groupOrder,
        )
      : null,
    [groupContrast, groupContrastAxes, result, resultConfig],
  );
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
        })
      : null,
    [
      dataset,
      datasetHash,
      edgeScale,
      edgeThreshold,
      flipX,
      flipY,
      groupContrast,
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
  const displayedComparisonSurface = activeComparisonSurface === "sets" && setComparison
    ? "sets"
    : groupContrast
      ? "groups"
      : result
        ? "model"
      : setComparison
        ? "sets"
        : "model";
  const activeSetComparison = displayedComparisonSurface === "sets" ? setComparison : null;
  const activeGroupContrast = displayedComparisonSurface === "groups" ? groupContrast : null;
  const dataViewModel = useMemo(() => {
    const empty = { columns: [] as OpenEnaDataViewColumn[], rows: [] as OpenEnaDataViewRow[] };
    if (!dataset || !result || !resultConfig) return empty;

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
    return { columns, rows };
  }, [activeGroupContrast, dataViewContext, dataset, result, resultConfig]);
  const activeLongitudinalView = !activeSetComparison
    && !activeGroupContrast
    && result?.set.modelType !== "EndPoint"
    ? longitudinalView
    : null;
  const aiInterpretationRequest = useMemo(() => {
    if (!result || !resultConfig || resultIsStale) return null;
    try {
      return buildOpenEnaAiInterpretationRequest({
        locale,
        result,
        config: resultConfig,
        datasetHash,
        groupContrast: result.set.modelType === "EndPoint" ? groupContrast : null,
        longitudinalView: result.set.modelType === "EndPoint" ? null : longitudinalView,
      });
    } catch {
      return null;
    }
  }, [datasetHash, groupContrast, locale, longitudinalView, result, resultConfig, resultIsStale]);
  const currentProjectedResult = Boolean(
    result
    && resultConfig
    && !resultIsStale
    && result.set.modelType === "EndPoint"
    && result.projectionReference
    && rotationReference
    && result.projectionReference.referenceId === rotationReference.referenceId,
  );

  function updateConfig(update: (current: OpenEnaConfig) => OpenEnaConfig) {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setConfig(update);
    setView("2d");
  }

  function captureCurrentAnalysisSet() {
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
        reference: nextConfig.rotation === "reference" ? rotationReference : null,
        onProgress: ({ progress: nextProgress, stage }) => {
          setProgress(Math.round(nextProgress * 100));
          setProgressStage(stage);
        },
      });
      if (controller.signal.aborted || datasetGenerationRef.current !== analysisGeneration) return;
      setResult({
        ...nextResult,
        provenanceBinding: {
          datasetNormalizedUtf8TextSha256: nextDatasetHash ?? "",
          datasetHashKind: nextDataset.hashKind,
          configuration: {
            ...nextConfig,
            unitColumns: [...nextConfig.unitColumns],
            conversationColumns: [...nextConfig.conversationColumns],
            codes: [...nextConfig.codes],
          },
        },
      });
      setResultConfig({
        ...nextConfig,
        unitColumns: [...nextConfig.unitColumns],
        conversationColumns: [...nextConfig.conversationColumns],
        codes: [...nextConfig.codes],
      });
      const [x = "SVD1", y = "SVD2", z = y] = nextResult.dimensions;
      setXDimension(x);
      setYDimension(y);
      setZDimension(z);
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
      setConfig(SAMPLE_CONFIG);
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
      setConfig(inferConfig(nextDataset));
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
      setConfig((current) => {
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

  function resetPlot() {
    const activeDimensions = displayedComparisonSurface === "sets"
      ? primarySet?.geometry.dimensions ?? result?.dimensions
      : result?.dimensions ?? primarySet?.geometry.dimensions;
    if (activeDimensions) {
      const [x = "SVD1", y = "SVD2", z = y] = activeDimensions;
      setXDimension(x);
      setYDimension(y);
      setZDimension(z);
    }
    setCamera("isometric");
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
    if (!showUnitLabels) {
      clone.querySelectorAll<SVGGElement>("[data-ena-unit-point='true']").forEach((unitPoint, index) => {
        unitPoint.setAttribute("aria-label", `Analytic unit point ${index + 1}; identifier omitted from this SVG export.`);
        unitPoint.querySelectorAll("title").forEach((title) => {
          title.textContent = `Analytic unit point ${index + 1}; identifier omitted from this SVG export.`;
        });
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
      .ena-zero-axes text, .ena-three-axes text { fill: #5c6c72; font-size: 12px; font-weight: 690; }
      .ena-result-node { fill: #fff; stroke: #283d48; stroke-width: 5; }
      .ena-result-label, .ena-mean-label { fill: #263740; paint-order: stroke; stroke: #fff; stroke-linejoin: round; stroke-width: 5px; font-size: 13px; font-weight: 700; }
      .ena-mean-label { font-size: 12px; }
      .ena-set-plot-background { fill: #fff; }
      .ena-set-zero-axes line { stroke: #8b999f; stroke-width: 1.2; stroke-dasharray: 4 5; }
      .ena-set-axis-endpoint { fill: #333; }
      .ena-set-zero-axes text { fill: #5c6c72; font-size: 12px; font-weight: 690; }
      .ena-set-result-node { fill: #fff; stroke: #283d48; stroke-width: 4; }
      .ena-set-result-label, .ena-set-group-label, .ena-set-unit-label { fill: #263740; paint-order: stroke; stroke: #fff; stroke-linejoin: round; stroke-width: 4px; font-size: 12px; font-weight: 700; }
      .ena-set-unit-label { font-size: 10px; }
      .ena-longitudinal-background { fill: #fbfcfc; }
      .ena-longitudinal-axis { stroke: #c1cdcb; stroke-width: 1.15; stroke-dasharray: 3 5; }
      .ena-longitudinal-axis-label { fill: #40565a; font-family: monospace; font-size: 13px; font-weight: 680; }
      .ena-individual-trajectory-path { fill: none; stroke-width: 1.65; stroke-linecap: round; opacity: 0.32; }
      .ena-group-centroid-path { fill: none; stroke-width: 4; stroke-linecap: round; opacity: 0.94; }
      .ena-longitudinal-node circle:first-child { fill: #fff; stroke: #385b58; stroke-width: 2.2; }
      .ena-longitudinal-node circle:nth-child(2) { fill: #385b58; }
      .ena-longitudinal-node text, .ena-longitudinal-period-label { fill: #263f43; paint-order: stroke; stroke: #fff; stroke-width: 4px; stroke-linejoin: round; font-size: 12px; font-weight: 730; }
      .ena-longitudinal-period-label { font-family: monospace; font-size: 11px; }
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
            disabled={sourceBusy || referenceBusy || loading}
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
        </div>
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
                <>
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
                      <select value={config.model} onChange={(event) => updateConfig((current) => {
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
                <fieldset className="ena-code-fieldset">
                  <legend>{copy.model.codes} <span>{config.codes.length}</span></legend>
                  <div className="ena-code-options">
                    {codeOptions.map((header) => (
                      <label key={header}>
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
                    ))}
                  </div>
                </fieldset>
              ) : null}
            </section>

            {configErrors.length ? (
              <ul className="ena-validation-list">{configErrors.map((item) => <li key={item}>{item}</li>)}</ul>
            ) : <div className="ena-valid-state"><span aria-hidden="true">✓</span>{copy.model.valid}</div>}
            <button type="button" className="ena-action-button ena-action-primary ena-run-button" disabled={!canRun} onClick={() => void runAnalysis()}>
              {result ? copy.model.rerun : copy.model.run} <span aria-hidden="true">→</span>
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
              <label className="ena-field">
                <span>{copy.longitudinal.repeatedEntity}</span>
                <select
                  value={repeatedEntityColumn}
                  onChange={(event) => updateLongitudinalSettings({ repeatedEntityColumn: event.target.value })}
                >
                  {resultConfig.unitColumns.map((column) => <option key={column} value={column}>{column}</option>)}
                </select>
              </label>
              <label className="ena-field">
                <span>{copy.longitudinal.timeOrder}</span>
                <select
                  value={timeColumn}
                  onChange={(event) => updateLongitudinalSettings({ timeColumn: event.target.value })}
                >
                  {resultConfig.conversationColumns.map((column) => <option key={column} value={column}>{column}</option>)}
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
                      }),
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
              <p className="ena-sets-compatibility-note">{longitudinalViewState.error}</p>
            )}
          </>
        )}
      </section>
    );
  }

  function renderPlotPanel() {
    const dimensions = displayedComparisonSurface === "sets"
      ? primarySet?.geometry.dimensions ?? result?.dimensions ?? ["SVD1", "SVD2", "SVD3"]
      : result?.dimensions ?? primarySet?.geometry.dimensions ?? ["SVD1", "SVD2", "SVD3"];
    return (
      <div className="ena-control-content">
        <div className="ena-panel-heading">
          <p className="ena-panel-kicker">03 · Presenter</p>
          <h2>{copy.plot.title}</h2>
          <p>{copy.plot.description}</p>
        </div>
        <div className="ena-form-stack">
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
            [copy.plot.axisX, xDimension, setXDimension, yDimension],
            [copy.plot.axisY, yDimension, setYDimension, xDimension],
            ...(view === "3d" ? [[copy.plot.axisZ, zDimension, setZDimension, ""] as const] : []),
          ] as const).map(([label, value, setter, oppositeDimension]) => (
            <label key={label} className="ena-field">
              <span>{label}</span>
              <select value={value} onChange={(event) => setter(event.target.value)}>
                {dimensions.map((dimension) => <option key={dimension} value={dimension} disabled={dimension === oppositeDimension}>{dimension}</option>)}
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
              <legend>{copy.plot.camera}</legend>
              {([
                ["isometric", copy.plot.isometric],
                ["xy", copy.plot.xy],
                ["xz", copy.plot.xz],
                ["yz", copy.plot.yz],
              ] as Array<[CameraPreset, string]>).map(([value, label]) => (
                <label key={value}><input type="radio" name="ena-camera" value={value} checked={camera === value} onChange={() => setCamera(value)} /><span>{label}</span></label>
              ))}
            </fieldset>
          ) : null}
          <button type="button" className="ena-action-button ena-action-secondary" onClick={resetPlot}>{copy.plot.reset}</button>
          <div className="ena-two-fields ena-figure-exports">
            <button type="button" className="ena-action-button ena-action-secondary" disabled={!result && !activeSetComparison} onClick={exportPlotSvg}>Export SVG ↓</button>
            <button type="button" className="ena-action-button ena-action-secondary" disabled={!result && !activeSetComparison} onClick={exportPlotPng}>Export PNG ↓</button>
          </div>
        </div>
      </div>
    );
  }

  function renderStatsPanel() {
    const manifestConfig = resultConfig ?? config;
    const statsTabs = [
      { id: "comparison", label: "Comparison" },
      { id: "goodness", label: "Goodness of Fit" },
      { id: "variance", label: "Variance" },
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
              <thead><tr><th>Axis</th><th>Test</th><th>Statistic</th><th>df</th></tr></thead>
              <tbody>{result.stats.tests.map((test) => (
                <tr key={`${test.dimension}-${test.test}`}>
                  <td>{test.dimension}</td>
                  <td>{test.test === "welch-t" ? "Welch t" : "One-way F"}</td>
                  <td>{formatStatistic(test.statistic)}</td>
                  <td>{test.df !== undefined
                    ? formatStatistic(test.df, 2)
                    : `${formatStatistic(test.dfBetween, 0)}/${formatStatistic(test.dfWithin, 0)}`}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p>
            Fitted-model group order: {result.stats.tests[0]?.groups.join(" → ")}. A Welch t sign follows this order, while rotated-axis signs themselves are arbitrary. “Not estimable” indicates insufficient group replication or within-group variance. {copy.stats.notTest}
          </p>
        </>
      ) : result.statsDiagnostics.tests === "omitted-unit-limit" ? (
        <p>Omitted for {result.set.points.length.toLocaleString()} units. In jENA 0.6.2, these test summaries are currently coupled to the same quadratic correlation helper, so Open ENA does not run them automatically above {result.statsDiagnostics.correlationUnitLimit.toLocaleString()} units.</p>
      ) : result.statsDiagnostics.tests === "not-applicable-trajectory" ? (
        <p>{copy.stats.trajectoryNotice}</p>
      ) : null;
    }

    return (
      <div className="ena-control-content">
        <div className="ena-panel-heading">
          <p className="ena-panel-kicker">04 · Evidence</p>
          <h2>{copy.stats.title}</h2>
          <p>{copy.stats.description}</p>
        </div>
        <div className="ena-stats-tabs" role="tablist" aria-label="Statistics views">
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
                  {groupContrast ? (
                    <section className="ena-selected-contrast-summary">
                      <h3>{copy.contrast.title}</h3>
                      <p>{copy.contrast.selectedOrder}: <strong>{groupContrast.groupOrder.join(" → ")}</strong> on {groupContrast.axes.join(" × ")}. {copy.contrast.multiplicity}</p>
                    </section>
                  ) : null}
                  {referenceMeanNotice ? (
                    <section className="ena-reference-interpretation">
                      <h3>Reference MR1 interpretation</h3>
                      <p>{referenceMeanNotice}</p>
                    </section>
                  ) : null}
                  {result.set.modelType === "EndPoint" && groupContrast ? <section>
                    <h3 aria-label="Absolute Cohen's d">{copy.stats.effect} · selected pair</h3>
                    <div className="ena-effect-grid">
                      {groupContrast.axes.map((dimension) => {
                        const effect = dimensionEffect(result, manifestConfig.groupColumn, dimension, groupContrast.groupOrder);
                        return <div key={dimension}><span>{dimension}</span><strong>{effect === null ? "—" : effect.toFixed(3)}</strong></div>;
                      })}
                    </div>
                    <p>{copy.stats.notTest}</p>
                    {manifestConfig.rotation === "mean" ? (
                      <p>MR1 is constructed from the same group contrast used for the original fitted order {result.groups.slice(0, 2).map((group) => group.name).join(" → ")}, independently of the current selector order. Separation and inference on MR1 remain descriptive by construction, not independent confirmation.</p>
                    ) : null}
                  </section> : null}
                  {mannWhitney?.status === "available" ? (
                    <section>
                      <h3>Mann–Whitney group comparison</h3>
                      <div className="ena-stats-scroll">
                        <table className="ena-stats-table">
                          <thead><tr><th>Axis</th><th>{mannWhitney.groupOrder?.[0]} median</th><th>{mannWhitney.groupOrder?.[1]} median</th><th>U first</th><th>p (two-sided)</th><th>r<sub>rb</sub></th></tr></thead>
                          <tbody>{mannWhitney.rows.map((row) => (
                            <tr key={row.dimension}>
                              <td>{row.dimension}</td>
                              <td>{formatStatistic(row.medianFirst ?? undefined)}</td>
                              <td>{formatStatistic(row.medianSecond ?? undefined)}</td>
                              <td>{formatStatistic(row.uFirst ?? undefined, 2)}</td>
                              <td>{row.pValueTwoSided === null ? "Not estimable" : row.pValueTwoSided < 0.001 ? "< .001" : row.pValueTwoSided.toFixed(3)}</td>
                              <td>{formatStatistic(row.rankBiserialFirstVsSecond ?? undefined)}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                      <p>
                        ENA.HK post-projection inference, not a jENA statistic. Selected group order is {mannWhitney.groupOrder?.join(" → ")}. Two-sided normal approximation uses average ranks, tie-corrected variance, and a 0.5 continuity correction. r<sub>rb</sub> is signed for Primary versus Secondary; axis signs remain arbitrary. Plot flips are presentation-only, so these statistics remain in unflipped model coordinates. No multiplicity correction is applied across axes or repeated pair selections. The approximation can be fragile with very small groups or extreme ties. Endpoint analytic units are assumed independent; paired, nested, repeated-measure, or clustered designs require a design-appropriate analysis.
                        {manifestConfig.rotation === "mean" ? " MR1 was constructed from the original fitted contrast, so inference on MR1 remains descriptive by construction even when the displayed Primary and Secondary order is reversed." : ""}
                      </p>
                    </section>
                  ) : null}
                </div>
                {result.groups.length > 2 ? (
                  <section data-ena-stats-scope="all-groups-omnibus">
                    <h3>jENA all-group omnibus statistics</h3>
                    <p>This fitted-model result covers every declared group and is separate from the selected Primary-versus-Secondary comparison above.</p>
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
                          <thead><tr><th>Axis</th><th>Pearson r</th><th>Spearman ρ</th></tr></thead>
                          <tbody>{result.stats.correlations
                            .filter((correlation) => [xDimension, yDimension].includes(correlation.dimension))
                            .map((correlation) => (
                              <tr key={correlation.dimension}><td>{correlation.dimension}</td><td>{formatStatistic(correlation.pearson)}</td><td>{formatStatistic(correlation.spearman)}</td></tr>
                            ))}</tbody>
                        </table>
                      </div>
                      <p>Pearson and Spearman values correlate pairwise signed differences among unit-point coordinates with the corresponding signed differences among network-centroid coordinates along each selected axis; they are not correlations between axes.</p>
                    </>
                  ) : result.statsDiagnostics.correlations === "omitted-unit-limit" ? (
                    <p>Omitted for {result.set.points.length.toLocaleString()} units. Pairwise correspondence diagnostics scale quadratically and run automatically only through {result.statsDiagnostics.correlationUnitLimit.toLocaleString()} units; the ENA model and linear summaries remain available.</p>
                  ) : result.statsDiagnostics.correlations === "not-applicable-reference" ? (
                    <p>Not reported for reference projection. jENA 0.6.2 retains target-fitted centroids while this plot uses fixed imported nodes, so those point–centroid correlations would not describe the displayed reference geometry.</p>
                  ) : (
                    <p>{copy.stats.trajectoryNotice}</p>
                  )}
                </section>
              </div>
              <div data-ena-stats-panel="variance" hidden={statsTab !== "variance"}>
                <section>
                  <h3>{copy.stats.variance}</h3>
                  <table className="ena-stats-table">
                    <thead><tr><th>Axis</th><th>Share</th></tr></thead>
                    <tbody>{[xDimension, yDimension].map((dimension) => <tr key={dimension}><td>{dimension}</td><td>{((result.set.variance[dimension] ?? 0) * 100).toFixed(1)}%</td></tr>)}</tbody>
                  </table>
                  <p>
                    Shares use all rotated dimensions, so the selected axes may not total 100%.
                    {result.projectionReference ? " For this projected model, these shares describe the current dataset in the fixed reference basis—not variance explained in the reference sample." : ""}
                  </p>
                </section>
              </div>
            </div>
            <div className="ena-stats-export-region" data-ena-stats-export="true">
              <OpenEnaAiInterpretation
                request={aiInterpretationRequest}
                disabled={!result || resultIsStale || !aiInterpretationRequest}
                disabledReason={resultIsStale
                  ? copy.aiInterpretation.staleResult
                  : result && !aiInterpretationRequest
                    ? copy.aiInterpretation.aggregatePrivacyGate
                    : copy.aiInterpretation.noCurrentResult}
                copy={copy.aiInterpretation}
              />
              <section className="ena-manifest-section">
              <h3>{copy.stats.manifest}</h3>
              <dl>
                <div><dt>jENA</dt><dd>v{JENA_RUNTIME_VERSION}</dd></div>
                <div><dt>{copy.model.unit}</dt><dd>{manifestConfig.unitColumns.join(" + ")}</dd></div>
                <div><dt>{copy.model.conversation}</dt><dd>{manifestConfig.conversationColumns.join(" + ")}</dd></div>
                <div><dt>{copy.model.modelType}</dt><dd>{manifestConfig.model}</dd></div>
                <div><dt>{copy.model.window}</dt><dd>{manifestConfig.window}</dd></div>
                <div><dt>{copy.model.rotation}</dt><dd>{manifestConfig.rotation}</dd></div>
                {result.projectionReference ? <div><dt>Reference space</dt><dd>{result.projectionReference.name}</dd></div> : null}
                <div><dt>{copy.model.forward}</dt><dd>{manifestConfig.windowSizeForward}</dd></div>
                <div>
                  <dt>{copy.sets.sourceHash}</dt>
                  <dd title={datasetHash ?? "Not recorded"}>{datasetHash ? `${datasetHash.slice(0, 12)}…` : "—"}</dd>
                </div>
                <div><dt>{copy.sets.hashScope}</dt><dd>{dataset?.hashKind ?? "legacy normalized UTF-8 text"}</dd></div>
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
                  Reference rotation JSON <span aria-hidden="true">↓</span>
                </button>
              </div>
            </section>
            <section className="ena-methods-section" aria-label="Methods & Reproducibility">
              <h3>Methods &amp; Reproducibility</h3>
              <p>A publication-ready starting point that records the exact model, projection, inference, source identity, and interpretation boundaries. Review and adapt it to the study design before use.</p>
              <div className="ena-two-fields">
                <button
                  type="button"
                  className="ena-action-button ena-action-secondary"
                  disabled={!methodsReport}
                  onClick={() => void copyMethodsReport()}
                >
                  Copy methods text {methodsCopyStatus ? "✓" : ""}
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
                  Methods report ↓
                </button>
              </div>
              {methodsReport ? (
                <details className="ena-methods-preview">
                  <summary>Preview generated report</summary>
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
    return (
      <OpenEnaDataView
        columns={dataViewModel.columns}
        rows={rows}
        context={dataViewContext}
        onContextChange={setDataViewContext}
        onReturnToComparison={() => setCenterSurface("plot")}
        onExportCsv={() => downloadText(
          `open-ena-${Date.now()}-data-view.csv`,
          rowsToCsv(rows.map((row) => Object.fromEntries(
            Object.entries(row.values).map(([key, value]) => [key, value ?? null]),
          ) as Row)),
          "text/csv;charset=utf-8",
        )}
        emptyMessage="No derived Data View records are available for this plot context."
      />
    );
  }

  const panel = mode === "sets" ? renderSetsPanel() : mode === "data" ? renderDataPanel() : mode === "model" ? renderModelPanel() : mode === "plot" ? renderPlotPanel() : renderStatsPanel();
  const persistentPlotTools = (
    <OpenEnaPersistentPlotTools
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
                  aria-label={copy.modes[item]}
                  title={copy.modes[item]}
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

          <div className="ena-visual-workspace" data-testid="open-ena-center-surface">
            <div className="ena-visual-toolbar">
              <div>
                <p>{activeSetComparison
                  ? copy.workspace.comparison
                  : activeGroupContrast
                    ? copy.workspace.comparison
                    : activeLongitudinalView
                      ? copy.longitudinal.title
                      : copy.workspace.comparison}</p>
                <span>{activeSetComparison
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
                  disabled={!activeGroupContrast}
                  onClick={() => {
                    setDataViewContext("comparison");
                    setCenterSurface((current) => current === "data" ? "plot" : "data");
                  }}
                >
                  <span aria-hidden="true">▦</span>{centerSurface === "data" ? "Comparison Plot" : "Data View"}
                </button>
                <div className="ena-analysis-toolbar-cluster">
                  <div className="ena-view-toggle" role="group" aria-label="ENA visualization options">
                    <button type="button" aria-pressed={view === "2d"} onClick={() => setView("2d")}>
                      <strong>{copy.views.twoD}</strong>
                    </button>
                    <a
                      href={siteConfig.threeDenaUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`${copy.views.threeD}. Opens www.3dena.com in a new tab.`}
                    >
                      <strong>{copy.views.threeD}</strong>
                    </a>
                  </div>
                  <button
                    type="button"
                    className="ena-compact-toolbar-button ena-download-model-button"
                    disabled={!dataset || !result || !resultConfig}
                    onClick={() => {
                      if (dataset && result && resultConfig) {
                        downloadJson(
                          `open-ena-${Date.now()}-results.json`,
                          buildAnalysisBundle(dataset, resultConfig, result, datasetHash, {
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
                    Download Model
                  </button>
                </div>
              </div>
            </div>

            {activeSetComparison ? (
              <OpenEnaSetComparison
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
                {activeLongitudinalView ? (
                  <OpenEnaLongitudinalTrajectory
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
                ) : activeGroupContrast ? (
                  <OpenEnaGroupContrast
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
                ) : (
                  <OpenEnaPlot
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
                {showNetworks && !activeGroupContrast && !activeLongitudinalView ? (
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
