"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from "react";
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
  transitionOpenEnaOrderPanelValue,
  type OpenEnaAnalysisFamilyDrafts,
} from "@/lib/open-ena/analysis-family";
import {
  openEnaAnalysisKindFromResult,
  openEnaDataViewAvailability,
  openEnaDataViewCenterSurface,
  openEnaDataViewUnavailableCopy,
  type OpenEnaCenterSurface,
} from "@/lib/open-ena/capabilities";
import {
  analysisKindFor,
  cloneOpenEnaConfig,
  reconcileDirectionalMask,
} from "@/lib/open-ena/network-config";
import { buildOpenEnaOnaDataView } from "@/lib/open-ena/ona-data-view";
import { buildOpenEnaDataViewExportRows } from "@/lib/open-ena/data-view-export";
import {
  buildOpenEnaOnaAggregateEdgeExport,
  buildOpenEnaOnaDeidentifiedAuditExport,
} from "@/lib/open-ena/ona-export";
import {
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
  deriveOpenEnaGroupDisplay,
  openEnaGroupUnitKey,
  resolveOpenEnaGroupDisplayOptions,
  type OpenEnaGroupDisplayOptions,
  type OpenEnaGroupDisplaySettingsByGroup,
} from "@/lib/open-ena/group-display";
import {
  buildLongitudinalGroupCentroidExport,
  inferLongitudinalMappingDefaults,
  longitudinalInferenceRowsToCsv,
  longitudinalPeriodRowsToCsv,
  sliceLongitudinalIndependentPeriod,
  sliceLongitudinalPairedPeriods,
  sliceLongitudinalRepeatedPeriods,
  OpenEnaLongitudinalIntegrityError,
  type OpenEnaLongitudinalCohortPolicy,
  type OpenEnaLongitudinalDerivation,
} from "@/lib/open-ena/longitudinal";
import {
  OpenEnaInferenceIntegrityError,
  runOpenEnaInferenceV2,
  type OpenEnaInferenceRequestV2,
  type OpenEnaInferenceResultV2,
} from "@/lib/open-ena/inference-v2";
import { buildMethodsReport, referenceMeanRotationInterpretation } from "@/lib/open-ena/methods";
import { buildOpenEnaAiInterpretationRequest } from "@/lib/open-ena/ai-interpretation";
import {
  buildAnalysisBundle,
  buildOpenEnaResultTableViewModel,
  buildResultTables,
  openEnaResultTableFocusTarget,
  openEnaResultTableAvailability,
  resolveOpenEnaPlotExportDimensions,
  resolveOpenEnaPlotRasterDimensions,
  resolveOpenEnaResultTableRovingKey,
  rowsToCsv,
  type OpenEnaResultTableKey,
  type OpenEnaResultTableViewModel,
} from "@/lib/open-ena/export";
import { codeColorFor, updateCodeColor } from "@/lib/open-ena/plot-style";
import {
  createOpenEnaNodeLayoutFingerprint,
  createOpenEnaNodeLayoutState,
  moveOpenEnaNode,
  openEnaNodeLayoutOverrideCount,
  resetOpenEnaNodeLayout,
  type OpenEnaNodeDimensionPosition,
} from "@/lib/open-ena/node-layout";
import {
  cameraForPreset,
  createOpenEnaWorkspaceAxes,
  resetOpenEnaWorkspaceAxisSurface,
  updateOpenEnaWorkspace3dAxis,
  type OpenEna3dAspectRatio,
  type OpenEna3dCamera,
  type OpenEnaWorkspaceAxes,
} from "@/lib/open-ena/plot3d";
import { buildReferenceRotationPackage } from "@/lib/open-ena/reference";
import {
  JENA_RUNTIME_VERSION,
  JENA_SOURCE_COMMIT,
  JENA_SOURCE_URL,
  SAMPLE_CONFIG,
  SAMPLE_DATASET_URL,
  TRAJECTORY_SAMPLE_CONFIG,
  TRAJECTORY_SAMPLE_DATASET_URL,
  datasetHashKindFor,
  sameOpenEnaConfig,
  type AnalysisKind,
  type CameraPreset,
  type OpenEnaConfig,
  type OpenEnaMode,
  type OpenEnaResult,
  type OpenEnaView,
  type ParsedDataset,
} from "@/lib/open-ena/types";
import OpenEnaPlot, { MiniNetwork } from "./OpenEnaPlot";
import OpenEnaInteractive3DPlot from "./OpenEnaInteractive3DPlot";
import OpenEna3DGroupContrast from "./OpenEna3DGroupContrast";
import OpenEna3DOrderedResultLayout from "./OpenEna3DOrderedResultLayout";
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
import OpenEnaGroupDisplayControls from "./OpenEnaGroupDisplayControls";
import OpenEnaLongitudinalTrajectory from "./OpenEnaLongitudinalTrajectory";
import OpenEnaLongitudinalWorkbenchV3 from "./OpenEnaLongitudinalWorkbenchV3";
import OpenEnaPersistentPlotTools from "./OpenEnaPersistentPlotTools";
import OpenEnaAiInterpretation from "./OpenEnaAiInterpretation";
import OpenEnaFallbackNotice from "./OpenEnaFallbackNotice";
import OpenEnaInferencePanel, {
  type OpenEnaInferenceDesignChoice,
  type OpenEnaInferencePreview,
} from "./OpenEnaInferencePanel";

interface OpenEnaWorkspaceProps {
  locale: Locale;
  providerDescriptor?: { provider: string; model: string };
}

type OpenEnaModelPanelTab = "units" | "horizons" | "windows" | "codes";
type OpenEnaStatsTab = "comparison" | "goodness" | "variance";

const MODEL_TAB_ORDER = ["units", "horizons", "windows", "codes"] as const;
const STATS_TAB_ORDER = ["comparison", "goodness", "variance"] as const;
const JENA_RAIL_DISPLAY_VERSION = JENA_RUNTIME_VERSION.split("-", 1)[0];
const IDENTITY_BEARING_RESULT_TABLES = new Set<OpenEnaResultTableKey>([
  "coordinates",
  "lineWeights",
  "connectionCounts",
  "trajectories",
  "centroids",
]);

export function confirmOpenEnaIdentityBearingExport(
  confirmExport: (message: string) => boolean,
  message: string,
  publish: () => void,
) {
  if (!confirmExport(message)) return false;
  publish();
  return true;
}

export function OpenEnaResultTables({
  model,
  onSelect,
  onExport,
}: {
  model: OpenEnaResultTableViewModel;
  onSelect: (key: OpenEnaResultTableKey) => void;
  onExport: () => void;
}) {
  const [rovingKey, setRovingKey] = useState<OpenEnaResultTableKey | null>(() => (
    resolveOpenEnaResultTableRovingKey(model.tabs, null)
  ));
  const resolvedRovingKey = resolveOpenEnaResultTableRovingKey(model.tabs, rovingKey);
  useEffect(() => {
    if (rovingKey !== resolvedRovingKey) setRovingKey(resolvedRovingKey);
  }, [resolvedRovingKey, rovingKey]);

  return (
    <OpenEnaResultTablesView
      model={model}
      rovingKey={resolvedRovingKey}
      onRovingKeyChange={setRovingKey}
      onSelect={onSelect}
      onExport={onExport}
    />
  );
}

