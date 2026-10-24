"use client";

import { restoredWorkbenchCopy } from "./workbench-restoration-copy";
import { buildUnitDisplayLabelIndexV3, hiddenUnitLabelsV3 } from "../../lib/open-ena/hidden-unit-display-v3";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode, type MutableRefObject } from "react";
import { submitOpenEnaLogoutAsDocumentRequest } from "@/lib/open-ena-logout-navigation";
import type { Row } from "jena-js";
import type { Locale } from "@/lib/i18n";
import { getOpenEnaAuthCopy } from "@/lib/open-ena-auth-copy";
import OpenEnaFallbackNotice from "./OpenEnaFallbackNotice";
import OpenEnaSiteNavigation from "./OpenEnaSiteNavigation";
import OpenEnaPersistentPlotTools, { scheduleOpenEnaDomFocusRestore } from "./OpenEnaPersistentPlotTools";
import { formatOpenEnaWorkspaceFailureV3, getOpenEnaCopy, type OpenEnaWorkspaceFailureV3 } from "@/lib/open-ena-i18n";
import { rowsToCsv, resolveOpenEnaPlotExportDimensions, resolveOpenEnaPlotRasterDimensions, openEnaResultTableFocusTarget, resolveOpenEnaResultTableRovingKey, buildOpenEnaResultTable, buildOpenEnaResultTableViewModel, openEnaResultTableAvailability, openEnaResultTableRowCounts, exportOpenEnaResultTableCsv, type OpenEnaResultTableKey, type OpenEnaResultTableViewModel } from "@/lib/open-ena/export";
import { openEnaExportApplicabilityText, openEnaExportDisclosure, openEnaExportFamilyFromResult, openEnaResultTableExportAction, type OpenEnaExportDisclosure, type OpenEnaExportDisclosureContext, type OpenEnaStatsExportAction } from "@/lib/open-ena/export-applicability";
import { OpenEnaExportApplicabilityNote } from "./OpenEnaExportApplicabilityNote";
import { parseCsv } from "@/lib/open-ena/csv";
import { CSV_DOWNLOAD_MEDIA_TYPE, csvDownloadPayload } from "@/lib/open-ena/csv-download";
import { parseXlsx, codedDataFileKind } from "@/lib/open-ena/spreadsheet";
import { sha256TextV3, canonicalJsonV3 } from "@/lib/open-ena/model-v3/canonical-json";
import { JENA_RUNTIME_VERSION, JENA_SOURCE_COMMIT, JENA_SOURCE_URL, type OpenEnaMode, type CameraPreset, type ParsedDataset } from "@/lib/open-ena/types";
import { buildPresentationArtifactV3 } from "@/lib/open-ena/presentation-artifact-v3";
import { parseBundleJsonV3 } from "@/lib/open-ena/bundle-json-v3";
import { assertPresentationArtifactContractV3 } from "@/lib/open-ena/bundle-contract-v3";
import { prepareWorkspacePresentationV3, workspacePresetTwoDAxisDecisionV3 } from "@/lib/open-ena/workspace-presentation-v3";
import { presentBoundResultV3, presentBoundGroupDisplayV3, presentRetainedEndpointContrastV3 } from "@/lib/open-ena/bound-presentation-v3";
import { exportContrastV3 } from "@/lib/open-ena/contrast-export-v3";
import { buildContrastV3 } from "@/lib/open-ena/contrasts";
import OpenEnaDataView, { type OpenEnaDataViewContext } from "./OpenEnaDataView";
import { buildDataViewPresentationV3 } from "@/lib/open-ena/data-view-presentation-v3";
import { buildHistoricalDataViewV3, buildDataViewV3 } from "@/lib/open-ena/data-view-export";
import { buildTrajectoryPresentationV3 } from "@/lib/open-ena/trajectory-presentation-v3";
import { buildLongitudinalViewV3, type OpenEnaTrajectoryControlsV3 } from "@/lib/open-ena/longitudinal-bound-v3";
import { runOpenEnaInferenceV3, runOpenEnaTrajectoryInferenceV3, assertOpenEnaTrajectoryInferenceConsumerV3 } from "@/lib/open-ena/inference-v2";
import type { OpenEnaEndpointControlsV3 } from "@/lib/open-ena/inference-consumers-v3";
import { buildAiInterpretationReviewV3 } from "@/lib/open-ena/ai-interpretation";
import { buildHistoricalOnaViewV3, buildOnaBoundViewV3 } from "@/lib/open-ena/ona-bound-view-v3";
import { exportNativeStatisticsV3, type NativeInferenceV3 } from "@/lib/open-ena/native-statistics-export-v3";
import { buildMethodsReportV3 } from "@/lib/open-ena/methods-v3";
import { exportCanonicalConfigV3, exportDraftV3, exportCurrentAnalysisV3, exportStaleAuditV3, exportReferenceV2, type ExportFileDescriptorV3 } from "@/lib/open-ena/model-artifact-exports-v3";
import { captureAnalysisSetV3, compareAnalysisSetsV3, upsertAnalysisSetV3, type OpenEnaAnalysisSetV3 } from "@/lib/open-ena/sets-bound-v3";
import { nextAnalysisSetRemovalFocusId } from "@/lib/open-ena/analysis-set-focus";
import {
  analysisSetCaptureEligibilityV3,
  analysisSetCapturePredicateLabelV3,
  analysisSetCompareEligibilityV3,
  analysisSetComparePredicateLabelV3,
} from "@/lib/open-ena/analysis-workflow-eligibility-v3";
import { OpenEnaUnmetPrerequisiteList } from "./OpenEnaUnmetPrerequisiteList";
import { openEnaCodeColorPair } from "@/lib/open-ena/code-color-presets";
import { codeColorFor } from "@/lib/open-ena/plot-style";
import type { OpenEnaNodeLayoutPositions, OpenEnaNodeDimensionPosition } from "@/lib/open-ena/node-layout";
import {
  cameraForPreset,
  selectOpenEnaWorkspacePlotAxis,
  type OpenEna3dCamera,
  type OpenEna3dAspectRatio,
} from "@/lib/open-ena/plot3d";
import {
  openEnaAiLocalScientificIdentityV3,
  openEnaConsumerAuthorityKeyV3,
} from "@/lib/open-ena/workspace-consumer-authority-v3";
import { resolveOpenEnaGroupDisplayOptions } from "@/lib/open-ena/group-display";
import { prepareTeachingSampleV3, SAMPLE_SOURCE_DESCRIPTORS_V3 } from "@/lib/open-ena/sample-source-v3";
import {
  TEACHING_SAMPLE_CATALOG,
  teachingSampleFirstSuccessProgress,
  teachingSampleKindFromLoadRequest,
  type TeachingSampleBuildPhase,
  type TeachingSampleKind,
} from "@/lib/open-ena/teaching-sample-guide";
import { OpenEnaTeachingSampleLibrary } from "./OpenEnaTeachingSampleLibrary";
import { OpenEnaTeachingSampleProgress } from "./OpenEnaTeachingSampleProgress";
import { prepareTypedCsvSourceV3, previewSourceTypesV3, type SourceTypeDeclarationsV3, type SourceColumnTypeV3 } from "@/lib/open-ena/source-preparation-v3";
import type { PresentationArtifactV3, BoundOnaResultV3, BoundStandardResultV3, ModelWorkspaceDraftsV3 } from "@/lib/open-ena/model-v3/types";
import OpenEnaPlot from "./OpenEnaPlot";
import OpenEnaInteractive3DPlot from "./OpenEnaInteractive3DPlot";
import OpenEnaGroupContrast from "./OpenEnaGroupContrast";
import OpenEna3DGroupContrast from "./OpenEna3DGroupContrast";
import OpenEnaOrderedResultLayout from "./OpenEnaOrderedResultLayout";
import OpenEna3DOrderedResultLayout from "./OpenEna3DOrderedResultLayout";
import OpenEnaAiInterpretation, { openEnaAiSavedWorkspaceEvidenceChanged } from "./OpenEnaAiInterpretation";
import OpenEnaCodeColorPicker from "./OpenEnaCodeColorPicker";
import { OpenEnaTrajectoryAnalysisPanelV3, trajectoryAnalysisCopyV3 } from "./model-v3/OpenEnaTrajectoryAnalysisPanelV3";
import type { OpenEnaTrajectoryPathControlsV3 } from "@/lib/open-ena/trajectory-path-inference-v3";
import type { OpenEnaTrajectoryExportOptionsV3 } from "@/lib/open-ena/trajectory-export-v3";
import { OpenEnaNativeStatsPanelV3 } from "./model-v3/OpenEnaNativeStatsPanelV3";
import { OpenEnaModelTabsV3, type OpenEnaModelScientificSummaryV3 } from "./model-v3/OpenEnaModelTabsV3";
import { modelRebuildBlockingChecklistV3 } from "./model-v3/OpenEnaRebuildBlockingChecklistV3";
import { OpenEnaUnitsPanelV3 } from "./model-v3/OpenEnaUnitsPanelV3";
import { OpenEnaHorizonsPanelV3 } from "./model-v3/OpenEnaHorizonsPanelV3";
import { OpenEnaWindowsPanelV3, type OpenEnaReferenceSelectionPreviewV3 } from "./model-v3/OpenEnaWindowsPanelV3";
import { OpenEnaCodesPanelV3, createOpenEnaCodesPreviewV3 } from "./model-v3/OpenEnaCodesPanelV3";
import { OpenEnaImportPreviewV3 } from "./model-v3/OpenEnaImportPreviewV3";
import { useOpenEnaWorkspaceV3, sameScientificContextV3, workspaceDraftExportableV3, workspaceRawBlockersV3, type WorkspaceWorkerV3 } from "./model-v3/workspace-controller";
import { buildWorkspacePreviewsV3 } from "./model-v3/workspace-previews";
import { modelScientificContextV3 } from "./model-v3/model-state";
import { captureOpenEnaCloudWorkspace, type RestoredOpenEnaCloudWorkspace, type OpenEnaCloudPresentation } from "@/lib/open-ena/cloud-workspace";
import type { OpenEnaCloudWorkbenchBridge } from "@/lib/open-ena/cloud-workbench-bridge";
import { buildReferenceV2 } from "@/lib/open-ena/model-v3/reference-v2";
import { getOpenEnaCloudCopy } from "@/lib/open-ena/cloud-copy";
import type { SavedOpenEnaAiInterpretation } from "@/lib/open-ena/cloud-workspace-extras";

import { createOpenEnaPluginContextV1 } from "@/lib/open-ena/plugins/runtime-context";
import { openEnaRuntimePluginAvailability, openEnaHistorical3dDisplayAvailability } from "@/lib/open-ena/plugins/runtime-registry";

interface OpenEnaWorkspaceProps {
  locale: Locale;
  onLocaleChange?: (locale: Locale) => void;
  providerDescriptor?: { provider: string; model: string };
  operationOwnerKey?: string | null;
  runtimeDisabledPluginIds?: readonly string[];
  initialSource?: { dataset: ParsedDataset; datasetSha256: string; drafts: ModelWorkspaceDraftsV3 };
  worker?: WorkspaceWorkerV3;
  initialCloudWorkspace?: RestoredOpenEnaCloudWorkspace;
  cloudBridge?: MutableRefObject<OpenEnaCloudWorkbenchBridge | null>;
  cloudControls?: ReactNode;
  onCloudChange?: () => void;
  onLocalOnlyWorkChange?: (hasWork: boolean) => void;
}

class OpenEnaKnownWorkspaceFailureV3 extends Error {
  constructor(readonly failure: OpenEnaWorkspaceFailureV3) {
    super(failure.id);
    this.name = "OpenEnaKnownWorkspaceFailureV3";
  }
}


async function readWorkspaceUtf8File(file: File, failureId: "coded-data-invalid-utf8" | "artifact-invalid-utf8" | "preset-invalid-utf8"): Promise<string> {
  const bytes = await file.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new OpenEnaKnownWorkspaceFailureV3({ id: failureId }); }
}

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
    <details className="ena-result-data" data-testid="open-ena-result-tables">
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
              onClick={() => onSelect(tab.key)}
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
          data-testid="open-ena-result-table-export"
          aria-label={model.export.ariaLabel}
          aria-describedby={model.export.applicabilityNoteId ?? undefined}
          title={model.export.applicabilityNote ?? undefined}
          disabled={model.export.disabled}
          onClick={() => {
            if (!model.export.disabled) onExport();
          }}
        >
          {model.export.label} ↓
        </button>
      </div>
      {model.export.applicabilityNote && model.export.applicabilityNoteId && model.export.applicabilityAction ? (
        <OpenEnaExportApplicabilityNote
          id={model.export.applicabilityNoteId}
          action={model.export.applicabilityAction}
          text={model.export.applicabilityNote}
          reason={model.export.applicabilityReason}
          familyApplies={model.export.applicabilityFamilyApplies}
        />
      ) : null}
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

const OPEN_ENA_RAIL_MODES = ["data", "model", "plot", "stats", "ai"] as const;
const emptyNodePositions = new Map<string, OpenEnaNodeDimensionPosition>();
// A fresh [] default is a new identity on every render, including a rail
// orientation update, and rebuilds the 3D plot spec.
const NO_RUNTIME_DISABLED_PLUGIN_IDS: readonly string[] = Object.freeze([]);

