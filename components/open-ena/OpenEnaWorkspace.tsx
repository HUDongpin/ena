"use client";
import { buildUnitDisplayLabelIndexV3, hiddenUnitLabelsV3 } from "../../lib/open-ena/hidden-unit-display-v3";
import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { Row } from "jena-js";
import type { Locale } from "@/lib/i18n";
import { getOpenEnaAuthCopy } from "@/lib/open-ena-auth-copy";
import OpenEnaFallbackNotice from "./OpenEnaFallbackNotice";
import OpenEnaPersistentPlotTools from "./OpenEnaPersistentPlotTools";
import { getOpenEnaCopy } from "@/lib/open-ena-i18n";
import { rowsToCsv, resolveOpenEnaPlotExportDimensions, resolveOpenEnaPlotRasterDimensions, openEnaResultTableFocusTarget, resolveOpenEnaResultTableRovingKey, type OpenEnaResultTableKey, type OpenEnaResultTableViewModel } from "@/lib/open-ena/export";
import { parseCsv } from "@/lib/open-ena/csv";
import { parseXlsx, codedDataFileKind } from "@/lib/open-ena/spreadsheet";
import { sha256TextV3, canonicalJsonV3 } from "@/lib/open-ena/model-v3/canonical-json";
import { JENA_RUNTIME_VERSION, JENA_SOURCE_COMMIT, JENA_SOURCE_URL, SAMPLE_DATASET_URL, TRAJECTORY_SAMPLE_DATASET_URL, type OpenEnaMode, type CameraPreset, type ParsedDataset } from "@/lib/open-ena/types";
import { buildPresentationArtifactV3 } from "@/lib/open-ena/presentation-artifact-v3";
import { parseBundleJsonV3 } from "@/lib/open-ena/bundle-json-v3";
import { assertPresentationArtifactContractV3 } from "@/lib/open-ena/bundle-contract-v3";
import { prepareWorkspacePresentationV3, WORKSPACE_PRESET_SCOPE_V3 } from "@/lib/open-ena/workspace-presentation-v3";
import { presentBoundResultV3, presentBoundGroupDisplayV3 } from "@/lib/open-ena/bound-presentation-v3";
import { exportContrastV3 } from "@/lib/open-ena/contrast-export-v3";
import { buildContrastV3 } from "@/lib/open-ena/contrasts";
import OpenEnaDataView, { type OpenEnaDataViewContext } from "./OpenEnaDataView";
import { buildDataViewPresentationV3 } from "@/lib/open-ena/data-view-presentation-v3";
import { buildHistoricalDataViewV3, buildDataViewV3 } from "@/lib/open-ena/data-view-export";
import { buildTrajectoryPresentationV3 } from "@/lib/open-ena/trajectory-presentation-v3";
import { buildLongitudinalViewV3, type OpenEnaTrajectoryControlsV3 } from "@/lib/open-ena/longitudinal-bound-v3";
import { runOpenEnaInferenceV3, runOpenEnaTrajectoryInferenceV3 } from "@/lib/open-ena/inference-v2";
import type { OpenEnaEndpointControlsV3 } from "@/lib/open-ena/inference-consumers-v3";
import { buildAiInterpretationReviewV3 } from "@/lib/open-ena/ai-interpretation";
import { buildHistoricalOnaViewV3, buildOnaBoundViewV3 } from "@/lib/open-ena/ona-bound-view-v3";
import { exportNativeStatisticsV3, type NativeInferenceV3 } from "@/lib/open-ena/native-statistics-export-v3";
import { buildMethodsReportV3 } from "@/lib/open-ena/methods-v3";
import { exportCanonicalConfigV3, exportDraftV3, exportCurrentAnalysisV3, exportStaleAuditV3, exportReferenceV2, type ExportFileDescriptorV3 } from "@/lib/open-ena/model-artifact-exports-v3";
import { captureAnalysisSetV3, compareAnalysisSetsV3, upsertAnalysisSetV3, type OpenEnaAnalysisSetV3 } from "@/lib/open-ena/sets-bound-v3";
import { openEnaCodeColorPair } from "@/lib/open-ena/code-color-presets";
import { codeColorFor } from "@/lib/open-ena/plot-style";
import type { OpenEnaNodeLayoutPositions, OpenEnaNodeDimensionPosition } from "@/lib/open-ena/node-layout";
import { cameraForPreset, type OpenEna3dCamera, type OpenEna3dAspectRatio } from "@/lib/open-ena/plot3d";
import { resolveOpenEnaGroupDisplayOptions } from "@/lib/open-ena/group-display";
import { prepareTeachingSampleV3 } from "@/lib/open-ena/sample-source-v3";
import { prepareTypedCsvSourceV3, previewSourceTypesV3, SOURCE_TYPING_EXPLANATION_V3, type SourceTypeDeclarationsV3, type SourceColumnTypeV3 } from "@/lib/open-ena/source-preparation-v3";
import type { PresentationArtifactV3, BoundOnaResultV3, BoundStandardResultV3, ModelWorkspaceDraftsV3 } from "@/lib/open-ena/model-v3/types";
import OpenEnaPlot from "./OpenEnaPlot";
import OpenEnaInteractive3DPlot from "./OpenEnaInteractive3DPlot";
import OpenEnaGroupContrast from "./OpenEnaGroupContrast";
import OpenEna3DGroupContrast from "./OpenEna3DGroupContrast";
import OpenEnaOrderedResultLayout from "./OpenEnaOrderedResultLayout";
import OpenEna3DOrderedResultLayout from "./OpenEna3DOrderedResultLayout";
import OpenEnaAiInterpretation from "./OpenEnaAiInterpretation";
import OpenEnaCodeColorPicker from "./OpenEnaCodeColorPicker";
import { OpenEnaNativeStatsPanelV3 } from "./model-v3/OpenEnaNativeStatsPanelV3";
import { OpenEnaModelTabsV3, type OpenEnaModelScientificSummaryV3 } from "./model-v3/OpenEnaModelTabsV3";
import { OpenEnaUnitsPanelV3 } from "./model-v3/OpenEnaUnitsPanelV3";
import { OpenEnaHorizonsPanelV3 } from "./model-v3/OpenEnaHorizonsPanelV3";
import { OpenEnaWindowsPanelV3, type OpenEnaReferenceSelectionPreviewV3 } from "./model-v3/OpenEnaWindowsPanelV3";
import { OpenEnaCodesPanelV3, createOpenEnaCodesPreviewV3 } from "./model-v3/OpenEnaCodesPanelV3";
import { OpenEnaImportPreviewV3 } from "./model-v3/OpenEnaImportPreviewV3";
import { useOpenEnaWorkspaceV3, emptyWorkspaceDraftsV3, sameScientificContextV3, workspaceDraftExportableV3, type WorkspaceWorkerV3 } from "./model-v3/workspace-controller";
import { buildWorkspacePreviewsV3 } from "./model-v3/workspace-previews";
import { modelScientificContextV3 } from "./model-v3/model-state";

interface OpenEnaWorkspaceProps {
  locale: Locale;
  providerDescriptor?: { provider: string; model: string };
  initialSource?: { dataset: ParsedDataset; datasetSha256: string; drafts: ModelWorkspaceDraftsV3 };
  worker?: WorkspaceWorkerV3;
}

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


function ResearchTableV3({ rows, label }: { rows: readonly object[]; label: string }) {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return <div className="ena-result-table-wrap" role="region" aria-label={label} tabIndex={0}><table>
    <caption>{label} ({rows.length})</caption><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
    <tbody>{rows.slice(0, 100).map((row, index) => <tr key={index}>{columns.map((column) => {
      const value = (row as Record<string, unknown>)[column];
      return <td key={column}>{value === null || value === undefined ? "Unavailable" : typeof value === "object" ? JSON.stringify(value) : String(value)}</td>;
    })}</tr>)}</tbody></table>{rows.length > 100 && <p>Showing the first 100 rows. Exports retain all rows.</p>}</div>;
}