export function OpenEnaRangeField({
  id,
  label,
  value,
  formattedValue,
  accessibleValueText,
  idPrefix,
  min,
  max,
  step,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  formattedValue: string;
  accessibleValueText: string;
  idPrefix?: string;
  min: number;
  max: number;
  step: number;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const fieldId = idPrefix ? `${idPrefix}-${id}` : id;
  return (
    <div className="ena-field ena-range-field">
      <span>
        <label htmlFor={fieldId}>{label}</label>
        <output id={`${fieldId}-value`} htmlFor={fieldId}>{formattedValue}</output>
      </span>
      <input id={fieldId} aria-valuetext={accessibleValueText || formattedValue} type="range" min={min} max={max} step={step} value={value} onChange={onChange} />
    </div>
  );
}

export function OpenEnaResultTablesView({
  model,
  rovingKey,
  onRovingKeyChange,
  onSelect,
  onExport,
}: {
  model: OpenEnaResultTableViewModel;
  rovingKey: OpenEnaResultTableKey | null;
  onRovingKeyChange: (key: OpenEnaResultTableKey) => void;
  onSelect: (key: OpenEnaResultTableKey) => void;
  onExport: () => void;
}) {
  return (
    <details className="ena-result-data">
      <summary>
        <span>{model.summaryTitle}</span>
        <small>{model.summaryDescription}</small>
      </summary>
      <div className="ena-result-data-tools">
        <div className="ena-result-tabs" role="tablist" aria-label={model.tabsAriaLabel}>
          {model.tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={tab.id}
              aria-controls={tab.controls}
              aria-selected={tab.selected}
              aria-disabled={tab.disabled}
              aria-describedby={tab.describedBy ?? undefined}
              tabIndex={tab.key === rovingKey ? 0 : -1}
              title={tab.reason ?? undefined}
              onFocus={() => onRovingKeyChange(tab.key)}
              onClick={() => {
                if (!tab.disabled) onSelect(tab.key);
              }}
              onKeyDown={(event) => {
                const targetKey = openEnaResultTableFocusTarget(
                  model.tabs.map((candidate) => candidate.key),
                  tab.key,
                  event.key,
                );
                if (!targetKey) return;
                event.preventDefault();
                onRovingKeyChange(targetKey);
                const targetTab = model.tabs.find((candidate) => candidate.key === targetKey);
                if (targetTab) event.currentTarget.ownerDocument.getElementById(targetTab.id)?.focus();
              }}
            >
              {tab.label} <span>{tab.badge}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ena-action-button ena-action-secondary ena-table-export"
          aria-label={model.export.ariaLabel}
          disabled={model.export.disabled}
          onClick={() => {
            if (!model.export.disabled) onExport();
          }}
        >
          {model.export.label} ↓
        </button>
      </div>
      {model.unavailableNotes.length ? (
        <div className="ena-result-table-unavailable-notes">
          {model.unavailableNotes.map((note) => (
            <p key={note.id} id={note.id}>
              <strong>{note.label}</strong> — {note.reason}
            </p>
          ))}
        </div>
      ) : null}
      <div
        id={model.panel.id}
        role="tabpanel"
        aria-labelledby={model.panel.labelledBy}
        tabIndex={0}
      >
        {!model.panel.available ? (
          <p className="ena-result-table-not-applicable" role="status">
            {model.panel.note}
          </p>
        ) : (
          <>
            <div
              className="ena-result-table-wrap"
              role="region"
              aria-label={model.panel.tableAriaLabel}
              tabIndex={0}
            >
              <table>
                <thead><tr>{model.panel.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
                <tbody>{model.panel.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>{model.panel.headers.map((header) => (
                    <td key={header}>{String(row[header] ?? "")}</td>
                  ))}</tr>
                ))}</tbody>
              </table>
            </div>
            <p>{model.panel.rowSummary}</p>
          </>
        )}
      </div>
    </details>
  );
}

export function OpenEnaPersistentRailPanels({
  mode,
  analysisPanel,
  aiPanel,
}: {
  mode: OpenEnaMode;
  analysisPanel: React.ReactNode;
  aiPanel: React.ReactNode;
}) {
  return (
    <>
      <div
        className="ena-persistent-analysis-panel"
        data-testid="open-ena-persistent-analysis-panel"
        hidden={mode === "ai"}
      >
        {analysisPanel}
      </div>
      <div
        className="ena-persistent-ai-lifecycle"
        data-testid="open-ena-persistent-ai-lifecycle"
        hidden={mode !== "ai"}
      >
        {aiPanel}
      </div>
    </>
  );
}

const modeIcons: Record<OpenEnaMode, React.ReactNode> = {
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
) {
  return [...new Set(validateConfig(dataset, config))];
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

export default function OpenEnaWorkspace({ locale, providerDescriptor }: OpenEnaWorkspaceProps) {
  const workspaceId = useId();
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
  const [mode, setMode] = useState<OpenEnaMode>("data");
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
  const [onaOrderPanelDraft, setOnaOrderPanelDraft] = useState<OpenEnaOrderPanelValue>(
    () => orderPanelValueFromConfig(createAnalysisFamilyDrafts(SAMPLE_CONFIG).ona),
  );
  const [directionalMaskOpen, setDirectionalMaskOpen] = useState(false);
  const [codeColors, setCodeColors] = useState<Record<string, string>>({});
  const [resultConfig, setResultConfig] = useState<OpenEnaConfig | null>(null);
  const [datasetHash, setDatasetHash] = useState<string | null>(null);
  const [result, setResult] = useState<OpenEnaResult | null>(null);
  const [primaryGroupName, setPrimaryGroupName] = useState("");
  const [secondaryGroupName, setSecondaryGroupName] = useState("");
  const [groupDisplaySettingsByGroup, setGroupDisplaySettingsByGroup] = useState<OpenEnaGroupDisplaySettingsByGroup>({});
  const [hiddenUnitKeys, setHiddenUnitKeys] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sourceBusy, setSourceBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStage, setProgressStage] = useState<"accumulate" | "model">("accumulate");
  const [xDimension, setXDimension] = useState("SVD1");
  const [yDimension, setYDimension] = useState("SVD2");
  const [threeDDimensions, setThreeDDimensions] = useState<OpenEnaWorkspaceAxes["threeD"]>(null);
  const genericThreeDAvailable = result !== null && threeDDimensions !== null;
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
  const [resultTable, setResultTable] = useState<OpenEnaResultTableKey>("coordinates");
  const [dataViewContext, setDataViewContext] = useState<OpenEnaDataViewContext>("comparison");
  const [onaStatsContext, setOnaStatsContext] = useState<OpenEnaDataViewContext>("comparison");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const plotSvgRef = useRef<SVGSVGElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sourceAbortRef = useRef<AbortController | null>(null);
  const datasetGenerationRef = useRef(0);
  const groupSelectionColumnRef = useRef<string | null>(null);
  const inferenceGenerationRef = useRef(0);
  const inferenceRequestKeyRef = useRef<string | null>(null);
  const trajectoryModelFocusHandledRef = useRef(0);
  const modelTypeSelectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => () => {
    abortRef.current?.abort();
    sourceAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (trajectoryModelFocusRequest === trajectoryModelFocusHandledRef.current || modelTab !== "windows") return;
    trajectoryModelFocusHandledRef.current = trajectoryModelFocusRequest;
    modelTypeSelectRef.current?.focus();
  }, [modelTab, trajectoryModelFocusRequest]);

  const configErrors = useMemo(
    () => dataset ? validateWorkspaceConfig(dataset, config) : [],
    [dataset, config],
  );
  const currentAnalysisKind = analysisKindFor(config);
  const completedResultKind = useMemo(
    () => result ? openEnaAnalysisKindFromResult(result) : null,
    [result],
  );
  const threeDViewLabel = completedResultKind === "ona"
    ? copy.ona.workspace.threeD
    : copy.views.threeD;
  const nodeLayoutFingerprint = useMemo(() => {
    if (!result || !completedResultKind) return "open-ena-node-layout:empty";
    return createOpenEnaNodeLayoutFingerprint({
      analysisKind: completedResultKind,
      analyzedAt: result.analyzedAt,
      sourceDatasetNormalizedUtf8TextSha256: result.provenanceBinding?.datasetNormalizedUtf8TextSha256
        ?? result.projectionReference?.source.normalizedUtf8TextSha256
        ?? null,
      referenceId: result.projectionReference?.referenceId ?? null,
      codes: result.executionProvenance?.configuration.codes ?? resultConfig?.codes ?? [],
      dimensions: result.dimensions,
      nodePositionMethod: result.executionProvenance?.nodePositionMethod
        ?? (completedResultKind === "ona" ? "directed" : "undirected"),
    });
  }, [completedResultKind, result, resultConfig]);
  const [nodeLayout, setNodeLayout] = useState(() => (
    createOpenEnaNodeLayoutState("open-ena-node-layout:empty")
  ));
  useEffect(() => {
    setNodeLayout((current) => current.fingerprint === nodeLayoutFingerprint
      ? current
      : createOpenEnaNodeLayoutState(nodeLayoutFingerprint));
  }, [nodeLayoutFingerprint]);
  const activeNodeLayout = nodeLayout.fingerprint === nodeLayoutFingerprint
    ? nodeLayout
    : createOpenEnaNodeLayoutState(nodeLayoutFingerprint);
  const moveNode = useCallback((code: string, dimensions: OpenEnaNodeDimensionPosition) => {
    setNodeLayout((current) => moveOpenEnaNode(current, nodeLayoutFingerprint, code, dimensions));
  }, [nodeLayoutFingerprint]);
  const resetNodeLayout = useCallback(() => {
    setNodeLayout((current) => current.fingerprint === nodeLayoutFingerprint
      ? resetOpenEnaNodeLayout(current)
      : createOpenEnaNodeLayoutState(nodeLayoutFingerprint));
  }, [nodeLayoutFingerprint]);
  function confirmCurrentIdentityBearingExport() {
    return window.confirm(
      completedResultKind === "ona"
        ? copy.ona.exports.bundleConfirmation
        : copy.stats.identityExportConfirmation,
    );
  }
  const capabilityAnalysisKind = completedResultKind ?? currentAnalysisKind;
  const onaCapabilityDisabled = capabilityAnalysisKind === "ona";
  const resultIsStale = Boolean(result && resultConfig && !sameOpenEnaConfig(config, resultConfig));
  const canRun = Boolean(dataset && configErrors.length === 0 && !sourceBusy && !loading);
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
  const groupDisplayResultKey = result && resultConfig?.groupColumn && result.set.modelType === "EndPoint"
    ? `${result.analyzedAt}\u001f${datasetHash ?? "unbound"}\u001f${resultConfig.groupColumn}`
    : "";
  const groupDisplayControlGroups = useMemo(() => {
    if (!result || !resultConfig?.groupColumn || result.set.modelType !== "EndPoint") return [];
    const groupColumn = resultConfig.groupColumn;
    const unitIdsByGroup = new Map(result.groups.map((group) => [group.name, [] as string[]]));
    const seenUnitIdsByGroup = new Map(result.groups.map((group) => [group.name, new Set<string>()]));
    for (const row of result.set.points) {
      const groupName = String(row[groupColumn] ?? "");
      const unitId = String(row.ENA_UNIT ?? "");
      const unitIds = unitIdsByGroup.get(groupName);
      const seenUnitIds = seenUnitIdsByGroup.get(groupName);
      if (!unitId || !unitIds || !seenUnitIds || seenUnitIds.has(unitId)) continue;
      seenUnitIds.add(unitId);
      unitIds.push(unitId);
    }
    return result.groups.map((group) => ({
      name: group.name,
      color: group.color,
      unitIds: unitIdsByGroup.get(group.name) ?? [],
    }));
  }, [result, resultConfig]);

  useEffect(() => {
    setGroupDisplaySettingsByGroup({});
    setHiddenUnitKeys([]);
  }, [groupDisplayResultKey]);

  function updateGroupDisplaySettings(groupName: string, patch: Partial<OpenEnaGroupDisplayOptions>) {
    setGroupDisplaySettingsByGroup((current) => ({
      ...current,
      [groupName]: {
        ...resolveOpenEnaGroupDisplayOptions(current, groupName),
        ...patch,
      },
    }));
  }

  function updateUnitPointVisibility(groupName: string, unitId: string, visible: boolean) {
    const key = openEnaGroupUnitKey(groupName, unitId);
    setHiddenUnitKeys((current) => {
      const next = new Set(current);
      if (visible) next.delete(key);
      else next.add(key);
      return [...next];
    });
  }

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

  const longitudinalDerivationState = useMemo<{
    derivation: OpenEnaLongitudinalDerivation | null;
    error: string | null;
  }>(() => {
    if (!result || !resultConfig || !dataset) return { derivation: null, error: copy.longitudinal.unavailableModel };
    if (result.set.modelType === "EndPoint") return { derivation: null, error: copy.longitudinal.unavailableModel };
    return {
      derivation: null,
      error: "Successful trajectory results are executed by the V3 task workbench; legacy V1/V2 readers remain read-only.",
    };
  }, [
    copy.longitudinal,
    dataset,
    result,
    resultConfig,
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
      const reason = copy.ona.unavailable.inference;
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
  }, [completedResultKind, copy.ona.unavailable.inference, copy.stats.inference, currentResultGroupKey, longitudinalTimeOrder.length, result, resultConfig]);

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
    if (completedResultKind === "ona") return copy.ona.unavailable.groupContrast;
    if (result.set.modelType !== "EndPoint") return copy.contrast.endpointOnly;
    if (!resultConfig.groupColumn) return copy.contrast.requiresGroup;
    if (result.groups.length < 2) return copy.contrast.requiresTwoGroups;
    return null;
  }, [completedResultKind, copy.contrast, copy.ona.unavailable.groupContrast, result, resultConfig]);
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
  const groupDisplayPresentation = useMemo(() => {
    if (!groupContrast) {
      return {
        settingsByGroup: {} as OpenEnaGroupDisplaySettingsByGroup,
        hiddenUnitKeys: [] as string[],
      };
    }
    const selectedSides = [groupContrast.primary, groupContrast.secondary];
    const allowedHiddenUnitKeys = new Set(selectedSides.flatMap((side) => (
      side.unitIds.map((unitId) => openEnaGroupUnitKey(side.name, unitId))
    )));
    return {
      settingsByGroup: Object.fromEntries(selectedSides.map((side) => [
        side.name,
        resolveOpenEnaGroupDisplayOptions(groupDisplaySettingsByGroup, side.name),
      ])),
      hiddenUnitKeys: hiddenUnitKeys.filter((key) => allowedHiddenUnitKeys.has(key)),
    };
  }, [groupContrast, groupDisplaySettingsByGroup, hiddenUnitKeys]);
  const groupDisplayDerivation = useMemo(() => {
    if (!result || !groupContrast) return { display: null, error: "" };
    try {
      return {
        display: deriveOpenEnaGroupDisplay({
          result,
          contrast: groupContrast,
          settingsByGroup: groupDisplaySettingsByGroup,
          hiddenUnitKeys,
        }),
        error: "",
      };
    } catch {
      return { display: null, error: copy.groupDisplay.derivationError };
    }
  }, [copy.groupDisplay.derivationError, groupContrast, groupDisplaySettingsByGroup, hiddenUnitKeys, result]);
  const derivedGroupDisplay = groupDisplayDerivation.display;
  const groupDisplayError = groupDisplayDerivation.error;
  const groupDisplayExportContrast = groupDisplayError
    ? null
    : derivedGroupDisplay?.contrast ?? groupContrast;
  const selectedPresentationGroupOrder = useMemo<readonly [string, string] | undefined>(() => {
    if (completedResultKind !== "ona") return groupContrast?.groupOrder;
    if (!result || !primaryGroupName || !secondaryGroupName || primaryGroupName === secondaryGroupName) {
      return undefined;
    }
    const completedGroupNames = new Set(result.groups.map((group) => group.name));
    return completedGroupNames.has(primaryGroupName) && completedGroupNames.has(secondaryGroupName)
      ? [primaryGroupName, secondaryGroupName]
      : undefined;
  }, [completedResultKind, groupContrast, primaryGroupName, result, secondaryGroupName]);
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
          showTrajectories: false,
          showLabels,
          showGroupLabels,
          showUnitLabels,
          showVariance,
          edgeScale,
          pointScale,
          plotZoom,
          selectedGroupOrder: selectedPresentationGroupOrder,
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
      inferenceProducerContext,
      plotZoom,
      pointScale,
      result,
      resultConfig,
      selectedPresentationGroupOrder,
      showLabels,
      showGroupLabels,
      showNetworks,
      showPoints,
      showUnitLabels,
      showVariance,
      xDimension,
      yDimension,
    ],
  );
  const referenceMeanNotice = result ? referenceMeanRotationInterpretation(result, datasetHash) : null;
  const activeGroupContrast = completedResultKind !== "ona" ? groupContrast : null;
  const activeGroupDisplay = activeGroupContrast ? derivedGroupDisplay : null;
  const dataViewAvailability = openEnaDataViewAvailability({
    view,
    completedResultKind,
    hasActiveGroupContrast: Boolean(activeGroupContrast),
  });
  const dataViewUnavailableCopy = openEnaDataViewUnavailableCopy(dataViewAvailability.reason);
  const dataViewCenterSurface = openEnaDataViewCenterSurface({
    requestedCenterSurface: centerSurface,
    dataViewEnabled: dataViewAvailability.enabled,
  });
  const effectiveCenterSurface = dataViewCenterSurface.effectiveCenterSurface;
  useEffect(() => {
    if (centerSurface !== effectiveCenterSurface) setCenterSurface(effectiveCenterSurface);
  }, [centerSurface, effectiveCenterSurface]);
  const dataViewModel = useMemo(() => {
    const empty = {
      columns: [] as OpenEnaDataViewColumn[],
      rows: [] as OpenEnaDataViewRow[],
      error: null as string | null,
    };
    if (!dataset || !result || !resultConfig) return empty;

    if (completedResultKind === "ona") {
      if (!datasetHash) return { ...empty, error: copy.ona.dataView.missingDatasetBinding };
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
              : column.kind === "directed-edge"
                ? `${column.ground} ${copy.ona.mask.groundHeader} → ${column.response} ${copy.ona.mask.responseHeader}`
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
    copy.ona.dataView.missingDatasetBinding,
    dataViewContext,
    dataset,
    datasetHash,
    primaryGroupName,
    result,
    resultConfig,
    secondaryGroupName,
  ]);
  const activeLongitudinalView = !activeGroupContrast
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
  function installAnalysisConfig(nextConfig: OpenEnaConfig) {
    const next = cloneOpenEnaConfig(nextConfig);
    const nextFamilyDrafts = createAnalysisFamilyDrafts(next);
    setAnalysisFamilyDrafts(nextFamilyDrafts);
    setOnaOrderPanelDraft(orderPanelValueFromConfig(nextFamilyDrafts.ona));
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
    if (target === "ona") {
      setOnaOrderPanelDraft((current) => ({
        ...current,
        windowSizeBack: transition.activeConfig.windowSizeBack,
      }));
      setModelTab("windows");
    }
  }

  function updateOnaOrderPanel(value: OpenEnaOrderPanelValue) {
    if (currentAnalysisKind !== "ona") return;
    const transition = transitionOpenEnaOrderPanelValue(
      analysisFamilyDrafts,
      config,
      value,
    );
    setOnaOrderPanelDraft(transition.panelValue);
    setAnalysisFamilyDrafts(transition.drafts);
    setConfig(transition.activeConfig);
    setView("2d");
  }

  function openTrajectoryModelConfiguration() {
    if (currentAnalysisKind === "ona") return;
    setModelTab("windows");
    setTrajectoryModelFocusRequest((request) => request + 1);
  }

  async function runAnalysis(
    nextDataset = dataset,
    nextConfig = config,
    nextDatasetHash = datasetHash,
  ) {
    if (!nextDataset || sourceAbortRef.current) return;
    if (!nextDatasetHash) {
      setError("Commit the imported source and its SHA-256 binding before analysis.");
      return;
    }
    const analysisGeneration = datasetGenerationRef.current;
    const errors = validateWorkspaceConfig(nextDataset, nextConfig);
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
        reference: null,
        onProgress: ({ progress: nextProgress, stage }) => {
          setProgress(Math.round(nextProgress * 100));
          setProgressStage(stage);
        },
      });
      if (controller.signal.aborted || datasetGenerationRef.current !== analysisGeneration) return;
      setResult(nextResult);
      setResultConfig(cloneOpenEnaConfig(nextResult.provenanceBinding!.configuration));
      const initialAxes = createOpenEnaWorkspaceAxes(nextResult.dimensions);
      const [x, y] = initialAxes.twoD ?? ["", ""];
      setXDimension(x);
      setYDimension(y);
      setThreeDDimensions(initialAxes.threeD);
      setInteractive3dCamera(null);
      setInteractive3dAspectRatio(null);
      setView("2d");
      setMode(nextResult.set.modelType === "EndPoint" ? "model" : "plot");
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

  function clearCompletedResult() {
    setResult(null);
    setResultConfig(null);
    setThreeDDimensions(null);
    setView("2d");
  }

  async function loadSample() {
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
      clearCompletedResult();
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
    sourceAbortRef.current?.abort();
    const sourceController = new AbortController();
    sourceAbortRef.current = sourceController;
    datasetGenerationRef.current += 1;
    const sourceGeneration = datasetGenerationRef.current;
    setSourceBusy(true);
    setError("");
    try {
      const response = await fetch(TRAJECTORY_SAMPLE_DATASET_URL, { cache: "no-store", signal: sourceController.signal });
      if (!response.ok) throw new Error(`The 3D trajectory sample could not be opened (${response.status}).`);
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
      clearCompletedResult();
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
      clearCompletedResult();
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

  function updatePointVisibility(visible: boolean) {
    setShowPoints(visible);
  }

  function selectVisualizationView(nextView: OpenEnaView) {
    if (nextView === "3d" && !genericThreeDAvailable) {
      setError(copy.plot.threeDRequiresThreeDimensions);
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

  function selectTwoDAxisDimension(axis: "x" | "y", nextDimension: string) {
    if (axis === "x") {
      if (nextDimension === xDimension) return;
      const previous = xDimension;
      setXDimension(nextDimension);
      if (nextDimension === yDimension) setYDimension(previous);
      return;
    }
    if (nextDimension === yDimension) return;
    const previous = yDimension;
    setYDimension(nextDimension);
    if (nextDimension === xDimension) setXDimension(previous);
  }

  function selectAxisDimension(axis: "x" | "y" | "z", nextDimension: string) {
    if (!threeDDimensions || !result) return;
    const next = updateOpenEnaWorkspace3dAxis({
      twoD: [xDimension, yDimension],
      threeD: threeDDimensions,
    }, axis, nextDimension, result.dimensions);
    setThreeDDimensions(next.threeD);
  }

  function resetPlot() {
    const activeDimensions = result?.dimensions;
    if (activeDimensions) {
      const activeAxisSurface = view === "3d" ? "3d" : "2d";
      const resetAxes = resetOpenEnaWorkspaceAxisSurface({
        twoD: [xDimension, yDimension],
        threeD: threeDDimensions,
      }, activeAxisSurface, activeDimensions);
      if (resetAxes.twoD) {
        setXDimension(resetAxes.twoD[0]);
        setYDimension(resetAxes.twoD[1]);
      }
      setThreeDDimensions(resetAxes.threeD);
    }
    setCamera("isometric");
    setInteractive3dCamera(null);
    setInteractive3dAspectRatio(null);
    setShowPoints(true);
    setShowNetworks(true);
    setShowLabels(true);
    setShowGroupLabels(true);
    setShowUnitLabels(false);
    setGroupDisplaySettingsByGroup({});
    setHiddenUnitKeys([]);
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
    const dimensions = resolveOpenEnaPlotExportDimensions(source.getAttribute("viewBox"));
    const clone = source.cloneNode(true) as SVGSVGElement;
    if (completedResultKind === "ona" || !showUnitLabels) {
      clone.querySelectorAll<SVGGElement>("[data-ena-unit-point='true'], [data-ona-unit-point='true']").forEach((unitPoint, index) => {
        const sanitizedLabel = copy.plotExport.identityOmittedPoint(index + 1);
        unitPoint.setAttribute("aria-label", sanitizedLabel);
        unitPoint.querySelectorAll("title").forEach((title) => {
          title.textContent = sanitizedLabel;
        });
        unitPoint.querySelectorAll(".ena-set-unit-label").forEach((label) => label.remove());
      });
    }
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(dimensions.width));
    clone.setAttribute("height", String(dimensions.height));
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
      .ena-group-centroid-direction-arrow { fill: #000; stroke: #fff; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; opacity: 0.98; }
      .ena-individual-direction-arrow { fill: #000; stroke: #fff; stroke-width: 1; stroke-linecap: round; stroke-linejoin: round; opacity: 0.82; }
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
    return {
      svg: `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}\n`,
      dimensions,
    };
  }

  function exportPlotSvg() {
    if (!confirmCurrentIdentityBearingExport()) return;
    const serialized = serializedPlotSvg();
    if (serialized) downloadText(`open-ena-${Date.now()}-plot.svg`, serialized.svg, "image/svg+xml;charset=utf-8");
  }

  function exportPlotPng() {
    if (!confirmCurrentIdentityBearingExport()) return;
    const serialized = serializedPlotSvg();
    if (!serialized) return;
    const sourceUrl = URL.createObjectURL(new Blob([serialized.svg], { type: "image/svg+xml;charset=utf-8" }));
    const image = new Image();
    image.onload = () => {
      const scale = 3;
      const rasterDimensions = resolveOpenEnaPlotRasterDimensions(serialized.dimensions, scale);
      const canvas = document.createElement("canvas");
      canvas.width = rasterDimensions.width;
      canvas.height = rasterDimensions.height;
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
    if (!confirmCurrentIdentityBearingExport()) return;
    try {
      await navigator.clipboard.writeText(methodsReport);
      setMethodsCopyStatus("Copied");
      window.setTimeout(() => setMethodsCopyStatus(""), 2_000);
    } catch {
      setError("The browser could not copy the methods report. Download the Markdown file instead.");
    }
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
          <button type="button" className="ena-action-button ena-action-primary" onClick={() => fileInputRef.current?.click()} disabled={sourceBusy || loading}>
            <span aria-hidden="true">＋</span> {copy.data.upload}
          </button>
          <p>{copy.data.uploadHint}</p>
          <button type="button" className="ena-action-button ena-action-secondary" onClick={() => void loadSample()} disabled={sourceBusy || loading}>
            <span aria-hidden="true">◇</span> {copy.data.sample}
          </button>
          <p>{copy.data.sampleHint}</p>
          <button type="button" className="ena-action-button ena-action-secondary" onClick={() => void loadTrajectorySample()} disabled={sourceBusy || loading}>
            <span aria-hidden="true">↗</span> {copy.data.trajectorySample}
          </button>
          <p>{copy.data.trajectorySampleHint}</p>
        </div>
        {!dataset ? <div className="ena-no-dataset">{copy.data.noFile}</div> : null}
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
          disabled={!dataset || loading || sourceBusy}
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
                  {activeGroupContrast && groupDisplayControlGroups.length > 0 ? (
                    <div data-ena-group-display-result-key={groupDisplayResultKey}>
                      <OpenEnaGroupDisplayControls
                        groups={groupDisplayControlGroups}
                        settingsByGroup={groupDisplaySettingsByGroup}
                        hiddenUnitKeys={hiddenUnitKeys}
                        view={view}
                        copy={copy.groupDisplay}
                        disabled={loading || resultIsStale}
                        onSettingsChange={updateGroupDisplaySettings}
                        onUnitVisibilityChange={updateUnitPointVisibility}
                        onRevealAllHidden={() => setHiddenUnitKeys([])}
                      />
                    </div>
                  ) : null}
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
                    value={onaOrderPanelDraft}
                    onChange={updateOnaOrderPanel}
                    rows={dataset.rows}
                    unitColumns={config.unitColumns}
                    horizonColumns={config.conversationColumns}
                    columnOptions={headers
                      .filter((header) => !config.codes.includes(header))
                      .map((header) => ({ value: header, label: header }))}
                    copy={copy.ona.order}
                    disabled={loading || sourceBusy}
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
                      <OpenEnaRangeField id="open-ena-window-back" idPrefix={workspaceId} label={copy.model.back} value={config.windowSizeBack} formattedValue={String(config.windowSizeBack)} accessibleValueText={String(config.windowSizeBack)} min={1} max={21} step={1} onChange={(event) => updateConfig((current) => ({ ...current, windowSizeBack: Number(event.target.value) }))} />
                      <OpenEnaRangeField id="open-ena-window-forward" idPrefix={workspaceId} label={copy.model.forward} value={config.windowSizeForward} formattedValue={String(config.windowSizeForward)} accessibleValueText={String(config.windowSizeForward)} min={0} max={20} step={1} onChange={(event) => updateConfig((current) => ({ ...current, windowSizeForward: Number(event.target.value) }))} />
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
                          referenceRotationId: null,
                        };
                      })}>
                        <option value="svd">{copy.model.svd}</option>
                        <option value="mean" disabled={config.model !== "EndPoint"}>{copy.model.means}</option>
                      </select>
                    </label>
                  </div>
                  {config.model !== "EndPoint" ? <p className="ena-sequence-note">{copy.model.trajectoryHint}</p> : null}
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
                    disabled={loading || sourceBusy}
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
                    onClick={() => confirmOpenEnaIdentityBearingExport(
                      (message) => window.confirm(message),
                      copy.stats.identityExportConfirmation,
                      () => downloadJson(
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
                      ),
                    )}
                  >
                    {copy.longitudinal.exportJson} ↓
                  </button>
                  <button
                    type="button"
                    className="ena-action-button ena-action-secondary"
                    onClick={() => confirmOpenEnaIdentityBearingExport(
                      (message) => window.confirm(message),
                      copy.stats.identityExportConfirmation,
                      () => downloadText(
                        `open-ena-${Date.now()}-longitudinal-group-centroids.csv`,
                        longitudinalPeriodRowsToCsv(longitudinalView),
                        "text/csv;charset=utf-8",
                      ),
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
                    confirmOpenEnaIdentityBearingExport(
                      (message) => window.confirm(message),
                      copy.stats.identityExportConfirmation,
                      () => downloadText(
                        `open-ena-${Date.now()}-longitudinal-inference.csv`,
                        longitudinalInferenceRowsToCsv(longitudinalView, currentInference),
                        "text/csv;charset=utf-8",
                      ),
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
      : result?.dimensions ?? ["SVD1", "SVD2", "SVD3"];
    return (
      <div className="ena-control-content">
        <div className="ena-panel-heading">
          <p className="ena-panel-kicker">03 · Presenter</p>
          <h2>{completedResultKind === "ona" ? copy.ona.presenter.title : copy.plot.title}</h2>
          <p>{completedResultKind === "ona" ? copy.ona.presenter.description : copy.plot.description}</p>
        </div>
        <div className="ena-form-stack">
          {completedResultKind === "ona" ? (<>
            <section className="ena-ordered-presenter-boundary" role="note">
              <strong>{copy.ona.layout.directionGuide}</strong>
              <p>{copy.ona.presenter.directionBoundary}</p>
              <p>{copy.ona.layout.descriptiveBoundary}</p>
            </section>
            {result && result.groups.length >= 2 ? (
              <section
                className="ena-group-contrast-controls ena-ona-descriptive-group-controls"
                aria-label={copy.ona.presenter.groupPanelsTitle}
                data-testid="open-ena-ona-descriptive-group-controls"
              >
                <div className="ena-group-contrast-heading">
                  <h3>{copy.ona.presenter.groupPanelsTitle}</h3>
                  <p>{copy.ona.presenter.groupPanelsDescription}</p>
                </div>
                <div className="ena-two-fields">
                  <label className="ena-field">
                    <span>{copy.ona.layout.primaryPlot}</span>
                    <select
                      value={primaryGroupName || result.groups[0]?.name || ""}
                      onChange={(event) => {
                        const nextPrimary = event.target.value;
                        setPrimaryGroupName(nextPrimary);
                        if (secondaryGroupName === nextPrimary) {
                          setSecondaryGroupName(result.groups.find((group) => group.name !== nextPrimary)?.name ?? "");
                        }
                      }}
                    >
                      {result.groups.map((group) => (
                        <option key={group.name} value={group.name} disabled={group.name === secondaryGroupName}>
                          {group.name} · n = {group.count}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="ena-field">
                    <span>{copy.ona.layout.secondaryPlot}</span>
                    <select
                      value={secondaryGroupName || result.groups[1]?.name || ""}
                      onChange={(event) => {
                        const nextSecondary = event.target.value;
                        setSecondaryGroupName(nextSecondary);
                        if (primaryGroupName === nextSecondary) {
                          setPrimaryGroupName(result.groups.find((group) => group.name !== nextSecondary)?.name ?? "");
                        }
                      }}
                    >
                      {result.groups.map((group) => (
                        <option key={group.name} value={group.name} disabled={group.name === primaryGroupName}>
                          {group.name} · n = {group.count}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="ena-sets-compatibility-note">{copy.ona.layout.descriptiveBoundary}</p>
              </section>
            ) : null}
          </>) : <>
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
                    disabled={!groupDisplayExportContrast}
                    onClick={() => groupDisplayExportContrast && confirmOpenEnaIdentityBearingExport(
                      (message) => window.confirm(message),
                      copy.stats.identityExportConfirmation,
                      () => downloadJson(
                        `open-ena-${Date.now()}-group-contrast.json`,
                        buildPairwiseGroupContrastExport(groupDisplayExportContrast, {
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
                          groupDisplaySettingsByGroup: groupDisplayPresentation.settingsByGroup,
                          hiddenUnitKeys: groupDisplayPresentation.hiddenUnitKeys,
                        }),
                        true,
                      ),
                    )}
                  >
                    {copy.contrast.exportJson} ↓
                  </button>
                  <button
                    type="button"
                    className="ena-action-button ena-action-secondary"
                    disabled={!groupDisplayExportContrast}
                    onClick={() => groupDisplayExportContrast && confirmOpenEnaIdentityBearingExport(
                      (message) => window.confirm(message),
                      copy.stats.identityExportConfirmation,
                      () => downloadText(
                        `open-ena-${Date.now()}-group-contrast-edges.csv`,
                        pairwiseGroupContrastEdgesToCsv(groupDisplayExportContrast),
                        "text/csv;charset=utf-8",
                      ),
                    )}
                  >
                    {copy.contrast.exportEdges} ↓
                  </button>
                </div>
                <p className="ena-export-identifier-note">Derived contrast files retain analytic-unit and group identifiers; pseudonymize them before sharing when needed.</p>
                <button
                  type="button"
                  className="ena-inline-link ena-group-display-shortcut"
                  onClick={() => {
                    setModelTab("units");
                    setMode("model");
                  }}
                >
                  {copy.groupDisplay.shortcut}
                </button>
              </>
            ) : (
              <p className="ena-sets-compatibility-note">{groupContrastState.error}</p>
            )}
          </section>
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
          {((view === "3d" && threeDDimensions ? [
            [copy.plot.axisX, threeDDimensions[0], "x"],
            [copy.plot.axisY, threeDDimensions[1], "y"],
            [copy.plot.axisZ, threeDDimensions[2], "z"],
          ] : [
            [copy.plot.axisX, xDimension, "x"],
            [copy.plot.axisY, yDimension, "y"],
          ]) as Array<[string, string, "x" | "y" | "z"]>).map(([label, value, axis]) => (
            <label key={label} className="ena-field">
              <span>{label}</span>
              <select value={value} onChange={(event) => {
                if (view === "3d") selectAxisDimension(axis, event.target.value);
                else selectTwoDAxisDimension(axis as "x" | "y", event.target.value);
              }}>
                {dimensions.map((dimension) => <option key={dimension} value={dimension}>{dimension}</option>)}
              </select>
            </label>
          ))}
          {!activeLongitudinalView ? (
            <>
              <OpenEnaRangeField id="open-ena-edge-scale" idPrefix={workspaceId} label={copy.plot.edgeScale} value={edgeScale} formattedValue={`${edgeScale.toFixed(1)}×`} accessibleValueText={`${edgeScale.toFixed(1)}×`} min={0.1} max={4} step={0.1} onChange={(event) => setEdgeScale(Number(event.target.value))} />
              <OpenEnaRangeField id="open-ena-edge-threshold" idPrefix={workspaceId} label={copy.plot.edgeThreshold} value={edgeThreshold} formattedValue={`${Math.round(edgeThreshold * 100)}%`} accessibleValueText={`${Math.round(edgeThreshold * 100)}%`} min={0} max={0.95} step={0.05} onChange={(event) => setEdgeThreshold(Number(event.target.value))} />
            </>
          ) : null}
          <OpenEnaRangeField id="open-ena-point-scale" idPrefix={workspaceId} label={copy.plot.pointScale} value={pointScale} formattedValue={`${pointScale.toFixed(1)}×`} accessibleValueText={`${pointScale.toFixed(1)}×`} min={0.5} max={2} step={0.1} onChange={(event) => setPointScale(Number(event.target.value))} />
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
          <button
            type="button"
            className="ena-action-button ena-action-secondary ena-reset-node-layout"
            data-ena-plot-action="reset-node-layout"
            data-ena-node-layout-overrides={openEnaNodeLayoutOverrideCount(activeNodeLayout)}
            aria-label={copy.plot.resetNodeLayout}
            title={copy.plot.resetNodeLayout}
            disabled={!result || loading || openEnaNodeLayoutOverrideCount(activeNodeLayout) === 0}
            onClick={resetNodeLayout}
          >
            {copy.plot.resetNodeLayout}
          </button>
          <div className="ena-two-fields ena-figure-exports">
            <button type="button" className="ena-action-button ena-action-secondary" disabled={view === "3d" || !result} onClick={exportPlotSvg}>Export SVG ↓</button>
            <button type="button" className="ena-action-button ena-action-secondary" disabled={view === "3d" || !result} onClick={exportPlotPng}>Export PNG ↓</button>
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
          providerDescriptor={providerDescriptor}
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
            <p className="ena-panel-kicker">{copy.ona.workspace.statsKicker}</p>
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
                ) : null}
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
              <div className="ena-export-stack">
                <button
                  type="button"
                  className="ena-action-button ena-action-primary"
                  disabled={!manifest}
                  onClick={() => {
                    if (manifest && confirmCurrentIdentityBearingExport()) {
                      downloadJson(`open-ena-${Date.now()}-manifest.json`, manifest);
                    }
                  }}
                >
                  {copy.stats.export} <span aria-hidden="true">↓</span>
                </button>
                <button
                  type="button"
                  className="ena-action-button ena-action-secondary"
                  disabled={!dataset || !result || !resultConfig}
                  onClick={() => {
                    if (dataset && result && resultConfig) {
                      confirmOpenEnaIdentityBearingExport(
                        (message) => window.confirm(message),
                        copy.stats.identityExportConfirmation,
                        () => downloadJson(
                          `open-ena-${Date.now()}-results.json`,
                          buildAnalysisBundle(dataset, resultConfig, result, datasetHash, {
                            codeColors,
                            methodsDimensions: [xDimension, yDimension],
                            view,
                            methodsFlipX: flipX,
                            methodsFlipY: flipY,
                            edgeThreshold,
                            showNetworks,
                            showPoints,
                            showTrajectories: false,
                            showLabels,
                            showUnitLabels,
                            showVariance,
                            edgeScale,
                            pointScale,
                            plotZoom,
                            selectedGroupOrder: selectedPresentationGroupOrder,
                            groupContrast,
                            inference: currentInference,
                            inferenceContext: inferenceProducerContext ?? undefined,
                          }),
                          true,
                        ),
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
                      confirmOpenEnaIdentityBearingExport(
                        (message) => window.confirm(message),
                        copy.stats.identityExportConfirmation,
                        () => downloadJson(
                          `open-ena-${Date.now()}-reference-rotation.json`,
                          buildReferenceRotationPackage(dataset, resultConfig, result, datasetHash),
                          true,
                        ),
                      );
                    }
                  }}
                >
                  {copy.stats.ui.referenceRotationJson} <span aria-hidden="true">↓</span>
                </button>
              </div>
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
                  onClick={() => {
                    if (methodsReport && confirmCurrentIdentityBearingExport()) {
                      downloadText(
                        `open-ena-${Date.now()}-methods-report.md`,
                        methodsReport,
                        "text/markdown;charset=utf-8",
                      );
                    }
                  }}
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
    if (!resultTables || !result) return null;
    const tableMap = resultTables;
    const availability = openEnaResultTableAvailability({
      modelType: result.set.modelType,
      projectionReference: Boolean(result.projectionReference),
    });
    const resultTableViewModel = buildOpenEnaResultTableViewModel({
      selectedKey: resultTable,
      tables: tableMap,
      availability,
      copy: copy.resultTables,
    });
    return (
      <OpenEnaResultTables
        model={resultTableViewModel}
        onSelect={setResultTable}
        onExport={() => {
          if (!resultTableViewModel.export.disabled) {
            const publish = () => downloadText(
              `open-ena-${resultTable}.csv`,
              rowsToCsv(tableMap[resultTable]),
              "text/csv;charset=utf-8",
            );
            if (IDENTITY_BEARING_RESULT_TABLES.has(resultTable)) {
              confirmOpenEnaIdentityBearingExport(
                (message) => window.confirm(message),
                copy.stats.identityExportConfirmation,
                publish,
              );
            } else publish();
          }
        }}
      />
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
          if (ordered) {
            if (!window.confirm(copy.ona.dataView.exportConfirmation)) return;
          } else if (!confirmCurrentIdentityBearingExport()) {
            return;
          }
          const exportRows = ordered
            ? buildOpenEnaDataViewExportRows({
                columns: dataViewModel.columns,
                rows,
                groupLabels: {
                  provenance: copy.ona.dataView.provenanceGroup,
                  metadata: copy.ona.dataView.metadataGroup,
                  code: copy.ona.dataView.codeGroup,
                  "directed-edge": copy.ona.dataView.directedEdgeGroup,
                },
              })
            : rows.map((row) => row.values as Row);
          downloadText(
            `open-ena-${ordered ? "ona-local-" : ""}${Date.now()}-data-view.csv`,
            rowsToCsv(exportRows),
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
          previousPage: copy.ona.dataView.previousPage,
          nextPage: copy.ona.dataView.nextPage,
          rowsShown: copy.ona.dataView.rowsShown,
          columnsShown: copy.ona.dataView.columnsShown,
          rowPaginationLabel: copy.ona.dataView.rowPaginationLabel,
          columnPaginationLabel: copy.ona.dataView.columnPaginationLabel,
          provenanceGroup: copy.ona.dataView.provenanceGroup,
          metadataGroup: copy.ona.dataView.metadataGroup,
          codeGroup: copy.ona.dataView.codeGroup,
          directedEdgeGroup: copy.ona.dataView.directedEdgeGroup,
          yes: copy.ona.dataView.yes,
          no: copy.ona.dataView.no,
        } : undefined}
        exportClassification={ordered ? "local-identity-bearing-view" : "identity-bearing-derived"}
        emptyMessage={dataViewModel.error
          ?? (ordered ? copy.ona.dataView.empty : "No derived Data View records are available for this plot context.")}
      />
    );
  }

  const analysisPanel = mode === "data"
      ? renderDataPanel()
      : mode === "model"
        ? renderModelPanel()
        : mode === "plot"
          ? renderPlotPanel()
          : mode === "stats"
            ? renderStatsPanel()
            : null;
  const persistentRailPanels = (
    <OpenEnaPersistentRailPanels
      mode={mode}
      analysisPanel={analysisPanel}
      aiPanel={renderAiPanel()}
    />
  );
  const persistentPlotTools = (
    <OpenEnaPersistentPlotTools
      analysisKind={completedResultKind ?? "ena"}
      title={completedResultKind === "ona" ? copy.ona.presenter.title : "Plot Tools"}
      copy={completedResultKind === "ona" ? copy.ona.plotTools : undefined}
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
      nodeLayoutOverrideCount={openEnaNodeLayoutOverrideCount(activeNodeLayout)}
      resetNodeLayoutLabel={copy.plot.resetNodeLayout}
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
      onResetNodeLayout={resetNodeLayout}
      onReset={resetPlot}
      settingsOpen={plotSettingsOpen}
      onSettingsOpenChange={setPlotSettingsOpen}
      disabled={!result || loading}
    />
  );
  const longitudinalV3Context = completedResultKind === "ena"
    && result
    && resultConfig
    && dataset
    && datasetHash
    && result.set.modelType !== "EndPoint"
    ? { result, config: resultConfig, dataset, datasetHash }
    : null;

  return (
    <div
      className="open-ena-page"
      lang={workspaceIsLocalized ? undefined : "en"}
      dir={workspaceIsLocalized ? undefined : "ltr"}
    >
      <OpenEnaFallbackNotice locale={locale} />
      <section className="open-ena-workbench" aria-label="Open ENA analysis workspace" aria-busy={loading || sourceBusy}>
        <div className="ena-workbench-grid">
          <nav className="ena-tool-rail" aria-label="Analysis modes" data-ena-workbench-region="rail">
            <div className="ena-rail-brand" data-ena-rail-brand="true" aria-label="ENA.HK Open ENA">
              <span className="ena-mini-mark" aria-hidden="true"><img src="/ena-mark.svg" alt="" /></span>
              <span className="ena-rail-product">OPEN ENA</span>
              <a
                className="ena-rail-version"
                data-ena-rail-version="true"
                href={JENA_SOURCE_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={copy.workspace.jenaSourceAriaLabel(JENA_RUNTIME_VERSION, JENA_SOURCE_COMMIT.slice(0, 7))}
                title={copy.workspace.jenaSourceAriaLabel(JENA_RUNTIME_VERSION, JENA_SOURCE_COMMIT.slice(0, 7))}
              >jENA {JENA_RAIL_DISPLAY_VERSION}</a>
            </div>
            <div className="ena-rail-modes">
              {(Object.keys(copy.modes) as OpenEnaMode[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  className="ena-rail-button"
                  aria-current={mode === item ? "step" : undefined}
                  aria-label={item === "ai" ? copy.aiInterpretation.title : copy.modes[item]}
                  title={onaCapabilityDisabled && item === "ai"
                    ? copy.ona.unavailable.ai
                    : item === "ai" ? copy.aiInterpretation.title : copy.modes[item]}
                  disabled={onaCapabilityDisabled && item === "ai"}
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
                data-state={loading || sourceBusy ? "running" : result ? "result" : "ready"}
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

          {longitudinalV3Context ? (
            <OpenEnaLongitudinalWorkbenchV3
              locale={locale}
              result={longitudinalV3Context.result}
              config={longitudinalV3Context.config}
              dataset={longitudinalV3Context.dataset}
              datasetHash={longitudinalV3Context.datasetHash}
              modelResultStale={resultIsStale}
              analysisControls={persistentRailPanels}
              analysisControlsMode={mode}
            />
          ) : (
            <>
              <aside className="ena-control-panel" data-ena-workbench-region="controls">
                {persistentRailPanels}
              </aside>

          <div className="ena-visual-workspace"
            data-ena-view={view}
            data-testid="open-ena-center-surface"
          >
            <div className={`ena-visual-toolbar${view === "2d" && activeGroupContrast ? " ena-visual-toolbar-group-contrast" : ""}`}>
              <div>
                <p>{completedResultKind === "ona"
                  ? copy.ona.layout.overallPlot
                  : view === "3d" && result && threeDDimensions
                  ? activeGroupContrast
                    ? `${copy.workspace.comparison} · ${copy.views.threeD}`
                    : copy.views.threeD
                  : activeGroupContrast
                    ? copy.workspace.comparison
                    : activeLongitudinalView
                      ? copy.longitudinal.title
                      : copy.workspace.comparison}</p>
                <span>{completedResultKind === "ona"
                  ? `${resultUnitCount} ${copy.workspace.units.toLowerCase()} · ${result?.set.codes.length ?? 0} ${copy.workspace.codes.toLowerCase()} · ${copy.ona.workspace.directedSpace}`
                  : view === "3d" && result && threeDDimensions
                  ? activeGroupContrast
                    ? `${activeGroupContrast.primary.name} − ${activeGroupContrast.secondary.name} · ${threeDDimensions[0]} × ${threeDDimensions[1]} × ${threeDDimensions[2]} · linked camera`
                    : `${threeDDimensions[0]} × ${threeDDimensions[1]} × ${threeDDimensions[2]} · ${copy.plot.sameFittedSpace}`
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
                  aria-pressed={dataViewCenterSurface.dataViewPressed}
                  disabled={!dataViewAvailability.enabled}
                  onClick={() => {
                    setDataViewContext("comparison");
                    setCenterSurface(dataViewCenterSurface.dataViewPressed ? "plot" : "data");
                  }}
                  title={dataViewUnavailableCopy?.title}
                  aria-label={dataViewUnavailableCopy?.ariaLabel}
                >
                  <span aria-hidden="true">▦</span>{effectiveCenterSurface === "data"
                    ? completedResultKind === "ona" ? copy.ona.layout.overallPlot : "Comparison Plot"
                    : completedResultKind === "ona" ? copy.ona.dataView.title : "Data View"}
                </button>
                <div className="ena-analysis-toolbar-cluster">
                  <div className="ena-view-toggle" role="group" aria-label="ENA visualization options">
                    <button type="button" aria-pressed={view === "2d"} onClick={() => selectVisualizationView("2d")}>
                      <strong>{completedResultKind === "ona" ? copy.ona.workspace.twoD : copy.views.twoD}</strong>
                    </button>
                    <button
                      type="button"
                      aria-pressed={view === "3d"}
                      onClick={() => selectVisualizationView("3d")}
                      disabled={!genericThreeDAvailable}
                      aria-describedby={result && !genericThreeDAvailable
                        ? "open-ena-three-d-unavailable-reason"
                        : undefined}
                      title={!genericThreeDAvailable
                          ? copy.plot.threeDRequiresThreeDimensions
                          : undefined}
                      aria-label={!genericThreeDAvailable
                          ? `${threeDViewLabel}. ${copy.plot.threeDRequiresThreeDimensions}`
                        : `${threeDViewLabel}. ${copy.plot.threeDInteractionHint}`}
                    >
                      <strong>{threeDViewLabel}</strong>
                    </button>
                  </div>
                  {result && !genericThreeDAvailable ? (
                    <p id="open-ena-three-d-unavailable-reason" className="ena-three-d-unavailable-note">
                      {copy.plot.threeDRequiresThreeDimensions}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="ena-compact-toolbar-button ena-download-model-button"
                    disabled={!dataset || !result || !resultConfig}
                    onClick={() => {
                      if (dataset && result && resultConfig) {
                        if (completedResultKind === "ona") {
                          if (!window.confirm(copy.ona.exports.bundleConfirmation)) return;
                        } else if (!confirmCurrentIdentityBearingExport()) {
                          return;
                        }
                        downloadJson(
                          `open-ena-${Date.now()}-results.json`,
                          buildAnalysisBundle(dataset, resultConfig, result, datasetHash, {
                            codeColors,
                            methodsDimensions: completedResultKind === "ona" && view === "3d" && threeDDimensions
                              ? threeDDimensions
                              : [xDimension, yDimension],
                            view,
                            methodsFlipX: flipX,
                            methodsFlipY: flipY,
                            edgeThreshold,
                            showNetworks,
                            showPoints,
                            showTrajectories: false,
                            showLabels,
                            showGroupLabels,
                            showUnitLabels,
                            showVariance,
                            edgeScale,
                            pointScale,
                            plotZoom,
                            selectedGroupOrder: selectedPresentationGroupOrder,
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
                    {completedResultKind === "ona" ? copy.ona.workspace.downloadBundle : "Download Model"}
                  </button>
                </div>
              </div>
            </div>

            {view === "3d" && result && threeDDimensions ? (
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
                    [copy.plot.axisX, threeDDimensions[0], "x"],
                    [copy.plot.axisY, threeDDimensions[1], "y"],
                    [copy.plot.axisZ, threeDDimensions[2], "z"],
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
                  <strong>{copy.ona.workspace.staleTitle}</strong>
                  <span>{copy.ona.workspace.staleDescription}</span>
                </div>
              ) : null}
              {loading ? (
                <div className="ena-inline-progress" role="status" aria-live="polite">
                  <span>{copy.ona.workspace.rebuilding(progress, progressStage)}</span>
                  <button type="button" onClick={() => abortRef.current?.abort()}>{copy.ona.workspace.cancel}</button>
                </div>
              ) : null}
              {view === "3d" && threeDDimensions ? (
                <OpenEna3DOrderedResultLayout
                  result={result}
                  config={resultConfig}
                  primaryGroupName={primaryGroupName || null}
                  secondaryGroupName={secondaryGroupName || null}
                  centerMode={effectiveCenterSurface}
                  dataView={effectiveCenterSurface === "data" ? (
                    <div data-testid="open-ena-center-data-view">
                      {renderResultData()}
                    </div>
                  ) : null}
                  rightTools={persistentPlotTools}
                  xDimension={threeDDimensions[0]}
                  yDimension={threeDDimensions[1]}
                  zDimension={threeDDimensions[2]}
                  camera={camera}
                  edgeThreshold={edgeThreshold}
                  edgeScale={edgeScale}
                  pointScale={pointScale}
                  plotZoom={plotZoom}
                  plotResetRevision={plotResetRevision}
                  flipX={flipX}
                  flipY={flipY}
                  showPoints={showPoints}
                  showNetworks={showNetworks}
                  showLabels={showLabels}
                  showUnitLabels={showUnitLabels}
                  showVariance={showVariance}
                  codeColors={codeColors}
                  nodeTotals={result.orderedResponseNodeSummary}
                  nodeLayout={activeNodeLayout.positions}
                  onNodeMove={moveNode}
                  sharedCamera={interactive3dCamera}
                  onCameraChange={setInteractive3dCamera}
                  sharedAspectRatio={interactive3dAspectRatio}
                  onAspectRatioChange={setInteractive3dAspectRatio}
                  copy={copy}
                />
              ) : (
                <OpenEnaOrderedResultLayout
                  result={result}
                  config={resultConfig}
                  primaryGroupName={primaryGroupName || null}
                  secondaryGroupName={secondaryGroupName || null}
                  centerMode={effectiveCenterSurface}
                  dataView={effectiveCenterSurface === "data" ? (
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
                  nodeLayout={activeNodeLayout.positions}
                  onNodeMove={moveNode}
                  copy={copy.ona.layout}
                  plotCopy={copy.ona.plot}
                  svgRef={plotSvgRef}
                />
              )}
              </>
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
                {activeGroupContrast && groupDisplayError ? (
                  <div
                    className="ena-sets-compatibility-note"
                    role="alert"
                    data-ena-group-display-error="true"
                  >
                    {groupDisplayError}
                  </div>
                ) : view === "2d" && activeLongitudinalView ? (
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
                ) : view === "2d" && activeGroupContrast && activeGroupDisplay ? (
                  <OpenEnaGroupContrast
                    codeColors={codeColors}
                    contrast={activeGroupDisplay.contrast}
                    groupDisplay={activeGroupDisplay}
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
                    centerMode={effectiveCenterSurface}
                    dataView={effectiveCenterSurface === "data" ? (
                      <div data-testid="open-ena-center-data-view">
                        {renderResultData()}
                      </div>
                    ) : null}
                    rightTools={persistentPlotTools}
                    nodeLayout={activeNodeLayout.positions}
                    onNodeMove={moveNode}
                    svgRef={plotSvgRef}
                    onSwitchPlots={() => {
                      setPrimaryGroupName(secondaryGroupName);
                      setSecondaryGroupName(primaryGroupName);
                    }}
                  />
                ) : view === "3d" && threeDDimensions && activeGroupContrast && activeGroupDisplay && resultConfig?.groupColumn ? (
                  <OpenEna3DGroupContrast
                    key={`open-ena-3d-group-${result.analyzedAt}`}
                    codeColors={codeColors}
                    result={result}
                    contrast={activeGroupDisplay.contrast}
                    groupDisplay={activeGroupDisplay}
                    groupColumn={resultConfig.groupColumn}
                    xDimension={threeDDimensions[0]}
                    yDimension={threeDDimensions[1]}
                    zDimension={threeDDimensions[2]}
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
                    nodeLayout={activeNodeLayout.positions}
                    onNodeMove={moveNode}
                    centerMode={effectiveCenterSurface}
                    dataView={effectiveCenterSurface === "data" ? (
                      <div data-testid="open-ena-center-data-view">
                        {renderResultData()}
                      </div>
                    ) : null}
                    copy={copy}
                  />
                ) : view === "3d" && threeDDimensions ? (
                  <OpenEnaInteractive3DPlot
                    codeColors={codeColors}
                    result={result}
                    groupColumn={resultConfig?.groupColumn ?? null}
                    xDimension={threeDDimensions[0]}
                    yDimension={threeDDimensions[1]}
                    zDimension={threeDDimensions[2]}
                    camera={camera}
                    showPoints={showPoints}
                    showNetworks={showNetworks}
                    showLabels={showLabels}
                    showUnitLabels={showUnitLabels}
                    showVariance={showVariance}
                    showTrajectories={false}
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
                    nodeLayout={activeNodeLayout.positions}
                    onNodeMove={moveNode}
                    copy={copy}
                  />
                ) : view === "3d" ? (
                  <p className="ena-three-d-unavailable-note" role="status">
                    {copy.plot.threeDRequiresThreeDimensions}
                  </p>
                ) : (
                  <OpenEnaPlot
                    codeColors={codeColors}
                    result={result}
                    groupColumn={resultConfig?.groupColumn ?? null}
                    view={view}
                    xDimension={xDimension}
                    yDimension={yDimension}
                    zDimension={result.dimensions[2] ?? yDimension}
                    camera={camera}
                    showPoints={showPoints}
                    showNetworks={showNetworks}
                    showLabels={showLabels}
                    showUnitLabels={showUnitLabels}
                    showVariance={showVariance}
                    showTrajectories={false}
                    edgeScale={edgeScale}
                    edgeThreshold={edgeThreshold}
                    pointScale={pointScale}
                    plotZoom={plotZoom}
                    flipX={flipX}
                    flipY={flipY}
                    nodeLayout={activeNodeLayout.positions}
                    onNodeMove={moveNode}
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
                        <button type="button" className="ena-action-button ena-action-primary" onClick={() => void loadSample()} disabled={sourceBusy || loading}>{copy.data.sample}</button>
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
            </>
          )}
        </div>
      </section>
    </div>
  );
}