function openEnaRailToolbarOrientation(toolbar: HTMLElement): "horizontal" | "vertical" {
  const buttons = toolbar.querySelectorAll<HTMLElement>(".ena-rail-button");
  const first = buttons[0]?.getBoundingClientRect();
  const second = buttons[1]?.getBoundingClientRect();
  if (!first || !second || first.width < 1 || second.width < 1) {
    return window.matchMedia("(max-width: 900px)").matches ? "horizontal" : "vertical";
  }
  return Math.abs(second.left - first.left) > Math.abs(second.top - first.top) ? "horizontal" : "vertical";
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

function downloadCsv(filename: string, contents: string) {
  const payload = csvDownloadPayload(contents, CSV_DOWNLOAD_MEDIA_TYPE);
  downloadText(filename, payload.contents, payload.type);
}

function downloadJson(filename: string, data: unknown, compact = false) {
  downloadText(filename, `${JSON.stringify(data, null, compact ? undefined : 2)}\n`, "application/json;charset=utf-8");
}


function ResearchTableV3({ rows, label, unavailable, boundedRows, columnLabels }: { rows: readonly object[]; label: string; unavailable: string; boundedRows: (shown: number, total: number) => string; columnLabels?: Readonly<Record<string, string>> }) {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return <div className="ena-result-table-wrap" role="region" aria-label={label} tabIndex={0}><table>
    <caption>{label} ({rows.length})</caption><thead><tr>{columns.map((column) => <th key={column}>{columnLabels?.[column] ?? column}</th>)}</tr></thead>
    <tbody>{rows.slice(0, 100).map((row, index) => <tr key={index}>{columns.map((column) => {
      const value = (row as Record<string, unknown>)[column];
      return <td key={column}>{value === null || value === undefined ? unavailable : typeof value === "object" ? JSON.stringify(value) : String(value)}</td>;
    })}</tr>)}</tbody></table>{rows.length > 100 && <p>{boundedRows(100, rows.length)}</p>}</div>;
}

export default function OpenEnaWorkspace({ locale, onLocaleChange, providerDescriptor, operationOwnerKey = null, initialSource, worker, runtimeDisabledPluginIds = NO_RUNTIME_DISABLED_PLUGIN_IDS,
  initialCloudWorkspace, cloudBridge, cloudControls, onCloudChange, onLocalOnlyWorkChange }: OpenEnaWorkspaceProps) {
  const workspaceId = useId();
  const rebuildBlockingChecklistId = `${workspaceId}-rebuild-blocking-checklist`;
  const copy = getOpenEnaCopy(locale);
  const modelV3Copy = copy.modelV3;
  const workspaceCopy = modelV3Copy.workspace;
  const researchTableCopy = { unavailable: workspaceCopy.data.unavailableCell, boundedRows: workspaceCopy.data.boundedRows };
  const authCopy = getOpenEnaAuthCopy(locale);
  const cloudCopy = getOpenEnaCloudCopy(locale);
  const restoredView = initialCloudWorkspace?.presentation;
  const controller = useOpenEnaWorkspaceV3({ initial: initialSource, restored: initialCloudWorkspace, worker });
  const { state, dispatch, dispatchModel, context, currentCompilation, currentPlan } = controller;
  const modelState = state.model, family = modelState.drafts.activeFamily, draft = modelState.drafts[family];
  const dataset = state.dataset, result = modelState.result;
  const exportFamily = openEnaExportFamilyFromResult(result);
  const baseDisplay = modelState.display[result?.configuration.analysisFamily ?? family];
  const display = useMemo(() => {
    if (!state.presetHiddenGroups || state.presetHiddenGroups.resultHash !== result?.binding.scientificResultSha256) return baseDisplay;
    return { ...baseDisplay, groups: { ...baseDisplay.groups, ...Object.fromEntries(state.presetHiddenGroups.tokens.map((token) => [token, { ...resolveOpenEnaGroupDisplayOptions(baseDisplay.groups, token), showUnitPoints: false, showMean: false, showConfidenceIntervals: false, showOutlierIntervals: false }])) } };
  }, [baseDisplay, state.presetHiddenGroups, result]);
  const current = modelState.resultStatus === "current" && currentPlan !== null;
  const [mode, setMode] = useState<OpenEnaMode>(restoredView?.mode ?? "data");
  const [railTabStop, setRailTabStop] = useState<OpenEnaMode>(restoredView?.mode ?? "data");
  const [railOrientation, setRailOrientation] = useState<"horizontal" | "vertical">("vertical");
  const [teachingSampleKind, setTeachingSampleKind] = useState<TeachingSampleKind | null>(null);
  const [dataViewContext, setDataViewContext] = useState<OpenEnaDataViewContext>("comparison");
  const [centerSurface, setCenterSurface] = useState<"plot" | "data">("plot");
  const [textScale, setTextScale] = useState(restoredView?.textScale ?? 1);
  const [showGroupLabels, setShowGroupLabels] = useState(restoredView?.showGroupLabels ?? true);
  const [unitCircle, setUnitCircle] = useState(restoredView?.unitCircle ?? false);
  const [plotSettingsOpen, setPlotSettingsOpen] = useState(false);
  const [view, setView] = useState<"2d" | "3d">(restoredView?.view ?? "2d");
  const [modelNavigation, setModelNavigation] = useState<{ tab: "units" | "horizons" | "windows" | "codes"; serial: number }>({ tab: "units", serial: 0 });
  const [error, setError] = useState<OpenEnaWorkspaceFailureV3 | null>(null);
  const [sourceBusy, setSourceBusy] = useState(false);
  const [sourcePreview, setSourcePreview] = useState<{ text: string; dataset: ParsedDataset; types: SourceTypeDeclarationsV3 } | null>(null);
  const [derivative, setDerivative] = useState<Awaited<ReturnType<typeof prepareTypedCsvSourceV3>> | null>(null);
  const [originalSource, setOriginalSource] = useState<{ text: string; name: string } | null>(initialCloudWorkspace?.originalSource ?? null);
  const sourceGeneration = useRef(0);
  const sourceFileTriggerRef = useRef<HTMLInputElement>(null);
  const railTriggerRefs = useRef<Partial<Record<OpenEnaMode, HTMLButtonElement | null>>>({});
  const railToolbarRef = useRef<HTMLDivElement>(null);
  const cancelRailFocusRestoreRef = useRef<() => void>(() => {});
  function cancelScheduledRailFocusRestore() {
    cancelRailFocusRestoreRef.current();
    cancelRailFocusRestoreRef.current = () => {};
  }
  useLayoutEffect(() => {
    const toolbar = railToolbarRef.current;
    if (!toolbar) return;
    const update = () => {
      const next = openEnaRailToolbarOrientation(toolbar);
      setRailOrientation((current) => current === next ? current : next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setRailTabStop((current) => current === mode ? current : mode);
  }, [mode]);
  const sourceDialogRef = useRef<HTMLElement>(null);
  const runButtonRef = useRef<HTMLButtonElement>(null);
  const staleRebuildRef = useRef<HTMLButtonElement>(null);
  const [previews, setPreviews] = useState<Awaited<ReturnType<typeof buildWorkspacePreviewsV3>>>({ units: { availability: "unavailable" }, horizons: { availability: "unavailable" } });
  const [activeCodeColor, setActiveCodeColor] = useState<{ code: string; context: typeof context } | null>(null);
  const activeColorIntent = activeCodeColor && sameScientificContextV3(activeCodeColor.context, context) && draft.codes.includes(activeCodeColor.code) ? activeCodeColor : null;
  const [primaryGroupName, setPrimaryGroupName] = useState(restoredView?.primaryGroupName ?? "");
  const [secondaryGroupName, setSecondaryGroupName] = useState(restoredView?.secondaryGroupName ?? "");
  const [axes, setAxes] = useState<string[]>(restoredView?.axes ?? []);
  const [showPoints, setShowPoints] = useState(restoredView?.showPoints ?? true), [showNetworks, setShowNetworks] = useState(restoredView?.showNetworks ?? true), [showLabels, setShowLabels] = useState(restoredView?.showLabels ?? true);
  const [showUnitLabels, setShowUnitLabels] = useState(restoredView?.showUnitLabels ?? false), [showVariance, setShowVariance] = useState(restoredView?.showVariance ?? true), [showTrajectories, setShowTrajectories] = useState(restoredView?.showTrajectories ?? false);
  const [showGroupCentroidPaths, setShowGroupCentroidPaths] = useState(restoredView?.showGroupCentroidPaths ?? true);
  const [endpointsOnly, setEndpointsOnly] = useState(restoredView?.endpointsOnly ?? false);
  const [visibleHorizons, setVisibleHorizons] = useState<string[] | null>(restoredView?.visibleHorizons ?? null);
  const [threeDAxes, setThreeDAxes] = useState<string[]>(restoredView?.threeDAxes ?? []);
  const [edgeThreshold, setEdgeThreshold] = useState(restoredView?.edgeThreshold ?? 0), [edgeScale, setEdgeScale] = useState(restoredView?.edgeScale ?? 1), [pointScale, setPointScale] = useState(restoredView?.pointScale ?? 1), [plotZoom, setPlotZoom] = useState(restoredView?.plotZoom ?? 1);
  const [flipX, setFlipX] = useState(restoredView?.flipX ?? false), [flipY, setFlipY] = useState(restoredView?.flipY ?? false);
  const [camera, setCamera] = useState<OpenEna3dCamera | null>(restoredView?.camera ?? null);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>(restoredView?.cameraPreset ?? "isometric");
  const cameraPositionOptions: Array<[CameraPreset, string]> = [["isometric", copy.plot.default3dCamera], ["xy", copy.plot.xy], ["xz", copy.plot.xz], ["yz", copy.plot.yz], ["yx", copy.plot.yx], ["zx", copy.plot.zx], ["zy", copy.plot.zy]];
  const [aspectRatio, setAspectRatio] = useState<OpenEna3dAspectRatio | null>(restoredView?.aspectRatio ?? null);
  const [presetPreview, setPresetPreview] = useState<PresentationArtifactV3 | null>(null);
  const [presetAxisNotice, setPresetAxisNotice] = useState<{ resultHash: string; dimensions: readonly [string, string] } | null>(null);
  const presetSerial = useRef(0);
  const [nodeOverrides, setNodeOverrides] = useState<{ hash: string; positions: OpenEnaNodeLayoutPositions }>({ hash: initialCloudWorkspace?.result?.binding.scientificResultSha256 ?? "", positions: new Map(restoredView?.nodePositions.map(([code, coordinates]) => [code, new Map(coordinates)]) ?? []) });
  const [hiddenUnitKeys, setHiddenUnitKeys] = useState<string[]>(restoredView?.hiddenUnitKeys ?? []);
  const [nativeContrast, setNativeContrast] = useState<{ key: string; value: Awaited<ReturnType<typeof buildContrastV3>> } | null>(null);
  const [consumerError, setConsumerError] = useState("");
  const [checkedDataView, setCheckedDataView] = useState<Awaited<ReturnType<typeof buildDataViewV3>> | null>(null);
  const [inferenceDesign, setInferenceDesign] = useState<"independent" | "paired" | "repeated">(restoredView?.inferenceDesign ?? "independent");
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>(restoredView?.selectedPeriods ?? []);
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [resultTable, setResultTable] = useState<OpenEnaResultTableKey>("coordinates");
  const [inference, setInference] = useState<{ key: string; value: NativeInferenceV3 } | null>(null);
  const [inferenceBusy, setInferenceBusy] = useState(false);
  const [trajectoryRanks, setTrajectoryRanks] = useState<{ frameKey: string; items: NonNullable<OpenEnaTrajectoryExportOptionsV3["ranks"]> }>({ frameKey: "", items: [] });
  const [aiReview, setAiReview] = useState<{ key: string; inference: NativeInferenceV3; value: Awaited<ReturnType<typeof buildAiInterpretationReviewV3>> } | null>(null);
  const [aiLimitation, setAiLimitation] = useState("");
  const [sets, setSets] = useState<OpenEnaAnalysisSetV3[]>(initialCloudWorkspace?.analysisSets ?? []);
  const [setsBusy, setSetsBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [savedAiInterpretation, setSavedAiInterpretation] = useState<SavedOpenEnaAiInterpretation | null>(initialCloudWorkspace?.aiInterpretation ?? null);
  const [setComparison, setSetComparison] = useState<ReturnType<typeof compareAnalysisSetsV3> | null>(initialCloudWorkspace?.setComparison ?? null);
  const pendingSetFocusIdRef = useRef<string | null>(null);
  const pendingSetFocusCancelRef = useRef<() => void>(() => {});
  const plotSvgRef = useRef<SVGSVGElement>(null);
  const latest = useRef({ state, currentPlan, current }); latest.current = { state, currentPlan, current };
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const resultHash = result?.binding.scientificResultSha256 ?? "";
  const presentation = useMemo(() => result ? presentBoundResultV3(result) : null, [result]);
  const resultTableSource = useMemo(() => result ? {
    set: result.set,
    projectionReference: result.executionProvenance.projection.type === "reference" ? true : null,
  } : null, [result]);
  const resultTableAvailability = useMemo(() => resultTableSource ? openEnaResultTableAvailability({
    modelType: resultTableSource.set.modelType,
    projectionReference: Boolean(resultTableSource.projectionReference),
  }) : null, [resultTableSource]);
  const resultTableRowCounts = useMemo(() => resultTableSource ? openEnaResultTableRowCounts(resultTableSource) : null, [resultTableSource]);
  const resultTablePreviewRows = useMemo(() => {
    if (!resultTableSource || !resultTableAvailability?.[resultTable].available) return [];
    return buildOpenEnaResultTable(resultTableSource, resultTable, { limit: 100 });
  }, [resultTableSource, resultTableAvailability, resultTable]);
  const resultTableViewModel = useMemo(() => {
    if (!resultTableRowCounts || !resultTableAvailability) return null;
    const model = buildOpenEnaResultTableViewModel({
      selectedKey: resultTable,
      rowCounts: resultTableRowCounts,
      selectedRows: resultTablePreviewRows,
      availability: resultTableAvailability,
      copy: copy.resultTables,
    });
    const family = openEnaExportFamilyFromResult(result);
    const withCurrent = current ? model : { ...model, export: { ...model.export, disabled: true } };
    if (!family) return withCurrent;
    const disclosure = openEnaExportDisclosure(openEnaResultTableExportAction(resultTable), {
      family,
      current,
      projectionReference: Boolean(resultTableSource?.projectionReference),
      rowCount: resultTableRowCounts[resultTable],
    });
    return {
      ...withCurrent,
      export: {
        ...withCurrent.export,
        disabled: withCurrent.export.disabled || disclosure.disabled,
        applicabilityNote: openEnaExportApplicabilityText(disclosure, workspaceCopy.stats.exportApplicability),
        applicabilityNoteId: `${workspaceId}-result-table-export-applicability`,
        applicabilityReason: disclosure.reason,
        applicabilityAction: disclosure.action,
        applicabilityFamilyApplies: disclosure.familyApplies,
      },
    };
  }, [resultTableRowCounts, resultTableAvailability, resultTable, resultTablePreviewRows, copy.resultTables, current, result, resultTableSource, workspaceCopy.stats.exportApplicability, workspaceId]);
  const completedResultKind = result?.configuration.analysisFamily;
  const supportedAxes = presentation?.result.dimensions ?? [];
  const twoDAxes = axes.length === 2 && axes.every((axis) => supportedAxes.includes(axis)) ? axes : supportedAxes.slice(0, 2);
  const availableThreeDAxes = threeDAxes.length === 3 && threeDAxes.every((axis) => supportedAxes.includes(axis)) ? threeDAxes : supportedAxes.slice(0, 3);
  const threeDDimensions = availableThreeDAxes.length === 3 && new Set(availableThreeDAxes).size === 3 ? availableThreeDAxes : null;
  const selectedAxes = view === "3d" && threeDDimensions ? threeDDimensions : twoDAxes;
  const axisControlValues = view === "3d" ? availableThreeDAxes : twoDAxes;
  const xDimension = selectedAxes[0] ?? "", yDimension = selectedAxes[1] ?? "", zDimension = selectedAxes[2] ?? "";
  const standardThreeDPluginContext = useMemo(() => presentation && threeDDimensions && completedResultKind === "standard"
    ? createOpenEnaPluginContextV1({ result: presentation.result, selectedDimensions: threeDDimensions, stale: !current })
    : null, [presentation, availableThreeDAxes.join("\0"), completedResultKind, current]);
  const standardThreeDPluginAvailability = standardThreeDPluginContext
    ? (current ? openEnaRuntimePluginAvailability : openEnaHistorical3dDisplayAvailability)("ena-hk/3d-ena", standardThreeDPluginContext, runtimeDisabledPluginIds)
    : null;
  const genericThreeDAvailable = threeDDimensions !== null
    && (completedResultKind === "ona" || standardThreeDPluginAvailability?.enabled === true);
  const groups = result?.executionProvenance.identityDictionary.groups ?? [];
  const primary = groups.find((group) => group.token === primaryGroupName) ?? null;
  const secondary = groups.find((group) => group.token === secondaryGroupName) ?? null;
  const horizons = result?.executionProvenance.identityDictionary.horizons ?? [];
  const periods = selectedPeriods.map((token) => horizons.find((horizon) => horizon.token === token)?.fields).filter((value) => value !== undefined);
  const endpointControls: OpenEnaEndpointControlsV3 | null = primary && secondary && primary.token !== secondary.token && twoDAxes.length === 2
    ? { primaryGroup: primary.fields[0].value, secondaryGroup: secondary.fields[0].value, axes: [twoDAxes[0], twoDAxes[1]] } : null;
  const isTrajectory = result?.configuration.analysisFamily === "standard" && result.configuration.analysis.model.type !== "EndPoint";
  // A comparison selection remains inspectable after restore even though the
  // confirmation required for running paired/repeated inference is never restored.
  const trajectorySelection: OpenEnaTrajectoryControlsV3["request"] | null = isTrajectory && twoDAxes.length === 2
    && (inferenceDesign === "independent" ? endpointControls && periods[0] && periods.length === 1 : inferenceDesign === "paired" ? periods.length === 2 : periods.length >= 3)
    ? inferenceDesign === "independent"
      ? { kind: "trajectory-independent-period", period: periods[0], primaryGroup: endpointControls!.primaryGroup, secondaryGroup: endpointControls!.secondaryGroup }
      : inferenceDesign === "paired" ? { kind: "trajectory-paired-periods", group: primary?.fields[0].value ?? null, earlierPeriod: periods[0], laterPeriod: periods[1], cohortPolicy: "pairwise-complete" }
        : { kind: "trajectory-repeated-periods", group: primary?.fields[0].value ?? null, periods, cohortPolicy: "all-period-complete", posthocContrasts: "all-period-pairs" }
    : null;
  const trajectoryControls: OpenEnaTrajectoryControlsV3 | null = trajectorySelection && (inferenceDesign === "independent" || identityConfirmed)
    ? { axes: [twoDAxes[0], twoDAxes[1]], identityConfirmed, request: trajectorySelection } : null;
  const controls = isTrajectory ? trajectoryControls : endpointControls;
  const consumerKey = openEnaConsumerAuthorityKeyV3({
    binding: result?.binding ?? null,
    plan: currentPlan?.header.executionPlanSha256 ?? null,
    current,
    controls,
    resultCreatedAt: result?.createdAt ?? null,
  });
  const consumerKeyRef = useRef(consumerKey); consumerKeyRef.current = consumerKey;
  const activeInference = inference?.key === consumerKey && current ? inference.value : null;
  const historicalComparisonContext = isTrajectory ? { axes: twoDAxes, request: trajectorySelection } : endpointControls;
  const historicalComparisonKey = canonicalJsonV3(historicalComparisonContext);
  const historicalSavedEvidenceChanged = useMemo(() => openEnaAiSavedWorkspaceEvidenceChanged({
    record: savedAiInterpretation, result, comparisonContext: historicalComparisonContext,
  }), [savedAiInterpretation, result, historicalComparisonKey]);
  const historicalEvidenceInvalidated = modelState.resultStatus === "stale" || historicalSavedEvidenceChanged || activeInference !== null;
  const trajectoryFrameKey = canonicalJsonV3({ context, binding: result?.binding ?? null, plan: currentPlan?.header.executionPlanSha256 ?? null, current });
  const pathControls: Omit<OpenEnaTrajectoryPathControlsV3, "independentGroupsConfirmed"> | null = isTrajectory && threeDDimensions && primary && secondary && primary.token !== secondary.token
    ? { axes: [threeDDimensions[0], threeDDimensions[1], threeDDimensions[2]], identityConfirmed, primaryGroup: primary.fields[0].value, secondaryGroup: secondary.fields[0].value, horizons: periods, cohortPolicy: "all-period-complete", repetitions: 500, seed: 2026 } : null;
  const pathAdmission = {
    current,
    identityConfirmed,
    distinctGroups: Boolean(primary && secondary && primary.token !== secondary.token),
    axes: threeDDimensions ?? availableThreeDAxes,
    horizonCount: periods.length,
  };
  const captureEligibility = analysisSetCaptureEligibilityV3({
    current,
    standardFamily: completedResultKind === "standard",
    endpointModel: completedResultKind === "standard" && result?.configuration.analysis.model.type === "EndPoint",
    retainedDimensionCount: supportedAxes.length,
    retainedSetCount: sets.length,
  });
  const compareEligibility = analysisSetCompareEligibilityV3(sets);
  const capturePrerequisiteId = `${workspaceId}-capture-set-prerequisites`;
  const comparePrerequisiteId = `${workspaceId}-compare-set-prerequisites`;
  const captureUnmetItems = captureEligibility.unmet.map((id) => ({ id, label: analysisSetCapturePredicateLabelV3(id, workspaceCopy.artifacts.capturePredicates) }));
  const compareUnmetItems = compareEligibility.unmet.map((id) => ({ id, label: analysisSetComparePredicateLabelV3(id, workspaceCopy.artifacts.comparePredicates) }));
  useLayoutEffect(() => {
    const focusId = pendingSetFocusIdRef.current;
    if (!focusId) return;
    pendingSetFocusCancelRef.current();
    pendingSetFocusCancelRef.current = scheduleOpenEnaDomFocusRestore(
      document.getElementById(focusId),
      () => { pendingSetFocusIdRef.current = null; },
    );
    return () => {
      pendingSetFocusCancelRef.current();
      pendingSetFocusCancelRef.current = () => {};
    };
  }, [sets]);
  const activeAiReview = aiReview?.key === consumerKey && aiReview.inference === activeInference && current ? aiReview.value : null;
  const activeContrast = nativeContrast?.key === consumerKey && current ? nativeContrast.value : null;
  const retainedPlotContrast = useMemo(() => result
    ? presentRetainedEndpointContrastV3(result, primaryGroupName, secondaryGroupName, twoDAxes)
    : null, [result, primaryGroupName, secondaryGroupName, twoDAxes.join("\0")]);
  const groupDisplay = useMemo(() => retainedPlotContrast ? presentBoundGroupDisplayV3(retainedPlotContrast, display.groups, hiddenUnitKeys, display.allGroupsSuppressed) : null, [retainedPlotContrast, display.groups, hiddenUnitKeys, display.allGroupsSuppressed]);
  const contrast = groupDisplay?.contrast ?? null;
  const onaView = useMemo(() => result?.configuration.analysisFamily === "ona" ? buildHistoricalOnaViewV3(result as BoundOnaResultV3, primary?.token ?? null) : null, [result, primaryGroupName]);
  const dataViewGroup = dataViewContext === "primary" ? primary?.fields[0].value ?? null : dataViewContext === "secondary" ? secondary?.fields[0].value ?? null : null;
  const dataViewPresentation = useMemo(() => result ? buildDataViewPresentationV3(result, dataViewGroup) : null, [result, dataViewContext, primary, secondary]);
  const historicalData = useMemo(() => result ? buildHistoricalDataViewV3(result) : null, [result]);
  const dataViewColumns = useMemo(() => dataViewPresentation?.columns.map((column) => {
    if (!historicalData) return column;
    const metadata = historicalData.metadataColumns;
    const label = column.key === metadata.trajectoryOrdinal ? workspaceCopy.dataView.metadataLabels.trajectoryOrdinal
      : column.key === metadata.observedHorizons ? workspaceCopy.dataView.metadataLabels.observedHorizons
        : column.key === metadata.observedSourceRowIndices ? workspaceCopy.dataView.metadataLabels.observedSourceRowIndices
          : column.label;
    return label === column.label ? column : { ...column, label };
  }) ?? null, [dataViewPresentation, historicalData, workspaceCopy.dataView]);
  const longitudinal = useMemo(() => result && isTrajectory ? buildLongitudinalViewV3(result as BoundStandardResultV3) : null, [result, isTrajectory]);
  const contextKey = canonicalJsonV3(context);
  const diagnostics = currentCompilation?.result.diagnostics ?? [];
  const localizedDiagnostic = (diagnostic: { readonly id: string; readonly severity: "error" | "warning" | "information"; readonly scope: "dataset" | "units" | "horizons" | "windows" | "codes" | "rotation" | "reference" | "resources" | "migration" | "model"; readonly fieldPath?: string; readonly evidence?: { readonly totalCount: number; readonly sampleLimit: number; readonly truncated: boolean } }) => modelV3Copy.tabs.diagnostics.localize(diagnostic as Parameters<typeof modelV3Copy.tabs.diagnostics.localize>[0]);
  const modelCopy = modelV3Copy.tabs;
  const sourceTypingPreview = useMemo(() => sourcePreview ? previewSourceTypesV3(sourcePreview.dataset, sourcePreview.types) : null, [sourcePreview]);
  const sourceDialogOpen = sourcePreview !== null;
  useEffect(() => {
    if (!sourceDialogOpen) return;
    const frame = requestAnimationFrame(() => sourceDialogRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [sourceDialogOpen]);
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
  const initializedResultView = useRef<string | null>(initialCloudWorkspace ? resultHash : null);
  useEffect(() => {
    if (initializedResultView.current === resultHash) return;
    initializedResultView.current = resultHash;
    setPrimaryGroupName((previous) => groups.some((group) => group.token === previous) ? previous : groups[0]?.token ?? ""); setSecondaryGroupName((previous) => groups.some((group) => group.token === previous) ? previous : groups[1]?.token ?? ""); setSelectedPeriods([]); setIdentityConfirmed(false); setAxes([]); setThreeDAxes([]); setVisibleHorizons(null); setEndpointsOnly(false); setHiddenUnitKeys([]); setPresetAxisNotice(null);
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
    void buildAiInterpretationReviewV3(result, currentPlan, selection).then((value) => { if (active) { setAiReview({ key: consumerKey, inference: activeInference, value }); setAiLimitation(""); } }).catch((error: unknown) => { if (active) setAiLimitation(error instanceof Error ? error.message : String(error)); });
    return () => { active = false; };
  }, [activeInference, consumerKey, locale]);
  useEffect(() => {
    if (modelNavigation.serial) {
      document.getElementById(`ena-model-tab-${modelNavigation.tab}`)?.click();
      requestAnimationFrame(() => document.querySelector<HTMLElement>(modelNavigation.tab === "units" ? '.ena-model-units-v3-means' : '.ena-model-windows-v3 select')?.focus());
    }
  }, [modelNavigation]);
  const rebuildCue = state.rebuildCue;
  useEffect(() => {
    if (!rebuildCue) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        const target = staleRebuildRef.current ?? runButtonRef.current;
        target?.scrollIntoView({ block: "nearest", inline: "nearest" });
        if (target && !target.disabled) target.focus();
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [rebuildCue]);

  async function attempt(work: () => Promise<void>) {
    try {
      setError(null);
      await work();
    } catch (caught) {
      setError(caught instanceof OpenEnaKnownWorkspaceFailureV3 ? caught.failure : { id: "operation-failed" });
    }
  }
  function saveDescriptor(value: ExportFileDescriptorV3) { downloadText(value.filename, new TextDecoder().decode(value.bytes), value.mediaType); }
  function saveDerivative(value: NonNullable<typeof derivative>) {
    const url = URL.createObjectURL(new Blob([value.bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = value.dataset.name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function installSource(value: { dataset: ParsedDataset; datasetSha256: string }, drafts?: ModelWorkspaceDraftsV3, autoRun = false) {
    dispatch({
      type: "install-source",
      dataset: value.dataset,
      datasetSha256: value.datasetSha256,
      autoRun,
      ...(drafts !== undefined ? { drafts } : {}),
    });
    setSourcePreview(null);
    setMode("model");
  }
  function focusRebuildBlockingChecklist() {
    const checklist = document.getElementById(rebuildBlockingChecklistId);
    const checklistAction = checklist?.querySelector<HTMLElement>("a") ?? checklist;
    if (!checklistAction) return false;
    checklistAction.scrollIntoView({ block: "nearest", inline: "nearest" });
    checklistAction.focus();
    return true;
  }
  function requestRebuildAfterSourceReplacement() {
    setError(null);
    setMode("model");
    if (controller.canRun) {
      controller.run();
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (focusRebuildBlockingChecklist()) return;
        runButtonRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
        if (runButtonRef.current && !runButtonRef.current.disabled) runButtonRef.current.focus();
      });
    });
  }
  async function openCodedData(file: File) {
    setTeachingSampleKind(null);
    dispatch({ type: "clear-auto-run-intent" });
    const generation = ++sourceGeneration.current;
    setSourceBusy(true);
    try {
      if (file.size > 5 * 1024 * 1024) throw new OpenEnaKnownWorkspaceFailureV3({ id: "coded-data-too-large", limitMiB: 5 });
      if (codedDataFileKind(file.name) === "csv") {
        const text = await readWorkspaceUtf8File(file, "coded-data-invalid-utf8");
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
    } catch (failure) {
      // Superseded or cancelled source work no longer owns the workspace error.
      if (generation === sourceGeneration.current) throw failure;
    } finally { if (generation === sourceGeneration.current) setSourceBusy(false); }
  }
  async function confirmSourceTyping() {
    const preview = sourcePreview; if (!preview) return;
    const generation = ++sourceGeneration.current; setSourceBusy(true);
    try {
      const value = await prepareTypedCsvSourceV3(preview.text, preview.dataset, preview.types, new Date());
      if (generation !== sourceGeneration.current) return;
      setTeachingSampleKind(null);
      setDerivative(value); setOriginalSource({ text: preview.text, name: preview.dataset.name }); installSource(value);
    } catch (failure) {
      // Superseded or cancelled source work no longer owns the workspace error.
      if (generation === sourceGeneration.current) throw failure;
    } finally { if (generation === sourceGeneration.current) setSourceBusy(false); }
  }
  function cancelSourcePreparation(returnFocus = true) {
    const generation = ++sourceGeneration.current;
    setSourcePreview(null);
    setSourceBusy(false);
    if (returnFocus) requestAnimationFrame(() => { if (generation === sourceGeneration.current) sourceFileTriggerRef.current?.focus(); });
  }
  async function captureCurrentAnalysisSet() {
    if (!result || !currentPlan || !current || setsBusy) return;
    setSetsBusy(true);
    try {
      const captured = await captureAnalysisSetV3(result, currentPlan, { name: dataset?.name });
      if (mounted.current && latest.current.current && latest.current.state.model.result === result) {
        setSets((values) => upsertAnalysisSetV3(values, captured));
      }
    } finally { if (mounted.current) setSetsBusy(false); }
  }
  function removeCapturedAnalysisSet(setId: string) {
    const remaining = sets.filter((set) => set.id !== setId);
    pendingSetFocusIdRef.current = nextAnalysisSetRemovalFocusId(
      sets.map((set) => set.id),
      setId,
      analysisSetCaptureEligibilityV3({
        current,
        standardFamily: completedResultKind === "standard",
        endpointModel: completedResultKind === "standard" && result?.configuration.analysis.model.type === "EndPoint",
        retainedDimensionCount: supportedAxes.length,
        retainedSetCount: remaining.length,
      }).eligible,
    );
    setSets(remaining);
    setSetComparison((value) => (
      value && (value.primary.setId === setId || value.secondary.setId === setId) ? null : value
    ));
  }
  function onSourceDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    cancelSourcePreparation(true);
  }
  function focusRailButton(entry: OpenEnaMode) {
    setRailTabStop(entry);
    for (const candidate of OPEN_ENA_RAIL_MODES) {
      const element = railTriggerRefs.current[candidate];
      if (element) element.tabIndex = candidate === entry ? 0 : -1;
    }
    railTriggerRefs.current[entry]?.focus();
  }
  function onRailToolbarKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const focusedButton = event.target instanceof Element ? event.target.closest(".ena-rail-button") : null;
    const currentIndex = OPEN_ENA_RAIL_MODES.findIndex((entry) => railTriggerRefs.current[entry] === focusedButton);
    if (currentIndex < 0) return;
    let nextIndex = currentIndex;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        nextIndex = (currentIndex + 1) % OPEN_ENA_RAIL_MODES.length;
        break;
      case "ArrowUp":
      case "ArrowLeft":
        nextIndex = (currentIndex - 1 + OPEN_ENA_RAIL_MODES.length) % OPEN_ENA_RAIL_MODES.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = OPEN_ENA_RAIL_MODES.length - 1;
        break;
      case "Enter":
      case " ": {
        // Activate the button that received the key. A synthesized click can
        // land elsewhere if a deferred focus restore blurs this button first.
        event.preventDefault();
        event.stopPropagation();
        const entry = OPEN_ENA_RAIL_MODES[currentIndex];
        cancelScheduledRailFocusRestore();
        setRailTabStop(entry);
        setMode(entry);
        return;
      }
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    focusRailButton(OPEN_ENA_RAIL_MODES[nextIndex]);
  }
  function onRailPanelKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest("[role='dialog'], dialog")) return;
    event.preventDefault();
    event.stopPropagation();
    focusRailButton(mode);
    cancelRailFocusRestoreRef.current = scheduleOpenEnaDomFocusRestore(railTriggerRefs.current[mode] ?? null);
  }
  async function loadSample(trajectoryOrKind: boolean | TeachingSampleKind = false) {
    const kind = teachingSampleKindFromLoadRequest(trajectoryOrKind);
    const generation = ++sourceGeneration.current; setSourceBusy(true);
    try {
      const url = SAMPLE_SOURCE_DESCRIPTORS_V3[kind].url;
      const response = await fetch(url, { cache: "no-store" }); if (!response.ok) throw new OpenEnaKnownWorkspaceFailureV3({ id: "sample-unavailable" });
      const text = await response.text();
      const value = await prepareTeachingSampleV3(text, kind, new Date());
      if (generation !== sourceGeneration.current) return;
      setDerivative(value); setOriginalSource(value.original); installSource(value, value.drafts, true);
      setTeachingSampleKind(kind);
    } catch (failure) {
      // Superseded or cancelled source work no longer owns the workspace error.
      if (generation === sourceGeneration.current) throw failure;
    } finally { if (generation === sourceGeneration.current) setSourceBusy(false); }
  }
  function requestTeachingSample(kind: TeachingSampleKind) {
    switch (kind) {
      case "endpoint":
        return loadSample(false);
      case "trajectory":
        return loadSample(true);
      case "ona":
        return loadSample("ona");
      default: {
        const exhaustive: never = kind;
        return exhaustive;
      }
    }
  }
  async function runInference() {
    if (!result || !currentPlan || !current || !controls) return;
    const key = consumerKey; setInferenceBusy(true);
    try {
      const value = isTrajectory ? await runOpenEnaTrajectoryInferenceV3(result, currentPlan, controls as OpenEnaTrajectoryControlsV3)
        : await runOpenEnaInferenceV3(result, currentPlan, controls as OpenEnaEndpointControlsV3);
      if (key === consumerKeyRef.current) {
        if (value.kind === "open-ena-trajectory-inference") {
          await assertOpenEnaTrajectoryInferenceConsumerV3(value, result, currentPlan, value.controls);
          if (key !== consumerKeyRef.current) return;
          setTrajectoryRanks(previous => ({ frameKey: trajectoryFrameKey, items: [...(previous.frameKey === trajectoryFrameKey ? previous.items : []).filter(item => (item.value as typeof value).inference.kind !== value.inference.kind), { value, controls: value.controls }] }));
        }
        setInference({ key, value });
      }
    } catch (failure) {
      if (key === consumerKeyRef.current) throw failure;
    } finally { setInferenceBusy(false); }
  }
  function confirmCurrentIdentityBearingExport() { return window.confirm(copy.stats.identityExportConfirmation); }
  function applyPlotAxisSelection(index: number, dimension: string) {
    const next = selectOpenEnaWorkspacePlotAxis(
      {
        twoD: twoDAxes.length === 2 ? [twoDAxes[0], twoDAxes[1]] : null,
        threeD: availableThreeDAxes.length === 3
          ? [availableThreeDAxes[0], availableThreeDAxes[1], availableThreeDAxes[2]]
          : null,
      },
      view,
      index,
      dimension,
      supportedAxes,
    );
    switch (view) {
      case "3d":
        setThreeDAxes(next.threeD ? [...next.threeD] : []);
        return;
      case "2d":
        setAxes(next.twoD ? [...next.twoD] : []);
        setPresetAxisNotice(null);
        return;
      default: {
        const exhaustive: never = view;
        void exhaustive;
      }
    }
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
    const lease = captureImageExport();
    if (!lease?.()) return;
    const serialized = serializedPlotSvg();
    if (serialized) downloadText(`open-ena-${Date.now()}-plot.svg`, serialized.svg, "image/svg+xml;charset=utf-8");
  }

  function exportPlotPng() {
    const lease = captureImageExport();
    if (!lease?.()) return;
    const serialized = serializedPlotSvg();
    if (!serialized) return;
    const sourceUrl = URL.createObjectURL(new Blob([serialized.svg], { type: "image/svg+xml;charset=utf-8" }));
    const image = new Image();
    image.onload = () => {
      if (!lease()) { URL.revokeObjectURL(sourceUrl); return; }
      const scale = 3;
      const rasterDimensions = resolveOpenEnaPlotRasterDimensions(serialized.dimensions, scale);
      const canvas = document.createElement("canvas");
      canvas.width = rasterDimensions.width;
      canvas.height = rasterDimensions.height;
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(sourceUrl);
        setError({ id: "png-canvas-unavailable" });
        return;
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(sourceUrl);
        if (!lease()) return;
        if (!blob) {
          setError({ id: "png-encoding-failed" });
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
      if (lease()) setError({ id: "png-render-failed" });
    };
    image.src = sourceUrl;
  }

  const renderedSource = presentation?.codeSourceByRenderedCode ?? {};
  // These identities feed the 3D plot spec. A fresh object on every workspace
  // render, including a rail-orientation update, rebuilds Plotly at its
  // declared 590px height and leaves a shorter responsive canvas unmatched.
  const codeColors = useMemo(() => Object.fromEntries(Object.entries(renderedSource).map(([rendered, source]) => [rendered, codeColorFor(display.codeColors, source)])), [renderedSource, display.codeColors]);
  const sourcePositions = nodeOverrides.hash === resultHash ? nodeOverrides.positions : emptyNodePositions;
  const cloudPresentation: OpenEnaCloudPresentation = { mode, view, primaryGroupName, secondaryGroupName, axes, threeDAxes,
    camera, cameraPreset, aspectRatio, nodePositions: [...sourcePositions].map(([code, coordinates]) => [code, [...coordinates]]),
    visibleHorizons, hiddenUnitKeys, showPoints, showNetworks, showLabels, showGroupLabels, showUnitLabels, showVariance,
    showTrajectories, showGroupCentroidPaths, endpointsOnly, unitCircle, flipX, flipY, edgeThreshold, edgeScale, pointScale, plotZoom,
    textScale, inferenceDesign, selectedPeriods };
  const cloudPresentationKey = canonicalJsonV3({ ...cloudPresentation, mode: "data" });
  const cloudChangeInputs = [dataset, modelState.drafts, modelState.display, result, originalSource, cloudPresentationKey, activeInference, state.references, state.raw, state.presetHiddenGroups, savedAiInterpretation, sets, setComparison, state.historical];
  const cloudBaseline = useRef(cloudChangeInputs);
  useEffect(() => {
    const changed = cloudChangeInputs.some((value, index) => value !== cloudBaseline.current[index]);
    cloudBaseline.current = cloudChangeInputs;
    if (changed) onCloudChange?.();
  }, [dataset, modelState.drafts, modelState.display, result, originalSource, cloudPresentationKey, activeInference, state.references, state.raw, state.presetHiddenGroups, savedAiInterpretation, sets, setComparison, state.historical, onCloudChange]);
  const cloudWorkPending = modelState.runStatus === "running" || sourceBusy || aiBusy || setsBusy || inferenceBusy || controller.importPending;
  useLayoutEffect(() => {
    onLocalOnlyWorkChange?.(sourcePreview !== null || state.preview !== null || cloudWorkPending);
  }, [sourcePreview, state.preview, cloudWorkPending, onLocalOnlyWorkChange]);
  useLayoutEffect(() => {
    if (!cloudBridge) return;
    const bridge: OpenEnaCloudWorkbenchBridge = { running: cloudWorkPending,
      defaultTitle: dataset?.name ?? null,
      capture: async () => {
        if (cloudWorkPending) throw new Error(cloudCopy.waitForAnalysis);
        let sourceReference = initialCloudWorkspace?.sourceReference
          && initialCloudWorkspace.sourceReference.source.executionPlanSha256 === result?.binding.executionPlanSha256
          ? initialCloudWorkspace.sourceReference : null;
        if (state.sourceWitness && current && currentPlan && result?.configuration.analysisFamily === "standard"
          && result.configuration.analysis.model.type === "EndPoint" && result.configuration.analysis.rotation.type !== "reference") {
          sourceReference = await buildReferenceV2(state.sourceWitness, { displayName: dataset?.name ?? "Saved Reference", currentPlan });
        }
        let statisticsReport = initialCloudWorkspace?.statisticsReport && canonicalJsonV3(initialCloudWorkspace.statisticsReport.binding) === canonicalJsonV3(result?.binding ?? null)
          ? initialCloudWorkspace.statisticsReport : null;
        if (activeInference && result && currentPlan && controls) {
          statisticsReport = JSON.parse((await exportNativeStatisticsV3(activeInference, result, currentPlan, controls)).contents) as Record<string, unknown>;
        }
        return captureOpenEnaCloudWorkspace({ state: { ...state, model: { ...modelState,
          display: { ...modelState.display, [result?.configuration.analysisFamily ?? family]: display } } }, currentPlan,
          presentation: cloudPresentation, sourceReference, originalSource, statisticsReport,
          aiInterpretation: savedAiInterpretation, analysisSets: sets, setComparison });
      } };
    cloudBridge.current = bridge;
    return () => { if (cloudBridge.current === bridge) cloudBridge.current = null; };
  });
  const nodeLayout = useMemo<OpenEnaNodeLayoutPositions>(() => new Map(Object.entries(renderedSource).flatMap(([rendered, source]) => sourcePositions.has(source) ? [[rendered, sourcePositions.get(source)!] as const] : [])), [renderedSource, sourcePositions]);
  const moveNode = (rendered: string, position: OpenEnaNodeDimensionPosition) => {
    const source = renderedSource[rendered]; if (!Object.hasOwn(renderedSource, rendered) || !source) throw new Error(workspaceCopy.plot.unknownRenderedCode);
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
      codeColors: Object.fromEntries(Object.values(renderedSource).map((source) => [source, codeColorFor(display.codeColors, source)])),
      nodeOverrides: [...sourcePositions].map(([code, coordinates]) => ({ code, coordinates: Object.fromEntries(coordinates) })),
      dimensions: [...selectedAxes], ...(camera ? { camera3d: camera } : {}),
      layerOptions: { showPoints, showNetworks, showTrajectories, showLabels, showGroupLabels, showUnitLabels, showVariance, endpointsOnly, flipX, flipY, edgeThreshold, edgeScale, pointScale, plotZoom },
    });
    downloadJson("bound-presentation-preset.json", preset);
  }
  async function previewPresentation(file: File) {
    const intent = ++presetSerial.current, capturedContext = context, capturedResult = result;
    const ownsPreview = () => intent === presetSerial.current && latest.current.state.model.result === capturedResult && sameScientificContextV3(capturedContext, modelScientificContextV3(latest.current.state.model));
    try {
      if (file.size > 16 * 1024 * 1024) throw new OpenEnaKnownWorkspaceFailureV3({ id: "preset-too-large", limitMiB: 16 });
      const parsed = parseBundleJsonV3(await readWorkspaceUtf8File(file, "preset-invalid-utf8")) as PresentationArtifactV3;
      assertPresentationArtifactContractV3(parsed);
      if (!ownsPreview()) return;
      setPresetPreview(parsed);
    } catch (failure) {
      if (ownsPreview()) throw failure;
    }
  }
  const presetCodesCompatible = !result || result.executionProvenance.labels.codes.every((code) => draft.codes.includes(code.sourceColumn));
  function applyPresentation() {
    if (!presetPreview || !result || completedResultKind !== family || !presetCodesCompatible || display.allCodesSuppressed || display.allGroupsSuppressed) return;
    const prepared = prepareWorkspacePresentationV3(result, presetPreview);
    if (prepared.status !== "applied") return;
    const value = prepared.presentation, layers = value.layerOptions ?? {};
    dispatch({ type: "apply-display-preset", context, resultHash, codeVisibility: prepared.codeVisibility, codeColors: prepared.codeColors, hiddenGroupTokens: prepared.hiddenGroupTokens });
    setNodeOverrides({ hash: resultHash, positions: prepared.nodePositions });
    if (value.dimensions.length === 3) {
      setThreeDAxes([...value.dimensions]);
      setView("3d");
      setPresetAxisNotice(null);
    } else if (value.dimensions.length === 2) {
      const plotted: readonly [string, string] = [value.dimensions[0], value.dimensions[1]];
      const axisDecision = workspacePresetTwoDAxisDecisionV3(Boolean(activeInference), twoDAxes, plotted);
      switch (axisDecision) {
        case "apply-axes":
          setAxes([...value.dimensions]);
          setView("2d");
          setPresetAxisNotice(null);
          break;
        case "keep-confirmed-axes":
          setView("2d");
          setPresetAxisNotice({ resultHash, dimensions: plotted });
          break;
        default: {
          const exhaustive: never = axisDecision;
          void exhaustive;
        }
      }
    } else setPresetAxisNotice(null);
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
  const captureImageExport = () => {
    const captured = latest.current;
    if (!mounted.current || !captured.current || !captured.currentPlan || !captured.state.model.result || !confirmCurrentIdentityBearingExport()) return null;
    const capturedContext = canonicalJsonV3(modelScientificContextV3(captured.state.model));
    return () => mounted.current && latest.current.current && latest.current.currentPlan === captured.currentPlan && latest.current.state.model.result === captured.state.model.result && canonicalJsonV3(modelScientificContextV3(latest.current.state.model)) === capturedContext;
  };
  const isPluginResultCurrent = () => mounted.current && latest.current.current && latest.current.state.model.result === result
    && latest.current.currentPlan === currentPlan && currentPlan !== null;
  const plotProps = { ...graph, codeColors, captureImageExport, runtimeDisabledPluginIds, resultIsStale: !current, isPluginResultCurrent, groupDisplay: groupDisplay ?? undefined, groupColumn: presentation?.config.groupColumn ?? null,
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
  const restoredCopy = restoredWorkbenchCopy(locale);
  const groupSelectors = <section className="ena-group-contrast-controls ena-restored-group-selectors" aria-label={copy.contrast.title} data-testid="open-ena-ona-descriptive-group-controls"><h3>{copy.contrast.title}</h3><p>{copy.contrast.selectedAxes}: {twoDAxes.join(" · ")}</p><div className="ena-two-fields"><label>{copy.contrast.primary}<select aria-label={copy.contrast.primary} value={primaryGroupName} onChange={(e) => setPrimaryGroupName(e.target.value)}><option value="">{copy.model.noGroup}</option>{groups.map((group) => <option key={group.token} value={group.token} aria-label={group.displayLabel}>{group.fields.length === 1 && typeof group.fields[0].value.value === "string" && group.fields[0].value.value.trim() ? group.fields[0].value.value : group.displayLabel}</option>)}</select></label>
    <label>{copy.contrast.secondary}<select aria-label={copy.contrast.secondary} value={secondaryGroupName} onChange={(e) => setSecondaryGroupName(e.target.value)}><option value="">{copy.model.noGroup}</option>{groups.map((group) => <option key={group.token} value={group.token} aria-label={group.displayLabel}>{group.fields.length === 1 && typeof group.fields[0].value.value === "string" && group.fields[0].value.value.trim() ? group.fields[0].value.value : group.displayLabel}</option>)}</select></label>
    </div>{completedResultKind === "ona" && <p>{copy.ona.layout.descriptiveBoundary}</p>}</section>;

  const persistentPlotTools = <OpenEnaPersistentPlotTools analysisKind={completedResultKind === "ona" ? "ona" : "ena"}
    title={completedResultKind === "ona" ? copy.ona.presenter.title : workspaceCopy.plot.toolsTitle} copy={copy.ona.plotTools}
    edgeScale={edgeScale} edgeThreshold={edgeThreshold} pointScale={pointScale} textScale={textScale}
    showLabels={showLabels} showGroupLabels={showGroupLabels} showUnitLabels={showUnitLabels} showPoints={showPoints}
    unitCircle={unitCircle} flipX={flipX} flipY={flipY} plotZoom={plotZoom} nodeLayoutOverrideCount={sourcePositions.size}
    resetNodeLayoutLabel={copy.plot.resetNodeLayout} onEdgeScaleChange={setEdgeScale} onEdgeThresholdChange={setEdgeThreshold}
    onPointScaleChange={setPointScale} onTextScaleChange={setTextScale} onShowLabelsChange={setShowLabels} onShowGroupLabelsChange={setShowGroupLabels}
    onShowUnitLabelsChange={setShowUnitLabels} onShowPointsChange={setShowPoints} onUnitCircleChange={setUnitCircle}
    onFlipXChange={setFlipX} onFlipYChange={setFlipY} onPlotZoomChange={setPlotZoom}
    onResetNodeLayout={() => setNodeOverrides({ hash: resultHash, positions: new Map() })}
    onReset={() => { setEdgeScale(1); setEdgeThreshold(0); setPointScale(1); setTextScale(1); setFlipX(false); setFlipY(false); setPlotZoom(1); setThreeDAxes([]); setCameraPreset("isometric"); setCamera(cameraForPreset("isometric")); setAspectRatio(null); setHiddenUnitKeys([]); setShowLabels(true); setShowGroupLabels(true); setShowUnitLabels(false); setShowPoints(true); setUnitCircle(false); }}
    settingsOpen={plotSettingsOpen} onSettingsOpenChange={setPlotSettingsOpen} disabled={!result} />;
  const panelHeading = mode === "data"
    ? { kicker: restoredCopy.dataKicker, title: copy.data.title, description: copy.data.description }
    : mode === "model"
      ? { kicker: restoredCopy.modelKicker, title: copy.model.title, description: dataset?.source === "sample" ? restoredCopy.teachingModel : copy.model.description }
      : mode === "plot"
        ? { kicker: restoredCopy.plotKicker, title: completedResultKind === "ona" ? copy.ona.presenter.title : copy.plot.title, description: completedResultKind === "ona" ? copy.ona.presenter.description : copy.plot.description }
        : { kicker: restoredCopy.statsKicker, title: copy.stats.title, description: restoredCopy.statsDescription };
  const rebuildBlockingChecklist = modelRebuildBlockingChecklistV3({
    family,
    diagnostics,
    rawBlockers: workspaceRawBlockersV3(state),
  });
  const rebuildBlockingDescribedBy = rebuildBlockingChecklist.length > 0 ? `${rebuildBlockingChecklistId}-title` : undefined;
  const teachingBuildPhase: TeachingSampleBuildPhase = current ? "succeeded" : modelState.runStatus === "running" ? "running" : "pending";
  const teachingAdmissionSettled = currentCompilation !== null;
  const teachingGateLabels = rebuildBlockingChecklist.map((item) => ({
    id: item.predicateId,
    label: item.kind === "raw"
      ? modelV3Copy.tabs.blockingChecklist.raw[item.field]
      : localizedDiagnostic(item.diagnostic).summary,
  }));
  if (currentCompilation !== null && teachingGateLabels.length === 0
    && (currentCompilation.plan === null || currentCompilation.error !== null)) {
    teachingGateLabels.push({ id: "execution-plan", label: workspaceCopy.data.firstSuccess.gatesBlocked });
  }
  const teachingProgress = teachingSampleKind === null ? null : teachingSampleFirstSuccessProgress({
    loaded: true,
    draftsPrefilled: true,
    admissionSettled: teachingAdmissionSettled,
    remainingGateCount: teachingGateLabels.length,
    buildPhase: teachingBuildPhase,
  });
  const teachingFamilyLabel = teachingSampleKind === null ? "" : workspaceCopy.data.teachingSamples.families[TEACHING_SAMPLE_CATALOG[teachingSampleKind].family];
  const teachingSampleProgress = teachingProgress && teachingSampleKind ? (
    <OpenEnaTeachingSampleProgress
      kind={teachingSampleKind}
      familyLabel={teachingFamilyLabel}
      steps={teachingProgress}
      buildPhase={teachingBuildPhase}
      admissionSettled={teachingAdmissionSettled}
      remainingGates={teachingGateLabels}
      copy={workspaceCopy.data.firstSuccess}
    />
  ) : null;
  const teachingSampleCenterProgress = teachingProgress && teachingSampleKind ? (
    <OpenEnaTeachingSampleProgress
      kind={teachingSampleKind}
      familyLabel={teachingFamilyLabel}
      steps={teachingProgress}
      buildPhase={teachingBuildPhase}
      admissionSettled={teachingAdmissionSettled}
      remainingGates={teachingGateLabels}
      copy={workspaceCopy.data.firstSuccess}
      testId="open-ena-teaching-sample-progress-center"
    />
  ) : null;
  const modelActions = <div className="ena-model-actions">
    <button type="button" ref={runButtonRef} className="ena-action-button ena-action-primary ena-model-run-button" data-testid="open-ena-run-model"
      data-ena-rebuild-cue={rebuildCue?.reason}
      aria-describedby={rebuildBlockingDescribedBy}
      disabled={!controller.canRun || sourceBusy || sourcePreview !== null}
      onClick={() => { setError(null); controller.run(); }}>
      {result ? copy.model.rerun : copy.model.run}<span aria-hidden="true">→</span>
    </button>
    {modelState.runStatus === "running" && <div className="ena-model-run-progress">
      <p role="status" aria-live="polite"><progress max={100} value={state.progress?.value ?? 0} />{state.progress ? workspaceCopy.workerStage(state.progress.stage) : workspaceCopy.startingWorker}</p>
      <button type="button" className="ena-action-button ena-action-secondary ena-model-cancel-button" data-testid="open-ena-cancel-run" onClick={controller.cancel}>{workspaceCopy.cancelRun}</button>
    </div>}
  </div>;
  const exportApplicabilityCopy = workspaceCopy.stats.exportApplicability;
  const discloseExport = (
    action: OpenEnaStatsExportAction,
    overrides: Partial<Pick<OpenEnaExportDisclosureContext, "rowCount" | "inferenceReady">> = {},
  ): OpenEnaExportDisclosure | null => exportFamily ? openEnaExportDisclosure(action, {
    family: exportFamily,
    current,
    projectionReference: Boolean(resultTableSource?.projectionReference),
    referenceBound: Boolean(result?.binding.referenceId),
    inferenceReady: Boolean(activeInference),
    ...overrides,
  }) : null;
  const exportNoteId = (action: OpenEnaStatsExportAction, suffix = "") => `${workspaceId}-export-note-${action}${suffix}`;
  const onaEdgesDisclosure = discloseExport("ona-aggregate-edges");
  const onaAuditDisclosure = discloseExport("ona-deidentified-audit");
  const nativeStatsDisclosure = discloseExport("native-statistics");
  const dataViewDisclosure = discloseExport("bound-data-view", { rowCount: historicalData?.rows.length });
  const centerDataViewDisclosure = discloseExport("bound-data-view", { rowCount: dataViewPresentation?.rows.length });
  const methodsDisclosure = discloseExport("methods");
  const trajectoryBundleDisclosure = discloseExport("trajectory-bundle");
  const currentAnalysisDisclosure = discloseExport("current-analysis");
  const referenceDisclosure = discloseExport("reference");
  const contrastJsonDisclosure = discloseExport("contrast-json");
  const contrastEdgesDisclosure = discloseExport("contrast-edges");
  const applicabilityText = (disclosure: OpenEnaExportDisclosure | null) => disclosure ? openEnaExportApplicabilityText(disclosure, exportApplicabilityCopy) : "";
  const disclosedName = (label: string, disclosure: OpenEnaExportDisclosure | null, note: string) => disclosure?.disabled && note ? `${label}. ${note}` : undefined;
  const onaEdgesNote = applicabilityText(onaEdgesDisclosure);
  const onaAuditNote = applicabilityText(onaAuditDisclosure);
  const nativeStatsNote = applicabilityText(nativeStatsDisclosure);
  const dataViewNote = applicabilityText(dataViewDisclosure);
  const centerDataViewNote = applicabilityText(centerDataViewDisclosure);
  const methodsNote = applicabilityText(methodsDisclosure);
  const trajectoryBundleNote = applicabilityText(trajectoryBundleDisclosure);
  const currentAnalysisNote = applicabilityText(currentAnalysisDisclosure);
  const referenceNote = applicabilityText(referenceDisclosure);
  const contrastJsonNote = applicabilityText(contrastJsonDisclosure);
  const contrastEdgesNote = applicabilityText(contrastEdgesDisclosure);
  const onaEdgesNoteId = exportNoteId("ona-aggregate-edges");
  const onaAuditNoteId = exportNoteId("ona-deidentified-audit");
  const nativeStatsNoteId = exportNoteId("native-statistics");
  const dataViewNoteId = exportNoteId("bound-data-view");
  const centerDataViewNoteId = exportNoteId("bound-data-view", "-center");
  const methodsNoteId = exportNoteId("methods");
  const trajectoryBundleNoteId = exportNoteId("trajectory-bundle");
  const currentAnalysisNoteId = exportNoteId("current-analysis");
  const referenceNoteId = exportNoteId("reference");
  const contrastJsonNoteId = exportNoteId("contrast-json");
  const contrastEdgesNoteId = exportNoteId("contrast-edges");
  const analysisPanel = <div className={`ena-control-content ena-workspace-controls-v3 ena-restored-workbench${mode === "model" ? " ena-model-control-content" : ""}`} data-mode={mode} lang={locale} dir="ltr">
      <header className="ena-panel-heading">
        <p className="ena-panel-kicker">{panelHeading.kicker}</p>
        <h1>{panelHeading.title}</h1>
        <p>{panelHeading.description}</p>
        {mode === "model" && family === "standard" && <button type="button" className="ena-action-button ena-action-secondary ena-model-trajectory-button ena-trajectory-model-shortcut"
          onClick={() => setModelNavigation((value) => ({ tab: "windows", serial: value.serial + 1 }))}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="17" r="2" /><circle cx="12" cy="10" r="2" /><circle cx="19" cy="5" r="2" /><path d="m6.5 15.6 4-4m3.2-2.8 3.6-2.6" /></svg>
          <span>{workspaceCopy.configureTrajectory}</span><span aria-hidden="true">→</span>
        </button>}
        {result && !current && <p className="ena-restored-stale-notice" role="status" aria-live="polite">{rebuildCue ? workspaceCopy.result.sourceReplacementNotice : workspaceCopy.resultStatus.stale}</p>}
      </header>
      {(error || state.error || currentCompilation?.error) && <p role="alert">{error ? formatOpenEnaWorkspaceFailureV3(workspaceCopy, error) : workspaceCopy.operationFailed}</p>}
      {controller.importPending && <button type="button" onClick={() => dispatch({ type: "cancel-preview" })}>{workspaceCopy.cancelPendingImport}</button>}
      {state.preview && <OpenEnaImportPreviewV3 preview={state.preview} drafts={modelState.drafts} copy={modelV3Copy.importPreview}
        onCancel={() => dispatch({ type: "cancel-preview" })} onAcceptDraft={() => dispatch({ type: "accept-draft-preview", preview: state.preview! })}
        onKeepHistorical={() => dispatch({ type: "keep-historical", preview: state.preview! })} onAddReference={() => void attempt(controller.addReference)} />}
      {mode === "data" && <section className="ena-workspace-section-v3 ena-workspace-data-v3" aria-label={workspaceCopy.data.ariaLabel}>
        <div className="ena-source-actions">
        <label className="ena-action-button ena-action-primary ena-restored-file-action"><span aria-hidden="true">＋</span><span>{workspaceCopy.data.openFile}</span>
        <input ref={sourceFileTriggerRef} aria-label={workspaceCopy.data.openFile} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => { const file = e.target.files?.[0]; if (file) void attempt(() => openCodedData(file)); e.target.value = ""; }} />
        </label><p>{copy.data.uploadHint}</p>
        <OpenEnaTeachingSampleLibrary copy={{ ...workspaceCopy.data.teachingSamples, loadSample: workspaceCopy.data.loadSample, loadTrajectorySample: workspaceCopy.data.loadTrajectorySample }} disabled={sourceBusy} onLoad={(kind) => void attempt(() => requestTeachingSample(kind))} />
        </div>
        <details className="ena-panel-details ena-data-import-details"><summary>{workspaceCopy.data.importArtifact}</summary><p>{workspaceCopy.data.sampleExplanation}</p>
        <label>{workspaceCopy.data.importArtifact}<input type="file" accept=".json" onChange={(e) => { const file = e.target.files?.[0]; if (file) void attempt(async () => { await controller.preview((async () => { if (file.size > 16 * 1024 * 1024) throw new OpenEnaKnownWorkspaceFailureV3({ id: "artifact-too-large", limitMiB: 16 }); return readWorkspaceUtf8File(file, "artifact-invalid-utf8"); })()); }); e.target.value = ""; }} /></label></details>
        {sourcePreview && <section ref={sourceDialogRef} className="ena-source-preparation-dialog" tabIndex={-1} onKeyDown={onSourceDialogKeyDown} role="dialog" aria-label={workspaceCopy.data.reviewTypes}><h3>{workspaceCopy.data.reviewTypesTitle}</h3><p>{workspaceCopy.data.typingExplanation}</p>
          {sourceTypingPreview!.columns.map((column, index) => { const errorId = `${workspaceId}-source-type-error-${index}`; return <div key={column.column}><label>{column.column}<select aria-label={workspaceCopy.data.sourceTypeLabel(column.column)} aria-invalid={column.errorCount > 0} aria-describedby={column.errorCount > 0 ? errorId : undefined} disabled={sourceBusy} value={column.type} onChange={(e) => setSourcePreview({ ...sourcePreview, types: { ...sourcePreview.types, [column.column]: e.target.value as SourceColumnTypeV3 } })}>{(["text", "number", "boolean"] as const).map((type) => <option key={type} value={type}>{workspaceCopy.data.sourceTypes[type]}</option>)}</select></label>
            <p>{workspaceCopy.data.missingCells(column.nullCount)} · {workspaceCopy.data.collisions(column.identityCollisionCount)}</p>{column.errorCount > 0 && <p id={errorId} role="alert">{column.errorCodes.map((code) => workspaceCopy.data.sourceErrors[code]).join(" ")}</p>}<code>{JSON.stringify(column.examples)}</code></div>; })}
          {sourceTypingPreview!.errorCount > 0 && <p role="alert">{workspaceCopy.data.invalidCells(sourceTypingPreview!.errorCount)}</p>}
          <button type="button" onClick={() => cancelSourcePreparation(true)}>{workspaceCopy.data.cancelPreparation}</button>
          <button type="button" title={sourceTypingPreview!.errorCount > 0 ? workspaceCopy.data.confirmPreparationDisabled : undefined} disabled={sourceBusy || sourceTypingPreview!.errorCount > 0} onClick={() => void attempt(confirmSourceTyping)}>{workspaceCopy.data.confirmPreparation}</button>
        </section>}
        {dataset && <details className="ena-panel-details"><summary>{workspaceCopy.data.sourceData}</summary><p>{workspaceCopy.data.datasetSummary(dataset.name, dataset.rows.length, modelState.datasetSha256, dataset.hashKind)}</p><ResearchTableV3 {...researchTableCopy} rows={dataset.rows} label={workspaceCopy.data.sourceData} /></details>}
        {derivative && <><button type="button" onClick={() => saveDerivative(derivative)}>{workspaceCopy.data.downloadTyped}</button><button type="button" onClick={() => downloadJson("source-derivation.json", derivative.receipt)}>{workspaceCopy.data.downloadReceipt}</button></>}
        {originalSource && <button type="button" onClick={() => downloadText(originalSource.name, originalSource.text, CSV_DOWNLOAD_MEDIA_TYPE)}>{workspaceCopy.data.downloadOriginal}</button>}
        {state.historical.map((artifact) => <article key={artifact.receivedArtifactSha256}><p>{workspaceCopy.data.historicalArtifact(artifact.receivedArtifactSha256)}</p><button type="button" onClick={() => dispatch({ type: "preview", value: artifact })}>{workspaceCopy.data.reviewHistorical}</button></article>)}
      </section>}
      {mode === "model" && teachingSampleProgress}
      {mode === "model" && <OpenEnaModelTabsV3 actions={modelActions} readyLabel={copy.model.valid} copy={modelCopy} diagnostics={diagnostics} scientificContext={context} scientificSummary={modelSummary} rawBlockers={workspaceRawBlockersV3(state)} blockingChecklistId={rebuildBlockingChecklistId}
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
        renderPanel={(tab, fields) => tab === "units" ? <OpenEnaUnitsPanelV3 presetHiddenGroupTokens={state.presetHiddenGroups?.resultHash === resultHash ? state.presetHiddenGroups.tokens : []} copy={modelV3Copy.units} createSampleLabel={restoredCopy.createSample} applicabilityCopy={modelV3Copy.groupApplicability} groupDisplayCopy={copy.groupDisplay} state={modelState} fields={fields} columnOptions={dataset?.headers ?? []}
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
            {family === "ona" && <fieldset id={fields.id("directionalMask")} tabIndex={-1}><legend>{workspaceCopy.onaMask.legend}</legend><p>{workspaceCopy.onaMask.description}</p>
              {modelState.drafts.ona.directionalMask === null ? <button type="button" onClick={() => dispatchModel({ type: "replace-ona-draft", draft: { ...modelState.drafts.ona, directionalMask: { schemaVersion: 1, codeOrder: [...draft.codes], enabled: draft.codes.map(() => draft.codes.map(() => true)) } } })}>{workspaceCopy.onaMask.initialize}</button>
                : modelState.drafts.ona.directionalMask.enabled.map((row, i) => <div key={i}>{row.map((enabled, j) => <label key={j}>{draft.codes[i]} → {draft.codes[j]}<input type="checkbox" checked={enabled} onChange={(e) => { const mask = modelState.drafts.ona.directionalMask!; dispatchModel({ type: "replace-ona-draft", draft: { ...modelState.drafts.ona, directionalMask: { ...mask, enabled: mask.enabled.map((values, r) => values.map((value, c) => r === i && c === j ? e.target.checked : value)) } } }); }} /></label>)}</div>)}</fieldset>}</>}
      />}
      {activeColorIntent && <OpenEnaCodeColorPicker code={activeColorIntent.code} value={openEnaCodeColorPair(modelState.display[family].codeColors[activeColorIntent.code] ?? codeColorFor(undefined, activeColorIntent.code), state.colorCompanions[family][activeColorIntent.code])} copy={copy.model.codeColorPicker}
        onCancel={() => setActiveCodeColor(null)} onConfirm={(value) => { if (!sameScientificContextV3(activeColorIntent.context, controller.context)) return; dispatch({ type: "confirm-code-color", context: activeColorIntent.context, code: activeColorIntent.code, color: value.primary, complementary: value.complementary }); setActiveCodeColor(null); }} />}
      {mode === "plot" && <section className="ena-workspace-section-v3 ena-workspace-plot-v3">{groupSelectors}
        {(Boolean(activeContrast && endpointControls) || Boolean(contrastJsonDisclosure && !contrastJsonDisclosure.familyApplies)) && <details className="ena-panel-details"><summary>{restoredCopy.contrastActions}</summary><div className="ena-restored-action-row"><button type="button" disabled={!contrastJsonDisclosure?.familyApplies || Boolean(contrastJsonDisclosure?.disabled) || !endpointControls} aria-label={disclosedName(workspaceCopy.plot.exportContrastJson, contrastJsonDisclosure, contrastJsonNote)} aria-describedby={contrastJsonNote ? contrastJsonNoteId : undefined} title={contrastJsonNote || undefined} onClick={() => void attempt(async () => { if (!contrastJsonDisclosure?.familyApplies || contrastJsonDisclosure.disabled || !endpointControls) return; const file = await exportContrastV3(result, currentPlan, endpointControls); if (mounted.current && consumerKey === consumerKeyRef.current && confirmCurrentIdentityBearingExport()) downloadText(file.filename, file.contents, "application/json"); })}>{workspaceCopy.plot.exportContrastJson}</button>
          {contrastJsonDisclosure && contrastJsonNote ? <OpenEnaExportApplicabilityNote id={contrastJsonNoteId} action="contrast-json" text={contrastJsonNote} reason={contrastJsonDisclosure.reason} familyApplies={contrastJsonDisclosure.familyApplies} /> : null}
          <button type="button" disabled={!contrastEdgesDisclosure?.familyApplies || Boolean(contrastEdgesDisclosure?.disabled) || !endpointControls} aria-label={disclosedName(workspaceCopy.plot.exportContrastEdges, contrastEdgesDisclosure, contrastEdgesNote)} aria-describedby={contrastEdgesNote ? contrastEdgesNoteId : undefined} title={contrastEdgesNote || undefined} onClick={() => void attempt(async () => { if (!contrastEdgesDisclosure?.familyApplies || contrastEdgesDisclosure.disabled || !endpointControls) return; const file = await exportContrastV3(result, currentPlan, endpointControls); if (mounted.current && consumerKey === consumerKeyRef.current) downloadCsv("native-contrast-edges.csv", file.edgesCsv); })}>{workspaceCopy.plot.exportContrastEdges}</button>
          {contrastEdgesDisclosure && contrastEdgesNote ? <OpenEnaExportApplicabilityNote id={contrastEdgesNoteId} action="contrast-edges" text={contrastEdgesNote} reason={contrastEdgesDisclosure.reason} familyApplies={contrastEdgesDisclosure.familyApplies} /> : null}
          {activeContrast && endpointControls ? <button type="button" onClick={() => { setPrimaryGroupName(secondaryGroupName); setSecondaryGroupName(primaryGroupName); }}>{workspaceCopy.plot.switchPlots}</button> : null}</div></details>}
        {isTrajectory && <><label><input type="checkbox" checked={showGroupCentroidPaths} onChange={(e) => setShowGroupCentroidPaths(e.target.checked)} />{workspaceCopy.plot.showCentroidPaths}</label>
          <label><input type="checkbox" checked={endpointsOnly} onChange={(e) => setEndpointsOnly(e.target.checked)} />{workspaceCopy.plot.endpointsOnly}</label>
          <p>{workspaceCopy.plot.fittedOrder}</p>
          {horizons.map((horizon) => <label key={horizon.token}><input type="checkbox" checked={visibleHorizons === null || visibleHorizons.includes(horizon.canonicalJson)} onChange={(e) => setVisibleHorizons((values) => { const selected = values ?? horizons.map((value) => value.canonicalJson); return e.target.checked ? [...new Set([...selected, horizon.canonicalJson])] : selected.filter((key) => key !== horizon.canonicalJson); })} />{workspaceCopy.plot.displayHorizon(horizon.displayLabel)}</label>)}</>}
        <div className="ena-view-toggle ena-restored-view-toggle"><button type="button" aria-pressed={view === "2d"} onClick={() => setView("2d")}>2D</button><button type="button" aria-pressed={view === "3d"} disabled={!genericThreeDAvailable} onClick={() => setView("3d")}>3D</button></div>
        <fieldset className="ena-restored-axis-fields"><legend>{restoredCopy.dimensions}</legend>
        {(view === "3d" ? [0, 1, 2] : [0, 1]).map((index) => <label key={index}>{workspaceCopy.plot.axis(index + 1)}<select aria-label={workspaceCopy.plot.axis(index + 1)} value={axisControlValues[index] ?? ""} onChange={(e) => applyPlotAxisSelection(index, e.target.value)}><option value="">{workspaceCopy.plot.unavailable}</option>{supportedAxes.map((axis) => <option key={axis}>{axis}</option>)}</select></label>)}
        </fieldset><fieldset className="ena-restored-check-stack"><legend>{restoredCopy.display}</legend>
        {[[workspaceCopy.plot.points, showPoints, setShowPoints], [workspaceCopy.plot.networks, showNetworks, setShowNetworks], [workspaceCopy.plot.codeLabels, showLabels, setShowLabels], [workspaceCopy.plot.unitLabels, showUnitLabels, setShowUnitLabels], [workspaceCopy.plot.variance, showVariance, setShowVariance], [workspaceCopy.plot.trajectories, showTrajectories, setShowTrajectories], [workspaceCopy.plot.flipX, flipX, setFlipX], [workspaceCopy.plot.flipY, flipY, setFlipY]].map(([label, value, setter]) => <label key={String(label)}>{String(label)}<input type="checkbox" checked={value as boolean} onChange={(e) => (setter as (value: boolean) => void)(e.target.checked)} /></label>)}
        </fieldset><fieldset className="ena-restored-scale-fields"><legend>{restoredCopy.scales}</legend>
        {[[workspaceCopy.plot.edgeThreshold, edgeThreshold, setEdgeThreshold, 0, 1], [workspaceCopy.plot.edgeScale, edgeScale, setEdgeScale, 0.1, 4], [workspaceCopy.plot.pointScale, pointScale, setPointScale, 0.1, 4], [workspaceCopy.plot.zoom, plotZoom, setPlotZoom, 0.5, 3]].map(([label, value, setter, min, max]) => <OpenEnaRangeField key={String(label)} id={String(label)} idPrefix={workspaceId} label={String(label)} value={value as number} formattedValue={String(value)} accessibleValueText={String(value)} min={min as number} max={max as number} step={0.1} onChange={(e) => (setter as (value: number) => void)(e.target.valueAsNumber)} />)}
        </fieldset>
        {view === "3d" && <fieldset className="ena-camera-fieldset"><legend>{copy.plot.cameraPosition}</legend>{cameraPositionOptions.map(([preset, label]) => <label key={preset}><input type="radio" name="ena-camera" value={preset} checked={cameraPreset === preset} onChange={() => { setCameraPreset(preset); setCamera(cameraForPreset(preset)); setAspectRatio(null); }} />{label}</label>)}</fieldset>}
        <button type="button" onClick={() => setNodeOverrides({ hash: resultHash, positions: new Map() })}>{workspaceCopy.plot.resetNodes}</button>
      </section>}
      {mode === "stats" && !activeInference && initialCloudWorkspace?.statisticsReport
        && canonicalJsonV3(initialCloudWorkspace.statisticsReport.binding) === canonicalJsonV3(result?.binding ?? null)
        ? <details className="ena-panel-details" data-testid="open-ena-cloud-saved-statistics" open>
          <summary>{cloudCopy.savedStatistics}</summary><p>{cloudCopy.savedStatisticsNote}</p>
          {Object.entries((initialCloudWorkspace.statisticsReport.presentationTables ?? {}) as Record<string, unknown>).filter(([, rows]) => Array.isArray(rows))
            .map(([key, rows], index) => <ResearchTableV3 key={key} {...researchTableCopy}
              rows={(rows as unknown[]).filter((row): row is Record<string, unknown> => row !== null && typeof row === "object" && !Array.isArray(row))}
              label={`${cloudCopy.savedStatistics} ${index + 1}`} />)}
          <button type="button" onClick={() => downloadJson("saved-statistical-report.json", initialCloudWorkspace.statisticsReport)}>{cloudCopy.downloadStatistics}</button>
        </details> : null}
      {mode === "stats" && <section className="ena-workspace-section-v3 ena-workspace-stats-v3"><OpenEnaNativeStatsPanelV3 result={result} current={current} axes={twoDAxes} inference={activeInference} copy={copy.stats} nativeCopy={modelV3Copy.nativeStats} comparisonCardCopy={restoredCopy.comparisonCards} renderTable={(rows, label) => <ResearchTableV3 {...researchTableCopy} rows={rows} label={label} />}>{groupSelectors}
        <p>{workspaceCopy.stats.separation}</p>
        {isTrajectory && <><label>{workspaceCopy.stats.inferenceDesign}<select value={inferenceDesign} onChange={(e) => setInferenceDesign(e.target.value as typeof inferenceDesign)}><option value="independent">{workspaceCopy.stats.designs.independent}</option><option value="paired">{workspaceCopy.stats.designs.paired}</option><option value="repeated">{workspaceCopy.stats.designs.repeated}</option></select></label>
          <label><input type="checkbox" checked={identityConfirmed} onChange={(e) => setIdentityConfirmed(e.target.checked)} />{workspaceCopy.stats.identityConfirmation}</label>
          <p>{workspaceCopy.stats.periodInstructions}</p>
          {horizons.map((horizon) => <label key={horizon.token}><input type="checkbox" checked={selectedPeriods.includes(horizon.token)} onChange={(e) => setSelectedPeriods((values) => e.target.checked ? [...values, horizon.token] : values.filter((value) => value !== horizon.token))} />{horizon.displayLabel}</label>)}</>}
        <button type="button" disabled={!current || !controls || inferenceBusy || completedResultKind === "ona"} onClick={() => void attempt(runInference)}>{workspaceCopy.stats.runInference}</button>
        {completedResultKind === "ona" && <p>{workspaceCopy.stats.onaDescriptive}</p>}
        {onaView && <><p>{workspaceCopy.stats.onaMeaning}</p><ResearchTableV3 {...researchTableCopy} rows={onaView.edges} label={workspaceCopy.stats.onaEdges} />
          <ResearchTableV3 {...researchTableCopy} rows={onaView.auditRows} label={workspaceCopy.stats.onaAudit} /></>}
        {onaEdgesDisclosure && onaEdgesNote ? <><button type="button" disabled={onaEdgesDisclosure.disabled || !current} aria-label={disclosedName(workspaceCopy.stats.exportOnaEdges, onaEdgesDisclosure, onaEdgesNote)} aria-describedby={onaEdgesNoteId} title={onaEdgesNote} onClick={() => void attempt(async () => { if (onaEdgesDisclosure.disabled || !current) return; const value = await buildOnaBoundViewV3(result, currentPlan, primaryGroupName || null); if (mounted.current && latest.current.current && latest.current.state.model.result === result) downloadCsv("ona-aggregate-edges.csv", rowsToCsv(value.edges)); })}>{workspaceCopy.stats.exportOnaEdges}</button>
          <OpenEnaExportApplicabilityNote id={onaEdgesNoteId} action="ona-aggregate-edges" text={onaEdgesNote} reason={onaEdgesDisclosure.reason} familyApplies={onaEdgesDisclosure.familyApplies} /></> : null}
        {onaAuditDisclosure && onaAuditNote ? <><button type="button" disabled={onaAuditDisclosure.disabled || !current} aria-label={disclosedName(workspaceCopy.stats.exportOnaAudit, onaAuditDisclosure, onaAuditNote)} aria-describedby={onaAuditNoteId} title={onaAuditNote} onClick={() => void attempt(async () => { if (onaAuditDisclosure.disabled || !current) return; const value = await buildOnaBoundViewV3(result, currentPlan); if (mounted.current && latest.current.current && latest.current.state.model.result === result && window.confirm(copy.ona.exports.auditConfirmation)) downloadJson("ona-deidentified-audit.json", { binding: value.binding, audit: value.audit, meaning: value.meaning }); })}>{workspaceCopy.stats.exportOnaAudit}</button>
          <OpenEnaExportApplicabilityNote id={onaAuditNoteId} action="ona-deidentified-audit" text={onaAuditNote} reason={onaAuditDisclosure.reason} familyApplies={onaAuditDisclosure.familyApplies} />{onaView ? <p>{copy.ona.exports.auditWarning}</p> : null}</> : null}
        </OpenEnaNativeStatsPanelV3>
        {resultTableViewModel && resultTableSource && <OpenEnaResultTables model={resultTableViewModel} onSelect={setResultTable} onExport={() => {
          if (!current || resultTableViewModel.export.disabled) return;
          const exported = exportOpenEnaResultTableCsv(resultTableSource, resultTable);
          if (exported.status !== "ready") return;
          if (!mounted.current || !latest.current.current || latest.current.state.model.result !== result) return;
          const publish = () => downloadCsv(exported.filename, exported.csv);
          if (IDENTITY_BEARING_RESULT_TABLES.has(resultTable)) confirmOpenEnaIdentityBearingExport((message) => window.confirm(message), copy.stats.identityExportConfirmation, publish);
          else publish();
        }} />}
        {activeInference && nativeStatsDisclosure && nativeStatsNote ? <><button type="button" disabled={nativeStatsDisclosure.disabled} aria-describedby={nativeStatsNoteId} title={nativeStatsNote} onClick={() => void attempt(async () => { if (nativeStatsDisclosure.disabled) return; const file = await exportNativeStatisticsV3(activeInference, result, currentPlan, controls!); if (mounted.current && consumerKey === consumerKeyRef.current) downloadText(file.filename, file.contents, file.mimeType); })}>{workspaceCopy.stats.exportNative}</button><OpenEnaExportApplicabilityNote id={nativeStatsNoteId} action="native-statistics" text={nativeStatsNote} reason={nativeStatsDisclosure.reason} familyApplies={nativeStatsDisclosure.familyApplies} /></> : null}
        {!activeInference && nativeStatsDisclosure && nativeStatsNote ? <><button type="button" disabled aria-label={disclosedName(workspaceCopy.stats.exportNative, nativeStatsDisclosure, nativeStatsNote)} aria-describedby={nativeStatsNoteId} title={nativeStatsNote}>{workspaceCopy.stats.exportNative}</button><OpenEnaExportApplicabilityNote id={nativeStatsNoteId} action="native-statistics" text={nativeStatsNote} reason={nativeStatsDisclosure.reason} familyApplies={nativeStatsDisclosure.familyApplies} /></> : null}
        {!isTrajectory && trajectoryBundleDisclosure && !trajectoryBundleDisclosure.familyApplies && trajectoryBundleNote ? <><button type="button" disabled aria-label={disclosedName(trajectoryAnalysisCopyV3(locale).export, trajectoryBundleDisclosure, trajectoryBundleNote)} aria-describedby={trajectoryBundleNoteId} title={trajectoryBundleNote}>{trajectoryAnalysisCopyV3(locale).export}</button><OpenEnaExportApplicabilityNote id={trajectoryBundleNoteId} action="trajectory-bundle" text={trajectoryBundleNote} reason={trajectoryBundleDisclosure.reason} familyApplies={trajectoryBundleDisclosure.familyApplies} /></> : null}
        {historicalData && <details className="ena-panel-details"><summary>{workspaceCopy.stats.localDataView}</summary><ResearchTableV3 {...researchTableCopy} rows={historicalData.rows} label={workspaceCopy.stats.localDataView} columnLabels={{ [historicalData.metadataColumns.trajectoryOrdinal]: workspaceCopy.dataView.metadataLabels.trajectoryOrdinal, [historicalData.metadataColumns.observedHorizons]: workspaceCopy.dataView.metadataLabels.observedHorizons, [historicalData.metadataColumns.observedSourceRowIndices]: workspaceCopy.dataView.metadataLabels.observedSourceRowIndices }} /><p>{workspaceCopy.dataView.sourceIndexMeaning}</p><ResearchTableV3 {...researchTableCopy} rows={historicalData.sourceTraversal} label={workspaceCopy.stats.globalTraversal} columnLabels={workspaceCopy.dataView.sourceTraversalLabels} />
          <button type="button" disabled={!current || Boolean(dataViewDisclosure?.disabled)} aria-label={disclosedName(workspaceCopy.stats.exportDataView, dataViewDisclosure, dataViewNote)} aria-describedby={dataViewNote ? dataViewNoteId : undefined} title={dataViewNote || undefined} onClick={() => void attempt(async () => { if (!result || !currentPlan || !current || dataViewDisclosure?.disabled) return; const value = await buildDataViewV3(result, currentPlan); if (!mounted.current || !latest.current.current || latest.current.state.model.result !== result) return; if (window.confirm(workspaceCopy.stats.exportDataViewConfirmation)) downloadCsv("bound-data-view.csv", rowsToCsv(value.rows)); })}>{workspaceCopy.stats.exportDataView}</button>
          {dataViewDisclosure && dataViewNote ? <OpenEnaExportApplicabilityNote id={dataViewNoteId} action="bound-data-view" text={dataViewNote} reason={dataViewDisclosure.reason} familyApplies={dataViewDisclosure.familyApplies} /> : null}</details>}
        {checkedDataView && current && checkedDataView.binding.scientificResultSha256 === result?.binding.scientificResultSha256 && checkedDataView.binding.executionPlanSha256 === currentPlan?.header.executionPlanSha256 && <p>{workspaceCopy.stats.dataViewValidated}</p>}
        {result && <details><summary>{copy.stats.ui.methodsTitle}</summary><button type="button" aria-describedby={methodsNote ? methodsNoteId : undefined} title={methodsNote || undefined} onClick={() => void attempt(async () => { if (confirmCurrentIdentityBearingExport()) await navigator.clipboard.writeText(buildMethodsReportV3(result)); })}>{copy.stats.ui.copyMethods}</button><pre>{buildMethodsReportV3(result)}</pre><button type="button" aria-describedby={methodsNote ? methodsNoteId : undefined} title={methodsNote || undefined} onClick={() => { if (confirmCurrentIdentityBearingExport()) downloadText("methods.md", buildMethodsReportV3(result), "text/markdown"); }}>{workspaceCopy.stats.exportMethods}</button>{methodsDisclosure && methodsNote ? <OpenEnaExportApplicabilityNote id={methodsNoteId} action="methods" text={methodsNote} reason={methodsDisclosure.reason} familyApplies={methodsDisclosure.familyApplies} /> : null}</details>}
      </section>}
      {isTrajectory && <OpenEnaTrajectoryAnalysisPanelV3 key="native-trajectory-analysis" locale={locale} hidden={mode !== "stats"} frameKey={trajectoryFrameKey} result={result} plan={currentPlan} current={current} controls={pathControls} admission={pathAdmission} ranks={trajectoryRanks.frameKey === trajectoryFrameKey ? trajectoryRanks.items : []} confirmIdentityExport={confirmCurrentIdentityBearingExport} exportApplicabilityNote={trajectoryBundleNote || null} exportApplicabilityNoteId={trajectoryBundleNote ? trajectoryBundleNoteId : null} exportApplicabilityReason={trajectoryBundleDisclosure?.reason ?? null} exportApplicabilityFamilyApplies={Boolean(trajectoryBundleDisclosure?.familyApplies)} />}
      <details className="ena-panel-details ena-artifacts-disclosure"><summary>{workspaceCopy.artifacts.title}</summary>
      <section className="ena-workspace-section-v3 ena-workspace-artifacts-v3" aria-label={workspaceCopy.artifacts.ariaLabel}>
        <p>{workspaceCopy.artifacts.presetScope}</p>{state.presetHiddenGroups?.resultHash === resultHash && <button type="button" onClick={() => dispatch({ type: "clear-preset-group-hiding" })}>{workspaceCopy.artifacts.clearPreset}</button>}
        <button type="button" disabled={!result} onClick={() => { try { exportPresentation(); } catch { setError({ id: "operation-failed" }); } }}>{workspaceCopy.artifacts.exportPreset}</button>
        <label>{workspaceCopy.artifacts.reviewPreset}<input type="file" accept=".json" onChange={(e) => { const file = e.target.files?.[0]; if (file) void attempt(() => previewPresentation(file)); e.target.value = ""; }} /></label>
        {presetPreview && <section role="dialog" aria-label={workspaceCopy.artifacts.presetPreview}><p>{presetPreview.boundResultSha256 === resultHash ? workspaceCopy.artifacts.presetMatches : workspaceCopy.artifacts.presetMismatch}</p><pre>{JSON.stringify(presetPreview, null, 2)}</pre>
          {!presetCodesCompatible && <p>{workspaceCopy.artifacts.presetCodesMismatch}</p>}{completedResultKind !== family && <p>{workspaceCopy.artifacts.presetFamilyMismatch}</p>}
          <button type="button" onClick={() => { ++presetSerial.current; setPresetPreview(null); }}>{workspaceCopy.artifacts.cancelPreset}</button>
          <button type="button" disabled={presetPreview.boundResultSha256 !== resultHash || completedResultKind !== family || !presetCodesCompatible || display.allCodesSuppressed || display.allGroupsSuppressed} onClick={() => { try { applyPresentation(); } catch { setError({ id: "operation-failed" }); } }}>{workspaceCopy.artifacts.applyPreset}</button></section>}
        {presetAxisNotice && presetAxisNotice.resultHash === resultHash ? <p role="status" data-testid="open-ena-preset-inference-axes-notice">{workspaceCopy.artifacts.presetInferenceAxesWithheld(presetAxisNotice.dimensions.join(" · "))}</p> : null}
        <button type="button" disabled={!workspaceDraftExportableV3(state)} onClick={() => void attempt(async () => saveDescriptor(await exportDraftV3(draft)))}>{workspaceCopy.artifacts.exportDraft}</button>
        {!workspaceDraftExportableV3(state) && <p>{workspaceCopy.artifacts.draftBlocked}</p>}
        <button type="button" disabled={!currentCompilation?.plan} onClick={() => void attempt(async () => { if (currentCompilation?.result.status === "ready") saveDescriptor(await exportCanonicalConfigV3(currentCompilation.result)); })}>{workspaceCopy.artifacts.exportConfig}</button>
        <button type="button" data-testid="open-ena-export-current-analysis" disabled={!current || Boolean(currentAnalysisDisclosure?.disabled)} aria-label={disclosedName(workspaceCopy.artifacts.exportAnalysis, currentAnalysisDisclosure, currentAnalysisNote)} aria-describedby={currentAnalysisNote ? currentAnalysisNoteId : undefined} title={currentAnalysisNote || undefined} onClick={() => void attempt(async () => { if (currentAnalysisDisclosure?.disabled) return; if (result && currentPlan) { const descriptor = await exportCurrentAnalysisV3(result, currentPlan); if (mounted.current && latest.current.current && latest.current.state.model.result === result && window.confirm(workspaceCopy.artifacts.exportAnalysisConfirmation)) saveDescriptor(descriptor); } })}>{workspaceCopy.artifacts.exportAnalysis}</button>
        {currentAnalysisDisclosure && currentAnalysisNote ? <OpenEnaExportApplicabilityNote id={currentAnalysisNoteId} action="current-analysis" text={currentAnalysisNote} reason={currentAnalysisDisclosure.reason} familyApplies={currentAnalysisDisclosure.familyApplies} /> : null}
        <button type="button" disabled={!result} onClick={() => void attempt(async () => { if (result) { const file = await exportStaleAuditV3(result, await sha256TextV3(context.draftFingerprint)); if (latest.current.state.model.result === result && confirmCurrentIdentityBearingExport()) saveDescriptor(file); } })}>{workspaceCopy.artifacts.exportStale}</button>
        <button type="button" disabled={!current || completedResultKind !== "standard" || (isTrajectory && result?.binding.referenceId === null) || Boolean(referenceDisclosure?.disabled)} aria-label={disclosedName(result?.binding.referenceId ? workspaceCopy.artifacts.reexportReference : workspaceCopy.artifacts.exportReference, referenceDisclosure, referenceNote)} aria-describedby={referenceNote ? referenceNoteId : undefined} title={referenceNote || undefined} onClick={() => void attempt(async () => {
          if (referenceDisclosure?.disabled) return;
          if (!result || !currentPlan) return;
          if (!state.sourceWitness && initialCloudWorkspace?.sourceReference?.source.executionPlanSha256 === result.binding.executionPlanSha256) {
            downloadJson("saved-reference.v2.json", initialCloudWorkspace.sourceReference); return;
          }
          const descriptor = await exportReferenceV2(result, { currentPlan, ...(state.sourceWitness ? { sourceWitness: state.sourceWitness } : {}), displayName: dataset?.name ?? workspaceCopy.artifacts.referenceDisplayName });
          if (mounted.current && latest.current.current && latest.current.state.model.result === result && latest.current.currentPlan === currentPlan) saveDescriptor(descriptor);
        })}>{result?.binding.referenceId ? workspaceCopy.artifacts.reexportReference : workspaceCopy.artifacts.exportReference}</button>
        {referenceDisclosure && referenceNote ? <OpenEnaExportApplicabilityNote id={referenceNoteId} action="reference" text={referenceNote} reason={referenceDisclosure.reason} familyApplies={referenceDisclosure.familyApplies} /> : null}
        <h3 id="open-ena-sets-heading" tabIndex={-1}>{copy.sets.title}</h3>
        <button type="button" id="open-ena-capture-set" data-testid="open-ena-capture-analysis-set" disabled={!captureEligibility.eligible || setsBusy} aria-describedby={!captureEligibility.eligible ? capturePrerequisiteId : undefined} onClick={() => void attempt(captureCurrentAnalysisSet)}>{workspaceCopy.artifacts.captureSet(sets.length)}</button>
        <OpenEnaUnmetPrerequisiteList id={capturePrerequisiteId} testId="open-ena-capture-analysis-set-prerequisites" title={workspaceCopy.artifacts.unmetPrerequisites} items={captureUnmetItems} />
        {sets.length > 0 ? (
          <ul className="ena-artifact-sets" aria-label={copy.sets.title}>
            {sets.map((set) => (
              <li key={set.id}>
                <strong>{set.name}</strong>
                <button
                  id={`open-ena-set-remove-${set.id}`}
                  type="button"
                  className="ena-sets-remove"
                  data-ena-set-remove={set.id}
                  aria-label={`${copy.sets.remove} ${set.name}`}
                  onClick={() => removeCapturedAnalysisSet(set.id)}
                >
                  {copy.sets.remove}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <button type="button" data-testid="open-ena-compare-analysis-sets" disabled={!compareEligibility.eligible} aria-describedby={!compareEligibility.eligible ? comparePrerequisiteId : undefined} onClick={() => { try { setSetComparison(compareAnalysisSetsV3(sets[sets.length - 2], sets[sets.length - 1])); } catch { setError({ id: "operation-failed" }); } }}>{workspaceCopy.artifacts.compareSets}</button>
        <OpenEnaUnmetPrerequisiteList id={comparePrerequisiteId} testId="open-ena-compare-analysis-sets-prerequisites" title={workspaceCopy.artifacts.unmetPrerequisites} items={compareUnmetItems} />
        {setComparison && <ResearchTableV3 {...researchTableCopy} rows={setComparison.edges} label={workspaceCopy.artifacts.historicalComparison} />}
      </section>
      </details>
</div>;
  const aiPanel = <div className="ena-control-content ena-ai-mode-panel ena-workspace-controls-v3 ena-restored-workbench" data-ena-ai-source="stats-results"><header className="ena-panel-heading"><p className="ena-panel-kicker">{restoredCopy.aiKicker}</p><h2>{copy.aiInterpretation.title}</h2><p>{savedAiInterpretation && cloudBridge && !activeAiReview ? cloudCopy.savedAiAvailable : activeInference ? workspaceCopy.ai.ready : workspaceCopy.ai.unavailable}</p></header><button type="button" onClick={() => setMode("stats")}>{workspaceCopy.ai.openStats}</button>
      <div hidden={mode !== "ai"}><OpenEnaAiInterpretation locale={locale} operationOwnerKey={operationOwnerKey} request={activeAiReview?.request ?? null}
        onLocalWorkChange={setAiBusy} onInterpretationChange={setSavedAiInterpretation}
        savedInterpretation={savedAiInterpretation} savedInterpretationNote={copy.aiInterpretation.recordHistorical}
        localScientificIdentity={openEnaAiLocalScientificIdentityV3(activeAiReview)} historicalEvidenceInvalidated={historicalEvidenceInvalidated}
        copy={copy.aiInterpretation} disabled={!activeAiReview || activeAiReview.request.locale !== locale || !current} disabledReason={aiLimitation ? workspaceCopy.operationFailed : workspaceCopy.ai.disabled} providerDescriptor={providerDescriptor} />
        {activeAiReview && <details className="ena-panel-details"><summary>{restoredCopy.aiEvidenceScope}</summary><p>{workspaceCopy.ai.wireLimitations}</p></details>}{aiLimitation && <p role="status">{workspaceCopy.operationFailed}</p>}</div>
</div>;
  const nativeDataView = dataViewPresentation && <>
            <OpenEnaDataView columns={dataViewColumns ?? dataViewPresentation.columns} rows={dataViewPresentation.rows} context={dataViewContext}
              onContextChange={setDataViewContext} onReturnToComparison={() => setCenterSurface("plot")} exportDisabled={!current}
              contextOptions={[{ value: "comparison", label: workspaceCopy.dataView.overall }, ...(primary ? [{ value: "primary" as const, label: primary.displayLabel }] : []), ...(secondary ? [{ value: "secondary" as const, label: secondary.displayLabel }] : [])]}
              exportClassification="local-identity-bearing-view" copy={workspaceCopy.dataView} emptyMessage={workspaceCopy.dataView.empty} notice={workspaceCopy.dataView.sourceIndexMeaning} exportApplicabilityNote={centerDataViewNote || null} exportApplicabilityNoteId={centerDataViewNote ? centerDataViewNoteId : null} exportApplicabilityReason={centerDataViewDisclosure?.reason ?? null} exportApplicabilityFamilyApplies={Boolean(centerDataViewDisclosure?.familyApplies)}
              onExportCsv={() => void attempt(async () => { if (!result || !currentPlan || !current) return; await buildDataViewV3(result, currentPlan); if (mounted.current && latest.current.current && latest.current.state.model.result === result && confirmCurrentIdentityBearingExport()) downloadCsv("bound-data-view.csv", rowsToCsv(dataViewPresentation.rows.map((row) => Object.fromEntries(Object.entries(row.values).map(([key, value]) => [key, value ?? null]))))); })} />
            <ResearchTableV3 {...researchTableCopy} rows={dataViewPresentation.sourceTraversal} label={workspaceCopy.stats.globalTraversal} columnLabels={workspaceCopy.dataView.sourceTraversalLabels} />
          </>;
  return <div className="open-ena-page" lang={locale} data-testid="open-ena-workspace-v3" data-result-status={modelState.resultStatus} data-run-status={modelState.runStatus} data-ena-rebuild-cue={rebuildCue?.reason}>
    <OpenEnaFallbackNotice locale={locale} />
    {cloudControls}
    <section id="open-ena-workspace" tabIndex={-1} className="open-ena-workbench" aria-label={workspaceCopy.shell.workspaceAria} data-skip-label={workspaceCopy.landmarks.skipToWorkspace} aria-busy={sourceBusy || modelState.runStatus === "running"}>
      <div className="ena-workbench-grid">
        <nav className="ena-tool-rail" aria-label={workspaceCopy.shell.modesAria} data-ena-workbench-region="rail">
          <div className="ena-rail-brand" data-ena-rail-brand="true" aria-label="ENA.HK Open ENA">
            <span className="ena-mini-mark" aria-hidden="true"><img src="/ena-mark.svg" alt="" /></span><span className="ena-rail-product">OPEN ENA</span>
            <a className="ena-rail-version" data-ena-rail-version="true" href={JENA_SOURCE_URL} target="_blank" rel="noopener noreferrer"
              aria-label={copy.workspace.jenaSourceAriaLabel(JENA_RUNTIME_VERSION, JENA_SOURCE_COMMIT.slice(0, 7))}>jENA {JENA_RUNTIME_VERSION.split("-", 1)[0]}</a>
          </div>
          <div ref={railToolbarRef} className="ena-rail-modes" role="toolbar" aria-label={workspaceCopy.landmarks.railToolbar} aria-orientation={railOrientation} onKeyDown={onRailToolbarKeyDown}>{OPEN_ENA_RAIL_MODES.map((entry) => <button key={entry} ref={(element) => { railTriggerRefs.current[entry] = element; }} type="button" className="ena-rail-button" tabIndex={railTabStop === entry ? 0 : -1} aria-current={mode === entry ? "step" : undefined} aria-label={entry === "ai" ? copy.aiInterpretation.title : copy.modes[entry]} onFocus={() => cancelScheduledRailFocusRestore()} onClick={() => { cancelScheduledRailFocusRestore(); setRailTabStop(entry); setMode(entry); }}>{modeIcons[entry]}<span>{copy.modes[entry]}</span></button>)}</div>
          <OpenEnaSiteNavigation locale={locale} />
          <form className="ena-rail-logout" action="/api/open-ena/logout" method="post" onSubmit={submitOpenEnaLogoutAsDocumentRequest}><input type="hidden" name="locale" value={locale} /><button type="submit" aria-label={authCopy.signOut} title={authCopy.signOut}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H5v14h5m4-11 4 4-4 4m-5-4h9" /></svg><span>{authCopy.signOut}</span></button></form>
          <div className="ena-rail-meta"><span className="ena-rail-privacy">{workspaceCopy.shell.local}</span><span className="sr-only">{cloudBridge ? cloudCopy.runtimePrivacy.replace("{version}", JENA_RUNTIME_VERSION) : workspaceCopy.shell.runtimePrivacy(JENA_RUNTIME_VERSION)}</span></div>
        </nav>
        <aside className="ena-control-panel" data-ena-workbench-region="controls" data-ena-rail-panel={mode} role="region" aria-label={workspaceCopy.landmarks[mode]} onKeyDown={onRailPanelKeyDown}>
          {onLocaleChange && <label className="ena-workspace-language"><span>{locale === "zh-hans" ? "语言" : locale === "zh-hant" ? "語言" : "Language"}</span>
            <select data-testid="open-ena-workspace-language" value={locale} onChange={(event) => onLocaleChange(event.currentTarget.value as Locale)}>
              <option value="en">English</option><option value="zh-hans">简体中文</option><option value="zh-hant">繁體中文</option>
            </select>
          </label>}
          <OpenEnaPersistentRailPanels mode={mode} analysisPanel={analysisPanel} aiPanel={aiPanel} /></aside>
        <div className="ena-visual-workspace" data-ena-view={view} data-testid="open-ena-center-surface">
          <div className={`ena-visual-toolbar${view === "2d" && contrast ? " ena-visual-toolbar-group-contrast" : ""}`}><div><p>{copy.workspace.comparison}</p><span>{dataset?.name ?? workspaceCopy.toolbar.researchSpace}</span></div>
          <div className="ena-visual-toolbar-actions"><button type="button" data-testid="open-ena-data-view-toggle" disabled={!result} aria-pressed={centerSurface === "data"} aria-label={centerSurface === "data" ? (completedResultKind === "ona" ? copy.ona.dataView.returnAriaLabel : workspaceCopy.dataView.returnAriaLabel) : workspaceCopy.toolbar.dataView} onClick={() => setCenterSurface((value) => value === "plot" ? "data" : "plot")}>{centerSurface === "data" ? (completedResultKind === "ona" ? copy.ona.dataView.returnLabel : workspaceCopy.dataView.returnLabel) : workspaceCopy.toolbar.dataView}</button>
              <div className="ena-analysis-toolbar-cluster"><div className="ena-view-toggle"><button type="button" aria-pressed={view === "2d"} onClick={() => setView("2d")}>{completedResultKind === "ona" ? copy.ona.workspace.twoD : copy.views.twoD}</button><button type="button" aria-pressed={view === "3d"} disabled={!genericThreeDAvailable} onClick={() => setView("3d")}>{completedResultKind === "ona" ? copy.ona.workspace.threeD : copy.views.threeD}</button></div>
                <button type="button" className="ena-download-model-button ena-compact-toolbar-button" disabled={!current || Boolean(currentAnalysisDisclosure?.disabled)} aria-describedby={currentAnalysisNote ? currentAnalysisNoteId : undefined} title={currentAnalysisNote || undefined} onClick={() => void attempt(async () => { if (currentAnalysisDisclosure?.disabled) return; if (result && currentPlan) { const value = await exportCurrentAnalysisV3(result, currentPlan); if (mounted.current && latest.current.current && latest.current.state.model.result === result && confirmCurrentIdentityBearingExport()) saveDescriptor(value); } })}><span className="ena-download-model-button-icon" aria-hidden="true">↓</span>{workspaceCopy.toolbar.downloadModel}</button>
              </div><button type="button" className="ena-compact-toolbar-button" disabled={!current || view === "3d"} onClick={exportPlotSvg}>{workspaceCopy.toolbar.exportSvg}</button><button type="button" className="ena-compact-toolbar-button" disabled={!current || view === "3d"} onClick={exportPlotPng}>{workspaceCopy.toolbar.exportPng}</button>
            </div>
          </div>
          <div>
      {presentation && result && <section aria-label={workspaceCopy.result.plotAria} data-ena-workbench-region="center">{modelState.resultStatus === "stale" && rebuildCue ? <div className="ena-stale-rebuild-callout" data-testid="open-ena-stale-rebuild" data-ena-rebuild-cue={rebuildCue.reason}><p role="status" aria-live="polite">{workspaceCopy.result.sourceReplacementNotice}</p><button type="button" ref={staleRebuildRef} className="ena-action-button ena-action-primary ena-stale-rebuild-button" data-testid="open-ena-stale-rebuild-run" aria-label={workspaceCopy.result.rebuildNowAria} aria-describedby={mode === "model" ? rebuildBlockingDescribedBy : undefined} disabled={sourceBusy || sourcePreview !== null || modelState.runStatus === "running"} onClick={requestRebuildAfterSourceReplacement}>{workspaceCopy.result.rebuildNow}<span aria-hidden="true">→</span></button></div> : <p>{modelState.resultStatus === "stale" ? workspaceCopy.result.historicalGeometry : workspaceCopy.result.boundGeometry}</p>}
        {view === "3d" && completedResultKind === "standard" && !genericThreeDAvailable ? <p role="status">{copy.plot.threeDUnavailable}</p> : selectedAxes.length < 2 ? <><p>{workspaceCopy.result.oneAxis}</p><ResearchTableV3 {...researchTableCopy} rows={result.set.points} label={workspaceCopy.result.fittedCoordinates} /></>
          : completedResultKind === "ona" ? view === "3d" && threeDDimensions
            ? <OpenEna3DOrderedResultLayout {...plotProps} sharedCamera={camera} onCameraChange={setCamera} sharedAspectRatio={aspectRatio} onAspectRatioChange={setAspectRatio} result={plotResult!} config={presentation.config} primaryGroupName={primary?.displayLabel ?? null} secondaryGroupName={secondary?.displayLabel ?? null} centerMode={centerSurface} dataView={nativeDataView} rightTools={persistentPlotTools} />
            : <OpenEnaOrderedResultLayout {...plotProps} copy={copy.ona.layout} plotCopy={copy.ona.plot} textScale={textScale} result={plotResult!} config={presentation.config} primaryGroupName={primary?.displayLabel ?? null} secondaryGroupName={secondary?.displayLabel ?? null} centerMode={centerSurface} dataView={nativeDataView} rightTools={persistentPlotTools} svgRef={plotSvgRef} />
          : contrast ? view === "3d" && threeDDimensions
            ? <OpenEna3DGroupContrast {...plotProps} sharedCamera={camera} onCameraChange={setCamera} sharedAspectRatio={aspectRatio} onAspectRatioChange={setAspectRatio} groupColumn="Group" result={plotResult!} contrast={contrast} centerMode={centerSurface} dataView={nativeDataView} rightTools={persistentPlotTools} />
            : <OpenEnaGroupContrast {...plotProps} uiCopy={workspaceCopy.plot} centerMode={centerSurface} dataView={nativeDataView} rightTools={persistentPlotTools} onConfirmIdentityBearingExport={confirmCurrentIdentityBearingExport} onSwitchPlots={() => { setPrimaryGroupName(secondaryGroupName); setSecondaryGroupName(primaryGroupName); }} contrast={contrast} showGroupLabels={showGroupLabels && !display.allGroupsSuppressed} unitCircle={unitCircle} textScale={textScale} svgRef={plotSvgRef} />
          : centerSurface === "data" ? nativeDataView : view === "3d" && threeDDimensions ? <OpenEnaInteractive3DPlot {...plotProps} result={plotResult!} initialCamera={camera} onCameraChange={setCamera} initialAspectRatio={aspectRatio} onAspectRatioChange={setAspectRatio} />
          : <OpenEnaPlot {...plotProps} result={plotResult!} view="2d" svgRef={plotSvgRef} />}
        {!contrast && completedResultKind !== "ona" && <div data-ena-workbench-region="right-stack">{persistentPlotTools}</div>}
        {consumerError && <p role="status">{workspaceCopy.operationFailed}</p>}{!isTrajectory && completedResultKind === "standard" && !endpointControls && <p role="status">{workspaceCopy.result.contrastUnavailable}</p>}
        <p>{workspaceCopy.result.codeLabels}: {result.executionProvenance.labels.codes.map((code) => `${code.column} = ${code.displayLabel}`).join("; ")}</p>
        {longitudinal && <><p>{workspaceCopy.result.cohortMeaning}</p><ResearchTableV3 {...researchTableCopy} rows={longitudinal.entities.flatMap((entity) => entity.steps)} label={workspaceCopy.result.trajectorySteps} /><pre>{JSON.stringify(longitudinal.comparison, null, 2)}</pre></>}
      </section>}
{!result && (              <section className="ena-empty-workbench" data-testid="open-ena-empty-workbench" aria-label={workspaceCopy.empty.ariaLabel}>
                <div className="ena-empty-analysis-layout">
                  <figure
                    className="ena-empty-comparison-plot"
                    data-testid="open-ena-empty-comparison-plot"
                    data-ena-workbench-region="center"
                  >
                    <header className="ena-set-plot-heading">
                      <div><h3>{workspaceCopy.empty.comparisonPlot}</h3><p>{workspaceCopy.empty.setupRequired}</p></div>
                      <span>{workspaceCopy.empty.researchSpace}</span>
                    </header>
                    <div className="ena-empty-surface">
                      <svg
                        className="ena-empty-network"
                        data-testid="open-ena-empty-network"
                        viewBox="0 0 200 135"
                        role="img"
                        aria-label={workspaceCopy.empty.networkAria}
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
                        <p className="ena-panel-kicker">{workspaceCopy.empty.pathway}</p>
                        <h2>{copy.workspace.emptyTitle}</h2>
                        <p>{copy.workspace.emptyText}</p>
                        {teachingSampleCenterProgress ?? <ol>
                          <li data-done={dataset ? "true" : "false"}>
                            <span className="sr-only">{dataset ? workspaceCopy.empty.complete : workspaceCopy.empty.incomplete}</span>
                            {workspaceCopy.empty.openRows}
                          </li>
                          <li data-done={controller.canRun ? "true" : "false"}>
                            <span className="sr-only">{controller.canRun ? workspaceCopy.empty.complete : workspaceCopy.empty.incomplete}</span>
                            {workspaceCopy.empty.defineModel}
                          </li>
                          <li data-done="false"><span className="sr-only">{workspaceCopy.empty.incomplete}</span>{workspaceCopy.empty.buildModel}</li>
                        </ol>}
                        <p>{workspaceCopy.empty.sampleLibraryHint}</p>
                        <button type="button" className="ena-action-button ena-action-primary" onClick={() => void attempt(() => loadSample())} disabled={sourceBusy || modelState.runStatus === "running"}>{copy.data.sample}</button>
                      </div>
                    </div>
                  </figure>

                  <div className="ena-empty-side-column" data-ena-workbench-region="right-stack">
                    <figure data-testid="open-ena-empty-primary-plot">
                      <header className="ena-set-plot-heading"><div><h3>{workspaceCopy.empty.primaryPlot}</h3><p>{workspaceCopy.empty.awaitingGroup}</p></div><span>—</span></header>
                      <div className="ena-empty-plot-placeholder"><span>{workspaceCopy.empty.primaryPending}</span></div>
                    </figure>
                    <figure data-testid="open-ena-empty-secondary-plot">
                      <header className="ena-set-plot-heading"><div><h3>{workspaceCopy.empty.secondaryPlot}</h3><p>{workspaceCopy.empty.awaitingGroup}</p></div><span>—</span></header>
                      <div className="ena-empty-plot-placeholder"><span>{workspaceCopy.empty.secondaryPending}</span></div>
                    </figure>
                    <div className="ena-empty-plot-tools" data-testid="open-ena-empty-plot-tools">
                      {persistentPlotTools}
                    </div>
                  </div>
                </div>
                <div className="ena-empty-data-view" data-testid="open-ena-empty-data-view">
                  <strong>{workspaceCopy.toolbar.dataView}</strong><span>{dataset ? workspaceCopy.empty.dataReady(dataset.rows.length) : workspaceCopy.empty.dataPrompt}</span><span aria-hidden="true">⌃</span>
                </div>
              </section>
)}
          </div>

        </div>
      </div>
    </section>
  </div>;
}