export default function OpenEnaWorkspace({ locale, providerDescriptor, initialSource, worker }: OpenEnaWorkspaceProps) {
  const workspaceId = useId();
  const copy = getOpenEnaCopy(locale);
  const modelV3Copy = copy.modelV3;
  const authCopy = getOpenEnaAuthCopy(locale);
  const controller = useOpenEnaWorkspaceV3({ initial: initialSource, worker });
  const { state, dispatch, dispatchModel, context, currentCompilation, currentPlan } = controller;
  const modelState = state.model, family = modelState.drafts.activeFamily, draft = modelState.drafts[family];
  const dataset = state.dataset, result = modelState.result;
  const baseDisplay = modelState.display[result?.configuration.analysisFamily ?? family];
  const display = useMemo(() => {
    if (!state.presetHiddenGroups || state.presetHiddenGroups.resultHash !== result?.binding.scientificResultSha256) return baseDisplay;
    return { ...baseDisplay, groups: { ...baseDisplay.groups, ...Object.fromEntries(state.presetHiddenGroups.tokens.map((token) => [token, { ...resolveOpenEnaGroupDisplayOptions(baseDisplay.groups, token), showUnitPoints: false, showMean: false, showConfidenceIntervals: false, showOutlierIntervals: false }])) } };
  }, [baseDisplay, state.presetHiddenGroups, result]);
  const current = modelState.resultStatus === "current" && currentPlan !== null;
  const [mode, setMode] = useState<OpenEnaMode>("data");
  const [dataViewContext, setDataViewContext] = useState<OpenEnaDataViewContext>("comparison");
  const [centerSurface, setCenterSurface] = useState<"plot" | "data">("plot");
  const [textScale, setTextScale] = useState(1);
  const [showGroupLabels, setShowGroupLabels] = useState(true);
  const [unitCircle, setUnitCircle] = useState(false);
  const [plotSettingsOpen, setPlotSettingsOpen] = useState(false);
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [modelNavigation, setModelNavigation] = useState<{ tab: "units" | "horizons" | "windows" | "codes"; serial: number }>({ tab: "units", serial: 0 });
  const [error, setError] = useState("");
  const [sourceBusy, setSourceBusy] = useState(false);
  const [sourcePreview, setSourcePreview] = useState<{ text: string; dataset: ParsedDataset; types: SourceTypeDeclarationsV3 } | null>(null);
  const [derivative, setDerivative] = useState<Awaited<ReturnType<typeof prepareTypedCsvSourceV3>> | null>(null);
  const [originalSource, setOriginalSource] = useState<{ text: string; name: string } | null>(null);
  const sourceGeneration = useRef(0);
  const [previews, setPreviews] = useState<Awaited<ReturnType<typeof buildWorkspacePreviewsV3>>>({ units: { availability: "unavailable" }, horizons: { availability: "unavailable" } });
  const [activeCodeColor, setActiveCodeColor] = useState<{ code: string; context: typeof context } | null>(null);
  const activeColorIntent = activeCodeColor && sameScientificContextV3(activeCodeColor.context, context) && draft.codes.includes(activeCodeColor.code) ? activeCodeColor : null;
  const [primaryGroupName, setPrimaryGroupName] = useState("");
  const [secondaryGroupName, setSecondaryGroupName] = useState("");
  const [axes, setAxes] = useState<string[]>([]);
  const [showPoints, setShowPoints] = useState(true), [showNetworks, setShowNetworks] = useState(true), [showLabels, setShowLabels] = useState(true);
  const [showUnitLabels, setShowUnitLabels] = useState(false), [showVariance, setShowVariance] = useState(true), [showTrajectories, setShowTrajectories] = useState(false);
  const [showGroupCentroidPaths, setShowGroupCentroidPaths] = useState(true);
  const [endpointsOnly, setEndpointsOnly] = useState(false);
  const [visibleHorizons, setVisibleHorizons] = useState<string[] | null>(null);
  const [threeDAxes, setThreeDAxes] = useState<string[]>([]);
  const [edgeThreshold, setEdgeThreshold] = useState(0), [edgeScale, setEdgeScale] = useState(1), [pointScale, setPointScale] = useState(1), [plotZoom, setPlotZoom] = useState(1);
  const [flipX, setFlipX] = useState(false), [flipY, setFlipY] = useState(false);
  const [camera, setCamera] = useState<OpenEna3dCamera | null>(null);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("isometric");
  const cameraPositionOptions: Array<[CameraPreset, string]> = [["isometric", copy.plot.default3dCamera], ["xy", copy.plot.xy], ["xz", copy.plot.xz], ["yz", copy.plot.yz], ["yx", copy.plot.yx], ["zx", copy.plot.zx], ["zy", copy.plot.zy]];
  const [aspectRatio, setAspectRatio] = useState<OpenEna3dAspectRatio | null>(null);
  const [presetPreview, setPresetPreview] = useState<PresentationArtifactV3 | null>(null);
  const presetSerial = useRef(0);
  const [nodeOverrides, setNodeOverrides] = useState<{ hash: string; positions: OpenEnaNodeLayoutPositions }>({ hash: "", positions: new Map() });
  const [hiddenUnitKeys, setHiddenUnitKeys] = useState<string[]>([]);
  const [nativeContrast, setNativeContrast] = useState<{ key: string; value: Awaited<ReturnType<typeof buildContrastV3>> } | null>(null);
  const [consumerError, setConsumerError] = useState("");
  const [checkedDataView, setCheckedDataView] = useState<Awaited<ReturnType<typeof buildDataViewV3>> | null>(null);
  const [inferenceDesign, setInferenceDesign] = useState<"independent" | "paired" | "repeated">("independent");
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>([]);
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [inference, setInference] = useState<{ key: string; value: NativeInferenceV3 } | null>(null);
  const [inferenceBusy, setInferenceBusy] = useState(false);
  const [aiReview, setAiReview] = useState<{ key: string; value: Awaited<ReturnType<typeof buildAiInterpretationReviewV3>> } | null>(null);
  const [aiLimitation, setAiLimitation] = useState("");
  const [sets, setSets] = useState<OpenEnaAnalysisSetV3[]>([]);
  const [setComparison, setSetComparison] = useState<ReturnType<typeof compareAnalysisSetsV3> | null>(null);
  const plotSvgRef = useRef<SVGSVGElement>(null);
  const latest = useRef({ state, currentPlan, current }); latest.current = { state, currentPlan, current };
  const resultHash = result?.binding.scientificResultSha256 ?? "";
  const presentation = useMemo(() => result ? presentBoundResultV3(result) : null, [result]);
  const completedResultKind = result?.configuration.analysisFamily;
  const supportedAxes = presentation?.result.dimensions ?? [];
  const twoDAxes = axes.length === 2 && axes.every((axis) => supportedAxes.includes(axis)) ? axes : supportedAxes.slice(0, 2);
  const availableThreeDAxes = threeDAxes.length === 3 && threeDAxes.every((axis) => supportedAxes.includes(axis)) ? threeDAxes : supportedAxes.slice(0, 3);
  const threeDDimensions = availableThreeDAxes.length === 3 && new Set(availableThreeDAxes).size === 3 ? availableThreeDAxes : null;
  const selectedAxes = view === "3d" && threeDDimensions ? threeDDimensions : twoDAxes;
  const xDimension = selectedAxes[0] ?? "", yDimension = selectedAxes[1] ?? "", zDimension = selectedAxes[2] ?? "";
  const genericThreeDAvailable = threeDDimensions !== null;
  const groups = result?.executionProvenance.identityDictionary.groups ?? [];
  const primary = groups.find((group) => group.token === primaryGroupName) ?? null;
  const secondary = groups.find((group) => group.token === secondaryGroupName) ?? null;
  const horizons = result?.executionProvenance.identityDictionary.horizons ?? [];
  const periods = selectedPeriods.map((token) => horizons.find((horizon) => horizon.token === token)?.fields).filter((value) => value !== undefined);
  const endpointControls: OpenEnaEndpointControlsV3 | null = primary && secondary && primary.token !== secondary.token && twoDAxes.length === 2
    ? { primaryGroup: primary.fields[0].value, secondaryGroup: secondary.fields[0].value, axes: [twoDAxes[0], twoDAxes[1]] } : null;
  const isTrajectory = result?.configuration.analysisFamily === "standard" && result.configuration.analysis.model.type !== "EndPoint";
  const trajectoryControls: OpenEnaTrajectoryControlsV3 | null = isTrajectory && twoDAxes.length === 2 && (inferenceDesign === "independent" ? endpointControls && periods[0] && periods.length === 1 : identityConfirmed && (inferenceDesign === "paired" ? periods.length === 2 : periods.length >= 3))
    ? { axes: [twoDAxes[0], twoDAxes[1]], identityConfirmed, request: inferenceDesign === "independent"
      ? { kind: "trajectory-independent-period", period: periods[0], primaryGroup: endpointControls!.primaryGroup, secondaryGroup: endpointControls!.secondaryGroup }
      : inferenceDesign === "paired" ? { kind: "trajectory-paired-periods", group: primary?.fields[0].value ?? null, earlierPeriod: periods[0], laterPeriod: periods[1], cohortPolicy: "pairwise-complete" }
        : { kind: "trajectory-repeated-periods", group: primary?.fields[0].value ?? null, periods, cohortPolicy: "all-period-complete", posthocContrasts: "all-period-pairs" } } : null;
  const controls = isTrajectory ? trajectoryControls : endpointControls;
  const consumerKey = canonicalJsonV3({ binding: result?.binding ?? null, plan: currentPlan?.header.executionPlanSha256 ?? null, current, controls });
  const consumerKeyRef = useRef(consumerKey); consumerKeyRef.current = consumerKey;
  const activeInference = inference?.key === consumerKey && current ? inference.value : null;
  const activeAiReview = aiReview?.key === consumerKey && current ? aiReview.value : null;
  const activeContrast = nativeContrast?.key === consumerKey && current ? nativeContrast.value : null;
  const groupDisplay = useMemo(() => activeContrast ? presentBoundGroupDisplayV3(activeContrast, display.groups, hiddenUnitKeys, display.allGroupsSuppressed) : null, [activeContrast, display.groups, hiddenUnitKeys, display.allGroupsSuppressed]);
  const contrast = groupDisplay?.contrast ?? null;
  const onaView = useMemo(() => result?.configuration.analysisFamily === "ona" ? buildHistoricalOnaViewV3(result as BoundOnaResultV3, primary?.token ?? null) : null, [result, primaryGroupName]);
  const dataViewGroup = dataViewContext === "primary" ? primary?.fields[0].value ?? null : dataViewContext === "secondary" ? secondary?.fields[0].value ?? null : null;
  const dataViewPresentation = useMemo(() => result ? buildDataViewPresentationV3(result, dataViewGroup) : null, [result, dataViewContext, primary, secondary]);
  const historicalData = useMemo(() => result ? buildHistoricalDataViewV3(result) : null, [result]);
  const longitudinal = useMemo(() => result && isTrajectory ? buildLongitudinalViewV3(result as BoundStandardResultV3) : null, [result, isTrajectory]);
  const contextKey = canonicalJsonV3(context);
  const diagnostics = currentCompilation?.result.diagnostics ?? [];
  const localizedDiagnostic = (diagnostic: { readonly id: string; readonly severity: "error" | "warning" | "information"; readonly scope: "dataset" | "units" | "horizons" | "windows" | "codes" | "rotation" | "reference" | "resources" | "migration" | "model"; readonly fieldPath?: string; readonly evidence?: { readonly totalCount: number; readonly sampleLimit: number; readonly truncated: boolean } }) => modelV3Copy.tabs.diagnostics.localize(diagnostic as Parameters<typeof modelV3Copy.tabs.diagnostics.localize>[0]);
  const modelCopy = modelV3Copy.tabs;
  const sourceTypingPreview = useMemo(() => sourcePreview ? previewSourceTypesV3(sourcePreview.dataset, sourcePreview.types) : null, [sourcePreview]);
  const plan = currentCompilation?.plan;
  const referencePreview: OpenEnaReferenceSelectionPreviewV3 = useMemo(() => {
    const selection = modelState.drafts.standard.rotation;
    if (family !== "standard" || selection.type !== "reference") return { availability: "unavailable" };
    const reference = state.references.find((r) => r.referenceId === selection.referenceId && r.contentSha256 === selection.expectedContentSha256);
    if (!reference || !plan?.reference) return { availability: "unavailable", context };
    const projection = result?.configuration.analysisFamily === "standard" && current && result.binding.referenceContentSha256 === reference.contentSha256 ? result.executionProvenance.projection : null;
    return { availability: "available", context, referenceId: reference.referenceId, contentSha256: reference.contentSha256, displayName: reference.displayName,
      sourceFit: { method: reference.fit.method, population: reference.fit.population, observationCount: reference.fit.observationCount },
      basis: { codeCount: reference.basis.codes.length, edgeCount: reference.basis.edges.length, rotationColumns: reference.geometry.rotationColumns },
      fixedCentering: { centerAlignToOrigin: reference.fit.centerAlignToOrigin }, compatibility: { status: plan?.reference ? "compatible" : "incompatible", reasons: [] },
      targetProjection: projection && "variance" in projection ? { status: "available", rank: projection.rank, variance: projection.variance } : { status: "not-adopted" } };
  }, [contextKey, state.references, plan, result, current]);

  useEffect(() => {
    if (!dataset) return;
    let active = true;
    void buildWorkspacePreviewsV3(dataset, modelState, currentCompilation).then((value) => { if (active) setPreviews(value); });
    return () => { active = false; };
  }, [contextKey, currentCompilation, dataset]);
  useEffect(() => {
    setPrimaryGroupName((previous) => groups.some((group) => group.token === previous) ? previous : groups[0]?.token ?? ""); setSecondaryGroupName((previous) => groups.some((group) => group.token === previous) ? previous : groups[1]?.token ?? ""); setSelectedPeriods([]); setIdentityConfirmed(false); setAxes([]); setThreeDAxes([]); setVisibleHorizons(null); setEndpointsOnly(false); setHiddenUnitKeys([]);
  }, [resultHash]);
  useEffect(() => {
    let active = true;
    if (!result || !currentPlan || !current) return;
    void buildDataViewV3(result, currentPlan).then((value) => { if (active) setCheckedDataView(value); }).catch((e: unknown) => { if (active) setConsumerError(String(e)); });
    if (!isTrajectory && endpointControls && result.configuration.analysisFamily === "standard") {
      void buildContrastV3(result, currentPlan, endpointControls).then((value) => { if (active) { setNativeContrast({ key: consumerKey, value }); setConsumerError(""); } }).catch((e: unknown) => { if (active) setConsumerError(e instanceof Error ? e.message : String(e)); });
    }
    return () => { active = false; };
  }, [consumerKey]);
  useEffect(() => {
    let active = true;
    if (!activeInference || !result || !currentPlan || !controls) return;
    const selection = activeInference.kind === "open-ena-endpoint-inference"
      ? { locale, inference: activeInference, controls: controls as OpenEnaEndpointControlsV3 }
      : { locale, inference: activeInference, controls: controls as OpenEnaTrajectoryControlsV3 };
    void buildAiInterpretationReviewV3(result, currentPlan, selection).then((value) => { if (active) { setAiReview({ key: consumerKey, value }); setAiLimitation(""); } }).catch((error: unknown) => { if (active) setAiLimitation(error instanceof Error ? error.message : String(error)); });
    return () => { active = false; };
  }, [activeInference, consumerKey, locale]);
  useEffect(() => {
    if (modelNavigation.serial) {
      document.getElementById(`ena-model-tab-${modelNavigation.tab}`)?.click();
      requestAnimationFrame(() => document.querySelector<HTMLElement>(modelNavigation.tab === "units" ? '.ena-model-units-v3-means' : '.ena-model-windows-v3 select')?.focus());
    }
  }, [modelNavigation]);

  async function attempt(work: () => Promise<void>) { try { setError(""); await work(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }
  function saveDescriptor(value: ExportFileDescriptorV3) { downloadText(value.filename, new TextDecoder().decode(value.bytes), value.mediaType); }
  function saveDerivative(value: NonNullable<typeof derivative>) {
    const url = URL.createObjectURL(new Blob([value.bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = value.dataset.name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function installSource(value: { dataset: ParsedDataset; datasetSha256: string }, drafts = emptyWorkspaceDraftsV3(), autoRun = false) {
    dispatch({ type: "install-source", ...value, drafts, autoRun }); setSourcePreview(null); setMode("model");
  }
  async function openCodedData(file: File) {
    dispatch({ type: "clear-auto-run-intent" });
    const generation = ++sourceGeneration.current;
    setSourceBusy(true);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Coded data exceeds 5 MB.");
      if (codedDataFileKind(file.name) === "csv") {
        const text = await file.text();
        const source = parseCsv(text, { name: file.name, sizeBytes: file.size, source: "upload" });
        if (generation !== sourceGeneration.current) return;
        setSourcePreview({ text, dataset: source, types: Object.fromEntries(source.headers.map((column) => [column, "text"])) });
      } else {
        const bytes = await file.arrayBuffer();
        const value = await parseXlsx(bytes, { name: file.name, sizeBytes: file.size, source: "upload" });
        const datasetSha256 = await sha256TextV3(value.normalizedText);
        if (generation !== sourceGeneration.current) return;
        installSource({ dataset: value.dataset, datasetSha256 }); setDerivative(null); setOriginalSource(null);
      }
    } finally { if (generation === sourceGeneration.current) setSourceBusy(false); }
  }
  async function confirmSourceTyping() {
    const preview = sourcePreview; if (!preview) return;
    const generation = ++sourceGeneration.current; setSourceBusy(true);
    try {
      const value = await prepareTypedCsvSourceV3(preview.text, preview.dataset, preview.types, new Date());
      if (generation !== sourceGeneration.current) return;
      setDerivative(value); setOriginalSource({ text: preview.text, name: preview.dataset.name }); installSource(value);
    } finally { if (generation === sourceGeneration.current) setSourceBusy(false); }
  }
  async function loadSample(trajectory = false) {
    const generation = ++sourceGeneration.current; setSourceBusy(true);
    try {
      const url = trajectory ? TRAJECTORY_SAMPLE_DATASET_URL : SAMPLE_DATASET_URL;
      const response = await fetch(url, { cache: "no-store" }); if (!response.ok) throw new Error("Sample source unavailable.");
      const text = await response.text();
      const value = await prepareTeachingSampleV3(text, trajectory ? "trajectory" : "endpoint", new Date());
      if (generation !== sourceGeneration.current) return;
      setDerivative(value); setOriginalSource(value.original); installSource(value, value.drafts, true);
    } finally { if (generation === sourceGeneration.current) setSourceBusy(false); }
  }
  async function runInference() {
    if (!result || !currentPlan || !current || !controls) return;
    const key = consumerKey; setInferenceBusy(true);
    try {
      const value = isTrajectory ? await runOpenEnaTrajectoryInferenceV3(result, currentPlan, controls as OpenEnaTrajectoryControlsV3)
        : await runOpenEnaInferenceV3(result, currentPlan, controls as OpenEnaEndpointControlsV3);
      if (key === consumerKeyRef.current) setInference({ key, value });
    } finally { setInferenceBusy(false); }
  }
  function confirmCurrentIdentityBearingExport() { return window.confirm(copy.stats.identityExportConfirmation); }
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

  const renderedSource = presentation?.codeSourceByRenderedCode ?? {};
  const codeColors = Object.fromEntries(Object.entries(renderedSource).map(([rendered, source]) => [rendered, display.codeColors[source] ?? codeColorFor(undefined, source)]));
  const sourcePositions = nodeOverrides.hash === resultHash ? nodeOverrides.positions : new Map<string, OpenEnaNodeDimensionPosition>();
  const nodeLayout: OpenEnaNodeLayoutPositions = new Map(Object.entries(renderedSource).flatMap(([rendered, source]) => sourcePositions.has(source) ? [[rendered, sourcePositions.get(source)!] as const] : []));
  const moveNode = (rendered: string, position: OpenEnaNodeDimensionPosition) => {
    const source = renderedSource[rendered]; if (!Object.hasOwn(renderedSource, rendered) || !source) throw new Error("Unknown rendered Code identity.");
    setNodeOverrides((previous) => { const positions = new Map(previous.hash === resultHash ? previous.positions : []); positions.set(source, new Map([...(positions.get(source) ?? []), ...position])); return { hash: resultHash, positions }; });
  };
  const graph = { showCodeGraph: !display.allCodesSuppressed, codeVisibility: display.codeVisibility, codeSourceByRenderedCode: renderedSource, codeLabelByRenderedCode: presentation?.codeLabelByRenderedCode };
  const trajectoryPresentation = useMemo(() => result && isTrajectory ? buildTrajectoryPresentationV3(result as BoundStandardResultV3, { showCentroidPaths: showGroupCentroidPaths, endpointsOnly, visibleHorizons, hiddenUnitKeys, groupSettingsByToken: baseDisplay.groups }) : undefined, [result, isTrajectory, showGroupCentroidPaths, endpointsOnly, visibleHorizons, hiddenUnitKeys, baseDisplay.groups]);
  const hasHiddenUnits = hiddenUnitKeys.length > 0;
  const hiddenUnitLabelIndex = useMemo(() => result && hasHiddenUnits ? buildUnitDisplayLabelIndexV3(result) : null, [result, hasHiddenUnits]);
  const hiddenUnits = useMemo(() => hiddenUnitLabelsV3(hiddenUnitLabelIndex, hiddenUnitKeys), [hiddenUnitLabelIndex, hiddenUnitKeys]);
  const plotResult = useMemo(() => presentation && result ? { ...presentation.result, trajectoryPresentation, groupPresentation: {
    allSuppressed: display.allGroupsSuppressed,
    settingsByName: Object.fromEntries(result.executionProvenance.identityDictionary.groups.map((group) => [group.displayLabel, resolveOpenEnaGroupDisplayOptions(display.groups, group.token)])),
    hiddenUnits,
  } } : null, [presentation, result, trajectoryPresentation, display.groups, display.allGroupsSuppressed, hiddenUnits]);
  function exportPresentation() {
    if (!result) return;
    const preset = buildPresentationArtifactV3(result, {
      hiddenCodes: Object.values(renderedSource).filter((code) => display.codeVisibility[code] === false),
      hiddenGroups: groups.filter((group) => { const options = resolveOpenEnaGroupDisplayOptions(display.groups, group.token); return (!options.showUnitPoints && !options.showMean && !options.showConfidenceIntervals && !options.showOutlierIntervals); }).map((group) => group.fields[0].value),
      codeColors: Object.fromEntries(Object.values(renderedSource).map((source) => [source, display.codeColors[source] ?? codeColorFor(undefined, source)])),
      nodeOverrides: [...sourcePositions].map(([code, coordinates]) => ({ code, coordinates: Object.fromEntries(coordinates) })),
      dimensions: [...selectedAxes], ...(camera ? { camera3d: camera } : {}),
      layerOptions: { showPoints, showNetworks, showTrajectories, showLabels, showGroupLabels, showUnitLabels, showVariance, endpointsOnly, flipX, flipY, edgeThreshold, edgeScale, pointScale, plotZoom },
    });
    downloadJson("bound-presentation-preset.json", preset);
  }
  async function previewPresentation(file: File) {
    const intent = ++presetSerial.current, capturedContext = context, capturedResult = result;
    if (file.size > 16 * 1024 * 1024) throw new Error("Presentation preset exceeds 16 MiB.");
    const parsed = parseBundleJsonV3(await file.text()) as PresentationArtifactV3;
    assertPresentationArtifactContractV3(parsed);
    if (intent !== presetSerial.current || latest.current.state.model.result !== capturedResult || !sameScientificContextV3(capturedContext, modelScientificContextV3(latest.current.state.model))) return;
    setPresetPreview(parsed);
  }
  const presetCodesCompatible = !result || result.executionProvenance.labels.codes.every((code) => draft.codes.includes(code.sourceColumn));
  function applyPresentation() {
    if (!presetPreview || !result || completedResultKind !== family || !presetCodesCompatible || display.allCodesSuppressed || display.allGroupsSuppressed) return;
    const prepared = prepareWorkspacePresentationV3(result, presetPreview);
    if (prepared.status !== "applied") return;
    const value = prepared.presentation, layers = value.layerOptions ?? {};
    dispatch({ type: "apply-display-preset", context, resultHash, codeVisibility: prepared.codeVisibility, codeColors: prepared.codeColors, hiddenGroupTokens: prepared.hiddenGroupTokens });
    setNodeOverrides({ hash: resultHash, positions: prepared.nodePositions });
    if (value.dimensions.length === 3) { setThreeDAxes([...value.dimensions]); setView("3d"); } else { setAxes([...value.dimensions]); setView("2d"); }
    if (value.camera3d) setCamera(value.camera3d);
    if (layers.showPoints !== undefined) setShowPoints(layers.showPoints);
    if (layers.showNetworks !== undefined) setShowNetworks(layers.showNetworks);
    if (layers.showTrajectories !== undefined) setShowTrajectories(layers.showTrajectories);
    if (layers.showLabels !== undefined) setShowLabels(layers.showLabels);
    if (layers.showGroupLabels !== undefined) setShowGroupLabels(layers.showGroupLabels);
    if (layers.showUnitLabels !== undefined) setShowUnitLabels(layers.showUnitLabels);
    if (layers.showVariance !== undefined) setShowVariance(layers.showVariance);
    if (layers.endpointsOnly !== undefined) setEndpointsOnly(layers.endpointsOnly);
    if (layers.flipX !== undefined) setFlipX(layers.flipX);
    if (layers.flipY !== undefined) setFlipY(layers.flipY);
    if (layers.edgeThreshold !== undefined) setEdgeThreshold(layers.edgeThreshold);
    if (layers.edgeScale !== undefined) setEdgeScale(layers.edgeScale);
    if (layers.pointScale !== undefined) setPointScale(layers.pointScale);
    if (layers.plotZoom !== undefined) setPlotZoom(layers.plotZoom);
    setPresetPreview(null);
  }
  const plotProps = { ...graph, codeColors, groupDisplay: groupDisplay ?? undefined, groupColumn: presentation?.config.groupColumn ?? null,
    xDimension, yDimension, zDimension, camera: cameraPreset, showPoints: showPoints && !display.allGroupsSuppressed,
    showNetworks: showNetworks && !display.allGroupsSuppressed, showLabels, showUnitLabels, showVariance, showTrajectories,
    edgeScale, edgeThreshold, pointScale, plotZoom, flipX, flipY, nodeLayout, onNodeMove: moveNode, copy };
  const previewUnitsCurrent = previews.units.availability === "available" && sameScientificContextV3(previews.units.context, context);
  const previewHorizonsCurrent = previews.horizons.availability === "available" && sameScientificContextV3(previews.horizons.context, context);
  const modelSummary: OpenEnaModelScientificSummaryV3 = {
    context, configuration: family === "standard" ? { family, model: modelState.drafts.standard.model, window: modelState.drafts.standard.windowType, weighting: modelState.drafts.standard.weighting, rotation: modelState.drafts.standard.rotation.type }
      : { family, model: "EndPoint", window: "MovingStanzaWindow", weighting: "frequency-sum", rotation: "svd" },
    counts: { units: previewUnitsCurrent && previews.units.availability === "available" ? { availability: "available", value: previews.units.units.length } : { availability: "unavailable" },
      horizons: previewHorizonsCurrent && previews.horizons.availability === "available" ? { availability: "available", value: previews.horizons.horizons.length } : { availability: "unavailable" },
      groups: previewUnitsCurrent && previews.units.availability === "available" ? { availability: "available", value: previews.units.groups.length } : { availability: "unavailable" }, codes: { availability: "available", value: draft.codes.length } },
  };
  const groupSelectors = <section aria-label="Current-result Group contrast" data-testid="open-ena-ona-descriptive-group-controls"><p>{copy.contrast.selectedAxes}: {twoDAxes.join(" · ")}</p><label>Primary Group<select aria-label="Primary Group" value={primaryGroupName} onChange={(e) => setPrimaryGroupName(e.target.value)}><option value="">Select Group</option>{groups.map((group) => <option key={group.token} value={group.token}>{group.displayLabel}</option>)}</select></label>
    <label>Secondary Group<select aria-label="Secondary Group" value={secondaryGroupName} onChange={(e) => setSecondaryGroupName(e.target.value)}><option value="">Select Group</option>{groups.map((group) => <option key={group.token} value={group.token}>{group.displayLabel}</option>)}</select></label>
    {completedResultKind === "ona" && <p>{copy.ona.layout.descriptiveBoundary}</p>}</section>;

  const persistentPlotTools = <OpenEnaPersistentPlotTools analysisKind={completedResultKind === "ona" ? "ona" : "ena"}
    title={completedResultKind === "ona" ? copy.ona.presenter.title : "Plot Tools"} copy={completedResultKind === "ona" ? copy.ona.plotTools : undefined}
    edgeScale={edgeScale} edgeThreshold={edgeThreshold} pointScale={pointScale} textScale={textScale}
    showLabels={showLabels} showGroupLabels={showGroupLabels} showUnitLabels={showUnitLabels} showPoints={showPoints}
    unitCircle={unitCircle} flipX={flipX} flipY={flipY} plotZoom={plotZoom} nodeLayoutOverrideCount={sourcePositions.size}
    resetNodeLayoutLabel={copy.plot.resetNodeLayout} onEdgeScaleChange={setEdgeScale} onEdgeThresholdChange={setEdgeThreshold}
    onPointScaleChange={setPointScale} onTextScaleChange={setTextScale} onShowLabelsChange={setShowLabels} onShowGroupLabelsChange={setShowGroupLabels}
    onShowUnitLabelsChange={setShowUnitLabels} onShowPointsChange={setShowPoints} onUnitCircleChange={setUnitCircle}
    onFlipXChange={setFlipX} onFlipYChange={setFlipY} onPlotZoomChange={setPlotZoom}
    onResetNodeLayout={() => setNodeOverrides({ hash: resultHash, positions: new Map() })}
    onReset={() => { setEdgeScale(1); setEdgeThreshold(0); setPointScale(1); setTextScale(1); setFlipX(false); setFlipY(false); setPlotZoom(1); setAxes([]); setThreeDAxes([]); setCameraPreset("isometric"); setCamera(cameraForPreset("isometric")); setAspectRatio(null); setHiddenUnitKeys([]); setShowLabels(true); setShowGroupLabels(true); setShowUnitLabels(false); setShowPoints(true); setUnitCircle(false); }}
    settingsOpen={plotSettingsOpen} onSettingsOpenChange={setPlotSettingsOpen} disabled={!result} />;
  const analysisPanel = <div className="ena-control-content" lang={locale} dir="ltr">
      <header className="ena-panel-heading"><h1>{copy.modes[mode]}</h1>{mode === "model" && family === "standard" && <button type="button" className="ena-model-trajectory-button" onClick={() => setModelNavigation((value) => ({ tab: "windows", serial: value.serial + 1 }))}>Configure trajectory model</button>}<p role="status" aria-live="polite">{current ? "Current result" : result ? "Retained stale result" : "No result"} · {modelState.runStatus}</p>
        {modelState.runStatus === "running" && <p role="status"><progress max={100} value={state.progress?.value ?? 0} />{state.progress?.stage ?? "Starting model worker"}</p>}
        <button type="button" disabled={!controller.canRun || sourceBusy || sourcePreview !== null} onClick={controller.run}>Run model</button>
        <button type="button" disabled={modelState.runStatus !== "running"} onClick={controller.cancel}>Cancel run</button>
      </header>
      {(error || state.error || currentCompilation?.error) && <p role="alert">{error || state.error || currentCompilation?.error}</p>}
      {controller.importPending && <button type="button" onClick={() => dispatch({ type: "cancel-preview" })}>Cancel pending import</button>}
      {state.preview && <OpenEnaImportPreviewV3 preview={state.preview} drafts={modelState.drafts} copy={modelV3Copy.importPreview}
        onCancel={() => dispatch({ type: "cancel-preview" })} onAcceptDraft={() => dispatch({ type: "accept-draft-preview", preview: state.preview! })}
        onKeepHistorical={() => dispatch({ type: "keep-historical", preview: state.preview! })} onAddReference={() => void attempt(controller.addReference)} />}
      {mode === "data" && <section aria-label="Data source"><h2>Coded data</h2>
        <input aria-label="Open coded CSV or XLSX" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => { const file = e.target.files?.[0]; if (file) void attempt(() => openCodedData(file)); e.target.value = ""; }} />
        <button type="button" onClick={() => void attempt(() => loadSample(false))} disabled={sourceBusy}>Load sample</button>
        <button type="button" onClick={() => void attempt(() => loadSample(true))} disabled={sourceBusy}>Load trajectory sample</button>
        <p>Samples use versioned explicit type declarations and order policies, then run through the strict model compiler.</p>
        <label>Import configuration, result or Reference<input type="file" accept=".json" onChange={(e) => { const file = e.target.files?.[0]; if (file) void attempt(async () => { if (file.size > 16 * 1024 * 1024) throw new Error("Artifact exceeds 16 MiB."); await controller.preview(file.text()); }); e.target.value = ""; }} /></label>
        {sourcePreview && <section role="dialog" aria-label="Review CSV source types"><h3>Review source column types</h3><p>{SOURCE_TYPING_EXPLANATION_V3}</p>
          {sourceTypingPreview!.columns.map((column) => <div key={column.column}><label>{column.column}<select aria-label={`Source type: ${column.column}`} disabled={sourceBusy} value={column.type} onChange={(e) => setSourcePreview({ ...sourcePreview, types: { ...sourcePreview.types, [column.column]: e.target.value as SourceColumnTypeV3 } })}>{(["text", "number", "boolean"] as const).map((type) => <option key={type}>{type}</option>)}</select></label>
            <p>{column.nullCount} missing cells · {column.identityCollisionCount} potential identity collisions</p><code>{JSON.stringify(column.examples)}</code></div>)}
          {sourceTypingPreview!.errorCount > 0 && <p role="alert">{sourceTypingPreview!.errorCount} invalid cells. {JSON.stringify(sourceTypingPreview!.errors)}</p>}
          <button type="button" onClick={() => { ++sourceGeneration.current; setSourcePreview(null); setSourceBusy(false); }}>Cancel source preparation</button>
          <button type="button" disabled={sourceBusy || sourceTypingPreview!.errorCount > 0} onClick={() => void attempt(confirmSourceTyping)}>Confirm types and create typed XLSX</button>
        </section>}
        {dataset && <><p>{dataset.name} · {dataset.rows.length} rows · {modelState.datasetSha256} · {dataset.hashKind}</p><ResearchTableV3 rows={dataset.rows} label="Source data" /></>}
        {derivative && <><button type="button" onClick={() => saveDerivative(derivative)}>Download typed XLSX source</button><button type="button" onClick={() => downloadJson("source-derivation.json", derivative.receipt)}>Download source derivation receipt</button></>}
        {originalSource && <button type="button" onClick={() => downloadText(originalSource.name, originalSource.text, "text/csv")}>Download original CSV</button>}
        {state.historical.map((artifact) => <article key={artifact.receivedArtifactSha256}><p>Historical, read-only artifact {artifact.receivedArtifactSha256}</p><button type="button" onClick={() => dispatch({ type: "preview", value: artifact })}>Review historical configuration</button></article>)}
      </section>}
      {mode === "model" && <OpenEnaModelTabsV3 copy={modelCopy} diagnostics={diagnostics} scientificContext={context} scientificSummary={modelSummary}
        initialTab={modelNavigation.tab} status={{ ...modelState, editorBlocked: modelState.editorBlocked[family], configurationReadiness: currentCompilation?.plan ? "ready" : "incomplete" }}
        onSuggestedAction={(action, intent) => {
          if (!sameScientificContextV3(intent, context)) return;
          const patch = action.patch;
          if (patch.type === "exclude-code") dispatchModel({ type: "exclude-code", code: patch.code });
          else if (patch.type === "clear-group") dispatchModel({ type: "exclude-group-configuration" });
          else if (family === "standard") {
            const d = modelState.drafts.standard;
            const next = patch.type === "select-model" ? { ...d, model: patch.value }
              : patch.type === "select-rotation" ? { ...d, rotation: patch.value === "svd" ? { type: "svd" as const, centerAlignToOrigin: true } : { type: "reference" as const, referenceId: null, expectedContentSha256: null } }
              : patch.type === "replace-row-order" ? { ...d, movingStanza: { ...d.movingStanza, rowOrder: structuredClone(patch.value) as typeof d.movingStanza.rowOrder } }
              : { ...d, horizonOrder: structuredClone(patch.value) as typeof d.horizonOrder };
            dispatchModel({ type: "replace-standard-draft", draft: next });
          }
        }}
        renderPanel={(tab, fields) => tab === "units" ? <OpenEnaUnitsPanelV3 presetHiddenGroupTokens={state.presetHiddenGroups?.resultHash === resultHash ? state.presetHiddenGroups.tokens : []} copy={modelV3Copy.units} applicabilityCopy={modelV3Copy.groupApplicability} groupDisplayCopy={copy.groupDisplay} state={modelState} fields={fields} columnOptions={dataset?.headers ?? []}
          preview={previews.units} diagnostics={diagnostics} localizeDiagnostic={localizedDiagnostic} view={view} hiddenUnitKeys={hiddenUnitKeys} dispatch={dispatchModel}
          onUnitVisibilityChange={(group, unit, visible) => setHiddenUnitKeys((values) => visible ? values.filter((key) => key !== JSON.stringify([group, unit])) : [...new Set([...values, JSON.stringify([group, unit])])])} onRevealAllHidden={() => setHiddenUnitKeys([])} />
          : tab === "horizons" ? <OpenEnaHorizonsPanelV3 copy={modelV3Copy.horizons} orderCopy={modelV3Copy.order} state={modelState} fields={fields} columnOptions={dataset?.headers ?? []} preview={previews.horizons}
            diagnostics={diagnostics.filter((diagnostic) => diagnostic.scope !== "model") as Parameters<typeof OpenEnaHorizonsPanelV3>[0]["diagnostics"]} localizeDiagnostic={localizedDiagnostic}
            orderRawState={state.raw.horizonOrder} onOrderRawStateChange={(value) => dispatch({ type: "horizon-raw", value })} onOrderBlockedChange={() => { /* synchronous ALL-field owner is authoritative */ }} dispatch={dispatchModel} />
          : tab === "windows" ? <OpenEnaWindowsPanelV3 copy={modelV3Copy.windows} orderCopy={modelV3Copy.order} state={modelState} fields={fields} columnOptions={dataset?.headers ?? []} rawState={state.raw.windows}
            onRawStateChange={(value) => dispatch({ type: "windows-raw", value })} onBlockersChange={() => { /* complete ledger calculated synchronously by workspaceReducerV3 */ }}
            sourcePreview={dataset ? { availability: "available", context, rowCount: dataset.rows.length } : { availability: "unavailable" }} preflight={currentCompilation}
            referenceOptions={state.references.map((r) => ({ referenceId: r.referenceId, contentSha256: r.contentSha256, displayName: r.displayName }))} referencePreview={referencePreview}
            onNavigateToMeansContrast={() => setModelNavigation((value) => ({ tab: "units", serial: value.serial + 1 }))} dispatch={dispatchModel} />
          : <><OpenEnaCodesPanelV3 copy={modelV3Copy.codes} state={modelState} fields={fields} preview={dataset ? createOpenEnaCodesPreviewV3(dataset, modelState.datasetSha256, modelState,
              currentCompilation ? { availability: "available", context: currentCompilation.context, diagnostics: currentCompilation.result.diagnostics } : { availability: "unavailable", context }) : { availability: "unavailable", context }}
              dispatch={dispatchModel} onChooseCodeColor={(code) => setActiveCodeColor({ code, context })} localizeDiagnostic={localizedDiagnostic} />
            {family === "ona" && <fieldset id={fields.id("directionalMask")} tabIndex={-1}><legend>ONA directional mask</legend><p>Rows are source/ground Codes; columns are response Codes. Changes alter the scientific configuration.</p>
              {modelState.drafts.ona.directionalMask === null ? <button type="button" onClick={() => dispatchModel({ type: "replace-ona-draft", draft: { ...modelState.drafts.ona, directionalMask: { schemaVersion: 1, codeOrder: [...draft.codes], enabled: draft.codes.map(() => draft.codes.map(() => true)) } } })}>Initialize explicit all-enabled mask</button>
                : modelState.drafts.ona.directionalMask.enabled.map((row, i) => <div key={i}>{row.map((enabled, j) => <label key={j}>{draft.codes[i]} → {draft.codes[j]}<input type="checkbox" checked={enabled} onChange={(e) => { const mask = modelState.drafts.ona.directionalMask!; dispatchModel({ type: "replace-ona-draft", draft: { ...modelState.drafts.ona, directionalMask: { ...mask, enabled: mask.enabled.map((values, r) => values.map((value, c) => r === i && c === j ? e.target.checked : value)) } } }); }} /></label>)}</div>)}</fieldset>}</>}
      />}
      {activeColorIntent && <OpenEnaCodeColorPicker code={activeColorIntent.code} value={openEnaCodeColorPair(modelState.display[family].codeColors[activeColorIntent.code] ?? codeColorFor(undefined, activeColorIntent.code), state.colorCompanions[family][activeColorIntent.code])} copy={copy.model.codeColorPicker}
        onCancel={() => setActiveCodeColor(null)} onConfirm={(value) => { if (!sameScientificContextV3(activeColorIntent.context, controller.context)) return; dispatch({ type: "confirm-code-color", context: activeColorIntent.context, code: activeColorIntent.code, color: value.primary, complementary: value.complementary }); setActiveCodeColor(null); }} />}
      {mode === "plot" && <section><h2>Plot presentation</h2>{groupSelectors}
        {activeContrast && endpointControls && <><button type="button" onClick={() => void attempt(async () => { const file = await exportContrastV3(result, currentPlan, endpointControls); if (consumerKey === consumerKeyRef.current && confirmCurrentIdentityBearingExport()) downloadText(file.filename, file.contents, "application/json"); })}>Export full-population contrast JSON</button>
          <button type="button" onClick={() => void attempt(async () => { const file = await exportContrastV3(result, currentPlan, endpointControls); if (consumerKey === consumerKeyRef.current) downloadText("native-contrast-edges.csv", file.edgesCsv, "text/csv"); })}>Export full-population contrast edges</button>
          <button type="button" onClick={() => { setPrimaryGroupName(secondaryGroupName); setSecondaryGroupName(primaryGroupName); }}>Switch Plots</button></>}
        {isTrajectory && <><label><input type="checkbox" checked={showGroupCentroidPaths} onChange={(e) => setShowGroupCentroidPaths(e.target.checked)} />Show Group centroid paths</label>
          <label><input type="checkbox" checked={endpointsOnly} onChange={(e) => setEndpointsOnly(e.target.checked)} />Show endpoints only (display)</label>
          <p>Fitted Horizon order is locked. Display filters retain original ordinals and do not change inference cohorts.</p>
          {horizons.map((horizon) => <label key={horizon.token}><input type="checkbox" checked={visibleHorizons === null || visibleHorizons.includes(horizon.canonicalJson)} onChange={(e) => setVisibleHorizons((values) => { const selected = values ?? horizons.map((value) => value.canonicalJson); return e.target.checked ? [...new Set([...selected, horizon.canonicalJson])] : selected.filter((key) => key !== horizon.canonicalJson); })} />Display {horizon.displayLabel}</label>)}</>}
        <button type="button" aria-pressed={view === "2d"} onClick={() => setView("2d")}>2D</button><button type="button" aria-pressed={view === "3d"} disabled={!genericThreeDAvailable} onClick={() => setView("3d")}>3D</button>
        {(view === "3d" ? [0, 1, 2] : [0, 1]).map((index) => <label key={index}>Axis {index + 1}<select aria-label={`Axis ${index + 1}`} value={selectedAxes[index] ?? ""} onChange={(e) => (view === "3d" ? setThreeDAxes : setAxes)(selectedAxes.map((axis, i) => i === index ? e.target.value : axis))}><option value="">Unavailable</option>{supportedAxes.map((axis) => <option key={axis}>{axis}</option>)}</select></label>)}
        {[["Points", showPoints, setShowPoints], ["Networks", showNetworks, setShowNetworks], ["Code labels", showLabels, setShowLabels], ["Unit labels", showUnitLabels, setShowUnitLabels], ["Variance", showVariance, setShowVariance], ["Trajectories", showTrajectories, setShowTrajectories], ["Flip X", flipX, setFlipX], ["Flip Y", flipY, setFlipY]].map(([label, value, setter]) => <label key={String(label)}>{String(label)}<input type="checkbox" checked={value as boolean} onChange={(e) => (setter as (value: boolean) => void)(e.target.checked)} /></label>)}
        {[["Edge threshold", edgeThreshold, setEdgeThreshold, 0, 1], ["Edge scale", edgeScale, setEdgeScale, 0.1, 4], ["Point scale", pointScale, setPointScale, 0.1, 4], ["Zoom", plotZoom, setPlotZoom, 0.5, 3]].map(([label, value, setter, min, max]) => <OpenEnaRangeField key={String(label)} id={String(label)} idPrefix={workspaceId} label={String(label)} value={value as number} formattedValue={String(value)} accessibleValueText={String(value)} min={min as number} max={max as number} step={0.1} onChange={(e) => (setter as (value: number) => void)(e.target.valueAsNumber)} />)}
        {view === "3d" && <fieldset className="ena-camera-fieldset"><legend>{copy.plot.cameraPosition}</legend>{cameraPositionOptions.map(([preset, label]) => <label key={preset}><input type="radio" name="ena-camera" value={preset} checked={cameraPreset === preset} onChange={() => { setCameraPreset(preset); setCamera(cameraForPreset(preset)); setAspectRatio(null); }} />{label}</label>)}</fieldset>}
        <button type="button" onClick={() => setNodeOverrides({ hash: resultHash, positions: new Map() })}>Reset node positions</button>
      </section>}
      {mode === "stats" && <section><h2>{copy.stats.title}</h2><OpenEnaNativeStatsPanelV3 result={result} current={current} axes={twoDAxes} inference={activeInference} copy={copy.stats} nativeCopy={modelV3Copy.nativeStats} renderTable={(rows, label) => <ResearchTableV3 rows={rows} label={label} />}>{groupSelectors}
        <p>Model bundles contain unavailable statistics. Inference below is an explicit, separate post-model request.</p>
        {isTrajectory && <><label>Trajectory inference design<select value={inferenceDesign} onChange={(e) => setInferenceDesign(e.target.value as typeof inferenceDesign)}><option value="independent">Independent groups at a period</option><option value="paired">Paired periods</option><option value="repeated">Repeated periods</option></select></label>
          <label><input type="checkbox" checked={identityConfirmed} onChange={(e) => setIdentityConfirmed(e.target.checked)} />I confirm these fitted Units identify the same entities across periods.</label>
          <p>Select exactly one period for independent, exactly two for paired, or at least three for repeated inference. Select periods in the requested order. The native consumer verifies fitted precedence and rejects incomparable or reversed periods.</p>
          {horizons.map((horizon) => <label key={horizon.token}><input type="checkbox" checked={selectedPeriods.includes(horizon.token)} onChange={(e) => setSelectedPeriods((values) => e.target.checked ? [...values, horizon.token] : values.filter((value) => value !== horizon.token))} />{horizon.displayLabel}</label>)}</>}
        <button type="button" disabled={!current || !controls || inferenceBusy || completedResultKind === "ona"} onClick={() => void attempt(runInference)}>Run confirmed inference</button>
        {completedResultKind === "ona" && <p>ONA remains descriptive only; group and trajectory inference are unavailable.</p>}
        {onaView && <><p>{onaView.meaning}</p><ResearchTableV3 rows={onaView.edges} label="ONA directed aggregate edges" />
          <ResearchTableV3 rows={onaView.auditRows} label="Full-run deidentified ordered audit" />
          <button type="button" disabled={!current} onClick={() => void attempt(async () => { const value = await buildOnaBoundViewV3(result, currentPlan, primaryGroupName || null); if (latest.current.current && latest.current.state.model.result === result) downloadText("ona-aggregate-edges.csv", rowsToCsv(value.edges), "text/csv"); })}>Export ONA aggregate edges</button>
          <button type="button" disabled={!current} onClick={() => void attempt(async () => { const value = await buildOnaBoundViewV3(result, currentPlan); if (latest.current.current && latest.current.state.model.result === result && window.confirm(copy.ona.exports.auditConfirmation)) downloadJson("ona-deidentified-audit.json", { binding: value.binding, audit: value.audit, meaning: value.meaning }); })}>Export ONA deidentified audit</button><p>{copy.ona.exports.auditWarning}</p></>}
        </OpenEnaNativeStatsPanelV3>
        {activeInference && <><button type="button" onClick={() => void attempt(async () => { const file = await exportNativeStatisticsV3(activeInference, result, currentPlan, controls!); if (consumerKey === consumerKeyRef.current) downloadText(file.filename, file.contents, file.mimeType); })}>Export native statistics</button></>}
        {historicalData && <><ResearchTableV3 rows={historicalData.rows} label="Local identity-bearing bound Data View" /><p>{historicalData.sourceIndexMeaning}</p><ResearchTableV3 rows={historicalData.sourceTraversal} label="Global runtime source traversal (not per-point membership)" />
          <button type="button" disabled={!current} onClick={() => void attempt(async () => { if (!result || !currentPlan) return; const value = await buildDataViewV3(result, currentPlan); if (!latest.current.current || latest.current.state.model.result !== result) return; if (window.confirm("This local identity-bearing view contains Unit and Group identities. Export it?")) downloadText("bound-data-view.csv", rowsToCsv(value.rows), "text/csv"); })}>Export current Data View</button></>}
        {checkedDataView && current && checkedDataView.binding.scientificResultSha256 === result?.binding.scientificResultSha256 && checkedDataView.binding.executionPlanSha256 === currentPlan?.header.executionPlanSha256 && <p>Data View validated against the independent current plan.</p>}
        {result && <details><summary>{copy.stats.ui.methodsTitle}</summary><button type="button" onClick={() => void attempt(async () => { if (confirmCurrentIdentityBearingExport()) await navigator.clipboard.writeText(buildMethodsReportV3(result)); })}>{copy.stats.ui.copyMethods}</button><pre>{buildMethodsReportV3(result)}</pre><button type="button" onClick={() => { if (confirmCurrentIdentityBearingExport()) downloadText("methods.md", buildMethodsReportV3(result), "text/markdown"); }}>Export Methods</button></details>}
      </section>}
      <section aria-label="Model artifacts"><h2>Artifacts</h2>
        <p>{WORKSPACE_PRESET_SCOPE_V3}</p>{state.presetHiddenGroups?.resultHash === resultHash && <button type="button" onClick={() => dispatch({ type: "clear-preset-group-hiding" })}>Clear preset Group hiding</button>}
        <button type="button" disabled={!result} onClick={() => { try { exportPresentation(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }}>Export presentation preset</button>
        <label>Review presentation preset<input type="file" accept=".json" onChange={(e) => { const file = e.target.files?.[0]; if (file) void attempt(() => previewPresentation(file)); e.target.value = ""; }} /></label>
        {presetPreview && <section role="dialog" aria-label="Presentation preset preview"><p>{presetPreview.boundResultSha256 === resultHash ? "This preset matches the retained result. Application changes display only." : "Unapplied preset: this belongs to a different scientific result."}</p><pre>{JSON.stringify(presetPreview, null, 2)}</pre>
          {!presetCodesCompatible && <p>The active editor excludes Codes used by this retained result. The preset remains unapplied.</p>}{completedResultKind !== family && <p>The editor family differs from the retained result. The preset remains unapplied.</p>}
          <button type="button" onClick={() => { ++presetSerial.current; setPresetPreview(null); }}>Cancel preset</button>
          <button type="button" disabled={presetPreview.boundResultSha256 !== resultHash || completedResultKind !== family || !presetCodesCompatible || display.allCodesSuppressed || display.allGroupsSuppressed} onClick={() => { try { applyPresentation(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }}>Apply matching presentation preset</button></section>}
        <button type="button" disabled={!workspaceDraftExportableV3(state)} onClick={() => void attempt(async () => saveDescriptor(await exportDraftV3(draft)))}>Export draft</button>
        {!workspaceDraftExportableV3(state) && <p>Resolve unfinished raw input before exporting: the portable draft grammar cannot represent that visible text. Typed incomplete drafts remain exportable.</p>}
        <button type="button" disabled={!currentCompilation?.plan} onClick={() => void attempt(async () => { if (currentCompilation?.result.status === "ready") saveDescriptor(await exportCanonicalConfigV3(currentCompilation.result)); })}>Export canonical configuration</button>
        <button type="button" disabled={!current} onClick={() => void attempt(async () => { if (result && currentPlan) { const descriptor = await exportCurrentAnalysisV3(result, currentPlan); if (latest.current.current && latest.current.state.model.result === result && window.confirm("Export the full identity-bearing model bundle?")) saveDescriptor(descriptor); } })}>Export current analysis</button>
        <button type="button" disabled={!result} onClick={() => void attempt(async () => { if (result) { const file = await exportStaleAuditV3(result, await sha256TextV3(context.draftFingerprint)); if (latest.current.state.model.result === result && confirmCurrentIdentityBearingExport()) saveDescriptor(file); } })}>Export STALE audit</button>
        <button type="button" disabled={!current || completedResultKind !== "standard" || (isTrajectory && result?.binding.referenceId === null)} onClick={() => void attempt(async () => { if (result && currentPlan) saveDescriptor(await exportReferenceV2(result, { currentPlan, ...(state.sourceWitness ? { sourceWitness: state.sourceWitness } : {}), displayName: dataset?.name ?? "Reference" })); })}>{result?.binding.referenceId ? "Re-export original Reference" : "Export Reference"}</button>
        <button type="button" disabled={!current || completedResultKind === "ona" || isTrajectory || sets.length >= 6} onClick={() => void attempt(async () => { if (result && currentPlan) { const captured = await captureAnalysisSetV3(result, currentPlan, { name: dataset?.name }); if (latest.current.current && latest.current.state.model.result === result) setSets((values) => upsertAnalysisSetV3(values, captured)); } })}>Capture analysis set ({sets.length}/6)</button>
        {sets.map((set) => <p key={set.id}>{set.name}</p>)}
        <button type="button" disabled={sets.length < 2} onClick={() => { try { setSetComparison(compareAnalysisSetsV3(sets[sets.length - 2], sets[sets.length - 1])); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }}>Compare last two sets in the same basis</button>
        {setComparison && <ResearchTableV3 rows={setComparison.edges} label="Historical same-basis set comparison" />}
      </section>
</div>;
  const aiPanel = <div className="ena-control-content ena-ai-mode-panel" data-ena-ai-source="stats-results"><p className="ena-panel-kicker">AI</p><h2>{copy.aiInterpretation.title}</h2><p>{activeInference ? "Current native Stats result is ready for aggregate review." : "Run and review a current native Stats result first."}</p><button type="button" onClick={() => setMode("stats")}>Open Stats</button>
      <div hidden={mode !== "ai"}><OpenEnaAiInterpretation request={activeAiReview?.request ?? null}
        localScientificIdentity={activeAiReview ? canonicalJsonV3({ binding: activeAiReview.binding, context: activeAiReview.context, configuration: activeAiReview.configuration }) : null}
        copy={copy.aiInterpretation} disabled={!activeAiReview || !current} disabledReason={aiLimitation || "Run a current eligible native inference and review its aggregate evidence first."} providerDescriptor={providerDescriptor} />
        {activeAiReview && <p>{activeAiReview.wireLimitations}</p>}{aiLimitation && <p role="status">{aiLimitation}</p>}</div>
</div>;
  const nativeDataView = dataViewPresentation && <>
            <OpenEnaDataView columns={dataViewPresentation.columns} rows={dataViewPresentation.rows} context={dataViewContext}
              onContextChange={setDataViewContext} onReturnToComparison={() => setCenterSurface("plot")} exportDisabled={!current}
              contextOptions={[{ value: "comparison", label: "Comparison: all bound observations" }, ...(primary ? [{ value: "primary" as const, label: primary.displayLabel }] : []), ...(secondary ? [{ value: "secondary" as const, label: secondary.displayLabel }] : [])]}
              exportClassification="local-identity-bearing-view" copy={{ codeGroup: "Normalized undirected edges", directedEdgeGroup: "Normalized directed edges" }} notice={dataViewPresentation.sourceIndexMeaning}
              onExportCsv={() => void attempt(async () => { if (!result || !currentPlan || !current) return; await buildDataViewV3(result, currentPlan); if (latest.current.current && latest.current.state.model.result === result && confirmCurrentIdentityBearingExport()) downloadText("bound-data-view.csv", rowsToCsv(dataViewPresentation.rows.map((row) => Object.fromEntries(Object.entries(row.values).map(([key, value]) => [key, value ?? null])))), "text/csv"); })} />
            <ResearchTableV3 rows={dataViewPresentation.sourceTraversal} label="Global runtime source traversal (not per-point membership)" />
          </>;
  return <div className="open-ena-page" data-testid="open-ena-workspace-v3" data-result-status={modelState.resultStatus} data-run-status={modelState.runStatus}>
    <OpenEnaFallbackNotice locale={locale} />
    <section className="open-ena-workbench" aria-label="Open ENA analysis workspace" aria-busy={sourceBusy || modelState.runStatus === "running"}>
      <div className="ena-workbench-grid">
        <nav className="ena-tool-rail" aria-label="Analysis modes" data-ena-workbench-region="rail">
          <div className="ena-rail-brand" data-ena-rail-brand="true" aria-label="ENA.HK Open ENA">
            <span className="ena-mini-mark" aria-hidden="true"><img src="/ena-mark.svg" alt="" /></span><span className="ena-rail-product">OPEN ENA</span>
            <a className="ena-rail-version" data-ena-rail-version="true" href={JENA_SOURCE_URL} target="_blank" rel="noopener noreferrer"
              aria-label={copy.workspace.jenaSourceAriaLabel(JENA_RUNTIME_VERSION, JENA_SOURCE_COMMIT.slice(0, 7))}>jENA {JENA_RUNTIME_VERSION.split("-", 1)[0]}</a>
          </div>
          <div className="ena-rail-modes">{(["data", "model", "plot", "stats", "ai"] as const).map((entry) => <button key={entry} type="button" className="ena-rail-button" aria-current={mode === entry ? "step" : undefined} aria-label={entry === "ai" ? copy.aiInterpretation.title : copy.modes[entry]} onClick={() => setMode(entry)}>{modeIcons[entry]}<span>{copy.modes[entry]}</span></button>)}</div>
          <form className="ena-rail-logout" action="/api/open-ena/logout" method="post"><input type="hidden" name="locale" value={locale} /><button type="submit" aria-label={authCopy.signOut} title={authCopy.signOut}>{authCopy.signOut}</button></form>
          <div className="ena-rail-meta"><span className="ena-rail-privacy">Local</span><span className="sr-only">ENA computation powered by jENA v{JENA_RUNTIME_VERSION} (GPL-3.0-only); ENA.HK provides the interface, plotting, and exports. Source data stays in this workspace’s browser memory unless you intentionally export it.</span></div>
        </nav>
        <aside className="ena-control-panel" data-ena-workbench-region="controls"><OpenEnaPersistentRailPanels mode={mode} analysisPanel={analysisPanel} aiPanel={aiPanel} /></aside>
        <div className="ena-visual-workspace" data-ena-view={view} data-testid="open-ena-center-surface">
          <div className={`ena-visual-toolbar${view === "2d" && contrast ? " ena-visual-toolbar-group-contrast" : ""}`}><div><p>{copy.workspace.comparison}</p><span>{dataset?.name ?? "SVD research space"}</span></div>
            <div className="ena-visual-toolbar-actions"><button type="button" data-testid="open-ena-data-view-toggle" disabled={!result} aria-pressed={centerSurface === "data"} onClick={() => setCenterSurface((value) => value === "plot" ? "data" : "plot")}>Data View</button>
              <div className="ena-analysis-toolbar-cluster"><div className="ena-view-toggle"><button type="button" aria-pressed={view === "2d"} onClick={() => setView("2d")}>{completedResultKind === "ona" ? copy.ona.workspace.twoD : copy.views.twoD}</button><button type="button" aria-pressed={view === "3d"} disabled={!genericThreeDAvailable} onClick={() => setView("3d")}>{completedResultKind === "ona" ? copy.ona.workspace.threeD : copy.views.threeD}</button></div>
                <button type="button" className="ena-download-model-button" disabled={!current} onClick={() => void attempt(async () => { if (result && currentPlan) { const value = await exportCurrentAnalysisV3(result, currentPlan); if (latest.current.current && latest.current.state.model.result === result && confirmCurrentIdentityBearingExport()) saveDescriptor(value); } })}><span className="ena-download-model-button-icon" aria-hidden="true">↓</span>Download Model</button>
              </div><button type="button" disabled={!result || view === "3d"} onClick={exportPlotSvg}>Export SVG</button><button type="button" disabled={!result || view === "3d"} onClick={exportPlotPng}>Export PNG</button>
            </div>
          </div>
          <div>
      {presentation && result && <section aria-label="Bound model plot" data-ena-workbench-region="center"><p>{modelState.resultStatus === "stale" ? "Historical geometry: edits require a new run." : "Bound fitted geometry"}</p>
        {selectedAxes.length < 2 ? <><p>Only one supported fitted axis is available. No second coordinate is invented.</p><ResearchTableV3 rows={result.set.points} label="Fitted coordinates" /></>
          : completedResultKind === "ona" ? view === "3d" && threeDDimensions
            ? <OpenEna3DOrderedResultLayout {...plotProps} sharedCamera={camera} onCameraChange={setCamera} sharedAspectRatio={aspectRatio} onAspectRatioChange={setAspectRatio} result={plotResult!} config={presentation.config} primaryGroupName={primary?.displayLabel ?? null} secondaryGroupName={secondary?.displayLabel ?? null} centerMode={centerSurface} dataView={nativeDataView} rightTools={persistentPlotTools} />
            : <OpenEnaOrderedResultLayout {...plotProps} copy={copy.ona.layout} textScale={textScale} result={plotResult!} config={presentation.config} primaryGroupName={primary?.displayLabel ?? null} secondaryGroupName={secondary?.displayLabel ?? null} centerMode={centerSurface} dataView={nativeDataView} rightTools={persistentPlotTools} />
          : contrast ? view === "3d" && threeDDimensions
            ? <OpenEna3DGroupContrast {...plotProps} sharedCamera={camera} onCameraChange={setCamera} sharedAspectRatio={aspectRatio} onAspectRatioChange={setAspectRatio} groupColumn="Group" result={plotResult!} contrast={contrast} centerMode={centerSurface} dataView={nativeDataView} rightTools={persistentPlotTools} />
            : <OpenEnaGroupContrast {...plotProps} centerMode={centerSurface} dataView={nativeDataView} rightTools={persistentPlotTools} onSwitchPlots={() => { setPrimaryGroupName(secondaryGroupName); setSecondaryGroupName(primaryGroupName); }} contrast={contrast} showGroupLabels={showGroupLabels && !display.allGroupsSuppressed} unitCircle={unitCircle} textScale={textScale} svgRef={plotSvgRef} />
          : centerSurface === "data" ? nativeDataView : view === "3d" && threeDDimensions ? <OpenEnaInteractive3DPlot {...plotProps} result={plotResult!} initialCamera={camera} onCameraChange={setCamera} initialAspectRatio={aspectRatio} onAspectRatioChange={setAspectRatio} />
          : <OpenEnaPlot {...plotProps} result={plotResult!} view="2d" svgRef={plotSvgRef} />}
        {!contrast && completedResultKind !== "ona" && <div data-ena-workbench-region="right-stack">{persistentPlotTools}</div>}
        {consumerError && <p role="status">{consumerError}</p>}{!isTrajectory && completedResultKind === "standard" && !endpointControls && <p role="status">Contrast requires two declared Groups and two supported fitted axes. The fitted model remains available for inspection.</p>}
        <p>Code labels: {result.executionProvenance.labels.codes.map((code) => `${code.column} = ${code.displayLabel}`).join("; ")}</p>
        {longitudinal && <><p>{longitudinal.provenance.cohortMeaning}</p><ResearchTableV3 rows={longitudinal.entities.flatMap((entity) => entity.steps)} label="Observed fitted trajectory steps and original ordinals" /><pre>{JSON.stringify(longitudinal.comparison, null, 2)}</pre></>}
      </section>}
{!result && (              <section className="ena-empty-workbench" data-testid="open-ena-empty-workbench" aria-label="Open ENA model setup workbench">
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
                          <li data-done={controller.canRun ? "true" : "false"}>
                            <span className="sr-only">{controller.canRun ? "Complete: " : "Not complete: "}</span>
                            Define Units, Horizons, Windows, and Codes; Group is optional
                          </li>
                          <li data-done="false"><span className="sr-only">Not complete: </span>Build the model with jENA</li>
                        </ol>
                        <button type="button" className="ena-action-button ena-action-primary" onClick={() => void attempt(() => loadSample())} disabled={sourceBusy || modelState.runStatus === "running"}>{copy.data.sample}</button>
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
          </div>

        </div>
      </div>
    </section>
  </div>;
}
